# Foundry Maintenance Management System

Breakdown register, breakdown completion and machine master for a foundry.
Zero dependencies — just Node.js 18+ (developed on 22).

```
npm start          # http://localhost:3100   (PORT=… to change)
```

**First run:** when `data/db.json` has no users, an administrator account is created:

| Username | Password |
| --- | --- |
| `admin` | `Admin@12345` |

This default is public (it is in this repository), so you are **forced to change the password at first sign-in** — do
that straight away, and don't deploy to the internet with real data until you have. To choose a different first login
instead, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (min 8 chars) before the **first** start (no forced change then):

```
# PowerShell
$env:ADMIN_USERNAME="myname"; $env:ADMIN_PASSWORD="my-test-password"; npm start
```

Then add users in **Settings → Users**.

## Modules

| Module | What it does |
| --- | --- |
| **Machine Master** | Machine ID (auto `MC-0001`), unique code, name, department, line/area, category, make, model, serial, criticality, install date, maintenance owner, description, Active/Inactive, created/updated by + at. A machine with breakdown history can't be deleted — mark it Inactive. Each machine has a reliability history (last 90 days). |
| **Breakdown Register** | Operators/technicians report: machine, breakdown time, shift, type, priority, production stopped, problem, immediate action. Auto ID `BD-2026-0001`. Warns when the machine already has an open breakdown. Search, filters, CSV export. |
| **Breakdown Completion** | Same record, same ID. Technician starts work → records attended-by, root cause, action, spares, restored time and a tested/handed-back confirmation → supervisor verifies and closes (or reopens). Response time, repair time and downtime are calculated automatically. |
| **Dashboard** | Open breakdowns by urgency, my jobs, month KPIs, 14-day trend, top machines by downtime. |
| **Reports & Analytics** | Date/department/category/machine/type filters; MTTR, MTBF, availability, trend, downtime by machine / department / root cause, machine reliability table, CSV exports. |
| **Settings** | Master lists (departments, areas, categories, breakdown types, root cause categories), users & roles, operating hours/day, change password. |

Workflow: `Reported → Assigned → In Progress → Completed → Closed` (plus `Cancelled`, and `Reopen`). Every step is logged in the breakdown's history.

## Roles

| Role | Can |
| --- | --- |
| admin | everything, incl. users, settings, deleting breakdowns |
| supervisor | machines, assign, cancel, verify & close / reopen, edit breakdowns |
| technician | report breakdowns, start and complete repairs assigned to them |
| operator | report breakdowns, edit their own un-actioned report |
| management | view-only dashboards, registers and reports |

## Storage

Data lives in `data/db.json` (created on first run, git-ignored; back this file up). No external database or
credentials are needed, so there is no separate demo mode. Writes are atomic. If an old-format `db.json` from the
earlier prototype is found, it is copied to `data/db.v1-backup.json` before the new structure is created.

## Layout

```
server.js            HTTP server + static files
src/store.js         JSON store, IDs, default master lists
src/auth.js          scrypt passwords, signed 12 h tokens, role permissions, login lockout
src/analytics.js     MTTR / MTBF / availability maths
src/api/*.js         routes: auth+users+settings, machines, breakdowns (register + completion), dashboard/reports
public/              responsive SPA (ES modules, no build step)
```

## Metric definitions

- **Downtime** = restored time − breakdown time (completed repairs only)
- **Response** = work start − reported; **Repair** = restored − work start; **MTTR** = average repair time
- **MTBF** = (operating hours − downtime) ÷ failures, operating hours = days × *operating hours per day* (Settings)
- **Availability** = 1 − downtime ÷ operating hours across active machines
