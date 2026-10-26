// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// sim-core-adapter.js: the render boundary (module Z-up to scene Y-up), the
// 4 ms poll's sim-time stamps, the bf core's RC channels, the bf core on the
// vendored quadmath-sim-core (Air65, the tune database's 1219s card) from
// stick forward to +X, its turtle (Betaflight's crash flip on AUX3), and the
// js core's fixed 1 kHz ticks, sample-and-hold input and render interpolation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.min.js';
import {
  WS, toScene, toModule, boxToModule, InputClock, bfChannels, createBfCore, createJsCore, armingFlagNames,
  BF_AUX_LINES, withPageAux,
} from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { applyAxisMap, AETR_MAP } from '../sim-touch.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('toScene: module X forward, Y left, Z up become scene -Z, -X, +Y, scaled by WS', () => {
  const v = new THREE.Vector3();
  assert.deepEqual(toScene({ x: 1, y: 0, z: 0 }, v).toArray(), [-0, 0, -WS]);
  assert.deepEqual(toScene({ x: 0, y: 1, z: 0 }, v).toArray(), [-WS, 0, -0]);
  assert.deepEqual(toScene({ x: 0, y: 0, z: 1 }, v).toArray(), [-0, WS, -0]);
  const back = toModule(toScene({ x: 0.3, y: -1.2, z: 2.5 }, v));
  assert.ok(near(back.x, 0.3) && near(back.y, -1.2) && near(back.z, 2.5));
  // A module yaw of +90 degrees (nose to module +Y, scene -X) turns the
  // scene's forward (-Z) to -X: the same rotation in the scene.
  const h = Math.PI / 4;
  const q = toScene({ x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) }, new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  assert.ok(near(fwd.x, -1, 1e-12) && near(fwd.z, 0, 1e-12));
  const qb = toModule(q);
  assert.ok(near(qb.z, Math.sin(h)) && near(qb.w, Math.cos(h)));
});

test('boxToModule: the same mapping as quadmath-sim-core scripts/export-map-colliders.mjs', () => {
  const bb = { min: { x: 1, y: 0, z: -7 }, max: { x: 3.5, y: 7, z: 14 } };
  const b = boxToModule(bb);
  assert.deepEqual(b.min, [-14 / WS, -3.5 / WS, 0]);
  assert.deepEqual(b.max, [7 / WS, -1 / WS, 7 / WS]);
});

test('InputClock: wall time to sim time from the frame anchor, monotonic, capped', () => {
  const sim = { simTimeUs: 5_100_000, alpha: 0.25, tickUs: 1000 };
  const clock = new InputClock({ horizonUs: 100_000 });
  assert.equal(clock.stamp(sim, 0), 5_100_000);
  clock.anchor(sim, 1000);
  assert.equal(clock.stamp(sim, 1004), 5_104_250);
  assert.equal(clock.stamp(sim, 1003), 5_104_250, 'never backwards');
  assert.equal(clock.stamp(sim, 1150), null, 'past the horizon: dropped');
});

test('bfChannels: sticks 1:1, aux on BF_AUX_LINES (ARM AUX1, ANGLE AUX2, FLIP AUX3, HORIZON AUX4)', () => {
  const ch = bfChannels({ r: 0.5, p: 0.3, y: -1, t: 0.25 }, { arm: true, mode: 'horizon', turtle: false });
  assert.deepEqual(ch.slice(0, 8), [1750, 1650, 1000, 1250, 2000, 1000, 1000, 2000]);
  assert.deepEqual(bfChannels({ r: 0, p: 0, y: 0, t: 0 }, { arm: false, mode: 'angle', turtle: true }).slice(4, 8), [1000, 2000, 2000, 1000]);
  assert.equal(bfChannels({ r: 0, p: 0, y: 0, t: 0.9 }, { holdThrottle: true, mode: 'acro' })[3], 1000);
  assert.deepEqual(armingFlagNames((1 << 7) | (1 << 25)), ['THROTTLE', 'ARM_SWITCH']);
});

test('withPageAux: a diff\'s own aux lines go, BF_AUX_LINES go on the end', () => {
  const out = withPageAux('set small_angle = 180\r\naux 0 0 1 1700 2100 0 0\r\naux 7 10 5 900 1200 0 0\r\nsave\r\n');
  assert.deepEqual(out.trim().split('\n'), ['set small_angle = 180', 'save', ...BF_AUX_LINES]);
  // The owner's Air65 radio: ARM AUX1, ANGLE AUX2, BEEPER and FLIP OVER AFTER
  // CRASH AUX3 (quadmath-sim-core configs/air65-ryfly-2026-10-23.txt).
  assert.deepEqual(BF_AUX_LINES.slice(0, 4), ['aux 0 0 0 1700 2100 0 0', 'aux 1 1 1 1700 2100 0 0', 'aux 2 13 2 1700 2100 0 0', 'aux 3 35 2 1700 2100 0 0']);
});

// The tune database is a classic script; read its cards the way sim.html does.
function tunes() {
  const w = {};
  vm.runInNewContext(readFileSync('tune-database.js', 'utf8'), { window: w, document: { readyState: 'complete', getElementById: () => null } });
  return w.QuadMathTunes;
}

// A TX16S in USB joystick mode: AETR on axes 0-3, each the radio's channel
// output (stick forward +1 on axis 1), throttle -1..1 on axis 2.
const tx16s = ({ r = 0, p = 0, y = 0, t = 0 }) => [r, p, -1 + 2 * t, y, -1, -1, -1, -1];

test('bf core: TX16S stick forward is pitch above 1500, a nose-down rate, and +X (scene forward)', async () => {
  const db = tunes();
  const card = db.tunes.find((t) => t.id === '65-betafpv-ryfly-1219s');
  assert.ok(card, 'the Air65 1219s card');
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync('vendor/sim-core/sim-core.wasm'),
    airframe: JSON.parse(readFileSync('vendor/sim-core/airframes/air65.json', 'utf8')),
    diff: db.cliFor(card),
    world: { floorZ: 0 },
  });
  assert.equal(core.report.errors, 0);
  // The page: a 4 ms poll stamped in sim time, 60 Hz frames.
  let wall = 0;
  let nextFrame = 0;
  let stick = { r: 0, p: 0, y: 0, t: 0 };
  const run = (ms) => {
    const end = wall + ms;
    for (; wall < end; wall += 4) {
      const t = core.stamp(wall);
      if (t !== null) core.input(stick, t);
      if (wall >= nextFrame) {
        core.advance(1000 / 60);
        core.anchor(wall);
        nextFrame += 1000 / 60;
      }
    }
  };
  run(1000);
  core.setArm(true);
  run(300);
  assert.equal(core.getState().armed, true, `armed (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  stick = { r: 0, p: 0, y: 0, t: 0.45 };
  run(1500);
  stick = { r: 0, p: 0, y: 0, t: 0.41 };
  run(400);
  const x0 = core.getState().position.x;
  // Through quadmath's own radio map, as the page reads the pad on the bf core.
  stick = applyAxisMap(tx16s({ p: 0.3, t: 0.43 }), AETR_MAP, { deadzone: 0 });
  assert.ok(stick.p > 0.29, `the preset map reads stick forward as +p (${stick.p})`);
  run(80);
  const fc = core.sim.fc;
  const s = core.getState();
  assert.ok(fc.rcData[1] > 1500, `rcData[1] ${fc.rcData[1]}`);
  assert.ok(fc.setpoint[1] > 0, `setpoint[1] ${fc.setpoint[1]}`);
  assert.ok(s.omega.y > 0, `pitch rate ${s.omega.y} (+ is nose down)`);
  run(600);
  const s2 = core.getState();
  assert.ok(s2.position.x > x0 + 0.1, `x ${x0.toFixed(2)} -> ${s2.position.x.toFixed(2)} m`);
  const v = toScene(s2.velocity, new THREE.Vector3());
  assert.ok(v.z < 0, 'moving toward scene -Z, the camera forward');
  assert.ok(s2.flightMs > 3000, 'the flight clock runs');
});

test('js core: fixed 1 kHz ticks, sample-and-hold input, interpolated pose', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setPhysicsHz(1000);
  const seen = [];
  const core = createJsCore({
    qp,
    tick: (sample, tUs) => {
      seen.push([tUs, sample.t]);
      qp.step(0.001, { roll: 0, pitch: 0, yaw: 0 }, 0, sample);
    },
  });
  assert.equal(core.advance(16.7), 16);
  assert.ok(near(core.alpha, 0.7, 1e-6));
  assert.equal(core.advance(16.7), 17, 'the remainder carries');
  // A sample stamped ahead waits for its tick, then holds.
  const t0 = core.simTimeUs;
  core.input({ r: 0, p: 0, y: 0, t: 0.5 }, t0 + 3000);
  seen.length = 0;
  core.advance(6);
  assert.deepEqual(seen.map(([, t]) => t), [0, 0, 0, 0.5, 0.5, 0.5]);
  // A frame longer than 250 ms is a pause: 250 ticks, the rest dropped.
  assert.equal(core.advance(400), 250);
  // Interpolation sits between the last two ticks.
  qp.reset({ x: 0, y: 0, z: 1 });
  core.resetPose();
  const s = core.getState();
  assert.ok(near(s.position.z, 1));
  assert.equal(s.kind, 'js');
});

test('bf core: a respawn reports its pose at once, keeps the link up, and arms without a wait', async () => {
  const db = tunes();
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync('vendor/sim-core/sim-core.wasm'),
    airframe: JSON.parse(readFileSync('vendor/sim-core/airframes/air65.json', 'utf8')),
    diff: db.cliFor(db.tunes.find((t) => t.id === '65-betafpv-ryfly-1219s')),
    world: { floorZ: 0 },
  });
  let wall = 0;
  const run = (ms, stick = { r: 0, p: 0, y: 0, t: 0 }) => {
    for (const end = wall + ms; wall < end; wall += 4) {
      const t = core.stamp(wall);
      if (t !== null) core.input(stick, t);
      if (wall % 16 === 0) { core.advance(16); core.anchor(wall); }
    }
  };
  run(400);
  const before = core.simTimeUs;
  const h = Math.PI / 6;
  core.respawn({ x: -2, y: 1, z: 0.5 }, { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) });
  assert.ok(core.simTimeUs < before, 'a respawn is a new instance: its clock starts over (the page must not read a negative dt)');
  const s = core.getState();
  assert.deepEqual([s.position.x, s.position.y, s.position.z], [-2, 1, 0.5], 'the spawn pose before any tick');
  assert.ok(near(s.quaternion.z, Math.sin(h)));
  assert.equal(core.link.up, true);
  run(100);
  core.setArm(true);
  run(100);
  assert.equal(core.getState().armed, true, `armed 100 ms after a respawn (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  // The page's three modes reach Betaflight: ANGLE on AUX2, HORIZON on AUX4.
  for (const mode of ['horizon', 'acro', 'angle']) {
    core.setMode(mode);
    run(40);
    assert.equal(core.getState().flightMode, mode);
  }
  // A teleport with no attitude keeps the latest tick's.
  const q = core.sim.state.quat;
  core.teleport({ x: 3, y: 0, z: 1 });
  const s2 = core.getState();
  assert.ok(near(s2.quaternion.w, q[0], 1e-9) && near(s2.quaternion.z, q[3], 1e-9));
});

// Turtle on the bf core: Betaflight's crash flip, FLIP OVER AFTER CRASH on
// AUX3, on a flat floor. The page's 4 ms poll and 60 Hz frames; each poll
// steps the turtle before input(), as sim.html's pollInput does.
async function turtleRig() {
  const db = tunes();
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync('vendor/sim-core/sim-core.wasm'),
    airframe: JSON.parse(readFileSync('vendor/sim-core/airframes/air65.json', 'utf8')),
    diff: db.cliFor(db.tunes.find((t) => t.id === '65-betafpv-ryfly-1219s')),
    world: { floorZ: 0 },
  });
  const rig = { core, stick: { r: 0, p: 0, y: 0, t: 0 }, wall: 0, events: [] };
  rig.upZ = () => {
    const [, x, y] = core.sim.state.quat;
    return 1 - 2 * (x * x + y * y);
  };
  rig.run = (ms, each) => {
    for (const end = rig.wall + ms; rig.wall < end; rig.wall += 4) {
      const t = core.stamp(rig.wall);
      if (core.turtlePhase) {
        const ev = core.stepTurtle(rig.stick.t < 0.05);
        if (ev) rig.events.push(ev);
      }
      if (t !== null) core.input(rig.stick, t);
      if (rig.wall % 16 === 0) { core.advance(16); core.anchor(rig.wall); }
      if (each) each();
    }
  };
  // Inverted (180 degrees about body X), dropped from 5 cm, at rest.
  rig.flip = () => {
    core.teleport({ x: 0, y: 0, z: 0.05 }, { x: 1, y: 0, z: 0, w: 0 });
    rig.run(1500);
    assert.ok(rig.upZ() < -0.99, `inverted at rest (up Z ${rig.upZ().toFixed(3)})`);
  };
  return rig;
}

test('bf core turtle: inverted at rest, AUX3 high, full roll: upright by 500 ms; AUX3 low: it rests upright', async () => {
  const rig = await turtleRig();
  const { core } = rig;
  rig.run(400);
  rig.flip();
  core.setTurtle(true);
  rig.run(100);
  core.setArm(true);
  rig.run(300);
  assert.equal(core.getState().armed, true, `armed inverted with AUX3 high (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  assert.equal(core.getState().crashFlip, true, 'in crash flip');
  rig.stick = { r: 1, p: 0, y: 0, t: 0 };
  let uprightMs = null;
  const t0 = rig.wall;
  rig.run(500, () => { if (uprightMs === null && rig.upZ() > 0.9) uprightMs = rig.wall - t0; });
  assert.ok(uprightMs !== null, `upright within 500 ms of full roll (up Z ${rig.upZ().toFixed(3)})`);
  core.setTurtle(false);
  rig.stick = { r: 0, p: 0, y: 0, t: 0 };
  let minUp = 1;
  const t1 = rig.wall;
  rig.run(1500, () => { if (rig.wall - t1 > 500) minUp = Math.min(minUp, rig.upZ()); });
  assert.ok(minUp > 0.95, `rests upright over the last second (lowest up Z ${minUp.toFixed(3)})`);
  assert.ok(Math.hypot(...core.sim.state.omega) < 0.01, 'at rest');
});

test('bf core turtle, as the page runs it: from the gesture while armed, and from an arm while flipped', async () => {
  const rig = await turtleRig();
  const { core } = rig;
  rig.run(400);
  // Armed, flipped onto the floor; the gesture: full throttle, full roll.
  core.setArm(true);
  rig.run(200);
  assert.equal(core.getState().armed, true);
  rig.flip();
  assert.equal(core.getState().armed, true, 'still armed, upside down');
  rig.stick = { r: 1, p: 0, y: 0, t: 1 };
  core.startTurtle();
  assert.equal(core.turtlePhase, 'disarm');
  let uprightMs = null;
  const t0 = rig.wall;
  rig.run(1000, () => { if (uprightMs === null && rig.upZ() > 0.9) uprightMs = rig.wall - t0; });
  assert.ok(uprightMs !== null && uprightMs <= 500, `upright ${uprightMs} ms after the gesture`);
  assert.deepEqual(rig.events, ['flip', 'upright']);
  assert.equal(core.turtlePhase, 'rearm', 'AUX3 and AUX1 low; waits for the throttle');
  assert.equal(core.getState().armed, false);
  assert.equal(core.aux.turtle, false);
  // Throttle down: armed again, out of crash flip, resting upright.
  rig.stick = { r: 0, p: 0, y: 0, t: 0 };
  rig.run(1500);
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  assert.equal(core.turtlePhase, null);
  let s = core.getState();
  assert.equal(s.armed, true, `armed to fly (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  assert.equal(s.crashFlip, false);
  assert.ok(rig.upZ() > 0.95, `upright (up Z ${rig.upZ().toFixed(3)})`);
  // Disarmed and flipped: an arm is a turtle (the card's small_angle 25 would
  // refuse a plain arm with ANGLE).
  core.setArm(false);
  rig.run(200);
  rig.flip();
  rig.events = [];
  core.startTurtle();
  assert.equal(core.turtlePhase, 'arm');
  rig.run(100);
  assert.deepEqual(rig.events, ['flip']);
  rig.stick = { r: -1, p: 0, y: 0, t: 0 };
  rig.run(1000);
  rig.stick = { r: 0, p: 0, y: 0, t: 0 };
  rig.run(1500);
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  s = core.getState();
  assert.equal(s.armed, true, `armed to fly (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  assert.ok(rig.upZ() > 0.95, `upright (up Z ${rig.upZ().toFixed(3)})`);
  // A disarm ends a turtle at any step.
  core.setArm(false);
  rig.run(200);
  rig.flip();
  core.startTurtle();
  rig.run(100);
  core.setArm(false);
  assert.equal(core.turtlePhase, null);
  assert.equal(core.aux.turtle, false);
});

test('quadphysics FF: 4 ms samples at 1 kHz ticks get the same feedforward as 60 fps frames', () => {
  // Acro roll ramp 0 -> 670 deg/s over 150 ms on the page's whoop65 stock
  // tune; omega mid-ramp (100 ms, 6 frames at 60 fps) per path. With the old
  // FF window each 4 ms sample overwrote the last: about 17 % short here.
  const TUNE = { rollP: 36, rollI: 61, rollD: 27, pitchP: 37, pitchI: 64, pitchD: 29, yawP: 36, yawI: 61, yawD: 0, rollF: 120, pitchF: 128, yawF: 160 };
  const ramp = (t) => Math.min(1, t / 0.15) * 670 * Math.PI / 180;
  const fly = (perTick) => {
    const qp = new QuadPhysics(PRESETS.whoop65);
    qp.setTune(TUNE);
    qp.setPhysicsHz(1000);
    qp.setFlightMode('acro');
    qp.windowedYawFF = perTick;
    qp.reset({ x: 0, y: 0, z: 5 });
    qp.arm();
    const thr = 0.35;
    if (perTick) {
      let held = 0;
      for (let k = 0; k < 100; k++) {
        if (k % 4 === 0) held = ramp(k / 1000);
        qp.step(0.001, { roll: held, pitch: 0, yaw: 0 }, thr, { r: 0, p: 0, y: 0 });
      }
    } else {
      for (let f = 0; f < 6; f++) qp.step(1 / 60, { roll: ramp((f + 1) / 60), pitch: 0, yaw: 0 }, thr, { r: 0, p: 0, y: 0 });
    }
    return qp.omega.x;
  };
  const frame = fly(false);
  const tick = fly(true);
  assert.ok(Math.abs(tick - frame) / Math.abs(frame) < 0.05, `omega at 100 ms: per tick ${tick.toFixed(2)}, per frame ${frame.toFixed(2)} rad/s`);
});

test('the page versions the vendored sim-core with its VERSION', () => {
  const html = readFileSync('sim.html', 'utf8');
  const m = html.match(/const SIM_CORE_VERSION='([^']+)'/);
  assert.ok(m, 'SIM_CORE_VERSION in sim.html');
  assert.equal(m[1], readFileSync('vendor/sim-core/VERSION', 'utf8').trim());
});
