// CLI parser + rates_type math. Known values are Betaflight rc.c endpoints.
// node --test tools/test_sim_rates.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RATE_TYPES, parseCli, bfCurve, actualRate, kissRate, raceFlightRate, quickRate,
  rateSetpoint, maxRateDps, convertAxisFamily, normalizeRateType, formatCliSummary,
} from '../sim-rates.js';

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
