// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim — ghost rooms: up to ROOM_MAX pilots fly one map together.
// No racing, no collision between quads, no timing, no boards: each pilot
// sees the others as ghost quads with name tags. A room is one Cloudflare
// Durable Object (workers/sim-rooms); this file is what both sides share
// (codes, the wire format) and the page's client (the socket, and the
// interpolation the page renders from).
//   code     4 letters, no I or O (ROOM_CODE_LETTERS), made by the Worker on
//            Create; the room lives until ROOM_TTL_MS after its last pilot
//            leaves.
//   map      the host's map, on its freestyle track (v1 is freestyle only).
//            Joining puts the pilot there.
//   pose     each pilot sends {t, pos[3], quat[4], rpm[4]} at POSE_HZ as one
//            binary frame of POSE_BYTES; the room relays it to the others
//            with the sender's slot in front (RELAY_BYTES), and keeps the
//            latest per pilot for whoever joins next.
//              t     uint16, the sender's clock in ms (wraps; unwrapped here)
//              pos   3 x int16, world units x posUnitsPerWu(map) (render
//                    frame, Y up, as the ghosts record it)
//              quat  smallest three: 2 bits for the largest component, then
//                    3 x 15 bits, in 6 bytes
//              rpm   4 x uint8, RPM_UNIT rpm a step
//            18 bytes up, 19 down: under 2 KB/s a pilot, up and down
//            together, in a full room (README in workers/sim-rooms).
//   render   remote poses are render-only: they move ghost meshes and drive
//            the remote motor voices, and never reach sim-core.
// No imports: the Worker bundles this file as it is.

export const ROOM_MAX = 4;
export const POSE_HZ = 20;
export const ROOM_TTL_MS = 10 * 60 * 1000;
export const ROOM_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LEN = 4;
export const POSE_BYTES = 18;
export const RELAY_BYTES = POSE_BYTES + 1;
export const RPM_UNIT = 400;              // uint8: 0 to 102 krpm
export const INTERP_DELAY_MS = 100;       // two poses behind the newest
export const STALE_MS = 3000;             // no pose for this long: hide the ghost
export const NAME_MAX = 16;
// Close codes the room sends (4000-4999 reach the page's onclose).
export const CLOSE_NO_ROOM = 4404;
export const CLOSE_FULL = 4409;
export const CLOSE_BAD = 4400;
export const ROOMS_URL = 'https://sim-rooms.ryan-roths.workers.dev';
export const ROOMS_URL_KEY = 'quadmathSimRoomsUrl';

const CODE_RE = new RegExp('^[' + ROOM_CODE_LETTERS + ']{' + ROOM_CODE_LEN + '}$');
const MAP_RE = /^[a-z][a-z0-9-]{0,31}$/;

export function normalizeRoomCode(raw) {
  const s = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z]/g, '');
  return CODE_RE.test(s) ? s : null;
}

// rand() in [0, 1); the Worker passes one off crypto.getRandomValues.
export function randomRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    s += ROOM_CODE_LETTERS[Math.min(ROOM_CODE_LETTERS.length - 1, Math.floor(rand() * ROOM_CODE_LETTERS.length))];
  }
  return s;
}

export function validMapId(map) {
  return typeof map === 'string' && MAP_RE.test(map);
}

// v1 rooms fly the map's freestyle track (sim-tracks.js freestyleIdFor).
export function roomTrackFor(map) {
  return map + '-freestyle';
}

// Position resolution, per map: the city is 1400 world units across, the
// indoor maps a few dozen. int16 holds +-32767 steps.
export function posUnitsPerWu(map) {
  return map === 'city' ? 32 : 256;
}

// Shown on name tags: letters, digits, space . - _ (as pilot names on the
// boards), at most NAME_MAX.
export function roomPilotName(raw, fallback = 'PILOT') {
  const out = [];
  for (const ch of String(raw == null ? '' : raw).normalize('NFC')) {
    let ok = ch === ' ' || ch === '.' || ch === '-' || ch === '_';
    if (!ok) {
      try { ok = /\p{L}|\p{N}/u.test(ch); } catch (e) { ok = /[A-Za-z0-9]/.test(ch); }
    }
    if (ok) out.push(ch);
    if (out.length >= NAME_MAX) break;
  }
  return out.join('').trim() || fallback;
}

function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

const Q15 = 16383;                        // 15-bit signed range for the small three
const QMAX = Math.SQRT1_2;                // the small three are within +-1/sqrt(2)
const TWO15 = 32768;
const TWO32 = 4294967296;

// Encode one pose into POSE_BYTES at `offset` of a DataView (or a fresh
// buffer when `view` is null). Returns the view's buffer.
export function encodePose(pose, unitsPerWu, view = null, offset = 0) {
  const dv = view || new DataView(new ArrayBuffer(POSE_BYTES));
  const o = offset;
  dv.setUint16(o, (Math.round(pose.t) & 0xffff) >>> 0, true);
  for (let i = 0; i < 3; i++) {
    const v = Math.round((+pose.pos[i] || 0) * unitsPerWu);
    dv.setInt16(o + 2 + 2 * i, clamp(v, -32767, 32767), true);
  }
  let qx = +pose.quat[0] || 0, qy = +pose.quat[1] || 0, qz = +pose.quat[2] || 0, qw = +pose.quat[3];
  if (!Number.isFinite(qw)) qw = 1;
  const n = Math.hypot(qx, qy, qz, qw) || 1;
  const q = [qx / n, qy / n, qz / n, qw / n];
  let big = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(q[i]) > Math.abs(q[big])) big = i;
  const sign = q[big] < 0 ? -1 : 1;     // q and -q are one rotation: keep the largest positive
  let packed = big;
  for (let i = 0; i < 4; i++) {
    if (i === big) continue;
    const s = Math.round(clamp(sign * q[i] / QMAX, -1, 1) * Q15) + Q15 + 1; // 1..32767
    packed = packed * TWO15 + s;
  }
  dv.setUint16(o + 8, Math.floor(packed / TWO32), true);
  dv.setUint32(o + 10, packed % TWO32, true);
  for (let i = 0; i < 4; i++) {
    const r = Math.round(Math.abs(+pose.rpm[i] || 0) / RPM_UNIT);
    dv.setUint8(o + 14 + i, clamp(r, 0, 255));
  }
  return dv.buffer;
}

// Decode POSE_BYTES at `offset` of a DataView. `out` is reused when given.
export function decodePose(view, unitsPerWu, offset = 0, out = null) {
  const p = out || { t: 0, pos: [0, 0, 0], quat: [0, 0, 0, 1], rpm: [0, 0, 0, 0] };
  const o = offset;
  p.t = view.getUint16(o, true);
  for (let i = 0; i < 3; i++) p.pos[i] = view.getInt16(o + 2 + 2 * i, true) / unitsPerWu;
  let packed = view.getUint16(o + 8, true) * TWO32 + view.getUint32(o + 10, true);
  const small = [0, 0, 0];
  for (let k = 2; k >= 0; k--) {
    small[k] = ((packed % TWO15) - Q15 - 1) / Q15 * QMAX;
    packed = Math.floor(packed / TWO15);
  }
  const big = packed & 3;
  let sum = 0, k = 0;
  for (let i = 0; i < 4; i++) {
    if (i === big) continue;
    p.quat[i] = small[k++];
    sum += p.quat[i] * p.quat[i];
  }
  p.quat[big] = Math.sqrt(Math.max(0, 1 - sum));
  for (let i = 0; i < 4; i++) p.rpm[i] = view.getUint8(o + 14 + i) * RPM_UNIT;
  return p;
}

// ---------- Interpolation ----------
// One remote pilot's recent poses. Each pose is placed on this page's clock
// by the smallest (arrival - t) seen, drifting up slowly, so network jitter
// does not shake the ghost; it is drawn INTERP_DELAY_MS behind that, between
// the two poses around it. Past the newest pose it holds there.
const TRACK_KEEP = 24;
const OFFSET_DRIFT = 0.02;
const GAP_RESET_MS = 2000;                // a gap this long: start the track over

export function createPoseTrack() {
  return { samples: [], raw: null, last: null, offset: null, arrival: -Infinity };
}

export function pushPose(track, pose, arrivalMs) {
  if (arrivalMs - track.arrival > GAP_RESET_MS) {
    track.samples.length = 0;
    track.raw = null;
    track.last = null;
    track.offset = null;
  }
  let t;
  if (track.raw == null) t = pose.t;
  else {
    let d = (pose.t - track.raw) & 0xffff;
    if (d >= 0x8000) d -= 0x10000;
    t = track.last + d;
  }
  if (track.last != null && t <= track.last) return false; // a repeat, or out of order
  track.raw = pose.t;
  track.last = t;
  track.arrival = arrivalMs;
  const off = arrivalMs - t;
  if (track.offset == null || off < track.offset) track.offset = off;
  else track.offset += (off - track.offset) * OFFSET_DRIFT;
  track.samples.push({ t, pos: pose.pos.slice(), quat: pose.quat.slice(), rpm: pose.rpm.slice() });
  if (track.samples.length > TRACK_KEEP) track.samples.shift();
  return true;
}

function slerp(a, b, f, out) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let wa, wb;
  if (dot > 0.9995) { wa = 1 - f; wb = f; }
  else {
    const th = Math.acos(dot), s = Math.sin(th);
    wa = Math.sin((1 - f) * th) / s;
    wb = Math.sin(f * th) / s;
  }
  out[0] = a[0] * wa + bx * wb;
  out[1] = a[1] * wa + by * wb;
  out[2] = a[2] * wa + bz * wb;
  out[3] = a[3] * wa + bw * wb;
  const n = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  for (let i = 0; i < 4; i++) out[i] /= n;
  return out;
}

// The pose to draw at page time nowMs, into `out`; null before the first pose.
// out.stale: nothing heard for STALE_MS.
export function samplePoseTrack(track, nowMs, out = null) {
  const s = track.samples;
  if (!s.length) return null;
  const o = out || { pos: [0, 0, 0], quat: [0, 0, 0, 1], rpm: [0, 0, 0, 0], stale: false };
  const tr = nowMs - INTERP_DELAY_MS - track.offset;
  let a = s[0], b = s[0];
  if (tr >= s[s.length - 1].t) a = b = s[s.length - 1];
  else if (tr > s[0].t) {
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].t <= tr) { a = s[i - 1]; b = s[i]; break; }
    }
  }
  const span = b.t - a.t;
  const f = span > 0 ? clamp((tr - a.t) / span, 0, 1) : 0;
  for (let i = 0; i < 3; i++) o.pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * f;
  slerp(a.quat, b.quat, f, o.quat);
  for (let i = 0; i < 4; i++) o.rpm[i] = a.rpm[i] + (b.rpm[i] - a.rpm[i]) * f;
  o.stale = nowMs - track.arrival > STALE_MS;
  return o;
}

// ---------- Where the rooms Worker is ----------
function isLocalPlace(loc) {
  if (!loc) return false;
  const host = String(loc.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

// ?rooms=<url> (localhost pages only, http allowed there for wrangler dev),
// then localStorage ROOMS_URL_KEY (https, or http on a localhost page), then
// ROOMS_URL.
export function roomsUrl(storage, loc) {
  const place = loc || (typeof location !== 'undefined' ? location : null);
  const local = isLocalPlace(place);
  const ok = (u) => !!u && (/^https:\/\//i.test(u) || (local && /^http:\/\//i.test(u)));
  try {
    if (local && place.search) {
      const q = new URLSearchParams(place.search).get('rooms');
      if (ok(q)) return q.replace(/\/+$/, '');
    }
  } catch (e) { /* ignore */ }
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const s = store && store.getItem(ROOMS_URL_KEY);
    if (ok(s)) return s.replace(/\/+$/, '');
  } catch (e) { /* ignore */ }
  return ROOMS_URL;
}

// No name: the room names the pilot (PILOT 2).
export function roomSocketUrl(base, code, name) {
  return base.replace(/^http/i, 'ws') + '/rooms/' + code + '/ws?name=' + encodeURIComponent(roomPilotName(name, ''));
}

async function replyJson(res) {
  let body = null;
  try { body = await res.json(); } catch (e) { /* not JSON */ }
  return body || {};
}

// POST /rooms: a new room on `map`. Resolves {code, map, track}.
export async function createRoom(base, map, fetchFn = fetch) {
  const res = await fetchFn(base + '/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map }),
  });
  const body = await replyJson(res);
  if (!res.ok || !body.ok) throw new Error(body.reason || ('ROOMS ' + res.status));
  return { code: body.code, map: body.map, track: body.track };
}

// GET /rooms/CODE: {code, map, track, pilots, max}; throws NO SUCH ROOM.
export async function roomInfo(base, code, fetchFn = fetch) {
  const res = await fetchFn(base + '/rooms/' + code);
  const body = await replyJson(res);
  if (!res.ok || !body.ok) throw new Error(body.reason || ('ROOMS ' + res.status));
  return body;
}

export function closeReason(code) {
  if (code === CLOSE_FULL) return 'ROOM FULL';
  if (code === CLOSE_NO_ROOM) return 'NO SUCH ROOM';
  if (code === CLOSE_BAD) return 'BAD REQUEST';
  return 'ROOM CLOSED';
}

// ---------- The client ----------
// openRoom({base, code, name, WebSocket, now, onEvent}) connects and resolves
// once the room's welcome arrives (rejects with the close reason otherwise).
// onEvent gets {type: 'join'|'leave'|'closed', ...} after that.
//   room.sendPose({t, pos, quat, rpm})   at POSE_HZ, from the page's timer
//   room.slot, room.name                 this pilot's, as the room has them
//   room.pilots                          Map slot -> {slot, name, track}
//   room.sample(slot, nowMs, out)        the pose to draw
//   room.bytes                           {up, down}: payload bytes so far
export function openRoom(opts) {
  const WS = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const onEvent = opts.onEvent || (() => {});
  const ws = new WS(roomSocketUrl(opts.base, opts.code, opts.name));
  ws.binaryType = 'arraybuffer';
  const pilots = new Map();
  const bytes = { up: 0, down: 0 };
  const sendView = new DataView(new ArrayBuffer(POSE_BYTES));
  const scratch = { t: 0, pos: [0, 0, 0], quat: [0, 0, 0, 1], rpm: [0, 0, 0, 0] };
  let units = 256;
  let welcomed = false;
  let closed = false;
  const room = {
    code: opts.code, slot: -1, name: '', map: null, track: null, max: ROOM_MAX,
    pilots, bytes, ws,
    get open() { return welcomed && !closed; },
    sendPose(pose) {
      if (!welcomed || closed || ws.readyState !== 1) return false;
      encodePose(pose, units, sendView, 0);
      ws.send(sendView.buffer);
      bytes.up += POSE_BYTES;
      return true;
    },
    sample(slot, nowMs, out) {
      const p = pilots.get(slot);
      return p ? samplePoseTrack(p.track, nowMs, out) : null;
    },
    close() {
      if (closed) return;
      closed = true;
      try { ws.close(1000, 'leave'); } catch (e) { /* ignore */ }
    },
  };
  const addPilot = (slot, name) => {
    if (slot === room.slot) return null;
    const p = { slot, name: roomPilotName(name), track: createPoseTrack() };
    pilots.set(slot, p);
    return p;
  };
  return new Promise((resolve, reject) => {
    ws.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data === 'string') {
        bytes.down += data.length;
        let m = null;
        try { m = JSON.parse(data); } catch (e) { return; }
        if (!m || typeof m !== 'object') return;
        if (m.type === 'welcome' && !welcomed) {
          welcomed = true;
          room.slot = m.slot;
          room.name = roomPilotName(m.name);
          room.code = m.code || room.code;
          room.map = m.map;
          room.track = m.track;
          room.max = m.max || ROOM_MAX;
          units = posUnitsPerWu(m.map);
          for (const p of m.pilots || []) addPilot(p.slot, p.name);
          resolve(room);
        } else if (m.type === 'join' && welcomed) {
          const p = addPilot(m.slot, m.name);
          if (p) onEvent({ type: 'join', slot: p.slot, name: p.name });
        } else if (m.type === 'leave' && welcomed) {
          const p = pilots.get(m.slot);
          pilots.delete(m.slot);
          if (p) onEvent({ type: 'leave', slot: p.slot, name: p.name });
        }
        return;
      }
      const buf = data instanceof ArrayBuffer ? data : (data && data.buffer) || null;
      if (!buf || !welcomed) return;
      const len = data.byteLength;
      bytes.down += len;
      if (len !== RELAY_BYTES) return;
      const dv = data instanceof ArrayBuffer ? new DataView(data) : new DataView(data.buffer, data.byteOffset, len);
      const slot = dv.getUint8(0);
      const p = pilots.get(slot);
      if (!p) return;
      decodePose(dv, units, 1, scratch);
      pushPose(p.track, scratch, now());
    };
    ws.onclose = (ev) => {
      const wasOpen = welcomed && !closed;
      closed = true;
      const reason = closeReason(ev && ev.code);
      if (!welcomed) reject(new Error(ev && ev.code ? reason : 'ROOMS OFFLINE'));
      else onEvent({ type: 'closed', code: ev && ev.code, reason, byUs: !wasOpen });
    };
    ws.onerror = () => { /* onclose follows with the code */ };
  });
}
