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
  PILOT_TOKEN_KEY, SHARE_PREFIX, DUEL_KIND, DAILY_MAPS, SKINS, CLASS_MAX_SPEED, CLASS_IDS,
  PHYS_VER, WEEK_GRACE_MS, DEFAULT_ALLOWED_ORIGIN,
  utcDateId, utcWeekId, addUtcDays, dailyTrackFor, weeklyTrackFor,
  dailyTrackValid, isDailyTrackId, isWeeklyTrackId, trackFromRetentionId,
  validateSubmittedRun, countGhostLaps, encodeDuel, decodeDuel, decodeQm2,
  duelResult, emptyDaily, recordDailyFinish, loadDaily, saveDaily,
  loadBoard, saveBoard, recordLocalBoard, boardRows, leaderboardUrl,
  onlineBoardsEnabled, unlockedSkins, isSkinUnlocked, resolveSkin,
  loadSkinId, saveSkinId, sanitizePilotName, normalizeSubmit, fmtMs,
  mulberry32, weekAllowed, previousUtcWeekId, isPaceBotGhost, issuePilotToken,
  hashPilotToken, pickCorsOrigin, isLocalHost, escapeHtml, classFromBuild,
  syncDailyStreak, applyMissedDayReset,
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
  assert.ok(retSrc.includes('setItem(DAILY_KEY'));
  assert.ok(retSrc.includes('Nothing here is copied from WebFPV') || retSrc.includes('copied from WebFPV'));
  for (const banned of ['ryflyDroneType', 'ryflyRates', CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, BUILD_KEY, WHOOP_KEY, ROOM_KEY, COACH_KEY]) {
    assert.equal(retSrc.includes(banned), false, 'must not mention ' + banned);
  }
  const store = memStore();
  saveDaily(recordDailyFinish(emptyDaily(), { utc: '2026-10-17', timeMs: 40000 }, Date.UTC(2026, 9, 17)).progress, store);
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
  assert.equal(PHYS_VER, 2);
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
  assert.ok(simSrc.includes('menuBoards'));
  assert.ok(simSrc.includes('DAILY_KEY') || simSrc.includes('quadmathSimDaily') || simSrc.includes('loadDaily'));
  assert.ok(simSrc.includes('encodeDuel'));
  assert.ok(simSrc.includes('btnGhostDuel') || simSrc.includes('DUEL'));
  assert.ok(simSrc.includes('makeCanopyGroup'));
  assert.ok(simSrc.includes('renderBoardBody'));
  assert.ok(simSrc.includes("b.textContent"));
  assert.ok(simSrc.includes('Resets 5 PM Phoenix'));
  assert.ok(simSrc.includes('issuePilotToken'));
  assert.ok(simSrc.includes('syncDailyStreak'));
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML');
  assert.ok(retSrc.includes('copied from WebFPV') || retSrc.includes('Nothing here is copied from WebFPV'));
});
