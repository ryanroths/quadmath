// TX16S / EdgeTX HID: mapping, calibration persistence, touch-off when a pad is live.
// Node stdlib only: `node --test tools/test_sim_radio.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AXIS_MAP_PREFIX, RADIO_PRESET_PREFIX, GP_ID_KEY,
  sanitizeId, isRadio, radioScore, AETR_MAP, defaultMapFor,
  applyAxisMap, loadRadioProfile, saveAxisMap, saveRadioPreset,
  clearRadioCalibration, isValidAxisMap, shouldEnableTouch,
  createRadioRouter, CAL_STEPS, createCalibState, stepCalib,
} from '../sim-touch.js';

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
  // Mode 2 AETR: ax0 roll, ax1 pitch (sim inverts), ax2 throttle -1..1, ax3 yaw, 4-7 aux
  const rest = applyAxisMap([0, 0, -1, 0, 0.4, -0.2, 0.9, 0], AETR_MAP);
  assert.equal(rest.r, 0);
  assert.equal(rest.p, 0);
  assert.equal(rest.y, 0);
  assert.ok(Math.abs(rest.t) < 1e-9, 'throttle low → 0');
  const defl = applyAxisMap([0.8, 0.5, 1, -0.6, 0.4, -0.2, 0.9, 0], AETR_MAP);
  assert.equal(defl.r, 0.8);
  assert.equal(defl.p, -0.5);
  assert.equal(defl.y, -0.6);
  assert.ok(Math.abs(defl.t - 1) < 1e-9);
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
  assert.ok(Math.abs(rolled.stick.r - 0.7) < 1e-9, 'roll on axis 0');
  assert.equal(rolled.stick.p, 0);
  assert.equal(rolled.stick.y, 0);

  // Empty Chrome poll while still "connected": keep last sticks, never touch.
  present = false;
  const empty = router.readStick();
  assert.equal(empty.source, 'gamepad');
  assert.equal(empty.touch, false);
  assert.equal(empty.emptyPoll, true);
  assert.ok(Math.abs(empty.stick.r - 0.7) < 1e-9, 'hold last radio sticks');
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
  assert.ok(Math.abs(pitched.stick.p + 0.4) < 1e-9, 'saved pitch sign still inverted');
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
  // Pump, do not hold at +1 — the old 0.6s |delta| hold stalled here.
  sweepThrottle(router, setT, -1, 1, 0.04);
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

test('garbage saved axis map is ignored on load', () => {
  const store = memStore({
    [AXIS_MAP_PREFIX + TX16S_SID]: '{"nope":true}',
  });
  const prof = loadRadioProfile(TX16S_ID, store);
  assert.equal(prof.axisMap, null);
  assert.equal(isValidAxisMap(null), false);
  assert.equal(isValidAxisMap({ r: { i: 0 } }), false);
});
