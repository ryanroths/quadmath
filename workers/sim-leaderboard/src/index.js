// QuadMath sim W5 weekly leaderboard Worker.
// Bundles ../../.. /sim-retention.js so anti-cheat stays one implementation.
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
} from '../../../sim-retention.js';

const CORS_METHODS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

const RATE_MAX = 12;
const JSON_LIMIT = 350_000;
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

async function checkRate(env, ip, now) {
  const window = rateWindowId(now);
  const row = await env.DB.prepare(
    'SELECT n FROM rate_limit WHERE ip = ? AND window = ?',
  ).bind(ip, window).first();
  const n = row && row.n ? row.n : 0;
  if (n >= RATE_MAX) return false;
  await env.DB.prepare(
    'INSERT INTO rate_limit (ip, window, n) VALUES (?, ?, 1) ON CONFLICT(ip, window) DO UPDATE SET n = n + 1',
  ).bind(ip, window).run();
  return true;
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
  const existing = await env.DB.prepare(
    'SELECT time_ms FROM scores WHERE week = ? AND class = ? AND name = ?',
  ).bind(key, frameMm, name).first();
  if (existing && existing.time_ms <= timeMs) {
    return { improved: false, timeMs: existing.time_ms };
  }
  await env.DB.prepare(
    'INSERT INTO scores (week, class, name, time_ms, track_id, submitted_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(week, class, name) DO UPDATE SET time_ms = excluded.time_ms, track_id = excluded.track_id, submitted_ms = excluded.submitted_ms WHERE excluded.time_ms < scores.time_ms',
  ).bind(key, frameMm, name, timeMs, trackId, Date.now()).run();
  return { improved: true, timeMs };
}

async function claimPilot(env, name, tokenHash) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO pilots (name, token_hash, claimed_ms) VALUES (?, ?, ?)',
  ).bind(name, tokenHash, Date.now()).run();
  const row = await env.DB.prepare(
    'SELECT token_hash FROM pilots WHERE name = ?',
  ).bind(name).first();
  if (!row || !row.token_hash) return { ok: false, reason: 'NAME TAKEN' };
  if (row.token_hash !== tokenHash) return { ok: false, reason: 'NAME TAKEN' };
  return { ok: true };
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
    if (!env || !env.DB) return reply({ ok: false, reason: 'NO DATABASE' }, 503);
    const ip = clientIp(request);
    const allowed = await checkRate(env, ip, Date.now());
    if (!allowed) return reply({ ok: false, reason: 'RATE LIMIT' }, 429);
    const parsed = await readJson(request);
    if (parsed.error) return reply({ ok: false, reason: parsed.error }, 400);
    const checked = normalizeSubmit(parsed.body);
    if (!checked.ok) return reply({ ok: false, reason: checked.reason }, 400);
    if (!TOKEN_RE.test(checked.token || '')) return reply({ ok: false, reason: 'NO TOKEN' }, 400);
    const tokenHash = await hashPilotToken(checked.token);
    const claim = await claimPilot(env, checked.name, tokenHash);
    if (!claim.ok) return reply({ ok: false, reason: claim.reason }, 403);
    const saved = await upsertScore(env, checked.week, checked.frameMm, checked.name, checked.timeMs, checked.trackId);
    const entries = await listBoard(env, checked.week, checked.frameMm, checked.trackId);
    return reply({ ok: true, improved: saved.improved, timeMs: saved.timeMs, entries });
  }

  if (request.method === 'POST' && path === '/api/daily/submit') {
    if (!env || !env.DB) return reply({ ok: false, reason: 'NO DATABASE' }, 503);
    const ip = clientIp(request);
    const allowed = await checkRate(env, ip, Date.now());
    if (!allowed) return reply({ ok: false, reason: 'RATE LIMIT' }, 429);
    const parsed = await readJson(request);
    if (parsed.error) return reply({ ok: false, reason: parsed.error }, 400);
    const checked = normalizeDailyLineSubmit(parsed.body);
    if (!checked.ok) return reply({ ok: false, reason: checked.reason }, 400);
    if (!TOKEN_RE.test(checked.token || '')) return reply({ ok: false, reason: 'NO TOKEN' }, 400);
    const tokenHash = await hashPilotToken(checked.token);
    const claim = await claimPilot(env, checked.name, tokenHash);
    if (!claim.ok) return reply({ ok: false, reason: claim.reason }, 403);
    const saved = await upsertScore(env, checked.week, checked.frameMm, checked.name, checked.timeMs, checked.trackId);
    const entries = await listBoard(env, checked.week, checked.frameMm, checked.trackId);
    return reply({
      ok: true, improved: saved.improved, timeMs: saved.timeMs, entries,
      day: checked.day, trackId: checked.trackId,
    });
  }

  return reply({ ok: false, reason: 'NOT FOUND' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleLeaderboard(request, env);
    } catch (e) {
      return json({ ok: false, reason: 'SERVER' }, 500, env, request);
    }
  },
};
