// Unit tests for W1 Your-build mapping (sim-build.js).
// Node stdlib only: `node --test tools/test_sim_build.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BUILD_KEY, BUILD_PREFIX, BUILD_PRESETS, CLASS_REF, DEFAULT_BUILD,
  normalizeBuild, encodeBuild, decodeBuild, physicsFromBuild, batteryFromBuild,
  loadBuild, saveBuild, buildDeepLink, matchPresetId, classDefault,
} from '../sim-build.js';
import { PRESETS } from '../quadphysics.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const buildSrc = readFileSync(join(root, 'sim-build.js'), 'utf8');

test('new storage key only; never writes old ryfly* keys', () => {
  assert.equal(BUILD_KEY, 'quadmathSimBuild');
  assert.ok(buildSrc.includes('setItem(BUILD_KEY'));
  assert.equal(buildSrc.includes("ryflyDroneType"), false, 'must not write ryflyDroneType');
  assert.equal(buildSrc.includes("ryflyRates"), false);
  assert.ok(buildSrc.includes('Nothing here is copied from WebFPV'));
});

test('default 65mm build matches whoop65 preset TWR (~6.0)', () => {
  const p = physicsFromBuild(DEFAULT_BUILD);
  const ref = PRESETS.whoop65;
  assert.equal(p.preset.wheelbase, ref.wheelbase);
  assert.equal(p.preset.mass, ref.mass);
  assert.ok(Math.abs(p.preset.maxThrustPerMotor - ref.maxThrustPerMotor) < 0.02,
    `thrust ${p.preset.maxThrustPerMotor} vs preset ${ref.maxThrustPerMotor}`);
  assert.ok(p.twr > 5.7 && p.twr < 6.3, `TWR ${p.twr}`);
});

test('65mm 1S high-KV is punchier than class default; 2S 85mm stays flyable', () => {
  const a = physicsFromBuild(BUILD_PRESETS.air65);
  const d = physicsFromBuild(DEFAULT_BUILD);
  assert.ok(a.twr > d.twr, `air65 TWR ${a.twr} vs default ${d.twr}`);
  const w85 = physicsFromBuild(BUILD_PRESETS.whoop85_2s);
  assert.equal(w85.preset.wheelbase, 0.085);
  assert.ok(w85.twr > 2.4 && w85.twr < 7.5, `85mm 2S TWR ${w85.twr}`);
  const w75_2s = physicsFromBuild(BUILD_PRESETS.whoop75_2s);
  assert.equal(w75_2s.build.cells, 2);
  assert.ok(w75_2s.twr > 2.4 && w75_2s.twr < 8.5, `75mm 2S TWR ${w75_2s.twr}`);
});

test('heavier AUW lowers TWR; more blades raise thrust', () => {
  const light = physicsFromBuild({ ...DEFAULT_BUILD, auwG: 22 });
  const heavy = physicsFromBuild({ ...DEFAULT_BUILD, auwG: 32 });
  assert.ok(light.twr > heavy.twr);
  const tri = physicsFromBuild({ ...DEFAULT_BUILD, blades: 3 });
  const bi = physicsFromBuild({ ...DEFAULT_BUILD, blades: 2 });
  assert.ok(tri.preset.maxThrustPerMotor > bi.preset.maxThrustPerMotor);
});

test('battery 2S scales pack voltage; smaller mAh sags more / dies faster', () => {
  const s1 = batteryFromBuild({ ...DEFAULT_BUILD, cells: 1, mah: 300 });
  const s2 = batteryFromBuild({ ...DEFAULT_BUILD, cells: 2, mah: 300 });
  assert.equal(s1.full, 4.2);
  assert.equal(s2.full, 8.4);
  assert.ok(s2.crit > s1.crit);
  const small = batteryFromBuild({ ...DEFAULT_BUILD, mah: 200 });
  const big = batteryFromBuild({ ...DEFAULT_BUILD, mah: 480 });
  assert.ok(small.hoverS < big.hoverS);
  assert.ok(small.sagDrop > big.sagDrop);
});

test('share codes round-trip; named presets encode as QB1.<id>', () => {
  assert.equal(encodeBuild(DEFAULT_BUILD), BUILD_PREFIX + 'whoop65');
  assert.equal(encodeBuild(BUILD_PRESETS.air65), BUILD_PREFIX + 'air65');
  const custom = normalizeBuild({ frameMm: 75, kv: 21000, propMm: 40, blades: 3, cells: 1, mah: 450, auwG: 33 });
  const code = encodeBuild(custom);
  assert.ok(code.startsWith(BUILD_PREFIX));
  assert.deepEqual(decodeBuild(code), custom);
  assert.deepEqual(decodeBuild(code.slice(BUILD_PREFIX.length)), custom);
  assert.equal(decodeBuild('nope'), null);
  assert.equal(matchPresetId(BUILD_PRESETS.mobula6), 'mobula6');
});

test('load/save uses only BUILD_KEY', () => {
  const mem = new Map();
  const store = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  saveBuild(BUILD_PRESETS.air65, store);
  assert.equal([...mem.keys()].join(','), BUILD_KEY);
  const loaded = loadBuild(store);
  assert.equal(loaded.kv, 30000);
  assert.equal(loaded.auwG, 25.4);
  saveBuild(null, store);
  assert.equal(loadBuild(store), null);
});

test('deep link carries build, track, mode', () => {
  const url = buildDeepLink({
    origin: 'https://quadmath.com',
    build: BUILD_PRESETS.air65,
    track: 'living-sofa',
    mode: 'angle',
  });
  assert.ok(url.includes('/sim.html?'));
  assert.ok(url.includes('build=QB1.air65'));
  assert.ok(url.includes('track=living-sofa'));
  assert.ok(url.includes('mode=angle'));
  assert.equal(url.includes('3d='), false, 'existing links must not gain 3d=');
  const url3 = buildDeepLink({
    origin: 'https://quadmath.com',
    build: BUILD_PRESETS.air65,
    mode: 'acro',
    threeD: true,
  });
  assert.ok(url3.includes('3d=1'));
  assert.ok(url3.includes('mode=acro'));
  assert.equal(url.includes('dev='), false, 'no dev=1 unless asked');
  const dev = buildDeepLink({ origin: 'https://quadmath.com', build: BUILD_PRESETS.air65, track: 'living-sofa', dev: true });
  assert.equal(new URL(dev).searchParams.get('dev'), '1');
});

test('classDefault maps 65/75/85', () => {
  assert.equal(classDefault(65).frameMm, 65);
  assert.equal(classDefault(75).cells, 1);
  assert.equal(classDefault(85).cells, 2);
  assert.ok(CLASS_REF[65].kv >= 19000 && CLASS_REF[65].kv <= 25000);
});

test('sim.html wires the picker and URL params without touching old keys as writers for build', () => {
  assert.ok(src.includes('sim-build.js'), 'must import sim-build.js');
  assert.ok(src.includes('id="menuBuild"') || src.includes("menuBuild"), 'start-menu Your build');
  assert.ok(src.includes('Your build'), 'Tune/start copy');
  assert.ok(src.includes('q.get(\'build\')') || src.includes('q.get("build")') || src.includes("q.get('build')"));
  assert.ok(src.includes('cliPaste') && src.includes('btnCliImport'), 'CLI paste still present');
  assert.ok(src.includes('btnRatesShare') && src.includes('COPY RATES LINK'), 'Tune rates share');
  for (const k of ['ryflyRates', 'ryflyDroneType', 'quadmath_bestLap_', 'ghostStorageKey(']) {
    assert.ok(src.includes(k), `must keep reading old key ${k}`);
  }
  assert.ok(src.includes(BUILD_KEY) || src.includes('BUILD_KEY'));
  const bootStart = src.indexOf('function applyQueryBoot');
  const boot = src.slice(bootStart, src.indexOf('fetchBuiltinTracks().then', bootStart));
  assert.ok(boot.indexOf("q.get('track')") < boot.indexOf("q.get('build')"), 'track before build so the share box is not stuck on track=0');
  assert.ok(boot.includes('syncBuildUI()'));
  assert.ok(src.includes('shareTrackParam()'));
  assert.ok(boot.includes("applyBuild(decoded,{save:false,announce:true})"), '?build= must not overwrite saved build');
});
