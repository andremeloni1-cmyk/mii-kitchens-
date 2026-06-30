'use strict';
const express = require('express');
const { requireRole } = require('../auth');
const db = require('../db');
const jobsRepo = require('../jobsRepo');

const router = express.Router();

const STAGES = ['check_measure', 'drafting', 'review', 'client_signoff', 'production', 'install', 'maintenance', 'complete'];
const STATUSES = ['Pending', 'Approved', 'Scheduled', 'Declined'];

// POST /api/assign — admin assigns a drafter/installer and/or moves the stage.
// Body: { job_reference, assigned_drafter?, assigned_installer?, stage?, status? }
// Pass an empty string to clear an assignment; omit a field to leave it.
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const job = await jobsRepo.getByReference(b.job_reference);
    if (!job) return res.status(404).json({ error: 'not_found' });

    const sets = [], params = { ref: b.job_reference };

    if ('assigned_drafter' in b) {
      sets.push('assigned_drafter_id = :drafterId');
      params.drafterId = b.assigned_drafter ? await jobsRepo.employeeIdByCode(b.assigned_drafter) : null;
    }
    if ('assigned_installer' in b) {
      sets.push('assigned_installer_id = :installerId');
      params.installerId = b.assigned_installer ? await jobsRepo.employeeIdByCode(b.assigned_installer) : null;
    }
    if ('stage' in b) {
      if (!STAGES.includes(b.stage)) return res.status(400).json({ error: 'bad_stage' });
      sets.push('stage = :stage'); params.stage = b.stage;
    }
    if ('status' in b) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'bad_status' });
      sets.push('status = :status'); params.status = b.status;
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });

    await db.execute('UPDATE jobs SET ' + sets.join(', ') + ' WHERE job_reference = :ref', params);
    res.json({ job: await jobsRepo.getByReference(b.job_reference) });
  } catch (e) { next(e); }
});

module.exports = router;
