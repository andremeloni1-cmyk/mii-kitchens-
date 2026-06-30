'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const rooms = require('../shared/rooms.js');

test('parseRooms finds kitchen + laundry', () => {
  const r = rooms.parseRooms({ job_summary: 'Install kitchen and laundry cabinetry' });
  assert.ok(r.includes('Kitchen'));
  assert.ok(r.includes('Laundry'));
});

test('parseRooms pluralises vanities by count', () => {
  const r = rooms.parseRooms({ job_summary: 'Master ensuite x3 vanity install' });
  assert.ok(r.includes('Ensuite'));
  assert.ok(r.includes('Vanity 1'));
  assert.ok(r.includes('Vanity 2'));
  assert.ok(r.includes('Vanity 3'));
  assert.ok(!r.includes('Vanity 4'));
});

test('parseRooms distinguishes butler vs walk-in pantry', () => {
  assert.ok(rooms.parseRooms({ job_summary: "butlers pantry" }).includes("Butler's Pantry"));
  assert.ok(rooms.parseRooms({ job_summary: 'walk-in pantry' }).includes('Walk-in Pantry'));
  const plain = rooms.parseRooms({ job_summary: 'kitchen with a pantry' });
  assert.ok(plain.includes('Pantry'));
  assert.ok(!plain.includes("Butler's Pantry"));
});

test('parseRooms handles his/her robes separately', () => {
  const r = rooms.parseRooms({ job_summary: 'his robe and her robe in master' });
  assert.ok(r.includes('His Robe'));
  assert.ok(r.includes('Her Robe'));
  const generic = rooms.parseRooms({ job_summary: 'walk in robe' });
  assert.ok(generic.includes('Robe'));
});

test('parseRooms falls back to Kitchen when nothing matches', () => {
  assert.deepStrictEqual(rooms.parseRooms({ job_summary: 'general make-good visit' }), ['Kitchen']);
});

test('freshRoom seeds the default checklist undone', () => {
  const room = rooms.freshRoom('Kitchen');
  assert.strictEqual(room.name, 'Kitchen');
  assert.strictEqual(room.items.length, rooms.DEFAULT_CHECKLIST.length);
  assert.ok(room.items.every(it => it.done === false));
  assert.strictEqual(room.complete, false);
});
