# Mii Kitchens Hub

The internal operations hub for **Mii Kitchens** — one place where the whole
team runs the kitchen/joinery pipeline: site check-measure → drafting → review →
client sign-off → production → install → maintenance.

Every employee logs in and sees their own work; admins assign jobs to
draftspeople and installers, schedule client meetings, and oversee all
maintenance reports across the team.

It reuses the calendar / clash-detection / maintenance-report design of the
original Kitchen Install Dashboard, rebuilt as a real multi-user app.

## What's here

| Path | What it is |
| --- | --- |
| `server/` | Node/Express app — auth (sessions + bcrypt), role-scoped JSON API, MySQL. |
| `public/` | The dashboard UI (`index.html` board, `maintenance.html`, `login.html`). |
| `shared/` | Pure logic (`calendar.js`, `rooms.js`) used by the browser **and** the tests. |
| `db/schema.sql` | MySQL schema + seed (employees, jobs, meetings, reports). |
| `apps-script/` | Google Calendar → `/api/sync` sync (`Code.gs`) + setup notes. |
| `deploy/` | Hostinger VPS deploy: nginx, systemd, step-by-step `DEPLOY.md`. |
| `tests/` | Node's built-in test runner — shared logic, API smoke, Apps Script helpers. |
| `scripts/setpw.js` | Set/reset an employee's login password. |

## Roles

- **admin** — sees everything; assigns drafters/installers, sets stage/status,
  schedules meetings, sees all maintenance reports.
- **drafter** — sees jobs assigned to them + their meetings.
- **installer** — sees jobs assigned to them + their install schedule, and writes
  maintenance reports.

## Run the tests

```bash
npm install
npm test          # node --test tests/*.test.js
```

## Run locally

Needs a MySQL with `db/schema.sql` imported and a `.env` (copy `.env.sample`).

```bash
npm install
npm start         # http://localhost:3000  (sign in at /login.html)
```

## Deploy

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md) for the full Hostinger VPS setup
(Node + MySQL + nginx + certbot), and [`apps-script/SETUP.md`](apps-script/SETUP.md)
for the calendar sync.
