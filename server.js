// Foundry Maintenance Management System
// Zero-dependency Node server: static files + JSON API. Data is kept in data/db.json (see src/store.js).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { HttpError } = require('./src/http');
const { match } = require('./src/router');
const { userFromToken, checkRole } = require('./src/auth');
const { db } = require('./src/store');
const { seedAdmin } = require('./src/api/auth');
require('./src/api/machines');
require('./src/api/breakdowns');
require('./src/api/reports');

const PORT = process.env.PORT || 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new HttpError(413, 'Payload too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);
  try {
    const found = match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'Not found');
    const { route, params } = found;

    let user = null;
    if (route.roles) {
      user = userFromToken((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!user) throw new HttpError(401, 'Please sign in');
      checkRole(user, route.roles);
    }
    const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
    const query = Object.fromEntries(url.searchParams);
    sendJson(res, 200, route.handler({ db, user, params, query, body }) ?? { ok: true });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    sendJson(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});

seedAdmin();
server.listen(PORT, () => console.log(`Foundry Maintenance Management System running at http://localhost:${PORT}`));
