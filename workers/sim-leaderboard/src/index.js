// QuadMath sim W5 weekly leaderboard Worker.
// Bundles ../../.. /sim-retention.js so anti-cheat stays one implementation.
// Do not deploy from the agent — Ryan deploys (see DEPLOY.md).

import {
  utcWeekId,
  weeklyTrackFor,
  classId,
  normalizeSubmit,
  rateWindowId,
} from '../../../sim-retention.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const RATE_MAX = 12;
const JSON_LIMIT = 350_000;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
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

async function listBoard(env, week, frameMm) {
  const c = classId(frameMm);
  const { results } = await env.DB.prepare(
    'SELECT name, time_ms AS timeMs, track_id AS trackId, submitted_ms AS at FROM scores WHERE week = ? AND class = ? ORDER BY time_ms ASC LIMIT 20',
  ).bind(week, c).all();
  return results || [];
}

export async function handleLeaderboard(request, env) {
  const origin = (env && env.ALLOWED_ORIGIN) || '*';
  CORS['Access-Control-Allow-Origin'] = origin;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && (path === '/' || path === '/health')) {
    return json({ ok: true, service: 'quadmath-sim-leaderboard' });
  }

  if (request.method === 'GET' && path === '/api/week') {
    const week = url.searchParams.get('week') || utcWeekId();
    const track = weeklyTrackFor(week);
    return json({ week, track });
  }

  if (request.method === 'GET' && path === '/api/board') {
    const week = url.searchParams.get('week') || utcWeekId();
    const frameMm = classId(url.searchParams.get('class') || url.searchParams.get('frameMm') || 65);
    if (!env || !env.DB) {
      return json({ week, class: frameMm, entries: [], online: false, note: 'no D1' });
    }
    const entries = await listBoard(env, week, frameMm);
    return json({ week, class: frameMm, entries, online: true });
  }

  if (request.method === 'POST' && path === '/api/submit') {
    if (!env || !env.DB) return json({ ok: false, reason: 'NO DATABASE' }, 503);
    const ip = clientIp(request);
    const allowed = await checkRate(env, ip, Date.now());
    if (!allowed) return json({ ok: false, reason: 'RATE LIMIT' }, 429);
    const parsed = await readJson(request);
    if (parsed.error) return json({ ok: false, reason: parsed.error }, 400);
    const checked = normalizeSubmit(parsed.body);
    if (!checked.ok) return json({ ok: false, reason: checked.reason }, 400);
    const existing = await env.DB.prepare(
      'SELECT time_ms FROM scores WHERE week = ? AND class = ? AND name = ?',
    ).bind(checked.week, checked.frameMm, checked.name).first();
    if (existing && existing.time_ms <= checked.timeMs) {
      const entries = await listBoard(env, checked.week, checked.frameMm);
      return json({ ok: true, improved: false, timeMs: existing.time_ms, entries });
    }
    await env.DB.prepare(
      'INSERT INTO scores (week, class, name, time_ms, track_id, submitted_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(week, class, name) DO UPDATE SET time_ms = excluded.time_ms, track_id = excluded.track_id, submitted_ms = excluded.submitted_ms WHERE excluded.time_ms < scores.time_ms',
    ).bind(
      checked.week, checked.frameMm, checked.name, checked.timeMs, checked.trackId, Date.now(),
    ).run();
    const entries = await listBoard(env, checked.week, checked.frameMm);
    return json({ ok: true, improved: true, timeMs: checked.timeMs, entries });
  }

  return json({ ok: false, reason: 'NOT FOUND' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleLeaderboard(request, env);
    } catch (e) {
      return json({ ok: false, reason: 'SERVER' }, 500);
    }
  },
};
