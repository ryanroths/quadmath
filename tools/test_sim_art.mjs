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
  propClearOfCourse, planCityProps, planPortalBlocks, SIGN_WORDS, GATE_STYLES,
  signsAreOriginal, BRAND_BLOCKLIST,
  paintWorldLabel, WORLD_LABEL, restyleCity, buildNeonCity, artStats, tickCityArt,
  CAR_TYPES, carTypeForSeed, carYawFromDir, carHeading, makeCarGeo,
  restyleDiveTubes, LIVING_VIBE_ID, hideStockLivingMeshes, buildClayParlor,
  restyleLiving, tickLivingArt, livingBudget, livingWantsGlow,
  GARAGE_VIBE_ID, hideStockGarageMeshes, buildVoltStall,
  restyleGarage, tickGarageArt, garageBudget, garageWantsGlow,
  WAREHOUSE_VIBE_ID, hideStockWarehouseMeshes, buildIonNave,
  restyleWarehouse, tickWarehouseArt, warehouseBudget, warehouseWantsGlow,
  GYM_VIBE_ID, hideStockGymMeshes, buildAmberCourt,
  restyleGym, tickGymArt, gymBudget, gymWantsGlow,
  OFFICE_VIBE_ID, hideStockOfficeMeshes, buildPaperSun,
  restyleOffice, tickOfficeArt, officeBudget, officeWantsGlow,
  TRAINER_VIBE_ID, hideStockTrainerMeshes, buildLicoriceGrid,
  restyleTrainer, tickTrainerArt, trainerBudget, trainerWantsGlow,
  BACKYARD_VIBE_ID, hideStockBackyardMeshes, buildJadeLot,
  restyleBackyard, tickBackyardArt, backyardBudget, backyardWantsGlow,
  ROOM_VIBE_ID, hideStockRoomMeshes, buildPocketStage,
  restyleRoom, tickRoomArt, roomBudget, roomWantsGlow,
} from '../sim-art.js';
import { MAPS, FROZEN_CITY, cityTrackJson, freestyleTrack, freestyleIdFor } from '../sim-tracks.js';
import * as THREE from '../vendor/three.module.min.js';
import { MAP_IDS, MAP_LOOKS, buildMap } from '../sim-maps.js';
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
    if (m.id === 'living' || m.id === 'garage' || m.id === 'warehouse' || m.id === 'gym' || m.id === 'office' || m.id === 'trainer') assert.equal(VIBES[m.id].implemented, true);
    else assert.equal(VIBES[m.id].implemented, false);
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
  assert.equal(table.filter((r) => r.implemented).length, 9);
});

test('Phase 1 city art module does not ship GLB or WebFPV paths', () => {
  const art = readFileSync(join(root, 'sim-art.js'), 'utf8');
  assert.equal(art.includes('GLB-format'), false);
  assert.equal(art.includes('loadAsync'), false);
  assert.equal(art.includes('Sketchfab'), false);
  assert.match(art, /sim-art-living\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-garage\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-warehouse\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-gym\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-office\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-trainer\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-backyard\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-room\.js\?v=[0-9a-f]{12}/);
  assert.equal(mentionsBannedAssets('assets/Models/GLB-format/tree-large.glb'), true);
  assert.equal(mentionsBannedAssets('buildCityDressing()'), false);
});

test('sim.html skips the stock city kit and stamps sim-art', () => {
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /from "\.\/sim-art\.js\?v=[0-9a-f]{12}"/);
  assert.match(sim, /restyleCity|buildCityDressing/);
  assert.match(sim, /tickCityArt|pulseCityGate/);
  assert.match(sim, /applyLivingArt|restyleLiving/);
  assert.match(sim, /tickLivingArt|decorateLivingGate/);
  assert.match(sim, /applyGarageArt|restyleGarage/);
  assert.match(sim, /tickGarageArt|decorateGarageGate/);
  assert.match(sim, /applyWarehouseArt|restyleWarehouse/);
  assert.match(sim, /tickWarehouseArt|decorateWarehouseGate/);
  assert.match(sim, /applyGymArt|restyleGym/);
  assert.match(sim, /tickGymArt|decorateGymGate/);
  assert.match(sim, /applyOfficeArt|restyleOffice/);
  assert.match(sim, /tickOfficeArt|decorateOfficeGate/);
  assert.match(sim, /applyTrainerArt|restyleTrainer/);
  assert.match(sim, /tickTrainerArt|decorateTrainerGate/);
  assert.match(sim, /applyBackyardArt|restyleBackyard/);
  assert.match(sim, /tickBackyardArt|decorateBackyardGate/);
  assert.match(sim, /applyRoomArt|restyleRoom/);
  assert.match(sim, /tickRoomArt|decorateRoomGate/);
  assert.match(sim, /cbRain|quadmathSimRain|loadRain/);
  assert.match(sim, /skipStockCity|procedural neon city|Neon Current/);
  assert.equal(sim.includes('content/guides/'), false);
  assert.match(sim, /City is original procedural art|Neon Current/);
});

test('sim.html imports every map restyle/tick/decorate it calls', () => {
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  const m = sim.match(/import \{([\s\S]*?)\} from "\.\/sim-art\.js\?v=[0-9a-f]{12}"/);
  assert.ok(m, 'sim-art import');
  const imported = new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
  const maps = ['Living', 'Garage', 'Warehouse', 'Gym', 'Office', 'Trainer', 'Backyard', 'Room'];
  for (const name of maps) {
    for (const fn of ['restyle' + name, 'decorate' + name + 'Gate', 'pulse' + name + 'Gate', 'tick' + name + 'Art']) {
      assert.ok(imported.has(fn), 'import ' + fn);
      assert.match(sim, new RegExp(fn + '\\('), 'call ' + fn);
    }
  }
  for (const fn of ['restyleCity', 'tickCityArt', 'decorateVibeGate', 'applyVibeLighting']) {
    assert.ok(imported.has(fn), 'import ' + fn);
  }
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
    const groups = ['cars', 'vending', 'bollards', 'traffic', 'crates', 'trash', 'lanterns', 'chain', 'benches', 'bins', 'kiosks', 'awnings', 'vents', 'lowSigns'];
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
    const portal = planPortalBlocks(gates, q);
    assert.ok(portal.length >= 6, q + ' portal blocks');
    for (const b of portal) {
      assert.ok(Math.hypot(b.x - 350, b.z + 350) > 32, 'portal keep-out');
      assert.equal(
        propClearOfCourse(b.x, b.z, b.y, gates, { gatePad: 8, corridor: 6.0, yRange: 14 }),
        true,
        'portal ' + b.x + ',' + b.z,
      );
    }
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

test('city finish pass uses a world-Y sky, neon leftovers, and fake wet road', () => {
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /cityWorldSky/);
  assert.match(city, /uMoonDir/);
  assert.match(city, /vWorld/);
  assert.equal(city.includes('PlaneGeometry(900, 180)'), false);
  assert.equal(city.includes("Reflector.js"), false);
  assert.match(city, /makeWetRoadMaterial/);
  assert.match(city, /restyleLandmarks/);
  assert.match(city, /makeBenchGeo|benches/);
  assert.match(city, /planPortalBlocks/);
  assert.equal(city.includes('PlaneGeometry(4.5, 28)'), false);
  assert.match(city, /cityPuddles|puddleMap/);
  assert.match(city, /0x3f7a34/);
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /0x120816|0x1a1428|towerMap/);
  assert.match(sim, /BoxGeometry\(len,br/);
  assert.match(sim, /restyleLandmarks/);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /whoopStreet/);
  assert.match(looks, /whoopMid/);
  assert.match(looks, /whoopPortal/);
  assert.match(looks, /citySky/);
});

test('world labels punch out the canvas backdrop', () => {
  const calls = [];
  const ctx = {
    clearRect: (...a) => calls.push(['clearRect', a]),
    fillRect: (...a) => calls.push(['fillRect', a]),
    strokeText: () => calls.push(['strokeText']),
    fillText: () => calls.push(['fillText']),
    save: () => {},
    restore: () => {},
  };
  paintWorldLabel(ctx, 'START');
  assert.ok(calls.some((c) => c[0] === 'clearRect'), 'clears to transparent');
  assert.equal(calls.some((c) => c[0] === 'fillRect'), false, 'no box fill');
  assert.ok(calls.some((c) => c[0] === 'strokeText'), 'outline for distance');
  assert.ok(WORLD_LABEL.alphaTest > 0);
  const art = readFileSync(join(root, 'sim-art.js'), 'utf8');
  assert.match(art, /toneMapped:\s*false/);
  assert.match(art, /depthWrite:\s*false/);
  assert.match(art, /generateMipmaps\s*=\s*false/);
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /makeWorldLabel/);
  assert.equal(sim.includes("strokeText('START'"), false);
  assert.equal(sim.includes("strokeText('PORTAL'"), false);
  assert.equal(sim.includes("strokeText('DIVE'"), false);
  const coach = readFileSync(join(root, 'sim-coach.js'), 'utf8');
  assert.match(coach, /makeWorldLabel/);
  const feel = readFileSync(join(root, 'sim-feel.js'), 'utf8');
  assert.match(feel, /makeWorldLabel/);
});

function installDomStub() {
  if (globalThis.document && globalThis.document.createElement) return;
  const grad = () => ({ addColorStop() {} });
  const ctx = new Proxy({
    canvas: { width: 64, height: 64 },
    measureText: () => ({ width: 8 }),
    createLinearGradient: grad,
    createRadialGradient: grad,
    getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4), width: 64, height: 64 }),
  }, {
    get(t, key) {
      if (key in t) return t[key];
      if (key === 'fillStyle' || key === 'strokeStyle' || key === 'font') return '';
      return typeof key === 'string' ? () => {} : undefined;
    },
    set() { return true; },
  });
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return { width: 64, height: 64, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
      }
      return { style: {}, classList: { add() {}, remove() {}, toggle() {} } };
    },
  };
  if (!globalThis.window) globalThis.window = globalThis;
}

function cityFrameLit(root) {
  let meshes = 0;
  let lit = 0;
  let maxChan = 0;
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.visible === false) return;
    meshes += 1;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const cols = [];
      if (m.color && m.color.isColor) cols.push(m.color);
      if (m.emissive && m.emissive.isColor) cols.push(m.emissive);
      for (const c of cols) {
        const hex = c.getHex();
        if (hex) lit += 1;
        maxChan = Math.max(maxChan, c.r, c.g, c.b);
      }
    }
  });
  return { meshes, lit, maxChan };
}

test('City freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.equal(/\bwinMat\b/.test(city), false, 'stale winMat identifier must stay gone');
  const gates = FROZEN_CITY[0].concat(FROZEN_CITY[1]);
  const free = freestyleTrack('city');
  assert.equal(free.id, freestyleIdFor('city'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const parent = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(40, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }),
    );
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.001);
    scene.background = new THREE.Color(0x000000);
    assert.doesNotThrow(() => buildNeonCity(THREE, parent, vibeFor('city'), q, gates));
    const built = parent.getObjectByName('cityArtVisuals');
    assert.ok(built, q + ' cityArtVisuals');
    parent.remove(built);
    const out = restyleCity(THREE, {
      vibe: vibeFor('city'),
      quality: q,
      proceduralGroup: parent,
      ground,
      skyMesh: sky,
      scene,
      gates,
    });
    assert.equal(out.error, undefined, q + ' restyleCity ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const stats = artStats(null, out.visuals);
    assert.ok(stats.instancedMeshes >= 8, q + ' instanced ' + stats.instancedMeshes);
    assert.ok(stats.callsEst >= 20, q + ' callsEst ' + stats.callsEst);
    const frame = cityFrameLit(out.visuals);
    assert.ok(frame.meshes >= 8, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 8, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickCityArt(out.visuals, 1000 + i * 16);
    }, q + ' tickCityArt');
  }
  const tickSrc = city.slice(city.indexOf('export function tickCityArt'), city.indexOf('export function restyleMesas'));
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickCityArt must not touch the THREE binding');
  assert.match(tickSrc, /cityCruise|cityDrone/);
  assert.match(tickSrc, /never abort the FPV render loop/);
});

test('city cars are typed, sit on the road, and face travel', () => {
  assert.deepEqual(CAR_TYPES, ['sedan', 'hatch', 'van', 'taxi']);
  nearPi(carYawFromDir(1, 0), 0);
  nearPi(carYawFromDir(0, 1), -Math.PI / 2);
  nearPi(carYawFromDir(-1, 0), Math.PI);
  nearPi(carYawFromDir(0, -1), Math.PI / 2);
  nearPi(carHeading({ x: 14.6, z: 8, ry: 0 }), Math.PI / 2);
  const types = new Set();
  for (const kind of CAR_TYPES) {
    types.add(kind);
    const geo = makeCarGeo(THREE, kind, vibeFor('city'));
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    assert.ok(Math.abs(bb.min.y) < 0.04, kind + ' wheel min y ' + bb.min.y);
    assert.ok(bb.max.x - bb.min.x > bb.max.z - bb.min.z, kind + ' longer in X (forward)');
    assert.ok(bb.max.y > 1.1, kind + ' has a cabin');
    assert.ok(geo.getAttribute('color'), kind + ' vertex colors');
    const pc = geo.getAttribute('position').count;
    assert.equal(pc % 3, 0, kind + ' non-indexed tris');
    assert.ok(pc >= 36 * 3, kind + ' enough faces ' + pc);
  }
  assert.equal(types.size, 4);
  assert.ok(CAR_TYPES.includes(carTypeForSeed(0.11)));
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /carYawFromDir/);
  assert.match(city, /vertexColors/);
  const whoopTypes = new Set(planCityProps(FROZEN_CITY[0].concat(FROZEN_CITY[1]), 'high').cars
    .filter((p) => Math.abs(p.x) < 22 && Math.abs(p.z) < 40)
    .map((p) => p.type)
    .filter(Boolean));
  assert.equal(whoopTypes.size, 4, 'whoop-street parked cars cover sedan/hatch/van/taxi');
});

function nearPi(a, b) {
  const d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  assert.ok(Math.abs(d) < 1e-9, 'yaw ' + a + ' vs ' + b);
}

test('City polish keeps Low draw calls near 174 and clears leftover shards', () => {
  installDomStub();
  const gates = FROZEN_CITY[0].concat(FROZEN_CITY[1]);
  const lo = artStats(null, buildNeonCity(THREE, new THREE.Group(), vibeFor('city'), 'low', gates));
  const med = artStats(null, buildNeonCity(THREE, new THREE.Group(), vibeFor('city'), 'med', gates));
  const hi = artStats(null, buildNeonCity(THREE, new THREE.Group(), vibeFor('city'), 'high', gates));
  assert.ok(lo.callsEst <= 48, 'Low city-art callsEst ' + lo.callsEst);
  assert.ok(lo.instancedMeshes <= 40, 'Low IM ' + lo.instancedMeshes);
  assert.ok(med.callsEst >= lo.callsEst, 'Med adds extras');
  assert.ok(hi.instanced >= med.instanced, 'High at least as dense');
  const plan = planCityProps(gates, 'high');
  for (const p of plan.crates || []) {
    assert.ok(Math.hypot(p.x - 350, p.z + 350) > 46, 'crate near portal ' + p.x + ',' + p.z);
    assert.ok(Math.abs(p.x) > 28 || p.z < -20 || p.z > 40, 'crate on whoop street');
  }
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /makePlusSignGeo|makeLowSignGeo/);
  assert.match(city, /addStreetDressing|addDiveHoops/);
  assert.match(city, /restyleDiveTubes/);
  assert.match(city, /makeFireEscapeGeo|makeBlimpGeo/);
  assert.match(city, /cityDive/);
  const scene = new THREE.Scene();
  const tube = new THREE.Mesh(
    new THREE.BoxGeometry(50, 8.4, 8.4),
    new THREE.MeshStandardMaterial({ color: 0x243040, emissive: 0x00f0ff }),
  );
  scene.add(tube);
  assert.equal(restyleDiveTubes(scene, vibeFor('city'), THREE) >= 1, true);
  assert.equal(!!tube.userData.cityDive, true);
});

test('Living Room Clay Parlor is implemented and keeps brand-free clay gates', () => {
  assert.equal(LIVING_VIBE_ID, 'living');
  const v = VIBES.living;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Clay Parlor');
  assert.equal(v.sky, 'none');
  assert.equal(v.time, 'overcast day');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'clay-ring');
  assert.equal(v.post.bloom, false);
  assert.equal(v.palette.facade.toLowerCase(), '#f4d6c6');
  assert.equal(v.lighting.fogColor, 0xf0e4d4);
  assert.equal(livingWantsGlow('low'), false);
  assert.equal(livingWantsGlow('med'), true);
  assert.ok(livingBudget('low').lanterns === 0);
  assert.ok(livingBudget('high').lanterns > 0);
  assert.equal(livingBudget('low').steam, false);
  assert.equal(livingBudget('med').steam, true);
});

test('Living freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const livingSrc = readFileSync(join(root, 'sim-art-living.js'), 'utf8');
  assert.equal(mentionsBannedAssets(livingSrc), false);
  assert.match(livingSrc, /never abort the FPV render loop/);
  const free = freestyleTrack('living');
  assert.equal(free.id, freestyleIdFor('living'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'living');
    assert.doesNotThrow(() => hideStockLivingMeshes(built.group));
    const out = restyleLiving(THREE, {
      vibe: vibeFor('living'),
      quality: q,
      group: built.group,
      floor: built.floor,
    });
    assert.equal(out.error, undefined, q + ' restyleLiving ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 8, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('livingArtVisuals');
    assert.ok(vis, q + ' livingArtVisuals');
    const extras = vis.getObjectByName('livingArtExtras');
    if (q === 'low') {
      assert.ok(!extras || extras.children.every((c) => !c.userData || !c.userData.livingLantern));
      assert.equal(livingBudget('low').glow, false);
    }
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 8, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 8, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickLivingArt(built.group, 1000 + i * 16);
    }, q + ' tickLivingArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildClayParlor(THREE, parent, vibeFor('living'), q, free.gates));
  }
  const tickSrc = livingSrc.slice(
    livingSrc.indexOf('export function tickLivingArt'),
    livingSrc.indexOf('export function restyleLiving(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickLivingArt must not touch the THREE binding');
  assert.match(tickSrc, /livingLamp|livingLantern|livingSteam/);
});

test('Garage Volt Stall is implemented with square neon gates', () => {
  assert.equal(GARAGE_VIBE_ID, 'garage');
  const v = VIBES.garage;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Volt Stall');
  assert.equal(v.sky, 'none');
  assert.equal(v.time, 'night');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'square-neon');
  assert.equal(v.post.bloom, true);
  assert.equal(v.palette.neonA.toLowerCase(), '#ffb347');
  assert.equal(v.lighting.fogColor, 0x14161c);
  assert.equal(garageWantsGlow('low'), false);
  assert.equal(garageWantsGlow('med'), true);
  assert.equal(garageBudget('low').tubes < garageBudget('high').tubes, true);
  assert.equal(garageBudget('low').glow, false);
  assert.equal(garageBudget('med').glow, true);
});

test('Garage freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const garageSrc = readFileSync(join(root, 'sim-art-garage.js'), 'utf8');
  assert.equal(mentionsBannedAssets(garageSrc), false);
  assert.match(garageSrc, /never abort the FPV render loop/);
  assert.match(garageSrc, /CapsuleGeometry|LatheGeometry|ExtrudeGeometry/);
  const free = freestyleTrack('garage');
  assert.equal(free.id, freestyleIdFor('garage'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'garage');
    assert.doesNotThrow(() => hideStockGarageMeshes(built.group));
    const out = restyleGarage(THREE, {
      vibe: vibeFor('garage'),
      quality: q,
      group: built.group,
      floor: built.floor,
    });
    assert.equal(out.error, undefined, q + ' restyleGarage ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 8, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('garageArtVisuals');
    assert.ok(vis, q + ' garageArtVisuals');
    if (q === 'low') assert.equal(garageBudget('low').glow, false);
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low garage callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 8, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 8, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickGarageArt(built.group, 1000 + i * 16);
    }, q + ' tickGarageArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildVoltStall(THREE, parent, vibeFor('garage'), q, free.gates));
  }
  const tickSrc = garageSrc.slice(
    garageSrc.indexOf('export function tickGarageArt'),
    garageSrc.indexOf('export function restyleGarage(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickGarageArt must not touch the THREE binding');
  assert.match(tickSrc, /garageTube|garageSpark/);
});

test('Warehouse Ion Nave is implemented with hex-frame gates', () => {
  assert.equal(WAREHOUSE_VIBE_ID, 'warehouse');
  const v = VIBES.warehouse;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Ion Nave');
  assert.equal(v.sky, 'none');
  assert.equal(v.time, 'windowless');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'hex-frame');
  assert.equal(v.post.bloom, true);
  assert.equal(v.palette.neonA.toLowerCase(), '#39ffb0');
  assert.equal(v.lighting.fogColor, 0x0b1218);
  assert.equal(warehouseWantsGlow('low'), false);
  assert.equal(warehouseWantsGlow('med'), true);
  assert.equal(warehouseBudget('low').cans < warehouseBudget('high').cans, true);
  assert.equal(warehouseBudget('low').glow, false);
  assert.equal(warehouseBudget('med').glow, true);
  assert.equal(warehouseBudget('low').orbs, 0);
});

test('Warehouse freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const warehouseSrc = readFileSync(join(root, 'sim-art-warehouse.js'), 'utf8');
  assert.equal(mentionsBannedAssets(warehouseSrc), false);
  assert.match(warehouseSrc, /never abort the FPV render loop/);
  assert.match(warehouseSrc, /CapsuleGeometry|LatheGeometry/);
  const free = freestyleTrack('warehouse');
  assert.equal(free.id, freestyleIdFor('warehouse'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'warehouse');
    assert.doesNotThrow(() => hideStockWarehouseMeshes(built.group));
    const out = restyleWarehouse(THREE, {
      vibe: vibeFor('warehouse'),
      quality: q,
      group: built.group,
      floor: built.floor,
    });
    assert.equal(out.error, undefined, q + ' restyleWarehouse ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 8, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('warehouseArtVisuals');
    assert.ok(vis, q + ' warehouseArtVisuals');
    if (q === 'low') {
      assert.equal(warehouseBudget('low').glow, false);
      let orbs = 0;
      vis.traverse((o) => { if (o.userData && o.userData.warehouseOrb) orbs += 1; });
      assert.equal(orbs, 0, 'low extras off');
    }
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 8, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 8, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickWarehouseArt(built.group, 1000 + i * 16);
    }, q + ' tickWarehouseArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildIonNave(THREE, parent, vibeFor('warehouse'), q, free.gates));
  }
  const tickSrc = warehouseSrc.slice(
    warehouseSrc.indexOf('export function tickWarehouseArt'),
    warehouseSrc.indexOf('export function restyleWarehouse(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickWarehouseArt must not touch the THREE binding');
  assert.match(tickSrc, /warehouseTube|warehouseOrb/);
});

test('Gym Amber Court is implemented with brass-wood gates', () => {
  assert.equal(GYM_VIBE_ID, 'gym');
  const v = VIBES.gym;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Amber Court');
  assert.equal(v.sky, 'none');
  assert.equal(v.time, 'golden hour');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'brass-wood');
  assert.equal(v.post.bloom, true);
  assert.equal(v.palette.neonA.toLowerCase(), '#f0b14b');
  assert.equal(v.lighting.fogColor, 0xc9a57a);
  assert.equal(gymWantsGlow('low'), false);
  assert.equal(gymWantsGlow('med'), true);
  assert.equal(gymBudget('low').windows < gymBudget('high').windows, true);
  assert.equal(gymBudget('low').glow, false);
  assert.equal(gymBudget('med').glow, true);
  assert.equal(gymBudget('low').dust, 0);
});

test('Gym freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const gymSrc = readFileSync(join(root, 'sim-art-gym.js'), 'utf8');
  assert.equal(mentionsBannedAssets(gymSrc), false);
  assert.match(gymSrc, /never abort the FPV render loop/);
  assert.match(gymSrc, /CapsuleGeometry|LatheGeometry|ExtrudeGeometry/);
  const free = freestyleTrack('gym');
  assert.equal(free.id, freestyleIdFor('gym'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'gym');
    assert.doesNotThrow(() => hideStockGymMeshes(built.group));
    const out = restyleGym(THREE, {
      vibe: vibeFor('gym'),
      quality: q,
      group: built.group,
      floor: built.floor,
    });
    assert.equal(out.error, undefined, q + ' restyleGym ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 8, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('gymArtVisuals');
    assert.ok(vis, q + ' gymArtVisuals');
    if (q === 'low') {
      assert.equal(gymBudget('low').glow, false);
      let dust = 0;
      vis.traverse((o) => { if (o.userData && o.userData.gymDust) dust += 1; });
      assert.equal(dust, 0, 'low extras off');
    }
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low gym callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 8, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 8, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickGymArt(built.group, 1000 + i * 16);
    }, q + ' tickGymArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildAmberCourt(THREE, parent, vibeFor('gym'), q, free.gates));
  }
  const tickSrc = gymSrc.slice(
    gymSrc.indexOf('export function tickGymArt'),
    gymSrc.indexOf('export function restyleGym(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickGymArt must not touch the THREE binding');
  assert.match(tickSrc, /gymRim|gymDust/);
});

test('Office Paper Sun is implemented with toon-hoop gates', () => {
  assert.equal(OFFICE_VIBE_ID, 'office');
  const v = VIBES.office;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Paper Sun');
  assert.equal(v.sky, 'none');
  assert.equal(v.time, 'morning');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'toon-hoop');
  assert.equal(v.post.bloom, false);
  assert.equal(v.palette.neonA.toLowerCase(), '#ff5c5c');
  assert.equal(v.lighting.fogColor, 0xfff4d2);
  assert.equal(officeWantsGlow('low'), false);
  assert.equal(officeWantsGlow('med'), true);
  assert.equal(officeBudget('low').plants < officeBudget('high').plants, true);
  assert.equal(officeBudget('low').glow, false);
  assert.equal(officeBudget('med').glow, true);
});

test('Office freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const officeSrc = readFileSync(join(root, 'sim-art-office.js'), 'utf8');
  assert.equal(mentionsBannedAssets(officeSrc), false);
  assert.match(officeSrc, /never abort the FPV render loop/);
  assert.match(officeSrc, /CapsuleGeometry|LatheGeometry|ExtrudeGeometry/);
  const free = freestyleTrack('office');
  assert.equal(free.id, freestyleIdFor('office'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'office');
    assert.doesNotThrow(() => hideStockOfficeMeshes(built.group));
    const out = restyleOffice(THREE, {
      vibe: vibeFor('office'),
      quality: q,
      group: built.group,
      floor: built.floor,
    });
    assert.equal(out.error, undefined, q + ' restyleOffice ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 8, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('officeArtVisuals');
    assert.ok(vis, q + ' officeArtVisuals');
    if (q === 'low') assert.equal(officeBudget('low').glow, false);
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low office callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 8, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 8, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickOfficeArt(built.group, 1000 + i * 16);
    }, q + ' tickOfficeArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildPaperSun(THREE, parent, vibeFor('office'), q, free.gates));
  }
  const tickSrc = officeSrc.slice(
    officeSrc.indexOf('export function tickOfficeArt'),
    officeSrc.indexOf('export function restyleOffice(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickOfficeArt must not touch the THREE binding');
  assert.match(tickSrc, /officeSun|officePlane/);
});

test('Trainer Licorice Grid is implemented with candy-torus gates', () => {
  assert.equal(TRAINER_VIBE_ID, 'trainer');
  const v = VIBES.trainer;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Licorice Grid');
  assert.equal(v.sky, 'none');
  assert.equal(v.time, 'indoor night');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'candy-torus');
  assert.equal(v.post.bloom, true);
  assert.equal(v.palette.neonA.toLowerCase(), '#ff4d8d');
  assert.equal(v.lighting.fogColor, 0x1a1020);
  assert.equal(trainerWantsGlow('low'), false);
  assert.equal(trainerWantsGlow('med'), true);
  assert.equal(trainerBudget('low').cones < trainerBudget('high').cones, true);
  assert.equal(trainerBudget('low').glow, false);
  assert.equal(trainerBudget('med').glow, true);
});

test('Trainer freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const trainerSrc = readFileSync(join(root, 'sim-art-trainer.js'), 'utf8');
  assert.equal(mentionsBannedAssets(trainerSrc), false);
  assert.match(trainerSrc, /never abort the FPV render loop/);
  assert.match(trainerSrc, /CapsuleGeometry|LatheGeometry|ExtrudeGeometry/);
  const free = freestyleTrack('trainer');
  assert.equal(free.id, freestyleIdFor('trainer'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'trainer');
    assert.doesNotThrow(() => hideStockTrainerMeshes(built.group));
    const out = restyleTrainer(THREE, {
      vibe: vibeFor('trainer'),
      quality: q,
      group: built.group,
      floor: built.floor,
    });
    assert.equal(out.error, undefined, q + ' restyleTrainer ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 4, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('trainerArtVisuals');
    assert.ok(vis, q + ' trainerArtVisuals');
    if (q === 'low') assert.equal(trainerBudget('low').glow, false);
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low trainer callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 6, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 6, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickTrainerArt(built.group, 1000 + i * 16);
    }, q + ' tickTrainerArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildLicoriceGrid(THREE, parent, vibeFor('trainer'), q, free.gates));
  }
  const tickSrc = trainerSrc.slice(
    trainerSrc.indexOf('export function tickTrainerArt'),
    trainerSrc.indexOf('export function restyleTrainer(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickTrainerArt must not touch the THREE binding');
  assert.match(tickSrc, /trainerBulb|trainerSpark|trainerFrame/);
});

test('Backyard Jade Lot is implemented with stone-gold gates', () => {
  assert.equal(BACKYARD_VIBE_ID, 'backyard');
  const v = VIBES.backyard;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Jade Lot');
  assert.equal(v.sky, 'gradient');
  assert.equal(v.time, 'dusk');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'stone-gold');
  assert.equal(v.post.bloom, false);
  assert.equal(v.palette.neonA.toLowerCase(), '#c9a45b');
  assert.equal(v.lighting.fogColor, 0x2a2014);
  assert.equal(backyardWantsGlow('low'), false);
  assert.equal(backyardWantsGlow('med'), true);
  assert.equal(backyardBudget('low').posts < backyardBudget('high').posts, true);
  assert.equal(backyardBudget('low').glow, false);
  assert.equal(backyardBudget('med').glow, true);
});

test('Backyard freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const yardSrc = readFileSync(join(root, 'sim-art-backyard.js'), 'utf8');
  assert.equal(mentionsBannedAssets(yardSrc), false);
  assert.match(yardSrc, /never abort the FPV render loop/);
  assert.match(yardSrc, /CapsuleGeometry|LatheGeometry|ExtrudeGeometry/);
  const free = freestyleTrack('backyard');
  assert.equal(free.id, freestyleIdFor('backyard'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'backyard');
    assert.doesNotThrow(() => hideStockBackyardMeshes(built.group));
    const out = restyleBackyard(THREE, {
      vibe: vibeFor('backyard'),
      quality: q,
      group: built.group,
      floor: built.floor,
    });
    assert.equal(out.error, undefined, q + ' restyleBackyard ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 6, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('backyardArtVisuals');
    assert.ok(vis, q + ' backyardArtVisuals');
    if (q === 'low') assert.equal(backyardBudget('low').glow, false);
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low backyard callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 6, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 6, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickBackyardArt(built.group, 1000 + i * 16);
    }, q + ' tickBackyardArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildJadeLot(THREE, parent, vibeFor('backyard'), q, free.gates));
  }
  const tickSrc = yardSrc.slice(
    yardSrc.indexOf('export function tickBackyardArt'),
    yardSrc.indexOf('export function restyleBackyard(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickBackyardArt must not touch the THREE binding');
  assert.match(tickSrc, /backyardIdol|backyardMoss/);
});

test('Your Room Pocket Stage is implemented with felt-ring gates', () => {
  assert.equal(ROOM_VIBE_ID, 'room');
  const v = VIBES.room;
  assert.equal(v.implemented, true);
  assert.equal(v.name, 'Pocket Stage');
  assert.equal(v.sky, 'none');
  assert.equal(v.time, 'desk lamp');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'felt-ring');
  assert.equal(v.post.bloom, false);
  assert.equal(v.palette.neonA.toLowerCase(), '#ffb3c7');
  assert.equal(v.lighting.fogColor, 0xeee8de);
  assert.equal(roomWantsGlow('low'), false);
  assert.equal(roomWantsGlow('med'), true);
  assert.equal(roomBudget('low').toys < roomBudget('high').toys, true);
  assert.equal(roomBudget('low').glow, false);
  assert.equal(roomBudget('med').glow, true);
});

test('Room freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const roomSrc = readFileSync(join(root, 'sim-art-room.js'), 'utf8');
  assert.equal(mentionsBannedAssets(roomSrc), false);
  assert.match(roomSrc, /never abort the FPV render loop/);
  assert.match(roomSrc, /CapsuleGeometry|LatheGeometry|ExtrudeGeometry/);
  const free = freestyleTrack('room');
  assert.equal(free.id, freestyleIdFor('room'));
  assert.equal(free.gates.length, 0);
  for (const q of ['low', 'med', 'high', 'auto']) {
    const built = buildMap(THREE, 'room');
    assert.doesNotThrow(() => hideStockRoomMeshes(built.group));
    const out = restyleRoom(THREE, {
      vibe: vibeFor('room'),
      quality: q,
      group: built.group,
      floor: built.floor,
      plan: built.plan,
    });
    assert.equal(out.error, undefined, q + ' restyleRoom ' + out.error);
    assert.ok(out.visuals, q + ' visuals');
    const hidden = [];
    built.group.traverse((o) => {
      if (o.userData && o.userData.artHidden) hidden.push(1);
    });
    assert.ok(hidden.length >= 4, q + ' hidden stock ' + hidden.length);
    const vis = built.group.getObjectByName('roomArtVisuals');
    assert.ok(vis, q + ' roomArtVisuals');
    if (q === 'low') assert.equal(roomBudget('low').glow, false);
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low room callsEst ' + stats.callsEst);
    const frame = cityFrameLit(vis);
    assert.ok(frame.meshes >= 6, q + ' meshes ' + frame.meshes);
    assert.ok(frame.lit >= 6, q + ' lit materials ' + frame.lit);
    assert.ok(frame.maxChan > 0.08, q + ' brightest channel ' + frame.maxChan);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 8; i++) tickRoomArt(built.group, 1000 + i * 16);
    }, q + ' tickRoomArt');
    const parent = new THREE.Group();
    assert.doesNotThrow(() => buildPocketStage(THREE, parent, vibeFor('room'), q, free.gates, built.plan));
  }
  const tickSrc = roomSrc.slice(
    roomSrc.indexOf('export function tickRoomArt'),
    roomSrc.indexOf('export function restyleRoom(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickRoomArt must not touch the THREE binding');
  assert.match(tickSrc, /roomStage|roomMobile/);
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
