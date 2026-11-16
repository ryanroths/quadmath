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
import { makePaceGhost, PUBLIC_MAPS } from '../sim-tracks.js';
import {
  PHYS_VER, builtinTrackHash, builtinBoardKey, BUILTIN_BOARD_KEY_RE, BUILTIN_BOARD_ROWS, BUILTIN_BOARD_GHOSTS,
  lineRunPasses, lineRunSplits, hashPilotToken, ghostDigest, dailyLineFor, utcDateId, addUtcDays, MISS_PENALTY_MS,
} from '../sim-retention.js';
import { encodeLineCode, decodeLineCode } from '../sim-share.js';
import { pilotNameKey, pilotNameProblem, NAME_BLOCK_ROOTS } from '../sim-pilot-names.js';
import { BUILTIN_BOARD_TRACKS } from '../sim-builtin-boards.js';
import { builtinBoardsModule, builtinBoardTracks } from './build_builtin_boards.mjs';
import { sqliteD1, LEADERBOARD_SQL_DIR } from './d1_sqlite.mjs';
import { handleLeaderboard, RATE_SCORE_MAX, RATE_SHARE_MAX } from '../workers/sim-leaderboard/src/index.js';

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
// a little off the pace bot's line (seed moves it, so two runs differ).
function pageRun(t, { speed = 8, seed = 0, name = 'RyFly', gates = t.gates } = {}) {
  const g = makePaceGhost(gates, { track: t.id, name, speed, hz: 15, laps: 1 });
  for (let i = 0; i < g.samples.length; i++) g.samples[i][2] += 0.08 + (i % 3) * 0.01 + seed * 0.004;
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

async function body(t, ghost, extra = {}) {
  return {
    track: t.id, trackHash: await builtinTrackHash(t), frameMm: 65, build: { frameMm: 65 },
    name: ghost.name, timeMs: ghost.lapTime, ghost, token: token('a'), ...extra,
  };
}

test('sim-builtin-boards.js is the public maps\' tracks, as tracks/*.json has them', () => {
  const have = readFileSync(join(root, 'sim-builtin-boards.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(have, builtinBoardsModule(), 'node tools/build_builtin_boards.mjs --write');
  assert.deepEqual(BUILTIN_BOARD_TRACKS.map((t) => t.id), ['rig-loop', 'house-loop', 'house-backyard-lap', 'depot-loop', 'bando-loop-v2']);
  assert.deepEqual([...new Set(BUILTIN_BOARD_TRACKS.map((t) => t.map))].sort(), [...PUBLIC_MAPS].sort());
  for (const t of builtinBoardTracks()) {
    const file = JSON.parse(readFileSync(join(root, 'tracks', t.id + '.json'), 'utf8'));
    assert.deepEqual(track(t.id).gates, file.gates.map(({ x, y, z, ry, size, solid }) => ({ x, y, z, ry, size, solid: !!solid })), t.id);
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
  assert.ok(NAME_BLOCK_ROOTS.every((w) => w.length >= 3));
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
  const got = (await call(env, 'GET', '/api/line?id=' + r.json.id)).json.code;
  const line = await decodeLineCode(got);
  const digest = await ghostDigest(line.ghost);
  assert.equal(env.DB.rows(`SELECT name_key FROM ghost_digests WHERE digest = '${digest}'`)[0].name_key, 'allce');
});

test('a test pilot\'s run is refused on every board and as a shared line', async () => {
  const env = { DB: sqliteD1() };
  const t = track('rig-loop');
  const ghost = { ...pageRun(t), testPilot: true };
  for (const path of ['/api/builtin/submit', '/api/submit', '/api/daily/submit', '/api/track/submit']) {
    const r = await call(env, 'POST', path, await body(t, ghost));
    assert.equal(r.status, 400, path);
    assert.notEqual(r.json.ok, true, path);
  }
  const r = await call(env, 'POST', '/api/builtin/submit', await body(t, ghost));
  assert.equal(r.json.reason, 'TEST PILOT');
  const code = await encodeLineCode({ ghost });
  assert.equal((await decodeLineCode(code)).ghost.testPilot, true, 'the code says so');
  const line = await call(env, 'POST', '/api/line', { code });
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
