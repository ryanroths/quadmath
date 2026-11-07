// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Writes tracks/bando-loop-v2.json from The Bando's line (sim-maps.js
// bandoLine): each gate where the line puts it, facing along the line, in
// world units; the start pad from BANDO_PLAY. Writes its hosted pace ghost,
// ghosts/bando-loop-v2.json, along the same line. Run it again after a change to
// the line, then check it with node --test tools/test_sim_bando.mjs:
//   node tools/build_bando_loop.mjs
// Also flies the loop: flyBandoLoop() puts the Coach autopilot
// (tools/coach_rig_autopilot.mjs) on the bf core with The Bando's colliders
// and flies the line from the pad on the roof, three laps.
//   node tools/build_bando_loop.mjs --fly
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANDO_PLAY, BANDO_WS, bandoLine } from '../sim-maps.js';
import { PHYSICS_VER } from '../sim-whoop.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
// The course's id: -v2 since it was relaid from the roof, so the old
// course's bests and ghosts do not carry over (sim-tracks.js RETIRED_TRACKS).
export const BANDO_TRACK_ID = 'bando-loop-v2';

export function bandoLoopTrack() {
  const line = bandoLine(0.01);
  const w = (v) => r4(v * BANDO_WS);
  const [sx, sy, sz] = BANDO_PLAY.start;
  return {
    id: BANDO_TRACK_ID,
    map: 'bando',
    name: 'Bando Loop',
    class: 'whoop',
    start: { x: w(sx), y: w(sy), z: w(sz) },
    gates: line.gates.map((g) => {
      const p = line.points[g.at];
      return { x: w(p[0]), y: w(p[1]), z: w(p[2]), ry: r4(g.ry), size: w(g.size), solid: false };
    }),
    flags: [],
  };
}

// The track as the other tracks are written: one gate a line.
export function bandoLoopJson() {
  const t = bandoLoopTrack();
  const flat = (o) => JSON.stringify(o).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  return [
    '{',
    `  "id": "${t.id}",`,
    `  "map": "${t.map}",`,
    `  "name": "${t.name}",`,
    `  "class": "${t.class}",`,
    `  "start": ${flat(t.start)},`,
    '  "gates": [',
    t.gates.map((g) => '    ' + flat(g)).join(',\n'),
    '  ],',
    '  "flags": []',
    '}',
    '',
  ].join('\n');
}

const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qAxis = (axis, ang) => [axis[0] * Math.sin(ang / 2), axis[1] * Math.sin(ang / 2), axis[2] * Math.sin(ang / 2), Math.cos(ang / 2)];

// The pace ghost the page loads for the loop: the line itself from the first
// gate, at the indoor pace of tools/gen_whoop_ghosts.mjs (6 world units a
// second, 8 Hz, three laps), banked and pitched as sim-tracks.js
// makePaceGhost does, as the Warehouse's (tools/build_depot_loop.mjs). Up
// the shaft, where the line has no heading of its own, it keeps the last.
export function bandoLoopGhost() {
  const line = bandoLine(0.01), P = line.points, S = line.s, L = line.length;
  const speed = 6, hz = 8, laps = 3, v = speed / BANDO_WS;
  const s0 = line.gates[0].s;
  const at = (s) => {
    const u = ((s % L) + L) % L;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= u) lo = mid; else hi = mid; }
    const f = S[hi] > S[lo] ? (u - S[lo]) / (S[hi] - S[lo]) : 0;
    return P[lo].map((c, k) => c + (P[hi][k] - c) * f);
  };
  let held = 0;
  const heading = (s) => {
    const a = at(s - 0.05), b = at(s + 0.05);
    if (Math.hypot(b[0] - a[0], b[2] - a[2]) > 0.02) held = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    return held;
  };
  const T = laps * L / v, samples = [];
  for (let t = 0; t <= T + 1e-9; t += 1 / hz) {
    const s = s0 + t * v, p = at(s);
    const yaw = heading(s);
    let dyaw = heading(s + 0.3) - heading(s - 0.3);
    heading(s);
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const omega = dyaw / (0.6 / v);
    const bank = Math.max(-1.1, Math.min(1.1, Math.atan(omega * speed / 9.81)));
    const pitch = -0.35 - 0.1 * Math.abs(bank);
    const q = qMul(qAxis([0, 1, 0], yaw), qMul(qAxis([0, 0, 1], bank), qAxis([1, 0, 0], pitch)));
    const r2 = (x) => Math.round(x * 100) / 100 + 0, r3 = (x) => Math.round(x * 1000) / 1000 + 0;
    samples.push([Math.round(t * 1000), r2(p[0] * BANDO_WS), r2(p[1] * BANDO_WS), r2(p[2] * BANDO_WS), r3(q[0]), r3(q[1]), r3(q[2]), r3(q[3])]);
  }
  return { v: 1, phys: PHYSICS_VER, track: BANDO_TRACK_ID, name: 'PACE BOT', lapTime: Math.round(T * 1000), samples };
}

// ---- The loop, flown ----

// The autopilot's speed caps along the line, m/s: 7 on the open runs; 4
// from the parapet gap down the drop and through the courtyard to the van,
// from the rebar gap down through the floors and along the ground floor to
// the door, and from the shaft's door up the shaft and out over the roof; 5
// round the dead tree to the window. Each zone runs from `before` metres
// ahead of its first gate to `after` past its last, round the lap's end when
// it wraps (the shaft's: each lap ends up the shaft).
export const BANDO_FLY = Object.freeze({
  cap: 7, laps: 3,
  zones: Object.freeze([
    Object.freeze({ from: 'parapet gap', to: 'through the van', before: 2.5, after: 2, cap: 4 }),
    Object.freeze({ from: 'round the dead tree', to: 'second-floor window', before: 2, after: 2, cap: 5 }),
    Object.freeze({ from: 'rebar gap', to: 'door', before: 2.5, after: 2, cap: 4 }),
    Object.freeze({ from: 'shaft door', to: 'out of the shaft', before: 2.5, after: 1, cap: 4 }),
  ]),
});

// The plan: up off the pad, onto the line, the line `laps` times, and on
// through the first gate once more to close the last lap. Waypoints every
// 0.5 m.
export function bandoLoopPlan(laps) {
  const line = bandoLine(0.01), P = line.points, S = line.s, L = line.length;
  const first = (n) => line.gates.find((g) => g.name === n).s;
  const last = (n) => line.gates.filter((g) => g.name === n).pop().s;
  const mod = (s) => ((s % L) + L) % L;
  const zones = BANDO_FLY.zones.map((z) => ({ a: mod(first(z.from) - z.before), b: mod(last(z.to) + z.after), cap: z.cap }));
  const cap = (s) => {
    const u = mod(s);
    const z = zones.find((q) => (q.a <= q.b ? u >= q.a && u <= q.b : u >= q.a || u <= q.b));
    return z ? z.cap : BANDO_FLY.cap;
  };
  const at = (s) => {
    const u = ((s % L) + L) % L;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= u) lo = mid; else hi = mid; }
    return P[lo];
  };
  const wp = (p, v) => ({ p: [p[0], p[1], p[2]], v });
  const [px, py, pz] = BANDO_PLAY.start, floor = py - 0.35;
  const wps = [wp([px, floor + 0.01, pz], 1), wp([px, floor + 0.7, pz], 1.5), wp([px, P[0][1] - 0.05, pz + 0.6], 2.5)];
  for (let s = 1.2; s <= (laps || BANDO_FLY.laps) * L + line.gates[0].s + 2 + 1e-9; s += 0.5) wps.push(wp(at(s), cap(s)));
  return { wps, yaw0: Math.PI, limits: { lat: 12, acc: 9, dec: 13 }, vEnd: 2 };
}

// The race over flown samples (world units), as tools/rig_daily.mjs: passes
// in order from gate 0, misses, laps.
export function bandoRace(samples, gates) {
  const r = gates.map((g) => g.size * 0.8);
  const inside = (p, i) => Math.hypot(p.x - gates[i].x, p.y - gates[i].y, p.z - gates[i].z) < r[i];
  let next = 0, started = null;
  const laps = [], misses = [], passes = [];
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k - 1], b = samples[k];
    for (let i = 0; i < gates.length; i++) {
      if (!inside(b, i) || inside(a, i)) continue;
      if (i === next) {
        passes.push({ i, t: b.t });
        if (i === 0) { if (started !== null) laps.push(b.t - started); started = b.t; }
        next = (next + 1) % gates.length;
      } else if (started !== null) misses.push({ i, expected: next, t: b.t });
      break;
    }
  }
  return { laps, misses, passes };
}

// Flies the loop on the bf core (the Air65 on the owner's diff, The Bando's
// colliders and contact plant), from the pad on the roof: the samples, the
// race, any touch, and whether it stalled.
export async function flyBandoLoop(opts) {
  const o = opts || {};
  const { mapCore } = await import('./coach_rig_pilot.mjs');
  const { buildPath, sceneState, track, trackerMemory } = await import('./coach_rig_autopilot.mjs');
  const { toModule, WS } = await import('../sim-core-adapter.js');
  const core = o.core || await mapCore('bando');
  const [px, py, pz] = BANDO_PLAY.start, floor = py - 0.35;
  // Nose south to the first gate (+z): a half turn about the module's up.
  core.respawn(toModule({ x: px * WS, y: floor * WS + 0.15, z: pz * WS }, {}), { x: 0, y: 0, z: 1, w: 0 });
  core.setMode('angle');
  let wall = 0, stick = { r: 0, p: 0, y: 0, t: 0 };
  const events = [];
  const poll = () => {
    const ts = core.stamp(wall);
    if (ts !== null) core.input(stick, ts);
    core.advance(4, true, (e) => events.push(e));
    wall += 4;
    core.anchor(wall);
  };
  for (let i = 0; i < 100; i++) poll();
  core.setArm(true);
  for (let i = 0; i < 100 && !core.getState().armed; i++) poll();
  const armUs = core.simTimeUs;
  const path = buildPath(bandoLoopPlan(o.laps));
  const mem = trackerMemory();
  const samples = [];
  const t0 = core.getState().flightMs;
  let stalled = false, lastI = -1, lastMove = 0;
  for (;;) {
    const cs = core.getState();
    const t = (cs.flightMs - t0) / 1000;
    const m = cs.position;
    samples.push({ t, x: -m.y * WS, y: m.z * WS, z: -m.x * WS });
    const c = track(path, sceneState(cs), mem, { actualFF: true });
    if (mem.i > lastI) { lastI = mem.i; lastMove = t; }
    if (t - lastMove > 3) { stalled = true; break; }
    if (c.end || t > (o.limitS || 300)) break;
    stick = { r: c.r, p: c.p, y: c.y, t: c.t };
    poll();
  }
  const gates = bandoLoopTrack().gates;
  const contacts = events.filter((e) => e.kind === 'contact' && e.tUs >= armUs);
  return { samples, gates, contacts, armUs, stalled, ...bandoRace(samples, gates) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--fly')) {
    const f = await flyBandoLoop();
    const laps = f.laps.map((t) => t.toFixed(2) + ' s').join(', ');
    console.log(`flown: ${f.passes.length} passes, laps ${laps || 'none'}, ${f.misses.length} misses, ${f.contacts.length} touches${f.stalled ? ', STALLED' : ''}`);
    for (const m of f.misses.slice(0, 5)) console.log('  miss', JSON.stringify(m));
    for (const c of f.contacts.slice(0, 5)) {
      // Sample t and the arm time are on the core's clock, read on the same poll.
      const dt = (q) => Math.abs(q.t * 1e6 - (c.tUs - f.armUs));
      const s = f.samples.reduce((b, q) => (dt(q) < dt(b) ? q : b));
      console.log('  touch', JSON.stringify({ tUs: c.tUs, crashed: c.crashed, near: [s.x / BANDO_WS, s.y / BANDO_WS, s.z / BANDO_WS].map((v) => v.toFixed(2)) }));
    }
    if (f.stalled) { const s = f.samples[f.samples.length - 1]; console.log('  stalled near', [s.x / BANDO_WS, s.y / BANDO_WS, s.z / BANDO_WS].map((v) => v.toFixed(2)).join(', ')); }
  } else {
    const file = join(root, `tracks/${BANDO_TRACK_ID}.json`);
    writeFileSync(file, bandoLoopJson());
    const t = bandoLoopTrack();
    console.log(`${file}: ${t.gates.length} gates`);
    const g = bandoLoopGhost();
    writeFileSync(join(root, `ghosts/${BANDO_TRACK_ID}.json`), JSON.stringify(g));
    console.log(`ghosts/${BANDO_TRACK_ID}.json: ${g.samples.length} samples, ${g.lapTime} ms`);
  }
}
