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
  TRICKS_KEY, TRICK_LIST, TRICK_BY_ID, STORE_VER, COMBO_WINDOW_S,
  formatScore, formatScoreFull, comboMul, varietyMul, uniqueBonus, scoreTrick,
  upZOf, headingOf, bodyDelta, scanClearance, unwrapDelta, classifyFeat, featView,
  emptyStore, normalizeStore, loadStore, saveStore, recordBest, bestLine, bestForMap,
  makeDetector, resetDetector, stepDetector,
  makeCombo, resetCombo, pushCombo, comboRemain,
  createTricks,
} from '../sim-tricks.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { mapThrottle3d } from '../sim-3d.js';

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

const GAP_COLS = [
  { min: { x: 8, y: 0, z: -10 }, max: { x: 22, y: 12, z: -0.85 } },
  { min: { x: 8, y: 0, z: 0.85 }, max: { x: 22, y: 12, z: 10 } },
  { min: { x: 8, y: 4.4, z: -10 }, max: { x: 22, y: 10, z: 10 } },
];
const WALL_COLS = [
  { min: { x: -4, y: 0, z: 1.05 }, max: { x: 40, y: 14, z: 10 } },
];

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
  { id: 'powerloop', name: 'pl-fast', phases: [{ t: 0.25, pitch: 0, thr: 0.8 }, { t: 1.05, pitch: -6.4, thr: 0.88 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 6, vx: 7, maxT: 2.4 } },
  { id: 'powerloop', name: 'pl-slow', phases: [{ t: 0.3, pitch: 0, thr: 0.75 }, { t: 1.35, pitch: -5.0, thr: 0.82 }, { t: 0.6, pitch: 0, thr: 0.48 }], opts: { z0: 7, vx: 5.5, maxT: 2.8 } },
  { id: 'powerloop', name: 'pl-high', phases: [{ t: 0.28, pitch: 0, thr: 0.9 }, { t: 1.15, pitch: -6.0, thr: 0.9 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 8, vx: 6.5, maxT: 2.5 } },
  { id: 'matty', name: 'matty-fast', phases: [{ t: 0.12, pitch: 0, thr: 0.55 }, { t: 0.95, pitch: -8.4, thr: 0.05 }, { t: 0.55, pitch: 0, thr: 0.5 }], opts: { z0: 9, vx: 12, maxT: 2.2 } },
  { id: 'matty', name: 'matty-high', phases: [{ t: 0.12, pitch: 0, thr: 0.5 }, { t: 1.05, pitch: -7.6, thr: 0.06 }, { t: 0.5, pitch: 0, thr: 0.5 }], opts: { z0: 11, vx: 11, maxT: 2.3 } },
  { id: 'matty', name: 'matty-sloppy', phases: [{ t: 0.12, pitch: 0, thr: 0.55 }, { t: 0.95, pitch: -8.2, yaw: 0.8, thr: 0.06 }, { t: 0.55, pitch: 0, yaw: 0, thr: 0.5 }], opts: { z0: 9.5, vx: 11.5, maxT: 2.2 } },
  { id: 'halfmatty', name: 'hm-fast', phases: [{ t: 0.15, pitch: 0, thr: 0.65 }, { t: 0.42, pitch: -7.5, thr: 0.2 }, { t: 0.7, pitch: 0, thr: 0.5 }], opts: { z0: 8, vx: 8, maxT: 2.0 } },
  { id: 'halfmatty', name: 'hm-slow', phases: [{ t: 0.15, pitch: 0, thr: 0.6 }, { t: 0.55, pitch: -5.8, thr: 0.18 }, { t: 0.7, pitch: 0, thr: 0.5 }], opts: { z0: 8.5, vx: 7.2, maxT: 2.1 } },
  { id: 'halfmatty', name: 'hm-high', phases: [{ t: 0.12, pitch: 0, thr: 0.62 }, { t: 0.44, pitch: -7.2, thr: 0.16 }, { t: 0.65, pitch: 0, thr: 0.5 }], opts: { z0: 10, vx: 8.5, maxT: 2.0 } },
  { id: 'splits', name: 'ss-fast', phases: [{ t: 0.28, roll: 11, pitch: 0, thr: 0.55 }, { t: 0.55, roll: 0, pitch: -7.5, thr: 0.35 }, { t: 0.5, roll: 0, pitch: 0, thr: 0.5 }], opts: { z0: 10, vx: 8, maxT: 2.0 } },
  { id: 'splits', name: 'ss-slow', phases: [{ t: 0.30, roll: 11, pitch: 0, thr: 0.5 }, { t: 0.60, roll: 0, pitch: -7.2, thr: 0.32 }, { t: 0.5, roll: 0, pitch: 0, thr: 0.5 }], opts: { z0: 10.4, vx: 7.6, maxT: 2.15 } },
  { id: 'splits', name: 'ss-sloppy', phases: [{ t: 0.28, roll: 11, pitch: 0.2, thr: 0.55 }, { t: 0.55, roll: 0, pitch: -7.4, thr: 0.34 }, { t: 0.5, pitch: 0, thr: 0.5 }], opts: { z0: 10.2, vx: 8.2, maxT: 2.1 } },
  { id: 'maverick', name: 'mav-std', phases: [{ t: 0.50, pitch: -3.6, thr: 0.95 }, { t: 0.50, pitch: 3.4, thr: 0.22 }, { t: 0.45, pitch: 0.2, thr: 0.62 }, { t: 0.4, pitch: 0, thr: 0.5 }], opts: { z0: 3.5, vx: 4.5, maxT: 2.5 } },
  { id: 'maverick', name: 'mav-slow', phases: [{ t: 0.62, pitch: -3.0, thr: 0.92 }, { t: 0.58, pitch: 2.9, thr: 0.2 }, { t: 0.45, pitch: 0, thr: 0.58 }], opts: { z0: 3.2, vx: 4.0, maxT: 2.6 } },
  { id: 'maverick', name: 'mav-high', phases: [{ t: 0.52, pitch: -3.4, thr: 0.98 }, { t: 0.52, pitch: 3.2, thr: 0.18 }, { t: 0.45, pitch: 0, thr: 0.6 }], opts: { z0: 4.5, vx: 4.2, maxT: 2.5 } },
  { id: 'trippy', name: 'trip-std', phases: [{ t: 0.25, roll: 8, thr: 0.55 }, { t: 1.2, roll: 7, pitch: 0.4, yaw: 4.5, thr: 0.6 }, { t: 0.5, roll: 0, yaw: 0, thr: 0.5 }], opts: { z0: 6, vx: 4, maxT: 2.4 } },
  { id: 'trippy', name: 'trip-fast', phases: [{ t: 0.2, roll: 9, thr: 0.58 }, { t: 1.05, roll: 8.2, yaw: 5.2, thr: 0.62 }, { t: 0.45, roll: 0, yaw: 0, thr: 0.5 }], opts: { z0: 6.5, vx: 4.5, maxT: 2.2 } },
  { id: 'trippy', name: 'trip-slow', phases: [{ t: 0.3, roll: 6.5, thr: 0.52 }, { t: 1.45, roll: 6.2, yaw: 3.6, pitch: 0.3, thr: 0.55 }, { t: 0.5, roll: 0, yaw: 0, thr: 0.5 }], opts: { z0: 5.5, vx: 3.5, maxT: 2.7 } },
  { id: 'hang', name: 'hang-std', phases: [{ t: 1.2, thr: 0.25 }], opts: { z0: 3, vx: 0, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 }, maxT: 1.4, clearance: 3 } },
  { id: 'hang', name: 'hang-high', phases: [{ t: 1.25, thr: 0.25 }], opts: { z0: 5, vx: 0, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 }, maxT: 1.45, clearance: 5 } },
  { id: 'hang', name: 'hang-slow', phases: [{ t: 1.35, thr: 0.26 }], opts: { z0: 3.5, vx: 0.2, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 }, maxT: 1.5, clearance: 3.2 } },
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
  for (const id of ['flip', 'roll', 'yawspin', 'powerloop', 'splits', 'matty', 'halfmatty', 'maverick', 'trippy', 'hang', 'dive', 'gap', 'prox']) {
    assert.ok(ids.includes(id), 'missing ' + id);
    assert.ok(TRICK_BY_ID[id].points > 0);
    assert.ok(TRICK_BY_ID[id].name);
  }
  assert.equal(TRICK_BY_ID.flip.points, 200);
  assert.equal(TRICK_BY_ID.roll.points, 200);
  assert.equal(TRICK_BY_ID.yawspin.points, 250);
  assert.equal(TRICK_BY_ID.powerloop.points, 450);
  assert.equal(TRICK_BY_ID.splits.points, 400);
  assert.equal(TRICK_BY_ID.matty.points, 600);
  assert.equal(TRICK_BY_ID.halfmatty.points, 350);
  assert.equal(TRICK_BY_ID.maverick.points, 650);
  assert.equal(TRICK_BY_ID.trippy.points, 400);
  assert.equal(TRICK_BY_ID.hang.points, 300);
  assert.equal(TRICK_BY_ID.dive.points, 350);
  assert.equal(TRICK_BY_ID.gap.points, 500);
  assert.equal(TRICK_BY_ID.prox.points, 280);
});

test('docs/sim-tricks.md defines each trick and the confused pairs', () => {
  assert.ok(docs.includes('# QuadMath freestyle trick definitions'));
  for (const id of ['powerloop', 'matty', 'halfmatty', 'maverick', 'trippy', 'splits']) {
    assert.ok(docs.includes('`' + id + '`'), 'doc missing ' + id);
  }
  assert.ok(docs.includes('Power Loop vs Matty'));
  assert.ok(docs.includes('Matty vs Half Matty'));
  assert.ok(docs.includes('Split-S vs Half Matty'));
  assert.ok(docs.includes('Maverick vs Power Loop'));
  assert.ok(docs.includes('Trippy Spin vs Yaw Spin'));
});

test('combo multiplier grows and variety cuts repeats', () => {
  assert.equal(comboMul(1), 1);
  assert.equal(comboMul(2), 1.5);
  assert.equal(comboMul(5), 3);
  assert.equal(comboMul(20), 6);
  assert.equal(varietyMul(0), 1);
  assert.equal(varietyMul(1), 0.55);
  assert.ok(varietyMul(3) < varietyMul(1));
  assert.equal(uniqueBonus(1), 1);
  assert.equal(uniqueBonus(3), 1.1);
  const a = scoreTrick('flip', 0, 1, 1);
  const b = scoreTrick('flip', 1, 2, 1);
  assert.ok(b < a * 1.5, 'repeat should not outpace a fresh flip even with mul');
  const c = scoreTrick('matty', 0, 3, 3);
  assert.ok(c > scoreTrick('flip', 0, 3, 3));
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
});

test('turtled inverted deck does not hang', () => {
  const deck = fly([{ t: 1.2, thr: 0.0 }], {
    z0: 0.02, vx: 0, threeD: true, quat: { x: 1, y: 0, z: 0, w: 0 },
    maxT: 1.3, clearance: 0.01, allowFloor: true,
  });
  assert.equal(deck.hits.includes('hang'), false);
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
  assert.ok(comboPts >= 200);
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

test('sim.html wires tricks without touching physics or old keys', () => {
  assert.ok(simSrc.includes('sim-tricks.js'));
  assert.ok(simSrc.includes('createTricks'));
  assert.ok(simSrc.includes('TRICKS_KEY'));
  assert.ok(simSrc.includes('id="cbTricksHud"') || simSrc.includes('cbTricksHud'));
  assert.ok(simSrc.includes('id="cbTrickDebug"') || simSrc.includes('trickdebug'));
  assert.ok(simSrc.includes('tricks.tick') || simSrc.includes('tricks&&tricks.tick'));
  assert.ok(simSrc.includes('try{') && simSrc.includes('tricks.tick'));
  assert.ok(simSrc.includes('noteCrash'));
  assert.ok(simSrc.includes('setDebugOn') || simSrc.includes('trickdebug'));
  const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');
  assert.equal(src.includes('FLIPPED — R TO RESPAWN'), false);
  assert.ok(feelSrc.includes('FLIPPED — R TO RESPAWN'), 'stuck-flip toast stays in feel');
  assert.ok(feelSrc.includes('shouldToastFlip'));
  assert.ok(!src.includes('qp.step') && !src.includes('maxThrust'));
  for (const k of ['ryflyRates', 'ryflyDroneType', 'quadmath_bestLap_', 'quadmath_bestGhost_']) {
    assert.ok(simSrc.includes(k), 'must keep reading old key ' + k);
  }
});
