'use strict';
/*
 * scripts/setpw.js — set (or reset) an employee's login password.
 *   node scripts/setpw.js <email> <password>
 * Run on the VPS after importing db/schema.sql to give the admin a password.
 */
require('dotenv').config();
const auth = require('../server/auth');
const db = require('../server/db');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node scripts/setpw.js <email> <password>');
    process.exit(1);
  }
  const emp = await db.queryOne('SELECT id, full_name FROM employees WHERE email = :email',
    { email: email.trim().toLowerCase() });
  if (!emp) { console.error('No employee with email: ' + email); process.exit(1); }
  const hash = await auth.hashPassword(password);
  await db.execute('UPDATE employees SET password_hash = :h WHERE id = :id', { h: hash, id: emp.id });
  console.log('Password updated for ' + emp.full_name + ' <' + email + '>.');
  await db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
