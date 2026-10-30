// QuadMath sim ghost rooms Worker: room codes and the WebSocket route to each
// room's Durable Object (room.js). Its own Worker, not the leaderboard's: a
// leaderboard deploy (every PHYS_VER bump) would drop every live room, and
// the two share nothing but CORS.
// Do not deploy from the agent — Ryan deploys (see DEPLOY.md).
//
//   POST /rooms                {map}  -> {ok, code, map, track}
//   GET  /rooms/CODE                  -> {ok, code, map, track, pilots, max}
//   GET  /rooms/CODE/ws?name=  (WebSocket) the room
//   GET  /health

import {
  normalizeRoomCode, randomRoomCode, validMapId, roomTrackFor,
} from '../../../sim-ghost-rooms.js';
import { allowedOriginList, pickCorsOrigin, DEFAULT_ALLOWED_ORIGIN } from '../../../sim-retention.js';

export { Room } from './room.js';

const CREATE_TRIES = 12;
const BODY_LIMIT = 1024;

function corsHeaders(env, request) {
  const spec = (env && env.ALLOWED_ORIGIN) || DEFAULT_ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': pickCorsOrigin(spec, request.headers.get('Origin')),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env, request) },
  });
}

// A browser on another site is refused; no Origin (a script) is let in, as
// it could send any Origin it liked.
function originAllowed(env, request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const list = allowedOriginList((env && env.ALLOWED_ORIGIN) || DEFAULT_ALLOWED_ORIGIN);
  return list.includes('*') || list.includes(origin);
}

function cryptoRand() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

function roomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

async function createRoom(request, env) {
  const text = await request.text();
  if (text.length > BODY_LIMIT) return { status: 413, body: { ok: false, reason: 'PAYLOAD TOO LARGE' } };
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* below */ }
  const map = body && body.map;
  if (!validMapId(map)) return { status: 400, body: { ok: false, reason: 'BAD MAP' } };
  const track = roomTrackFor(map);
  for (let i = 0; i < CREATE_TRIES; i++) {
    const code = randomRoomCode(cryptoRand);
    const res = await roomStub(env, code).fetch('https://room/create', {
      method: 'POST',
      body: JSON.stringify({ code, map, track }),
    });
    if (res.status === 201) return { status: 201, body: { ok: true, code, map, track } };
  }
  return { status: 503, body: { ok: false, reason: 'NO FREE CODE' } };
}

export async function handleRooms(request, env) {
  const reply = (data, status) => json(data, status, env, request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) });
  if (!originAllowed(env, request)) return reply({ ok: false, reason: 'ORIGIN' }, 403);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET' && (path === '/' || path === '/health')) {
    return reply({ ok: true, service: 'quadmath-sim-rooms' });
  }
  if (request.method === 'POST' && path === '/rooms') {
    const made = await createRoom(request, env);
    return reply(made.body, made.status);
  }
  const m = /^\/rooms\/([^/]+)(\/ws)?$/.exec(path);
  if (m && request.method === 'GET') {
    const code = normalizeRoomCode(m[1]);
    if (!code || code !== m[1]) return reply({ ok: false, reason: 'BAD CODE' }, 400);
    const stub = roomStub(env, code);
    if (m[2]) {
      if (request.headers.get('Upgrade') !== 'websocket') return reply({ ok: false, reason: 'WEBSOCKET ONLY' }, 426);
      const name = url.searchParams.get('name') || '';
      return stub.fetch('https://room/ws?name=' + encodeURIComponent(name.slice(0, 64)), request);
    }
    const res = await stub.fetch('https://room/info');
    return reply(await res.json(), res.status);
  }
  return reply({ ok: false, reason: 'NOT FOUND' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRooms(request, env);
    } catch (e) {
      return json({ ok: false, reason: 'SERVER' }, 500, env, request);
    }
  },
};
