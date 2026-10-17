// Unit tests for M1 Angle / Horizon / Acro in quadphysics.js.
// Node stdlib only: `node --test tools/test_quadphysics_modes.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  QuadPhysics, PRESETS, FLIGHT_MODES, ANGLE_MAX_DEG, ANGLE_P, attitudeOf,
  PHYSICS_HZ_DEFAULT, PHYSICS_HZ_FAST, PHYSICS_HZ_LEGACY, FLOATINESS_DEFAULT,
  REVERSE_THRUST_SCALE,
} from '../quadphysics.js';
import { mapThrottle3d, THREED_DEADBAND } from '../sim-3d.js';
import { RATE_PRESETS, applyRatePreset, INPUT_CHOICE_KEY, FLOATINESS_KEY } from '../sim-feel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = readFileSync(join(root, 'sim.html'), 'utf8');
const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');

function quatAxisAngle(x, y, z, angle) {
  const s = Math.sin(angle / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(angle / 2) };
}

function hoverThrottle(qp) {
  const weight = qp.cfg.mass * 9.81;
  const maxT = qp.cfg.maxThrustPerMotor * 4;
  const exp = qp.cfg.thrustExp || 2;
  const out = Math.pow(weight / maxT, 1 / exp);
  const idle = qp.cfg.idleThrottle;
  return Math.max(0, Math.min(1, (out - idle) / (1 - idle)));
}

function makeQuad(mode) {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode(mode);
  qp.reset({ x: 0, y: 0, z: 2 });
  qp.arm();
  return qp;
}

function run(qp, seconds, stick, acro, throttle) {
  const dt = 1 / qp.physicsHz;
  const steps = Math.round(seconds / dt);
  const s = stick || { r: 0, p: 0, y: 0 };
  const a = acro || { roll: 0, pitch: 0, yaw: 0 };
  const thr = throttle == null ? hoverThrottle(qp) : throttle;
  for (let i = 0; i < steps; i++) qp.step(dt, a, thr, s);
}

test('flight mode constants', () => {
  assert.deepEqual([...FLIGHT_MODES], ['angle', 'horizon', 'acro']);
  assert.equal(ANGLE_MAX_DEG, 55);
  assert.ok(ANGLE_P > 0);
});

test('attitudeOf is zero at identity and +roll about body X', () => {
  const level = attitudeOf({ x: 0, y: 0, z: 0, w: 1 });
  assert.ok(Math.abs(level.roll) < 1e-9);
  assert.ok(Math.abs(level.pitch) < 1e-9);
  const q = quatAxisAngle(1, 0, 0, 40 * Math.PI / 180);
  const att = attitudeOf(q);
  assert.ok(Math.abs(att.roll - 40 * Math.PI / 180) < 1e-6, `roll ${att.roll}`);
  assert.ok(Math.abs(att.pitch) < 1e-6, `pitch ${att.pitch}`);
});

test('Angle returns to level with zero sticks within 1 s', () => {
  const qp = makeQuad('angle');
  qp.quaternion = quatAxisAngle(1, 0, 0, 40 * Math.PI / 180);
  const before = Math.abs(qp.attitude.roll) * 180 / Math.PI;
  assert.ok(before > 35, `setup tilt was ${before.toFixed(1)} deg`);
  run(qp, 1.0, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 });
  const after = Math.hypot(qp.attitude.roll, qp.attitude.pitch) * 180 / Math.PI;
  assert.ok(after < 5, `still ${after.toFixed(2)} deg from level after 1 s`);
});

test('Angle holds level at zero sticks', () => {
  const qp = makeQuad('angle');
  run(qp, 0.5, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 });
  const tilt = Math.hypot(qp.attitude.roll, qp.attitude.pitch) * 180 / Math.PI;
  assert.ok(tilt < 2, `wandered to ${tilt.toFixed(2)} deg`);
});

test('Angle caps lean near ANGLE_MAX_DEG', () => {
  const qp = makeQuad('angle');
  run(qp, 1.2, { r: 1, p: 0, y: 0 }, { roll: 8, pitch: 0, yaw: 0 });
  const rollDeg = qp.attitude.roll * 180 / Math.PI;
  assert.ok(rollDeg > 40, `only reached ${rollDeg.toFixed(1)} deg`);
  assert.ok(rollDeg < 62, `overshot to ${rollDeg.toFixed(1)} deg (cap is 55)`);
});

test('Horizon at full stick does not self-level (allows a flip)', () => {
  const qp = makeQuad('horizon');
  run(qp, 0.45, { r: 1, p: 0, y: 0 }, { roll: 8, pitch: 0, yaw: 0 });
  const rollDeg = Math.abs(qp.attitude.roll) * 180 / Math.PI;
  assert.ok(rollDeg > 70, `horizon full-stick roll only ${rollDeg.toFixed(1)} deg — should pass the angle cap`);
});

test('Acro does not self-level with zero sticks', () => {
  const qp = makeQuad('acro');
  qp.quaternion = quatAxisAngle(1, 0, 0, 35 * Math.PI / 180);
  run(qp, 0.4, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 });
  const rollDeg = Math.abs(qp.attitude.roll) * 180 / Math.PI;
  assert.ok(rollDeg > 20, `acro self-leveled to ${rollDeg.toFixed(1)} deg`);
});

test('disarmed motors produce no thrust', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.reset({ x: 0, y: 0, z: 2 });
  assert.equal(qp.armed, false);
  qp.step(0.05, { roll: 2, pitch: 0, yaw: 0 }, 1, { r: 1, p: 0, y: 0 });
  assert.ok(qp.totalThrustN < 1e-6, `thrust ${qp.totalThrustN}`);
  qp.arm();
  qp.step(0.25, { roll: 0, pitch: 0, yaw: 0 }, 0.5, { r: 0, p: 0, y: 0 });
  assert.ok(qp.totalThrustN > 0.05, `armed thrust ${qp.totalThrustN}`);
  qp.disarm();
  qp.step(0.25, { roll: 0, pitch: 0, yaw: 0 }, 1, { r: 0, p: 0, y: 0 });
  assert.ok(qp.totalThrustN < 0.02, `post-disarm thrust ${qp.totalThrustN}`);
});

test('setFlightMode rejects unknown names', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  assert.equal(qp.setFlightMode('horizon'), 'horizon');
  assert.equal(qp.setFlightMode('nope'), 'angle');
});

test('existing localStorage keys are still referenced (not renamed)', () => {
  const keys = [
    'ryflyRates', 'ryflyRatesType', 'ryflyDroneType', 'ryflyCamCustom',
    'ryflyAxisMap_', 'ryflyRadioPreset_', 'ryflyGamepadId', 'ryflyMusicVol',
    'quadmath_bestLap_', 'quadmath_bestRun_', 'quadmath_bestGhost_',
    'quadmath_pilotName',
  ];
  for (const k of keys) {
    assert.ok(simSrc.includes(k), `sim.html lost key ${k}`);
  }
  assert.ok(feelSrc.includes('quadmathSimInputChoice'), 'new first-run key missing');
  assert.equal(INPUT_CHOICE_KEY, 'quadmathSimInputChoice');
  assert.ok(feelSrc.includes('Nothing here is copied from WebFPV'),
    'sim-feel.js must stay clean-room (no WebFPV code)');
});

test('rate presets exist and beginner is slower than race', () => {
  assert.ok(RATE_PRESETS.whoopBeginner && RATE_PRESETS.whoopRace && RATE_PRESETS.freestyle);
  assert.ok(RATE_PRESETS.whoopBeginner.roll.srate < RATE_PRESETS.whoopRace.roll.srate);
  const rates = {
    type: 'ACTUAL',
    roll: { rcRate: 9, srate: 9, expo: 9 },
    pitch: { rcRate: 9, srate: 9, expo: 9 },
    yaw: { rcRate: 9, srate: 9, expo: 9 },
  };
  assert.equal(applyRatePreset(rates, 'whoopBeginner'), true);
  assert.equal(rates.type, 'BETAFLIGHT');
  assert.equal(rates.roll.rcRate, RATE_PRESETS.whoopBeginner.roll.rcRate);
});

test('rate loop defaults to 500 Hz and can step to 1000 Hz', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  assert.equal(PHYSICS_HZ_DEFAULT, 500);
  assert.equal(PHYSICS_HZ_FAST, 1000);
  assert.equal(PHYSICS_HZ_LEGACY, 240);
  assert.equal(qp.physicsHz, 500);
  assert.equal(qp.setPhysicsHz(1000), 1000);
  assert.equal(qp.physicsHz, 1000);
  assert.equal(qp.setPhysicsHz(123), 500);
});

test('same inputs at 500 Hz are deterministic', () => {
  const runOnce = () => {
    const qp = new QuadPhysics(PRESETS.whoop65);
    qp.setFlightMode('acro');
    qp.setPhysicsHz(500);
    qp.reset({ x: 0, y: 0, z: 2 });
    qp.arm();
    run(qp, 0.4, { r: 0.4, p: -0.2, y: 0.1 }, { roll: 3, pitch: -2, yaw: 1 }, 0.6);
    return [qp.position.x, qp.position.y, qp.position.z, qp.omega.x, qp.quaternion.w];
  };
  const a = runOnce(), b = runOnce();
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i]);
});

test('Angle still levels within 1 s at 500 Hz and 1000 Hz', () => {
  for (const hz of [500, 1000]) {
    const qp = makeQuad('angle');
    qp.setPhysicsHz(hz);
    qp.quaternion = quatAxisAngle(1, 0, 0, 40 * Math.PI / 180);
    run(qp, 1.0, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 });
    const after = Math.hypot(qp.attitude.roll, qp.attitude.pitch) * 180 / Math.PI;
    assert.ok(after < 5, `${hz} Hz still ${after.toFixed(2)} deg from level`);
  }
});

test('lower floatiness coasts less (tighter stop)', () => {
  function leftover(F) {
    const qp = new QuadPhysics(PRESETS.whoop65);
    qp.setFloatiness(F);
    qp.setPhysicsHz(500);
    qp.reset({ x: 0, y: 0, z: 3 });
    qp.velocity.x = 8;
    qp.arm();
    run(qp, 0.55, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 }, 0);
    return Math.hypot(qp.velocity.x, qp.velocity.y, qp.velocity.z);
  }
  const tight = leftover(0);
  const floaty = leftover(1);
  assert.ok(tight < floaty * 0.75, `tight ${tight.toFixed(2)} vs floaty ${floaty.toFixed(2)}`);
});

test('floatiness default is tighter than the old 1.0 coast', () => {
  assert.ok(FLOATINESS_DEFAULT < 0.5);
  assert.equal(FLOATINESS_KEY, 'quadmathSimFloatiness');
  assert.ok(feelSrc.includes('quadmathSimFloatiness'));
  assert.ok(simSrc.includes('s_float'));
});

test('3D mixer has no idle at center and reverses below center', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro');
  qp.setThreeD(true);
  qp.reset({ x: 0, y: 0, z: 2 });
  qp.arm();
  run(qp, 0.25, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 }, 0);
  const idle = Math.max(...qp.motorOutputs.map((v) => Math.abs(v)));
  assert.ok(idle < 0.03, `3D center still spinning ${idle}`);
  assert.ok(Math.abs(qp.totalThrustN) < 0.01, `center thrust ${qp.totalThrustN}`);

  const up = new QuadPhysics(PRESETS.whoop65);
  up.setFlightMode('acro');
  up.setThreeD(true);
  up.reset({ x: 0, y: 0, z: 2 });
  up.arm();
  run(up, 0.35, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 }, mapThrottle3d(0.9));
  assert.ok(up.motorOutputs.every((v) => v > 0.2), `expected forward spin ${up.motorOutputs}`);
  assert.ok(up.totalThrustN > 0.05, `forward thrust ${up.totalThrustN}`);

  const dn = new QuadPhysics(PRESETS.whoop65);
  dn.setFlightMode('acro');
  dn.setThreeD(true);
  dn.reset({ x: 0, y: 0, z: 2 });
  dn.arm();
  run(dn, 0.35, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 }, mapThrottle3d(0.1));
  assert.ok(dn.motorOutputs.every((v) => v < -0.2), `expected reverse spin ${dn.motorOutputs}`);
  assert.ok(dn.totalThrustN < -0.04, `reverse thrust ${dn.totalThrustN}`);
  assert.ok(Math.abs(dn.totalThrustN) < up.totalThrustN * 1.05,
    'reverse should not be stronger than the same curve forward');
  assert.equal(REVERSE_THRUST_SCALE, 0.85);
  assert.ok(THREED_DEADBAND > 0 && THREED_DEADBAND < 0.2);
});

test('3D reverse thrust can hold inverted (acro)', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro');
  qp.setThreeD(true);
  qp.reset({ x: 0, y: 0, z: 3 });
  const s = Math.sin(Math.PI / 2);
  qp.quaternion = { x: s, y: 0, z: 0, w: 0 }; // 180° roll, body +Z is world -Z
  qp.arm();
  const thr = mapThrottle3d(0.12); // below center → reverse → world +Z when inverted
  assert.ok(thr < 0, `mapped reverse ${thr}`);
  run(qp, 0.9, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 }, thr);
  assert.ok(qp.velocity.z > -0.5, `inverted reverse should lift, vz=${qp.velocity.z.toFixed(2)}`);
  assert.ok(qp.position.z > 1.5, `dropped through the floor z=${qp.position.z.toFixed(2)}`);
});

test('2D idle floor is unchanged when 3D is off', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro');
  qp.reset({ x: 0, y: 0, z: 2 });
  qp.arm();
  run(qp, 0.25, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 }, 0);
  const min = Math.min(...qp.motorOutputs);
  assert.ok(min > 0.04, `2D idle missing, motors ${qp.motorOutputs}`);
});

test('hosted v1 ghosts are kinematic pose tracks (physics Hz does not gate them)', () => {
  function extract(name) {
    const start = simSrc.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name}() missing`);
    let i = simSrc.indexOf('{', start), depth = 0, end = -1;
    for (; i < simSrc.length; i++) {
      if (simSrc[i] === '{') depth++;
      else if (simSrc[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    return simSrc.slice(start, end);
  }
  const ghostPayloadError = new Function(`${extract('ghostPayloadError')}; return ghostPayloadError;`)();
  const hosted = JSON.parse(readFileSync(join(root, 'ghosts/track_0.json'), 'utf8'));
  assert.equal(hosted.v, 1);
  assert.ok(hosted.samples.length > 10);
  assert.equal(hosted.samples[0].length, 8, 'sample is [t,x,y,z,qx,qy,qz,qw]');
  assert.equal(ghostPayloadError(hosted, 0), null);
  // extra metadata (feel, Hz, W2 phys tag) must not break v1 playback
  const extra = Object.assign({}, hosted, { feel: 2, physicsHz: 1000, phys: 2 });
  assert.equal(ghostPayloadError(extra, 0), null);
  assert.equal(ghostPayloadError(hosted, 0), null, 'untagged hosted ghosts still replay');
  // time-index interpolation (what poseGhost does) ignores physics Hz
  const g = hosted.samples;
  const t = (g[0][0] + g[1][0]) / 2;
  const span = g[1][0] - g[0][0];
  const f = (t - g[0][0]) / span;
  const x = g[0][1] + (g[1][1] - g[0][1]) * f;
  assert.ok(Number.isFinite(x));
});

