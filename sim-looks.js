// QuadMath sim V1 looks — environment, PBR, cheap contact AO, FPV lens,
// per-map grade/vignette, quality presets. Not WebFPV.
// Visual only. Does not touch physics, colliders, tracks, ghosts, or existing
// localStorage keys. New keys: quadmathSimQuality, quadmathSimFpv,
// quadmathSimCrosshair.
import { resolveAutoQuality } from './sim-touch.js?v=7eff6ead2f5f';

export const QUALITY_KEY = 'quadmathSimQuality';
export const FPV_KEY = 'quadmathSimFpv';
export const CROSSHAIR_KEY = 'quadmathSimCrosshair';

export const LOOK_SPOTS = {
  spawn:  { pos: [0, 3.2, 32], target: [0, 6, -40] },
  t0g1:   { pos: [-122, 8.5, -96], target: [-140, 7, -120] },
  startLabel: { pos: [-118, 17.5, -88], target: [-140, 19, -120] },
  portalLabel: { pos: [328, 26, -312], target: [350, 32, -350] },
  t1mid:  { pos: [322, 50, -478], target: [350, 46, -515] },
  street: { pos: [6, 2.8, 90], target: [0, 3.5, -30] },
  roof:   { pos: [-40, 48, 95], target: [-20, 12, 10] },
  overview: { pos: [70, 165, 210], target: [0, 10, 0] },
  lowpass: { pos: [12, 1.55, 48], target: [0, 1.8, -24] },
  whoopStreet: { pos: [3.2, 1.12, 26], target: [11.5, 1.05, -6] },
  cityInside: { pos: [16.2, 1.22, 4.0], target: [22.0, 1.40, 4.0] },
  cityAlley: { pos: [29.0, 1.18, 10.6], target: [29.0, 1.22, 4.0] },
  citySpins: { pos: [6.2, 1.20, -2.2], target: [6.2, 1.45, -8.6] },
  cityRoofHole: { pos: [22.0, 12.6, 10.4], target: [22.0, 8.4, 4.0] },
  whoopMid: { pos: [7.5, 18.4, 14], target: [28, 12, -22] },
  whoopStart: { pos: [-118, 1.18, -92], target: [-136, 1.7, -118] },
  whoopPortal: { pos: [328, 1.2, -308], target: [348, 8, -346] },
  chase: { pos: [-18, 2.5, 16], target: [10, 1.15, -14] },
  living: { pos: [0, 4.6, 8], target: [0, 1.8, -6] },
  livingWhoop: { pos: [-2.1, 1.14, 3.4], target: [1.4, 1.35, -9.2] },
  livingMid: { pos: [5.2, 4.8, 9.0], target: [-2.8, 2.0, -5.5] },
  livingOverview: { pos: [0.8, 7.6, 12.2], target: [0, 1.4, -4] },
  livingUnderSofa: { pos: [0.2, 0.62, -7.4], target: [0, 0.66, -10.6] },
  livingUnderTable: { pos: [0.2, 0.62, -3.2], target: [0, 0.66, -5.9] },
  livingClay: { pos: [0.2, 2.65, -3.4], target: [0, 2.70, -8.2] },
  livingGap: { pos: [7.3, 1.40, 5.6], target: [7.3, 1.42, 9.8] },
  livingShelf: { pos: [5.2, 1.82, -10.6], target: [8.4, 1.86, -10.6] },
  livingRafters: { pos: [0.25, 7.40, 12.2], target: [0, 7.7, 0] },
  garage: { pos: [0, 5.2, 12], target: [2, 2.2, -6] },
  garageWhoop: { pos: [0.15, 1.14, 13.6], target: [2.6, 1.25, -6.4] },
  garageMid: { pos: [-3.8, 5.4, 16.2], target: [3.2, 1.8, -7.5] },
  garageOverview: { pos: [1.2, 8.6, 18.4], target: [0.4, 1.6, -4] },
  garageDoor: { pos: [0.1, 1.22, 15.4], target: [0, 1.4, 21] },
  garageVolt: { pos: [0.15, 2.45, 8.4], target: [0, 2.55, 3.4] },
  garageUnderCar: { pos: [4.2, 0.68, 2.4], target: [4.2, 0.7, -5.5] },
  garageUnderBench: { pos: [-4.6, 1.18, -8.0], target: [-8.4, 1.2, -8.0] },
  garageShelves: { pos: [4.2, 1.72, 7.9], target: [8.6, 1.7, 7.9] },
  garageTires: { pos: [0.1, 2.9, -7.2], target: [0, 1.2, -12.2] },
  garageLadder: { pos: [-5.2, 2.6, 11.6], target: [-9.4, 2.8, 14.8] },
  garageCords: { pos: [0.3, 2.5, 13.2], target: [-2.2, 3.6, 8.6] },
  garageRafters: { pos: [0.2, 7.55, 12.2], target: [0, 8.2, 0] },
  garageBike: { pos: [0.15, 3.35, 18.2], target: [0, 3.4, 14.0] },
  garageDoorGap: { pos: [0.1, 1.18, 16.4], target: [0, 1.2, 20.9] },
  garageOrbit: { pos: [0.6, 1.55, -1.2], target: [4.2, 1.4, -5.5] },
  garageShelfGap: { pos: [5.4, 1.72, 3.6], target: [8.6, 1.7, 3.6] },
  garageTireStack: { pos: [2.4, 2.4, -12.8], target: [5.6, 1.3, -16.4] },
  warehouse: { pos: [0, 7.5, 36], target: [0, 3.2, -8] },
  warehouseWhoop: { pos: [0.15, 1.18, 28], target: [0.3, 1.5, -18] },
  warehouseMid: { pos: [10.5, 9.2, 26], target: [-4, 3.2, -6] },
  warehouseOverview: { pos: [0.5, 15.5, 34], target: [0, 2.5, -8] },
  warehouseUnderRack: { pos: [-4.2, 0.62, 6.4], target: [-7.5, 0.68, 0] },
  warehouseShelves: { pos: [-4.0, 2.82, 6.8], target: [-7.5, 2.88, 0] },
  warehouseOverRack: { pos: [18.2, 11.15, 8.4], target: [22.5, 11.05, 0] },
  warehousePallets: { pos: [-22.0, 1.18, 40.4], target: [-22.0, 1.12, 36] },
  warehouseIon: { pos: [0.18, 2.75, 18.6], target: [0, 2.80, 12] },
  warehouseGap: { pos: [0.15, 1.52, -31.2], target: [0, 1.58, -38.4] },
  warehouseRafters: { pos: [0.25, 16.15, 22.4], target: [0, 16.6, 0] },
  backyard: { pos: [2, 10, 18], target: [2, 3, -6] },
  backyardWhoop: { pos: [4.0, 1.18, 5.2], target: [11.0, 1.6, -6.8] },
  backyardMid: { pos: [2, 10, 18], target: [2, 3, -6] },
  backyardOverview: { pos: [4, 22, 24], target: [2, 2, -6] },
  backyardPatio: { pos: [4.0, 2.2, 6.4], target: [4.0, 2.4, -2.0] },
  backyardPvc: { pos: [6.4, 1.7, -6.8], target: [11.0, 1.75, -6.8] },
  backyardPool: { pos: [1.4, 1.32, 6.6], target: [-2.15, 1.5, -15.0] },
  backyardAlley: { pos: [-21.75, 1.18, 8.4], target: [-21.75, 1.22, 18.0] },
  backyardTree: { pos: [17.2, 2.2, -11.2], target: [17.2, 2.4, -15.4] },
  backyardRoof: { pos: [4.0, 8.4, -4.2], target: [1.5, 19.2, 14.1] },
  backyardPalms: { pos: [-10.2, 2.80, -7.2], target: [-17.6, 2.4, -14.2] },
  backyardCanopy: { pos: [-10.6, 2.65, -7.4], target: [-17.6, 1.7, -12.55] },
  office: { pos: [12.2, 4.6, 16.4], target: [-6, 1.4, -6] },
  officeWhoop: { pos: [12.4, 1.18, 16.8], target: [-6.2, 1.4, -4] },
  officeMid: { pos: [12.2, 4.6, 16.4], target: [-6, 1.4, -6] },
  officeOverview: { pos: [1.2, 8.4, 20.6], target: [-2, 1.2, -4] },
  officeUnderDesk: { pos: [0.4, 0.62, 0.0], target: [-5.1, 0.66, 0.0] },
  officeOverCube: { pos: [1.2, 4.15, 6.4], target: [-3.75, 4.05, 12.0] },
  officeSun: { pos: [4.75, 2.65, 12.4], target: [4.6, 2.70, 6.2] },
  officeGap: { pos: [4.7, 1.52, 7.2], target: [4.6, 1.55, 12.4] },
  officeRafters: { pos: [0.25, 7.40, 16.4], target: [0, 7.7, 0] },
  officeConf: { pos: [4.6, 0.62, -11.4], target: [4.6, 0.66, -16.2] },
  gym: { pos: [9.2, 8.2, 18], target: [0, 2.6, -12] },
  gymWhoop: { pos: [4.2, 1.18, 18], target: [-2.4, 1.5, -10] },
  gymMid: { pos: [14, 9.5, 26], target: [-2, 2.8, -8] },
  gymOverview: { pos: [0.4, 20, 34], target: [0, 2, -6] },
  gymUnderBench: { pos: [-14.2, 0.62, 15.4], target: [-17.4, 0.66, 15.4] },
  gymThrough: { pos: [-14.0, 2.40, 0.0], target: [-21.45, 2.40, 0.0] },
  gymAmber: { pos: [0.2, 2.75, 16.4], target: [0, 2.80, 8.0] },
  gymGap: { pos: [0.2, 1.70, 26.2], target: [0, 1.70, 32.4] },
  gymOverBench: { pos: [-14.2, 5.20, 15.4], target: [-21.45, 5.00, 15.4] },
  gymRafters: { pos: [0.3, 24.80, 28.0], target: [0, 25.40, 0] },
  trainer: { pos: [8, 6.2, 14], target: [0, 1.6, -4] },
  trainerWhoop: { pos: [0.2, 1.16, 14.2], target: [0, 1.4, -6] },
  trainerMid: { pos: [8, 6.2, 14], target: [0, 1.6, -4] },
  trainerOverview: { pos: [0.4, 8.8, 16.4], target: [0, 1.2, -2] },
  room: { pos: [3.4, 4.2, 6.2], target: [-1, 1.2, -2] },
  roomWhoop: { pos: [1.55, 1.14, 4.6], target: [-0.2, 1.15, -3.4] },
  roomMid: { pos: [3.6, 3.8, 5.4], target: [-1.2, 1.15, -2.4] },
  roomOverview: { pos: [0.6, 6.4, 6.4], target: [0, 1.05, -1.2] },
  builder: { pos: [0, 14, 0.1], target: [0, 0, 0] },
};

const ASSET = 'assets/sim-looks';
const HDRI_1K = `${ASSET}/hdri/kiara_1_dawn_1k.hdr`;
const HDRI_2K = `${ASSET}/hdri/kiara_1_dawn_2k.hdr`;
const HDRI_YARD_1K = 'assets/sim-backyard/hdri/kloofendal_48d_partly_cloudy_1k.hdr';

export function phoneLookOverrides(mobile, preset, dpr) {
  const p = Object.assign({}, preset || PRESETS.med);
  const rawDpr = dpr == null
    ? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)
    : dpr;
  const cap = mobile ? 1 : (p.pixelRatioCap || p.pixelRatio || 1);
  p.pixelRatio = Math.min(rawDpr, cap);
  if (mobile) {
    p.pixelRatioCap = 1;
    p.shadowMapSize = Math.min(p.shadowMapSize || 512, 512);
    if (p.anisotropy) p.anisotropy = Math.min(p.anisotropy, 4);
  }
  return p;
}

export const PRESETS = {
  low: {
    pixelRatio: 1,
    shadowMapSize: 512,
    shadows: true,
    ao: false,
    bloom: false,
    bloomScale: 0,
    grade: false,
    postSamples: 0,
    hdri: '1k',
    maps: 'albedo',
    anisotropy: 4,
  },
  med: {
    pixelRatioCap: 1.25,
    shadowMapSize: 1024,
    shadows: true,
    ao: true,
    bloom: true,
    bloomScale: 0.75,
    grade: true,
    postSamples: 2,
    hdri: '1k',
    maps: 'pbr',
    anisotropy: 8,
  },
  high: {
    pixelRatioCap: 1.5,
    shadowMapSize: 2048,
    shadows: true,
    ao: true,
    bloom: true,
    bloomScale: 1,
    grade: true,
    postSamples: 4,
    hdri: '2k',
    maps: 'pbr',
    anisotropy: 16,
  },
};

const EXISTING_SAVE_KEYS = [
  'ryflyRates', 'ryflyRatesType', 'ryflyDroneType', 'ryflyCamCustom',
  'ryflyMusicVol', 'ryflyGamepadId', 'quadmath_pilotName',
  'quadmath_bestLap', 'quadmath_bestLap_0', 'quadmath_bestLap_1',
  'quadmath_bestRun_0', 'quadmath_bestRun_1',
  'quadmath_bestGhost_0', 'quadmath_bestGhost_1',
];

function loadChoice() {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    if (q === 'low' || q === 'med' || q === 'high' || q === 'auto') return q;
  } catch (e) { /* ignore */ }
  return 'auto';
}

function loadFpv() {
  const fallback = { enabled: true, style: 'hd', motionBlur: false };
  try {
    const raw = localStorage.getItem(FPV_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw);
    return {
      enabled: o.enabled !== false,
      style: o.style === 'analog' ? 'analog' : 'hd',
      motionBlur: !!o.motionBlur,
    };
  } catch (e) { return fallback; }
}

function saveChoice(q) {
  try { localStorage.setItem(QUALITY_KEY, q); } catch (e) { /* ignore */ }
}
function saveFpv(fpv) {
  try { localStorage.setItem(FPV_KEY, JSON.stringify(fpv)); } catch (e) { /* ignore */ }
}

function lookStore(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch (e) { return null; }
}

// Default off: real FPV goggles have no center crosshair.
export function loadCrosshairOn(storage) {
  const store = lookStore(storage);
  if (!store) return false;
  try { return store.getItem(CROSSHAIR_KEY) === '1'; }
  catch (e) { return false; }
}

export function saveCrosshairOn(on, storage) {
  const store = lookStore(storage);
  if (!store) return false;
  try {
    store.setItem(CROSSHAIR_KEY, on ? '1' : '0');
    return true;
  } catch (e) {
    return false;
  }
}

function gpuHint(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    const software = /swiftshader|llvmpipe|software|virtualbox/i.test(info);
    const high = !software && /nvidia|geforce|radeon|amd|apple m[1-9]/i.test(info);
    const low = software || (/intel|mali|adreno|apple gpu|iris|uhd|hd graphics/i.test(info) && !high);
    return { info, low, high };
  } catch (e) {
    return { info: '', low: false };
  }
}

const FPV_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FPV_FRAG = `
uniform sampler2D tDiffuse;
uniform float barrel;
uniform float vignette;
uniform float ca;
uniform float analog;
uniform float time;
uniform float grade;
uniform vec3 lift;
uniform float gamma;
uniform vec3 gain;
uniform float mapVignette;
varying vec2 vUv;
vec2 distort(vec2 uv, float k){
  vec2 c = uv - 0.5;
  float r2 = dot(c,c);
  return 0.5 + c * (1.0 + k * r2);
}
void main(){
  vec2 uvR = distort(vUv, barrel + ca);
  vec2 uvG = distort(vUv, barrel);
  vec2 uvB = distort(vUv, barrel - ca);
  float r = texture2D(tDiffuse, uvR).r;
  float g = texture2D(tDiffuse, uvG).g;
  float b = texture2D(tDiffuse, uvB).b;
  vec3 col = vec3(r,g,b);
  if(grade > 0.001){
    vec3 graded = pow(max(col + lift, 0.0), vec3(max(gamma, 0.04))) * gain;
    col = mix(col, graded, clamp(grade, 0.0, 1.0));
  }
  float d = distance(vUv, vec2(0.5));
  col *= 1.0 - smoothstep(0.32, 0.98, d) * max(vignette, mapVignette);
  if(analog > 0.5){
    float n = fract(sin(dot(vUv * vec2(1240.0, 780.0) + time, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * 0.055;
    col -= sin(vUv.y * 820.0 + time * 6.0) * 0.025;
    col *= vec3(1.04, 0.98, 0.90);
  }
  if(uvG.x < 0.0 || uvG.x > 1.0 || uvG.y < 0.0 || uvG.y > 1.0) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const CONTACT_AO_FRAG = `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float amount;
uniform vec2 resolution;
varying vec2 vUv;
void main(){
  vec4 texel = texture2D(tDiffuse, vUv);
  if(amount < 0.001){
    gl_FragColor = texel;
    return;
  }
  float d0 = texture2D(tDepth, vUv).x;
  vec2 px = vec2(1.6 / max(resolution.x, 1.0), 1.6 / max(resolution.y, 1.0));
  float occ = 0.0;
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2(-px.x, 0.0)).x);
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2( px.x, 0.0)).x);
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2(0.0, -px.y)).x);
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2(0.0,  px.y)).x);
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2(-px.x, -px.y)).x);
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2( px.x, -px.y)).x);
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2(-px.x,  px.y)).x);
  occ += smoothstep(0.0004, 0.0022, d0 - texture2D(tDepth, vUv + vec2( px.x,  px.y)).x);
  occ *= 0.125;
  float alive = smoothstep(0.02, 0.97, d0);
  vec3 col = texel.rgb * (1.0 - occ * amount * alive);
  gl_FragColor = vec4(col, texel.a);
}`;

export function decorateGate(THREE, ring, size, col) {
  ring.material.color.setHex(0x16181e);
  ring.material.emissive.setHex(0x000000);
  ring.material.emissiveIntensity = 0;
  ring.material.roughness = 0.32;
  ring.material.metalness = 0.55;
  const led = new THREE.Mesh(
    new THREE.TorusGeometry(size + size * 0.055, size * 0.02, 8, 36),
    new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 5.2,
      roughness: 0.22, metalness: 0.08,
    }),
  );
  led.name = 'gateLed';
  led.castShadow = false;
  led.receiveShadow = false;
  led.material.userData.looksSkip = true;
  ring.material.userData.looksSkip = true;
  ring.add(led);
  ring.userData.led = led;
  return led;
}

export function pulseGate(g, isNext, now, lighting, passed) {
  const led = g.mesh.userData && g.mesh.userData.led;
  const m = g.mesh.material;
  if (isNext) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
    if (led) {
      led.material.color.setHex(0xffffff);
      led.material.emissive.setHex(0xffffff);
      led.material.emissiveIntensity = 3.1 + pulse * 2.4;
      led.visible = true;
    } else {
      m.color.setHex(0xffffff);
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = lighting.gateEmissiveActive;
    }
    g.mesh.scale.setScalar(1 + Math.sin(now * 0.004) * 0.06);
  } else {
    const col = passed ? 0x9a3cff : g.col;
    const emit = passed ? lighting.gateEmissive * 0.7 : lighting.gateEmissive;
    if (led) {
      led.material.color.setHex(col);
      led.material.emissive.setHex(col);
      led.material.emissiveIntensity = emit;
    } else {
      m.color.setHex(col);
      m.emissive.setHex(col);
      m.emissiveIntensity = emit;
    }
    g.mesh.scale.setScalar(1);
  }
}

export async function createLooks(ctx) {
  const {
    THREE, renderer, scene, camera, LIGHTING, sun, sunFill, hemi,
  } = ctx;

  const bytes = { n: 0 };
  const mark = (n) => { if (n > 0) bytes.n += n; };
  async function loadBuf(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    const buf = await r.arrayBuffer();
    mark(buf.byteLength);
    return buf;
  }

  let choice = loadChoice();
  const mobile = !!(ctx && ctx.isMobile);
  let applied = choice === 'auto'
    ? resolveAutoQuality({ mobile, gpuLow: gpuHint(renderer).low, gpuHigh: gpuHint(renderer).high })
    : choice;
  let fpv = loadFpv();
  let lookSpot = null;
  let menuOpen = true;
  let orbit = { cx: 0, cy: 5, cz: 0, r: 92, h: 22, fov: 62 };
  let cityLighting = null;
  let mapLighting = null;
  let skyMesh = null, sunSprite = null, groundMesh = null;
  let composer = null, bloomPass = null, aoPass = null, fpvPass = null, motionPass = null;
  let skyMode = 'hdri';
  let env1k = null, env2k = null, envYard = null, envLevel = null;
  let texCache = {};
  let maxAniso = 8;
  try { maxAniso = renderer.capabilities.getMaxAnisotropy() || 8; } catch (e) { /* ignore */ }

  const fps = { inst: 0, avg: 60, lowMs: 0, samples: [], ready: false, t0: 0, sum: 0 };
  let firstFrameDone = false;
  let readyResolve = function () {};
  const ready = new Promise(function (r) { readyResolve = r; });

  function presetOf(name) {
    const out = phoneLookOverrides(mobile, PRESETS[name] || PRESETS.med);
    if (gpuHint(renderer).low) {
      // Software WebGL (SwiftShader etc.) blows up MSAA HalfFloat targets.
      // Cheap 8-tap contact AO stays; it is a depth sample, not GTAO.
      out.postSamples = 0;
    }
    return out;
  }

  function qualityWantsPost() {
    return applied === 'med' || applied === 'high';
  }

  function applyFpvUniforms() {
    if (!fpvPass || !fpvPass.uniforms) return;
    const forceFpv = typeof location !== 'undefined' && /(?:^|[?&])fpv=1(?:&|$)/.test(location.search || '');
    const on = fpv.enabled && (!lookSpot || forceFpv);
    const gradeOn = qualityWantsPost();
    fpvPass.enabled = on || gradeOn;
    const analog = on && fpv.style === 'analog';
    const yard = mapLighting && mapLighting.mapId === 'backyard';
    fpvPass.uniforms.barrel.value = on ? (yard ? 0 : analog ? 0.18 : 0.12) : 0;
    const mapV = (fpvPass.uniforms.mapVignette && fpvPass.uniforms.mapVignette.value) || 0;
    fpvPass.uniforms.vignette.value = analog ? 0.58 : (on ? (mapV > 0.01 ? mapV : 0.36) : 0);
    fpvPass.uniforms.ca.value = on ? (analog ? 0.006 : 0.0022) : 0;
    fpvPass.uniforms.analog.value = analog ? 1 : 0;
    if (fpvPass.uniforms.grade && !gradeOn) fpvPass.uniforms.grade.value = 0;
    if (fpvPass.uniforms.mapVignette && !gradeOn) fpvPass.uniforms.mapVignette.value = 0;
    if (motionPass) motionPass.enabled = on && !!fpv.motionBlur;
  }

  function applyAniso(root, n) {
    if (!root) return;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) {
          if (m[k] && m[k].anisotropy !== undefined) {
            m[k].anisotropy = n;
            m[k].needsUpdate = true;
          }
        }
      }
    });
  }

  function attachDepthTexture(rt) {
    if (!rt || rt.depthTexture) return;
    const dt = new THREE.DepthTexture();
    dt.format = THREE.DepthFormat;
    dt.type = THREE.UnsignedIntType;
    rt.depthTexture = dt;
  }

  async function buildComposer() {
    const mods = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/AfterimagePass.js').catch(() => null),
    ]);
    const EffectComposer = mods[0].EffectComposer;
    const RenderPass = mods[1].RenderPass;
    const UnrealBloomPass = mods[2].UnrealBloomPass;
    const OutputPass = mods[3].OutputPass;
    const ShaderPass = mods[4].ShaderPass;
    const AfterimagePass = mods[5] && mods[5].AfterimagePass;

    const c = new EffectComposer(renderer);
    attachDepthTexture(c.renderTarget1);
    attachDepthTexture(c.renderTarget2);
    c.addPass(new RenderPass(scene, camera));
    const boot = presetOf(applied);
    aoPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        amount: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: FPV_VERT,
      fragmentShader: CONTACT_AO_FRAG,
    });
    aoPass.enabled = !!boot.ao;
    const aoRender = aoPass.render.bind(aoPass);
    aoPass.render = function (gl, writeBuffer, readBuffer, deltaTime, maskActive) {
      if (this.uniforms.tDepth) {
        this.uniforms.tDepth.value = (readBuffer && readBuffer.depthTexture) || null;
      }
      if (this.uniforms.resolution) {
        const w = (readBuffer && readBuffer.width) || gl.domElement.width || 1;
        const h = (readBuffer && readBuffer.height) || gl.domElement.height || 1;
        this.uniforms.resolution.value.set(w, h);
      }
      aoRender(gl, writeBuffer, readBuffer, deltaTime, maskActive);
    };
    c.addPass(aoPass);
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      LIGHTING.bloomStrength, LIGHTING.bloomRadius, LIGHTING.bloomThreshold,
    );
    bloomPass.enabled = boot.bloom !== false && (boot.bloomScale || 0) > 0;
    c.addPass(bloomPass);
    fpvPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        barrel: { value: 0.12 },
        vignette: { value: 0.36 },
        ca: { value: 0.0022 },
        analog: { value: 0 },
        time: { value: 0 },
        grade: { value: 0 },
        lift: { value: new THREE.Vector3(0, 0, 0) },
        gamma: { value: 1 },
        gain: { value: new THREE.Vector3(1, 1, 1) },
        mapVignette: { value: 0 },
      },
      vertexShader: FPV_VERT,
      fragmentShader: FPV_FRAG,
    });
    c.addPass(fpvPass);
    if (AfterimagePass) {
      motionPass = new AfterimagePass(0.22);
      motionPass.enabled = false;
      c.addPass(motionPass);
    }
    c.addPass(new OutputPass());
    composer = c;
    applyMapPostNow();
    applyFpvUniforms();
    return c;
  }

  function sizeComposer() {
    if (!composer) return;
    const canvas = renderer.domElement;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const p = presetOf(applied);
    try {
      composer.renderTarget1.samples = p.postSamples;
      composer.renderTarget2.samples = p.postSamples;
    } catch (e) { /* ignore */ }
    composer.setSize(w, h);
    attachDepthTexture(composer.renderTarget1);
    attachDepthTexture(composer.renderTarget2);
    if (aoPass && aoPass.setSize) {
      const pr = renderer.getPixelRatio();
      aoPass.setSize(Math.max(1, Math.round(w * pr)), Math.max(1, Math.round(h * pr)));
    }
    if (bloomPass && p.bloomScale !== 1) {
      const pr = renderer.getPixelRatio();
      bloomPass.setSize(
        Math.max(1, Math.round(w * pr * p.bloomScale)),
        Math.max(1, Math.round(h * pr * p.bloomScale)),
      );
    }
  }

  const hdrCache = {};
  async function loadHdr(url) {
    if (hdrCache[url]) return hdrCache[url];
    hdrCache[url] = (async function () {
      const hdrMod = await import('three/addons/loaders/HDRLoader.js').catch(() => import('three/addons/loaders/RGBELoader.js'));
      const Loader = hdrMod.HDRLoader || hdrMod.RGBELoader;
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      mark(buf.byteLength);
      const obj = URL.createObjectURL(new Blob([buf]));
      let tex;
      try { tex = await new Loader().loadAsync(obj); }
      finally { URL.revokeObjectURL(obj); }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      if (skyMode !== 'gradient') {
        if (skyMesh) skyMesh.visible = false;
        if (sunSprite) sunSprite.visible = false;
        scene.background = tex;
      }
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
      // City paints its own night sky. Assigning the dawn HDRI here is what
      // washed Kenney cars into translucent blue several seconds after load.
      if (!cityKeepsOwnSky()) scene.environment = env;
      return env;
    })();
    try {
      return await hdrCache[url];
    } catch (e) {
      delete hdrCache[url];
      throw e;
    }
  }

  function cityKeepsOwnSky() {
    if (mapLighting && mapLighting.citySky) return true;
    return skyMode === 'gradient' && !!(skyMesh && skyMesh.userData && skyMesh.userData.citySky);
  }

  function applySkyModeNow() {
    if (skyMode !== 'gradient') return;
    const citySky = cityKeepsOwnSky();
    if (skyMesh) skyMesh.visible = true;
    if (sunSprite) sunSprite.visible = !citySky;
    const bgHex = citySky ? 0x070014 : (scene.fog ? scene.fog.color.getHex() : 0xc9a57a);
    if (scene.background && scene.background.isColor && scene.fog && scene.background !== scene.fog.color) {
      scene.background.setHex(bgHex);
    } else {
      scene.background = new THREE.Color(bgHex);
    }
    if (citySky) {
      scene.environment = null;
      if ('environmentIntensity' in scene) scene.environmentIntensity = 0;
    } else if ('environmentIntensity' in scene) {
      scene.environmentIntensity = 0.18;
    }
    if ('backgroundIntensity' in scene) scene.backgroundIntensity = citySky ? 0.08 : 0.14;
    if ('backgroundBlurriness' in scene) scene.backgroundBlurriness = 0.04;
  }
  function applyEnv(env) {
    if (skyMode === 'gradient') {
      if (!cityKeepsOwnSky()) scene.environment = env;
      applySkyModeNow();
      return;
    }
    scene.environment = env;
    scene.background = env;
    const yard = mapLighting && mapLighting.mapId === 'backyard';
    if ('environmentIntensity' in scene) scene.environmentIntensity = yard ? 0.62 : 0.72;
    if ('backgroundIntensity' in scene) scene.backgroundIntensity = yard ? 0.88 : 0.48;
    if ('backgroundBlurriness' in scene) scene.backgroundBlurriness = yard ? 0.02 : 0.08;
    // Align Poly Haven kiara_1_dawn sun with the existing key-light vector.
    // kloofendal_48d afternoon sun sits near +X; a small yaw keeps the key light honest.
    const yaw = yard ? 0.85 : 3.55;
    if (scene.environmentRotation) scene.environmentRotation.set(0, yaw, 0);
    if (scene.backgroundRotation) scene.backgroundRotation.set(0, yaw, 0);
    if (skyMesh) skyMesh.visible = false;
    if (sunSprite) sunSprite.visible = false;
    scene.fog.color.setHex(LIGHTING.fogColor);
  }
  function setSkyMode(mode) {
    skyMode = mode === 'gradient' ? 'gradient' : 'hdri';
    if (skyMode === 'gradient') applySkyModeNow();
    else if (envLevel === '2k' && env2k) applyEnv(env2k);
    else if (env1k) applyEnv(env1k);
    return skyMode;
  }

  async function ensureHdr(level) {
    const yard = mapLighting && mapLighting.mapId === 'backyard';
    if (yard) {
      if (envLevel === 'yard-1k' && envYard) {
        applyEnv(envYard);
        return;
      }
      if (!envYard) envYard = await loadHdr(HDRI_YARD_1K);
      applyEnv(envYard);
      envLevel = 'yard-1k';
      return;
    }
    if (envLevel === level) return;
    if (level === '2k') {
      try {
        if (!env2k) env2k = await loadHdr(HDRI_2K);
        applyEnv(env2k);
        envLevel = '2k';
        return;
      } catch (e) {
        console.warn('looks 2k HDRI failed, using 1k', e);
      }
    }
    if (!env1k) env1k = await loadHdr(HDRI_1K);
    applyEnv(env1k);
    envLevel = '1k';
  }

  function texLoader() {
    const l = new THREE.TextureLoader();
    return (url, colorSpace) => new Promise((resolve, reject) => {
      l.load(url, (t) => {
        // TextureLoader does not expose byte length; approximate via fetch later if needed.
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = Math.min(maxAniso, presetOf(applied).anisotropy);
        if (colorSpace) t.colorSpace = colorSpace;
        resolve(t);
      }, undefined, reject);
    });
  }

  async function loadSet(name, maps) {
    const key = name + ':' + maps;
    if (texCache[key]) return texCache[key];
    texCache[key] = (async function () {
      const load = texLoader();
      const out = {};
      const kinds = maps === 'pbr' ? ['diff', 'nor', 'rough'] : ['diff'];
      const jobs = kinds.map((kind) => {
        const space = kind === 'diff' ? THREE.SRGBColorSpace : undefined;
        return load(`${ASSET}/tex/${name}_${kind}_1k.webp`, space).then((t) => {
          out[kind] = t;
        });
      });
      await Promise.all(jobs);
      return out;
    })();
    try {
      return await texCache[key];
    } catch (e) {
      delete texCache[key];
      throw e;
    }
  }

  function composeGround(grass, asphalt, sidewalk) {
    const s = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    function tile(img) {
      const src = img && (img.image || img);
      if (!src) { g.fillStyle = '#7a8a4a'; return; }
      const c2 = document.createElement('canvas');
      c2.width = c2.height = 256;
      c2.getContext('2d').drawImage(src, 0, 0, 256, 256);
      g.fillStyle = g.createPattern(c2, 'repeat');
    }
    tile(grass);
    g.fillRect(0, 0, s, s);
    const rw = s * 0.16, sw = s * 0.035;
    tile(sidewalk);
    g.fillRect(0, 0, s, rw + sw);
    g.fillRect(0, 0, rw + sw, s);
    tile(asphalt);
    g.fillRect(0, 0, s, rw);
    g.fillRect(0, 0, rw, s);
    g.strokeStyle = '#d8c860';
    g.setLineDash([14, 16]);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, rw / 2); g.lineTo(s, rw / 2);
    g.moveTo(rw / 2, 0); g.lineTo(rw / 2, s);
    g.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(maxAniso, presetOf(applied).anisotropy);
    t.needsUpdate = true;
    return t;
  }

  async function applyWorldMaps() {
    const p = presetOf(applied);
    const maps = p.maps;
    const [grass, asphalt, concrete, facade] = await Promise.all([
      loadSet('grass', maps),
      loadSet('asphalt', maps),
      loadSet('concrete', maps),
      loadSet('facade', maps),
    ]);
    if (groundMesh && groundMesh.material && !(groundMesh.material.userData && groundMesh.material.userData.artLocked)) {
      const composed = composeGround(grass.diff, asphalt.diff, concrete.diff);
      const mat = groundMesh.material;
      if (mat.map && mat.map !== composed && mat.userData && mat.userData.looksComposed) {
        mat.map.dispose();
      }
      mat.map = composed;
      mat.userData.looksComposed = true;
      if (maps === 'pbr' && grass.nor) {
        mat.normalMap = grass.nor;
        mat.normalScale = new THREE.Vector2(0.7, 0.7);
        mat.roughnessMap = grass.rough;
        mat.roughness = 1;
      } else {
        mat.normalMap = null;
        mat.roughnessMap = null;
        mat.roughness = 0.92;
      }
      mat.envMapIntensity = 0.7;
      mat.needsUpdate = true;
    }
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !m.isMeshStandardMaterial) continue;
        if (m.userData && m.userData.looksSkip) continue;
        if (o === groundMesh) continue;
        if (o.name === 'gateLed' || (o.parent && o.parent.userData && o.parent.userData.led === o)) continue;
        m.envMapIntensity = m.envMapIntensity == null ? 1 : m.envMapIntensity;
        // Procedural plaster facades: canvas window maps stay as fallback albedo
        // until we attach real PBR detail. Only retarget materials that still
        // use a canvas (no image src) and look like walls.
        if (m.userData.looksFacade) {
          // Keep the canvas window albedo; plaster is only contact detail.
          if (maps === 'pbr' && facade.nor) {
            m.normalMap = facade.nor;
            m.normalScale = new THREE.Vector2(0.45, 0.45);
            m.roughnessMap = facade.rough;
            m.roughness = 1;
          } else {
            m.normalMap = null;
            m.roughnessMap = null;
            m.roughness = 0.9;
          }
          m.envMapIntensity = 0.85;
          m.needsUpdate = true;
        }
        if (m.userData.looksRoof && concrete.diff) {
          m.map = concrete.diff;
          m.map.repeat.set(2, 2);
          if (maps === 'pbr' && concrete.nor) {
            m.normalMap = concrete.nor;
            m.roughnessMap = concrete.rough;
            m.roughness = 1;
          }
          m.needsUpdate = true;
        }
        const set = m.userData.looksSet;
        if (set) {
          const pack = set === 'wood' ? facade
            : set === 'grass' ? grass
            : set === 'asphalt' ? asphalt
            : set === 'concrete' ? concrete
            : facade;
          if (pack && pack.diff && !m.userData.looksComposed && !m.map) {
            m.map = pack.diff;
            if (m.map.repeat) m.map.repeat.set(2, 2);
          }
          if (maps === 'pbr' && pack.nor) {
            m.normalMap = pack.nor;
            m.normalScale = new THREE.Vector2(set === 'wood' ? 0.35 : 0.7, set === 'wood' ? 0.35 : 0.7);
            m.roughnessMap = pack.rough;
            m.roughness = 1;
          } else {
            m.normalMap = null;
            m.roughnessMap = null;
          }
          m.envMapIntensity = 0.8;
          m.needsUpdate = true;
        }
      }
    });
    applyAniso(scene, Math.min(maxAniso, p.anisotropy));
  }

  function applyLights(p) {
    renderer.toneMappingExposure = LIGHTING.exposure;
    sun.castShadow = !!p.shadows;
    sun.intensity = LIGHTING.sunIntensity;
    if (sunFill) sunFill.intensity = LIGHTING.fillIntensity;
    if (hemi) hemi.intensity = LIGHTING.hemiIntensity;
    const n = p.shadowMapSize;
    if (sun.shadow.mapSize.x !== n) {
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      sun.shadow.mapSize.set(n, n);
    }
  }

  async function setQuality(name, fromAuto) {
    if (name !== 'low' && name !== 'med' && name !== 'high' && name !== 'auto') return applied;
    if (!fromAuto) {
      choice = name;
      saveChoice(name);
    }
    const next = name === 'auto'
      ? resolveAutoQuality({ mobile, gpuLow: gpuHint(renderer).low, gpuHigh: gpuHint(renderer).high })
      : name;
    applied = next;
    const p = presetOf(next);
    renderer.setPixelRatio(p.pixelRatio);
    applyLights(p);
    if (qualityWantsPost()) {
      try { await ensureComposer(); } catch (e) { /* renderer-only fallback */ }
    }
    if (aoPass) aoPass.enabled = !!p.ao && qualityWantsPost();
    if (bloomPass) bloomPass.enabled = p.bloom !== false && (p.bloomScale || 0) > 0 && qualityWantsPost();
    applyMapPostNow();
    applyFpvUniforms();
    sizeComposer();
    if (ctx.onResize) ctx.onResize();
    try { await ensureHdr(mobile && p.hdri === '2k' ? '1k' : p.hdri); } catch (e) { console.warn('looks HDRI', e); }
    try { await applyWorldMaps(); } catch (e) { console.warn('looks PBR', e); }
    applyMapLooksNow();
    if (skyMode === 'gradient') applySkyModeNow();
    fps.lowMs = 0;
    return applied;
  }

  function setFpv(opts) {
    if (!opts) return fpv;
    if (opts.enabled != null) fpv.enabled = !!opts.enabled;
    if (opts.style) fpv.style = opts.style === 'analog' ? 'analog' : 'hd';
    if (opts.motionBlur != null) fpv.motionBlur = !!opts.motionBlur;
    saveFpv(fpv);
    applyFpvUniforms();
    return fpv;
  }

  function setLookSpot(name) {
    lookSpot = name && LOOK_SPOTS[name] ? name : null;
    applyFpvUniforms();
  }

  function applyLookSpot() {
    if (lookSpot) {
      const s = LOOK_SPOTS[lookSpot];
      camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
      camera.lookAt(s.target[0], s.target[1], s.target[2]);
      if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
      return true;
    }
    if (menuOpen) {
      const t = performance.now() * 0.00007 + 2.4;
      camera.position.set(orbit.cx + Math.sin(t) * orbit.r, orbit.h, orbit.cz + Math.cos(t) * orbit.r);
      camera.lookAt(orbit.cx, orbit.cy, orbit.cz);
      const fov = orbit.fov || 62;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      return true;
    }
    return false;
  }

  function setMenuOpen(v) {
    menuOpen = !!v;
    const el = document.getElementById('startMenu');
    if (el) el.classList.toggle('open', menuOpen);
    document.body.classList.toggle('menu-open', menuOpen);
  }

  function setOrbit(next) {
    if (!next) return orbit;
    orbit = Object.assign({}, orbit, next);
    return orbit;
  }

  let mapLooksSpec = null;
  let mapPostSpec = null;
  function applyMapLooksNow() {
    const spec = mapLooksSpec;
    if (!spec) return;
    if (scene.fog && spec.fog != null) scene.fog.density = spec.fog;
    if (spec.sun != null) sun.intensity = spec.sun;
    if (hemi && spec.hemi != null) hemi.intensity = spec.hemi;
    if ('environmentIntensity' in scene && spec.env != null && !cityKeepsOwnSky()) {
      scene.environmentIntensity = spec.env;
    }
    if ('backgroundIntensity' in scene && spec.bg != null) scene.backgroundIntensity = spec.bg;
  }
  function setMapLooks(spec) {
    if (!spec) return;
    if (cityLighting == null) {
      cityLighting = {
        fog: scene.fog ? scene.fog.density : LIGHTING.fogDensity,
        sun: sun.intensity,
        hemi: hemi ? hemi.intensity : LIGHTING.hemiIntensity,
      };
    }
    mapLooksSpec = spec;
    applyMapLooksNow();
  }
  function setMapLighting(spec) {
    if (!spec) return;
    mapLighting = spec;
    mapLooksSpec = spec.looks || mapLooksSpec;
    skyMode = spec.sky === 'gradient' ? 'gradient' : 'hdri';
    applyMapLooksNow();
    if (skyMode === 'gradient') applySkyModeNow();
    else if (spec.mapId === 'backyard') {
      // Do not flash the shared dawn HDRI — that reads as a flat grey sky.
      if (envYard) applyEnv(envYard);
      else {
        ensureHdr('yard-1k').catch((e) => {
          console.warn('looks yard HDRI', e);
          if (env1k) applyEnv(env1k);
        });
      }
    } else if (envLevel === '2k' && env2k) applyEnv(env2k);
    else if (env1k) applyEnv(env1k);
    return mapLighting;
  }

  function applyMapPostNow() {
    const p = presetOf(applied);
    const wantsBloom = p.bloom !== false && (p.bloomScale || 0) > 0;
    const wantsAo = !!p.ao;
    const wantsGrade = p.grade !== false && qualityWantsPost();
    const spec = mapPostSpec || {};
    if (bloomPass) bloomPass.enabled = wantsBloom && spec.bloom !== false;
    if (aoPass) aoPass.enabled = wantsAo;
    const aoAmt = spec.ao == null ? 0.4 : spec.ao;
    if (aoPass && aoPass.uniforms && aoPass.uniforms.amount) {
      aoPass.uniforms.amount.value = wantsAo ? (applied === 'high' ? aoAmt : aoAmt * 0.75) : 0;
    }
    if (!fpvPass || !fpvPass.uniforms) return;
    const u = fpvPass.uniforms;
    const lift = spec.lift || [0, 0, 0];
    const gain = spec.gain || [1, 1, 1];
    if (u.lift && u.lift.value && u.lift.value.set) u.lift.value.set(lift[0], lift[1], lift[2]);
    if (u.gain && u.gain.value && u.gain.value.set) u.gain.value.set(gain[0], gain[1], gain[2]);
    if (u.gamma) u.gamma.value = spec.gamma == null ? 1 : spec.gamma;
    if (u.grade) u.grade.value = wantsGrade ? (spec.gradeAmt == null ? 1 : spec.gradeAmt) : 0;
    if (u.mapVignette) u.mapVignette.value = wantsGrade ? (spec.vignette == null ? 0.34 : spec.vignette) : 0;
  }
  function setMapPost(spec) {
    if (spec && spec.post) {
      const post = spec.post;
      mapPostSpec = {
        lift: post.lift || [0, 0, 0],
        gamma: post.gamma == null ? 1 : post.gamma,
        gain: post.gain || [1, 1, 1],
        vignette: post.vignette == null ? 0.34 : post.vignette,
        ao: post.ao == null ? 0.4 : post.ao,
        gradeAmt: post.grade === false ? 0 : 1,
        bloom: post.bloom !== false,
      };
    } else {
      mapPostSpec = spec || null;
    }
    applyMapPostNow();
    applyFpvUniforms();
  }

  function tick(now) {
    if (fpvPass && fpvPass.uniforms && fpvPass.uniforms.time) {
      fpvPass.uniforms.time.value = now * 0.001;
    }
    if (!fps.t0) fps.t0 = now;
    const inst = fps._last ? 1000 / Math.max(1, now - fps._last) : 60;
    fps._last = now;
    fps.inst = inst;
    fps.samples.push(inst);
    fps.sum += inst;
    if (fps.samples.length > 90) fps.sum -= fps.samples.shift();
    fps.avg = fps.sum / fps.samples.length;
    if (choice === 'auto' && now - fps.t0 > 3000) {
      if (fps.avg < 55) fps.lowMs += (fps._dt || 16);
      else fps.lowMs = 0;
      if (fps.lowMs > 3000) {
        fps.lowMs = 0;
        if (applied === 'high') setQuality('med', true);
        else if (applied === 'med') setQuality('low', true);
      }
    }
    const hud = document.getElementById('fpsHud');
    if (hud) hud.textContent = Math.round(fps.avg) + ' fps · ' + applied.toUpperCase();
  }

  async function afterFirstFrame() {
    if (firstFrameDone) return;
    firstFrameDone = true;
    if (qualityWantsPost()) {
      try { await ensureComposer(); } catch (e) { /* renderer-only fallback */ }
    }
    try { await setQuality(choice); } catch (e) { console.warn('looks quality', e); }
    fps.ready = true;
    readyResolve();
  }

  function upgradeMaterials(root) {
    if (!root) return;
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && m.isMeshStandardMaterial) {
          if (m.userData && m.userData.looksSkip) continue;
          m.envMapIntensity = 1.05;
          if (m.roughness == null) m.roughness = 0.7;
        }
      }
    });
    applyAniso(root, Math.min(maxAniso, presetOf(applied).anisotropy));
  }

  function confirmSaves() {
    const out = { ok: true, found: {}, missing: [] };
    for (const k of EXISTING_SAVE_KEYS) {
      let v = null;
      try { v = localStorage.getItem(k); } catch (e) { v = null; }
      if (v == null) out.missing.push(k);
      else {
        out.found[k] = v.slice(0, 80);
        if (k.indexOf('Ghost') !== -1 || k === 'ryflyRates') {
          try { JSON.parse(v); } catch (e) { out.ok = false; out.missing.push(k + ':bad-json'); }
        }
      }
    }
    const prefixes = ['ryflyAxisMap_', 'ryflyRadioPreset_'];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (prefixes.some((p) => k && k.indexOf(p) === 0)) out.found[k] = (localStorage.getItem(k) || '').slice(0, 80);
      }
    } catch (e) { /* ignore */ }
    // New keys must not collide
    out.newKeys = {
      quality: QUALITY_KEY, fpv: FPV_KEY, crosshair: CROSSHAIR_KEY,
      customTracks: 'quadmathSimCustomTracks',
      selectedTrack: 'quadmathSimTrack',
      whoop: 'quadmathSimWhoop',
      touch: 'quadmathSimTouch',
      flightMode: 'quadmathSimFlightMode',
      threeD: 'quadmathSim3D',
      secrets: 'quadmathSimSecrets',
    };
    return out;
  }

  // First frame uses the canvas sky + renderer.render. Composer, HDRI, and
  // PBR maps wait for afterFirstFrame so a phone is not blocked on addons.
  const bootP = presetOf(applied);
  renderer.setPixelRatio(bootP.pixelRatio);
  applyLights(bootP);
  let composerReady = null;
  function ensureComposer() {
    if (!composerReady) {
      composerReady = buildComposer().then(function (c) {
        if (ctx.onComposer) ctx.onComposer(c);
        return c;
      }).catch(function () { return null; });
    }
    return composerReady;
  }

  return {
    get composer() { return qualityWantsPost() ? composer : null; },
    get bloomPass() { return bloomPass; },
    get aoPass() { return aoPass; },
    get choice() { return choice; },
    get applied() { return applied; },
    get mobile() { return mobile; },
    get shadowMapSize() { return presetOf(applied).shadowMapSize; },
    get fpv() { return fpv; },
    get menuOpen() { return menuOpen; },
    fps,
    attachSky(sky, sprite) { skyMesh = sky; sunSprite = sprite; },
    attachGround(mesh) { groundMesh = mesh; },
    attachHemi(h) { /* reserved */ },
    sizeComposer,
    setQuality,
    setFpv,
    setLookSpot,
    applyLookSpot,
    setMenuOpen,
    setOrbit,
    setMapLooks,
    setMapLighting,
    setMapPost,
    setSkyMode,
    setGrade(v) {
      if (v && typeof v === 'object') {
        setMapPost(v);
        return;
      }
      if (fpvPass && fpvPass.uniforms && fpvPass.uniforms.grade) {
        fpvPass.uniforms.grade.value = v ? 1 : 0;
        applyFpvUniforms();
      }
    },
    get skyMode() { return skyMode; },
    tick,
    afterFirstFrame,
    upgradeMaterials,
    confirmSaves,
    downloadBytes() { return { bytes: bytes.n, mb: +(bytes.n / 1e6).toFixed(2), applied, hdri: envLevel }; },
    gpu: gpuHint(renderer),
    ready,
  };
}
