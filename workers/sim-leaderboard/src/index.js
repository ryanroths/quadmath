// QuadMath sim W5 weekly leaderboard Worker.
// Bundles ../../.. /sim-retention.js so anti-cheat stays one implementation,
// ../../../sim-pilot-names.js for the name rules and
// ../../../sim-builtin-boards.js for the built-in tracks' gates.
// Do not deploy from the agent — Ryan deploys (see DEPLOY.md).

import {
  utcWeekId,
  utcDateId,
  weeklyTrackFor,
  classId,
  normalizeSubmit,
  normalizeDailyLineSubmit,
  dailyLineFor,
  dailyLineBoardKey,
  boardKeyFor,
  rateWindowId,
  pickCorsOrigin,
  DEFAULT_ALLOWED_ORIGIN,
  hashPilotToken,
  ghostPayloadError,
  normalizeTrackSubmit,
  CUSTOM_BOARD_KEY_RE,
  normalizeBuiltinSubmit,
  builtinBoardKey,
  builtinBoardTrack,
  builtinTrackHash,
  BUILTIN_BOARD_ROWS,
  BUILTIN_BOARD_GHOSTS,
  ghostDigest,
  ghostPath,
  pathDistance,
  isTestPilotGhost,
  RATE_SCORE_MAX,
  RATE_SHARE_MAX,
  RATE_COUNT_MAX,
  COUNT_BODY_MAX,
  normalizeCountPing,
  allowedOriginList,
} from '../../../sim-retention.js';
import { decodeLineCode, lineIdOf, LINE_CODE_MAX, LINE_ID_RE } from '../../../sim-share.js';
import { pilotNameProblem, pilotNameKey, pilotDisplayName, nameHasBlockedWord } from '../../../sim-pilot-names.js';
import { BUILTIN_BOARD_TRACKS } from '../../../sim-builtin-boards.js';

const CORS_METHODS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

// Posts per client per UTC hour (sim-retention.js RATE_SCORE_MAX,
// RATE_SHARE_MAX: this module exports only the handler, as workerd reads
// every named export of a Worker's entry module as an entrypoint).
const RATE_MAX = { score: RATE_SCORE_MAX, share: RATE_SHARE_MAX };
// A builder track's board keeps this many rows per class, as a built-in's.
const CUSTOM_BOARD_ROWS = BUILTIN_BOARD_ROWS;
const JSON_LIMIT = 350_000;
// A run whose path is within this (mean, u, sim-retention.js
// ghostPathDistance) of a stored top ghost under another name is a copy of
// it, however it was nudged or retimed.
const COPY_PATH_TOL = 0.2;
const TOKEN_RE = /^[a-f0-9]{32,64}$/i;

function corsHeaders(env, request) {
  const spec = (env && env.ALLOWED_ORIGIN) || DEFAULT_ALLOWED_ORIGIN;
  const origin = pickCorsOrigin(spec, request && request.headers.get('Origin'));
  return {
    'Access-Control-Allow-Origin': origin,
    ...CORS_METHODS,
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env, request) },
  });
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || '0.0.0.0';
}

async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > JSON_LIMIT) return { error: 'PAYLOAD TOO LARGE' };
  const text = await request.text();
  if (text.length > JSON_LIMIT) return { error: 'PAYLOAD TOO LARGE' };
  try { return { body: JSON.parse(text) }; }
  catch (e) { return { error: 'BAD JSON' }; }
}

// bucket: 'score' or 'share'. The window is the bucket and the UTC hour
// (rows from before the split, the bare hour, are not read).
// One statement, so posts sent at once can't all read the count before any
// of them adds to it.
async function checkRate(env, ip, now, bucket) {
  const window = bucket + ':' + rateWindowId(now);
  const row = await env.DB.prepare(
    'INSERT INTO rate_limit (ip, window, n) VALUES (?, ?, 1) ON CONFLICT(ip, window) DO UPDATE SET n = n + 1 RETURNING n',
  ).bind(ip, window).first();
  return !!row && row.n <= RATE_MAX[bucket];
}

// The anonymous counts' rate limit (POST /api/count): in this isolate's memory
// only, never D1. A client's pings this UTC hour, RATE_COUNT_MAX of them; a
// new hour, or more clients than COUNT_CLIENTS_MAX, starts over. Nothing in it
// is written anywhere or outlives the isolate, and it is per isolate: a client
// spread over several gets the limit in each.
const COUNT_CLIENTS_MAX = 50000;
const countSeen = { window: '', clients: new Map() };
function countAllowed(ip, now) {
  const window = rateWindowId(now);
  if (countSeen.window !== window || countSeen.clients.size >= COUNT_CLIENTS_MAX) {
    countSeen.window = window;
    countSeen.clients = new Map();
  }
  const n = (countSeen.clients.get(ip) || 0) + 1;
  countSeen.clients.set(ip, n);
  return n <= RATE_COUNT_MAX;
}

// The scores.week column holds boardKeyFor(week): the week (or Daily Line day
// key) and PHYS_VER, so each physics version has boards of its own.
async function listBoard(env, week, frameMm, trackId) {
  const c = classId(frameMm);
  const track = trackId || weeklyTrackFor(week).id;
  const { results } = await env.DB.prepare(
    'SELECT name, time_ms AS timeMs, track_id AS trackId, submitted_ms AS at FROM scores WHERE week = ? AND class = ? AND track_id = ? ORDER BY time_ms ASC LIMIT 20',
  ).bind(boardKeyFor(week), c, track).all();
  return results || [];
}

async function upsertScore(env, week, frameMm, name, timeMs, trackId) {
  const key = boardKeyFor(week);
  const c = classId(frameMm);
  const existing = await env.DB.prepare(
    'SELECT time_ms FROM scores WHERE week = ? AND class = ? AND name = ?',
  ).bind(key, c, name).first();
  if (existing && existing.time_ms <= timeMs) {
    return { improved: false, timeMs: existing.time_ms };
  }
  await env.DB.prepare(
    'INSERT INTO scores (week, class, name, time_ms, track_id, submitted_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(week, class, name) DO UPDATE SET time_ms = excluded.time_ms, track_id = excluded.track_id, submitted_ms = excluded.submitted_ms WHERE excluded.time_ms < scores.time_ms',
  ).bind(key, c, name, timeMs, trackId, Date.now()).run();
  return { improved: true, timeMs };
}

// Custom track boards (builder tracks): custom_scores, keyed by
// customBoardKey (sim-retention.js), which normalizeTrackSubmit computes from
// the submitted track. A pilot keeps their best time, as upsertScore; a board
// keeps its CUSTOM_BOARD_ROWS fastest pilots per class.
async function listTrackBoard(env, key, frameMm) {
  const { results } = await env.DB.prepare(
    'SELECT name, time_ms AS timeMs, submitted_ms AS at FROM custom_scores WHERE key = ? AND class = ? ORDER BY time_ms ASC LIMIT 20',
  ).bind(key, classId(frameMm)).all();
  return results || [];
}

async function upsertTrackScore(env, key, frameMm, name, timeMs) {
  const c = classId(frameMm);
  const existing = await env.DB.prepare(
    'SELECT time_ms FROM custom_scores WHERE key = ? AND class = ? AND name = ?',
  ).bind(key, c, name).first();
  if (existing && existing.time_ms <= timeMs) {
    return { improved: false, timeMs: existing.time_ms };
  }
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM custom_scores WHERE key = ? AND class = ? AND name != ? AND time_ms <= ?',
  ).bind(key, c, name, timeMs).first();
  if (ahead && ahead.n >= CUSTOM_BOARD_ROWS) return { improved: false, ranked: false, timeMs };
  await env.DB.prepare(
    'INSERT INTO custom_scores (key, class, name, time_ms, submitted_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key, class, name) DO UPDATE SET time_ms = excluded.time_ms, submitted_ms = excluded.submitted_ms WHERE excluded.time_ms < custom_scores.time_ms',
  ).bind(key, c, name, timeMs, Date.now()).run();
  await env.DB.prepare(
    'DELETE FROM custom_scores WHERE key = ? AND class = ? AND name IN (SELECT name FROM custom_scores WHERE key = ? AND class = ? ORDER BY time_ms ASC, submitted_ms ASC LIMIT -1 OFFSET ?)',
  ).bind(key, c, key, c, CUSTOM_BOARD_ROWS).run();
  return { improved: true, timeMs };
}

// ---- Built-in track boards ----
// track_scores: one row per pilot (name_key, sim-pilot-names.js) per board
// (builtinBoardKey) per class, with the run's splits and its ghost's digest;
// the BUILTIN_BOARD_ROWS fastest are kept. track_ghosts: the full ghost of the
// BUILTIN_BOARD_GHOSTS fastest only.
const builtinKeys = new Map();
async function builtinKeyOf(track) {
  if (!builtinKeys.has(track.id)) builtinKeys.set(track.id, await builtinBoardKey(track));
  return builtinKeys.get(track.id);
}

const ORDER = 'ORDER BY time_ms ASC, submitted_ms ASC';

async function listBuiltin(env, key, c, limit) {
  const { results } = await env.DB.prepare(
    `SELECT name, time_ms AS timeMs, splits, submitted_ms AS at FROM track_scores WHERE board = ? AND class = ? ${ORDER} LIMIT ?`,
  ).bind(key, c, limit).all();
  return (results || []).map((r) => {
    let splits = [];
    try { splits = JSON.parse(r.splits || '[]'); } catch (e) { splits = []; }
    return { name: r.name, timeMs: r.timeMs, splits, at: r.at };
  });
}

async function builtinCount(env, key, c) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM track_scores WHERE board = ? AND class = ?').bind(key, c).first();
  return row ? row.n : 0;
}

// A pilot's place on a board: 1 + the rows ahead (faster, or as fast and
// posted first), or null if they have no row.
async function builtinPlace(env, key, c, nameKey) {
  const me = await env.DB.prepare(
    'SELECT name, time_ms, submitted_ms FROM track_scores WHERE board = ? AND class = ? AND name_key = ?',
  ).bind(key, c, nameKey).first();
  if (!me) return null;
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM track_scores WHERE board = ? AND class = ? AND (time_ms < ? OR (time_ms = ? AND submitted_ms < ?))',
  ).bind(key, c, me.time_ms, me.time_ms, me.submitted_ms).first();
  return { rank: (ahead ? ahead.n : 0) + 1, name: me.name, timeMs: me.time_ms };
}

// The ghost as a board keeps and serves it: the run's samples (8 numbers
// each) under the pilot's claimed name, nothing else the body carried.
function keptGhost(run, pilot, ghost) {
  return {
    v: 1, phys: ghost.phys, track: run.trackId, name: pilot.name, lapTime: run.timeMs,
    samples: ghost.samples.map((p) => p.slice(0, 8).map((x) => +x)),
  };
}

async function upsertBuiltin(env, run, pilot, digest, ghost) {
  const { key, frameMm: c, timeMs } = run;
  const existing = await env.DB.prepare(
    'SELECT time_ms FROM track_scores WHERE board = ? AND class = ? AND name_key = ?',
  ).bind(key, c, pilot.key).first();
  if (existing && existing.time_ms <= timeMs) return { improved: false, timeMs: existing.time_ms };
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM track_scores WHERE board = ? AND class = ? AND name_key != ? AND time_ms <= ?',
  ).bind(key, c, pilot.key, timeMs).first();
  const n = ahead ? ahead.n : 0;
  // Past the kept rows: not stored (and its place said), so a pilot pruned
  // off the board is not told a slower run is a new best.
  if (n >= BUILTIN_BOARD_ROWS) return { improved: false, ranked: false, timeMs, rank: n + 1 };
  const now = Date.now();
  const wrote = await env.DB.prepare(
    'INSERT INTO track_scores (board, class, name_key, name, time_ms, splits, digest, track_id, submitted_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(board, class, name_key) DO UPDATE SET name = excluded.name, time_ms = excluded.time_ms, splits = excluded.splits, digest = excluded.digest, submitted_ms = excluded.submitted_ms WHERE excluded.time_ms < track_scores.time_ms',
  ).bind(key, c, pilot.key, pilot.name, timeMs, JSON.stringify(run.splits || []), digest, run.trackId, now).run();
  // A faster run of theirs landed first (two posts at once): this one is not
  // their best, and its ghost is not kept.
  if (!(wrote && wrote.meta && wrote.meta.changes > 0)) return { improved: false, timeMs };
  await env.DB.prepare(
    `DELETE FROM track_scores WHERE board = ? AND class = ? AND name_key IN (SELECT name_key FROM track_scores WHERE board = ? AND class = ? ${ORDER} LIMIT -1 OFFSET ?)`,
  ).bind(key, c, key, c, BUILTIN_BOARD_ROWS).run();
  if (n < BUILTIN_BOARD_GHOSTS) {
    await env.DB.prepare(
      'INSERT INTO track_ghosts (board, class, name_key, ghost, time_ms, track_id, path) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(board, class, name_key) DO UPDATE SET ghost = excluded.ghost, time_ms = excluded.time_ms, path = excluded.path WHERE excluded.time_ms < track_ghosts.time_ms',
    ).bind(key, c, pilot.key, JSON.stringify(keptGhost(run, pilot, ghost)), timeMs, run.trackId, JSON.stringify(ghostPath(ghost.samples) || [])).run();
  }
  await env.DB.prepare(
    `DELETE FROM track_ghosts WHERE board = ? AND class = ? AND name_key NOT IN (SELECT name_key FROM track_scores WHERE board = ? AND class = ? ${ORDER} LIMIT ?)`,
  ).bind(key, c, key, c, BUILTIN_BOARD_GHOSTS).run();
  return { improved: true, timeMs, rank: n + 1 };
}

// ---- Held runs (faster than the board's floor, sim-retention.js
// builtinFloorMs) ----
// track_held: a pilot's fastest held run per board per class, with its ghost,
// apart from track_scores: never in a list, a count, a place, the tops, the
// ghosts served or the trim, and the pilot's public row stays as it was.
// DEPLOY.md approves one onto its board, or rejects it.
async function holdBuiltin(env, run, pilot, digest, ghost) {
  const wrote = await env.DB.prepare(
    'INSERT INTO track_held (board, class, name_key, name, time_ms, floor_ms, splits, digest, track_id, ghost, path, submitted_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(board, class, name_key) DO UPDATE SET name = excluded.name, time_ms = excluded.time_ms, floor_ms = excluded.floor_ms, splits = excluded.splits, digest = excluded.digest, ghost = excluded.ghost, path = excluded.path, submitted_ms = excluded.submitted_ms WHERE excluded.time_ms < track_held.time_ms',
  ).bind(
    run.key, run.frameMm, pilot.key, pilot.name, run.timeMs, run.floorMs, JSON.stringify(run.splits || []), digest, run.trackId,
    JSON.stringify(keptGhost(run, pilot, ghost)), JSON.stringify(ghostPath(ghost.samples) || []), Date.now(),
  ).run();
  return !!(wrote && wrote.meta && wrote.meta.changes > 0);
}

// The submit's reply for a held run, as it would be had the run been stored:
// the pilot sees their run (their best of it and their public row), its
// place among the public rows, and the top 20 with it in. Only this reply has
// it; every other read is of track_scores alone.
async function heldReply(env, run, pilot, wrote) {
  const { key, frameMm: c } = run;
  const pub = await env.DB.prepare(
    'SELECT time_ms, splits, submitted_ms FROM track_scores WHERE board = ? AND class = ? AND name_key = ?',
  ).bind(key, c, pilot.key).first();
  const held = await env.DB.prepare(
    'SELECT time_ms, splits, submitted_ms FROM track_held WHERE board = ? AND class = ? AND name_key = ?',
  ).bind(key, c, pilot.key).first();
  const mine = held && (!pub || held.time_ms < pub.time_ms) ? held : pub;
  // Ahead: faster, or as fast and posted first (builtinPlace's order).
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM track_scores WHERE board = ? AND class = ? AND name_key != ? AND (time_ms < ? OR (time_ms = ? AND submitted_ms < ?))',
  ).bind(key, c, pilot.key, mine.time_ms, mine.time_ms, mine.submitted_ms).first();
  let splits = [];
  try { splits = JSON.parse(mine.splits || '[]'); } catch (e) { splits = []; }
  const others = (await listBuiltin(env, key, c, 21)).filter((r) => r.name !== pilot.name);
  const entries = others.concat([{ name: pilot.name, timeMs: mine.time_ms, splits, at: mine.submitted_ms }])
    .sort((a, b) => a.timeMs - b.timeMs || a.at - b.at).slice(0, 20);
  return {
    improved: wrote && (!pub || run.timeMs < pub.time_ms),
    timeMs: mine.time_ms,
    rank: (ahead ? ahead.n : 0) + 1,
    // A stored run would trim the board to BUILTIN_BOARD_ROWS.
    count: Math.min((await builtinCount(env, key, c)) + (pub ? 0 : 1), BUILTIN_BOARD_ROWS),
    entries,
  };
}

// ---- Pilots: names, claims, bans ----
// blocked_names: words Ryan adds (DEPLOY.md), refused anywhere in a name's
// key, as sim-pilot-names.js NAME_BLOCK_ROOTS. Read at most once a minute per
// database.
const blockedCache = new WeakMap();
async function blockedWords(env) {
  const now = Date.now();
  const hit = blockedCache.get(env.DB);
  if (hit && now - hit.at < 60_000) return hit.words;
  const { results } = await env.DB.prepare('SELECT word FROM blocked_names').all();
  const words = (results || []).map((r) => String(r.word || '')).filter((w) => pilotNameKey(w).length >= 2);
  blockedCache.set(env.DB, { at: now, words });
  return words;
}

// The pilot behind a post: the token not banned, the name allowed, and its
// key (look-alikes are one name) held by this token, claimed on its first
// post. The name the boards show is the one it was claimed under.
async function pilotFor(env, rawName, tokenHash) {
  const ban = await env.DB.prepare('SELECT reason FROM bans WHERE token_hash = ?').bind(tokenHash).first();
  if (ban) return { ok: false, reason: 'BANNED', status: 403 };
  const problem = pilotNameProblem(rawName);
  if (problem) return { ok: false, reason: problem, status: 400 };
  const key = pilotNameKey(rawName);
  if (nameHasBlockedWord(rawName, await blockedWords(env))) return { ok: false, reason: 'NAME NOT ALLOWED', status: 400 };
  let row = await env.DB.prepare('SELECT name, token_hash FROM pilot_keys WHERE key = ?').bind(key).first();
  if (!row) {
    // A name claimed by the Worker before name keys (pilots, by its exact
    // name) after the migration carried the others over: its claim holds,
    // for its look-alikes too (pilots stopped growing when this Worker
    // shipped, so reading it whole is cheap).
    const { results: olds } = await env.DB.prepare('SELECT name, token_hash, claimed_ms FROM pilots ORDER BY claimed_ms ASC').all();
    const old = (olds || []).find((o) => pilotNameKey(o.name) === key) || null;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO pilot_keys (key, name, token_hash, claimed_ms) VALUES (?, ?, ?, ?)',
    ).bind(key, pilotDisplayName(rawName), old ? old.token_hash : tokenHash, old ? old.claimed_ms : Date.now()).run();
    row = await env.DB.prepare('SELECT name, token_hash FROM pilot_keys WHERE key = ?').bind(key).first();
  }
  if (!row || row.token_hash !== tokenHash) return { ok: false, reason: 'NAME TAKEN', status: 403 };
  // A claim carried over under a name the rules refuse (e.g. "Ry..Fly"): the
  // boards show the name its holder posts under now.
  if (pilotNameProblem(row.name)) {
    await env.DB.prepare('UPDATE pilot_keys SET name = ? WHERE key = ?').bind(pilotDisplayName(rawName), key).run();
    row = { name: pilotDisplayName(rawName) };
  }
  return { ok: true, key, name: row.name };
}

// A run already posted or shared under another pilot's name: the same
// positions (ghostDigest), refused. Exact copies only.
async function copiedRun(env, digest, nameKey) {
  const row = await env.DB.prepare('SELECT name_key FROM ghost_digests WHERE digest = ?').bind(digest).first();
  return !!(row && row.name_key && row.name_key !== nameKey);
}

// A run that follows a stored top ghost of this board (any class) under
// another name: a copy of a ghost the board served, nudged or retimed.
// Compared on the paths kept beside the ghosts (ghostPath), not the ghosts.
async function copiesStoredGhost(env, board, nameKey, ghost) {
  const mine = ghostPath(ghost.samples);
  if (!mine) return false;
  const { results } = await env.DB.prepare('SELECT path FROM track_ghosts WHERE board = ? AND name_key != ?').bind(board, nameKey).all();
  for (const r of results || []) {
    let pth = null;
    try { pth = JSON.parse(r.path || 'null'); } catch (e) { pth = null; }
    if (pathDistance(mine, pth) < COPY_PATH_TOL) return true;
  }
  return false;
}

async function noteDigest(env, digest, nameKey) {
  if (!nameKey) return; // a run with no name to own it: not recorded
  await env.DB.prepare(
    'INSERT OR IGNORE INTO ghost_digests (digest, name_key, created_ms) VALUES (?, ?, ?)',
  ).bind(digest, nameKey, Date.now()).run();
}

// The steps every score submit shares after its run is checked: the token,
// the pilot, and a copied run. { ok, pilot, digest } or { ok:false, reason, status }.
async function scorePilot(env, checked, rawName, ghost) {
  if (!TOKEN_RE.test(checked.token || '')) return { ok: false, reason: 'NO TOKEN', status: 400 };
  const tokenHash = await hashPilotToken(checked.token);
  const pilot = await pilotFor(env, rawName, tokenHash);
  if (!pilot.ok) return pilot;
  const digest = await ghostDigest(ghost);
  if (await copiedRun(env, digest, pilot.key)) return { ok: false, reason: 'COPIED RUN', status: 403 };
  return { ok: true, pilot, digest };
}

async function postScore(env, request, reply) {
  if (!env || !env.DB) return { early: reply({ ok: false, reason: 'NO DATABASE' }, 503) };
  const allowed = await checkRate(env, clientIp(request), Date.now(), 'score');
  if (!allowed) return { early: reply({ ok: false, reason: 'RATE LIMIT' }, 429) };
  const parsed = await readJson(request);
  if (parsed.error) return { early: reply({ ok: false, reason: parsed.error }, 400) };
  return { body: parsed.body };
}

export async function handleLeaderboard(request, env) {
  const reply = (data, status) => json(data, status, env, request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env, request) });
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && (path === '/' || path === '/health')) {
    return reply({ ok: true, service: 'quadmath-sim-leaderboard' });
  }

  if (request.method === 'GET' && path === '/api/week') {
    const week = url.searchParams.get('week') || utcWeekId();
    const track = weeklyTrackFor(week);
    return reply({ week, track });
  }

  if (request.method === 'GET' && path === '/api/board') {
    const week = url.searchParams.get('week') || utcWeekId();
    const frameMm = classId(url.searchParams.get('class') || url.searchParams.get('frameMm') || 65);
    const track = weeklyTrackFor(week);
    if (!env || !env.DB) {
      return reply({ week, class: frameMm, trackId: track.id, entries: [], online: false, note: 'no D1' });
    }
    const entries = await listBoard(env, week, frameMm, track.id);
    return reply({ week, class: frameMm, trackId: track.id, entries, online: true });
  }

  if (request.method === 'GET' && (path === '/api/daily' || path === '/api/daily/meta')) {
    const day = url.searchParams.get('day') || utcDateId();
    const challenge = dailyLineFor(day);
    const frameMm = classId(url.searchParams.get('class') || url.searchParams.get('frameMm') || 65);
    const week = dailyLineBoardKey(challenge.date);
    if (path === '/api/daily/meta' || url.searchParams.get('meta') === '1') {
      return reply({ day: challenge.date, challenge, online: !!(env && env.DB) });
    }
    if (!env || !env.DB) {
      return reply({
        day: challenge.date, class: frameMm, trackId: challenge.trackId,
        challenge, entries: [], online: false, note: 'no D1',
      });
    }
    const entries = await listBoard(env, week, frameMm, challenge.trackId);
    return reply({
      day: challenge.date, class: frameMm, trackId: challenge.trackId,
      challenge, entries, online: true,
    });
  }

  if (request.method === 'POST' && path === '/api/submit') {
    const p = await postScore(env, request, reply);
    if (p.early) return p.early;
    const checked = normalizeSubmit(p.body);
    if (!checked.ok) return reply({ ok: false, reason: checked.reason }, 400);
    const who = await scorePilot(env, checked, p.body.name, p.body.ghost);
    if (!who.ok) return reply({ ok: false, reason: who.reason }, who.status);
    const saved = await upsertScore(env, checked.week, checked.frameMm, who.pilot.name, checked.timeMs, checked.trackId);
    await noteDigest(env, who.digest, who.pilot.key);
    const entries = await listBoard(env, checked.week, checked.frameMm, checked.trackId);
    return reply({ ok: true, improved: saved.improved, timeMs: saved.timeMs, name: who.pilot.name, entries });
  }

  if (request.method === 'POST' && path === '/api/daily/submit') {
    const p = await postScore(env, request, reply);
    if (p.early) return p.early;
    const checked = normalizeDailyLineSubmit(p.body);
    if (!checked.ok) return reply({ ok: false, reason: checked.reason }, 400);
    const who = await scorePilot(env, checked, p.body.name, p.body.ghost);
    if (!who.ok) return reply({ ok: false, reason: who.reason }, who.status);
    const saved = await upsertScore(env, checked.week, checked.frameMm, who.pilot.name, checked.timeMs, checked.trackId);
    await noteDigest(env, who.digest, who.pilot.key);
    // A clean Daily Line (no modifier) on a built-in track is a run on that
    // track: its board takes it too, if it passes that board's check.
    const challenge = dailyLineFor(checked.day);
    const bt = builtinBoardTrack(BUILTIN_BOARD_TRACKS, checked.trackId);
    if (bt && challenge.modifier === 'none') {
      const run = await normalizeBuiltinSubmit({ ...p.body, track: bt.id, trackHash: await builtinTrackHash(bt) }, BUILTIN_BOARD_TRACKS);
      if (run.ok && !(await copiesStoredGhost(env, run.key, who.pilot.key, p.body.ghost))) {
        if (run.held) await holdBuiltin(env, run, who.pilot, who.digest, p.body.ghost);
        else await upsertBuiltin(env, run, who.pilot, who.digest, p.body.ghost);
      }
    }
    const entries = await listBoard(env, checked.week, checked.frameMm, checked.trackId);
    return reply({
      ok: true, improved: saved.improved, timeMs: saved.timeMs, name: who.pilot.name, entries,
      day: checked.day, trackId: checked.trackId,
    });
  }

  // Custom track boards. The run is checked against the track it came with
  // (normalizeTrackSubmit: a builder id, 3+ gates, a code within
  // CUSTOM_TRACK_CODE_MAX, a valid one-pass ghost of those gates, PHYS_VER),
  // and the board key is computed from that track: a key in the body or a
  // client's id is never used. The track's row is written on its first
  // accepted run, so a refused submit writes nothing but the rate count.
  if (request.method === 'POST' && path === '/api/track/submit') {
    const p = await postScore(env, request, reply);
    if (p.early) return p.early;
    const checked = await normalizeTrackSubmit(p.body);
    if (!checked.ok) return reply({ ok: false, reason: checked.reason }, 400);
    const who = await scorePilot(env, checked, p.body.name, p.body.ghost);
    if (!who.ok) return reply({ ok: false, reason: who.reason }, who.status);
    await env.DB.prepare(
      'INSERT OR IGNORE INTO custom_tracks (key, map, gates, code, created_ms) VALUES (?, ?, ?, ?, ?)',
    ).bind(checked.key, checked.map, checked.gates, checked.code, Date.now()).run();
    const saved = await upsertTrackScore(env, checked.key, checked.frameMm, who.pilot.name, checked.timeMs);
    await noteDigest(env, who.digest, who.pilot.key);
    const entries = await listTrackBoard(env, checked.key, checked.frameMm);
    return reply({ ok: true, improved: saved.improved, timeMs: saved.timeMs, name: who.pilot.name, key: checked.key, class: checked.frameMm, entries });
  }

  if (request.method === 'GET' && path === '/api/track/board') {
    const key = url.searchParams.get('key') || '';
    if (!CUSTOM_BOARD_KEY_RE.test(key)) return reply({ ok: false, reason: 'BAD KEY' }, 400);
    const frameMm = classId(url.searchParams.get('class') || url.searchParams.get('frameMm') || 65);
    if (!env || !env.DB) return reply({ ok: true, key, class: frameMm, entries: [], online: false, note: 'no D1' });
    const entries = await listTrackBoard(env, key, frameMm);
    return reply({ ok: true, key, class: frameMm, entries, online: true });
  }

  // Built-in track boards (the public maps' races, sim-builtin-boards.js).
  // The run is checked against the Worker's copy of the track; the body names
  // the track and the hash of the gates it flew, and nothing else of it.
  if (request.method === 'POST' && path === '/api/builtin/submit') {
    const p = await postScore(env, request, reply);
    if (p.early) return p.early;
    const run = await normalizeBuiltinSubmit(p.body, BUILTIN_BOARD_TRACKS);
    if (!run.ok) return reply({ ok: false, reason: run.reason }, 400);
    const who = await scorePilot(env, run, p.body.name, p.body.ghost);
    if (!who.ok) return reply({ ok: false, reason: who.reason }, who.status);
    if (await copiesStoredGhost(env, run.key, who.pilot.key, p.body.ghost)) return reply({ ok: false, reason: 'COPIED RUN' }, 403);
    // Faster than the floor: held, and answered as if stored.
    if (run.held) {
      const wrote = await holdBuiltin(env, run, who.pilot, who.digest, p.body.ghost);
      await noteDigest(env, who.digest, who.pilot.key);
      const as = await heldReply(env, run, who.pilot, wrote);
      return reply({
        ok: true, improved: as.improved, ranked: true, timeMs: as.timeMs,
        track: run.trackId, key: run.key, class: run.frameMm, name: who.pilot.name,
        rank: as.rank, count: as.count, entries: as.entries,
      });
    }
    const saved = await upsertBuiltin(env, run, who.pilot, who.digest, p.body.ghost);
    await noteDigest(env, who.digest, who.pilot.key);
    const entries = await listBuiltin(env, run.key, run.frameMm, 20);
    const count = await builtinCount(env, run.key, run.frameMm);
    const place = await builtinPlace(env, run.key, run.frameMm, who.pilot.key);
    return reply({
      ok: true, improved: saved.improved, ranked: saved.ranked !== false, timeMs: saved.timeMs,
      track: run.trackId, key: run.key, class: run.frameMm, name: who.pilot.name,
      rank: place ? place.rank : (saved.rank || null), count, entries,
    });
  }

  // GET /api/builtin/board?track=&class=[&name=]: the top 20, the board's row
  // count, and the named pilot's place.
  if (request.method === 'GET' && path === '/api/builtin/board') {
    const bt = builtinBoardTrack(BUILTIN_BOARD_TRACKS, url.searchParams.get('track'));
    if (!bt) return reply({ ok: false, reason: 'NO BOARD' }, 404);
    const c = classId(url.searchParams.get('class') || url.searchParams.get('frameMm') || 65);
    const key = await builtinKeyOf(bt);
    const hash = key.slice(2, 18);
    if (!env || !env.DB) return reply({ ok: true, track: bt.id, key, hash, class: c, entries: [], count: 0, online: false, note: 'no D1' });
    const entries = await listBuiltin(env, key, c, 20);
    const count = await builtinCount(env, key, c);
    const name = url.searchParams.get('name');
    const you = name && !pilotNameProblem(name) ? await builtinPlace(env, key, c, pilotNameKey(name)) : null;
    return reply({ ok: true, track: bt.id, key, hash, class: c, entries, count, you, online: true });
  }

  // GET /api/builtin/tops?class=: each built-in track's fastest run.
  if (request.method === 'GET' && path === '/api/builtin/tops') {
    const c = classId(url.searchParams.get('class') || url.searchParams.get('frameMm') || 65);
    const tops = {};
    for (const bt of BUILTIN_BOARD_TRACKS) {
      const key = await builtinKeyOf(bt);
      const row = env && env.DB ? (await listBuiltin(env, key, c, 1))[0] : null;
      tops[bt.id] = { hash: key.slice(2, 18), top: row ? { name: row.name, timeMs: row.timeMs } : null };
    }
    return reply({ ok: true, class: c, tops, online: !!(env && env.DB) });
  }

  // GET /api/builtin/ghost?track=&class=&name=: a top-BUILTIN_BOARD_GHOSTS
  // pilot's ghost.
  if (request.method === 'GET' && path === '/api/builtin/ghost') {
    const bt = builtinBoardTrack(BUILTIN_BOARD_TRACKS, url.searchParams.get('track'));
    if (!bt) return reply({ ok: false, reason: 'NO BOARD' }, 404);
    if (!env || !env.DB) return reply({ ok: false, reason: 'NO DATABASE' }, 503);
    const c = classId(url.searchParams.get('class') || url.searchParams.get('frameMm') || 65);
    const key = await builtinKeyOf(bt);
    const row = await env.DB.prepare(
      'SELECT ghost, time_ms AS timeMs FROM track_ghosts WHERE board = ? AND class = ? AND name_key = ?',
    ).bind(key, c, pilotNameKey(url.searchParams.get('name') || '')).first();
    if (!row) return reply({ ok: false, reason: 'NOT FOUND' }, 404);
    let ghost = null;
    try { ghost = JSON.parse(row.ghost); } catch (e) { ghost = null; }
    return reply({ ok: !!ghost, track: bt.id, class: c, timeMs: row.timeMs, ghost });
  }

  // "Fly my line" (sim-share.js): a line code behind a short link, kept under
  // an id made from its content, so the same line is stored once. A test
  // pilot's run is never stored; a banned token's share is refused; the
  // line's ghost digest is kept so it can't be posted under another name.
  if (request.method === 'POST' && path === '/api/line') {
    if (!env || !env.DB) return reply({ ok: false, reason: 'NO DATABASE' }, 503);
    const ip = clientIp(request);
    const allowed = await checkRate(env, ip, Date.now(), 'share');
    if (!allowed) return reply({ ok: false, reason: 'RATE LIMIT' }, 429);
    const parsed = await readJson(request);
    if (parsed.error) return reply({ ok: false, reason: parsed.error }, 400);
    const code = parsed.body && parsed.body.code;
    if (typeof code !== 'string' || code.length > LINE_CODE_MAX) return reply({ ok: false, reason: 'BAD LINE CODE' }, 400);
    // The pilot token: a SHARE from a banned browser is refused. (A page
    // from before this sends none and gets the long link instead.)
    const token = typeof parsed.body.token === 'string' ? parsed.body.token.trim() : '';
    if (!TOKEN_RE.test(token)) return reply({ ok: false, reason: 'NO TOKEN' }, 400);
    const tokenHash = await hashPilotToken(token);
    const ban = await env.DB.prepare('SELECT reason FROM bans WHERE token_hash = ?').bind(tokenHash).first();
    if (ban) return reply({ ok: false, reason: 'BANNED' }, 403);
    let line;
    try {
      line = await decodeLineCode(code);
      const bad = ghostPayloadError(line.ghost, null);
      if (bad) return reply({ ok: false, reason: bad }, 400);
    } catch (e) {
      return reply({ ok: false, reason: 'BAD LINE CODE' }, 400);
    }
    if (isTestPilotGhost(line.ghost)) return reply({ ok: false, reason: 'TEST PILOT' }, 400);
    const id = await lineIdOf(code);
    // The run is noted as its name's only when that name is this browser's
    // (its key held by this token): a SHARE can't claim a run for a name.
    if (!pilotNameProblem(line.ghost.name)) {
      const holder = await env.DB.prepare('SELECT token_hash FROM pilot_keys WHERE key = ?').bind(pilotNameKey(line.ghost.name)).first();
      if (holder && holder.token_hash === tokenHash) await noteDigest(env, await ghostDigest(line.ghost), pilotNameKey(line.ghost.name));
    }
    await env.DB.prepare(
      'INSERT OR IGNORE INTO lines (id, code, created_ms) VALUES (?, ?, ?)',
    ).bind(id, code, Date.now()).run();
    return reply({ ok: true, id });
  }

  // Anonymous daily flight counts (sim-retention.js COUNT_EVENTS): one ping
  // adds one to the UTC day's total for its event, class, core and input, in
  // one D1 write (counts is WITHOUT ROWID: no index row beside it). Checked
  // before anything; refused from a page another site serves; rate-limited
  // in memory (countAllowed). A write that fails is dropped: the ping still
  // gets its 204, and nothing about it reaches the boards.
  if (request.method === 'POST' && path === '/api/count') {
    if (!env || !env.DB) return reply({ ok: false, reason: 'NO DATABASE' }, 503);
    const len = Number(request.headers.get('Content-Length') || 0);
    const text = len > COUNT_BODY_MAX ? '' : await request.text();
    if (len > COUNT_BODY_MAX || text.length > COUNT_BODY_MAX) return reply({ ok: false, reason: 'PAYLOAD TOO LARGE' }, 400);
    let body = null;
    try { body = JSON.parse(text); } catch (e) { return reply({ ok: false, reason: 'BAD JSON' }, 400); }
    const ping = normalizeCountPing(body);
    if (!ping.ok) return reply({ ok: false, reason: ping.reason }, 400);
    const origin = request.headers.get('Origin');
    const allowed = allowedOriginList((env && env.ALLOWED_ORIGIN) || DEFAULT_ALLOWED_ORIGIN);
    if (origin && !allowed.includes('*') && !allowed.includes(origin)) return reply({ ok: false, reason: 'ORIGIN' }, 403);
    if (!countAllowed(clientIp(request), Date.now())) return reply({ ok: false, reason: 'RATE LIMIT' }, 429);
    try {
      await env.DB.prepare(
        'INSERT INTO counts (day, event, class, core, input, n) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(day, event, class, core, input) DO UPDATE SET n = n + 1',
      ).bind(utcDateId(), ping.event, ping.class, ping.core, ping.input).run();
    } catch (e) { /* dropped: a count never fails a request, or reaches the boards */ }
    return new Response(null, { status: 204, headers: corsHeaders(env, request) });
  }

  if (request.method === 'GET' && path === '/api/line') {
    const id = url.searchParams.get('id') || '';
    if (!LINE_ID_RE.test(id)) return reply({ ok: false, reason: 'BAD ID' }, 400);
    if (!env || !env.DB) return reply({ ok: false, reason: 'NO DATABASE' }, 503);
    const row = await env.DB.prepare('SELECT code FROM lines WHERE id = ?').bind(id).first();
    if (!row || !row.code) return reply({ ok: false, reason: 'NOT FOUND' }, 404);
    return reply({ ok: true, id, code: row.code });
  }

  return reply({ ok: false, reason: 'NOT FOUND' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleLeaderboard(request, env);
    } catch (e) {
      // Deployed before migrate-builtin-boards.sql ran (DEPLOY.md): say so.
      if (/no such table/i.test(String(e && e.message))) return json({ ok: false, reason: 'NOT MIGRATED' }, 503, env, request);
      return json({ ok: false, reason: 'SERVER' }, 500, env, request);
    }
  },
};
