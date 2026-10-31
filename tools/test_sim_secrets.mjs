// Hidden sparks + secret spots. node --test tools/test_sim_secrets.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import { SKINS, isSkinUnlocked, mapObstacles, SKIN_KEY } from '../sim-retention.js';
import { LAYOUT } from '../sim-maps.js';
import { MAPS, isFreestyleTrackId, freestyleIdFor } from '../sim-tracks.js';
import {
  SECRETS_KEY, SECRET_MAP_IDS, SPARK_NAME, HINT_M, HINT_U, WHOOP_R, COLLECT_U,
  SPARK_R, SPARK_MAX_SCREEN, sparkVisualScale,
  emptySecrets, normalizeSecrets, loadSecrets, saveSecrets, markSpark, markSecret,
  placementsFor, sparkCount, secretCount, catalogTotals, mapProgress, sparksLabel,
  totalProgress, menuSparksText, colliderBoxes, pointClear, pointClearReason,
  inPlayable, SECRET_SKINS, allSkins, catalogSkinById, catalogSkinUnlocked,
  catalogSkinLabel, unlockedCatalogSkins, loadCatalogSkinId, saveCatalogSkinId,
  resolveCatalogSkin, rewardsForMap, isSecretsMap, freestyleSecretsActive,
  createSecrets, STOCK_SKIN_IDS,
} from '../sim-secrets.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'sim-secrets.js'), 'utf8');
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';

function memStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

test('secret maps match the freestyle catalog minus Your Room and the maps on the look', () => {
  // The Rig has no decor, sparks or secrets: the owner's spec ("no decor"). The
  // House, on the same look, has none either.
  const ids = MAPS.map((m) => m.id).filter((id) => id !== 'room' && id !== 'rig' && id !== 'house');
  assert.deepEqual([...SECRET_MAP_IDS].sort(), ids.slice().sort());
  assert.equal(SPARK_NAME, 'Spark');
  assert.equal(SECRETS_KEY, 'quadmathSimSecrets');
  assert.equal(HINT_M, 3);
  assert.ok(HINT_U > 8);
  assert.equal(isSecretsMap('city'), true);
  assert.equal(isSecretsMap('room'), false);
  assert.equal(freestyleSecretsActive('city-freestyle', 'city'), true);
  assert.equal(freestyleSecretsActive(freestyleIdFor('gym'), 'gym'), true);
  assert.equal(freestyleSecretsActive('living-sofa', 'living'), false);
  assert.equal(isFreestyleTrackId('city-loop'), false);
});

test('each map has 10-15 sparks and 1-2 secrets, deterministic', () => {
  const totals = catalogTotals();
  assert.ok(totals.sparks >= 80 && totals.sparks <= 120);
  assert.ok(totals.secrets >= 8 && totals.secrets <= 16);
  const seen = new Set();
  for (const id of SECRET_MAP_IDS) {
    const n = sparkCount(id);
    const k = secretCount(id);
    assert.ok(n >= 10 && n <= 15, id + ' sparks ' + n);
    assert.ok(k >= 1 && k <= 2, id + ' secrets ' + k);
    const a = placementsFor(id);
    const b = placementsFor(id);
    assert.deepEqual(a, b);
    for (const p of a.sparks) {
      assert.ok(!seen.has('s:' + p.id), p.id);
      seen.add('s:' + p.id);
    }
    for (const s of a.secrets) {
      assert.ok(s.name && s.r > 0.6);
      assert.ok(!seen.has('k:' + id + ':' + s.id), s.id);
      seen.add('k:' + id + ':' + s.id);
    }
  }
});

test('every spark and secret is clear of map collider data', () => {
  for (const id of SECRET_MAP_IDS) {
    const boxes = colliderBoxes(id);
    assert.ok(boxes.length > 0, id + ' boxes');
    if (id !== 'city' && id !== 'backyard') {
      const L = LAYOUT[id];
      const daily = mapObstacles({ id, w: L.w, d: L.d, h: L.h, wall: L.wall });
      assert.ok(daily.length >= 4, id + ' daily obstacles');
    }
    const pack = placementsFor(id);
    for (const p of pack.sparks) {
      const why = pointClearReason(id, p, WHOOP_R);
      assert.equal(why, '', id + ' spark ' + p.id + ' ' + why + ' @ ' + p.x + ',' + p.y + ',' + p.z);
      assert.equal(pointClear(id, p, WHOOP_R), true);
    }
    for (const s of pack.secrets) {
      const why = pointClearReason(id, { x: s.x, y: s.y, z: s.z }, Math.min(WHOOP_R, s.r * 0.35));
      assert.equal(why, '', id + ' secret ' + s.id + ' ' + why);
    }
    for (let i = 0; i < pack.sparks.length; i++) {
      for (let j = i + 1; j < pack.sparks.length; j++) {
        const a = pack.sparks[i], b = pack.sparks[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        assert.ok(d > 1.1, id + ' sparks ' + a.id + '/' + b.id + ' too close ' + d);
      }
    }
  }
  assert.equal(inPlayable('living', { x: 0, y: 1, z: 0 }), true);
  assert.equal(inPlayable('living', { x: 20, y: 1, z: 0 }), false);
  assert.equal(pointClear('living', { x: 0, y: 0.6, z: -10.6 }), true, 'sofa crawl is open');
  assert.equal(pointClear('living', { x: 0, y: 1.28, z: -10.6 }), false, 'sofa seat still solid');
});

test('progress persists on the new key and labels stay original', () => {
  const store = memStore();
  let p = emptySecrets();
  p = markSpark(p, 'city', 'c01');
  p = markSpark(p, 'city', 'c01');
  p = markSecret(p, 'city', 'well');
  saveSecrets(p, store);
  assert.equal(store.getItem(SECRETS_KEY).includes('c01'), true);
  const loaded = loadSecrets(store);
  assert.deepEqual(loaded.maps.city.sparks, ['c01']);
  assert.deepEqual(loaded.maps.city.secrets, ['well']);
  const city = mapProgress('city', loaded);
  assert.equal(city.got, 1);
  assert.equal(city.foundSecret, true);
  assert.equal(city.complete, false);
  assert.equal(sparksLabel('city', loaded), 'Sparks 1/' + sparkCount('city'));
  assert.match(menuSparksText(loaded), /^Sparks \d+\/\d+$/);
  const tot = totalProgress(loaded);
  assert.equal(tot.got, 1);
  assert.equal(tot.secretsGot, 1);
  const bad = normalizeSecrets({ maps: { city: { sparks: [1, ''], secrets: null } } });
  assert.deepEqual(bad.maps.city.sparks, []);
});

test('stock skin ids and unlocks stay frozen; secret skins are extra', () => {
  assert.deepEqual(STOCK_SKIN_IDS, [
    'stock', 'bronze', 'silver', 'gold', 'streak3', 'streak7', 'daily-fast', 'coach-all',
  ]);
  assert.deepEqual(SKINS.map((s) => s.id), STOCK_SKIN_IDS);
  const extras = SECRET_SKINS.map((s) => s.id);
  assert.equal(extras.length, 16);
  for (const id of extras) assert.equal(STOCK_SKIN_IDS.includes(id), false);
  assert.equal(allSkins().length, SKINS.length + SECRET_SKINS.length);
  const none = { medals: {}, daily: { streak: 0, bestStreak: 0, bestByDay: {} } };
  const empty = emptySecrets();
  assert.equal(catalogSkinUnlocked(SKINS[0], none, empty), true);
  assert.equal(isSkinUnlocked(SKINS.find((s) => s.id === 'bronze'), none), false);
  const citySkin = catalogSkinById('spark-city');
  assert.equal(catalogSkinUnlocked(citySkin, none, empty), false);
  let p = emptySecrets();
  const pack = placementsFor('city');
  for (const s of pack.sparks) p = markSpark(p, 'city', s.id);
  assert.equal(catalogSkinUnlocked(citySkin, none, p), true);
  assert.equal(catalogSkinUnlocked(catalogSkinById('secret-city'), none, p), false);
  p = markSecret(p, 'city', pack.secrets[0].id);
  assert.equal(catalogSkinUnlocked(catalogSkinById('secret-city'), none, p), true);
  assert.match(catalogSkinLabel(citySkin), /All sparks/);
  assert.match(catalogSkinLabel(catalogSkinById('secret-living')), /Secret/);
  const store = memStore();
  saveCatalogSkinId('spark-city', store);
  assert.equal(loadCatalogSkinId(store), 'spark-city');
  assert.equal(store.getItem(SKIN_KEY), 'spark-city');
  assert.equal(resolveCatalogSkin('spark-city', none, empty).id, 'stock');
  assert.equal(resolveCatalogSkin('spark-city', none, p).id, 'spark-city');
  assert.equal(unlockedCatalogSkins(none, empty).map((s) => s.id).includes('spark-city'), false);
  for (const id of SECRET_MAP_IDS) {
    const rewards = rewardsForMap(id);
    assert.equal(rewards.length, 2, id);
    assert.ok(rewards.some((s) => s.unlock.type === 'sparks'));
    assert.ok(rewards.some((s) => s.unlock.type === 'secret'));
    for (const s of rewards) {
      assert.ok(s.vibe);
      assert.ok(s.led != null && s.trail != null);
    }
  }
  const banned = ['webfpv', 'web fpv', 'carbon stealth', 'phantom'];
  for (const s of SECRET_SKINS) {
    const blob = (s.name + ' ' + s.vibe).toLowerCase();
    for (const b of banned) assert.equal(blob.includes(b), false, s.id);
  }
});

test('sparks stay small faceted gems and never fill the screen up close', () => {
  assert.ok(SPARK_R < 0.28);
  assert.ok(SPARK_MAX_SCREEN <= 0.06);
  assert.ok(sparkVisualScale(0.3, 2) < 0.22);
  assert.ok(sparkVisualScale(0.3, 2) < sparkVisualScale(4, 0));
  assert.ok(sparkVisualScale(3.7, 0.2) * SPARK_R / 3.7 <= SPARK_MAX_SCREEN + 0.002);
  assert.ok(sparkVisualScale(12, 0) < 1.05);
  assert.match(src, /OctahedronGeometry\(SPARK_R, 2\)/);
  assert.match(src, /sparkVisualScale\(/);
  const api = createSecrets(THREE, {
    load: () => emptySecrets(),
    save() {},
    toast() {},
    muted: () => true,
  });
  api.attach('backyard', true);
  api.tick(0, { x: 5, y: 1.47, z: 6.5 }, 0.016);
  let mesh = null;
  api.group.traverse((o) => { if (o.isInstancedMesh && !mesh) mesh = o; });
  assert.ok(mesh, 'spark instanced mesh');
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  mesh.getMatrixAt(0, m);
  m.decompose(pos, quat, scl);
  assert.ok(scl.x < 1.15, 'whoop spark scale ' + scl.x);
  api.detach();
});

test('runtime uses instanced meshes, no tick allocations, try/catch guard', () => {
  assert.match(src, /InstancedMesh/);
  assert.match(src, /never abort the FPV render loop/);
  assert.match(src, /try \{/);
  assert.match(src, /instanceMatrix/);
  assert.equal(src.includes('WebFPV'), false);
  assert.equal(src.includes('webfpv'), false);
  const tickSrc = src.slice(src.indexOf('function tick('), src.indexOf('function progressNow'));
  assert.equal(/\bnew\s+/.test(tickSrc), false, 'tick must not allocate');
  const api = createSecrets(THREE, {
    load: () => emptySecrets(),
    save() {},
    toast() {},
    muted: () => true,
  });
  assert.equal(api.attach('city', true), true);
  assert.equal(api.active, true);
  assert.ok(api.sparkCount >= 10);
  assert.equal(api.group.visible, true);
  const pos = { x: 0, y: 3, z: 300 };
  api.tick(1000, pos, 0.016);
  api.tick(1016, pos, 0.016);
  api.setQuality('low');
  api.attach('living', true);
  api.attach('city', false);
  assert.equal(api.active, false);
  api.detach();
});

test('sim.html wires secrets on a small hook surface', () => {
  assert.match(simSrc, /sim-secrets\.js/);
  assert.match(simSrc, /createSecrets|secrets\.tick|SECRETS_KEY/);
  assert.match(simSrc, /menuSparks|sparksLabel|Sparks /);
  assert.match(simSrc, /catalogSkin|SECRET_SKINS|allSkins/);
  assert.equal((simSrc.match(/from "\.\/sim-secrets\.js/g) || []).length, 1);
});
