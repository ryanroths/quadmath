// Blackbox pipeline tests, plus the original CLI dump.
//
//   node tools/test_blackbox_metrics.mjs                 run the tests
//   node tools/test_blackbox_metrics.mjs path/to/log.bbl [logIndex]
//                                                        dump findings for a log
//
// The tests drive the real extract -> analyze -> rules chain with synthetic
// headers and frames. No .bbl is committed: the thing under test is which of
// two independent conditions failed, and that is a property of the header and
// the frame definition, not of any particular flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readSettings, extractLog, debugModeIsRaw } from '../blackbox-extract.js';
import { analyze } from '../blackbox-metrics.js';
import { buildFindings } from '../blackbox-rules.js';

const cliPath = process.argv[2];

/* ---------------------------------------------------------------- fixtures */

const AXES = [0, 1, 2];
const BASE_FIELDS = [
  'loopIteration', 'time',
  ...AXES.flatMap(a => [`axisP[${a}]`, `axisI[${a}]`, `axisD[${a}]`, `axisF[${a}]`]),
  ...AXES.map(a => `gyroADC[${a}]`),
  ...AXES.map(a => `setpoint[${a}]`),
  'rcCommand[3]',
  ...[0, 1, 2, 3].map(m => `motor[${m}]`),
  'vbatLatest', 'amperageLatest',
];
const DEBUG_FIELDS = [0, 1, 2, 3].map(d => `debug[${d}]`);

// A Betaflight header block, reduced to what readSettings() actually reads.
// `debugMode` is whatever the parser resolved: a name on a firmware the
// vendored WASM knows, a bare number on one it does not.
function makeHeaders({ debugMode, firmware = '4.5.0' }) {
  const [major, minor, patch] = firmware.split('.').map(Number);
  return {
    firmwareRevision: `Betaflight ${firmware}`,
    firmwareVersion: { major, minor, patch },
    boardInfo: 'BETAFPVG473',
    craftName: 'Air65',
    debugMode,
    pwmProtocol: 'DSHOT300',
    unknown: new Map([
      ['looptime', '125'],
      ['pid_process_denom', '1'],
      ['rollPID', '45,80,30,120'],
      ['pitchPID', '47,84,34,125'],
      ['yawPID', '45,80,0,120'],
      ['gyro_lpf1_static_hz', '250'],
      ['dterm_lpf1_static_hz', '150'],
      ['dyn_notch_count', '1'],
      ['dshot_bidir', '1'],
      ['gyro_rpm_notch_harmonics', '3'],
      ['motorOutput', '0,2000'],
    ]),
  };
}

// `n` main frames at `fs` Hz carrying a small gyro oscillation, so welch() has
// something to chew on and the step-response pass has movement to find.
function makeParser({ withDebugFields, n = 8192, fs = 2000 }) {
  const names = withDebugFields ? [...BASE_FIELDS, ...DEBUG_FIELDS] : BASE_FIELDS;
  const mainFrameDef = new Map(names.map((k, i) => [k, i]));

  function* frames() {
    for (let i = 0; i < n; i++) {
      const s = i / fs;
      const wobble = 20 * Math.sin(2 * Math.PI * 90 * s);
      const cmd = 100 * Math.sin(2 * Math.PI * 1.5 * s);
      const f = new Map(names.map(k => [k, 0]));
      f.set('loopIteration', i);
      f.set('time', s);
      for (const a of AXES) {
        f.set(`gyroADC[${a}]`, cmd + wobble);
        f.set(`setpoint[${a}]`, cmd);
        f.set(`axisP[${a}]`, cmd * 0.4);
        f.set(`axisD[${a}]`, wobble * 0.2);
      }
      f.set('rcCommand[3]', 1600);
      for (const m of [0, 1, 2, 3]) f.set(`motor[${m}]`, 1200 + 40 * m);
      f.set('vbatLatest', 400);
      f.set('amperageLatest', 500);
      // The pre-filter gyro: the same signal with the noise not yet removed.
      if (withDebugFields) for (const a of AXES) f.set(`debug[${a}]`, cmd + wobble * 2.5);
      yield { kind: 'main', data: { time: s, fields: f } };
    }
  }

  return { mainFrameDef, [Symbol.iterator]: frames };
}

// The whole chain, exactly as the worker runs it.
function run({ debugMode, withDebugFields }) {
  const headers = makeHeaders({ debugMode });
  const settings = readSettings(headers);
  const log = extractLog(headers, makeParser({ withDebugFields }), settings);
  const metrics = analyze(log);
  metrics.droppedFrames = log.droppedFrames;
  const { findings } = buildFindings(metrics, settings);
  return { settings, log, metrics, findings };
}

const gyroFinding = findings =>
  findings.find(f => f.title === 'Debug logging disabled' || f.title === 'No unfiltered gyro in log') || null;

/* ------------------------------------------------------------------- tests */

if (!cliPath) {
  test('debugModeIsRaw accepts resolved names', () => {
    assert.equal(debugModeIsRaw('GYRO_SCALED'), true);
    assert.equal(debugModeIsRaw('GYRO_RAW'), true);
    assert.equal(debugModeIsRaw('gyro_scaled'), true, 'case must not matter');
    assert.equal(debugModeIsRaw('  GYRO_SCALED  '), true, 'surrounding space must not matter');
    assert.equal(debugModeIsRaw('GYRO_FILTERED'), false, 'filtered gyro is not the pre-filter signal');
    assert.equal(debugModeIsRaw('NONE'), false);
  });

  test('debugModeIsRaw accepts a bare numeric header', () => {
    // A firmware newer than the vendored WASM leaves debug_mode unresolved, so
    // the header arrives as the enum index rather than a name.
    assert.equal(debugModeIsRaw('6'), true, 'DEBUG_GYRO_SCALED is index 6');
    assert.equal(debugModeIsRaw(6), true, 'a number, not just a numeric string');
    assert.equal(debugModeIsRaw('3'), false, 'GYRO_FILTERED');
    assert.equal(debugModeIsRaw('0'), false, 'NONE');
    assert.equal(debugModeIsRaw('16'), false, 'must not match on a substring of the digits');
  });

  test('debugModeIsRaw is false for a missing header', () => {
    assert.equal(debugModeIsRaw(null), false);
    assert.equal(debugModeIsRaw(undefined), false);
    assert.equal(debugModeIsRaw(''), false);
  });

  test('extractLog reports the two conditions separately', () => {
    const both = run({ debugMode: 'GYRO_SCALED', withDebugFields: true });
    assert.equal(both.log.debugModeRaw, true);
    assert.equal(both.log.hasDebugFields, true);
    assert.ok(both.log.gyroRaw, 'both conditions met, so the pre-filter gyro is extracted');

    const noFields = run({ debugMode: 'GYRO_SCALED', withDebugFields: false });
    assert.equal(noFields.log.debugModeRaw, true, 'the mode was set');
    assert.equal(noFields.log.hasDebugFields, false, 'the fields were not written');
    assert.equal(noFields.log.gyroRaw, null);

    const wrongMode = run({ debugMode: 'GYRO_FILTERED', withDebugFields: true });
    assert.equal(wrongMode.log.debugModeRaw, false);
    assert.equal(wrongMode.log.hasDebugFields, true);
    assert.equal(wrongMode.log.gyroRaw, null);
  });

  test('analyze passes both flags through to the rules layer', () => {
    const { metrics } = run({ debugMode: 'GYRO_SCALED', withDebugFields: false });
    assert.equal(metrics.hasRaw, false);
    assert.equal(metrics.debugModeRaw, true);
    assert.equal(metrics.hasDebugFields, false);
  });

  // (a) The reported bug: BF 4.5 on a BETAFPVG473 with debug_mode = GYRO_SCALED
  // and blackbox_disable_debug = ON. The mode is right; nothing was logged.
  test('case a: mode set but debug fields disabled blames the logger', () => {
    const { findings } = run({ debugMode: 'GYRO_SCALED', withDebugFields: false });
    const f = gyroFinding(findings);
    assert.ok(f, 'a finding is still emitted');
    assert.equal(f.title, 'Debug logging disabled');
    assert.match(f.detail, /debug_mode is GYRO_SCALED/);
    assert.equal(f.fix, 'set blackbox_disable_debug = OFF');
    assert.doesNotMatch(
      f.detail + ' ' + f.fix,
      /Set debug_mode = GYRO_SCALED|set debug_mode =/,
      'must not tell the pilot to set a mode that is already set',
    );
  });

  test('case a holds when the firmware is newer than the vendored parser', () => {
    // Date-versioned release, debug_mode left as the raw enum index.
    const headers = makeHeaders({ debugMode: '6', firmware: '2026.6.1' });
    const settings = readSettings(headers);
    const log = extractLog(headers, makeParser({ withDebugFields: false }), settings);
    const metrics = analyze(log);
    metrics.droppedFrames = log.droppedFrames;
    const f = gyroFinding(buildFindings(metrics, settings).findings);
    assert.equal(settings.version, '2026.6.1');
    assert.equal(f.title, 'Debug logging disabled');
  });

  // (b) Fields are there, the mode is something else. The original message.
  test('case b: debug fields present but wrong mode blames debug_mode', () => {
    const { findings } = run({ debugMode: 'GYRO_FILTERED', withDebugFields: true });
    const f = gyroFinding(findings);
    assert.equal(f.title, 'No unfiltered gyro in log');
    assert.match(f.detail, /debug_mode is not GYRO_SCALED/);
    assert.doesNotMatch(f.detail, /blackbox_disable_debug/, 'the fields were written, so that is not the problem');
    assert.equal(f.fix, null);
  });

  // (c) Neither. Both settings have to change, so say both.
  test('case c: neither mode nor fields names both settings', () => {
    const { findings } = run({ debugMode: 'NONE', withDebugFields: false });
    const f = gyroFinding(findings);
    assert.equal(f.title, 'No unfiltered gyro in log');
    assert.match(f.detail, /debug_mode is not GYRO_SCALED and no debug fields were recorded/);
    assert.match(f.fix, /set debug_mode = GYRO_SCALED/);
    assert.match(f.fix, /set blackbox_disable_debug = OFF/);
  });

  test('happy path: mode set and fields present emits nothing', () => {
    const { metrics, findings } = run({ debugMode: 'GYRO_SCALED', withDebugFields: true });
    assert.equal(metrics.hasRaw, true);
    assert.equal(gyroFinding(findings), null, 'no complaint when the pre-filter gyro is there');
  });
}

/* ------------------------------------------------------------- CLI dump */

if (cliPath) {
  const { Parser, getWasm } = await import('../vendor/blackbox-log.module.js');
  const which = +(process.argv[3] || 0);
  const parser = await Parser.init(await getWasm());
  const file = parser.loadFile(fs.readFileSync(cliPath));
  console.log(`${file.logCount} log(s) in file`);
  const h = file.parseHeaders(which);
  const s = readSettings(h);
  const t0 = performance.now();
  const log = extractLog(h, h.getDataParser(), s);
  const t1 = performance.now();
  const m = analyze(log);
  m.droppedFrames = log.droppedFrames;
  const t2 = performance.now();
  const { findings, cli } = buildFindings(m, s);
  console.log(`${s.firmware} ${s.board} | fs ${m.fs} Hz | ${m.durationS}s | flight ${m.flightFraction} | raw ${m.hasRaw} (mode ${m.debugModeRaw}, fields ${m.hasDebugFields}) | dropped ${log.droppedFrames}`);
  console.log(`extract ${(t1-t0).toFixed(0)} ms, analyze ${(t2-t1).toFixed(0)} ms`);
  console.log('pids', JSON.stringify(s.pids), 'filters', JSON.stringify(s.filters));
  for (const A of m.axes) console.log(A.name, 'peaks', JSON.stringify(A.peaks), 'step', A.step ? JSON.stringify(A.step.metrics)+' w='+A.step.windows+'/'+A.step.considered : null, 'noise', JSON.stringify(A.noise));
  console.log('motors', JSON.stringify(m.motors), 'batt', JSON.stringify(m.battery), 'pw', JSON.stringify(m.propwash));
  for (const f of findings) console.log(`[${f.sev}] ${f.title} — ${f.detail}${f.fix ? '\n    -> ' + f.fix.replace(/\n/g, ' | ') : ''}`);
  console.log('\n' + cli);
}
