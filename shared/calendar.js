/*
 * shared/calendar.js — pure calendar/scheduling helpers.
 *
 * Loaded both in the browser (sets window.HubCalendar) and in Node
 * (module.exports), so the dashboard, the server, and the test suite all run
 * the SAME date/clash/gcal logic. Keep this file free of DOM and DB calls.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HubCalendar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // "YYYY-MM-DD" -> local Date (midnight). Avoids timezone drift from Date(str).
  function parseD(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Date -> "YYYY-MM-DD".
  function iso(dt) {
    return dt.getFullYear() + '-' +
      String(dt.getMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getDate()).padStart(2, '0');
  }

  // Inclusive day count between two ISO dates (both endpoints counted), min 1.
  // Mirrors Code.gs inclusiveDays_ so the sync payload and the UI agree.
  function inclusiveDays(startISO, endISO) {
    const a = parseD(startISO), b = parseD(endISO);
    const days = Math.round((b - a) / 86400000) + 1;
    return days < 1 ? 1 : days;
  }

  // Map "YYYY-MM-DD" -> array of jobs covering that day (start_date..end_date).
  function dayMap(list) {
    const m = {};
    list.forEach(j => {
      let d = parseD(j.start_date);
      const end = parseD(j.end_date);
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        const k = iso(d);
        (m[k] = m[k] || []).push(j);
      }
    });
    return m;
  }

  // Set of job_reference values that share a calendar day with another job — a
  // scheduling clash (two installs/visits on the same day).
  function clashRefs(list) {
    const dm = dayMap(list), refs = new Set();
    Object.values(dm).forEach(arr => {
      if (arr.length >= 2) arr.forEach(j => refs.add(j.job_reference));
    });
    return refs;
  }

  // Google Calendar all-day events use an EXCLUSIVE end date -> add one day.
  function gcalStamp(dt) {
    return dt.getFullYear() +
      String(dt.getMonth() + 1).padStart(2, '0') +
      String(dt.getDate()).padStart(2, '0');
  }

  // Build a Google Calendar "create event" template link prefilled from a job.
  function gcalUrl(job) {
    const start = parseD(job.start_date);
    const endEx = parseD(job.end_date); endEx.setDate(endEx.getDate() + 1);
    const title = (job.job_reference ? job.job_reference + ' — ' : '') +
      (job.client_name || 'Job');
    const details = [];
    if (job.job_summary) details.push(job.job_summary);
    if (job.stage) details.push('Stage: ' + job.stage);
    if (job.assigned_drafter) details.push('Drafter: ' + job.assigned_drafter);
    if (job.assigned_installer) details.push('Installer: ' + job.assigned_installer);
    if (job.contact_name) details.push('Contact: ' + job.contact_name);
    if (job.contact_phone) details.push('Phone: ' + job.contact_phone);
    if (job.contact_email) details.push('Email: ' + job.contact_email);
    if (job.pdf_links && job.pdf_links.length) details.push('Files: ' + job.pdf_links.join('  '));
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: gcalStamp(start) + '/' + gcalStamp(endEx),
      details: details.join('\n'),
      location: job.site_address || ''
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  return { parseD, iso, inclusiveDays, dayMap, clashRefs, gcalStamp, gcalUrl };
});
