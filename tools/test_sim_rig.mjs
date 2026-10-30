// The Rig: geometry rules and the flow loop, checked on the shipped data
// (sim-maps.js RIG_PLAY + tracks/rig-loop.json), in metres.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import { RIG_PLAY, RIG_WS, RIG_LOOK, LAYOUT, MAP_ORBIT, MAP_LOOKS, MAP_IDS, buildMap } from '../sim-maps.js';
import { WS } from '../sim-core-adapter.js';
import { normalizeTrack, gateRadius, BUILTIN_TRACK_FILES } from '../sim-tracks.js';
import { vibeFor, mergeStaticArt } from '../sim-art.js';
import { LOOK } from '../sim-look.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = JSON.parse(readFileSync(join(root, 'tracks/rig-loop.json'), 'utf8'));
const track = normalizeTrack(raw);
const ROOM = RIG_PLAY.room;
const BOXES = RIG_PLAY.boxes;
const X = RIG_PLAY.drop;
const m = (v) => v / RIG_WS;
const GATES = track.gates.map((g) => ({ p: [m(g.x), m(g.y), m(g.z)], r: m(gateRadius(g)), size: m(g.size) }));
const START = [m(raw.start.x), m(raw.start.y), m(raw.start.z)];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t0, t1, t) => a.map((v, i) => v * (t1 - t) / (t1 - t0) + b[i] * (t - t0) / (t1 - t0));

// Catmull-Rom through the gates. alpha 0.5 is three.js 'centripetal';
// alpha 0 is the uniform curve the pace ghost flies (sim-tracks.js catmull).
function cr(p0, p1, p2, p3, u, alpha) {
  const k = (a, b) => Math.max(Math.pow(len(sub(b, a)), alpha), 1e-4);
  const t1 = k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3), t = t1 + u * (t2 - t1);
  const a1 = lerp(p0, p1, 0, t1, t), a2 = lerp(p1, p2, t1, t2, t), a3 = lerp(p2, p3, t2, t3, t);
  return lerp(lerp(a1, a2, 0, t2, t), lerp(a2, a3, t1, t3, t), t1, t2, t);
}
function loop(alpha, ds) {
  const P = GATES.map((g) => g.p), n = P.length, raw = [];
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < 600; s++) raw.push(cr(P[(i - 1 + n) % n], P[i], P[(i + 1) % n], P[(i + 2) % n], s / 600, alpha));
  }
  raw.push(P[0]);
  const out = [raw[0]];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    acc += len(sub(raw[i], raw[i - 1]));
    if (acc >= ds) { out.push(raw[i]); acc = 0; }
  }
  return out;
}
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

// The designed gaps the line threads; everywhere else it keeps 30 cm.
const pipeLo = BOXES.filter((b) => b.part === 'pipe').map((b) => b.min[1])[0];
const ZONES = {
  crates: [[8.8, 0, -1.0], [9.2, 2, 1.0]],
  tunnel: [[0.05, 1.05, 5.45], [4.05, 1.35, 5.75]],
  slit: [[X - 0.1, pipeLo, -7.5], [X + 0.1, pipeLo + 0.15, 3.2]],
  // Tower bay 2: between deck 2 and deck 3, inside the posts.
  tower: [[-7.47, 3.4, 4.08], [-6.33, 5.04, 6.12]],
  hole: [[X - 0.5, 2.7, -3.75], [X + 0.5, 2.8, -1.95]],
};
const near = (p, z) => inside(p, z[0].map((v) => v - 0.3), z[1].map((v) => v + 0.3));

test('The Rig is registered and sized 20 × 15 × 6 m', () => {
  assert.equal(RIG_WS, WS);
  assert.deepEqual([ROOM.w, ROOM.d, ROOM.h], [20, 15, 6]);
  assert.equal(LAYOUT.rig.w, 20 * WS);
  assert.equal(LAYOUT.rig.d, 15 * WS);
  assert.equal(LAYOUT.rig.h, 6 * WS);
  assert.ok(MAP_IDS.includes('rig'));
  assert.ok(MAP_ORBIT.rig.r < LAYOUT.rig.d / 2, 'orbit stays inside');
  assert.deepEqual(MAP_LOOKS.rig, vibeFor('rig').looks);
  assert.equal(MAP_LOOKS.rig.fog, 0);
  assert.equal(MAP_LOOKS.rig.hemi, 0);
  assert.ok(BUILTIN_TRACK_FILES.some((t) => t.id === 'rig-loop' && t.map === 'rig'));
  assert.equal(track.map, 'rig');
});

test('every box is buildable: thick enough, inside, grounded, no 4–10 cm slot', () => {
  for (const b of BOXES) {
    const t = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
    assert.ok(Math.min(...t) >= 0.06 - 1e-9, b.part + ' thickness ' + t);
    assert.ok(b.min[0] >= -10 && b.max[0] <= 10 && b.min[2] >= -7.5 && b.max[2] <= 7.5, b.part + ' outside x/z');
    assert.ok(b.min[1] >= 0 && b.max[1] <= 6, b.part + ' outside y');
    assert.ok(b.min[1] === 0 || b.min[1] >= 0.15, b.part + ' floats just off the floor');
    const room = [b.min[0] + 10, 10 - b.max[0], b.min[2] + 7.5, 7.5 - b.max[2], b.min[1], 6 - b.max[1]];
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

test('the six features have the asked-for gaps', () => {
  // Crates: one slot per wall, 18–25 cm, all on x = 9.
  const walls = new Map();
  for (const b of BOXES.filter((q) => q.feature === 'crates')) {
    const k = b.min[2] + ':' + b.min[1];
    walls.set(k, (walls.get(k) || []).concat([b]));
  }
  const widths = new Set();
  for (const row of walls.values()) {
    row.sort((p, q) => p.min[0] - q.min[0]);
    for (let i = 1; i < row.length; i++) {
      const g = +(row[i].min[0] - row[i - 1].max[0]).toFixed(4);
      if (g > 0) { widths.add(g); assert.ok(Math.abs((row[i].min[0] + row[i - 1].max[0]) / 2 - 9) < 1e-6); }
    }
  }
  assert.deepEqual([...widths].sort(), [0.18, 0.21, 0.25]);
  assert.deepEqual([...RIG_PLAY.gaps.crates].sort(), [0.18, 0.21, 0.25]);
  // Pipes: 20 cm between pipes, along the ceiling, one slit on the drop plane.
  const pipes = BOXES.filter((b) => b.part === 'pipe').sort((p, q) => p.min[0] - q.min[0]);
  assert.ok(pipes.length >= 4);
  for (let i = 1; i < pipes.length; i++) assert.equal(+(pipes[i].min[0] - pipes[i - 1].max[0]).toFixed(4), 0.2);
  assert.ok(pipes.some((p, i) => i && Math.abs((p.min[0] + pipes[i - 1].max[0]) / 2 - X) < 1e-6));
  assert.equal(pipes[0].min[0], -10, 'first pipe flush to the wall: no slot behind it');
  assert.ok(pipes[0].max[1] >= 4.9 && pipes[0].max[2] - pipes[0].min[2] > 10);
  // Tunnel: 30 cm square bore, 4 m long.
  const tun = Object.fromEntries(BOXES.filter((b) => b.feature === 'tunnel').map((b) => [b.part, b]));
  assert.equal(+(tun['side +z'].min[2] - tun['side -z'].max[2]).toFixed(4), 0.3);
  assert.equal(+(tun.roof.min[1] - tun.floor.max[1]).toFixed(4), 0.3);
  assert.equal(+(tun.roof.max[0] - tun.roof.min[0]).toFixed(4), 4);
  // Tower: three decks, open on the faces the line crosses.
  const decks = BOXES.filter((b) => b.part === 'deck').map((b) => b.max[1]).sort();
  assert.deepEqual(decks, [1.7, 3.4, 5.1]);
  // Loft: one slab level with a 1.0 × 1.8 m hole on the drop plane.
  const loft = BOXES.filter((b) => b.feature === 'loft');
  assert.equal(new Set(loft.map((b) => b.max[1])).size, 1);
  assert.ok(!loft.some((b) => inside([X, 2.75, -2.85], b.min, b.max)), 'hole is open');
  assert.deepEqual(RIG_PLAY.gaps.hole, [1.0, 1.8]);
  // Straight: last gate → G0 → G1 → G2 on one line, 15 m end to end.
  const s = [GATES[GATES.length - 1], GATES[0], GATES[1], GATES[2]].map((g) => g.p);
  for (const p of s) assert.ok(Math.abs(p[1] - s[0][1]) < 1e-9 && Math.abs(p[2] - s[0][2]) < 1e-9);
  assert.equal(+(s[3][0] - s[0][0]).toFixed(3), RIG_PLAY.straight);
});

test('the loop threads every feature and keeps 30 cm everywhere else', () => {
  const path = [];
  const g0 = GATES[0].p;
  const n0 = Math.ceil(len(sub(g0, START)) / 0.01);
  for (let i = 0; i < n0; i++) path.push(lerp(START, g0, 0, n0, i));
  path.push(...loop(0.5, 0.01));
  const hit = { crates: 1e9, tunnel: 1e9, slit: 1e9, hole: 1e9, tower: 1e9 };
  let outside = 1e9;
  for (const p of path) {
    const c = nearest(p).d;
    assert.ok(c >= 0.085, 'line hits geometry at ' + p.map((v) => v.toFixed(2)));
    const r = Math.min(p[0] + 10, 10 - p[0], p[1], 6 - p[1], p[2] + 7.5, 7.5 - p[2]);
    assert.ok(r >= 0.3, 'line near the room shell at ' + p);
    let zoned = false;
    for (const [k, z] of Object.entries(ZONES)) {
      if (inside(p, z[0], z[1])) hit[k] = Math.min(hit[k], c);
      if (k !== 'tower' && near(p, z)) zoned = true; // the bay is not a designed gap
    }
    if (!zoned) outside = Math.min(outside, c);
  }
  for (const [k, v] of Object.entries(hit)) assert.ok(v < 1e9, k + ' is not on the loop');
  assert.ok(Math.abs(hit.slit - 0.1) < 0.005, 'slit flown on its centre line ' + hit.slit);
  assert.ok(outside >= 0.3, 'clearance outside the designed gaps ' + outside);
});

test('gates are entered in order, once each, from the start pad', () => {
  const path = [];
  const g0 = GATES[0].p;
  for (let i = 0; i < 200; i++) path.push(lerp(START, g0, 0, 200, i));
  const lap = loop(0.5, 0.02);
  path.push(...lap, ...lap);
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
  assert.equal(passes, 2 * GATES.length + 1);
  for (const g of GATES) assert.ok(g.size >= 0.3, 'ring visible');
  assert.ok(len(sub(START, GATES[GATES.length - 1].p)) > GATES[GATES.length - 1].r + 1, 'pad clear of the last gate');
});

test('flow: no stop-and-turn anywhere on the loop', () => {
  const pts = loop(0.5, 0.01);
  let minR = Infinity, maxSlope = 0;
  for (let i = 5; i < pts.length - 5; i++) {
    const a = pts[i - 5], b = pts[i], c = pts[i + 5];
    const A = len(sub(b, c)), B = len(sub(a, c)), C = len(sub(a, b));
    const u = sub(b, a), v = sub(c, a);
    const cr2 = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    if (cr2 > 1e-12) minR = Math.min(minR, (A * B * C) / (2 * cr2));
    maxSlope = Math.max(maxSlope, Math.abs(Math.atan2(c[1] - b[1], Math.hypot(c[0] - b[0], c[2] - b[2]))) * 180 / Math.PI);
  }
  assert.ok(minR >= 1.4, 'tightest radius ' + minR.toFixed(2) + ' m');
  assert.ok(maxSlope <= 40, 'steepest climb or dive ' + maxSlope.toFixed(1) + ' deg');
  const n = GATES.length;
  for (let i = 0; i < n; i++) {
    const a = GATES[(i - 1 + n) % n].p, b = GATES[i].p, c = GATES[(i + 1) % n].p;
    let d = Math.atan2(c[0] - b[0], c[2] - b[2]) - Math.atan2(b[0] - a[0], b[2] - a[2]);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    assert.ok(Math.abs(d) <= Math.PI * 50 / 180, `gate ${i} turns ${(d * 180 / Math.PI).toFixed(1)} deg`);
  }
});

test('the pace ghost (uniform curve) clears the rig too', () => {
  for (const p of loop(0, 0.02)) assert.ok(nearest(p).d >= 0.05, 'ghost clips at ' + p.map((v) => v.toFixed(2)));
});

// Hue (degrees) and saturation of a 0xRRGGBB colour, as written (sRGB).
function hueSat(hex) {
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0 };
}
const hueGap = (a, b) => Math.min(Math.abs(a - b) % 360, 360 - Math.abs(a - b) % 360);

// Just enough canvas for the look's placeholder texels. Each canvas records
// its draw calls (with the fill style at the time) in cv.ops.
function installDomStub() {
  if (globalThis.document && globalThis.document.createElement) return;
  globalThis.document = {
    createElement: () => {
      const cv = { width: 0, height: 0, ops: [] };
      const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (...a) => cv.ops.push([k, t.fillStyle, ...a])),
        set: (t, k, v) => { t[k] = v; return true; },
      });
      cv.getContext = () => ctx;
      return cv;
    },
  };
}

// A material's shader as onBeforeCompile leaves it (the chunks it patches).
function compiled(mat) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <opaque_fragment>',
  };
  mat.onBeforeCompile(shader, null);
  return shader;
}

test('the look: a hue per zone painted on a real surface, a roughness per surface, the HDRI fill, the floor joints', () => {
  const S = RIG_LOOK.surfaces, zones = ['tower', 'pipes', 'crates', 'tunnel', 'loft'];
  // A hue per zone, 20 degrees apart at least; the room stays grey.
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const g = hueGap(hueSat(S[zones[i]].color).h, hueSat(S[zones[j]].color).h);
      assert.ok(g >= 20, `${zones[i]} / ${zones[j]} hues ${g.toFixed(0)} deg apart`);
    }
  }
  for (const z of zones) assert.ok(hueSat(S[z].color).s >= 0.4, z + ' is a colour');
  for (const k of ['floor', 'wall', 'ceil']) assert.ok(hueSat(S[k].color).s < 0.1, k + ' stays grey');
  // No zone takes a gate's brand colour.
  const v = vibeFor('rig');
  for (const gate of [v.palette.gateA, v.palette.gateB]) {
    const gh = hueSat(parseInt(gate.slice(1), 16)).h;
    for (const z of zones) assert.ok(hueGap(gh, hueSat(S[z].color).h) >= 15, z + ' near gate ' + gate);
  }
  // The owner's surfaces: concrete floor, painted steel scaffold, galvanised
  // pipe, plywood crates, rubber matting on the loft. Each its own roughness.
  const named = [S.pipes, S.crates, S.floor, S.tower];
  assert.deepEqual(named.map((f) => f.type), ['galvanised pipe', 'plywood crate', 'concrete', 'painted steel scaffold']);
  assert.deepEqual([S.floor, S.tower, S.pipes, S.crates, S.loft].map((f) => f.look), ['concrete', 'paintedSteel', 'galvanised', 'plywood', 'rubber']);
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      assert.ok(Math.abs(named[i].roughness - named[j].roughness) >= 0.1, named[i].type + ' / ' + named[j].type);
    }
  }
  assert.ok(S.pipes.metalness >= 0.5, 'galvanised steel is a metal');
  for (const k of ['crates', 'floor', 'tower']) assert.equal(S[k].metalness, 0, k);
  for (const [k, f] of Object.entries(S)) {
    assert.equal(f.roughness, LOOK.surfaces[f.look].roughness, k + ' roughness from the look');
    assert.equal(f.metalness, LOOK.surfaces[f.look].metalness, k + ' metalness from the look');
  }
  // One key light; the fill is the look's HDRI at the look's intensity.
  const L = v.lighting;
  assert.equal(v.look, true);
  assert.equal(L.fillIntensity, 0);
  assert.equal(L.hemiIntensity, 0);
  assert.equal(L.sunIntensity, LOOK.lighting.key.intensity);
  assert.equal(L.exposure, LOOK.lighting.exposure);
  assert.equal(v.looks.env, LOOK.lighting.env);
  // After a quality change the key runs at looks.sun (sim-looks.js applyMapLooksNow).
  assert.equal(v.looks.sun, L.sunIntensity, 'looks.sun is the same key');
  // Built: every box wears its zone's material (supports too), each a PBR set
  // with the zone hue as its colour; the floor carries the joints and the AO;
  // the edges are drawn at 60% and bloom.
  installDomStub();
  const built = buildMap(THREE, 'rig');
  const vis = built.group.getObjectByName('rigArtVisuals');
  const mats = {};
  vis.traverse((o) => { if (o.isMesh && o.name.startsWith('rig_')) (mats[o.name] = mats[o.name] || new Set()).add(o.material); });
  assert.deepEqual(Object.keys(mats).sort(), zones.map((z) => 'rig_' + z).sort());
  // A support takes the zone of what it holds, from its part, not the builder's own say.
  const held = { 'tunnel trestle': 'tunnel', 'pipe hanger': 'pipes', 'pipe hanger rod': 'pipes', 'loft post': 'loft' };
  const rigMeshes = vis.children.filter((o) => o.isMesh && o.name.startsWith('rig_'));
  assert.equal(rigMeshes.length, BOXES.length);
  BOXES.forEach((b, i) => {
    const want = b.feature === 'support' ? held[b.part] : b.feature;
    assert.ok(want, 'support with no zone: ' + b.part);
    assert.equal(rigMeshes[i].material.color.getHex(), S[want].color, b.feature + ' / ' + b.part);
  });
  for (const z of zones) {
    assert.equal(mats['rig_' + z].size, 1, z + ' one material');
    const mat = [...mats['rig_' + z]][0];
    const set = LOOK.surfaces[S[z].look].set;
    assert.equal(mat.name, 'rig ' + S[z].type);
    assert.equal(mat.color.getHex(), S[z].color, z + ' colour (the paint tint)');
    assert.equal(mat.roughness, S[z].roughness, z + ' roughness');
    assert.equal(mat.metalness, S[z].metalness, z + ' metalness');
    assert.match(mat.map.name, new RegExp('^look_' + set + '_diff_'), z + ' albedo');
    assert.match(mat.roughnessMap.name, new RegExp('^look_' + set + '_nr_'), z + ' roughness map');
    if (LOOK.surfaces[S[z].look].normal > 0) assert.equal(mat.normalMap, mat.roughnessMap, z + ' normal map');
    assert.match(compiled(mat).fragmentShader, /lookRoughVar/, z + ' roughness varies about its mean');
  }
  // Box uvs are in tiles of the surface's physical size: a 10.7 m pipe runs
  // 10.7 / tile tiles, not one stretched texture.
  const pipe = rigMeshes[BOXES.findIndex((b) => b.part === 'pipe')];
  const uv = pipe.geometry.getAttribute('uv'), nrm = pipe.geometry.getAttribute('normal');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nrm.getX(i)) < 0.5) continue; // a side face: u runs along the pipe (z)
    lo = Math.min(lo, uv.getX(i)); hi = Math.max(hi, uv.getX(i));
  }
  assert.ok(Math.abs((hi - lo) - (3.2 + 7.5) / LOOK.surfaces.galvanised.tile) < 1e-3, 'pipe tiles ' + (hi - lo));
  // The floor: concrete with its joints, a cut every metre and a wider one
  // every 5 m from the room corner, and the AO map on uv1.
  const fm = built.floor.material;
  assert.equal(RIG_LOOK.grid.minor, 1);
  assert.equal(RIG_LOOK.grid.major, 5);
  assert.match(fm.map.name, /^look_concrete_floor_diff_1k$/);
  assert.ok(fm.map.wrapS === THREE.RepeatWrapping && fm.map.wrapT === THREE.RepeatWrapping, 'floor tiles');
  assert.equal(fm.roughness, S.floor.roughness);
  const sh = compiled(fm);
  const g = sh.uniforms.lookGrid.value;
  assert.deepEqual([g.x, g.y], [-ROOM.w * RIG_WS / 2, -ROOM.d * RIG_WS / 2], 'grid from the room corner');
  assert.equal(g.z, RIG_LOOK.grid.minor * RIG_WS, 'a joint every metre');
  assert.equal(g.w, RIG_LOOK.grid.major / RIG_LOOK.grid.minor, 'a wider one every 5 m');
  const jw = sh.uniforms.lookJoint.value;
  assert.ok(jw.y * RIG_LOOK.grid.major > jw.x * RIG_LOOK.grid.minor, 'the 5 m joint is wider');
  assert.match(sh.fragmentShader, /LOOK_JOINTS/);
  assert.ok(fm.aoMap && fm.aoMap.channel === 1 && built.floor.geometry.getAttribute('uv1'), 'floor AO on uv1');
  assert.deepEqual([fm.aoMap.image.width, fm.aoMap.image.height],
    [Math.round(ROOM.w / LOOK.grounding.floorAo.texel), Math.round(ROOM.d / LOOK.grounding.floorAo.texel)]);
  // The edges: one LineSegments at the look's 60%, marked to bloom.
  const edges = vis.getObjectByName('rigEdges');
  assert.ok(edges.isLineSegments, 'edges drawn');
  const want = new THREE.Color(LOOK.lines.color).multiplyScalar(0.6);
  assert.ok(Math.abs(edges.material.color.r - want.r) < 1e-6 && Math.abs(edges.material.color.g - want.g) < 1e-6, 'edges at 60%');
  assert.equal(LOOK.lines.level, 0.6);
  assert.equal(edges.material.userData.lookBloom, true);
  assert.match(compiled(edges.material).fragmentShader, /gl_FragColor\.a = 0\.0;/);
});

test('the draw-call merge keeps the Rig textures (plywood crates)', () => {
  installDomStub();
  const built = buildMap(THREE, 'rig');
  const root = new THREE.Group();
  root.add(built.group);
  assert.ok(mergeStaticArt(THREE, root) > 0, 'something merged');
  let crates = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material.map) return;
    assert.ok(o.geometry.getAttribute('uv'), (o.material.name || o.name) + ' lost its uvs');
    assert.equal(o.geometry.getAttribute('uv').count, o.geometry.getAttribute('position').count);
    if (o.material.name === 'rig ' + RIG_LOOK.surfaces.crates.type) crates += o.userData.mergedStatic ? 1 : 0;
  });
  assert.equal(crates, 1, 'the crates are one merged mesh');
});
