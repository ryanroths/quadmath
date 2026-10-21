// TX16S / EdgeTX HID: mapping, calibration persistence, touch-off when a pad is live.
// Node stdlib only: `node --test tools/test_sim_radio.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AXIS_MAP_PREFIX, RADIO_PRESET_PREFIX, GP_ID_KEY,
  sanitizeId, isRadio, radioScore, AETR_MAP, PAD_MAP, defaultMapFor,
  applyAxisMap, applyDeadzone, RADIO_DZ, loadRadioProfile, saveAxisMap, saveRadioPreset,
  AXIS_MAP_VER, migrateAxisMap,
  clearRadioCalibration, isValidAxisMap, shouldEnableTouch,
  createRadioRouter, CAL_STEPS, createCalibState, stepCalib,
  guessRadioPreset, isKnownRadio, radioShortName,
  AUTOARM_KEY, ARM_SWITCH_PREFIX, loadAutoArm, saveAutoArm,
  loadArmSwitch, saveArmSwitch, mergeArmSwitch, hasArmSwitch,
  listArmCandidates, detectArmSwitch, snapshotArmInputs,
  armSwitchValue, stepArmSwitch,
} from '../sim-touch.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { throttleCollective, armHintText, stepAutoArm } from '../sim-3d.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const touchSrc = readFileSync(join(root, 'sim-touch.js'), 'utf8');

const TX16S_ID = 'RadioMaster TX16S Joystick (Vendor: 1209 Product: 4f54)';
const TX16S_SID = sanitizeId(TX16S_ID);

function memStore(seed) {
  const mem = new Map(Object.entries(seed || {}));
  const removed = [];
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => { removed.push(k); mem.delete(k); },
    keys: () => [...mem.keys()],
    removed: () => removed.slice(),
  };
}

function tx16sPad(axes, extras) {
  return Object.assign({
    id: TX16S_ID,
    index: 0,
    mapping: '',
    axes: axes || [0, 0, -1, 0, 0, 0, 0, 0],
    buttons: [],
  }, extras || {});
}

function hold(router, dt, n) {
  let last = null;
  for (let i = 0; i < n; i++) last = router.tickCalib(dt);
  return last;
}

test('TX16S id sanitizes and scores as a radio, AETR default', () => {
  const gp = tx16sPad();
  assert.equal(isRadio(gp), true);
  assert.equal(radioScore(gp), 2);
  assert.equal(defaultMapFor(gp), AETR_MAP);
  assert.ok(TX16S_SID.startsWith('RadioMaster_TX16S_Joystick'));
  assert.ok(TX16S_SID.length <= 64);
});

test('AETR 8-axis TX16S maps roll/pitch/yaw/throttle without shifting aux pots', () => {
  // Mode 2 AETR: ax0 roll, ax1 pitch (channel +1 = stick forward), ax2 throttle
  // -1..1, ax3 yaw, 4-7 aux. Do not invert pitch like a gamepad Y axis.
  const rest = applyAxisMap([0, 0, -1, 0, 0.4, -0.2, 0.9, 0], AETR_MAP);
  assert.equal(rest.r, 0);
  assert.equal(rest.p, 0);
  assert.equal(rest.y, 0);
  assert.ok(Math.abs(rest.t) < 1e-9, 'throttle low → 0');
  const defl = applyAxisMap([0.8, 0.5, 1, -0.6, 0.4, -0.2, 0.9, 0], AETR_MAP);
  assert.ok(Math.abs(defl.r - applyDeadzone(0.8, RADIO_DZ)) < 1e-12);
  assert.ok(Math.abs(defl.p - applyDeadzone(0.5, RADIO_DZ)) < 1e-12);
  assert.ok(Math.abs(defl.y - applyDeadzone(-0.6, RADIO_DZ)) < 1e-12);
  assert.ok(Math.abs(defl.t - 1) < 1e-9);
});

test('radio deadzone rescales like touch, no step, default 0.02', () => {
  assert.equal(RADIO_DZ, 0.02);
  assert.equal(applyDeadzone(0.019, RADIO_DZ), 0);
  const hole = applyAxisMap([0.019, 0, -1, 0], AETR_MAP);
  assert.equal(hole.r, 0);
  const justOut = applyAxisMap([0.031, 0, -1, 0], AETR_MAP);
  const expected = (0.031 - RADIO_DZ) / (1 - RADIO_DZ);
  assert.ok(Math.abs(justOut.r - expected) < 1e-12, `rescale ${justOut.r} vs ${expected}`);
  assert.ok(justOut.r < 0.031, 'must not leave a step at the edge of the hole');
  const full = applyAxisMap([1, 1, -1, 1], AETR_MAP);
  assert.equal(full.r, 1);
  assert.equal(full.p, 1);
  assert.equal(full.y, 1);
  assert.ok(touchSrc.includes('(a - d) / (1 - d)') || touchSrc.includes('(a-d)/(1-d)'));
});

test('saved ryflyAxisMap_* loads, persists, and does not wipe other ryfly* keys', () => {
  const saved = {
    r: { i: 0, sign: 1 },
    p: { i: 1, sign: -1 },
    y: { i: 3, sign: 1 },
    t: { i: 2, min: -1, max: 1 },
    arm: { i: 4, sign: 1 },
    mode: { i: 5, sign: 1 },
  };
  const rates = '{"type":"BETAFLIGHT","keep":true}';
  const store = memStore({
    ryflyRates: rates,
    ryflyDroneType: 'whoop65',
    [AXIS_MAP_PREFIX + TX16S_SID]: JSON.stringify(saved),
    [RADIO_PRESET_PREFIX + TX16S_SID]: 'custom',
    [GP_ID_KEY]: TX16S_ID,
  });
  const prof = loadRadioProfile(TX16S_ID, store);
  assert.equal(prof.radioPreset, 'custom');
  assert.deepEqual(prof.axisMap.r, saved.r);
  assert.equal(prof.axisMap.arm.i, 4);
  assert.equal(store.getItem('ryflyRates'), rates);
  assert.equal(store.getItem('ryflyDroneType'), 'whoop65');
  saveAxisMap(TX16S_ID, saved, store);
  saveRadioPreset(TX16S_ID, 'custom', store);
  assert.equal(store.getItem('ryflyRates'), rates);
  assert.equal(store.removed().length, 0, 'must not delete Ryan\'s other ryfly* keys');
});

test('mocked navigator.getGamepads TX16S: mapping + calib persist + touch off', () => {
  const rates = '{"type":"BETAFLIGHT"}';
  const store = memStore({
    ryflyRates: rates,
    [GP_ID_KEY]: TX16S_ID,
  });
  let axes = [0, 0, -1, 0, 0, 0, 0, 0];
  let present = true;
  const getGamepads = () => (present ? [tx16sPad(axes)] : []);
  const router = createRadioRouter({
    storage: store,
    getGamepads,
    inputChoice: 'touch',
    mobile: true,
  });

  assert.equal(router.touchAllowed({ inputChoice: 'touch', mobile: true }), true,
    'touch allowed before a pad is picked');
  const picked = router.pick();
  assert.ok(picked);
  assert.equal(router.gpName, TX16S_ID);
  assert.equal(router.gpConnected, true);
  assert.equal(router.touchAllowed({ inputChoice: 'touch', mobile: true }), false);
  assert.equal(shouldEnableTouch({ inputChoice: 'touch', mobile: true, hasGamepad: true }), false);

  const live = router.readStick();
  assert.equal(live.source, 'gamepad');
  assert.equal(live.touch, false);
  assert.ok(Math.abs(live.stick.t) < 1e-9);

  axes = [0.7, 0, -1, 0, 0, 0, 0, 0];
  const rolled = router.readStick();
  const roll07 = applyDeadzone(0.7, RADIO_DZ);
  assert.ok(Math.abs(rolled.stick.r - roll07) < 1e-9, 'roll on axis 0');
  assert.equal(rolled.stick.p, 0);
  assert.equal(rolled.stick.y, 0);

  // Empty Chrome poll while still "connected": keep last sticks, never touch.
  present = false;
  const empty = router.readStick();
  assert.equal(empty.source, 'gamepad');
  assert.equal(empty.touch, false);
  assert.equal(empty.emptyPoll, true);
  assert.ok(Math.abs(empty.stick.r - roll07) < 1e-9, 'hold last radio sticks');
  present = true;

  // Calibration wizard on 8 axes, skip aux, persist.
  axes = [0, 0, -1, 0, 0.1, -0.1, 0, 0];
  assert.equal(router.startCalib(), true);
  hold(router, 0.4, 3); // center > 1s
  axes = [1, 0, -1, 0, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // roll
  axes = [0, -1, -1, 0, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // pitch up
  axes = [0, 0, -1, 1, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // yaw
  axes = [0, 0, 1, 0, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // throttle up
  axes = [0, 0, -1, 0, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // throttle down
  router.skipCalibAux(); // arm
  const finished = router.skipCalibAux(); // mode
  assert.equal(finished.done, true);
  assert.equal(finished.axisMap.r.i, 0);
  assert.equal(finished.axisMap.p.i, 1);
  assert.equal(finished.axisMap.p.sign, -1);
  assert.equal(finished.axisMap.y.i, 3);
  assert.equal(finished.axisMap.t.i, 2);
  assert.ok(finished.axisMap.t.max > 0.5);
  assert.ok(finished.axisMap.t.min < -0.5);

  const raw = store.getItem(AXIS_MAP_PREFIX + TX16S_SID);
  assert.ok(raw, 'calibration written to per-device key');
  const persisted = JSON.parse(raw);
  assert.equal(persisted.r.i, 0);
  assert.equal(persisted.y.i, 3);
  assert.equal(store.getItem('ryflyRates'), rates, 'do not wipe saved rates');
  assert.equal(store.removed().length, 0);

  // Reload: new router with the same store applies the saved map, touch stays off.
  const again = createRadioRouter({ storage: store, getGamepads, inputChoice: 'touch', mobile: true });
  again.pick();
  assert.equal(again.axisMap.r.i, 0);
  assert.equal(again.axisMap.t.i, 2);
  assert.equal(again.touchAllowed({ inputChoice: 'touch', mobile: true }), false);
  axes = [0, 0.4, 0, 0, 0, 0, 0, 0];
  const pitched = again.readStick();
  assert.ok(Math.abs(pitched.stick.p - applyDeadzone(-0.4, RADIO_DZ)) < 1e-9, 'saved pitch sign still inverted');
  assert.equal(pitched.source, 'gamepad');
});

test('Xbox-style pad is not preferred over TX16S when both are present', () => {
  const xbox = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [],
  };
  const radio = tx16sPad([0, 0, -1, 0, 0, 0, 0, 0], { index: 1 });
  const store = memStore();
  const router = createRadioRouter({
    storage: store,
    getGamepads: () => [xbox, radio],
  });
  const picked = router.pick();
  assert.equal(picked.id, TX16S_ID);
  assert.equal(router.gpIndex, 1);
});

test('sim.html still owns the Radio panel and per-device keys', () => {
  const src = simSrc + '\n' + touchSrc;
  assert.ok(simSrc.includes('id="radioPreset"'));
  assert.ok(simSrc.includes('id="btnCalib"'));
  assert.ok(simSrc.includes('id="calib"'));
  assert.ok(src.includes('ryflyAxisMap_'));
  assert.ok(src.includes('ryflyRadioPreset_'));
  assert.ok(src.includes('ryflyGamepadId'));
  assert.ok(touchSrc.includes('createRadioRouter'));
  assert.ok(touchSrc.includes('clearRadioCalibration'));
  assert.ok(simSrc.includes('clearRadioCalibration'));
  assert.equal(CAL_STEPS.length, 8);
});

test('stick HUD is mode 2: left pad first, no row-reverse', () => {
  assert.match(simSrc, /#feelHud\{[^}]*pointer-events:none;\s*flex-direction:\s*row;/);
  assert.equal(/#feelHud\{[^}]*row-reverse/.test(simSrc), false);
  const l = simSrc.indexOf('id="stickDotL"');
  const r = simSrc.indexOf('id="stickDotR"');
  assert.ok(l > 0 && r > l, 'DOM left stick before right stick');
  const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');
  assert.ok(feelSrc.includes('50 + st.y * 42') && feelSrc.includes('92 - st.t * 84'),
    'left HUD dot is yaw/throttle');
  assert.ok(feelSrc.includes('50 + st.r * 42') && feelSrc.includes('50 - st.p * 42'),
    'right HUD dot is roll/pitch');
});

function sweepThrottle(router, setAxes, rest, full, dt) {
  const frames = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    frames.push(rest + (full - rest) * t);
  }
  let last = null;
  for (const v of frames) {
    setAxes(v);
    last = router.tickCalib(dt);
  }
  return last;
}

test('EdgeTX throttle sweep -1 rest → +1 advances thi and tlo', () => {
  let axes = [0, 0, -1, 0, 0.1, -0.1, 0, 0];
  const getGamepads = () => [tx16sPad(axes)];
  const router = createRadioRouter({ storage: memStore(), getGamepads });
  router.pick();
  assert.equal(router.startCalib(), true);
  hold(router, 0.4, 3); // center, throttle already at -1
  axes = [1, 0, -1, 0, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // roll
  axes = [0, -1, -1, 0, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // pitch
  axes = [0, 0, -1, 1, 0.1, -0.1, 0, 0];
  hold(router, 0.25, 3); // yaw

  const setT = (v) => { axes = [0, 0, v, 0, 0.1, -0.1, 0, 0]; };
  // Pump then pin at +1 (Ryan's live hold). A 0.6s centered-delta hold stalled.
  sweepThrottle(router, setT, -1, 1, 0.04);
  setT(1);
  hold(router, 0.05, 4);
  const afterThi = router.tickCalib(0.05);
  assert.equal(afterThi.label, 'THROTTLE FULL DOWN', 'thi advanced after -1→+1 sweep');
  sweepThrottle(router, setT, 1, -1, 0.04);
  const afterTlo = router.tickCalib(0.05);
  assert.equal(afterTlo.skipAux, true, 'tlo advanced into arm/mode');
  router.skipCalibAux();
  const finished = router.skipCalibAux();
  assert.equal(finished.done, true);
  assert.equal(finished.axisMap.t.i, 2, 'detected by movement, not a hardcoded index');
  assert.ok(finished.axisMap.t.max > 0.5);
  assert.ok(finished.axisMap.t.min < -0.5);
  const mapped = applyAxisMap([0, 0, -1, 0, 0, 0, 0, 0], finished.axisMap);
  assert.ok(Math.abs(mapped.t) < 0.05, 'rest -1 is throttle 0');
  const full = applyAxisMap([0, 0, 1, 0, 0, 0, 0, 0], finished.axisMap);
  assert.ok(full.t > 0.95, 'full +1 is throttle 1');
});

test('wizard finds throttle on a non-AETR axis (index 3) by movement', () => {
  // Classic vs Advanced USB Joystick: throttle is NOT assumed on axis 2.
  let axes = [0, 0, 0, -1, 0, 0, 0, 0];
  const getGamepads = () => [tx16sPad(axes)];
  const router = createRadioRouter({ storage: memStore(), getGamepads });
  router.pick();
  router.startCalib();
  hold(router, 0.4, 3);
  axes = [1, 0, 0, -1, 0, 0, 0, 0];
  hold(router, 0.25, 3);
  axes = [0, -1, 0, -1, 0, 0, 0, 0];
  hold(router, 0.25, 3);
  axes = [0, 0, 1, -1, 0, 0, 0, 0];
  hold(router, 0.25, 3);
  const setT = (v) => { axes = [0, 0, 0, v, 0, 0, 0, 0]; };
  sweepThrottle(router, setT, -1, 1, 0.04);
  sweepThrottle(router, setT, 1, -1, 0.04);
  router.skipCalibAux();
  const finished = router.skipCalibAux();
  assert.equal(finished.done, true);
  assert.equal(finished.axisMap.t.i, 3);
  assert.equal(finished.axisMap.y.i, 2);
});

test('r/p/y cannot steal the EdgeTX throttle axis that rested at -1', () => {
  let axes = [0, 0, -1, 0, 0, 0, 0, 0];
  const gp = () => tx16sPad(axes);
  const calib = createCalibState();
  // center
  for (let i = 0; i < 4; i++) stepCalib(calib, gp(), 0.4);
  assert.equal(CAL_STEPS[calib.step].key, 'r');
  // yaw+throttle both move during the ROLL step — throttle is the bigger
  // delta, but it was already at an extreme so it must not become roll.
  axes = [0.7, 0, 1, 0, 0, 0, 0, 0];
  for (let i = 0; i < 4; i++) stepCalib(calib, gp(), 0.25);
  assert.equal(calib.result.r.i, 0, 'roll stays on the gimbal that left center');
  assert.equal(calib.used.has(2), false, 'throttle axis still free for thi');
});

test('Auto-detect clears a stale ryflyAxisMap even when gpName is empty', () => {
  const broken = {
    r: { i: 3, sign: -1 },
    p: { i: 2, sign: 1 },
    y: { i: 0, sign: -1 },
    t: { i: 1, min: 0, max: -1 },
  };
  const rates = '{"type":"BETAFLIGHT"}';
  const store = memStore({
    ryflyRates: rates,
    [AXIS_MAP_PREFIX + TX16S_SID]: JSON.stringify(broken),
    [RADIO_PRESET_PREFIX + TX16S_SID]: 'custom',
    [GP_ID_KEY]: TX16S_ID,
  });
  assert.equal(isValidAxisMap(broken), true);
  // No live gpName — Tune panel Auto-detect must still use ryflyGamepadId.
  assert.equal(clearRadioCalibration('', store), true);
  assert.equal(store.getItem(AXIS_MAP_PREFIX + TX16S_SID), null);
  assert.equal(store.getItem('ryflyRates'), rates, 'do not wipe other ryfly* keys');
  const prof = loadRadioProfile(TX16S_ID, store);
  assert.equal(prof.axisMap, null);

  const router = createRadioRouter({
    storage: store,
    getGamepads: () => [tx16sPad()],
  });
  // Router with a remembered pad, then clear as Auto-detect does.
  router.pick();
  saveAxisMap(TX16S_ID, broken, store);
  const cleared = router.clearCalibration();
  assert.equal(cleared.axisMap, null);
  assert.equal(router.axisMap, null);
  assert.equal(store.getItem(AXIS_MAP_PREFIX + TX16S_SID), null);
  assert.equal(store.getItem('ryflyRates'), rates);
});

test('Ryan live RM TX16S: pinned ax2=1.00 at THROTTLE FULL UP advances; aux -1 ignored', () => {
  // Live capture, Chrome Windows, device id as reported. Wizard step
  // 'THROTTLE FULL UP — hold', throttle held full up:
  const ID = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
  const rest = [0, 0, -1, 0, -1, -1, -1, -1];
  const ryanThi = [0.00, 0.01, 1.00, 0.00, -1.00, -1.00, -1.00, -1.00];
  assert.equal(isRadio({ id: ID }), true);
  assert.equal(radioScore({ id: ID, mapping: '' }), 2);

  const gp = (axes) => ({ id: ID, index: 0, mapping: '', axes, buttons: [] });
  const calib = createCalibState();
  for (let i = 0; i < 4; i++) stepCalib(calib, gp(rest), 0.4);
  assert.equal(CAL_STEPS[calib.step].key, 'r');
  assert.equal(calib.thrCand.has(2), true);
  assert.equal(calib.thrCand.has(4), false, 'aux at -1 is not a throttle candidate');
  assert.equal(calib.thrCand.has(7), false);

  for (let i = 0; i < 3; i++) stepCalib(calib, gp([1, 0, -1, 0, -1, -1, -1, -1]), 0.25);
  for (let i = 0; i < 3; i++) stepCalib(calib, gp([0, -1, -1, 0, -1, -1, -1, -1]), 0.25);
  for (let i = 0; i < 3; i++) stepCalib(calib, gp([0, 0, -1, 1, -1, -1, -1, -1]), 0.25);
  assert.equal(CAL_STEPS[calib.step].key, 'thi');

  // Jump to the exact live snapshot with no extra rest frame on thi.
  for (let i = 0; i < 8; i++) stepCalib(calib, gp(ryanThi), 0.05);
  assert.equal(CAL_STEPS[calib.step].key, 'tlo', 'held ax2=1.00 must advance thi');
  assert.equal(calib.result.t.i, 2);
  assert.ok(calib.result.t.max >= 0.95);
  assert.ok(calib.result.t.min < -0.5);
  assert.equal(calib.used.has(4), false);
  assert.equal(calib.used.has(5), false);
  assert.equal(calib.used.has(6), false);
  assert.equal(calib.used.has(7), false);

  const mappedUp = applyAxisMap(ryanThi, {
    r: { i: 0, sign: 1 }, p: { i: 1, sign: -1 }, y: { i: 3, sign: 1 },
    t: calib.result.t,
  });
  assert.ok(mappedUp.t > 0.95, 'pinned full-up is throttle 1');
});

test('garbage saved axis map is ignored on load', () => {
  const store = memStore({
    [AXIS_MAP_PREFIX + TX16S_SID]: '{"nope":true}',
  });
  const prof = loadRadioProfile(TX16S_ID, store);
  assert.equal(prof.axisMap, null);
  assert.equal(isValidAxisMap(null), false);
  assert.equal(isValidAxisMap({ r: { i: 0 } }), false);
});

test('known radios guess Mode 2 AETR and plug-and-fly without a saved map', () => {
  assert.equal(guessRadioPreset(tx16sPad()), 'radiomaster');
  assert.equal(guessRadioPreset({ id: 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)' }), 'radiomaster');
  assert.equal(guessRadioPreset({ id: 'Jumper T20 Joystick' }), 'jumper');
  assert.equal(isKnownRadio(tx16sPad()), true);
  assert.equal(radioShortName(tx16sPad()), 'TX16S');
  const store = memStore();
  let axes = [0, 0, -1, 0, -1, -1, -1, -1];
  const router = createRadioRouter({ storage: store, getGamepads: () => [tx16sPad(axes)] });
  router.pick();
  assert.equal(router.radioPreset, 'radiomaster');
  assert.equal(router.axisMap, null);
  const rest = router.readStick();
  assert.ok(rest.stick.t < 0.02, 'un-calibrated AETR rest -1 is throttle 0');
  axes = [0, 1, -1, 0, -1, -1, -1, -1];
  const fwd = router.readStick();
  assert.ok(fwd.stick.p > 0.9, `plug-and-fly HID pitch +1 → stick.p ${fwd.stick.p}`);
  assert.ok(simSrc.includes('detected, Mode 2 loaded'));
  assert.ok(simSrc.includes('toastRecalib') || simSrc.includes('Recalibrate'));
  assert.ok(simSrc.includes('skipSafeUntil'), 'do not overwrite the plug-and-fly toast with STICKS SAFE');
  const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');
  assert.ok(feelSrc.includes('id="feelRadio"') || feelSrc.includes('feelRadio'));
});

test('TX16S ax2 -1..+1 aux -1: full throttle lifts with 3D off and on', () => {
  const rest = [0, 0, -1, 0, -1, -1, -1, -1];
  const full = [0, 0, 1, 0, -1, -1, -1, -1];
  const curve = 0.68;
  const hoverN = PRESETS.whoop65.mass * 9.81;
  for (const threeD of [false, true]) {
    const low = applyAxisMap(rest, AETR_MAP, { threeD });
    const hi = applyAxisMap(full, AETR_MAP, { threeD });
    assert.ok(low.t < 0.02, `3D=${threeD} rest t=${low.t}`);
    assert.ok(hi.t > 0.95, `3D=${threeD} full t=${hi.t} — radio is not spring-mapped`);
    const coll = throttleCollective(hi.t, threeD, curve);
    assert.ok(coll > 0.85, `3D=${threeD} collective ${coll}`);
    const qp = new QuadPhysics(PRESETS.whoop65);
    qp.reset({ x: 0, y: 0, z: 0.2 });
    qp.setThreeD(threeD);
    qp.arm();
    for (let i = 0; i < 500; i++) {
      qp.step(0.002, { roll: 0, pitch: 0, yaw: 0 }, coll, { r: 0, p: 0, y: 0 });
    }
    assert.ok(qp.totalThrustN > hoverN, `3D=${threeD} thrust ${qp.totalThrustN} vs hover ${hoverN}`);
    const dead = new QuadPhysics(PRESETS.whoop65);
    dead.reset({ x: 0, y: 0, z: 0.2 });
    dead.setThreeD(threeD);
    for (let i = 0; i < 200; i++) {
      dead.step(0.002, { roll: 0, pitch: 0, yaw: 0 }, coll, { r: 0, p: 0, y: 0 });
    }
    assert.ok(Math.abs(dead.totalThrustN) < hoverN * 0.15, `disarmed 3D=${threeD} still thrusting ${dead.totalThrustN}`);
  }
  const padCenter = applyAxisMap([0, 0, 0, 0], PAD_MAP, { threeD: true });
  assert.ok(Math.abs(padCenter.t - 0.5) < 1e-9, 'spring 3D center is 0.5');
  assert.equal(armHintText(false), 'Raise throttle to fly (auto-arm)');
  assert.ok(simSrc.includes('Raise throttle to fly (auto-arm)'));
  assert.ok(simSrc.includes('id="hudArmHint"'));
});

test('auto-arm from low throttle; never arms if throttle starts high', () => {
  let st = { seenLow: false };
  let out = stepAutoArm(st, { t: 1, threeD: false, armed: false, autoArm: true, hasSwitch: false });
  assert.equal(out.arm, false, 'mid-stick start must not arm');
  st = out.state;
  out = stepAutoArm(st, { t: 1, threeD: false, armed: false, autoArm: true, hasSwitch: false });
  assert.equal(out.arm, false);
  st = { seenLow: false };
  out = stepAutoArm(st, { t: 0, threeD: false, armed: false, autoArm: true, hasSwitch: false });
  assert.equal(out.arm, false);
  assert.equal(out.state.seenLow, true);
  out = stepAutoArm(out.state, { t: 0.4, threeD: false, armed: false, autoArm: true, hasSwitch: false });
  assert.equal(out.arm, true);
  out = stepAutoArm({ seenLow: true }, { t: 0.4, threeD: false, armed: false, autoArm: true, hasSwitch: true });
  assert.equal(out.arm, false, 'mapped switch disables auto-arm');
  st = { seenLow: false };
  out = stepAutoArm(st, { t: 0.5, threeD: true, armed: false, autoArm: true, hasSwitch: false });
  assert.equal(out.state.seenLow, true);
  out = stepAutoArm(out.state, { t: 0.8, threeD: true, armed: false, autoArm: true, hasSwitch: false });
  assert.equal(out.arm, true);
});

test('arm switch aux -1 → +1 arms; high throttle blocks', () => {
  const arm = { i: 4, sign: 1 };
  assert.equal(hasArmSwitch({ arm }), true);
  assert.equal(hasArmSwitch(AETR_MAP), false);
  let sw = { prev: null };
  const rest = tx16sPad([0, 0, -1, 0, -1, -1, -1, -1]);
  assert.equal(armSwitchValue(rest, arm), -1);
  sw = stepArmSwitch(sw, { value: -1, armed: false, hasSwitch: true, throttleSafe: true }).state;
  const flipped = tx16sPad([0, 0, -1, 0, 1, -1, -1, -1]);
  assert.equal(armSwitchValue(flipped, arm), 1);
  const ok = stepArmSwitch(sw, { value: 1, armed: false, hasSwitch: true, throttleSafe: true });
  assert.equal(ok.arm, true);
  assert.equal(ok.blocked, false);
  sw = { prev: -1 };
  const blocked = stepArmSwitch(sw, { value: 1, armed: false, hasSwitch: true, throttleSafe: false });
  assert.equal(blocked.arm, false);
  assert.equal(blocked.blocked, true);
});

test('TX16S aux rest at -1 is never auto-picked; detect waits for a flip', () => {
  const rest = tx16sPad([0, 0, -1, 0, -1, -1, -1, -1]);
  const prev = snapshotArmInputs(rest);
  assert.equal(detectArmSwitch(prev, rest, AETR_MAP), null);
  const same = detectArmSwitch(prev, rest, AETR_MAP);
  assert.equal(same, null);
  const flipped = tx16sPad([0, 0, -1, 0, 1, -1, -1, -1]);
  const found = detectArmSwitch(prev, flipped, AETR_MAP);
  assert.ok(found);
  assert.equal(found.i, 4);
  assert.equal(found.sign, 1);
  const stick = detectArmSwitch(snapshotArmInputs(rest), tx16sPad([0, 0, 1, 0, -1, -1, -1, -1]), AETR_MAP);
  assert.equal(stick, null, 'throttle axis is not an arm switch');
  const cands = listArmCandidates(rest, AETR_MAP);
  assert.deepEqual(cands.axes.map((c) => c.i), [4, 5, 6, 7]);
});

test('TX16S replay: auto-arm on throttle rise, switch overlay persists', () => {
  const rest = [0, 0, -1, 0, -1, -1, -1, -1];
  const full = [0, 0, 1, 0, -1, -1, -1, -1];
  let st = { seenLow: false };
  let t = applyAxisMap(rest, AETR_MAP).t;
  st = stepAutoArm(st, { t, threeD: false, armed: false, autoArm: true, hasSwitch: false }).state;
  t = applyAxisMap(full, AETR_MAP).t;
  const up = stepAutoArm(st, { t, threeD: false, armed: false, autoArm: true, hasSwitch: false });
  assert.equal(up.arm, true);
  const store = memStore();
  assert.equal(loadAutoArm(store), true);
  saveAutoArm(false, store);
  assert.equal(store.getItem(AUTOARM_KEY), '0');
  assert.equal(loadAutoArm(store), false);
  saveArmSwitch(TX16S_ID, { i: 4, sign: 1 }, store);
  assert.equal(loadArmSwitch(TX16S_ID, store).i, 4);
  assert.ok(store.getItem(ARM_SWITCH_PREFIX + TX16S_SID));
  assert.equal(hasArmSwitch(mergeArmSwitch(AETR_MAP, loadArmSwitch(TX16S_ID, store))), true);
  assert.ok(simSrc.includes('id="cbAutoArm"'));
  assert.ok(simSrc.includes('id="armSwitch"'));
  assert.ok(simSrc.includes('id="btnArmDetect"'));
  assert.ok(simSrc.includes('Flip arm switch') || simSrc.includes('armHintText'));
});

test('old default AETR pitch invert migrates; custom wizard invert is kept', () => {
  const oldDefault = {
    r: { i: 0, sign: 1 },
    p: { i: 1, sign: -1 },
    y: { i: 3, sign: 1 },
    t: { i: 2, min: -1, max: 1 },
    arm: { i: 4, sign: 1 },
  };
  assert.equal(AETR_MAP.p.sign, 1, 'in-code radio default is channel polarity');
  assert.equal(PAD_MAP.p.sign, -1, 'gamepad RY stays Y-up inverted');
  assert.equal(migrateAxisMap(oldDefault, 'radiomaster').p.sign, 1);
  assert.equal(migrateAxisMap(oldDefault, 'custom').p.sign, -1,
    'wizard-measured invert must not be silently flipped');

  const store = memStore({
    [AXIS_MAP_PREFIX + TX16S_SID]: JSON.stringify(oldDefault),
    [RADIO_PRESET_PREFIX + TX16S_SID]: 'radiomaster',
  });
  const prof = loadRadioProfile(TX16S_ID, store);
  assert.equal(prof.axisMap.p.sign, 1);
  assert.equal(prof.axisMap.ver, AXIS_MAP_VER);
  assert.equal(prof.axisMap.arm.i, 4, 'arm overlay survives migrate');
  const persisted = JSON.parse(store.getItem(AXIS_MAP_PREFIX + TX16S_SID));
  assert.equal(persisted.p.sign, 1);
  const again = loadRadioProfile(TX16S_ID, store);
  assert.equal(again.axisMap.p.sign, 1, 'migrate is once');

  const wizard = memStore({
    [AXIS_MAP_PREFIX + TX16S_SID]: JSON.stringify(oldDefault),
    [RADIO_PRESET_PREFIX + TX16S_SID]: 'custom',
  });
  const kept = loadRadioProfile(TX16S_ID, wizard);
  assert.equal(kept.axisMap.p.sign, -1);
  assert.equal(kept.axisMap.ver, AXIS_MAP_VER);
});

test('TX16S Mode 2 stick-forward HID +1 produces forward velocity', () => {
  const mapped = applyAxisMap([0, 1, 0.2, 0], AETR_MAP);
  assert.ok(mapped.p > 0.9, `stick.p ${mapped.p}`);
  const pad = applyAxisMap([0, 0, 0, -1], PAD_MAP);
  assert.ok(pad.p > 0.9, `gamepad RY-up stick.p ${pad.p}`);
  const qp = new QuadPhysics(PRESETS.whoop65);
  qp.setFlightMode('acro');
  qp.reset({ x: 0, y: 0, z: 4 });
  qp.arm();
  const hover = Math.sqrt(PRESETS.whoop65.mass * 9.81 / (PRESETS.whoop65.maxThrustPerMotor * 4));
  const idle = PRESETS.whoop65.idleThrottle;
  const coll = Math.max(0, Math.min(1, (hover - idle) / (1 - idle)));
  const stick = { r: 0, p: mapped.p, y: 0 };
  const sp = { roll: 0, pitch: mapped.p * 8, yaw: 0 };
  const dt = 1 / qp.physicsHz;
  for (let i = 0; i < Math.round(0.25 / dt); i++) qp.step(dt, sp, coll, stick);
  assert.ok(qp.velocity.x > 0.15, `+X vel ${qp.velocity.x.toFixed(3)} — stick forward must fly forward`);
});
