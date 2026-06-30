'use strict';
const express = require('express');
const { requireAuth } = require('../auth');
const jobsRepo = require('../jobsRepo');

const router = express.Router();

// GET /api/jobs — role-scoped list for the board/agenda.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ jobs: await jobsRepo.listForUser(req.user) });
  } catch (e) { next(e); }
});

// GET /api/jobs/:ref — single job, only if the user may see it.
router.get('/:ref', requireAuth, async (req, res, next) => {
  try {
    const job = await jobsRepo.getByReference(req.params.ref);
    if (!jobsRepo.canView(req.user, job)) return res.status(404).json({ error: 'not_found' });
    res.json({ job });
  } catch (e) { next(e); }
});

module.exports = router;
