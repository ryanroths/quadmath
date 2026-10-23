// Looks asset loads: overlapping setQuality calls fetch each HDRI and PBR
// texture once, and the raw equirect is disposed after PMREM.
// Node stdlib only: `node --test tools/test_sim_looks_load.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Map three/addons/* to stubs; the HDR loader returns a fake equirect.
const hdrStub = `export class HDRLoader { async loadAsync() {
  const t = { disposed: 0, dispose() { this.disposed++; } };
  globalThis.__hdrTex.push(t); return t; } }`;
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec.startsWith('three/addons/loaders/')) return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(hdrStub)}), shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: 'data:text/javascript,export default null;', shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));

globalThis.__hdrTex = [];
const fetches = [];
globalThis.fetch = async (url) => { fetches.push(String(url)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
URL.createObjectURL = () => 'blob:x';
URL.revokeObjectURL = () => {};

const texLoads = [];
class Stub { constructor() { this.texture = {}; } }
const THREE = {
  EquirectangularReflectionMapping: 303, RepeatWrapping: 1000, SRGBColorSpace: 'srgb',
  PMREMGenerator: class { fromEquirectangular() { return { texture: { pmrem: true } }; } dispose() {} },
  TextureLoader: class { load(url, ok) { texLoads.push(url); setTimeout(() => ok({ image: {}, repeat: { set() {} } }), 1); } },
  Color: class { setHex() {} }, CanvasTexture: Stub, DepthTexture: Stub,
};
const shadow = { mapSize: { x: 0, set(n) { this.x = n; } }, map: null };
const ctx = {
  THREE,
  renderer: { capabilities: { getMaxAnisotropy: () => 8 }, getContext: () => null, setPixelRatio() {} },
  scene: { traverse() {}, fog: { density: 0, color: { setHex() {}, getHex: () => 0 } } },
  camera: {}, LIGHTING: { fogColor: 0 }, sun: { shadow }, sunFill: null, hemi: null,
};

test('concurrent setQuality fetches each HDRI and texture once; raw equirect disposed', async () => {
  const { createLooks } = await import('../sim-looks.js');
  const looks = await createLooks(ctx);
  await Promise.all([looks.setQuality('high'), looks.setQuality('high'), looks.setQuality('high'), looks.setQuality('med')]);
  await Promise.all([looks.setQuality('med'), looks.setQuality('high')]);
  const count = (list) => list.reduce((m, u) => (m[u] = (m[u] || 0) + 1, m), {});
  const hdr = count(fetches);
  assert.ok(Object.keys(hdr).some((u) => u.endsWith('_1k.hdr')), JSON.stringify(hdr));
  for (const [u, n] of Object.entries(hdr)) assert.equal(n, 1, u + ' fetched ' + n + 'x');
  const tex = count(texLoads);
  assert.equal(Object.keys(tex).length, 12, JSON.stringify(tex));
  for (const [u, n] of Object.entries(tex)) assert.equal(n, 1, u + ' loaded ' + n + 'x');
  assert.equal(globalThis.__hdrTex.length, Object.keys(hdr).length);
  for (const t of globalThis.__hdrTex) assert.equal(t.disposed, 1);
  assert.ok(ctx.scene.environment && ctx.scene.environment.pmrem);
});
