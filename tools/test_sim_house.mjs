// The House: the owner's spec checked on the shipped data (sim-maps.js
// HOUSE_PLAY, houseLine, HOUSE_LOOK + tracks/house-loop.json), in metres.
// node --test tools/test_sim_house.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import {
  HOUSE_PLAY, HOUSE_WS, HOUSE_LOOK, HOUSE_KEY, houseLine, LAYOUT, MAP_ORBIT, MAP_LOOKS, MAP_IDS, buildMap,
} from '../sim-maps.js';
import { WS } from '../sim-core-adapter.js';
import {
  normalizeTrack, gateRadius, lapLengthMetres, BUILTIN_TRACK_FILES, MAPS, PUBLIC_MAPS, DEFAULT_MAP, mapOpen,
  freestyleStart, startPad,
} from '../sim-tracks.js';
import { BOUNCE_MAPS } from '../sim-whoop.js';
import { vibeFor, mergeStaticArt } from '../sim-art.js';
import { LOOK, lookTextureBytes } from '../sim-look.js';
import { houseLoopJson, houseLoopGhost } from './build_house_loop.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = JSON.parse(readFileSync(join(root, 'tracks/house-loop.json'), 'utf8'));
const track = normalizeTrack(raw);
const ROOM = HOUSE_PLAY.room;
const BOXES = HOUSE_PLAY.boxes;
const m = (v) => v / HOUSE_WS;
const GATES = track.gates.map((g) => ({ p: [m(g.x), m(g.y), m(g.z)], r: m(gateRadius(g)), size: m(g.size) }));
const START = [m(raw.start.x), m(raw.start.y), m(raw.start.z)];
const LINE = houseLine(0.01);
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
const top = (bs) => Math.max(...bs.map((b) => b.max[1]));

// The designed gaps the line threads (closer than 30 cm allowed there):
// every doorway and opening it passes, the bookshelf gap, under the table.
const ZONES = {
  arch: [[-2.55, 0, 3.7], [-2.45, 2.1, 4.9]],
  bookshelf: [[-1.2, 0.9, 1.45], [-0.6, 1.68, 1.8]],
  door1: [[7.8, 0, 1.6], [8.6, 2, 1.7]],
  door2: [[7.8, 0, 0.05], [8.6, 2, 0.15]],
  door3: [[7.8, 0, -1.45], [8.6, 2, -1.35]],
  closetIn: [[3.35, 0, -5.5], [3.45, 2, -4.7]],
  closetOut: [[1.45, 0, -5.5], [1.55, 2, -4.7]],
  bathDoor: [[-2.75, 0, -5.5], [-2.65, 2, -4.7]],
  sliding: [[-5.7, 0, -5.6], [-5.5, 2.05, -4.66]],
  table: [[-7.99, 0, -0.79], [-7.21, 0.69, -0.01]],
  garden: [[-5.7, 0, 3.9], [-5.5, 2, 4.7]],
};
const near = (p, z) => inside(p, z[0].map((v) => v - 0.3), z[1].map((v) => v + 0.3));
// The rooms, floor rectangles, metres.
const ROOMS = {
  entry: [-5.5, -2.55, 1.1, 6], living: [-2.45, 3.45, -1.35, 6], kitchen: [3.45, 9, 1.7, 6],
  hallway: [7.45, 9, -1.35, 1.6], bedroom: [3.45, 9, -6, -1.45], closet: [1.55, 3.35, -6, -4.15],
  bathroom: [-2.65, 1.45, -6, -1.45], 'back hall': [-5.5, -2.75, -6, 1.0], patio: [-9, -5.7, -6, 6],
};

test('The House is registered, 18 × 12 × 2.7 m, open beside the Rig, bouncing as the Rig', () => {
  assert.equal(HOUSE_WS, WS);
  assert.deepEqual([ROOM.w, ROOM.d, ROOM.h], [18, 12, 2.7]);
  assert.equal(LAYOUT.house.w, 18 * WS);
  assert.equal(LAYOUT.house.d, 12 * WS);
  assert.ok(Math.abs(LAYOUT.house.h - 2.7 * WS) < 1e-9);
  assert.ok(MAP_IDS.includes('house'));
  assert.ok(MAPS.some((q) => q.id === 'house' && q.indoor && q.class === 'whoop'));
  // Open beside the Rig without ?dev=1 (Fly, Tracks); the Rig stays the default.
  assert.deepEqual([...PUBLIC_MAPS], ['rig', 'house']);
  assert.equal(DEFAULT_MAP, 'rig');
  assert.equal(mapOpen('house', false), true);
  assert.ok(BUILTIN_TRACK_FILES.some((t) => t.id === 'house-loop' && t.map === 'house'));
  assert.equal(track.map, 'house');
  // Freestyle starts on the loop's pad, nose to the arch.
  const f = freestyleStart('house'), pad = startPad(track);
  assert.deepEqual([f.x, f.y, f.z], [raw.start.x, raw.start.y, raw.start.z]);
  assert.ok(Math.abs(f.yaw - pad.yaw) < 1e-9);
  // The menu camera circles inside the open living room and kitchen.
  const o = MAP_ORBIT.house;
  assert.ok(o.h < LAYOUT.house.h && o.r < LAYOUT.house.d / 2, 'orbit inside');
  // Same bounce walls, same crash threshold as the Rig.
  assert.deepEqual(BOUNCE_MAPS.house, BOUNCE_MAPS.rig);
  assert.deepEqual(MAP_LOOKS.house, vibeFor('house').looks);
  assert.equal(MAP_LOOKS.house.fog, 0);
  assert.equal(MAP_LOOKS.house.hemi, 0);
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

test("the owner's sizes: doors 0.8 × 2.0, table 0.75, chair backs 0.9, counters 0.9, sofa seat 0.45, bed 0.55", () => {
  // Every door opening the line takes: 0.8 wide between its jambs, a lintel at 2.0.
  for (const k of ['door1', 'door2', 'door3', 'closetIn', 'closetOut', 'bathDoor', 'garden']) {
    const z = ZONES[k], alongX = z[1][0] - z[0][0] > 0.5;
    const w = alongX ? z[1][0] - z[0][0] : z[1][2] - z[0][2];
    assert.ok(Math.abs(w - 0.8) < 1e-9, k + ' width ' + w);
    const c = [(z[0][0] + z[1][0]) / 2, 2.05, (z[0][2] + z[1][2]) / 2];
    const lintel = BOXES.find((b) => b.part === 'lintel' && inside(c, b.min, b.max));
    assert.ok(lintel && lintel.min[1] === 2.0, k + ' lintel at 2.0');
    for (const s of [-0.41, 0.41]) {
      const j = alongX ? [c[0] + s, 1, c[2]] : [c[0], 1, c[2] + s];
      assert.ok(BOXES.some((b) => b.feature === 'walls' && inside(j, b.min, b.max)), k + ' jamb');
    }
  }
  assert.equal(HOUSE_PLAY.sizes.door[0], 0.8);
  assert.equal(HOUSE_PLAY.sizes.door[1], 2.0);
  assert.equal(top(part('patio table')), 0.75);
  assert.equal(top(part('patio chairs', 'back')), 0.9);
  assert.equal(top(part('cabinets', 'counter')), 0.9);
  assert.equal(top(part('island')), 0.9);
  assert.equal(top(part('sofa', 'seat')), 0.45);
  assert.equal(top(part('bed', 'duvet')), 0.55);
  // Too low to fly under: the bed sits on the floor, closed.
  assert.ok(part('bed', 'base').every((b) => b.min[1] === 0));
  // Gaps with real sizes: stool legs 24 cm apart, the bookshelf gap 60 × 78 cm,
  // 69 cm under the table.
  const legs = part('stools', 'leg').filter((b) => Math.abs(b.min[2] - 3.62) < 1e-6).sort((p, q) => p.min[0] - q.min[0]);
  assert.equal(+(legs[1].min[0] - legs[0].max[0]).toFixed(4), 0.24);
  assert.deepEqual(ZONES.bookshelf.map((p) => p[1]), [0.9, 1.68]);
  assert.equal(Math.min(...part('patio table', 'top').map((b) => b.min[1])), 0.69);
});

test('the loop: through every room, every gap it names, 30 cm clear elsewhere', () => {
  const path = [];
  for (let i = 0; i < 100; i++) path.push(lerp(START, PTS[0], i / 100));
  path.push(...PTS);
  const hit = Object.fromEntries(Object.keys(ZONES).map((k) => [k, 1e9]));
  const visited = new Set();
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
    for (const [k, q] of Object.entries(ROOMS)) if (p[0] > q[0] && p[0] < q[1] && p[2] > q[2] && p[2] < q[3]) visited.add(k);
  }
  for (const [k, v] of Object.entries(hit)) assert.ok(v < 1e9, k + ' is not on the loop');
  assert.ok(outside >= 0.3, 'clearance outside the designed gaps ' + outside);
  assert.deepEqual([...visited].sort(), Object.keys(ROOMS).sort(), 'every room');
  // Over the sofa back under the fan; over the island, then the stools.
  const over = (x0, x1, z0, z1) => PTS.filter((p) => p[0] > x0 && p[0] < x1 && p[2] > z0 && p[2] < z1);
  const back = part('sofa', 'back')[0], fan = part('fan', 'blade');
  const crossing = over(back.min[0], back.max[0], back.min[2], back.max[2]);
  assert.ok(crossing.length && crossing.every((p) => p[1] > back.max[1] + 0.3 && p[1] < Math.min(...fan.map((b) => b.min[1])) - 0.3), 'over the sofa back, under the fan');
  assert.ok(fan.some((b) => crossing.some((p) => p[0] > b.min[0] && p[0] < b.max[0] && p[2] > b.min[2] && p[2] < b.max[2])), 'the fan over the crossing');
  const isl = part('island', 'top')[0];
  const onIsland = over(isl.min[0], isl.max[0], isl.min[2], isl.max[2]);
  assert.ok(onIsland.length && onIsland.every((p) => p[1] >= 0.9 + 0.3), 'over the island');
  const seats = part('stools', 'seat');
  const onStools = PTS.filter((p) => seats.some((b) => p[0] > b.min[0] && p[0] < b.max[0] && p[2] > b.min[2] && p[2] < b.max[2]));
  assert.ok(onStools.length, 'over a stool');
  // The dive: down from over the island to the hallway's first door, then a
  // climb through all three.
  const at = (x, z) => PTS.reduce((b, p) => (Math.hypot(p[0] - x, p[2] - z) < Math.hypot(b[0] - x, b[2] - z) ? p : b));
  const doors = [at(8.2, 1.65), at(8.2, 0.1), at(8.2, -1.4)];
  assert.ok(Math.max(...onIsland.map((p) => p[1])) - doors[0][1] >= 0.4, 'dive from the island');
  assert.ok(doors[0][1] < doors[1][1] && doors[1][1] < doors[2][1], 'climb through the hallway doors');
  // Over the bed; through the closet; once round the tub.
  const duvet = part('bed', 'duvet')[0];
  const onBed = over(duvet.min[0], duvet.max[0], duvet.min[2], duvet.max[2]);
  assert.ok(onBed.length && onBed.every((p) => p[1] > 0.55 + 0.3), 'over the bed');
  // The closed line winds round the tub once more than round the kitchen's
  // core, which the whole loop rings.
  const winding = (c) => {
    let w = 0;
    for (let i = 0; i < PTS.length; i++) {
      const p = PTS[i], q = PTS[(i + 1) % PTS.length];
      let d = Math.atan2(q[2] - c[1], q[0] - c[0]) - Math.atan2(p[2] - c[1], p[0] - c[0]);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      w += d;
    }
    return Math.round(w / (2 * Math.PI));
  };
  const tub = part('tub', 'bottom')[0], tc = [(tub.min[0] + tub.max[0]) / 2, (tub.min[2] + tub.max[2]) / 2];
  assert.equal(Math.abs(winding(tc) - winding([5, 0])), 1, 'once round the tub');
  assert.equal(Math.abs(winding([5, 0])), 1, 'the loop rings the house');
  // The chair slalom: past one chair on its east side, the other on its west.
  const chairs = part('patio chairs', 'seat').sort((p, q) => p.min[2] - q.min[2]);
  const by = (b) => at((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2);
  assert.ok(by(chairs[0])[0] > chairs[0].max[0] + 0.3, 'east of the first chair');
  assert.ok(by(chairs[1])[0] < chairs[1].min[0] - 0.3, 'west of the second');
});

test('the House Loop: 15–20 gates, 60–80 m, no stop-and-turn, tightest radius 1.5 m', () => {
  assert.ok(GATES.length >= 15 && GATES.length <= 20, GATES.length + ' gates');
  assert.ok(LINE.closes < 1e-3, 'the line closes ' + LINE.closes);
  let flown = 0;
  for (let i = 1; i < PTS.length; i++) flown += len(sub(PTS[i], PTS[i - 1]));
  assert.ok(flown >= 60 && flown <= 80, 'line ' + flown.toFixed(1) + ' m');
  const chord = lapLengthMetres(track.gates);
  assert.ok(chord >= 60 && chord <= 80, 'gate to gate ' + chord.toFixed(1) + ' m');
  let minR = Infinity, maxSlope = 0;
  for (let i = 5; i < PTS.length - 5; i++) {
    const a = PTS[i - 5], b = PTS[i], c = PTS[i + 5];
    const A = len(sub(b, c)), B = len(sub(a, c)), C = len(sub(a, b));
    const u = sub(b, a), v = sub(c, a);
    const cr2 = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    if (cr2 > 1e-12) minR = Math.min(minR, (A * B * C) / (2 * cr2));
    maxSlope = Math.max(maxSlope, Math.abs(Math.atan2(c[1] - b[1], Math.hypot(c[0] - b[0], c[2] - b[2]))) * 180 / Math.PI);
  }
  assert.ok(minR >= 1.5, 'tightest radius ' + minR.toFixed(2) + ' m');
  assert.ok(maxSlope <= 40, 'steepest climb or dive ' + maxSlope.toFixed(1) + ' deg');
});

test('the gates mark the line: written from it, entered in order, once each, from the pad', () => {
  assert.equal(readFileSync(join(root, 'tracks/house-loop.json'), 'utf8').replace(/\r\n/g, '\n'), houseLoopJson(),
    'tracks/house-loop.json is node tools/build_house_loop.mjs');
  LINE.gates.forEach((g, i) => {
    assert.ok(len(sub(GATES[i].p, PTS[g.at])) < 1e-3, g.name + ' on the line');
    assert.ok(GATES[i].size >= 0.3, g.name + ' ring visible');
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

test('the hosted pace ghost flies the line, from the first gate, clear of the House', () => {
  const g = JSON.parse(readFileSync(join(root, 'ghosts/house-loop.json'), 'utf8'));
  assert.deepEqual(g, houseLoopGhost(), 'ghosts/house-loop.json is node tools/build_house_loop.mjs');
  assert.equal(g.track, 'house-loop');
  assert.ok(len(sub(g.samples[0].slice(1, 4).map(m), GATES[0].p)) < 0.01, 'starts at the first gate');
  for (const s of g.samples) assert.ok(nearest(s.slice(1, 4).map(m)).d >= 0.085, 'ghost clips at ' + s.slice(1, 4));
});

// Hue (degrees) and saturation of a 0xRRGGBB colour, as written (sRGB).
function hueSat(hex) {
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0 };
}

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

test('the look, inherited: one key, the HDRI fill, look surfaces, zone hues as tints', () => {
  const v = vibeFor('house'), L = v.lighting, S = HOUSE_LOOK.surfaces;
  assert.equal(v.look, true);
  assert.equal(L.fillIntensity, 0);
  assert.equal(L.hemiIntensity, 0);
  assert.equal(L.exposure, LOOK.lighting.exposure);
  assert.equal(L.fogDensity, 0);
  assert.equal(v.looks.env, LOOK.lighting.env, 'the HDRI fill');
  assert.equal(v.looks.sun, L.sunIntensity, 'looks.sun is the same key');
  // The key: an afternoon sun, low in the west, warm.
  assert.deepEqual([L.sunElevation, L.sunAzimuth, L.sunColor, L.sunIntensity], [HOUSE_KEY.elevation, HOUSE_KEY.azimuth, HOUSE_KEY.color, HOUSE_KEY.intensity]);
  const e = L.sunElevation * Math.PI / 180, a = L.sunAzimuth * Math.PI / 180;
  const toSun = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
  assert.ok(toSun[0] < -0.8 && L.sunElevation <= 30, 'low in the west');
  const warm = hueSat(L.sunColor);
  assert.ok(warm.h > 20 && warm.h < 45 && warm.s > 0.2, 'warm');
  // It comes in off the patio only: through the garden door and the sliding
  // door onto the floor; never through a wall or the roof into the kitchen.
  // Casters: the built colliders (the boxes, then the shell), less the glass.
  installDomStub();
  const cols = buildMap(THREE, 'house').colliders.filter((c, i) => !(i < BOXES.length && BOXES[i].mat === 'glass'))
    .map((c) => ({ min: c.min.toArray().map(m), max: c.max.toArray().map(m) }));
  const lit = (p) => {
    for (let t = 0.02; t < 30; t += 0.01) {
      const q = p.map((v, k) => v + toSun[k] * t);
      if (q[1] > ROOM.h + 0.5 || Math.abs(q[0]) > ROOM.w / 2 + 0.5 || Math.abs(q[2]) > ROOM.d / 2 + 0.5) return true;
      if (cols.some((b) => inside(q, b.min, b.max))) return false;
    }
    return true;
  };
  assert.ok(lit([-4.5, 0.01, 4.75]), 'through the garden door into the entry hall');
  assert.ok(lit([-4.5, 0.01, -4.7]), 'through the sliding door into the back hall');
  for (const p of [[5, 0.01, 4], [0.5, 0.01, 3], [6, 0.01, -3], [-0.6, 0.01, -2.5]]) assert.ok(!lit(p), 'no sun at ' + p);
  // Every surface a look surface, its roughness and metalness the look's; the
  // sets the look's, fabric the one new set.
  for (const [k, f] of Object.entries(S)) {
    assert.ok(LOOK.surfaces[f.look], k);
    assert.equal(f.roughness, LOOK.surfaces[f.look].roughness, k);
    assert.equal(f.metalness, LOOK.surfaces[f.look].metalness, k);
  }
  const sets = [...new Set(Object.values(S).map((f) => LOOK.surfaces[f.look].set))].sort();
  assert.deepEqual(sets, ['fabric', 'galvanised', 'painted_steel', 'plywood']);
  // The zone hues: living warm neutral, kitchen white and steel, bedroom blue,
  // bathroom tile (aqua), patio terracotta.
  const Z = HOUSE_LOOK.zones, hs = (k) => hueSat(S[Z[k]].color);
  assert.ok(hs('living').h > 20 && hs('living').h < 50 && hs('living').s < 0.3, 'living warm neutral');
  assert.ok(hs('kitchen').s < 0.1 && S.steel.metalness >= 0.5, 'kitchen white and steel');
  assert.ok(hs('bedroom').h > 200 && hs('bedroom').h < 235 && hs('bedroom').s > 0.4, 'bedroom blue');
  assert.ok(hs('bathroom').h > 160 && hs('bathroom').h < 190 && hs('bathroom').s > 0.2, 'bathroom tile');
  assert.ok(hs('patio').h > 10 && hs('patio').h < 30 && hs('patio').s > 0.5, 'patio terracotta');
  assert.ok(hueSat(S.wall.color).s < 0.15 && hueSat(S.ceiling.color).s < 0.1, 'warm white plaster');
  // Textures: the House's sets with the HDRI, and every look set together,
  // under the 24 MB budget.
  assert.ok(lookTextureBytes(sets).total < 24e6, 'the House ' + (lookTextureBytes(sets).total / 1e6).toFixed(2) + ' MB');
  assert.ok(lookTextureBytes().total < 24e6, 'every look set ' + (lookTextureBytes().total / 1e6).toFixed(2) + ' MB');
  // Built: every box on its surface's material; glass casts no shadow; the
  // floors read one AO map; edges at the look's 60%, bloomed.
  installDomStub();
  const built = buildMap(THREE, 'house');
  const vis = built.group.getObjectByName('houseArtVisuals');
  const meshes = vis.children.filter((o) => o.isMesh && o.name.startsWith('house_'));
  assert.equal(meshes.length, BOXES.length);
  BOXES.forEach((b, i) => {
    const mat = meshes[i].material;
    if (b.mat === 'glass') {
      assert.equal(mat.userData.lookKind, 'glass');
      assert.ok(mat.transparent && meshes[i].castShadow === false, 'glass lets the key through');
      return;
    }
    assert.equal(mat.name, 'house ' + S[b.mat].type, b.feature + ' / ' + b.part);
    assert.equal(mat.color.getHex(), S[b.mat].color);
    assert.match(mat.map.name, new RegExp('^look_' + LOOK.surfaces[S[b.mat].look].set + '_(diff|dr)_'));
  });
  const floors = vis.children.filter((o) => o.isMesh && o.name.startsWith('house floor'));
  assert.equal(floors.length, HOUSE_PLAY.floors.length);
  const ao = floors[0].material.aoMap;
  for (const f of floors) {
    assert.equal(f.material.aoMap, ao, 'one AO map');
    assert.ok(f.geometry.getAttribute('uv1'), 'AO on uv1');
  }
  let area = 0;
  for (const f of HOUSE_PLAY.floors) area += (f.x1 - f.x0) * (f.z1 - f.z0);
  assert.ok(Math.abs(area - ROOM.w * ROOM.d) < 1e-6, 'the floors tile the house');
  const edges = vis.getObjectByName('houseEdges');
  assert.equal(edges.material.userData.lookBloom, true);
});

test('the draw-call merge keeps the floors\' AO and every texture; the House draws in under 20 objects', () => {
  installDomStub();
  const built = buildMap(THREE, 'house');
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
  assert.ok(objects <= 20, objects + ' draw objects');
});
