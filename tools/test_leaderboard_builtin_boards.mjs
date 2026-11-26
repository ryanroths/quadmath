// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The leaderboard Worker's built-in track boards, pilot names, bans, copied
// runs, test-pilot runs and rate budgets, run in process on real SQLite made
// from schema.sql (tools/d1_sqlite.mjs), and migrate-builtin-boards.sql on a
// database as production has it.
//
//   node --test tools/test_leaderboard_builtin_boards.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePaceGhost, PUBLIC_MAPS, isSprintTrackId } from '../sim-tracks.js';
import {
  PHYS_VER, builtinTrackHash, builtinBoardKey, BUILTIN_BOARD_KEY_RE, BUILTIN_BOARD_ROWS, BUILTIN_BOARD_GHOSTS,
  lineRunPasses, lineRunSplits, hashPilotToken, ghostDigest, dailyLineFor, utcDateId, addUtcDays, MISS_PENALTY_MS,
  builtinFloorMs, BUILTIN_FLOOR_MARGIN, normalizeBuiltinSubmit, CLASS_MAX_SPEED, CLASS_IDS, DAILY_LINE_MIN_MS,
} from '../sim-retention.js';
import { encodeLineCode, decodeLineCode } from '../sim-share.js';
import { pilotNameKey, pilotNameProblem, NAME_BLOCK_ROOTS } from '../sim-pilot-names.js';
import { BUILTIN_BOARD_TRACKS } from '../sim-builtin-boards.js';
import { builtinBoardsModule, builtinBoardTracks } from './build_builtin_boards.mjs';
import { sqliteD1, LEADERBOARD_SQL_DIR } from './d1_sqlite.mjs';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';
import { RATE_SCORE_MAX, RATE_SHARE_MAX } from '../sim-retention.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// A pilot token (32 hex) from one hex character.
const token = (c) => { assert.match(c, /^[0-9a-f]$/); return c.repeat(32); };
const track = (id) => BUILTIN_BOARD_TRACKS.find((t) => t.id === id);

async function call(env, method, path, body, ip = '198.51.100.1') {
  const init = { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const r = await handleLeaderboard(new Request('https://x' + path, init), env);
  return { status: r.status, json: await r.json() };
}

// A run as the page records it on a one-pass track: 15 Hz on sim time from
// the gate-0 frame, the finish frame (entering the last gate's sphere) last,
// off the pace bot's line by a weave whose phase is the seed, so two pilots'
// runs (two seeds) are a quarter unit or more apart on average, as two
// people's lines are.
function pageRun(t, { speed = 8, seed = 0, name = 'RyFly', gates = t.gates } = {}) {
  const g = makePaceGhost(gates, { track: t.id, name, speed, hz: 15, laps: 1 });
  // Each seed its own weave rate and phase, so no two seeds' lines line up.
  for (let i = 0; i < g.samples.length; i++) g.samples[i][2] += 0.08 + 0.45 * Math.sin(i * (0.17 + 0.043 * seed) + seed * 2.4);
  const fin = t.gates[t.gates.length - 1];
  const r = fin.size * 0.8;
  const d = (p) => Math.hypot(p[1] - fin.x, p[2] - fin.y, p[3] - fin.z);
  const s = g.samples;
  for (let i = Math.floor(s.length / 2); i < s.length; i++) {
    if (d(s[i]) >= r) continue;
    const a = s[i - 1], b = s[i];
    let lo = 0, hi = 1;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (d(a.map((v, j) => v + (b[j] - v) * m)) < r) hi = m; else lo = m; }
    const e = a.map((v, j) => v + (b[j] - v) * hi);
    e[0] = Math.round(e[0]);
    g.samples = s.slice(0, i).concat([e]);
    break;
  }
  g.phys = PHYS_VER;
  g.lapTime = g.samples[g.samples.length - 1][0];
  return g;
}

// A run whose time from gate 0 to the finish is within 100 ms of ms: a smooth
// page-shaped run (pageRun) at the speed that lands it there, near the class
// cap. Submitted with timeMs set to ms, which the board takes as its time
// (the ghost's, within LINE_TIME_TOL_MS).
function runNear(t, ms, { seed = 0, name = 'RyFly' } = {}) {
  for (let speed = 41; speed <= 47.5; speed += 0.125) {
    const g = pageRun(t, { speed, seed, name });
    const p = lineRunPasses(g.samples, t);
    if (p.start < 0 || p.finish < 0) continue;
    if (Math.abs(g.samples[p.finish][0] - g.samples[p.start][0] - ms) <= 100) return g;
  }
  throw new Error('no run near ' + ms + ' ms on ' + t.id);
}

async function body(t, ghost, extra = {}) {
  return {
    track: t.id, trackHash: await builtinTrackHash(t), frameMm: 65, build: { frameMm: 65 },
    name: ghost.name, timeMs: ghost.lapTime, ghost, token: token('a'), ...extra,
  };
}

test('sim-builtin-boards.js is the public maps\' tracks, as tracks/*.json has them', () => {
  const have = readFileSync(join(root, 'sim-builtin-boards.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(have, builtinBoardsModule(), 'node tools/build_builtin_boards.mjs --write');
  assert.deepEqual(BUILTIN_BOARD_TRACKS.map((t) => t.id), ['rig-loop', 'rig-sprint', 'house-loop', 'house-sprint', 'house-backyard-lap', 'depot-loop', 'depot-sprint', 'bando-loop-v2']);
  assert.deepEqual([...new Set(BUILTIN_BOARD_TRACKS.map((t) => t.map))].sort(), [...PUBLIC_MAPS].sort());
  for (const t of builtinBoardTracks()) {
    const file = JSON.parse(readFileSync(join(root, 'tracks', t.id + '.json'), 'utf8'));
    assert.deepEqual(track(t.id).gates, file.gates.map(({ x, y, z, ry, size, solid }) => ({ x, y, z, ry, size, solid: !!solid })), t.id);
  }
});

test('the Worker entry module exports only functions and its handler (workerd reads every export as an entrypoint)', async () => {
  const mod = await import('../workers/sim-leaderboard/src/index.js');
  for (const [k, v] of Object.entries(mod)) {
    assert.ok(typeof v === 'function' || (k === 'default' && typeof v.fetch === 'function'), k + ' is a ' + typeof v);
  }
});

test('names: the rules, look-alikes are one key, reserved and blocked names refused', () => {
  for (const ok of ['RyFly', 'Ry Fly', 'ry_fly', 'Nigel', 'Shelly', 'Hancock', 'Bass', 'Therapist', 'Alice_99', 'Swanky', 'Dickson']) {
    assert.equal(pilotNameProblem(ok), null, ok);
  }
  const cases = {
    '': 'SET A NAME', PILOT: 'SET A NAME', P1LOT: 'SET A NAME', Ry: 'BAD NAME', 'RyFly!': 'BAD NAME', '_Ry': 'BAD NAME',
    'Ry__Fly': 'BAD NAME', 'ÜberFly': 'BAD NAME', '12345': 'BAD NAME', ThisNameIsWayTooLong: 'BAD NAME',
    'Pace Bot': 'NAME NOT ALLOWED', QuadMath: 'NAME NOT ALLOWED', 'f.u.c.k': 'NAME NOT ALLOWED', FvcK: 'NAME NOT ALLOWED',
    'sh1t': 'NAME NOT ALLOWED', 'Sh1t Fly': 'NAME NOT ALLOWED', Cum: 'NAME NOT ALLOWED',
  };
  for (const [n, why] of Object.entries(cases)) assert.equal(pilotNameProblem(n), why, JSON.stringify(n));
  for (const n of ['RYFLY', 'ry_fly', 'Ry Fly', 'RyFIy', 'RyF1y', 'Ry.Fly', '  RyFly ']) assert.equal(pilotNameKey(n), pilotNameKey('RyFly'), n);
  assert.ok(NAME_BLOCK_ROOTS.every((w) => w.base.length >= 3));
  // The rn and vv folds are not read into the words: "porn" is not "pom".
  for (const ok of ['Pompey', 'Pomelo', 'PomPom', 'Tompom', 'Cornelius']) assert.equal(pilotNameProblem(ok), null, ok);
  for (const bad of ['Fuuck', 'Phuck', 'VVhore', 'P0rn', 'Asss', 'Pisss', 'Dickk']) assert.equal(pilotNameProblem(bad), 'NAME NOT ALLOWED', bad);
});

test('a built-in board takes an honest run on each of the five tracks: splits, digest, ghost, place', async () => {
  const env = { DB: sqliteD1() };
  for (const t of BUILTIN_BOARD_TRACKS) {
    const ghost = pageRun(t);
    const r = await call(env, 'POST', '/api/builtin/submit', await body(t, ghost));
    assert.equal(r.status, 200, t.id + ': ' + r.json.reason);
    assert.equal(r.json.improved, true);
    assert.equal(r.json.rank, 1);
    assert.equal(r.json.count, 1);
    assert.equal(r.json.key, await builtinBoardKey(t));
    assert.match(r.json.key, BUILTIN_BOARD_KEY_RE);
    const row = env.DB.rows('SELECT * FROM track_scores WHERE board = ' + "'" + r.json.key + "'")[0];
    const splits = JSON.parse(row.splits);
    assert.equal(splits.length, t.gates.length - 1, t.id + ' one split a gate after gate 0');
    assert.equal(splits[splits.length - 1], ghost.lapTime);
    assert.deepEqual(splits, lineRunSplits(ghost.samples, lineRunPasses(ghost.samples, t)));
    assert.equal(row.digest, await ghostDigest(ghost));
    assert.equal(row.name_key, 'ryfly');
    assert.equal(row.track_id, t.id);
    const kept = env.DB.rows('SELECT ghost FROM track_ghosts WHERE board = ' + "'" + r.json.key + "'");
    assert.equal(kept.length, 1, 'its ghost kept (top ' + BUILTIN_BOARD_GHOSTS + ')');
    assert.deepEqual(JSON.parse(kept[0].ghost).samples, JSON.parse(JSON.stringify(ghost.samples)));
    const b = await call(env, 'GET', '/api/builtin/board?track=' + t.id + '&class=65&name=ry_fly');
    assert.equal(b.json.count, 1);
    assert.equal(b.json.hash, await builtinTrackHash(t));
    assert.deepEqual(b.json.you, { rank: 1, name: 'RyFly', timeMs: ghost.lapTime });
    assert.equal(b.json.entries[0].name, 'RyFly');
    const g = await call(env, 'GET', '/api/builtin/ghost?track=' + t.id + '&class=65&name=RyFly');
    assert.equal(g.status, 200);
    assert.equal(g.json.ghost.samples.length, ghost.samples.length);
  }
  const tops = await call(env, 'GET', '/api/builtin/tops?class=65');
  assert.deepEqual(Object.keys(tops.json.tops), BUILTIN_BOARD_TRACKS.map((t) => t.id));
  for (const t of BUILTIN_BOARD_TRACKS) assert.equal(tops.json.tops[t.id].top.name, 'RyFly');
  // Another class: its own board.
  const other = await call(env, 'GET', '/api/builtin/board?track=rig-loop&class=75');
  assert.equal(other.json.count, 0);
  // A miss is two seconds on the page's time: it stands.
  const t = track('rig-loop');
  const slow = pageRun(t, { speed: 6, seed: 1 });
  const r = await call(env, 'POST', '/api/builtin/submit', await body(t, slow, { timeMs: slow.lapTime + MISS_PENALTY_MS }));
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(r.json.improved, false, 'slower than the best: kept the best');
});

test('a built-in board refuses another track, a changed one, a test pilot\'s run and a pace bot', async () => {
  const env = { DB: sqliteD1() };
  const t = track('depot-loop');
  const ghost = pageRun(t);
  const refused = async (b, status, reason) => {
    const r = await call(env, 'POST', '/api/builtin/submit', b);
    assert.equal(r.status, status, JSON.stringify(r.json));
    assert.equal(r.json.reason, reason);
  };
  for (const id of ['custom-abc', 'living-sofa', 'city-loop', 'weekly-2026-W47-g2', 'room-practice', 'bando-loop', '']) {
    await refused({ ...(await body(t, ghost)), track: id }, 400, 'NO BOARD');
  }
  await refused({ ...(await body(t, ghost)), trackHash: '0123456789abcdef' }, 400, 'TRACK CHANGED');
  await refused({ ...(await body(t, ghost)), trackHash: undefined }, 400, 'TRACK CHANGED');
  // Flown on a copy with one gate moved 4 u sideways: the right hash, the
  // wrong gates.
  const k = 3;
  const moved = t.gates.map((g, i) => (i === k ? { ...g, x: g.x + 4 * Math.cos(g.ry), z: g.z - 4 * Math.sin(g.ry) } : g));
  await refused(await body(t, pageRun(t, { gates: moved, seed: 2 })), 400, 'INCOMPLETE LINE');
  await refused(await body(t, { ...ghost, testPilot: true }), 400, 'TEST PILOT');
  await refused(await body(t, { ...ghost, phys: PHYS_VER - 1 }), 400, 'PHYS MISMATCH');
  await refused(await body(t, { ...ghost, track: 'rig-loop' }), 400, 'GHOST IS FOR TRACK rig-loop — SWITCH TRACKS TO RACE IT');
  const bot = makePaceGhost(t.gates, { track: t.id, name: 'RyFly', speed: 8, hz: 16, laps: 1 });
  bot.phys = PHYS_VER;
  await refused(await body(t, bot, { timeMs: bot.samples[bot.samples.length - 1][0] }), 400, 'PACE BOT');
  await refused(await body(t, ghost, { frameMm: 65, build: { frameMm: 85 } }), 400, 'CLASS MISMATCH');
  await refused(await body(t, ghost, { timeMs: ghost.lapTime - 500 }), 400, 'TIME MISMATCH');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM track_scores')[0].n, 0, 'nothing stored');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM pilot_keys')[0].n, 0, 'no name claimed by a refused run');
});

test('names on every board: rules, look-alike claims, D1-blocked words, bans', async () => {
  const env = { DB: sqliteD1() };
  const t = track('rig-loop');
  const post = async (name, tok, seed, path = '/api/builtin/submit') => call(env, 'POST', path, await body(t, pageRun(t, { seed, name }), { name, token: tok }));
  let r = await post('Ry', token('a'), 1);
  assert.equal(r.json.reason, 'BAD NAME');
  r = await post('PILOT', token('a'), 1);
  assert.equal(r.json.reason, 'SET A NAME');
  r = await post('Sh1t Fly', token('a'), 1);
  assert.equal(r.json.reason, 'NAME NOT ALLOWED');
  r = await post('RyFly', token('a'), 1);
  assert.equal(r.status, 200, r.json.reason);
  // Another browser under a look-alike of a held name.
  for (const n of ['ry_fly', 'RYFLY', 'RyFIy', 'Ry Fly']) {
    r = await post(n, token('b'), 2);
    assert.equal(r.status, 403, n);
    assert.equal(r.json.reason, 'NAME TAKEN', n);
  }
  // The same browser under a look-alike: its name, as claimed.
  r = await post('RYFLY', token('a'), 3);
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(r.json.name, 'RyFly');
  // A word Ryan blocks in D1, matched on the key.
  // The Worker reads the list at most once a minute: a minute on, it holds.
  env.DB.exec("INSERT INTO blocked_names (word) VALUES ('Zorg')");
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 61_000 });
  try {
    r = await post('Z0rg_99', token('c'), 4);
  } finally {
    mock.timers.reset();
  }
  assert.equal(r.json.reason, 'NAME NOT ALLOWED');
  // The one-line commands in DEPLOY.md, run as written (on 'somekey' and
  // 'someword'): a ban, lifted; a word blocked; rows deleted; a name freed.
  const deploy = readFileSync(join(root, 'workers', 'sim-leaderboard', 'DEPLOY.md'), 'utf8');
  const section = deploy.slice(deploy.indexOf('### One-line commands'), deploy.indexOf('## "Fly my line"'));
  const commands = [...section.matchAll(/--command "([^"]+)"/g)].map((m) => m[1]);
  const run = (match, key, word) => {
    const sql = commands.find((c) => c.includes(match));
    assert.ok(sql, 'DEPLOY.md has: ' + match);
    env.DB.exec(sql.replace(/somekey/g, key).replace(/someword/g, word || 'someword'));
  };
  r = await post('Banned Pilot', token('d'), 5);
  assert.equal(r.status, 200, r.json.reason);
  const banned = pilotNameKey('Banned Pilot');
  run('INTO bans', banned);
  r = await post('Banned Pilot', token('d'), 6);
  assert.equal(r.status, 403);
  assert.equal(r.json.reason, 'BANNED');
  const code = await encodeLineCode({ ghost: pageRun(t, { seed: 7, name: 'Banned Pilot' }) });
  r = await call(env, 'POST', '/api/line', { code, token: token('d') });
  assert.equal(r.json.reason, 'BANNED', 'and their SHARE');
  run('DELETE FROM bans', banned);
  r = await post('Banned Pilot', token('d'), 8);
  assert.equal(r.status, 200, 'the ban lifted: ' + r.json.reason);
  run('INTO blocked_names', '', 'Grox');
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 200_000 }); // past the cache the check above filled
  try { r = await post('Gr0x Pilot', token('e'), 9); } finally { mock.timers.reset(); }
  assert.equal(r.json.reason, 'NAME NOT ALLOWED');
  assert.ok(env.DB.rows(`SELECT COUNT(*) AS n FROM track_scores WHERE name_key = '${banned}'`)[0].n === 1);
  run('DELETE FROM track_scores', banned);
  assert.equal(env.DB.rows(`SELECT COUNT(*) AS n FROM track_scores WHERE name_key = '${banned}'`)[0].n, 0);
  assert.equal(env.DB.rows(`SELECT COUNT(*) AS n FROM track_ghosts WHERE name_key = '${banned}'`)[0].n, 0);
  run('DELETE FROM pilot_keys', banned);
  r = await post('Banned Pilot', token('f'), 10);
  assert.equal(r.status, 200, 'the name freed, another browser takes it: ' + r.json.reason);
});

test('a run already posted or shared under another name is refused', async () => {
  const env = { DB: sqliteD1() };
  const t = track('house-loop');
  const alice = pageRun(t, { name: 'Alice', seed: 1 });
  let r = await call(env, 'POST', '/api/builtin/submit', await body(t, alice, { token: token('a') }));
  assert.equal(r.status, 200, r.json.reason);
  r = await call(env, 'POST', '/api/builtin/submit', await body(t, { ...alice, name: 'Bobby' }, { name: 'Bobby', token: token('b') }));
  assert.equal(r.status, 403);
  assert.equal(r.json.reason, 'COPIED RUN');
  // Her own run again: no new best, no refusal.
  r = await call(env, 'POST', '/api/builtin/submit', await body(t, alice, { token: token('a') }));
  assert.equal(r.status, 200);
  // A shared line: whoever downloads it can't post it as theirs.
  const shared = pageRun(t, { name: 'Alice', seed: 2 });
  const code = await encodeLineCode({ ghost: shared });
  r = await call(env, 'POST', '/api/line', { code, token: token('a') });
  assert.equal(r.status, 200, r.json.reason);
  // A SHARE under a name another browser holds does not claim the run for it.
  const other = await encodeLineCode({ ghost: pageRun(t, { name: 'Alice', seed: 4 }) });
  assert.equal((await call(env, 'POST', '/api/line', { code: other, token: token('d') })).status, 200);
  const od = await ghostDigest((await decodeLineCode(other)).ghost);
  assert.equal(env.DB.rows(`SELECT COUNT(*) AS n FROM ghost_digests WHERE digest = '${od}'`)[0].n, 0);
  // Without a pilot token, no SHARE (a banned browser can't leave it out).
  assert.equal((await call(env, 'POST', '/api/line', { code })).json.reason, 'NO TOKEN');
  // A line under no name the boards take is not recorded as anyone's.
  const anon = await encodeLineCode({ ghost: pageRun(t, { name: 'PILOT', seed: 9 }) });
  assert.equal((await call(env, 'POST', '/api/line', { code: anon, token: token('c') })).status, 200);
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM ghost_digests WHERE name_key = ''")[0].n, 0);
  const got = (await call(env, 'GET', '/api/line?id=' + r.json.id)).json.code;
  const line = await decodeLineCode(got);
  const digest = await ghostDigest(line.ghost);
  assert.equal(env.DB.rows(`SELECT name_key FROM ghost_digests WHERE digest = '${digest}'`)[0].name_key, 'allce');
});

test('a test pilot\'s run is refused on every board and as a shared line', async () => {
  const t = track('rig-loop');
  const { weeklyTrackFor, weekMonday, utcWeekId } = await import('../sim-retention.js');
  const { builtTrack, flownRun, submitBody } = await import('./track_boards_fixture.mjs');
  // Each board's own body for one run; with testPilot it is refused for that
  // and nothing else (the same body without it is taken).
  const week = utcWeekId(Date.parse('2026-11-18T12:00:00Z'));
  const wt = weeklyTrackFor(week);
  const bodies = {
    '/api/builtin/submit': async (g) => body(t, g),
    '/api/submit': async (g) => ({ week, frameMm: 65, build: { frameMm: 65 }, name: 'RyFly', timeMs: g.lapTime, ghost: g, track: wt.id, token: token('a') }),
    '/api/track/submit': async (g) => submitBody(builtTrack(4), { timeMs: g.lapTime, ghost: g }, { name: 'RyFly', token: token('a') }),
  };
  const runs = {
    '/api/builtin/submit': () => pageRun(t),
    '/api/submit': () => pageRun({ id: wt.id, gates: wt.gates }, { speed: 9 }),
    '/api/track/submit': () => flownRun(builtTrack(4)).ghost,
  };
  mock.timers.enable({ apis: ['Date'], now: Date.parse(weekMonday(week)) + 36e5 * 30 });
  try {
    for (const path of Object.keys(bodies)) {
      const env = { DB: sqliteD1() };
      const g = runs[path]();
      let r = await call(env, 'POST', path, await bodies[path]({ ...g, testPilot: true }));
      assert.equal(r.status, 400, path);
      assert.equal(r.json.reason, 'TEST PILOT', path);
      r = await call(env, 'POST', path, await bodies[path](g));
      assert.equal(r.status, 200, path + ' takes the same run without the tag: ' + r.json.reason);
    }
  } finally {
    mock.timers.reset();
  }
  const env = { DB: sqliteD1() };
  const ghost = { ...pageRun(t), testPilot: true };
  const code = await encodeLineCode({ ghost });
  assert.equal((await decodeLineCode(code)).ghost.testPilot, true, 'the code says so');
  const line = await call(env, 'POST', '/api/line', { code, token: token('a') });
  assert.equal(line.status, 400);
  assert.equal(line.json.reason, 'TEST PILOT');
  assert.equal(env.DB.lines.size, 0);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM track_scores')[0].n, 0);
});

test('a board keeps its 200 fastest and the ghosts of its 10 fastest', async () => {
  const env = { DB: sqliteD1() };
  const t = track('rig-loop');
  const key = await builtinBoardKey(t);
  const base = pageRun(t, { name: 'Probe' }).lapTime;
  // 200 pilots on the board, 1 ms apart, from base - 300 ms down.
  const ins = env.DB.sqlite.prepare('INSERT INTO track_scores (board, class, name_key, name, time_ms, splits, digest, track_id, submitted_ms) VALUES (?, 65, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < BUILTIN_BOARD_ROWS; i++) ins.run(key, 'p' + i, 'P' + i, base - 300 + i, '[]', '', t.id, i);
  const gin = env.DB.sqlite.prepare('INSERT INTO track_ghosts (board, class, name_key, ghost, time_ms) VALUES (?, 65, ?, ?, ?)');
  for (let i = 0; i < BUILTIN_BOARD_GHOSTS; i++) gin.run(key, 'p' + i, '{}', base - 300 + i);
  // Slower than all 200: not stored, its place said.
  const slow = pageRun(t, { name: 'Slowpoke', seed: 3 });
  let r = await call(env, 'POST', '/api/builtin/submit', await body(t, slow, { token: token('5') }));
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(r.json.ranked, false);
  assert.equal(r.json.improved, false);
  assert.equal(r.json.count, BUILTIN_BOARD_ROWS);
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM track_scores WHERE name_key = 'slowpoke'")[0].n, 0);
  // Faster than all: first, the 200th pruned, its ghost kept and the 10th's dropped.
  const fast = pageRun(t, { name: 'Speedy', speed: 9, seed: 4 });
  assert.ok(fast.lapTime < base - 300);
  r = await call(env, 'POST', '/api/builtin/submit', await body(t, fast, { token: token('f') }));
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(r.json.rank, 1);
  assert.equal(r.json.count, BUILTIN_BOARD_ROWS);
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM track_scores WHERE name_key = 'p199'")[0].n, 0, 'the 201st pruned');
  const ghosts = env.DB.rows('SELECT name_key FROM track_ghosts ORDER BY time_ms').map((x) => x.name_key);
  assert.equal(ghosts.length, BUILTIN_BOARD_GHOSTS);
  assert.equal(ghosts[0], 'speedy');
  assert.ok(!ghosts.includes('p9'), 'the 11th fastest has no ghost');
  // A builder board keeps its 200 too.
  const custom = env.DB.sqlite.prepare('INSERT INTO custom_scores (key, class, name, time_ms, submitted_ms) VALUES (?, 65, ?, ?, ?)');
  for (let i = 0; i < 201; i++) custom.run('c.0123456789abcdef.p' + PHYS_VER, 'C' + i, 1000 + i, i);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM custom_scores')[0].n, 201, 'rows put in directly; the Worker prunes on its next write');
});

test('a board\'s floor: the gate path at the class cap x 1.10, the same from every copy of the track', async () => {
  assert.equal(BUILTIN_FLOOR_MARGIN, 1.1);
  const fromJson = builtinBoardTracks();
  for (const t of BUILTIN_BOARD_TRACKS) {
    let path = 0;
    for (let i = 1; i < t.gates.length; i++) {
      const a = t.gates[i - 1], b = t.gates[i];
      path += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    }
    for (const c of CLASS_IDS) {
      const floor = builtinFloorMs(t, c);
      assert.equal(floor, Math.round((path / CLASS_MAX_SPEED[c]) * 1000 * 1.1), t.id + ' ' + c);
      // A sprint's automatic floor is under the shortest time a board takes
      // (Ryan, 2026-11-26: floors from his own times later): none is held, and
      // a run under it is refused BAD TIME.
      if (isSprintTrackId(t.id)) assert.ok(floor < DAILY_LINE_MIN_MS, t.id + ' ' + c + ': a sprint, under the shortest time a board takes');
      else assert.ok(floor > DAILY_LINE_MIN_MS, t.id + ' ' + c + ': above the shortest time a board takes');
      // tracks/*.json (what the page loads) and the Worker's generated copy.
      assert.equal(builtinFloorMs(fromJson.find((x) => x.id === t.id), c), floor, t.id + ' ' + c + ' from tracks/*.json');
    }
    assert.ok(builtinFloorMs(t, 85) < builtinFloorMs(t, 75) && builtinFloorMs(t, 75) < builtinFloorMs(t, 65), 'a faster class, a lower floor');
  }
  // The Worker's check (on its normalized track) says the floor it used.
  const t = track('rig-loop');
  const g = runNear(t, builtinFloorMs(t, 65));
  const run = await normalizeBuiltinSubmit(await body(t, g, { timeMs: builtinFloorMs(t, 65) }), BUILTIN_BOARD_TRACKS);
  assert.equal(run.ok, true, run.reason);
  assert.deepEqual([run.floorMs, run.held], [builtinFloorMs(t, 65), false]);
  const under = await normalizeBuiltinSubmit(await body(t, g, { timeMs: builtinFloorMs(t, 65) - 1 }), BUILTIN_BOARD_TRACKS);
  assert.deepEqual([under.ok, under.held], [true, true]);
});

test('a run faster than the floor is held: out of the board, its count, places, tops, ghosts and trim, until approved or rejected', async () => {
  const env = { DB: sqliteD1() };
  const t = track('rig-loop');
  const key = await builtinBoardKey(t);
  const floor = builtinFloorMs(t, 65);
  let ip = 0;
  const post = async (ghost, name, tok, timeMs) => call(env, 'POST', '/api/builtin/submit',
    await body(t, ghost, { name, token: token(tok), ...(timeMs == null ? {} : { timeMs }) }), '198.51.100.' + (++ip));
  const board = async (name) => (await call(env, 'GET', '/api/builtin/board?track=' + t.id + '&class=65' + (name ? '&name=' + name : ''))).json;
  const tops = async () => (await call(env, 'GET', '/api/builtin/tops?class=65')).json.tops[t.id].top;
  const held = () => env.DB.rows('SELECT name_key, time_ms, floor_ms FROM track_held ORDER BY time_ms');

  // RyFly's honest, slow run: on the board.
  const slow = pageRun(t, { name: 'RyFly', seed: 1 });
  let r = await post(slow, 'RyFly', 'a');
  assert.equal(r.status, 200, r.json.reason);
  // A run at the floor: on the board, first.
  r = await post(runNear(t, floor, { seed: 2, name: 'AtFloor' }), 'AtFloor', 'b', floor);
  assert.equal(r.status, 200, r.json.reason);
  assert.deepEqual([r.json.improved, r.json.rank, r.json.count], [true, 1, 2]);
  assert.equal((await tops()).name, 'AtFloor');
  assert.equal(held().length, 0, 'at the floor is not under it');

  // RyFly under the floor: answered as if stored, held, the public row kept.
  const fast = runNear(t, floor, { seed: 3 });
  r = await post(fast, 'RyFly', 'a', floor - 5);
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(r.json.ok, true);
  assert.deepEqual([r.json.improved, r.json.ranked, r.json.timeMs, r.json.rank, r.json.count], [true, true, floor - 5, 1, 2]);
  assert.deepEqual(r.json.entries.map((e) => [e.name, e.timeMs]), [['RyFly', floor - 5], ['AtFloor', floor]], 'their reply has their run in');
  assert.deepEqual(held(), [{ name_key: 'ryfly', time_ms: floor - 5, floor_ms: floor }]);
  let b = await board('RyFly');
  assert.deepEqual(b.entries.map((e) => [e.name, e.timeMs]), [['AtFloor', floor], ['RyFly', slow.lapTime]], 'the board as it was');
  assert.equal(b.count, 2);
  assert.deepEqual(b.you, { rank: 2, name: 'RyFly', timeMs: slow.lapTime }, 'their public place is their stored run');
  assert.equal((await tops()).name, 'AtFloor');
  const g = await call(env, 'GET', '/api/builtin/ghost?track=' + t.id + '&class=65&name=RyFly');
  assert.equal(g.json.timeMs, slow.lapTime, 'the ghost served is the stored run\'s');
  // A slower held run does not replace their held one; their reply says so.
  r = await post(runNear(t, floor, { seed: 4 }), 'RyFly', 'a', floor - 2);
  assert.equal(r.status, 200, r.json.reason);
  assert.deepEqual([r.json.improved, r.json.timeMs], [false, floor - 5]);
  assert.equal(held()[0].time_ms, floor - 5);

  // The trim: a full board (200 rows) keeps all 200 when a held run lands.
  const ins = env.DB.sqlite.prepare('INSERT INTO track_scores (board, class, name_key, name, time_ms, splits, digest, track_id, submitted_ms) VALUES (?, 65, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 2; i < BUILTIN_BOARD_ROWS; i++) ins.run(key, 'p' + i, 'P' + i, slow.lapTime + i, '[]', '', t.id, i);
  assert.equal((await board()).count, BUILTIN_BOARD_ROWS);
  r = await post(runNear(t, floor, { seed: 5, name: 'Fresh' }), 'Fresh', 'c', floor - 10);
  assert.equal(r.status, 200, r.json.reason);
  assert.deepEqual([r.json.rank, r.json.count], [1, BUILTIN_BOARD_ROWS], 'their reply: first, on a full board, as a stored run is told');
  assert.equal((await board()).count, BUILTIN_BOARD_ROWS, 'no row pushed off');
  assert.equal(env.DB.rows(`SELECT COUNT(*) AS n FROM track_scores WHERE name_key = 'p${BUILTIN_BOARD_ROWS - 1}'`)[0].n, 1, 'the 200th still there');
  // An honest run that ranks still trims as before: the 201st goes.
  r = await post(pageRun(t, { name: 'Honest', seed: 6, speed: 9 }), 'Honest', 'd');
  assert.equal(r.status, 200, r.json.reason);
  assert.equal((await board()).count, BUILTIN_BOARD_ROWS);
  assert.equal(env.DB.rows(`SELECT COUNT(*) AS n FROM track_scores WHERE name_key = 'p${BUILTIN_BOARD_ROWS - 1}'`)[0].n, 0, 'the 201st pruned');

  // DEPLOY.md's commands, as written, on 'somekey' (rig-loop, class 65).
  const deploy = readFileSync(join(root, 'workers', 'sim-leaderboard', 'DEPLOY.md'), 'utf8');
  const section = deploy.slice(deploy.indexOf('### Held runs'), deploy.indexOf('## "Fly my line"'));
  const commands = [...section.matchAll(/--command "([^"]+)"/g)].map((m) => m[1]);
  const sql = (start) => { const c = commands.find((x) => x.startsWith(start)); assert.ok(c, 'DEPLOY.md has: ' + start); return c; };
  // The list: board, class, name, time, floor, submitted.
  const list = env.DB.rows(sql('SELECT board, class, name, time_ms, floor_ms')).sort((x, y) => x.name.localeCompare(y.name));
  assert.deepEqual(list.map((x) => [x.board, x.class, x.name, x.time_ms, x.floor_ms, x.track_id, x.name_key]),
    [[key, 65, 'Fresh', floor - 10, floor, t.id, 'fresh'], [key, 65, 'RyFly', floor - 5, floor, t.id, 'ryfly']]);
  assert.match(list[0].submitted, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  // Approve Fresh's: first on the board, its ghost served, the 200 kept.
  env.DB.exec(sql('INSERT INTO track_scores').replace(/somekey/g, 'fresh'));
  b = await board('Fresh');
  assert.deepEqual([b.entries[0].name, b.entries[0].timeMs, b.count, b.you.rank], ['Fresh', floor - 10, BUILTIN_BOARD_ROWS, 1]);
  assert.equal((await tops()).name, 'Fresh');
  const fg = await call(env, 'GET', '/api/builtin/ghost?track=' + t.id + '&class=65&name=Fresh');
  assert.equal(fg.status, 200, fg.json.reason);
  assert.equal(fg.json.timeMs, floor - 10);
  assert.ok(env.DB.rows(`SELECT COUNT(*) AS n FROM track_ghosts WHERE board = '${key}'`)[0].n <= BUILTIN_BOARD_GHOSTS, 'the board keeps 10 ghosts at most');
  assert.deepEqual(held().map((x) => x.name_key), ['ryfly']);
  // Reject RyFly's: gone, their stored run stays, and the flight is refused under another name.
  env.DB.exec(sql('DELETE FROM track_held').replace(/somekey/g, 'ryfly'));
  assert.equal(held().length, 0);
  b = await board('RyFly');
  assert.equal(b.you.timeMs, slow.lapTime);
  r = await post(fast, 'Someone Else', 'e', floor - 5);
  assert.equal(r.json.reason, 'COPIED RUN', 'the rejected flight under another name');
});

test('migrate-board-floor.sql: only track_held, safe to run twice; before it, a held run says NOT MIGRATED and the rest works', async () => {
  const schema = readFileSync(join(LEADERBOARD_SQL_DIR, 'schema.sql'), 'utf8');
  const before = schema.slice(0, schema.indexOf("-- A built-in board's held runs"));
  assert.ok(before.length > 0 && !before.includes('track_held'));
  const migrate = readFileSync(join(LEADERBOARD_SQL_DIR, 'migrate-board-floor.sql'), 'utf8');
  assert.doesNotMatch(migrate, /DROP |ALTER |DELETE |INSERT |UPDATE /, 'creates, nothing else');
  assert.match(migrate, /CREATE TABLE IF NOT EXISTS track_held \(/);
  const env = { DB: sqliteD1({ files: [] }) };
  env.DB.exec(before);
  const t = track('rig-loop');
  const floor = builtinFloorMs(t, 65);
  let r = await call(env, 'POST', '/api/builtin/submit', await body(t, pageRun(t, { seed: 1 })));
  assert.equal(r.status, 200, 'a run over the floor, as before: ' + r.json.reason);
  const worker = (await import('../workers/sim-leaderboard/src/index.js')).default;
  const held = await worker.fetch(new Request('https://x/api/builtin/submit', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.9' },
    body: JSON.stringify(await body(t, runNear(t, floor, { seed: 2, name: 'Kim' }), { name: 'Kim', token: token('b'), timeMs: floor - 5 })) }), env);
  assert.deepEqual([held.status, (await held.json()).reason], [503, 'NOT MIGRATED']);
  env.DB.exec(migrate);
  env.DB.exec(migrate);
  r = await call(env, 'POST', '/api/builtin/submit', await body(t, runNear(t, floor, { seed: 3, name: 'Kim' }), { name: 'Kim', token: token('b'), timeMs: floor - 5 }));
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM track_held')[0].n, 1);
  // The same table as schema.sql's.
  const cols = (db) => db.rows("SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info('track_held')");
  assert.deepEqual(cols(env.DB), cols(sqliteD1()));
});

test('score posts and SHARE have their own hourly budgets', async () => {
  const env = { DB: sqliteD1() };
  const ip = '203.0.113.7';
  for (let i = 0; i < RATE_SCORE_MAX; i++) assert.equal((await call(env, 'POST', '/api/builtin/submit', '{}', ip)).status, 400);
  assert.equal((await call(env, 'POST', '/api/submit', '{}', ip)).status, 429, 'score budget spent, every score route');
  assert.equal((await call(env, 'POST', '/api/track/submit', '{}', ip)).status, 429);
  for (let i = 0; i < RATE_SHARE_MAX; i++) assert.equal((await call(env, 'POST', '/api/line', '{}', ip)).status, 400, 'SHARE still has its own');
  assert.equal((await call(env, 'POST', '/api/line', '{}', ip)).status, 429);
  assert.equal((await call(env, 'GET', '/api/builtin/board?track=rig-loop&class=65', undefined, ip)).status, 200, 'reads are not limited');
  assert.equal(RATE_SCORE_MAX, 30);
  assert.equal(RATE_SHARE_MAX, 12);
});

test('the weekly board takes the same name rules and the claims made before them', async () => {
  // As production has it: the tables before this change, RyFly's claim in
  // pilots and their row on the weekly board, then the migration (twice).
  const schema = readFileSync(join(LEADERBOARD_SQL_DIR, 'schema.sql'), 'utf8');
  const before = schema.slice(0, schema.indexOf('-- Built-in track boards, name keys'));
  assert.ok(before.length > 100 && !before.includes('pilot_keys'));
  const env = { DB: sqliteD1({ files: [] }) };
  env.DB.exec(before);
  const tok = token('7');
  const h = await hashPilotToken(tok);
  env.DB.exec(`INSERT INTO pilots (name, token_hash, claimed_ms) VALUES ('RyFly', '${h}', 1), ('Ry Fly', 'x', 2), ('Ünï', 'y', 3)`);
  env.DB.exec("INSERT INTO scores (week, class, name, time_ms, track_id, submitted_ms) VALUES ('2026-W47.p7', 75, 'RyFly', 42828, 'weekly-2026-W47-g2', 1)");
  const migrate = readFileSync(join(LEADERBOARD_SQL_DIR, 'migrate-builtin-boards.sql'), 'utf8');
  env.DB.exec(migrate);
  env.DB.exec(migrate);
  const keys = env.DB.rows('SELECT key, name, token_hash FROM pilot_keys ORDER BY claimed_ms');
  // The first claim of a key wins. (SQLite's lower() is ASCII only: a name
  // outside the rules keeps its letters, and no post can claim it anyway.)
  assert.deepEqual(keys.map((k) => [k.key, k.name]), [['ryfly', 'RyFly'], ['Ünï', 'Ünï']]);
  assert.equal(pilotNameProblem('Ünï'), 'BAD NAME');
  assert.equal(keys[0].token_hash, h);
  // The SQL key is the JS key for the names a board takes.
  for (const n of ['RyFly', 'Ry Fly', 'ry_fly', 'A.J-Fly', 'Vic 7', 'Zo3 45', 'Kiwi01']) {
    env.DB.exec('DELETE FROM pilot_keys');
    env.DB.exec(`DELETE FROM pilots; INSERT INTO pilots (name, token_hash, claimed_ms) VALUES ('${n}', 'h', 1)`);
    env.DB.exec(migrate);
    assert.equal(env.DB.rows('SELECT key FROM pilot_keys')[0].key, pilotNameKey(n), n);
  }
  env.DB.exec(`DELETE FROM pilot_keys; INSERT INTO pilot_keys (key, name, token_hash, claimed_ms) VALUES ('ryfly', 'RyFly', '${h}', 1)`);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM scores')[0].n, 1, 'the weekly row untouched');
  // A weekly submit: the default name is refused, RyFly's token still holds RyFly.
  const week = '2026-W47';
  const { weeklyTrackFor, weekMonday } = await import('../sim-retention.js');
  const wt = weeklyTrackFor(week);
  mock.timers.enable({ apis: ['Date'], now: Date.parse(weekMonday(week)) + 36e5 * 30 });
  try {
    const run = pageRun({ id: wt.id, gates: wt.gates }, { speed: 9, name: 'PILOT' });
    const wb = (name, t) => ({ week, frameMm: 75, build: { frameMm: 75 }, name, timeMs: run.lapTime, ghost: { ...run, name }, track: wt.id, token: t });
    let r = await call(env, 'POST', '/api/submit', wb('PILOT', tok));
    assert.equal(r.json.reason, 'SET A NAME');
    r = await call(env, 'POST', '/api/submit', wb('ry_fly', token('8')));
    assert.equal(r.json.reason, 'NAME TAKEN');
    r = await call(env, 'POST', '/api/submit', wb('RyFly', tok));
    assert.equal(r.status, 200, r.json.reason);
    assert.equal(r.json.name, 'RyFly');
  } finally {
    mock.timers.reset();
  }
});

test('a clean Daily Line on a built-in track goes to that track\'s board too', async (t) => {
  const ids = BUILTIN_BOARD_TRACKS.map((b) => b.id);
  let day = null;
  for (let k = 0; k < 400 && !day; k++) {
    const d = addUtcDays(utcDateId(), k);
    const c = dailyLineFor(d);
    if (ids.includes(c.trackId) && c.modifier === 'none') day = d;
  }
  if (!day) { t.skip('no clean built-in Daily Line in the next 400 days'); return; }
  const c = dailyLineFor(day);
  const bt = track(c.trackId);
  mock.timers.enable({ apis: ['Date'], now: Date.parse(day + 'T12:00:00Z') });
  try {
    const env = { DB: sqliteD1() };
    const ghost = pageRun(bt, { speed: 8 });
    // The Daily Line's ghost is the stored one (480 samples at most).
    const step = Math.ceil(ghost.samples.length / 480);
    const kept = ghost.samples.filter((s, i) => i % step === 0);
    if (kept[kept.length - 1] !== ghost.samples[ghost.samples.length - 1]) kept.push(ghost.samples[ghost.samples.length - 1]);
    const g = { ...ghost, samples: kept };
    const cum = lineRunSplits(g.samples, lineRunPasses(g.samples, bt));
    const splits = cum.map((v, i) => v - (i ? cum[i - 1] : 0));
    const r = await call(env, 'POST', '/api/daily/submit', {
      day, frameMm: 65, build: { frameMm: 65 }, name: 'RyFly', timeMs: g.lapTime, ghost: g, trackId: bt.id, splits, token: token('a'),
    });
    assert.equal(r.status, 200, r.json.reason);
    const b = await call(env, 'GET', '/api/builtin/board?track=' + bt.id + '&class=65');
    assert.equal(b.json.count, 1, 'on ' + bt.id + "'s board");
    assert.equal(b.json.entries[0].name, 'RyFly');
  } finally {
    mock.timers.reset();
  }
});

test('a built-in board refuses a ghost no whoop could fly, and a nudged or retimed copy of a stored ghost', async () => {
  const { flightSpikes, flightSpikesMax, ghostPathDistance } = await import('../sim-retention.js');
  const env = { DB: sqliteD1() };
  // Each track's forgeries from an address of its own: the hourly budget is
  // per address, and there are more tracks than it allows.
  for (const [ti, t] of BUILTIN_BOARD_TRACKS.entries()) {
    const ip = '198.51.100.' + (60 + ti);
    // Straight from gate centre to gate centre at 44 u/s, a sample each 50 ms.
    const pts = t.gates.map((g) => [g.x, g.y + 0.03, g.z]);
    const samples = [[0, ...pts[0], 0, 0, 0, 1]];
    let tm = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const n = Math.max(1, Math.ceil(L / (44 * 0.05)));
      for (let k = 1; k <= n; k++) { tm += Math.round(L / n / 44 * 1000); samples.push([tm, ...a.map((v, j) => v + (b[j] - v) * k / n), 0, 0, 0, 1]); }
    }
    const forged = { v: 1, track: t.id, phys: PHYS_VER, name: 'Forger', lapTime: tm, samples };
    // A sprint's few turns stay inside its spike allowance; at 44 u/s it is
    // under the 2.5 s a board takes, and refused for that.
    const sprint = isSprintTrackId(t.id);
    if (sprint) assert.ok(tm < DAILY_LINE_MIN_MS, t.id + ' ' + tm);
    else assert.ok(flightSpikes(samples, 65) > flightSpikesMax(t.gates.length), t.id);
    const r = await call(env, 'POST', '/api/builtin/submit', await body(t, forged, { name: 'Forger', token: token('e') }), ip);
    assert.equal(r.json.reason, sprint ? 'BAD TIME' : 'IMPLAUSIBLE FLIGHT', t.id + ': ' + JSON.stringify(r.json));
    // The same, sampled sparsely so the turns spread: the page's rate is required.
    for (const stepMs of [200, 300, 450]) {
      const sparse = [samples[0]];
      for (const p of samples) if (p[0] - sparse[sparse.length - 1][0] >= stepMs) sparse.push(p);
      if (sparse[sparse.length - 1] !== samples[samples.length - 1]) sparse.push(samples[samples.length - 1]);
      const sg = { ...forged, samples: sparse };
      const rs = await call(env, 'POST', '/api/builtin/submit', await body(t, sg, { name: 'Forger', token: token('e') }), ip);
      assert.equal(rs.status, 400, t.id + ' at ' + stepMs + ' ms: ' + JSON.stringify(rs.json));
    }
  }
  // A stored top ghost, nudged 3 cm and flown 3% faster, under another name.
  const t = track('depot-loop');
  const top = pageRun(t, { name: 'Topgun', seed: 1 });
  let r = await call(env, 'POST', '/api/builtin/submit', await body(t, top, { name: 'Topgun', token: token('a') }));
  assert.equal(r.status, 200, r.json.reason);
  const served = (await call(env, 'GET', '/api/builtin/ghost?track=depot-loop&class=65&name=Topgun')).json.ghost;
  assert.equal(served.name, 'Topgun', 'the ghost under the claimed name');
  assert.deepEqual(Object.keys(served).sort(), ['lapTime', 'name', 'phys', 'samples', 'track', 'v']);
  const copy = { ...served, name: 'Copycat', samples: served.samples.map((p) => [Math.round(p[0] * 0.97), p[1] + 0.105, p[2], p[3], 0, 0, 0, 1]) };
  copy.lapTime = copy.samples[copy.samples.length - 1][0];
  assert.ok(ghostPathDistance(copy.samples, top.samples) < 0.2);
  r = await call(env, 'POST', '/api/builtin/submit', await body(t, copy, { name: 'Copycat', token: token('b') }));
  assert.equal(r.json.reason, 'COPIED RUN');
  // Another pilot's own line is not a copy.
  const own = pageRun(t, { name: 'Rival', seed: 3 });
  assert.ok(ghostPathDistance(own.samples, top.samples) >= 0.2, String(ghostPathDistance(own.samples, top.samples)));
  r = await call(env, 'POST', '/api/builtin/submit', await body(t, own, { name: 'Rival', token: token('c') }));
  assert.equal(r.status, 200, r.json.reason);
});

test('a builder board keeps its 200 fastest (Worker writes prune it)', async () => {
  const { builtTrack, flownRun, submitBody } = await import('./track_boards_fixture.mjs');
  const { customBoardKey } = await import('../sim-retention.js');
  const env = { DB: sqliteD1() };
  const t = builtTrack(4);
  const key = await customBoardKey(t);
  const ins = env.DB.sqlite.prepare('INSERT INTO custom_scores (key, class, name, time_ms, submitted_ms) VALUES (?, 65, ?, ?, ?)');
  for (let i = 0; i < 200; i++) ins.run(key, 'C' + i, 1000 + i, i);
  // 200 rows, all faster than any run here (1.0 to 1.2 s); then one slower
  // than all (not stored), then the board's times moved up past a new run
  // (stored, the slowest pruned).
  const run = flownRun(t, { speed: 6 });
  let r = await call(env, 'POST', '/api/track/submit', submitBody(t, run, { name: 'Fresh', token: token('a') }));
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM custom_scores')[0].n, 200, 'slower than the 200th: not stored');
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM custom_scores WHERE name = 'Fresh'")[0].n, 0);
  env.DB.exec('UPDATE custom_scores SET time_ms = time_ms + 100000');
  r = await call(env, 'POST', '/api/track/submit', submitBody(t, flownRun(t, { speed: 6, weave: 0.3 }), { name: 'Fresh', token: token('a') }));
  assert.equal(r.status, 200, r.json.reason);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM custom_scores')[0].n, 200, 'the 201st pruned');
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM custom_scores WHERE name = 'C199'")[0].n, 0);
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM custom_scores WHERE name = 'Fresh'")[0].n, 1);
});

test('a new Worker on a database not yet migrated says NOT MIGRATED; old claims made after the migration still hold', async () => {
  const schema = readFileSync(join(LEADERBOARD_SQL_DIR, 'schema.sql'), 'utf8');
  const before = schema.slice(0, schema.indexOf('-- Built-in track boards, name keys'));
  const old = { DB: sqliteD1({ files: [] }) };
  old.DB.exec(before);
  const worker = (await import('../workers/sim-leaderboard/src/index.js')).default;
  const t = track('rig-loop');
  const r = await worker.fetch(new Request('https://x/api/builtin/tops?class=65'), old);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).reason, 'NOT MIGRATED');
  const s = await worker.fetch(new Request('https://x/api/builtin/submit', { method: 'POST', body: JSON.stringify(await body(t, pageRun(t))) }), old);
  assert.equal(s.status, 503);
  assert.equal((await s.json()).reason, 'NOT MIGRATED');
  // Migrated, then the old Worker claimed "Late Pilot" in pilots: it holds.
  const env = { DB: sqliteD1() };
  const h = await hashPilotToken(token('9'));
  env.DB.exec(`INSERT INTO pilots (name, token_hash, claimed_ms) VALUES ('Late Pilot', '${h}', 5)`);
  let p = await call(env, 'POST', '/api/builtin/submit', await body(t, pageRun(t, { name: 'Late Pilot', seed: 2 }), { name: 'late_pilot', token: token('8') }));
  assert.equal(p.json.reason, 'NAME TAKEN', 'another browser');
  p = await call(env, 'POST', '/api/builtin/submit', await body(t, pageRun(t, { name: 'Late Pilot', seed: 4 }), { name: 'Late Pilot', token: token('9') }));
  assert.equal(p.status, 200, p.json.reason);
  // A carried-over name the rules refuse shows as its holder posts it.
  env.DB.exec(`INSERT INTO pilot_keys (key, name, token_hash, claimed_ms) VALUES ('dotfly', 'Dot..Fly', '${h}', 6)`);
  p = await call(env, 'POST', '/api/builtin/submit', await body(t, pageRun(t, { name: 'DotFly', seed: 6 }), { name: 'DotFly', token: token('9') }));
  assert.equal(p.status, 200, p.json.reason);
  assert.equal(p.json.name, 'DotFly');
});

test('the migration\'s SQL key is pilotNameKey for any name the rules take', () => {
  const migrate = readFileSync(join(LEADERBOARD_SQL_DIR, 'migrate-builtin-boards.sql'), 'utf8');
  const sel = /INSERT OR IGNORE INTO pilot_keys[^;]*SELECT\s+([\s\S]*?),\s+trim\(name\), token_hash/.exec(migrate)[1];
  const db = sqliteD1({ files: [] });
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ._-';
  let seed = 7, n = 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const q = db.sqlite.prepare('SELECT ' + sel.replace(/\bname\b/g, '?') + ' AS k');
  for (let i = 0; i < 5000; i++) {
    let name = '';
    const len = 3 + Math.floor(rnd() * 14);
    for (let k = 0; k < len; k++) name += chars[Math.floor(rnd() * chars.length)];
    for (const extra of ['rn', 'vv', 'RN', 'VV', 'vvv', 'rnrn']) if (rnd() < 0.1) name = name.slice(0, 8) + extra + name.slice(8);
    if (pilotNameProblem(name)) continue;
    n++;
    assert.equal(q.get(name).k, pilotNameKey(name), JSON.stringify(name));
  }
  assert.ok(n > 1000, 'names checked: ' + n);
  for (const [a, b] of [['Mario', 'Rnario'], ['Willow', 'Wiilow'], ['Wolf', 'VVolf'], ['B8by', 'Bbby'], ['Zig9', 'Zigg']]) {
    if (a === 'Willow') continue;
    assert.equal(pilotNameKey(a), pilotNameKey(b), a + ' ' + b);
  }
});

// The same Worker under wrangler dev (workerd, a local D1 made from
// schema.sql): what running it in Node can't show (its module loads as a
// Worker, its SQL runs on D1's SQLite).
test('built-in boards on wrangler dev (real D1)', { timeout: 300000 }, async (t) => {
  const { findWrangler, startLeaderboardDev } = await import('./sim_rooms_dev.mjs');
  const bin = findWrangler();
  if (!bin) { t.skip('no wrangler (npm install in workers/sim-rooms or workers/sim-leaderboard, or WRANGLER=)'); return; }
  const ORIGIN = 'https://quadmath.com';
  const w = await startLeaderboardDev(bin, { ALLOWED_ORIGIN: ORIGIN });
  try {
    const req = (path, b) => fetch(w.base + path, b === undefined ? { headers: { Origin: ORIGIN } } : {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.40' }, body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
    const t1 = track('house-backyard-lap');
    const run = pageRun(t1, { name: 'RyFly', seed: 2 });
    let r = await req('/api/builtin/submit', await body(t1, run));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.improved, r.json.rank, r.json.count, r.json.name], [true, 1, 1, 'RyFly']);
    r = await req('/api/builtin/board?track=' + t1.id + '&class=65&name=ry_fly');
    assert.equal(r.json.entries[0].timeMs, run.lapTime);
    assert.equal(r.json.entries[0].splits.length, t1.gates.length - 1);
    assert.equal(r.json.you.rank, 1);
    r = await req('/api/builtin/ghost?track=' + t1.id + '&class=65&name=RyFly');
    assert.equal(r.status, 200);
    assert.equal(r.json.ghost.name, 'RyFly');
    r = await req('/api/builtin/submit', await body(t1, { ...pageRun(t1, { seed: 5 }), testPilot: true }));
    assert.equal(r.json.reason, 'TEST PILOT');
    r = await req('/api/builtin/tops?class=65');
    assert.equal(r.json.tops[t1.id].top.name, 'RyFly');
    // Under the floor (rig-loop): answered as if stored, held off the board and the tops.
    const t2 = track('rig-loop');
    const f2 = builtinFloorMs(t2, 65);
    r = await req('/api/builtin/submit', await body(t2, runNear(t2, f2, { seed: 7, name: 'Kim' }), { name: 'Kim', token: token('b'), timeMs: f2 - 5 }));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.improved, r.json.rank, r.json.count, r.json.timeMs], [true, 1, 1, f2 - 5]);
    r = await req('/api/builtin/board?track=' + t2.id + '&class=65&name=Kim');
    assert.deepEqual([r.json.count, r.json.entries.length, r.json.you], [0, 0, null]);
    r = await req('/api/builtin/tops?class=65');
    assert.equal(r.json.tops[t2.id].top, null);
    assert.equal(r.json.tops[t1.id].top.name, 'RyFly');
  } finally {
    await w.stop();
  }
});
