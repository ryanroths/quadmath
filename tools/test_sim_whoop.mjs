// Unit tests for W2 whoop physics (bounce, ground effect, sag).
// Node stdlib only: `node --test tools/test_sim_whoop.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { QuadPhysics, PRESETS, groundEffectMult as qpGround } from '../quadphysics.js';
import { DEFAULT_BUILD, BUILD_PRESETS, batteryFromBuild, BUILD_KEY } from '../sim-build.js';
import {
  WHOOP_KEY, PHYSICS_VER, WHOOP_FEEL_VER, GHOST_FORMAT_V, DEFAULT_WHOOP,
  normalizeWhoop, loadWhoop, saveWhoop, whoopScale,
  groundEffectMult, whoopGroundK, whoopGroundMult,
  lipoOcv, stepBattery, resolveDuctHit, BOUNCE_MAPS,
  stepPropwash, indoorDraft, emptyWake, WASH_LEVELS, washLevelFromStr, washStrFromLevel,
  tagGhost, ghostSamples, ghostPhys,
} from '../sim-whoop.js';
import { ghostPayloadError, makePaceGhost } from '../sim-tracks.js';
import { PHYS_VER } from '../sim-retention.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const whoopSrc = readFileSync(join(root, 'sim-whoop.js'), 'utf8');

const softHit = {
  vel: { x: 8, y: 0, z: 1.2 },
  omega: { x: 0, y: 0, z: 0 },
  normal: { x: -1, y: 0, z: 0 },
  into: 8,
};

test('new storage key only; never writes old ryfly* keys', () => {
  assert.equal(WHOOP_KEY, 'quadmathSimWhoop');
  assert.ok(whoopSrc.includes('setItem(WHOOP_KEY'));
  assert.equal(whoopSrc.includes('ryflyDroneType'), false);
  assert.equal(whoopSrc.includes('ryflyRates'), false);
  assert.ok(whoopSrc.includes('Nothing here is copied from WebFPV')
    || whoopSrc.includes('copied from WebFPV'));
  assert.ok(whoopSrc.includes('Do not write old ryfly'));
});

test('65mm whoop bounces and spins on a soft wall hit; no crash', () => {
  const r = resolveDuctHit(softHit, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.equal(r.crashed, false);
  assert.ok(r.vel.x < 0, `should reverse x, got ${r.vel.x}`);
  assert.ok(Math.abs(r.vel.x) > 1.5, `bounce too dead ${r.vel.x}`);
  assert.ok(r.rest >= 0.28 && r.rest <= 0.35, `soft rest ${r.rest} should be TPU-like, not a superball`);
  assert.ok(Math.hypot(r.omega.x, r.omega.y, r.omega.z) > 0.02, 'ducts should spin the frame');
});

test('only impacts above the crash threshold tumble', () => {
  assert.equal(DEFAULT_WHOOP.crashSpeed, 9);
  const hard = resolveDuctHit({
    ...softHit, vel: { x: 22, y: 0, z: 0 }, into: 22,
  }, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.equal(hard.crashed, true);
  const eight = resolveDuctHit({
    ...softHit, vel: { x: 8, y: 0, z: 0 }, into: 8,
  }, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.equal(eight.crashed, false);
  const ten = resolveDuctHit({
    ...softHit, vel: { x: 10, y: 0, z: 0 }, into: 10,
  }, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.equal(ten.crashed, true, '10 m/s on a 65mm is a crash after the 9 m/s line');
  assert.ok(Math.hypot(hard.omega.x, hard.omega.y, hard.omega.z)
    > Math.hypot(eight.omega.x, eight.omega.y, eight.omega.z));
});

test('65mm ducts bounce more / crash later than a heavy 85mm', () => {
  const hit = { ...softHit, vel: { x: 8, y: 0, z: 0 }, into: 8 };
  const w65 = resolveDuctHit(hit, DEFAULT_BUILD, DEFAULT_WHOOP);
  const w85 = resolveDuctHit(hit, BUILD_PRESETS.whoop85_2s, DEFAULT_WHOOP);
  assert.ok(whoopScale(DEFAULT_BUILD).bounce > whoopScale(BUILD_PRESETS.whoop85_2s).bounce);
  assert.ok(whoopScale(DEFAULT_BUILD).crashAt > whoopScale(BUILD_PRESETS.whoop85_2s).crashAt);
  assert.ok(Math.abs(w65.vel.x) > Math.abs(w85.vel.x) * 0.92, '65mm should rebound harder');
});

test('bounce off uses a dead wall and crashes more easily', () => {
  const off = normalizeWhoop({ ...DEFAULT_WHOOP, bounce: false, crashSpeed: 10 });
  const r = resolveDuctHit({
    ...softHit, vel: { x: 12, y: 0, z: 0 }, into: 12,
  }, DEFAULT_BUILD, off);
  assert.equal(r.crashed, true);
  assert.ok(r.rest < 0.2);
});

function hoverThrottle(qp) {
  const weight = qp.cfg.mass * 9.81;
  const maxT = qp.cfg.maxThrustPerMotor * 4;
  const exp = qp.cfg.thrustExp || 2;
  const out = Math.pow(weight / maxT, 1 / exp);
  const idle = qp.cfg.idleThrottle;
  return Math.max(0, Math.min(1, (out - idle) / (1 - idle)));
}

test('ground effect is a cushion near the floor and fades by 1 prop diameter', () => {
  const prop = 0.031;
  assert.equal(qpGround(0.2, prop, 0.065), 1);
  assert.equal(qpGround(prop, prop, 0.065), 1);
  assert.ok(qpGround(0, prop, 0.065) > 1.05);
  const near = qpGround(0.005, prop, 0.065);
  const mid = qpGround(0.015, prop, 0.065);
  const far = qpGround(0.028, prop, 0.065);
  assert.ok(near > mid && mid > far && far >= 1);
  assert.equal(groundEffectMult(0, prop, 0.065), qpGround(0, prop, 0.065));
  assert.equal(whoopGroundK(DEFAULT_BUILD, { ...DEFAULT_WHOOP, ground: false }), 0);
  assert.equal(whoopGroundMult(0, DEFAULT_BUILD, { ...DEFAULT_WHOOP, ground: false }), 1);
  const on = whoopGroundMult(0, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.ok(on > 1.04 && on < 1.09, `whoop cushion ${on}`);
  const k = whoopGroundK(DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.ok(k >= 0.05 && k <= 0.08, `kGE ${k}`);
  const light = whoopGroundK({ ...DEFAULT_BUILD, auwG: 20 }, DEFAULT_WHOOP);
  const heavy = whoopGroundK({ ...DEFAULT_BUILD, auwG: 36 }, DEFAULT_WHOOP);
  assert.ok(light > heavy, 'lighter whoop should float more in ground effect');
});

test('QuadPhysics ground-effect hook lifts more than free air at the same throttle', () => {
  function altAfter(clearance) {
    const qp = new QuadPhysics(PRESETS.whoop65);
    qp.setFlightMode('angle');
    qp.reset({ x: 0, y: 0, z: 0.35 });
    qp.arm();
    if (clearance == null) qp.groundClearance = null;
    else {
      qp.groundClearance = () => clearance;
      qp.cfg.groundEffect = 0.16;
    }
    const thr = hoverThrottle(qp);
    const dt = 1 / qp.physicsHz;
    for (let i = 0; i < 280; i++) qp.step(dt, { roll: 0, pitch: 0, yaw: 0 }, thr, { r: 0, p: 0, y: 0 });
    return qp.position.z;
  }
  const air = altAfter(null);
  const cushion = altAfter(0.004);
  assert.ok(cushion > air + 0.015, `cushion ${cushion.toFixed(3)} vs air ${air.toFixed(3)}`);
});

test('LiPo sag curve: 2S doubles voltage, small packs sag more, not linear', () => {
  const s1 = batteryFromBuild({ ...DEFAULT_BUILD, cells: 1, mah: 300 });
  const s2 = batteryFromBuild({ ...DEFAULT_BUILD, cells: 2, mah: 300 });
  assert.ok(Math.abs(lipoOcv(1, 1) - 4.2) < 1e-9);
  assert.ok(Math.abs(lipoOcv(1, 2) - 8.4) < 1e-9);
  const mid = lipoOcv(0.5, 1);
  assert.ok(mid > 3.70 && mid < 3.90, `plateau should sit ~3.8 V, got ${mid}`);
  assert.ok(mid > 3.3 + 0.5 * (4.2 - 3.3), 'curve sits above a straight line at mid SOC');

  const fresh = stepBattery({ charge: 1, voltage: 4.2 }, 0.1, 0.2, s1, DEFAULT_WHOOP);
  const tired = stepBattery({ charge: 0.2, voltage: 3.6 }, 0.1, 0.85, s1, DEFAULT_WHOOP);
  assert.ok(fresh.voltage > 3.9);
  assert.ok(tired.voltage < fresh.voltage);
  assert.ok(tired.sagFactor < fresh.sagFactor);

  const small = stepBattery({ charge: 0.5, voltage: 3.8 }, 0.2, 1, { ...s1, mah: 200, sagDrop: 0.31 }, DEFAULT_WHOOP);
  const big = stepBattery({ charge: 0.5, voltage: 3.8 }, 0.2, 1, { ...s1, mah: 480, sagDrop: 0.20 }, DEFAULT_WHOOP);
  assert.ok(small.voltage < big.voltage, `small ${small.voltage} vs big ${big.voltage}`);

  const s2step = stepBattery({ charge: 1, voltage: 8.4 }, 0.05, 0.3, s2, DEFAULT_WHOOP);
  assert.ok(s2step.voltage > 7.2 && s2step.voltage < 8.5);

  const off = stepBattery({ charge: 0.1, voltage: 3.4 }, 1, 1, s1, { ...DEFAULT_WHOOP, batt: false });
  assert.equal(off.charge, 1);
  assert.equal(off.voltage, s1.full);
  assert.equal(off.sagFactor, 1);
});

const WASH_LOW = { ...DEFAULT_WHOOP, wash: true, washStr: WASH_LEVELS.low };
const DRAFT_ON = { ...DEFAULT_WHOOP, draft: true };

test('propwash wobbles on a dive/chop through own wash; drafts grow near walls when on', () => {
  let wake = emptyWake();
  const hover = { pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: 0.7 };
  for (let i = 0; i < 20; i++) {
    const s = stepPropwash(wake, hover, 0.02, DEFAULT_BUILD, WASH_LOW);
    wake = s.wake;
  }
  const chop = stepPropwash(wake, {
    pos: { x: 0, y: 0, z: 1.7 }, vel: { x: 0, y: 0, z: -2.2 }, throttle: 0.05,
  }, 0.02, DEFAULT_BUILD, WASH_LOW);
  assert.ok(chop.excite > 0.0004, `chop/dive excite ${chop.excite}`);
  assert.ok(chop.excite < 0.012, `wash still too strong ${chop.excite}`);
  const tq = Math.hypot(chop.torque.x, chop.torque.y, chop.torque.z);
  assert.ok(tq > 0.00002 && tq < 0.0008, `chop torque ${tq}`);
  const off = stepPropwash(wake, {
    pos: { x: 0, y: 0, z: 1.7 }, vel: { x: 0, y: 0, z: -2.2 }, throttle: 0.05,
  }, 0.02, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.equal(off.excite, 0);

  const near = indoorDraft({ x: 0, y: 0, z: 1 }, 0.2, 1.0, DEFAULT_BUILD, DRAFT_ON);
  const far = indoorDraft({ x: 0, y: 0, z: 1 }, 4.0, 1.0, DEFAULT_BUILD, DRAFT_ON);
  assert.ok(near.prox > 0.7);
  assert.equal(far.prox, 0);
  assert.ok(Math.hypot(near.force.x, near.force.y, near.force.z) > 0);
  assert.equal(Math.hypot(far.force.x, far.force.y, far.force.z), 0);
  const defNear = indoorDraft({ x: 0, y: 0, z: 1 }, 0.2, 1.0, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.equal(Math.hypot(defNear.force.x, defNear.force.y, defNear.force.z), 0);
});

test('ghosts stay v:1 kinematic; phys tag is additive and optional', () => {
  assert.equal(GHOST_FORMAT_V, 1);
  assert.equal(PHYSICS_VER, 4);
  assert.equal(PHYS_VER, PHYSICS_VER, 'the Worker accepts what the page tags');
  const samples = [[0, 0, 1, 0, 0, 0, 0, 1], [100, 1, 1, -1, 0, 0, 0, 1]];
  const old = { v: 1, track: 0, name: 'OLD', lapTime: 1000, samples };
  assert.equal(ghostPayloadError(old, 0), null);
  const tagged = tagGhost({ track: 0, name: 'NEW', lapTime: 1000, samples });
  assert.equal(tagged.v, 1);
  assert.equal(tagged.phys, PHYSICS_VER);
  assert.equal(ghostPayloadError(tagged, 0), null);
  assert.equal(ghostPayloadError({ ...old, phys: 2, feel: 2 }, 0), null);
  assert.deepEqual(ghostSamples(old), samples);
  assert.deepEqual(ghostSamples(samples), samples);
  assert.equal(ghostPhys(old), null);
  assert.equal(ghostPhys(tagged), PHYSICS_VER);
  const pace = makePaceGhost([{ x: 0, y: 2, z: 0 }, { x: 4, y: 2, z: -6 }], { track: 'living-sofa', speed: 5, hz: 6, laps: 1 });
  assert.equal(pace.v, 1);
  assert.equal(pace.phys, PHYSICS_VER);
  assert.equal(ghostPayloadError(pace, 'living-sofa'), null);
});

test('3D center hover and a straight punch-out give about zero propwash', () => {
  let wake = emptyWake();
  const hover = { pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: 0.7 };
  for (let i = 0; i < 20; i++) {
    wake = stepPropwash(wake, hover, 0.02, DEFAULT_BUILD, WASH_LOW).wake;
  }
  const center = { pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: 0 };
  let maxHover = 0;
  for (let i = 0; i < 40; i++) {
    const s = stepPropwash(wake, center, 0.02, DEFAULT_BUILD, WASH_LOW);
    wake = s.wake;
    if (s.excite > maxHover) maxHover = s.excite;
  }
  assert.ok(maxHover < 0.02, `3D center hover wash ${maxHover}`);

  wake = emptyWake();
  for (let i = 0; i < 20; i++) {
    wake = stepPropwash(wake, hover, 0.02, DEFAULT_BUILD, WASH_LOW).wake;
  }
  const punch = stepPropwash(wake, {
    pos: { x: 0, y: 0, z: 2.15 }, vel: { x: 0, y: 0, z: 4 }, throttle: 1,
  }, 0.02, DEFAULT_BUILD, WASH_LOW);
  assert.equal(punch.excite, 0);
  assert.equal(punch.turb, 0);

  const reverse = stepPropwash(emptyWake(), {
    pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: -0.7,
  }, 0.02, DEFAULT_BUILD, WASH_LOW);
  assert.equal(reverse.wakeHit, 0, 'reverse must not count as a chop-to-zero');
  assert.ok(reverse.wake.s > 0.5, 'reverse still deposits |thrust| wash, not a chop-to-zero');
  assert.ok(reverse.wake.z > 2, `reverse must deposit upwash, z=${reverse.wake.z}`);
  const fwdWash = stepPropwash(emptyWake(), {
    pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: 0.7,
  }, 0.02, DEFAULT_BUILD, WASH_LOW);
  assert.ok(fwdWash.wake.z < 2, `forward must deposit downwash, z=${fwdWash.wake.z}`);
});

test('wash strength levels snap Off/Low/Med/High and default Off', () => {
  assert.equal(DEFAULT_WHOOP.wash, false);
  assert.equal(DEFAULT_WHOOP.washStr, WASH_LEVELS.off);
  assert.equal(DEFAULT_WHOOP.draft, false);
  assert.equal(DEFAULT_WHOOP.feelVer, WHOOP_FEEL_VER);
  assert.ok(Math.abs(WASH_LEVELS.low - 0.25 * 0.05) < 1e-9, 'Low is old Low × 0.05');
  assert.equal(WASH_LEVELS.high, 0.25);
  assert.equal(washStrFromLevel('off'), WASH_LEVELS.off);
  assert.equal(washStrFromLevel('low'), WASH_LEVELS.low);
  assert.equal(washStrFromLevel('high'), WASH_LEVELS.high);
  assert.equal(washLevelFromStr(0), 'off');
  assert.equal(washLevelFromStr(WASH_LEVELS.low), 'low');
  assert.equal(washLevelFromStr(WASH_LEVELS.med), 'med');
  assert.equal(washLevelFromStr(WASH_LEVELS.high), 'high');
  assert.ok(whoopScale(DEFAULT_BUILD).wash < 0.85, '65mm wash scale is gentler than the old ~1.1');
});

test('new Low wash is ~5% of old Low; High matches old Low washStr', () => {
  const oldLow = { ...DEFAULT_WHOOP, wash: true, washStr: 0.25 };
  const neuLow = { ...DEFAULT_WHOOP, wash: true, washStr: WASH_LEVELS.low };
  const neuHigh = { ...DEFAULT_WHOOP, wash: true, washStr: WASH_LEVELS.high };
  let wake = emptyWake();
  const hover = { pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: 0.7 };
  for (let i = 0; i < 20; i++) wake = stepPropwash(wake, hover, 0.02, DEFAULT_BUILD, oldLow).wake;
  const sample = { pos: { x: 0, y: 0, z: 1.7 }, vel: { x: 0, y: 0, z: -2.2 }, throttle: 0.05 };
  const oldChop = stepPropwash(wake, sample, 0.02, DEFAULT_BUILD, oldLow);
  const newChop = stepPropwash(wake, sample, 0.02, DEFAULT_BUILD, neuLow);
  const highChop = stepPropwash(wake, sample, 0.02, DEFAULT_BUILD, neuHigh);
  const ratio = newChop.excite / (oldChop.excite || 1e-9);
  assert.ok(ratio > 0.03 && ratio < 0.08, `new/old Low excite ${ratio.toFixed(3)}`);
  assert.ok(Math.abs(highChop.excite - oldChop.excite) < 1e-9, 'High matches old Low wake hit');
});

test('propwash has no always-on mid-stick buzz; punch and 3D center stay quiet', () => {
  const mid = stepPropwash(emptyWake(), {
    pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: 0.5,
  }, 0.02, DEFAULT_BUILD, WASH_LOW);
  assert.equal(mid.turb, 0);
  assert.equal(mid.wakeHit, 0);
  const idle = stepPropwash(emptyWake(), {
    pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, throttle: 0,
  }, 0.02, DEFAULT_BUILD, WASH_LOW);
  assert.equal(idle.turb, 0);
  assert.equal(idle.excite, 0);
  const punch = stepPropwash(emptyWake(), {
    pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 4 }, throttle: 1,
  }, 0.02, DEFAULT_BUILD, WASH_LOW);
  assert.equal(punch.turb, 0);
  assert.equal(punch.excite, 0);
});

test('whoop settings load/save uses only WHOOP_KEY; old wash migrates Off once', () => {
  const mem = new Map();
  const store = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  saveWhoop({ bounce: false, wash: true, washStr: 1.2, feelVer: WHOOP_FEEL_VER }, store);
  assert.equal([...mem.keys()].join(','), WHOOP_KEY);
  const loaded = loadWhoop(store);
  assert.equal(loaded.bounce, false);
  assert.ok(Math.abs(loaded.washStr - 1.2) < 1e-9);
  assert.equal(loaded.wash, true);
  assert.equal(loaded.batt, true);

  store.setItem(WHOOP_KEY, JSON.stringify({
    bounce: true, wash: true, washStr: 0.25, draft: true, draftStr: 0.55,
  }));
  const migrated = loadWhoop(store);
  assert.equal(migrated.wash, false);
  assert.equal(migrated.washStr, 0);
  assert.equal(migrated.draft, false);
  assert.equal(migrated.feelVer, WHOOP_FEEL_VER);
  const again = JSON.parse(store.getItem(WHOOP_KEY));
  again.wash = true;
  again.washStr = WASH_LEVELS.low;
  store.setItem(WHOOP_KEY, JSON.stringify(again));
  const kept = loadWhoop(store);
  assert.equal(kept.wash, true);
  assert.equal(kept.washStr, WASH_LEVELS.low);
});

test('sim.html wires W2 sliders, HUD voltage, and keeps old localStorage keys', () => {
  assert.ok(simSrc.includes('sim-whoop.js'), 'must import sim-whoop.js');
  assert.ok(simSrc.includes('id="cbBounce"') && simSrc.includes('id="s_bounce"'));
  assert.ok(simSrc.includes('id="cbGround"') && simSrc.includes('id="s_ground"'));
  assert.ok(simSrc.includes('id="cbWash"') && simSrc.includes('id="s_wash"'));
  assert.ok(simSrc.includes('option value="low"') && simSrc.includes('option value="high"'));
  assert.ok(simSrc.includes('option value="off" selected') || simSrc.includes('value="off" selected'));
  assert.ok(!/id="cbWash"[^>]*checked/.test(simSrc));
  assert.ok(!/id="cbDraft"[^>]*checked/.test(simSrc));
  assert.ok(/id="s_crash"[^>]*value="9"/.test(simSrc));
  assert.ok(simSrc.includes('id="cbDraft"') && simSrc.includes('id="s_draft"'));
  assert.ok(simSrc.includes('id="s_sag"') && simSrc.includes('id="cbBattSim"'));
  assert.ok(simSrc.includes('hudBatt') && simSrc.includes('battV'));
  assert.ok(simSrc.includes('PHYSICS_VER') && simSrc.includes('tagGhost'));
  for (const k of [
    'ryflyRates', 'ryflyDroneType', 'ryflyCamCustom', 'ryflyMusicVol',
    'ryflyMusicOn',
    'quadmath_bestLap_', 'ghostStorageKey(', 'quadmath_pilotName', BUILD_KEY,
  ]) {
    assert.ok(simSrc.includes(k), `must keep reading old key ${k}`);
  }
  assert.match(simSrc, /function loadMusicPref/);
  assert.match(simSrc, /function saveMusicPref/);
  assert.match(simSrc, /return false; \/\/ new player \/ empty localStorage starts muted/);
  assert.match(simSrc, /if\(!musicWanted\)/);
  assert.match(simSrc, /saveMusicPref\(musicOn\)/);
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML from the sim PR');
});

test('The Rig bounces: a wall hit that crashes elsewhere rebounds there', () => {
  const hit = (into, profile) => resolveDuctHit({
    vel: { x: into, y: 0, z: 0 }, omega: { x: 0, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 }, into, floor: false,
  }, DEFAULT_BUILD, DEFAULT_WHOOP, profile);
  // 20 wu/s (5.7 m/s) into a wall: a crash on any other map, near-dead stop.
  const plain = hit(20, undefined);
  assert.equal(plain.crashed, true);
  assert.equal(plain.rest, 0.10);
  const rig = hit(20, BOUNCE_MAPS.rig);
  assert.equal(rig.crashed, false);
  assert.ok(rig.rest > 0.38 && rig.rest < 0.45, 'rest ' + rig.rest);
  assert.ok(rig.vel.x < -0.38 * 20, 'it comes back off the wall: ' + rig.vel.x);
  // Still a crash far above the threshold (about 37 wu/s on the 65).
  assert.equal(hit(45, BOUNCE_MAPS.rig).crashed, true);
  // No profile is the build's own contact, unchanged.
  assert.deepEqual(hit(6, undefined), hit(6, null));
  assert.deepEqual(Object.keys(BOUNCE_MAPS), ['rig']);
});
