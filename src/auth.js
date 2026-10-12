'use strict';
// Password hashing (scrypt), stateless signed tokens, role permissions, login throttling.
const crypto = require('node:crypto');
const { db } = require('./store');
const { HttpError } = require('./http');

const ROLES = ['admin', 'supervisor', 'technician', 'operator', 'management'];

// Who may do what. `management` is read-only everywhere.
const CAN = {
  any: '*',
  reportBreakdown: ['admin', 'supervisor', 'technician', 'operator'],
  editMachines: ['admin', 'supervisor'],
  assign: ['admin', 'supervisor'],
  work: ['admin', 'supervisor', 'technician'],
  close: ['admin', 'supervisor'],
  admin: ['admin'],
};

const TOKEN_TTL_MS = 12 * 3600 * 1000;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(pw, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const mac = (s) => crypto.createHmac('sha256', db.secret).update(s).digest('base64url');

function issueToken(user) {
  const body = b64(JSON.stringify({ uid: user.id, exp: Date.now() + TOKEN_TTL_MS }));
  return `${body}.${mac(body)}`;
}

function userFromToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (exp < Date.now()) return null;
    const user = db.users.find((u) => u.id === uid);
    return user && user.active ? user : null;
  } catch {
    return null;
  }
}

function checkRole(user, roles) {
  if (roles === '*') return;
  if (!roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to do this');
}

// 5 failed attempts -> 5 minute lockout (per username)
const attempts = new Map();
function throttle(username) {
  const a = attempts.get(username);
  if (a && a.until > Date.now()) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
}
function recordFailure(username) {
  const a = attempts.get(username) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) {
    a.until = Date.now() + 5 * 60000;
    a.n = 0;
  }
  attempts.set(username, a);
}
const clearFailures = (username) => attempts.delete(username);

const publicUser = (u) => ({
  id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, mustChangePassword: !!u.mustChangePassword,
});

module.exports = {
  ROLES, CAN, hashPassword, verifyPassword, issueToken, userFromToken, checkRole,
  throttle, recordFailure, clearFailures, publicUser,
};
