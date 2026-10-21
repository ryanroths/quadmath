// QuadMath sim art — original procedural vibes. Phase 1 paints City as
// Neon Current. Kenney CC0 cars/props load from sim-art-kit.js with a
// procedural fallback. Nothing here is copied from WebFPV.
// Visual only: do not push new colliders, do not move gates.

import { hexNum } from './sim-art-city.js?v=a6b4469c954b';
export {
  FELT_SCALE, applyFeltMaterial, feltBasic, feltClay, feltEmissive,
  studioPhoneBudget, qualityWantsStudioBloom,
} from './sim-art-felt.js?v=f76fc4f752df';
export {
  hexNum, qualityWantsBloom, qualityWantsAo, qualityWantsGrade,
  qualityWantsReflections, qualityWantsParticles,
  qualityBudget, propClearOfCourse, planCityProps, planPortalBlocks,
  collectBuildingFootprints,
  hideStockCityMeshes, decorateVibeGate, pulseCityGate, tickCityArt,
  applySkyTexture, applyVibeLighting, applyResolvedLighting, disposeArtGroup,
  restyleCity, buildCityDressing,
  buildDreamlandArt, restyleMesas, restyleLandmarks, restyleDiveTubes, attachWetReflector,
  makeWetRoadMaterial, buildNeonCity,
  SIGN_WORDS, GATE_STYLES, BRAND_BLOCKLIST, signsAreOriginal, RAIN_KEY,
  loadRain, saveRain, distToSeg, pointHitsGate,
  CAR_TYPES, carTypeForSeed, carYawFromDir, carHeading, makeCarGeo,
} from './sim-art-city.js?v=a6b4469c954b';
export {
  LIVING_STOCK, LIVING_KEEP_GATES, livingWantsGlow, livingBudget, planLivingKit,
  hideStockLivingMeshes, restyleLivingShell, buildClayParlor,
  decorateLivingGate, pulseLivingGate, tickLivingArt, restyleLiving,
} from './sim-art-living.js?v=0d8377e9ae06';
export {
  GARAGE_STOCK, GARAGE_KEEP_GATES, garageWantsGlow, garageBudget, planGarageKit,
  hideStockGarageMeshes, restyleGarageShell, buildVoltStall,
  decorateGarageGate, pulseGarageGate, tickGarageArt, restyleGarage,
} from './sim-art-garage.js?v=dab82a4ea98a';
export {
  WAREHOUSE_STOCK, WAREHOUSE_KEEP_GATES, warehouseWantsGlow, warehouseBudget, planWarehouseKit,
  hideStockWarehouseMeshes, restyleWarehouseShell, buildIonNave,
  decorateWarehouseGate, pulseWarehouseGate, tickWarehouseArt, restyleWarehouse,
} from './sim-art-warehouse.js?v=86abd6bd7ac6';

export {
  GYM_STOCK, GYM_KEEP_GATES, gymWantsGlow, gymBudget,
  hideStockGymMeshes, restyleGymShell, buildAmberCourt,
  decorateGymGate, pulseGymGate, tickGymArt, restyleGym,
  planGymKit,
} from './sim-art-gym.js?v=3023746823f0';

export {
  OFFICE_STOCK, OFFICE_KEEP_GATES, officeWantsGlow, officeBudget, planOfficeKit,
  hideStockOfficeMeshes, restyleOfficeShell, buildPaperSun,
  decorateOfficeGate, pulseOfficeGate, tickOfficeArt, restyleOffice,
} from './sim-art-office.js?v=9fb8905111ad';

export {
  TRAINER_STOCK, TRAINER_KEEP_GATES, trainerWantsGlow, trainerBudget,
  hideStockTrainerMeshes, restyleTrainerShell, buildLicoriceGrid,
  decorateTrainerGate, pulseTrainerGate, tickTrainerArt, restyleTrainer,
} from './sim-art-trainer.js?v=a27e433fcc6b';

export {
  BACKYARD_STOCK, BACKYARD_KEEP_GATES, backyardWantsGlow, backyardBudget,
  hideStockBackyardMeshes, restyleBackyardShell, buildRyanYard, buildJadeLot,
  decorateBackyardGate, pulseBackyardGate, tickBackyardArt, restyleBackyard,
} from './sim-art-backyard.js?v=f506ce416fab';

export {
  ROOM_STOCK, ROOM_KEEP_GATES, roomWantsGlow, roomBudget,
  hideStockRoomMeshes, restyleRoomShell, buildPocketStage,
  decorateRoomGate, pulseRoomGate, tickRoomArt, restyleRoom,
} from './sim-art-room.js?v=e20a2a338a0e';
export {
  tryDressCityKit, kitBytesForQuality, CITY_KIT_CARS, CITY_KIT_PROPS,
  tryDressGarageKit, garageKitBytesForQuality, GARAGE_KIT_CORE, GARAGE_KIT_EXTRA, GARAGE_KIT_SKIP,
  tryDressWarehouseKit, warehouseKitBytesForQuality, WAREHOUSE_KIT_CORE, WAREHOUSE_KIT_EXTRA,
  tryDressOfficeKit, officeKitBytesForQuality, OFFICE_KIT_CORE, OFFICE_KIT_EXTRA,
  tryDressGymKit, gymKitBytesForQuality, GYM_KIT_CORE, GYM_KIT_EXTRA,
  tryDressLivingKit, livingKitBytesForQuality, LIVING_KIT_CORE, LIVING_KIT_EXTRA,
} from './sim-art-kit.js?v=d8add914ed4e';

export const CITY_VIBE_ID = 'city';
export const LIVING_VIBE_ID = 'living';
export const GARAGE_VIBE_ID = 'garage';
export const WAREHOUSE_VIBE_ID = 'warehouse';
export const GYM_VIBE_ID = 'gym';
export const OFFICE_VIBE_ID = 'office';
export const TRAINER_VIBE_ID = 'trainer';
export const BACKYARD_VIBE_ID = 'backyard';
export const ROOM_VIBE_ID = 'room';


export const VIBES = Object.freeze({
  city: Object.freeze({
    id: 'city',
    name: 'Neon Current',
    tagline: 'Synthwave night grid, rain-slick streets, bloom on the gates',
    implemented: true,
    time: 'night',
    sky: 'gradient',
    palette: Object.freeze({
      void: '#070014',
      zenith: '#1a0533',
      horizon: '#ff2bd6',
      dusk: '#ff6b3d',
      street: '#0c0a12',
      sidewalk: '#16101c',
      lane: '#ff3cac',
      laneAlt: '#00f0ff',
      facade: '#120816',
      facadeAlt: '#1a1028',
      windowOn: '#ffd36a',
      windowAlt: '#5ce1ff',
      neonA: '#ff2bd6',
      neonB: '#00f0ff',
      neonC: '#ff7a18',
      mesa: '#3a1840',
      gateA: '#FF4D1A',
      gateB: '#3DDC97',
    }),
    lighting: Object.freeze({
      sunColor: 0x88a0ff,
      sunIntensity: 0.30,
      fillColor: 0xff2bd6,
      fillIntensity: 0.16,
      hemiSky: 0x3a1870,
      hemiGround: 0x1a0820,
      hemiIntensity: 0.56,
      exposure: 0.58,
      fogColor: 0x1a0830,
      fogDensity: 0.00112,
      bloomStrength: 0.42,
      bloomRadius: 0.36,
      bloomThreshold: 0.90,
      gateEmissive: 5.4,
      gateEmissiveActive: 7.2,
    }),
    looks: Object.freeze({ fog: 0.00112, sun: 0.30, env: 0.18, bg: 0.16, hemi: 0.56 }),
    gates: Object.freeze({ style: 'unique-neon', keepBrand: true }),
    props: Object.freeze([
      'setback towers', 'window shader', 'blade signs', 'wet street',
      'parked cars', 'benches', 'kiosks', 'steam vents', 'rain', 'moon',
      'open interiors', 'spin grove', 'roof holes', 'alley gaps',
    ]),
    post: Object.freeze({
      bloom: true, analog: false, grade: true,
      lift: Object.freeze([0.018, 0.0, 0.046]),
      gamma: 0.90,
      gain: Object.freeze([1.08, 0.94, 1.14]),
      vignette: 0.46,
      ao: 0.48,
    }),
  }),
  living: Object.freeze({
    id: 'living',
    name: 'Clay Parlor',
    tagline: 'Felt Scale reference: candy-clay living room, gummy lamp, felt bounce',
    implemented: true,
    time: 'overcast day',
    sky: 'none',
    palette: Object.freeze({
      void: '#f4d6c6', zenith: '#7ec8e3', horizon: '#ffe08a', dusk: '#ff6b9a',
      street: '#d8c2a8', sidewalk: '#eee4d4', lane: '#ff6b9a', laneAlt: '#7ec8e3',
      facade: '#f4d6c6', facadeAlt: '#efe0d0', windowOn: '#ffe08a', windowAlt: '#7ec8e3',
      neonA: '#ff6b9a', neonB: '#7ec8e3', neonC: '#ffe08a', mesa: '#c9a87a',
      gateA: '#ff6b9a', gateB: '#7ec8e3',
    }),
    lighting: Object.freeze({
      sunColor: 0xffe0c0, sunIntensity: 0.36, fillColor: 0xffe08a, fillIntensity: 0.22,
      hemiSky: 0x7ec8e3, hemiGround: 0xf4d6c6, hemiIntensity: 0.68,
      exposure: 0.74, fogColor: 0xf0e4d4, fogDensity: 0.0052,
      bloomStrength: 0, bloomRadius: 0.28, bloomThreshold: 0.92,
      gateEmissive: 2.4, gateEmissiveActive: 3.4,
    }),
    looks: Object.freeze({ fog: 0.0052, sun: 0.36, env: 0.18, bg: 0.42, hemi: 0.68 }),
    gates: Object.freeze({ style: 'clay-ring', keepBrand: false }),
    props: Object.freeze(['felt sofa', 'gummy lamp', 'block bookshelf', 'clay banner', 'felt nook']),
    post: Object.freeze({
      bloom: false, analog: false,
      lift: Object.freeze([0.06, 0.028, 0.010]),
      gamma: 1.06,
      gain: Object.freeze([1.14, 1.02, 0.88]),
      vignette: 0.20,
      ao: 0.28,
    }),
  }),
  garage: Object.freeze({
    id: 'garage',
    name: 'Volt Stall',
    tagline: 'Night workshop, sodium spill, cyan work tubes',
    implemented: true,
    time: 'night',
    sky: 'none',
    palette: Object.freeze({
      void: '#14161c', zenith: '#1c2430', horizon: '#ffb347', dusk: '#2de2e6',
      street: '#1a1c20', sidewalk: '#2a2c30', lane: '#ffb347', laneAlt: '#2de2e6',
      facade: '#3d4654', facadeAlt: '#2a3038', windowOn: '#ffb347', windowAlt: '#2de2e6',
      neonA: '#ffb347', neonB: '#2de2e6', neonC: '#c45a22', mesa: '#2a2c30',
      gateA: '#ffb347', gateB: '#2de2e6',
    }),
    lighting: Object.freeze({
      sunColor: 0xffb347, sunIntensity: 0.2, fillColor: 0x2de2e6, fillIntensity: 0.22,
      hemiSky: 0x1c2430, hemiGround: 0x14161c, hemiIntensity: 0.60,
      exposure: 0.55, fogColor: 0x14161c, fogDensity: 0.003,
      bloomStrength: 0.7, bloomRadius: 0.4, bloomThreshold: 0.9,
      gateEmissive: 5.2, gateEmissiveActive: 7,
    }),
    looks: Object.freeze({ fog: 0.003, sun: 0.2, env: 0.26, bg: 0.28, hemi: 0.60 }),
    gates: Object.freeze({ style: 'square-neon', keepBrand: false }),
    props: Object.freeze(['jacked car', 'open bench', 'shelf gaps', 'bike rim', 'tire stack']),
    post: Object.freeze({
      bloom: true, analog: false,
      lift: Object.freeze([0.03, 0.01, 0.0]),
      gamma: 0.94,
      gain: Object.freeze([1.12, 0.96, 0.88]),
      vignette: 0.40,
      ao: 0.50,
    }),
  }),
  warehouse: Object.freeze({
    id: 'warehouse',
    name: 'Ion Nave',
    tagline: 'Bioluminescent rack cathedral, teal aisle runners',
    implemented: true,
    time: 'windowless',
    sky: 'none',
    palette: Object.freeze({
      void: '#0b1218', zenith: '#102028', horizon: '#39ffb0', dusk: '#7a5cff',
      street: '#12181e', sidewalk: '#1b2228', lane: '#39ffb0', laneAlt: '#7a5cff',
      facade: '#1b3a4a', facadeAlt: '#163040', windowOn: '#39ffb0', windowAlt: '#7a5cff',
      neonA: '#39ffb0', neonB: '#7a5cff', neonC: '#c45a22', mesa: '#1b3a4a',
      gateA: '#39ffb0', gateB: '#7a5cff',
    }),
    lighting: Object.freeze({
      sunColor: 0x7a5cff, sunIntensity: 0.26, fillColor: 0x39ffb0, fillIntensity: 0.14,
      hemiSky: 0x1a3040, hemiGround: 0x0b1218, hemiIntensity: 0.4,
      exposure: 0.6, fogColor: 0x0b1218, fogDensity: 0.0014,
      bloomStrength: 0.65, bloomRadius: 0.4, bloomThreshold: 0.88,
      gateEmissive: 5.5, gateEmissiveActive: 7.2,
    }),
    looks: Object.freeze({ fog: 0.0014, sun: 0.26, env: 0.32, bg: 0.18, hemi: 0.4 }),
    gates: Object.freeze({ style: 'hex-frame', keepBrand: false }),
    props: Object.freeze(['aisle arrows', 'rack edges', 'spore cans', 'ion sign', 'loft spores']),
    post: Object.freeze({
      bloom: true, analog: false,
      lift: Object.freeze([0.0, 0.028, 0.04]),
      gamma: 0.90,
      gain: Object.freeze([0.92, 1.06, 1.12]),
      vignette: 0.38,
      ao: 0.48,
    }),
  }),
  backyard: Object.freeze({
    id: 'backyard',
    name: "Ryan's Yard",
    tagline: 'Warm overcast Phoenix backyard, turf, pool, PVC gate',
    implemented: true,
    time: 'overcast afternoon',
    sky: 'gradient',
    palette: Object.freeze({
      void: '#c8b89a', zenith: '#8eb4c8', horizon: '#e8c9a0', dusk: '#c45a32',
      street: '#3f8a4a', sidewalk: '#c2b39a', lane: '#2ec4b6', laneAlt: '#e8d4a8',
      facade: '#c4a882', facadeAlt: '#b89a72', windowOn: '#1a2430', windowAlt: '#2a3540',
      neonA: '#c45a32', neonB: '#2ec4b6', neonC: '#3f8a4a', mesa: '#e8a04a',
      gateA: '#c45a32', gateB: '#2ec4b6',
    }),
    lighting: Object.freeze({
      sunColor: 0xffe0b8, sunIntensity: 0.40, fillColor: 0xc8b89a, fillIntensity: 0.18,
      hemiSky: 0x8eb4c8, hemiGround: 0xc4a882, hemiIntensity: 0.62,
      exposure: 0.68, fogColor: 0xd4c4a8, fogDensity: 0.0018,
      bloomStrength: 0.12, bloomRadius: 0.22, bloomThreshold: 0.88,
      gateEmissive: 1.6, gateEmissiveActive: 2.4,
    }),
    looks: Object.freeze({ fog: 0.0018, sun: 0.40, env: 0.22, bg: 0.42, hemi: 0.62 }),
    gates: Object.freeze({ style: 'stucco-tile', keepBrand: false }),
    props: Object.freeze(['PVC gate', 'kidney pool', 'ficus planter', 'umbrella arch', 'side alley']),
    post: Object.freeze({
      bloom: false, analog: false,
      lift: Object.freeze([0.02, 0.016, 0.0]),
      gamma: 1.02,
      gain: Object.freeze([1.08, 1.02, 0.92]),
      vignette: 0.28,
      ao: 0.28,
    }),
  }),
  office: Object.freeze({
    id: 'office',
    name: 'Paper Sun',
    tagline: 'Toon-shaded morning office, hard shadows, primary hoops',
    implemented: true,
    time: 'morning',
    sky: 'none',
    palette: Object.freeze({
      void: '#fff4d2', zenith: '#9ad4ff', horizon: '#ffd27a', dusk: '#ff5c5c',
      street: '#e8e0d0', sidewalk: '#fff4d2', lane: '#3d7dff', laneAlt: '#ff5c5c',
      facade: '#fff4d2', facadeAlt: '#f0e8d4', windowOn: '#3d7dff', windowAlt: '#2ae59b',
      neonA: '#ff5c5c', neonB: '#3d7dff', neonC: '#2ae59b', mesa: '#e8d8b0',
      gateA: '#ff5c5c', gateB: '#3d7dff',
    }),
    lighting: Object.freeze({
      sunColor: 0xfff0c8, sunIntensity: 1.1, fillColor: 0x9ad4ff, fillIntensity: 0.18,
      hemiSky: 0x9ad4ff, hemiGround: 0xfff4d2, hemiIntensity: 0.55,
      exposure: 0.72, fogColor: 0xfff4d2, fogDensity: 0.0012,
      bloomStrength: 0.22, bloomRadius: 0.24, bloomThreshold: 0.86,
      gateEmissive: 2.8, gateEmissiveActive: 3.8,
    }),
    looks: Object.freeze({ fog: 0.0012, sun: 1.1, env: 0.6, bg: 0.5, hemi: 0.55 }),
    gates: Object.freeze({ style: 'toon-hoop', keepBrand: false }),
    props: Object.freeze(['flat cubicles', 'bold decals', 'paper plants', 'sun lantern', 'paper loft']),
    post: Object.freeze({
      bloom: false, analog: false,
      lift: Object.freeze([0.02, 0.018, 0.0]),
      gamma: 1.04,
      gain: Object.freeze([1.06, 1.02, 0.96]),
      vignette: 0.22,
      ao: 0.32,
    }),
  }),
  gym: Object.freeze({
    id: 'gym',
    name: 'Amber Court',
    tagline: 'Golden-hour gym, honey wood, long sun on the paint',
    implemented: true,
    time: 'golden hour',
    sky: 'none',
    palette: Object.freeze({
      void: '#2a1a0c', zenith: '#f0b14b', horizon: '#ffd27a', dusk: '#c45a22',
      street: '#6a4224', sidewalk: '#8a5a30', lane: '#fff6d8', laneAlt: '#f0b14b',
      facade: '#b8b4aa', facadeAlt: '#8a8e94', windowOn: '#fff6d8', windowAlt: '#f0b14b',
      neonA: '#f0b14b', neonB: '#fff6d8', neonC: '#c45a22', mesa: '#6a4224',
      gateA: '#f0b14b', gateB: '#fff6d8',
    }),
    lighting: Object.freeze({
      sunColor: 0xffd27a, sunIntensity: 1.05, fillColor: 0xfff6d8, fillIntensity: 0.22,
      hemiSky: 0xf0b14b, hemiGround: 0x6a4224, hemiIntensity: 0.58,
      exposure: 0.64, fogColor: 0xc9a57a, fogDensity: 0.001,
      bloomStrength: 0.4, bloomRadius: 0.35, bloomThreshold: 1.0,
      gateEmissive: 3.6, gateEmissiveActive: 5,
    }),
    looks: Object.freeze({ fog: 0.001, sun: 1.05, env: 0.7, bg: 0.44, hemi: 0.58 }),
    gates: Object.freeze({ style: 'brass-wood', keepBrand: false }),
    props: Object.freeze(['honey bleachers', 'glow rims', 'dust motes', 'scoreboard', 'sideline clutter']),
    post: Object.freeze({
      bloom: true, analog: false,
      lift: Object.freeze([0.04, 0.018, 0.0]),
      gamma: 0.95,
      gain: Object.freeze([1.12, 1.04, 0.86]),
      vignette: 0.34,
      ao: 0.38,
    }),
  }),
  trainer: Object.freeze({
    id: 'trainer',
    name: 'Licorice Grid',
    tagline: 'Candy tape on a night meet floor, clay PVC frames',
    implemented: true,
    time: 'indoor night',
    sky: 'none',
    palette: Object.freeze({
      void: '#1a1020', zenith: '#2a1830', horizon: '#ff4d8d', dusk: '#ffe08a',
      street: '#1a1020', sidewalk: '#2a1830', lane: '#ff4d8d', laneAlt: '#00e5ff',
      facade: '#c8c4ba', facadeAlt: '#2a2c32', windowOn: '#ffe08a', windowAlt: '#00e5ff',
      neonA: '#ff4d8d', neonB: '#00e5ff', neonC: '#ffe08a', mesa: '#2a1830',
      gateA: '#ff4d8d', gateB: '#00e5ff',
    }),
    lighting: Object.freeze({
      sunColor: 0xffe08a, sunIntensity: 0.35, fillColor: 0xff4d8d, fillIntensity: 0.16,
      hemiSky: 0x2a1830, hemiGround: 0x1a1020, hemiIntensity: 0.36,
      exposure: 0.58, fogColor: 0x1a1020, fogDensity: 0.0028,
      bloomStrength: 0.45, bloomRadius: 0.35, bloomThreshold: 0.95,
      gateEmissive: 4.4, gateEmissiveActive: 6,
    }),
    looks: Object.freeze({ fog: 0.0028, sun: 0.35, env: 0.48, bg: 0.3, hemi: 0.36 }),
    gates: Object.freeze({ style: 'candy-torus', keepBrand: false }),
    props: Object.freeze(['candy tape', 'clay cones', 'gummy frames', 'meet sign', 'tape rolls']),
    post: Object.freeze({
      bloom: true, analog: false,
      lift: Object.freeze([0.03, 0.0, 0.04]),
      gamma: 0.93,
      gain: Object.freeze([1.10, 0.94, 1.08]),
      vignette: 0.40,
      ao: 0.44,
    }),
  }),
  room: Object.freeze({
    id: 'room',
    name: 'Pocket Stage',
    tagline: 'Clay diorama bedroom, desk-lamp key, felt rings',
    implemented: true,
    time: 'desk lamp',
    sky: 'none',
    palette: Object.freeze({
      void: '#eee8de', zenith: '#7ec8e3', horizon: '#ffb3c7', dusk: '#7a5130',
      street: '#7a5130', sidewalk: '#eee8de', lane: '#ffb3c7', laneAlt: '#7ec8e3',
      facade: '#eee8de', facadeAlt: '#d8d2c6', windowOn: '#7ec8e3', windowAlt: '#ffb3c7',
      neonA: '#ffb3c7', neonB: '#7ec8e3', neonC: '#ffe08a', mesa: '#7a5130',
      gateA: '#ffb3c7', gateB: '#7ec8e3',
    }),
    lighting: Object.freeze({
      sunColor: 0xffe6c4, sunIntensity: 0.36, fillColor: 0xffb3c7, fillIntensity: 0.2,
      hemiSky: 0xeee8de, hemiGround: 0x7a5130, hemiIntensity: 0.48,
      exposure: 0.64, fogColor: 0xeee8de, fogDensity: 0.0036,
      bloomStrength: 0.24, bloomRadius: 0.26, bloomThreshold: 0.84,
      gateEmissive: 2.2, gateEmissiveActive: 3.2,
    }),
    looks: Object.freeze({ fog: 0.0045, sun: 0.28, env: 0.5, bg: 0.32, hemi: 0.42 }),
    gates: Object.freeze({ style: 'felt-ring', keepBrand: false }),
    props: Object.freeze(['felt furniture', 'night window', 'desk lamp', 'stage banner', 'under-bed nook']),
    post: Object.freeze({
      bloom: false, analog: false,
      lift: Object.freeze([0.03, 0.02, 0.01]),
      gamma: 1.00,
      gain: Object.freeze([1.08, 0.98, 0.90]),
      vignette: 0.30,
      ao: 0.36,
    }),
  }),
});

export const MAP_VIBE_IDS = Object.freeze([
  'city', 'living', 'garage', 'warehouse', 'backyard', 'office', 'gym', 'trainer', 'room',
]);

export function vibeFor(mapId) {
  return VIBES[mapId] || VIBES.city;
}

// One lighting spec per map. Host + looks apply this instead of writing
// fog / background / IBL from six call sites.
export function resolveMapLighting(mapId) {
  const id = VIBES[mapId] ? mapId : 'city';
  const vibe = VIBES[id];
  const L = vibe.lighting;
  return Object.freeze({
    mapId: id,
    sky: vibe.sky,
    citySky: id === 'city',
    outdoorSky: id === 'city' || id === 'backyard',
    sunSprite: false,
    lighting: L,
    looks: vibe.looks,
    post: vibe.post,
    bgHex: id === 'city' ? 0x070014 : L.fogColor,
    envIntensity: id === 'city' ? 0 : (vibe.looks && vibe.looks.env),
    keepHdrEnv: id !== 'city',
  });
}

export function vibePost(vibe) {
  const p = (vibe && vibe.post) || {};
  return {
    lift: p.lift || [0, 0, 0],
    gamma: p.gamma == null ? 1 : p.gamma,
    gain: p.gain || [1, 1, 1],
    vignette: p.vignette == null ? 0.34 : p.vignette,
    ao: p.ao == null ? 0.4 : p.ao,
    gradeAmt: p.grade === false ? 0 : 1,
    bloom: p.bloom !== false,
  };
}

// In-world floating text (START / PORTAL / DIVE / coach / rival). Canvas
// sprites used to show a solid black rectangle: leftover RGB=0 texels plus
// ACES tone-map, default mipmaps, and depthWrite. Punch the backdrop out
// here so every caller stays box-free. Outline / glow stay for distance.
export const WORLD_LABEL = Object.freeze({
  width: 256,
  height: 64,
  alphaTest: 0.08,
});

export function paintWorldLabel(ctx, text, opts) {
  const o = opts || {};
  const w = o.width || WORLD_LABEL.width;
  const h = o.height || WORLD_LABEL.height;
  ctx.clearRect(0, 0, w, h);
  ctx.font = o.font || 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const strokeW = o.strokeWidth != null ? o.strokeWidth : 8;
  if (strokeW > 0) {
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = o.stroke || 'rgba(0,0,0,0.92)';
    ctx.strokeText(String(text), w / 2, h / 2);
  }
  const fill = o.fill || '#ffffff';
  const glow = o.glow || fill;
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = o.glowBlur != null ? o.glowBlur : 12;
    ctx.fillStyle = fill;
    ctx.fillText(String(text), w / 2, h / 2);
    ctx.restore();
  }
  ctx.fillStyle = fill;
  ctx.fillText(String(text), w / 2, h / 2);
}

export function makeWorldLabelTexture(THREE, text, opts) {
  const o = opts || {};
  const w = o.width || WORLD_LABEL.width;
  const h = o.height || WORLD_LABEL.height;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paintWorldLabel(cv.getContext('2d', { alpha: true }), text, Object.assign({ width: w, height: h }, o));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function worldLabelMaterial(THREE, map, extra) {
  return new THREE.SpriteMaterial(Object.assign({
    map: map || null,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    alphaTest: WORLD_LABEL.alphaTest,
    toneMapped: false,
    fog: false,
  }, extra || {}));
}

export function makeWorldLabel(THREE, text, opts) {
  const o = opts || {};
  const spr = new THREE.Sprite(worldLabelMaterial(THREE, makeWorldLabelTexture(THREE, text, o)));
  if (o.scale != null) {
    if (typeof o.scale === 'number') spr.scale.set(o.scale, o.scale * 0.25, 1);
    else if (Array.isArray(o.scale)) spr.scale.set(o.scale[0], o.scale[1], 1);
    else spr.scale.set(o.scale.x, o.scale.y, 1);
  }
  if (o.position) {
    if (o.position.isVector3) spr.position.copy(o.position);
    else spr.position.set(o.position.x || 0, o.position.y || 0, o.position.z || 0);
  }
  return spr;
}

export function setWorldLabelText(THREE, sprite, text, opts) {
  if (!sprite || !sprite.material) return sprite;
  if (sprite.material.map) sprite.material.map.dispose();
  sprite.material.map = makeWorldLabelTexture(THREE, text, opts);
  sprite.material.transparent = true;
  sprite.material.depthWrite = false;
  sprite.material.depthTest = false;
  sprite.material.alphaTest = WORLD_LABEL.alphaTest;
  sprite.material.toneMapped = false;
  sprite.material.needsUpdate = true;
  return sprite;
}

export function buildMoodScene(THREE, vibeId) {
  const vibe = vibeFor(vibeId);
  const g = new THREE.Group();
  g.name = 'mood_' + vibe.id;
  g.userData.vibe = vibe;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.MeshStandardMaterial({
      color: hexNum(vibe.palette.street),
      roughness: 0.9,
      emissive: hexNum(vibe.palette.neonA),
      emissiveIntensity: 0.12,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(8, 16, 8),
    new THREE.MeshStandardMaterial({
      color: hexNum(vibe.palette.facade),
      emissive: hexNum(vibe.palette.neonB),
      emissiveIntensity: 0.85,
      roughness: 0.55,
    }),
  );
  wall.position.set(-8, 8, -6);
  g.add(wall);
  const wall2 = wall.clone();
  wall2.position.set(10, 6, -10);
  wall2.scale.set(0.7, 0.75, 0.7);
  wall2.material = wall.material.clone();
  wall2.material.emissive.setHex(hexNum(vibe.palette.neonA));
  g.add(wall2);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(48, 0.08, 0.35),
    new THREE.MeshStandardMaterial({
      color: hexNum(vibe.palette.lane),
      emissive: hexNum(vibe.palette.lane),
      emissiveIntensity: 3.2,
    }),
  );
  stripe.position.set(0, 0.06, 4);
  g.add(stripe);
  const gate = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.16, 10, 28),
    new THREE.MeshStandardMaterial({
      color: hexNum(vibe.palette.gateA),
      emissive: hexNum(vibe.palette.gateA),
      emissiveIntensity: 6.2,
      roughness: 0.25,
    }),
  );
  gate.position.set(0, 2.6, 6);
  g.add(gate);
  const accent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 5.5, 8),
    new THREE.MeshStandardMaterial({
      color: hexNum(vibe.palette.neonC),
      emissive: hexNum(vibe.palette.neonC),
      emissiveIntensity: 4.4,
    }),
  );
  accent.position.set(4.5, 2.75, 3);
  g.add(accent);
  const hemi = new THREE.HemisphereLight(hexNum(vibe.palette.zenith), hexNum(vibe.palette.street), 1.1);
  g.add(hemi);
  const key = new THREE.PointLight(hexNum(vibe.palette.neonA), 36, 50, 2);
  key.position.set(2, 8, 8);
  g.add(key);
  const fill = new THREE.PointLight(hexNum(vibe.palette.neonB), 22, 40, 2);
  fill.position.set(-6, 6, 4);
  g.add(fill);
  return g;
}

const TICK_SKIP = /^(cityRain|citySteam|cityWet|cityTrails|cityCruise|cityCurrent|cityDrone|livingLamp|livingLantern|livingSteam|livingScreen|livingClay|garageTube|garageSpark|garageSign|garageFan|warehouseTube|warehouseOrb|warehouseIon|gymRim|gymDust|gymBanner|gymCan|officeScreen|officePlant|officeSun|officePlane|officeBlind|trainerBulb|trainerSpark|trainerFrame|trainerSign|backyardPalm|backyardPool|roomLamp|roomStage|roomMobile)$/;

function artTickUserData(o) {
  const u = o && o.userData;
  if (!u) return false;
  for (const k in u) {
    if (u[k] && TICK_SKIP.test(k)) return true;
  }
  const mu = o.material && o.material.userData;
  return !!(mu && (mu.cityHolo || mu.cityWindow || mu.cityBlink));
}

export function mergeStaticArt(THREE, root) {
  if (!THREE || !root) return 0;
  let visuals = null;
  root.traverse((o) => {
    if (!visuals && o.name && /ArtVisuals$/.test(o.name)) visuals = o;
  });
  const host = visuals || root;
  const buckets = new Map();
  const doomed = [];
  host.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.visible === false) return;
    if (o.userData && (o.userData.artInstanced || o.userData.artKeep || o.userData.cityKit || o.userData.mergedStatic)) return;
    if (artTickUserData(o)) return;
    if (!o.geometry || !o.material || Array.isArray(o.material)) return;
    const key = o.material.uuid + ':' + (!!o.castShadow) + ':' + (!!o.receiveShadow);
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(o);
  });
  let merged = 0;
  buckets.forEach((list) => {
    if (list.length < 2) return;
    const geos = [];
    for (const o of list) {
      const g = o.geometry.clone();
      o.updateWorldMatrix(true, false);
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
    }
    const pos = [], nor = [];
    for (const g of geos) {
      const src = g.index ? g.toNonIndexed() : g;
      const p = src.getAttribute('position');
      const n = src.getAttribute('normal');
      if (!p) {
        if (src !== g) src.dispose();
        g.dispose();
        continue;
      }
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
        else nor.push(0, 1, 0);
      }
      if (src !== g) src.dispose();
      g.dispose();
    }
    if (!pos.length) return;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mesh = new THREE.Mesh(out, list[0].material);
    mesh.castShadow = !!list[0].castShadow;
    mesh.receiveShadow = !!list[0].receiveShadow;
    mesh.userData.mergedStatic = true;
    mesh.userData.artKeep = true;
    host.add(mesh);
    for (const o of list) doomed.push(o);
    merged += list.length;
  });
  for (const o of doomed) {
    if (o.parent) o.parent.remove(o);
    if (o.geometry) o.geometry.dispose();
  }
  if (host.userData) host.userData.artTickers = null;
  if (root.userData) root.userData.artTickers = null;
  return merged;
}

export function artTickList(root, now, fn, filter) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      if (filter ? filter(o) : artTickUserData(o)) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { fn(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

export function artStats(renderer, root) {
  const info = renderer && renderer.info && renderer.info.render
    ? renderer.info.render
    : { calls: 0, triangles: 0 };
  let instanced = 0, instancedMeshes = 0, meshes = 0, points = 0, lines = 0;
  if (root) {
    root.traverse((o) => {
      if (o.visible === false) return;
      if (o.isInstancedMesh) {
        instancedMeshes += 1;
        instanced += o.count || 0;
      } else if (o.isMesh) meshes += 1;
      else if (o.isPoints) points += 1;
      else if (o.isLine || o.isLineSegments) lines += 1;
    });
  }
  return {
    calls: info.calls || 0,
    callsEst: meshes + instancedMeshes + points + lines,
    triangles: info.triangles || 0,
    instanced,
    instancedMeshes,
    meshes,
    points,
    lines,
  };
}

export function mentionsBannedAssets(src) {
  const s = String(src || '');
  return /\.glb|low_poly_city|costoWRLD|tree-large|truck-green|WebFPV|webfpv/i.test(s);
}

export function vibeTable() {
  return MAP_VIBE_IDS.map((id) => {
    const v = VIBES[id];
    return {
      map: id,
      name: v.name,
      time: v.time,
      sky: v.sky,
      fog: '#' + v.lighting.fogColor.toString(16).padStart(6, '0'),
      neonA: v.palette.neonA,
      neonB: v.palette.neonB,
      implemented: !!v.implemented,
    };
  });
}
