// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The leaderboard Worker's anonymous flight counts on real D1, under wrangler
// dev (tools/sim_rooms_dev.mjs startLeaderboardDev, a local D1 made from
// schema.sql):
//   - each event counts once per ping: a page load's six pings are six rows of
//     1; the same ping again adds one;
//   - a bad value (event, class, core, input, an extra key, not JSON, too
//     big) is a 400 and writes nothing; another site's page a 403;
//   - a ping is one D1 write: no rate_limit row, the limit is in memory
//     (RATE_COUNT_MAX pings an hour per client, then 429); no address in D1;
//   - migrate-counts.sql runs twice on a database from before it (the boards'
//     tables and rows) and twice on one that has it, and changes no rows;
//   - DEPLOY.md's funnel and by-input commands, run as written (but --local),
//     on what the pings wrote;
//   - the boards' rate limit (RATE_KEY set): an hourly HMAC, never the
//     address, and a client's first post of an hour prunes earlier hours'
//     rows (raw addresses from before included); migrate-rate-limit.sql
//     deletes raw-address rows only, twice.
// Needs wrangler: workers/sim-rooms' or workers/sim-leaderboard's own
// (npm install there), or WRANGLER=<path to bin/wrangler.js>. Without one it
// skips (CI's sim-tests job installs none). The same in process, on SQLite:
// tools/test_sim_count.mjs.
//   node tools/test_leaderboard_counts.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findWrangler, startLeaderboardDev, leaderboardWorkerDir } from './sim_rooms_dev.mjs';
import { COUNT_EVENTS, RATE_COUNT_MAX, utcDateId } from '../sim-retention.js';

const DB = 'quadmath-sim-leaderboard';
const ORIGIN = 'https://quadmath.com';
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const SRC = join(leaderboardWorkerDir, 'src');

function d1(bin, persist, args) {
  const r = spawnSync(process.execPath, [bin, 'd1', 'execute', DB, '--local', '--persist-to', persist, '--yes', ...args],
    { cwd: leaderboardWorkerDir, env: ENV, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, 'wrangler d1 execute ' + args.join(' ') + ':\n' + (r.stdout + r.stderr).slice(-1500));
  return r;
}
function rows(bin, persist, sql) {
  const r = d1(bin, persist, ['--command', sql, '--json']);
  return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results;
}
// DEPLOY.md's two report commands, the SQL as written there.
function deployQueries() {
  const md = readFileSync(join(leaderboardWorkerDir, 'DEPLOY.md'), 'utf8');
  const q = [...md.matchAll(/^npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "(SELECT day, [^"]+ FROM counts [^"]+)"$/gm)].map((m) => m[1]);
  assert.equal(q.length, 2);
  return { funnel: q[0], byInput: q[1] };
}

test('anonymous flight counts on wrangler dev (real D1)', { timeout: 420000 }, async (t) => {
  const bin = findWrangler();
  if (!bin) { t.skip('no wrangler (npm install in workers/sim-rooms or workers/sim-leaderboard, or WRANGLER=)'); return; }
  const w = await startLeaderboardDev(bin, { ALLOWED_ORIGIN: ORIGIN, RATE_KEY: 'wrangler-rate-key' });
  const fetch = async (url, init) => {
    try { return await globalThis.fetch(url, init); }
    catch (e) { await new Promise((r) => setTimeout(r, 500)); return globalThis.fetch(url, init); }
  };
  // As the page's beacon sends it: text/plain, its Origin.
  const ping = (body, ip = '203.0.113.7', origin = ORIGIN) => fetch(w.base + '/api/count', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: r.status === 204 ? null : await r.json() }));
  const day = utcDateId();
  const scratch = mkdtempSync(join(tmpdir(), 'qm-counts-'));
  try {
    await t.test('each event counts once per ping: a page load\'s six are six rows of 1', async () => {
      for (const event of COUNT_EVENTS) assert.equal((await ping({ event, class: 75, core: 'bf', input: 'radio' })).status, 204, event);
      const got = rows(bin, w.persist, "SELECT day, event, class, core, input, n FROM counts WHERE input = 'radio' ORDER BY event");
      assert.deepEqual(got, [...COUNT_EVENTS].sort().map((event) => ({ day, event, class: 75, core: 'bf', input: 'radio', n: 1 })));
      assert.equal((await ping({ event: 'ready', class: 75, core: 'bf', input: 'radio' })).status, 204);
      assert.deepEqual(rows(bin, w.persist, "SELECT n FROM counts WHERE event = 'ready' AND input = 'radio'"), [{ n: 2 }], 'another page load: one more');
    });

    await t.test('a bad value is a 400 and writes nothing; another site\'s page a 403', async () => {
      const before = rows(bin, w.persist, 'SELECT * FROM counts ORDER BY event, input').concat(rows(bin, w.persist, 'SELECT * FROM rate_limit ORDER BY ip, window'));
      const good = { event: 'arm', class: 65, core: 'js', input: 'touch' };
      const bad = [
        [{ ...good, event: 'visit' }, 'BAD EVENT'], [{ ...good, class: 5 }, 'BAD CLASS'], [{ ...good, class: '65' }, 'BAD CLASS'],
        [{ ...good, core: 'wasm' }, 'BAD CORE'], [{ ...good, input: 'mouse' }, 'BAD INPUT'], [{ ...good, uid: 'x' }, 'BAD PING'],
        ['{nope', 'BAD JSON'], [JSON.stringify({ ...good, pad: 'x'.repeat(400) }), 'PAYLOAD TOO LARGE'],
      ];
      for (const [body, reason] of bad) assert.deepEqual(await ping(body, '203.0.113.50'), { status: 400, json: { ok: false, reason } }, reason);
      assert.deepEqual(await ping(good, '203.0.113.50', 'https://example.org'), { status: 403, json: { ok: false, reason: 'ORIGIN' } });
      const after = rows(bin, w.persist, 'SELECT * FROM counts ORDER BY event, input').concat(rows(bin, w.persist, 'SELECT * FROM rate_limit ORDER BY ip, window'));
      assert.deepEqual(after, before, 'nothing written, not even a rate row');
    });

    await t.test('the rate limit: RATE_COUNT_MAX an hour per client, in memory: no rate_limit row, no address in D1', async () => {
      assert.equal(RATE_COUNT_MAX, 30);
      const p = { event: 'lap', class: 85, core: 'js', input: 'gamepad' };
      for (let i = 0; i < RATE_COUNT_MAX; i++) assert.equal((await ping(p, '198.51.100.9')).status, 204, 'ping ' + (i + 1));
      assert.deepEqual(await ping(p, '198.51.100.9'), { status: 429, json: { ok: false, reason: 'RATE LIMIT' } });
      assert.equal((await ping(p, '198.51.100.10')).status, 204, 'another client is not held');
      assert.deepEqual(rows(bin, w.persist, "SELECT n FROM counts WHERE event = 'lap' AND input = 'gamepad'"), [{ n: RATE_COUNT_MAX + 1 }]);
      assert.deepEqual(rows(bin, w.persist, 'SELECT * FROM rate_limit'), [], 'every ping so far wrote its counts row and nothing else');
      const all = JSON.stringify(rows(bin, w.persist, 'SELECT * FROM counts'));
      for (const ip of ['203.0.113.7', '198.51.100.9', '198.51.100.10']) assert.ok(!all.includes(ip), 'no address in D1: ' + ip);
      assert.deepEqual(rows(bin, w.persist, "SELECT name FROM pragma_table_info('counts') ORDER BY cid").map((r) => r.name), ['day', 'event', 'class', 'core', 'input', 'n'], 'no address, agent or time column');
      assert.deepEqual(rows(bin, w.persist, "SELECT sql LIKE '%WITHOUT ROWID' AS bare FROM sqlite_master WHERE name = 'counts'"), [{ bare: 1 }], 'one row written a ping');
    });

    await t.test('DEPLOY.md\'s funnel and by-input commands, as written, on the rows the pings wrote', () => {
      const { funnel, byInput } = deployQueries();
      const f = rows(bin, w.persist, funnel);
      assert.deepEqual(f, [{ day, ready: 2, arm: 1, flew30: 1, pack2: 1, lap: RATE_COUNT_MAX + 2, name: 1 }]);
      const s = rows(bin, w.persist, byInput);
      assert.deepEqual(s, [
        { day, input: 'radio', ready: 2, arm: 1, flew30: 1, pack2: 1, lap: 1, name: 1 },
        { day, input: 'gamepad', ready: 0, arm: 0, flew30: 0, pack2: 0, lap: RATE_COUNT_MAX + 1, name: 0 },
      ]);
    });

    await t.test('the boards\' rate limit on real D1: an hourly HMAC, never the address; earlier hours pruned', async () => {
      const post = (ip) => fetch(w.base + '/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': ip }, body: '{' })
        .then(async (r) => ({ status: r.status, json: await r.json() }));
      // Rows from before this: raw addresses, an old hour, both buckets and the bare hour.
      d1(bin, w.persist, ['--command', "INSERT INTO rate_limit (ip, window, n) VALUES ('192.0.2.1', 'score:2020-01-01T00', 4), ('192.0.2.2', '2020-01-01T00', 1), ('192.0.2.3', 'share:2020-01-01T00', 2)"]);
      assert.deepEqual(await post('203.0.113.77'), { status: 400, json: { ok: false, reason: 'BAD JSON' } }, 'counted, then refused for its body');
      assert.deepEqual(await post('203.0.113.77'), { status: 400, json: { ok: false, reason: 'BAD JSON' } });
      const rate = rows(bin, w.persist, 'SELECT ip, window, n FROM rate_limit');
      assert.equal(rate.length, 1, 'the old rows pruned on the first post of the hour: ' + JSON.stringify(rate));
      assert.match(rate[0].ip, /^hmac:[0-9a-f]{32}$/);
      assert.match(rate[0].window, /^score:\d{4}-\d\d-\d\dT\d\d$/);
      assert.equal(rate[0].n, 2);
      assert.ok(!JSON.stringify(rate).includes('203.0.113.77'), 'no address in D1');
      // The cleanup migration, twice: raw rows go, hashed rows stay.
      d1(bin, w.persist, ['--command', "INSERT INTO rate_limit (ip, window, n) VALUES ('192.0.2.9', 'score:" + rate[0].window.slice(6) + "', 1)"]);
      d1(bin, w.persist, ['--file', join(SRC, 'migrate-rate-limit.sql')]);
      d1(bin, w.persist, ['--file', join(SRC, 'migrate-rate-limit.sql')]);
      assert.deepEqual(rows(bin, w.persist, 'SELECT ip FROM rate_limit'), [{ ip: rate[0].ip }]);
    });

    await t.test('migrate-counts.sql runs twice: on a database from before it, and on one that has it', () => {
      const file = join(SRC, 'migrate-counts.sql');
      // Before it: schema.sql without counts, with the boards' rows.
      const schema = readFileSync(join(SRC, 'schema.sql'), 'utf8');
      const old = schema.replace(/CREATE TABLE IF NOT EXISTS counts \([^;]+\) WITHOUT ROWID;/, '');
      assert.ok(!/CREATE TABLE IF NOT EXISTS counts/.test(old), 'the schema from before');
      const oldFile = join(scratch, 'old-schema.sql');
      writeFileSync(oldFile, old);
      const persist = join(scratch, 'old-db');
      d1(bin, persist, ['--file', oldFile]);
      d1(bin, persist, ['--command', "INSERT INTO rate_limit (ip, window, n) VALUES ('192.0.2.1', 'score:2026-11-01T10', 3)"]);
      d1(bin, persist, ['--command', "INSERT INTO lines (id, code, created_ms) VALUES ('abc', 'code', 1)"]);
      d1(bin, persist, ['--file', file]);
      d1(bin, persist, ['--file', file]);
      assert.deepEqual(rows(bin, persist, 'SELECT * FROM rate_limit'), [{ ip: '192.0.2.1', window: 'score:2026-11-01T10', n: 3 }]);
      assert.deepEqual(rows(bin, persist, 'SELECT id FROM lines'), [{ id: 'abc' }]);
      assert.deepEqual(rows(bin, persist, 'SELECT * FROM counts'), []);
      // On the dev database, which has it: twice more, its rows kept.
      const before = rows(bin, w.persist, 'SELECT * FROM counts ORDER BY event, input');
      d1(bin, w.persist, ['--file', file]);
      d1(bin, w.persist, ['--file', file]);
      assert.deepEqual(rows(bin, w.persist, 'SELECT * FROM counts ORDER BY event, input'), before);
    });
  } finally {
    await w.stop();
    try { rmSync(scratch, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});
