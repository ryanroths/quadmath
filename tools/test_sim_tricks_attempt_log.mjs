// The owner's ?tricks=debug logs as regression fixtures, flown on the bf core
// in the Warehouse (map depot), copied with "Copy trick log" (one
// quadmath-trick-attempt JSON record a line) and kept verbatim:
// - tools/fixtures/tricklog-depot-bf-1.jsonl.gz, 90 attempts: Powerloops and
//   a trippy;
// - tools/fixtures/tricklog-depot-bf-2.jsonl.gz, 89 attempts: inverted yaw
//   spins (half flip in, yaw while inverted, half flip out), two trippies and
//   a Powerloop.
//
// Each maneuver record carries what the detector saw (saw, rounded) and every
// candidate's gate values (3 decimals, rad). The test rebuilds the segment's
// features from them, checks the rebuild reproduces every logged gate value,
// and runs classifyFeat on it:
// - log 1: seq 4 (701 deg of pitch), 59 (606) and 79 (372) are Powerloops,
//   4 and 59 Double Powerloops; seq 22, 23 and 24 (a trippy rolling 600-780
//   deg as it spins) are Trippy;
// - log 2: seq 9, 20, 26 and 77 (the inverted yaw spins) are Ham Spins; seq
//   29 and 30 Trippy; seq 4 a Powerloop;
// - every label a log fired stays the same, except log 2's seq 26 (it fired
//   Flip, and is a Ham Spin) and the ones the phase matcher's definitions
//   change (below), and every other maneuver keeps the label pinned here (no
//   label for most);
// - Flip, Powerloop and Split-S, now the phase matcher's, fire exactly where
//   they did; the owner's Maverick, Matty and Half Matty and the new
//   Immelmann change eight labels:
//   - log 1 seq 14 and 21, log 2 seq 51 and 71 (Maverick): none topped out
//     inverted after 150-210 degrees back (back 117, 260, 63 and 85; 14,
//     51 and 71 never went inverted): no label;
//   - log 1 seq 33 (Matty): 202 degrees of forward pitch, no climb: none;
//   - log 1 seq 80 (Snapback): back 171, roll 163, a climb of 1.26 m, out
//     0.26 m higher, the heading turned 168: an Immelmann (the climb taken
//     as the top above the entry, below);
//   - log 1 seq 82, log 2 seq 73 (Half Matty): a half roll then a forward
//     pitch, the old Half Matty; the owner's is a forward half loop over an
//     object ending inverted. 82 is a Cradle (its next best), 73 nothing.
//
// Both logs predate two features; the replay uses what the logged ones say:
// - the Powerloop's own window (LOOP_WIN_S), bounded from below (loopFrom):
//   for the loops above the pitch only turned one way (pathP = |pitch|), so
//   the whole turn is exact and the window's bound is far past 300 degrees;
// - Ham's turn about the vertical while inverted (invYawFrom): none for a
//   segment that never passed up-Z HAM_UPZ (exact); for the others it is
//   taken as the segment's turn about the vertical (the logged v.yawSpan, its
//   largest inside 2.4 s). A half flip in, a yaw and a half flip out turn
//   within a few degrees of that while inverted, flown on both cores
//   (tools/test_sim_tricks.mjs). A roll that turns about the vertical is a
//   Roll first (classifyFeat's ham -> roll), whatever it turned inverted.
// Logs recorded from now on carry invYawDeg and the gate's own value, and
// replay it exactly.
//   node --test tools/test_sim_tricks_attempt_log.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyFeat, featView, makeFeat, loopCount, trickName, LOOP_WIN_S, SAMPLE_S, HAM_UPZ, HAM_MIN,
  PHASE_SPECS, PHASE_FIELD, matchSpec,
} from '../sim-tricks.js';
import { explainFeat } from '../sim-tricks-debug.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = Math.PI / 180;
// sim-tricks.js QTR: tPitch90 is when |pitch| first reached this (rad).
const QTR = 1.15;

function readLog(file) {
  return gunzipSync(readFileSync(join(root, file))).toString('utf8')
    .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

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

// Ham's turn about the vertical while inverted (rad): the gate's logged value
// or invYawDeg when the log has them; none when up-Z never went below
// HAM_UPZ; else the segment's turn about the vertical (see the top).
export function invYawFrom(s, g) {
  if ('v.invYaw' in g) return { v: g['v.invYaw'], exact: true };
  if (s.invYawDeg != null) return { v: s.invYawDeg * DEG, exact: true };
  if (s.upMin >= HAM_UPZ) return { v: 0, exact: true };
  return { v: 'v.yawSpan' in g ? g['v.yawSpan'] : s.vyawDeg * DEG, exact: false };
}

// The phase matcher's scores (PHASE_SPECS), for logs that predate them,
// with matchSpec on what the logs measured (a log that has the score's gate
// replays it as logged):
// - Flip and Powerloop are one turn of pitch inside a window: the logged
//   flip window (exact) and the replay's loop window (loopFrom). Their
//   scores are the old terms' exactly;
// - Split-S is a half roll then a back pitch: the whole roll and the net
//   pitch (the old terms', exactly; the order is in its rollFirst term);
// - the others (Immelmann, Maverick, Matty, Half Matty, Half Mavvy) are
//   estimated. The pitch turned back B and forward F, from its whole turn and
//   its net (exact when each way turned once: B = (pathP - pitch) / 2,
//   F = (pathP + pitch) / 2), back first unless the larger flip window went
//   forward; the roll turned |roll|, before the pitch when rollFirst > 0.
//   Climb is the top above the entry (loopRise), up-Z at the top upMin, at
//   the end upEnd; an object below (over) or above (under) on any step; the
//   tail the share flown against the nose (against) times the duration, and
//   none unless it flew against the nose more than with it (the tail is the
//   end flown back against the nose; where in the segment the logs do not
//   say). Turning outside and across the phases is not in the logs: none.
export function phasesFromLog(s, f, v, flipSpan, flipDir, loop) {
  const absR = Math.abs(s.roll);
  const B = Math.max(0, (s.pathP - s.pitch) / 2), F = Math.max(0, (s.pathP + s.pitch) / 2);
  const rollFirst = s.rollFirst;
  const over = s.over > 0 || !!s.over0, under = s.under > 0;
  const rise = s.loopRise;
  const ph = (turn, x) => ({ turn, t: 0, climb: rise, up: 0, over: 0, under: 0, cross: 0, back: 0, ...x });
  const ms = (list, x) => ({ ph: list, lead: 0, trail: 0, tail: 0, ...x });
  const est = {
    flip: ms([{ turn: flipSpan, t: 0 }]),
    powerloop: ms([{ turn: Math.max(loop.up, loop.dn), t: 0 }]),
    splits: ms([{ turn: absR, cross: 0, back: 0 }, { turn: -s.pitch, cross: 0, back: 0 }]),
    immelmann: rollFirst < 0 ? ms([ph(B, { back: F }), ph(absR, { climb: 0 })]) : null,
    maverick: flipDir < 0 || B >= F ? ms([ph(B, { up: s.upMin }), ph(F, { climb: 0 })], { tail: s.against > s.follow ? s.against * s.dur : 0 }) : null,
    matty: ms([ph(F, { over: over ? 1 : 0, under: under ? 1 : 0, back: B })]),
    halfmatty: ms([ph(F, { over: over ? 1 : 0, up: s.upEnd, back: B })]),
    halfmavvy: rollFirst < 0 ? ms([ph(B), ph(absR, { climb: 0 }), ph(F, { climb: 0, under: under ? 1 : 0 })]) : null,
  };
  const out = {};
  for (const id of Object.keys(PHASE_SPECS)) out[id] = est[id] ? matchSpec(PHASE_SPECS[id], est[id], f, v) : 0;
  return out;
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
  const inv = invYawFrom(s, g);
  f.invYawUp = inv.v; f.invYawT = (s.inv50 || 0) * s.dur;
  // The phase matcher's scores: as logged, or from what the log measured.
  const est = phasesFromLog(s, f, featView(f), flipSpan, flipDir, lp);
  const phExact = {};
  for (const id of Object.keys(PHASE_FIELD)) {
    const k = 'f.' + PHASE_FIELD[id];
    phExact[id] = k in g;
    f[PHASE_FIELD[id]] = k in g ? g[k] : est[id];
  }
  return { f, g, flipDir, loop: lp, inv, phExact };
}

const classify = (f) => classifyFeat(f, { id: null, why: '', best: 0, second: 0, secondId: '' });

// Each log: what it is, and every maneuver's label after the changes since
// it was flown where that is not the label it fired (NEW), by seq.
const LOGS = [
  {
    name: 'log 1', file: 'tools/fixtures/tricklog-depot-bf-1.jsonl.gz', records: 90, maneuvers: 57, fired: 16,
    // Seq 25 is the trippy's last 4.4 s (the log cut the spin at the old
    // 4.5 s cap); seq 75 a single front loop that climbed 2.1 m and ended
    // 0.5 m above its entry. Seq 12, 40 and 67 turned 313-321 degrees about
    // the vertical and went inverted (a back flip of 335-423 degrees with
    // 330-415 of yaw): Ham Spins.
    NEW: {
      4: 'powerloop', 59: 'powerloop', 79: 'powerloop', 22: 'trippy', 23: 'trippy', 24: 'trippy', 25: 'trippy', 75: 'powerloop',
      12: 'ham', 40: 'ham', 67: 'ham',
      14: null, 21: null, 33: null, 80: 'immelmann', 82: 'cradle',
    },
  },
  {
    name: 'log 2', file: 'tools/fixtures/tricklog-depot-bf-2.jsonl.gz', records: 89, maneuvers: 59, fired: 14,
    // Seq 82 and 84 (one tumble of 7.8 s cut at the 4.5 s cap: pitch, roll
    // and yaw together, gyro peaks of 2500-5000 deg/s) turned 339 and 343
    // degrees about the vertical: Ham by the estimate only. 84 was below
    // up-Z -0.35 for 0.39 s of it, so it likely turned far less inverted.
    NEW: {
      9: 'ham', 20: 'ham', 26: 'ham', 77: 'ham', 29: 'trippy', 30: 'trippy', 4: 'powerloop',
      82: 'ham', 84: 'ham',
      51: null, 71: null, 73: null,
    },
  },
];
for (const L of LOGS) {
  L.recs = readLog(L.file);
  L.bySeq = new Map(L.recs.map((r) => [r.seq, r]));
  L.scored = L.recs.filter((r) => r.type === 'maneuver' && r.saw && !r.pre.short);
}
const [LOG1, LOG2] = LOGS;

test('the fixtures are the owner\'s logs, on the bf core in the Warehouse', () => {
  for (const L of LOGS) {
    assert.equal(L.recs.length, L.records, L.name);
    for (const r of L.recs) {
      assert.equal(r.kind, 'quadmath-trick-attempt');
      assert.equal(r.core, 'bf');
      assert.equal(r.map, 'depot');
    }
    assert.equal(L.recs.filter((r) => r.type === 'maneuver').length, L.maneuvers, L.name);
    // The dives are stepDetector's own state machine, not classifyFeat; none fired.
    assert.deepEqual(L.recs.filter((r) => r.type === 'dive' && r.result).map((r) => r.seq), [], L.name);
  }
});

test('the rebuilt features reproduce every logged gate value', () => {
  for (const L of LOGS) {
    for (const r of L.scored) {
      if (r.pre.tiny) continue;
      const { f, g, flipDir } = featFromLog(r);
      const now = gateValues(explainFeat(f));
      const loopDir = featView(f).loopDir;
      for (const k of Object.keys(g)) {
        // The sweep is now measured the loop's way, which can differ from the
        // flip's.
        if (k === 'v.loopSweep' && loopDir !== flipDir) continue;
        if (!(k in now)) continue;   // a gate a later change removed
        const tol = 0.0025 + 0.002 * Math.abs(g[k]);
        assert.ok(Math.abs(now[k] - g[k]) <= tol, L.name + ' seq ' + r.seq + ' ' + k + ': logged ' + g[k] + ', rebuilt ' + now[k]);
      }
    }
  }
});

test('log 1: seq 4, 59 and 79 are Powerloops; 4 and 59 are Double Powerloops', () => {
  const want = { 4: 2, 59: 2, 79: 1 };
  for (const [seq, loops] of Object.entries(want)) {
    const r = LOG1.bySeq.get(Number(seq));
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

test('log 1: seq 22, 23 and 24 are Trippy Spins (rolling as they spin)', () => {
  for (const seq of [22, 23, 24]) {
    const r = LOG1.bySeq.get(seq);
    assert.equal(r.result, null, 'seq ' + seq + ' scored nothing in the log');
    assert.ok(Math.abs(r.saw.rollDeg) >= 600, 'seq ' + seq + ' rolled ' + r.saw.rollDeg);
    const cls = classify(featFromLog(r).f);
    assert.equal(cls.id, 'trippy', 'seq ' + seq + ': ' + cls.id + '\n' + cls.why);
  }
});

test('log 2: seq 9, 20, 26 and 77 (half flip in, yaw while inverted, half flip out) are Ham Spins', () => {
  for (const seq of [9, 20, 26, 77]) {
    const r = LOG2.bySeq.get(seq);
    const s = r.saw;
    assert.equal(r.result, seq === 26 ? 'flip' : null, 'seq ' + seq + ' in the log: ' + r.result);
    // What the log shows: about a back flip of pitch (331-383 degrees), a
    // turn of 300 or more about the vertical, upside down for 56-67 % of it,
    // upright at both ends.
    assert.ok(s.pitchDeg <= -330 && s.pitchDeg >= -390, 'seq ' + seq + ' pitch ' + s.pitchDeg);
    assert.ok(s.vyawDeg >= 300, 'seq ' + seq + ' turned ' + s.vyawDeg + ' about the vertical');
    assert.ok(s.inv >= 0.55 && s.upMin < HAM_UPZ && s.upMax > 0.9 && s.upEnd > 0.85, 'seq ' + seq + ' inverted ' + s.inv);
    // Ham's old terms wanted the pitch under 69 degrees.
    assert.ok(Math.abs(s.pitch) > 1.2, 'seq ' + seq);
    const { f, inv } = featFromLog(r);
    assert.equal(inv.exact, false, 'seq ' + seq + ': the log predates the inverted turn');
    assert.ok(featView(f).invYaw >= HAM_MIN, 'seq ' + seq);
    const cls = classify(f);
    assert.equal(cls.id, 'ham', 'seq ' + seq + ': ' + cls.id + '\n' + cls.why);
  }
});

test('log 2: seq 29 and 30 are Trippy Spins, seq 4 a Powerloop', () => {
  for (const seq of [29, 30]) {
    const r = LOG2.bySeq.get(seq);
    assert.equal(r.result, null, 'seq ' + seq + ' scored nothing in the log');
    const cls = classify(featFromLog(r).f);
    assert.equal(cls.id, 'trippy', 'seq ' + seq + ': ' + cls.id + '\n' + cls.why);
  }
  const r = LOG2.bySeq.get(4);
  assert.equal(r.result, null, 'seq 4 scored nothing in the log');
  const { f, loop } = featFromLog(r);
  assert.ok(loop.exact, 'seq 4: the pitch turned one way only');
  const cls = classify(f);
  assert.equal(cls.id, 'powerloop', 'seq 4: ' + cls.id + '\n' + cls.why);
  assert.equal(featView(f).loops, 1);
});

test('every label a log fired stays the same (but log 2 seq 26 and the phase matcher\'s eight), and no other maneuver changes', () => {
  for (const L of LOGS) {
    const fired = L.scored.filter((r) => r.result);
    assert.equal(fired.length, L.fired, L.name + ' fired');
    const off = [];
    for (const r of L.scored) {
      const got = classify(featFromLog(r).f).id;
      const want = r.seq in L.NEW ? L.NEW[r.seq] : r.result;
      if (got !== want) off.push('seq ' + r.seq + ' is ' + got + ', want ' + want + ' (the log fired ' + r.result + ')');
    }
    assert.deepEqual(off, [], L.name);
  }
  // The fired labels that change.
  const changed = LOGS.flatMap((L) => L.scored.filter((r) => r.result && r.seq in L.NEW && L.NEW[r.seq] !== r.result).map((r) => L.name + ' seq ' + r.seq + ' ' + r.result + '->' + (L.NEW[r.seq] || 'none')));
  assert.deepEqual(changed, [
    'log 1 seq 14 maverick->none', 'log 1 seq 21 maverick->none', 'log 1 seq 33 matty->none',
    'log 1 seq 80 snapback->immelmann', 'log 1 seq 82 halfmatty->cradle',
    'log 2 seq 26 flip->ham', 'log 2 seq 51 maverick->none', 'log 2 seq 71 maverick->none', 'log 2 seq 73 halfmatty->none',
  ]);
});

test('Flip, Powerloop and Split-S, now the phase matcher\'s, fire on both logs exactly where they did', () => {
  const OLD = new Set(['flip', 'powerloop', 'splits']);
  for (const L of LOGS) {
    for (const r of L.scored) {
      const was = r.seq in L.NEW ? L.NEW[r.seq] : r.result;
      const { f } = featFromLog(r);
      const got = classify(f).id;
      if (OLD.has(was) || OLD.has(got)) assert.equal(got, was, L.name + ' seq ' + r.seq);
    }
  }
  // The flips and Split-S the logs fired, and the Powerloops pinned above.
  const fired = (L, id) => L.scored.filter((r) => (r.seq in L.NEW ? L.NEW[r.seq] : r.result) === id).map((r) => r.seq);
  assert.deepEqual(fired(LOG1, 'flip'), [7, 86]);
  assert.deepEqual(fired(LOG1, 'splits'), [19]);
  assert.deepEqual(fired(LOG1, 'powerloop'), [4, 59, 75, 79]);
  assert.deepEqual(fired(LOG2, 'flip'), [55, 67, 78]);
  assert.deepEqual(fired(LOG2, 'splits'), [19]);
  assert.deepEqual(fired(LOG2, 'powerloop'), [4]);
});

test('the phase matcher\'s Maverick, Matty and Half Matty, and Immelmann, on both logs', () => {
  // The Mavericks the logs fired: back B, forward F from the whole pitch and
  // the net; none topped out inverted after 150-210 back.
  for (const [L, seq] of [[LOG1, 14], [LOG1, 21], [LOG2, 51], [LOG2, 71]]) {
    const s = L.bySeq.get(seq).saw;
    const back = (s.pathP - s.pitch) / 2 / DEG;
    assert.ok(back < 150 || back > 210 || s.upMin > -0.5, L.name + ' seq ' + seq + ': back ' + back.toFixed(0) + ', up-Z ' + s.upMin);
    assert.equal(featFromLog(L.bySeq.get(seq)).f.phMav, 0);
  }
  // Log 1 seq 33: a Matty of 202 degrees that did not climb.
  const s33 = LOG1.bySeq.get(33).saw;
  assert.ok(s33.pitchDeg < 300 && s33.loopRise < 1, 'seq 33');
  // The Matties that stay: a forward loop of 300 or more climbing 2-3.6 m,
  // over an object and under one.
  for (const [L, seq] of [[LOG1, 49], [LOG2, 16]]) {
    const r = L.bySeq.get(seq);
    assert.equal(r.result, 'matty');
    assert.equal(featFromLog(r).f.phMatty, 1, L.name + ' seq ' + seq);
    assert.equal(classify(featFromLog(r).f).id, 'matty', L.name + ' seq ' + seq);
  }
  // Log 1 seq 80: back 171, a roll of 163, out higher with the heading turned.
  const r80 = LOG1.bySeq.get(80);
  assert.ok(r80.saw.pitchDeg <= -135 && Math.abs(r80.saw.rollDeg) >= 135 && r80.saw.rollFirst < 0 && r80.saw.loopRise >= 1 && r80.saw.drop <= 0, 'seq 80');
  const { f: f80, phExact } = featFromLog(r80);
  assert.equal(phExact.immelmann, false, 'the log predates the matcher');
  assert.equal(f80.phImmel, 1);
  // The old Half Matties (a half roll, then a forward pitch).
  for (const [L, seq] of [[LOG1, 82], [LOG2, 73]]) {
    const s = L.bySeq.get(seq).saw;
    assert.ok(Math.abs(s.rollDeg) >= 135 && s.rollFirst > 0, L.name + ' seq ' + seq);
    assert.equal(featFromLog(L.bySeq.get(seq)).f.phHMatty, 0);
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
