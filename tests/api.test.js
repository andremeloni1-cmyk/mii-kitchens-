'use strict';
/*
 * API smoke tests that need no database — they exercise the auth gate and the
 * sync secret guard, which reject the request before any DB call. (Full CRUD
 * paths are exercised manually against a test MySQL; see deploy/DEPLOY.md.)
 */
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.SYNC_SECRET = process.env.SYNC_SECRET || 'test-secret';
const app = require('../server/index.js');

test('GET /api/auth/me is 401 when not logged in', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
});

test('GET /api/jobs is 401 when not logged in', async () => {
  const res = await request(app).get('/api/jobs');
  assert.strictEqual(res.status, 401);
});

test('POST /api/assign is 401 when not logged in', async () => {
  const res = await request(app).post('/api/assign').send({ job_reference: 'X' });
  assert.strictEqual(res.status, 401);
});

test('POST /api/sync without the shared secret is 401', async () => {
  const res = await request(app).post('/api/sync').send({ jobs: [] });
  assert.strictEqual(res.status, 401);
});

test('POST /api/sync with a wrong secret is 401', async () => {
  const res = await request(app).post('/api/sync').set('X-Sync-Secret', 'nope').send({ jobs: [] });
  assert.strictEqual(res.status, 401);
});

test('unknown /api route is a JSON 404', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, 'not_found');
});
