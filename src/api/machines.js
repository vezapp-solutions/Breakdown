'use strict';
// Module 1: Machine Master
const crypto = require('node:crypto');
const { add } = require('../router');
const { db, save, nextMachineId } = require('../store');
const { HttpError, bad, str } = require('../http');
const { CAN } = require('../auth');
const { analyze } = require('../analytics');

const CRITICALITY = ['Critical', 'High', 'Medium', 'Low'];

// A value must come from the master list (or be the unchanged value of an existing record).
function fromList(list, value, label, current) {
  if (!value) bad(`${label} is required`);
  if (!list.includes(value) && value !== current) bad(`Select a valid ${label.toLowerCase()}`);
  return value;
}

function cleanMachine(body, current) {
  const s = db.settings;
  const m = {
    code: str(body.code).toUpperCase(),
    name: str(body.name),
    department: fromList(s.departments, str(body.department), 'Department', current?.department),
    area: str(body.area),
    category: fromList(s.categories, str(body.category), 'Equipment category', current?.category),
    make: str(body.make),
    model: str(body.model),
    serialNo: str(body.serialNo),
    criticality: CRITICALITY.includes(body.criticality) ? body.criticality : bad('Criticality is required'),
    installDate: str(body.installDate),
    maintenanceOwner: str(body.maintenanceOwner),
    description: str(body.description),
    status: body.status === 'Inactive' ? 'Inactive' : 'Active',
  };
  if (!m.code) bad('Machine code is required');
  if (!m.name) bad('Machine name is required');
  if (m.installDate && (!/^\d{4}-\d{2}-\d{2}$/.test(m.installDate) || isNaN(new Date(m.installDate)))) bad('Invalid installation date');
  if (m.maintenanceOwner && !db.users.some((u) => u.id === m.maintenanceOwner)) bad('Maintenance owner not found');
  if (db.machines.some((x) => x.id !== current?.id && x.code === m.code)) {
    throw new HttpError(409, `Machine code ${m.code} already exists`);
  }
  return m;
}

const ownerName = (id) => db.users.find((u) => u.id === id)?.name || '';
const view = (m) => ({ ...m, maintenanceOwnerName: ownerName(m.maintenanceOwner) });

add('GET', '/api/machines', CAN.any, () => db.machines.map(view));

add('GET', '/api/machines/:id', CAN.any, ({ params }) => {
  const m = db.machines.find((x) => x.id === params.id);
  if (!m) throw new HttpError(404, 'Machine not found');
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86400000);
  const a = analyze(db, { from, to, machineRef: m.id });
  const all = db.breakdowns
    .filter((b) => b.machineRef === m.id && b.status !== 'Cancelled')
    .sort((x, y) => y.occurredAt.localeCompare(x.occurredAt));
  return {
    machine: view(m),
    stats90d: { ...a.kpi, days: 90 },
    totalBreakdowns: all.length,
    recent: all.slice(0, 10).map((b) => ({
      id: b.id, breakdownId: b.breakdownId, occurredAt: b.occurredAt, problem: b.problem, status: b.status,
      downtimeMin: b.completion?.downtimeMin ?? null,
    })),
  };
});

add('POST', '/api/machines', CAN.editMachines, ({ body, user }) => {
  const now = new Date().toISOString();
  const fields = cleanMachine(body); // validate first so a rejected request never consumes an ID
  const m = {
    id: crypto.randomUUID(),
    machineId: nextMachineId(),
    ...fields,
    createdBy: user.id, createdByName: user.name, createdAt: now,
    updatedBy: user.id, updatedByName: user.name, updatedAt: now,
  };
  db.machines.push(m);
  save();
  return view(m);
});

add('PUT', '/api/machines/:id', CAN.editMachines, ({ params, body, user }) => {
  const m = db.machines.find((x) => x.id === params.id);
  if (!m) throw new HttpError(404, 'Machine not found');
  Object.assign(m, cleanMachine(body, m), { updatedBy: user.id, updatedByName: user.name, updatedAt: new Date().toISOString() });
  save();
  return view(m);
});

add('DELETE', '/api/machines/:id', CAN.editMachines, ({ params }) => {
  const idx = db.machines.findIndex((x) => x.id === params.id);
  if (idx < 0) throw new HttpError(404, 'Machine not found');
  const used = db.breakdowns.filter((b) => b.machineRef === params.id).length;
  if (used) throw new HttpError(409, `Cannot delete: ${used} breakdown record(s) use this machine. Mark it Inactive instead.`);
  db.machines.splice(idx, 1);
  save();
  return { ok: true };
});
