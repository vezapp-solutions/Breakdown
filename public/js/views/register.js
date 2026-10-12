// Module 2: Breakdown Register
import { api, qs } from '../api.js';
import { state, can, technicians } from '../state.js';
import {
  $, esc, fmtDT, fmtDur, options, modal, showError, formToObj, toast, confirmBox, promptBox, statusPill, prioPill,
  toLocalInput, fromLocalInput, currentShift, downloadCsv, todayStr, debounce,
} from '../ui.js';

const STATUSES = ['Reported', 'Assigned', 'In Progress', 'Completed', 'Closed', 'Cancelled'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const ACTIVE = ['Reported', 'Assigned', 'In Progress'];

export function render(root) {
  const f = { q: '', status: '', machineRef: '', department: '', from: '', to: '' };
  let rows = [];

  root.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Search ID, machine, problem…">
      <select id="f-status"><option value="">All status</option>${options(STATUSES)}</select>
      <select id="f-machine"><option value="">All machines</option>${options(state.machines.map((m) => [m.id, `${m.code} — ${m.name}`]))}</select>
      <select id="f-dept"><option value="">All departments</option>${options(state.settings.departments)}</select>
      <input type="date" id="f-from" title="From date" aria-label="From date">
      <input type="date" id="f-to" title="To date" aria-label="To date">
      <span class="spacer"></span>
      <button class="btn ghost" id="export" type="button">Export CSV</button>
      ${can.report() ? '<button class="btn primary" id="add" type="button">+ Report Breakdown</button>' : ''}
    </div>
    <div class="card"><div class="table-wrap">
      <table class="rtable"><thead><tr>
        <th>Breakdown ID</th><th>Occurred</th><th>Machine</th><th>Priority</th><th>Type</th><th>Problem</th><th>Assigned to</th><th>Status</th><th></th>
      </tr></thead><tbody id="rows"></tbody></table>
      <div class="empty" id="empty" hidden></div>
    </div></div>
    ${can.report() ? '<button class="btn primary fab" id="fab" type="button">+ Report</button>' : ''}`;

  const draw = () => {
    $('#rows', root).innerHTML = rows.map((b) => `<tr class="click" data-open="${b.id}">
      <td class="mono" data-label="ID"><b>${esc(b.breakdownId)}</b></td>
      <td class="num" data-label="Occurred">${esc(fmtDT(b.occurredAt))}</td>
      <td data-label="Machine"><b class="mono">${esc(b.machine?.code || '?')}</b><span class="sub">${esc(b.machine?.name || '')}</span></td>
      <td data-label="Priority">${prioPill(b.priority)}</td>
      <td class="hide-m" data-label="Type">${esc(b.breakdownType)}</td>
      <td class="clip" data-label="Problem">${esc(b.problem)}${b.productionStopped ? '<span class="sub">⛔ Production stopped</span>' : ''}</td>
      <td class="hide-m" data-label="Assigned">${esc(b.assignedToName || '—')}</td>
      <td data-label="Status">${statusPill(b.status)}</td>
      <td class="row-actions"><button class="btn small" data-open="${b.id}" type="button">View</button></td></tr>`).join('');
    const empty = $('#empty', root);
    empty.hidden = rows.length > 0;
    empty.textContent = !state.machines.length ? 'Add machines in the Machine Master first, then report breakdowns here.'
      : Object.values(f).some(Boolean) ? 'No breakdowns match the filters.' : 'No breakdowns reported yet.';
  };

  const load = async () => {
    try {
      rows = await api.get('/api/breakdowns' + qs({ status: f.status, machineRef: f.machineRef, department: f.department, from: f.from, to: f.to, q: f.q }));
      draw();
    } catch (err) { toast(err.message, true); }
  };
  const reload = debounce(load, 250);

  $('#q', root).addEventListener('input', (e) => { f.q = e.target.value; reload(); });
  for (const [id, key] of [['f-status', 'status'], ['f-machine', 'machineRef'], ['f-dept', 'department'], ['f-from', 'from'], ['f-to', 'to']]) {
    $('#' + id, root).addEventListener('input', (e) => { f[key] = e.target.value; load(); });
  }
  const add = () => openForm(null, load);
  $('#add', root)?.addEventListener('click', add);
  $('#fab', root)?.addEventListener('click', add);
  $('#export', root).addEventListener('click', () => downloadCsv(`breakdown-register-${todayStr()}.csv`,
    ['Breakdown ID', 'Occurred', 'Reported', 'Reported By', 'Machine Code', 'Machine', 'Department', 'Shift', 'Type', 'Priority', 'Production Stopped',
      'Problem', 'Immediate Action', 'Assigned To', 'Status'],
    rows.map((b) => [b.breakdownId, b.occurredAt, b.reportedAt, b.reportedByName, b.machine?.code, b.machine?.name, b.machine?.department,
      b.shift, b.breakdownType, b.priority, b.productionStopped ? 'Yes' : 'No', b.problem, b.immediateAction, b.assignedToName, b.status])));
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-open]');
    if (r) openDetail(r.dataset.open, load);
  });

  load();
}

// ---------- create / edit form (also used by the quick-report button) ----------
export function openForm(b, onSaved) {
  if (!state.machines.some((m) => m.status === 'Active')) return toast('Add an active machine in the Machine Master first', true);
  const s = state.settings;
  const now = new Date();
  const machines = state.machines.filter((m) => m.status === 'Active' || m.id === b?.machineRef)
    .sort((a, c) => a.code.localeCompare(c.code));
  const v = (k, d = '') => esc(b?.[k] ?? d);

  const html = `<form novalidate class="form-grid">
    ${b ? `<label class="field">Breakdown ID<input value="${v('breakdownId')}" readonly></label>` : ''}
    <label class="field ${b ? 's3' : 's4'}">Machine *<select name="machineRef" required>
      ${options(machines.map((m) => [m.id, `${m.code} — ${m.name} (${m.department})`]), b?.machineRef, 'Select machine…')}</select></label>
    <p class="banner s4" id="open-warning" hidden></p>
    <label class="field">Breakdown time *<input type="datetime-local" name="occurredAt" value="${toLocalInput(b?.occurredAt || now)}" max="${toLocalInput(now)}" required></label>
    <label class="field">Shift *<select name="shift" required>${options(['A', 'B', 'C'], b?.shift || currentShift(now), 'Select…')}</select></label>
    <label class="field">Breakdown type *<select name="breakdownType" required>${options(s.breakdownTypes, b?.breakdownType, 'Select…')}</select></label>
    <label class="field">Priority<select name="priority">${options(PRIORITIES, b?.priority, 'Same as machine criticality')}</select></label>
    <label class="field check s4"><input type="checkbox" name="productionStopped" ${b?.productionStopped ? 'checked' : ''}> Production is stopped</label>
    <label class="field s4">Problem description *<textarea name="problem" rows="3" placeholder="What happened? What did the operator see or hear?" required>${v('problem')}</textarea></label>
    <label class="field s4">Immediate action taken<textarea name="immediateAction" rows="2" placeholder="Anything done before maintenance arrived">${v('immediateAction')}</textarea></label>
    ${!b && can.assign() ? `<label class="field s2">Assign to technician<select name="assignedTo">${options(technicians().map((u) => [u.id, `${u.name} (${u.role})`]), '', '— Assign later —')}</select></label>` : ''}
    <div class="s4"><p class="form-error" hidden></p>
    <div class="form-actions"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" type="submit">${b ? 'Save changes' : 'Submit breakdown'}</button></div></div>
  </form>`;

  modal(b ? `Edit ${b.breakdownId}` : 'Report Breakdown', html, {
    onMount: (dlg, close) => {
      const form = $('form', dlg);
      const warn = $('#open-warning', dlg);
      const check = async () => {
        const id = form.machineRef.value;
        warn.hidden = true;
        if (!id) return;
        try {
          const open = (await api.get('/api/breakdowns' + qs({ machineRef: id, status: ACTIVE.join(',') }))).filter((x) => x.id !== b?.id);
          if (open.length) {
            warn.textContent = `⚠ This machine already has ${open.length} open breakdown(s): ${open.map((x) => x.breakdownId).join(', ')}. Make sure this is not a duplicate.`;
            warn.hidden = false;
          }
        } catch { /* warning is advisory only */ }
      };
      form.machineRef.addEventListener('input', check);
      if (b) check();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('[type=submit]', dlg);
        btn.disabled = true;
        try {
          const body = formToObj(form);
          body.occurredAt = fromLocalInput(body.occurredAt);
          const saved = b ? await api.put(`/api/breakdowns/${b.id}`, body) : await api.post('/api/breakdowns', body);
          close();
          toast(b ? 'Breakdown updated' : `Breakdown ${saved.breakdownId} reported`);
          onSaved?.(saved);
        } catch (err) { showError(dlg, err.message); btn.disabled = false; }
      });
    },
  });
}

// ---------- detail dialog ----------
export async function openDetail(id, onChanged) {
  let b;
  try { b = await api.get(`/api/breakdowns/${id}`); } catch (err) { return toast(err.message, true); }
  const c = b.completion;
  const me = state.me;
  const supervisor = can.assign();
  const editable = ACTIVE.includes(b.status) && (supervisor || (b.reportedBy === me.id && b.status === 'Reported' && can.report()));

  const html = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${statusPill(b.status)}${prioPill(b.priority)}${b.productionStopped ? '<span class="pill p-Critical">Production stopped</span>' : ''}</div>
    <dl class="kv">
      <div><dt>Machine</dt><dd><b class="mono">${esc(b.machine?.code)}</b><br>${esc(b.machine?.name)}</dd></div>
      <div><dt>Department</dt><dd>${esc(b.machine?.department)}${b.machine?.area ? ` · ${esc(b.machine.area)}` : ''}</dd></div>
      <div><dt>Breakdown time</dt><dd>${esc(fmtDT(b.occurredAt))}</dd></div>
      <div><dt>Shift / Type</dt><dd>${esc(b.shift)} · ${esc(b.breakdownType)}</dd></div>
      <div><dt>Reported by</dt><dd>${esc(b.reportedByName)}<br><span class="sub">${esc(fmtDT(b.reportedAt))}</span></dd></div>
      <div><dt>Assigned to</dt><dd>${esc(b.assignedToName || '—')}</dd></div>
      <div class="s2"><dt>Machine criticality</dt><dd>${esc(b.machine?.criticality)}</dd></div>
      <div class="s4"><dt>Problem</dt><dd>${esc(b.problem)}</dd></div>
      ${b.immediateAction ? `<div class="s4"><dt>Immediate action</dt><dd>${esc(b.immediateAction)}</dd></div>` : ''}
    </dl>
    ${c && c.restoredAt ? `<h3 style="margin:18px 0 10px">Repair summary</h3>
      <div class="metrics">
        <div class="metric"><b>${esc(fmtDur(c.downtimeMin))}</b><span>Downtime</span></div>
        <div class="metric"><b>${esc(fmtDur(c.responseMin))}</b><span>Response time</span></div>
        <div class="metric"><b>${esc(fmtDur(c.repairMin))}</b><span>Repair time</span></div>
      </div>
      <dl class="kv" style="margin-top:12px">
        <div class="s2"><dt>Root cause</dt><dd>${esc(c.rootCauseCategory)} — ${esc(c.rootCause)}</dd></div>
        <div class="s2"><dt>Action taken</dt><dd>${esc(c.actionTaken)}</dd></div>
        <div class="s2"><dt>Attended by</dt><dd>${esc((c.technicianNames || []).join(', ') || '—')}</dd></div>
        <div class="s2"><dt>Spares used</dt><dd>${esc((c.spares || []).map((x) => `${x.item} × ${x.qty}`).join(', ') || '—')}</dd></div>
      </dl>` : ''}
    <h3 style="margin:18px 0 10px">History</h3>
    <ul class="timeline">${b.history.slice().reverse().map((h) => `<li><b>${esc(h.action)}</b>${h.note ? ` — ${esc(h.note)}` : ''}<small>${esc(h.byName)} · ${esc(fmtDT(h.at))}</small></li>`).join('')}</ul>
    <div class="form-actions" id="actions">
      <button class="btn" data-close type="button">Close</button>
      ${can.admin() ? '<button class="btn danger" data-act="delete" type="button">Delete</button>' : ''}
      ${supervisor && ['Reported', 'Assigned'].includes(b.status) ? '<button class="btn danger" data-act="cancel" type="button">Cancel breakdown</button>' : ''}
      ${editable ? '<button class="btn" data-act="edit" type="button">Edit</button>' : ''}
      ${supervisor && ACTIVE.includes(b.status) ? '<button class="btn" data-act="assign" type="button">Assign technician</button>' : ''}
      <a class="btn primary" href="#/completion/${esc(b.id)}" data-close>Open in Completion →</a>
    </div>`;

  modal(b.breakdownId, html, {
    onMount: (dlg, close) => {
      $('#actions', dlg).addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        try {
          if (act === 'edit') { close(); openForm(b, onChanged); }
          else if (act === 'assign') { close(); openAssign(b, onChanged); }
          else if (act === 'cancel') {
            const reason = await promptBox('Cancel breakdown', 'Reason for cancelling', { okText: 'Cancel breakdown' });
            if (reason === null) return;
            await api.post(`/api/breakdowns/${b.id}/cancel`, { reason });
            close(); toast('Breakdown cancelled'); onChanged?.();
          } else if (act === 'delete') {
            if (!(await confirmBox(`Permanently delete ${b.breakdownId}? This cannot be undone.`, { okText: 'Delete', danger: true }))) return;
            await api.del(`/api/breakdowns/${b.id}`);
            close(); toast('Breakdown deleted'); onChanged?.();
          }
        } catch (err) { toast(err.message, true); }
      });
    },
  });
}

export function openAssign(b, onChanged) {
  const html = `<form><label class="field">Technician<select name="assignedTo">
    ${options(technicians().map((u) => [u.id, `${u.name} (${u.role})`]), b.assignedTo, 'Select technician…')}</select></label>
    <p class="form-error" hidden></p>
    <div class="form-actions"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" type="submit">Assign</button></div></form>`;
  modal(`Assign ${b.breakdownId}`, html, {
    narrow: true,
    onMount: (dlg, close) => $('form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.post(`/api/breakdowns/${b.id}/assign`, { assignedTo: e.target.assignedTo.value });
        close(); toast('Technician assigned'); onChanged?.();
      } catch (err) { showError(dlg, err.message); }
    }),
  });
}
