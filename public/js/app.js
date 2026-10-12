import { api, auth } from './api.js';
import { state, loadBootstrap, can } from './state.js';
import { $, esc, icon } from './ui.js';
import { changePasswordDialog } from './account.js';
import * as dashboard from './views/dashboard.js';
import * as machines from './views/machines.js';
import * as register from './views/register.js';
import * as completion from './views/completion.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';

const ROUTES = {
  dashboard: { title: 'Dashboard', icon: 'dashboard', view: dashboard },
  machines: { title: 'Machine Master', short: 'Machines', icon: 'machine', view: machines },
  register: { title: 'Breakdown Register', short: 'Register', icon: 'register', view: register },
  completion: { title: 'Breakdown Completion', short: 'Completion', icon: 'completion', view: completion },
  reports: { title: 'Reports & Analytics', short: 'Reports', icon: 'reports', view: reports },
  settings: { title: 'Settings', icon: 'settings', view: settings },
};
const BOTTOM = ['dashboard', 'register', 'completion', 'machines', 'reports'];

// ---------- sign in ----------
function showLogin() {
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
  $('#login-form').username.focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  try {
    const r = await api.post('/api/auth/login', { username: e.target.username.value, password: e.target.password.value });
    auth.token = r.token;
    e.target.password.value = '';
    await start();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

function signOut() {
  auth.token = null;
  showLogin();
}
auth.onExpired = signOut;

// ---------- shell ----------
async function openQuick() {
  const { openForm } = await import('./views/register.js');
  openForm(null, () => { if (location.hash.startsWith('#/register') || location.hash.startsWith('#/dashboard') || location.hash === '#/' || !location.hash) route(); });
}

function buildShell() {
  const me = state.me;
  document.title = state.settings.companyName;
  $('#brand-title').textContent = state.settings.companyName;
  const initials = me.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  $('#user-btn').textContent = initials;
  $('#side-user').innerHTML = `<b>${esc(me.name)}</b><span style="text-transform:capitalize">${esc(me.role)}</span><br><button class="btn small ghost" id="signout" type="button" style="color:inherit;border-color:rgba(255,255,255,.25)">Sign out</button>`;
  $('#signout').addEventListener('click', signOut);

  $('#side-nav').innerHTML = Object.entries(ROUTES)
    .map(([k, r]) => `<a class="nav-link" href="#/${k}" data-route="${k}">${icon(r.icon)}<span>${esc(r.title)}</span></a>`).join('');
  $('#bottom-nav').innerHTML = BOTTOM
    .map((k) => `<a href="#/${k}" data-route="${k}">${icon(ROUTES[k].icon)}<span>${esc(ROUTES[k].short || ROUTES[k].title)}</span></a>`).join('');

  $('#quick-report').hidden = !can.report();
  $('#quick-report').onclick = openQuick;
  $('#user-btn').onclick = () => { location.hash = '#/settings'; };
}

// ---------- router ----------
let cleanup = null;
function route() {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  const key = ROUTES[name] ? name : 'dashboard';
  const r = ROUTES[key];
  $('#page-title').textContent = r.title;
  document.title = `${r.title} · ${state.settings.companyName}`;
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
  const view = $('#view');
  cleanup?.();
  const fresh = view.cloneNode(false); // drops listeners left by the previous view
  view.replaceWith(fresh);
  const result = r.view.render(fresh, param ? decodeURIComponent(param) : undefined);
  cleanup = typeof result === 'function' ? result : null; // async views return a Promise, which is not a cleanup hook
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => { if (!$('#app').hidden) route(); });

async function start() {
  try {
    await loadBootstrap();
  } catch {
    return showLogin();
  }
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  buildShell();
  route();
  if (state.me.mustChangePassword) changePasswordDialog(true);
}

if (auth.token) start(); else showLogin();
