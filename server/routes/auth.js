'use strict';
const express = require('express');
const auth = require('../auth');
const db = require('../db');

const router = express.Router();

// POST /api/auth/login { email, password }
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const emp = await auth.findByEmail(email);
    const ok = emp && await auth.verifyPassword(password, emp.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    req.session.uid = emp.id;
    res.json({ user: auth.publicUser(emp) });
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
