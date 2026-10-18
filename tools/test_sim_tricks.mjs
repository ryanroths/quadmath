// Unit tests for freestyle trick detection + combo scoring.
// Node stdlib only: `node --test tools/test_sim_tricks.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRICKS_KEY, TRICK_LIST, TRICK_BY_ID, STORE_VER, COMBO_WINDOW_S,
  formatScore, formatScoreFull, comboMul, varietyMul, uniqueBonus, scoreTrick,
  upZOf, headingOf, bodyDelta, scanClearance, unwrapDelta,
  emptyStore, normalizeStore, loadStore, saveStore, recordBest, bestLine, bestForMap,
  makeDetector, resetDetector, stepDetector,
  makeCombo, resetCombo, pushCombo, comboRemain,
  createTricks,
} from '../sim-tricks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'sim-tricks.js'), 'utf8');
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';

function memStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

function qNorm(q) {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= n; q.y /= n; q.z /= n; q.w /= n;
  return q;
}

function qIntegrate(q, omega, dt) {
  const hx = omega.x * dt * 0.5, hy = omega.y * dt * 0.5, hz = omega.z * dt * 0.5;
  const x = q.x, y = q.y, z = q.z, w = q.w;
  q.x += hx * w + hy * z - hz * y;
  q.y += hy * w + hz * x - hx * z;
  q.z += hz * w + hx * y - hy * x;
  q.w += -hx * x - hy * y - hz * z;
  return qNorm(q);
}

function identityQ() { return { x: 0, y: 0, z: 0, w: 1 }; }

function sampleFrom(q, omega, extra) {
  const e = extra || {};
  return {
    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    ox: omega.x, oy: omega.y, oz: omega.z,
    wx: e.wx == null ? 0 : e.wx,
    wy: e.wy == null ? (e.alt == null ? 8 : e.alt * 3.5) : e.wy,
    wz: e.wz == null ? 0 : e.wz,
    alt: e.alt == null ? 2.4 : e.alt,
    speed: e.speed == null ? 6 : e.speed,
    clearance: e.clearance == null ? 2.4 : e.clearance,
    throttle: e.throttle == null ? 0.55 : e.throttle,
    armed: e.armed == null ? true : e.armed,
    colliders: e.colliders || null,
    vz: e.vz == null ? 0 : e.vz,
    ws: 3.5,
  };
}

function runTrace(opts) {
  const o = opts || {};
  const d = makeDetector();
  const q = o.q || identityQ();
  const hits = [];
  const n = o.n || 80;
  const dt = o.dt || 0.016;
  resetDetector(d, sampleFrom(q, { x: 0, y: 0, z: 0 }, o.start || {}));
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const omega = o.omega ? o.omega(t, i) : { x: 0, y: 0, z: 0 };
    qIntegrate(q, omega, dt);
    const extra = o.at ? o.at(t, i, q) : (o.start || {});
    const ev = stepDetector(d, sampleFrom(q, omega, extra), dt);
    if (ev) hits.push(ev);
  }
  return hits;
}

test('new storage key only; never writes old ryfly* keys', () => {
  assert.equal(TRICKS_KEY, 'quadmathSimTricks');
  assert.equal(STORE_VER, 1);
  assert.ok(src.includes('setItem(TRICKS_KEY') || src.includes('store.setItem(TRICKS_KEY'));
  assert.equal(src.includes('ryflyDroneType'), false);
  assert.equal(src.includes('ryflyRates'), false);
  assert.ok(src.includes('Nothing here is copied from WebFPV') || src.includes('copied from WebFPV (GPL)'));
  assert.ok(src.includes('Do not write old ryfly'));
  assert.ok(src.includes('Neon Current') || src.includes('#ff2bd6'));
  assert.equal(src.includes('FLIPPED — R TO RESPAWN'), false);
});

test('trick list has the requested maneuvers and frozen point values', () => {
  const ids = TRICK_LIST.map((t) => t.id);
  for (const id of ['flip', 'roll', 'yawspin', 'powerloop', 'splits', 'matty', 'hang', 'dive', 'gap', 'prox']) {
    assert.ok(ids.includes(id), 'missing ' + id);
    assert.ok(TRICK_BY_ID[id].points > 0);
    assert.ok(TRICK_BY_ID[id].name);
  }
  assert.equal(TRICK_BY_ID.flip.points, 200);
  assert.equal(TRICK_BY_ID.roll.points, 200);
  assert.equal(TRICK_BY_ID.yawspin.points, 250);
  assert.equal(TRICK_BY_ID.powerloop.points, 450);
  assert.equal(TRICK_BY_ID.splits.points, 400);
  assert.equal(TRICK_BY_ID.matty.points, 600);
  assert.equal(TRICK_BY_ID.hang.points, 300);
  assert.equal(TRICK_BY_ID.dive.points, 350);
  assert.equal(TRICK_BY_ID.gap.points, 500);
  assert.equal(TRICK_BY_ID.prox.points, 280);
});

test('combo multiplier grows and variety cuts repeats', () => {
  assert.equal(comboMul(1), 1);
  assert.equal(comboMul(2), 1.5);
  assert.equal(comboMul(5), 3);
  assert.equal(comboMul(20), 6);
  assert.equal(varietyMul(0), 1);
  assert.equal(varietyMul(1), 0.55);
  assert.ok(varietyMul(3) < varietyMul(1));
  assert.equal(uniqueBonus(1), 1);
  assert.equal(uniqueBonus(3), 1.1);
  const a = scoreTrick('flip', 0, 1, 1);
  const b = scoreTrick('flip', 1, 2, 1);
  assert.ok(b < a * 1.5, 'repeat should not outpace a fresh flip even with mul');
  const c = scoreTrick('matty', 0, 3, 3);
  assert.ok(c > scoreTrick('flip', 0, 3, 3));
});

test('body-frame quat delta integrates a pure roll as roll, not pitch', () => {
  const q0 = identityQ();
  const q1 = identityQ();
  qIntegrate(q1, { x: 8, y: 0, z: 0 }, 0.02);
  const d = bodyDelta(q0, q1, { r: 0, p: 0, y: 0 });
  assert.ok(Math.abs(d.r) > 0.14 && Math.abs(d.r) < 0.2, 'roll delta ' + d.r);
  assert.ok(Math.abs(d.p) < 0.02, 'pitch leak ' + d.p);
  assert.ok(Math.abs(d.y) < 0.02, 'yaw leak ' + d.y);
  assert.ok(upZOf(q0) > 0.99);
  assert.ok(Math.abs(unwrapDelta(0, headingOf(q0))) < 0.01);
});

test('hover wobble does not score a flip, roll, or yaw spin', () => {
  const hits = runTrace({
    n: 180,
    omega: (t) => ({ x: 0.35 * Math.sin(t * 9), y: 0.28 * Math.cos(t * 7), z: 0.3 * Math.sin(t * 5) }),
    at: () => ({ alt: 1.8, speed: 0.4, clearance: 1.8, throttle: 0.35 }),
  });
  assert.deepEqual(hits.filter((h) => TRICK_BY_ID[h]), []);
});

test('synthetic 360 pitch is a Flip', () => {
  const hits = runTrace({
    n: 70,
    omega: () => ({ x: 0, y: 8.5, z: 0 }),
    at: () => ({ alt: 2.2, speed: 3.2, clearance: 2.2 }),
  });
  assert.ok(hits.includes('flip'), 'got ' + hits.join(','));
  assert.equal(hits.includes('roll'), false);
  assert.equal(hits.includes('powerloop'), false);
});

test('synthetic 360 roll is a Roll', () => {
  const hits = runTrace({
    n: 70,
    omega: () => ({ x: 8.5, y: 0, z: 0 }),
    at: () => ({ alt: 2.2, speed: 4, clearance: 2.2 }),
  });
  assert.ok(hits.includes('roll'), 'got ' + hits.join(','));
  assert.equal(hits.includes('flip'), false);
});

test('synthetic 360 yaw is a Yaw Spin', () => {
  const hits = runTrace({
    n: 80,
    omega: () => ({ x: 0, y: 0, z: 7.2 }),
    at: () => ({ alt: 1.9, speed: 1.2, clearance: 1.9 }),
  });
  assert.ok(hits.includes('yawspin'), 'got ' + hits.join(','));
});

test('pitch 360 with altitude loop and travel is a Power Loop', () => {
  const hits = runTrace({
    n: 90,
    omega: () => ({ x: 0, y: 6.4, z: 0 }),
    at: (t) => ({
      alt: 6 + 4 * Math.sin(t * 6.4),
      wx: t * 12,
      wy: (6 + 4 * Math.sin(t * 6.4)) * 3.5,
      wz: 0,
      speed: 9,
      clearance: 6,
    }),
  });
  assert.ok(hits.includes('powerloop'), 'got ' + hits.join(','));
  assert.equal(hits.includes('flip'), false);
});

test('pitch 360 mixed with ~180 yaw is a Matty Flip', () => {
  const hits = runTrace({
    n: 80,
    omega: () => ({ x: 0, y: 8.2, z: 4.1 }),
    at: () => ({ alt: 3.2, speed: 7, clearance: 3.2, wx: 2, wz: 2 }),
  });
  assert.ok(hits.includes('matty'), 'got ' + hits.join(','));
  assert.equal(hits.includes('flip'), false);
});

test('half roll then pull-through with drop and heading reverse is a Split-S', () => {
  const hits = runTrace({
    n: 110,
    omega: (t) => {
      if (t < 0.28) return { x: 11, y: 0, z: 0 };
      if (t < 0.85) return { x: 0, y: 7.5, z: 0 };
      return { x: 0, y: 0, z: 0 };
    },
    at: (t) => ({
      alt: t < 0.28 ? 8 : 8 - (t - 0.28) * 10,
      speed: 9,
      clearance: 8,
      wx: t * 8,
      wz: 0,
    }),
  });
  assert.ok(hits.includes('splits'), 'got ' + hits.join(','));
});

test('inverted hang for 0.8s scores once, not from a turtled deck', () => {
  const inverted = { x: 1, y: 0, z: 0, w: 0 };
  assert.ok(upZOf(inverted) < -0.9);
  const air = runTrace({
    n: 140,
    q: { x: 1, y: 0, z: 0, w: 0 },
    omega: () => ({ x: 0, y: 0, z: 0 }),
    at: () => ({ alt: 3.2, speed: 0.4, clearance: 3.0, throttle: 0.4 }),
  });
  assert.ok(air.includes('hang'), 'got ' + air.join(','));
  assert.equal(air.filter((h) => h === 'hang').length, 1);

  const deck = runTrace({
    n: 80,
    q: { x: 1, y: 0, z: 0, w: 0 },
    omega: () => ({ x: 0, y: 0, z: 0 }),
    at: () => ({ alt: 0.02, speed: 0.05, clearance: 0.01, throttle: 0.0 }),
  });
  assert.equal(deck.includes('hang'), false);
});

test('fast altitude dump at speed is a Dive', () => {
  const hits = runTrace({
    n: 70,
    omega: () => ({ x: 0, y: 0.4, z: 0 }),
    at: (t) => ({
      alt: 12 - t * 14,
      speed: 16,
      vz: -12,
      clearance: 12 - t * 14,
      throttle: 0.2,
    }),
  });
  assert.ok(hits.includes('dive'), 'got ' + hits.join(','));
});

test('flying through a narrow opening is a Gap Thread', () => {
  const colliders = [
    { min: { x: -8, y: 0, z: -4 }, max: { x: -0.7, y: 6, z: 4 } },
    { min: { x: 0.7, y: 0, z: -4 }, max: { x: 8, y: 6, z: 4 } },
    { min: { x: -8, y: 4.2, z: -4 }, max: { x: 8, y: 8, z: 4 } },
  ];
  const hits = runTrace({
    n: 90,
    omega: () => ({ x: 0, y: 0, z: 0 }),
    at: (t) => ({
      wx: 0, wy: 2.4, wz: -14 + t * 16,
      alt: 0.7, speed: 8, clearance: 0.7,
      colliders,
    }),
  });
  assert.ok(hits.includes('gap'), 'got ' + hits.join(','));
});

test('near-miss a wall at speed is Proximity', () => {
  const colliders = [
    { min: { x: 1.1, y: 0, z: -20 }, max: { x: 8, y: 12, z: 20 } },
  ];
  const hits = runTrace({
    n: 50,
    omega: () => ({ x: 0, y: 0, z: 0 }),
    at: (t) => ({
      wx: 0, wy: 3.5, wz: t * 30,
      alt: 1, speed: 12, clearance: 1,
      colliders,
    }),
  });
  assert.ok(hits.includes('prox'), 'got ' + hits.join(','));
});

test('scanClearance finds overhead decks and side walls without allocating', () => {
  const out = { up: 0, dn: 0, px: 0, nx: 0, pz: 0, nz: 0, near: 0 };
  const a = scanClearance(0, 2, 0, [
    { min: { x: -2, y: 3, z: -2 }, max: { x: 2, y: 4, z: 2 } },
    { min: { x: 1.5, y: 0, z: -2 }, max: { x: 4, y: 5, z: 2 } },
  ], out);
  assert.equal(a, out);
  assert.ok(out.up > 0.8 && out.up < 1.3, 'up ' + out.up);
  assert.ok(out.px < 2, 'px ' + out.px);
});

test('combo chains, banks on crash/land, and persists bests per map', () => {
  const clock = { t: 10 };
  const store = memStore();
  const tricks = createTricks({
    document: null,
    storage: store,
    muted: () => true,
    now: () => clock.t,
  });
  tricks.setActive(true, 'city');
  const q = identityQ();
  const omega = { x: 0, y: 8.5, z: 0 };
  for (let i = 0; i < 70; i++) {
    clock.t += 0.016;
    qIntegrate(q, omega, 0.016);
    tricks.tick(sampleFrom(q, omega, { alt: 2.2, speed: 3.2, clearance: 2.2 }), 0.016);
  }
  assert.ok(tricks.comboN() >= 1, 'combo ' + tricks.comboN());
  const comboPts = tricks.comboPoints();
  assert.ok(comboPts >= 200);
  const banked = tricks.noteCrash();
  assert.equal(banked, comboPts);
  assert.equal(tricks.comboN(), 0);
  assert.equal(tricks.session(), comboPts);
  const saved = loadStore(store);
  assert.equal(saved.maps.city.bestCombo, comboPts);
  assert.equal(saved.maps.city.bestSession, comboPts);
  assert.equal(bestLine(saved, 'city').includes('·'), true);
  assert.equal(bestLine(saved, 'living'), '—');
  assert.equal(store.keys().join(','), TRICKS_KEY);
});

test('createTricks swallows tick errors and ignores races', () => {
  const tricks = createTricks({ document: null, storage: memStore(), muted: () => true, now: () => 1 });
  tricks.setActive(false, 'city');
  const q = identityQ();
  qIntegrate(q, { x: 0, y: 20, z: 0 }, 0.5);
  const ev = tricks.tick(sampleFrom(q, { x: 0, y: 20, z: 0 }), 0.016);
  assert.equal(ev, null);
  assert.equal(tricks.comboN(), 0);
  tricks.setActive(true, 'city');
  const boom = tricks.tick(null, 0.016);
  assert.equal(boom, null);
  tricks.setHudOn(false);
  assert.equal(tricks.hudOn(), false);
  tricks.setHudOn(true);
  assert.equal(tricks.hudOn(), true);
});

test('combo window expiry banks rather than wiping', () => {
  const clock = { t: 1 };
  const tricks = createTricks({
    document: null, storage: memStore(), muted: () => true, now: () => clock.t,
  });
  tricks.setActive(true, 'garage');
  const q = identityQ();
  const omega = { x: 8.5, y: 0, z: 0 };
  for (let i = 0; i < 70; i++) {
    clock.t += 0.016;
    qIntegrate(q, omega, 0.016);
    tricks.tick(sampleFrom(q, omega, { alt: 2, speed: 4, clearance: 2 }), 0.016);
  }
  assert.ok(tricks.comboN() >= 1);
  const pts = tricks.comboPoints();
  clock.t += COMBO_WINDOW_S + 0.05;
  tricks.tick(sampleFrom(q, { x: 0, y: 0, z: 0 }, { alt: 2, speed: 1, clearance: 2 }), 0.016);
  assert.equal(tricks.comboN(), 0);
  assert.equal(tricks.session(), pts);
});

test('normalizeStore rejects junk and keeps hud default on', () => {
  const s = normalizeStore({ v: 9, hud: false, maps: { city: { bestCombo: '12.2', bestSession: -4 } } });
  assert.equal(s.hud, false);
  assert.equal(s.maps.city.bestCombo, 12);
  assert.equal(s.maps.city.bestSession, 0);
  assert.equal(emptyStore().hud, true);
  const store = memStore();
  saveStore(s, store);
  const loaded = loadStore(store);
  assert.equal(loaded.hud, false);
  recordBest(loaded, 'city', 500, 900);
  assert.equal(bestForMap(loaded, 'city').bestSession, 900);
  assert.equal(formatScore(2400), '2.4k');
  assert.equal(formatScoreFull(2400), '2,400');
});

test('sim.html wires tricks without touching physics or old keys', () => {
  assert.ok(simSrc.includes('sim-tricks.js'));
  assert.ok(simSrc.includes('createTricks'));
  assert.ok(simSrc.includes('TRICKS_KEY'));
  assert.ok(simSrc.includes('id="cbTricksHud"') || simSrc.includes('cbTricksHud'));
  assert.ok(simSrc.includes('tricks.tick') || simSrc.includes('tricks&&tricks.tick'));
  assert.ok(simSrc.includes('try{') && simSrc.includes('tricks.tick'));
  assert.ok(simSrc.includes('noteCrash'));
  const feelSrc = readFileSync(join(root, 'sim-feel.js'), 'utf8');
  assert.equal(src.includes('FLIPPED — R TO RESPAWN'), false);
  assert.ok(feelSrc.includes('FLIPPED — R TO RESPAWN'), 'stuck-flip toast stays in feel');
  assert.ok(feelSrc.includes('shouldToastFlip'));
  assert.ok(!src.includes('qp.step') && !src.includes('maxThrust'));
  for (const k of ['ryflyRates', 'ryflyDroneType', 'quadmath_bestLap_', 'quadmath_bestGhost_']) {
    assert.ok(simSrc.includes(k), 'must keep reading old key ' + k);
  }
});
