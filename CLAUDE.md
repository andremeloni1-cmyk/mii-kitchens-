# CLAUDE.md — working in this repo

Practical orientation for Claude Code (and humans). See `README.md` for the
product overview and `docs/ARCHITECTURE.md` for data flow.

## What this is

The **Mii Kitchens Hub** — a multi-user internal app for Mii Kitchens' job
pipeline (check-measure → drafting → review → sign-off → production → install →
maintenance). Node/Express + MySQL, with a Google Apps Script feeding jobs in
from the team calendar. Three moving parts:

1. **Node/Express server** (`server/`) — session auth (bcrypt), a role-scoped
   JSON API (`/api/*`), and the MySQL layer (`db.js`, `jobsRepo.js`). Serves the
   static dashboard too.
2. **Static dashboard** (`public/`) — `index.html` (calendar board, clash
   detection, agenda, admin assignment), `maintenance.html` (report builder),
   `login.html`. Talks to the API via `fetch`.
3. **Apps Script sync** (`apps-script/Code.gs`) — classifies calendar events into
   job stages, extracts fields + assignees, POSTs to `/api/sync`.

## Layout

```
server/           Express app, auth, routes (jobs/assign/meetings/reports/sync)
server/jobsRepo.js  Job reads/writes + role-scoping (single source of truth)
public/           Dashboard UI (fetches /api); login-gated
shared/           Pure logic (calendar.js, rooms.js) — browser + server + tests
db/schema.sql     MySQL schema + seed
apps-script/      Calendar -> /api/sync (Code.gs) + SETUP.md
deploy/           VPS deploy (nginx, systemd, DEPLOY.md)
tests/            node --test
scripts/setpw.js  Set an employee password
```

## Running the tests

Dependency-light — Node's built-in runner (Node 20+):

```bash
npm install     # supertest/express for the API smoke tests
npm test        # node --test tests/*.test.js
```

CI runs the same via `.github/workflows/tests.yml`.

### What's tested (and what isn't)

- `tests/calendar-lib.test.js`, `tests/rooms-lib.test.js` — the pure `shared/`
  logic (dayMap, clash detection, gcalUrl, room parsing).
- `tests/helpers.test.js`, `tests/sync-payload.test.js` — the Apps Script pure
  helpers, loaded into a `node:vm` sandbox by `tests/load-code.js` (GAS globals
  stubbed). Validates stage classification, assignee extraction, and the
  `/api/sync` payload shape.
- `tests/api.test.js` — Express smoke tests via `supertest` that need **no DB**
  (auth gate 401s + the sync secret guard). Full DB-backed CRUD is verified
  manually against a test MySQL.

## Conventions & gotchas

- **Pure logic lives in `shared/`** and is loaded both in the browser (UMD →
  `window.HubCalendar` / `window.HubRooms`) and in Node (`require`). Keep it free
  of DOM/DB so the tests can exercise it.
- **Cross-realm arrays:** values returned from the `vm` sandbox (Apps Script
  helpers) carry the sandbox's prototypes — wrap with `Array.from(...)` before
  `assert.deepStrictEqual`.
- **Role scoping is enforced server-side** in `jobsRepo.listForUser` /
  `canView` and the `requireRole` guards — never trust the client to filter.
- **The sync preserves human decisions:** `/api/sync` refreshes only
  calendar-derived fields; it never overwrites stage/status and only *fills in*
  empty assignments (COALESCE).
- **Secrets** live in `.env` (gitignored). `config.sample` is `.env.sample`.
- **Stage vs status:** `stage` is the pipeline position (8 values); `status` is
  the install-approval state (Pending/Approved/Scheduled/Declined). Orthogonal.

## Deploy

`deploy/DEPLOY.md` (Hostinger VPS) is the source of truth. `db/schema.sql` is
idempotent — re-importing applies new tables/columns safely.
