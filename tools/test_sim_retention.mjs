// Unit tests for W5 Retention: daily seed, anti-cheat, duels, unlocks.
// Node stdlib only: `node --test tools/test_sim_retention.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, makePaceGhost, SHARE_PREFIX as TRACK_PREFIX, encodeShare, decodeShare, ghostPayloadError as trackGhostErr, MAPS } from '../sim-tracks.js';
import { BUILD_KEY } from '../sim-build.js';
import { WHOOP_KEY } from '../sim-whoop.js';
import { ROOM_KEY } from '../sim-room.js';
import { COACH_KEY } from '../sim-coach.js';
import { LAYOUT } from '../sim-maps.js';
import {
  DAILY_KEY, BOARD_KEY, SKIN_KEY, LEADERBOARD_URL_KEY, LEADERBOARD_URL,
  SHARE_PREFIX, DUEL_KIND, DAILY_MAPS, SKINS, CLASS_MAX_SPEED, CLASS_IDS,
  utcDateId, utcWeekId, addUtcDays, dailyTrackFor, weeklyTrackFor,
  dailyTrackValid, isDailyTrackId, isWeeklyTrackId, trackFromRetentionId,
  validateSubmittedRun, countGhostLaps, encodeDuel, decodeDuel, decodeQm2,
  duelResult, emptyDaily, recordDailyFinish, loadDaily, saveDaily,
  loadBoard, saveBoard, recordLocalBoard, boardRows, leaderboardUrl,
  onlineBoardsEnabled, unlockedSkins, isSkinUnlocked, resolveSkin,
  loadSkinId, saveSkinId, sanitizePilotName, normalizeSubmit, fmtMs,
  mulberry32,
} from '../sim-retention.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const retSrc = readFileSync(join(root, 'sim-retention.js'), 'utf8');
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';

function memStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

function pace(track, extra) {
  const g = makePaceGhost(track.gates, {
    track: track.id, name: 'PACE', speed: extra && extra.speed || 8, hz: extra && extra.hz || 16, laps: extra && extra.laps || 3,
  });
  g.lapTime = g.samples[g.samples.length - 1][0];
  return g;
}

test('new storage keys only; never writes old keys or WebFPV', () => {
  assert.equal(DAILY_KEY, 'quadmathSimDaily');
  assert.equal(BOARD_KEY, 'quadmathSimBoard');
  assert.equal(SKIN_KEY, 'quadmathSimSkin');
  assert.ok(retSrc.includes('setItem(DAILY_KEY'));
  assert.ok(retSrc.includes('Nothing here is copied from WebFPV') || retSrc.includes('copied from WebFPV'));
  for (const banned of ['ryflyDroneType', 'ryflyRates', CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, BUILD_KEY, WHOOP_KEY, ROOM_KEY, COACH_KEY]) {
    assert.equal(retSrc.includes(banned), false, 'must not mention ' + banned);
  }
  const store = memStore();
  saveDaily(recordDailyFinish(emptyDaily(), { utc: '2026-10-17', timeMs: 40000 }).progress, store);
  saveBoard(recordLocalBoard(loadBoard(store), { week: '2026-W42', frameMm: 65, name: 'RY', timeMs: 40000, trackId: 'weekly-2026-W42' }), store);
  saveSkinId('stock', store);
  const keys = store.keys().sort();
  assert.deepEqual(keys, [BOARD_KEY, DAILY_KEY, SKIN_KEY].sort());
});

test('daily maps match sim-maps indoor LAYOUT', () => {
  for (const m of DAILY_MAPS) {
    assert.ok(LAYOUT[m.id], m.id);
    assert.equal(LAYOUT[m.id].w, m.w, m.id + ' w');
    assert.equal(LAYOUT[m.id].d, m.d, m.id + ' d');
    assert.equal(LAYOUT[m.id].h, m.h, m.id + ' h');
    assert.ok(MAPS.some((x) => x.id === m.id && x.indoor));
  }
  assert.ok(!DAILY_MAPS.some((m) => m.id === 'city' || m.id === 'room' || m.id === 'backyard'));
});

test('daily seed is deterministic from UTC date and yields valid gates', () => {
  const a = dailyTrackFor('2026-10-17');
  const b = dailyTrackFor('2026-10-17');
  const c = dailyTrackFor('2026-10-18');
  assert.equal(a.id, 'daily-2026-10-17');
  assert.ok(isDailyTrackId(a.id));
  assert.deepEqual(a.gates, b.gates);
  assert.equal(a.map, b.map);
  assert.notEqual(JSON.stringify(a.gates), JSON.stringify(c.gates));
  assert.ok(dailyTrackValid(a));
  assert.ok(dailyTrackValid(c));
  assert.ok(a.gates.length >= 4);
  assert.ok(a.gates.every((g) => g.solid && g.size <= 2.2));
  for (let i = 0; i < 14; i++) {
    const day = addUtcDays('2026-10-01', i);
    const t = dailyTrackFor(day);
    assert.ok(dailyTrackValid(t), day + ' invalid ' + t.map + ' n=' + t.gates.length);
    assert.equal(t.class, 'whoop');
  }
  const sameRng = mulberry32(1);
  assert.equal(sameRng(), mulberry32(1)());
});

test('weekly track is stable for the ISO week', () => {
  const w = utcWeekId(Date.UTC(2026, 9, 17));
  const t = weeklyTrackFor(w);
  assert.ok(isWeeklyTrackId(t.id));
  assert.equal(t.id, weeklyTrackFor(w).id);
  assert.ok(dailyTrackValid(t));
  assert.equal(utcDateId(Date.UTC(2026, 9, 17)), '2026-10-17');
  assert.equal(trackFromRetentionId('daily-2026-10-17').id, 'daily-2026-10-17');
  assert.equal(trackFromRetentionId('weekly-' + w).id, 'weekly-' + w);
});

test('anti-cheat accepts a 3-lap pace ghost and rejects speed / incomplete / sparse', () => {
  const track = dailyTrackFor('2026-10-17');
  const ghost = pace(track, { speed: 8, hz: 16, laps: 3 });
  const ok = validateSubmittedRun({ ghost, track, frameMm: 65, timeMs: ghost.lapTime });
  assert.equal(ok.ok, true, ok.reason);
  assert.ok(countGhostLaps(ghost.samples, track) >= 3, 'laps ' + countGhostLaps(ghost.samples, track));

  const short = pace(track, { speed: 8, hz: 16, laps: 1 });
  short.lapTime = short.samples[short.samples.length - 1][0];
  const incomplete = validateSubmittedRun({ ghost: short, track, frameMm: 65, timeMs: short.lapTime });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.reason, 'INCOMPLETE LAPS');

  const fast = JSON.parse(JSON.stringify(ghost));
  for (let i = 1; i < fast.samples.length; i++) fast.samples[i][1] = ghost.samples[i - 1][1] + 80;
  const sped = validateSubmittedRun({ ghost: fast, track, frameMm: 65, timeMs: fast.lapTime });
  assert.equal(sped.ok, false);
  assert.equal(sped.reason, 'SPEED LIMIT');
  assert.ok(CLASS_MAX_SPEED[65] < CLASS_MAX_SPEED[85]);

  const sparse = JSON.parse(JSON.stringify(ghost));
  sparse.samples = [ghost.samples[0], ghost.samples[ghost.samples.length - 1]];
  sparse.lapTime = sparse.samples[1][0];
  const sp = validateSubmittedRun({ ghost: sparse, track, frameMm: 65, timeMs: sparse.lapTime });
  assert.equal(sp.ok, false);

  const mismatch = validateSubmittedRun({ ghost, track, frameMm: 65, timeMs: 9000 });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'TIME MISMATCH');
});

test('anti-cheat class speed limits follow W1 65/75/85', () => {
  assert.deepEqual(CLASS_IDS, [65, 75, 85]);
  const track = weeklyTrackFor('2026-W42');
  const ghost = pace(track, { speed: 8, hz: 12, laps: 3 });
  for (const c of CLASS_IDS) {
    const r = validateSubmittedRun({ ghost, track, frameMm: c, timeMs: ghost.lapTime });
    assert.equal(r.ok, true, c + ' ' + r.reason);
  }
  const body = normalizeSubmit({
    name: 'RyFly!!', week: '2026-W42', frameMm: 65, timeMs: ghost.lapTime, ghost, track,
  });
  assert.equal(body.ok, true, body.reason);
  assert.equal(body.name, 'RyFly');
  assert.equal(sanitizePilotName(''), 'PILOT');
});

test('duel codes ride QM2 prefix; track codes stay backward compatible', () => {
  assert.equal(SHARE_PREFIX, TRACK_PREFIX);
  const track = dailyTrackFor('2026-10-17');
  const ghost = pace(track);
  const code = encodeDuel({ ghost, track });
  assert.ok(code.startsWith(SHARE_PREFIX));
  const got = decodeDuel(code);
  assert.equal(got.ghost.name, 'PACE');
  assert.equal(got.track.id, track.id);
  assert.equal(got.track.gates.length, track.gates.length);
  const qm = decodeQm2(code);
  assert.equal(qm.type, 'duel');
  assert.equal(qm.ghost.k, undefined);

  const trackCode = encodeShare({
    id: 'living-sofa', map: 'living', name: 'Sofa Slalom', class: 'whoop',
    gates: track.gates, flags: [],
  });
  assert.ok(trackCode.startsWith(SHARE_PREFIX));
  const round = decodeShare(trackCode);
  assert.equal(round.gates.length, track.gates.length);
  assert.throws(() => decodeShare(code));

  const rawGhost = JSON.stringify({ v: 1, track: track.id, name: 'RIVAL', lapTime: ghost.lapTime, samples: ghost.samples });
  const asGhost = decodeQm2(rawGhost);
  assert.equal(asGhost.type, 'ghost');
  assert.equal(trackGhostErr(ghost, track.id), null);

  const win = duelResult(40000, 42000);
  assert.equal(win.kind, 'win');
  const lose = duelResult(43000, 42000);
  assert.equal(lose.kind, 'lose');
  assert.ok(fmtMs(61050).startsWith('01:01'));
  assert.equal(DUEL_KIND, 'duel');
});

test('daily streak counts consecutive UTC days; best time can only drop', () => {
  let p = emptyDaily();
  p = recordDailyFinish(p, { utc: '2026-10-15', timeMs: 50000 }).progress;
  assert.equal(p.streak, 1);
  p = recordDailyFinish(p, { utc: '2026-10-16', timeMs: 48000 }).progress;
  assert.equal(p.streak, 2);
  p = recordDailyFinish(p, { utc: '2026-10-16', timeMs: 47000 }).progress;
  assert.equal(p.streak, 2);
  assert.equal(p.bestByDay['2026-10-16'], 47000);
  p = recordDailyFinish(p, { utc: '2026-10-16', timeMs: 49000 }).progress;
  assert.equal(p.bestByDay['2026-10-16'], 47000);
  p = recordDailyFinish(p, { utc: '2026-10-18', timeMs: 44000 }).progress;
  assert.equal(p.streak, 1);
  assert.equal(p.bestStreak, 2);
});

test('local weekly board ranks by class; online UI is off when URL is unset', () => {
  assert.equal(LEADERBOARD_URL, '');
  assert.equal(onlineBoardsEnabled(leaderboardUrl(memStore(), { search: '' })), false);
  assert.equal(leaderboardUrl(memStore(), { search: '?lb=https://lb.example.workers.dev/' }), 'https://lb.example.workers.dev');
  let board = recordLocalBoard(null, { week: '2026-W42', frameMm: 65, name: 'A', timeMs: 50000, trackId: 'weekly-2026-W42' });
  board = recordLocalBoard(board, { week: '2026-W42', frameMm: 65, name: 'B', timeMs: 40000, trackId: 'weekly-2026-W42' });
  board = recordLocalBoard(board, { week: '2026-W42', frameMm: 75, name: 'A', timeMs: 41000, trackId: 'weekly-2026-W42' });
  const rows65 = boardRows(board, '2026-W42', 65);
  assert.equal(rows65[0].name, 'B');
  assert.equal(rows65.length, 2);
  assert.equal(boardRows(board, '2026-W42', 75).length, 1);
  const store = memStore();
  saveBoard(board, store);
  assert.equal(loadBoard(store).weeks['2026-W42'][65][0].timeMs, 40000);
});

test('skins unlock from coach medals, streak, and daily times; stock is free', () => {
  const none = { medals: {}, daily: emptyDaily() };
  assert.deepEqual(unlockedSkins(none).map((s) => s.id), ['stock']);
  assert.equal(isSkinUnlocked(SKINS.find((s) => s.id === 'bronze'), { medals: { 'hover-hold': 'bronze' } }), true);
  assert.equal(isSkinUnlocked(SKINS.find((s) => s.id === 'silver'), { medals: { a: 'silver', b: 'gold', c: 'silver' } }), true);
  assert.equal(isSkinUnlocked(SKINS.find((s) => s.id === 'silver'), { medals: { a: 'silver' } }), false);
  const streaked = emptyDaily();
  streaked.bestStreak = 7;
  assert.equal(isSkinUnlocked(SKINS.find((s) => s.id === 'streak7'), { daily: streaked }), true);
  const fast = recordDailyFinish(emptyDaily(), { utc: '2026-10-17', timeMs: 80000 }).progress;
  assert.equal(isSkinUnlocked(SKINS.find((s) => s.id === 'daily-fast'), { daily: fast }), true);
  const locked = resolveSkin('gold', none);
  assert.equal(locked.id, 'stock');
  const store = memStore();
  saveSkinId('bronze', store);
  assert.equal(loadSkinId(store), 'bronze');
});

test('worker health and board routes work without D1; submit needs DB', async () => {
  const { handleLeaderboard } = await import('../workers/sim-leaderboard/src/index.js');
  const health = await handleLeaderboard(new Request('https://x/health'), {});
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.ok, true);
  const opt = await handleLeaderboard(new Request('https://x/api/board', { method: 'OPTIONS' }), {});
  assert.equal(opt.status, 204);
  const board = await handleLeaderboard(new Request('https://x/api/board?class=65'), {});
  const bj = await board.json();
  assert.equal(bj.online, false);
  const week = await handleLeaderboard(new Request('https://x/api/week?week=2026-W42'), {});
  const wj = await week.json();
  assert.equal(wj.week, '2026-W42');
  assert.ok(wj.track && wj.track.gates.length >= 4);
  const sub = await handleLeaderboard(new Request('https://x/api/submit', { method: 'POST', body: '{}' }), {});
  assert.equal(sub.status, 503);
});

test('sim.html wires Daily / Boards / skins and keeps ghost paste', () => {
  assert.ok(simSrc.includes('sim-retention.js'));
  assert.ok(simSrc.includes('menuDaily'));
  assert.ok(simSrc.includes('menuBoards'));
  assert.ok(simSrc.includes('DAILY_KEY') || simSrc.includes('quadmathSimDaily') || simSrc.includes('loadDaily'));
  assert.ok(simSrc.includes('encodeDuel'));
  assert.ok(simSrc.includes('btnGhostDuel') || simSrc.includes('DUEL'));
  assert.ok(simSrc.includes('makeCanopyGroup'));
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML');
  assert.ok(retSrc.includes('copied from WebFPV') || retSrc.includes('Nothing here is copied from WebFPV'));
});
