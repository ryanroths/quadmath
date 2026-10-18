// QuadMath sim — freestyle trick score + combo.
// Maneuver classifier: one rotation segment → exactly one label (most specific
// wins). Ideas only from public FPV usage — nothing here is copied from WebFPV (GPL).
// Style is Neon Current (docs/sim-art-direction.md): magenta / cyan / ember.
// Definitions + decision boundaries: docs/sim-tricks.md.
// New localStorage key only: quadmathSimTricks. Do not write old ryfly* keys.
// Nothing here is copied from WebFPV (GPL).
// This file has no sim-*.js imports. Do not change flight physics.

export const TRICKS_KEY = 'quadmathSimTricks';
export const STORE_VER = 1;
export const COMBO_WINDOW_S = 2.8;
export const MUL_CAP = 6;
export const LOCKOUT_S = 0.45;
export const RATE_START = 2.05;
export const RATE_END = 1.15;
export const SETTLE_S = 0.16;
export const MANEUVER_MAX_S = 2.45;
export const DEAD = 1.15;

export const TRICK_LIST = Object.freeze([
  Object.freeze({ id: 'flip', name: 'Flip', points: 200 }),
  Object.freeze({ id: 'roll', name: 'Roll', points: 200 }),
  Object.freeze({ id: 'yawspin', name: 'Yaw Spin', points: 250 }),
  Object.freeze({ id: 'powerloop', name: 'Power Loop', points: 450 }),
  Object.freeze({ id: 'splits', name: 'Split-S', points: 400 }),
  Object.freeze({ id: 'matty', name: 'Matty Flip', points: 600 }),
  Object.freeze({ id: 'halfmatty', name: 'Half Matty', points: 350 }),
  Object.freeze({ id: 'maverick', name: 'Maverick', points: 650 }),
  Object.freeze({ id: 'trippy', name: 'Trippy Spin', points: 400 }),
  Object.freeze({ id: 'hang', name: 'Inverted Hang', points: 300 }),
  Object.freeze({ id: 'dive', name: 'Dive', points: 350 }),
  Object.freeze({ id: 'gap', name: 'Gap Thread', points: 500 }),
  Object.freeze({ id: 'prox', name: 'Proximity', points: 280 }),
]);

const BY_ID = Object.create(null);
for (let i = 0; i < TRICK_LIST.length; i++) BY_ID[TRICK_LIST[i].id] = TRICK_LIST[i];
export const TRICK_BY_ID = BY_ID;

const HANG_S = 0.75;
const DIVE_DROP = 3.4;
const DIVE_VZ = -6.5;
const GAP_UP_W = 14;
const GAP_LAT_W = 7;
const GAP_TRAVEL_W = 4.2;
const PROX_M = 0.42;
const PROX_SPD = 7.5;
const COMBO_IDS = 16;
const PI = Math.PI;
const TAU = PI * 2;
const HALF = PI * 0.92;
const FULL = 5.2;
const CLASS_IDS = ['trippy', 'maverick', 'powerloop', 'matty', 'halfmatty', 'splits', 'flip', 'roll', 'yawspin'];
const SPEC = {
  trippy: 0.10, maverick: 0.11, powerloop: 0.11, matty: 0.11,
  halfmatty: 0.09, splits: 0.10, flip: 0, roll: 0, yawspin: 0,
};

function makeDlt() { return { r: 0, p: 0, y: 0 }; }
function makeClr() { return { up: 50, dn: 50, px: 50, nx: 50, pz: 50, nz: 50, near: 50 }; }

export function trickById(id) {
  return BY_ID[id] || null;
}

export function formatScore(n) {
  const v = Math.max(0, Math.floor(n || 0));
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (v < 100000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(v / 1000) + 'k';
}

export function formatScoreFull(n) {
  const v = Math.max(0, Math.floor(n || 0));
  const s = String(v);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return out;
}

export function comboMul(count) {
  if (count <= 1) return 1;
  const m = 1 + 0.5 * (count - 1);
  return m > MUL_CAP ? MUL_CAP : m;
}

export function varietyMul(priorSame) {
  if (priorSame <= 0) return 1;
  if (priorSame === 1) return 0.55;
  return 0.3;
}

export function uniqueBonus(uniqueN) {
  if (uniqueN >= 5) return 1.2;
  if (uniqueN >= 3) return 1.1;
  return 1;
}

export function scoreTrick(id, priorSame, chainCount, uniqueN) {
  const def = BY_ID[id];
  if (!def) return 0;
  const pts = def.points * varietyMul(priorSame) * comboMul(chainCount) * uniqueBonus(uniqueN);
  return Math.max(1, Math.round(pts));
}

export function upZParts(x, y) {
  return 1 - 2 * (x * x + y * y);
}

export function headingParts(x, y, z, w) {
  const fx = 1 - 2 * (y * y + z * z);
  const fy = 2 * (x * y + w * z);
  return Math.atan2(fy, fx);
}

export function bodyFwdParts(x, y, z, w, out) {
  const o = out || { x: 0, y: 0, z: 0 };
  o.x = 1 - 2 * (y * y + z * z);
  o.y = 2 * (x * y + w * z);
  o.z = 2 * (x * z - w * y);
  return o;
}

export function upZOf(q) {
  if (!q) return 1;
  return upZParts(q.x || q.qx || 0, q.y || q.qy || 0);
}

export function headingOf(q) {
  return headingParts(q.x || q.qx || 0, q.y || q.qy || 0, q.z || q.qz || 0, q.w || q.qw || 1);
}

export function unwrapDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function bodyDeltaParts(ax, ay, az, aw, bx, by, bz, bw, out) {
  const o = out || makeDlt();
  const cx = -ax, cy = -ay, cz = -az, cw = aw;
  let x = cw * bx + cx * bw + cy * bz - cz * by;
  let y = cw * by - cx * bz + cy * bw + cz * bx;
  let z = cw * bz + cx * by - cy * bx + cz * bw;
  let w = cw * bw - cx * bx - cy * by - cz * bz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-12) { o.r = 0; o.p = 0; o.y = 0; return o; }
  const ang = 2 * Math.atan2(s, w);
  const k = ang / s;
  o.r = x * k; o.p = y * k; o.y = z * k;
  return o;
}

export function bodyDelta(q0, q1, out) {
  if (!q0 || !q1) {
    const o = out || makeDlt();
    o.r = 0; o.p = 0; o.y = 0;
    return o;
  }
  return bodyDeltaParts(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w, out);
}

export function scanClearance(wx, wy, wz, colliders, out) {
  const o = out || makeClr();
  o.up = 50; o.dn = wy; o.px = 50; o.nx = 50; o.pz = 50; o.nz = 50; o.near = 50;
  if (!colliders || !colliders.length) return o;
  const n = colliders.length;
  for (let i = 0; i < n; i++) {
    const b = colliders[i];
    if (!b || !b.min || !b.max) continue;
    const min = b.min, max = b.max;
    const dx = wx < min.x ? min.x - wx : (wx > max.x ? wx - max.x : 0);
    const dy = wy < min.y ? min.y - wy : (wy > max.y ? wy - max.y : 0);
    const dz = wz < min.z ? min.z - wz : (wz > max.z ? wz - max.z : 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < o.near) o.near = dist;
    const oy = wy >= min.y - 0.45 && wy <= max.y + 0.45;
    const oz = wz >= min.z - 0.45 && wz <= max.z + 0.45;
    const ox = wx >= min.x - 0.45 && wx <= max.x + 0.45;
    if (oy && oz) {
      if (min.x >= wx) { const d = min.x - wx; if (d < o.px) o.px = d; }
      else if (max.x <= wx) { const d = wx - max.x; if (d < o.nx) o.nx = d; }
    }
    if (ox && oy) {
      if (min.z >= wz) { const d = min.z - wz; if (d < o.pz) o.pz = d; }
      else if (max.z <= wz) { const d = wz - max.z; if (d < o.nz) o.nz = d; }
    }
    if (ox && oz && min.y > wy) {
      const d = min.y - wy; if (d > 0.12 && d < o.up) o.up = d;
    }
  }
  return o;
}

function emptyMapScores() {
  return { bestCombo: 0, bestSession: 0 };
}

export function emptyStore() {
  return { v: STORE_VER, hud: true, debug: false, maps: Object.create(null) };
}

export function normalizeStore(raw) {
  const s = emptyStore();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.hud === false) s.hud = false;
  if (raw.debug === true) s.debug = true;
  const maps = raw.maps;
  if (maps && typeof maps === 'object') {
    for (const k in maps) {
      if (!Object.prototype.hasOwnProperty.call(maps, k)) continue;
      const m = maps[k] || {};
      s.maps[k] = {
        bestCombo: Math.max(0, Math.floor(+m.bestCombo || 0)),
        bestSession: Math.max(0, Math.floor(+m.bestSession || 0)),
      };
    }
  }
  return s;
}

export function loadStore(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return emptyStore();
  try {
    const raw = store.getItem(TRICKS_KEY);
    if (!raw) return emptyStore();
    return normalizeStore(JSON.parse(raw));
  } catch (e) {
    return emptyStore();
  }
}

export function saveStore(state, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  try {
    store.setItem(TRICKS_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function bestForMap(state, mapId) {
  const id = mapId || 'city';
  return (state && state.maps && state.maps[id]) || emptyMapScores();
}

export function recordBest(state, mapId, combo, session) {
  const id = mapId || 'city';
  if (!state.maps[id]) state.maps[id] = emptyMapScores();
  const m = state.maps[id];
  let changed = false;
  if (combo > m.bestCombo) { m.bestCombo = combo; changed = true; }
  if (session > m.bestSession) { m.bestSession = session; changed = true; }
  return changed;
}

export function bestLine(state, mapId) {
  const m = bestForMap(state, mapId);
  if (!m.bestCombo && !m.bestSession) return '—';
  return formatScore(m.bestCombo) + ' · ' + formatScore(m.bestSession);
}

export function makeFeat() {
  return {
    dur: 0, n: 0,
    pitch: 0, roll: 0, yaw: 0,
    pathP: 0, pathR: 0, pathY: 0,
    peakP: 0, peakR: 0, peakY: 0, peakRate: 0,
    alt0: 0, alt1: 0, altMin: 0, altMax: 0,
    h0x: 0, h0z: 0, h1x: 0, h1z: 0, travel: 0, travelH: 0,
    head0: 0, head1: 0,
    followN: 0, againstN: 0, alignN: 0, followSum: 0,
    invFollowN: 0, invAgainstN: 0, invAlignN: 0,
    thrSum: 0, thrN: 0, thrMin: 1, thrMax: 0, thr0: 0, thr1: 0,
    upMin: 1, upMax: -1, invT: 0,
    spd0: 0, spd1: 0, spdPeak: 0, spdMin: 99,
    vzMin: 0, vzMax: 0,
    tRoll180: 99, tPitch180: 99, tYaw180: 99,
  };
}

export function resetFeat(f) {
  f.dur = 0; f.n = 0;
  f.pitch = 0; f.roll = 0; f.yaw = 0;
  f.pathP = 0; f.pathR = 0; f.pathY = 0;
  f.peakP = 0; f.peakR = 0; f.peakY = 0; f.peakRate = 0;
  f.alt0 = 0; f.alt1 = 0; f.altMin = 0; f.altMax = 0;
  f.h0x = 0; f.h0z = 0; f.h1x = 0; f.h1z = 0; f.travel = 0; f.travelH = 0;
  f.head0 = 0; f.head1 = 0;
  f.followN = 0; f.againstN = 0; f.alignN = 0; f.followSum = 0;
  f.invFollowN = 0; f.invAgainstN = 0; f.invAlignN = 0;
  f.thrSum = 0; f.thrN = 0; f.thrMin = 1; f.thrMax = 0; f.thr0 = 0; f.thr1 = 0;
  f.upMin = 1; f.upMax = -1; f.invT = 0;
  f.spd0 = 0; f.spd1 = 0; f.spdPeak = 0; f.spdMin = 99;
  f.vzMin = 0; f.vzMax = 0;
  f.tRoll180 = 99; f.tPitch180 = 99; f.tYaw180 = 99;
  return f;
}

export function copyFeat(src, dst) {
  const d = dst || makeFeat();
  d.dur = src.dur; d.n = src.n;
  d.pitch = src.pitch; d.roll = src.roll; d.yaw = src.yaw;
  d.pathP = src.pathP; d.pathR = src.pathR; d.pathY = src.pathY;
  d.peakP = src.peakP; d.peakR = src.peakR; d.peakY = src.peakY; d.peakRate = src.peakRate;
  d.alt0 = src.alt0; d.alt1 = src.alt1; d.altMin = src.altMin; d.altMax = src.altMax;
  d.h0x = src.h0x; d.h0z = src.h0z; d.h1x = src.h1x; d.h1z = src.h1z;
  d.travel = src.travel; d.travelH = src.travelH;
  d.head0 = src.head0; d.head1 = src.head1;
  d.followN = src.followN; d.againstN = src.againstN; d.alignN = src.alignN; d.followSum = src.followSum;
  d.invFollowN = src.invFollowN; d.invAgainstN = src.invAgainstN; d.invAlignN = src.invAlignN;
  d.thrSum = src.thrSum; d.thrN = src.thrN; d.thrMin = src.thrMin; d.thrMax = src.thrMax; d.thr0 = src.thr0; d.thr1 = src.thr1;
  d.upMin = src.upMin; d.upMax = src.upMax; d.invT = src.invT;
  d.spd0 = src.spd0; d.spd1 = src.spd1; d.spdPeak = src.spdPeak; d.spdMin = src.spdMin;
  d.vzMin = src.vzMin; d.vzMax = src.vzMax;
  d.tRoll180 = src.tRoll180; d.tPitch180 = src.tPitch180; d.tYaw180 = src.tYaw180;
  return d;
}

function atLeast(x, a, fade) {
  if (x >= a) return 1;
  if (x <= a - fade) return 0;
  return (x - (a - fade)) / fade;
}

function atMost(x, a, fade) {
  if (x <= a) return 1;
  if (x >= a + fade) return 0;
  return (a + fade - x) / fade;
}

function inBand(x, lo, hi, fade) {
  return atLeast(x, lo, fade) * atMost(x, hi, fade);
}

function mul() {
  let p = 1;
  for (let i = 0; i < arguments.length; i++) p *= arguments[i];
  return p;
}

export function featView(f) {
  const absP = Math.abs(f.pitch), absR = Math.abs(f.roll), absY = Math.abs(f.yaw);
  const head = Math.abs(unwrapDelta(f.head0, f.head1));
  const span = f.altMax - f.altMin;
  const drop = f.alt0 - f.alt1;
  const align = f.alignN || 0;
  const follow = align ? f.followN / align : 0;
  const against = align ? f.againstN / align : 0;
  const inv = f.dur > 0 ? f.invT / f.dur : 0;
  const hEnd = Math.hypot(f.h1x - f.h0x, f.h1z - f.h0z);
  const close = hEnd / Math.max(f.travelH, 0.35);
  const meanDot = align ? f.followSum / align : 0;
  const invA = f.invAlignN || 0;
  const invFol = invA ? f.invFollowN / invA : 0;
  const invAg = invA ? f.invAgainstN / invA : 0;
  const pathP = f.pathP || 0, pathR = f.pathR || 0, pathY = f.pathY || 0;
  return { absP, absR, absY, head, span, drop, follow, against, inv, close, hEnd, meanDot, invFol, invAg, pathP, pathR, pathY };
}

const _cls = { id: null, why: '', best: 0, second: 0, secondId: '' };
const _sc = Object.create(null);

export function classifyFeat(f, out) {
  const o = out || _cls;
  o.id = null; o.why = ''; o.best = 0; o.second = 0; o.secondId = '';
  if (!f || f.n < 4 || f.dur < 0.12) return o;
  const v = featView(f);
  const absP = v.absP, absR = v.absR, absY = v.absY;
  const tiny = absP < 1.7 && absR < 1.7 && absY < 1.7
    && v.pathP < 1.6 && v.pathR < 1.6 && v.pathY < 1.6 && v.inv < 0.35;
  if (tiny) return o;

  _sc.trippy = mul(
    atLeast(Math.max(absR, v.pathR), 4.0, 0.9),
    atLeast(Math.max(absY, v.pathY), 1.8, 0.7),
    atLeast(f.dur, 0.5, 0.15),
    Math.max(atLeast(v.inv, 0.18, 0.1), atLeast(absR, 5.8, 0.6)),
    atLeast(f.spdPeak, 1.2, 0.5),
    atMost(absP, 5.5, 1.2),
  );
  _sc.maverick = mul(
    atLeast(v.span, 1.6, 0.5),
    atMost(v.close, 0.92, 0.12),
    inBand(v.pathP, 1.6, 5.4, 0.55),
    atMost(absP, 4.3, 0.5),
    atMost(v.inv, 0.20, 0.1),
    atLeast(v.follow, 0.28, 0.12),
    atLeast(f.dur, 0.45, 0.12),
    atLeast(f.spdPeak, 1.6, 0.5),
    atMost(absR, 2.6, 0.8),
  );
  _sc.powerloop = mul(
    atLeast(absP, 4.35, 0.7),
    atLeast(v.span, 1.35, 0.5),
    atLeast(v.invFol - v.invAg, 0.0, 0.15),
    atLeast(v.follow, 0.40, 0.15),
    atMost(v.close, 0.42, 0.15),
    atLeast(f.travelH, 1.0, 0.4),
    atMost(absR, 2.7, 0.8),
    atLeast(v.inv, 0.08, 0.06),
    atMost(v.head, 1.35, 0.5),
    atLeast(f.spdPeak, 2.6, 0.6),
  );
  _sc.matty = mul(
    atLeast(absP, 4.35, 0.7),
    atLeast(v.invAg - v.invFol, 0.05, 0.12),
    atLeast(v.close, 0.50, 0.15),
    atMost(absR, 2.9, 0.8),
    atLeast(f.spdPeak, 2.4, 0.5),
    atLeast(f.travelH, 9.0, 2.2),
  );
  _sc.halfmatty = mul(
    inBand(absP, 2.15, 4.25, 0.45),
    atLeast(Math.max(v.against, v.invAg) - Math.max(v.follow, v.invFol), 0.0, 0.12),
    atLeast(v.head, 1.35, 0.4),
    atMost(absR, 2.15, 0.7),
    atMost(f.tPitch180 - f.tRoll180, 0.05, 0.2),
    atLeast(f.spdPeak, 1.8, 0.5),
  );
  _sc.splits = mul(
    inBand(absR, 1.25, 4.15, 0.45),
    inBand(absP, 1.05, 4.35, 0.45),
    atLeast(v.head, 1.35, 0.4),
    atLeast(v.drop, 0.45, 0.3),
    atLeast(v.inv, 0.06, 0.05),
    atLeast(absR / Math.max(absP, 0.4), 0.32, 0.12),
    atLeast(
      (f.tRoll180 < 90 && f.tPitch180 < 90) ? (f.tPitch180 - f.tRoll180) : 0.25,
      0.0,
      0.12,
    ),
  );
  _sc.flip = mul(
    atLeast(absP, 4.6, 0.55),
    atMost(absR, 1.7, 0.6),
    atMost(absY, 1.9, 0.6),
    atMost(f.travelH, 8.5, 3.0),
    atLeast(v.close, 0.38, 0.15),
  );
  _sc.roll = mul(
    atLeast(absR, 4.55, 0.55),
    atMost(absP, 1.85, 0.6),
    atMost(absY, 2.05, 0.6),
  );
  _sc.yawspin = mul(
    atLeast(absY, 4.55, 0.55),
    atMost(absP, 1.55, 0.55),
    atMost(absR, 1.55, 0.55),
    atLeast(f.upMin, 0.12, 0.12),
  );

  let best = 0, bestId = '', second = 0, secondId = '';
  for (let i = 0; i < CLASS_IDS.length; i++) {
    const id = CLASS_IDS[i];
    const sc = (_sc[id] || 0) + (SPEC[id] || 0) * ((_sc[id] || 0) > 0.15 ? 1 : 0);
    if (sc > best) {
      second = best; secondId = bestId;
      best = sc; bestId = id;
    } else if (sc > second) {
      second = sc; secondId = id;
    }
  }
  o.best = best; o.second = second; o.secondId = secondId;
  if (best < 0.42 || !bestId) {
    if (v.drop >= 3.2 && f.spdPeak > 8 && f.vzMin < -6.2 && absP < 3.2 && absR < 2.2) {
      o.id = 'dive';
      o.why = 'Dive  drop=' + v.drop.toFixed(1) + 'm  v=' + f.spdPeak.toFixed(1);
      return o;
    }
    return o;
  }
  if (bestId === 'flip' && _sc.powerloop > 0.55 && _sc.powerloop >= _sc.matty) { bestId = 'powerloop'; best = _sc.powerloop; }
  if (bestId === 'flip' && _sc.matty > 0.55 && _sc.matty > _sc.powerloop) { bestId = 'matty'; best = _sc.matty; }
  if (bestId === 'yawspin' && _sc.trippy > 0.5) { bestId = 'trippy'; best = _sc.trippy; }
  if (bestId === 'powerloop' && _sc.matty > _sc.powerloop + 0.04) { bestId = 'matty'; best = _sc.matty; }
  if (bestId === 'matty' && _sc.powerloop > _sc.matty + 0.04) { bestId = 'powerloop'; best = _sc.powerloop; }
  o.id = bestId;
  o.best = best;
  const deg = (r) => Math.round(r * 180 / PI);
  o.why = (BY_ID[bestId] ? BY_ID[bestId].name : bestId)
    + '  P' + deg(f.pitch) + ' R' + deg(f.roll) + ' Y' + deg(f.yaw)
    + '  fol=' + v.follow.toFixed(2) + ' ag=' + v.against.toFixed(2)
    + '  span=' + v.span.toFixed(1) + ' hd=' + deg(v.head)
    + '  inv=' + v.inv.toFixed(2) + ' cl=' + v.close.toFixed(2)
    + (secondId ? '  (' + secondId + ' ' + second.toFixed(2) + ')' : '');
  return o;
}

export function makeDetector() {
  return {
    dlt: makeDlt(),
    clr: makeClr(),
    fwd: { x: 0, y: 0, z: 0 },
    feat: makeFeat(),
    lastFeat: makeFeat(),
    lastWhy: '',
    lastId: '',
    live: 0,
    quiet: 0,
    haveQ: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    px: 0, py: 0, pz: 0,
    hangT: 0, hangGot: 0, hangCd: 0,
    diveOn: 0, diveAlt: 0, diveDrop: 0, diveCd: 0,
    gapOn: 0, gapX: 0, gapY: 0, gapZ: 0, gapTravel: 0, gapSpd: 0, gapKind: 0, gapCd: 0,
    proxT: 0, proxCd: 0,
    lockout: 0,
    airT: 0, landT: 0, armedPrev: 0, wasAir: 0,
    dbgT: 0,
    dbgLine: '',
  };
}

export function resetDetector(d, sample) {
  d.haveQ = 0;
  d.live = 0;
  d.quiet = 0;
  resetFeat(d.feat);
  d.hangT = 0; d.hangGot = 0;
  d.diveOn = 0; d.diveDrop = 0;
  d.gapOn = 0; d.gapTravel = 0;
  d.proxT = 0;
  d.lockout = 0;
  d.landT = 0;
  d.airT = 0;
  d.wasAir = 0;
  if (sample) {
    d.qx = sample.qx || 0; d.qy = sample.qy || 0; d.qz = sample.qz || 0; d.qw = sample.qw == null ? 1 : sample.qw;
    d.haveQ = 1;
    d.px = sample.wx || 0; d.py = sample.wy || 0; d.pz = sample.wz || 0;
    d.armedPrev = sample.armed ? 1 : 0;
  }
}

function uniqueCount(ids, n) {
  let u = 0;
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    let seen = 0;
    for (let j = 0; j < i; j++) if (ids[j] === id) { seen = 1; break; }
    if (!seen) u++;
  }
  return u;
}

export function makeCombo() {
  return {
    n: 0,
    ids: new Array(COMBO_IDS),
    points: 0,
    mul: 1,
    lastAt: 0,
    live: 0,
    unique: 0,
  };
}

export function resetCombo(c) {
  c.n = 0;
  c.points = 0;
  c.mul = 1;
  c.lastAt = 0;
  c.live = 0;
  c.unique = 0;
}

export function pushCombo(c, id, now) {
  const prior = (() => {
    let n = 0;
    for (let i = 0; i < c.n; i++) if (c.ids[i] === id) n++;
    return n;
  })();
  const nextN = c.n + 1;
  const uniq = uniqueCount(c.ids, c.n) + (prior === 0 ? 1 : 0);
  const pts = scoreTrick(id, prior, nextN, uniq);
  if (c.n < COMBO_IDS) c.ids[c.n] = id;
  c.n = nextN;
  c.points += pts;
  c.mul = comboMul(nextN);
  c.lastAt = now;
  c.live = 1;
  c.unique = uniq;
  return pts;
}

export function comboRemain(c, now) {
  if (!c.live) return 0;
  const left = COMBO_WINDOW_S - (now - c.lastAt);
  return left > 0 ? left : 0;
}

function inGap(clr) {
  const latX = clr.px + clr.nx;
  const latZ = clr.pz + clr.nz;
  if (latX < GAP_LAT_W && clr.px < 3.2 && clr.nx < 3.2) return 1;
  if (latZ < GAP_LAT_W && clr.pz < 3.2 && clr.nz < 3.2) return 2;
  if (clr.up < GAP_UP_W) return 3;
  return 0;
}

function beginFeat(d, alt, wx, wz, head, speed, thr) {
  const f = resetFeat(d.feat);
  f.alt0 = alt; f.alt1 = alt; f.altMin = alt; f.altMax = alt;
  f.h0x = wx; f.h0z = wz; f.h1x = wx; f.h1z = wz;
  f.head0 = head; f.head1 = head;
  f.spd0 = speed; f.spd1 = speed; f.spdPeak = speed; f.spdMin = speed;
  f.thr0 = thr; f.thr1 = thr; f.thrMin = thr; f.thrMax = thr;
  d.live = 1;
  d.quiet = 0;
}

function accumFeat(d, sample, dr, dp, dy, step, alt, wx, wz, head, speed, upZ, thr, vx, vy, vz) {
  const f = d.feat;
  f.dur += step;
  f.n += 1;
  f.pitch += dp; f.roll += dr; f.yaw += dy;
  f.pathP += Math.abs(dp); f.pathR += Math.abs(dr); f.pathY += Math.abs(dy);
  const ar = Math.abs(sample.ox || 0), ap = Math.abs(sample.oy || 0), ay = Math.abs(sample.oz || 0);
  if (ap > f.peakP) f.peakP = ap;
  if (ar > f.peakR) f.peakR = ar;
  if (ay > f.peakY) f.peakY = ay;
  const rate = Math.hypot(ar, ap, ay);
  if (rate > f.peakRate) f.peakRate = rate;
  if (alt < f.altMin) f.altMin = alt;
  if (alt > f.altMax) f.altMax = alt;
  f.alt1 = alt;
  const dxw = wx - d.px, dzw = wz - d.pz;
  f.travelH += Math.hypot(dxw, dzw);
  f.travel += Math.hypot(dxw, sample.wy != null ? (sample.wy - d.py) : 0, dzw);
  f.h1x = wx; f.h1z = wz;
  f.head1 = head;
  if (f.tPitch180 > 90 && Math.abs(f.pitch) >= HALF) f.tPitch180 = f.dur;
  if (f.tRoll180 > 90 && Math.abs(f.roll) >= HALF) f.tRoll180 = f.dur;
  if (f.tYaw180 > 90 && Math.abs(f.yaw) >= HALF) f.tYaw180 = f.dur;
  if (upZ < f.upMin) f.upMin = upZ;
  if (upZ > f.upMax) f.upMax = upZ;
  if (upZ < -0.35) f.invT += step;
  if (speed > f.spdPeak) f.spdPeak = speed;
  if (speed < f.spdMin) f.spdMin = speed;
  f.spd1 = speed;
  if (vz < f.vzMin) f.vzMin = vz;
  if (vz > f.vzMax) f.vzMax = vz;
  f.thr1 = thr;
  f.thrSum += thr; f.thrN += 1;
  if (thr < f.thrMin) f.thrMin = thr;
  if (thr > f.thrMax) f.thrMax = thr;
  const spd = Math.hypot(vx, vy, vz);
  if (spd > 0.85) {
    bodyFwdParts(d.qx, d.qy, d.qz, d.qw, d.fwd);
    const invs = 1 / spd;
    const dot = d.fwd.x * vx * invs + d.fwd.y * vy * invs + d.fwd.z * vz * invs;
    f.alignN += 1;
    f.followSum += dot;
    if (dot > 0.18) f.followN += 1;
    else if (dot < -0.18) f.againstN += 1;
    if (upZ < -0.2) {
      f.invAlignN += 1;
      if (dot > 0.18) f.invFollowN += 1;
      else if (dot < -0.18) f.invAgainstN += 1;
    }
  }
}

function finishManeuver(d) {
  copyFeat(d.feat, d.lastFeat);
  d.live = 0;
  d.quiet = 0;
  const cls = classifyFeat(d.feat, _cls);
  d.lastWhy = cls.why || '';
  d.lastId = cls.id || '';
  resetFeat(d.feat);
  if (cls.id) {
    d.lockout = LOCKOUT_S;
    d.hangGot = 1;
    d.hangT = 0;
    d.diveOn = 0;
    d.diveCd = Math.max(d.diveCd, 2.4);
    d.gapOn = 0;
    d.proxT = 0;
    return cls.id;
  }
  return null;
}

export function stepDetector(d, sample, dt) {
  if (!d || !sample) return null;
  const step = dt > 0 && dt < 0.12 ? dt : 0.016;
  if (d.lockout > 0) d.lockout -= step;
  const sx = sample.qx || 0, sy = sample.qy || 0, sz = sample.qz || 0, sw = sample.qw == null ? 1 : sample.qw;
  const ox = sample.ox || 0, oy = sample.oy || 0, oz = sample.oz || 0;
  let dr, dp, dy;
  if (d.haveQ) {
    bodyDeltaParts(d.qx, d.qy, d.qz, d.qw, sx, sy, sz, sw, d.dlt);
    dr = d.dlt.r; dp = d.dlt.p; dy = d.dlt.y;
  } else {
    dr = ox * step; dp = oy * step; dy = oz * step;
  }
  const wx = sample.wx || 0, wy = sample.wy || 0, wz = sample.wz || 0;
  const ws = sample.ws || 3.5;
  let vx = sample.vx, vy = sample.vy, vz = sample.vz;
  if (vx == null || vy == null) {
    const sdt = step > 1e-4 ? step : 0.016;
    vx = (wx - d.px) / ws / sdt;
    vz = (wy - d.py) / ws / sdt;
    vy = -(wz - d.pz) / ws / sdt;
  }
  if (vz == null) vz = 0;
  d.qx = sx; d.qy = sy; d.qz = sz; d.qw = sw; d.haveQ = 1;

  if (Math.abs(dr) + Math.abs(dp) + Math.abs(dy) > 2.4) {
    d.live = 0;
    resetFeat(d.feat);
    d.px = wx; d.py = wy; d.pz = wz;
    return null;
  }

  const alt = sample.alt != null ? sample.alt : wy / ws;
  const speed = sample.speed != null ? sample.speed : Math.hypot(vx, vy, vz);
  const upZ = upZParts(sx, sy);
  const head = headingParts(sx, sy, sz, sw);
  const armed = !!sample.armed;
  const contact = (sample.clearance != null ? sample.clearance : 1) <= 0.08;
  const thr = sample.throttle || 0;
  const rate = Math.hypot(ox, oy, oz);

  if (contact) { d.airT = 0; } else { d.airT += step; if (d.airT > 0.25) d.wasAir = 1; }

  let hit = null;
  const rotating = rate >= RATE_START;
  if (armed && !contact && rotating && !d.live && d.lockout <= 0) {
    beginFeat(d, alt, wx, wz, head, speed, thr);
  }
  if (d.live) {
    accumFeat(d, sample, dr, dp, dy, step, alt, wx, wz, head, speed, upZ, thr, vx, vy, vz);
    if (rate < RATE_END) d.quiet += step; else d.quiet = 0;
    const timedOut = d.feat.dur >= MANEUVER_MAX_S;
    const settled = d.quiet >= SETTLE_S && d.feat.dur >= 0.22;
    if (settled || timedOut || (contact && d.feat.dur > 0.2)) {
      hit = finishManeuver(d);
    }
  }

  d.px = wx; d.py = wy; d.pz = wz;
  scanClearance(wx, wy, wz, sample.colliders, d.clr);

  if (!hit && !d.live && armed && d.hangCd <= 0) {
    const hanging = upZ < -0.55 && !contact && (sample.clearance == null || sample.clearance > 0.22)
      && speed < 3.4 && rate < 3.2;
    if (hanging) {
      d.hangT += step;
      if (d.hangT >= HANG_S && !d.hangGot) {
        d.hangGot = 1;
        d.hangCd = 3.5;
        hit = 'hang';
        d.lastId = 'hang';
        d.lastWhy = 'Inverted Hang  air inverted ' + d.hangT.toFixed(2) + 's';
      }
    } else {
      d.hangT = 0;
      if (upZ > -0.2) d.hangGot = 0;
    }
  } else if (d.hangCd > 0) d.hangCd -= step;

  if (!hit && !d.live && armed && d.diveCd <= 0) {
    if (!d.diveOn && vz < DIVE_VZ && speed > 8 && alt > 4) {
      d.diveOn = 1; d.diveAlt = alt; d.diveDrop = 0;
    }
    if (d.diveOn) {
      if (alt < d.diveAlt) d.diveDrop = d.diveAlt - alt;
      if (d.diveDrop >= DIVE_DROP && (speed > 5.5 || vz < -4.5)) {
        d.diveOn = 0; d.diveCd = 3.2;
        hit = 'dive';
        d.lastId = 'dive';
        d.lastWhy = 'Dive  drop=' + d.diveDrop.toFixed(1) + 'm  v=' + speed.toFixed(1);
      }
      if (vz > -2 || contact) d.diveOn = 0;
    }
  } else if (d.diveCd > 0) d.diveCd -= step;

  const kind = inGap(d.clr);
  if (!hit && !d.live && armed && d.gapCd <= 0) {
    if (kind && speed > 2.8) {
      if (!d.gapOn) {
        d.gapOn = 1; d.gapX = wx; d.gapY = wy; d.gapZ = wz; d.gapTravel = 0; d.gapSpd = speed; d.gapKind = kind;
      } else {
        d.gapTravel = Math.hypot(wx - d.gapX, wy - d.gapY, wz - d.gapZ);
        if (speed > d.gapSpd) d.gapSpd = speed;
      }
    } else if (d.gapOn) {
      if (d.gapTravel > GAP_TRAVEL_W && d.gapSpd > 3.4) {
        hit = 'gap';
        d.gapCd = 2.2;
        d.lastId = 'gap';
        d.lastWhy = 'Gap Thread  travel=' + d.gapTravel.toFixed(1);
      }
      d.gapOn = 0; d.gapTravel = 0;
    }
  } else if (d.gapCd > 0) d.gapCd -= step;

  if (!hit && !d.live && armed && d.proxCd <= 0 && !d.gapOn) {
    const nearM = d.clr.near / ws;
    const close = nearM < PROX_M && speed > PROX_SPD && !contact && (sample.clearance == null || sample.clearance > 0.12);
    if (close) {
      d.proxT += step;
      if (d.proxT > 0.16) {
        hit = 'prox';
        d.proxCd = 2.4;
        d.proxT = 0;
        d.lastId = 'prox';
        d.lastWhy = 'Proximity  ' + nearM.toFixed(2) + 'm @' + speed.toFixed(1);
      }
    } else d.proxT = 0;
  } else if (d.proxCd > 0) d.proxCd -= step;

  let end = null;
  if (d.wasAir && contact && speed < 0.85 && upZ > 0.65 && thr < 0.2) {
    d.landT += step;
    if (d.landT > 0.28) { end = 'land'; d.wasAir = 0; d.landT = 0; }
  } else d.landT = 0;
  if (d.armedPrev && !armed) end = end || 'disarm';
  d.armedPrev = armed ? 1 : 0;

  if (hit) return hit;
  return end;
}

const HUD_CSS = '#trickHud{position:fixed;left:50%;top:20%;transform:translateX(-50%);z-index:14;pointer-events:none;text-align:center;display:none;font-family:Inter,system-ui,sans-serif}'
  + '#trickHud.on{display:block}'
  + '#trickPop{font-size:26px;font-weight:700;letter-spacing:.18em;color:#ff2bd6;text-transform:uppercase;'
  + 'text-shadow:0 0 16px rgba(255,43,214,.5),0 1px 8px rgba(0,0,0,.8);opacity:0;transform:scale(.94);'
  + 'transition:opacity 90ms linear,transform 140ms ease-out}'
  + '#trickPop.show{opacity:1;transform:scale(1)}'
  + '#trickMul{font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:18px;font-weight:600;color:#00f0ff;'
  + 'text-shadow:0 0 12px rgba(0,240,255,.4),0 1px 6px rgba(0,0,0,.75);margin-top:4px;opacity:0}'
  + '#trickMul.show{opacity:1}'
  + '#trickBar{width:132px;height:3px;margin:8px auto 0;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;opacity:0}'
  + '#trickBar.show{opacity:1}'
  + '#trickBar>i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff2bd6,#00f0ff);transform-origin:left center;transform:scaleX(0);will-change:transform}'
  + '#trickScore{position:fixed;top:36px;left:50%;transform:translateX(-50%);z-index:14;pointer-events:none;'
  + 'font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:12px;letter-spacing:.12em;color:#00f0ff;'
  + 'text-shadow:0 0 10px rgba(0,240,255,.35),0 1px 6px rgba(0,0,0,.8);display:none}'
  + '#trickScore.on{display:block}'
  + '#trickDbg{position:fixed;left:8px;top:92px;z-index:16;pointer-events:none;display:none;margin:0;'
  + 'font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:11px;line-height:1.45;letter-spacing:.02em;'
  + 'color:#00f0ff;background:rgba(8,6,18,.78);border:1px solid rgba(0,240,255,.28);padding:8px 10px;max-width:360px;'
  + 'white-space:pre;text-shadow:0 1px 6px rgba(0,0,0,.8)}'
  + '#trickDbg.on{display:block}'
  + 'body.menu-open #trickHud,body.menu-open #trickScore,body.builder-on #trickHud,body.builder-on #trickScore,'
  + 'body:has(#panel.open) #trickHud,body:has(#panel.open) #trickScore{opacity:0}'
  + 'body.menu-open #trickDbg,body.builder-on #trickDbg,body:has(#panel.open) #trickDbg{opacity:.35}';

function ensureHud(doc) {
  if (!doc || !doc.body) return null;
  let style = doc.getElementById('trickHudStyle');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'trickHudStyle';
    style.textContent = HUD_CSS;
    doc.head.appendChild(style);
  } else if (style.textContent !== HUD_CSS) {
    style.textContent = HUD_CSS;
  }
  let hud = doc.getElementById('trickHud');
  if (!hud) {
    hud = doc.createElement('div');
    hud.id = 'trickHud';
    hud.innerHTML = '<div id="trickPop"></div><div id="trickMul"></div><div id="trickBar"><i></i></div>';
    doc.body.appendChild(hud);
  }
  let score = doc.getElementById('trickScore');
  if (!score) {
    score = doc.createElement('div');
    score.id = 'trickScore';
    doc.body.appendChild(score);
  }
  let dbg = doc.getElementById('trickDbg');
  if (!dbg) {
    dbg = doc.createElement('pre');
    dbg.id = 'trickDbg';
    doc.body.appendChild(dbg);
  }
  return {
    hud,
    pop: doc.getElementById('trickPop'),
    mul: doc.getElementById('trickMul'),
    bar: hud.querySelector('#trickBar'),
    fill: hud.querySelector('#trickBar>i'),
    score,
    dbg,
  };
}

function playBlip(ctxHolder, muted, kind, mul) {
  if (muted && muted()) return;
  try {
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!AC) return;
    if (!ctxHolder.ctx) ctxHolder.ctx = new AC();
    const ctx = ctxHolder.ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const now = ctx.currentTime;
    const base = kind === 'bank' ? 220 : 440 + Math.min(8, mul || 1) * 70;
    o.type = 'sine';
    o.frequency.setValueAtTime(base, now);
    o.frequency.exponentialRampToValueAtTime(base * (kind === 'bank' ? 0.7 : 1.35), now + 0.07);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(kind === 'bank' ? 0.05 : 0.07, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    o.connect(g); g.connect(ctx.destination);
    o.start(now); o.stop(now + 0.1);
  } catch (e) { /* ignore */ }
}

function deg(r) { return Math.round((r || 0) * 180 / PI); }

export function createTricks(opts) {
  const o = opts || {};
  const doc = o.document || (typeof document !== 'undefined' ? document : null);
  const storage = o.storage || null;
  const muted = o.muted || function () { return true; };
  const nowFn = o.now || function () {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() * 0.001 : Date.now() * 0.001;
  };

  const store = loadStore(storage);
  if (o.debug === true) store.debug = true;
  const det = makeDetector();
  const combo = makeCombo();
  const audio = { ctx: null };
  let hudEls = null;
  let active = false;
  let mapId = 'city';
  let session = 0;
  let popName = '';
  let popUntil = 0;
  let scoreShown = '';
  let lastHudOn = -1;
  let lastDbgOn = -1;
  let bankFlashUntil = 0;

  function hudWanted() {
    return !!(store.hud && active);
  }

  function paintDebug(t) {
    if (!doc || !store.debug) {
      if (hudEls && hudEls.dbg && lastDbgOn !== 0) {
        hudEls.dbg.className = '';
        lastDbgOn = 0;
      }
      return;
    }
    if (!hudEls) hudEls = ensureHud(doc);
    if (!hudEls || !hudEls.dbg) return;
    if (lastDbgOn !== 1) {
      hudEls.dbg.className = 'on';
      lastDbgOn = 1;
    }
    if (t - det.dbgT < 0.12 && !det.lastWhy) return;
    det.dbgT = t;
    const f = det.live ? det.feat : det.lastFeat;
    const v = featView(f);
    const line = (det.live ? 'LIVE' : 'IDLE')
      + '  P' + deg(f.pitch) + ' R' + deg(f.roll) + ' Y' + deg(f.yaw)
      + '\nfol ' + v.follow.toFixed(2) + '  ag ' + v.against.toFixed(2)
      + '  span ' + v.span.toFixed(1) + 'm  hd ' + deg(v.head) + '°'
      + '\ninv ' + v.inv.toFixed(2) + '  close ' + v.close.toFixed(2)
      + '  n ' + f.n + '  ' + f.dur.toFixed(2) + 's'
      + '\nlast  ' + (det.lastWhy || '—');
    if (line !== det.dbgLine) {
      det.dbgLine = line;
      hudEls.dbg.textContent = line;
    }
  }

  function paintHud(t) {
    if (!doc) return;
    if (!hudEls) hudEls = ensureHud(doc);
    if (!hudEls) return;
    const on = hudWanted();
    if (on !== lastHudOn) {
      lastHudOn = on ? 1 : 0;
      hudEls.hud.className = on ? 'on' : '';
      hudEls.score.className = on ? 'on' : '';
    }
    if (on) {
      const remain = comboRemain(combo, t);
      const showPop = t < popUntil;
      if (hudEls.pop.textContent !== popName) hudEls.pop.textContent = popName;
      hudEls.pop.className = showPop ? 'show' : '';
      const mulTxt = combo.live ? ('×' + combo.mul.toFixed(1)) : (bankFlashUntil > t ? 'BANKED' : '');
      if (hudEls.mul.textContent !== mulTxt) hudEls.mul.textContent = mulTxt;
      hudEls.mul.className = mulTxt ? 'show' : '';
      hudEls.bar.className = combo.live ? 'show' : '';
      const frac = combo.live ? Math.min(1, remain / COMBO_WINDOW_S) : 0;
      if (hudEls.fill) hudEls.fill.style.transform = 'scaleX(' + (frac < 0 ? 0 : frac).toFixed(3) + ')';
      const line = formatScoreFull(session) + (combo.live ? ('  +' + formatScoreFull(combo.points)) : '');
      if (line !== scoreShown) {
        scoreShown = line;
        hudEls.score.textContent = line;
      }
    }
    paintDebug(t);
  }

  function bank(reason) {
    if (!combo.live || combo.points <= 0) {
      resetCombo(combo);
      return 0;
    }
    const pts = combo.points;
    session += pts;
    recordBest(store, mapId, pts, session);
    saveStore(store, storage);
    resetCombo(combo);
    bankFlashUntil = nowFn() + 0.9;
    playBlip(audio, muted, 'bank', 1);
    return pts;
  }

  function award(id) {
    const t = nowFn();
    const remain = comboRemain(combo, t);
    if (combo.live && remain <= 0) bank('timeout');
    const got = pushCombo(combo, id, t);
    const def = BY_ID[id];
    popName = def ? def.name : id;
    popUntil = t + 1.05;
    playBlip(audio, muted, 'trick', combo.mul);
    recordBest(store, mapId, combo.points, session);
    saveStore(store, storage);
    return got;
  }

  function setActive(on, map) {
    const next = !!on;
    if (map) mapId = map;
    if (active && !next) bank('leave');
    if (!active && next) {
      session = 0;
      resetCombo(combo);
      resetDetector(det, null);
    }
    active = next;
    if (map) mapId = map;
    lastHudOn = -1;
  }

  function setMap(id) {
    if (id && id !== mapId) {
      if (active) bank('map');
      session = 0;
      mapId = id;
      resetCombo(combo);
      resetDetector(det, null);
    } else if (id) mapId = id;
  }

  let lastEv = null;
  const tickWrapped = function (sample, dt) {
    lastEv = null;
    try {
      const t = nowFn();
      if (combo.live && comboRemain(combo, t) <= 0) bank('timeout');
      if (active && sample) {
        const ev = stepDetector(det, sample, dt);
        lastEv = ev;
        if (ev === 'land' || ev === 'disarm') bank(ev);
        else if (ev && BY_ID[ev]) award(ev);
      }
      paintHud(t);
    } catch (err) {
      try { if (typeof console !== 'undefined') console.warn('tricks', err); } catch (e) { /* #198: never blank the FPV frame */ }
    }
    return lastEv;
  };

  function noteCrash() {
    try {
      if (!active) return 0;
      return bank('crash');
    } catch (e) { return 0; }
  }

  function noteReset() {
    try {
      if (active) bank('reset');
      resetDetector(det, null);
    } catch (e) { /* ignore */ }
  }

  function setHudOn(v) {
    store.hud = !!v;
    saveStore(store, storage);
    lastHudOn = -1;
  }

  function setDebugOn(v) {
    store.debug = !!v;
    saveStore(store, storage);
    lastDbgOn = -1;
  }

  function debugPop(name, mul, pts) {
    popName = name || 'Flip';
    const t = nowFn();
    popUntil = t + 8;
    combo.live = 1;
    combo.n = Math.max(2, combo.n || 2);
    combo.mul = mul == null ? 2.5 : mul;
    combo.points = pts == null ? 1250 : pts;
    combo.lastAt = t + 60;
    session = Math.max(session, 4200);
    det.lastId = 'powerloop';
    det.lastWhy = (name || 'Power Loop') + '  P-360 R0 Y0  fol=0.86 ag=0.05  span=3.8 hd=8  inv=0.31 cl=0.04  (matty 0.12)';
    det.dbgT = 0;
    lastHudOn = -1;
    lastDbgOn = -1;
    try { paintHud(t); } catch (e) { /* ignore */ }
  }

  return {
    TRICKS_KEY,
    setActive,
    setMap,
    tick: tickWrapped,
    noteCrash,
    noteReset,
    setHudOn,
    setDebugOn,
    hudOn: function () { return store.hud !== false; },
    debugOn: function () { return store.debug === true; },
    isActive: function () { return active; },
    mapId: function () { return mapId; },
    session: function () { return session; },
    comboPoints: function () { return combo.points; },
    comboMul: function () { return combo.mul; },
    comboN: function () { return combo.n; },
    bestLine: function (id) { return bestLine(store, id || mapId); },
    bestFor: function (id) { return bestForMap(store, id || mapId); },
    store: function () { return store; },
    debugPop,
    lastWhy: function () { return det.lastWhy; },
    lastId: function () { return det.lastId; },
    detector: function () { return det; },
    resetDetector: function (s) { resetDetector(det, s); },
  };
}
