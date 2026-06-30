'use strict';
const express = require('express');
const { requireAuth, requireRole } = require('../auth');
const db = require('../db');
const jobsRepo = require('../jobsRepo');

const router = express.Router();

const TYPES = ['client_meeting', 'check_measure', 'install', 'review', 'internal'];

const MEETING_SELECT = `
  SELECT m.meeting_id, m.type, m.title, m.starts_at, m.ends_at, m.location,
         m.notes, m.gcal_event_id, j.job_reference, e.employee_code
  FROM meetings m
  LEFT JOIN jobs j      ON j.id = m.job_id
  LEFT JOIN employees e ON e.id = m.employee_id`;

function mapMeeting(r) {
  return {
    meeting_id: r.meeting_id, type: r.type, title: r.title,
    starts_at: r.starts_at, ends_at: r.ends_at, location: r.location || '',
    notes: r.notes || '', job_reference: r.job_reference || null,
    employee_code: r.employee_code || null, gcal_event_id: r.gcal_event_id || null
  };
}

// GET /api/meetings — admin sees all; others see only meetings assigned to them.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let where = '', params = {};
    if (req.user.role !== 'admin') { where = ' WHERE m.employee_id = :uid'; params = { uid: req.user.id }; }
    const rows = await db.query(MEETING_SELECT + where + ' ORDER BY m.starts_at', params);
    res.json({ meetings: rows.map(mapMeeting) });
  } catch (e) { next(e); }
});

// POST /api/meetings — admin creates/schedules a meeting.
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.title || !b.starts_at) return res.status(400).json({ error: 'missing_fields' });
    if (b.type && !TYPES.includes(b.type)) return res.status(400).json({ error: 'bad_type' });

    const jobId = b.job_reference
      ? (await db.queryOne('SELECT id FROM jobs WHERE job_reference = :ref', { ref: b.job_reference }))?.id || null
      : null;
    const empId = b.employee_code ? await jobsRepo.employeeIdByCode(b.employee_code) : null;
    const meetingId = b.meeting_id || ('M-' + Date.now() + '-' + Math.floor(Math.random() * 1e4));

    await db.execute(
      `INSERT INTO meetings (meeting_id, type, job_id, employee_id, title, starts_at, ends_at, location, notes, gcal_event_id)
       VALUES (:meeting_id, :type, :job_id, :employee_id, :title, :starts_at, :ends_at, :location, :notes, :gcal_event_id)`,
      {
        meeting_id: meetingId, type: b.type || 'client_meeting', job_id: jobId, employee_id: empId,
        title: b.title, starts_at: b.starts_at, ends_at: b.ends_at || null,
        location: b.location || null, notes: b.notes || null, gcal_event_id: b.gcal_event_id || null
      }
    );
    const row = await db.queryOne(MEETING_SELECT + ' WHERE m.meeting_id = :id', { id: meetingId });
    res.status(201).json({ meeting: mapMeeting(row) });
  } catch (e) { next(e); }
});

// DELETE /api/meetings/:meeting_id — admin removes a meeting.
router.delete('/:meeting_id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await db.execute('DELETE FROM meetings WHERE meeting_id = :id', { id: req.params.meeting_id });
    if (!result.affectedRows) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
