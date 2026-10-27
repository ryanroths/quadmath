// CLI parser + rates_type math. Known values are Betaflight rc.c endpoints.
// node --test tools/test_sim_rates.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RATE_TYPES, parseCli, bfCurve, actualRate, kissRate, raceFlightRate, quickRate,
  rateSetpoint, maxRateDps, convertAxisFamily, normalizeRateType, formatCliSummary,
  SETPOINT_LIMIT, encodeRates, decodeRates, ratesDeepLink, RATE_CARDS,
} from '../sim-rates.js';
import { RATE_PRESETS, applyRatePreset } from '../sim-feel.js';

const near = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);

const BF_43 = `# version
# Betaflight / STM32F405 (S405) 4.3.2 Jul 28 2022 / 21:44:22 (norevision) MSP API: 1.44
batch start
# profile
profile 0
set p_roll = 45
set i_roll = 80
set d_roll = 38
set p_pitch = 47
set i_pitch = 80
set d_pitch = 40
set p_yaw = 45
set i_yaw = 80
set d_yaw = 0
# rateprofile
rateprofile 0
set rates_type = BETAFLIGHT
set roll_rc_rate = 110
set pitch_rc_rate = 110
set yaw_rc_rate = 100
set roll_srate = 72
set pitch_srate = 72
set yaw_srate = 70
set roll_expo = 25
set pitch_expo = 25
set yaw_expo = 20
profile 0
rateprofile 0
save
`;

const BF_45_ACTUAL = `# version
# Betaflight / STM32G47X (SG47) 4.5.0 Jan 9 2024 / 12:00:00 MSP API: 1.46
# dump
# profile
profile 0
set p_roll = 42
# rateprofile
rateprofile 0
set rates_type = ACTUAL
set roll_rc_rate = 7
set pitch_rc_rate = 7
set yaw_rc_rate = 8
set roll_srate = 67
set pitch_srate = 67
set yaw_srate = 55
set roll_expo = 50
set pitch_expo = 50
set yaw_expo = 40
rateprofile 1
set rates_type = BETAFLIGHT
set roll_rc_rate = 100
set pitch_rc_rate = 100
set yaw_rc_rate = 100
set roll_srate = 70
set pitch_srate = 70
set yaw_srate = 70
set roll_expo = 0
set pitch_expo = 0
set yaw_expo = 0
# restore original rateprofile selection
rateprofile 0
`;

const BF_44_DIFF_NO_TYPE = `# diff all
# version
# Betaflight / STM32F7X2 4.4.3
# rateprofile
rateprofile 0
set roll_rc_rate = 7
set pitch_rc_rate = 7
set yaw_rc_rate = 7
set roll_srate = 58
set pitch_srate = 58
set yaw_srate = 50
set roll_expo = 0
set pitch_expo = 0
set yaw_expo = 0
`;

const KISS_DUMP = `rateprofile 0
set rates_type = KISS
set roll_rc_rate = 100
set pitch_rc_rate = 100
set yaw_rc_rate = 100
set roll_srate = 70
set pitch_srate = 70
set yaw_srate = 70
set roll_expo = 0
set pitch_expo = 0
set yaw_expo = 0
`;

const QUICK_DUMP = `set rates_type = QUICKRATES
set roll_rc_rate = 160
set pitch_rc_rate = 160
set yaw_rc_rate = 160
set roll_srate = 80
set pitch_srate = 80
set yaw_srate = 80
set roll_expo = 0
`;

const RF_DUMP = `set rates_type = RACEFLIGHT
set roll_rc_rate = 80
set pitch_rc_rate = 80
set yaw_rc_rate = 80
set roll_srate = 70
set pitch_srate = 70
set yaw_srate = 70
set roll_expo = 50
`;

test('all five rates_type names normalize', () => {
  assert.deepEqual(RATE_TYPES, ['BETAFLIGHT', 'ACTUAL', 'KISS', 'QUICK', 'RACEFLIGHT']);
  assert.equal(normalizeRateType('quickrates'), 'QUICK');
  assert.equal(normalizeRateType('4'), 'QUICK');
  assert.equal(normalizeRateType('3'), 'ACTUAL');
  assert.equal(normalizeRateType('RaceFlight'), 'RACEFLIGHT');
});

test('empty paste is a graceful error', () => {
  const p = parseCli('   \n  ');
  assert.equal(p.error, 'Paste a Betaflight dump or diff all');
  assert.equal(p.found, 0);
});

test('garbage paste is a graceful error', () => {
  const p = parseCli('hello this is not a dump');
  assert.equal(p.error, 'No recognised CLI commands found');
});

test('4.3 dump with profile/rateprofile and BETAFLIGHT rates', () => {
  const p = parseCli(BF_43, 'ACTUAL');
  assert.equal(p.error, null);
  assert.equal(p.ratesType, 'BETAFLIGHT');
  assert.equal(p.activeRateProfile, 0);
  near(p.rates.roll.rcRate, 1.10);
  near(p.rates.roll.srate, 0.72);
  near(p.rates.roll.expo, 0.25);
  near(p.rates.yaw.rcRate, 1.00);
  near(p.rates.yaw.srate, 0.70);
  near(p.rates.yaw.expo, 0.20);
  assert.equal(p.pids.rollP, 45);
  assert.equal(p.pids.pitchD, 40);
});

test('4.5 dump uses restored rateprofile, not the last dumped one', () => {
  const p = parseCli(BF_45_ACTUAL, 'BETAFLIGHT');
  assert.equal(p.ratesType, 'ACTUAL');
  assert.equal(p.activeRateProfile, 0);
  near(p.rates.roll.rcRate, 7);
  near(p.rates.roll.srate, 67);
  near(p.rates.roll.expo, 0.50);
  near(p.rates.yaw.rcRate, 8);
  near(p.rates.yaw.srate, 55);
  near(p.rates.yaw.expo, 0.40);
});

test('4.4 diff without rates_type infers ACTUAL from small rc_rate', () => {
  const p = parseCli(BF_44_DIFF_NO_TYPE, 'BETAFLIGHT');
  assert.equal(p.ratesType, 'ACTUAL');
  near(p.rates.roll.rcRate, 7);
  near(p.rates.roll.srate, 58);
  assert.ok(p.warnings.some((w) => /inferred ACTUAL/.test(w)));
});

test('old rc_rate / rc_expo aliases fill roll and pitch', () => {
  const p = parseCli('set rc_rate = 120\nset rc_rate_yaw = 90\nset rc_expo = 30\nset rc_expo_yaw = 10\nset roll_srate = 65\nset pitch_srate = 65\nset yaw_srate = 60\nset rates_type = BETAFLIGHT\n');
  near(p.rates.roll.rcRate, 1.20);
  near(p.rates.pitch.rcRate, 1.20);
  near(p.rates.yaw.rcRate, 0.90);
  near(p.rates.roll.expo, 0.30);
  near(p.rates.yaw.expo, 0.10);
  near(p.rates.yaw.srate, 0.60);
});

test('KISS / QUICKRATES / RACEFLIGHT dumps scale to live units', () => {
  const k = parseCli(KISS_DUMP);
  assert.equal(k.ratesType, 'KISS');
  near(k.rates.roll.rcRate, 1.00);
  near(k.rates.roll.srate, 0.70);
  const q = parseCli(QUICK_DUMP);
  assert.equal(q.ratesType, 'QUICK');
  near(q.rates.roll.rcRate, 160);
  near(q.rates.roll.srate, 80);
  const r = parseCli(RF_DUMP);
  assert.equal(r.ratesType, 'RACEFLIGHT');
  near(r.rates.roll.rcRate, 80);
  near(r.rates.roll.srate, 0.70);
  near(r.rates.roll.expo, 0.50);
});

test('idle_min_rpm = 0 does not zero idle; dshot_idle_value still works', () => {
  const z = parseCli('set idle_min_rpm = 0\nset dshot_idle_value = 550\n');
  assert.equal(z.idle, 0.055);
  const onlyZero = parseCli('set idle_min_rpm = 0\n');
  assert.equal(onlyZero.idle, null);
  const dshot = parseCli('set dshot_idle_value = 550\n');
  near(dshot.idle, 0.055);
});

test('quick_rates_rc_expo is parsed and changes the mid-stick value', () => {
  const p = parseCli('set rates_type = QUICKRATES\nset roll_rc_rate = 160\nset roll_srate = 80\nset roll_expo = 40\nset quick_rates_rc_expo = ON\n');
  assert.equal(p.quickRatesRcExpo, true);
  near(p.rates.roll.expo, 0.40);
  const off = rateSetpoint('QUICK', 0.5, p.rates.roll, { quickRatesRcExpo: false });
  const on = rateSetpoint('QUICK', 0.5, p.rates.roll, { quickRatesRcExpo: true });
  assert.ok(Math.abs(on - off) > 1, `expo flag did not move mid-stick (${off} vs ${on})`);
});

test('rateSetpoint never exceeds the 1998 deg/s cap', () => {
  assert.equal(SETPOINT_LIMIT, 1998);
  assert.equal(rateSetpoint('BETAFLIGHT', 1, { rcRate: 2.5, srate: 0.99, expo: 0 }), 1998);
});

test('formatCliSummary names the type and values', () => {
  const p = parseCli(BF_45_ACTUAL);
  const text = formatCliSummary(p, { type: p.ratesType, ...p.rates });
  assert.match(text, /Actual/);
  assert.match(text, /rateprofile 0/);
  assert.match(text, /670/);
});

test('Betaflight curve matches known Configurator values', () => {
  near(bfCurve(1, 1.0, 0.70, 0), 200 / 0.3);
  near(bfCurve(1, 1.10, 0.72, 0.25), 220 / 0.28);
  near(bfCurve(0.5, 1.0, 0.70, 0), 100 / 0.65);
  near(bfCurve(-1, 1.0, 0.70, 0), -200 / 0.3);
  near(rateSetpoint('BETAFLIGHT', 1, { rcRate: 1.0, srate: 0.70, expo: 0 }), 200 / 0.3);
});

test('Actual curve matches known Betaflight values', () => {
  assert.equal(actualRate(1, 75, 650, 0.5), 650);
  assert.equal(actualRate(0, 75, 650, 0.5), 0);
  near(actualRate(0.5, 75, 650, 0), 0.5 * 75 + 575 * 0.25);
  near(rateSetpoint('ACTUAL', 1, { rcRate: 7, srate: 67, expo: 0.5 }), 670);
});

test('KISS curve matches Betaflight applyKissRates', () => {
  near(kissRate(1, 1.0, 0.70, 0), 2000 * (1 / 0.3) * 0.1);
  near(kissRate(0.5, 1.0, 0.70, 0), 2000 * (1 / 0.65) * 0.05);
  near(maxRateDps('KISS', { rcRate: 1.0, srate: 0.70, expo: 0 }), 2000 * (1 / 0.3) * 0.1);
});

test('RaceFlight curve matches Betaflight applyRaceFlightRates', () => {
  near(raceFlightRate(1, 80, 0.70, 0), 1360);
  near(raceFlightRate(0.5, 80, 0.70, 0), 540);
  const expo50 = raceFlightRate(0.5, 80, 0.70, 0.5);
  near(expo50, 337.5);
  near(maxRateDps('RACEFLIGHT', { rcRate: 80, srate: 0.70, expo: 0.5 }), 1360);
});

test('Quick curve matches Betaflight applyQuickRates (default expo path)', () => {
  near(quickRate(1, 160, 80, 0, false), 800);
  near(quickRate(0.5, 160, 80, 0, false), 0.5 * 320 * (1 / 0.7));
  near(maxRateDps('QUICK', { rcRate: 160, srate: 80, expo: 0 }), 800);
});

test('every type is monotonic and zero at centre', () => {
  const samples = {
    BETAFLIGHT: { rcRate: 1.10, srate: 0.72, expo: 0.25 },
    ACTUAL: { rcRate: 7.5, srate: 65, expo: 0.5 },
    KISS: { rcRate: 1.00, srate: 0.70, expo: 0.20 },
    QUICK: { rcRate: 160, srate: 80, expo: 0.30 },
    RACEFLIGHT: { rcRate: 80, srate: 0.70, expo: 0.40 },
  };
  for (const type of RATE_TYPES) {
    const a = samples[type];
    assert.equal(rateSetpoint(type, 0, a), 0, type + ' centre');
    let prev = -Infinity;
    for (let x = -1; x <= 1.0001; x += 0.05) {
      const v = rateSetpoint(type, x, a);
      assert.ok(v >= prev - 1e-9, type + ' not monotonic at ' + x);
      prev = v;
    }
    assert.ok(maxRateDps(type, a) > 100, type + ' max');
  }
});

test('encode/decode Ryan Actual token is 740/740/700', () => {
  const state = {
    type: 'ACTUAL',
    roll: { rcRate: 4, srate: 74, expo: 0.56 },
    pitch: { rcRate: 4, srate: 74, expo: 0.56 },
    yaw: { rcRate: 4, srate: 70, expo: 0.56 },
  };
  assert.equal(encodeRates(state), 'ACTUAL.4.74.56.4.74.56.4.70.56');
  const d = decodeRates('ACTUAL.4.74.56.4.74.56.4.70.56');
  assert.equal(d.error, undefined);
  assert.equal(d.type, 'ACTUAL');
  near(d.roll.rcRate, 4);
  near(d.roll.srate, 74);
  near(d.roll.expo, 0.56);
  near(d.yaw.srate, 70);
  near(maxRateDps('ACTUAL', d.roll), 740);
  near(maxRateDps('ACTUAL', d.pitch), 740);
  near(maxRateDps('ACTUAL', d.yaw), 700);
  assert.equal(d.pids, undefined);
});

test('encode/decode Betaflight integer token', () => {
  const state = {
    type: 'BETAFLIGHT',
    roll: { rcRate: 1.10, srate: 0.72, expo: 0.25 },
    pitch: { rcRate: 1.10, srate: 0.72, expo: 0.25 },
    yaw: { rcRate: 1.00, srate: 0.70, expo: 0.20 },
  };
  assert.equal(encodeRates(state), 'BETAFLIGHT.110.72.25.110.72.25.100.70.20');
  const d = decodeRates('BETAFLIGHT.110.72.25.110.72.25.100.70.20');
  assert.equal(d.error, undefined);
  near(d.roll.rcRate, 1.10);
  near(d.roll.srate, 0.72);
  near(d.roll.expo, 0.25);
  near(maxRateDps('BETAFLIGHT', d.roll), 220 / 0.28);
});

test('RATE_CARDS aliases decode without importing tune-database', () => {
  const src = readFileSync(new URL('../sim-rates.js', import.meta.url), 'utf8');
  assert.equal(/tune-database\.js/.test(src), false);
  const stock = decodeRates('card.65-betafpv-stock');
  assert.equal(stock.error, undefined);
  assert.equal(stock.type, 'ACTUAL');
  near(stock.roll.rcRate, 7);
  near(stock.roll.srate, 58);
  near(stock.roll.expo, 0);
  near(stock.yaw.srate, 50);
  near(maxRateDps('ACTUAL', stock.roll), 580);
  near(maxRateDps('ACTUAL', stock.yaw), 500);
  const ry = decodeRates('card.65-betafpv-ryfly-1219s');
  assert.equal(encodeRates(ry), 'ACTUAL.2.74.56.2.74.56.2.70.56');
  near(maxRateDps('ACTUAL', ry.roll), 740);
  near(maxRateDps('ACTUAL', ry.yaw), 700);
  const o4 = decodeRates('card.75-betafpv-ryfly-o4-gf1811');
  assert.equal(o4.type, 'ACTUAL');
  near(o4.roll.rcRate, 2);
  near(o4.roll.srate, 73);
  near(o4.yaw.srate, 70);
  near(maxRateDps('ACTUAL', o4.roll), 730);
  const hm = decodeRates('card.75-happymodel-aio-stock');
  assert.equal(hm.type, 'BETAFLIGHT');
  near(hm.roll.rcRate, 1.00);
  near(hm.roll.srate, 0.70);
  near(hm.roll.expo, 0);
  assert.ok(decodeRates('card.nope').error);
  assert.equal(Object.keys(RATE_CARDS).length, 4);
});

test('Tune accepts a loose paste of bare rate triples', () => {
  const actual = parseCli('7, 58, 0\n7, 58, 0\n7, 50, 0');
  assert.equal(actual.error, null);
  assert.equal(actual.ratesType, 'ACTUAL');
  near(actual.rates.roll.rcRate, 7);
  near(actual.rates.yaw.srate, 50);
  const slash = parseCli('ACTUAL 4 74 56 / 4 74 56 / 4 70 56');
  assert.equal(slash.ratesType, 'ACTUAL');
  near(slash.rates.roll.srate, 74);
  near(slash.rates.roll.expo, 0.56);
  const one = parseCli('100, 70, 0', 'BETAFLIGHT');
  assert.equal(one.ratesType, 'BETAFLIGHT');
  near(one.rates.roll.rcRate, 1.00);
  near(one.rates.yaw.srate, 0.70);
  assert.equal(parseCli('hello this is not a dump').error, 'No recognised CLI commands found');
});

test('decodeRates rejects junk and out-of-range fields', () => {
  assert.ok(decodeRates('nope').error);
  assert.ok(decodeRates('ACTUAL.1.2.3').error);
  assert.ok(decodeRates('ACTUAL.4.74.56.4.74.56.4.70.56.extra').error);
  assert.ok(decodeRates('NOPE.4.74.56.4.74.56.4.70.56').error);
  assert.ok(decodeRates('ACTUAL.4.74.56.4.74.56.4.999.56').error);
  assert.ok(decodeRates('').error);
  assert.ok(decodeRates(null).error);
  assert.equal(encodeRates(null), null);
  assert.equal(encodeRates({ type: 'NOPE', roll: {}, pitch: {}, yaw: {} }), null);
});

test('ratesDeepLink encodes map/track/mode/build/rates and no CLI dump', () => {
  const url = ratesDeepLink({
    origin: 'https://quadmath.com',
    map: 'living',
    track: 'living-circuit',
    mode: 'acro',
    build: 'QB1.air65',
    rates: 'ACTUAL.4.74.56.4.74.56.4.70.56',
  });
  assert.ok(url.includes('/sim.html?'));
  assert.ok(url.includes('map=living'));
  assert.ok(url.includes('track=living-circuit'));
  assert.ok(url.includes('mode=acro'));
  assert.ok(url.includes('build=QB1.air65'));
  assert.ok(url.includes('rates=ACTUAL.4.74.56.4.74.56.4.70.56'));
  assert.equal(url.includes('set '), false);
  assert.equal(url.includes('rateprofile'), false);
});

test('ryanActual preset is Actual 40/740/700 expo 0.56', () => {
  const p = RATE_PRESETS.ryanActual;
  assert.ok(p);
  assert.equal(p.type, 'ACTUAL');
  assert.equal(p.roll.rcRate, 4);
  assert.equal(p.pitch.rcRate, 4);
  assert.equal(p.yaw.rcRate, 4);
  assert.equal(p.roll.srate, 74);
  assert.equal(p.pitch.srate, 74);
  assert.equal(p.yaw.srate, 70);
  assert.equal(p.roll.expo, 0.56);
  near(maxRateDps('ACTUAL', p.roll), 740);
  near(maxRateDps('ACTUAL', p.pitch), 740);
  near(maxRateDps('ACTUAL', p.yaw), 700);
  const rates = {
    type: 'BETAFLIGHT',
    roll: { rcRate: 1, srate: 0.5, expo: 0 },
    pitch: { rcRate: 1, srate: 0.5, expo: 0 },
    yaw: { rcRate: 1, srate: 0.5, expo: 0 },
  };
  assert.equal(applyRatePreset(rates, 'ryanActual'), true);
  assert.equal(encodeRates(rates), 'ACTUAL.4.74.56.4.74.56.4.70.56');
});

test('convertAxisFamily keeps full-stick max across families', () => {
  const bf = { rcRate: 1.10, srate: 0.72, expo: 0.25 };
  const max = maxRateDps('BETAFLIGHT', bf);
  for (const to of RATE_TYPES) {
    const conv = convertAxisFamily(bf, 'BETAFLIGHT', to);
    near(maxRateDps(to, conv), max, 8);
    const back = convertAxisFamily(conv, to, 'BETAFLIGHT');
    near(maxRateDps('BETAFLIGHT', back), max, 12);
  }
});
