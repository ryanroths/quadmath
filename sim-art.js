// QuadMath sim art — original procedural vibes. Phase 1 paints City as
// Neon Current. No third-party meshes. Nothing here is copied from WebFPV.
// Visual only: do not push new colliders, do not move gates.

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
      exposure: 0.62,
      fogColor: 0x1a0830,
      fogDensity: 0.00105,
      bloomStrength: 0.88,
      bloomRadius: 0.52,
      bloomThreshold: 0.82,
      gateEmissive: 6.2,
      gateEmissiveActive: 8.0,
    }),
    looks: Object.freeze({ fog: 0.00105, sun: 0.30, env: 0.18, bg: 0.16, hemi: 0.44 }),
    gates: Object.freeze({ style: 'neon-halo', keepBrand: true }),
    props: Object.freeze(['instanced towers', 'roof neon', 'street lamps', 'skyline ring']),
    post: Object.freeze({ bloom: true, analog: false }),
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

const HEX = /^#[0-9a-fA-F]{6}$/;

export function hexNum(h) {
  if (typeof h === 'number' && Number.isFinite(h)) return h >>> 0;
  const s = String(h || '').trim();
  if (!HEX.test(s)) return 0x000000;
  return parseInt(s.slice(1), 16);
}

export function vibeFor(mapId) {
  return VIBES[mapId] || VIBES.city;
}

export function qualityWantsBloom(applied) {
  return applied === 'med' || applied === 'high';
}

export function qualityBudget(applied) {
  if (applied === 'low') return { skyline: 48, lamps: 80, strips: 80, stars: 0, lights: 0 };
  if (applied === 'high') return { skyline: 140, lamps: 220, strips: 220, stars: 220, lights: 6 };
  return { skyline: 96, lamps: 160, strips: 160, stars: 120, lights: 4 };
}

function mulberry32(a) {
  let t = a >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(THREE, w, h, draw, rx, ry) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx == null ? 1 : rx, ry == null ? 1 : ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.looksComposed = true;
  t.userData.artLocked = true;
  t.needsUpdate = true;
  return t;
}

function makeNeonFacades(THREE, vibe, n) {
  const out = [];
  const rng = mulberry32(4242);
  for (let i = 0; i < n; i++) {
    const tex = canvasTex(THREE, 256, 512, (g) => {
      g.fillStyle = i % 2 ? vibe.palette.facadeAlt : vibe.palette.facade;
      g.fillRect(0, 0, 256, 512);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, 490, 256, 22);
      const cols = 6, rows = 14, wx = 256 / cols, wy = 512 / rows;
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const on = rng() < 0.42;
          const alt = rng() < 0.45;
          g.fillStyle = on
            ? (alt ? vibe.palette.windowAlt : vibe.palette.windowOn)
            : 'rgb(18,12,28)';
          g.globalAlpha = on ? 0.92 : 0.55;
          g.fillRect(c * wx + wx * 0.2, r * wy + wy * 0.22, wx * 0.6, wy * 0.5);
          g.globalAlpha = 1;
          g.fillStyle = 'rgba(255,43,214,0.18)';
          g.fillRect(c * wx + wx * 0.2, r * wy + wy * 0.22, wx * 0.6, 2);
        }
      }
    }, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, color: 0xffffff, roughness: 0.82, metalness: 0.08,
      emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.22,
    });
    mat.userData.looksFacade = true;
    mat.userData.artLocked = true;
    mat.userData.looksSkip = true;
    out.push(mat);
  }
  return out;
}

function nightGround(THREE, vibe) {
  return canvasTex(THREE, 1024, 1024, (g, s) => {
    g.fillStyle = vibe.palette.street;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = `rgba(80,60,110,${0.04 + Math.random() * 0.08})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    const rw = s * 0.16, sw = s * 0.035;
    g.fillStyle = vibe.palette.sidewalk;
    g.fillRect(0, 0, s, rw + sw);
    g.fillRect(0, 0, rw + sw, s);
    g.fillStyle = vibe.palette.street;
    g.fillRect(0, 0, s, rw);
    g.fillRect(0, 0, rw, s);
    g.strokeStyle = vibe.palette.lane;
    g.setLineDash([16, 14]);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, rw / 2); g.lineTo(s, rw / 2);
    g.stroke();
    g.strokeStyle = vibe.palette.laneAlt;
    g.beginPath();
    g.moveTo(rw / 2, 0); g.lineTo(rw / 2, s);
    g.stroke();
  }, 10, 10);
}

export function paintSkyCanvas(skyMesh, vibe) {
  if (!skyMesh || !skyMesh.material) return null;
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 512;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, vibe.palette.void);
  gr.addColorStop(0.38, vibe.palette.zenith);
  gr.addColorStop(0.7, '#4a0a5c');
  gr.addColorStop(0.86, vibe.palette.horizon);
  gr.addColorStop(1, vibe.palette.dusk);
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 512);
  const THREE = skyMesh.material.map && skyMesh.material.map.isTexture
    ? null
    : null;
  const tex = skyMesh.material.map && skyMesh.material.map.clone
    ? skyMesh.material.map
    : null;
  if (tex && tex.image && tex.image.getContext) {
    const ig = tex.image.getContext('2d');
    ig.clearRect(0, 0, tex.image.width, tex.image.height);
    const copy = ig.createLinearGradient(0, 0, 0, tex.image.height);
    copy.addColorStop(0, vibe.palette.void);
    copy.addColorStop(0.38, vibe.palette.zenith);
    copy.addColorStop(0.7, '#4a0a5c');
    copy.addColorStop(0.86, vibe.palette.horizon);
    copy.addColorStop(1, vibe.palette.dusk);
    ig.fillStyle = copy;
    ig.fillRect(0, 0, tex.image.width, tex.image.height);
    tex.needsUpdate = true;
    return tex;
  }
  // Fresh canvas if the original map is not a writable canvas.
  const fresh = document.createElement('canvas');
  fresh.width = 16;
  fresh.height = 512;
  const fg = fresh.getContext('2d');
  fg.drawImage(cv, 0, 0);
  if (skyMesh.material.map) {
    skyMesh.material.map.dispose();
  }
  void THREE;
  return fresh;
}

export function applySkyTexture(THREE, skyMesh, vibe) {
  if (!skyMesh || !skyMesh.material) return;
  const tex = canvasTex(THREE, 16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, vibe.palette.void);
    gr.addColorStop(0.38, vibe.palette.zenith);
    gr.addColorStop(0.7, '#4a0a5c');
    gr.addColorStop(0.86, vibe.palette.horizon);
    gr.addColorStop(1, vibe.palette.dusk);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  if (skyMesh.material.map && skyMesh.material.map !== tex) {
    try { skyMesh.material.map.dispose(); } catch (e) { /* ignore */ }
  }
  skyMesh.material.map = tex;
  skyMesh.material.needsUpdate = true;
  skyMesh.material.fog = false;
}

export function applyVibeLighting(ctx, vibe) {
  const L = vibe.lighting;
  const { LIGHTING, sun, sunFill, hemi, scene, bloomPass, renderer } = ctx || {};
  if (LIGHTING) {
    LIGHTING.sunColor = L.sunColor;
    LIGHTING.sunIntensity = L.sunIntensity;
    LIGHTING.fillIntensity = L.fillIntensity;
    LIGHTING.hemiSky = L.hemiSky;
    LIGHTING.hemiGround = L.hemiGround;
    LIGHTING.hemiIntensity = L.hemiIntensity;
    LIGHTING.exposure = L.exposure;
    LIGHTING.fogColor = L.fogColor;
    LIGHTING.fogDensity = L.fogDensity;
    LIGHTING.bloomStrength = L.bloomStrength;
    LIGHTING.bloomRadius = L.bloomRadius;
    LIGHTING.bloomThreshold = L.bloomThreshold;
    LIGHTING.gateEmissive = L.gateEmissive;
    LIGHTING.gateEmissiveActive = L.gateEmissiveActive;
  }
  if (sun) {
    sun.color.setHex(L.sunColor);
    sun.intensity = L.sunIntensity;
  }
  if (sunFill) {
    sunFill.color.setHex(L.fillColor);
    sunFill.intensity = L.fillIntensity;
  }
  if (hemi) {
    hemi.color.setHex(L.hemiSky);
    hemi.groundColor.setHex(L.hemiGround);
    hemi.intensity = L.hemiIntensity;
  }
  if (scene && scene.fog) {
    scene.fog.color.setHex(L.fogColor);
    scene.fog.density = L.fogDensity;
    if (scene.background && scene.background.isColor) {
      scene.background.setHex(L.fogColor);
    }
  }
  if (renderer) renderer.toneMappingExposure = L.exposure;
  if (bloomPass) {
    bloomPass.strength = L.bloomStrength;
    bloomPass.radius = L.bloomRadius;
    bloomPass.threshold = L.bloomThreshold;
  }
}

function restyleExisting(THREE, root, vibe, facades) {
  let fi = 0;
  const roof = new THREE.MeshStandardMaterial({
    color: hexNum(vibe.palette.facadeAlt),
    roughness: 0.78,
    metalness: 0.18,
    emissive: hexNum(vibe.palette.neonA),
    emissiveIntensity: 0.18,
  });
  roof.userData.looksRoof = true;
  roof.userData.looksSkip = true;
  roof.userData.artLocked = true;
  const trunk = new THREE.MeshStandardMaterial({
    color: 0x1a1020, roughness: 0.9, metalness: 0.05,
  });
  trunk.userData.looksSkip = true;
  const frondA = new THREE.MeshStandardMaterial({
    color: hexNum(vibe.palette.neonA), emissive: hexNum(vibe.palette.neonA),
    emissiveIntensity: 1.6, roughness: 0.45, side: THREE.DoubleSide,
  });
  frondA.userData.looksSkip = true;
  const frondB = new THREE.MeshStandardMaterial({
    color: hexNum(vibe.palette.neonB), emissive: hexNum(vibe.palette.neonB),
    emissiveIntensity: 1.4, roughness: 0.45, side: THREE.DoubleSide,
  });
  frondB.userData.looksSkip = true;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const facade = mats.some((m) => m && m.userData && m.userData.looksFacade);
    const isRoof = mats.some((m) => m && m.userData && m.userData.looksRoof);
    if (facade) {
      const wall = facades[fi % facades.length];
      fi++;
      if (Array.isArray(o.material)) {
        o.material = o.material.map((m) => (m && m.userData && m.userData.looksRoof ? roof : wall));
      } else {
        o.material = wall;
      }
      return;
    }
    if (isRoof) {
      o.material = roof;
      return;
    }
    const geo = o.geometry && o.geometry.type;
    if (geo === 'CylinderGeometry' && o.material.color) {
      const c = o.material.color.getHex();
      if (c === 0x8a6a45 || (c > 0x6a4a20 && c < 0x9a7a50)) {
        o.material = trunk;
        return;
      }
    }
    if (geo === 'PlaneGeometry' && o.material.side === THREE.DoubleSide) {
      o.material = (fi++ % 2) ? frondA : frondB;
    }
  });
  return { roof, trunk, frondA, frondB, facadeCount: fi };
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
  const dummy = new THREE.Object3D();
  let written = 0;
  for (let i = 0; i < count; i++) {
    if (place(dummy, i) === false) continue;
    dummy.updateMatrix();
    mesh.setMatrixAt(written, dummy.matrix);
    written++;
  }
  mesh.count = written;
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

function collectBuildingTops(root) {
  const tops = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== 'BoxGeometry') return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((m) => m && m.userData && (m.userData.looksFacade || m.userData.artLocked))) return;
    const p = o.geometry.parameters;
    if (!p || p.height < 6) return;
    tops.push({
      x: o.position.x, y: o.position.y + p.height / 2, z: o.position.z,
      w: p.width, d: p.depth,
    });
  });
  return tops;
}

export function buildCityDressing(THREE, parent, vibe, quality) {
  const group = new THREE.Group();
  group.name = 'cityArtDressing';
  parent.add(group);
  const budget = qualityBudget(quality);
  const rng = mulberry32(7771);

  const facadeMat = new THREE.MeshStandardMaterial({
    color: hexNum(vibe.palette.facade),
    emissive: hexNum(vibe.palette.neonA),
    emissiveIntensity: 0.28,
    roughness: 0.8,
    metalness: 0.12,
  });
  facadeMat.userData.looksSkip = true;
  const stripMat = new THREE.MeshStandardMaterial({
    color: hexNum(vibe.palette.neonB),
    emissive: hexNum(vibe.palette.neonB),
    emissiveIntensity: 4.8,
    roughness: 0.25,
    metalness: 0.05,
  });
  stripMat.userData.looksSkip = true;
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x1a1420, roughness: 0.55, metalness: 0.4,
  });
  lampMat.userData.looksSkip = true;
  const bulbMat = new THREE.MeshStandardMaterial({
    color: hexNum(vibe.palette.neonC),
    emissive: hexNum(vibe.palette.neonC),
    emissiveIntensity: 5.5,
    roughness: 0.3,
  });
  bulbMat.userData.looksSkip = true;

  addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), facadeMat, budget.skyline, (d, i) => {
    const a = (i / budget.skyline) * Math.PI * 2 + rng() * 0.08;
    const dist = 1550 + rng() * 520;
    const h = 28 + Math.pow(rng(), 1.25) * 110;
    const w = 10 + rng() * 22;
    d.position.set(Math.cos(a) * dist, h / 2, Math.sin(a) * dist);
    d.scale.set(w, h, w * (0.7 + rng() * 0.5));
    d.rotation.set(0, a * 0.15, 0);
  });

  const tops = collectBuildingTops(parent);
  const stripN = Math.min(budget.strips, Math.max(1, tops.length));
  addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), stripMat, stripN, (d, i) => {
    const t = tops[i % tops.length];
    if (!t) return false;
    d.position.set(t.x, t.y + 0.35, t.z);
    d.scale.set(Math.max(2, t.w * 0.92), 0.28, Math.max(2, t.d * 0.92));
    d.rotation.set(0, 0, 0);
  });

  const lampPos = [];
  for (let s = -360; s <= 360; s += 48) {
    if (Math.abs(s) < 18) continue;
    lampPos.push([14, s], [-14, s], [s, 14], [s, -14]);
  }
  const lampN = Math.min(budget.lamps, lampPos.length);
  addInstanced(THREE, group, new THREE.CylinderGeometry(0.12, 0.16, 7.2, 6), lampMat, lampN, (d, i) => {
    const p = lampPos[i];
    d.position.set(p[0], 3.6, p[1]);
    d.scale.set(1, 1, 1);
    d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.SphereGeometry(0.38, 8, 8), bulbMat, lampN, (d, i) => {
    const p = lampPos[i];
    d.position.set(p[0], 7.15, p[1]);
    d.scale.set(1, 1, 1);
    d.rotation.set(0, 0, 0);
  });

  if (budget.stars > 0) {
    const pos = new Float32Array(budget.stars * 3);
    for (let i = 0; i < budget.stars; i++) {
      const a = rng() * Math.PI * 2;
      const e = 0.18 + rng() * 1.15;
      const r = 1680;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffd6ff, size: 2, sizeAttenuation: false, fog: false, depthWrite: false,
    }));
    stars.name = 'cityStars';
    stars.userData.keepInScene = true;
    group.add(stars);
  }

  const lights = [];
  const lightCols = [hexNum(vibe.palette.neonA), hexNum(vibe.palette.neonB), hexNum(vibe.palette.neonC)];
  const lightSpots = [[40, 18, 40], [-50, 16, -30], [0, 22, 120], [80, 14, -20], [-90, 20, 60], [20, 18, -80]];
  for (let i = 0; i < budget.lights; i++) {
    const p = lightSpots[i];
    const l = new THREE.PointLight(lightCols[i % 3], 40, 70, 2);
    l.position.set(p[0], p[1], p[2]);
    l.castShadow = false;
    group.add(l);
    lights.push(l);
  }
  group.userData.artLights = lights;
  return group;
}

export function buildDreamlandArt(THREE, parent, vibe) {
  const DX = 1500, DZ = 1500;
  const group = new THREE.Group();
  group.name = 'dreamlandArt';
  group.position.set(DX, 0, DZ);
  const floorTex = canvasTex(THREE, 256, 256, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, '#140820');
    gr.addColorStop(0.5, '#2a1050');
    gr.addColorStop(1, '#3a1870');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = vibe.palette.neonB;
    g.globalAlpha = 0.35;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.arc(s / 2, s / 2, 18 + i * 14, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, 1, 1);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.88, metalness: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x221036,
    emissive: hexNum(vibe.palette.neonA),
    emissiveIntensity: 0.55,
    roughness: 0.55,
  });
  pillarMat.userData.looksSkip = true;
  const capMat = new THREE.MeshStandardMaterial({
    color: hexNum(vibe.palette.neonB),
    emissive: hexNum(vibe.palette.neonB),
    emissiveIntensity: 3.4,
    roughness: 0.3,
  });
  capMat.userData.looksSkip = true;
  const spots = [
    [-130, 60, 18], [140, -40, 16], [-40, -140, 14],
    [60, 130, 20], [-140, -60, 17], [120, 100, 15],
    [100, -120, 22], [-120, 90, 19], [20, 140, 16],
  ];
  for (const [x, z, h] of spots) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, h, 8), pillarMat);
    p.position.set(x, h / 2, z);
    p.castShadow = true;
    group.add(p);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 6, 16), capMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(x, h + 0.4, z);
    group.add(cap);
  }
  const pl = new THREE.PointLight(0x8f6bff, 1.8, 420, 2);
  pl.position.set(0, 80, 0);
  group.add(pl);
  parent.add(group);
  return group;
}

export function restyleMesas(root, vibe) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'CylinderGeometry') return;
    const p = o.geometry.parameters;
    if (!p || p.height < 30 || p.radiusBottom < 40) return;
    if (!o.material || !o.material.color) return;
    o.material.color.setHex(hexNum(vibe.palette.mesa));
    o.material.emissive = o.material.emissive || o.material.color.clone();
    o.material.emissive.setHex(hexNum(vibe.palette.neonA));
    o.material.emissiveIntensity = 0.18;
    o.material.roughness = 0.95;
    o.material.userData.artLocked = true;
    n++;
  });
  return n;
}

export function decorateVibeGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(size + size * 0.12, size * 0.012, 6, 32),
    new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 6,
      roughness: 0.18,
      metalness: 0.05,
    }),
  );
  halo.name = 'gateHalo';
  halo.castShadow = false;
  halo.receiveShadow = false;
  halo.material.userData.looksSkip = true;
  ring.add(halo);
  ring.userData.artHalo = halo;
  return halo;
}

export function restyleCity(THREE, ctx) {
  const vibe = ctx.vibe || VIBES.city;
  const quality = ctx.quality || 'med';
  const root = ctx.proceduralGroup;
  const facades = makeNeonFacades(THREE, vibe, 6);
  if (root) restyleExisting(THREE, root, vibe, facades);
  if (ctx.ground && ctx.ground.material) {
    const gtex = nightGround(THREE, vibe);
    const mat = ctx.ground.material;
    if (mat.map && mat.map !== gtex && mat.userData && mat.userData.looksComposed) {
      try { mat.map.dispose(); } catch (e) { /* ignore */ }
    }
    mat.map = gtex;
    mat.color.setHex(0xffffff);
    mat.roughness = 0.92;
    mat.metalness = 0.04;
    mat.emissive.setHex(hexNum(vibe.palette.neonA));
    mat.emissiveIntensity = 0.08;
    mat.userData.looksComposed = true;
    mat.userData.artLocked = true;
    mat.userData.looksSkip = true;
    mat.normalMap = null;
    mat.roughnessMap = null;
    mat.needsUpdate = true;
  }
  if (ctx.skyMesh) applySkyTexture(THREE, ctx.skyMesh, vibe);
  if (ctx.sunSprite && ctx.sunSprite.material) {
    ctx.sunSprite.material.color.setHex(0xb0c4ff);
  }
  let dressing = null;
  if (root) {
    const oldDress = root.getObjectByName('cityArtDressing');
    if (oldDress && oldDress.parent) oldDress.parent.remove(oldDress);
    dressing = buildCityDressing(THREE, root, vibe, quality);
  }
  const host = ctx.cityWorld || root;
  if (host) {
    const oldDream = host.getObjectByName('dreamlandArt');
    if (oldDream && oldDream.parent) oldDream.parent.remove(oldDream);
  }
  const dream = host ? buildDreamlandArt(THREE, host, vibe) : null;
  if (ctx.scene) restyleMesas(ctx.scene, vibe);
  applyVibeLighting(ctx, vibe);
  return { facades, dressing, dream, vibe, quality };
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
  let instanced = 0, instancedMeshes = 0, meshes = 0, points = 0;
  if (root) {
    root.traverse((o) => {
      if (o.isInstancedMesh) {
        instancedMeshes += 1;
        instanced += o.count || 0;
      } else if (o.isMesh) meshes += 1;
      else if (o.isPoints) points += 1;
    });
  }
  return {
    calls: info.calls || 0,
    callsEst: meshes + instancedMeshes + points,
    triangles: info.triangles || 0,
    instanced,
    instancedMeshes,
    meshes,
    points,
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
