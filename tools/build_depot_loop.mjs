// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Writes tracks/depot-loop.json from The Warehouse's line (sim-maps.js
// depotLine): each gate where the line puts it, facing along the line, in
// world units; the start pad from DEPOT_PLAY. Writes its hosted pace ghost,
// ghosts/depot-loop.json, along the same line. Run it again after a change to
// the line, then check it with node --test tools/test_sim_depot.mjs:
//   node tools/build_depot_loop.mjs
// Also flies the loop: flyDepotLoop() puts the Coach autopilot
// (tools/coach_rig_autopilot.mjs) on the bf core with The Warehouse's
// colliders and flies the line from the pad, three laps.
//   node tools/build_depot_loop.mjs --fly
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPOT_PLAY, DEPOT_WS, depotLine } from '../sim-maps.js';
import { PHYSICS_VER } from '../sim-whoop.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;

export function depotLoopTrack() {
  const line = depotLine(0.01);
  const w = (v) => r4(v * DEPOT_WS);
  const [sx, sy, sz] = DEPOT_PLAY.start;
  return {
    id: 'depot-loop',
    map: 'depot',
    name: 'Warehouse Loop',
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
export function depotLoopJson() {
  const t = depotLoopTrack();
  const gate = (g) => '    ' + JSON.stringify(g).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  const start = JSON.stringify(t.start).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  return [
    '{',
    `  "id": "${t.id}",`,
    `  "map": "${t.map}",`,
    `  "name": "${t.name}",`,
    `  "class": "${t.class}",`,
    `  "start": ${start},`,
    '  "gates": [',
    t.gates.map(gate).join(',\n'),
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
// makePaceGhost does, as the House's (tools/build_house_loop.mjs).
export function depotLoopGhost() {
  const line = depotLine(0.01), P = line.points, S = line.s, L = line.length;
  const speed = 6, hz = 8, laps = 3, v = speed / DEPOT_WS;
  const s0 = line.gates[0].s;
  const at = (s) => {
    const u = ((s % L) + L) % L;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= u) lo = mid; else hi = mid; }
    const f = S[hi] > S[lo] ? (u - S[lo]) / (S[hi] - S[lo]) : 0;
    return P[lo].map((c, k) => c + (P[hi][k] - c) * f);
  };
  const heading = (s) => { const a = at(s - 0.05), b = at(s + 0.05); return Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])); };
  const T = laps * L / v, samples = [];
  for (let t = 0; t <= T + 1e-9; t += 1 / hz) {
    const s = s0 + t * v, p = at(s);
    const yaw = heading(s);
    let dyaw = heading(s + 0.3) - heading(s - 0.3);
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const omega = dyaw / (0.6 / v);
    const bank = Math.max(-1.1, Math.min(1.1, Math.atan(omega * speed / 9.81)));
    const pitch = -0.35 - 0.1 * Math.abs(bank);
    const q = qMul(qAxis([0, 1, 0], yaw), qMul(qAxis([0, 0, 1], bank), qAxis([1, 0, 0], pitch)));
    const r2 = (x) => Math.round(x * 100) / 100 + 0, r3 = (x) => Math.round(x * 1000) / 1000 + 0;
    samples.push([Math.round(t * 1000), r2(p[0] * DEPOT_WS), r2(p[1] * DEPOT_WS), r2(p[2] * DEPOT_WS), r3(q[0]), r3(q[1]), r3(q[2]), r3(q[3])]);
  }
  return { v: 1, phys: PHYSICS_VER, track: 'depot-loop', name: 'PACE BOT', lapTime: Math.round(T * 1000), samples };
}

// ---- The loop, flown ----

// The autopilot's speed caps along the line, m/s: 4 through the threaded
// gaps (the doors and the curtain, under the forks, the rack, between the
// pallet stacks, the trusses, the hatch), 7 elsewhere; it slows for the
// curves itself.
const THREADED = ['roll-up door', 'chain curtain', 'under the forks', 'rack gap', 'pallet stacks', 'truss', 'over the rail', 'the hatch'];
export const DEPOT_FLY = Object.freeze({ cap: 7, threaded: 4, reach: 2.5, laps: 3 });

// The plan: off the pad, onto the line, the line `laps` times, and on through
// the first gate once more to close the last lap. Waypoints every 0.5 m.
export function depotLoopPlan(laps) {
  const line = depotLine(0.01), P = line.points, S = line.s, L = line.length;
  const slow = line.gates.filter((g) => THREADED.includes(g.name)).map((g) => g.s);
  const cap = (s) => (slow.some((g) => Math.abs(((s - g + L / 2) % L + L) % L - L / 2) < DEPOT_FLY.reach) ? DEPOT_FLY.threaded : DEPOT_FLY.cap);
  const at = (s) => P[Math.min(P.length - 1, Math.round(((s % L) + L) % L / 0.01))];
  const wp = (p, v) => ({ p: [p[0], p[1], p[2]], v });
  const [px, , pz] = DEPOT_PLAY.start;
  const wps = [wp([px, 0.01, pz], 1), wp([px, 0.55, pz], 1.5), wp([px + 1, 1.1, pz], 2.5)];
  for (let s = 2.0; s <= (laps || DEPOT_FLY.laps) * L + line.gates[0].s + 2 + 1e-9; s += 0.5) wps.push(wp(at(s), cap(s)));
  return { wps, yaw0: -Math.PI / 2, limits: { lat: 12, acc: 9, dec: 13 }, vEnd: 2 };
}

// The race over flown samples (world units), as tools/rig_daily.mjs: passes
// in order from gate 0, misses, laps.
export function depotRace(samples, gates) {
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

// Flies the loop on the bf core (the Air65 on the owner's diff, The
// Warehouse's colliders and contact plant), from the pad: the samples, the
// race, any touch, and whether it stalled.
export async function flyDepotLoop(opts) {
  const o = opts || {};
  const { mapCore } = await import('./coach_rig_pilot.mjs');
  const { buildPath, sceneState, track, trackerMemory } = await import('./coach_rig_autopilot.mjs');
  const { toModule, WS } = await import('../sim-core-adapter.js');
  const core = o.core || await mapCore('depot');
  const [px, , pz] = DEPOT_PLAY.start;
  // Nose down the centre run (+x).
  const h = (Math.PI / 2 + Math.PI) * 0.5;
  core.respawn(toModule({ x: px * WS, y: 0.15, z: pz * WS }, {}), { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) });
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
  const path = buildPath(depotLoopPlan(o.laps));
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
  const gates = depotLoopTrack().gates;
  const contacts = events.filter((e) => e.kind === 'contact' && e.tUs >= armUs);
  return { samples, gates, contacts, armUs, stalled, ...depotRace(samples, gates) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--fly')) {
    const f = await flyDepotLoop();
    const laps = f.laps.map((t) => t.toFixed(2) + ' s').join(', ');
    console.log(`flown: ${f.passes.length} passes, laps ${laps || 'none'}, ${f.misses.length} misses, ${f.contacts.length} touches${f.stalled ? ', STALLED' : ''}`);
    for (const m of f.misses.slice(0, 5)) console.log('  miss', JSON.stringify(m));
    for (const c of f.contacts.slice(0, 5)) {
      // Sample t and the arm time are on the core's clock, read on the same poll.
      const dt = (q) => Math.abs(q.t * 1e6 - (c.tUs - f.armUs));
      const s = f.samples.reduce((b, q) => (dt(q) < dt(b) ? q : b));
      console.log('  touch', JSON.stringify({ tUs: c.tUs, crashed: c.crashed, near: [s.x / DEPOT_WS, s.y / DEPOT_WS, s.z / DEPOT_WS].map((v) => v.toFixed(2)) }));
    }
  } else {
    const file = join(root, 'tracks/depot-loop.json');
    writeFileSync(file, depotLoopJson());
    const t = depotLoopTrack();
    console.log(`${file}: ${t.gates.length} gates`);
    const g = depotLoopGhost();
    writeFileSync(join(root, 'ghosts/depot-loop.json'), JSON.stringify(g));
    console.log(`ghosts/depot-loop.json: ${g.samples.length} samples, ${g.lapTime} ms`);
  }
}
