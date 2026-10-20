// Unit tests for W6 touch sticks, deadzone/expo, and default mode.
// Node stdlib only: `node --test tools/test_sim_touch.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TOUCH_KEY, FLIGHT_MODE_KEY, DEFAULT_TOUCH,
  normalizeTouch, loadTouch, saveTouch,
  applyDeadzone, applyExpo, shapeAxis, mapStickAxes, pointerToStick,
  releaseStick, throttleFromStickY,
  detectMobile, resolveAutoQuality, hasSavedSettings,
  loadFlightMode, saveFlightMode, defaultFlightMode, toggleAcro,
  shouldEnableTouch, shouldShowLandscape, createTouchControls,
  resolveInputSource,
} from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const touchSrc = readFileSync(join(root, 'sim-touch.js'), 'utf8');
const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');
const looksSrc = readFileSync(join(root, 'sim-looks.js'), 'utf8');

function memStore(seed) {
  const mem = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

test('new storage keys only; never writes old ryfly* keys or WebFPV', () => {
  assert.equal(TOUCH_KEY, 'quadmathSimTouch');
  assert.equal(FLIGHT_MODE_KEY, 'quadmathSimFlightMode');
  assert.ok(touchSrc.includes('setItem(TOUCH_KEY') || touchSrc.includes('setItem(TOUCH_KEY,'));
  assert.ok(touchSrc.includes('setItem(FLIGHT_MODE_KEY'));
  assert.equal(/setItem\(\s*['"]ryfly/.test(touchSrc), false);
  assert.ok(touchSrc.includes('Nothing here is copied from WebFPV')
    || touchSrc.includes('copied from WebFPV'));
  assert.ok(touchSrc.includes('Do not write old ryfly'));
});

test('mode 2 maps left throttle/yaw and right pitch/roll', () => {
  const out = mapStickAxes({ x: 0.5, y: 0.2 }, { x: -0.4, y: 0.8 }, 2);
  assert.equal(out.y, 0.5);
  assert.ok(Math.abs(out.t - 0.6) < 1e-9, 'throttle from left Y');
  assert.equal(out.r, -0.4);
  assert.equal(out.p, 0.8);
});

test('mode 1 maps left pitch/yaw and right throttle/roll', () => {
  const out = mapStickAxes({ x: 0.25, y: -0.5 }, { x: 0.7, y: 1 }, 1);
  assert.equal(out.y, 0.25);
  assert.equal(out.p, -0.5);
  assert.equal(out.r, 0.7);
  assert.equal(out.t, 1);
});

test('deadzone zeros the hole and rescales the rest', () => {
  assert.equal(applyDeadzone(0.04, 0.08), 0);
  assert.equal(applyDeadzone(-0.04, 0.08), 0);
  assert.ok(applyDeadzone(0.54, 0.08) > 0.4);
  assert.ok(applyDeadzone(1, 0.08) > 0.99);
  assert.equal(applyDeadzone(-1, 0.1), -1);
});

test('expo reduces center sensitivity and keeps full deflection', () => {
  const mid = applyExpo(0.4, 0.5);
  assert.ok(Math.abs(mid) < 0.4, 'expo should shrink mid-stick');
  assert.ok(Math.abs(applyExpo(1, 0.5) - 1) < 1e-9);
  assert.equal(applyExpo(0.3, 0), 0.3);
  const shaped = shapeAxis(0.05, { deadzone: 0.08, expo: 0.3 });
  assert.equal(shaped, 0);
});

test('pointerToStick flips screen Y and clamps to the rim', () => {
  const o = { x: 100, y: 100 };
  const up = pointerToStick(100, 50, o, 50);
  assert.ok(up.y > 0.99 && Math.abs(up.x) < 1e-9);
  const far = pointerToStick(400, 100, o, 50);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
  assert.ok(far.x > 0.99);
});

test('throttle hold keeps Y; spring centers both axes', () => {
  const held = releaseStick({ x: 0.8, y: 0.4 }, { holdY: true });
  assert.equal(held.x, 0);
  assert.equal(held.y, 0.4);
  const sprung = releaseStick({ x: 0.8, y: 0.4 }, { holdY: false });
  assert.equal(sprung.x, 0);
  assert.equal(sprung.y, 0);
  assert.ok(Math.abs(throttleFromStickY(1) - 1) < 1e-9);
  assert.ok(Math.abs(throttleFromStickY(-1)) < 1e-9);
});

test('default flight mode is angle for a first visit', () => {
  const empty = memStore();
  assert.equal(hasSavedSettings(empty), false);
  assert.equal(defaultFlightMode(empty), 'angle');
  assert.equal(loadFlightMode(empty), null);
  saveFlightMode('acro', empty);
  assert.equal(defaultFlightMode(empty), 'acro');
  assert.equal(hasSavedSettings(empty), true);
  assert.equal(toggleAcro('angle'), 'acro');
  assert.equal(toggleAcro('acro'), 'angle');
  assert.equal(toggleAcro('horizon'), 'acro');
});

test('saved rates without a flight-mode key still default to angle', () => {
  const store = memStore({ ryflyRates: '{"type":"BETAFLIGHT"}' });
  assert.equal(hasSavedSettings(store), true);
  assert.equal(defaultFlightMode(store), 'angle');
});

test('auto quality is low on mobile; touch enable / landscape rules', () => {
  assert.equal(resolveAutoQuality({ mobile: true }), 'low');
  assert.equal(resolveAutoQuality({ gpuLow: true }), 'low');
  assert.equal(resolveAutoQuality({}), 'med');
  assert.equal(shouldEnableTouch({ inputChoice: 'touch' }), true);
  assert.equal(shouldEnableTouch({ inputChoice: 'keyboard', mobile: true }), false);
  assert.equal(shouldEnableTouch({ inputChoice: 'radio', mobile: true }), false);
  assert.equal(shouldEnableTouch({ mobile: true }), true);
  assert.equal(shouldEnableTouch({}), false);
  assert.equal(shouldEnableTouch({ inputChoice: 'touch', hasGamepad: true }), false);
  assert.equal(shouldEnableTouch({ mobile: true, gamepadConnected: true }), false);
  assert.equal(shouldEnableTouch({ mobile: true, padLive: true }), false);
  assert.equal(resolveInputSource({ hasGamepad: true, touchEnabled: true }), 'gamepad');
  assert.equal(resolveInputSource({ touchEnabled: true }), 'touch');
  assert.equal(resolveInputSource({}), 'keyboard');
  assert.equal(shouldShowLandscape({ mobile: true, width: 390, height: 844 }), true);
  assert.equal(shouldShowLandscape({ mobile: true, width: 844, height: 390 }), false);
  assert.equal(detectMobile({
    matchMedia: () => ({ matches: true }),
    ontouchstart: null,
    navigator: { maxTouchPoints: 5 },
    screen: { width: 412, height: 915 },
  }), true);
});

test('3D touch throttle rests at center without changing 2D rest', () => {
  const two = createTouchControls({
    settings: { mode: 2, deadzone: 0, expo: 0, thrSpring: false },
  });
  assert.ok(two.read().t < 0.02);
  const d3 = createTouchControls({
    threeD: true,
    settings: { mode: 2, deadzone: 0, expo: 0, thrSpring: false },
  });
  assert.ok(Math.abs(d3.read().t - 0.5) < 1e-9);
});

test('createTouchControls maps multitouch-style left/right state', () => {
  const reads = [];
  const ctl = createTouchControls({
    onChange: (s) => reads.push(s),
    settings: { mode: 2, deadzone: 0, expo: 0, thrSpring: false },
  });
  ctl.setStick('L', { x: 0.2, y: 0 });
  ctl.setStick('R', { x: -0.3, y: 0.5 });
  const s = ctl.read();
  assert.ok(Math.abs(s.y - 0.2) < 1e-9);
  assert.ok(Math.abs(s.r + 0.3) < 1e-9);
  assert.ok(Math.abs(s.p - 0.5) < 1e-9);
  assert.ok(s.t > 0.45 && s.t < 0.55);
  assert.ok(reads.length >= 1);
  const sprung = createTouchControls({ settings: { mode: 2, thrSpring: true, deadzone: 0, expo: 0 } });
  sprung.setStick('L', { x: 1, y: 1 });
  sprung.setStick('L', releaseStick(sprung.state.left, { holdY: false }));
  assert.equal(sprung.read().y, 0);
  assert.equal(sprung.read().t, 0.5);
});

test('touch settings persist on the new key only', () => {
  const store = memStore();
  saveTouch({ mode: 1, size: 140, opacity: 0.4, deadzone: 0.12, expo: 0.3, thrSpring: true }, store);
  assert.deepEqual(store.keys(), [TOUCH_KEY]);
  const loaded = loadTouch(store);
  assert.equal(loaded.mode, 1);
  assert.equal(loaded.size, 140);
  assert.equal(loaded.thrSpring, true);
  assert.equal(normalizeTouch({ mode: 9, size: 10, opacity: 9 }).mode, 2);
});

test('sim.html drops the mobile gate and wires W6 touch', () => {
  assert.ok(simSrc.includes('sim-touch.js'));
  assert.equal(simSrc.includes('id="mobileGate"'), false);
  assert.equal(simSrc.includes('Desktop + controller/radio required'), false);
  assert.equal(simSrc.includes('Try anyway (tablet + gamepad)'), false);
  assert.ok(simSrc.includes('id="touchLayer"'));
  assert.ok(simSrc.includes('id="hudAcro"'));
  assert.ok(simSrc.includes('feelTouch') || simSrc.includes('onTouch'));
  assert.ok(simSrc.includes('startHeavyAssets') || simSrc.includes('_tryAssets'));
  assert.ok(simSrc.includes('user-scalable=no') || simSrc.includes('maximum-scale=1'));
  assert.ok(simSrc.includes('touch-action:none') || simSrc.includes('touch-action: none'));
  assert.ok(simSrc.includes('defaultFlightMode'));
  assert.ok(simSrc.includes('resolveAutoQuality') || simSrc.includes('isMobile'));
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML');
  assert.ok(!simSrc.toLowerCase().includes('webfpv'));
});

test('first-run prompt keeps keyboard/calibrate and adds Touch', () => {
  assert.ok(feelSrc.includes("v === 'touch'") || feelSrc.includes("v==='touch'"));
  assert.ok(feelSrc.includes('feelTouch') || feelSrc.includes('id="feelTouch"'));
  assert.ok(feelSrc.includes('onTouch'));
  assert.ok(feelSrc.includes('Fly with keyboard') || feelSrc.includes('feelKeys'));
  assert.ok(feelSrc.includes('id="feelRadio"') || feelSrc.includes('feelRadio'));
  assert.ok(feelSrc.includes("v === 'radio'") || feelSrc.includes("v==='radio'"));
  assert.ok(feelSrc.includes('Touch sticks stay off while a radio is connected'));
});

test('M3 touch-only first visit skips No controller overlay and keyboard', () => {
  assert.ok(feelSrc.includes('touchy && !hasPad') || feelSrc.includes('touchy&&!hasPad'));
  assert.ok(feelSrc.includes("saveInputChoice('touch')"));
  assert.ok(feelSrc.includes('const kbBtn = touchy') || feelSrc.includes('const kbBtn=touchy'));
  assert.ok(simSrc.includes('touchFirst') || simSrc.includes('touch:touchFirst') || simSrc.includes('touch: touchFirst'));
  assert.ok(feelSrc.includes('info.mobile'), 'desktop Chrome ontouchstart must not auto-touch');
});

test('looks auto quality consults mobile and defers heavy assets', () => {
  assert.ok(looksSrc.includes('resolveAutoQuality') || looksSrc.includes('isMobile') || looksSrc.includes('mobile'));
  assert.ok(looksSrc.includes('afterFirstFrame'));
});

test('sim.html gamepad path does not fall through to touch', () => {
  assert.ok(simSrc.includes('if(gpConnected)'));
  assert.ok(simSrc.includes('empty Chrome polls') || simSrc.includes('empty polls'));
  assert.ok(simSrc.includes('hasGamepad:gpConnected') || simSrc.includes('hasGamepad: gpConnected'));
  assert.ok(simSrc.includes('RADIO CONNECTED — TOUCH OFF') || simSrc.includes('enableTouchLayer(false)'));
  assert.ok(simSrc.includes('pickGamepad()'));
  assert.ok(simSrc.includes('loadRadioProfile'));
  assert.ok(simSrc.includes('applyAxisMap'));
  assert.ok(simSrc.includes('body.calibrating'));
});

test('existing localStorage keys stay in sim.html', () => {
  const keys = [
    'ryflyRates', 'ryflyRatesType', 'ryflyDroneType', 'ryflyCamCustom',
    'ryflyAxisMap_', 'ryflyRadioPreset_', 'ryflyGamepadId', 'ryflyMusicVol', 'ryflyMusicOn',
    'quadmath_bestLap_', 'quadmath_bestRun_', 'quadmath_bestGhost_',
    'quadmath_pilotName',
  ];
  const src = simSrc + '\n' + touchSrc;
  for (const k of keys) {
    assert.ok(src.includes(k), `sim lost key ${k}`);
  }
});
