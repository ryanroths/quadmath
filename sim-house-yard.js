// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The House's backyard: everything outside the house's ±9.1 × ±6.1 m shell.
// Metres here, the house's frame (y up, +z the street, -z the back, -x west);
// buildHouseYard scales by YARD_WS (= HOUSE_WS, 3.5 world units a metre).
//
// The covered patio (the house's own patio strip, open now on its west side)
// gives onto the west lawn; round the back: the pool with its slide and
// ladder, the trampoline, the swing set, the shed and the citrus tree, all
// inside a 1.8 m block wall whose top is flyable; the east side yard with the
// kitchen window and the doggy door (pieces of the house's east wall,
// HOUSE_YARD.eastWall, built by sim-maps.js buildHouse); past the back wall
// the neighbour's gravel yard with a crashed whoop; a soft boundary past that.
//
// Rules, as the house's (sim-core issue #5): boxes only, axis-aligned, every
// box at least 6 cm on each axis, on the ground or 15 cm up, no slot of 0-10 cm
// between any two colliders (touching or more than 10 cm apart), yard, house
// and shell alike. Every reachable box is a collider whose mesh is its visual
// (one entry, one box() mesh, one collider, in order); sloped parts (the slide
// chute, the swing set's A-frame legs) are stepped stacks of boxes. Every
// gap passes the 75 mm whoop (WHOOP_75) with 40 mm clear a side (20 mm where
// tight). Tall things stay out of the two sun corridors (the low key comes in
// off the patio through the sliding door and the garden door, toward -x, -z):
// the west lawn stays low, the swing set and shed stand south of the corridor.
// The yard's materials are look surfaces on the House's four texture sets
// only (painted steel, galvanised, plywood, fabric): no new texture. Water and
// the trampoline's net are untextured.
//
// This module imports nothing that imports sim-maps.js (no cycle).

import { LOOK, lookMaterial, lookBoxUv, lookFloorPatch, lookLines } from './sim-look.js?v=73378d552076';

export const YARD_WS = 3.5; // world units per metre, as sim-maps.js HOUSE_WS

// The 75 mm whoop the gaps are sized for: sim-core airframe fractal75, rim
// reach 0.0601 m from centre, so a footprint W of 0.1202 m. A gap's two
// cross-section sides each at least W + 2 × clear (W + 2 × tight where marked
// tight); a gap volume at least 10 cm deep along its axis (sim-tricks.js).
export const WHOOP_75 = Object.freeze({
  W: 0.1202, clear: 0.040, tight: 0.020, depth: 0.10,
  gap: 0.1202 + 2 * 0.040, gapTight: 0.1202 + 2 * 0.020,
});
export const WHOOP = WHOOP_75;

const r4 = (v) => Math.round(v * 1e4) / 1e4;

// The yard's surfaces, each a look surface on one of the House's sets, the
// daylight fill (cooler sky, not the interior's warm HOUSE_LOOK.fill).
function yardSurface(type, look, color, albedoVar) {
  const s = LOOK.surfaces[look];
  return Object.freeze({ type, look, color, roughness: s.roughness, metalness: s.metalness, albedoVar });
}
export const YARD_LOOK = Object.freeze({
  surfaces: Object.freeze({
    roof: yardSurface('terracotta roof tile', 'plaster', 0xb4583a),
    block: yardSurface('rendered block', 'plaster', 0xd9d0c1),
    paver: yardSurface('stone pavers', 'plaster', 0xe2d8c4),
    lawn: yardSurface('lawn', 'fabric', 0x5d8a37),
    gravel: yardSurface('gravel', 'deck', 0x9b958b, 0.9),
    wood: yardSurface('cedar', 'plywood', 0x9c6b42),
    bark: yardSurface('bark', 'plywood', 0x5e4330),
    leaf: yardSurface('citrus leaves', 'paintedSteel', 0x3c6c2c, 0.7),
    orange: yardSurface('orange', 'paintedSteel', 0xe8871c, 0.5),
    steel: yardSurface('galvanised steel', 'galvanised', 0xc3c8cd),
    plastic: yardSurface('slide plastic', 'enamel', 0x2f7dc0, 0.4),
    mat: yardSurface('black mat', 'fabric', 0x1e1f22),
  }),
  // Untextured: the pool's water, the trampoline's net.
  water: Object.freeze({ color: 0x3d9fc6, roughness: 0.06, opacity: 0.8 }),
  net: Object.freeze({ color: 0x18191b, roughness: 0.9, opacity: 0.5 }),
  fill: Object.freeze([1.05, 1.15, 1.35]),
  // Joints, metres: roof tiles 30 cm, pavers 50 cm.
  tiles: Object.freeze({ roof: 0.3, paver: 0.5 }),
});

// The block wall: 0.2 m thick, 1.8 m high.
const WALL = Object.freeze({ t: 0.2, h: 1.8, x0: -19.1, x1: 13.1, z0: -17.1, front: 6.1 });
// The pool's water, flush with the ground.
const POOL = Object.freeze({ x0: -6.0, x1: 2.0, z0: -12.6, z1: -8.6, coping: 0.3, copingH: 0.06, water: 0.03 });
// The slide: tower, platform, the stepped chute, the flat run-out.
const SLIDE = Object.freeze({
  tx0: -7.9, tx1: -7.0, tz0: -11.0, tz1: -10.2, deck: 1.5, post: 0.06, postTop: 2.1,
  cz0: -10.95, cz1: -10.25, steps: 6, step: 0.3, thick: 0.2, rail: 0.06, railH: 0.18,
  rx0: -5.2, rx1: -4.2, runTop: 0.61, runUnder: 0.55,
});
// The trampoline.
const TRAMP = Object.freeze({ x0: 4.0, x1: 7.0, z0: -13.6, z1: -10.6, edge: 0.1, matTop: 0.8, mat: 0.06, top: 2.6, zip: Object.freeze({ zc: -12.1, w: 0.45, h: 1.2 }) });
// The swing set.
const SWING = Object.freeze({
  x0: -15.8, x1: -11.8, zc: -12.2, bar: 0.06, barY: 2.24, legT: 0.10, legW: 0.12, splay: 0.75, steps: 8,
  brace: 1.0, seat: 0.45, seats: Object.freeze([-14.6, -13.0]), seatW: 0.45, seatD: 0.24, hanger: 0.06,
});
// The shed.
const SHED = Object.freeze({
  x0: -17.6, x1: -15.2, z0: -16.0, z1: -14.0, t: 0.1, h: 2.2, roof: 0.08, eave: 0.1,
  door: Object.freeze({ z0: -15.75, z1: -14.95, h: 1.8 }), window: Object.freeze({ z0: -15.3, z1: -14.7, y0: 1.0, y1: 1.5 }),
});
// The citrus tree.
const TREE = Object.freeze({ x0: 10.9, x1: 11.1, z0: -14.1, z1: -13.9, fork: 1.2, limb: 0.12, reach: 0.6, canopy: 2.0 });

// The house's east wall (x 9.0..9.1, z -6.1..6.1, 2.7 m) as pieces, in place
// of the shell's one box: the kitchen window (its lower sash raised to leave
// 17 cm open over the sill: tight) and the doggy door at the floor, its flap
// swung up outside. mat: the house's material key (sim-maps.js HOUSE_LOOK
// surfaces, or 'glass'). Built by buildHouse after the house boxes.
const KW = Object.freeze({ z0: 2.6, z1: 3.5, sill: 1.0, open: 0.17, rail: 0.06, head: 2.1 });
const DOG = Object.freeze({ z0: 4.3, z1: 4.52, h: 0.30, flap: 0.22 });
function eastWallPieces() {
  const out = [], x0 = 9.0, x1 = 9.1, H = 2.7, zA = -6.1, zB = 6.1;
  const p = (part, mat, a, b) => out.push(Object.freeze({ part, mat, min: Object.freeze(a.map(r4)), max: Object.freeze(b.map(r4)) }));
  p('wall', 'wall', [x0, 0, zA], [x1, H, KW.z0]);
  p('kitchen window sill', 'wall', [x0, 0, KW.z0], [x1, KW.sill, KW.z1]);
  p('kitchen window sash rail', 'white', [x0, KW.sill + KW.open, KW.z0], [x1, KW.sill + KW.open + KW.rail, KW.z1]);
  p('kitchen window glass', 'glass', [x0 + 0.02, KW.sill + KW.open + KW.rail, KW.z0], [x1 - 0.02, KW.head, KW.z1]);
  p('kitchen window head', 'wall', [x0, KW.head, KW.z0], [x1, H, KW.z1]);
  p('wall', 'wall', [x0, 0, KW.z1], [x1, H, DOG.z0]);
  p('doggy door head', 'wall', [x0, DOG.h, DOG.z0], [x1, H, DOG.z1]);
  p('doggy door flap', 'white', [x1, DOG.h, DOG.z0], [x1 + DOG.flap, DOG.h + 0.06, DOG.z1]);
  p('wall', 'wall', [x0, 0, DOG.z1], [x1, H, zB]);
  return out;
}

// Every yard box: { zone, mat, feature, part, min, max, edges, open? }.
// edges: whether it gets the look's edge lines (not the step boxes, not the
// net). open: the face it leaves off its mesh ('-y': the roof cover's
// underside, the slab's ceiling face, unchanged).
function yardBoxes() {
  const out = [];
  const b = (zone, mat, feature, part, x0, y0, z0, x1, y1, z1, o) => {
    out.push(Object.freeze(Object.assign({
      zone, mat, feature, part,
      min: Object.freeze([r4(x0), r4(y0), r4(z0)]), max: Object.freeze([r4(x1), r4(y1), r4(z1)]), edges: true,
    }, o || {})));
  };
  const steps = { edges: false };
  // The roof: a tiled cover over the slab (y 2.7..2.76857), 6 cm over it,
  // its edge the roof edge you can reach for a dive to the pool. It takes in
  // the slab (the house's interior tops touch it at 2.7, no slot), its
  // underside left off: the ceiling under it is the slab's own face.
  b('roof', 'roof', 'roof', 'cover', -9.1, 2.7, -6.1, 9.1, 2.7 + 0.24 / YARD_WS + 0.06, 6.1, { edges: false, open: '-y' });
  // The block wall: west, back, east, and the front returns to the house's
  // corners (they meet the shell's corner edges, 10 cm proud of its front,
  // clear of the patio post and the kitchen run inside).
  const W = WALL;
  b('wall', 'block', 'block wall', 'back', W.x0, 0, W.z0, W.x1, W.h, W.z0 + W.t);
  b('wall', 'block', 'block wall', 'west', W.x0, 0, W.z0 + W.t, W.x0 + W.t, W.h, W.front + W.t);
  b('wall', 'block', 'block wall', 'east', W.x1 - W.t, 0, W.z0 + W.t, W.x1, W.h, W.front + W.t);
  b('wall', 'block', 'block wall', 'front return (west)', W.x0 + W.t, 0, W.front, -9.1, W.h, W.front + W.t);
  b('wall', 'block', 'block wall', 'front return (east)', 9.1, 0, W.front, W.x1 - W.t, W.h, W.front + W.t);
  // The west lawn, off the covered patio: low only (the sun corridors). A
  // raised bed, its plants 40 cm; stepping pavers out from the patio.
  b('west', 'wood', 'raised bed', 'bed', -16.0, 0, 3.4, -13.0, 0.35, 4.6);
  b('west', 'leaf', 'raised bed', 'plants', -15.9, 0.3, 3.5, -13.1, 0.4, 4.5);
  for (let k = 0; k < 4; k++) b('west', 'paver', 'stepping pavers', 'paver', -10.3 - 0.75 * k, 0, -0.45, -9.8 - 0.75 * k, 0.06, 0.05);
  // The pool: the coping ring round the water.
  const P = POOL, c = P.coping, ch = P.copingH;
  b('back', 'paver', 'pool', 'coping', P.x0 - c, 0, P.z1, P.x1 + c, ch, P.z1 + c);
  b('back', 'paver', 'pool', 'coping', P.x0 - c, 0, P.z0 - c, P.x1 + c, ch, P.z0);
  b('back', 'paver', 'pool', 'coping', P.x0 - c, 0, P.z0, P.x0, ch, P.z1);
  b('back', 'paver', 'pool', 'coping', P.x1, 0, P.z0, P.x1 + c, ch, P.z1);
  // The slide, at the pool's west end: a ladder tower on the deck, its chute
  // a stepped run down (+x) to a flat run-out over the water; fly under it.
  const S = SLIDE, sp = S.post;
  for (const x of [S.tx0, S.tx1 - sp]) for (const z of [S.tz0, S.tz1 - sp]) b('back', 'steel', 'slide', 'tower post', x, 0, z, x + sp, S.postTop, z + sp);
  b('back', 'plastic', 'slide', 'platform', S.tx0, S.deck - 0.06, S.tz0, S.tx1, S.deck, S.tz1);
  for (const z of [S.tz0, S.tz1 - sp]) b('back', 'steel', 'slide', 'guard rail', S.tx0 + sp, S.postTop - 0.06, z, S.tx1 - sp, S.postTop, z + sp);
  for (const y of [0.36, 0.72, 1.08]) b('back', 'steel', 'slide', 'rung', S.tx0, y, S.tz0 + sp, S.tx0 + sp, y + 0.06, S.tz1 - sp);
  const drop = S.deck - S.runTop;
  const stepTop = (i) => S.deck - drop * i / S.steps;
  for (let i = 0; i < S.steps; i++) {
    const x0 = S.tx1 + S.step * i, x1 = x0 + S.step, t = stepTop(i);
    b('back', 'plastic', 'slide', 'chute step', x0, t - S.thick, S.cz0, x1, t, S.cz1, steps);
    b('back', 'plastic', 'slide', 'chute rail step', x0, t, S.cz0, x1, t + S.railH, S.cz0 + S.rail, steps);
    b('back', 'plastic', 'slide', 'chute rail step', x0, t, S.cz1 - S.rail, x1, t + S.railH, S.cz1, steps);
  }
  b('back', 'plastic', 'slide', 'run-out', S.rx0, S.runUnder, S.cz0, S.rx1, S.runTop, S.cz1);
  b('back', 'plastic', 'slide', 'run-out rail', S.rx0, S.runTop, S.cz0, S.rx1, S.runTop + S.railH, S.cz0 + S.rail);
  b('back', 'plastic', 'slide', 'run-out rail', S.rx0, S.runTop, S.cz1 - S.rail, S.rx1, S.runTop + S.railH, S.cz1);
  // Two legs from the coping up to the chute's third step.
  const legX0 = S.tx1 + S.step * 2 + 0.1, legTop = stepTop(2) - S.thick;
  for (const z of [S.cz0, S.cz1 - sp]) b('back', 'steel', 'slide', 'leg', legX0, 0, z, legX0 + sp, legTop, z + sp);
  // The pool ladder at the east end: an inverted U on the coping, its
  // uprights 0.6 m apart inside; through the rails along x.
  const LX0 = 2.06, LX1 = 2.16, LZ = -10.6;
  b('back', 'steel', 'pool ladder', 'upright', LX0, 0, LZ - 0.36, LX1, 1.0, LZ - 0.3);
  b('back', 'steel', 'pool ladder', 'upright', LX0, 0, LZ + 0.3, LX1, 1.0, LZ + 0.36);
  b('back', 'steel', 'pool ladder', 'top bar', LX0, 0.94, LZ - 0.36, LX1, 1.0, LZ + 0.36);
  // The trampoline: corner poles to the net's top, the frame and the mat at
  // 0.8 m, the net round the mat's edge with the zipper in its west wall
  // (the pool side), open at the top.
  const T = TRAMP, e = T.edge, my = T.matTop - T.mat;
  for (const x of [T.x0, T.x1 - e]) for (const z of [T.z0, T.z1 - e]) b('back', 'steel', 'trampoline', 'pole', x, 0, z, x + e, T.top, z + e);
  const mx = (T.x0 + T.x1) / 2;
  for (const z of [T.z0, T.z1 - e]) b('back', 'steel', 'trampoline', 'leg', mx - 0.03, 0, z, mx + 0.03, T.matTop, z + e);
  b('back', 'steel', 'trampoline', 'frame', T.x0, my, T.z0 + e, T.x0 + e, T.matTop, T.z1 - e);
  b('back', 'steel', 'trampoline', 'frame', T.x1 - e, my, T.z0 + e, T.x1, T.matTop, T.z1 - e);
  b('back', 'steel', 'trampoline', 'frame', T.x0 + e, my, T.z0, T.x1 - e, T.matTop, T.z0 + e);
  b('back', 'steel', 'trampoline', 'frame', T.x0 + e, my, T.z1 - e, T.x1 - e, T.matTop, T.z1);
  b('back', 'mat', 'trampoline', 'mat', T.x0 + e, my, T.z0 + e, T.x1 - e, T.matTop, T.z1 - e);
  const zz0 = T.zip.zc - T.zip.w / 2, zz1 = T.zip.zc + T.zip.w / 2, zy = T.matTop + T.zip.h;
  const net = { edges: false };
  b('back', 'net', 'trampoline', 'net', T.x0, T.matTop, T.z0 + e, T.x0 + e, T.top, zz0, net);
  b('back', 'net', 'trampoline', 'net', T.x0, T.matTop, zz1, T.x0 + e, T.top, T.z1 - e, net);
  b('back', 'net', 'trampoline', 'net over the zipper', T.x0, zy, zz0, T.x0 + e, T.top, zz1, net);
  b('back', 'net', 'trampoline', 'net', T.x1 - e, T.matTop, T.z0 + e, T.x1, T.top, T.z1 - e, net);
  b('back', 'net', 'trampoline', 'net', T.x0 + e, T.matTop, T.z0, T.x1 - e, T.top, T.z0 + e, net);
  b('back', 'net', 'trampoline', 'net', T.x0 + e, T.matTop, T.z1 - e, T.x1 - e, T.top, T.z1, net);
  // The swing set: the top bar on two A-frames, their legs splayed 0.75 m
  // either side in z at the ground (stepped), a brace across each at 1 m;
  // two swings on rigid hangers.
  const G = SWING;
  b('back', 'steel', 'swing set', 'top bar', G.x0, G.barY, G.zc - G.bar / 2, G.x1, G.barY + G.bar, G.zc + G.bar / 2);
  for (const [ax0, side] of [[G.x0, 'west'], [G.x1 - G.legT, 'east']]) {
    // Each leg's steps; the top step of both legs one apex block under the
    // bar (two there would leave a slot between them and the next ones).
    for (const sg of [-1, 1]) {
      for (let k = 0; k < G.steps - 1; k++) b('back', 'steel', 'swing set', `A-frame leg (${side})`, ...swingLegStep(k, sg, ax0), steps);
    }
    const ap0 = swingLegStep(G.steps - 1, -1, ax0), ap1 = swingLegStep(G.steps - 1, 1, ax0);
    b('back', 'steel', 'swing set', `A-frame apex (${side})`, ap0[0], ap0[1], ap0[2], ap1[3], ap1[4], ap1[5], steps);
    // The brace: from the step it starts in to that step's top, so the step
    // over it sits on it.
    const kb = swingBraceStep(), d = swingLegOffset(kb), h = G.barY / G.steps;
    b('back', 'steel', 'swing set', `A-frame brace (${side})`, ax0, G.brace, G.zc - d, ax0 + G.legT, h * (kb + 1), G.zc + d);
  }
  for (const sx of G.seats) {
    const s0 = sx - G.seatW / 2, s1 = sx + G.seatW / 2, h = G.hanger;
    b('back', 'mat', 'swing set', 'seat', s0, G.seat, G.zc - G.seatD / 2, s1, G.seat + 0.06, G.zc + G.seatD / 2);
    for (const hx of [s0, s1 - h]) b('back', 'steel', 'swing set', 'hanger', hx, G.seat + 0.06, G.zc - h / 2, hx + h, G.barY, G.zc + h / 2);
  }
  // The shed, in the back-west corner: 10 cm walls, the door (open, its leaf
  // swung back against the east wall) in, the window (open, no glass) out on
  // the west face to the alley along the wall; a shelf unit and a mower in.
  const H = SHED, t = H.t, D = H.door, Wn = H.window;
  b('back', 'wood', 'shed', 'wall', H.x0, 0, H.z0, H.x0 + t, H.h, Wn.z0);
  b('back', 'wood', 'shed', 'wall', H.x0, 0, Wn.z1, H.x0 + t, H.h, H.z1);
  b('back', 'wood', 'shed', 'window sill', H.x0, 0, Wn.z0, H.x0 + t, Wn.y0, Wn.z1);
  b('back', 'wood', 'shed', 'window head', H.x0, Wn.y1, Wn.z0, H.x0 + t, H.h, Wn.z1);
  b('back', 'wood', 'shed', 'wall', H.x1 - t, 0, H.z0, H.x1, H.h, D.z0);
  b('back', 'wood', 'shed', 'wall', H.x1 - t, 0, D.z1, H.x1, H.h, H.z1);
  b('back', 'wood', 'shed', 'door lintel', H.x1 - t, D.h, D.z0, H.x1, H.h, D.z1);
  b('back', 'wood', 'shed', 'wall', H.x0 + t, 0, H.z0, H.x1 - t, H.h, H.z0 + t);
  b('back', 'wood', 'shed', 'wall', H.x0 + t, 0, H.z1 - t, H.x1 - t, H.h, H.z1);
  b('back', 'wood', 'shed', 'roof', H.x0 - H.eave, H.h, H.z0 - H.eave, H.x1 + H.eave, H.h + H.roof, H.z1 + H.eave);
  b('back', 'wood', 'shed', 'door leaf', H.x1, 0, D.z1, H.x1 + 0.06, D.h, D.z1 + (D.z1 - D.z0));
  b('back', 'wood', 'shed', 'shelf unit', H.x0 + t, 0, H.z0 + t, -16.3, 1.6, -15.5);
  b('back', 'orange', 'shed', 'mower', -17.3, 0, -14.7, -16.8, 0.35, -14.3);
  b('back', 'steel', 'shed', 'mower handle', -16.86, 0.35, -14.56, -16.8, 0.9, -14.5);
  // The citrus tree, in the back-east corner: the trunk to the canopy, two
  // limbs out of a fork at 1.2 m and up into it, a window either side of the
  // trunk; oranges on the canopy.
  const R = TREE, l = R.limb;
  b('back', 'bark', 'citrus tree', 'trunk', R.x0, 0, R.z0, R.x1, R.canopy, R.z1);
  b('back', 'bark', 'citrus tree', 'limb', R.x0 - R.reach, R.fork, R.z0, R.x0, R.fork + l, R.z1);
  b('back', 'bark', 'citrus tree', 'limb', R.x0 - R.reach, R.fork + l, R.z0, R.x0 - R.reach + l, R.canopy, R.z1);
  b('back', 'bark', 'citrus tree', 'limb', R.x1, R.fork, R.z0, R.x1 + R.reach, R.fork + l, R.z1);
  b('back', 'bark', 'citrus tree', 'limb', R.x1 + R.reach - l, R.fork + l, R.z0, R.x1 + R.reach, R.canopy, R.z1);
  b('back', 'leaf', 'citrus tree', 'canopy', 9.9, R.canopy, -15.1, 12.1, 2.9, -12.9);
  b('back', 'leaf', 'citrus tree', 'canopy', 10.3, 2.9, -14.7, 11.7, 3.4, -13.3);
  const o = 0.08;
  for (const [x, y, z] of [[12.1, 2.3, -14.4], [12.1, 2.6, -13.5], [9.9 - o, 2.4, -13.8], [9.9 - o, 2.7, -14.6],
    [10.6, 2.5, -12.9], [11.6, 2.2, -12.9], [11.0, 2.4, -15.1 - o], [9.95, 2.0 - o, -13.2], [10.8, 3.4, -14.0]]) {
    b('back', 'orange', 'citrus tree', 'orange', x, y, z, x + o, y + o, z + o);
  }
  // The east side yard: a planter and shrub hiding the doggy door (hook in
  // behind it), the bins.
  b('east', 'wood', 'planter', 'planter', 9.5, 0, 4.0, 9.9, 0.45, 4.9);
  b('east', 'leaf', 'planter', 'shrub', 9.45, 0.45, 3.95, 9.95, 1.0, 4.95);
  for (const z of [-2.0, -1.2]) b('east', 'mat', 'bins', 'bin', 12.1, 0, z, 12.7, 1.0, z + 0.6);
  // The neighbour's yard, past the back wall: a planter, pavers, a bench.
  b('neighbor', 'wood', 'neighbor', 'planter', 6.0, 0, -19.0, 8.0, 0.4, -18.4);
  b('neighbor', 'leaf', 'neighbor', 'plants', 6.1, 0.35, -18.9, 7.9, 0.5, -18.5);
  for (let k = 0; k < 5; k++) b('neighbor', 'paver', 'neighbor', 'paver', -2.0 + 0.75 * k, 0, -20.6, -1.5 + 0.75 * k, 0.06, -20.1);
  b('neighbor', 'wood', 'neighbor', 'bench seat', -10.0, 0.42, -20.6, -8.6, 0.48, -20.2);
  for (const x of [-9.94, -8.72]) b('neighbor', 'steel', 'neighbor', 'bench leg', x, 0, -20.6, x + 0.06, 0.42, -20.2);
  return out;
}

// An A-frame leg's step k (0 at the ground) on side sg (-1: toward -z),
// the frame's x from ax0: [x0, y0, z0, x1, y1, z1]. Each step 0.28 m tall, its
// centre on the line from the ground at 0.75 m out to the bar.
function swingLegOffset(k) {
  const G = SWING, h = G.barY / G.steps;
  return G.splay * (1 - (h * k + h / 2) / G.barY);
}
function swingLegStep(k, sg, ax0) {
  const G = SWING, h = G.barY / G.steps, d = swingLegOffset(k);
  const c = G.zc + sg * d;
  return [ax0, h * k, c - G.legW / 2, ax0 + G.legT, h * (k + 1), c + G.legW / 2].map(r4);
}
// The step the brace runs through.
function swingBraceStep() {
  const G = SWING;
  return Math.floor(G.brace / (G.barY / G.steps));
}
// Inside the A, under the brace: the narrowest the legs leave there.
function swingAGap(ax0) {
  const G = SWING, h = G.barY / G.steps;
  let half = Infinity;
  for (let k = 0; k * h < G.brace; k++) half = Math.min(half, swingLegOffset(k) - G.legW / 2);
  return [ax0, 0, G.zc - half, ax0 + G.legT, G.brace, G.zc + half];
}

// The crashed whoop on the neighbour's gravel, upside down: frame, four
// ducts, canopy, as small visual boxes. It is a prop you can bump: ONE
// collider, its bounding box (min/max), added after the yard's boxes.
const WHOOP_PROP = (() => {
  const cx = -4.0, cz = -19.5, out = [];
  const p = (mat, x0, y0, z0, x1, y1, z1) => out.push(Object.freeze({ mat, min: Object.freeze([cx + x0, y0, cz + z0].map(r4)), max: Object.freeze([cx + x1, y1, cz + z1].map(r4)) }));
  p('orange', -0.025, 0, -0.018, 0.025, 0.025, 0.018); // the canopy, on the gravel
  p('mat', -0.045, 0.025, -0.045, 0.045, 0.033, 0.045); // the frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p('mat', sx * 0.042 - 0.023, 0.03, sz * 0.042 - 0.023, sx * 0.042 + 0.023, 0.055, sz * 0.042 + 0.023); // ducts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p('steel', sx * 0.042 - 0.008, 0.045, sz * 0.042 - 0.008, sx * 0.042 + 0.008, 0.06, sz * 0.042 + 0.008); // motors
  return Object.freeze({
    feature: 'crashed whoop', parts: Object.freeze(out),
    min: Object.freeze([r4(cx - 0.065), 0, r4(cz - 0.065)]), max: Object.freeze([r4(cx + 0.065), 0.06, r4(cz + 0.065)]),
  });
})();

// Scenery past the soft boundary's respawn line (z -23.4): unreachable, so
// visual only. The neighbour's house front along the far edge.
function yardScenery() {
  const out = [];
  const p = (mat, part, x0, y0, z0, x1, y1, z1) => out.push(Object.freeze({ mat, part, min: Object.freeze([x0, y0, z0]), max: Object.freeze([x1, y1, z1]) }));
  p('block', 'neighbor facade', -22, 0, -23.9, 16, 3.0, -23.6);
  p('roof', 'neighbor eaves', -22.2, 3.0, -23.95, 16.2, 3.3, -23.5);
  for (let x = -19; x <= 14; x += 6) p('mat', 'neighbor window', x, 1.0, -23.62, x + 1.2, 2.0, -23.56);
  p('wood', 'neighbor door', -3.2, 0, -23.62, -2.2, 2.1, -23.56);
  return out;
}

// The ground outside the house's footprint (x ±9.1, z ±6.1) out to the sky
// box (x ±27, z ±24), no patch over another or over the house's floors:
// lawn, the pool deck (pavers), the neighbour's gravel, the 10 cm strip
// under the patio's old west garden wall, the doggy door's threshold (the
// east wall's 10 cm thickness under its opening).
const SKY = Object.freeze({ x: 27, z: 24 });
const DECK = Object.freeze({ x0: -8.6, x1: 3.0, z0: -13.6, z1: -7.4 });
const YARD_FLOORS = Object.freeze([
  ['gravel', -SKY.x, SKY.x, -SKY.z, -17.0],
  ['paver', DECK.x0, DECK.x1, DECK.z0, DECK.z1],
  ['lawn', -SKY.x, SKY.x, -17.0, DECK.z0],
  ['lawn', -SKY.x, DECK.x0, DECK.z0, DECK.z1],
  ['lawn', DECK.x1, SKY.x, DECK.z0, DECK.z1],
  ['lawn', -SKY.x, SKY.x, DECK.z1, -6.1],
  ['lawn', -SKY.x, -9.1, -6.1, 6.1],
  ['lawn', 9.1, SKY.x, -6.1, 6.1],
  ['lawn', -SKY.x, SKY.x, 6.1, SKY.z],
  ['lawn', -9.1, -9.0, -6.0, 6.0],
  ['lawn', 9.0, 9.1, DOG.z0, DOG.z1],
].map(([mat, x0, x1, z0, z1]) => Object.freeze({ mat, x0, x1, z0, z1 })));

// The named gaps (sim-maps.js houseGaps appends them to the House's, as
// gapVolume): { name, axis, min, max (metres), tight, feature }.
function yardGaps() {
  const out = [];
  const g = (name, axis, feature, min, max, tight) => out.push(Object.freeze({
    name, axis, feature, tight: !!tight, min: Object.freeze(min.map(r4)), max: Object.freeze(max.map(r4)),
  }));
  g('kitchen window', 'x', 'kitchen window', [9.0, KW.sill, KW.z0], [9.1, KW.sill + KW.open, KW.z1], true);
  g('doggy door', 'x', 'doggy door', [9.0, 0, DOG.z0], [9.1, DOG.h, DOG.z1]);
  const S = SLIDE;
  g('under the slide', 'z', 'slide', [S.rx0, 0.1, S.cz0], [S.rx1, S.runUnder, S.cz1]);
  g('pool ladder rails', 'x', 'pool ladder', [2.06, POOL.copingH, -10.9], [2.16, 0.94, -10.3]);
  const T = TRAMP, e = T.edge;
  g('trampoline zipper', 'x', 'trampoline', [T.x0, T.matTop, T.zip.zc - T.zip.w / 2], [T.x0 + e, T.matTop + T.zip.h, T.zip.zc + T.zip.w / 2]);
  g('trampoline open top', 'y', 'trampoline', [T.x0 + e, T.top - 0.1, T.z0 + e], [T.x1 - e, T.top, T.z1 - e]);
  const G = SWING, a = swingAGap(G.x0), b = swingAGap(G.x1 - G.legT);
  g('swing A-frame (west)', 'x', 'swing set', a.slice(0, 3), a.slice(3));
  g('swing A-frame (east)', 'x', 'swing set', b.slice(0, 3), b.slice(3));
  const hz0 = G.zc - 0.05, hz1 = G.zc + 0.05, sw = G.seatW / 2;
  g('between the swings', 'z', 'swing set', [G.seats[0] + sw, 0, hz0], [G.seats[1] - sw, G.barY, hz1]);
  g('swing gap (west)', 'z', 'swing set', [G.x0 + G.legT, 0, hz0], [G.seats[0] - sw, G.barY, hz1]);
  g('swing gap (east)', 'z', 'swing set', [G.seats[1] + sw, 0, hz0], [G.x1 - G.legT, G.barY, hz1]);
  const R = TREE;
  g('citrus branch gap (west)', 'z', 'citrus tree', [R.x0 - R.reach + R.limb, R.fork + R.limb, R.z0], [R.x0, R.canopy, R.z1]);
  g('citrus branch gap (east)', 'z', 'citrus tree', [R.x1, R.fork + R.limb, R.z0], [R.x1 + R.reach - R.limb, R.canopy, R.z1]);
  const H = SHED;
  g('shed door', 'x', 'shed', [H.x1 - H.t, 0, H.door.z0], [H.x1, H.door.h, H.door.z1]);
  g('shed window', 'x', 'shed', [H.x0, H.window.y0, H.window.z0], [H.x0 + H.t, H.window.y1, H.window.z1]);
  // The house's own openings onto the yard: the back hall's sliding door
  // (its open half, between the wall's end and the mullion) and the covered
  // patio's posts, back to front.
  g('sliding door', 'x', 'sliding door', [-5.7, 0, -5.6], [-5.5, 2.05, -4.66]);
  const posts = [-6, -2.04, 1.92, 5.88];
  ['back', 'middle', 'front'].forEach((n, i) => g(`patio posts (${n})`, 'x', 'patio', [-9, 0, posts[i] + 0.12], [-8.88, 2.7, posts[i + 1]]));
  return out;
}

export const HOUSE_YARD = Object.freeze({
  ws: YARD_WS,
  boxes: Object.freeze(yardBoxes()),
  eastWall: Object.freeze(eastWallPieces()),
  whoop: WHOOP_PROP,
  scenery: Object.freeze(yardScenery()),
  floors: YARD_FLOORS,
  gaps: Object.freeze(yardGaps()),
  // Water contact = crash (sim.html): the pool's water, ground to the
  // coping's top.
  hazards: Object.freeze([Object.freeze({
    name: 'pool', kind: 'water', feature: 'pool',
    min: Object.freeze([POOL.x0, 0, POOL.z0]), max: Object.freeze([POOL.x1, POOL.copingH, POOL.z1]),
  })]),
  water: Object.freeze({ x0: POOL.x0, x1: POOL.x1, z0: POOL.z0, z1: POOL.z1, y: POOL.water }),
  // The soft boundary (sim.html): past the rectangle (or over the ceiling),
  // TURN BACK; respawn metres past it, OUT OF THE YARD, back to the pad. The
  // respawn line stays inside the sky box (x ±27, z ±24).
  bounds: Object.freeze({ x0: -23.5, x1: 16.5, z0: -21.4, z1: 10.5, ceiling: 9, respawn: 2 }),
  // The swing set's top bar, a powerloop: in the plane the loop flies it
  // (through 'between the swings'), 1.5 m out either side of the bar and
  // 1.5 m over it, nothing but the swing set.
  powerloops: Object.freeze({
    swing: Object.freeze({
      feature: 'swing set',
      min: Object.freeze([r4(SWING.seats[0] + SWING.seatW / 2), 0, r4(SWING.zc - 1.5)]),
      max: Object.freeze([r4(SWING.seats[1] - SWING.seatW / 2), r4(SWING.barY + SWING.bar + 1.5), r4(SWING.zc + 1.5)]),
    }),
  }),
  // Named places, metres: where the Backyard Lap can start (the west lawn,
  // off the patio), the roof edge over the pool, each feature.
  spots: Object.freeze({
    lapStart: Object.freeze([-12.0, 0.35, 1.6]),
    patio: Object.freeze([-7.35, 1.2, 0]),
    roofEdge: Object.freeze([-2.0, 2.83, -6.1]),
    pool: Object.freeze([-2.0, 0.03, -10.6]),
    slide: Object.freeze([-4.7, 0.3, -10.6]),
    trampoline: Object.freeze([5.5, 0.8, -12.1]),
    swing: Object.freeze([-13.8, 1.2, -12.2]),
    shed: Object.freeze([-16.4, 1.0, -15.0]),
    citrus: Object.freeze([11.0, 1.6, -14.0]),
    kitchenWindow: Object.freeze([9.05, 1.085, 3.05]),
    doggyDoor: Object.freeze([9.05, 0.15, 4.41]),
    neighborWhoop: Object.freeze([-4.0, 0.03, -19.5]),
  }),
});

// The Backyard Lap's line, metres, in HOUSE_LINE's turtle ops (sim-maps.js):
// ['L', d] straight; ['A', r, deg] an arc at radius r, left for a positive
// angle (+x toward -z); ['H', h] pins the height here (a monotone cubic
// between pins); ['G', size, name] a gate here, its ring radius size. From the
// pad on the west lawn (YARD_LAP_START), heading +x: round onto the roof over
// the covered patio, off its back edge in a dive under the slide, skim the
// pool into the trampoline's zipper and out its open top, round and through
// the citrus tree's west branch gap, past the trampoline and back through the
// pool ladder's rails, west behind the house, between the swings, into the
// shed by its door and out by its window, down the alley along the west wall
// and home over the lawn. Closed; every turn 1.05 m or wider; 15 cm or more
// off the ground. tracks/house-backyard-lap.json is its gates
// (tools/build_house_yard_lap.mjs).
export const YARD_LAP_START = HOUSE_YARD.spots.lapStart;
export const YARD_LINE = Object.freeze([
  ['H', 1.0], ['A', 1.2, 90], ['L', 1.9], ['A', 1.5, -90], ['L', 0.9], ['H', 3.2], ['G', 0.45, 'onto the roof'],
  ['L', 2.2], ['A', 1.5, 90], ['H', 3.25], ['L', 1.5], ['H', 3.2], ['L', 0.1], ['G', 0.45, 'off the roof'],
  ['L', 4.4], ['H', 0.36], ['L', 0.1], ['G', 0.3, 'under the slide'], ['L', 0.45], ['H', 0.36],
  ['A', 1.05, -90], ['L', 2.65], ['G', 0.4, 'pool skim'], ['L', 0.5], ['H', 0.4], ['L', 4.2], ['H', 1.4],
  ['L', 0.35], ['G', 0.3, 'trampoline zipper'], ['L', 1.85], ['G', 0.4, 'trampoline open top'], ['L', 1.3], ['H', 3.0],
  ['A', 1.2, 90], ['L', 1.6], ['A', 1.13, -90], ['H', 1.66], ['A', 1.13, -90],
  ['L', 0.9], ['G', 0.3, 'citrus branch gap (west)'], ['H', 1.66], ['L', 2.9], ['A', 1.5, -90],
  ['L', 2.66], ['G', 0.4, 'past the trampoline'], ['L', 2.0], ['A', 1.05, -58.4127], ['A', 1.05, 58.4127], ['H', 0.5],
  ['L', 0.6], ['G', 0.3, 'pool ladder rails'], ['L', 1.51], ['H', 0.5], ['A', 1.5, 90], ['A', 1.5, -90],
  ['L', 3.6], ['G', 0.4, 'back of the house'], ['H', 1.1], ['L', 6.3], ['A', 1.5, -90], ['H', 1.2],
  ['L', 3.1], ['G', 0.33, 'between the swings'], ['L', 1.87], ['A', 1.05, 90], ['H', 1.25],
  ['L', 0.4], ['G', 0.33, 'shed door'], ['L', 2.3], ['G', 0.3, 'shed window'], ['H', 1.25], ['L', 0.05],
  ['A', 1.05, 90], ['L', 1.0], ['A', 2.0, 45], ['A', 2.0, -45], ['L', 5.0], ['G', 0.4, 'down the alley'], ['H', 1.2],
  ['L', 5.3416], ['A', 1.5, 90], ['L', 3.9773],
].map((op) => Object.freeze(op)));

// The line sampled every ds metres, as sim-maps.js houseLine: points
// [x, y, z], the arc length s, the gates { s, at (index), size, name, ry }.
export function yardLine(ds) {
  return turtle(YARD_LINE, YARD_LAP_START[0], YARD_LAP_START[2], ds);
}

// sim-maps.js turtleLine, line for line: this module cannot import
// sim-maps.js (it imports this one). tools/build_house_yard_lap.mjs checks
// the two agree on YARD_LINE.
function turtle(ops, x0, z0, ds) {
  const step = ds || 0.01;
  let x = x0, z = z0, hx = 1, hz = 0, s = 0;
  const plan = [[x, z, s, hx, hz]], pins = [], gates = [];
  const go = (d) => { const n = Math.max(1, Math.ceil(d / step)); for (let i = 1; i <= n; i++) { x += hx * d / n; z += hz * d / n; s += d / n; plan.push([x, z, s, hx, hz]); } };
  const arc = (rad, deg) => {
    const a = Math.abs(deg) * Math.PI / 180, sgn = Math.sign(deg), n = Math.max(1, Math.ceil(rad * a / step));
    for (let i = 1; i <= n; i++) {
      const p = sgn * a / n, c = Math.cos(p), sn = Math.sin(p);
      const mx = hx * Math.cos(p / 2) + hz * Math.sin(p / 2), mz = -hx * Math.sin(p / 2) + hz * Math.cos(p / 2);
      const chord = 2 * rad * Math.sin(a / n / 2);
      x += mx * chord; z += mz * chord; s += rad * a / n;
      [hx, hz] = [hx * c + hz * sn, -hx * sn + hz * c];
      plan.push([x, z, s, hx, hz]);
    }
  };
  for (const op of ops) {
    if (op[0] === 'L') go(op[1]);
    else if (op[0] === 'A') arc(op[1], op[2]);
    else if (op[0] === 'H') pins.push([s, op[1]]);
    else if (op[0] === 'G') gates.push({ s, size: op[1], name: op[2], ry: Math.atan2(hx, hz) });
  }
  const L = s, k = pins.concat([[L + pins[0][0], pins[0][1]]]);
  const m = k.map((p, i) => {
    if (i === 0 || i === k.length - 1) {
      const a = i ? k[i - 1] : [k[k.length - 2][0] - L, k[k.length - 2][1]], b = i ? [k[1][0] + L, k[1][1]] : k[1];
      const d0 = (p[1] - a[1]) / (p[0] - a[0]), d1 = (b[1] - p[1]) / (b[0] - p[0]);
      return d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1);
    }
    const d0 = (p[1] - k[i - 1][1]) / (p[0] - k[i - 1][0]), d1 = (k[i + 1][1] - p[1]) / (k[i + 1][0] - p[0]);
    return d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1);
  });
  const height = (t) => {
    let u = t < k[0][0] ? t + L : t;
    let i = 0;
    while (i < k.length - 2 && k[i + 1][0] < u) i++;
    const [s0, h0] = k[i], [s1, h1] = k[i + 1], d = s1 - s0, q = (u - s0) / d;
    const q2 = q * q, q3 = q2 * q;
    return (2 * q3 - 3 * q2 + 1) * h0 + (q3 - 2 * q2 + q) * d * m[i] + (-2 * q3 + 3 * q2) * h1 + (q3 - q2) * d * m[i + 1];
  };
  const points = plan.map(([px, pz, ps]) => [px, height(ps), pz]);
  const at = (t) => plan.findIndex((p) => p[2] >= t - 1e-9);
  return {
    length: L,
    closes: Math.hypot(x - x0, z - z0) + Math.hypot(hx - 1, hz),
    points,
    s: plan.map((p) => p[2]),
    gates: gates.map((g) => Object.assign(g, { at: at(g.s) })),
  };
}

// box() as sim-maps.js: y is the bottom; one Mesh(BoxGeometry), cast and
// receive, and (collide unless false) one Box3 collider tagged 'map'.
function box(THREE, parent, colliders, x, y, z, w, h, d, material, collide) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  if (collide !== false) {
    mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(mesh);
    bb._tag = 'map';
    colliders.push(bb);
  }
  return mesh;
}
// A metres box { min, max } at world scale: box()'s arguments.
const placeArgs = (q, s) => {
  const a = q.min.map((v) => v * s), c = q.max.map((v) => v * s);
  return [(a[0] + c[0]) / 2, a[1], (a[2] + c[2]) / 2, c[0] - a[0], c[1] - a[1], c[2] - a[2]];
};

// The yard's materials, one per surface (and the net, the water).
// ao: the house floors' AO map (floorAo), shared by the tiled roof and
// pavers at aoMapIntensity 0 (an AO factor of exactly 1, so their look is as
// without it): with it they compile to the house tile floors' program
// ('look:joints' with an aoMap on uv1) in place of one of their own, one
// shader program fewer to link at boot and in each later variant.
function yardMaterials(THREE, ao) {
  const s = YARD_WS, L = YARD_LOOK, mats = {};
  const tileSpec = (m) => ({ minor: m, major: m, minorWidth: 0.008, majorWidth: 0.008, minorDark: 0.35, majorDark: 0.35 });
  for (const [key, f] of Object.entries(L.surfaces)) {
    // Faces a hair behind their edge lines, as the house's; the roof cover
    // not: its sides share the slab's, and the cover's are the ones seen.
    const o = { fill: L.fill, albedoVar: f.albedoVar };
    if (key !== 'roof') o.extras = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    if (L.tiles[key]) o.joints = { origin: [-SKY.x * s, -SKY.z * s], unit: s, spec: tileSpec(L.tiles[key]) };
    mats[key] = lookMaterial(THREE, f.look, f.color, o);
    mats[key].name = 'yard ' + f.type;
    if (o.joints && ao) {
      mats[key].aoMap = ao;
      mats[key].aoMapIntensity = 0;
    }
  }
  mats.net = new THREE.MeshStandardMaterial({ color: L.net.color, roughness: L.net.roughness, metalness: 0, transparent: true, opacity: L.net.opacity, depthWrite: false });
  mats.net.name = 'yard net';
  mats.net.userData.looksSkip = true;
  mats.water = new THREE.MeshStandardMaterial({ color: L.water.color, roughness: L.water.roughness, metalness: 0, transparent: true, opacity: L.water.opacity, depthWrite: false });
  mats.water.name = 'yard water';
  mats.water.userData.looksSkip = true;
  return mats;
}

// Leave a face off a BoxGeometry (its groups: +x, -x, +y, -y, +z, -z).
function dropFace(geo, face) {
  const k = ['+x', '-x', '+y', '-y', '+z', '-z'].indexOf(face);
  if (k < 0 || !geo.index) return;
  const idx = Array.from(geo.index.array);
  idx.splice(k * 6, 6);
  geo.setIndex(idx);
  geo.clearGroups();
}

// Build the yard under the map's group: the art group houseYardArtVisuals
// (its meshes yard_<mat>, one box() mesh and one collider per HOUSE_YARD.boxes
// entry in order, then the crashed whoop's one collider), the ground, the
// water (no collider), the edge lines. Returns the group and, in world
// units, the hazards and the soft boundary.
export function buildHouseYard(THREE, mapGroup, colliders, opts) {
  const s = YARD_WS, Y = HOUSE_YARD;
  const mats = yardMaterials(THREE, opts && opts.ao);
  const vis = new THREE.Group();
  vis.name = 'houseYardArtVisuals';
  mapGroup.add(vis);
  const edges = [];
  const edge = (a, b) => {
    const add = (p, q) => edges.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    for (const y of [a[1], b[1]]) {
      add([a[0], y, a[2]], [b[0], y, a[2]]); add([a[0], y, b[2]], [b[0], y, b[2]]);
      add([a[0], y, a[2]], [a[0], y, b[2]]); add([b[0], y, a[2]], [b[0], y, b[2]]);
    }
    for (const [x, z] of [[a[0], a[2]], [b[0], a[2]], [a[0], b[2]], [b[0], b[2]]]) add([x, a[1], z], [x, b[1], z]);
  };
  const tiled = (mesh) => {
    if (mesh.material.userData.lookTile) lookBoxUv(mesh, mesh.material.userData.lookTile * s);
    // The shared AO map's uv1 (read at intensity 0): any, so all zero.
    if (mesh.material.aoMap) mesh.geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count * 2), 2));
  };
  for (const q of Y.boxes) {
    const mesh = box(THREE, vis, colliders, ...placeArgs(q, s), mats[q.mat]);
    mesh.name = 'yard_' + q.mat;
    if (q.mat === 'net') mesh.castShadow = false;
    tiled(mesh);
    if (q.open) dropFace(mesh.geometry, q.open);
    if (q.edges) edge(q.min.map((v) => v * s), q.max.map((v) => v * s));
  }
  // The crashed whoop: its parts visual only, then its one collider.
  for (const q of Y.whoop.parts) {
    const mesh = box(THREE, vis, colliders, ...placeArgs(q, s), mats[q.mat], false);
    mesh.name = 'yard_' + q.mat;
    tiled(mesh);
  }
  const wb = new THREE.Box3(new THREE.Vector3(...Y.whoop.min.map((v) => v * s)), new THREE.Vector3(...Y.whoop.max.map((v) => v * s)));
  wb._tag = 'map';
  colliders.push(wb);
  // Scenery past the respawn line: visual only.
  for (const q of Y.scenery) {
    const mesh = box(THREE, vis, colliders, ...placeArgs(q, s), mats[q.mat], false);
    mesh.name = 'yard_' + q.mat;
    tiled(mesh);
  }
  // The ground: patches on the look, their uvs from the sky box's corner.
  const ground = { w: 2 * SKY.x, d: 2 * SKY.z };
  for (const f of Y.floors) {
    const mesh = lookFloorPatch(THREE, mats[f.mat], ground, s, f, null);
    mesh.name = 'yard floor ' + f.mat;
    vis.add(mesh);
  }
  // The water: a flat plane over the pool, under the coping's top.
  const W = Y.water;
  const water = new THREE.Mesh(new THREE.PlaneGeometry((W.x1 - W.x0) * s, (W.z1 - W.z0) * s), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set((W.x0 + W.x1) / 2 * s, W.y * s, (W.z0 + W.z1) / 2 * s);
  water.receiveShadow = true;
  water.name = 'yard water';
  vis.add(water);
  const lines = lookLines(THREE, edges);
  lines.name = 'houseYardEdges';
  lines.userData.artKeep = true;
  vis.add(lines);
  const wu = (p) => ({ x: p[0] * s, y: p[1] * s, z: p[2] * s });
  const B = Y.bounds;
  const hazards = Y.hazards.map((h) => Object.freeze({ name: h.name, kind: h.kind, min: Object.freeze(wu(h.min)), max: Object.freeze(wu(h.max)) }));
  const bounds = Object.freeze({
    soft: Object.freeze({ min: Object.freeze({ x: B.x0 * s, z: B.z0 * s }), max: Object.freeze({ x: B.x1 * s, z: B.z1 * s }), ceiling: B.ceiling * s }),
    respawn: Object.freeze({ min: Object.freeze({ x: (B.x0 - B.respawn) * s, z: (B.z0 - B.respawn) * s }), max: Object.freeze({ x: (B.x1 + B.respawn) * s, z: (B.z1 + B.respawn) * s }), ceiling: (B.ceiling + B.respawn) * s }),
    margin: B.respawn * s,
  });
  return { group: vis, hazards, bounds };
}

export { yardBoxes };
