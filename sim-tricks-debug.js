// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim — the trick detector's debug overlay, behind ?tricks=debug.
//
// What it is for: when a trick does not score (or scores as something else),
// show what the detector saw, every threshold it checked and why each
// candidate fired or missed, and log each attempt to the console as JSON.
//
// How it stays out of the way:
// - sim.html loads this file only with ?tricks=debug (a dynamic import), so
//   without the flag nothing here runs or is fetched.
// - It does not change the detector. sim-tricks.js is untouched; this file
//   reads the detector object from outside (tricks.detector()) before and
//   after each tricks.tick, and re-runs the classifier's own arithmetic on
//   the finished maneuver's features (explainFeat). Nothing here writes to
//   the detector, the combo or the store.
// - GATES below is a copy of classifyFeat's score terms (sim-tricks.js), in
//   the same order with the same numbers. tools/test_sim_tricks_debug.mjs
//   reads classifyFeat's source and fails if a number, a feature or the order
//   differs, and checks the replica picks what classifyFeat picks. At run
//   time each record carries classifyFeat's own pick; a disagreement is
//   flagged (mismatch: true) rather than hidden.
//
// Units, as the detector has them: angles in rad (the overlay shows degrees),
// span/drop/alt in m, travelH/rad in scene units (WS = 3.5 per m), speeds m/s.
import {
  classifyFeat, featView, makeFeat, copyFeat, upZParts, trickName,
  RATE_START, TRICK_BY_ID, mapIsIndoor,
  GAP_SIDE_K, GAP_MIN_DEPTH_M, GAP_NEAR_M, FRAME_W_M, TRIPPY_POLE_MUL, MAV_GAP_MUL, PHASE_SPECS,
  HIST_W, BH_W, PH_ROWS, BARANI_P, BARANI_FADE, BARANI_SIDE, BARANI_HD_LO,
  CRADLE, groupBoxes, simBoxes, cradlePostList,
} from './sim-tricks.js?v=db0c667a41a5';

// classifyFeat's candidate order and specificity bonus (sim-tricks.js
// CLASS_IDS, SPEC), and the score a pick needs.
export const CLASS_IDS = Object.freeze([
  'halfmavvy', 'rubik', 'cubik', 'barani', 'immelmann', 'ham', 'trippy', 'orbit', 'sideloop', 'juicyflick', 'snapback', 'halfmatty',
  'powerloop', 'matty', 'maverick', 'splits', 'flip', 'roll', 'yawspin',
]);
export const SPEC = Object.freeze({
  halfmavvy: 0.13, rubik: 0.12, cubik: 0.12, barani: 0.12, immelmann: 0.12, ham: 0.11, trippy: 0.11, orbit: 0.05, sideloop: 0.11, juicyflick: 0.11, snapback: 0.11,
  halfmatty: 0.10, powerloop: 0.11, matty: 0.11, maverick: 0.10, splits: 0.10,
  flip: 0, roll: 0, yawspin: 0,
});
export const PICK_MIN = 0.42;
export const SPEC_MIN = 0.15;
// classifyFeat's flip fallback: a pitch rotation this big is never nothing.
export const FLIP_FALLBACK = 5.236;
const FLIP_WIN_LABEL = '1.2 s';

// The object beside the path (rec.side), for the debug log only: nothing
// scores it. The observer keeps every step, in a segment or not, in a ring
// of cap steps. A maneuver's (or a dropped segment's) rec.side reads it from
// preS before the segment's first step (the merge's, for a compound trick)
// to its end, and again postS after the end (a glide back outlasts the
// segment), or sooner at a respawn or a change of colliders, which clear the
// ring. An object is a box, or boxes face to face with matching faces
// (within cellM; the cells a mesh is split into); a pole touching a ceiling
// is two. A box is beside the path when the quad is not over or under it
// and its height comes within bandM of the quad's; each step the kNear
// nearest objects beside the path within passM are logged (each by its
// nearest box). A pass: an object's nearest point going from ahead of the
// direction of travel to behind it, by hystM or hystK of its distance
// either way, moving at minSpd or more and the direction of travel turned
// under turnDot's angle (a turnaround is no pass); read where the object
// was nearest since it was last ahead. Rolls and yaws do not move it. The
// objects are sim-tricks.js groupBoxes' (cellM: CRADLE.cellM) and the posts
// its cradlePostList's (CRADLE), the Cradle's own.
export const SIDE = Object.freeze({
  preS: 3, postS: 4, cap: 6144, bandM: 2, kNear: 12,
  passM: 4, minSpd: 0.5, hystM: 0.1, hystK: 0.25, turnDot: 0.7, passMax: 24, rows: 32,
  // postLat: a post's crossings farther to the side than this are not
  // listed; postMax: posts listed at most.
  postLat: 4, postMax: 8,
});

// The Cradle's own log: a record of type 'cradle' per step with verdicts of
// sim-tricks.js cradleStep (each Cradle, and each miss that got as far as an
// attempt: the nose up; a crash, a respawn or a disarm ends one too), the
// first (the Cradle, if one) in gate, the rest in others. Its inputs, every
// step (a miss's every missDt, a row standing for the steps since the last:
// their turn summed, a touch, reset or disarm on any; and on to CRADLE.maxS
// past its first pass:
// what came after an early void; a miss whose window starts inside the
// last miss record's shares its rows: inputs.same, that record's seq,
// which runs on to cover both, 6 s at most), from preS before the first
// pass to the
// verdict, and again (the same record) to postS after it, at most cap steps
// kept: enough to replay the verdict (makeCradleGate, then cradleStep on
// each row; the rows past it let a replay whose rounded positions put the
// second pass a step later still see it).
export const CRADLE_LOG = Object.freeze({ preS: 0.6, postS: 0.3, cap: 2048, missDt: 0.008 });

// stepDetector's spatial constants (sim-tricks.js DIVE_*, GAP_*), the dive
// fallback inside classifyFeat, and the segment-start numbers.
export const DIVE = Object.freeze({ vzStart: -6.5, speedStart: 8, altStart: 4, drop: 3.4, speedHold: 5.5, vzHold: -4.5, vzCancel: -2, cooldown: 3.2 });
export const DIVE_FALLBACK = Object.freeze({ drop: 3.2, spdPeak: 8, vzMin: -6.2, absP: 3.2, absR: 2.2, pathY: 2.0 });
// The gap rule's numbers are sim-tricks.js' own exports (imported above).
export const GAP = Object.freeze({ sideK: GAP_SIDE_K, minDepth: GAP_MIN_DEPTH_M, near: GAP_NEAR_M, frameW: FRAME_W_M });
export const SEG = Object.freeze({ divingThr: 0.18, divingRate: 1.55, divingVz: -3.8, contact: 0.08 });

// The ten the overlay spells out (the brief's list). Inverted yaw spin is
// Ham Spin ('ham'); dive is stepDetector's state machine. Gap passes are not
// a trick: the overlay shows them on a line of their own, after these.
export const FOCUS = Object.freeze(['flip', 'roll', 'powerloop', 'splits', 'matty', 'trippy', 'juicyflick', 'ham', 'barani', 'dive']);

const ge = (src, a, fade) => ({ op: '>=', src, a, fade });
const le = (src, a, fade) => ({ op: '<=', src, a, fade });
const band = (src, lo, hi, fade) => ({ op: 'band', src, a: lo, b: hi, fade });
const floorOf = (g, min) => ({ op: 'floor', parts: [g], min });
const either = (g1, g2) => ({ op: 'max', parts: [g1, g2] });

// classifyFeat's mul(...) terms, per candidate, in its order. src is the
// expression classifyFeat passes (the test matches it against the source).
// The phase matcher's tricks have one term, the matcher's score (f.ph...);
// each record's phases say what it measured (phaseRecord).
export const GATES = Object.freeze({
  halfmavvy: [
    ge('f.phHMavvy', 1, 1),
  ],
  rubik: [
    ge('v.pathP', 5.2, 0.7), ge('v.pathR', 5.2, 0.7), ge('absP', 4.4, 0.6), ge('absR', 4.4, 0.6),
    ge('pitchFirst', 0.0, 0.12), ge('v.inv', 0.12, 0.08), le('absY', 2.4, 0.7),
  ],
  cubik: [
    ge('v.pathP', 5.2, 0.7), ge('v.pathR', 5.2, 0.7), ge('absP', 4.4, 0.6), ge('absR', 4.4, 0.6),
    ge('rollFirst', 0.0, 0.12), ge('v.inv', 0.12, 0.08), le('absY', 2.4, 0.7),
  ],
  trippy: [
    ge('v.yawSpan', 6.2832, 0), ge('v.yawRate', 2.618, 0), ge('f.orbitR', 0.3, 0),
    ge('f.orbitSweep', 6.2832, 0), ge('f.orbitTurn', 0.8, 0), ge('f.orbitSpd', 1.0, 0),
    ge('f.orbitTail', 0.7, 0),
  ],
  orbit: [
    ge('v.slowSpan', 6.2832, 0), ge('v.slowRate', 1.571, 0), ge('f.orbit2R', 0.3, 0),
    ge('f.orbit2Sweep', 6.2832, 0), ge('f.orbit2Turn', 0.8, 0), ge('f.orbit2Spd', 1.0, 0),
    le('f.orbit2Tail', 0.3, 0),
  ],
  barani: [
    ge('f.barP', 5.236, 0.35), either(band('barRTwist', 2.356, 3.927, 0), band('barRHead', 2.094, 3.927, 0)), ge('f.upEnd', 0.5, 0),
  ],
  immelmann: [
    ge('f.phImmel', 1, 1),
  ],
  ham: [
    ge('v.invYaw', 5.236, 0),
  ],
  sideloop: [
    ge('Math.max(absR, v.pathR)', 3.2, 0.7), ge('Math.max(absY, v.pathY)', 1.15, 0.4), ge('v.span', 1.5, 0.5),
    ge('v.inv', 0.10, 0.08), le('absP', 2.4, 0.6), le('v.opp', 0.45, 0.15), ge('yawFirst', 0.0, 0.14),
    ge('f.dur', 0.45, 0.12), ge('f.spdPeak', 1.2, 0.4), le('v.close', 1.15, 0.15),
    floorOf(ge('objU', 0.08, 0.08), 0.58),
  ],
  juicyflick: [
    ge('f.pitch', 2.0, 0.5), band('absP', 2.2, 4.6, 0.45), band('absR', 2.0, 4.6, 0.45),
    ge('pitchFirst', 0.02, 0.10), ge('v.inv', 0.08, 0.06), le('absY', 2.2, 0.6),
    le('v.pathP', 6.2, 0.8), le('v.pathR', 5.4, 0.6),
  ],
  snapback: [
    ge('-f.pitch', 2.0, 0.5), band('absP', 2.2, 4.6, 0.45), band('absR', 2.0, 4.6, 0.45),
    ge('pitchFirst', 0.02, 0.10), ge('v.inv', 0.08, 0.06), le('absY', 2.2, 0.6),
    le('v.pathP', 6.2, 0.8), le('v.pathR', 5.4, 0.6),
  ],
  halfmatty: [
    ge('f.phHMatty', 1, 1),
  ],
  powerloop: [
    ge('f.phLoop', 1, 1),
  ],
  matty: [
    ge('f.phMatty', 1, 1),
  ],
  maverick: [
    ge('f.phMav', 1, 1),
  ],
  splits: [
    ge('f.phSplits', 1, 1),
  ],
  flip: [
    ge('f.phFlip', 1, 1),
  ],
  roll: [
    ge('v.rollSpan', 5.236, 0), ge('v.rollRate', 4.363, 0), le('absP', 1.85, 0.6), le('absY', 2.05, 0.6),
  ],
  yawspin: [
    ge('absY', 4.55, 0.55), le('absP', 1.05, 0.40), le('absR', 1.05, 0.40), le('v.pathR', 1.25, 0.40),
    le('v.pathP', 1.25, 0.40), ge('f.upMin', 0.25, 0.15),
  ],
});

// classifyFeat's re-labels after the top score, in its order (sim-tricks.js
// classifyFeat, after the dive fallback). keep: the label changes but best
// does not (its two pitch-sign re-labels).
export const OVERRIDES = Object.freeze([
  { from: 'flip', to: 'matty', text: 'flip→matty: matty > 0.55, pitch > 0', when: (c) => c.sc.matty > 0.55 && c.f.pitch > 0 },
  { from: 'yawspin', to: 'ham', text: 'yawspin→ham: ham > 0.42', when: (c) => c.sc.ham > 0.42 },
  { from: 'ham', to: 'trippy', text: 'ham→trippy: trippy > 0.42', when: (c) => c.sc.trippy > 0.42 },
  { from: 'ham', to: 'roll', text: 'ham→roll: roll > 0.42', when: (c) => c.sc.roll > 0.42 },
  { from: 'yawspin', to: 'trippy', text: 'yawspin→trippy: trippy > 0.42', when: (c) => c.sc.trippy > 0.42 },
  { from: 'roll', to: 'sideloop', text: 'roll→sideloop: sideloop > 0.4', when: (c) => c.sc.sideloop > 0.4 },
  { from: 'yawspin', to: 'sideloop', text: 'yawspin→sideloop: sideloop > 0.4', when: (c) => c.sc.sideloop > 0.4 },
  { from: 'maverick', to: 'powerloop', text: 'maverick→powerloop: absP > 4.3, pitch < 0, powerloop > 0.5', when: (c) => c.absP > 4.3 && c.f.pitch < 0 && c.sc.powerloop > 0.5 },
  { from: 'powerloop', to: 'matty', keep: true, text: 'powerloop→matty: pitch > 0, matty > 0.42', when: (c) => c.f.pitch > 0 && c.sc.matty > 0.42 },
  { from: 'matty', to: 'powerloop', keep: true, text: 'matty→powerloop: pitch < 0, powerloop > 0.42', when: (c) => c.f.pitch < 0 && c.sc.powerloop > 0.42 },
  { from: 'matty', to: 'juicyflick', text: 'matty→juicyflick: absR > 2.1, pitchFirst > 0.02, juicyflick > 0.3', when: (c) => c.absR > 2.1 && c.pitchFirst > 0.02 && c.sc.juicyflick > 0.3 },
  { from: 'juicyflick', to: 'halfmatty', text: 'juicyflick→halfmatty: rollFirst > 0.04, halfmatty > 0.35', when: (c) => c.rollFirst > 0.04 && c.sc.halfmatty > 0.35 },
  { from: 'snapback', to: 'splits', text: 'snapback→splits: rollFirst > 0.04, splits > 0.35', when: (c) => c.rollFirst > 0.04 && c.sc.splits > 0.35 },
  { from: 'juicyflick', to: 'rubik', text: 'juicyflick→rubik: rubik > juicyflick + 0.04', when: (c) => c.sc.rubik > c.sc.juicyflick + 0.04 },
  { from: 'snapback', to: 'cubik', text: 'snapback→cubik: cubik > snapback + 0.04', when: (c) => c.sc.cubik > c.sc.snapback + 0.04 },
  { from: 'rubik', to: 'cubik', max: true, text: 'rubik→cubik: rollFirst > 0.06', when: (c) => c.rollFirst > 0.06 },
  { from: 'cubik', to: 'rubik', max: true, text: 'cubik→rubik: pitchFirst > 0.06', when: (c) => c.pitchFirst > 0.06 },
]);
export const OVERRIDE_TEXT = Object.freeze(OVERRIDES.map((r) => r.text));

// The angle-valued features (shown in degrees by the overlay).
const ANGLE_SRC = new Set([
  'absP', 'absR', 'absY', 'v.pathP', 'v.pathR', 'v.pathY', 'f.pitch', '-f.pitch', 'v.head',
  'Math.max(absR, v.pathR)', 'Math.max(absY, v.pathY)', 'v.pathP - absP',
  'v.flipSpan', 'v.rollSpan', 'v.loopSpan', 'v.loopSweep', 'v.yawSpan', 'f.orbitSweep', 'f.barP', 'f.barR', 'barRTwist', 'barRHead',
  'v.invYaw', 'v.slowSpan', 'f.orbit2Sweep',
]);
// Angular rates (shown in degrees a second).
const RATE_SRC = new Set(['v.rollRate', 'v.yawRate', 'v.slowRate']);

function atLeast(x, a, fade) {
  if (x >= a) return 1;
  if (x <= a - fade) return 0;
  return (x - (a - fade)) / fade;
}
function atMost(x, a, fade) {
  if (x <= a) return 1;
  if (x >= a + fade) return 0;
  return (a + fade - x) / fade;
}
function inBand(x, lo, hi, fade) {
  return atLeast(x, lo, fade) * atMost(x, hi, fade);
}

const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : x);
const degOf = (r) => Math.round((r || 0) * 180 / Math.PI);

// The values classifyFeat computes before its score terms, by the
// expression it passes (the keys of GATES' src).
function context(f) {
  const v = featView(f);
  const absP = v.absP, absR = v.absR, absY = v.absY;
  const tR = f.tRoll90 < 90 ? f.tRoll90 : (f.tRoll180 < 90 ? f.tRoll180 : 99);
  const tP = f.tPitch90 < 90 ? f.tPitch90 : (f.tPitch180 < 90 ? f.tPitch180 : 99);
  const tY = f.tYaw90 < 90 ? f.tYaw90 : (f.tYaw180 < 90 ? f.tYaw180 : 99);
  const rollFirst = (tR < 90 && tP < 90) ? (tP - tR) : (tR < 90 && tP >= 90 ? 0.5 : -0.5);
  const pitchFirst = -rollFirst;
  const yawFirst = (tY < 90 && tR < 90) ? (tR - tY) : (tY < 90 && tR >= 90 ? 0.5 : -0.4);
  const objU = Math.max(v.under, f.under0 ? 0.35 : 0);
  const objO = Math.max(v.over, f.over0 ? 0.35 : 0);
  const val = {
    absP, absR, absY, rollFirst, pitchFirst, yawFirst, objU, objO,
    'v.pathP': v.pathP, 'v.pathR': v.pathR, 'v.pathY': v.pathY, 'v.inv': v.inv, 'v.span': v.span,
    'v.drop': v.drop, 'v.follow': v.follow, 'v.close': v.close, 'v.head': v.head, 'v.opp': v.opp,
    'v.rad': v.rad, 'v.objOrbit': v.objOrbit, 'v.obj': v.obj, 'v.meanDot': v.meanDot, 'v.under': v.under,
    'f.pitch': f.pitch, '-f.pitch': -f.pitch, 'f.tYaw360': f.tYaw360, 'f.peakY': f.peakY,
    'f.upMin': f.upMin, 'f.upMax': f.upMax, 'f.travelH': f.travelH, 'f.dur': f.dur, 'f.spdPeak': f.spdPeak,
    'Math.max(absR, v.pathR)': Math.max(absR, v.pathR),
    'Math.max(absY, v.pathY)': Math.max(absY, v.pathY),
    'v.against - v.follow': v.against - v.follow,
    'v.pathP - absP': v.pathP - absP,
    'Math.max(v.against, v.invAg)': Math.max(v.against, v.invAg),
    'v.flipSpan': v.flipSpan, 'v.rollSpan': v.rollSpan, 'v.rollRate': v.rollRate,
    'v.loopSpan': v.loopSpan, 'v.loopRise': v.loopRise, 'v.loopRet': v.loopRet, 'v.loopSweep': v.loopSweep,
    'v.yawSpan': v.yawSpan, 'v.yawRate': v.yawRate, 'v.invYaw': v.invYaw,
    'f.orbitR': f.orbitR, 'f.orbitSweep': f.orbitSweep, 'f.orbitTurn': f.orbitTurn, 'f.orbitSpd': f.orbitSpd,
    'f.orbitTail': f.orbitTail, 'v.slowSpan': v.slowSpan, 'v.slowRate': v.slowRate,
    'f.orbit2R': f.orbit2R, 'f.orbit2Sweep': f.orbit2Sweep, 'f.orbit2Turn': f.orbit2Turn, 'f.orbit2Spd': f.orbit2Spd,
    'f.orbit2Tail': f.orbit2Tail,
    'f.barP': f.barP, 'f.barR': f.barR, 'f.upEnd': f.upEnd,
    // The Barani's twist by which measure gave it (-1 for the other).
    barRTwist: f.barVia ? -1 : f.barR, barRHead: f.barVia ? f.barR : -1,
    'f.phFlip': f.phFlip, 'f.phLoop': f.phLoop, 'f.phSplits': f.phSplits, 'f.phImmel': f.phImmel,
    'f.phMav': f.phMav, 'f.phMatty': f.phMatty, 'f.phHMatty': f.phHMatty, 'f.phHMavvy': f.phHMavvy,
  };
  return { f, v, absP, absR, absY, rollFirst, pitchFirst, yawFirst, tR, tP, tY, val, sc: Object.create(null) };
}

function evalGate(g, val) {
  if (g.op === 'floor') {
    const inner = evalGate(g.parts[0], val);
    return { op: 'floor', min: g.min, parts: [inner], f: Math.max(inner.f, g.min) };
  }
  if (g.op === 'max') {
    const a = evalGate(g.parts[0], val);
    const b = evalGate(g.parts[1], val);
    return { op: 'max', parts: [a, b], f: Math.max(a.f, b.f) };
  }
  const x = val[g.src];
  const f = g.op === '>=' ? atLeast(x, g.a, g.fade) : g.op === '<=' ? atMost(x, g.a, g.fade) : inBand(x, g.a, g.b, g.fade);
  const out = { src: g.src, op: g.op, value: x, a: g.a, fade: g.fade, f };
  if (g.op === 'band') out.b = g.b;
  return out;
}

// A short human name for a gate's feature.
export function gateLabel(src) {
  return String(src)
    .replace(/^Math\.max\((.*)\)$/, 'max($1)')
    .replace(/\b[vf]\./g, '')
    .replace(/,\s*/g, ',')
    .replace(/\s+/g, '');
}

function fmtVal(src, x) {
  if (!Number.isFinite(x)) return String(x);
  if (ANGLE_SRC.has(src)) return degOf(x) + '°';
  if (RATE_SRC.has(src)) return degOf(x) + '°/s';
  return Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2);
}

// One gate as text: "travelH 1.2 needs ≥5.5 →0.00".
export function gateText(g) {
  if (g.op === 'floor') return gateText(g.parts[0]) + ' (floor ' + g.min + ')';
  if (g.op === 'max') return '[' + gateText(g.parts[0]) + ' or ' + gateText(g.parts[1]) + ']';
  const need = g.op === 'band'
    ? fmtVal(g.src, g.a) + '..' + fmtVal(g.src, g.b)
    : (g.op === '>=' ? '≥' : '≤') + fmtVal(g.src, g.a);
  return gateLabel(g.src) + ' ' + fmtVal(g.src, g.value) + ' needs ' + need + ' →' + g.f.toFixed(2);
}

function gateJson(g) {
  if (g.op === 'floor') return { op: 'floor', min: g.min, f: r3(g.f), of: gateJson(g.parts[0]) };
  if (g.op === 'max') return { op: 'max', f: r3(g.f), of: [gateJson(g.parts[0]), gateJson(g.parts[1])] };
  const o = { feature: g.src, value: r3(g.value), op: g.op, need: r3(g.a) };
  if (g.op === 'band') o.needHi = r3(g.b);
  o.fade = g.fade;
  o.f = r3(g.f);
  return o;
}

// The finished maneuver's features, rounded, by name.
function sawOf(f, v, ctx) {
  return {
    dur: r3(f.dur), n: f.n,
    pitch: r3(f.pitch), roll: r3(f.roll), yaw: r3(f.yaw),
    pitchDeg: degOf(f.pitch), rollDeg: degOf(f.roll), yawDeg: degOf(f.yaw),
    pathP: r3(v.pathP), pathR: r3(v.pathR), pathY: r3(v.pathY),
    peakP: r3(f.peakP), peakR: r3(f.peakR), peakY: r3(f.peakY), peakRate: r3(f.peakRate),
    tRoll90: r3(f.tRoll90), tPitch90: r3(f.tPitch90), tYaw90: r3(f.tYaw90), tYaw360: r3(f.tYaw360),
    rollFirst: r3(ctx.rollFirst), pitchFirst: r3(ctx.pitchFirst), yawFirst: r3(ctx.yawFirst),
    inv: r3(v.inv), upMin: r3(f.upMin), upMax: r3(f.upMax),
    alt0: r3(f.alt0), alt1: r3(f.alt1), span: r3(v.span), drop: r3(v.drop),
    travelH: r3(f.travelH), hEnd: r3(v.hEnd), close: r3(v.close), rad: r3(v.rad), head: r3(v.head),
    spd0: r3(f.spd0), spdPeak: r3(f.spdPeak), vzMin: r3(f.vzMin), vzMax: r3(f.vzMax),
    follow: r3(v.follow), against: r3(v.against), meanDot: r3(v.meanDot), invFol: r3(v.invFol), invAg: r3(v.invAg),
    alignN: f.alignN, opp: r3(v.opp),
    under: r3(v.under), over: r3(v.over), obj: r3(v.obj), objOrbit: r3(v.objOrbit), under0: f.under0, over0: f.over0,
    thrMin: r3(f.thrMin), thrMax: r3(f.thrMax), seg: f.seg, bump: f.bump,
    flipDeg: degOf(v.flipSpan), flipDir: v.flipDir > 0 ? 'front' : 'back',
    rollDeg15: degOf(v.rollSpan), rollRateDeg: degOf(v.rollRate),
    loopDeg: degOf(v.loopSpan), loopDir: v.loopDir > 0 ? 'front' : 'back', loopTotDeg: degOf(f.loopTot), loops: v.loops,
    loopRise: r3(v.loopRise), loopRet: r3(v.loopRet), loopSweepDeg: degOf(v.loopSweep),
    vyawDeg: degOf(v.yawSpan), vyawRateDeg: degOf(v.yawRate),
    orbitR: r3(f.orbitR), orbitSweepDeg: degOf(f.orbitSweep), orbitTurn: r3(f.orbitTurn), orbitSpd: r3(f.orbitSpd),
    orbitFit: r3(f.orbitFit), orbitPole: f.orbitPole,
    // Trippy's share of the orbit tilted back or inverted; Orbit's turn
    // inside ORBIT_WIN_S, its orbit and that share.
    orbitTail: r3(f.orbitTail),
    slowYawDeg: degOf(v.slowSpan), slowRateDeg: degOf(v.slowRate),
    orbit2R: r3(f.orbit2R), orbit2SweepDeg: degOf(f.orbit2Sweep), orbit2Turn: r3(f.orbit2Turn), orbit2Spd: r3(f.orbit2Spd),
    orbit2Tail: r3(f.orbit2Tail), orbit2Pole: f.orbit2Pole,
    // baraniVia: 1 when the heading's turn gave the twist.
    baraniPitchDeg: degOf(f.barP), baraniTwistDeg: degOf(f.barR), baraniVia: f.barVia || 0, upEnd: r3(f.upEnd),
    // The segment's twist: its turn about the body axis nearest the flight
    // path, roll or yaw (the Barani's); and the heading's turn (the yaw's
    // own turn about the vertical while inverted: each step's yaw times the
    // body's up-Z while it is below -0.5, summed).
    twistDeg: degOf(f.twist), yawVDeg: degOf(f.yawV),
    // Ham: the turn about the vertical while up-Z < -0.5, and that time's
    // share of the segment.
    invYawDeg: degOf(v.invYaw), inv50: r3(f.dur > 0 ? f.invYawT / f.dur : 0),
    // The phase matcher's scores (PHASE_SPECS), and the Maverick's gap.
    ph: {
      flip: r3(f.phFlip), powerloop: r3(f.phLoop), splits: r3(f.phSplits), immelmann: r3(f.phImmel),
      maverick: r3(f.phMav), matty: r3(f.phMatty), halfmatty: r3(f.phHMatty), halfmavvy: r3(f.phHMavvy),
    },
    gapIn: f.gapIn, gapBack: f.gapBack,
    // The altitude 1.0 s before the segment began (the Matty's climb).
    alt1s: r3(f.alt1s),
  };
}

// What the phase matcher measured in the last segment (the detector's
// lastPhases), per trick: its score, how many phases in order matched, and
// each phase's turn (deg, its way), seconds, climb (m), up-Z at its end,
// object over / under, the other axis's turn across it and its own back
// (deg); outside the phases, pitch and roll's turn before and after (deg),
// and the tail (s). JSON-able, for the record.
export function phaseRecord(lp) {
  if (!lp) return null;
  const out = {};
  for (const id of Object.keys(lp)) {
    const r = lp[id];
    const o = { score: r3(r.score), reached: r.reached };
    if (r.ms) {
      o.ph = r.ms.ph.map((m) => {
        const x = { deg: degOf(m.turn), t: r3(m.t) };
        if (m.climb != null) {
          x.climb = r3(m.climb); x.up = r3(m.up); x.over = m.over; x.under = m.under;
          x.crossDeg = degOf(m.cross); x.backDeg = degOf(m.back);
          if (m.ag != null) x.ag = r3(m.ag);
        }
        return x;
      });
      o.leadDeg = degOf(r.ms.lead); o.trailDeg = degOf(r.ms.trail); o.tail = r3(r.ms.tail);
      if (r.ms.still != null) o.stillDeg = degOf(r.ms.still);
      if (r.ms.near != null) o.near = r3(r.ms.near);
    }
    out[id] = o;
  }
  return out;
}

function nameOf(id) {
  if (id === 'ham') return 'Inverted yaw spin (Ham)';
  const d = TRICK_BY_ID[id];
  return d ? d.name : id;
}

// Why a candidate is not the label, from its own gates: the weakest first.
function weakest(gates, n) {
  const flat = gates.map((g, i) => ({ g, i })).filter((x) => x.g.f < 1);
  flat.sort((a, b) => a.g.f - b.g.f || a.i - b.i);
  return flat.slice(0, n).map((x) => x.g);
}

// A phase-matcher trick's segment terms (PHASE_SPECS seg), as gates on the
// context's values, and why its phases missed when the detector's
// measurements (lastPhases) are at hand.
const SEG_SRC = {
  absR: 'absR', absY: 'absY', loopRise: 'v.loopRise', loopRet: 'v.loopRet', loopSweep: 'v.loopSweep',
  drop: 'v.drop', inv: 'v.inv', rollFirst: 'rollFirst', follow: 'v.follow', pathR: 'v.pathR', head: 'v.head', upEnd: 'f.upEnd',
  pitch: 'f.pitch', dur: 'f.dur', againstNose: 'Math.max(v.against, v.invAg)', under: 'v.under',
};
function phaseMiss(id, val, lp) {
  const spec = PHASE_SPECS[id];
  if (!spec) return null;
  const segs = (spec.seg || []).map((g) => evalGate((g[1] === '>=' ? ge : le)(SEG_SRC[g[0]], g[2], g[3]), val));
  const w = weakest(segs, 2).map(gateText);
  const r = lp && lp[id];
  if (r) {
    if (r.reached < spec.ph.length) {
      // The last phase also asks its tail and, the Maverick's, an object near.
      const last = r.reached === spec.ph.length - 1 && spec.near != null ? ' (the last: an object within 2 m ' + spec.near + ' of the push and glide, or a gap)' : '';
      w.push('phases ' + r.reached + '/' + spec.ph.length + ' in order' + last);
    } else if (r.ms && spec.tail && !(r.ms.tail >= spec.tail.t)) w.push('tail ' + r.ms.tail.toFixed(2) + ' s needs ≥' + spec.tail.t);
    else if (r.ms && spec.still != null && !(r.ms.still <= spec.still)) w.push('twist ' + degOf(r.ms.still) + '° across the phases needs ≤' + degOf(spec.still) + '°');
    else if (r.ms && spec.near != null && !(r.ms.near >= spec.near)) w.push('near an object ' + (r.ms.near || 0).toFixed(2) + ' of the push and glide needs ≥' + spec.near);
  }
  return w;
}

// classifyFeat, explained: every candidate's terms, the pick, the re-labels.
// Re-runs classifyFeat (into its own out object) for the authoritative id,
// best, second and why, and computes the replica alongside; mismatch says
// whether they disagree. lp: the detector's phase measurements of the same
// segment (lastPhases), for the phase-matcher tricks' reasons.
export function explainFeat(f, lp) {
  const cls = classifyFeat(f, { id: null, why: '', best: 0, second: 0, secondId: '' });
  const auth = { id: cls.id, best: cls.best, second: cls.second, secondId: cls.secondId, why: cls.why };
  const out = {
    id: auth.id, why: auth.why, best: auth.best, second: auth.second, secondId: auth.secondId,
    pre: { short: false, tiny: false }, saw: null, candidates: [], pick: null, mismatch: false, replica: null,
  };
  if (!f || f.n < 4 || f.dur < 0.12) {
    out.pre.short = true;
    out.replica = { id: null };
    out.mismatch = auth.id !== null;
    return out;
  }
  const ctx = context(f);
  const v = ctx.v;
  out.saw = sawOf(f, v, ctx);
  const tiny = ctx.absP < 1.7 && ctx.absR < 1.7 && ctx.absY < 1.7
    && v.pathP < 1.6 && v.pathR < 1.6 && v.pathY < 1.6 && v.inv < 0.35;
  if (tiny) {
    out.pre.tiny = true;
    out.replica = { id: null };
    out.mismatch = auth.id !== null;
    return out;
  }
  const evals = Object.create(null);
  for (const id of CLASS_IDS) {
    const gates = GATES[id].map((g) => evalGate(g, ctx.val));
    let p = 1;
    for (let i = 0; i < gates.length; i++) p *= gates[i].f;
    ctx.sc[id] = p;
    evals[id] = gates;
  }
  let best = 0, bestId = '', second = 0, secondId = '';
  const totals = Object.create(null);
  for (const id of CLASS_IDS) {
    const sc = (ctx.sc[id] || 0) + (SPEC[id] || 0) * ((ctx.sc[id] || 0) > SPEC_MIN ? 1 : 0);
    totals[id] = sc;
    if (sc > best) {
      second = best; secondId = bestId;
      best = sc; bestId = id;
    } else if (sc > second) {
      second = sc; secondId = id;
    }
  }
  const pick = { topId: bestId || null, top: r3(best), secondId: secondId || null, second: r3(second), min: PICK_MIN, overrides: [], fallback: null, id: null };
  let finalId = null, finalBest = best;
  if (best < PICK_MIN || !bestId) {
    // A flip's rotation is never nothing (classifyFeat's flip fallback).
    pick.flipFallback = { feature: 'v.flipSpan', value: r3(v.flipSpan), op: '>=', need: FLIP_FALLBACK, ok: v.flipSpan >= FLIP_FALLBACK };
  }
  if (pick.flipFallback && pick.flipFallback.ok) {
    finalId = 'flip';
  } else if (best < PICK_MIN || !bestId) {
    const fb = [
      { feature: 'v.drop', value: r3(v.drop), op: '>=', need: DIVE_FALLBACK.drop, ok: v.drop >= DIVE_FALLBACK.drop },
      { feature: 'f.spdPeak', value: r3(f.spdPeak), op: '>', need: DIVE_FALLBACK.spdPeak, ok: f.spdPeak > DIVE_FALLBACK.spdPeak },
      { feature: 'f.vzMin', value: r3(f.vzMin), op: '<', need: DIVE_FALLBACK.vzMin, ok: f.vzMin < DIVE_FALLBACK.vzMin },
      { feature: 'absP', value: r3(ctx.absP), op: '<', need: DIVE_FALLBACK.absP, ok: ctx.absP < DIVE_FALLBACK.absP },
      { feature: 'absR', value: r3(ctx.absR), op: '<', need: DIVE_FALLBACK.absR, ok: ctx.absR < DIVE_FALLBACK.absR },
      { feature: 'v.pathY', value: r3(v.pathY), op: '<', need: DIVE_FALLBACK.pathY, ok: v.pathY < DIVE_FALLBACK.pathY },
    ];
    pick.fallback = fb;
    if (fb.every((x) => x.ok)) finalId = 'dive';
  } else {
    let id = bestId;
    for (let i = 0; i < OVERRIDES.length; i++) {
      const r = OVERRIDES[i];
      if (id !== r.from) continue;
      const c = { f, v, sc: ctx.sc, absP: ctx.absP, absR: ctx.absR, rollFirst: ctx.rollFirst, pitchFirst: ctx.pitchFirst };
      if (!r.when(c)) continue;
      id = r.to;
      if (r.max) finalBest = Math.max(ctx.sc[r.to], finalBest);
      else if (!r.keep) finalBest = ctx.sc[r.to];
      pick.overrides.push({ rule: i + 1, text: r.text, from: r.from, to: r.to });
    }
    finalId = id;
  }
  pick.id = finalId;
  out.pick = pick;
  out.replica = { id: finalId, best: finalId && finalId !== 'dive' ? finalBest : best, second, secondId };
  out.mismatch = finalId !== auth.id || out.replica.best !== auth.best
    || second !== auth.second || secondId !== auth.secondId;

  const viaOverride = (id) => pick.overrides.find((o) => o.to === id && finalId === id);
  for (const id of CLASS_IDS) {
    const gates = evals[id];
    const score = ctx.sc[id];
    const total = totals[id];
    let verdict, reason;
    if (auth.id === id) {
      verdict = 'fired';
      const ov = viaOverride(id);
      reason = ov ? 're-labelled from ' + ov.from + ' (' + ov.text + ')'
        : (id === 'flip' && pick.flipFallback && pick.flipFallback.ok)
          ? 'no trick reached ' + PICK_MIN + '; ' + degOf(v.flipSpan) + '° of pitch in ' + FLIP_WIN_LABEL + ' is a Flip (fallback)'
          : 'top score ' + total.toFixed(2) + ' ≥ ' + PICK_MIN;
    } else if (id === bestId && best >= PICK_MIN) {
      verdict = 'overridden';
      reason = 'top score ' + total.toFixed(2) + ', re-labelled ' + pick.overrides.map((o) => o.from + '→' + o.to).join(', ');
    } else if (total < PICK_MIN) {
      verdict = 'missed';
      const w = phaseMiss(id, ctx.val, lp) || weakest(gates, 2).map(gateText);
      reason = 'score ' + total.toFixed(2) + ' < ' + PICK_MIN + (w.length ? ': ' + w.join(' · ') : '');
    } else {
      verdict = 'lost';
      reason = 'score ' + total.toFixed(2) + ', ' + (bestId || '?') + ' scored ' + best.toFixed(2);
    }
    out.candidates.push({
      id, name: nameOf(id), score: r3(score), spec: SPEC[id] || 0, total: r3(total), verdict, reason,
      gates: gates.map(gateJson), _gates: gates,
    });
  }
  return out;
}

// The dive fallback as a candidate row (a maneuver's own dive).
function diveFallbackRow(ex) {
  if (!ex.pick) return null;
  if (!ex.pick.fallback) return { verdict: 'skipped', reason: 'a trick scored ≥ ' + PICK_MIN + ', so no dive fallback' };
  const bad = ex.pick.fallback.filter((x) => !x.ok);
  if (!bad.length) return { verdict: ex.id === 'dive' ? 'fired' : 'missed', reason: 'fallback: every condition met' };
  return { verdict: 'missed', reason: 'fallback: ' + bad.map((x) => gateLabel(x.feature) + ' ' + x.value + ' needs ' + x.op + x.need).join(' · ') };
}

// Where the detector's gap state stands, for the panel: in an authored
// volume (its name), or the generic rule's sides against its limit.
export function gapState(det, frameW, ws) {
  const vols = det.gapVols, face = det.gapFace;
  if (vols && face) for (let i = 0; i < face.length; i++) if (face[i] !== -1) return { authored: vols[i].name, inBySide: face[i] === -2 };
  const sideMax = GAP.sideK * (frameW > 0 ? frameW : GAP.frameW) * (ws || 3.5);
  const c = det.clr;
  return { authored: null, sideMax, x: c ? [c.px, c.nx] : null, z: c ? [c.pz, c.nz] : null, on: det.gapOn, cd: det.gapCd };
}

// ---- The observer: the detector before and after each step, from outside.
//
// before(sample, dt) and after(sample, dt, ev) bracket one stepDetector call
// (tricks.step, every 4 ms of sim time). Each attempt goes to onAttempt(record):
// - type 'maneuver': a rotation segment that finished (classified or not);
// - type 'abort': a segment dropped without a label (a crash or reset
//   between steps);
// - type 'dive': a dive the detector armed (fired or not), or a descent past
//   the detector's own "diving" vz (-3.8 m/s) it never armed, with why;
// - type 'gap': a pass through, or a skim of, a gap the detector tracks
//   (authored or generic). Not a trick: it never has a result. The phase
//   matcher's "through" and the Maverick's way back out use the passes.
export function createTrickObserver(det, opts) {
  const o = opts || {};
  const emit = o.onAttempt || function () {};
  // A maneuver's rec.side refreshed past the segment's end (the same record
  // onAttempt had).
  const onSide = o.onSide || function () {};
  const now = o.now || function () { return 0; };
  const info = o.info || function () { return {}; };
  const pre = makeFeat();
  const held = makeFeat();
  const st = {
    live: 0, lockout: 0, diveOn: 0, diveDrop: 0, diveCd: 0, gapOn: 0, gapCd: 0,
  };
  let heldLive = 0;
  let segT0 = 0;
  let dive = null;
  let watch = null;
  let sameDescent = false;   // still in the descent of a dive just recorded
  let gapSeq = 0;
  let seq = 0;
  // The camera, for the debug log only (nothing scores it): each step of a
  // live segment, the body's up-Z, the camera's up-Z and the camera's axis
  // (sim-core frame: x forward, z up) at the page's cam tilt (info().camDeg;
  // 30 when the page gives none), the position (m), and the body's nose and
  // up axes. camRecord reads them over the orbit's window when the segment
  // ends.
  const CAM_W = 14, CAM_CAP = 4096;
  const camBuf = new Float64Array(CAM_CAP * CAM_W);
  let camN = 0, camDeg = 30, camFrom = 'default', camWs = 3.5;
  // The object beside the path (rec.side), logged only: each step (SW
  // columns) the ring's clock, the segment's number (0 none), the position
  // (sim-core frame, m: x forward, y left, z up, as camPush's), the velocity
  // (m/s), the nose, the heading (the nose's, level; the body's left axis
  // turned forward when the nose is within 66 degrees of vertical; never
  // reversed from one step to the next, so a pitch over the top or a roll
  // past 90 keeps it), the body's up-Z, and the objects beside the path nearest first
  // (object id + 1, its nearest box's index, nearest point, distance).
  // sideRecord reads it.
  const SB = 15, SK = SIDE.kNear, SW = SB + SK * 6, SCAP = SIDE.cap;
  const sideBuf = new Float64Array(SCAP * SW);
  let sideN = 0, sideHead = 0, sideFx = 1, sideFy = 0, sideHdOn = 0, sideEpoch = 0;
  // The colliders, as sim-core boxes (x0 y0 z0 x1 y1 z1, m), each box's
  // object, and each object's bounds and box count, rebuilt when the array,
  // its length or its ends change.
  let sideCols = null, sideColsN = -1, sideCol0 = null, sideColL = null, sideWs = 3.5, sideBox = new Float64Array(0);
  let sideObj = new Int32Array(0), sideObjBox = new Float64Array(0), sideObjN = new Int32Array(0), sidePost = new Set();
  // The ring's own clock, the sim's (each step's dt; the page's now() is
  // the frame's wall time, the same for every step in a frame), its reading
  // at the open segment's first step, and the segments' count.
  let simT = 0, segSim0 = 0, segN = 0;
  const candD = new Float64Array(SK), candI = new Int32Array(SK), candP = new Float64Array(SK * 3), candO = new Int32Array(SK);
  const sidePend = [];
  // The Cradle's inputs (det.cg.inp: the clock, position, velocity, nose,
  // up-Z, contact), armed, the turn about the vertical and fresh (the first
  // step after a reset), each step (CG_W columns), for its records.
  const CG_W = 15, CG_CAP = CRADLE_LOG.cap;
  const CG_COLS = ['t', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'fx', 'fy', 'fz', 'upZ', 'contact', 'armed', 'yr', 'fresh'];
  const cgBuf = new Float64Array(CG_CAP * CG_W);
  let cgN = 0, cgHead = 0, cgSeq = 0, cgT = NaN;
  const cgPend = [];
  let cgMiss = null;   // the last miss record's pending refresh (rows to share)
  const view = {
    t: 0, armed: false, contact: false, rate: 0, lockout: 0, diving: false, live: 0, liveT: 0,
    vz: 0, speed: 0, alt: 0, thr: 0, gap: null, clr: null, diveOn: 0, diveDrop: 0, diveCd: 0, gapCd: 0,
  };

  function base(type, t) {
    const i = info() || {};
    return { v: 1, kind: 'quadmath-trick-attempt', seq: ++seq, type, t: r3(t), core: i.core || null, map: i.map || null };
  }

  function emitManeuver(t, f, ev) {
    const ex = explainFeat(f, det.lastPhases);
    const rec = base('maneuver', t);
    rec.t0 = r3(segT0);
    // A compound trick: the merge's label (the detector's), and what merged.
    const mg = det.lastMerge;
    // An orbit going on (the one before it scored): the detector's nothing.
    // A segment open at a Cradle's second pass: the detector's Cradle.
    rec.result = mg || det.lastCont || det.lastCradleSeg ? (det.lastId || null) : ex.id;
    rec.cradle = det.lastCradleSeg || 0;
    rec.merged = mg ? { id: mg.id, segs: mg.segs, t: r3(mg.t), score: r3(mg.score), alone: ex.id } : null;
    rec.event = ev || null;
    rec.why = det.lastWhy || '';
    rec.dir = ex.id === 'flip' || ex.id === 'powerloop' ? (det.lastDir < 0 ? 'back' : 'front') : null;
    rec.pole = (ex.id === 'trippy' || ex.id === 'orbit') && det.lastPole ? TRIPPY_POLE_MUL : 0;
    rec.loops = ex.id === 'powerloop' ? (det.lastLoops || 1) : 0;
    rec.sloppy = det.lastSloppy ? 1 : 0;
    rec.bump = det.lastBump ? 1 : 0;
    rec.mismatch = ex.mismatch;
    rec.pre = ex.pre;
    rec.saw = ex.saw;
    rec.cam = camRecord(f);
    try { sideAttach(rec, det.lastMerge); } catch (e) { rec.side = null; }
    rec.barani = baraniProbe(f);
    rec.phases = phaseRecord(det.lastPhases);
    rec.gapBack = ex.id === 'maverick' && det.lastGapBack ? MAV_GAP_MUL : 0;
    rec.pick = ex.pick;
    rec.candidates = ex.candidates.map((c) => ({ id: c.id, total: c.total, score: c.score, verdict: c.verdict, reason: c.reason, gates: c.gates }));
    const fb = diveFallbackRow(ex);
    if (fb) rec.candidates.push({ id: 'dive', fallback: true, verdict: fb.verdict, reason: fb.reason });
    if (ex.pre.short) rec.reason = 'too short to classify (n < 4 or dur < 0.12 s)';
    else if (ex.pre.tiny) rec.reason = 'too small: every axis under ~97° turned and ~92° of path, inverted < 35 %';
    else if (!ex.id) rec.reason = 'no candidate reached ' + PICK_MIN + ' (top ' + (ex.pick.topId || '—') + ' ' + ex.pick.top + ')';
    else rec.reason = ex.candidates.find((c) => c.id === ex.id)?.reason || (ex.id === 'dive' ? 'dive fallback' : '');
    if (mg) rec.reason = 'merged with the ' + (mg.segs - 1) + ' segment(s) before (pauses under 0.8 s): ' + mg.id + '; this one alone: ' + (ex.id || 'nothing');
    if (det.lastCont) rec.reason = 'the orbit before it goes on (one orbit scores once)';
    if (det.lastCradleSeg) rec.reason = 'closed at a Cradle\'s second pass (the cradle record after this one); this one alone: ' + (ex.id || 'nothing');
    // Held for a half-flown Cradle (sim-tricks.js cradleHolds): called when
    // it comes to nothing, or replaced by it.
    rec.held = det.held ? 1 : 0;
    if (det.held) rec.reason += '; held: a Cradle round a post is half flown (replaced by it, or called when it comes to nothing)';
    rec._explain = ex;
    emit(rec);
  }

  // One step of the camera: t the segment's clock (feat.dur, the history's
  // column 0), the body's axes from the attitude (the detector's own nose
  // and up columns), the camera's axis and up pitched up by the cam tilt.
  function camPush(s, t) {
    if (camN >= CAM_CAP) return;
    const x = s.qx || 0, y = s.qy || 0, z = s.qz || 0, w = s.qw == null ? 1 : s.qw;
    const fx = 1 - 2 * (y * y + z * z), fy = 2 * (x * y + w * z), fz = 2 * (x * z - w * y);
    const ux = 2 * (x * z + w * y), uy = 2 * (y * z - w * x), uz = 1 - 2 * (x * x + y * y);
    const c = camDeg * Math.PI / 180, cc = Math.cos(c), sc = Math.sin(c);
    const k = camN * CAM_W;
    camBuf[k] = t; camBuf[k + 1] = uz; camBuf[k + 2] = cc * uz - sc * fz;
    camBuf[k + 3] = cc * fx + sc * ux; camBuf[k + 4] = cc * fy + sc * uy; camBuf[k + 5] = cc * fz + sc * uz;
    // toScene: wx = -y, wz = -x (scene units).
    camBuf[k + 6] = -(s.wz || 0) / camWs; camBuf[k + 7] = -(s.wx || 0) / camWs;
    camBuf[k + 8] = s.alt != null ? s.alt : (s.wy || 0) / camWs;
    camBuf[k + 9] = fx; camBuf[k + 10] = fy; camBuf[k + 11] = fz; camBuf[k + 12] = ux; camBuf[k + 13] = uy;
    camN++;
  }

  // The camera over the orbit's window (lastFeat.orbitTa..orbitTb; the whole
  // segment when no orbit was fitted). Its up-Z: min, mean, max, the share
  // below 0 (the picture upside down) and below -0.35, and the body's share
  // below 0 beside it. Toward the orbit's centre, at the quad's height: the
  // camera axis's angle to it (deg: mean, median, the share within 45), its
  // azimuth off the centre's bearing (deg, mean), the distance (m, mean).
  // The camera's elevation (deg, mean; 90 straight up).
  // The body against the centre, whatever the cam tilt: in the vertical
  // plane through the quad and the centre, the nose's angle (noseDeg: 0
  // level at the centre, -90 straight down, 90 straight up, 180 level away
  // from it; -90..270), the share past 90 (tailShare: nose up and over, the
  // tail toward the centre), the nose out of that plane (side: 0 in it, 1
  // square to it; mean), and the up axis's lean toward the centre from
  // vertical (leanDeg: 0 upright, 90 on its side toward the centre, 180
  // inverted). Quantiles as the up-Z's. rows: 24 steps evenly over the
  // window, as cols.
  function camRecord(f) {
    const orb = f.orbitR > 0 && f.orbitTb > f.orbitTa;
    const ta = orb ? f.orbitTa : -Infinity, tb = orb ? f.orbitTb : Infinity;
    const cx = -f.orbitCz / camWs, cy = -f.orbitCx / camWs;
    const idx = [];
    let segNeg = 0;
    for (let i = 0; i < camN; i++) {
      const t = camBuf[i * CAM_W];
      if (camBuf[i * CAM_W + 2] < 0) segNeg++;
      if (t >= ta - 1e-6 && t <= tb + 1e-6) idx.push(i);
    }
    const out = { deg: camDeg, degFrom: camFrom, win: orb ? [r3(ta), r3(tb)] : null, n: idx.length, segUpZNeg: camN ? r3(segNeg / camN) : 0 };
    if (!idx.length) return out;
    const D = 180 / Math.PI, cl = (u) => (u > 1 ? 1 : u < -1 ? -1 : u);
    let mn = Infinity, mx = -Infinity, sum = 0, neg = 0, neg35 = 0, bodyNeg = 0, el = 0;
    let offN = 0, offIn = 0, azSum = 0, azN = 0, dSum = 0;
    const offs = [], cus = [], ups = [], noses = [], leans = [];
    let tail = 0, sideSum = 0;
    const at = (i) => {
      const k = i * CAM_W, ax = camBuf[k + 3], ay = camBuf[k + 4], az = camBuf[k + 5];
      const r = { t: camBuf[k], up: camBuf[k + 1], cu: camBuf[k + 2], el: Math.asin(cl(az)) * D, off: null, azOff: null, d: null, nose: null, lean: null, side: null };
      if (orb) {
        const dx = cx - camBuf[k + 6], dy = cy - camBuf[k + 7], d = Math.hypot(dx, dy), ah = Math.hypot(ax, ay);
        r.d = d;
        if (d > 0.05) {
          r.off = Math.acos(cl((ax * dx + ay * dy) / d)) * D;
          if (ah > 1e-3) r.azOff = Math.acos(cl((ax * dx + ay * dy) / (d * ah))) * D;
          const hx = dx / d, hy = dy / d;
          let nose = Math.atan2(camBuf[k + 11], camBuf[k + 9] * hx + camBuf[k + 10] * hy) * D;
          if (nose < -90) nose += 360;
          r.nose = nose;
          r.side = Math.abs(-camBuf[k + 9] * hy + camBuf[k + 10] * hx);
          r.lean = Math.atan2(camBuf[k + 12] * hx + camBuf[k + 13] * hy, camBuf[k + 1]) * D;
        }
      }
      return r;
    };
    for (const i of idx) {
      const r = at(i);
      if (r.cu < mn) mn = r.cu;
      if (r.cu > mx) mx = r.cu;
      sum += r.cu; el += r.el; cus.push(r.cu); ups.push(r.up);
      if (r.cu < 0) neg++;
      if (r.cu < -0.35) neg35++;
      if (r.up < 0) bodyNeg++;
      if (r.off != null) { offs.push(r.off); offN++; if (r.off <= 45) offIn++; }
      if (r.azOff != null) { azSum += r.azOff; azN++; }
      if (r.d != null) dSum += r.d;
      if (r.nose != null) { noses.push(r.nose); leans.push(r.lean); sideSum += r.side; if (r.nose > 90) tail++; }
    }
    const n = idx.length;
    out.upZMin = r3(mn); out.upZMean = r3(sum / n); out.upZMax = r3(mx);
    out.upZNeg = r3(neg / n); out.upZNeg35 = r3(neg35 / n); out.bodyUpZNeg = r3(bodyNeg / n);
    out.elDegMean = Math.round(el / n);
    // Quantiles (10, 25, 50, 75, 90 %) of the camera's up-Z and the body's,
    // so a gate's level can be set with margin from the log.
    const q = (a) => { a.sort((x, y) => x - y); return [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => r3(a[Math.min(a.length - 1, Math.floor(p * a.length))])); };
    out.upZQ = q(cus); out.bodyUpZQ = q(ups);
    if (offN) {
      offs.sort((a, b) => a - b);
      out.offDegMean = Math.round(offs.reduce((a, b) => a + b, 0) / offN);
      out.offDegMed = Math.round(offs[offN >> 1]);
      out.offIn45 = r3(offIn / offN);
      out.distMean = r3(dSum / n);
    }
    if (azN) out.azDegMean = Math.round(azSum / azN);
    if (noses.length) {
      const N = noses.length;
      out.noseDegMean = Math.round(noses.reduce((a, b) => a + b, 0) / N);
      out.noseDegQ = q(noses).map((x) => Math.round(x));
      out.tailShare = r3(tail / N);
      out.sideMean = r3(sideSum / N);
      out.leanDegQ = q(leans).map((x) => Math.round(x));
    }
    out.cols = ['t', 'upZ', 'camUpZ', 'offDeg', 'azDeg', 'elDeg', 'dist', 'noseDeg', 'leanDeg', 'side'];
    out.rows = [];
    const R = Math.min(24, n);
    for (let j = 0; j < R; j++) {
      const r = at(idx[R > 1 ? Math.round((j * (n - 1)) / (R - 1)) : 0]);
      const rd = (x) => (x == null ? null : Math.round(x));
      out.rows.push([r3(r.t), r3(r.up), r3(r.cu), rd(r.off), rd(r.azOff), Math.round(r.el), r.d == null ? null : r3(r.d), rd(r.nose), rd(r.lean), r.side == null ? null : r3(r.side)]);
    }
    return out;
  }

  // The Barani's terms over the finished segment's history (det.hist, read
  // only), as baraniWithin scans it but with the band ignored: the stretch
  // of BARANI_P less BARANI_FADE or more of pitch path whose twist is
  // nearest 180, without and with BARANI_SIDE (pitch path before and after
  // the row where the twist is half done), each with its pitch path, twist
  // and the pitch path either side (deg), its time (s) and which twist
  // (via: 'twist', the body axis nearest the path, or 'heading', the
  // heading's turn); which term zeroed it (limit: barP, barR band,
  // BARANI_SIDE, upEnd, or none).
  function baraniProbe(f) {
    const H = det.hist, n = det.histN, W = HIST_W, D = 180 / Math.PI;
    const lo = BARANI_P - BARANI_FADE, bandLo = 2.356, bandHi = 3.927;
    const out = { pathDeg: degOf(f.pathP), twistDeg: degOf(f.twist), upEnd: r3(f.upEnd), band: [135, 225], bandHeading: [degOf(BARANI_HD_LO), 225], sideDeg: degOf(BARANI_SIDE), any: null, inside: null, limit: null };
    if (!H || n < 2 || !(f.pathP >= lo)) { out.limit = 'barP'; return out; }
    const stride = Math.max(1, Math.ceil(n / PH_ROWS));
    // The twist (column 15) and the heading's turn (the yaw's own turn about
    // the vertical while inverted, the body history's fourth), as
    // baraniWithin.
    const B = det.bh;
    const pp = [0], cols = [[H[15]], [B[3]]], tt = [H[0]];
    let path = 0;
    for (let r = 1; r < n; r++) {
      path += Math.abs(H[r * W + 1] - H[(r - 1) * W + 1]);
      if (r === n - 1 || r % stride === 0) { pp.push(path); cols[0].push(H[r * W + 15]); cols[1].push(B[r * BH_W + 3]); tt.push(H[r * W]); }
    }
    const m = pp.length;
    const half = (A, ja, jb) => {
      const raw = A[jb] - A[ja], T = Math.abs(raw), sg = raw >= 0 ? 1 : -1;
      let k = ja + 1;
      while (k < jb && sg * (A[k] - A[ja]) < T / 2) k++;
      return { before: pp[k] - pp[ja], after: pp[jb] - pp[k] };
    };
    const row = (c, ja, jb) => {
      const A = cols[c], h = half(A, ja, jb);
      return { pDeg: Math.round((pp[jb] - pp[ja]) * D), twistDeg: Math.round(Math.abs(A[jb] - A[ja]) * D), beforeDeg: Math.round(h.before * D), afterDeg: Math.round(h.after * D), t: [r3(tt[ja]), r3(tt[jb])], via: c ? 'heading' : 'twist' };
    };
    // Each stretch's twist in its measure's band (the heading's from
    // BARANI_HD_LO): the in-band one nearest 180 first, else the nearest.
    const inBandC = (c, T) => T >= (c ? BARANI_HD_LO : bandLo) - 1e-9 && T <= bandHi + 1e-9;
    const better = (ok, off, bOk, bOff) => (ok && !bOk) || (ok === bOk && off < bOff);
    let anyOff = 9, anyOk = false, anyA = -1, anyB = -1, anyC = 0, inOff = 9, inOk = false, inA = -1, inB = -1, inC = 0;
    for (let ja = 0; ja < m - 1; ja++) {
      for (let jb = m - 1; jb > ja; jb--) {
        if (pp[jb] - pp[ja] < lo) break;
        for (let c = 0; c < 2; c++) {
          const A = cols[c];
          const T = Math.abs(A[jb] - A[ja]), off = Math.abs(T - Math.PI), ok = inBandC(c, T);
          if (better(ok, off, anyOk, anyOff)) { anyOff = off; anyOk = ok; anyA = ja; anyB = jb; anyC = c; }
          if (better(ok, off, inOk, inOff)) {
            const h = half(A, ja, jb);
            if (h.before >= BARANI_SIDE && h.after >= BARANI_SIDE) { inOff = off; inOk = ok; inA = ja; inB = jb; inC = c; }
          }
        }
      }
    }
    if (anyA >= 0) out.any = row(anyC, anyA, anyB);
    if (inA >= 0) out.inside = row(inC, inA, inB);
    if (anyA < 0) out.limit = 'barP';
    else if (!anyOk) out.limit = 'barR band';
    else if (!(inA >= 0 && inOk)) out.limit = 'BARANI_SIDE';
    else if (!(f.upEnd >= 0.5)) out.limit = 'upEnd';
    else out.limit = 'none';
    return out;
  }

  // The colliders as sim-core boxes and objects; true when they changed.
  function sideColsSet(cols, ws) {
    const n = cols && cols.length ? cols.length : 0;
    if (cols === sideCols && n === sideColsN && ws === sideWs && (!n || (cols[0] === sideCol0 && cols[n - 1] === sideColL))) return false;
    // A change (not the first): the pending records finish on the old set.
    if (sideColsN >= 0) sideReset('colliders');
    sideCols = cols || null; sideColsN = n; sideWs = ws;
    sideCol0 = n ? cols[0] : null; sideColL = n ? cols[n - 1] : null;
    sideBox = simBoxes(cols, ws, null);
    // Objects: sim-tricks.js groupBoxes (the Cradle's posts are the same).
    const grp = groupBoxes(sideBox, n, CRADLE.cellM);
    sideObj = grp.obj; sideObjBox = grp.box; sideObjN = grp.cnt;
    sidePost = new Set(cradlePostList(sideBox, n, grp).map((p) => p[6]));
    return true;
  }

  // The pending records, finished now (at the ring's last step), then the
  // ring cleared: a respawn or a map change starts another flight.
  function sideReset(why) {
    const tEnd = sideN ? sideBuf[((sideHead - 1) % SCAP + SCAP) % SCAP * SW] : simT;
    while (sidePend.length) {
      const p = sidePend.shift();
      p.rec.side = sideRecord(p, tEnd, why);
      try { onSide(p.rec); } catch (e) { /* never break the frame */ }
    }
    sideN = 0; sideHdOn = 0; sideEpoch++;
  }

  // One step into the side ring (see SIDE).
  function sidePush(s, t, seg) {
    const ws = s.ws || 3.5;
    const px = -(s.wz || 0) / ws, py = -(s.wx || 0) / ws, pz = (s.wy || 0) / ws;
    sideColsSet(s.colliders, ws);
    if (sideN) {
      const k0 = ((sideHead - 1) % SCAP + SCAP) % SCAP * SW;
      if (Math.hypot(px - sideBuf[k0 + 2], py - sideBuf[k0 + 3], pz - sideBuf[k0 + 4]) > 2) sideReset('jump');
    }
    const x = s.qx || 0, y = s.qy || 0, z = s.qz || 0, w = s.qw == null ? 1 : s.qw;
    const fx = 1 - 2 * (y * y + z * z), fy = 2 * (x * y + w * z), fz = 2 * (x * z - w * y);
    const lx = 2 * (x * y - w * z), ly = 1 - 2 * (x * x + z * z);
    const uz = 1 - 2 * (x * x + y * y);
    const lh = Math.hypot(lx, ly), fh = Math.hypot(fx, fy);
    let hx = 0, hy = 0;
    if (fh > 0.4) { hx = fx / fh; hy = fy / fh; } else if (lh > 0.25) { hx = ly / lh; hy = -lx / lh; }
    if (hx || hy) {
      // Kept from the step before; on a fresh ring, the nose's way.
      const ref = sideHdOn ? hx * sideFx + hy * sideFy : hx * fx + hy * fy;
      if (ref < 0) { hx = -hx; hy = -hy; }
      sideFx = hx; sideFy = hy; sideHdOn = 1;
    }
    // The kNear nearest objects beside the path within passM, nearest
    // first, each by its nearest box.
    let cn = 0;
    const B = sideBox, O = sideObj, nb = sideColsN > 0 ? sideColsN : 0, band = SIDE.bandM, dMax = SIDE.passM * SIDE.passM;
    for (let i = 0; i < nb; i++) {
      const k = i * 6, x0 = B[k];
      if (x0 !== x0) continue;
      const y0 = B[k + 1], z0 = B[k + 2], x1 = B[k + 3], y1 = B[k + 4], z1 = B[k + 5];
      if (z1 < pz - band || z0 > pz + band) continue;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) continue;
      const qx = px < x0 ? x0 : (px > x1 ? x1 : px), qy = py < y0 ? y0 : (py > y1 ? y1 : py), qz = pz < z0 ? z0 : (pz > z1 ? z1 : pz);
      const dd = (qx - px) * (qx - px) + (qy - py) * (qy - py) + (qz - pz) * (qz - pz);
      if (dd > dMax || (cn === SK && dd >= candD[SK - 1])) continue;
      const ob = O[i];
      // The object once, by its nearest box.
      let j = -1;
      for (let m = 0; m < cn; m++) if (candO[m] === ob) { j = m; break; }
      if (j >= 0) {
        if (dd >= candD[j]) continue;
      } else j = cn < SK ? cn++ : SK - 1;
      while (j > 0 && candD[j - 1] > dd) {
        candD[j] = candD[j - 1]; candI[j] = candI[j - 1]; candO[j] = candO[j - 1];
        candP[j * 3] = candP[j * 3 - 3]; candP[j * 3 + 1] = candP[j * 3 - 2]; candP[j * 3 + 2] = candP[j * 3 - 1];
        j--;
      }
      candD[j] = dd; candI[j] = i; candO[j] = ob; candP[j * 3] = qx; candP[j * 3 + 1] = qy; candP[j * 3 + 2] = qz;
    }
    const k = sideHead * SW;
    sideBuf[k] = t; sideBuf[k + 1] = seg;
    sideBuf[k + 2] = px; sideBuf[k + 3] = py; sideBuf[k + 4] = pz;
    sideBuf[k + 5] = s.vx || 0; sideBuf[k + 6] = s.vy || 0; sideBuf[k + 7] = s.vz || 0;
    sideBuf[k + 8] = fx; sideBuf[k + 9] = fy; sideBuf[k + 10] = fz;
    sideBuf[k + 11] = sideFx; sideBuf[k + 12] = sideFy; sideBuf[k + 13] = uz; sideBuf[k + 14] = 0;
    for (let j = 0; j < cn; j++) {
      const o = k + SB + j * 6;
      sideBuf[o] = candO[j] + 1; sideBuf[o + 1] = candI[j];
      sideBuf[o + 2] = candP[j * 3]; sideBuf[o + 3] = candP[j * 3 + 1]; sideBuf[o + 4] = candP[j * 3 + 2];
      sideBuf[o + 5] = Math.sqrt(candD[j]);
    }
    if (cn < SK) sideBuf[k + SB + cn * 6] = 0;
    sideHead = (sideHead + 1) % SCAP;
    if (sideN < SCAP) sideN++;
  }

  // A record's rec.side now, and again SIDE.postS after its end. The window
  // opens SIDE.preS before the segment, or before the merge it closed.
  function sideAttach(rec, mg) {
    const ta = mg && mg.t > 0 ? Math.min(segSim0, simT - mg.t) : segSim0;
    const p = { rec, t0: segSim0, t1: simT, ta, due: simT + SIDE.postS };
    rec.side = sideRecord(p, simT, 'end');
    sidePend.push(p);
  }

  // rec.side over the ring from p.ta - SIDE.preS to tEnd. Times relative to
  // p.t0, the segment's first step (s). why: 'end' (at the segment's end),
  // 'post' (SIDE.postS later), 'jump' or 'colliders' (finished early at a
  // respawn or a change of colliders). In the heading's frame (F forward,
  // L its left): vAlong (+ toward the heading, - backwards), vLat. noseEl
  // the nose above the horizon, pitchH its angle in the heading's vertical
  // plane (0 level, 90 straight up, 180 over the top), deg. noseDot the
  // velocity along the nose (-1 straight against it; null under 0.85 m/s).
  // A pass (see SIDE): its object (obj) and box, read at the object's nearest
  // (t; at: when it went behind): d (3-D) and dH (level) to the box's
  // nearest point (m), up its height above the quad, latT its side of the
  // direction of travel there (+ left), latH of the heading, lat1 of the
  // direction of travel at the object's first pass (a Cradle: one sign, then
  // the other), ux uy that direction of travel, and the quad's state.
  // segs: the segments in the window ([start, end], s; 8 at most). stops:
  // the level travel turned round. noseMax: the most pitchH (unwrapped).
  // passDrop: passes over passMax (the nearest in time to the segment are
  // kept); passOver: passes over or under an object (no side), not listed.
  // posts: each post seen (see SIDE), its footprint, its nearest (dMin,
  // tMin), and each crossing of the line square to the heading through its
  // centre, in the frame of the heading at its first crossing moving
  // forward (hd1: F1, its left L1): fwd (moving along F1, the post going
  // behind) or back (against F1, the post coming ahead), lat its side then
  // (+ left of F1, m; a Cradle: one sign, then the other), at every step;
  // with d to it, vAlong (along F1), noseDot, pitchH, and, since the
  // crossing before, the nearest (dMin) and the most pitchH (noseMax). objs: the objects
  // passed and the nearest (bounds, sim-core m: x0 y0 z0 x1 y1 z1).
  // The posts' crossings (rec.side.posts): per post seen in the window (an
  // object listed beside the path at any step), at every step.
  function postRecord(ks, t0, per) {
    const D = 180 / Math.PI, out = [];
    for (const ob of per.keys()) {
      if (out.length >= SIDE.postMax) break;
      const o = ob * 6, B = sideObjBox;
      const x0 = B[o], y0 = B[o + 1], z0 = B[o + 2], x1 = B[o + 3], y1 = B[o + 4], z1 = B[o + 5];
      const w = Math.max(x1 - x0, y1 - y0), h = z1 - z0;
      if (!sidePost.has(ob)) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rec = { obj: ob, box: [x0, y0, z0, x1, y1, z1].map(r3), w: r3(w), h: r3(h), dMin: null, tMin: null, hd1: null, crossings: [] };
      let F1 = null, sg = 0, sgH = 0, dMin = Infinity, tMin = 0, segMin = Infinity, segNose = -Infinity;
      for (let j = 0; j < ks.length; j++) {
        const k = ks[j];
        const px = sideBuf[k + 2], py = sideBuf[k + 3], pz = sideBuf[k + 4];
        const qx = px < x0 ? x0 : (px > x1 ? x1 : px), qy = py < y0 ? y0 : (py > y1 ? y1 : py), qz = pz < z0 ? z0 : (pz > z1 ? z1 : pz);
        const d = Math.hypot(qx - px, qy - py, qz - pz);
        const t = sideBuf[k] - t0;
        if (d < dMin) { dMin = d; tMin = t; }
        if (d < segMin) segMin = d;
        const fz = sideBuf[k + 10], Fx = sideBuf[k + 11], Fy = sideBuf[k + 12];
        const pitchH = Math.atan2(fz, sideBuf[k + 8] * Fx + sideBuf[k + 9] * Fy) * D;
        if (pitchH > segNose) segNose = pitchH;
        const vx = sideBuf[k + 5], vy = sideBuf[k + 6], vz = sideBuf[k + 7];
        const rx = cx - px, ry = cy - py;
        if (!F1) {
          // The first crossing moving forward, in the heading's frame.
          const a = rx * Fx + ry * Fy, nowH = a >= SIDE.hystM ? 1 : a <= -SIDE.hystM ? -1 : 0;
          if (nowH) {
            if (sgH === 1 && nowH === -1 && vx * Fx + vy * Fy >= SIDE.minSpd) { F1 = [Fx, Fy]; sg = -1; rec.hd1 = Math.round(Math.atan2(Fy, Fx) * D); }
            sgH = nowH;
          }
          if (!F1) continue;
        } else {
          const a = rx * F1[0] + ry * F1[1], now = a >= SIDE.hystM ? 1 : a <= -SIDE.hystM ? -1 : 0;
          if (!now || now === sg) continue;
          sg = now;
        }
        const lat = -rx * F1[1] + ry * F1[0];
        const va = vx * F1[0] + vy * F1[1], sp = Math.hypot(vx, vy, vz);
        if (Math.abs(lat) <= SIDE.postLat && rec.crossings.length < 8) {
          rec.crossings.push({
            t: r3(t), way: sg < 0 ? 'fwd' : 'back', lat: r3(lat), d: r3(d), z: r3(pz), vAlong: r3(va),
            noseDot: sp > 0.85 ? r3((vx * sideBuf[k + 8] + vy * sideBuf[k + 9] + vz * fz) / sp) : null,
            pitchH: Math.round(pitchH), dMin: r3(segMin), noseMax: Math.round(segNose), seg: sideBuf[k + 1],
          });
        }
        segMin = Infinity; segNose = -Infinity;
      }
      rec.dMin = r3(dMin); rec.tMin = r3(tMin);
      out.push(rec);
    }
    return out;
  }

  function sideRecord(p, tEnd, why) {
    const D = 180 / Math.PI, F = SW, t0 = p.t0;
    const out = { why, dur: r3(p.t1 - t0), to: r3(tEnd - t0), a0: r3(p.ta - t0), simT0: r3(t0), epoch: sideEpoch, n: 0, cut: false, boxN: sideColsN > 0 ? sideColsN : 0 };
    const ks = [];
    const ta = p.ta - SIDE.preS;
    for (let i = 0; i < sideN; i++) {
      const k = ((sideHead - sideN + i) % SCAP + SCAP) % SCAP * F;
      const t = sideBuf[k];
      if (t >= ta - 1e-9 && t <= tEnd + 1e-9) ks.push(k);
    }
    out.n = ks.length;
    if (!ks.length) { out.passes = []; return out; }
    out.cut = sideBuf[ks[0]] > ta + 0.05;
    out.from = r3(sideBuf[ks[0]] - t0);
    const st = (k) => {
      const Fx = sideBuf[k + 11], Fy = sideBuf[k + 12];
      const vx = sideBuf[k + 5], vy = sideBuf[k + 6], vz = sideBuf[k + 7];
      const fx = sideBuf[k + 8], fy = sideBuf[k + 9], fz = sideBuf[k + 10];
      const sp = Math.hypot(vx, vy, vz);
      return {
        t: sideBuf[k] - t0, seg: sideBuf[k + 1], x: sideBuf[k + 2], y: sideBuf[k + 3], z: sideBuf[k + 4],
        vAlong: vx * Fx + vy * Fy, vLat: -vx * Fy + vy * Fx, vz, spd: Math.hypot(vx, vy),
        noseEl: Math.asin(fz > 1 ? 1 : fz < -1 ? -1 : fz) * D, pitchH: Math.atan2(fz, fx * Fx + fy * Fy) * D,
        noseDot: sp > 0.85 ? (vx * fx + vy * fy + vz * fz) / sp : null,
        hd: Math.atan2(Fy, Fx) * D, upZ: sideBuf[k + 13], Fx, Fy, vx, vy,
      };
    };
    const slot = (k, m) => {
      const o = k + SB + m * 6;
      return { obj: sideBuf[o] - 1, box: sideBuf[o + 1], cx: sideBuf[o + 2], cy: sideBuf[o + 3], cz: sideBuf[o + 4], d: sideBuf[o + 5] };
    };
    // Passes, per object.
    const per = new Map(), all = [];
    let over = 0, near = null;
    const thr = SIDE.minSpd, h0 = SIDE.hystM, hk = SIDE.hystK;
    for (let j = 0; j < ks.length; j++) {
      const k = ks[j];
      const px = sideBuf[k + 2], py = sideBuf[k + 3], vx = sideBuf[k + 5], vy = sideBuf[k + 6];
      const spd = Math.hypot(vx, vy);
      for (let m = 0; m < SK; m++) {
        if (!sideBuf[k + SB + m * 6]) break;
        const c = slot(k, m), ob = c.obj;
        if (!near || c.d < near.c.d) near = { k, c };
        let q = per.get(ob);
        if (!q) { q = { sg: 0, bk: k, bc: c, ux: 0, uy: 0, n1: null, tl: sideBuf[k] }; per.set(ob, q); }
        // Out of the list for a while (not beside the path, or 12 nearer):
        // its way past is unknown.
        if (sideBuf[k] - q.tl > 0.1) { q.sg = 0; q.bk = k; q.bc = c; }
        q.tl = sideBuf[k];
        if (c.d < q.bc.d) { q.bk = k; q.bc = c; }
        if (spd < thr) continue;
        const ux = vx / spd, uy = vy / spd;
        const rx = c.cx - px, ry = c.cy - py;
        const a = rx * ux + ry * uy, bnd = Math.max(h0, hk * Math.hypot(rx, ry));
        const now = a >= bnd ? 1 : a <= -bnd ? -1 : 0;
        if (!now) continue;
        if (now === 1) {
          if (q.sg !== 1) { q.bk = k; q.bc = c; }
          q.ux = ux; q.uy = uy;
        } else if (q.sg === 1 && ux * q.ux + uy * q.uy >= SIDE.turnDot) {
          const r = st(q.bk), b = q.bc;
          const brx = b.cx - r.x, bry = b.cy - r.y;
          const pu = r.spd >= thr ? [r.vx / r.spd, r.vy / r.spd] : [ux, uy];
          const latT = -brx * pu[1] + bry * pu[0];
          // Over or under it (no side): counted, not listed.
          if (Math.abs(latT) < h0) over++;
          else if (all.length < 400) {
            if (!q.n1) q.n1 = pu;
            all.push({
              t: r3(r.t), at: r3(sideBuf[k] - t0), obj: ob, box: b.box, d: r3(b.d), dH: r3(Math.hypot(brx, bry)), up: r3(b.cz - r.z),
              latT: r3(latT), latH: r3(-brx * r.Fy + bry * r.Fx), lat1: r3(-brx * q.n1[1] + bry * q.n1[0]),
              ux: r3(pu[0]), uy: r3(pu[1]), spd: r3(r.spd), vAlong: r3(r.vAlong), vz: r3(r.vz),
              noseEl: Math.round(r.noseEl), pitchH: Math.round(r.pitchH), noseDot: r.noseDot == null ? null : r3(r.noseDot),
              hd: Math.round(r.hd), upZ: r3(r.upZ), x: r3(r.x), y: r3(r.y), z: r3(r.z), seg: r.seg,
            });
          }
        }
        q.sg = now;
      }
    }
    // The passMax nearest in time to the segment, in order.
    const off = (x) => (x.t < 0 ? -x.t : x.t > p.t1 - t0 ? x.t - (p.t1 - t0) : 0);
    const passes = all.length > SIDE.passMax ? all.slice().sort((a, b) => off(a) - off(b)).slice(0, SIDE.passMax).sort((a, b) => a.t - b.t) : all;
    out.passes = passes;
    out.passDrop = all.length - passes.length;
    out.passOver = over;
    out.posts = postRecord(ks, t0, per);
    // The window: its segments, the stops, the nose.
    // The stops: the level travel turned round (by 120 degrees or more,
    // moving at minSpd) from where it last went; pitchH unwrapped over the
    // window (a back flip reads 360).
    const segs = [];
    let cur = 0, open = 0, tPrev = 0, rx0 = 0, ry0 = 0, pw = 0, pPrev = 0, nm = null;
    const stops = [];
    for (let j = 0; j < ks.length; j++) {
      const r = st(ks[j]);
      if (r.seg !== cur) {
        if (open) { segs[segs.length - 1][1] = r3(tPrev); open = 0; }
        if (r.seg && segs.length < 8) { segs.push([r3(r.t), null]); open = 1; }
        cur = r.seg;
      }
      tPrev = r.t;
      if (r.spd >= thr) {
        const ux = r.vx / r.spd, uy = r.vy / r.spd;
        if (!rx0 && !ry0) { rx0 = ux; ry0 = uy; }
        else if (ux * rx0 + uy * ry0 <= -0.5) {
          if (stops.length < 8) stops.push({ t: r3(r.t), to: r.vAlong < 0 ? 'back' : 'fwd', pitchH: Math.round(r.pitchH), noseDot: r.noseDot == null ? null : r3(r.noseDot) });
          rx0 = ux; ry0 = uy;
        }
      }
      let dp = r.pitchH - pPrev;
      if (j) { while (dp > 180) dp -= 360; while (dp < -180) dp += 360; pw += dp; } else pw = r.pitchH;
      pPrev = r.pitchH;
      if (!nm || pw > nm.raw) nm = { raw: pw, t: r.t, noseEl: r.noseEl, upZ: r.upZ };
    }
    if (open) segs[segs.length - 1][1] = r3(sideBuf[ks[ks.length - 1]] - t0);
    if (nm) nm = { t: r3(nm.t), pitchH: Math.round(nm.raw), noseEl: Math.round(nm.noseEl), upZ: r3(nm.upZ) };
    out.segs = segs;
    out.stops = stops;
    out.noseMax = nm;
    if (near) {
      const r = st(near.k), c = near.c, rx = c.cx - r.x, ry = c.cy - r.y;
      out.nearest = { t: r3(r.t), obj: c.obj, box: c.box, d: r3(c.d), dH: r3(Math.hypot(rx, ry)), up: r3(c.cz - r.z), latH: r3(-rx * r.Fy + ry * r.Fx), seg: r.seg };
    } else out.nearest = null;
    // The objects passed and the nearest: bounds (sim-core m) and boxes.
    const ids = [];
    for (const q of passes) if (!ids.includes(q.obj)) ids.push(q.obj);
    if (near && !ids.includes(near.c.obj)) ids.push(near.c.obj);
    out.objs = ids.slice(0, 16).map((i) => ({
      obj: i, boxes: sideObjN[i] || 0, box: i < sideObjN.length ? [0, 1, 2, 3, 4, 5].map((u) => r3(sideObjBox[i * 6 + u])) : null,
    }));
    out.cols = ['t', 'seg', 'x', 'y', 'z', 'vAlong', 'vLat', 'vz', 'noseEl', 'pitchH', 'noseDot', 'hd', 'upZ', 'obj', 'box', 'd', 'dH', 'latH', 'up'];
    out.rows = [];
    const M = Math.min(SIDE.rows, ks.length);
    for (let j = 0; j < M; j++) {
      const k = ks[M > 1 ? Math.round((j * (ks.length - 1)) / (M - 1)) : 0];
      const r = st(k), c = sideBuf[k + SB] ? slot(k, 0) : null;
      const rx = c ? c.cx - r.x : 0, ry = c ? c.cy - r.y : 0;
      out.rows.push([r3(r.t), r.seg, r3(r.x), r3(r.y), r3(r.z), r3(r.vAlong), r3(r.vLat), r3(r.vz), Math.round(r.noseEl), Math.round(r.pitchH),
        r.noseDot == null ? null : r3(r.noseDot), Math.round(r.hd), r3(r.upZ),
        c ? c.obj : null, c ? c.box : null, c ? r3(c.d) : null, c ? r3(Math.hypot(rx, ry)) : null, c ? r3(-rx * r.Fy + ry * r.Fx) : null, c ? r3(c.cz - r.z) : null]);
    }
    return out;
  }

  function emitAbort(t, f, why) {
    const rec = base('abort', t);
    rec.t0 = r3(segT0);
    rec.result = null;
    rec.reason = why;
    rec.saw = { dur: r3(f.dur), n: f.n, pitchDeg: degOf(f.pitch), rollDeg: degOf(f.roll), yawDeg: degOf(f.yaw) };
    try { sideAttach(rec, null); } catch (e) { rec.side = null; }
    emit(rec);
  }

  // The Cradle's inputs from ta to tb (its clock), as rows of the record, a
  // row every dt or more (0: every step). A step left out goes on the next
  // row kept: its turn added to that row's, and a touch, a reset or a
  // disarm on it marked there (a replay of the rows then sees the whole turn
  // and every touch).
  function cgRows(ta, tb, dt) {
    const rows = [];
    let last = -Infinity, yrA = 0, cA = 0, fA = 0, aA = 1;
    for (let i = 0; i < cgN; i++) {
      const k = ((cgHead - cgN + i) % CG_CAP + CG_CAP) % CG_CAP * CG_W;
      const tt = cgBuf[k];
      if (tt < ta - 1e-9 || tt > tb + 1e-9) continue;
      if (dt > 0 && tt < last + dt - 1e-9) {
        yrA += cgBuf[k + 13];
        if (cgBuf[k + 11]) cA = 1;
        if (!cgBuf[k + 12]) aA = 0;
        if (cgBuf[k + 14]) fA = 1;
        continue;
      }
      last = tt;
      rows.push([Math.round(tt * 10000) / 10000, r4(cgBuf[k + 1]), r4(cgBuf[k + 2]), r4(cgBuf[k + 3]), r3(cgBuf[k + 4]), r3(cgBuf[k + 5]), r3(cgBuf[k + 6]),
        r4(cgBuf[k + 7]), r4(cgBuf[k + 8]), r4(cgBuf[k + 9]), r3(cgBuf[k + 10]), cA || cgBuf[k + 11] ? 1 : 0, aA && cgBuf[k + 12] ? 1 : 0,
        r4(cgBuf[k + 13] + yrA), fA || cgBuf[k + 14] ? 1 : 0]);
      yrA = 0; cA = 0; fA = 0; aA = 1;
    }
    return rows;
  }

  // A cradle record: this step's verdicts (sim-tricks.js cradleStep's; the
  // Cradle, if one, first), the numbers they were judged by, the posts near
  // the path, and the inputs from CRADLE_LOG.preS before the earliest first
  // pass to the verdict (again to postS past it). lost: verdicts the gate's
  // list dropped before this step read them.
  function cradleWhy(v) {
    return v.result
      ? 'Cradle round post ' + v.obj + ': out ' + Math.abs(v.lat1).toFixed(2) + ' m, nose ' + v.elMax + '°, back ' + Math.abs(v.lat2).toFixed(2) + ' m the other side at ' + (-v.vBack).toFixed(1) + ' m/s, ' + v.offNose + '° off the nose, ' + v.dt.toFixed(2) + ' s'
      : 'no Cradle round post ' + v.obj + ': ' + v.why;
  }
  function emitCradle(t, vs, ev, lost) {
    const v = vs.find((x) => x.result) || vs[0];
    const others = vs.filter((x) => x !== v);
    const rec = base('cradle', t);
    rec.result = v.result || null;
    rec.event = v.result ? ev || null : null;
    rec.reason = cradleWhy(v) + (others.length ? ' (and post ' + others.map((o) => o.obj + ' ' + (o.result || o.why)).join(', post ') + ')' : '');
    rec.closed = det.lastCradleSeg && det.lastCradleSeg === v.seq ? 1 : 0;
    rec.replaced = v.result && det.lastCradleRepl ? det.lastCradleRepl : null;
    rec.gate = v;
    rec.others = others;
    if (lost > 0) rec.lost = lost;
    rec.need = CRADLE;
    let ta = Infinity, tb = -Infinity, tEnd = -Infinity;
    for (const x of vs) { if (x.t1 < ta) ta = x.t1; if (x.t2 > tb) tb = x.t2; }
    // A miss: on to maxS past its first pass, every missDt.
    const dt = v.result ? 0 : CRADLE_LOG.missDt;
    tEnd = v.result ? tb : Math.max(tb, ta + CRADLE.maxS);
    ta -= CRADLE_LOG.preS;
    const due = tEnd + CRADLE_LOG.postS;
    let rows;
    if (!v.result && cgMiss && ta >= cgMiss.ta - 1e-9 && ta <= cgMiss.due && due - cgMiss.ta <= 6) {
      // Inside the last miss record's window: its rows, on to this one's end
      // (refreshed again then; 6 s at most, inside the ring).
      rec.inputs = { cols: CG_COLS, same: cgMiss.rec.seq };
      if (due > cgMiss.due) cgMiss.due = due;
      if (cgPend.indexOf(cgMiss) < 0) cgPend.push(cgMiss);
      rows = cgMiss.rec.inputs.rows;
    } else {
      rows = cgRows(ta, tb, dt);
      rec.inputs = { cols: CG_COLS, rows, to: r3(tb), every: dt, cut: rows.length > 0 && rows[0][0] > ta + 0.05 ? 1 : 0 };
      const p = { rec, ta, dt, due };
      cgPend.push(p);
      if (!v.result) cgMiss = p;
    }
    // The posts within CRADLE.near (level) of the path, as the gate has them.
    const g = det.cg, P = g.post, posts = [];
    for (let i = 0; i < g.postN; i++) {
      const q = i * 9;
      let near = false;
      for (let j = 0; j < rows.length && !near; j++) near = Math.hypot(P[q] - rows[j][1], P[q + 1] - rows[j][2]) <= CRADLE.near;
      if (near) posts.push([r3(P[q + 2]), r3(P[q + 3]), r3(P[q + 4]), r3(P[q + 5]), r3(P[q + 6]), r3(P[q + 7]), P[q + 8]]);
    }
    rec.posts = posts;
    emit(rec);
  }

  function before(sample, dt) {
    void sample; void dt;
    if (heldLive && !det.live) {
      // Dropped between ticks: noteCrash (it leaves lastWhy 'crash 0') or a
      // reset (respawn, map or mode change: resetDetector).
      emitAbort(now(), held, det.lastWhy === 'crash 0' ? 'crash (noteCrash) dropped the open segment' : 'reset (respawn, map or mode change) dropped the open segment');
      heldLive = 0;
    }
    copyFeat(det.feat, pre);
    st.live = det.live; st.lockout = det.lockout;
    st.diveOn = det.diveOn; st.diveDrop = det.diveDrop; st.diveCd = det.diveCd;
    st.gapOn = det.gapOn; st.gapCd = det.gapCd;
  }

  function after(sample, dt, ev) {
    const t = now();
    const s = sample || {};
    const step = dt > 0 && dt < 0.12 ? dt : 0.016;
    const ox = s.ox || 0, oy = s.oy || 0, oz = s.oz || 0;
    const rate = Math.hypot(ox, oy, oz);
    const contact = (s.clearance != null ? s.clearance : 1) <= SEG.contact;
    const vz = s.vz == null ? 0 : s.vz;
    const thr = s.throttle || 0;
    const ws = s.ws || 3.5;
    const alt = s.alt != null ? s.alt : (s.wy || 0) / ws;
    const speed = s.speed != null ? s.speed : Math.hypot(s.vx || 0, s.vy || 0, vz);
    const armed = !!s.armed;
    const diving = thr < SEG.divingThr && rate < SEG.divingRate && vz < SEG.divingVz;
    const lockoutUsed = st.lockout > 0 ? st.lockout - step : st.lockout;

    view.t = t; view.armed = armed; view.contact = contact; view.rate = rate; view.lockout = lockoutUsed;
    view.diving = diving; view.vz = vz; view.speed = speed; view.alt = alt; view.thr = thr;
    view.clr = det.clr; view.gap = gapState(det, s.frameW, s.ws);
    view.diveOn = det.diveOn; view.diveDrop = det.diveDrop; view.diveCd = det.diveCd; view.gapCd = det.gapCd;

    // The camera's steps (camRecord): from a segment's first step to the one
    // that ends it.
    if (!st.live && det.live) {
      const i = info() || {};
      const given = typeof i.camDeg === 'number' && isFinite(i.camDeg);
      camN = 0; camDeg = given ? i.camDeg : 30; camFrom = given ? 'page' : 'default'; camWs = ws;
    }
    if (det.live || st.live) camPush(s, det.live ? det.feat.dur : det.lastFeat.dur);
    // The side ring, every step; a record's rec.side again SIDE.postS on.
    // Logged only: a throw here skips the side, nothing else.
    simT += step;
    if (!st.live && det.live) { segSim0 = simT; segN++; }
    try {
      sidePush(s, simT, det.live || st.live ? segN : 0);
      while (sidePend.length && simT >= sidePend[0].due - 1e-9) {
        const p = sidePend.shift();
        p.rec.side = sideRecord(p, simT, 'post');
        try { onSide(p.rec); } catch (e) { /* never break the frame */ }
      }
    } catch (e) { /* never break the observer */ }

    // Rotation segments.
    let finished = false;
    if (!st.live && det.live) segT0 = t;
    if (st.live && !det.live) {
      const lf = det.lastFeat;
      // finishManeuver copies the segment (one step on from `pre`) into
      // lastFeat; anything else that ends a segment inside a step would not.
      finished = lf.n === pre.n + 1 && lf.alt0 === pre.alt0 && lf.h0x === pre.h0x && lf.h0z === pre.h0z;
      if (finished) emitManeuver(t, lf, ev);
      else emitAbort(t, pre, 'the segment ended inside a step without a finish');
    }
    view.live = det.live;
    view.liveT = det.live ? t - segT0 : 0;
    if (det.live) { copyFeat(det.feat, held); heldLive = 1; } else heldLive = 0;

    // Dives the detector armed.
    if (!st.diveOn && det.diveOn) {
      dive = { t0: t, alt0: det.diveAlt, vz0: vz, speed0: speed, peakSpeed: speed, minVz: vz, drop: 0 };
      watch = null;
    }
    if (dive && det.diveOn) {
      if (speed > dive.peakSpeed) dive.peakSpeed = speed;
      if (vz < dive.minVz) dive.minVz = vz;
      dive.drop = det.diveDrop;
    }
    if (st.diveOn && !det.diveOn && dive) {
      const rec = base('dive', t);
      const fired = ev === 'dive';
      rec.t0 = r3(dive.t0);
      rec.result = fired ? 'dive' : null;
      rec.saw = { alt0: r3(dive.alt0), vz0: r3(dive.vz0), speed0: r3(dive.speed0), drop: r3(fired ? det.diveDrop || dive.drop : dive.drop), peakSpeed: r3(dive.peakSpeed), minVz: r3(dive.minVz), vzEnd: r3(vz), speedEnd: r3(speed) };
      rec.gates = [
        { gate: 'start: vz < ' + DIVE.vzStart + ' m/s', value: r3(dive.vz0), ok: dive.vz0 < DIVE.vzStart },
        { gate: 'start: speed > ' + DIVE.speedStart + ' m/s', value: r3(dive.speed0), ok: dive.speed0 > DIVE.speedStart },
        { gate: 'start: alt > ' + DIVE.altStart + ' m', value: r3(dive.alt0), ok: dive.alt0 > DIVE.altStart },
        { gate: 'fire: drop ≥ ' + DIVE.drop + ' m', value: r3(rec.saw.drop), ok: rec.saw.drop >= DIVE.drop },
        { gate: 'fire: speed > ' + DIVE.speedHold + ' or vz < ' + DIVE.vzHold, value: r3(speed) + ' / ' + r3(vz), ok: speed > DIVE.speedHold || vz < DIVE.vzHold },
      ];
      rec.reason = fired ? 'fired: dropped ' + (det.diveDrop || dive.drop).toFixed(1) + ' m'
        : finished && det.lastId ? 'a trick (' + det.lastId + ') was awarded first; the dive was dropped'
          : contact ? 'contact before ' + DIVE.drop + ' m of drop'
            : vz > DIVE.vzCancel ? 'pulled out (vz > ' + DIVE.vzCancel + ') after ' + dive.drop.toFixed(1) + ' m of ' + DIVE.drop
              : 'dropped';
      emit(rec);
      dive = null;
      sameDescent = vz <= DIVE.vzCancel;
    }

    // Descents past the detector's diving vz that never armed a dive (not
    // the rest of a descent whose dive was just recorded).
    if (sameDescent && (vz > DIVE.vzCancel || contact)) sameDescent = false;
    if (!watch && !dive && !sameDescent && !det.diveOn && armed && vz < SEG.divingVz) {
      watch = { t0: t, alt0: alt, altMax: alt, altMin: alt, peakSpeed: speed, minVz: vz, steps: 0, live: 0, cool: 0, both: 0, vzOk: 0, spdOk: 0, altOk: 0 };
    }
    if (watch) {
      watch.steps++;
      if (speed > watch.peakSpeed) watch.peakSpeed = speed;
      if (vz < watch.minVz) watch.minVz = vz;
      if (alt > watch.altMax) watch.altMax = alt;
      if (alt < watch.altMin) watch.altMin = alt;
      if (det.live || st.live) watch.live++;
      if (st.diveCd > 0) watch.cool++;
      const vOk = vz < DIVE.vzStart, sOk = speed > DIVE.speedStart, aOk = alt > DIVE.altStart;
      if (vOk) watch.vzOk++;
      if (sOk) watch.spdOk++;
      if (aOk) watch.altOk++;
      if (vOk && sOk && aOk) watch.both++;
      if (det.diveOn) watch = null;
      else if (vz > DIVE.vzCancel || contact || !armed) {
        const rec = base('dive', t);
        rec.t0 = r3(watch.t0);
        rec.result = null;
        rec.armed = false;
        rec.saw = { alt0: r3(watch.alt0), altMax: r3(watch.altMax), altMin: r3(watch.altMin), drop: r3(watch.altMax - watch.altMin), peakSpeed: r3(watch.peakSpeed), minVz: r3(watch.minVz), steps: watch.steps };
        const why = [];
        if (!watch.vzOk) why.push('vz never < ' + DIVE.vzStart + ' (min ' + watch.minVz.toFixed(1) + ')');
        if (!watch.spdOk) why.push('speed never > ' + DIVE.speedStart + ' (peak ' + watch.peakSpeed.toFixed(1) + ')');
        if (!watch.altOk) why.push('alt never > ' + DIVE.altStart + ' m (max ' + watch.altMax.toFixed(1) + ')');
        if (!why.length && !watch.both) why.push('vz, speed and alt each passed but never on the same step');
        if (watch.both) {
          if (watch.live) why.push('a rotation segment was open (' + watch.live + ' steps)');
          if (watch.cool) why.push('dive cooldown (' + watch.cool + ' steps)');
        }
        rec.reason = 'not armed: ' + (why.join(' · ') || 'unknown');
        rec.gates = [
          { gate: 'start: vz < ' + DIVE.vzStart + ' m/s', value: r3(watch.minVz), ok: watch.vzOk > 0 },
          { gate: 'start: speed > ' + DIVE.speedStart + ' m/s', value: r3(watch.peakSpeed), ok: watch.spdOk > 0 },
          { gate: 'start: alt > ' + DIVE.altStart + ' m', value: r3(watch.altMax), ok: watch.altOk > 0 },
        ];
        emit(rec);
        watch = null;
      }
    }

    // The Cradle: its inputs this step (once per detector step), then each
    // verdict since the last step (after the segment it closed, if any).
    try {
      const g = det.cg;
      if (g && g.inp && g.inp.t !== cgT) {
        const I = g.inp, k = cgHead * CG_W;
        cgT = I.t;
        cgBuf[k] = I.t; cgBuf[k + 1] = I.x; cgBuf[k + 2] = I.y; cgBuf[k + 3] = I.z;
        cgBuf[k + 4] = I.vx; cgBuf[k + 5] = I.vy; cgBuf[k + 6] = I.vz;
        cgBuf[k + 7] = I.fx; cgBuf[k + 8] = I.fy; cgBuf[k + 9] = I.fz; cgBuf[k + 10] = I.upZ;
        cgBuf[k + 11] = I.contact ? 1 : 0; cgBuf[k + 12] = armed ? 1 : 0;
        cgBuf[k + 13] = I.yr || 0; cgBuf[k + 14] = I.fresh ? 1 : 0;
        cgHead = (cgHead + 1) % CG_CAP;
        if (cgN < CG_CAP) cgN++;
      }
      if (g && g.seq !== cgSeq) {
        const vs = g.out.filter((v) => v.seq > cgSeq);
        if (vs.length) emitCradle(t, vs, ev, g.seq - cgSeq - vs.length);
        cgSeq = g.seq;
      }
      // The records' inputs again, postS past their verdicts.
      for (let k = 0; k < cgPend.length; k++) {
        if (cgT < cgPend[k].due - 1e-9) continue;
        const p = cgPend.splice(k--, 1)[0];
        p.rec.inputs.rows = cgRows(p.ta, p.due, p.dt);
        p.rec.inputs.to = r3(p.due);
        try { onSide(p.rec); } catch (e) { /* never break the frame */ }
      }
    } catch (e) { /* logged only: never break the observer */ }

    // Gaps: each pass or skim the detector resolves (gapSeq). Not a trick.
    if (det.gapSeq !== gapSeq) {
      const rec = base('gap', t);
      rec.result = null;
      rec.reason = det.gapNote;
      rec.how = / an opening /.test(det.gapNote) ? 'generic' : 'authored';
      emit(rec);
    }
    gapSeq = det.gapSeq;
  }

  return { before, after, view, detector: det };
}

// ---- The overlay (browser only) ----

const CSS = '#trickXr{position:fixed;right:8px;top:132px;z-index:16;pointer-events:none;margin:0;'
  + 'width:min(560px,calc(100vw - 16px));max-height:calc(100vh - 150px);overflow:hidden;box-sizing:border-box;'
  + "font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;line-height:1.42;letter-spacing:.01em;"
  + 'color:#bfefff;background:rgba(8,6,18,.84);border:1px solid rgba(0,240,255,.3);padding:8px 10px;'
  + 'white-space:pre-wrap;word-break:break-word;text-shadow:0 1px 4px rgba(0,0,0,.8)}'
  + '#trickXr .h{color:#00f0ff;font-weight:700;letter-spacing:.08em}'
  + '#trickXr .ok{color:#ff2bd6;font-weight:700}'
  + '#trickXr .near{color:#ff7a18}'
  + '#trickXr .no{color:#7d8aa3}'
  + '#trickXr .d{color:#7d8aa3}'
  + '#trickXrCopy{pointer-events:auto;display:block;margin:0 0 6px auto;font-family:inherit;font-size:11px;letter-spacing:.08em;'
  + 'text-transform:uppercase;color:#080612;background:#00f0ff;border:0;padding:4px 10px;cursor:pointer}'
  + '#trickXrCopy.flash{background:#ff2bd6;color:#fff}'
  + 'body.menu-open #trickXr,body.builder-on #trickXr,body:has(#panel.open) #trickXr{opacity:.35}';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const pad = (s, n) => (String(s).length >= n ? String(s) : String(s) + ' '.repeat(n - String(s).length));
const mark = (ok) => (ok ? '✓' : '✗');

// One row per candidate: a miss names its weakest term and counts the rest
// (the console JSON has every term).
function candidateLine(c) {
  const cls = c.verdict === 'fired' ? 'ok' : c.total >= 0.25 ? 'near' : 'no';
  const sym = c.verdict === 'fired' ? '✓' : c.verdict === 'overridden' || c.verdict === 'lost' ? '~' : '✗';
  let why = c.reason;
  if (c.verdict === 'missed' && c._gates) {
    const w = weakest(c._gates, 99);
    why = w.length ? gateText(w[0]) + (w.length > 1 ? '  (+' + (w.length - 1) + ' more)' : '') : c.reason;
  }
  return '<span class="' + cls + '">' + sym + ' ' + esc(pad(c.name.replace(' (Ham)', ''), 18)) + pad(c.total.toFixed(2), 5) + '</span> '
    + '<span class="d">' + esc(why) + '</span>';
}

// createTrickDebug({ document, tricks, now, info, console }): the observer on
// tricks.detector(), the overlay, and one console line of JSON per attempt.
// The page calls before(sample, dt) and after(sample, dt, ev) around
// tricks.tick. attempts() returns the last 200 records.
export function createTrickDebug(opts) {
  const o = opts || {};
  const doc = o.document || (typeof document !== 'undefined' ? document : null);
  const tricks = o.tricks;
  const out = o.console || (typeof console !== 'undefined' ? console : null);
  const now = o.now || function () { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001; };
  const info = o.info || function () { return {}; };
  const attempts = [];
  let lastManeuver = null;   // the last segment attempt (maneuver or abort)
  let lastEx = null;         // the last one the classifier scored: { rec, ex }
  let lastDive = null;
  let lastGap = null;
  let lastCradle = null;
  let el = null;
  let paintedAt = -1;
  let dirty = true;

  const obs = createTrickObserver(tricks.detector(), {
    now, info,
    // rec.side refreshed (the record in attempts, for Copy trick log; the
    // console keeps one line per attempt, as it was emitted).
    onSide() { dirty = true; },
    onAttempt(rec) {
      const ex = rec._explain;
      delete rec._explain;
      attempts.push(rec);
      if (attempts.length > 200) attempts.shift();
      if (rec.type === 'maneuver' || rec.type === 'abort') lastManeuver = { rec, ex };
      if (ex && ex.candidates && ex.candidates.length) lastEx = { rec, ex };
      if (rec.type === 'dive') lastDive = rec;
      else if (rec.type === 'gap') lastGap = rec;
      else if (rec.type === 'cradle') lastCradle = rec;
      dirty = true;
      try { if (out) out.info(JSON.stringify(rec)); } catch (e) { /* never break the frame */ }
      if (rec.mismatch && out) { try { out.warn('tricks debug: replica disagrees with classifyFeat', rec.result, rec.pick && rec.pick.id); } catch (e) { /* ignore */ } }
    },
  });

  function ensure() {
    if (el || !doc || !doc.body) return el;
    if (!doc.getElementById('trickXrStyle')) {
      const st = doc.createElement('style');
      st.id = 'trickXrStyle';
      st.textContent = CSS;
      doc.head.appendChild(st);
    }
    let box = doc.getElementById('trickXr');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'trickXr';
      doc.body.appendChild(box);
    }
    // The button stays; the body under it is redrawn.
    const btn = doc.createElement('button');
    btn.id = 'trickXrCopy';
    btn.type = 'button';
    btn.textContent = 'Copy trick log';
    btn.onclick = function (ev) {
      try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e) { /* ignore */ }
      const ok = copyLog();
      btn.textContent = ok ? 'Copied ' + attempts.length : 'Copy failed';
      btn.className = 'flash';
      setTimeout(function () { btn.textContent = 'Copy trick log'; btn.className = ''; }, 1200);
    };
    box.appendChild(btn);
    el = doc.createElement('div');
    el.id = 'trickXrBody';
    el.setAttribute('aria-hidden', 'true');
    box.appendChild(el);
    return el;
  }

  // The log as text: one line of JSON per attempt, oldest first.
  function logText() {
    return attempts.map((a) => JSON.stringify(a)).join('\n');
  }
  function copyLog() {
    const text = logText();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
        return true;
      }
    } catch (e) { /* fall through */ }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    try {
      if (!doc || !doc.body || !doc.createElement) return false;
      const ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      doc.body.appendChild(ta);
      ta.select();
      const ok = doc.execCommand && doc.execCommand('copy');
      doc.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function diveLine(t) {
    const v = obs.view;
    let s;
    if (v.diveOn) s = '<span class="near">armed</span> drop ' + v.diveDrop.toFixed(1) + '/' + DIVE.drop + ' m  vz ' + v.vz.toFixed(1);
    else if (lastDive && t - lastDive.t < 6) s = (lastDive.result ? '<span class="ok">✓ fired</span> ' : '<span class="no">✗</span> ') + esc(lastDive.reason) + '  <span class="d">' + (t - lastDive.t).toFixed(1) + 's ago</span>';
    else {
      s = '<span class="d">start needs vz ' + v.vz.toFixed(1) + '&lt;' + DIVE.vzStart + ' ' + mark(v.vz < DIVE.vzStart)
        + ' · speed ' + v.speed.toFixed(1) + '&gt;' + DIVE.speedStart + ' ' + mark(v.speed > DIVE.speedStart)
        + ' · alt ' + v.alt.toFixed(1) + '&gt;' + DIVE.altStart + ' ' + mark(v.alt > DIVE.altStart)
        + (v.diveCd > 0 ? ' · cooldown ' + v.diveCd.toFixed(1) + 's' : '') + '</span>';
    }
    return '<span class="' + (lastDive && lastDive.result && t - lastDive.t < 6 ? 'ok' : 'no') + '">' + (lastDive && lastDive.result && t - lastDive.t < 6 ? '✓' : '✗') + ' ' + pad('Dive', 18) + pad('—', 5) + '</span> ' + s;
  }

  // Gap passes: not a trick, no points. What the detector last resolved, or
  // where it stands now (the phase matcher and the Maverick read the passes).
  function gapLine(t) {
    const g = obs.view.gap;
    let s;
    if (lastGap && t - lastGap.t < 6) s = esc(lastGap.reason) + '  <span class="d">' + (t - lastGap.t).toFixed(1) + 's ago</span>';
    else if (!g) s = '<span class="d">no step yet</span>';
    else if (g.authored) s = '<span class="near">in ' + esc(g.authored) + '</span>' + (g.inBySide ? ' <span class="d">(came in by a side: a skim)</span>' : ' <span class="d">out the far face is a pass</span>');
    else if (g.x) {
      const f = (a) => a.map((v) => (v >= 50 ? '—' : (v / 3.5).toFixed(2))).join('+');
      s = '<span class="d">generic: walls x ' + f(g.x) + ' z ' + f(g.z) + ' m, both sides need ≤' + (g.sideMax / 3.5).toFixed(2) + ' m'
        + (g.on ? ' · <span class="near">between walls</span>' : '') + (g.cd > 0 ? ' · cooldown ' + g.cd.toFixed(1) + 's' : '') + '</span>';
    } else s = '<span class="d">no clearance scan yet</span>';
    return '<span class="d">  ' + pad('gap passes', 18) + pad('—', 5) + '</span> ' + s + '  <span class="d">(not a trick)</span>';
  }

  // The Cradle (a path event round a post, not a segment's label): its last
  // verdict, or the first pass it is watching (the latest), or what it needs.
  function cradleLine(t) {
    const det = tricks.detector(), g = det && det.cg;
    let fresh = lastCradle && t - lastCradle.t < 6;
    // The latest first pass, if after the last verdict: it shows first.
    let j = -1;
    if (g && g.armN) for (let i = 0; i < g.postN; i++) if (g.arm[i] && (j < 0 || g.t1[i] > g.t1[j])) j = i;
    if (j >= 0 && lastCradle && lastCradle.gate && g.t1[j] <= lastCradle.gate.t2) j = -1;
    if (j >= 0) fresh = false;
    let s;
    if (fresh) s = (lastCradle.result ? '<span class="ok">fired</span> ' : '') + esc(lastCradle.reason) + '  <span class="d">' + (t - lastCradle.t).toFixed(1) + 's ago</span>';
    else if (j >= 0) {
      s = '<span class="near">first pass</span> post ' + g.post[j * 9 + 8] + ' ' + (g.lat1[j] > 0 ? 'L' : 'R') + ' ' + Math.abs(g.lat1[j]).toFixed(2) + ' m'
        + '  nose ' + Math.round(g.elMax[j]) + '°/' + CRADLE.noseUp + '° ' + mark(g.elMax[j] >= CRADLE.noseUp)
        + '  ' + (g.inp.t - g.t1[j]).toFixed(1) + '/' + CRADLE.maxS + ' s';
    } else {
      s = '<span class="d">' + (g ? g.postN : 0) + ' posts here: pass one flying forward (≤' + CRADLE.outLat + ' m out), nose up ≥' + CRADLE.noseUp
        + '° (never over the top), back past it against the nose the other side (≤' + CRADLE.backLat + ' m)</span>';
    }
    const ok = fresh && !!lastCradle.result;
    return '<span class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓' : '✗') + ' ' + pad('Cradle', 18) + pad('—', 5) + '</span> ' + s;
  }

  function paint(force) {
    const t = now();
    if (!force && !dirty && t - paintedAt < 0.1) return;
    if (!ensure()) return;
    paintedAt = t;
    dirty = false;
    const v = obs.view;
    const i = info() || {};
    const det = tricks.detector();
    const active = tricks.isActive ? tricks.isActive() : true;
    const L = [];
    L.push('<span class="h">TRICKS DEBUG</span>  <span class="d">core</span> ' + esc(i.core || '?') + '  <span class="d">map</span> ' + esc(i.map || '?')
      + (mapIsIndoor(i.map) ? ' (indoor)' : '') + '  ' + (active ? '' : '<span class="near">inactive (not free flight)</span>'));
    const upZ = upZParts(det.qx, det.qy);
    L.push('<span class="d">segment</span>  armed ' + mark(v.armed) + '  air ' + mark(!v.contact) + '  rate ' + v.rate.toFixed(2) + '≥' + RATE_START + ' ' + mark(v.rate >= RATE_START)
      + '  lockout ' + Math.max(0, v.lockout).toFixed(2) + ' ' + mark(v.lockout <= 0) + '  diving ' + (v.diving ? '✓ blocks' : '✗'));
    if (det.live) {
      const f = det.feat;
      L.push('<span class="near">LIVE</span> ' + f.dur.toFixed(2) + 's  P' + degOf(f.pitch) + ' R' + degOf(f.roll) + ' Y' + degOf(f.yaw)
        + '  path P' + degOf(f.pathP) + ' R' + degOf(f.pathR) + ' Y' + degOf(f.pathY) + '  upZ ' + upZ.toFixed(2));
    } else {
      L.push('<span class="d">idle  upZ ' + upZ.toFixed(2) + '  speed ' + v.speed.toFixed(1) + ' m/s  vz ' + v.vz.toFixed(1) + '  alt ' + v.alt.toFixed(1) + ' m</span>');
    }
    const lm = lastManeuver;
    if (lm) {
      const r = lm.rec;
      const s = r.saw || {};
      L.push('<span class="d">last #' + r.seq + ' (' + (t - r.t).toFixed(1) + 's ago)</span>  '
        + (r.result ? '<span class="ok">' + esc(r.result === 'flip' ? trickName('flip', r.dir === 'back' ? -1 : 1) : r.result === 'powerloop' ? trickName('powerloop', 0, r.loops) : nameOf(r.result)) + '</span>' : '<span class="no">' + (r.type === 'abort' ? 'dropped' : 'no label') + '</span>')
        + (r.pole ? ' <span class="ok">· pole ×' + r.pole + '</span>' : '')
        + '  <span class="d">P' + (s.pitchDeg ?? '?') + ' R' + (s.rollDeg ?? '?') + ' Y' + (s.yawDeg ?? '?') + ' ' + (s.dur ?? '?') + 's</span>');
      L.push('<span class="d">  ' + esc(r.reason || '') + '</span>');
      const c = r.cam;
      if (c && c.n) {
        L.push('<span class="d">  cam ' + c.deg + '°' + (c.win ? ' over the orbit ' + c.win[0] + '-' + c.win[1] + 's' : ' over the segment')
          + '  cam up-Z<0 ' + c.upZNeg.toFixed(2) + ' (body ' + c.bodyUpZNeg.toFixed(2) + ')  mean ' + c.upZMean.toFixed(2)
          + (c.offDegMean != null ? '  to centre ' + c.offDegMean + '° (az ' + c.azDegMean + '°, el ' + c.elDegMean + '°, ' + c.distMean.toFixed(1) + ' m)' : '  el ' + c.elDegMean + '°')
          + (c.noseDegMean != null ? '  nose ' + c.noseDegMean + '° tail ' + c.tailShare.toFixed(2) + ' lean ' + c.leanDegQ[2] + '°' : '') + '</span>');
      }
      const sd = r.side;
      if (sd && sd.n) {
        const nb = sd.nearest;
        const lr = (x) => (Math.abs(x) < 0.05 ? '·' : x > 0 ? 'L' : 'R');
        L.push('<span class="d">  side' + (sd.why === 'end' ? ' (to the end)' : sd.why === 'post' ? '' : ' (' + sd.why + ')')
          + (nb ? '  nearest ' + nb.d.toFixed(1) + ' m at ' + nb.t.toFixed(1) + 's' : '  nothing beside')
          + (sd.passes.length ? '  passes ' + sd.passes.map((q) => '#' + q.obj + ' ' + lr(q.lat1) + ' ' + q.d.toFixed(1) + 'm ' + (q.t >= 0 ? '+' : '') + q.t.toFixed(1) + 's ' + (q.vAlong < 0 ? 'back' : 'fwd') + ' nose ' + q.pitchH + '°').join(' · ') : '  no pass')
          + (sd.noseMax ? '  nose max ' + sd.noseMax.pitchH + '°' : '') + '</span>');
      }
      if (s.travelH != null) {
        L.push('<span class="d">  travelH ' + s.travelH.toFixed(1) + ' close ' + s.close.toFixed(2) + ' span ' + s.span.toFixed(1) + 'm drop ' + s.drop.toFixed(1)
          + 'm fol ' + s.follow.toFixed(2) + ' ag ' + s.against.toFixed(2) + ' inv ' + s.inv.toFixed(2) + ' spd ' + s.spdPeak.toFixed(1) + '</span>');
      }
    } else {
      L.push('<span class="d">last  — (no attempt yet)</span>');
    }
    const ex = lastEx ? lastEx.ex : null;
    L.push('<span class="d">' + '─'.repeat(6) + (ex ? ' candidates for #' + lastEx.rec.seq + ' ' : ' candidates ') + '─'.repeat(30) + '</span>');
    for (const id of FOCUS) {
      if (id === 'dive') { L.push(diveLine(t)); continue; }
      const c = ex && ex.candidates.find((x) => x.id === id);
      if (c) L.push(candidateLine(c));
      else L.push('<span class="no">· ' + esc(pad(nameOf(id).replace(' (Ham)', ''), 18)) + pad('—', 5) + '</span> <span class="d">no classified maneuver yet</span>');
    }
    L.push(cradleLine(t));
    L.push(gapLine(t));
    if (ex) {
      const others = ex.candidates.filter((c) => FOCUS.indexOf(c.id) < 0).map((c) => (c.verdict === 'fired' ? '✓' : '') + c.id + ' ' + c.total.toFixed(2));
      L.push('<span class="d">others  ' + esc(others.join('  ')) + '</span>');
      if (ex.pick && ex.pick.overrides.length) L.push('<span class="d">re-label  ' + esc(ex.pick.overrides.map((x) => x.text).join(' ; ')) + '</span>');
      if (lastEx.rec.mismatch) L.push('<span class="near">replica ≠ classifyFeat (' + esc(String(lastEx.rec.pick && lastEx.rec.pick.id)) + ' vs ' + esc(String(lastEx.rec.result)) + ')</span>');
    }
    L.push('<span class="d">console: one JSON line per attempt · window._trickDebug.attempts()</span>');
    el.innerHTML = L.join('\n');
  }

  function before(sample, dt) {
    try { obs.before(sample, dt); } catch (e) { /* never break the frame */ }
  }
  function after(sample, dt, ev) {
    try { obs.after(sample, dt, ev); paint(false); } catch (e) { try { if (out) out.warn('tricks debug', e); } catch (err) { /* ignore */ } }
  }

  return {
    before, after,
    paint: function () { paint(true); },
    copyLog,
    logText,
    attempts: function () { return attempts.slice(); },
    view: obs.view,
  };
}
