// The Bando: the owner's spec checked on the shipped data (sim-maps.js
// BANDO_PLAY, bandoLine, BANDO_LOOK, mapGaps('bando') + tracks/bando-loop.json),
// in metres, and the loop flown on the bf core.
// node --test tools/test_sim_bando.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import {
  BANDO_PLAY, BANDO_WS, BANDO_LOOK, BANDO_KEY, BANDO_SHADOW, BANDO_SHADOW_INTENSITY, bandoLine, bandoShafts, bandoTown, mapGaps,
  LAYOUT, MAP_ORBIT, MAP_LOOKS, MAP_IDS, buildMap,
} from '../sim-maps.js';
import { WS } from '../sim-core-adapter.js';
import {
  normalizeTrack, gateRadius, lapLengthMetres, BUILTIN_TRACK_FILES, MAPS, PUBLIC_MAPS, mapOpen, freestyleStart, startPad,
  CLASS_MAPS, classDefaultMap,
} from '../sim-tracks.js';
import { BOUNCE_MAPS } from '../sim-whoop.js';
import { vibeFor, mergeStaticArt, resolveMapLighting } from '../sim-art.js';
import { LOOK, lookTextureBytes } from '../sim-look.js';
import { resolveSceneLighting } from '../sim-lighting.js';
import { bandoLoopJson, bandoLoopGhost, flyBandoLoop } from './build_bando_loop.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = JSON.parse(readFileSync(join(root, 'tracks/bando-loop.json'), 'utf8'));
const track = normalizeTrack(raw);
const ROOM = BANDO_PLAY.room;
const F = BANDO_PLAY.frame;
const T = F.tops;
const BOXES = BANDO_PLAY.boxes;
const m = (v) => v / BANDO_WS;
const GATES = track.gates.map((g) => ({ p: [m(g.x), m(g.y), m(g.z)], r: m(gateRadius(g)), size: m(g.size) }));
const START = [m(raw.start.x), m(raw.start.y), m(raw.start.z)];
const LINE = bandoLine(0.01);
const PTS = LINE.points;
const GAPS = mapGaps('bando').map((g) => ({ name: g.name, axis: g.axis, min: [m(g.min.x), m(g.min.y), m(g.min.z)], max: [m(g.max.x), m(g.max.y), m(g.max.z)] }));
const gapNamed = (re) => GAPS.filter((g) => re.test(g.name));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function boxDist(p, b) {
  const d = [0, 1, 2].map((k) => Math.max(b.min[k] - p[k], 0, p[k] - b.max[k]));
  if (d[0] || d[1] || d[2]) return Math.hypot(d[0], d[1], d[2]);
  return -Math.min(...[0, 1, 2].flatMap((k) => [p[k] - b.min[k], b.max[k] - p[k]]));
}
const nearest = (p) => BOXES.reduce((best, b) => {
  const d = boxDist(p, b);
  return d < best.d ? { d, b } : best;
}, { d: Infinity, b: null });
const inside = (p, lo, hi) => [0, 1, 2].every((k) => p[k] >= lo[k] && p[k] <= hi[k]);
const overlaps = (b, lo, hi) => [0, 1, 2].every((k) => b.min[k] < hi[k] && lo[k] < b.max[k]);
const part = (feature, name) => BOXES.filter((b) => b.feature === feature && (!name || b.part === name));
const gate = (name) => LINE.gates.filter((g) => g.name === name).map((g) => PTS[g.at]);
const gapBox = (g) => [g.min, g.max];

// The designed gaps the line threads (closer than 30 cm allowed there),
// each its authored gap volume: the parapet gap, the van, the window, the
// rebar gap, the two floor holes, the door, the shaft's door; and the shaft
// itself, ground to roof.
const S = BANDO_PLAY.shaft;
const sIn = S.inner / 2;
const ZONES = {
  parapet: gapBox(gapNamed(/^parapet gap$/)[0]),
  van: [[BANDO_PLAY.van.x0, BANDO_PLAY.van.sill, BANDO_PLAY.van.z0], [BANDO_PLAY.van.x1, BANDO_PLAY.van.roof, BANDO_PLAY.van.z1]],
  window: gapBox(gapNamed(/^second floor window, south face, x -8\.25$/)[0]),
  rebar: gapBox(gapNamed(/^second floor rebar gap, 60 cm/)[0]),
  hole2: gapBox(gapNamed(/^floor hole, second floor, east$/)[0]),
  hole1: gapBox(gapNamed(/^floor hole, first floor, east$/)[0]),
  door: gapBox(gapNamed(/^ground door, x 13\.75$/)[0]),
  shaftDoor: gapBox(gapNamed(/^shaft door, ground$/)[0]),
  shaft: [[S.x - sIn, 0, S.z - sIn], [S.x + sIn, T[3], S.z + sIn]],
};
const near = (p, z) => inside(p, z[0].map((v) => v - 0.3), z[1].map((v) => v + 0.3));

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

test('The Bando is registered, a 30 x 20 m frame of three 3.5 m storeys in a 36 x 36 m lot, open, bouncing as the Warehouse; the 75/85 default stays the Warehouse', () => {
  assert.equal(BANDO_WS, WS);
  assert.deepEqual([F.x1 - F.x0, F.z1 - F.z0], [30, 20]);
  assert.deepEqual(T, [0, 3.5, 7, 10.5]);
  assert.deepEqual([ROOM.w, ROOM.d, ROOM.h], [36, 36, 16]);
  assert.deepEqual([LAYOUT.bando.w, LAYOUT.bando.d, LAYOUT.bando.h], [36 * WS, 36 * WS, 16 * WS]);
  assert.ok(MAP_IDS.includes('bando'));
  assert.ok(MAPS.some((q) => q.id === 'bando' && q.name === 'The Bando' && q.indoor && q.class === 'whoop'));
  assert.ok(PUBLIC_MAPS.includes('bando') && mapOpen('bando', false), 'open without ?dev=1');
  assert.ok(BUILTIN_TRACK_FILES.some((t) => t.id === 'bando-loop' && t.map === 'bando' && t.name === 'Bando Loop'));
  assert.equal(track.map, 'bando');
  // Freestyle starts on the loop's pad on the roof, nose toward the first gate.
  const f = freestyleStart('bando'), pad = startPad(track);
  assert.deepEqual([f.x, f.y, f.z], [raw.start.x, raw.start.y, raw.start.z]);
  assert.ok(Math.abs(f.yaw - pad.yaw) < 1e-9);
  assert.ok(Math.abs(START[1] - 0.35) < 1e-9, 'the pad is on the ground floor (the js core settles a quad at rest on the floor only)');
  assert.ok(START[0] > F.x0 && START[0] < F.x1 && START[2] > F.z0 && START[2] < F.z1 && nearest(START).d > 1, 'inside, clear');
  // The menu camera circles over the lot's wall, above the parapet, clear of
  // the frame.
  const o = MAP_ORBIT.bando;
  assert.ok(o.h > (T[3] + BANDO_PLAY.parapet.h + 2) * WS, 'orbit over the roof');
  for (let a = 0; a < 2 * Math.PI; a += 0.05) {
    const p = [m(o.cx + o.r * Math.cos(a)), m(o.h), m(o.cz + o.r * Math.sin(a))];
    assert.ok(nearest(p).d > 2, 'orbit clear at ' + p.map((v) => v.toFixed(1)));
  }
  // Same bounce walls, same crash threshold as the Warehouse (and the Rig).
  assert.deepEqual(BOUNCE_MAPS.bando, BOUNCE_MAPS.depot);
  assert.deepEqual(MAP_LOOKS.bando, vibeFor('bando').looks);
  assert.equal(MAP_LOOKS.bando.fog, 0);
  // The default map per class does not move: the 75 and 85 on the Warehouse.
  assert.deepEqual({ ...CLASS_MAPS }, { 65: 'rig', 75: 'depot', 85: 'depot' });
  assert.deepEqual([65, 75, 85].map(classDefaultMap), ['rig', 'depot', 'depot']);
});

test('every box is buildable: thick enough, inside, grounded, no slot of 10 cm or less', () => {
  const hx = ROOM.w / 2, hz = ROOM.d / 2, H = ROOM.h;
  for (const b of BOXES) {
    const t = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
    assert.ok(Math.min(...t) >= 0.06 - 1e-9, b.part + ' thickness ' + t);
    assert.ok(b.min[0] >= -hx && b.max[0] <= hx && b.min[2] >= -hz && b.max[2] <= hz, b.part + ' outside x/z');
    assert.ok(b.min[1] >= 0 && b.max[1] <= H + 1e-9, b.part + ' outside y');
    assert.ok(b.min[1] === 0 || b.min[1] >= 0.15, b.part + ' floats just off the ground');
    const room = [b.min[0] + hx, hx - b.max[0], b.min[2] + hz, hz - b.max[2], b.min[1], H - b.max[1]];
    for (const g of room) assert.ok(g < 1e-9 || g > 0.10, b.part + ' lot slot ' + g);
  }
  for (let i = 0; i < BOXES.length; i++) {
    for (let j = i + 1; j < BOXES.length; j++) {
      const a = BOXES[i], b = BOXES[j];
      const s = [0, 1, 2].map((k) => Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k]));
      const open = s.filter((v) => v > 1e-9);
      const gap = open.length ? Math.hypot(...open) : 0;
      assert.ok(gap < 1e-9 || gap > 0.10, `${a.feature}:${a.part} | ${b.feature}:${b.part} slot ${gap}`);
    }
  }
});

test("the owner's bando: floor holes stacked, the stair, the shaft, windows, rebar, doors, columns, the leaning slab, the parapet gap, the courtyard", () => {
  // Floor holes, 1 to 2 m and ragged, on every level; stacked offset so one
  // dive takes two in a row (the loop's) or three (the triple drop).
  const holes = BANDO_PLAY.holes;
  for (const k of [1, 2, 3]) assert.ok(holes.filter((h) => h.slab === k).length >= 2, 'holes on slab ' + k);
  for (const h of holes) {
    const [x0, x1, z0, z1] = h.core;
    assert.ok(x1 - x0 >= 1 - 1e-9 && x1 - x0 <= 2 + 1e-9 && z1 - z0 >= 1 - 1e-9 && z1 - z0 <= 2 + 1e-9, h.name + ' 1 to 2 m');
    assert.ok(h.rects.length >= 4, h.name + ' ragged');
    const ext = [0, 2].map((k) => Math.max(...h.rects.map((q) => q[k + 1])) - Math.min(...h.rects.map((q) => q[k])));
    assert.ok(ext.every((e) => e <= 2 + 1e-9), h.name + ' at most 2 m across, ragged edges and all: ' + ext);
    const slab = BOXES.filter((b) => b.feature !== 'parapet' && b.min[1] === T[h.slab] - F.slab && b.max[1] === T[h.slab]);
    assert.ok(slab.length > 0 && !slab.some((b) => h.rects.some((q) => overlaps(b, [q[0], -1, q[2]], [q[1], 99, q[3]]))), h.name + ' open');
  }
  const east = (k) => holes.find((h) => h.slab === k && /east/.test(h.name)).core;
  // Each hole clear straight down to the floor under it: nothing stands
  // under a hole's core between the slab below and it.
  for (const h of holes) {
    const [x0, x1, z0, z1] = h.core;
    const under = BOXES.filter((b) => b.feature !== 'leaning slab' && b.max[1] > T[h.slab - 1] + 0.05 && b.max[1] <= T[h.slab] - F.slab + 1e-9
      && overlaps(b, [x0, -1, z0], [x1, 99, z1]));
    assert.deepEqual(under.map((b) => b.feature + ':' + b.part), [], h.name + ' clear straight down');
  }
  const mid = (c) => (c[0] + c[1]) / 2;
  assert.ok(mid(east(2)) - mid(east(3)) > 2 && mid(east(1)) - mid(east(2)) > 2, 'stacked offset, not over each other');
  for (const l of BANDO_PLAY.lines.filter((q) => q.feature === 'floor holes')) {
    const thru = [1, 2, 3].filter((k) => {
      const y = T[k] - F.slab / 2, [a, b] = l.pts, t = (a[1] - y) / (a[1] - b[1]), p = lerp(a, b, t);
      return holes.some((h) => h.slab === k && inside(p, [h.core[0], -1, h.core[2]], [h.core[1], 99, h.core[3]]));
    });
    assert.deepEqual(thru, [1, 2, 3], l.name + ' drops through a hole in every slab');
  }
  // The open stair: switchback (two flights a storey, a landing), no rails,
  // ground to roof, its slabs open over it.
  const St = BANDO_PLAY.stair, treads = part('stair', 'tread'), landings = part('stair', 'landing');
  assert.equal(landings.length, 3);
  assert.equal(treads.length, 3 * 2 * (St.risers - 1));
  assert.ok(!BOXES.some((b) => /rail/.test(b.part)), 'no rails');
  for (const k of [1, 2, 3]) {
    assert.ok(!BOXES.some((b) => b.feature !== 'stair' && b.min[1] < T[k] && b.max[1] > T[k] - F.slab && overlaps(b, [St.x0, -1, St.z0], [St.x1, 99, St.z1 - St.going])), 'the stair opening in slab ' + k);
  }
  // The lift shaft: 1.6 x 1.6 m inside, ground to roof, a door gap on every floor, open at the top.
  const walls = part('lift shaft');
  assert.deepEqual([S.inner, S.door.w, S.door.h], [1.6, 1.0, 2.1], 'the spec\'s 1.6 x 1.6 m shaft, a door a floor');
  assert.ok(walls.length >= 4, 'its walls');
  const ix0 = S.x - sIn, ix1 = S.x + sIn, iz0 = S.z - sIn, iz1 = S.z + sIn;
  assert.ok(!BOXES.some((b) => overlaps(b, [ix0, 0, iz0], [ix1, T[3] + 5, iz1])), 'the shaft is open inside, top to bottom');
  assert.equal(Math.max(...walls.map((w) => w.max[1])), T[3]);
  assert.ok(Math.abs(Math.min(...walls.map((w) => w.min[0])) - (ix0 - S.wall)) < 1e-9 && Math.abs(Math.max(...walls.map((w) => w.max[2])) - (iz1 + S.wall)) < 1e-9);
  for (const k of [0, 1, 2]) {
    const g = gapNamed(new RegExp('^shaft door, ' + ['ground', 'first floor', 'second floor'][k] + '$'))[0];
    assert.ok(g && Math.abs(g.max[0] - g.min[0] - S.door.w) < 1e-9 && Math.abs(g.min[1] - T[k]) < 1e-9 && Math.abs(g.max[1] - g.min[1] - S.door.h) < 1e-9, 'a door gap on floor ' + k);
  }
  // Empty window frames, 0.9 to 1.2 m, on every facade, every storey.
  const W = BANDO_PLAY.windows;
  for (const face of ['south', 'north', 'east', 'west']) {
    assert.ok(W[face].w >= 0.9 && W[face].w <= 1.2, face);
    for (const k of [0, 1, 2]) assert.ok(gapNamed(new RegExp(`^${['ground', 'first floor', 'second floor'][k]} window, ${face} face`)).length >= 3, `${face} windows on floor ${k}`);
  }
  // Broken block walls, rebar gaps 30 to 60 cm, door openings.
  const rebar = gapNamed(/rebar gap/);
  assert.ok(rebar.length >= 8 && part('rebar', 'bar').length >= 10);
  for (const g of rebar) {
    const w = g.axis === 'x' ? g.max[2] - g.min[2] : g.max[0] - g.min[0];
    assert.ok(w >= 0.3 - 1e-6 && w <= 0.6 + 1e-6, g.name + ' ' + w);
  }
  assert.ok(gapNamed(/ door, [xz] /).length >= 4, 'door openings');
  // Columns on a grid, every storey (the loop's turns round them are held by
  // the line's clearance below).
  const cols = part('columns', 'column');
  assert.ok(BANDO_PLAY.columns.xs.length >= 4 && BANDO_PLAY.columns.zs.length >= 3, 'a grid');
  assert.equal(cols.length, 3 * BANDO_PLAY.columns.xs.length * BANDO_PLAY.columns.zs.length);
  for (const c of cols) assert.ok(Math.abs(c.max[0] - c.min[0] - 0.4) < 1e-9 && c.max[1] - c.min[1] > 3, 'a 40 cm column floor to slab');
  // The collapsed slab at 30 deg, leaning from the ground to the first
  // floor's edge: its steps rise at tan 30; a 3D line flies under it.
  const L = BANDO_PLAY.lean, steps = part('leaning slab', 'step');
  assert.equal(L.angle, 30);
  assert.ok(steps.length >= 20 && steps.every((b) => b.draw === false));
  for (let i = 3; i < steps.length; i++) {
    const rise = steps[i].min[1] - steps[i - 1].min[1], run = steps[i].min[0] - steps[i - 1].min[0];
    assert.ok(Math.abs(rise / run - Math.tan(Math.PI / 6)) < 1e-3, 'steps at 30 deg');
  }
  assert.ok(gate('under the slab').every((p) => p[2] > L.z0 && p[2] < L.z1 && steps.some((b) => p[0] > b.min[0] && p[0] < b.max[0] && b.min[1] > p[1] + 0.5)), 'the loop under the slab');
  // The parapet round the roof, its gap on the courtyard side; the line dives through it.
  const par = part('parapet');
  assert.ok(par.length >= 5 && par.every((b) => b.min[1] === T[3] && b.max[1] === T[3] + BANDO_PLAY.parapet.h));
  const [g0, g1] = BANDO_PLAY.parapet.gap, pg = gate('parapet gap')[0];
  const south = par.filter((b) => b.max[2] === F.z1);
  assert.ok(south.some((b) => b.max[0] === g0) && south.some((b) => b.min[0] === g1) && !south.some((b) => b.min[0] < g1 && b.max[0] > g0), 'parapet either side of the gap, none in it');
  for (const [z0, z1] of [[F.z0, F.z0 + F.wall]]) assert.ok(par.some((b) => b.min[2] === z0 && b.max[2] === z1 && b.min[0] === F.x0 && b.max[0] === F.x1), 'the north parapet whole');
  assert.ok(g1 - g0 >= 1.2 && pg[0] > g0 && pg[0] < g1 && pg[1] > T[3] && pg[1] < T[3] + BANDO_PLAY.parapet.h, 'through the gap');
  // The courtyard: a rusted van, pallets, a dead tree.
  assert.ok(part('van').length >= 8 && part('pallets').length >= 10 && part('dead tree').length >= 5);
  assert.ok(BOXES.filter((b) => b.feature === 'van').every((b) => b.min[2] >= F.z1 && b.mat !== 'concrete'));
  for (const p of BOXES.filter((q) => q.mat === 'pallet')) assert.ok(Math.abs(p.min[1] / BANDO_PLAY.pallet - Math.round(p.min[1] / BANDO_PLAY.pallet)) < 1e-6, 'pallet base ' + p.min[1]);
});

test('every intentional gap has an authored gap volume: open, walled, named once', () => {
  installDomStub();
  const built = buildMap(THREE, 'bando');
  assert.deepEqual(built.gaps, mapGaps('bando'));
  const names = new Set(built.gaps.map((g) => g.name));
  assert.equal(names.size, built.gaps.length, 'names unique');
  for (const g of built.gaps) {
    assert.ok(['x', 'y', 'z'].includes(g.axis), g.name);
    assert.doesNotMatch(g.name, /walls within/);
    let walled = 0;
    for (const c of built.colliders) {
      const ox = Math.min(g.max.x, c.max.x) - Math.max(g.min.x, c.min.x);
      const oy = Math.min(g.max.y, c.max.y) - Math.max(g.min.y, c.min.y);
      const oz = Math.min(g.max.z, c.max.z) - Math.max(g.min.z, c.min.z);
      assert.ok(!(ox > 1e-3 && oy > 1e-3 && oz > 1e-3), g.name + ' overlaps a collider');
      if (ox >= -0.02 && oy >= -0.02 && oz >= -0.02 && Math.min(ox, oy, oz) <= 0.02) walled++;
    }
    assert.ok(walled > 0, g.name + ' walled');
  }
  // One for every kind the owner named.
  const W = BANDO_PLAY.windows, count = (re) => GAPS.filter((g) => re.test(g.name)).length;
  const windows = 3 * (W.south.at.length + W.north.at.length + W.east.at.length + W.west.at.length) - 1;
  assert.equal(count(/ window, /), windows, 'every window frame');
  assert.equal(count(/^courtyard doorway$/), 1);
  assert.equal(count(/^floor hole, /), BANDO_PLAY.holes.length, 'every floor hole');
  assert.equal(count(/^shaft door, /), 3, 'every shaft door');
  assert.equal(count(/^shaft top$/), 1);
  assert.equal(count(/^stair well, /), 3);
  const slots = BANDO_PLAY.walls.reduce((n, w) => n + w.breaks.reduce((k, b) => k + b.bars.length + 1, 0), 0);
  assert.equal(count(/rebar gap, /), slots, 'every rebar gap');
  assert.equal(count(/ door, [xz] /), BANDO_PLAY.walls.reduce((n, w) => n + w.doors.length, 0), 'every door opening');
  assert.equal(count(/^under the leaning slab$/), 1);
  assert.equal(count(/^first floor collapse$/), 1);
  assert.equal(count(/^parapet gap$/), 1);
  assert.equal(count(/van/), 3);
});

test('the loop: roof dive to the ground and back up the shaft, 30 cm clear outside its designed gaps', () => {
  const path = [];
  for (let i = 0; i < 100; i++) path.push(lerp(START, PTS[0], i / 100));
  path.push(...PTS);
  const hit = Object.fromEntries(Object.keys(ZONES).map((k) => [k, 1e9]));
  let outside = 1e9;
  for (const p of path) {
    const c = nearest(p).d;
    assert.ok(c >= 0.085, 'line hits geometry at ' + p.map((v) => v.toFixed(2)));
    const r = Math.min(p[0] + ROOM.w / 2, ROOM.w / 2 - p[0], p[1], ROOM.h - p[1], p[2] + ROOM.d / 2, ROOM.d / 2 - p[2]);
    assert.ok(r >= 0.3, 'line near the lot at ' + p);
    let zoned = false;
    for (const [k, z] of Object.entries(ZONES)) {
      if (inside(p, z[0], z[1])) hit[k] = Math.min(hit[k], c);
      if (near(p, z)) zoned = true;
    }
    if (!zoned) outside = Math.min(outside, c);
  }
  for (const [k, v] of Object.entries(hit)) assert.ok(v < 1e9, k + ' is not on the loop');
  assert.ok(outside >= 0.3, 'clearance outside the designed gaps ' + outside);
  // Roof dive to the ground: from over the roof through the parapet gap down
  // to under 1.5 m in the courtyard, in one run of falling line.
  const pi = PTS.findIndex((p) => p[2] > F.z1 && p[1] > T[3]);
  let k = pi;
  while (k + 1 < PTS.length && PTS[k + 1][1] <= PTS[k][1] + 1e-9) k++;
  assert.ok(PTS[pi][1] > T[3] && PTS[k][1] < 1.5 && PTS[k][2] > F.z1, 'the roof dive, ' + PTS[pi][1].toFixed(2) + ' to ' + PTS[k][1].toFixed(2));
  // And back up through the shaft: in at the ground floor's door, out at the
  // top, vertical in between.
  const inShaft = PTS.filter((p) => inside(p, ZONES.shaft[0], ZONES.shaft[1]));
  assert.ok(Math.min(...inShaft.map((p) => p[1])) < S.door.h && Math.max(...inShaft.map((p) => p[1])) > T[3] - 0.5, 'up the shaft from the ground');
  const climb = inShaft.filter((p) => p[1] > 4 && p[1] < 9);
  assert.ok(climb.length > 100 && climb.every((p) => Math.abs(p[0] - S.x) < 1e-6 && Math.abs(p[2] - S.z) < 1e-6), 'straight up its middle');
  // Down through two floor holes in one dive.
  const h2 = ZONES.hole2, h1 = ZONES.hole1;
  const i2 = PTS.findIndex((p) => inside(p, h2[0], h2[1])), i1 = PTS.findIndex((p) => inside(p, h1[0], h1[1]));
  assert.ok(i2 > 0 && i1 > i2, 'the second floor\'s hole, then the first\'s');
  for (let i = i2; i < i1; i++) assert.ok(PTS[i + 1][1] < PTS[i][1], 'one dive');
  // Every gate named for what it marks.
  const names = new Set(LINE.gates.map((g) => g.name));
  for (const n of ['out of the shaft', 'parapet gap', 'into the courtyard', 'between the pallets', 'through the van', 'round the dead tree',
    'second-floor window', 'between the columns', 'round the column', 'rebar gap', 'through the floors', 'under the slab', 'door', 'shaft door']) assert.ok(names.has(n), n);
  assert.equal(LINE.gates[0].name, 'shaft door', 'each lap from the shaft\'s door');
});

test('the Bando Loop: 18 to 24 gates, 120 to 160 m, tightest radius 2.5 m', () => {
  assert.ok(GATES.length >= 18 && GATES.length <= 24, GATES.length + ' gates');
  assert.ok(LINE.closes < 1e-3, 'the line closes ' + LINE.closes);
  let flown = 0;
  for (let i = 1; i < PTS.length; i++) flown += len(sub(PTS[i], PTS[i - 1]));
  assert.ok(flown >= 120 && flown <= 160, 'line ' + flown.toFixed(1) + ' m');
  const chord = lapLengthMetres(track.gates);
  assert.ok(chord >= 120 && chord <= 160, 'gate to gate ' + chord.toFixed(1) + ' m');
  let minR = Infinity;
  for (let i = 5; i < PTS.length - 5; i++) {
    const a = PTS[i - 5], b = PTS[i], c = PTS[i + 5];
    const A = len(sub(b, c)), B = len(sub(a, c)), C = len(sub(a, b));
    const u = sub(b, a), v = sub(c, a);
    const cr2 = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    if (cr2 > 1e-12) minR = Math.min(minR, (A * B * C) / (2 * cr2));
  }
  assert.ok(minR >= 2.5 - 1e-6, 'tightest radius ' + minR.toFixed(3) + ' m');
});

test('the gates mark the line: written from it, entered in order, once each, from the pad', () => {
  assert.equal(readFileSync(join(root, 'tracks/bando-loop.json'), 'utf8').replace(/\r\n/g, '\n'), bandoLoopJson(),
    'tracks/bando-loop.json is node tools/build_bando_loop.mjs');
  LINE.gates.forEach((g, i) => {
    assert.ok(len(sub(GATES[i].p, PTS[g.at])) < 1e-3, g.name + ' on the line');
    assert.ok(GATES[i].size >= 0.28 - 1e-9, g.name + ' ring visible');
  });
  const path = [];
  for (let i = 0; i < 200; i++) path.push(lerp(START, PTS[0], i / 200));
  path.push(...PTS, ...PTS);
  const inSph = GATES.map(() => false);
  let next = 0, passes = 0;
  for (const p of path) {
    GATES.forEach((g, i) => {
      const now = len(sub(p, g.p)) < g.r;
      if (now && !inSph[i]) {
        assert.equal(i, next, `entered gate ${i} expecting ${next}`);
        next = (next + 1) % GATES.length;
        passes++;
      }
      inSph[i] = now;
    });
  }
  assert.equal(passes, 2 * GATES.length);
  const last = GATES[GATES.length - 1];
  assert.ok(len(sub(START, last.p)) > last.r + 1, 'pad clear of the last gate');
});

test('the hosted pace ghost flies the line, from the first gate, clear of the Bando', () => {
  const g = JSON.parse(readFileSync(join(root, 'ghosts/bando-loop.json'), 'utf8'));
  assert.deepEqual(g, bandoLoopGhost(), 'ghosts/bando-loop.json is node tools/build_bando_loop.mjs');
  assert.equal(g.track, 'bando-loop');
  assert.ok(g.lapTime < 600000, 'under the ghost limit');
  assert.ok(len(sub(g.samples[0].slice(1, 4).map(m), GATES[0].p)) < 0.01, 'starts at the first gate');
  for (const s of g.samples) assert.ok(nearest(s.slice(1, 4).map(m)).d >= 0.085, 'ghost clips at ' + s.slice(1, 4));
});

test('the off-loop lines: each a pass an 85 flies clear (15 cm), the drops through every slab', () => {
  const walk = (l, fn) => {
    for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1], c = l.pts[i], n = Math.ceil(len(sub(c, a)) / 0.02);
      for (let j = 0; j <= n; j++) fn(lerp(a, c, j / n));
    }
  };
  for (const l of BANDO_PLAY.lines) {
    let c = Infinity;
    walk(l, (p) => {
      c = Math.min(c, nearest(p).d);
      assert.ok(Math.min(p[0] + ROOM.w / 2, ROOM.w / 2 - p[0], p[1], ROOM.h - p[1], p[2] + ROOM.d / 2, ROOM.d / 2 - p[2]) >= 0.3, l.name + ' near the lot');
    });
    assert.ok(c >= 0.15, l.name + ' clear by ' + c.toFixed(3) + ' m');
  }
  const names = BANDO_PLAY.lines.map((l) => l.name);
  for (const n of ['the triple drop', 'down the stairwell', 'through the van sideways', 'down the shaft']) assert.ok(names.includes(n), n);
});

test('the autopilot flies the loop on the bf core (the Air65): three laps, every gate in order, no touch', async () => {
  const f = await flyBandoLoop({ laps: 3 });
  assert.equal(f.stalled, false, 'stalled');
  assert.deepEqual(f.contacts.map((c) => c.tUs), [], 'touched the Bando');
  assert.deepEqual(f.misses, [], 'missed a gate');
  assert.equal(f.laps.length, 3, 'laps ' + f.laps.map((t) => t.toFixed(2)).join(', '));
  assert.equal(f.passes.length, 3 * GATES.length + 1);
});

test('the look, inherited: an overcast fill, one pale sun in at the windows and the holes, look surfaces, graffiti shaded', () => {
  const v = vibeFor('bando'), L = v.lighting, Sf = BANDO_LOOK.surfaces;
  assert.equal(v.look, true);
  assert.equal(v.lookHdri, 'overcast');
  assert.equal(L.fillIntensity, 0);
  assert.equal(L.hemiIntensity, 0);
  assert.equal(L.exposure, LOOK.lighting.exposure);
  assert.equal(L.fogDensity, 0);
  assert.equal(L.shadowIntensity, BANDO_SHADOW_INTENSITY);
  assert.ok(BANDO_SHADOW_INTENSITY < 1 && BANDO_SHADOW_INTENSITY > 0.5, 'soft shadows under an overcast');
  assert.equal(v.looks.env, LOOK.lighting.env, 'the HDRI fill');
  assert.deepEqual([L.sunElevation, L.sunAzimuth, L.sunColor, L.sunIntensity], [BANDO_KEY.elevation, BANDO_KEY.azimuth, BANDO_KEY.color, BANDO_KEY.intensity]);
  assert.deepEqual([L.shadowViewR, L.shadowHeight], [BANDO_SHADOW.viewR, BANDO_SHADOW.height]);
  assert.ok(BANDO_SHADOW.height > (T[3] + BANDO_PLAY.parapet.h) * WS, 'the parapet casts');
  assert.ok(BANDO_SHADOW.viewR >= Math.hypot(ROOM.w, ROOM.d) / 2 * WS, 'the box reaches the lot');
  // The fill is the overcast sky: the scene resolver takes it, not the rooms' HDRI.
  const r = resolveSceneLighting({ mapId: 'bando', look: true, lookHdri: resolveMapLighting('bando').lookHdri, envs: { look: 'room', overcast: 'grey' }, looks: v.looks });
  assert.equal(r.want, 'overcast');
  assert.equal(r.environment, 'grey');
  assert.equal(resolveMapLighting('depot').lookHdri, 'room');
  // Sun shafts in at the courtyard face's windows and down the roof's holes,
  // along the key, falling clear (bandoShafts traces them against every box).
  const sh = bandoShafts();
  assert.ok(sh.filter((q) => q.from === 'window').length >= 10 && sh.some((q) => q.from === 'roof hole'), sh.length + ' shafts');
  const e = L.sunElevation * Math.PI / 180, a = L.sunAzimuth * Math.PI / 180;
  const toSun = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
  for (const q of sh) assert.deepEqual(q.dir.map((u) => +u.toFixed(9)), toSun.map((u) => +(-u).toFixed(9)), 'along the key');
  // Every surface a look surface, the look's sets, no new texture set.
  for (const [k, f] of Object.entries(Sf)) {
    assert.ok(LOOK.surfaces[f.look], k);
    assert.equal(f.roughness, LOOK.surfaces[f.look].roughness, k);
    assert.equal(f.metalness, LOOK.surfaces[f.look].metalness, k);
  }
  const sets = [...new Set(Object.values(Sf).map((f) => LOOK.surfaces[f.look].set))].sort();
  assert.deepEqual(sets, ['concrete_floor', 'painted_steel', 'plywood']);
  assert.deepEqual(Object.keys(LOOK.sets).sort(), ['concrete_floor', 'fabric', 'galvanised', 'painted_steel', 'plywood', 'rubber_mat'], 'no new texture set');
  // Textures: the Bando's sets with its overcast fill, and every look set and
  // both fills together, under the 24 MB budget.
  assert.ok(lookTextureBytes(sets, ['overcast']).total < 24e6, 'the Bando ' + (lookTextureBytes(sets, ['overcast']).total / 1e6).toFixed(2) + ' MB');
  assert.ok(lookTextureBytes().total < 24e6, 'every look set ' + (lookTextureBytes().total / 1e6).toFixed(2) + ' MB');
  // The graffiti: original shapes drawn in the shader (no texture), hues
  // clear of the gates' brand orange and green.
  const hue = (hex) => {
    const rr = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
    const mx = Math.max(rr, g, b), d = mx - Math.min(rr, g, b);
    let h = 0;
    if (d) h = mx === rr ? ((g - b) / d) % 6 : mx === g ? (b - rr) / d + 2 : (rr - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const gap = (x, y) => { const d = Math.abs(x - y) % 360; return Math.min(d, 360 - d); };
  assert.ok(BANDO_LOOK.graffiti.length >= 10);
  for (const d of BANDO_LOOK.graffiti) {
    assert.ok([0, 1, 2].includes(d.style), 'a shape style');
    for (const c of [d.a, d.b]) assert.ok(gap(hue(c), hue(0xff4d1a)) >= 15 && gap(hue(c), hue(0x3ddc97)) >= 10, 'clear of the gate rings: ' + c.toString(16));
  }
  // Built: every drawn box on its surface's material; panels drawn whole; the
  // graffiti one mesh with no texture; the edges at 60%, bloomed; every box a collider.
  installDomStub();
  const built = buildMap(THREE, 'bando');
  const vis = built.group.getObjectByName('bandoArtVisuals');
  const paint = vis.getObjectByName('bandoGraffiti');
  assert.ok(paint && !paint.material.map && paint.userData.artKeep && paint.castShadow === false);
  assert.equal(paint.geometry.getAttribute('position').count, 4 * BANDO_LOOK.graffiti.length);
  assert.equal(vis.getObjectByName('bandoEdges').material.userData.lookBloom, true);
  for (const o of vis.children.filter((q) => q.isMesh && q.name.startsWith('bando_'))) {
    const key = o.name.slice(6);
    if (key === 'lot_wall' || key === 'leaning_slab') continue;
    assert.equal(o.material.name, 'bando ' + Sf[key].type, o.name);
  }
  // After the boxes: the lot's wall, the town's blocks and the flying's
  // bounds (walls and a ceiling inside the sky), so nothing seen is passed
  // through and nobody flies out of the world.
  const rest = built.colliders.slice(BOXES.length).map((c) => ({ min: c.min.toArray().map(m), max: c.max.toArray().map(m) }));
  assert.ok(rest.length >= 4 + 30 + 5, rest.length + ' colliders past the boxes');
  const far = Math.max(...rest.map((c) => Math.max(-c.min[0], c.max[0], -c.min[2], c.max[2])));
  assert.ok(far > 80 && far < 91, 'bounds inside the sky dome, ' + far.toFixed(1) + ' m');
  assert.ok(rest.some((c) => c.min[1] > 60 && c.max[0] - c.min[0] > 150), 'a ceiling');
  const near = (u, v) => [0, 1, 2].every((k) => Math.abs(u[k] - v[k]) < 1e-6);
  for (const q of bandoTown(1)) assert.ok(rest.some((c) => near(c.min, [q.x0, 0, q.z0]) && near(c.max, [q.x1, q.h, q.z1])), 'a town block, solid');
  BOXES.forEach((b, i) => {
    assert.deepEqual(built.colliders[i].min.toArray().map((u) => +m(u).toFixed(4) + 0), b.min, b.feature + ' / ' + b.part + ' collider');
    assert.deepEqual(built.colliders[i].max.toArray().map((u) => +m(u).toFixed(4) + 0), b.max, b.feature + ' / ' + b.part + ' collider');
  });
});

test('the draw-call merge keeps every texture; the Bando draws in 14 objects or fewer', () => {
  installDomStub();
  const built = buildMap(THREE, 'bando');
  const g = new THREE.Group();
  g.add(built.group);
  assert.ok(mergeStaticArt(THREE, g) > 0, 'something merged');
  let objects = 0;
  g.traverse((o) => {
    if (!o.isMesh && !o.isLineSegments) return;
    objects += 1;
    if (!o.isMesh || !o.material.map) return;
    assert.ok(o.geometry.getAttribute('uv'), (o.material.name || o.name) + ' lost its uvs');
    if (o.material.aoMap) assert.ok(o.geometry.getAttribute('uv1'), o.material.name + ' lost its AO uvs');
  });
  assert.ok(objects <= 14, objects + ' draw objects');
});
