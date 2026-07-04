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
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
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

test('POST /api/auth/bootstrap is disabled when SETUP_TOKEN is unset', async () => {
  delete process.env.SETUP_TOKEN;
  const res = await request(app).post('/api/auth/bootstrap')
    .send({ setup_token: 'x', email: 'a@b.c', password: 'whatever1' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'setup_disabled');
});

test('POST /api/auth/bootstrap rejects a wrong setup token (before any DB call)', async () => {
  process.env.SETUP_TOKEN = 'the-right-token';
  const res = await request(app).post('/api/auth/bootstrap')
    .send({ setup_token: 'the-wrong-token!', email: 'a@b.c', password: 'whatever1' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'bad_token');
  delete process.env.SETUP_TOKEN;
});
