// QuadMath sim — freestyle trick score + combo.
// Maneuver classifier: one rotation segment → exactly one label (most specific
// wins). Trick definitions and point values based on Tyrantt's Pro Whooper
// tricktionary (prowhooper.com) — paraphrased, nothing copied. Nothing here is
// copied from WebFPV (GPL).
// Style is Neon Current (docs/sim-art-direction.md): magenta / cyan / ember.
// Definitions + decision boundaries: docs/sim-tricks.md.
// New localStorage key only: quadmathSimTricks. Do not write old ryfly* keys.
// This file has no sim-*.js imports. Do not change flight physics.

export const TRICKS_KEY = 'quadmathSimTricks';
export const STORE_VER = 1;
export const COMBO_WINDOW_S = 2.8;
export const MUL_CAP = 6;
export const LOCKOUT_S = 0.45;
export const RATE_START = 0.95;
export const RATE_END = 0.55;
export const SETTLE_S = 0.16;
export const SETTLE_INV_S = 0.42;
export const MANEUVER_MAX_S = 4.5;
export const REC_CAP = 240;
export const REC_STRIDE = 12;
export const REC_KEYS = Object.freeze([
  't', 'ox', 'oy', 'oz', 'qx', 'qy', 'qz', 'qw', 'sr', 'sp', 'sy', 'thr',
]);
export const DEAD = 1.15;
export const STREAK_CAP = 2;
export const SLOPPY_MUL = 0.65;
export const BUMP_MUL = 0.5;

const INDOOR_IDS = Object.freeze({
  living: 1, garage: 1, warehouse: 1, office: 1, gym: 1, trainer: 1, room: 1,
});

export const TRICK_LIST = Object.freeze([
  Object.freeze({ id: 'flip', name: 'Flip', tier: 'Beginner', points: 50, pointsIn: 75, type: 'Open Air' }),
  Object.freeze({ id: 'roll', name: 'Roll', tier: 'Beginner', points: 50, pointsIn: 75, type: 'Open Air' }),
  Object.freeze({ id: 'yawspin', name: 'Yaw Spin', tier: 'Beginner', points: 50, pointsIn: 75, type: 'Open Air' }),
  Object.freeze({ id: 'maverick', name: 'Maverick Loop', tier: 'Beginner', points: 100, pointsIn: 100, type: 'Maverick Loops' }),
  Object.freeze({ id: 'splits', name: 'Split-S', tier: 'Beginner', points: 100, pointsIn: 100, type: "Split S'" }),
  Object.freeze({ id: 'dive', name: 'Building Dive', tier: 'Beginner', points: 100, pointsIn: 100, type: 'Wall Tricks' }),
  Object.freeze({ id: 'gap', name: 'Gap', tier: 'Beginner', points: 125, pointsIn: 125, type: 'Gaps' }),
  Object.freeze({ id: 'cradle', name: 'Cradle', tier: 'Beginner', points: 150, pointsIn: 150, type: 'Pole Dancing' }),
  Object.freeze({ id: 'prox', name: 'Proximity', tier: 'Beginner', points: 150, pointsIn: 150, type: 'Wall Tricks' }),
  Object.freeze({ id: 'powerloop', name: 'Powerloop', tier: 'Novice', points: 200, pointsIn: 200, type: 'Powerloops' }),
  Object.freeze({ id: 'sideloop', name: 'Side Loop', tier: 'Novice', points: 200, pointsIn: 225, type: 'Jump Ropes' }),
  Object.freeze({ id: 'matty', name: 'Matty Flip', tier: 'Novice', points: 200, pointsIn: 200, type: 'Matty Flips' }),
  Object.freeze({ id: 'juicyflick', name: 'Juicy Flick', tier: 'Novice', points: 200, pointsIn: 225, type: 'Open Air' }),
  Object.freeze({ id: 'snapback', name: 'Snapback', tier: 'Novice', points: 200, pointsIn: 225, type: 'Open Air' }),
  Object.freeze({ id: 'rubik', name: "Rubik's Cube", tier: 'Intermediate', points: 325, pointsIn: 450, type: 'Open Air' }),
  Object.freeze({ id: 'halfmatty', name: 'Half Matty', tier: 'Intermediate', points: 350, pointsIn: 350, type: 'Matty Flips' }),
  Object.freeze({ id: 'cubik', name: "Cubik's Rube", tier: 'Intermediate', points: 350, pointsIn: 450, type: 'Open Air' }),
  Object.freeze({ id: 'ham', name: 'Ham Spin', tier: 'Intermediate', points: 300, pointsIn: 300, type: 'Open Air' }),
  Object.freeze({ id: 'trippy', name: 'Trippy Spin', tier: 'Intermediate', points: 500, pointsIn: 500, type: 'Pole Dancing' }),
]);

const BY_ID = Object.create(null);
for (let i = 0; i < TRICK_LIST.length; i++) BY_ID[TRICK_LIST[i].id] = TRICK_LIST[i];
export const TRICK_BY_ID = BY_ID;

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
const HALF = PI * 0.78;
const FULL = 5.2;
const QTR = 1.15;
const CLASS_IDS = [
  'rubik', 'cubik', 'ham', 'trippy', 'sideloop', 'juicyflick', 'snapback', 'halfmatty',
  'powerloop', 'matty', 'maverick', 'splits', 'cradle', 'flip', 'roll', 'yawspin',
];
const SPEC = {
  rubik: 0.12, cubik: 0.12, ham: 0.11, trippy: 0.11, sideloop: 0.11, juicyflick: 0.11, snapback: 0.11,
  halfmatty: 0.10, powerloop: 0.11, matty: 0.11, maverick: 0.10, splits: 0.10,
  cradle: 0.08, flip: 0, roll: 0, yawspin: 0,
};
const LOOP_IDS = { powerloop: 1, matty: 1, maverick: 1, splits: 1, halfmatty: 1, trippy: 1, sideloop: 1 };

function makeDlt() { return { r: 0, p: 0, y: 0 }; }
function makeClr() { return { up: 50, dn: 50, px: 50, nx: 50, pz: 50, nz: 50, near: 50, over: 50 }; }

export function mapIsIndoor(id) {
  return !!INDOOR_IDS[id];
}

export function trickPoints(id, indoor) {
  const def = BY_ID[id];
  if (!def) return 0;
  return indoor ? (def.pointsIn || def.points) : def.points;
}

export function trickById(id) {
  return BY_ID[id] || null;
}

export function trickLineupText() {
  let s = '';
  for (let i = 0; i < TRICK_LIST.length; i++) {
    if (i) s += ' · ';
    s += TRICK_LIST[i].name;
  }
  return s;
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
  if (priorSame === 1) return 0.75;
  if (priorSame === 2) return 0.5;
  return 0;
}

export function b2bMul(consec) {
  if (consec <= 0) return 1;
  let m = 1;
  for (let i = 0; i < consec; i++) m *= 0.5;
  return m;
}

export function execMul(sloppy, bump) {
  let m = 1;
  if (sloppy) m *= SLOPPY_MUL;
  if (bump) m *= BUMP_MUL;
  return m;
}

export function nextStreak(streak, basePts) {
  const s = (streak == null ? 1 : streak) + (basePts || 0) / 10000;
  return s > STREAK_CAP ? STREAK_CAP : s;
}

export function uniqueBonus(uniqueN) {
  if (uniqueN >= 5) return 1.2;
  if (uniqueN >= 3) return 1.1;
  return 1;
}

export function scoreTrick(id, priorSame, chainCount, uniqueN, opts) {
  const def = BY_ID[id];
  if (!def) return 0;
  const o = opts || {};
  const base = trickPoints(id, !!o.indoor);
  const raw = base
    * varietyMul(priorSame)
    * b2bMul(o.b2b || 0)
    * execMul(!!o.sloppy, !!o.bump)
    * comboMul(chainCount)
    * uniqueBonus(uniqueN)
    * (o.streak == null ? 1 : o.streak);
  if (raw <= 0) return 0;
  return Math.max(1, Math.round(raw));
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
  o.up = 50; o.dn = wy; o.px = 50; o.nx = 50; o.pz = 50; o.nz = 50; o.near = 50; o.over = 50;
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
    if (ox && oz && max.y < wy) {
      const d = wy - max.y; if (d >= 0 && d < o.over) o.over = d;
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
    tRoll180: 99, tPitch180: 99, tYaw180: 99, tRoll360: 99, tPitch360: 99, tYaw360: 99,
    tRoll90: 99, tPitch90: 99, tYaw90: 99,
    underN: 0, overN: 0, objNearN: 0, objOrbitN: 0, under0: 0, over0: 0,
    bump: 0, seg: 0, oppRY: 0, radMax: 0,
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
  f.tRoll180 = 99; f.tPitch180 = 99; f.tYaw180 = 99; f.tRoll360 = 99; f.tPitch360 = 99; f.tYaw360 = 99;
  f.tRoll90 = 99; f.tPitch90 = 99; f.tYaw90 = 99;
  f.underN = 0; f.overN = 0; f.objNearN = 0; f.objOrbitN = 0; f.under0 = 0; f.over0 = 0;
  f.bump = 0; f.seg = 0; f.oppRY = 0; f.radMax = 0;
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
  d.tRoll360 = src.tRoll360; d.tPitch360 = src.tPitch360; d.tYaw360 = src.tYaw360;
  d.tRoll90 = src.tRoll90; d.tPitch90 = src.tPitch90; d.tYaw90 = src.tYaw90;
  d.underN = src.underN; d.overN = src.overN; d.objNearN = src.objNearN;
  d.objOrbitN = src.objOrbitN;
  d.under0 = src.under0; d.over0 = src.over0;
  d.bump = src.bump; d.seg = src.seg; d.oppRY = src.oppRY; d.radMax = src.radMax;
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
  const n = f.n || 1;
  const under = f.underN / n;
  const over = f.overN / n;
  const obj = f.objNearN / n;
  const objOrbit = (f.objOrbitN || 0) / n;
  const opp = (f.n && f.oppRY) ? f.oppRY / f.n : 0;
  const front = f.pitch > 0 ? 1 : 0;
  const rad = f.radMax || 0;
  return {
    absP, absR, absY, head, span, drop, follow, against, inv, close, hEnd, meanDot,
    invFol, invAg, pathP, pathR, pathY, under, over, obj, objOrbit, opp, front, rad,
  };
}

const _cls = { id: null, why: '', best: 0, second: 0, secondId: '' };
const _sc = Object.create(null);

function whyLine(id, f, v, secondId, second) {
  const def = BY_ID[id];
  const deg = (r) => Math.round(r * 180 / PI);
  return (def ? def.name : id)
    + (def ? ('  ' + def.tier + '  ' + def.points) : '')
    + '\n  P' + deg(f.pitch) + ' R' + deg(f.roll) + ' Y' + deg(f.yaw)
    + '  fol=' + v.follow.toFixed(2) + ' ag=' + v.against.toFixed(2)
    + '  span=' + v.span.toFixed(1) + ' hd=' + deg(v.head)
    + '  inv=' + v.inv.toFixed(2) + ' cl=' + v.close.toFixed(2)
    + '  obj=' + v.obj.toFixed(2) + ' orb=' + (v.objOrbit || 0).toFixed(2)
    + ' rad=' + v.rad.toFixed(1)
    + (secondId ? '  (' + secondId + ' ' + second.toFixed(2) + ')' : '');
}

export function classifyFeat(f, out) {
  const o = out || _cls;
  o.id = null; o.why = ''; o.best = 0; o.second = 0; o.secondId = '';
  if (!f || f.n < 4 || f.dur < 0.12) return o;
  const v = featView(f);
  const absP = v.absP, absR = v.absR, absY = v.absY;
  const tiny = absP < 1.7 && absR < 1.7 && absY < 1.7
    && v.pathP < 1.6 && v.pathR < 1.6 && v.pathY < 1.6 && v.inv < 0.35;
  if (tiny) return o;

  const tR = f.tRoll90 < 90 ? f.tRoll90 : (f.tRoll180 < 90 ? f.tRoll180 : 99);
  const tP = f.tPitch90 < 90 ? f.tPitch90 : (f.tPitch180 < 90 ? f.tPitch180 : 99);
  const tY = f.tYaw90 < 90 ? f.tYaw90 : (f.tYaw180 < 90 ? f.tYaw180 : 99);
  const rollFirst = (tR < 90 && tP < 90) ? (tP - tR) : (tR < 90 && tP >= 90 ? 0.5 : -0.5);
  const pitchFirst = -rollFirst;
  const yawFirst = (tY < 90 && tR < 90) ? (tR - tY) : (tY < 90 && tR >= 90 ? 0.5 : -0.4);
  const objU = Math.max(v.under, f.under0 ? 0.35 : 0);
  const objO = Math.max(v.over, f.over0 ? 0.35 : 0);

  _sc.rubik = mul(
    atLeast(v.pathP, 5.2, 0.7),
    atLeast(v.pathR, 5.2, 0.7),
    atLeast(absP, 4.4, 0.6),
    atLeast(absR, 4.4, 0.6),
    atLeast(pitchFirst, 0.0, 0.12),
    atLeast(v.inv, 0.12, 0.08),
    atMost(absY, 2.4, 0.7),
  );
  _sc.cubik = mul(
    atLeast(v.pathP, 5.2, 0.7),
    atLeast(v.pathR, 5.2, 0.7),
    atLeast(absP, 4.4, 0.6),
    atLeast(absR, 4.4, 0.6),
    atLeast(rollFirst, 0.0, 0.12),
    atLeast(v.inv, 0.12, 0.08),
    atMost(absY, 2.4, 0.7),
  );
  {
    // Camera-lock orbit around a nearby pole/tree: ≥360° yaw while circling,
    // craft stays mostly level, camera pointed at the object (sideways to
    // velocity). After the 1.25× backyard, a real ficus/palm orbit is R≈4–10
    // wu (radMax≈8–20, travelH≈25–63, period≈1.4–3.6 s, peak yaw ≈ v/R).
    // In-place pole spins still pass via the tight-rad term. Coordinated
    // turns keep follow high; open-air punches have no nearby object.
    _sc.trippy = mul(
      atLeast(absY, TAU, 0.70),
      atLeast(v.pathY, TAU, 0.70),
      atMost(f.tYaw360, 3.20, 0.80),
      atLeast(f.peakY, 1.60, 0.70),
      atMost(absR, 1.80, 0.70),
      atMost(absP, 1.60, 0.60),
      atMost(v.pathR, 2.20, 0.90),
      atMost(v.pathP, 2.00, 0.80),
      atLeast(f.upMin, 0.45, 0.25),
      atMost(v.inv, 0.12, 0.08),
      atLeast(v.objOrbit, 0.45, 0.30),
      atMost(v.rad, 22, 8),
      atMost(f.travelH, 80, 24),
      atMost(v.meanDot, 0.42, 0.20),
      Math.max(atMost(v.rad, 8.0, 3.0), atMost(v.close, 0.55, 0.18)),
      atLeast(f.dur, 0.55, 0.15),
    );
    // Ham Spin: inverted yaw spin. Tight in-place ≥360° yaw in ≤1.8s +
    // little roll/pitch/drift, but the craft stays upside-down the whole
    // window (tilt >135° from level, upZ < −0.70). Flips/rolls that only
    // pass through inverted have large pitch/roll and an upright upMax,
    // so they do not score Ham. Upright orbits are Trippy, not Ham.
    _sc.ham = mul(
      atLeast(absY, TAU, 0.70),
      atLeast(v.pathY, TAU, 0.70),
      atMost(f.tYaw360, 1.80, 0.50),
      atLeast(f.peakY, 4.0, 1.5),
      atMost(absR, 1.40, 0.60),
      atMost(absP, 1.20, 0.50),
      atMost(v.pathR, 1.60, 0.70),
      atMost(v.pathP, 1.40, 0.60),
      atMost(f.upMax, -0.70, 0.15),
      atLeast(v.inv, 0.85, 0.20),
      atMost(f.travelH, 14, 6),
      atLeast(f.dur, 0.55, 0.15),
    );
  }
  _sc.sideloop = mul(
    atLeast(Math.max(absR, v.pathR), 3.2, 0.7),
    atLeast(Math.max(absY, v.pathY), 1.15, 0.4),
    atLeast(v.span, 1.5, 0.5),
    atLeast(v.inv, 0.10, 0.08),
    atMost(absP, 2.4, 0.6),
    atMost(v.opp, 0.45, 0.15),
    atLeast(yawFirst, 0.0, 0.14),
    atLeast(f.dur, 0.45, 0.12),
    atLeast(f.spdPeak, 1.2, 0.4),
    atMost(v.close, 1.15, 0.15),
    Math.max(atLeast(objU, 0.08, 0.08), 0.58),
  );
  _sc.juicyflick = mul(
    atLeast(f.pitch, 2.0, 0.5),
    inBand(absP, 2.2, 4.6, 0.45),
    inBand(absR, 2.0, 4.6, 0.45),
    atLeast(pitchFirst, 0.02, 0.10),
    atLeast(v.inv, 0.08, 0.06),
    atMost(absY, 2.2, 0.6),
    atMost(v.pathP, 6.2, 0.8),
    atMost(v.pathR, 5.4, 0.6),
  );
  _sc.snapback = mul(
    atLeast(-f.pitch, 2.0, 0.5),
    inBand(absP, 2.2, 4.6, 0.45),
    inBand(absR, 2.0, 4.6, 0.45),
    atLeast(pitchFirst, 0.02, 0.10),
    atLeast(v.inv, 0.08, 0.06),
    atMost(absY, 2.2, 0.6),
    atMost(v.pathP, 6.2, 0.8),
    atMost(v.pathR, 5.4, 0.6),
  );
  _sc.halfmatty = mul(
    inBand(absR, 2.0, 4.6, 0.45),
    inBand(absP, 1.4, 4.4, 0.45),
    atLeast(f.pitch, 0.6, 0.4),
    atLeast(rollFirst, 0.02, 0.10),
    atLeast(v.against - v.follow, 0.0, 0.12),
    atLeast(v.inv, 0.06, 0.05),
    atMost(absY, 2.4, 0.7),
    atMost(v.pathR, 5.4, 0.6),
  );
  _sc.powerloop = mul(
    atLeast(-f.pitch, 4.0, 0.7),
    atLeast(absP, 4.35, 0.7),
    atLeast(v.span, 1.2, 0.45),
    atLeast(v.follow, 0.40, 0.15),
    atMost(v.close, 0.38, 0.12),
    atLeast(f.travelH, 5.5, 1.5),
    atMost(absR, 2.7, 0.8),
    atLeast(v.inv, 0.08, 0.06),
    atMost(v.head, 1.5, 0.5),
    atLeast(f.spdPeak, 3.2, 0.6),
    Math.max(atLeast(objU, 0.08, 0.08), 0.72),
  );
  _sc.matty = mul(
    atLeast(f.pitch, 2.0, 0.5),
    inBand(absP, 2.4, 5.6, 0.45),
    atLeast(v.drop, 0.35, 0.25),
    atLeast(Math.max(v.against, v.invAg), 0.22, 0.12),
    atMost(absR, 1.85, 0.5),
    atLeast(f.travelH, 2.2, 0.8),
    atMost(v.close, 0.95, 0.12),
    atLeast(f.spdPeak, 1.8, 0.5),
    Math.max(atLeast(objO, 0.08, 0.08), 0.72),
  );
  _sc.maverick = mul(
    atLeast(v.span, 1.0, 0.4),
    atMost(v.close, 1.08, 0.14),
    inBand(v.pathP, 1.1, 6.2, 0.5),
    atMost(absP, 4.2, 0.5),
    atLeast(v.pathP - absP, 0.55, 0.35),
    atMost(v.inv, 0.32, 0.12),
    atLeast(f.dur, 0.35, 0.12),
    atLeast(f.spdPeak, 1.1, 0.4),
    atMost(absR, 2.8, 0.7),
    atMost(v.head, 2.0, 0.5),
    atMost(absY, 2.4, 0.7),
  );
  _sc.splits = mul(
    inBand(absR, 1.8, 4.5, 0.45),
    inBand(absP, 1.2, 4.5, 0.45),
    atLeast(-f.pitch, 0.6, 0.4),
    atLeast(v.drop, 0.35, 0.25),
    atLeast(v.inv, 0.06, 0.05),
    atLeast(rollFirst, 0.02, 0.10),
    atLeast(v.follow, 0.18, 0.12),
    atMost(absY, 2.4, 0.7),
    atMost(v.pathR, 5.4, 0.6),
  );
  _sc.cradle = mul(
    inBand(v.pathP, 1.3, 4.4, 0.45),
    atMost(absP, 3.6, 0.5),
    atMost(v.inv, 0.22, 0.1),
    atLeast(v.against - v.follow, 0.08, 0.12),
    atMost(absR, 2.2, 0.6),
    atLeast(f.travelH, 1.6, 0.6),
    atLeast(f.dur, 0.4, 0.1),
    Math.max(atLeast(v.obj, 0.08, 0.08), 0.55),
  );
  _sc.flip = mul(
    atLeast(absP, 4.35, 0.5),
    atMost(absR, 1.7, 0.6),
    atMost(absY, 1.9, 0.6),
    atMost(f.travelH, 9.5, 2.5),
    atLeast(v.close, 0.35, 0.15),
  );
  _sc.roll = mul(
    atLeast(absR, 4.55, 0.55),
    atMost(absP, 1.85, 0.6),
    atMost(absY, 2.05, 0.6),
  );
  _sc.yawspin = mul(
    atLeast(absY, 4.55, 0.55),
    atMost(absP, 1.05, 0.40),
    atMost(absR, 1.05, 0.40),
    atMost(v.pathR, 1.25, 0.40),
    atMost(v.pathP, 1.25, 0.40),
    atLeast(f.upMin, 0.25, 0.15),
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
    if (v.drop >= 3.2 && f.spdPeak > 8 && f.vzMin < -6.2 && absP < 3.2 && absR < 2.2 && v.pathY < 2.0) {
      o.id = 'dive';
      o.why = whyLine('dive', f, v, '', 0);
      return o;
    }
    return o;
  }
  if (bestId === 'flip' && _sc.powerloop > 0.55 && f.pitch < 0 && f.travelH > 6 && v.close < 0.4) { bestId = 'powerloop'; best = _sc.powerloop; }
  if (bestId === 'flip' && _sc.matty > 0.55 && f.pitch > 0) { bestId = 'matty'; best = _sc.matty; }
  if (bestId === 'powerloop' && f.travelH < 5.5) { bestId = 'flip'; best = _sc.flip; }
  if (bestId === 'yawspin' && _sc.ham > 0.42) { bestId = 'ham'; best = _sc.ham; }
  if (bestId === 'trippy' && _sc.ham > 0.42) { bestId = 'ham'; best = _sc.ham; }
  if (bestId === 'yawspin' && _sc.trippy > 0.42) { bestId = 'trippy'; best = _sc.trippy; }
  if (bestId === 'roll' && _sc.sideloop > 0.4) { bestId = 'sideloop'; best = _sc.sideloop; }
  if (bestId === 'yawspin' && _sc.sideloop > 0.4) { bestId = 'sideloop'; best = _sc.sideloop; }
  if (bestId === 'maverick' && absP > 4.3 && f.pitch < 0 && _sc.powerloop > 0.5) { bestId = 'powerloop'; best = _sc.powerloop; }
  if (bestId === 'powerloop' && f.pitch > 0) { bestId = _sc.matty > 0.42 ? 'matty' : bestId; }
  if (bestId === 'matty' && f.pitch < 0) { bestId = _sc.powerloop > 0.42 ? 'powerloop' : bestId; }
  if (bestId === 'matty' && absR > 2.1 && pitchFirst > 0.02 && _sc.juicyflick > 0.3) { bestId = 'juicyflick'; best = _sc.juicyflick; }
  if (bestId === 'juicyflick' && rollFirst > 0.04 && _sc.halfmatty > 0.35) { bestId = 'halfmatty'; best = _sc.halfmatty; }
  if (bestId === 'snapback' && rollFirst > 0.04 && _sc.splits > 0.35) { bestId = 'splits'; best = _sc.splits; }
  if (bestId === 'juicyflick' && _sc.rubik > _sc.juicyflick + 0.04) { bestId = 'rubik'; best = _sc.rubik; }
  if (bestId === 'snapback' && _sc.cubik > _sc.snapback + 0.04) { bestId = 'cubik'; best = _sc.cubik; }
  if (bestId === 'rubik' && rollFirst > 0.06) { bestId = 'cubik'; best = Math.max(_sc.cubik, best); }
  if (bestId === 'cubik' && pitchFirst > 0.06) { bestId = 'rubik'; best = Math.max(_sc.rubik, best); }
  if (bestId === 'maverick' && v.against > v.follow + 0.08 && _sc.cradle > 0.4) { bestId = 'cradle'; best = _sc.cradle; }
  o.id = bestId;
  o.best = best;
  o.why = whyLine(bestId, f, v, secondId, second);
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
    lastSloppy: 0,
    lastBump: 0,
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
    rec: new Float32Array(REC_CAP * REC_STRIDE),
    recN: 0,
    recJson: '',
  };
}

function recPush(d, t, ox, oy, oz, qx, qy, qz, qw, sr, sp, sy, thr) {
  if (!d || !d.rec) return;
  const n = d.recN;
  const b = d.rec;
  let i = n * REC_STRIDE;
  b[i] = t; b[i + 1] = ox; b[i + 2] = oy; b[i + 3] = oz;
  b[i + 4] = qx; b[i + 5] = qy; b[i + 6] = qz; b[i + 7] = qw;
  b[i + 8] = sr; b[i + 9] = sp; b[i + 10] = sy; b[i + 11] = thr;
  d.recN = n + 1;
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

export function encodeRecJson(d) {
  const n = d && d.recN ? d.recN : 0;
  const b = d && d.rec;
  const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * REC_STRIDE;
    samples[i] = [
      round3(b[o]), round3(b[o + 1]), round3(b[o + 2]), round3(b[o + 3]),
      round3(b[o + 4]), round3(b[o + 5]), round3(b[o + 6]), round3(b[o + 7]),
      round3(b[o + 8]), round3(b[o + 9]), round3(b[o + 10]), round3(b[o + 11]),
    ];
  }
  const f = d && d.lastFeat ? d.lastFeat : makeFeat();
  const v = featView(f);
  return JSON.stringify({
    v: 1,
    kind: 'quadmath-trick-trace',
    id: (d && d.lastId) || '',
    why: (d && d.lastWhy) || '',
    n,
    keys: REC_KEYS,
    feat: {
      dur: round3(f.dur), pitch: round3(f.pitch), roll: round3(f.roll), yaw: round3(f.yaw),
      pathP: round3(v.pathP), pathR: round3(v.pathR), pathY: round3(v.pathY),
      inv: round3(v.inv), opp: round3(v.opp), obj: round3(v.obj), rad: round3(v.rad),
    },
    samples,
  });
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
  d.recN = 0;
  d.recJson = '';
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

export function pushCombo(c, id, now, opts) {
  const o = opts || {};
  const priorCombo = (() => {
    let n = 0;
    for (let i = 0; i < c.n; i++) if (c.ids[i] === id) n++;
    return n;
  })();
  const prior = o.prior != null ? o.prior : priorCombo;
  const nextN = c.n + 1;
  const uniq = uniqueCount(c.ids, c.n) + (priorCombo === 0 ? 1 : 0);
  const pts = scoreTrick(id, prior, nextN, uniq, o);
  if (pts <= 0) return 0;
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
  d.recN = 0;
  const f = resetFeat(d.feat);
  f.alt0 = alt; f.alt1 = alt; f.altMin = alt; f.altMax = alt;
  f.h0x = wx; f.h0z = wz; f.h1x = wx; f.h1z = wz;
  f.head0 = head; f.head1 = head;
  f.spd0 = speed; f.spd1 = speed; f.spdPeak = speed; f.spdMin = speed;
  f.thr0 = thr; f.thr1 = thr; f.thrMin = thr; f.thrMax = thr;
  f.under0 = d.clr.up < 8 ? 1 : 0;
  f.over0 = d.clr.over < 8 ? 1 : 0;
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
  if (f.tPitch90 > 90 && Math.abs(f.pitch) >= QTR) f.tPitch90 = f.dur;
  if (f.tRoll90 > 90 && Math.abs(f.roll) >= QTR) f.tRoll90 = f.dur;
  if (f.tYaw90 > 90 && Math.abs(f.yaw) >= QTR) f.tYaw90 = f.dur;
  if (f.tPitch180 > 90 && Math.abs(f.pitch) >= HALF) f.tPitch180 = f.dur;
  if (f.tRoll180 > 90 && Math.abs(f.roll) >= HALF) f.tRoll180 = f.dur;
  if (f.tYaw180 > 90 && Math.abs(f.yaw) >= HALF) f.tYaw180 = f.dur;
  if (f.tPitch360 > 90 && Math.abs(f.pitch) >= FULL) f.tPitch360 = f.dur;
  if (f.tRoll360 > 90 && Math.abs(f.roll) >= FULL) f.tRoll360 = f.dur;
  if (f.tYaw360 > 90 && Math.abs(f.yaw) >= TAU) f.tYaw360 = f.dur;
  const rad = Math.hypot(wx - f.h0x, wz - f.h0z);
  if (rad > f.radMax) f.radMax = rad;
  if (dr * dy < -1e-6) f.oppRY += 1;
  if (d.clr.up < 8) f.underN += 1;
  if (d.clr.over < 8) f.overN += 1;
  if (d.clr.near < 7) f.objNearN += 1;
  if (d.clr.near < 14) f.objOrbitN += 1;
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
  d.lastSloppy = (d.feat.seg && LOOP_IDS[cls.id]) ? 1 : 0;
  d.lastBump = d.feat.bump ? 1 : 0;
  try { d.recJson = encodeRecJson(d); } catch (e) { d.recJson = ''; }
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

  scanClearance(wx, wy, wz, sample.colliders, d.clr);

  let hit = null;
  const rotating = rate >= RATE_START;
  const diving = thr < 0.18 && rate < 1.55 && vz < -3.8;
  if (armed && !contact && rotating && !d.live && d.lockout <= 0 && !diving) {
    beginFeat(d, alt, wx, wz, head, speed, thr);
  }
  if (d.live) {
    if (contact) d.feat.bump = 1;
    accumFeat(d, sample, dr, dp, dy, step, alt, wx, wz, head, speed, upZ, thr, vx, vy, vz);
    recPush(
      d, d.feat.dur, ox, oy, oz, sx, sy, sz, sw,
      sample.sr || 0, sample.sp || 0, sample.sy || 0, thr,
    );
    if (rate < RATE_END) d.quiet += step;
    else {
      if (d.quiet > 0.14 && d.feat.dur > 0.28) d.feat.seg = 1;
      d.quiet = 0;
    }
    const quietNeed = upZ < -0.22 ? SETTLE_INV_S : SETTLE_S;
    const timedOut = d.feat.dur >= MANEUVER_MAX_S;
    const settled = d.quiet >= quietNeed && d.feat.dur >= 0.22;
    if (settled || timedOut || (contact && d.feat.dur > 0.2)) {
      hit = finishManeuver(d);
    }
  }

  d.px = wx; d.py = wy; d.pz = wz;

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
        d.lastWhy = (BY_ID.dive ? BY_ID.dive.name : 'Dive')
          + '  Beginner  ' + (BY_ID.dive ? BY_ID.dive.points : 100)
          + '  drop=' + d.diveDrop.toFixed(1) + 'm  v=' + speed.toFixed(1);
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
        d.lastWhy = (BY_ID.gap ? BY_ID.gap.name : 'Gap')
          + '  Beginner  ' + (BY_ID.gap ? BY_ID.gap.points : 125)
          + '  travel=' + d.gapTravel.toFixed(1);
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
        d.lastWhy = (BY_ID.prox ? BY_ID.prox.name : 'Proximity')
          + '  Beginner  ' + (BY_ID.prox ? BY_ID.prox.points : 150)
          + '  ' + nearM.toFixed(2) + 'm @' + speed.toFixed(1);
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
  + 'color:#00f0ff;background:rgba(8,6,18,.78);border:1px solid rgba(0,240,255,.28);padding:8px 10px;max-width:420px;'
  + 'text-shadow:0 1px 6px rgba(0,0,0,.8)}'
  + '#trickDbg.on{display:block}'
  + '#trickDbgText{margin:0;white-space:pre}'
  + '#trickDbgCopy{pointer-events:auto;margin-top:8px;display:none;font-family:inherit;font-size:11px;'
  + 'letter-spacing:.08em;text-transform:uppercase;color:#080612;background:#00f0ff;border:0;padding:5px 10px;cursor:pointer}'
  + '#trickDbgCopy.on{display:inline-block}'
  + '#trickDbgCopy.flash{background:#ff2bd6;color:#fff}'
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
  if (dbg && dbg.tagName === 'PRE') {
    dbg.parentNode.removeChild(dbg);
    dbg = null;
  }
  if (!dbg) {
    dbg = doc.createElement('div');
    dbg.id = 'trickDbg';
    dbg.innerHTML = '<pre id="trickDbgText"></pre><button type="button" id="trickDbgCopy">Copy last trace</button>';
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
    dbgText: doc.getElementById('trickDbgText') || dbg,
    dbgCopy: doc.getElementById('trickDbgCopy'),
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
  let copyBound = 0;
  let active = false;
  let mapId = 'city';
  let indoor = mapIsIndoor(mapId);
  let session = 0;
  let streak = 1;
  const sessionCount = Object.create(null);
  let sessionLast = '';
  let sessionB2b = 0;
  let popName = '';
  let popUntil = 0;
  let scoreShown = '';
  let lastHudOn = -1;
  let lastDbgOn = -1;
  let bankFlashUntil = 0;

  function hudWanted() {
    return !!(store.hud && active);
  }

  function fallbackCopy(text) {
    try {
      if (!doc) return false;
      const ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      doc.body.appendChild(ta);
      ta.select();
      const ok = doc.execCommand && doc.execCommand('copy');
      doc.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function copyLastTrace() {
    const text = det.recJson || '';
    if (!text) return false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
        return true;
      }
    } catch (e) { /* fall through */ }
    return fallbackCopy(text);
  }

  function bindCopy() {
    if (copyBound || !hudEls || !hudEls.dbgCopy) return;
    copyBound = 1;
    hudEls.dbgCopy.onclick = function (ev) {
      try {
        if (ev && ev.preventDefault) ev.preventDefault();
        const ok = copyLastTrace();
        if (ok && hudEls.dbgCopy) {
          hudEls.dbgCopy.className = 'on flash';
          hudEls.dbgCopy.textContent = 'Copied';
          setTimeout(function () {
            if (hudEls && hudEls.dbgCopy) {
              hudEls.dbgCopy.className = det.recJson ? 'on' : '';
              hudEls.dbgCopy.textContent = 'Copy last trace';
            }
          }, 900);
        }
      } catch (e) { /* ignore */ }
    };
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
    bindCopy();
    if (lastDbgOn !== 1) {
      hudEls.dbg.className = 'on';
      lastDbgOn = 1;
    }
    if (t - det.dbgT < 0.12 && !det.lastWhy) return;
    det.dbgT = t;
    const f = det.live ? det.feat : det.lastFeat;
    const v = featView(f);
    const recN = det.recN || 0;
    const hasJson = !!(det.recJson);
    const line = (det.live ? 'LIVE' : 'IDLE')
      + '  P' + deg(f.pitch) + ' R' + deg(f.roll) + ' Y' + deg(f.yaw)
      + '\nfol ' + v.follow.toFixed(2) + '  ag ' + v.against.toFixed(2)
      + '  span ' + v.span.toFixed(1) + 'm  hd ' + deg(v.head) + '°'
      + '\ninv ' + v.inv.toFixed(2) + '  close ' + v.close.toFixed(2)
      + '  u' + v.under.toFixed(2) + ' o' + v.over.toFixed(2)
      + '  n ' + f.n + '  ' + f.dur.toFixed(2) + 's'
      + '\nrec ' + recN + (hasJson ? '  JSON ready' : '')
      + '\nlast  ' + (det.lastWhy || '—');
    if (line !== det.dbgLine) {
      det.dbgLine = line;
      if (hudEls.dbgText) hudEls.dbgText.textContent = line;
      else hudEls.dbg.textContent = line;
    }
    if (hudEls.dbgCopy) {
      hudEls.dbgCopy.className = hasJson ? 'on' : '';
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

  function clearSessionHits() {
    streak = 1;
    sessionLast = '';
    sessionB2b = 0;
    for (const k in sessionCount) delete sessionCount[k];
  }

  function award(id) {
    const t = nowFn();
    const remain = comboRemain(combo, t);
    if (combo.live && remain <= 0) bank('timeout');
    const prior = sessionCount[id] || 0;
    const b2b = sessionLast === id ? sessionB2b + 1 : 0;
    const sloppy = !!det.lastSloppy;
    const bump = !!det.lastBump;
    const got = pushCombo(combo, id, t, {
      prior, b2b, sloppy, bump, indoor, streak,
    });
    sessionCount[id] = prior + 1;
    if (sessionLast === id) sessionB2b += 1;
    else sessionB2b = 0;
    sessionLast = id;
    if (got > 0) streak = nextStreak(streak, trickPoints(id, indoor));
    if (bump) streak = Math.max(1, streak * 0.5);
    const def = BY_ID[id];
    popName = def ? def.name : id;
    popUntil = t + 1.05;
    if (got > 0) playBlip(audio, muted, 'trick', combo.mul);
    recordBest(store, mapId, combo.points, session);
    saveStore(store, storage);
    if (sloppy || bump || b2b > 0) bank('exec');
    return got;
  }

  function setActive(on, map) {
    const next = !!on;
    if (map) { mapId = map; indoor = mapIsIndoor(map); }
    if (active && !next) bank('leave');
    if (!active && next) {
      session = 0;
      resetCombo(combo);
      resetDetector(det, null);
      clearSessionHits();
    }
    active = next;
    if (map) { mapId = map; indoor = mapIsIndoor(map); }
    lastHudOn = -1;
  }

  function setMap(id) {
    if (id && id !== mapId) {
      if (active) bank('map');
      session = 0;
      mapId = id;
      indoor = mapIsIndoor(id);
      resetCombo(combo);
      resetDetector(det, null);
      clearSessionHits();
    } else if (id) {
      mapId = id;
      indoor = mapIsIndoor(id);
    }
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
      streak = 1;
      if (det.live) {
        det.live = 0;
        resetFeat(det.feat);
        det.lastId = '';
        det.lastWhy = 'crash 0';
      }
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
    const t = nowFn();
    popUntil = t + 8;
    combo.live = 1;
    combo.n = Math.max(2, combo.n || 2);
    combo.mul = mul == null ? 2.5 : mul;
    combo.points = pts == null ? 1250 : pts;
    combo.lastAt = t + 60;
    session = Math.max(session, 4200);
    let def = BY_ID.sideloop || BY_ID.powerloop;
    let id = 'sideloop';
    if (name) {
      for (let i = 0; i < TRICK_LIST.length; i++) {
        if (TRICK_LIST[i].name === name || TRICK_LIST[i].id === name) {
          def = TRICK_LIST[i];
          id = def.id;
          break;
        }
      }
    }
    det.lastId = id;
    const nm = (def && def.name) || name || 'Side Loop';
    popName = nm;
    const dummy = id === 'ham'
      ? '\n  P8 R10 Y420  fol=0.10 ag=0.08  span=0.4 hd=18  inv=0.96 cl=0.90  obj=0.00 rad=2.0  (yawspin 0.00)'
      : id === 'trippy'
      ? '\n  P5 R12 Y420  fol=0.12 ag=0.08  span=1.1 hd=20  inv=0.00 cl=0.98  obj=0.90 rad=1.1  (yawspin 0.22)'
      : '\n  P0 R360 Y90  fol=0.16 ag=0.08  span=4.2 hd=70  inv=0.28 cl=0.72  (roll 0.12)';
    det.lastWhy = nm + '  ' + (def ? def.tier : 'Novice') + '  ' + (def ? def.points : 200) + dummy;
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
    copyTrace: copyLastTrace,
    lastTrace: function () { return det.recJson || ''; },
    lastWhy: function () { return det.lastWhy; },
    lastId: function () { return det.lastId; },
    lastSloppy: function () { return det.lastSloppy; },
    lastBump: function () { return det.lastBump; },
    indoor: function () { return indoor; },
    streak: function () { return streak; },
    detector: function () { return det; },
    resetDetector: function (s) { resetDetector(det, s); },
  };
}
