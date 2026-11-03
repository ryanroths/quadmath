// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The sim look: one art direction, defined once. The lighting rig, the PBR
// surfaces, the grounding, the post chain and the FPV camera live here as
// data, with the few builders that turn them into three.js. A map is on the
// look when its vibe comes from lookVibe() (sim-art.js) and its builder makes
// its surfaces with lookMaterial() (sim-maps.js); sim-looks.js (post chain,
// HDRI), sim-lighting.js (scene IBL) and the host (camera) read the rest from
// LOOK. No map carries lighting code of its own; a map places the one key
// (lookVibe). The Rig is the first map on it, The House the second, The
// Warehouse the third. Assets are Poly Haven CC0 (ASSETS-LICENSES.md). Not
// WebFPV.

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
  // tools/build_sim_look_textures.py. The floor is 1k, the zone sets 512, the
  // fabric 256 (a fine weave on a 27 cm tile). A set ships an albedo (_diff_)
  // and a normal map with the roughness's deviation from its mean in alpha
  // (_nr_); a set with no normal (packed) ships one file, the albedo with that
  // roughness in its alpha (_dr_). mirror: a crop that does not tile,
  // mirrored instead.
  sets: Object.freeze({
    concrete_floor: Object.freeze({ res: '1k' }),
    painted_steel: Object.freeze({ res: '512', mirror: true }),
    galvanised: Object.freeze({ res: '512', packed: true }),
    plywood: Object.freeze({ res: '512' }),
    rubber_mat: Object.freeze({ res: '512' }),
    fabric: Object.freeze({ res: '256' }),
  }),
  // Surface types: a set at a physical tile size, metres. The roughness is the
  // surface's mean; the map adds the set's own variation around it (roughVar
  // 1 = as measured). A zone hue is the material colour, a paint tint over
  // the grey albedo of a tinted set. albedoVar (default 1) scales the albedo's
  // own variation about the tinted sets' mean, for a paint that hides its
  // substrate.
  surfaces: Object.freeze({
    concrete: Object.freeze({ set: 'concrete_floor', tile: 3, roughness: 0.66, roughVar: 1, normal: 1, metalness: 0 }),
    paintedBlock: Object.freeze({ set: 'concrete_floor', tile: 3, roughness: 0.86, roughVar: 0.5, normal: 0.45, metalness: 0 }),
    paintedSteel: Object.freeze({ set: 'painted_steel', tile: 1, roughness: 0.48, roughVar: 1, normal: 1, metalness: 0 }),
    enamel: Object.freeze({ set: 'painted_steel', tile: 1, roughness: 0.3, roughVar: 0.6, normal: 0.6, metalness: 0 }),
    deck: Object.freeze({ set: 'painted_steel', tile: 4, roughness: 0.82, roughVar: 0.6, normal: 0.6, metalness: 0 }),
    galvanised: Object.freeze({ set: 'galvanised', tile: 1.2, roughness: 0.36, roughVar: 1, normal: 0, metalness: 0.55 }),
    plywood: Object.freeze({ set: 'plywood', tile: 0.5, roughness: 0.78, roughVar: 1, normal: 0.8, metalness: 0 }),
    rubber: Object.freeze({ set: 'rubber_mat', tile: 2, roughness: 0.88, roughVar: 0.6, normal: 1, metalness: 0 }),
    fabric: Object.freeze({ set: 'fabric', tile: 0.27, roughness: 0.9, roughVar: 1, normal: 0.8, metalness: 0 }),
    // Matte emulsion on plaster (a house's walls and ceilings): the painted
    // steel set, its plate marks all but painted out.
    plaster: Object.freeze({ set: 'painted_steel', tile: 3, roughness: 0.9, roughVar: 0.4, normal: 0.15, metalness: 0, albedoVar: 0.25 }),
  }),
  // Glass: no texture, a faint tint, nearly smooth; it reflects the fill and
  // lets the key through (it casts no shadow).
  glass: Object.freeze({ color: 0xdde7ec, roughness: 0.06, opacity: 0.16 }),
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
  // Floorboards (lookMaterial opts.boards): the seam's width, metres, and its
  // darkening; each board's shade varies by up to +-shade / 2.
  boards: Object.freeze({ seam: 0.003, dark: 0.5, shade: 0.18 }),
  // Corrugated sheet (lookMaterial opts.ribs), drawn on a flat face: the
  // profile's period, metres; how far its slope tilts the normal (1 = 45 deg;
  // corrugated iron's 76 mm pitch, 18 mm deep, is 0.74); how much the troughs
  // darken the albedo; the axis the profile runs along ('h': the face's
  // horizontal, vertical ribs; 'v': world y, horizontal slats).
  ribs: Object.freeze({ pitch: 0.076, depth: 0.74, dark: 0.2, axis: 'h' }),
  // Pallets (lookMaterial opts.pallet): one solid box a pallet, module m tall,
  // its slats drawn. Deck boards board m wide along x, gap m apart; deck m
  // thick at the top and the foot of each module; the blocks and fork openings
  // between at band of the wood's albedo, a gap between deck boards at slot;
  // each board's shade varies by up to +-shade / 2.
  pallet: Object.freeze({ module: 0.15, board: 0.1, gap: 0.035, deck: 0.022, band: 0.3, slot: 0.2, shade: 0.24 }),
  // Sun shafts (lookShafts): dusty light in the air, not a solid beam. Added
  // to the frame, the colour at strength a face at the window, down to tail of
  // that where it lands, faded toward the silhouette by |n.v|^edge.
  shafts: Object.freeze({ color: 0xffdcb0, strength: 0.095, tail: 0.25, edge: 1.5 }),
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
// 3 x max(face, 112) wide, 4 x face high). sets: the set names a map uses;
// every set when omitted.
export function lookTextureBytes(sets) {
  let b = 0;
  for (const [file, px] of Object.entries(LOOK_TEXTURES)) {
    if (sets && !sets.some((n) => file.includes(`/look_${n}_`))) continue;
    b += Math.round(px * px * 4 * 4 / 3);
  }
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
        // A texture drawn before its image lands holds the placeholder in
        // immutable 1x1 storage, and three.js keeps that GL texture for a new
        // source: dispose first, so the image gets a texture of its own size
        // (else GL_INVALID_OPERATION texStorage2D and the 1x1 stays).
        .then((bmp) => { t.dispose(); t.source = new THREE.Source(bmp); t.needsUpdate = true; })
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

// Floorboards along x: a seam round each board, the rows staggered, each board
// its own cut of the texture and its own shade. lookBoard: origin xz, board
// width and length (world units); lookBoardSeam: half seams as a share of the
// width and the length, the seam's darkening, the shade spread.
const BOARD_FRAG = `
	vec2 lookP = vLookWorld.xz - lookBoard.xy;
	float lookRow = floor( lookP.y / lookBoard.z );
	float lookAlong = lookP.x / lookBoard.w + fract( lookRow * 0.618 );
	float lookId = floor( lookAlong ) + lookRow * 31.0;
	vec2 lookShift = fract( sin( vec2( lookId * 12.9898, lookId * 78.233 ) ) * 43758.5453 );
#ifdef USE_MAP
	diffuseColor *= texture2D( map, vMapUv + lookShift * 7.0 );
#endif
	{
		vec2 q = vec2( lookAlong, lookP.y / lookBoard.z );
		vec2 d = abs( fract( q + 0.5 ) - 0.5 );
		vec2 s = 1.0 - smoothstep( lookBoardSeam.yx, lookBoardSeam.yx + fwidth( q ), d );
		diffuseColor.rgb *= ( 1.0 - lookBoardSeam.z * max( s.x, s.y ) ) * ( 1.0 + lookBoardSeam.w * ( lookShift.y - 0.5 ) );
	}`;

// The albedo with its variation scaled (albedoVar) about the tinted sets'
// mean, linear 0.8 (tools/build_sim_look_textures.py TINT_MEAN_LIN): after
// map_fragment, diffuse = colour * mix( 0.8, texel, albedoVar ).
const ALBEDO_FRAG = `
#ifdef USE_MAP
	diffuseColor.rgb *= mix( vec3( 0.8 ) / max( sampledDiffuseColor.rgb, vec3( 1e-3 ) ), vec3( 1.0 ), lookAlbedoVar );
#endif`;

// The fill's balance on a map's surfaces: the HDRI's light (diffuse and
// reflected) times lookFill, a colour and a level.
const FILL_FRAG = `
#if defined( RE_IndirectDiffuse )
	iblIrradiance *= lookFill;
#endif
#if defined( RE_IndirectSpecular )
	radiance *= lookFill;
#endif`;

// Corrugated sheet on a flat face, after the normal map: a sine profile, its
// slope tilting the normal (depth) and its troughs darkening the albedo
// (dark). Axis 'h' (lookRibs.w 0) runs it along world x on a +-z face and
// world z on a +-x face (vertical ribs, cladding); 'v' (1) along world y on any
// wall (horizontal slats, a roll-up door); a level face stays flat. As a
// period nears a pixel both fade to their mean, so a long run shows no moire.
// lookRibs: pitch (world units), depth, dark, axis.
const RIBS_FRAG = `
	{
		vec3 fw = fwidth( vLookWorld ) / lookRibs.x;
		vec3 n = abs( inverseTransformDirection( nonPerturbedNormal, viewMatrix ) );
		vec3 t = lookRibs.w > 0.5 ? vec3( 0.0, 1.0, 0.0 ) : n.z >= n.x ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 );
		float on = 1.0 - step( 0.5, n.y );
		float k = on * ( 1.0 - smoothstep( 0.15, 0.5, dot( fw, t ) ) );
		float a = 6.2831853 * dot( vLookWorld, t ) / lookRibs.x;
		normal = normalize( normal + lookRibs.y * k * sin( a ) * normalize( ( viewMatrix * vec4( t, 0.0 ) ).xyz ) );
		diffuseColor.rgb *= 1.0 - on * lookRibs.z * mix( 0.5, 0.5 - 0.5 * cos( a ), k );
	}`;

// The box filter of a stripe pattern: the share of [x - w/2, x + w/2] that
// lies in the stripes [n, n + s). Sharp up close, the mean s far off.
const STRIPE_GLSL = `
float lookStripe( float x, float s, float w ) {
	vec2 e = vec2( x - 0.5 * w, x + 0.5 * w );
	vec2 f = floor( e ) * s + min( fract( e ), s );
	return ( f.y - f.x ) / w;
}`;

// Pallets, in place of map_fragment: one solid box a pallet, its slats drawn
// from world height (every pallet's base sits on a multiple of the module).
// On top, deck boards along x with dark gaps, each board its own cut of the
// texture and its own shade; on a side, the deck boards' edges at the top and
// the foot of the module and the dark band of blocks and fork openings
// between; on a +-x side the top boards' ends and gaps show too. Box-filtered,
// so a stack across the room averages instead of shimmering. lookPallet:
// module and board pitch (world units), the board's share of the pitch, the
// deck's share of the module; lookPalletShade: band, slot, shade.
const PALLET_FRAG = `
	vec3 lookN = normalize( cross( dFdx( vLookWorld ), dFdy( vLookWorld ) ) );
	vec3 lookFw = max( fwidth( vLookWorld ), vec3( 1e-6 ) );
	float lookY = vLookWorld.y / lookPallet.x;
	float lookZ = vLookWorld.z / lookPallet.y;
	float lookLayer = lookN.y > 0.5 ? floor( lookY + 0.5 ) - 1.0 : floor( lookY );
	float lookId = floor( lookZ ) + lookLayer * 37.0;
	vec2 lookShift = fract( sin( vec2( lookId * 12.9898, lookId * 78.233 ) ) * 43758.5453 );
#ifdef USE_MAP
	vec4 sampledDiffuseColor = textureGrad( map, vMapUv + lookShift * 7.0, dFdx( vMapUv ), dFdy( vMapUv ) );
	diffuseColor *= sampledDiffuseColor;
#endif
	{
		float fy = lookFw.y / lookPallet.x, fz = lookFw.z / lookPallet.y;
		float boards = mix( lookPalletShade.y, 1.0, lookStripe( lookZ, lookPallet.z, fz ) );
		float top = lookStripe( lookY + lookPallet.w, lookPallet.w, fy );
		float foot = lookStripe( lookY, lookPallet.w, fy );
		float side = lookPalletShade.x * ( 1.0 - top - foot ) + foot + top * ( abs( lookN.x ) > 0.5 ? boards : 1.0 );
		float f = lookN.y > 0.5 ? boards : lookN.y < -0.5 ? 1.0 : side;
		float shade = lookPalletShade.z * ( 1.0 - smoothstep( 0.25, 0.5, fz ) );
		diffuseColor.rgb *= f * ( 1.0 + shade * ( lookShift.y - 0.5 ) );
	}`;

// A look surface: MeshStandardMaterial over a Poly Haven set, the zone hue as
// its colour. opts.joints: { origin: [x, z], unit } in world units (unit = one
// metre) draws the saw-cut joint grid; joints.spec overrides LOOK.joints' sizes
// (a tile grid). opts.boards: { origin: [x, z], unit, width, length } lays
// floorboards along x, metres. opts.pallet: { unit, module?, board?, gap? }
// draws a solid box as stacked pallets (LOOK.pallet for any left out).
// opts.ribs: { unit, pitch?, depth?, dark?, axis? } corrugates its walls
// (LOOK.ribs). One pattern a material: joints, boards, pallet, ribs, the first
// given wins. opts.fill: [r, g, b], the map's balance of the look's one HDRI
// fill (a room the key barely reaches is lit by it). opts.albedoVar overrides
// the surface's (a paint that hides more of its substrate); not with boards.
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
  const joints = o.joints || null;
  const J = Object.assign({}, LOOK.joints, joints && joints.spec);
  const boards = joints ? null : o.boards || null;
  const pallet = joints || boards ? null : o.pallet || null;
  const ribs = joints || boards || pallet ? null : o.ribs || null;
  const albedoVar = o.albedoVar != null ? o.albedoVar : s.albedoVar;
  const albedo = !boards && albedoVar != null && albedoVar !== 1;
  const fill = o.fill || null;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.lookRoughVar = { value: s.roughVar };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float lookRoughVar;')
      .replace('#include <roughnessmap_fragment>', ROUGH_CHUNK);
    if (albedo) {
      shader.uniforms.lookAlbedoVar = { value: albedoVar };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float lookAlbedoVar;')
        .replace('#include <map_fragment>', '#include <map_fragment>' + ALBEDO_FRAG);
    }
    if (fill) {
      shader.uniforms.lookFill = { value: new THREE.Vector3(fill[0], fill[1], fill[2]) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 lookFill;')
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>' + FILL_FRAG);
    }
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
    if (boards) {
      const u = boards.unit, B = LOOK.boards;
      shader.uniforms.lookBoard = { value: new THREE.Vector4(boards.origin[0], boards.origin[1], boards.width * u, boards.length * u) };
      shader.uniforms.lookBoardSeam = { value: new THREE.Vector4(B.seam / 2 / boards.width, B.seam / 2 / boards.length, B.dark, B.shade) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvLookWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;\nuniform vec4 lookBoard;\nuniform vec4 lookBoardSeam;')
        .replace('#include <map_fragment>', BOARD_FRAG);
    }
    if (pallet) {
      const u = pallet.unit, P = Object.assign({}, LOOK.pallet, pallet);
      shader.uniforms.lookPallet = { value: new THREE.Vector4(P.module * u, (P.board + P.gap) * u, P.board / (P.board + P.gap), P.deck / P.module) };
      shader.uniforms.lookPalletShade = { value: new THREE.Vector3(P.band, P.slot, P.shade) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvLookWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;\nuniform vec4 lookPallet;\nuniform vec3 lookPalletShade;' + STRIPE_GLSL)
        .replace('#include <map_fragment>', PALLET_FRAG);
    }
    if (ribs) {
      const R = Object.assign({}, LOOK.ribs, ribs);
      shader.uniforms.lookRibs = { value: new THREE.Vector4(R.pitch * ribs.unit, R.depth, R.dark, R.axis === 'v' ? 1 : 0) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvLookWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorld;\nuniform vec4 lookRibs;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + RIBS_FRAG);
    }
  };
  const pattern = joints ? 'joints' : boards ? 'boards' : pallet ? 'pallet' : ribs ? 'ribs' : 'surface';
  const ck = 'look:' + pattern + (albedo ? '+albedo' : '') + (fill ? '+fill' : '');
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

// A room's floor AO (floorAo) as the texture its floor reads on uv1.
export function lookAoTexture(THREE, ao) {
  const t = new THREE.DataTexture(ao.data, ao.width, ao.height, THREE.RedFormat, THREE.UnsignedByteType);
  t.name = 'look_floor_ao';
  t.channel = 1;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
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
    mesh.material.aoMap = lookAoTexture(THREE, ao);
    mesh.material.aoMapIntensity = LOOK.grounding.floorAo.intensity;
  }
  return mesh;
}

// Part of a floor on the look, where a room's floor changes surface: a plane
// over rect { x0, x1, z0, z1 } (metres, the room centred on the origin). Its
// uvs are in tile units from the room corner, as lookFloor's, so a surface
// runs on from patch to patch; its uv1 is the room's 0..1, so every patch
// reads the room's one AO map (lookAoTexture).
export function lookFloorPatch(THREE, material, room, unit, rect, aoMap) {
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * unit, d * unit), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((rect.x0 + rect.x1) / 2 * unit, 0, (rect.z0 + rect.z1) / 2 * unit);
  mesh.receiveShadow = true;
  const g = mesh.geometry, uv = g.getAttribute('uv'), uv1 = uv.clone();
  const tile = material.userData.lookTile || 1;
  for (let i = 0; i < uv.count; i++) {
    // Laid flat, a plane's v = 1 edge is its -z edge.
    const x = rect.x0 + uv.getX(i) * w, z = rect.z1 - uv.getY(i) * d;
    uv.setXY(i, (x + room.w / 2) / tile, (room.d / 2 - z) / tile);
    uv1.setXY(i, (x + room.w / 2) / room.w, (room.d / 2 - z) / room.d);
  }
  g.setAttribute('uv1', uv1);
  if (aoMap) {
    material.aoMap = aoMap;
    material.aoMapIntensity = LOOK.grounding.floorAo.intensity;
  }
  return mesh;
}

// Glass on the look (LOOK.glass): a transparent pane, no texture. The caller
// keeps it out of the key's shadow (castShadow false).
export function lookGlass(THREE) {
  const G = LOOK.glass;
  const m = new THREE.MeshStandardMaterial({
    color: G.color, roughness: G.roughness, metalness: 0, transparent: true, opacity: G.opacity, depthWrite: false,
  });
  m.userData.lookKind = 'glass';
  m.userData.looksSkip = true;
  return m;
}

const SHAFT_VERT = `
attribute vec3 lookShaft;
varying vec3 vLookShaft;
varying vec3 vLookWorld;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
	vLookShaft = lookShaft;
	vec4 w = modelMatrix * vec4( position, 1.0 );
	vLookWorld = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
	#include <logdepthbuf_vertex>
}`;

// A shaft's light: the colour at strength, down to tail along it, faded
// toward the long edges of each face (lookShaft: across the window, 0..1 both
// ways, then along the shaft) and by how edge-on the face is seen, so the
// prism reads as light in the air, not a box. Where the composer draws
// (linear, no tone map) it adds as it is; straight to the screen (Low) it adds
// the step it makes on a frame of linear 0.1 once tone-mapped and encoded, as
// it would before the tone map, not the far larger toe of a tone map of its
// own.
const SHAFT_FRAG = `
uniform vec3 lookShaftColor;
uniform vec2 lookShaftFade;
varying vec3 vLookShaft;
varying vec3 vLookWorld;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	vec3 n = normalize( cross( dFdx( vLookWorld ), dFdy( vLookWorld ) ) );
	vec3 v = normalize( cameraPosition - vLookWorld );
	vec2 q = vLookShaft.xy * ( 1.0 - vLookShaft.xy );
	float across = smoothstep( 0.0, 1.0, 4.0 * ( q.x + q.y ) );
	vec3 c = lookShaftColor * mix( 1.0, lookShaftFade.x, vLookShaft.z ) * across * pow( abs( dot( v, n ) ), lookShaftFade.y );
	vec4 lit = vec4( vec3( 0.1 ) + c, 1.0 ), base = vec4( vec3( 0.1 ), 1.0 );
#if defined( TONE_MAPPING )
	lit.rgb = toneMapping( lit.rgb );
	base.rgb = toneMapping( base.rgb );
#endif
	gl_FragColor = vec4( max( linearToOutputTexel( lit ).rgb - linearToOutputTexel( base ).rgb, 0.0 ), 1.0 );
}`;

// Sun shafts on the look (LOOK.shafts): the light seen in the air under a
// window. Each shaft is the window's quad swept along the light to where it
// lands, a closed prism; all of them one mesh, drawn after the opaque frame,
// added to it with its alpha (the bloom mask) untouched, no depth written, no
// shadow. shafts: [{ quad: [[x, y, z] x 4] round the window, dir: [x, y, z]
// (unit, the way the light travels), length }], world units; a length that
// takes the window's top edge to the floor buries the far end, so the floor
// cuts it where the light lands. opts: { name, color, strength } (LOOK.shafts
// for any left out).
export function lookShafts(THREE, shafts, opts) {
  const o = opts || {}, S = LOOK.shafts;
  const pos = [], at = [], idx = [];
  for (const s of shafts) {
    const b = pos.length / 3, d = s.dir, l = s.length;
    for (const t of [0, 1]) {
      s.quad.forEach((q, i) => {
        pos.push(q[0] + d[0] * l * t, q[1] + d[1] * l * t, q[2] + d[2] * l * t);
        at.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0, t);
      });
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      idx.push(b + i, b + j, b + 4 + j, b + i, b + 4 + j, b + 4 + i);
    }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2, b + 4, b + 5, b + 6, b + 4, b + 6, b + 7);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('lookShaft', new THREE.Float32BufferAttribute(at, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const c = new THREE.Color(o.color != null ? o.color : S.color).multiplyScalar(o.strength != null ? o.strength : S.strength);
  const mat = new THREE.ShaderMaterial({
    uniforms: { lookShaftColor: { value: c }, lookShaftFade: { value: new THREE.Vector2(S.tail, S.edge) } },
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  mat.userData.lookKind = 'shafts';
  mat.userData.looksSkip = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'lookShafts';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  mesh.userData.artKeep = true;
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
// the map's own: id, name, tagline, palette, gates, props, the key's shadow
// box (shadow: { viewR, height }, fitted to the room), and where the one key
// comes from and how strong it is (key: { elevation, azimuth, color,
// intensity }; the look's for any left out).
export function lookVibe(base) {
  const L = LOOK.lighting, P = LOOK.post, sh = base.shadow || {};
  const K = Object.assign({}, L.key, base.key);
  const out = Object.assign({}, base, {
    look: true,
    implemented: true,
    time: 'indoor key',
    sky: 'none',
    lighting: Object.freeze({
      sunColor: K.color, sunIntensity: K.intensity, fillColor: 0x000000, fillIntensity: 0,
      hemiSky: 0x000000, hemiGround: 0x000000, hemiIntensity: 0,
      exposure: L.exposure, fogColor: L.background, fogDensity: 0,
      bloomStrength: P.bloom.strength, bloomRadius: P.bloom.radius, bloomThreshold: 0,
      gateEmissive: 4.4, gateEmissiveActive: 6,
      sunElevation: K.elevation, sunAzimuth: K.azimuth,
      shadowViewR: sh.viewR, shadowHeight: sh.height, shadowBias: -0.0004, shadowNormalBias: 0.02, shadowIntensity: 1,
    }),
    looks: lookLooks({ sun: K.intensity }),
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
  delete out.key;
  return Object.freeze(out);
}

// The looks spec (sim-maps.js MAP_LOOKS, sim-looks.js setMapLooks); over.sun:
// a map's own key intensity.
export function lookLooks(over) {
  const sun = over && over.sun != null ? over.sun : LOOK.lighting.key.intensity;
  return Object.freeze({ fog: 0, sun, env: LOOK.lighting.env, bg: 0, hemi: 0 });
}
