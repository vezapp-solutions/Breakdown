'use strict';
// Modules 2 + 3: Breakdown Register and Breakdown Completion.
// Both operate on the same record (one Breakdown ID); the completion lives in `breakdown.completion`.
//
// Workflow:  Reported -> Assigned -> In Progress -> Completed -> Closed
//            Reported/Assigned -> Cancelled      Completed/Closed -> (reopen) In Progress
const crypto = require('node:crypto');
const { add } = require('../router');
const { db, save, nextBreakdownId } = require('../store');
const { HttpError, bad, str, bool, parseTime, mins } = require('../http');
const { CAN } = require('../auth');

const PRIORITY = ['Critical', 'High', 'Medium', 'Low'];
const SHIFTS = ['A', 'B', 'C'];
const ACTIVE = ['Reported', 'Assigned', 'In Progress'];

// ---------- helpers ----------
const userName = (id) => db.users.find((u) => u.id === id)?.name || '';

function machineView(id) {
  const m = db.machines.find((x) => x.id === id);
  return m && {
    id: m.id, machineId: m.machineId, code: m.code, name: m.name, department: m.department,
    area: m.area, category: m.category, criticality: m.criticality, status: m.status,
  };
}

function view(b) {
  const c = b.completion;
  return {
    ...b,
    machine: machineView(b.machineRef),
    reportedByName: userName(b.reportedBy),
    assignedToName: userName(b.assignedTo),
    completion: c && { ...c, technicianNames: (c.technicians || []).map(userName).filter(Boolean) },
  };
}

function find(id) {
  const b = db.breakdowns.find((x) => x.id === id || x.breakdownId === id);
  if (!b) throw new HttpError(404, 'Breakdown not found');
  return b;
}

function log(b, user, action, note = '') {
  b.history.push({ at: new Date().toISOString(), by: user.id, byName: user.name, action, note });
}

function requireStatus(b, allowed, verb) {
  if (!allowed.includes(b.status)) throw new HttpError(409, `Cannot ${verb} a breakdown that is ${b.status}`);
}

const isSupervisor = (u) => u.role === 'admin' || u.role === 'supervisor';

function canWorkOn(user, b) {
  if (isSupervisor(user)) return true;
  if (user.role !== 'technician') return false;
  return !b.assignedTo || b.assignedTo === user.id || (b.completion?.technicians || []).includes(user.id);
}

// ---------- register fields ----------
function registerFields(body, current) {
  const s = db.settings;
  const m = db.machines.find((x) => x.id === str(body.machineRef));
  if (!m) bad('Select a valid machine');
  if (m.status !== 'Active' && m.id !== current?.machineRef) bad('This machine is inactive');
  const problem = str(body.problem);
  if (!problem) bad('Problem description is required');
  const type = str(body.breakdownType);
  if (!type) bad('Select the breakdown type');
  if (!s.breakdownTypes.includes(type) && type !== current?.breakdownType) bad('Select a valid breakdown type');
  if (!SHIFTS.includes(body.shift)) bad('Select the shift');
  const occurredAt = parseTime(body.occurredAt, 'Breakdown time');
  if (current?.completion?.workStartedAt && occurredAt > current.completion.workStartedAt) {
    bad('Breakdown time cannot be after the work start time');
  }
  return {
    machineRef: m.id,
    occurredAt,
    shift: body.shift,
    breakdownType: type,
    priority: PRIORITY.includes(body.priority) ? body.priority : m.criticality,
    productionStopped: bool(body.productionStopped),
    problem,
    immediateAction: str(body.immediateAction),
  };
}

function validAssignee(id) {
  const u = db.users.find((x) => x.id === id);
  if (!u || !u.active || !['technician', 'supervisor', 'admin'].includes(u.role)) bad('Select a valid technician');
  return u;
}

// ---------- completion fields ----------
function completionFields(b, body, final) {
  const s = db.settings;
  const prev = b.completion || {};
  const c = {
    workStartedAt: parseTime(body.workStartedAt || prev.workStartedAt, 'Work start time'),
    restoredAt: body.restoredAt ? parseTime(body.restoredAt, 'Restored time') : '',
    technicians: [...new Set(Array.isArray(body.technicians) ? body.technicians : [])].filter((id) => db.users.some((u) => u.id === id)),
    externalVendor: str(body.externalVendor),
    rootCauseCategory: str(body.rootCauseCategory),
    rootCause: str(body.rootCause),
    actionTaken: str(body.actionTaken),
    preventiveAction: str(body.preventiveAction),
    trialRunOk: bool(body.trialRunOk),
    spares: (Array.isArray(body.spares) ? body.spares : [])
      .map((x) => ({ item: str(x.item), qty: x.qty === '' || x.qty == null ? 1 : Number(x.qty) }))
      .filter((x) => x.item),
  };
  if (c.workStartedAt < b.occurredAt) bad('Work start time cannot be before the breakdown time');
  if (c.restoredAt && c.restoredAt < c.workStartedAt) bad('Restored time cannot be before the work start time');
  if (c.spares.some((x) => !(x.qty > 0))) bad('Spare quantities must be greater than zero');
  if (c.rootCauseCategory && !s.rootCauseCategories.includes(c.rootCauseCategory) && c.rootCauseCategory !== prev.rootCauseCategory) {
    bad('Select a valid root cause category');
  }
  if (final) {
    if (!c.restoredAt) bad('Restored (machine back in service) time is required');
    if (!c.technicians.length) bad('Select at least one technician who attended');
    if (!c.rootCauseCategory) bad('Root cause category is required');
    if (!c.rootCause) bad('Root cause description is required');
    if (!c.actionTaken) bad('Action taken is required');
    if (!c.trialRunOk) bad('Confirm the machine was tested and handed back to production');
  }
  return c;
}

// ---------- list / read ----------
add('GET', '/api/breakdowns', CAN.any, ({ query, user }) => {
  const statuses = query.status ? query.status.split(',') : null;
  const from = query.from ? new Date(query.from + 'T00:00:00') : null;
  const to = query.to ? new Date(query.to + 'T23:59:59.999') : null;
  const q = (query.q || '').toLowerCase();
  return db.breakdowns
    .filter((b) => (!statuses || statuses.includes(b.status)) &&
      (!query.machineRef || b.machineRef === query.machineRef) &&
      (!query.mine || b.assignedTo === user.id || b.reportedBy === user.id) &&
      (!from || new Date(b.occurredAt) >= from) &&
      (!to || new Date(b.occurredAt) <= to))
    .map(view)
    .filter((b) => (!query.department || b.machine?.department === query.department) &&
      (!q || [b.breakdownId, b.machine?.code, b.machine?.name, b.problem, b.completion?.rootCause].some((v) => (v || '').toLowerCase().includes(q))))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
});

add('GET', '/api/breakdowns/:id', CAN.any, ({ params }) => view(find(params.id)));

// ---------- register ----------
add('POST', '/api/breakdowns', CAN.reportBreakdown, ({ body, user }) => {
  const now = new Date().toISOString();
  const fields = registerFields(body); // validate first so a rejected request never consumes an ID
  const b = {
    id: crypto.randomUUID(),
    breakdownId: nextBreakdownId(new Date().getFullYear()),
    ...fields,
    reportedAt: now,
    reportedBy: user.id,
    status: 'Reported',
    assignedTo: '', assignedAt: '', assignedBy: '',
    completion: null,
    closedAt: '', closedBy: '', closeRemarks: '',
    history: [],
  };
  log(b, user, 'Reported');
  if (body.assignedTo && CAN.assign.includes(user.role)) {
    const t = validAssignee(body.assignedTo);
    Object.assign(b, { assignedTo: t.id, assignedAt: now, assignedBy: user.id, status: 'Assigned' });
    log(b, user, 'Assigned', t.name);
  }
  db.breakdowns.push(b);
  save();
  return view(b);
});

add('PUT', '/api/breakdowns/:id', CAN.reportBreakdown, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ACTIVE, 'edit');
  const own = b.reportedBy === user.id && b.status === 'Reported';
  if (!isSupervisor(user) && !own) throw new HttpError(403, 'Only a supervisor can edit this breakdown');
  Object.assign(b, registerFields(body, b));
  log(b, user, 'Edited');
  save();
  return view(b);
});

add('POST', '/api/breakdowns/:id/assign', CAN.assign, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ACTIVE, 'assign');
  const t = validAssignee(body.assignedTo);
  Object.assign(b, { assignedTo: t.id, assignedAt: new Date().toISOString(), assignedBy: user.id });
  if (b.status === 'Reported') b.status = 'Assigned';
  if (b.completion && !b.completion.technicians.includes(t.id)) b.completion.technicians.push(t.id);
  log(b, user, 'Assigned', t.name);
  save();
  return view(b);
});

add('POST', '/api/breakdowns/:id/cancel', CAN.close, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ['Reported', 'Assigned'], 'cancel');
  const reason = str(body.reason);
  if (!reason) bad('A reason is required to cancel');
  b.status = 'Cancelled';
  log(b, user, 'Cancelled', reason);
  save();
  return view(b);
});

add('DELETE', '/api/breakdowns/:id', CAN.admin, ({ params }) => {
  const b = find(params.id);
  db.breakdowns.splice(db.breakdowns.indexOf(b), 1);
  save();
  return { ok: true };
});

// ---------- completion ----------
add('POST', '/api/breakdowns/:id/start', CAN.work, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ['Reported', 'Assigned'], 'start work on');
  if (!canWorkOn(user, b)) throw new HttpError(403, 'This job is assigned to another technician');
  const workStartedAt = parseTime(body.workStartedAt || new Date(), 'Work start time');
  if (workStartedAt < b.occurredAt) bad('Work start time cannot be before the breakdown time');
  if (!b.assignedTo) Object.assign(b, { assignedTo: user.id, assignedAt: workStartedAt, assignedBy: user.id });
  b.completion = {
    workStartedAt, startedBy: user.id, restoredAt: '', technicians: [b.assignedTo], externalVendor: '',
    rootCauseCategory: '', rootCause: '', actionTaken: '', preventiveAction: '', trialRunOk: false, spares: [],
  };
  b.status = 'In Progress';
  log(b, user, 'Work started');
  save();
  return view(b);
});

// Save progress without completing
add('PUT', '/api/breakdowns/:id/completion', CAN.work, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ['In Progress'], 'update the repair of');
  if (!canWorkOn(user, b)) throw new HttpError(403, 'This job is assigned to another technician');
  b.completion = { ...b.completion, ...completionFields(b, body, false) };
  log(b, user, 'Progress saved');
  save();
  return view(b);
});

add('POST', '/api/breakdowns/:id/complete', CAN.work, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ['In Progress'], 'complete');
  if (!canWorkOn(user, b)) throw new HttpError(403, 'This job is assigned to another technician');
  const c = { ...b.completion, ...completionFields(b, body, true) };
  c.responseMin = Math.max(0, mins(b.reportedAt, c.workStartedAt));
  c.repairMin = mins(c.workStartedAt, c.restoredAt);
  c.downtimeMin = mins(b.occurredAt, c.restoredAt);
  c.completedAt = new Date().toISOString();
  c.completedBy = user.id;
  b.completion = c;
  b.status = 'Completed';
  log(b, user, 'Repair completed', `Downtime ${c.downtimeMin} min`);
  save();
  return view(b);
});

add('POST', '/api/breakdowns/:id/close', CAN.close, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ['Completed'], 'close');
  Object.assign(b, { status: 'Closed', closedAt: new Date().toISOString(), closedBy: user.id, closeRemarks: str(body.remarks) });
  log(b, user, 'Verified and closed', b.closeRemarks);
  save();
  return view(b);
});

add('POST', '/api/breakdowns/:id/reopen', CAN.close, ({ params, body, user }) => {
  const b = find(params.id);
  requireStatus(b, ['Completed', 'Closed'], 'reopen');
  const reason = str(body.reason);
  if (!reason) bad('A reason is required to reopen');
  Object.assign(b, { status: 'In Progress', closedAt: '', closedBy: '', closeRemarks: '' });
  for (const k of ['restoredAt', 'responseMin', 'repairMin', 'downtimeMin', 'completedAt', 'completedBy']) delete b.completion[k];
  b.completion.restoredAt = '';
  b.completion.trialRunOk = false;
  log(b, user, 'Reopened', reason);
  save();
  return view(b);
});
