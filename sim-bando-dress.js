// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The Bando, lived in and left: its graffiti atlas and where each piece goes,
// the rubbish on its floors, its damp, its weeds, its cables (sim-maps.js
// buildBando). All original; metres, scene axes (y up, +z the courtyard side,
// south; +x east). The floors' tops are 0, 3.5, 7 and 10.5.
//
// Cheap on purpose. Props on the map's own materials fold into its merged
// meshes (sim-art.js mergeStaticArt): no new draw. The damp, moss, cracks and
// puddles are decals on the graffiti's one mesh. The dust is quads in the sun
// shafts' mesh. Three instanced kits (rubble, flakes and blades, cans) are the
// only new draws, and nothing new casts through them.
//
// The flying stays as it was: nothing here is inside a gap volume or near a
// flight line unless it is flat on a floor; anything standing proud that a
// pilot could meet has a collider (BANDO_PROP_BOXES, tools/test_sim_bando.mjs
// holds every rule).
import { lookKitMaterial, lookTextureSet, lookBoxUv } from './sim-look.js?v=4fe91d31bea9';

// The graffiti atlas: one 512 greyscale PNG of signed distance fields
// (tools/build_bando_decals.mjs), each piece's rectangle in pixels, y down.
// mode 0 a piece (filled, outlined, a block shadow), 1 a tag, 2 a stencil.
export const BANDO_ATLAS = Object.freeze({
  name: 'bando',
  file: 'assets/sim-looks/tex/look_bando_decals_sdf_512.png',
  size: 512,
  // Distance encoded either side of the edge, pixels.
  spread: 8,
  pieces: Object.freeze({
    damp: Object.freeze({ x: 3, y: 6, w: 506, h: 100, mode: 0 }),
    mould: Object.freeze({ x: 3, y: 112, w: 506, h: 100, mode: 0 }),
    oof: Object.freeze({ x: 3, y: 218, w: 122, h: 78, mode: 0 }),
    nah: Object.freeze({ x: 131, y: 218, w: 122, h: 78, mode: 0 }),
    zap: Object.freeze({ x: 259, y: 218, w: 122, h: 78, mode: 0 }),
    yep: Object.freeze({ x: 387, y: 218, w: 122, h: 78, mode: 0 }),
    lowbatt: Object.freeze({ x: 3, y: 302, w: 122, h: 44, mode: 1 }),
    landnow: Object.freeze({ x: 131, y: 302, w: 122, h: 44, mode: 1 }),
    yaw: Object.freeze({ x: 259, y: 302, w: 122, h: 44, mode: 1 }),
    nosignal: Object.freeze({ x: 387, y: 302, w: 122, h: 44, mode: 1 }),
    turtle: Object.freeze({ x: 3, y: 352, w: 122, h: 44, mode: 1 }),
    gapit: Object.freeze({ x: 131, y: 352, w: 122, h: 44, mode: 1 }),
    keepout: Object.freeze({ x: 259, y: 352, w: 122, h: 44, mode: 2 }),
    wetfloor: Object.freeze({ x: 387, y: 352, w: 122, h: 44, mode: 2 }),
    nofly: Object.freeze({ x: 3, y: 402, w: 244, h: 104, mode: 2 }),
    arrow: Object.freeze({ x: 253, y: 402, w: 82, h: 104, mode: 2 }),
    swoop: Object.freeze({ x: 341, y: 402, w: 82, h: 104, mode: 0 }),
    chevrons: Object.freeze({ x: 429, y: 402, w: 82, h: 104, mode: 2 }),
  }),
});

// Seeded: the same Bando every build.
function rng(seed) {
  let s = (seed * 7919 + 1) % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---- The paint ----

// Where each piece goes: on solid wall, clear of every window and door. Two
// big walls in the yard, throw-ups, tags, stencils, arrows, and on the roof,
// where the loop starts, the joke. Hues clear of the gates' orange and green.
const piece = (id, c, n, w, a, b, seed) => {
  const r = BANDO_ATLAS.pieces[id];
  return Object.freeze({ piece: id, c, n, w, h: w * r.h / r.w, style: r.mode, seed, a, b: b == null ? a : b, rect: r });
};
const INK = 0x16161a, CHALK = 0xe8e4da;
export const BANDO_GRAFFITI = Object.freeze([
  // The big walls: the south and east sides of the lot.
  piece('damp', [-10.4, 1.15, 18], '-z', 9.6, 0xe0a01c, 0xffe56e, 1.3),
  piece('mould', [18, 1.15, 5.8], '-x', 9.6, 0x2a62d8, 0x8fd8ff, 2.7),
  // Throw-ups: over the ground floor's windows, the west wall, the second floor.
  piece('oof', [-6.1, 3.2, 4], '+z', 2.7, 0xc92f78, 0xff9ec9, 4.1),
  piece('nah', [6.1, 3.2, 4], '+z', 2.7, 0x1f9fc6, 0xa6efff, 5.9),
  piece('zap', [-18, 1.2, 9], '+x', 3.1, 0x6a3fd0, 0xc9a6ff, 7.3),
  piece('yep', [-6.75, 8.4, -15.75], '+z', 2.7, 0xe4be19, 0xfff3a0, 8.8),
  // Tags.
  piece('lowbatt', [-10.4, 1.35, 4], '+z', 1.6, INK, null, 9.6),
  piece('landnow', [14.75, 11, 1], '-x', 1.4, 0xd23a8c, null, 3.3),
  piece('yaw', [9.05, 6.2, -6.2], '-x', 0.9, 0x58c234, null, 6.6),
  piece('nosignal', [7.45, 6.5, -6], '+x', 1.0, CHALK, null, 10.2),
  piece('turtle', [0, 0.62, 13.85], '-z', 0.95, 0xd6f06a, null, 11.4),
  piece('gapit', [10.7, 11.05, 3.75], '-z', 1.1, 0x1fb5c8, null, 12.5),
  // Stencils: the joke on the parapet the pad looks at.
  piece('nofly', [5.1, 11.05, 3.75], '-z', 1.9, 0xc8323c, null, 13.7),
  piece('keepout', [-2.3, 1.95, 4], '+z', 1.6, INK, null, 14.2),
  piece('wetfloor', [-11.35, 1.55, -3.4], '+z', 1.25, 0xe4be19, null, 15.1),
  // Arrows: to the gap, to the door, on along the ground floor.
  piece('arrow', [6.95, 11.05, 3.75], '-z', 0.62, 0xe4be19, null, 16.3),
  piece('swoop', [2.3, 1.9, 4], '+z', 0.82, 0x12a58a, 0x9fe8ff, 17.9),
  piece('chevrons', [11.75, 1.55, -8.4], '+z', 0.95, 0xe0a01c, null, 18.6),
]);

// ---- The rot ----

const STAIN = 0x241f1a, STAIN2 = 0x4b4336, LIME = 0x5a564b, LIME2 = 0x7a7566, MOSS = 0x20310f, MOSS2 = 0x53682a;
const stain = (c, n, w, h, seed, lime) => ({ c, n, w, h, style: 3, seed, a: lime ? LIME : STAIN, b: lime ? LIME2 : STAIN2 });
const moss = (c, n, w, h, seed) => ({ c, n, w, h, style: 4, seed, a: MOSS, b: MOSS2 });
const puddle = (x, y, z, w, h, seed) => ({ c: [x, y, z], n: '+y', w, h, style: 5, seed, a: 0x101214, b: 0x101214 });

// A crack on a floor or a roof: a strip along the polyline, its moss in it.
const CRACKS = Object.freeze([
  // The roof.
  Object.freeze({ y: 10.5, w: 0.24, pts: [[-11, -10], [-8.4, -9.2], [-6.2, -6.5], [-6.8, -3.2], [-4.2, -0.8]] }),
  Object.freeze({ y: 10.5, w: 0.2, pts: [[3.5, -14], [5.2, -11.6], [4.6, -8.8], [6.4, -7.4], [6.6, -3.8]] }),
  Object.freeze({ y: 10.5, w: 0.2, pts: [[10, -13.5], [11.4, -10.6], [13.3, -9.2]] }),
  Object.freeze({ y: 10.5, w: 0.2, pts: [[-13, 1.5], [-9.6, 2.5], [-6, 1.6]] }),
  // The yard.
  Object.freeze({ y: 0, w: 0.26, pts: [[10.5, 4.8], [12, 7], [11, 9.5], [13.5, 12.4]] }),
  Object.freeze({ y: 0, w: 0.26, pts: [[-14, 6], [-11.2, 7.8], [-12.4, 10.4], [-9, 12.5]] }),
  Object.freeze({ y: 0, w: 0.22, pts: [[3, 8.2], [2, 11], [-1.2, 12.6]] }),
]);

function crackStrips() {
  const out = [];
  CRACKS.forEach((k, j) => {
    for (let i = 1; i < k.pts.length; i++) {
      const [a, b] = [k.pts[i - 1], k.pts[i]];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), vx = dz / l * k.w / 2, vz = -dx / l * k.w / 2;
      const y = k.y;
      out.push({ n: '+y', style: 6, seed: 0.7 * j + 0.31 * i, a: MOSS, b: MOSS2, quad: [[a[0] - vx, y, a[1] - vz], [b[0] - vx, y, b[1] - vz], [b[0] + vx, y, b[1] + vz], [a[0] + vx, y, a[1] + vz]] });
    }
  });
  return out;
}

// Under every other sill on the courtyard face and at the roof's edge; down
// the inside of the lift shaft (its north wall keeps its door gaps clear).
function stains() {
  const out = [];
  const sills = [-12.5, -8.25, -4, 4, 8.25, 12.5];
  const R = rng(3);
  for (let k = 0; k < 3; k++) {
    sills.forEach((x, i) => {
      if ((i + k) % 2) return;
      const y = [0.9, 4.4, 7.9][k], h = Math.min(0.7 + R() * 0.8, y - 0.06);
      out.push(stain([x + (R() - 0.5) * 0.2, y - 0.03 - h / 2, 4], '+z', 1.3 + R() * 0.3, h, 20 + i * 1.7 + k * 3.1));
    });
  }
  // Streaks from the roof's edge down the courtyard face, at the piers.
  for (const x of [-10.4, -6.1, -2.1, 2.1, 6.1, 10.4]) out.push(stain([x, 9.6, 4], '+z', 1.5, 1.6, x * 0.9 + 31));
  // The north face, in the wet.
  for (const x of [-11.4, -2.3, 6.8]) out.push(stain([x, 8.7, -16], '-z', 1.8, 3.2, x + 47));
  // Down the shaft, on the faces with no door in.
  out.push(stain([9.05, 7.3, -6.2], '-x', 1.2, 5.6, 61.1, true));
  out.push(stain([7.45, 4.6, -5.85], '+x', 0.75, 3.2, 62.7, true));
  out.push(stain([8.1, 8.55, -5.2], '-z', 1.3, 3.0, 63.4, true));
  out.push(moss([9.05, 9.5, -5.75], '-x', 0.9, 1.2, 65.5));
  out.push(moss([7.45, 9.55, -6.1], '+x', 1.1, 1.1, 66.2));
  return out;
}

function mosses() {
  const out = [], R = rng(11), Y = 10.5;
  // Along the roof's parapet feet, in the corners, flat.
  const along = [
    [-11.2, -15.3, -9, -15.3], [1, -15.3, 13.9, -15.3], [14.3, -14.6, 14.3, -9], [14.3, -3, 14.3, 3], [-14.3, -10.5, -14.3, 3], [-14.2, 3.3, 3.8, 3.3], [10, 3.3, 14.2, 3.3],
  ];
  along.forEach(([x0, z0, x1, z1], i) => {
    const n = 4 + (i % 3) * 2;
    for (let k = 0; k < n; k++) {
      const t = (k + R()) / n, w = 0.6 + R() * 1.2, h = 0.5 + R() * 0.7;
      out.push(moss([x0 + (x1 - x0) * t, Y, z0 + (z1 - z0) * t], '+y', w, h, 70 + i + k * 0.17));
    }
  });
  // Up the parapet from its foot.
  for (const [x, z, n, w] of [[-14.75, -3, '+x', 1.6], [-14.75, -9.6, '+x', 2.1], [14.75, -11.5, '-x', 1.8], [2, -15.75, '+z', 2.3]]) {
    const h = 0.6 + R() * 0.2;
    out.push(moss([x, 10.52 + h / 2, z], n, w, h, x + z));
  }
  // The yard's wall foot, the north yard, the van's sill.
  for (const [c, n, w, h] of [[[3.1, 0.34, 18], '-z', 2.4, 0.62], [[9.5, 0.3, 18], '-z', 1.5, 0.55], [[-18, 0.34, 2.5], '+x', 2.8, 0.62], [[18, 0.32, 14], '-x', 1.9, 0.6], [[-9, 0.3, -18], '+z', 3.2, 0.55], [[11, 0.3, -18], '+z', 2.2, 0.5]]) out.push(moss(c, n, w, h, c[0] * 1.3 + 2));
  return out;
}

const PUDDLES = Object.freeze([
  // The yard.
  puddle(13.1, 0, 8.1, 2.4, 1.5, 81.2), puddle(-2.8, 0, 8.2, 1.8, 1.2, 82.7), puddle(6.3, 0, 16.8, 1.6, 1.0, 83.1), puddle(-12.1, 0, 14.6, 2.0, 1.3, 84.9), puddle(15.5, 0, 2.2, 1.3, 0.9, 85.2),
  // The roof: where it ponds.
  puddle(3.6, 10.5, -10.4, 2.2, 1.4, 86.3), puddle(-8.1, 10.5, -4.4, 1.6, 1.1, 87.7), puddle(12, 10.5, 1, 1.4, 1, 88.6), puddle(-9.4, 10.5, -13.1, 1.7, 1.2, 89.1),
  // Indoors, under the holes the rain comes in by.
  puddle(3, 0, -11, 1.8, 1.2, 90.3), puddle(-5.7, 0, -11.2, 1.5, 1, 91.5), puddle(-1.4, 3.5, -12.6, 1.4, 1, 92.4), puddle(1.2, 7, -13, 1.2, 0.9, 93.8),
]);

// A stained mattress (see BANDO_PROPS): its top. Corners in the mattress's own
// turned frame.
const MATTRESS = Object.freeze({ c: [9.4, 0.18, 9.8], yaw: 0.35, w: 1.9, d: 0.92 });
function mattressStains() {
  const m = MATTRESS, cy = Math.cos(m.yaw), sy = Math.sin(m.yaw);
  const at = (u, v) => [m.c[0] + u * cy + v * sy, m.c[1], m.c[2] - u * sy + v * cy];
  const corners = (u0, u1, v0, v1) => [at(u0, v1), at(u1, v1), at(u1, v0), at(u0, v0)];
  return [
    { quad: corners(-0.9, 0.2, -0.42, 0.42), n: '+y', style: 3, seed: 94.2, a: 0x2a2015, b: 0x6b5332 },
    { quad: corners(0.05, 0.92, -0.2, 0.44), n: '+y', style: 3, seed: 95.6, a: 0x241a12, b: 0x5e4a2e },
  ];
}

export const BANDO_DECAY = Object.freeze([
  ...stains(), ...mosses(), ...crackStrips(), ...PUDDLES, ...mattressStains(),
].map((d) => Object.freeze(d)));

// ---- The rubbish that stands up ----

// Each prop: kind, where (its foot on the floor), yaw, size (w along x, h, d
// along z, before yaw). collide: true makes a box of its bounds, by the Rig's
// rules (at least 6 cm, no slot of 10 cm, on its floor). A prop with no box is
// flat on a floor or high and away from every line.
const P = (kind, at, yaw, size, collide, extra) => Object.freeze(Object.assign({ kind, at, yaw, size, collide }, extra || {}));
export const BANDO_PROPS = Object.freeze([
  // Tyres: a stack in the yard, one on its own, a pair on the roof.
  P('tyres', [14.7, 0, 10.8], 0, [0.72, 0.72, 0.72], true, { n: 3 }),
  P('tyres', [-13.2, 0, 8.4], 0, [0.72, 0.24, 0.72], true, { n: 1 }),
  P('tyres', [12.5, 10.5, -13.2], 0, [0.72, 0.48, 0.72], true, { n: 2 }),
  P('tyres', [-14.1, 0, 16.3], 0, [0.72, 0.48, 0.72], true, { n: 2 }),
  // The shopping cart, pushed here and left.
  P('cart', [13.5, 0, 6.8], 0.55, [1.0, 1.05, 0.62], true),
  // The mattress.
  P('mattress', [MATTRESS.c[0], 0, MATTRESS.c[2]], MATTRESS.yaw, [MATTRESS.w, 0.18, MATTRESS.d], true),
  // Concrete, big enough to hit: at the slab's foot, on the roof, in the yard.
  P('chunk', [10.4, 0, -0.9], 0.4, [0.95, 0.42, 0.7], true),
  P('chunk', [9.3, 0, -1.2], 1.1, [0.6, 0.3, 0.5], true),
  P('chunk', [-6.2, 10.5, -13.6], 0.9, [0.9, 0.44, 0.62], true),
  P('chunk', [12.6, 10.5, -7.1], 2.2, [0.7, 0.34, 0.55], true),
  P('chunk', [-13.7, 0, 12.2], 1.4, [0.85, 0.46, 0.6], true),
  P('chunk', [15.75, 0, 4.2], 2.6, [0.6, 0.32, 0.5], true),
  // Pallets, one by one: flung about the yard and on the roof, one against a
  // wall.
  P('pallet', [15.2, 0, 13.6], 0.7, [1.2, 0.15, 0.8], true),
  P('pallet', [5.7, 0, 11.3], 2.4, [1.2, 0.15, 0.8], true),
  P('pallet', [-3.1, 10.5, -12.7], 1.2, [1.2, 0.15, 0.8], true),
  P('pallet-lean', [-6.4, 0, 4.34], 0, [1.2, 1.02, 0.44], true),
  // The door that fell off, and the panel off another: flat on their floors.
  P('door', [-11.0, 0, -1.8], 1.15, [2.03, 0.05, 0.82], false),
  // Rebar offcuts, lying about.
  P('rebar', [-4.6, 0, -13.4], 0.4, [1.2, 0.05, 0.5], false, { n: 5 }),
  P('rebar', [-8.8, 10.5, 0.3], 1.7, [1.3, 0.05, 0.5], false, { n: 4 }),
  P('rebar', [12.5, 0, 16.6], 0.2, [1.4, 0.05, 0.5], false, { n: 4 }),
  // The ceiling that is left, the ground floor's north-west room, one tile
  // sagging and one gone; the conduit along it; the cables out of it.
  P('tiles', [-9.6, 2.82, -13.3], 0, [2.5, 0.43, 2.5], false),
  P('conduit', [-13.5, 3.02, -9.6], 0, [11.2, 0.23, 0.08], false, { to: [-2.2, 3.02, -9.6] }),
  P('conduit', [-9.9, 6.52, -14.2], 0, [0.08, 0.23, 9.8], false, { to: [-9.9, 6.52, -4.4] }),
  P('conduit', [14.4, 6.5, -14.4], 0, [0.08, 0.23, 7.4], false, { to: [14.4, 6.5, -7] }),
  P('cable', [-11.6, 3.15, -9.6], 0, [3.2, 1.0, 0.5], false, { to: [-8.3, 3.15, -9.6], sag: 0.95 }),
  P('cable', [-7.4, 3.15, -9.6], 0, [2.2, 0.7, 0.5], false, { to: [-5.2, 3.15, -9.6], sag: 0.7 }),
  P('cable', [-9.9, 6.65, -11.6], 0, [0.5, 1.15, 2.8], false, { to: [-9.9, 6.65, -8.8], sag: 1.1 }),
  P('cable', [14.4, 6.65, -12.5], 0, [0.5, 1.2, 3.0], false, { to: [14.4, 6.65, -9.4], sag: 1.15 }),
]);

// The bounds of a prop, metres: its yawed rectangle's extents, floor to top.
export function bandoPropBounds(p) {
  const [w, h, d] = p.size, c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw));
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
  if (p.kind === 'conduit' || p.kind === 'cable') {
    const b = p.to, y0 = p.at[1] - h + (p.kind === 'conduit' ? 0.15 : 0.1);
    return { min: [Math.min(p.at[0], b[0]) - 0.05, y0, Math.min(p.at[2], b[2]) - 0.05], max: [Math.max(p.at[0], b[0]) + 0.05, p.at[1] + 0.15, Math.max(p.at[2], b[2]) + 0.05] };
  }
  if (p.kind === 'tiles') return { min: [p.at[0] - w / 2, p.at[1], p.at[2] - d / 2], max: [p.at[0] + w / 2, p.at[1] + h, p.at[2] + d / 2] };
  return { min: [p.at[0] - hx, p.at[1], p.at[2] - hz], max: [p.at[0] + hx, p.at[1] + h, p.at[2] + hz] };
}

// The colliders, in the frame's own box list (sim-maps.js bandoBoxes): bounds
// a touch rounded in.
export const BANDO_PROP_BOXES = Object.freeze(BANDO_PROPS.filter((p) => p.collide).map((p) => {
  const b = bandoPropBounds(p), r = (v) => Math.round(v * 1e3) / 1e3;
  return Object.freeze({ kind: p.kind, min: b.min.map(r), max: b.max.map(r), mat: p.kind === 'tyres' ? 'dark' : p.kind === 'chunk' ? 'concrete' : p.kind === 'cart' ? 'rust' : 'bark' });
}));

// ---- The scatter: positions for the instanced kits ----

const FLOORS = [0, 3.5, 7];
// The windows' centres on each face (sim-maps.js BANDO_WINDOWS).
const WIN = {
  south: [-12.5, -8.25, -4, 4, 8.25, 12.5],
  north: [-9, -4.5, 0, 4.5, 9, 12.75],
  east: [-12.75, -6.25, -3.3, 0.75],
  west: [-9.5, -5.5, -1.5, 2.0],
};

// Rubble, cans, and flakes, each { p, r (x, y, z Euler), s (x, y, z), c, g
// (gloss 0..1) }: deterministic.
export function bandoScatter() {
  const R = rng(1234);
  const rubble = [], flakes = [], cans = [];
  const glass = (x, y, z) => {
    flakes.push({ p: [x, y + 0.006 + R() * 0.012, z], r: [-Math.PI / 2 + (R() - 0.5) * 0.25, 0, R() * Math.PI * 2], s: [0.05 + R() * 0.1, 0.05 + R() * 0.08, 0.02], c: R() < 0.2 ? 0xd9e3df : 0xb4c6c0, g: 1 });
  };
  // Glass under the windows: in along the inside of each face, every storey
  // (not every window: some were bricked in or are in the shadow of nothing),
  // and on the ground outside the ground floor's.
  FLOORS.forEach((Y, k) => {
    WIN.south.forEach((x, i) => {
      if ((i + k) % 2 === 0) for (let n = 0; n < 7; n++) glass(x + (R() - 0.5) * 1.4, Y, 3.6 - R() * 0.85);
      if (k === 0) for (let n = 0; n < 8; n++) glass(x + (R() - 0.5) * 1.6, 0, 4.12 + R() * 0.8);
    });
    WIN.north.forEach((x, i) => {
      if ((i + k) % 2) for (let n = 0; n < 7; n++) glass(x + (R() - 0.5) * 1.4, Y, -15.6 + R() * 0.85);
      if (k === 0) for (let n = 0; n < 6; n++) glass(x + (R() - 0.5) * 1.4, 0, -16.2 - R() * 0.7);
    });
    // (Not under the leaning slab: its gap is the flying's.)
    WIN.east.forEach((z, i) => { if ((i + k) % 2 === 0 && !(k === 0 && z === -3.3)) for (let n = 0; n < 6; n++) glass(14.6 - R() * 0.75, Y, z + (R() - 0.5) * 1.1); });
    WIN.west.forEach((z, i) => { if ((i + k) % 2) for (let n = 0; n < 6; n++) glass(-14.6 + R() * 0.75, Y, z + (R() - 0.5) * 1.1); });
  });
  // Leaf piles, wind-blown into the corners: a heap, no pigeon in it.
  const LEAF = [0x6a4a22, 0x7f5a26, 0x5a3f1e, 0x8a6a30, 0x4d3a1c];
  const heap = (cx, y, cz, rad, n) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = rad * Math.sqrt(R()), h = 0.34 * Math.pow(1 - d / rad, 1.3);
      flakes.push({ p: [cx + Math.cos(a) * d, y + 0.012 + h * R(), cz + Math.sin(a) * d], r: [-Math.PI / 2 + (R() - 0.5) * 0.7, R() * 0.4, R() * Math.PI * 2], s: [0.07 + R() * 0.07, 0.1 + R() * 0.08, 0.08], c: LEAF[(R() * LEAF.length) | 0], g: 0 });
    }
  };
  heap(-16.3, 0, 16.5, 0.95, 170);
  heap(16.5, 0, 16.2, 0.8, 120);
  heap(13.8, 10.5, -14.8, 0.7, 26);
  heap(14.1, 7, -15.1, 0.5, 14);
  // Plaster, off the soffits.
  for (const [cx, y, cz, n] of [[-9.6, 0, -13.2, 22], [-2.8, 3.5, -3.2, 14], [10.2, 7, -12.8, 14]]) {
    for (let i = 0; i < n; i++) flakes.push({ p: [cx + (R() - 0.5) * 2.4, y + 0.008, cz + (R() - 0.5) * 2.4], r: [-Math.PI / 2 + (R() - 0.5) * 0.3, 0, R() * 6.28], s: [0.05 + R() * 0.09, 0.05 + R() * 0.07, 0.02], c: 0xb9b3a4, g: 0 });
  }
  // Weeds: in the cracks, at the parapet's foot, along the yard's wall.
  const BLADE = [0x4f6b24, 0x667f2a, 0x3f5a1e, 0x82893a, 0x8c8340];
  const tuft = (x, y, z, n, tall) => {
    for (let i = 0; i < n; i++) {
      const h = tall * (0.5 + R() * 0.6);
      flakes.push({ p: [x + (R() - 0.5) * 0.14, y, z + (R() - 0.5) * 0.14], r: [(R() - 0.5) * 0.5, R() * 6.28, (R() - 0.5) * 0.5], s: [0.022 + R() * 0.03, h, h * (0.25 + R() * 0.5)], c: BLADE[(R() * BLADE.length) | 0], g: 0 });
    }
  };
  for (const k of CRACKS) {
    for (let i = 1; i < k.pts.length; i++) {
      const [a, b] = [k.pts[i - 1], k.pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 0.3; d < l; d += 0.55 + R() * 0.5) {
        const t = d / l;
        tuft(a[0] + (b[0] - a[0]) * t + (R() - 0.5) * 0.08, k.y, a[1] + (b[1] - a[1]) * t + (R() - 0.5) * 0.08, 3 + ((R() * 3) | 0), k.y > 5 ? 0.3 : 0.42);
      }
    }
  }
  for (let i = 0; i < 38; i++) {
    const side = i % 4, t = R() * 26 - 13;
    if (side === 0) tuft(t > -11 ? t : t + 8, 10.5, -15.68, 3, 0.36);
    else if (side === 1) tuft(14.62, 10.5, -14 + (t + 13) * 0.65, 3, 0.36);
    else if (side === 2) tuft(-14.62, 10.5, -11 + (t + 13) * 0.52, 3, 0.36);
    else tuft(t > 7 && t < 9.5 ? 11.4 : t, 10.5, 3.62, 3, 0.34);
  }
  for (let i = 0; i < 22; i++) {
    const side = i % 2, t = R() * 30 - 15;
    if (side) tuft(t, 0, 17.84, 4, 0.5);
    else tuft(-17.84, 0, -8 + R() * 24, 4, 0.5);
  }
  // Rubble: lumps of concrete, under the collapse, in the corners, by the
  // windows; none near a line, none in a gap.
  const CONC = [0xdcd8ce, 0xece8de, 0xc9c5ba, 0xf4f0e6];
  const lumps = (cx, y, cz, rad, n) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = rad * Math.sqrt(R()), sc = 0.05 + R() * R() * 0.2;
      rubble.push({ p: [cx + Math.cos(a) * d, y + sc * 0.42, cz + Math.sin(a) * d], r: [R() * 6.28, R() * 6.28, R() * 6.28], s: [sc * (0.8 + R() * 0.6), sc * (0.55 + R() * 0.45), sc * (0.8 + R() * 0.6)], c: CONC[(R() * CONC.length) | 0], g: 0 });
    }
  };
  lumps(10.6, 0, -0.9, 1.4, 22);
  lumps(-2.5, 0, -12.6, 1.6, 16);
  lumps(4.5, 3.5, -12.8, 1.3, 13);
  lumps(-12.5, 7, -2.0, 1.3, 14);
  lumps(-6, 10.5, -13.3, 1.5, 16);
  lumps(11.9, 10.5, -6.6, 1.1, 12);
  lumps(-13.8, 0, 5.4, 1.0, 11);
  lumps(14, 0, 4.8, 1.0, 11);
  lumps(-5.5, 0, 12.2, 0.9, 8);
  // The big lumps, one for each collider (a prop 'chunk'): the dented lump's
  // reach is 0.625 of its scale, so it stays inside the box drawn for it.
  for (const p of BANDO_PROPS.filter((q) => q.kind === 'chunk')) {
    const [w, h, d] = p.size;
    rubble.push({ p: [p.at[0], p.at[1] + h / 2, p.at[2]], r: [(R() - 0.5) * 0.2, p.yaw, (R() - 0.5) * 0.2], s: [w / 1.3, h / 1.3, d / 1.3], c: CONC[(R() * CONC.length) | 0], g: 0 });
  }
  // Spray cans: at the foot of the big walls, by the mattress, a pair on the
  // roof, one or two upstairs.
  const CAN = [0x6d6a62, 0x3f4757, 0x8a4b2c, 0xb9b4a4, 0x34404f];
  const can = (x, y, z, up) => cans.push({ p: [x, y + (up ? 0.095 : 0.034), z], r: up ? [0, R() * 6.28, 0] : [Math.PI / 2 + (R() - 0.5) * 0.4, R() * 6.28, 0], s: [0.066, 0.19, 0.066], c: CAN[(R() * CAN.length) | 0], g: 0 });
  for (const [x, y, z, up] of [
    [-14.2, 0, 17.2, 0], [-13.3, 0, 17.45, 1], [-12.1, 0, 17, 0], [-10.5, 0, 17.3, 0], [-8.7, 0, 17.55, 1], [-7.2, 0, 17.1, 0],
    [17.4, 0, 3.5, 0], [17.2, 0, 7.2, 1], [17.5, 0, 9.1, 0],
    [10.6, 0, 10.9, 0], [7.9, 0, 9.1, 1],
    [4.3, 10.5, 3.1, 0], [5.8, 10.5, 2.9, 1],
    [-7.3, 7, -15.1, 0], [-5.9, 7, -15, 1],
  ]) can(x, y, z, !!up);
  return { rubble, flakes, cans };
}

// ---- Building it ----

// A bent blade: a strip up the y axis, unit wide and tall, curling over; lying
// flat it is a flake of glass or a leaf, standing a blade of a weed.
function bladeGeometry(THREE) {
  const pos = [], nor = [], uv = [], idx = [], n = 3;
  for (let i = 0; i <= n; i++) {
    const v = i / n, z = 0.3 * v * v, y = v;
    for (const u of [-0.5, 0.5]) {
      const lean = u * (1 - 0.65 * v);
      pos.push(lean, y, z);
      nor.push(0, -0.3 * v, 1);
      uv.push(u + 0.5, v);
    }
    if (i < n) { const b = i * 2; idx.push(b, b + 1, b + 3, b, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A lump of concrete: a dented icosahedron, flat faced.
function lumpGeometry(THREE) {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.getAttribute('position');
  const R = rng(5);
  const dent = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!dent.has(k)) dent.set(k, 0.7 + R() * 0.55);
    const q = dent.get(k);
    p.setXYZ(i, p.getX(i) * q, p.getY(i) * q, p.getZ(i) * q);
  }
  g.computeVertexNormals();
  return g;
}

function kit(THREE, geo, material, list, s, name) {
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  mesh.name = name;
  const o = new THREE.Object3D(), col = new THREE.Color(), gloss = new Float32Array(list.length);
  list.forEach((q, i) => {
    o.position.set(q.p[0] * s, q.p[1] * s, q.p[2] * s);
    o.rotation.set(q.r[0], q.r[1], q.r[2]);
    o.scale.set(q.s[0] * s, q.s[1] * s, q.s[2] * s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, col.setHex(q.c));
    gloss[i] = q.g;
  });
  geo.setAttribute('lookGloss', new THREE.InstancedBufferAttribute(gloss, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.artKeep = true;
  return mesh;
}

// A tube between two points.
function tube(THREE, a, b, r, sides, material, s) {
  const ax = (b[0] - a[0]) * s, ay = (b[1] - a[1]) * s, az = (b[2] - a[2]) * s;
  const len = Math.hypot(ax, ay, az);
  const geo = new THREE.CylinderGeometry(r * s, r * s, len, sides, 1, true);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(((a[0] + b[0]) / 2) * s, ((a[1] + b[1]) / 2) * s, ((a[2] + b[2]) / 2) * s);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ax / len, ay / len, az / len));
  return mesh;
}

// A box, its middle at c, yawed (and tilted) about the middle.
function slab(THREE, c, size, material, s, rot) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0] * s, size[1] * s, size[2] * s), material);
  mesh.position.set(c[0] * s, c[1] * s, c[2] * s);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  return mesh;
}

function lay(p, u, v, h) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return [p.at[0] + u * c + v * s, p.at[1] + h, p.at[2] - u * s + v * c];
}

function buildProp(THREE, p, m, s, add) {
  const mesh = (q, mat) => { q.name = 'bando_' + mat; add(q); return q; };
  const tileUv = (q, mat) => { lookBoxUv(q, m[mat].userData.lookTile * s); mesh(q, mat); return q; };
  if (p.kind === 'tyres') {
    for (let i = 0; i < p.n; i++) {
      const g = new THREE.TorusGeometry(0.26 * s, 0.095 * s, 6, 10).rotateX(Math.PI / 2);
      const q = new THREE.Mesh(g, m.dark);
      q.position.set(p.at[0] * s, (p.at[1] + 0.12 + i * 0.24) * s, p.at[2] * s);
      q.rotation.y = i * 0.7;
      mesh(q, 'dark');
    }
  } else if (p.kind === 'cart') {
    const [w, h, d] = p.size, b = 0.16, r = 0.013, mat = m.block, name = 'block';
    const lift = (u, v, y) => lay(p, u, v, y);
    const x0 = -w / 2 + 0.06, x1 = w / 2 - 0.02, z0 = -d / 2 + 0.05, z1 = d / 2 - 0.05, top = h - 0.16;
    // The basket: rims, ribs, a floor; legs; the handle.
    for (const [a, c] of [[[x0, z0], [x1, z0]], [[x0, z1], [x1, z1]], [[x0, z0], [x0, z1]], [[x1, z0], [x1, z1]]]) {
      mesh(tube(THREE, lift(a[0], a[1], top), lift(c[0], c[1], top), r, 5, mat, s), name);
      mesh(tube(THREE, lift(a[0], a[1], b + 0.34), lift(c[0], c[1], b + 0.34), r * 0.8, 5, mat, s), name);
    }
    for (let i = 0; i <= 6; i++) { const x = x0 + (x1 - x0) * i / 6; for (const z of [z0, z1]) mesh(tube(THREE, lift(x, z, b + 0.34), lift(x, z, top), r * 0.7, 4, mat, s), name); }
    for (let i = 1; i < 4; i++) { const z = z0 + (z1 - z0) * i / 4; for (const x of [x0, x1]) mesh(tube(THREE, lift(x, z, b + 0.34), lift(x, z, top), r * 0.7, 4, mat, s), name); }
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      mesh(tube(THREE, lift(x, z, b), lift(x, z, b + 0.34), r, 5, mat, s), name);
      mesh(tube(THREE, lift(x, z, 0.09), lift(x, z, b), r, 5, m.dark, s), 'dark');
    }
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) mesh(tube(THREE, lift(x, z - 0.03, 0.05), lift(x, z + 0.03, 0.05), 0.05, 7, m.dark, s), 'dark');
    mesh(tube(THREE, lift(x0 - 0.1, z0, h), lift(x0 - 0.1, z1, h), r * 1.5, 6, mat, s), name);
    for (const z of [z0, z1]) mesh(tube(THREE, lift(x0, z, top), lift(x0 - 0.1, z, h), r, 5, mat, s), name);
  } else if (p.kind === 'mattress') {
    const [w, h, d] = p.size;
    const q = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), m.block);
    q.position.set(p.at[0] * s, (p.at[1] + h / 2) * s, p.at[2] * s);
    q.rotation.y = p.yaw;
    tileUv(q, 'block');
  } else if (p.kind === 'pallet') {
    const [w, h, d] = p.size;
    for (let i = 0; i < 5; i++) {
      const v = -d / 2 + 0.05 + i * (d - 0.1) / 4;
      mesh(slab(THREE, lay(p, 0, v, h - 0.011), [w, 0.022, 0.09], m.bark, s, [0, p.yaw, 0]), 'bark');
      mesh(slab(THREE, lay(p, 0, v, 0.011), [w, 0.022, 0.09], m.bark, s, [0, p.yaw, 0]), 'bark');
    }
    for (const u of [-w / 2 + 0.06, 0, w / 2 - 0.06]) mesh(slab(THREE, lay(p, u, 0, h / 2), [0.09, h - 0.04, d - 0.02], m.bark, s, [0, p.yaw, 0]), 'bark');
  } else if (p.kind === 'pallet-lean') {
    // Against the facade, at about 70 degrees, the lower edge on the ground.
    const ang = -1.22;
    const foot = p.at[2] + p.size[2] / 2;
    const u = (x, y) => [p.at[0] + x, p.at[1] + y * Math.sin(-ang), foot - y * Math.cos(-ang)];
    for (let i = 0; i < 5; i++) {
      const y = 0.06 + i * 0.25;
      mesh(slab(THREE, u(0, y), [1.16, 0.022, 0.09], m.bark, s, [ang, 0, 0]), 'bark');
    }
    for (const x of [-0.52, 0, 0.52]) mesh(slab(THREE, u(x, 0.55), [0.09, 1.08, 0.06], m.bark, s, [ang, 0, 0]), 'bark');
  } else if (p.kind === 'door') {
    const [w, h, d] = p.size;
    mesh(slab(THREE, lay(p, 0, 0, h / 2), [w, h, d], m.bark, s, [0, p.yaw, 0]), 'bark');
    for (const u of [-0.45, 0.45]) mesh(slab(THREE, lay(p, u, 0, h + 0.008), [0.78, 0.018, 0.56], m.block, s, [0, p.yaw, 0]), 'block');
    mesh(tube(THREE, lay(p, 0.88, 0.32, h), lay(p, 0.88, 0.32, h + 0.05), 0.012, 6, m.rust, s), 'rust');
  } else if (p.kind === 'rebar') {
    for (let i = 0; i < p.n; i++) {
      const v0 = -p.size[2] / 2 + i * p.size[2] / p.n + 0.02, u0 = -p.size[0] / 2;
      const a = lay(p, u0, v0, 0.018), mid = lay(p, u0 + 0.6 + i * 0.02, v0 + 0.05 - i * 0.03, 0.035), b = lay(p, p.size[0] / 2, v0 + 0.14 * (i % 3), 0.02);
      mesh(tube(THREE, a, mid, 0.012, 5, m.rust, s), 'rust');
      mesh(tube(THREE, mid, b, 0.012, 5, m.rust, s), 'rust');
    }
  } else if (p.kind === 'tiles') {
    // A patch of hung ceiling: a rusty T-bar grid, 60 cm tiles, one sagging at
    // a corner, one gone.
    const [w, h, d] = p.size, y = p.at[1] + h;
    const x0 = p.at[0] - w / 2, z0 = p.at[2] - d / 2;
    for (let k = 0; k <= 4; k++) mesh(slab(THREE, [x0 + k * 0.625, y, z0 + d / 2], [0.025, 0.035, d], m.rust, s), 'rust');
    for (let k = 0; k <= 4; k++) mesh(slab(THREE, [x0 + w / 2, y, z0 + k * 0.625], [w, 0.035, 0.025], m.rust, s), 'rust');
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (i === 1 && j === 2) continue; // the one that is gone
        const cx = x0 + 0.3125 + i * 0.625, cz = z0 + 0.3125 + j * 0.625;
        if (i === 2 && j === 1) {
          // The sagging tile, hung off one edge, bellied.
          const tile = slab(THREE, [cx - 0.08, y - 0.17, cz], [0.56, 0.02, 0.58], m.block, s, [0, 0, 0.55]);
          tileUv(tile, 'block');
          continue;
        }
        tileUv(slab(THREE, [cx, y - 0.02, cz], [0.6, 0.02, 0.6], m.block, s), 'block');
      }
    }
  } else if (p.kind === 'conduit') {
    const b = p.to;
    // Run along, a drop to the wall at each end, a box at its middle.
    mesh(tube(THREE, p.at, b, 0.028, 6, m.block, s), 'block');
    mesh(tube(THREE, p.at, [p.at[0], p.at[1] + 0.22, p.at[2]], 0.028, 6, m.block, s), 'block');
    mesh(tube(THREE, b, [b[0], b[1] + 0.22, b[2]], 0.028, 6, m.block, s), 'block');
    mesh(slab(THREE, [(p.at[0] + b[0]) / 2, p.at[1] + 0.02, (p.at[2] + b[2]) / 2], [0.16, 0.12, 0.16], m.rust, s), 'rust');
  } else if (p.kind === 'cable') {
    // A cable sagging between two hangers, a catenary in five spans, and the
    // loose end hanging off it.
    const [a, b] = [p.at, p.to], n = 10, sag = p.sag, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
    }
    for (let i = 1; i <= n; i++) mesh(tube(THREE, pts[i - 1], pts[i], 0.014, 5, m.dark, s), 'dark');
    const mid = pts[(n / 2) | 0];
    mesh(tube(THREE, mid, [mid[0] + 0.05, mid[1] - 0.42, mid[2] + 0.04], 0.012, 5, m.dark, s), 'dark');
  }
}

// Everything but the decals and the dust (lookGraffiti, lookShafts: buildBando
// calls those). m: the map's materials by key; s: world units a metre.
export function dressBando(THREE, vis, m, s, shelter, fill) {
  const add = (q) => { q.castShadow = q.receiveShadow = true; vis.add(q); };
  for (const p of BANDO_PROPS) buildProp(THREE, p, m, s, add);
  const S = bandoScatter();
  const tex = lookTextureSet(THREE, 'concrete_floor');
  const base = { fill, shelter };
  vis.add(kit(THREE, lumpGeometry(THREE), lookKitMaterial(THREE, { ...base, map: tex.map, roughness: 0.92, flat: true }), S.rubble, s, 'bandoRubble'));
  vis.add(kit(THREE, bladeGeometry(THREE), lookKitMaterial(THREE, { ...base, roughness: 0.82, doubleSide: true, gloss: true }), S.flakes, s, 'bandoFlakes'));
  vis.add(kit(THREE, new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1), lookKitMaterial(THREE, { ...base, roughness: 0.55 }), S.cans, s, 'bandoCans'));
}

// The atlas, for lookGraffiti's opts.
export function bandoAtlas() {
  return { name: BANDO_ATLAS.name, size: BANDO_ATLAS.size, spread: BANDO_ATLAS.spread };
}
