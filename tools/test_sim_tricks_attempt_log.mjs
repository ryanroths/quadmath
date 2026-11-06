// The owner's ?tricks=debug logs as regression fixtures, flown on the bf core
// in the Warehouse (map depot), copied with "Copy trick log" (one
// quadmath-trick-attempt JSON record a line) and kept verbatim:
// - tools/fixtures/tricklog-depot-bf-1.jsonl.gz, 90 attempts: Powerloops and
//   a trippy;
// - tools/fixtures/tricklog-depot-bf-2.jsonl.gz, 89 attempts: inverted yaw
//   spins (half flip in, yaw while inverted, half flip out), two trippies and
//   a Powerloop;
// - tools/fixtures/tricklog-depot-bf-3.jsonl.gz, 68 attempts, flown after the
//   phase matcher: in the owner's order, Immelmanns (28-48 s), Half Mavvies
//   (57-70 s), Matties (113-124 s) and Mavericks (148-153 s);
// - tools/fixtures/tricklog-depot-bf-4.jsonl.gz, 11 attempts, flown after the
//   compound tricks: three Baranis, at 28.6, 34.2 and 38.1 s.
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
//     object ending inverted. 82 is a Cradle (its next best), 73 nothing;
// - log 3, with the owner's Maverick, Matty and Half Mavvy as the owner
//   flies them and compound tricks merged across segments (replayLog): six
//   labels change, all the owner's:
//   - seq 20 and 27 (Barani): Half Mavvies, forward 427 and 364 degrees net
//     with a half roll between, climbing 6.6 and 5.3 m over 3.1 s, under an
//     object 0.44 and 0.28 of the time (without one, a Barani);
//   - seq 50 and 53 (none): Matties, 286 and 296 degrees of forward pitch
//     over an object, against the nose, climbed into from 1.0 s before
//     (1.2 and 1.7 m, by the records around then);
//   - seq 63 and 66 (Cradle): Mavericks, each the glide back of a pull a
//     pause of under 0.8 s before (63 with 61 and 62, 66 with 65), one
//     trick, and no Cradle;
//   - the Immelmanns (seq 6, 10, 18) stay; seq 56 (forward 260 net with a
//     half roll and 85 back, cut at 4.5 s) is not a Matty (a Barani, below);
// - log 4, with the owner's Barani (a pitch path of 300 with a half twist
//   by roll or yaw inside it, any climb), the Maverick without a twist and
//   the Half Mavvy through an object: the three Baranis, which scored
//   nothing and a Maverick (34.2 s), are Baranis. By the same Barani, as
//   estimated (baraniFrom), four maneuvers nobody labelled read Barani:
//   - log 2 seq 33 and 40 (82.6 and 91.4 s): back about 240 and 200, a yaw
//     of 165 and 171 turning the heading as far, forward, upright; the
//     shape of the owner's 34.2 s Barani, in the inverted yaw spin log;
//   - log 3 seq 56 (124.0 s, flown as a Matty): 429 of pitch path, a roll
//     of 171, upright (the log cannot say whether the roll was inside the
//     pitch, which the detector asks);
//   - log 4 seq 4 (23.9 s): back about 190, a yaw of 187, forward 244,
//     up-Z 0.66 at the end.
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
// All four logs predate the twist (saw.twistDeg): their Barani terms were
// the old window's, the net pitch inside 1.5 s and the roll alone, and in
// log 4 that read 0 on every segment (baraniFrom, below).
//   node --test tools/test_sim_tricks_attempt_log.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyFeat, featView, makeFeat, loopCount, trickName, LOOP_WIN_S, SAMPLE_S, HAM_UPZ, HAM_MIN,
  PHASE_SPECS, PHASE_FIELD, matchSpec, MERGE_GAP_S, MANEUVER_MAX_S,
} from '../sim-tricks.js';
import { explainFeat, SPEC } from '../sim-tricks-debug.js';

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

// The Barani's terms (f.barP, f.barR): the gates' when the log has the
// twist (saw.twistDeg); before it, estimated. The pitch path is the
// segment's (pathP, the most any stretch of it can have). The twist is
// about the body axis nearest the flight path, which the logs do not say:
// the roll counts whole, and the yaw as far as the turn about the vertical
// it made (v.yawSpan): a twist by yaw is made with the up axis along the
// path, punched up or falling inverted, so the body's yaw turns the heading
// about as much; a yaw made on its side, the path across the up axis, turns
// it little. The larger of the two. Whether the twist was inside the pitch
// is not in the logs either: taken as inside.
export function baraniFrom(s, g) {
  if (s.twistDeg != null) {
    return { p: 'f.barP' in g ? g['f.barP'] : s.baraniPitchDeg * DEG, r: 'f.barR' in g ? g['f.barR'] : s.baraniTwistDeg * DEG, exact: true };
  }
  const yawSpan = 'v.yawSpan' in g ? g['v.yawSpan'] : s.vyawDeg * DEG;
  return { p: s.pathP, r: Math.max(Math.abs(s.roll), Math.min(Math.abs(s.yaw), yawSpan)), exact: false };
}

// The phase matcher's scores (PHASE_SPECS), for logs that predate them or
// the current definitions, with matchSpec on what the logs measured (a log
// whose definition of a trick is today's replays its logged score):
// - Flip and Powerloop are one turn of pitch inside a window: the logged
//   flip window (exact) and the replay's loop window (loopFrom). Their
//   scores are the old terms' exactly;
// - Split-S is a half roll then a back pitch: the whole roll and the net
//   pitch (the old terms', exactly; the order is in its rollFirst term);
// - the others are estimated. The pitch turned back B and forward F, from
//   its whole turn and its net (exact when each way turned once: B = (pathP -
//   pitch) / 2, F = (pathP + pitch) / 2), back first; the roll turned |roll|,
//   before the pitch when rollFirst > 0. A phase's climb is the segment's:
//   from its low when it ended at its top (span), else the top above the
//   entry (loopRise); the Matty's from the altitude 1.0 s before it began,
//   read off the records around then (altAt; none known, no climb), and none
//   unless it started no lower than that (climbed into). Up-Z at
//   the end upEnd; an object below (over) on any step; the tail the share
//   flown against the nose (against) times the duration, and none unless it
//   flew against the nose more than with it (where in the segment the logs
//   do not say). The Half Mavvy's forward pitch splits evenly round the
//   roll, the pull before it (B) its lead. Turning outside and across the
//   phases is not in the logs: none, but the roll across the Maverick's and
//   the Matty's pitch. The Maverick's twist across its phases is the
//   segment's roll or yaw, the larger (net); the Half Mavvy's share against
//   the nose after the roll the segment's (against, or of the inverted part,
//   the larger).
export function phasesFromLog(s, f, v, flipSpan, flipDir, loop, pre) {
  const absR = Math.abs(s.roll);
  const B = Math.max(0, (s.pathP - s.pitch) / 2), F = Math.max(0, (s.pathP + s.pitch) / 2);
  const rollFirst = s.rollFirst;
  const over = s.over > 0 || !!s.over0;
  const riseIn = s.alt1 >= s.alt0 + s.loopRise - 0.05 ? s.span : s.loopRise;
  const top = s.alt0 + s.loopRise;
  const ph = (turn, x) => ({ turn, t: 0, climb: riseIn, up: 0, over: 0, under: 0, cross: 0, back: 0, ...x });
  const ms = (list, x) => ({ ph: list, lead: 0, trail: 0, tail: 0, ...x });
  const est = {
    flip: ms([{ turn: flipSpan, t: 0 }]),
    powerloop: ms([{ turn: Math.max(loop.up, loop.dn), t: 0 }]),
    splits: ms([{ turn: absR, cross: 0, back: 0 }, { turn: -s.pitch, cross: 0, back: 0 }]),
    immelmann: rollFirst < 0 ? ms([ph(B, { back: F }), ph(absR, { climb: 0 })]) : null,
    maverick: B >= 1 * DEG ? ms([ph(B, { cross: absR }), ph(F, { climb: 0, cross: absR })], { tail: s.against > s.follow ? s.against * s.dur : 0, still: Math.max(absR, Math.abs(s.yaw)) }) : null,
    matty: ms([ph(F, { climb: pre === pre && pre != null && s.alt0 >= pre ? top - pre : 0, over: over ? 1 : 0, back: B, cross: absR })]),
    halfmatty: ms([ph(F, { over: over ? 1 : 0, up: s.upEnd, back: B })]),
    halfmavvy: rollFirst < 0 ? ms([ph(F / 2, { climb: 0 }), ph(absR, { climb: 0 }), ph(F / 2, { climb: 0, ag: Math.max(s.against, s.invAg) })], { lead: B }) : null,
  };
  const out = {};
  for (const id of Object.keys(PHASE_SPECS)) out[id] = est[id] ? matchSpec(PHASE_SPECS[id], est[id], f, v) : 0;
  return out;
}

// The matcher tricks whose definitions a log's logged score still is:
// unchanged since the matcher came in. (The Immelmann's climb is measured
// from its low now, never less than from its start: a logged 1 stands.)
const LOGGED_PH = new Set(['flip', 'powerloop', 'splits', 'immelmann']);
// A log from the compound tricks on (its records carry merged: log 4)
// measured the other matcher tricks as today but for what changed since:
// the Maverick's twist and the Half Mavvy's object. Its logged scores times
// those terms, estimated as phasesFromLog does.
const SINCE_MERGE = {
  matty: () => 1,
  halfmatty: () => 1,
  maverick: (s) => (Math.max(Math.abs(s.roll), Math.abs(s.yaw)) <= PHASE_SPECS.maverick.still ? 1 : 0),
  halfmavvy: (s) => (s.under >= 0.25 && Math.max(s.against, s.invAg) >= 0.3 ? 1 : 0),
};

// The segment's features from a maneuver record; ctx.pre the altitude 1.0 s
// before it began, when known (altAt).
export function featFromLog(rec, ctx) {
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
  const bar = baraniFrom(s, g);
  f.barP = bar.p; f.barR = bar.r;
  // The logged sweep is the velocity's turn the flip's way.
  const loopSweep = val('v.loopSweep', s.loopSweepDeg);
  f.sweep = flipDir > 0 ? -loopSweep : loopSweep;
  const lp = loopFrom(s, flipSpan, flipDir);
  f.loopUp = lp.up; f.loopDn = lp.dn; f.loopTot = lp.tot;
  const inv = invYawFrom(s, g);
  f.invYawUp = inv.v; f.invYawT = (s.inv50 || 0) * s.dur;
  // The phase matcher's scores: as logged where that definition is today's,
  // or from what the log measured.
  const pre = ctx && ctx.pre != null ? ctx.pre : NaN;
  f.alt1s = pre === pre ? pre : s.alt0;
  const est = phasesFromLog(s, f, featView(f), flipSpan, flipDir, lp, pre);
  const phExact = {};
  for (const id of Object.keys(PHASE_FIELD)) {
    const k = 'f.' + PHASE_FIELD[id];
    phExact[id] = k in g && LOGGED_PH.has(id);
    if (phExact[id]) f[PHASE_FIELD[id]] = g[k];
    else if (k in g && 'merged' in rec && SINCE_MERGE[id]) f[PHASE_FIELD[id]] = g[k] * SINCE_MERGE[id](s);
    else f[PHASE_FIELD[id]] = est[id];
  }
  return { f, g, flipDir, loop: lp, inv, phExact };
}

// The altitude at time t (s, the log's clock) from the maneuver records
// around it: inside one, between its start and end altitudes; in a pause
// under 1.5 s, between the two around it; NaN when none says.
export function altAt(man, t) {
  let prev = null, next = null;
  for (const r of man) {
    if (r.t0 <= t && t <= r.t) return r.saw.alt0 + (r.saw.alt1 - r.saw.alt0) * (r.t > r.t0 ? (t - r.t0) / (r.t - r.t0) : 0);
    if (r.t < t && (!prev || r.t > prev.t)) prev = r;
    if (r.t0 > t && (!next || r.t0 < next.t0)) next = r;
  }
  if (prev && next && next.t0 - prev.t < 1.5) return prev.saw.alt1 + (next.saw.alt0 - prev.saw.alt1) * (t - prev.t) / (next.t0 - prev.t);
  return NaN;
}

// A compound trick across consecutive records (mergeFeat in the detector),
// estimated for the pitch-only ones, Maverick and Matty: each record's
// pitch is its back B then its forward F; the phases are the runs of one
// way, a turn back the other way of PH_CROSS or less inside a run kept in
// it. The Maverick's pull is the first back run, its push the rest; the
// Matty's loop the forward run. The climb is the pull's records' (as
// phasesFromLog), the Matty's from pre; the tail the last record's. The
// others (Immelmann, Half Matty, Half Mavvy) turn about two axes and are
// not merged here. { id: score }.
export function mergeFromLog(win, pre) {
  const moves = [];
  for (const r of win) {
    const s = r.saw;
    const B = Math.max(0, (s.pathP - s.pitch) / 2), F = Math.max(0, (s.pathP + s.pitch) / 2);
    if (B >= DEG) moves.push({ turn: -B, r });
    if (F >= DEG) moves.push({ turn: F, r });
  }
  const out = {};
  const last = win[win.length - 1].saw;
  const tail = last.against > last.follow ? last.against * last.dur : 0;
  const riseOf = (s) => (s.alt1 >= s.alt0 + s.loopRise - 0.05 ? s.span : s.loopRise);
  const f = { upEnd: last.upEnd, dur: win[win.length - 1].t - win[0].t0 };
  let aN = 0, ag = 0, iN = 0, ia = 0;
  for (const r of win) { aN += r.saw.alignN || 0; ag += (r.saw.against || 0) * (r.saw.alignN || 0); iN += r.saw.alignN || 0; ia += (r.saw.invAg || 0) * (r.saw.alignN || 0); }
  const v = { against: aN ? ag / aN : 0, invAg: iN ? ia / iN : 0 };
  // The roll across the pitch: the most any record of it rolled. The twist
  // across the Maverick: that, or the most any record yawed, or the run's
  // whole roll or yaw.
  let roll = 0, still = 0, sR = 0, sY = 0;
  for (const r of win) {
    roll = Math.max(roll, Math.abs(r.saw.roll));
    still = Math.max(still, Math.abs(r.saw.roll), Math.abs(r.saw.yaw));
    sR += r.saw.roll; sY += r.saw.yaw;
  }
  still = Math.max(still, Math.abs(sR), Math.abs(sY));
  // Maverick: the first back run, then the rest forward.
  if (moves.length >= 2 && moves[0].turn < 0) {
    let i = 0, pull = 0, climb = 0;
    while (i < moves.length && moves[i].turn < 0) { pull -= moves[i].turn; climb = Math.max(climb, riseOf(moves[i].r.saw)); i++; }
    let push = 0, back = 0, bigBack = 0;
    for (; i < moves.length; i++) {
      push += moves[i].turn;
      if (moves[i].turn < 0) { back = Math.max(back, -moves[i].turn); if (-moves[i].turn > 0.785) bigBack = 1; }
    }
    const ms = { ph: [
      { turn: pull, t: 0, climb, up: 0, over: 0, under: 0, cross: roll, back: 0 },
      { turn: push, t: 0, climb: 0, up: 0, over: 0, under: 0, cross: roll, back: bigBack ? 9 : back },
    ], lead: 0, trail: 0, tail, still };
    out.maverick = matchSpec(PHASE_SPECS.maverick, ms, f, v);
  }
  // Matty: one forward run.
  {
    let fwd = 0, back = 0, top = -Infinity, over = 0;
    for (const m of moves) { fwd += m.turn; if (m.turn < 0) back = Math.max(back, -m.turn); }
    for (const r of win) { top = Math.max(top, r.saw.alt0 + r.saw.loopRise); if (r.saw.over > 0 || r.saw.over0) over = 1; }
    const into = pre === pre && win[0].saw.alt0 >= pre;
    const ms = { ph: [{ turn: fwd, t: 0, climb: into ? top - pre : 0, up: 0, over, under: 0, cross: roll, back }], lead: 0, trail: 0, tail: 0 };
    out.matty = matchSpec(PHASE_SPECS.matty, ms, f, v);
  }
  return out;
}

// A log replayed as the detector scores it: each record's own label, and
// over the unscored records before it with pauses under MERGE_GAP_S, the
// merge's (mergeFeat's ranking: its score plus the specificity bonus, at
// classifyFeat's 0.42; it stands unless this record's own label is a
// matcher trick ranked above it). Map seq -> { id, merged }.
export function replayLog(L) {
  const man = L.recs.filter((r) => r.type === 'maneuver' && r.saw && !r.pre.short).sort((a, b) => a.t0 - b.t0);
  const out = new Map();
  let chain = [];
  for (const r of man) {
    const prev = chain.length ? chain[chain.length - 1] : null;
    if (prev && r.t0 - prev.t >= MERGE_GAP_S) chain = [];
    const { f } = featFromLog(r, { pre: altAt(man, r.t0 - 1.0) });
    let id = classify(f).id || null;
    let merged = 0, best = null, bestSc = 0;
    for (let k = 0; k < chain.length; k++) {
      const win = chain.slice(k).concat([r]);
      if (r.t - win[0].t0 > MANEUVER_MAX_S + 1e-6) continue;
      const m = mergeFromLog(win, altAt(man, win[0].t0 - 1.0));
      for (const [mid, sc] of Object.entries(m)) {
        const tot = sc + (SPEC[mid] || 0) * (sc > 0.15 ? 1 : 0);
        if (sc >= 0.42 && tot > bestSc) { bestSc = tot; best = { id: mid, segs: win.length }; }
      }
    }
    if (best && (!id || !PHASE_SPECS[id] || (SPEC[best.id] || 0) >= (SPEC[id] || 0))) { id = best.id; merged = best.segs; }
    out.set(r.seq, { id, merged });
    if (id) chain = []; else chain.push(r);
  }
  return out;
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
      // The owner's Barani, estimated (see the top).
      33: 'barani', 40: 'barani',
    },
  },
  {
    name: 'log 3', file: 'tools/fixtures/tricklog-depot-bf-3.jsonl.gz', records: 68, maneuvers: 49, fired: 8,
    // The owner's: Immelmann 6, 10, 18 (as fired); Half Mavvy 20, 27; Matty
    // 50, 53; Maverick 63 (merged with 61, 62) and 66 (with 65).
    NEW: {
      20: 'halfmavvy', 27: 'halfmavvy', 50: 'matty', 53: 'matty', 63: 'maverick', 66: 'maverick',
      // The owner's Barani, estimated (see the top).
      56: 'barani',
    },
  },
  {
    name: 'log 4', file: 'tools/fixtures/tricklog-depot-bf-4.jsonl.gz', records: 11, maneuvers: 7, fired: 1,
    // The owner's: Barani 6 (28.6 s), 8 (34.2 s, it fired Maverick) and 11
    // (38.1 s). Seq 4 (23.9 s) by the estimate (see the top).
    NEW: { 6: 'barani', 8: 'barani', 11: 'barani', 4: 'barani' },
  },
];
for (const L of LOGS) {
  L.recs = readLog(L.file);
  L.bySeq = new Map(L.recs.map((r) => [r.seq, r]));
  L.scored = L.recs.filter((r) => r.type === 'maneuver' && r.saw && !r.pre.short);
  L.man = L.scored.slice().sort((a, b) => a.t0 - b.t0);
}
// Each log as the detector scores it today (merges and all), by seq.
const REPLAY = new Map();
const replayed = (L) => { if (!REPLAY.has(L)) REPLAY.set(L, replayLog(L)); return REPLAY.get(L); };
const featNow = (L, r) => featFromLog(r, { pre: altAt(L.man, r.t0 - 1.0) });
const [LOG1, LOG2, LOG3, LOG4] = LOGS;

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
        // A matcher trick defined differently since the log (log 3's).
        if (/^f\.ph(Mav|Matty|HMatty|HMavvy)$/.test(k)) continue;
        // The Barani's terms, measured since by the twist (baraniFrom).
        if ((k === 'f.barP' || k === 'f.barR') && r.saw.twistDeg == null) continue;
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

test('every label a log fired stays the same (but log 2 seq 26, the phase matcher\'s eight, log 3\'s six and log 4\'s Barani), and no other maneuver changes', () => {
  for (const L of LOGS) {
    const fired = L.scored.filter((r) => r.result);
    assert.equal(fired.length, L.fired, L.name + ' fired');
    const out = replayed(L);
    const off = [];
    for (const r of L.scored) {
      const got = out.get(r.seq).id;
      const want = r.seq in L.NEW ? L.NEW[r.seq] : r.result;
      if (got !== want) off.push('seq ' + r.seq + ' is ' + got + ', want ' + want + ' (the log fired ' + r.result + ')');
    }
    assert.deepEqual(off, [], L.name);
  }
  // The labels that change: every fired one listed, and the unlabelled ones
  // that score now.
  const changed = LOGS.flatMap((L) => L.scored.filter((r) => r.seq in L.NEW && L.NEW[r.seq] !== r.result && (r.result || L.name === 'log 3' || L.NEW[r.seq] === 'barani')).map((r) => L.name + ' seq ' + r.seq + ' ' + (r.result || 'none') + '->' + (L.NEW[r.seq] || 'none')));
  assert.deepEqual(changed, [
    'log 1 seq 14 maverick->none', 'log 1 seq 21 maverick->none', 'log 1 seq 33 matty->none',
    'log 1 seq 80 snapback->immelmann', 'log 1 seq 82 halfmatty->cradle',
    'log 2 seq 26 flip->ham', 'log 2 seq 33 none->barani', 'log 2 seq 40 none->barani',
    'log 2 seq 51 maverick->none', 'log 2 seq 71 maverick->none', 'log 2 seq 73 halfmatty->none',
    'log 3 seq 20 barani->halfmavvy', 'log 3 seq 27 barani->halfmavvy', 'log 3 seq 50 none->matty', 'log 3 seq 53 none->matty',
    'log 3 seq 56 none->barani', 'log 3 seq 63 cradle->maverick', 'log 3 seq 66 cradle->maverick',
    'log 4 seq 4 none->barani', 'log 4 seq 6 none->barani', 'log 4 seq 8 maverick->barani', 'log 4 seq 11 none->barani',
  ]);
});

test('Flip, Powerloop and Split-S, now the phase matcher\'s, fire on every log exactly where they did', () => {
  const OLD = new Set(['flip', 'powerloop', 'splits']);
  for (const L of LOGS) {
    const out = replayed(L);
    for (const r of L.scored) {
      const was = r.seq in L.NEW ? L.NEW[r.seq] : r.result;
      const got = out.get(r.seq).id;
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
  // The Mavericks logs 1 and 2 fired: back B, forward F from the whole pitch
  // and the net; none pulled back 120-225.
  for (const [L, seq] of [[LOG1, 14], [LOG1, 21], [LOG2, 51], [LOG2, 71]]) {
    const s = L.bySeq.get(seq).saw;
    const back = (s.pathP - s.pitch) / 2 / DEG;
    assert.ok(back < 120 || back > 225, L.name + ' seq ' + seq + ': back ' + back.toFixed(0));
    assert.equal(featNow(L, L.bySeq.get(seq)).f.phMav, 0);
  }
  // Log 1 seq 33: a Matty of 202 degrees that did not climb.
  const s33 = LOG1.bySeq.get(33).saw;
  assert.ok(s33.pitchDeg < 300 && s33.loopRise < 1, 'seq 33');
  // The Matties that stay: forward 321 and 301 over an object, against the
  // nose (or of the inverted part), climbed into: 3.7 and 5.2 m above the
  // altitude 1.0 s before, by the records around then.
  for (const [L, seq] of [[LOG1, 49], [LOG2, 16]]) {
    const r = L.bySeq.get(seq);
    assert.equal(r.result, 'matty');
    assert.equal(featNow(L, r).f.phMatty, 1, L.name + ' seq ' + seq);
    assert.equal(replayed(L).get(seq).id, 'matty', L.name + ' seq ' + seq);
  }
  // Log 1 seq 7 (a Flip) and 75 (a Powerloop) climbed inside the flip after
  // a descent: not climbed into, not Matties.
  for (const seq of [7, 75]) {
    const r = LOG1.bySeq.get(seq);
    assert.ok(r.saw.alt0 < altAt(LOG1.man, r.t0 - 1.0), 'seq ' + seq + ' came down into it');
    assert.equal(featNow(LOG1, r).f.phMatty, 0, 'seq ' + seq);
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

test('log 3: the owner\'s Immelmanns stay; seq 20 and 27 are Half Mavvies, through an object, not Baranis', () => {
  const out = replayed(LOG3);
  for (const seq of [6, 10, 18]) {
    assert.equal(LOG3.bySeq.get(seq).result, 'immelmann');
    assert.equal(out.get(seq).id, 'immelmann', 'seq ' + seq);
  }
  for (const seq of [20, 27]) {
    const r = LOG3.bySeq.get(seq), s = r.saw;
    assert.equal(r.result, 'barani', 'seq ' + seq + ' fired Barani');
    // Forward 330-450 net with a half roll between its halves (the pitch
    // first), a climb of 3 m or more, 2 s or longer, upright: slow and high.
    assert.ok(s.pitchDeg >= 330 && s.pitchDeg <= 450, 'seq ' + seq + ' pitch ' + s.pitchDeg);
    assert.ok(Math.abs(s.rollDeg) >= 135 && Math.abs(s.rollDeg) <= 225 && s.rollFirst < 0, 'seq ' + seq + ' roll ' + s.rollDeg);
    assert.ok(s.loopRise >= 3 && s.dur >= 2 && s.upEnd >= 0.5, 'seq ' + seq);
    const { f } = featNow(LOG3, r);
    assert.equal(f.phHMavvy, 1, 'seq ' + seq);
    assert.equal(out.get(seq).id, 'halfmavvy', 'seq ' + seq);
    // A Barani's shape too (575 and 486 of pitch path, the half roll the
    // twist); the Half Mavvy goes through an object: under one 0.44 and 0.28
    // of the time, against the nose after the roll (by the segment's share,
    // 0.40 and 0.38), and ranks above.
    const bar = explainFeat(f).candidates.find((c) => c.id === 'barani');
    assert.ok(bar.score > 0.9, 'seq ' + seq + ' Barani ' + bar.reason);
    assert.ok(s.under >= 0.25 && Math.max(s.against, s.invAg) >= 0.3, 'seq ' + seq + ' under ' + s.under);
  }
});

test('log 3: seq 50 and 53 are Matties, climbed into; seq 56 does not fit (a Barani by the estimate)', () => {
  const out = replayed(LOG3);
  for (const seq of [50, 53]) {
    const r = LOG3.bySeq.get(seq), s = r.saw;
    assert.equal(r.result, null, 'seq ' + seq + ' scored nothing in the log');
    assert.ok(s.pitchDeg >= 250 && s.pitchDeg <= 400 && s.over > 0 && s.against >= 0.5, 'seq ' + seq);
    // Hardly a climb inside it: the climb is before it.
    assert.ok(s.loopRise < 0.3, 'seq ' + seq + ' rose ' + s.loopRise + ' inside');
    const pre = altAt(LOG3.man, r.t0 - 1.0);
    assert.ok(s.alt0 >= pre && s.alt0 + s.loopRise - pre >= 1, 'seq ' + seq + ': ' + pre.toFixed(2) + ' 1 s before, ' + s.alt0 + ' at the start');
    assert.equal(out.get(seq).id, 'matty', 'seq ' + seq);
  }
  // Seq 56: forward 260 net, but a half roll (171) and 85 back inside it, and
  // cut at the 4.5 s cap.
  const s56 = LOG3.bySeq.get(56).saw;
  assert.ok(Math.abs(s56.rollDeg) > 45 && s56.dur >= 4.5, 'seq 56');
  assert.equal(featNow(LOG3, LOG3.bySeq.get(56)).f.phMatty, 0);
  // A pitch path of 429 with a roll of 171, upright: the owner's Barani, as
  // far as the log says (it cannot say the roll was inside the pitch).
  assert.ok(s56.pathP >= 300 * DEG && Math.abs(s56.rollDeg) >= 135 && s56.upEnd >= 0.5);
  assert.equal(out.get(56).id, 'barani');
});

test('log 3: the Mavericks split across segments are one Maverick each, and no Cradle', () => {
  const out = replayed(LOG3);
  // 151.4 + 152.0: seq 65 pulls back 138 (never inverted), seq 66 pushes 131
  // forward against the nose, 0.08 s apart. 148.2: seq 61 pulls back 152
  // and pitches forward, seq 62 pulls 27, seq 63 pushes 121 against the
  // nose, the pauses 0.57 and 0.07 s.
  const s65 = LOG3.bySeq.get(65).saw, s66 = LOG3.bySeq.get(66).saw;
  assert.ok(s65.pitchDeg === -138 && s65.upMin > 0 && s66.pitchDeg === 131 && s66.against >= 0.85);
  for (const [seq, segs, before] of [[66, 2, [65]], [63, 3, [61, 62]]]) {
    const r = LOG3.bySeq.get(seq);
    assert.equal(r.result, 'cradle', 'seq ' + seq + ' fired Cradle');
    assert.deepEqual(out.get(seq), { id: 'maverick', merged: segs }, 'seq ' + seq);
    for (const b of before) {
      assert.equal(LOG3.bySeq.get(b).result, null, 'seq ' + b + ' scored nothing');
      assert.equal(out.get(b).id, null, 'seq ' + b);
      assert.ok(r.t0 - LOG3.bySeq.get(b).t < 2 && r.t0 > LOG3.bySeq.get(b).t);
    }
  }
  // Alone, the glide back is still a Cradle; merged, it is not one.
  assert.equal(classify(featNow(LOG3, LOG3.bySeq.get(66)).f).id, 'cradle');
  assert.ok(MERGE_GAP_S > 0.79 && MERGE_GAP_S < 0.81);
});

test('log 4: the Barani terms read 0 on every segment: no 1.5 s window held 300 degrees of net pitch, and the twist was roll alone', () => {
  for (const r of LOG4.scored) {
    assert.equal(r.saw.baraniPitchDeg, 0, 'seq ' + r.seq);
    assert.equal(r.saw.baraniTwistDeg, 0, 'seq ' + r.seq);
    assert.equal(r.saw.twistDeg, undefined, 'seq ' + r.seq + ': the log predates the twist');
  }
  // The old terms looked only where a 1.5 s window held 300 of net pitch.
  // The pitch turned back B and forward F (each way once: from the path and
  // the net), and neither reached 300: 28.6 and 34.2 s twisted by yaw, which
  // turns the body round, so the flip pitched it one way, then the other
  // (net -8 and -51 of 466 and 397); 38.1 s turned 299 one way, over 3.3 s.
  for (const [seq, net, path] of [[6, -8, 466], [8, -51, 397], [11, 299, 299]]) {
    const s = LOG4.bySeq.get(seq).saw;
    const B = (s.pathP - s.pitch) / 2, F = (s.pathP + s.pitch) / 2;
    assert.equal(s.pitchDeg, net, 'seq ' + seq);
    assert.equal(Math.round(s.pathP / DEG), path, 'seq ' + seq);
    assert.ok(Math.max(B, F) < 300 * DEG, 'seq ' + seq + ': back ' + Math.round(B / DEG) + ', forward ' + Math.round(F / DEG));
  }
});

test('log 4: 28.6, 34.2 and 38.1 s are Baranis (twisted by yaw, yaw and roll); 34.2 s is not a Maverick; none is a Half Mavvy', () => {
  const out = replayed(LOG4);
  for (const [seq, by] of [[6, 'yaw'], [8, 'yaw'], [11, 'roll']]) {
    const r = LOG4.bySeq.get(seq), s = r.saw;
    assert.equal(r.result, seq === 8 ? 'maverick' : null, 'seq ' + seq + ' in the log');
    // The twist: 180 +- 45 by the axis the owner names, the other small.
    const twist = by === 'yaw' ? Math.abs(s.yawDeg) : Math.abs(s.rollDeg);
    assert.ok(twist >= 135 && twist <= 225, 'seq ' + seq + ' ' + by + ' ' + twist);
    if (by === 'yaw') assert.ok(Math.abs(s.rollDeg) < 45 && s.vyawDeg >= 135, 'seq ' + seq + ': the yaw turned the heading ' + s.vyawDeg);
    const { f } = featNow(LOG4, r);
    assert.ok(f.barP >= s.pathP - 1e-9 && f.barR >= 135 * DEG && f.barR <= 225 * DEG && f.upEnd >= 0.5, 'seq ' + seq);
    assert.equal(out.get(seq).id, 'barani', 'seq ' + seq);
    // Not a Half Mavvy: under an object 0.03, 0.11 and 0.01 of the time.
    assert.ok(s.under < 0.25 && f.phHMavvy === 0, 'seq ' + seq + ' under ' + s.under);
  }
  // 38.1 s: 299 of pitch path, a hair under 300 (the term fades over 20);
  // up-Z 0.595 at the end (upright from 0.5, as the Half Mavvy's).
  const f11 = featNow(LOG4, LOG4.bySeq.get(11)).f;
  const bar11 = explainFeat(f11).candidates.find((c) => c.id === 'barani');
  assert.ok(bar11.score >= 0.9 && bar11.score < 1, 'seq 11 Barani ' + bar11.score);
  // 34.2 s fired Maverick: back 224 climbing 5.7 m, forward 173, 0.93 s
  // against the nose (as logged, today's Maverick but for the twist), and a
  // yaw of 184 between (at most 60 allowed).
  const r8 = LOG4.bySeq.get(8);
  const mv = r8.phases.maverick;
  assert.ok(mv.score === 1 && mv.ph[0].deg === 224 && mv.ph[1].deg === 173 && mv.tail >= 0.3, 'logged ' + JSON.stringify(mv));
  assert.equal(Math.abs(r8.saw.yawDeg), 184);
  assert.equal(featNow(LOG4, r8).f.phMav, 0);
  assert.equal(PHASE_SPECS.maverick.still, 1.047);
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
