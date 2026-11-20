// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Anonymous daily flight counts, in Node (sim-retention.js COUNT_EVENTS; the
// leaderboard Worker's POST /api/count; sim.html countNote):
//   - a ping is exactly { event, class, core, input } with allowed values;
//     anything else is refused;
//   - each event counts once per page load (the flags in memory, in the
//     counter), every event after ready, pack2 after an arm;
//   - the opt-out signals send nothing: Global Privacy Control, Do Not Track,
//     a local page, ?dev=1, a test's pilot;
//   - the Worker on real SQLite (tools/d1_sqlite.mjs): a ping adds one to its
//     day's row, a bad one is a 400 and writes nothing, another site's page is
//     a 403, no COUNT_KEY a 503; the rate limit (RATE_COUNT_MAX an hour) keys
//     on an hourly HMAC, never the address, and prunes its earlier hours;
//   - DEPLOY.md's funnel and by-input queries on those rows;
//   - sim.html sends with a beacon and stores nothing for this.
// tools/test_leaderboard_counts.mjs runs the Worker on wrangler dev (real
// D1); tools/test_sim_count_page.mjs flies the page in Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COUNT_EVENTS, COUNT_CLASSES, COUNT_CORES, COUNT_INPUTS, COUNT_FLEW_MS, COUNT_BODY_MAX, RATE_COUNT_MAX, RATE_SCORE_MAX,
  normalizeCountPing, countPingsOff, createCountPings, utcDateId, LEADERBOARD_URL,
} from '../sim-retention.js';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';
import { sqliteD1 } from './d1_sqlite.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
const ORIGIN = 'https://quadmath.com';
const PING = { event: 'ready', class: 65, core: 'bf', input: 'keyboard' };

test('a ping is exactly { event, class, core, input }, each an allowed value', () => {
  assert.deepEqual([...COUNT_EVENTS], ['ready', 'arm', 'flew30', 'pack2', 'lap', 'name']);
  assert.deepEqual([...COUNT_CLASSES], [65, 75, 85]);
  assert.deepEqual([...COUNT_CORES], ['bf', 'js']);
  assert.deepEqual([...COUNT_INPUTS], ['radio', 'gamepad', 'keyboard', 'touch']);
  assert.equal(COUNT_FLEW_MS, 30000);
  let n = 0;
  for (const event of COUNT_EVENTS) for (const c of COUNT_CLASSES) for (const core of COUNT_CORES) for (const input of COUNT_INPUTS) {
    assert.deepEqual(normalizeCountPing({ event, class: c, core, input }), { ok: true, event, class: c, core, input });
    n++;
  }
  assert.equal(n, 144, 'at most 144 rows a day');
  const bad = [
    [null, 'BAD PING'], ['ready', 'BAD PING'], [[], 'BAD PING'], [{}, 'BAD PING'],
    [{ ...PING, extra: 1 }, 'BAD PING'], [{ event: 'ready', class: 65, core: 'bf' }, 'BAD PING'],
    [{ ...PING, id: 'abc' }, 'BAD PING'], [{ ...PING, ip: '1.2.3.4' }, 'BAD PING'],
    [{ ...PING, event: 'hello' }, 'BAD EVENT'], [{ ...PING, event: 'READY' }, 'BAD EVENT'], [{ ...PING, event: 7 }, 'BAD EVENT'],
    [{ ...PING, event: 'toString' }, 'BAD EVENT'],
    [{ ...PING, class: '65' }, 'BAD CLASS'], [{ ...PING, class: 66 }, 'BAD CLASS'], [{ ...PING, class: 65.5 }, 'BAD CLASS'], [{ ...PING, class: null }, 'BAD CLASS'],
    [{ ...PING, core: 'BF' }, 'BAD CORE'], [{ ...PING, core: 'sim' }, 'BAD CORE'],
    [{ ...PING, input: 'mouse' }, 'BAD INPUT'], [{ ...PING, input: ['keyboard'] }, 'BAD INPUT'],
  ];
  for (const [body, reason] of bad) assert.deepEqual(normalizeCountPing(body), { ok: false, reason }, JSON.stringify(body));
});

test('the opt-out signals: Global Privacy Control, Do Not Track, a local page, ?dev=1, a test\'s pilot', () => {
  const site = { hostname: 'quadmath.com', search: '' };
  assert.equal(countPingsOff({ loc: site }), '', 'the site, nothing set: send');
  assert.equal(countPingsOff({ loc: site, gpc: false, dnt: '0' }), '');
  assert.equal(countPingsOff({ loc: site, dnt: 'unspecified' }), '');
  assert.equal(countPingsOff({ loc: site, gpc: true }), 'gpc');
  for (const dnt of ['1', 'yes', 1, true]) assert.equal(countPingsOff({ loc: site, dnt }), 'dnt', String(dnt));
  for (const hostname of ['localhost', '127.0.0.1', '127.0.0.2', '0.0.0.0', '[::1]', '::1', 'sim.localhost', 'LOCALHOST', '']) {
    assert.equal(countPingsOff({ loc: { hostname, search: '' } }), 'local', hostname || 'a file');
  }
  assert.equal(countPingsOff({}), 'local', 'no location');
  assert.equal(countPingsOff({ loc: { hostname: 'quadmath.com', search: '?map=rig&dev=1' } }), 'dev');
  assert.equal(countPingsOff({ loc: { hostname: 'quadmath.com', search: '?dev=0' } }), '');
  assert.equal(countPingsOff({ loc: site, testPilot: true }), 'test');
});

test('each event counts once per page load; ready first, pack2 after an arm; off sends nothing', () => {
  const ctx = { class: 75, core: 'bf', input: 'gamepad' };
  const sent = [];
  const pings = createCountPings({ send: (b) => sent.push(b), off: () => '' });
  assert.equal(pings.note('arm', ctx), false, 'nothing before ready');
  assert.equal(pings.note('pack2', ctx), false);
  assert.equal(pings.note('ready', ctx), true);
  assert.equal(pings.note('pack2', ctx), false, 'pack2 waits for an arm');
  for (const e of ['arm', 'flew30', 'pack2', 'lap', 'name']) assert.equal(pings.note(e, ctx), true, e);
  for (let i = 0; i < 3; i++) for (const e of COUNT_EVENTS) assert.equal(pings.note(e, ctx), false, e + ' again');
  assert.equal(pings.note('hello', ctx), false);
  assert.deepEqual(sent.map((b) => b.event), [...COUNT_EVENTS], 'each once, in order');
  for (const b of sent) assert.deepEqual(Object.keys(b), ['event', 'class', 'core', 'input'], 'nothing else in a ping');
  assert.deepEqual(sent[0], { event: 'ready', ...ctx });
  assert.deepEqual(pings.sent(), [...COUNT_EVENTS]);

  // A new page load: a new counter, so ready again (nothing outlives the page).
  const again = [];
  const next = createCountPings({ send: (b) => again.push(b), off: () => '' });
  next.note('ready', ctx);
  assert.deepEqual(again.map((b) => b.event), ['ready']);

  // Off: nothing at all, whatever is noted.
  for (const why of ['gpc', 'dnt', 'local', 'dev', 'test']) {
    const none = [];
    const p = createCountPings({ send: (b) => none.push(b), off: () => why });
    for (const e of COUNT_EVENTS) p.note(e, ctx);
    assert.deepEqual(none, [], why);
  }
  // Off later (a test's pilot from now on): nothing more.
  let pilot = false;
  const later = [];
  const p = createCountPings({ send: (b) => later.push(b), off: () => (pilot ? 'test' : '') });
  p.note('ready', ctx);
  pilot = true;
  p.note('arm', ctx);
  assert.deepEqual(later.map((b) => b.event), ['ready']);

  // A ctx that is no ping (an unknown input) sends nothing and is asked again
  // later; a lazy ctx is read only when due; a send that throws is no error.
  let reads = 0;
  const lazy = [];
  const q = createCountPings({ send: (b) => { lazy.push(b); throw new Error('offline'); }, off: () => '' });
  assert.equal(q.note('arm', () => { reads++; return ctx; }), false);
  assert.equal(reads, 0, 'not due: not read');
  assert.equal(q.note('ready', { ...ctx, input: 'mouse' }), false);
  assert.equal(q.note('ready', () => { reads++; return ctx; }), true);
  assert.equal(reads, 1);
  assert.equal(lazy.length, 1);
});

// The Worker in process on SQLite: what a ping writes.
function worker(vars = {}) {
  const DB = sqliteD1();
  const env = { DB, ALLOWED_ORIGIN: ORIGIN, COUNT_KEY: 'test-count-key', ...vars };
  const post = async (body, { ip = '203.0.113.7', origin = ORIGIN, raw } = {}) => {
    const headers = { 'Content-Type': 'text/plain;charset=UTF-8', 'CF-Connecting-IP': ip };
    if (origin) headers.Origin = origin;
    const r = await handleLeaderboard(new Request('https://w.test/api/count', { method: 'POST', headers, body: raw != null ? raw : JSON.stringify(body) }), env);
    return { status: r.status, json: r.status === 204 ? null : await r.json() };
  };
  return { DB, env, post, counts: () => DB.rows('SELECT day, event, class, core, input, n FROM counts ORDER BY event, input') };
}

test('POST /api/count: a ping adds one to its day\'s row; anything else is refused and writes nothing', async () => {
  const w = worker();
  const day = utcDateId();
  assert.equal((await w.post(PING)).status, 204);
  assert.equal((await w.post(PING)).status, 204);
  assert.equal((await w.post({ ...PING, event: 'arm' })).status, 204);
  assert.deepEqual(w.counts(), [
    { day, event: 'arm', class: 65, core: 'bf', input: 'keyboard', n: 1 },
    { day, event: 'ready', class: 65, core: 'bf', input: 'keyboard', n: 2 },
  ]);
  const before = { counts: w.counts(), rate: w.DB.rows('SELECT * FROM rate_limit') };
  const refused = [
    [{ ...PING, event: 'hello' }, 'BAD EVENT'],
    [{ ...PING, class: 90 }, 'BAD CLASS'],
    [{ ...PING, core: 'x' }, 'BAD CORE'],
    [{ ...PING, input: 'joystick' }, 'BAD INPUT'],
    [{ ...PING, visitor: 'abc' }, 'BAD PING'],
  ];
  for (const [body, reason] of refused) assert.deepEqual(await w.post(body), { status: 400, json: { ok: false, reason } }, reason);
  assert.deepEqual(await w.post(null, { raw: '{not json' }), { status: 400, json: { ok: false, reason: 'BAD JSON' } });
  assert.deepEqual(await w.post(null, { raw: JSON.stringify({ ...PING, pad: 'x'.repeat(COUNT_BODY_MAX) }) }), { status: 400, json: { ok: false, reason: 'PAYLOAD TOO LARGE' } });
  assert.deepEqual(await w.post(PING, { origin: 'https://evil.example' }), { status: 403, json: { ok: false, reason: 'ORIGIN' } });
  assert.deepEqual({ counts: w.counts(), rate: w.DB.rows('SELECT * FROM rate_limit') }, before, 'a refused ping writes nothing, not even a rate row');
  // A beacon from the page carries its Origin; one without (a tool) is taken.
  assert.equal((await w.post({ ...PING, event: 'lap' }, { origin: null })).status, 204);
  // GET is no route.
  const g = await handleLeaderboard(new Request('https://w.test/api/count'), w.env);
  assert.equal(g.status, 404);
  // No secret: nothing counted, and never the address in its place.
  const n = worker({ COUNT_KEY: '' });
  assert.deepEqual(await n.post(PING), { status: 503, json: { ok: false, reason: 'NOT CONFIGURED' } });
  assert.deepEqual(n.counts(), []);
  assert.deepEqual(n.DB.rows('SELECT * FROM rate_limit'), []);
});

test('the rate limit: RATE_COUNT_MAX an hour per client, its own bucket, an hourly HMAC for a key, earlier hours pruned', async (t) => {
  assert.equal(RATE_COUNT_MAX, 30);
  const w = worker();
  for (let i = 0; i < RATE_COUNT_MAX; i++) assert.equal((await w.post(PING)).status, 204, 'ping ' + (i + 1));
  assert.deepEqual(await w.post(PING), { status: 429, json: { ok: false, reason: 'RATE LIMIT' } });
  assert.equal(w.counts()[0].n, RATE_COUNT_MAX, 'a refused ping is not counted');
  assert.equal((await w.post(PING, { ip: '198.51.100.2' })).status, 204, 'another client is not held');
  const rate = w.DB.rows('SELECT ip, window, n FROM rate_limit');
  assert.equal(rate.length, 2);
  for (const r of rate) {
    assert.match(r.ip, /^hmac:[0-9a-f]{32}$/, 'a keyed hash, not the address');
    assert.match(r.window, /^count:\d{4}-\d\d-\d\dT\d\d$/);
  }
  const dump = JSON.stringify(w.DB.rows('SELECT * FROM rate_limit')) + JSON.stringify(w.counts());
  for (const ip of ['203.0.113.7', '198.51.100.2']) assert.ok(!dump.includes(ip), 'no address anywhere: ' + ip);
  // The same address under another secret, or in another hour, is another key.
  const other = worker({ COUNT_KEY: 'another-key' });
  await other.post(PING);
  const [a] = other.DB.rows('SELECT ip FROM rate_limit');
  assert.ok(!rate.some((r) => r.ip === a.ip), 'the key depends on the secret');
  // The boards' bucket is untouched: a score post still has its 30.
  assert.ok(!w.DB.rows("SELECT window FROM rate_limit WHERE window NOT LIKE 'count:%'").length);
  assert.equal(RATE_SCORE_MAX, 30);

  // An hour later: the client's first ping prunes every earlier count row,
  // and leaves the boards' rows alone.
  w.DB.exec("INSERT INTO rate_limit (ip, window, n) VALUES ('203.0.113.9', 'score:2020-01-01T00', 3)");
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + 3600_000;
  assert.equal((await w.post(PING)).status, 204, 'a new hour, a new budget');
  const left = w.DB.rows('SELECT ip, window, n FROM rate_limit ORDER BY window');
  assert.equal(left.filter((r) => r.window.startsWith('count:')).length, 1, 'earlier count hours pruned: ' + JSON.stringify(left));
  assert.equal(left.find((r) => r.window.startsWith('count:')).n, 1);
  assert.ok(!rate.some((r) => r.ip === left.find((x) => x.window.startsWith('count:')).ip), 'a new key every hour');
  assert.ok(left.some((r) => r.window === 'score:2020-01-01T00'), 'other buckets kept');
});

// DEPLOY.md's two report commands, as written there.
function deployQueries() {
  const md = read('workers/sim-leaderboard/DEPLOY.md');
  const q = [...md.matchAll(/^npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "(SELECT day, [^"]+ FROM counts [^"]+)"$/gm)].map((m) => m[1]);
  assert.equal(q.length, 2, 'the funnel and the by-input commands');
  return { funnel: q[0], byInput: q[1] };
}

test('DEPLOY.md: the last 14 days as a funnel per day, and split by input, on real rows', async () => {
  const { funnel, byInput } = deployQueries();
  const w = worker();
  const day = (d) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
  const add = (d, event, input, n) => w.DB.exec(`INSERT INTO counts (day, event, class, core, input, n) VALUES ('${day(d)}', '${event}', 65, 'bf', '${input}', ${n})`);
  for (const [event, n] of [['ready', 100], ['arm', 60], ['flew30', 40], ['pack2', 10], ['lap', 8], ['name', 2]]) add(0, event, 'keyboard', n);
  for (const [event, n] of [['ready', 20], ['arm', 15], ['flew30', 12]]) add(0, event, 'radio', n);
  add(1, 'ready', 'gamepad', 7);
  add(13, 'ready', 'touch', 5);
  add(14, 'ready', 'touch', 999);
  const f = w.DB.rows(funnel);
  assert.deepEqual(f, [
    { day: day(0), ready: 120, arm: 75, flew30: 52, pack2: 10, lap: 8, name: 2 },
    { day: day(1), ready: 7, arm: 0, flew30: 0, pack2: 0, lap: 0, name: 0 },
    { day: day(13), ready: 5, arm: 0, flew30: 0, pack2: 0, lap: 0, name: 0 },
  ], 'newest first, 14 days, the 15th day ago left out');
  assert.deepEqual(Object.keys(f[0]), ['day', 'ready', 'arm', 'flew30', 'pack2', 'lap', 'name'], 'the funnel\'s order');
  const s = w.DB.rows(byInput);
  assert.deepEqual(s.filter((r) => r.day === day(0)), [
    { day: day(0), input: 'keyboard', ready: 100, arm: 60, flew30: 40, pack2: 10, lap: 8, name: 2 },
    { day: day(0), input: 'radio', ready: 20, arm: 15, flew30: 12, pack2: 0, lap: 0, name: 0 },
  ]);
  assert.equal(s.length, 4);
});

// sim.html is one inline module; its counting is checked in its source.
function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() not found in sim.html`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`${name}() has unbalanced braces`);
}

test('sim.html: one beacon per event, the events where they happen, nothing stored; the CSP lets the beacon out', () => {
  const html = read('sim.html').replace(/\r\n/g, '\n');
  const block = html.slice(html.indexOf('// ---------- Anonymous flight counts'), html.indexOf('function countFlight('));
  const flight = extract(html, 'countFlight');
  for (const part of [block, flight]) {
    for (const store of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'issuePilotToken', 'pilotToken']) assert.ok(!part.includes(store), 'stores nothing: ' + store);
  }
  assert.ok(block.includes("const countOffAtLoad=countPingsOff({gpc:navigator.globalPrivacyControl,dnt:navigator.doNotTrack||window.doNotTrack,loc:location});"));
  assert.ok(block.includes("off:()=>countOffAtLoad||(testPilotUsed?'test':''),"));
  assert.ok(block.includes("navigator.sendBeacon(url+'/api/count',data)") && block.includes("keepalive:true,credentials:'omit'"));
  assert.ok(!/toast\(/.test(block), 'never says anything');
  assert.ok(extract(html, 'countNote').includes("countPings.note(event,()=>({class:classId(currentBuild&&currentBuild.frameMm),core:core.kind,input:bfInputKind()}))"));
  // Where each event comes from.
  assert.ok(extract(html, 'loop').includes('countReadyWatch();'));
  assert.ok(extract(html, 'countReadyWatch').includes("if(core.kind!=='bf'&&bfWanted()&&!bfOf().failed)return;"));
  assert.ok(extract(html, 'stepCore').includes('countFlight(simClockMs-simAtMs);'));
  assert.ok(flight.includes("countNote('arm');") && flight.includes('if(countAirMs>=COUNT_FLEW_MS)countNote(\'flew30\');') && flight.includes('!cs.airborne'));
  assert.ok(extract(html, 'placeQuadAt').includes("if(opts&&opts.freshPack&&countPings.has('arm'))countNote('pack2');"));
  assert.ok(extract(html, 'finishRun').includes("countNote('lap');"));
  assert.ok(html.includes("      runSplits.push(split);\n      countNote('lap');"), 'a loop\'s lap');
  assert.ok(extract(html, 'maybeSubmitOnline').includes("if(j&&j.ok){countNote('name');"));
  assert.ok(extract(html, 'maybeSubmitDailyLine').includes("if(j&&j.ok){countNote('name');"));
  assert.ok(extract(html, 'maybeSubmitTrackBoard').includes("countNote('name');"));
  assert.equal(html.split("countNote('").length - 1, 9, 'ready, arm, flew30, pack2, two laps, three names');
  // The beacon's host is in connect-src.
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src')).split(/\s+/);
  assert.ok(connect.includes(new URL(LEADERBOARD_URL).origin), 'connect-src has ' + LEADERBOARD_URL);
});

test('the Worker and its schema: the counts table and the prune index, idempotent', () => {
  const schema = read('workers/sim-leaderboard/src/schema.sql');
  const mig = read('workers/sim-leaderboard/src/migrate-counts.sql');
  const table = 'CREATE TABLE IF NOT EXISTS counts (\n  day TEXT NOT NULL,\n  event TEXT NOT NULL,\n  class INTEGER NOT NULL,\n  core TEXT NOT NULL,\n  input TEXT NOT NULL,\n  n INTEGER NOT NULL,\n  PRIMARY KEY (day, event, class, core, input)\n);';
  assert.ok(schema.replace(/\r\n/g, '\n').includes(table) && mig.replace(/\r\n/g, '\n').includes(table));
  for (const sql of [schema, mig]) assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS rate_limit_window ON rate_limit (window);'));
  for (const stmt of mig.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    assert.match(stmt, /^CREATE (TABLE|INDEX) IF NOT EXISTS /, 'only IF NOT EXISTS: ' + stmt.slice(0, 60));
  }
  // Twice on a database that has the boards' tables and rows: nothing changes but counts.
  const db = sqliteD1();
  db.exec("INSERT INTO rate_limit (ip, window, n) VALUES ('1.2.3.4', 'score:2026-01-01T00', 4)");
  db.exec(mig);
  db.exec(mig);
  assert.deepEqual(db.rows('SELECT * FROM rate_limit'), [{ ip: '1.2.3.4', window: 'score:2026-01-01T00', n: 4 }]);
  assert.deepEqual(db.rows('SELECT * FROM counts'), []);
  const idx = read('workers/sim-leaderboard/src/index.js');
  assert.ok(idx.includes("const who = bucket === 'count' ? await countClientKey(env, ip, window) : ip;"));
  assert.ok(idx.includes("DELETE FROM rate_limit WHERE window >= 'count:' AND window < ?"));
  assert.ok(!/headers\.get\('User-Agent'\)|user-agent/i.test(idx), 'no user agent read');
});
