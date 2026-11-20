// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The boards' rate limit (the leaderboard Worker's checkRate: the score and
// share buckets) on real SQLite (tools/d1_sqlite.mjs), in process:
//   - it still holds RATE_SCORE_MAX score posts and RATE_SHARE_MAX shares an
//     hour per client, the two apart;
//   - it stores no address: a client is an HMAC of its address and the hour
//     under RATE_KEY ('hmac:'), or without the secret a SHA-256 ('sha:'), a
//     new one each hour and each secret;
//   - a client's first post of an hour deletes the rows of earlier hours (any
//     bucket, and the bare-hour and raw-address rows from before), at most
//     200 a time, and none of this hour's;
//   - migrate-rate-limit.sql deletes the raw-address rows and nothing else,
//     and runs twice.
// tools/test_leaderboard_counts.mjs and tools/test_leaderboard_track_boards.mjs
// hold the same on wrangler dev (real D1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE_SCORE_MAX, RATE_SHARE_MAX, rateWindowId } from '../sim-retention.js';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';
import { sqliteD1 } from './d1_sqlite.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ORIGIN = 'https://quadmath.com';

function worker(vars = { RATE_KEY: 'test-rate-key' }) {
  const DB = sqliteD1();
  const env = { DB, ALLOWED_ORIGIN: ORIGIN, ...vars };
  // A score post that the limit counts and the body then refuses (BAD JSON):
  // checkRate runs first, as for every real submit.
  const score = async (ip) => {
    const r = await handleLeaderboard(new Request('https://w.test/api/submit', { method: 'POST', headers: { 'CF-Connecting-IP': ip, Origin: ORIGIN }, body: '{' }), env);
    return (await r.json()).reason;
  };
  const share = async (ip) => {
    const r = await handleLeaderboard(new Request('https://w.test/api/line', { method: 'POST', headers: { 'CF-Connecting-IP': ip, Origin: ORIGIN }, body: '{' }), env);
    return (await r.json()).reason;
  };
  return { DB, env, score, share, rows: () => DB.rows('SELECT ip, window, n FROM rate_limit ORDER BY window, ip') };
}

test('the limits hold as before: RATE_SCORE_MAX score posts and RATE_SHARE_MAX shares an hour per client', async () => {
  const w = worker();
  for (let i = 0; i < RATE_SCORE_MAX; i++) assert.equal(await w.score('203.0.113.1'), 'BAD JSON', 'post ' + (i + 1));
  assert.equal(await w.score('203.0.113.1'), 'RATE LIMIT');
  assert.equal(await w.score('203.0.113.2'), 'BAD JSON', 'another client');
  for (let i = 0; i < RATE_SHARE_MAX; i++) assert.equal(await w.share('203.0.113.1'), 'BAD JSON', 'share ' + (i + 1));
  assert.equal(await w.share('203.0.113.1'), 'RATE LIMIT', 'shares have their own budget');
});

test('no address stored: an hourly HMAC under RATE_KEY, a SHA-256 without it', async (t) => {
  const w = worker();
  await w.score('198.51.100.7');
  await w.share('198.51.100.7');
  const rows = w.rows();
  assert.equal(rows.length, 2);
  for (const r of rows) assert.match(r.ip, /^hmac:[0-9a-f]{32}$/, r.ip);
  assert.deepEqual(rows.map((r) => r.window.split(':')[0]).sort(), ['score', 'share']);
  assert.notEqual(rows[0].ip, rows[1].ip, 'per bucket');
  assert.ok(!JSON.stringify(w.DB.rows('SELECT * FROM rate_limit')).includes('198.51.100.7'));
  // Another secret, another key.
  const o = worker({ RATE_KEY: 'another' });
  await o.score('198.51.100.7');
  assert.notEqual(o.rows()[0].ip, rows.find((r) => r.window.startsWith('score:')).ip);
  // No secret yet: a plain hash, never the address.
  const n = worker({});
  await n.score('198.51.100.7');
  assert.match(n.rows()[0].ip, /^sha:[0-9a-f]{32}$/);
  // Another hour, another key for the same client.
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + 3600_000;
  await w.score('198.51.100.7');
  const now = w.rows().filter((r) => r.window.endsWith(rateWindowId(Date.now())));
  assert.equal(now.length, 1);
  assert.ok(!rows.some((r) => r.ip === now[0].ip), 'a new key each hour');
});

test('pruning: a client\'s first post of an hour deletes earlier hours\' rows, 200 at most, never this hour\'s', async () => {
  const w = worker();
  const hour = rateWindowId(Date.now());
  const old = '2020-01-01T00';
  const insert = w.DB.sqlite.prepare('INSERT INTO rate_limit (ip, window, n) VALUES (?, ?, ?)');
  // The backlog from before: raw addresses, bare-hour windows, both buckets.
  for (let i = 0; i < 300; i++) insert.run('192.0.2.' + (i % 250) + '#' + i, 'score:' + old, 1);
  for (let i = 0; i < 100; i++) insert.run('192.0.2.' + i, old, 2);
  for (let i = 0; i < 50; i++) insert.run('192.0.2.' + i, 'share:' + old, 1);
  // This hour's, already there (another client).
  insert.run('hmac:' + 'a'.repeat(32), 'score:' + hour, 5);
  assert.equal(w.rows().length, 451);
  await w.score('203.0.113.50');   // a new client-hour: prunes 200
  assert.equal(w.rows().length, 451 + 1 - 200);
  await w.score('203.0.113.50');   // the same client again: no prune
  assert.equal(w.rows().length, 252);
  await w.score('203.0.113.51');   // another new client-hour: 200 more
  await w.score('203.0.113.52');   // and the last 50
  const left = w.rows();
  assert.equal(left.length, 4, JSON.stringify(left.slice(0, 5)));
  assert.ok(left.every((r) => r.window.endsWith(hour)), 'only this hour\'s rows are left');
  assert.ok(left.some((r) => r.ip === 'hmac:' + 'a'.repeat(32) && r.n === 5), 'this hour\'s rows kept');
  assert.ok(!left.some((r) => /^192\./.test(r.ip)), 'no raw address left');
});

test('a prune that fails is housekeeping: the post goes on', async () => {
  const w = worker();
  const prepare = w.DB.prepare;
  w.DB.prepare = (sql) => (/^DELETE FROM rate_limit/.test(sql) ? { bind: () => ({ run: async () => { throw new Error('D1_ERROR'); } }) } : prepare(sql));
  assert.equal(await w.score('203.0.113.60'), 'BAD JSON');
});

test('migrate-rate-limit.sql: deletes the raw-address rows, keeps the hashed, runs twice', () => {
  const sql = readFileSync(join(root, 'workers/sim-leaderboard/src/migrate-rate-limit.sql'), 'utf8');
  const stmts = sql.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
  assert.deepEqual(stmts, ["DELETE FROM rate_limit WHERE ip NOT LIKE 'hmac:%' AND ip NOT LIKE 'sha:%'"]);
  const db = sqliteD1();
  db.exec("INSERT INTO rate_limit (ip, window, n) VALUES ('203.0.113.9', 'score:2026-11-01T10', 3), ('2001:db8::1', '2026-11-01T10', 1), ('hmac:" + 'b'.repeat(32) + "', 'score:2026-11-20T10', 2), ('sha:" + 'c'.repeat(32) + "', 'share:2026-11-20T10', 1)");
  db.exec("INSERT INTO lines (id, code, created_ms) VALUES ('x', 'y', 1)");
  db.exec(sql);
  db.exec(sql);
  assert.deepEqual(db.rows('SELECT ip FROM rate_limit ORDER BY ip').map((r) => r.ip), ['hmac:' + 'b'.repeat(32), 'sha:' + 'c'.repeat(32)]);
  assert.deepEqual(db.rows('SELECT id FROM lines'), [{ id: 'x' }], 'nothing else touched');
});
