// Unit tests for the Actual Rates curve in sim.html.
//
// Node stdlib only: `node --test tools/` or `node tools/test_actual_rates.mjs`.
//
// The function is not imported, it is EXTRACTED from sim.html and evaluated.
// sim.html is a single self-contained page with one inline module, so there is
// nothing to import; copying the formula into this file would let the test and
// the shipped curve drift apart silently, which is the one thing a rate-curve
// test exists to prevent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { actualRate, pilotRatesDefault } from '../sim-rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'sim.html'), 'utf8');

function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() not found in sim.html`);
  // brace-match from the first { after the signature
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  assert.notEqual(end, -1, `${name}() has unbalanced braces`);
  return src.slice(start, end);
}

const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);

test('full stick lands exactly on maxRate', () => {
  assert.equal(actualRate(1, 75, 650, 0.5), 650);
  assert.equal(actualRate(1, 80, 550, 0.4), 550);
  assert.equal(actualRate(1, 70, 580, 0), 580);
});

test('full stick is symmetric', () => {
  assert.equal(actualRate(-1, 75, 650, 0.5), -650);
});

test('centre stick is zero', () => {
  assert.equal(actualRate(0, 75, 650, 0.5), 0);
});

test('small deflection is the centre term plus a small expo term', () => {
  // 0.1 * 75 = 7.5 linear, plus 575 * 0.0050005 = 2.875... of expo
  const v = actualRate(0.1, 75, 650, 0.5);
  near(v, 10.375287500000001, 1e-9);
  assert.ok(v > 7.5, 'must exceed the bare centre term');
  assert.ok(v < 65, 'must stay well under a linear-to-max reading');
});

test('expo 0 is linear in the centre term plus flat stick movement', () => {
  // blend collapses to absX * x, so 0.5 stick = 0.5*center + movement*0.25
  near(actualRate(0.5, 75, 650, 0), 0.5 * 75 + 575 * 0.25, 1e-12);
});

test('expo only redistributes travel, never changes the endpoints', () => {
  for (const expo of [0, 0.25, 0.5, 0.75, 1]) {
    assert.equal(actualRate(1, 75, 650, expo), 650);
    assert.equal(actualRate(0, 75, 650, expo), 0);
  }
});

test('higher expo means a softer centre', () => {
  const soft = actualRate(0.3, 75, 650, 0.8);
  const hard = actualRate(0.3, 75, 650, 0.0);
  assert.ok(soft < hard, `expected ${soft} < ${hard}`);
});

test('curve is monotonic across the stick', () => {
  let prev = -Infinity;
  for (let x = -1; x <= 1.0000001; x += 0.01) {
    const v = actualRate(x, 75, 650, 0.5);
    assert.ok(v >= prev, `not monotonic at x=${x.toFixed(2)}`);
    prev = v;
  }
});

test('maxRate below center clamps stick movement to zero', () => {
  // guards the Math.max(0, ...): a nonsense profile must not invert the curve
  assert.equal(actualRate(1, 650, 75, 0.5), 650);
  assert.ok(actualRate(0.5, 650, 75, 0.5) > 0);
});

test('the default Actual profile in sim.html is the Air65 diff\'s, with no per-class fallback', () => {
  // Rates are the pilot's: one profile for every class, so the old per-class
  // seeding (and its whoop fallback) is gone; the default is the owner's
  // Air65 diff's rateprofile 0 (tools/test_sim_pilot_rates.mjs holds it to
  // the diff and to Betaflight).
  assert.equal(src.indexOf('const RATE_FALLBACK='), -1, 'no per-class fallback profile');
  assert.ok(src.includes('const rates=Object.assign({quickRatesRcExpo:false},pilotRatesDefault());'));
  const p = pilotRatesDefault();
  assert.equal(p.type, 'ACTUAL');
  // state stores centre/10 and max/10: centre 20 deg/s, max 740/740/700.
  assert.deepEqual(p.roll, { rcRate: 2, srate: 74, expo: 0.56 });
  assert.deepEqual(p.pitch, { rcRate: 2, srate: 74, expo: 0.56 });
  assert.deepEqual(p.yaw, { rcRate: 2, srate: 70, expo: 0.56 });
  assert.equal(actualRate(1, p.roll.rcRate * 10, p.roll.srate * 10, p.roll.expo), 740);
  assert.equal(actualRate(1, p.yaw.rcRate * 10, p.yaw.srate * 10, p.yaw.expo), 700);
});

// Regression guard for the Actual slider ranges. The markup ranges are
// Betaflight-scaled (rc 0.5-2.5, srate 0-0.95) but ACTUAL stores centre and
// max as deg/s over 10, so rcRate 7 / srate 58 sat far outside them: the thumbs
// clamped and one nudge wrote the clamped Betaflight number straight into the
// Actual profile, collapsing a 70 deg/s centre to 25.
function sliderRanges() {
  const body = extract('applyRateSliderRanges');
  const elseAt = body.indexOf('}else{');
  assert.notEqual(elseAt, -1, 'applyRateSliderRanges has no else branch');
  const num = (chunk, key) => {
    const at = chunk.indexOf(key);
    assert.notEqual(at, -1, key + ' not found');
    const from = chunk.indexOf(String.fromCharCode(39), at) + 1;
    return Number(chunk.slice(from, chunk.indexOf(String.fromCharCode(39), from)));
  };
  const grab = (chunk) => ({
    rc: [num(chunk, 'rc.min'), num(chunk, 'rc.max')],
    sr: [num(chunk, 'sr.min'), num(chunk, 'sr.max')],
  });
  return { actual: grab(body.slice(0, elseAt)), betaflight: grab(body.slice(elseAt)) };
}

test('Actual slider ranges cover every profile the sim can load', () => {
  const { actual } = sliderRanges();
  // state stores centre/10 and max/10, so these are the slider-scale values
  const needRc = [7, 7.5, 8, 5];        // 70/75/80 deg/s centres, and the 85mm card's 50
  const needSr = [65, 58, 55, 50, 74];  // 650/580/550/500/740 deg/s maxima
  for (const v of needRc)
    assert.ok(v >= actual.rc[0] && v <= actual.rc[1],
      'centre ' + v * 10 + ' deg/s outside slider range ' + actual.rc);
  for (const v of needSr)
    assert.ok(v >= actual.sr[0] && v <= actual.sr[1],
      'max ' + v * 10 + ' deg/s outside slider range ' + actual.sr);
});

test('Betaflight branch restores the ranges the markup declares', () => {
  const { betaflight } = sliderRanges();
  const attr = (id, name) => {
    const at = src.indexOf('id=' + String.fromCharCode(34) + id + String.fromCharCode(34));
    assert.notEqual(at, -1, id + ' not in markup');
    const tag = src.slice(at, src.indexOf('>', at));
    const k = tag.indexOf(name + '=' + String.fromCharCode(34)) + name.length + 2;
    return Number(tag.slice(k, tag.indexOf(String.fromCharCode(34), k)));
  };
  assert.deepEqual(betaflight.rc, [attr('s_rc', 'min'), attr('s_rc', 'max')]);
  assert.deepEqual(betaflight.sr, [attr('s_sr', 'min'), attr('s_sr', 'max')]);
});
