// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The leaderboard Worker's custom track boards on real D1, under wrangler dev:
// POST /api/track/submit and GET /api/track/board as deployed, on a local D1
// made from schema.sql (tools/sim_rooms_dev.mjs startLeaderboardDev).
//   - A run lands, a pilot's best is kept (slower: kept; faster: replaced, by
//     the real ON CONFLICT ... WHERE upsert), the board by key and class.
//   - The rate limit (12 posts an IP an hour, shared with /api/submit), a bad
//     token, a name another browser holds, fewer than 3 gates, a code past
//     CUSTOM_TRACK_CODE_MAX, a ghost that misses a gate, a forged key in the
//     body or in the query: refused, and a refused run writes no track row.
//   - migrate-track-boards.sql runs twice on a database that has the tables
//     and leaves scores as it was.
// Needs wrangler: workers/sim-rooms' or workers/sim-leaderboard's own
// (npm install there), or WRANGLER=<path to bin/wrangler.js>. Without one it
// skips (CI's sim-tests job installs none). The same routes in process, on an
// in-memory D1: tools/test_sim_track_boards.mjs.
//   node tools/test_leaderboard_track_boards.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findWrangler, startLeaderboardDev, leaderboardWorkerDir } from './sim_rooms_dev.mjs';
import { PHYS_VER, customBoardKey, customTrackCode, RATE_SCORE_MAX } from '../sim-retention.js';
import { builtTrack, hugeTrack, flownRun, hoverRun, pilotToken, submitBody } from './track_boards_fixture.mjs';

const DB = 'quadmath-sim-leaderboard';
const ORIGIN = 'https://quadmath.com';
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };

// SQL on the local D1 in persist (wrangler d1 execute --json): the rows.
function d1(bin, persist, args) {
  const r = spawnSync(process.execPath, [bin, 'd1', 'execute', DB, '--local', '--persist-to', persist, '--yes', ...args],
    { cwd: leaderboardWorkerDir, env: ENV, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, 'wrangler d1 execute ' + args.join(' ') + ':\n' + (r.stdout + r.stderr).slice(-1500));
  return r;
}
function rows(bin, persist, sql) {
  const r = d1(bin, persist, ['--command', sql, '--json']);
  const out = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
  return out[0].results;
}

test('custom track boards on wrangler dev (real D1)', { timeout: 300000 }, async (t) => {
  const bin = findWrangler();
  if (!bin) { t.skip('no wrangler (npm install in workers/sim-rooms or workers/sim-leaderboard, or WRANGLER=)'); return; }
  const w = await startLeaderboardDev(bin, { ALLOWED_ORIGIN: ORIGIN });
  // A wrangler d1 execute on the persist dir while dev runs can drop the next
  // connection (ECONNRESET): a network error, never a status, is tried again once.
  const fetch = async (url, init) => {
    try { return await globalThis.fetch(url, init); }
    catch (e) { await new Promise((r) => setTimeout(r, 500)); return globalThis.fetch(url, init); }
  };
  const post = (body, ip) => fetch(w.base + '/api/track/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));
  const board = (key, cls = 65) => fetch(w.base + '/api/track/board?key=' + encodeURIComponent(key) + '&class=' + cls, { headers: { Origin: ORIGIN } })
    .then(async (r) => ({ status: r.status, json: await r.json() }));
  const track = builtTrack(4);
  const key = await customBoardKey(track);
  try {
    await t.test('a run lands; the pilot\'s best is kept; the board by key and class', async () => {
      let r = await post(submitBody(track, flownRun(track, { speed: 5 })), '203.0.113.10');
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.ok, true);
      assert.equal(r.json.improved, true);
      assert.equal(r.json.key, key);
      const first = r.json.timeMs;
      r = await post(submitBody(track, flownRun(track, { speed: 4 })), '203.0.113.10');
      assert.deepEqual([r.json.ok, r.json.improved, r.json.timeMs], [true, false, first], 'slower: the best stays');
      r = await post(submitBody(track, flownRun(track, { speed: 7 })), '203.0.113.10');
      assert.equal(r.json.improved, true);
      assert.ok(r.json.timeMs < first);
      const best = r.json.timeMs;
      const shared = { ...track, id: 'custom-shared-xyz', name: 'Copy' };
      r = await post(submitBody(shared, flownRun(shared, { speed: 6, name: 'Kim' }), { name: 'Kim', token: pilotToken('k') }), '203.0.113.11');
      assert.equal(r.json.ok, true, JSON.stringify(r.json));
      assert.equal(r.json.key, key, 'the same gates under another id: the same board');
      r = await board(key);
      assert.equal(r.status, 200);
      assert.equal(r.json.online, true);
      assert.deepEqual(r.json.entries.map((e) => e.name), ['RyFly', 'Kim']);
      assert.equal(r.json.entries[0].timeMs, best);
      assert.deepEqual((await board(key, 75)).json.entries, []);
      // In D1: one track row (its code and gate count), the two pilots' best.
      const tr = rows(bin, w.persist, 'SELECT key, map, gates, code FROM custom_tracks');
      assert.deepEqual(tr.map((x) => [x.key, x.map, x.gates]), [[key, 'rig', 4]]);
      assert.equal(tr[0].code, customTrackCode(track), 'the first run\'s track');
      const sc = rows(bin, w.persist, `SELECT name, time_ms FROM custom_scores WHERE key = '${key}' AND class = 65 ORDER BY time_ms`);
      assert.deepEqual(sc.map((x) => [x.name, x.time_ms]), [['RyFly', best], ['Kim', r.json.entries[1].timeMs]]);
      assert.equal(rows(bin, w.persist, 'SELECT COUNT(*) AS n FROM scores')[0].n, 0, 'the weekly scores table untouched');
    });

    await t.test('refused: a bad token, a taken name, fewer than 3 gates, a code past the cap, a missed gate, a forged key; nothing written', async () => {
      const ip = '198.51.100.20';
      const refused = async (body, status, reason) => {
        const r = await post(body, ip);
        assert.equal(r.status, status, reason + ' ' + JSON.stringify(r.json));
        assert.equal(r.json.reason, reason);
      };
      const before = rows(bin, w.persist, 'SELECT COUNT(*) AS n FROM custom_tracks')[0].n;
      const two = builtTrack(2, { id: 'custom-two' });
      await refused(submitBody(two, flownRun(two)), 400, 'TOO FEW GATES');
      const huge = hugeTrack();
      await refused(submitBody(huge, flownRun(huge)), 400, 'TRACK TOO BIG');
      const other = builtTrack(5, { id: 'custom-five' });
      await refused(submitBody(other, flownRun(other, { skip: 2 })), 400, 'INCOMPLETE LINE');
      await refused({ ...submitBody(other, flownRun(other)), token: 'short' }, 400, 'NO TOKEN');
      const stacked = { ...builtTrack(3, { id: 'custom-stack' }), gates: [0, 1, 2].map(() => ({ x: 0, y: 2.3, z: 0, ry: 0, size: 1.8, solid: false })) };
      await refused(submitBody(stacked, hoverRun(stacked, { x: 0, y: 2.3, z: 0 })), 400, 'GATES TOO CLOSE');
      await refused(submitBody({ ...other, map: 'nowhere' }, flownRun(other)), 400, 'BAD MAP');
      await refused(submitBody(other, flownRun(other), { token: pilotToken('z') }), 403, 'NAME TAKEN');
      assert.equal(rows(bin, w.persist, 'SELECT COUNT(*) AS n FROM custom_tracks')[0].n, before, 'no track row from a refused run');
      // A key in the body is not the board's.
      const forged = 'c.ffffffffffffffff.p' + PHYS_VER;
      const r = await post({ ...submitBody(other, flownRun(other)), key: forged }, ip);
      assert.equal(r.json.ok, true, JSON.stringify(r.json));
      assert.equal(r.json.key, await customBoardKey(other));
      assert.equal(rows(bin, w.persist, `SELECT COUNT(*) AS n FROM custom_scores WHERE key = '${forged}'`)[0].n, 0);
      // A key in the query that is not one: refused; a well-formed one nobody flew: empty.
      for (const bad of ['c.0123', 'c.0123456789ABCDEF.p7', "c.0123456789abcdef.p7' OR '1'='1", '2026-W46.p7', 'c.0123456789abcdef.p7.x']) {
        const b = await board(bad);
        assert.equal(b.status, 400, bad);
        assert.equal(b.json.reason, 'BAD KEY', bad);
      }
      assert.deepEqual((await board('c.0123456789abcdef.p' + PHYS_VER)).json.entries, []);
    });

    await t.test('the rate limit: RATE_SCORE_MAX posts an IP an hour, shared with the weekly submit; boards are read freely', async () => {
      const ip = '192.0.2.77';
      for (let i = 0; i < RATE_SCORE_MAX; i++) {
        const r = await post('{}', ip);
        assert.notEqual(r.status, 429, 'post ' + (i + 1));
      }
      let r = await post(submitBody(track, flownRun(track)), ip);
      assert.equal(r.status, 429);
      assert.equal(r.json.reason, 'RATE LIMIT');
      r = await fetch(w.base + '/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: '{}' });
      assert.equal(r.status, 429, 'the weekly submit shares the count');
      assert.equal((await board(key)).status, 200);
      assert.equal((await post(submitBody(track, flownRun(track)), '192.0.2.78')).status, 200, 'another IP');
    });
  } finally {
    await w.stop();
  }
});

test('migrate-track-boards.sql: safe to run twice, on a database made from schema.sql, scores untouched', { timeout: 240000 }, async (t) => {
  const bin = findWrangler();
  if (!bin) { t.skip('no wrangler'); return; }
  const persist = mkdtempSync(join(tmpdir(), 'qm-lb-migrate-'));
  try {
    const src = join(leaderboardWorkerDir, 'src');
    // The database as deployed before this change: every table but the new ones.
    d1(bin, persist, ['--file', join(src, 'schema.sql')]);
    d1(bin, persist, ['--command', 'DROP TABLE custom_scores; DROP TABLE custom_tracks;']);
    d1(bin, persist, ['--command', "INSERT INTO scores (week, class, name, time_ms, track_id, submitted_ms) VALUES ('2026-W46.p7', 65, 'Old', 30000, 'weekly-2026-W46-g2', 1)"]);
    d1(bin, persist, ['--file', join(src, 'migrate-track-boards.sql')]);
    d1(bin, persist, ['--command', "INSERT INTO custom_scores (key, class, name, time_ms, submitted_ms) VALUES ('c.0123456789abcdef.p7', 65, 'A', 4000, 1)"]);
    d1(bin, persist, ['--file', join(src, 'migrate-track-boards.sql')]);
    const names = rows(bin, persist, "SELECT name FROM sqlite_master WHERE name LIKE 'custom%' ORDER BY name").map((r) => r.name);
    for (const n of ['custom_scores', 'custom_scores_rank', 'custom_tracks']) assert.ok(names.includes(n), n + ' in ' + names.join(', '));
    assert.equal(rows(bin, persist, 'SELECT COUNT(*) AS n FROM custom_scores')[0].n, 1, 'the second run kept the rows');
    assert.deepEqual(rows(bin, persist, 'SELECT name, time_ms FROM scores'), [{ name: 'Old', time_ms: 30000 }], 'scores as it was');
    const pk = rows(bin, persist, "SELECT name, pk FROM pragma_table_info('scores') WHERE pk > 0 ORDER BY pk").map((r) => r.name);
    assert.deepEqual(pk, ['week', 'class', 'name'], 'the scores primary key as it was');
  } finally {
    rmSync(persist, { recursive: true, force: true });
  }
});
