'use strict';
/*
 * server/routes/sync.js — upsert endpoint the Google Apps Script POSTs to.
 * Guarded by a shared secret (X-Sync-Secret) rather than a user session.
 *
 * Preserves human decisions: on an existing job we refresh only the
 * calendar-derived fields (dates, address, summary, links, contact). Stage and
 * status are left untouched, and assignments are only FILLED IN when empty
 * (COALESCE) — never overwritten.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const jobsRepo = require('../jobsRepo');

const router = express.Router();

const STAGES = ['check_measure', 'drafting', 'review', 'client_signoff', 'production', 'install', 'maintenance', 'complete'];

function secretOk(req) {
  const expected = process.env.SYNC_SECRET || '';
  const got = req.get('X-Sync-Secret') || '';
  if (!expected || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

router.post('/', async (req, res, next) => {
  try {
    if (!secretOk(req)) return res.status(401).json({ error: 'bad_secret' });
    const jobs = Array.isArray(req.body && req.body.jobs) ? req.body.jobs : [];
    let created = 0, updated = 0;

    for (const j of jobs) {
      if (!j || !j.job_reference) continue;
      const drafterId = j.assigned_drafter ? await jobsRepo.employeeIdByCode(j.assigned_drafter) : null;
      const installerId = j.assigned_installer ? await jobsRepo.employeeIdByCode(j.assigned_installer) : null;
      const stage = STAGES.includes(j.stage) ? j.stage : 'check_measure';
      const existing = await db.queryOne('SELECT id FROM jobs WHERE job_reference = :ref', { ref: j.job_reference });

      const common = {
        ref: j.job_reference,
        client_name: j.client_name || null,
        company: j.company || 'Mii Kitchens',
        site_address: j.site_address || null,
        contact_name: j.contact_name || null,
        contact_phone: j.contact_phone || null,
        contact_email: j.contact_email || null,
        job_summary: j.job_summary || null,
        pdf_links: JSON.stringify(j.pdf_links || []),
        is_tentative: j.is_tentative ? 1 : 0,
        start_date: j.start_date || null,
        end_date: j.end_date || null,
        days_required: j.days_required || 1,
        gcal_event_id: j.gcal_event_id || null,
        drafterId, installerId
      };

      if (!existing) {
        await db.execute(
          `INSERT INTO jobs
             (job_reference, client_name, company, site_address, contact_name, contact_phone, contact_email,
              job_summary, pdf_links, is_tentative, start_date, end_date, days_required, gcal_event_id,
              stage, assigned_drafter_id, assigned_installer_id)
           VALUES
             (:ref, :client_name, :company, :site_address, :contact_name, :contact_phone, :contact_email,
              :job_summary, :pdf_links, :is_tentative, :start_date, :end_date, :days_required, :gcal_event_id,
              :stage, :drafterId, :installerId)`,
          Object.assign({ stage }, common)
        );
        created++;
      } else {
        await db.execute(
          `UPDATE jobs SET
             client_name = :client_name, company = :company, site_address = :site_address,
             contact_name = :contact_name, contact_phone = :contact_phone, contact_email = :contact_email,
             job_summary = :job_summary, pdf_links = :pdf_links, is_tentative = :is_tentative,
             start_date = :start_date, end_date = :end_date, days_required = :days_required,
             gcal_event_id = COALESCE(:gcal_event_id, gcal_event_id),
             assigned_drafter_id   = COALESCE(assigned_drafter_id, :drafterId),
             assigned_installer_id = COALESCE(assigned_installer_id, :installerId)
           WHERE job_reference = :ref`,
          common
        );
        updated++;
      }
    }
    res.json({ ok: true, created, updated, received: jobs.length });
  } catch (e) { next(e); }
});

module.exports = router;
