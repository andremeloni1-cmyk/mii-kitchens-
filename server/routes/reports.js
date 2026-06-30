'use strict';
const express = require('express');
const { requireAuth } = require('../auth');
const db = require('../db');

const router = express.Router();

const REPORT_SELECT = `
  SELECT r.report_id, r.job_reference, r.technician_name, r.report_date,
         r.send_to, r.rooms, r.overall_notes, r.status, r.sent_at,
         e.employee_code, e.full_name AS employee_name
  FROM reports r
  LEFT JOIN employees e ON e.id = r.employee_id`;

function mapReport(r) {
  if (!r) return null;
  return {
    report_id: r.report_id, job_reference: r.job_reference,
    technician_name: r.technician_name || '', report_date: r.report_date,
    send_to: r.send_to || '', rooms: Array.isArray(r.rooms) ? r.rooms : (r.rooms ? safeJson(r.rooms) : []),
    overall_notes: r.overall_notes || '', status: r.status, sent_at: r.sent_at,
    employee_code: r.employee_code || null, employee_name: r.employee_name || null
  };
}
function safeJson(v) { try { return JSON.parse(v); } catch (_) { return []; } }

// GET /api/reports                 -> admin: all reports; others: their own
// GET /api/reports?job_reference=X -> the current user's report for that job
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const ref = req.query.job_reference;
    if (ref) {
      const row = await db.queryOne(
        REPORT_SELECT + ' WHERE r.job_reference = :ref AND r.employee_id = :uid',
        { ref, uid: req.user.id }
      );
      return res.json({ report: mapReport(row) });
    }
    let where = '', params = {};
    if (req.user.role !== 'admin') { where = ' WHERE r.employee_id = :uid'; params = { uid: req.user.id }; }
    const rows = await db.query(REPORT_SELECT + where + ' ORDER BY r.updated_at DESC', params);
    res.json({ reports: rows.map(mapReport) });
  } catch (e) { next(e); }
});

// POST /api/reports — upsert the current user's report for a job.
// Body: { job_reference, report_date, send_to, rooms[], overall_notes, status? }
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const job = await db.queryOne('SELECT id FROM jobs WHERE job_reference = :ref', { ref: b.job_reference });
    if (!job) return res.status(404).json({ error: 'job_not_found' });

    // Deterministic id keyed by job + author, so saving repeatedly updates one row.
    const reportId = 'R-' + b.job_reference + '-' + req.user.employee_code;
    const status = b.status === 'sent' ? 'sent' : 'draft';

    await db.execute(
      `INSERT INTO reports
         (report_id, job_id, job_reference, employee_id, technician_name, report_date, send_to, rooms, overall_notes, status, sent_at)
       VALUES (:report_id, :job_id, :job_reference, :uid, :technician_name, :report_date, :send_to, :rooms, :overall_notes, :status, :sent_at)
       ON DUPLICATE KEY UPDATE
         technician_name = VALUES(technician_name), report_date = VALUES(report_date),
         send_to = VALUES(send_to), rooms = VALUES(rooms), overall_notes = VALUES(overall_notes),
         status = VALUES(status), sent_at = VALUES(sent_at)`,
      {
        report_id: reportId, job_id: job.id, job_reference: b.job_reference, uid: req.user.id,
        technician_name: b.technician_name || req.user.full_name, report_date: b.report_date || null,
        send_to: b.send_to || null, rooms: JSON.stringify(b.rooms || []),
        overall_notes: b.overall_notes || null, status,
        sent_at: status === 'sent' ? new Date() : null
      }
    );
    const row = await db.queryOne(REPORT_SELECT + ' WHERE r.report_id = :id', { id: reportId });
    res.json({ report: mapReport(row) });
  } catch (e) { next(e); }
});

// POST /api/reports/:report_id/sent — mark a report sent (author or admin).
router.post('/:report_id/sent', requireAuth, async (req, res, next) => {
  try {
    const row = await db.queryOne('SELECT employee_id FROM reports WHERE report_id = :id', { id: req.params.report_id });
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && row.employee_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    await db.execute('UPDATE reports SET status = :s, sent_at = :t WHERE report_id = :id',
      { s: 'sent', t: new Date(), id: req.params.report_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
