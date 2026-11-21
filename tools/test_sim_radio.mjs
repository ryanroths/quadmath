// TX16S / EdgeTX HID: mapping, calibration persistence, touch-off when a pad is live.
// Node stdlib only: `node --test tools/test_sim_radio.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AXIS_MAP_PREFIX, RADIO_PRESET_PREFIX, GP_ID_KEY,
  sanitizeId, isRadio, radioScore, pickPreferredPad, AETR_MAP, PAD_MAP, defaultMapFor,
  applyAxisMap, applyDeadzone, RADIO_DZ, loadRadioProfile, saveAxisMap, saveRadioPreset,
  AXIS_MAP_VER, migrateAxisMap,
  clearRadioCalibration, isValidAxisMap, shouldEnableTouch,
  createRadioRouter, CAL_STEPS, createCalibState, stepCalib,
  guessRadioPreset, isKnownRadio, radioShortName,
  AUTOARM_KEY, ARM_SWITCH_PREFIX, loadAutoArm, saveAutoArm,
  loadArmSwitch, saveArmSwitch, mergeArmSwitch, hasArmSwitch,
  listArmCandidates, detectArmSwitch, snapshotArmInputs,
  armSwitchValue, stepArmSwitch,
  isEdgeTxUsb, isEdgeTxRadio, looksLikeRadio, classifyPad, usablePad, provenPad, rankPads, forgetDevice,
  createPadTracker, EDGETX_CLASSIC_MIN_AXES,
  radioIssuePad, RADIO_CLASSIC_MSG, RADIO_PRESETS, PAD_STALE_MS,
  calibAxisChoices, calibPickAxis,
} from '../sim-touch.js';
import { bfRatesDefaultId } from '../sim-rates.js';
import { QuadPhysics, PRESETS } from '../quadphysics.js';
import { throttleCollective, armHintText, stepAutoArm } from '../sim-3d.js';
import { stickDots } from '../sim-feel.js';

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

  // Calibration wizard on 8 axes, the sticks only, persist.
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
  const finished = router.tickCalib(0.25); // throttle down, the last step
  assert.equal(finished.done, true);
  assert.equal(finished.axisMap.arm, undefined, 'calibration has no arm switch');
  assert.equal(finished.axisMap.mode, undefined, 'calibration has no mode switch');
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

test('a remembered Xbox pad does not beat a TX16S plugged in beside it; a remembered radio still wins among radios', () => {
  const xbox = { id: 'Xbox One Game Controller (STANDARD GAMEPAD)', index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
  const radio = tx16sPad([0, 0, -1, 0, -1, -1, -1, -1], { id: 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)', index: 1 });
  const zorro = { id: 'RadioMaster Zorro Joystick', index: 2, mapping: '', axes: [0, 0, -1, 0], buttons: [] };
  // The Xbox pad was seen alone first, so it was remembered unasked.
  assert.equal(pickPreferredPad([xbox], null).id, xbox.id);
  assert.equal(pickPreferredPad([xbox, radio], xbox.id).id, radio.id, 'the radio outranks a remembered gamepad');
  assert.equal(pickPreferredPad([xbox], xbox.id).id, xbox.id, 'alone, the remembered gamepad flies');
  assert.equal(pickPreferredPad([radio, zorro], zorro.id).id, zorro.id, 'among radios the remembered one wins');
  assert.equal(pickPreferredPad([xbox, radio], radio.id).id, radio.id);
  // The router: the Xbox pad alone, then the TX16S plugged in too.
  const store = memStore();
  let pads = [xbox];
  const router = createRadioRouter({ storage: store, getGamepads: () => pads });
  assert.equal(router.pick().id, xbox.id);
  assert.equal(store.getItem(GP_ID_KEY), xbox.id, 'a lone pad is remembered');
  pads = [xbox, radio];
  assert.equal(router.pick().id, radio.id, 'the TX16S flies once it is plugged in');
  assert.equal(router.gpIndex, 1);
  // The page picks with the same rule.
  assert.ok(simSrc.includes('const best=pickPreferredPad(pads,remembered);'), 'sim.html pickGamepad uses pickPreferredPad');
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
  assert.deepEqual(CAL_STEPS.map((s) => s.key), ['center', 'r', 'p', 'y', 'thi', 'tlo'], 'sticks only');
});

test('stick HUD is mode 2: the overlay, left box yaw/throttle, right box roll/pitch', () => {
  assert.match(simSrc, /#feelHud\{[^}]*pointer-events:none;\s*flex-direction:\s*row;/);
  assert.equal(/#feelHud\{[^}]*row-reverse/.test(simSrc), false);
  // The sticks moved from #feelHud's pads to the stick overlay (one canvas).
  assert.equal(simSrc.includes('id="stickDotL"'), false, 'no second stick display');
  assert.ok(simSrc.includes('<canvas id="stickOverlay"'));
  const c = stickDots({ r: 0, p: 0, y: 0, t: 0.5 }, 72);
  const yawRight = stickDots({ r: 0, p: 0, y: 1, t: 0.5 }, 72);
  const thrUp = stickDots({ r: 0, p: 0, y: 0, t: 1 }, 72);
  const rollRight = stickDots({ r: 1, p: 0, y: 0, t: 0.5 }, 72);
  const pitchUp = stickDots({ r: 0, p: 1, y: 0, t: 0.5 }, 72);
  assert.ok(yawRight.l.x > c.l.x && yawRight.r.x === c.r.x, 'left box x is yaw');
  assert.ok(thrUp.l.y < c.l.y && thrUp.r.y === c.r.y, 'left box y is throttle, up is more');
  assert.ok(rollRight.r.x > c.r.x && rollRight.l.x === c.l.x, 'right box x is roll');
  assert.ok(pitchUp.r.y < c.r.y && pitchUp.l.y === c.l.y, 'right box y is pitch, forward is up');
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
    if (last.done) break;
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
  const finished = sweepThrottle(router, setT, 1, -1, 0.04);
  assert.equal(finished.done, true, 'tlo is the last step');
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
  const finished = sweepThrottle(router, setT, 1, -1, 0.04);
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

// ---- Radio detection and device picking ----
// A RadioMaster TX15 on Windows Chrome showed as "Unknown Gamepad": no product
// name, so the name match missed it and it flew the gamepad layout. Every
// EdgeTX/OpenTX radio is USB 1209:4F54; the id carries that however the
// browser spells it.
const UNKNOWN_EDGETX = 'Unknown Gamepad (Vendor: 1209 Product: 4f54)';
const FIREFOX_EDGETX = '1209-4f54-RadioMaster TX15 Joystick';
const CLASSIC_REST = [0, 0, -1, 0, -1, -1, -1, -1];
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const F310 = 'Logitech Gamepad F310 (STANDARD GAMEPAD Vendor: 046d Product: c21d)';
const HEADSET = 'Jabra Evolve2 65 (Vendor: 0b0e Product: 0302)';

function pad(id, index, axes, extras) {
  return Object.assign({
    id, index, mapping: '', connected: true, axes: axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, value: 0 })),
  }, extras || {});
}
function xboxPad(index, id) {
  return pad(id || XBOX, index, [0, 0, 0, 0], { mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
}
function headsetPad(index) {
  return pad(HEADSET, index, [], { buttons: Array.from({ length: 4 }, () => ({ pressed: false, value: 0 })) });
}
// The full wizard on a Classic layout: roll ax0, pitch ax1, throttle ax2, yaw ax3.
function calibrateClassic(router, setAxes) {
  setAxes([0, 0, -1, 0, -1, -1, -1, -1]);
  hold(router, 0.4, 3);
  setAxes([1, 0, -1, 0, -1, -1, -1, -1]);
  hold(router, 0.25, 3);
  setAxes([0, -1, -1, 0, -1, -1, -1, -1]);
  hold(router, 0.25, 3);
  setAxes([0, 0, -1, 1, -1, -1, -1, -1]);
  hold(router, 0.25, 3);
  setAxes([0, 0, 1, 0, -1, -1, -1, -1]);
  hold(router, 0.25, 3);
  setAxes([0, 0, -1, 0, -1, -1, -1, -1]);
  return router.tickCalib(0.25);
}

test('EdgeTX by USB id: Chrome "Unknown Gamepad" and Firefox ids are radios; throttle on ax2 at rest -1; calibration completes', () => {
  for (const id of [UNKNOWN_EDGETX, FIREFOX_EDGETX, 'Unknown Gamepad (STANDARD GAMEPAD Vendor: 1209 Product: 4F54)', '1209-4f54-']) {
    const gp = pad(id, 0, CLASSIC_REST);
    assert.equal(isEdgeTxUsb(gp), true, id);
    assert.equal(isRadio(gp), true, id);
    assert.equal(isKnownRadio(gp), true, id);
    assert.equal(guessRadioPreset(gp), 'radiomaster', id);
    assert.equal(radioScore(gp), 2, id);
    assert.equal(defaultMapFor(gp), AETR_MAP, id + ': never the gamepad layout');
    const c = classifyPad(gp);
    assert.deepEqual([c.radio, c.how, c.edgetx, c.sticks, c.issue], [true, 'usb', true, true, null], id);
  }
  assert.equal(radioShortName({ id: UNKNOWN_EDGETX }), 'EdgeTX radio');
  assert.equal(radioShortName({ id: FIREFOX_EDGETX }), 'TX15');
  // Both numbers, never 1209 alone: other pid.codes devices share the vendor.
  for (const id of ['Thing (Vendor: 1209 Product: 0001)', 'Pad (Vendor: 21209 Product: 4f54)', '1209-4f540-x', 'Unknown Gamepad (Vendor: 0483 Product: 5750)']) {
    assert.equal(isEdgeTxUsb({ id }), false, id);
    assert.equal(isRadio({ id }), false, id);
  }

  for (const id of [UNKNOWN_EDGETX, FIREFOX_EDGETX]) {
    let axes = CLASSIC_REST.slice();
    const store = memStore();
    const router = createRadioRouter({ storage: store, getGamepads: () => [pad(id, 0, axes)] });
    assert.equal(router.pick().id, id);
    assert.equal(router.radioPreset, 'radiomaster', 'plug-and-fly AETR preset, saved');
    assert.equal(store.getItem(RADIO_PRESET_PREFIX + sanitizeId(id)), 'radiomaster');
    assert.equal(router.notice, '', 'Classic: no message');
    const rest = router.readStick();
    assert.equal(rest.map.t.spring, undefined, 'a radio throttle has no spring');
    assert.ok(Math.abs(rest.stick.t) < 1e-9, 'ax2 at -1 is throttle 0');
    axes = [0, 0, 1, 0, -1, -1, -1, -1];
    assert.ok(router.readStick().stick.t > 0.999, 'ax2 at +1 is full throttle');
    axes = [0, 0, 0, 0, -1, -1, -1, -1];
    assert.ok(Math.abs(router.readStick().stick.t - 0.5) < 1e-9, 'mid-stick is half');
    axes = [0.6, 0, -1, 0, -1, -1, -1, -1];
    assert.ok(router.readStick().stick.r > 0.5, 'roll on ax0');

    assert.equal(router.startCalib(), true);
    const done = calibrateClassic(router, (a) => { axes = a; });
    assert.equal(done.done, true, id + ': calibration completes');
    assert.deepEqual([done.axisMap.r.i, done.axisMap.p.i, done.axisMap.y.i, done.axisMap.t.i], [0, 1, 3, 2]);
    assert.ok(done.axisMap.t.max > 0.95 && done.axisMap.t.min < -0.95, 'the throttle end to end');
  }
});

test('the newer EdgeTX radios by name: TX15, TX12, MT12, GX12, Pocket, Boxer, Zorro', () => {
  const names = { tx15: 'TX15', tx12: 'TX12', mt12: 'MT12', gx12: 'GX12', pocket: 'Pocket', boxer: 'Boxer', zorro: 'Zorro' };
  for (const [key, short] of Object.entries(names)) {
    // The name only, no USB numbers and no brand (as a browser that shows no
    // USB id, or firmware whose name carries no brand, gives it).
    const gp = pad(key.toUpperCase() + ' Joystick', 0, CLASSIC_REST);
    assert.equal(isRadio(gp), true, key);
    assert.equal(isEdgeTxRadio(gp), true, key);
    assert.equal(guessRadioPreset(gp), 'radiomaster', key);
    assert.equal(radioScore(gp), 2, key);
    assert.equal(radioShortName(gp), short, key);
    assert.equal(classifyPad(gp).how, 'name', key);
  }
});

test('an EdgeTX radio sending only 3 stick axes: the Classic-mode message, never flown on a gamepad layout', () => {
  assert.equal(RADIO_CLASSIC_MSG, "Radio found, but throttle isn't coming through. On the radio: Model Settings → USB Joystick → Classic, then replug.");
  const tx15 = pad('RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)', 0, [0, 0, 0]);
  const c = classifyPad(tx15);
  assert.deepEqual([c.radio, c.edgetx, c.sticks, c.issue], [true, true, false, 'classic']);
  assert.equal(usablePad(tx15), false, 'three axes cannot fly');
  assert.equal(pickPreferredPad([tx15], null), null);

  // Alone: nothing flies it; the keyboard keeps the sticks; the message stands.
  const store = memStore();
  const alone = createRadioRouter({ storage: store, getGamepads: () => [tx15] });
  assert.equal(alone.pick(), null);
  assert.equal(alone.gpConnected, false);
  assert.equal(alone.notice, RADIO_CLASSIC_MSG);
  assert.equal(alone.readStick().source, 'keyboard');
  assert.equal(store.getItem(GP_ID_KEY), null, 'not remembered');
  assert.equal(store.getItem(RADIO_PRESET_PREFIX + sanitizeId(tx15.id)), null, 'no gamepad preset saved for it');
  assert.deepEqual(alone.list(), []);

  // Beside an Xbox pad: the pad flies, the radio is not offered, the message stands.
  const both = createRadioRouter({ storage: memStore(), getGamepads: () => [tx15, xboxPad(1)] });
  assert.equal(both.pick().id, XBOX);
  assert.equal(both.notice, RADIO_CLASSIC_MSG);
  assert.deepEqual(both.list().map((p) => p.id), [XBOX]);

  // Advanced mode with no channel set: 0 axes, a few buttons, like a headset.
  // Never offered, and still the message, never silence.
  const bare = pad('RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)', 0, [], { buttons: Array.from({ length: 4 }, () => ({ pressed: false, value: 0 })) });
  assert.equal(classifyPad(bare).issue, 'classic');
  const bareRouter = createRadioRouter({ storage: memStore(), getGamepads: () => [bare] });
  assert.equal(bareRouter.pick(), null);
  assert.equal(bareRouter.notice, RADIO_CLASSIC_MSG);

  // Classic as browsers show it: 8 axes (Chrome, Firefox on Windows), 7 (an
  // OpenTX 2.3 radio), 6 (Safari, Firefox on macOS). No message for those.
  assert.equal(EDGETX_CLASSIC_MIN_AXES, 6);
  for (const n of [6, 7, 8]) assert.equal(classifyPad(pad(UNKNOWN_EDGETX, 0, CLASSIC_REST.slice(0, n))).issue, null, n + ' axes');
  assert.equal(classifyPad(pad(UNKNOWN_EDGETX, 0, [0, 0, -1, 0, -1])).issue, 'classic', '5 axes');

  // Advanced mode, CH1 X, CH2 Y, CH3 a Sim throttle, CH4 Z: Chrome puts the
  // throttle at the lowest free index, 3, where AETR expects yaw. Flown as a
  // radio (AETR), never the gamepad layout, and the message.
  const adv = pad('RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)', 0, [0, 0, 0, -1]);
  assert.equal(classifyPad(adv).issue, 'classic');
  const advRouter = createRadioRouter({ storage: memStore(), getGamepads: () => [adv] });
  assert.equal(advRouter.pick().id, adv.id);
  assert.equal(advRouter.radioPreset, 'radiomaster');
  const st = advRouter.readStick();
  assert.equal(st.map.t.spring, undefined, 'never the sprung gamepad throttle');
  assert.equal(st.map.t.i, 2);
  assert.equal(advRouter.notice, RADIO_CLASSIC_MSG);
  // A calibration made on this layout (its axis count saved with it) clears it.
  const cal = memStore();
  saveAxisMap(adv.id, { r: { i: 0, sign: 1 }, p: { i: 1, sign: 1 }, y: { i: 2, sign: 1 }, t: { i: 3, min: -1, max: 1 }, n: 4 }, cal);
  const fewer = pad(adv.id, 0, [0, 0, 0]);
  assert.equal(radioIssuePad([fewer], cal), fewer, 'a calibration onto an axis it no longer sends does not');
  assert.equal(radioIssuePad([adv], cal), null);
  assert.equal(radioIssuePad([adv], memStore()), adv);
  // The page shows it and keeps such a radio off the sticks.
  assert.ok(simSrc.includes('toast(RADIO_CLASSIC_MSG'), 'sim.html toasts the message');
  assert.ok(simSrc.includes(`<span class="radio-warn">'+escapeHtml(RADIO_CLASSIC_MSG)`), 'and keeps it in Tune’s radio line');
  assert.ok(simSrc.includes('return rankPads(out.filter('), 'listPads offers usable devices only');
});

test('a headset (0 axes, a few buttons) is never listed or auto-selected; beside a radio, the radio flies', () => {
  const headset = headsetPad(0);
  assert.equal(usablePad(headset), false);
  assert.equal(classifyPad(headset).sticks, false);
  assert.equal(pickPreferredPad([headset], null), null);
  assert.equal(pickPreferredPad([headset], HEADSET), null, 'not even when remembered');
  const remote = pad('Media Remote (Vendor: 05ac Product: 8242)', 0, [0, 0]);
  assert.equal(usablePad(remote), false, 'a 2-axis media remote');

  const alone = createRadioRouter({ storage: memStore(), getGamepads: () => [headset] });
  assert.equal(alone.pick(), null, 'a lone headset is never picked');
  assert.deepEqual(alone.list(), []);
  assert.equal(alone.readStick().source, 'keyboard');

  // The pilot's case: the headset was remembered by mistake.
  const radio = pad(UNKNOWN_EDGETX, 1, CLASSIC_REST);
  const store = memStore({ [GP_ID_KEY]: HEADSET });
  const router = createRadioRouter({ storage: store, getGamepads: () => [headset, radio] });
  assert.equal(router.pick().id, UNKNOWN_EDGETX, 'the radio flies');
  assert.equal(store.getItem(GP_ID_KEY), UNKNOWN_EDGETX, 'and replaces the remembered headset');
  assert.deepEqual(router.list().map((p) => p.id), [UNKNOWN_EDGETX], 'the headset is never offered');
  assert.equal(pickPreferredPad([headset, radio], HEADSET).id, UNKNOWN_EDGETX);
  // With two devices that can fly as well, the remembered headset is still
  // replaced by the one flying, unasked.
  const store2 = memStore({ [GP_ID_KEY]: HEADSET });
  const router2 = createRadioRouter({ storage: store2, getGamepads: () => [headset, radio, xboxPad(2)] });
  assert.equal(router2.pick().id, UNKNOWN_EDGETX);
  assert.equal(store2.getItem(GP_ID_KEY), UNKNOWN_EDGETX, 'remembered in the headset’s place');

  // A keyboard's gamepad interface: four axes that never move. Passed over
  // while anything proven can fly; offered once they move.
  let t = 0;
  let kbAxes = [0, 0, 0, 0];
  const KB = 'Gaming Keyboard (Vendor: 1532 Product: 0257)';
  const kb = () => pad(KB, 0, kbAxes);
  const tracker = createPadTracker();
  tracker.see([kb()], 0);
  assert.equal(provenPad(kb(), tracker), false);
  assert.equal(provenPad(xboxPad(1), tracker), true, 'a standard gamepad is a controller as it is');
  assert.equal(provenPad(pad(TX16S_ID, 2, CLASSIC_REST), tracker), true, 'so is a radio');
  const kbRouter = createRadioRouter({ storage: memStore(), getGamepads: () => [kb(), xboxPad(1)], now: () => t });
  assert.equal(kbRouter.pick().id, XBOX, 'the gamepad flies');
  assert.deepEqual(kbRouter.list().map((p) => p.id), [XBOX], 'the keyboard interface is not offered');
  t = 60000;
  kbAxes = [0.6, 0, 0, 0];
  assert.deepEqual(kbRouter.list().map((p) => p.id).sort(), [KB, XBOX].sort(), 'once a stick moves, it is offered');
  // Alone it may be the pilot's: offered (the page passes it over once the
  // keyboard flies and it still has not moved).
  assert.deepEqual(rankPads([kb()], createPadTracker()).map((p) => p.id), [KB]);
  assert.ok(simSrc.includes("dropPad('NOT A CONTROLLER');"));
});

test('unrecognised but shaped like a radio (6+ axes, some at -1, not standard): AETR Mode 2, a radio', () => {
  const id = 'USB Gamepad (Vendor: 0483 Product: 5750)';
  const gp = pad(id, 0, [0, 0, -1, 0, -1, -1, 1, -1], { buttons: [] });
  assert.equal(isRadio(gp), false, 'nothing names it');
  assert.equal(looksLikeRadio(gp), true);
  assert.deepEqual([classifyPad(gp).radio, classifyPad(gp).how], [true, 'shape']);
  assert.equal(guessRadioPreset(gp), 'aetr');
  assert.equal(RADIO_PRESETS.aetr.map, AETR_MAP);
  assert.equal(radioScore(gp), 1, 'ranked with the unnamed devices, below a named radio (as on main)');
  assert.equal(radioShortName(gp), 'Radio');
  // Not radios: a standard pad, a 4-axis pad, a dead interface at -1 everywhere.
  assert.equal(looksLikeRadio({ id: 'x', mapping: 'standard', axes: [0, 0, -1, 0, -1, -1] }), false);
  assert.equal(looksLikeRadio({ id: 'x', mapping: '', axes: [0, 0, -1, 0] }), false);
  assert.equal(looksLikeRadio({ id: 'x', mapping: '', axes: [-1, -1, -1, -1, -1, -1, -1, -1] }), false);
  assert.equal(looksLikeRadio({ id: 'x', mapping: '', axes: [0, 0, 0, 0, 0, 0] }), false, 'nothing at -1');

  let axes = [0, 0, -1, 0, -1, -1, 1, -1];
  const store = memStore();
  const router = createRadioRouter({ storage: store, getGamepads: () => [pad(id, 0, axes)] });
  router.pick();
  assert.equal(router.radioPreset, 'aetr');
  assert.equal(store.getItem(RADIO_PRESET_PREFIX + sanitizeId(id)), 'aetr', 'saved: one tap in the preset picker changes it');
  assert.ok(router.readStick().stick.t < 1e-9);
  axes = [0, 1, 1, 0, -1, -1, 1, -1];
  const up = router.readStick().stick;
  assert.ok(up.t > 0.999 && up.p > 0.9, 'AETR, Mode 2: ax2 throttle, ax1 pitch');
  assert.ok(simSrc.includes("'Looks like a radio: flying it AETR, Mode 2. '"), 'the page says so');
  assert.ok(simSrc.includes('id="toastPreset">Change preset</button>'), 'with the preset picker one tap away');
  assert.ok(simSrc.includes('if(presetBtn)presetBtn.onclick=function(e){e.preventDefault();openRadioPreset();};'));
});

test('rates: a radio found by USB id, name or shape gets the radio default (Cruise), a gamepad Beginner', () => {
  assert.equal(bfRatesDefaultId('radio'), 'cruise');
  assert.equal(bfRatesDefaultId('gamepad'), 'beginner');
  // The page's input kind: padIsRadio, which takes the kind worked out when
  // the device was picked (classifyPad), so a calibrated radio stays one.
  assert.ok(simSrc.includes("function bfInputKind(){return gpConnected?(padIsRadio({id:gpName})?'radio':'gamepad')"));
  assert.ok(simSrc.includes('  if(gp&&gp.id===gpName)return padTakenForRadio()||'));
  assert.ok(simSrc.includes('if(!padKinds.has(gp.id))padKinds.set(gp.id,sessionKind(gp,padTracker));'));
  for (const gp of [pad(UNKNOWN_EDGETX, 0, CLASSIC_REST), pad('RadioMaster TX15 Joystick', 0, CLASSIC_REST),
    pad('USB Gamepad (Vendor: 0483 Product: 5750)', 0, [0, 0, -1, 0, -1, -1, 1, -1])]) {
    assert.equal(classifyPad(gp).radio, true, gp.id);
  }
  assert.equal(classifyPad(xboxPad(0)).radio, false);
  // The stick overlay and the OSD use the same rule.
  assert.equal(simSrc.includes('isRadio({id:gpName})'), false, 'no name-only radio check left in the page');
});

test('a remembered device can be changed and forgotten: choice, calibration and preset cleared, nothing else', () => {
  const sidX = sanitizeId(XBOX), sidF = sanitizeId(F310);
  const store = memStore({
    ryflyRates: '{"type":"BETAFLIGHT"}',
    [GP_ID_KEY]: XBOX,
    [RADIO_PRESET_PREFIX + sidX]: 'radiomaster',
    [AXIS_MAP_PREFIX + sidX]: JSON.stringify({ r: { i: 1, sign: 1 }, p: { i: 0, sign: 1 }, y: { i: 3, sign: 1 }, t: { i: 2, min: -1, max: 1 }, ver: 2 }),
  });
  const pads = [xboxPad(0), xboxPad(1, F310)];
  const router = createRadioRouter({ storage: store, getGamepads: () => pads });
  assert.equal(router.pick().id, XBOX, 'the remembered one, among equals');
  assert.equal(router.radioPreset, 'radiomaster');
  assert.deepEqual(router.list().map((p) => p.id), [XBOX, F310], 'both offered');
  // Change it.
  assert.equal(router.selectId(F310).id, F310);
  assert.equal(router.gpName, F310);
  assert.equal(store.getItem(GP_ID_KEY), F310, 'the new choice is remembered');
  // Forget the old one: its calibration and preset go; the choice is F310's.
  assert.equal(router.forget(XBOX), true);
  assert.equal(store.getItem(AXIS_MAP_PREFIX + sidX), null);
  assert.equal(store.getItem(RADIO_PRESET_PREFIX + sidX), null);
  assert.equal(store.getItem(GP_ID_KEY), F310);
  assert.equal(router.gpName, F310, 'the one flying stays');
  // Forget the one flying: the choice goes too, and the best connected flies.
  saveRadioPreset(F310, 'pad', store);
  assert.equal(router.forget(), true);
  assert.equal(store.getItem(RADIO_PRESET_PREFIX + sidF) === 'pad', false, 'its preset is gone');
  assert.notEqual(store.getItem(GP_ID_KEY), F310, 'its choice is gone');
  assert.ok(router.gpConnected, 'a device flies');
  assert.equal(store.getItem('ryflyRates'), '{"type":"BETAFLIGHT"}', 'other ryfly* keys stay');
  assert.equal(forgetDevice('', store), false);
  // The page: a device list and a forget button in Tune → Radio.
  assert.ok(simSrc.includes('<select id="radioDevice"'));
  assert.ok(simSrc.includes('id="btnForgetDevice"'));
  assert.ok(simSrc.includes('forgetDevice(id);'));
});

test('the active device put down while another moves: the moving one flies, radios first, never while armed', () => {
  let t = 0;
  const tx = pad(TX16S_ID, 0, CLASSIC_REST);
  let zAxes = [0, 0, -1, 0];
  const pads = () => [tx, pad('RadioMaster Zorro Joystick', 1, zAxes), xboxPad(2)];
  const router = createRadioRouter({ storage: memStore({ [GP_ID_KEY]: TX16S_ID }), getGamepads: pads, now: () => t });
  assert.equal(router.pick().id, TX16S_ID);
  // The TX16S flown, then put down.
  t = 300; tx.axes = [0.4, 0, -1, 0, -1, -1, -1, -1]; router.readStick();
  t = 400; tx.axes = CLASSIC_REST.slice(); router.readStick();
  t = 1000;
  zAxes = [0.5, 0, -1, 0];
  router.readStick();
  assert.equal(router.checkStale({ armed: false }), null, 'not put down yet');
  t = 5000;
  zAxes = [0, 0.5, -1, 0];
  router.readStick();
  assert.equal(router.checkStale({ armed: true }), null, 'never while armed');
  assert.equal(router.gpName, TX16S_ID);
  assert.equal(router.checkStale({ armed: false }).id, 'RadioMaster Zorro Joystick');
  assert.equal(router.gpName, 'RadioMaster Zorro Joystick');
  // Nothing else moving: the device at rest keeps the sticks.
  t = 20000;
  assert.equal(router.checkStale({ armed: false }), null);
  assert.ok(simSrc.includes('const to=staleSwitchTarget(gp,listPads(),padTracker,performance.now());'));
  assert.ok(simSrc.includes('}else if(gp&&!calib&&!switchWiz&&!coreArmed()&&gpName!==padPilotPick){'));
  assert.equal(PAD_STALE_MS, 4000);
});

// ---- Calibration: a throttle that rests at one end, picked up wherever it starts ----
// Steps until the wizard is done; done stays true once it is.
function runCal(calib, axes, dt, n) {
  let out = null;
  for (let i = 0; i < n && calib.step < CAL_STEPS.length; i++) out = stepCalib(calib, { id: UNKNOWN_EDGETX, index: 0, mapping: '', axes: axes.slice() }, dt);
  return Object.assign({}, out, { done: calib.step >= CAL_STEPS.length });
}
function sweepCal(calib, base, i, from, to, dt) {
  let out = null;
  for (let k = 0; k <= 10; k++) { const a = base.slice(); a[i] = from + (to - from) * k / 10; out = runCal(calib, a, dt, 1); }
  return out;
}

test('calibration: a throttle that comes through past axis 3 (Advanced layout) is picked up', () => {
  // ax0 roll, ax1 pitch, ax2 yaw, ax3 a switch at -1, ax4 a switch, ax5 throttle at -1.
  const c = createCalibState();
  runCal(c, [0, 0, 0, -1, -1, -1], 0.4, 3);
  runCal(c, [1, 0, 0, -1, -1, -1], 0.25, 3);
  runCal(c, [0, -1, 0, -1, -1, -1], 0.25, 3);
  runCal(c, [0, 0, 1, -1, -1, -1], 0.25, 3);
  assert.equal(CAL_STEPS[c.step].key, 'thi');
  sweepCal(c, [0, 0, 0, -1, -1, -1], 5, -1, 1, 0.04);
  runCal(c, [0, 0, 0, -1, -1, 1], 0.05, 4);
  assert.equal(CAL_STEPS[c.step].key, 'tlo', 'full up on ax5 taken');
  assert.equal(c.result.t.i, 5);
  sweepCal(c, [0, 0, 0, -1, -1, 1], 5, 1, -1, 0.04);
  const out = runCal(c, [0, 0, 0, -1, -1, -1], 0.05, 4);
  assert.equal(out.done, true);
  assert.deepEqual([c.result.r.i, c.result.p.i, c.result.y.i, c.result.t.i], [0, 1, 2, 5]);
  assert.equal(applyAxisMap([0, 0, 0, -1, -1, -1], c.result).t, 0);
  assert.ok(applyAxisMap([0, 0, 0, -1, -1, 1], c.result).t > 0.99);
});

test('calibration: a switch flipped during an earlier step and left is not taken for the throttle', () => {
  const c = createCalibState();
  runCal(c, [0, 0, -1, 0, -1, -1], 0.4, 3);
  runCal(c, [1, 0, -1, 0, 1, -1], 0.25, 3);   // ax4 flipped during ROLL, left up
  runCal(c, [0, -1, -1, 0, 1, -1], 0.25, 3);
  runCal(c, [0, 0, -1, 1, 1, -1], 0.25, 3);
  assert.equal(CAL_STEPS[c.step].key, 'thi');
  runCal(c, [0, 0, -1, 0, 1, -1], 0.05, 10);
  assert.equal(CAL_STEPS[c.step].key, 'thi', 'still waiting for the throttle');
  sweepCal(c, [0, 0, -1, 0, 1, -1], 2, -1, 1, 0.04);
  runCal(c, [0, 0, 1, 0, 1, -1], 0.05, 4);
  assert.equal(c.result.t.i, 2);
});

test('calibration: a switch flipped while the gimbal throttle is on its way up is not taken for it', () => {
  const c = createCalibState();
  runCal(c, [0, 0, -1, 0, -1, -1], 0.4, 3);
  runCal(c, [1, 0, -1, 0, -1, -1], 0.25, 3);
  runCal(c, [0, -1, -1, 0, -1, -1], 0.25, 3);
  runCal(c, [0, 0, -1, 1, -1, -1], 0.25, 3);
  // The throttle on ax2 half way up; ax5 flipped end to end meanwhile.
  runCal(c, [0, 0, 0, 0, -1, -1], 0.05, 2);
  sweepCal(c, [0, 0, 0, 0, -1, -1], 5, -1, 1, 0.02);
  runCal(c, [0, 0, 0, 0, -1, 1], 0.05, 6);
  assert.equal(CAL_STEPS[c.step].key, 'thi', 'the switch is not the throttle');
  runCal(c, [0, 0, 1, 0, -1, 1], 0.05, 4);
  assert.equal(c.result.t.i, 2);
});

test('calibration: a gimbal that comes through past axis 3 (Advanced layout), resting mid-stick, is taken', () => {
  // ax0 roll, ax1 pitch, ax2 throttle, ax3 a switch at -1, ax4 yaw (mid), ax5 a switch.
  const c = createCalibState();
  runCal(c, [0, 0, -1, -1, 0, -1], 0.4, 3);
  runCal(c, [1, 0, -1, -1, 0, -1], 0.25, 3);
  runCal(c, [0, -1, -1, -1, 0, -1], 0.25, 3);
  // Swept, as a stick moves (a switch would jump).
  sweepCal(c, [0, 0, -1, -1, 0, -1], 4, 0, 1, 0.02);
  runCal(c, [0, 0, -1, -1, 1, -1], 0.25, 3);
  assert.equal(CAL_STEPS[c.step].key, 'thi');
  assert.deepEqual(c.result.y, { i: 4, sign: 1 });
});

test('calibration: a throttle left mid-stick at CENTER gets its full travel, not the half above it', () => {
  const c = createCalibState();
  runCal(c, [0, 0, 0, 0, -1, -1, -1, -1], 0.4, 3);    // throttle at mid, not low
  runCal(c, [1, 0, 0, 0, -1, -1, -1, -1], 0.25, 3);
  runCal(c, [0, -1, 0, 0, -1, -1, -1, -1], 0.25, 3);
  runCal(c, [0, 0, 0, 1, -1, -1, -1, -1], 0.25, 3);
  sweepCal(c, [0, 0, 0, 0, -1, -1, -1, -1], 2, 0, 1, 0.04);
  runCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.05, 4);
  assert.equal(CAL_STEPS[c.step].key, 'tlo');
  // On its way down past mid it is not low yet.
  runCal(c, [0, 0, 0.3, 0, -1, -1, -1, -1], 0.05, 6);
  assert.equal(CAL_STEPS[c.step].key, 'tlo', 'not done on the way down');
  sweepCal(c, [0, 0, 0.3, 0, -1, -1, -1, -1], 2, 0.3, -1, 0.04);
  const out = runCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.05, 4);
  assert.equal(out.done, true);
  assert.ok(c.result.t.min < -0.95, `low is the bottom of the travel (${c.result.t.min}), not mid-stick`);
  assert.equal(applyAxisMap([0, 0, -1, 0], c.result).t, 0);
  assert.ok(Math.abs(applyAxisMap([0, 0, 0, 0], c.result).t - 0.5) < 1e-9, 'mid-stick is half throttle');
});

test('calibration: a throttle that stops short of the rails (±0.8) registers when held', () => {
  const c = createCalibState();
  runCal(c, [0, 0, -0.8, 0, -1, -1, -1, -1], 0.4, 3);
  runCal(c, [1, 0, -0.8, 0, -1, -1, -1, -1], 0.25, 3);
  runCal(c, [0, -1, -0.8, 0, -1, -1, -1, -1], 0.25, 3);
  runCal(c, [0, 0, -0.8, 1, -1, -1, -1, -1], 0.25, 3);
  sweepCal(c, [0, 0, -0.8, 0, -1, -1, -1, -1], 2, -0.8, 0.8, 0.04);
  runCal(c, [0, 0, 0.8, 0, -1, -1, -1, -1], 0.05, 6);
  assert.equal(CAL_STEPS[c.step].key, 'thi', 'a moment at 0.8 is not yet full');
  runCal(c, [0, 0, 0.8, 0, -1, -1, -1, -1], 0.05, 20);
  assert.equal(CAL_STEPS[c.step].key, 'thi', 'a second is not yet full either');
  runCal(c, [0, 0, 0.8, 0, -1, -1, -1, -1], 0.05, 30);
  assert.equal(CAL_STEPS[c.step].key, 'tlo', 'held 2 s at the mirror of its rest: full');
  sweepCal(c, [0, 0, 0.8, 0, -1, -1, -1, -1], 2, 0.8, -0.8, 0.04);
  const out = runCal(c, [0, 0, -0.8, 0, -1, -1, -1, -1], 0.05, 4);
  assert.equal(out.done, true);
  assert.ok(applyAxisMap([0, 0, 0.8, 0], c.result).t > 0.99, 'its top is full throttle');
  assert.equal(applyAxisMap([0, 0, -0.8, 0], c.result).t, 0);
});

test('calibration: what it cannot pick up, the pilot picks from the axis list', () => {
  const gp = (axes) => ({ id: UNKNOWN_EDGETX, index: 0, mapping: '', axes });
  const c = createCalibState();
  assert.deepEqual(calibAxisChoices(c, gp([0, 0, -1, 0, -1, -1, -1, -1])), [], 'none at CENTER');
  runCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.4, 3);
  runCal(c, [1, 0, -1, 0, -1, -1, -1, -1], 0.25, 3);
  runCal(c, [0, -1, -1, 0, -1, -1, -1, -1], 0.25, 3);
  // YAW on ax6, a channel resting at -1: the wizard never takes it on its own.
  const yaw = gp([0, 0, -1, 0, -1, -1, 1, -1]);
  runCal(c, yaw.axes, 0.25, 20);
  assert.equal(CAL_STEPS[c.step].key, 'y', 'not picked up');
  assert.deepEqual(calibAxisChoices(c, yaw), [2, 3, 4, 5, 6, 7], 'every axis not taken');
  assert.equal(calibPickAxis(c, yaw, 0).picked, false, 'roll\u2019s axis is taken');
  const out = calibPickAxis(c, yaw, 6);
  assert.equal(out.picked, true);
  assert.deepEqual(c.result.y, { i: 6, sign: 1 });
  assert.equal(CAL_STEPS[c.step].key, 'thi');
  // THROTTLE FULL UP picked by hand on ax2, held up; then FULL DOWN detected.
  const up = gp([0, 0, 1, 0, -1, -1, -1, -1]);
  calibPickAxis(c, up, 2);
  assert.deepEqual(c.result.t, { i: 2, max: 1, min: -1 });
  assert.deepEqual(calibAxisChoices(c, up), [2, 3, 4, 5, 7], 'FULL DOWN: the throttle\u2019s own axis stays on offer');
  const done = runCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.25, 2);
  assert.equal(done.done, true);
  assert.ok(simSrc.includes('<div id="calibPick"></div>'));
  assert.ok(simSrc.includes('const out=calibPickAxis(calib,gp,Number(b.dataset.ax));'));
});

// ---- Review fixes (each failed on 8dc4113) ----
const SHAPED_ID = 'USB Gamepad (Vendor: 0483 Product: 5750)';
const SHAPED_REST = [0, 0, -1, 0, -1, -1, 1, -1];

test('review 1: a layout chosen for a device holds for the session; Auto-detect never flips it in flight', () => {
  // Radio-shaped when picked: AETR ('aetr' saved). Auto-detect (the preset
  // picker's first entry) keeps AETR whatever the sticks do.
  let axes = SHAPED_REST.slice();
  const router = createRadioRouter({ storage: memStore(), getGamepads: () => [pad(SHAPED_ID, 0, axes)] });
  router.pick();
  assert.equal(router.radioPreset, 'aetr');
  router.clearCalibration();
  assert.equal(router.radioPreset, 'auto');
  for (const a of [SHAPED_REST, [1, 1, 1, 1, -1, -1, 1, -1], [0, 0, 0.5, 0, 0, 0, 1, 0], [0.3, -0.2, -0.94, 0.1, 0, 0, 0, 0]]) {
    axes = a.slice();
    const st = router.readStick();
    assert.equal(st.map.t.i, 2, 'AETR throttle on ax2 at ' + JSON.stringify(a));
    assert.equal(st.map.t.spring, undefined, 'never the sprung gamepad layout at ' + JSON.stringify(a));
  }
  // Not radio-shaped when picked (nothing at -1): the gamepad layout, and it
  // stays so when an axis later reaches -1.
  axes = [0, 0, 0, 0, 0, 0, 1, 0];
  const r2 = createRadioRouter({ storage: memStore(), getGamepads: () => [pad(SHAPED_ID, 0, axes)] });
  r2.pick();
  const before = r2.readStick().map;
  for (const a of [[0, 0, -1, 0, 0, 0, 1, 0], [0, -1, -1, 0, -1, -1, 1, -1], [0, 0, 0.5, 0, 0, 0, 1, 0]]) {
    axes = a.slice();
    assert.equal(r2.readStick().map, before, 'same layout at ' + JSON.stringify(a));
  }
  // The pilot's own choice of the gamepad preset makes it a gamepad.
  const r3 = createRadioRouter({ storage: memStore({ [RADIO_PRESET_PREFIX + sanitizeId(SHAPED_ID)]: 'pad' }), getGamepads: () => [pad(SHAPED_ID, 0, SHAPED_REST)] });
  r3.pick();
  assert.equal(r3.readStick().map, PAD_MAP);
  assert.equal(r3.kind.radio, false, 'a gamepad, by the pilot\u2019s choice');
  assert.equal(defaultMapFor(pad(SHAPED_ID, 0, SHAPED_REST)), PAD_MAP, 'the id-only default never reads live axes');
});

// An Xbox pad recalibrated the way a pilot does it: sticks to each prompt,
// the throttle stick up for FULL UP and let go (it springs back, with a little
// overshoot) for FULL DOWN, or pushed full down.
function xboxCalibration(mod, release) {
  const c = mod.createCalibState();
  const gp = (axes) => ({ id: XBOX, index: 0, mapping: 'standard', axes: axes.slice() });
  const run = (axes, dt, n) => { for (let i = 0; i < n && c.step < mod.CAL_STEPS.length; i++) mod.stepCalib(c, gp(axes), dt); };
  run([0, 0, 0, 0], 0.004, 300);
  run([0, 0, 1, 0], 0.004, 200);      // roll: RX right
  run([0, 0, 0, -1], 0.004, 200);     // pitch: RY up
  run([1, 0, 0, 0], 0.004, 200);      // yaw: LX right
  for (let k = 0; k <= 10; k++) run([0, -k / 10, 0, 0], 0.004, 3);
  run([0, -1, 0, 0], 0.004, 100);     // throttle: LY up, held
  for (const v of release) run([0, v, 0, 0], 0.004, 8);
  run([0, release[release.length - 1], 0, 0], 0.004, 1500);
  return { done: c.step >= mod.CAL_STEPS.length, result: c.result };
}
const XBOX_RELEASES = {
  'let go, overshoot': [-0.6, -0.2, 0.15, 0.05, 0],
  'let go, clean': [-0.5, 0],
  'pushed full down': [-0.5, 0, 0.5, 1],
};

test('review 2: an Xbox pad recalibrates as on main: let go is throttle 0, never 50 % at rest', () => {
  for (const [name, rel] of Object.entries(XBOX_RELEASES)) {
    const out = xboxCalibration({ createCalibState, stepCalib, CAL_STEPS }, rel);
    assert.equal(out.done, true, name + ': finishes');
    assert.equal(out.result.t.i, 1, name);
    const rest = applyAxisMap([0, 0, 0, 0], out.result).t;
    assert.ok(rest < 0.05, `${name}: stick at rest is throttle ${rest}, not half`);
    assert.ok(applyAxisMap([0, -1, 0, 0], out.result).t > 0.95, name + ': stick up is full');
  }
});

test('review 2b: Xbox and TX16S calibration results are the same as on main (when origin/main is here)', async (t) => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  let src = '';
  try { src = execFileSync('git', ['show', 'origin/main:sim-touch.js'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { /* shallow clone */ }
  if (!src) { t.skip('no origin/main here'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'qm-main-touch-'));
  writeFileSync(join(dir, 'sim-touch.mjs'), src);
  const main = await import(pathToFileURL(join(dir, 'sim-touch.mjs')).href);
  const strip = (r) => JSON.parse(JSON.stringify({ r: r.r, p: r.p, y: r.y, t: r.t }));
  for (const [name, rel] of Object.entries(XBOX_RELEASES)) {
    const a = xboxCalibration(main, rel), b = xboxCalibration({ createCalibState, stepCalib, CAL_STEPS }, rel);
    assert.equal(b.done, a.done, 'Xbox ' + name);
    assert.deepEqual(strip(b.result), strip(a.result), 'Xbox ' + name);
  }
  // TX16S: throttle low at CENTER, jumped up / swept up / pinned (Ryan's live case).
  const tx = (mod, upFrames) => {
    const c = mod.createCalibState();
    const gp = (axes) => ({ id: TX16S_ID, index: 0, mapping: '', axes: axes.slice() });
    const run = (axes, dt, n) => { for (let i = 0; i < n && c.step < mod.CAL_STEPS.length; i++) mod.stepCalib(c, gp(axes), dt); };
    run([0, 0, -1, 0, -1, -1, -1, -1], 0.004, 300);
    run([1, 0, -1, 0, -1, -1, -1, -1], 0.004, 200);
    run([0, -1, -1, 0, -1, -1, -1, -1], 0.004, 200);
    run([0, 0, -1, 1, -1, -1, -1, -1], 0.004, 200);
    for (const v of upFrames) run([0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    run([0, 0, 1, 0, -1, -1, -1, -1], 0.004, 100);
    for (const v of [0.5, 0, -0.5, -1]) run([0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    run([0, 0, -1, 0, -1, -1, -1, -1], 0.004, 300);
    return { done: c.step >= mod.CAL_STEPS.length, result: c.result };
  };
  for (const [name, up] of Object.entries({ jumped: [1], swept: [-0.5, 0, 0.5, 1], pinned: [1.0] })) {
    const a = tx(main, up), b = tx({ createCalibState, stepCalib, CAL_STEPS }, up);
    assert.equal(b.done, a.done, 'TX16S ' + name);
    assert.deepEqual(strip(b.result), strip(a.result), 'TX16S ' + name);
  }
});

test('review 3: a radio calibrated in Classic, then switched to Advanced, still gets the Classic message', () => {
  const id = TX16S_ID;
  const classicMap = { r: { i: 0, sign: 1 }, p: { i: 1, sign: 1 }, y: { i: 3, sign: 1 }, t: { i: 2, min: -1, max: 1 } };
  // A calibration from before this change (no axis count), and one from now.
  for (const saved of [classicMap, Object.assign({}, classicMap, { n: 8 })]) {
    const store = memStore();
    saveAxisMap(id, saved, store);
    for (const n of [3, 4, 5]) {
      const adv = pad(id, 0, [0, 0, -1, 0, -1].slice(0, n));
      assert.equal(radioIssuePad([adv], store), adv, `${n} axes, saved ${JSON.stringify(saved).slice(0, 20)}: the message`);
    }
  }
  // A calibration made on this very layout clears it.
  const own = memStore();
  saveAxisMap(id, { r: { i: 0, sign: 1 }, p: { i: 1, sign: 1 }, y: { i: 2, sign: 1 }, t: { i: 3, min: -1, max: 1 }, n: 4 }, own);
  assert.equal(radioIssuePad([pad(id, 0, [0, 0, 0, -1])], own), null);
  // And the Classic map is not flown on the Advanced layout: the AETR preset is.
  const store = memStore();
  saveAxisMap(id, Object.assign({}, classicMap, { n: 8 }), store);
  saveRadioPreset(id, 'custom', store);
  const router = createRadioRouter({ storage: store, getGamepads: () => [pad(id, 0, [0, 0, 0, -1])] });
  router.pick();
  assert.equal(router.axisMap, null, 'the 8-axis calibration is not applied to 4 axes');
  assert.equal(router.radioPreset, 'radiomaster');
  assert.equal(router.notice, RADIO_CLASSIC_MSG);
  // A calibration carries the axis count it was made on.
  let axes = CLASSIC_REST.slice();
  const cal = createRadioRouter({ storage: memStore(), getGamepads: () => [pad(id, 0, axes)] });
  cal.pick();
  cal.startCalib();
  const done = calibrateClassic(cal, (a) => { axes = a; });
  assert.equal(done.axisMap.n, 8);
});

test('review 4: a device the pilot picks stays picked; a remembered pad is not overwritten before its sticks move', () => {
  let t = 0;
  let txAxes = CLASSIC_REST.slice();
  const pads = () => [pad(TX16S_ID, 0, txAxes), xboxPad(1)];
  const store = memStore({ [GP_ID_KEY]: TX16S_ID });
  const router = createRadioRouter({ storage: store, getGamepads: pads, now: () => t });
  assert.equal(router.pick().id, TX16S_ID);
  t = 10000;
  router.readStick();
  assert.equal(router.selectId(XBOX).id, XBOX, 'picked in Tune');
  t = 10300;
  txAxes = [0.1, 0, -1, 0, -1, -1, -1, -1];   // the radio set down, its gimbal nudged
  router.readStick();
  t = 10500;
  assert.equal(router.checkStale({ armed: false }), null, 'the pick holds');
  assert.equal(router.gpName, XBOX);
  assert.equal(store.getItem(GP_ID_KEY), XBOX);
  // Another device connecting (a headset waking) does not undo it either,
  // though the radio ranks higher.
  assert.equal(router.pick().id, XBOX, 'a re-pick keeps the pilot’s choice');
  assert.ok(simSrc.includes('if(gpConnected&&gpName===padPilotPick&&pads.some((p)=>p.index===gpIndex&&p.id===gpName))return false;'));

  // The pilot's own DirectInput pad (5 axes, not moved yet) beside an Xbox:
  // the Xbox may fly meanwhile, but the remembered choice stays.
  const GENERIC = 'USB Joystick (Vendor: 0079 Product: 0006)';
  const s2 = memStore({ [GP_ID_KEY]: GENERIC });
  let gAxes = [0, 0, 0, 0, 0];
  const r2 = createRadioRouter({ storage: s2, getGamepads: () => [pad(GENERIC, 0, gAxes), xboxPad(1)], now: () => t });
  r2.pick();
  assert.equal(s2.getItem(GP_ID_KEY), GENERIC, 'remembered choice kept');
  gAxes = [0.6, 0, 0, 0, 0];
  assert.equal(r2.pick().id, GENERIC, 'once it moves, it flies');
});

function txCal(c, axes, dt, n) {
  for (let i = 0; i < n && c.step < CAL_STEPS.length; i++) stepCalib(c, { id: TX16S_ID, index: 0, mapping: '', axes: axes.slice() }, dt);
}
function txRPY(c, rest) {
  txCal(c, rest, 0.004, 300);
  const at = (i, v) => { const a = rest.slice(); a[i] = v; return a; };
  txCal(c, at(0, 1), 0.004, 200);
  txCal(c, at(1, -1), 0.004, 200);
  txCal(c, at(3, 1), 0.004, 200);
}

test('review 5a: a switch flipped at THROTTLE FULL UP, before the throttle moves, is not the throttle', () => {
  const rest = [0, 0, -1, 0, -1, -1, -1, -1];
  const c = createCalibState();
  txRPY(c, rest);
  assert.equal(CAL_STEPS[c.step].key, 'thi');
  txCal(c, [0, 0, -1, 0, 1, -1, -1, -1], 0.004, 75);      // SA flipped, 0.3 s
  for (const v of [-0.5, 0, 0.5, 1]) txCal(c, [0, 0, v, 0, 1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, 1, 0, 1, -1, -1, -1], 0.004, 50);
  assert.equal(c.result.t.i, 2, 'the throttle, not SA');
});

test('review 5b: a 1 s pause part-way up does not lock full throttle there', () => {
  const rest = [0, 0, -1, 0, -1, -1, -1, -1];
  const c = createCalibState();
  txRPY(c, rest);
  for (const v of [-0.5, 0, 0.3, 0.55]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, 0.55, 0, -1, -1, -1, -1], 0.004, 280);   // 1.1 s
  txCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.004, 50);
  assert.ok(c.result.t && c.result.t.max > 0.95, 'full is the top: ' + JSON.stringify(c.result.t));
  assert.ok(Math.abs(applyAxisMap([0, 0, 0.55, 0], c.result).t - 0.775) < 0.01, '0.55 is not full throttle');
});

test('review 5c: a throttle left high at CENTER is not saved backwards', () => {
  const rest = [0, 0, 1, 0, -1, -1, -1, -1];
  for (const pause of [0, 40]) {
    const c = createCalibState();
    txRPY(c, rest);
    // Asked for FULL UP, already there: the pilot dips it to the bottom and back.
    for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, pause);
    for (const v of [-0.5, 0, 0.5, 1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.004, 50);
    for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 100);
    assert.equal(c.step, CAL_STEPS.length, 'done');
    assert.ok(applyAxisMap([0, 0, 1, 0], c.result).t > 0.95, `pause ${pause}: up is full: ${JSON.stringify(c.result.t)}`);
    assert.ok(applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, `pause ${pause}: down is zero`);
  }
  // A channel that is really reversed (low at +1): held at -1 for a second
  // as FULL UP, it is taken that way.
  const c = createCalibState();
  txRPY(c, rest);
  for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 300);
  assert.deepEqual([c.result.t.i, c.result.t.max, c.result.t.min], [2, -1, 1], 'a reversed channel');
});

test('review 5d: a hand-picked throttle axis is never inverted', () => {
  const gp = (axes) => ({ id: TX16S_ID, index: 0, mapping: '', axes: axes.slice() });
  // Left high at CENTER, held up, tapped.
  let c = createCalibState();
  txRPY(c, [0, 0, 1, 0, -1, -1, -1, -1]);
  calibPickAxis(c, gp([0, 0, 1, 0, -1, -1, -1, -1]), 2);
  assert.ok(applyAxisMap([0, 0, 1, 0], c.result).t > 0.95 && applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, JSON.stringify(c.result.t));
  // Low at CENTER, tapped part-way up.
  c = createCalibState();
  txRPY(c, [0, 0, -1, 0, -1, -1, -1, -1]);
  calibPickAxis(c, gp([0, 0, -0.6, 0, -1, -1, -1, -1]), 2);
  assert.ok(applyAxisMap([0, 0, 1, 0], c.result).t > 0.95 && applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, JSON.stringify(c.result.t));
  // Mid at CENTER, tapped untouched: FULL DOWN waits for the stick to go down.
  c = createCalibState();
  txRPY(c, [0, 0, 0, 0, -1, -1, -1, -1]);
  calibPickAxis(c, gp([0, 0, 0, 0, -1, -1, -1, -1]), 2);
  txCal(c, [0, 0, 0, 0, -1, -1, -1, -1], 0.004, 400);
  assert.equal(CAL_STEPS[c.step].key, 'tlo', 'not done with the stick untouched');
  for (const v of [-0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 100);
  assert.equal(c.step, CAL_STEPS.length);
  assert.ok(applyAxisMap([0, 0, -1, 0], c.result).t < 0.05 && applyAxisMap([0, 0, 1, 0], c.result).t > 0.95, JSON.stringify(c.result.t));
});

test('review 5e: a mid-resting switch moved and left is not taken for the next stick', () => {
  // ax4 a 3-position switch in the middle, flipped up during ROLL and left there.
  const c = createCalibState();
  txCal(c, [0, 0, -1, 0, 0, -1, -1, -1], 0.004, 300);
  txCal(c, [1, 0, -1, 0, 1, -1, -1, -1], 0.004, 200);
  txCal(c, [0, 0, -1, 0, 1, -1, -1, -1], 0.004, 175);   // reading the PITCH prompt, 0.7 s
  assert.equal(CAL_STEPS[c.step].key, 'p', 'pitch is still waiting');
  txCal(c, [0, -1, -1, 0, 1, -1, -1, -1], 0.004, 200);
  assert.equal(c.result.p.i, 1);
  // A mid-resting pot turned to 0.7 during ROLL and left, then nudged on
  // (it sweeps, but it began PITCH off its rest): not pitch either.
  const d = createCalibState();
  txCal(d, [0, 0, -1, 0, 0, -1, -1, -1], 0.004, 300);
  txCal(d, [1, 0, -1, 0, 0.7, -1, -1, -1], 0.004, 200);
  for (let k = 0; k <= 25; k++) txCal(d, [0, 0, -1, 0, 0.7 + k * 0.01, -1, -1, -1], 0.004, 2);
  txCal(d, [0, 0, -1, 0, 0.95, -1, -1, -1], 0.004, 200);
  assert.equal(CAL_STEPS[d.step].key, 'p', 'the pot is not pitch');
});

test('review 6: the Classic message is told once per radio plugged; an empty poll neither clears nor repeats it', async () => {
  const { createIssueNotice, ISSUE_GONE_MS } = await import('../sim-touch.js');
  assert.equal(typeof createIssueNotice, 'function', 'sim-touch.js createIssueNotice');
  const tx15 = pad('RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)', 0, [0, 0, 0]);
  const n = createIssueNotice();
  const store = memStore();
  assert.deepEqual(n.see([tx15, null], store, 0), { changed: true, tell: true, id: tx15.id });
  assert.equal(n.see([tx15], store, 500).tell, false);
  assert.equal(n.see([null, null, null, null], store, 1000).changed, false, 'an empty poll is no news');
  assert.equal(n.see([tx15], store, 1500).tell, false, 'so it is not told again');
  assert.equal(n.see([], store, 2000).changed, false);
  assert.equal(n.see([], store, 2000 + ISSUE_GONE_MS).changed, true, 'gone for ISSUE_GONE_MS: gone');
  assert.equal(n.id, '');
  assert.equal(n.see([tx15], store, 9000).tell, true, 'plugged again: told again');
  n.told('');
  // The page tells it after the pick, so the pick's own toast cannot hide it.
  const pick = simSrc.slice(simSrc.indexOf('function pickGamepad('), simSrc.indexOf('function choosePad('));
  assert.ok(/const picked=choosePad\(quiet\);\s*\/\/[^\n]*\n\s*noteRadioIssue\(picked\);/.test(pick), 'pickGamepad: the choice, then the message');
});

test('review 7: a standard-layout handheld with "Pocket" in its name is a gamepad, not an EdgeTX radio', () => {
  for (const id of ['Retroid Pocket Controller (STANDARD GAMEPAD Vendor: 2020 Product: 3001)', 'Boxer Pad (STANDARD GAMEPAD Vendor: 1234 Product: 0001)']) {
    const gp = { id, index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
    const c = classifyPad(gp);
    assert.deepEqual([c.radio, c.edgetx, c.issue], [false, false, null], id);
    assert.equal(guessRadioPreset(gp), 'pad', id);
    assert.equal(radioScore(gp), 0, id);
    assert.equal(isRadio({ id }), false, id + ' by id alone: the STANDARD GAMEPAD tag says so');
  }
  // The USB id still wins (Chrome never standard-maps 1209:4f54).
  assert.equal(classifyPad({ id: 'Pocket Joystick (STANDARD GAMEPAD Vendor: 1209 Product: 4f54)', mapping: 'standard', axes: CLASSIC_REST }).radio, true);
});

test('review 8: a device connecting while one flies does not re-pick it (no throttle cut)', () => {
  const choose = simSrc.slice(simSrc.indexOf('function choosePad('), simSrc.indexOf('// Tune → Radio: every device'));
  assert.ok(choose.includes('if(gpConnected&&best.index===gpIndex&&best.id===gpName)return false;'), 'the device flying is not selected again');
  assert.ok(simSrc.includes('if(g&&act&&act.id===gpName&&!(usablePad(g)&&radioScore(g)>radioScore(act))){noteRadioIssue();fillDeviceUI();return;}'), 'a device connecting does nothing to the one flying unless it outranks it');
});

// ---- Second review (each failed on fe83751) ----
const ADV6 = 'RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)';   // Advanced layout, 6 axes
function advCal(c, axes, dt, n) {
  for (let i = 0; i < n && c.step < CAL_STEPS.length; i++) stepCalib(c, { id: ADV6, index: 0, mapping: '', axes: axes.slice() }, dt);
}

test('review2 a: tapping the throttle axis at FULL UP before moving it is never inverted', () => {
  const c = createCalibState();
  txRPY(c, [0, 0, -1, 0, -1, -1, -1, -1]);
  calibPickAxis(c, { id: TX16S_ID, index: 0, mapping: '', axes: [0, 0, -1, 0, -1, -1, -1, -1] }, 2);
  assert.ok(applyAxisMap([0, 0, 1, 0], c.result).t > 0.95 && applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, JSON.stringify(c.result.t));
  // A throttle that tops out at +0.8, held there and tapped: +0.8 is full.
  const d = createCalibState();
  txRPY(d, [0, 0, -1, 0, -1, -1, -1, -1]);
  calibPickAxis(d, { id: TX16S_ID, index: 0, mapping: '', axes: [0, 0, 0.8, 0, -1, -1, -1, -1] }, 2);
  assert.ok(applyAxisMap([0, 0, 0.8, 0], d.result).t > 0.99, 'full reachable: ' + JSON.stringify(d.result.t));
});

test('review2 b: the stale switch never hands a radio\u2019s sticks to a gamepad, nor undoes a Tune pick later', () => {
  let t = 0;
  let tx = CLASSIC_REST.slice(), xb = [0, 0, 0, 0];
  const pads = () => [pad(TX16S_ID, 0, tx), pad(XBOX, 1, xb, { mapping: 'standard' })];
  const store = memStore({ [GP_ID_KEY]: TX16S_ID });
  const r = createRadioRouter({ storage: store, getGamepads: pads, now: () => t });
  r.pick();
  // The TX16S flown, then put down; the Xbox picked up and moved.
  t = 1000; tx = [0.5, 0, -1, 0, -1, -1, -1, -1]; r.readStick();
  t = 1100; tx = CLASSIC_REST.slice(); r.readStick();
  t = 6000; xb = [0.6, 0, 0, 0]; r.readStick();
  assert.equal(r.checkStale({ armed: false }), null, 'never from a radio to a gamepad');
  assert.equal(r.gpName, TX16S_ID);
  // A Tune pick of the Xbox, then the radio nudged well after PAD_STALE_MS.
  r.selectId(XBOX);
  for (const at of [10600, 11100, 14500, 20000]) {
    t = at; tx = [tx[0] ? 0 : 0.3, 0, -1, 0, -1, -1, -1, -1]; r.readStick();
    assert.equal(r.checkStale({ armed: false }), null, 'the Tune pick holds at ' + at);
  }
  assert.equal(store.getItem(GP_ID_KEY), XBOX);
  // The pick ends when its device goes: replugged later, the radio ranks first again.
  r.drop();
  assert.equal(r.pick().id, TX16S_ID, 'a radio outranks the remembered gamepad, as on main');
});

test('review2 c: a re-pick never re-reads the layout from live axes', () => {
  // Picked with nothing at -1: a gamepad for the session, whatever it shows later.
  let axes = [0, 0, 0, 0, 0, 0, 1, 0];
  const store = memStore();
  const r = createRadioRouter({ storage: store, getGamepads: () => [pad(SHAPED_ID, 0, axes)] });
  r.pick();
  const first = r.readStick().map;
  r.drop();
  axes = [0, 0, -1, 0, -1, -1, 1, -1];
  r.pick();
  assert.equal(r.radioPreset, 'auto', 'no aetr guess from a later snapshot');
  assert.equal(store.getItem(RADIO_PRESET_PREFIX + sanitizeId(SHAPED_ID)), null);
  assert.equal(r.readStick().map, first);
});

test('review2 d: a standard-layout "Pocket" handheld on main\u2019s saved radio preset flies as a gamepad', () => {
  for (const id of ['Retroid Pocket Controller', '2020-3001-Retroid Pocket Controller', 'Retroid Pocket Controller (STANDARD GAMEPAD Vendor: 2020 Product: 3001)']) {
    const store = memStore({ [RADIO_PRESET_PREFIX + sanitizeId(id)]: 'radiomaster' });
    const r = createRadioRouter({ storage: store, getGamepads: () => [{ id, index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] }] });
    r.pick();
    assert.equal(r.radioPreset, 'auto', id + ': main\u2019s name guess is dropped');
    assert.equal(r.readStick().map, PAD_MAP, id);
    assert.ok(r.readStick().stick.t < 0.01, id + ': throttle 0 at rest');
  }
  // The page asks the session kind about the device flying, never the id alone.
  assert.ok(simSrc.includes("  if(gp&&gp.id===gpName)return padTakenForRadio()||"), 'padIsRadio: the device flying by its kind');
});

test('review2 e: a 3-position switch passing its middle at FULL UP is not the throttle (Advanced layout)', () => {
  const c = createCalibState();
  advCal(c, [0, 0, -1, 0, -1, -1], 0.004, 300);
  advCal(c, [1, 0, -1, 0, -1, -1], 0.004, 200);
  advCal(c, [0, -1, -1, 0, -1, -1], 0.004, 200);
  advCal(c, [0, 0, -1, 1, -1, -1], 0.004, 200);
  advCal(c, [0, 0, -1, 0, 0, -1], 0.004, 8);     // SB through its middle for 32 ms
  advCal(c, [0, 0, -1, 0, 1, -1], 0.004, 75);
  for (const v of [-0.5, 0, 0.5, 1]) advCal(c, [0, 0, v, 0, 1, -1], 0.004, 5);
  advCal(c, [0, 0, 1, 0, 1, -1], 0.004, 50);
  assert.equal(c.result.t.i, 2, 'the throttle, not the switch');
});

test('review2 f: a throttle left high short of the top is not saved backwards', () => {
  for (const r0 of [0.6, 0.8, 0.9]) {
    const c = createCalibState();
    txRPY(c, [0, 0, r0, 0, -1, -1, -1, -1]);
    for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 40);
    for (const v of [-0.5, 0, 0.5, 1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.004, 50);
    for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 100);
    assert.ok(applyAxisMap([0, 0, 1, 0], c.result).t > 0.95 && applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, `rest ${r0}: ${JSON.stringify(c.result.t)}`);
  }
});

test('review2 g: a FULL UP push that stops short and drops back does not lock (TX16S)', () => {
  const c = createCalibState();
  txRPY(c, [0, 0, -1, 0, -1, -1, -1, -1]);
  for (let k = 1; k <= 10; k++) txCal(c, [0, 0, -1 + 1.9 * k / 10, 0, -1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, 0.9, 0, -1, -1, -1, -1], 0.004, 25);
  for (let k = 1; k <= 10; k++) txCal(c, [0, 0, 0.9 - 1.9 * k / 10, 0, -1, -1, -1, -1], 0.004, 4);
  txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 100);
  assert.equal(CAL_STEPS[c.step].key, 'thi', 'still asking for full up');
  txCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.004, 50);
  assert.ok(applyAxisMap([0, 0, 1, 0], c.result).t > 0.95 && applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, JSON.stringify(c.result.t));
});

test('review2 h: a pause at the mirror of a sloppy CENTER does not lock full part-way', () => {
  const c = createCalibState();
  txRPY(c, [0, 0, -0.8, 0, -1, -1, -1, -1]);
  for (let k = 1; k <= 10; k++) txCal(c, [0, 0, -0.8 + 1.6 * k / 10, 0, -1, -1, -1, -1], 0.004, 7);
  txCal(c, [0, 0, 0.8, 0, -1, -1, -1, -1], 0.004, 280);   // 1.1 s
  txCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.004, 50);
  assert.ok(c.result.t && c.result.t.max > 0.95, JSON.stringify(c.result.t));
});

test('review2 i: a sprung pad taken for a radio by its shape recalibrates as on main (let go is throttle 0)', () => {
  const id = 'Wireless Controller (Vendor: 054c Product: 05c4)';
  const c = createCalibState();
  const run = (axes, n) => { for (let i = 0; i < n && c.step < CAL_STEPS.length; i++) stepCalib(c, { id, index: 0, mapping: '', axes: axes.slice() }, 0.004); };
  run([0, 0, 0, 0, -1, -1], 300);
  run([0, 0, 1, 0, -1, -1], 200);
  run([0, 0, 0, -1, -1, -1], 200);
  run([1, 0, 0, 0, -1, -1], 200);
  for (let k = 0; k <= 10; k++) run([0, -k / 10, 0, 0, -1, -1], 3);
  run([0, -1, 0, 0, -1, -1], 100);
  for (const v of [-0.5, 0, 0.5, 1]) run([0, v, 0, 0, -1, -1], 8);
  run([0, 1, 0, 0, -1, -1], 400);
  assert.equal(c.step, CAL_STEPS.length);
  assert.ok(applyAxisMap([0, 0, 0, 0], c.result).t < 0.05, 'stick at rest is throttle 0: ' + JSON.stringify(c.result.t));
});

test('review2 j: a TX16S outranks a device only shaped like a radio, as on main', () => {
  const stick = pad('Logitech Extreme 3D (Vendor: 046d Product: c215)', 0, [0, 0, 0, -1, 0, 0, 0, 0]);
  const tx = pad(TX16S_ID, 1, CLASSIC_REST);
  assert.equal(pickPreferredPad([stick, tx], null).id, TX16S_ID);
  assert.ok(radioScore(stick) < radioScore(tx));
});

test('review2 k: a Classic TX16S calibration never takes a pot or switch past axis 3', () => {
  const c = createCalibState();
  txRPY(c, [0, 0, -1, 0, -1, -1, -1, -1]);
  for (let k = 0; k <= 20; k++) txCal(c, [0, 0, -1, 0, -1 + k / 10, -1, -1, -1], 0.004, 4);   // a pot swept end to end
  txCal(c, [0, 0, -1, 0, 1, -1, -1, -1], 0.004, 75);
  for (const v of [-0.5, 0, 0.5, 1]) txCal(c, [0, 0, v, 0, 1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, 1, 0, 1, -1, -1, -1], 0.004, 50);
  assert.equal(c.result.t.i, 2);
});

test('review2 l: the page tells the Classic message after a pick on every path, and keeps a passed-over remembered pad', () => {
  const tick = simSrc.slice(simSrc.indexOf('  if(performance.now()-padLookAt>500){'), simSrc.indexOf('    }else if(gp&&!calib&&!switchWiz&&!provenPad('));
  assert.ok(/if\(!gpConnected\)\{\s*[^\n]*\n(\s*\/\/[^\n]*\n)*\s*if\(listPads\(\)\.length\)pickGamepad\(\);\s*else noteRadioIssue\(\);/.test(tick), 'the 500 ms tick: pick, then tell');
  assert.ok(!/padsPassed\.has\(remembered\)/.test(simSrc), 'a passed-over remembered pad is not overwritten');
  assert.ok(simSrc.includes('padKinds.delete(id);'), 'forget: the kind is decided again');
});

// ---- Third review (each failed on 1cd0394) ----
test('review3 a: a throttle left high comes back to a top that reads short of 1.0 (jitter): not inverted', () => {
  for (const top of [0.998, 0.99, 0.97]) {
    const c = createCalibState();
    txRPY(c, [0, 0, top, 0, -1, -1, -1, -1]);
    for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    for (const v of [-0.5, 0, 0.5, top]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, top, 0, -1, -1, -1, -1], 0.004, 50);
    for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 100);
    assert.ok(applyAxisMap([0, 0, top, 0], c.result).t > 0.95 && applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, `top ${top}: ${JSON.stringify(c.result.t)}`);
  }
});

test('review3 b: a slow clean push past axis 3 is picked up (Advanced layout, 4 ms polls)', () => {
  const c = createCalibState();
  advCal(c, [0, 0, 0, -1, 0, -1], 0.004, 300);
  advCal(c, [1, 0, 0, -1, 0, -1], 0.004, 200);
  advCal(c, [0, -1, 0, -1, 0, -1], 0.004, 200);
  // Yaw on ax4, pushed 0 to 1 over 0.5 s.
  for (let k = 1; k <= 125; k++) advCal(c, [0, 0, 0, -1, k / 125, -1], 0.004, 1);
  advCal(c, [0, 0, 0, -1, 1, -1], 0.004, 200);
  assert.equal(c.result.y && c.result.y.i, 4, 'yaw on ax4');
  // Throttle on ax5, pushed -1 to +1 over 1 s.
  for (let k = 1; k <= 250; k++) advCal(c, [0, 0, 0, -1, 0, -1 + 2 * k / 250], 0.004, 1);
  advCal(c, [0, 0, 0, -1, 0, 1], 0.004, 50);
  assert.equal(c.result.t && c.result.t.i, 5, 'throttle on ax5');
});

test('review3 c: a radio throttle left mid at CENTER, taken to the bottom first at FULL UP, is not inverted', () => {
  for (const r0 of [0, 0.3, -0.3, 0.45]) {
    const c = createCalibState();
    txRPY(c, [0, 0, r0, 0, -1, -1, -1, -1]);
    for (const v of [r0 - 0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 40);
    for (const v of [-0.5, 0, 0.5, 1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.004, 50);
    for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
    txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 100);
    assert.ok(applyAxisMap([0, 0, 1, 0], c.result).t > 0.95 && applyAxisMap([0, 0, -1, 0], c.result).t < 0.05, `rest ${r0}: ${JSON.stringify(c.result.t)}`);
  }
});

test('review3 d: an Xbox axis tapped from the list is never inverted, never 50 % at rest', () => {
  const gp = (axes) => ({ id: XBOX, index: 0, mapping: 'standard', axes: axes.slice() });
  const rpy = (c) => {
    const run = (axes, n) => { for (let i = 0; i < n && c.step < CAL_STEPS.length; i++) stepCalib(c, gp(axes), 0.004); };
    run([0, 0, 0, 0], 300); run([0, 0, 1, 0], 200); run([0, 0, 0, -1], 200); run([1, 0, 0, 0], 200);
    return run;
  };
  // FULL UP tapped with the stick at rest, then let go at FULL DOWN.
  let c = createCalibState(); let run = rpy(c);
  calibPickAxis(c, gp([0, 0, 0, 0]), 1);
  run([0, 0, 0, 0], 300);
  assert.ok(applyAxisMap([0, -1, 0, 0], c.result).t > 0.95 && applyAxisMap([0, 0, 0, 0], c.result).t < 0.05, 'tap at rest: ' + JSON.stringify(c.result.t));
  // FULL UP detected, FULL DOWN tapped with the stick still up.
  c = createCalibState(); run = rpy(c);
  run([0, -1, 0, 0], 100);
  calibPickAxis(c, gp([0, -1, 0, 0]), 1);
  assert.ok(applyAxisMap([0, 0, 0, 0], c.result).t < 0.05, 'let go is 0: ' + JSON.stringify(c.result.t));
});

test('review3 e: a TX16S with a reversed throttle channel (low at +1) calibrates as on main', () => {
  const c = createCalibState();
  txRPY(c, [0, 0, 1, 0, -1, -1, -1, -1]);
  for (const v of [0.5, 0, -0.5, -1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, -1, 0, -1, -1, -1, -1], 0.004, 150);    // held 0.6 s, as the prompt asks
  for (const v of [-0.5, 0, 0.5, 1]) txCal(c, [0, 0, v, 0, -1, -1, -1, -1], 0.004, 5);
  txCal(c, [0, 0, 1, 0, -1, -1, -1, -1], 0.004, 100);
  assert.deepEqual([c.result.t.i, c.result.t.max, c.result.t.min], [2, -1, 1], 'reversed: full at -1');
});

test('review3 f: the Classic message is not told again for a radio just unplugged', async () => {
  const { createIssueNotice } = await import('../sim-touch.js');
  const tx15 = pad('RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)', 0, [0, 0, -1, 0]);
  const n = createIssueNotice();
  const store = memStore();
  n.see([tx15], store, 0);
  n.told(tx15.id, 0);
  assert.equal(typeof n.retellDue, 'function');
  assert.equal(n.retellDue([tx15, xboxPad(1)], store, XBOX, 2000), true, 'still plugged in: told again over the pick');
  assert.equal(n.retellDue([null, xboxPad(1)], store, XBOX, 2000), false, 'unplugged: not again');
  assert.equal(n.retellDue([tx15, xboxPad(1)], store, tx15.id, 2000), false, 'it flies itself: its own toast said it');
  assert.equal(n.retellDue([tx15, xboxPad(1)], store, XBOX, 10000), false, 'too long ago');
  assert.ok(simSrc.includes('radioIssue.retellDue(pads,undefined,gpName,now)'));
});

test('review3 g: main\u2019s name preset is dropped once; a preset the pilot picks afterwards holds', () => {
  const id = 'Retroid Pocket Controller';
  const store = memStore({ [RADIO_PRESET_PREFIX + sanitizeId(id)]: 'radiomaster' });
  const handheld = () => ({ id, index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] });
  const r = createRadioRouter({ storage: store, getGamepads: () => [handheld()] });
  r.pick();
  assert.equal(r.radioPreset, 'auto');
  saveRadioPreset(id, 'radiomaster', store);   // the pilot picks it in Tune
  r.drop();
  r.pick();
  assert.equal(r.radioPreset, 'radiomaster', 'the pilot\u2019s choice holds');
  const again = createRadioRouter({ storage: store, getGamepads: () => [handheld()] });
  again.pick();
  assert.equal(again.radioPreset, 'radiomaster', 'and in later sessions');
});

test('review3 h: forget and Tune\u2019s list re-pick without the first-run prompt', () => {
  const sel = simSrc.slice(simSrc.indexOf('function selectPad('), simSrc.indexOf('function showGpPicker('));
  assert.ok(sel.includes('function selectPad(gp,remember,quiet){'), 'selectPad takes quiet');
  assert.ok(/if\(quiet\)return;\s*\n\s*if\(feel&&feel\.promptOpen\)feel\.showFirstRun/.test(sel), 'quiet: no first-run prompt');
  assert.ok(simSrc.includes('  selectPad(gp,true,true);\n') || simSrc.includes('  selectPad(gp,true,true);\r\n'), 'Tune\u2019s list');
  assert.ok(/selectPad\(best,[^,)]+,quiet\)/.test(simSrc), 'choosePad passes it on (forget)');
});
