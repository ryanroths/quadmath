// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim rates — Betaflight CLI parse + rates_type curves.
// Formulas follow Betaflight's public rc.c apply*Rates (written from scratch).
// Nothing here is copied from WebFPV.

export const RATE_AXES = Object.freeze(['roll', 'pitch', 'yaw']);

export const RATE_TYPES = Object.freeze([
  'BETAFLIGHT',
  'ACTUAL',
  'KISS',
  'QUICK',
  'RACEFLIGHT',
]);

export const RATE_TYPE_LABELS = Object.freeze({
  BETAFLIGHT: 'Betaflight',
  ACTUAL: 'Actual',
  KISS: 'KISS',
  QUICK: 'Quick',
  RACEFLIGHT: 'RaceFlight',
});

const TYPE_BY_NUM = Object.freeze({
  0: 'BETAFLIGHT',
  1: 'RACEFLIGHT',
  2: 'KISS',
  3: 'ACTUAL',
  4: 'QUICK',
});

const TYPE_ALIASES = Object.freeze({
  BETAFLIGHT: 'BETAFLIGHT',
  BF: 'BETAFLIGHT',
  RACEFLIGHT: 'RACEFLIGHT',
  RF: 'RACEFLIGHT',
  KISS: 'KISS',
  ACTUAL: 'ACTUAL',
  QUICK: 'QUICK',
  QUICKRATES: 'QUICK',
  QUICK_RATES: 'QUICK',
});

const RC_RATE_INCREMENTAL = 14.54;
export const SETPOINT_LIMIT = 1998;

export const RATE_FIELDS = Object.freeze({
  BETAFLIGHT: Object.freeze({
    rcRate: Object.freeze({ label: 'RC Rate', unit: '' }),
    srate: Object.freeze({ label: 'Super Rate', unit: '' }),
    expo: Object.freeze({ label: 'Expo', unit: '' }),
  }),
  ACTUAL: Object.freeze({
    rcRate: Object.freeze({ label: 'Center sensitivity', unit: '°/s' }),
    srate: Object.freeze({ label: 'Max rate', unit: '°/s' }),
    expo: Object.freeze({ label: 'Expo', unit: '' }),
  }),
  KISS: Object.freeze({
    rcRate: Object.freeze({ label: 'RC Rate', unit: '' }),
    srate: Object.freeze({ label: 'Rate', unit: '' }),
    expo: Object.freeze({ label: 'RC Curve', unit: '' }),
  }),
  QUICK: Object.freeze({
    rcRate: Object.freeze({ label: 'RC Rate', unit: '' }),
    srate: Object.freeze({ label: 'Max rate', unit: '°/s' }),
    expo: Object.freeze({ label: 'Expo', unit: '' }),
  }),
  RACEFLIGHT: Object.freeze({
    rcRate: Object.freeze({ label: 'Rate', unit: '' }),
    srate: Object.freeze({ label: 'Acro+', unit: '' }),
    expo: Object.freeze({ label: 'Expo', unit: '' }),
  }),
});

// Slider ranges in the sim's stored units (see scaleCliField).
export const RATE_SLIDER_RANGES = Object.freeze({
  BETAFLIGHT: Object.freeze({
    rcRate: Object.freeze({ min: 0.5, max: 2.5, step: 0.01 }),
    srate: Object.freeze({ min: 0, max: 0.95, step: 0.01 }),
    expo: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  }),
  ACTUAL: Object.freeze({
    rcRate: Object.freeze({ min: 1, max: 25, step: 0.1 }),
    srate: Object.freeze({ min: 5, max: 200, step: 0.5 }),
    expo: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  }),
  KISS: Object.freeze({
    rcRate: Object.freeze({ min: 0.5, max: 2.5, step: 0.01 }),
    srate: Object.freeze({ min: 0, max: 0.95, step: 0.01 }),
    expo: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  }),
  QUICK: Object.freeze({
    rcRate: Object.freeze({ min: 20, max: 255, step: 1 }),
    srate: Object.freeze({ min: 5, max: 200, step: 0.5 }),
    expo: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  }),
  RACEFLIGHT: Object.freeze({
    rcRate: Object.freeze({ min: 20, max: 255, step: 1 }),
    srate: Object.freeze({ min: 0, max: 0.99, step: 0.01 }),
    expo: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  }),
});

function power3(x) { return x * x * x; }
function power5(x) { return x * x * x * x * x; }
function constrain(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export function normalizeRateType(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(TYPE_BY_NUM, s)) return TYPE_BY_NUM[s];
  if (TYPE_ALIASES[s]) return TYPE_ALIASES[s];
  const compact = s.replace(/[\s-]+/g, '');
  if (TYPE_ALIASES[compact]) return TYPE_ALIASES[compact];
  return null;
}

export function isRateType(v) {
  return RATE_TYPES.indexOf(v) !== -1;
}

function emptyAxis() {
  return { roll: {}, pitch: {}, yaw: {} };
}

function guessTypeFromRcRates(values, fallback) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return fallback || 'BETAFLIGHT';
  const max = Math.max.apply(null, nums);
  // Actual CLI rc_rate is centre/10 (typically 5–20). Every other family
  // stores a much larger integer (Betaflight ~100, RaceFlight ~80, Quick ~160).
  if (max <= 25) return 'ACTUAL';
  return fallback || 'BETAFLIGHT';
}

function scaleCliField(type, field, cli) {
  if (!Number.isFinite(cli)) return undefined;
  if (field === 'expo') return cli / 100;
  if (type === 'ACTUAL' || type === 'QUICK') return cli;
  if (type === 'RACEFLIGHT') return field === 'rcRate' ? cli : cli / 100;
  return cli / 100;
}

function cliFromState(type, field, stored) {
  if (!Number.isFinite(stored)) return undefined;
  if (field === 'expo') return Math.round(stored * 100);
  if (type === 'ACTUAL' || type === 'QUICK') return stored;
  if (type === 'RACEFLIGHT') return field === 'rcRate' ? stored : Math.round(stored * 100);
  return Math.round(stored * 100);
}

const TOKEN_FIELDS = Object.freeze(['rcRate', 'srate', 'expo']);

function inSliderRange(type, field, stored) {
  const spec = RATE_SLIDER_RANGES[type] && RATE_SLIDER_RANGES[type][field];
  return !!(spec && Number.isFinite(stored) && stored >= spec.min && stored <= spec.max);
}

function storedFromCliAxis(type, rc, sr, ex) {
  const axis = {
    rcRate: scaleCliField(type, 'rcRate', rc),
    srate: scaleCliField(type, 'srate', sr),
    expo: scaleCliField(type, 'expo', ex),
  };
  if (!TOKEN_FIELDS.every((f) => inSliderRange(type, f, axis[f]))) return null;
  return axis;
}

function decodedFromCliAxes(type, roll, pitch, yaw) {
  const t = normalizeRateType(type);
  if (!isRateType(t)) return { error: 'unknown rates type' };
  const r = storedFromCliAxis(t, roll[0], roll[1], roll[2]);
  const p = storedFromCliAxis(t, pitch[0], pitch[1], pitch[2]);
  const y = storedFromCliAxis(t, yaw[0], yaw[1], yaw[2]);
  if (!r || !p || !y) return { error: 'rates token out of range' };
  return { type: t, roll: r, pitch: p, yaw: y };
}

// Slim published-card aliases for ?rates=card.<id>. CLI integers only. No catalog import.
export const RATE_CARDS = Object.freeze({
  '65-betafpv-stock': Object.freeze({
    type: 'ACTUAL',
    roll: Object.freeze([7, 58, 0]),
    pitch: Object.freeze([7, 58, 0]),
    yaw: Object.freeze([7, 50, 0]),
  }),
  '65-betafpv-ryfly-1219s': Object.freeze({
    type: 'ACTUAL',
    roll: Object.freeze([4, 74, 56]),
    pitch: Object.freeze([4, 74, 56]),
    yaw: Object.freeze([4, 70, 56]),
  }),
  '75-betafpv-ryfly-o4-gf1811': Object.freeze({
    type: 'ACTUAL',
    roll: Object.freeze([2, 73, 56]),
    pitch: Object.freeze([2, 73, 56]),
    yaw: Object.freeze([2, 70, 56]),
  }),
  '75-happymodel-aio-stock': Object.freeze({
    type: 'BETAFLIGHT',
    roll: Object.freeze([100, 70, 0]),
    pitch: Object.freeze([100, 70, 0]),
    yaw: Object.freeze([100, 70, 0]),
  }),
});

function decodeRateCard(raw) {
  const m = String(raw).trim().match(/^card\.(.+)$/i);
  if (!m) return null;
  const spec = RATE_CARDS[m[1]];
  if (!spec) return { error: 'unknown rates card' };
  const roll = spec.roll;
  const pitch = spec.pitch || roll;
  const yaw = spec.yaw || roll;
  return decodedFromCliAxes(spec.type, roll, pitch, yaw);
}

// Compact share token: TYPE.rollRc.rollSr.rollEx.pitchRc.pitchSr.pitchEx.yawRc.yawSr.yawEx
// Fields are CLI integers (expo always 0–100). Decode scales back to stored units.
// card.<id> aliases resolve through RATE_CARDS; encode always emits the TYPE token.
export function encodeRates(state) {
  if (!state) return null;
  const type = normalizeRateType(state.type);
  if (!isRateType(type)) return null;
  const parts = [type];
  for (const ax of RATE_AXES) {
    const a = state[ax];
    if (!a) return null;
    for (const field of TOKEN_FIELDS) {
      const cli = cliFromState(type, field, a[field]);
      if (!Number.isFinite(cli)) return null;
      parts.push(String(Math.round(cli)));
    }
  }
  return parts.join('.');
}

export function decodeRates(token) {
  if (token == null) return { error: 'missing rates token' };
  const raw = String(token).trim();
  if (!raw) return { error: 'missing rates token' };
  const card = decodeRateCard(raw);
  if (card) return card;
  const parts = raw.split('.');
  if (parts.length !== 10) return { error: 'rates token must be TYPE + 9 numbers' };
  const type = normalizeRateType(parts[0]);
  if (!isRateType(type)) return { error: 'unknown rates type' };
  const out = { type, roll: {}, pitch: {}, yaw: {} };
  let i = 1;
  for (const ax of RATE_AXES) {
    for (const field of TOKEN_FIELDS) {
      const cli = Number(parts[i++]);
      if (!Number.isFinite(cli)) return { error: 'rates token has a non-number' };
      const stored = scaleCliField(type, field, cli);
      if (!inSliderRange(type, field, stored)) return { error: 'rates token out of range' };
      out[ax][field] = stored;
    }
  }
  return out;
}

export function ratesDeepLink({ origin, map, track, mode, build, rates, threeD } = {}) {
  const base = origin || 'https://quadmath.com';
  const u = new URL('/sim.html', base.endsWith('/') ? base : base + '/');
  if (map) u.searchParams.set('map', String(map));
  if (track != null && track !== '') u.searchParams.set('track', String(track));
  if (mode) u.searchParams.set('mode', String(mode).toLowerCase());
  if (build) u.searchParams.set('build', String(build));
  if (threeD) u.searchParams.set('3d', '1');
  const token = typeof rates === 'string' ? rates : encodeRates(rates);
  if (token) u.searchParams.set('rates', token);
  return u.toString();
}

function applyScaledAxis(type, raw) {
  const out = {};
  if (raw.rc_rate !== undefined) out.rcRate = scaleCliField(type, 'rcRate', raw.rc_rate);
  if (raw.srate !== undefined) out.srate = scaleCliField(type, 'srate', raw.srate);
  if (raw.expo !== undefined) out.expo = scaleCliField(type, 'expo', raw.expo);
  return out;
}

function setAxisRaw(slot, axis, field, num) {
  if (!slot[axis]) slot[axis] = {};
  slot[axis][field] = num;
}

function setRollPitch(slot, field, num) {
  setAxisRaw(slot, 'roll', field, num);
  setAxisRaw(slot, 'pitch', field, num);
}

// Parse a Betaflight `diff all` / `dump` / partial `set` paste.
// Tracks `profile` / `rateprofile` sections and uses the restored (last)
// rateprofile index, which is how a full dump marks the active profile.
export function parseCli(text, currentType) {
  const out = {
    ratesType: null,
    rates: emptyAxis(),
    pids: {},
    idle: null,
    found: 0,
    activeRateProfile: null,
    activePidProfile: null,
    quickRatesRcExpo: null,
    error: null,
    warnings: [],
  };
  const raw = text == null ? '' : String(text);
  if (!raw.trim()) {
    out.error = 'Paste a Betaflight dump or diff all';
    return out;
  }

  function extractBareTriples(text) {
    const cleaned = String(text).replace(/(^|\s)(#|\/\/).*$/gm, '').trim();
    if (!cleaned) return null;
    const typeMatch = cleaned.match(/^(ACTUAL|BETAFLIGHT|BF|KISS|QUICK|QUICKRATES|RACEFLIGHT|RF)\b/i);
    const rest = typeMatch ? cleaned.slice(typeMatch[0].length) : cleaned;
    if (/[A-Za-z]/.test(rest)) return null;
    const nums = rest.split(/[^0-9.+-]+/).filter(Boolean).map(Number);
    if (!nums.length || nums.some((n) => !Number.isFinite(n))) return null;
    if (nums.length === 3) return { triples: [nums, nums.slice(), nums.slice()], typeHint: typeMatch && typeMatch[1] };
    if (nums.length === 9) {
      return {
        triples: [nums.slice(0, 3), nums.slice(3, 6), nums.slice(6, 9)],
        typeHint: typeMatch && typeMatch[1],
      };
    }
    return null;
  }

  const rateProfiles = {};
  let rateProf = 0;
  let lastRateProfCmd = null;
  const pidProfiles = {};
  let pidProf = 0;
  let lastPidProfCmd = null;
  let sawSet = false;

  const ensureRate = (idx) => {
    if (!rateProfiles[idx]) {
      rateProfiles[idx] = { ratesType: null, rates: emptyAxis(), quickRatesRcExpo: null, found: 0 };
    }
    return rateProfiles[idx];
  };
  const ensurePid = (idx) => {
    if (!pidProfiles[idx]) pidProfiles[idx] = {};
    return pidProfiles[idx];
  };

  for (let line of raw.split(/\r?\n/)) {
    line = line.replace(/(^|\s)(#|\/\/).*$/, '').trim();
    if (!line) continue;

    let m = line.match(/^rateprofile\s+(\d+)\s*$/i);
    if (m) {
      rateProf = parseInt(m[1], 10);
      lastRateProfCmd = rateProf;
      ensureRate(rateProf);
      continue;
    }
    m = line.match(/^profile\s+(\d+)\s*$/i);
    if (m) {
      pidProf = parseInt(m[1], 10);
      lastPidProfCmd = pidProf;
      ensurePid(pidProf);
      continue;
    }

    m = line.match(/^set\s+([A-Za-z0-9_]+)\s*=\s*"?\s*([^\s"#]+)\s*"?\s*$/i);
    if (!m) continue;
    sawSet = true;
    const key = m[1].toLowerCase();
    const cliVal = m[2];

    if (key === 'rates_type') {
      const t = normalizeRateType(cliVal);
      if (!t) {
        out.warnings.push('Unknown rates_type ' + cliVal);
        continue;
      }
      const slot = ensureRate(rateProf);
      slot.ratesType = t;
      slot.found++;
      out.found++;
      continue;
    }
    if (key === 'quick_rates_rc_expo') {
      const on = /^(1|on|true)$/i.test(cliVal);
      ensureRate(rateProf).quickRatesRcExpo = on;
      out.found++;
      continue;
    }

    const num = parseFloat(cliVal);
    if (!Number.isFinite(num)) continue;

    let mm = key.match(/^(roll|pitch|yaw)_(rc_rate|srate|expo|rate)$/);
    if (mm) {
      const axis = mm[1];
      const field = mm[2] === 'rate' ? 'srate' : mm[2];
      const slot = ensureRate(rateProf);
      setAxisRaw(slot.rates, axis, field, num);
      slot.found++;
      out.found++;
      continue;
    }
    if (key === 'rc_rate') {
      const slot = ensureRate(rateProf);
      setRollPitch(slot.rates, 'rc_rate', num);
      slot.found++;
      out.found++;
      continue;
    }
    if (key === 'rc_rate_yaw') {
      const slot = ensureRate(rateProf);
      setAxisRaw(slot.rates, 'yaw', 'rc_rate', num);
      slot.found++;
      out.found++;
      continue;
    }
    if (key === 'rc_expo') {
      const slot = ensureRate(rateProf);
      setRollPitch(slot.rates, 'expo', num);
      slot.found++;
      out.found++;
      continue;
    }
    if (key === 'rc_expo_yaw') {
      const slot = ensureRate(rateProf);
      setAxisRaw(slot.rates, 'yaw', 'expo', num);
      slot.found++;
      out.found++;
      continue;
    }

    mm = key.match(/^([pidf])_(roll|pitch|yaw)$/) || key.match(/^(roll|pitch|yaw)_([pidf])$/);
    if (mm) {
      const term = mm[1].length === 1 ? mm[1] : mm[2];
      const axis = mm[1].length === 1 ? mm[2] : mm[1];
      ensurePid(pidProf)[axis + term.toUpperCase()] = num;
      out.found++;
      continue;
    }
    if (key === 'dshot_idle_value') {
      out.idle = num / 10000;
      out.found++;
      continue;
    }
    if (key === 'motor_idle') {
      out.idle = num / 100;
      out.found++;
      continue;
    }
    if (key === 'idle_min_rpm') {
      // RPM target, not a throttle percent. 0 means "use dshot idle".
      // Applying num/100 zeroed idle on `set idle_min_rpm = 0`.
      if (num > 0) out.warnings.push('idle_min_rpm ignored — paste dshot_idle_value');
      out.found++;
      continue;
    }
  }

  if (!out.found && !sawSet) {
    const bare = extractBareTriples(raw);
    if (!bare) {
      out.error = 'No recognised CLI commands found';
      return out;
    }
    const hinted = normalizeRateType(bare.typeHint);
    if (bare.typeHint && !hinted) {
      out.error = 'Unknown rates_type ' + bare.typeHint;
      return out;
    }
    if (hinted) out.ratesType = hinted;
    RATE_AXES.forEach((ax, i) => {
      const t = bare.triples[i];
      setAxisRaw(out.rates, ax, 'rc_rate', t[0]);
      setAxisRaw(out.rates, ax, 'srate', t[1]);
      setAxisRaw(out.rates, ax, 'expo', t[2]);
    });
    out.found = 9;
  }

  const rateKeys = Object.keys(rateProfiles);
  let chosenIdx = lastRateProfCmd;
  if (chosenIdx == null || !rateProfiles[chosenIdx] || !rateProfiles[chosenIdx].found) {
    chosenIdx = null;
    let bestFound = -1;
    for (const k of rateKeys) {
      const slot = rateProfiles[k];
      if (slot.found > bestFound) {
        bestFound = slot.found;
        chosenIdx = +k;
      }
    }
  }
  const chosen = chosenIdx != null ? rateProfiles[chosenIdx] : null;
  if (chosen) {
    out.activeRateProfile = chosenIdx;
    out.ratesType = chosen.ratesType;
    out.quickRatesRcExpo = chosen.quickRatesRcExpo;
    out.rates = chosen.rates;
  }

  if (lastPidProfCmd != null && pidProfiles[lastPidProfCmd] && Object.keys(pidProfiles[lastPidProfCmd]).length) {
    out.activePidProfile = lastPidProfCmd;
    out.pids = pidProfiles[lastPidProfCmd];
  } else {
    let pick = lastPidProfCmd;
    let n = -1;
    for (const k of Object.keys(pidProfiles)) {
      const c = Object.keys(pidProfiles[k]).length;
      if (c > n) { n = c; pick = +k; }
    }
    if (pick != null && n > 0) {
      out.activePidProfile = pick;
      out.pids = pidProfiles[pick];
    }
  }

  const current = normalizeRateType(currentType) || 'BETAFLIGHT';
  const sampled = [];
  for (const ax of RATE_AXES) {
    const r = out.rates[ax] || {};
    if (r.rc_rate !== undefined) sampled.push(r.rc_rate);
  }
  const type = out.ratesType || guessTypeFromRcRates(sampled, current);
  if (!out.ratesType && sampled.length) {
    out.ratesType = type;
    if (type !== current) {
      out.warnings.push('No rates_type in dump — inferred ' + type);
    }
  } else if (out.ratesType) {
    // keep parsed type
  } else {
    out.ratesType = type;
  }

  if (out.ratesType && !isRateType(out.ratesType)) {
    out.error = out.ratesType + ' rates not supported';
    return out;
  }

  for (const ax of RATE_AXES) {
    out.rates[ax] = applyScaledAxis(out.ratesType || current, out.rates[ax] || {});
  }

  if (!out.found) {
    out.error = 'No recognised CLI commands found';
  }
  return out;
}

export function bfCurve(x, rcRate, srate, expo) {
  const absX = Math.abs(x);
  if (expo) x = x * power3(absX) * expo + x * (1 - expo);
  let rr = rcRate;
  if (rr > 2.0) rr += RC_RATE_INCREMENTAL * (rr - 2.0);
  let rate = 200 * rr * x;
  if (srate > 0) rate *= 1 / constrain(1 - absX * srate, 0.01, 1);
  return rate;
}

export function actualRate(x, center, maxRate, expo) {
  const absX = Math.abs(x);
  const blend = absX * (power5(x) * expo + x * (1 - expo));
  const stickMovement = Math.max(0, maxRate - center);
  return x * center + stickMovement * blend;
}

export function kissRate(x, rcRate, srate, expo) {
  const absX = Math.abs(x);
  const rcCli = rcRate * 100;
  const kissRpyUseRates = 1 / constrain(1 - absX * srate, 0.01, 1);
  const kissRcCommandf = (power3(x) * expo + x * (1 - expo)) * (rcCli / 1000);
  return constrain(2000 * kissRpyUseRates * kissRcCommandf, -SETPOINT_LIMIT, SETPOINT_LIMIT);
}

export function raceFlightRate(x, rcRate, srate, expo) {
  const absX = Math.abs(x);
  const expoCli = expo * 100;
  const curved = (1.0 + 0.01 * expoCli * (x * x - 1.0)) * x;
  let angleRate = 10.0 * rcRate * curved;
  angleRate = angleRate * (1 + absX * srate);
  return angleRate;
}

export function quickRate(x, rcRate, srate, expo, quickRcExpo) {
  const absX = Math.abs(x);
  const rcDps = rcRate * 2;
  const maxDPS = Math.max(srate * 10, rcDps);
  const superFactorConfig = ((maxDPS / rcDps) - 1) / (maxDPS / rcDps);
  let curve, superFactor, angleRate;
  if (quickRcExpo) {
    curve = power3(x) * expo + x * (1 - expo);
    superFactor = 1 / constrain(1 - absX * superFactorConfig, 0.01, 1);
    angleRate = constrain(curve * rcDps * superFactor, -SETPOINT_LIMIT, SETPOINT_LIMIT);
  } else {
    curve = power3(absX) * expo + absX * (1 - expo);
    superFactor = 1 / constrain(1 - curve * superFactorConfig, 0.01, 1);
    angleRate = constrain(x * rcDps * superFactor, -SETPOINT_LIMIT, SETPOINT_LIMIT);
  }
  return angleRate;
}

export function rateSetpoint(type, x, axis, opts) {
  const a = axis || {};
  const rc = a.rcRate, sr = a.srate, ex = a.expo || 0;
  const t = normalizeRateType(type) || 'BETAFLIGHT';
  let y;
  if (t === 'ACTUAL') y = actualRate(x, rc * 10, sr * 10, ex);
  else if (t === 'KISS') y = kissRate(x, rc, sr, ex);
  else if (t === 'RACEFLIGHT') y = raceFlightRate(x, rc, sr, ex);
  else if (t === 'QUICK') y = quickRate(x, rc, sr, ex, !!(opts && opts.quickRatesRcExpo));
  else y = bfCurve(x, rc, sr, ex);
  return constrain(y, -SETPOINT_LIMIT, SETPOINT_LIMIT);
}

export function maxRateDps(type, axis, opts) {
  return Math.abs(rateSetpoint(type, 1, axis, opts));
}

export function centerSensitivityDps(type, axis, opts) {
  const d = 0.001;
  return Math.abs(rateSetpoint(type, d, axis, opts)) / d;
}

function fromCenterMax(toType, center, max, expo) {
  const C = Math.max(1, center);
  const M = Math.max(C, max);
  const t = normalizeRateType(toType) || 'BETAFLIGHT';
  if (t === 'ACTUAL') {
    return { rcRate: C / 10, srate: M / 10, expo };
  }
  if (t === 'RACEFLIGHT') {
    // Acro+ only stretches to ~2× centre, so a high Betaflight super-rate
    // cannot keep both endpoints. Prefer matching max rate.
    let acro = M / C - 1;
    let rc = C / 10;
    if (acro > 0.99) {
      acro = 0.99;
      rc = M / (10 * (1 + acro));
    }
    return {
      rcRate: constrain(rc, 1, 255),
      srate: constrain(acro, 0, 0.99),
      expo,
    };
  }
  if (t === 'QUICK') {
    return {
      rcRate: constrain(C / 2, 1, 255),
      srate: M / 10,
      expo,
    };
  }
  // BETAFLIGHT and KISS share stored units: rcRate CLI/100, srate CLI/100.
  let rc = C / 200;
  if (rc > 2) {
    // invert rr + 14.54*(rr-2) = C/200
    rc = (C / 200 + RC_RATE_INCREMENTAL * 2) / (1 + RC_RATE_INCREMENTAL);
  }
  return {
    rcRate: constrain(rc, 0.01, 2.55),
    srate: constrain(1 - C / M, 0, 0.99),
    expo,
  };
}

export function convertAxisFamily(cur, fromType, toType) {
  const from = normalizeRateType(fromType) || 'BETAFLIGHT';
  const to = normalizeRateType(toType) || 'BETAFLIGHT';
  const src = {
    rcRate: cur.rcRate,
    srate: cur.srate,
    expo: cur.expo || 0,
  };
  if (from === to) return src;
  const center = centerSensitivityDps(from, src);
  const max = maxRateDps(from, src);
  return fromCenterMax(to, center, max, src.expo);
}

export function formatAxisReadout(type, axis, field) {
  const t = normalizeRateType(type) || 'BETAFLIGHT';
  const a = axis || {};
  const v = a[field];
  if (!Number.isFinite(v)) return '—';
  if (t === 'ACTUAL' && (field === 'rcRate' || field === 'srate')) {
    return (v * 10).toFixed(0) + ' °/s';
  }
  if (t === 'QUICK' && field === 'srate') {
    return (v * 10).toFixed(0) + ' °/s';
  }
  if (t === 'QUICK' && field === 'rcRate') return v.toFixed(0);
  if (t === 'RACEFLIGHT' && field === 'rcRate') return v.toFixed(0);
  if (t === 'RACEFLIGHT' && field === 'srate') return v.toFixed(2);
  if (field === 'expo') return v.toFixed(2);
  return v.toFixed(2);
}

export function formatCliSummary(parsed, applied) {
  if (!parsed) return '';
  if (parsed.error) return parsed.error;
  const type = (applied && applied.type) || parsed.ratesType || 'BETAFLIGHT';
  const label = RATE_TYPE_LABELS[type] || type;
  const lines = [];
  const prof = parsed.activeRateProfile;
  lines.push('Imported ' + label + ' rates' + (prof != null ? ' (rateprofile ' + prof + ')' : ''));
  const rates = (applied && applied.roll) ? applied : { roll: parsed.rates.roll, pitch: parsed.rates.pitch, yaw: parsed.rates.yaw };
  for (const ax of RATE_AXES) {
    const a = rates[ax] || {};
    const keys = Object.keys(parsed.rates[ax] || {});
    if (!keys.length && !applied) continue;
    const max = Number.isFinite(a.rcRate) ? maxRateDps(type, a).toFixed(0) : '—';
    lines.push(
      ax.charAt(0).toUpperCase() + ax.slice(1) +
      '  ' + RATE_FIELDS[type].rcRate.label + ' ' + formatAxisReadout(type, a, 'rcRate') +
      '  ' + RATE_FIELDS[type].srate.label + ' ' + formatAxisReadout(type, a, 'srate') +
      '  expo ' + formatAxisReadout(type, a, 'expo') +
      '  (max ' + max + '°/s)'
    );
  }
  if (parsed.warnings && parsed.warnings.length) {
    lines.push(parsed.warnings.join(' · '));
  }
  return lines.join('\n');
}

export function drawRateCurve(canvas, type, axis, opts) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8,9,12,0.9)';
  ctx.fillRect(0, 0, w, h);
  const padL = 28, padR = 8, padT = 8, padB = 16;
  const iw = w - padL - padR, ih = h - padT - padB;
  const max = Math.max(50, maxRateDps(type, axis, opts));
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + ih);
  ctx.lineTo(padL + iw, padT + ih);
  ctx.stroke();
  ctx.beginPath();
  const midX = padL + iw / 2;
  ctx.moveTo(midX, padT);
  ctx.lineTo(midX, padT + ih);
  ctx.stroke();
  ctx.strokeStyle = '#3DDC97';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const x = -1 + (2 * i) / 48;
    const y = rateSetpoint(type, x, axis, opts);
    const px = padL + ((x + 1) / 2) * iw;
    const py = padT + ih - ((y + max) / (2 * max)) * ih;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = '#7A7F8C';
  ctx.font = '10px ui-monospace, JetBrains Mono, monospace';
  ctx.fillText(Math.round(max) + '°/s', 4, padT + 10);
  ctx.fillText('-1', padL, h - 4);
  ctx.fillText('1', w - 12, h - 4);
}

export { cliFromState, scaleCliField, guessTypeFromRcRates };
