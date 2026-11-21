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
//   compound tricks: three Baranis, at 28.6, 34.2 and 38.1 s;
// - tools/fixtures/tricklog-{bando,rig,depot}-bf-*.jsonl.gz, the owner's
//   dumps of 2026-11-17 and 18, each under a label of what was flown (LOGS,
//   below): orbits, Trippies, Hams and Baranis in the Bando, and the re-fly's
//   Trippies and orbits in the Rig and Baranis in the Warehouse;
// - tools/fixtures/tricklog-depot-bf-build.jsonl.gz, two flights on this
//   build (2026-11-18) in the Warehouse, one after the other in the file
//   (each from seq 1): Trippies, Orbits and Baranis (lines 1-60), then flips
//   and rolls (lines 61-91). Every term it scores is logged, so its labels
//   are exact, no estimate.
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
//     object ending inverted. 82 was a Cradle (its next best; nothing now,
//     as every Cradle, below), 73 nothing;
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
//
// The Cradle (2026-11-20) is no segment's label any more: it is two passes
// round a post, a path event (sim-tricks.js CRADLE, cradleStep). No maneuver
// here classifies as one, and the logs from before the owner's Cradle dumps
// cannot be checked for one: they carry no positions. So every Cradle they
// fired loses the label, by the owner's ruling: log 1 seq 55, 71 and 82 (82
// fired Half Matty), log 2 seq 31 and 61, the Bando Baranis' seq 14, the
// Warehouse Baranis' seq 8 and the build flight's seq 18. They pitched nose
// down (a Cradle is nose up), but four came right after a pull-up and may
// have been a real Cradle's pull and push, which the gate cannot place round
// a post with no positions: log 1 seq 54 -> 55 (back 78, then forward 138,
// 0.17 s apart) and 69 -> 71 (back 108, then 149, 0.08 s), log 3 seq 65 ->
// 66 (back 138, then 131: merged, the Maverick, which it stays) and the
// Bando Baranis' 12 -> 14 (a Barani back 117, then forward 104). The owner's
// Cradle dumps (tools/fixtures/tricklog-depot-bf-cradle-1 and -2) carry
// positions, 32 rows a record (rec.side): the gate, run on them, calls the
// owner's 12 Cradles and none of the misses. Fly 3 (-3, on the gate's build)
// carries the gate's own inputs (its cradle records): they replay to the
// owner's six Cradles and its three misses (the last two tests).
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
  NOSE_SIDE, ORBIT_WIN_S, ORBIT_RATE, TRIPPY_HOLD, BARANI_P, BARANI_FADE, BARANI_HD_LO,
  CRADLE, makeCradleGate, cradlePosts, cradleStep, cradleReset,
} from '../sim-tricks.js';
import { explainFeat, SPEC } from '../sim-tricks-debug.js';
import { DEPOT_PLAY, DEPOT_WS } from '../sim-maps.js';

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
// Since the twist, the Barani takes the heading's turn too (the yaw's own
// turn about the vertical, yawVDeg), whichever scores, nearer 180 when both
// do: a log with yawVDeg has the gates' (exact); one with the twist but not
// the heading has the twist's stretch exactly and the heading's estimated,
// from the turn about the vertical made inverted (invYawDeg; flip, yaw
// while inverted, flip, on the bf core, the two agree within 2 degrees,
// tools/test_sim_tricks.mjs), over the segment's pitch path, inside the
// pitch.
export function baraniFrom(s, g) {
  if (s.twistDeg != null) {
    // Logged since the heading: the twist by the measure that gave it
    // (barRTwist, barRHead), and which (baraniVia).
    const via = s.baraniVia || 0, rk = via ? 'barRHead' : 'barRTwist';
    const tw = { p: 'f.barP' in g ? g['f.barP'] : s.baraniPitchDeg * DEG, r: rk in g ? g[rk] : 'f.barR' in g ? g['f.barR'] : s.baraniTwistDeg * DEG, exact: true, via };
    if (s.yawVDeg != null || s.invYawDeg == null) return tw;
    const hd = { p: s.pathP, r: s.invYawDeg * DEG, exact: false, via: 1 };
    const sc = (b) => atLeastL(b.p, BARANI_P, BARANI_FADE) * (b.r >= (b.via ? BARANI_HD_LO : 2.356) && b.r <= 3.927 ? 1 : 0);
    const a = sc(tw), b = sc(hd);
    if (b > a + 1e-9 || (b > 0 && Math.abs(b - a) <= 1e-9 && Math.abs(hd.r - Math.PI) < Math.abs(tw.r - Math.PI))) return hd;
    return tw;
  }
  const yawSpan = 'v.yawSpan' in g ? g['v.yawSpan'] : s.vyawDeg * DEG;
  return { p: s.pathP, r: Math.max(Math.abs(s.roll), Math.min(Math.abs(s.yaw), yawSpan)), exact: false };
}

// classifyFeat's atLeast, for the estimates above.
function atLeastL(x, a, fade) {
  if (x >= a) return 1;
  if (!(fade > 0) || x <= a - fade) return 0;
  return (x - (a - fade)) / fade;
}

// Trippy's and Orbit's tail share (f.orbitTail, f.orbit2Tail), which no log
// has yet. Estimated: from the camera's rows when the log has them (rec.cam,
// 24 steps over the orbit's window) by the detector's own rule (a row
// upside down, or the nose up and over away from the centre and within
// NOSE_SIDE of the plane through it); else the inverted share or 1 - opp
// (the share of steps whose roll and yaw rates agree), the larger: tilted
// round an orbit the body turns about the vertical, which reads as roll and
// yaw of one sign with the nose up (the tail in) and of opposite signs with
// it down. 1 - opp reads high on a part orbit (1.0 where the rows say
// 0.52-0.65), so it backs no threshold; on the owner's whole Trippies and
// orbits the two agree.
export function tailFrom(rec, g) {
  const s = rec.saw, c = rec.cam;
  if ('f.orbitTail' in g) return { v: g['f.orbitTail'], v2: 'f.orbit2Tail' in g ? g['f.orbit2Tail'] : g['f.orbitTail'], exact: true };
  if (s.orbitTail != null) return { v: s.orbitTail, v2: s.orbit2Tail != null ? s.orbit2Tail : s.orbitTail, exact: true };
  if (c && c.rows && c.rows.length && c.cols) {
    const I = {};
    c.cols.forEach((k, i) => { I[k] = i; });
    const k = c.rows.filter((x) => x[I.upZ] < 0 || (x[I.noseDeg] > 90 && x[I.noseDeg] < 270 && x[I.side] < NOSE_SIDE)).length;
    return { v: k / c.rows.length, v2: k / c.rows.length, exact: false, from: 'cam' };
  }
  const v = Math.max(s.inv || 0, 1 - (s.opp || 0));
  return { v, v2: v, exact: false, from: 'opp' };
}

// Orbit's window (the largest turn about the vertical inside ORBIT_WIN_S,
// and the time it took) and its orbit, which no log has yet. Estimated: the
// window holds Trippy's (inside 2.4 s: the logged v.yawSpan at v.yawRate)
// at least, no less than 360 when the log fired a Trippy (its gate, 360 or
// more, logged rounded); and for a segment no longer than ORBIT_WIN_S the
// whole turn (vyawDeg, exact for a turn one way), for a longer one that at
// its mean rate. The larger, with its time: Trippy's when that is the
// larger, else the segment's, at most ORBIT_WIN_S. The orbit is Trippy's
// (the fit over the wider window holds that sweep or more).
export function slowFrom(rec, g) {
  const s = rec.saw;
  if ('v.slowSpan' in g) return { span: g['v.slowSpan'], t: 'v.slowRate' in g && g['v.slowRate'] > 0 ? g['v.slowSpan'] / g['v.slowRate'] : 0, exact: true };
  // A segment too small for the candidates logs no gates, but its saw has it.
  if (s.slowYawDeg != null) return { span: s.slowYawDeg * DEG, t: s.slowRateDeg > 0 ? s.slowYawDeg / s.slowRateDeg : 0, exact: true };
  let span = 'v.yawSpan' in g ? g['v.yawSpan'] : Math.abs(s.vyawDeg) * DEG;
  const rate = 'v.yawRate' in g ? g['v.yawRate'] : (s.vyawRateDeg || 0) * DEG;
  if (rec.result === 'trippy') span = Math.max(span, 6.2832);
  const whole = Math.abs(s.vyawDeg) * DEG;
  const long = s.dur <= ORBIT_WIN_S ? whole : whole * ORBIT_WIN_S / s.dur;
  if (span >= long) return { span, t: rate > 0 ? span / rate : 0, exact: false };
  return { span: long, t: Math.min(s.dur, ORBIT_WIN_S), exact: false };
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
//   segment's roll or yaw, the larger (net), and its push and glide back
//   near an object the segment's share (obj), or 1 when it went back out
//   through the gap it came in by; the Half Mavvy's share against the nose
//   after the roll the segment's (against, or of the inverted part, the
//   larger).
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
    maverick: B >= 1 * DEG ? ms([ph(B, { cross: absR }), ph(F, { climb: 0, cross: absR })], { tail: s.against > s.follow ? s.against * s.dur : 0, still: Math.max(absR, Math.abs(s.yaw)), near: s.gapBack ? 1 : s.obj }) : null,
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
  maverick: (s) => (Math.max(Math.abs(s.roll), Math.abs(s.yaw)) <= PHASE_SPECS.maverick.still && (s.gapBack || s.obj >= PHASE_SPECS.maverick.near) ? 1 : 0),
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
  const tail = tailFrom(rec, g);
  f.orbitTail = tail.v;
  // Orbit's window, the way the segment turned about the vertical, and its
  // orbit (slowFrom).
  const slow = slowFrom(rec, g);
  if (s.vyawDeg >= 0) { f.slowUp = slow.span; f.slowUpT = slow.t; } else { f.slowDn = slow.span; f.slowDnT = slow.t; }
  f.orbit2R = 'f.orbit2R' in g ? g['f.orbit2R'] : (s.orbit2R != null ? s.orbit2R : f.orbitR);
  f.orbit2Sweep = 'f.orbit2Sweep' in g ? g['f.orbit2Sweep'] : (s.orbit2SweepDeg != null ? s.orbit2SweepDeg * DEG : f.orbitSweep);
  f.orbit2Turn = 'f.orbit2Turn' in g ? g['f.orbit2Turn'] : (s.orbit2Turn != null ? s.orbit2Turn : f.orbitTurn);
  f.orbit2Spd = 'f.orbit2Spd' in g ? g['f.orbit2Spd'] : (s.orbit2Spd != null ? s.orbit2Spd : f.orbitSpd);
  f.orbit2Tail = tail.v2;
  f.orbit2Pole = s.orbit2Pole != null ? s.orbit2Pole : f.orbitPole;
  const bar = baraniFrom(s, g);
  f.barP = bar.p; f.barR = bar.r; f.barVia = bar.via || 0;
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
  return { f, g, flipDir, loop: lp, inv, phExact, tail, slow, bar };
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
    // The push and glide back near an object: the share its records were
    // (obj, by their steps), or 1 when the last went back out through a gap.
    const pushRecs = new Set();
    for (; i < moves.length; i++) {
      push += moves[i].turn;
      pushRecs.add(moves[i].r);
      if (moves[i].turn < 0) { back = Math.max(back, -moves[i].turn); if (-moves[i].turn > 0.785) bigBack = 1; }
    }
    let nN = 0, nObj = 0;
    for (const r of pushRecs) { nN += r.saw.n || 0; nObj += (r.saw.obj || 0) * (r.saw.n || 0); }
    const near = win[win.length - 1].saw.gapBack ? 1 : (nN ? nObj / nN : 0);
    const ms = { ph: [
      { turn: pull, t: 0, climb, up: 0, over: 0, under: 0, cross: roll, back: 0 },
      { turn: push, t: 0, climb: 0, up: 0, over: 0, under: 0, cross: roll, back: bigBack ? 9 : back },
    ], lead: 0, trail: 0, tail, still, near };
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
// An orbit scores once (finishManeuver): a record that is an Orbit going on
// the same way from one under MERGE_GAP_S before, or a piece of it turning
// on that way (TRIPPY_HOLD of ORBIT_RATE, half a turn or more, the path half
// way round or more) that is nothing or a Yaw Spin alone, scores nothing
// and carries it on (cont 1).
export function replayLog(L) {
  const man = L.recs.filter((r) => r.type === 'maneuver' && r.saw && !r.pre.short).sort((a, b) => a.t0 - b.t0);
  const out = new Map();
  let chain = [];
  let orbitEnd = -1e9, orbitSg = 0;
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
    let cont = 0;
    const on = r.t0 - orbitEnd < MERGE_GAP_S;
    if (id === 'orbit') {
      const sg = (f.slowUp || 0) >= (f.slowDn || 0) ? 1 : -1;
      if (on && sg === orbitSg) { id = null; cont = 1; }
      orbitEnd = r.t; orbitSg = sg;
    } else if ((!id || id === 'yawspin') && on) {
      const sp = orbitSg > 0 ? f.slowUp : f.slowDn, st = orbitSg > 0 ? f.slowUpT : f.slowDnT;
      if (sp >= Math.PI && st > 0 && sp >= ORBIT_RATE * TRIPPY_HOLD * st && f.orbit2Sweep >= Math.PI) {
        orbitEnd = r.t;
        if (id) { id = null; cont = 1; }
      }
    }
    out.set(r.seq, cont ? { id, merged, cont } : { id, merged });
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
      14: null, 21: null, 33: null, 80: 'immelmann', 82: null,
      // Cradles fired; no label now (see the top).
      55: null, 71: null,
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
      // Cradles fired; no label now (see the top).
      31: null, 61: null,
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
  // The owner's dumps from 2026-11-17 and 18, each a "Copy trick log" pasted
  // under a label of what was flown (NEW below each).
  // The owner's dumps of 2026-11-17 and 18, each a "Copy trick log" pasted
  // under a label of what was flown. The first four (the Bando), with no
  // counts or order to match the segments by, back the labels each fired
  // and pin only the Orbits (both fired Trippy: the orbits the owner says
  // are not Trippies); the re-fly's three pin what the owner noted flying,
  // in order. OPEN: segments no label is asserted for (said why).
  {
    name: 'bando orbits', map: 'bando', file: 'tools/fixtures/tricklog-bando-bf-orbit.jsonl.gz', records: 16, maneuvers: 10, fired: 2,
    // "This is an orbit, not a trippy spin": seq 7 and 11 (fired Trippy),
    // upright, the nose on the centre (1 - opp 0.05, 0.03).
    NEW: { 7: 'orbit', 11: 'orbit' },
  },
  {
    name: 'bando trippies', map: 'bando', file: 'tools/fixtures/tricklog-bando-bf-trippy.jsonl.gz', records: 16, maneuvers: 12, fired: 3,
    // "Real trippy spin": seq 11, 13 and 15 fired Trippy and stay.
    NEW: {},
  },
  {
    name: 'bando hams', map: 'bando', file: 'tools/fixtures/tricklog-bando-bf-ham.jsonl.gz', records: 15, maneuvers: 11, fired: 4,
    // Seq 3, 8 and 12 fired Ham and stay; seq 14 fired Barani and stays (not
    // the owner's label either way).
    NEW: {},
  },
  {
    name: 'bando baranis', map: 'bando', file: 'tools/fixtures/tricklog-bando-bf-barani.jsonl.gz', records: 31, maneuvers: 16, fired: 5,
    // Seq 6, 12, 17 and 28 fired Barani and stay; seq 14 fired Cradle (no
    // label now: see the top).
    NEW: { 14: null },
    // Unmatched to an attempt: 139 of yaw inverted over 381 of pitch path,
    // upright at the end, a Barani by the estimate (baraniFrom).
    OPEN: { 9: 'barani' },
  },
  {
    name: 'rig trippies', map: 'rig', file: 'tools/fixtures/tricklog-rig-bf-trippy.jsonl.gz', records: 25, maneuvers: 19, fired: 3,
    // The re-fly's Trippies, off the floor: seq 6, 10 and 23 (fired Trippy).
    NEW: {},
  },
  {
    name: 'rig orbits', map: 'rig', file: 'tools/fixtures/tricklog-rig-bf-orbit.jsonl.gz', records: 9, maneuvers: 9, fired: 2,
    // The re-fly's two orbits, each cut at the 4.5 s cap: seq 2 and 3 (284
    // then 360 degrees; 3 fired Trippy), seq 6, 7 and 8 (324, 345, then 432;
    // 8 fired Trippy). One Orbit each, on the piece that holds 360.
    NEW: { 3: 'orbit', 8: 'orbit' },
  },
  {
    name: 'depot baranis', map: 'depot', file: 'tools/fixtures/tricklog-depot-bf-barani.jsonl.gz', records: 26, maneuvers: 18, fired: 1,
    // The re-fly's Baranis, none fired: seq 4, 11, 18 and 22, by the
    // heading's estimate (the turn about the vertical made inverted: 159,
    // 132, 161, 166; the heading's band from 120). Seq 8 fired Cradle (no
    // label now: see the top).
    NEW: { 4: 'barani', 11: 'barani', 18: 'barani', 22: 'barani', 8: null },
  },
  {
    name: 'depot build flight', map: 'depot', file: 'tools/fixtures/tricklog-depot-bf-build.jsonl.gz', lines: [0, 60], records: 60, maneuvers: 39, fired: 10,
    // Flown on this build: every label as fired, which the owner confirmed
    // (Orbit 2, 54; Barani 15, 39, 44, 52; Trippy 18, 48; Ham 21; Juicy
    // Flick 26), every other maneuver none.
    NEW: {},
    exact: true,
  },
  {
    name: 'depot build flips and rolls', map: 'depot', file: 'tools/fixtures/tricklog-depot-bf-build.jsonl.gz', lines: [60, 91], records: 31, maneuvers: 27, fired: 11,
    // The owner's "rolls and flips" on this build, flown to be Flip or Roll
    // and never Barani: every label as fired. Flips 1, 3, 4, 24, 26 and 27,
    // and 17 the banked back flip (rolled 140 as it flipped, turned 258
    // about the vertical, 3 of it inverted); Rolls 7, 8 and 12.
    // Right after 17, which ended on its side (up-Z -0.08) with a bump: 158
    // of forward pitch, not inverted, fired Cradle. Not the owner's label;
    // no label now (see the top).
    NEW: { 18: null },
    exact: true,
  },
  // The owner's Cradle dumps (2026-11-20), with rec.side's positions. The
  // first: three Cradles round the spin pole, each a pull then a push (seq
  // 1-2, 3-4, 5-6), none fired. The second: Cradles round the spin pole and
  // the mezzanine's columns, two bad ones on purpose (one back on the same
  // side, one never back), a Cradle that clipped a column and crashed, and
  // a Maverick up through the hatch. Seq 3, 19, 22, 23, 25 and 31 fired
  // Cradle; a segment never labels one now (see the top): the gate's calls
  // are checked on the positions (the dumps test). The hatch Maverick (seq
  // 27, 68.9-70.6 s: back 120, the Maverick's floor, climbing 3.9 m through
  // the hatch, then forward and back down off the deck's edge against the
  // nose) scored nothing, its first phase unmatched; noted for later, not
  // pinned here.
  { name: 'depot cradles 1', map: 'depot', file: 'tools/fixtures/tricklog-depot-bf-cradle-1.jsonl.gz', records: 6, maneuvers: 6, fired: 0, NEW: {} },
  {
    name: 'depot cradles 2', map: 'depot', file: 'tools/fixtures/tricklog-depot-bf-cradle-2.jsonl.gz', records: 36, maneuvers: 32, fired: 6,
    NEW: { 3: null, 19: null, 22: null, 23: null, 25: null, 31: null },
  },
  // Fly 3 (2026-11-20), on the gate's build, with its cradle records (the
  // gate's inputs; the last test): Cradles round the spin pole, column 699
  // and column 700, a clip of 700, three loops up through the hatch (no
  // Maverick: the hatch miss above), and one over the top round the pole
  // into the floor. Seq 7, 14 and 35 closed at a Cradle's second pass (the
  // record's result is the Cradle's; the segment alone scores none). Seq 41
  // fired Roll, right after the floor (as fired; the owner's label not given).
  // Its decimated rows predate 214bf09 (yrLost: a row's yr is its own step's
  // only).
  {
    name: 'depot cradles 3', map: 'depot', file: 'tools/fixtures/tricklog-depot-bf-cradle-3.jsonl.gz', records: 42, maneuvers: 25, fired: 4,
    NEW: { 7: null, 14: null, 35: null }, yrLost: true,
  },
];
for (const L of LOGS) {
  // A file can hold more than one flight (seq restarts at 1): lines [a, b).
  L.recs = readLog(L.file).slice(...(L.lines || []));
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
      assert.equal(r.map, L.map || 'depot');
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
      const { f, g, flipDir, bar } = featFromLog(r);
      const now = gateValues(explainFeat(f));
      const loopDir = featView(f).loopDir;
      for (const k of Object.keys(g)) {
        // The sweep is now measured the loop's way, which can differ from the
        // flip's.
        if (k === 'v.loopSweep' && loopDir !== flipDir) continue;
        if (!(k in now)) continue;   // a gate a later change removed
        // A matcher trick defined differently since the log (log 3's).
        if (/^f\.ph(Mav|Matty|HMatty|HMavvy)$/.test(k)) continue;
        // The Barani's terms, measured since by the twist, and by the
        // heading where it scores (baraniFrom).
        if ((k === 'f.barP' || k === 'f.barR') && (r.saw.twistDeg == null || (r.saw.yawVDeg == null && bar.via))) continue;
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
      if (L.OPEN && r.seq in L.OPEN) continue;
      const got = out.get(r.seq).id;
      const want = r.seq in L.NEW ? L.NEW[r.seq] : r.result;
      if (got !== want) off.push('seq ' + r.seq + ' is ' + got + ', want ' + want + ' (the log fired ' + r.result + ')');
    }
    assert.deepEqual(off, [], L.name);
  }
  // The labels that change: every fired one listed, and the unlabelled ones
  // that score now.
  const changed = LOGS.slice(0, 4).flatMap((L) => L.scored.filter((r) => r.seq in L.NEW && L.NEW[r.seq] !== r.result && (r.result || L.name === 'log 3' || L.NEW[r.seq] === 'barani')).map((r) => L.name + ' seq ' + r.seq + ' ' + (r.result || 'none') + '->' + (L.NEW[r.seq] || 'none')));
  assert.deepEqual(changed, [
    'log 1 seq 14 maverick->none', 'log 1 seq 21 maverick->none', 'log 1 seq 33 matty->none',
    'log 1 seq 55 cradle->none', 'log 1 seq 71 cradle->none',
    'log 1 seq 80 snapback->immelmann', 'log 1 seq 82 halfmatty->none',
    'log 2 seq 26 flip->ham', 'log 2 seq 31 cradle->none', 'log 2 seq 33 none->barani', 'log 2 seq 40 none->barani',
    'log 2 seq 51 maverick->none', 'log 2 seq 61 cradle->none', 'log 2 seq 71 maverick->none', 'log 2 seq 73 halfmatty->none',
    'log 3 seq 20 barani->halfmavvy', 'log 3 seq 27 barani->halfmavvy', 'log 3 seq 50 none->matty', 'log 3 seq 53 none->matty',
    'log 3 seq 56 none->barani', 'log 3 seq 63 cradle->maverick', 'log 3 seq 66 cradle->maverick',
    'log 4 seq 4 none->barani', 'log 4 seq 6 none->barani', 'log 4 seq 8 maverick->barani', 'log 4 seq 11 none->barani',
  ]);
});

test('the dumps of 2026-11-17 and 18: every label that changes, and the open ones', () => {
  const NEWER = LOGS.slice(4);
  const changed = NEWER.flatMap((L) => L.scored.filter((r) => r.seq in L.NEW && L.NEW[r.seq] !== r.result).map((r) => L.name + ' seq ' + r.seq + ' ' + (r.result || 'none') + '->' + (L.NEW[r.seq] || 'none')));
  assert.deepEqual(changed, [
    'bando orbits seq 7 trippy->orbit', 'bando orbits seq 11 trippy->orbit',
    'bando baranis seq 14 cradle->none',
    'rig orbits seq 3 trippy->orbit', 'rig orbits seq 8 trippy->orbit',
    'depot baranis seq 4 none->barani', 'depot baranis seq 8 cradle->none', 'depot baranis seq 11 none->barani', 'depot baranis seq 18 none->barani', 'depot baranis seq 22 none->barani',
    'depot build flips and rolls seq 18 cradle->none',
    'depot cradles 2 seq 3 cradle->none', 'depot cradles 2 seq 19 cradle->none', 'depot cradles 2 seq 22 cradle->none',
    'depot cradles 2 seq 23 cradle->none', 'depot cradles 2 seq 25 cradle->none', 'depot cradles 2 seq 31 cradle->none',
    'depot cradles 3 seq 7 cradle->none', 'depot cradles 3 seq 14 cradle->none', 'depot cradles 3 seq 35 cradle->none',
  ]);
  // What the open ones read now (not asserted as the owner's).
  const open = NEWER.flatMap((L) => Object.keys(L.OPEN || {}).map((seq) => L.name + ' seq ' + seq + ' ' + (replayed(L).get(Number(seq)).id || 'none')));
  assert.deepEqual(open, ['bando baranis seq 9 barani']);
  // Every label they fired that stays: the Trippies, Hams and Baranis.
  const kept = (L, id) => L.scored.filter((r) => r.result === id && replayed(L).get(r.seq).id === id).map((r) => r.seq);
  const [BO, BT, BH, BB, RT] = NEWER;
  assert.deepEqual(kept(BT, 'trippy'), [11, 13, 15]);
  assert.deepEqual(kept(BH, 'ham'), [3, 8, 12]);
  assert.deepEqual(kept(BH, 'barani'), [14]);
  assert.deepEqual(kept(BB, 'barani'), [6, 12, 17, 28]);
  assert.deepEqual(kept(RT, 'trippy'), [6, 10, 23]);
  assert.equal(BO.scored.filter((r) => r.result === 'trippy').length, 2);
});

test('the dumps: Trippy is the tail to the centre, an upright orbit with the nose on it an Orbit (the tail share estimated), and one orbit cut at the cap scores once', () => {
  const [BO, BT, , , RT, RO] = LOGS.slice(4);
  const tail = (L, seq) => tailFrom(L.bySeq.get(seq), gateValues(L.bySeq.get(seq)));
  // The re-fly's rows (24 a segment over the orbit's window), by the
  // detector's rule: the Trippies 0.92-1, the orbits 0.
  for (const seq of [6, 10, 23]) {
    const t = tail(RT, seq);
    assert.equal(t.from, 'cam');
    assert.ok(t.v >= 0.9, 'rig trippies seq ' + seq + ' tail ' + t.v);
  }
  for (const seq of [2, 3, 6, 7, 8]) assert.equal(tail(RO, seq).v, 0, 'rig orbits seq ' + seq);
  // The Bando's, by 1 - opp: the Trippies 0.98-1, the orbits 0.03-0.05.
  for (const seq of [11, 13, 15]) assert.ok(tail(BT, seq).v >= 0.95, 'bando trippies seq ' + seq);
  for (const seq of [7, 11]) assert.ok(tail(BO, seq).v <= 0.06, 'bando orbits seq ' + seq);
  // The orbits' pieces: 2 then 3, and 6, 7 then 8, each under MERGE_GAP_S
  // from the one before; one Orbit each.
  const out = replayed(RO);
  assert.deepEqual([2, 3, 5, 6, 7, 8].map((s) => out.get(s).id), [null, 'orbit', null, null, null, 'orbit']);
  for (const [a, b] of [[2, 3], [6, 7], [7, 8]]) assert.ok(RO.bySeq.get(b).t0 - RO.bySeq.get(a).t < MERGE_GAP_S, a + ' to ' + b);
});

test('the build flight: every Trippy, Orbit and Barani term logged (exact, no estimate), and each label as it fired', () => {
  const L = LOGS.find((x) => x.name === 'depot build flight');
  for (const r of L.scored) {
    const g = gateValues(r);
    const { tail, slow, bar } = featFromLog(r, { pre: altAt(L.man, r.t0 - 1.0) });
    assert.ok(tail.exact && slow.exact && bar.exact, 'seq ' + r.seq + ' exact');
    assert.ok(r.saw.yawVDeg != null && r.saw.orbitTail != null && r.saw.slowYawDeg != null, 'seq ' + r.seq + ' logged');
    // Each segment big enough for the candidates logs their gates.
    if (!r.pre.tiny) assert.ok('f.orbitTail' in g && 'v.slowSpan' in g && ('barRHead' in g || 'barRTwist' in g), 'seq ' + r.seq + ' gates');
  }
  const out = replayed(L);
  const fired = L.scored.filter((r) => out.get(r.seq).id).map((r) => r.seq + ' ' + out.get(r.seq).id);
  assert.deepEqual(fired, ['2 orbit', '15 barani', '18 trippy', '21 ham', '26 juicyflick', '39 barani', '44 barani', '48 trippy', '52 barani', '54 orbit']);
  // The Baranis' half twists: by the heading (the yaw made inverted) 197,
  // 174, 179; seq 44 by the twist about the path, 166.
  const tw = (seq) => { const b = featFromLog(L.bySeq.get(seq)).bar; return [b.via, Math.round(b.r / DEG)]; };
  assert.deepEqual([15, 39, 44, 52].map(tw), [[1, 197], [1, 174], [0, 166], [1, 179]]);
});

test('the build flight of flips and rolls: exact terms, each label as it fired, and never a Barani', () => {
  const L = LOGS.find((x) => x.name === 'depot build flips and rolls');
  for (const r of L.scored) {
    const g = gateValues(r);
    const { tail, slow, bar } = featFromLog(r, { pre: altAt(L.man, r.t0 - 1.0) });
    assert.ok(tail.exact && slow.exact && bar.exact, 'seq ' + r.seq + ' exact');
    assert.ok(r.saw.yawVDeg != null && r.saw.orbitTail != null && r.saw.slowYawDeg != null, 'seq ' + r.seq + ' logged');
    if (!r.pre.tiny) assert.ok('f.orbitTail' in g && 'v.slowSpan' in g && ('barRHead' in g || 'barRTwist' in g), 'seq ' + r.seq + ' gates');
  }
  const out = replayed(L);
  const fired = L.scored.filter((r) => out.get(r.seq).id && !(L.OPEN && r.seq in L.OPEN)).map((r) => r.seq + ' ' + out.get(r.seq).id);
  assert.deepEqual(fired, ['1 flip', '3 flip', '4 flip', '7 roll', '8 roll', '12 roll', '17 flip', '24 flip', '26 flip', '27 flip']);
  for (const r of L.scored) {
    assert.notEqual(out.get(r.seq).id, 'barani', 'seq ' + r.seq);
    assert.notEqual(classify(featNow(L, r).f).id, 'barani', 'seq ' + r.seq);
  }
  // Seq 17, the banked back flip: 258 about the vertical, but 3 of it made
  // inverted, so the heading reads no half twist. The twist about the path
  // reads 161, in its band: it is no Barani because it ended on its side
  // (BARANI_SIDE, up-Z -0.08).
  const r17 = L.bySeq.get(17), s17 = r17.saw;
  assert.ok(Math.abs(s17.rollDeg) >= 135 && s17.vyawDeg >= 250 && Math.abs(s17.yawVDeg) <= 5, 'seq 17');
  assert.ok(Math.abs(s17.yawVDeg) * DEG < BARANI_HD_LO, 'seq 17 heading');
  assert.equal(r17.barani.limit, 'BARANI_SIDE');
  assert.ok(Math.abs(r17.barani.twistDeg) >= 135 && Math.abs(r17.barani.twistDeg) <= 225, 'seq 17 twist ' + r17.barani.twistDeg);
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
  // Both dropped back near an object (the push and glide records 0.95-1.0
  // of their steps within 2 m of one).
  for (const seq of [61, 62, 63, 65, 66]) assert.ok(LOG3.bySeq.get(seq).saw.obj >= 0.9, 'seq ' + seq + ' near an object');
  // Alone, the glide back is nothing (no segment labels a Cradle: it is two
  // passes round a post); merged, the Maverick.
  assert.ok(!classify(featNow(LOG3, LOG3.bySeq.get(66)).f).id);
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

// The owner's Cradle dumps' positions (rec.side.rows: 32 rows a record, each
// t, seg, x, y, z (sim-core m), the velocity along and across the heading,
// vz, the nose's elevation, its pitch in the heading's plane, noseDot, the
// heading, up-Z, ...), merged over the overlapping records (a row every 0.03
// s or more), each at rec.t0 + t (the record's own clock: the page's at the
// segment's start, plus the row's time from it; the same offset from the
// detector's for the whole flight). The nose rebuilt from its elevation and
// heading (turned round past 90 of pitch in the heading's plane), the
// velocity from the heading's frame, the turn about the vertical from the
// nose's heading row to row (while it is under 70 degrees up). No contact is
// logged, so none is fed. A gap of 0.4 s in the rows starts the gate over.
// The posts:
// the Warehouse's, as the page builds its colliders (DEPOT_PLAY's boxes at
// DEPOT_WS), the objects the dumps name (the spin pole 1109, the mezzanine's
// columns 699 and 700).
const DEPOT_COLS = DEPOT_PLAY.boxes.map((b) => ({
  min: { x: b.min[0] * DEPOT_WS, y: b.min[1] * DEPOT_WS, z: b.min[2] * DEPOT_WS },
  max: { x: b.max[0] * DEPOT_WS, y: b.max[1] * DEPOT_WS, z: b.max[2] * DEPOT_WS },
}));
function gateOnRows(L) {
  const rows = [];
  for (const r of L.recs) {
    if (!r.side || !r.side.rows) continue;
    for (const w of r.side.rows) rows.push({ t: r.t0 + w[0], w });
  }
  rows.sort((a, b) => a.t - b.t);
  const fresh = () => { const g = makeCradleGate([]); cradlePosts(g, DEPOT_COLS, DEPOT_WS); return g; };
  let g = fresh(), seen = 0, prev = -1e9, prevAz = null;
  const out = [];
  const drain = () => { while (seen < g.seq) { seen++; const v = g.out.find((o) => o.seq === seen); if (v) out.push(v); } };
  for (const { t, w } of rows) {
    if (t - prev < 0.03) continue;
    if (t - prev > 0.4) { drain(); g = fresh(); seen = 0; prevAz = null; }
    prev = t;
    const [, , x, y, z, va, vl, vz, nEl, pH, , hd, upZ] = w;
    const h = hd * DEG, az = (Math.abs(pH) > 90 ? hd + 180 : hd) * DEG, el = nEl * DEG;
    const Fx = Math.cos(h), Fy = Math.sin(h);
    let yr = 0;
    if (prevAz != null && Math.abs(nEl) < 70) { yr = az - prevAz; while (yr > Math.PI) yr -= 2 * Math.PI; while (yr < -Math.PI) yr += 2 * Math.PI; }
    if (Math.abs(nEl) < 70) prevAz = az;
    Object.assign(g.inp, {
      t, x, y, z, vx: va * Fx - vl * Fy, vy: va * Fy + vl * Fx, vz,
      fx: Math.cos(el) * Math.cos(az), fy: Math.cos(el) * Math.sin(az), fz: Math.sin(el), upZ, contact: 0, yr,
    });
    cradleStep(g);
    drain();
  }
  return out;
}

test('the owner\'s Cradle dumps: the gate, on their positions, calls each of the 12 Cradles at its second pass, and none of the misses', () => {
  const C1 = LOGS.find((L) => L.name === 'depot cradles 1'), C2 = LOGS.find((L) => L.name === 'depot cradles 2');
  const v1 = gateOnRows(C1), v2 = gateOnRows(C2);
  // Each call: the post, the first pass and the second (s, within 0.05).
  const calls = (vs, want) => {
    const got = vs.filter((v) => v.result === 'cradle');
    assert.equal(got.length, want.length, got.map((v) => v.obj + ' ' + v.t1 + '-' + v.t2).join(', '));
    want.forEach(([obj, t1, t2], k) => {
      const v = got[k];
      assert.ok(v.obj === obj && Math.abs(v.t1 - t1) <= 0.05 && Math.abs(v.t2 - t2) <= 0.05, 'call ' + k + ': ' + JSON.stringify(v));
    });
  };
  // The first dump: three round the spin pole (1109).
  calls(v1, [[1109, 13.59, 14.9], [1109, 18.46, 19.66], [1109, 22.91, 24.25]]);
  // The second: six round the spin pole, three round the columns (699 once,
  // 700 twice), in the order flown.
  calls(v2, [
    [1109, 23.71, 24.51], [1109, 27.26, 28.32], [699, 32.99, 33.91], [1109, 52.54, 53.66], [1109, 55.9, 57.34],
    [700, 60.95, 62.3], [700, 65.4, 66.72], [1109, 75.79, 76.86], [1109, 78.98, 80.25],
  ]);
  // The misses flown as Cradles, each with its miss and no Cradle: the one
  // that clipped column 699 and crashed (16.4-18.6 s), the one back on the
  // same side, climbing (37.4 s), the one that slid wide and never came back
  // abeam (44.5 s); and the Maverick up through the hatch (68.9-71.5 s).
  const missAt = (obj, t) => v2.find((o) => !o.result && o.obj === obj && Math.abs(o.t1 - t) < 0.3);
  for (const [obj, t, a, b] of [[699, 17.2, 16.4, 18.6], [1109, 37.5, 37.3, 39.5], [1109, 44.5, 44.4, 47.3]]) {
    assert.ok(missAt(obj, t), 'a miss for post ' + obj + ' at ' + t);
    assert.ok(!v2.some((v) => v.result && v.t2 >= a && v.t2 <= b), 'no Cradle ' + a + '-' + b);
  }
  assert.equal(missAt(1109, 37.5).why, 'same side');
  assert.ok(!v2.some((v) => v.result && v.t2 > 68 && v.t2 < 72), 'the hatch Maverick');
  // Every Cradle clear of each threshold: the margins the gate was set with.
  for (const v of [...v1, ...v2].filter((o) => o.result)) {
    const tag = v.obj + ' ' + v.t1;
    assert.ok(Math.abs(v.lat1) <= CRADLE.outLat - 0.5, tag + ' out ' + v.lat1);
    assert.ok(Math.abs(v.lat2) <= CRADLE.backLat - 0.4, tag + ' back ' + v.lat2);
    assert.ok(Math.sign(v.lat1) !== Math.sign(v.lat2), tag + ' the other side');
    assert.ok(v.elMax >= CRADLE.noseUp + 10 && v.pMax <= CRADLE.overTop, tag + ' nose ' + v.elMax + ' / ' + v.pMax);
    // (The dumps' turn is their heading's, row to row: positions only.)
    assert.ok(v.yawDeg <= CRADLE.yawTurn - 20 && v.yawRecent <= CRADLE.yawRecent - 10, tag + ' turned ' + v.yawDeg + ' net, ' + v.yawRecent + ' at the second pass');
    assert.ok(v.offNose >= CRADLE.backDeg + 15, tag + ' off the nose ' + v.offNose);
    assert.ok(-v.vBack >= CRADLE.backSpd + 1.5, tag + ' back at ' + v.vBack);
    assert.ok(v.upZ >= CRADLE.upZ + 0.5, tag + ' up-Z ' + v.upZ);
    assert.ok(v.dt <= CRADLE.maxS - 1, tag + ' ' + v.dt + ' s');
  }
});

// Fly 3's cradle records replayed: makeCradleGate on the record's posts, then
// cradleStep a row at a time (a reset before a fresh row; a disarmed row a
// reset and no step), on the record's rows or those of the record it shares
// (inputs.same). A log's decimated rows from before 214bf09 (L.yrLost; fly
// 3's misses, every 8 ms) carry a row's yr for its own step only (the step
// left out before it lost), so each is taken times the 4 ms steps it stands
// for; later logs sum it. Returns the verdicts.
function replayFly(L, rec) {
  const src = rec.inputs.rows ? rec : L.bySeq.get(rec.inputs.same);
  const { cols, rows, every } = src.inputs;
  const ix = (k) => cols.indexOf(k);
  const I = ['t', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'fx', 'fy', 'fz', 'upZ', 'contact', 'yr'].map(ix);
  const g = makeCradleGate(rec.posts);
  let prevT = null;
  for (const row of rows) {
    if (row[ix('fresh')]) cradleReset(g);
    const s = g.inp;
    [s.t, s.x, s.y, s.z, s.vx, s.vy, s.vz, s.fx, s.fy, s.fz, s.upZ, s.contact, s.yr] = I.map((k) => row[k]);
    if (L.yrLost && every > 0 && prevT != null) s.yr *= Math.max(1, Math.round((s.t - prevT) / 0.004));
    prevT = s.t;
    if (!row[ix('armed')]) { cradleReset(g); continue; }
    cradleStep(g);
  }
  return g.out;
}

test('fly 3 on the gate\'s build: its cradle records replay to the owner\'s six Cradles, the clip, the same side and the one over the top', () => {
  const L = LOGS.find((x) => x.name === 'depot cradles 3');
  const recs = L.recs.filter((r) => r.type === 'cradle');
  assert.equal(recs.length, 10);
  // As logged (the build's heading rule: the nose's level heading within 55
  // of F1): four Cradles; the two the owner labels Cradles as well (seq 12
  // round column 700, seq 31 round the pole) were voided turned round, 55
  // off F1 with the nose 51-64 up, though they turned 38 and 22 about the
  // vertical.
  assert.deepEqual(recs.filter((r) => r.result).map((r) => r.gate.obj + ' ' + r.gate.t1), ['1109 5.552', '699 13.764', '700 24.656', '1109 46.684']);
  for (const seq of [12, 31]) {
    const g = L.bySeq.get(seq).gate;
    assert.ok(g.why === 'turned round' && g.yawDev >= 55 && g.yawDeg <= 40, 'seq ' + seq + ' ' + JSON.stringify(g));
  }
  // Replayed now: each verdict once (records that share rows replay alike),
  // in the order flown (the gate's clock, s).
  const seen = new Map();
  for (const r of recs) for (const v of replayFly(L, r)) seen.set(v.obj + ' ' + v.t1 + ' ' + v.t2, v);
  const vs = [...seen.values()].sort((a, b) => a.t2 - b.t2);
  const near = (v, obj, t1, t2) => v.obj === obj && Math.abs(v.t1 - t1) <= 0.02 && Math.abs(v.t2 - t2) <= 0.02;
  const got = vs.filter((v) => v.result === 'cradle');
  const want = [[1109, 5.552, 6.64], [699, 13.764, 14.552], [700, 20.804, 21.924], [700, 24.656, 25.692], [1109, 43.76, 44.688], [1109, 46.684, 47.752]];
  assert.equal(got.length, want.length, got.map((v) => v.obj + ' ' + v.t1 + '-' + v.t2).join(', '));
  want.forEach(([obj, t1, t2], k) => assert.ok(near(got[k], obj, t1, t2), 'Cradle ' + k + ': ' + JSON.stringify(got[k])));
  // The misses flown with them: the clip of column 700 (the quad's centre
  // within 0.06 m of it), the hatch climb back on 700's same side, and the
  // nose over the top round the pole (then the floor).
  const miss = (obj, t1, why) => vs.find((v) => !v.result && v.obj === obj && Math.abs(v.t1 - t1) <= 0.02 && v.why === why);
  assert.ok(miss(700, 17.06, 'hit the post'), 'the clip');
  assert.ok(miss(700, 37.512, 'same side'), 'the hatch climb');
  assert.ok(miss(1109, 49.68, 'over the top'), 'over the top');
  // Nothing else: seq 30's attempt round 700 (armed at 42.6, turning) is
  // dropped unjudged when the Cradle round the pole is called at 44.688.
  assert.equal(vs.length, 9, vs.map((v) => (v.result || v.why) + ' ' + v.obj + ' ' + v.t1).join(', '));
  // The clip and the same side are judged as the build judged them: their
  // turn as logged (the rows' yr made whole, L.yrLost).
  for (const [seq, obj, t1, why] of [[10, 700, 17.06, 'hit the post'], [26, 700, 37.512, 'same side']]) {
    const lg = L.bySeq.get(seq).gate, v = miss(obj, t1, why);
    assert.ok(lg.obj === obj && lg.why === why && Math.abs(v.yawDeg - lg.yawDeg) <= 1, 'seq ' + seq + ' logged ' + lg.yawDeg + ', replayed ' + v.yawDeg);
  }
  // Every Cradle's turn about the vertical clear of the cap (the debug test:
  // the slow orbits that are not, 63 or more), and not turning at the pass.
  // Seq 12's 40 is rebuilt from rows every 8 ms (to a degree or so).
  for (const v of got) assert.ok(v.yawDeg <= CRADLE.yawTurn - 15 && v.yawRecent <= CRADLE.yawRecent - 10, v.obj + ' ' + v.t1 + ' turned ' + v.yawDeg + ', ' + v.yawRecent + ' at the pass');
  // The sloppiest, seq 12 round column 700: back 2.13 m out, 123 off the nose
  // (8 over backDeg), up-Z 0.45.
  const s12 = got[2];
  assert.ok(Math.abs(s12.lat2) <= CRADLE.backLat - 0.8 && s12.offNose >= CRADLE.backDeg + 5 && s12.upZ >= 0.4, JSON.stringify(s12));
});
