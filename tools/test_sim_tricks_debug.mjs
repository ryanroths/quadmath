// The ?tricks=debug overlay (sim-tricks-debug.js) against the detector it
// explains (sim-tricks.js). The overlay keeps a copy of classifyFeat's score
// terms; these tests fail if the copy drifts from the source (a number, a
// feature, the order, a re-label rule), if the copy picks differently from
// classifyFeat, or if the observer misreads an attempt. Node stdlib only:
//   node --test tools/test_sim_tricks_debug.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyFeat, makeFeat, makeDetector, stepDetector, resetDetector, createTricks,
  GAP_SIDE_K, GAP_MIN_DEPTH_M, GAP_NEAR_M, FRAME_W_M, featView, matchSpec, PHASE_SPECS,
  CRADLE, makeCradleGate, cradleStep, cradleReset,
} from '../sim-tricks.js';
import {
  GATES, CLASS_IDS, SPEC, OVERRIDES, DIVE, DIVE_FALLBACK, GAP, SEG, FOCUS,
  explainFeat, createTrickObserver, createTrickDebug, gateText, SIDE, CRADLE_LOG,
} from '../sim-tricks-debug.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'sim-tricks.js'), 'utf8').replace(/\r\n/g, '\n');
const simSrc = readFileSync(join(root, 'sim.html'), 'utf8').replace(/\r\n/g, '\n');
const TAU = Math.PI * 2;

// ---- classifyFeat's source, parsed ----

function splitTop(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const num = (t) => (t === 'TAU' ? TAU : Number(t));
function parseTerm(t) {
  let m = t.match(/^Math\.max\((.*)\)$/s);
  if (m) {
    const parts = splitTop(m[1]);
    if (parts.length === 2 && /^[\d.]+$/.test(parts[1])) return { op: 'floor', parts: [parseTerm(parts[0])], min: Number(parts[1]) };
    return { op: 'max', parts: parts.map(parseTerm) };
  }
  m = t.match(/^(atLeast|atMost|inBand)\((.*)\)$/s);
  assert.ok(m, 'unparsed classifier term: ' + t);
  const a = splitTop(m[2]);
  const op = m[1] === 'atLeast' ? '>=' : m[1] === 'atMost' ? '<=' : 'band';
  if (op === 'band') return { op, src: a[0], a: num(a[1]), b: num(a[2]), fade: num(a[3]) };
  return { op, src: a[0], a: num(a[1]), fade: num(a[2]) };
}
function classifierTerms() {
  const body = src.slice(src.indexOf('export function classifyFeat'), src.indexOf('export function makeDetector'));
  const out = {};
  const re = /_sc\.(\w+) = mul\(([\s\S]*?)\n\s*\);/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = splitTop(m[2]).map(parseTerm);
  return { out, body };
}
function strip(g) {
  if (g.op === 'floor') return { op: 'floor', parts: g.parts.map(strip), min: g.min };
  if (g.op === 'max') return { op: 'max', parts: g.parts.map(strip) };
  const o = { op: g.op, src: g.src, a: g.a, fade: g.fade };
  if (g.op === 'band') o.b = g.b;
  return o;
}

test('the overlay copies every classifyFeat score term: same features, numbers and order', () => {
  const { out } = classifierTerms();
  assert.deepEqual(Object.keys(out).sort(), Object.keys(GATES).sort(), 'same candidates');
  for (const id of Object.keys(out)) {
    assert.deepEqual(GATES[id].map(strip), out[id], id + ': the copy differs from sim-tricks.js classifyFeat');
  }
});

test('candidate order, specificity bonus, pick floor and dive fallback match classifyFeat', () => {
  const { body } = classifierTerms();
  const ids = src.match(/const CLASS_IDS = \[([\s\S]*?)\];/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(CLASS_IDS, ids);
  const spec = {};
  for (const m of src.match(/const SPEC = \{([\s\S]*?)\};/)[1].matchAll(/(\w+): ([\d.]+)/g)) spec[m[1]] = Number(m[2]);
  assert.deepEqual({ ...SPEC }, spec);
  assert.ok(body.includes("(SPEC[id] || 0) * ((_sc[id] || 0) > 0.15 ? 1 : 0)"));
  assert.ok(body.includes('if (best < 0.42 || !bestId) {'));
  assert.ok(body.includes('if (v.flipSpan >= 5.236) {'), 'the flip fallback');
  const fb = DIVE_FALLBACK;
  assert.ok(body.includes(`v.drop >= ${fb.drop} && f.spdPeak > ${fb.spdPeak} && f.vzMin < ${fb.vzMin} && absP < ${fb.absP} && absR < ${fb.absR} && v.pathY < ${fb.pathY.toFixed(1)}`));
  assert.ok(body.includes('if (!f || f.n < 4 || f.dur < 0.12) return o;'));
  assert.ok(body.includes('const tiny = absP < 1.7 && absR < 1.7 && absY < 1.7\n    && v.pathP < 1.6 && v.pathR < 1.6 && v.pathY < 1.6 && v.inv < 0.35;'));
});

test('the re-label rules are classifyFeat\'s, in its order, with its numbers', () => {
  const { body } = classifierTerms();
  const lines = body.split('\n').filter((l) => /^\s*if \(bestId === '/.test(l));
  assert.equal(lines.length, OVERRIDES.length);
  const nums = (s) => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  lines.forEach((line, i) => {
    const r = OVERRIDES[i];
    const m = line.match(/^\s*if \(bestId === '(\w+)'(.*?)\) \{ bestId = (.*?); (?:best = (.*?); )?\}$/);
    assert.ok(m, 'unparsed re-label: ' + line);
    assert.equal(r.from, m[1], 'rule ' + (i + 1) + ' from');
    const to = (m[3].match(/'(\w+)'/) || [])[1];
    assert.equal(r.to, to, 'rule ' + (i + 1) + ' to');
    assert.equal(!!r.keep, /\?/.test(m[3]), 'rule ' + (i + 1) + ' keeps best');
    assert.equal(!!r.max, /Math\.max/.test(m[4] || ''), 'rule ' + (i + 1) + ' best = max');
    const want = nums(m[2] + ' ' + m[3]);
    assert.deepEqual(nums(r.text.split(':').slice(1).join(':')), want, 'rule ' + (i + 1) + ' text numbers');
    assert.deepEqual(nums(r.when.toString()), want, 'rule ' + (i + 1) + ' test numbers');
  });
});

test('dive, gap and segment-start numbers are stepDetector\'s', () => {
  assert.ok(src.includes(`const DIVE_DROP = ${DIVE.drop};`));
  assert.ok(src.includes(`const DIVE_VZ = ${DIVE.vzStart};`));
  assert.ok(src.includes(`vz < DIVE_VZ && speed > ${DIVE.speedStart} && alt > ${DIVE.altStart}`));
  assert.ok(src.includes(`d.diveDrop >= DIVE_DROP && (speed > ${DIVE.speedHold} || vz < ${DIVE.vzHold})`));
  assert.ok(src.includes(`if (vz > ${DIVE.vzCancel} || contact) d.diveOn = 0;`));
  assert.ok(src.includes(`d.diveOn = 0; d.diveCd = ${DIVE.cooldown};`));
  // The gap rule's numbers: the overlay shows sim-tricks.js' own exports,
  // and the detector uses them.
  assert.deepEqual({ ...GAP }, { sideK: GAP_SIDE_K, minDepth: GAP_MIN_DEPTH_M, near: GAP_NEAR_M, frameW: FRAME_W_M });
  assert.ok(src.includes('const sideMax = GAP_SIDE_K * (sample.frameW > 0 ? sample.frameW : FRAME_W_M) * ws;'));
  assert.ok(src.includes('const ok = depth >= GAP_MIN_DEPTH_M * ws && onward && !d.live;'));
  assert.ok(src.includes('inAuthored = nearAuthored(sample.gaps, wx, wy, wz, GAP_NEAR_M * ws);'));
  assert.ok(src.includes(`const diving = thr < ${SEG.divingThr} && rate < ${SEG.divingRate} && vz < ${SEG.divingVz};`));
  assert.ok(src.includes(`(sample.clearance != null ? sample.clearance : 1) <= ${SEG.contact};`));
});

// ---- The copy against classifyFeat on random features ----

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random segment, shaped like the detector's: one, two or three axes
// turning, paths at least the net turn, times to 90/180/360 consistent.
function randFeat(r) {
  const f = makeFeat();
  const u = (a, b) => a + (b - a) * r();
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  f.dur = u(0.05, 4.6);
  f.n = Math.floor(u(2, 280));
  const big = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5, TAU, TAU * 1.5];
  const ax = () => (r() < 0.45 ? u(-0.6, 0.6) : (r() < 0.5 ? -1 : 1) * (pick(big) + u(-0.9, 0.9)));
  f.pitch = ax(); f.roll = ax(); f.yaw = ax();
  f.pathP = Math.abs(f.pitch) + (r() < 0.5 ? 0 : u(0, 3));
  f.pathR = Math.abs(f.roll) + (r() < 0.5 ? 0 : u(0, 3));
  f.pathY = Math.abs(f.yaw) + (r() < 0.5 ? 0 : u(0, 3));
  f.peakP = u(0, 14); f.peakR = u(0, 14); f.peakY = u(0, 14); f.peakRate = Math.hypot(f.peakP, f.peakR, f.peakY);
  f.alt0 = u(0.2, 9); f.alt1 = f.alt0 + u(-5, 3);
  f.altMin = Math.min(f.alt0, f.alt1) - u(0, 2); f.altMax = Math.max(f.alt0, f.alt1) + u(0, 2);
  f.h0x = u(-30, 30); f.h0z = u(-30, 30);
  const hEnd = r() < 0.3 ? u(0, 1) : u(0, 40);
  const ang = u(0, TAU);
  f.h1x = f.h0x + hEnd * Math.cos(ang); f.h1z = f.h0z + hEnd * Math.sin(ang);
  f.travelH = hEnd + (r() < 0.4 ? u(0, 2) : u(0, 70)); f.travel = f.travelH + u(0, 5);
  f.radMax = Math.max(hEnd, u(0, f.travelH * 0.6 + 0.01));
  f.head0 = u(-Math.PI, Math.PI); f.head1 = u(-Math.PI, Math.PI);
  f.alignN = Math.floor(u(0, f.n));
  f.followN = Math.floor(u(0, f.alignN)); f.againstN = Math.floor(u(0, f.alignN - f.followN));
  f.followSum = u(-f.alignN, f.alignN);
  f.invAlignN = Math.floor(u(0, f.alignN));
  f.invFollowN = Math.floor(u(0, f.invAlignN)); f.invAgainstN = Math.floor(u(0, f.invAlignN - f.invFollowN));
  f.thrMin = u(0, 0.5); f.thrMax = u(f.thrMin, 1);
  f.upMin = u(-1, 1); f.upMax = u(f.upMin, 1);
  f.invT = r() < 0.3 ? 0 : u(0, f.dur);
  f.spd0 = u(0, 12); f.spdPeak = f.spd0 + u(0, 6); f.spdMin = u(0, f.spd0); f.spd1 = u(0, f.spdPeak);
  f.vzMin = u(-12, 0); f.vzMax = u(0, 6);
  const tFor = (net, a) => (Math.abs(net) >= a ? u(0, f.dur) : 99);
  f.tRoll90 = tFor(f.roll, 1.15); f.tPitch90 = tFor(f.pitch, 1.15); f.tYaw90 = tFor(f.yaw, 1.15);
  f.tRoll180 = tFor(f.roll, Math.PI * 0.78); f.tPitch180 = tFor(f.pitch, Math.PI * 0.78); f.tYaw180 = tFor(f.yaw, Math.PI * 0.78);
  f.tRoll360 = tFor(f.roll, 5.2); f.tPitch360 = tFor(f.pitch, 5.2); f.tYaw360 = tFor(f.yaw, TAU);
  f.underN = r() < 0.6 ? 0 : Math.floor(u(0, f.n)); f.overN = r() < 0.6 ? 0 : Math.floor(u(0, f.n));
  f.objNearN = r() < 0.5 ? 0 : Math.floor(u(0, f.n)); f.objOrbitN = Math.max(f.objNearN, r() < 0.4 ? 0 : Math.floor(u(0, f.n)));
  f.under0 = r() < 0.2 ? 1 : 0; f.over0 = r() < 0.2 ? 1 : 0;
  f.bump = r() < 0.1 ? 1 : 0; f.seg = r() < 0.2 ? 1 : 0; f.oppRY = Math.floor(u(0, f.n));
  // The rotation windows and the loop path: near their thresholds often.
  const near = (a) => (r() < 0.5 ? a + u(-0.6, 0.6) : u(0, a * 1.4));
  f.flipUp = r() < 0.5 ? near(5.236) : u(0, 2); f.flipDn = r() < 0.5 ? near(5.236) : u(0, 2);
  f.rollUp = r() < 0.5 ? near(5.236) : u(0, 2); f.rollDn = r() < 0.5 ? near(5.236) : u(0, 2);
  f.rollUpT = u(0.05, 1.5); f.rollDnT = u(0.05, 1.5);
  f.loopUp = r() < 0.5 ? near(5.236) : u(0, 2); f.loopDn = r() < 0.5 ? near(5.236) : u(0, 2);
  f.loopTot = Math.max(f.loopUp, f.loopDn) + (r() < 0.5 ? 0 : u(0, 8));
  f.postMin = f.altMax - u(0, Math.max(0.01, f.altMax - f.altMin));
  if (r() < 0.3) f.postMin = f.alt0 + u(-0.5, 2.5);
  f.sweep = (r() < 0.5 ? -1 : 1) * near(4.712);
  // Trippy and Barani: the turn about the vertical, the orbit, the Barani
  // window and the end's up-Z, near their thresholds often.
  f.yawUp = r() < 0.5 ? near(6.2832) : u(0, 4); f.yawDn = r() < 0.5 ? near(6.2832) : u(0, 4);
  f.yawUpT = u(0.5, 2.4); f.yawDnT = u(0.5, 2.4);
  f.orbitR = r() < 0.5 ? u(0.1, 3) : u(0.3, 2.5); f.orbitSweep = near(6.2832); f.orbitTurn = u(0.6, 1); f.orbitSpd = u(0.5, 3);
  // Trippy's tail share, near 0.7 or past it often; Orbit's own window and
  // orbit, and its share near 0.3 often.
  f.orbitTail = r() < 0.5 ? u(0.5, 1) : u(0, 1);
  f.slowUp = r() < 0.5 ? near(6.2832) : u(0, 4); f.slowDn = r() < 0.5 ? near(6.2832) : u(0, 4);
  f.slowUpT = u(0.5, 4.4); f.slowDnT = u(0.5, 4.4);
  f.orbit2R = r() < 0.5 ? u(0.1, 3) : u(0.3, 2.5); f.orbit2Sweep = near(6.2832); f.orbit2Turn = u(0.6, 1); f.orbit2Spd = u(0.5, 3);
  f.orbit2Tail = r() < 0.5 ? u(0, 0.5) : u(0, 1);
  f.barP = r() < 0.5 ? near(5.236) : u(0, 4); f.barR = u(1.5, 4.5); f.barVia = r() < 0.5 ? 1 : 0; f.upEnd = r() < 0.6 ? u(0.5, 1) : u(-1, 1);
  if (r() < 0.12) {
    // A yaw spin, upright or inverted: little pitch and roll, a full turn of
    // yaw in place (Yaw Spin, Trippy and Ham live here).
    f.pitch = u(-1.4, 1.4); f.roll = u(-1.4, 1.4); f.yaw = (r() < 0.5 ? -1 : 1) * (TAU + u(-1, 2.5));
    f.pathP = Math.abs(f.pitch) + u(0, 0.8); f.pathR = Math.abs(f.roll) + u(0, 0.8); f.pathY = Math.abs(f.yaw) + u(0, 1);
    f.dur = u(0.4, 3.5); f.peakY = u(1, 11);
    f.tYaw90 = u(0, f.dur * 0.3); f.tYaw180 = u(f.tYaw90, f.dur * 0.6); f.tYaw360 = u(f.tYaw180, f.dur);
    if (r() < 0.5) { f.upMax = u(-1, -0.4); f.upMin = u(-1, f.upMax); f.invT = f.dur * u(0.6, 1); } else { f.upMin = u(0, 1); f.upMax = u(f.upMin, 1); f.invT = 0; }
    f.travelH = u(0, 30); f.radMax = u(0, Math.max(f.travelH, 0.01));
    f.h1x = f.h0x + u(-1, 1) * f.radMax * 0.5; f.h1z = f.h0z + u(-1, 1) * f.radMax * 0.5;
  }
  // Ham: the turn about the vertical while inverted, near its threshold
  // often; none when the segment never passed up-Z -0.5.
  f.invYawUp = f.upMin < -0.5 ? (r() < 0.5 ? near(5.236) : u(0, 3)) : 0;
  f.invYawDn = f.upMin < -0.5 && r() < 0.3 ? near(5.236) : 0;
  // The phase matcher's scores: Flip, Powerloop and Split-S as the matcher
  // scores what these features measured; the other tricks' phases are not
  // in the features, so their scores are drawn (often 0, often 1, some
  // between).
  const v = featView(f);
  const one = (turn) => ({ ph: [{ turn, t: 0 }] });
  f.phFlip = matchSpec(PHASE_SPECS.flip, one(v.flipSpan), f, v);
  f.phLoop = matchSpec(PHASE_SPECS.powerloop, one(v.loopSpan), f, v);
  f.phSplits = matchSpec(PHASE_SPECS.splits, { ph: [{ turn: v.absR, cross: 0, back: 0 }, { turn: -f.pitch, cross: 0, back: 0 }] }, f, v);
  const drawn = () => (r() < 0.7 ? 0 : r() < 0.6 ? 1 : u(0, 1));
  f.phImmel = drawn(); f.phMav = drawn(); f.phMatty = drawn(); f.phHMatty = drawn(); f.phHMavvy = drawn();
  return f;
}

test('the copy picks what classifyFeat picks (id, best, second) on 150k random segments', () => {
  const r = rng(0x5eed);
  const seenTop = Object.create(null);
  const seenId = Object.create(null);
  for (let i = 0; i < 150000; i++) {
    const f = randFeat(r);
    const cls = classifyFeat(f, { id: null, why: '', best: 0, second: 0, secondId: '' });
    const ex = explainFeat(f);
    if (ex.mismatch || ex.id !== cls.id) {
      assert.fail('mismatch on segment ' + i + ': classifyFeat ' + cls.id + ' ' + cls.best + ' / ' + cls.secondId + ' ' + cls.second
        + '; copy ' + JSON.stringify(ex.replica) + '\n' + JSON.stringify(f));
    }
    if (ex.pick) {
      if (ex.pick.topId) seenTop[ex.pick.topId] = (seenTop[ex.pick.topId] || 0) + 1;
      if (ex.pick.secondId) seenTop[ex.pick.secondId] = (seenTop[ex.pick.secondId] || 0) + 1;
    }
    if (cls.id) seenId[cls.id] = (seenId[cls.id] || 0) + 1;
  }
  // Every candidate was in the top two often enough for its terms to count.
  for (const id of CLASS_IDS) assert.ok((seenTop[id] || 0) >= 30, id + ' in the top two only ' + (seenTop[id] || 0) + ' times');
  for (const id of ['flip', 'roll', 'yawspin', 'juicyflick', 'snapback', 'powerloop', 'matty', 'splits', 'ham']) {
    assert.ok((seenId[id] || 0) >= 5, id + ' picked only ' + (seenId[id] || 0) + ' times');
  }
});

test('explainFeat: each candidate has a verdict, and the fired one is classifyFeat\'s', () => {
  const r = rng(7);
  let fired = 0;
  for (let i = 0; i < 4000; i++) {
    const f = randFeat(r);
    const ex = explainFeat(f);
    if (ex.pre.short || ex.pre.tiny) { assert.equal(ex.candidates.length, 0); continue; }
    assert.equal(ex.candidates.length, CLASS_IDS.length);
    for (const c of ex.candidates) {
      assert.ok(['fired', 'missed', 'lost', 'overridden'].includes(c.verdict), c.verdict);
      assert.equal(c.verdict === 'fired', c.id === ex.id, c.id + ' ' + c.verdict + ' vs ' + ex.id);
      assert.ok(c.reason.length > 0);
      let p = 1;
      for (const g of c._gates) p *= g.f;
      assert.equal(p, c._gates.reduce((a, g) => a * g.f, 1));
      if (c.verdict === 'missed') assert.ok(c.total <= 0.42, c.id + ' missed at ' + c.total);
    }
    if (ex.id && ex.id !== 'dive') fired++;
  }
  assert.ok(fired > 100);
});

test('gateText names the feature, the value, the need and the factor', () => {
  const t = gateText({ src: 'f.travelH', op: '>=', a: 5.5, fade: 1.5, value: 1.2, f: 0 });
  assert.equal(t, 'travelH 1.20 needs ≥5.50 →0.00');
  assert.match(gateText({ src: 'absP', op: 'band', a: 2.2, b: 4.6, fade: 0.45, value: Math.PI, f: 1 }), /^absP 180° needs 126°\.\.264° →1\.00$/);
  assert.match(gateText({ src: 'Math.max(absR, v.pathR)', op: '>=', a: 3.2, fade: 0.7, value: 1, f: 0 }), /^max\(absR,pathR\) 57° needs ≥183°/);
});

// ---- The observer on a stepped detector ----

function qMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function qAxis(x, y, z, ang) {
  const s = Math.sin(ang / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(ang / 2) };
}

// Steps a detector through phases [{t, rate:[r,p,y] rad/s body, v:[x,y,z] m/s module, jump}]
// from pos (module m); the scene position is toScene's.
function run(phases, opts) {
  const o = opts || {};
  const d = makeDetector();
  const recs = [];
  const evs = [];
  let t = 0;
  const obs = createTrickObserver(d, { now: () => t, onAttempt: (r) => recs.push(r) });
  let q = { x: 0, y: 0, z: 0, w: 1 };
  const p = { ...(o.pos || { x: 0, y: 0, z: 3 }) };
  const dt = 1 / 60;
  const sample = { armed: true, colliders: o.colliders || null, gaps: o.gaps || null, ws: 3.5, throttle: 0.5, clearance: 2 };
  const fill = (w, v) => {
    sample.qx = q.x; sample.qy = q.y; sample.qz = q.z; sample.qw = q.w;
    sample.ox = w[0]; sample.oy = w[1]; sample.oz = w[2];
    sample.wx = -p.y * 3.5; sample.wy = p.z * 3.5; sample.wz = -p.x * 3.5;
    sample.alt = p.z; sample.vx = v[0]; sample.vy = v[1]; sample.vz = v[2];
    sample.speed = Math.hypot(v[0], v[1], v[2]);
    sample.clearance = p.z;
  };
  fill([0, 0, 0], [0, 0, 0]);
  resetDetector(d, sample);
  for (const ph of phases) {
    const n = Math.round(ph.t / dt);
    for (let i = 0; i < n; i++) {
      const w = ph.rate || [0, 0, 0];
      const v = ph.v || [0, 0, 0];
      if (ph.reset && i === 0) resetDetector(d, sample);
      q = qMul(q, qAxis(...(() => { const m = Math.hypot(...w) || 1; return [w[0] / m, w[1] / m, w[2] / m]; })(), Math.hypot(...w) * dt));
      p.x += v[0] * dt; p.y += v[1] * dt; p.z += v[2] * dt;
      fill(w, v);
      t += dt;
      obs.before(sample, dt);
      const ev = stepDetector(d, sample, dt);
      obs.after(sample, dt, ev);
      if (ev) evs.push(ev);
    }
  }
  return { recs, evs, det: d };
}

test('observer: a flip is one maneuver record whose result is the detector\'s label', () => {
  const { recs, evs } = run([
    { t: 0.3, v: [1, 0, 0] },
    { t: 0.7, rate: [0, 9, 0], v: [1, 0, 0] },
    { t: 0.8, v: [1, 0, 0] },
  ]);
  assert.deepEqual(evs, ['flip']);
  const m = recs.filter((r) => r.type === 'maneuver');
  assert.equal(m.length, 1);
  assert.equal(m[0].result, 'flip');
  assert.equal(m[0].mismatch, false);
  assert.equal(m[0].kind, 'quadmath-trick-attempt');
  assert.ok(m[0].saw.pitchDeg > 300);
  const flip = m[0].candidates.find((c) => c.id === 'flip');
  assert.equal(flip.verdict, 'fired');
  const pl = m[0].candidates.find((c) => c.id === 'powerloop');
  assert.equal(pl.verdict, 'missed');
  assert.match(pl.reason, /loopRise|loopRet|loopSweep/);
  JSON.parse(JSON.stringify(m[0]));
});

test('observer: a segment dropped between steps (a reset) is an abort, not a maneuver', () => {
  const { recs } = run([
    { t: 0.3 },
    { t: 0.3, rate: [6, 0, 0] },
    { t: 0.1, rate: [6, 0, 0], reset: true },
    { t: 0.6 },
  ]);
  const ab = recs.filter((r) => r.type === 'abort');
  assert.equal(ab.length, 1);
  assert.match(ab[0].reason, /reset/);
});

test('observer: a dive the detector arms and fires is a dive record with its gates', () => {
  const { recs, evs } = run([{ t: 0.3 }, { t: 1.2, v: [5, 0, -8] }, { t: 0.6, v: [3, 0, 0] }], { pos: { x: 0, y: 0, z: 14 } });
  assert.deepEqual(evs, ['dive']);
  const dv = recs.filter((r) => r.type === 'dive');
  assert.equal(dv.length, 1);
  assert.equal(dv[0].result, 'dive');
  assert.ok(dv[0].gates.every((g) => g.ok));
});

test('observer: a slow descent the detector never arms is a dive miss naming the gate', () => {
  const { recs, evs } = run([{ t: 0.3 }, { t: 1.0, v: [0, 0, -5] }, { t: 0.4 }], { pos: { x: 0, y: 0, z: 12 } });
  assert.deepEqual(evs, []);
  const dv = recs.filter((r) => r.type === 'dive');
  assert.equal(dv.length, 1);
  assert.equal(dv[0].result, null);
  assert.match(dv[0].reason, /vz never < -6.5/);
  assert.match(dv[0].reason, /speed never > 8/);
});

test('observer: gap passes are records, never a trick: an authored pass, a skim, narrow walls (generic) and wide walls (none)', () => {
  // Fly scene -z (module +x) from scene z 1.75.
  const vol = [{ name: 'test slot', axis: 'z', min: { x: -0.6, y: 0, z: -20 }, max: { x: 0.6, y: 20, z: 0 } }];
  const through = run([{ t: 0.1 }, { t: 1.8, v: [5, 0, 0] }], { gaps: vol, pos: { x: -0.5, y: 0, z: 3 } });
  assert.deepEqual(through.evs, [], 'a gap scores nothing');
  const g = through.recs.filter((r) => r.type === 'gap');
  assert.equal(g.length, 1);
  assert.equal(g[0].result, null);
  assert.equal(g[0].how, 'authored');
  assert.equal(g[0].reason, 'through test slot');
  // Across the same volume through its sides (scene +x, module -y): a skim.
  const across = run([{ t: 0.1 }, { t: 1.0, v: [0, -3, 0] }], { gaps: vol, pos: { x: 3, y: 1.0, z: 3 } });
  assert.deepEqual(across.evs, []);
  const sk = across.recs.filter((r) => r.type === 'gap');
  assert.equal(sk.length, 1);
  assert.equal(sk[0].result, null);
  assert.equal(sk[0].how, 'authored');
  assert.match(sk[0].reason, /skimmed/);
  // Walls 0.3 m apart (0.15 m each side): a pass by the generic rule.
  const narrow = [
    { min: { x: 0.525, y: 0, z: -20 }, max: { x: 3, y: 20, z: 0 } },
    { min: { x: -3, y: 0, z: -20 }, max: { x: -0.525, y: 20, z: 0 } },
  ];
  const gen = run([{ t: 0.1 }, { t: 1.8, v: [5, 0, 0] }], { colliders: narrow, pos: { x: -0.5, y: 0, z: 3 } });
  assert.deepEqual(gen.evs, [], 'a gap scores nothing');
  const gg = gen.recs.filter((r) => r.type === 'gap');
  assert.equal(gg.length, 1);
  assert.equal(gg[0].result, null);
  assert.equal(gg[0].how, 'generic');
  assert.match(gg[0].reason, /^through an opening \(/);
  // Walls 1.1 m apart (the old rule's gap): each side too far for a 9 cm quad.
  const wide = [
    { min: { x: 2, y: 0, z: -20 }, max: { x: 3, y: 20, z: 0 } },
    { min: { x: -3, y: 0, z: -20 }, max: { x: -2, y: 20, z: 0 } },
  ];
  const w = run([{ t: 0.1 }, { t: 1.8, v: [5, 0, 0] }], { colliders: wide, pos: { x: -0.5, y: 0, z: 3 } });
  assert.deepEqual(w.evs, []);
  assert.equal(w.recs.filter((r) => r.type === 'gap').length, 0);
});

// ---- The overlay with a stand-in document ----

function fakeDoc() {
  const byId = new Map();
  const mk = (tag) => ({
    tagName: tag.toUpperCase(), id: '', innerHTML: '', textContent: '', children: [],
    setAttribute() {}, appendChild(c) { this.children.push(c); if (c.id) byId.set(c.id, c); return c; },
  });
  const doc = {
    head: mk('head'), body: mk('body'),
    createElement: mk,
    getElementById: (id) => byId.get(id) || null,
  };
  const wrap = (el) => { const ap = el.appendChild.bind(el); el.appendChild = (c) => { ap(c); if (c.id) byId.set(c.id, c); return c; }; };
  wrap(doc.head); wrap(doc.body);
  return doc;
}

test('createTrickDebug: overlay lists the ten candidates, then the gap passes (not a trick), and the console gets one JSON line per attempt', () => {
  const doc = fakeDoc();
  const lines = [];
  const con = { info: (s) => lines.push(s), warn: () => {} };
  let t = 0;
  const tricks = createTricks({ document: null, storage: null, now: () => t });
  tricks.setActive(true, 'city');
  const dbg = createTrickDebug({ document: doc, tricks, now: () => t, info: () => ({ core: 'bf', map: 'city' }), console: con });
  const d = tricks.detector();
  let q = { x: 0, y: 0, z: 0, w: 1 };
  const dt = 1 / 60;
  const s = { armed: true, colliders: null, ws: 3.5, throttle: 0.5, clearance: 2, alt: 3, wx: 0, wy: 10.5, wz: 0, vx: 1, vy: 0, vz: 0, speed: 1 };
  const step = (w, n) => {
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(...w);
      if (m) q = qMul(q, qAxis(w[0] / m, w[1] / m, w[2] / m, m * dt));
      Object.assign(s, { qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: w[0], oy: w[1], oz: w[2] });
      s.wz -= 1 * dt * 3.5;
      t += dt;
      dbg.before(s, dt);
      const ev = tricks.tick(s, dt);
      dbg.after(s, dt, ev);
    }
  };
  step([0, 0, 0], 20);
  step([9, 0, 0], 42);
  step([0, 0, 0], 50);
  assert.equal(d.lastId, 'roll');
  const json = lines.map((l) => JSON.parse(l));
  assert.equal(json.filter((r) => r.type === 'maneuver').length, 1);
  assert.equal(json[0].result, 'roll');
  dbg.paint();
  assert.ok(doc.getElementById('trickXr'), 'overlay element');
  const el = doc.getElementById('trickXrBody');
  assert.ok(el, 'overlay body');
  const btn = doc.getElementById('trickXrCopy');
  assert.ok(btn && btn.textContent === 'Copy trick log', 'Copy trick log button');
  assert.equal(dbg.logText().split('\n').length, json.length, 'one line per attempt');
  assert.deepEqual(dbg.logText().split('\n').map((l) => JSON.parse(l).seq), json.map((r) => r.seq));
  for (const id of FOCUS) {
    const name = { flip: 'Flip', roll: 'Roll', powerloop: 'Powerloop', splits: 'Split-S', matty: 'Matty Flip', trippy: 'Trippy Spin', juicyflick: 'Juicy Flick', ham: 'Inverted yaw spin', barani: 'Barani', dive: 'Dive' }[id];
    assert.ok(el.innerHTML.includes(name), 'overlay lists ' + name);
  }
  assert.equal(FOCUS.length, 10);
  assert.equal(FOCUS.includes('gap'), false, 'a gap is not a candidate trick');
  assert.ok(el.innerHTML.includes('gap passes'), 'the gap passes line');
  assert.ok(el.innerHTML.includes('(not a trick)'));
  assert.equal(/[✓✗] Gap\b/.test(el.innerHTML), false, 'no Gap trick row');
  assert.match(el.innerHTML, /✓ Roll/);
  assert.equal(dbg.attempts().length, json.length);
});

test('sim.html loads the overlay only with ?tricks=debug and brackets each tricks.step with it', () => {
  assert.match(simSrc, /get\('tricks'\)==='debug'\)\{\n\s*import\('\.\/sim-tricks-debug\.js\?v=[0-9a-f]{12}'\)/);
  assert.equal((simSrc.match(/sim-tricks-debug\.js\?v=/g) || []).length, 1, 'one import, behind the flag');
  assert.ok(simSrc.includes('let trickDebug=null;'));
  assert.ok(simSrc.includes('if(trickDebug)trickDebug.before(trickSample,dt);\n    const trickEv=tricks.step(trickSample,dt);\n    if(trickDebug)trickDebug.after(trickSample,dt,trickEv);'));
  // The overlay reads the detector and writes nothing back to it.
  const dbgSrc = readFileSync(join(root, 'sim-tricks-debug.js'), 'utf8');
  assert.equal(/\bdet\.\w+\s*=[^=]/.test(dbgSrc), false, 'no writes to the detector');
  assert.equal(/\b(stepDetector|resetDetector|pushCombo|saveStore|setDebugOn|setHudOn)\(/.test(dbgSrc), false, 'no detector or store calls');
});

// The camera terms in the log (rec.cam), for setting the Trippy's from the
// owner's flying: logged only, nothing scores them. A kinematic orbit 1.5 m
// round a centre at 3.2 rad/s for 3 s (the trippy's window), at the page's cam
// tilt (30): the nose to the centre, tilted forward 50 (the owner's orbits);
// the tail to the centre, tilted back 66 (the owner's trippies, by their roll
// and yaw); the body inverted, the camera level on the centre.
function camOrbit({ pitch, toCentre, inverted, info }) {
  const d = makeDetector();
  const recs = [];
  let t = 0;
  const obs = createTrickObserver(d, { now: () => t, onAttempt: (r) => recs.push(r), info: () => info });
  const R = 1.5, W = 3.2, dt = 0.004;
  let first = true;
  for (let i = 0; i <= 3.6 / dt; i++) {
    t = i * dt;
    const spin = t <= 3, ph = W * Math.min(t, 3);
    const px = R * Math.cos(ph), py = R * Math.sin(ph);
    let q = qMul(qAxis(0, 0, 1, toCentre ? ph + Math.PI : ph), qAxis(0, 1, 0, spin ? pitch * Math.PI / 180 : 0));
    if (inverted && spin) q = qMul(q, qAxis(1, 0, 0, Math.PI));
    const s = {
      qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: 0, oy: 0, oz: spin ? W : 0,
      wx: -py * 3.5, wy: 5 * 3.5, wz: -px * 3.5, alt: 5,
      vx: spin ? -R * W * Math.sin(ph) : 0, vy: spin ? R * W * Math.cos(ph) : 0, vz: 0, speed: spin ? R * W : 0,
      clearance: 5, armed: true, throttle: 0.5, ws: 3.5, colliders: null,
    };
    if (first) { resetDetector(d, s); d.lockout = 0; first = false; continue; }
    obs.before(s, dt);
    const ev = stepDetector(d, s, dt);
    obs.after(s, dt, ev);
  }
  const m = recs.filter((r) => r.type === 'maneuver');
  assert.equal(m.length, 1);
  return m[0];
}

test('observer: the camera terms (rec.cam) over the orbit, logged only', () => {
  const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, what + ': ' + got + ', want ' + want);
  // Nose to the centre, tilted forward: the camera upright, on the centre (20
  // below it at a 30 degree cam).
  const fwd = camOrbit({ pitch: 50, toCentre: true, info: { camDeg: 30 } });
  const c = fwd.cam;
  assert.equal(c.deg, 30); assert.equal(c.degFrom, 'page');
  assert.ok(c.win && c.win[1] - c.win[0] > 2.5, 'the orbit window ' + c.win);
  assert.equal(c.upZNeg, 0); near(c.upZMean, 0.94, 0.01, 'cam up-Z');
  near(c.offDegMean, 20, 2, 'off the centre'); near(c.elDegMean, -20, 2, 'elevation'); near(c.azDegMean, 0, 2, 'azimuth'); near(c.distMean, 1.5, 0.05, 'distance');
  assert.equal(c.offIn45, 1);
  assert.deepEqual(c.cols, ['t', 'upZ', 'camUpZ', 'offDeg', 'azDeg', 'elDeg', 'dist', 'noseDeg', 'leanDeg', 'side']);
  // The body against the centre, whatever the cam tilt: nose 50 below the
  // centre, the up axis leaning 50 toward it, the tail never toward it.
  near(c.noseDegMean, -50, 2, 'nose'); assert.equal(c.tailShare, 0); near(c.leanDegQ[2], 50, 2, 'lean'); near(c.sideMean, 0, 0.02, 'side');
  assert.equal(c.rows.length, 24);
  assert.equal(c.upZQ.length, 5); assert.equal(c.bodyUpZQ.length, 5);
  near(c.upZQ[2], 0.94, 0.01, 'cam up-Z median'); near(c.bodyUpZQ[2], 0.64, 0.01, 'body up-Z median');
  // Tail to the centre, tilted back 66: the body upright, the picture upside
  // down, the camera up, 84 off the centre.
  const backRec = camOrbit({ pitch: -66, toCentre: false, info: { camDeg: 30 } });
  const back = backRec.cam;
  assert.equal(back.bodyUpZNeg, 0);
  assert.ok(back.upZNeg > 0.98, 'cam up-Z < 0 ' + back.upZNeg);
  near(back.upZMean, -0.1, 0.02, 'cam up-Z'); near(back.offDegMean, 84, 2, 'off the centre'); near(back.elDegMean, 84, 2, 'elevation');
  // Nose up and over (114: 66 above level, away from the centre), the tail
  // toward the centre, the up axis leaning 66 toward it.
  near(back.noseDegMean, 114, 2, 'nose'); assert.ok(back.tailShare > 0.98, 'tail ' + back.tailShare); near(back.leanDegQ[2], 66, 2, 'lean');
  // The body inverted, the camera level on the centre: both upside down, on it.
  const invRec = camOrbit({ pitch: -30, toCentre: true, inverted: true, info: { camDeg: 30 } });
  const inv = invRec.cam;
  assert.ok(inv.bodyUpZNeg > 0.98 && inv.upZNeg > 0.98, 'inverted ' + inv.bodyUpZNeg + ' ' + inv.upZNeg);
  near(inv.offDegMean, 0, 2, 'off the centre');
  // Nose 30 up at the centre, the up axis leaning 150 (inverted, toward it).
  near(inv.noseDegMean, 30, 2, 'nose'); assert.equal(inv.tailShare, 0); near(inv.leanDegQ[2], 150, 2, 'lean');
  // No tilt from the page: 30, said so.
  const def = camOrbit({ pitch: 50, toCentre: true, info: {} }).cam;
  assert.equal(def.deg, 30); assert.equal(def.degFrom, 'default');
  // Logged only: the same label as the detector's own (the nose on the
  // centre, upright: an Orbit; the tail to it, or the body inverted: a
  // Trippy), and the feature copy carries the window.
  assert.equal(fwd.result, 'orbit');
  assert.equal(backRec.result, 'trippy');
  assert.equal(invRec.result, 'trippy');
  const f = makeFeat();
  assert.equal(f.orbitTa, 0); assert.equal(f.orbitTb, 0);
  // The page gives the overlay its cam tilt.
  assert.ok(simSrc.includes('info:()=>({core:cs.kind,map:currentMap,camDeg:CFG.camDeg})'), 'sim.html passes camDeg');
});

test('observer: the Barani probe (rec.barani) names the term that zeroed it', () => {
  // A front flip with a half roll inside it, nose down (90 of pitch, the
  // roll, 270 more: upright at the end): the probe's best stretch twists
  // about 180 with the pitch either side.
  const flip = (rollT) => run([
    { t: Math.PI / 2 / 6, rate: [0, 6, 0] },
    { t: rollT, rate: [9, 0, 0] },
    { t: 1.5 * Math.PI / 6, rate: [0, 6, 0] },
    { t: 0.8 },
  ]).recs.filter((r) => r.type === 'maneuver');
  const half = flip(Math.PI / 9);
  assert.equal(half.length, 1);
  const b = half[0].barani;
  assert.ok(b.inside && Math.abs(b.inside.twistDeg - 180) <= 6, JSON.stringify(b));
  assert.ok(b.inside.beforeDeg >= 60 && b.inside.afterDeg >= 60, JSON.stringify(b.inside));
  assert.equal(b.limit, 'none');
  assert.equal(half[0].result, 'barani');
  // 110 of roll: under the band.
  const short = flip((110 * Math.PI / 180) / 9)[0].barani;
  assert.equal(short.limit, 'barR band', JSON.stringify(short));
  assert.ok(Math.abs(short.any.twistDeg - 110) <= 6, JSON.stringify(short.any));
  // An orbit: too little pitch to scan.
  assert.equal(camOrbit({ pitch: 50, toCentre: true, info: { camDeg: 30 } }).barani.limit, 'barP');
});

// The object beside the path in the log (rec.side), from the owner's
// flying: logged only, nothing scores it. (The Cradle itself is sim-tricks.js
// cradleStep, with its own record: the tests after these.)
// sideRun flies a kinematic path (sim-core m, 4 ms steps) past boxes given
// in sim-core m ({ x0, y0, z0, x1, y1, z1 }), from start, through phases
// { t, rate: [r, p, y] rad/s body, v: [x, y, z] m/s, to: [x, y, z] (a
// jump), boxes (a new collider set) }; withObs false steps the detector
// alone.
function sideRun(boxes, phases, start, withObs = true) {
  const ws = 3.5;
  const toCols = (bs) => bs.map((b) => ({ min: { x: -b.y1 * ws, y: b.z0 * ws, z: -b.x1 * ws }, max: { x: -b.y0 * ws, y: b.z1 * ws, z: -b.x0 * ws }, _tag: 'map' }));
  const cols = toCols(boxes);
  const d = makeDetector();
  const recs = [], evs = [];
  let t = 0;
  const obs = withObs ? createTrickObserver(d, { now: () => t, onAttempt: (r) => recs.push(r) }) : null;
  const dt = 0.004;
  const p = { ...start };
  let q = { x: 0, y: 0, z: 0, w: 1 };
  const s = { armed: true, colliders: cols, ws, throttle: 0.5, clearance: 3 };
  const fill = (w, v) => {
    s.qx = q.x; s.qy = q.y; s.qz = q.z; s.qw = q.w;
    s.ox = w[0]; s.oy = w[1]; s.oz = w[2];
    s.wx = -p.y * ws; s.wy = p.z * ws; s.wz = -p.x * ws; s.alt = p.z;
    s.vx = v[0]; s.vy = v[1]; s.vz = v[2]; s.speed = Math.hypot(v[0], v[1], v[2]);
  };
  fill([0, 0, 0], phases[0].v || [0, 0, 0]);
  resetDetector(d, s);
  d.lockout = 0;
  for (const ph of phases) {
    if (ph.to) { p.x = ph.to[0]; p.y = ph.to[1]; p.z = ph.to[2]; }
    if (ph.boxes) s.colliders = toCols(ph.boxes);
    const w = ph.rate || [0, 0, 0], v = ph.v || [0, 0, 0];
    for (let i = 0, n = Math.round((ph.t || 0) / dt); i < n; i++) {
      const m = Math.hypot(...w);
      if (m) q = qMul(q, qAxis(w[0] / m, w[1] / m, w[2] / m, m * dt));
      p.x += v[0] * dt; p.y += v[1] * dt; p.z += v[2] * dt;
      fill(w, v);
      t += dt;
      if (obs) obs.before(s, dt);
      const ev = stepDetector(d, s, dt);
      if (obs) obs.after(s, dt, ev);
      if (ev) evs.push(ev);
    }
  }
  return { recs, evs, why: d.lastWhy, id: d.lastId, man: recs.filter((r) => r.type === 'maneuver') };
}
// A pole 0.2 m square, 6 m tall, at x 5, its near face 0.9 m to one side
// (side +1: the quad's left, +y) of the line y 0 the quad flies along x at
// 5 m/s from x -10; past it, the nose pitches up 57 degrees while the quad
// drifts 2 m across and stops, then it flies back along x against the
// nose (the pole's other side), and hovers past the record's refresh. A
// second pole at x 9, 2.5 m out on the same side, is ahead all the way
// out and behind once the quad turns round: a turnaround is no pass.
const pole = (x, y, w = 0.1) => ({ x0: x - w, y0: y - w, z0: 0, x1: x + w, y1: y + w, z1: 6 });
const cradlePhases = (side, tail = [{ t: 4.5 }]) => [
  { t: 3.4, v: [5, 0, 0] },
  { t: 0.5, rate: [0, -2, 0], v: [1, side * 4, 0] },
  { t: 1.3, v: [-5, 0, 0] },
  ...tail,
];
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, what + ': ' + got + ', want ' + want);

test('observer: rec.side, a Cradle round a pole: forward past it on one side, back past it against the nose on the other', () => {
  for (const side of [1, -1]) {
    const { man } = sideRun([pole(5, side * 1.0), pole(9, side * 2.5)], cradlePhases(side), { x: -10, y: 0, z: 3 });
    assert.equal(man.length, 1, 'one maneuver');
    const sd = man[0].side;
    // Refreshed SIDE.postS past the segment's end, from SIDE.preS before it.
    assert.equal(sd.why, 'post');
    near(sd.to - sd.dur, SIDE.postS, 0.01, 'refreshed after the end');
    near(sd.from, -SIDE.preS, 0.01, 'from preS before the start');
    assert.equal(sd.cut, false);
    assert.equal(sd.boxN, 2);
    assert.deepEqual(sd.segs, [[0, sd.dur]]);
    // Two passes, one object, the first pole; none of the second (it went
    // from ahead to behind as the quad turned round).
    assert.equal(sd.passes.length, 2, JSON.stringify(sd.passes));
    const [a, b] = sd.passes;
    assert.equal(a.obj, b.obj); assert.equal(a.box, 0); assert.equal(b.box, 0);
    near(a.d, 0.9, 0.02, 'first pass distance'); near(b.d, 0.9, 0.02, 'second pass distance');
    // The side: of the first pass's direction of travel, one sign then the
    // other; of the travel each time, the same (it went round the pole).
    near(a.lat1, side * 0.9, 0.02, 'first pass lat1'); near(b.lat1, -side * 0.9, 0.02, 'second pass lat1');
    near(a.latT, side * 0.9, 0.02, 'first pass latT'); near(b.latT, side * 0.9, 0.02, 'second pass latT');
    near(b.latH, -side * 0.9, 0.02, 'second pass, of the heading');
    // Out level, along the nose, before the segment opened; back against it,
    // the nose up 57, after it closed.
    assert.ok(a.t < 0 && a.seg === 0, 'the first pass before the segment: ' + a.t);
    assert.ok(b.t > sd.dur && b.seg === 0, 'the second after it: ' + b.t + ' > ' + sd.dur);
    near(a.pitchH, 0, 1, 'level going out'); near(a.vAlong, 5, 0.01, 'forward');
    near(b.pitchH, 57, 2, 'nose up coming back'); near(b.noseEl, 57, 2, 'nose up');
    assert.ok(b.vAlong < -4.9 && b.noseDot < -0.5, 'backwards, against the nose: ' + b.vAlong + ' ' + b.noseDot);
    // The stop between them, nose up; the nose's most.
    assert.equal(sd.stops.length, 1, JSON.stringify(sd.stops));
    assert.equal(sd.stops[0].to, 'back'); near(sd.stops[0].pitchH, 57, 2, 'nose at the stop');
    near(sd.noseMax.pitchH, 57, 2, 'nose max');
    assert.equal(sd.nearest.box, 0); near(sd.nearest.d, 0.9, 0.02, 'nearest');
    assert.deepEqual(sd.objs.map((x) => x.obj), [a.obj]);
    assert.deepEqual(sd.objs[0].box, [4.9, c3(side - 0.1), 0, 5.1, c3(side + 0.1), 6]);
    assert.equal(sd.objs[0].boxes, 1);
    assert.equal(sd.rows.length, SIDE.rows);
    assert.equal(sd.cols.length, sd.rows[0].length);
    near(sd.rows[0][0], -SIDE.preS, 0.01, 'first row');
    // The pole as a post: across its line out on one side, back on the
    // other, against the nose, the nose up between (the second pole, never
    // crossed, has none).
    const post = sd.posts.find((x) => x.obj === a.obj);
    assert.ok(post && post.w === 0.2 && post.h === 6, JSON.stringify(sd.posts));
    assert.equal(post.hd1, 0);
    assert.deepEqual(post.crossings.map((x) => x.way), ['fwd', 'back']);
    const [c1, c2] = post.crossings;
    near(c1.lat, side, 0.01, 'out, lat'); near(c2.lat, -side, 0.01, 'back, lat');
    near(c1.vAlong, 5, 0.01, 'out, forward'); near(c2.vAlong, -5, 0.01, 'back, backwards');
    near(c2.noseMax, 57, 2, 'nose up between'); near(c2.dMin, 0.9, 0.02, 'nearest between');
    assert.ok(c2.noseDot < -0.5);
    near(post.dMin, 0.9, 0.02, 'nearest');
    assert.ok(sd.posts.every((x) => x === post || !x.crossings.length));
  }
  // Nothing scores it: the same flight with and without the observer.
  const a = sideRun([pole(5, 1), pole(9, 2.5)], cradlePhases(1), { x: -10, y: 0, z: 3 });
  const b = sideRun([pole(5, 1), pole(9, 2.5)], cradlePhases(1), { x: -10, y: 0, z: 3 }, false);
  assert.deepEqual(a.evs, b.evs);
  assert.equal(a.why, b.why);
  assert.equal(a.id, b.id);
  // The side code reads only the sample and its own ring (no detector
  // state; the caller passes the merge).
  const dSrc = readFileSync(join(root, 'sim-tricks-debug.js'), 'utf8');
  const sideSrc = dSrc.slice(dSrc.indexOf('function sideColsSet('), dSrc.indexOf('function emitAbort('));
  assert.ok(sideSrc.length > 4000);
  assert.equal(/\bdet\b/.test(sideSrc), false, 'the side probe never reads the detector');
});

test('observer: rec.side survives a respawn, and a roll, a gap or a split box fakes no side change', () => {
  // A respawn 1.2 s after the segment ends (before the refresh): the
  // record is finished at the last step before it, both passes kept.
  const r = sideRun([pole(5, 1)], cradlePhases(1, [{ t: 1.2 }, { t: 1.5, to: [40, 30, 3] }]), { x: -10, y: 0, z: 3 }).man[0].side;
  assert.equal(r.why, 'jump');
  assert.equal(r.passes.length, 2, JSON.stringify(r.passes));
  assert.ok(r.passes[0].lat1 > 0 && r.passes[1].lat1 < 0);
  // A new collider set then (a map change): finished on the old one.
  const sw = sideRun([pole(5, 1)], cradlePhases(1, [{ t: 1.2 }, { t: 1.5, boxes: [{ x0: 50, y0: 50, z0: 0, x1: 51, y1: 51, z1: 1 }] }]), { x: -10, y: 0, z: 3 }).man[0].side;
  assert.equal(sw.why, 'colliders');
  assert.equal(sw.passes.length, 2);
  assert.deepEqual(sw.objs[0].box, [4.9, 0.9, 0, 5.1, 1.1, 6]);
  // Past the pole upright, then a half roll 1 m on, flying on inverted: one
  // pass, and the heading never turns round (it is not "backwards").
  const roll = sideRun([pole(5, 1)], [{ t: 3.2, v: [5, 0, 0] }, { t: 0.35, rate: [9, 0, 0], v: [5, 0, 0] }, { t: 2.5, v: [5, 0, 0] }], { x: -10, y: 0, z: 3 }).man[0].side;
  assert.equal(roll.passes.length, 1, JSON.stringify(roll.passes));
  const hd = roll.cols.indexOf('hd'), va = roll.cols.indexOf('vAlong');
  assert.ok(roll.rows.every((x) => Math.abs(x[hd]) <= 2 && x[va] > 4.9), 'heading kept through the roll');
  // The same with the nose 25 degrees down (forward flight): kept.
  const tilt = sideRun([pole(5, 1)], [{ t: 0.1, rate: [0, 25 * Math.PI / 180 / 0.1, 0], v: [5, 0, 0] }, { t: 3.1, v: [5, 0, 0] }, { t: 0.35, rate: [9, 0, 0], v: [5, 0, 0] }, { t: 5 }], { x: -10, y: 0, z: 3 }).man;
  for (const m of tilt) assert.ok(m.side.rows.every((x) => Math.abs(x[hd]) <= 2), 'heading kept, nose down: ' + JSON.stringify(m.side.rows.map((x) => x[hd])));
  // Out through a gap between two poles (0.6 m each side) and back through
  // it: each pole passed twice on the same side (no side change).
  const gap = sideRun([pole(5, 0.7), pole(5, -0.7)], [{ t: 3.4, v: [5, 0, 0] }, { t: 0.5, rate: [0, -2, 0], v: [1, 0, 0] }, { t: 1.3, v: [-5, 0, 0] }, { t: 4.5 }], { x: -10, y: 0, z: 3 }).man[0].side;
  const by = new Map();
  for (const x of gap.passes) by.set(x.obj, [...(by.get(x.obj) || []), x]);
  assert.equal(by.size, 2, JSON.stringify(gap.passes));
  for (const [, ps] of by) {
    assert.equal(ps.length, 2);
    assert.equal(Math.sign(ps[0].lat1), Math.sign(ps[1].lat1), 'the same side both ways');
  }
  // A wide way back (2.3 m off the pole), curving: the post's crossing
  // back is on the other side.
  const wide = sideRun([pole(5, 1)], [{ t: 3.4, v: [5, 0, 0] }, { t: 0.5, rate: [0, -2, 0], v: [0.5, 4, 0] }, { t: 0.6, v: [-3, 2, 0] }, { t: 1.2, v: [-4, 0.5, 0] }, { t: 4.5 }], { x: -10, y: 0, z: 3 }).man[0].side;
  const wp = wide.posts.find((x) => x.crossings.length);
  assert.deepEqual(wp.crossings.map((x) => x.way), ['fwd', 'back'], JSON.stringify(wp));
  near(wp.crossings[0].lat, 1, 0.01, 'wide: out');
  near(wp.crossings[1].lat, -2.27, 0.02, 'wide: back');
  // A block split into three boxes along the path: one object. (Its far
  // end, 1.6 m off, is passed a third time on the drift across, moving
  // sideways, on the first side.)
  const cells = [4.4, 4.8, 5.2].map((x0) => ({ x0, y0: 0.9, z0: 0, x1: x0 + 0.4, y1: 1.1, z1: 6 }));
  const split = sideRun(cells, cradlePhases(1), { x: -10, y: 0, z: 3 }).man[0].side;
  const sp = split.passes;
  assert.ok(sp.length >= 2 && sp.every((x) => x.obj === sp[0].obj), JSON.stringify(sp));
  assert.equal(split.objs[0].boxes, 3);
  assert.deepEqual(split.objs[0].box, [4.4, 0.9, 0, 5.6, 1.1, 6]);
  assert.ok(sp[0].lat1 > 0 && sp[0].vAlong > 0, 'out on the left');
  assert.ok(sp[sp.length - 1].lat1 < 0 && sp[sp.length - 1].vAlong < 0 && Math.abs(sp[sp.length - 1].d - 0.9) < 0.02, 'back on the right');
});

test('createTrickDebug: the overlay shows the side line, each pass by object and side', () => {
  const doc = fakeDoc();
  const con = { info: () => {}, warn: () => {} };
  let t = 0;
  const tricks = createTricks({ document: null, storage: null, now: () => t });
  tricks.setActive(true, 'depot');
  const dbg = createTrickDebug({ document: doc, tricks, now: () => t, info: () => ({ core: 'bf', map: 'depot' }), console: con });
  const ws = 3.5, b = pole(5, 1);
  const s = { armed: true, ws, throttle: 0.5, clearance: 3,
    colliders: [{ min: { x: -b.y1 * ws, y: b.z0 * ws, z: -b.x1 * ws }, max: { x: -b.y0 * ws, y: b.z1 * ws, z: -b.x0 * ws } }] };
  const p = { x: -10, y: 0, z: 3 };
  let q = { x: 0, y: 0, z: 0, w: 1 };
  const dt = 0.004;
  let first = true;
  for (const ph of cradlePhases(1)) {
    const w = ph.rate || [0, 0, 0], v = ph.v || [0, 0, 0];
    for (let i = 0, n = Math.round(ph.t / dt); i < n; i++) {
      const m = Math.hypot(...w);
      if (m) q = qMul(q, qAxis(w[0] / m, w[1] / m, w[2] / m, m * dt));
      p.x += v[0] * dt; p.y += v[1] * dt; p.z += v[2] * dt;
      Object.assign(s, { qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: w[0], oy: w[1], oz: w[2], wx: -p.y * ws, wy: p.z * ws, wz: -p.x * ws, alt: p.z, vx: v[0], vy: v[1], vz: v[2], speed: Math.hypot(...v) });
      if (first) { tricks.resetDetector(s); tricks.detector().lockout = 0; first = false; }
      t += dt;
      dbg.before(s, dt);
      const ev = tricks.tick(s, dt);
      dbg.after(s, dt, ev);
    }
  }
  const man = dbg.attempts().filter((r) => r.type === 'maneuver');
  assert.equal(man.length, 1);
  assert.equal(man[0].side.why, 'post');
  dbg.paint(true);
  const html = doc.getElementById('trickXrBody').innerHTML;
  assert.match(html, /side {2}nearest 0\.9 m/);
  assert.match(html, /passes #\d+ L 0\.9m -0\.\ds fwd nose 0° · #\d+ R 0\.9m \+1\.0s back nose 57°/);
  assert.match(html, /nose max 57°/);
});

function c3(x) { return Math.round(x * 1000) / 1000; }

// The Cradle (sim-tricks.js cradleStep): called at the second pass, logged
// by the observer as a record of type 'cradle' with its inputs; replaying
// those through a fresh gate (makeCradleGate on the record's posts) gives
// the same verdict.
function replayCradle(rec) {
  const g = makeCradleGate(rec.posts);
  const c = rec.inputs.cols, ix = (k) => c.indexOf(k);
  const I = ['t', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'fx', 'fy', 'fz', 'upZ', 'contact', 'yr'].map(ix);
  for (const row of rec.inputs.rows) {
    // As stepDetector: a reset before a fresh step; disarmed, no step.
    if (row[ix('fresh')]) cradleReset(g);
    const s = g.inp;
    [s.t, s.x, s.y, s.z, s.vx, s.vy, s.vz, s.fx, s.fy, s.fz, s.upZ, s.contact, s.yr] = I.map((k) => row[k]);
    if (!row[ix('armed')]) { cradleReset(g); continue; }
    cradleStep(g);
  }
  return g.out;
}

test('the Cradle, round a pole: called at the second pass; its record holds the inputs, and they replay to the same verdict', () => {
  for (const side of [1, -1]) {
    const r = sideRun([pole(5, side * 1.0), pole(9, side * 2.5)], cradlePhases(side), { x: -10, y: 0, z: 3 });
    assert.deepEqual(r.evs, ['cradle'], 'side ' + side);
    const cr = r.recs.filter((x) => x.type === 'cradle');
    assert.equal(cr.length, 1, JSON.stringify(cr.map((x) => x.reason)));
    const rec = cr[0], v = rec.gate;
    assert.equal(rec.result, 'cradle');
    assert.equal(rec.event, 'cradle');
    assert.equal(rec.closed, 0, 'the pull had settled before the second pass');
    near(v.lat1, side, 0.02, 'out'); near(v.lat2, -side, 0.02, 'back');
    near(v.pMax, 57, 2, 'nose'); near(v.elMax, 57, 2, 'nose up'); near(v.offNose, 180, 1, 'against the nose'); near(v.vBack, -5, 0.01, 'back at');
    assert.equal(v.yawDeg, 0); assert.equal(v.yawDev, 0);
    near(v.upZ, Math.cos(57 * Math.PI / 180), 0.03, 'up-Z');
    assert.match(rec.reason, /^Cradle round post \d+: out 1\.00 m, nose 57°, back 1\.00 m the other side at 5\.0 m\/s, 180° off the nose/);
    assert.deepEqual(rec.need, CRADLE);
    // The inputs from CRADLE_LOG.preS before the first pass to postS past the
    // verdict (refreshed then), every step; the posts near the path (the far
    // pole, 2.5 m out, too).
    const rows = rec.inputs.rows, t = rec.inputs.cols.indexOf('t');
    near(rows[0][t], v.t1 - CRADLE_LOG.preS, 0.005, 'from preS before');
    near(rows[rows.length - 1][t], v.t2 + CRADLE_LOG.postS, 0.005, 'to postS past the verdict');
    near(rec.inputs.to, v.t2 + CRADLE_LOG.postS, 0.005, 'to');
    assert.ok(rows.length >= (v.t2 - v.t1 + CRADLE_LOG.preS + CRADLE_LOG.postS) / 0.004 - 2, rows.length + ' rows');
    assert.equal(rec.posts.length, 2);
    // The replay: the same verdict, on the same step or the next (the rows
    // rounded to 0.1 mm can put the second pass a step on).
    const out = replayCradle(rec);
    const w = out.find((x) => x.result === 'cradle');
    assert.ok(w, 'the replay calls it: ' + JSON.stringify(out));
    assert.equal(w.obj, v.obj);
    near(w.t1, v.t1, 0.0045, 't1'); near(w.t2, v.t2, 0.0045, 't2');
    for (const [k, tol] of [['lat1', 0.03], ['lat2', 0.03], ['pMax', 1], ['elMax', 1], ['offNose', 1], ['vBack', 0.01], ['upZ', 0.01]]) near(w[k], v[k], tol, k);
  }
  // A segment still open at the second pass (the nose pitching back down at
  // 1 rad/s through it): it closes there as the Cradle.
  const live = sideRun([pole(5, 1)], [{ t: 3.4, v: [5, 0, 0] }, { t: 0.5, rate: [0, -2, 0], v: [1, 4, 0] }, { t: 1.3, rate: [0, 1, 0], v: [-5, 0, 0] }, { t: 2 }], { x: -10, y: 0, z: 3 });
  assert.deepEqual(live.evs, ['cradle']);
  const m = live.recs.find((x) => x.type === 'maneuver' && x.result === 'cradle');
  assert.ok(m, JSON.stringify(live.recs.map((x) => [x.type, x.result, x.reason])));
  assert.match(m.reason, /^closed at a Cradle's second pass/);
  const c = live.recs.find((x) => x.type === 'cradle');
  assert.equal(c.closed, 1);
  assert.equal(m.cradle, c.gate.seq, 'the maneuver names the Cradle that closed it');
  assert.equal(live.recs.indexOf(c), live.recs.indexOf(m) + 1, 'the cradle record right after the segment it closed');
});

test('the Cradle\'s posts: a pole, a column or a tree standing; a chair or table leg on the floor; never a wall, clutter or a hanging strand', () => {
  // The same flight at 0.3 m round each object (its centre 1 m out); the
  // leg's and the stub's tops under the over margin of the path.
  const at = (x0, y0, z0, x1, y1, z1) => ({ x0, y0, z0, x1, y1, z1 });
  const fly = (boxes, z = 0.3, phases = cradlePhases(1)) => sideRun(boxes, phases, { x: -10, y: 0, z });
  const called = (r) => r.evs.includes('cradle');
  const verdicts = (r) => r.recs.filter((x) => x.type === 'cradle');
  // A table leg (6 cm square, 0.36 m, the House's coffee table's) and a
  // chair's (0.39 m): legs.
  assert.ok(called(fly([at(4.97, 0.97, 0, 5.03, 1.03, 0.36)])), 'a 0.36 m table leg');
  assert.ok(called(fly([at(4.97, 0.97, 0, 5.03, 1.03, 0.39)])), 'a 0.39 m chair leg');
  // Under legH, a stub; not slender (a pot, 0.4 wide and 0.45 tall); off
  // the floor (a leg on a shelf): no post, no verdict.
  for (const [what, b] of [
    ['a 0.25 m stub', at(4.97, 0.97, 0, 5.03, 1.03, 0.25)],
    ['a pot', at(4.8, 0.8, 0, 5.2, 1.2, 0.45)],
    ['a leg on a shelf', at(4.97, 0.97, 0.2, 5.03, 1.03, 0.6)],
  ]) {
    const r = fly([b]);
    assert.ok(!called(r) && !verdicts(r).length, what + ': ' + r.evs.join(','));
  }
  // Tall: standing on the floor or on a box (a column on a deck); a strand
  // hanging (nothing under it) is no post. Flown at 1.5 m.
  assert.ok(called(fly([at(4.9, 0.9, 0, 5.1, 1.1, 3.05)], 1.5)), 'a column');
  assert.ok(called(fly([at(4.9, 0.9, 0.5, 5.1, 1.1, 3.5), at(4.5, 0.5, 0, 5.5, 1.5, 0.5)], 1.5)), 'a column on a deck');
  assert.ok(!called(fly([at(4.97, 0.97, 0.5, 5.03, 1.03, 3.5)], 1.5)), 'a hanging strand');
  // A wall beside the path (4 m long): no post.
  assert.ok(!called(fly([at(3, 0.9, 0, 7, 1.1, 6)], 1.5)), 'a wall');
  // Over a leg (2 m above its top): no first pass.
  const over = fly([at(4.97, 0.97, 0, 5.03, 1.03, 0.39)], 2.4);
  assert.ok(!called(over) && !verdicts(over).length, 'over a leg');
  // The nose over the top (a pull of 103 degrees): no Cradle, the verdict
  // says so.
  const top = fly([pole(5, 1)], 3, [{ t: 3.4, v: [5, 0, 0] }, { t: 0.9, rate: [0, -2, 0], v: [0.5, 2.2, 0] }, { t: 1.3, v: [-5, 0, 0] }, { t: 2 }]);
  assert.ok(!called(top));
  assert.equal(verdicts(top)[0].gate.why, 'over the top');
  // Back on the same side: the verdict says so.
  const same = fly([pole(5, 1)], 3, [{ t: 3.4, v: [5, 0, 0] }, { t: 0.5, rate: [0, -2, 0], v: [1, 0, 0] }, { t: 1.3, v: [-5, 0, 0] }, { t: 2 }]);
  assert.ok(!called(same));
  assert.equal(verdicts(same)[0].gate.why, 'same side');
  // Into the pole on the way back (its centre 0.05 m off the path).
  const into = fly([pole(5, 1)], 3, [{ t: 3.4, v: [5, 0, 0] }, { t: 0.5, rate: [0, -2, 0], v: [1, 2, 0] }, { t: 1.3, v: [-5, 0, 0] }, { t: 2 }]);
  assert.ok(!called(into));
  assert.equal(verdicts(into)[0].gate.why, 'hit the post');
});

test('createTrickDebug: the overlay\'s Cradle line, waiting, watching a first pass, then fired', () => {
  const doc = fakeDoc();
  let t = 0;
  const tricks = createTricks({ document: null, storage: null, now: () => t });
  tricks.setActive(true, 'depot');
  const dbg = createTrickDebug({ document: doc, tricks, now: () => t, info: () => ({ core: 'bf', map: 'depot' }), console: { info: () => {}, warn: () => {} } });
  const ws = 3.5, b = pole(5, 1);
  const s = { armed: true, ws, throttle: 0.5, clearance: 3,
    colliders: [{ min: { x: -b.y1 * ws, y: b.z0 * ws, z: -b.x1 * ws }, max: { x: -b.y0 * ws, y: b.z1 * ws, z: -b.x0 * ws } }] };
  const p = { x: -10, y: 0, z: 3 };
  let q = { x: 0, y: 0, z: 0, w: 1 };
  const dt = 0.004;
  let first = true;
  const html = () => { dbg.paint(true); return doc.getElementById('trickXrBody').innerHTML; };
  const seen = [];
  for (const ph of cradlePhases(1)) {
    const w = ph.rate || [0, 0, 0], v = ph.v || [0, 0, 0];
    for (let i = 0, n = Math.round(ph.t / dt); i < n; i++) {
      const m = Math.hypot(...w);
      if (m) q = qMul(q, qAxis(w[0] / m, w[1] / m, w[2] / m, m * dt));
      p.x += v[0] * dt; p.y += v[1] * dt; p.z += v[2] * dt;
      Object.assign(s, { qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: w[0], oy: w[1], oz: w[2], wx: -p.y * ws, wy: p.z * ws, wz: -p.x * ws, alt: p.z, vx: v[0], vy: v[1], vz: v[2], speed: Math.hypot(...v) });
      if (first) { tricks.resetDetector(s); tricks.detector().lockout = 0; first = false; }
      t += dt;
      dbg.before(s, dt);
      const ev = tricks.tick(s, dt);
      dbg.after(s, dt, ev);
      if (i === 10) seen.push(html());
    }
  }
  // Cruising in, on the pull (the first pass made), coming back (the nose
  // was up 57), then after the second pass.
  assert.match(seen[0], /Cradle {12}— {4}<\/span> <span class="d">1 posts here: pass one flying forward/);
  assert.match(seen[1], /<span class="near">first pass<\/span> post \d+ L 1\.00 m {2}nose \d+°\/25° /);
  assert.match(seen[2], /<span class="near">first pass<\/span> post \d+ L 1\.00 m {2}nose 57°\/25° ✓/);
  assert.match(seen[3], /✓ Cradle {12}— {4}<\/span> <span class="ok">fired<\/span> Cradle round post \d+: out 1\.00 m, nose 57°/);
  assert.ok(dbg.attempts().some((r) => r.type === 'cradle' && r.result === 'cradle'));
});

// A flight with its attitude set each step (az, el: the nose's heading and
// elevation, rad; w: the body rates the sample reports), its position and
// velocity given (sim-core m), at 4 ms, the page's mapping.
function attRun(boxes, frames) {
  const ws = 3.5, d = makeDetector(), evs = [];
  const cols = boxes.map((b) => ({ min: { x: -b.y1 * ws, y: b.z0 * ws, z: -b.x1 * ws }, max: { x: -b.y0 * ws, y: b.z1 * ws, z: -b.x0 * ws }, _tag: 'map' }));
  const s = { armed: true, colliders: cols, ws, throttle: 0.5, clearance: 2 };
  let first = true;
  for (const f of frames) {
    const q = qMul({ x: 0, y: 0, z: Math.sin(f.az / 2), w: Math.cos(f.az / 2) }, { x: 0, y: Math.sin(-f.el / 2), z: 0, w: Math.cos(-f.el / 2) });
    Object.assign(s, { qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: f.w[0], oy: f.w[1], oz: f.w[2], wx: -f.p[1] * ws, wy: f.p[2] * ws, wz: -f.p[0] * ws, alt: f.p[2], vx: f.v[0], vy: f.v[1], vz: 0, speed: Math.hypot(f.v[0], f.v[1]) });
    if (first) { resetDetector(d, s); d.lockout = 0; first = false; continue; }
    const ev = stepDetector(d, s, 0.004);
    if (ev) evs.push(ev);
  }
  return { evs, verdicts: d.cg.out.slice() };
}

test('the Cradle\'s edges: the nose up to 88 degrees; beside a leg, not over its table; a return run; a touch, a crash or a turn round voids it', () => {
  const DEG = Math.PI / 180;
  const at = (x0, y0, z0, x1, y1, z1) => ({ x0, y0, z0, x1, y1, z1 });
  const called = (r) => r.evs.includes('cradle');
  const verdicts = (r) => r.recs.filter((x) => x.type === 'cradle');
  // The nose held at 85 and 88 degrees through the second pass: no cap but
  // over the top (up-Z 0.09 and 0.03).
  for (const deg of [85, 88]) {
    const T = deg * DEG / 2;
    const r = sideRun([pole(5, 1)], [{ t: 3.4, v: [5, 0, 0] }, { t: T, rate: [0, -2, 0], v: [0.5, 2 / T, 0] }, { t: 1.3, v: [-5, 0, 0] }, { t: 2 }], { x: -10, y: 0, z: 3 });
    assert.ok(called(r), deg + ' deg: ' + JSON.stringify(verdicts(r).map((x) => x.reason)));
  }
  // Over a coffee table's leg (0.36 m), 0.13 m over its top: no pass. The
  // same flight under it, at 0.3 m: a Cradle (the posts test).
  const over = sideRun([at(4.97, 0.97, 0, 5.03, 1.03, 0.36)], cradlePhases(1), { x: -10, y: 0, z: 0.49 });
  assert.ok(!called(over) && !verdicts(over).length, 'over the table');
  // A return run: east past the pole, a turn round (its first pass void),
  // west past it flying forward, the nose up sliding across, back east
  // against the nose on its other side.
  const ret = sideRun([pole(5, 1)], [
    { t: 3.1, v: [5, 0, 0] }, { t: 0.8, rate: [0, 0, Math.PI / 0.8], v: [0, 3, 0] }, { t: 0.4, v: [-5, 0, 0] },
    { t: 0.5, rate: [0, -2, 0], v: [-1, -4, 0] }, { t: 1.3, v: [5, 0, 0] }, { t: 2 },
  ], { x: -10, y: 0, z: 3 });
  assert.deepEqual(ret.evs, ['cradle'], JSON.stringify(verdicts(ret).map((x) => x.reason)));
  // A skim of the post on the first pass (0.03 m off its surface): void.
  const skim = sideRun([at(4.985, 0.03, 0, 5.015, 0.09, 6)], cradlePhases(1), { x: -10, y: 0, z: 3 });
  assert.ok(!called(skim), 'a skim on the first pass');
  // A wall touched at the stop between the passes (0.05 m off): void.
  const wall = sideRun([pole(5, 1), at(7.55, 1.5, 0, 8.55, 2.5, 6)], cradlePhases(1), { x: -10, y: 0, z: 3 });
  assert.ok(!called(wall), 'a touch between the passes');
  const wv = verdicts(wall)[0];
  assert.equal(wv.gate.why, 'contact');
  // A miss's inputs run on to maxS past its first pass (what came after the
  // void), every missDt.
  const wr = wv.inputs.rows, wt = wv.inputs.cols.indexOf('t');
  assert.equal(wv.inputs.every, CRADLE_LOG.missDt);
  near(wr[wr.length - 1][wt], wv.gate.t1 + CRADLE.maxS + CRADLE_LOG.postS, 0.01, 'to maxS past the first pass');
  assert.ok(wr[1][wt] - wr[0][wt] >= CRADLE_LOG.missDt - 1e-6);
  // The steps left out: their turn on the next row kept. The nose up, a yaw
  // on the spot and no second pass; the rows' turn from the first pass to
  // the void is the gate's (each step's, not every other).
  const yaw = sideRun([pole(5, 1)], [{ t: 3.4, v: [5, 0, 0] }, { t: 0.5, rate: [0, -2, 0], v: [1, 4, 0] }, { t: 0.5, rate: [0, 0, 2] }, { t: 4 }], { x: -10, y: 0, z: 3 });
  const yv = verdicts(yaw)[0];
  assert.ok(yv && !yv.result && yv.gate.yawDeg >= 10, 'a miss with a turn: ' + JSON.stringify(verdicts(yaw).map((x) => x.reason + ' ' + x.gate.yawDeg)));
  const yc = yv.inputs.cols, yt = yc.indexOf('t'), yy = yc.indexOf('yr');
  assert.equal(yv.inputs.every, CRADLE_LOG.missDt);
  const turn = yv.inputs.rows.filter((w) => w[yt] > yv.gate.t1 + 1e-6 && w[yt] <= yv.gate.t2 + 1e-6).reduce((a, w) => a + w[yy], 0);
  near(Math.abs(turn) * 180 / Math.PI, yv.gate.yawDeg, 1, 'the rows\' turn');
  // A Trippy entered past the pole (the nose radial out, 30 degrees behind,
  // tilted back 55): the nose turns with the path, so it stays a Trippy.
  const R0 = Math.hypot(0.4, 1.2), th0 = Math.atan2(-1.2, 0.4), om = 4 / R0, frames = [];
  for (let x = -6; x < 5.4; x += 0.016) frames.push({ p: [x, 0, 1.6], v: [4, 0], az: 0, el: -5 * DEG, w: [0, 0, 0] });
  for (let tt = 0; tt < 1.6 * 2 * Math.PI / om; tt += 0.004) {
    const th = th0 + om * tt, k = Math.min(1, tt / 0.25), sm = k * k * (3 - 2 * k);
    frames.push({ p: [5 + R0 * Math.cos(th), 1.2 + R0 * Math.sin(th), 1.6], v: [-4 * Math.sin(th), 4 * Math.cos(th)], az: sm * (th - 30 * DEG), el: (-5 + sm * 60) * DEG, w: [0, 0, om] });
  }
  for (let i = 0; i < 400; i++) frames.push({ ...frames[frames.length - 1], v: [0, 0], w: [0, 0, 0], az: 0, el: 0 });
  const tr = attRun([{ x0: 4.95, y0: 1.15, z0: 0, x1: 5.05, y1: 1.25, z1: 6 }], frames);
  assert.deepEqual(tr.evs, ['trippy'], JSON.stringify(tr.verdicts));
  assert.equal(tr.verdicts[0].why, 'turned round');
});

// Slow orbits round the pole (kinematic: 3-4 m/s, 1.3 and 1.9 m out, the
// nose 35-65 up): the nose held on F1 past the pole, then turning with the
// path 15 or 30 behind the radial, both ways round. Mostly too slow for a
// Trippy (at 4 m/s 1.3 m out, one); by the second pass they have turned
// 63-80 about the vertical (with no cap, 24 of these 48 are Cradles, the
// rest back not against the nose or still turning), against the owner's
// Cradles' 11-40 (the attempt-log test). Never a Cradle: the cap voids all
// 48 turned round. Further behind they turn less (35-50: 43-60 at the
// pass) and most are Cradles: not pinned. Those 34-38 behind (55-60) are
// new with the cap: the old heading rule (55 off F1) voided them.
test('slow orbits round the pole, the nose up and turning with the path, are never Cradles: the cap on the turn about the vertical', () => {
  const DEG = Math.PI / 180;
  const orbit = (spd, rx, ry, lag, tilt, m) => {
    const R0 = Math.hypot(rx, ry), th0 = Math.atan2(-ry, rx), om = spd / R0, fr = [];
    for (let x = -6; x < 5 + rx; x += spd * 0.004) fr.push({ p: [x, 0, 1.6], v: [spd, 0], az: 0, el: -5 * DEG, w: [0, 0, 0] });
    for (let tt = 0; tt < 1.6 * 2 * Math.PI / om; tt += 0.004) {
      const th = th0 + om * tt, k = Math.min(1, tt / 0.25), sm = k * k * (3 - 2 * k), az = Math.max(0, th - lag * DEG);
      fr.push({ p: [5 + R0 * Math.cos(th), m * (ry + R0 * Math.sin(th)), 1.6], v: [-spd * Math.sin(th), m * spd * Math.cos(th)], az: m * az, el: (-5 + sm * tilt) * DEG, w: [0, 0, az > 0 ? m * om : 0] });
    }
    for (let i = 0; i < 400; i++) fr.push({ ...fr[fr.length - 1], v: [0, 0], w: [0, 0, 0], az: 0, el: 0 });
    return attRun([{ x0: 4.95, y0: m * ry - 0.05, z0: 0, x1: 5.05, y1: m * ry + 0.05, z1: 6 }], fr);
  };
  let n = 0;
  for (const spd of [3, 4]) for (const [rx, ry] of [[0.4, 1.2], [0.6, 1.8]]) for (const lag of [15, 30]) for (const tilt of [40, 55, 70]) for (const m of [1, -1]) {
    const r = orbit(spd, rx, ry, lag, tilt, m), tag = [spd, rx, ry, lag, tilt, m].join(' ');
    n++;
    assert.ok(!r.evs.includes('cradle'), tag + ': ' + JSON.stringify(r.verdicts));
    assert.ok(r.verdicts.length === 1 && r.verdicts[0].why === 'turned round', tag + ': ' + JSON.stringify(r.verdicts));
  }
  assert.equal(n, 48);
});

// Back past the post with the nose pitched down through the pass (to 85
// down, its heading on F1: going backwards, the nose ahead and down) is a
// Cradle: over 60 from level it is judged off F1, as the nose up is. Flown
// past a pole at 5 m/s, braked with the nose 55 up, drifting 1 m across.
test('the Cradle with the nose pitched down through the second pass, its heading on F1, is still a Cradle', () => {
  const DEG = Math.PI / 180;
  for (const E of [-30, -70, -85]) {
    const fr = [];
    let x = -6;
    for (; x < 5.0; x += 5 * 0.004) fr.push({ p: [x, 0, 2], v: [5, 0], az: 0, el: -5 * DEG, w: [0, 0, 0] });
    const x0 = x;
    for (let t = 0; t < 1.6; t += 0.004) {
      const xx = t < 1 ? x0 + 5 * t - 5 * t * t : x0 - 5 * (t - 1), k = Math.min(1, t / 0.6), kp = Math.min(1, t / 0.15), kd = Math.max(0, Math.min(1, (t - 0.7) / 0.2));
      const el = -5 + 60 * kp * kp * (3 - 2 * kp) + (E - 55) * kd;
      fr.push({ p: [xx, k * k * (3 - 2 * k), 2], v: [Math.max(-5, 5 - 10 * t), 6 * k * (1 - k) / 0.6], az: 0, el: el * DEG, w: [0, 0, 0] });
    }
    for (let i = 0; i < 300; i++) fr.push({ ...fr[fr.length - 1], v: [0, 0] });
    const r = attRun([{ x0: 4.95, y0: 0.45, z0: 0, x1: 5.05, y1: 0.55, z1: 6 }], fr);
    assert.ok(r.evs.includes('cradle'), E + ': ' + JSON.stringify(r.verdicts));
    assert.ok(r.verdicts[0].offNose >= 170, E + ': ' + JSON.stringify(r.verdicts[0]));
  }
});

test('the Cradle replaces a Maverick flown round a post, held from its end to the second pass; beside a block (no post) it is the Maverick', () => {
  const DEG = Math.PI / 180;
  const fly = (b) => sideRun([b], [
    { t: 0.1, rate: [0, 40 * DEG / 0.1, 0], v: [5, 0, 0] }, { t: 3.1, v: [5, 0, 0] },
    { t: 0.5, rate: [0, -125 * DEG / 0.5, 0], v: [1.5, 3, 3] }, { t: 0.35, rate: [0, 70 * DEG / 0.35, 0], v: [-3, 0, 0] },
    { t: 1.5, v: [-3, 0, 0] }, { t: 2 },
  ], { x: -10, y: 0, z: 3 });
  const r = fly({ x0: 4.9, y0: 0.5, z0: 0, x1: 5.1, y1: 0.7, z1: 6 });
  assert.deepEqual(r.evs, ['cradle']);
  const m = r.recs.find((x) => x.type === 'maneuver' && x.held);
  assert.ok(m && m.result === 'maverick', 'the Maverick, held: ' + JSON.stringify(r.recs.map((x) => [x.type, x.result, x.held])));
  const c = r.recs.find((x) => x.type === 'cradle' && x.result === 'cradle');
  assert.equal(c.replaced, 'maverick');
  const b = fly({ x0: 4.4, y0: 0.5, z0: 0, x1: 5.6, y1: 0.7, z1: 6 });
  assert.deepEqual(b.evs, ['maverick']);
});

test('the Cradle\'s log: a crash between the passes leaves its miss; a flip past six legs is one record', () => {
  // The crash: createTricks on the page's path, noteCrash after the pull.
  let t = 0;
  const tricks = createTricks({ document: null, storage: null, now: () => t });
  tricks.setActive(true, 'house');
  const recs = [];
  const obs = createTrickObserver(tricks.detector(), { now: () => t, onAttempt: (r) => recs.push(r) });
  const ws = 3.5, b = pole(5, 1);
  const s = { armed: true, ws, throttle: 0.5, clearance: 3, colliders: [{ min: { x: -b.y1 * ws, y: 0, z: -b.x1 * ws }, max: { x: -b.y0 * ws, y: b.z1 * ws, z: -b.x0 * ws } }] };
  const p = { x: -10, y: 0, z: 3 };
  let q = { x: 0, y: 0, z: 0, w: 1 }, first = true, evs = [];
  for (const [k, ph] of cradlePhases(1).entries()) {
    if (k === 2) tricks.noteCrash();
    const w = ph.rate || [0, 0, 0], v = ph.v || [0, 0, 0];
    for (let i = 0, n = Math.round(ph.t / 0.004); i < n; i++) {
      const m = Math.hypot(...w);
      if (m) q = qMul(q, qAxis(w[0] / m, w[1] / m, w[2] / m, m * 0.004));
      p.x += v[0] * 0.004; p.y += v[1] * 0.004; p.z += v[2] * 0.004;
      Object.assign(s, { qx: q.x, qy: q.y, qz: q.z, qw: q.w, ox: w[0], oy: w[1], oz: w[2], wx: -p.y * ws, wy: p.z * ws, wz: -p.x * ws, alt: p.z, vx: v[0], vy: v[1], vz: v[2], speed: Math.hypot(...v) });
      if (first) { tricks.resetDetector(s); tricks.detector().lockout = 0; first = false; }
      t += 0.004;
      obs.before(s, 0.004);
      const ev = tricks.step(s, 0.004);
      obs.after(s, 0.004, ev);
      if (ev) evs.push(ev);
    }
  }
  assert.ok(!evs.includes('cradle'), evs.join(','));
  const crash = recs.find((x) => x.type === 'cradle');
  assert.ok(crash && crash.result === null && crash.gate.why === 'crash', JSON.stringify(recs.map((x) => [x.type, x.reason])));
  // Six chair legs in a row 0.5 m to the side, flown past at 0.3 m, then a
  // back flip: every leg's miss in one record.
  const legs = [3, 3.5, 4, 4.5, 5, 5.5].map((x) => ({ x0: x - 0.03, y0: 0.47, z0: 0, x1: x + 0.03, y1: 0.53, z1: 0.4 }));
  const flip = sideRun(legs, [{ t: 3.4, v: [5, 0, 0] }, { t: 0.8, rate: [0, -8, 0], v: [2, 0, 0] }, { t: 2 }], { x: -10, y: 0, z: 0.3 });
  const cr = flip.recs.filter((x) => x.type === 'cradle');
  assert.equal(cr.length, 1, JSON.stringify(cr.map((x) => x.reason)));
  assert.ok(cr[0].others.length >= 2 && cr[0].gate.why === 'over the top', cr[0].reason);
});
