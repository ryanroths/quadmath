// Art-direction tests: vibe table, bloom budget, no third-party city meshes.
// node --test tools/test_sim_art.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VIBES, MAP_VIBE_IDS, vibeFor, resolveMapLighting, disposeArtGroup,
  qualityWantsBloom, qualityBudget,
  hexNum, vibeTable, mentionsBannedAssets, CITY_VIBE_ID,
  qualityWantsReflections, qualityWantsParticles,
  propClearOfCourse, planCityProps, planPortalBlocks, SIGN_WORDS, GATE_STYLES,
  signsAreOriginal, BRAND_BLOCKLIST,
  paintWorldLabel, WORLD_LABEL, restyleCity, buildNeonCity, artStats, tickCityArt, mergeStaticArt,
  CAR_TYPES, carTypeForSeed, carYawFromDir, carHeading, makeCarGeo,
  kitBytesForQuality, CITY_KIT_CARS, CITY_KIT_PROPS,
  garageKitBytesForQuality, GARAGE_KIT_CORE, GARAGE_KIT_EXTRA, GARAGE_KIT_SKIP, planGarageKit,
  warehouseKitBytesForQuality, WAREHOUSE_KIT_CORE, WAREHOUSE_KIT_EXTRA, planWarehouseKit,
  livingKitBytesForQuality, LIVING_KIT_CORE, LIVING_KIT_EXTRA, planLivingKit,
  gymKitBytesForQuality, GYM_KIT_CORE, GYM_KIT_EXTRA, planGymKit,
  officeKitBytesForQuality, OFFICE_KIT_CORE, OFFICE_KIT_EXTRA, planOfficeKit,
  backyardKitBytesForQuality, BACKYARD_KIT_CORE, BACKYARD_KIT_EXTRA, planBackyardKit,
  restyleDiveTubes, LIVING_VIBE_ID, hideStockLivingMeshes, buildClayParlor,
  restyleLiving, tickLivingArt, livingBudget, livingWantsGlow,
  FELT_SCALE, applyFeltMaterial, feltBasic, studioPhoneBudget, vibePost,
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
  BACKYARD_VIBE_ID, hideStockBackyardMeshes, buildRyanYard,
  restyleBackyard, tickBackyardArt, backyardBudget, backyardWantsGlow,
  ROOM_VIBE_ID, hideStockRoomMeshes, buildPocketStage,
  restyleRoom, tickRoomArt, roomBudget, roomWantsGlow,
} from '../sim-art.js';
import { MAPS, FROZEN_CITY, cityTrackJson, freestyleTrack, freestyleIdFor } from '../sim-tracks.js';
import * as THREE from '../vendor/three.module.min.js';
import { MAP_IDS, MAP_LOOKS, buildMap, GARAGE_PLAY, WAREHOUSE_PLAY, LIVING_PLAY, GYM_PLAY, OFFICE_PLAY, CITY_PLAY, BACKYARD_PLAY, installCityExploreColliders } from '../sim-maps.js';
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
  assert.equal(qualityWantsBloom('high', VIBES.living), false);
  assert.equal(qualityWantsBloom('high', VIBES.garage), true);
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

test('mergeStaticArt collapses same-material static meshes', () => {
  const root = new THREE.Group();
  const vis = new THREE.Group();
  vis.name = 'livingArtVisuals';
  root.add(vis);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  vis.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  vis.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  vis.children[0].position.set(-1, 0, 0);
  vis.children[1].position.set(1, 0, 0);
  const n = mergeStaticArt(THREE, root);
  assert.ok(n >= 2, 'merged ' + n);
  let meshes = 0;
  vis.traverse((o) => { if (o.isMesh) meshes += 1; });
  assert.equal(meshes, 1);
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
  assert.match(art, /sim-art-felt\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-living\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-garage\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-warehouse\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-gym\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-office\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-trainer\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-backyard\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-room\.js\?v=[0-9a-f]{12}/);
  assert.match(art, /sim-art-kit\.js\?v=[0-9a-f]{12}/);
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
  assert.match(sim, /tryDressCityKit/);
  assert.match(sim, /tryDressGarageKit/);
  assert.match(sim, /tryDressWarehouseKit/);
  assert.match(sim, /tryDressLivingKit/);
  assert.match(sim, /tryDressGymKit/);
  assert.match(sim, /tryDressOfficeKit/);
  assert.match(sim, /tryDressBackyardKit/);
  assert.match(sim, /MeshoptDecoder/);
  assert.match(sim, /Kenney CC0/);
  assert.match(sim, /Kenney CC0 shop kit/);
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
  for (const fn of ['restyleCity', 'tickCityArt', 'decorateVibeGate', 'applyVibeLighting', 'resolveMapLighting']) {
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

test('Kenney CC0 city kit is meshopt-compressed and stays off the banned path', () => {
  const kitDir = join(root, 'assets/sim-city');
  const kitSrc = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  assert.equal(kitSrc.includes('GLB-format'), false);
  assert.equal(kitSrc.includes('loadAsync'), false);
  assert.equal(kitSrc.includes('WebFPV'), false);
  assert.equal(kitSrc.includes('Sketchfab'), false);
  assert.match(kitSrc, /loader\.load\(/);
  assert.match(kitSrc, /Meshopt-compressed/);
  assert.equal(kitBytesForQuality('low'), 54304);
  assert.equal(kitBytesForQuality('med'), 80532);
  assert.equal(kitBytesForQuality('high'), 80532);
  const files = readdirSync(kitDir);
  for (const name of ['License-car-kit.txt', 'License-city-kit-commercial.txt', 'License-city-kit-roads.txt', 'CREDITS.txt']) {
    assert.ok(files.includes(name), name);
    const txt = readFileSync(join(kitDir, name), 'utf8');
    if (name.startsWith('License-')) assert.match(txt, /Creative Commons Zero, CC0/);
  }
  let glbBytes = 0;
  const names = [];
  for (const spec of Object.values(CITY_KIT_CARS).concat(Object.values(CITY_KIT_PROPS))) {
    const p = join(kitDir, spec.file);
    assert.equal(existsSync(p), true, spec.file);
    const n = statSync(p).size;
    assert.equal(n, spec.bytes, spec.file + ' size');
    glbBytes += n;
    names.push(spec.file);
  }
  assert.equal(glbBytes, 80532);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!files.some((f) => f.includes('GLB-format')));
});

test('Kenney CC0 garage kit is meshopt-compressed and stays off the banned path', () => {
  const kitDir = join(root, 'assets/sim-garage');
  const kitSrc = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  const garageSrc = readFileSync(join(root, 'sim-art-garage.js'), 'utf8');
  assert.equal(kitSrc.includes('GLB-format'), false);
  assert.equal(kitSrc.includes('loadAsync'), false);
  assert.equal(kitSrc.includes('WebFPV'), false);
  assert.equal(kitSrc.includes('Sketchfab'), false);
  assert.equal(garageSrc.includes('GLB-format'), false);
  assert.equal(garageSrc.includes('WebFPV'), false);
  assert.match(kitSrc, /tryDressGarageKit/);
  assert.match(kitSrc, /Meshopt-compressed/);
  assert.equal(garageKitBytesForQuality('low'), 12160);
  assert.equal(garageKitBytesForQuality('med'), 45904);
  assert.equal(garageKitBytesForQuality('high'), 45904);
  const planned = planGarageKit();
  assert.equal(planned.bench.length, 0, 'Kenney cabinet bench is not instanced');
  assert.ok(planned.chest.length && planned.car.length);
  assert.ok(planned.toolboxes.length >= 2);
  assert.ok(planned.chest.every((p) => p.x < -6.6));
  assert.ok(planned.toolboxes.every((p) => Math.abs(p.x) >= 7.4));
  assert.ok(planned.car.every((p) => p.x > 1.1 && p.x < 7.2 && p.z > -11.4 && p.z < 0.6));
  assert.ok(planned.car.every((p) => p.y >= 1.2), 'kit sedan sits on jack stands');
  const clutter = []
    .concat(planned.crates, planned.cardboard, planned.toolboxes, planned.tires)
    .concat(planned.barrels, planned.barriers);
  for (const p of clutter) {
    assert.ok(Math.abs(p.x) >= 4.6, 'kit clutter too close to whoop line ' + p.x + ',' + p.z);
  }
  for (const name of ['License-furniture-kit.txt', 'License-survival-kit.txt', 'License-car-kit.txt', 'License-racing-kit.txt', 'CREDITS.txt']) {
    assert.ok(existsSync(join(kitDir, name)), name);
    if (name.startsWith('License-')) {
      assert.match(readFileSync(join(kitDir, name), 'utf8'), /Creative Commons Zero, CC0/);
    }
  }
  let glbBytes = 0;
  const names = [];
  const kitSpecs = Object.values(GARAGE_KIT_CORE).concat(Object.values(GARAGE_KIT_EXTRA), Object.values(GARAGE_KIT_SKIP));
  for (const spec of kitSpecs) {
    const p = join(kitDir, spec.file);
    assert.equal(existsSync(p), true, spec.file);
    const n = statSync(p).size;
    assert.equal(n, spec.bytes, spec.file + ' size');
    glbBytes += n;
    names.push(spec.file);
  }
  assert.equal(glbBytes, 51128);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!readdirSync(kitDir).some((f) => f.includes('GLB-format')));
  const emit = kitSrc.slice(kitSrc.indexOf('function garageMat'), kitSrc.indexOf('let garageDressGen'));
  assert.equal(/emissiveIntensity: [2-9]/.test(emit), false, 'garage kit glow must stay dim under bloom');
  assert.match(kitSrc, /function garageMat/);
  assert.equal(/garageMat[\s\S]{0,900}MeshStandardMaterial/.test(kitSrc), false, 'garage kit must not use MeshStandard after IBL');
  assert.match(emit, /MeshBasicMaterial/);
});

test('Kenney CC0 warehouse kit is meshopt-compressed and stays off the banned path', () => {
  const kitDir = join(root, 'assets/sim-warehouse');
  const kitSrc = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  const warehouseSrc = readFileSync(join(root, 'sim-art-warehouse.js'), 'utf8');
  assert.equal(kitSrc.includes('GLB-format'), false);
  assert.equal(kitSrc.includes('loadAsync'), false);
  assert.equal(kitSrc.includes('WebFPV'), false);
  assert.equal(warehouseSrc.includes('GLB-format'), false);
  assert.equal(warehouseSrc.includes('WebFPV'), false);
  assert.equal(mentionsBannedAssets(warehouseSrc), false);
  assert.match(kitSrc, /tryDressWarehouseKit/);
  assert.match(kitSrc, /function warehouseMat/);
  assert.equal(warehouseKitBytesForQuality('low'), 3708);
  assert.equal(warehouseKitBytesForQuality('med'), 11616);
  assert.equal(warehouseKitBytesForQuality('high'), 11616);
  const planned = planWarehouseKit();
  assert.ok(planned.crates.length >= 8);
  assert.ok(planned.barrels.length >= 4);
  assert.ok(planned.cardboard.length >= 4);
  const clutter = [].concat(planned.crates, planned.barrels, planned.cardboard);
  for (const p of clutter) {
    const onShelf = p.y >= 1.2;
    assert.ok(Math.abs(p.x) >= 7.2 || onShelf, 'kit clutter too close to aisle ' + p.x + ',' + p.z);
  }
  for (const name of ['License-survival-kit.txt', 'License-furniture-kit.txt', 'CREDITS.txt']) {
    assert.ok(existsSync(join(kitDir, name)), name);
    if (name.startsWith('License-')) {
      assert.match(readFileSync(join(kitDir, name), 'utf8'), /Creative Commons Zero, CC0/);
    }
  }
  let glbBytes = 0;
  const names = [];
  const kitSpecs = Object.values(WAREHOUSE_KIT_CORE).concat(Object.values(WAREHOUSE_KIT_EXTRA));
  for (const spec of kitSpecs) {
    const p = join(kitDir, spec.file);
    assert.equal(existsSync(p), true, spec.file);
    const n = statSync(p).size;
    assert.equal(n, spec.bytes, spec.file + ' size');
    glbBytes += n;
    names.push(spec.file);
  }
  assert.equal(glbBytes, 11616);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!readdirSync(kitDir).some((f) => f.includes('GLB-format')));
  const emit = kitSrc.slice(kitSrc.indexOf('function warehouseMat'), kitSrc.indexOf('let warehouseDressGen'));
  assert.equal(/emissiveIntensity: [2-9]/.test(emit), false, 'warehouse kit glow must stay dim under bloom');
  assert.equal(/warehouseMat[\s\S]{0,900}MeshStandardMaterial/.test(kitSrc), false, 'warehouse kit must not use MeshStandard after IBL');
  assert.match(emit, /MeshBasicMaterial/);
});

test('Kenney CC0 gym kit is meshopt-compressed and stays off the banned path', () => {
  const kitDir = join(root, 'assets/sim-gym');
  const kitSrc = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  const gymSrc = readFileSync(join(root, 'sim-art-gym.js'), 'utf8');
  assert.equal(kitSrc.includes('GLB-format'), false);
  assert.equal(kitSrc.includes('loadAsync'), false);
  assert.equal(kitSrc.includes('WebFPV'), false);
  assert.equal(gymSrc.includes('GLB-format'), false);
  assert.equal(gymSrc.includes('WebFPV'), false);
  assert.equal(mentionsBannedAssets(gymSrc), false);
  assert.match(kitSrc, /tryDressGymKit/);
  assert.match(kitSrc, /function gymMat/);
  assert.equal(gymKitBytesForQuality('low'), 2792);
  assert.equal(gymKitBytesForQuality('med'), 9980);
  assert.equal(gymKitBytesForQuality('high'), 9980);
  const planned = planGymKit();
  assert.ok(planned.cardboard.length >= 4);
  assert.ok(planned.barrels.length >= 4);
  assert.ok(planned.barriers.length >= 2);
  const clutter = [].concat(planned.cardboard, planned.barrels, planned.barriers);
  for (const p of clutter) {
    assert.ok(Math.abs(p.x) >= 22, 'kit clutter too close to court ' + p.x + ',' + p.z);
  }
  for (const name of ['License-survival-kit.txt', 'License-furniture-kit.txt', 'License-racing-kit.txt', 'CREDITS.txt']) {
    assert.ok(existsSync(join(kitDir, name)), name);
    if (name.startsWith('License-')) {
      assert.match(readFileSync(join(kitDir, name), 'utf8'), /Creative Commons Zero, CC0/);
    }
  }
  let glbBytes = 0;
  const names = [];
  const kitSpecs = Object.values(GYM_KIT_CORE).concat(Object.values(GYM_KIT_EXTRA));
  for (const spec of kitSpecs) {
    const p = join(kitDir, spec.file);
    assert.equal(existsSync(p), true, spec.file);
    const n = statSync(p).size;
    assert.equal(n, spec.bytes, spec.file + ' size');
    glbBytes += n;
    names.push(spec.file);
  }
  assert.equal(glbBytes, 9980);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!readdirSync(kitDir).some((f) => f.includes('GLB-format')));
  const emit = kitSrc.slice(kitSrc.indexOf('function gymMat'), kitSrc.indexOf('let gymDressGen'));
  assert.equal(/emissiveIntensity: [2-9]/.test(emit), false, 'gym kit glow must stay dim under bloom');
  assert.equal(/gymMat[\s\S]{0,900}MeshStandardMaterial/.test(kitSrc), false, 'gym kit must not use MeshStandard after IBL');
  assert.match(emit, /MeshBasicMaterial/);
});

test('Kenney CC0 office kit is meshopt-compressed and stays off the banned path', () => {
  const kitDir = join(root, 'assets/sim-office');
  const kitSrc = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  const officeSrc = readFileSync(join(root, 'sim-art-office.js'), 'utf8');
  assert.equal(kitSrc.includes('GLB-format'), false);
  assert.equal(kitSrc.includes('loadAsync'), false);
  assert.equal(kitSrc.includes('WebFPV'), false);
  assert.equal(officeSrc.includes('GLB-format'), false);
  assert.equal(officeSrc.includes('WebFPV'), false);
  assert.equal(mentionsBannedAssets(officeSrc), false);
  assert.match(kitSrc, /tryDressOfficeKit/);
  assert.match(kitSrc, /function officeMat/);
  assert.equal(officeKitBytesForQuality('low'), 2792);
  assert.equal(officeKitBytesForQuality('med'), 10960);
  assert.equal(officeKitBytesForQuality('high'), 10960);
  const planned = planOfficeKit();
  assert.ok(planned.cardboard.length >= 4);
  assert.ok(planned.crates.length >= 4);
  assert.ok(planned.toolboxes.length >= 2);
  const clutter = [].concat(planned.cardboard, planned.crates, planned.toolboxes);
  for (const p of clutter) {
    assert.ok(Math.abs(p.x) >= 15.8, 'kit clutter too close to aisle ' + p.x + ',' + p.z);
  }
  for (const name of ['License-survival-kit.txt', 'License-furniture-kit.txt', 'CREDITS.txt']) {
    assert.ok(existsSync(join(kitDir, name)), name);
    if (name.startsWith('License-')) {
      assert.match(readFileSync(join(kitDir, name), 'utf8'), /Creative Commons Zero, CC0/);
    }
  }
  let glbBytes = 0;
  const names = [];
  const kitSpecs = Object.values(OFFICE_KIT_CORE).concat(Object.values(OFFICE_KIT_EXTRA));
  for (const spec of kitSpecs) {
    const p = join(kitDir, spec.file);
    assert.equal(existsSync(p), true, spec.file);
    const n = statSync(p).size;
    assert.equal(n, spec.bytes, spec.file + ' size');
    glbBytes += n;
    names.push(spec.file);
  }
  assert.equal(glbBytes, 10960);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!readdirSync(kitDir).some((f) => f.includes('GLB-format')));
  const emit = kitSrc.slice(kitSrc.indexOf('function officeMat'), kitSrc.indexOf('let officeDressGen'));
  assert.equal(/emissiveIntensity: [2-9]/.test(emit), false, 'office kit glow must stay dim under bloom');
  assert.equal(/officeMat[\s\S]{0,900}MeshStandardMaterial/.test(kitSrc), false, 'office kit must not use MeshStandard after IBL');
  assert.match(emit, /MeshBasicMaterial/);
});

test('Kenney CC0 living kit is meshopt-compressed and stays off the banned path', () => {
  const kitDir = join(root, 'assets/sim-living');
  const kitSrc = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  const livingSrc = readFileSync(join(root, 'sim-art-living.js'), 'utf8');
  assert.equal(kitSrc.includes('GLB-format'), false);
  assert.equal(kitSrc.includes('loadAsync'), false);
  assert.equal(kitSrc.includes('WebFPV'), false);
  assert.equal(livingSrc.includes('GLB-format'), false);
  assert.equal(livingSrc.includes('WebFPV'), false);
  assert.equal(mentionsBannedAssets(livingSrc), false);
  assert.match(kitSrc, /tryDressLivingKit/);
  assert.match(kitSrc, /function livingMat/);
  assert.equal(livingKitBytesForQuality('low'), 2792);
  assert.equal(livingKitBytesForQuality('med'), 10960);
  assert.equal(livingKitBytesForQuality('high'), 10960);
  const planned = planLivingKit();
  assert.ok(planned.cardboard.length >= 4);
  assert.ok(planned.crates.length >= 4);
  assert.ok(planned.toolboxes.length >= 2);
  const clutter = [].concat(planned.cardboard, planned.crates, planned.toolboxes);
  for (const p of clutter) {
    assert.ok(Math.abs(p.x) >= 9.1, 'kit clutter too close to parlor ' + p.x + ',' + p.z);
  }
  for (const name of ['License-survival-kit.txt', 'License-furniture-kit.txt', 'CREDITS.txt']) {
    assert.ok(existsSync(join(kitDir, name)), name);
    if (name.startsWith('License-')) {
      assert.match(readFileSync(join(kitDir, name), 'utf8'), /Creative Commons Zero, CC0/);
    }
  }
  let glbBytes = 0;
  const names = [];
  const kitSpecs = Object.values(LIVING_KIT_CORE).concat(Object.values(LIVING_KIT_EXTRA));
  for (const spec of kitSpecs) {
    const p = join(kitDir, spec.file);
    assert.equal(existsSync(p), true, spec.file);
    const n = statSync(p).size;
    assert.equal(n, spec.bytes, spec.file + ' size');
    glbBytes += n;
    names.push(spec.file);
  }
  assert.equal(glbBytes, 10960);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!readdirSync(kitDir).some((f) => f.includes('GLB-format')));
  const emit = kitSrc.slice(kitSrc.indexOf('function livingMat'), kitSrc.indexOf('let livingDressGen'));
  assert.equal(/emissiveIntensity: [2-9]/.test(emit), false, 'living kit glow must stay dim under bloom');
  assert.equal(/livingMat[\s\S]{0,900}MeshStandardMaterial/.test(kitSrc), false, 'living kit must not use MeshStandard after IBL');
  assert.match(emit, /MeshBasicMaterial/);
});

test('Kenney CC0 backyard kit is meshopt-compressed and stays off the banned path', () => {
  const kitDir = join(root, 'assets/sim-backyard');
  const kitSrc = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  const yardSrc = readFileSync(join(root, 'sim-art-backyard.js'), 'utf8');
  assert.equal(kitSrc.includes('GLB-format'), false);
  assert.equal(kitSrc.includes('loadAsync'), false);
  assert.equal(kitSrc.includes('WebFPV'), false);
  assert.equal(kitSrc.includes('Sketchfab'), false);
  assert.equal(yardSrc.includes('GLB-format'), false);
  assert.equal(yardSrc.includes('WebFPV'), false);
  assert.equal(mentionsBannedAssets(yardSrc), false);
  assert.match(kitSrc, /tryDressBackyardKit/);
  assert.match(kitSrc, /Meshopt-compressed/);
  assert.equal(
    /one\(BACKYARD_KIT_CORE\.fence/.test(kitSrc),
    false,
    'Kenney fence panel must not hide the pool mesh',
  );
  assert.equal(backyardKitBytesForQuality('low'), 19612);
  assert.equal(backyardKitBytesForQuality('med'), 81708);
  assert.equal(backyardKitBytesForQuality('high'), 81708);
  const planned = planBackyardKit();
  assert.ok(planned.trees.length && planned.palms.length && planned.fence.length);
  assert.ok(planned.trees.some((p) => p.x === BACKYARD_PLAY.ficus.x && p.z === BACKYARD_PLAY.ficus.z));
  assert.ok(planned.woodGate.every((p) => p.x === BACKYARD_PLAY.woodGate.x));
  assert.ok(planned.ac.every((p) => p.x === BACKYARD_PLAY.ac.x));
  for (const name of [
    'License-nature-kit.txt', 'License-furniture-kit.txt', 'License-pirate-kit.txt',
    'License-polyhaven.txt', 'CREDITS.txt',
  ]) {
    assert.ok(existsSync(join(kitDir, name)), name);
    if (name.startsWith('License-')) {
      const txt = readFileSync(join(kitDir, name), 'utf8');
      assert.match(txt, /Creative Commons Zero|CC0/);
    }
  }
  assert.ok(existsSync(join(kitDir, 'hdri', 'kloofendal_48d_partly_cloudy_1k.hdr')));
  assert.ok(existsSync(join(kitDir, 'tex', 'plaster_diff_1k.webp')));
  assert.ok(existsSync(join(kitDir, 'tex', 'roof_diff_1k.webp')));
  let glbBytes = 0;
  const names = [];
  const kitSpecs = Object.values(BACKYARD_KIT_CORE).concat(Object.values(BACKYARD_KIT_EXTRA));
  for (const spec of kitSpecs) {
    const p = join(kitDir, spec.file);
    assert.equal(existsSync(p), true, spec.file);
    const n = statSync(p).size;
    assert.equal(n, spec.bytes, spec.file + ' size');
    glbBytes += n;
    names.push(spec.file);
  }
  assert.equal(glbBytes, 81708);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!readdirSync(kitDir).some((f) => f.includes('GLB-format')));
  assert.match(kitSrc, /mergeByMaterial|leafsGreen|woodBark/);
  assert.match(yardSrc, /planBackyardKit/);
  assert.match(yardSrc, /SphereGeometry\(u\.r/);
  assert.equal(yardSrc.includes('backyardProcCanopy'), false, 'canopy wire hoop must not be built');
  assert.match(kitSrc, /lollipops/);
  assert.equal(kitSrc.includes('one(BACKYARD_KIT_CORE.palm'), false, 'Kenney palms stay off the hero veg');
  assert.equal(/ring\.material\.emissive\.setHex\(col\)/.test(yardSrc), false, 'gate must not keep stock teal/orange emissive');
});

test('city window and blink stay frozen so bloom does not strobe', () => {
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  const tickSrc = city.slice(
    city.indexOf('function tickCityArtObject'),
    city.indexOf('export function restyleMesas'),
  );
  assert.match(tickSrc, /cityWindow/);
  assert.equal(tickSrc.includes('> 0.35'), false, 'hard rooftop strobe');
  assert.equal(/\b5\.5\b/.test(tickSrc), false, 'blink must not jump by 5.5');
  assert.equal(/cityWindow[\s\S]{0,180}Math\.sin/.test(tickSrc), false, 'window must not pulse');
  assert.equal(/cityBlink[\s\S]{0,180}Math\.sin/.test(tickSrc), false, 'blink must not pulse');
  const kit = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  assert.equal(kit.includes('emissiveIntensity: 3.4'), false);
  assert.equal(/neonC\), 3\.8/.test(kit), false);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  const ao = looks.slice(looks.indexOf('const CONTACT_AO_FRAG'), looks.indexOf('export function decorateGate'));
  assert.match(ao, /smoothstep\(0\.0004, 0\.0022/);
  assert.equal(ao.includes('step(texture2D'), false, 'hard depth step flickers');
  assert.equal(ao.includes('d0 - 0.0007'), false);

  const win = { material: { userData: { cityWindow: true, cityWindowPhase: 0 }, emissiveIntensity: 1 } };
  const blink = { material: { userData: { cityBlink: true }, emissiveIntensity: 1 } };
  const sceneRoot = { traverse: (fn) => { fn(win); fn(blink); } };
  const w = [], b = [];
  for (let ms = 0; ms <= 4000; ms += 40) {
    tickCityArt(sceneRoot, ms);
    w.push(win.material.emissiveIntensity);
    b.push(blink.material.emissiveIntensity);
  }
  const span = (arr) => Math.max(...arr) - Math.min(...arr);
  assert.ok(span(w) < 0.001, 'window must stay frozen ' + span(w));
  assert.ok(span(b) < 0.001, 'blink must stay frozen ' + span(b));
  assert.equal(win.material.emissiveIntensity, 1.30);
  assert.equal(blink.material.emissiveIntensity, 1.55);
});

test('one lighting resolver per map and city never shares fog as background', () => {
  for (const id of MAP_VIBE_IDS) {
    const spec = resolveMapLighting(id);
    assert.equal(spec.mapId, id);
    assert.ok(spec.lighting);
    assert.ok(spec.looks);
    assert.equal(spec.citySky, id === 'city');
    assert.equal(spec.keepHdrEnv, id !== 'city');
    assert.equal(typeof spec.bgHex, 'number');
  }
  assert.equal(resolveMapLighting('city').bgHex, 0x070014);
  assert.equal(resolveMapLighting('nope').mapId, 'city');
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /function applyResolvedLighting/);
  assert.match(city, /never share fog\.color as background/);
  assert.match(city, /updateSceneLighting\(scene/);
  assert.match(city, /function disposeArtGroup/);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /function setMapLighting/);
  assert.match(looks, /mapLighting\.mapId === 'backyard'/);
  assert.match(looks, /Color: THREE\.Color/);
  const lighting = readFileSync(join(root, 'sim-lighting.js'), 'utf8');
  assert.match(lighting, /bg === fog\.color/);
  assert.equal(/scene\.background = (scene\.)?fog\.color[;\s]/.test(lighting + looks), false);
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /resolveMapLighting\(/);
  assert.match(sim, /citySky\)\)applyCityArt/);
  assert.match(sim, /_cityArtReady/);
  assert.match(sim, /artDirty&&currentMap==='city'\)applyCityArt/);
  assert.equal(/ensureIndoor[\s\S]{0,500}setQuality\(looks\.choice\)/.test(sim), false);
});

test('city restyle disposes old art; HDRI and world maps cache; Low skips composer', () => {
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /if \(old\) disposeArtGroup\(old\)/);
  assert.match(city, /if \(oldDream\) disposeArtGroup\(oldDream\)/);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /const hdrCache = \{\}/);
  assert.match(looks, /if \(hdrCache\[url\]\) return hdrCache\[url\]/);
  assert.match(looks, /URL\.createObjectURL\(new Blob\(\[buf\]\)\)/);
  assert.match(looks, /texCache\[key\] = \(async function/);
  assert.match(looks, /get composer\(\) \{ return qualityWantsPost\(\) \? composer : null; \}/);
  assert.match(looks, /gpuHigh: gpuHint\(renderer\)\.high/);
  assert.match(looks, /const high = !software && \/nvidia\|geforce\|radeon\|amd\|apple m\[1-9\]\/i/);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  group.add(mesh);
  disposeArtGroup(group);
  assert.equal(group.parent, null);
});

test('city restyle frees every owned geometry/material/texture, keeps shared ones', () => {
  installDomStub();
  const parent = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40, 8, 6), new THREE.MeshBasicMaterial());
  const ctx = { vibe: vibeFor('city'), quality: 'high', proceduralGroup: parent, skyMesh: sky, gates: FROZEN_CITY[0] };
  const first = restyleCity(THREE, ctx);
  assert.equal(first.error, undefined);
  // Shared stand-ins: cached kit geometry, texCache PBR map, scene env.
  const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
  const sharedTex = new THREE.Texture();
  const kit = new THREE.Mesh(sharedGeo, new THREE.MeshBasicMaterial({ map: sharedTex }));
  kit.userData.cityKit = true;
  first.visuals.add(kit);
  const owned = new Set();
  for (const g of [first.visuals, first.dream]) g.traverse((o) => {
    if (o.geometry && o !== kit) owned.add(o.geometry);
    for (const m of [].concat(o.material || [])) {
      owned.add(m);
      for (const k in m) if (m[k] && m[k].isTexture && m[k].userData.looksComposed) owned.add(m[k]);
    }
  });
  owned.add(sky.material);
  const sharedEnv = new THREE.Texture();
  for (const m of owned) if (m.isMeshStandardMaterial) m.envMap = sharedEnv;
  const freed = new Set();
  for (const r of owned.add(sharedGeo).add(sharedTex).add(sharedEnv)) r.addEventListener('dispose', () => freed.add(r));
  assert.ok([...owned].some((m) => m.emissiveMap && owned.has(m.emissiveMap)), 'window emissiveMaps tracked');
  restyleCity(THREE, ctx);
  for (const r of owned) {
    if (r === sharedGeo || r === sharedTex || r === sharedEnv) assert.ok(!freed.has(r), 'shared ' + r.type + ' kept');
    else assert.ok(freed.has(r), 'owned ' + (r.isTexture ? 'texture' : r.type) + ' disposed');
  }
  assert.equal(parent.children.filter((c) => c.name === 'cityArtVisuals').length, 1);
});

test('unused GLB-format folder is listed for removal, not loaded', () => {
  const lic = readFileSync(join(root, 'ASSETS-LICENSES.md'), 'utf8');
  assert.match(lic, /Proposed removal \(unused `assets\/Models\/GLB-format\/`/);
  assert.match(lic, /low_poly_city_game-ready\.glb/);
  assert.match(lic, /53,450,388/);
  assert.equal(mentionsBannedAssets('assets/Models/GLB-format/tree-large.glb'), true);
  const kit = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  assert.equal(kit.includes('GLB-format'), false);
});

test('city kit cars stay MeshBasic and city sky never keeps dawn IBL', () => {
  const kit = readFileSync(join(root, 'sim-art-kit.js'), 'utf8');
  assert.match(kit, /function carMat/);
  assert.match(kit, /MeshBasicMaterial/);
  assert.match(kit, /translucent blue glass/);
  assert.match(kit, /envMapIntensity:\s*0/);
  assert.equal(/carMat[\s\S]{0,240}MeshStandardMaterial/.test(kit), false);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /function applyLighting/);
  assert.match(looks, /washed Kenney cars blue/);
  const lighting = readFileSync(join(root, 'sim-lighting.js'), 'utf8');
  assert.match(lighting, /out\.environment = citySky \? null : env/);
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /envMapIntensity:\s*0/);
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
  assert.match(looks, /cityInside|cityAlley|citySpins|cityRoofHole/);
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
  assert.match(tickSrc, /cityCurrent|cityCruise|cityDrone/);
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
    assert.ok(buildNeonCity(THREE, new THREE.Group(), vibeFor('city'), 'low', gates).getObjectByName('cityArtHero'), 'cityArtHero');
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
  const citySrc = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(citySrc, /CITY_PLAY|addCityExplore/);
  assert.match(citySrc, /applyFeltMaterial|feltBasic|feltEmissive/);
});

test('City explore district keeps doors, rooms, stairs, roof holes, and spins flyable', () => {
  const colliders = [];
  const n = installCityExploreColliders(THREE, colliders);
  assert.ok(n >= 20, 'city-explore colliders ' + n);
  assert.equal(installCityExploreColliders(THREE, colliders), 0, 'idempotent');
  const hit = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z);
    return colliders.some((bb) => bb.containsPoint(p));
  };
  const P = CITY_PLAY;
  const a = P.loftA;
  assert.equal(hit(a.x - a.w / 2, 1.18, a.z), false, 'fly loftA west door');
  assert.equal(hit(a.x - a.w / 2, 1.18, a.z + 4.0), true, 'loftA west wall solid');
  assert.equal(hit(a.x + a.w / 2, 1.90, a.z), false, 'fly loftA east window');
  assert.equal(hit(a.x + a.w / 2, 0.50, a.z), true, 'loftA window sill solid');
  assert.equal(hit(a.x, 1.50, a.z + 2.4), false, 'loftA interior room open');
  assert.equal(hit(a.x, 1.10, a.z + 0.35), true, 'loftA partition solid');
  assert.equal(hit(a.x, a.floors[0] + 0.04, a.z + 2.6), true, 'loftA floor solid');
  assert.equal(hit(a.x + a.stair.x, a.floors[0] + 0.04, a.z + a.stair.z), false, 'loftA stair well open');
  assert.equal(hit(a.x, a.h - 0.08, a.z), false, 'dive loftA roof hole');
  assert.equal(hit(a.x, a.h - 0.08, a.z + 3.6), true, 'loftA roof solid');
  assert.equal(hit(29.0, 1.20, 4.0), false, 'fly the alley gap');
  const w = P.walkup;
  assert.equal(hit(w.x, 1.18, w.z + w.d / 2), false, 'fly walkup north door');
  assert.equal(hit(w.x, 1.90, w.z - w.d / 2), false, 'fly walkup south window');
  assert.equal(hit(w.x, w.h - 0.08, w.z), false, 'dive walkup roof hole');
  assert.equal(hit(w.x + w.stair.x, w.floors[w.floors.length - 1] + 0.45, w.z + w.stair.z), false, 'walkup stair well open');
  const pole = P.spins[0];
  assert.equal(hit(pole.x, 1.10, pole.z), true, 'spin pole solid');
  assert.equal(hit(pole.x + 0.95, 1.20, pole.z), false, 'spin around the pole');
  assert.ok(P.whoopClear >= 0.85, 'whoop clearance');
  const citySrc = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(citySrc, /addCityExplore|cityExploreShell/);
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /installCityExploreColliders/);
});

test('City Felt Scale lock paints explore shells and keeps Low under budget', () => {
  installDomStub();
  const gates = FROZEN_CITY[0].concat(FROZEN_CITY[1]);
  for (const q of ['low', 'med', 'high']) {
    const vis = buildNeonCity(THREE, new THREE.Group(), vibeFor('city'), q, gates);
    assert.ok(vis.getObjectByName('cityExploreShell'), q + ' cityExploreShell');
    assert.ok(vis.getObjectByName('cityExploreGlow'), q + ' cityExploreGlow');
    let feltMats = 0;
    vis.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m && m.userData && m.userData.feltLocked) feltMats += 1;
      }
    });
    assert.ok(feltMats >= 8, q + ' feltLocked mats ' + feltMats);
    const stats = artStats(null, vis);
    if (q === 'low') {
      assert.ok(stats.callsEst <= 48, 'Low city-art callsEst ' + stats.callsEst);
      assert.ok(stats.instancedMeshes <= 40, 'Low IM ' + stats.instancedMeshes);
    }
  }
  assert.equal(vibeFor('city').time, 'night');
  assert.ok(vibeFor('city').lighting.hemiIntensity >= 0.56);
  assert.ok(vibeFor('city').props.includes('open interiors'));
  assert.ok(vibeFor('city').props.includes('spin grove'));
});

test('Felt Scale studio lock caps metalness and kills Low bloom/AO', () => {
  assert.equal(FELT_SCALE.id, 'felt-scale');
  assert.equal(FELT_SCALE.referenceMap, 'living');
  assert.equal(FELT_SCALE.metalnessMax, 0.05);
  assert.equal(FELT_SCALE.roughnessMin, 0.92);
  assert.equal(FELT_SCALE.bloomOnLow, false);
  const shiny = new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.2, envMapIntensity: 1 });
  applyFeltMaterial(shiny);
  assert.ok(shiny.metalness <= 0.05);
  assert.ok(shiny.roughness >= 0.92);
  assert.ok(shiny.envMapIntensity <= 0.28);
  assert.equal(shiny.userData.feltLocked, true);
  const basic = feltBasic(THREE, 0xf4d6c6);
  assert.equal(basic.isMeshBasicMaterial, true);
  assert.equal(basic.userData.feltLocked, true);
  const low = studioPhoneBudget('low', VIBES.living);
  assert.equal(low.bloom, false);
  assert.equal(low.ao, false);
  assert.equal(low.extraPasses, false);
  assert.equal(low.pixelRatioCap, 1);
  assert.equal(low.shadowMapSize, 512);
  const livingHigh = studioPhoneBudget('high', VIBES.living);
  assert.equal(livingHigh.bloom, false);
  assert.equal(vibePost(VIBES.living).bloom, false);
  assert.equal(vibePost(VIBES.garage).bloom, true);
  const garageHigh = studioPhoneBudget('high', VIBES.garage);
  assert.equal(garageHigh.bloom, true);
  const feltSrc = readFileSync(join(root, 'sim-art-felt.js'), 'utf8');
  assert.equal(mentionsBannedAssets(feltSrc), false);
  const bible = readFileSync(join(root, 'docs/sim-art-felt-scale.md'), 'utf8');
  assert.match(bible, /Felt Scale/);
  assert.match(bible, /Living Room/);
  assert.match(bible, /no bloom/i);
  assert.equal(bible.includes('WebFPV'), true);
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
  assert.match(livingSrc, /sim-art-felt\.js\?v=[0-9a-f]{12}/);
  assert.match(livingSrc, /feltBasic|feltEmissive/);
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
    let feltMats = 0;
    vis.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && m.userData && m.userData.feltLocked) feltMats += 1;
        if (m && m.metalness != null) assert.ok(m.metalness <= 0.05, q + ' metalness');
      }
    });
    assert.ok(feltMats >= 8, q + ' feltLocked mats ' + feltMats);
    const extras = vis.getObjectByName('livingArtExtras');
    if (q === 'low') {
      assert.ok(!extras || extras.children.every((c) => !c.userData || !c.userData.livingLantern));
      assert.equal(livingBudget('low').glow, false);
    }
    const stats = artStats(null, built.group);
    assert.ok(stats.callsEst >= 12, q + ' callsEst ' + stats.callsEst);
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low living callsEst ' + stats.callsEst);
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
  assert.match(tickSrc, /livingClay|livingLamp/);
});

test('Living playground keeps whoop-sized gaps that match the visuals', () => {
  installDomStub();
  const built = buildMap(THREE, 'living');
  const hit = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z);
    return built.colliders.some((bb) => bb.containsPoint(p));
  };
  const P = LIVING_PLAY;
  assert.equal(hit(P.sofa.x, 0.62, P.sofa.z), false, 'fly under sofa');
  assert.equal(hit(P.sofa.x, P.sofa.seatY + 0.08, P.sofa.z), true, 'sofa seat solid');
  assert.equal(hit(P.table.x, 0.62, P.table.z), false, 'fly under coffee table');
  assert.equal(hit(P.table.x, P.table.topY + 0.06, P.table.z), true, 'table top solid');
  assert.equal(hit(P.chair.x, 0.62, P.chair.z), false, 'fly under armchair');
  assert.equal(hit(P.tv.x, 0.62, P.tv.z), false, 'fly under TV console');
  assert.equal(hit(P.shelf.x, P.shelf.shelfYs[0] + 0.65, P.shelf.z), false, 'fly between shelves');
  assert.equal(hit(P.shelf.x, P.shelf.shelfYs[0] + 0.04, P.shelf.z), true, 'shelf slab solid');
  assert.equal(hit(P.clay.x, P.clay.y, P.clay.z), false, 'clay hoop open');
  assert.equal(hit(P.clay.x, P.clay.y + P.clay.innerH / 2 + P.clay.bar / 2, P.clay.z), true, 'clay frame solid');
  assert.equal(hit(7.3, 1.42, 9.8), false, 'fly the ottoman gap');
  assert.equal(hit(P.gap.left.x, 1.42, P.gap.left.z), true, 'gap stack solid');
  assert.equal(hit(0, 7.40, 0), false, 'fly under rafter joist');
  assert.equal(hit(0, P.rafterY + 0.08, 0), true, 'rafter joist solid');
  assert.ok(P.whoopClear >= 0.85, 'whoop clearance');
  assert.ok(P.table.topY >= 1.2, 'table crawl taller than 85mm whoop');
  assert.ok(P.table.topH <= 0.2, 'table top is a slab');
  const livingSrc = readFileSync(join(root, 'sim-art-living.js'), 'utf8');
  assert.match(livingSrc, /LIVING_PLAY/);
  assert.match(livingSrc, /planLivingKit|addPlayLines/);
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
  assert.match(garageSrc, /sim-art-felt\.js\?v=[0-9a-f]{12}/);
  assert.match(garageSrc, /feltBasic|feltEmissive/);
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
    let feltMats = 0;
    vis.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && m.userData && m.userData.feltLocked) feltMats += 1;
        if (m && m.metalness != null) assert.ok(m.metalness <= 0.05, q + ' metalness');
      }
    });
    assert.ok(feltMats >= 8, q + ' feltLocked mats ' + feltMats);
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

test('Garage playground keeps whoop-sized gaps that match the visuals', () => {
  const built = buildMap(THREE, 'garage');
  const hit = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z);
    return built.colliders.some((bb) => bb.containsPoint(p));
  };
  const P = GARAGE_PLAY;
  assert.equal(hit(P.bench.x, 1.20, P.bench.z), false, 'fly under open bench');
  assert.equal(hit(P.bench.x, P.bench.topY + 0.06, P.bench.z), true, 'bench top solid');
  assert.equal(hit(P.bench.x, P.bench.topY + P.bench.topH + 0.25, P.bench.z), false, 'fly over bench');
  assert.equal(hit(P.bench.x + P.bench.legs[0][0], 1.10, P.bench.z + P.bench.legs[0][1]), true, 'bench leg solid');
  assert.equal(hit(P.car.x, 0.65, P.car.z), false, 'fly under car');
  assert.equal(hit(P.car.x, P.car.jackH + 0.18, P.car.z), true, 'car chassis solid');
  assert.equal(hit(P.car.x, P.car.jackH + P.car.bodyH + 0.25, P.car.z), false, 'fly over car');
  const aisleZ = (P.rackA.z + P.rackB.z) / 2;
  assert.equal(hit(P.rackA.x, 1.68, aisleZ), false, 'fly between racks');
  assert.equal(hit(P.rackA.x, P.shelfYs[0] + 0.04, P.rackA.z), false, 'shelf gap thread');
  const slabOff = ((P.rackA.d - P.rackGapD) / 2 + P.rackGapD) / 2;
  assert.equal(hit(P.rackA.x, P.shelfYs[0] + 0.04, P.rackA.z - slabOff), true, 'shelf slab solid');
  assert.equal(hit(P.rackA.x, P.shelfYs[0] + 0.62, P.rackA.z), false, 'fly between shelf levels');
  assert.equal(hit(0, 1.15, P.door.z), false, 'fly under open door');
  assert.equal(hit(0, P.door.openH + 1.2, P.door.z), true, 'door panel solid');
  assert.equal(hit(P.doorGap.left.x, 1.10, P.doorGap.left.z), true, 'door stack solid');
  assert.equal(hit(P.bike.x, P.bike.y, P.bike.z), false, 'bike hoop open');
  assert.equal(hit(P.bike.x, P.bike.y + P.bike.innerH / 2 + P.bike.bar / 2, P.bike.z), true, 'bike frame solid');
  assert.equal(hit(P.volt.x, P.volt.y, P.volt.z), false, 'volt hoop open');
  assert.equal(hit(P.volt.x, P.volt.y + P.volt.innerH / 2 + P.volt.bar / 2, P.volt.z), true, 'volt frame solid');
  assert.equal(hit(P.tireWell.x, 0.85, P.tireWell.z), false, 'dive tire well');
  assert.equal(hit(P.tireStack.x, 1.10, P.tireStack.z), false, 'dive tire stack');
  assert.equal(hit(P.bench.x, 1.20, P.bench.z), false, 'bench center crawl stays open');
  assert.equal(hit(P.benchBins[0].x, 0.34, P.benchBins[0].z), true, 'bench bin solid');
  assert.equal(hit(P.toys[0].x, P.toys[0].h * 0.5, P.toys[0].z), true, 'toy clutter solid');
  assert.equal(hit(0, 6.40, P.doorSoffit.z), false, 'fly the rafter/door gap');
  assert.equal(hit(P.doorSoffit.x, P.doorSoffit.y + 0.08, P.doorSoffit.z), true, 'door soffit solid');
  assert.ok(P.whoopClear >= 0.85, 'whoop clearance');
  assert.ok(P.car.jackH >= 1.2, 'car crawl taller than 85mm whoop');
  assert.ok(P.bench.legs.length >= 4, 'open bench has legs');
  assert.ok(P.bench.topH <= 0.2, 'bench top is a slab');
  assert.ok(P.car.bodyH >= 3.5, 'sedan collider matches kit height');
  const garageSrc = readFileSync(join(root, 'sim-art-garage.js'), 'utf8');
  assert.match(garageSrc, /GARAGE_PLAY/);
  assert.match(garageSrc, /addTireWell|addLadder|addHangLights|addPlayLines/);
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
    if (q === 'low') assert.ok(stats.callsEst < 200, 'Low warehouse callsEst ' + stats.callsEst);
    assert.ok(built.group.getObjectByName('warehouseArtHero'), q + ' warehouseArtHero');
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
  assert.match(tickSrc, /warehouseIon|warehouseTube|warehouseOrb/);
});

test('Warehouse playground keeps whoop-sized gaps that match the visuals', () => {
  const built = buildMap(THREE, 'warehouse');
  const hit = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z);
    return built.colliders.some((bb) => bb.containsPoint(p));
  };
  const P = WAREHOUSE_PLAY;
  const rx = P.rackXs[1], rz = P.rackZs[1];
  assert.equal(hit(rx, 0.62, rz), false, 'fly under first shelf');
  assert.equal(hit(rx, P.shelfYs[0], rz), true, 'shelf slab solid');
  assert.equal(hit(rx, P.shelfYs[0] + 1.55, rz), false, 'fly between shelf levels');
  assert.equal(hit(rx, P.shelfYs[3] + 0.55, rz), false, 'fly over top shelf');
  assert.equal(hit(rx + P.postOffX, 2.0, rz + P.postOffZ), true, 'rack post solid');
  assert.equal(hit(-22.0, 1.10, 36.0), false, 'fly between pallet columns');
  assert.equal(hit(-24.05, 1.10, 36.0), true, 'west pallet column solid');
  assert.equal(hit(0, 1.55, -38.4), false, 'fly the crate gap');
  assert.equal(hit(P.gap.left.x, 1.55, P.gap.left.z), true, 'gap stack solid');
  assert.equal(hit(P.ion.x, P.ion.y, P.ion.z), false, 'ion hoop open');
  assert.equal(hit(P.ion.x, P.ion.y + P.ion.innerH / 2 + P.ion.bar / 2, P.ion.z), true, 'ion frame solid');
  assert.equal(hit(0, 16.25, 12.0), false, 'fly under rafter joist');
  assert.equal(hit(0, P.rafterY + 0.08, 12.0), true, 'rafter joist solid');
  assert.ok(P.whoopClear >= 0.85, 'whoop clearance');
  assert.ok(P.shelfYs[0] >= 0.85, 'under-shelf taller than 85mm whoop');
  assert.ok(P.shelfH <= 0.28, 'shelf is a slab');
  const warehouseSrc = readFileSync(join(root, 'sim-art-warehouse.js'), 'utf8');
  assert.match(warehouseSrc, /WAREHOUSE_PLAY/);
  assert.match(warehouseSrc, /planWarehouseKit|addPlayLines/);
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

test('Gym playground keeps whoop-sized gaps that match the visuals', () => {
  installDomStub();
  const built = buildMap(THREE, 'gym');
  const hit = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z);
    return built.colliders.some((bb) => bb.containsPoint(p));
  };
  const P = GYM_PLAY;
  const west0 = -P.x0;
  assert.equal(hit(west0, 0.62, 15.4), false, 'fly under first bleacher');
  assert.equal(hit(west0, P.seatYs[0] + 0.08, 15.4), true, 'bleacher plank solid');
  assert.equal(hit(west0, P.seatYs[0] + P.seatH + 0.25, 15.4), false, 'fly over first bleacher');
  assert.equal(hit(-19.4, 2.40, 0), false, 'fly through bleacher gap');
  assert.equal(hit(P.amber.x, P.amber.y, P.amber.z), false, 'amber hoop open');
  assert.equal(hit(P.amber.x, P.amber.y + P.amber.innerH / 2 + P.amber.bar / 2, P.amber.z), true, 'amber frame solid');
  assert.equal(hit(0, 1.70, 32.4), false, 'fly the equipment gap');
  assert.equal(hit(P.gap.left.x, 1.70, P.gap.left.z), true, 'gap stack solid');
  assert.equal(hit(0, 24.80, 18.0), false, 'fly under rafter joist');
  assert.equal(hit(0, P.rafterY + 0.08, 18.0), true, 'rafter joist solid');
  assert.ok(P.whoopClear >= 0.85, 'whoop clearance');
  assert.ok(P.seatYs[0] >= 1.2, 'under-bench taller than 85mm whoop');
  assert.ok(P.seatH <= 0.2, 'bleacher seat is a slab');
  const gymSrc = readFileSync(join(root, 'sim-art-gym.js'), 'utf8');
  assert.match(gymSrc, /GYM_PLAY/);
  assert.match(gymSrc, /planGymKit|addPlayLines/);
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

test('Office playground keeps whoop-sized gaps that match the visuals', () => {
  const built = buildMap(THREE, 'office');
  const hit = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z);
    return built.colliders.some((bb) => bb.containsPoint(p));
  };
  const P = OFFICE_PLAY;
  const deskX = P.cubes[3][0] + P.desk.localX;
  const deskZ = P.cubes[3][1];
  assert.equal(hit(deskX, 0.62, deskZ), false, 'fly under open desk');
  assert.equal(hit(deskX, P.desk.topY + 0.06, deskZ), true, 'desk top solid');
  assert.equal(hit(deskX, P.desk.topY + P.desk.topH + 0.25, deskZ), false, 'fly over desk');
  assert.equal(hit(deskX + P.desk.legs[0][0], 0.60, deskZ + P.desk.legs[0][1]), true, 'desk leg solid');
  assert.equal(hit(P.conf.x, 0.62, P.conf.z), false, 'fly under conference table');
  assert.equal(hit(P.conf.x, P.conf.topY + 0.06, P.conf.z), true, 'conference top solid');
  assert.equal(hit(P.reception.x, 0.62, P.reception.z), false, 'fly under reception');
  assert.equal(hit(P.sun.x, P.sun.y, P.sun.z), false, 'sun hoop open');
  assert.equal(hit(P.sun.x, P.sun.y + P.sun.innerH / 2 + P.sun.bar / 2, P.sun.z), true, 'sun frame solid');
  assert.equal(hit(4.6, 1.55, 12.4), false, 'fly the file-cabinet gap');
  assert.equal(hit(P.gap.left.x, 1.55, P.gap.left.z), true, 'gap stack solid');
  assert.equal(hit(0, 7.45, 6.0), false, 'fly under rafter joist');
  assert.equal(hit(0, P.rafterY + 0.08, 6.0), true, 'rafter joist solid');
  assert.ok(P.whoopClear >= 0.85, 'whoop clearance');
  assert.ok(P.desk.topY >= 1.2, 'desk crawl taller than 85mm whoop');
  assert.ok(P.desk.topH <= 0.2, 'desk top is a slab');
  assert.ok(P.desk.legs.length >= 4, 'open desk has legs');
  const officeSrc = readFileSync(join(root, 'sim-art-office.js'), 'utf8');
  assert.match(officeSrc, /OFFICE_PLAY/);
  assert.match(officeSrc, /planOfficeKit|addPlayLines/);
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

test("Backyard Ryan's Yard is implemented with stucco-tile gates", () => {
  assert.equal(BACKYARD_VIBE_ID, 'backyard');
  const v = VIBES.backyard;
  assert.equal(v.implemented, true);
  assert.equal(v.name, "Ryan's Yard");
  assert.equal(v.sky, 'hdri');
  assert.equal(v.time, 'afternoon');
  assert.equal(v.gates.keepBrand, false);
  assert.equal(v.gates.style, 'stucco-tile');
  assert.equal(v.post.bloom, true);
  assert.equal(v.palette.neonA.toLowerCase(), '#c45a32');
  assert.equal(v.lighting.fogColor, 0xb8d0e4);
  assert.ok(v.looks.env >= 0.36);
  assert.ok(v.looks.sun >= 0.9);
  assert.ok(v.looks.bg < v.looks.env, 'HDRI background must sit under IBL so the sky is not washed');
  assert.ok(v.lighting.exposure >= 0.62 && v.lighting.exposure <= 0.86);
  assert.ok(v.lighting.sunElevation >= 40 && v.lighting.sunElevation <= 50);
  assert.equal(v.lighting.shadowViewR, 30);
  assert.ok(v.looks.hemi >= 0.80);
  assert.ok(v.looks.env >= 1.05);
  assert.ok(v.lighting.fillIntensity >= 0.40);
  assert.ok(v.lighting.shadowIntensity > 0.4 && v.lighting.shadowIntensity < 0.75);
  assert.ok(v.post.ao >= 0.22 && v.post.ao <= 0.36);
  assert.ok(v.post.grain > 0 && v.post.grain < 0.08);
  assert.ok(v.post.vignette > 0.15 && v.post.vignette < 0.34);
  assert.equal(backyardWantsGlow('low'), false);
  assert.equal(backyardWantsGlow('med'), true);
  assert.equal(backyardBudget('low').pots < backyardBudget('high').pots, true);
  assert.equal(backyardBudget('low').glow, false);
  assert.equal(backyardBudget('med').glow, true);
});

test('backyard lighting polish: HDRI env+bg, High-only AO, grain, tight sun', () => {
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /uniform float grain/);
  assert.match(looks, /else if\(grain > 0\.001\)/);
  assert.match(looks, /!yard \|\| applied === 'high'/);
  const lighting = readFileSync(join(root, 'sim-lighting.js'), 'utf8');
  assert.match(lighting, /yard \? 0\.30/);
  assert.match(lighting, /yard \? 1\.15/);
  assert.match(lighting, /out\.background = env/);
  assert.match(looks, /HDRI_YARD_1K/);
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /function applySunFrustum/);
  assert.match(sim, /sun\.shadow\.intensity/);
  assert.match(sim, /ACESFilmicToneMapping/);
  assert.match(sim, /outputColorSpace=THREE\.SRGBColorSpace/);
  assert.match(sim, /PCFSoftShadowMap/);
  assert.match(sim, /applySunFrustum/);
  const city = readFileSync(join(root, 'sim-art-city.js'), 'utf8');
  assert.match(city, /ctx\.applySunFrustum/);
  assert.match(city, /LIGHTING\.shadowViewR/);
  assert.match(city, /LIGHTING\.shadowIntensity/);
  assert.equal(vibePost(VIBES.backyard).grain, VIBES.backyard.post.grain);
  assert.equal(MAP_LOOKS.backyard.bg, VIBES.backyard.looks.bg);
  assert.equal(MAP_LOOKS.backyard.sun, VIBES.backyard.looks.sun);
});

test('Backyard freestyle builds without throwing and the FPV frame is not all black', () => {
  installDomStub();
  const yardSrc = readFileSync(join(root, 'sim-art-backyard.js'), 'utf8');
  assert.equal(mentionsBannedAssets(yardSrc), false);
  assert.match(yardSrc, /sim-art-felt\.js\?v=[0-9a-f]{12}/);
  assert.match(yardSrc, /feltBasic|feltEmissive/);
  assert.match(yardSrc, /MeshStandardMaterial/);
  assert.match(yardSrc, /InstancedMesh|leafTex|caustic/);
  assert.match(yardSrc, /never abort the FPV render loop/);
  assert.match(yardSrc, /function agaveGeo/);
  assert.match(yardSrc, /backyardProcAgave/);
  assert.match(yardSrc, /LatheGeometry/);
  assert.match(yardSrc, /#d8d0c0|#ddd|#e[0-9a-f]{5}/);
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
    let feltMats = 0;
    vis.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && m.userData && m.userData.feltLocked) feltMats += 1;
        if (m && m.metalness != null) {
          const wet = m.userData && m.userData.heroWet;
          assert.ok(m.metalness <= (wet ? 0.35 : 0.45), q + ' metalness');
        }
      }
    });
    assert.ok(feltMats >= 8, q + ' feltLocked mats ' + feltMats);
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
    assert.doesNotThrow(() => buildRyanYard(THREE, parent, vibeFor('backyard'), q, free.gates));
  }
  const tickSrc = yardSrc.slice(
    yardSrc.indexOf('export function tickBackyardArt'),
    yardSrc.indexOf('export function restyleBackyard(THREE'),
  );
  assert.equal(/\bTHREE\b/.test(tickSrc), false, 'tickBackyardArt must not touch the THREE binding');
  assert.match(tickSrc, /backyardPalm|backyardPool/);
});

test("Backyard playground keeps whoop-sized gaps that match Ryan's Yard", () => {
  const built = buildMap(THREE, 'backyard');
  const hit = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z);
    return built.colliders.some((bb) => bb.containsPoint(p));
  };
  const P = BACKYARD_PLAY;
  assert.equal(hit(P.patio.x, 2.20, P.patio.z), false, 'fly under patio');
  assert.equal(hit(P.patio.x, P.patio.ceilY + 0.12, P.patio.z), true, 'patio ceiling solid');
  assert.equal(hit(P.pvc.x, 1.75, P.pvc.z), false, 'fly through PVC');
  assert.equal(hit(P.pvc.x + P.pvc.innerD / 2, 2.0, P.pvc.z + P.pvc.innerW / 2), true, 'PVC post solid');
  assert.equal(hit(P.pvc.x, P.pvc.midY + 0.05, P.pvc.z - P.pvc.innerW / 2), true, 'PVC rail solid');
  assert.equal(hit(P.ficus.x, 2.2, P.ficus.z), true, 'ficus trunk solid');
  assert.equal(hit(P.ficus.x + P.planter.rOut + 0.5, 2.25, P.ficus.z), false, 'spin radius open');
  assert.equal(hit(P.pool.x, 1.12, P.pool.z), false, 'skim the pool');
  assert.equal(hit(P.canopy.x, P.canopy.y, P.canopy.z), false, 'canopy hoop open');
  assert.ok(P.alley.x < 0, 'alley mirrored to west side');
  assert.ok(P.fence.z1 - P.fence.z0 >= 24, 'fence runs the full yard');
  assert.equal(hit(P.alley.x, 1.18, (P.alley.z0 + P.alley.z1) * 0.5), false, 'side alley open');
  assert.equal(hit(P.woodGate.x, 2.2, P.woodGate.z), true, 'wood gate solid');
  assert.equal(hit(P.woodGate.x, P.woodGate.h + 0.4, P.woodGate.z), false, 'pop over wood gate');
  assert.equal(hit(P.ridge.x, P.ridge.y + 0.1, P.ridge.z), true, 'ridge solid');
  assert.equal(hit(P.ac.x, 1.0, P.ac.z), true, 'AC obstacle');
  assert.equal(hit(P.fence.x, 2.0, P.fence.z0), true, 'south fence post solid');
  assert.equal(hit(P.fence.x, 2.0, P.fence.z0 + P.fence.spacing * 0.5), true, 'closed mesh panel solid');
  assert.equal(hit(P.fence.x, 1.22, P.fence.z0 + P.fence.spacing * 1.5), false, 'fence gap flyable');
  assert.equal(hit(P.fence.x, P.fence.h + 0.4, P.fence.z0 + P.fence.spacing * 0.5), false, 'pop over closed mesh');
  assert.equal(P.pvc.x, P.turf.x, 'PVC sits on turf center x');
  assert.equal(P.pvc.z, P.turf.z, 'PVC sits on turf center z');
  assert.ok(P.whoopClear >= 0.85, 'whoop clearance');
  const yardSrc = readFileSync(join(root, 'sim-art-backyard.js'), 'utf8');
  assert.match(yardSrc, /BACKYARD_PLAY/);
  assert.match(yardSrc, /addPvc|addTree|addPool|addPlayLines/);
  assert.match(yardSrc, /alphaMap/, 'pool fence uses an alpha mesh');
  assert.match(yardSrc, /cheapFence/, 'phone Low keeps a cheap fence');
  assert.match(yardSrc, /i % 2 === 0/, 'closed bays stay every other span');
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
  assert.ok(doc.includes('Felt Scale'));
});
