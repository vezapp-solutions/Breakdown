'use strict';
// JSON-file data store. Single process, synchronous, atomic writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const VERSION = 2;

const DEFAULT_SETTINGS = {
  companyName: 'Foundry Maintenance Management System',
  operatingHoursPerDay: 24,
  departments: [
    'Melting', 'Sand Plant', 'Moulding', 'Core Shop', 'Pouring', 'Knockout', 'Fettling',
    'Shot Blasting', 'Heat Treatment', 'Machining', 'Pattern Shop', 'Quality Lab', 'Utilities', 'Maintenance',
  ],
  areas: [],
  categories: [
    'Furnace', 'Mixer / Muller', 'Moulding Machine', 'Core Machine', 'Conveyor', 'Crane / Hoist',
    'Compressor', 'Pump', 'Fan / Blower', 'Grinder', 'Shot Blast Machine', 'CNC / Machine Tool',
    'Electrical Panel', 'Testing Equipment', 'Utility', 'Other',
  ],
  breakdownTypes: ['Mechanical', 'Electrical', 'Hydraulic', 'Pneumatic', 'Instrumentation', 'Process', 'Utility', 'Other'],
  rootCauseCategories: [
    'Wear and tear', 'Lack of lubrication', 'Operator error', 'Electrical fault', 'Spare / material defect',
    'Overload', 'Poor maintenance', 'Design / installation', 'External factor', 'Unknown',
  ],
};

function load() {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    /* first run */
  }
  if (raw && raw.version !== VERSION) {
    // v1 (flat prototype) data is incompatible: keep a backup, start the new structure.
    if ((raw.machines || []).length || (raw.breakdowns || []).length) {
      fs.copyFileSync(FILE, path.join(DATA_DIR, 'db.v1-backup.json'));
      console.log('Old-format data backed up to data/db.v1-backup.json');
    }
    raw = null;
  }
  const db = {
    version: VERSION,
    secret: crypto.randomBytes(32).toString('hex'),
    counters: { machine: 0, breakdown: {} },
    users: [],
    machines: [],
    breakdowns: [],
    ...(raw || {}),
  };
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
  return db;
}

const db = load();

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function nextMachineId() {
  db.counters.machine += 1;
  return 'MC-' + String(db.counters.machine).padStart(4, '0');
}

function nextBreakdownId(year) {
  db.counters.breakdown[year] = (db.counters.breakdown[year] || 0) + 1;
  return `BD-${year}-${String(db.counters.breakdown[year]).padStart(4, '0')}`;
}

module.exports = { db, save, nextMachineId, nextBreakdownId, DATA_DIR };
