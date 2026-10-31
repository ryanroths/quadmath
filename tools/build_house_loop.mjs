// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Writes tracks/house-loop.json from The House's line (sim-maps.js
// houseLine): each gate where the line puts it, facing along the line, in
// world units; the start pad from HOUSE_PLAY. Writes its hosted pace ghost,
// ghosts/house-loop.json, along the same line. Run it again after a change to
// the line, then check it with node --test tools/test_sim_house.mjs:
//   node tools/build_house_loop.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOUSE_PLAY, HOUSE_WS, houseLine } from '../sim-maps.js';
import { PHYSICS_VER } from '../sim-whoop.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;

export function houseLoopTrack() {
  const line = houseLine(0.01);
  const w = (v) => r4(v * HOUSE_WS);
  const [sx, sy, sz] = HOUSE_PLAY.start;
  return {
    id: 'house-loop',
    map: 'house',
    name: 'House Loop',
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
export function houseLoopJson() {
  const t = houseLoopTrack();
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
// makePaceGhost does. A ghost on the gates' own spline would cut through the
// House's walls.
export function houseLoopGhost() {
  const line = houseLine(0.01), P = line.points, S = line.s, L = line.length;
  const speed = 6, hz = 8, laps = 3, v = speed / HOUSE_WS;
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
    samples.push([Math.round(t * 1000), r2(p[0] * HOUSE_WS), r2(p[1] * HOUSE_WS), r2(p[2] * HOUSE_WS), r3(q[0]), r3(q[1]), r3(q[2]), r3(q[3])]);
  }
  return { v: 1, phys: PHYSICS_VER, track: 'house-loop', name: 'PACE BOT', lapTime: Math.round(T * 1000), samples };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(root, 'tracks/house-loop.json');
  writeFileSync(file, houseLoopJson());
  const t = houseLoopTrack();
  console.log(`${file}: ${t.gates.length} gates`);
  const g = houseLoopGhost();
  writeFileSync(join(root, 'ghosts/house-loop.json'), JSON.stringify(g));
  console.log(`ghosts/house-loop.json: ${g.samples.length} samples, ${g.lapTime} ms`);
}
