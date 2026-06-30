'use strict';
/*
 * server/db.js — MySQL connection pool + thin query helpers.
 * All callers use parameterised queries (mysql2 placeholders) — never string
 * concatenation — so the app is not exposed to SQL injection.
 */
const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'mii_hub',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'mii_hub',
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      dateStrings: true,
      timezone: 'Z'
    });
  }
  return pool;
}

// SELECT helper -> array of rows.
async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params || {});
  return rows;
}

// SELECT one -> first row or null.
async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

// INSERT/UPDATE/DELETE helper -> result metadata (insertId, affectedRows).
async function execute(sql, params) {
  const [result] = await getPool().execute(sql, params || {});
  return result;
}

async function close() {
  if (pool) { await pool.end(); pool = undefined; }
}

module.exports = { getPool, query, queryOne, execute, close };
