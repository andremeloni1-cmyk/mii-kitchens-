'use strict';
/*
 * Validates the per-job payload Code.gs builds (parseInstall_) before POSTing
 * to /api/sync — the shape and invariants the server relies on.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./load-code');

const code = loadCode();
const STAGES = ['check_measure', 'drafting', 'review', 'client_signoff', 'production', 'install', 'maintenance', 'complete'];

function build(summary, description, start, end) {
  return code.parseInstall_(summary, description, start, end, code.DEFAULT_ROSTER);
}

test('parseInstall_ produces a well-formed job payload', () => {
  const j = build(
    'QU3190 Nuzzo kitchen install',
    'Drafter: Drafter Two\nInstaller: Lee\n📍 25 Llewellyn St\nFiles https://drive.google.com/file/X',
    '2026-07-01', '2026-07-03'
  );
  assert.strictEqual(j.job_reference, 'QU3190');
  assert.strictEqual(j.client_name, 'Nuzzo');
  assert.strictEqual(j.company, 'Mii Kitchens');
  assert.strictEqual(j.site_address, '25 Llewellyn St');
  assert.strictEqual(j.stage, 'install');
  assert.strictEqual(j.assigned_drafter, 'DRAFT-TWO');
  assert.strictEqual(j.assigned_installer, 'INST-LEE');
  assert.deepStrictEqual(Array.from(j.pdf_links), ['https://drive.google.com/file/X']);
});

test('every payload has a valid stage and consistent days_required', () => {
  const samples = [
    build('QU100 Smith install', '', '2026-07-01', '2026-07-01'),
    build('Check measure Jones', '', '2026-08-10', '2026-08-10'),
    build('Drafting Brown kitchen', '', '2026-09-01', '2026-09-05')
  ];
  samples.forEach(j => {
    assert.ok(STAGES.includes(j.stage), 'stage in enum: ' + j.stage);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(j.start_date));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(j.end_date));
    assert.ok(j.end_date >= j.start_date);
    assert.strictEqual(j.days_required, code.inclusiveDays_(j.start_date, j.end_date));
    assert.ok(j.job_reference && j.job_reference.length);
  });
});

test('no reference falls back to a client slug', () => {
  const j = build('Henderson kitchen install', '', '2026-07-01', '2026-07-01');
  assert.strictEqual(j.job_reference, 'SLUG-HENDERSON');
});
