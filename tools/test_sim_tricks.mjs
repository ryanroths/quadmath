// Unit tests for freestyle trick detection + combo scoring.
// Maneuver classifier: one segment → one label. Physics library uses real
// quadphysics.js stick scripts. Node stdlib only:
//   node --test tools/test_sim_tricks.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRICKS_KEY, TRICK_LIST, TRICK_BY_ID, STORE_VER, COMBO_WINDOW_S, RATE_START,
  formatScore, formatScoreFull, comboMul, varietyMul, uniqueBonus, scoreTrick,
  b2bMul, execMul, nextStreak, trickPoints, mapIsIndoor,
  upZOf, headingOf, bodyDelta, scanClearance, unwrapDelta, classifyFeat, featView,
  emptyStore, normalizeStore, loadStore, saveStore, recordBest, bestLine, bestForMap,
  makeDetector, resetDetector, stepDetector, encodeRecJson, REC_KEYS,
  makeCombo, resetCombo, pushCombo, comboRemain,
  createTricks, makeFeat, trickLineupText, TRIPPY_POLE_MUL,
  trickName, MANEUVER_MAX_S, MANEUVER_SUSTAIN_S,
} from '../sim-tricks.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { mapThrottle3d } from '../sim-3d.js';
import { rateSetpoint, pilotRatesDefault } from '../sim-rates.js';
import { createBfCore, emptyState, boxToModule } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import { BACKYARD_PLAY, CITY_PLAY, RIG_PLAY, buildMap, mapGaps } from '../sim-maps.js';
import * as THREE from '../vendor/three.module.min.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'sim-tricks.js'), 'utf8');
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const docs = existsSync(join(root, 'docs/sim-tricks.md')) ? readFileSync(join(root, 'docs/sim-tricks.md'), 'utf8') : '';
const WS = 3.5;

function memStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

function qpSample(qp, extra) {
  const e = extra || {};
  const q = qp.quaternion, om = qp.omega, p = qp.position, v = qp.velocity;
  return {
    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    ox: om.x, oy: om.y, oz: om.z,
    wx: p.x * WS, wy: p.z * WS, wz: -p.y * WS,
    alt: p.z,
    speed: Math.hypot(v.x, v.y, v.z),
    vx: v.x, vy: v.y, vz: v.z,
    clearance: e.clearance == null ? Math.max(0.35, p.z) : e.clearance,
    throttle: e.thr == null ? 0.5 : e.thr,
    armed: qp.armed,
    colliders: e.colliders || null,
    gaps: e.gaps || null,
    frameW: e.frameW || 0,
    ws: WS,
    sr: e.sr || 0, sp: e.sp || 0, sy: e.sy || 0,
  };
}

function fly(phases, opts) {
  const o = opts || {};
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro');
  qp.setPhysicsHz(500);
  if (o.threeD) qp.setThreeD(true);
  qp.reset({ x: o.x0 || 0, y: o.y0 || 0, z: o.z0 == null ? 8 : o.z0 });
  if (o.quat) {
    qp.quaternion.x = o.quat.x; qp.quaternion.y = o.quat.y;
    qp.quaternion.z = o.quat.z; qp.quaternion.w = o.quat.w;
  }
  qp.arm();
  if (o.vx) qp.velocity.x = o.vx;
  if (o.vy) qp.velocity.y = o.vy;
  if (o.vz) qp.velocity.z = o.vz;
  const d = makeDetector();
  const hits = [];
  const dt = 1 / 60;
  resetDetector(d, qpSample(qp, { thr: 0.5, clearance: o.clearance, colliders: o.colliders, gaps: o.gaps }));
  d.lockout = 0;
  let t = 0, phaseI = 0, phaseT = 0;
  const maxT = o.maxT || 3.2;
  while (t < maxT) {
    const ph = phases[Math.min(phaseI, phases.length - 1)];
    let thr = ph.thr == null ? 0.55 : ph.thr;
    if (o.threeD) thr = mapThrottle3d(thr);
    const sp = ph.worldYaw ? worldYawRates(qp.quaternion, ph.worldYaw) : { roll: ph.roll || 0, pitch: ph.pitch || 0, yaw: ph.yaw || 0 };
    qp.step(dt, sp, thr, { r: 0, p: 0, y: 0 });
    if (!o.allowFloor && qp.position.z < 0.4) {
      qp.position.z = 0.4;
      if (qp.velocity.z < 0) qp.velocity.z *= 0.15;
    }
    const ev = stepDetector(d, qpSample(qp, { thr, clearance: o.clearance, colliders: o.colliders, gaps: o.gaps }), dt);
    if (ev && TRICK_BY_ID[ev]) hits.push(ev);
    t += dt; phaseT += dt;
    if (ph.t != null && phaseT >= ph.t && phaseI < phases.length - 1) { phaseI++; phaseT = 0; }
  }
  return { hits, last: d.lastId, why: d.lastWhy, feat: d.lastFeat, view: featView(d.lastFeat), pole: d.lastPole };
}

// A pilot's yaw about the world vertical at w rad/s, as body rates for the
// attitude q: what cyclic roll and pitch with yaw make of a tilted spin (the
// thrust then swings round, and the path orbits).
function worldYawRates(q, w) {
  return {
    roll: 2 * (q.x * q.z - q.w * q.y) * w,
    pitch: 2 * (q.y * q.z + q.w * q.x) * w,
    yaw: (1 - 2 * (q.x * q.x + q.y * q.y)) * w,
  };
}

function labels(r) { return r.hits.slice(); }

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const WHOOP_ACTUAL = {
  type: 'ACTUAL',
  roll: { rcRate: 2.0, srate: 74, expo: 0.56 },
  pitch: { rcRate: 2.0, srate: 74, expo: 0.56 },
  yaw: { rcRate: 1.8, srate: 62, expo: 0.50 },
};
const WHOOP_KISS = {
  type: 'KISS',
  roll: { rcRate: 1.10, srate: 0.72, expo: 0.25 },
  pitch: { rcRate: 1.10, srate: 0.72, expo: 0.25 },
  yaw: { rcRate: 1.10, srate: 0.72, expo: 0.25 },
};

function mulberry(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flyPilot(phases, opts) {
  const o = opts || {};
  const rates = o.rates || WHOOP_ACTUAL;
  const rng = mulberry(o.seed == null ? 7 : o.seed);
  const noise = o.noise == null ? 0.06 : o.noise;
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro');
  qp.setPhysicsHz(500);
  if (o.threeD) qp.setThreeD(true);
  qp.reset({ x: o.x0 || 0, y: o.y0 || 0, z: o.z0 == null ? 8 : o.z0 });
  if (o.quat) {
    qp.quaternion.x = o.quat.x; qp.quaternion.y = o.quat.y;
    qp.quaternion.z = o.quat.z; qp.quaternion.w = o.quat.w;
  }
  qp.arm();
  if (o.vx) qp.velocity.x = o.vx;
  if (o.vy) qp.velocity.y = o.vy;
  if (o.vz) qp.velocity.z = o.vz;
  const d = makeDetector();
  const hits = [];
  const dt = 1 / 60;
  resetDetector(d, qpSample(qp, { thr: 0.5, clearance: o.clearance, colliders: o.colliders }));
  d.lockout = 0;
  let t = 0, phaseI = 0, phaseT = 0;
  const maxT = o.maxT || 3.6;
  while (t < maxT) {
    const ph = phases[Math.min(phaseI, phases.length - 1)];
    let thr = ph.thr == null ? 0.55 : ph.thr;
    if (o.thrWobble) thr = Math.max(0, Math.min(1, thr + (rng() - 0.5) * o.thrWobble));
    if (o.threeD) thr = mapThrottle3d(thr);
    const stickVal = (key) => {
      const raw = ph[key] || 0;
      const n = raw === 0 ? (rng() - 0.5) * noise * 0.4 : raw + (rng() - 0.5) * noise;
      return Math.max(-1, Math.min(1, n));
    };
    const sr = stickVal('rollS'), sp = stickVal('pitchS'), sy = stickVal('yawS');
    qp.step(dt, {
      roll: rateSetpoint(rates.type, sr, rates.roll) * DEG,
      pitch: rateSetpoint(rates.type, sp, rates.pitch) * DEG,
      yaw: rateSetpoint(rates.type, sy, rates.yaw) * DEG,
    }, thr, { r: 0, p: 0, y: 0 });
    if (!o.allowFloor && qp.position.z < 0.4) {
      qp.position.z = 0.4;
      if (qp.velocity.z < 0) qp.velocity.z *= 0.15;
    }
    const ev = stepDetector(d, qpSample(qp, { thr, clearance: o.clearance, colliders: o.colliders, sr, sp, sy }), dt);
    if (ev && TRICK_BY_ID[ev]) hits.push(ev);
    t += dt; phaseT += dt;
    if (ph.t != null && phaseT >= ph.t && phaseI < phases.length - 1) { phaseI++; phaseT = 0; }
  }
  return { hits, last: d.lastId, why: d.lastWhy, feat: d.lastFeat, view: featView(d.lastFeat) };
}

const GAP_COLS = [
  { min: { x: 8, y: 0, z: -10 }, max: { x: 22, y: 12, z: -0.85 } },
  { min: { x: 8, y: 0, z: 0.85 }, max: { x: 22, y: 12, z: 10 } },
  { min: { x: 8, y: 4.4, z: -10 }, max: { x: 22, y: 10, z: 10 } },
];
// GAP_COLS' opening as an authored gap volume, flown along x.
const GAP_VOLS = [{ name: 'test gap', axis: 'x', min: { x: 8, y: 0, z: -0.85 }, max: { x: 22, y: 4.4, z: 0.85 } }];
// Two walls 0.36 m apart (0.18 m each side of the path) and nothing over it.
const SLOT_COLS = [
  { min: { x: 8, y: 0, z: -10 }, max: { x: 22, y: 12, z: -0.63 } },
  { min: { x: 8, y: 0, z: 0.63 }, max: { x: 22, y: 12, z: 10 } },
];
const WALL_COLS = [
  { min: { x: -4, y: 0, z: 1.05 }, max: { x: 40, y: 14, z: 10 } },
];
const OBJ_BAR = [
  { min: { x: 8, y: 7, z: -3 }, max: { x: 18, y: 10.5, z: 3 } },
];
const OBJ_POLE = [
  { min: { x: 6, y: 0, z: -0.7 }, max: { x: 7.4, y: 12, z: 0.7 } },
];
const OBJ_TREE = [
  { min: { x: 8, y: 0, z: -1.0 }, max: { x: 10.2, y: 16, z: 1.0 } },
];
const NEAR_POLE = { z0: 2.4, x0: 1.45, vx: 0.25, colliders: OBJ_POLE };
const NEAR_TREE = { z0: 2.6, x0: 1.9, y0: 0.55, vx: 0.4, vy: 1.4, colliders: OBJ_TREE };

const LIBRARY = [
  { id: 'flip', name: 'flip-front', phases: [{ t: 0.85, pitch: 8.5, thr: 0.45 }, { t: 0.5, pitch: 0, thr: 0.4 }], opts: { z0: 5, vx: 0.4, maxT: 1.8 } },
  { id: 'flip', name: 'flip-back', phases: [{ t: 0.85, pitch: -8.5, thr: 0.45 }, { t: 0.5, pitch: 0, thr: 0.4 }], opts: { z0: 5, vx: 0.4, maxT: 1.8 } },
  { id: 'flip', name: 'flip-slow', phases: [{ t: 1.15, pitch: 6.2, thr: 0.42 }, { t: 0.5, pitch: 0, thr: 0.4 }], opts: { z0: 5.5, vx: 0.3, maxT: 2.1 } },
  { id: 'roll', name: 'roll-fast', phases: [{ t: 0.85, roll: 8.5, thr: 0.5 }, { t: 0.5, roll: 0, thr: 0.45 }], opts: { z0: 4, vx: 3, maxT: 1.8 } },
  { id: 'roll', name: 'roll-slow', phases: [{ t: 1.15, roll: 6.2, thr: 0.48 }, { t: 0.45, roll: 0, thr: 0.45 }], opts: { z0: 4, vx: 2.5, maxT: 2.0 } },
  { id: 'roll', name: 'roll-sloppy', phases: [{ t: 0.9, roll: 8.2, pitch: 0.6, thr: 0.5 }, { t: 0.5, roll: 0, pitch: 0, thr: 0.45 }], opts: { z0: 4.2, vx: 3.2, maxT: 1.9 } },
  { id: 'yawspin', name: 'yaw-fast', phases: [{ t: 1.0, yaw: 7.5, thr: 0.45 }, { t: 0.5, yaw: 0, thr: 0.4 }], opts: { z0: 3, vx: 1.2, maxT: 2 } },
  { id: 'yawspin', name: 'yaw-slow', phases: [{ t: 1.35, yaw: 5.6, thr: 0.42 }, { t: 0.45, yaw: 0, thr: 0.4 }], opts: { z0: 3.2, vx: 1.0, maxT: 2.2 } },
  { id: 'yawspin', name: 'yaw-sloppy', phases: [{ t: 1.05, yaw: 7.2, roll: 0.5, thr: 0.45 }, { t: 0.45, yaw: 0, roll: 0, thr: 0.4 }], opts: { z0: 3, vx: 1.3, maxT: 2 } },
  { id: 'powerloop', name: 'pl-fast', phases: [{ t: 0.25, pitch: 0, thr: 0.8 }, { t: 1.05, pitch: -6.4, thr: 0.88 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 6, vx: 7, maxT: 2.4, colliders: OBJ_BAR } },
  { id: 'powerloop', name: 'pl-slow', phases: [{ t: 0.3, pitch: 0, thr: 0.75 }, { t: 1.35, pitch: -5.0, thr: 0.82 }, { t: 0.6, pitch: 0, thr: 0.48 }], opts: { z0: 7, vx: 5.5, maxT: 2.8, colliders: OBJ_BAR } },
  { id: 'powerloop', name: 'pl-high', phases: [{ t: 0.28, pitch: 0, thr: 0.9 }, { t: 1.15, pitch: -6.0, thr: 0.9 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 8, vx: 6.5, maxT: 2.5, colliders: OBJ_BAR } },
  { id: 'matty', name: 'matty-fast', phases: [{ t: 0.10, pitch: 0, thr: 0.35 }, { t: 0.72, pitch: 8.2, thr: 0.08 }, { t: 0.55, pitch: 0, thr: 0.62 }], opts: { z0: 9, vx: 7, maxT: 2.1, colliders: OBJ_BAR } },
  { id: 'matty', name: 'matty-high', phases: [{ t: 0.10, pitch: 0, thr: 0.32 }, { t: 0.80, pitch: 7.4, thr: 0.06 }, { t: 0.55, pitch: 0, thr: 0.6 }], opts: { z0: 11, vx: 6.5, maxT: 2.2, colliders: OBJ_BAR } },
  { id: 'matty', name: 'matty-sloppy', phases: [{ t: 0.10, pitch: 0, thr: 0.35 }, { t: 0.75, pitch: 8.0, yaw: 0.5, thr: 0.08 }, { t: 0.55, pitch: 0, yaw: 0, thr: 0.6 }], opts: { z0: 9.5, vx: 6.8, maxT: 2.15, colliders: OBJ_BAR } },
  { id: 'halfmatty', name: 'hm-fast', phases: [{ t: 0.28, roll: 11, pitch: 0, thr: 0.5 }, { t: 0.48, roll: 0, pitch: 7.4, thr: 0.32 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 9, vx: 7, maxT: 2.0, colliders: OBJ_BAR } },
  { id: 'halfmatty', name: 'hm-slow', phases: [{ t: 0.32, roll: 10, pitch: 0, thr: 0.48 }, { t: 0.55, roll: 0, pitch: 6.4, thr: 0.3 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 9.4, vx: 6.4, maxT: 2.15, colliders: OBJ_BAR } },
  { id: 'halfmatty', name: 'hm-high', phases: [{ t: 0.28, roll: 11, pitch: 0, thr: 0.5 }, { t: 0.50, roll: 0, pitch: 7.0, thr: 0.28 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 10.5, vx: 7.2, maxT: 2.05, colliders: OBJ_BAR } },
  { id: 'splits', name: 'ss-fast', phases: [{ t: 0.28, roll: 11, pitch: 0, thr: 0.55 }, { t: 0.55, roll: 0, pitch: -7.5, thr: 0.35 }, { t: 0.5, roll: 0, pitch: 0, thr: 0.5 }], opts: { z0: 10, vx: 8, maxT: 2.0, colliders: OBJ_BAR } },
  { id: 'splits', name: 'ss-slow', phases: [{ t: 0.30, roll: 11, pitch: 0, thr: 0.5 }, { t: 0.60, roll: 0, pitch: -7.2, thr: 0.32 }, { t: 0.5, roll: 0, pitch: 0, thr: 0.5 }], opts: { z0: 10.4, vx: 7.6, maxT: 2.15, colliders: OBJ_BAR } },
  { id: 'splits', name: 'ss-sloppy', phases: [{ t: 0.28, roll: 11, pitch: 0.2, thr: 0.55 }, { t: 0.55, roll: 0, pitch: -7.4, thr: 0.34 }, { t: 0.5, pitch: 0, thr: 0.5 }], opts: { z0: 10.2, vx: 8.2, maxT: 2.1, colliders: OBJ_BAR } },
  { id: 'maverick', name: 'mav-std', phases: [{ t: 0.50, pitch: -3.6, thr: 0.95 }, { t: 0.50, pitch: 3.4, thr: 0.22 }, { t: 0.45, pitch: 0.2, thr: 0.62 }, { t: 0.4, pitch: 0, thr: 0.5 }], opts: { z0: 3.5, vx: 4.5, maxT: 2.5, colliders: OBJ_BAR } },
  { id: 'maverick', name: 'mav-slow', phases: [{ t: 0.62, pitch: -3.0, thr: 0.92 }, { t: 0.58, pitch: 2.9, thr: 0.2 }, { t: 0.45, pitch: 0, thr: 0.58 }], opts: { z0: 3.2, vx: 4.0, maxT: 2.6, colliders: OBJ_BAR } },
  { id: 'maverick', name: 'mav-high', phases: [{ t: 0.52, pitch: -3.4, thr: 0.98 }, { t: 0.52, pitch: 3.2, thr: 0.18 }, { t: 0.45, pitch: 0, thr: 0.6 }], opts: { z0: 4.5, vx: 4.2, maxT: 2.5, colliders: OBJ_BAR } },
  // A spin in place by a pole or tree is a Yaw Spin: a Trippy orbits.
  { id: 'yawspin', name: 'pole-spin', phases: [{ t: 1.15, yaw: 7.2, thr: 0.48 }, { t: 0.5, yaw: 0, thr: 0.42 }], opts: { ...NEAR_POLE, maxT: 2.1 } },
  { id: 'yawspin', name: 'pole-spin-fast', phases: [{ t: 0.95, yaw: 8.2, thr: 0.5 }, { t: 0.45, yaw: 0, thr: 0.44 }], opts: { ...NEAR_POLE, z0: 2.2, maxT: 1.9 } },
  { id: 'yawspin', name: 'pole-spin-ccw', phases: [{ t: 1.15, yaw: -7.2, thr: 0.48 }, { t: 0.5, yaw: 0, thr: 0.42 }], opts: { ...NEAR_POLE, maxT: 2.1 } },
  { id: 'yawspin', name: 'tree-spin', phases: [{ t: 1.15, yaw: 7.4, thr: 0.5 }, { t: 0.5, yaw: 0, thr: 0.44 }], opts: { ...NEAR_TREE, maxT: 2.1 } },
  // Trippy: tilt, then yaw about the vertical (the thrust swings round and
  // the path orbits), starting at the orbit's speed a / w along it.
  { id: 'trippy', name: 'trip-orbit', phases: [{ t: 0.125, pitch: 7, thr: 0.55 }, { t: 2.5, worldYaw: 5.8, thr: 0.6 }, { t: 0.6, thr: 0.5 }], opts: { z0: 5, vy: -2.03, maxT: 3.7 } },
  { id: 'trippy', name: 'trip-orbit-fast', phases: [{ t: 0.125, pitch: 7, thr: 0.55 }, { t: 2.5, worldYaw: 6.3, thr: 0.7 }, { t: 0.6, thr: 0.5 }], opts: { z0: 5, vy: -1.86, maxT: 3.7 } },
  { id: 'trippy', name: 'trip-orbit-cw', phases: [{ t: 0.14, pitch: 7, thr: 0.55 }, { t: 2.5, worldYaw: -6.0, thr: 0.65 }, { t: 0.6, thr: 0.5 }], opts: { z0: 5, vy: 2.4, maxT: 3.7 } },
  // Barani: pitch to the vertical, a half twist there, pitch on to upright.
  { id: 'barani', name: 'barani-front', phases: [{ t: 0.2, pitch: 8, thr: 0.5 }, { t: 0.286, roll: 11, thr: 0.4 }, { t: 0.59, pitch: 8, thr: 0.5 }, { t: 0.6, thr: 0.5 }], opts: { z0: 6, vx: 1, maxT: 2.2 } },
  { id: 'barani', name: 'barani-back', phases: [{ t: 0.2, pitch: -8, thr: 0.5 }, { t: 0.286, roll: -11, thr: 0.4 }, { t: 0.59, pitch: -8, thr: 0.5 }, { t: 0.6, thr: 0.5 }], opts: { z0: 6, vx: 1, maxT: 2.2 } },
  { id: 'ham', name: 'ham-inv', phases: [{ t: 1.15, yaw: 7.2, thr: 0.28 }, { t: 0.55, yaw: 0, thr: 0.28 }], opts: { z0: 6, vx: 0.2, maxT: 2.2, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 } } },
  { id: 'ham', name: 'ham-inv-fast', phases: [{ t: 0.95, yaw: 8.2, thr: 0.26 }, { t: 0.55, yaw: 0, thr: 0.26 }], opts: { z0: 6.2, vx: 0.15, maxT: 2.0, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 } } },
  { id: 'ham', name: 'ham-inv-ccw', phases: [{ t: 1.15, yaw: -7.2, thr: 0.28 }, { t: 0.55, yaw: 0, thr: 0.28 }], opts: { z0: 6, vx: 0.2, maxT: 2.2, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 } } },
  { id: 'sideloop', name: 'sl-std', phases: [{ t: 0.38, yaw: 6.2, thr: 0.55 }, { t: 0.95, roll: 7.0, yaw: 2.4, thr: 0.85 }, { t: 0.32, roll: 6.2, yaw: 1.0, thr: 0.22 }, { t: 0.4, roll: 0, yaw: 0, thr: 0.55 }], opts: { z0: 4.5, vx: 5.5, maxT: 2.8, colliders: OBJ_BAR } },
  { id: 'sideloop', name: 'sl-fast', phases: [{ t: 0.32, yaw: 7.0, thr: 0.58 }, { t: 0.82, roll: 8.0, yaw: 2.6, thr: 0.88 }, { t: 0.28, roll: 6.5, yaw: 1.1, thr: 0.2 }, { t: 0.4, roll: 0, yaw: 0, thr: 0.55 }], opts: { z0: 4.8, vx: 6.0, maxT: 2.5, colliders: OBJ_BAR } },
  { id: 'sideloop', name: 'sl-slow', phases: [{ t: 0.48, yaw: 5.4, thr: 0.52 }, { t: 1.1, roll: 6.2, yaw: 2.0, thr: 0.8 }, { t: 0.38, roll: 5.6, yaw: 0.9, thr: 0.24 }, { t: 0.45, roll: 0, yaw: 0, thr: 0.52 }], opts: { z0: 4.2, vx: 5.0, maxT: 3.1, colliders: OBJ_BAR } },
  { id: 'cradle', name: 'crd-std', phases: [{ t: 0.38, pitch: -4.2, thr: 0.42 }, { t: 0.38, pitch: 3.6, thr: 0.4 }, { t: 0.5, pitch: 0, thr: 0.45 }], opts: { z0: 3.6, vx: 5.5, maxT: 1.9, colliders: OBJ_POLE } },
  { id: 'cradle', name: 'crd-slow', phases: [{ t: 0.48, pitch: -3.4, thr: 0.4 }, { t: 0.45, pitch: 3.0, thr: 0.38 }, { t: 0.5, pitch: 0, thr: 0.44 }], opts: { z0: 3.4, vx: 4.8, maxT: 2.1, colliders: OBJ_POLE } },
  { id: 'cradle', name: 'crd-fast', phases: [{ t: 0.32, pitch: -4.6, thr: 0.44 }, { t: 0.32, pitch: 4.0, thr: 0.42 }, { t: 0.45, pitch: 0, thr: 0.45 }], opts: { z0: 3.8, vx: 6.0, maxT: 1.75, colliders: OBJ_POLE } },
  { id: 'juicyflick', name: 'jf-fast', phases: [{ t: 0.42, pitch: 8.4, thr: 0.88 }, { t: 0.28, pitch: 0, roll: 11, thr: 0.5 }, { t: 0.4, roll: 0, thr: 0.5 }], opts: { z0: 5, vx: 6, maxT: 1.7 } },
  { id: 'juicyflick', name: 'jf-slow', phases: [{ t: 0.52, pitch: 7.0, thr: 0.82 }, { t: 0.32, pitch: 0, roll: 10, thr: 0.48 }, { t: 0.4, roll: 0, thr: 0.48 }], opts: { z0: 5.2, vx: 5.2, maxT: 1.85 } },
  { id: 'juicyflick', name: 'jf-high', phases: [{ t: 0.44, pitch: 8.0, thr: 0.9 }, { t: 0.28, pitch: 0, roll: 11, thr: 0.5 }, { t: 0.4, roll: 0, thr: 0.5 }], opts: { z0: 6.5, vx: 5.8, maxT: 1.75 } },
  { id: 'snapback', name: 'sb-fast', phases: [{ t: 0.42, pitch: -8.4, thr: 0.72 }, { t: 0.28, pitch: 0, roll: 11, thr: 0.5 }, { t: 0.4, roll: 0, thr: 0.5 }], opts: { z0: 4.5, vx: 6, maxT: 1.7, colliders: OBJ_BAR } },
  { id: 'snapback', name: 'sb-slow', phases: [{ t: 0.52, pitch: -7.0, thr: 0.66 }, { t: 0.32, pitch: 0, roll: 10, thr: 0.48 }, { t: 0.4, roll: 0, thr: 0.48 }], opts: { z0: 4.8, vx: 5.2, maxT: 1.85, colliders: OBJ_BAR } },
  { id: 'snapback', name: 'sb-high', phases: [{ t: 0.44, pitch: -8.0, thr: 0.75 }, { t: 0.28, pitch: 0, roll: 11, thr: 0.5 }, { t: 0.4, roll: 0, thr: 0.5 }], opts: { z0: 5.8, vx: 5.6, maxT: 1.75, colliders: OBJ_BAR } },
  { id: 'rubik', name: 'rk-std', phases: [{ t: 0.28, pitch: 11, roll: 0, thr: 0.5 }, { t: 0.85, pitch: 0, roll: 8.4, thr: 0.48 }, { t: 0.28, pitch: 11, roll: 0, thr: 0.5 }, { t: 0.4, pitch: 0, roll: 0, thr: 0.45 }], opts: { z0: 6, vx: 2.5, maxT: 2.4 } },
  { id: 'rubik', name: 'rk-fast', phases: [{ t: 0.24, pitch: 12, roll: 0, thr: 0.52 }, { t: 0.75, pitch: 0, roll: 9.2, thr: 0.5 }, { t: 0.24, pitch: 12, roll: 0, thr: 0.5 }, { t: 0.35, pitch: 0, roll: 0, thr: 0.45 }], opts: { z0: 6.2, vx: 2.8, maxT: 2.2 } },
  { id: 'rubik', name: 'rk-slow', phases: [{ t: 0.34, pitch: 9.5, roll: 0, thr: 0.48 }, { t: 1.0, pitch: 0, roll: 7.2, thr: 0.46 }, { t: 0.34, pitch: 9.5, roll: 0, thr: 0.48 }, { t: 0.4, pitch: 0, roll: 0, thr: 0.44 }], opts: { z0: 5.8, vx: 2.2, maxT: 2.7 } },
  { id: 'cubik', name: 'ck-std', phases: [{ t: 0.28, roll: 11, pitch: 0, thr: 0.5 }, { t: 0.85, roll: 0, pitch: 8.4, thr: 0.48 }, { t: 0.28, roll: 11, pitch: 0, thr: 0.5 }, { t: 0.4, pitch: 0, roll: 0, thr: 0.45 }], opts: { z0: 6, vx: 2.5, maxT: 2.4 } },
  { id: 'cubik', name: 'ck-fast', phases: [{ t: 0.24, roll: 12, pitch: 0, thr: 0.52 }, { t: 0.75, roll: 0, pitch: 9.2, thr: 0.5 }, { t: 0.24, roll: 12, pitch: 0, thr: 0.5 }, { t: 0.35, pitch: 0, roll: 0, thr: 0.45 }], opts: { z0: 6.2, vx: 2.8, maxT: 2.2 } },
  { id: 'cubik', name: 'ck-slow', phases: [{ t: 0.34, roll: 9.5, pitch: 0, thr: 0.48 }, { t: 1.0, roll: 0, pitch: 7.2, thr: 0.46 }, { t: 0.34, roll: 9.5, pitch: 0, thr: 0.48 }, { t: 0.4, pitch: 0, roll: 0, thr: 0.44 }], opts: { z0: 5.8, vx: 2.2, maxT: 2.7 } },
  { id: 'dive', name: 'dive-std', phases: [{ t: 0.85, pitch: 1.2, thr: 0.05 }], opts: { z0: 16, vx: 9, vz: -12, maxT: 1.2, clearance: 10, allowFloor: true } },
  { id: 'dive', name: 'dive-fast', phases: [{ t: 0.7, pitch: 1.4, thr: 0.04 }], opts: { z0: 18, vx: 8, vz: -13, maxT: 1.1, clearance: 12, allowFloor: true } },
  { id: 'dive', name: 'dive-steep', phases: [{ t: 0.9, pitch: 1.0, thr: 0.06 }], opts: { z0: 17, vx: 10, vz: -11, maxT: 1.25, clearance: 11, allowFloor: true } },
  { id: 'gap', name: 'gap-std', phases: [{ t: 2.3, pitch: 0, thr: 0.36 }], opts: { z0: 0.9, vx: 8, maxT: 2.3, colliders: GAP_COLS, gaps: GAP_VOLS, clearance: 0.9 } },
  { id: 'gap', name: 'gap-fast', phases: [{ t: 1.9, pitch: 0, thr: 0.36 }], opts: { z0: 0.85, vx: 10, maxT: 1.9, colliders: GAP_COLS, gaps: GAP_VOLS, clearance: 0.85 } },
  { id: 'gap', name: 'gap-slow', phases: [{ t: 2.8, pitch: 0, thr: 0.36 }], opts: { z0: 0.95, vx: 6.5, maxT: 2.8, colliders: GAP_COLS, gaps: GAP_VOLS, clearance: 0.95 } },
  // No authored volume: a slot narrow enough for the generic rule.
  { id: 'gap', name: 'gap-generic-slot', phases: [{ t: 2.4, pitch: 0, thr: 0.36 }], opts: { z0: 0.9, vx: 6, maxT: 2.4, colliders: SLOT_COLS, clearance: 0.9 } },
  { id: 'prox', name: 'prox-std', phases: [{ t: 0.9, pitch: 0, thr: 0.8 }], opts: { z0: 1.2, vx: 12, maxT: 1.2, colliders: WALL_COLS, clearance: 1.2 } },
  { id: 'prox', name: 'prox-fast', phases: [{ t: 0.8, pitch: 0, thr: 0.9 }], opts: { z0: 1.3, vx: 14, maxT: 1.1, colliders: WALL_COLS, clearance: 1.3 } },
  { id: 'prox', name: 'prox-low', phases: [{ t: 0.95, pitch: 0, thr: 0.78 }], opts: { z0: 0.8, vx: 11, maxT: 1.25, colliders: WALL_COLS, clearance: 0.8 } },
];

const PILOT_LIBRARY = [
  { id: 'flip', name: 'pilot-flip-actual', phases: [{ t: 0.95, pitchS: 0.88, thr: 0.46 }, { t: 0.45, pitchS: 0, thr: 0.42 }], opts: { z0: 5, vx: 0.4, maxT: 2.0, rates: WHOOP_ACTUAL, seed: 101, noise: 0.05, thrWobble: 0.06 } },
  { id: 'roll', name: 'pilot-roll-kiss', phases: [{ t: 0.85, rollS: 0.86, thr: 0.5 }, { t: 0.4, rollS: 0, thr: 0.45 }], opts: { z0: 4, vx: 3, maxT: 1.9, rates: WHOOP_KISS, seed: 102, noise: 0.05, thrWobble: 0.06 } },
  { id: 'juicyflick', name: 'pilot-juicy-actual', phases: [{ t: 0.48, pitchS: 0.86, thr: 0.86 }, { t: 0.32, pitchS: 0, rollS: 0.9, thr: 0.5 }, { t: 0.4, rollS: 0, thr: 0.5 }], opts: { z0: 5, vx: 6, maxT: 1.9, rates: WHOOP_ACTUAL, seed: 103, noise: 0.05, thrWobble: 0.06 } },
  { id: 'snapback', name: 'pilot-snap-kiss', phases: [{ t: 0.48, pitchS: -0.86, thr: 0.72 }, { t: 0.32, pitchS: 0, rollS: 0.9, thr: 0.5 }, { t: 0.4, rollS: 0, thr: 0.5 }], opts: { z0: 4.5, vx: 6, maxT: 1.9, colliders: OBJ_BAR, rates: WHOOP_KISS, seed: 104, noise: 0.05, thrWobble: 0.06 } },
  { id: 'matty', name: 'pilot-matty-actual', phases: [{ t: 0.12, pitchS: 0, thr: 0.34 }, { t: 0.78, pitchS: 0.84, thr: 0.08 }, { t: 0.55, pitchS: 0, thr: 0.62 }], opts: { z0: 9, vx: 7, maxT: 2.2, colliders: OBJ_BAR, rates: WHOOP_ACTUAL, seed: 105, noise: 0.05, thrWobble: 0.05 } },
  { id: 'powerloop', name: 'pilot-pl-actual', phases: [{ t: 0.22, pitchS: 0, thr: 0.8 }, { t: 1.05, pitchS: -0.82, thr: 0.86 }, { t: 0.5, pitchS: 0, thr: 0.5 }], opts: { z0: 6, vx: 7, maxT: 2.5, colliders: OBJ_BAR, rates: WHOOP_ACTUAL, seed: 106, noise: 0.05, thrWobble: 0.06 } },
  { id: 'maverick', name: 'pilot-mav-half', phases: [{ t: 0.18, pitchS: 0, thr: 0.62 }, { t: 0.78, pitchS: -0.48, thr: 0.9 }, { t: 0.78, pitchS: 0.48, thr: 0.26 }, { t: 0.45, pitchS: 0, thr: 0.55 }], opts: { z0: 3.5, vx: 4.5, maxT: 3.0, colliders: OBJ_BAR, rates: WHOOP_ACTUAL, seed: 201, noise: 0.05, thrWobble: 0.08 } },
  { id: 'maverick', name: 'pilot-mav-052', phases: [{ t: 0.15, pitchS: 0, thr: 0.64 }, { t: 0.72, pitchS: -0.52, thr: 0.9 }, { t: 0.72, pitchS: 0.50, thr: 0.24 }, { t: 0.45, pitchS: 0, thr: 0.56 }], opts: { z0: 3.4, vx: 4.2, maxT: 2.9, colliders: OBJ_BAR, rates: WHOOP_ACTUAL, seed: 202, noise: 0.06, thrWobble: 0.08 } },
  { id: 'maverick', name: 'pilot-mav-kiss', phases: [{ t: 0.15, pitchS: 0, thr: 0.62 }, { t: 0.50, pitchS: -0.55, thr: 0.9 }, { t: 0.52, pitchS: 0.52, thr: 0.22 }, { t: 0.4, pitchS: 0, thr: 0.55 }], opts: { z0: 3.6, vx: 4.4, maxT: 2.6, colliders: OBJ_BAR, rates: WHOOP_KISS, seed: 203, noise: 0.06, thrWobble: 0.08 } },
  { id: 'maverick', name: 'pilot-mav-against', phases: [{ t: 0.55, pitchS: -0.68, thr: 0.94 }, { t: 0.68, pitchS: 0.64, thr: 0.2 }, { t: 0.45, pitchS: 0.08, thr: 0.58 }], opts: { z0: 3.2, vx: 3.2, maxT: 2.6, colliders: OBJ_BAR, rates: WHOOP_ACTUAL, seed: 204, noise: 0.05, thrWobble: 0.07 } },
  { id: 'yawspin', name: 'pilot-pole-spin-actual', phases: [{ t: 1.2, yawS: 0.95, thr: 0.5 }, { t: 0.45, yawS: 0, thr: 0.45 }], opts: { ...NEAR_POLE, maxT: 2.2, rates: WHOOP_ACTUAL, seed: 301, noise: 0.04, thrWobble: 0.05 } },
  { id: 'yawspin', name: 'pilot-pole-spin-kiss', phases: [{ t: 1.15, yawS: 0.92, thr: 0.5 }, { t: 0.45, yawS: 0, thr: 0.45 }], opts: { ...NEAR_POLE, maxT: 2.1, rates: WHOOP_KISS, seed: 303, noise: 0.04, thrWobble: 0.05 } },
  { id: 'yawspin', name: 'pilot-tree-spin', phases: [{ t: 1.2, yawS: 0.94, thr: 0.5 }, { t: 0.45, yawS: 0, thr: 0.45 }], opts: { ...NEAR_TREE, maxT: 2.2, rates: WHOOP_ACTUAL, seed: 304, noise: 0.04, thrWobble: 0.05 } },
  { id: 'ham', name: 'pilot-ham-actual', phases: [{ t: 1.2, yawS: 0.95, thr: 0.28 }, { t: 0.5, yawS: 0, thr: 0.28 }], opts: { z0: 6, vx: 0.15, maxT: 2.3, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 }, rates: WHOOP_ACTUAL, seed: 351, noise: 0.03, thrWobble: 0.03 } },
  { id: 'sideloop', name: 'pilot-side-actual', phases: [{ t: 0.55, yawS: 0.75, thr: 0.55 }, { t: 0.95, rollS: 0.75, yawS: 0.28, thr: 0.84 }, { t: 0.35, rollS: 0.58, yawS: 0.14, thr: 0.22 }, { t: 0.4, rollS: 0.3, thr: 0.68 }, { t: 0.4, rollS: 0, yawS: 0, thr: 0.5 }], opts: { z0: 4.5, vx: 5.0, maxT: 3.4, colliders: OBJ_BAR, rates: WHOOP_ACTUAL, seed: 401, noise: 0.05, thrWobble: 0.07 } },
  { id: 'sideloop', name: 'pilot-side-kiss', phases: [{ t: 0.38, yawS: 0.72, rollS: 0.08, thr: 0.58 }, { t: 1.05, rollS: 0.70, yawS: 0.38, thr: 0.8 }, { t: 0.35, rollS: 0.35, yawS: 0.1, thr: 0.28 }, { t: 0.4, rollS: 0, yawS: 0, thr: 0.55 }], opts: { z0: 4.8, vx: 5.2, maxT: 3.1, colliders: OBJ_BAR, rates: WHOOP_KISS, seed: 402, noise: 0.06, thrWobble: 0.07 } },
];

test('new storage key only; never writes old ryfly* keys', () => {
  assert.equal(TRICKS_KEY, 'quadmathSimTricks');
  assert.equal(STORE_VER, 1);
  assert.ok(src.includes('setItem(TRICKS_KEY') || src.includes('store.setItem(TRICKS_KEY'));
  assert.equal(src.includes('ryflyDroneType'), false);
  assert.equal(src.includes('ryflyRates'), false);
  assert.ok(src.includes('Nothing here is copied from WebFPV') || src.includes('copied from WebFPV (GPL)'));
  assert.ok(src.includes('Do not write old ryfly'));
  assert.ok(src.includes('Neon Current') || src.includes('#ff2bd6'));
  assert.equal(src.includes('FLIPPED — R TO RESPAWN'), false);
  assert.ok(src.includes('one rotation segment') || src.includes('exactly one'));
});

test('trick list has the requested maneuvers and frozen point values', () => {
  const ids = TRICK_LIST.map((t) => t.id);
  for (const id of ['flip', 'roll', 'yawspin', 'powerloop', 'sideloop', 'splits', 'matty', 'halfmatty', 'maverick', 'trippy', 'ham', 'dive', 'gap', 'prox', 'cradle', 'juicyflick', 'snapback', 'rubik', 'cubik', 'barani']) {
    assert.ok(ids.includes(id), 'missing ' + id);
    assert.ok(TRICK_BY_ID[id].points > 0);
    assert.ok(TRICK_BY_ID[id].name);
    assert.ok(TRICK_BY_ID[id].tier);
  }
  assert.equal(ids.includes('hang'), false);
  assert.equal(TRICK_BY_ID.flip.points, 50);
  assert.equal(TRICK_BY_ID.roll.points, 50);
  assert.equal(TRICK_BY_ID.yawspin.points, 50);
  assert.equal(TRICK_BY_ID.powerloop.points, 200);
  assert.equal(TRICK_BY_ID.sideloop.points, 200);
  assert.equal(TRICK_BY_ID.sideloop.pointsIn, 225);
  assert.equal(TRICK_BY_ID.sideloop.tier, 'Novice');
  assert.equal(TRICK_BY_ID.matty.points, 200);
  assert.equal(TRICK_BY_ID.halfmatty.points, 350);
  assert.equal(TRICK_BY_ID.maverick.points, 100);
  assert.equal(TRICK_BY_ID.trippy.points, 500);
  assert.equal(TRICK_BY_ID.ham.points, 300);
  assert.equal(TRICK_BY_ID.ham.pointsIn, 300);
  assert.equal(TRICK_BY_ID.ham.name, 'Ham Spin');
  assert.equal(TRICK_BY_ID.ham.tier, 'Intermediate');
  assert.ok(trickLineupText().includes('Ham Spin'));
  assert.ok(trickLineupText().includes('Trippy Spin'));
  assert.equal(TRICK_BY_ID.splits.points, 100);
  assert.equal(TRICK_BY_ID.dive.points, 100);
  assert.equal(TRICK_BY_ID.gap.points, 125);
  assert.equal(TRICK_BY_ID.prox.points, 150);
  assert.equal(TRICK_BY_ID.cradle.points, 150);
  assert.equal(TRICK_BY_ID.juicyflick.points, 200);
  assert.equal(TRICK_BY_ID.snapback.points, 200);
  assert.equal(TRICK_BY_ID.rubik.points, 325);
  assert.equal(TRICK_BY_ID.cubik.points, 350);
  assert.equal(TRICK_BY_ID.barani.points, 100);
  assert.equal(TRICK_BY_ID.barani.pointsIn, 125);
  assert.ok(TRICK_BY_ID.barani.points > TRICK_BY_ID.flip.points && TRICK_BY_ID.barani.pointsIn > TRICK_BY_ID.flip.pointsIn, 'Barani above Flip');
  assert.equal(trickPoints('flip', false), 50);
  assert.equal(trickPoints('flip', true), 75);
  assert.equal(trickPoints('juicyflick', true), 225);
  assert.equal(mapIsIndoor('garage'), true);
  assert.equal(mapIsIndoor('city'), false);
});

test('docs/sim-tricks.md defines each trick and the confused pairs', () => {
  assert.ok(docs.includes('# QuadMath freestyle trick definitions'));
  assert.ok(docs.includes("Tyrantt's Pro Whooper"));
  assert.ok(docs.includes('prowhooper.com'));
  for (const id of ['powerloop', 'matty', 'halfmatty', 'maverick', 'trippy', 'ham', 'sideloop', 'splits', 'juicyflick', 'snapback', 'cradle', 'rubik', 'cubik', 'barani', 'gap']) {
    assert.ok(docs.includes('`' + id + '`'), 'doc missing ' + id);
  }
  assert.ok(docs.includes('Powerloop vs Matty'));
  assert.ok(docs.includes('Matty vs Half Matty'));
  assert.ok(docs.includes('Split-S vs Half Matty'));
  assert.ok(docs.includes('Maverick Loop vs Powerloop'));
  assert.ok(docs.includes('Trippy Spin vs Yaw Spin'));
  assert.ok(docs.includes('Ham Spin'));
  assert.ok(docs.includes('inverted the whole time') || docs.includes('upside-down the whole time'));
  assert.ok(docs.includes('nearby pole/tree') || docs.includes('nearby pole'));
  assert.ok(docs.includes('Side Loop vs Powerloop'));
  assert.ok(docs.includes('How to record a real trace'));
  assert.ok(docs.includes('Copy last trace'));
  assert.ok(docs.includes('100/75/50'));
});

test('combo multiplier grows and variety cuts repeats', () => {
  assert.equal(comboMul(1), 1);
  assert.equal(comboMul(2), 1.5);
  assert.equal(comboMul(5), 3);
  assert.equal(comboMul(20), 6);
  assert.equal(varietyMul(0), 1);
  assert.equal(varietyMul(1), 0.75);
  assert.equal(varietyMul(2), 0.5);
  assert.equal(varietyMul(3), 0);
  assert.equal(b2bMul(0), 1);
  assert.equal(b2bMul(1), 0.5);
  assert.equal(b2bMul(2), 0.25);
  assert.equal(execMul(true, false), 0.65);
  assert.equal(execMul(false, true), 0.5);
  assert.ok(Math.abs(nextStreak(1, 500) - 1.05) < 1e-9);
  assert.equal(uniqueBonus(1), 1);
  assert.equal(uniqueBonus(3), 1.1);
  const a = scoreTrick('flip', 0, 1, 1);
  const b = scoreTrick('flip', 1, 2, 1);
  assert.ok(b < a * 1.5, 'repeat should not outpace a fresh flip even with mul');
  assert.equal(scoreTrick('flip', 3, 1, 1), 0);
  const c = scoreTrick('matty', 0, 3, 3);
  assert.ok(c > scoreTrick('flip', 0, 3, 3));
  assert.ok(scoreTrick('flip', 0, 1, 1, { indoor: true }) > scoreTrick('flip', 0, 1, 1));
});

test('body-frame quat delta integrates a pure roll as roll, not pitch', () => {
  const q0 = { x: 0, y: 0, z: 0, w: 1 };
  const q1 = { x: 0, y: 0, z: 0, w: 1 };
  const dt = 0.02, ox = 8;
  const hx = ox * dt * 0.5;
  q1.x += hx * q1.w;
  q1.w += -hx * q1.x;
  const n = Math.hypot(q1.x, q1.y, q1.z, q1.w) || 1;
  q1.x /= n; q1.w /= n;
  const d = bodyDelta(q0, q1, { r: 0, p: 0, y: 0 });
  assert.ok(Math.abs(d.r) > 0.14 && Math.abs(d.r) < 0.2, 'roll delta ' + d.r);
  assert.ok(Math.abs(d.p) < 0.02, 'pitch leak ' + d.p);
  assert.ok(Math.abs(d.y) < 0.02, 'yaw leak ' + d.y);
  assert.ok(upZOf(q0) > 0.99);
  assert.ok(Math.abs(unwrapDelta(0, headingOf(q0))) < 0.01);
});

test('hover wobble and cruise carving score nothing', () => {
  const hover = fly([{ t: 2.0, pitch: 0.3, roll: 0.25, yaw: 0.2, thr: 0.42 }], { z0: 2, vx: 0, maxT: 2.2 });
  assert.deepEqual(labels(hover), []);
  const cruise = fly([{ t: 2.2, pitch: -0.4, roll: 0.3, yaw: 0.15, thr: 0.55 }], { z0: 4, vx: 6, maxT: 2.4 });
  assert.deepEqual(labels(cruise), []);
  const hoverStick = flyPilot([{ t: 2.0, pitchS: 0.08, rollS: 0.06, yawS: 0.05, thr: 0.42 }], {
    z0: 2, vx: 0, maxT: 2.2, rates: WHOOP_ACTUAL, seed: 9, noise: 0.03,
  });
  assert.deepEqual(labels(hoverStick), []);
  const cruiseStick = flyPilot([{ t: 2.2, pitchS: -0.12, rollS: 0.08, yawS: 0.04, thr: 0.55 }], {
    z0: 4, vx: 6, maxT: 2.4, rates: WHOOP_ACTUAL, seed: 10, noise: 0.03,
  });
  assert.deepEqual(labels(cruiseStick), []);
});

test('Ryan bug: normal turn, yaw drift, and carve are not a Trippy Spin', () => {
  const turn = fly(
    [{ t: 0.85, roll: 2.4, yaw: 2.0, pitch: -0.25, thr: 0.6 }, { t: 0.55, roll: 0, yaw: 0, thr: 0.46 }],
    { z0: 4, vx: 6.5, maxT: 1.9 },
  );
  assert.equal(turn.hits.includes('trippy'), false, 'normal turn trippy why=' + (turn.why || ''));
  const drift = fly(
    [{ t: 0.7, yaw: 1.4, thr: 0.5 }, { t: 0.55, yaw: 0, thr: 0.46 }],
    { z0: 3.5, vx: 2.2, maxT: 1.7 },
  );
  assert.deepEqual(labels(drift), []);
  const carve = fly(
    [{ t: 1.1, roll: 2.6, yaw: 1.8, pitch: -0.2, thr: 0.64 }, { t: 0.55, roll: 0, yaw: 0, thr: 0.46 }],
    { z0: 4.5, vx: 7.5, maxT: 2.2 },
  );
  assert.equal(carve.hits.includes('trippy'), false, 'carve trippy why=' + (carve.why || ''));
  const punch = fly(
    [{ t: 1.1, yaw: 7.2, roll: 1.2, thr: 0.7 }, { t: 0.55, yaw: 0, roll: 0, thr: 0.46 }],
    { z0: 4, vx: 3.5, maxT: 2.1 },
  );
  assert.equal(punch.hits.includes('trippy'), false, 'open-air yaw punch stole trippy why=' + (punch.why || ''));
});

test('Trippy, flown: yaw about the vertical while the path orbits scores Trippy; a spin in place is a Yaw Spin', () => {
  // Tilt, then yaw about the vertical at 5.8 rad/s from the orbit's speed:
  // the thrust swings round and the path circles.
  const orbit = fly([{ t: 0.125, pitch: 7, thr: 0.55 }, { t: 2.5, worldYaw: 5.8, thr: 0.6 }, { t: 0.6, thr: 0.5 }], { z0: 5, vy: -2.03, maxT: 3.7 });
  assert.deepEqual(labels(orbit), ['trippy'], 'orbit why=' + (orbit.why || ''));
  const f = orbit.feat, v = orbit.view;
  assert.ok(v.yawSpan >= 4 * Math.PI && v.yawRate >= 300 * DEG, 'yaw ' + (v.yawSpan / DEG).toFixed(0) + ' at ' + (v.yawRate / DEG).toFixed(0));
  assert.ok(f.orbitR >= 0.3 && f.orbitR <= 2.5 && f.orbitSpd >= 1 && f.orbitSweep >= Math.PI, 'orbit r ' + f.orbitR.toFixed(2));
  assert.equal(orbit.pole, 0, 'open air: no pole bonus');
  // The same spin in place beside the pole is a Yaw Spin (the old Trippy).
  const inPlace = fly([{ t: 1.15, yaw: 7.2, thr: 0.48 }, { t: 0.5, yaw: 0, thr: 0.42 }], { ...NEAR_POLE, maxT: 2.1 });
  assert.deepEqual(labels(inPlace), ['yawspin'], 'in place why=' + (inPlace.why || ''));
});

function aabbCyl(x, z, r, h) {
  return { min: { x: x - r, y: 0, z: z - r }, max: { x: x + r, y: h, z: z + r } };
}

function quatYaw(yaw) {
  const h = yaw * 0.5;
  return { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) };
}

function flyOrbit(opts) {
  const o = opts || {};
  const R = o.R;
  const cx = o.cx, cz = o.cz;
  const colliders = o.colliders;
  const drift = o.drift || 0;
  const look = o.look || 'in';
  const frac = o.frac == null ? 1 : o.frac;
  const rates = o.rates;
  const yawS = o.yawS;
  const rng = o.seed != null ? mulberry(o.seed) : null;
  const noise = o.noise == null ? 0 : o.noise;
  let omega;
  let speedM;
  if (rates && yawS) {
    omega = rateSetpoint(rates.type, yawS, rates.yaw) * DEG;
    speedM = Math.abs(omega) * R / WS;
  } else {
    speedM = o.speed;
    omega = (speedM * WS) / R;
  }
  const period = TAU / Math.abs(omega);
  // yawRate: a spin of its own (rad/s) instead of the camera lock, for spinT
  // s; inverted: upside down throughout.
  const yawRate = o.yawRate || 0;
  const dt = 1 / 60;
  const settle = o.settle != null ? o.settle : 0.55;
  const d = makeDetector();
  const hits = [];
  let theta = 0;
  const wx0 = cx + R, wz0 = cz;
  // World XZ circle → physics XY (wx=px*WS, wz=-py*WS). Camera-lock yaw
  // points at the object (meanDot≈0); tangent yaw follows velocity (≈1).
  const yawAt = (th) => (look === 'tangent' ? (-Math.PI * 0.5 - th) : (Math.PI - th));
  const qOf = (yaw) => (o.inverted ? quatMul(quatYaw(yaw), INV_ROLL) : quatYaw(yaw));
  const q0 = qOf(yawAt(0));
  const vx0 = 0;
  const vy0 = -speedM;
  resetDetector(d, {
    qx: q0.x, qy: q0.y, qz: q0.z, qw: q0.w,
    ox: 0, oy: 0, oz: 0, wx: wx0, wy: 7, wz: wz0, alt: 2,
    speed: speedM, vx: vx0, vy: vy0, vz: 0, clearance: 2, throttle: 0.5, armed: true,
    colliders,
  });
  d.lockout = 0;
  let t = 0;
  const spinT = yawRate ? o.spinT : period * frac;
  let yawNow = yawAt(0);
  const maxT = o.maxT || (spinT + settle + 0.12);
  while (t < maxT) {
    const spinning = t < spinT + 0.02;
    const om = spinning ? (yawRate || omega) : 0;
    if (spinning) theta += omega * dt;
    if (spinning && yawRate) yawNow += yawRate * dt;
    const rr = R + (drift ? drift * Math.sin(theta * 2) : 0);
    const wx = cx + rr * Math.cos(theta);
    const wz = cz + rr * Math.sin(theta);
    const q = yawRate ? qOf(yawNow) : qOf(yawAt(theta));
    const vx = -Math.sin(theta) * speedM;
    const vy = -Math.cos(theta) * speedM;
    let ox = 0, oy = 0;
    if (rng && noise && spinning) {
      ox = (rng() - 0.5) * noise * 1.2;
      oy = (rng() - 0.5) * noise * 1.2;
    }
    const ev = stepDetector(d, {
      qx: q.x, qy: q.y, qz: q.z, qw: q.w,
      ox, oy, oz: om,
      wx, wy: 7, wz, alt: 2,
      speed: speedM, vx, vy, vz: 0,
      clearance: 2, throttle: 0.5, armed: true, colliders, ws: WS,
    }, dt);
    if (ev && TRICK_BY_ID[ev]) hits.push(ev);
    t += dt;
  }
  return {
    hits, last: d.lastId, why: d.lastWhy, feat: d.lastFeat, view: featView(d.lastFeat),
    period, speed: speedM, omega, pole: d.lastPole,
  };
}

const YARD_FICUS = BACKYARD_PLAY.ficus;
const YARD_PALM = BACKYARD_PLAY.palms[0];
const CITY_TREE = CITY_PLAY.spins.find((s) => s.kind === 'tree');
const CITY_POLE = CITY_PLAY.spins.find((s) => s.kind === 'pole');
const FICUS_COL = [aabbCyl(YARD_FICUS.x, YARD_FICUS.z, YARD_FICUS.r, YARD_FICUS.h)];
const PALM_COL = [aabbCyl(YARD_PALM.x, YARD_PALM.z, YARD_PALM.r, YARD_PALM.h)];
const CITY_TREE_COL = [aabbCyl(CITY_TREE.x, CITY_TREE.z, CITY_TREE.r, CITY_TREE.h)];
const CITY_POLE_COL = [aabbCyl(CITY_POLE.x, CITY_POLE.z, CITY_POLE.r, CITY_POLE.h)];
const GARAGE_LAMP_COL = [aabbCyl(-6.2, 8.2, 0.22, 4.4)];

function assertTrippy(r, name) {
  assert.deepEqual(labels(r), ['trippy'], name + ' why=' + (r.why || '') + ' last=' + r.last);
}

test('Trippy, scripted: >= 360 deg at >= 150 deg/s on a full orbit of 0.3-2.5 m at >= 1 m/s, upright or inverted; a pole at the centre earns the bonus', () => {
  assert.ok(YARD_FICUS.r >= 0.5 && YARD_FICUS.r <= 0.7, 'ficus trunk after 1.25x ' + YARD_FICUS.r);
  assert.ok(BACKYARD_PLAY.planter.rOut >= 3.2 && BACKYARD_PLAY.planter.rOut <= 3.5, 'planter ' + BACKYARD_PLAY.planter.rOut);
  const M = WS;   // metres to scene units
  const spins = [
    { name: 'R0.35-v1.2', R: 0.35 * M, speed: 1.2, yawRate: 6.0, spinT: 2.3, cx: 0, cz: 0, colliders: [] },
    { name: 'R0.8-v2', R: 0.8 * M, speed: 2, yawRate: 5.6, spinT: 3.0, cx: 0, cz: 0, colliders: [] },
    { name: 'R1.5-v3.5', R: 1.5 * M, speed: 3.5, yawRate: 7, spinT: 3.2, cx: 0, cz: 0, colliders: [] },
    { name: 'R2.4-v5', R: 2.4 * M, speed: 5, yawRate: 9, spinT: 3.6, cx: 0, cz: 0, colliders: [] },
    { name: 'R0.8-ccw', R: 0.8 * M, speed: 2, yawRate: -6, spinT: 3.0, cx: 0, cz: 0, colliders: [] },
    { name: 'R0.8-inverted', R: 0.8 * M, speed: 2, yawRate: 6, spinT: 3.0, cx: 0, cz: 0, colliders: [], inverted: true },
    { name: 'ficus-R2', R: 2 * M, speed: 4, yawRate: 6.5, spinT: 3.7, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL, pole: 1 },
    { name: 'city-pole-R1', R: 1 * M, speed: 2.5, yawRate: 6.5, spinT: 3.0, cx: CITY_POLE.x, cz: CITY_POLE.z, colliders: CITY_POLE_COL, pole: 1 },
    { name: 'garage-lamp-R0.8', R: 0.8 * M, speed: 2, yawRate: 6, spinT: 3.0, cx: -6.2, cz: 8.2, colliders: GARAGE_LAMP_COL, pole: 1 },
    { name: 'beside-ficus', R: 0.8 * M, speed: 2, yawRate: 6, spinT: 3.0, cx: YARD_FICUS.x + 3 * M, cz: YARD_FICUS.z, colliders: FICUS_COL, pole: 0 },
    // 360 degrees at 160 deg/s is enough.
    { name: 'slow-160dps', R: 0.8 * M, speed: 2, yawRate: 2.8, spinT: 3.0, cx: 0, cz: 0, colliders: [] },
    // So is a camera-lock orbit (one turn of yaw per orbit) when it is tight
    // and fast: 1 m at 6 m/s turns 344 deg/s.
    { name: 'camera-lock city-pole-R1-v6', R: 3.5, speed: 6, cx: CITY_POLE.x, cz: CITY_POLE.z, colliders: CITY_POLE_COL, pole: 1 },
  ];
  for (const spec of spins) {
    const r = flyOrbit(spec);
    assertTrippy(r, spec.name);
    assert.ok(r.feat.orbitSweep >= 2 * Math.PI, spec.name + ' a full orbit ' + r.feat.orbitSweep);
    if (spec.pole != null) assert.equal(r.pole, spec.pole, spec.name + ' pole bonus');
  }
  // The bonus: TRIPPY_POLE_MUL of the points.
  assert.equal(scoreTrick('trippy', 0, 1, 1, { bonus: TRIPPY_POLE_MUL }), Math.round(500 * TRIPPY_POLE_MUL));
  assert.equal(scoreTrick('trippy', 0, 1, 1, {}), 500);
});

test('Trippy is not: camera-lock orbits wider than 2.5 m or slower than 150 deg/s, slow or short spins, half or three-quarter orbits, wide orbits, a spin flown straight', () => {
  const M = WS;
  const lock = [
    { name: 'ficus-R2.9-v8', R: 10, speed: 8, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'city-pole-R1-v2', R: 3.5, speed: 2, cx: CITY_POLE.x, cz: CITY_POLE.z, colliders: CITY_POLE_COL },
    { name: 'actual-ficus-R5', R: 5, yawS: 0.62, rates: WHOOP_ACTUAL, seed: 401, noise: 0.08, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'kiss-ficus-R6', R: 6, yawS: 0.55, rates: WHOOP_KISS, seed: 407, noise: 0.06, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
  ];
  for (const spec of lock) {
    const r = flyOrbit(spec);
    assert.equal(r.hits.includes('trippy'), false, spec.name + ' why=' + (r.why || ''));
  }
  const not = [
    { name: 'slow yaw 140 deg/s', R: 0.8 * M, speed: 2, yawRate: 2.44, spinT: 3.0, cx: 0, cz: 0, colliders: [] },
    // A full orbit (6.7 rad) but 337 degrees of yaw.
    { name: 'short 337 deg', R: 0.35 * M, speed: 2.2, yawRate: 5.5, spinT: 1.05, cx: 0, cz: 0, colliders: [] },
    // 360 degrees and more of yaw, fast, round a centre, but the path only
    // half or three-quarters of the way round it: a Trippy needs the full orbit.
    { name: 'half orbit 200 deg', R: 0.8 * M, speed: 1.2, yawRate: 6.5, spinT: 2.3, cx: 0, cz: 0, colliders: [], sweep: [Math.PI, 2 * Math.PI] },
    { name: 'three-quarter orbit 290 deg', R: 0.8 * M, speed: 1.75, yawRate: 6.5, spinT: 2.3, cx: 0, cz: 0, colliders: [], sweep: [Math.PI, 2 * Math.PI] },
    { name: 'pole half orbit', R: 0.8 * M, speed: 1.2, yawRate: 6.5, spinT: 2.3, cx: CITY_POLE.x, cz: CITY_POLE.z, colliders: CITY_POLE_COL, sweep: [Math.PI, 2 * Math.PI] },
    { name: 'wide orbit 3 m', R: 3 * M, speed: 4, yawRate: 7, spinT: 2.4, cx: 0, cz: 0, colliders: [] },
    { name: 'slow orbit 0.8 m/s', R: 0.5 * M, speed: 0.8, yawRate: 6.5, spinT: 2.4, cx: 0, cz: 0, colliders: [] },
    { name: 'flown straight', R: 1000 * M, speed: 3, yawRate: 7, spinT: 2.4, cx: 0, cz: 0, colliders: [] },
  ];
  for (const spec of not) {
    const r = flyOrbit(spec);
    assert.equal(r.hits.includes('trippy'), false, spec.name + ' why=' + (r.why || ''));
    if (spec.sweep) {
      const sw = r.feat.orbitSweep;
      assert.ok(sw >= spec.sweep[0] && sw < spec.sweep[1], spec.name + ' sweep ' + sw);
    }
  }
});

test('false triggers: turns, small yaw, tangent circles, half orbits, open air', () => {
  const turn = fly(
    [{ t: 0.85, roll: 2.4, yaw: 2.0, pitch: -0.25, thr: 0.6 }, { t: 0.55, roll: 0, yaw: 0, thr: 0.46 }],
    { z0: 4, vx: 6.5, maxT: 1.9, colliders: FICUS_COL },
  );
  assert.equal(turn.hits.includes('trippy'), false, 'turn why=' + (turn.why || ''));
  const smallYaw = fly(
    [{ t: 0.7, yaw: 1.4, thr: 0.5 }, { t: 0.55, yaw: 0, thr: 0.46 }],
    { z0: 3.5, vx: 2.2, maxT: 1.7, colliders: FICUS_COL },
  );
  assert.equal(smallYaw.hits.includes('trippy'), false, 'small yaw why=' + (smallYaw.why || ''));
  const punch = fly(
    [{ t: 1.1, yaw: 7.2, roll: 1.2, thr: 0.7 }, { t: 0.55, yaw: 0, roll: 0, thr: 0.46 }],
    { z0: 4, vx: 3.5, maxT: 2.1 },
  );
  assert.equal(punch.hits.includes('trippy'), false, 'open-air punch why=' + (punch.why || ''));
  const nearPunch = fly(
    [{ t: 1.1, yaw: 7.2, roll: 1.2, thr: 0.7 }, { t: 0.55, yaw: 0, roll: 0, thr: 0.46 }],
    { z0: 4, vx: 3.5, maxT: 2.1, colliders: FICUS_COL, x0: (YARD_FICUS.x - 6) / WS },
  );
  assert.equal(nearPunch.hits.includes('trippy'), false, 'forward punch near tree why=' + (nearPunch.why || ''));
  const tangent = flyOrbit({
    name: 'tangent-ficus', R: 6, speed: 5, cx: YARD_FICUS.x, cz: YARD_FICUS.z,
    colliders: FICUS_COL, look: 'tangent',
  });
  assert.equal(tangent.hits.includes('trippy'), false, 'tangent circle why=' + (tangent.why || ''));
  const half = flyOrbit({
    name: 'half-ficus', R: 6, speed: 5, cx: YARD_FICUS.x, cz: YARD_FICUS.z,
    colliders: FICUS_COL, frac: 0.55,
  });
  assert.equal(half.hits.includes('trippy'), false, 'half orbit why=' + (half.why || ''));
  const openCircle = flyOrbit({
    name: 'open-air-circle', R: 6, speed: 5, cx: 0, cz: 0, colliders: [],
  });
  assert.equal(openCircle.hits.includes('trippy'), false, 'open-air circle why=' + (openCircle.why || ''));
  const huge = flyOrbit({
    name: 'huge-yard', R: 18, speed: 6, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL,
  });
  assert.equal(huge.hits.includes('trippy'), false, 'huge circle why=' + (huge.why || ''));
});

const INV_ROLL = { x: 1, y: 0, z: 0, w: 0 };

function quatMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function axisAngle(ax, ay, az, ang) {
  const h = ang * 0.5;
  const s = Math.sin(h);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(h) };
}

function feedSpin(opts) {
  const o = opts || {};
  let q = o.inverted ? { x: INV_ROLL.x, y: INV_ROLL.y, z: INV_ROLL.z, w: INV_ROLL.w } : { x: 0, y: 0, z: 0, w: 1 };
  const dt = 1 / 60;
  const yawRate = o.yawRate != null ? o.yawRate : 7.2;
  const rollRate = o.rollRate || 0;
  const pitchRate = o.pitchRate || 0;
  const spinT = o.spinT != null ? o.spinT : 1.15;
  const settleT = o.settleT != null ? o.settleT : 0.55;
  const drift = o.drift || 0;
  const d = makeDetector();
  const hits = [];
  const sample0 = {
    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    ox: 0, oy: 0, oz: 0, wx: 0, wy: 7, wz: 0, alt: 2, speed: 0.25,
    vx: 0.2, vy: 0, vz: 0, clearance: 2, throttle: 0.45, armed: true,
  };
  resetDetector(d, sample0);
  d.lockout = 0;
  let t = 0;
  let wx = 0;
  const maxT = spinT + settleT;
  while (t < maxT) {
    const spinning = t < spinT;
    const ox = spinning ? rollRate : 0;
    const oy = spinning ? pitchRate : 0;
    const oz = spinning ? yawRate : 0;
    if (ox || oy || oz) {
      q = quatMul(q, axisAngle(1, 0, 0, ox * dt));
      q = quatMul(q, axisAngle(0, 1, 0, oy * dt));
      q = quatMul(q, axisAngle(0, 0, 1, oz * dt));
      const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
      q.x /= n; q.y /= n; q.z /= n; q.w /= n;
    }
    if (drift) wx += drift * dt;
    const ev = stepDetector(d, {
      qx: q.x, qy: q.y, qz: q.z, qw: q.w,
      ox, oy, oz, wx, wy: 7, wz: 0, alt: 2,
      speed: Math.max(0.25, Math.abs(drift)),
      vx: drift || 0.2, vy: 0, vz: 0,
      clearance: 2, throttle: 0.45, armed: true,
    }, dt);
    if (ev && TRICK_BY_ID[ev]) hits.push(ev);
    t += dt;
  }
  return { hits, last: d.lastId, why: d.lastWhy, feat: d.lastFeat, view: featView(d.lastFeat) };
}

function hamFeat(extra) {
  const e = extra || {};
  const f = makeFeat();
  f.dur = e.dur != null ? e.dur : 1.2;
  f.n = e.n != null ? e.n : 48;
  f.yaw = e.yaw != null ? e.yaw : TAU;
  f.pathY = e.pathY != null ? e.pathY : Math.abs(f.yaw);
  f.pitch = e.pitch || 0;
  f.roll = e.roll || 0;
  f.pathP = e.pathP != null ? e.pathP : Math.abs(f.pitch);
  f.pathR = e.pathR != null ? e.pathR : Math.abs(f.roll);
  f.peakY = e.peakY != null ? e.peakY : 6.2;
  f.tYaw360 = e.tYaw360 != null ? e.tYaw360 : 1.15;
  f.upMin = e.upMin != null ? e.upMin : -1;
  f.upMax = e.upMax != null ? e.upMax : -0.85;
  f.invT = (e.inv != null ? e.inv : 0.96) * f.dur;
  f.travelH = e.travelH != null ? e.travelH : 2.2;
  f.radMax = e.radMax != null ? e.radMax : 1.8;
  f.objNearN = e.objNearN || 0;
  return f;
}

test('Ham Spin fires on a sustained inverted 360° yaw', () => {
  const cls = classifyFeat(hamFeat());
  assert.equal(cls.id, 'ham', 'feat why=' + (cls.why || ''));
  const inv = feedSpin({ inverted: true, yawRate: 7.2, spinT: 1.15, settleT: 0.55 });
  assert.deepEqual(labels(inv), ['ham'], 'feed why=' + (inv.why || '') + ' upMax=' + (inv.feat && inv.feat.upMax));
  const ccw = feedSpin({ inverted: true, yawRate: -7.4, spinT: 1.15, settleT: 0.55 });
  assert.deepEqual(labels(ccw), ['ham'], 'ccw why=' + (ccw.why || ''));
  const fast = feedSpin({ inverted: true, yawRate: 8.4, spinT: 0.95, settleT: 0.55 });
  assert.deepEqual(labels(fast), ['ham'], 'fast why=' + (fast.why || ''));
});

test('Ham Spin does not fire on flips, rolls, or normal yaw', () => {
  const upright = feedSpin({ inverted: false, yawRate: 7.5, spinT: 1.0, settleT: 0.5 });
  assert.equal(upright.hits.includes('ham'), false, 'upright yaw ham why=' + (upright.why || ''));
  assert.ok(upright.hits.includes('yawspin') || upright.last === 'yawspin', 'upright yaw should stay Yaw Spin ' + upright.last);
  const flip = fly(
    [{ t: 0.85, pitch: 8.5, thr: 0.45 }, { t: 0.5, pitch: 0, thr: 0.4 }],
    { z0: 5, vx: 0.4, maxT: 1.8 },
  );
  assert.equal(flip.hits.includes('ham'), false, 'flip ham why=' + (flip.why || ''));
  const roll = fly(
    [{ t: 0.85, roll: 8.5, thr: 0.5 }, { t: 0.5, roll: 0, thr: 0.45 }],
    { z0: 4, vx: 3, maxT: 1.8 },
  );
  assert.equal(roll.hits.includes('ham'), false, 'roll ham why=' + (roll.why || ''));
  const drift = feedSpin({ inverted: true, yawRate: 1.4, spinT: 0.7, settleT: 0.55 });
  assert.equal(drift.hits.includes('ham'), false, 'slow inv yaw ham why=' + (drift.why || ''));
  const pass = classifyFeat(hamFeat({ yaw: 0.4, pathY: 0.4, tYaw360: 99, pitch: 6.3, pathP: 6.3, upMax: 0.95, upMin: -1, inv: 0.35 }));
  assert.notEqual(pass.id, 'ham', 'flip-through-inverted feat scored ' + pass.id);
  const rollPass = classifyFeat(hamFeat({ yaw: 0.3, pathY: 0.3, tYaw360: 99, roll: 6.4, pathR: 6.4, upMax: 0.95, upMin: -1, inv: 0.4 }));
  assert.notEqual(rollPass.id, 'ham', 'roll-through-inverted feat scored ' + rollPass.id);
  const levelYaw = classifyFeat(hamFeat({ upMin: 0.8, upMax: 0.99, inv: 0 }));
  assert.notEqual(levelYaw.id, 'ham', 'upright 360 feat scored ' + levelYaw.id);
});

test('turtled inverted deck does not score a trick', () => {
  const deck = fly([{ t: 1.2, thr: 0.0 }], {
    z0: 0.02, vx: 0, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 },
    maxT: 1.3, clearance: 0.01, allowFloor: true,
  });
  assert.deepEqual(labels(deck), []);
});

test('labeled QuadPhysics library: one label per maneuver, zero doubles', () => {
  const rows = [];
  const confuse = [];
  for (const c of LIBRARY) {
    const r = fly(c.phases, c.opts);
    const got = labels(r);
    rows.push({ name: c.name, want: c.id, got: got.join(',') || 'none' });
    if (got.length !== 1 || got[0] !== c.id) {
      confuse.push(c.name + ' want=' + c.id + ' got=[' + got.join(',') + '] why=' + (r.why || ''));
    }
  }
  assert.equal(confuse.length, 0, 'confusion:\n' + confuse.join('\n') + '\n' + rows.map((x) => x.name + '→' + x.got).join('\n'));
});

test('Ryan lock: Juicy Flick, Roll, Flip, Snapback, Matty stay one-label', () => {
  const lockIds = new Set(['juicyflick', 'roll', 'flip', 'snapback', 'matty', 'sideloop', 'maverick']);
  const confuse = [];
  for (const c of LIBRARY) {
    if (!lockIds.has(c.id)) continue;
    const r = fly(c.phases, c.opts);
    const got = labels(r);
    if (got.length !== 1 || got[0] !== c.id) {
      confuse.push(c.name + ' want=' + c.id + ' got=[' + got.join(',') + '] why=' + (r.why || ''));
    }
  }
  assert.equal(confuse.length, 0, 'locked tricks regressed:\n' + confuse.join('\n'));
});

test('pilot traces (Actual/KISS, imperfect stick): one label, no Powerloop/Matty steal', () => {
  const confuse = [];
  for (const c of PILOT_LIBRARY) {
    const r = flyPilot(c.phases, c.opts);
    const got = labels(r);
    if (got.length !== 1 || got[0] !== c.id) {
      confuse.push(c.name + ' want=' + c.id + ' got=[' + got.join(',') + '] why=' + (r.why || ''));
    }
    if (c.id !== 'powerloop' && c.id !== 'matty' && (got.includes('powerloop') || got.includes('matty'))) {
      confuse.push(c.name + ' stole powerloop/matty got=[' + got.join(',') + ']');
    }
  }
  assert.equal(confuse.length, 0, 'pilot confusion:\n' + confuse.join('\n'));
});

test('Actual half-stick is above RATE_START so Maverick can open a window', () => {
  const dps = rateSetpoint(WHOOP_ACTUAL.type, 0.5, WHOOP_ACTUAL.pitch);
  const rad = dps * DEG;
  assert.ok(rad > RATE_START, 'stick 0.5 Actual ' + rad.toFixed(3) + ' rad/s vs RATE_START ' + RATE_START);
  assert.ok(RATE_START < 1.2, 'RATE_START should catch whoop Actual half-stick');
});

// ---- The library on the bf core ----
//
// sim-core (Betaflight 4.5.1, the owner's Air65 on the owner's diff), sampled
// as the page samples it: the core's onSample every 4 ms of sim time, the
// latest tick read with tickState (sim-core-adapter.js), the detector stepped
// at 4 ms. Armed on a floor 60 m down, then put at the maneuver's start pose
// and speed (a pose event), in acro. The library's body rates become sticks
// through the diff's own rates (Actual: 20 deg/s centre, 740 max on roll and
// pitch, 700 on yaw; Betaflight's yaw stick right is nose right, the module
// frame's negative yaw); its throttle is scaled by BF_THR for the Air65, and a
// phase's tS is a throttle stick as it is.
const BF_THR = 0.7;
const BF_RATES = pilotRatesDefault();
let bfWasm = null;
function bfStick(radps, axis) {
  const want = Math.abs(radps) / DEG;
  if (want < 1) return 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (rateSetpoint(BF_RATES.type, m, BF_RATES[axis]) < want) lo = m; else hi = m;
  }
  return Math.sign(radps) * hi;
}
async function flyBf(phases, opts) {
  const o = opts || {};
  if (!bfWasm) bfWasm = WebAssembly.compile(readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')));
  const core = await createBfCore({
    SimCore,
    wasm: await bfWasm,
    airframe: JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8')),
    diff: readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8'),
    world: { floorZ: -60, boxes: [], triggers: [] },
  });
  core.respawn({ x: 0, y: 0, z: -59.98 }, { x: 0, y: 0, z: 0, w: 1 });
  core.setMode('acro');
  let wall = 0;
  let stick = { r: 0, p: 0, y: 0, t: 0 };
  const poll = (onSample) => {
    const ts = core.stamp(wall);
    if (ts !== null) core.input(stick, ts);
    core.advance(4, true, null, onSample);
    wall += 4;
    core.anchor(wall);
  };
  for (let i = 0; i < 100; i++) poll();
  core.setArm(true);
  for (let i = 0; i < 150 && !core.getState().armed; i++) poll();
  assert.ok(core.getState().armed, 'the bf core armed');
  core.teleport({ x: o.x0 || 0, y: o.y0 || 0, z: o.z0 == null ? 8 : o.z0 }, o.quat || { x: 0, y: 0, z: 0, w: 1 }, { x: o.vx || 0, y: o.vy || 0, z: o.vz || 0 });
  const d = makeDetector();
  const hits = [];
  const st = emptyState();
  const sample = { ws: WS, colliders: o.colliders || null };
  let first = true;
  let samples = 0;
  const onSample = () => {
    const s = core.tickState(st);
    const p = s.position, v = s.velocity, q = s.quaternion, w = s.omega;
    sample.qx = q.x; sample.qy = q.y; sample.qz = q.z; sample.qw = q.w;
    sample.ox = w.x; sample.oy = w.y; sample.oz = w.z;
    sample.wx = p.x * WS; sample.wy = p.z * WS; sample.wz = -p.y * WS;   // as qpSample
    sample.alt = p.z;
    sample.vx = v.x; sample.vy = v.y; sample.vz = v.z; sample.speed = Math.hypot(v.x, v.y, v.z);
    sample.clearance = s.clearance; sample.armed = s.armed; sample.throttle = stick.t;
    sample.sr = stick.r; sample.sp = stick.p; sample.sy = stick.y;
    samples++;
    if (first) { resetDetector(d, sample); d.lockout = 0; first = false; return; }
    const ev = stepDetector(d, sample, 0.004);
    if (ev && TRICK_BY_ID[ev]) hits.push(ev);
  };
  let t = 0, phaseI = 0, phaseT = 0;
  const maxT = o.maxT || 3.2;
  while (t < maxT) {
    const ph = phases[Math.min(phaseI, phases.length - 1)];
    stick = {
      r: bfStick(ph.roll || 0, 'roll'),
      p: bfStick(ph.pitch || 0, 'pitch'),
      y: bfStick(-(ph.yaw || 0), 'yaw'),
      t: ph.tS != null ? ph.tS : Math.min(1, (ph.thr == null ? 0.55 : ph.thr) * BF_THR),
    };
    poll(onSample);
    t += 0.004; phaseT += 0.004;
    if (ph.t != null && phaseT >= ph.t - 1e-9 && phaseI < phases.length - 1) { phaseI++; phaseT = 0; }
  }
  return { hits, why: d.lastWhy, dir: d.lastDir, samples, feat: d.lastFeat };
}

// One flight per trick type: the library's own where it flies the same on the
// bf core, and two of the bf core's own. On the Air65 the library's powerloops
// do not climb 1.5 m at its throttle (full throttle does), and its matty
// flips turn a full flip (Betaflight tracks the rate the js core lags).
const BF_LIBRARY = [
  ...['flip-front', 'flip-back', 'roll-fast', 'yaw-fast', 'hm-fast', 'ss-fast', 'mav-std', 'pole-spin', 'ham-inv',
    'sl-std', 'crd-std', 'jf-fast', 'sb-fast', 'rk-std', 'ck-std', 'dive-std', 'gap-generic-slot', 'prox-std'].map((n) => LIBRARY.find((c) => c.name === n)),
  { id: 'powerloop', name: 'bf-powerloop', phases: [{ t: 0.25, pitch: 0, tS: 0.75 }, { t: 1.0, pitch: -6.4, tS: 1.0 }, { t: 0.6, pitch: 0, tS: 0.35 }], opts: { z0: 6, vx: 7, maxT: 2.6 } },
  { id: 'matty', name: 'bf-matty', phases: [{ t: 0.1, pitch: 0, tS: 0.25 }, { t: 0.55, pitch: 8.2, tS: 0.03 }, { t: 0.55, pitch: 0, tS: 0.45 }], opts: { z0: 9, vx: 7, maxT: 2.1 } },
];

test('bf core: every trick type, flown on sim-core and sampled every 4 ms, is its one label', async () => {
  const confuse = [];
  const flown = new Set();
  for (const c of BF_LIBRARY) {
    assert.ok(c, 'a BF_LIBRARY name is missing from LIBRARY');
    const r = await flyBf(c.phases, c.opts);
    assert.ok(r.samples > c.opts.maxT * 240, c.name + ': sampled every 4 ms (' + r.samples + ')');
    if (r.hits.length !== 1 || r.hits[0] !== c.id) {
      confuse.push(c.name + ' want=' + c.id + ' got=[' + r.hits.join(',') + '] why=' + (r.why || '').replace(/\n/g, ' '));
      continue;
    }
    if (c.name === 'flip-front') assert.equal(r.dir, 1, 'a front flip says front');
    if (c.name === 'flip-back') assert.equal(r.dir, -1, 'a back flip says back');
    flown.add(c.id);
  }
  assert.equal(confuse.length, 0, 'bf core confusion:\n' + confuse.join('\n'));
  // Trippy and Barani fly on the bf core in the Rig, in the tests below.
  for (const id of new Set(LIBRARY.map((c) => c.id))) {
    if (id !== 'trippy' && id !== 'barani') assert.ok(flown.has(id), id + ' flown on the bf core');
  }
});

// The page's loop on the bf core at a given frame time: sticks polled and
// stamped every 4 ms of wall time (as pollInput), the core advanced once a
// frame with the detector sampled on the sim clock (onSample). Returns the
// labels and every segment's features.
async function flyBfFrames(frameMs, script, seconds) {
  if (!bfWasm) bfWasm = WebAssembly.compile(readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')));
  const core = await createBfCore({
    SimCore,
    wasm: await bfWasm,
    airframe: JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8')),
    diff: readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8'),
    world: { floorZ: -60, boxes: [], triggers: [] },
  });
  core.respawn({ x: 0, y: 0, z: -59.98 }, { x: 0, y: 0, z: 0, w: 1 });
  core.setMode('acro');
  let wall = 0;
  const pollEvery = (ms, stick) => {
    for (let k = 0; k < ms / 4; k++) {
      const ts = core.stamp(wall);
      if (ts !== null) core.input(stick, ts);
      core.advance(4, true, null);
      wall += 4;
      core.anchor(wall);
    }
  };
  pollEvery(400, { r: 0, p: 0, y: 0, t: 0 });
  core.setArm(true);
  pollEvery(600, { r: 0, p: 0, y: 0, t: 0 });
  assert.ok(core.getState().armed, 'armed');
  core.teleport({ x: 0, y: 0, z: 6 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 0, z: 0 });
  const d = makeDetector();
  const hits = [];
  const segs = [];
  const st = emptyState();
  const sample = { ws: WS, colliders: null };
  let first = true;
  const onSample = () => {
    const s = core.tickState(st);
    const p = s.position, v = s.velocity, q = s.quaternion, w = s.omega;
    Object.assign(sample, {
      qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: w.x, oy: w.y, oz: w.z,
      wx: -p.y * WS, wy: p.z * WS, wz: -p.x * WS, alt: p.z, vx: v.x, vy: v.y, vz: v.z,
      speed: Math.hypot(v.x, v.y, v.z), clearance: s.clearance, armed: s.armed, throttle: 0.4,
    });
    if (first) { resetDetector(d, sample); d.lockout = 0; first = false; return; }
    const ev = stepDetector(d, sample, 0.004);
    if (ev && TRICK_BY_ID[ev]) {
      hits.push(ev + (ev === 'flip' ? (d.lastDir < 0 ? ':back' : ':front') : ''));
      segs.push(JSON.stringify(d.lastFeat));
    }
  };
  // Polls every 4 ms of wall time; a frame every frameMs.
  const t0 = wall;
  let nextFrame = wall + frameMs;
  let polled = wall;
  while (wall - t0 < seconds * 1000) {
    const stick = script((wall - t0) / 1000);
    const ts = core.stamp(wall);
    if (ts !== null) core.input(stick, ts);
    wall += 4;
    if (wall >= nextFrame) {
      core.advance(wall - polled, true, null, onSample);
      core.anchor(wall);
      polled = wall;
      nextFrame += frameMs;
    }
  }
  return { hits, segs };
}

test('bf core: a flight reads the same at 60 fps and at 12 fps (the detector runs on the sim clock)', async () => {
  // A front flip, a roll and a back flip at full stick, the throttle at about hover.
  const script = (t) => {
    const s = { r: 0, p: 0, y: 0, t: 0.42 };
    if (t >= 0.5 && t < 1.1) s.p = 1;
    if (t >= 2.3 && t < 2.9) s.r = 1;
    if (t >= 4.1 && t < 4.7) s.p = -1;
    if (t >= 1.1 && t < 1.5) s.t = 0.6;
    if (t >= 4.7 && t < 5.1) s.t = 0.6;
    return s;
  };
  const fast = await flyBfFrames(16, script, 6);
  const slow = await flyBfFrames(80, script, 6);
  assert.deepEqual(fast.hits, ['flip:front', 'roll', 'flip:back']);
  assert.deepEqual(slow.hits, fast.hits);
  assert.deepEqual(slow.segs, fast.segs, 'the same features at either frame rate');
});

// ---- The bf core in the Rig ----
//
// sim-core flying in the Rig's own colliders (the page's bfWorld), the
// detector given the same colliders and the Rig's authored gaps, the Air65's
// frame width; armed on the floor, then put at the start pose and speed.
let rigCache = null;
function rigScene() {
  if (rigCache) return rigCache;
  if (!globalThis.document) {
    globalThis.document = {
      createElement: () => {
        const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
        return { width: 0, height: 0, getContext: () => ctx };
      },
    };
  }
  const built = buildMap(THREE, 'rig');
  const boxes = built.colliders.filter((b) => !b.isEmpty()).map((b) => boxToModule(b));
  rigCache = { colliders: built.colliders, gaps: built.gaps, boxes };
  return rigCache;
}
const AIR65_FRAME_W = 0.065 / Math.SQRT2 + 2 * 0.0181;   // wheelbase / sqrt 2 + both ducts, m
async function flyRig(script, o) {
  const rig = rigScene();
  if (!bfWasm) bfWasm = WebAssembly.compile(readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')));
  const core = await createBfCore({
    SimCore,
    wasm: await bfWasm,
    airframe: JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8')),
    diff: readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8'),
    world: { floorZ: 0, boxes: rig.boxes, triggers: [] },
  });
  core.respawn({ x: -6, y: 6, z: 0.02 }, { x: 0, y: 0, z: 0, w: 1 });
  core.setMode(o.mode);
  let wall = 0;
  let stick = { r: 0, p: 0, y: 0, t: 0 };
  const events = [];
  const poll = (onSample) => {
    const ts = core.stamp(wall);
    if (ts !== null) core.input(stick, ts);
    core.advance(4, true, (e) => events.push(e), onSample);
    wall += 4;
    core.anchor(wall);
  };
  for (let i = 0; i < 100; i++) poll();
  core.setArm(true);
  for (let i = 0; i < 150 && !core.getState().armed; i++) poll();
  assert.ok(core.getState().armed, 'armed');
  core.teleport(o.pos, o.q || { x: 0, y: 0, z: 0, w: 1 }, o.vel || { x: 0, y: 0, z: 0 });
  const fromUs = core.simTimeUs;
  const d = makeDetector();
  const st = emptyState();
  const live = emptyState();
  const sample = { ws: WS, colliders: rig.colliders, gaps: rig.gaps, frameW: AIR65_FRAME_W };
  const hits = [];
  const whys = [];
  let first = true;
  const onSample = () => {
    const s = core.tickState(st);
    const p = s.position, v = s.velocity, q = s.quaternion, w = s.omega;
    Object.assign(sample, {
      qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: w.x, oy: w.y, oz: w.z,
      wx: -p.y * WS, wy: p.z * WS, wz: -p.x * WS, alt: p.z,   // toScene, as the page
      vx: v.x, vy: v.y, vz: v.z, speed: Math.hypot(v.x, v.y, v.z),
      clearance: s.clearance, armed: s.armed, throttle: stick.t,
    });
    if (first) { resetDetector(d, sample); d.lockout = 0; first = false; return; }
    const ev = stepDetector(d, sample, 0.004);
    if (ev && TRICK_BY_ID[ev]) { hits.push(ev); whys.push(d.lastWhy.replace(/\n/g, ' ')); }
  };
  let t = 0;
  while (t < o.maxT) {
    stick = script(t, core.tickState(live));
    poll(onSample);
    t += 0.004;
  }
  const hitsAfter = events.filter((e) => e.kind === 'contact' && e.tUs > fromUs);
  return { hits, whys, contacts: hitsAfter.length, pole: d.lastPole, feat: d.lastFeat };
}

const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));
const headingOfQ = (q) => Math.atan2(2 * (q.x * q.y + q.w * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
// A pilot in angle mode holding a circle of r0 m round c (module frame) at
// vt m/s, yawing at yawRate rad/s about the body, altitude z0: the tilt it
// wants, turned into sticks in its own heading (Betaflight's angle limit,
// 60 degrees, at full stick; yaw right is nose right), that heading led by
// lead s of the spin (angle mode's lag; without it the circle spirals out).
function orbitPilot(c, r0, vt, yawRate, z0, dirSign, hover, lead = 0) {
  const TILT = 60 * DEG, G = 9.81;
  const yS = bfStick(-yawRate, 'yaw');
  return (t, s) => {
    const p = s.position, v = s.velocity;
    const dx = p.x - c.x, dy = p.y - c.y, dist = Math.hypot(dx, dy) || 1e-6;
    const rx = dx / dist, ry = dy / dist;
    const tx = -ry * dirSign, ty = rx * dirSign;
    const e = dist - r0;
    const vdx = vt * tx - 2 * e * rx, vdy = vt * ty - 2 * e * ry;
    const ax = 2.5 * (vdx - v.x) - (vt * vt / r0) * rx;
    const ay = 2.5 * (vdy - v.y) - (vt * vt / r0) * ry;
    const psi = headingOfQ(s.quaternion) + s.omega.z * lead;
    const af = ax * Math.cos(psi) + ay * Math.sin(psi);
    const al = -ax * Math.sin(psi) + ay * Math.cos(psi);
    const tilt = Math.min(TILT, Math.hypot(Math.atan2(af, G), Math.atan2(al, G)));
    return {
      r: clampTo(Math.atan2(-al, G) / TILT, -1, 1),
      p: clampTo(Math.atan2(af, G) / TILT, -1, 1),
      y: t > 0.3 ? yS : 0,
      t: clampTo(hover / Math.cos(tilt) + 0.12 * (z0 - p.z) - 0.08 * v.z, 0, 1),
    };
  };
}

test('bf core in the Rig: a full orbit of the spin pole is a Trippy with the pole bonus, three-quarters is not; a Barani is a Barani', async () => {
  // The spin pole: scene metres (3.0, -1.5), RIG_PLAY.pole; module (1.5, -3.0).
  const pole = { x: -RIG_PLAY.pole.z, y: -RIG_PLAY.pole.x };
  const r0 = 0.6, vt = 2.0;
  const orbitFor = (spinEnd) => {
    const pilot = orbitPilot(pole, r0, vt, 7.5, 2.0, -1, 0.38, 0.08);
    return flyRig((t, s) => (t < spinEnd ? pilot(t, s) : { r: 0, p: 0, y: 0, t: 0.38 }), {
      mode: 'angle', pos: { x: pole.x - r0, y: pole.y, z: 2.0 }, vel: { x: 0, y: vt, z: 0 }, maxT: spinEnd + 0.6,
    });
  };
  // Spinning from 0.3 s to 4.0 s: the path goes all the way round (about 425 deg).
  const trip = await orbitFor(4.0);
  assert.equal(trip.contacts, 0, 'clear of the pole');
  assert.deepEqual(trip.hits, ['trippy'], 'why ' + trip.whys.join(' | '));
  assert.equal(trip.pole, 1, 'the pole at the centre');
  const f = trip.feat, v = featView(f);
  assert.ok(v.yawSpan >= 4 * Math.PI && v.yawRate >= 300 * DEG);
  assert.ok(f.orbitR >= 0.3 && f.orbitR <= 2.5 && f.orbitSpd >= 1);
  assert.ok(f.orbitSweep >= 2 * Math.PI, 'a full orbit ' + f.orbitSweep);
  // The same spin stopped at 2.7 s: over 720 deg of yaw, but the path only
  // three-quarters of the way round (about 280 deg).
  const part = await orbitFor(2.7);
  assert.equal(part.contacts, 0);
  assert.equal(part.hits.includes('trippy'), false, 'why ' + part.whys.join(' | '));
  assert.ok(featView(part.feat).yawSpan >= 4 * Math.PI, 'the yaw is there');
  assert.ok(part.feat.orbitSweep > Math.PI && part.feat.orbitSweep < 2 * Math.PI, 'short of a full orbit ' + part.feat.orbitSweep);
  // Barani in acro: pitch till the nose is down, a half twist there, pitch
  // on till upright, then hold 3.5 m. From 4 m up at scene (0, 3), the room's
  // open middle ahead (the flip carries it forward, toward scene -z).
  let phase = 0, rollInt = 0, pitchInt = 0, lastT = 0;
  const bar = await flyRig((t, s) => {
    const q = s.quaternion, w = s.omega, dt = t - lastT;
    lastT = t;
    const noseZ = 2 * (q.x * q.z - q.w * q.y), upZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    if (t < 0.3) return { r: 0, p: 0, y: 0, t: 0.45 };
    pitchInt += w.y * dt;
    if (phase === 0) { if (noseZ < -0.97) phase = 1; return { r: 0, p: 1, y: 0, t: 0.55 }; }
    if (phase === 1) { rollInt += w.x * dt; if (rollInt > 2.9) phase = 2; return { r: 1, p: 0, y: 0, t: 0.55 }; }
    if (phase === 2) { if (pitchInt > 5.6 && upZ > 0.9) phase = 3; return { r: 0, p: phase === 2 ? 1 : 0, y: 0, t: 0.55 }; }
    return { r: 0, p: 0, y: 0, t: clampTo(0.4 + 0.1 * (3.5 - s.position.z) - 0.08 * s.velocity.z, 0, 1) };
  }, { mode: 'acro', pos: { x: -3.0, y: 0, z: 4.0 }, maxT: 2.8 });
  assert.equal(bar.contacts, 0);
  assert.deepEqual(bar.hits, ['barani'], 'why ' + bar.whys.join(' | '));
  assert.ok(bar.feat.upEnd > 0.9, 'ends upright');
});

test('bf core in the Rig: authored gaps fire through the crate slots; the loft overhang and an open edge do not', async () => {
  // Level in angle mode, holding the height, sticks centred: the start speed carries it.
  const hold = (z0) => (t, s) => ({ r: 0, p: 0, y: 0, t: clampTo(0.37 + 0.12 * (z0 - s.position.z) - 0.08 * s.velocity.z, 0, 1) });
  const facePlusZ = { x: 0, y: 0, z: 1, w: 0 };                      // nose along scene +z
  const facePlusX = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 }; // nose along scene +x
  // Along x = 9 m through the three crate walls (slots 25, 21, 18 cm).
  const crates = await flyRig(hold(1.0), { mode: 'angle', pos: { x: 2.0, y: -9.0, z: 1.0 }, vel: { x: -3.2, y: 0, z: 0 }, q: facePlusZ, maxT: 2.0 });
  assert.equal(crates.contacts, 0, 'through clean');
  assert.deepEqual(crates.hits, ['gap', 'gap', 'gap'], crates.whys.join(' | '));
  assert.deepEqual(crates.whys.map((w) => w.replace(/^.*125  /, '')), ['crate slot 1 (25 cm)', 'crate slot 2 (21 cm)', 'crate slot 3 (18 cm)']);
  // Under the loft's slab (2.7 m) at 1.5 m and out past its edge at x -7:
  // the old rule (anything overhead within 4 m) scored this as a Gap.
  const loft = await flyRig(hold(1.5), { mode: 'angle', pos: { x: 1.0, y: 9.6, z: 1.5 }, vel: { x: 0, y: -4.5, z: 0 }, q: facePlusX, maxT: 2.0 });
  assert.equal(loft.contacts, 0);
  assert.deepEqual(loft.hits, [], loft.whys.join(' | '));
  // Past the crate walls' open end, 0.2 m off their -x face: one side only.
  const edge = await flyRig(hold(1.0), { mode: 'angle', pos: { x: 2.0, y: -7.5, z: 1.0 }, vel: { x: -3.2, y: 0, z: 0 }, q: facePlusZ, maxT: 2.0 });
  assert.equal(edge.contacts, 0);
  assert.deepEqual(edge.hits, [], edge.whys.join(' | '));
});

test('the Rig, House and Warehouse gap volumes are openings: clear of every collider, walled on a side', () => {
  if (!globalThis.document) rigScene();
  for (const id of ['rig', 'house', 'warehouse']) {
    const built = buildMap(THREE, id);
    assert.deepEqual(built.gaps, mapGaps(id));
    assert.ok(built.gaps.length > 0, id + ' has gaps');
    for (const g of built.gaps) {
      assert.ok(['x', 'y', 'z'].includes(g.axis), g.name);
      let walled = 0;
      for (const c of built.colliders) {
        const ox = Math.min(g.max.x, c.max.x) - Math.max(g.min.x, c.min.x);
        const oy = Math.min(g.max.y, c.max.y) - Math.max(g.min.y, c.min.y);
        const oz = Math.min(g.max.z, c.max.z) - Math.max(g.min.z, c.min.z);
        assert.ok(!(ox > 1e-3 && oy > 1e-3 && oz > 1e-3), id + ': ' + g.name + ' overlaps a collider');
        // A collider touching one of the volume's sides (across its axis).
        if (ox >= -0.02 && oy >= -0.02 && oz >= -0.02 && Math.min(ox, oy, oz) <= 0.02) walled++;
      }
      assert.ok(walled > 0, id + ': ' + g.name + ' has a wall');
    }
  }
  assert.ok(mapGaps('rig').some((g) => g.name === 'loft hole') && mapGaps('rig').some((g) => g.name === 'tunnel'));
  assert.ok(mapGaps('house').some((g) => g.name === 'bookshelf gap'));
  assert.ok(mapGaps('warehouse').filter((g) => g.name.startsWith('rack ')).length === 48);
  assert.deepEqual(mapGaps('city'), []);
});

test('Ryan bug: a power loop is only Power Loop, never also Matty', () => {
  const r = fly(
    [{ t: 0.25, pitch: 0, thr: 0.8 }, { t: 1.05, pitch: -6.4, thr: 0.88 }, { t: 0.55, pitch: 0, thr: 0.5 }],
    { z0: 6, vx: 7, maxT: 2.4 },
  );
  assert.deepEqual(labels(r), ['powerloop']);
  assert.equal(r.hits.includes('matty'), false);
  assert.equal(r.hits.includes('flip'), false);
  const cls = classifyFeat(r.feat);
  assert.equal(cls.id, 'powerloop');
});

// Scripted vertical loops in the plane of the entry heading (+x): level for
// lead s, n nose-up loops of radius r m at v m/s climbing `climb` m over them
// (a spiral), then level for tail s. The nose follows the velocity. Each
// sample goes to tick(sample, dt), every 4 ms as the page samples.
function feedLoops(o, tick) {
  const v = o.v, r = o.r, n = o.n, climb = o.climb || 0, z0 = o.z0 == null ? 5 : o.z0;
  const w = v / r, T = n * TAU / w;
  const lead = 0.3, tail = 0.8, dt = 0.004;
  for (let i = 0, t = 0; t < lead + T + tail; i++, t = i * dt) {
    let x, z, vx, vz, th, om;
    if (t < lead) { x = v * (t - lead); z = z0; vx = v; vz = 0; th = 0; om = 0; }
    else if (t < lead + T) {
      const u = t - lead;
      th = w * u; om = -w;
      x = r * Math.sin(th); z = z0 + r - r * Math.cos(th) + climb * u / T;
      vx = v * Math.cos(th); vz = v * Math.sin(th) + climb / T;
    } else { x = v * (t - lead - T); z = z0 + climb; vx = v; vz = 0; th = n * TAU; om = 0; }
    const h = -th / 2;
    tick({
      qx: 0, qy: Math.sin(h), qz: 0, qw: Math.cos(h), ox: 0, oy: om, oz: 0,
      wx: x * WS, wy: z * WS, wz: 0, alt: z, speed: Math.hypot(vx, vz), vx, vy: 0, vz,
      clearance: 2, throttle: 0.6, armed: true, ws: WS,
    }, dt);
  }
}

function loopRun(o) {
  const d = makeDetector();
  resetDetector(d, null);
  d.lockout = 0;
  const hits = [];
  feedLoops(o, (s, dt) => {
    const ev = stepDetector(d, s, dt);
    if (ev && TRICK_BY_ID[ev]) hits.push(ev);
  });
  return { hits, loops: d.lastLoops, feat: d.lastFeat, view: featView(d.lastFeat), why: d.lastWhy };
}

test('Powerloop: >= 300 deg of pitch in its own 3.5 s window (a slow loop is not a Flip\'s 1.2 s), ending up to 1.5 m above its entry', () => {
  // 5 m/s round 1.8 m: 159 deg/s, 191 deg in Flip's window.
  const slow = loopRun({ v: 5, r: 1.8, n: 1, climb: 1.0 });
  assert.deepEqual(slow.hits, ['powerloop'], slow.why);
  assert.ok(slow.view.flipSpan < 5.236, 'flip window ' + slow.view.flipSpan);
  assert.ok(slow.view.loopSpan >= 5.236, 'loop window ' + slow.view.loopSpan);
  assert.ok(slow.view.loopRet < -0.9 && slow.view.loopRet > -1.1, 'ends 1 m above the entry: ' + slow.view.loopRet);
  assert.equal(slow.loops, 1);
  // 2 m above the entry is not a Powerloop.
  const high = loopRun({ v: 5, r: 1.8, n: 1, climb: 2.0 });
  assert.equal(high.hits.includes('powerloop'), false, high.why);
});

test('Double Powerloop: two loops in one segment (past the 4.5 s cap) are one Powerloop of 2 loops, named so, scoring twice', () => {
  const two = loopRun({ v: 5, r: 1.8, n: 2, climb: 0.5 });
  assert.deepEqual(two.hits, ['powerloop'], two.why);
  assert.equal(two.loops, 2);
  assert.ok(two.feat.dur > MANEUVER_MAX_S, 'one segment of ' + two.feat.dur + ' s');
  assert.equal(trickName('powerloop', -1, two.loops), 'Double Powerloop');
  assert.match(two.why, /^Double Powerloop/);
  const three = loopRun({ v: 7, r: 1.8, n: 3 });
  assert.deepEqual(three.hits, ['powerloop'], three.why);
  assert.equal(three.loops, 3);
  assert.equal(trickName('powerloop', -1, three.loops), 'Triple Powerloop');
  // Scored: the Powerloop's points once a loop.
  const single = scoreTrick('powerloop', 0, 1, 1, { streak: 1 });
  for (const [n, loops] of [[1, 1], [2, 2]]) {
    const clock = { t: 5 };
    const tricks = createTricks({ document: null, storage: memStore(), muted: () => true, now: () => clock.t });
    tricks.setActive(true, 'city');
    feedLoops({ v: 5, r: 1.8, n, climb: 0.5 }, (s, dt) => { clock.t += dt; tricks.step(s, dt); });
    assert.equal(tricks.lastId(), 'powerloop');
    assert.equal(tricks.lastLoops(), loops);
    assert.equal(tricks.comboPoints(), single * loops, n + ' loop(s)');
  }
});

test('sustained: a Trippy or a Yaw Spin past 4.5 s is one trick while it keeps turning, cut at 10 s', () => {
  const M = WS;
  const long = flyOrbit({ R: 0.8 * M, speed: 2, yawRate: 6, spinT: 7, cx: 0, cz: 0, colliders: [] });
  assert.deepEqual(labels(long), ['trippy'], long.why);
  assert.ok(long.feat.dur > 6.5 && long.feat.dur < MANEUVER_SUSTAIN_S, 'one segment of ' + long.feat.dur + ' s');
  // 14 s of spin: the first 10 s, then the rest.
  const longer = flyOrbit({ R: 0.8 * M, speed: 2, yawRate: 6, spinT: 14, cx: 0, cz: 0, colliders: [] });
  assert.deepEqual(labels(longer), ['trippy', 'trippy'], longer.why);
  // A yaw spin in place for 6 s.
  const spin = fly([{ t: 6, yaw: 5, thr: 0.5 }, { t: 0.8, yaw: 0, thr: 0.5 }], { z0: 6, maxT: 7.2 });
  assert.deepEqual(labels(spin), ['yawspin'], spin.why);
  assert.ok(spin.feat.dur > MANEUVER_MAX_S, 'one segment of ' + spin.feat.dur + ' s');
});

test('scanClearance finds overhead decks and side walls without allocating', () => {
  const out = { up: 0, dn: 0, px: 0, nx: 0, pz: 0, nz: 0, near: 0 };
  const a = scanClearance(0, 2, 0, [
    { min: { x: -2, y: 3, z: -2 }, max: { x: 2, y: 4, z: 2 } },
    { min: { x: 1.5, y: 0, z: -2 }, max: { x: 4, y: 5, z: 2 } },
  ], out);
  assert.equal(a, out);
  assert.ok(out.up > 0.8 && out.up < 1.3, 'up ' + out.up);
  assert.ok(out.px < 2, 'px ' + out.px);
});

test('combo chains, banks on crash/land, and persists bests per map', () => {
  const clock = { t: 10 };
  const store = memStore();
  const tricks = createTricks({
    document: null,
    storage: store,
    muted: () => true,
    now: () => clock.t,
  });
  tricks.setActive(true, 'city');
  const r = fly([{ t: 0.85, roll: 8.5, thr: 0.5 }, { t: 0.4, roll: 0, thr: 0.45 }], { z0: 4, vx: 3, maxT: 1.6 });
  const d = tricks.detector();
  resetDetector(d, null);
  d.lockout = 0;
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro'); qp.setPhysicsHz(500);
  qp.reset({ x: 0, y: 0, z: 4 }); qp.arm(); qp.velocity.x = 3;
  const dt = 1 / 60;
  for (let i = 0; i < 80; i++) {
    clock.t += dt;
    const pitch = 0, roll = i < 52 ? 8.5 : 0;
    qp.step(dt, { roll, pitch, yaw: 0 }, 0.5, { r: 0, p: 0, y: 0 });
    if (qp.position.z < 0.4) qp.position.z = 0.4;
    tricks.tick(qpSample(qp, { thr: 0.5, clearance: 2 }), dt);
  }
  assert.ok(tricks.comboN() >= 1, 'combo ' + tricks.comboN() + ' libHits=' + r.hits.join(','));
  const comboPts = tricks.comboPoints();
  assert.ok(comboPts >= TRICK_BY_ID.roll.points);
  const banked = tricks.noteCrash();
  assert.equal(banked, comboPts);
  assert.equal(tricks.comboN(), 0);
  assert.equal(tricks.session(), comboPts);
  const saved = loadStore(store);
  assert.equal(saved.maps.city.bestCombo, comboPts);
  assert.equal(saved.maps.city.bestSession, comboPts);
  assert.equal(bestLine(saved, 'city').includes('·'), true);
  assert.equal(bestLine(saved, 'living'), '—');
  assert.equal(store.keys().join(','), TRICKS_KEY);
});

test('createTricks swallows tick errors and ignores races', () => {
  const tricks = createTricks({ document: null, storage: memStore(), muted: () => true, now: () => 1 });
  tricks.setActive(false, 'city');
  const ev = tricks.tick(qpSample(new QuadPhysics(PRESETS.whoop65), {}), 0.016);
  assert.equal(ev, null);
  assert.equal(tricks.comboN(), 0);
  tricks.setActive(true, 'city');
  const boom = tricks.tick(null, 0.016);
  assert.equal(boom, null);
  tricks.setHudOn(false);
  assert.equal(tricks.hudOn(), false);
  tricks.setHudOn(true);
  assert.equal(tricks.hudOn(), true);
  tricks.setDebugOn(true);
  assert.equal(tricks.debugOn(), true);
  tricks.setDebugOn(false);
  assert.equal(tricks.debugOn(), false);
});

test('combo window expiry banks rather than wiping', () => {
  const clock = { t: 1 };
  const tricks = createTricks({
    document: null, storage: memStore(), muted: () => true, now: () => clock.t,
  });
  tricks.setActive(true, 'garage');
  resetDetector(tricks.detector(), null);
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro'); qp.setPhysicsHz(500);
  qp.reset({ x: 0, y: 0, z: 4 }); qp.arm(); qp.velocity.x = 3;
  const dt = 1 / 60;
  for (let i = 0; i < 110; i++) {
    clock.t += dt;
    const roll = i < 70 ? 8.5 : 0;
    qp.step(dt, { roll, pitch: 0, yaw: 0 }, 0.5, { r: 0, p: 0, y: 0 });
    if (qp.position.z < 0.4) qp.position.z = 0.4;
    tricks.tick(qpSample(qp, { thr: 0.5, clearance: 2 }), dt);
  }
  assert.ok(tricks.comboN() >= 1, 'combo ' + tricks.comboN());
  const pts = tricks.comboPoints();
  clock.t += COMBO_WINDOW_S + 0.05;
  tricks.tick(qpSample(qp, { thr: 0.4, clearance: 2 }), dt);
  assert.equal(tricks.comboN(), 0);
  assert.equal(tricks.session(), pts);
});

test('normalizeStore rejects junk and keeps hud default on', () => {
  const s = normalizeStore({ v: 9, hud: false, maps: { city: { bestCombo: '12.2', bestSession: -4 } } });
  assert.equal(s.hud, false);
  assert.equal(s.debug, false);
  assert.equal(s.maps.city.bestCombo, 12);
  assert.equal(s.maps.city.bestSession, 0);
  assert.equal(emptyStore().hud, true);
  const store = memStore();
  saveStore(s, store);
  const loaded = loadStore(store);
  assert.equal(loaded.hud, false);
  recordBest(loaded, 'city', 500, 900);
  assert.equal(bestForMap(loaded, 'city').bestSession, 900);
  assert.equal(formatScore(2400), '2.4k');
  assert.equal(formatScoreFull(2400), '2,400');
});

test('debug recorder dumps gyro/attitude/stick/throttle JSON for the last maneuver', () => {
  const r = flyPilot(
    [{ t: 1.2, yawS: 0.95, thr: 0.5 }, { t: 0.4, yawS: 0, thr: 0.45 }],
    { ...NEAR_POLE, maxT: 2.2, rates: WHOOP_ACTUAL, seed: 9, noise: 0.04 },
  );
  const d = makeDetector();
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro'); qp.setPhysicsHz(500);
  qp.reset({ x: 0, y: 0, z: 5.5 }); qp.arm(); qp.velocity.x = 3.2;
  resetDetector(d, qpSample(qp, { thr: 0.5 }));
  d.lockout = 0;
  const dt = 1 / 60;
  let t = 0;
  while (t < 2.0) {
    const yawS = t < 1.2 ? 0.95 : 0;
    const rollS = 0;
    const thr = t < 1.2 ? 0.8 : 0.5;
    qp.step(dt, {
      roll: rateSetpoint(WHOOP_ACTUAL.type, rollS, WHOOP_ACTUAL.roll) * DEG,
      pitch: 0,
      yaw: rateSetpoint(WHOOP_ACTUAL.type, yawS, WHOOP_ACTUAL.yaw) * DEG,
    }, thr, { r: 0, p: 0, y: 0 });
    if (qp.position.z < 0.4) qp.position.z = 0.4;
    stepDetector(d, qpSample(qp, { thr, sr: rollS, sp: 0, sy: yawS }), dt);
    t += dt;
  }
  assert.ok(d.recN > 20, 'recorded samples ' + d.recN);
  assert.ok(d.recJson && d.recJson.charAt(0) === '{');
  const j = JSON.parse(d.recJson);
  assert.equal(j.kind, 'quadmath-trick-trace');
  assert.deepEqual(j.keys, [...REC_KEYS]);
  assert.equal(j.n, j.samples.length);
  assert.equal(j.samples[0].length, REC_KEYS.length);
  assert.ok(Math.abs(j.samples[8][8]) > 0.2 || Math.abs(j.samples[8][10]) > 0.2, 'stick in sample');
  const tricks = createTricks({ document: null, storage: memStore(), muted: () => true, now: () => 1 });
  assert.equal(typeof tricks.copyTrace, 'function');
  assert.equal(typeof tricks.lastTrace, 'function');
  assert.ok(src.includes('trickDbgCopy'));
  assert.ok(src.includes('Copy last trace'));
  assert.ok(r.hits.includes('trippy') || d.lastId === 'trippy' || d.lastId === 'yawspin' || d.lastId, 'got a label ' + d.lastId);
});

test('sim.html wires tricks without touching physics or old keys', () => {
  assert.match(simSrc, /from "\.\/sim-tricks\.js\?v=[0-9a-f]{12}"/);
  assert.ok(simSrc.includes('sim-tricks.js'));
  assert.ok(simSrc.includes('createTricks'));
  assert.ok(simSrc.includes('TRICKS_KEY'));
  assert.ok(simSrc.includes('id="cbTricksHud"') || simSrc.includes('cbTricksHud'));
  assert.ok(simSrc.includes('id="cbTrickDebug"') || simSrc.includes('trickdebug'));
  // The detector steps on the sim clock (the core's onSample every 4 ms of
  // sim time, inside stepCore); the HUD draws once a frame.
  assert.ok(simSrc.includes('const trickEv=tricks.step(trickSample,dt);'));
  assert.ok(simSrc.includes('core.advance(frameMs,!calib,onCoreEvent,trickSampling()?onTrickSample:null)'));
  assert.ok(simSrc.includes('const s=core.tickState(trickCs);'));
  // The map's authored gaps and the quad's width go with each sample.
  assert.ok(simSrc.includes('trickSample.gaps=trickGaps;') && simSrc.includes('trickSample.frameW=trickFrameW();'));
  assert.ok(simSrc.includes('trickGaps=built.gaps||[];'));
  assert.ok(simSrc.includes('if(tricks&&!(coach&&coach.isActive()))tricks.frame();'));
  assert.equal(simSrc.includes('tricks.tick('), false, 'no per-frame detector step');
  assert.ok(simSrc.includes('try{') && simSrc.includes('tricks.step'));
  assert.ok(simSrc.includes('noteCrash'));
  assert.ok(simSrc.includes('setDebugOn') || simSrc.includes('trickdebug'));
  assert.ok(simSrc.includes('trickSample.sr=stick.r'));
  assert.ok(simSrc.includes('Copy last trace') || simSrc.includes('Records last maneuver'));
  const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');
  assert.equal(src.includes('FLIPPED — R TO RESPAWN'), false);
  assert.ok(feelSrc.includes('FLIPPED — R TO RESPAWN'), 'stuck-flip toast stays in feel');
  assert.ok(feelSrc.includes('shouldToastFlip'));
  assert.ok(!src.includes('qp.step') && !src.includes('maxThrust'));
  for (const k of ['ryflyRates', 'ryflyDroneType', 'quadmath_bestLap_', 'ghostStorageKey(']) {
    assert.ok(simSrc.includes(k), 'must keep reading old key ' + k);
  }
});
