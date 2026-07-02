'use strict';
/*
 * server/index.js — the Mii Kitchens Hub web app.
 * Serves the static dashboard (public/) + shared logic (shared/) and the JSON
 * API under /api. Sessions are signed cookies; nginx terminates TLS in front.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const { loadUser, requireAuth } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind nginx

// Fail fast if the session secret isn't configured — never fall back to a
// hardcoded default (that would let anyone forge/replay session cookies).
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required — set it in .env before starting.');
}

// Baseline security headers on every response (no helmet dependency available).
// CSP permits inline script/style because the dashboard (public/*.html) relies
// on inline <script>/<style> and on* handlers; tighten if those are removed.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'mhub.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production',
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

// File uploads for the demo (check-measure photos, plan PDFs, report images).
// Accepts a base64 data URL as JSON, writes it to uploads/, returns the public
// URL. Kept intentionally simple (no multipart/multer) so the demo front-end
// can POST straight from a FileReader result and fall back to an inline data
// URL if this endpoint is ever unreachable.
const uploadsDir = path.join(__dirname, '..', 'uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_e) { /* noop */ }
const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/heic': 'heic', 'application/pdf': 'pdf'
};
app.post('/api/upload', requireAuth, express.json({ limit: '35mb' }), (req, res) => {
  const data = req.body && req.body.data;
  const m = typeof data === 'string' && data.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return res.status(400).json({ error: 'bad_upload' });
  const mime = m[1];
  // Strict allowlist: only known image/PDF types. No client-derived extensions
  // (an .html fallback would let an authed user store active content on-origin).
  const ext = EXT_BY_MIME[mime];
  if (!ext) return res.status(400).json({ error: 'unsupported_type' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 35 * 1024 * 1024) return res.status(413).json({ error: 'too_large' });
  const name = crypto.randomBytes(9).toString('hex') + '.' + ext;
  try {
    fs.writeFileSync(path.join(uploadsDir, name), buf);
  } catch (e) {
    console.error('upload write failed', e);
    return res.status(500).json({ error: 'write_failed' });
  }
  res.json({ url: '/uploads/' + name });
});

// Unknown API routes -> JSON 404 (don't fall through to static).
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Static assets (dashboard + shared libs + uploaded files).
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '1y', immutable: true,
  // Never render uploaded files inline as active content on our origin.
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
  }
}));
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
  // Bind to loopback only — nginx proxies to 127.0.0.1:3000 (see deploy/nginx.conf.sample).
  const listen = () => app.listen(port, '127.0.0.1', () => console.log('Mii Kitchens Hub listening on :' + port));
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
