import { api } from '../api.js';
import { state, can } from '../state.js';
import { $, esc, fmtDur, fmtHours, fmtDT, barChart, trendChart, toast, statusPill, prioPill } from '../ui.js';
import { openForm } from './register.js';

export async function render(root) {
  root.innerHTML = '<div class="empty">Loading…</div>';
  let d;
  try { d = await api.get('/api/dashboard'); } catch (err) { root.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  const { counts, month } = d;
  const openTotal = counts.reported + counts.assigned + counts.inProgress;

  const jobLine = (b) => `<a class="card job p-${esc(b.priority)}" href="#/completion/${esc(b.id)}">
    <div class="job-top"><b class="mono">${esc(b.breakdownId)}</b><span>${statusPill(b.status)} ${prioPill(b.priority)}</span></div>
    <div><b>${esc(b.machine?.code || '?')}</b> · ${esc(b.machine?.name || '')}</div>
    <p>${esc(b.problem)}</p>
    <div class="job-foot"><span>${esc(fmtDT(b.occurredAt))} · ${esc(b.assignedToName || 'Unassigned')}</span>${b.productionStopped ? '<span>⛔ Stopped</span>' : ''}</div></a>`;

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });
  root.innerHTML = `
    <div class="stats">
      <div class="card stat ${openTotal ? 'hot' : ''}"><b>${openTotal}</b><span>Open breakdowns</span><small>${counts.reported} new · ${counts.assigned} assigned · ${counts.inProgress} in progress</small></div>
      <div class="card stat"><b>${counts.awaitingClosure}</b><span>Awaiting verification</span></div>
      <div class="card stat"><b>${month.total}</b><span>Breakdowns in ${esc(monthName)}</span></div>
      <div class="card stat"><b>${esc(fmtDur(month.downtimeMin))}</b><span>Downtime in ${esc(monthName)}</span></div>
      <div class="card stat"><b>${esc(fmtDur(month.mttrMin))}</b><span>MTTR</span><small>MTBF ${esc(fmtHours(month.mtbfHours))}</small></div>
      <div class="card stat"><b>${month.availability == null ? '—' : month.availability + '%'}</b><span>Availability</span></div>
    </div>

    ${d.mine.length ? `<h3 style="margin:4px 0 10px">My assigned jobs</h3><div class="jobs" style="margin-bottom:20px">${d.mine.map(jobLine).join('')}</div>` : ''}

    <div class="grid-2">
      <div class="card card-pad"><h3>Breakdowns — last 14 days</h3>${trendChart(d.trend, 'day')}</div>
      <div class="card card-pad"><h3>Top machines by downtime <small>${esc(monthName)}</small></h3>
        ${barChart(month.topMachines, { label: (m) => `${m.code} ${m.name}` })}</div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 10px">
      <h3>Open breakdowns <small style="font-weight:400;color:var(--muted)">most urgent first</small></h3>
      ${can.report() ? '<button class="btn primary" id="report" type="button">+ Report Breakdown</button>' : ''}
    </div>
    ${d.open.length ? `<div class="jobs">${d.open.map(jobLine).join('')}</div>` : '<div class="card"><div class="empty">No open breakdowns right now.</div></div>'}`;

  $('#report', root)?.addEventListener('click', () => openForm(null, () => render(root)));
}
