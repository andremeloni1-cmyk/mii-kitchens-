'use strict';
/*
 * server/auth.js — session login + role guards.
 * Passwords are bcrypt hashes in employees.password_hash. The logged-in
 * employee id is kept in the signed session cookie (req.session.uid).
 */
const bcrypt = require('bcryptjs');
const db = require('./db');

// Look up the active employee for a login email.
async function findByEmail(email) {
  return db.queryOne(
    'SELECT id, full_name, employee_code, role, email, password_hash, color, active ' +
    'FROM employees WHERE email = :email AND active = 1',
    { email: String(email || '').trim().toLowerCase() }
  );
}

async function findById(id) {
  return db.queryOne(
    'SELECT id, full_name, employee_code, role, email, color, active ' +
    'FROM employees WHERE id = :id AND active = 1',
    { id }
  );
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain || ''), hash);
}

async function hashPassword(plain) {
  return bcrypt.hash(String(plain || ''), 10);
}

// Attaches req.user (the current employee) if logged in. Routes decide whether
// that's required via requireAuth / requireRole below.
async function loadUser(req, _res, next) {
  try {
    if (req.session && req.session.uid) {
      req.user = await findById(req.session.uid);
    }
    next();
  } catch (e) { next(e); }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

// requireRole('admin') or requireRole('admin', 'drafter')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

// Public shape of the current user (never expose password_hash).
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, full_name: u.full_name, employee_code: u.employee_code,
    role: u.role, email: u.email, color: u.color
  };
}

module.exports = {
  findByEmail, findById, verifyPassword, hashPassword,
  loadUser, requireAuth, requireRole, publicUser
};
