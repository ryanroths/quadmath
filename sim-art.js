// QuadMath sim art — original procedural vibes. Phase 1 paints City as
// Neon Current. No third-party meshes. Nothing here is copied from WebFPV.
// Visual only: do not push new colliders, do not move gates.

import { hexNum } from './sim-art-city.js?v=f9b685371abd';
export {
  hexNum, qualityWantsBloom, qualityWantsReflections, qualityWantsParticles,
  qualityBudget, propClearOfCourse, planCityProps, collectBuildingFootprints,
  hideStockCityMeshes, decorateVibeGate, pulseCityGate, tickCityArt,
  applySkyTexture, applyVibeLighting, restyleCity, buildCityDressing,
  buildDreamlandArt, restyleMesas, restyleLandmarks, attachWetReflector,
  makeWetRoadMaterial, buildNeonCity,
  SIGN_WORDS, GATE_STYLES, BRAND_BLOCKLIST, signsAreOriginal, RAIN_KEY,
  loadRain, saveRain, distToSeg, pointHitsGate,
} from './sim-art-city.js?v=f9b685371abd';

export const CITY_VIBE_ID = 'city';


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
      hemiIntensity: 0.44,
      exposure: 0.58,
      fogColor: 0x1a0830,
      fogDensity: 0.00112,
      bloomStrength: 0.42,
      bloomRadius: 0.36,
      bloomThreshold: 0.90,
      gateEmissive: 5.4,
      gateEmissiveActive: 7.2,
    }),
    looks: Object.freeze({ fog: 0.00112, sun: 0.30, env: 0.18, bg: 0.16, hemi: 0.44 }),
    gates: Object.freeze({ style: 'unique-neon', keepBrand: true }),
    props: Object.freeze([
      'setback towers', 'window shader', 'blade signs', 'wet street',
      'parked cars', 'benches', 'kiosks', 'steam vents', 'rain', 'moon',
    ]),
    post: Object.freeze({ bloom: true, analog: false, grade: true }),
  }),
  living: Object.freeze({
    id: 'living',
    name: 'Clay Parlor',
    tagline: 'Candy-clay living room, gummy lamp, felt bounce light',
    implemented: false,
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
      sunColor: 0xffe0c0, sunIntensity: 0.45, fillColor: 0xffe08a, fillIntensity: 0.2,
      hemiSky: 0x7ec8e3, hemiGround: 0xf4d6c6, hemiIntensity: 0.5,
      exposure: 0.7, fogColor: 0xf0e4d4, fogDensity: 0.004,
      bloomStrength: 0.2, bloomRadius: 0.3, bloomThreshold: 1.1,
      gateEmissive: 2.4, gateEmissiveActive: 3.4,
    }),
    looks: Object.freeze({ fog: 0.004, sun: 0.45, env: 0.55, bg: 0.38, hemi: 0.5 }),
    gates: Object.freeze({ style: 'clay-ring', keepBrand: false }),
    props: Object.freeze(['clay sofa', 'gummy lamp', 'block bookshelf']),
    post: Object.freeze({ bloom: false, analog: false }),
  }),
  garage: Object.freeze({
    id: 'garage',
    name: 'Volt Stall',
    tagline: 'Night workshop, sodium spill, cyan work tubes',
    implemented: false,
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
      hemiSky: 0x1c2430, hemiGround: 0x14161c, hemiIntensity: 0.32,
      exposure: 0.55, fogColor: 0x14161c, fogDensity: 0.003,
      bloomStrength: 0.7, bloomRadius: 0.4, bloomThreshold: 0.9,
      gateEmissive: 5.2, gateEmissiveActive: 7,
    }),
    looks: Object.freeze({ fog: 0.003, sun: 0.2, env: 0.4, bg: 0.28, hemi: 0.32 }),
    gates: Object.freeze({ style: 'square-neon', keepBrand: false }),
    props: Object.freeze(['tube lights', 'wedge car', 'wet stripes']),
    post: Object.freeze({ bloom: true, analog: false }),
  }),
  warehouse: Object.freeze({
    id: 'warehouse',
    name: 'Ion Nave',
    tagline: 'Bioluminescent rack cathedral, teal aisle runners',
    implemented: false,
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
      sunColor: 0x7a5cff, sunIntensity: 0.18, fillColor: 0x39ffb0, fillIntensity: 0.2,
      hemiSky: 0x102028, hemiGround: 0x0b1218, hemiIntensity: 0.3,
      exposure: 0.52, fogColor: 0x0b1218, fogDensity: 0.0018,
      bloomStrength: 0.65, bloomRadius: 0.4, bloomThreshold: 0.88,
      gateEmissive: 5.5, gateEmissiveActive: 7.2,
    }),
    looks: Object.freeze({ fog: 0.0018, sun: 0.18, env: 0.42, bg: 0.26, hemi: 0.3 }),
    gates: Object.freeze({ style: 'hex-frame', keepBrand: false }),
    props: Object.freeze(['aisle arrows', 'rack edges', 'spore cans']),
    post: Object.freeze({ bloom: true, analog: false }),
  }),
  backyard: Object.freeze({
    id: 'backyard',
    name: 'Jade Lot',
    tagline: 'Dusk jungle-temple backyard, gold leaf, moss posts',
    implemented: false,
    time: 'dusk',
    sky: 'gradient',
    palette: Object.freeze({
      void: '#0c1410', zenith: '#1b2a18', horizon: '#c9a45b', dusk: '#8a4a2a',
      street: '#3a4a28', sidewalk: '#5d7a3a', lane: '#c9a45b', laneAlt: '#ffe0b0',
      facade: '#6a5340', facadeAlt: '#4a3a2a', windowOn: '#ffe0b0', windowAlt: '#c9a45b',
      neonA: '#c9a45b', neonB: '#5d7a3a', neonC: '#8a4a2a', mesa: '#8a4a2a',
      gateA: '#c9a45b', gateB: '#5d7a3a',
    }),
    lighting: Object.freeze({
      sunColor: 0xffc878, sunIntensity: 0.7, fillColor: 0x5d7a3a, fillIntensity: 0.12,
      hemiSky: 0x1b2a18, hemiGround: 0x3a2a18, hemiIntensity: 0.28,
      exposure: 0.58, fogColor: 0x2a2014, fogDensity: 0.0028,
      bloomStrength: 0.35, bloomRadius: 0.35, bloomThreshold: 1.0,
      gateEmissive: 3.2, gateEmissiveActive: 4.5,
    }),
    looks: Object.freeze({ fog: 0.0028, sun: 0.7, env: 0.5, bg: 0.32, hemi: 0.28 }),
    gates: Object.freeze({ style: 'stone-gold', keepBrand: false }),
    props: Object.freeze(['ziggurat shed', 'stone planters', 'moss posts']),
    post: Object.freeze({ bloom: false, analog: false }),
  }),
  office: Object.freeze({
    id: 'office',
    name: 'Paper Sun',
    tagline: 'Toon-shaded morning office, hard shadows, primary hoops',
    implemented: false,
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
      bloomStrength: 0.15, bloomRadius: 0.2, bloomThreshold: 1.2,
      gateEmissive: 2.8, gateEmissiveActive: 3.8,
    }),
    looks: Object.freeze({ fog: 0.0012, sun: 1.1, env: 0.6, bg: 0.5, hemi: 0.55 }),
    gates: Object.freeze({ style: 'toon-hoop', keepBrand: false }),
    props: Object.freeze(['flat cubicles', 'bold decals', 'paper plants']),
    post: Object.freeze({ bloom: false, analog: false }),
  }),
  gym: Object.freeze({
    id: 'gym',
    name: 'Amber Court',
    tagline: 'Golden-hour gym, honey wood, long sun on the paint',
    implemented: false,
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
    props: Object.freeze(['honey bleachers', 'glow rims', 'dust motes']),
    post: Object.freeze({ bloom: true, analog: false }),
  }),
  trainer: Object.freeze({
    id: 'trainer',
    name: 'Licorice Grid',
    tagline: 'Candy tape on a night meet floor, clay PVC frames',
    implemented: false,
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
    props: Object.freeze(['candy tape', 'clay cones', 'gummy frames']),
    post: Object.freeze({ bloom: true, analog: false }),
  }),
  room: Object.freeze({
    id: 'room',
    name: 'Pocket Stage',
    tagline: 'Clay diorama bedroom, desk-lamp key, felt rings',
    implemented: false,
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
      sunColor: 0xffe6c4, sunIntensity: 0.28, fillColor: 0xffb3c7, fillIntensity: 0.12,
      hemiSky: 0xeee8de, hemiGround: 0x7a5130, hemiIntensity: 0.42,
      exposure: 0.6, fogColor: 0xeee8de, fogDensity: 0.0045,
      bloomStrength: 0.15, bloomRadius: 0.2, bloomThreshold: 1.2,
      gateEmissive: 2.2, gateEmissiveActive: 3.2,
    }),
    looks: Object.freeze({ fog: 0.0045, sun: 0.28, env: 0.5, bg: 0.32, hemi: 0.42 }),
    gates: Object.freeze({ style: 'felt-ring', keepBrand: false }),
    props: Object.freeze(['felt furniture', 'night window', 'desk lamp']),
    post: Object.freeze({ bloom: false, analog: false }),
  }),
});

export const MAP_VIBE_IDS = Object.freeze([
  'city', 'living', 'garage', 'warehouse', 'backyard', 'office', 'gym', 'trainer', 'room',
]);

export function vibeFor(mapId) {
  return VIBES[mapId] || VIBES.city;
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
