'use strict';
// Shared HTTP error type + input helpers

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => {
  throw new HttpError(400, msg);
};
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const bool = (v) => v === true || v === 'true' || v === 'on';

// Parses a required timestamp and returns canonical ISO (UTC). Future times (>5 min) are rejected.
function parseTime(v, label, { allowFuture = false } = {}) {
  const d = new Date(v);
  if (!v || isNaN(d)) bad(`${label} is required`);
  if (!allowFuture && d.getTime() > Date.now() + 5 * 60000) bad(`${label} cannot be in the future`);
  return d.toISOString();
}

const mins = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

module.exports = { HttpError, bad, str, bool, parseTime, mins };
