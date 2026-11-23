// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The 85 on classic physics (the js core) is unchanged by sim-core v0.9.0 and
// PHYS_VER 8. That release dropped the bounce x2 and the wall x1.37 on the bf
// core only (sim-core-adapter.js contactPlant now scales the crash threshold
// alone, and BOUNCE_MAPS lost the wall factor the js core never read). The js
// core reads BOUNCE_MAPS through resolveDuctHit, as sim.html applyDuctHit
// does: the crash x4 and the bounce x2 stay on the Rig, the House, the
// Warehouse and the Bando.
//   - Each bounce map is { crash: 4, bounce: 2 }, as before.
//   - Every duct hit's answer for the 85's build on each bounce map (and on
//     no map), over a grid of speeds, normals, floor flags, spins and the
//     bounce settings, is byte for byte what main gave at PHYS_VER 7
//     (62be60c): one SHA-256 over them all, and a few rows spelled out.
//   - The 85 has no sim-core plant (sim.html BF_CLASSES): it flies the js
//     core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveDuctHit, BOUNCE_MAPS } from '../sim-whoop.js';
import { classDefault } from '../sim-build.js';

// SHA-256 of the grid's answers at 62be60c (main, PHYS_VER 7).
const MAIN_GRID_SHA256 = '4689da367c48d033767324272f838a2d6b498df161638bc8ba2a83a03ef25c0b';

export function classicGrid(resolve, maps) {
  const build = classDefault(85);
  const rows = [];
  const normals = [[0, 1, 0], [1, 0, 0], [0, 0, -1], [0, -1, 0], [0.6, 0.8, 0]];
  const settings = [undefined, { bounce: false }, { bounceStr: 0.4 }, { crashSpeed: 6 }];
  for (const map of [null, 'rig', 'house', 'depot', 'bando']) {
    for (const [nx, ny, nz] of normals) {
      for (const speed of [0.5, 2, 4.5, 9, 14, 20, 30, 45]) {
        for (const floor of [false, true]) {
          for (const set of settings) {
            const vel = { x: -nx * speed + 0.7 * nz, y: -ny * speed + 0.3, z: -nz * speed - 0.5 * nx };
            const r = resolve({ vel, omega: { x: 0.4, y: -1.1, z: 2.3 }, normal: { x: nx, y: ny, z: nz }, floor }, build, set, map ? maps[map] : undefined);
            rows.push([map, nx, ny, nz, speed, floor, set ? JSON.stringify(set) : '-', r.vel.x, r.vel.y, r.vel.z, r.omega.x, r.omega.y, r.omega.z, r.crashed, r.into, r.rest]);
          }
        }
      }
    }
  }
  return rows;
}
const sha = (rows) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');

test('the 85 on classic physics: bounce maps and every duct hit as at PHYS_VER 7', () => {
  for (const id of ['rig', 'house', 'depot', 'bando']) {
    assert.equal(BOUNCE_MAPS[id].crash, 4, id + ': the crash threshold x4');
    assert.equal(BOUNCE_MAPS[id].bounce, 2, id + ': the bounce x2');
  }
  const rows = classicGrid(resolveDuctHit, BOUNCE_MAPS);
  assert.equal(rows.length, 5 * 5 * 8 * 2 * 4);
  // A few spelled out: the Rig at 9 world units/s into a wall uncrashed
  // (crash x4), at 45 crashed; no map at 9 crashed.
  const at = (map, nx, speed, floor, set = '-') => rows.find((r) => r[0] === map && r[1] === nx && r[2] === 0 && r[4] === speed && r[5] === floor && r[6] === set);
  assert.equal(at('rig', 1, 9, false)[13], false);
  assert.equal(at('rig', 1, 45, false)[13], true);
  assert.equal(at(null, 1, 9, false)[13], true);
  assert.equal(sha(rows), MAIN_GRID_SHA256, 'every answer as on main at PHYS_VER 7');
});

test('the 85 has no sim-core plant: it flies the js core', () => {
  const html = readFileSync(new URL('../sim.html', import.meta.url), 'utf8');
  const classes = html.slice(html.indexOf('const BF_CLASSES={'), html.indexOf('};', html.indexOf('const BF_CLASSES={')));
  assert.match(classes, /whoop65:/);
  assert.match(classes, /whoop75:/);
  assert.doesNotMatch(classes, /whoop85/);
});
