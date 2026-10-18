// QuadMath sim V1 looks — environment, PBR, AO, FPV lens, quality presets.
// Visual only. Does not touch physics, colliders, tracks, ghosts, or existing
// localStorage keys. New keys: quadmathSimQuality, quadmathSimFpv.
import { resolveAutoQuality } from './sim-touch.js?v=2b2c215c8a82';

export const QUALITY_KEY = 'quadmathSimQuality';
export const FPV_KEY = 'quadmathSimFpv';

export const LOOK_SPOTS = {
  spawn:  { pos: [0, 3.2, 32], target: [0, 6, -40] },
  t0g1:   { pos: [-122, 8.5, -96], target: [-140, 7, -120] },
  t1mid:  { pos: [322, 50, -478], target: [350, 46, -515] },
  street: { pos: [6, 2.8, 90], target: [0, 3.5, -30] },
  roof:   { pos: [-40, 48, 95], target: [-20, 12, 10] },
  living: { pos: [0, 4.6, 8], target: [0, 1.8, -6] },
  garage: { pos: [0, 5.2, 12], target: [2, 2.2, -6] },
  warehouse: { pos: [0, 7.5, 36], target: [0, 3.2, -8] },
  backyard: { pos: [0, 8, 22], target: [0, 2, -8] },
  office: { pos: [12.2, 4.6, 16.4], target: [-6, 1.4, -6] },
  gym: { pos: [9.2, 8.2, 18], target: [0, 2.6, -12] },
  trainer: { pos: [8, 6.2, 14], target: [0, 1.6, -4] },
  room: { pos: [3.4, 4.2, 6.2], target: [-1, 1.2, -2] },
  builder: { pos: [0, 14, 0.1], target: [0, 0, 0] },
};

const ASSET = 'assets/sim-looks';
const HDRI_1K = `${ASSET}/hdri/kiara_1_dawn_1k.hdr`;
const HDRI_2K = `${ASSET}/hdri/kiara_1_dawn_2k.hdr`;

export const PRESETS = {
  low: {
    pixelRatio: 1,
    shadowMapSize: 512,
    shadows: true,
    ao: false,
    bloomScale: 0.5,
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
    bloomScale: 0.75,
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
    bloomScale: 1,
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

function gpuHint(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    const software = /swiftshader|llvmpipe|software|virtualbox/i.test(info);
    const low = software || (/intel|mali|adreno|apple gpu|iris|uhd|hd graphics/i.test(info)
      && !/nvidia|geforce|radeon|amd|apple m[1-9]/i.test(info));
    return { info, low };
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
  float d = distance(vUv, vec2(0.5));
  col *= 1.0 - smoothstep(0.32, 0.98, d) * vignette;
  if(analog > 0.5){
    float n = fract(sin(dot(vUv * vec2(1240.0, 780.0) + time, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * 0.055;
    col -= sin(vUv.y * 820.0 + time * 6.0) * 0.025;
    col *= vec3(1.04, 0.98, 0.90);
  }
  if(uvG.x < 0.0 || uvG.x > 1.0 || uvG.y < 0.0 || uvG.y > 1.0) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
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

export function pulseGate(g, isNext, now, lighting) {
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
    if (led) {
      led.material.color.setHex(g.col);
      led.material.emissive.setHex(g.col);
      led.material.emissiveIntensity = lighting.gateEmissive;
    } else {
      m.color.setHex(g.col);
      m.emissive.setHex(g.col);
      m.emissiveIntensity = lighting.gateEmissive;
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
    ? resolveAutoQuality({ mobile, gpuLow: gpuHint(renderer).low })
    : choice;
  let fpv = loadFpv();
  let lookSpot = null;
  let menuOpen = true;
  let orbit = { cx: 0, cy: 5, cz: 0, r: 92, h: 22, fov: 62 };
  let cityLighting = null;
  let skyMesh = null, sunSprite = null, groundMesh = null;
  let composer = null, bloomPass = null, aoPass = null, fpvPass = null, motionPass = null;
  let env1k = null, env2k = null, envLevel = null;
  let texCache = {};
  let maxAniso = 8;
  try { maxAniso = renderer.capabilities.getMaxAnisotropy() || 8; } catch (e) { /* ignore */ }

  const fps = { inst: 0, avg: 60, lowMs: 0, samples: [], ready: false, t0: 0 };
  let firstFrameDone = false;
  let readyResolve = function () {};
  const ready = new Promise(function (r) { readyResolve = r; });

  function presetOf(name) {
    const p = PRESETS[name] || PRESETS.med;
    const cap = p.pixelRatioCap || p.pixelRatio || 1;
    const out = Object.assign({}, p, {
      pixelRatio: Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, cap),
    });
    if (gpuHint(renderer).low) {
      // Software WebGL (SwiftShader etc.) blows up MSAA HalfFloat targets and GTAO.
      out.postSamples = 0;
      out.ao = false;
    }
    return out;
  }

  function applyFpvUniforms() {
    if (!fpvPass || !fpvPass.uniforms) return;
    const on = fpv.enabled && !lookSpot;
    fpvPass.enabled = on;
    const analog = fpv.style === 'analog';
    fpvPass.uniforms.barrel.value = analog ? 0.18 : 0.12;
    fpvPass.uniforms.vignette.value = analog ? 0.58 : 0.36;
    fpvPass.uniforms.ca.value = analog ? 0.006 : 0.0022;
    fpvPass.uniforms.analog.value = analog ? 1 : 0;
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

  async function buildComposer() {
    const mods = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/AfterimagePass.js').catch(() => null),
      import('three/addons/postprocessing/GTAOPass.js').catch(() => null),
    ]);
    const EffectComposer = mods[0].EffectComposer;
    const RenderPass = mods[1].RenderPass;
    const UnrealBloomPass = mods[2].UnrealBloomPass;
    const OutputPass = mods[3].OutputPass;
    const ShaderPass = mods[4].ShaderPass;
    const AfterimagePass = mods[5] && mods[5].AfterimagePass;
    const GTAOPass = mods[6] && mods[6].GTAOPass;

    const c = new EffectComposer(renderer);
    c.addPass(new RenderPass(scene, camera));
    if (GTAOPass && !gpuHint(renderer).low) {
      try {
        const w = Math.max(1, renderer.domElement.width || 512);
        const h = Math.max(1, renderer.domElement.height || 512);
        aoPass = new GTAOPass(scene, camera, w, h);
        aoPass.output = GTAOPass.OUTPUT.Default;
        aoPass.blendIntensity = 0.85;
        if (aoPass.updateGtaoMaterial) {
          aoPass.updateGtaoMaterial({ radius: 0.35, samples: 12, thickness: 1, scale: 1.0 });
        }
        c.addPass(aoPass);
      } catch (e) {
        aoPass = null;
      }
    }
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      LIGHTING.bloomStrength, LIGHTING.bloomRadius, LIGHTING.bloomThreshold,
    );
    c.addPass(bloomPass);
    fpvPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        barrel: { value: 0.12 },
        vignette: { value: 0.36 },
        ca: { value: 0.0022 },
        analog: { value: 0 },
        time: { value: 0 },
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

  async function loadHdr(url) {
    const hdrMod = await import('three/addons/loaders/HDRLoader.js').catch(() => import('three/addons/loaders/RGBELoader.js'));
    const Loader = hdrMod.HDRLoader || hdrMod.RGBELoader;
    fetch(url).then((r) => mark(+r.headers.get('content-length') || 0)).catch(() => {});
    const tex = await new Loader().loadAsync(url);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if (skyMesh) skyMesh.visible = false;
    if (sunSprite) sunSprite.visible = false;
    scene.background = tex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    scene.environment = env;
    return env;
  }

  function applyEnv(env) {
    scene.environment = env;
    scene.background = env;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.72;
    if ('backgroundIntensity' in scene) scene.backgroundIntensity = 0.48;
    if ('backgroundBlurriness' in scene) scene.backgroundBlurriness = 0.08;
    // Align Poly Haven kiara_1_dawn sun with the existing key-light vector.
    if (scene.environmentRotation) scene.environmentRotation.set(0, 3.55, 0);
    if (scene.backgroundRotation) scene.backgroundRotation.set(0, 3.55, 0);
    if (skyMesh) skyMesh.visible = false;
    if (sunSprite) sunSprite.visible = false;
    scene.fog.color.setHex(LIGHTING.fogColor);
  }

  async function ensureHdr(level) {
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
    const load = texLoader();
    const out = {};
    const jobs = [
      load(`${ASSET}/tex/${name}_diff_1k.webp`, THREE.SRGBColorSpace).then((t) => { out.diff = t; }),
    ];
    if (maps === 'pbr') {
      jobs.push(load(`${ASSET}/tex/${name}_nor_1k.webp`).then((t) => { out.nor = t; }));
      jobs.push(load(`${ASSET}/tex/${name}_rough_1k.webp`).then((t) => { out.rough = t; }));
    }
    // Count shipped file sizes once via HEAD-less fetch of the same URLs we display.
    for (const kind of maps === 'pbr' ? ['diff', 'nor', 'rough'] : ['diff']) {
      fetch(`${ASSET}/tex/${name}_${kind}_1k.webp`).then((r) => {
        const n = +r.headers.get('content-length') || 0;
        mark(n);
      }).catch(() => {});
    }
    await Promise.all(jobs);
    texCache[key] = out;
    return out;
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
    if (groundMesh && groundMesh.material) {
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
      ? resolveAutoQuality({ mobile, gpuLow: gpuHint(renderer).low })
      : name;
    applied = next;
    const p = presetOf(next);
    renderer.setPixelRatio(p.pixelRatio);
    applyLights(p);
    if (aoPass) aoPass.enabled = !!p.ao && !gpuHint(renderer).low;
    applyFpvUniforms();
    sizeComposer();
    if (ctx.onResize) ctx.onResize();
    try { await ensureHdr(p.hdri); } catch (e) { console.warn('looks HDRI', e); }
    try { await applyWorldMaps(); } catch (e) { console.warn('looks PBR', e); }
    applyMapLooksNow();
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
  function applyMapLooksNow() {
    const spec = mapLooksSpec;
    if (!spec) return;
    if (scene.fog && spec.fog != null) scene.fog.density = spec.fog;
    if (spec.sun != null) sun.intensity = spec.sun;
    if (hemi && spec.hemi != null) hemi.intensity = spec.hemi;
    if ('environmentIntensity' in scene && spec.env != null) scene.environmentIntensity = spec.env;
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

  function tick(now) {
    if (fpvPass && fpvPass.uniforms && fpvPass.uniforms.time) {
      fpvPass.uniforms.time.value = now * 0.001;
    }
    if (!fps.t0) fps.t0 = now;
    const inst = fps._last ? 1000 / Math.max(1, now - fps._last) : 60;
    fps._last = now;
    fps.inst = inst;
    fps.samples.push(inst);
    if (fps.samples.length > 90) fps.samples.shift();
    fps.avg = fps.samples.reduce((a, b) => a + b, 0) / fps.samples.length;
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
    try { await ensureComposer(); } catch (e) { /* renderer-only fallback */ }
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
      quality: QUALITY_KEY, fpv: FPV_KEY,
      customTracks: 'quadmathSimCustomTracks',
      selectedTrack: 'quadmathSimTrack',
      whoop: 'quadmathSimWhoop',
      touch: 'quadmathSimTouch',
      flightMode: 'quadmathSimFlightMode',
      threeD: 'quadmathSim3D',
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
    get composer() { return composer; },
    get bloomPass() { return bloomPass; },
    get aoPass() { return aoPass; },
    get choice() { return choice; },
    get applied() { return applied; },
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
    tick,
    afterFirstFrame,
    upgradeMaterials,
    confirmSaves,
    downloadBytes() { return { bytes: bytes.n, mb: +(bytes.n / 1e6).toFixed(2), applied, hdri: envLevel }; },
    gpu: gpuHint(renderer),
    ready,
  };
}
