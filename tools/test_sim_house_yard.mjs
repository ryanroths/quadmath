// The House's backyard (sim-house-yard.js HOUSE_YARD, built by sim-maps.js
// buildHouse), checked on the shipped data and the built map, no browser:
// registered, buildable, every named gap a real opening whose walls are what
// you see, the interior untouched, the texture and draw-object budgets, the
// pool, the swing powerloop, the Backyard Lap, the House's own tracks.
// node --test tools/test_sim_house_yard.mjs
// The Chrome half (draw calls with the yard in view, the page's water and
// boundary hooks): tools/test_sim_house_yard_page.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import {
  HOUSE_PLAY, HOUSE_WS, HOUSE_LOOK, HOUSE_KEY, MAP_LOOKS, LAYOUT, buildMap, mapGaps, houseAoBoxes,
} from '../sim-maps.js';
import * as YARD from '../sim-house-yard.js';
import { HOUSE_YARD, YARD_LOOK, WHOOP_75, YARD_WS } from '../sim-house-yard.js';
import { normalizeTrack, gateRadius, BUILTIN_TRACK_FILES, ghostPayloadError } from '../sim-tracks.js';
import { PHYSICS_VER } from '../sim-whoop.js';
import { vibeFor, mergeStaticArt } from '../sim-art.js';
import { LOOK, lookTextureBytes, lookKtx2Bytes, floorAo } from '../sim-look.js';
import { GAP_MIN_DEPTH_M } from '../sim-tricks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const s = HOUSE_WS;
const ROOM = HOUSE_PLAY.room;
const BOXES = HOUSE_PLAY.boxes;
const Y = HOUSE_YARD;
const EPS = 1e-6;

// The House's shell after the yard: its base boxes (the two long outer walls,
// the two 0.9 m garden walls at the patio's ends, the slab), then the east
// wall's pieces (HOUSE_YARD.eastWall). The yard's boxes follow, then the
// crashed whoop's one collider.
const SHELL_BASE = 5;
const I_EAST = BOXES.length + SHELL_BASE;
const I_YARD = I_EAST + Y.eastWall.length;
const I_WHOOP = I_YARD + Y.boxes.length;

// The spec's gap names (yard-spec.md "Named gaps"): the 15 the yard must
// have, and the House's own openings onto it it may add.
const SPEC_GAPS = ['kitchen window', 'doggy door', 'under the slide', 'pool ladder rails', 'trampoline zipper',
  'trampoline open top', 'swing A-frame (west)', 'swing A-frame (east)', 'between the swings', 'swing gap (west)',
  'swing gap (east)', 'citrus branch gap (west)', 'citrus branch gap (east)', 'shed door', 'shed window'];
const OPTIONAL_GAP = (n) => n === 'sliding door' || /^patio posts/.test(n) || /^patio wall gap/.test(n);
// The jungle gym's (on the green sandbox, after the spec): all of them.
const GYM_GAPS = ['dome crown', 'dome window (east)', 'dome window (west)', 'under the monkey bars', 'between the monkey bars', 'tube slide'];
// The only gaps the spec marks tight (20 mm a side, not 40).
const TIGHT_GAPS = ['kitchen window'];
// The sky box (houseSky): x ±27 m, z ±24 m, y -5.4..27 m about the origin.
const SKY = { x: 27, z: 24, y0: -2 * ROOM.h, y1: 10 * ROOM.h };

function installDomStub() {
  if (globalThis.document && globalThis.document.createElement) return;
  globalThis.document = {
    createElement: () => {
      const cv = { width: 0, height: 0 };
      cv.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
      return cv;
    },
  };
}
installDomStub();

let builtCache = null;
function built() {
  if (!builtCache) {
    builtCache = buildMap(THREE, 'house');
    builtCache.group.updateMatrixWorld(true);
  }
  return builtCache;
}
const toM = (c) => ({ min: c.min.toArray().map((v) => v / s), max: c.max.toArray().map((v) => v / s) });
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const boxM = (c) => ({ min: c.min.toArray().map((v) => r4(v / s)), max: c.max.toArray().map((v) => r4(v / s)) });
const sameBox = (a, b, tol) => [0, 1, 2].every((k) => Math.abs(a.min[k] - b.min[k]) <= tol && Math.abs(a.max[k] - b.max[k]) <= tol);
const box3Arr = (b) => ({ min: b.min.toArray(), max: b.max.toArray() });
const inside = (p, lo, hi) => [0, 1, 2].every((k) => p[k] >= lo[k] && p[k] <= hi[k]);
// Separation of two boxes: 0 when they touch or overlap, else the distance.
function separation(a, b) {
  const d = [0, 1, 2].map((k) => Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k]));
  const open = d.filter((v) => v > EPS);
  return open.length ? Math.hypot(...open) : 0;
}
function boxDist(p, b) {
  const d = [0, 1, 2].map((k) => Math.max(b.min[k] - p[k], 0, p[k] - b.max[k]));
  if (d[0] || d[1] || d[2]) return Math.hypot(d[0], d[1], d[2]);
  return -Math.min(...[0, 1, 2].flatMap((k) => [p[k] - b.min[k], b.max[k] - p[k]]));
}
const label = (q) => (q.feature || '') + ':' + (q.part || q.mat || '');
const AX = { x: 0, y: 1, z: 2 };

// Every box mesh in the built map with its world bounds (the sky excluded:
// it is the backdrop, no collider by design; floors and the water are planes).
function boxMeshes(group) {
  const out = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== 'BoxGeometry' || o.name === 'houseSky') return;
    out.push({ mesh: o, bb: box3Arr(new THREE.Box3().setFromObject(o)) });
  });
  return out;
}

test('yard registered: HOUSE_YARD shape, colliders after the house and shell, its own art group, collider == visual index-aligned', () => {
  assert.equal(YARD_WS, HOUSE_WS);
  assert.equal(Y.ws, HOUSE_WS);
  assert.ok(Object.isFrozen(Y), 'HOUSE_YARD frozen');
  for (const k of ['boxes', 'eastWall', 'whoop', 'scenery', 'floors', 'gaps', 'hazards', 'water', 'bounds', 'powerloops', 'spots']) assert.ok(Y[k], 'HOUSE_YARD.' + k);
  assert.ok(Y.boxes.length > 0);
  for (const q of Y.boxes) {
    assert.ok(typeof q.zone === 'string' && typeof q.mat === 'string' && typeof q.feature === 'string' && typeof q.part === 'string', label(q));
    assert.ok(q.min.length === 3 && q.max.length === 3 && [0, 1, 2].every((k) => q.max[k] > q.min[k]), label(q) + ' min < max');
    assert.ok(q.mat === 'net' || YARD_LOOK.surfaces[q.mat], label(q) + ' material ' + q.mat);
    assert.equal(typeof q.edges, 'boolean');
  }
  for (const g of Y.gaps) {
    assert.ok(typeof g.name === 'string' && ['x', 'y', 'z'].includes(g.axis) && typeof g.tight === 'boolean' && typeof g.feature === 'string', g.name);
  }
  // Colliders: the house's boxes first, unchanged in place, then the shell
  // (5 base boxes and the east wall's pieces), then the yard, the whoop last.
  const b = built(), cols = b.colliders;
  assert.equal(cols.length, I_WHOOP + 1, 'colliders: ' + BOXES.length + ' boxes + ' + SHELL_BASE + ' shell + ' + Y.eastWall.length + ' east wall + ' + Y.boxes.length + ' yard + 1 whoop');
  BOXES.forEach((q, i) => assert.ok(sameBox(boxM(cols[i]), q, 1e-9), 'house box ' + i + ' ' + label(q) + ' collider in place'));
  Y.eastWall.forEach((q, i) => assert.ok(sameBox(boxM(cols[I_EAST + i]), q, 1e-9), 'east wall ' + q.part));
  Y.boxes.forEach((q, i) => assert.ok(sameBox(boxM(cols[I_YARD + i]), q, 1e-9), 'yard box ' + i + ' ' + label(q)));
  assert.ok(sameBox(boxM(cols[I_WHOOP]), Y.whoop, 1e-9), 'the crashed whoop: one collider, its bounding box');
  for (const p of Y.whoop.parts) assert.ok([0, 1, 2].every((k) => p.min[k] >= Y.whoop.min[k] - EPS && p.max[k] <= Y.whoop.max[k] + EPS), 'whoop part inside its collider');
  // Its own art group, a sibling of the House's.
  const vis = b.group.getObjectByName('houseArtVisuals');
  const yv = b.group.getObjectByName('houseYardArtVisuals');
  assert.ok(vis && yv, 'houseArtVisuals and houseYardArtVisuals');
  assert.equal(yv.parent, vis.parent, 'siblings under the map group');
  assert.equal(b.group.getObjectsByProperty('name', 'houseYardArtVisuals').length, 1);
  // No yard mesh in the House's group, no house_ mesh in the yard's.
  assert.ok(!vis.children.some((o) => o.name.startsWith('yard')), 'no yard mesh under houseArtVisuals');
  assert.ok(!yv.children.some((o) => o.name.startsWith('house_')), 'no house_ mesh under houseYardArtVisuals');
  // Collider == visual: the i-th yard_ mesh is the i-th box, its world bbox
  // the i-th yard collider's (1e-4 wu); then the whoop's parts, the scenery.
  const ym = yv.children.filter((o) => o.isMesh && o.name.startsWith('yard_'));
  assert.equal(ym.length, Y.boxes.length + Y.whoop.parts.length + Y.scenery.length, 'yard_ meshes');
  Y.boxes.forEach((q, i) => {
    const m = ym[i];
    assert.equal(m.name, 'yard_' + q.mat, 'mesh ' + i + ' name');
    const bb = box3Arr(new THREE.Box3().setFromObject(m));
    assert.ok(sameBox(bb, box3Arr(cols[I_YARD + i]), 1e-4), 'yard box ' + i + ' ' + label(q) + ': mesh bbox == collider');
    // Exactly one: no other yard mesh has this box.
    const twins = ym.filter((o) => sameBox(box3Arr(new THREE.Box3().setFromObject(o)), bb, 1e-4));
    assert.equal(twins.length, 1, label(q) + ' has one mesh');
  });
  // The east wall's pieces: a mesh each in the House's group, equal to its collider.
  const hm = boxMeshes(vis);
  Y.eastWall.forEach((q, i) => {
    assert.equal(hm.filter((m) => sameBox(m.bb, box3Arr(cols[I_EAST + i]), 1e-4)).length, 1, 'east wall ' + q.part + ' mesh');
  });
  // The built map carries the yard's hazards and bounds (world units).
  assert.ok(b.yard && b.yard.hazards && b.yard.bounds, 'buildMap(house).yard');
  assert.equal(buildMap(THREE, 'rig').yard, null, 'no yard on other maps');
});

test('yard buildable: 6 cm boxes, grounded or 15 cm up, no 0-10 cm slot (yard, shell, house), inside the sky box and ±36 m', () => {
  const b = built(), cols = b.colliders;
  const yardItems = [
    ...Y.boxes.map((q) => ({ ...q, tag: 'yard ' + label(q) })),
    ...Y.eastWall.map((q) => ({ ...q, tag: 'east wall ' + q.part })),
    { min: Y.whoop.min, max: Y.whoop.max, tag: 'crashed whoop' },
  ];
  for (const q of yardItems) {
    const t = [0, 1, 2].map((k) => q.max[k] - q.min[k]);
    assert.ok(Math.min(...t) >= 0.06 - 1e-9 || q.tag === 'crashed whoop', q.tag + ' thickness ' + t);
    assert.ok(q.min[1] === 0 || q.min[1] >= 0.15 - 1e-9, q.tag + ' floats just off the ground ' + q.min[1]);
  }
  const others = [
    ...BOXES.map((q) => ({ ...q, tag: 'house ' + label(q) })),
    ...cols.slice(BOXES.length, I_EAST).map((c, i) => ({ ...boxM(c), tag: 'shell ' + i })),
  ];
  let pairs = 0;
  for (let i = 0; i < yardItems.length; i++) {
    const a = yardItems[i];
    for (const c of yardItems.slice(i + 1).concat(others)) {
      const g = separation(a, c);
      pairs++;
      assert.ok(g < EPS || g > 0.10, `${a.tag} | ${c.tag} slot ${g.toFixed(4)}`);
    }
  }
  assert.ok(pairs > 10000, pairs + ' pairs');
  // Inside the sky box (the camera must stay in it) and the ghost room's
  // int16 range (±36 m).
  const all = [...yardItems, ...Y.scenery.map((q) => ({ ...q, tag: 'scenery ' + q.part })), ...Y.whoop.parts.map((q) => ({ ...q, tag: 'whoop part' }))];
  for (const q of all) {
    assert.ok(q.min[0] >= -SKY.x && q.max[0] <= SKY.x && q.min[2] >= -SKY.z && q.max[2] <= SKY.z, q.tag + ' inside the sky box x/z');
    assert.ok(q.min[1] >= SKY.y0 && q.max[1] <= SKY.y1, q.tag + ' inside the sky box y');
    assert.ok([...q.min, ...q.max].every((v) => Math.abs(v) <= 36), q.tag + ' within ±36 m');
  }
  for (const f of Y.floors) assert.ok(f.x0 >= -SKY.x && f.x1 <= SKY.x && f.z0 >= -SKY.z && f.z1 <= SKY.z, 'floor ' + f.mat + ' inside the sky box');
  for (const c of cols) assert.ok([...c.min.toArray(), ...c.max.toArray()].every((v) => Math.abs(v / s) <= 36), 'collider within ±36 m');
  // The soft boundary and its respawn line, inside the sky box; the ceiling
  // under its top.
  const B = Y.bounds;
  assert.ok(B.x0 < B.x1 && B.z0 < B.z1 && B.respawn > 0 && B.ceiling > ROOM.h);
  assert.ok(B.x0 - B.respawn > -SKY.x && B.x1 + B.respawn < SKY.x && B.z0 - B.respawn > -SKY.z && B.z1 + B.respawn < SKY.z, 'respawn line inside the sky box');
  assert.ok(B.ceiling + B.respawn < SKY.y1, 'respawn ceiling inside the sky box');
  // The whole yard (its colliders) inside the soft boundary: you can reach
  // nothing that would send you back.
  for (const q of yardItems) assert.ok(q.min[0] >= B.x0 && q.max[0] <= B.x1 && q.min[2] >= B.z0 && q.max[2] <= B.z1, q.tag + ' inside the soft boundary');
  // The built (world unit) bounds are the data's.
  const W = b.yard.bounds;
  assert.deepEqual([W.soft.min.x, W.soft.min.z, W.soft.max.x, W.soft.max.z, W.soft.ceiling], [B.x0, B.z0, B.x1, B.z1, B.ceiling].map((v) => v * s));
  assert.deepEqual([W.respawn.min.x, W.respawn.min.z, W.respawn.max.x, W.respawn.max.z, W.respawn.ceiling],
    [B.x0 - B.respawn, B.z0 - B.respawn, B.x1 + B.respawn, B.z1 + B.respawn, B.ceiling + B.respawn].map((v) => v * s));
  assert.equal(W.margin, B.respawn * s);
  // Scenery past the respawn line only (it is visual only).
  for (const q of Y.scenery) assert.ok(q.max[2] < B.z0 - B.respawn || q.min[2] > B.z1 + B.respawn || q.max[0] < B.x0 - B.respawn || q.min[0] > B.x1 + B.respawn, 'scenery ' + q.part + ' past the respawn line');
});

// The ground has no hole: outside the house's footprint (x ±9.1, z ±6.1)
// every 10 cm cell of the sky box sits on exactly one yard floor patch (none
// over another); and round the shell's 10 cm ring (the old west garden wall's
// strip, the doggy door's threshold, every other wall foot) a ray straight
// down from 10 cm meets a floor, unless a wall standing on the ground covers
// that spot (the ray starts inside it).
test('yard ground: one floor patch under every cell outside the house, no hole round the shell (doggy door, west strip)', () => {
  const b = built();
  const inPatch = (f, x, z) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1;
  let cells = 0;
  for (let x = -SKY.x + 0.05; x < SKY.x; x += 0.1) {
    for (let z = -SKY.z + 0.05; z < SKY.z; z += 0.1) {
      if (Math.abs(x) < 9.1 && Math.abs(z) < 6.1) continue;
      const n = Y.floors.reduce((k, f) => k + (inPatch(f, x, z) ? 1 : 0), 0);
      assert.equal(n, 1, `ground at (${x.toFixed(2)}, ${z.toFixed(2)}) under ${n} floor patches`);
      cells++;
    }
  }
  assert.ok(cells > 200000, cells + ' cells');
  const meshes = [];
  b.group.traverse((o) => { if (o.isMesh && o.name !== 'houseSky') meshes.push(o); });
  const grounded = b.colliders.map(toM).filter((c) => c.min[1] <= EPS && c.max[1] >= 0.1);
  const rc = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const pts = [[9.05, 4.41], [9.05, Y.gaps.find((g) => g.name === 'doggy door').min[2] + 0.005], [-9.05, 0]];
  // Off every 2 cm line (a ray on a patch's edge is ambiguous).
  for (let i = 0; i < 610; i++) { const t = -6.09 + 0.02 * i; pts.push([9.05, t], [-9.05, t]); }
  for (let i = 0; i < 910; i++) { const t = -9.09 + 0.02 * i; pts.push([t, 6.05], [t, -6.05]); }
  let rays = 0;
  for (const [x, z] of pts) {
    if (grounded.some((c) => x > c.min[0] && x < c.max[0] && z > c.min[2] && z < c.max[2])) continue;
    rc.set(new THREE.Vector3(x * s, 0.1 * s, z * s), down);
    rc.far = 0.2 * s;
    const hit = rc.intersectObjects(meshes, false)[0];
    assert.ok(hit && /floor/.test(hit.object.name) && Math.abs(hit.point.y) < 0.01 * s,
      `hole in the ground at (${x.toFixed(2)}, ${z.toFixed(2)}): ${hit ? hit.object.name : 'nothing'}`);
    rays++;
  }
  assert.ok(rays >= 3, rays + ' rays');
  console.log(`# yard ground: ${cells} cells on one patch each, ${rays} rays round the shell meet a floor`);
});

test('yard gaps: names, metadata, which are tight, all in mapGaps(house) at world scale', () => {
  const names = Y.gaps.map((g) => g.name);
  assert.equal(new Set(names).size, names.length, 'yard gap names unique');
  for (const n of SPEC_GAPS) assert.ok(names.includes(n), 'spec gap ' + n);
  for (const n of GYM_GAPS) assert.ok(names.includes(n), 'jungle gym gap ' + n);
  for (const n of names) assert.ok(SPEC_GAPS.includes(n) || GYM_GAPS.includes(n) || OPTIONAL_GAP(n), 'a gap the spec names: ' + n);
  for (const g of Y.gaps) if (GYM_GAPS.includes(g.name)) assert.equal(g.feature, 'jungle gym', g.name + ' feature');
  assert.deepEqual(Y.gaps.filter((g) => g.tight).map((g) => g.name), TIGHT_GAPS, 'tight: the kitchen window only');
  const all = mapGaps('house');
  const allNames = all.map((g) => g.name);
  assert.equal(new Set(allNames).size, allNames.length, 'mapGaps(house) names unique');
  // The House's own three first, unchanged; the yard's after, in order.
  assert.deepEqual(allNames.slice(0, 3), ['bookshelf gap', 'under the patio table (along z)', 'under the patio table (along x)']);
  assert.deepEqual(allNames.slice(3), names, 'the yard gaps appended in order');
  const r = (v) => Math.round(v * s * 1e4) / 1e4;
  for (const g of Y.gaps) {
    const v = all.find((q) => q.name === g.name);
    assert.ok(v, g.name + ' in mapGaps(house)');
    assert.equal(v.map, 'house');
    assert.equal(v.axis, g.axis, g.name + ' axis');
    assert.deepEqual([v.min.x, v.min.y, v.min.z], g.min.map(r), g.name + ' min (m × HOUSE_WS)');
    assert.deepEqual([v.max.x, v.max.y, v.max.z], g.max.map(r), g.name + ' max (m × HOUSE_WS)');
  }
  assert.deepEqual(built().gaps, all, 'buildMap(house).gaps is mapGaps(house)');
  // The whoop the gaps are sized for: fractal75, rim reach 0.0601 m.
  assert.equal(WHOOP_75.W, 0.1202);
  assert.ok(Math.abs(WHOOP_75.gap - (0.1202 + 2 * 0.040)) < 1e-12 && Math.abs(WHOOP_75.gapTight - (0.1202 + 2 * 0.020)) < 1e-12);
  assert.equal(WHOOP_75.depth, GAP_MIN_DEPTH_M);
});

// One subtest per gap: it is an opening, walled, sized for the 75, and what
// walls it is what you see.
test('each yard gap: clear of colliders, walled within 2 cm, collider == visual round it, 75 mm whoop passes', async (t) => {
  const b = built(), cols = b.colliders.map(box3Arr);
  const meshes = boxMeshes(b.group);
  const near = (bb, g) => {
    const o = [0, 1, 2].map((k) => Math.min(g.max[k], bb.max[k]) - Math.max(g.min[k], bb.min[k]));
    return o.every((v) => v >= -0.02 * s);
  };
  for (const g of Y.gaps) {
    await t.test(g.name, () => {
      const vol = { min: g.min.map((v) => v * s), max: g.max.map((v) => v * s) };
      let walled = 0;
      const nearCols = [];
      for (const c of cols) {
        const o = [0, 1, 2].map((k) => Math.min(vol.max[k], c.max[k]) - Math.max(vol.min[k], c.min[k]));
        assert.ok(!(o[0] > 1e-3 && o[1] > 1e-3 && o[2] > 1e-3), g.name + ' overlaps a collider ' + JSON.stringify(c));
        // A collider touching one of its sides (2 cm, world units).
        if (o.every((v) => v >= -0.02 * s) && Math.min(...o) <= 0.02 * s) walled++;
        if (near(c, vol)) nearCols.push(c);
      }
      assert.ok(walled > 0, g.name + ' has a wall within 2 cm');
      assert.ok(nearCols.length > 0, g.name + ' has colliders round it');
      for (const c of nearCols) {
        assert.ok(meshes.some((m) => sameBox(m.bb, c, 1e-4)), g.name + ': collider ' + JSON.stringify(boxM({ min: new THREE.Vector3(...c.min), max: new THREE.Vector3(...c.max) })) + ' has no mesh');
      }
      const nearMeshes = meshes.filter((m) => near(m.bb, vol));
      assert.ok(nearMeshes.length > 0, g.name + ' has meshes round it');
      for (const m of nearMeshes) {
        assert.ok(cols.some((c) => sameBox(m.bb, c, 1e-4)), g.name + ': mesh ' + (m.mesh.name || '(unnamed)') + ' ' + JSON.stringify(m.bb) + ' has no equal collider');
      }
      // Sized for the 75: its two cross-section sides, its depth.
      const a = AX[g.axis];
      const dims = [0, 1, 2].map((k) => g.max[k] - g.min[k]);
      const need = g.tight ? WHOOP_75.gapTight : WHOOP_75.gap;
      for (const k of [0, 1, 2]) {
        if (k === a) assert.ok(dims[k] >= GAP_MIN_DEPTH_M - 1e-9, g.name + ' depth ' + dims[k]);
        else assert.ok(dims[k] >= need - 1e-9, `${g.name} cross-section ${dims[k].toFixed(4)} < ${need.toFixed(4)}${g.tight ? ' (tight)' : ''}`);
      }
      t.diagnostic(`${g.name}: ${g.axis}, ${dims.filter((_, k) => k !== a).map((v) => v.toFixed(3)).join(' x ')} m, depth ${dims[a].toFixed(3)}${g.tight ? ', tight' : ''}, ${nearCols.length} colliders / ${nearMeshes.length} meshes round it`);
    });
  }
});

// The House's rule: anything that stops the quad is clearly visible at flying
// speed. Every collider is drawn by an opaque mesh the same size (the crashed
// whoop: its opaque parts, inside its one box), except the real windows and
// the trampoline's net, listed here by name: a new see-through collider fails
// until the owner adds it. Nothing stands as glass over the patio's garden
// wall: open to the roof, back and front.
const SEE_THROUGH_OK = [
  'sliding door:fixed pane', 'sliding door:sliding pane', ':kitchen window glass',
  'trampoline:net', 'trampoline:net over the zipper',
];
test('the House\'s rule: every collider drawn opaque at its size, the real windows and the net the only see-through ones', () => {
  const b = built(), cols = b.colliders;
  const meshes = [];
  b.group.traverse((o) => { if (o.isMesh && o.name !== 'houseSky') meshes.push({ mesh: o, bb: box3Arr(new THREE.Box3().setFromObject(o)) }); });
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const opaque = (m) => !m.material.transparent && (m.material.opacity ?? 1) >= 1 && m.material.colorWrite !== false && shown(m);
  const name = (i) => {
    if (i < BOXES.length) return label(BOXES[i]);
    if (i < I_EAST) return 'shell:' + (i - BOXES.length);
    if (i < I_YARD) return label(Y.eastWall[i - I_EAST]);
    if (i < I_WHOOP) return label(Y.boxes[i - I_YARD]);
    return 'crashed whoop';
  };
  const seeThrough = [];
  cols.forEach((c, i) => {
    const n = name(i);
    if (i === I_WHOOP) {
      const parts = meshes.filter((m) => [0, 1, 2].every((k) => m.bb.min[k] >= c.min.getComponent(k) - 1e-6 && m.bb.max[k] <= c.max.getComponent(k) + 1e-6));
      assert.equal(parts.length, Y.whoop.parts.length, 'the crashed whoop: its parts inside its box');
      for (const m of parts) assert.ok(opaque(m.mesh), 'the crashed whoop: a part drawn opaque');
      return;
    }
    const own = meshes.filter((m) => sameBox(m.bb, box3Arr(c), 1e-4));
    assert.ok(own.length > 0, n + ': a collider with no mesh its size');
    if (own.some((m) => opaque(m.mesh))) return;
    seeThrough.push(n);
  });
  for (const n of seeThrough) assert.ok(SEE_THROUGH_OK.includes(n), 'a see-through collider not on the list: ' + n);
  assert.ok(!BOXES.some((q) => q.feature === 'patio' && q.mat === 'glass'), 'no glass on the patio');
  console.log(`# visible: ${cols.length} colliders, see-through only: ${[...new Set(seeThrough)].join(', ')}`);
});

// A ring through every gap: the 75's footprint with its clearance (W + 40 mm
// a side, 20 mm where tight; a square, 3 cm thick) flown straight through each of the House's named gaps
// on its axis, through its centre, from 30 cm before the gap to 30 cm past
// it, meets no collider.
test('a ring through every House gap: the 75 at the gap\'s centre, 30 cm either side, touches no collider', async (t) => {
  const cols = built().colliders.map(box3Arr);
  const all = mapGaps('house');
  assert.ok(all.some((g) => g.name === 'patio wall gap (back)') && all.some((g) => g.name === 'patio wall gap (front)'), 'the patio wall gaps named');
  const yardTight = new Set(Y.gaps.filter((g) => g.tight).map((g) => g.name));
  for (const g of all) {
    await t.test(g.name, () => {
      const a = AX[g.axis];
      const lo = [g.min.x, g.min.y, g.min.z], hi = [g.max.x, g.max.y, g.max.z];
      const c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
      const half = (WHOOP_75.W / 2 + (yardTight.has(g.name) ? WHOOP_75.tight : WHOOP_75.clear)) * s;
      const ring = 0.015 * s;
      let hits = [];
      for (let u = lo[a] - 0.3 * s; u <= hi[a] + 0.3 * s + 1e-9; u += 0.01 * s) {
        const mn = [0, 1, 2].map((k) => (k === a ? u - ring : c[k] - half));
        const mx = [0, 1, 2].map((k) => (k === a ? u + ring : c[k] + half));
        for (const q of cols) {
          if ([0, 1, 2].every((k) => Math.min(mx[k], q.max[k]) - Math.max(mn[k], q.min[k]) > 1e-6)) hits.push(JSON.stringify(boxM({ min: new THREE.Vector3(...q.min), max: new THREE.Vector3(...q.max) })));
        }
      }
      hits = [...new Set(hits)];
      assert.deepEqual(hits, [], g.name + ' ring hits');
      t.diagnostic(`${g.name}: ${g.axis}, ring ${(2 * half / s * 1000).toFixed(0)} mm clear through ${((hi[a] - lo[a]) / s + 0.6).toFixed(2)} m`);
    });
  }
});

// ---------------------------------------------------------------------------
// The interior, as it was (origin/main 8b5119e): HOUSE_PLAY.boxes then
// (three patio posts at z -6, -0.06, 5.88, the long west glass screen and the
// two end screens over the garden wall; no patio fan; the sliding door's two
// panes without their frame) and the shell then (the east wall one box, the west 0.9 m garden
// wall), from the values in yard-spec.md and git show 8b5119e:sim-maps.js.
// sha256 of JSON.stringify(HOUSE_PLAY.boxes) at 8b5119e:
const ORIGINAL_BOXES_SHA = '782c69e4cc9a44e27c575a713a3a4b1505ba3c738b1ce8970a04dc6853e92c1e';
function originalBoxes() {
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const b = (room, mat, feature, part, x0, y0, z0, x1, y1, z1) => Object.freeze({ room, mat, feature, part, min: [r(x0), r(y0), r(z0)], max: [r(x1), r(y1), r(z1)] });
  const out = [];
  let posts = false;
  for (const q of BOXES) {
    if (q.feature === 'patio fan') continue;
    // The sliding door's panes, no frame.
    if (q.feature === 'sliding door' && /^frame/.test(q.part)) continue;
    if (q.feature === 'patio' && q.part === 'post') {
      if (posts) continue;
      posts = true;
      for (const z of [-6, -0.06, 5.88]) out.push(b('patio', 'wood', 'patio', 'post', -9, 0, z, -8.88, ROOM.h, z + 0.12));
      out.push(b('patio', 'glass', 'patio', 'screen', -9, 0.9, -6, -8.94, ROOM.h, 6));
      out.push(b('patio', 'glass', 'patio', 'screen', -9, 0.9, -6, -5.7, ROOM.h, -5.94));
      out.push(b('patio', 'glass', 'patio', 'screen', -9, 0.9, 5.94, -5.7, ROOM.h, 6));
      continue;
    }
    out.push(q);
  }
  return out;
}
// The original shell's colliders, world units: today's five base boxes, the
// one east wall box, the west garden wall box.
function originalShell(cols) {
  const hx = ROOM.w * s / 2, hz = ROOM.d * s / 2, H = ROOM.h * s, t = LAYOUT.house.wall, gw = HOUSE_PLAY.patio.gardenWall * s;
  return [
    ...cols.slice(BOXES.length, I_EAST).map(box3Arr),
    { min: [hx, 0, -hz - t], max: [hx + t, H, hz + t] },
    { min: [-hx - t, 0, -hz], max: [-hx, gw, hz] },
  ];
}
// The key's direction (to the sun).
function toSun() {
  const e = HOUSE_KEY.elevation * Math.PI / 180, a = HOUSE_KEY.azimuth * Math.PI / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
// Lit: the ray to the sun from p (metres) meets no caster from 2 cm out to
// where it leaves the sky box. Slab test per box, so nothing is missed.
function litFn(casters) {
  const d = toSun();
  return (p) => {
    let tEnd = Infinity;
    for (const [k, lo, hi] of [[0, -SKY.x, SKY.x], [1, SKY.y0, SKY.y1], [2, -SKY.z, SKY.z]]) {
      if (d[k] > 0) tEnd = Math.min(tEnd, (hi - p[k]) / d[k]);
      else if (d[k] < 0) tEnd = Math.min(tEnd, (lo - p[k]) / d[k]);
    }
    for (const c of casters) {
      let t0 = 0.02, t1 = tEnd;
      for (let k = 0; k < 3 && t0 <= t1; k++) {
        if (Math.abs(d[k]) < 1e-12) {
          if (p[k] < c.min[k] || p[k] > c.max[k]) t0 = Infinity;
          continue;
        }
        let a = (c.min[k] - p[k]) / d[k], bb = (c.max[k] - p[k]) / d[k];
        if (a > bb) [a, bb] = [bb, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, bb);
      }
      if (t0 <= t1) return false;
    }
    return true;
  };
}

test('interior unchanged: the sun on a dense interior grid is the same as with the original house', () => {
  const orig = originalBoxes();
  assert.equal(createHash('sha256').update(JSON.stringify(orig)).digest('hex'), ORIGINAL_BOXES_SHA, 'the original boxes reconstructed exactly');
  const b = built(), cols = b.colliders;
  // Casters: every collider whose mesh casts (not the glass, not the net).
  const glassEast = new Set(Y.eastWall.map((q, i) => (q.mat === 'glass' ? I_EAST + i : -1)));
  // The sliding door's frame (new, round the glass the key comes in by)
  // shades a few points the bare glass did not: that is the only change.
  const frame = (i) => i < BOXES.length && BOXES[i].feature === 'sliding door' && /^frame/.test(BOXES[i].part);
  const casts = cols.map((c, i) => ({ c, i })).filter(({ i }) => {
    if (i < BOXES.length) return BOXES[i].mat !== 'glass';
    if (glassEast.has(i)) return false;
    if (i >= I_YARD && i < I_WHOOP) return Y.boxes[i - I_YARD].mat !== 'net';
    return true;
  });
  const now = casts.filter(({ i }) => !frame(i)).map(({ c }) => toM(c));
  const litFrame = litFn(casts.map(({ c }) => toM(c)));
  let framed = 0;
  const then = [
    ...orig.filter((q) => q.mat !== 'glass'),
    ...originalShell(cols).map((c) => ({ min: c.min.map((v) => v / s), max: c.max.map((v) => v / s) })),
  ];
  const litNow = litFn(now), litThen = litFn(then);
  const diff = [];
  let n = 0, lit = 0;
  for (const y of [0.01, 1.0]) {
    for (let i = 0; ; i++) {
      const x = -5.5 + 0.25 * i;
      if (x > 8.9 + 1e-9) break;
      for (let j = 0; ; j++) {
        const z = -5.9 + 0.25 * j;
        if (z > 5.9 + 1e-9) break;
        const p = [x, y, z];
        const a = litThen(p), c = litNow(p);
        n++;
        if (a) lit++;
        if (c && !litFrame(p)) framed++;
        if (a !== c) diff.push(p.map((v) => +v.toFixed(2)).join(',') + (a ? ' was lit' : ' was dark'));
      }
    }
  }
  assert.ok(n > 5000, n + ' points');
  assert.ok(lit > 20, lit + ' lit points (the sun does come in)');
  assert.deepEqual(diff, [], 'sun changed at ' + diff.length + ' of ' + n + ' interior points');
  console.log(`# interior sun: ${framed} of ${lit} lit points in the sliding door frame's shadow`);
  assert.ok(framed < lit / 4, 'the frame shades ' + framed + ' of ' + lit);
});

// A material's shader uniforms as its onBeforeCompile writes them (the look's
// fill among them), on a stand-in shader.
function shaderUniforms(mat) {
  const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <lights_fragment_maps>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <color_fragment>\n#include <normal_fragment_maps>' };
  if (typeof mat.onBeforeCompile === 'function') mat.onBeforeCompile(sh, null);
  const out = {};
  for (const k of Object.keys(sh.uniforms).sort()) {
    const v = sh.uniforms[k].value;
    out[k] = v && typeof v.toArray === 'function' ? v.toArray() : v;
  }
  return out;
}
function matSig(mat) {
  const t = (x) => (x && x.isTexture ? x.name : null);
  return JSON.stringify({
    name: mat.name, type: mat.type, color: mat.color ? mat.color.getHex() : null,
    roughness: mat.roughness, metalness: mat.metalness, opacity: mat.opacity, transparent: mat.transparent,
    map: t(mat.map), normalMap: t(mat.normalMap), roughnessMap: t(mat.roughnessMap), aoMap: t(mat.aoMap),
    aoMapIntensity: mat.aoMapIntensity, normalScale: mat.normalScale ? mat.normalScale.toArray() : null,
    polygonOffset: mat.polygonOffset, vertexColors: mat.vertexColors, side: mat.side, depthWrite: mat.depthWrite,
    // three's default program cache key is onBeforeCompile.toString(), so it
    // carries the checkout's line endings: LF, as the repo stores it.
    lookKind: mat.userData.lookKind || null, cacheKey: mat.customProgramCacheKey ? mat.customProgramCacheKey().replace(/\r\n/g, '\n') : null,
    uniforms: shaderUniforms(mat),
  });
}
// sha256 of the sorted, unique matSig of every material under houseArtVisuals
// at origin/main 8b5119e (19 materials), and of the look data then.
const HOUSE_MATERIALS_SHA = '4e247da1c27042eec5abfa23515659705a39c1a5e48c1b195cee0d702bd914f8';
const HOUSE_LOOK_SHA = 'bdcb173bc5f04a2da619b1e4727b4740888d8fa6f6323e257df55e38b6f988a5';
const HOUSE_VIBE_SHA = '0b2983844eaaaf7bb716aeb5422d6327247693fe4298e0aa376bf7b7bcaeabad';
const MAP_LOOKS_HOUSE_SHA = '90a47dd880636d6dbce851fd5a036d6d18407cd93797f17a8f6de87050f70e81';
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

test('interior unchanged: the House\'s materials, look, key, vibe and sets as before; the yard on its own daylight fill', () => {
  assert.equal(sha(HOUSE_LOOK), HOUSE_LOOK_SHA, 'HOUSE_LOOK as at 8b5119e');
  assert.equal(sha(vibeFor('house')), HOUSE_VIBE_SHA, 'the house vibe as at 8b5119e');
  assert.equal(sha(MAP_LOOKS.house), MAP_LOOKS_HOUSE_SHA, 'MAP_LOOKS.house as at 8b5119e');
  assert.deepEqual({ ...HOUSE_KEY }, { elevation: 25, azimuth: 250, color: 0xffd9a8, intensity: 9 });
  const b = built();
  const vis = b.group.getObjectByName('houseArtVisuals');
  const sigs = new Set();
  vis.traverse((o) => { if (o.material) sigs.add(matSig(o.material)); });
  assert.equal(sigs.size, 19, 'the House\'s 19 materials');
  assert.equal(sha([...sigs].sort().join('\n')), HOUSE_MATERIALS_SHA, 'every house material, its maps, uniforms and fill as at 8b5119e');
  // Every house_ box: its surface's material, the interior fill.
  const S = HOUSE_LOOK.surfaces;
  const meshes = vis.children.filter((o) => o.isMesh && o.name.startsWith('house_'));
  assert.equal(meshes.length, BOXES.length);
  BOXES.forEach((q, i) => {
    const m = meshes[i].material;
    if (q.mat === 'glass') { assert.equal(m.name, 'house glass'); return; }
    assert.equal(m.name, 'house ' + S[q.mat].type, label(q));
    assert.equal(m.color.getHex(), S[q.mat].color, label(q));
    assert.deepEqual(shaderUniforms(m).lookFill, [...HOUSE_LOOK.fill], label(q) + ' fill');
  });
  const sets = [...new Set(Object.values(S).map((f) => LOOK.surfaces[f.look].set))].sort();
  assert.deepEqual(sets, ['fabric', 'galvanised', 'painted_steel', 'plywood']);
  // The floors' AO (floorAo over HOUSE_PLAY.boxes): inside the house
  // (x > -5.5 m) as it was but for the patio fan's reach as an overhead slab
  // (blades at 2.29 m, reach 1.2 + 2.29 m), which shades the back hall and
  // entry floor by at most 2/255; the patio's own texels see the posts move.
  const R = ROOM;
  const aoNow = floorAo(houseAoBoxes(), R), aoThen = floorAo(originalBoxes(), R);
  assert.equal(aoNow.width, aoThen.width);
  let changed = 0, worst = 0;
  for (let v = 0; v < aoNow.height; v++) {
    for (let u = 0; u < aoNow.width; u++) {
      const x = (u + 0.5) / aoNow.width * R.w - R.w / 2;
      if (x <= -5.5) continue;
      const d = Math.abs(aoNow.data[v * aoNow.width + u] - aoThen.data[v * aoNow.width + u]);
      if (d) changed++;
      worst = Math.max(worst, d);
    }
  }
  console.log(`# floor AO inside the house (x > -5.5 m): ${changed} texels changed, at most ${worst}/255`);
  assert.ok(worst <= 2, 'floor AO inside the house changed by ' + worst + '/255');
  // The yard: its own daylight fill, never the interior's.
  const yv = b.group.getObjectByName('houseYardArtVisuals');
  const ymats = new Set();
  yv.traverse((o) => { if (o.material) ymats.add(o.material); });
  let looked = 0;
  for (const m of ymats) {
    const u = shaderUniforms(m);
    if (m.userData.lookKind) {
      looked++;
      assert.deepEqual(u.lookFill, [...YARD_LOOK.fill], m.name + ' on the yard fill');
    }
    assert.notDeepEqual(u.lookFill, [...HOUSE_LOOK.fill], m.name + ' uses HOUSE_LOOK.fill');
    assert.notDeepEqual(u.lookFill, [...HOUSE_LOOK.ceilingFill], m.name + ' uses HOUSE_LOOK.ceilingFill');
    // Its own surfaces (the edge lines are the look's, as the House's).
    if (!m.isLineBasicMaterial) {
      assert.match(m.name, /^yard /, 'a yard material ' + m.name);
      assert.ok(!sigs.has(matSig(m)), m.name + ' is a house material');
    }
  }
  assert.equal(looked, Object.keys(YARD_LOOK.surfaces).length, 'one look material a yard surface');
});

test('texture budget: the House\'s four sets and AO DataTextures only, under 24 MB as KTX2 and as WebP; the look total pinned', () => {
  const b = built();
  const tex = new Set();
  b.group.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) for (const v of Object.values(m)) if (v && v.isTexture) tex.add(v);
  });
  const sets = new Set();
  let dataBytes = 0, dataN = 0;
  for (const t of tex) {
    if (t.isDataTexture) {
      dataN++;
      // Its data with mips (4/3).
      dataBytes += Math.round(t.image.data.byteLength * 4 / 3);
      assert.match(t.name, /ao/, 'a DataTexture that is an AO map: ' + t.name);
      continue;
    }
    const m = /^look_([a-z_]+)_(diff|nr|dr)_/.exec(t.name || '');
    assert.ok(m, 'a texture not from a look set: ' + t.name);
    sets.add(m[1]);
  }
  const list = [...sets].sort();
  assert.deepEqual(list, ['fabric', 'galvanised', 'painted_steel', 'plywood'], 'the House\'s four sets, no other');
  assert.ok(dataN >= 1, 'the floor AO');
  const ktx = lookKtx2Bytes('bc7', list, ['room']).total + dataBytes;
  const webp = lookTextureBytes(list, ['room']).total + dataBytes;
  assert.ok(ktx < 24e6, 'KTX2 ' + (ktx / 1e6).toFixed(2) + ' MB');
  assert.ok(webp < 24e6, 'WebP ' + (webp / 1e6).toFixed(2) + ' MB');
  assert.equal(lookTextureBytes().total, 23243431 + 344064 + 349525, 'the look\'s textures, the overcast fill, the decal atlas');
  console.log(`# textures: sets ${list.join(', ')}; ${dataN} DataTexture(s) ${dataBytes} B; KTX2 ${(ktx / 1e6).toFixed(2)} MB, WebP ${(webp / 1e6).toFixed(2)} MB`);
});

test('draw objects: after mergeStaticArt, houseArtVisuals <= 20, houseYardArtVisuals <= 20, the map <= 40', () => {
  const b = buildMap(THREE, 'house');
  const r = new THREE.Group();
  r.add(b.group);
  assert.ok(mergeStaticArt(THREE, r) > 0, 'something merged');
  const count = (g) => {
    let n = 0;
    g.traverse((o) => { if (o.isMesh || o.isLineSegments) n++; });
    return n;
  };
  const house = count(b.group.getObjectByName('houseArtVisuals'));
  const yard = count(b.group.getObjectByName('houseYardArtVisuals'));
  const all = count(r);
  console.log(`# draw objects: house ${house}, yard ${yard}, map ${all}`);
  assert.ok(house <= 20, 'houseArtVisuals ' + house);
  assert.ok(yard <= 20, 'houseYardArtVisuals ' + yard);
  assert.ok(all <= 40, 'map ' + all);
  // The yard's textured meshes keep their uvs through the merge.
  b.group.getObjectByName('houseYardArtVisuals').traverse((o) => {
    if (o.isMesh && o.material.map) assert.ok(o.geometry.getAttribute('uv'), o.material.name + ' lost its uvs');
  });
});

test('water hazard: the water visual\'s rect, over the pool inside the coping, no collider in it', () => {
  assert.equal(Y.hazards.length, 1);
  const h = Y.hazards[0];
  assert.equal(h.kind, 'water');
  const W = Y.water;
  assert.deepEqual([h.min[0], h.min[2], h.max[0], h.max[2]], [W.x0, W.z0, W.x1, W.z1], 'hazard x/z = the water rect');
  assert.ok(h.min[1] === 0 && W.y > h.min[1] && W.y < h.max[1], 'the water plane inside the hazard band');
  // The built water mesh: that rect, at that height.
  const b = built();
  const water = b.group.getObjectByName('yard water');
  assert.ok(water && water.isMesh, 'yard water mesh');
  const bb = box3Arr(new THREE.Box3().setFromObject(water));
  assert.ok(Math.abs(bb.min[0] - W.x0 * s) < 1e-4 && Math.abs(bb.max[0] - W.x1 * s) < 1e-4 && Math.abs(bb.min[2] - W.z0 * s) < 1e-4 && Math.abs(bb.max[2] - W.z1 * s) < 1e-4, 'water mesh rect');
  assert.ok(Math.abs(bb.min[1] - W.y * s) < 1e-4 && Math.abs(bb.max[1] - W.y * s) < 1e-4, 'water mesh flat at y ' + W.y);
  assert.ok(!b.colliders.some((c) => sameBox(box3Arr(c), bb, 1e-3)), 'the water has no collider');
  // The built hazard: the data at world scale.
  const bh = b.yard.hazards[0];
  assert.equal(bh.kind, 'water');
  assert.deepEqual([bh.min.x, bh.min.y, bh.min.z, bh.max.x, bh.max.y, bh.max.z], [...h.min, ...h.max].map((v) => v * s));
  // The coping: four pool boxes whose inner faces are the water's edges, as
  // high as the hazard band.
  const coping = Y.boxes.filter((q) => q.feature === 'pool' && q.part === 'coping');
  assert.equal(coping.length, 4);
  const ring = { min: [Math.min(...coping.map((q) => q.min[0])), 0, Math.min(...coping.map((q) => q.min[2]))], max: [Math.max(...coping.map((q) => q.max[0])), 0, Math.max(...coping.map((q) => q.max[2]))] };
  assert.ok(ring.min[0] < W.x0 && ring.max[0] > W.x1 && ring.min[2] < W.z0 && ring.max[2] > W.z1, 'the coping rings the water');
  for (const q of coping) assert.equal(q.max[1], h.max[1], 'coping top = the hazard top');
  for (const [k, v, side] of [[0, W.x0, 'max'], [0, W.x1, 'min'], [2, W.z0, 'max'], [2, W.z1, 'min']]) {
    assert.ok(coping.some((q) => Math.abs(q[side][k] - v) < EPS), 'a coping edge on the water at ' + v);
  }
  // Nothing in the water: no collider overlaps the hazard volume.
  for (const c of b.colliders) {
    const m = toM(c);
    const o = [0, 1, 2].map((k) => Math.min(h.max[k], m.max[k]) - Math.max(h.min[k], m.min[k]));
    assert.ok(!(o[0] > EPS && o[1] > EPS && o[2] > EPS), 'a collider in the pool: ' + JSON.stringify(boxM(c)));
  }
});

test('powerloop: the swing set\'s top bar loop volume holds nothing but the swing set', () => {
  const v = Y.powerloops.swing;
  assert.equal(v.feature, 'swing set');
  const bar = Y.boxes.find((q) => q.feature === 'swing set' && q.part === 'top bar');
  assert.ok(bar, 'the top bar');
  assert.ok(v.min[1] === 0 && v.max[1] >= bar.max[1] + 1.5 - 1e-9, 'floor to 1.5 m over the bar');
  const zc = (bar.min[2] + bar.max[2]) / 2;
  assert.ok(v.min[2] <= zc - 1.5 + 1e-9 && v.max[2] >= zc + 1.5 - 1e-9, '1.5 m out either side of the bar\'s line');
  assert.ok(v.min[0] >= bar.min[0] && v.max[0] <= bar.max[0], 'along the bar');
  const between = Y.gaps.find((g) => g.name === 'between the swings');
  assert.ok(inside(between.min, v.min, v.max) && inside(between.max, v.min, v.max), 'the loop flies through between the swings');
  const ov = (m) => [0, 1, 2].every((k) => m.min[k] < v.max[k] - EPS && v.min[k] < m.max[k] - EPS);
  // Of the yard's boxes, only the swing set's; of every collider, only those.
  const inLoop = Y.boxes.filter((q) => ov(q) && q.feature !== 'swing set');
  assert.deepEqual(inLoop.map(label), [], 'swing powerloop clear');
  const swingIdx = new Set(Y.boxes.map((q, i) => (q.feature === 'swing set' ? I_YARD + i : -1)));
  const stray = built().colliders.map((c, i) => ({ i, m: toM(c) })).filter(({ i, m }) => ov(m) && !swingIdx.has(i));
  assert.deepEqual(stray.map(({ i }) => i), [], 'no other collider in the loop');
  assert.ok(Y.boxes.some((q) => q.feature === 'swing set' && ov(q)), 'the bar and its swings are in it');
});

test('powerloop: over the dome climber, its volume holds nothing but the jungle gym and its sandbox', () => {
  const v = Y.powerloops.dome;
  assert.equal(v.feature, 'jungle gym');
  const crown = Y.gaps.find((g) => g.name === 'dome crown');
  assert.ok(inside(crown.min, v.min, v.max) && inside(crown.max, v.min, v.max), 'the loop comes down through the crown');
  const rings = Y.boxes.filter((q) => q.part === 'dome ring');
  const top = Math.max(...rings.map((q) => q.max[1]));
  assert.ok(v.min[1] === 0 && v.max[1] >= top + 1.5 - 1e-9, 'ground to 1.5 m over the crown');
  const ov = (m) => [0, 1, 2].every((k) => m.min[k] < v.max[k] - EPS && v.min[k] < m.max[k] - EPS);
  const gym = (q) => q.feature === 'jungle gym' || q.feature === 'sandbox';
  assert.deepEqual(Y.boxes.filter((q) => ov(q) && !gym(q)).map(label), [], 'dome powerloop clear');
  const own = new Set(Y.boxes.map((q, i) => (gym(q) ? I_YARD + i : -1)));
  const stray = built().colliders.map((c, i) => ({ i, m: toM(c) })).filter(({ i, m }) => ov(m) && !own.has(i));
  assert.deepEqual(stray.map(({ i }) => i), [], 'no other collider in the loop');
});

// ---------------------------------------------------------------------------
// The Backyard Lap: tracks/house-backyard-lap.json and its ghost, written by
// tools/build_house_yard_lap.mjs (yardLapJson, yardLapGhost) from
// sim-house-yard.js yardLine (a turtle line as houseLine: points, gates
// { at, name, size, ry, s }, closes, length).
const LAP_ID = 'house-backyard-lap';
const LAP_TRACK = join(root, 'tracks', LAP_ID + '.json');
const LAP_GHOST = join(root, 'ghosts', LAP_ID + '.json');
const LAP_TOOL = join(root, 'tools', 'build_house_yard_lap.mjs');
async function lap() {
  const missing = [LAP_TRACK, LAP_GHOST, LAP_TOOL].filter((f) => !existsSync(f));
  assert.deepEqual(missing.map((f) => f.slice(root.length + 1).replace(/\\/g, '/')), [], 'Backyard Lap files missing (built by tools/build_house_yard_lap.mjs)');
  assert.equal(typeof YARD.yardLine, 'function', 'sim-house-yard.js exports yardLine');
  const tool = await import(pathToFileURL(LAP_TOOL).href);
  assert.equal(typeof tool.yardLapJson, 'function', 'build_house_yard_lap.mjs exports yardLapJson');
  assert.equal(typeof tool.yardLapGhost, 'function', 'build_house_yard_lap.mjs exports yardLapGhost');
  const raw = JSON.parse(readFileSync(LAP_TRACK, 'utf8'));
  const line = YARD.yardLine(0.01);
  return { tool, raw, track: normalizeTrack(raw), line };
}
const mm = (v) => v / s;

test('Backyard Lap: written by its generator, registered after the House Loop', async () => {
  const { tool, raw, track } = await lap();
  assert.equal(readFileSync(LAP_TRACK, 'utf8').replace(/\r\n/g, '\n'), tool.yardLapJson(), 'tracks/house-backyard-lap.json is node tools/build_house_yard_lap.mjs');
  const g = JSON.parse(readFileSync(LAP_GHOST, 'utf8'));
  assert.deepEqual(g, tool.yardLapGhost(), 'ghosts/house-backyard-lap.json is node tools/build_house_yard_lap.mjs');
  assert.equal(g.track, LAP_ID);
  assert.equal(ghostPayloadError(g, LAP_ID), null, 'the ghost loads');
  assert.equal(raw.id, LAP_ID);
  assert.equal(raw.map, 'house');
  assert.equal(raw.name, 'Backyard Lap');
  assert.equal(track.map, 'house');
  const iLoop = BUILTIN_TRACK_FILES.findIndex((t) => t.id === 'house-loop');
  const iLap = BUILTIN_TRACK_FILES.findIndex((t) => t.id === LAP_ID);
  assert.ok(iLap >= 0, 'in BUILTIN_TRACK_FILES');
  assert.ok(iLap > iLoop, 'after house-loop');
  assert.deepEqual({ ...BUILTIN_TRACK_FILES[iLap] }, { id: LAP_ID, file: 'tracks/' + LAP_ID + '.json', map: 'house', name: 'Backyard Lap' });
  assert.equal(BUILTIN_TRACK_FILES.find((t) => t.map === 'house').id, 'house-loop', 'the House Loop stays the House\'s first track');
  const cat = JSON.parse(readFileSync(join(root, 'tracks/catalog.json'), 'utf8'));
  const tracks = cat.tracks || [];
  assert.ok(tracks.some((t) => t.id === LAP_ID && t.map === 'house' && t.name === 'Backyard Lap' && t.file === 'tracks/' + LAP_ID + '.json'), 'in tracks/catalog.json');
});

test('Backyard Lap: 12-20 gates in order on the line, clear of every collider, over the water, inside the soft bounds', async () => {
  const { raw, track, line } = await lap();
  const P = line.points;
  assert.ok(line.closes < 1e-3, 'the line closes ' + line.closes);
  const gates = track.gates.map((g) => ({ p: [mm(g.x), mm(g.y), mm(g.z)], r: mm(gateRadius(g)) }));
  assert.ok(gates.length >= 12 && gates.length <= 20, gates.length + ' gates');
  assert.equal(line.gates.length, gates.length);
  line.gates.forEach((g, i) => assert.ok(Math.hypot(...[0, 1, 2].map((k) => gates[i].p[k] - P[g.at][k])) < 1e-3, (g.name || i) + ' on the line'));
  for (let i = 1; i < line.gates.length; i++) assert.ok(line.gates[i].at > line.gates[i - 1].at, 'gates in order along the line');
  // Flown from the pad round twice: each gate entered in order, once a lap.
  const start = [mm(raw.start.x), mm(raw.start.y), mm(raw.start.z)];
  const path = [];
  for (let i = 0; i < 200; i++) path.push(P[0].map((v, k) => start[k] + (v - start[k]) * i / 200));
  path.push(...P, ...P);
  const inSph = gates.map(() => false);
  let next = 0, passes = 0;
  for (const p of path) {
    gates.forEach((g, i) => {
      const now = Math.hypot(...[0, 1, 2].map((k) => p[k] - g.p[k])) < g.r;
      if (now && !inSph[i]) {
        assert.equal(i, next, `entered gate ${i} expecting ${next}`);
        next = (next + 1) % gates.length;
        passes++;
      }
      inSph[i] = now;
    });
  }
  assert.equal(passes, 2 * gates.length, 'every gate twice in two laps');
  // Clear: 8.5 cm from every collider (the House's included), 10 cm over
  // the water's crash band, inside the soft boundary and under its ceiling.
  const cols = built().colliders.map(toM);
  const B = Y.bounds, h = Y.hazards[0];
  let minC = Infinity, minW = Infinity;
  for (const p of [start, ...P]) {
    for (const c of cols) {
      const d = boxDist(p, c);
      if (d < minC) minC = d;
      assert.ok(d >= 0.085, 'line hits geometry at ' + p.map((v) => v.toFixed(2)) + ' (' + d.toFixed(3) + ' m)');
    }
    if (p[0] >= h.min[0] && p[0] <= h.max[0] && p[2] >= h.min[2] && p[2] <= h.max[2]) {
      minW = Math.min(minW, p[1] - h.max[1]);
      assert.ok(p[1] - h.max[1] >= 0.10, 'line within 10 cm of the water at ' + p.map((v) => v.toFixed(2)));
    }
    assert.ok(p[0] > B.x0 && p[0] < B.x1 && p[2] > B.z0 && p[2] < B.z1 && p[1] < B.ceiling, 'line outside the soft bounds at ' + p.map((v) => v.toFixed(2)));
  }
  // The ghost flies clear too.
  const g = JSON.parse(readFileSync(LAP_GHOST, 'utf8'));
  for (const smp of g.samples) {
    const q = smp.slice(1, 4).map(mm);
    assert.ok(Math.min(...cols.map((c) => boxDist(q, c))) >= 0.085, 'ghost clips at ' + smp.slice(1, 4));
  }
  console.log(`# Backyard Lap: ${gates.length} gates, ${line.length.toFixed(1)} m, nearest collider ${minC.toFixed(3)} m, over the water ${Number.isFinite(minW) ? minW.toFixed(3) + ' m over the crash band' : 'not crossed'}`);
});

// A run of the closed line inside a gap volume threads it when the line comes
// in through one face across the gap's axis and leaves through the other.
function threads(P, g) {
  const a = AX[g.axis], n = P.length;
  const lo = g.min, hi = g.max;
  const inV = P.map((p) => inside(p, lo, hi));
  if (inV.every(Boolean)) return false;
  let start = inV.findIndex((v) => !v);
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (inV[i] || !inV[(i + 1) % n]) continue;
    // A run from i+1; find its end.
    let j = (i + 1) % n;
    let len = 0;
    while (inV[(j + 1) % n] && len < n) { j = (j + 1) % n; len++; }
    const before = P[i], after = P[(j + 1) % n];
    const across = (p) => [0, 1, 2].every((q) => q === a || (p[q] >= lo[q] - 0.02 && p[q] <= hi[q] + 0.02));
    const sideIn = before[a] < lo[a] ? -1 : before[a] > hi[a] ? 1 : 0;
    const sideOut = after[a] < lo[a] ? -1 : after[a] > hi[a] ? 1 : 0;
    if (sideIn && sideOut && sideIn === -sideOut && across(before) && across(after)) return true;
  }
  return false;
}

test('Backyard Lap: threads at least 7 named yard gaps, in one face and out the other', async () => {
  const { line } = await lap();
  const hit = Y.gaps.filter((g) => SPEC_GAPS.includes(g.name) && threads(line.points, g)).map((g) => g.name);
  const extra = Y.gaps.filter((g) => !SPEC_GAPS.includes(g.name) && threads(line.points, g)).map((g) => g.name);
  console.log(`# Backyard Lap threads ${hit.length} yard gaps: ${hit.join(', ')}${extra.length ? ' (and ' + extra.join(', ') + ')' : ''}`);
  assert.ok(hit.length >= 7, hit.length + ' yard gaps threaded: ' + hit.join(', '));
});

// ---------------------------------------------------------------------------
// The House's own tracks and ghosts, as on origin/main 8b5119e (LF bytes).
// A ghost's phys tag is the physics version (sim-whoop.js PHYSICS_VER), bumped
// with each sim-core release that moves the physics (7 since v0.7.0), so the
// ghost is pinned with its tag read as 8b5119e's (6), and the tag is checked
// against PHYSICS_VER on its own. Every other byte is 8b5119e's.
const PHYS_TAG = /"phys":\d+,/;
const HOUSE_LOOP_PHYS = { 'ghosts/house-loop.json': 6 };
const HOUSE_LOOP_SHA = {
  'tracks/house-loop.json': 'f05e61954666e78c075b01b7669bfc80072d5456b5bc2d638389ea09e01688aa',
  'ghosts/house-loop.json': '951478566541e9249a133dec5dac5fb0d6ae7a7464ebe830c3460fde8f9d3fc3',
};

test('existing House tracks and ghosts: house-loop byte-identical to origin/main, every house track loads', (t) => {
  for (const [f, want] of Object.entries(HOUSE_LOOP_SHA)) {
    const here = readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n');
    const tagged = f in HOUSE_LOOP_PHYS;
    if (tagged) {
      assert.equal(JSON.parse(here).phys, PHYSICS_VER, f + ' is tagged with the physics version');
      assert.equal((here.match(new RegExp(PHYS_TAG.source, 'g')) || []).length, 1, f + ': one phys tag');
    }
    const pinned = tagged ? here.replace(PHYS_TAG, `"phys":${HOUSE_LOOP_PHYS[f]},`) : here;
    assert.equal(sha(pinned), want, f + ' as at origin/main 8b5119e' + (tagged ? ', its phys tag apart' : ''));
    // Where the clone has origin/main (not CI's shallow checkout), the blob too.
    const r = spawnSync('git', ['show', 'origin/main:' + f], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
    const untag = (s) => (tagged ? s.replace(PHYS_TAG, '"phys":0,') : s);
    if (r.status === 0) assert.equal(untag(here), untag(r.stdout.replace(/\r\n/g, '\n')), f + ' == git show origin/main:' + f + (tagged ? ', its phys tag apart' : ''));
    else t.diagnostic('no origin/main here (' + (r.stderr || '').trim().split('\n')[0] + '): pinned sha256 only for ' + f);
  }
  const house = BUILTIN_TRACK_FILES.filter((q) => q.map === 'house');
  assert.ok(house.length >= 1 && house[0].id === 'house-loop');
  for (const meta of house) {
    const file = join(root, meta.file);
    assert.ok(existsSync(file), meta.file);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const tr = normalizeTrack(raw);
    assert.ok(tr && tr.gates && tr.gates.length >= 3, meta.id + ' normalizes');
    assert.equal(tr.map, 'house', meta.id + ' on the House');
    const gf = join(root, 'ghosts', meta.id + '.json');
    if (existsSync(gf)) assert.equal(ghostPayloadError(JSON.parse(readFileSync(gf, 'utf8')), meta.id), null, meta.id + ' ghost loads');
  }
});

test('map boot (node): buildMap(house) builds, its time recorded', (t) => {
  const times = [];
  let b = null;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    b = buildMap(THREE, 'house');
    times.push(performance.now() - t0);
  }
  assert.ok(b && b.group && b.colliders.length === I_WHOOP + 1);
  times.sort((p, q) => p - q);
  const msg = `buildMap('house'): ${times.map((v) => v.toFixed(1)).join(' / ')} ms (median ${times[1].toFixed(1)}), ${b.colliders.length} colliders`;
  t.diagnostic(msg);
  console.log('# ' + msg);
});
