// Reports & Analytics
import { api, qs } from '../api.js';
import { state } from '../state.js';
import { $, $$, esc, fmtDur, fmtHours, fmtDT, options, barChart, trendChart, toast, downloadCsv, todayStr } from '../ui.js';

const PRESETS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['month', 'This month'], ['custom', 'Custom']];

export function render(root) {
  const f = { preset: '30', from: todayStr(-30), to: todayStr(), department: '', category: '', machineRef: '', type: '' };
  let data = null;

  root.innerHTML = `
    <div class="toolbar">
      <select id="preset">${options(PRESETS, f.preset)}</select>
      <input type="date" id="from" value="${f.from}" aria-label="From date"><input type="date" id="to" value="${f.to}" aria-label="To date">
      <select id="department"><option value="">All departments</option>${options(state.settings.departments)}</select>
      <select id="category"><option value="">All categories</option>${options(state.settings.categories)}</select>
      <select id="machineRef"><option value="">All machines</option>${options(state.machines.map((m) => [m.id, `${m.code} — ${m.name}`]))}</select>
      <select id="type"><option value="">All types</option>${options(state.settings.breakdownTypes)}</select>
      <span class="spacer"></span>
      <button class="btn ghost" id="export-machines" type="button">Export machines CSV</button>
      <button class="btn ghost" id="export-rows" type="button">Export breakdowns CSV</button>
    </div>
    <div id="out"><div class="empty">Loading…</div></div>`;

  const setRange = () => {
    if (f.preset === 'custom') return;
    if (f.preset === 'month') { const d = new Date(); f.from = todayStr(-(d.getDate() - 1)); }
    else f.from = todayStr(-Number(f.preset));
    f.to = todayStr();
    $('#from', root).value = f.from;
    $('#to', root).value = f.to;
  };

  const draw = () => {
    const k = data.kpi;
    $('#out', root).innerHTML = `
      <div class="stats">
        <div class="card stat"><b>${k.total}</b><span>Breakdowns</span><small>${k.open} still open · ${k.machinesAffected} machines</small></div>
        <div class="card stat"><b>${esc(fmtDur(k.downtimeMin))}</b><span>Total downtime</span><small>avg ${esc(fmtDur(k.avgDowntimeMin))} each</small></div>
        <div class="card stat"><b>${esc(fmtDur(k.mttrMin))}</b><span>MTTR</span><small>avg response ${esc(fmtDur(k.avgResponseMin))}</small></div>
        <div class="card stat"><b>${esc(fmtHours(k.mtbfHours))}</b><span>MTBF</span></div>
        <div class="card stat"><b>${k.availability == null ? '—' : k.availability + '%'}</b><span>Availability</span></div>
        <div class="card stat"><b>${k.productionStopped}</b><span>Production stops</span></div>
      </div>
      <div class="card card-pad" style="margin-bottom:16px"><h3>Breakdown trend <small>per ${data.trendUnit}</small></h3>${trendChart(data.trend, data.trendUnit)}</div>
      <div class="grid-2">
        <div class="card card-pad"><h3>Downtime by machine <small>top 10</small></h3>${barChart(data.byMachine.slice(0, 10), { label: (m) => `${m.code} ${m.name}` })}</div>
        <div class="card card-pad"><h3>Downtime by department</h3>${barChart(data.byDepartment)}</div>
      </div>
      <div class="grid-2">
        <div class="card card-pad"><h3>Breakdowns by type</h3>${barChart(data.byType, { valueKey: 'count', format: (n) => String(n) })}</div>
        <div class="card card-pad"><h3>Downtime by root cause</h3>${barChart(data.byRootCause, { empty: 'No completed repairs in this period' })}</div>
      </div>
      <div class="card"><div class="card-pad" style="padding-bottom:0"><h3>Machine reliability</h3></div>
        ${data.byMachine.length ? `<div class="table-wrap"><table class="rtable"><thead><tr><th>Machine</th><th>Department</th><th>Criticality</th><th class="right">Failures</th><th class="right">Downtime</th><th class="right">MTTR</th><th class="right">MTBF</th><th class="right">Availability</th></tr></thead><tbody>
          ${data.byMachine.map((m) => `<tr><td data-label="Machine"><b class="mono">${esc(m.code)}</b><span class="sub">${esc(m.name)}</span></td><td data-label="Department">${esc(m.department)}</td>
            <td data-label="Criticality"><span class="pill p-${esc(m.criticality)}">${esc(m.criticality)}</span></td>
            <td class="right num" data-label="Failures">${m.count}</td><td class="right num" data-label="Downtime">${esc(fmtDur(m.downtimeMin))}</td>
            <td class="right num" data-label="MTTR">${esc(fmtDur(m.mttrMin))}</td><td class="right num" data-label="MTBF">${esc(fmtHours(m.mtbfHours))}</td>
            <td class="right num" data-label="Availability">${m.availability}%</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">No breakdowns in this period.</div>'}
      </div>
      <p class="sub" style="margin-top:12px">Downtime = restored time − breakdown time (completed repairs only). MTTR = average repair time. MTBF = (operating hours − downtime) ÷ failures,
        with ${state.settings.operatingHoursPerDay} operating hours per day (change in Settings). Availability = 1 − downtime ÷ operating hours across active machines.</p>`;
  };

  const load = async () => {
    try {
      data = await api.get('/api/reports' + qs({ from: f.from, to: f.to, department: f.department, category: f.category, machineRef: f.machineRef, type: f.type }));
      draw();
    } catch (err) { $('#out', root).innerHTML = `<div class="empty">${esc(err.message)}</div>`; toast(err.message, true); }
  };

  $('#preset', root).addEventListener('input', (e) => { f.preset = e.target.value; setRange(); load(); });
  for (const id of ['from', 'to']) {
    $('#' + id, root).addEventListener('input', (e) => {
      f[id] = e.target.value;
      f.preset = 'custom';
      $('#preset', root).value = 'custom';
      if (f.from && f.to) load();
    });
  }
  for (const id of ['department', 'category', 'machineRef', 'type']) {
    $('#' + id, root).addEventListener('input', (e) => { f[id] = e.target.value; load(); });
  }

  $('#export-machines', root).addEventListener('click', () => data && downloadCsv(`machine-reliability-${f.from}_${f.to}.csv`,
    ['Machine ID', 'Code', 'Machine', 'Department', 'Criticality', 'Failures', 'Downtime (min)', 'MTTR (min)', 'MTBF (h)', 'Availability %'],
    data.byMachine.map((m) => [m.machineId, m.code, m.name, m.department, m.criticality, m.count, m.downtimeMin, m.mttrMin, m.mtbfHours, m.availability])));
  $('#export-rows', root).addEventListener('click', () => data && downloadCsv(`breakdowns-${f.from}_${f.to}.csv`,
    ['Breakdown ID', 'Occurred', 'Machine', 'Department', 'Shift', 'Type', 'Priority', 'Status', 'Problem', 'Root cause category', 'Root cause', 'Action taken',
      'Technicians', 'Response (min)', 'Repair (min)', 'Downtime (min)'],
    data.rows.map((b) => [b.breakdownId, b.occurredAt, `${b.machine?.code} ${b.machine?.name}`, b.machine?.department, b.shift, b.breakdownType, b.priority, b.status,
      b.problem, b.completion?.rootCauseCategory, b.completion?.rootCause, b.completion?.actionTaken, (b.completion?.technicianNames || []).join('; '),
      b.completion?.responseMin, b.completion?.repairMin, b.completion?.downtimeMin])));

  load();
}
