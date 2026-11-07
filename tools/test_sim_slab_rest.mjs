// A quad at rest on a raised slab, on the js core: it settles as on the open
// floor. sim.html's contact pass (qp.onSubstep) is sim-whoop.js jsContact and
// its support hook (qp.supportZ) jsSupportZ; this harness wires both into
// quadphysics.js as sim.html does, on the shipped maps' colliders. Before,
// a box top bounced the quad every tick it rested there, each bounce with a
// spin kick: the 85 parked on the Bando's roof, the Rig's loft or the
// Warehouse's mezzanine turned about 51° in 10 s and never settled, and its
// I-term never relaxed (the module took any height over the floor as air).
// node --test tools/test_sim_slab_rest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import { QuadPhysics, PHYSICS_HZ_FAST, FLOOR_CLEARANCE_M } from '../quadphysics.js';
import { WS, toScene, toModule } from '../sim-core-adapter.js';
import {
  resolveDuctHit, jsContact, boxTopUnder, jsSupportZ, REST_INTO, BOUNCE_MAPS, normalizeWhoop, whoopGroundK,
} from '../sim-whoop.js';
import { buildMap, BANDO_PLAY } from '../sim-maps.js';
import { classDefault, physicsFromBuild } from '../sim-build.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FLOOR_Y = FLOOR_CLEARANCE_M * WS;
// sim.html STOCK_TUNES.
const TUNES = {
  65: { rollP: 36, rollI: 61, rollD: 27, pitchP: 37, pitchI: 64, pitchD: 29, yawP: 36, yawI: 61, yawD: 0, rollF: 120, pitchF: 128, yawF: 160 },
  85: { rollP: 67, rollI: 120, rollD: 40, pitchP: 70, pitchI: 126, pitchD: 45, yawP: 67, yawI: 120, yawD: 0, rollF: 120, pitchF: 128, yawF: 160 },
};
// Raised slabs (world metres: x, the slab's top, z) and the open floor. The
// Bando's roof: the Bando Loop's pad.
const SPOTS = {
  floor: ['rig', [2, 0, 2]],
  bandoRoof: ['bando', [BANDO_PLAY.start[0], BANDO_PLAY.start[1] - 0.35, BANDO_PLAY.start[2]]],
  bandoFirst: ['bando', [0, 3.5, -10]],
  rigLoft: ['rig', [-9.5, 2.8, -0.5]],
  depotMezzanine: ['depot', [-15, 3.6, 10]],
};
const maps = new Map();
const collidersOf = (id) => {
  if (!maps.has(id)) maps.set(id, buildMap(THREE, id).colliders);
  return maps.get(id);
};
const yawOf = (q) => Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
const deg = (a, b) => { let x = (b - a) * 180 / Math.PI; while (x > 180) x -= 360; while (x < -180) x += 360; return x; };

// The js core as sim.html sets it up: the class's stock build and tune at
// 1 kHz, the default whoop settings, ground effect, the contact pass with its
// ground scrub, and the support hook.
function quadOn(spot, { frame = 85, armed = false, wind = 0, drop = 0.02, vx = 0, support = true } = {}) {
  const [mapId, at] = SPOTS[spot];
  const colliders = collidersOf(mapId);
  const build = classDefault(frame);
  const settings = normalizeWhoop(null);
  const qp = new QuadPhysics(physicsFromBuild(build).preset);
  qp.setPhysicsHz(PHYSICS_HZ_FAST);
  qp.windowedYawFF = true;
  qp.setTune(TUNES[frame]);
  const cp = new THREE.Vector3(), cv = new THREE.Vector3(), gp = new THREE.Vector3(), sp = new THREE.Vector3();
  const k = whoopGroundK(build, settings);
  qp.cfg.groundEffect = k;
  qp.groundClearance = (s) => {
    toScene(s.position, gp);
    return (gp.y - Math.max(FLOOR_Y, boxTopUnder(gp, colliders))) / WS;
  };
  const stats = { hits: 0 };
  const applyDuctHit = (s, normal, into, floor) => {
    stats.hits++;
    const hit = resolveDuctHit({ vel: { x: cv.x, y: cv.y, z: cv.z }, omega: s.omega, normal, into, floor }, build, settings, BOUNCE_MAPS[mapId]);
    cv.set(hit.vel.x, hit.vel.y, hit.vel.z);
    s.omega.x = hit.omega.x; s.omega.y = hit.omega.y; s.omega.z = hit.omega.z;
  };
  qp.onSubstep = (s) => {
    toScene(s.position, cp);
    toScene(s.velocity, cv);
    const floorHit = jsContact(cp, cv, colliders, FLOOR_Y, (n, into, fl) => applyDuctHit(s, n, into, fl));
    toModule(cp, s.position);
    toModule(cv, s.velocity);
    if (floorHit) {
      const kk = Math.exp(-(s.physicsDt || 1 / 500) * 7.3);
      s.omega.x *= kk; s.omega.y *= kk; s.omega.z *= kk;
    }
  };
  if (support) qp.supportZ = (s) => { toScene(s.position, sp); return jsSupportZ(sp, colliders, FLOOR_Y, WS); };
  gp.set(at[0] * WS, (at[1] + 0.5) * WS, at[2] * WS);
  const top = Math.max(FLOOR_Y, boxTopUnder(gp, colliders)) / WS;
  qp.reset(toModule(new THREE.Vector3(at[0] * WS, (top + drop) * WS, at[2] * WS)));
  if (vx) { const v = toModule(new THREE.Vector3(vx * WS, 0, 0)); qp.velocity = { x: v.x, y: v.y, z: v.z }; }
  if (armed) qp.arm();
  if (wind) for (const ax of ['roll', 'pitch', 'yaw']) qp.pid[ax].iterm = qp.pid[ax].itermLimit * wind;
  const sp0 = { roll: 0, pitch: 0, yaw: 0 }, stick = { t: 0, r: 0, p: 0, y: 0 };
  const yaw0 = yawOf(qp.quaternion);
  const yawAt = {};
  const run = (secs) => {
    for (let i = 0; i < Math.round(secs * 1000); i++) qp.step(0.001, sp0, 0, stick);
  };
  return { qp, top, stats, yaw0, run, yaw: () => yawOf(qp.quaternion), yawAt, y: () => { const p = new THREE.Vector3(); toScene(qp.position, p); return p.y / WS; } };
}

test('a slow contact on a box top settles, as on the floor; walls, undersides and hard landings still bounce', () => {
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 7, 10));
  const calls = [];
  const hit = (n, into, floor) => calls.push({ n, into, floor });
  // Resting on the top: a tick's gravity into it.
  let p = new THREE.Vector3(5, 7 - 1e-4, 5), v = new THREE.Vector3(0.2, -0.0343, -0.1);
  assert.equal(jsContact(p, v, [box], FLOOR_Y, hit), true, 'on a box top');
  assert.equal(calls.length, 0, 'no bounce, so no spin kick');
  assert.equal(p.y, 7);
  assert.equal(v.y, 0);
  assert.ok(Math.abs(v.x - 0.17) < 1e-12 && Math.abs(v.z + 0.085) < 1e-12, 'the slide bleeds as on the floor');
  // The open floor, the same.
  p = new THREE.Vector3(20, FLOOR_Y - 1e-4, 20); v = new THREE.Vector3(0.2, -0.0343, 0);
  assert.equal(jsContact(p, v, [box], FLOOR_Y, hit), true);
  assert.equal(calls.length, 0);
  assert.equal(v.y, 0);
  // A hard landing on the top bounces, as a hard one on the floor does.
  p = new THREE.Vector3(5, 7 - 0.01, 5); v = new THREE.Vector3(0, -(REST_INTO + 1), 0);
  assert.equal(jsContact(p, v, [box], FLOOR_Y, hit), true);
  assert.deepEqual(calls.pop(), { n: { x: 0, y: 1, z: 0 }, into: REST_INTO + 1, floor: true });
  // A wall.
  p = new THREE.Vector3(0.01, 3, 5); v = new THREE.Vector3(2, 0, 0);
  assert.equal(jsContact(p, v, [box], FLOOR_Y, hit), false);
  assert.deepEqual(calls.pop(), { n: { x: -1, y: 0, z: 0 }, into: 2, floor: false });
  assert.equal(p.x, 0);
  // An underside, met slowly, still bounces (it is no rest).
  const slab = new THREE.Box3(new THREE.Vector3(0, 5, 0), new THREE.Vector3(10, 5.875, 10));
  p = new THREE.Vector3(5, 5.01, 5); v = new THREE.Vector3(0, 0.5, 0);
  assert.equal(jsContact(p, v, [slab], FLOOR_Y, hit), false);
  assert.deepEqual(calls.pop(), { n: { x: 0, y: -1, z: 0 }, into: 0.5, floor: false });
  assert.equal(p.y, 5);
  // Climbing out past a top's edge, faster than REST_INTO: nothing meets it
  // (into is the speed down into the top, as the floor's), so it is not
  // thrown up at twice its climb.
  p = new THREE.Vector3(0.015, 7 - 0.01, 5); v = new THREE.Vector3(6 * WS, 6, 0);
  assert.equal(jsContact(p, v, [box], FLOOR_Y, hit), true);
  assert.equal(p.y, 7);
  assert.equal(v.y, 6, 'the climb goes on as it was');
  assert.equal(calls.length, 0);
});

test('jsSupportZ: the floor is 0; a box top less the floor\'s pad, so a quad at rest is as high over either', () => {
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 7, 10));
  const at = (x, y, z) => jsSupportZ(new THREE.Vector3(x, y, z), [box], FLOOR_Y, WS);
  assert.equal(at(20, FLOOR_Y, 20), 0, 'the open floor');
  assert.equal(at(20, 3, 20), 0, 'over the open floor');
  assert.ok(Math.abs(at(5, 7, 5) - (7 - FLOOR_Y) / WS) < 1e-12, 'on the top');
  assert.ok(Math.abs(at(5, 7 - 5e-5, 5) - (7 - FLOOR_Y) / WS) < 1e-12, 'a round-off under the top');
  assert.equal(at(5, 6.98, 5), 0, 'inside the box, under its top: not on it');
  assert.ok(Math.abs(7 / WS - at(5, 7, 5) - FLOOR_CLEARANCE_M) < 1e-12, 'at rest on the top, the floor\'s 1 cm over its support');
});

test('boxTopUnder: the top a quad rests on or over, or is within tol under; not a slab over it', () => {
  const low = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 1, 4));
  const slab = new THREE.Box3(new THREE.Vector3(0, 5, 0), new THREE.Vector3(4, 5.875, 4));
  const at = (x, y, z, tol) => boxTopUnder(new THREE.Vector3(x, y, z), [low, slab], tol);
  assert.equal(at(2, 3, 2), 1, 'under the slab, over the low box');
  assert.equal(at(2, 5.875, 2), 5.875, 'on the slab');
  assert.equal(at(2, 5.87, 2), 1, 'just inside the slab, with no tol');
  assert.equal(at(2, 5.87, 2, 0.07), 5.875, 'just inside the slab, within tol');
  assert.equal(at(9, 6, 9), -Infinity, 'over nothing');
});

test('the 85 and the 65 parked on a raised slab do not turn: the Bando roof and first floor, the Rig loft, the Warehouse mezzanine', () => {
  for (const frame of [85, 65]) for (const armed of [false, true]) for (const spot of Object.keys(SPOTS)) {
    const q = quadOn(spot, { frame, armed });
    q.run(10);
    const turned = deg(q.yaw0, q.yaw());
    const label = `${frame} ${armed ? 'armed' : 'disarmed'} on ${spot}`;
    assert.ok(Math.abs(turned) < 0.05, `${label} turned ${turned.toFixed(2)}° in 10 s`);
    assert.ok(Math.abs(q.qp.omega.z) < 1e-4, `${label} still turning at ${q.qp.omega.z} rad/s`);
    assert.ok(Math.abs(q.y() - Math.max(q.top, FLOOR_Y / WS)) < 1e-6, `${label} rests on its surface (${q.y()} m, the top ${q.top} m)`);
    assert.equal(q.qp.airborne, false, `${label}: the module takes the slab for ground`);
    assert.equal(q.stats.hits, 0, `${label}: no bounce at rest`);
  }
});

test('on a raised slab the I-term relaxes as on the floor: a wound-up quad settles the same', () => {
  // Half the I limit on every axis, armed at idle: on the floor the quad
  // turns while the I-term relaxes, then stops. On a slab without the support
  // hook it held its I-term: it turned over 100° in 2 s and was still turning
  // at 10 s.
  const floor = quadOn('floor', { armed: true, wind: 0.5 });
  floor.run(10);
  const onFloor = deg(floor.yaw0, floor.yaw());
  assert.ok(Math.abs(onFloor) > 1, 'the wind-up turns the quad on the floor too (the check has teeth)');
  for (const spot of ['bandoRoof', 'rigLoft', 'depotMezzanine']) {
    const q = quadOn(spot, { armed: true, wind: 0.5 });
    q.run(10);
    const turned = deg(q.yaw0, q.yaw());
    assert.ok(Math.abs(turned - onFloor) < 0.5, `${spot}: turned ${turned.toFixed(2)}°, the floor ${onFloor.toFixed(2)}°`);
    assert.ok(Math.abs(q.qp.omega.z) < 1e-4, `${spot}: settled`);
  }
  const bare = quadOn('rigLoft', { armed: true, wind: 0.5, support: false });
  bare.run(10);
  assert.ok(Math.abs(deg(bare.yaw0, bare.yaw()) - onFloor) > 10 && Math.abs(bare.qp.omega.z) > 0.01, 'without the support hook a slab does not settle (the check has teeth)');
});

test('just over a raised slab, the module\'s ground bands are the floor\'s: the same brake, the same airborne, at every height', () => {
  // One tick, disarmed, sliding at 3 m/s at h over each surface's rest
  // height: the ground brake and the airborne flag act the same over a
  // slab as over the floor.
  for (const h of [0.005, 0.012, 0.02, 0.03, 0.045, 0.06, 0.2]) {
    const ref = quadOn('floor', { drop: h, vx: 3 });
    ref.run(0.001);
    for (const spot of ['bandoRoof', 'rigLoft', 'depotMezzanine']) {
      const q = quadOn(spot, { drop: h, vx: 3 });
      q.run(0.001);
      const sp = (qp) => Math.hypot(qp.velocity.x, qp.velocity.y);
      assert.ok(Math.abs(sp(q.qp) - sp(ref.qp)) < 1e-9, `${spot} at ${h} m: ${sp(q.qp)} m/s, the floor ${sp(ref.qp)} m/s`);
      assert.equal(q.qp.airborne, ref.qp.airborne, `${spot} at ${h} m: airborne as over the floor`);
    }
  }
});

test('landed on a raised slab, sliding in or dropped hard, the quad settles and stays put', () => {
  for (const spot of ['floor', 'bandoRoof', 'rigLoft', 'depotMezzanine']) {
    for (const [drop, vx] of [[0.3, 1.5], [1.5, 0]]) {
      const q = quadOn(spot, { armed: true, drop, vx });
      q.run(3);
      const yaw3 = q.yaw();
      const y3 = q.y();
      q.run(7);
      const label = `${spot}, dropped ${drop} m at ${vx} m/s`;
      assert.ok(Math.abs(deg(yaw3, q.yaw())) < 0.05, `${label}: turned ${deg(yaw3, q.yaw()).toFixed(2)}° after it settled`);
      assert.ok(Math.abs(q.y() - y3) < 1e-6, `${label}: still on its surface`);
      assert.ok(Math.abs(q.y() - Math.max(q.top, FLOOR_Y / WS)) < 1e-6, `${label}: on the ${spot} (${q.y()} m)`);
    }
  }
});

test('sim.html runs this contact pass and support hook on the js core', () => {
  const html = readFileSync(join(root, 'sim.html'), 'utf8');
  const hook = html.slice(html.indexOf('qp.onSubstep=(s)=>{'), html.indexOf('qp.groundClearance=(s)=>{'));
  assert.match(hook, /const floorHit=jsContact\(_cp,_cv,colliders,FLOOR_Y,/);
  assert.match(hook, /if\(floorHit\)\{[^}]*Math\.exp\(-\(s\.physicsDt\|\|1\/500\)\*7\.3\)/);
  assert.doesNotMatch(hook, /containsPoint/, 'no second contact pass');
  assert.match(html, /qp\.supportZ=\(s\)=>\{\s*toScene\(s\.position,_sp\);\s*return jsSupportZ\(_sp,colliders,FLOOR_Y,WS\);/);
  // With ground effect off (no groundClearance), the turtle and the tricks'
  // contact take the height over the support too, not over the open floor.
  assert.equal(html.split('qp.groundClearance?qp.groundClearance(qp):qp.position.z-qp.supportZ(qp)').length - 1, 2);
  assert.doesNotMatch(html, /qp\.groundClearance\(qp\):qp\.position\.z[;)]/);
});
