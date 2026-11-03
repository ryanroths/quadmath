// The Warehouse: the owner's spec checked on the shipped data (sim-maps.js
// DEPOT_PLAY, depotLine, DEPOT_LOOK + tracks/depot-loop.json), in metres, and
// the loop flown on the bf core.
// node --test tools/test_sim_depot.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import {
  DEPOT_PLAY, DEPOT_WS, DEPOT_LOOK, DEPOT_KEY, DEPOT_SHADOW, depotLine, depotShafts, LAYOUT, MAP_ORBIT, MAP_LOOKS, MAP_IDS, buildMap,
} from '../sim-maps.js';
import { WS } from '../sim-core-adapter.js';
import {
  normalizeTrack, gateRadius, lapLengthMetres, BUILTIN_TRACK_FILES, MAPS, PUBLIC_MAPS, mapOpen, freestyleStart, startPad,
  CLASS_MAPS, classDefaultMap,
} from '../sim-tracks.js';
import { BOUNCE_MAPS } from '../sim-whoop.js';
import { vibeFor, mergeStaticArt } from '../sim-art.js';
import { LOOK, lookTextureBytes } from '../sim-look.js';
import { depotLoopJson, depotLoopGhost, flyDepotLoop } from './build_depot_loop.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = JSON.parse(readFileSync(join(root, 'tracks/depot-loop.json'), 'utf8'));
const track = normalizeTrack(raw);
const ROOM = DEPOT_PLAY.room;
const BOXES = DEPOT_PLAY.boxes;
const m = (v) => v / DEPOT_WS;
const GATES = track.gates.map((g) => ({ p: [m(g.x), m(g.y), m(g.z)], r: m(gateRadius(g)), size: m(g.size) }));
const START = [m(raw.start.x), m(raw.start.y), m(raw.start.z)];
const LINE = depotLine(0.01);
const PTS = LINE.points;

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
const part = (feature, name) => BOXES.filter((b) => b.feature === feature && (!name || b.part === name));
const overlaps = (b, lo, hi) => [0, 1, 2].every((k) => b.min[k] < hi[k] && lo[k] < b.max[k]);
const gate = (name) => LINE.gates.filter((g) => g.name === name).map((g) => PTS[g.at]);

// The designed gaps the line threads (closer than 30 cm allowed there): the
// rack's 60 cm gap, the trusses' gaps, the hatch.
const T = DEPOT_PLAY.trusses, K = DEPOT_PLAY.rack, M = DEPOT_PLAY.mezzanine;
const gapX = K.x0 + K.bay * K.gapBay + K.post;
const ZONES = {
  rack: [[gapX, 1.08, K.frames[1][0]], [gapX + K.bay - K.post, 1.68, K.frames[2][1]]],
  truss1: [[-12.56, T.y0 + T.chord, T.gapZ - 0.3], [-12.44, T.y1 - T.chord, T.gapZ + 0.3]],
  truss2: [[-5.06, T.y0 + T.chord, T.gapZ - 0.3], [-4.94, T.y1 - T.chord, T.gapZ + 0.3]],
  hatch: [[M.hatch.x0, M.y - 0.55, M.hatch.z0], [M.hatch.x1, M.y, M.hatch.z1]],
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

// Hue (degrees) and saturation of a 0xRRGGBB colour, as written (sRGB).
function hueSat(hex) {
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0 };
}
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

test('The Warehouse is registered, 45 × 30 × 9 m, open beside the Rig and the House, bouncing as the Rig', () => {
  assert.equal(DEPOT_WS, WS);
  assert.deepEqual([ROOM.w, ROOM.d, ROOM.h], [45, 30, 9]);
  assert.deepEqual([LAYOUT.depot.w, LAYOUT.depot.d, LAYOUT.depot.h], [45 * WS, 30 * WS, 9 * WS]);
  assert.ok(MAP_IDS.includes('depot') && MAP_IDS.includes('warehouse'), 'its own id; the archived map keeps warehouse');
  assert.ok(MAPS.some((q) => q.id === 'depot' && q.name === 'The Warehouse' && q.indoor && q.class === 'whoop'));
  assert.ok(PUBLIC_MAPS.includes('depot') && mapOpen('depot', false), 'open without ?dev=1');
  assert.ok(BUILTIN_TRACK_FILES.some((t) => t.id === 'depot-loop' && t.map === 'depot' && t.name === 'Warehouse Loop'));
  assert.equal(track.map, 'depot');
  // Freestyle starts on the loop's pad, nose down the centre run.
  const f = freestyleStart('depot'), pad = startPad(track);
  assert.deepEqual([f.x, f.y, f.z], [raw.start.x, raw.start.y, raw.start.z]);
  assert.ok(Math.abs(f.yaw - pad.yaw) < 1e-9);
  // The menu camera circles inside the hall, under the trusses, clear of the
  // racking and the pole.
  const o = MAP_ORBIT.depot;
  assert.ok(o.h < T.y0 * WS && Math.hypot(Math.abs(o.cx) + o.r, 0) < LAYOUT.depot.w / 2 && Math.abs(o.cz) + o.r < LAYOUT.depot.d / 2, 'orbit inside');
  for (let a = 0; a < 2 * Math.PI; a += 0.05) {
    const p = [m(o.cx + o.r * Math.cos(a)), m(o.h), m(o.cz + o.r * Math.sin(a))];
    assert.ok(nearest(p).d > 0.5, 'orbit clear at ' + p.map((v) => v.toFixed(1)));
  }
  // Same bounce walls, same crash threshold as the Rig.
  assert.deepEqual(BOUNCE_MAPS.depot, BOUNCE_MAPS.rig);
  assert.deepEqual(MAP_LOOKS.depot, vibeFor('depot').looks);
  assert.equal(MAP_LOOKS.depot.fog, 0);
  assert.equal(MAP_LOOKS.depot.hemi, 0);
  // The default map per class: the 65 on the Rig, the 75 and 85 here.
  assert.deepEqual({ ...CLASS_MAPS }, { 65: 'rig', 75: 'depot', 85: 'depot' });
  assert.deepEqual([65, 75, 85].map(classDefaultMap), ['rig', 'depot', 'depot']);
});

test('every box is buildable: thick enough, inside, grounded, no 4–10 cm slot', () => {
  const hx = ROOM.w / 2, hz = ROOM.d / 2, H = ROOM.h;
  for (const b of BOXES) {
    const t = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
    assert.ok(Math.min(...t) >= 0.06 - 1e-9, b.part + ' thickness ' + t);
    assert.ok(b.min[0] >= -hx && b.max[0] <= hx && b.min[2] >= -hz && b.max[2] <= hz, b.part + ' outside x/z');
    assert.ok(b.min[1] >= 0 && b.max[1] <= H + 1e-9, b.part + ' outside y');
    assert.ok(b.min[1] === 0 || b.min[1] >= 0.15, b.part + ' floats just off the floor');
    const room = [b.min[0] + hx, hx - b.max[0], b.min[2] + hz, hz - b.max[2], b.min[1], H - b.max[1]];
    for (const g of room) assert.ok(g < 1e-9 || g > 0.10, b.part + ' room slot ' + g);
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

test("the owner's warehouse: racking, mezzanine, forklift, pallets, dock, doors, centre run, trusses, spin pole", () => {
  // Pallet racking: three levels on each frame (the floor, beams at 1.8 and
  // 3.6 m), every load 40–60 cm under the beam or tie over it; aisles 4 m.
  const beams = part('racking', 'beam'), ties = part('racking', 'tie');
  assert.deepEqual([...new Set(beams.map((b) => b.max[1]))].sort(), [1.8, 3.6]);
  const levelTops = [0, 1.8, 3.6];
  const cartons = part('cartons', 'carton').filter((c) => c.zone === 'racking');
  assert.ok(cartons.length > 100, cartons.length + ' loads in the racking');
  const over = (c) => beams.concat(ties).filter((b) => b.min[0] < c.max[0] && c.min[0] < b.max[0] && b.min[2] < c.max[2] && c.min[2] < b.max[2] && b.min[1] >= c.max[1]);
  const gaps = new Set();
  for (const c of cartons) {
    const above = Math.min(...over(c).map((b) => b.min[1]));
    const g = +(above - c.max[1]).toFixed(3);
    assert.ok(g >= 0.4 - 1e-9 && g <= 0.6 + 1e-9, 'gap over a load ' + g);
    gaps.add(levelTops.find((y) => Math.abs(c.min[1] - 0.15 - y) < 1e-6));
  }
  assert.deepEqual([...gaps].sort(), levelTops, 'loads on all three levels');
  const [a, b1, b2] = K.frames;
  assert.ok(b1[0] - a[1] >= 4 - 1e-9 && b2[1] < 0, 'the aisle between the runs');
  // The mezzanine: its deck at 3.6 m, a stair from the floor up to it, the
  // hatch open through it.
  const deck = part('mezzanine', 'deck');
  assert.ok(deck.every((d) => d.max[1] === M.y));
  assert.ok(!deck.some((d) => overlaps(d, [M.hatch.x0, 0, M.hatch.z0], [M.hatch.x1, 9, M.hatch.z1])), 'the hatch is open');
  const treads = part('stair', 'tread').sort((p, q) => p.max[1] - q.max[1]);
  assert.ok(treads.length >= 12 && treads[0].max[1] <= 0.25 && treads[treads.length - 1].max[1] === M.y, 'the stair, floor to deck');
  // The forklift, its load raised over the line; the stacked pallets.
  const fork = part('forklift', 'fork');
  assert.equal(fork.length, 2);
  const forks = gate('under the forks')[0];
  assert.ok(fork.every((f) => f.min[1] > forks[1] + 0.5), 'the forks raised over the line');
  const fx0 = Math.min(...fork.map((f) => f.min[0])), fx1 = Math.max(...fork.map((f) => f.max[0]));
  assert.ok(forks[0] > fx0 && forks[0] < fx1 && fork.every((f) => forks[2] > f.min[2] && forks[2] < f.max[2]), 'the gate under the forks');
  assert.ok(BOXES.some((b) => b.zone === 'forklift' && b.feature === 'pallets' && b.min[1] > 2), 'a load on the forks');
  const stacks = new Set(part('pallet stacks').map((b) => b.min[0] + ',' + b.min[2]));
  assert.ok(stacks.size >= 3, stacks.size + ' stacks');
  const ps = gate('pallet stacks')[0];
  const flank = part('pallet stacks').filter((b) => ps[2] > b.min[2] && ps[2] < b.max[2] && ps[1] < b.max[1]);
  assert.ok(flank.some((b) => b.max[0] < ps[0]) && flank.some((b) => b.min[0] > ps[0]), 'the line between the stacks');
  // Every pallet sits on a multiple of the pallet's height (the shader's boards).
  for (const p of BOXES.filter((q) => q.mat === 'pallet')) assert.ok(Math.abs(p.min[1] / DEPOT_PLAY.pallet - Math.round(p.min[1] / DEPOT_PLAY.pallet)) < 1e-6, 'pallet base ' + p.min[1]);
  // The loading dock: the chain curtain, 30 cm strands, parted where the line
  // goes through; two roll-up doors half open (rolled down to half their
  // opening), the line under each.
  const D = DEPOT_PLAY.dock, chains = part('chain curtain', 'chain').sort((p, q) => p.min[0] - q.min[0]);
  assert.ok(chains.length >= 20 && chains.every((c) => c.min[0] > D.x + D.t), 'the curtain is in the dock');
  const curtain = gate('chain curtain')[0];
  const parting = chains.reduce((g, c, i) => (i && c.min[0] > curtain[0] && chains[i - 1].max[0] < curtain[0] ? c.min[0] - chains[i - 1].max[0] : g), 0);
  assert.ok(parting >= 1.2, 'parted ' + parting);
  assert.ok(chains.every((c) => curtain[2] > c.min[2] && curtain[2] < c.max[2] && curtain[1] > c.min[1] && curtain[1] < c.max[1]), 'the line goes through the curtain');
  const curtains = part('roll-up doors', 'curtain');
  assert.equal(curtains.length, 2);
  for (const c of curtains) assert.ok(Math.abs(c.min[1] - D.doorH / 2) < 1e-9 && c.max[1] === D.doorH, 'half open');
  for (const g of gate('roll-up door')) assert.ok(curtains.some((c) => g[2] > c.min[2] && g[2] < c.max[2] && g[1] < c.min[1] - 0.5), 'under a door');
  // The centre run: 25 m straight and level down the middle, nothing on it
  // from the floor to the trusses.
  const R = DEPOT_PLAY.run;
  assert.ok(R.x1 - R.x0 >= 25 && Math.abs(R.z) < 2, 'the centre run');
  const onRun = PTS.filter((p) => p[0] >= R.x0 && p[0] <= R.x1 && Math.abs(p[2] - R.z) < 1e-6);
  assert.ok(Math.max(...onRun.map((p) => p[0])) - Math.min(...onRun.map((p) => p[0])) >= 25, 'the line runs it straight');
  assert.deepEqual(BOXES.filter((b) => overlaps(b, [R.x0, 0, R.z - R.w], [R.x1, T.y0, R.z + R.w])).map((b) => b.feature + ':' + b.part), [], 'clear');
  // The trusses: their open web's gaps 60 cm; the line through two of them.
  for (const x of T.xs) {
    const posts = BOXES.filter((b) => b.part === 'post' && Math.abs((b.min[0] + b.max[0]) / 2 - x) < 1e-6).sort((p, q) => p.min[2] - q.min[2]);
    for (let i = 1; i < posts.length; i++) assert.ok(Math.abs(posts[i].min[2] - posts[i - 1].max[2] - 0.6) < 1e-6, 'a 60 cm gap');
  }
  assert.equal(gate('truss').length, 2);
  // The spin pole: 10 cm, floor to roof, 1.5 m clear all round (as the Rig's).
  const pole = part('pole');
  assert.equal(pole.length, 1);
  const P = pole[0];
  assert.deepEqual([+(P.max[0] - P.min[0]).toFixed(4), +(P.max[2] - P.min[2]).toFixed(4), P.min[1], P.max[1]], [0.1, 0.1, 0, ROOM.h]);
  const pc = [(P.min[0] + P.max[0]) / 2, (P.min[2] + P.max[2]) / 2];
  for (const b of BOXES) {
    if (b === P) continue;
    const d = Math.hypot(Math.max(b.min[0] - pc[0], 0, pc[0] - b.max[0]), Math.max(b.min[2] - pc[1], 0, pc[1] - b.max[2]));
    assert.ok(d >= 1.5, 'pole clear of ' + b.feature + ' ' + d.toFixed(2));
  }
});

test('the loop: every feature on the line, flow-first, 30 cm clear outside its designed gaps', () => {
  const path = [];
  for (let i = 0; i < 100; i++) path.push(lerp(START, PTS[0], i / 100));
  path.push(...PTS);
  const hit = Object.fromEntries(Object.keys(ZONES).map((k) => [k, 1e9]));
  let outside = 1e9;
  for (const p of path) {
    const c = nearest(p).d;
    assert.ok(c >= 0.085, 'line hits geometry at ' + p.map((v) => v.toFixed(2)));
    const r = Math.min(p[0] + ROOM.w / 2, ROOM.w / 2 - p[0], p[1], ROOM.h - p[1], p[2] + ROOM.d / 2, ROOM.d / 2 - p[2]);
    assert.ok(r >= 0.3, 'line near the shell at ' + p);
    let zoned = false;
    for (const [k, z] of Object.entries(ZONES)) {
      if (inside(p, z[0], z[1])) hit[k] = Math.min(hit[k], c);
      if (near(p, z)) zoned = true;
    }
    if (!zoned) outside = Math.min(outside, c);
  }
  for (const [k, v] of Object.entries(hit)) assert.ok(v < 1e9, k + ' is not on the loop');
  assert.ok(outside >= 0.3, 'clearance outside the designed gaps ' + outside);
  // Every feature the owner named, a gate on it.
  const names = new Set(LINE.gates.map((g) => g.name));
  for (const n of ['centre run', 'roll-up door', 'chain curtain', 'under the forks', 'rack gap', 'down the aisle', 'pallet stacks', 'up the stair',
    'over the mezzanine', 'truss', 'round the pole', 'the hatch', 'under the mezzanine']) assert.ok(names.has(n), n);
  // Up the stair: over its treads, climbing; down through the hatch: over the
  // deck, then under it.
  const S = M.stair;
  const onStair = PTS.filter((p) => p[0] > S.x0 && p[0] < S.x1 && p[2] > S.z0 && p[2] < S.z1);
  assert.ok(onStair.length && onStair.every((p) => p[1] > (p[2] - S.z0) / (S.z1 - S.z0) * M.y + 0.6), 'up the stair');
  const h = M.hatch, inHatch = PTS.filter((p) => p[0] > h.x0 && p[0] < h.x1 && p[2] > h.z0 && p[2] < h.z1);
  assert.ok(Math.max(...inHatch.map((p) => p[1])) > M.y + 0.3 && Math.min(...inHatch.map((p) => p[1])) < M.y - 0.5, 'down through the hatch');
  // Round the pole: a half turn about it, no closer than 2.5 m.
  const pole = DEPOT_PLAY.pole;
  const round = PTS.filter((p) => Math.hypot(p[0] - pole.x, p[2] - pole.z) < 3);
  assert.ok(Math.min(...round.map((p) => Math.hypot(p[0] - pole.x, p[2] - pole.z))) >= 2.5 - 1e-6, 'round the pole at 2.5 m or more');
  const ang = round.map((p) => Math.atan2(p[2] - pole.z, p[0] - pole.x));
  let turn = 0;
  for (let i = 1; i < ang.length; i++) { let d = ang[i] - ang[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; }
  assert.ok(Math.abs(turn) >= Math.PI - 0.05, 'half round the pole ' + turn.toFixed(2));
  // Through the rack: in at one face of run B, out at the other.
  const rack = PTS.filter((p) => p[0] > gapX && p[0] < gapX + K.bay && p[2] > K.frames[1][0] && p[2] < K.frames[2][1]);
  assert.ok(rack.length && rack.every((p) => p[1] > 1.08 && p[1] < 1.68), 'through the 60 cm gap');
});

test('the Warehouse Loop: 18–22 gates, 120–160 m, tightest radius 2.5 m', () => {
  assert.ok(GATES.length >= 18 && GATES.length <= 22, GATES.length + ' gates');
  assert.ok(LINE.closes < 1e-3, 'the line closes ' + LINE.closes);
  let flown = 0;
  for (let i = 1; i < PTS.length; i++) flown += len(sub(PTS[i], PTS[i - 1]));
  assert.ok(flown >= 120 && flown <= 160, 'line ' + flown.toFixed(1) + ' m');
  const chord = lapLengthMetres(track.gates);
  assert.ok(chord >= 120 && chord <= 160, 'gate to gate ' + chord.toFixed(1) + ' m');
  let minR = Infinity, maxSlope = 0;
  for (let i = 5; i < PTS.length - 5; i++) {
    const a = PTS[i - 5], b = PTS[i], c = PTS[i + 5];
    const A = len(sub(b, c)), B = len(sub(a, c)), C = len(sub(a, b));
    const u = sub(b, a), v = sub(c, a);
    const cr2 = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    if (cr2 > 1e-12) minR = Math.min(minR, (A * B * C) / (2 * cr2));
    maxSlope = Math.max(maxSlope, Math.abs(Math.atan2(c[1] - b[1], Math.hypot(c[0] - b[0], c[2] - b[2]))) * 180 / Math.PI);
  }
  assert.ok(minR >= 2.5, 'tightest radius ' + minR.toFixed(2) + ' m');
  assert.ok(maxSlope <= 35, 'steepest climb or dive ' + maxSlope.toFixed(1) + ' deg');
});

test('the gates mark the line: written from it, entered in order, once each, from the pad', () => {
  assert.equal(readFileSync(join(root, 'tracks/depot-loop.json'), 'utf8').replace(/\r\n/g, '\n'), depotLoopJson(),
    'tracks/depot-loop.json is node tools/build_depot_loop.mjs');
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

test('the hosted pace ghost flies the line, from the first gate, clear of the Warehouse', () => {
  const g = JSON.parse(readFileSync(join(root, 'ghosts/depot-loop.json'), 'utf8'));
  assert.deepEqual(g, depotLoopGhost(), 'ghosts/depot-loop.json is node tools/build_depot_loop.mjs');
  assert.equal(g.track, 'depot-loop');
  assert.ok(g.lapTime < 600000, 'under the ghost limit');
  assert.ok(len(sub(g.samples[0].slice(1, 4).map(m), GATES[0].p)) < 0.01, 'starts at the first gate');
  for (const s of g.samples) assert.ok(nearest(s.slice(1, 4).map(m)).d >= 0.085, 'ghost clips at ' + s.slice(1, 4));
});

test('the autopilot flies the loop on the bf core: three laps, every gate in order, no touch', async () => {
  const f = await flyDepotLoop({ laps: 3 });
  assert.equal(f.stalled, false, 'stalled');
  assert.deepEqual(f.contacts.map((c) => c.tUs), [], 'touched the Warehouse');
  assert.deepEqual(f.misses, [], 'missed a gate');
  assert.equal(f.laps.length, 3, 'laps ' + f.laps.map((t) => t.toFixed(2)).join(', '));
  assert.equal(f.passes.length, 3 * GATES.length + 1);
});

test('the look, inherited: one key through the clerestories, the HDRI fill, look surfaces, zone hues as tints', () => {
  const v = vibeFor('depot'), L = v.lighting, S = DEPOT_LOOK.surfaces;
  assert.equal(v.look, true);
  assert.equal(L.fillIntensity, 0);
  assert.equal(L.hemiIntensity, 0);
  assert.equal(L.exposure, LOOK.lighting.exposure);
  assert.equal(L.fogDensity, 0);
  assert.equal(v.looks.env, LOOK.lighting.env, 'the HDRI fill');
  assert.equal(v.looks.sun, L.sunIntensity, 'looks.sun is the same key');
  assert.deepEqual([L.sunElevation, L.sunAzimuth, L.sunColor, L.sunIntensity], [DEPOT_KEY.elevation, DEPOT_KEY.azimuth, DEPOT_KEY.color, DEPOT_KEY.intensity]);
  assert.deepEqual([L.shadowViewR, L.shadowHeight], [DEPOT_SHADOW.viewR, DEPOT_SHADOW.height]);
  // The shadow box reaches over the roof, and across the hall.
  assert.ok(DEPOT_SHADOW.height > ROOM.h * WS, 'the roof casts');
  assert.ok(DEPOT_SHADOW.viewR >= Math.hypot(ROOM.w, ROOM.d) / 2 * WS, 'the box reaches the hall');
  const warm = hueSat(L.sunColor);
  assert.ok(warm.h > 20 && warm.h < 50 && warm.s > 0.2, 'warm');
  // It comes in through the clerestories only: onto the centre run, and never
  // through a wall or the roof.
  const e = L.sunElevation * Math.PI / 180, a = L.sunAzimuth * Math.PI / 180;
  const toSun = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
  installDomStub();
  // Casters: the built colliders (the boxes, the shell), less the clerestories' glazing.
  const cols = buildMap(THREE, 'depot').colliders
    .map((c) => ({ min: c.min.toArray().map(m), max: c.max.toArray().map(m) }))
    .filter((c) => !(c.min[2] >= ROOM.d / 2 && c.min[1] >= 5.9 && c.max[1] <= 7.3 && DEPOT_PLAY.windows.some((w) => c.min[0] >= w.x0 - 1e-6 && c.max[0] <= w.x1 + 1e-6)));
  const lit = (p) => {
    for (let t = 0.02; t < 40; t += 0.02) {
      const q = p.map((u, k) => u + toSun[k] * t);
      if (q[1] > ROOM.h + 0.5 || Math.abs(q[0]) > ROOM.w / 2 + 0.5 || Math.abs(q[2]) > ROOM.d / 2 + 0.5) return true;
      if (cols.some((b) => inside(q, b.min, b.max))) return false;
    }
    return true;
  };
  // The shafts fall clear to the floor, across the centre run, and the floor
  // is sunlit where they land; one stops at the spin pole.
  const shafts = depotShafts();
  assert.ok(shafts.length >= DEPOT_PLAY.windows.filter((w) => w.shaft).length && shafts.length >= 2, 'shafts');
  let landing = 0, stopped = 0;
  for (const sh of shafts) {
    assert.deepEqual(sh.dir.map((u) => +u.toFixed(9)), toSun.map((u) => +(-u).toFixed(9)), 'along the key');
    const [q0, , q2] = sh.quad;
    for (let u = 0; u <= 1 + 1e-9; u += 0.02) {
      for (let w = 0; w <= 1 + 1e-9; w += 0.1) {
        const p0 = [q0[0] + (q2[0] - q0[0]) * u, q0[1] + (q2[1] - q0[1]) * w, q0[2]];
        const t0 = p0[1] / -sh.dir[1], end = Math.min(t0, sh.length);
        for (let t = 0.05; t < end; t += 0.05) {
          const q = p0.map((c, k) => c + sh.dir[k] * t);
          assert.ok(!BOXES.some((b) => inside(q, b.min, b.max)), 'a shaft through ' + q.map((c) => c.toFixed(2)));
        }
        if (sh.length < t0) continue;
        const land = p0.map((c, k) => c + sh.dir[k] * t0);
        // Inside the window's edges, its light on the floor.
        if (u > 0.05 && u < 0.95 && w > 0.05 && w < 0.95 && q2[0] - q0[0] > 0.5) assert.ok(lit([land[0], 0.01, land[2]]), 'sun where a shaft lands ' + land.map((c) => c.toFixed(1)));
      }
    }
    if (sh.length < sh.quad[0][1] / -sh.dir[1]) stopped++;
    else landing++;
    const mid = sh.quad[0].map((c, k) => (c + sh.quad[2][k]) / 2), tm = mid[1] / -sh.dir[1];
    if (sh.length >= tm && mid[0] > -4.5 && mid[0] < 9.5) assert.ok(Math.abs(mid[2] + sh.dir[2] * tm - DEPOT_PLAY.run.z) < 2.5, 'across the centre run');
  }
  assert.ok(landing >= 4 && stopped === 1, landing + ' shafts land, ' + stopped + ' stops at the pole');
  for (const p of [[0, 0.01, -12], [-15, 0.01, 10], [18, 0.01, -10], [-20, 0.01, -2], [5, 0.01, 14]]) assert.ok(!lit(p), 'no sun at ' + p);
  // Every surface a look surface, its roughness and metalness the look's; the
  // look's sets, no new one.
  for (const [k, f] of Object.entries(S)) {
    assert.ok(LOOK.surfaces[f.look], k);
    assert.equal(f.roughness, LOOK.surfaces[f.look].roughness, k);
    assert.equal(f.metalness, LOOK.surfaces[f.look].metalness, k);
  }
  const sets = [...new Set(Object.values(S).map((f) => LOOK.surfaces[f.look].set))].sort();
  assert.deepEqual(sets, ['concrete_floor', 'galvanised', 'painted_steel', 'plywood']);
  // The zone hues: saturated, 20 degrees apart, clear of the gates' brand
  // orange and green; the hall itself grey.
  const Z = Object.values(DEPOT_LOOK.zones).map((k) => hueSat(S[k].color));
  for (const z of Z) {
    assert.ok(z.s >= 0.4, 'saturated');
    for (const brand of [0xff4d1a, 0x3ddc97]) assert.ok(hueGap(z.h, hueSat(brand).h) >= 15, 'clear of the gate brand');
  }
  for (let i = 0; i < Z.length; i++) for (let j = i + 1; j < Z.length; j++) assert.ok(hueGap(Z[i].h, Z[j].h) >= 20, 'zones apart');
  for (const k of ['floor', 'block', 'cladding', 'roof', 'steel']) assert.ok(hueSat(S[k].color).s < 0.1, k + ' grey');
  // Textures: the Warehouse's sets with the HDRI, and every look set
  // together, under the 24 MB budget.
  assert.ok(lookTextureBytes(sets).total < 24e6, 'the Warehouse ' + (lookTextureBytes(sets).total / 1e6).toFixed(2) + ' MB');
  assert.ok(lookTextureBytes().total < 24e6, 'every look set ' + (lookTextureBytes().total / 1e6).toFixed(2) + ' MB');
  // Built: every box on its surface's material; the glazing casts no shadow;
  // the edges at the look's 60%, bloomed.
  installDomStub();
  const built = buildMap(THREE, 'depot');
  const vis = built.group.getObjectByName('depotArtVisuals');
  const meshes = vis.children.filter((o) => o.isMesh && o.name.startsWith('depot_') && o.name !== 'depot_glazing');
  assert.equal(meshes.length, BOXES.length);
  BOXES.forEach((b, i) => {
    const mat = meshes[i].material;
    assert.equal(mat.name, 'depot ' + S[b.mat].type, b.feature + ' / ' + b.part);
    assert.equal(mat.color.getHex(), S[b.mat].color);
    assert.match(mat.map.name, new RegExp('^look_' + LOOK.surfaces[S[b.mat].look].set + '_(diff|dr)_'));
  });
  const panes = vis.children.filter((o) => o.name === 'depot_glazing');
  assert.equal(panes.length, DEPOT_PLAY.windows.length);
  for (const p of panes) assert.ok(p.castShadow === false && p.material.userData.looksSkip, 'the glazing lets the key through');
  assert.equal(vis.getObjectByName('depotEdges').material.userData.lookBloom, true);
  // Every box a collider, the built one its box at world scale.
  BOXES.forEach((b, i) => {
    assert.deepEqual(built.colliders[i].min.toArray().map((u) => +m(u).toFixed(4) + 0), b.min, b.feature + ' / ' + b.part + ' collider');
    assert.deepEqual(built.colliders[i].max.toArray().map((u) => +m(u).toFixed(4) + 0), b.max, b.feature + ' / ' + b.part + ' collider');
  });
});

test('the draw-call merge keeps every texture; the Warehouse draws in 16 objects', () => {
  installDomStub();
  const built = buildMap(THREE, 'depot');
  const root = new THREE.Group();
  root.add(built.group);
  assert.ok(mergeStaticArt(THREE, root) > 0, 'something merged');
  let objects = 0;
  root.traverse((o) => {
    if (!o.isMesh && !o.isLineSegments) return;
    objects += 1;
    if (!o.isMesh || !o.material.map) return;
    assert.ok(o.geometry.getAttribute('uv'), (o.material.name || o.name) + ' lost its uvs');
    if (o.material.aoMap) assert.ok(o.geometry.getAttribute('uv1'), o.material.name + ' lost its AO uvs');
  });
  assert.ok(objects <= 16, objects + ' draw objects');
});
