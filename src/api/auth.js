'use strict';
// Login, current user, password change, users admin, settings, bootstrap payload.
const crypto = require('node:crypto');
const { add } = require('../router');
const { db, save } = require('../store');
const { HttpError, bad, str, bool } = require('../http');
const A = require('../auth');

// Public default login for a brand-new database. Must be changed at first sign-in.
const DEFAULT_ADMIN = { username: 'admin', password: 'Admin@12345' };

const LISTS = ['departments', 'areas', 'categories', 'breakdownTypes', 'rootCauseCategories'];
const REQUIRED_LISTS = ['departments', 'categories', 'breakdownTypes', 'rootCauseCategories'];

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) bad('Password must be at least 8 characters');
}

add('POST', '/api/auth/login', null, ({ body }) => {
  const username = str(body.username).toLowerCase();
  A.throttle(username);
  const user = db.users.find((u) => u.username === username);
  if (!user || !user.active || !A.verifyPassword(String(body.password || ''), user.passwordHash)) {
    A.recordFailure(username);
    throw new HttpError(401, 'Invalid username or password');
  }
  A.clearFailures(username);
  return { token: A.issueToken(user), user: A.publicUser(user) };
});

add('GET', '/api/bootstrap', '*', ({ user }) => ({
  me: A.publicUser(user),
  settings: db.settings,
  users: db.users.map(A.publicUser),
  roles: A.ROLES,
}));

add('POST', '/api/auth/password', '*', ({ user, body }) => {
  if (!A.verifyPassword(String(body.current || ''), user.passwordHash)) throw new HttpError(400, 'Current password is incorrect');
  checkPassword(body.next);
  if (body.next === body.current) bad('Choose a different password');
  user.passwordHash = A.hashPassword(body.next);
  user.mustChangePassword = false;
  save();
  return { ok: true };
});

// ---- users ----
add('GET', '/api/users', '*', () => db.users.map(A.publicUser));

add('POST', '/api/users', A.CAN.admin, ({ body }) => {
  const username = str(body.username).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) bad('Username must be 3-30 letters, digits, dot, dash or underscore');
  if (db.users.some((u) => u.username === username)) throw new HttpError(409, 'Username already exists');
  const name = str(body.name);
  if (!name) bad('Name is required');
  if (!A.ROLES.includes(body.role)) bad('Select a role');
  checkPassword(body.password);
  const u = {
    id: crypto.randomUUID(), username, name, role: body.role, active: true,
    passwordHash: A.hashPassword(body.password), mustChangePassword: true, createdAt: new Date().toISOString(),
  };
  db.users.push(u);
  save();
  return A.publicUser(u);
});

add('PUT', '/api/users/:id', A.CAN.admin, ({ params, body, user: me }) => {
  const u = db.users.find((x) => x.id === params.id);
  if (!u) throw new HttpError(404, 'User not found');
  const name = str(body.name) || u.name;
  const role = A.ROLES.includes(body.role) ? body.role : u.role;
  const active = body.active === undefined ? u.active : bool(body.active);
  const stillAdmin = role === 'admin' && active;
  if (u.role === 'admin' && !stillAdmin && db.users.filter((x) => x.role === 'admin' && x.active && x.id !== u.id).length === 0) {
    bad('At least one active administrator is required');
  }
  if (u.id === me.id && !active) bad('You cannot deactivate your own account');
  Object.assign(u, { name, role, active });
  if (body.password) {
    checkPassword(body.password);
    u.passwordHash = A.hashPassword(body.password);
    u.mustChangePassword = true;
  }
  save();
  return A.publicUser(u);
});

// ---- settings (admin) ----
add('PUT', '/api/settings', A.CAN.admin, ({ body }) => {
  const next = { ...db.settings };
  for (const key of LISTS) {
    if (body[key] === undefined) continue;
    if (!Array.isArray(body[key])) bad(`${key} must be a list`);
    const clean = [...new Set(body[key].map(str).filter(Boolean))];
    if (REQUIRED_LISTS.includes(key) && !clean.length) bad('Each master list needs at least one entry');
    next[key] = clean;
  }
  if (body.companyName !== undefined) next.companyName = str(body.companyName) || db.settings.companyName;
  if (body.operatingHoursPerDay !== undefined) {
    const h = Number(body.operatingHoursPerDay);
    if (!(h >= 1 && h <= 24)) bad('Operating hours per day must be between 1 and 24');
    next.operatingHoursPerDay = h;
  }
  db.settings = next;
  save();
  return db.settings;
});

// First run: create the administrator account.
function seedAdmin() {
  if (db.users.length) return;
  // Credentials can be chosen at first start via ADMIN_USERNAME / ADMIN_PASSWORD.
  // Otherwise a well-known default is used so a fresh deployment can be signed in to. It is public (it is in the
  // repository), so the first sign-in is forced to change it -- sign in and change it immediately.
  const username = (process.env.ADMIN_USERNAME || DEFAULT_ADMIN.username).trim().toLowerCase();
  const chosen = !!process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN.password;
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }
  db.users.push({
    id: crypto.randomUUID(), username, name: 'Administrator', role: 'admin', active: true,
    passwordHash: A.hashPassword(password), mustChangePassword: !chosen, createdAt: new Date().toISOString(),
  });
  save();
  console.log('\n  First run: administrator account created.');
  if (chosen) {
    console.log(`  Username: ${username}   Password: (the ADMIN_PASSWORD you provided)\n`);
  } else {
    console.log(`  Username: ${username}   Password: ${password}   (default -- public, change it at first sign-in)\n`);
  }
}

module.exports = { seedAdmin };
