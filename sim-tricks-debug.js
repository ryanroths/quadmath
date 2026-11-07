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
} from './sim-tricks.js?v=4e8a912823c5';

// classifyFeat's candidate order and specificity bonus (sim-tricks.js
// CLASS_IDS, SPEC), and the score a pick needs.
export const CLASS_IDS = Object.freeze([
  'halfmavvy', 'rubik', 'cubik', 'barani', 'immelmann', 'ham', 'trippy', 'sideloop', 'juicyflick', 'snapback', 'halfmatty',
  'powerloop', 'matty', 'maverick', 'splits', 'cradle', 'flip', 'roll', 'yawspin',
]);
export const SPEC = Object.freeze({
  halfmavvy: 0.13, rubik: 0.12, cubik: 0.12, barani: 0.12, immelmann: 0.12, ham: 0.11, trippy: 0.11, sideloop: 0.11, juicyflick: 0.11, snapback: 0.11,
  halfmatty: 0.10, powerloop: 0.11, matty: 0.11, maverick: 0.10, splits: 0.10,
  cradle: 0.08, flip: 0, roll: 0, yawspin: 0,
});
export const PICK_MIN = 0.42;
export const SPEC_MIN = 0.15;
// classifyFeat's flip fallback: a pitch rotation this big is never nothing.
export const FLIP_FALLBACK = 5.236;
const FLIP_WIN_LABEL = '1.2 s';

// stepDetector's spatial constants (sim-tricks.js DIVE_*, GAP_*), the dive
// fallback inside classifyFeat, and the segment-start numbers.
export const DIVE = Object.freeze({ vzStart: -6.5, speedStart: 8, altStart: 4, drop: 3.4, speedHold: 5.5, vzHold: -4.5, vzCancel: -2, cooldown: 3.2 });
export const DIVE_FALLBACK = Object.freeze({ drop: 3.2, spdPeak: 8, vzMin: -6.2, absP: 3.2, absR: 2.2, pathY: 2.0 });
// The gap rule's numbers are sim-tricks.js' own exports (imported above).
export const GAP = Object.freeze({ sideK: GAP_SIDE_K, minDepth: GAP_MIN_DEPTH_M, near: GAP_NEAR_M, frameW: FRAME_W_M });
export const SEG = Object.freeze({ divingThr: 0.18, divingRate: 1.55, divingVz: -3.8, contact: 0.08 });

// The ten the overlay spells out (the brief's list). Inverted yaw spin is
// Ham Spin ('ham'); dive and gap are stepDetector's state machines.
export const FOCUS = Object.freeze(['flip', 'roll', 'powerloop', 'splits', 'matty', 'trippy', 'juicyflick', 'ham', 'barani', 'dive', 'gap']);

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
    ge('v.yawSpan', 6.2832, 0), ge('v.yawRate', 2.618, 0), band('f.orbitR', 0.3, 2.5, 0),
    ge('f.orbitSweep', 6.2832, 0), ge('f.orbitTurn', 0.8, 0), ge('f.orbitSpd', 1.0, 0),
  ],
  barani: [
    ge('f.barP', 5.236, 0.35), band('f.barR', 2.356, 3.927, 0), ge('f.upEnd', 0.5, 0),
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
  cradle: [
    band('v.pathP', 1.3, 4.4, 0.45), le('absP', 3.6, 0.5), le('v.inv', 0.22, 0.1),
    ge('v.against - v.follow', 0.08, 0.12), le('absR', 2.2, 0.6), ge('f.travelH', 1.6, 0.6), ge('f.dur', 0.4, 0.1),
    floorOf(ge('v.obj', 0.08, 0.08), 0.55),
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
  { from: 'maverick', to: 'cradle', text: 'maverick→cradle: against > follow + 0.08, cradle > 0.4', when: (c) => c.v.against > c.v.follow + 0.08 && c.sc.cradle > 0.4 },
]);
export const OVERRIDE_TEXT = Object.freeze(OVERRIDES.map((r) => r.text));

// The angle-valued features (shown in degrees by the overlay).
const ANGLE_SRC = new Set([
  'absP', 'absR', 'absY', 'v.pathP', 'v.pathR', 'v.pathY', 'f.pitch', '-f.pitch', 'v.head',
  'Math.max(absR, v.pathR)', 'Math.max(absY, v.pathY)', 'v.pathP - absP',
  'v.flipSpan', 'v.rollSpan', 'v.loopSpan', 'v.loopSweep', 'v.yawSpan', 'f.orbitSweep', 'f.barP', 'f.barR',
  'v.invYaw',
]);
// Angular rates (shown in degrees a second).
const RATE_SRC = new Set(['v.rollRate', 'v.yawRate']);

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
    'f.barP': f.barP, 'f.barR': f.barR, 'f.upEnd': f.upEnd,
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
    baraniPitchDeg: degOf(f.barP), baraniTwistDeg: degOf(f.barR), upEnd: r3(f.upEnd),
    // The segment's twist: its turn about the body axis nearest the flight
    // path, roll or yaw (the Barani's).
    twistDeg: degOf(f.twist),
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
// - type 'gap': a pass through a gap zone at speed (fired or not).
export function createTrickObserver(det, opts) {
  const o = opts || {};
  const emit = o.onAttempt || function () {};
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
    rec.result = mg ? det.lastId : ex.id;
    rec.merged = mg ? { id: mg.id, segs: mg.segs, t: r3(mg.t), score: r3(mg.score), alone: ex.id } : null;
    rec.event = ev || null;
    rec.why = det.lastWhy || '';
    rec.dir = ex.id === 'flip' || ex.id === 'powerloop' ? (det.lastDir < 0 ? 'back' : 'front') : null;
    rec.pole = ex.id === 'trippy' && det.lastPole ? TRIPPY_POLE_MUL : 0;
    rec.loops = ex.id === 'powerloop' ? (det.lastLoops || 1) : 0;
    rec.sloppy = det.lastSloppy ? 1 : 0;
    rec.bump = det.lastBump ? 1 : 0;
    rec.mismatch = ex.mismatch;
    rec.pre = ex.pre;
    rec.saw = ex.saw;
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
    rec._explain = ex;
    emit(rec);
  }

  function emitAbort(t, f, why) {
    const rec = base('abort', t);
    rec.t0 = r3(segT0);
    rec.result = null;
    rec.reason = why;
    rec.saw = { dur: r3(f.dur), n: f.n, pitchDeg: degOf(f.pitch), rollDeg: degOf(f.roll), yawDeg: degOf(f.yaw) };
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

    // Gaps: each pass the detector resolves (gapSeq), and each that scores.
    if (ev === 'gap') {
      const rec = base('gap', t);
      rec.result = 'gap';
      rec.reason = det.lastWhy.replace(/^Gap\s+Beginner\s+\d+\s+/, '');
      rec.how = /walls within/.test(det.lastWhy) ? 'generic' : 'authored';
      emit(rec);
    } else if (det.gapSeq !== gapSeq) {
      const rec = base('gap', t);
      rec.result = null;
      rec.reason = det.gapNote + (/^through/.test(det.gapNote) ? ' (not scored: rotating, cooldown or a repeat)' : '');
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
  let el = null;
  let paintedAt = -1;
  let dirty = true;

  const obs = createTrickObserver(tricks.detector(), {
    now, info,
    onAttempt(rec) {
      const ex = rec._explain;
      delete rec._explain;
      attempts.push(rec);
      if (attempts.length > 200) attempts.shift();
      if (rec.type === 'maneuver' || rec.type === 'abort') lastManeuver = { rec, ex };
      if (ex && ex.candidates && ex.candidates.length) lastEx = { rec, ex };
      if (rec.type === 'dive') lastDive = rec;
      else if (rec.type === 'gap') lastGap = rec;
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

  function gapLine(t) {
    const g = obs.view.gap;
    let s;
    if (lastGap && t - lastGap.t < 6) s = (lastGap.result ? '<span class="ok">✓ fired</span> ' : '<span class="no">✗</span> ') + esc(lastGap.reason) + '  <span class="d">' + (t - lastGap.t).toFixed(1) + 's ago</span>';
    else if (!g) s = '<span class="d">no step yet</span>';
    else if (g.authored) s = '<span class="near">in ' + esc(g.authored) + '</span>' + (g.inBySide ? ' <span class="d">(came in by a side: a skim)</span>' : ' <span class="d">out the far face scores</span>');
    else if (g.x) {
      const f = (a) => a.map((v) => (v >= 50 ? '—' : (v / 3.5).toFixed(2))).join('+');
      s = '<span class="d">generic: walls x ' + f(g.x) + ' z ' + f(g.z) + ' m, both sides need ≤' + (g.sideMax / 3.5).toFixed(2) + ' m'
        + (g.on ? ' · <span class="near">between walls</span>' : '') + (g.cd > 0 ? ' · cooldown ' + g.cd.toFixed(1) + 's' : '') + '</span>';
    } else s = '<span class="d">no clearance scan yet</span>';
    const fired = lastGap && lastGap.result && t - lastGap.t < 6;
    return '<span class="' + (fired ? 'ok' : 'no') + '">' + (fired ? '✓' : '✗') + ' ' + pad('Gap', 18) + pad('—', 5) + '</span> ' + s;
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
      if (id === 'gap') { L.push(gapLine(t)); continue; }
      const c = ex && ex.candidates.find((x) => x.id === id);
      if (c) L.push(candidateLine(c));
      else L.push('<span class="no">· ' + esc(pad(nameOf(id).replace(' (Ham)', ''), 18)) + pad('—', 5) + '</span> <span class="d">no classified maneuver yet</span>');
    }
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
