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

const actualRate = new Function(`${extract('actualRate')}; return actualRate;`)();

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

test('whoop fallback profile in sim.html matches the documented defaults', () => {
  // Regex LITERALS only, and no newline splitting: a RegExp built from a
  // string needs doubled backslashes, which is a good way to ship a test that
  // silently matches nothing. Each axis entry ends at its own closing brace.
  const from = src.indexOf('const RATE_FALLBACK=');
  assert.notEqual(from, -1, 'RATE_FALLBACK not found in sim.html');
  const block = src.slice(from, src.indexOf(';', src.indexOf('yaw', from)));
  const grab = (axis) => {
    const at = block.indexOf(axis + ':');
    assert.notEqual(at, -1, `RATE_FALLBACK.${axis} not found`);
    const entry = block.slice(at, block.indexOf('}', at) + 1);
    const n = entry.replace(/[^0-9.]+/g, ' ').trim().split(/ +/).map(Number);
    return { center: n[0], max: n[1], expo: n[2] };
  };
  assert.deepEqual(grab('roll'), { center: 75, max: 650, expo: 0.5 });
  assert.deepEqual(grab('pitch'), { center: 75, max: 650, expo: 0.5 });
  assert.deepEqual(grab('yaw'), { center: 80, max: 550, expo: 0.4 });
});
