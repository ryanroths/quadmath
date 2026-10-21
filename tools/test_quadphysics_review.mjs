// Physics-review claims: pitch sign, PID dt, fps-independent rise, rate reach.
// node --test tools/test_quadphysics_review.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  QuadPhysics, PRESETS, DEFAULT_TUNE, PHYSICS_HZ_DEFAULT, PHYSICS_HZ_FAST,
  STICK_SMOOTH_TAU,
} from '../quadphysics.js';
import { rateSetpoint, parseCli, SETPOINT_LIMIT } from '../sim-rates.js';
import { applyAxisMap, AETR_MAP, mapStickAxes } from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = readFileSync(join(root, 'sim.html'), 'utf8');

const DEG = 180 / Math.PI;
const BF = { rcRate: 1.10, srate: 0.72, expo: 0.25 };
const FULL_DPS = rateSetpoint('BETAFLIGHT', 1, BF);

function hoverCollective(preset = PRESETS.whoop65) {
  const out = Math.sqrt(preset.mass * 9.81 / (preset.maxThrustPerMotor * 4));
  const idle = preset.idleThrottle;
  return Math.max(0, Math.min(1, (out - idle) / (1 - idle)));
}

function pageSetpoint(stick, signs) {
  const s = signs || pageSigns();
  const dps = (ax, x) => rateSetpoint('BETAFLIGHT', x, BF);
  const yr = dps('yaw', stick.y) * Math.PI / 180;
  const wx = dps('pitch', stick.p) * Math.PI / 180;
  const wz = -(dps('roll', stick.r) * Math.PI / 180);
  const wy = -yr;
  return { roll: s.roll * wz, pitch: s.pitch * wx, yaw: s.yaw * wy };
}

function pageSigns() {
  const m = simSrc.match(/const SGN_ROLL\s*=\s*(-?\d+)\s*,\s*SGN_PITCH\s*=\s*(-?\d+)\s*,\s*SGN_YAW\s*=\s*(-?\d+)/);
  assert.ok(m, 'SGN_* signs not found in sim.html');
  return { roll: +m[1], pitch: +m[2], yaw: +m[3] };
}

function makeAcro(hz = 500) {
  const qp = new QuadPhysics(PRESETS.whoop65, DEFAULT_TUNE);
  qp.setFlightMode('acro');
  qp.setPhysicsHz(hz);
  qp.reset({ x: 0, y: 0, z: 4 });
  qp.arm();
  return qp;
}

test('pitch stick forward is +stick.p on radio, touch, and keyboard', () => {
  const radio = applyAxisMap([0, -1, 0, 0], AETR_MAP);
  assert.ok(radio.p > 0.9, `radio pitch-forward stick.p=${radio.p}`);
  const touch = mapStickAxes({ x: 0, y: 0 }, { x: 0, y: 1 }, 2);
  assert.ok(touch.p > 0.9, `touch stick-up stick.p=${touch.p}`);
  assert.ok(/tP=\(keys\['arrowup'\]\?1:0\)-\(keys\['arrowdown'\]\?1:0\)/.test(simSrc));
});

test('full path: pitch stick forward = fly forward (+X), not inverted', () => {
  const signs = pageSigns();
  assert.equal(signs.pitch, 1, 'SGN_PITCH must be +1 so stick-up commands +pitch');
  const stick = { r: 0, p: 1, y: 0 };
  const sp = pageSetpoint(stick, signs);
  assert.ok(sp.pitch > 0, `setpoint.pitch ${sp.pitch} should be > 0`);

  const qp = makeAcro(500);
  const hover = hoverCollective();
  const dt = 1 / qp.physicsHz;
  for (let i = 0; i < Math.round(0.22 / dt); i++) qp.step(dt, sp, hover, stick);
  assert.ok(qp.velocity.x > 0.15, `module +X vel ${qp.velocity.x.toFixed(3)} — stick-up must fly forward`);
  assert.ok(qp.attitude.pitch > 0.2, `attitude pitch ${qp.attitude.pitch} should tilt thrust +X`);
});

test('Angle mode stick-up also leans toward +X', () => {
  const qp = new QuadPhysics(PRESETS.whoop65, DEFAULT_TUNE);
  qp.setFlightMode('angle');
  qp.setPhysicsHz(500);
  qp.reset({ x: 0, y: 0, z: 3 });
  qp.arm();
  const hover = hoverCollective();
  const dt = 1 / qp.physicsHz;
  for (let i = 0; i < Math.round(0.8 / dt); i++) {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 0 }, hover, { r: 0, p: 1, y: 0 });
  }
  assert.ok(qp.attitude.pitch > 0.4, `angle pitch ${qp.attitude.pitch}`);
  assert.ok(qp.velocity.x > 0.1, `angle +X vel ${qp.velocity.x}`);
});

test('PID dt follows 500→1000 Hz even while armed', () => {
  const qp = new QuadPhysics(PRESETS.whoop65, DEFAULT_TUNE);
  assert.equal(qp.physicsHz, PHYSICS_HZ_DEFAULT);
  qp.arm();
  assert.equal(qp.pid.pitch.dt, 1 / PHYSICS_HZ_DEFAULT);
  qp.setPhysicsHz(PHYSICS_HZ_FAST);
  assert.equal(qp.physicsHz, PHYSICS_HZ_FAST);
  assert.equal(qp.physicsDt, 1 / PHYSICS_HZ_FAST);
  assert.equal(qp.pid.pitch.dt, 1 / PHYSICS_HZ_FAST);
  assert.equal(qp.pid.roll.dt, 1 / PHYSICS_HZ_FAST);
  assert.equal(qp.pid.yaw.dt, 1 / PHYSICS_HZ_FAST);
});

function riseTimeAtFps(fps, frac = 0.9) {
  const qp = makeAcro(500);
  const hover = hoverCollective();
  const stick = { r: 0, p: 1, y: 0 };
  const sp = pageSetpoint(stick);
  const target = Math.abs(sp.pitch);
  const frameDt = 1 / fps;
  for (let i = 0; i < 30; i++) qp.step(1 / qp.physicsHz, { roll: 0, pitch: 0, yaw: 0 }, hover, { r: 0, p: 0, y: 0 });
  let phys = 0, tHit = null;
  const inner = qp.substep.bind(qp);
  qp.substep = function () { phys += qp.physicsDt; return inner(); };
  let wall = 0;
  while (wall < 0.45) {
    qp.step(frameDt, sp, hover, stick);
    wall += frameDt;
    if (tHit == null && Math.abs(qp.omega.y) >= frac * target) tHit = phys;
  }
  return tHit;
}

test('full-stick rise time is fps-independent within ~10% (30/60/144/240)', () => {
  assert.ok(STICK_SMOOTH_TAU > 0 && STICK_SMOOTH_TAU < 0.04);
  const times = [30, 60, 144, 240].map((fps) => {
    const t = riseTimeAtFps(fps, 0.9);
    assert.ok(t != null, `${fps} fps never reached 90%`);
    return t;
  });
  const mid = times.slice().sort((a, b) => a - b)[1];
  for (let i = 0; i < times.length; i++) {
    const fps = [30, 60, 144, 240][i];
    const err = Math.abs(times[i] - mid) / mid;
    assert.ok(err <= 0.10, `${fps} fps rise ${times[i].toFixed(3)} vs mid ${mid.toFixed(3)} (${(err * 100).toFixed(1)}%)`);
  }
});

test('full stick reaches >= 95% of commanded rate', () => {
  assert.ok(FULL_DPS > 750 && FULL_DPS < 820, `full dps ${FULL_DPS}`);
  const qp = makeAcro(500);
  const hover = hoverCollective();
  const stick = { r: 0, p: 1, y: 0 };
  const sp = pageSetpoint(stick);
  const dt = 1 / qp.physicsHz;
  for (let i = 0; i < Math.round(0.50 / dt); i++) qp.step(dt, sp, hover, stick);
  const ratio = Math.abs(qp.omega.y / sp.pitch);
  assert.ok(ratio >= 0.94, `reached ${(ratio * 100).toFixed(1)}% of ${Math.abs(sp.pitch * DEG).toFixed(0)} °/s`);
});

test('isolated yaw is not 10× too strong — tracks like pitch', () => {
  const qp = makeAcro(500);
  const hover = hoverCollective();
  const stick = { r: 0, p: 0, y: 1 };
  const sp = pageSetpoint(stick);
  const dt = 1 / qp.physicsHz;
  for (let i = 0; i < Math.round(0.45 / dt); i++) qp.step(dt, sp, hover, stick);
  const ratio = Math.abs(qp.omega.z / sp.yaw);
  assert.ok(ratio < 1.25, `yaw ${ratio.toFixed(2)}× setpoint — 10× claim is false`);
  assert.ok(ratio > 0.80, `yaw only reached ${(ratio * 100).toFixed(1)}%`);
});

test('imported F=120 matches the unified Betaflight F scale', () => {
  assert.match(simSrc, /rollF:120/);
  assert.ok(!/rollF:15[,}]/.test(simSrc.replace(/rollF:120/g, '')), 'old 15-scale tokens must be gone');
  const parsed = parseCli('set f_roll = 120\nset f_pitch = 125\nset f_yaw = 120\n');
  assert.equal(parsed.pids.rollF, 120);
  assert.equal(DEFAULT_TUNE.rollF, 120);
});

test('1998 deg/s cap applies to every rates_type', () => {
  assert.equal(SETPOINT_LIMIT, 1998);
  const crazy = { rcRate: 2.5, srate: 0.99, expo: 0 };
  assert.ok(Math.abs(rateSetpoint('BETAFLIGHT', 1, crazy)) <= 1998);
  assert.ok(Math.abs(rateSetpoint('ACTUAL', 1, { rcRate: 25, srate: 250, expo: 0 })) <= 1998);
  assert.ok(Math.abs(rateSetpoint('RACEFLIGHT', 1, { rcRate: 255, srate: 0.99, expo: 0 })) <= 1998);
});
