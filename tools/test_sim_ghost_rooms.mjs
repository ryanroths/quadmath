// Ghost rooms in Node, no network: sim-ghost-rooms.js (codes, the 18-byte
// pose, interpolation), the Room Durable Object's logic and the Worker's
// routes and the create rate limit (workers/sim-rooms) on fake runtimes,
// the remote motor voice's
// level (sim-audio.js), and that remote poses stay render-only. The same
// room against a real `wrangler dev`, four pilots: test_sim_rooms_wrangler.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOM_MAX, POSE_HZ, ROOM_TTL_MS, ROOM_CODE_LETTERS, POSE_BYTES, RELAY_BYTES, RPM_UNIT,
  INTERP_DELAY_MS, STALE_MS, CLOSE_FULL, CLOSE_NO_ROOM,
  normalizeRoomCode, randomRoomCode, validMapId, roomTrackFor, posUnitsPerWu, roomPilotName, createRoom,
  encodePose, decodePose, createPoseTrack, pushPose, samplePoseTrack, roomsUrl, roomSocketUrl,
  closeReason,
} from '../sim-ghost-rooms.js';
import { RoomLogic, Room, roomTtl } from '../workers/sim-rooms/src/room.js';
import { handleRooms } from '../workers/sim-rooms/src/index.js';
import { CreateLimitLogic, CreateLimit, CREATE_LIMIT, CREATE_WINDOW_MS } from '../workers/sim-rooms/src/limit.js';
import { remoteLevel, REMOTE_REF_M, REMOTE_MAX_M } from '../sim-audio.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');

// A seeded generator, so a failure repeats.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function randomPose(r) {
  const q = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5];
  return {
    t: Math.floor(r() * 200000),
    pos: [(r() - 0.5) * 200, r() * 30, (r() - 0.5) * 200],
    quat: q,
    rpm: [r() * 90000, r() * 90000, r() * 90000, r() * 90000],
  };
}

function angleDeg(a, b) {
  const n = (q) => Math.hypot(...q);
  const dot = Math.abs(a.reduce((s, v, i) => s + v * b[i], 0)) / (n(a) * n(b));
  return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
}

test('room codes: 4 letters without I or O; the shipped TTL is 10 min', () => {
  assert.equal(ROOM_MAX, 4);
  assert.equal(POSE_HZ, 20);
  assert.equal(ROOM_TTL_MS, 10 * 60 * 1000);
  assert.equal(ROOM_CODE_LETTERS.length, 24);
  assert.ok(!/[IO]/.test(ROOM_CODE_LETTERS));
  assert.equal(normalizeRoomCode(' ab-cd '), 'ABCD');
  assert.equal(normalizeRoomCode('abci'), null);
  assert.equal(normalizeRoomCode('abc'), null);
  assert.equal(normalizeRoomCode('abcde'), null);
  assert.equal(randomRoomCode(() => 0), 'AAAA');
  assert.equal(randomRoomCode(() => 0.999999), 'ZZZZ');
  const r = rng(7);
  for (let i = 0; i < 500; i++) assert.ok(normalizeRoomCode(randomRoomCode(r)));
  // The Worker's config and its fallback agree with the client.
  assert.match(read('workers/sim-rooms/wrangler.jsonc'), /"ROOM_TTL_MS":\s*"600000"/);
  assert.equal(roomTtl({ ROOM_TTL_MS: '600000' }), ROOM_TTL_MS);
  assert.equal(roomTtl({}), ROOM_TTL_MS);
  assert.equal(roomTtl({ ROOM_TTL_MS: 'x' }), ROOM_TTL_MS);
  assert.equal(validMapId('rig'), true);
  assert.equal(validMapId('../x'), false);
  assert.equal(roomTrackFor('rig'), 'rig-freestyle');
  assert.equal(roomPilotName('  <b>Ana</b>  '), 'bAnab');
  assert.equal(roomPilotName(''), 'PILOT');
  assert.equal(roomPilotName('x'.repeat(40)).length, 16);
  assert.equal(closeReason(CLOSE_FULL), 'ROOM FULL');
  assert.equal(closeReason(CLOSE_NO_ROOM), 'NO SUCH ROOM');
});

test('the pose: 18 bytes up, 19 down, within a step of what was sent', () => {
  assert.equal(POSE_BYTES, 18);
  assert.equal(RELAY_BYTES, 19);
  const r = rng(11);
  let worstDeg = 0;
  for (const map of ['rig', 'city']) {
    const units = posUnitsPerWu(map);
    for (let i = 0; i < 2000; i++) {
      const p = randomPose(r);
      if (map !== 'city') p.pos = p.pos.map((v) => v / 10);
      const buf = encodePose(p, units);
      assert.equal(buf.byteLength, POSE_BYTES);
      const d = decodePose(new DataView(buf), units);
      assert.equal(d.t, p.t & 0xffff);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(d.pos[k] - p.pos[k]) <= 0.5 / units + 1e-9, map + ' pos');
      worstDeg = Math.max(worstDeg, angleDeg(d.quat, p.quat));
      assert.ok(Math.abs(Math.hypot(...d.quat) - 1) < 1e-6);
      for (let k = 0; k < 4; k++) assert.ok(Math.abs(d.rpm[k] - Math.min(p.rpm[k], 255 * RPM_UNIT)) <= RPM_UNIT / 2 + 1e-9);
    }
  }
  assert.ok(worstDeg < 0.01, 'attitude within 0.01 deg (' + worstDeg.toFixed(5) + ')');
  // q and -q, an upside-down quad, a plain yaw: one rotation each.
  for (const q of [[0, 0, 0, -1], [1, 0, 0, 0], [0, -0.7071, 0, 0.7071], [0.5, -0.5, 0.5, -0.5]]) {
    const d = decodePose(new DataView(encodePose({ t: 0, pos: [0, 0, 0], quat: q, rpm: [0, 0, 0, 0] }, 256)), 256);
    assert.ok(angleDeg(d.quat, q) < 0.01, JSON.stringify(q));
  }
  // Out of range: clamped, not wrapped.
  const far = decodePose(new DataView(encodePose({ t: 70000, pos: [1e6, -1e6, 0], quat: [0, 0, 0, 1], rpm: [-50000, 2e5, 0, 0] }, 256)), 256);
  assert.deepEqual([far.t, far.pos[0], far.pos[1]], [70000 & 0xffff, 32767 / 256, -32767 / 256]);
  assert.deepEqual(far.rpm.slice(0, 2), [50000, 255 * RPM_UNIT]);
  // The indoor maps fit (backyard, the largest, is under 31 wu from centre);
  // the city's ground is 1400 wu across.
  assert.ok(32767 / posUnitsPerWu('rig') > 100);
  assert.ok(32767 / posUnitsPerWu('city') > 700);
});

test('bandwidth: under 2 KB/s a pilot, up and down, in a full room', () => {
  // WebSocket frame headers: 6 bytes client to server (masked), 2 back.
  const up = POSE_HZ * (POSE_BYTES + 6);
  const down = (ROOM_MAX - 1) * POSE_HZ * (RELAY_BYTES + 2);
  assert.equal(up, 480);
  assert.equal(down, 1260);
  assert.ok(up + down < 2000, up + down + ' B/s');
});

test('interpolation: smooth through jitter, holds at the newest, unwraps t', () => {
  const tr = createPoseTrack();
  const r = rng(3);
  const speed = 2;            // wu/s along x
  const pose = (t) => ({ t: t & 0xffff, pos: [speed * t / 1000, 1, 0], quat: [0, 0, 0, 1], rpm: [30000, 30000, 30000, 30000] });
  const t0 = 65000;           // wraps after ~0.5 s
  const sends = [];
  for (let i = 0; i < 60; i++) sends.push({ t: t0 + i * 50, at: 1000 + i * 50 + 40 + r() * 30 });
  sends.sort((a, b) => a.at - b.at);
  let si = 0, lastX = null, maxStep = 0;
  for (let now = 1000; now < 1000 + 60 * 50 + 200; now += 1000 / 60) {
    while (si < sends.length && sends[si].at <= now) { pushPose(tr, pose(sends[si].t), sends[si].at); si++; }
    const s = samplePoseTrack(tr, now);
    if (!s) continue;
    if (lastX != null) maxStep = Math.max(maxStep, s.pos[0] - lastX);
    assert.ok(lastX == null || s.pos[0] >= lastX - 1e-9, 'never backwards');
    lastX = s.pos[0];
  }
  // At 60 fps a 2 wu/s ghost moves 0.033 wu a frame; jitter must not jerk it.
  assert.ok(maxStep < 3 * speed / 60, 'largest step ' + maxStep.toFixed(4));
  assert.ok(tr.samples[tr.samples.length - 1].t > 65535, 'unwrapped past 65535');
  const end = samplePoseTrack(tr, 1e6);
  assert.ok(Math.abs(end.pos[0] - speed * (t0 + 59 * 50) / 1000) < 1e-6, 'holds the newest pose');
  assert.equal(end.stale, true, 'and is stale after STALE_MS');
  assert.equal(samplePoseTrack(tr, tr.arrival + STALE_MS - 1).stale, false);
  // A repeat and an out-of-order pose are dropped.
  assert.equal(pushPose(tr, pose(t0 + 59 * 50), tr.arrival + 1), false);
  assert.equal(pushPose(tr, pose(t0 + 10 * 50), tr.arrival + 1), false);
  // A long gap starts over (the pilot's tab was hidden).
  assert.equal(pushPose(tr, pose(5), tr.arrival + 5000), true);
  assert.equal(tr.samples.length, 1);
  assert.ok(INTERP_DELAY_MS >= 2 * 1000 / POSE_HZ);
});

// ---------- The Room DO's logic on a fake runtime ----------
function fakeCtx() {
  const store = new Map();
  const sockets = [];
  const ctx = {
    sockets, alarm: null, store,
    storage: {
      async get(k) { return store.has(k) ? structuredClone(store.get(k)) : undefined; },
      async put(k, v) { store.set(k, structuredClone(v)); },
      async deleteAll() { store.clear(); },
      async setAlarm(t) { ctx.alarm = t; },
      async deleteAlarm() { ctx.alarm = null; },
    },
    getWebSockets() { return sockets.filter((s) => !s.closed); },
  };
  return ctx;
}
function fakeSocket(ctx) {
  const s = {
    sent: [], closed: false, att: null,
    send(d) { if (s.closed) throw new Error('closed'); s.sent.push(d); },
    close(code) { s.closed = true; s.code = code; },
    serializeAttachment(a) { s.att = structuredClone(a); },
    deserializeAttachment() { return s.att; },
    json() { return s.sent.filter((d) => typeof d === 'string').map((d) => JSON.parse(d)); },
    frames() { return s.sent.filter((d) => typeof d !== 'string'); },
  };
  ctx.sockets.push(s);
  return s;
}
const poseBytes = (t, x) => new Uint8Array(encodePose({ t, pos: [x, 1, 0], quat: [0, 0, 0, 1], rpm: [30000, 0, 0, 0] }, 256));

test('Room: create, join, the 4-pilot max, fan-out, late join, rate cap, leave', async () => {
  const ctx = fakeCtx();
  const room = new RoomLogic(ctx, 600000);
  let now = 1000;
  assert.equal(await room.info(now), null);
  assert.equal(await room.admit(now), CLOSE_NO_ROOM);
  assert.equal(await room.create({ code: 'ABCD', map: 'rig', track: 'rig-freestyle' }, now), true);
  assert.equal(ctx.alarm, now + 600000, 'expires 10 min on if nobody joins');
  assert.equal(await room.create({ code: 'ABCD', map: 'gym', track: 'gym-freestyle' }, now), false, 'a live code is not made twice');
  assert.deepEqual(await room.info(now), { code: 'ABCD', map: 'rig', track: 'rig-freestyle', pilots: 0, max: 4 });

  const ws = [];
  for (const name of ['Ana', 'Bo', 'Cy', 'Dee']) {
    const s = fakeSocket(ctx);
    assert.equal(await room.join(s, name, now), 0);
    ws.push(s);
  }
  assert.equal(ctx.alarm, now + 600000, 'pilots in: the alarm checks back');
  await room.alarm(now + 600000);
  assert.equal(ctx.alarm, now + 1200000, 'and only re-arms');
  assert.ok(await room.info(now + 600000));
  assert.deepEqual(ws.map((s) => s.att.slot), [0, 1, 2, 3]);
  const w3 = ws[3].json()[0];
  assert.deepEqual([w3.type, w3.slot, w3.name, w3.map, w3.track, w3.max], ['welcome', 3, 'Dee', 'rig', 'rig-freestyle', 4]);
  assert.deepEqual(w3.pilots, [{ slot: 0, name: 'Ana' }, { slot: 1, name: 'Bo' }, { slot: 2, name: 'Cy' }]);
  assert.deepEqual(ws[0].json().slice(1).map((m) => [m.type, m.name]), [['join', 'Bo'], ['join', 'Cy'], ['join', 'Dee']]);
  assert.equal(await room.admit(now), CLOSE_FULL);
  const fifth = fakeSocket(ctx);
  assert.equal(await room.join(fifth, 'Eve', now), CLOSE_FULL);
  ctx.sockets.pop();

  // Fan-out: to the other three, slot in front, never back to the sender.
  assert.equal(room.message(ws[1], poseBytes(50, 0.5).buffer, now), 3);
  for (const [i, s] of ws.entries()) {
    const f = s.frames();
    if (i === 1) { assert.equal(f.length, 0); continue; }
    assert.equal(f.length, 1);
    assert.equal(f[0].length, RELAY_BYTES);
    assert.equal(f[0][0], 1);
    assert.deepEqual([...f[0].subarray(1)], [...poseBytes(50, 0.5)]);
  }
  assert.equal(room.message(ws[1], new Uint8Array(17).buffer, now), 0, 'wrong length: dropped');
  assert.equal(room.message(ws[1], 'hello', now), 0, 'pilots send no text');
  room.message(ws[2], poseBytes(60, 2).buffer, now);

  // Rate cap: a burst gets BUCKET_MAX through, then POSE_HZ x 1.5 a second.
  now += 1000;
  let relayed = 0;
  for (let i = 0; i < 40; i++) relayed += room.message(ws[0], poseBytes(100 + i, 0).buffer, now) ? 1 : 0;
  assert.equal(relayed, 10);
  now += 1000;
  relayed = 0;
  for (let i = 0; i < 40; i++) relayed += room.message(ws[0], poseBytes(200 + i, 0).buffer, now) ? 1 : 0;
  assert.equal(relayed, 10);

  // Leave: the others hear it; late join gets each pilot's current pose.
  ws[3].closed = true;
  await room.leave(ws[3], now);
  assert.deepEqual(ws[0].json().pop(), { type: 'leave', slot: 3 });
  const late = fakeSocket(ctx);
  assert.equal(await room.join(late, '', now), 0);
  assert.equal(late.att.slot, 3, 'the free slot');
  assert.equal(late.json()[0].name, 'PILOT 4', 'no name: the room names the pilot');
  const f = late.frames();
  assert.deepEqual(f.map((x) => x[0]), [0, 1, 2], 'one current pose a pilot, right after the welcome');
  assert.equal(late.sent.indexOf(late.sent.find((d) => typeof d !== 'string')), 1);
  assert.deepEqual([...f[1].subarray(1)], [...poseBytes(50, 0.5)]);
  assert.deepEqual([...f[2].subarray(1)], [...poseBytes(60, 2)]);
  assert.deepEqual([...f[0].subarray(1)], [...poseBytes(209, 0)], 'the latest relayed');
});

test('Room: expires ROOM_TTL_MS after the last pilot leaves; a rejoin restarts the clock', async () => {
  const ctx = fakeCtx();
  const ttl = 600000;
  const room = new RoomLogic(ctx, ttl);
  let now = 0;
  await room.create({ code: 'WXYZ', map: 'rig', track: 'rig-freestyle' }, now);
  const a = fakeSocket(ctx);
  await room.join(a, 'Ana', now);
  now = 60000;
  a.closed = true;
  await room.leave(a, now);
  assert.equal(ctx.alarm, now + ttl);
  assert.equal((await room.info(now + ttl - 1)).pilots, 0, 'still there with nobody in');
  // Rejoin within the TTL, leave again: the clock restarts from that leave.
  const b = fakeSocket(ctx);
  assert.equal(await room.join(b, 'Bo', now + ttl - 1000), 0);
  assert.equal(ctx.alarm, now + 2 * ttl - 1000);
  b.closed = true;
  const left = now + ttl - 500;
  await room.leave(b, left);
  assert.equal(ctx.alarm, left + ttl);
  await room.alarm(now + ttl);                  // a stale alarm: reset, not expired
  assert.ok(await room.info(now + ttl));
  assert.equal(ctx.alarm, left + ttl);
  await room.alarm(left + ttl);
  assert.equal(ctx.store.size, 0, 'storage deleted');
  assert.equal(await room.info(left + ttl), null);
  assert.equal(await room.admit(left + ttl), CLOSE_NO_ROOM);
  assert.equal(await room.create({ code: 'WXYZ', map: 'gym', track: 'gym-freestyle' }, left + ttl), true, 'the code is free again');
  // Sockets gone without a close (a deploy restarted the object): the next
  // alarm marks the room empty, the one after expires it.
  const gone = fakeCtx();
  const before = new RoomLogic(gone, ttl);
  await before.create({ code: 'GONE', map: 'rig', track: 'rig-freestyle' }, 0);
  await before.join(fakeSocket(gone), 'Ana', 0);
  gone.sockets.length = 0;
  const after = new RoomLogic(gone, ttl);
  assert.ok(await after.info(ttl), 'not expired yet: it never emptied');
  await after.alarm(ttl);
  assert.equal(gone.alarm, 2 * ttl);
  assert.ok(await after.info(2 * ttl - 1));
  await after.alarm(2 * ttl);
  assert.equal(gone.store.size, 0, 'expired one TTL after the alarm found it empty');
  // Even with no alarm run, an expired room refuses.
  const lazy = new RoomLogic(fakeCtx(), ttl);
  await lazy.create({ code: 'QQQQ', map: 'rig', track: 'rig-freestyle' }, 0);
  assert.equal(await lazy.admit(ttl), CLOSE_NO_ROOM);
});

// ---------- The Worker's routes, with the DO namespace faked ----------
function fakeNamespace(make, opts = {}) {
  const objects = new Map();
  return {
    objects,
    idFromName: (name) => name,
    get: (id) => {
      if (!objects.has(id)) objects.set(id, make());
      const o = objects.get(id);
      return { fetch: (url, init) => (opts.busy ? Promise.resolve(new Response('{}', { status: 409 })) : o.fetch(new Request(url, init))) };
    },
  };
}
function fakeEnv(opts = {}) {
  const ROOMS = fakeNamespace(() => new Room(fakeCtx(), {}), opts);
  const CREATE_LIMIT = fakeNamespace(() => new CreateLimit(fakeCtx()));
  return { ALLOWED_ORIGIN: 'https://quadmath.com,http://localhost:4173', ROOMS, CREATE_LIMIT, objects: ROOMS.objects };
}

test('Worker: create, info, bad input, origins', async () => {
  const env = fakeEnv();
  const call = (path, init) => handleRooms(new Request('https://rooms.test' + path, init), env);
  let res = await call('/health');
  assert.equal((await res.json()).service, 'quadmath-sim-rooms');
  res = await call('/rooms', { method: 'POST', body: JSON.stringify({ map: 'rig' }), headers: { Origin: 'https://quadmath.com' } });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://quadmath.com');
  const made = await res.json();
  assert.ok(normalizeRoomCode(made.code));
  assert.deepEqual([made.map, made.track], ['rig', 'rig-freestyle']);
  res = await call('/rooms/' + made.code);
  assert.deepEqual(await res.json(), { ok: true, code: made.code, map: 'rig', track: 'rig-freestyle', pilots: 0, max: 4 });
  res = await call('/rooms/' + (made.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ'));
  assert.equal(res.status, 404);
  assert.equal((await call('/rooms/abcd')).status, 400);
  assert.equal((await call('/rooms/ABCI')).status, 400);
  assert.equal((await call('/rooms', { method: 'POST', body: '{"map":"../etc"}' })).status, 400);
  assert.equal((await call('/rooms', { method: 'POST', body: 'x'.repeat(5000) })).status, 413);
  assert.equal((await call('/rooms/' + made.code + '/ws')).status, 426, 'the room route is a WebSocket');
  res = await call('/rooms', { method: 'POST', body: '{"map":"rig"}', headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403, 'another site is refused');
  res = await handleRooms(new Request('https://rooms.test/rooms', { method: 'POST', body: '{"map":"rig"}' }), fakeEnv({ busy: true }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, 'NO FREE CODE');
});

test('create rate limit: 10 a minute an IP, sliding; a refusal is not counted', async () => {
  assert.equal(CREATE_LIMIT, 10);
  assert.equal(CREATE_WINDOW_MS, 60000);
  const ctx = fakeCtx();
  const lim = new CreateLimitLogic(ctx.storage);
  for (let i = 0; i < 10; i++) assert.deepEqual(await lim.take(1000 + i * 1000), { ok: true });
  assert.equal(ctx.alarm, 10000 + CREATE_WINDOW_MS, 'the alarm follows the last create');
  // The 11th inside the minute: refused until the first leaves the window.
  assert.deepEqual(await lim.take(30000), { ok: false, retryAfterS: 31 });
  assert.deepEqual(await lim.take(60999), { ok: false, retryAfterS: 1 });
  assert.equal(ctx.store.get('hits').length, 10, 'refusals are not counted');
  assert.deepEqual(await lim.take(61000), { ok: true }, 'sliding: the first create (t=1000) is out');
  assert.equal((await lim.take(61500)).ok, false, 'and only that one');
  // The alarm deletes what has left the window, all of it once idle.
  await lim.alarm(65000);
  assert.ok(ctx.store.get('hits'));
  await lim.alarm(61000 + CREATE_WINDOW_MS);
  assert.equal(ctx.store.size, 0, 'nothing kept once the window is past');
  assert.deepEqual(await lim.take(200000), { ok: true });
});

test('Worker: the 11th create a minute from one IP is 429 TOO MANY ROOMS', async () => {
  const env = fakeEnv();
  const post = (ip, body = '{"map":"rig"}') => handleRooms(new Request('https://rooms.test/rooms', {
    method: 'POST', body, headers: { 'CF-Connecting-IP': ip, Origin: 'https://quadmath.com' },
  }), env);
  const ok = [];
  for (let i = 0; i < 10; i++) ok.push((await post('198.51.100.1', i === 3 ? '{"map":"../x"}' : undefined)).status);
  assert.deepEqual(ok, [201, 201, 201, 400, 201, 201, 201, 201, 201, 201], 'every create attempt counts, a bad one too');
  const res = await post('198.51.100.1');
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { ok: false, reason: 'TOO MANY ROOMS' });
  const retry = Number(res.headers.get('Retry-After'));
  assert.ok(retry >= 59 && retry <= 60, 'Retry-After ' + retry);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://quadmath.com', 'the page can read it');
  assert.equal(env.objects.size, 9, 'no room made past the limit');
  assert.equal((await post('198.51.100.2')).status, 201, 'another IP has its own limit');
  // The page's client shows the reason (sim.html toasts it).
  const viaClient = (url, init) => handleRooms(new Request(url, { ...init, headers: { ...init.headers, 'CF-Connecting-IP': '198.51.100.1' } }), env);
  await assert.rejects(createRoom('https://rooms.test', 'rig', viaClient), /^Error: TOO MANY ROOMS$/);
  // Joining and room info are not limited.
  const made = await (await post('198.51.100.3')).json();
  for (let i = 0; i < 15; i++) {
    const info = await handleRooms(new Request('https://rooms.test/rooms/' + made.code, { headers: { 'CF-Connecting-IP': '198.51.100.1' } }), env);
    assert.equal(info.status, 200);
  }
});

test('client: where the rooms Worker is', () => {
  const store = (v) => ({ getItem: () => v });
  const prod = { hostname: 'quadmath.com', search: '?rooms=http://127.0.0.1:8787' };
  assert.equal(roomsUrl(store(null), prod), 'https://sim-rooms.ryan-roths.workers.dev', '?rooms= is localhost only');
  assert.equal(roomsUrl(store('http://evil.example'), prod), 'https://sim-rooms.ryan-roths.workers.dev', 'http only on localhost');
  assert.equal(roomsUrl(store('https://r.example/'), prod), 'https://r.example');
  assert.equal(roomsUrl(store(null), { hostname: '127.0.0.1', search: '?rooms=http://127.0.0.1:8787/' }), 'http://127.0.0.1:8787');
  assert.equal(roomSocketUrl('https://r.example', 'ABCD', 'Ana B'), 'wss://r.example/rooms/ABCD/ws?name=Ana%20B');
  assert.equal(roomSocketUrl('http://127.0.0.1:8787', 'ABCD', ''), 'ws://127.0.0.1:8787/rooms/ABCD/ws?name=');
});

test('remote motor voice: inverse distance from 1 m, silent past 60 m', () => {
  assert.equal(REMOTE_REF_M, 1);
  assert.equal(REMOTE_MAX_M, 60);
  assert.equal(remoteLevel(0), 1);
  assert.equal(remoteLevel(0.5), 1);
  assert.equal(remoteLevel(2), 0.5);
  assert.equal(remoteLevel(8), 0.125);
  assert.equal(remoteLevel(60), 0);
  assert.equal(remoteLevel(NaN), 0);
  assert.equal(remoteLevel(Infinity), 0);
});

test('determinism: remote poses are render-only', () => {
  // The shared module imports nothing (it cannot reach sim-core), and
  // sim-core's side never names it.
  assert.ok(!/^\s*import\b/m.test(read('sim-ghost-rooms.js')));
  for (const f of ['sim-core-adapter.js', 'quadphysics.js']) assert.ok(!/ghost-rooms|ghostRoom/.test(read(f)), f);
  // In the page, the room block moves meshes and voices: it reads the own
  // quad (state.pos, state.q, cs.rpm) and writes nothing to the core, its
  // colliders or the quad's state.
  const html = read('sim.html');
  const a = html.indexOf('// ---------- Ghost rooms');
  const b = html.indexOf('function openRoomCard(');
  assert.ok(a > 0 && b > a);
  const block = html.slice(a, b).replace(/\/\/[^\n]*/g, '');   // code, not its comments
  assert.ok(!/\b(core|bfCore|qp)\.|colliders|placeQuadAt|bfSyncPlant|stepCore/.test(block), 'no core call');
  assert.ok(!/\bstate\.(pos|q|vel)\.(set|copy|add)|\bstate\.(pos|q|vel)\s*=|\bcs\.\w+\s*=/.test(block), 'no write to the quad');
  assert.ok(/simAudio\.updateRemote/.test(block) && /g\.mesh\.position\.set/.test(block));
});
