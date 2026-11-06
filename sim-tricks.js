// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
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
// A sustained rotation is not cut at MANEUVER_MAX_S: a turn about the vertical
// at Trippy's rate (a Trippy, a Yaw Spin) or a loop's pitch (a run of
// Powerloops) runs on while it keeps turning that way at SUSTAIN_HOLD of its
// rate over the last SUSTAIN_LOOK_S, up to MANEUVER_SUSTAIN_S.
export const MANEUVER_SUSTAIN_S = 10;
export const SUSTAIN_LOOK_S = 0.5;
export const SUSTAIN_HOLD = 0.8;
export const REC_CAP = 240;
export const REC_STRIDE = 12;
export const REC_KEYS = Object.freeze([
  't', 'ox', 'oy', 'oz', 'qx', 'qy', 'qz', 'qw', 'sr', 'sp', 'sy', 'thr',
]);
export const DEAD = 1.15;
// Rotation first (docs/sim-tricks.md "Flip, Roll, Powerloop"): a Flip is
// >= 300 degrees of pitch inside any FLIP_WIN_S window of the segment, a Roll
// >= 300 degrees of roll inside any ROLL_WIN_S window at a mean rate of at
// least 250 deg/s. The page samples the detector on the sim clock, every
// SAMPLE_S of sim time (sim.html onTrickSample), not per rendered frame.
export const SAMPLE_S = 0.004;
export const FLIP_WIN_S = 1.2;
export const ROLL_WIN_S = 1.5;
// Each segment's history, one row of HIST_W per step, for the windows and
// the phase matcher: t, pitch, roll, the yaw about the vertical (vyaw,
// below), the horizontal position in metres (x, z), the altitude (m), up-Z,
// velocity·nose (NaN below 0.85 m/s), the velocity along physics x (m/s),
// the objects at hand (PH_OVER: one below, PH_UNDER: one above), the
// authored gaps passed so far, the velocity along physics y, the heading
// (rad), the yaw about the body's up axis and the twist (rad, each summed
// from the segment's start; the twist below, BARANI_P). MANEUVER_SUSTAIN_S
// at 1 ms steps fits.
export const HIST_CAP = 10240;
export const HIST_W = 16;
// Powerloop: >= 300 degrees of pitch inside any LOOP_WIN_S window (a loop is
// slower than a flip). The loops are counted over the segment's whole turn
// of pitch the loop's way: two from LOOP_TWO (600 degrees), then one more for
// each further 360 (loopCount); each loop scores the Powerloop's points.
export const LOOP_WIN_S = 3.5;
export const LOOP_MIN = 5.236;
export const LOOP_TWO = 10.472;
// Trippy Spin: >= 360 degrees of turn about the vertical at >= 150 deg/s (so
// inside 2.4 s) while the path orbits a centre 0.3-2.5 m away, a full turn,
// at >= 1 m/s. Upright or inverted; the body may roll as it spins.
// The orbit centre within POLE_NEAR_M of a pole or post (a collider at most
// POLE_W_M across and at least POLE_H_M tall) earns TRIPPY_POLE_MUL points.
export const TRIPPY_WIN_S = 2.4;
// The spin's rate (150 deg/s), and the share of it the spin keeps while the
// orbit is measured over all of it.
export const TRIPPY_RATE = 2.618;
export const TRIPPY_HOLD = 0.8;
export const POLE_W_M = 0.5;
export const POLE_H_M = 1.0;
export const POLE_NEAR_M = 0.5;
export const TRIPPY_POLE_MUL = 1.25;
// Barani, as the owner flies it: BARANI_P or more of pitch path (the pitch
// turned either way, summed: a twist turns the body round, so the same flip
// pitches the body the other way after it) with a half twist (180 +- 45
// degrees) inside it, ending upright. Any climb, any time. The twist is the
// turn about the body axis nearest the flight path: roll when the nose is
// along it (flying level), yaw when the up axis is (punched up, or inverted
// and falling); slower than TWIST_SPD (m/s), where the path is no direction
// to speak of, whichever of the two turns faster. Inside: BARANI_SIDE of
// pitch path or more before the twist is half done, and after. 300 degrees
// fades over BARANI_FADE (the owner's 38.1 s Barani turned 299).
export const BARANI_P = 5.236;
export const BARANI_FADE = 0.35;
export const BARANI_SIDE = 1.047;
export const TWIST_SPD = 3;
// Ham Spin (the inverted yaw spin): >= HAM_MIN of turn about the vertical
// counted only while inverted, up-Z below HAM_UPZ (tilted more than 120
// degrees). The half flips in and out turn little about the vertical and
// count only while past HAM_UPZ, so they are allowed and score no Flip.
export const HAM_UPZ = -0.5;
export const HAM_MIN = 5.236;
// The phase matcher (PHASE_SPECS, measureSpec): outside a trick's phases,
// pitch and roll each turn at most PH_SLOP (rad), and inside a phase the
// other one at most PH_CROSS. One segment of at most MANEUVER_MAX_S, scanned
// on at most PH_ROWS rows of its history.
export const PH_SLOP = 0.785;
export const PH_CROSS = 0.785;
export const PH_ROWS = 200;
export const PH_OVER = 1;
export const PH_UNDER = 2;
// Maverick: back out through the authored gap it came in by (passed at most
// MAV_GAP_S before the segment began, or in it) earns MAV_GAP_MUL points.
export const MAV_GAP_S = 1.5;
export const MAV_GAP_MUL = 1.25;
// Compound tricks across segments: consecutive segments with pauses under
// MERGE_GAP_S between them, none scored, are scored as one too (mergeFeat).
export const MERGE_GAP_S = 0.8;
// The detector's altitude ring, for the climb before a maneuver (steps).
export const ALT_RING = 512;
// Gap, without an authored volume: both sides of the opening within
// GAP_SIDE_K frame widths of the path, passed through at least
// GAP_MIN_DEPTH_M. FRAME_W_M when the page does not say the quad's width.
export const GAP_SIDE_K = 2.5;
export const GAP_MIN_DEPTH_M = 0.1;
export const FRAME_W_M = 0.09;
// One authored gap scores again only after this long.
export const GAP_REPEAT_S = 1.0;
// No generic gap within this of an authored one (its walls start there).
export const GAP_NEAR_M = 0.3;
// Below this speed (m/s) the path has no direction to sweep (Powerloop).
export const SWEEP_MIN_SPD = 0.8;
// The recorder keeps one sample per REC_DT_S of segment time.
export const REC_DT_S = 1 / 60;
export const STREAK_CAP = 2;
export const SLOPPY_MUL = 0.65;
export const BUMP_MUL = 0.5;

const INDOOR_IDS = Object.freeze({
  living: 1, garage: 1, warehouse: 1, office: 1, gym: 1, trainer: 1, room: 1, rig: 1, depot: 1,
});

export const TRICK_LIST = Object.freeze([
  Object.freeze({ id: 'flip', name: 'Flip', tier: 'Beginner', points: 50, pointsIn: 75, type: 'Open Air' }),
  Object.freeze({ id: 'roll', name: 'Roll', tier: 'Beginner', points: 50, pointsIn: 75, type: 'Open Air' }),
  Object.freeze({ id: 'yawspin', name: 'Yaw Spin', tier: 'Beginner', points: 50, pointsIn: 75, type: 'Open Air' }),
  Object.freeze({ id: 'maverick', name: 'Maverick Loop', tier: 'Beginner', points: 100, pointsIn: 100, type: 'Maverick Loops' }),
  Object.freeze({ id: 'splits', name: 'Split-S', tier: 'Beginner', points: 100, pointsIn: 100, type: "Split S'" }),
  Object.freeze({ id: 'immelmann', name: 'Immelmann', tier: 'Beginner', points: 100, pointsIn: 100, type: "Split S'" }),
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
  Object.freeze({ id: 'halfmavvy', name: 'Half Mavvy', tier: 'Intermediate', points: 400, pointsIn: 400, type: 'Maverick Loops' }),
  Object.freeze({ id: 'cubik', name: "Cubik's Rube", tier: 'Intermediate', points: 350, pointsIn: 450, type: 'Open Air' }),
  Object.freeze({ id: 'ham', name: 'Ham Spin', tier: 'Intermediate', points: 300, pointsIn: 300, type: 'Open Air' }),
  Object.freeze({ id: 'trippy', name: 'Trippy Spin', tier: 'Intermediate', points: 500, pointsIn: 500, type: 'Pole Dancing' }),
  Object.freeze({ id: 'barani', name: 'Barani', tier: 'Novice', points: 100, pointsIn: 125, type: 'Open Air' }),
]);

const BY_ID = Object.create(null);
for (let i = 0; i < TRICK_LIST.length; i++) BY_ID[TRICK_LIST[i].id] = TRICK_LIST[i];
export const TRICK_BY_ID = BY_ID;

const DIVE_DROP = 3.4;
const DIVE_VZ = -6.5;
const PROX_M = 0.42;
const PROX_SPD = 7.5;
const COMBO_IDS = 16;
const PI = Math.PI;
const TAU = PI * 2;
const HALF = PI * 0.78;
const FULL = 5.2;
const QTR = 1.15;
const CLASS_IDS = [
  'halfmavvy', 'rubik', 'cubik', 'barani', 'immelmann', 'ham', 'trippy', 'sideloop', 'juicyflick', 'snapback', 'halfmatty',
  'powerloop', 'matty', 'maverick', 'splits', 'cradle', 'flip', 'roll', 'yawspin',
];
const SPEC = {
  halfmavvy: 0.13, rubik: 0.12, cubik: 0.12, barani: 0.12, immelmann: 0.12, ham: 0.11, trippy: 0.11, sideloop: 0.11, juicyflick: 0.11, snapback: 0.11,
  halfmatty: 0.10, powerloop: 0.11, matty: 0.11, maverick: 0.10, splits: 0.10,
  cradle: 0.08, flip: 0, roll: 0, yawspin: 0,
};
const LOOP_IDS = { powerloop: 1, matty: 1, maverick: 1, splits: 1, halfmatty: 1, trippy: 1, sideloop: 1, halfmavvy: 1, immelmann: 1 };

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
    * (o.streak == null ? 1 : o.streak)
    * (o.bonus > 0 ? o.bonus : 1);
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
    // Rotation windows (finishManeuver, spanWithin): the largest rise and
    // fall of the pitch angle inside any FLIP_WIN_S, of the roll angle inside
    // any ROLL_WIN_S, rad, and for roll the seconds between the two ends.
    flipUp: 0, flipDn: 0, rollUp: 0, rollDn: 0, rollUpT: 0, rollDnT: 0,
    // Powerloop: the largest rise and fall of the pitch angle inside any
    // LOOP_WIN_S, and the whole segment's largest turn of pitch the loop's
    // way (rad, the loops' count).
    loopUp: 0, loopDn: 0, loopTot: 0,
    // Path (Powerloop): the lowest altitude after the highest, m, and the
    // signed turn of the velocity in the vertical plane of the entry heading,
    // rad (+ climbing away from the entry heading, as a nose-up loop does).
    postMin: 0, sweep: 0, sweepTh: 0, sweepOn: 0,
    // Trippy: the largest rise and fall of the turn about the vertical inside TRIPPY_WIN_S
    // (rad) and the seconds between their ends; the circle the path fits over
    // that yaw (radius m, rms misfit over radius, angle swept round its centre
    // rad, mean horizontal speed m/s, its centre scene units) and whether a
    // pole or post stands at the centre.
    yawUp: 0, yawDn: 0, yawUpT: 0, yawDnT: 0,
    // The turn about the world vertical (rad): each step's body rotation
    // carried into the world, its up component. A tilted spin turns the
    // heading at the full rate while its body-axis yaw sees only cos(tilt).
    vyaw: 0,
    // The twist (rad, summed): each step's turn about the body axis nearest
    // the flight path, roll or yaw (BARANI_P).
    twist: 0,
    orbitR: 0, orbitFit: 9, orbitSweep: 0, orbitTurn: 0, orbitSpd: 0, orbitCx: 0, orbitCz: 0, orbitPole: 0,
    // Barani (baraniWithin): the pitch path and |twist| of the stretch that
    // scores best as a Barani's, the twist inside the pitch; up-Z at the end.
    barP: 0, barR: 0, upEnd: 1,
    // Ham: the turn about the vertical while up-Z < HAM_UPZ (rad): its
    // running sum (invC) and that sum's lowest and highest so far (invLo,
    // invHi) give the largest rise and fall (invYawUp, invYawDn); invYawT is
    // the seconds spent there.
    invC: 0, invLo: 0, invHi: 0, invYawUp: 0, invYawDn: 0, invYawT: 0,
    // The phase matcher's scores, one per trick it defines (PHASE_SPECS,
    // 0-1), set when the segment finishes.
    phFlip: 0, phLoop: 0, phSplits: 0, phImmel: 0, phMav: 0, phMatty: 0, phHMatty: 0, phHMavvy: 0,
    // The entry's horizontal direction of travel (unit, physics x and y; 0, 0
    // until it moves), authored gaps passed in the segment, and the Maverick's
    // gap: the volume it came in by (index + 1, 0: none) and that pass's entry
    // face, and whether it went back out through it (gapBack).
    u0x: 0, u0y: 0, gapN: 0, gapIn: 0, gapInFin: -1, gapBack: 0,
    // The altitude 1.0 s before the segment began (m), for a climb flown
    // before the rotation (the Matty's).
    alt1s: 0,
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
  f.flipUp = 0; f.flipDn = 0; f.rollUp = 0; f.rollDn = 0; f.rollUpT = 0; f.rollDnT = 0;
  f.loopUp = 0; f.loopDn = 0; f.loopTot = 0;
  f.postMin = 0; f.sweep = 0; f.sweepTh = 0; f.sweepOn = 0;
  f.yawUp = 0; f.yawDn = 0; f.yawUpT = 0; f.yawDnT = 0; f.vyaw = 0; f.twist = 0;
  f.orbitR = 0; f.orbitFit = 9; f.orbitSweep = 0; f.orbitTurn = 0; f.orbitSpd = 0; f.orbitCx = 0; f.orbitCz = 0; f.orbitPole = 0;
  f.barP = 0; f.barR = 0; f.upEnd = 1;
  f.invC = 0; f.invLo = 0; f.invHi = 0; f.invYawUp = 0; f.invYawDn = 0; f.invYawT = 0;
  f.phFlip = 0; f.phLoop = 0; f.phSplits = 0; f.phImmel = 0; f.phMav = 0; f.phMatty = 0; f.phHMatty = 0; f.phHMavvy = 0;
  f.u0x = 0; f.u0y = 0; f.gapN = 0; f.gapIn = 0; f.gapInFin = -1; f.gapBack = 0;
  f.alt1s = 0;
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
  d.flipUp = src.flipUp; d.flipDn = src.flipDn; d.rollUp = src.rollUp; d.rollDn = src.rollDn;
  d.rollUpT = src.rollUpT; d.rollDnT = src.rollDnT;
  d.loopUp = src.loopUp; d.loopDn = src.loopDn; d.loopTot = src.loopTot;
  d.postMin = src.postMin; d.sweep = src.sweep; d.sweepTh = src.sweepTh; d.sweepOn = src.sweepOn;
  d.yawUp = src.yawUp; d.yawDn = src.yawDn; d.yawUpT = src.yawUpT; d.yawDnT = src.yawDnT; d.vyaw = src.vyaw; d.twist = src.twist;
  d.orbitR = src.orbitR; d.orbitFit = src.orbitFit; d.orbitSweep = src.orbitSweep; d.orbitTurn = src.orbitTurn; d.orbitSpd = src.orbitSpd;
  d.orbitCx = src.orbitCx; d.orbitCz = src.orbitCz; d.orbitPole = src.orbitPole;
  d.barP = src.barP; d.barR = src.barR; d.upEnd = src.upEnd;
  d.invC = src.invC; d.invLo = src.invLo; d.invHi = src.invHi;
  d.invYawUp = src.invYawUp; d.invYawDn = src.invYawDn; d.invYawT = src.invYawT;
  d.phFlip = src.phFlip; d.phLoop = src.phLoop; d.phSplits = src.phSplits; d.phImmel = src.phImmel;
  d.phMav = src.phMav; d.phMatty = src.phMatty; d.phHMatty = src.phHMatty; d.phHMavvy = src.phHMavvy;
  d.u0x = src.u0x; d.u0y = src.u0y; d.gapN = src.gapN; d.gapIn = src.gapIn; d.gapInFin = src.gapInFin; d.gapBack = src.gapBack;
  d.alt1s = src.alt1s;
  return d;
}

// The largest rise and fall of column k of a segment's history (rows of
// stride w: t, pitch, roll, yaw, ...) inside any window of win seconds, the
// time between the two ends of each and their rows: monotonic deques, O(n).
// out: { up, upT, upA, upB, dn, dnT, dnA, dnB }.
export function spanWithin(hist, n, k, win, out, dq, w) {
  const W = w || HIST_W;
  const o = out || {};
  o.up = 0; o.upT = 0; o.upA = 0; o.upB = 0; o.dn = 0; o.dnT = 0; o.dnA = 0; o.dnB = 0;
  const q = dq || new Int32Array(Math.max(1, n) * 2);
  const half = q.length >> 1;
  // q[0..half): indices of rising minima; q[half..): falling maxima.
  let h0 = 0, t0 = 0, h1 = half, t1 = half;
  for (let b = 0; b < n; b++) {
    const tb = hist[b * W], ab = hist[b * W + k];
    while (t0 > h0 && hist[q[t0 - 1] * W + k] >= ab) t0--;
    q[t0++] = b;
    while (hist[q[h0] * W] < tb - win) h0++;
    while (t1 > h1 && hist[q[t1 - 1] * W + k] <= ab) t1--;
    q[t1++] = b;
    while (hist[q[h1] * W] < tb - win) h1++;
    const lo = q[h0], hi = q[h1];
    const up = ab - hist[lo * W + k];
    if (up > o.up) { o.up = up; o.upT = tb - hist[lo * W]; o.upA = lo; o.upB = b; }
    const dn = hist[hi * W + k] - ab;
    if (dn > o.dn) { o.dn = dn; o.dnT = tb - hist[hi * W]; o.dnA = hi; o.dnB = b; }
  }
  return o;
}

// How the horizontal path (history columns 4, 5: metres) curves over rows
// a..b, into out:
// - sweep: how far the path's direction turned (|signed sum|, rad);
// - turn: that over the sum of its turns either way (1: one way throughout);
// - r: its radius of curvature, path length over sweep (m);
// - spd: mean horizontal speed (m/s);
// - cx, cz (m), kr (m), fit: the circle the path fits (Kasa's algebraic fit
//   about the mean): its centre (the orbit's, for a pole there), radius and
//   rms distance from it over that radius.
export function orbitFit(hist, a, b, out, w) {
  const W = w || HIST_W;
  const o = out || {};
  o.r = 0; o.fit = 9; o.sweep = 0; o.turn = 0; o.spd = 0; o.cx = 0; o.cz = 0; o.kr = 0;
  const n = b - a + 1;
  if (n < 8) return o;
  let mx = 0, mz = 0;
  for (let i = a; i <= b; i++) { mx += hist[i * W + 4]; mz += hist[i * W + 5]; }
  mx /= n; mz /= n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (let i = a; i <= b; i++) {
    const u = hist[i * W + 4] - mx, v = hist[i * W + 5] - mz;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (!(Math.abs(det) > 1e-12)) return o;
  const ru = 0.5 * (suuu + suvv), rv = 0.5 * (svvv + svuu);
  const uc = (ru * svv - rv * suv) / det, vc = (rv * suu - ru * suv) / det;
  const kr = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  const cx = mx + uc, cz = mz + vc;
  let res = 0, path = 0, turnSum = 0, turnAbs = 0, haveDir = 0, dir = 0;
  let px = hist[a * W + 4], pz = hist[a * W + 5];
  for (let i = a; i <= b; i++) {
    const x = hist[i * W + 4], z = hist[i * W + 5];
    const dist = Math.hypot(x - cx, z - cz);
    res += (dist - kr) * (dist - kr);
    const step = Math.hypot(x - px, z - pz);
    // The direction of travel over each 2 cm of path or more (finer steps
    // are noise at 4 ms).
    if (step >= 0.02) {
      const nd = Math.atan2(z - pz, x - px);
      if (haveDir) {
        const dd = unwrapDelta(dir, nd);
        turnSum += dd; turnAbs += Math.abs(dd);
      }
      dir = nd; haveDir = 1;
      path += step;
      px = x; pz = z;
    }
  }
  const dt = hist[b * W] - hist[a * W];
  const sweep = Math.abs(turnSum);
  o.sweep = sweep; o.turn = turnAbs > 0 ? sweep / turnAbs : 0;
  o.r = sweep > 1e-6 ? path / sweep : 99;
  o.spd = dt > 0 ? path / dt : 0;
  o.cx = cx; o.cz = cz; o.kr = kr; o.fit = kr > 0 ? Math.sqrt(res / n) / kr : 9;
  return o;
}

// Barani: over a segment's history (rows of stride w), the stretch a..b
// whose pitch path (the pitch turned either way, summed) and |twist| (the
// twist column's change) score best as a Barani's: BARANI_P of pitch path
// (faded over BARANI_FADE) and a twist of 180 +- 45 degrees, the twist
// inside the pitch (BARANI_SIDE of pitch path or more before the row where
// the twist is half done, and after it). Ends on every PH_ROWS-th row, the
// pitch path summed over every row; among equals, the twist nearer 180.
// out: { p, r } (rad; 0 when none).
const _barPP = new Float64Array(PH_ROWS + 2);
const _barTW = new Float64Array(PH_ROWS + 2);
export function baraniWithin(hist, n, out, w) {
  const W = w || HIST_W;
  const o = out || {};
  o.p = 0; o.r = 0;
  if (!hist || n < 2) return o;
  const stride = Math.max(1, Math.ceil(n / PH_ROWS));
  const m = Math.ceil((n - 1) / stride) + 1;
  // The pitch path and the twist at each kept row.
  let path = 0, j = 0;
  _barPP[0] = 0; _barTW[0] = hist[15];
  for (let r = 1; r < n; r++) {
    path += Math.abs(hist[r * W + 1] - hist[(r - 1) * W + 1]);
    if (r === n - 1 || r % stride === 0) { j++; _barPP[j] = path; _barTW[j] = hist[r * W + 15]; }
  }
  const lo = BARANI_P - BARANI_FADE;
  if (path < lo) return o;
  let best = 0, bestOff = 9;
  for (let ja = 0; ja < m - 1; ja++) {
    for (let jb = m - 1; jb > ja; jb--) {
      const P = _barPP[jb] - _barPP[ja];
      if (P < lo) break;
      const raw = _barTW[jb] - _barTW[ja], T = Math.abs(raw);
      const sc = atLeast(P, BARANI_P, BARANI_FADE) * inBand(T, 2.356, 3.927, 0);
      if (!(sc > 0)) continue;
      const off = Math.abs(T - Math.PI);
      if (sc < best - 1e-9 || (sc <= best + 1e-9 && off >= bestOff)) continue;
      // Inside the pitch: the row where the twist is half done.
      const sg = raw >= 0 ? 1 : -1;
      let k = ja + 1;
      while (k < jb && sg * (_barTW[k] - _barTW[ja]) < T / 2) k++;
      if (_barPP[k] - _barPP[ja] < BARANI_SIDE || _barPP[jb] - _barPP[k] < BARANI_SIDE) continue;
      best = sc; bestOff = off; o.p = P; o.r = T;
    }
  }
  return o;
}

// Is there a pole or post (a collider at most POLE_W_M across, at least
// POLE_H_M tall) within POLE_NEAR_M of the point (scene units x, z)?
export function poleNear(colliders, x, z, ws) {
  if (!colliders || !colliders.length) return 0;
  const s = ws || 3.5;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c || !c.min || !c.max) continue;
    const w = Math.max(c.max.x - c.min.x, c.max.z - c.min.z);
    if (w > POLE_W_M * s || c.max.y - c.min.y < POLE_H_M * s) continue;
    const dx = x < c.min.x ? c.min.x - x : (x > c.max.x ? x - c.max.x : 0);
    const dz = z < c.min.z ? c.min.z - z : (z > c.max.z ? z - c.max.z : 0);
    if (Math.hypot(dx, dz) <= POLE_NEAR_M * s) return 1;
  }
  return 0;
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

// ---- The phase matcher ----
//
// A trick as ordered phases, one matcher for every trick defined so
// (docs/sim-tricks.md "Phase matcher"). A phase is a turn about one axis:
//   ax    'p' pitch, 'r' roll (body axes), 'v' the turn about the vertical
//   sg    the way: pitch +1 forward (nose down, a front flip's way), -1 back
//         (nose up, a Powerloop's); roll +1 right; 0 either way, the larger
//   lo, hi, fade   the turn that way (rad): atLeast(turn, lo, fade), and
//         atMost(turn, hi, fade) when hi is set
//   win   inside at most win seconds: the largest such turn anywhere in the
//         segment (spanWithin), for a trick of that one phase alone
// and, when asked:
//   climb  the climb in the phase (m): its highest point above the lowest
//          before it; with climbFrom 'pre', above the altitude 1.0 s before
//          the maneuver began, climbed into (no lower at the start than
//          then: a climb flown into the rotation, not one made inside it
//          after a descent)
//   up     it ends upright (1: up-Z >= 0.5) or inverted (-1: up-Z <= -0.5)
//   over   an object below the quad (PH_OVER) at or before its highest point
//   under  after that highest point, an object above it (PH_UNDER) or an
//          authored gap passed through
//   ag     the share of the phase flown against the nose (velocity·nose
//          under -0.18, of the steps it is known) at least this
// The phases follow one another. Before the first and after the last, pitch
// and roll each turn at most PH_SLOP (lead, trail; a trick's lead may allow
// more); inside a phase, the one of the two it does not turn about at most
// PH_CROSS (a trick's cross may allow more), and its own axis turns back
// against its way at most PH_CROSS (back: the phase is one turn, not a turn
// and part of the next). A trick may also ask:
//   tail  { dot, t }: from the last phase's start, a final stretch of t
//         seconds or more moving back along the entry's direction of travel
//         with velocity·nose at most dot on average (flying against the nose)
//   seg   terms on the whole maneuver, [value, '>=' | '<=', a, fade], on
//         featView's values and upEnd, rollFirst, pitch (net, rad), dur (s),
//         againstNose (the share flown against the nose, or of the inverted
//         part, the larger)
//   merge the trick may span consecutive segments (mergeFeat): a compound
//         trick the segmentation split at a pause
//   still across the phases, first to last, the roll and the yaw (about the
//         body's up axis) each turn at most this (rad, the most each turned
//         from its lowest to its highest): no twist in it
// matchSpec scores one set of measured phases (0-1); measureSpec finds the
// best set in a history. The scores are the features classifyFeat reads
// (f.phFlip ... f.phHMavvy); the attempt-log replay scores logs that predate
// them with matchSpec on what the logs measured.
export const PHASE_SPECS = Object.freeze({
  // Flip: >= 300 degrees of pitch inside FLIP_WIN_S, either way.
  flip: Object.freeze({
    ph: [{ ax: 'p', sg: 0, lo: 5.236, win: FLIP_WIN_S }],
    seg: [['absR', '<=', 1.7, 0.6], ['absY', '<=', 1.9, 0.6]],
  }),
  // Powerloop: >= 300 degrees of pitch inside LOOP_WIN_S, whose path climbs
  // 1.5 m, comes back down to 1.5 m above its entry or lower and turns its
  // velocity 270 degrees the way the pitch turns.
  powerloop: Object.freeze({
    ph: [{ ax: 'p', sg: 0, lo: 5.236, win: LOOP_WIN_S }],
    seg: [['absR', '<=', 1.7, 0.6], ['absY', '<=', 1.9, 0.6], ['loopRise', '>=', 1.5, 0], ['loopRet', '>=', -1.5, 0], ['loopSweep', '>=', 4.712, 0]],
  }),
  // Split-S: a roll of 103-258 degrees, then a back pitch of 69-258, the
  // path dropping 0.35 m, flying with the nose.
  splits: Object.freeze({
    ph: [{ ax: 'r', sg: 0, lo: 1.8, hi: 4.5, fade: 0.45 }, { ax: 'p', sg: -1, lo: 1.2, hi: 4.5, fade: 0.45 }],
    seg: [['drop', '>=', 0.35, 0.25], ['inv', '>=', 0.06, 0.05], ['rollFirst', '>=', 0.02, 0.10], ['follow', '>=', 0.18, 0.12], ['absY', '<=', 2.4, 0.7], ['pathR', '<=', 5.4, 0.6]],
  }),
  // Immelmann, the Split-S's mirror: a back pitch of 180 +- 45 degrees
  // climbing 1 m, then a roll of 180 +- 45; upright, the heading turned
  // 180 +- 45, out higher than in.
  immelmann: Object.freeze({
    ph: [{ ax: 'p', sg: -1, lo: 2.356, hi: 3.927, climb: 1 }, { ax: 'r', sg: 0, lo: 2.356, hi: 3.927 }],
    seg: [['upEnd', '>=', 0.5, 0], ['head', '>=', 2.356, 0], ['drop', '<=', 0, 0]],
    merge: 1,
  }),
  // Maverick, as the owner flies it: a pull back of 120-225 degrees,
  // climbing 1 m, a forward pitch of 60 or more that stops it, then back
  // towards the entry against the nose (velocity·nose -0.3 or less) for
  // 0.3 s: the glide back. It need not go inverted (the owner's top out at
  // about 70 degrees past level). Often two segments (the pull, the push).
  // No twist between the pull and the push: the roll and the yaw each turn
  // under 60 degrees across them (a Barani twisted with yaw at its top
  // pitches the body back, then forward, too).
  maverick: Object.freeze({
    ph: [{ ax: 'p', sg: -1, lo: 2.094, hi: 3.927, climb: 1 }, { ax: 'p', sg: 1, lo: 1.047 }],
    tail: { dot: -0.3, t: 0.3 },
    still: 1.047,
    merge: 1,
  }),
  // Matty, as the owner flies it: 250-400 degrees of forward pitch over an
  // object, climbed into (1 m from 1.0 s before the maneuver began to the
  // top), flown against the nose half the time or more, upright at the end.
  matty: Object.freeze({
    ph: [{ ax: 'p', sg: 1, lo: 4.363, hi: 6.981, climb: 1, climbFrom: 'pre', over: 1 }],
    seg: [['upEnd', '>=', 0.5, 0], ['againstNose', '>=', 0.5, 0]],
    merge: 1,
  }),
  // Half Matty: a Matty's first 180 +- 45: over the object, inverted behind it.
  halfmatty: Object.freeze({
    ph: [{ ax: 'p', sg: 1, lo: 2.356, hi: 3.927, climb: 1, over: 1, up: -1 }],
    seg: [['upEnd', '<=', -0.5, 0]],
    merge: 1,
  }),
  // Half Mavvy, as the owner flies it: forward pitch, a roll of 180 +- 45
  // between its halves, forward pitch on to upright; 330-450 degrees of
  // forward pitch net, a climb of 3 m or more, 2 s or longer. The pull-up
  // before it may turn 120 degrees (lead); the pitch may run on through the
  // roll (cross 90). Through an object: under one (an object above, PH_UNDER)
  // a quarter of the maneuver or more, and after the roll flown against the
  // nose 0.3 of the time or more. Without that it is a Barani.
  halfmavvy: Object.freeze({
    ph: [{ ax: 'p', sg: 1, lo: 1.047 }, { ax: 'r', sg: 0, lo: 2.356, hi: 3.927 }, { ax: 'p', sg: 1, lo: 1.571, ag: 0.3 }],
    seg: [['pitch', '>=', 5.76, 0], ['pitch', '<=', 7.854, 0], ['loopRise', '>=', 3, 0], ['dur', '>=', 2, 0], ['upEnd', '>=', 0.5, 0], ['under', '>=', 0.25, 0]],
    lead: 2.094, cross: 1.571,
    merge: 1,
  }),
});
// The feature each trick's score goes to.
export const PHASE_FIELD = Object.freeze({
  flip: 'phFlip', powerloop: 'phLoop', splits: 'phSplits', immelmann: 'phImmel',
  maverick: 'phMav', matty: 'phMatty', halfmatty: 'phHMatty', halfmavvy: 'phHMavvy',
});
const PH_COL = { p: 1, r: 2, v: 3 };
const PH_TIE = 0.05;

// classifyFeat's rollFirst: seconds from the roll's quarter turn to the
// pitch's (+: the roll came first).
function rollFirstOf(f) {
  const tR = f.tRoll90 < 90 ? f.tRoll90 : (f.tRoll180 < 90 ? f.tRoll180 : 99);
  const tP = f.tPitch90 < 90 ? f.tPitch90 : (f.tPitch180 < 90 ? f.tPitch180 : 99);
  return (tR < 90 && tP < 90) ? (tP - tR) : (tR < 90 && tP >= 90 ? 0.5 : -0.5);
}

function segValue(name, f, v) {
  switch (name) {
    case 'upEnd': return f.upEnd;
    case 'rollFirst': return rollFirstOf(f);
    case 'pitch': return f.pitch;
    case 'dur': return f.dur;
    case 'againstNose': return Math.max(v.against || 0, v.invAg || 0);
    default: return v[name];
  }
}

function segTerm(g, f, v) {
  const x = segValue(g[0], f, v);
  return g[1] === '>=' ? atLeast(x, g[2], g[3]) : atMost(x, g[2], g[3]);
}

// One phase's terms on its measurement m: { turn, t, climb, up, over, under,
// ag, cross, back } (turn the phase's way, rad); crossMax: the trick's cross.
export function phaseTerm(ph, m, crossMax) {
  const fade = ph.fade || 0;
  let s = atLeast(m.turn, ph.lo, fade);
  if (ph.hi != null) s *= atMost(m.turn, ph.hi, fade);
  if (!(s > 0)) return 0;
  if (ph.win != null) return m.t > ph.win + 1e-9 ? 0 : s;
  if (ph.climb != null && !(m.climb >= ph.climb)) return 0;
  if (ph.up === 1 && !(m.up >= 0.5)) return 0;
  if (ph.up === -1 && !(m.up <= -0.5)) return 0;
  if (ph.over && !m.over) return 0;
  if (ph.under && !m.under) return 0;
  if (ph.ag != null && !(m.ag >= ph.ag)) return 0;
  if (!(m.cross <= (crossMax || PH_CROSS)) || !(m.back <= PH_CROSS)) return 0;
  return s;
}

// A trick's score (0-1) on measured phases ms: { ph: [m, ...], lead, trail,
// tail, still } and the maneuver's features.
export function matchSpec(spec, ms, f, v) {
  const ph = spec.ph;
  if (!ms || !ms.ph || ms.ph.length !== ph.length) return 0;
  let s = 1;
  for (let i = 0; i < ph.length; i++) s *= phaseTerm(ph[i], ms.ph[i], spec.cross);
  if (spec.seg) for (let i = 0; i < spec.seg.length; i++) s *= segTerm(spec.seg[i], f, v);
  if (spec.tail) s *= atLeast(ms.tail || 0, spec.tail.t, 0);
  if (spec.still != null) s *= atMost(ms.still || 0, spec.still, 0);
  if (ph[0].win == null) s *= atMost(ms.lead || 0, spec.lead || PH_SLOP, 0) * atMost(ms.trail || 0, PH_SLOP, 0);
  return s;
}

// Rows a..b of a history (stride HIST_W) as phase ph's measurement; pre:
// the altitude 1.0 s before the maneuver began.
function measurePhase(H, ph, a, b, pre, out) {
  const W = HIST_W, col = PH_COL[ph.ax];
  const m = out || {};
  const raw = H[b * W + col] - H[a * W + col];
  m.turn = ph.sg > 0 ? raw : ph.sg < 0 ? -raw : Math.abs(raw);
  m.sign = raw >= 0 ? 1 : -1;
  m.a = a; m.b = b;
  m.t = H[b * W] - H[a * W];
  let altMax = H[a * W + 6], apex = a, low = altMax, rise = 0, firstOver = -1, lastUnder = -1;
  let hiA = H[a * W + col], loA = hiA, ddUp = 0, ddDn = 0, aN = 0, agN = 0;
  for (let r = a; r <= b; r++) {
    const o = r * W;
    const A = H[o + col];
    const dot = H[o + 8];
    if (dot === dot) { aN++; if (dot < -0.18) agN++; }
    if (A > hiA) hiA = A; else if (hiA - A > ddUp) ddUp = hiA - A;
    if (A < loA) loA = A; else if (A - loA > ddDn) ddDn = A - loA;
    const alt = H[o + 6];
    if (alt > altMax) { altMax = alt; apex = r; }
    if (alt < low) low = alt; else if (alt - low > rise) rise = alt - low;
    if ((H[o + 10] & PH_OVER) && firstOver < 0) firstOver = r;
    if ((H[o + 10] & PH_UNDER) || (r > a && H[o + 11] > H[o - W + 11])) lastUnder = r;
  }
  m.climb = ph.climbFrom === 'pre' ? (H[6] >= pre ? altMax - pre : 0) : rise;
  m.up = H[b * W + 7];
  m.over = firstOver >= 0 && firstOver <= apex ? 1 : 0;
  m.under = lastUnder > apex ? 1 : 0;
  m.ag = aN ? agN / aN : 0;
  const dP = Math.abs(H[b * W + 1] - H[a * W + 1]), dR = Math.abs(H[b * W + 2] - H[a * W + 2]);
  m.cross = col === 1 ? dR : col === 2 ? dP : Math.max(dP, dR);
  m.back = ph.sg > 0 || (ph.sg === 0 && raw >= 0) ? ddUp : ddDn;
  return m;
}

// Across rows a..b, the most the roll and the yaw about the body's up axis
// each turned (from its lowest to its highest), the larger (rad).
function stillOf(H, a, b) {
  const W = HIST_W;
  let rLo = H[a * W + 2], rHi = rLo, yLo = H[a * W + 14], yHi = yLo;
  for (let r = a + 1; r <= b; r++) {
    const R = H[r * W + 2], Y = H[r * W + 14];
    if (R < rLo) rLo = R; else if (R > rHi) rHi = R;
    if (Y < yLo) yLo = Y; else if (Y > yHi) yHi = Y;
  }
  return Math.max(rHi - rLo, yHi - yLo);
}

// Pitch and roll's turn between rows a and b, the larger.
function turnPR(H, a, b) {
  const W = HIST_W;
  return Math.max(Math.abs(H[b * W + 1] - H[a * W + 1]), Math.abs(H[b * W + 2] - H[a * W + 2]));
}

// For a tail asking velocity·nose at most dot: for each row u, the first
// row at or after it (n: none) from which the final stretch moves back along
// the entry's direction of travel (ux, uy: its mean along it < 0) with
// velocity·nose at most dot on average. Into okU (Int32Array(n)).
function tailFrom(H, n, dot, okU, ux, uy) {
  const W = HIST_W;
  let sD = 0, cD = 0, sH = 0;
  for (let u = n - 1; u >= 0; u--) {
    const o = u * W;
    const x = H[o + 8];
    if (x === x) { sD += x; cD++; }
    sH += H[o + 9] * ux + H[o + 12] * uy;
    okU[u] = cD > 0 && sD / cD <= dot && sH < 0 ? 1 : 0;
  }
  let next = n;
  for (let u = n - 1; u >= 0; u--) {
    if (okU[u]) next = u;
    okU[u] = next;
  }
  return okU;
}

// The best measurement of a trick's phases in a history (rows of HIST_W, n
// rows) with the maneuver's features f and view v; ctx: { ux, uy } the
// entry's direction of travel, pre the altitude 1.0 s before it began. One
// phase with win: the largest turn inside the window (spanWithin).
// Otherwise the phases' bounds on every PH_ROWS-th row, best first (each
// phase's score times the ones before it; among equals, the bounds that
// leave the least turning outside the phases and across them), within
// MANEUVER_MAX_S. Returns { score, ms, reached }: reached, how many phases
// in order matched (the score 0 short of all). The score is matchSpec's on
// the bounds found.
export function measureSpec(spec, H, n, f, v, dq, ctx) {
  const out = { score: 0, ms: null, reached: 0 };
  const ph = spec.ph, K = ph.length;
  if (!H || n < 2) return out;
  if (K === 1 && ph[0].win != null) {
    const sp = spanWithin(H, n, PH_COL[ph[0].ax], ph[0].win, {}, dq || null);
    const useUp = ph[0].sg > 0 || (ph[0].sg === 0 && sp.up >= sp.dn);
    const m = {
      turn: useUp ? sp.up : sp.dn, sign: useUp ? 1 : -1, t: useUp ? sp.upT : sp.dnT,
      a: useUp ? sp.upA : sp.dnA, b: useUp ? sp.upB : sp.dnB,
    };
    out.ms = { ph: [m], lead: 0, trail: 0, tail: 0 };
    out.reached = phaseTerm(ph[0], m) > 0 ? 1 : 0;
    out.score = matchSpec(spec, out.ms, f, v);
    return out;
  }
  let seg = 1;
  if (spec.seg) for (let i = 0; i < spec.seg.length; i++) seg *= segTerm(spec.seg[i], f, v);
  if (!(seg > 0) || f.dur > MANEUVER_MAX_S + 1e-6) return out;
  // The turn each axis has to make at the least.
  let needP = 0, needR = 0;
  for (let i = 0; i < K; i++) {
    const lo = ph[i].lo - (ph[i].fade || 0);
    if (ph[i].ax === 'p') needP += lo; else if (ph[i].ax === 'r') needR += lo;
  }
  if (v.pathP < needP - 1e-9 || v.pathR < needR - 1e-9) return out;
  const c = ctx || {};
  const ux = c.ux || 0, uy = c.uy || 0, pre = c.pre == null ? H[6] : c.pre;
  const leadMax = spec.lead || PH_SLOP, crossMax = spec.cross || PH_CROSS;
  // Climbed into: no lower at the start than 1.0 s before.
  const into = H[6] >= pre;
  const W = HIST_W;
  const stride = Math.max(1, Math.ceil(n / PH_ROWS));
  const m = Math.ceil((n - 1) / stride) + 1;
  const rowOf = (j) => (j >= m - 1 ? n - 1 : j * stride);
  let prev = new Float64Array(m), cur = new Float64Array(m);
  const arg = new Int32Array(K * m).fill(-1);
  // The ranking's tie-break: 1 - PH_TIE x each turn left outside or across
  // the phases over its limit.
  for (let j = 0; j < m; j++) {
    const lead = turnPR(H, 0, rowOf(j));
    prev[j] = lead <= leadMax ? 1 - PH_TIE * lead / leadMax : 0;
  }
  const nxt = spec.tail ? tailFrom(H, n, spec.tail.dot, new Int32Array(n), ux, uy) : null;
  const pm = {};
  for (let i = 0; i < K; i++) {
    const p = ph[i], col = PH_COL[p.ax], last = i === K - 1, fromPre = p.climbFrom === 'pre';
    cur.fill(0);
    let any = 0;
    for (let ja = 0; ja < m - 1; ja++) {
      const base = prev[ja];
      if (!(base > 0)) continue;
      const a = rowOf(ja), ao = a * W;
      const A0 = H[ao + col], P0 = H[ao + 1], R0 = H[ao + 2], alt0 = H[ao + 6], t0 = H[ao];
      let altMax = alt0, apex = a, low = alt0, rise = 0, firstOver = (H[ao + 10] & PH_OVER) ? a : -1, lastUnder = -1;
      let hiA = A0, loA = A0, ddUp = 0, ddDn = 0;
      const d0 = H[ao + 8];
      let aN = d0 === d0 ? 1 : 0, agN = d0 === d0 && d0 < -0.18 ? 1 : 0;
      const tailT = nxt ? (nxt[a] < n ? H[(n - 1) * W] - H[nxt[a] * W] : 0) : 0;
      let jb = ja + 1, rb = rowOf(jb);
      for (let r = a + 1; r < n; r++) {
        const o = r * W;
        const A = H[o + col];
        if (A > hiA) hiA = A; else if (hiA - A > ddUp) ddUp = hiA - A;
        if (A < loA) loA = A; else if (A - loA > ddDn) ddDn = A - loA;
        const alt = H[o + 6];
        if (alt > altMax) { altMax = alt; apex = r; }
        if (alt < low) low = alt; else if (alt - low > rise) rise = alt - low;
        const fl = H[o + 10];
        if ((fl & PH_OVER) && firstOver < 0) firstOver = r;
        if ((fl & PH_UNDER) || H[o + 11] > H[o - W + 11]) lastUnder = r;
        const dot = H[o + 8];
        if (dot === dot) { aN++; if (dot < -0.18) agN++; }
        if (r !== rb) continue;
        const raw = A - A0;
        pm.turn = p.sg > 0 ? raw : p.sg < 0 ? -raw : Math.abs(raw);
        pm.t = H[o] - t0;
        pm.climb = fromPre ? (into ? altMax - pre : 0) : rise;
        pm.up = H[o + 7];
        pm.over = firstOver >= 0 && firstOver <= apex ? 1 : 0;
        pm.under = lastUnder > apex ? 1 : 0;
        pm.ag = aN ? agN / aN : 0;
        const dP = Math.abs(H[o + 1] - P0), dR = Math.abs(H[o + 2] - R0);
        pm.cross = col === 1 ? dR : col === 2 ? dP : Math.max(dP, dR);
        pm.back = p.sg > 0 || (p.sg === 0 && raw >= 0) ? ddUp : ddDn;
        let sc = base * phaseTerm(p, pm, crossMax) * (1 - PH_TIE * (pm.cross / crossMax + pm.back / PH_CROSS));
        if (sc > 0 && last) {
          const trail = turnPR(H, r, n - 1);
          if (trail > PH_SLOP) sc = 0;
          else if (spec.tail && !(tailT >= spec.tail.t)) sc = 0;
          else sc *= 1 - PH_TIE * trail / PH_SLOP;
        }
        if (sc > cur[jb]) { cur[jb] = sc; arg[i * m + jb] = ja; any = 1; }
        jb++;
        rb = rowOf(jb);
      }
    }
    if (!any) return out;
    out.reached = i + 1;
    const t = prev; prev = cur; cur = t;
  }
  let jb = -1, best = 0;
  for (let j = 0; j < m; j++) if (prev[j] > best) { best = prev[j]; jb = j; }
  if (jb < 0) return out;
  const ms = { ph: new Array(K), lead: 0, trail: 0, tail: 0 };
  let j = jb;
  for (let i = K - 1; i >= 0; i--) {
    const ja = arg[i * m + j];
    ms.ph[i] = measurePhase(H, ph[i], rowOf(ja), rowOf(j), pre, {});
    j = ja;
  }
  ms.lead = turnPR(H, 0, ms.ph[0].a);
  ms.trail = turnPR(H, ms.ph[K - 1].b, n - 1);
  if (spec.still != null) ms.still = stillOf(H, ms.ph[0].a, ms.ph[K - 1].b);
  if (nxt) {
    const a = ms.ph[K - 1].a;
    ms.tail = nxt[a] < n ? H[(n - 1) * W] - H[nxt[a] * W] : 0;
  }
  out.ms = ms;
  out.score = matchSpec(spec, ms, f, v);
  return out;
}

// Every PHASE_SPECS trick's score into the segment's features (f.phFlip
// ...); the measurements, by trick.
export function phaseFeat(d) {
  const f = d.feat;
  const v = featView(f);
  const ctx = { ux: f.u0x, uy: f.u0y, pre: f.alt1s };
  const rep = {};
  for (const id in PHASE_SPECS) {
    const r = measureSpec(PHASE_SPECS[id], d.hist, d.histN, f, v, d.dq, ctx);
    f[PHASE_FIELD[id]] = r.score;
    rep[id] = r;
  }
  return rep;
}

// ---- Compound tricks across segments ----
//
// A trick the segmentation split at a pause (the Maverick's pull and its
// glide back, say) is one trick: the detector keeps one history across
// consecutive segments while each pause between them is under MERGE_GAP_S
// and none of them scored (d.chain), and when a segment finishes it scores
// the merge tricks (PHASE_SPECS merge) over the run from each earlier
// segment's start to now, at most MANEUVER_MAX_S (mergeFeat).

// What the phase matcher's segment terms read, from history rows 0..n-1:
// f: { dur, pitch, upEnd }; v: { pathP, pathR, loopRise, drop, head,
// against, invAg }, as the features count them.
export function rowView(H, n) {
  const W = HIST_W, e = (n - 1) * W;
  let pathP = 0, pathR = 0, altMax = H[6], aN = 0, agN = 0, iN = 0, iAg = 0;
  for (let r = 0; r < n; r++) {
    const o = r * W;
    if (r) { pathP += Math.abs(H[o + 1] - H[o - W + 1]); pathR += Math.abs(H[o + 2] - H[o - W + 2]); }
    if (H[o + 6] > altMax) altMax = H[o + 6];
    const dot = H[o + 8];
    if (dot === dot) {
      aN++; if (dot < -0.18) agN++;
      if (H[o + 7] < -0.2) { iN++; if (dot < -0.18) iAg++; }
    }
  }
  return {
    f: { dur: H[e] - H[0], pitch: H[e + 1] - H[1], upEnd: H[e + 7] },
    v: {
      pathP, pathR, loopRise: altMax - H[6], drop: H[6] - H[e + 6],
      head: Math.abs(unwrapDelta(H[13], H[e + 13])),
      against: aN ? agN / aN : 0, invAg: iN ? iAg / iN : 0,
    },
  };
}

// The merge tricks over the chain: for each earlier segment's start, the run
// from there to now; the best (by classifyFeat's ranking, at its pick
// floor), or null. { id, score, k, segs, t, ms }.
export function mergeFeat(d) {
  const S = d.chainSegs, n = d.chainN, W = HIST_W;
  if (!S || S.length < 2 || n < 2) return null;
  let best = null, bestSc = 0;
  for (let k = 0; k < S.length - 1; k++) {
    const a = S[k].row;
    const sub = d.chain.subarray(a * W, n * W), len = n - a;
    const rv = rowView(sub, len);
    if (rv.f.dur > MANEUVER_MAX_S + 1e-6) continue;
    const ctx = { ux: S[k].ux, uy: S[k].uy, pre: S[k].pre };
    for (const id in PHASE_SPECS) {
      const spec = PHASE_SPECS[id];
      if (!spec.merge) continue;
      const r = measureSpec(spec, sub, len, rv.f, rv.v, null, ctx);
      const sc = r.score + (SPEC[id] || 0) * (r.score > 0.15 ? 1 : 0);
      if (r.score >= 0.42 && sc > bestSc) {
        bestSc = sc;
        best = { id, score: r.score, k, segs: S.length - k, t: rv.f.dur, ms: r.ms, gapBack: S[k].gapBack ? 1 : 0 };
      }
    }
  }
  return best;
}

// One row of the chain for this step: the chain's own time and its pitch,
// roll, turn about the vertical, body yaw and twist, summed from its first
// step.
function chainPush(d, dr, dp, dv, dy, dtw, step, alt, wx, wz, upZ, vx, vy, vz, head) {
  if (d.chainN >= HIST_CAP) { d.chainOn = 0; return; }
  const W = HIST_W, i = d.chainN * W, ws = d.ws || 3.5;
  if (d.chainN) { d.cT += step; d.cP += dp; d.cR += dr; d.cV += dv; d.cY += dy; d.cTw += dtw; }
  const H = d.chain;
  H[i] = d.cT; H[i + 1] = d.cP; H[i + 2] = d.cR; H[i + 3] = d.cV;
  H[i + 4] = wx / ws; H[i + 5] = wz / ws; H[i + 6] = alt; H[i + 7] = upZ;
  H[i + 8] = noseDot(d, vx, vy, vz); H[i + 9] = vx; H[i + 10] = objFlags(d.clr);
  H[i + 11] = d.cGapN; H[i + 12] = vy; H[i + 13] = head;
  H[i + 14] = d.cY; H[i + 15] = d.cTw;
  d.chainN += 1;
}

// A segment begins: the chain goes on if the last one ended under
// MERGE_GAP_S ago unscored, else starts again; segments that began more than
// MANEUVER_MAX_S ago drop off its front.
function chainBegin(d, f, head) {
  if (!d.chainOn || d.chainGap >= MERGE_GAP_S) {
    d.chainN = 0; d.cT = 0; d.cP = 0; d.cR = 0; d.cV = 0; d.cY = 0; d.cTw = 0; d.cGapN = 0;
    d.chainSegs = [];
  } else if (d.chainSegs.length) {
    const W = HIST_W, now = d.chainN ? d.chain[(d.chainN - 1) * W] : 0;
    let k = 0;
    while (k < d.chainSegs.length && now - d.chain[d.chainSegs[k].row * W] > MANEUVER_MAX_S) k++;
    if (k) {
      const r0 = k < d.chainSegs.length ? d.chainSegs[k].row : d.chainN;
      d.chain.copyWithin(0, r0 * W, d.chainN * W);
      d.chainN -= r0;
      d.chainSegs = d.chainSegs.slice(k);
      for (const s of d.chainSegs) s.row -= r0;
    }
  }
  d.chainOn = 1;
  d.chainGap = 0;
  d.chainSegs.push({ row: d.chainN, ux: f.u0x, uy: f.u0y, pre: f.alt1s, gapIn: f.gapIn, gapInFin: f.gapInFin, gapBack: 0, head });
}

// The altitude seconds ago (the detector's altitude ring, ALT_RING steps):
// the newest sample at least that old, or the oldest kept.
function altAgo(d, ago) {
  const n = d.altN;
  if (!n) return NaN;
  const want = d.clock - ago;
  for (let k = 1; k <= n; k++) {
    const i = (d.altI - k + ALT_RING) % ALT_RING;
    if (d.altT[i] <= want) return d.altA[i];
  }
  return d.altA[(d.altI - n + ALT_RING) % ALT_RING];
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
  // Rotation windows: the flip's size and way (+1 front: pitch rising, nose
  // down; -1 back), the roll's size and mean rate between its two ends.
  const flipUp = f.flipUp || 0, flipDn = f.flipDn || 0;
  const flipSpan = flipUp >= flipDn ? flipUp : flipDn;
  const flipDir = flipUp >= flipDn ? 1 : -1;
  const rollUp = f.rollUp || 0, rollDn = f.rollDn || 0;
  const rollSpan = rollUp >= rollDn ? rollUp : rollDn;
  const rollT = rollUp >= rollDn ? (f.rollUpT || 0) : (f.rollDnT || 0);
  const rollRate = rollT > 0 ? rollSpan / rollT : 0;
  // Powerloop: the loop window's size and way, and the loops in the segment.
  const loopUp = f.loopUp || 0, loopDn = f.loopDn || 0;
  const loopSpan = loopUp >= loopDn ? loopUp : loopDn;
  const loopDir = loopUp >= loopDn ? 1 : -1;
  const loops = loopCount(f.loopTot || 0);
  // Path: the climb above the entry, how far it came back down below the
  // entry after the top (negative: it stayed above), and the velocity's turn
  // the way the loop turns.
  const loopRise = f.altMax - f.alt0;
  const loopRet = f.alt0 - (f.postMin == null ? f.altMax : f.postMin);
  const loopSweep = loopDir > 0 ? -(f.sweep || 0) : (f.sweep || 0);
  // Trippy: the yaw's size and mean rate between its two ends.
  const yawUp = f.yawUp || 0, yawDn = f.yawDn || 0;
  const yawSpan = yawUp >= yawDn ? yawUp : yawDn;
  const yawT = yawUp >= yawDn ? (f.yawUpT || 0) : (f.yawDnT || 0);
  const yawRate = yawT > 0 ? yawSpan / yawT : 0;
  // Ham: the turn about the vertical while inverted, the larger way.
  const invYaw = Math.max(f.invYawUp || 0, f.invYawDn || 0);
  return {
    absP, absR, absY, head, span, drop, follow, against, inv, close, hEnd, meanDot,
    invFol, invAg, pathP, pathR, pathY, under, over, obj, objOrbit, opp, front, rad,
    flipSpan, flipDir, rollSpan, rollRate, loopSpan, loopDir, loops, loopRise, loopRet, loopSweep,
    yawSpan, yawRate, invYaw,
  };
}

// How many loops a turn of pitch (rad, one way) holds: one from LOOP_MIN
// (300 degrees), two from LOOP_TWO (600), then one more per further 360.
export function loopCount(tot) {
  if (!(tot >= LOOP_MIN)) return 0;
  if (tot < LOOP_TWO) return 1;
  return 2 + Math.floor((tot - LOOP_TWO) / TAU + 1e-9);
}

const _cls = { id: null, why: '', best: 0, second: 0, secondId: '' };
const _sc = Object.create(null);

// A trick's name as the pilot sees it: a Flip says which way it went, a
// Powerloop how many loops (Double Powerloop from two).
export function trickName(id, dir, loops) {
  if (id === 'flip') return dir < 0 ? 'Back Flip' : 'Front Flip';
  if (id === 'powerloop' && loops >= 2) {
    return (loops === 2 ? 'Double' : loops === 3 ? 'Triple' : loops + '×') + ' Powerloop';
  }
  const def = BY_ID[id];
  return def ? def.name : id;
}

function whyLine(id, f, v, secondId, second) {
  const def = BY_ID[id];
  const deg = (r) => Math.round(r * 180 / PI);
  return trickName(id, v.flipDir, v.loops)
    + (def ? ('  ' + def.tier + '  ' + def.points) : '')
    + '\n  P' + deg(f.pitch) + ' R' + deg(f.roll) + ' Y' + deg(f.yaw)
    + '  flip=' + deg(v.flipSpan) + ' roll=' + deg(v.rollSpan) + '@' + deg(v.rollRate) + '/s'
    + ' loop=' + deg(v.loopSpan) + ' rise=' + v.loopRise.toFixed(1) + ' sweep=' + deg(v.loopSweep)
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
  // Barani, as the owner flies it: BARANI_P of pitch path with a half twist
  // (180 +- 45, roll or yaw: the axis nearest the flight path) inside it,
  // ending upright (up-Z 0.5, as the Half Mavvy's and the Immelmann's). Any
  // climb, any time. A Half Mavvy turns the same way and goes under an
  // object against the nose after its roll; it ranks above.
  // (5.236 and 0.35: BARANI_P and BARANI_FADE.)
  _sc.barani = mul(
    atLeast(f.barP, 5.236, 0.35),
    inBand(f.barR, 2.356, 3.927, 0),
    atLeast(f.upEnd, 0.5, 0),
  );
  {
    // Trippy Spin: >= 360 degrees of turn about the vertical at >= 150 deg/s
    // between its two ends, while the path orbits a centre over the whole
    // spin: it curves at a radius of 0.3-2.5 m, its direction turns a full
    // turn or more, one way (80 % of its turning), at >= 1 m/s. Upright or
    // inverted, rolling or not (no roll term); no object needed (one at the
    // centre earns TRIPPY_POLE_MUL).
    _sc.trippy = mul(
      atLeast(v.yawSpan, 6.2832, 0),
      atLeast(v.yawRate, 2.618, 0),
      inBand(f.orbitR, 0.3, 2.5, 0),
      atLeast(f.orbitSweep, 6.2832, 0),
      atLeast(f.orbitTurn, 0.8, 0),
      atLeast(f.orbitSpd, 1.0, 0),
    );
    // Ham Spin, the inverted yaw spin: >= 300 degrees of turn about the
    // vertical counted only while inverted (up-Z < HAM_UPZ). A half flip in
    // and a half flip out are allowed: they turn little about the vertical,
    // and the segment is one Ham, not a Flip. A flip or roll that only passes
    // through inverted turns little about the vertical there. An orbit is
    // Trippy, a full Roll a Roll (the re-labels below).
    _sc.ham = mul(
      atLeast(v.invYaw, 5.236, 0),
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
  // The phase matcher's tricks (PHASE_SPECS): each score is the matcher's,
  // set when the segment finished (phaseFeat). atLeast(x, 1, 1) is x itself
  // on 0-1.
  // Half Matty: a Matty's first 180 +- 45 degrees of forward pitch, climbing
  // 1 m over an object, inverted behind it.
  _sc.halfmatty = mul(
    atLeast(f.phHMatty, 1, 1),
  );
  // Half Mavvy: forward pitch, a half roll between its halves, forward on to
  // upright; 330-450 degrees of it, climbing 3 m, 2 s or longer. Above
  // Maverick and Matty.
  _sc.halfmavvy = mul(
    atLeast(f.phHMavvy, 1, 1),
  );
  // Immelmann: a back pitch of 180 +- 45 climbing 1 m, a half roll; upright,
  // the heading reversed, out higher than in. The Split-S's mirror.
  _sc.immelmann = mul(
    atLeast(f.phImmel, 1, 1),
  );
  // Powerloop: >= 300 degrees of pitch inside LOOP_WIN_S (its own window, a
  // loop is slower than a flip), with Flip's roll and yaw limits, whose path
  // climbs at least 1.5 m above the entry, after its top comes back down to
  // 1.5 m above the entry or lower, and turns its velocity through at least
  // 270 degrees in the vertical plane of the entry heading, the way the pitch
  // turns. A flip whose path does not is a Flip. v.loops counts the loops.
  _sc.powerloop = mul(
    atLeast(f.phLoop, 1, 1),
  );
  // Matty: 250-400 degrees of forward pitch over an object, climbed into
  // (1 m from 1.0 s before), flown against the nose, upright at the end.
  _sc.matty = mul(
    atLeast(f.phMatty, 1, 1),
  );
  // Maverick: a pull back of 120-225 climbing 1 m, a forward pitch of 60 or
  // more, then back towards the entry against the nose for 0.3 s.
  _sc.maverick = mul(
    atLeast(f.phMav, 1, 1),
  );
  // Split-S: a half roll, then a back pitch of 69-258, dropping 0.35 m.
  _sc.splits = mul(
    atLeast(f.phSplits, 1, 1),
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
  // Flip: >= 300 degrees of pitch inside FLIP_WIN_S, at any speed and any
  // travel, with roll and yaw limits (PHASE_SPECS.flip); front or back by the
  // way the pitch turned (v.flipDir).
  _sc.flip = mul(
    atLeast(f.phFlip, 1, 1),
  );
  // Roll: >= 300 degrees of roll inside ROLL_WIN_S at a mean rate of at
  // least 250 deg/s between its two ends. Slower turns are not tricks.
  _sc.roll = mul(
    atLeast(v.rollSpan, 5.236, 0),
    atLeast(v.rollRate, 4.363, 0),
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
    // A flip's rotation is never nothing: with no trick ahead of it (its
    // roll or yaw too big for Flip's own terms), it is a Flip.
    if (v.flipSpan >= 5.236) {
      o.id = 'flip';
      o.why = whyLine('flip', f, v, secondId, second);
      return o;
    }
    if (v.drop >= 3.2 && f.spdPeak > 8 && f.vzMin < -6.2 && absP < 3.2 && absR < 2.2 && v.pathY < 2.0) {
      o.id = 'dive';
      o.why = whyLine('dive', f, v, '', 0);
      return o;
    }
    return o;
  }
  if (bestId === 'flip' && _sc.matty > 0.55 && f.pitch > 0) { bestId = 'matty'; best = _sc.matty; }
  if (bestId === 'yawspin' && _sc.ham > 0.42) { bestId = 'ham'; best = _sc.ham; }
  if (bestId === 'ham' && _sc.trippy > 0.42) { bestId = 'trippy'; best = _sc.trippy; }
  if (bestId === 'ham' && _sc.roll > 0.42) { bestId = 'roll'; best = _sc.roll; }
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
    lastDir: 0,
    lastLoops: 0,
    lastSloppy: 0,
    lastBump: 0,
    // The open segment's attitude history (t, pitch, roll, yaw per row) and
    // the scratch the rotation windows use.
    hist: new Float64Array(HIST_CAP * HIST_W),
    histN: 0,
    dq: new Int32Array(HIST_CAP * 2),
    span: { up: 0, upT: 0, dn: 0, dnT: 0 },
    // A sustained rotation past MANEUVER_MAX_S: the history column it turns
    // (0: not looked at yet, -1: none, 1: pitch, 3: the vertical), which way
    // (+1, -1) and the rate it must keep (rad/s).
    susCol: 0, susSg: 1, susMin: 0,
    recNextT: 0,
    live: 0,
    quiet: 0,
    haveQ: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    px: 0, py: 0, pz: 0,
    hangT: 0, hangGot: 0, hangCd: 0,
    diveOn: 0, diveAlt: 0, diveDrop: 0, diveCd: 0,
    // Gap. Authored (sample.gaps): per volume, the face a pass came in by
    // (-1: none, or in through a side) and when it last scored; a pass during
    // a rotation waits for its end (gapPend). Generic: both sides near the
    // path along one axis (gapKind 1: x walls, moving along z; 2: z walls),
    // from gapS0 to gapAlong along it, moving gapSign.
    gapVols: null, gapFace: null, gapLastT: null, gapPend: '', gapPendT: 0, clock: 0,
    gapOn: 0, gapKind: 0, gapS0: 0, gapAlong: 0, gapSign: 1, gapCd: 0,
    gapSeq: 0, gapNote: '',
    // The last authored gap passed (index, entry face, clock), for the
    // Maverick's way back out; the phase matcher's measurements of the last
    // segment, by trick.
    gapPassI: -1, gapPassFin: -1, gapPassAt: -1e9, lastPhases: null, lastGapBack: 0,
    // Compound tricks: the chain of consecutive unscored segments and the
    // pauses between them (rows of HIST_W, its own time and summed turns),
    // each segment's start in it, the pause so far; the last merge scored.
    chain: new Float64Array(HIST_CAP * HIST_W), chainN: 0, chainOn: 0, chainGap: 0, chainSegs: [],
    cT: 0, cP: 0, cR: 0, cV: 0, cY: 0, cTw: 0, cGapN: 0, lastMerge: null,
    // The altitude ring: clock and altitude, the next slot, the count.
    altT: new Float64Array(ALT_RING), altA: new Float64Array(ALT_RING), altI: 0, altN: 0,
    // Trippy and Barani scratch; the colliders and scale of the last step.
    orb: { r: 0, fit: 9, sweep: 0, turn: 0, spd: 0, cx: 0, cz: 0, kr: 0 },
    bar: { p: 0, r: 0 },
    cols: null, ws: 3.5, lastPole: 0,
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
  // One sample per REC_DT_S of segment time, at most REC_CAP: the detector
  // steps every 4 ms on the sim clock.
  if (d.recN >= REC_CAP || t < d.recNextT) return;
  d.recNextT = t + REC_DT_S - 1e-9;
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
  d.gapOn = 0; d.gapPend = '';
  d.gapVols = null; d.gHave = 0;
  d.gapPassI = -1; d.gapPassFin = -1; d.gapPassAt = -1e9;
  d.chainOn = 0; d.chainN = 0; d.chainSegs = []; d.lastMerge = null;
  d.altN = 0; d.altI = 0;
  d.proxT = 0;
  d.lockout = 0;
  d.landT = 0;
  d.airT = 0;
  d.wasAir = 0;
  d.recN = 0;
  d.recNextT = 0;
  d.histN = 0;
  d.susCol = 0;
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

// A step's segment against an axis-aligned volume (slab method): the entry
// and exit as fractions of the step and the face of each (axis 0 x, 1 y,
// 2 z, times 2, plus 1 for the max face). out.hit 0 when it misses.
const AX = ['x', 'y', 'z'];
function segBox(p0, p1, v, out) {
  let tIn = -Infinity, tOut = Infinity, fIn = -1, fOut = -1;
  for (let k = 0; k < 3; k++) {
    const a = AX[k], o = p0[a], dd = p1[a] - o, lo = v.min[a], hi = v.max[a];
    if (Math.abs(dd) < 1e-12) {
      if (o < lo || o > hi) { out.hit = 0; return out; }
      continue;
    }
    let t0 = (lo - o) / dd, t1 = (hi - o) / dd, f0 = k * 2, f1 = k * 2 + 1;
    if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; const ff = f0; f0 = f1; f1 = ff; }
    if (t0 > tIn) { tIn = t0; fIn = f0; }
    if (t1 < tOut) { tOut = t1; fOut = f1; }
  }
  out.hit = tIn <= tOut && tOut >= 0 && tIn <= 1 ? 1 : 0;
  out.tIn = tIn; out.tOut = tOut; out.fIn = fIn; out.fOut = fOut;
  return out;
}
const _seg = { hit: 0, tIn: 0, tOut: 0, fIn: -1, fOut: -1 };
const _p0 = { x: 0, y: 0, z: 0 };
const _p1 = { x: 0, y: 0, z: 0 };

// Authored gaps for one step: the volumes this step's segment passes into
// or out of. A pass goes in through one face across the volume's axis and
// out through the other; in or out through a side is a skim. Returns the
// passed volume, or null.
function authoredGapStep(d, vols, x0, y0, z0, x1, y1, z1) {
  if (d.gapVols !== vols) {
    d.gapVols = vols;
    d.gapFace = vols ? new Int8Array(vols.length).fill(-1) : null;
    d.gapLastT = vols ? new Float64Array(vols.length).fill(-1e9) : null;
  }
  if (!vols || !vols.length) return null;
  _p0.x = x0; _p0.y = y0; _p0.z = z0; _p1.x = x1; _p1.y = y1; _p1.z = z1;
  let passed = null;
  for (let i = 0; i < vols.length; i++) {
    const v = vols[i];
    const r = segBox(_p0, _p1, v, _seg);
    if (!r.hit) { if (d.gapFace[i] !== -1) d.gapFace[i] = -1; continue; }
    const ax = AX.indexOf(v.axis) * 2;
    if (r.tIn > 0) {
      // In this step: by an axis face, or a side.
      d.gapFace[i] = (r.fIn === ax || r.fIn === ax + 1) ? r.fIn : -2;
    } else if (d.gapFace[i] === -1) {
      d.gapFace[i] = -2;   // already inside (a respawn, a teleport): not a pass
    }
    if (r.tOut < 1) {
      // Out this step: through the far axis face is a pass.
      const fin = d.gapFace[i];
      const ok = fin >= 0 && (r.fOut === ax || r.fOut === ax + 1) && r.fOut !== fin;
      if (ok) {
        // For the phase matcher (through), and the Maverick's way back out.
        if (d.live) {
          const f = d.feat;
          f.gapN += 1;
          if (d.histN > 0) d.hist[(d.histN - 1) * HIST_W + 11] = f.gapN;
          if (f.gapIn === i + 1 && fin !== f.gapInFin) f.gapBack = 1;
          else if (!f.gapIn) { f.gapIn = i + 1; f.gapInFin = fin; }
        }
        // The chain's: its passes, and each segment's way back out.
        if (d.chainOn) {
          d.cGapN += 1;
          if (d.chainN > 0) d.chain[(d.chainN - 1) * HIST_W + 11] = d.cGapN;
          for (const sg of d.chainSegs) {
            if (sg.gapIn === i + 1 && fin !== sg.gapInFin) sg.gapBack = 1;
            else if (!sg.gapIn) { sg.gapIn = i + 1; sg.gapInFin = fin; }
          }
        }
        d.gapPassI = i; d.gapPassFin = fin; d.gapPassAt = d.clock;
      }
      d.gapSeq++;
      d.gapNote = (ok ? 'through ' : (fin === -2 ? 'skimmed (in by a side) ' : 'skimmed (out by a side) ')) + v.name;
      d.gapFace[i] = -1;
      if (ok && d.clock - d.gapLastT[i] >= GAP_REPEAT_S) { d.gapLastT[i] = d.clock; passed = v; }
    }
  }
  return passed;
}

// Within GAP_NEAR_M (margin, scene units) of an authored volume?
function nearAuthored(vols, x, y, z, margin) {
  if (!vols) return 0;
  for (let i = 0; i < vols.length; i++) {
    const v = vols[i];
    if (x >= v.min.x - margin && x <= v.max.x + margin && y >= v.min.y - margin && y <= v.max.y + margin
      && z >= v.min.z - margin && z <= v.max.z + margin) return 1;
  }
  return 0;
}

// Generic gap, the fallback: the walls on both sides of the path (along the
// axis it moves most along) within sideMax of it. 1: x walls, 2: z walls, 0.
function genericGapKind(clr, svx, svz, sideMax) {
  if (Math.abs(svz) >= Math.abs(svx)) return clr.px <= sideMax && clr.nx <= sideMax ? 1 : 0;
  return clr.pz <= sideMax && clr.nz <= sideMax ? 2 : 0;
}

function beginFeat(d, alt, wx, wz, head, speed, thr, upZ, vx, vy, vz) {
  d.recN = 0;
  d.recNextT = 0;
  const f = resetFeat(d.feat);
  f.alt0 = alt; f.alt1 = alt; f.altMin = alt; f.altMax = alt; f.postMin = alt;
  // The entry's direction of travel: its horizontal velocity, or its heading
  // when it hardly moves.
  const hs = Math.hypot(vx || 0, vy || 0);
  if (hs > 0.5) { f.u0x = vx / hs; f.u0y = vy / hs; } else { f.u0x = Math.cos(head); f.u0y = Math.sin(head); }
  // The authored gap it came in by, if one was passed just before.
  if (d.gapPassI >= 0 && d.clock - d.gapPassAt <= MAV_GAP_S) { f.gapIn = d.gapPassI + 1; f.gapInFin = d.gapPassFin; }
  const pre = altAgo(d, 1.0);
  f.alt1s = pre === pre ? pre : alt;
  const ws0 = d.ws || 3.5;
  d.hist[0] = 0; d.hist[1] = 0; d.hist[2] = 0; d.hist[3] = 0; d.hist[4] = wx / ws0; d.hist[5] = wz / ws0;
  d.hist[6] = alt; d.hist[7] = upZ == null ? 1 : upZ;
  d.hist[8] = noseDot(d, vx || 0, vy || 0, vz || 0);
  d.hist[9] = vx || 0;
  d.hist[10] = objFlags(d.clr);
  d.hist[11] = 0;
  d.hist[12] = vy || 0;
  d.hist[13] = head;
  d.histN = 1;
  d.susCol = 0;
  f.h0x = wx; f.h0z = wz; f.h1x = wx; f.h1z = wz;
  f.head0 = head; f.head1 = head;
  f.spd0 = speed; f.spd1 = speed; f.spdPeak = speed; f.spdMin = speed;
  f.thr0 = thr; f.thr1 = thr; f.thrMin = thr; f.thrMax = thr;
  f.under0 = d.clr.up < 8 ? 1 : 0;
  f.over0 = d.clr.over < 8 ? 1 : 0;
  d.live = 1;
  d.quiet = 0;
}

// velocity·nose for the attitude the detector holds (NaN below 0.85 m/s).
function noseDot(d, vx, vy, vz) {
  const spd = Math.hypot(vx, vy, vz);
  if (!(spd > 0.85)) return NaN;
  bodyFwdParts(d.qx, d.qy, d.qz, d.qw, d.fwd);
  return (d.fwd.x * vx + d.fwd.y * vy + d.fwd.z * vz) / spd;
}

// The objects at hand for the phase matcher: one below (PH_OVER), one above
// (PH_UNDER), as the features count them (overN, underN).
function objFlags(clr) {
  return (clr.over < 8 ? PH_OVER : 0) | (clr.up < 8 ? PH_UNDER : 0);
}

function accumFeat(d, sample, dr, dp, dy, step, alt, wx, wz, head, speed, upZ, thr, vx, vy, vz, dtw) {
  const f = d.feat;
  f.dur += step;
  f.n += 1;
  f.pitch += dp; f.roll += dr; f.yaw += dy;
  f.twist += dtw || 0;
  {
    // The world-up component of this step's rotation (the body axes' up
    // components from the step's attitude).
    const qx = d.qx, qy = d.qy, qz = d.qz, qw = d.qw;
    const dv = 2 * (qx * qz - qw * qy) * dr + 2 * (qy * qz + qw * qx) * dp + (1 - 2 * (qx * qx + qy * qy)) * dy;
    f.vyaw += dv;
    // Ham: the same turn, counted only while inverted.
    if (upZ < HAM_UPZ) {
      f.invYawT += step;
      f.invC += dv;
      if (f.invC - f.invLo > f.invYawUp) f.invYawUp = f.invC - f.invLo;
      if (f.invHi - f.invC > f.invYawDn) f.invYawDn = f.invHi - f.invC;
      if (f.invC < f.invLo) f.invLo = f.invC;
      if (f.invC > f.invHi) f.invHi = f.invC;
    }
  }
  f.pathP += Math.abs(dp); f.pathR += Math.abs(dr); f.pathY += Math.abs(dy);
  const ar = Math.abs(sample.ox || 0), ap = Math.abs(sample.oy || 0), ay = Math.abs(sample.oz || 0);
  if (ap > f.peakP) f.peakP = ap;
  if (ar > f.peakR) f.peakR = ar;
  if (ay > f.peakY) f.peakY = ay;
  const rate = Math.hypot(ar, ap, ay);
  if (rate > f.peakRate) f.peakRate = rate;
  if (alt < f.altMin) f.altMin = alt;
  if (alt > f.altMax) { f.altMax = alt; f.postMin = alt; } else if (alt < f.postMin) f.postMin = alt;
  f.alt1 = alt;
  if (d.histN < HIST_CAP) {
    const hi = d.histN * HIST_W;
    const wsH = d.ws || 3.5;
    d.hist[hi] = f.dur; d.hist[hi + 1] = f.pitch; d.hist[hi + 2] = f.roll; d.hist[hi + 3] = f.vyaw;
    d.hist[hi + 4] = wx / wsH; d.hist[hi + 5] = wz / wsH;
    d.hist[hi + 6] = alt; d.hist[hi + 7] = upZ;
    d.hist[hi + 8] = noseDot(d, vx, vy, vz);
    d.hist[hi + 9] = vx;
    d.hist[hi + 10] = objFlags(d.clr);
    d.hist[hi + 11] = f.gapN;
    d.hist[hi + 12] = vy;
    d.hist[hi + 13] = head;
    d.hist[hi + 14] = f.yaw;
    d.hist[hi + 15] = f.twist;
    d.histN += 1;
  }
  {
    // The velocity's direction in the vertical plane of the entry heading.
    const va = vx * Math.cos(f.head0) + vy * Math.sin(f.head0);
    if (Math.hypot(va, vz) > SWEEP_MIN_SPD) {
      const th = Math.atan2(vz, va);
      if (f.sweepOn) f.sweep += unwrapDelta(f.sweepTh, th);
      f.sweepTh = th;
      f.sweepOn = 1;
    }
  }
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
  f.upEnd = upZ;
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

// The rotation windows of the open segment, into its features.
export function windowFeat(d) {
  const f = d.feat;
  const s = spanWithin(d.hist, d.histN, 1, FLIP_WIN_S, d.span, d.dq);
  f.flipUp = s.up; f.flipDn = s.dn;
  // Powerloop: the loop window, then the segment's whole turn the loop's way.
  spanWithin(d.hist, d.histN, 1, LOOP_WIN_S, d.span, d.dq);
  f.loopUp = s.up; f.loopDn = s.dn;
  const loopUpWay = s.up >= s.dn;
  spanWithin(d.hist, d.histN, 1, 1e9, d.span, d.dq);
  f.loopTot = loopUpWay ? s.up : s.dn;
  spanWithin(d.hist, d.histN, 2, ROLL_WIN_S, d.span, d.dq);
  f.rollUp = s.up; f.rollUpT = s.upT; f.rollDn = s.dn; f.rollDnT = s.dnT;
  // Trippy: the yaw window, then the circle the path fits over it.
  spanWithin(d.hist, d.histN, 3, TRIPPY_WIN_S, d.span, d.dq);
  f.yawUp = s.up; f.yawUpT = s.upT; f.yawDn = s.dn; f.yawDnT = s.dnT;
  const up = s.up >= s.dn;
  let a = up ? s.upA : s.dnA, b = up ? s.upB : s.dnB;
  // The orbit is measured over the whole spin: out from that window, a
  // 0.1 s piece at a time, while the turn keeps going the same way at
  // TRIPPY_HOLD of TRIPPY_RATE or more.
  {
    const H = d.hist, W = HIST_W, sg = up ? 1 : -1, min = TRIPPY_RATE * TRIPPY_HOLD;
    while (a > 0) {
      let k = a - 1;
      while (k > 0 && H[a * W] - H[k * W] < 0.1) k--;
      const dt = H[a * W] - H[k * W];
      if (!(dt > 0) || sg * (H[a * W + 3] - H[k * W + 3]) < min * dt) break;
      a = k;
    }
    while (b < d.histN - 1) {
      let k = b + 1;
      while (k < d.histN - 1 && H[k * W] - H[b * W] < 0.1) k++;
      const dt = H[k * W] - H[b * W];
      if (!(dt > 0) || sg * (H[k * W + 3] - H[b * W + 3]) < min * dt) break;
      b = k;
    }
  }
  const o = orbitFit(d.hist, a, b, d.orb);
  f.orbitR = o.r; f.orbitFit = o.fit; f.orbitSweep = o.sweep; f.orbitTurn = o.turn; f.orbitSpd = o.spd;
  const ws = d.ws || 3.5;
  f.orbitCx = o.cx * ws; f.orbitCz = o.cz * ws;
  f.orbitPole = o.kr > 0 ? poleNear(d.cols, f.orbitCx, f.orbitCz, ws) : 0;
  // Barani: only worth the scan when a flip's worth of pitch path is there.
  if ((f.pathP || 0) >= BARANI_P - BARANI_FADE) {
    const bw = baraniWithin(d.hist, d.histN, d.bar);
    f.barP = bw.p; f.barR = bw.r;
  } else { f.barP = 0; f.barR = 0; }
  return f;
}

function finishManeuver(d) {
  windowFeat(d);
  d.lastPhases = phaseFeat(d);
  copyFeat(d.feat, d.lastFeat);
  d.live = 0;
  d.quiet = 0;
  const cls = classifyFeat(d.feat, _cls);
  let id = cls.id || '';
  let why = cls.why || '';
  // A compound trick split across segments: the merge's label stands over
  // this segment's own unless that is a matcher trick ranked above it.
  const mg = d.chainSegs.length > 1 ? mergeFeat(d) : null;
  d.lastMerge = null;
  if (mg && (!id || !PHASE_SPECS[id] || (SPEC[mg.id] || 0) >= (SPEC[id] || 0))) {
    id = mg.id;
    const def = BY_ID[id];
    why = (def ? def.name + '  ' + def.tier + '  ' + def.points : id)
      + '\n  merged ' + mg.segs + ' segments, ' + mg.t.toFixed(2) + ' s (this one alone: ' + (cls.id || 'none') + ')';
    d.lastMerge = mg;
  }
  d.lastWhy = why;
  d.lastId = id;
  d.lastDir = (d.feat.flipUp || 0) >= (d.feat.flipDn || 0) ? 1 : -1;
  d.lastLoops = id === 'powerloop' ? Math.max(1, loopCount(d.feat.loopTot || 0)) : 0;
  d.lastPole = id === 'trippy' && d.feat.orbitPole ? 1 : 0;
  d.lastGapBack = id === 'maverick' && (d.lastMerge ? d.lastMerge.gapBack : d.feat.gapBack) ? 1 : 0;
  d.lastSloppy = (d.feat.seg && LOOP_IDS[id]) ? 1 : 0;
  d.lastBump = d.feat.bump ? 1 : 0;
  try { d.recJson = encodeRecJson(d); } catch (e) { d.recJson = ''; }
  resetFeat(d.feat);
  // A scored segment ends the chain; an unscored one leaves it open for
  // MERGE_GAP_S.
  if (id) d.chainOn = 0; else d.chainGap = 0;
  if (id) {
    d.lockout = LOCKOUT_S;
    d.hangGot = 1;
    d.hangT = 0;
    d.diveOn = 0;
    d.diveCd = Math.max(d.diveCd, 2.4);
    d.gapOn = 0;
    d.proxT = 0;
    return id;
  }
  return null;
}

// Past MANEUVER_MAX_S, does the segment's rotation go on? What turns is looked
// at once, at the cap: a turn about the vertical at Trippy's rate (>= 360
// degrees at >= TRIPPY_RATE in its window: a Trippy, a Yaw Spin) or a loop
// (>= LOOP_MIN of pitch inside LOOP_WIN_S, the velocity turned 270 degrees
// with it). Then, each step, it must have turned on that way at SUSTAIN_HOLD
// of that rate or more over the last SUSTAIN_LOOK_S.
function sustained(d) {
  if (!d.susCol) {
    const f = windowFeat(d);
    const v = featView(f);
    d.susCol = -1;
    if (v.yawSpan >= TAU && v.yawRate >= TRIPPY_RATE) {
      d.susCol = 3; d.susSg = f.yawUp >= f.yawDn ? 1 : -1; d.susMin = TRIPPY_RATE * SUSTAIN_HOLD;
    } else if (v.loopSpan >= LOOP_MIN && v.loopSweep >= 4.712) {
      d.susCol = 1; d.susSg = v.loopDir; d.susMin = LOOP_MIN / LOOP_WIN_S * SUSTAIN_HOLD;
    }
  }
  if (d.susCol < 0 || d.histN >= HIST_CAP) return false;
  const H = d.hist, W = HIST_W, b = d.histN - 1, tb = H[b * W];
  let a = b;
  while (a > 0 && tb - H[a * W] < SUSTAIN_LOOK_S) a--;
  const dt = tb - H[a * W];
  return dt > 0 && d.susSg * (H[b * W + d.susCol] - H[a * W + d.susCol]) >= d.susMin * dt;
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
  // This step's turn about the vertical (as accumFeat sums it), for the chain.
  const dv = 2 * (sx * sz - sw * sy) * dr + 2 * (sy * sz + sw * sx) * dp + (1 - 2 * (sx * sx + sy * sy)) * dy;
  // The twist: this step's turn about the body axis nearest the flight path,
  // the nose (roll) or the up axis (yaw); slower than TWIST_SPD, the one of
  // the two turning faster.
  let twYaw;
  if (Math.hypot(vx, vy, vz) > TWIST_SPD) {
    const nd = (1 - 2 * (sy * sy + sz * sz)) * vx + 2 * (sx * sy + sw * sz) * vy + 2 * (sx * sz - sw * sy) * vz;
    const ud = 2 * (sx * sz + sw * sy) * vx + 2 * (sy * sz - sw * sx) * vy + (1 - 2 * (sx * sx + sy * sy)) * vz;
    twYaw = Math.abs(ud) > Math.abs(nd);
  } else twYaw = Math.abs(dy) > Math.abs(dr);
  const dtw = twYaw ? dy : dr;
  // No jump guard: the page steps the detector every 4 ms of sim time, so a
  // step turns at most a few degrees, and every respawn resets the detector
  // (sim.html placeQuadAt, resetQuad); a portal keeps the attitude.

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
  d.cols = sample.colliders || null;
  d.ws = ws;
  if (!d.gHave) { d.gx = wx; d.gy = wy; d.gz = wz; d.gHave = 1; }

  let hit = null;
  // The altitude ring: this step's, at the clock before it advances.
  d.altT[d.altI] = d.clock; d.altA[d.altI] = alt;
  d.altI = (d.altI + 1) % ALT_RING;
  if (d.altN < ALT_RING) d.altN += 1;
  const rotating = rate >= RATE_START;
  const diving = thr < 0.18 && rate < 1.55 && vz < -3.8;
  if (armed && !contact && rotating && !d.live && d.lockout <= 0 && !diving) {
    beginFeat(d, alt, wx, wz, head, speed, thr, upZ, vx, vy, vz);
    chainBegin(d, d.feat, head);
  }
  if (d.live || d.chainOn) chainPush(d, dr, dp, dv, dy, dtw, step, alt, wx, wz, upZ, vx, vy, vz, head);
  if (!d.live && d.chainOn) {
    d.chainGap += step;
    if (d.chainGap >= MERGE_GAP_S || !armed || contact) d.chainOn = 0;
  }
  if (d.live) {
    if (contact) d.feat.bump = 1;
    accumFeat(d, sample, dr, dp, dy, step, alt, wx, wz, head, speed, upZ, thr, vx, vy, vz, dtw);
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
    const timedOut = d.feat.dur >= MANEUVER_MAX_S
      && (d.feat.dur >= MANEUVER_SUSTAIN_S || !sustained(d));
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

  // Gap. Authored volumes first; the generic rule only away from them.
  d.clock += step;
  const passed = authoredGapStep(d, sample.gaps, d.gx, d.gy, d.gz, wx, wy, wz);
  let inAuthored = 0;
  if (d.gapFace) for (let i = 0; i < d.gapFace.length; i++) if (d.gapFace[i] !== -1) { inAuthored = 1; break; }
  if (!inAuthored) inAuthored = nearAuthored(sample.gaps, wx, wy, wz, GAP_NEAR_M * ws);
  if (passed) {
    const why = (BY_ID.gap ? BY_ID.gap.name : 'Gap') + '  Beginner  ' + (BY_ID.gap ? BY_ID.gap.points : 125) + '  ' + passed.name;
    if (!hit && !d.live && armed) { hit = 'gap'; d.lastId = 'gap'; d.lastWhy = why; d.gapCd = 1.0; }
    else if (armed) { d.gapPend = why; d.gapPendT = d.clock; }
  }
  if (!hit && !d.live && d.gapPend && armed) {
    if (d.clock - d.gapPendT <= 1.0) { hit = 'gap'; d.lastId = 'gap'; d.lastWhy = d.gapPend; d.gapCd = 1.0; }
    d.gapPend = '';
  }
  {
    // The way it moves in the scene, from the scene positions themselves.
    const svx = wx - d.gx, svz = wz - d.gz;
    const sideMax = GAP_SIDE_K * (sample.frameW > 0 ? sample.frameW : FRAME_W_M) * ws;
    const k = !d.live && armed && !inAuthored ? genericGapKind(d.clr, svx, svz, sideMax) : 0;
    if (inAuthored && d.gapOn) {
      // An authored gap took over: it scores, not the generic one.
      d.gapOn = 0;
    } else if (k) {
      const along = k === 1 ? wz : wx;
      const vAl = k === 1 ? svz : svx;
      if (!d.gapOn || d.gapKind !== k) {
        d.gapOn = 1; d.gapKind = k; d.gapS0 = along; d.gapAlong = along; d.gapSign = vAl < 0 ? -1 : 1;
      } else d.gapAlong = along;
    } else if (d.gapOn) {
      // Out of the opening: through, if it went on the same way and covered
      // the minimum depth between the walls; otherwise a skim.
      const along = d.gapKind === 1 ? wz : wx;
      const depth = (d.gapAlong - d.gapS0) * d.gapSign;
      const onward = (along - d.gapAlong) * d.gapSign > 0;
      const ok = depth >= GAP_MIN_DEPTH_M * ws && onward && !d.live;
      d.gapSeq++;
      d.gapNote = ok ? 'through an opening (' + (depth / ws).toFixed(2) + ' m between walls)'
        : 'skimmed an opening (' + (depth / ws).toFixed(2) + ' m' + (onward ? '' : ', turned back') + ')';
      if (ok && !hit && d.gapCd <= 0) {
        hit = 'gap'; d.gapCd = 1.0; d.lastId = 'gap';
        d.lastWhy = (BY_ID.gap ? BY_ID.gap.name : 'Gap') + '  Beginner  ' + (BY_ID.gap ? BY_ID.gap.points : 125)
          + '  walls within ' + (sideMax / ws).toFixed(2) + ' m, ' + (depth / ws).toFixed(2) + ' m through';
      }
      d.gapOn = 0;
    }
    if (d.gapCd > 0) d.gapCd -= step;
  }
  d.gx = wx; d.gy = wy; d.gz = wz;

  if (!hit && !d.live && armed && d.proxCd <= 0 && !d.gapOn && !inAuthored) {
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
    const pole = id === 'trippy' && det.lastPole;
    // A Maverick back out through the gap it came in by.
    const gapBack = id === 'maverick' && det.lastGapBack;
    // A Double Powerloop (or more) scores the Powerloop's points per loop.
    const loops = id === 'powerloop' ? Math.max(1, det.lastLoops || 1) : 1;
    const got = pushCombo(combo, id, t, {
      prior, b2b, sloppy, bump, indoor, streak, bonus: pole ? TRIPPY_POLE_MUL : gapBack ? MAV_GAP_MUL : loops,
    });
    sessionCount[id] = prior + 1;
    if (sessionLast === id) sessionB2b += 1;
    else sessionB2b = 0;
    sessionLast = id;
    if (got > 0) streak = nextStreak(streak, trickPoints(id, indoor));
    if (bump) streak = Math.max(1, streak * 0.5);
    popName = trickName(id, det.lastDir, loops) + (pole ? ' · POLE' : '') + (gapBack ? ' · GAP' : '');
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
  // step: one detector sample (the page calls it every 4 ms of sim time) and
  // its scoring; no drawing. frame: the HUD, once a rendered frame. tick:
  // both, for callers that step once a frame.
  const stepWrapped = function (sample, dt) {
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
    } catch (err) {
      try { if (typeof console !== 'undefined') console.warn('tricks', err); } catch (e) { /* #198: never blank the FPV frame */ }
    }
    return lastEv;
  };
  const frameWrapped = function () {
    try {
      const t = nowFn();
      if (combo.live && comboRemain(combo, t) <= 0) bank('timeout');
      paintHud(t);
    } catch (err) {
      try { if (typeof console !== 'undefined') console.warn('tricks', err); } catch (e) { /* #198: never blank the FPV frame */ }
    }
  };
  const tickWrapped = function (sample, dt) {
    const ev = stepWrapped(sample, dt);
    frameWrapped();
    return ev;
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
      det.chainOn = 0;
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
    step: stepWrapped,
    frame: frameWrapped,
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
    lastDir: function () { return det.lastDir; },
    lastPole: function () { return det.lastPole; },
    lastLoops: function () { return det.lastLoops; },
    lastSloppy: function () { return det.lastSloppy; },
    lastBump: function () { return det.lastBump; },
    indoor: function () { return indoor; },
    streak: function () { return streak; },
    detector: function () { return det; },
    resetDetector: function (s) { resetDetector(det, s); },
  };
}
