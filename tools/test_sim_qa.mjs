// Regression tests for sim QA: track picker, boot URLs, flip toast, stamps.
// Node stdlib only: `node --test tools/test_sim_qa.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  findTrackIn, resolveSimBoot, firstTrackForMap, startPad, normalizeTrack,
  BUILTIN_TRACK_FILES, SELECTED_TRACK_KEY,
} from '../sim-tracks.js';
import {
  shouldToastFlip, isStuckInverted, stepStuckHold, wantsTurtle, bodyUpZ,
  STUCK_HOLD_S,
} from '../sim-feel.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { mapThrottle3d } from '../sim-3d.js';
import { MAP_LOOKS } from '../sim-maps.js';
import { CROSSHAIR_KEY, loadCrosshairOn, saveCrosshairOn } from '../sim-looks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const files = BUILTIN_TRACK_FILES.map((m) =>
  normalizeTrack(JSON.parse(readFileSync(join(root, m.file), 'utf8')))
);

test('findTrack(null) does not match Sofa Slalom via String(null)', () => {
  assert.equal(findTrackIn(null, files), null);
  assert.equal(findTrackIn('null', files), null);
  assert.equal(resolveSimBoot({ map: 'living' }, null, files).track, 'living-sofa');
  assert.equal(resolveSimBoot({ map: 'office' }, null, files).track, 'office-cubicles');
  assert.equal(resolveSimBoot({ map: 'room' }, null, files).track, 'room-practice');
  assert.equal(firstTrackForMap('gym', files).id, 'gym-court');
});

test('?map=&track= mismatch uses the track map; unknown map is not saved', () => {
  const mis = resolveSimBoot({ map: 'city', track: 'living-sofa' }, null, files);
  assert.equal(mis.map, 'living');
  assert.equal(mis.track, 'living-sofa');
  const unk = resolveSimBoot({ map: 'nope' }, { map: 'garage', track: 'garage-bench' }, files);
  assert.equal(unk.unknownMap, true);
  assert.equal(unk.save, false);
  assert.equal(unk.map, 'city');
  const rest = resolveSimBoot({}, { map: 'garage', track: 'garage-bench' }, files);
  assert.equal(rest.map, 'garage');
  assert.equal(rest.track, 'garage-bench');
  assert.equal(rest.restored, true);
  const early = resolveSimBoot({}, { map: 'garage', track: 'garage-bench' }, []);
  assert.equal(early.map, 'garage');
  assert.equal(early.track, 'garage-bench');
});

test('Mesa Zigzag start pad is at the zigzag, not City Loop origin', () => {
  const zig = files.find((t) => t.id === 'city-zigzag');
  const pad = startPad(zig);
  assert.ok(Math.hypot(pad.x - 210, pad.z + 345) < 40, 'near zigzag gate 0');
  assert.ok(Math.hypot(pad.x, pad.z - 20) > 200, 'not city historic pad');
  assert.ok(Number.isFinite(pad.yaw));
});

function flipSample(qp, extra) {
  const upZ = bodyUpZ(qp.quaternion);
  const clearanceM = qp.position.z;
  return {
    upZ,
    clearanceM,
    contact: clearanceM <= 0.02,
    speed: Math.hypot(qp.velocity.x, qp.velocity.y, qp.velocity.z),
    omega: Math.hypot(qp.omega.x, qp.omega.y, qp.omega.z),
    armed: qp.armed,
    ...(extra || {}),
  };
}

function anyToast(qp, seconds, stepFn) {
  const dt = 1 / qp.physicsHz;
  let held = 0;
  let toasted = false;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    if (stepFn) stepFn(qp, dt, i);
    else qp.step(dt, { roll: 0, pitch: 0, yaw: 0 }, 0, { r: 0, p: 0, y: 0 });
    const info = flipSample(qp);
    held = stepStuckHold(held, info, dt);
    if (shouldToastFlip({ ...info, heldS: held })) toasted = true;
  }
  return toasted;
}

function invertQuat() {
  // 180° about body X: body +Z → world −Z
  return { x: 1, y: 0, z: 0, w: 0 };
}

test('FLIPPED toast is only a stuck-on-the-deck hint', () => {
  assert.equal(shouldToastFlip({ upsideDown: true, armed: true, speed: 8, height: 2 }), false);
  assert.equal(shouldToastFlip({
    upZ: -1, clearanceM: 2, speed: 0, omega: 0, heldS: 2, armed: true,
  }), false, 'inverted hang in the air');
  assert.equal(shouldToastFlip({
    upZ: -1, clearanceM: 0.01, contact: true, speed: 6, omega: 0, heldS: 2, armed: true,
  }), false, 'inverted dive still moving');
  assert.equal(shouldToastFlip({
    upZ: -1, clearanceM: 0.01, contact: true, speed: 0.05, omega: 8, heldS: 2, armed: true,
  }), false, 'still flipping on the floor');
  assert.equal(shouldToastFlip({
    upZ: -1, clearanceM: 0.01, contact: true, speed: 0.05, omega: 0.2, heldS: 0.4, armed: true,
  }), false, 'not held long enough');
  assert.equal(shouldToastFlip({
    upZ: -1, clearanceM: 0.01, contact: true, speed: 0.05, omega: 0.2, heldS: STUCK_HOLD_S, armed: true,
  }), true, 'stuck inverted on the floor');
  assert.equal(isStuckInverted({
    upZ: -0.4, clearanceM: 0.01, contact: true, speed: 0, omega: 0,
  }), false, 'up vector not inverted enough');
});

test('full flip, roll, inverted hang, and inverted dive never toast', () => {
  const flip = new QuadPhysics(PRESETS.whoop65);
  flip.setFlightMode('acro');
  flip.setPhysicsHz(500);
  flip.reset({ x: 0, y: 0, z: 2 });
  flip.arm();
  assert.equal(anyToast(flip, 0.55, (qp, dt) => {
    qp.step(dt, { roll: 13, pitch: 0, yaw: 0 }, 0.4, { r: 1, p: 0, y: 0 });
  }), false, 'full flip');

  const roll = new QuadPhysics(PRESETS.whoop65);
  roll.setFlightMode('acro');
  roll.setPhysicsHz(500);
  roll.reset({ x: 0, y: 0, z: 2 });
  roll.arm();
  assert.equal(anyToast(roll, 0.35, (qp, dt) => {
    qp.step(dt, { roll: 8, pitch: 0, yaw: 0 }, 0.4, { r: 0.6, p: 0, y: 0 });
  }), false, 'roll');

  const hang = new QuadPhysics(PRESETS.whoop65);
  hang.setFlightMode('acro');
  hang.setThreeD(true);
  hang.setPhysicsHz(500);
  hang.reset({ x: 0, y: 0, z: 3 });
  hang.quaternion = invertQuat();
  hang.arm();
  const rev = mapThrottle3d(0.12);
  assert.equal(anyToast(hang, 2.0, (qp, dt) => {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 0 }, rev, { r: 0, p: 0, y: 0 });
  }), false, '2 s inverted hang');

  const dive = new QuadPhysics(PRESETS.whoop65);
  dive.setFlightMode('acro');
  dive.setPhysicsHz(500);
  dive.reset({ x: 0, y: 0, z: 6 });
  dive.quaternion = invertQuat();
  dive.velocity.z = -8;
  dive.arm();
  assert.equal(anyToast(dive, 0.45, (qp, dt) => {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 0 }, 0.2, { r: 0, p: 0, y: 0 });
  }), false, 'inverted dive');
});

test('upside down resting on the floor for 1.5 s does toast', () => {
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro');
  qp.setPhysicsHz(500);
  qp.reset({ x: 0, y: 0, z: 0.01 });
  qp.quaternion = invertQuat();
  qp.velocity.x = 0; qp.velocity.y = 0; qp.velocity.z = 0;
  qp.omega.x = 0; qp.omega.y = 0; qp.omega.z = 0;
  qp.arm();
  const dt = 1 / qp.physicsHz;
  let held = 0;
  let toasted = false;
  for (let i = 0; i < Math.round(1.7 / dt); i++) {
    qp.step(dt, { roll: 0, pitch: 0, yaw: 0 }, 0, { r: 0, p: 0, y: 0 });
    qp.velocity.x = 0; qp.velocity.y = 0; qp.velocity.z = 0;
    qp.omega.x = 0; qp.omega.y = 0; qp.omega.z = 0;
    qp.position.z = Math.min(qp.position.z, 0.012);
    qp.quaternion = invertQuat();
    const info = flipSample(qp, { contact: true, clearanceM: 0.01 });
    held = stepStuckHold(held, info, dt);
    if (shouldToastFlip({ ...info, heldS: held })) toasted = true;
  }
  assert.equal(toasted, true);
  assert.ok(held >= STUCK_HOLD_S);
});

test('turtle wants full throttle + extreme roll only when inverted on the deck', () => {
  const grounded = { upZ: -1, clearanceM: 0.01, contact: true, armed: true, throttle: 0.95, rollStick: 0.9 };
  assert.equal(wantsTurtle(grounded), true);
  assert.equal(wantsTurtle({ ...grounded, armed: false }), false);
  assert.equal(wantsTurtle({ ...grounded, threeD: true }), false);
  assert.equal(wantsTurtle({ ...grounded, upZ: 0.8 }), false);
  assert.equal(wantsTurtle({ ...grounded, clearanceM: 2, contact: false }), false);
  assert.equal(wantsTurtle({ ...grounded, throttle: 0.4 }), false);
  assert.equal(wantsTurtle({ ...grounded, rollStick: 0.2 }), false);
});

test('gym court lighting is bright enough to read the floor', () => {
  assert.ok(MAP_LOOKS.gym.hemi >= 0.5);
  assert.ok(MAP_LOOKS.gym.env >= 0.65);
  assert.ok(MAP_LOOKS.gym.bg >= 0.4);
});

test('sim.html wires picker rebuild, boot restore, and query-build no-save', () => {
  assert.ok(simSrc.includes('function setActiveTrack'));
  const active = simSrc.slice(
    simSrc.indexOf('function setActiveTrack'),
    simSrc.indexOf('function toggleStartMenu'),
  );
  assert.ok(active.includes('spawnTrackData') || active.includes('spawnCityRaces'), 'rebuild gates');
  assert.ok(active.includes('resetQuad()'), 'respawn on the picked track');
  assert.ok(active.includes('loadGhost') && active.includes('loadHostedGhost'), 'ghost load');
  assert.ok(simSrc.includes('resolveSimBoot') && simSrc.includes('loadSelected()'));
  const boot = simSrc.slice(
    simSrc.indexOf('function applyQueryBoot'),
    simSrc.indexOf('function publishTracks'),
  );
  assert.ok(boot.includes("applyBuild(decoded,{save:false,announce:true})"));
  assert.ok(boot.includes('boot.unknownMap'));
  assert.ok(boot.includes('already'), 'do not resetQuad/toast RESET on a no-op city reload');
  assert.ok(boot.includes('parseThreeDQuery') || boot.includes("q.get('3d')"));
  assert.ok(simSrc.includes('feel.noteFlip({'));
  assert.ok(simSrc.includes('clearanceM') && simSrc.includes('bodyUpZ'));
  assert.ok(simSrc.includes('wantsTurtle'));
  assert.ok(!/Math\.abs\(att\.roll\)>2\.0/.test(simSrc), 'old mid-flip |roll|>2 trigger must be gone');
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML');
  assert.ok(simSrc.includes(SELECTED_TRACK_KEY) || simSrc.includes('loadSelected'));
});

test('L1 L2 L3 query boot is session-only and runs once', () => {
  assert.ok(simSrc.includes('let queryBooted=false') || simSrc.includes('let queryBooted = false'));
  assert.ok(simSrc.includes('if(queryBooted||!tracksReady)return') || simSrc.includes('if (queryBooted || !tracksReady) return'));
  assert.ok(simSrc.includes("setFlightMode(modeRaw,false)") || simSrc.includes('setFlightMode(modeRaw, false)'));
  assert.ok(simSrc.includes("setMap(d.map,d.track,{save:false})") || simSrc.includes("setMap(d.map, d.track, { save: false })"));
});

test('L5 Esc in a drill opens the Coach picker', () => {
  const esc = simSrc.slice(simSrc.indexOf("if(e.key==='Escape')"), simSrc.indexOf("if(e.key==='Tab')"));
  assert.ok(esc.includes('openCoachPicker()'));
  assert.ok(esc.includes('coach.cancel()'));
});

function memStore(seed) {
  const mem = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

test('Show crosshair defaults off and persists quadmathSimCrosshair', () => {
  assert.equal(CROSSHAIR_KEY, 'quadmathSimCrosshair');
  assert.equal(loadCrosshairOn(memStore()), false);
  assert.equal(loadCrosshairOn(null), false);
  const store = memStore();
  assert.equal(saveCrosshairOn(true, store), true);
  assert.equal(store.getItem(CROSSHAIR_KEY), '1');
  assert.deepEqual(store.keys(), [CROSSHAIR_KEY]);
  assert.equal(loadCrosshairOn(store), true);
  saveCrosshairOn(false, store);
  assert.equal(store.getItem(CROSSHAIR_KEY), '0');
  assert.equal(loadCrosshairOn(store), false);
  assert.ok(simSrc.includes('Show crosshair'));
  assert.ok(simSrc.includes('id="cbCrosshair"'));
  assert.ok(!/id="cbCrosshair"[^>]*\bchecked\b/.test(simSrc), 'Show crosshair defaults off');
  assert.ok(simSrc.includes('#crosshair.on'));
  assert.ok(simSrc.includes('applyCrosshair()'));
  assert.ok(simSrc.includes('loadCrosshairOn') && simSrc.includes('saveCrosshairOn'));
  assert.ok(simSrc.includes('CROSSHAIR_KEY') || simSrc.includes('quadmathSimCrosshair'));
});

test('M2 leaderboard names render via textContent not innerHTML', () => {
  assert.ok(simSrc.includes('function renderBoardBody'));
  assert.ok(simSrc.includes("b.textContent=(i+1)+' '+sanitizePilotName(r.name)") || simSrc.includes('b.textContent=(i+1)+\' \'+sanitizePilotName(r.name)'));
  assert.equal(simSrc.includes('boardHtml('), false);
});
