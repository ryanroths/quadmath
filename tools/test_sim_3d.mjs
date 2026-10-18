// Unit tests for Betaflight-style 3D throttle mapping and persistence.
// Node stdlib only: `node --test tools/test_sim_3d.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  THREED_KEY, THREED_DEADBAND, THREED_REVERSE_SCALE, THREED_ARM_BAND,
  loadThreeD, saveThreeD, mapThrottle3d, throttleSafeToArm,
  parseThreeDQuery, runCountsForBoards, throttleHudText,
  throttleCollective, armHintText, stepAutoArm,
} from '../sim-3d.js';
import { REVERSE_THRUST_SCALE } from '../quadphysics.js';
import { createTouchControls } from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const src3d = readFileSync(join(root, 'sim-3d.js'), 'utf8');

function memStore(seed) {
  const mem = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

test('new storage key only; never writes old ryfly* keys or WebFPV', () => {
  assert.equal(THREED_KEY, 'quadmathSim3D');
  assert.ok(src3d.includes('setItem(THREED_KEY'));
  assert.equal(/setItem\(\s*['"]ryfly/.test(src3d), false);
  assert.ok(src3d.includes('Do not write old ryfly'));
  assert.ok(src3d.includes('Nothing here is copied from WebFPV')
    || src3d.includes('copied from WebFPV'));
  const store = memStore();
  saveThreeD(true, store);
  assert.deepEqual(store.keys(), [THREED_KEY]);
  assert.equal(loadThreeD(store), true);
  saveThreeD(false, store);
  assert.equal(loadThreeD(store), false);
  assert.equal(loadThreeD(memStore()), false);
});

test('center stick is zero; deadband; same curve above and below', () => {
  assert.equal(mapThrottle3d(0.5), 0);
  assert.equal(mapThrottle3d(0.5 + THREED_DEADBAND * 0.5), 0);
  assert.equal(mapThrottle3d(0.5 - THREED_DEADBAND * 0.5), 0);
  const up = mapThrottle3d(1);
  const down = mapThrottle3d(0);
  assert.ok(Math.abs(up - 1) < 1e-9, 'full up is +1');
  assert.ok(Math.abs(down + 1) < 1e-9, 'full down is -1');
  const a = mapThrottle3d(0.5 + 0.2);
  const b = mapThrottle3d(0.5 - 0.2);
  assert.ok(a > 0 && b < 0);
  assert.ok(Math.abs(a + b) < 1e-9, 'mapping is odd (symmetric)');
  const curved = mapThrottle3d(0.85, { curve: 0.68 });
  const linear = mapThrottle3d(0.85, { curve: 1 });
  assert.ok(curved > linear, 'exponent < 1 raises mid-stick like 2D thrCurve');
});

test('arming requires centered throttle in 3D, low throttle in 2D', () => {
  assert.equal(throttleSafeToArm(0, false), true);
  assert.equal(throttleSafeToArm(0.2, false), false);
  assert.equal(throttleSafeToArm(0.5, true), true);
  assert.equal(throttleSafeToArm(0.5 + THREED_ARM_BAND * 0.5, true), true);
  assert.equal(throttleSafeToArm(0, true), false);
  assert.equal(throttleSafeToArm(1, true), false);
  assert.equal(runCountsForBoards(true), false);
  assert.equal(runCountsForBoards(false), true);
});

test('query param and HUD text', () => {
  assert.equal(parseThreeDQuery('1'), true);
  assert.equal(parseThreeDQuery('on'), true);
  assert.equal(parseThreeDQuery('0'), false);
  assert.equal(parseThreeDQuery('off'), false);
  assert.equal(parseThreeDQuery(null), null);
  assert.equal(parseThreeDQuery('acro'), null);
  assert.equal(throttleHudText(0.5, true), 'THR 0%');
  assert.ok(throttleHudText(1, true).startsWith('THR +'));
  assert.ok(throttleHudText(0, true).startsWith('THR -'));
  assert.equal(throttleHudText(0.4, false), 'THR 40%');
});

test('reverse scale stays in lockstep with the physics motor curve', () => {
  assert.equal(THREED_REVERSE_SCALE, REVERSE_THRUST_SCALE);
  assert.ok(REVERSE_THRUST_SCALE > 0.7 && REVERSE_THRUST_SCALE < 1);
});

test('touch throttle rests at center in 3D and at the bottom in 2D', () => {
  const two = createTouchControls({
    settings: { mode: 2, deadzone: 0, expo: 0, thrSpring: false },
  });
  assert.ok(two.read().t < 0.02, '2D rest is zero throttle');
  const d3 = createTouchControls({
    threeD: true,
    settings: { mode: 2, deadzone: 0, expo: 0, thrSpring: false },
  });
  assert.ok(Math.abs(d3.read().t - 0.5) < 1e-9, '3D rest is center');
  two.setThreeD(true);
  assert.ok(Math.abs(two.read().t - 0.5) < 1e-9, 'enabling 3D snaps idle throttle to center');
  d3.setThreeD(false);
  assert.ok(d3.read().t < 0.02, 'disabling 3D snaps idle throttle to zero');
});

test('sim.html wires 3D toggle, HUD, query, and board skip', () => {
  assert.ok(simSrc.includes('sim-3d.js'));
  assert.ok(simSrc.includes('id="cb3d"'));
  assert.ok(simSrc.includes('id="hud3d"'));
  assert.ok(simSrc.includes('parseThreeDQuery'));
  assert.ok(simSrc.includes("q.get('3d')") || simSrc.includes('q.get("3d")'));
  assert.ok(simSrc.includes('runCountsForBoards'));
  assert.ok(simSrc.includes('3D IS ACRO ONLY') || simSrc.includes('3D ON — ACRO'));
  assert.ok(simSrc.includes('CENTER THROTTLE TO ARM'));
  assert.ok(simSrc.includes('throttleCollective') || src3d.includes('throttleCollective'));
  assert.equal(armHintText(false), 'Raise throttle to fly (auto-arm)');
  assert.equal(armHintText({ threeD: false, autoArm: false }), 'Throttle down + Space/arm switch to arm');
  assert.ok(throttleCollective(1, false, 0.68) > 0.9);
  assert.ok(throttleCollective(1, true, 0.68) > 0.9);
  assert.equal(throttleCollective(0.5, true, 0.68), 0);
  assert.ok(simSrc.includes('3D OFF FOR COACH'));
  assert.ok(simSrc.includes('mapThrottle3d'));
  assert.ok(simSrc.includes('THREED_KEY') || simSrc.includes('quadmathSim3D') || simSrc.includes('loadThreeD'));
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML');
  const boot = simSrc.slice(
    simSrc.indexOf('function applyQueryBoot'),
    simSrc.indexOf('function publishTracks'),
  );
  assert.ok(boot.includes('parseThreeDQuery'));
  assert.ok(boot.includes("q.get('3d')") || boot.includes('q.get("3d")'));
});
