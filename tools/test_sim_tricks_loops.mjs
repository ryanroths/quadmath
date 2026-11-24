// The loop gate (sim-tricks.js LOOP): Barani, Powerloop and Maverick round
// an object, the owner's rulings of 2026-11-24 on the Tricktionary's
// definitions. Kinematic flights: a path (lines and arcs, sim-core m, z up)
// and the body's turn rates integrated step by step (4 ms), round a bar 0.3
// m wide whose underside is 2.5 m up; through the gate alone
// (makeLoopGate) and through the whole detector (stepDetector, the page's
// samples). The same-object rule on the Warehouse's own boxes. The owner's
// re-fly of 2026-11-24: its loop records, replayed (the last tests).
// node --test tools/test_sim_tricks_loops.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import {
  LOOP, makeLoopGate, loopStep, loopReset, sameObject, makeDetector, stepDetector, simBoxes, groupBoxes, CRADLE,
  bodyDeltaParts, TRICK_BY_ID, STORE_VER,
} from '../sim-tricks.js';
import { buildMap } from '../sim-maps.js';
import { WS } from '../sim-core-adapter.js';

const DT = 0.004;
const DEG = Math.PI / 180;
const R = 2.5, CZ = 3.5, RATE = 2.4;
// The bar: across the loop's plane (y), 0.3 m along the travel (x), its
// underside 2.5 m up.
const BAR = [-0.15, -2, 2.5, 0.15, 2, 2.8];

// Quaternions [x, y, z, w]: product, the turn of a body rate vector, a
// vector turned.
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qexp(rx, ry, rz) {
  const a = Math.hypot(rx, ry, rz);
  if (a < 1e-12) return [0, 0, 0, 1];
  const s = Math.sin(a / 2) / a;
  return [rx * s, ry * s, rz * s, Math.cos(a / 2)];
}
function rot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

// Path pieces, u from 0 to 1: a line, and an arc of the loop's circle in the
// x-z plane (angle a: 0 at the bottom moving +x, pi at the top moving -x).
const line = (p0, p1) => (u) => [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u];
const arc = (cx, cz, r, a0, a1) => (u) => { const a = a0 + (a1 - a0) * u; return [cx + r * Math.sin(a), 0, cz - r * Math.cos(a)]; };

// A flight: phases { T (s), pos (path piece), p, r, y (body pitch, roll and
// yaw rates, rad/s; pitch + is forward, nose down) }, every 4 ms: position,
// velocity, the nose and the up axis, the step's body turns.
function fly(phases, opts) {
  const o = opts || {};
  const steps = [];
  let q = [0, 0, 0, 1], t = 0;
  for (const ph of phases) {
    const n = Math.round(ph.T / DT);
    for (let i = 0; i < n; i++) {
      const u = i / n, u1 = (i + 1) / n;
      const p = ph.pos(u), p1 = ph.pos(u1);
      const v = [(p1[0] - p[0]) / DT, (p1[1] - p[1]) / DT, (p1[2] - p[2]) / DT];
      const q0 = q;
      q = qmul(q, qexp((ph.r || 0) * DT, (ph.p || 0) * DT, (ph.y || 0) * DT));
      const nq = Math.hypot(q[0], q[1], q[2], q[3]);
      q = q.map((c) => c / nq);
      steps.push({ t, p, v, q, q0, rates: [ph.r || 0, ph.p || 0, ph.y || 0], contact: o.touchAt != null && Math.abs(t - o.touchAt) < DT / 2 ? 1 : 0 });
      t += DT;
    }
  }
  return steps;
}

const approach = { T: 0.5, pos: line([-3, 0, 1], [0, 0, 1]) };
const out = (T) => ({ T, pos: line([0, 0, 1], [6 * T, 0, 1]) });
const POWERLOOP = [approach, { T: 2 * Math.PI / RATE, pos: arc(0, CZ, R, 0, 2 * Math.PI), p: -RATE }, out(2.6)];
const DOUBLE = [approach, { T: 4 * Math.PI / RATE, pos: arc(0, CZ, R, 0, 4 * Math.PI), p: -RATE }, out(2.6)];
// The Barani: a half loop to the top, 180 of yaw upside down drifting back,
// the Matty (forward pitch) down the far side and back under flying
// backwards. yawDeg: the yaw at the top.
function barani(yawDeg) {
  const yT = 0.5;
  return [
    approach,
    { T: Math.PI / RATE, pos: arc(0, CZ, R, 0, Math.PI), p: -RATE },
    { T: yT, pos: line([0, 0, CZ + R], [-1.2, 0, CZ + R]), y: (yawDeg || 180) * DEG / yT },
    { T: Math.PI / RATE, pos: arc(-1.2, CZ, R, Math.PI, 2 * Math.PI), p: RATE },
    { T: 0.7, pos: line([-1.2, 0, 1], [3, 0, 1]) },
    { T: 1.0, pos: line([3, 0, 1], [7, 0, 1]) },
  ];
}
// The same, the yaw begun with the nose straight up (the camera on the
// sky): 20 deg quickly there, on at 90 deg/s over the top, the rest upside
// down at the top.
function baraniSkyYaw() {
  const a1 = 1.55, a2 = a1 + 0.08 * RATE;
  return [
    approach,
    { T: a1 / RATE, pos: arc(0, CZ, R, 0, a1), p: -RATE },
    { T: 0.08, pos: arc(0, CZ, R, a1, a2), p: -RATE, y: 20 * DEG / 0.08 },
    { T: (Math.PI - a2) / RATE, pos: arc(0, CZ, R, a2, Math.PI), p: -RATE, y: 90 * DEG },
    { T: 0.45, pos: line([0, 0, CZ + R], [-1.2, 0, CZ + R]), y: 360 * DEG },
    { T: Math.PI / RATE, pos: arc(-1.2, CZ, R, Math.PI, 2 * Math.PI), p: RATE },
    { T: 0.7, pos: line([-1.2, 0, 1], [3, 0, 1]) },
    { T: 1.0, pos: line([3, 0, 1], [7, 0, 1]) },
  ];
}
// The Maverick: pull up to the nose 80 deg up on the climb, a push of 120
// deg forward over pushS at the top, the glide over and down the far side
// backwards, level, and through again.
function maverick(pushS, pullDeg) {
  const ps = pushS || 0.25, aP = 0.75 * Math.PI, aG = aP + 0.1 * Math.PI * (ps / 0.25), pull = pullDeg || 80;
  return [
    approach,
    { T: aP / RATE, pos: arc(0, CZ, R, 0, aP), p: -pull * DEG / (aP / RATE) },
    { T: ps, pos: arc(0, CZ, R, aP, aG), p: 120 * DEG / ps },
    { T: (1.5 * Math.PI - aG) / RATE, pos: arc(0, CZ, R, aG, 1.5 * Math.PI) },
    { T: 0.5 * Math.PI / RATE, pos: arc(0, CZ, R, 1.5 * Math.PI, 2 * Math.PI), p: (pull - 120) * DEG / (0.5 * Math.PI / RATE) },
    out(2.0),
  ];
}

// Through the gate alone: its verdicts and its calls.
function runGate(steps, boxes, cam) {
  const g = makeLoopGate(boxes);
  const I = g.inp, calls = [], callT = [];
  const c = cam || {};
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const n = rot(s.q, [1, 0, 0]), u = rot(s.q, [0, 0, 1]);
    bodyDeltaParts(s.q0[0], s.q0[1], s.q0[2], s.q0[3], s.q[0], s.q[1], s.q[2], s.q[3], g._d || (g._d = { r: 0, p: 0, y: 0 }));
    Object.assign(I, {
      t: s.t, x: s.p[0], y: s.p[1], z: s.p[2], vx: s.v[0], vy: s.v[1], vz: s.v[2],
      fx: n[0], fy: n[1], fz: n[2], ux: u[0], uy: u[1], uz: u[2], dp: g._d.p, dr: g._d.r, dy: g._d.y,
      contact: s.contact, fresh: i === 0 ? 1 : 0, camDeg: c.camDeg == null ? 30 : c.camDeg, vfov: c.vfov || 90, aspect: 16 / 9,
    });
    if (loopStep(g)) { calls.push(g.last); callT.push(s.t); }
  }
  return { calls, callT, verdicts: g.out.slice(), g };
}

// Through the detector, as the page samples it (scene units, ws 3.5).
function sceneBox(b, ws) {
  return { min: { x: -b[4] * ws, y: b[2] * ws, z: -b[3] * ws }, max: { x: -b[1] * ws, y: b[5] * ws, z: -b[0] * ws } };
}
function runDetector(steps, boxes, opts) {
  const o = opts || {};
  const ws = 3.5, d = makeDetector(), cols = boxes.map((b) => sceneBox(b, ws)), ev = [];
  for (const s of steps) {
    const smp = {
      qx: s.q[0], qy: s.q[1], qz: s.q[2], qw: s.q[3], ox: s.rates[0], oy: s.rates[1], oz: s.rates[2],
      wx: -s.p[1] * ws, wy: s.p[2] * ws, wz: -s.p[0] * ws, alt: s.p[2], speed: Math.hypot(...s.v),
      vx: s.v[0], vy: s.v[1], vz: s.v[2], clearance: s.contact ? 0 : s.p[2], throttle: 0.5, armed: true,
      colliders: cols, ws, camDeg: 30, vfov: 90, aspect: 16 / 9,
    };
    // The core's own contact, when the run gives it: o.flags at a touch step
    // (the clearance says 0 there either way).
    if (o.flags != null) smp.contactFlags = s.contact ? o.flags : 0;
    const e = stepDetector(d, smp, DT);
    if (e) ev.push({ e, t: s.t, loops: d.lastLoops, why: d.lastWhy, called: d.lg.last && d.lg.last.calledT, closed: d.lg.last && d.lg.last.closed });
  }
  return ev;
}

test('the bar sits inside each kinematic loop: under it at the bottom, over it at the top', () => {
  const steps = fly(POWERLOOP);
  const under = steps.filter((s) => s.p[0] >= BAR[0] && s.p[0] <= BAR[3] && s.p[2] < BAR[2]);
  const over = steps.filter((s) => s.p[0] >= BAR[0] && s.p[0] <= BAR[3] && s.p[2] > BAR[5]);
  assert.ok(under.length > 0 && over.length > 0);
  assert.ok(Math.min(...over.map((s) => s.p[2])) > 5.9, 'the top');
  const last = steps[steps.length - 1], up = rot(last.q, [0, 0, 1]);
  assert.ok(up[2] > 0.999, 'upright after the loop');
});

test('Powerloop: under the bar, over it upside down, under again: one call, after LOOP.chainS without a next climb', () => {
  const r = runGate(fly(POWERLOOP), [BAR]);
  assert.deepEqual(r.calls.map((v) => [v.result, v.loops]), [['powerloop', 1]]);
  const v = r.calls[0];
  // The loop's sums run from the step it left the bar's underside.
  assert.ok(v.upMin <= -0.99 && Math.abs(v.yawVDeg) < 1 && v.backDeg >= 345, JSON.stringify(v));
  assert.equal(v.zTop, 6);
});

test('Double Powerloop: two loops on round the same bar are one call of 2 loops', () => {
  const r = runGate(fly(DOUBLE), [BAR]);
  assert.deepEqual(r.calls.map((v) => [v.result, v.loops]), [['powerloop', 2]]);
  assert.deepEqual(r.verdicts.map((v) => v.result), ['powerloop', 'powerloop']);
});

test('the object must be inside the loop: the bar 2 m to the side, or a crate on the floor under it, is no Powerloop', () => {
  const side = [-0.15, 2, 2.5, 0.15, 3, 2.8];
  assert.deepEqual(runGate(fly(POWERLOOP), [side]).verdicts, []);
  const crate = [-0.3, -1, 0, 0.3, 1, 0.6];
  assert.deepEqual(runGate(fly(POWERLOOP), [crate]).verdicts, []);
  // No box at all.
  assert.deepEqual(runGate(fly(POWERLOOP), []).verdicts, []);
});

test('a Powerloop flown on back over the bar upright, no loop, is called LOOP.chainS after the loop', () => {
  // After the loop: on out, up to 4 m, and back over the bar (its top 2.8 m)
  // the other way, upright.
  const r = runGate(fly([
    approach, { T: 2 * Math.PI / RATE, pos: arc(0, CZ, R, 0, 2 * Math.PI), p: -RATE },
    { T: 0.5, pos: line([0, 0, 1], [2, 0, 4]) }, { T: 1.0, pos: line([2, 0, 4], [-4, 0, 4]) }, { T: 3.5, pos: line([-4, 0, 4], [-6, 0, 4]) },
  ]), [BAR]);
  assert.deepEqual(r.calls.map((v) => [v.result, v.loops]), [['powerloop', 1]]);
  assert.ok(r.callT[0] - r.calls[0].t2 <= LOOP.chainS + 0.01, 'called ' + (r.callT[0] - r.calls[0].t2).toFixed(2) + ' s after the loop');
});

test('a touch between the passes voids the loop', () => {
  // Over the bar at 1.8 s, back under it at 3.1.
  const r = runGate(fly(POWERLOOP, { touchAt: 2.2 }), [BAR]);
  assert.deepEqual(r.calls, []);
  assert.deepEqual(r.verdicts.map((v) => v.why), ['a touch']);
});

test('Barani: under, a half loop to upside down over the bar, 180 of yaw upside down with the horizon in view, the Matty back under flying backwards', () => {
  const r = runGate(fly(barani(180)), [BAR]);
  assert.deepEqual(r.calls.map((v) => v.result), ['barani'], JSON.stringify(r.verdicts));
  const v = r.calls[0];
  assert.ok(Math.abs(Math.abs(v.yawVDeg) - 180) <= 2, 'yaw ' + v.yawVDeg);
  // The yaw began at the top, upside down, the nose level: the camera 30
  // deg down (the page's tilt), the horizon in the frame's lower half.
  assert.ok(Math.abs(v.camElDeg + 30) <= 3, 'camera ' + v.camElDeg);
  assert.ok(v.backDeg >= 175 && v.fwdDeg >= 175 && v.upZ2 > 0.99 && v.dot2 < -0.99, JSON.stringify(v));
  // The band: 120 to 225 of yaw upside down.
  assert.deepEqual(runGate(fly(barani(130)), [BAR]).calls.map((x) => x.result), ['barani']);
  const wide = runGate(fly(barani(260)), [BAR]);
  assert.deepEqual(wide.calls, []);
  assert.match(wide.verdicts[0].why, /^yawed 260° upside down/);
  // Under 120 is a loop with a yaw in it: nothing.
  const small = runGate(fly(barani(100)), [BAR]);
  assert.deepEqual(small.calls, []);
});

test('Barani: the yaw begun with the camera on the sky is nothing (the horizon not in view before it)', () => {
  const r = runGate(fly(baraniSkyYaw()), [BAR]);
  assert.deepEqual(r.calls, [], JSON.stringify(r.verdicts));
  assert.equal(r.verdicts.length, 1);
  const v = r.verdicts[0];
  assert.ok(Math.abs(v.yawVDeg) >= 120 && Math.abs(v.yawVDeg) <= 225, 'yaw upside down ' + v.yawVDeg);
  assert.match(v.why, /^the horizon not in view before the yaw/);
  assert.ok(v.camElDeg > 45, 'camera ' + v.camElDeg);
});

test('Maverick: under, the climb over the bar, a fast push at the top, the glide down backwards, under again; never upside down', () => {
  const r = runGate(fly(maverick(0.25)), [BAR]);
  assert.deepEqual(r.calls.map((v) => v.result), ['maverick'], JSON.stringify(r.verdicts));
  const v = r.calls[0];
  assert.ok(v.upMin > 0.15 && v.pullDeg >= 75 && v.pushDeg >= 119 && v.glideS >= 0.5, JSON.stringify(v));
  // Called LOOP.mavWaitS after the pass back under.
  assert.ok(v.t2 > 0);
  // The object on the glide: logged, not judged.
  assert.ok(v.objView >= 0 && v.objView <= 1);
  // A slow level-out (120 over 1 s) is no Maverick.
  const slow = runGate(fly(maverick(1.0)), [BAR]);
  assert.deepEqual(slow.calls, []);
  assert.match(slow.verdicts[0].why, /^no fast forward pitch/);
});

test('the detector: each loop is its one call, never a Flip or a second label besides', () => {
  const pl = runDetector(fly(POWERLOOP), [BAR]);
  assert.deepEqual(pl.map((x) => x.e), ['powerloop'], JSON.stringify(pl));
  const two = runDetector(fly(DOUBLE), [BAR]);
  assert.deepEqual(two.map((x) => [x.e, x.loops]), [['powerloop', 2]], JSON.stringify(two));
  const bar = runDetector(fly(barani(180)), [BAR]);
  assert.deepEqual(bar.map((x) => x.e), ['barani'], JSON.stringify(bar));
  const mav = runDetector(fly(maverick(0.25)), [BAR]);
  assert.deepEqual(mav.map((x) => x.e), ['maverick'], JSON.stringify(mav));
  // Open air: the loop is nothing (too slow for a Flip).
  const open = runDetector(fly(POWERLOOP), []);
  assert.deepEqual(open.map((x) => x.e), [], JSON.stringify(open));
});

test('the same object on the Warehouse: the stairs\' steps and the mezzanine edge they join; not the roof truss over them', () => {
  const built = buildMap(THREE, 'depot');
  const n = built.colliders.length, B = simBoxes(built.colliders, WS, null);
  const grp = groupBoxes(B, n, CRADLE.cellM);
  const box = (o) => Array.from(grp.box.slice(o * 6, o * 6 + 6));
  // The owner's Barani (2026-11-24, seq 17): under step 785, back under the
  // mezzanine 688 1.2 m along; the truss 797 is 0.94 m from step 795.
  const step785 = box(785), step795 = box(795), mezz688 = box(688), truss797 = box(797);
  assert.deepEqual(step785.map((x) => +x.toFixed(2)), [-2.78, 18.06, 2.87, -2.38, 18.94, 2.92]);
  assert.ok(sameObject(step785, mezz688), 'a step and the mezzanine');
  assert.ok(sameObject(step785, step795), 'two steps');
  assert.equal(sameObject(step795, truss797), false, 'the truss over the stairs');
  // The hatch's strip and the beam under it.
  assert.ok(sameObject(box(689), box(693)));
});

test('Barani is the Tricktionary\'s Master trick, 750 outdoors and 800 under-over; the bests are version 5', () => {
  const b = TRICK_BY_ID.barani;
  assert.deepEqual([b.tier, b.points, b.pointsIn], ['Master', 750, 800]);
  assert.equal(STORE_VER, 5);
  assert.equal(LOOP.hdLo, 2.094);
});

test('re-fly rulings (2026-11-24): the Maverick pulls back from 50; a pull of 40 is no Maverick', () => {
  assert.equal(LOOP.mavPull, 0.873);
  assert.deepEqual(runGate(fly(maverick(0.25, 55)), [BAR]).calls.map((v) => v.result), ['maverick']);
  const low = runGate(fly(maverick(0.25, 40)), [BAR]);
  assert.deepEqual(low.calls, []);
  assert.match(low.verdicts[0].why, /^pulled back (39|4\d)° \(needs 50\)/);
});

test('re-fly rulings: a climb under something higher (not level) does not start the loop over', () => {
  // A beam across the climb, 2.2 m over it, while the nose is 34 deg up
  // (up-Z 0.83): the loop goes on round the bar.
  const steps = fly(POWERLOOP);
  const k = steps.findIndex((x) => x.t >= 0.5 + 0.6 / RATE);
  const c = steps[k];
  assert.ok(rot(c.q, [0, 0, 1])[2] < LOOP.level && rot(c.q, [0, 0, 1])[2] > LOOP.upright);
  const beam = [c.p[0] - 0.2, -2, c.p[2] + 2.2, c.p[0] + 0.2, 2, c.p[2] + 2.3];
  assert.deepEqual(runGate(steps, [BAR, beam]).calls.map((v) => v.result), ['powerloop']);
  assert.equal(LOOP.level, 0.9);
});

test('re-fly rulings: a call closes only a segment begun before the pass back under; a roll begun after the loop is its own', () => {
  // The loop, then on out, and 1.2 s after the pass back under a roll of
  // 360 at 300 deg/s: the Powerloop is called inside it (LOOP.chainS on).
  const steps = fly([approach, { T: 2 * Math.PI / RATE, pos: arc(0, CZ, R, 0, 2 * Math.PI), p: -RATE }, out(1.2),
    { T: 1.2, pos: line([7.2, 0, 1], [14.4, 0, 1]), r: 300 * DEG }, { T: 1.5, pos: line([14.4, 0, 1], [23.4, 0, 1]) }]);
  const ev = runDetector(steps, [BAR]);
  assert.deepEqual(ev.map((x) => x.e), ['powerloop', 'roll'], JSON.stringify(ev));
  assert.equal(ev[0].closed, 0, 'the call closed no segment');
  assert.ok(ev[0].called > 0);
});

test('re-fly rulings: the touch is the core contact flag when the core gives it, between the passes only', () => {
  // Over the bar at 1.8 s, back under it at 3.1: a step at 2.2 with the
  // clearance at 0 but no contact from the core is no touch; the core's
  // floor contact there voids the loop.
  const steps = fly(POWERLOOP, { touchAt: 2.2 });
  assert.deepEqual(runDetector(steps, [BAR], { flags: 0 }).map((x) => x.e), ['powerloop']);
  assert.deepEqual(runDetector(steps, [BAR], { flags: 1 }).map((x) => x.e), []);
  // After the pass back under (3.1 s), a touch voids nothing.
  assert.deepEqual(runDetector(fly(POWERLOOP, { touchAt: 3.4 }), [BAR], { flags: 1 }).map((x) => x.e), ['powerloop']);
});

test('re-fly rulings: the same object reaches 2.0 m across the floor (1 m in height): the stairs re-crossed 1.6 m along', () => {
  assert.equal(LOOP.sameM, 2.0);
  // Two steps 1.63 m apart across the floor, within 1 m in height.
  assert.ok(sameObject([-1.56, 18.06, 2.19, -1.16, 18.94, 2.25], [-3.19, 18.06, 3.09, -2.78, 18.94, 3.15]));
  // 1.13 m higher: not the same.
  assert.equal(sameObject([-1.56, 18.06, 2.19, -1.16, 18.94, 2.25], [-3.59, 18.06, 3.32, -3.19, 18.94, 3.37]), false);
});

// The owner's re-fly of 2026-11-24 (D:/qm-tricklogs/Barani.txt, outside
// git): seven pastes flown on 4070103's gate (the bf core, the Warehouse,
// ?tricks=debug, the Air65), each under a label of what was flown. Its 16
// loop records are tools/fixtures/tricklog-depot-bf-refly-loops.jsonl.gz,
// one a line, each line byte for byte as logged, the pastes one after the
// other (REFLY: lines [a, b); seq restarts in each), with one change: a
// record whose rows are the first rows of a longer record of its paste has
// its "rows" cut and "same" (that record's seq) in their place, its from
// and to kept (5 of them; 1.3 MB gzipped down to 0.88). The rows are the
// gate's inputs every 4 ms (LOOP_LOG), so a replay is exact but for their
// rounding (to the ms, 4 decimals: a 4 ms step, 0.01 m, a degree; on
// 4070103's gate as on today's). The open-air loops left none (no box below
// them); the two Baranis the gate never judged (attempts 11 and 35: no
// record) are left unasserted.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const REFLY_FILE = 'tools/fixtures/tricklog-depot-bf-refly-loops.jsonl.gz';
const REFLY = [
  { name: 'Barani', lines: [0, 6] },
  { name: 'yaw early', lines: [6, 7] },
  { name: 'half loop 180 roll at top', lines: [7, 8] },
  { name: 'powerloop and double powerloop', lines: [8, 11] },
  { name: 'open air loops', lines: [11, 11] },
  { name: 'mavericks - last one did not register', lines: [11, 15] },
  { name: 'flips rolls, ham spin', lines: [15, 16] },
];
const REFLY_RECS = gunzipSync(readFileSync(join(root, REFLY_FILE))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
for (const P of REFLY) {
  P.recs = REFLY_RECS.slice(...P.lines);
  P.bySeq = new Map(P.recs.map((r) => [r.seq, r]));
}

// A record's rows: its own, or those of the record it shares (same) from
// its from to its to.
function reflyRows(P, rec) {
  if (rec.inputs.rows) return rec.inputs.rows;
  const src = P.bySeq.get(rec.inputs.same);
  return src.inputs.rows.filter((row) => row[0] >= rec.inputs.from - 1e-6 && row[0] <= rec.inputs.to + 1e-6);
}

// A record replayed as stepDetector runs the gate: a fresh gate on the
// record's boxes; each row's inputs; a jump of over 2 m starts it over; the
// first row, or one flagged fresh (4), is fresh; an armed row (2) steps it,
// an unarmed one resets it. touch(t), if given, in place of the logged
// touch (flag 1). The gate's verdicts (out) and its calls.
function replayRefly(P, rec, touch) {
  const rows = reflyRows(P, rec), C = rec.inputs.cols;
  const ix = Object.fromEntries(C.map((c, i) => [c, i]));
  const g = makeLoopGate(rec.gate.boxes.map((b) => b.slice(1)));
  const calls = [];
  let prev = null;
  rows.forEach((row, i) => {
    if (prev && Math.hypot(row[ix.x] - prev[ix.x], row[ix.y] - prev[ix.y], row[ix.z] - prev[ix.z]) > 2) loopReset(g, 'jump');
    prev = row;
    const I = g.inp;
    for (const c of C) if (c !== 'flags') I[c] = row[ix[c]];
    I.contact = touch ? (touch(row[0]) ? 1 : 0) : row[ix.flags] & 1;
    I.fresh = i === 0 || (row[ix.flags] & 4) ? 1 : 0;
    I.camDeg = rec.cam.camDeg; I.vfov = rec.cam.vfov; I.aspect = rec.cam.aspect;
    if (row[ix.flags] & 2) { if (loopStep(g)) calls.push(g.last); }
    else loopReset(g, 'disarm');
  });
  return { out: g.out, calls, rows, ix };
}
const vText = (v) => (v.result || '-') + (v.loops > 1 ? ' x' + v.loops : '') + ' ' + v.t1 + '-' + v.t2 + (v.result ? '' : ' ' + v.why);
const cText = (v) => v.result + (v.loops > 1 ? ' x' + v.loops : '') + ' @' + v.calledT;

test('re-fly fixture: the owner\'s 16 loop records of 2026-11-24, as logged, on the gate before the rulings', () => {
  assert.equal(REFLY_RECS.length, 16);
  assert.deepEqual(REFLY.map((P) => P.recs.length), [6, 1, 1, 3, 0, 4, 1]);
  for (const P of REFLY) {
    for (const r of P.recs) {
      const key = P.name + ' ' + r.seq;
      assert.deepEqual([r.kind, r.type, r.core, r.map], ['quadmath-trick-attempt', 'loop', 'bf', 'depot'], key);
      assert.deepEqual(r.cam, { camDeg: 30, vfov: 79.2, aspect: 2.094 }, key);
      // A shared record's rows are the first rows of a longer one's.
      if (!r.inputs.rows) {
        const src = P.bySeq.get(r.inputs.same);
        assert.ok(src.inputs.rows && src.inputs.from === r.inputs.from && src.inputs.to > r.inputs.to, key);
      }
      // Every 4 ms from its from to its to, none missing.
      const rows = reflyRows(P, r);
      assert.equal(rows.length, Math.round((r.inputs.to - r.inputs.from) / 0.004) + 1, key);
      assert.ok(Math.abs(rows[0][0] - r.inputs.from) < 1e-6 && Math.abs(rows[rows.length - 1][0] - r.inputs.to) < 1e-6, key);
    }
  }
  assert.deepEqual(REFLY_RECS.filter((r) => !r.inputs.rows).map((r) => r.seq + ' in ' + r.inputs.same), ['6 in 15', '13 in 15', '7 in 26', '12 in 26', '18 in 26']);
  // The gate it was flown on: today's LOOP but for the rulings (the
  // Maverick's pull 60 then 50, the same object 1.5 then 2.0 m, the level
  // first pass new).
  const need = REFLY_RECS[0].need;
  for (const r of REFLY_RECS) assert.deepEqual(r.need, need);
  assert.deepEqual([need.mavPull, need.sameM, 'level' in need], [1.047, 1.5, false]);
  assert.deepEqual({ ...need, mavPull: LOOP.mavPull, sameM: LOOP.sameM, level: LOOP.level }, { ...LOOP });
});

// What each record replays to on today's gate: every verdict its rows hold,
// in order, and every call, when (a Barani at its pass back under, a
// Maverick LOOP.mavWaitS on, a Powerloop with no loop on LOOP.chainS on; the
// Double's call, 27.16 + 1.6 s, falls past its rows). The owner's labels:
// two Baranis of eight (three touched the floor, one came back over the
// stairs, two never judged), nothing for the early yaw (114 upside down)
// and the half loop rolled at the top (an Immelmann's, flown away: no pass
// back under), the Powerloop and the Double, and four Mavericks, the last
// pulled back 59.8.
const MAV = ['maverick 14.612-17.52', 'maverick 17.676-20.668', 'maverick 20.888-24.404', 'maverick 26.904-29.632'];
const MAV_CALLS = ['maverick @17.82', 'maverick @20.968', 'maverick @24.704', 'maverick @29.932'];
const PL = ['powerloop 13.044-15.568', 'powerloop 22.144-24.6', 'powerloop x2 24.816-27.16'];
const REFLY_REPLAY = {
  'Barani': {
    6: [['barani 17.44-20.108'], ['barani @20.108']],
    17: [['- 37.108-40.012 a touch'], []],
    21: [['- 43.068-45.484 a touch'], []],
    31: [['- 54.216-58.22 not back under it inside 4 s'], []],
    44: [['- 73.072-75.584 a touch'], []],
    51: [['barani 80.008-82.696'], ['barani @82.696']],
  },
  'yaw early': { 5: [['- 8.392-10.952 yawed 114° upside down (a loop: under 90, a Barani: 120 or more)'], []] },
  'half loop 180 roll at top': { 6: [['- 16.46-20.464 not back under it inside 4 s'], []] },
  'powerloop and double powerloop': {
    6: [PL.slice(0, 1), []],
    13: [PL.slice(0, 2), ['powerloop @17.172']],
    15: [PL, ['powerloop @17.172']],
  },
  'open air loops': {},
  'mavericks - last one did not register': {
    7: [MAV.slice(0, 1), MAV_CALLS.slice(0, 1)],
    12: [MAV.slice(0, 2), MAV_CALLS.slice(0, 2)],
    18: [MAV.slice(0, 3), MAV_CALLS.slice(0, 3)],
    26: [MAV, MAV_CALLS],
  },
  'flips rolls, ham spin': { 16: [[], []] },
};

test('re-fly: each record replays to the owner\'s calls on today\'s gate: two Baranis, the Powerloop and the Double, four Mavericks, and nothing else', () => {
  for (const P of REFLY) {
    const want = REFLY_REPLAY[P.name];
    assert.deepEqual(P.recs.map((r) => r.seq), Object.keys(want).map(Number), P.name);
    for (const r of P.recs) {
      const { out, calls } = replayRefly(P, r);
      assert.deepEqual([out.map(vText), calls.map(cText)], want[r.seq], P.name + ' ' + r.seq);
    }
  }
  // When: a Barani at once, a Maverick LOOP.mavWaitS on, a Powerloop
  // LOOP.chainS on (a step later: the wait runs out the step after).
  const P = REFLY[3], { out, calls } = replayRefly(P, P.bySeq.get(15));
  assert.ok(Math.abs(calls[0].calledT - out[0].t2 - LOOP.chainS - 0.004) < 1e-6);
  const M = REFLY[5], m = replayRefly(M, M.bySeq.get(26));
  m.calls.forEach((c, k) => assert.ok(Math.abs(c.calledT - m.out[k].t2 - LOOP.mavWaitS) < 1e-6, MAV_CALLS[k]));
  // The Double: its second loop chained from the first, two loops.
  assert.deepEqual([out[2].loops, out[2].chainFrom, out[1].chainFrom], [2, 2, 1]);
});

// The rows' rounding: what a replay can move a logged value by (a 4 ms step
// on a time, 0.01 m, a degree, 0.01 else), on 4070103's gate as on today's.
const reflyTol = (k) => /^t|T$/.test(k) ? 0.0041 : /^z/.test(k) ? 0.01 : /Deg$/.test(k) ? 1 : 0.01;

test('re-fly: every logged verdict replays within the rows\' rounding, but for the rulings\' changes', () => {
  const changed = [];
  for (const P of REFLY) {
    for (const r of P.recs) {
      const v = r.gate, key = P.name + ' ' + r.seq;
      const { out, rows, ix } = replayRefly(P, r);
      const back = out.find((x) => Math.abs(x.t1 - v.t1) <= 0.0041 && Math.abs(x.t2 - v.t2) <= 0.0041);
      if (!back) {
        // The first pass under must be level now: this one never was, from
        // its start to the pass.
        const run = rows.filter((row) => row[0] >= v.tRun - 1e-6 && row[0] <= v.t1 + 1e-6);
        assert.ok(run.length && run.every((row) => row[ix.uz] < LOOP.level), key);
        changed.push(key + ': no verdict, up-Z ' + Math.max(...run.map((row) => row[ix.uz])) + ' at most to its pass under');
        continue;
      }
      const ids = (o) => o.map((i) => v.boxes[i][0]).sort((a, b) => a - b);
      const diffs = [];
      for (const k of Object.keys(v)) {
        // The replay's own count; its input.
        if (k === 'seq' || k === 'boxes') continue;
        const a = v[k], b = back[k];
        if (k === 'obj') {
          const la = a.slice().sort((x, y) => x - y), lb = ids(b);
          if (JSON.stringify(la) !== JSON.stringify(lb)) diffs.push('obj ' + la + ' -> ' + lb);
        } else if (typeof a === 'number' && typeof b === 'number') {
          if (!(Math.abs(a - b) <= reflyTol(k))) diffs.push(k + ' ' + a + ' -> ' + b);
        } else if (a !== b) diffs.push(k + ' ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b));
      }
      if (diffs.length) changed.push(key + ': ' + diffs.join('; '));
      // A later start: the logged one not level, its objects fewer.
      if (Math.abs(back.tRun - v.tRun) > 0.0041) {
        const uz = rows.find((row) => row[0] >= v.tRun - 1e-6)[ix.uz];
        assert.ok(back.tRun > v.tRun && uz >= LOOP.upright && uz < LOOP.level, key + ' up-Z ' + uz);
        assert.ok(ids(back.obj).every((id) => v.obj.includes(id)), key);
      }
    }
  }
  assert.deepEqual(changed, [
    // The level first pass: three Baranis start later (their earlier
    // starts at up-Z 0.87, 0.87 and 0.80); the flips' loop never starts.
    'Barani 17: tFrom 31.524 -> 31.588; tRun 31.524 -> 31.588',
    'Barani 31: tFrom 51.856 -> 54.032; tRun 51.856 -> 54.032; obj 1025,1026,1027,1028,1030,1033 -> 1025,1026',
    'Barani 51: tFrom 79.828 -> 79.948; tRun 79.828 -> 79.948; obj 1034,1035,1036 -> 1034,1036',
    // The Double's why, rewritten when it was called (after its record).
    'powerloop and double powerloop 15: why "2 loops round the same object; a loop round the object, upside down over it" -> "a loop round the object, upside down over it"',
    // The Maverick's pull from 50: 59.8 (logged 60) was short of 60.
    'mavericks - last one did not register 26: result null -> "maverick"; why "pulled back 60° (needs 60)" -> "under, over it upright, a fast push at the top, the glide back down, back under"',
    'flips rolls, ham spin 16: no verdict, up-Z 0.87488 at most to its pass under',
  ]);
});

// The rule's touch is the core's own contact, between the first pass under
// and the pass back under. The log's touch flag is the detector's (the
// floor within 0.08 m), so it comes first. The bf core, placed still at each
// logged pose for one 1 ms tick (reconstructed 2026-11-24; the log has no
// core contact), first met the floor 8 to 24 ms after the flag, each before
// any pass back under: the three voids stand.
const REFLY_CORE_TOUCH = { 17: 40.036, 21: 45.492, 44: 75.604 };

test('re-fly: Baranis 17, 21 and 44 touched the floor between the passes by the core\'s own contact (reconstructed): each void', () => {
  const P = REFLY[0];
  for (const [seq, tc] of Object.entries(REFLY_CORE_TOUCH)) {
    const r = P.bySeq.get(Number(seq)), v = r.gate;
    const { rows, ix } = replayRefly(P, r);
    const flag = rows.find((row) => row[0] >= v.t1 && (row[ix.flags] & 1));
    assert.ok(flag[0] === v.t2 && tc > flag[0] && tc - flag[0] <= 0.025, seq + ' flag ' + flag[0]);
    const { out } = replayRefly(P, r, (t) => Math.abs(t - tc) < 1e-6);
    assert.deepEqual(out.map(vText), ['- ' + v.t1 + '-' + tc + ' a touch'], seq);
  }
});

test('re-fly: every called loop is clear of a touch between its passes (no detector flag: the floor within 0.08 m, a box within 0.06, past the Air65\'s duct rims at 0.051), so the core\'s contact calls it too', () => {
  let n = 0;
  for (const P of REFLY) {
    for (const r of P.recs.filter((x) => x.inputs.rows)) {
      const { out, rows, ix } = replayRefly(P, r);
      for (const v of out.filter((x) => x.result)) {
        const hit = rows.filter((row) => row[0] >= v.t1 - 1e-6 && row[0] <= v.t2 + 1e-6 && (row[ix.flags] & 1));
        assert.deepEqual(hit.map((row) => row[0]), [], P.name + ' ' + r.seq + ' ' + vText(v));
        n++;
      }
    }
  }
  // Barani 6 and 51, the three Powerloops, the four Mavericks.
  assert.equal(n, 9);
});
