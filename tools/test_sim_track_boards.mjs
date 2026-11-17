// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Online boards for builder tracks (custom and shared, #trk= links):
//   - In node: sim-retention.js customBoardKey (the map and the gates, and
//     PHYS_VER; never the id or the name), normalizeTrackSubmit (the run is
//     checked against the track it came with), and the leaderboard Worker's
//     POST /api/track/submit and GET /api/track/board on an in-memory D1
//     (tools/track_boards_fixture.mjs). The same routes on real D1 under
//     wrangler dev: tools/test_leaderboard_track_boards.mjs.
//   - In headless Chrome (CHROME set; skipped with SKIP_CHROME_BOOT=1): a
//     pilot opens a track link, races it, and the run lands on that track's
//     board on the lap panel; a second fresh profile opening the same link
//     sees that time before flying; with the Worker down, or answering 404 as
//     one deployed before these routes does, the page boots, races and keeps
//     its local best with no board and no error toast.
//   node tools/test_sim_track_boards.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PHYS_VER, CUSTOM_BOARD_KEY_RE, CUSTOM_TRACK_CODE_MAX, CUSTOM_TRACK_MIN_GATES, LEADERBOARD_URL,
  customBoardKey, customTrackCanon, customTrackCode, normalizeTrackSubmit, isCustomBoardTrackId,
  customTrackProblem, CUSTOM_TRACK_MAPS, CUSTOM_TRACK_GATES_SCAN_MAX,
} from '../sim-retention.js';
import { encodeShare, trackLink, MAPS } from '../sim-tracks.js';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';
import { RATE_SCORE_MAX, builtinFloorMs, CLASS_IDS } from '../sim-retention.js';
import { BUILTIN_BOARD_TRACKS } from '../sim-builtin-boards.js';
import { WS } from '../sim-core-adapter.js';
import { builtTrack, hugeTrack, flownRun, hoverRun, pilotToken, submitBody, trackBoardsD1 } from './track_boards_fixture.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'sim.html'), 'utf8');
const moved = (t, i, dx) => ({ ...t, gates: t.gates.map((g, j) => (j === i ? { ...g, x: g.x + dx } : g)) });

test('customBoardKey: the same gates give the same key; the id, the name and the flags do not count', async () => {
  const t = builtTrack(4);
  const key = await customBoardKey(t);
  assert.match(key, CUSTOM_BOARD_KEY_RE);
  assert.ok(key.endsWith('.p' + PHYS_VER));
  assert.equal(await customBoardKey(t), key, 'stable');
  assert.equal(await customBoardKey({ ...t, id: 'custom-shared-zzz', name: 'Another name' }), key, 'id and name');
  assert.equal(await customBoardKey({ ...t, flags: [{ x: 1, y: 2, z: 3, ry: 0 }] }), key, 'flags');
  // A copy through a share code, JSON, and float noise below the rounding.
  const viaCode = JSON.parse(JSON.stringify(t));
  assert.equal(await customBoardKey(viaCode), key, 'JSON round trip');
  const noisy = { ...t, gates: t.gates.map((g) => ({ ...g, x: g.x + 1e-9, ry: g.ry - 1e-9 })) };
  assert.equal(await customBoardKey(noisy), key, 'float noise');
  // Fifteen-degree turns added up (the builder's Rotate) and the same angle written out.
  let ry = 0;
  for (let i = 0; i < 5; i++) ry = (ry + Math.PI / 12) % (Math.PI * 2);
  const turned = (v) => ({ ...t, gates: t.gates.map((g, j) => (j === 1 ? { ...g, ry: v } : g)) });
  assert.equal(await customBoardKey(turned(ry)), await customBoardKey(turned(5 * Math.PI / 12)));
  assert.equal(await customBoardKey({ ...t, gates: t.gates.map((g) => ({ ...g, z: g.z === 0 ? -0 : g.z })) }), key, '-0 is 0');
  assert.doesNotMatch(customTrackCanon(t), /custom-|Desk loop/, 'the canonical form has no id or name');
});

test('customBoardKey: a moved gate, another map, a resized or solid gate, or another order is another board', async () => {
  const t = builtTrack(4);
  const key = await customBoardKey(t);
  const others = [
    moved(t, 2, 0.01), moved(t, 0, -1),
    { ...t, map: 'house' },
    { ...t, gates: t.gates.map((g, j) => (j === 3 ? { ...g, size: 2.2 } : g)) },
    { ...t, gates: t.gates.map((g, j) => (j === 3 ? { ...g, solid: true } : g)) },
    { ...t, gates: t.gates.map((g, j) => (j === 1 ? { ...g, ry: 0.5 } : g)) },
    { ...t, gates: t.gates.slice().reverse() },
    builtTrack(5),
  ];
  const seen = new Set([key]);
  for (const o of others) {
    const k = await customBoardKey(o);
    assert.match(k, CUSTOM_BOARD_KEY_RE);
    assert.ok(!seen.has(k), 'a new key: ' + customTrackCanon(o));
    seen.add(k);
  }
});

test('customBoardKey: another PHYS_VER is another board', async () => {
  // This file with PHYS_VER bumped (it has no imports, so a copy stands alone).
  const src = readFileSync(join(root, 'sim-retention.js'), 'utf8');
  assert.match(src, /export const PHYS_VER = \d+;/);
  const dir = mkdtempSync(join(tmpdir(), 'qm-phys-'));
  try {
    const f = join(dir, 'sim-retention-next.mjs');
    writeFileSync(f, src.replace(/export const PHYS_VER = \d+;/, `export const PHYS_VER = ${PHYS_VER + 1};`));
    const next = await import(pathToFileURL(f).href);
    const t = builtTrack(4);
    const a = await customBoardKey(t), b = await next.customBoardKey(t);
    assert.notEqual(a, b);
    assert.equal(a.slice(0, 18), b.slice(0, 18), 'the same gates hash');
    assert.ok(b.endsWith('.p' + (PHYS_VER + 1)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('normalizeTrackSubmit: a run checked against the track it came with', async () => {
  const t = builtTrack(4);
  const run = flownRun(t);
  const ok = await normalizeTrackSubmit(submitBody(t, run));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.key, await customBoardKey(t));
  assert.equal(ok.timeMs, run.timeMs);
  assert.equal(ok.gates, 4);
  assert.equal(ok.code, customTrackCode(t));
  assert.ok(run.timeMs < 5000, 'a short builder track counts (the Daily Line floor, not 5 s): ' + run.timeMs);
  // A key in the body changes nothing.
  assert.equal((await normalizeTrackSubmit({ ...submitBody(t, run), key: 'c.ffffffffffffffff.p' + PHYS_VER })).key, ok.key);
  const refused = async (body, reason) => {
    const r = await normalizeTrackSubmit(body);
    assert.equal(r.ok, false, reason + ': ' + JSON.stringify(r).slice(0, 120));
    assert.equal(r.reason, reason);
  };
  const two = builtTrack(2);
  await refused(submitBody(two, flownRun(two)), 'TOO FEW GATES');
  assert.equal(CUSTOM_TRACK_MIN_GATES, 3);
  const huge = hugeTrack();
  assert.ok(customTrackCode(huge).length > CUSTOM_TRACK_CODE_MAX);
  await refused(submitBody(huge, flownRun(huge)), 'TRACK TOO BIG');
  // Only a builder id: a built-in's, a weekly's or a city loop's would be checked as another course.
  for (const id of ['rig-loop', 'weekly-2026-W46-g2', 'city-loop', '0', 'daily', 'custom-a/b']) {
    const f = { ...t, id };
    await refused(submitBody(f, flownRun(f)), 'NOT A CUSTOM TRACK');
  }
  await refused({ ...submitBody(t, run), track: 'rig-loop' }, 'NO TRACK');
  await refused({ ...submitBody(t, run), track: null }, 'NO TRACK');
  await refused(submitBody(t, flownRun(t, { phys: PHYS_VER - 1 })), 'PHYS MISMATCH');
  await refused(submitBody(t, flownRun(t, { skip: 2 })), 'INCOMPLETE LINE');
  // The same run against a track with a gate moved off its line: not a run of that track.
  const off = { ...t, gates: t.gates.map((g, j) => (j === 2 ? { ...g, z: g.z + 5 } : g)) };
  await refused(submitBody(off, run), 'INCOMPLETE LINE');
  await refused({ ...submitBody(t, run), timeMs: run.timeMs + 900 }, 'TIME MISMATCH');
  await refused(submitBody(t, flownRun(t, { name: 'PACE BOT' })), 'PACE BOT');
  await refused({ ...submitBody(t, run), build: { frameMm: 75 } }, 'CLASS MISMATCH');
  // One sample 30 u off the line: a jump no whoop makes in 67 ms.
  const jump = flownRun(t);
  jump.ghost.samples = jump.ghost.samples.map((s, i) => (i === 10 ? [s[0], s[1] + 30, ...s.slice(2)] : s));
  await refused(submitBody(t, jump), 'SPEED LIMIT');
  const other = { ...t, id: 'custom-other' };
  await refused(submitBody(other, run), 'GHOST IS FOR TRACK custom-mhx3k2a1 — SWITCH TRACKS TO RACE IT');
  assert.equal(isCustomBoardTrackId('custom-shared-1ab2c'), true);
  assert.equal(isCustomBoardTrackId('custom'), false);
});

test('a track no board takes: a map the builder has not got, a gate it cannot make, gates a hover passes together, too many gates', async () => {
  assert.deepEqual([...CUSTOM_TRACK_MAPS].sort(), MAPS.map((m) => m.id).sort(), 'the builder\'s maps (sim-tracks.js MAPS)');
  const t = builtTrack(4);
  assert.equal(customTrackProblem(t), null);
  const run = flownRun(t);
  const refused = async (track, reason, r = flownRun(track)) => {
    const out = await normalizeTrackSubmit(submitBody(track, r));
    assert.equal(out.ok, false, reason);
    assert.equal(out.reason, reason, JSON.stringify(track.map) + ' ' + JSON.stringify(out));
  };
  for (const map of ['nowhere', ['rig'], 7, '']) await refused({ ...t, map }, 'BAD MAP', run);
  const gate = (j, g) => ({ ...t, gates: t.gates.map((x, i) => (i === j ? { ...x, ...g } : x)) });
  await refused(gate(1, { size: 1e6 }), 'BAD GATE', run);
  await refused(gate(1, { size: 0.1 }), 'BAD GATE', run);
  await refused(gate(3, { x: 401 }), 'BAD GATE', run);
  await refused(gate(3, { y: 900 }), 'BAD GATE', run);
  // Three gates stacked, and a quad hovering in all three: not a run.
  const stacked = { ...builtTrack(3), gates: [0, 1, 2].map(() => ({ x: 0, y: 2.3, z: 0, ry: 0, size: 1.8, solid: false })) };
  await refused(stacked, 'GATES TOO CLOSE', hoverRun(stacked, { x: 0, y: 2.3, z: 0 }));
  await refused(gate(1, { x: t.gates[0].x + 1, z: t.gates[0].z }), 'GATES TOO CLOSE', run);
  // A body of thousands of gates is refused on the count, before any work.
  const many = { ...t, gates: Array.from({ length: 120000 }, () => ({})) };
  const t0 = performance.now();
  const out = await normalizeTrackSubmit({ ...submitBody(t, run), track: many });
  assert.equal(out.reason, 'TRACK TOO BIG');
  assert.ok(performance.now() - t0 < 20, 'cheap: ' + (performance.now() - t0) + ' ms');
  assert.ok(CUSTOM_TRACK_GATES_SCAN_MAX * 21 > CUSTOM_TRACK_CODE_MAX, 'the count cap is past any code that fits');
});

// The Worker in this process, on the in-memory D1.
function worker() {
  const env = { DB: trackBoardsD1(), ALLOWED_ORIGIN: 'https://quadmath.com' };
  const call = async (method, path, body, ip = '203.0.113.1') => {
    const init = { method, headers: { Origin: 'https://quadmath.com', 'CF-Connecting-IP': ip } };
    if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const r = await handleLeaderboard(new Request('https://w.test' + path, init), env);
    return { status: r.status, json: await r.json() };
  };
  return { env, call };
}

test('Worker (in process): submit, a pilot\'s best kept, the board by key and class', async () => {
  const { env, call } = worker();
  const t = builtTrack(4);
  const key = await customBoardKey(t);
  let r = await call('POST', '/api/track/submit', submitBody(t, flownRun(t, { speed: 5 })));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.improved, true);
  assert.equal(r.json.key, key, 'the key from the track');
  assert.deepEqual(r.json.entries.map((e) => e.name), ['RyFly']);
  assert.equal(env.DB.tracks.size, 1);
  assert.equal(env.DB.tracks.get(key).code, customTrackCode(t));
  assert.equal(env.DB.tracks.get(key).gates, 4);
  const first = r.json.timeMs;
  // Slower: kept the best. Faster: the new best.
  r = await call('POST', '/api/track/submit', submitBody(t, flownRun(t, { speed: 4 })));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.improved, false);
  assert.equal(r.json.timeMs, first);
  r = await call('POST', '/api/track/submit', submitBody(t, flownRun(t, { speed: 6.5 })));
  assert.equal(r.json.improved, true);
  assert.ok(r.json.timeMs < first);
  const best = r.json.timeMs;
  // Another pilot, the same track under another id and name: the same board.
  const shared = { ...t, id: 'custom-shared-abc', name: 'Shared copy' };
  r = await call('POST', '/api/track/submit', submitBody(shared, flownRun(shared, { speed: 6, name: 'Kim' }), { name: 'Kim', token: pilotToken('k') }));
  assert.equal(r.json.ok, true, JSON.stringify(r.json));
  assert.equal(r.json.key, key);
  assert.deepEqual(r.json.entries.map((e) => [e.name, e.timeMs]), [['RyFly', best], ['Kim', r.json.timeMs]].sort((a, b) => a[1] - b[1]));
  assert.equal(env.DB.tracks.size, 1, 'one track row');
  r = await call('GET', '/api/track/board?key=' + key + '&class=65');
  assert.equal(r.status, 200);
  assert.equal(r.json.online, true);
  assert.equal(r.json.entries.length, 2);
  r = await call('GET', '/api/track/board?key=' + key + '&class=75');
  assert.deepEqual(r.json.entries, [], 'another class, its own board');
  r = await call('GET', '/api/track/board?key=c.0123456789abcdef.p' + PHYS_VER + '&class=65');
  assert.deepEqual(r.json.entries, [], 'a key nobody flew');
});

test('Worker (in process): refusals write no track, a forged key is refused, the rate limit holds', async () => {
  const { env, call } = worker();
  const t = builtTrack(4);
  const refused = async (body, status, reason, ip) => {
    const r = await call('POST', '/api/track/submit', body, ip);
    assert.equal(r.status, status, reason + ' ' + JSON.stringify(r.json));
    assert.equal(r.json.reason, reason);
  };
  const two = builtTrack(2);
  await refused(submitBody(two, flownRun(two)), 400, 'TOO FEW GATES', '198.51.100.1');
  const huge = hugeTrack();
  await refused(submitBody(huge, flownRun(huge)), 400, 'TRACK TOO BIG', '198.51.100.1');
  await refused(submitBody(t, flownRun(t, { skip: 1 })), 400, 'INCOMPLETE LINE', '198.51.100.1');
  await refused({ ...submitBody(t, flownRun(t)), token: 'nope' }, 400, 'NO TOKEN', '198.51.100.1');
  await refused('{not json', 400, 'BAD JSON', '198.51.100.1');
  const stacked = { ...builtTrack(3, { id: 'custom-stack' }), gates: [0, 1, 2].map(() => ({ x: 0, y: 2.3, z: 0, ry: 0, size: 1.8, solid: false })) };
  await refused(submitBody(stacked, hoverRun(stacked, { x: 0, y: 2.3, z: 0 })), 400, 'GATES TOO CLOSE', '198.51.100.1');
  await refused(submitBody({ ...t, map: 'nowhere' }, flownRun(t)), 400, 'BAD MAP', '198.51.100.1');
  assert.equal(env.DB.tracks.size, 0, 'no track row from a refused run');
  assert.equal(env.DB.scores.size, 0);
  // A name another browser claimed.
  let r = await call('POST', '/api/track/submit', submitBody(t, flownRun(t)), '198.51.100.2');
  assert.equal(r.json.ok, true);
  await refused(submitBody(t, flownRun(t), { token: pilotToken('z') }), 403, 'NAME TAKEN', '198.51.100.2');
  // A body's key is ignored; the board's key is the track's.
  r = await call('POST', '/api/track/submit', { ...submitBody(t, flownRun(t)), key: 'c.ffffffffffffffff.p' + PHYS_VER }, '198.51.100.2');
  assert.equal(r.json.key, await customBoardKey(t));
  assert.equal(env.DB.tracks.has('c.ffffffffffffffff.p' + PHYS_VER), false);
  // A key in the query that is not one.
  for (const bad of ['', 'c.0123', 'c.0123456789ABCDEF.p7', 'c.0123456789abcdef', 'c.0123456789abcdef.p0', "c.0123456789abcdef.p7' OR 1=1--", '2026-W46.p7', 'c.0123456789abcdefa.p7', '../c.0123456789abcdef.p7']) {
    r = await call('GET', '/api/track/board?key=' + encodeURIComponent(bad) + '&class=65');
    assert.equal(r.status, 400, bad);
    assert.equal(r.json.reason, 'BAD KEY', bad);
  }
  // RATE_SCORE_MAX posts an IP an hour, shared with /api/submit (not with
  // /api/line, which has its own).
  for (let i = 0; i < RATE_SCORE_MAX; i++) await call('POST', '/api/track/submit', '{}', '192.0.2.9');
  await refused(submitBody(t, flownRun(t)), 429, 'RATE LIMIT', '192.0.2.9');
  r = await call('POST', '/api/submit', '{}', '192.0.2.9');
  assert.equal(r.status, 429, 'the same count as the weekly submit');
  r = await call('GET', '/api/track/board?key=' + (await customBoardKey(t)) + '&class=65', undefined, '192.0.2.9');
  assert.equal(r.status, 200, 'reading a board is not rate limited');
});

test('the Worker\'s tables: schema.sql and migrate-track-boards.sql, idempotent, the scores table untouched', () => {
  const dir = join(root, 'workers', 'sim-leaderboard', 'src');
  const schema = readFileSync(join(dir, 'schema.sql'), 'utf8');
  const migrate = readFileSync(join(dir, 'migrate-track-boards.sql'), 'utf8');
  for (const sql of [schema, migrate]) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS custom_tracks \(\s+key TEXT PRIMARY KEY,\s+map TEXT NOT NULL,\s+gates INTEGER NOT NULL,\s+code TEXT NOT NULL,\s+created_ms INTEGER NOT NULL\s+\);/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS custom_scores \([^;]*PRIMARY KEY \(key, class, name\)\s+\);/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS custom_scores_rank ON custom_scores \(key, class, time_ms\);/);
  }
  assert.doesNotMatch(migrate, /DROP |ALTER |DELETE |INTO scores|TABLE (IF NOT EXISTS )?scores\b/, 'the migration touches only the new tables');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS scores \(\s+week TEXT NOT NULL,[^;]*PRIMARY KEY \(week, class, name\)\s+\);/, 'scores and its key as they were');
  const idx = readFileSync(join(root, 'workers', 'sim-leaderboard', 'src', 'index.js'), 'utf8');
  assert.match(idx, /INSERT OR IGNORE INTO custom_tracks/);
  assert.ok(idx.indexOf('INSERT OR IGNORE INTO custom_tracks') > idx.indexOf("path === '/api/track/submit'"));
  // The track row comes after every check and the claim, never before.
  const route = idx.slice(idx.indexOf("path === '/api/track/submit'"), idx.indexOf("path === '/api/track/board'"));
  // (postScore: the rate limit and the body; scorePilot: the token and the
  // name's claim.)
  for (const before of ['postScore(', 'normalizeTrackSubmit(', 'scorePilot(']) {
    assert.ok(route.indexOf(before) >= 0 && route.indexOf(before) < route.indexOf('INTO custom_tracks'), before);
  }
  const shared = idx.slice(idx.indexOf('async function scorePilot('), idx.indexOf('export async function handleLeaderboard('));
  for (const step of ['checkRate(', 'TOKEN_RE.test(', 'pilotFor(']) assert.ok(shared.includes(step), step);
});

test('sim.html: a builder track\'s finish goes to its board, quietly', () => {
  const extract = (name) => {
    const start = html.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, name);
    let i = html.indexOf('{', start), depth = 0;
    for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1); }
    throw new Error(name);
  };
  assert.match(extract('noteRetentionFinish'), /if\(isCustomBoardTrackId\(id\)&&!offBoards\)\{\s*if\(testPilotUsed\)held=true;\s*else maybeSubmitTrackBoard\(id, total, submitRec\|\|rec\);/);
  const submit = extract('maybeSubmitTrackBoard');
  assert.match(submit, /normalizeTrackSubmit\(body\)/, 'checked as the Worker checks it');
  assert.doesNotMatch(submit, /toast\(/, 'no toast, refused or not');
  assert.match(submit, /'\/api\/track\/submit'/);
  const fetchFn = extract('trackBoardFetch');
  // A 404 or a refusal is no board; asked for (init.refusal), a refusal says why.
  assert.match(fetchFn, /if\(!r\.ok\)\{\s*if\(!\(init&&init\.refusal\)\)return null;/, 'a 404 or a refusal is no board');
  assert.match(submit, /j\.refused&&j\.status!==429/, 'a refused run is not sent again, unless rate limited');
  assert.match(fetchFn, /AbortController/);
  assert.doesNotMatch(extract('loadTrackBoard') + fetchFn + extract('trackBoardHtml'), /toast\(/);
  assert.match(extract('applyTrackLink'), /loadTrackBoard\(t\);/, 'a link fetches its board up front');
  assert.match(extract('renderBuilderList'), /queueBuilderBoard\(\);/);
  assert.match(html, /<div id="builderBoard" hidden><\/div>/);
  assert.match(extract('trackBoardHtml'), /escapeHtml\(sanitizePilotName\(r\.name\)\)/);
  // A run is posted when it is this browser's best (or the board's first this
  // session); a refusal falls back to the board by GET instead of blanking it.
  assert.match(submit, /if\(pb&&total>pb&&trackBoardSent\.has\(sentKey\)\)return;/);
  assert.match(submit, /\}else\{[\s\S]*loadTrackBoard\(track\);/);
  // The board noted with the gates it was keyed from.
  assert.match(extract('trackBoardOf'), /e\.code===trackCodeOf\(t,fresh\)/);
  assert.match(extract('trackFitsBoard'), /customTrackProblem\(t\)/);
  assert.match(extract('trackBoardHtml'), /escapeHtml\(b\.track\.name\|\|'Custom'\)/, 'titled with the track name');
});

// ---- headless Chrome ----

function resolveChrome() {
  const names = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'chrome'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2',
  })[extname(p)] || 'application/octet-stream';
}

async function serveRoot() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    try { res.writeHead(200, { 'content-type': mime(file) }); res.end(readFileSync(file)); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  return { server, port: server.address().port };
}

// One CDP call's limit, and the longest a call waits on a flight in the page
// (flyWait): well inside it, however long the flight.
const CDP_MS = 45000;
const FLY_WAIT_MS = 8000;
// A flight's own time and pace, reported on a pass as on a failure.
const flown = (r) => `flight: ${r.ms} ms in the page, ${r.frames} frames (longest ${r.longestMs} ms), ` +
  `${r.calls} waits (longest ${r.longestCallMs} ms)`;

let cdpSeq = 0;
function cdp(ws, method, params) {
  const id = ++cdpSeq;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), CDP_MS);
    function on(msg) {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        if (o.id === id) {
          clearTimeout(t);
          ws.removeEventListener('message', on);
          if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error)));
          else resolve(o.result || {});
        }
      } catch (e) { /* ignore */ }
    }
    ws.addEventListener('message', on);
  });
}

async function evaluate(ws, expression) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
  return r.result ? r.result.value : undefined;
}

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// Before the page's scripts: every toast, in order, and every page error.
const WATCH = String.raw`(() => {
  window.__toasts = [];
  window.__errors = [];
  addEventListener('error', (e) => window.__errors.push(String(e.message)));
  addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
  const hook = () => {
    const el = document.getElementById('toast');
    if (!el) return false;
    new MutationObserver(() => {
      const t = el.textContent;
      if (t && window.__toasts[window.__toasts.length - 1] !== t) window.__toasts.push(t);
    }).observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
})()`;

const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(16); }
    return !!fn();
  };
  const $ = (id) => document.getElementById(id);
  async function flyGates(ws) {
    const track = s.tracks().find((t) => t.id === s.track());
    const b = s.bfCore();
    const counter = () => (/ GATE (\d+)\//.exec($('osdGate').textContent) || [])[1];
    for (const g of track.gates) {
      const before = counter();
      const put = (up) => b.teleport({ x: -g.z / ws, y: -g.x / ws, z: (g.y + up) / ws }, { x: 0, y: 0, z: 0, w: 1 });
      put(0);
      let counted = await until(() => counter() !== before, 600);
      for (let i = 0; i < 3 && !counted; i++) {
        put(3 * (g.size || 2));
        await wait(120);
        put(0);
        counted = await until(() => counter() !== before, 600);
      }
      await wait(150);
    }
    const done = await until(() => !!$('toastShare'), 3000);
    return { gates: track.gates.length, done, toast: $('toast').textContent };
  }
  // A run the Worker takes: from gate 0 along the line through every gate at
  // speed u/s, the quad put on the path every frame (the core's teleport), with
  // a weave so it is no pace bot's straight line. ws: scene units per metre.
  // A gate counts when the page, which looks once a frame after the frame's
  // step of the core, finds the quad entering its sphere (sim-tracks.js
  // detectPassOrMiss); entering any other gate is a miss. On a slow runner:
  // - No frame moves the quad more than half the smallest gate's radius along
  //   the path: one long frame had stepped it past a gate whole ("MISSED
  //   GATE"). A long frame slows the run; it skips nothing.
  // - A step is up to 250 ms of sim time, in which a quad put at rest falls
  //   0.3 m: out of a sphere it was in, and back in at the next put, a miss.
  //   So it is put rising at the speed 250 ms of free fall brings back to the
  //   path (as test_sim_csp.mjs does): at the page's look it is within 8 cm.
  // - The loop starts at gate 0's sphere edge, so a quad that fell from the
  //   start gate while the page counted it does not come back into it, and it
  //   stops once the finish has counted, so nothing re-enters the last gate.
  // - The flight runs in the page from its start to its end and never waits on
  //   the test: a pause between calls would leave the quad falling, out of a
  //   gate and back in. The test starts it (flyStart), then waits on it in
  //   calls of a few seconds each (flyWait), so a slow runner's long flight
  //   spans many calls and none comes near a CDP call's limit.
  async function flyPath(ws, speed, progress = {}) {
    const track = s.tracks().find((t) => t.id === s.track());
    const b = s.bfCore();
    const RISE = 9.81 * 0.125; // m/s up: back on the path after 250 ms of free fall
    const put = (p) => b.teleport({ x: -p.z / ws, y: -p.x / ws, z: p.y / ws }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: RISE });
    const counter = () => (/ GATE (\d+)\//.exec($('osdGate').textContent) || [])[1];
    const pts = track.gates.map((g) => ({ x: g.x, y: g.y, z: g.z }));
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      seg.push(d); total += d;
    }
    const at = (dist) => {
      let i = 0, s0 = dist;
      while (i < seg.length - 1 && s0 > seg[i]) { s0 -= seg[i]; i++; }
      const f = seg[i] > 0 ? Math.min(1, s0 / seg[i]) : 0;
      const a = pts[i], c = pts[i + 1];
      const w = 0.3 * Math.sin(Math.PI * 7 * Math.min(1, dist / total));
      return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f + w, z: a.z + (c.z - a.z) * f + w };
    };
    // Into gate 0: the run starts.
    const before = counter();
    put(pts[0]);
    const started = await until(() => counter() !== before, 2000);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const maxStep = Math.min(...track.gates.map((g) => g.r)) / 2;
    if (!(maxStep > 0)) throw new Error('flyPath: no gate radius on ' + track.id);
    const finished = () => !!$('toastShare');
    let d = track.gates[0].r + 0.05, last = performance.now(), frames = 0, longestMs = 0;
    progress.total = total;
    while (d < total && !finished()) {
      put(at(d));
      await frame();
      const now = performance.now(), ms = now - last;
      last = now; frames++; longestMs = Math.max(longestMs, ms);
      d += Math.min(ms / 1000 * speed, maxStep);
      progress.frames = frames; progress.d = d;
    }
    if (!finished()) put(pts[pts.length - 1]);
    const done = await until(finished, 3000);
    return { started, done, total, toast: $('toast').textContent, toasts: (window.__toasts || []).slice(), frames, longestMs: Math.round(longestMs), maxStep };
  }
  // One flight at a time: started here, flown by flyPath to its end.
  let flight = null;
  function flyStart(ws, speed) {
    if (flight && !flight.over) throw new Error('flyStart: a flight is still on');
    const f = { over: false, result: null, error: null, progress: { frames: 0, d: 0, total: 0 }, t0: performance.now(), ms: 0 };
    flight = f;
    flyPath(ws, speed, f.progress)
      .then((r) => { f.result = r; }, (e) => { f.error = String((e && e.stack) || e); })
      .finally(() => { f.ms = Math.round(performance.now() - f.t0); f.over = true; });
    return true;
  }
  // Waits up to ms for the flight's end: its result then, else where it is.
  async function flyWait(ms) {
    const f = flight;
    if (!f) throw new Error('flyWait: no flight started');
    await until(() => f.over, ms);
    if (f.error) throw new Error('flyPath: ' + f.error);
    if (!f.over) return { over: false, ...f.progress, ms: Math.round(performance.now() - f.t0) };
    return { over: true, ...f.result, ms: f.ms };
  }
  // The lap panel's board block, as the pilot sees it.
  function board() {
    const el = document.querySelector('#osdLap .lap-board');
    return el ? { text: el.innerText, button: !!$('lapBoard') } : null;
  }
  function landed() {
    return { map: s.map(), track: s.track(), board: board(), toasts: window.__toasts.slice(), errors: window.__errors.slice(),
      lap: $('osdLap').innerText, best: localStorage.getItem('quadmathSimBestRun_' + s.track()) };
  }
  window.__tb = { s, wait, until, $, flyGates, flyPath, flyStart, flyWait, board, landed };
  return true;
})()`;

test('track boards in Chrome: a link\'s run lands on its board, a second profile sees it, a down or old Worker breaks nothing', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;
  // The leaderboard Worker in this process (its real handler, the in-memory
  // D1), answering the page's requests to the deployed Worker's address.
  const wk = { env: { DB: trackBoardsD1(), ALLOWED_ORIGIN: origin }, mode: 'up', calls: [] };

  async function pass(url, seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-tb-'));
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=1280,720',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let ws = null;
    try {
      let debugPort = 0;
      for (let i = 0; i < 100 && !debugPort; i++) {
        await sleep(100);
        try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
      }
      assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
      let page = null;
      for (let i = 0; i < 100 && !page; i++) {
        await sleep(100);
        try {
          const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
          page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
        } catch (e) { /* Chrome is still coming up */ }
      }
      assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      // Every request to the Worker's address stops here: answered by the
      // handler, refused (down), or 404 (a Worker without these routes).
      ws.addEventListener('message', async (msg) => {
        let o = null;
        try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
        if (!o || o.method !== 'Fetch.requestPaused') return;
        const { requestId, request } = o.params;
        const path = new URL(request.url).pathname;
        wk.calls.push(request.method + ' ' + path);
        try {
          if (wk.mode === 'down') { await cdp(ws, 'Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }); return; }
          if (wk.mode === 'old' && path.startsWith('/api/track/')) {
            await cdp(ws, 'Fetch.fulfillRequest', { requestId, responseCode: 404,
              responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }],
              body: Buffer.from(JSON.stringify({ ok: false, reason: 'NOT FOUND' })).toString('base64') });
            return;
          }
          const headers = { ...request.headers };
          if (!Object.keys(headers).some((k) => k.toLowerCase() === 'origin')) headers.Origin = origin;
          const init = { method: request.method, headers };
          if (request.postData != null) init.body = request.postData;
          const res = await handleLeaderboard(new Request(request.url, init), wk.env);
          await cdp(ws, 'Fetch.fulfillRequest', {
            requestId, responseCode: res.status,
            responseHeaders: [...res.headers].map(([name, value]) => ({ name, value })),
            body: Buffer.from(await res.arrayBuffer()).toString('base64'),
          });
        } catch (e) {
          try { await cdp(ws, 'Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch (e2) { /* the page is gone */ }
        }
      });
      await cdp(ws, 'Runtime.enable');
      await cdp(ws, 'Page.enable');
      await cdp(ws, 'Fetch.enable', { patterns: [{ urlPattern: LEADERBOARD_URL + '/*' }] });
      await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
      await cdp(ws, 'Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        return true;
      })()`);
      await cdp(ws, 'Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(250);
        try {
          ready = await evaluate(ws, `!!(window._sim && window._simQueryBooted && window._sim.core() === 'bf' && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._ttff)`);
        } catch (e) { /* the page is still loading */ }
      }
      assert.ok(ready, 'the page booted on the bf core');
      await evaluate(ws, PAGE);
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const S = window.__tb; ${body} })()`));
      // A flight runs in the page from start to finish (S.flyStart). Each call
      // here waits on it for at most FLY_WAIT_MS, so a long flight on a slow
      // runner spans calls and no call comes near CDP_MS. A flight that lands
      // no frame in CDP_MS fails, as one call that long did.
      const fly = async (speed) => {
        const t0 = Date.now();
        await js(`S.flyStart(${WS}, ${speed}); return 'true';`);
        let calls = 0, longestCallMs = 0, frames = -1, moved = Date.now();
        for (;;) {
          const c0 = Date.now();
          const r = await js(`return JSON.stringify(await S.flyWait(${FLY_WAIT_MS}));`);
          calls++; longestCallMs = Math.max(longestCallMs, Date.now() - c0);
          if (r.over) return { ...r, calls, longestCallMs, wallMs: Date.now() - t0 };
          if (r.frames !== frames) { frames = r.frames; moved = Date.now(); }
          else if (Date.now() - moved > CDP_MS) throw new Error(`flyPath: no frame in ${CDP_MS} ms: ` + JSON.stringify(r));
        }
      };
      const click = async (id) => {
        const p = JSON.parse(await evaluate(ws, `(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return JSON.stringify({ found: false });
          const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
          return JSON.stringify({ found: true, x, y, hit: document.elementFromPoint(x, y) === el }); })()`));
        assert.ok(p.found && p.hit, id + ' is there to click ' + JSON.stringify(p));
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
          await cdp(ws, 'Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        }
      };
      await flow({ js, click, fly });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
      }
    }
  }

  // A shared track on the Rig, as a link: the gates of the Rig Loop's first
  // four, so the bf core's teleport can reach them.
  const loop = JSON.parse(readFileSync(join(root, 'tracks', 'rig-loop.json'), 'utf8'));
  const track = { id: 'custom-mhx3k2a1', name: 'Desk loop', map: 'rig', gates: loop.gates.slice(0, 4), flags: [] };
  const link = trackLink({ origin, path: '/sim.html', map: 'rig', code: encodeShare(track) }).replace('?', '?quality=low&');
  const key = await customBoardKey(track);
  const pilot = (name, seed) => ({ storage: { quadmathSimInputChoice: 'keyboard', quadmath_pilotName: name, quadmathSimPilotToken: pilotToken(seed) } });

  try {
    await t.test('a pilot opens the link and races: the run lands on the track\'s board, on the lap panel and its card', async (st) => {
      await pass(link, pilot('RyFly', 'r'), async ({ js, click, fly }) => {
        let r = await js(`await S.until(() => !!S.board(), 4000); return JSON.stringify(S.landed());`);
        assert.equal(r.track, track.id);
        assert.ok(wk.calls.some((c) => c === 'GET /api/track/board'), 'the board asked for up front: ' + wk.calls.join(', '));
        assert.ok(r.board, 'an (empty) board before the first run: ' + r.lap);
        assert.match(r.board.text, /Desk loop · online/);
        assert.match(r.board.text, /No online times yet/);
        r = await fly(6);
        st.diagnostic(flown(r));
        assert.equal(r.done, true, 'raced to the finish: ' + JSON.stringify(r));
        r = await js(`await S.until(() => S.board() && /RyFly/.test(S.board().text), 5000); return JSON.stringify(S.landed());`);
        assert.ok(wk.calls.includes('POST /api/track/submit'), wk.calls.join(', '));
        assert.match(r.board.text, /1 RyFly \d/, 'the run on the board: ' + r.board.text);
        assert.equal(r.errors.length, 0, r.errors.join(' | '));
        assert.ok(!r.toasts.some((x) => /NOT SENT|ONLINE|RATE|TAKEN|BAD/.test(x)), 'no board toasts: ' + JSON.stringify(r.toasts));
        const row = [...wk.env.DB.scores.values()][0];
        assert.equal(row.key, key, 'the board keyed by the gates');
        assert.equal(wk.env.DB.tracks.get(key).gates, 4);
        // The Board button: the top 20 on a card titled with the track's name.
        await click('lapBoard');
        r = await js(`await S.wait(400); return JSON.stringify({ h: (document.querySelector('#menuLayer h2') || {}).textContent, body: S.$('trackBoardBody') && S.$('trackBoardBody').innerText });`);
        assert.equal(r.h, 'Desk loop');
        assert.match(r.body, /Online · top 20[\s\S]*1 RyFly/);
        assert.match(r.body, /This browser[\s\S]*RyFly/);
      });
    });

    await t.test('a second fresh profile opens the same link: the time to chase is there before it flies', async () => {
      const before = wk.calls.filter((c) => c.startsWith('POST')).length;
      await pass(link, pilot('Kim', 'k'), async ({ js }) => {
        const r = await js(`await S.until(() => S.board() && /RyFly/.test(S.board().text), 6000); return JSON.stringify(S.landed());`);
        assert.ok(r.board, 'the board: ' + r.lap);
        assert.match(r.board.text, /1 RyFly/, r.board.text);
        assert.equal(r.best, null, 'nothing flown in this profile');
        assert.equal(wk.calls.filter((c) => c.startsWith('POST')).length, before, 'nothing posted');
        // The builder, on a copy of this track (the same gates): its board in the dock.
        const b = await js(`S.s.openTrackPicker('rig'); await S.wait(300); S.$('pickerBuild').click();
          await S.until(() => !S.$('builderBoard').hidden, 4000);
          return JSON.stringify({ on: document.body.classList.contains('builder-on'), hidden: S.$('builderBoard').hidden, text: S.$('builderBoard').innerText });`);
        assert.equal(b.on, true);
        assert.equal(b.hidden, false, 'the builder shows the board');
        assert.match(b.text, /Desk loop copy · online top 20[\s\S]*1 RyFly/, 'titled with the draft\'s name: ' + b.text);
      });
    });

    await t.test('the page computes the floor of each built-in board as the Worker does (sim-retention.js builtinFloorMs)', async () => {
      const want = {};
      for (const bt of BUILTIN_BOARD_TRACKS) want[bt.id] = CLASS_IDS.map((c) => builtinFloorMs(bt, c));
      await pass(link, pilot('Floor', 'f'), async ({ js }) => {
        const got = await js(`const out = {}; for (const id of ${JSON.stringify(Object.keys(want))}) out[id] = ${JSON.stringify(CLASS_IDS)}.map((c) => S.s.builtinFloorMs(id, c)); return JSON.stringify(out);`);
        assert.deepEqual(got, want, 'the tracks of the page give the floors of the Worker');
      });
    });

    for (const mode of ['down', 'old']) {
      await t.test(`the Worker ${mode === 'down' ? 'down' : 'without these routes (404)'}: the link boots, races and keeps its local best, with no board and no error toast`, async (st) => {
        wk.mode = mode;
        try {
          await pass(link, pilot('Ana', 'a'), async ({ js, fly }) => {
            let r = await js(`await S.wait(1500); return JSON.stringify(S.landed());`);
            assert.equal(r.track, track.id);
            assert.equal(r.board, null, 'no board: ' + r.lap);
            wk.calls.length = 0;
            r = await fly(6);
            st.diagnostic(flown(r));
            assert.equal(r.done, true, 'raced to the finish: ' + JSON.stringify(r));
            // The send comes from the finish, in the sim's time: waited for
            // (up to 10 s), then the same 1.5 s for any toast it would raise.
            for (let i = 0; i < 100 && !wk.calls.some((c) => c.endsWith(' /api/track/submit')); i++) await sleep(100);
            r = await js(`await S.wait(1500); return JSON.stringify(S.landed());`);
            // The page tried to send it: its preflight (OPTIONS) or the POST, which a
            // down or 404 Worker fails.
            assert.ok(wk.calls.some((c) => c.endsWith(' /api/track/submit')), 'the run was sent, and failed: ' + wk.calls.join(', '));
            assert.equal(r.board, null);
            assert.ok(r.best && +r.best > 0, 'the local best: ' + r.best);
            assert.equal(r.errors.length, 0, r.errors.join(' | '));
            assert.ok(!r.toasts.some((x) => /NOT SENT|ONLINE|UNAVAILABLE|NOT FOUND|BAD|ERROR/.test(x)), 'no error toast: ' + JSON.stringify(r.toasts));
            assert.ok(r.toasts.some((x) => /^LINE \d/.test(x)), 'the finish card as always');
          });
        } finally { wk.mode = 'up'; }
      });
    }
  } finally {
    server.close();
  }
});
