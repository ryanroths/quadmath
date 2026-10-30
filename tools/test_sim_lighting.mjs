// Scene lighting resolver: one pure function decides IBL / background / fog
// colour for every map x quality x HDRI-ready state, one writer applies it.
// node --test tools/test_sim_lighting.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import {
  resolveSceneLighting, applySceneLighting, updateSceneLighting, CITY_SKY_HEX,
} from '../sim-lighting.js';
import { MAP_VIBE_IDS, resolveMapLighting, applyVibeLighting, vibeFor } from '../sim-art.js';
import { LOOK } from '../sim-look.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DAWN = { name: 'dawn' };
const DAWN_2K = { name: 'dawn' };
const YARD = { name: 'yard' };
const LOOK_ENV = { name: 'look' };
const QUALITY_HDRI = { low: '1k', med: '1k', high: '2k' };

// Inputs as the resolver sees them once sim-looks applyLighting (the dawn,
// yard and look HDRIs) and applyVibeLighting (map, look flag, looks) have both
// patched. envReady false = nothing loaded.
function inputsFor(mapId, quality, envReady) {
  const m = resolveMapLighting(mapId);
  // Quality only picks the dawn HDRI resolution (looks: 2k on High, else 1k).
  const dawn = envReady ? (QUALITY_HDRI[quality] === '2k' ? DAWN_2K : DAWN) : null;
  return {
    mapId: m.mapId,
    look: m.look,
    citySky: m.citySky,
    skyCity: m.citySky,
    sky: m.sky === 'gradient' ? 'gradient' : 'hdri',
    fogColor: m.lighting.fogColor,
    exposure: m.lighting.exposure,
    looks: m.looks,
    envs: { dawn, yard: envReady ? YARD : null, look: envReady ? LOOK_ENV : null },
  };
}

test('resolver covers every map x quality x envReady', () => {
  for (const mapId of MAP_VIBE_IDS) {
    const m = resolveMapLighting(mapId);
    for (const q of ['low', 'med', 'high']) {
      for (const ready of [false, true]) {
        const tag = `${mapId}/${q}/${ready ? 'env' : 'noenv'}`;
        const r = resolveSceneLighting(inputsFor(mapId, q, ready));
        assert.equal(r.fogColor, m.lighting.fogColor, tag + ' fog');
        assert.equal(r.exposure, m.lighting.exposure, tag + ' exposure');
        if (mapId === 'city') {
          // City never takes the dawn HDRI, loaded or not.
          assert.equal(r.environment, null, tag);
          assert.equal(r.background, null, tag);
          assert.equal(r.bgHex, CITY_SKY_HEX, tag);
          assert.equal(r.environmentIntensity, 0, tag);
          assert.equal(r.envReady, true, tag);
          continue;
        }
        if (m.look) {
          // A map on the look takes the look's HDRI as its fill, never the
          // dawn or yard one; the background stays a colour.
          assert.equal(r.want, 'look', tag);
          assert.equal(r.envReady, ready, tag);
          assert.equal(r.environment, ready ? LOOK_ENV : null, tag);
          assert.equal(r.environmentIntensity, m.looks.env, tag + ' envI');
          assert.equal(r.background, null, tag);
          assert.equal(r.bgHex, m.lighting.fogColor, tag);
          continue;
        }
        const want = mapId === 'backyard' ? YARD : DAWN;
        assert.equal(r.want, mapId === 'backyard' ? 'yard' : 'dawn', tag);
        assert.equal(r.envReady, ready, tag);
        assert.equal(r.environmentIntensity, m.looks.env, tag + ' envI');
        assert.equal(r.backgroundIntensity, m.looks.bg, tag + ' bgI');
        if (ready) {
          assert.equal(r.environment && r.environment.name, want.name, tag + ' env');
          if (mapId !== 'backyard') assert.equal(r.environment, q === 'high' ? DAWN_2K : DAWN, tag + ' level');
          assert.equal(r.background, r.environment, tag + ' bg = env');
          assert.equal(r.bgHex, null, tag);
          assert.equal(r.rotationY, mapId === 'backyard' ? 0.85 : 3.55, tag);
        } else {
          // Not loaded: fog-colour sky, never another map's HDRI.
          assert.equal(r.environment, null, tag);
          assert.equal(r.background, null, tag);
          assert.equal(r.bgHex, m.lighting.fogColor, tag);
        }
      }
    }
  }
});

test('backyard never shows the dawn HDRI; indoor never shows the yard HDRI', () => {
  const yardDawnOnly = Object.assign(inputsFor('backyard', 'med', false), { envs: { dawn: DAWN, yard: null } });
  const r = resolveSceneLighting(yardDawnOnly);
  assert.equal(r.environment, null);
  assert.equal(r.bgHex, resolveMapLighting('backyard').lighting.fogColor);
  const garageYardOnly = Object.assign(inputsFor('garage', 'med', false), { envs: { dawn: null, yard: YARD } });
  assert.equal(resolveSceneLighting(garageYardOnly).environment, null);
});

test('the look loads one HDRI, its own, and the Rig is on the look', () => {
  assert.equal(vibeFor('rig').look, true);
  assert.equal(resolveMapLighting('rig').look, true);
  for (const mapId of MAP_VIBE_IDS) if (mapId !== 'rig') assert.ok(!resolveMapLighting(mapId).look, mapId);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /const HDRI_LOOK = LOOK\.lighting\.hdri;/);
  assert.match(looks, /envLook = await loadHdr\(HDRI_LOOK\)/);
  assert.match(LOOK.lighting.hdri, /^assets\/sim-looks\/hdri\/[a-z0-9_]+_512\.hdr$/);
});

test('applyVibeLighting gives the Rig the look HDRI at its fill, in either order, across map switches', async () => {
  const v = vibeFor('rig');
  const want = LOOK.lighting.env;
  // Looks and the vibe must share one sim-lighting instance (one lighting
  // state per scene): the same ?v= stamp, as the page loads them.
  const stampOf = (f) => (readFileSync(join(root, f), 'utf8').match(/\.\/sim-lighting\.js\?v=([0-9a-f]+)/) || [])[1];
  assert.ok(stampOf('sim-art-city.js'));
  assert.equal(stampOf('sim-looks.js'), stampOf('sim-art-city.js'));
  const { updateSceneLighting } = await import('../sim-lighting.js?v=' + stampOf('sim-art-city.js'));
  // Production's looks patch: the map, its look flag and the HDRIs (sim-looks.js applyLighting).
  const looksPatch = (mapId) => ({ mapId, look: !!vibeFor(mapId).look, sky: 'hdri', envs: { dawn: DAWN, yard: null, look: LOOK_ENV } });
  const mk = () => { const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0, 0); return scene; };
  const renderer = { toneMappingExposure: 1 };
  for (const order of ['looks-first', 'vibe-first']) {
    const scene = mk();
    const vibe = () => applyVibeLighting({ THREE, scene, renderer }, v);
    const looks = () => updateSceneLighting(scene, looksPatch('rig'), { renderer, Color: THREE.Color });
    if (order === 'looks-first') { looks(); vibe(); } else { vibe(); looks(); }
    assert.equal(scene.environment, LOOK_ENV, order);
    assert.ok(Math.abs(scene.environmentIntensity - want) < 1e-9, order + ' ' + scene.environmentIntensity);
    assert.equal(renderer.toneMappingExposure, LOOK.lighting.exposure, order + ' exposure');
  }
  // Rig -> garage -> Rig: the garage gets the dawn HDRI, the Rig the look's again.
  const scene = mk();
  applyVibeLighting({ THREE, scene, renderer }, v);
  updateSceneLighting(scene, looksPatch('rig'), { renderer, Color: THREE.Color });
  applyVibeLighting({ THREE, scene, renderer }, vibeFor('garage'));
  assert.equal(scene.environment, DAWN);
  applyVibeLighting({ THREE, scene, renderer }, v);
  assert.equal(scene.environment, LOOK_ENV);
});

test('a map on the look takes only the look HDRI, and no other map takes it', () => {
  const rigDawnOnly = Object.assign(inputsFor('rig', 'high', false), { envs: { dawn: DAWN, yard: YARD, look: null } });
  const r = resolveSceneLighting(rigDawnOnly);
  assert.equal(r.environment, null);
  assert.equal(r.envReady, false);
  // A gradient sky mode does not swap it either.
  const g = resolveSceneLighting(Object.assign(inputsFor('rig', 'med', true), { sky: 'gradient' }));
  assert.equal(g.environment, LOOK_ENV);
  assert.equal(g.environmentIntensity, resolveMapLighting('rig').looks.env);
  for (const mapId of MAP_VIBE_IDS) {
    if (resolveMapLighting(mapId).look) continue;
    assert.notEqual(resolveSceneLighting(inputsFor(mapId, 'med', true)).environment, LOOK_ENV, mapId);
  }
});

test('city sky wins regardless of input order (sky dome flag or map flag)', () => {
  const base = inputsFor('city', 'high', true);
  for (const over of [{ citySky: true, skyCity: false }, { citySky: false, skyCity: true }, { sky: null }]) {
    const r = resolveSceneLighting(Object.assign({}, base, over));
    assert.equal(r.environment, null, JSON.stringify(over));
    assert.equal(r.bgHex, CITY_SKY_HEX, JSON.stringify(over));
  }
  // Non-city gradient keeps IBL and a fog-colour sky.
  const g = resolveSceneLighting(Object.assign(inputsFor('gym', 'med', true), { sky: 'gradient' }));
  assert.equal(g.environment, DAWN);
  assert.equal(g.bgHex, resolveMapLighting('gym').lighting.fogColor);
  assert.equal(g.environmentIntensity, 0.18);
});

test('resolver is pure and deterministic', () => {
  const inp = inputsFor('garage', 'med', true);
  const snap = JSON.stringify(inp);
  assert.deepEqual(resolveSceneLighting(inp), resolveSceneLighting(inp));
  assert.equal(JSON.stringify(inp), snap);
  const empty = resolveSceneLighting();
  assert.equal(empty.environment, null);
  assert.equal(empty.bgHex, null);
});

test('apply: background is its own Color, never fog.color', () => {
  for (const mapId of MAP_VIBE_IDS) {
    for (const ready of [false, true]) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x000000, 0.001);
      // Seed the legacy shared-reference bug: apply must break it.
      scene.background = scene.fog.color;
      const r = resolveSceneLighting(inputsFor(mapId, 'med', ready));
      applySceneLighting(scene, r, { Color: THREE.Color });
      assert.notEqual(scene.background, scene.fog.color, mapId);
      assert.equal(scene.fog.color.getHex(), resolveMapLighting(mapId).lighting.fogColor, mapId);
      if (r.bgHex != null) {
        assert.ok(scene.background.isColor, mapId);
        const before = scene.background.getHex();
        scene.fog.color.setHex(0x123456);
        assert.equal(scene.background.getHex(), before, mapId + ' fog write leaked into sky');
      } else {
        assert.equal(scene.background, r.environment, mapId);
      }
      assert.equal(scene.environment, r.environment, mapId);
      assert.equal(scene.environmentIntensity, r.environmentIntensity, mapId);
    }
  }
  // No Color class handed in: falls back to a clone, still not shared.
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x222222, 0.001);
  applySceneLighting(scene, resolveSceneLighting(inputsFor('gym', 'low', false)));
  assert.notEqual(scene.background, scene.fog.color);
});

test('update: late HDRI or late vibe lands on the same final state', () => {
  const finalFor = (steps) => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.001);
    const renderer = { toneMappingExposure: 1 };
    for (const p of steps) updateSceneLighting(scene, p, { renderer, Color: THREE.Color });
    return {
      env: scene.environment && scene.environment.name,
      bg: scene.background && (scene.background.isColor ? scene.background.getHex() : scene.background.name),
      envI: scene.environmentIntensity, fog: scene.fog.color.getHex(), exp: renderer.toneMappingExposure,
    };
  };
  for (const mapId of MAP_VIBE_IDS) {
    const full = inputsFor(mapId, 'high', true);
    // As in production: looks sends the HDRIs, the vibe the map and its look.
    const { envs, sky, skyCity, ...rest } = full;
    const vibe = rest;
    const looksPart = { sky, skyCity, envs };
    const a = finalFor([vibe, looksPart]);
    const b = finalFor([looksPart, vibe]);
    const c = finalFor([{ envs: { dawn: null, yard: null, look: null } }, vibe, { sky, skyCity }, { envs }]);
    assert.deepEqual(a, b, mapId);
    assert.deepEqual(a, c, mapId);
  }
  // Map switch City -> garage -> City restores the night sky and drops IBL.
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.001);
  updateSceneLighting(scene, inputsFor('city', 'med', true), { Color: THREE.Color });
  updateSceneLighting(scene, inputsFor('garage', 'med', true));
  assert.equal(scene.environment, DAWN);
  updateSceneLighting(scene, inputsFor('city', 'med', true));
  assert.equal(scene.environment, null);
  assert.equal(scene.background.getHex(), CITY_SKY_HEX);
});

test('sim-lighting is the only writer of scene IBL / background / fog colour', () => {
  const files = ['sim-looks.js', 'sim-art-city.js', 'sim-art-backyard.js', 'sim-art.js', 'sim.html'];
  const writer = /scene\.(environment|background|environmentIntensity|backgroundIntensity|backgroundBlurriness)\s*=(?!=)|scene\.fog\.color\.set|toneMappingExposure\s*=(?!=)/;
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    const hits = src.split('\n').filter((l) => writer.test(l));
    // sim.html sets the renderer's initial exposure before any scene exists.
    const allowed = f === 'sim.html' ? hits.filter((l) => !/^renderer\.toneMappingExposure=LIGHTING\.exposure;$/.test(l.trim())) : hits;
    assert.deepEqual(allowed, [], f);
  }
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /updateSceneLighting\(scene/);
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /updateSceneLighting\(scene/);
});
