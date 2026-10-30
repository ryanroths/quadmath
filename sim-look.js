// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The sim look: one art direction, defined once. The lighting rig, the PBR
// surfaces, the grounding, the post chain and the FPV camera live here as
// data, with the few builders that turn them into three.js. A map is on the
// look when its vibe comes from lookVibe() (sim-art.js) and its builder makes
// its surfaces with lookMaterial() (sim-maps.js); sim-looks.js (post chain,
// HDRI), sim-lighting.js (scene IBL) and the host (camera) read the rest from
// LOOK. No map carries lighting code of its own. The Rig is the first map on
// it. Assets are Poly Haven CC0 (ASSETS-LICENSES.md). Not WebFPV.

const TEX = 'assets/sim-looks/tex';

export const LOOK = Object.freeze({
  name: 'Soft Industrial',
  lighting: Object.freeze({
    // One HDRI, prefiltered (PMREM) once per renderer: the fill. The rooms are
    // closed, so it is never the background, and a fill needs no detail: 512
    // (Poly Haven's 1k, box-filtered by tools/build_sim_look_textures.py).
    hdri: 'assets/sim-looks/hdri/autoshop_01_512.hdr',
    hdriWidth: 512,
    // Environment intensity. autoshop_01 gives an up-facing face an irradiance
    // of 3.07 per unit (cosine-weighted over the upper hemisphere), so 0.5
    // fills a floor at about half the key's 2.83 (3.2 at 62 deg): a soft
    // interior, the key still the one that casts.
    env: 0.5,
    // The one hard key, and the only shadow caster. PCF soft shadows (the
    // renderer's PCFSoftShadowMap on desktop).
    key: Object.freeze({ color: 0xfff1e0, intensity: 3.2, elevation: 62, azimuth: 128 }),
    // ACES filmic is the renderer's tone map on every map; exposure is set
    // here, once.
    toneMapping: 'ACESFilmic',
    exposure: 1.0,
    background: 0x0b0c0e,
  }),
  // Texture sets: Poly Haven albedo + normal + roughness, built by
  // tools/build_sim_look_textures.py. The floor is 1k, the zone sets 512. A
  // set ships an albedo (_diff_) and a normal map with the roughness's
  // deviation from its mean in alpha (_nr_); a set with no normal (packed)
  // ships one file, the albedo with that roughness in its alpha (_dr_).
  // mirror: a crop that does not tile, mirrored instead.
  sets: Object.freeze({
    concrete_floor: Object.freeze({ res: '1k' }),
    painted_steel: Object.freeze({ res: '512', mirror: true }),
    galvanised: Object.freeze({ res: '512', packed: true }),
    plywood: Object.freeze({ res: '512' }),
    rubber_mat: Object.freeze({ res: '512' }),
  }),
  // Surface types: a set at a physical tile size, metres. The roughness is the
  // surface's mean; the map adds the set's own variation around it (roughVar
  // 1 = as measured). A zone hue is the material colour, a paint tint over
  // the grey albedo of a tinted set.
  surfaces: Object.freeze({
    concrete: Object.freeze({ set: 'concrete_floor', tile: 3, roughness: 0.66, roughVar: 1, normal: 1, metalness: 0 }),
    paintedBlock: Object.freeze({ set: 'concrete_floor', tile: 3, roughness: 0.86, roughVar: 0.5, normal: 0.45, metalness: 0 }),
    paintedSteel: Object.freeze({ set: 'painted_steel', tile: 1, roughness: 0.48, roughVar: 1, normal: 1, metalness: 0 }),
    enamel: Object.freeze({ set: 'painted_steel', tile: 1, roughness: 0.3, roughVar: 0.6, normal: 0.6, metalness: 0 }),
    deck: Object.freeze({ set: 'painted_steel', tile: 4, roughness: 0.82, roughVar: 0.6, normal: 0.6, metalness: 0 }),
    galvanised: Object.freeze({ set: 'galvanised', tile: 1.2, roughness: 0.36, roughVar: 1, normal: 0, metalness: 0.55 }),
    plywood: Object.freeze({ set: 'plywood', tile: 0.5, roughness: 0.78, roughVar: 1, normal: 0.8, metalness: 0 }),
    rubber: Object.freeze({ set: 'rubber_mat', tile: 2, roughness: 0.88, roughVar: 0.6, normal: 1, metalness: 0 }),
  }),
  // Grounding: the key's PCF soft shadows, soft AO under every object (baked
  // into the floor from the map's own boxes, floorAo), and the screen-space
  // contact AO in every crease (sim-looks.js).
  grounding: Object.freeze({
    contactAo: 0.5,
    floorAo: Object.freeze({ texel: 0.08, reach: 1.2, intensity: 0.85 }),
  }),
  // Saw-cut joints in a concrete floor: a cut every metre, a wider one every
  // 5 m. Metres; darkening of the albedo in the cut.
  joints: Object.freeze({ minor: 1, major: 5, minorWidth: 0.012, majorWidth: 0.024, minorDark: 0.5, majorDark: 0.62 }),
  post: Object.freeze({
    // Bloom on the gates and the edge lines only: they mark themselves
    // (markBloom), and the bright pass takes nothing else.
    bloom: Object.freeze({ strength: 0.35, radius: 0.3 }),
    vignette: 0.22,
    // Film grain: +-3% of the pixel, so it sits in the light, not the black.
    grain: 0.06,
  }),
  // White edge lines at 60%: highlights, not outlines.
  lines: Object.freeze({ color: 0xf2f0ea, level: 0.6 }),
  // The Air65's camera: BETAFPV C03, 2.1 mm (M7) lens on a 1/3" sensor. The
  // goggles crop the sensor, so the pilot sees 125 deg diagonal (owner); wider
  // fisheyes the gaps. Rendered rectilinear with a touch of barrel that keeps
  // the corners in frame.
  camera: Object.freeze({
    lensMm: 2.1,
    diagonalFov: 125,
    barrel: 0.24,
    ca: 0.0016,
    // The lens sits about a centimetre off the floor on the pad: a nearer
    // near plane, and a far plane sized to a room.
    near: 0.02,
    far: 600,
    // Mild motion blur on fast yaw only: none below 240 deg/s, full at 900.
    yawBlur: Object.freeze({ fromDps: 240, fullDps: 900, maxPx: 14 }),
  }),
});

const setKinds = (set) => (set.packed ? ['dr'] : ['diff', 'nr']);

// Every texture the look loads, with its pixel size: for the budget.
export const LOOK_TEXTURES = Object.freeze((() => {
  const out = {};
  for (const [name, set] of Object.entries(LOOK.sets)) {
    const px = set.res === '1k' ? 1024 : +set.res;
    for (const kind of setKinds(set)) out[`${TEX}/look_${name}_${kind}_${set.res}.webp`] = px;
  }
  return out;
})());

// GPU bytes of the look's textures: RGBA8 sets with mipmaps, plus the HDRI's
// PMREM (HalfFloat RGBA, three's cube-UV layout: cube faces of width / 4,
// 3 x max(face, 112) wide, 4 x face high).
export function lookTextureBytes() {
  let b = 0;
  for (const px of Object.values(LOOK_TEXTURES)) b += Math.round(px * px * 4 * 4 / 3);
  const face = LOOK.lighting.hdriWidth / 4;
  const env = 3 * Math.max(face, 112) * 4 * face * 8;
  return { sets: b, env, total: b + env };
}

// Vertical FOV, degrees, of a rectilinear view with this diagonal FOV.
export function vfovForDiagonal(diagDeg, aspect) {
  const t = Math.tan(diagDeg * Math.PI / 360) / Math.sqrt(1 + aspect * aspect);
  return Math.atan(t) * 360 / Math.PI;
}

export function lookVfov(aspect) {
  return vfovForDiagonal(LOOK.camera.diagonalFov, aspect || 16 / 9);
}

// Horizontal blur, pixels, for a camera yaw rate (deg/s): 0 below fromDps,
// maxPx at fullDps and beyond, smooth between.
export function yawBlurPx(dps, spec) {
  const s = spec || LOOK.camera.yawBlur;
  const t = Math.min(1, Math.max(0, (Math.abs(dps) - s.fromDps) / (s.fullDps - s.fromDps)));
  return s.maxPx * t * t * (3 - 2 * t);
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Cosine-weighted share of the sky a rectangle hides from a floor point
// under one of its corners: the rectangle a x b, parallel, h above.
function cornerFormFactor(a, b, h) {
  const A = a / h, B = b / h, sa = Math.sqrt(1 + A * A), sb = Math.sqrt(1 + B * B);
  return (A / sa * Math.atan(B / sa) + B / sb * Math.atan(A / sb)) / (2 * Math.PI);
}

// The same for any parallel rectangle [x0,x1] x [z0,z1] h above (x, z), by
// superposing the four corner rectangles.
function slabFormFactor(x, z, x0, x1, z0, z1, h) {
  const f = (u, v) => Math.sign(u) * Math.sign(v) * cornerFormFactor(Math.abs(u), Math.abs(v), h);
  return Math.max(0, f(x1 - x, z1 - z) - f(x0 - x, z1 - z) - f(x1 - x, z0 - z) + f(x0 - x, z0 - z));
}

// Soft AO on the floor under every box, as the share of the cosine-weighted
// sky each box hides, metres. Boxes are axis-aligned { min: [x,y,z], max },
// the room { w, d, h } centred on the origin. A box standing on the floor
// (with whatever is stacked on it) hides up to half the sky at its foot,
// scaled by how much of the horizon it spans; a raised box hides what its
// underside covers (the exact parallel-rectangle form factor); the walls hide
// half at their foot. Faded out past opts.reach so only near things count.
// One texel per opts.texel; row 0 is the +z edge (a PlaneGeometry floor's
// v = 0 once laid flat), column 0 the -x edge. 255 is open floor.
export function floorAo(boxes, room, opts) {
  const o = Object.assign({}, LOOK.grounding.floorAo, opts || {});
  const W = Math.max(1, Math.round(room.w / o.texel)), H = Math.max(1, Math.round(room.d / o.texel));
  const tx = room.w / W, tz = room.d / H;
  const same = (a, b) => Math.abs(a.min[0] - b.min[0]) < 1e-6 && Math.abs(a.max[0] - b.max[0]) < 1e-6
    && Math.abs(a.min[2] - b.min[2]) < 1e-6 && Math.abs(a.max[2] - b.max[2]) < 1e-6;
  // A box resting on one of the same footprint is part of its column.
  const onTop = (b) => boxes.some((c) => c !== b && same(b, c) && Math.abs(c.max[1] - b.min[1]) < 1e-6);
  const columns = [], slabs = [];
  for (const b of boxes) {
    if (b.min[1] < 1e-6) {
      let top = b.max[1], grew = true;
      while (grew) {
        grew = false;
        for (const c of boxes) if (same(b, c) && Math.abs(c.min[1] - top) < 1e-6) { top = c.max[1]; grew = true; }
      }
      columns.push({ x0: b.min[0], x1: b.max[0], z0: b.min[2], z1: b.max[2], top });
    } else if (!onTop(b)) {
      slabs.push({ x0: b.min[0], x1: b.max[0], z0: b.min[2], z1: b.max[2], h: b.min[1] });
    }
  }
  const vis = new Float32Array(W * H).fill(1);
  // Each caster darkens only the texels within its reach.
  const each = (x0, x1, z0, z1, r, fn) => {
    const i0 = Math.max(0, Math.floor((x0 - r + room.w / 2) / tx)), i1 = Math.min(W - 1, Math.ceil((x1 + r + room.w / 2) / tx));
    const j0 = Math.max(0, Math.floor((room.d / 2 - z1 - r) / tz)), j1 = Math.min(H - 1, Math.ceil((room.d / 2 - z0 + r) / tz));
    for (let j = j0; j <= j1; j++) {
      const z = room.d / 2 - (j + 0.5) * tz;
      for (let i = i0; i <= i1; i++) fn(j * W + i, -room.w / 2 + (i + 0.5) * tx, z);
    }
  };
  for (const c of columns) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    each(c.x0, c.x1, c.z0, c.z1, o.reach, (k, x, z) => {
      const d = Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
      if (d >= o.reach) return;
      // The horizon the footprint spans, seen from here, as a share of half;
      // under the footprint (hidden by the box) it is its foot's value.
      let span = 1;
      if (d > 1e-9) {
        let lo = Infinity, hi = -Infinity;
        const ref = Math.atan2(cz - z, cx - x);
        for (const [px, pz] of [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]]) {
          let a = Math.atan2(pz - z, px - x) - ref;
          if (a > Math.PI) a -= 2 * Math.PI;
          if (a < -Math.PI) a += 2 * Math.PI;
          lo = Math.min(lo, a); hi = Math.max(hi, a);
        }
        span = Math.min(1, (hi - lo) / Math.PI);
      }
      vis[k] *= 1 - 0.5 * (1 - d / Math.hypot(d, c.top)) * span * (1 - smooth(0, o.reach, d));
    });
  }
  for (const b of slabs) {
    each(b.x0, b.x1, b.z0, b.z1, o.reach + b.h, (k, x, z) => {
      vis[k] *= 1 - slabFormFactor(x, z, b.x0, b.x1, b.z0, b.z1, b.h);
    });
  }
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const z = room.d / 2 - (j + 0.5) * tz;
    for (let i = 0; i < W; i++) {
      const x = -room.w / 2 + (i + 0.5) * tx;
      let v = vis[j * W + i];
      const dw = Math.min(x + room.w / 2, room.w / 2 - x, z + room.d / 2, room.d / 2 - z);
      if (dw < o.reach) v *= 1 - 0.5 * (1 - dw / Math.hypot(dw, room.h || 6)) * (1 - smooth(0, o.reach, dw));
      data[j * W + i] = Math.round(255 * Math.min(1, Math.max(0, v)));
    }
  }
  return { width: W, height: H, data };
}

// ---------- three.js builders ----------

const SETS = new Map();
const hasDom = () => typeof document !== 'undefined' && !!document.createElement;
const canFetch = () => typeof fetch === 'function' && typeof createImageBitmap === 'function'
  && typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '');

function placeholder(rgba) {
  if (!hasDom()) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const g = cv.getContext && cv.getContext('2d');
  if (g) {
    g.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})`;
    g.fillRect(0, 0, 1, 1);
  }
  return cv;
}

// One shared set of textures per set: albedo (sRGB) and normal + roughness
// (linear; the roughness deviation in alpha), or for a packed set the albedo
// alone with the roughness in its alpha. They start as a neutral texel and
// take the decoded image when it lands, so a material has its maps (and its
// uvs through the draw-call merge) from the first frame.
export function lookTextureSet(THREE, name) {
  if (SETS.has(name)) return SETS.get(name);
  const set = LOOK.sets[name];
  const res = set.res;
  const wrap = set.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  const make = (kind, rgba, srgb) => {
    const t = new THREE.Texture(placeholder(rgba));
    t.name = `look_${name}_${kind}_${res}`;
    t.wrapS = t.wrapT = wrap;
    t.flipY = false;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (t.image) t.needsUpdate = true;
    if (canFetch()) {
      // ImageBitmap with no premultiply and no colour conversion: the alpha
      // is data (roughness), so it must reach the GPU as stored.
      fetch(`${TEX}/look_${name}_${kind}_${res}.webp`)
        .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + t.name); return r.blob(); })
        .then((b) => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
        .then((bmp) => { t.source = new THREE.Source(bmp); t.needsUpdate = true; })
        .catch((e) => { if (typeof console !== 'undefined') console.warn('look texture', e); });
    }
    return t;
  };
  const out = set.packed
    ? { map: make('dr', [204, 204, 204, 128], true), nr: null }
    : { map: make('diff', [204, 204, 204, 255], true), nr: make('nr', [128, 128, 255, 128], false) };
  SETS.set(name, out);
  return out;
}

const ROUGH_CHUNK = `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor = clamp( roughness + ( texelRoughness.a - 0.5 ) * lookRoughVar, 0.04, 1.0 );
#endif`;

const JOINT_FRAG = `
#ifdef LOOK_JOINTS
{
	vec2 g = ( vLookWorld.xz - lookGrid.xy ) / lookGrid.z;
	vec2 fw = fwidth( g );
	vec2 dm = abs( fract( g + 0.5 ) - 0.5 );
	vec2 lm = 1.0 - smoothstep( vec2( lookJoint.x ), vec2( lookJoint.x ) + fw, dm );
	vec2 gM = g / lookGrid.w;
	vec2 fM = fwidth( gM );
	vec2 dM = abs( fract( gM + 0.5 ) - 0.5 );
	vec2 lM = 1.0 - smoothstep( vec2( lookJoint.y ), vec2( lookJoint.y ) + fM, dM );
	float minor = max( lm.x, lm.y );
	float major = max( lM.x, lM.y );
	diffuseColor.rgb *= 1.0 - max( lookJointDark.x * minor, lookJointDark.y * major );
}
#endif`;

// A look surface: MeshStandardMaterial over a Poly Haven set, the zone hue as
// its colour. opts.joints: { origin: [x, z], unit } in world units (unit = one
// metre) draws the saw-cut joint grid.
export function lookMaterial(THREE, kind, color, opts) {
  const s = LOOK.surfaces[kind];
  if (!s) throw new Error('no look surface ' + kind);
  const o = opts || {};
  const tex = lookTextureSet(THREE, s.set);
  const m = new THREE.MeshStandardMaterial(Object.assign({
    color: color == null ? 0xffffff : color,
    roughness: s.roughness,
    metalness: s.metalness,
    map: tex.map,
    roughnessMap: tex.nr || tex.map,
  }, o.extras || {}));
  if (s.normal > 0 && tex.nr) {
    m.normalMap = tex.nr;
    m.normalScale.set(s.normal, s.normal);
  }
  m.userData.lookKind = kind;
  m.userData.lookTile = s.tile;
  m.userData.lookUv = true;
  m.userData.looksSkip = true;
  const J = LOOK.joints;
  const joints = o.joints || null;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.lookRoughVar = { value: s.roughVar };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float lookRoughVar;')
      .replace('#include <roughnessmap_fragment>', ROUGH_CHUNK);
    if (joints) {
      const u = joints.unit;
      shader.uniforms.lookGrid = { value: new THREE.Vector4(joints.origin[0], joints.origin[1], J.minor * u, J.major / J.minor) };
      shader.uniforms.lookJoint = { value: new THREE.Vector2(J.minorWidth / 2 / J.minor, J.majorWidth / 2 / J.major) };
      shader.uniforms.lookJointDark = { value: new THREE.Vector2(J.minorDark, J.majorDark) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvLookWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = '#define LOOK_JOINTS\n' + shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;\nuniform vec4 lookGrid;\nuniform vec2 lookJoint;\nuniform vec2 lookJointDark;')
        .replace('#include <map_fragment>', '#include <map_fragment>' + JOINT_FRAG);
    }
  };
  const ck = 'look:' + (joints ? 'joints' : 'surface');
  m.customProgramCacheKey = () => ck;
  return m;
}

// Box uvs in tile units, projected from world space per face, so a texture
// keeps its physical size on a 6 cm rail and a 10 m pipe alike, and runs on
// across neighbouring boxes. The mesh is an axis-aligned BoxGeometry, placed
// (not rotated); tileWorld is the tile in world units.
export function lookBoxUv(mesh, tileWorld) {
  const g = mesh.geometry;
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  if (!p || !n || !uv) return mesh;
  const o = mesh.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + o.x, y = p.getY(i) + o.y, z = p.getZ(i) + o.z;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, z / tileWorld, y / tileWorld);
    else if (ay > 0.5) uv.setXY(i, x / tileWorld, z / tileWorld);
    else uv.setXY(i, x / tileWorld, y / tileWorld);
  }
  uv.needsUpdate = true;
  return mesh;
}

// The floor plane on the look: its uvs in tile units for the surface, the
// 0..1 uvs kept as uv1 for the AO map (floorAo, same room).
export function lookFloor(THREE, mesh, room, unit, ao) {
  const g = mesh.geometry, uv = g.getAttribute('uv');
  const tile = (mesh.material.userData.lookTile || 1) * unit;
  g.setAttribute('uv1', uv.clone());
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * room.w * unit / tile, uv.getY(i) * room.d * unit / tile);
  uv.needsUpdate = true;
  if (ao) {
    const t = new THREE.DataTexture(ao.data, ao.width, ao.height, THREE.RedFormat, THREE.UnsignedByteType);
    t.name = 'look_floor_ao';
    t.channel = 1;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    mesh.material.aoMap = t;
    mesh.material.aoMapIntensity = LOOK.grounding.floorAo.intensity;
  }
  return mesh;
}

// Bloom marks: the gates and the edge lines write alpha 0 into the HDR frame;
// on a look map the bright pass blooms exactly those pixels (sim-looks.js).
// Everything else stays opaque at alpha 1, so nothing lit by the key blooms.
export function markBloom(material) {
  if (!material || (material.userData && material.userData.lookBloom)) return material;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, r) {
    if (prev) prev.call(this, shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n\tgl_FragColor.a = 0.0;');
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey.call(material) : '';
  material.customProgramCacheKey = () => key + '|lookBloom';
  material.userData.lookBloom = true;
  material.needsUpdate = true;
  return material;
}

// One shadow caster for a map's static casters (its boxes and its gates), in
// world space: the key's shadow pass draws it once instead of each of them.
// It draws nothing in the frame itself (no colour, no depth); the casters keep
// receiving.
export function lookShadowProxy(THREE, meshes) {
  const pos = [];
  const v = new THREE.Vector3();
  for (const o of meshes) {
    o.updateWorldMatrix(true, false);
    const p = o.geometry.getAttribute('position'), idx = o.geometry.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  mesh.name = 'lookShadowProxy';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

// The edge lines: one LineSegments, the look's white at its level, bloomed.
export function lookLines(THREE, positions) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const c = new THREE.Color(LOOK.lines.color).multiplyScalar(LOOK.lines.level);
  const mat = markBloom(new THREE.LineBasicMaterial({ color: c, toneMapped: false }));
  return new THREE.LineSegments(geo, mat);
}

// A map's vibe on the look (sim-art.js VIBES): the lighting, looks and post
// fields every map module already reads, all from LOOK. base carries what is
// the map's own: id, name, tagline, palette, gates, props, and the key's
// shadow box (shadow: { viewR, height }, fitted to the room).
export function lookVibe(base) {
  const L = LOOK.lighting, P = LOOK.post, sh = base.shadow || {};
  const out = Object.assign({}, base, {
    look: true,
    implemented: true,
    time: 'indoor key',
    sky: 'none',
    lighting: Object.freeze({
      sunColor: L.key.color, sunIntensity: L.key.intensity, fillColor: 0x000000, fillIntensity: 0,
      hemiSky: 0x000000, hemiGround: 0x000000, hemiIntensity: 0,
      exposure: L.exposure, fogColor: L.background, fogDensity: 0,
      bloomStrength: P.bloom.strength, bloomRadius: P.bloom.radius, bloomThreshold: 0,
      gateEmissive: 4.4, gateEmissiveActive: 6,
      sunElevation: L.key.elevation, sunAzimuth: L.key.azimuth,
      shadowViewR: sh.viewR, shadowHeight: sh.height, shadowBias: -0.0004, shadowNormalBias: 0.02, shadowIntensity: 1,
    }),
    looks: lookLooks(),
    post: Object.freeze({
      bloom: true, bloomMask: true, analog: false, grade: false,
      lift: Object.freeze([0, 0, 0]),
      gamma: 1.00,
      gain: Object.freeze([1, 1, 1]),
      vignette: P.vignette,
      ao: LOOK.grounding.contactAo,
      grain: P.grain,
    }),
  });
  delete out.shadow;
  return Object.freeze(out);
}

// The looks spec (sim-maps.js MAP_LOOKS, sim-looks.js setMapLooks).
export function lookLooks() {
  return Object.freeze({ fog: 0, sun: LOOK.lighting.key.intensity, env: LOOK.lighting.env, bg: 0, hemi: 0 });
}
