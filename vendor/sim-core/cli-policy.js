// Which diff lines sim-core sends to Betaflight's CLI, and which it rejects
// with a reason. Nothing is dropped silently: every line gets a verdict, and
// sim-core.js checks what Betaflight could still alter: each set against
// Betaflight's echo and again after the saved image boots, aux slots against
// Betaflight's resolved slot, and features after boot.
//
// Verdicts: 'apply' (sent to the CLI), 'rejected' (with msg), 'comment'.
//
// This file is part of quadmath-sim-core, GPL-3.0-or-later. See LICENSE.

const APPLY = new Set(['set', 'get', 'profile', 'rateprofile', 'feature', 'aux', 'map', 'mixer', 'adjrange', 'diff', 'dump', 'beeper']);

const REJECT_COMMAND = new Map([
  ['resource', 'no pins in the sim'],
  ['timer', 'no timers in the sim'],
  ['dma', 'no DMA in the sim'],
  ['serial', 'no UARTs in the sim'],
  ['serialpassthrough', 'no UARTs in the sim'],
  ['beacon', 'the DShot beacon plays ESC tones, which the plant does not model; off, Betaflight\'s default'],
  ['led', 'no LED strip'],
  ['color', 'no LED strip'],
  ['mode_color', 'no LED strip'],
  ['vtx', 'no VTX'],
  ['vtxtable', 'no VTX'],
  ['vtx_info', 'no VTX'],
  ['smix', 'servos are not simulated'],
  ['servo', 'servos are not simulated'],
  ['mmix', 'custom motor mixes are not simulated (the plant is quad-X)'],
  ['bl', 'no bootloader'],
  ['dfu', 'no bootloader'],
  ['exit', 'exit reboots without saving; sim-core saves at the end of the diff'],
  ['reboot', 'sim-core reboots itself after saving'],
  ['batch', 'sim-core applies lines one by one; a batch error would block save'],
  ['board_name', 'board identity is the sim target'],
  ['manufacturer_id', 'board identity is the sim target'],
  ['signature', 'board identity is the sim target'],
  ['flash_erase', 'no flash'],
  ['flash_info', 'no flash'],
  ['flash_read', 'no flash'],
  ['flash_write', 'no flash'],
]);

// Settings that describe the physical board, not the tune. The sim's sensors
// are already in the body frame and its ADC uses Betaflight's defaults.
// TODO(M2): generate the complete HARDWARE_VALUE list from cli/settings.c.
const REJECT_SET = new Map([
  ['vbat_scale', 'board ADC calibration; the sim ADC uses Betaflight defaults'],
  ['vbat_divider', 'board ADC calibration; the sim ADC uses Betaflight defaults'],
  ['vbat_multiplier', 'board ADC calibration; the sim ADC uses Betaflight defaults'],
  ['ibata_scale', 'board current-sensor calibration; the sim ADC uses Betaflight defaults'],
  ['ibata_offset', 'board current-sensor calibration; the sim ADC uses Betaflight defaults'],
  ['battery_meter', 'the sim measures the battery through its ADC'],
  ['current_meter', 'the sim measures current through its ADC'],
  ['align_board_roll', 'sensor mounting; sim sensors are in the body frame'],
  ['align_board_pitch', 'sensor mounting; sim sensors are in the body frame'],
  ['align_board_yaw', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_1_sensor_align', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_1_align_roll', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_1_align_pitch', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_1_align_yaw', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_2_sensor_align', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_2_align_roll', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_2_align_pitch', 'sensor mounting; sim sensors are in the body frame'],
  ['gyro_2_align_yaw', 'sensor mounting; sim sensors are in the body frame'],
  ['acc_calibration', 'accelerometer calibration of a real board'],
  ['acc_trim_pitch', 'accelerometer trim of a real board'],
  ['acc_trim_roll', 'accelerometer trim of a real board'],
]);

// Features that mean something in the sim. Everything else is a peripheral
// the build does not have; Betaflight would clear it at save without a word
// (config/config.c validateAndFixConfig), so it is rejected here instead.
export const FEATURES_APPLIED = new Set(['AIRMODE', 'ANTI_GRAVITY', 'MOTOR_STOP', '3D']);

// Aux channels sim-core.input() can drive: AUX1..AUX12 (indices 0..11).
export const AUX_CHANNELS = 12;

export function classifyLine(rawText, { loopHz = 1000 } = {}) {
  const text = String(rawText).replace(/\r$/, '');
  const full = text.trim();
  if (full === '') {
    return { status: 'comment' };
  }
  // Betaflight cuts a line at its first '#' and drops trailing spaces before
  // parsing it (cli/cli.c processCharacter). sim-core sends only that part,
  // so the checks below apply to it. In the comment only a control character
  // matters: DEL edits the line and CR ends it early, so what follows would
  // run (a whole diff saved with CR-only line endings reads as one line).
  const cut = full.indexOf('#');
  const trimmed = cut < 0 ? full : full.slice(0, cut).trimEnd();
  if (cut >= 0 && /[\x00-\x1f\x7f]/.test(full.slice(cut))) {
    const why = full.includes('\r') ? 'a CR inside the line (CR-only line endings?)' : 'a control character in the comment';
    return { status: 'rejected', msg: `${why}: Betaflight would edit or end the line there` };
  }
  if (cut === 0) {
    return { status: 'comment' };
  }
  if (trimmed.length > 255) {
    return { status: 'rejected', msg: 'longer than 255 characters (Betaflight CLI buffer)' };
  }
  if (/[^\x20-\x7e]/.test(trimmed)) {
    return { status: 'rejected', msg: 'non-printable character (Betaflight would drop it silently)' };
  }
  if (trimmed.includes('?')) {
    return { status: 'rejected', msg: "'?' is CLI completion, not a value" };
  }
  const words = trimmed.split(/\s+/);
  const command = words[0].toLowerCase();

  if (command === 'save') {
    return { status: 'comment', msg: 'sim-core saves once, after the whole diff' };
  }
  if (command === 'defaults') {
    return /\bnosave\b/.test(trimmed)
      ? { status: 'apply', line: trimmed }
      : { status: 'rejected', msg: "only 'defaults nosave' is applied; plain defaults reboots" };
  }
  if (REJECT_COMMAND.has(command)) {
    return { status: 'rejected', msg: REJECT_COMMAND.get(command) };
  }
  if (!APPLY.has(command)) {
    return { status: 'rejected', msg: `'${command}' is not a config command sim-core applies` };
  }

  if (command === 'set') {
    if (!trimmed.includes('=')) {
      // Without '=', cliSet falls through to get (cli/cli.c) and sets nothing.
      return { status: 'rejected', msg: "'set' without '=' only prints values; nothing to apply" };
    }
    const m = trimmed.match(/^set\s+([a-z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) {
      return { status: 'apply', line: trimmed };  // not a setting name: Betaflight reports INVALID NAME
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (REJECT_SET.has(key)) {
      return { status: 'rejected', msg: REJECT_SET.get(key) };
    }
    if (key === 'motor_pwm_protocol' && !/^dshot/i.test(value)) {
      return { status: 'rejected', msg: 'sim-core needs a DShot protocol (digital idle, telemetry, one PID per gyro sample)' };
    }
    if (key === 'pid_process_denom' && value !== '1') {
      return { status: 'rejected', msg: 'the sim runs the PID every gyro sample (pid_process_denom 1)' };
    }
    if (key.startsWith('dyn_notch_') && loopHz < 2000) {
      return { status: 'apply', line: trimmed, set: { key, value }, note: `dynamic notch is inactive below a 2 kHz loop; this build runs ${loopHz} Hz (flight/dyn_notch_filter.c)` };
    }
    return { status: 'apply', line: trimmed, set: { key, value } };
  }
  if (command === 'feature') {
    if (words.length < 2) {
      return { status: 'apply', line: trimmed };  // lists features
    }
    const name = words[1].replace(/^-/, '').toUpperCase();
    if (!FEATURES_APPLIED.has(name)) {
      return { status: 'rejected', msg: `feature ${name} is not simulated (sim-core applies ${[...FEATURES_APPLIED].join(', ')})` };
    }
    return { status: 'apply', line: trimmed, feature: { name, enable: !words[1].startsWith('-') } };
  }
  if (command === 'aux' && words.length >= 6) {
    const [index, boxId, channel] = words.slice(1, 4).map(Number);
    if (!Number.isInteger(channel) || channel < 0 || channel >= AUX_CHANNELS) {
      return { status: 'rejected', msg: `aux channel ${words[3]} is outside AUX1-AUX${AUX_CHANNELS}, which sim-core drives` };
    }
    // logic and linkedTo are optional; Betaflight's own defaults are 0 and 0.
    const [logic = 0, linkedTo = 0] = words.slice(6, 8).map(Number);
    return { status: 'apply', line: trimmed, aux: { index, boxId, channel, logic, linkedTo } };
  }
  if (command === 'mixer') {
    const mode = words[1];
    if (mode && mode.toUpperCase() !== 'QUADX') {
      return { status: 'rejected', msg: 'the plant is quad-X' };
    }
  }
  return { status: 'apply', line: trimmed };
}

// ARM, ANGLE, HORIZON, FLIP OVER AFTER CRASH (permanent ids 0, 1, 2, 35) on
// AUX1..AUX4, each active at 1700..2100. Slots are chosen by the caller.
export const DEFAULT_AUX = Object.freeze([
  { boxId: 0, channel: 0 },
  { boxId: 1, channel: 1 },
  { boxId: 2, channel: 2 },
  { boxId: 35, channel: 3 },
]);

export function auxLine(index, boxId, channel, low = 1700, high = 2100) {
  return `aux ${index} ${boxId} ${channel} ${low} ${high} 0 0`;
}

// Betaflight prints a slot as "aux index box channel low high logic linkedTo"
// (cli/cli.c printAux).
export function parseAuxOutput(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.trim().match(/^aux\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+)\s+(\d+))?/);
    if (m) {
      out.push({
        index: +m[1], boxId: +m[2], channel: +m[3], low: +m[4], high: +m[5],
        logic: m[6] === undefined ? 0 : +m[6], linkedTo: m[7] === undefined ? 0 : +m[7],
      });
    }
  }
  return out;
}

// Betaflight prints the map as 8 letters, one per raw channel 1..8, naming
// the function that raw channel carries (A, E, R, T, 1..4).
export function parseMapOutput(text) {
  const m = String(text).match(/map\s+([AETR1-4]{8})/);
  if (!m) return null;
  const letters = m[1];
  return [...'AERT1234'].every((c) => letters.includes(c)) ? letters : null;
}

// After a set, Betaflight prints "<name> set to <value>" with what it stored
// (cli/cli.c cliSet).
export function parseSetEcho(text, key) {
  for (const line of String(text).split('\n')) {
    const m = line.trim().match(/^([a-z0-9_]+) set to (.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  return undefined;
}

// Whether Betaflight stored what a set line asked for. cliSet parses numbers
// with atoi/strtol, so an empty or malformed value can store 0 or a prefix
// without an error. Numbers compare as numbers (054 is 54), lookup names
// without case, arrays element by element; '-' is Betaflight's empty string.
export function sameSettingValue(asked, stored) {
  const norm = (v) => (String(v).trim() === '-' ? [''] : String(v).trim().split(',').map((x) => x.trim())
    .map((x) => (/^[+-]?\d+(\.\d+)?$/.test(x) ? String(Number(x)) : x.toUpperCase())));
  const a = norm(asked);
  const b = norm(stored);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// `get x` prints every setting whose name contains x (any case), each as
// "name = value", then "profile N" or "rateprofile N" for a profile or rate
// profile setting, then its range and default (cli/cli.c cliGet). Returns
// the exact name's value and scope: 'master', 'profile' or 'rateprofile'
// with its index. undefined if Betaflight has no such setting.
export function parseGetEntry(text, key) {
  const lines = String(text).split('\n').map((l) => l.trim());
  const name = String(key).toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([a-z0-9_]+) = (.*)$/);
    if (!m || m[1] !== name) continue;
    const s = (lines[i + 1] || '').match(/^(profile|rateprofile) (\d+)$/);
    return { value: m[2].trim(), scope: s ? s[1] : 'master', index: s ? +s[2] : undefined };
  }
  return undefined;
}

export function parseGetOutput(text, key) {
  const entry = parseGetEntry(text, key);
  return entry && entry.value;
}

export function parseFeatureOutput(text) {
  const m = String(text).match(/Enabled:\s*([^\n]*)/);
  return new Set(m ? m[1].trim().split(/\s+/).filter(Boolean) : []);
}
