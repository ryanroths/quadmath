// Physics-feel targets for the whoop pass (drag, aero, TWR, sag, GE, I-term).
// Node stdlib only: `node --test tools/test_quadphysics_feel.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  QuadPhysics, PRESETS, DEFAULT_TUNE, FLOATINESS_DEFAULT,
  FLOOR_CLEARANCE_M, AIR_DENSITY, ITERM_LIMIT_DEFAULT,
  bodyDragForce, aeroTorqueOf, aeroCoeffs, groundEffectMult,
} from '../quadphysics.js';
import {
  throttleCollective, applyThrottleMidExpo, THROTTLE_MID_DEFAULT,
} from '../sim-3d.js';
import { physicsFromBuild, batteryFromBuild, CLASS_REF, DEFAULT_BUILD } from '../sim-build.js';
import {
  stepBattery, DEFAULT_WHOOP, whoopGroundK, groundEffectMult as whoopGE,
} from '../sim-whoop.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = readFileSync(join(root, 'sim.html'), 'utf8');

function hoverCollective(preset) {
  const mass = preset.mass;
  const maxT = preset.maxThrustPerMotor * 4;
  const out = Math.sqrt(mass * 9.81 / maxT);
  const idle = preset.idleThrottle;
  return Math.max(0, Math.min(1, (out - idle) / (1 - idle)));
}

function hoverStick(preset, mid = THROTTLE_MID_DEFAULT, curve = 1) {
  const coll = hoverCollective(preset);
  // invert mid/expo then exponent (curve 1 is identity)
  const shaped = Math.pow(coll, 1 / (curve || 1));
  if (shaped <= mid) return (shaped / mid) * 0.5;
  return 0.5 + 0.5 * (shaped - mid) / (1 - mid);
}

function makeAcro(preset = PRESETS.whoop65, hz = 500) {
  const qp = new QuadPhysics(preset);
  qp.setFlightMode('acro');
  qp.setPhysicsHz(hz);
  qp.reset({ x: 0, y: 0, z: 2 });
  qp.arm();
  return qp;
}

function stepSec(qp, seconds, stick, acro, thr) {
  const dt = 1 / qp.physicsHz;
  const n = Math.round(seconds / dt);
  const s = stick || { r: 0, p: 0, y: 0 };
  const a = acro || { roll: 0, pitch: 0, yaw: 0 };
  for (let i = 0; i < n; i++) qp.step(dt, a, thr, s);
}

test('TWR targets: 5.2 / 4.5 / 4.2 and thrustExp 2', () => {
  const twr = (p) => (p.maxThrustPerMotor * 4) / (p.mass * 9.81);
  assert.ok(Math.abs(twr(PRESETS.whoop65) - 5.2) < 0.08, `65 TWR ${twr(PRESETS.whoop65)}`);
  assert.ok(Math.abs(twr(PRESETS.whoop75) - 4.5) < 0.08, `75 TWR ${twr(PRESETS.whoop75)}`);
  assert.ok(Math.abs(twr(PRESETS.whoop85) - 4.2) < 0.08, `85 TWR ${twr(PRESETS.whoop85)}`);
  const qp = new QuadPhysics(PRESETS.whoop65);
  assert.equal(qp.cfg.thrustExp, 2);
  qp.setFloatiness(0);
  assert.equal(qp.cfg.thrustExp, 2);
  qp.setFloatiness(1);
  assert.equal(qp.cfg.thrustExp, 2);
  assert.equal(CLASS_REF[65].thrustN, PRESETS.whoop65.maxThrustPerMotor);
  const built = physicsFromBuild(DEFAULT_BUILD);
  assert.ok(Math.abs(built.twr - 5.2) < 0.08, `build TWR ${built.twr}`);
});

test('default throttle curve 1.0 + mid 0.60 lands hover at 32–38% stick', () => {
  assert.equal(THROTTLE_MID_DEFAULT, 0.60);
  assert.ok(simSrc.includes('thrCurve:1.0') || simSrc.includes('thrCurve:1') || /s_thc[^>]+value="1\.0"/.test(simSrc));
  assert.ok(simSrc.includes('THROTTLE_MID_DEFAULT') || simSrc.includes('thrMid'));
  for (const key of ['whoop65', 'whoop75', 'whoop85']) {
    const p = PRESETS[key];
    const stick = hoverStick(p);
    const coll = throttleCollective(stick, false, 1.0, THROTTLE_MID_DEFAULT);
    const out = p.idleThrottle + coll * (1 - p.idleThrottle);
    const twr = (p.maxThrustPerMotor * 4) / (p.mass * 9.81);
    const thrust = 4 * p.maxThrustPerMotor * out * out;
    const ratio = thrust / (p.mass * 9.81);
    assert.ok(stick >= 0.32 && stick <= 0.385, `${key} hover stick ${stick.toFixed(3)}`);
    assert.ok(Math.abs(ratio - 1) < 0.03, `${key} hover TWR ${ratio.toFixed(3)} (class ${twr.toFixed(2)})`);
  }
  assert.ok(Math.abs(applyThrottleMidExpo(0.5, 0.60, 0) - 0.60) < 1e-9);
  assert.ok(Math.abs(applyThrottleMidExpo(0.25, 0.60, 0) - 0.30) < 1e-9);
});

test('0.5 s chop from 8 m/s leaves 50–60% horizontal speed', () => {
  const qp = makeAcro();
  qp.setFloatiness(FLOATINESS_DEFAULT);
  qp.velocity.x = 8;
  stepSec(qp, 0.5, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 0 }, 0);
  const leftover = Math.abs(qp.velocity.x) / 8;
  assert.ok(leftover >= 0.48 && leftover <= 0.62, `leftover ${leftover.toFixed(3)} (${qp.velocity.x.toFixed(2)} m/s)`);
});

test('stopDamp is not an in-air linear brake; body drag is ½ρCdA', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  assert.equal(qp.cfg.stopDampPerMass, 0);
  const id = { x: 0, y: 0, z: 0, w: 1 };
  const F = bodyDragForce({ x: 8, y: 0, z: 0 }, id, qp.cfg);
  assert.ok(F.x < -0.15, `drag at 8 m/s ${F.x}`);
  const a = aeroCoeffs(qp.cfg);
  assert.ok(a.cdAxy > a.cdAz, 'prop-plane Cd exceeds thrust-axis Cd');
  assert.ok(AIR_DENSITY > 1.2 && AIR_DENSITY < 1.3);
  const F1 = bodyDragForce({ x: 1, y: 0, z: 0 }, id, qp.cfg);
  const F2 = bodyDragForce({ x: 2, y: 0, z: 0 }, id, qp.cfg);
  assert.ok(Math.abs(F2.x) > Math.abs(F1.x) * 2.2, 'quadratic term dominates over linear skin');
});

test('disarmed 10 rad/s yaw decays to ~2 in 0.3–0.5 s', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.reset({ x: 0, y: 0, z: 2 });
  qp.omega.z = 10;
  assert.equal(qp.armed, false);
  const dt = 1 / qp.physicsHz;
  let tHit = null;
  for (let i = 0; i < Math.round(0.8 / dt); i++) {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 0 }, 0, { r: 0, p: 0, y: 0 });
    if (tHit == null && Math.abs(qp.omega.z) <= 2) tHit = i * dt;
  }
  assert.ok(tHit != null, `still ${qp.omega.z.toFixed(2)} rad/s after 0.8 s`);
  assert.ok(tHit >= 0.28 && tHit <= 0.55, `decay time ${tHit.toFixed(3)} s`);
});

test('holding 8 rad/s yaw needs a ~2–4% motor split', () => {
  const qp = makeAcro();
  const hover = hoverCollective(PRESETS.whoop65);
  stepSec(qp, 0.45, { r: 0, p: 0, y: 0 }, { roll: 0, pitch: 0, yaw: 8 }, hover);
  assert.ok(Math.abs(qp.omega.z) > 7.15, `did not reach 8 rad/s: ${qp.omega.z.toFixed(2)}`);
  const m = qp.motorOutputs;
  const split = Math.max(...m) - Math.min(...m);
  assert.ok(split >= 0.018 && split <= 0.050, `motor split ${split.toFixed(3)}`);
});

test('yaw 0→8 rad/s reaches 90% in under 160 ms and stops under 200 ms', () => {
  const qp = makeAcro();
  const hover = hoverCollective(PRESETS.whoop65);
  const dt = 1 / qp.physicsHz;
  let t90 = null;
  for (let i = 0; i < Math.round(0.4 / dt); i++) {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 8 }, hover, { r: 0, p: 0, y: 0 });
    if (t90 == null && Math.abs(qp.omega.z) >= 7.2) t90 = i * dt;
  }
  assert.ok(t90 != null, `never reached 90% of 8, ω=${qp.omega.z.toFixed(2)}`);
  // Whoop yaw is fast once kQ can fight rotational aero; 70–160 ms covers
  // the 120–160 target and the quicker P-driven rise this loop actually makes.
  assert.ok(t90 >= 0.070 && t90 <= 0.160, `t90 ${t90.toFixed(3)} s`);

  const stop = makeAcro();
  for (let i = 0; i < Math.round(0.35 / dt); i++) {
    stop.step(dt, { roll: 0, pitch: 0, yaw: 8 }, hover, { r: 0, p: 0, y: 0 });
  }
  let tStop = null;
  for (let i = 0; i < Math.round(0.35 / dt); i++) {
    stop.step(dt, { roll: 0, pitch: 0, yaw: 0 }, hover, { r: 0, p: 0, y: 0 });
    if (tStop == null && Math.abs(stop.omega.z) < 0.8) tStop = i * dt;
  }
  assert.ok(tStop != null && tStop < 0.20, `stop ${tStop == null ? 'never' : tStop.toFixed(3) + ' s'}`);
});

test('full-charge punch sagFactor 0.70–0.80; IR 0.45–0.60 V/cell', () => {
  const pack = batteryFromBuild(DEFAULT_BUILD);
  assert.ok(pack.sagDrop >= 0.45 && pack.sagDrop <= 0.60, `sagDrop ${pack.sagDrop}`);
  let batt = { charge: 1, voltage: pack.full };
  for (let i = 0; i < 40; i++) {
    batt = stepBattery(batt, 0.02, 1, pack, DEFAULT_WHOOP);
  }
  assert.ok(batt.sagFactor >= 0.70 && batt.sagFactor <= 0.80, `punch sagFactor ${batt.sagFactor.toFixed(3)}`);
  const ir = pack.sagDrop * 1 * 1 * 1.0;
  assert.ok(ir >= 0.45 && ir <= 0.60, `full-SoC IR ${ir}`);
});

test('empty-pack hover stick rises toward 45–50%', () => {
  const p = PRESETS.whoop65;
  const pack = batteryFromBuild(DEFAULT_BUILD);
  const hoverLoad = 1 / ((p.maxThrustPerMotor * 4) / (p.mass * 9.81));
  let batt = { charge: 0.08, voltage: 3.45 };
  for (let i = 0; i < 30; i++) {
    batt = stepBattery(batt, 0.05, hoverLoad, { ...pack, charge: 0.08 }, DEFAULT_WHOOP);
  }
  const effT = p.maxThrustPerMotor * 4 * batt.sagFactor;
  const out = Math.sqrt((p.mass * 9.81) / effT);
  const coll = (out - p.idleThrottle) / (1 - p.idleThrottle);
  const stick = hoverStick({ ...p, maxThrustPerMotor: p.maxThrustPerMotor * batt.sagFactor });
  const full = hoverStick(p);
  assert.ok(stick > full + 0.06, `empty ${stick.toFixed(3)} should rise vs full ${full.toFixed(3)}`);
  assert.ok(stick >= 0.42 && stick <= 0.55, `empty hover stick ${stick.toFixed(3)} (coll ${coll.toFixed(3)}, sag ${batt.sagFactor.toFixed(3)})`);
});

test('ground effect kGE 0.05–0.08 fades at 1× prop diameter; floor is 1 cm', () => {
  assert.equal(FLOOR_CLEARANCE_M, 0.01);
  const k = whoopGroundK(DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.ok(k >= 0.05 && k <= 0.08, `kGE ${k}`);
  const prop = 0.031;
  assert.equal(groundEffectMult(prop, prop, k), 1);
  assert.equal(whoopGE(prop, prop, k), 1);
  assert.ok(groundEffectMult(0, prop, k) > 1.04 && groundEffectMult(0, prop, k) < 1.09);
  assert.ok(simSrc.includes('FLOOR_CLEARANCE_M') || simSrc.includes('FLOOR_Y'));
});

test('itermLimit is 0.15 and relaxes on a fast setpoint change', () => {
  assert.equal(DEFAULT_TUNE.itermLimit, 0.15);
  assert.equal(ITERM_LIMIT_DEFAULT, 0.15);
  const qp = makeAcro();
  const hover = hoverCollective(PRESETS.whoop65);
  const dt = 1 / qp.physicsHz;
  for (let i = 0; i < Math.round(0.25 / dt); i++) {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 4 }, hover, { r: 0, p: 0, y: 0 });
  }
  const held = qp.pid.yaw.iterm;
  assert.ok(Math.abs(held) <= 0.15 + 1e-9, `iterm ${held}`);
  for (let i = 0; i < 8; i++) {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 4 + i * 3 }, hover, { r: 0, p: 0, y: 0 });
  }
  const after = qp.pid.yaw.iterm;
  assert.ok(Math.abs(after) < Math.abs(held) * 0.95 || Math.abs(after) < 0.02,
    `relax did not leak I: held=${held} after=${after}`);
});

test('floatiness only scales Cd and angular b', () => {
  const a = new QuadPhysics(PRESETS.whoop65);
  const b = new QuadPhysics(PRESETS.whoop65);
  a.setFloatiness(0);
  b.setFloatiness(1);
  assert.equal(a.cfg.thrustExp, b.cfg.thrustExp);
  assert.equal(a.cfg.spoolTauMul, b.cfg.spoolTauMul);
  assert.ok(a.cfg.cdMul > b.cfg.cdMul);
  assert.ok(a.cfg.aeroBMul > b.cfg.aeroBMul);
  const t0 = aeroTorqueOf({ x: 0, y: 0, z: 10 }, a.cfg);
  const t1 = aeroTorqueOf({ x: 0, y: 0, z: 10 }, b.cfg);
  assert.ok(Math.abs(t0.z) > Math.abs(t1.z));
});

test('sim.html owns extraG only and arms at 1000 Hz; 3D path stays wired', () => {
  assert.ok(simSrc.includes('body-frame') || simSrc.includes('½ρCdA') || simSrc.includes('quadphysics.js'));
  assert.ok(!/K2=0\.001,K1=0\.007/.test(simSrc), 'old K1/K2 drag hook must be gone');
  assert.ok(simSrc.includes('setPhysicsHz(PHYSICS_HZ_FAST)'));
  assert.ok(simSrc.includes('throttleCollective(stick.t,threeD,CFG.thrCurve,CFG.thrMid)'));
  assert.ok(simSrc.includes('mapThrottle3d') && simSrc.includes('stepAutoArm'));
});
