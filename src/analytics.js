'use strict';
// Reliability analytics shared by the dashboard, machine history and reports.
//
// Definitions (documented in the UI as well):
//   Downtime        = restored time - breakdown occurred time          (completed breakdowns only)
//   Response time   = work start - reported time
//   Repair time     = restored time - work start
//   MTTR            = average repair time
//   Operating hours = days in period x configured operating hours/day  (per machine)
//   MTBF            = (operating hours - downtime hours) / number of failures
//   Availability    = 1 - downtime / (operating hours x machines)

const isDone = (b) => !!b.completion && (b.status === 'Completed' || b.status === 'Closed');
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function group(rows, keyFn) {
  const map = new Map();
  for (const b of rows) {
    const k = keyFn(b) || '—';
    const g = map.get(k) || { key: k, count: 0, downtimeMin: 0 };
    g.count += 1;
    if (isDone(b)) g.downtimeMin += b.completion.downtimeMin || 0;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.downtimeMin - a.downtimeMin || b.count - a.count);
}

function analyze(db, f) {
  const from = f.from;
  const to = f.to;
  const days = Math.max(1, (to - from) / 86400000);
  const opHoursPerMachine = days * db.settings.operatingHoursPerDay;

  const machines = db.machines.filter(
    (m) => (!f.department || m.department === f.department) &&
      (!f.category || m.category === f.category) &&
      (!f.machineRef || m.id === f.machineRef),
  );
  const mById = new Map(machines.map((m) => [m.id, m]));

  const rows = db.breakdowns.filter((b) => {
    if (b.status === 'Cancelled' || !mById.has(b.machineRef)) return false;
    const t = new Date(b.occurredAt);
    return t >= from && t <= to && (!f.type || b.breakdownType === f.type);
  });
  const done = rows.filter(isDone);

  // machines in scope for availability: active ones, plus any that failed in the period
  const failed = new Set(rows.map((b) => b.machineRef));
  const scope = machines.filter((m) => m.status === 'Active' || failed.has(m.id));
  const totalOpHours = scope.length * opHoursPerMachine;
  const totalDowntimeMin = done.reduce((s, b) => s + (b.completion.downtimeMin || 0), 0);

  // per machine
  const byMachine = [];
  for (const id of failed) {
    const m = mById.get(id);
    const mine = rows.filter((b) => b.machineRef === id);
    const mDone = mine.filter(isDone);
    const downtimeMin = mDone.reduce((s, b) => s + (b.completion.downtimeMin || 0), 0);
    const upHours = Math.max(0, opHoursPerMachine - downtimeMin / 60);
    byMachine.push({
      machineRef: id, machineId: m.machineId, code: m.code, name: m.name, department: m.department, criticality: m.criticality,
      count: mine.length,
      downtimeMin,
      mttrMin: avg(mDone.map((b) => b.completion.repairMin || 0)),
      mtbfHours: mine.length ? Math.round((upHours / mine.length) * 10) / 10 : null,
      availability: Math.max(0, Math.round((1 - downtimeMin / 60 / opHoursPerMachine) * 1000) / 10),
    });
  }
  byMachine.sort((a, b) => b.downtimeMin - a.downtimeMin || b.count - a.count);

  const failedUpHours = byMachine.reduce((s, m) => s + Math.max(0, opHoursPerMachine - m.downtimeMin / 60), 0);

  // trend
  const daily = days <= 62;
  const buckets = new Map();
  if (daily) {
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) buckets.set(dayKey(d), { label: dayKey(d), count: 0, downtimeMin: 0 });
  }
  for (const b of rows) {
    const d = new Date(b.occurredAt);
    const k = daily ? dayKey(d) : monthKey(d);
    const g = buckets.get(k) || { label: k, count: 0, downtimeMin: 0 };
    g.count += 1;
    if (isDone(b)) g.downtimeMin += b.completion.downtimeMin || 0;
    buckets.set(k, g);
  }
  const trend = [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));

  return {
    period: { from: from.toISOString(), to: to.toISOString(), days: Math.round(days * 10) / 10 },
    kpi: {
      total: rows.length,
      open: rows.filter((b) => !isDone(b)).length,
      completed: done.length,
      downtimeMin: totalDowntimeMin,
      avgDowntimeMin: avg(done.map((b) => b.completion.downtimeMin || 0)),
      mttrMin: avg(done.map((b) => b.completion.repairMin || 0)),
      avgResponseMin: avg(done.map((b) => b.completion.responseMin || 0)),
      mtbfHours: rows.length ? Math.round((failedUpHours / rows.length) * 10) / 10 : null,
      availability: totalOpHours ? Math.max(0, Math.round((1 - totalDowntimeMin / 60 / totalOpHours) * 1000) / 10) : null,
      productionStopped: rows.filter((b) => b.productionStopped).length,
      machinesAffected: failed.size,
    },
    byMachine,
    byDepartment: group(rows, (b) => mById.get(b.machineRef).department),
    byType: group(rows, (b) => b.breakdownType),
    byRootCause: group(done, (b) => b.completion.rootCauseCategory),
    byPriority: group(rows, (b) => b.priority),
    trend,
    trendUnit: daily ? 'day' : 'month',
    rows,
  };
}

module.exports = { analyze, isDone };
