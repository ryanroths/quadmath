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
import { rateSetpoint, parseCli, SETPOINT_LIMIT, actualRate } from '../sim-rates.js';
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

test('full-stick rise time is whoop-fast at 60 and 144 fps', () => {
  // Interpolate-only: no extra tau. Both fps must reach 90% inside the whoop window.
  assert.equal(STICK_SMOOTH_TAU, 0);
  const t60 = riseTimeAtFps(60, 0.9);
  const t144 = riseTimeAtFps(144, 0.9);
  assert.ok(t60 != null && t144 != null, `rise 60=${t60} 144=${t144}`);
  assert.ok(t60 >= 0.008 && t60 <= 0.080, `60 fps t90 ${t60.toFixed(3)} s`);
  assert.ok(t144 >= 0.008 && t144 <= 0.080, `144 fps t90 ${t144.toFixed(3)} s`);
});

test('full stick reaches >= 98% of commanded rate', () => {
  assert.ok(FULL_DPS > 750 && FULL_DPS < 820, `full dps ${FULL_DPS}`);
  const qp = makeAcro(500);
  const hover = hoverCollective();
  const stick = { r: 0, p: 1, y: 0 };
  const sp = pageSetpoint(stick);
  const dt = 1 / qp.physicsHz;
  for (let i = 0; i < Math.round(0.35 / dt); i++) qp.step(dt, sp, hover, stick);
  const ratio = Math.abs(qp.omega.y / sp.pitch);
  assert.ok(ratio >= 0.98, `reached ${(ratio * 100).toFixed(1)}% of ${Math.abs(sp.pitch * DEG).toFixed(0)} °/s`);
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

// Ryan's hand-flown Actual: center 40, max R/P 740 Y 700, expo 0.56.
// Stored units are CLI (center/10, max/10) — same as Betaflight applyActualRates.
const RYAN_ROLL = { rcRate: 4, srate: 74, expo: 0.56 };
const RYAN_YAW = { rcRate: 4, srate: 70, expo: 0.56 };
const STOCK65 = {
  rollP: 36, rollI: 61, rollD: 27, pitchP: 37, pitchI: 64, pitchD: 29,
  yawP: 36, yawI: 61, yawD: 0, rollF: 120, pitchF: 128, yawF: 160,
};

test('Actual formula matches Betaflight applyActualRates for Ryan\'s numbers', () => {
  // BF: center = rcRates*10, max = rates*10, expo CLI/100.
  // angleRate = x*center + max(0,max-center)*abs(x)*(x^5*expo + x*(1-expo))
  assert.equal(actualRate(1, 40, 740, 0.56), 740);
  assert.equal(actualRate(-1, 40, 740, 0.56), -740);
  assert.equal(actualRate(1, 40, 700, 0.56), 700);
  assert.equal(rateSetpoint('ACTUAL', 1, RYAN_ROLL), 740);
  assert.equal(rateSetpoint('ACTUAL', 1, RYAN_YAW), 700);
  assert.equal(actualRate(0, 40, 740, 0.56), 0);
  const mid = actualRate(0.5, 40, 740, 0.56);
  const bfMid = 0.5 * 40 + 700 * 0.5 * (Math.pow(0.5, 5) * 0.56 + 0.5 * 0.44);
  assert.ok(Math.abs(mid - bfMid) < 1e-9, `mid ${mid} vs BF ${bfMid}`);
  assert.ok(mid > 90 && mid < 130, `mid-stick ${mid} (expo 0.56 soft centre)`);
  const q = 0.25;
  const bfQ = q * 40 + 700 * q * (Math.pow(q, 5) * 0.56 + q * 0.44);
  assert.ok(Math.abs(actualRate(q, 40, 740, 0.56) - bfQ) < 1e-9);
});

function ryanFullStickRoll(fps) {
  const qp = new QuadPhysics(PRESETS.whoop65, STOCK65);
  qp.setFlightMode('acro');
  qp.setPhysicsHz(500);
  qp.reset({ x: 0, y: 0, z: 4 });
  qp.arm();
  const hover = hoverCollective();
  const tgt = rateSetpoint('ACTUAL', 1, RYAN_ROLL) * Math.PI / 180;
  const fd = 1 / fps;
  let t725 = null, peak = 0, phys = 0;
  const inner = qp.substep.bind(qp);
  qp.substep = function () { phys += qp.physicsDt; return inner(); };
  for (let i = 0; i < 40; i++) qp.step(1 / qp.physicsHz, { roll: 0, pitch: 0, yaw: 0 }, hover, { r: 0, p: 0, y: 0 });
  let wall = 0;
  while (wall < 0.20) {
    qp.step(fd, { roll: tgt, pitch: 0, yaw: 0 }, hover, { r: 1, p: 0, y: 0 });
    wall += fd;
    const dps = Math.abs(qp.omega.x) * DEG;
    if (dps > peak) peak = dps;
    if (t725 == null && dps >= 725) t725 = phys;
  }
  return { t725, peak, held: Math.abs(qp.omega.x) * DEG };
}

test('Ryan Actual full-stick roll >= 725 deg/s within 150 ms', () => {
  for (const fps of [60, 144]) {
    const r = ryanFullStickRoll(fps);
    assert.ok(r.t725 != null && r.t725 <= 0.150,
      `${fps} fps: 725 °/s at ${r.t725 == null ? 'never' : (r.t725 * 1000).toFixed(0) + ' ms'} (peak ${r.peak.toFixed(0)})`);
    assert.ok(r.held >= 725, `${fps} fps: held ${r.held.toFixed(1)} °/s at 200 ms`);
    assert.ok(r.held / 740 >= 0.98, `${fps} fps: held ${(r.held / 740 * 100).toFixed(1)}% of 740`);
  }
});
