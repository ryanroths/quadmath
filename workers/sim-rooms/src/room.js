// QuadMath sim ghost rooms: the Room Durable Object, one per room code.
// A WebSocket per pilot (the hibernation API), at most ROOM_MAX. Binary
// frames are poses (POSE_BYTES): each goes to the other pilots with the
// sender's slot in front, and the latest per pilot is kept in memory for
// whoever joins next. Text frames are the room's own JSON (welcome, join,
// leave); pilots send none. No auth, no chat, nothing about a flight is
// stored: storage holds only the room's map, track and when it emptied,
// and is deleted ROOM_TTL_MS after the last pilot leaves (an alarm).
// The alarm is always set, every ROOM_TTL_MS while pilots are in, so a room
// whose sockets went without a close (a deploy restarts the object) still
// empties and expires.
//
// RoomLogic is the room without the runtime, so tools/test_sim_ghost_rooms.mjs
// runs it in Node; Room is the Durable Object around it.

import {
  ROOM_MAX, POSE_BYTES, RELAY_BYTES, POSE_HZ, ROOM_TTL_MS,
  CLOSE_FULL, CLOSE_NO_ROOM, roomPilotName,
} from '../../../sim-ghost-rooms.js';

const META = 'meta';
// Per pilot, a token bucket on poses: POSE_HZ with room for jitter.
const BUCKET_MAX = 10;
const BUCKET_RATE = POSE_HZ * 1.5;

export function roomTtl(env) {
  const v = Number(env && env.ROOM_TTL_MS);
  return Number.isFinite(v) && v > 0 ? v : ROOM_TTL_MS;
}

// ctx: {storage: {get, put, deleteAll, setAlarm, deleteAlarm}, getWebSockets()}
// Sockets: {send, close, serializeAttachment, deserializeAttachment}.
export class RoomLogic {
  constructor(ctx, ttlMs) {
    this.ctx = ctx;
    this.ttl = ttlMs;
    this.poses = new Map();     // slot -> Uint8Array(RELAY_BYTES), the latest
    this.buckets = new Map();   // slot -> {n, at}
    this.meta = undefined;      // cache of storage META (undefined: not read yet)
  }

  async loadMeta() {
    if (this.meta === undefined) this.meta = (await this.ctx.storage.get(META)) || null;
    return this.meta;
  }

  async saveMeta(meta) {
    this.meta = meta;
    await this.ctx.storage.put(META, meta);
  }

  pilots(except) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (a && a.slot != null) out.push({ ws, slot: a.slot, name: a.name });
    }
    return out.sort((x, y) => x.slot - y.slot);
  }

  expired(meta, now) {
    return !!meta && meta.emptySince != null && now - meta.emptySince >= this.ttl
      && this.pilots().length === 0;
  }

  async expire() {
    this.meta = null;
    this.poses.clear();
    this.buckets.clear();
    await this.ctx.storage.deleteAll();
  }

  // The Worker's Create: {code, map, track}. false when the code is live.
  async create(spec, now) {
    const meta = await this.loadMeta();
    if (meta && !this.expired(meta, now)) return false;
    if (meta) await this.expire();
    await this.saveMeta({ code: spec.code, map: spec.map, track: spec.track, createdAt: now, emptySince: now });
    await this.ctx.storage.setAlarm(now + this.ttl);
    return true;
  }

  async info(now) {
    const meta = await this.loadMeta();
    if (!meta) return null;
    if (this.expired(meta, now)) { await this.expire(); return null; }
    return { code: meta.code, map: meta.map, track: meta.track, pilots: this.pilots().length, max: ROOM_MAX };
  }

  // Whether a new pilot may join now: 0, or the close code to refuse with.
  async admit(now) {
    const meta = await this.loadMeta();
    if (!meta || this.expired(meta, now)) {
      if (meta) await this.expire();
      return CLOSE_NO_ROOM;
    }
    return this.pilots().length >= ROOM_MAX ? CLOSE_FULL : 0;
  }

  // A socket the runtime has accepted, once admit() let it in. Returns the
  // close code it was refused with, or 0 once it is in.
  async join(ws, rawName, now) {
    const refused = await this.admit(now);
    if (refused) return refused;
    const meta = this.meta;
    const others = this.pilots(ws);
    const used = new Set(others.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const name = roomPilotName(rawName, 'PILOT ' + (slot + 1));
    ws.serializeAttachment({ slot, name });
    if (meta.emptySince != null) {
      await this.saveMeta({ ...meta, emptySince: null });
      await this.ctx.storage.setAlarm(now + this.ttl);
    }
    ws.send(JSON.stringify({
      type: 'welcome', code: meta.code, slot, name, map: meta.map, track: meta.track, max: ROOM_MAX,
      pilots: others.map((p) => ({ slot: p.slot, name: p.name })),
    }));
    // Late join: each pilot's current pose, before any live one.
    for (const p of others) {
      const pose = this.poses.get(p.slot);
      if (pose) ws.send(pose);
    }
    const hello = JSON.stringify({ type: 'join', slot, name });
    for (const p of others) safeSend(p.ws, hello);
    return 0;
  }

  // A frame from a pilot. Returns how many pilots it went to.
  message(ws, data, now) {
    if (typeof data === 'string') return 0;
    const a = ws.deserializeAttachment();
    if (!a || a.slot == null) return 0;
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.length !== POSE_BYTES) return 0;
    let b = this.buckets.get(a.slot);
    if (!b) { b = { n: BUCKET_MAX, at: now }; this.buckets.set(a.slot, b); }
    b.n = Math.min(BUCKET_MAX, b.n + (now - b.at) * BUCKET_RATE / 1000);
    b.at = now;
    if (b.n < 1) return 0;
    b.n -= 1;
    const frame = new Uint8Array(RELAY_BYTES);
    frame[0] = a.slot;
    frame.set(bytes, 1);
    this.poses.set(a.slot, frame);
    let sent = 0;
    for (const p of this.pilots(ws)) if (safeSend(p.ws, frame)) sent++;
    return sent;
  }

  async leave(ws, now) {
    const a = ws.deserializeAttachment();
    if (!a || a.slot == null) return;
    ws.serializeAttachment({});
    this.poses.delete(a.slot);
    this.buckets.delete(a.slot);
    const others = this.pilots(ws);
    const bye = JSON.stringify({ type: 'leave', slot: a.slot });
    for (const p of others) safeSend(p.ws, bye);
    if (others.length) return;
    const meta = await this.loadMeta();
    if (!meta) return;
    await this.saveMeta({ ...meta, emptySince: now });
    await this.ctx.storage.setAlarm(now + this.ttl);
  }

  async alarm(now) {
    const meta = await this.loadMeta();
    if (!meta) return;
    if (this.pilots().length) { await this.ctx.storage.setAlarm(now + this.ttl); return; }
    if (meta.emptySince == null) {             // emptied without a close
      await this.saveMeta({ ...meta, emptySince: now });
      await this.ctx.storage.setAlarm(now + this.ttl);
      return;
    }
    if (now - meta.emptySince >= this.ttl) await this.expire();
    else await this.ctx.storage.setAlarm(meta.emptySince + this.ttl);
  }
}

function safeSend(ws, data) {
  try { ws.send(data); return true; } catch (e) { return false; }
}

// The Durable Object. The Worker (index.js) reaches it by idFromName(code).
export class Room {
  constructor(state, env) {
    this.state = state;
    this.room = new RoomLogic(state, roomTtl(env));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === '/create' && request.method === 'POST') {
      const spec = await request.json();
      const ok = await this.room.create(spec, now);
      return new Response(JSON.stringify({ ok }), { status: ok ? 201 : 409 });
    }
    if (url.pathname === '/info') {
      const info = await this.room.info(now);
      return new Response(JSON.stringify(info ? { ok: true, ...info } : { ok: false, reason: 'NO SUCH ROOM' }),
        { status: info ? 200 : 404 });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // A refusal is still a WebSocket, closed at once, so it reaches the page
      // as a close code (4404, 4409) rather than a bare failed handshake. It
      // is not one of the room's (no hibernation, no attachment).
      const refused = await this.room.admit(now);
      if (refused) {
        server.accept();
        server.close(refused, refused === CLOSE_FULL ? 'room full' : 'no such room');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.state.acceptWebSocket(server);
      await this.room.join(server, url.searchParams.get('name'), now);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  webSocketMessage(ws, data) {
    this.room.message(ws, data, Date.now());
  }

  async webSocketClose(ws, code) {
    await this.room.leave(ws, Date.now());
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) { /* already closed */ }
  }

  async webSocketError(ws) {
    await this.room.leave(ws, Date.now());
  }

  async alarm() {
    await this.room.alarm(Date.now());
  }
}
