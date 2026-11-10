// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// "Fly my line": a finished run as a link. The map and track ride in the query
// (sim.html?map=..&track=..) and the pilot's ghost in the fragment
// (#line=<code>), which is never sent to a server.
//
// A line code is the ghost resampled at a fixed rate and packed: a small JSON
// header (track, pilot name, time, physics version, rate), then the positions
// as second differences of small steps in varints and the attitudes as their
// three smaller parts in signed bytes; deflated where the browser can, then
// base64url.
//   L1.<base64url>   deflate-raw
//   L0.<base64url>   not compressed (no CompressionStream)
//   @<id>            stored on the leaderboard Worker (POST /api/line), for a
//                    code too long for a link
// The Worker bundles this file, so the page and the Worker read a code the
// same way. No imports: what comes out of a code is checked by the caller
// with sim-retention.js (ghostPayloadError, fromShareTrackPayload).

export const LINE_PARAM = 'line';
// A link that every chat app and browser takes whole.
export const LINE_URL_MAX = 2000;
// What the Worker stores: 1500 samples, with room.
export const LINE_CODE_MAX = 24000;
// The rates a link tries, best first: the first whose link fits LINE_URL_MAX.
export const LINE_RATES_HZ = Object.freeze([10, 7.5, 5]);
export const LINE_SAMPLES_MAX = 1500;
export const LINE_ID_RE = /^[A-Za-z0-9_-]{10,32}$/;
const CODE_RE = /^L[01]\.[A-Za-z0-9_-]+$/;
// A link is opened with one click, and what it carries reaches the page's
// menus: a track id is plain (as every id the sim makes), and a track's name
// is letters, digits, spaces and . _ - only.
const TRACK_ID_RE = /^[A-Za-z0-9_.:-]{1,47}$/;
const POS_STEP = 0.02;              // scene units (3.5 to the metre): about 6 mm
const Q_SCALE = 127 / Math.SQRT1_2;  // the three smaller parts of a unit quaternion are within 0.7072
const FORMAT = 1;

// ---- resample ----

// The ghost ([t ms, x, y, z, qx, qy, qz, qw] rows, t rising) at a fixed step
// from its first sample to its last: { startMs, endMs, dtMs, rows } with rows
// of [x, y, z, qx, qy, qz, qw]. Positions are interpolated straight and
// attitudes along the shorter way; the last row is the last sample.
export function resampleGhost(samples, dtMs) {
  const src = samples || [];
  const startMs = src[0][0];
  const endMs = src[src.length - 1][0];
  const dt = Math.max(1, Math.round(dtMs));
  const rows = [];
  let j = 0;
  const at = (t) => {
    while (j < src.length - 2 && src[j + 1][0] <= t) j++;
    const a = src[j];
    const b = src[Math.min(j + 1, src.length - 1)];
    const span = b[0] - a[0];
    const u = span > 0 ? Math.min(1, Math.max(0, (t - a[0]) / span)) : 0;
    const dot = a[4] * b[4] + a[5] * b[5] + a[6] * b[6] + a[7] * b[7];
    const sgn = dot < 0 ? -1 : 1;
    const q = [4, 5, 6, 7].map((k) => a[k] + (sgn * b[k] - a[k]) * u);
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u, q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  };
  for (let t = startMs; t < endMs; t += dt) rows.push(at(t));
  rows.push(at(endMs));
  return { startMs, endMs, dtMs: dt, rows };
}

// ---- bytes ----

function pushVarint(out, n) {
  let v = n < 0 ? -2 * n - 1 : 2 * n;       // zigzag
  while (v >= 0x80) { out.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
  out.push(v);
}

function readVarint(bytes, pos) {
  let v = 0, mul = 1, i = pos;
  for (;;) {
    if (i >= bytes.length) throw new Error('BAD LINE CODE');
    const b = bytes[i++];
    v += (b & 0x7f) * mul;
    if (b < 0x80) break;
    mul *= 0x80;
    if (mul > 0x800000000) throw new Error('BAD LINE CODE');
  }
  return { value: v % 2 ? -(v + 1) / 2 : v / 2, next: i };
}

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

// The bytes of a line: { ghost, trackPayload } at hz. ghost is a checked ghost
// payload ({ track, name, lapTime, phys, samples }); trackPayload, if given, is
// a track the other end cannot know by its id (a custom one), as
// sim-retention.js shareTrackPayload makes it, sent with the ghost.
export function packLine({ ghost, trackPayload } = {}, hz = LINE_RATES_HZ[0]) {
  const g = ghost || {};
  if (!Array.isArray(g.samples) || g.samples.length < 2) throw new Error('NO RUN TO SHARE');
  const span = g.samples[g.samples.length - 1][0] - g.samples[0][0];
  // Never more than LINE_SAMPLES_MAX rows: a long run takes a longer step.
  const dtMs = Math.max(Math.round(1000 / hz), Math.ceil(span / (LINE_SAMPLES_MAX - 2) / 10) * 10);
  const r = resampleGhost(g.samples, dtMs);
  const head = { t: g.track, n: String(g.name || ''), l: Math.round(g.lapTime) || 0, p: g.phys, s: r.startMs, e: r.endMs, d: r.dtMs, c: r.rows.length };
  if (trackPayload) head.tr = trackPayload;
  const headBytes = utf8.encode(JSON.stringify(head));
  if (headBytes.length > 0xffff) throw new Error('LINE TOO LARGE');
  const out = [FORMAT, headBytes.length & 0xff, headBytes.length >> 8];
  for (const b of headBytes) out.push(b);
  for (const axis of [0, 1, 2]) {
    let prev = 0, prevDelta = 0;
    for (const row of r.rows) {
      const v = Math.round(row[axis] / POS_STEP);
      const delta = v - prev;
      pushVarint(out, delta - prevDelta);
      prev = v;
      prevDelta = delta;
    }
  }
  // Attitudes, "smallest three": which part is the largest (kept positive, so
  // it is the root of what the others leave), then the other three.
  const big = r.rows.map((row) => {
    let k = 3;
    for (let i = 4; i < 7; i++) if (Math.abs(row[i]) > Math.abs(row[k])) k = i;
    return k;
  });
  for (const k of big) out.push(k - 3);
  for (let part = 0; part < 3; part++) {
    r.rows.forEach((row, i) => {
      const k = [3, 4, 5, 6].filter((x) => x !== big[i])[part];
      const v = Math.max(-127, Math.min(127, Math.round((row[big[i]] < 0 ? -row[k] : row[k]) * Q_SCALE)));
      out.push(v & 0xff);
    });
  }
  return Uint8Array.from(out);
}

const round = (v, k) => Math.round(v * k) / k;

// The { ghost, trackPayload } of a line's bytes: ghost a ghost payload as the
// page stores them, still to be checked by the caller; throws on bytes that
// are not a line.
export function unpackLine(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== FORMAT) throw new Error('BAD LINE CODE');
  const headLen = bytes[1] | (bytes[2] << 8);
  let pos = 3 + headLen;
  if (pos > bytes.length) throw new Error('BAD LINE CODE');
  let head = null;
  try { head = JSON.parse(utf8d.decode(bytes.subarray(3, pos))); } catch (e) { head = null; }
  const n = head && head.c;
  if (!head || !Number.isInteger(n) || n < 2 || n > LINE_SAMPLES_MAX + 2) throw new Error('BAD LINE CODE');
  if (!(head.d >= 1 && head.d <= 60000 && head.s >= 0 && head.e >= head.s)) throw new Error('BAD LINE CODE');
  const cols = [];
  for (let axis = 0; axis < 3; axis++) {
    const col = new Array(n);
    let prev = 0, prevDelta = 0;
    for (let i = 0; i < n; i++) {
      const r = readVarint(bytes, pos);
      pos = r.next;
      prevDelta += r.value;
      prev += prevDelta;
      col[i] = prev * POS_STEP;
    }
    cols.push(col);
  }
  if (pos + 4 * n !== bytes.length) throw new Error('BAD LINE CODE');
  const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const big = bytes[pos + i];
    if (big > 3) throw new Error('BAD LINE CODE');
    const three = [1, 2, 3].map((k) => { const b = bytes[pos + k * n + i]; return (b > 127 ? b - 256 : b) / Q_SCALE; });
    const q = [0, 0, 0, 0];
    let part = 0;
    for (let k = 0; k < 4; k++) if (k !== big) q[k] = three[part++];
    q[big] = Math.sqrt(Math.max(0, 1 - three[0] * three[0] - three[1] * three[1] - three[2] * three[2]));
    const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    samples[i] = [Math.min(head.s + i * head.d, head.e), round(cols[0][i], 100), round(cols[1][i], 100), round(cols[2][i], 100),
      round(q[0] / len, 1000), round(q[1] / len, 1000), round(q[2] / len, 1000), round(q[3] / len, 1000)];
  }
  if (typeof head.t === 'string' ? !TRACK_ID_RE.test(head.t) : !(head.t === 0 || head.t === 1)) throw new Error('BAD LINE CODE');
  const ghost = { v: 1, phys: head.p, track: head.t, name: String(head.n || '').slice(0, 64), lapTime: +head.l || 0, samples };
  let trackPayload = null;
  if (head.tr && typeof head.tr === 'object') {
    // Its own track: the one the ghost names, on a plainly named map.
    if (String(head.tr.id) !== String(head.t) || !TRACK_ID_RE.test(String(head.tr.m || ''))) throw new Error('BAD LINE CODE');
    trackPayload = { ...head.tr, n: String(head.tr.n || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 32) };
  }
  return { ghost, trackPayload };
}

// ---- text ----

function toBase64Url(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function through(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// The line as a code, at hz. compress false: never deflated (L0).
export async function encodeLineCode(line, hz = LINE_RATES_HZ[0], { compress = true } = {}) {
  const bytes = packLine(line, hz);
  if (compress && typeof CompressionStream === 'function') {
    try { return 'L1.' + toBase64Url(await through(bytes, new CompressionStream('deflate-raw'))); }
    catch (e) { /* this browser has no deflate-raw: the plain form */ }
  }
  return 'L0.' + toBase64Url(bytes);
}

// A code back to { ghost, trackPayload } (unpackLine). Throws on a bad code.
export async function decodeLineCode(code) {
  const s = String(code || '').trim();
  if (!CODE_RE.test(s) || s.length > LINE_CODE_MAX) throw new Error('BAD LINE CODE');
  let bytes = null;
  try {
    bytes = fromBase64Url(s.slice(3));
    if (s[1] === '1') bytes = await through(bytes, new DecompressionStream('deflate-raw'));
  } catch (e) { throw new Error('BAD LINE CODE'); }
  if (bytes.length > 200000) throw new Error('BAD LINE CODE');
  return unpackLine(bytes);
}

// ---- the link ----

// origin + path is the sim page; code is a line code, or '@' + a Worker id.
export function lineLink({ origin, path, map, track, dev, code } = {}) {
  const q = [];
  if (map) q.push('map=' + encodeURIComponent(map));
  if (track != null && track !== '') q.push('track=' + encodeURIComponent(track));
  if (dev) q.push('dev=1');
  return String(origin || '') + String(path || '/sim.html') + (q.length ? '?' + q.join('&') : '') + '#' + LINE_PARAM + '=' + code;
}

// The code (or '@id') in a location's fragment, or null.
export function lineFromHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  for (const part of h.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === LINE_PARAM) {
      let v = part.slice(eq + 1);
      try { v = decodeURIComponent(v); } catch (e) { /* as it is */ }
      if (CODE_RE.test(v) || (v[0] === '@' && LINE_ID_RE.test(v.slice(1)))) return v;
      return null;
    }
  }
  return null;
}

// The best code for a link to the page at base (lineLink's arguments, less
// code): the highest rate whose whole link fits LINE_URL_MAX. fits false: none
// did, and code is the full-rate one, for the Worker.
export async function lineForLink(line, base, { max = LINE_URL_MAX, compress = true } = {}) {
  let full = null;
  for (const hz of LINE_RATES_HZ) {
    const code = await encodeLineCode(line, hz, { compress });
    if (!full) full = code;
    const link = lineLink({ ...base, code });
    if (link.length <= max) return { fits: true, hz, code, link };
  }
  return { fits: false, hz: LINE_RATES_HZ[0], code: full, link: lineLink({ ...base, code: full }) };
}

// The Worker's id for a code: from its content, so the same line is the same id.
export async function lineIdOf(code) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(String(code))));
  return toBase64Url(hash.subarray(0, 12));
}

// "Race RyFly's line"; a pilot who never set a name (PILOT): "Race this line".
export function lineBannerText(name) {
  const n = String(name == null ? '' : name).trim() || 'PILOT';
  return n === 'PILOT' ? 'Race this line' : 'Race ' + n + "'s line";
}
