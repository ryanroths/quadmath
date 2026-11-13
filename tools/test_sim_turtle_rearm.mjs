// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Easy mode's turtle on the bf core: from upright to flyable in under 300 ms,
// on the sim clock, read at every tick.
//
// The bf core ticks at 1 kHz (TICK_US). Here it is stepped one tick at a time
// with no frames: advance(1) per tick, the input sampled every 4 ms of sim
// time as the page polls (SAMPLE_US), stepTurtle on each sample as the page's
// pollInput does. Upright is the first tick whose attitude has up Z over 0.9;
// flyable is the first tick after it that Betaflight is armed with the turtle
// over and crash flip off. Both are read after every tick, so the time between
// them is exact to the tick. (The Chrome tests in tools/test_sim_easy_mode.mjs
// read the page once per poll, and the page steps the core once per frame, so
// a slow runner's frames show there as tens of ms added to each end.)
//
//   node tools/test_sim_turtle_rearm.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBfCore, TICK_US, SAMPLE_US } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DIFF = readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8');
const LIMIT_MS = 300;
const SAMPLE_MS = SAMPLE_US / 1000;

async function tickRig({ mode, boxes = [] }) {
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8')),
    diff: DIFF,
    world: { floorZ: 0, boxes },
  });
  core.setMode(mode);
  const rig = { core, stick: { r: 0, p: 0, y: 0, t: 0 }, events: [], wall: 0, each: null };
  rig.upZ = () => { const [, x, y] = core.sim.state.quat; return 1 - 2 * (x * x + y * y); };
  // ms of sim time, one tick per step.
  rig.run = (ms) => {
    for (const end = rig.wall + ms; rig.wall < end;) {
      if (rig.wall % SAMPLE_MS === 0) {
        const tUs = core.stamp(rig.wall);
        if (core.turtlePhase) {
          const e = core.stepTurtle(rig.stick.t < 0.05, true);
          if (e) rig.events.push(e);
        }
        if (tUs !== null) core.input(rig.stick, tUs);
      }
      const before = core.simTimeUs;
      core.advance(TICK_US / 1000);
      assert.equal(core.simTimeUs - before, TICK_US, 'one tick per step');
      rig.wall += TICK_US / 1000;
      core.anchor(rig.wall);
      if (rig.each) rig.each();
    }
  };
  rig.run(400);
  return rig;
}

// The time from upright to flyable, to the tick, and the throttle channel's
// highest value in between.
function toFlyable(rig) {
  const { core } = rig;
  let upUs = null, flyUs = null, heldThr = 0;
  rig.each = () => {
    const f = core.sim.fc;
    if (upUs === null && rig.upZ() > 0.9) upUs = core.simTimeUs;
    if (upUs !== null && flyUs === null) {
      if (f.armed && core.turtlePhase === null && !f.crashFlip) flyUs = core.simTimeUs;
      else heldThr = Math.max(heldThr, Math.round(f.rcData[3]));
    }
  };
  rig.run(2000);
  rig.each = null;
  return { ms: upUs !== null && flyUs !== null ? (flyUs - upUs) / 1000 : null, heldThr };
}

function check(rig, out, label) {
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm'], `${label}: the turtle's steps`);
  assert.ok(out.ms !== null, `${label}: upright and flyable`);
  assert.ok(out.ms < LIMIT_MS, `${label}: upright to flyable ${out.ms} ms of sim time (limit ${LIMIT_MS})`);
  assert.ok(out.heldThr <= 1000, `${label}: throttle channel held low until armed (${out.heldThr})`);
  assert.equal(rig.core.getState().armed, true, `${label}: armed`);
  assert.equal(rig.core.getState().crashFlip, false, `${label}: crash flip over`);
  assert.ok(rig.upZ() > 0.9, `${label}: upright (${rig.upZ().toFixed(3)})`);
}

// On its back with a few degrees of lean, as a quad that got there by rolling.
// (Dead flat by teleport, Betaflight's estimate is a full 180 degrees out and
// in angle mode ARM waits for it; tools/test_sim_easy_mode.mjs covers that.)
for (const [name, mode, start, thr] of [
  ['the roll stick, in acro, throttle left up', 'acro', (c) => c.startEasyTurtle(1, 0), 0.6],
  ['the pitch stick, in angle, throttle left up', 'angle', (c) => c.startEasyTurtle(0, -1), 0.6],
  ['the pitch stick, in angle, throttle at half', 'angle', (c) => c.startEasyTurtle(0, -1), 0.5],
  ['the roll stick, in angle, throttle down', 'angle', (c) => c.startEasyTurtle(1, 0), 0],
  ['F, in angle', 'angle', (c) => c.startFlip(), 0.6],
]) {
  test(`bf core, on its back, ${name}: upright to flyable under ${LIMIT_MS} ms of sim time, to the tick`, async () => {
    const rig = await tickRig({ mode });
    const half = (180 - 4) * Math.PI / 360;
    rig.core.teleport({ x: 0, y: 0, z: 0.05 }, { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) });
    rig.run(1500);
    assert.ok(rig.upZ() < -0.5, `on its back (up Z ${rig.upZ().toFixed(3)})`);
    rig.stick = { r: 0, p: 0, y: 0, t: thr };
    assert.equal(start(rig.core), true);
    const out = toFlyable(rig);
    console.log(`${name}: ${out.ms} ms`);
    check(rig, out, name);
    if (thr > 0) assert.equal(Math.round(rig.core.sim.fc.rcData[3]), 1000 + 1000 * thr, 'then the pilot\'s throttle');
  });
}

// At rest on each side, the nose and the tail, on the floor and on a slab, as
// tools/test_sim_easy_mode.mjs's Chrome rest test puts it down.
const HALF = Math.SQRT1_2;
const RESTS = [
  ['its right side', { x: HALF, y: 0, z: 0, w: HALF }],
  ['its left side', { x: -HALF, y: 0, z: 0, w: HALF }],
  ['its nose', { x: 0, y: HALF, z: 0, w: HALF }],
  ['its tail', { x: 0, y: -HALF, z: 0, w: HALF }],
];
for (const [where, boxes, top] of [['the floor', [], 0], ['a slab', [{ min: [-1, -1, 0], max: [1, 1, 0.3] }], 0.3]]) {
  for (const mode of ['acro', 'angle']) {
    test(`bf core, at rest on ${where}, in ${mode}: every side, a full roll and a full pitch, upright to flyable under ${LIMIT_MS} ms, to the tick`, async () => {
      for (const [pose, q] of RESTS) {
        for (const [stick, r, p] of [['roll', 1, 0], ['pitch', 0, -1]]) {
          const label = `${pose} on ${where}, ${stick}, ${mode}`;
          const rig = await tickRig({ mode, boxes });
          rig.core.teleport({ x: 0, y: 0, z: top + 0.1 }, q);
          rig.run(1500);
          assert.ok(rig.upZ() < 0.5, `${label}: not upright (up Z ${rig.upZ().toFixed(3)})`);
          assert.ok(rig.core.sim.state.groundClearance <= 0.04, `${label}: on the surface`);
          assert.equal(rig.core.startEasyTurtle(r, p), true, `${label}: starts`);
          const out = toFlyable(rig);
          console.log(`${label}: ${out.ms} ms`);
          check(rig, out, label);
          assert.ok(Math.abs(rig.core.sim.state.pos[2] - top) < 0.05, `${label}: still on ${where}`);
        }
      }
    });
  }
}
