// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Rates are the pilot's, not the quad's: one rates profile for every class.
//   - The js core's default is the owner's Air65 diff's rateprofile 0
//     (sim-rates.js pilotRatesDefault), the rates the bf core flies.
//   - The 65's bf config (sim-core-adapter.js bfClassDiff) is that diff with
//     only the class tune's P, I and D on top: read back from Betaflight, that
//     holds the diff's rates and the tune's PIDs, as each class card would.
//   - The 75's bf config is the owner's Fractal75 diff as it is: the Air65
//     diff's stick rates, and its own throttle curve and PIDs.
//   - A class switch (sim.html applyDroneType) never touches the rates.
//   - The Tune panel names where the rates come from.
// tools/test_sim_rates_page.mjs flies the same in headless Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { BF_CLASS_TUNES, bfClassDiff, createBfCore } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import { parseCli, pilotRatesDefault, ratesSourceText, PILOT_RATES_CARD } from '../sim-rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
const OWNER_DIFF = read('vendor/sim-core/configs/air65-ryfly-2026-10-23.txt');
const AXES = ['roll', 'pitch', 'yaw'];

// The tune database is a classic script; read its cards the way sim.html does.
function cards() {
  const w = {};
  vm.runInNewContext(read('tune-database.js'), { window: w, document: { readyState: 'complete', getElementById: () => null } });
  return w.QuadMathTunes.tunes;
}

const bfCore = (diff) => createBfCore({
  SimCore,
  wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
  airframe: JSON.parse(read('vendor/sim-core/airframes/air65.json')),
  diff,
  world: { floorZ: 0 },
});

// Betaflight's rate profile: the type, each axis's curve and limit, the
// throttle curve.
const RATE_KEYS = ['rates_type', 'thr_mid', 'thr_expo'];
for (const a of AXES) RATE_KEYS.push(`${a}_rc_rate`, `${a}_srate`, `${a}_expo`, `${a}_rate_limit`);
const PID_KEYS = AXES.flatMap((a) => [`p_${a}`, `i_${a}`, `d_${a}`]);

test('the js core\'s default rates are the Air65 diff\'s rateprofile 0', () => {
  const p = parseCli(OWNER_DIFF, 'BETAFLIGHT');
  assert.equal(p.activeRateProfile, 0);
  const d = pilotRatesDefault();
  assert.equal(d.type, p.ratesType);
  assert.equal(d.type, 'ACTUAL', 'no rates_type line: the firmware default since BF 4.3');
  for (const a of AXES) assert.deepEqual(d[a], p.rates[a], a);
  assert.equal(PILOT_RATES_CARD, BF_CLASS_TUNES.whoop65, 'the card is the one the bf core names');
  const again = pilotRatesDefault();
  again.roll.srate = 1;
  assert.equal(pilotRatesDefault().roll.srate, 74, 'a fresh copy each call');
});

test('bfClassDiff: the diff as it is, with the class\'s P, I and D set on top in its selected profile', () => {
  const pids = { roll: [1, 2, 3], pitch: [4, 5, 6], yaw: [7, 8, 0] };
  const text = bfClassDiff(OWNER_DIFF, pids);
  assert.ok(text.startsWith(OWNER_DIFF.replace(/\s+$/, '')), 'every line of the diff, in order');
  const tail = text.slice(OWNER_DIFF.replace(/\s+$/, '').length);
  assert.ok(!/rate|expo|thr_/.test(tail), 'nothing of the rate profile: ' + tail);
  assert.deepEqual(tail.split('\n').filter((l) => /^(profile|set)\b/.test(l)), [
    'profile 0',
    'set p_roll = 1', 'set i_roll = 2', 'set d_roll = 3',
    'set p_pitch = 4', 'set i_pitch = 5', 'set d_pitch = 6',
    'set p_yaw = 7', 'set i_yaw = 8', 'set d_yaw = 0',
  ]);
  // The selected profile is the last `profile N` (the restore line), CRLF or not.
  const two = 'profile 0\r\nset p_roll = 9\r\nprofile 1\r\nset p_roll = 9\r\n# restore original profile selection\r\nprofile 1\r\n\r\nrateprofile 2\r\n';
  assert.match(bfClassDiff(two, pids), /\nprofile 1\nset p_roll = 1\n/);
  assert.equal(bfClassDiff(OWNER_DIFF, null), OWNER_DIFF, 'no tune: the diff as it is');
});

test('the 75 flies the Fractal75 diff as it is: the Air65 diff\'s stick rates, its own throttle curve and P, I and D', async () => {
  const fractalDiff = read('vendor/sim-core/configs/fractal75-ryfly-2026-11-03.txt');
  assert.equal(bfClassDiff(fractalDiff, null), fractalDiff, 'no class card on top');
  const fractal = await createBfCore({
    SimCore, wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: JSON.parse(read('vendor/sim-core/airframes/fractal75.json')), diff: fractalDiff, world: { floorZ: 0 },
  });
  const air65 = await bfCore(OWNER_DIFF);
  const stick = RATE_KEYS.filter((k) => !k.startsWith('thr_'));
  assert.deepEqual(fractal.sim.get(stick, { rateprofile: 0 }), air65.sim.get(stick, { rateprofile: 0 }), 'the same stick rates');
  const thr = fractal.sim.get(['thr_mid', 'thr_expo'], { rateprofile: 0 });
  assert.deepEqual([thr.thr_mid, thr.thr_expo], ['65', '35'], 'its own throttle curve, as flown');
  const pid = fractal.sim.get(PID_KEYS, { profile: 0 });
  assert.deepEqual([pid.p_roll, pid.i_roll, pid.p_pitch, pid.i_pitch, pid.p_yaw, pid.i_yaw], ['61', '110', '64', '115', '61', '110'], 'its own profile (GF 40mm)');
});

test('bfClassDiff with each class card on the Air65 diff holds its rates and the card\'s PIDs (read back from Betaflight)', async () => {
  const base = await bfCore(OWNER_DIFF);
  const want = base.sim.get(RATE_KEYS, { rateprofile: 0 });
  assert.equal(want.rates_type, 'ACTUAL');
  assert.deepEqual([want.roll_rc_rate, want.roll_srate, want.roll_expo], ['2', '74', '56']);
  assert.deepEqual([want.yaw_rc_rate, want.yaw_srate, want.yaw_expo], ['2', '70', '56']);
  const db = cards();
  const seen = new Map();
  const lineKey = (l) => l.n + ' ' + l.text;
  const baseRefused = new Set(base.report.lines.filter((l) => l.status === 'rejected').map(lineKey));
  const diffLines = OWNER_DIFF.replace(/\s+$/, '').split('\n').length;
  for (const [cls, id] of Object.entries(BF_CLASS_TUNES)) {
    const card = db.find((t) => t.id === id);
    assert.ok(card, id + ' is a tune-database card');
    assert.equal(String(card.frame), cls.replace('whoop', ''), id + ' is a ' + cls + ' tune');
    assert.equal(card.source, 'RyFly', id + ' is the owner\'s own');
    const core = await bfCore(bfClassDiff(OWNER_DIFF, card.pids));
    assert.equal(core.report.errors, base.report.errors, cls + ': nothing more outside the sim target');
    const mine = core.report.lines.filter((l) => l.n > diffLines);
    assert.equal(mine.filter((l) => l.status === 'applied').length, 10, cls + ': its profile line and nine P/I/D lines all taken');
    // Betaflight refuses nothing more, but for the diff's D-min where it is
    // at or above the class's D: validateAndFix turns that D-min off on boot,
    // as the real board does (the 85's card notes it for its own roll).
    for (const l of core.report.lines.filter((x) => x.status === 'rejected' && !baseRefused.has(lineKey(x)))) {
      const m = /^set d_min_(roll|pitch) = (\d+)$/.exec(l.text.trim());
      assert.ok(m && l.n <= diffLines && +m[2] >= card.pids[m[1]][2] && /validateAndFix/.test(l.msg), `${cls}: ${JSON.stringify(l)}`);
    }
    assert.deepEqual(core.sim.get(RATE_KEYS, { rateprofile: 0 }), want, cls + ' flies the Air65 diff\'s rates');
    const pid = core.sim.get(PID_KEYS, { profile: 0 });
    for (const a of AXES) {
      assert.deepEqual([+pid[`p_${a}`], +pid[`i_${a}`], +pid[`d_${a}`]], [...card.pids[a]], `${cls} ${a} P/I/D are ${id}'s`);
    }
    seen.set(cls, JSON.stringify(pid));
    if (cls === 'whoop65') {
      // The 65's tune is the diff's own profile: Betaflight holds exactly
      // what it held on the diff alone.
      assert.equal(core.sim.diff('all'), base.sim.diff('all'), 'the 65 flies the diff as before');
    }
  }
  assert.equal(new Set(seen.values()).size, 3, 'the 65, 75 and 85 each fly their own PIDs: ' + [...seen.values()].join(' | '));
});

// sim.html is one inline module; the class switch and the bf config are
// checked in its source (tools/test_sim_rates_page.mjs flies them).
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

test('sim.html: a class switch never touches the rates; the bf config is the class\'s', () => {
  const html = read('sim.html').replace(/\r\n/g, '\n');
  for (const gone of ['rateProfileForClass', 'RATE_FALLBACK', 'BF_CLASS_DEFAULT', 'applyClassRates']) {
    assert.ok(!html.includes(gone), gone + ': no per-class rates');
  }
  const apply = extract(html, 'applyDroneType');
  for (const banned of ['rates', 'Rates']) assert.ok(!apply.includes(banned), 'applyDroneType leaves the rates alone: ' + banned);
  const onchange = html.slice(html.indexOf('droneSel.onchange=()=>{'), html.indexOf('};', html.indexOf('droneSel.onchange=()=>{')));
  assert.ok(onchange.includes('applyDroneType();') && !/rates/i.test(onchange), 'the class picker sets no rates');
  const types = html.slice(html.indexOf('const DRONE_TYPES={'), html.indexOf('};', html.indexOf('const DRONE_TYPES={')));
  assert.ok(!/\bsr:/.test(types), 'DRONE_TYPES carry no rates');
  for (const keep of ['mass:', 'drag:', 'spool:', 'cam:', 'fov:']) assert.equal(types.split(keep).length - 1, 5, 'every class keeps its ' + keep);
  assert.ok(html.includes('const rates=Object.assign({quickRatesRcExpo:false},pilotRatesDefault());'));
  // The bf core: the flying class's config, built from that class's diff (the
  // 65's card on top of the Air65's; the 75's Fractal75 diff as it is).
  assert.ok(html.includes("tune:BF_CLASS_TUNES.whoop65}") && html.includes("diff:'vendor/sim-core/configs/fractal75-ryfly-2026-11-03.txt',tune:null}"));
  const bfDiff = extract(html, 'bfDiff');
  assert.ok(bfDiff.includes('c.tune&&db&&db.find(t=>t.id===c.tune)') && bfDiff.includes('bfClassDiff(b.ownerDiff,tune&&tune.pids)'), bfDiff);
  assert.ok(html.includes('diff:bfDiff(type),world:bfWorld()})') && html.includes('b.diffLoaded=bfDiff(type);'), 'the bf core boots on the class config');
});

test('the Tune panel names where the rates come from', () => {
  assert.equal(ratesSourceText({ core: 'bf' }), 'Rates: your Air65 diff (bf)');
  assert.equal(ratesSourceText({ core: 'bf', cli: 'top' }), 'Rates: your Air65 diff, your CLI lines on top (bf, this session)');
  assert.equal(ratesSourceText({ core: 'bf', cli: 'replace' }), 'Rates: your pasted diff (bf, this session)');
  assert.equal(ratesSourceText({ core: 'bf', quad: 'Fractal75' }), 'Rates: your Fractal75 diff (bf)', 'on the 75');
  assert.equal(ratesSourceText({ core: 'bf', quad: 'Fractal75', cli: 'top' }), 'Rates: your Fractal75 diff, your CLI lines on top (bf, this session)');
  assert.equal(ratesSourceText({ core: 'js', js: 'saved' }), 'Rates: your saved profile (js, every class)');
  assert.equal(ratesSourceText({ core: 'js', js: 'link' }), 'Rates: the rates link (js, this session)');
  assert.equal(ratesSourceText({ core: 'js', js: 'default' }), 'Rates: your Air65 diff\'s (js default, every class)');
  const html = read('sim.html').replace(/\r\n/g, '\n');
  // A line per core, shown by body.bf-core like the rest of the rates.
  assert.ok(html.includes(`<p class="build-note rates-bf" id="ratesSourceBf">${ratesSourceText({ core: 'bf' })}</p>`));
  assert.ok(html.includes('<p class="build-note rates-js" id="ratesSourceJs"></p>'));
  assert.ok(html.includes('body.bf-core .rates-js,body:not(.bf-core) .rates-bf{display:none!important}'));
  const sync = extract(html, 'syncRatesSource');
  assert.ok(sync.includes("js:ratesFromLink?'link':ratesAreCustom?'saved':'default'"), sync);
  assert.ok(sync.includes("const t=bfFlyingType(),cli=bfOf(t).cliText;") && sync.includes("quad:bfQuad(t),cli:!cli?'':bfPasteReplaces(cli)?'replace':'top'"), sync);
  assert.ok(extract(html, 'refreshRatesUI').includes('syncRatesSource();'));
  assert.ok(html.includes('  bfOf().cliText=text;\n  syncRatesSource();\n'), 'an IMPORT CLI paste renames the bf source');
  assert.equal(html.split('ratesFromLink=true;').length - 1, 2, 'preset= and rates= links');
  assert.ok(extract(html, 'saveRates').includes('ratesFromLink=false;\n  syncRatesSource();'));
});
