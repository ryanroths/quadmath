// Art-direction tests: vibe table, bloom budget, no third-party city meshes.
// node --test tools/test_sim_art.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VIBES, MAP_VIBE_IDS, vibeFor, qualityWantsBloom, qualityBudget,
  hexNum, vibeTable, mentionsBannedAssets, CITY_VIBE_ID,
  qualityWantsReflections, qualityWantsParticles,
  propClearOfCourse, planCityProps, SIGN_WORDS, GATE_STYLES,
  signsAreOriginal, BRAND_BLOCKLIST,
} from '../sim-art.js';
import { MAPS, FROZEN_CITY, cityTrackJson } from '../sim-tracks.js';
import { MAP_IDS, MAP_LOOKS } from '../sim-maps.js';
import { DAILY_MAPS } from '../sim-retention.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HEX = /^#[0-9a-fA-F]{6}$/;

test('every catalog map and daily host has a vibe with a full palette', () => {
  const mapIds = MAPS.map((m) => m.id);
  assert.deepEqual(mapIds.slice().sort(), MAP_VIBE_IDS.slice().sort());
  for (const id of MAP_IDS.concat(['city'])) {
    const v = vibeFor(id);
    assert.equal(v.id, id);
    assert.ok(v.name && v.time && v.sky);
    for (const key of ['void', 'zenith', 'horizon', 'dusk', 'street', 'facade', 'neonA', 'neonB', 'gateA', 'gateB']) {
      assert.match(v.palette[key], HEX, id + ' ' + key);
    }
    assert.ok(v.lighting.fogDensity > 0);
    assert.ok(Array.isArray(v.props) && v.props.length >= 2);
    assert.ok(v.gates && v.gates.style);
  }
  for (const m of DAILY_MAPS) {
    assert.ok(VIBES[m.id], 'daily host ' + m.id);
    assert.equal(VIBES[m.id].implemented, false);
  }
});

test('city is the Phase 1 prototype and keeps brand gate colors', () => {
  assert.equal(CITY_VIBE_ID, 'city');
  const v = VIBES.city;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Neon Current');
  assert.equal(v.sky, 'gradient');
  assert.equal(v.time, 'night');
  assert.equal(v.gates.keepBrand, true);
  assert.equal(v.palette.gateA.toLowerCase(), '#ff4d1a');
  assert.equal(v.palette.gateB.toLowerCase(), '#3ddc97');
  assert.ok(MAP_LOOKS.city.sun < 0.5, 'night sun is dim');
  assert.ok(MAP_LOOKS.city.fog > 0.0005);
});

test('quality Low kills bloom; Med/High keep it', () => {
  assert.equal(qualityWantsBloom('low'), false);
  assert.equal(qualityWantsBloom('med'), true);
  assert.equal(qualityWantsBloom('high'), true);
  assert.equal(qualityWantsBloom('auto'), false);
  assert.equal(qualityWantsReflections('low'), false);
  assert.equal(qualityWantsParticles('low'), false);
  assert.equal(qualityWantsReflections('high'), true);
  const lo = qualityBudget('low');
  const hi = qualityBudget('high');
  assert.ok(lo.skyline < hi.skyline);
  assert.equal(lo.lights, 0);
  assert.ok(hi.lights <= 6);
  assert.equal(lo.reflect, false);
  assert.equal(hi.reflect, true);
  assert.equal(lo.rain, 0);
  assert.ok(hi.rain > 0);
});

test('hexNum and vibeTable are stable helpers', () => {
  assert.equal(hexNum('#ff2bd6'), 0xff2bd6);
  assert.equal(hexNum(0x88a0ff), 0x88a0ff);
  const table = vibeTable();
  assert.equal(table.length, 9);
  assert.equal(table.filter((r) => r.implemented).length, 1);
});

test('Phase 1 city art module does not ship GLB or WebFPV paths', () => {
  const art = readFileSync(join(root, 'sim-art.js'), 'utf8');
  assert.equal(art.includes('GLB-format'), false);
  assert.equal(art.includes('loadAsync'), false);
  assert.equal(art.includes('Sketchfab'), false);
  assert.equal(mentionsBannedAssets('assets/Models/GLB-format/tree-large.glb'), true);
  assert.equal(mentionsBannedAssets('buildCityDressing()'), false);
});

test('sim.html skips the stock city kit and stamps sim-art', () => {
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /from "\.\/sim-art\.js\?v=[0-9a-f]{12}"/);
  assert.match(sim, /restyleCity|buildCityDressing/);
  assert.match(sim, /tickCityArt|pulseCityGate/);
  assert.match(sim, /cbRain|quadmathSimRain|loadRain/);
  assert.match(sim, /skipStockCity|procedural neon city|Neon Current/);
  assert.equal(sim.includes('content/guides/'), false);
  assert.match(sim, /City is original procedural art|Neon Current/);
});

test('looks Low preset disables bloom', () => {
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /bloom:\s*false/);
  assert.match(looks, /bloomPass\.enabled/);
  assert.match(looks, /artLocked|setSkyMode/);
  assert.match(looks, /grade|setGrade/);
});

test('frozen City Loop gates are untouched', () => {
  const loop = cityTrackJson(0);
  assert.equal(loop.id, 'city-loop');
  assert.equal(loop.gates.length, 10);
  assert.equal(loop.gates[0].x, -140);
  assert.equal(loop.gates[0].z, -120);
  assert.equal(FROZEN_CITY[0][5].x, 0);
  assert.equal(FROZEN_CITY[0][5].z, -90);
  const file = JSON.parse(readFileSync(join(root, 'tracks/city-loop.json'), 'utf8'));
  assert.equal(file.gates[3].x, -70);
  assert.equal(file.gates[3].y, 24);
});

test('invented shop signs are not real brands', () => {
  assert.equal(SIGN_WORDS.length, 16);
  assert.equal(signsAreOriginal(SIGN_WORDS), true);
  assert.equal(signsAreOriginal(['NIKE']), false);
  for (const w of SIGN_WORDS) {
    assert.equal(BRAND_BLOCKLIST.some((b) => w.toLowerCase().includes(b)), false);
  }
});

test('each city gate has a unique neon frame style', () => {
  assert.equal(GATE_STYLES.length, 10);
  assert.equal(new Set(GATE_STYLES).size, 10);
});

test('planned street props stay off City Loop and Zigzag race lines', () => {
  const gates = FROZEN_CITY[0].concat(FROZEN_CITY[1]);
  assert.equal(propClearOfCourse(-140, -120, 7, FROZEN_CITY[0]), false);
  assert.equal(propClearOfCourse(0, -90, 6, FROZEN_CITY[0]), false);
  assert.ok(propClearOfCourse(16, -200, 0.5, FROZEN_CITY[0]));
  for (const q of ['low', 'med', 'high']) {
    const plan = planCityProps(gates, q);
    const groups = ['cars', 'vending', 'bollards', 'traffic', 'crates', 'trash', 'lanterns', 'chain'];
    let n = 0;
    for (const key of groups) {
      assert.ok(Array.isArray(plan[key]), key);
      for (const p of plan[key]) {
        n++;
        assert.equal(
          propClearOfCourse(p.x, p.z, p.y, gates, { gatePad: 3.4, corridor: 4.6 }),
          true,
          key + ' ' + p.x + ',' + p.z,
        );
      }
    }
    assert.ok(n > 8, q + ' planned props');
  }
});

test('city density module stays original (no GLB / WebFPV)', () => {
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.equal(city.includes('GLB-format'), false);
  assert.equal(city.includes('loadAsync'), false);
  assert.equal(city.includes('Sketchfab'), false);
  assert.equal(city.includes('WebFPV'), false);
  assert.match(city, /window shader|uWinOn|cityArtVisuals/);
});

test('art direction doc lists every map', () => {
  const doc = existsSync(join(root, 'docs/sim-art-direction.md'))
    ? readFileSync(join(root, 'docs/sim-art-direction.md'), 'utf8')
    : '';
  assert.ok(doc.includes('# QuadMath sim art direction'));
  for (const id of MAP_VIBE_IDS) {
    assert.ok(doc.toLowerCase().includes(VIBES[id].name.toLowerCase()), VIBES[id].name);
  }
  assert.ok(doc.includes('costoWRLD'));
  assert.ok(doc.includes('Kenney'));
  assert.ok(doc.includes('60 fps'));
});
