'use strict';
/*
 * server/migrate.js — apply db/schema.sql to the configured database.
 * The schema is idempotent (CREATE TABLE IF NOT EXISTS / INSERT IGNORE), so
 * this is safe to run on every boot. Used by managed hosts (e.g. Hostinger's
 * Git import) where there's no shell to run the schema by hand: set AUTO_MIGRATE=1
 * and the server applies it on startup. Also runnable directly: `npm run migrate`.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  // A blank password is fine locally, but never in production.
  if (process.env.NODE_ENV === 'production' && !process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD is required in production — set it in .env.');
  }
  // A dedicated connection with multipleStatements — NOT the app pool, which
  // keeps multipleStatements off for safety.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'mii_hub',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mii_hub',
    multipleStatements: true
  });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => { console.log('Migrations applied.'); process.exit(0); })
    .catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
}

module.exports = { runMigrations };
