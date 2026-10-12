// Module 3: Breakdown Completion (shares the Breakdown ID / record with the Register)
import { api } from '../api.js';
import { state, can, technicians } from '../state.js';
import {
  $, $$, esc, fmtDT, fmtDur, options, toast, showError, confirmBox, promptBox, statusPill, prioPill,
  toLocalInput, fromLocalInput,
} from '../ui.js';
import { openAssign, openDetail } from './register.js';

const TABS = [
  { key: 'todo', label: 'To do', statuses: ['Reported', 'Assigned', 'In Progress'] },
  { key: 'verify', label: 'Awaiting verification', statuses: ['Completed'] },
  { key: 'closed', label: 'Closed', statuses: ['Closed'] },
];

export function render(root, param) {
  return param ? renderDetail(root, param) : renderList(root);
}

// =====================================================================
// List
// =====================================================================
async function renderList(root) {
  let tab = 'todo';
  let mine = state.me.role === 'technician';
  let all = [];

  root.innerHTML = '<div class="empty">Loading…</div>';
  try { all = await api.get('/api/breakdowns'); } catch (err) { root.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }

  const draw = () => {
    const scoped = all.filter((b) => b.status !== 'Cancelled' && (!mine || b.assignedTo === state.me.id || (b.status === 'Reported' && !b.assignedTo)));
    const count = (t) => scoped.filter((b) => t.statuses.includes(b.status)).length;
    const current = TABS.find((t) => t.key === tab);
    const rows = scoped.filter((b) => current.statuses.includes(b.status))
      .sort((a, b) => (tab === 'closed' ? b.occurredAt.localeCompare(a.occurredAt) : a.occurredAt.localeCompare(b.occurredAt)));

    root.innerHTML = `
      <div class="toolbar">
        <div class="tabs" style="margin:0;flex:1">${TABS.map((t) => `<button class="tab ${t.key === tab ? 'active' : ''}" data-tab="${t.key}" type="button">${t.label}<span class="badge">${count(t)}</span></button>`).join('')}</div>
        <label class="field check" style="padding:0"><input type="checkbox" id="mine" ${mine ? 'checked' : ''}> My jobs</label>
      </div>
      ${rows.length ? `<div class="jobs">${rows.map(jobCard).join('')}</div>`
        : `<div class="card"><div class="empty">${emptyText(tab, mine)}</div></div>`}`;
    $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
    $('#mine', root).addEventListener('input', (e) => { mine = e.target.checked; draw(); });
  };
  draw();
}

const emptyText = (tab, mine) =>
  tab === 'todo' ? (mine ? 'No open jobs assigned to you.' : 'No open breakdowns. 🎉') : tab === 'verify' ? 'Nothing is waiting for verification.' : 'No closed breakdowns yet.';

export function jobCard(b) {
  const action = { Reported: 'Start work', Assigned: 'Start work', 'In Progress': 'Continue', Completed: 'Review', Closed: 'View' }[b.status];
  return `<a class="card job p-${esc(b.priority)}" href="#/completion/${esc(b.id)}">
    <div class="job-top"><b class="mono">${esc(b.breakdownId)}</b><span>${statusPill(b.status)} ${prioPill(b.priority)}</span></div>
    <div><b>${esc(b.machine?.code || '?')}</b> · ${esc(b.machine?.name || '')}<span class="sub">${esc(b.machine?.department || '')}</span></div>
    <p>${esc(b.problem)}</p>
    <div class="job-foot"><span>${esc(fmtDT(b.occurredAt))}${b.assignedToName ? ` · ${esc(b.assignedToName)}` : ' · Unassigned'}</span><span class="btn small ${b.status === 'Closed' ? '' : 'primary'}">${action}</span></div>
  </a>`;
}

// =====================================================================
// Detail
// =====================================================================
async function renderDetail(root, id) {
  root.innerHTML = '<div class="empty">Loading…</div>';
  let b;
  try { b = await api.get(`/api/breakdowns/${encodeURIComponent(id)}`); } catch (err) {
    root.innerHTML = `<a class="back" href="#/completion">← Back</a><div class="card"><div class="empty">${esc(err.message)}</div></div>`;
    return;
  }
  const c = b.completion;
  const me = state.me;
  const supervisor = can.assign();
  const mayWork = can.work() && (supervisor || me.role === 'technician' && (!b.assignedTo || b.assignedTo === me.id || (c?.technicians || []).includes(me.id)));
  const reload = () => renderDetail(root, id);

  root.innerHTML = `
    <a class="back" href="#/completion">← Back to Breakdown Completion</a>
    <div class="card card-pad" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <h3 style="font-size:17px;margin:0"><span class="mono">${esc(b.breakdownId)}</span> · ${esc(b.machine?.code)} — ${esc(b.machine?.name)}</h3>
        <div>${statusPill(b.status)} ${prioPill(b.priority)}</div>
      </div>
      <dl class="kv">
        <div><dt>Department</dt><dd>${esc(b.machine?.department)}</dd></div>
        <div><dt>Breakdown time</dt><dd>${esc(fmtDT(b.occurredAt))}</dd></div>
        <div><dt>Reported by</dt><dd>${esc(b.reportedByName)}</dd></div>
        <div><dt>Assigned to</dt><dd>${esc(b.assignedToName || '—')}</dd></div>
        <div><dt>Shift / type</dt><dd>${esc(b.shift)} · ${esc(b.breakdownType)}</dd></div>
        <div><dt>Production</dt><dd>${b.productionStopped ? '⛔ Stopped' : 'Running'}</dd></div>
        <div class="s2"><dt>Machine criticality</dt><dd>${esc(b.machine?.criticality)}</dd></div>
        <div class="s4"><dt>Problem</dt><dd>${esc(b.problem)}</dd></div>
        ${b.immediateAction ? `<div class="s4"><dt>Immediate action</dt><dd>${esc(b.immediateAction)}</dd></div>` : ''}
      </dl>
      <div class="form-actions" style="justify-content:flex-start">
        <button class="btn small" id="view-hist" type="button">Full history</button>
        ${supervisor && ['Reported', 'Assigned', 'In Progress'].includes(b.status) ? '<button class="btn small" id="assign" type="button">Assign technician</button>' : ''}
      </div>
    </div>
    <div id="work"></div>`;

  $('#view-hist', root).addEventListener('click', () => openDetail(b.id, reload));
  $('#assign', root)?.addEventListener('click', () => openAssign(b, reload));

  const work = $('#work', root);
  if (b.status === 'Reported' || b.status === 'Assigned') startPanel(work, b, mayWork, reload);
  else if (b.status === 'In Progress') form(work, b, mayWork, reload);
  else if (b.status === 'Cancelled') work.innerHTML = '<div class="banner">This breakdown was cancelled. See history for the reason.</div>';
  else summary(work, b, reload);
}

// ---------- start work ----------
function startPanel(el, b, mayWork, reload) {
  if (!mayWork) {
    el.innerHTML = `<div class="card card-pad"><div class="banner" style="margin:0">${can.work()
      ? 'This job is assigned to another technician.' : 'Only maintenance staff can start repair work.'}</div></div>`;
    return;
  }
  el.innerHTML = `<div class="card card-pad"><h3>Start repair work</h3>
    <form class="form-grid" novalidate>
      <label class="field s2">Work start time<input type="datetime-local" name="workStartedAt" value="${toLocalInput(new Date())}"></label>
      <p class="hint sub s2" style="align-self:end;margin:0">${b.assignedTo ? '' : 'You will be recorded as the assigned technician.'}</p>
      <div class="s4"><p class="form-error" hidden></p><div class="form-actions"><button class="btn primary" type="submit">▶ Start work</button></div></div>
    </form></div>`;
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/breakdowns/${b.id}/start`, { workStartedAt: fromLocalInput(e.target.workStartedAt.value) });
      toast('Work started');
      reload();
    } catch (err) { showError(el, err.message); }
  });
}

// ---------- completion form ----------
function form(el, b, mayWork, reload) {
  const c = b.completion;
  const s = state.settings;
  const ro = !mayWork;
  const techs = technicians();
  const dis = ro ? 'disabled' : '';

  el.innerHTML = `<div class="card card-pad"><h3>Repair details</h3>
    ${ro ? '<div class="banner">You can view this repair but not edit it.</div>' : ''}
    <form class="form-grid" novalidate>
      <div class="section-title">Timing</div>
      <label class="field s2">Work started *<input type="datetime-local" name="workStartedAt" value="${toLocalInput(c.workStartedAt)}" ${dis}></label>
      <label class="field s2">Machine restored (back in service) *<input type="datetime-local" name="restoredAt" value="${toLocalInput(c.restoredAt)}" ${dis}></label>
      <div class="s4"><div class="metrics" id="live">
        <div class="metric"><b data-m="resp">—</b><span>Response time</span></div>
        <div class="metric"><b data-m="rep">—</b><span>Repair time</span></div>
        <div class="metric"><b data-m="down">—</b><span>Total downtime</span></div></div></div>

      <div class="section-title">Attended by</div>
      <div class="s4"><div class="chips">${techs.map((u) => `<label class="chip-check"><input type="checkbox" data-tech="${esc(u.id)}" ${(c.technicians || []).includes(u.id) ? 'checked' : ''} ${dis}> ${esc(u.name)}</label>`).join('')}</div></div>
      <label class="field s4">External vendor / contractor (if any)<input name="externalVendor" value="${esc(c.externalVendor)}" ${dis}></label>

      <div class="section-title">Diagnosis &amp; action</div>
      <label class="field s2">Root cause category *<select name="rootCauseCategory" ${dis}>${options(s.rootCauseCategories, c.rootCauseCategory, 'Select…')}</select></label>
      <label class="field s4">Root cause description *<textarea name="rootCause" rows="2" ${dis}>${esc(c.rootCause)}</textarea></label>
      <label class="field s4">Action taken *<textarea name="actionTaken" rows="3" ${dis}>${esc(c.actionTaken)}</textarea></label>
      <label class="field s4">Preventive / corrective recommendation<textarea name="preventiveAction" rows="2" ${dis}>${esc(c.preventiveAction)}</textarea></label>

      <div class="section-title">Spares used</div>
      <div class="s4" id="spares"></div>
      ${ro ? '' : '<div class="s4"><button class="btn small" id="add-spare" type="button">+ Add spare</button></div>'}

      <div class="section-title">Handover</div>
      <label class="field check s4"><input type="checkbox" name="trialRunOk" ${c.trialRunOk ? 'checked' : ''} ${dis}> Machine tested after repair and handed back to production *</label>
      ${ro ? '' : `<div class="s4"><p class="form-error" hidden></p><div class="form-actions">
        <button class="btn" id="save" type="button">Save draft</button>
        <button class="btn ok" type="submit">✔ Mark repair completed</button></div></div>`}
    </form></div>`;

  const f = $('form', el);
  const sparesEl = $('#spares', el);
  const spareRow = (x = { item: '', qty: 1 }) => {
    const row = document.createElement('div');
    row.className = 'spare-row';
    row.innerHTML = `<input data-spare-item placeholder="Spare / consumable" value="${esc(x.item)}" ${dis}>
      <input data-spare-qty type="number" min="0.01" step="any" value="${esc(x.qty)}" ${dis}>
      ${ro ? '<span></span>' : '<button class="icon-btn" type="button" aria-label="Remove spare">×</button>'}`;
    $('button', row)?.addEventListener('click', () => row.remove());
    sparesEl.append(row);
  };
  (c.spares || []).forEach(spareRow);
  if (!c.spares?.length && ro) sparesEl.innerHTML = '<span class="sub">None recorded</span>';
  $('#add-spare', el)?.addEventListener('click', () => spareRow());

  // live durations
  const live = () => {
    const ws = f.workStartedAt.value, rs = f.restoredAt.value;
    const diff = (a, z) => (a && z ? Math.round((new Date(z) - new Date(a)) / 60000) : null);
    const set = (k, v) => ($(`[data-m=${k}]`, el).textContent = v == null || v < 0 ? '—' : fmtDur(v));
    set('resp', diff(b.reportedAt, ws) == null ? null : Math.max(0, diff(b.reportedAt, ws)));
    set('rep', diff(ws, rs));
    set('down', diff(b.occurredAt, rs));
  };
  f.addEventListener('input', live);
  live();

  const collect = () => ({
    workStartedAt: fromLocalInput(f.workStartedAt.value),
    restoredAt: fromLocalInput(f.restoredAt.value),
    technicians: $$('[data-tech]', el).filter((x) => x.checked).map((x) => x.dataset.tech),
    externalVendor: f.externalVendor.value,
    rootCauseCategory: f.rootCauseCategory.value,
    rootCause: f.rootCause.value,
    actionTaken: f.actionTaken.value,
    preventiveAction: f.preventiveAction.value,
    trialRunOk: f.trialRunOk.checked,
    spares: $$('.spare-row', sparesEl).map((r) => ({ item: $('[data-spare-item]', r).value, qty: $('[data-spare-qty]', r).value })),
  });

  if (ro) return;
  $('#save', el).addEventListener('click', async () => {
    try { await api.put(`/api/breakdowns/${b.id}/completion`, collect()); showError(el, ''); toast('Draft saved'); }
    catch (err) { showError(el, err.message); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('[type=submit]', el);
    btn.disabled = true;
    try {
      await api.post(`/api/breakdowns/${b.id}/complete`, collect());
      toast('Repair completed — awaiting supervisor verification');
      reload();
    } catch (err) { showError(el, err.message); btn.disabled = false; }
  });
}

// ---------- completed / closed ----------
function summary(el, b, reload) {
  const c = b.completion;
  const supervisor = can.close();
  el.innerHTML = `<div class="card card-pad"><h3>Repair summary</h3>
    <div class="metrics">
      <div class="metric"><b>${esc(fmtDur(c.downtimeMin))}</b><span>Total downtime</span></div>
      <div class="metric"><b>${esc(fmtDur(c.responseMin))}</b><span>Response time</span></div>
      <div class="metric"><b>${esc(fmtDur(c.repairMin))}</b><span>Repair time</span></div></div>
    <dl class="kv" style="margin-top:16px">
      <div><dt>Work started</dt><dd>${esc(fmtDT(c.workStartedAt))}</dd></div>
      <div><dt>Restored</dt><dd>${esc(fmtDT(c.restoredAt))}</dd></div>
      <div class="s2"><dt>Attended by</dt><dd>${esc((c.technicianNames || []).join(', ') || '—')}${c.externalVendor ? ` · Vendor: ${esc(c.externalVendor)}` : ''}</dd></div>
      <div class="s2"><dt>Root cause</dt><dd><b>${esc(c.rootCauseCategory)}</b><br>${esc(c.rootCause)}</dd></div>
      <div class="s2"><dt>Action taken</dt><dd>${esc(c.actionTaken)}</dd></div>
      ${c.preventiveAction ? `<div class="s4"><dt>Preventive recommendation</dt><dd>${esc(c.preventiveAction)}</dd></div>` : ''}
      <div class="s4"><dt>Spares used</dt><dd>${esc((c.spares || []).map((x) => `${x.item} × ${x.qty}`).join(', ') || '—')}</dd></div>
      ${b.status === 'Closed' ? `<div class="s4"><dt>Closed</dt><dd>${esc(fmtDT(b.closedAt))}${b.closeRemarks ? ` — ${esc(b.closeRemarks)}` : ''}</dd></div>` : ''}
    </dl>
    ${supervisor ? `<div class="form-actions">
      <button class="btn danger" id="reopen" type="button">Reopen</button>
      ${b.status === 'Completed' ? '<button class="btn ok" id="close" type="button">✔ Verify &amp; close</button>' : ''}</div>`
      : b.status === 'Completed' ? '<div class="banner" style="margin-top:14px">Awaiting supervisor verification.</div>' : ''}
  </div>`;

  $('#close', el)?.addEventListener('click', async () => {
    const remarks = await promptBox('Verify and close', 'Verification remarks (optional)', { okText: 'Close breakdown', required: false });
    if (remarks === null) return;
    try { await api.post(`/api/breakdowns/${b.id}/close`, { remarks }); toast('Breakdown closed'); reload(); }
    catch (err) { toast(err.message, true); }
  });
  $('#reopen', el)?.addEventListener('click', async () => {
    const reason = await promptBox('Reopen breakdown', 'Reason for reopening', { okText: 'Reopen' });
    if (reason === null) return;
    try { await api.post(`/api/breakdowns/${b.id}/reopen`, { reason }); toast('Breakdown reopened'); reload(); }
    catch (err) { toast(err.message, true); }
  });
}
