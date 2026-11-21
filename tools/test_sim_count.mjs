// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Anonymous daily flight counts, in Node (sim-retention.js COUNT_EVENTS; the
// leaderboard Worker's POST /api/count; sim.html countNote):
//   - a ping is exactly { event, class, core, input } with allowed values;
//     anything else is refused;
//   - each event counts once per page load (the flags in memory, in the
//     counter), every event after ready, pack2 after an arm;
//   - the opt-out signals send nothing: Global Privacy Control, Do Not Track,
//     a local page, ?dev=1, a test's pilot;
//   - the Worker on real SQLite (tools/d1_sqlite.mjs): a ping is one D1 write
//     (its day's row, WITHOUT ROWID), a bad one is a 400 and writes nothing,
//     another site's page is a 403; a write that fails is dropped (204) and
//     the boards are untouched; the rate limit (RATE_COUNT_MAX an hour) is in
//     the Worker's memory, never D1;
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
  COUNT_EVENTS, COUNT_CLASSES, COUNT_CORES, COUNT_INPUTS, COUNT_FLEW_MS, COUNT_BODY_MAX, RATE_COUNT_MAX,
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

// The Worker in process on SQLite: what a ping writes. Its rate limit is the
// module's memory (one isolate), so each worker here pings from its own
// addresses.
let nextIp = 1;
function worker(vars = {}, DB = sqliteD1()) {
  const env = { DB, ALLOWED_ORIGIN: ORIGIN, ...vars };
  const own = '203.0.113.' + nextIp++;
  const post = async (body, { ip = own, origin = ORIGIN, raw } = {}) => {
    const headers = { 'Content-Type': 'text/plain;charset=UTF-8', 'CF-Connecting-IP': ip };
    if (origin) headers.Origin = origin;
    const r = await handleLeaderboard(new Request('https://w.test/api/count', { method: 'POST', headers, body: raw != null ? raw : JSON.stringify(body) }), env);
    return { status: r.status, json: r.status === 204 ? null : await r.json() };
  };
  return { DB, env, post, ip: own, counts: () => DB.rows('SELECT day, event, class, core, input, n FROM counts ORDER BY event, input') };
}
// A D1 that counts what each statement writes (its run's changes), and can be
// made to fail on the counts table.
function countingD1() {
  const DB = sqliteD1();
  const log = [];
  let failCounts = false;
  const prepare = DB.prepare;
  DB.prepare = (sql) => {
    const st = prepare(sql);
    const wrap = (s) => ({
      bind: (...a) => wrap(s.bind(...a)),
      first: (c) => s.first(c),
      all: () => s.all(),
      async run() {
        if (failCounts && /INTO counts/.test(sql)) throw new Error('D1_ERROR: Exceeded maximum daily rows written');
        const r = await s.run();
        log.push({ sql, changes: r.meta.changes });
        return r;
      },
    });
    return wrap(st);
  };
  return { DB, log, fail: (on) => { failCounts = on; } };
}

test('POST /api/count: a ping adds one to its day\'s row in one write; anything else is refused and writes nothing', async () => {
  const { DB, log } = countingD1();
  const w = worker({}, DB);
  const day = utcDateId();
  assert.equal((await w.post(PING)).status, 204);
  assert.equal((await w.post(PING)).status, 204);
  assert.equal((await w.post({ ...PING, event: 'arm' })).status, 204);
  assert.deepEqual(w.counts(), [
    { day, event: 'arm', class: 65, core: 'bf', input: 'keyboard', n: 1 },
    { day, event: 'ready', class: 65, core: 'bf', input: 'keyboard', n: 2 },
  ]);
  assert.equal(log.length, 3, 'one statement a ping: ' + JSON.stringify(log));
  assert.ok(log.every((l) => /^INSERT INTO counts /.test(l.sql) && l.changes === 1), 'and it is the counts upsert, one row');
  assert.deepEqual(DB.rows('SELECT * FROM rate_limit'), [], 'no rate row: the limit is in memory');
  const before = { counts: w.counts(), statements: log.length };
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
  assert.deepEqual({ counts: w.counts(), statements: log.length }, before, 'a refused ping writes nothing');
  // A beacon from the page carries its Origin; one without (a tool) is taken.
  assert.equal((await w.post({ ...PING, event: 'lap' }, { origin: null })).status, 204);
  // GET is no route.
  const g = await handleLeaderboard(new Request('https://w.test/api/count'), w.env);
  assert.equal(g.status, 404);
});

test('the safety valve: a count write that fails is dropped, still a 204, and the boards are untouched', async () => {
  const c = countingD1();
  const w = worker({}, c.DB);
  assert.equal((await w.post(PING)).status, 204);
  c.fail(true);
  assert.equal((await w.post({ ...PING, event: 'arm' })).status, 204, 'dropped, silently');
  assert.equal((await w.post({ ...PING, event: 'flew30' })).status, 204);
  c.fail(false);
  assert.deepEqual(w.counts().map((r) => [r.event, r.n]), [['ready', 1]], 'nothing half written');
  // The boards answer as before on the same database.
  const r = await handleLeaderboard(new Request('https://w.test/api/board?class=65', { headers: { Origin: ORIGIN } }), w.env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).online, true);
  // And the counts' failures never reach the top-level catch (500).
  c.fail(true);
  const all = await Promise.all(COUNT_EVENTS.map((event) => w.post({ ...PING, event })));
  c.fail(false);
  assert.ok(all.every((x) => x.status === 204), JSON.stringify(all));
});

test('the rate limit: RATE_COUNT_MAX an hour per client, in memory, never D1; a new hour starts over', async (t) => {
  assert.equal(RATE_COUNT_MAX, 30);
  const w = worker();
  for (let i = 0; i < RATE_COUNT_MAX; i++) assert.equal((await w.post(PING)).status, 204, 'ping ' + (i + 1));
  assert.deepEqual(await w.post(PING), { status: 429, json: { ok: false, reason: 'RATE LIMIT' } });
  assert.equal(w.counts()[0].n, RATE_COUNT_MAX, 'a refused ping is not counted');
  assert.equal((await w.post(PING, { ip: '198.51.100.2' })).status, 204, 'another client is not held');
  assert.deepEqual(w.DB.rows('SELECT * FROM rate_limit'), [], 'nothing of it in D1');
  const dump = JSON.stringify(w.DB.rows("SELECT * FROM counts"));
  for (const ip of [w.ip, '198.51.100.2']) assert.ok(!dump.includes(ip), 'no address in D1: ' + ip);
  // The boards' limit is its own: a score post from the held client is still taken by its limit.
  const s = await handleLeaderboard(new Request('https://w.test/api/submit', { method: 'POST', headers: { 'CF-Connecting-IP': w.ip, Origin: ORIGIN }, body: '{' }), w.env);
  assert.deepEqual([s.status, (await s.json()).reason], [400, 'BAD JSON'], 'not RATE LIMIT');
  // An hour later: a new budget.
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + 3600_000;
  assert.equal((await w.post(PING)).status, 204, 'a new hour, a new budget');
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

test('the Worker and its schema: the counts table, one write a ping, idempotent', () => {
  const schema = read('workers/sim-leaderboard/src/schema.sql');
  const mig = read('workers/sim-leaderboard/src/migrate-counts.sql');
  const table = 'CREATE TABLE IF NOT EXISTS counts (\n  day TEXT NOT NULL,\n  event TEXT NOT NULL,\n  class INTEGER NOT NULL,\n  core TEXT NOT NULL,\n  input TEXT NOT NULL,\n  n INTEGER NOT NULL,\n  PRIMARY KEY (day, event, class, core, input)\n) WITHOUT ROWID;';
  assert.ok(schema.replace(/\r\n/g, '\n').includes(table) && mig.replace(/\r\n/g, '\n').includes(table));
  const stmts = mig.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
  assert.equal(stmts.length, 1, 'the counts table and nothing else');
  assert.match(stmts[0], /^CREATE TABLE IF NOT EXISTS counts /);
  // Twice on a database that has the boards' tables and rows: nothing changes but counts.
  const db = sqliteD1();
  db.exec("INSERT INTO rate_limit (ip, window, n) VALUES ('hmac:0123', 'score:2026-01-01T00', 4)");
  db.exec(mig);
  db.exec(mig);
  assert.deepEqual(db.rows('SELECT * FROM rate_limit'), [{ ip: 'hmac:0123', window: 'score:2026-01-01T00', n: 4 }]);
  assert.deepEqual(db.rows('SELECT * FROM counts'), []);
  assert.deepEqual(db.rows("SELECT name FROM sqlite_master WHERE tbl_name = 'counts' AND type = 'index'"), [], 'no index beside it (WITHOUT ROWID)');
  const idx = read('workers/sim-leaderboard/src/index.js');
  const route = idx.slice(idx.indexOf("if (request.method === 'POST' && path === '/api/count') {"), idx.indexOf("if (request.method === 'GET' && path === '/api/line') {"));
  assert.equal(route.split('env.DB.prepare(').length - 1, 1, 'one D1 statement in the route');
  assert.ok(route.includes('if (!countAllowed(clientIp(request), Date.now()))') && !route.includes('checkRate'), 'the limit in memory, not checkRate');
  assert.ok(/try \{\s*await env\.DB\.prepare\(\s*'INSERT INTO counts/.test(route) && route.includes('} catch (e) { /* dropped'), 'the write in a try, dropped on failure');
  assert.ok(!/COUNT_KEY|countClientKey/.test(idx));
  assert.ok(!/headers\.get\('User-Agent'\)|user-agent/i.test(idx), 'no user agent read');
});
