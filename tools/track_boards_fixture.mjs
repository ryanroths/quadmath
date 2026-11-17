// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Fixtures for the custom track boards' tests (tools/test_sim_track_boards.mjs,
// tools/test_leaderboard_track_boards.mjs): a builder track, a run of it the
// Worker accepts (and runs it refuses), and an in-memory D1 for the
// statements the leaderboard Worker runs on these routes.
import { PHYS_VER, CUSTOM_TRACK_CODE_MAX, customTrackCode } from '../sim-retention.js';
import { sqliteD1 } from './d1_sqlite.mjs';

// A builder track: n gates along a zigzag on the Rig, 6 u apart.
export function builtTrack(n = 4, extra = {}) {
  const gates = Array.from({ length: n }, (_, i) => ({
    x: +(i * 6).toFixed(2), y: 2.3, z: i % 2 ? 2 : 0, ry: 0, size: 1.8, solid: false,
  }));
  return { id: 'custom-mhx3k2a1', name: 'Desk loop', map: 'rig', gates, flags: [], ...extra };
}

// A track whose code is past CUSTOM_TRACK_CODE_MAX: gates in rows of 20, 6 u
// apart, every one where the builder could put it.
export function hugeTrack() {
  const grid = (n) => builtTrack(1, {
    gates: Array.from({ length: n }, (_, i) => ({ x: (i % 20) * 6, y: 2.3, z: Math.floor(i / 20) * 6 + (i % 2) * 0.5, ry: 0, size: 1.8, solid: false })),
  });
  let n = 40;
  let t = grid(n);
  while (customTrackCode(t).length <= CUSTOM_TRACK_CODE_MAX) t = grid(n += 10);
  return t;
}

// A hover: the quad still, at p, for ms (a ghost that moves nowhere).
export function hoverRun(track, p, ms = 3500) {
  const samples = [];
  for (let t = 0; t <= ms; t += 400) samples.push([t, p.x, p.y, p.z, 0, 0, 0, 1]);
  if (samples[samples.length - 1][0] !== ms) samples.push([ms, p.x, p.y, p.z, 0, 0, 0, 1]);
  return { timeMs: ms, ghost: { v: 1, phys: PHYS_VER, track: track.id, name: 'RyFly', lapTime: ms, samples } };
}

// The ghost of a run flown gate to gate at speed u/s, sampled at hz: from
// gate 0's centre to the last gate's, with a sideways weave (so it is no pace
// bot's straight line). timeMs is the run's time as the page counts it.
// opts.skip: a gate index the run flies wide of (a run the Worker refuses).
export function flownRun(track, { speed = 5, hz = 15, weave = 0.18, skip = -1, phys = PHYS_VER, name = 'RyFly' } = {}) {
  const pts = track.gates.map((g, i) => (i === skip ? { x: g.x, y: g.y + 6, z: g.z } : { x: g.x, y: g.y, z: g.z }));
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    seg.push(d);
    total += d;
  }
  const durMs = Math.round(total / speed * 1000);
  const stepMs = Math.round(1000 / hz);
  const times = [];
  for (let t = 0; t < durMs; t += stepMs) times.push(t);
  times.push(durMs);
  const r2 = (v) => Math.round(v * 100) / 100;
  const samples = times.map((t) => {
    let s = t / 1000 * speed;
    let i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const f = seg[i] > 0 ? Math.min(1, s / seg[i]) : 0;
    const a = pts[i], b = pts[i + 1];
    const along = t / durMs;
    const w = weave * Math.sin(Math.PI * 7 * along); // zero at both ends
    return [t, r2(a.x + (b.x - a.x) * f), r2(a.y + (b.y - a.y) * f + w), r2(a.z + (b.z - a.z) * f + w), 0, 0, 0, 1];
  });
  return { timeMs: durMs, ghost: { v: 1, phys, track: track.id, name, lapTime: durMs, samples } };
}

// A pilot token (TOKEN_RE: 32 to 64 hex).
export function pilotToken(seed = 'a') {
  return (seed.charCodeAt(0).toString(16).padStart(2, '0')).repeat(16);
}

// The body the page posts to /api/track/submit.
export function submitBody(track, run, { name = 'RyFly', token = pilotToken(), frameMm = 65 } = {}) {
  return { track, frameMm, name, token, timeMs: run.timeMs, ghost: run.ghost, build: { frameMm } };
}

// The leaderboard Worker's D1 for the track routes: real SQLite made from
// schema.sql (tools/d1_sqlite.mjs), with the tracks and scores views the
// tests read.
export function trackBoardsD1() {
  return sqliteD1();
}
