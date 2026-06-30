# Architecture & data flow

```
            ┌──────────────────────┐
            │  Google Calendar     │  team events: check-measures, installs, …
            └──────────┬───────────┘
                       │  onEventUpdated + hourly
                       ▼
            ┌──────────────────────┐
            │ Apps Script (Code.gs)│  classify stage, extract fields + assignee,
            │  collectJobs_        │  dedupe by QU ref / client slug
            └──────────┬───────────┘
                       │  POST /api/sync  (X-Sync-Secret)
                       ▼
   ┌───────────────────────────────────────────────┐
   │ Node/Express (server/)                         │
   │  • session auth (bcrypt)   • role-scoped API   │
   │  • /api/jobs /assign /meetings /reports /sync  │
   │            │                                   │
   │            ▼                                   │
   │      MySQL (db/schema.sql)                     │
   │  employees · jobs · meetings · reports         │
   └───────────────┬───────────────────────────────┘
                   │  fetch() JSON (session cookie)
                   ▼
        ┌──────────────────────┐
        │ Dashboard (public/)  │  board + clash detection + agenda,
        │  index / maintenance │  admin assignment, maintenance reports
        └──────────────────────┘
```

## Components

- **Apps Script** is the only writer of calendar-derived data. It POSTs a list of
  jobs to `/api/sync`. The endpoint is guarded by a shared secret, not a user
  session.
- **The server** owns identity and authority. `loadUser` attaches the logged-in
  employee; `requireRole` guards admin actions; `jobsRepo` centralises the
  role-scoped reads (`listForUser`, `canView`).
- **The dashboard** is a thin client: it renders whatever the role-scoped API
  returns and posts assignments/reports back. The pure calendar/room logic is
  imported from `shared/` (same code the tests cover).

## Field provenance & preservation

`jobs` rows have two kinds of fields:

- **Calendar-derived** (dates, address, summary, pdf_links, contact, gcal id) —
  refreshed on every sync.
- **Human-owned** (`stage`, `status`, `assigned_drafter_id`,
  `assigned_installer_id`) — set by an admin in the UI. The sync **never**
  overwrites these; assignments are only filled in when still empty (SQL
  `COALESCE`). This mirrors how the original dashboard preserved `status`.

## Stage vs status

- `stage` — pipeline position: `check_measure, drafting, review, client_signoff,
  production, install, maintenance, complete`.
- `status` — install-approval state: `Pending, Approved, Scheduled, Declined`.

They're independent: a job can be `stage = install` while `status = Approved`.

## Meetings

Discrete touchpoints (client meetings, check-measures, reviews) live in their own
`meetings` table so the board can show single-point events as chips alongside
multi-day install blocks — the original only had multi-day job ranges.
