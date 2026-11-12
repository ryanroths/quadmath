// The post chain's MSAA targets: a sample count that changes rebuilds the
// target (sim-looks.js syncTargetSamples). three builds a target's
// framebuffers on its first bind, for the samples it has then; #337's boot
// precompile bound the composer's targets at 0 samples, HIGH then set 4 at the
// same size, and every composer.render() threw on a real GPU. GitHub's
// runners have no GPU, and the look turns MSAA off on software WebGL, so the
// map-boot tours cannot reach that path in CI (QM_BOOT_GPU=1 runs them on
// this machine's GPU); this pins the rule itself.
// Node stdlib only: `node --test tools/test_sim_looks_samples.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`export async function resolve(spec, ctx, next) {
  if (spec.startsWith('three/addons/')) return { url: 'data:text/javascript,export default null;', shortCircuit: true };
  return next(spec, ctx);
}`));

const { syncTargetSamples } = await import('../sim-looks.js');

function target(samples) {
  return { samples, disposed: 0, dispose() { this.disposed++; } };
}

test('a target whose sample count changes is disposed, so three builds it again for the new count', () => {
  for (const [from, to] of [[0, 4], [0, 2], [2, 4], [4, 0]]) {
    const rt = target(from);
    assert.equal(syncTargetSamples(rt, to), true, `${from} -> ${to}`);
    assert.equal(rt.samples, to);
    assert.equal(rt.disposed, 1, `${from} -> ${to} disposed once`);
  }
});

test('the same count leaves the target alone (no rebuild every resize)', () => {
  for (const n of [0, 2, 4]) {
    const rt = target(n);
    assert.equal(syncTargetSamples(rt, n), false);
    assert.equal(rt.disposed, 0);
  }
});

test('no target, or one that cannot be disposed yet, is not an error', () => {
  assert.equal(syncTargetSamples(null, 4), false);
  const rt = { samples: 0, dispose() { throw new Error('not built'); } };
  assert.equal(syncTargetSamples(rt, 4), true);
  assert.equal(rt.samples, 4);
});
