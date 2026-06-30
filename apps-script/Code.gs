/**
 * Mii Kitchens Hub — Google Calendar → Hub API sync
 * --------------------------------------------------
 * Reads the team calendar, classifies each event as a job stage
 * (check-measure / drafting / install / maintenance / …), extracts the job
 * fields + any assigned drafter/installer, dedupes by QU reference (or client
 * slug), and POSTs the result to the Hub's /api/sync endpoint.
 *
 * The Hub preserves human decisions: it refreshes only calendar-derived fields
 * and never overwrites an admin's stage/status or an existing assignment.
 *
 * Runs automatically on any calendar change + hourly. See apps-script/SETUP.md.
 */

// ----------------------------------------------------------------------------
// CONFIG — Script Properties (Project Settings > Script Properties):
//   API_BASE_URL   REQUIRED — e.g. https://hub.miikitchens.com  (no trailing /)
//   SYNC_SECRET    REQUIRED — must match the server's SYNC_SECRET (.env)
//   CALENDAR_ID    default "primary"
//   HORIZON_DAYS   default "400"
//   ROSTER_JSON    optional — [{ "code":"DRAFT-ONE", "match":["emily","drafter one"] }, ...]
// ----------------------------------------------------------------------------

// Starter roster mapping names found in event text -> employee_code. EDIT to
// your real team, or override via the ROSTER_JSON script property.
var DEFAULT_ROSTER = [
  { code: 'DRAFT-ONE',   match: ['drafter one', 'draft one'] },
  { code: 'DRAFT-TWO',   match: ['drafter two', 'draft two'] },
  { code: 'DRAFT-THREE', match: ['drafter three'] },
  { code: 'DRAFT-FOUR',  match: ['drafter four'] },
  { code: 'INST-SAM',    match: ['sam'] },
  { code: 'INST-LEE',    match: ['lee'] }
];

function getConfig_() {
  var p = PropertiesService.getScriptProperties();
  var roster;
  try { roster = JSON.parse(p.getProperty('ROSTER_JSON') || 'null') || DEFAULT_ROSTER; }
  catch (e) { roster = DEFAULT_ROSTER; }
  return {
    apiBase:  (p.getProperty('API_BASE_URL') || '').replace(/\/+$/, ''),
    secret:   p.getProperty('SYNC_SECRET')   || '',
    calendar: p.getProperty('CALENDAR_ID')   || 'primary',
    horizon:  parseInt(p.getProperty('HORIZON_DAYS') || '400', 10),
    roster:   roster
  };
}

// ---- Classification --------------------------------------------------------

// Is this calendar event a Mii job (any pipeline stage)?
function isInstallEvent_(summary, description) {
  var s = (summary || '') + ' ' + (description || '');
  if (/^\s*company:\s*mii/i.test(description || '')) return true;
  return /\bqu\s?\d{3,5}\b|install|kitchen|alfresco|joinery|check[\s-]?measure|site\s*measure|draft|design|review|sign[\s-]?off|signoff|production|manufactur|maintenance/i.test(s);
}

// Map event text -> a pipeline stage enum (matches the DB ENUM).
function classifyStage_(summary, description) {
  var s = ((summary || '') + ' ' + (description || '')).toLowerCase();
  if (/check[\s-]?measure|site\s*measure/.test(s)) return 'check_measure';
  if (/sign[\s-]?off|signoff/.test(s))             return 'client_signoff';
  if (/\breview\b/.test(s))                         return 'review';
  // Word boundaries so the "Drafter:"/"Designer:" assignee labels in the
  // description don't get mistaken for the drafting STAGE.
  if (/\bdraft(ing|s)?\b|\bdesign\b/.test(s))       return 'drafting';
  if (/production|manufactur/.test(s))              return 'production';
  if (/maintenance|service call|defect|warranty/.test(s)) return 'maintenance';
  if (/handover|handed over|\bcomplete\b/.test(s))  return 'complete';
  if (/install/.test(s))                            return 'install';
  return 'install'; // calendar default: most dated events are installs
}

// ---- Field extraction helpers (pure — safe to unit test) -------------------

function extractQU_(text) {
  var m = (text || '').match(/\bQU\s?(\d{3,5})\b/i);
  return m ? ('QU' + m[1]) : '';
}

function extractAddress_(description) {
  if (!description) return '';
  var pin = description.match(/📍\s*(\S.*)/);
  var val = pin ? pin[1].trim() : '';
  var maps = val.match(/maps\.google\.com\/\?q=(\S+)/i) || description.match(/maps\.google\.com\/\?q=(\S+)/i);
  if (maps) {
    try { return decodeURIComponent(maps[1]).replace(/\+/g, ' ').trim(); } catch (e) { return val; }
  }
  if (/^https?:\/\//i.test(val)) return '';
  return val;
}

function extractLine_(description, label) {
  if (!description) return '';
  var re = new RegExp(label + '\\s*:?\\s*(.+)', 'i');
  var m = description.match(re);
  return m ? m[1].split('\n')[0].trim() : '';
}

function extractDriveLinks_(description) {
  if (!description) return [];
  var links = description.match(/https?:\/\/(?:drive|docs)\.google\.com\/\S+/gi) || [];
  return links.filter(function (v, i) { return links.indexOf(v) === i; });
}

// Pull the assigned drafter/installer names out of labelled description lines.
function extractAssignee_(description) {
  return {
    drafter: extractLine_(description, 'Drafter') || extractLine_(description, 'Designer') || '',
    installer: extractLine_(description, 'Installer') || extractLine_(description, 'Installed by') || ''
  };
}

// Map a free-text name to an employee_code via the roster (first keyword hit).
function resolveEmployeeCode_(name, roster) {
  var t = (name || '').toLowerCase();
  if (!t) return '';
  roster = roster || DEFAULT_ROSTER;
  for (var i = 0; i < roster.length; i++) {
    var entry = roster[i];
    for (var k = 0; k < (entry.match || []).length; k++) {
      if (t.indexOf(entry.match[k].toLowerCase()) !== -1) return entry.code;
    }
  }
  return '';
}

function deriveClient_(summary) {
  var s = (summary || '').replace(/\bQU\s?\d{3,5}\b/i, '').trim();
  s = s.replace(/^[\-–\s]+/, '');
  s = s.split(/\s[\-–]\s/)[0];
  s = s.replace(/\b(install(ation)?|kitchen|alfresco|check[\s-]?measure|drafting|review)\b/gi, '').trim();
  s = s.replace(/[\-–|]+$/, '').trim();
  return s || (summary || '').trim();
}

function slug_(text) {
  return (text || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function inclusiveDays_(startISO, endISO) {
  var a = new Date(startISO + 'T00:00:00');
  var b = new Date(endISO + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function toISODate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Pure: build the job payload object from already-extracted event fields. Kept
// free of Calendar/Properties calls so it can be unit-tested directly.
function parseInstall_(summary, description, startISO, endISO, roster) {
  var qu = extractQU_(summary) || extractQU_(description);
  var who = extractAssignee_(description);
  return {
    job_reference: qu || ('SLUG-' + slug_(deriveClient_(summary))),
    company: 'Mii Kitchens',
    client_name: deriveClient_(summary),
    site_address: extractAddress_(description) || '',
    contact_name: extractLine_(description, 'Contact') || extractLine_(description, 'Customer') || '',
    contact_phone: '', contact_email: '',
    start_date: startISO, end_date: endISO,
    days_required: inclusiveDays_(startISO, endISO),
    job_summary: (description || summary || '').replace(/\s+/g, ' ').slice(0, 400),
    pdf_links: extractDriveLinks_(description),
    is_tentative: false,
    stage: classifyStage_(summary, description),
    assigned_drafter: resolveEmployeeCode_(who.drafter, roster),
    assigned_installer: resolveEmployeeCode_(who.installer, roster),
    notes: 'Synced from Google Calendar.'
  };
}

// ---- Main ------------------------------------------------------------------

function runSync() {
  var cfg = getConfig_();
  if (!cfg.apiBase || !cfg.secret) {
    Logger.log('Set API_BASE_URL and SYNC_SECRET in Script Properties first.');
    return;
  }
  syncCalendarToApi_();
}

// Scan the calendar and return the deduped job list (array).
function collectJobs_(cfg) {
  var now = new Date();
  var until = new Date(now.getTime() + cfg.horizon * 86400000);
  var cal = (cfg.calendar === 'primary') ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(cfg.calendar);
  if (!cal) { Logger.log('Calendar not found: ' + cfg.calendar); return []; }

  var jobs = {};
  cal.getEvents(now, until).forEach(function (ev) {
    var summary = ev.getTitle();
    var description = ev.getDescription();
    if (!isInstallEvent_(summary, description)) return;

    var startISO = toISODate_(ev.getStartTime());
    var endDate = new Date(ev.getEndTime().getTime());
    if (ev.isAllDayEvent()) endDate = new Date(endDate.getTime() - 86400000);
    var endISO = toISODate_(endDate);
    if (endISO < startISO) endISO = startISO;

    var parsed = parseInstall_(summary, description, startISO, endISO, cfg.roster);
    if (!parsed.site_address) parsed.site_address = ev.getLocation() || '';
    parsed.gcal_event_id = ev.getId();

    var key = parsed.job_reference;
    if (!jobs[key]) {
      jobs[key] = parsed;
    } else {
      var j = jobs[key];
      if (parsed.start_date < j.start_date) j.start_date = parsed.start_date;
      if (parsed.end_date   > j.end_date)   j.end_date   = parsed.end_date;
      if (!j.site_address && parsed.site_address) j.site_address = parsed.site_address;
      if (!j.contact_name && parsed.contact_name) j.contact_name = parsed.contact_name;
      if (!j.assigned_drafter && parsed.assigned_drafter) j.assigned_drafter = parsed.assigned_drafter;
      if (!j.assigned_installer && parsed.assigned_installer) j.assigned_installer = parsed.assigned_installer;
      if (parsed.pdf_links.length) {
        j.pdf_links = j.pdf_links.concat(parsed.pdf_links).filter(function (v, i, a) { return a.indexOf(v) === i; });
      }
      if (parsed.job_summary.length > j.job_summary.length) j.job_summary = parsed.job_summary;
    }
  });

  Object.keys(jobs).forEach(function (k) {
    jobs[k].days_required = inclusiveDays_(jobs[k].start_date, jobs[k].end_date);
  });

  return Object.keys(jobs).map(function (k) { return jobs[k]; })
    .sort(function (a, b) { return a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0; });
}

function syncCalendarToApi_() {
  var cfg = getConfig_();
  var jobs = collectJobs_(cfg);
  var res = UrlFetchApp.fetch(cfg.apiBase + '/api/sync', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Sync-Secret': cfg.secret },
    payload: JSON.stringify({ jobs: jobs }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    Logger.log('sync failed (' + res.getResponseCode() + '): ' + res.getContentText());
  } else {
    Logger.log('Sync OK: ' + res.getContentText());
  }
}

// ---- One-time trigger installation. Run THIS once, then authorize. ----------

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runSync') ScriptApp.deleteTrigger(t);
  });
  var cfg = getConfig_();
  var calId = (cfg.calendar === 'primary') ? CalendarApp.getDefaultCalendar().getId() : cfg.calendar;
  try {
    ScriptApp.newTrigger('runSync').forUserCalendar(calId).onEventUpdated().create();
  } catch (e) {
    Logger.log('Change trigger not created for ' + calId + ' (' + e + ').');
  }
  ScriptApp.newTrigger('runSync').timeBased().everyHours(1).create();
  Logger.log('Triggers installed. Running an initial sync now...');
  runSync();
}
