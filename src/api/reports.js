'use strict';
// Dashboard + Reports & Analytics
const { add } = require('../router');
const { db } = require('../store');
const { CAN } = require('../auth');
const { analyze } = require('../analytics');
const { bad } = require('../http');

const ACTIVE = ['Reported', 'Assigned', 'In Progress'];
const PRIO_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const userName = (id) => db.users.find((u) => u.id === id)?.name || '';
const lite = (b) => {
  const m = db.machines.find((x) => x.id === b.machineRef);
  return {
    id: b.id, breakdownId: b.breakdownId, occurredAt: b.occurredAt, status: b.status, priority: b.priority,
    problem: b.problem, productionStopped: b.productionStopped, assignedTo: b.assignedTo, assignedToName: userName(b.assignedTo),
    machine: m && { code: m.code, name: m.name, department: m.department },
  };
};

function range(query, defaultDays) {
  const to = query.to ? new Date(query.to + 'T23:59:59.999') : new Date();
  const from = query.from ? new Date(query.from + 'T00:00:00') : new Date(to.getTime() - defaultDays * 86400000);
  if (isNaN(from) || isNaN(to)) bad('Invalid date range');
  if (from > to) bad('"From" date must be on or before "To" date');
  return { from, to };
}

add('GET', '/api/dashboard', CAN.any, ({ user }) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = analyze(db, { from: monthStart, to: now });
  const last14 = analyze(db, { from: new Date(now.getTime() - 13 * 86400000), to: now });
  const open = db.breakdowns
    .filter((b) => ACTIVE.includes(b.status))
    .sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.occurredAt.localeCompare(b.occurredAt));
  const count = (s) => db.breakdowns.filter((b) => b.status === s).length;
  return {
    counts: { reported: count('Reported'), assigned: count('Assigned'), inProgress: count('In Progress'), awaitingClosure: count('Completed') },
    open: open.map(lite),
    mine: open.filter((b) => b.assignedTo === user.id).map(lite),
    month: { ...month.kpi, topMachines: month.byMachine.slice(0, 5) },
    trend: last14.trend,
  };
});

add('GET', '/api/reports', CAN.any, ({ query }) => {
  const { from, to } = range(query, 30);
  const a = analyze(db, {
    from, to, department: query.department, category: query.category, machineRef: query.machineRef, type: query.type,
  });
  a.rows = a.rows
    .map((b) => ({
      ...lite(b),
      shift: b.shift, breakdownType: b.breakdownType, reportedAt: b.reportedAt, reportedByName: userName(b.reportedBy),
      completion: b.completion && { ...b.completion, technicianNames: (b.completion.technicians || []).map(userName) },
    }))
    .sort((x, y) => y.occurredAt.localeCompare(x.occurredAt));
  return a;
});
