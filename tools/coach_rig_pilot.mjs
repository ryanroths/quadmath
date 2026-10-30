// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The Rig's coach lines, flown: an autopilot on the bf core (the vendored
// quadmath-sim-core, the Air65 on the owner's diff, the Rig's contact plant),
// in Node, on the Rig's colliders as the page sends them (buildMap, then
// bfWorld's boxToModule). Each drill starts as the page starts it: the quad
// placed on the drill's pad (drillSpawn, placeQuadAt), disarmed for 400 ms,
// then armed in angle mode. From the arm the pilot flies a path through the
// drill's gates: sticks every 4 ms (the page's input poll), each stamped as
// the page stamps them, the core advanced 4 ms between polls, so every poll
// sees the state it acts on. The samples are the coach's (world units, t
// from the arm), scored by sim-coach.js's own chain scorer. The pilot itself
// is tools/coach_rig_autopilot.mjs. Deterministic: the same build flies the
// same line to the tick.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';
import { createBfCore, contactPlant, boxToModule, toModule, WS } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import { BOUNCE_MAPS } from '../sim-whoop.js';
import { defaultSpec, drillSpawn, chainStart, chainStep, chainResult } from '../sim-coach.js';
import { buildPath, sceneState, track, trackerMemory, PLANS } from './coach_rig_autopilot.mjs';

export { PLANS };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// buildMap paints canvas textures: a canvas that draws nothing is enough in
// Node, as tools/test_sim_rig.mjs does.
function installDomStub() {
  if (globalThis.document && globalThis.document.createElement) return;
  globalThis.document = {
    createElement: () => {
      const cv = { width: 0, height: 0 };
      const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
      });
      cv.getContext = () => ctx;
      return cv;
    },
  };
}

// The Rig as the page's bfWorld() sends it: every collider of buildMap, as
// module-frame boxes.
export async function rigWorld() {
  installDomStub();
  const { buildMap } = await import('../sim-maps.js');
  const built = buildMap(THREE, 'rig');
  const ok = (v) => Number.isFinite(v) && Math.abs(v) <= 2000;
  const boxes = [];
  for (const bb of built.colliders) {
    if (bb.isEmpty()) continue;
    const b = boxToModule(bb);
    if (b.min.every(ok) && b.max.every(ok)) boxes.push(b);
  }
  return { floorZ: 0, boxes, triggers: [] };
}

// The bf core as the page loads it on the Rig.
export async function rigCore() {
  const airframe = JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8'));
  const diff = readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8');
  return createBfCore({
    SimCore,
    wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: contactPlant(airframe, BOUNCE_MAPS.rig),
    diff,
    world: await rigWorld(),
  });
}

// ---- One drill, flown ----

// The page's sample for the coach (sim-coach.js sampleFromState), from the
// core's state: world units, t from the arm.
function coachSample(cs, t, crashed) {
  const p = toSceneW(cs.position), v = toSceneW(cs.velocity);
  return {
    t, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z,
    roll: cs.attitude.roll, pitch: cs.attitude.pitch, yaw: 0,
    armed: cs.armed, crashed,
  };
}
function toSceneW(m) {
  return { x: -m.y * WS, y: m.z * WS, z: -m.x * WS };
}

export async function flyDrill(id, plan, opts) {
  const o = opts || {};
  const core = o.core || await rigCore();
  const spec = defaultSpec(id);
  const pad = drillSpawn(id, spec);
  // placeQuadAt: y at least 0.15, the pad's heading as a yaw about up.
  const pos = toModule({ x: pad.x, y: Math.max(0.15, pad.y), z: pad.z }, {});
  const h = pad.yaw ? pad.yaw * 0.5 : 0;
  core.respawn(pos, { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) });
  core.setMode('angle');
  let wall = 0;
  let stick = { r: 0, p: 0, y: 0, t: 0 };
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
  if (!core.getState().armed) throw new Error(id + ': did not arm');
  const armUs = core.simTimeUs;
  const path = buildPath(plan);
  const mem = trackerMemory();
  const samples = [];
  const st = chainStart();
  const armedAt = core.getState().flightMs;
  let crashed = 0;
  let after = null;
  const limitMs = (o.limitS || 40) * 1000;
  for (;;) {
    const cs = core.getState();
    const t = (cs.flightMs - armedAt) / 1000;
    const crash = events.some((e) => e.kind === 'contact' && e.crashed && !e.seen);
    for (const e of events) e.seen = true;
    if (crash) crashed++;
    const smp = coachSample(cs, t, crash);
    samples.push(smp);
    chainStep(st, spec, smp);
    if (st.done != null && after === null) after = t;
    if (after !== null && t - after >= (o.tailS == null ? 0.3 : o.tailS)) break;
    if (t * 1000 > limitMs) break;
    const s = sceneState(cs);
    const c = track(path, s, mem, { land: plan.land, maxTilt: plan.maxTilt });
    stick = { r: c.r, p: c.p, y: c.y, t: c.t };
    if (o.trace && samples.length % 25 === 0) o.trace(t, s, c, mem, path[mem.i]);
    poll();
  }
  const result = chainResult(st, spec);
  // Touches from the arm on (the spawn's drop onto the pad is before it).
  const contacts = events.filter((e) => e.kind === 'contact' && e.tUs >= armUs);
  return { id, spec, samples, result, contacts, crashed, path };
}
