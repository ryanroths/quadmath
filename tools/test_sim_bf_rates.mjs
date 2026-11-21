// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Tune's Rates on the bf core, in Node (sim-rates.js BF_RATE_PRESETS and the
// set lines; sim.html sends them through importCliToBf):
//   - each preset's set lines, on each bf class's config (the 65's Air65
//     diff with its card's PIDs, the 75's Fractal75 diff), all taken by
//     Betaflight through the cli policy and read back as set;
//   - RyFly (stock) is the class diffs' own rates, and Betaflight's own
//     setpoint on each diff is the Actual curve they make (the conversion);
//     Beginner and Race are sim-feel.js RATE_PRESETS' whoopBeginner and
//     whoopRace, fitted;
//   - nothing saved, the default by input (a gamepad Beginner, a radio, the
//     keyboard and touch Cruise); the js core's saved rates carried once;
//   - saved per browser (and a storage that throws or holds junk);
//   - the Tune line and the OSD word;
//   - one way to Betaflight: the rate lines go only through importCliToBf;
//   - no board floor or held run reads rates.
// tools/test_sim_bf_rates_page.mjs flies them in headless Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { BF_CLASS_TUNES, bfClassDiff, createBfCore } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import {
  BF_RATE_PRESETS, BF_RATES_DEFAULT, BF_RATES_KEY, BF_RATE_KEYS, BF_RATE_SLIDERS, RATE_SLIDER_RANGES, BF_PRESET_ALIASES,
  BF_RATES_DEFAULT_BY_INPUT, bfRatesDefaultId, bfRatesDefaultToast, bfRatesFromJs, BF_RATES_SAVED_TOAST,
  bfPresetId, bfRatesPreset, bfRatesCli, bfRatesLines, bfRatesFromGet, bfRatesSame, bfRatesPresetOf, bfRatesActual,
  loadBfRates, saveBfRates, bfRatesOsd, ratesSourceText, rateSetpoint, pilotRatesDefault, decodeRates, encodeRates,
  bfFieldValue, BF_THR_KEYS, BF_THR_KEY, BF_THR_SLIDERS, BF_THR_DEFAULT, bfThr, bfThrFromSets, bfThrDefault, bfThrLines,
  bfThrSame, bfThrText, bfThrFieldValue, loadBfThrottle, saveBfThrottle, maxRateDps, SETPOINT_LIMIT,
} from '../sim-rates.js';
import { RATE_PRESETS } from '../sim-feel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
const AXES = ['roll', 'pitch', 'yaw'];

function card65() {
  const w = {};
  vm.runInNewContext(read('tune-database.js'), { window: w, document: { readyState: 'complete', getElementById: () => null } });
  return w.QuadMathTunes.tunes.find((t) => t.id === BF_CLASS_TUNES.whoop65);
}
// Each bf class's config as sim.html bfDiff builds it, on its airframe.
const CLASSES = {
  whoop65: { airframe: 'vendor/sim-core/airframes/air65.json', diff: () => bfClassDiff(read('vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), card65().pids) },
  whoop75: { airframe: 'vendor/sim-core/airframes/fractal75.json', diff: () => read('vendor/sim-core/configs/fractal75-ryfly-2026-11-03.txt') },
};
const core = (cls) => createBfCore({
  SimCore, wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
  airframe: JSON.parse(read(CLASSES[cls].airframe)), diff: CLASSES[cls].diff(), world: { floorZ: 0 },
});

test('the presets: Beginner, Cruise, Freestyle, Race, RyFly (stock), Actual, roll and pitch the same; Cruise the default', () => {
  assert.deepEqual(Object.keys(BF_RATE_PRESETS), ['beginner', 'cruise', 'freestyle', 'race', 'ryfly']);
  assert.deepEqual(Object.values(BF_RATE_PRESETS).map((p) => p.label), ['Beginner', 'Cruise', 'Freestyle', 'Race', 'RyFly (stock)']);
  assert.equal(BF_RATES_DEFAULT, 'cruise');
  const cli = (id) => bfRatesCli(bfRatesPreset(id));
  assert.deepEqual(Object.fromEntries(Object.keys(BF_RATE_PRESETS).map((id) => [id, AXES.map((a) => [cli(id)[a + '_rc_rate'] * 10, cli(id)[a + '_srate'] * 10, cli(id)[a + '_expo'] / 100])])), {
    beginner: [[50, 230, 0.46], [50, 230, 0.46], [60, 220, 0.49]],
    cruise: [[70, 450, 0.3], [70, 450, 0.3], [70, 400, 0.3]],
    freestyle: [[80, 850, 0.5], [80, 850, 0.5], [80, 700, 0.45]],
    race: [[150, 780, 0.67], [150, 780, 0.67], [150, 780, 0.67]],
    ryfly: [[20, 740, 0.56], [20, 740, 0.56], [20, 700, 0.56]],
  }, 'centre °/s, max °/s, expo per axis');
  for (const id of Object.keys(BF_RATE_PRESETS)) {
    const p = bfRatesPreset(id);
    assert.equal(p.type, 'ACTUAL', id);
    assert.deepEqual(p.pitch, p.roll, id + ': roll and pitch the same');
    assert.equal(bfRatesPresetOf(p), id);
    // Inside the sliders, so each shows on them; and a rates link of it decodes.
    for (const a of AXES) {
      for (const f of ['rcRate', 'srate', 'expo']) {
        const v = p[a][f] * BF_RATE_SLIDERS[f].scale, s = BF_RATE_SLIDERS[f];
        assert.ok(v >= s.min && v <= s.max && Math.abs(v / s.step - Math.round(v / s.step)) < 1e-9, `${id} ${a} ${f} ${v} on the slider`);
      }
    }
    assert.ok(bfRatesSame(decodeRates(encodeRates(p)), p), id + ': a rates link round trip');
    const a = bfRatesPreset(id);
    a.roll.srate = 1;
    assert.notEqual(bfRatesPreset(id).roll.srate, 1, 'a fresh copy each call');
  }
  // Slower to faster at full stick, roll: Beginner, Cruise, then the rest.
  const max = (id) => rateSetpoint('ACTUAL', 1, bfRatesPreset(id).roll);
  assert.ok(max('beginner') < max('cruise') && max('cruise') < max('ryfly') && max('cruise') < max('race') && max('cruise') < max('freestyle'));
  // The bf sliders sit inside the js core's Actual ranges, so their links decode there too.
  assert.ok(BF_RATE_SLIDERS.rcRate.min / 10 >= RATE_SLIDER_RANGES.ACTUAL.rcRate.min && BF_RATE_SLIDERS.rcRate.max / 10 <= RATE_SLIDER_RANGES.ACTUAL.rcRate.max);
  assert.ok(BF_RATE_SLIDERS.srate.min / 10 >= RATE_SLIDER_RANGES.ACTUAL.srate.min && BF_RATE_SLIDERS.srate.max / 10 <= RATE_SLIDER_RANGES.ACTUAL.srate.max);
});

test('RyFly (stock) is the class diffs\' own rates; Beginner and Race are the js presets\' whoopBeginner and whoopRace, fitted to Actual', async () => {
  const stock = pilotRatesDefault();
  assert.ok(bfRatesSame(bfRatesPreset('ryfly'), stock), 'the Air65 diff\'s rateprofile 0');
  for (const cls of Object.keys(CLASSES)) {
    const bf = await core(cls);
    assert.ok(bfRatesSame(bfRatesFromGet(bf.sim.get(BF_RATE_KEYS.slice())), bfRatesPreset('ryfly')), cls + ': its config alone flies RyFly (stock)');
  }
  // Fitted: the max within 10 °/s, the curve within 3 °/s rms over the stick.
  const xs = Array.from({ length: 21 }, (_, i) => i / 20);
  for (const [id, from] of [['beginner', 'whoopBeginner'], ['race', 'whoopRace']]) {
    const js = RATE_PRESETS[from], bf = bfRatesPreset(id);
    for (const a of AXES) {
      const err = Math.sqrt(xs.reduce((s, x) => s + (rateSetpoint('ACTUAL', x, bf[a]) - rateSetpoint(js.type, x, js[a])) ** 2, 0) / xs.length);
      assert.ok(Math.abs(rateSetpoint('ACTUAL', 1, bf[a]) - rateSetpoint(js.type, 1, js[a])) <= 10, `${id} ${a} max`);
      assert.ok(err < 3, `${id} ${a}: ${err.toFixed(2)} °/s rms from ${from}`);
    }
  }
  assert.equal(bfPresetId('whoopBeginner'), 'beginner');
  assert.equal(bfPresetId('whoopRace'), 'race');
  assert.equal(bfPresetId('ryanActual'), 'ryfly');
  assert.equal(bfPresetId('freestyle'), 'freestyle');
  assert.equal(bfPresetId('cruise'), 'cruise');
  assert.equal(bfPresetId('toString'), null);
  assert.equal(bfPresetId('nope'), null);
  for (const js of Object.keys(BF_PRESET_ALIASES)) assert.ok(RATE_PRESETS[js], js + ' is a js preset');
});

test('RyFly (stock): the diffs\' lines as Betaflight holds them, and its own setpoint is the Actual curve sim-rates.js makes of them', async () => {
  // Both diffs (Betaflight 4.5.0) set rateprofile 0 with no rates_type line:
  // 4.5's default, ACTUAL. Actual: rc_rate is the centre sensitivity / 10,
  // srate the max / 10, expo x 100 (fc/rc.c applyActualRates).
  for (const f of ['air65-ryfly-2026-10-23', 'fractal75-ryfly-2026-11-03']) {
    const text = read(`vendor/sim-core/configs/${f}.txt`);
    assert.match(text, /^# Betaflight \/ \S+ \(\S+\) 4\.5\.0 /m, f);
    assert.ok(!/rates_type/.test(text), f + ': no rates_type line');
    const lines = text.split('\n').filter((l) => /^set (roll|pitch|yaw)_(rc_rate|srate|expo) = /.test(l)).sort();
    assert.deepEqual(lines, ['set pitch_expo = 56', 'set pitch_rc_rate = 2', 'set pitch_srate = 74', 'set roll_expo = 56', 'set roll_rc_rate = 2', 'set roll_srate = 74', 'set yaw_expo = 56', 'set yaw_rc_rate = 2', 'set yaw_srate = 70'], f);
  }
  const stock = bfRatesPreset('ryfly');
  assert.deepEqual(AXES.map((a) => [stock[a].rcRate * 10, stock[a].srate * 10, stock[a].expo]), [[20, 740, 0.56], [20, 740, 0.56], [20, 700, 0.56]], 'centre °/s, max °/s, expo');
  for (const cls of Object.keys(CLASSES)) {
    const bf = await core(cls);
    const got = bf.sim.get(BF_RATE_KEYS.slice());
    assert.equal(got.rates_type, 'ACTUAL', cls);
    assert.ok(bfRatesSame(bfRatesFromGet(got), stock), cls + ': read back');
    // Betaflight's setpoint at 201 stick positions (sim-core rateCurve: no rate
    // formula in JS) against sim-rates.js's Actual curve of the read-back rates.
    // Yaw's sign is Betaflight's yaw convention; the size is the rate.
    for (let i = 0; i < 3; i++) {
      const curve = bf.sim.rateCurve(i, 201);
      const worst = Math.max(...curve.map((c) => Math.abs(Math.abs(c.rate) - Math.abs(rateSetpoint('ACTUAL', c.stick, stock[AXES[i]])))));
      assert.ok(worst < 0.01, `${cls} ${AXES[i]}: Betaflight's setpoint within ${worst.toFixed(4)} °/s of the Actual curve`);
      const full = curve[curve.length - 1].rate;
      assert.equal(Math.round(Math.abs(full)), stock[AXES[i]].srate * 10, cls + ' ' + AXES[i] + ' at full stick');
    }
  }
});

test('each preset\'s set lines go through the cli policy on each bf class and read back as set', async () => {
  for (const cls of Object.keys(CLASSES)) {
    const bf = await core(cls);
    const diff = CLASSES[cls].diff();
    const before = bf.sim.get(['thr_mid', 'thr_expo', 'p_roll', 'd_yaw', 'roll_rate_limit']);
    const from = diff.split('\n').length + 1;
    for (const id of Object.keys(BF_RATE_PRESETS)) {
      const lines = bfRatesLines(bfRatesPreset(id));
      assert.equal(lines.split('\n').length, 10, 'rates_type and nine settings');
      assert.ok(lines.startsWith('set rates_type = ACTUAL\nset roll_rc_rate = '), lines);
      const r = bf.loadDiff(diff + '\n' + lines);
      const mine = r.lines.filter((l) => l.n >= from);
      assert.equal(mine.length, 10);
      for (const l of mine) assert.equal(l.status, 'applied', `${cls} ${id}: ${JSON.stringify(l)}`);
      const got = bf.sim.get(BF_RATE_KEYS.slice());
      assert.deepEqual(got, Object.fromEntries(Object.entries(bfRatesCli(bfRatesPreset(id))).map(([k, v]) => [k, String(v)])), `${cls} ${id} read back`);
      assert.equal(bfRatesPresetOf(bfRatesFromGet(got)), id);
      assert.deepEqual(bf.sim.get(['thr_mid', 'thr_expo', 'p_roll', 'd_yaw', 'roll_rate_limit']), before, cls + ': nothing but the rates changes');
    }
    // A slider's rates (not a preset) the same way.
    const own = { type: 'ACTUAL', roll: { rcRate: 9, srate: 61, expo: 0.12 }, pitch: { rcRate: 10, srate: 62, expo: 0.13 }, yaw: { rcRate: 11, srate: 63, expo: 0.14 } };
    bf.loadDiff(diff + '\n' + bfRatesLines(own));
    assert.ok(bfRatesSame(bfRatesFromGet(bf.sim.get(BF_RATE_KEYS.slice())), own), cls + ': a slider\'s rates');
    assert.equal(bfRatesPresetOf(own), '');
  }
});

// A pilot flying yaw 300 / 800 / 0 could not get past 250 centre.
const YAW300 = { type: 'ACTUAL', roll: { rcRate: 7, srate: 45, expo: 0.3 }, pitch: { rcRate: 7, srate: 45, expo: 0.3 }, yaw: { rcRate: 30, srate: 80, expo: 0 } };

test('the sliders reach Betaflight\'s own Actual limits: centre 10-2000, max 0-2000 °/s, expo 0-1; yaw 300/800/0 survives a link, a save and a slider move', () => {
  assert.deepEqual([BF_RATE_SLIDERS.rcRate.min, BF_RATE_SLIDERS.rcRate.max, BF_RATE_SLIDERS.rcRate.step], [10, 2000, 10]);
  assert.deepEqual([BF_RATE_SLIDERS.srate.min, BF_RATE_SLIDERS.srate.max, BF_RATE_SLIDERS.srate.step], [0, 2000, 10]);
  assert.deepEqual([BF_RATE_SLIDERS.expo.min, BF_RATE_SLIDERS.expo.max], [0, 1]);
  // The markup's ranges and number boxes are those (and so are the js core's Actual ranges).
  const html = read('sim.html');
  for (const a of AXES) {
    for (const f of ['rcRate', 'srate', 'expo']) {
      const s = BF_RATE_SLIDERS[f];
      for (const id of [`bfs_${a}_${f}`, `bfn_${a}_${f}`]) {
        const tag = html.slice(html.indexOf(`id="${id}"`), html.indexOf('>', html.indexOf(`id="${id}"`)));
        assert.match(tag, new RegExp(`min="${s.min}" max="${s.max}" step="${s.step}"`), id);
      }
    }
  }
  assert.deepEqual([RATE_SLIDER_RANGES.ACTUAL.rcRate.min, RATE_SLIDER_RANGES.ACTUAL.rcRate.max, RATE_SLIDER_RANGES.ACTUAL.srate.min, RATE_SLIDER_RANGES.ACTUAL.srate.max], [1, 200, 0, 200]);
  // The pilot's yaw: a link, the sliders (no clamp back to 250), a save and reload.
  assert.ok(bfRatesSame(decodeRates(encodeRates(YAW300)), YAW300), 'a rates link round trip');
  const act = bfRatesActual(YAW300);
  assert.deepEqual([act.yaw.rcRate, act.yaw.srate, act.yaw.expo], [30, 80, 0], 'shown as set, not clamped');
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.ok(saveBfRates({ rates: YAW300, link: true }, st));
  assert.ok(bfRatesSame(loadBfRates(st).rates, YAW300), 'reloaded as saved');
  // Moving another slider starts from what shows, so yaw stays 300.
  const moved = bfRatesActual(YAW300); moved.roll.rcRate = 8;
  assert.equal(moved.yaw.rcRate, 30);
  // The top: 2000 °/s, which flies Betaflight's 1998 setpoint cap.
  const top = { type: 'ACTUAL', roll: { rcRate: 200, srate: 200, expo: 0 }, pitch: { rcRate: 200, srate: 200, expo: 0 }, yaw: { rcRate: 200, srate: 200, expo: 0 } };
  assert.ok(bfRatesSame(decodeRates(encodeRates(top)), top));
  assert.equal(maxRateDps('ACTUAL', top.roll), SETPOINT_LIMIT);
  assert.equal(SETPOINT_LIMIT, 1998);
  assert.equal(decodeRates('ACTUAL.201.74.56.2.74.56.2.70.56').error, 'rates token out of range', 'over Betaflight\'s 200: refused');
  // A typed number: rounded to the step, held inside the range.
  assert.equal(bfFieldValue('rcRate', 300), 300);
  assert.equal(bfFieldValue('rcRate', 304), 300);
  assert.equal(bfFieldValue('rcRate', 306), 310);
  assert.equal(bfFieldValue('rcRate', 5), 10);
  assert.equal(bfFieldValue('rcRate', 99999), 2000);
  assert.equal(bfFieldValue('srate', -40), 0);
  assert.equal(bfFieldValue('expo', 0.567), 0.57);
  assert.equal(bfFieldValue('expo', 3), 1);
  for (const junk of ['', 'abc', null, undefined, NaN]) assert.equal(bfFieldValue('rcRate', junk), null, String(junk));
});

test('Betaflight takes the new limits: yaw 300/800/0 and 200 (2000 °/s) read back as set; 201 is put back to 200 at boot, so it is refused', async () => {
  for (const cls of Object.keys(CLASSES)) {
    const bf = await core(cls);
    const diff = CLASSES[cls].diff();
    const from = diff.split('\n').length + 1;
    bf.loadDiff(diff + '\n' + bfRatesLines(YAW300));
    assert.ok(bfRatesSame(bfRatesFromGet(bf.sim.get(BF_RATE_KEYS.slice())), YAW300), cls + ': yaw 300/800/0 read back');
    const r200 = bf.loadDiff(diff + '\nset rates_type = ACTUAL\nset yaw_rc_rate = 200\nset yaw_srate = 200');
    assert.ok(r200.lines.filter((l) => l.n >= from).every((l) => l.status === 'applied'), cls + ': 200 taken');
    assert.deepEqual([bf.sim.get(['yaw_rc_rate']).yaw_rc_rate, bf.sim.get(['yaw_srate']).yaw_srate], ['200', '200']);
    const r201 = bf.loadDiff(diff + '\nset rates_type = ACTUAL\nset yaw_rc_rate = 201');
    const l201 = r201.lines.find((l) => l.n === from + 1);
    assert.equal(l201.status, 'rejected', cls + ': 201 ' + JSON.stringify(l201));
    assert.match(l201.msg, /changed yaw_rc_rate to '200'/);
  }
});

test('throttle mid and expo: the class config\'s own (Fractal75 65/35, the Air65 Betaflight\'s 50/0), set lines read back, thr_mid stops at 99', async () => {
  assert.deepEqual(BF_THR_KEYS, ['thr_mid', 'thr_expo']);
  assert.deepEqual(BF_THR_DEFAULT, { mid: 50, expo: 0 });
  assert.deepEqual([BF_THR_SLIDERS.mid.min, BF_THR_SLIDERS.mid.max, BF_THR_SLIDERS.expo.min, BF_THR_SLIDERS.expo.max], [0, 99, 0, 100]);
  // The slider and its box in the markup: CLI integers on the slider, 0.00-1.00 in the box.
  const html = read('sim.html');
  for (const [id, re] of [['bfs_thr_mid', /min="0" max="99" step="1"/], ['bfs_thr_expo', /min="0" max="100" step="1"/], ['bfn_thr_mid', /min="0" max="0.99" step="0.01"/], ['bfn_thr_expo', /min="0" max="1" step="0.01"/]]) {
    const at = html.indexOf(`id="${id}"`);
    assert.ok(at > html.indexOf('<div class="rates-bf" id="bfRates">') && at < html.indexOf('<div class="rates-js">'), id + ' in the bf rates block');
    assert.match(html.slice(at, html.indexOf('>', at)), re, id);
  }
  assert.deepEqual(bfThrDefault({ thr_mid: '65', thr_expo: '35' }), { mid: 65, expo: 35 });
  assert.deepEqual(bfThrDefault({}), { mid: 50, expo: 0 });
  assert.equal(bfThrLines({ mid: 40, expo: 20 }), 'set thr_mid = 40\nset thr_expo = 20');
  assert.equal(bfThrLines({ mid: 100, expo: 0 }), null, 'thr_mid 100 never goes');
  assert.equal(bfThr(40.5, 0), null);
  assert.ok(bfThrSame(bfThrFromSets({ thr_mid: '40', thr_expo: '20' }), { mid: 40, expo: 20 }));
  assert.equal(bfThrText(65), '0.65');
  assert.equal(bfThrFieldValue('mid', '0.65'), 65);
  assert.equal(bfThrFieldValue('mid', 1), 99, 'a typed 1.00 stops at 0.99');
  assert.equal(bfThrFieldValue('expo', 1), 100);
  assert.equal(bfThrFieldValue('expo', ''), null);
  // Per class, saved in this browser; junk is dropped.
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.deepEqual(loadBfThrottle(st), {});
  assert.ok(saveBfThrottle({ whoop75: { mid: 60, expo: 30 }, bogus: { mid: 1, expo: 1 } }, st));
  assert.deepEqual(JSON.parse(mem.get(BF_THR_KEY)), { v: 1, classes: { whoop75: [60, 30] } });
  assert.deepEqual(loadBfThrottle(st), { whoop75: { mid: 60, expo: 30 } });
  mem.set(BF_THR_KEY, '{"v":1,"classes":{"whoop65":[100,0],"whoop75":"x"}}');
  assert.deepEqual(loadBfThrottle(st), {}, 'out of range or junk: none');
  // Betaflight: each class's own, then Tune's lines beside the rates, read back.
  const own = { whoop65: { mid: 50, expo: 0 }, whoop75: { mid: 65, expo: 35 } };
  for (const cls of Object.keys(CLASSES)) {
    const bf = await core(cls);
    const diff = CLASSES[cls].diff();
    assert.deepEqual(bfThrFromSets(bf.sim.get([...BF_RATE_KEYS, ...BF_THR_KEYS])), own[cls], cls + ': its config\'s own');
    assert.deepEqual(bfThrDefault(Object.fromEntries([...diff.matchAll(/^set (\w+) = (\S+)/gm)].map((m) => [m[1], m[2]]))), own[cls], cls + ': read from its diff as the page does');
    const lines = bfRatesLines(bfRatesPreset('cruise')) + '\n' + bfThrLines({ mid: 40, expo: 20 });
    const from = diff.split('\n').length + 1;
    const r = bf.loadDiff(diff + '\n' + lines);
    assert.equal(r.lines.filter((l) => l.n >= from && l.status === 'applied').length, 12, cls + ': ten rate lines and two throttle');
    const got = bf.sim.get([...BF_RATE_KEYS, ...BF_THR_KEYS]);
    assert.deepEqual(bfThrFromSets(got), { mid: 40, expo: 20 }, cls);
    assert.ok(bfRatesSame(bfRatesFromGet(got), bfRatesPreset('cruise')), cls + ': the rates as set');
    // Why the slider stops at 99: at 100 Betaflight's throttle lookup divides
    // by zero, and the wasm traps (the page restores what flew before).
    assert.throws(() => bf.loadDiff(diff + '\nset thr_mid = 100'), /divide by zero/, cls + ': thr_mid 100');
  }
});

test('rates as set lines, read back, as Actual for the sliders', () => {
  const st = { type: 'BETAFLIGHT', roll: { rcRate: 1, srate: 0.7, expo: 0 }, pitch: { rcRate: 1, srate: 0.7, expo: 0 }, yaw: { rcRate: 1.1, srate: 0.72, expo: 0.25 } };
  assert.equal(bfRatesLines(st), [
    'set rates_type = BETAFLIGHT',
    'set roll_rc_rate = 100', 'set roll_srate = 70', 'set roll_expo = 0',
    'set pitch_rc_rate = 100', 'set pitch_srate = 70', 'set pitch_expo = 0',
    'set yaw_rc_rate = 110', 'set yaw_srate = 72', 'set yaw_expo = 25',
  ].join('\n'), 'another rate type flies as itself');
  const back = bfRatesFromGet({ rates_type: 'BETAFLIGHT', roll_rc_rate: '100', roll_srate: '70', roll_expo: '0', pitch_rc_rate: '100', pitch_srate: '70', pitch_expo: '0', yaw_rc_rate: '110', yaw_srate: '72', yaw_expo: '25' });
  assert.ok(bfRatesSame(back, st));
  const act = bfRatesActual(back);
  assert.equal(act.exact, false);
  assert.deepEqual(act.roll, { rcRate: 20, srate: 67, expo: 0 }, 'the centre and the max kept, as Actual');
  assert.equal(bfRatesActual(bfRatesPreset('cruise')).exact, true);
  assert.equal(bfRatesFromGet({ rates_type: 'ACTUAL', roll_rc_rate: '7' }), null, 'a missing setting');
  assert.equal(bfRatesFromGet({ rates_type: 'NOPE' }), null);
  assert.equal(bfRatesLines(null), null);
  assert.equal(bfRatesSame(null, bfRatesPreset('cruise')), false);
});

test('nothing saved: the default by input, and the toast says which', () => {
  assert.deepEqual({ ...BF_RATES_DEFAULT_BY_INPUT }, { gamepad: 'beginner', radio: 'cruise', keyboard: 'cruise', touch: 'cruise' });
  assert.equal(bfRatesDefaultId('nope'), BF_RATES_DEFAULT);
  assert.equal(bfRatesDefaultId('toString'), BF_RATES_DEFAULT);
  assert.equal(bfRatesDefaultToast('keyboard'), 'RATES: CRUISE — change in Tune', 'the keyboard as before');
  assert.equal(bfRatesDefaultToast('touch'), 'RATES: CRUISE — change in Tune', 'touch as before');
  assert.equal(bfRatesDefaultToast('radio'), 'RATES: CRUISE (RADIO) — change in Tune');
  assert.equal(bfRatesDefaultToast('gamepad'), 'RATES: BEGINNER (GAMEPAD) — change in Tune');
  assert.equal(BF_RATES_SAVED_TOAST, 'RATES: YOUR SAVED RATES');
});

test('the js core\'s saved rates for the bf core: as they are, only when they differ from the js default', () => {
  const def = pilotRatesDefault();
  assert.equal(bfRatesFromJs(def, def), null, 'the js default: not carried');
  assert.equal(bfRatesFromJs({ quickRatesRcExpo: false, ...def }, def), null, 'as sim.html holds it');
  assert.equal(bfRatesFromJs(def), null, 'the default is pilotRatesDefault');
  const race = { type: 'BETAFLIGHT', roll: { ...RATE_PRESETS.whoopRace.roll }, pitch: { ...RATE_PRESETS.whoopRace.pitch }, yaw: { ...RATE_PRESETS.whoopRace.yaw } };
  const got = bfRatesFromJs(race, def);
  assert.ok(bfRatesSame(got, race), 'another rate type, as it is');
  assert.equal(got.type, 'BETAFLIGHT');
  const own = { type: 'ACTUAL', roll: { rcRate: 4, srate: 74, expo: 0.56 }, pitch: { rcRate: 4, srate: 74, expo: 0.56 }, yaw: { rcRate: 4, srate: 70, expo: 0.56 } };
  assert.ok(bfRatesSame(bfRatesFromJs(own, def), own), 'one field off the default');
  assert.equal(bfRatesPresetOf(bfRatesFromJs(own, def)), '', 'Custom');
  assert.equal(bfRatesFromJs({ type: 'ACTUAL', roll: { rcRate: 0, srate: 74, expo: 0.5 }, pitch: own.pitch, yaw: own.yaw }, def), null, 'out of range');
  assert.equal(bfRatesFromJs(null, def), null);
  assert.equal(bfRatesFromJs({ type: 'NOPE', roll: {}, pitch: {}, yaw: {} }, def), null);
});

test('saved per browser: a round trip, nothing saved, junk, and a storage that throws', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  const st = mem();
  assert.equal(loadBfRates(st), null, 'nothing saved');
  const race = bfRatesPreset('race');
  assert.equal(saveBfRates({ rates: race, link: true }, st), true);
  assert.deepEqual(JSON.parse(st.m.get(BF_RATES_KEY)), { v: 1, preset: 'race', link: true, type: 'ACTUAL', roll: [15, 78, 67], pitch: [15, 78, 67], yaw: [15, 78, 67] });
  const back = loadBfRates(st);
  assert.equal(back.preset, 'race');
  assert.equal(back.link, true);
  assert.equal(back.js, false);
  saveBfRates({ rates: race, link: true, js: true }, st);
  assert.equal(JSON.parse(st.m.get(BF_RATES_KEY)).js, true);
  assert.equal(loadBfRates(st).js, true, 'carried from the js core');
  assert.ok(bfRatesSame(back.rates, race));
  const own = { type: 'ACTUAL', roll: { rcRate: 9, srate: 61, expo: 0.12 }, pitch: { rcRate: 10, srate: 62, expo: 0.13 }, yaw: { rcRate: 11, srate: 63, expo: 0.14 } };
  saveBfRates({ rates: own, link: false }, st);
  assert.deepEqual([loadBfRates(st).preset, loadBfRates(st).link], ['', false]);
  for (const junk of ['{', 'null', '{"v":2}', '{"v":1,"type":"ACTUAL","roll":[0,74,56],"pitch":[2,74,56],"yaw":[2,70,56]}', '{"v":1,"type":"NOPE","roll":[2,74,56]}']) {
    st.setItem(BF_RATES_KEY, junk);
    assert.equal(loadBfRates(st), null, junk);
  }
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadBfRates(broken), null);
  assert.equal(saveBfRates({ rates: race }, broken), false);
});

test('the Tune line and the OSD say which rates fly', () => {
  const bf = (b, cli) => ratesSourceText({ core: 'bf', bf: b, cli });
  assert.equal(bf({ from: 'default', preset: 'cruise' }), 'Rates: Cruise, the default (bf)');
  assert.equal(bf({ from: 'default', input: 'keyboard' }), 'Rates: Cruise, the default (bf)');
  assert.equal(bf({ from: 'default', input: 'touch' }), 'Rates: Cruise, the default (bf)');
  assert.equal(bf({ from: 'default', input: 'radio' }), 'Rates: Cruise, the default for a radio (bf)');
  assert.equal(bf({ from: 'default', input: 'gamepad' }), 'Rates: Beginner, the default for a gamepad (bf)');
  assert.equal(bf({ from: 'saved', preset: '', js: true }), 'Rates: your own, from the js core (bf, saved in this browser)');
  assert.equal(bf({ from: 'saved', preset: 'race' }), 'Rates: Race (bf, saved in this browser)');
  assert.equal(bf({ from: 'saved', preset: 'ryfly' }), 'Rates: RyFly (stock) (bf, saved in this browser)');
  assert.equal(bf({ from: 'saved', preset: '' }), 'Rates: your own (bf, saved in this browser)');
  assert.equal(bf({ from: 'link', preset: 'race' }), 'Rates: Race, the rates link (bf, this session)');
  assert.equal(bf({ from: 'link', preset: '' }), 'Rates: the rates link (bf, this session)');
  assert.equal(bf({ from: 'saved', preset: 'race' }, 'top'), 'Rates: Race (bf, saved in this browser), your CLI lines on top');
  assert.equal(bf({ from: 'saved', preset: 'race' }, 'replace'), 'Rates: Race (bf, saved in this browser), on your pasted diff');
  assert.equal(bf({ paste: true }, 'top'), 'Rates: your pasted CLI lines (bf, this session)');
  assert.equal(bf({ paste: true }, 'replace'), 'Rates: your pasted diff (bf, this session)');
  assert.equal(bfRatesOsd({ from: 'default', preset: 'cruise' }), 'CRUISE');
  assert.equal(bfRatesOsd({ from: 'saved', preset: 'ryfly' }), 'RYFLY');
  assert.equal(bfRatesOsd({ from: 'saved', preset: '' }), 'CUSTOM');
  assert.equal(bfRatesOsd({ from: 'link', preset: '' }), 'LINK');
  assert.equal(bfRatesOsd({ from: 'saved', preset: 'race', paste: true }), 'CLI');
  const html = read('sim.html');
  assert.ok(html.includes("(cs.kind==='bf'?`TUNE ${bfOf().cliText?'CLI IMPORT':bfTuneId()} · RATES ${bfRatesOsdText}<br>`:"), 'the OSD\'s TUNE line');
  assert.ok(html.includes(`<p class="build-note rates-bf" id="ratesSourceBf">${bf({ from: 'default', preset: 'cruise' })}</p>`));
});

// sim.html is one inline module; its rates path is checked in its source.
function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() not found in sim.html`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`${name}() has unbalanced braces`);
}

test('sim.html: one way to Betaflight for rates, importCliToBf; applied on boot, a class change and a link; the js core\'s rates UI kept', () => {
  const html = read('sim.html').replace(/\r\n/g, '\n');
  // The rate lines are made in two places, and both go to importCliToBf;
  // Tune's throttle lines (the class's own, once the pilot set them) beside
  // them, a part of their own under or over a paste (thrLast).
  assert.equal(html.split('bfRatesLines(').length - 1, 2, 'bfRatesText and bfSetTune');
  assert.ok(extract(html, 'bfRatesText').includes('return bfRatesLines(bfRatesWant());'));
  assert.ok(extract(html, 'bfThrLinesWant').includes('const t=bfThrWant(type);return t?bfThrLines(t):null;'));
  assert.ok(extract(html, 'bfSetTune').includes('importCliToBf(bfRatesLines(nextRates),{rates:true,thr:nextThr?bfThrLines(nextThr):null,ratesLast:save.rates?true:undefined,thrLast:save.thr?true:undefined,quiet:true})'));
  const compose = extract(html, 'bfCompose');
  assert.ok(compose.includes("if(ratesText)(paste&&!ratesLast?under:over).push(['rates',ratesText]);"));
  assert.ok(compose.includes("if(thrText)(paste&&!thrLast?under:over).push(['thr',thrText]);"));
  assert.ok(compose.includes('if(!full)parts.push(...under);'), 'a full diff stands in for the parts under it');
  assert.ok(extract(html, 'bfSetRates').includes('return bfSetTune(next,bfThrWant(),{rates:true}).rates;'));
  assert.ok(extract(html, 'bfSetThrottle').includes('return bfSetTune(bfRatesWant(),next,{thr:true}).thr;'));
  // Armed, a change is kept and goes in at the landing, never dropped.
  for (const fn of ['bfSetRates', 'bfSetThrottle']) assert.ok(extract(html, fn).includes('if(coreArmed()){bfPend('), fn + ' keeps an armed change');
  // ... once the quad is down and upright (a load respawns it where it is).
  assert.ok(extract(html, 'bfRatesWatch').includes('if(bfPendingHere()){if(!cs.airborne&&bodyUpZ(cs.quaternion)>0.5)bfApplyPending();return;}'));
  // A change made disarmed while kept ones still wait goes in after them, in order.
  for (const fn of ['bfSetRates', 'bfSetThrottle']) assert.ok(extract(html, fn).includes('const after=bfPendAfter(op);\n  if(after!=null)return after;'), fn + ' after the kept changes');
  assert.ok(extract(html, 'bfApplyPending').includes('thr=now[i].edit(thr||bfThrShown());'), 'a kept throttle change is made again on what flies');
  assert.ok(extract(html, 'bfApplyRates').includes('const r=importCliToBf(bfRatesText(),{rates:true,quiet:true});'));
  // Betaflight is configured only through bfLoadDiff (and the core's own boot).
  assert.equal(html.split('core.loadDiff(').length - 1, 1, 'bfLoadDiff only');
  assert.ok(extract(html, 'bfLoadDiff').includes('const r=core.loadDiff(text);'));
  assert.ok(!/\.sim\.edit\(|bfCore\.loadDiff\(|\.configure\(/.test(html), 'no other configure');
  // bfWantDiff (what selectCore and the watch compare against) is the same composition.
  assert.ok(extract(html, 'bfWantDiff').includes('bfCompose(b.cliText,bfRatesText(),b.ratesLast,bfThrLinesWant(),b.thrLast).text'));
  const imp = extract(html, 'importCliToBf');
  assert.ok(imp.includes('const want=rates?bfCompose(b.cliText,text,ratesLast,thrText,thrLast):bfCompose(text,bfRatesText(),false,thrText,false);'));
  assert.ok(imp.includes("const own=rates?['rates','thr'].filter(k=>want.at[k]):['paste'];") && imp.indexOf('if(!own.length){') < imp.indexOf('r=bfLoadDiff('), 'nothing of Tune\'s left to load: no reboot');
  assert.ok(imp.includes("r=bfLoadDiff(want.text,rates?(o.label||'rates'):'CLI import',{quiet:!!o.quiet});"));
  // Read back and checked against what the lines set, when they are the last word.
  assert.ok(imp.includes('const back=bfReadRates(b);') && imp.includes('if(want.at.rates&&last&&!bfRatesSame(back,asked)){'));
  assert.ok(extract(html, 'bfReadRates').includes('bfCore.sim.get([...BF_RATE_KEYS,...BF_THR_KEYS])'));
  assert.ok(imp.includes('if((!b.cliText||thrLast)&&thrAsked&&!bfThrSame(b.thrBack,thrAsked)){'), 'Tune\'s throttle read back too');
  // Applied on the core's takeover, on a class change, and disarmed whenever it holds something else.
  const select = html.slice(html.indexOf('function selectCore'), html.indexOf('// ---------- Input poll'));
  assert.equal(select.split('bfApplyRates();').length - 1, 2, 'a loaded core taking over, and a new one');
  assert.ok(select.indexOf("bfApplyRates();\n      // The last toast of the takeover") > 0, 'the takeover\'s toast comes last, after the rates');
  assert.ok(select.includes("toast(jsArmed?BF_TOOK_OVER_TOAST:bfArmHeld===type?'BETAFLIGHT READY — ARM AGAIN':'BETAFLIGHT CORE — '+c.quad.toUpperCase());"));
  assert.ok(extract(html, 'bfWorldWatch').includes('bfInputWatch();\n  if(coreArmed())return;\n  bfRatesWatch();'));
  // Nothing saved: the default by input; said each time it is another, after any other toast.
  assert.ok(extract(html, 'bfRatesWant').includes('bfRatesPreset(bfRatesDefaultId(bfInputKind()))'));
  assert.ok(extract(html, 'bfInputKind').includes("gpConnected?(padIsRadio({id:gpName})?'radio':'gamepad'):(touchCtl&&touchCtl.enabled?'touch':'keyboard')"));
  const note = extract(html, 'bfRatesNote');
  assert.ok(note.includes('if(said===what)return;') && note.includes('localStorage.setItem(BF_RATES_TOAST_KEY,what)'));
  assert.ok(note.includes("if(toastEl.style.opacity==='1'){bfRatesToastTimer=setTimeout(say,700);return;}"), 'it waits for no other toast');
  assert.ok(note.includes("toast(what==='js'?BF_RATES_SAVED_TOAST:bfRatesDefaultToast(bfInputKind()),{ms:4000});"));
  assert.ok(extract(html, 'bfApplyRates').split('bfRatesNote();').length - 1 === 2);
  // The js core's saved rates, carried once.
  assert.ok(html.includes("if(!localStorage.getItem(BF_RATES_FROM_JS_KEY)){\n    const st=!bfRatesSaved&&ratesAreCustom?bfRatesFromJs(rates,pilotRatesDefault()):null;"));
  assert.ok(html.includes("localStorage.setItem(BF_RATES_FROM_JS_KEY,'1');"));
  // Links: on bf too; the old toast is gone.
  assert.ok(!html.includes('JS CORE ONLY'));
  const boot = extract(html, 'applyQueryBoot');
  assert.ok(boot.includes('if(presetRaw&&bfPresetId(presetRaw)&&!ratesRaw)bfRatesFromLink(bfRatesPreset(presetRaw));'));
  assert.ok(boot.includes('bfRatesFromLink({type:decoded.type,'));
  // The js core's rates UI is as it was: its own sliders, type and presets.
  const js = html.slice(html.indexOf('<div class="rates-js">'), html.indexOf('<h2>Paste Betaflight CLI dump</h2>'));
  for (const id of ['ratesType', 'ax_roll', 's_rc', 's_sr', 's_ex', 'rateCurve']) assert.ok(js.includes(`id="${id}"`), id);
  assert.ok(html.includes('<select id="ratePreset" class="rates-js"></select>'));
  const bfUi = html.slice(html.indexOf('<div class="rates-bf" id="bfRates">'), html.indexOf('<div class="rates-js">'));
  for (const a of AXES) for (const f of ['rcRate', 'srate', 'expo']) assert.ok(bfUi.includes(`id="bfs_${a}_${f}" data-axis="${a}" data-field="${f}"`), a + ' ' + f);
  assert.ok(bfUi.includes('id="bfRatePreset"') && bfUi.includes('id="cbBfRatesLink" checked'));
});

test('no board floor, held run or PHYS_VER reads rates', () => {
  const ret = read('sim-retention.js');
  assert.ok(!/sim-rates|rc_rate|srate|rateSetpoint/.test(ret), 'sim-retention.js (the boards\' and the Worker\'s rules) knows no rates');
  assert.match(ret, /export const PHYS_VER = 7;/);
  assert.match(read('sim-whoop.js'), /PHYSICS_VER\s*=\s*7\b/);
  const floor = ret.slice(ret.indexOf('export function builtinFloorMs'), ret.indexOf('export async function builtinTrackHash'));
  assert.ok(floor.includes('CLASS_MAX_SPEED[classId(frameMm)]') && !/rate/i.test(floor), 'a floor is the gate path at the class speed cap');
});
