// The owner's ?tricks=debug log as a regression fixture: 90 attempts flown on
// the bf core in the Warehouse (map depot), copied with "Copy trick log"
// (one quadmath-trick-attempt JSON record a line), kept verbatim in
// tools/fixtures/tricklog-depot-bf-1.jsonl.gz.
//
// Each maneuver record carries what the detector saw (saw, rounded) and every
// candidate's gate values (3 decimals, rad). The test rebuilds the segment's
// features from them, checks the rebuild reproduces every logged gate value,
// and runs classifyFeat on it:
// - seq 4 (701 deg of pitch), 59 (606) and 79 (372) are Powerloops, 4 and 59
//   Double Powerloops;
// - seq 22, 23 and 24 (a trippy rolling 600-780 deg as it spins) are Trippy;
// - every label the log fired stays the same, and every other maneuver keeps
//   the label pinned here (no label for most).
//
// The log predates the Powerloop's own window (LOOP_WIN_S): what the logged
// features prove of it is used (loopFrom, below). For these three loops the
// pitch only turned one way (pathP = |pitch|), so the whole turn is exact
// and the window's bound is far past 300 degrees.
//   node --test tools/test_sim_tricks_attempt_log.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyFeat, featView, makeFeat, loopCount, trickName, LOOP_WIN_S, SAMPLE_S,
} from '../sim-tricks.js';
import { explainFeat } from '../sim-tricks-debug.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LOG = 'tools/fixtures/tricklog-depot-bf-1.jsonl.gz';
const recs = gunzipSync(readFileSync(join(root, LOG))).toString('utf8')
  .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const bySeq = new Map(recs.map((r) => [r.seq, r]));
const DEG = Math.PI / 180;
// sim-tricks.js QTR: tPitch90 is when |pitch| first reached this (rad).
const QTR = 1.15;

// Every gate's logged value, by feature (the floor and max wrappers opened).
function gateValues(rec) {
  const out = Object.create(null);
  const put = (g) => {
    if (!g) return;
    if (g.op === 'floor') return put(g.of);
    if (g.op === 'max') return g.of.forEach(put);
    if (!(g.feature in out)) out[g.feature] = g.value;
  };
  for (const c of rec.candidates || []) for (const g of c.gates || []) put(g);
  return out;
}

// The Powerloop's window and whole turn, from below, per way (+1: pitch
// rising, -1: falling):
// - the 1.2 s flip window lies inside the 3.5 s one;
// - a segment no longer than the window: the window holds its net turn;
// - a pitch that only turned one way (pathP = |pitch|): the whole turn is
//   |pitch|, and the last LOOP_WIN_S of it holds |pitch| less what it had
//   turned before, which is under QTR before tPitch90 and grows at most
//   peakP rad/s after.
export function loopFrom(s, flipSpan, flipDir) {
  const P = Math.abs(s.pitch), pDir = s.pitch >= 0 ? 1 : -1;
  const mono = s.pathP - P <= 0.002;
  const win = { 1: 0, [-1]: 0 };
  win[flipDir] = flipSpan;
  if (s.dur <= LOOP_WIN_S) win[pDir] = Math.max(win[pDir], P);
  else if (mono && s.tPitch90 < 90) {
    const t0 = s.dur - LOOP_WIN_S;
    const before = t0 <= s.tPitch90 ? QTR : QTR + s.peakP * (t0 - s.tPitch90 + SAMPLE_S);
    win[pDir] = Math.max(win[pDir], P - before);
  }
  const dir = win[1] >= win[-1] ? 1 : -1;
  const tot = Math.max(win[dir], dir === pDir ? P : 0);
  return { up: win[1], dn: win[-1], tot, exact: mono };
}

// The segment's features from a maneuver record.
export function featFromLog(rec) {
  const s = rec.saw, g = gateValues(rec);
  const f = makeFeat();
  f.dur = s.dur; f.n = s.n;
  f.pitch = s.pitch; f.roll = s.roll; f.yaw = s.yaw;
  f.pathP = s.pathP; f.pathR = s.pathR; f.pathY = s.pathY;
  f.peakP = s.peakP; f.peakR = s.peakR; f.peakY = s.peakY; f.peakRate = s.peakRate;
  // The 180 degree times are read only when a 90 one is missing, and then
  // they are missing too.
  f.tRoll90 = s.tRoll90; f.tPitch90 = s.tPitch90; f.tYaw90 = s.tYaw90; f.tYaw360 = s.tYaw360;
  f.tRoll180 = 99; f.tPitch180 = 99; f.tYaw180 = 99;
  f.upMin = s.upMin; f.upMax = s.upMax; f.upEnd = s.upEnd; f.invT = s.inv * s.dur;
  f.alt0 = s.alt0; f.alt1 = s.alt1;
  f.altMax = s.alt0 + s.loopRise; f.altMin = f.altMax - s.span; f.postMin = s.alt0 - s.loopRet;
  f.h1x = s.hEnd; f.travelH = s.travelH; f.radMax = s.rad;
  f.head1 = s.head;
  f.spd0 = s.spd0; f.spdPeak = s.spdPeak; f.vzMin = s.vzMin; f.vzMax = s.vzMax;
  f.alignN = s.alignN; f.followN = s.follow * s.alignN; f.againstN = s.against * s.alignN;
  f.followSum = s.meanDot * s.alignN;
  f.invAlignN = 1; f.invFollowN = s.invFol; f.invAgainstN = s.invAg;
  f.underN = s.under * s.n; f.overN = s.over * s.n; f.objNearN = s.obj * s.n; f.objOrbitN = s.objOrbit * s.n;
  f.under0 = s.under0; f.over0 = s.over0; f.oppRY = s.opp * s.n;
  f.thrMin = s.thrMin; f.thrMax = s.thrMax; f.seg = s.seg; f.bump = s.bump;
  // The windows, in rad from the gates (degrees from saw when no gate has it).
  const val = (k, deg) => (k in g ? g[k] : deg * DEG);
  const flipDir = s.flipDir === 'front' ? 1 : -1;
  const flipSpan = val('v.flipSpan', s.flipDeg);
  if (flipDir > 0) f.flipUp = flipSpan; else f.flipDn = flipSpan;
  const rollSpan = val('v.rollSpan', s.rollDeg15), rollRate = val('v.rollRate', s.rollRateDeg);
  f.rollUp = rollSpan; f.rollUpT = rollRate > 0 ? rollSpan / rollRate : 0;
  const yawSpan = val('v.yawSpan', s.vyawDeg), yawRate = val('v.yawRate', s.vyawRateDeg);
  f.yawUp = yawSpan; f.yawUpT = yawRate > 0 ? yawSpan / yawRate : 0;
  f.orbitR = 'f.orbitR' in g ? g['f.orbitR'] : s.orbitR; f.orbitSweep = val('f.orbitSweep', s.orbitSweepDeg);
  f.orbitTurn = s.orbitTurn; f.orbitSpd = s.orbitSpd; f.orbitFit = s.orbitFit; f.orbitPole = s.orbitPole;
  f.barP = val('f.barP', s.baraniPitchDeg); f.barR = val('f.barR', s.baraniTwistDeg);
  // The logged sweep is the velocity's turn the flip's way.
  const loopSweep = val('v.loopSweep', s.loopSweepDeg);
  f.sweep = flipDir > 0 ? -loopSweep : loopSweep;
  const lp = loopFrom(s, flipSpan, flipDir);
  f.loopUp = lp.up; f.loopDn = lp.dn; f.loopTot = lp.tot;
  return { f, g, flipDir, loop: lp };
}

const maneuvers = recs.filter((r) => r.type === 'maneuver');
const scored = maneuvers.filter((r) => r.saw && !r.pre.short);
const classify = (f) => classifyFeat(f, { id: null, why: '', best: 0, second: 0, secondId: '' });

test('the fixture is the owner\'s log: 90 attempts on the bf core in the Warehouse', () => {
  assert.equal(recs.length, 90);
  for (const r of recs) {
    assert.equal(r.kind, 'quadmath-trick-attempt');
    assert.equal(r.core, 'bf');
    assert.equal(r.map, 'depot');
  }
  assert.equal(maneuvers.length, 57);
  // The dives are stepDetector's own state machine, not classifyFeat; none fired.
  assert.deepEqual(recs.filter((r) => r.type === 'dive' && r.result).map((r) => r.seq), []);
});

test('the rebuilt features reproduce every logged gate value', () => {
  for (const r of scored) {
    if (r.pre.tiny) continue;
    const { f, g, flipDir } = featFromLog(r);
    const now = gateValues(explainFeat(f));
    const loopDir = featView(f).loopDir;
    for (const k of Object.keys(g)) {
      // The sweep is now measured the loop's way, which can differ from the
      // flip's.
      if (k === 'v.loopSweep' && loopDir !== flipDir) continue;
      if (!(k in now)) continue;   // a gate this change removed
      const tol = 0.0025 + 0.002 * Math.abs(g[k]);
      assert.ok(Math.abs(now[k] - g[k]) <= tol, 'seq ' + r.seq + ' ' + k + ': logged ' + g[k] + ', rebuilt ' + now[k]);
    }
  }
});

test('seq 4, 59 and 79 are Powerloops; 4 and 59 are Double Powerloops', () => {
  const want = { 4: 2, 59: 2, 79: 1 };
  for (const [seq, loops] of Object.entries(want)) {
    const r = bySeq.get(Number(seq));
    assert.equal(r.result, null, 'seq ' + seq + ' scored nothing in the log');
    const { f, loop } = featFromLog(r);
    assert.ok(loop.exact, 'seq ' + seq + ': the pitch turned one way only');
    const cls = classify(f);
    assert.equal(cls.id, 'powerloop', 'seq ' + seq + ': ' + cls.id + '\n' + cls.why);
    const v = featView(f);
    assert.equal(v.loops, loops, 'seq ' + seq + ' loops');
    assert.equal(trickName('powerloop', v.flipDir, v.loops), loops === 2 ? 'Double Powerloop' : 'Powerloop');
  }
});

test('seq 22, 23 and 24 are Trippy Spins (rolling as they spin)', () => {
  for (const seq of [22, 23, 24]) {
    const r = bySeq.get(seq);
    assert.equal(r.result, null, 'seq ' + seq + ' scored nothing in the log');
    assert.ok(Math.abs(r.saw.rollDeg) >= 600, 'seq ' + seq + ' rolled ' + r.saw.rollDeg);
    const cls = classify(featFromLog(r).f);
    assert.equal(cls.id, 'trippy', 'seq ' + seq + ': ' + cls.id + '\n' + cls.why);
  }
});

// Every maneuver's label after this change: the log's where it fired, and
// the ones it now gets. Seq 25 is the same trippy's last 4.4 s (the log cut
// the spin at the old 4.5 s cap); seq 75 is a single front loop that climbed
// 2.1 m and ended 0.5 m above its entry.
const NEW = { 4: 'powerloop', 59: 'powerloop', 79: 'powerloop', 22: 'trippy', 23: 'trippy', 24: 'trippy', 25: 'trippy', 75: 'powerloop' };

test('every label the log fired stays the same, and no other maneuver changes', () => {
  const fired = scored.filter((r) => r.result);
  assert.equal(fired.length, 16);
  const got = {};
  for (const r of scored) got[r.seq] = classify(featFromLog(r).f).id;
  for (const r of fired) assert.equal(got[r.seq], r.result, 'seq ' + r.seq + ': the log fired ' + r.result);
  for (const r of scored) {
    if (r.result) continue;
    assert.equal(got[r.seq], NEW[r.seq] || null, 'seq ' + r.seq);
  }
});

test('loop count: one from 300 degrees, two from 600, one more per further 360', () => {
  // The thresholds are 5.236 and 10.472 rad (a hair over 300 and 600 degrees).
  assert.equal(loopCount(299 * DEG), 0);
  assert.equal(loopCount(301 * DEG), 1);
  assert.equal(loopCount(599 * DEG), 1);
  assert.equal(loopCount(601 * DEG), 2);
  assert.equal(loopCount(959 * DEG), 2);
  assert.equal(loopCount(961 * DEG), 3);
  assert.equal(loopCount(1321 * DEG), 4);
  assert.equal(trickName('powerloop', 1, 1), 'Powerloop');
  assert.equal(trickName('powerloop', 1, 3), 'Triple Powerloop');
  assert.equal(trickName('powerloop', 1, 4), '4× Powerloop');
});
