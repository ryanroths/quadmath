// quadmath-sim-core JS API. The only module the quadmath sim imports.
//
// Two instance roles, both fresh instances of the same compiled module:
//   config instance: boots, enters Betaflight's CLI, applies a diff line by
//     line, saves, and yields the EEPROM image. It never flies.
//   flight instance: boots from that EEPROM image (CLI never entered, so
//     arming is not blocked) and runs the fixed tick.
// Every reinit is a new WebAssembly.Instance; nothing reuses a flown instance.
// A third role, the probe instance, draws rate curves (rateCurve).
//
// Physics never sees frame time: advance() turns frame time into whole ticks
// and lerpState() interpolates for render. No rate, PID or filter math lives
// here; Betaflight owns all of it.
//
// The API follows the Phase 1 plan's ABI section (PROGRESS.md). The plant is
// an airframe file (airframes/*.json); without one, the M3 rest plant.
//
// This file is part of quadmath-sim-core, GPL-3.0-or-later. See LICENSE.

import {
  AUX_CHANNELS, DEFAULT_AUX, auxLine, classifyLine, parseAuxOutput, parseFeatureOutput, parseGetOutput, parseMapOutput,
  parseGetEntry, parseSetEcho, sameSettingValue,
} from './cli-policy.js';

// State block v1 (src/glue/abi.c): field -> [index, length].
const STATE = Object.freeze({
  tUs: [0, 1], pos: [1, 3], vel: [4, 3], quat: [7, 4], omega: [11, 3], specificForce: [14, 3],
  motorDshot: [17, 4], motorOut: [21, 4], motorDir: [25, 4], rpm: [29, 4], thrustN: [33, 4],
  vbatLoaded: [37, 1], amps: [38, 1], mah: [39, 1], soc: [40, 1], groundClearance: [41, 1],
  airborne: [42, 1], contactFlags: [43, 1], fault: [44, 1],
});
const STATE_LEN = 45;

// Betaflight readouts v1 (src/glue/abi.c).
const FC = Object.freeze({
  armed: [0, 1], armingDisableFlags: [1, 1], flightModeFlags: [2, 1], failsafePhase: [3, 1],
  vbat: [4, 1], amps: [5, 1], mahDrawn: [6, 1], cells: [7, 1],
  setpoint: [8, 3], gyroFiltered: [11, 3], pidSum: [14, 3], rcCommand: [17, 4], motor: [21, 4],
  debug: [25, 8], debugMode: [33, 1], motorsEnabled: [34, 1], rcData: [35, 8], rxSignal: [43, 1],
  attitude: [44, 3], airmode: [47, 1], crashFlip: [48, 1], mode3d: [49, 1], rpmFilter: [50, 1], acc: [51, 3],
  pidSetpoint: [54, 3],
});
const FC_LEN = 57;
const FC_BOOLEANS = new Set(['armed', 'motorsEnabled', 'rxSignal', 'airmode', 'crashFlip', 'mode3d', 'rpmFilter']);

// Betaflight flightModeFlags bits (fc/runtime_config.h).
const ANGLE_MODE = 1 << 0;
const HORIZON_MODE = 1 << 1;
const FAILSAFE_MODE = 1 << 10;

const EVENT_DOUBLES = 8;
const EVENT_KIND = Object.freeze({ 1: 'contact', 2: 'floorTouch', 3: 'floorLeave', 4: 'trigger', 9: 'fault' });

const BOOT_CAP_US = 35_000_000;      // 35 s of ticks to arm-ready, else a fault (plan, reinit policy)
const BOOT_CHUNK_TICKS = 100;
const MAX_TICKS_PER_ADVANCE = 250;   // a longer frame is a pause, not a catch-up
const MAX_AUX_SLOTS = 20;            // MAX_MODE_ACTIVATION_CONDITION_COUNT in Betaflight 4.5

// Arming-disable flags (fc/runtime_config.h) that only say where a switch is.
// Boot holds every aux low, so a config that needs a switch moved before
// arming is as ready as it gets with these set; the host moves the switch.
// - NOPREARM: a PREARM range that aux low is outside (fc/core.c).
// - ARM_SWITCH with NOT_DISARMED: an ARM range that covers aux low; Betaflight
//   sets NOT_DISARMED because ARM was on when RX came up (fc/core.c), and
//   clears both when the switch goes off.
// - BOXFAILSAFE with RX_FAILSAFE: a failsafe range that covers aux low; the
//   box marks the flight channels invalid (rx/rx.c), which raises RX_FAILSAFE.
//   Only when the boot frame's flight channels are valid pulses, so the box
//   is the sole cause (sc_neutral_valid); otherwise the config cannot arm.
const NOT_DISARMED = 1 << 3;
const RX_FAILSAFE = 1 << 2;
const BOXFAILSAFE = 1 << 4;
const NOPREARM = 1 << 10;
const ARM_SWITCH = 1 << 25;

function switchFlags(flags, neutralValid) {
  let m = flags & NOPREARM;
  if (flags & ARM_SWITCH) m |= flags & (ARM_SWITCH | NOT_DISARMED);
  if (flags & BOXFAILSAFE) m |= flags & (neutralValid ? BOXFAILSAFE | RX_FAILSAFE : BOXFAILSAFE);
  return m;
}

const PROBE_SETTLE_FRAMES = 50;

// Plant block v1 (src/plant/plant.h): airframe value names in block order.
// 'ocv' fills seven slots and 'ocvOverDischarge' three. The model selector
// comes first.
export const PLANT_FIELDS = Object.freeze([
  'model', 'mass', 'wheelbase', 'boxHeightRatio', 'propDiameter',
  'kv', 'vRefCell', 'loadFraction', 'tmax', 'kqRatio', 'tau', 'tauDownMult', 'reverseScale',
  'cdAFront', 'cdAPlan', 'skinB', 'aeroB', 'aeroC', 'discK', 'discEnd', 'groundK',
  'gravity', 'airDensity',
  'cells', 'capacityMah', 'cellIR', 'iHover', 'ocv',
  'sagDrop', 'hoverSeconds', 'sagScale',
  'bounceScale', 'crashScale', 'spinScale',
  'ductOuterRadius', 'hullBelow', 'hullAbove',
  'rpmHover', 'currentExponent', 'iQuiescent', 'motorDelay', 'electricalTau',
  'ocvOverDischarge',
  'ductHeight', 'wallFriction', 'wallRestitution',
]);
const PLANT_LEN = 54;
const PLANT_COUNT = { ocv: 7, ocvOverDischarge: 3 };
const PB_WHEELBASE = 2;
const PB_DUCT_RADIUS = 40;
const PB_HULL_BELOW = 41;
const PB_HULL_ABOVE = 42;
const PLANT_MODELS = Object.freeze({ rest: 0, physical: 1, parity: 2 });
const PLANT_DERIVED = Object.freeze([
  'kvRad', 'ktMotor', 'omegaFull', 'ktProp', 'kqProp', 'rWinding', 'jRotor', 'omegaHover', 'dutyHover',
  'ixx', 'iyy', 'izz', 'arm', 'ampsFull',
]);
const PB_MASS = 1;
const PB_GRAVITY = 21;

// An airframe ({ model, values: { name: { value } } }, airframes/*.json) as
// plant block v1. Every field must be present; nothing is filled in.
export function plantBlock(airframe) {
  const block = new Float64Array(PLANT_LEN);
  let at = 0;
  for (const name of PLANT_FIELDS) {
    if (name === 'model') {
      if (!(airframe.model in PLANT_MODELS)) throw new Error(`airframe model '${airframe.model}'`);
      block[at++] = PLANT_MODELS[airframe.model];
      continue;
    }
    const entry = airframe.values && airframe.values[name];
    if (!entry) throw new Error(`airframe ${airframe.id || ''} has no '${name}'`);
    const n = PLANT_COUNT[name] || 1;
    const values = n === 1 ? [entry.value] : entry.value;
    if (!Array.isArray(values) || values.length !== n) throw new Error(`airframe '${name}' needs ${n === 1 ? 'one number' : `${n} numbers`}`);
    for (const v of values) {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`airframe '${name}' is not a finite number`);
      block[at++] = v;
    }
  }
  if (at !== PLANT_LEN) throw new Error(`plant block has ${at} values, expected ${PLANT_LEN}`);
  return block;
}

// Module-frame metres to the integer micrometres the ABI takes.
function um(x) {
  if (!Number.isFinite(x) || Math.abs(x) > 2000) throw new Error(`world coordinate ${x} m`);
  return Math.round(x * 1e6);
}

function decode(block, layout, booleans = new Set()) {
  const out = {};
  for (const [name, [at, n]] of Object.entries(layout)) {
    out[name] = n === 1 ? (booleans.has(name) ? block[at] === 1 : block[at]) : Array.from(block.subarray(at, at + n));
  }
  return out;
}

// Sticks to the 16 channel values input() takes, in function order: roll,
// pitch, yaw in -1..1, throttle 0..1 (3D: -1..1 around the centre), aux as
// integers. A convenience for scripts and tests; quadmath's input layer sends
// its own integers.
export function sticksToChannels({ roll = 0, pitch = 0, yaw = 0, throttle = 0 } = {}, aux = [], { mode3d = false } = {}) {
  for (const [k, v] of Object.entries({ roll, pitch, yaw, throttle })) {
    if (!Number.isFinite(v)) throw new Error(`stick ${k} is not finite`);
  }
  const ch = new Array(4 + AUX_CHANNELS).fill(1000);
  ch[0] = Math.round(1500 + 500 * clamp(roll, -1, 1));
  ch[1] = Math.round(1500 + 500 * clamp(pitch, -1, 1));
  ch[2] = Math.round(1500 + 500 * clamp(yaw, -1, 1));
  ch[3] = mode3d ? Math.round(1500 + 500 * clamp(throttle, -1, 1)) : Math.round(1000 + 1000 * clamp(throttle, 0, 1));
  aux.forEach((v, k) => { ch[4 + k] = v; });
  return ch;
}

export class SimCore {
  // source: a WebAssembly.Module, bytes, or a URL to fetch.
  static async load(source, opts = {}) {
    let module = source;
    if (!(source instanceof WebAssembly.Module)) {
      let bytes = source;
      if (typeof source === 'string' || source instanceof URL) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`fetch ${source}: HTTP ${res.status}`);
        bytes = await res.arrayBuffer();
      }
      module = await WebAssembly.compile(bytes);
    }
    return new SimCore(module, opts);
  }

  #accUs = 0;
  #prev = null;
  #poseJump = false;

  constructor(module, { rxHz = 250, trace = true } = {}) {
    this.module = module;
    this.rxHz = rxHz;
    this.trace = trace;
    this.eeprom = null;      // saved config image, carried across reinits
    this.rcmap = 'AETR1234';
    this.flight = null;
    this.flightLog = '';
    this.pausedUs = 0;       // frame time dropped by advance() as pauses
    this.plant = null;       // plant block v1, null for the rest plant
    this.airframe = null;
    this.world = null;
  }

  #instantiate(eeprom) {
    const instance = new WebAssembly.Instance(this.module, {});
    const e = instance.exports;
    if (e._initialize) e._initialize();
    if (e.sc_abi_version() !== 1) throw new Error(`sim-core ABI ${e.sc_abi_version()}, expected 1`);
    if (e.sc_state_len() !== STATE_LEN || e.sc_fc_len() !== FC_LEN) {
      throw new Error(`state blocks ${e.sc_state_len()}/${e.sc_fc_len()} doubles, sim-core.js expects ${STATE_LEN}/${FC_LEN}`);
    }
    if (eeprom) {
      new Uint8Array(e.memory.buffer, e.sc_eeprom_ptr(), e.sc_eeprom_size()).set(eeprom);
    }
    const fault = e.sc_boot();
    if (fault) throw new Error(`sim-core boot fault ${fault}`);
    return e;
  }

  static #log(e) {
    if (e.sc_cli_log_truncated()) throw new Error('sim-core CLI log overflowed');
    const bytes = new Uint8Array(e.memory.buffer, e.sc_cli_log_ptr(), e.sc_cli_log_len());
    const text = new TextDecoder().decode(bytes);
    e.sc_cli_log_clear();
    return text;
  }

  static #cli(e, line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length > 255) throw new Error('CLI line longer than 255 bytes');
    new Uint8Array(e.memory.buffer, e.sc_scratch_ptr(), bytes.length).set(bytes);
    const rc = e.sc_cli_line(e.sc_scratch_ptr(), bytes.length);
    return { rc, output: SimCore.#log(e) };
  }

  #configInstance(eeprom = this.eeprom) {
    const e = this.#instantiate(eeprom);
    e.sc_cli_enter();
    SimCore.#log(e);
    return e;
  }

  // Applies a Betaflight diff through Betaflight's own CLI, saves, and boots a
  // fresh flight instance to arm-ready. Every input line gets exactly one
  // result: applied, rejected (with the reason), error (with Betaflight's
  // message), or comment. A class diff starts from factory defaults, so
  // nothing from an earlier configure() carries over.
  //
  // plant: an airframe (airframes/*.json); without one the quad is the M3
  // rest plant. world: { floorZ, boxes: [{ min, max, kind, id }], triggers:
  // [{ min, max, id }] } in module-frame metres, quantised to micrometres.
  // battery: { soc, vbatFiltered } to start from instead of a full pack.
  configure(opts) {
    const { diff = '', plant, world, battery } = typeof opts === 'string' ? { diff: opts } : (opts || {});
    // Everything that can be refused in JS is built before any state changes.
    const block = plant == null ? null : plantBlock(plant);
    const airframe = plant == null ? null : structuredClone(plant);
    const quantised = world == null ? null : SimCore.#quantiseWorld(world);
    const prev = { plant: this.plant, airframe: this.airframe, world: this.world };
    this.plant = block;
    this.airframe = airframe;
    this.world = quantised;
    try {
      return this.#commit(this.#applyAndSave(null, diff), battery ? { battery } : { freshPack: true });
    } catch (err) {
      Object.assign(this, prev);
      throw err;
    }
  }

  static #quantiseWorld({ floorZ = 0, boxes = [], triggers = [] }) {
    const box = (b, i) => {
      const v = [...vec3(b.min, `world box ${i} min`), ...vec3(b.max, `world box ${i} max`)].map(um);
      if (v[0] > v[3] || v[1] > v[4] || v[2] > v[5]) throw new Error(`world box ${i}: min must not exceed max`);
      return { um: Int32Array.from(v), kind: int32(b.kind ?? 0, `world box ${i} kind`), id: int32(b.id ?? i, `world box ${i} id`) };
    };
    return { floorUm: um(floorZ), boxes: boxes.map(box), triggers: triggers.map(box) };
  }

  // World, then plant (it rests the quad on that floor), on a fresh instance.
  #sendPlant(e) {
    const p = e.sc_scratch_ptr();
    if (this.world) {
      e.sc_world_clear();
      e.sc_world_floor(this.world.floorUm);
      for (const b of this.world.boxes) {
        new Int32Array(e.memory.buffer, p, 6).set(b.um);
        if (e.sc_world_box(p, b.kind, b.id) < 0) throw new Error(`world box ${b.id} refused`);
      }
      for (const t of this.world.triggers) {
        new Int32Array(e.memory.buffer, p, 6).set(t.um);
        if (e.sc_world_trigger(p, t.id) < 0) throw new Error(`world trigger ${t.id} refused`);
      }
    }
    if (this.plant) {
      if (e.sc_plant_len() !== PLANT_LEN) throw new Error(`plant block ${e.sc_plant_len()} doubles, sim-core.js has ${PLANT_LEN}`);
      new Float64Array(e.memory.buffer, p, PLANT_LEN).set(this.plant);
      if (e.sc_plant_set(p, PLANT_LEN) !== 0) throw new Error('plant block refused');
    }
  }

  // Disarmed only. Applies CLI lines on top of the current config, saves, and
  // reinits the flight instance (battery carried). Returns the line report.
  edit(lines) {
    if (this.flight && this.fc.armed) throw new Error('edit() needs the quad disarmed');
    const text = Array.isArray(lines) ? lines.join('\n') : String(lines);
    return this.#commit(this.#applyAndSave(this.eeprom, text), {});
  }

  // The new image replaces the old one only once it boots. If the boot fails,
  // the previous config and flight instance stay, and the error carries the
  // line report (err.report) so the caller can see which lines went in.
  #commit({ report, eeprom, rcmap }, reinitOpts) {
    const old = { eeprom: this.eeprom, rcmap: this.rcmap };
    this.eeprom = eeprom;
    this.rcmap = rcmap;
    try {
      report.boot = this.reinit(reinitOpts);
    } catch (err) {
      this.eeprom = old.eeprom;
      this.rcmap = old.rcmap;
      err.report = report;
      throw err;
    }
    return report;
  }

  #applyAndSave(eeprom, diffText) {
    const e = this.#configInstance(eeprom);
    const loopHz = e.sc_loop_hz();
    const lines = [];
    String(diffText).split('\n').forEach((text, i) => {
      const verdict = classifyLine(text, { loopHz });
      const entry = { n: i + 1, text: text.replace(/\r$/, ''), status: verdict.status, msg: verdict.msg || '' };
      if (verdict.status === 'apply') {
        // The value before, and the setting's scope (master, profile N or
        // rateprofile N), as Betaflight's get prints them.
        const before = verdict.set ? parseGetEntry(SimCore.#cli(e, `get ${verdict.set.key}`).output, verdict.set.key) : undefined;
        const { rc, output } = SimCore.#cli(e, verdict.line);
        const stored = verdict.set ? parseSetEcho(output, verdict.set.key) : undefined;
        const aux = verdict.aux ? SimCore.#auxEcho(output, verdict.aux.index) : undefined;
        if (rc === 1 || rc < 0) {
          entry.status = 'error';
          entry.msg = rc < 0 ? `sim-core rc ${rc}` : SimCore.#errorLine(output);
        } else if (verdict.set && (stored === undefined || !sameSettingValue(verdict.set.value, stored))) {
          // cliSet parses numbers with atoi/strtol: '' stores 0 and '12abc'
          // stores 12, without an error. Put the old value back and report it.
          if (before !== undefined) SimCore.#cli(e, `set ${verdict.set.key} = ${before.value}`);
          entry.status = 'rejected';
          entry.msg = `Betaflight stored '${stored}' for '${verdict.set.value}'; previous value ${before && before.value} restored`;
        } else if (verdict.aux && !(aux && ['boxId', 'channel', 'logic', 'linkedTo'].every((k) => aux[k] === verdict.aux[k]))) {
          // For an unknown box id Betaflight keeps a stale mode (cli/cli.c:1188-1228),
          // which on an unused slot is ARM; for an unknown linkedTo or logic it
          // resets linkedTo and keeps a stale logic. Clear the slot and report it.
          SimCore.#cli(e, auxLine(verdict.aux.index, 0, 0, 900, 900));
          entry.status = 'rejected';
          entry.msg = aux && aux.boxId !== verdict.aux.boxId
            ? `Betaflight has no mode with permanent id ${verdict.aux.boxId}; slot ${verdict.aux.index} cleared`
            : `Betaflight resolved slot ${verdict.aux.index} as box ${aux && aux.boxId} channel ${aux && aux.channel} logic ${aux && aux.logic} linkedTo ${aux && aux.linkedTo}; slot cleared`;
        } else {
          entry.status = 'applied';
          if (verdict.note) entry.msg = verdict.note;
          if (verdict.feature) entry.feature = verdict.feature;
          if (verdict.set) entry.setting = { key: verdict.set.key, value: verdict.set.value, scope: before.scope, index: before.index };
        }
      }
      lines.push(entry);
    });

    const added = SimCore.#addDefaultAux(e);
    const rcmap = parseMapOutput(SimCore.#cli(e, 'map').output) || 'AETR1234';

    // Save: Betaflight writes the EEPROM image and asks for a reboot.
    SimCore.#cli(e, 'save');
    if (!e.sc_reboot_requested()) throw new Error('save did not request a reboot');
    const saved = new Uint8Array(e.memory.buffer, e.sc_eeprom_ptr(), e.sc_eeprom_size()).slice();

    this.#checkAfterBoot(lines, saved);

    const count = (s) => lines.filter((l) => l.status === s).length;
    const report = {
      lines, added, rcmap, loopHz,
      applied: count('applied'), rejected: count('rejected'), errors: count('error'), comments: count('comment'),
    };
    return { report, eeprom: saved, rcmap };
  }

  // The CLI first echoes the typed line, then prints the slot as Betaflight
  // resolved it (cli/cli.c:1232-1240). The last matching line is the result.
  static #auxEcho(output, index) {
    return parseAuxOutput(output).filter((a) => a.index === index).at(-1);
  }

  // Betaflight's error line, after the CLI's echo of the typed line.
  static #errorLine(output) {
    const m = output.slice(output.indexOf('\n') + 1).match(/^###ERROR[^\r\n]*/m);
    return m ? m[0] : output.trim();
  }

  // Default ARM/ANGLE/HORIZON/FLIP lines, only when there is no usable ARM
  // range, and only into free slots so the diff's own modes survive.
  static #addDefaultAux(e) {
    const slots = parseAuxOutput(SimCore.#cli(e, 'aux').output);
    const used = (a) => a.low < a.high;
    if (slots.some((a) => used(a) && a.boxId === 0 && a.channel < AUX_CHANNELS)) return [];
    const free = [];
    for (let i = 0; i < MAX_AUX_SLOTS; i++) {
      const slot = slots.find((a) => a.index === i);
      if (!slot || !used(slot)) free.push(i);
    }
    const added = [];
    DEFAULT_AUX.forEach((d, k) => {
      if (k >= free.length) return;
      const line = auxLine(free[k], d.boxId, d.channel);
      const { rc, output } = SimCore.#cli(e, line);
      added.push({ text: line, status: rc === 0 ? 'added' : 'error', msg: rc === 0 ? 'no usable ARM range in the diff' : output.trim() });
    });
    return added;
  }

  // Backstop after save: boot the saved image as the flight instance will and
  // read back what Betaflight kept. Its boot-time checks (config/config.c
  // validateAndFixConfig, validateAndFixGyroConfig) can change a value or
  // clear a feature the CLI accepted. Only the last line for each feature, and
  // for each setting in its own scope, decides; earlier ones are superseded.
  #checkAfterBoot(lines, eeprom) {
    const last = new Map();
    for (const l of lines) {
      if (l.status !== 'applied') continue;
      if (l.feature) last.set(`feature ${l.feature.name}`, l);
      else if (l.setting) last.set(`${l.setting.scope} ${l.setting.index ?? ''} ${l.setting.key}`, l);
    }
    if (!last.size) return;
    for (const l of lines) {
      if (l.status !== 'applied' || !(l.feature || l.setting)) continue;
      const k = l.feature ? `feature ${l.feature.name}` : `${l.setting.scope} ${l.setting.index ?? ''} ${l.setting.key}`;
      if (last.get(k) !== l) l.msg = `superseded by line ${last.get(k).n}`;
    }
    const e = this.#configInstance(eeprom);
    const enabled = parseFeatureOutput(SimCore.#cli(e, 'feature').output);
    for (const l of last.values()) {
      if (l.feature) {
        if (enabled.has(l.feature.name) !== l.feature.enable) {
          l.status = 'rejected';
          l.msg = `Betaflight ${l.feature.enable ? 'cleared' : 'kept'} feature ${l.feature.name} at boot (not supported by this build)`;
        }
        continue;
      }
      const s = l.setting;
      if (s.scope !== 'master') SimCore.#cli(e, `${s.scope} ${s.index}`);
      const now = parseGetOutput(SimCore.#cli(e, `get ${s.key}`).output, s.key);
      if (now === undefined || !sameSettingValue(s.value, now)) {
        l.status = 'rejected';
        l.msg = `Betaflight changed ${s.key} to '${now}' when the saved config booted (config/config.c validateAndFix)`;
      }
    }
  }

  // State of charge and filtered pack voltage of the flight instance: what a
  // reinit carries.
  get battery() {
    const e = this.flight;
    const p = e.sc_scratch_ptr();
    if (e.sc_battery_state(p) !== 0) throw new Error('sc_battery_state');
    const [soc, vbatFiltered] = new Float64Array(e.memory.buffer, p, 2);
    return { soc, vbatFiltered };
  }

  // A fresh flight instance from the saved image, ticked until Betaflight has
  // no arming-disable flag left but the switch ones (sticks centred, throttle
  // low, aux low). The battery's charge and filtered voltage carry over from
  // the current flight unless freshPack; battery: { soc, vbatFiltered } gives
  // the pack instead (a fresh load continuing a session). The new instance
  // replaces the current one only once it is ready.
  reinit({ freshPack = false, battery } = {}) {
    const carry = battery || (!freshPack && this.flight ? this.battery : null);
    const e = this.#instantiate(this.eeprom);
    if (e.sc_set_rx_rate(this.rxHz) !== 0) throw new Error(`rx rate ${this.rxHz} Hz not allowed for this build`);
    this.#sendPlant(e);
    if (carry) {
      const p = e.sc_scratch_ptr();
      new Float64Array(e.memory.buffer, p, 2).set([carry.soc, carry.vbatFiltered]);
      if (e.sc_battery_carry(p) !== 0) throw new Error(`battery carry ${carry.soc} ${carry.vbatFiltered} refused`);
    }
    if (this.trace) e.sc_trace_start();
    const log = SimCore.#log(e);
    const flags = () => new Float64Array(e.memory.buffer, e.sc_fc_ptr(), FC_LEN)[FC.armingDisableFlags[0]];
    const start = e.sc_time();
    let ticks = 0;
    const held = () => switchFlags(flags(), e.sc_neutral_valid() === 1);
    while ((flags() & ~held()) !== 0) {
      if (e.sc_time() - start >= BOOT_CAP_US) {
        const err = new Error(`boot did not reach arm-ready in 35 s, flags 0x${flags().toString(16)}`);
        err.code = 'boot-timeout';
        err.flags = flags();
        throw err;
      }
      ticks += e.sc_step(BOOT_CHUNK_TICKS);
      if (e.sc_fault()) throw new Error(`fault ${e.sc_fault()} during boot`);
    }
    this.flight = e;
    this.flightLog = log;
    this.#accUs = 0;
    this.#prev = null;
    return { ticks, simTimeUs: e.sc_time(), switchFlags: held() };
  }

  get simTimeUs() {
    return this.flight.sc_time();
  }

  get loopHz() {
    return this.flight ? this.flight.sc_loop_hz() : 0;
  }

  get tickUs() {
    return 1e6 / this.loopHz;
  }

  get pgMissing() {
    return this.flight.sc_pg_missing();
  }

  get fault() {
    return this.flight.sc_fault();
  }

  // One input sample: integer channel values 1000..2000 in function order
  // (roll, pitch, yaw, throttle, AUX1..AUX12; missing aux are 1000). Stamped
  // at tUs, whole microseconds of sim time, by default the next tick. Stamps
  // never go backwards. Laid out through the inverse of Betaflight's rcmap.
  input(channels, tUs = this.simTimeUs) {
    if (!Number.isInteger(tUs) || tUs < 0) throw new Error(`input time ${tUs} is not whole microseconds`);
    if (!channels || channels.length < 4 || channels.length > 4 + AUX_CHANNELS) {
      throw new Error(`input takes 4..${4 + AUX_CHANNELS} channels`);
    }
    const fn = new Array(4 + AUX_CHANNELS).fill(1000);
    for (let k = 0; k < channels.length; k++) {
      const v = channels[k];
      if (!Number.isInteger(v) || v < 1000 || v > 2000) throw new Error(`channel ${k + 1} value ${v} is not an integer in 1000..2000`);
      fn[k] = v;
    }
    const value = { A: fn[0], E: fn[1], R: fn[2], T: fn[3], 1: fn[4], 2: fn[5], 3: fn[6], 4: fn[7] };
    const raw = new Uint16Array(16);
    for (let k = 0; k < 8; k++) raw[k] = value[this.rcmap[k]];
    for (let k = 8; k < 16; k++) raw[k] = fn[k];
    const e = this.flight;
    new Uint16Array(e.memory.buffer, e.sc_scratch_ptr(), 16).set(raw);
    const rc = e.sc_input(e.sc_scratch_ptr(), tUs);
    if (rc !== 0) throw new Error(rc === -1 ? `input at ${tUs} us rejected (out of range or earlier than the last sample)` : `input ring full (rc ${rc})`);
  }

  link(up) {
    this.flight.sc_rx_link(up ? 1 : 0);
  }

  // Frame time in, whole ticks out. Physics never sees frameDtMs; only the
  // number of ticks it adds up to. More than 250 ticks in one call is a pause:
  // the excess is dropped, not caught up. Returns the ticks run.
  //
  // A tick that enters a trigger ends the call early, and the ticks not run
  // stay in the accumulator (alpha counts them). The frame loop is:
  //   core.advance(dt); handle(core.events());
  //   while (core.alpha >= 1) { core.advance(0); handle(core.events()); }
  // where handle() acts on triggers (a portal's teleport()). The response then
  // lands on the tick after the trigger at any frame rate.
  advance(frameDtMs) {
    if (!Number.isFinite(frameDtMs) || frameDtMs < 0) throw new Error(`frame time ${frameDtMs} ms`);
    const tickUs = this.tickUs;
    this.#accUs += frameDtMs * 1000;
    let ticks = Math.floor(this.#accUs / tickUs);
    this.#accUs -= ticks * tickUs;
    if (ticks > MAX_TICKS_PER_ADVANCE) {
      this.pausedUs += (ticks - MAX_TICKS_PER_ADVANCE) * tickUs;
      ticks = MAX_TICKS_PER_ADVANCE;
    }
    const ran = this.step(ticks);
    this.#accUs += (ticks - ran) * tickUs;
    return ran;
  }

  // n ticks (scripts, tests, benches), or fewer when a tick enters a trigger:
  // the run stops after that tick (see advance()). Returns the ticks run.
  // advance() is the frame path.
  step(ticks) {
    if (!Number.isInteger(ticks) || ticks < 0) throw new Error(`step(${ticks})`);
    if (ticks === 0) return 0;
    const e = this.flight;
    let ran = 0;
    let stopped = false;
    if (ticks > 1) {
      // The stop flag is read only after a run of our own: a stale one from
      // the previous call must not hold back the next tick.
      ran = e.sc_step(ticks - 1);
      stopped = e.sc_tick_stopped() !== 0;
    }
    if (ran === ticks - 1 && !stopped) {
      this.#prev = new Float64Array(e.memory.buffer, e.sc_state_ptr(), STATE_LEN).slice();
      ran += e.sc_step(1);
    } else {
      this.#prev = null;
    }
    if (this.#poseJump) {
      // A teleport: render the new pose, not a streak from the old one.
      this.#prev = null;
      this.#poseJump = false;
    }
    if (e.sc_fault()) throw new Error(`sim-core fault ${e.sc_fault()}`);
    return ran;
  }

  // Latest tick: plant state, SI units, module frame (X forward, Y left, Z up).
  get state() {
    const e = this.flight;
    const s = decode(new Float64Array(e.memory.buffer, e.sc_state_ptr(), STATE_LEN), STATE);
    s.airborne = s.airborne === 1;
    return s;
  }

  // Latest tick: Betaflight's readouts.
  get fc() {
    const e = this.flight;
    const f = decode(new Float64Array(e.memory.buffer, e.sc_fc_ptr(), FC_LEN), FC, FC_BOOLEANS);
    f.mode = {
      angle: (f.flightModeFlags & ANGLE_MODE) !== 0,
      horizon: (f.flightModeFlags & HORIZON_MODE) !== 0,
      failsafe: (f.flightModeFlags & FAILSAFE_MODE) !== 0,
      airmode: f.airmode, crashFlip: f.crashFlip, mode3d: f.mode3d,
    };
    return f;
  }

  // Both blocks of the latest tick as bytes, exactly what the trace hashes.
  blockBytes() {
    const e = this.flight;
    const out = new Uint8Array((STATE_LEN + FC_LEN) * 8);
    out.set(new Uint8Array(e.memory.buffer, e.sc_state_ptr(), STATE_LEN * 8));
    out.set(new Uint8Array(e.memory.buffer, e.sc_fc_ptr(), FC_LEN * 8), STATE_LEN * 8);
    return out;
  }

  // The accumulator in ticks: the fraction of a tick advance() left over, 0..1,
  // plus any whole ticks a trigger stop left to run (see advance()).
  get alpha() {
    return this.#accUs / this.tickUs;
  }

  // Render interpolation between the previous tick and the latest, alpha
  // clamped to 0..1 (by default the accumulator's). Render only: nothing here
  // feeds back into the physics.
  lerpState(alpha = this.alpha) {
    const cur = this.state;
    if (!this.#prev) return cur;
    const prev = decode(this.#prev, STATE);
    const a = clamp(alpha, 0, 1);
    const mix = (p, c) => p.map((v, i) => v + (c[i] - v) * a);
    cur.tUs = prev.tUs + (cur.tUs - prev.tUs) * a;
    cur.pos = mix(prev.pos, cur.pos);
    cur.vel = mix(prev.vel, cur.vel);
    const dot = prev.quat.reduce((s, v, i) => s + v * cur.quat[i], 0);
    const q = mix(prev.quat, dot < 0 ? cur.quat.map((v) => -v) : cur.quat);
    const norm = Math.hypot(...q);
    cur.quat = q.map((v) => v / norm);
    return cur;
  }

  // Drains the event queue: contacts, floor touch and leave, triggers, faults.
  events() {
    const e = this.flight;
    const n = e.sc_events_len();
    const raw = new Float64Array(e.memory.buffer, e.sc_events_ptr(), n * EVENT_DOUBLES);
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = raw.subarray(i * EVENT_DOUBLES, (i + 1) * EVENT_DOUBLES);
      const kind = EVENT_KIND[v[1]] || `kind${v[1]}`;
      if (kind === 'fault') out.push({ tUs: v[0], kind, code: v[2] });
      else if (kind === 'contact') out.push({ tUs: v[0], kind, box: v[2], impactMs: v[3], crashed: v[4] === 1 });
      else if (kind === 'trigger') out.push({ tUs: v[0], kind, id: v[2] });
      else out.push({ tUs: v[0], kind });
    }
    const dropped = e.sc_events_dropped();
    if (dropped) out.push({ tUs: e.sc_time(), kind: 'dropped', count: dropped });
    e.sc_events_clear();
    return out;
  }

  // A pose event at the next tick boundary, quantised at the ABI: position (m)
  // and velocity (m/s) in the module frame, quaternion w x y z body to world.
  // The rest plant never moves and refuses one.
  teleport({ pos, quat = [1, 0, 0, 0], vel = [0, 0, 0] }) {
    this.#needsPlant('teleport()');
    const at = vec3(pos, 'teleport pos').map(um);
    if (!Array.isArray(quat) || quat.length !== 4) throw new Error('teleport quat needs 4 numbers (w x y z)');
    // A unit quaternion composed in floating point can carry a component an
    // ulp past 1; anything beyond a small tolerance is not a rotation.
    const q = quat.map((v) => {
      if (!Number.isFinite(v) || Math.abs(v) > 1 + 1e-6) throw new Error(`quaternion component ${v}`);
      return Math.round(clamp(v, -1, 1) * 1e9);
    });
    const v = vec3(vel, 'teleport vel').map(um);
    const e = this.flight;
    const p = e.sc_scratch_ptr();
    const ints = new Int32Array(e.memory.buffer, p, 10);
    ints.set(at, 0);
    ints.set(q, 3);
    ints.set(v, 7);
    if (e.sc_pose(p, p + 12, p + 28) !== 0) throw new Error('pose refused');
    this.#poseJump = true;
  }

  #needsPlant(what) {
    if (!this.plant || this.plant[0] === PLANT_MODELS.rest) throw new Error(`${what} needs a plant (an airframe file); the rest plant never moves`);
  }

  // Bench override for plant tests: motor 0..3 (or -1 for all) runs at duty
  // -1..1 whatever Betaflight sends; null clears it. Not for flying.
  motorOverride(motor, duty) {
    this.#needsPlant('motorOverride()');
    if (!Number.isInteger(motor) || motor < -1 || motor > 3) throw new Error(`motor ${motor}: 0..3, or -1 for all`);
    if (duty !== null && !(Number.isFinite(duty) && duty >= -1 && duty <= 1)) throw new Error(`duty ${duty}: -1..1, or null to clear`);
    if (this.flight.sc_motor_override(motor, duty === null ? 2 : duty) !== 0) throw new Error(`motor override ${motor} ${duty}`);
  }

  // The plant's derived motor and body constants (src/plant/plant.h), for
  // reports; zero for the rest plant.
  // The physical model's five contact points in the module frame (m): the four
  // duct rims (motor order) and the canopy top, for hosts and tests. Null on
  // the rest and parity models, which touch with the CG only.
  get footprint() {
    if (!this.plant || this.plant[0] !== PLANT_MODELS.physical) return null;
    const b = this.plant;
    const reach = (b[PB_WHEELBASE] * 0.5 + b[PB_DUCT_RADIUS]) * Math.SQRT1_2;
    const body = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => [x * reach, y * reach, -b[PB_HULL_BELOW]]);
    body.push([0, 0, b[PB_HULL_ABOVE]]);
    const { pos, quat } = this.state;
    return body.map((r) => rotate(quat, r).map((v, k) => v + pos[k]));
  }

  get plantDerived() {
    const e = this.flight;
    const d = new Float64Array(e.memory.buffer, e.sc_plant_derived_ptr(), e.sc_plant_derived_len());
    return Object.fromEntries(PLANT_DERIVED.map((k, i) => [k, d[i]]));
  }

  // Ground clearance (m) at a module-frame point, as quadmath's hook computes it.
  clearanceAt(pos) {
    const e = this.flight;
    const p = e.sc_scratch_ptr();
    new Int32Array(e.memory.buffer, p, 3).set(vec3(pos, 'clearanceAt pos').map(um));
    return e.sc_world_clearance(p);
  }

  // Betaflight's `get` on a config instance of the current config. One key
  // gives its value as Betaflight prints it; an array gives an object.
  // profile/rateprofile select which profile a profile value is read from.
  get(keys, { profile, rateprofile } = {}) {
    const e = this.#configInstance();
    for (const [command, index] of [['profile', profile], ['rateprofile', rateprofile]]) {
      if (index === undefined) continue;
      if (!Number.isInteger(index) || SimCore.#cli(e, `${command} ${index}`).rc !== 0) {
        throw new Error(`Betaflight has no ${command} ${index}`);
      }
    }
    const one = (key) => parseGetOutput(SimCore.#cli(e, `get ${key}`).output, key);
    if (!Array.isArray(keys)) return one(keys);
    return Object.fromEntries(keys.map((k) => [k, one(k)]));
  }

  // Betaflight's `diff all` (or another diff form) on a config instance.
  diff(form = 'all') {
    const e = this.#configInstance();
    return SimCore.#cli(e, form ? `diff ${form}` : 'diff').output;
  }

  // Setpoint (deg/s) Betaflight commands at n stick positions from -1 to 1 on
  // one axis (0 roll, 1 pitch, 2 yaw). A probe instance flies nothing: the
  // current config with RC smoothing off, one RX frame per position, and the
  // setpoint read back from Betaflight. No rate formula lives in JS.
  rateCurve(axis, n = 101) {
    if (![0, 1, 2].includes(axis) || !Number.isInteger(n) || n < 2) throw new Error(`rateCurve(${axis}, ${n})`);
    const cfg = this.#configInstance();
    if (SimCore.#cli(cfg, 'set rc_smoothing = OFF').rc !== 0) throw new Error('probe: rc_smoothing OFF refused');
    SimCore.#cli(cfg, 'save');
    const e = this.#instantiate(new Uint8Array(cfg.memory.buffer, cfg.sc_eeprom_ptr(), cfg.sc_eeprom_size()).slice());
    if (e.sc_set_rx_rate(this.rxHz) !== 0) throw new Error(`rx rate ${this.rxHz} Hz`);
    const frameTicks = Math.round(e.sc_loop_hz() / this.rxHz);
    const send = (fn) => {
      const raw = new Uint16Array(16).fill(1000);
      const value = { A: fn[0], E: fn[1], R: fn[2], T: fn[3], 1: 1000, 2: 1000, 3: 1000, 4: 1000 };
      for (let k = 0; k < 8; k++) raw[k] = value[this.rcmap[k]];
      new Uint16Array(e.memory.buffer, e.sc_scratch_ptr(), 16).set(raw);
      if (e.sc_input(e.sc_scratch_ptr(), e.sc_time()) !== 0) throw new Error('probe input refused');
      // The frame lands on the next RX-grid tick; the PID reads it one tick later.
      e.sc_step(frameTicks + 1);
    };
    for (let i = 0; i < PROBE_SETTLE_FRAMES; i++) send([1500, 1500, 1500, 1000]);
    const curve = [];
    for (let i = 0; i < n; i++) {
      const stick = -1 + (2 * i) / (n - 1);
      const fn = [1500, 1500, 1500, 1000];
      fn[axis] = Math.round(1500 + 500 * stick);
      send(fn);
      const f = new Float64Array(e.memory.buffer, e.sc_fc_ptr(), FC_LEN);
      curve.push({ stick, channel: fn[axis], rate: f[FC.setpoint[0] + axis] });
    }
    return curve;
  }

  // SHA-256 over the state and Betaflight blocks at the end of every tick
  // since the flight instance booted (load option trace, on by default).
  traceHash() {
    if (!this.trace) throw new Error('trace is off (SimCore.load(..., { trace: false }))');
    const e = this.flight;
    const ptr = e.sc_trace_digest();
    if (!ptr) throw new Error('this flight instance was not traced');
    const d = new Uint8Array(e.memory.buffer, ptr, 32);
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Read-only view for code outside the physics path (render, HUD, coach),
  // in the names quadmath's QuadPhysics consumers read. No setters: arming
  // goes through the ARM aux channel, poses through teleport/reinit.
  get compat() {
    const s = this.state;
    const f = this.fc;
    const thrust = s.thrustN.reduce((a, v) => a + v, 0);
    const [w, x, y, z] = s.quat;
    return {
      position: s.pos, velocity: s.vel, quaternion: s.quat, omega: s.omega,
      armed: f.armed, airborne: s.airborne, motorOutputs: s.motorOut,
      totalThrustN: thrust, totalThrustAbsN: s.thrustN.reduce((a, v) => a + Math.abs(v), 0),
      // Render-side readout only (coach, HUD), never fed back into physics.
      attitude: {
        roll: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
        pitch: Math.asin(clamp(2 * (w * y - z * x), -1, 1)),
        yaw: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
      },
      flightMode: f.mode.angle ? 'angle' : f.mode.horizon ? 'horizon' : 'acro',
      groundClearance: s.groundClearance,
      physicsHz: this.loopHz,
      // Thrust over weight, with the mass and gravity the plant flies; null on the rest plant.
      twr: this.plant && this.plant[0] !== PLANT_MODELS.rest ? thrust / (this.plant[PB_MASS] * this.plant[PB_GRAVITY]) : null,
      // The physical model has no floatiness knob (quadmath's was a drag scale).
      floatiness: null,
    };
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// v' = q v q* for q = (w, x, y, z) body to world.
function rotate(q, v) {
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

function vec3(v, what) {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`${what} needs 3 numbers`);
  return v;
}

function int32(v, what) {
  if (!Number.isInteger(v) || v < -2147483648 || v > 2147483647) throw new Error(`${what} ${v} is not a 32-bit integer`);
  return v;
}
