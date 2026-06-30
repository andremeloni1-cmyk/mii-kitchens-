# memory.md — durable context

Decisions and context worth carrying forward. Append; don't rewrite history.

## Origin

Built by copying the architecture + visual style of the **Kitchen Install
Dashboard** (`andremeloni1-cmyk/joinery-`) into a new standalone repo for **Mii
Kitchens'** internal use. The original was a static, single-user, localStorage
dashboard fed by an Apps Script → Base44 sync.

## Key decisions

- **Multi-user, not static.** The defining new requirement was per-employee
  logins + role-based views + shared job assignment, which localStorage can't do.
- **Host: Hostinger VPS.** André's choice (a VPS, not shared hosting), which
  freed the stack from PHP.
- **Stack: Node/Express + MySQL.** Chosen over PHP so the whole codebase is one
  language and the pure calendar/room logic in `shared/` is imported by the
  browser, the server, and the tests (no reimplementation). The original
  `db/schema.sql` (a Hostinger MySQL exploration) was the schema starting point.
- **Base44 dropped** as the live app; the Apps Script was repointed from the
  Base44 REST API to the Hub's `/api/sync`.
- **stage vs status kept distinct** — pipeline position vs install-approval.
- **Sync preserves human decisions** — only fills empty assignments, never
  overwrites stage/status.

## Conventions

- Pure logic in `shared/` (UMD: browser + Node). Wrap vm-sandbox arrays with
  `Array.from` before deep-equal (Apps Script helper tests).
- Role scoping enforced server-side only (`jobsRepo`, `requireRole`).
- Secrets in `.env` (gitignored); `.env.sample` committed.

## Known follow-ups / not yet done

- DB-backed API CRUD is covered manually, not in CI (api.test.js is DB-free).
  A future pass could add a MySQL service to CI for full integration tests.
- The Apps Script roster (name → employee_code) ships with placeholder names in
  `DEFAULT_ROSTER`; set the real team via `ROSTER_JSON` or edit the constant.
- Seed employees in `db/schema.sql` are placeholders with NULL passwords — set
  real ones with `scripts/setpw.js`.
- No "create job from scratch in the UI" yet — jobs arrive via calendar sync;
  admin edits stage/assignment after. A manual job-create form is a possible add.
