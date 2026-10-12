// Module 1: Machine Master
import { api } from '../api.js';
import { state, can, refreshMachines } from '../state.js';
import { $, $$, esc, fmtDT, fmtDate, fmtDur, fmtHours, options, modal, showError, formToObj, toast, confirmBox, statusPill } from '../ui.js';

const CRITICALITY = ['Critical', 'High', 'Medium', 'Low'];
const critPill = (c) => `<span class="pill p-${esc(c)}">${esc(c)}</span>`;

export function render(root) {
  const f = { q: '', dept: '', crit: '', status: '' };

  root.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Search code, name, make, model, serial…">
      <select id="f-dept"><option value="">All departments</option>${options(state.settings.departments)}</select>
      <select id="f-crit"><option value="">All criticality</option>${options(CRITICALITY)}</select>
      <select id="f-status"><option value="">All status</option><option>Active</option><option>Inactive</option></select>
      <span class="spacer"></span>
      ${can.editMachines() ? '<button class="btn primary" id="add" type="button">+ New Machine</button>' : ''}
    </div>
    <div class="card"><div class="table-wrap">
      <table class="rtable"><thead><tr>
        <th>Machine ID</th><th>Code</th><th>Machine</th><th>Department</th><th>Category</th>
        <th>Make / Model</th><th>Criticality</th><th>Owner</th><th>Status</th><th></th>
      </tr></thead><tbody id="rows"></tbody></table>
      <div class="empty" id="empty" hidden></div>
    </div></div>`;

  const draw = () => {
    const q = f.q.toLowerCase();
    const rows = state.machines
      .filter((m) => (!f.dept || m.department === f.dept) && (!f.crit || m.criticality === f.crit) && (!f.status || m.status === f.status))
      .filter((m) => !q || [m.machineId, m.code, m.name, m.make, m.model, m.serialNo, m.area].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => a.code.localeCompare(b.code));

    $('#rows', root).innerHTML = rows.map((m) => `<tr>
      <td class="mono hide-m" data-label="ID">${esc(m.machineId)}</td>
      <td class="mono" data-label="Code"><b>${esc(m.code)}</b></td>
      <td data-label="Machine">${esc(m.name)}${m.area ? `<span class="sub">${esc(m.area)}</span>` : ''}</td>
      <td data-label="Department">${esc(m.department)}</td>
      <td class="hide-m" data-label="Category">${esc(m.category)}</td>
      <td class="hide-m" data-label="Make / Model">${esc([m.make, m.model].filter(Boolean).join(' / ') || '—')}</td>
      <td data-label="Criticality">${critPill(m.criticality)}</td>
      <td class="hide-m" data-label="Owner">${esc(m.maintenanceOwnerName || '—')}</td>
      <td data-label="Status">${statusPill(m.status)}</td>
      <td class="row-actions">
        <button class="btn small" data-history="${m.id}" type="button">History</button>
        ${can.editMachines() ? `<button class="btn small" data-edit="${m.id}" type="button">Edit</button>
        <button class="btn small danger" data-del="${m.id}" type="button">Delete</button>` : ''}
      </td></tr>`).join('');
    const empty = $('#empty', root);
    empty.hidden = rows.length > 0;
    empty.textContent = state.machines.length ? 'No machines match the filters.'
      : can.editMachines() ? 'No machines yet. Click “+ New Machine” to add the first one.' : 'No machines have been added yet.';
  };

  $('#q', root).addEventListener('input', (e) => { f.q = e.target.value; draw(); });
  $('#f-dept', root).addEventListener('input', (e) => { f.dept = e.target.value; draw(); });
  $('#f-crit', root).addEventListener('input', (e) => { f.crit = e.target.value; draw(); });
  $('#f-status', root).addEventListener('input', (e) => { f.status = e.target.value; draw(); });
  $('#add', root)?.addEventListener('click', () => openForm(null, draw));

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const find = (id) => state.machines.find((m) => m.id === id);
    if (b.dataset.edit) openForm(find(b.dataset.edit), draw);
    else if (b.dataset.history) openHistory(b.dataset.history);
    else if (b.dataset.del) {
      const m = find(b.dataset.del);
      if (!(await confirmBox(`Delete machine ${m.code} — ${m.name}? This cannot be undone.`, { okText: 'Delete', danger: true }))) return;
      try {
        await api.del(`/api/machines/${m.id}`);
        await refreshMachines();
        draw();
        toast('Machine deleted');
      } catch (err) { toast(err.message, true); }
    }
  });

  draw();
}

function openForm(m, onSaved) {
  const s = state.settings;
  const owners = state.users.filter((u) => u.active && u.role !== 'management');
  const v = (k, d = '') => esc(m?.[k] ?? d);
  const html = `<form novalidate class="form-grid">
    ${m ? `<label class="field">Machine ID<input value="${v('machineId')}" readonly></label>` : ''}
    <label class="field">Machine code *<input name="code" value="${v('code')}" placeholder="e.g. MLT-01" required></label>
    <label class="field ${m ? 's2' : 's3'}">Machine name *<input name="name" value="${v('name')}" placeholder="e.g. Induction Furnace 1 Ton" required></label>
    <label class="field">Department *<select name="department" required>${options(s.departments, m?.department, 'Select…')}</select></label>
    <label class="field">Production line / area<input name="area" value="${v('area')}" list="area-list" placeholder="e.g. Line 2">
      <datalist id="area-list">${s.areas.map((a) => `<option value="${esc(a)}">`).join('')}</datalist></label>
    <label class="field">Equipment category *<select name="category" required>${options(s.categories, m?.category, 'Select…')}</select></label>
    <label class="field">Criticality *<select name="criticality" required>${options(CRITICALITY, m?.criticality, 'Select…')}</select></label>
    <label class="field">Status *<select name="status">${options(['Active', 'Inactive'], m?.status || 'Active')}</select></label>
    <label class="field">Make / manufacturer<input name="make" value="${v('make')}"></label>
    <label class="field">Model number<input name="model" value="${v('model')}"></label>
    <label class="field">Serial number<input name="serialNo" value="${v('serialNo')}"></label>
    <label class="field">Installation date<input type="date" name="installDate" value="${v('installDate')}"></label>
    <label class="field s2">Maintenance owner<select name="maintenanceOwner">${options(owners.map((u) => [u.id, `${u.name} (${u.role})`]), m?.maintenanceOwner, '— None —')}</select></label>
    <label class="field s4">Machine description<textarea name="description" rows="2">${v('description')}</textarea></label>
    ${m ? `<p class="sub s4">Created by ${esc(m.createdByName)} on ${esc(fmtDT(m.createdAt))} · Last updated ${esc(fmtDT(m.updatedAt))}${m.updatedByName ? ` by ${esc(m.updatedByName)}` : ''}</p>` : ''}
    <div class="s4"><p class="form-error" hidden></p>
    <div class="form-actions"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" type="submit">Save machine</button></div></div>
  </form>`;

  modal(m ? `Edit ${m.code}` : 'New Machine', html, {
    onMount: (dlg, close) => {
      $('form', dlg).addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('[type=submit]', dlg);
        btn.disabled = true;
        try {
          const body = formToObj(e.target);
          m ? await api.put(`/api/machines/${m.id}`, body) : await api.post('/api/machines', body);
          await refreshMachines();
          close();
          onSaved();
          toast(m ? 'Machine updated' : 'Machine added');
        } catch (err) { showError(dlg, err.message); btn.disabled = false; }
      });
    },
  });
}

async function openHistory(id) {
  let d;
  try { d = await api.get(`/api/machines/${id}`); } catch (err) { return toast(err.message, true); }
  const m = d.machine;
  const k = d.stats90d;
  const html = `
    <dl class="kv">
      <div><dt>Machine ID</dt><dd class="mono">${esc(m.machineId)}</dd></div>
      <div><dt>Department</dt><dd>${esc(m.department)}${m.area ? ` · ${esc(m.area)}` : ''}</dd></div>
      <div><dt>Category</dt><dd>${esc(m.category)}</dd></div>
      <div><dt>Criticality</dt><dd>${critPill(m.criticality)}</dd></div>
      <div><dt>Make / model</dt><dd>${esc([m.make, m.model].filter(Boolean).join(' / ') || '—')}</dd></div>
      <div><dt>Serial no.</dt><dd>${esc(m.serialNo || '—')}</dd></div>
      <div><dt>Installed</dt><dd>${esc(fmtDate(m.installDate))}</dd></div>
      <div><dt>Maintenance owner</dt><dd>${esc(m.maintenanceOwnerName || '—')}</dd></div>
      ${m.description ? `<div class="s4"><dt>Description</dt><dd>${esc(m.description)}</dd></div>` : ''}
    </dl>
    <h3 style="margin:18px 0 10px">Reliability — last 90 days</h3>
    <div class="metrics">
      <div class="metric"><b>${k.total}</b><span>Breakdowns</span></div>
      <div class="metric"><b>${esc(fmtDur(k.downtimeMin))}</b><span>Total downtime</span></div>
      <div class="metric"><b>${esc(fmtDur(k.mttrMin))}</b><span>MTTR</span></div>
      <div class="metric"><b>${esc(fmtHours(k.mtbfHours))}</b><span>MTBF</span></div>
      <div class="metric"><b>${k.availability == null ? '—' : k.availability + '%'}</b><span>Availability</span></div>
      <div class="metric"><b>${d.totalBreakdowns}</b><span>All-time breakdowns</span></div>
    </div>
    <h3 style="margin:18px 0 6px">Recent breakdowns</h3>
    ${d.recent.length ? `<div class="table-wrap"><table class="rtable"><thead><tr><th>Breakdown ID</th><th>Date</th><th>Problem</th><th>Downtime</th><th>Status</th></tr></thead><tbody>
      ${d.recent.map((b) => `<tr><td class="mono" data-label="ID">${esc(b.breakdownId)}</td><td class="num" data-label="Date">${esc(fmtDT(b.occurredAt))}</td>
        <td class="clip" data-label="Problem">${esc(b.problem)}</td><td class="num" data-label="Downtime">${esc(fmtDur(b.downtimeMin))}</td><td data-label="Status">${statusPill(b.status)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No breakdowns recorded for this machine.</div>'}`;
  modal(`${m.code} — ${m.name}`, html);
}
