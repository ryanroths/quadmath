/* Turns one parsed blackbox log (blackbox-log WASM headers + data parser)
   into the flat typed-array record blackbox-metrics.js consumes, plus the
   tune/filter settings the rules layer reasons about. Shared by the worker
   and the Node test harness, so it must not touch the DOM. */

'use strict';

const AXIS = 3;

function num(v, d = null) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function list(v) { return v == null ? null : String(v).split(',').map(x => num(x.trim())); }

/* Every Betaflight setting we care about lives in the header block. The
   wrapper exposes recognised ones as properties and the rest under
   `unknown`, which for tuning purposes is where all the good stuff is. */
export function readSettings(headers) {
  const u = headers.unknown;
  const g = k => (u.has(k) ? u.get(k) : undefined);
  const pid = k => { const l = list(g(k)); return l ? { p: l[0], i: l[1], d: l[2], f: l[3] ?? null } : null; };
  const fw = headers.firmwareVersion;
  const ver = fw ? `${fw.major}.${fw.minor}.${fw.patch}` : '';
  const major = fw ? fw.major + fw.minor / 10 : 0;
  const has = k => u.has(k);
  return {
    firmware: headers.firmwareRevision, version: ver, versionNum: major,
    board: headers.boardInfo || '', craft: headers.craftName || '',
    debugMode: headers.debugMode, pwmProtocol: headers.pwmProtocol,
    looptimeUs: num(g('looptime')), pidDenom: num(g('pid_process_denom'), 1),
    pInterval: num(g('P interval')), pRatio: num(g('P ratio')),
    pids: { roll: pid('rollPID'), pitch: pid('pitchPID'), yaw: pid('yawPID') },
    ff: list(g('feedforward_weight')) || list(g('ff_weight')),
    dMin: list(g('d_min')) || list(g('d_max')),
    dMax: list(g('d_max')),
    filters: {
      gyroLpf1: num(g('gyro_lpf1_static_hz')) ?? num(g('gyro_lowpass_hz')),
      gyroLpf1Dyn: list(g('gyro_lpf1_dyn_hz')) || list(g('gyro_lowpass_dyn_hz')),
      gyroLpf2: num(g('gyro_lpf2_static_hz')) ?? num(g('gyro_lowpass2_hz')),
      dtermLpf1: num(g('dterm_lpf1_static_hz')) ?? num(g('dterm_lowpass_hz')),
      dtermLpf1Dyn: list(g('dterm_lpf1_dyn_hz')) || list(g('dterm_lowpass_dyn_hz')),
      dtermLpf2: num(g('dterm_lpf2_static_hz')) ?? num(g('dterm_lowpass2_hz')),
      dynNotchCount: num(g('dyn_notch_count')),
      dynNotchMin: num(g('dyn_notch_min_hz')), dynNotchMax: num(g('dyn_notch_max_hz')), dynNotchQ: num(g('dyn_notch_q')),
      rpmHarmonics: num(g('gyro_rpm_notch_harmonics')) ?? num(g('rpm_filter_harmonics')),
      bidir: num(g('dshot_bidir')),
      gyroNotch: list(g('gyro_notch_hz')),
    },
    // Parameter names changed in 4.3; emit the CLI names the log itself uses
    // so a pasted diff is right for that firmware.
    cliNames: has('gyro_lpf1_static_hz') || major >= 4.3 ? {
      gyroLpf1: 'gyro_lpf1_static_hz', gyroLpf1Dyn: ['gyro_lpf1_dyn_min_hz', 'gyro_lpf1_dyn_max_hz'],
      dtermLpf1: 'dterm_lpf1_static_hz', dtermLpf1Dyn: ['dterm_lpf1_dyn_min_hz', 'dterm_lpf1_dyn_max_hz'],
      gyroLpf2: 'gyro_lpf2_static_hz', dtermLpf2: 'dterm_lpf2_static_hz', rpm: 'rpm_filter_harmonics',
      ff: ['feedforward_roll', 'feedforward_pitch', 'feedforward_yaw'],
    } : {
      gyroLpf1: 'gyro_lowpass_hz', gyroLpf1Dyn: ['dyn_lpf_gyro_min_hz', 'dyn_lpf_gyro_max_hz'],
      dtermLpf1: 'dterm_lowpass_hz', dtermLpf1Dyn: ['dyn_lpf_dterm_min_hz', 'dyn_lpf_dterm_max_hz'],
      gyroLpf2: 'gyro_lowpass2_hz', dtermLpf2: 'dterm_lowpass2_hz', rpm: 'gyro_rpm_notch_harmonics',
      ff: ['feedforward_weight'],
    },
    motorOutput: list(g('motorOutput')),
    minthrottle: num(g('minthrottle')), maxthrottle: num(g('maxthrottle')),
    dynIdle: num(g('dyn_idle_min_rpm')) ?? num(g('dshot_idle_value')),
    simplifiedTuning: { master: num(g('simplified_master_multiplier')), dGain: num(g('simplified_d_gain')), pi: num(g('simplified_pi_gain')) },
    raw: Object.fromEntries(u.entries()),
  };
}

/* Walk every main frame once into typed arrays. Frames are assumed close to
   uniform in time; fs is measured from the timestamps rather than trusted
   from the headers, and dropped-frame gaps are reported, not patched. */
export function extractLog(headers, dataParser, settings) {
  const def = dataParser.mainFrameDef;
  const keys = [...def.keys()];
  const idx = {};
  keys.forEach((k, i) => { idx[k] = i; });
  const want = n => idx[n] !== undefined;

  const frames = [];
  for (const ev of dataParser) if (ev.kind === 'main') frames.push(ev.data);
  const n = frames.length;
  if (n < 64) throw new Error('Log has fewer than 64 main frames');

  const t = new Float64Array(n);
  const mk = () => new Float64Array(n);
  const gyro = [mk(), mk(), mk()], setpoint = [mk(), mk(), mk()];
  const pidP = [mk(), mk(), mk()], pidI = [mk(), mk(), mk()], pidF = [mk(), mk(), mk()];
  const pidD = [want('axisD[0]') ? mk() : null, want('axisD[1]') ? mk() : null, want('axisD[2]') ? mk() : null];
  const throttle = mk();
  const motorCount = [0, 1, 2, 3, 4, 5, 6, 7].filter(m => want(`motor[${m}]`)).length;
  const motors = Array.from({ length: motorCount }, mk);
  const vbat = want('vbatLatest') ? mk() : null;
  const amps = want('amperageLatest') ? mk() : null;
  const debug = [0, 1, 2, 3].map(d => (want(`debug[${d}]`) ? mk() : null));
  // GYRO_SCALED debug mode logs the pre-filter gyro in debug[0..2]. That is
  // the only way to see what the filters are removing.
  const rawMode = /GYRO_SCALED|GYRO_RAW/i.test(settings.debugMode || '');
  const gyroRaw = rawMode && debug[0] && debug[1] && debug[2] ? [mk(), mk(), mk()] : null;

  for (let i = 0; i < n; i++) {
    const f = frames[i].fields;
    t[i] = frames[i].time;
    for (let a = 0; a < AXIS; a++) {
      gyro[a][i] = f.get(`gyroADC[${a}]`) || 0;
      setpoint[a][i] = f.get(`setpoint[${a}]`) || 0;
      pidP[a][i] = f.get(`axisP[${a}]`) || 0;
      pidI[a][i] = f.get(`axisI[${a}]`) || 0;
      pidF[a][i] = f.get(`axisF[${a}]`) || 0;
      if (pidD[a]) pidD[a][i] = f.get(`axisD[${a}]`) || 0;
    }
    const rc3 = f.get('rcCommand[3]');
    throttle[i] = rc3 == null ? 0 : Math.min(1, Math.max(0, (rc3 - 1000) / 1000));
    for (let m = 0; m < motorCount; m++) {
      // A corrupt frame can decode as a huge unsigned value; hold the last
      // good sample rather than let one garbage point define the range.
      const v = f.get(`motor[${m}]`);
      motors[m][i] = (v == null || v < 0 || v > 4000) ? (i ? motors[m][i - 1] : 0) : v;
    }
    if (vbat) vbat[i] = (f.get('vbatLatest') || 0) / 100;
    if (amps) amps[i] = (f.get('amperageLatest') || 0) / 100;
    if (gyroRaw) for (let a = 0; a < AXIS; a++) gyroRaw[a][i] = f.get(`debug[${a}]`) || 0;
  }

  // Sample rate from the median frame gap; gaps > 3x median are dropouts.
  const gaps = new Float64Array(n - 1);
  for (let i = 1; i < n; i++) gaps[i - 1] = t[i] - t[i - 1];
  const sorted = Float64Array.from(gaps).sort();
  const dt = sorted[sorted.length >> 1] || 1e-3;
  const fs = 1 / dt;
  let dropped = 0;
  for (let i = 0; i < gaps.length; i++) if (gaps[i] > 3 * dt) dropped += Math.round(gaps[i] / dt) - 1;

  // Motor value range. DShot logs run 0..2000-ish, PWM logs 1000..2000; the
  // header says which when present, else infer from the data.
  let motorRange;
  if (settings.motorOutput && settings.motorOutput.length === 2) motorRange = settings.motorOutput;
  else {
    let mn = Infinity, mx = -Infinity;
    for (const m of motors) for (let i = 0; i < n; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i]; }
    motorRange = mn < 900 ? [0, Math.max(mx, 2000)] : [1000, 2000];
  }

  return { fs, n, t, gyro, gyroRaw, setpoint, pidP, pidI, pidD, pidF, throttle, motors, vbat, amps, motorRange, droppedFrames: dropped, durationS: t[n - 1] - t[0] };
}

/* Down-sample the time series for the charts. The analysis runs on the full
   arrays in the worker; the page only needs ~4k points per trace. */
export function decimate(arr, maxPoints = 4000) {
  const n = arr.length;
  if (n <= maxPoints) return Float32Array.from(arr);
  const step = n / maxPoints;
  const out = new Float32Array(maxPoints);
  for (let i = 0; i < maxPoints; i++) out[i] = arr[Math.floor(i * step)];
  return out;
}

/* Min/max envelope decimation for gyro traces, so a 20 kHz spike survives
   the plot instead of aliasing away. Bucketing matches decimate() exactly so
   the two line up index-for-index. Returns { lo, hi } Float32Arrays. */
export function envelope(arr, maxPoints = 2000) {
  const n = arr.length;
  if (n <= maxPoints) { const c = Float32Array.from(arr); return { lo: c, hi: Float32Array.from(c) }; }
  const step = n / maxPoints;
  const lo = new Float32Array(maxPoints), hi = new Float32Array(maxPoints);
  for (let i = 0; i < maxPoints; i++) {
    const s0 = Math.floor(i * step), s1 = Math.max(s0 + 1, Math.floor((i + 1) * step));
    let a = Infinity, b = -Infinity;
    for (let j = s0; j < Math.min(n, s1); j++) { if (arr[j] < a) a = arr[j]; if (arr[j] > b) b = arr[j]; }
    lo[i] = a; hi[i] = b;
  }
  return { lo, hi };
}
