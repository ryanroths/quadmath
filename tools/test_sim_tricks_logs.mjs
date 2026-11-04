// Ground truth for the trick detector on the bf core: the owner's real flights
// replayed through sim-core with the owner's diffs, the detector run on the
// sim's state as the page runs it (the core's onSample every 4 ms of sim
// time, tickState). The sticks come from the logs (tools/trick_log_fixture.mjs
// turned each log's rcCommand back into channels; the fixtures are in
// tools/fixtures/), so no log is needed to run this.
//
// What the gyro of each log shows (docs/sim-tricks-audit.md):
// - The Air65 freestyle (BTFL_..._20261023_143354, log 1, 124 s, acro): 10
//   rolls, 5 front flips, 5 back flips, 4-5 yaw spins. The replay must label
//   each within one.
// - The Fractal75 hover and punch flight (BTFL_..._CHOP_CHOP_20261103,
//   209 s): after each punch a slow 300-400 degree turnaround at up to
//   272 deg/s. None of them is a Roll.
//
// The replay is open loop: the pilot closed the loop on the real quad, so the
// sim's path drifts from the real one. As sim-core's tools/sim-vs-log.mjs
// does, the quad is armed on the floor and then flown 1000 m up, clear of
// everything; the detector's altitude is the height above that start.
//   node --test tools/test_sim_tricks_logs.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeDetector, resetDetector, stepDetector, TRICK_BY_ID } from '../sim-tricks.js';
import { createBfCore, emptyState, WS } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OPEN_AIR_M = 1000;
let wasm = null;

export async function replayFixture(file) {
  const fx = JSON.parse(gunzipSync(readFileSync(join(root, 'tools/fixtures', file))).toString());
  if (!wasm) wasm = WebAssembly.compile(readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')));
  const core = await createBfCore({
    SimCore,
    wasm: await wasm,
    airframe: JSON.parse(readFileSync(join(root, fx.airframe), 'utf8')),
    diff: readFileSync(join(root, fx.diff), 'utf8'),
    world: { floorZ: 0, boxes: [], triggers: [] },
  });
  core.respawn({ x: 0, y: 0, z: 0.02 }, { x: 0, y: 0, z: 0, w: 1 });
  core.setMode('acro');
  let wall = 0;
  let stick = { r: 0, p: 0, y: 0, t: 0 };
  const poll = (onSample) => {
    const ts = core.stamp(wall);
    if (ts !== null) core.input(stick, ts);
    core.advance(4, true, null, onSample);
    wall += 4;
    core.anchor(wall);
  };
  for (let i = 0; i < 100; i++) poll();
  core.setArm(true);
  for (let i = 0; i < 150 && !core.getState().armed; i++) poll();
  assert.ok(core.getState().armed, fx.log + ': armed on the floor');
  core.teleport({ x: 0, y: 0, z: OPEN_AIR_M });

  const d = makeDetector();
  const hits = [];
  const st = emptyState();
  const sample = { ws: WS, colliders: null };
  let first = true;
  let t = 0;
  const onSample = () => {
    const s = core.tickState(st);
    const p = s.position, v = s.velocity, q = s.quaternion, w = s.omega;
    sample.qx = q.x; sample.qy = q.y; sample.qz = q.z; sample.qw = q.w;
    sample.ox = w.x; sample.oy = w.y; sample.oz = w.z;
    sample.wx = -p.y * WS; sample.wy = (p.z - OPEN_AIR_M) * WS; sample.wz = -p.x * WS;   // toScene
    sample.alt = p.z - OPEN_AIR_M;
    sample.vx = v.x; sample.vy = v.y; sample.vz = v.z; sample.speed = Math.hypot(v.x, v.y, v.z);
    sample.clearance = s.clearance; sample.armed = s.armed; sample.throttle = stick.t;
    sample.sr = stick.r; sample.sp = stick.p; sample.sy = stick.y;
    if (first) { resetDetector(d, sample); d.lockout = 0; first = false; return; }
    const ev = stepDetector(d, sample, 0.004);
    if (ev && TRICK_BY_ID[ev]) hits.push({ t: +t.toFixed(2), id: ev, dir: ev === 'flip' ? (d.lastDir < 0 ? 'back' : 'front') : null, why: d.lastWhy });
  };
  // One 4 ms poll per fixture slot: rows are [slots since the last row,
  // ch0..ch3 deltas, mode mask delta]; the mask's ARM bit drives the arm.
  const data = fx.data;
  const ch = [0, 0, 0, 0];
  let mask = 0, ri = 0, next = data[0], armed = true;
  const slots = Math.ceil((fx.duration_s * 1e6) / fx.slotUs);
  for (let s = 0; s < slots; s++) {
    while (ri < fx.rows && s >= next) {
      const b = ri * 6;
      for (let a = 0; a < 4; a++) ch[a] += data[b + 1 + a];
      mask += data[b + 5];
      ri++;
      next = ri < fx.rows ? next + data[ri * 6] : Infinity;
    }
    stick = { r: (ch[0] - 1500) / 500, p: (ch[1] - 1500) / 500, y: (ch[2] - 1500) / 500, t: (ch[3] - 1000) / 1000 };
    const want = (mask & 1) === 1;
    if (want !== armed) { core.setArm(want); armed = want; }
    t = (s * fx.slotUs) / 1e6;
    poll(onSample);
  }
  return { fx, hits, zEnd: core.getState().position.z };
}

function tally(hits) {
  const n = { roll: 0, front: 0, back: 0, yawspin: 0 };
  for (const h of hits) {
    if (h.id === 'roll') n.roll++;
    else if (h.id === 'flip') n[h.dir]++;
    else if (h.id === 'yawspin') n.yawspin++;
  }
  return n;
}

const near = (got, want, name) => assert.ok(Math.abs(got - want) <= 1, name + ': ' + got + ', the log has ' + want);

test('Air65 freestyle replayed on the bf core: rolls, flips both ways and yaw spins within one of the log', async () => {
  const r = await replayFixture('air65-freestyle-20261023-log1.replay.json.gz');
  assert.ok(r.zEnd > 100, 'flown in open air (z ' + r.zEnd.toFixed(0) + ' m)');
  const n = tally(r.hits);
  const list = r.hits.map((h) => h.t + ' ' + h.id + (h.dir ? ' ' + h.dir : '')).join(', ');
  near(n.roll, 10, 'rolls (' + list + ')');
  near(n.front, 5, 'front flips (' + list + ')');
  near(n.back, 5, 'back flips (' + list + ')');
  assert.ok(n.yawspin >= 3 && n.yawspin <= 6, 'yaw spins ' + n.yawspin + ', the log has 4-5 (' + list + ')');
});

test('Fractal75 punch flight replayed on the bf core: no turnaround is a Roll', async () => {
  const r = await replayFixture('fractal75-20261103.replay.json.gz');
  assert.ok(r.zEnd > 100, 'flown in open air (z ' + r.zEnd.toFixed(0) + ' m)');
  const rolls = r.hits.filter((h) => h.id === 'roll');
  assert.equal(rolls.length, 0, 'rolls: ' + rolls.map((h) => h.t + ' ' + h.why.replace(/\n/g, ' ')).join(' | '));
});

test('the fixtures are the logs they name, at 4 ms', () => {
  for (const [file, log, index, quad] of [
    ['air65-freestyle-20261023-log1.replay.json.gz', 'BTFL_BLACKBOX_LOG_AIR65_RYFLY_20261023_143354_BETAFPVG473.BBL', 1, 'air65'],
    ['fractal75-20261103.replay.json.gz', 'BTFL_BLACKBOX_LOG_CHOP_CHOP_20261103_111727_BETAFPVG473.BBL', 0, 'fractal75'],
  ]) {
    const fx = JSON.parse(gunzipSync(readFileSync(join(root, 'tools/fixtures', file))).toString());
    assert.equal(fx.kind, 'quadmath-trick-replay');
    assert.equal(fx.log, log);
    assert.equal(fx.index, index);
    assert.equal(fx.quad, quad);
    assert.equal(fx.slotUs, 4000);
    assert.equal(fx.data.length, fx.rows * 6);
  }
});
