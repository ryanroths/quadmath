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
  createTricks, makeFeat, trickLineupText,
} from '../sim-tricks.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { mapThrottle3d } from '../sim-3d.js';
import { rateSetpoint } from '../sim-rates.js';
import { BACKYARD_PLAY, CITY_PLAY } from '../sim-maps.js';

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
  resetDetector(d, qpSample(qp, { thr: 0.5, clearance: o.clearance, colliders: o.colliders }));
  d.lockout = 0;
  let t = 0, phaseI = 0, phaseT = 0;
  const maxT = o.maxT || 3.2;
  while (t < maxT) {
    const ph = phases[Math.min(phaseI, phases.length - 1)];
    let thr = ph.thr == null ? 0.55 : ph.thr;
    if (o.threeD) thr = mapThrottle3d(thr);
    qp.step(dt, { roll: ph.roll || 0, pitch: ph.pitch || 0, yaw: ph.yaw || 0 }, thr, { r: 0, p: 0, y: 0 });
    if (!o.allowFloor && qp.position.z < 0.4) {
      qp.position.z = 0.4;
      if (qp.velocity.z < 0) qp.velocity.z *= 0.15;
    }
    const ev = stepDetector(d, qpSample(qp, { thr, clearance: o.clearance, colliders: o.colliders }), dt);
    if (ev && TRICK_BY_ID[ev]) hits.push(ev);
    t += dt; phaseT += dt;
    if (ph.t != null && phaseT >= ph.t && phaseI < phases.length - 1) { phaseI++; phaseT = 0; }
  }
  return { hits, last: d.lastId, why: d.lastWhy, feat: d.lastFeat, view: featView(d.lastFeat) };
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
  { id: 'trippy', name: 'trip-pole', phases: [{ t: 1.15, yaw: 7.2, thr: 0.48 }, { t: 0.5, yaw: 0, thr: 0.42 }], opts: { ...NEAR_POLE, maxT: 2.1 } },
  { id: 'trippy', name: 'trip-pole-fast', phases: [{ t: 0.95, yaw: 8.2, thr: 0.5 }, { t: 0.45, yaw: 0, thr: 0.44 }], opts: { ...NEAR_POLE, z0: 2.2, maxT: 1.9 } },
  { id: 'trippy', name: 'trip-pole-ccw', phases: [{ t: 1.15, yaw: -7.2, thr: 0.48 }, { t: 0.5, yaw: 0, thr: 0.42 }], opts: { ...NEAR_POLE, maxT: 2.1 } },
  { id: 'trippy', name: 'trip-tree', phases: [{ t: 1.15, yaw: 7.4, thr: 0.5 }, { t: 0.5, yaw: 0, thr: 0.44 }], opts: { ...NEAR_TREE, maxT: 2.1 } },
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
  { id: 'gap', name: 'gap-std', phases: [{ t: 1.1, pitch: 0, thr: 0.72 }], opts: { z0: 0.9, vx: 8, maxT: 1.4, colliders: GAP_COLS, clearance: 0.9 } },
  { id: 'gap', name: 'gap-fast', phases: [{ t: 1.0, pitch: 0, thr: 0.85 }], opts: { z0: 0.85, vx: 10, maxT: 1.3, colliders: GAP_COLS, clearance: 0.85 } },
  { id: 'gap', name: 'gap-slow', phases: [{ t: 1.3, pitch: 0, thr: 0.62 }], opts: { z0: 0.95, vx: 6.5, maxT: 1.6, colliders: GAP_COLS, clearance: 0.95 } },
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
  { id: 'trippy', name: 'pilot-trip-pole-actual', phases: [{ t: 1.2, yawS: 0.95, thr: 0.5 }, { t: 0.45, yawS: 0, thr: 0.45 }], opts: { ...NEAR_POLE, maxT: 2.2, rates: WHOOP_ACTUAL, seed: 301, noise: 0.04, thrWobble: 0.05 } },
  { id: 'trippy', name: 'pilot-trip-pole-kiss', phases: [{ t: 1.15, yawS: 0.92, thr: 0.5 }, { t: 0.45, yawS: 0, thr: 0.45 }], opts: { ...NEAR_POLE, maxT: 2.1, rates: WHOOP_KISS, seed: 303, noise: 0.04, thrWobble: 0.05 } },
  { id: 'trippy', name: 'pilot-trip-tree', phases: [{ t: 1.2, yawS: 0.94, thr: 0.5 }, { t: 0.45, yawS: 0, thr: 0.45 }], opts: { ...NEAR_TREE, maxT: 2.2, rates: WHOOP_ACTUAL, seed: 304, noise: 0.04, thrWobble: 0.05 } },
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
  for (const id of ['flip', 'roll', 'yawspin', 'powerloop', 'sideloop', 'splits', 'matty', 'halfmatty', 'maverick', 'trippy', 'ham', 'dive', 'gap', 'prox', 'cradle', 'juicyflick', 'snapback', 'rubik', 'cubik']) {
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
  for (const id of ['powerloop', 'matty', 'halfmatty', 'maverick', 'trippy', 'ham', 'sideloop', 'splits', 'juicyflick', 'snapback', 'cradle', 'rubik', 'cubik']) {
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

test('Ryan bug: a real trippy spin around a pole or tree scores Trippy', () => {
  const pole = fly(
    [{ t: 1.15, yaw: 7.2, thr: 0.48 }, { t: 0.5, yaw: 0, thr: 0.42 }],
    { ...NEAR_POLE, maxT: 2.1 },
  );
  assert.deepEqual(labels(pole), ['trippy'], 'pole why=' + (pole.why || ''));
  const tree = fly(
    [{ t: 1.15, yaw: 7.4, thr: 0.5 }, { t: 0.5, yaw: 0, thr: 0.44 }],
    { ...NEAR_TREE, maxT: 2.1 },
  );
  assert.deepEqual(labels(tree), ['trippy'], 'tree why=' + (tree.why || ''));
  const openYaw = fly(
    [{ t: 1.0, yaw: 7.5, thr: 0.45 }, { t: 0.5, yaw: 0, thr: 0.4 }],
    { z0: 3, vx: 1.2, maxT: 2 },
  );
  assert.deepEqual(labels(openYaw), ['yawspin']);
  assert.equal(openYaw.hits.includes('ham'), false, 'upright yaw is not Ham');
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
  const dt = 1 / 60;
  const settle = o.settle != null ? o.settle : 0.55;
  const d = makeDetector();
  const hits = [];
  let theta = 0;
  const wx0 = cx + R, wz0 = cz;
  // World XZ circle → physics XY (wx=px*WS, wz=-py*WS). Camera-lock yaw
  // points at the object (meanDot≈0); tangent yaw follows velocity (≈1).
  const yawAt = (th) => (look === 'tangent' ? (-Math.PI * 0.5 - th) : (Math.PI - th));
  const q0 = quatYaw(yawAt(0));
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
  const spinT = period * frac;
  const maxT = o.maxT || (spinT + settle + 0.12);
  while (t < maxT) {
    const spinning = t < spinT + 0.02;
    const om = spinning ? omega : 0;
    if (spinning) theta += omega * dt;
    const rr = R + (drift ? drift * Math.sin(theta * 2) : 0);
    const wx = cx + rr * Math.cos(theta);
    const wz = cz + rr * Math.sin(theta);
    const q = quatYaw(yawAt(theta));
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
    period, speed: speedM, omega,
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

test('scripted camera-lock orbits around backyard / city / garage anchors score Trippy', () => {
  assert.ok(YARD_FICUS.r >= 0.5 && YARD_FICUS.r <= 0.7, 'ficus trunk after 1.25× ' + YARD_FICUS.r);
  assert.ok(BACKYARD_PLAY.planter.rOut >= 3.2 && BACKYARD_PLAY.planter.rOut <= 3.5, 'planter ' + BACKYARD_PLAY.planter.rOut);
  const orbits = [
    { name: 'yard-ficus-R4-v5', R: 4, speed: 5, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'yard-ficus-R5-v5', R: 5, speed: 5, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'yard-ficus-R7-v5', R: 7, speed: 5, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'yard-ficus-R8-v6', R: 8, speed: 6, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'yard-ficus-R10-v5', R: 10, speed: 5, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'yard-ficus-R7-v4-drift', R: 7, speed: 4, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL, drift: 0.8 },
    { name: 'yard-palm-R4-v5', R: 4, speed: 5, cx: YARD_PALM.x, cz: YARD_PALM.z, colliders: PALM_COL },
    { name: 'city-tree-R4-v5', R: 4, speed: 5, cx: CITY_TREE.x, cz: CITY_TREE.z, colliders: CITY_TREE_COL },
    { name: 'city-pole-R3.5-v6', R: 3.5, speed: 6, cx: CITY_POLE.x, cz: CITY_POLE.z, colliders: CITY_POLE_COL },
    { name: 'garage-lamp-R3-v5', R: 3, speed: 5, cx: -6.2, cz: 8.2, colliders: GARAGE_LAMP_COL },
    { name: 'old-tight-pole-R2-v6', R: 2, speed: 6, cx: 6.7, cz: 0, colliders: OBJ_POLE },
  ];
  for (const spec of orbits) assertTrippy(flyOrbit(spec), spec.name);
});

test('Ryan Actual-rate camera-lock orbits at several radii score Trippy', () => {
  const actual = [
    { name: 'actual-ficus-R5', R: 5, yawS: 0.62, rates: WHOOP_ACTUAL, seed: 401, noise: 0.08, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'actual-ficus-R7', R: 7, yawS: 0.58, rates: WHOOP_ACTUAL, seed: 402, noise: 0.08, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'actual-ficus-R8-faster', R: 8, yawS: 0.70, rates: WHOOP_ACTUAL, seed: 403, noise: 0.07, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
    { name: 'actual-city-tree-R4', R: 4, yawS: 0.60, rates: WHOOP_ACTUAL, seed: 404, noise: 0.08, cx: CITY_TREE.x, cz: CITY_TREE.z, colliders: CITY_TREE_COL },
    { name: 'actual-city-pole-R3.5', R: 3.5, yawS: 0.68, rates: WHOOP_ACTUAL, seed: 405, noise: 0.08, cx: CITY_POLE.x, cz: CITY_POLE.z, colliders: CITY_POLE_COL },
    { name: 'actual-garage-R3', R: 3, yawS: 0.58, rates: WHOOP_ACTUAL, seed: 406, noise: 0.07, cx: -6.2, cz: 8.2, colliders: GARAGE_LAMP_COL },
    { name: 'kiss-ficus-R6', R: 6, yawS: 0.55, rates: WHOOP_KISS, seed: 407, noise: 0.06, cx: YARD_FICUS.x, cz: YARD_FICUS.z, colliders: FICUS_COL },
  ];
  for (const spec of actual) assertTrippy(flyOrbit(spec), spec.name);
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
    const rollS = t < 1.2 ? 0.5 : 0;
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
  assert.ok(simSrc.includes('tricks.tick') || simSrc.includes('tricks&&tricks.tick'));
  assert.ok(simSrc.includes('try{') && simSrc.includes('tricks.tick'));
  assert.ok(simSrc.includes('noteCrash'));
  assert.ok(simSrc.includes('setDebugOn') || simSrc.includes('trickdebug'));
  assert.ok(simSrc.includes('trickSample.sr=stick.r'));
  assert.ok(simSrc.includes('Copy last trace') || simSrc.includes('Records last maneuver'));
  const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');
  assert.equal(src.includes('FLIPPED — R TO RESPAWN'), false);
  assert.ok(feelSrc.includes('FLIPPED — R TO RESPAWN'), 'stuck-flip toast stays in feel');
  assert.ok(feelSrc.includes('shouldToastFlip'));
  assert.ok(!src.includes('qp.step') && !src.includes('maxThrust'));
  for (const k of ['ryflyRates', 'ryflyDroneType', 'quadmath_bestLap_', 'quadmath_bestGhost_']) {
    assert.ok(simSrc.includes(k), 'must keep reading old key ' + k);
  }
});
