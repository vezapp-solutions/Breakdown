import { api } from '../api.js';
import { state, can, refreshUsers } from '../state.js';
import { $, $$, esc, options, modal, showError, formToObj, toast } from '../ui.js';
import { changePasswordDialog } from '../account.js';

const LISTS = [
  ['departments', 'Departments', 'Machine and breakdown reports are grouped by department.'],
  ['areas', 'Production lines / areas', 'Suggestions shown when entering a machine’s line or area.'],
  ['categories', 'Equipment categories', 'Machine types such as furnace, mixer or compressor.'],
  ['breakdownTypes', 'Breakdown types', 'Shown when a breakdown is reported.'],
  ['rootCauseCategories', 'Root cause categories', 'Shown when a repair is completed.'],
];

export function render(root) {
  const admin = can.admin();
  const tabs = [['account', 'My account'], ...(admin ? [['lists', 'Master lists'], ['users', 'Users'], ['general', 'General']] : [])];
  let tab = tabs[0][0];

  const draw = () => {
    root.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}" type="button">${l}</button>`).join('')}</div><div id="pane"></div>`;
    $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
    const pane = $('#pane', root);
    ({ account, lists, users, general })[tab](pane);
  };
  draw();
}

function account(pane) {
  const me = state.me;
  pane.innerHTML = `<div class="card card-pad" style="max-width:520px"><h3>My account</h3>
    <dl class="kv" style="grid-template-columns:1fr 1fr"><div><dt>Name</dt><dd>${esc(me.name)}</dd></div><div><dt>Username</dt><dd>${esc(me.username)}</dd></div>
    <div><dt>Role</dt><dd style="text-transform:capitalize">${esc(me.role)}</dd></div></dl>
    <div class="form-actions" style="justify-content:flex-start"><button class="btn" id="pw" type="button">Change password</button></div></div>`;
  $('#pw', pane).addEventListener('click', () => changePasswordDialog(false));
}

// ---------- master lists ----------
function lists(pane) {
  const draft = Object.fromEntries(LISTS.map(([k]) => [k, [...state.settings[k]]]));
  pane.innerHTML = `<p class="sub" style="margin-bottom:12px">Removing an item does not change existing records — it only stops the item being offered for new entries.</p>
    <div class="grid-2">${LISTS.map(([k, title, hint]) => `<div class="card card-pad" data-list="${k}"><h3>${esc(title)}</h3><p class="sub" style="margin:-6px 0 10px">${esc(hint)}</p>
      <div class="chips" data-chips></div>
      <form class="spare-row" style="grid-template-columns:1fr auto;margin-top:12px"><input placeholder="Add new…" aria-label="Add to ${esc(title)}"><button class="btn small primary" type="submit">Add</button></form></div>`).join('')}</div>
    <div class="form-actions" style="justify-content:flex-start"><button class="btn primary" id="save" type="button">Save changes</button></div>`;

  const drawChips = (k) => {
    $(`[data-list=${k}] [data-chips]`, pane).innerHTML = draft[k].map((v, i) =>
      `<span class="pill" style="font-size:13px;padding:4px 6px 4px 12px">${esc(v)} <button data-rm="${k}:${i}" class="icon-btn" style="width:22px;height:22px;font-size:14px;margin-left:4px" type="button" aria-label="Remove ${esc(v)}">×</button></span>`).join('') || '<span class="sub">Empty</span>';
  };
  LISTS.forEach(([k]) => drawChips(k));

  pane.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]')?.dataset.rm;
    if (!rm) return;
    const [k, i] = rm.split(':');
    draft[k].splice(Number(i), 1);
    drawChips(k);
  });
  $$('[data-list] form', pane).forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const k = f.closest('[data-list]').dataset.list;
    const v = f.querySelector('input').value.trim();
    if (v && !draft[k].includes(v)) draft[k].push(v);
    f.querySelector('input').value = '';
    drawChips(k);
  }));
  $('#save', pane).addEventListener('click', async () => {
    try { state.settings = await api.put('/api/settings', draft); toast('Master lists saved'); }
    catch (err) { toast(err.message, true); }
  });
}

// ---------- users ----------
function users(pane) {
  pane.innerHTML = `<div class="toolbar"><span class="spacer"></span><button class="btn primary" id="add" type="button">+ New User</button></div>
    <div class="card"><div class="table-wrap"><table class="rtable"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
    ${state.users.map((u) => `<tr><td data-label="Name"><b>${esc(u.name)}</b></td><td class="mono" data-label="Username">${esc(u.username)}</td>
      <td style="text-transform:capitalize" data-label="Role">${esc(u.role)}</td>
      <td data-label="Status"><span class="pill s-${u.active ? 'Active' : 'Inactive'}">${u.active ? 'Active' : 'Inactive'}</span></td>
      <td class="row-actions"><button class="btn small" data-edit="${u.id}" type="button">Edit</button></td></tr>`).join('')}</tbody></table></div></div>
    <p class="sub" style="margin-top:10px">Roles — <b>admin</b>: everything · <b>supervisor</b>: machines, assign, verify &amp; close · <b>technician</b>: report and complete repairs ·
      <b>operator</b>: report breakdowns · <b>management</b>: view-only dashboards and reports.</p>`;
  $('#add', pane).addEventListener('click', () => userForm(null, () => users(pane)));
  pane.addEventListener('click', (e) => {
    const id = e.target.closest('[data-edit]')?.dataset.edit;
    if (id) userForm(state.users.find((u) => u.id === id), () => users(pane));
  });
}

function userForm(u, done) {
  const html = `<form novalidate class="form-grid">
    <label class="field s2">Full name *<input name="name" value="${esc(u?.name)}" required></label>
    <label class="field s2">Username *<input name="username" value="${esc(u?.username)}" ${u ? 'readonly' : ''} required autocapitalize="none"></label>
    <label class="field s2">Role *<select name="role">${options(state.roles, u?.role || 'operator')}</select></label>
    ${u ? `<label class="field s2">Status<select name="active">${options([['true', 'Active'], ['false', 'Inactive']], String(u.active))}</select></label>` : ''}
    <label class="field s4">${u ? 'Reset password (leave blank to keep)' : 'Initial password *'}<input name="password" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters">
      <span class="hint">The user must change it at next sign-in.</span></label>
    <div class="s4"><p class="form-error" hidden></p><div class="form-actions"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" type="submit">Save user</button></div></div></form>`;
  modal(u ? `Edit ${u.name}` : 'New User', html, {
    narrow: true,
    onMount: (dlg, close) => $('form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const body = formToObj(e.target);
        if (u) body.active = body.active === 'true';
        if (!body.password) delete body.password;
        u ? await api.put(`/api/users/${u.id}`, body) : await api.post('/api/users', body);
        await refreshUsers();
        close(); done(); toast('User saved');
      } catch (err) { showError(dlg, err.message); }
    }),
  });
}

// ---------- general ----------
function general(pane) {
  const s = state.settings;
  pane.innerHTML = `<div class="card card-pad" style="max-width:560px"><h3>General</h3><form class="form-grid" style="grid-template-columns:1fr" novalidate>
    <label class="field">Application / company name<input name="companyName" value="${esc(s.companyName)}"></label>
    <label class="field">Operating hours per machine per day<input name="operatingHoursPerDay" type="number" min="1" max="24" step="0.5" value="${esc(s.operatingHoursPerDay)}">
      <span class="hint">Used for MTBF and availability. Use 24 for continuous operation, or e.g. 16 for two shifts.</span></label>
    <div><p class="form-error" hidden></p><div class="form-actions" style="justify-content:flex-start"><button class="btn primary" type="submit">Save</button></div></div>
    </form></div>`;
  $('form', pane).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.settings = await api.put('/api/settings', formToObj(e.target));
      document.getElementById('brand-title').textContent = state.settings.companyName;
      toast('Settings saved');
    } catch (err) { showError(pane, err.message); }
  });
}
