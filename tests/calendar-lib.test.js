'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const cal = require('../shared/calendar.js');

test('parseD / iso round-trip', () => {
  assert.strictEqual(cal.iso(cal.parseD('2026-07-01')), '2026-07-01');
  const d = cal.parseD('2026-02-09');
  assert.strictEqual(d.getMonth(), 1); // February (0-indexed)
  assert.strictEqual(d.getDate(), 9);
});

test('inclusiveDays counts both endpoints, min 1', () => {
  assert.strictEqual(cal.inclusiveDays('2026-06-15', '2026-06-25'), 11);
  assert.strictEqual(cal.inclusiveDays('2026-06-15', '2026-06-15'), 1);
  // defensive: reversed range clamps to 1
  assert.strictEqual(cal.inclusiveDays('2026-06-15', '2026-06-14'), 1);
});

test('dayMap spreads a multi-day job across every covered day', () => {
  const dm = cal.dayMap([{ job_reference: 'J1', start_date: '2026-07-01', end_date: '2026-07-03' }]);
  assert.deepStrictEqual(Object.keys(dm).sort(), ['2026-07-01', '2026-07-02', '2026-07-03']);
  assert.strictEqual(dm['2026-07-02'][0].job_reference, 'J1');
});

test('clashRefs flags jobs sharing a day, not isolated ones', () => {
  const refs = cal.clashRefs([
    { job_reference: 'A', start_date: '2026-07-01', end_date: '2026-07-02' },
    { job_reference: 'B', start_date: '2026-07-02', end_date: '2026-07-02' },
    { job_reference: 'C', start_date: '2026-07-10', end_date: '2026-07-10' }
  ]);
  assert.ok(refs.has('A'));
  assert.ok(refs.has('B'));
  assert.ok(!refs.has('C'));
});

test('gcalUrl builds an exclusive-end all-day template link with job fields', () => {
  const url = cal.gcalUrl({
    job_reference: 'QU3190', client_name: 'Nuzzo', company: 'Mii Kitchens',
    start_date: '2026-07-01', end_date: '2026-07-01', site_address: '25 Llewellyn St',
    stage: 'install', assigned_installer: 'INST-SAM'
  });
  assert.ok(url.startsWith('https://calendar.google.com/calendar/render?'));
  assert.ok(url.includes('action=TEMPLATE'));
  // single all-day event -> dates 20260701/20260702 (exclusive end)
  assert.ok(url.includes('dates=20260701%2F20260702'));
  assert.ok(/text=QU3190/.test(url));
  assert.ok(/Stage%3A\+install|Stage:\+install|Stage%3A%20install/.test(decodeURI(url)) || url.includes('install'));
});
