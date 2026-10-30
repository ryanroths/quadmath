// Unit tests for W5 Retention: daily seed, anti-cheat, duels, unlocks.
// Node stdlib only: `node --test tools/test_sim_retention.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, makePaceGhost, SHARE_PREFIX as TRACK_PREFIX, encodeShare, decodeShare, ghostPayloadError as trackGhostErr, MAPS, BUILTIN_TRACK_FILES } from '../sim-tracks.js';
import { BUILD_KEY } from '../sim-build.js';
import { WHOOP_KEY } from '../sim-whoop.js';
import { ROOM_KEY } from '../sim-room.js';
import { COACH_KEY } from '../sim-coach.js';
import { LAYOUT } from '../sim-maps.js';
import {
  DAILY_KEY, BOARD_KEY, SKIN_KEY, CANOPY_KEY, WHOOP_KIT_KEY, LEADERBOARD_URL_KEY, LEADERBOARD_URL,
  PILOT_TOKEN_KEY, SHARE_PREFIX, DUEL_KIND, DAILY_MAPS, SKINS, CLASS_MAX_SPEED, CLASS_IDS,
  PHYS_VER, WEEK_GRACE_MS, DEFAULT_ALLOWED_ORIGIN,
  utcDateId, utcWeekId, addUtcDays, dailyTrackFor, weeklyTrackFor, weeklyIdFor,
  dailyTrackValid, dailyTrackInvalidReason, dailyTrackOnMap, isDailyTrackId, isWeeklyTrackId,
  trackFromRetentionId, DAILY_GEN, GATE_SIZE_MIN, GATE_SIZE_MAX, WS_PER_METRE,
  mapObstacles, gateHasClearance, minGateSpacing, dailyLapRange, estimateLapSeconds,
  validateSubmittedRun, countGhostLaps, encodeDuel, decodeDuel, decodeQm2,
  duelResult, emptyDaily, recordDailyFinish, loadDaily, saveDaily,
  loadBoard, saveBoard, recordLocalBoard, boardRows, leaderboardUrl,
  onlineBoardsEnabled, unlockedSkins, isSkinUnlocked, resolveSkin,
  loadSkinId, saveSkinId, loadCanopyOn, saveCanopyOn, makeCanopyGroup,
  layoutCanopyGroup, layoutCanopyPieces, canopyPieceCoverage, canopyFpvVisible,
  canopyViewBottomY, sanitizePilotName, normalizeSubmit, fmtMs,
  skinUnlockLabel, skinPalette, skinCssVars, skinMiniMarkup, skinHex,
  skinSwatchStroke, colorLum,
  makeCraftGroup, craftChaseVisible, makeSkinTrail, pushSkinTrail, clearSkinTrail,
  TRAIL_POINTS, tintGroup,
  defaultWhoopKit, normalizeWhoopKit, loadWhoopKit, saveWhoopKit, applyWhoopKitToSkin,
  CANOPY_SHAPES, canopyShapeLayout, applyCraftCanopyShape,
  REPLAY_GHOST_HZ, REPLAY_GHOST_MAX, REPLAY_CLIP_MS,
  replayChaseOffset, replayOrbitOffset, replayDurationMs, replayClipSpan, canRecordClip,
  mulberry32, weekAllowed, previousUtcWeekId, isPaceBotGhost, issuePilotToken,
  hashPilotToken, pickCorsOrigin, isLocalHost, escapeHtml, classFromBuild,
  syncDailyStreak, applyMissedDayReset,
  DAILY_LINE_KEY, DAILY_LINE_TRACKS, DAILY_LINE_MIN_MS, dailyLineFor, dailyLinePool, dailyLineBoardKey, boardKeyFor, boardStoreKey,
  loadDailyLine, saveDailyLine, recordDailyLineFinish, validateDailyLineRun,
  normalizeDailyLineSubmit, dailyLineRank, dailyLineMeta,
  RIG_DAILY_FROM, RIG_WEEKLY_FROM, RIG_LINE_GATES, weekMonday,
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
    track: track.id, name: extra && extra.name || 'PACE', speed: extra && extra.speed || 8, hz: extra && extra.hz || 16, laps: extra && extra.laps || 3,
  });
  g.lapTime = g.samples[g.samples.length - 1][0];
  return g;
}

function humanRun(track, extra) {
  const g = pace(track, extra);
  g.name = (extra && extra.name) || 'RYAN';
  for (let i = 0; i < g.samples.length; i++) {
    g.samples[i][2] = g.samples[i][2] + 0.08 + (i % 3) * 0.01;
  }
  return g;
}

const NOW_W42 = Date.UTC(2026, 9, 17, 18, 0, 0);

test('new storage keys only; never writes old keys or WebFPV', () => {
  assert.equal(DAILY_KEY, 'quadmathSimDaily');
  assert.equal(BOARD_KEY, 'quadmathSimBoard');
  assert.equal(SKIN_KEY, 'quadmathSimSkin');
  assert.equal(CANOPY_KEY, 'quadmathSimCanopy');
  assert.equal(WHOOP_KIT_KEY, 'quadmathSimWhoopKit');
  assert.ok(retSrc.includes('setItem(DAILY_KEY'));
  assert.ok(retSrc.includes('Nothing here is copied from WebFPV') || retSrc.includes('copied from WebFPV'));
  for (const banned of ['ryflyDroneType', 'ryflyRates', CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, BUILD_KEY, WHOOP_KEY, ROOM_KEY, COACH_KEY]) {
    const quoted = retSrc.includes("'" + banned + "'") || retSrc.includes('"' + banned + '"');
    assert.equal(quoted, false, 'must not mention ' + banned);
  }
  const store = memStore();
  saveDaily(recordDailyFinish(emptyDaily(), { utc: '2026-10-17', timeMs: 40000 }, Date.UTC(2026, 9, 17)).progress, store);
  saveBoard(recordLocalBoard(loadBoard(store), { week: '2026-W42', frameMm: 65, name: 'RY', timeMs: 40000, trackId: 'weekly-2026-W42' }), store);
  saveSkinId('stock', store);
  const keys = store.keys().sort();
  assert.deepEqual(keys, [boardStoreKey(), DAILY_KEY, SKIN_KEY].sort());
});

test('daily maps match sim-maps indoor LAYOUT', () => {
  for (const m of DAILY_MAPS) {
    assert.ok(LAYOUT[m.id], m.id);
    assert.equal(LAYOUT[m.id].w, m.w, m.id + ' w');
    assert.equal(LAYOUT[m.id].d, m.d, m.id + ' d');
    assert.equal(LAYOUT[m.id].h, m.h, m.id + ' h');
    assert.equal(LAYOUT[m.id].wall, m.wall, m.id + ' wall');
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
  assert.ok(a.gates.every((g) => g.solid && g.size >= GATE_SIZE_MIN - 0.04 && g.size <= GATE_SIZE_MAX + 0.08));
  for (let i = 0; i < 14; i++) {
    const day = addUtcDays('2026-10-01', i);
    const t = dailyTrackFor(day);
    assert.ok(dailyTrackValid(t), day + ' invalid ' + t.map + ' n=' + t.gates.length);
    assert.equal(t.class, 'whoop');
  }
  const sameRng = mulberry32(1);
  assert.equal(sameRng(), mulberry32(1)());
});

test('Daily from 2026-10-30 and Boards from 2026-W45 fly the Rig\'s named tracks; earlier days and weeks keep their generated courses', () => {
  assert.equal(RIG_DAILY_FROM, '2026-10-30');
  assert.equal(RIG_WEEKLY_FROM, '2026-W45');
  assert.equal(weekMonday('2026-W45'), '2026-11-02', 'the Monday after the Daily cutover');
  assert.equal(weekMonday('2026-W44'), '2026-10-26');
  assert.equal(weekMonday('2026-W01'), '2025-12-29');
  // The copy the Worker flies is the track file.
  const file = JSON.parse(readFileSync(join(root, 'tracks/rig-loop.json'), 'utf8'));
  assert.deepEqual(RIG_LINE_GATES['rig-loop'].gates, file.gates);
  assert.deepEqual(RIG_LINE_GATES['rig-loop'].start, file.start);
  for (const t of DAILY_LINE_TRACKS.filter((x) => x.map === 'rig')) assert.ok(RIG_LINE_GATES[t.id], t.id + ' has its gates here');
  assert.equal(DAILY_LINE_TRACKS.find((t) => t.id === 'rig-loop').from, '2026-10-30');

  const before = dailyTrackFor('2026-10-29');
  assert.ok(DAILY_MAPS.some((m) => m.id === before.map), 'the day before keeps its generated course');
  for (const day of ['2026-10-30', '2026-10-31', '2027-03-14']) {
    const t = dailyTrackFor(day);
    assert.equal(t.id, 'daily-' + day, 'the board stays per day');
    assert.equal(t.map, 'rig', day);
    assert.equal(t.line, 'rig-loop');
    assert.deepEqual(t.gates, file.gates);
    assert.deepEqual(t.start, file.start);
    assert.ok(dailyTrackValid(t), day);
  }
  const w44 = weeklyTrackFor('2026-W44');
  assert.ok(DAILY_MAPS.some((m) => m.id === w44.map), 'this week keeps its course until Monday');
  for (const w of ['2026-W45', '2027-W02']) {
    const t = weeklyTrackFor(w);
    assert.equal(t.id, weeklyIdFor(w), 'the board stays per week');
    assert.equal(t.map, 'rig', w);
    assert.deepEqual(t.gates, file.gates);
    assert.ok(dailyTrackValid(t), w);
  }
  const moved = dailyTrackFor('2026-10-30');
  assert.equal(dailyTrackValid({ ...moved, gates: moved.gates.map((g, i) => (i === 3 ? { ...g, x: g.x + 1 } : g)) }), false, 'a moved gate is not the Rig track');
});

test('the Worker takes a W45 run on the Rig track and rejects its pace bot', () => {
  const now = Date.UTC(2026, 10, 3, 18, 0, 0);
  const week = utcWeekId(now);
  assert.equal(week, '2026-W45');
  const track = weeklyTrackFor(week);
  assert.equal(track.map, 'rig');
  const ghost = humanRun(track);
  const ok = normalizeSubmit({ name: 'Ry', week, frameMm: 65, timeMs: ghost.lapTime, ghost, track: track.id, build: { frameMm: 65 } }, now);
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.trackId, track.id);
  const bot = pace(track, { name: 'PACE BOT' });
  assert.equal(isPaceBotGhost(bot, track), true);
  const rejected = normalizeSubmit({ name: 'Ry', week, frameMm: 65, timeMs: bot.lapTime, ghost: bot, track: track.id, build: { frameMm: 65 } }, now);
  assert.equal(rejected.ok, false);
});

test('weekly track is stable for the ISO week', () => {
  const w = utcWeekId(Date.UTC(2026, 9, 17));
  const t = weeklyTrackFor(w);
  assert.ok(isWeeklyTrackId(t.id));
  assert.equal(t.id, weeklyIdFor(w));
  assert.equal(t.id, weeklyTrackFor(w).id);
  assert.ok(t.id.endsWith('-g' + DAILY_GEN));
  assert.ok(isWeeklyTrackId('weekly-' + w));
  assert.ok(dailyTrackValid(t));
  assert.equal(utcDateId(Date.UTC(2026, 9, 17)), '2026-10-17');
  assert.equal(trackFromRetentionId('daily-2026-10-17').id, 'daily-2026-10-17');
  assert.equal(trackFromRetentionId('weekly-' + w).id, weeklyIdFor(w));
  assert.equal(DAILY_GEN, 2);
});

test('daily generator: 64 seeds on every indoor map stay clear, spaced, and in-bounds', () => {
  assert.ok(GATE_SIZE_MIN >= 0.28 * WS_PER_METRE - 1e-6);
  assert.ok(GATE_SIZE_MAX <= 0.40 * WS_PER_METRE + 1e-6);
  assert.ok(retSrc.includes('DAILY_GEN = 2'));
  assert.ok(retSrc.includes("seedPrefix() + 'daily|'"));
  assert.ok(!retSrc.includes("from './sim-maps"));
  let n = 0;
  for (const map of DAILY_MAPS) {
    const boxes = mapObstacles(map);
    assert.ok(boxes.length >= 5, map.id + ' obstacles');
    const range = dailyLapRange(map);
    const spacing = minGateSpacing(map);
    for (let i = 0; i < 64; i++) {
      const t = dailyTrackOnMap('qa|' + map.id + '|' + i, map.id, 'qa-' + map.id + '-' + i);
      const why = dailyTrackInvalidReason(t);
      assert.equal(why, '', map.id + ' seed ' + i + ' ' + why);
      assert.ok(dailyTrackValid(t));
      assert.equal(t.map, map.id);
      let metres = 0;
      let minD = Infinity;
      for (let g = 0; g < t.gates.length; g++) {
        const a = t.gates[g], b = t.gates[(g + 1) % t.gates.length];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        metres += d;
        minD = Math.min(minD, d);
        assert.ok(gateHasClearance(a, map, boxes, t.gates[(g + t.gates.length - 1) % t.gates.length]), map.id + ' gate ' + g);
        assert.ok(Math.abs(a.x) < map.w / 2 - 1.0);
        assert.ok(Math.abs(a.z) < map.d / 2 - 1.0);
        assert.ok(a.y > 1.3 && a.y < map.h * 0.5);
        assert.ok(a.size >= GATE_SIZE_MIN - 0.04 && a.size <= GATE_SIZE_MAX + 0.08);
      }
      metres /= WS_PER_METRE;
      assert.ok(minD >= spacing - 0.05, map.id + ' spacing ' + minD + ' < ' + spacing);
      assert.ok(metres >= range.minM && metres <= range.maxM, map.id + ' lap m ' + metres);
      const est = estimateLapSeconds(t.gates);
      assert.ok(est > 3);
      if (map.id === 'trainer') assert.ok(est >= 22, map.id + ' short lap ' + est);
      if (map.id === 'living' || map.id === 'garage') assert.ok(est >= 14, map.id + ' short lap ' + est);
      n++;
    }
  }
  assert.ok(n >= 60 * DAILY_MAPS.length, 'seed count ' + n);
  assert.deepEqual(DAILY_MAPS.map((m) => m.id), ['living', 'garage', 'warehouse', 'office', 'gym', 'trainer']);
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

  const tagged = Object.assign({}, ghost, { threeD: true });
  const d3 = validateSubmittedRun({ ghost: tagged, track, frameMm: 65, timeMs: ghost.lapTime });
  assert.equal(d3.ok, false);
  assert.equal(d3.reason, '3D MODE');
  const flag = validateSubmittedRun({ ghost, track, frameMm: 65, timeMs: ghost.lapTime, threeD: true });
  assert.equal(flag.ok, false);
  assert.equal(flag.reason, '3D MODE');
});

test('anti-cheat class speed limits follow W1 65/75/85', () => {
  assert.deepEqual(CLASS_IDS, [65, 75, 85]);
  const track = weeklyTrackFor('2026-W42');
  const ghost = humanRun(track, { speed: 8, hz: 12, laps: 3 });
  for (const c of CLASS_IDS) {
    const r = validateSubmittedRun({ ghost, track, frameMm: c, timeMs: ghost.lapTime });
    assert.equal(r.ok, true, c + ' ' + r.reason);
  }
  const body = normalizeSubmit({
    name: 'RyFly!!', week: '2026-W42', frameMm: 65, timeMs: ghost.lapTime, ghost, track,
    build: { frameMm: 65 }, token: 'a'.repeat(32),
  }, NOW_W42);
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
  const d15 = Date.UTC(2026, 9, 15);
  const d16 = Date.UTC(2026, 9, 16);
  const d18 = Date.UTC(2026, 9, 18);
  p = recordDailyFinish(p, { utc: '2026-10-15', timeMs: 50000 }, d15).progress;
  assert.equal(p.streak, 1);
  p = recordDailyFinish(p, { utc: '2026-10-16', timeMs: 48000 }, d16).progress;
  assert.equal(p.streak, 2);
  p = recordDailyFinish(p, { utc: '2026-10-16', timeMs: 47000 }, d16).progress;
  assert.equal(p.streak, 2);
  assert.equal(p.bestByDay['2026-10-16'], 47000);
  p = recordDailyFinish(p, { utc: '2026-10-16', timeMs: 49000 }, d16).progress;
  assert.equal(p.bestByDay['2026-10-16'], 47000);
  p = recordDailyFinish(p, { utc: '2026-10-18', timeMs: 44000 }, d18).progress;
  assert.equal(p.streak, 1);
  assert.equal(p.bestStreak, 2);
});

test('local weekly board ranks by class; online boards follow https LEADERBOARD_URL', () => {
  assert.equal(LEADERBOARD_URL, 'https://sim-leaderboard.ryan-roths.workers.dev');
  assert.equal(onlineBoardsEnabled(LEADERBOARD_URL), true);
  assert.equal(onlineBoardsEnabled(''), false);
  assert.equal(onlineBoardsEnabled('http://127.0.0.1:8787'), false);
  assert.equal(leaderboardUrl(memStore(), { search: '' }), LEADERBOARD_URL);
  assert.equal(leaderboardUrl(memStore(), { search: '?lb=https://evil.example/' }), LEADERBOARD_URL);
  assert.equal(leaderboardUrl(memStore(), { hostname: 'quadmath.com', search: '?lb=https://evil.example/' }), LEADERBOARD_URL);
  assert.equal(
    leaderboardUrl(memStore(), { hostname: 'localhost', search: '?lb=https://lb.example.workers.dev/' }),
    'https://lb.example.workers.dev',
  );
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
  const fast = recordDailyFinish(emptyDaily(), { utc: '2026-10-17', timeMs: 80000 }, Date.UTC(2026, 9, 17)).progress;
  assert.equal(isSkinUnlocked(SKINS.find((s) => s.id === 'daily-fast'), { daily: fast }), true);
  const locked = resolveSkin('gold', none);
  assert.equal(locked.id, 'stock');
  const store = memStore();
  saveSkinId('bronze', store);
  assert.equal(loadSkinId(store), 'bronze');
});

test('skin unlock ids and localStorage keys stay frozen', () => {
  assert.equal(SKIN_KEY, 'quadmathSimSkin');
  assert.equal(CANOPY_KEY, 'quadmathSimCanopy');
  assert.deepEqual(SKINS.map((s) => s.id), [
    'stock', 'bronze', 'silver', 'gold', 'streak3', 'streak7', 'daily-fast', 'coach-all',
  ]);
  const frozen = [
    ['stock', { type: 'always' }],
    ['bronze', { type: 'medals', medal: 'bronze', count: 1 }],
    ['silver', { type: 'medals', medal: 'silver', count: 3 }],
    ['gold', { type: 'medals', medal: 'gold', count: 3 }],
    ['streak3', { type: 'streak', days: 3 }],
    ['streak7', { type: 'streak', days: 7 }],
    ['daily-fast', { type: 'dailyMs', ms: 90000 }],
    ['coach-all', { type: 'medals', medal: 'gold', count: 6 }],
  ];
  for (const [id, unlock] of frozen) {
    const s = SKINS.find((x) => x.id === id);
    assert.ok(s, id);
    assert.deepEqual({ ...s.unlock }, unlock);
  }
  assert.equal(skinUnlockLabel(SKINS[0]), 'Free');
  assert.equal(skinUnlockLabel(SKINS.find((s) => s.id === 'bronze')), '1 bronze medal');
  assert.equal(skinUnlockLabel(SKINS.find((s) => s.id === 'streak3')), '3-day streak');
  assert.equal(skinUnlockLabel(SKINS.find((s) => s.id === 'daily-fast')), 'Daily under 01:30.00');
  const store = memStore();
  saveSkinId('coach-all', store);
  assert.equal(store.getItem(SKIN_KEY), 'coach-all');
  assert.deepEqual(store.keys(), [SKIN_KEY]);
  const palettes = SKINS.map((s) => skinPalette(s).canopy + ':' + skinPalette(s).frame + ':' + skinPalette(s).prop);
  assert.equal(new Set(palettes).size, SKINS.length);
  const banned = ['webfpv', 'web fpv', 'carbon stealth', 'phantom', 'default skin'];
  for (const s of SKINS) {
    const blob = (s.name + ' ' + (s.vibe || '')).toLowerCase();
    for (const b of banned) assert.equal(blob.includes(b), false, s.id + ' ' + b);
    assert.ok(s.vibe);
    assert.match(skinHex(s.canopy), /^#[0-9a-f]{6}$/);
    assert.ok(skinCssVars(s).includes('--sk-led:'));
    assert.ok(skinCssVars(s).includes('--sk-stroke:'));
  }
  const mini = skinMiniMarkup();
  assert.ok(mini.includes('skin-mini'));
  assert.ok(mini.includes('sk-duct'));
  assert.ok(mini.includes('sk-duct-edge'));
  assert.ok(mini.includes('sk-blade'));
  assert.ok(mini.includes('sk-lens'));
  assert.equal((mini.match(/class="sk-duct"/g) || []).length, 4);
  assert.equal((mini.match(/class="sk-duct-edge"/g) || []).length, 4);
  const panel = 0x15171d;
  function contrast(a, b) {
    const hi = Math.max(colorLum(a), colorLum(b));
    const lo = Math.min(colorLum(a), colorLum(b));
    return (hi + 0.05) / (lo + 0.05);
  }
  for (const s of SKINS) {
    const stroke = skinSwatchStroke(s);
    assert.ok(contrast(stroke, panel) >= 2.4, s.id + ' swatch ducts too close to panel');
  }
  const paper = SKINS.find((s) => s.id === 'silver');
  assert.ok(colorLum(skinSwatchStroke(paper)) > colorLum(paper.frame) + 0.05);
  assert.notEqual(skinHex(skinSwatchStroke(paper)), skinHex(paper.frame));
  assert.equal(paper.frame, 0x1a1a1a);
  assert.ok(simSrc.includes('skin-mini'));
  assert.ok(simSrc.includes('sk-duct-edge'));
  assert.ok(simSrc.includes('--sk-stroke'));
  assert.match(simSrc, /skin-mini\{width:104px;height:104px/);
  assert.ok(simSrc.includes('skinUnlockLabel'));
  assert.ok(simSrc.includes('makeCraftGroup'));
  assert.ok(!simSrc.includes('Canopy colors only'));
});

function fakeD1() {
  const scores = new Map();
  const pilots = new Map();
  const rate = new Map();
  const k = (...p) => p.join('|');
  return {
    prepare(sql) {
      const s = String(sql);
      return {
        bind(...args) {
          return {
            async first() {
              if (s.includes('FROM rate_limit')) {
                const n = rate.get(k(args[0], args[1]));
                return n ? { n } : null;
              }
              if (s.includes('FROM pilots')) {
                const h = pilots.get(args[0]);
                return h ? { token_hash: h } : null;
              }
              if (s.includes('time_ms FROM scores')) {
                const row = scores.get(k(args[0], args[1], args[2]));
                return row ? { time_ms: row.time_ms } : null;
              }
              return null;
            },
            async all() {
              const out = [];
              for (const row of scores.values()) {
                if (row.week === args[0] && row.class === args[1] && row.track_id === args[2]) {
                  out.push({ name: row.name, timeMs: row.time_ms, trackId: row.track_id, at: row.submitted_ms });
                }
              }
              out.sort((a, b) => a.timeMs - b.timeMs);
              return { results: out.slice(0, 20) };
            },
            async run() {
              if (s.includes('rate_limit')) {
                const id = k(args[0], args[1]);
                rate.set(id, (rate.get(id) || 0) + 1);
              } else if (s.includes('INTO pilots')) {
                if (!pilots.has(args[0])) pilots.set(args[0], args[1]);
              } else if (s.includes('INTO scores')) {
                scores.set(k(args[0], args[1], args[2]), {
                  week: args[0], class: args[1], name: args[2],
                  time_ms: args[3], track_id: args[4], submitted_ms: args[5],
                });
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('worker health and board routes work without D1; submit needs DB', async () => {
  const { handleLeaderboard } = await import('../workers/sim-leaderboard/src/index.js');
  const health = await handleLeaderboard(new Request('https://x/health'), {});
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.ok, true);
  assert.equal(health.headers.get('Access-Control-Allow-Origin'), DEFAULT_ALLOWED_ORIGIN);
  const opt = await handleLeaderboard(
    new Request('https://x/api/board', { method: 'OPTIONS', headers: { Origin: 'https://quadmath.com' } }),
    { ALLOWED_ORIGIN: 'https://quadmath.com' },
  );
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get('Access-Control-Allow-Origin'), 'https://quadmath.com');
  const blocked = await handleLeaderboard(
    new Request('https://x/health', { headers: { Origin: 'https://evil.example' } }),
    { ALLOWED_ORIGIN: 'https://quadmath.com' },
  );
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), 'https://quadmath.com');
  const local = await handleLeaderboard(
    new Request('https://x/health', { headers: { Origin: 'http://localhost:4173' } }),
    { ALLOWED_ORIGIN: 'https://quadmath.com,http://localhost:4173' },
  );
  assert.equal(local.headers.get('Access-Control-Allow-Origin'), 'http://localhost:4173');
  const board = await handleLeaderboard(new Request('https://x/api/board?class=65'), {});
  const bj = await board.json();
  assert.equal(bj.online, false);
  assert.equal(bj.trackId, weeklyTrackFor(bj.week).id);
  const week = await handleLeaderboard(new Request('https://x/api/week?week=2026-W42'), {});
  const wj = await week.json();
  assert.equal(wj.week, '2026-W42');
  assert.ok(wj.track && wj.track.gates.length >= 4);
  const sub = await handleLeaderboard(new Request('https://x/api/submit', { method: 'POST', body: '{}' }), {});
  assert.equal(sub.status, 503);
});

test('H1 server derives week track, rejects pace-bot/phys/class/week, claims names', async () => {
  assert.equal(PHYS_VER, 5);
  assert.equal(weekAllowed('2026-W42', NOW_W42), true);
  assert.equal(weekAllowed('2026-W41', NOW_W42), false);
  const mondayW43 = Date.UTC(2026, 9, 19, 10, 0, 0);
  assert.equal(utcWeekId(mondayW43), '2026-W43');
  assert.equal(previousUtcWeekId(mondayW43), '2026-W42');
  assert.equal(weekAllowed('2026-W42', mondayW43), true);
  assert.ok(WEEK_GRACE_MS >= 24 * 3600 * 1000);
  assert.equal(classFromBuild({ frameMm: 75 }), 75);
  assert.equal(pickCorsOrigin(null, 'https://evil.example'), DEFAULT_ALLOWED_ORIGIN);

  const week = '2026-W42';
  const track = weeklyTrackFor(week);
  const ghost = humanRun(track);
  const paceGhost = pace(track, { name: 'PACE BOT' });
  assert.equal(isPaceBotGhost(paceGhost, track), true);
  assert.equal(isPaceBotGhost(ghost, track), false);

  const mismatch = normalizeSubmit({
    name: 'Ry', week, frameMm: 65, timeMs: ghost.lapTime, ghost, track: dailyTrackFor('2026-10-17'),
  }, NOW_W42);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'TRACK MISMATCH');

  const oldWeek = normalizeSubmit({
    name: 'Ry', week: '2020-W01', frameMm: 65, timeMs: ghost.lapTime, ghost, track,
  }, NOW_W42);
  assert.equal(oldWeek.ok, false);
  assert.equal(oldWeek.reason, 'BAD WEEK');

  const noPhys = JSON.parse(JSON.stringify(ghost));
  delete noPhys.phys;
  const phys = normalizeSubmit({
    name: 'Ry', week, frameMm: 65, timeMs: ghost.lapTime, ghost: noPhys, track,
  }, NOW_W42);
  assert.equal(phys.ok, false);
  assert.equal(phys.reason, 'PHYS MISMATCH');
  // A run recorded before the fixed 1 kHz cores (phys 2) is refused too.
  const phys2 = normalizeSubmit({
    name: 'Ry', week, frameMm: 65, timeMs: ghost.lapTime, ghost: { ...ghost, phys: 2 }, track,
  }, NOW_W42);
  assert.equal(phys2.ok, false);
  assert.equal(phys2.reason, 'PHYS MISMATCH');
  // And one from before the bf core became the default (phys 3).
  const phys3 = normalizeSubmit({
    name: 'Ry', week, frameMm: 65, timeMs: ghost.lapTime, ghost: { ...ghost, phys: 3 }, track,
  }, NOW_W42);
  assert.equal(phys3.ok, false);
  assert.equal(phys3.reason, 'PHYS MISMATCH');
  // And one from before sim-core v0.4.0's wall contact (phys 4).
  const phys4 = normalizeSubmit({
    name: 'Ry', week, frameMm: 65, timeMs: ghost.lapTime, ghost: { ...ghost, phys: 4 }, track,
  }, NOW_W42);
  assert.equal(phys4.ok, false);
  assert.equal(phys4.reason, 'PHYS MISMATCH');

  const cls = normalizeSubmit({
    name: 'Ry', week, frameMm: 65, timeMs: ghost.lapTime, ghost, track, build: { frameMm: 85 },
  }, NOW_W42);
  assert.equal(cls.ok, false);
  assert.equal(cls.reason, 'CLASS MISMATCH');

  const bot = normalizeSubmit({
    name: 'Ry', week, frameMm: 65, timeMs: paceGhost.lapTime, ghost: paceGhost, track,
  }, NOW_W42);
  assert.equal(bot.ok, false);
  assert.equal(bot.reason, 'PACE BOT');

  const { handleLeaderboard } = await import('../workers/sim-leaderboard/src/index.js');
  const db = fakeD1();
  const env = { DB: db, ALLOWED_ORIGIN: 'https://quadmath.com' };
  const tokenA = 'ab'.repeat(16);
  const tokenB = 'cd'.repeat(16);
  const liveWeek = utcWeekId();
  const liveTrack = weeklyTrackFor(liveWeek);
  const liveGhost = humanRun(liveTrack);
  const payload = {
    week: liveWeek, frameMm: 65, name: 'Ry', timeMs: liveGhost.lapTime, ghost: liveGhost, track: liveTrack,
    build: { frameMm: 65 }, token: tokenA,
  };
  const ok = await handleLeaderboard(new Request('https://x/api/submit', {
    method: 'POST', body: JSON.stringify(payload),
  }), env);
  const oj = await ok.json();
  assert.equal(ok.status, 200, oj.reason);
  assert.equal(oj.ok, true);
  const steal = await handleLeaderboard(new Request('https://x/api/submit', {
    method: 'POST', body: JSON.stringify({ ...payload, token: tokenB, timeMs: liveGhost.lapTime - 1000 }),
  }), env);
  assert.equal(steal.status, 403);
  const sj = await steal.json();
  assert.equal(sj.reason, 'NAME TAKEN');
  const hashedA = await hashPilotToken(tokenA);
  const hashedB = await hashPilotToken(tokenB);
  assert.notEqual(hashedA, hashedB);
});

test('worker week/board/submit use weekly-YYYY-Wxx-g2 and do not mix old ids', async () => {
  const { handleLeaderboard } = await import('../workers/sim-leaderboard/src/index.js');
  const week = utcWeekId();
  const track = weeklyTrackFor(week);
  const wantId = weeklyIdFor(week);
  const oldAlias = 'weekly-' + week;
  assert.match(week, /^\d{4}-W\d{2}$/);
  assert.equal(track.id, wantId);
  assert.match(track.id, /^weekly-\d{4}-W\d{2}-g2$/);
  assert.notEqual(track.id, oldAlias);

  const weekRes = await handleLeaderboard(new Request('https://x/api/week?week=' + week), {});
  const weekBody = await weekRes.json();
  assert.equal(weekBody.track.id, wantId);
  assert.notEqual(weekBody.track.id, oldAlias);

  const db = fakeD1();
  const env = { DB: db, ALLOWED_ORIGIN: 'https://quadmath.com' };
  const ghost = humanRun(track);
  const token = 'ef'.repeat(16);
  const posted = await handleLeaderboard(new Request('https://x/api/submit', {
    method: 'POST',
    body: JSON.stringify({
      week, frameMm: 65, name: 'Ry', timeMs: ghost.lapTime, ghost, track,
      build: { frameMm: 65 }, token,
    }),
  }), env);
  const postedBody = await posted.json();
  assert.equal(posted.status, 200, postedBody.reason);
  assert.equal(postedBody.ok, true);

  const oldId = normalizeSubmit({
    week, frameMm: 65, name: 'Ry', timeMs: ghost.lapTime, ghost,
    track: oldAlias, build: { frameMm: 65 }, token,
  });
  assert.equal(oldId.ok, true, oldId.reason);
  assert.equal(oldId.trackId, wantId);

  const board = await handleLeaderboard(new Request('https://x/api/board?week=' + week + '&class=65'), env);
  const boardBody = await board.json();
  assert.equal(boardBody.trackId, wantId);
  assert.equal(boardBody.entries.length, 1);
  assert.equal(boardBody.entries[0].trackId, wantId);

  await db.prepare(
    'INSERT INTO scores (week, class, name, time_ms, track_id, submitted_ms) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(week, 65, 'OLD', 1000, oldAlias, Date.now()).run();
  const mixed = await handleLeaderboard(new Request('https://x/api/board?week=' + week + '&class=65'), env);
  const mixedBody = await mixed.json();
  assert.equal(mixedBody.entries.every((row) => row.trackId === wantId), true);
  assert.ok(!mixedBody.entries.some((row) => row.name === 'OLD'));
});

test('boards are kept per PHYS_VER: after the bump to 5 a phys 4 or phys 3 row neither lists nor blocks', async () => {
  const { handleLeaderboard } = await import('../workers/sim-leaderboard/src/index.js');
  assert.equal(boardKeyFor('2026-W44'), '2026-W44.p5');
  assert.equal(boardKeyFor(dailyLineBoardKey('2026-10-27')), 'D2026-10-27.p5');
  const week = utcWeekId();
  const track = weeklyTrackFor(week);
  const db = fakeD1();
  const env = { DB: db, ALLOWED_ORIGIN: 'https://quadmath.com' };
  const insert = 'INSERT INTO scores (week, class, name, time_ms, track_id, submitted_ms) VALUES (?, ?, ?, ?, ?, ?)';
  // What the phys 3 and phys 4 Workers wrote this week: the bare week and
  // week.p4 as the key, and the same pilot faster than the run below.
  await db.prepare(insert).bind(week, 65, 'Ry', 1000, track.id, Date.now()).run();
  await db.prepare(insert).bind(week + '.p4', 65, 'Ry', 1100, track.id, Date.now()).run();
  const boardUrl = 'https://x/api/board?week=' + week + '&class=65';
  const before = await (await handleLeaderboard(new Request(boardUrl), env)).json();
  assert.deepEqual(before.entries, []);

  const ghost = humanRun(track);
  assert.ok(ghost.lapTime > 1000);
  const posted = await handleLeaderboard(new Request('https://x/api/submit', {
    method: 'POST',
    body: JSON.stringify({
      week, frameMm: 65, name: 'Ry', timeMs: ghost.lapTime, ghost, track,
      build: { frameMm: 65 }, token: '12'.repeat(16),
    }),
  }), env);
  const pj = await posted.json();
  assert.equal(posted.status, 200, pj.reason);
  assert.equal(pj.improved, true);
  assert.deepEqual(pj.entries.map((r) => [r.name, r.timeMs]), [['Ry', ghost.lapTime]]);
  const after = await (await handleLeaderboard(new Request(boardUrl), env)).json();
  assert.deepEqual(after.entries.map((r) => r.name), ['Ry']);

  // The Daily Line board: today's phys 3 and phys 4 rows are gone, a phys 5
  // row lists.
  const day = utcDateId();
  const line = dailyLineFor(day);
  await db.prepare(insert).bind(dailyLineBoardKey(day), 65, 'OLD', 3000, line.trackId, Date.now()).run();
  await db.prepare(insert).bind(dailyLineBoardKey(day) + '.p4', 65, 'OLD', 3000, line.trackId, Date.now()).run();
  const lineUrl = 'https://x/api/daily?day=' + day + '&class=65';
  assert.deepEqual((await (await handleLeaderboard(new Request(lineUrl), env)).json()).entries, []);
  await db.prepare(insert).bind(boardKeyFor(dailyLineBoardKey(day)), 65, 'NEW', 9000, line.trackId, Date.now()).run();
  assert.deepEqual((await (await handleLeaderboard(new Request(lineUrl), env)).json()).entries.map((r) => r.name), ['NEW']);
});

test('the local board is kept per PHYS_VER under its own key; older rows are never read or written', () => {
  assert.equal(boardStoreKey(), 'quadmathSimBoard.p5');
  const store = memStore();
  // What phys 3 and phys 4 pages left (and an old page still open in a tab
  // keeps writing).
  const legacy = JSON.stringify({
    v: 1,
    weeks: { '2026-W44': { 65: [{ name: 'OLD', timeMs: 1000, trackId: 'weekly-2026-W44-g2', at: 1 }], 75: [], 85: [] } },
  });
  store.setItem(BOARD_KEY, legacy);
  store.setItem(BOARD_KEY + '.p4', legacy);
  assert.deepEqual(boardRows(loadBoard(store), '2026-W44', 65), []);
  saveBoard(recordLocalBoard(loadBoard(store), {
    week: '2026-W44', frameMm: 65, name: 'RY', timeMs: 40000, trackId: 'weekly-2026-W44-g2',
  }), store);
  assert.deepEqual(boardRows(loadBoard(store), '2026-W44', 65).map((r) => r.name), ['RY']);
  assert.equal(store.getItem(BOARD_KEY), legacy, 'the old key is left as it was');
  assert.equal(store.getItem(BOARD_KEY + '.p4'), legacy, 'the phys 4 key is left as it was');
});

test('L4 only today\'s daily counts; missed-day streak resets on load', () => {
  const d16 = Date.UTC(2026, 9, 16);
  const d18 = Date.UTC(2026, 9, 18);
  let p = recordDailyFinish(emptyDaily(), { utc: '2026-10-16', timeMs: 40000, trackId: 'daily-2026-10-16' }, d16).progress;
  assert.equal(p.streak, 1);
  const skip = recordDailyFinish(p, { utc: '2026-10-16', timeMs: 39000, trackId: 'daily-2026-10-16' }, d18);
  assert.equal(skip.counted, false);
  assert.equal(skip.progress.streak, 1);
  const wrongTrack = recordDailyFinish(p, { utc: '2026-10-18', timeMs: 39000, trackId: 'daily-2026-10-16' }, d18);
  assert.equal(wrongTrack.counted, false);
  const store = memStore();
  saveDaily(p, store);
  const synced = syncDailyStreak(store, d18);
  assert.equal(synced.reset, true);
  assert.equal(synced.progress.streak, 0);
  assert.equal(applyMissedDayReset(p, d16).reset, false);
});

test('L6 sanitizePilotName keeps Unicode letters and M2 escapes HTML', () => {
  assert.equal(sanitizePilotName('José-飛'), 'José-飛');
  assert.equal(sanitizePilotName('<img src=x>'), 'img srcx');
  assert.equal(sanitizePilotName('Пилот 65'), 'Пилот 65');
  assert.ok(sanitizePilotName('x'.repeat(40)).length <= 16);
  assert.equal(escapeHtml('<b>Ry</b>'), '&lt;b&gt;Ry&lt;/b&gt;');
  assert.equal(isLocalHost({ hostname: 'localhost' }), true);
  assert.equal(isLocalHost({ hostname: 'quadmath.com' }), false);
  const tokStore = memStore();
  const t = issuePilotToken(tokStore);
  assert.match(t, /^[a-f0-9]{32}$/i);
  assert.equal(issuePilotToken(tokStore), t);
  assert.deepEqual(tokStore.keys(), [PILOT_TOKEN_KEY]);
});

test('sim.html wires Daily / Boards / skins and keeps ghost paste', () => {
  assert.ok(simSrc.includes('sim-retention.js'));
  assert.ok(simSrc.includes('menuDaily'));
  assert.ok(simSrc.includes('menuDailyLine'));
  assert.ok(simSrc.includes('menuBoards'));
  assert.ok(simSrc.includes('DAILY_KEY') || simSrc.includes('quadmathSimDaily') || simSrc.includes('loadDaily'));
  assert.ok(simSrc.includes('encodeDuel'));
  assert.ok(simSrc.includes('btnGhostDuel') || simSrc.includes('DUEL'));
  assert.ok(simSrc.includes('makeCanopyGroup'));
  assert.ok(simSrc.includes('makeCraftGroup'));
  assert.ok(simSrc.includes('layoutCanopyGroup'));
  assert.ok(simSrc.includes('canopyFpvVisible'));
  assert.ok(simSrc.includes('craftChaseVisible'));
  assert.ok(simSrc.includes('menuWhoop'));
  assert.ok(simSrc.includes('openWhoopCard'));
  assert.ok(simSrc.includes('id="replayHud"'));
  assert.ok(simSrc.includes('startReplay'));
  assert.ok(simSrc.includes('demoReplayForShot'));
  assert.ok(simSrc.includes('REPLAY_GHOST_HZ'));
  assert.ok(simSrc.includes('recordReplayClip'));
  assert.ok(simSrc.includes('saveReplayStill'));
  assert.ok(simSrc.includes('WHOOP_KIT_KEY') || simSrc.includes('quadmathSimWhoopKit'));
  assert.ok(simSrc.includes('Show canopy'));
  assert.ok(simSrc.includes('id="cbCanopy"'));
  assert.ok(!/id="cbCanopy"[^>]*\bchecked\b/.test(simSrc), 'Show canopy defaults off');
  assert.ok(simSrc.includes('loadCanopyOn') && simSrc.includes('saveCanopyOn'));
  assert.ok(simSrc.includes('CANOPY_KEY') || simSrc.includes('quadmathSimCanopy'));
  assert.ok(simSrc.includes('renderBoardBody'));
  assert.ok(simSrc.includes("b.textContent"));
  assert.ok(simSrc.includes('Resets 5 PM Phoenix'));
  assert.ok(simSrc.includes('issuePilotToken'));
  assert.ok(simSrc.includes('syncDailyStreak'));
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML');
  assert.ok(retSrc.includes('copied from WebFPV') || retSrc.includes('Nothing here is copied from WebFPV'));
});

function mockTHREE() {
  class Vec {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Obj {
    constructor() {
      this.position = new Vec();
      this.scale = new Vec(1, 1, 1);
      this.rotation = new Vec();
      this.userData = {};
      this.children = [];
      this.visible = true;
      this.name = '';
      this.material = null;
    }
    add(c) { this.children.push(c); }
    traverse(fn) {
      fn(this);
      for (const c of this.children) c.traverse(fn);
    }
  }
  class Mesh extends Obj {
    constructor(geo, mat) {
      super();
      this.geometry = geo;
      this.material = mat;
    }
  }
  return {
    Group: class extends Obj {},
    Mesh,
    BoxGeometry: class { constructor(w, h, d) { this.w = w; this.h = h; this.d = d; } },
    SphereGeometry: class { constructor(r) { this.r = r; } },
    CylinderGeometry: class {
      constructor(a, b, h, seg, hseg, open) {
        this.rTop = a; this.rBot = b; this.h = h; this.openEnded = !!open;
      }
    },
    DoubleSide: 2,
    MeshStandardMaterial: class {
      constructor(o) {
        Object.assign(this, o);
        this.color = { setHex(v) { this._hex = v; } };
        this.emissive = { setHex(v) { this._e = v; } };
      }
    },
    LineBasicMaterial: class {
      constructor(o) {
        Object.assign(this, o);
        this.color = { setHex(v) { this._hex = v; } };
      }
    },
    BufferAttribute: class {
      constructor(arr, n) { this.array = arr; this.itemSize = n; this.needsUpdate = false; }
    },
    BufferGeometry: class {
      constructor() { this.attributes = {}; this.drawCount = 0; }
      setAttribute(name, attr) { this.attributes[name] = attr; }
      setDrawRange(start, count) { this.drawCount = count; }
    },
    Line: class extends Mesh {},
  };
}

test('Show canopy defaults off and persists quadmathSimCanopy', () => {
  assert.equal(loadCanopyOn(memStore()), false);
  assert.equal(loadCanopyOn(null), false);
  const store = memStore();
  assert.equal(saveCanopyOn(true, store), true);
  assert.equal(store.getItem(CANOPY_KEY), '1');
  assert.deepEqual(store.keys(), [CANOPY_KEY]);
  assert.equal(loadCanopyOn(store), true);
  saveCanopyOn(false, store);
  assert.equal(store.getItem(CANOPY_KEY), '0');
  assert.equal(loadCanopyOn(store), false);
  assert.ok(retSrc.includes('setItem(CANOPY_KEY'));
  assert.equal(canopyFpvVisible({ on: true }), true);
  assert.equal(canopyFpvVisible({ on: false }), false);
  assert.equal(canopyFpvVisible({ on: true, menuOpen: true }), false);
  assert.equal(canopyFpvVisible({ on: true, lookSpot: true }), false);
  assert.equal(canopyFpvVisible({ on: true, replay: true }), false);
  assert.equal(canopyFpvVisible({ on: true, builder: true }), false);
  assert.equal(canopyFpvVisible({ on: true, chase: true }), false);
  assert.equal(craftChaseVisible({ fpv: true }), false);
  assert.equal(craftChaseVisible({ chase: true }), true);
  assert.equal(craftChaseVisible({ menuOpen: true }), true);
  assert.equal(craftChaseVisible({ builder: true, chase: true }), false);
  assert.equal(craftChaseVisible({ lookSpot: true }), false);
});

test('no canopy piece covers >10% of view at FOV 110', () => {
  assert.ok(!retSrc.includes('const visor'), 'overhead visor mesh must be gone');
  assert.ok(!retSrc.includes('BoxGeometry(0.22'));
  const fov = 110;
  for (const aspect of [16 / 9, 4 / 3, 21 / 9, 1]) {
    const cov = canopyPieceCoverage({ fov, aspect });
    assert.ok(cov.max <= 0.10, `max coverage ${cov.max} at aspect ${aspect}`);
    assert.ok(cov.lip <= 0.06 + 1e-9, `lip ${cov.lip} must stay ~6% of view`);
    for (const d of cov.ducts) {
      assert.ok(d <= 0.10, `duct coverage ${d}`);
    }
    const L = layoutCanopyPieces({ fov, aspect });
    const bottom = canopyViewBottomY(fov, L.dist);
    assert.ok(Math.abs(L.lip.y - (bottom + L.lip.sy / 2)) < 1e-9);
    assert.ok(L.lip.sy / (2 * -bottom) <= 0.06 + 1e-9);
  }
  const THREE = mockTHREE();
  const g = makeCanopyGroup(THREE, SKINS[0]);
  assert.equal(g.visible, false);
  assert.equal(g.children.length, 3);
  assert.ok(g.children.every((c) => c.userData.canopyRole !== 'visor'));
  assert.equal(g.children.filter((c) => c.userData.canopyRole === 'lip').length, 1);
  assert.equal(g.children.filter((c) => c.userData.canopyRole === 'duct').length, 2);
  const wide = layoutCanopyGroup(g, { fov: 110, aspect: 16 / 9 });
  const tall = layoutCanopyGroup(g, { fov: 150, aspect: 1 });
  assert.ok(tall.lip.y < wide.lip.y, 'higher FOV drops the lip with the frustum');
  const lip = g.children.find((c) => c.userData.canopyRole === 'lip');
  assert.equal(lip.position.y, tall.lip.y);
  assert.equal(lip.userData.skinPart, 'canopy');
  const craft = makeCraftGroup(THREE, SKINS[0]);
  assert.equal(craft.visible, false);
  const nodes = [];
  craft.traverse((o) => { if (o !== craft) nodes.push(o); });
  const parts = new Set(nodes.map((c) => c.userData.skinPart).filter(Boolean));
  for (const need of ['body', 'canopy', 'frame', 'prop', 'led']) {
    assert.ok(parts.has(need), need);
  }
  const ducts = nodes.filter((c) => c.userData.craftRole === 'duct');
  const blades = nodes.filter((c) => c.userData.craftRole === 'blade');
  const blurs = nodes.filter((c) => c.userData.propBlur);
  const leds = nodes.filter((c) => c.userData.skinPart === 'led');
  assert.equal(ducts.length, 4);
  assert.equal(blades.length, 12);
  assert.equal(blurs.length, 4);
  assert.equal(leds.length, 4);
  assert.ok(blurs.every((b) => b.visible === false));
  assert.ok(ducts.every((d) => d.geometry && d.geometry.openEnded));
  assert.ok(nodes.some((c) => c.geometry && c.geometry.r && c.userData.skinPart === 'canopy'));
  for (const led of leds) {
    const duct = ducts.find((d) => d.position.x === led.position.x && d.position.z === led.position.z);
    assert.ok(duct, 'LED sits under a duct');
    assert.ok(led.position.y < duct.position.y, 'LED is under the duct, not on the prop');
  }
  assert.ok(craft.children.some((c) => c.userData.spin));
  assert.ok(simSrc.includes('propBlur') && simSrc.includes('craftGroup.traverse'));
  assert.ok(nodes.some((c) => c.userData.craftRole === 'canopyBody'));
  const dome = canopyShapeLayout('dome');
  const wedge = canopyShapeLayout('wedge');
  const bullet = canopyShapeLayout('bullet');
  const flat = canopyShapeLayout('flat');
  assert.deepEqual(CANOPY_SHAPES, ['dome', 'wedge', 'bullet', 'flat']);
  assert.ok(wedge.sy < dome.sy && bullet.sz > dome.sz && flat.sy < wedge.sy);
  applyCraftCanopyShape(craft, 'wedge');
  const canopyBody = nodes.find((c) => c.userData.craftRole === 'canopyBody');
  assert.equal(canopyBody.scale.x, wedge.sx);
  assert.equal(canopyBody.userData.canopyShape, 'wedge');
  applyCraftCanopyShape(craft, 'dome');
  assert.equal(canopyBody.scale.y, dome.sy);
  tintGroup(craft, SKINS.find((s) => s.id === 'daily-fast'));
  const pal = skinPalette(SKINS.find((s) => s.id === 'daily-fast'));
  const prop = nodes.find((c) => c.userData.skinPart === 'prop' && c.material);
  assert.equal(prop.material.color._hex, pal.prop);
  const frameDuct = ducts[0];
  assert.equal(frameDuct.material.color._hex, pal.frame);
  const led = leds[0];
  assert.equal(led.material.color._hex, pal.led);
  assert.equal(led.material.emissive._e, pal.led);
  const trail = makeSkinTrail(THREE, SKINS[0]);
  assert.equal(TRAIL_POINTS, 24);
  pushSkinTrail(trail, 1, 2, 3);
  pushSkinTrail(trail, 4, 5, 6);
  assert.equal(trail.len, 2);
  assert.equal(trail.geo.drawCount, 2);
  clearSkinTrail(trail);
  assert.equal(trail.len, 0);
});

test('whoop kit persists under WHOOP_KIT_KEY and overlays skin colors', () => {
  assert.equal(WHOOP_KIT_KEY, 'quadmathSimWhoopKit');
  assert.ok(retSrc.includes('setItem(WHOOP_KIT_KEY'));
  const d = defaultWhoopKit();
  assert.equal(d.shape, 'dome');
  const junk = normalizeWhoopKit({ v: 9, canopy: 'nope', frame: 0x1ffffff, prop: -1, shape: 'imported' });
  assert.equal(junk.shape, 'dome');
  assert.equal(junk.canopy, d.canopy);
  assert.equal(junk.frame, 0xffffff);
  assert.equal(junk.v, 1);
  const store = memStore();
  assert.equal(saveWhoopKit({ canopy: 0x00e5ff, frame: 0xe8e9ed, prop: 0x3ddc97, shape: 'bullet' }, store), true);
  assert.deepEqual(store.keys(), [WHOOP_KIT_KEY]);
  const loaded = loadWhoopKit(store);
  assert.equal(loaded.shape, 'bullet');
  assert.equal(loaded.canopy, 0x00e5ff);
  assert.deepEqual(loadWhoopKit(null).shape, 'dome');
  const painted = applyWhoopKitToSkin(SKINS[0], loaded);
  assert.equal(painted.canopy, 0x00e5ff);
  assert.equal(painted.frame, 0xe8e9ed);
  assert.equal(painted.prop, 0x3ddc97);
  assert.equal(painted.body, SKINS[0].body);
  assert.ok(!retSrc.includes('webfpv') && !retSrc.toLowerCase().includes('from webfpv') || retSrc.includes('Nothing here is copied from WebFPV'));
});

test('replay helpers keep a 30 Hz cap and 10s clip window', () => {
  assert.equal(REPLAY_GHOST_HZ, 30);
  assert.equal(REPLAY_GHOST_MAX, 900);
  assert.equal(REPLAY_CLIP_MS, 10000);
  const ident = replayChaseOffset({ x: 0, y: 0, z: 0, w: 1 });
  assert.ok(Math.abs(ident.y - 0.48) < 1e-9);
  assert.ok(Math.abs(ident.z - 1.55) < 1e-9);
  const a = replayOrbitOffset(0);
  const b = replayOrbitOffset(3000);
  assert.ok(Math.hypot(a.x, a.z) > 1);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.4);
  const samples = [[0, 0, 1, 0, 0, 0, 0, 1], [4000, 2, 1, 0, 0, 0, 0, 1], [12000, 6, 1, 0, 0, 0, 0, 1]];
  assert.equal(replayDurationMs(samples), 12000);
  const clip = replayClipSpan(samples, 3000, 10000);
  assert.equal(clip.start, 3000);
  assert.equal(clip.end, 12000);
  assert.ok(clip.samples.length >= 2);
  assert.equal(canRecordClip({}), false);
  assert.equal(canRecordClip({ MediaRecorder: { isTypeSupported: (t) => t === 'video/webm' } }), true);
  assert.ok(simSrc.includes('downsampleGhost(replayRec,REPLAY_GHOST_MAX)') || simSrc.includes('REPLAY_GHOST_MAX'));
  assert.ok(simSrc.includes('captureStream') && simSrc.includes('toDataURL'));
});

function fakeLineGhost(trackId, ms, n) {
  const count = n || 24;
  const samples = [];
  for (let i = 0; i < count; i++) {
    const t = Math.round(ms * i / (count - 1));
    samples.push([t, i * 0.25, 1.2, 0, 0, 0, 0, 1]);
  }
  return { v: 1, phys: PHYS_VER, track: trackId, name: 'T', lapTime: ms, samples };
}

test('Daily Line seed is stable, named, and not a city 3-lap', () => {
  const a = dailyLineFor('2026-10-21');
  const b = dailyLineFor('2026-10-21');
  const c = dailyLineFor('2026-10-22');
  assert.equal(a.trackId, b.trackId);
  assert.equal(a.modifier, b.modifier);
  assert.equal(a.map, b.map);
  assert.ok(a.trackId !== c.trackId || a.modifier !== c.modifier || a.map !== c.map);
  assert.ok(dailyLineMeta(a.trackId));
  assert.equal(a.trackId === 'city-loop' || a.trackId === 'city-zigzag', false);
  assert.equal(dailyLineBoardKey('2026-10-21'), 'D2026-10-21');
  const named = new Set(DAILY_LINE_TRACKS.map((t) => t.id));
  for (const meta of BUILTIN_TRACK_FILES) {
    if (meta.legacyId != null) {
      assert.equal(named.has(meta.id), false, meta.id);
      continue;
    }
    assert.ok(named.has(meta.id), 'pool missing ' + meta.id);
  }
  // Gate counts match the files, and a track joins the draw only from its
  // `from` day: every earlier day keeps the pool, so its board keeps its track.
  for (const t of DAILY_LINE_TRACKS) {
    const file = BUILTIN_TRACK_FILES.find((meta) => meta.id === t.id);
    assert.equal(JSON.parse(readFileSync(join(root, file.file), 'utf8')).gates.length, t.gates, t.id + ' gate count');
  }
  const rig = DAILY_LINE_TRACKS.find((t) => t.id === 'rig-loop');
  assert.ok(rig && rig.from);
  assert.equal(dailyLinePool('2026-10-21').some((t) => t.id === 'rig-loop'), false);
  assert.equal(dailyLinePool('2026-10-21').length, DAILY_LINE_TRACKS.length - 1);
  assert.equal(dailyLinePool(rig.from).some((t) => t.id === 'rig-loop'), true);
  const store = memStore();
  const rec = recordDailyLineFinish(loadDailyLine(store), {
    utc: '2026-10-21', timeMs: 9800, trackId: a.trackId, splits: new Array(a.gates - 1).fill(1200),
  }, Date.parse('2026-10-21T12:00:00Z'));
  assert.equal(rec.counted, true);
  saveDailyLine(rec.progress, store);
  assert.equal(store.getItem(DAILY_LINE_KEY).includes(a.trackId), true);
  assert.ok(!store.keys().some((k) => k.startsWith('ryfly')));
  const skip = recordDailyLineFinish(rec.progress, {
    utc: '2026-10-21', timeMs: 9000, trackId: 'city-loop',
  }, Date.parse('2026-10-21T12:00:00Z'));
  assert.equal(skip.counted, false);
});

test('Daily Line anti-junk rejects fast / split / ghost errors', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const ch = dailyLineFor('2026-10-21', now);
  const timeMs = 9000;
  const splits = new Array(ch.gates - 1).fill(Math.round(timeMs / (ch.gates - 1)));
  const ghost = fakeLineGhost(ch.trackId, timeMs);
  const ok = validateDailyLineRun({ challenge: ch, timeMs, splits, ghost, frameMm: 65 });
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(validateDailyLineRun({ challenge: ch, timeMs: 400, splits, ghost, frameMm: 65 }).reason, 'TOO FAST');
  assert.equal(validateDailyLineRun({
    challenge: ch, timeMs, splits: splits.slice(1), ghost, frameMm: 65,
  }).reason, 'SPLIT COUNT');
  const fast = JSON.parse(JSON.stringify(ghost));
  for (let i = 1; i < fast.samples.length; i++) fast.samples[i][1] = ghost.samples[i - 1][1] + 80;
  assert.equal(validateDailyLineRun({ challenge: ch, timeMs, splits, ghost: fast, frameMm: 65 }).reason, 'SPEED LIMIT');
  const body = normalizeDailyLineSubmit({
    day: '2026-10-21', frameMm: 65, name: 'Ry', timeMs, splits, ghost,
    trackId: ch.trackId, token: 'a'.repeat(32),
  }, now);
  assert.equal(body.ok, true, body.reason);
  assert.equal(body.week, 'D2026-10-21');
  const wrong = normalizeDailyLineSubmit({
    day: '2026-10-21', frameMm: 65, name: 'Ry', timeMs, splits, ghost,
    trackId: 'city-loop', token: 'a'.repeat(32),
  }, now);
  assert.equal(wrong.ok, false);
  const rank = dailyLineRank([{ name: 'A', timeMs: 8000 }, { name: 'Ry', timeMs: 9000 }], 'Ry', 9000);
  assert.equal(rank.rank, 2);
  assert.equal(rank.of, 2);
  assert.ok(DAILY_LINE_MIN_MS >= 2000);
});

test('worker daily route is offline-safe without D1', async () => {
  const { handleLeaderboard } = await import('../workers/sim-leaderboard/src/index.js');
  const meta = await handleLeaderboard(new Request('https://x/api/daily/meta?day=2026-10-21'), {});
  const mj = await meta.json();
  assert.equal(mj.challenge.date, '2026-10-21');
  assert.ok(mj.challenge.trackId);
  const board = await handleLeaderboard(new Request('https://x/api/daily?day=2026-10-21&class=65'), {});
  const bj = await board.json();
  assert.equal(bj.online, false);
  assert.deepEqual(bj.entries, []);
  const sub = await handleLeaderboard(new Request('https://x/api/daily/submit', { method: 'POST', body: '{}' }), {});
  assert.equal(sub.status, 503);
});
