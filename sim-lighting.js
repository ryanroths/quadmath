// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Scene IBL / sky / fog-colour resolver. Visual only.
// resolveSceneLighting is pure: inputs -> scene.environment, background,
// intensities, rotation, fog colour, exposure. applySceneLighting is the ONLY
// writer of those scene fields. Map vibes, looks sky mode and async HDRI
// loads patch inputs via updateSceneLighting, so the result no longer depends
// on call order or when an HDRI promise lands (City dawn-IBL blue cars,
// leftover HDRI flash, fog/background shared-Color bugs).
export const CITY_SKY_HEX = 0x070014;

export function sceneLightingInputs(over) {
  return Object.assign({
    mapId: null,      // resolved map id ('city', 'backyard', indoor ids)
    citySky: false,   // map paints its own night sky (no IBL)
    skyCity: false,   // sky dome currently wears the city texture
    sky: null,        // looks sky mode: 'gradient' | 'hdri' (null = looks not ready)
    fogColor: null,   // hex; LIGHTING.fogColor of the active vibe
    exposure: null,
    looks: null,      // vibe looks { env, bg }
    envs: null,       // { dawn, yard, rig } PMREM textures once loaded / built, else null
  }, over || {});
}

// The Rig's ambient image light: a soft grey room, radiance 1 at the horizon,
// a little dimmer overhead and warmer underfoot, where the key-lit floor
// bounces (so the ceiling is never black). No sun, no lamp in it: the key
// stays the one light. Built once per renderer; the vibe's looks.env scales
// it (sim-art.js VIBES.rig: 15% of the key).
const RIG_ENV = new WeakMap();
export function rigAmbientEnv(THREE, renderer) {
  if (!THREE || !THREE.PMREMGenerator || !renderer) return null;
  let env = RIG_ENV.get(renderer);
  if (env) return env;
  try {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const up = Math.max(0, pos.getY(i)), down = Math.max(0, -pos.getY(i));
      col[i * 3] = 1 - 0.1 * up + 0.2 * down;
      col[i * 3 + 1] = 1 - 0.1 * up + 0.12 * down;
      col[i * 3 + 2] = 1 - 0.08 * up + 0.02 * down;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    const room = new THREE.Scene();
    room.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    env = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    geo.dispose();
    mat.dispose();
  } catch (e) {
    return null;
  }
  RIG_ENV.set(renderer, env);
  return env;
}

export function resolveSceneLighting(input) {
  const s = sceneLightingInputs(input);
  const citySky = !!s.citySky || (s.sky === 'gradient' && !!s.skyCity);
  const yard = s.mapId === 'backyard';
  // The Rig takes its own grey room (rigAmbientEnv), never an HDRI.
  const rig = s.mapId === 'rig';
  const want = citySky ? null : (yard ? 'yard' : rig ? 'rig' : 'dawn');
  const env = (want && s.envs && s.envs[want]) || null;
  const looks = s.looks || {};
  const out = {
    want,
    envReady: !want || !!env,
    citySky,
    environment: null,
    background: null,   // texture background (HDRI), or null
    bgHex: null,        // colour background, applied to its own Color
    environmentIntensity: 0,
    backgroundIntensity: 0.08,
    backgroundBlurriness: 0.04,
    // Align kiara_1_dawn sun with the key light; kloofendal_48d (yard) sun sits near +X.
    rotationY: yard ? 0.85 : 3.55,
    fogColor: s.fogColor == null ? null : s.fogColor,
    exposure: s.exposure == null ? null : s.exposure,
  };
  if (rig) {
    // Ambient only: the room is closed, so the background is a plain colour,
    // never the grey room as a sky.
    out.environment = env;
    out.environmentIntensity = looks.env != null ? looks.env : 0;
    out.bgHex = out.fogColor;
    out.backgroundIntensity = looks.bg != null ? looks.bg : 0;
    out.rotationY = 0;
    return out;
  }
  if (citySky || s.sky === 'gradient') {
    // City never takes the dawn HDRI as IBL — it washed Kenney cars blue.
    out.bgHex = citySky ? CITY_SKY_HEX : out.fogColor;
    out.environment = citySky ? null : env;
    out.environmentIntensity = citySky ? 0 : 0.18;
    out.backgroundIntensity = citySky ? 0.08 : 0.14;
    return out;
  }
  out.environmentIntensity = looks.env != null ? looks.env : (yard ? 1.15 : 0.72);
  out.backgroundIntensity = looks.bg != null ? looks.bg : (yard ? 0.30 : 0.48);
  out.backgroundBlurriness = yard ? 0.05 : 0.08;
  if (env) {
    out.environment = env;
    out.background = env;
  } else {
    // HDRI not loaded yet (or wrong one): plain fog-colour sky, never a
    // leftover map's HDRI.
    out.bgHex = out.fogColor;
  }
  return out;
}

export function applySceneLighting(scene, r, opts) {
  if (!scene || !r) return r;
  const o = opts || {};
  const fog = scene.fog;
  if (fog && fog.color && r.fogColor != null) fog.color.setHex(r.fogColor);
  scene.environment = r.environment;
  if (r.background) scene.background = r.background;
  else if (r.bgHex != null) {
    // Own Color, never fog.color by reference — fog writes would recolour the sky.
    const bg = scene.background;
    if (bg && bg.isColor && !(fog && bg === fog.color)) bg.setHex(r.bgHex);
    else if (o.Color) scene.background = new o.Color(r.bgHex);
    else if (fog && fog.color && fog.color.clone) scene.background = fog.color.clone().setHex(r.bgHex);
  } else scene.background = null;
  if ('environmentIntensity' in scene) scene.environmentIntensity = r.environmentIntensity;
  if ('backgroundIntensity' in scene) scene.backgroundIntensity = r.backgroundIntensity;
  if ('backgroundBlurriness' in scene) scene.backgroundBlurriness = r.backgroundBlurriness;
  if (scene.environmentRotation) scene.environmentRotation.set(0, r.rotationY, 0);
  if (scene.backgroundRotation) scene.backgroundRotation.set(0, r.rotationY, 0);
  if (o.renderer && r.exposure != null) o.renderer.toneMappingExposure = r.exposure;
  return r;
}

// One input state per scene, shared by every module that holds the scene
// (looks, map vibes). Map switch -> patch map inputs -> apply.
const STATE = new WeakMap();
export function sceneLightingState(scene) {
  let st = STATE.get(scene);
  if (!st) STATE.set(scene, st = { inputs: sceneLightingInputs(), renderer: null, Color: null });
  return st;
}
export function updateSceneLighting(scene, patch, opts) {
  if (!scene) return null;
  const st = sceneLightingState(scene);
  if (patch) {
    const envs = patch.envs ? Object.assign({}, st.inputs.envs, patch.envs) : st.inputs.envs;
    Object.assign(st.inputs, patch, { envs });
  }
  if (opts && opts.renderer) st.renderer = opts.renderer;
  if (opts && opts.Color) st.Color = opts.Color;
  return applySceneLighting(scene, resolveSceneLighting(st.inputs), st);
}
