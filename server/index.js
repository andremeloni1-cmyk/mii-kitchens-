'use strict';
/*
 * server/index.js — the Mii Kitchens Hub web app.
 * Serves the static dashboard (public/) + shared logic (shared/) and the JSON
 * API under /api. Sessions are signed cookies; nginx terminates TLS in front.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { loadUser } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind nginx

app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'mhub.sid',
  secret: process.env.SESSION_SECRET || 'dev-insecure-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: 1000 * 60 * 60 * 12 // 12h
  }
}));

// Make the current employee available to every request (req.user).
app.use(loadUser);

// API — auth router also exposes /api/auth/me and /api/auth/employees.
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/assign', require('./routes/assign'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/sync', require('./routes/sync'));

// Unknown API routes -> JSON 404 (don't fall through to static).
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Static assets (dashboard + shared libs).
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Central error handler -> JSON 500 (logs server-side).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// Boot the HTTP server (optionally creating/upgrading the schema first on
// managed/no-shell hosts). Called by the root index.js entry point and when
// this file is run directly; the test suite imports `app` without starting it.
function start() {
  const port = Number(process.env.PORT || 3000);
  const listen = () => app.listen(port, () => console.log('Mii Kitchens Hub listening on :' + port));
  if (process.env.AUTO_MIGRATE === '1') {
    return require('./migrate').runMigrations()
      .then(() => { console.log('Schema applied (AUTO_MIGRATE).'); listen(); })
      .catch((e) => { console.error('AUTO_MIGRATE failed (starting anyway):', e.message); listen(); });
  }
  return listen();
}

module.exports = app;
module.exports.start = start;

if (require.main === module) start();
