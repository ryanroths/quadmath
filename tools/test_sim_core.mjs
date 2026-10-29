// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// sim-core-adapter.js: the render boundary (module Z-up to scene Y-up), the
// 4 ms poll's sim-time stamps, the bf core's RC channels (a radio's AUX as it
// sends them, or the page's on the diff's own switches), the bf core on the
// vendored quadmath-sim-core (the Air65 on the owner's full diff: its sag
// compensation, thrust linear and dynamic idle) from stick forward to +X, a
// radio's arm and mode switches, its turtle (Betaflight's crash flip), and the
// js core's fixed 1 kHz ticks, sample-and-hold input and render interpolation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.min.js';
import {
  WS, toScene, toModule, boxToModule, InputClock, bfChannels, createBfCore, createJsCore, armingFlagNames, contactPlant,
  auxRanges, pageAux, radioAux, rangeActive, AUX_CHANNELS, FLIP_STICK,
} from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { applyAxisMap, AETR_MAP, PAD_MAP, RADIO_PRESETS } from '../sim-touch.js';

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

// The owner's Air65 diff, as the page loads it (vendored from
// quadmath-sim-core configs/), and its aux lines as Betaflight prints them.
const OWNER_DIFF = readFileSync('vendor/sim-core/configs/air65-ryfly-2026-10-23.txt', 'utf8');
const OWNER_AUX = auxRanges(OWNER_DIFF);

test('auxRanges and pageAux: the page\'s switches on the diff\'s own aux lines', () => {
  // ARM AUX1, ANGLE AUX2, BEEPER and FLIP OVER AFTER CRASH AUX3; no HORIZON.
  assert.deepEqual(OWNER_AUX, [
    { box: 0, ch: 0, lo: 1700, hi: 2100, and: false }, { box: 1, ch: 1, lo: 1700, hi: 2100, and: false },
    { box: 13, ch: 2, lo: 1700, hi: 2100, and: false }, { box: 35, ch: 2, lo: 1700, hi: 2100, and: false },
  ]);
  assert.deepEqual(pageAux(OWNER_AUX, { arm: true, angle: true }).slice(0, 4), [2000, 2000, 1000, 1000]);
  assert.deepEqual(pageAux(OWNER_AUX, { flip: true }).slice(0, 4), [1000, 1000, 2000, 1000]);
  assert.deepEqual(pageAux(OWNER_AUX, { horizon: true }).slice(0, 4), [1000, 1000, 1000, 1000], 'no HORIZON switch: acro');
  // Betaflight's 25 us steps and the empty range.
  assert.deepEqual(auxRanges('aux 0 0 0 1710 2110 0 0\naux 1 1 1 1500 1500 0 0\naux 2 2 12 900 2100 0 0'), [{ box: 0, ch: 0, lo: 1700, hi: 2100, and: false }]);
  assert.equal(rangeActive({ lo: 1700, hi: 2100 }, 2100), true, 'clamped to 2099');
  assert.equal(rangeActive({ lo: 1700, hi: 2100 }, 1699), false);
  // A three-position mode switch, a PREARM with ARM, and a BEEPER left down.
  const three = auxRanges([
    'aux 0 0 0 1700 2100 0 0', 'aux 1 36 4 1700 2100 0 0', 'aux 2 1 1 900 1300 0 0',
    'aux 3 2 1 1300 1700 0 0', 'aux 4 13 5 1700 2100 0 0',
  ].join('\n'));
  assert.deepEqual(pageAux(three, { arm: true, angle: true }).slice(0, 6), [2000, 1000, 1000, 1000, 2000, 1000]);
  assert.equal(pageAux(three, { horizon: true })[1], 1500);
  assert.equal(pageAux(three, {})[1], 2000, 'acro: neither range');
  assert.equal(pageAux(three, {})[4], 1000, 'PREARM off with ARM');
  // ARM on AUX1 AND AUX5 (logic 1): both switches go on.
  const both = auxRanges('aux 0 0 0 1700 2100 1 0\naux 1 0 4 1700 2100 1 0');
  assert.deepEqual(pageAux(both, { arm: true }).slice(0, 5), [2000, 1000, 1000, 1000, 2000]);
  // A range the page cannot reach within sim-core's 1000..2000 stays off,
  // and every value stays in range (sim-core refuses anything else).
  const high = auxRanges('aux 0 0 0 2025 2100 0 0');
  assert.ok(pageAux(high, { arm: true }).every((v) => v >= 1000 && v <= 2000));
});

test('bfChannels: sticks 1:1; AUX the radio\'s as sent, or the page\'s on the diff', () => {
  const ch = bfChannels({ r: 0.5, p: 0.3, y: -1, t: 0.25 }, { arm: true, mode: 'angle', turtle: false }, OWNER_AUX);
  assert.equal(ch.length, 4 + AUX_CHANNELS);
  assert.deepEqual(ch.slice(0, 8), [1750, 1650, 1000, 1250, 2000, 2000, 1000, 1000]);
  assert.deepEqual(bfChannels({ r: 0, p: 0, y: 0, t: 0 }, { arm: false, mode: 'acro', turtle: true }, OWNER_AUX).slice(4, 8), [1000, 1000, 2000, 1000]);
  assert.equal(bfChannels({ r: 0, p: 0, y: 0, t: 0.9 }, { holdThrottle: true, mode: 'acro' }, OWNER_AUX)[3], 1000);
  // A radio's AUX pass through as they are; the page's arm and hold stand aside.
  const radio = bfChannels({ r: 0, p: 0, y: 0, t: 0.9, aux: [1000, 2000, 1500, 1234] }, { arm: true, holdThrottle: true, mode: 'angle' }, OWNER_AUX);
  assert.deepEqual(radio.slice(3, 9), [1900, 1000, 2000, 1500, 1234, 1000]);
  assert.deepEqual(armingFlagNames((1 << 7) | (1 << 25)), ['THROTTLE', 'ARM_SWITCH']);
});

test('radioAux: the axes the stick map leaves free, in order, unchanged; none from a gamepad', () => {
  const tx = { id: 'RM TX16S Joystick', axes: [0, 0, -1, 0, 1, -1, 0.5, -0.2] };
  assert.deepEqual(radioAux(tx, AETR_MAP), [2000, 1000, 1750, 1400], 'TX16S: CH5..CH8 on AUX1..AUX4');
  // TAER: throttle on axis 0, the sticks on 1..3.
  assert.deepEqual(radioAux({ axes: [-1, 0, 0, 0, 1, 1, -1, -1] }, RADIO_PRESETS.literadioTaer.map), [2000, 2000, 1000, 1000]);
  assert.equal(radioAux({ axes: [0, 0, 0, 0, 1, 1] }, PAD_MAP), null, 'a gamepad (spring throttle)');
  assert.equal(radioAux({ axes: [0, 0, -1, 0] }, AETR_MAP), null, 'no axis left for a switch');
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

// The bf core as the page builds it: the vendored module, the Air65 and the
// owner's diff.
const ownerCore = () => createBfCore({
  SimCore,
  wasm: readFileSync('vendor/sim-core/sim-core.wasm'),
  airframe: JSON.parse(readFileSync('vendor/sim-core/airframes/air65.json', 'utf8')),
  diff: OWNER_DIFF,
  world: { floorZ: 0 },
});

test('bf core loads the owner\'s full Air65 diff: vbat_sag_compensation 70, thrust_linear 20, dynamic idle on', async () => {
  const core = await ownerCore();
  assert.ok(tunes().tunes.find((t) => t.id === '65-betafpv-ryfly-1219s'), 'the tune-database card the page names stays');
  // The diff's hardware lines (board, OSD, VTX, blackbox) have no sim target.
  assert.ok(core.report.applied >= 99, `${core.report.applied} lines applied`);
  assert.deepEqual(core.report.added, [], 'its own aux lines: sim-core adds none');
  const got = core.sim.get(['vbat_sag_compensation', 'thrust_linear', 'dyn_idle_min_rpm', 'dshot_bidir', 'small_angle'], { profile: 0 });
  assert.equal(got.vbat_sag_compensation, '70');
  assert.equal(got.thrust_linear, '20');
  assert.equal(got.dyn_idle_min_rpm, '55');
  assert.equal(got.dshot_bidir, 'ON', 'RPM telemetry, which dynamic idle runs on');
  assert.equal(core.sim.fc.rpmFilter, true);
  // Dynamic idle at work: armed at zero throttle, the motors hold its
  // minimum (55 x 100 rpm), above the idle the same diff gives without it.
  const idleRpm = async (c) => {
    let wall = 0;
    const run = (ms) => { for (const end = wall + ms; wall < end; wall += 4) { const t = c.stamp(wall); if (t !== null) c.input({ r: 0, p: 0, y: 0, t: 0 }, t); if (wall % 16 === 0) { c.advance(16); c.anchor(wall); } } };
    run(400);
    c.setArm(true);
    run(2000);
    assert.equal(c.sim.fc.armed, true, `armed (flags ${armingFlagNames(c.sim.fc.armingDisableFlags)})`);
    return c.sim.state.rpm.reduce((a, b) => a + b, 0) / 4;
  };
  const on = await idleRpm(core);
  core.loadDiff(OWNER_DIFF + '\nprofile 0\nset dyn_idle_min_rpm = 0\n');
  const off = await idleRpm(core);
  assert.ok(Math.abs(on - 5500) / 5500 < 0.05, `armed idle ${on.toFixed(0)} rpm, dynamic idle's floor 5500`);
  assert.ok(on > off + 300, `idle ${on.toFixed(0)} rpm with dynamic idle, ${off.toFixed(0)} without`);
});

test('the 65-betafpv-ryfly-1219s card is the diff the bf core flies, on every field the card carries', async () => {
  const card = tunes().tunes.find((t) => t.id === '65-betafpv-ryfly-1219s');
  const core = await ownerCore();
  const axes = ['roll', 'pitch', 'yaw'];
  // Read back from Betaflight with the diff applied: profile 0 ('1219S') and
  // rateprofile 0, so unset values are Betaflight's own defaults (d_yaw).
  const keys = ['rates_type', 'tpa_rate', 'thrust_linear', 'vbat_sag_compensation', 'dyn_idle_min_rpm', 'd_min_roll', 'd_min_pitch',
    'dshot_bidir', 'motor_pwm_protocol', 'gyro_lpf1_static_hz', 'gyro_lpf1_dyn_min_hz',
    'dyn_notch_count', 'dyn_notch_q', 'dyn_notch_min_hz', 'dyn_notch_max_hz', 'craft_name'];
  for (const a of axes) keys.push(`p_${a}`, `i_${a}`, `d_${a}`, `f_${a}`, `${a}_rc_rate`, `${a}_srate`, `${a}_expo`);
  const bf = core.sim.get(keys, { profile: 0, rateprofile: 0 });
  assert.equal(card.rateType, bf.rates_type);
  for (const a of axes) {
    assert.deepEqual([...card.pids[a]], [+bf[`p_${a}`], +bf[`i_${a}`], +bf[`d_${a}`]], `${a} P/I/D`);
    assert.deepEqual([...card.rates[a]], [+bf[`${a}_rc_rate`], +bf[`${a}_srate`], +bf[`${a}_expo`]], `${a} rc_rate/srate/expo`);
  }
  // The page's ?rates=card.<id> alias is a copy of the card's rates.
  const { RATE_CARDS } = await import('../sim-rates.js');
  const alias = RATE_CARDS['65-betafpv-ryfly-1219s'];
  assert.equal(alias.type, card.rateType);
  for (const a of axes) assert.deepEqual([...alias[a]], [...card.rates[a]], `alias ${a}`);
  // The notes' numbers are the diff's too.
  const notes = card.notes.join(' | ');
  assert.ok(notes.includes(`D-min R${bf.d_min_roll}/P${bf.d_min_pitch}`), notes);
  assert.ok(notes.includes(`TPA ${bf.tpa_rate}`), notes);
  assert.ok(notes.includes(`FF R${bf.f_roll}/P${bf.f_pitch}/Y${bf.f_yaw}`), notes);
  assert.ok(notes.includes(`Thrust linear ${bf.thrust_linear}`), notes);
  assert.ok(notes.includes(`Vbat sag comp ${bf.vbat_sag_compensation}`), notes);
  assert.ok(notes.includes(`Dyn idle ${bf.dyn_idle_min_rpm}`), notes);
  assert.equal(bf.dshot_bidir, 'ON');
  assert.ok(notes.includes(`RPM filter ON, bidir ${bf.motor_pwm_protocol}`), notes);
  assert.ok(bf.gyro_lpf1_static_hz === '0' && bf.gyro_lpf1_dyn_min_hz === '0' && notes.includes('Gyro LPF1 off'), notes);
  assert.ok(notes.includes(`Dyn notch ${bf.dyn_notch_count}×Q${bf.dyn_notch_q} ${bf.dyn_notch_min_hz}–${bf.dyn_notch_max_hz}hz`), notes);
  assert.ok(notes.includes(`Board: ${bf.craft_name}`), notes);
  assert.ok(!/crash recovery on|ff off/i.test(notes), notes);
});

test('the 65-betafpv-ryfly-hq31 card is profile 1 of the same diff, with its one rate profile', async () => {
  const card = tunes().tunes.find((t) => t.id === '65-betafpv-ryfly-hq31');
  const core = await ownerCore();
  const axes = ['roll', 'pitch', 'yaw'];
  const keys = ['rates_type', 'tpa_rate', 'd_min_roll', 'd_min_pitch'];
  for (const a of axes) keys.push(`p_${a}`, `i_${a}`, `d_${a}`, `f_${a}`, `${a}_rc_rate`, `${a}_srate`, `${a}_expo`);
  const bf = core.sim.get(keys, { profile: 1, rateprofile: 0 });
  assert.equal(card.rateType, bf.rates_type);
  for (const a of axes) {
    assert.deepEqual([...card.pids[a]], [+bf[`p_${a}`], +bf[`i_${a}`], +bf[`d_${a}`]], `${a} P/I/D`);
    assert.deepEqual([...card.rates[a]], [+bf[`${a}_rc_rate`], +bf[`${a}_srate`], +bf[`${a}_expo`]], `${a} rc_rate/srate/expo`);
  }
  const notes = card.notes.join(' | ');
  assert.ok(notes.includes(`D-min R${bf.d_min_roll}/P${bf.d_min_pitch}`), notes);
  assert.ok(notes.includes(`TPA ${bf.tpa_rate}`), notes);
  assert.ok(axes.every((a) => bf[`f_${a}`] === '0') && notes.includes('FF off'), notes);
});

test('bf core: TX16S stick forward is pitch above 1500, a nose-down rate, and +X (scene forward)', async () => {
  const core = await ownerCore();
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
  stick = applyAxisMap(tx16s({ p: 0.6, t: 0.43 }), AETR_MAP, { deadzone: 0 });
  assert.ok(stick.p > 0.59, `the preset map reads stick forward as +p (${stick.p})`);
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
  const core = await ownerCore();
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
  // The page's modes reach Betaflight on the diff's switches: ANGLE on AUX2,
  // acro with it off. The owner's diff has no HORIZON switch.
  assert.deepEqual(['angle', 'horizon', 'acro'].map((m) => core.hasMode(m)), [true, false, true]);
  assert.deepEqual([core.auxOf('arm'), core.auxOf('angle'), core.auxOf('flip')], [1, 2, 3]);
  for (const mode of ['acro', 'angle']) {
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

test('bf core with a radio: its arm and mode switches reach Betaflight as sent; a switch left on through a respawn does not arm', async () => {
  const core = await ownerCore();
  let wall = 0;
  const run = (ms, sample) => {
    for (const end = wall + ms; wall < end; wall += 4) {
      const t = core.stamp(wall);
      if (t !== null) core.input(sample, t);
      if (wall % 16 === 0) { core.advance(16); core.anchor(wall); }
    }
  };
  // A TX16S on its preset map: CH5 (AUX1) arm, CH6 (AUX2) angle.
  const radio = (ch5, ch6) => {
    const axes = [0, 0, -1, 0, ch5, ch6, -1, -1];
    return { ...applyAxisMap(axes, AETR_MAP, { deadzone: 0 }), aux: radioAux({ axes }, AETR_MAP) };
  };
  run(400, radio(-1, 1));
  core.setArm(true);
  run(300, radio(-1, 1));
  assert.equal(core.sim.fc.armed, false, 'the page\'s arm intent does not reach Betaflight');
  assert.equal(core.auxSource, 'radio');
  run(300, radio(1, 1));
  assert.equal(core.sim.fc.armed, true, `armed on the radio's switch (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  assert.equal(core.sim.fc.mode.angle, true);
  run(100, radio(1, -1));
  assert.equal(core.sim.fc.mode.angle, false, 'angle switch off: acro');
  core.respawn({ x: 0, y: 0, z: 0.05 }, { x: 0, y: 0, z: 0, w: 1 });
  run(1500, radio(1, 1));
  assert.equal(core.sim.fc.armed, false, 'the switch was on through the boot');
  assert.ok(armingFlagNames(core.sim.fc.armingDisableFlags).includes('ARM_SWITCH'), armingFlagNames(core.sim.fc.armingDisableFlags).join(' '));
  run(300, radio(-1, 1));
  run(300, radio(1, 1));
  assert.equal(core.sim.fc.armed, true, 'armed once the switch is cycled');
  // Back to the keyboard: the page drives AUX again, its arm intent fresh.
  run(100, { r: 0, p: 0, y: 0, t: 0 });
  assert.equal(core.auxSource, 'page');
  assert.equal(core.sim.fc.armed, false);
  // The radio taking over again with its ARM switch already on (a pad that
  // shows up mid-session, or plugged back in): Betaflight's guard holds.
  run(300, radio(1, 1));
  assert.equal(core.auxSource, 'radio');
  assert.equal(core.sim.fc.armed, false, 'an ARM switch already on does not arm');
  assert.ok(armingFlagNames(core.sim.fc.armingDisableFlags).includes('NOT_DISARMED'), armingFlagNames(core.sim.fc.armingDisableFlags).join(' '));
  run(300, radio(-1, 1));
  run(300, radio(1, 1));
  assert.equal(core.sim.fc.armed, true, 'armed once the switch is cycled');
});

// Turtle on the bf core: Betaflight's crash flip, on the owner's FLIP OVER
// AFTER CRASH switch (AUX3), on a flat floor, with the page driving AUX (the
// keyboard's fallback). The page's 4 ms poll and 60 Hz frames; each poll
// steps the turtle before input(), as sim.html's pollInput does.
async function turtleRig() {
  const core = await ownerCore();
  const rig = { core, stick: { r: 0, p: 0, y: 0, t: 0 }, wall: 0, events: [] };
  rig.upZ = () => {
    const [, x, y] = core.sim.state.quat;
    return 1 - 2 * (x * x + y * y);
  };
  rig.run = (ms, each) => {
    for (const end = rig.wall + ms; rig.wall < end; rig.wall += 4) {
      const t = core.stamp(rig.wall);
      if (core.turtlePhase) {
        const st = rig.stick;
        const ev = core.stepTurtle(st.t < 0.05, Math.abs(st.r) < 0.15 && Math.abs(st.p) < 0.15 && Math.abs(st.y) < 0.15);
        if (ev) rig.events.push(ev);
      }
      if (t !== null) core.input(rig.stick, t);
      if (rig.wall % 16 === 0) { core.advance(16); core.anchor(rig.wall); }
      if (each) each();
    }
  };
  // Inverted (180 degrees about body X), dropped from 5 cm, at rest. The
  // teleport is made disarmed, so Betaflight's attitude estimate (which a
  // teleport skips) settles on the accelerometer as it does at rest, as if
  // the quad had rolled over; then the arm intent is put back.
  rig.flip = () => {
    const armed = core.aux.arm;
    core.setArm(false);
    rig.run(100);
    core.teleport({ x: 0, y: 0, z: 0.05 }, { x: 1, y: 0, z: 0, w: 0 });
    rig.run(1500);
    assert.ok(rig.upZ() < -0.99, `inverted at rest (up Z ${rig.upZ().toFixed(3)})`);
    if (armed) {
      core.setArm(true);
      rig.run(300);
    }
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

// The gesture while armed: full throttle and a full roll stick on its back.
async function gestureTurtle() {
  const rig = await turtleRig();
  const { core } = rig;
  rig.run(400);
  core.setArm(true);
  rig.run(200);
  assert.equal(core.getState().armed, true);
  rig.flip();
  assert.equal(core.getState().armed, true, 'armed upside down (the owner\'s small_angle 180)');
  rig.stick = { r: 1, p: 0, y: 0, t: 1 };
  core.startTurtle();
  assert.equal(core.turtlePhase, 'disarm');
  let uprightMs = null;
  const t0 = rig.wall;
  rig.run(1000, () => { if (uprightMs === null && rig.upZ() > 0.9) uprightMs = rig.wall - t0; });
  assert.ok(uprightMs !== null && uprightMs <= 500, `upright ${uprightMs} ms after the gesture`);
  assert.deepEqual(rig.events, ['flip', 'upright']);
  assert.equal(core.turtlePhase, 'rearm', 'FLIP and ARM off; waits for the throttle');
  assert.equal(core.getState().armed, false);
  assert.equal(core.aux.turtle, false);
  // Throttle down: armed again, out of crash flip.
  rig.stick = { r: 0, p: 0, y: 0, t: 0 };
  rig.run(1500);
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  assert.equal(core.turtlePhase, null);
  const s = core.getState();
  assert.equal(s.armed, true, `armed to fly (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  assert.equal(s.crashFlip, false);
  return rig;
}

test('bf core turtle, as the page runs it, from the gesture while armed: upright, re-armed', async () => {
  const rig = await gestureTurtle();
  assert.ok(rig.upZ() > 0.95, `upright (up Z ${rig.upZ().toFixed(3)})`);
});

// sim-core v0.3.0's gyro reads the rotation the attitude makes, floor contacts
// included. Before, contact fed it rates the quad never turned at, Betaflight's
// estimate walked, and the quad rolled onto its side about 2.5 s after this
// re-arm.
test('bf core turtle from the gesture: stays upright for 4 s armed at idle on the floor', async () => {
  const rig = await gestureTurtle();
  let minUp = 1;
  rig.run(4000, () => { minUp = Math.min(minUp, rig.upZ()); });
  assert.ok(minUp > 0.95, `lowest up Z over 4 s: ${minUp.toFixed(3)}`);
  assert.equal(rig.core.getState().armed, true);
});

test('bf core turtle, as the page runs it, from an arm while flipped: upright, re-armed, stays upright 4 s; a disarm ends it', async () => {
  const rig = await turtleRig();
  const { core } = rig;
  rig.run(400);
  // Disarmed and flipped: an arm is a turtle (the owner's small_angle 180 would
  // let a plain arm through, but not into crash flip).
  rig.flip();
  core.startTurtle();
  assert.equal(core.turtlePhase, 'arm');
  rig.run(100);
  assert.deepEqual(rig.events, ['flip']);
  rig.stick = { r: -1, p: 0, y: 0, t: 0 };
  rig.run(1000);
  // The roll stick still over: no re-arm until it is centred.
  assert.equal(core.getState().armed, false);
  rig.stick = { r: 0, p: 0, y: 0, t: 0 };
  rig.run(1500);
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  const s = core.getState();
  assert.equal(s.armed, true, `armed to fly (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  let minUp = 1;
  rig.run(4000, () => { minUp = Math.min(minUp, rig.upZ()); });
  assert.ok(minUp > 0.95, `rests upright for 4 s armed at idle (lowest up Z ${minUp.toFixed(3)})`);
  assert.equal(core.getState().armed, true);
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

// F, the sim's flip (a sim assist): the sim drives AUX3, the arm and the roll.
// The pilot's sticks stay centred, throttle down, as a keyboard left alone.
test('bf core F flip, as the page runs it, from inverted at rest disarmed: AUX3, arm, roll; upright within 500 ms of the roll; crash flip ended, re-armed; counted once', async () => {
  const rig = await turtleRig();
  const { core } = rig;
  rig.run(400);
  rig.flip();
  assert.equal(core.getState().armed, false);
  assert.equal(core.startFlip(), true);
  assert.deepEqual([core.turtlePhase, core.turtleAuto, core.aux.turtle, core.aux.arm], ['arm', true, true, true], 'AUX3 and AUX1 high');
  let rollAt = null;
  let uprightMs = null;
  let rollUs = 0;
  let again = null;
  rig.run(1500, () => {
    if (core.turtlePhase === 'flip') {
      if (rollAt === null) rollAt = rig.wall;
      rollUs = Math.max(rollUs, core.sim.fc.rcData[0]);
      if (again === null) again = core.startFlip();
    }
    if (rollAt !== null && uprightMs === null && rig.upZ() > 0.9) uprightMs = rig.wall - rollAt;
  });
  assert.ok(rollAt !== null, 'armed into crash flip');
  assert.equal(rollUs, 1500 + 500 * FLIP_STICK, 'the sim\'s roll reached Betaflight');
  assert.ok(uprightMs !== null && uprightMs <= 500, `upright ${uprightMs} ms after the roll began`);
  assert.equal(again, 'busy', 'F again mid-flip starts nothing');
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  assert.equal(core.turtlePhase, null);
  assert.equal(core.turtleAuto, false);
  assert.equal(core.aux.turtle, false, 'AUX3 low');
  const s = core.getState();
  assert.equal(s.crashFlip, false, 'crash flip ended');
  assert.equal(s.armed, true, `armed to fly (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  assert.equal(core.simFlips, 1, 'one F flip, counted once');
  // The sticks are the pilot's again, and it rests upright armed at idle.
  rig.stick = { r: -0.3, p: 0, y: 0, t: 0 };
  rig.run(40);
  assert.equal(core.sim.fc.rcData[0], 1350);
  rig.stick = { r: 0, p: 0, y: 0, t: 0 };
  let minUp = 1;
  rig.run(2000, () => { minUp = Math.min(minUp, rig.upZ()); });
  assert.ok(minUp > 0.95, `rests upright armed at idle (lowest up Z ${minUp.toFixed(3)})`);
  assert.equal(core.getState().armed, true);
});

// Upright, F does nothing on the core (the page gives F its old job there,
// the next flight mode); inverted in the air (a flip, a fall) it is not on
// the floor, so no turtle and no disarm in the air.
test('bf core F flip: upright and armed, or inverted in the air, F changes nothing', async () => {
  const rig = await turtleRig();
  const { core } = rig;
  rig.run(400);
  core.setArm(true);
  rig.run(300);
  assert.equal(core.getState().armed, true);
  assert.equal(core.startFlip(), 'not-flipped');
  assert.deepEqual([core.turtlePhase, core.turtleAuto, core.aux.turtle, core.aux.arm, core.simFlips], [null, false, false, true, 0]);
  rig.run(500);
  const s = core.getState();
  assert.equal(s.armed, true, 'still armed');
  assert.equal(s.crashFlip, false);
  assert.ok(rig.upZ() > 0.99, `still level (up Z ${rig.upZ().toFixed(3)})`);
  core.teleport({ x: 0, y: 0, z: 1.5 }, { x: 1, y: 0, z: 0, w: 0 });
  rig.run(16);
  assert.ok(rig.upZ() < -0.9 && core.sim.state.groundClearance > 1, 'inverted, 1.5 m up');
  assert.equal(core.startFlip(), 'not-flipped');
  assert.equal(core.turtlePhase, null);
  rig.run(16);
  assert.equal(core.getState().armed, true, 'no disarm in the air');
  assert.equal(core.simFlips, 0);
});

test('bf core F flip: a disarm (Space) or a respawn (R) ends it, the sticks back to the pilot; F takes over the roll of a turtle the pilot started', async () => {
  const rig = await turtleRig();
  const { core } = rig;
  const toRoll = () => { for (let n = 0; n < 200 && core.turtlePhase !== 'flip'; n++) rig.run(4); rig.run(40); };
  rig.run(400);
  // Space mid-roll: the page's toggleArm (coreArmed through a turtle) disarms.
  rig.flip();
  assert.equal(core.startFlip(), true);
  toRoll();
  assert.equal(core.turtlePhase, 'flip');
  core.setArm(false);
  assert.deepEqual([core.turtlePhase, core.turtleAuto, core.aux.turtle, core.aux.arm], [null, false, false, false]);
  rig.stick = { r: -0.3, p: 0, y: 0, t: 0 };
  rig.run(300);
  assert.equal(core.sim.fc.rcData[0], 1350, 'the pilot\'s roll, not the sim\'s');
  assert.equal(core.getState().armed, false);
  assert.equal(core.getState().crashFlip, false);
  rig.stick = { r: 0, p: 0, y: 0, t: 0 };
  // R mid-roll: the page's resetQuad respawns the core.
  rig.flip();
  assert.equal(core.startFlip(), true);
  toRoll();
  core.respawn({ x: 0, y: 0, z: 0.05 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual([core.turtlePhase, core.turtleAuto, core.aux.turtle, core.aux.arm], [null, false, false, false]);
  rig.run(300);
  assert.equal(core.getState().armed, false);
  assert.equal(core.getState().crashFlip, false);
  // Space while flipped starts the pilot's turtle (tryArm); F then rolls it.
  rig.events.length = 0;
  rig.flip();
  assert.equal(core.startTurtle(), true);
  toRoll();
  assert.equal(core.turtleAuto, false);
  assert.ok(rig.upZ() < -0.9, 'waits on its back for the pilot\'s roll');
  assert.equal(core.startFlip(), true);
  rig.run(1500);
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  assert.equal(core.getState().armed, true);
  assert.equal(core.simFlips, 3, 'each F that started counted once');
});

test('bf core F flip: one that cannot come up (a ceiling over it) gives up after 3 s, FLIP and ARM off', async () => {
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync('vendor/sim-core/sim-core.wasm'),
    airframe: JSON.parse(readFileSync('vendor/sim-core/airframes/air65.json', 'utf8')),
    diff: OWNER_DIFF,
    world: { floorZ: 0, boxes: [{ min: [-1, -1, 0.05], max: [1, 1, 0.5] }] },
  });
  let wall = 0;
  const events = [];
  const run = (ms) => {
    for (const end = wall + ms; wall < end; wall += 4) {
      const t = core.stamp(wall);
      if (core.turtlePhase) { const ev = core.stepTurtle(true, true); if (ev) events.push(ev); }
      if (t !== null) core.input({ r: 0, p: 0, y: 0, t: 0 }, t);
      if (wall % 16 === 0) { core.advance(16); core.anchor(wall); }
    }
  };
  run(400);
  core.teleport({ x: 0, y: 0, z: 0.02 }, { x: 1, y: 0, z: 0, w: 0 });
  run(1500);
  assert.equal(core.startFlip(), true);
  run(2900);
  assert.deepEqual(events, ['flip'], 'still trying at 2.9 s');
  run(400);
  assert.deepEqual(events, ['flip', 'stuck']);
  assert.deepEqual([core.turtlePhase, core.turtleAuto, core.aux.turtle, core.aux.arm], [null, false, false, false]);
  assert.equal(core.getState().armed, false);
  assert.equal(core.getState().crashFlip, false);
});

// The page's side, in the source (tools/test_sim_map_boot.mjs boots it).
test('the page: F is flipKey: a bf flip logged once as a sim assist, else the next flight mode; no board rule', () => {
  const html = readFileSync('sim.html', 'utf8').replace(/\r\n/g, '\n');
  assert.ok(html.includes("if(e.key.toLowerCase()==='f')flipKey();"));
  assert.equal(html.split("==='f')").length - 1, 1, 'nothing else on F');
  const fk = html.slice(html.indexOf('function flipKey(){'), html.indexOf('function noteSimFlip(){'));
  assert.ok(fk.includes('const r=core.startFlip();\n  if(r===true)noteSimFlip();'));
  assert.equal(fk.split('noteSimFlip()').length - 1, 1, 'logged only for an F that started a flip');
  assert.ok(fk.includes("else if(r==='not-flipped')toggleFlightMode();"));
  assert.ok(fk.includes("toast('SIM FLIP IS ON THE BF CORE ONLY')"), 'the js core: a toast, no flip');
  const note = html.slice(html.indexOf('function noteSimFlip(){'), html.indexOf('setInterval(pollInput,4);'));
  assert.ok(note.includes('if(runActive)runSimFlips++;'));
  assert.ok(note.includes("toast('SIM FLIP — SIM ASSIST'"));
  assert.ok(note.includes("console.info('sim assist: F flip '"));
  assert.equal(html.split('noteSimFlip();').length - 1, 1, 'one caller');
  // Kept with the run: reset at its start, stored and shown with its result.
  const start = html.slice(html.indexOf('function startRun(){'), html.indexOf('function finishRun(){'));
  assert.ok(start.includes('runSimFlips=0;'));
  const finish = html.slice(html.indexOf('function finishRun(){'), html.indexOf('function liveTrackIds(){'));
  assert.ok(finish.includes('lastRunSimFlips[id]=runSimFlips;'));
  assert.ok(finish.includes("(runSimFlips?' · SIM FLIP ×'+runSimFlips:'')"));
  assert.ok(html.includes("if(lastRunSimFlips[id])html+='<br>SIM ASSIST · F FLIP ×'+lastRunSimFlips[id];"));
  assert.ok(html.includes("else if(ev==='stuck')toast('SIM FLIP STUCK — R RESPAWNS');"));
  // No board rule for assists yet: what decides the boards does not read it.
  const boards = html.slice(html.indexOf('function noteRetentionFinish'), html.indexOf('async function maybeSubmitOnline'));
  assert.ok(!/SimFlip/.test(boards) && !/SimFlip/.test(html.slice(html.indexOf('function runOffBoards'), html.indexOf('function runOffBoards') + 200)));
  assert.ok(html.includes('const counted=runCountsForBoards(threeD);'));
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

// tools/test_sim_map_boot.mjs flies both in headless Chrome; this is the
// contract in the source, for the job that skips Chrome.
test('the bf core is the default; ?core=js is deprecated; the OSD names the js core', () => {
  const html = readFileSync('sim.html', 'utf8');
  assert.match(html, /const CORE_KIND=new URLSearchParams\(location\.search\)\.get\('core'\)==='js'\?'js':'bf';/);
  assert.match(html, /if\(CORE_KIND==='js'\)console\.warn\('sim-core: \?core=js is deprecated, removed next release/);
  assert.ok(html.includes("cs.kind==='bf'?'BF CORE · AIR65<br>':'JS CORE<br>'"), 'osdTR names the core either way');
  assert.ok(html.includes("const BF_CLASS='whoop65';"), 'only the 65 has a sim-core plant');
});

test('a js-core run on the 65 stays off the boards (PHYS MISMATCH); Tune hides the rates on bf behind IMPORT CLI', () => {
  const html = readFileSync('sim.html', 'utf8').replace(/\r\n/g, '\n');
  // Any js-core time in a run that lands on a 65 board (the build's class), not
  // the class name; the 75 and 85 boards are js boards.
  assert.ok(html.includes("function runOffBoards(){return (runSawJs||core.kind==='js')&&classId(currentBuild&&currentBuild.frameMm)===DRONE_TYPES[BF_CLASS].frame;}"));
  const start = html.slice(html.indexOf('function startRun(){'), html.indexOf('function startRun(){') + 80);
  assert.ok(start.includes("runSawJs=core.kind==='js';"));
  assert.ok(html.includes("if(runActive&&core.kind==='js')runSawJs=true;"));
  const finish = html.slice(html.indexOf('function noteRetentionFinish'), html.indexOf('async function maybeSubmitOnline'));
  assert.ok(finish.includes('const offBoards=runOffBoards();'));
  // Weekly: neither the local board nor the online submit.
  assert.ok(finish.includes("if(isWeeklyTrackId(id)&&offBoards){\n    extra=(extra?extra+' · ':'')+'PHYS MISMATCH';\n  }else if(isWeeklyTrackId(id)){"));
  assert.ok(finish.indexOf('if(isWeeklyTrackId(id)&&offBoards)') < finish.indexOf('recordLocalBoard('));
  // Daily Line: not counted at all, neither the local PB nor the online board.
  assert.ok(finish.includes("if(String(id)===String(today.trackId)&&offBoards){\n      extra=(extra?extra+' · ':'')+'PHYS MISMATCH';\n    }else if(String(id)===String(today.trackId)){"));
  assert.ok(finish.indexOf('&&offBoards){') < finish.indexOf('recordDailyLineFinish('));

  // IMPORT CLI on bf: to Betaflight on top of the owner's diff, ahead of the js
  // parse (Betaflight decides), refused while loading or armed, js rates untouched.
  const imp = html.slice(html.indexOf('function importCli(text){'), html.indexOf('function importCli(text){') + 120);
  assert.ok(imp.includes('if(bfWanted()&&!bfFailed)return importCliToBf(text);'));
  assert.ok(imp.indexOf('importCliToBf') < imp.indexOf('parseCli') || imp.indexOf('parseCli') === -1);
  const toBf = html.slice(html.indexOf('function importCliToBf(text){'), html.indexOf('function importCli(text){'));
  // Set lines on top of the owner's diff; a full diff (from `defaults`) in its place.
  assert.ok(html.includes("function bfDiffWith(text){return !text?bfDiff():bfPasteReplaces(text)?text:bfDiff()+'\\n'+text;}"));
  assert.ok(toBf.includes("r=bfLoadDiff(bfDiffWith(text),'CLI import');"));
  assert.ok(toBf.includes("if(!bfCore){"));
  assert.ok(toBf.includes("setCliStatus('DISARM TO LOAD A DIFF — Betaflight did not take it','err');"));
  // A boot fault restores what flew; the count is the paste's own changing lines.
  assert.ok(toBf.includes('}catch(e){') && toBf.indexOf('bfLoadDiff(prev,label());') < toBf.indexOf("if(!r){"));
  assert.ok(toBf.includes('const took=mine.filter(bfLineChanges).length;'));
  for (const js of ['saveRates', 'rates[ax]', 'qp.setTune']) assert.ok(!toBf.includes(js), 'the bf import leaves the js core alone: ' + js);
  assert.ok(html.includes("const want=bfWantDiff();\n      if(bfDiff()&&want!==bfDiffLoaded)bfLoadDiff(want,bfCliText?'CLI import':BF_TUNE_ID);"));

  const css = 'body.bf-core .rates-js,body:not(.bf-core) .rates-bf{display:none!important}';
  assert.ok(html.includes(css));
  const rates = html.slice(html.indexOf('<div class="rates-js">'), html.indexOf('<h2>Paste Betaflight CLI dump</h2>'));
  for (const id of ['ratesType', 'ax_roll', 's_rc', 's_sr', 's_ex', 'rateCurve']) assert.ok(rates.includes(`id="${id}"`), id + ' is in the js-only rates');
  assert.match(html, /<p class="build-note rates-bf">[^<]*IMPORT CLI[^<]*<\/p>/);
  assert.ok(html.includes('<select id="ratePreset" class="rates-js">'));
  assert.ok(html.includes('id="btnRatesShare" class="rates-js"'));
  assert.ok(html.includes("function syncCoreUI(){document.body.classList.toggle('bf-core',core.kind==='bf');}"));
  // After every core switch in selectCore and the bf load.
  const select = html.slice(html.indexOf('function selectCore'), html.indexOf('// ---------- Input poll'));
  assert.equal(select.split('syncCoreUI();').length - 1, 3);
});

// The Rig's bounce walls on the bf core: its plant gets the same contact
// profile as the js core (sim-whoop.js BOUNCE_MAPS), and Betaflight reboots on it.
test('contactPlant scales the plant for a bounce map; setPlant reconfigures', async () => {
  const air65 = JSON.parse(readFileSync('vendor/sim-core/airframes/air65.json', 'utf8'));
  assert.equal(contactPlant(air65, null), air65);
  const rig = contactPlant(air65, { crash: 4, bounce: 2 });
  assert.equal(rig.values.crashScale.value, air65.values.crashScale.value * 4);
  assert.equal(rig.values.bounceScale.value, air65.values.bounceScale.value * 2);
  assert.equal(rig.values.spinScale, air65.values.spinScale);
  assert.equal(rig.values.mass, air65.values.mass);
  assert.equal(air65.values.crashScale.value, 1.0310150949352062, 'the airframe itself is untouched');
  const diff = readFileSync('vendor/sim-core/configs/air65-ryfly-2026-10-23.txt', 'utf8');
  const bf = await createBfCore({ SimCore, wasm: readFileSync('vendor/sim-core/sim-core.wasm'), airframe: air65, diff, world: { floorZ: 0, boxes: [], triggers: [] } });
  const r = bf.setPlant(rig);
  assert.ok(r && r.applied > 0, 'Betaflight booted on the bounce plant');
  assert.equal(bf.getState().armed, false);
  // Into a wall, nose on: the stock plant crashes at 4 m/s; the Rig's bounces
  // off at 4 and 8 m/s and still crashes at 12.
  const wall = { floorZ: 0, boxes: [{ min: [1.0, -2, 0], max: [1.3, 2, 3] }], triggers: [] };
  const hit = async (plant, v) => {
    const core = await createBfCore({ SimCore, wasm: readFileSync('vendor/sim-core/sim-core.wasm'), airframe: plant, diff, world: wall });
    core.teleport({ x: 0.6, y: 0, z: 1.5 }, { x: 0, y: 0, z: 0, w: 1 }, { x: v, y: 0, z: 0 });
    const ev = [];
    for (let i = 0; i < 25; i++) core.advance(16, true, (e) => ev.push(e));
    const contacts = ev.filter((e) => e.kind === 'contact');
    assert.ok(contacts.length > 0, 'reached the wall at ' + v);
    return { crashed: contacts.some((e) => e.crashed), vx: core.getState().velocity.x };
  };
  assert.equal((await hit(air65, 4)).crashed, true);
  for (const v of [4, 8]) {
    const b = await hit(rig, v);
    assert.equal(b.crashed, false, 'rig crashed at ' + v);
    assert.ok(b.vx < 0, 'rig bounced back at ' + v);
  }
  assert.equal((await hit(rig, 12)).crashed, true);
});
