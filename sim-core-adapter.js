// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim — the flight core behind one adapter. Two cores fly the same
// page: quadphysics.js (the "js" core, still the default) and
// quadmath-sim-core, Betaflight 4.5.1 in WebAssembly (the "bf" core, ?core=bf,
// the Air65 only for now). Both step at a fixed 1 kHz on an accumulator fed by
// frame time, and the page renders an interpolated state. OSD, ghosts, crashes,
// audio and portals read getState() and events() whichever core flies.
//
// Frames. Both cores work in the module frame: X forward, Y left, Z up,
// metres, quaternions body to world. The scene is three.js: Y up, -Z forward,
// WS units per metre. toScene() is the one place the module frame becomes the
// scene; toModule() is its inverse, for what crosses the other way (spawns,
// teleports, the world export, the js core's own contact hooks).
//
// Input. The page polls the sticks every 4 ms and stamps each sample with the
// sim time its wall time maps to (InputClock, ported from quadmath-sim-core's
// fly harness, tests/browser/fly-input.mjs). The bf core puts the sample in
// sim-core's input ring as RC channels; the js core keeps a ring of its own,
// and each 1 ms tick flies on the latest sample stamped at or before it.

export const WS = 3.5;                  // scene units per metre
export const TICK_US = 1000;            // both cores tick at 1 kHz
const MAX_TICKS_PER_FRAME = 250;        // a longer frame is a pause, not a catch-up

// ---- The render boundary ----

// Module frame to scene: a vector (x, y, z) is scaled by WS and permuted; a
// quaternion (x, y, z, w) is permuted the same way (a rotation, determinant
// +1). X forward becomes -Z, Y left becomes -X, Z up becomes +Y.
export function toScene(m, out) {
  if (m.w !== undefined) return out.set(-m.y, m.z, -m.x, m.w);
  return out.set(-m.y * WS, m.z * WS, -m.x * WS);
}

// Scene to module frame, the inverse of toScene().
export function toModule(w, out = {}) {
  if (w.w !== undefined) {
    out.x = -w.z; out.y = -w.x; out.z = w.y; out.w = w.w;
    return out;
  }
  out.x = -w.z / WS; out.y = -w.x / WS; out.z = w.y / WS;
  return out;
}

// A scene Box3 (min/max) as a sim-core world box in module metres.
export function boxToModule(bb) {
  return {
    min: [-bb.max.z / WS, -bb.max.x / WS, bb.min.y / WS],
    max: [-bb.min.z / WS, -bb.min.x / WS, bb.max.y / WS],
  };
}

// ---- Sim-time stamps for the 4 ms poll (fly harness InputClock) ----

// After each frame's advance(), the frame's wall time maps to
// simTimeUs + alpha x tickUs; a poll w ms later is that plus w ms. Stamps
// ahead of the sim wait in the ring for their tick. horizonUs caps how far
// ahead a stamp may go: past it (the frames stopped) a poll is dropped, so the
// ring never fills while the sim waits. Stamps never go backwards.
export class InputClock {
  constructor({ horizonUs = 100_000 } = {}) {
    this.horizonUs = horizonUs;
    this.rebase();
  }

  // After a reinit (a new instance: its clock and ring start over).
  rebase() {
    this.anchorWallMs = null;
    this.anchorSimUs = 0;
    this.lastUs = -1;
  }

  anchor(core, wallMs) {
    this.anchorWallMs = wallMs;
    this.anchorSimUs = core.simTimeUs + core.alpha * core.tickUs;
  }

  // The stamp for a poll at wallMs, or null to drop it.
  stamp(core, wallMs) {
    const now = core.simTimeUs;
    const want = this.anchorWallMs === null ? now : this.anchorSimUs + (wallMs - this.anchorWallMs) * 1000;
    const t = Math.max(Math.round(want), now, this.lastUs);
    if (t > now + this.horizonUs) return null;
    this.lastUs = t;
    return t;
  }
}

// ---- The bf core's radio link (fly harness RadioLink) ----

// Down while the wizard runs. It comes back only once Betaflight has noticed
// the loss (rxSignal false) and a real sample has reached the ring's RX frame,
// so Betaflight's own guard sees the arm switch where it really is. A boot
// (configure, reinit) leaves the link up while the page drives the aux
// channels: its arm intent is forced low on every boot, so no stale switch
// can arm a fresh instance. With a radio's own channels passing through
// (radioAux), createBfCore drops the link at every boot, as the fly harness
// does, so a switch already on meets Betaflight's guard.
export class RadioLink {
  constructor(core) {
    this.reset(core);
  }

  // A fresh instance: its link starts up.
  reset(core) {
    this.core = core;
    this.up = true;
    this.liveUs = null;
    core.link(true);
  }

  drop() {
    if (this.up) this.core.link(false);
    this.up = false;
    this.liveUs = null;
  }

  sample(stampUs) {
    if (this.liveUs === null) this.liveUs = stampUs;
  }

  update(want) {
    if (!want) {
      this.drop();
      return;
    }
    if (this.up || this.liveUs === null) return;
    const rxUs = 1e6 / this.core.rxHz;
    if (this.core.simTimeUs >= this.liveUs + rxUs && !this.core.fc.rxSignal) {
      this.core.link(true);
      this.up = true;
    }
  }
}

// ---- Shared state shape ----

const vec = () => ({ x: 0, y: 0, z: 0 });
const quat = () => ({ x: 0, y: 0, z: 0, w: 1 });

// What getState() returns, module frame. position, velocity and quaternion
// are interpolated for render; everything else is the latest tick. The field
// names are quadphysics.js's, so module-frame readers (tricks, flip, coach)
// read either core unchanged.
export function emptyState() {
  return {
    kind: '', flightMs: 0,
    position: vec(), velocity: vec(), quaternion: quat(), omega: vec(),
    armed: false, airborne: false, clearance: 0, flightMode: 'angle',
    attitude: { roll: 0, pitch: 0 }, motorOutputs: [0, 0, 0, 0],
    totalThrustAbsN: 0, twr: 0, battV: null, soc: null, armingDisableFlags: 0,
    crashFlip: false,
  };
}

const copyVec = (o, v) => { o.x = v.x; o.y = v.y; o.z = v.z; return o; };
const copyQuat = (o, q) => { o.x = q.x; o.y = q.y; o.z = q.z; o.w = q.w; return o; };

// Linear between two poses, the quaternion normalised with a hemisphere fix.
function lerpPose(prev, cur, a, out) {
  for (const k of ['position', 'velocity']) {
    out[k].x = prev[k].x + (cur[k].x - prev[k].x) * a;
    out[k].y = prev[k].y + (cur[k].y - prev[k].y) * a;
    out[k].z = prev[k].z + (cur[k].z - prev[k].z) * a;
  }
  const p = prev.quaternion;
  const c = cur.quaternion;
  const s = p.x * c.x + p.y * c.y + p.z * c.z + p.w * c.w < 0 ? -1 : 1;
  const q = out.quaternion;
  q.x = p.x + (s * c.x - p.x) * a;
  q.y = p.y + (s * c.y - p.y) * a;
  q.z = p.z + (s * c.z - p.z) * a;
  q.w = p.w + (s * c.w - p.w) * a;
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= n; q.y /= n; q.z /= n; q.w /= n;
}

// ---- The js core: quadphysics.js at a fixed 1 kHz ----

// tick(sample, tUs) is the page's per-tick physics (rate setpoint, battery,
// throttle, qp.step at 1 ms); sample is the stick sample the tick flies on.
// extras(out) fills the latest-tick fields the page owns (clearance).
export function createJsCore({ qp, tick, extras }) {
  const ring = [];                    // [{ tUs, s }], oldest first
  const clock = new InputClock();
  let held = { r: 0, p: 0, y: 0, t: 0 };
  let tUs = 1_000_000;                // sim-core's boot epoch, for symmetry
  let accUs = 0;
  let flightUs = 0;                   // ticks run since load, across respawns
  const pose = () => ({ position: vec(), velocity: vec(), quaternion: quat() });
  const prev = pose();
  const cur = pose();
  const take = (o) => {
    copyVec(o.position, qp.position);
    copyVec(o.velocity, qp.velocity);
    copyQuat(o.quaternion, qp.quaternion);
  };
  take(cur);
  take(prev);
  const core = {
    kind: 'js',
    ready: true,
    get simTimeUs() { return tUs; },
    get alpha() { return accUs / TICK_US; },
    get tickUs() { return TICK_US; },
    get flightMs() { return flightUs / 1000; },
    stamp(wallMs) { return clock.stamp(core, wallMs); },
    anchor(wallMs) { clock.anchor(core, wallMs); },
    input(sample, stampUs) {
      ring.push({ tUs: stampUs, s: { r: sample.r, p: sample.p, y: sample.y, t: sample.t } });
      if (ring.length > 1024) ring.shift();
    },
    // Frame time in, whole 1 ms ticks out (at most 250 a frame: a longer
    // frame is a pause). Returns the ticks run.
    advance(frameMs) {
      if (!(frameMs > 0)) return 0;
      accUs += frameMs * 1000;
      let n = Math.floor(accUs / TICK_US);
      accUs -= n * TICK_US;
      if (n > MAX_TICKS_PER_FRAME) n = MAX_TICKS_PER_FRAME;
      for (let k = 0; k < n; k++) {
        while (ring.length && ring[0].tUs <= tUs) held = ring.shift().s;
        take(prev);
        tick(held, tUs);
        tUs += TICK_US;
        flightUs += TICK_US;
        take(cur);
      }
      return n;
    },
    events() { return []; },
    // After the page moves the quad (spawn, portal): no streak from the old pose.
    resetPose() {
      take(cur);
      take(prev);
    },
    getState(out = emptyState()) {
      out.kind = 'js';
      out.flightMs = flightUs / 1000;
      lerpPose(prev, cur, Math.min(1, accUs / TICK_US), out);
      copyVec(out.omega, qp.omega);
      out.armed = !!qp.armed;
      out.airborne = !!qp.airborne;
      out.flightMode = qp.flightMode;
      const att = qp.attitude;
      out.attitude.roll = att.roll;
      out.attitude.pitch = att.pitch;
      const mo = qp.motorOutputs;
      for (let i = 0; i < 4; i++) out.motorOutputs[i] = mo[i];
      out.totalThrustAbsN = qp.totalThrustAbsN || Math.abs(qp.totalThrustN);
      out.twr = qp.twr;
      out.armingDisableFlags = 0;
      if (extras) extras(out);
      return out;
    },
  };
  return core;
}

// ---- The bf core: quadmath-sim-core ----

// Betaflight's arming-disable flags (runtime_config.h:43-68), by bit.
export const ARMING_FLAGS = [
  'NO_GYRO', 'FAILSAFE', 'RX_FAILSAFE', 'NOT_DISARMED', 'BOXFAILSAFE', 'RUNAWAY_TAKEOFF', 'CRASH_DETECTED', 'THROTTLE',
  'ANGLE', 'BOOT_GRACE_TIME', 'NOPREARM', 'LOAD', 'CALIBRATING', 'CLI', 'CMS_MENU', 'BST', 'MSP', 'PARALYZE', 'GPS',
  'RESC', 'DSHOT_TELEM', 'REBOOT_REQUIRED', 'DSHOT_BITBANG', 'ACC_CALIBRATION', 'MOTOR_PROTOCOL', 'ARM_SWITCH',
];
export const armingFlagNames = (flags) => ARMING_FLAGS.filter((_, bit) => flags & (1 << bit));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const us = (v) => Math.round(clamp(1500 + 500 * v, 1000, 2000));

// ---- The bf core's aux channels ----

// AUX1..AUX12, after the four sticks: the 16 channels sim-core takes.
export const AUX_CHANNELS = 12;

// The mode boxes the page drives from its own controls (keyboard, touch, a
// gamepad with no switches), by Betaflight's permanent box id
// (msp/msp_box.c). PREARM goes with ARM.
const PAGE_BOXES = { 0: 'arm', 1: 'angle', 2: 'horizon', 35: 'flip', 36: 'arm' };

// Betaflight's aux slots, as its CLI prints them ("aux index box channel low
// high logic linkedTo"; SimCore.diff() gives them), as ranges: { box, ch (0
// is AUX1), lo, hi, and }, on Betaflight's 25 us steps. A range is active for
// lo <= value < hi, the value clamped to 900..2099 (fc/rc_modes.c
// isRangeActive); a range with lo >= hi is never active and is left out. and:
// the box's ranges must all be active (logic AND), not any one (OR). Linked
// modes (linkedTo) are not followed.
export function auxRanges(text) {
  const out = [];
  const step = (v) => 900 + 25 * Math.floor((clamp(v, 900, 2100) - 900) / 25);
  for (const line of String(text || '').split(/\r\n|\r|\n/)) {
    const m = line.trim().match(/^aux\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?/);
    if (!m) continue;
    const r = { box: +m[2], ch: +m[3], lo: step(+m[4]), hi: step(+m[5]), and: m[6] === '1' };
    if (r.lo < r.hi && r.ch < AUX_CHANNELS) out.push(r);
  }
  return out;
}

export const rangeActive = (r, value) => {
  const v = clamp(value, 900, 2099);
  return v >= r.lo && v < r.hi;
};

// sim-core takes channels in 1000..2000 only.
const CANDIDATES = [1000, 2000, 1500];
for (let v = 1000; v <= 2000; v += 25) if (!CANDIDATES.includes(v)) CANDIDATES.push(v);

// AUX1..AUX12 values (us) that put the page's boxes where it wants them:
// want { arm, angle, horizon, flip }. A wanted box's first range (in slot
// order: the switch the page moves; ARM and PREARM each have one), or every
// range of an AND box, must be active and an unwanted box's ranges inactive;
// on each channel the value is the first of 1000, 2000, 1500, then
// 1000..2000 by 25 that does that, or the one that misses fewest. Other boxes
// (BEEPER, an OR box's other ranges) land wherever that is, as switches left
// alone would. A channel with no range sits at 1000.
export function pageAux(ranges, want) {
  const first = new Map();
  for (const r of ranges) {
    const name = PAGE_BOXES[r.box];
    if (name && want[name] && !first.has(r.box)) first.set(r.box, r);
  }
  const out = new Array(AUX_CHANNELS).fill(1000);
  for (let ch = 0; ch < AUX_CHANNELS; ch++) {
    const on = ranges.filter((r) => r.ch === ch);
    if (!on.length) continue;
    let best = 1000;
    let bestMiss = Infinity;
    for (const v of CANDIDATES) {
      let miss = 0;
      for (const r of on) {
        const name = PAGE_BOXES[r.box];
        if (!name) continue;
        if (want[name] ? (r.and || first.get(r.box) === r) && !rangeActive(r, v) : rangeActive(r, v)) miss++;
      }
      if (miss < bestMiss) {
        best = v;
        bestMiss = miss;
        if (!miss) break;
      }
    }
    out[ch] = best;
  }
  return out;
}

// A radio's AUX channels as Betaflight should get them, unchanged: every
// gamepad axis the stick map leaves free, in axis order, as AUX1, AUX2, ...
// (a TX16S in USB joystick mode: CH5..CH8 on axes 4..7), at 1500 + 500 x the
// axis, with no sign, deadzone or calibration of the page's. null when the
// pad is not a radio: its map has a spring throttle (a gamepad), or no axis
// is left over for a switch.
export function radioAux(gp, map) {
  if (!gp || !gp.axes || !map || !map.t || map.t.spring) return null;
  const sticks = new Set(['r', 'p', 'y', 't'].map((k) => map[k] && map[k].i));
  const out = [];
  for (let i = 0; i < gp.axes.length && out.length < AUX_CHANNELS; i++) {
    if (sticks.has(i)) continue;
    const v = Number(gp.axes[i]);
    out.push(us(Number.isFinite(v) ? v : -1));
  }
  return out.length ? out : null;
}

// RC channels for core.input(), function order: roll, pitch, yaw, throttle,
// AUX1..AUX12. The sticks pass 1:1 (stick forward is pitch above 1500; the
// throttle 0..1 is 1000..2000). AUX: sample.aux (a radio's, radioAux) as it
// is; otherwise the page's arm intent, flight mode and turtle on the loaded
// config's own switches (ranges, auxRanges).
export function bfChannels(sample, aux, ranges) {
  const ch = new Array(4 + AUX_CHANNELS).fill(1000);
  const radio = Array.isArray(sample.aux);
  ch[0] = us(sample.r);
  ch[1] = us(sample.p);
  ch[2] = us(sample.y);
  ch[3] = !radio && aux.holdThrottle ? 1000 : Math.round(1000 + 1000 * clamp(sample.t, 0, 1));
  const values = radio
    ? sample.aux
    : pageAux(ranges, { arm: !!aux.arm, angle: aux.mode === 'angle', horizon: aux.mode === 'horizon', flip: !!aux.turtle });
  for (let k = 0; k < AUX_CHANNELS; k++) {
    const v = Number(values[k]);
    if (Number.isFinite(v)) ch[4 + k] = Math.round(clamp(v, 1000, 2000));
  }
  return ch;
}

// SimCore is quadmath-sim-core's class (vendor/sim-core/sim-core.js); wasm is
// its module's URL or bytes; airframe the plant file; diff the CLI text;
// world { floorZ, boxes, triggers } in module metres.
export async function createBfCore({ SimCore, wasm, airframe, diff, world }) {
  const sim = await SimCore.load(wasm, { trace: false });
  let config = { diff, plant: airframe, world };
  const report = sim.configure(config);
  // The loaded config's mode switches, as Betaflight has them.
  let ranges = auxRanges(sim.diff('all'));
  // 'page' (the page drives AUX) or 'radio' (a radio's AUX pass through):
  // whichever the last input() sample was.
  let auxSource = 'page';
  const clock = new InputClock();
  const link = new RadioLink(sim);
  const aux = { arm: false, mode: 'angle', turtle: false, holdThrottle: false };
  let holdUntilUs = 0;
  // Turtle: null, or the step it is on (see startTurtle) and when it began.
  let turtle = null;
  let turtleAtUs = 0;
  let uprightAtUs = null;
  let quietAtUs = null;
  const upZ = () => {
    const [, x, y] = sim.state.quat;
    return 1 - 2 * (x * x + y * y);
  };
  // The quad's tilt from level, and Betaflight's estimate of it (fc.attitude
  // roll and pitch, degrees), in degrees.
  const DEG = 180 / Math.PI;
  const tiltDeg = () => Math.acos(clamp(upZ(), -1, 1)) * DEG;
  const estimateTiltDeg = (fc) => Math.acos(clamp(Math.cos(fc.attitude[0] / DEG) * Math.cos(fc.attitude[1] / DEG), -1, 1)) * DEG;
  const toTurtle = (phase) => { turtle = phase; turtleAtUs = sim.simTimeUs; uprightAtUs = null; quietAtUs = null; };
  // A pose sent by respawn() or teleport() lands on the next tick; until a
  // tick has run, getState() reports it rather than the pose it replaces.
  let pendingPose = null;
  let flightUs = 0;
  let pending = [];
  let inputErrors = 0;
  const g = airframe.values.gravity ? airframe.values.gravity.value : 9.81;
  const weightN = airframe.values.mass.value * g;
  const tmaxN = airframe.values.tmax.value;
  // Whatever reboots the instance: a fresh clock, ring and link, disarmed.
  const rebooted = () => {
    clock.rebase();
    link.reset(sim);
    if (auxSource === 'radio') link.drop();
    aux.arm = false;
    aux.holdThrottle = false;
    aux.turtle = false;
    turtle = null;
  };
  const configured = (r) => {
    core.report = r;
    ranges = auxRanges(sim.diff('all'));
  };
  const core = {
    kind: 'bf',
    ready: true,
    report,
    sim,
    link,
    aux,
    maxThrustN: 4 * tmaxN,
    cells: airframe.values.cells ? airframe.values.cells.value : 1,
    get simTimeUs() { return sim.simTimeUs; },
    get alpha() { return sim.alpha; },
    get tickUs() { return sim.tickUs; },
    get flightMs() { return flightUs / 1000; },
    get inputErrors() { return inputErrors; },
    stamp(wallMs) { return clock.stamp(sim, wallMs); },
    anchor(wallMs) { clock.anchor(sim, wallMs); },
    // The loaded config's aux ranges (auxRanges), and the page's modes and
    // AUX numbers on them.
    get auxRanges() { return ranges; },
    get auxSource() { return auxSource; },
    hasMode(mode) {
      return mode === 'acro' || ranges.some((r) => PAGE_BOXES[r.box] === mode && r.box !== 36);
    },
    auxOf(mode) {
      const r = ranges.find((x) => PAGE_BOXES[x.box] === mode && x.box !== 36);
      return r ? r.ch + 1 : null;
    },
    // sample: { r, p, y, t } and, from a radio, aux (radioAux). A change of
    // source drops the page's arm intent and any turtle; a radio taking over
    // also drops the link for a moment.
    input(sample, stampUs) {
      const source = Array.isArray(sample.aux) ? 'radio' : 'page';
      if (source !== auxSource) {
        auxSource = source;
        aux.arm = false;
        aux.holdThrottle = false;
        aux.turtle = false;
        turtle = null;
        // A radio taking over: the link drops and comes back with its
        // switches as they are, so an ARM already on meets Betaflight's
        // guard (NOT_DISARMED), as at a boot.
        if (source === 'radio') link.drop();
      }
      try {
        sim.input(bfChannels(sample, aux, ranges), stampUs);
        link.sample(stampUs);
      } catch (err) {
        inputErrors++;
      }
    },
    // Arm intent drives the ARM switch; Betaflight decides. holdThrottle
    // sends the throttle low with it until Betaflight has armed or 200 ms
    // have passed, so a throttle-rise auto-arm meets Betaflight's
    // low-throttle check.
    // A disarm also ends a turtle.
    setArm(on, { holdThrottle = false } = {}) {
      aux.arm = !!on;
      aux.holdThrottle = !!on && holdThrottle;
      holdUntilUs = sim.simTimeUs + 200_000;
      if (!on && turtle) {
        aux.turtle = false;
        turtle = null;
      }
    },
    setMode(mode) { aux.mode = mode; },
    setTurtle(on) { aux.turtle = !!on; },
    // Turtle is Betaflight's own crash flip, on the config's FLIP OVER AFTER
    // CRASH switch (AUX3 on the owner's Air65). Betaflight enters it only when
    // it arms with that switch on, and leaves it only on a disarm (fc/core.c
    // tryArm, disarm), so on page-driven aux the page runs the switch the way
    // a pilot would:
    //   'disarm'  armed when it began: ARM off, FLIP on, until disarmed;
    //   'arm'     ARM on, throttle held low, until armed in crash flip;
    //   'flip'    the roll and pitch sticks drive crash flip, until upright
    //             for 150 ms (a disarm mid-roll lets it roll on over);
    //   'rearm'   FLIP off and ARM off (that disarm ends crash flip), until
    //             the pilot's throttle is low and the sticks centred, the
    //             quad at rest, Betaflight showing no arming flag, its
    //             filtered gyro quiet (under 0.5 deg/s on every axis) for
    //             500 ms and its attitude estimate agreeing with the quad's
    //             tilt to 0.1 degrees, its resolution; then ARM on: armed to fly. (A fast
    //             flip outruns the gyro's 2000 deg/s: the estimate is left
    //             degrees off and the filtered gyro rings for a while after,
    //             and armed in angle mode on the floor that error grows
    //             until the quad rolls onto its side; disarmed, both settle.
    //             An arm with the roll stick still over flies it back onto
    //             its back. ARM on with any flag latches ARM_SWITCH until ARM
    //             drops.)
    get turtlePhase() { return turtle; },
    // false when the config has no FLIP OVER AFTER CRASH switch.
    startTurtle() {
      if (turtle) return true;
      if (!ranges.some((r) => r.box === 35)) return false;
      aux.turtle = true;
      aux.holdThrottle = false;
      if (sim.fc.armed) {
        aux.arm = false;
        toTurtle('disarm');
      } else {
        aux.arm = true;
        aux.holdThrottle = true;
        holdUntilUs = sim.simTimeUs + 200_000;
        toTurtle('arm');
      }
      return true;
    },
    // Once per input sample, before input(). throttleLow: the pilot's throttle
    // is low enough to arm; sticksCentred: roll, pitch and yaw near centre.
    // Returns what changed: 'flip' (in crash flip),
    // 'upright', 'rearm' (ARM back on), 'refused' (Betaflight did not arm
    // into crash flip; the reason is in armingDisableFlags), 'ended'
    // (Betaflight disarmed during the flip), or null.
    stepTurtle(throttleLow, sticksCentred = true) {
      const fc = sim.fc;
      const sinceUs = sim.simTimeUs - turtleAtUs;
      switch (turtle) {
        case 'disarm':
          if (!fc.armed) {
            aux.arm = true;
            aux.holdThrottle = true;
            holdUntilUs = sim.simTimeUs + 200_000;
            toTurtle('arm');
          }
          return null;
        case 'arm':
          if (fc.armed && fc.crashFlip) {
            toTurtle('flip');
            return 'flip';
          }
          if (sinceUs > 400_000) {
            aux.turtle = false;
            aux.arm = false;
            aux.holdThrottle = false;
            turtle = null;
            return 'refused';
          }
          return null;
        case 'flip':
          if (!fc.armed) {
            aux.turtle = false;
            aux.arm = false;
            turtle = null;
            return 'ended';
          }
          if (upZ() <= 0.9) uprightAtUs = null;
          else if (uprightAtUs === null) uprightAtUs = sim.simTimeUs;
          else if (sim.simTimeUs - uprightAtUs >= 150_000) {
            aux.turtle = false;
            aux.arm = false;
            toTurtle('rearm');
            return 'upright';
          }
          return null;
        case 'rearm':
          if (fc.gyroFiltered.some((g) => Math.abs(g) >= 0.5)) quietAtUs = null;
          else if (quietAtUs === null) quietAtUs = sim.simTimeUs;
          if (!fc.armed && throttleLow && sticksCentred && (fc.armingDisableFlags & ~(1 << 25)) === 0
            && quietAtUs !== null && sim.simTimeUs - quietAtUs >= 500_000
            && Math.hypot(...sim.state.omega) < 0.5 && Math.abs(estimateTiltDeg(fc) - tiltDeg()) < 0.1) {
            aux.arm = true;
            turtle = null;
            return 'rearm';
          }
          return null;
        default:
          return null;
      }
    },
    // want: whether the radio link should be up (false while calibrating).
    // onEvent(e), if given, is called for each event as it happens: a tick
    // that enters a trigger ends sim.advance() early, so a portal's teleport
    // lands on the next tick (sim-core.js advance()), not a frame later.
    advance(frameMs, want = true, onEvent = null) {
      if (!(frameMs >= 0)) return 0;
      const flush = () => {
        for (const e of sim.events()) {
          if (onEvent) onEvent(e);
          else pending.push(e);
        }
      };
      let ran = sim.advance(frameMs);
      if (ran) pendingPose = null;
      flush();
      while (sim.alpha >= 1) {
        const more = sim.advance(0);
        if (more) pendingPose = null;
        ran += more;
        flush();
        if (!more) break;
      }
      flightUs += ran * TICK_US;
      link.update(want);
      if (aux.holdThrottle && (sim.fc.armed || sim.simTimeUs >= holdUntilUs)) {
        if (!sim.fc.armed) aux.arm = false;   // Betaflight refused: the reason is on the OSD
        aux.holdThrottle = false;
      }
      return ran;
    },
    events() {
      const out = pending;
      pending = [];
      return out;
    },
    // q defaults to the latest tick's attitude (not a render-interpolated one).
    teleport(pos, q = null, vel = { x: 0, y: 0, z: 0 }) {
      if (!q) {
        const [w, x, y, z] = sim.state.quat;
        q = { x, y, z, w };
      }
      sim.teleport({ pos: [pos.x, pos.y, pos.z], quat: [q.w, q.x, q.y, q.z], vel: [vel.x, vel.y, vel.z] });
      pendingPose = { pos: { ...pos }, q: { x: q.x, y: q.y, z: q.z, w: q.w }, vel: { ...vel } };
    },
    // A fresh instance at pos/q, disarmed. world: a new world (configure again,
    // full pack); otherwise reinit, the pack carried unless freshPack.
    respawn(pos, q, { freshPack = false, world = null } = {}) {
      if (world) {
        config = { ...config, world };
        configured(sim.configure(config));
      } else {
        sim.reinit({ freshPack });
      }
      pending = [];
      rebooted();
      core.teleport(pos, q);
    },
    // A new CLI diff on the same world: configure again (Betaflight reboots).
    loadDiff(text) {
      config = { ...config, diff: text };
      const r = sim.configure(config);
      configured(r);
      pending = [];
      rebooted();
      return r;
    },
    getState(out = emptyState()) {
      const s = sim.lerpState();
      const fc = sim.fc;
      out.kind = 'bf';
      out.flightMs = flightUs / 1000;
      let [px, py, pz] = s.pos;
      let [vx, vy, vz] = s.vel;
      let [qw, qx, qy, qz] = s.quat;
      if (pendingPose) {
        ({ x: px, y: py, z: pz } = pendingPose.pos);
        ({ x: vx, y: vy, z: vz } = pendingPose.vel);
        ({ x: qx, y: qy, z: qz, w: qw } = pendingPose.q);
      }
      out.position.x = px; out.position.y = py; out.position.z = pz;
      out.velocity.x = vx; out.velocity.y = vy; out.velocity.z = vz;
      out.quaternion.x = qx; out.quaternion.y = qy; out.quaternion.z = qz; out.quaternion.w = qw;
      out.omega.x = s.omega[0]; out.omega.y = s.omega[1]; out.omega.z = s.omega[2];
      out.armed = !!fc.armed;
      out.airborne = !!s.airborne;
      out.clearance = s.groundClearance;
      out.flightMode = fc.mode.angle ? 'angle' : fc.mode.horizon ? 'horizon' : 'acro';
      // Roll and pitch as quadphysics.js's attitudeOf: from the body up axis.
      const ux = 2 * (qx * qz + qw * qy);
      const uy = 2 * (qy * qz - qw * qx);
      const uz = 1 - 2 * (qx * qx + qy * qy);
      out.attitude.roll = Math.atan2(-uy, uz);
      out.attitude.pitch = Math.atan2(ux, uz);
      for (let i = 0; i < 4; i++) out.motorOutputs[i] = s.motorOut[i];
      const thrust = s.thrustN.reduce((a, b) => a + Math.abs(b), 0);
      out.totalThrustAbsN = thrust;
      out.twr = thrust / weightN;
      out.battV = fc.vbat;
      out.soc = s.soc;
      out.armingDisableFlags = fc.armingDisableFlags;
      out.crashFlip = !!fc.crashFlip;
      return out;
    },
  };
  return core;
}
