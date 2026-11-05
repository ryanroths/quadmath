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
  GAP_SIDE_K, GAP_MIN_DEPTH_M, GAP_NEAR_M, FRAME_W_M,
} from '../sim-tricks.js';
import {
  GATES, CLASS_IDS, SPEC, OVERRIDES, DIVE, DIVE_FALLBACK, GAP, SEG, FOCUS,
  explainFeat, createTrickObserver, createTrickDebug, gateText,
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
  f.barP = r() < 0.5 ? near(5.236) : u(0, 4); f.barR = u(1.5, 4.5); f.upEnd = r() < 0.6 ? u(0.5, 1) : u(-1, 1);
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

test('observer: gaps are records: an authored pass fires, a skim and wide walls do not, narrow walls fire generically', () => {
  // Fly scene -z (module +x) from scene z 1.75.
  const vol = [{ name: 'test slot', axis: 'z', min: { x: -0.6, y: 0, z: -20 }, max: { x: 0.6, y: 20, z: 0 } }];
  const through = run([{ t: 0.1 }, { t: 1.8, v: [5, 0, 0] }], { gaps: vol, pos: { x: -0.5, y: 0, z: 3 } });
  assert.deepEqual(through.evs, ['gap']);
  const g = through.recs.filter((r) => r.type === 'gap');
  assert.equal(g.length, 1);
  assert.equal(g[0].result, 'gap');
  assert.equal(g[0].how, 'authored');
  assert.match(g[0].reason, /test slot/);
  // Across the same volume through its sides (scene +x, module -y): a skim.
  const across = run([{ t: 0.1 }, { t: 1.0, v: [0, -3, 0] }], { gaps: vol, pos: { x: 3, y: 1.0, z: 3 } });
  assert.deepEqual(across.evs, []);
  const sk = across.recs.filter((r) => r.type === 'gap');
  assert.equal(sk.length, 1);
  assert.equal(sk[0].result, null);
  assert.match(sk[0].reason, /skimmed/);
  // Walls 0.3 m apart (0.15 m each side): the generic rule fires.
  const narrow = [
    { min: { x: 0.525, y: 0, z: -20 }, max: { x: 3, y: 20, z: 0 } },
    { min: { x: -3, y: 0, z: -20 }, max: { x: -0.525, y: 20, z: 0 } },
  ];
  const gen = run([{ t: 0.1 }, { t: 1.8, v: [5, 0, 0] }], { colliders: narrow, pos: { x: -0.5, y: 0, z: 3 } });
  assert.deepEqual(gen.evs, ['gap']);
  const gg = gen.recs.filter((r) => r.type === 'gap' && r.result);
  assert.equal(gg[0].how, 'generic');
  // Walls 1.1 m apart (the old rule's gap): each side too far for a 9 cm quad.
  const wide = [
    { min: { x: 2, y: 0, z: -20 }, max: { x: 3, y: 20, z: 0 } },
    { min: { x: -3, y: 0, z: -20 }, max: { x: -2, y: 20, z: 0 } },
  ];
  const w = run([{ t: 0.1 }, { t: 1.8, v: [5, 0, 0] }], { colliders: wide, pos: { x: -0.5, y: 0, z: 3 } });
  assert.deepEqual(w.evs, []);
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

test('createTrickDebug: overlay lists the ten candidates and the console gets one JSON line per attempt', () => {
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
    const name = { flip: 'Flip', roll: 'Roll', powerloop: 'Powerloop', splits: 'Split-S', matty: 'Matty Flip', trippy: 'Trippy Spin', juicyflick: 'Juicy Flick', ham: 'Inverted yaw spin', barani: 'Barani', dive: 'Dive', gap: 'Gap' }[id];
    assert.ok(el.innerHTML.includes(name), 'overlay lists ' + name);
  }
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
