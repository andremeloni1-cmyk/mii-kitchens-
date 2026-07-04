'use strict';
const express = require('express');
const crypto = require('crypto');
const auth = require('../auth');
const db = require('../db');

const router = express.Router();

function tokenMatches(provided, expected) {
  if (!expected || !provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// POST /api/auth/bootstrap { setup_token, email, password }
// One-time, no-shell admin setup for managed hosts. Inert unless SETUP_TOKEN is
// set in the environment. Sets (or resets) the password of an existing employee.
// Remove SETUP_TOKEN from the env once you've signed in.
router.post('/bootstrap', async (req, res, next) => {
  try {
    const expected = process.env.SETUP_TOKEN || '';
    if (!expected) return res.status(403).json({ error: 'setup_disabled' });
    const { setup_token, email, password } = req.body || {};
    if (!tokenMatches(setup_token, expected)) return res.status(403).json({ error: 'bad_token' });
    if (!email || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'need_email_and_password_min_8' });
    }
    const emp = await db.queryOne('SELECT id, full_name FROM employees WHERE email = :email',
      { email: String(email).trim().toLowerCase() });
    if (!emp) return res.status(404).json({ error: 'no_such_employee' });
    await db.execute('UPDATE employees SET password_hash = :h WHERE id = :id',
      { h: await auth.hashPassword(password), id: emp.id });
    res.json({ ok: true, full_name: emp.full_name });
  } catch (e) { next(e); }
});

// POST /api/auth/login { email, password }
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const emp = await auth.findByEmail(email);
    const ok = emp && await auth.verifyPassword(password, emp.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    // Regenerate the session on login to prevent session fixation (any pre-login
    // session id is discarded before we associate the account).
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.uid = emp.id;
      req.session.save((err2) => {
        if (err2) return next(err2);
        res.json({ user: auth.publicUser(emp) });
      });
    });
  } catch (e) { next(e); }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/me — the logged-in employee (or 401).
router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ user: auth.publicUser(req.user) });
});

// GET /api/employees — active team (codes + colours) for filters / assignment.
router.get('/employees', auth.requireAuth, async (_req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT employee_code, full_name, role, color FROM employees WHERE active = 1 ORDER BY role, full_name'
    );
    res.json({ employees: rows });
  } catch (e) { next(e); }
});

module.exports = router;
