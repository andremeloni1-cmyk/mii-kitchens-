'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./load-code');

const code = loadCode();

test('isInstallEvent_ accepts pipeline events, rejects personal ones', () => {
  assert.ok(code.isInstallEvent_('QU3190 Nuzzo install', ''));
  assert.ok(code.isInstallEvent_('Check measure — Smith', ''));
  assert.ok(code.isInstallEvent_('Drafting Jones kitchen', ''));
  assert.ok(code.isInstallEvent_('Anything', 'Company: Mii Kitchens'));
  assert.ok(!code.isInstallEvent_('Lunch with family', ''));
  assert.ok(!code.isInstallEvent_('Dentist', ''));
});

test('classifyStage_ maps keywords to the stage enum', () => {
  assert.strictEqual(code.classifyStage_('Check measure Smith', ''), 'check_measure');
  assert.strictEqual(code.classifyStage_('Client sign-off', ''), 'client_signoff');
  assert.strictEqual(code.classifyStage_('Design review', ''), 'review');
  assert.strictEqual(code.classifyStage_('Drafting Jones', ''), 'drafting');
  assert.strictEqual(code.classifyStage_('Production run', ''), 'production');
  assert.strictEqual(code.classifyStage_('Maintenance defect callback', ''), 'maintenance');
  assert.strictEqual(code.classifyStage_('QU3190 install', ''), 'install');
  assert.strictEqual(code.classifyStage_('QU3190 Nuzzo', ''), 'install'); // default
});

test('extractQU_ normalises the reference', () => {
  assert.strictEqual(code.extractQU_('qu 3190'), 'QU3190');
  assert.strictEqual(code.extractQU_('Job QU456 here'), 'QU456');
  assert.strictEqual(code.extractQU_('no ref'), '');
});

test('extractAssignee_ + resolveEmployeeCode_ map labelled lines to codes', () => {
  const who = code.extractAssignee_('Drafter: Drafter One\nInstaller: Sam the installer');
  assert.strictEqual(who.drafter, 'Drafter One');
  assert.strictEqual(who.installer, 'Sam the installer');
  assert.strictEqual(code.resolveEmployeeCode_(who.drafter, code.DEFAULT_ROSTER), 'DRAFT-ONE');
  assert.strictEqual(code.resolveEmployeeCode_(who.installer, code.DEFAULT_ROSTER), 'INST-SAM');
  assert.strictEqual(code.resolveEmployeeCode_('nobody', code.DEFAULT_ROSTER), '');
});

test('extractAddress_ decodes a maps URL and handles plain text', () => {
  assert.strictEqual(code.extractAddress_('📍 25 Llewellyn St\nmore'), '25 Llewellyn St');
  assert.strictEqual(
    code.extractAddress_('📍 https://maps.google.com/?q=25+Llewellyn+St+Balmain'),
    '25 Llewellyn St Balmain'
  );
});

test('extractDriveLinks_ dedupes (cross-realm safe compare)', () => {
  const links = code.extractDriveLinks_('a https://drive.google.com/file/AAA b https://drive.google.com/file/AAA');
  assert.deepStrictEqual(Array.from(links), ['https://drive.google.com/file/AAA']);
});

test('deriveClient_ strips refs/keywords; slug_ + inclusiveDays_ behave', () => {
  assert.strictEqual(code.deriveClient_('QU3190 - Nuzzo Kitchen install'), 'Nuzzo');
  assert.strictEqual(code.slug_('Lara & Vytautas'), 'LARA-VYTAUTAS');
  assert.strictEqual(code.inclusiveDays_('2026-06-15', '2026-06-25'), 11);
  assert.strictEqual(code.inclusiveDays_('2026-06-15', '2026-06-15'), 1);
});
