// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The Rig's generated Daily and Boards courses: their segments (the six Coach
// drills as race segments), the links between them, and the flights that
// prove them. sim-retention.js holds the result as data (RIG_SEGMENTS,
// RIG_LINKS), the Worker bundles it, and its generator chains the segments
// by the day's seed (rigCourseFor). After a change to the Rig or a segment,
// plan the links again (a few minutes) and write the times; after a change to
// the vendored sim-core, the times only. Then stamp and check:
//   node tools/rig_daily.mjs --plan --write
//   node tools/rig_daily.mjs --write
//   python scripts/ci/stamp_asset_cache.py
//   node --test tools/test_sim_rig_daily.mjs
//
// A segment is a drill as a race flies it: a link gate (the line in, the
// gate the link to it ends through), then the drill's gates as rings. A race
// ring is entered once, so a drill gate the drill flies twice keeps one ring:
// the tower is its climb (bays 1, 2, 3, over the top), the straight's way back
// has a ring of its own beside the way out, and the loft dive, a race with no
// landing, leaves low under the loft. The path through each is the Coach
// autopilot's (tools/coach_rig_autopilot.mjs PLANS), from the link gate on.
//
// A link is planned here, once, for every ordered pair: from one segment's
// exit to the next one's link gate, through the Rig's free space (its boxes
// grown 32 cm, the walls 35 cm), clear of every gate but its own end by 30 cm
// more than the gate's radius, so any chain of segments passes its gates in
// order and no other. Each segment has a start pad on the floor behind its
// link gate: a course starts on its first segment's. Every loop of 3 to 5
// segments is then flown, and its lap written down: the generator draws from
// those.
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, Worker } from 'node:worker_threads';
import { RIG_PLAY } from '../sim-maps.js';
import { rigCore } from './coach_rig_pilot.mjs';
import { buildPath, sceneState, track as steer, trackerMemory } from './coach_rig_autopilot.mjs';
import { toModule, WS } from '../sim-core-adapter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const LIMITS = { lat: 12, acc: 9, dec: 13 };
const wp = (x, y, z, v) => ({ p: [x, y, z], v });

// ---- The segments, metres, scene axes ----
// gates: [name, [x, y, z], size (m, the ring; its radius 0.8 of it)], the
// first the link gate. wps: the autopilot's path from the link gate (its
// first point) to the exit (its last).
const TX = -2.9, TZ = 1.0; // the tower's centre (sim-maps.js RIG_PLAY.tower)
const TW = TZ - 0.6, TE = TZ + 0.6, xW = TX - 0.95, xE = TX + 0.95, apW = TX - 1.55, apE = TX + 1.55;
export const SEGMENTS = Object.freeze({
  straight: {
    name: 'Straight',
    gates: [['into the straight', [-5.6, 1.2, -5.6], 0.5], ['straight', [-4.35, 1.2, -5.6], 0.55],
      ['far end', [6.0, 1.2, -5.6], 0.55], ['straight back', [-2.0, 1.2, -4.0], 0.55]],
    wps: [wp(-5.6, 1.2, -5.6, 6), wp(-4.35, 1.2, -5.6, 9.5), wp(3.5, 1.2, -5.6, 9.5), wp(6.0, 1.2, -5.6, 9),
      wp(6.99, 1.2, -4.7, 9), wp(6.0, 1.2, -3.8, 9), wp(2.0, 1.2, -4.0, 9.5), wp(-2.0, 1.2, -4.0, 8), wp(-3.4, 1.2, -4.0, 6)],
  },
  crates: {
    name: 'Crates',
    gates: [['into the crates', [9, 1.0, -2.5], 0.5], ['wall 1 · 25 cm', [9, 1.0, -0.8], 0.4],
      ['wall 2 · 21 cm', [9, 1.0, 0], 0.4], ['wall 3 · 18 cm', [9, 1.0, 0.8], 0.4]],
    wps: [wp(9, 1.0, -2.5, 2.6), wp(9, 1.0, -1.6, 2.6), wp(9, 1.0, -0.8, 2.6), wp(9, 1.0, 0, 2.6),
      wp(9, 1.0, 0.8, 2.6), wp(9, 1.0, 1.9, 3)],
  },
  tunnel: {
    name: 'Tunnel',
    gates: [['into the tunnel', [6.3, 1.2, 5.6], 0.5], ['tunnel in', [4.05, 1.2, 5.6], 0.3], ['tunnel out', [0.05, 1.2, 5.6], 0.3]],
    wps: [wp(6.3, 1.2, 5.6, 3), wp(5.5, 1.2, 5.6, 3.4), wp(4.05, 1.2, 5.6, 3.6), wp(2.05, 1.2, 5.6, 3.6),
      wp(0.05, 1.2, 5.6, 3.6), wp(-1.2, 1.2, 5.6, 3.6)],
  },
  tower: {
    name: 'Tower',
    gates: [['into the tower', [-0.9, 0.82, TW], 0.5], ['bay 1', [TX, 0.82, TW], 0.5], ['bay 2', [TX, 2.52, TE], 0.5],
      ['bay 3', [TX, 4.22, TW], 0.5], ['over deck 3', [TX, 5.55, TE], 0.5]],
    wps: [wp(-0.9, 0.82, TW, 3.2), wp(xE, 0.82, TW, 3.2), wp(xW, 0.82, TW, 3.2), wp(apW, 1.67, TZ, 3.2),
      wp(xW, 2.52, TE, 3.2), wp(xE, 2.52, TE, 3.2), wp(apE, 3.37, TZ, 3.2), wp(xE, 4.22, TW, 3.2),
      wp(xW, 4.22, TW, 3.2), wp(apW, 4.885, TZ, 3.2), wp(xW, 5.55, TE, 3.2), wp(xE, 5.55, TE, 3.2), wp(-0.7, 5.5, TE, 3.2)],
  },
  pipes: {
    name: 'Pipes',
    gates: [['into the pipes', [-7.6, 2.2, 6.5], 0.5], ['over the pipes', [-9.05, 5.45, 3.0], 0.375],
      ['pipe slit', [-9.05, 4.875, 0.4], 0.32], ['under the pipes', [-9.05, 3.6, -1.6], 0.4]],
    wps: [wp(-7.6, 2.2, 6.5, 2.6), wp(-8.4, 2.6, 6.5, 2.4), wp(-9.05, 3.4, 5.9, 2.4), wp(-9.05, 4.4, 5.2, 2.6), wp(-9.05, 5.4, 4.5, 2.6),
      wp(-9.05, 5.45, 3.0, 2.6), wp(-9.05, 5.35, 1.7, 2.0), wp(-9.05, 4.875, 0.6, 1.8), wp(-9.05, 4.2, -0.2, 2.2),
      wp(-9.05, 3.6, -1.6, 2.2), wp(-8.6, 3.5, -2.0, 2.2), wp(-7.4, 3.5, -1.9, 2.6)],
  },
  loft: {
    name: 'Loft',
    gates: [['into the loft', [-7.4, 3.3, -2.85], 0.5], ['loft hole', [-9.05, 2.75, -2.85], 0.5], ['under the loft', [-9.05, 1.1, -4.3], 0.5]],
    wps: [wp(-7.4, 3.3, -2.85, 2.2), wp(-8.3, 3.25, -2.85, 1.6), wp(-9.05, 2.75, -2.85, 1.5), wp(-9.15, 1.8, -3.4, 1.6),
      wp(-9.05, 1.1, -4.3, 2.2), wp(-8.9, 1.0, -5.0, 2.6)],
  },
});
export const SEGMENT_IDS = Object.freeze(Object.keys(SEGMENTS));

// ---- Free space ----
const ROOM = RIG_PLAY.room; // 20 x 15 x 6 m, centred on x and z, floor at 0
const HX = ROOM.w / 2, HZ = ROOM.d / 2, H = ROOM.h;
const BOX_GROW = 0.32, WALL = 0.35, FLOOR = 0.4, SPHERE_GROW = 0.3;
const CELL = 0.1;
const NX = Math.round(ROOM.w / CELL), NY = Math.round(H / CELL), NZ = Math.round(ROOM.d / CELL);
const gateR = (size) => size * 0.8;

function boxDist(p, b) {
  const d = [0, 1, 2].map((k) => Math.max(b.min[k] - p[k], 0, p[k] - b.max[k]));
  return Math.hypot(d[0], d[1], d[2]);
}
function geomBlocked(p) {
  if (p[0] < -HX + WALL || p[0] > HX - WALL || p[2] < -HZ + WALL || p[2] > HZ - WALL) return true;
  if (p[1] < FLOOR || p[1] > H - WALL) return true;
  return RIG_PLAY.boxes.some((b) => boxDist(p, b) < BOX_GROW);
}
// Whether grid cell n ((i * NY + j) * NZ + k) is blocked, its centre tested
// the first time it is asked (the whole grid takes a quarter of a minute; a
// flight asks for a few hundred cells). Outside the grid: undefined.
let GEOM = null;
function geomAt(n) {
  if (!GEOM) GEOM = new Uint8Array(NX * NY * NZ);
  if (!(n >= 0 && n < GEOM.length)) return undefined;
  if (!GEOM[n]) GEOM[n] = geomBlocked(cellP(Math.floor(n / (NY * NZ)), Math.floor(n / NZ) % NY, n % NZ)) ? 2 : 1;
  return GEOM[n] === 2;
}
const cellP = (i, j, k) => [-HX + (i + 0.5) * CELL, (j + 0.5) * CELL, -HZ + (k + 0.5) * CELL];
const cellOf = (p) => [Math.floor((p[0] + HX) / CELL), Math.floor(p[1] / CELL), Math.floor((p[2] + HZ) / CELL)];

// Every gate but `keep` (a gate name `seg:index`), as obstacle spheres.
function spheres(keep) {
  const out = [];
  for (const [id, s] of Object.entries(SEGMENTS)) {
    s.gates.forEach(([, p, size], i) => { if (id + ':' + i !== keep) out.push({ p, r: gateR(size) + SPHERE_GROW }); });
  }
  return out;
}
function makeBlocked(keep) {
  const S = spheres(keep);
  return (p) => {
    const c = cellOf(p);
    if (c[0] < 0 || c[1] < 0 || c[2] < 0 || c[0] >= NX || c[1] >= NY || c[2] >= NZ) return true;
    if (geomAt((c[0] * NY + c[1]) * NZ + c[2])) return true;
    return S.some((s) => Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]) < s.r);
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulv = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lenv = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mulv(a, 1 / (lenv(a) || 1));

function lineClear(a, b, blocked) {
  const n = Math.max(1, Math.ceil(lenv(sub(b, a)) / 0.03));
  for (let i = 0; i <= n; i++) if (blocked(addv(a, mulv(sub(b, a), i / n)))) return false;
  return true;
}

// A* on the grid, 26 neighbours, from a to b.
function astar(a, b, blocked) {
  const key = (c) => (c[0] * NY + c[1]) * NZ + c[2];
  const s = cellOf(a), g = cellOf(b), gk = key(g);
  const open = [[0, s]], gScore = new Map([[key(s), 0]]), from = new Map();
  const h = (c) => CELL * Math.hypot(c[0] - g[0], c[1] - g[1], c[2] - g[2]);
  const closed = new Set();
  const dirs = [];
  // Climbing costs half as much again as going level: a link rises gently
  // where there is room.
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
    if (dx || dy || dz) dirs.push([dx, dy, dz, CELL * Math.hypot(dx, 1.5 * dy, dz)]);
  }
  while (open.length) {
    // A binary heap on f.
    const [, c] = heapPop(open);
    const ck = key(c);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (ck === gk) {
      const path = [c];
      let k = ck;
      while (from.has(k)) { const p = from.get(k); path.push(p); k = key(p); }
      return path.reverse().map((q) => cellP(q[0], q[1], q[2]));
    }
    for (const [dx, dy, dz, w] of dirs) {
      const n = [c[0] + dx, c[1] + dy, c[2] + dz], nk = key(n);
      if (closed.has(nk)) continue;
      if (nk !== gk && blocked(cellP(n[0], n[1], n[2]))) continue;
      const t = gScore.get(ck) + w;
      if (t < (gScore.has(nk) ? gScore.get(nk) : Infinity)) {
        gScore.set(nk, t); from.set(nk, c);
        heapPush(open, [t + h(n), n]);
      }
    }
  }
  return null;
}
function heapPush(hp, x) {
  hp.push(x);
  let i = hp.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (hp[p][0] <= hp[i][0]) break; [hp[p], hp[i]] = [hp[i], hp[p]]; i = p; }
}
function heapPop(hp) {
  const top = hp[0], last = hp.pop();
  if (hp.length) {
    hp[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < hp.length && hp[l][0] < hp[m][0]) m = l;
      if (r < hp.length && hp[r][0] < hp[m][0]) m = r;
      if (m === i) break;
      [hp[m], hp[i]] = [hp[i], hp[m]]; i = m;
    }
  }
  return top;
}

// Fewest points that keep every leg clear.
// The climb from a start pad to its lead-in: no steeper than this.
const MAX_SLOPE = 40 * Math.PI / 180;
function shortcut(pts, blocked) {
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineClear(pts[i], pts[j], blocked)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

const LINK_V = 4.5, TURN_V = 3, LEAD_IN = 2.0, TURN_R = 1.0;
const segDir = (s, end) => {
  const w = s.wps, n = w.length;
  return end ? unit(sub(w[n - 1].p, w[n - 2].p)) : unit(sub(w[1].p, w[0].p));
};

// A* then the fewest clear legs, from a to b; null if there is no way.
function route(a, b, blocked) {
  const raw = astar(a, b, blocked);
  if (!raw) return null;
  raw[0] = a; raw[raw.length - 1] = b;
  return shortcut(raw, blocked);
}
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + lenv(sub(p, pts[i])), 0);
const dirOf = (p, q) => unit(sub(q, p));
// The sides a U-turn can swing out to: level, either side; up and down too
// when steep.
function sides(d, steep) {
  const h = unit([d[2], 0, -d[0]]);
  return steep ? [h, mulv(h, -1), [0, 1, 0], [0, -1, 0]] : [h, mulv(h, -1)];
}

// The link from segment a's exit to segment b's link gate: waypoints (the
// exit's lead-out first, the lead-in to b's gate last), metres. Every gate is
// in the way, b's too (a link enters it only from its lead-in). Where the way
// doubles back at either end, a U-turn of 1 m radius swings out first. The
// way turns onto the gate's line 3 m out and runs straight in from there, so
// the quad has settled before the gate; where a wall leaves no room for that,
// 2 m out, turning onto it by 60 degrees at most.
// Tried in turn until one gives a way: level U-turns and turns of 100
// degrees at most; turns of 120; U-turns up or down too. (A loop on a link
// that flies badly fails its flight and is never drawn: measure.)
const TIERS = Object.freeze([{ turn: 100, steep: false }, { turn: 120, steep: false }, { turn: 120, steep: true }]);
export function planLink(a, b) {
  for (const tier of TIERS) {
    const way = planLinkAs(a, b, tier);
    if (way) return way;
  }
  throw new Error('no link ' + a + ' > ' + b);
}
function planLinkAs(a, b, tier) {
  const A = SEGMENTS[a], B = SEGMENTS[b];
  const dA = segDir(A, true), dB = segDir(B, false);
  const out = addv(A.wps[A.wps.length - 1].p, mulv(dA, 0.8));
  const lead = sub(B.wps[0].p, mulv(dB, LEAD_IN));
  const line = sub(B.wps[0].p, mulv(dB, LEAD_IN + 1));
  const blocked = makeBlocked(null);
  const clear = (...pts) => pts.every((p, i) => i === 0 || lineClear(pts[i - 1], p, blocked));
  // Starts: straight on, or a U-turn out of the exit.
  const starts = [[out]];
  for (const s of sides(dA, tier.steep)) {
    const t1 = addv(addv(out, mulv(dA, TURN_R)), mulv(s, TURN_R)), t2 = addv(out, mulv(s, 2 * TURN_R));
    if (clear(out, t1, t2)) starts.push([out, t1, t2]);
  }
  // Ends: onto the gate's line 3 m out (or 2 m) and in, or a U-turn onto it
  // first. Each with its cost: the shorter run-in two metres.
  const ends = [];
  for (const [on, tail, extra] of [[line, [line, lead], 0], [lead, [lead], 2]]) {
    if (!clear(...tail)) continue;
    ends.push({ pts: tail, extra, tight: on === lead });
    for (const s of sides(dB, tier.steep)) {
      const q1 = addv(sub(on, mulv(dB, TURN_R)), mulv(s, TURN_R)), q2 = addv(on, mulv(s, 2 * TURN_R));
      if (clear(q2, q1, ...tail)) ends.push({ pts: [q2, q1, ...tail], extra: extra + (Math.abs(q1[1] - q2[1]) > 0.3 ? 4 : 1), turn: true });
    }
  }
  // The shortest that never turns back on itself by more than 100 degrees; a
  // U-turn costs a metre more.
  let best = null;
  const cost = (u) => (u.length < 3 ? 0 : (Math.abs(u[1][1] - u[0][1]) > 0.3 ? 4 : 1));
  const angle = (a, p, b) => {
    const u = dirOf(a, p), w = dirOf(p, b);
    return Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]))) * 180 / Math.PI;
  };
  const sharp = (pts) => pts.slice(1, -1).some((p, i) => angle(pts[i], p, pts[i + 2]) > tier.turn);
  for (const st of starts) for (const en of ends) {
    const mid = route(st[st.length - 1], en.pts[0], blocked);
    if (!mid) continue;
    const pts = [...st.slice(0, -1), ...mid, ...en.pts.slice(1)];
    const turns = new Set([...st.slice(1), ...(en.turn ? en.pts.slice(0, 2) : [])]);
    const full = [A.wps[A.wps.length - 2].p, A.wps[A.wps.length - 1].p, ...pts, B.wps[0].p, B.wps[1].p];
    if (sharp(full)) continue;
    // The short run-in: turned onto by 60 degrees at most.
    if (en.tight && !en.turn && angle(pts[pts.length - 2], lead, B.wps[0].p) > 60) continue;
    const L = polyLen(pts) + cost(st) + en.extra;
    if (!best || L < best.L) best = { pts, L, turns };
  }
  if (!best) return null;
  const pts = best.pts;
  // Long legs get a point at least every 2.5 m, so the spline keeps to them;
  // a U-turn's points at 3 m/s, the lead-in at the segment's own pace.
  const dense = [{ p: pts[0], v: LINK_V }];
  for (let i = 1; i < pts.length; i++) {
    const d = lenv(sub(pts[i], pts[i - 1])), n = Math.ceil(d / 2.5);
    for (let k = 1; k <= n; k++) dense.push({ p: addv(pts[i - 1], mulv(sub(pts[i], pts[i - 1]), k / n)), v: k === n && best.turns.has(pts[i]) ? TURN_V : LINK_V });
  }
  dense[dense.length - 1].v = Math.min(LINK_V, B.wps[0].v + 0.5);
  return dense.map((q) => wp(r4(q.p[0]), r4(q.p[1]), r4(q.p[2]), q.v));
}

// A segment's start pad: on the floor back along its line in from its link
// gate, far enough that the climb to the lead-in is no steeper than a link's
// (the nearest clear spot from there, up to 2 m further), the column over it
// and that climb clear. A course starts on its first segment's.
export function segmentPad(id) {
  const S = SEGMENTS[id], d = segDir(S, false), g = S.wps[0].p;
  const h = unit([d[0], 0, d[2]]);
  const lead = sub(g, mulv(d, LEAD_IN));
  const geom = (p) => geomAt((cellOf(p)[0] * NY + cellOf(p)[1]) * NZ + cellOf(p)[2]) === true && p[1] >= FLOOR;
  const near = LEAD_IN + Math.max(0.8, (lead[1] - 0.55) / Math.tan(MAX_SLOPE));
  for (let back = near; back <= near + 2; back += 0.2) {
    const p = [g[0] - h[0] * back, 0, g[2] - h[2] * back];
    if (Math.abs(p[0]) > HX - 0.6 || Math.abs(p[2]) > HZ - 0.6) continue;
    let ok = true;
    for (let y = 0.05; y <= 0.6 && ok; y += 0.05) if (RIG_PLAY.boxes.some((b) => boxDist([p[0], y, p[2]], b) < 0.3)) ok = false;
    const lift = [p[0], Math.max(FLOOR, 0.6), p[2]];
    if (ok && lineClear(lift, lead, geom)) return { p: [r4(p[0]), 0.35, r4(p[2])], yaw: r4(Math.atan2(h[0], h[2])) };
  }
  throw new Error('no start pad for ' + id);
}

// ---- A course: segments in order, flown ----

// The race's gates for a chain, world units, as sim-retention.js writes them.
export function chainGates(ids) {
  const out = [];
  for (const id of ids) {
    const s = SEGMENTS[id];
    s.gates.forEach(([name, p, size], i) => {
      // ry: the heading through the gate, along the segment's path.
      const w = s.wps, j = w.reduce((bi, q, k) => (lenv(sub(q.p, p)) < lenv(sub(w[bi].p, p)) ? k : bi), 0);
      const a = w[Math.max(0, j - 1)].p, b = w[Math.min(w.length - 1, j + 1)].p;
      out.push({ name, seg: id, i, x: r4(p[0] * WS), y: r4(p[1] * WS), z: r4(p[2] * WS), ry: r4(Math.atan2(b[0] - a[0], b[2] - a[2])), size: r4(size * WS) });
    });
  }
  return out;
}

// The autopilot's plan for `laps` laps of a chain, from the first segment's
// pad: lift off, in through its lead-in, then the chain lap after lap, out
// through gate 0 once more.
export function coursePlan(ids, links, laps) {
  const first = SEGMENTS[ids[0]], pad = segmentPad(ids[0]);
  const lead = sub(first.wps[0].p, mulv(segDir(first, false), LEAD_IN));
  const lap = [];
  ids.forEach((id, k) => {
    lap.push(...SEGMENTS[id].wps);
    lap.push(...links[id + '>' + ids[(k + 1) % ids.length]].wps);
  });
  const wps = [wp(pad.p[0], 0.01, pad.p[2], 1), wp(pad.p[0], 0.55, pad.p[2], 1.5), wp(lead[0], lead[1], lead[2], 2.5)];
  for (let l = 0; l < laps; l++) wps.push(...lap);
  wps.push(...SEGMENTS[ids[0]].wps.slice(0, 2));
  return { wps, yaw0: pad.yaw + Math.PI, limits: LIMITS, vEnd: 2 };
}

// The race over flown samples (world units): gate passes in order from gate 0,
// misses, laps.
function race(samples, gates) {
  const r = gates.map((g) => g.size * 0.8);
  const inside = (p, i) => Math.hypot(p.x - gates[i].x, p.y - gates[i].y, p.z - gates[i].z) < r[i];
  let next = 0, started = null, laps = [], misses = [], passes = [];
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

// Flies a chain for `laps` laps on the bf core, from its pad: the samples, the
// race (laps, misses, each pass) and any touch of the Rig.
export async function flyCourse(ids, links, opts) {
  const o = opts || {};
  const core = o.core || await rigCore();
  const plan = coursePlan(ids, links, o.laps || 1);
  const pad = segmentPad(ids[0]);
  const pos = toModule({ x: pad.p[0] * WS, y: 0.15, z: pad.p[2] * WS }, {});
  const h = (pad.yaw + Math.PI) * 0.5;
  core.respawn(pos, { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) });
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
  const path = buildPath(plan);
  const mem = trackerMemory();
  const samples = [];
  const t0 = core.getState().flightMs;
  let stalled = false, lastI = -1, lastMove = 0;
  // Progress: the furthest point along the path reached.
  for (;;) {
    const cs = core.getState();
    const t = (cs.flightMs - t0) / 1000;
    const m = cs.position;
    samples.push({ t, x: -m.y * WS, y: m.z * WS, z: -m.x * WS });
    const s = sceneState(cs);
    const c = steer(path, s, mem, { actualFF: true });
    if (mem.i > lastI) { lastI = mem.i; lastMove = t; }
    // Stuck on the path for 3 s: the flight has failed.
    if (t - lastMove > 3) { stalled = true; break; }
    if (c.end || t > (o.limitS || 200)) break;
    stick = { r: c.r, p: c.p, y: c.y, t: c.t };
    poll();
  }
  const gates = chainGates(ids);
  const contacts = events.filter((e) => e.kind === 'contact' && e.tUs >= armUs);
  return { samples, gates, contacts, stalled, ...race(samples, gates) };
}

// Threads for flyCourses: one a CPU, or RIG_DAILY_THREADS.
const THREADS = Math.max(1, Math.floor(Number(process.env.RIG_DAILY_THREADS)) || availableParallelism());

// Flies chains as flyCourse does, each on a fresh core, on worker threads
// (tools/rig_daily_worker.mjs): the bf core is deterministic, so a flight is
// the same on any thread. jobs: [{ ids, laps }]. each(k, flight) sees the
// flights in the jobs' order, each once it and every one before it are in.
export async function flyCourses(jobs, links, each) {
  const workers = Array.from({ length: Math.min(jobs.length, THREADS) },
    () => new Worker(new URL('./rig_daily_worker.mjs', import.meta.url), { workerData: { links } }));
  const ready = new Map();
  let sent = 0, next = 0;
  try {
    await new Promise((resolve, reject) => {
      const send = (w) => { if (sent < jobs.length) w.postMessage({ k: sent, ...jobs[sent++] }); };
      for (const w of workers) {
        w.on('message', ({ k, f }) => {
          ready.set(k, f);
          send(w);
          try {
            for (; ready.has(next); next++) { each(next, ready.get(next)); ready.delete(next); }
          } catch (err) { reject(err); }
          if (next === jobs.length) resolve();
        });
        w.on('error', reject);
        w.on('exit', (code) => { if (next < jobs.length) reject(new Error('a flight thread stopped, code ' + code)); });
        send(w);
      }
      if (!jobs.length) resolve();
    });
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

// ---- Everything, planned and flown ----

const LINKS_FILE = join(root, 'tools/rig_daily_links.json');

// Every ordered pair's link, planned (slow: a minute a segment).
export function planLinks() {
  const links = {};
  for (const a of SEGMENT_IDS) for (const b of SEGMENT_IDS) if (a !== b) links[a + '>' + b] = { wps: planLink(a, b) };
  return links;
}

// The planned links as tools/rig_daily_links.json holds them: one a line.
export function linksJson(links) {
  const rows = Object.entries(links).map(([k, l]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(l.wps.map((w) => [...w.p, w.v])));
  return '{\n' + rows.join(',\n') + '\n}\n';
}
export function loadLinks() {
  const raw = JSON.parse(readFileSync(LINKS_FILE, 'utf8'));
  return Object.fromEntries(Object.entries(raw).map(([k, pts]) => [k, { wps: pts.map((q) => wp(q[0], q[1], q[2], q[3])) }]));
}

// Every loop of 3 to 5 segments (a chain turned to start on its segment first
// in SEGMENTS: the same loop, whichever segment it starts on), in that order.
export function allLoops() {
  const perms = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => perms(arr.filter((_, j) => j !== i), k - 1).map((q) => [x, ...q])));
  const key = (ids) => {
    let k = 0;
    ids.forEach((id, i) => { if (SEGMENT_IDS.indexOf(id) < SEGMENT_IDS.indexOf(ids[k])) k = i; });
    return ids.slice(k).concat(ids.slice(0, k)).join('>');
  };
  const out = [];
  for (let n = 3; n <= 5; n++) for (const c of perms(SEGMENT_IDS, n)) if (key(c) === c.join('>')) out.push(c.join('>'));
  return out;
}

// Every loop flown, two laps from a pad (a fresh core each, flyCourses; the
// n-th loop starting on its (n mod length)-th segment, so every pad is
// flown): its lap at pace (the second), and how much longer the first, from
// the pad, ran. A loop that does not fly clean (a touch, a miss, a stall) is
// left out, so the generator never draws it.
export async function measure(links, log) {
  const say = log || (() => {});
  const loops = {}, unclean = [];
  let start = 0;
  const all = allLoops();
  const runs = all.map((key, n) => {
    const ids = key.split('>'), turn = n % ids.length;
    return ids.slice(turn).concat(ids.slice(0, turn));
  });
  await flyCourses(runs.map((ids) => ({ ids, laps: 2 })), links, (n, f) => {
    const run = runs[n];
    const why = f.contacts.length ? 'touched the Rig' : f.stalled ? 'stalled' : f.misses.length ? 'missed gate ' + f.misses[0].expected : f.laps.length < 2 ? f.laps.length + ' laps' : '';
    if (why) { unclean.push(run.join('>') + ': ' + why); say('UNCLEAN ' + run.join('>') + ': ' + why); return; }
    loops[all[n]] = Math.round(f.laps[1] * 1000);
    start = Math.max(start, f.laps[0] - f.laps[1]);
    say(run.join('>') + ' ' + f.laps.map((l) => l.toFixed(3)).join(' '));
  });
  // The first lap's extra, to the next 100 ms.
  return { loops, startMs: Math.ceil(start * 10) * 100, unclean };
}

// The block sim-retention.js holds between its rig-daily markers.
export const BLOCK_OPEN = '// <rig-daily: node tools/rig_daily.mjs --write; do not edit by hand>';
export const BLOCK_CLOSE = '// </rig-daily>';
export function retentionBlock(times) {
  const core = readFileSync(join(root, 'vendor/sim-core/VERSION'), 'utf8').trim();
  const f = (v) => String(v);
  const seg = SEGMENT_IDS.map((id) => {
    const pad = segmentPad(id);
    const gates = chainGates([id]).map((g) => `      Object.freeze({ x: ${f(g.x)}, y: ${f(g.y)}, z: ${f(g.z)}, ry: ${f(g.ry)}, size: ${f(g.size)} }),`);
    return `  ${id}: Object.freeze({\n    name: '${SEGMENTS[id].name}',\n` +
      `    start: Object.freeze({ x: ${f(r4(pad.p[0] * WS))}, y: ${f(r4(pad.p[1] * WS))}, z: ${f(r4(pad.p[2] * WS))} }),\n` +
      `    gates: Object.freeze([\n${gates.join('\n')}\n    ]),\n  }),`;
  });
  const rows = [];
  const entries = Object.entries(times.loops).map(([k, ms]) => `'${k}': ${ms},`);
  for (let i = 0; i < entries.length; i += 2) rows.push('  ' + entries.slice(i, i + 2).join(' '));
  return `${BLOCK_OPEN}
// The six Coach drills as race segments (tools/rig_daily.mjs SEGMENTS), world
// units: each one's start pad (a course starts on its first segment's) and its
// gates (the first its link gate). Every loop of 3 to 5 of them, flown two laps
// by the Coach autopilot on the bf core (sim-core ${core}, the Air65 on the
// owner's diff): RIG_LOOP_MS its lap at pace, ms (a loop is its segments in
// order, turned to start on the first in RIG_SEGMENTS; the same lap whichever
// it starts on); RIG_START_MS the most the first lap, from the pad, ran
// longer. A loop that did not fly clean is not here. The Worker bundles this
// file, so it generates the same courses.
export const RIG_SEGMENTS = Object.freeze({
${seg.join('\n')}
});
export const RIG_START_MS = ${times.startMs};
export const RIG_LOOP_MS = Object.freeze({
${rows.join('\n')}
});
${BLOCK_CLOSE}`;
}

export function writeBlock(text) {
  const p = join(root, 'sim-retention.js');
  const src = readFileSync(p, 'utf8');
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const a = src.indexOf(BLOCK_OPEN), b = src.indexOf(BLOCK_CLOSE);
  if (a < 0 || b < a) throw new Error('sim-retention.js has no rig-daily block');
  writeFileSync(p, src.slice(0, a) + text.replace(/\n/g, nl) + src.slice(b + BLOCK_CLOSE.length));
}

if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = Date.now();
  let links;
  if (process.argv.includes('--plan')) {
    links = planLinks();
    writeFileSync(LINKS_FILE, linksJson(links));
    console.log('wrote tools/rig_daily_links.json', ((Date.now() - t) / 1000).toFixed(1), 's');
  } else links = loadLinks();
  const times = await measure(links, (s) => console.log(s));
  console.log(Object.keys(times.loops).length, 'loops clean,', times.unclean.length, 'not; first lap up to', times.startMs, 'ms longer');
  for (const u of times.unclean) console.log('  not clean:', u);
  if (process.argv.includes('--write')) { writeBlock(retentionBlock(times)); console.log('wrote the rig-daily block in sim-retention.js'); }
  console.log('in', ((Date.now() - t) / 1000).toFixed(1), 's');
}
