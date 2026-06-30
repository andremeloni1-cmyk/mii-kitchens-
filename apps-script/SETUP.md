# Apps Script setup — Calendar → Hub sync

The Google Apps Script reads the team calendar and POSTs jobs to the Hub's
`/api/sync` endpoint. It runs on every calendar change + hourly.

## 1. Create the script

1. Go to <https://script.google.com> → **New project**.
2. Paste `Code.gs` into the editor, and add `appsscript.json` (Project Settings →
   "Show appsscript.json manifest file in editor").

## 2. Script Properties

Project Settings → **Script Properties** → add:

| Property        | Required | Example / default                         |
| --------------- | -------- | ----------------------------------------- |
| `API_BASE_URL`  | yes      | `https://hub.miikitchens.com` (no trailing `/`) |
| `SYNC_SECRET`   | yes      | the same long random value as the server's `.env` `SYNC_SECRET` |
| `CALENDAR_ID`   | no       | `primary` (default) or a calendar id      |
| `HORIZON_DAYS`  | no       | `400` (default)                           |
| `ROSTER_JSON`   | no       | `[{"code":"DRAFT-ONE","match":["emily"]}]` — maps names in event text to `employee_code` |

## 3. Install the triggers

Run **`setupTriggers`** once and authorise when prompted. It installs:

- an **onEventUpdated** trigger on the calendar (instant sync on any change), and
- an **hourly** time trigger (safety net), and runs an initial sync immediately.

## 4. How events are read

- An event is treated as a job if its title/description mentions a `QU####`
  reference, `install`, `kitchen`, `check measure`, `drafting`, etc.
  (`isInstallEvent_`), or starts with `Company: Mii`.
- The **stage** is inferred from the wording (`classifyStage_`): "check measure"
  → `check_measure`, "drafting" → `drafting`, "install" → `install`, etc.
- The assigned drafter/installer is read from labelled lines in the description
  (`Drafter: …`, `Installer: …`) and mapped to an `employee_code` via the roster.
- Jobs dedupe by `QU` reference (or a client-name slug). The server preserves any
  admin-set stage/status/assignment — the sync only **fills in** blanks.

## 5. (Optional) Address format

Put the site address on its own line after a 📍 pin, or as a
`maps.google.com/?q=…` link — `extractAddress_` decodes both.
