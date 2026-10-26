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
// (configure, reinit) leaves the link up: unlike the fly harness, this page's
// AUX1 is the pilot's arm intent, forced low on every boot, so no stale
// switch can arm a fresh instance and there is nothing to guard.
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

// RC channels for core.input(), function order: roll, pitch, yaw, throttle,
// AUX1..AUX12. The sticks pass 1:1 (stick forward is pitch above 1500; the
// throttle 0..1 is 1000..2000). The aux layout is the one sim-core adds to a
// diff with no ARM box (cli-policy.js): ARM on AUX1, ANGLE on AUX2, HORIZON on
// AUX3, FLIP OVER AFTER CRASH on AUX4, each on at 1700..2100.
export function bfChannels(sample, aux) {
  const ch = new Array(16).fill(1000);
  ch[0] = us(sample.r);
  ch[1] = us(sample.p);
  ch[2] = us(sample.y);
  ch[3] = aux.holdThrottle ? 1000 : Math.round(1000 + 1000 * clamp(sample.t, 0, 1));
  ch[4] = aux.arm ? 2000 : 1000;
  ch[5] = aux.mode === 'angle' ? 2000 : 1000;
  ch[6] = aux.mode === 'horizon' ? 2000 : 1000;
  ch[7] = aux.turtle ? 2000 : 1000;
  return ch;
}

// SimCore is quadmath-sim-core's class (vendor/sim-core/sim-core.js); wasm is
// its module's URL or bytes; airframe the plant file; diff the CLI text;
// world { floorZ, boxes, triggers } in module metres.
export async function createBfCore({ SimCore, wasm, airframe, diff, world }) {
  const sim = await SimCore.load(wasm, { trace: false });
  let config = { diff, plant: airframe, world };
  const report = sim.configure(config);
  const clock = new InputClock();
  const link = new RadioLink(sim);
  const aux = { arm: false, mode: 'angle', turtle: false, holdThrottle: false };
  let holdUntilUs = 0;
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
    aux.arm = false;
    aux.holdThrottle = false;
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
    input(sample, stampUs) {
      try {
        sim.input(bfChannels(sample, aux), stampUs);
        link.sample(stampUs);
      } catch (err) {
        inputErrors++;
      }
    },
    // Arm intent drives AUX1; Betaflight decides. holdThrottle sends the
    // throttle low with it until Betaflight has armed or 200 ms have passed,
    // so a throttle-rise auto-arm meets Betaflight's low-throttle check.
    setArm(on, { holdThrottle = false } = {}) {
      aux.arm = !!on;
      aux.holdThrottle = !!on && holdThrottle;
      holdUntilUs = sim.simTimeUs + 200_000;
    },
    setMode(mode) { aux.mode = mode; },
    setTurtle(on) { aux.turtle = !!on; },
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
        sim.configure(config);
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
      return out;
    },
  };
  return core;
}
