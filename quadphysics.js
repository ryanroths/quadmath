// quadphysics.js — QuadMath sim physics core v2
// Steps 1-3: four-motor model + mixer, simulated FC rate loop (PID+FF), rotational inertia.
// Self-contained ES module. SI units. Body frame: X forward, Y left, Z up (prop thrust axis).
// Integrate: const qp = new QuadPhysics(PRESETS.whoop65); qp.step(dt, sticksRadPerSec, throttle01);
// Read qp.position (world, m), qp.quaternion [x,y,z,w], qp.velocity, qp.motorOutputs.

// ---------------------------------------------------------------------------
// Presets — mass kg, wheelbase m (motor-to-motor diagonal), prop diameter m,
// maxThrustPerMotor N, motorTau s (spool time constant), kQ yaw torque ratio.
// Derived from real-world averages. Tweak freely; calculator can feed these.
// ---------------------------------------------------------------------------
export const PRESETS = {
  // Whoop thrust set to ~4.1:1 TWR, matching what this sim ran before the
  // physics swap (3.9 world-N over 28g). The module's original 3:1 was 28% less
  // thrust and 34% less climb acceleration, which read as rotation being wildly
  // faster than throttle.
  //
  // kQ raised ~50x across the board. At the original values the yaw axis could
  // not reach its own commanded rate (95 deg/s of a commanded 286) and the loop
  // sat saturated, so a yaw spin carried for more than a full rotation after the
  // stick centred. Relative spacing between presets is unchanged.
  whoop65: {
    name: '65mm whoop',
    mass: 0.027, wheelbase: 0.065, propDiameter: 0.031,
    maxThrustPerMotor: 0.27,      // ~1.08N total, ~4.1:1 TWR
    motorTau: 0.020,               // tiny props spool fast
    kQ: 0.60,                      // yaw torque per unit thrust (N·m per N, scaled by arm)
    idleThrottle: 0.055,
  },
  whoop75: {
    name: '75mm whoop',
    mass: 0.032, wheelbase: 0.075, propDiameter: 0.040,
    maxThrustPerMotor: 0.32, motorTau: 0.024, kQ: 0.65, idleThrottle: 0.055,
  },
  whoop85: {
    name: '85mm whoop',
    mass: 0.048, wheelbase: 0.085, propDiameter: 0.051,   // 2" props
    maxThrustPerMotor: 0.48, motorTau: 0.028, kQ: 0.70, idleThrottle: 0.055,
  },
  freestyle25: {
    name: '2.5" freestyle',
    mass: 0.120, wheelbase: 0.115, propDiameter: 0.063,
    maxThrustPerMotor: 1.4, motorTau: 0.040, kQ: 0.80, idleThrottle: 0.045,
  },
  freestyle5: {
    name: '5" freestyle',
    mass: 0.650, wheelbase: 0.225, propDiameter: 0.127,
    maxThrustPerMotor: 9.0, motorTau: 0.060, kQ: 1.00, idleThrottle: 0.040,
  },
};

// Default FC tune — Betaflight-flavored. Loadable from your tune DB:
// map CLI P/I/D (0-255 scale) via the *Scale constants below.
export const DEFAULT_TUNE = {
  // Betaflight raw values (what users see in configurator / CLI dump)
  rollP: 45, rollI: 80, rollD: 30, rollF: 120,
  pitchP: 47, pitchI: 84, pitchD: 34, pitchF: 125,
  yawP: 45, yawI: 80, yawD: 0, yawF: 120,
  gyroLpfHz: 100,   // gyro lowpass cutoff
  dtermLpfHz: 70,   // D-term lowpass cutoff
  itermLimit: 0.4,  // anti-windup clamp (fraction of motor range)
};

// Betaflight-value → physical-gain scaling. One knob set for all crafts;
// per-craft feel differences then come from inertia/thrust, which is the point.
// Retuned as a set against the 65mm preset. The original ratio put ki/kp at
// ~12.7 s^-1 — an 0.08s integrator time constant — so on any axis that
// saturated, the I-term ran away and dominated P by ~30x. Releasing the stick
// after a yaw spin then made the rate keep RISING before ringing +/-5 rad/s.
// P up 5x, I down ~8x, D and F up with P: rate tracking is now 1.0 with ~3%
// overshoot on roll, and yaw stops in under half a second instead of never.
const P_SCALE = 0.00040;
const I_SCALE = 0.000072;
const D_SCALE = 0.0000055;
const F_SCALE = 0.0000225;

const G = 9.81;
// Rate/PID loop. 240 Hz was the v2 default and read floaty next to a 1 kHz
// FC. 500 Hz is the new floor; 1000 Hz is used when the render loop has
// headroom. Legacy 240 stays exported so tests can compare, not for playback —
// ghosts are kinematic pose tracks, not physics replays.
export const PHYSICS_HZ_LEGACY = 240;
export const PHYSICS_HZ_DEFAULT = 500;
export const PHYSICS_HZ_FAST = 1000;
// Floatiness 0 = snappy stop, 1 = the old 240 Hz coast. Default is tighter
// than the previous feel. Saved in the page under quadmathSimFloatiness.
export const FLOATINESS_DEFAULT = 0.32;

// Flight modes (M1). Angle self-levels to a max tilt; Horizon blends Angle at
// stick center into Acro at full deflection; Acro is raw rate setpoints.
// ANGLE_MAX_DEG is the lean limit in Angle (Betaflight's angle_limit is 60° —
// enough to translate, not enough to flip). ANGLE_P is the attitude P gain
// in (rad/s) per rad of error; a touch under the old 7.5 so a 60° cap does
// not ring, while a 40° error still returns to level in under a second.
export const FLIGHT_MODES = Object.freeze(['angle', 'horizon', 'acro']);
export const ANGLE_MAX_DEG = 60;
export const ANGLE_P = 6.8;
const ANGLE_MAX_RAD = ANGLE_MAX_DEG * Math.PI / 180;
const ANGLE_RATE_LIM = 10; // rad/s, attitude-loop ceiling
// Reverse thrust is a bit less efficient than forward (same curve, scaled).
export const REVERSE_THRUST_SCALE = 0.85;

// ---------------------------------------------------------------------------
// Small vec/quat helpers (no deps — keep module standalone)
// ---------------------------------------------------------------------------
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const vAdd = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const vScale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
const vCross = (a, b) => v3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);

// rotate vector by quaternion [x,y,z,w]
function qRotate(q, v) {
  const { x, y, z, w } = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return v3(
    v.x + w * tx + (y * tz - z * ty),
    v.y + w * ty + (z * tx - x * tz),
    v.z + w * tz + (x * ty - y * tx),
  );
}

function qNormalize(q) {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= n; q.y /= n; q.z /= n; q.w /= n;
  return q;
}

// integrate quaternion by body angular velocity ω (rad/s) over dt
function qIntegrate(q, omega, dt) {
  const hx = omega.x * dt * 0.5, hy = omega.y * dt * 0.5, hz = omega.z * dt * 0.5;
  const dq = {
    x: q.w * hx + q.y * hz - q.z * hy,
    y: q.w * hy + q.z * hx - q.x * hz,
    z: q.w * hz + q.x * hy - q.y * hx,
    w: -q.x * hx - q.y * hy - q.z * hz,
  };
  q.x += dq.x; q.y += dq.y; q.z += dq.z; q.w += dq.w;
  return qNormalize(q);
}

// Body attitude from the module quaternion (Z-up, X-forward, Y-left).
// roll > 0 = right wing down; pitch > 0 = nose up. Independent of three.js.
export function attitudeOf(q) {
  const uz = qRotate(q, v3(0, 0, 1));
  return {
    roll: Math.atan2(-uz.y, uz.z),
    pitch: Math.atan2(uz.x, uz.z),
  };
}

// Quadratic ground-effect cushion. Exported so W2 tests can pin the shape
// without constructing a full QuadPhysics. kGE is the max bonus at zero
// clearance; fade is complete at two prop diameters.
export function groundEffectMult(clearanceM, propDiameterM, kGE) {
  const k = kGE == null ? 0.12 : kGE;
  const ceil = 2 * (propDiameterM || 0.031);
  if (!(clearanceM < ceil) || k <= 0) return 1;
  const x = 1 - Math.max(0, clearanceM) / ceil;
  return 1 + k * x * x;
}

// first-order lowpass
class LPF {
  constructor(cutoffHz, dt) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    this.k = dt / (rc + dt);
    this.y = 0;
  }
  filter(x) { this.y += this.k * (x - this.y); return this.y; }
  reset(v = 0) { this.y = v; }
}

// ---------------------------------------------------------------------------
// Motor: first-order spool toward commanded output. Thrust ∝ output^thrustExp.
// ---------------------------------------------------------------------------
class Motor {
  constructor(pos, dir, cfg) {
    this.pos = pos;         // body-frame position (m)
    this.dir = dir;         // +1 CCW, -1 CW (prop rotation, top view)
    this.cfg = cfg;
    this.output = 0;        // actual normalized 0..1 (≈ RPM fraction)
    this.command = 0;       // mixer request 0..1
  }
  step(dt) {
    const base = this.cfg.motorTau * (this.cfg.spoolTauMul != null ? this.cfg.spoolTauMul : 1);
    const down = this.cfg.spoolDownMul != null ? this.cfg.spoolDownMul : 1.4;
    // 3D commands are signed. Spool-up is increasing |output|; crossing
    // through zero to reverse is a spool-down then a spool-up.
    const sameSign = this.command === 0 || this.output === 0
      || (this.command < 0) === (this.output < 0);
    const speedingUp = sameSign && Math.abs(this.command) > Math.abs(this.output);
    const tau = speedingUp ? base : base * down;
    this.output += (this.command - this.output) * (dt / (tau + dt));
  }
  thrust() {
    const e = this.cfg.thrustExp != null ? this.cfg.thrustExp : 2;
    const mag = Math.abs(this.output);
    if (mag < 1e-12) return 0;
    const sign = this.output < 0 ? -1 : 1;
    const scale = sign < 0
      ? (this.cfg.reverseThrustScale != null ? this.cfg.reverseThrustScale : 1)
      : 1;
    return sign * scale * this.cfg.maxThrustPerMotor * Math.pow(mag, e);
  }
  // reaction torque about body Z: CW prop pushes airframe CCW and vice versa
  yawTorque() { return -this.dir * this.cfg.kQ * this.thrust() * (this.cfg.wheelbase * 0.5); }
}

// ---------------------------------------------------------------------------
// Rate-loop PID + FF per axis
// ---------------------------------------------------------------------------
class RateAxis {
  constructor(P, I, D, F, tune, dt) {
    this.kp = P * P_SCALE;
    this.ki = I * I_SCALE;
    this.kd = D * D_SCALE;
    this.kf = F * F_SCALE;
    this.iterm = 0;
    this.itermLimit = tune.itermLimit;
    this.prevGyro = 0;
    this.prevSetpoint = 0;
    this.gyroLpf = new LPF(tune.gyroLpfHz, dt);
    this.dtermLpf = new LPF(tune.dtermLpfHz, dt);
    this.dt = dt;
  }
  update(setpoint, gyroRaw, airborne) {
    const gyro = this.gyroLpf.filter(gyroRaw);
    const error = setpoint - gyro;

    const p = this.kp * error;

    this.iterm += this.ki * error * this.dt;
    this.iterm = Math.max(-this.itermLimit, Math.min(this.itermLimit, this.iterm));
    // 0.99 per 240 Hz step ≈ e^(-2.41 t). Keep the same time-constant at 500/1000 Hz.
    if (!airborne) this.iterm *= Math.exp(-2.41 * this.dt);

    // D on gyro (measurement), filtered — Betaflight style
    const dGyro = (gyro - this.prevGyro) / this.dt;
    const d = -this.kd * this.dtermLpf.filter(dGyro);
    this.prevGyro = gyro;

    // Feedforward from setpoint derivative — responds to stick motion before error grows
    const dSet = (setpoint - this.prevSetpoint) / this.dt;
    this.prevSetpoint = setpoint;
    const f = this.kf * dSet;

    return p + this.iterm + d + f;
  }
  reset() {
    this.iterm = 0; this.prevGyro = 0; this.prevSetpoint = 0;
    this.gyroLpf.reset(); this.dtermLpf.reset();
  }
}

// ---------------------------------------------------------------------------
// QuadPhysics — the rigid body + FC + motors
// ---------------------------------------------------------------------------
export class QuadPhysics {
  constructor(preset = PRESETS.whoop65, tune = DEFAULT_TUNE) {
    this.physicsHz = PHYSICS_HZ_DEFAULT;
    this.physicsDt = 1 / PHYSICS_HZ_DEFAULT;
    this.floatiness = FLOATINESS_DEFAULT;
    this.flightMode = 'angle';
    this.threeD = false;
    this.rc = { r: 0, p: 0, y: 0 };
    this.accumulator = 0;
    this.setPreset(preset);
    this.setTune(tune);
    this.setFloatiness(FLOATINESS_DEFAULT);
    this.reset();
    // hook: existing drag model. fn(velocityWorld, quadState) -> world-frame force N.
    // Replace with anisotropic body-frame drag in step 4.
    this.externalDrag = null;
    // hook: collision. fn(state) called after each substep; mutate position/velocity there.
    this.onSubstep = null;
    // hook: ground effect. fn(state) -> clearance above the surface directly
    // below, in meters (SI). When set, thrust picks up a smooth cushion bonus
    // below ~2 prop diameters. Null disables the effect entirely.
    this.groundClearance = null;
    // hook: W2 disturbances (propwash, indoor drafts). fn(state) ->
    // {force, torque} in SI (world newtons, body N·m). Applied after drag.
    this.externalDisturbance = null;
  }

  setPreset(preset) {
    this.cfg = { ...preset };
    if (this.cfg.reverseThrustScale == null) this.cfg.reverseThrustScale = REVERSE_THRUST_SCALE;
    const d = this.cfg.wheelbase / (2 * Math.SQRT2); // arm offset per axis, quad-X
    // Quad-X layout, props-out ref (Betaflight motor order):
    // M1 rear-right CW, M2 front-right CCW, M3 rear-left CCW, M4 front-left CW
    this.motors = [
      new Motor(v3(-d, -d, 0), -1, this.cfg),
      new Motor(v3( d, -d, 0),  1, this.cfg),
      new Motor(v3(-d,  d, 0),  1, this.cfg),
      new Motor(v3( d,  d, 0), -1, this.cfg),
    ];
    // Inertia: flat box approximation. h = vertical extent ≈ 0.35 * wheelbase.
    const m = this.cfg.mass, w = this.cfg.wheelbase, h = w * 0.35;
    this.inertia = v3(
      (m / 12) * (w * w + h * h),      // Ixx roll
      (m / 12) * (w * w + h * h),      // Iyy pitch
      (m / 12) * (w * w * 2),          // Izz yaw — mass spread in the prop plane
    );
    if (this.floatiness != null) this.setFloatiness(this.floatiness);
    if (this.pid) this.resetControllers();
  }

  setTune(tune) {
    this.tune = { ...DEFAULT_TUNE, ...tune };
    this.resetControllers();
  }

  resetControllers() {
    const t = this.tune;
    const dt = this.physicsDt || (1 / PHYSICS_HZ_DEFAULT);
    this.pid = {
      roll:  new RateAxis(t.rollP,  t.rollI,  t.rollD,  t.rollF,  t, dt),
      pitch: new RateAxis(t.pitchP, t.pitchI, t.pitchD, t.pitchF, t, dt),
      yaw:   new RateAxis(t.yawP,   t.yawI,   t.yawD,   t.yawF,   t, dt),
    };
  }

  setPhysicsHz(hz) {
    const allowed = [PHYSICS_HZ_LEGACY, PHYSICS_HZ_DEFAULT, PHYSICS_HZ_FAST];
    const h = allowed.includes(hz) ? hz : PHYSICS_HZ_DEFAULT;
    if (h === this.physicsHz) return h;
    this.physicsHz = h;
    this.physicsDt = 1 / h;
    this.accumulator = 0;
    if (this.tune) this.resetControllers();
    return h;
  }

  // F=0 snappy (stronger drag, faster spool, crisper thrust). F=1 old float.
  setFloatiness(f) {
    const F = Math.max(0, Math.min(1, Number(f)));
    const x = Number.isFinite(F) ? F : FLOATINESS_DEFAULT;
    this.floatiness = x;
    if (!this.cfg) return x;
    this.cfg.spoolTauMul = 0.60 + 0.40 * x;
    this.cfg.spoolDownMul = 1.12 + 0.28 * x;
    this.cfg.thrustExp = 1.70 + 0.30 * x;
    this.cfg.dragMul = 1.65 - 0.65 * x;
    this.cfg.stopDampPerMass = 1.15 * (1 - x);
    this.cfg.groundEffect = 0.05 + 0.07 * x;
    return x;
  }

  reset(position = v3(0, 0, 1)) {
    this.position = { ...position };            // world, m
    this.velocity = v3();                        // world, m/s
    this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    this.omega = v3();                           // body rates rad/s (x roll, y pitch, z yaw)
    this.armed = false;
    this.airborne = false;
    for (const mo of this.motors) { mo.output = 0; mo.command = 0; }
    if (this.pid) this.resetControllers();
  }

  arm() { this.armed = true; }
  disarm() { this.armed = false; this.resetControllers(); }

  setFlightMode(mode) {
    const m = String(mode || '').toLowerCase();
    this.flightMode = FLIGHT_MODES.includes(m) ? m : 'angle';
    return this.flightMode;
  }

  // Betaflight 3D: mixer range -1..1, no idle floor. Reverse thrust is the
  // same curve with cfg.reverseThrustScale (default 0.85) so reverse is a
  // bit less efficient. Real 3D is flown in Acro; the page locks the mode.
  setThreeD(on) {
    this.threeD = !!on;
    return this.threeD;
  }

  get attitude() { return attitudeOf(this.quaternion); }

  // Mix Angle / Horizon / Acro into a rate setpoint (rad/s).
  // acroSetpoint is the existing Betaflight-rates output (unchanged).
  // stick is {r,p,y} in -1..1, mode 2: r right, p up (nose down), y right.
  flightSetpoint(stick, acroSetpoint) {
    const acro = acroSetpoint || { roll: 0, pitch: 0, yaw: 0 };
    const s = stick || this.rc || { r: 0, p: 0, y: 0 };
    const yaw = acro.yaw || 0;
    if (this.flightMode === 'acro') return { roll: acro.roll, pitch: acro.pitch, yaw };

    const att = attitudeOf(this.quaternion);
    const targetRoll = (s.r || 0) * ANGLE_MAX_RAD;
    const targetPitch = -(s.p || 0) * ANGLE_MAX_RAD; // stick up → nose down
    let roll = (targetRoll - att.roll) * ANGLE_P;
    let pitch = (targetPitch - att.pitch) * ANGLE_P;
    if (roll > ANGLE_RATE_LIM) roll = ANGLE_RATE_LIM; else if (roll < -ANGLE_RATE_LIM) roll = -ANGLE_RATE_LIM;
    if (pitch > ANGLE_RATE_LIM) pitch = ANGLE_RATE_LIM; else if (pitch < -ANGLE_RATE_LIM) pitch = -ANGLE_RATE_LIM;

    if (this.flightMode === 'angle') return { roll, pitch, yaw };

    // Horizon: quadratic blend so the center is strongly self-level and full
    // stick is fully acro (flips/rolls allowed).
    const mag = Math.min(1, Math.hypot(s.r || 0, s.p || 0));
    const w = mag * mag;
    return {
      roll: roll * (1 - w) + (acro.roll || 0) * w,
      pitch: pitch * (1 - w) + (acro.pitch || 0) * w,
      yaw,
    };
  }

  // -------------------------------------------------------------------------
  // Main entry. Call once per render frame.
  //   frameDt: seconds since last frame
  //   setpoint: {roll, pitch, yaw} desired body rates rad/s (feed your existing
  //             Betaflight rates math output here — sticks → rates unchanged)
  //   throttle: 0..1 (post-curve). In 3D mode: -1..1 collective (center = 0).
  //   stick: optional {r,p,y} -1..1; required for Angle/Horizon mixing
  // Fixed physicsHz substeps internally regardless of render rate.
  // -------------------------------------------------------------------------
  step(frameDt, setpoint, throttle, stick) {
    if (stick) this.rc = { r: stick.r || 0, p: stick.p || 0, y: stick.y || 0 };
    const pdt = this.physicsDt;
    this.accumulator += Math.min(frameDt, 0.1); // clamp huge hitches
    while (this.accumulator >= pdt) {
      this.substep(setpoint, throttle);
      this.accumulator -= pdt;
    }
  }

  substep(setpoint, throttle) {
    const dt = this.physicsDt;
    const cfg = this.cfg;
    const sp = this.flightSetpoint(this.rc, setpoint);

    // ---- FC: rate loop ----
    let r = 0, p = 0, y = 0, thr = 0;
    const threeD = !!this.threeD;
    if (this.armed) {
      r = this.pid.roll.update(sp.roll, this.omega.x, this.airborne);
      p = this.pid.pitch.update(sp.pitch, this.omega.y, this.airborne);
      y = this.pid.yaw.update(sp.yaw, this.omega.z, this.airborne);
      if (threeD) {
        // 3D collective is already -1..1. No idle: center stick is true zero.
        thr = Math.max(-1, Math.min(1, throttle || 0));
      } else {
        thr = cfg.idleThrottle + throttle * (1 - cfg.idleThrottle); // Betaflight idle
      }
    }

    // ---- Mixer, quad-X (Betaflight order M1..M4) + airmode desaturation ----
    // roll: right motors down / left up → M1,M2 get -r ... signs per layout:
    // Yaw signs: a CW prop (dir -1) pushes the airframe CCW, i.e. +Z, per
    // yawTorque() below. So a positive yaw demand must RAISE the CW pair
    // (M1/M4) and lower the CCW pair (M2/M3) to make positive torque.z.
    // With the signs the other way round the rate loop is positive feedback:
    // +1 rad/s commanded settled at -0.88 rad/s measured, held there only by
    // mixer desaturation.
    let m = [
      thr - r + p + y,   // M1 rear-right  CW
      thr - r - p - y,   // M2 front-right CCW
      thr + r + p - y,   // M3 rear-left   CCW
      thr + r - p + y,   // M4 front-left  CW
    ];
    // Desaturation: shift the whole set to preserve differential (attitude authority),
    // sacrificing collective (throttle) — this IS airmode.
    // 3D uses the full -1..1 motor range (Betaflight 3D / reversible DShot).
    const mMax = Math.max(...m), mMin = Math.min(...m);
    if (threeD) {
      if (mMax - mMin > 2) {
        const mid = (mMax + mMin) / 2;
        const scale = 2 / (mMax - mMin);
        m = m.map(v => (v - mid) * scale);
      } else if (mMax > 1) {
        m = m.map(v => v - (mMax - 1));
      } else if (mMin < -1) {
        m = m.map(v => v + (-1 - mMin));
      }
      for (let i = 0; i < 4; i++) {
        this.motors[i].command = Math.max(-1, Math.min(1, m[i]));
        this.motors[i].step(dt);
      }
    } else {
      if (mMax - mMin > 1) {
        // demanded differential exceeds full range: scale differential down
        const mid = (mMax + mMin) / 2;
        const scale = 1 / (mMax - mMin);
        m = m.map(v => 0.5 + (v - mid) * scale);
      } else if (mMax > 1) {
        m = m.map(v => v - (mMax - 1));
      } else if (mMin < (this.armed ? cfg.idleThrottle : 0)) {
        const floor = this.armed ? cfg.idleThrottle : 0;
        m = m.map(v => v + (floor - mMin));
      }
      for (let i = 0; i < 4; i++) {
        this.motors[i].command = Math.max(0, Math.min(1, m[i]));
        this.motors[i].step(dt);
      }
    }

    // ---- Ground effect ----
    // Smooth thrust bonus in the cushion zone below ~2 prop diameters.
    // Quadratic fade with height, fully deterministic, no oscillation — this is
    // free lift the pilot can exploit (float landings, floor skims), never a
    // disturbance that fights the sticks. kGE is the max bonus at zero
    // clearance; presets may override via cfg.groundEffect. W2 sliders write
    // that kGE (0 disables).
    let geMult = 1;
    // Reverse collective is thrusting away from the floor when upright, so
    // the cushion would be the wrong sign. Skip GE while 3D is pulling down.
    if (this.groundClearance && !(threeD && thr < 0)) {
      const clr = this.groundClearance(this);
      const kGE = cfg.groundEffect != null ? cfg.groundEffect : 0.12;
      geMult = groundEffectMult(clr, cfg.propDiameter, kGE);
    }

    // ---- Forces & torques (body frame) ----
    let totalThrust = 0;
    let torque = v3();
    for (const mo of this.motors) {
      const t = mo.thrust() * geMult;
      totalThrust += t;
      // thrust along body +Z at motor position → roll/pitch torque = pos × F
      torque = vAdd(torque, vCross(mo.pos, v3(0, 0, t)));
      // yaw from prop reaction torque — NOT a direct force
      torque.z += mo.yawTorque();
    }

    // ---- Rotational dynamics: Euler's equations with gyroscopic cross-coupling ----
    // ω̇ = I⁻¹ (τ − ω × Iω)
    const Iw = v3(this.inertia.x * this.omega.x, this.inertia.y * this.omega.y, this.inertia.z * this.omega.z);
    const gyroCross = vCross(this.omega, Iw);
    this.omega.x += ((torque.x - gyroCross.x) / this.inertia.x) * dt;
    this.omega.y += ((torque.y - gyroCross.y) / this.inertia.y) * dt;
    this.omega.z += ((torque.z - gyroCross.z) / this.inertia.z) * dt;

    qIntegrate(this.quaternion, this.omega, dt);

    // ---- Translational dynamics ----
    const thrustWorld = qRotate(this.quaternion, v3(0, 0, totalThrust));
    let force = vAdd(thrustWorld, v3(0, 0, -cfg.mass * G));
    if (this.externalDrag) {
      let fd = this.externalDrag(this.velocity, this);
      const mul = cfg.dragMul != null ? cfg.dragMul : 1;
      if (mul !== 1) fd = vScale(fd, mul);
      force = vAdd(force, fd);
    }
    const sd = (cfg.stopDampPerMass || 0) * cfg.mass;
    if (sd > 0) {
      force.x -= this.velocity.x * sd;
      force.y -= this.velocity.y * sd;
      force.z -= this.velocity.z * sd;
    }
    if (this.externalDisturbance) {
      const dist = this.externalDisturbance(this) || {};
      if (dist.force) force = vAdd(force, dist.force);
      if (dist.torque) {
        this.omega.x += (dist.torque.x / this.inertia.x) * dt;
        this.omega.y += (dist.torque.y / this.inertia.y) * dt;
        this.omega.z += (dist.torque.z / this.inertia.z) * dt;
      }
    }

    this.velocity = vAdd(this.velocity, vScale(force, dt / cfg.mass));
    this.position = vAdd(this.position, vScale(this.velocity, dt));

    this.airborne = this.position.z > 0.05 || Math.abs(totalThrust) > cfg.mass * G * 0.5;

    if (this.onSubstep) this.onSubstep(this);
  }

  // debug/OSD readouts
  get motorOutputs() { return this.motors.map(mo => mo.output); }
  get totalThrustN() { return this.motors.reduce((s, mo) => s + mo.thrust(), 0); }
  get totalThrustAbsN() {
    return this.motors.reduce((s, mo) => s + Math.abs(mo.thrust()), 0);
  }
  get twr() { return this.totalThrustN / (this.cfg.mass * G); }
}

// ---------------------------------------------------------------------------
// Integration notes (sim.html)
// ---------------------------------------------------------------------------
// 1. COORDINATES. This module: Z-up, X-forward, Y-left (aerospace-ish, right-handed).
//    Three.js default: Y-up. Map when applying to the mesh:
//      mesh.position.set(qp.position.x, qp.position.z, -qp.position.y);
//    Quaternion remap (swap axes the same way):
//      const q = qp.quaternion;
//      mesh.quaternion.set(q.x, q.z, -q.y, q.w);
//    Or simpler: parent the drone mesh under a Group rotated -90° about X and
//    feed position/quaternion straight through. Pick one, verify with a slow roll.
//
// 2. STICKS. Your existing Betaflight rate math already outputs deg/s or rad/s
//    per axis — keep it. Convert deg/s → rad/s (× Math.PI/180) and pass as
//    setpoint. Delete any code that applies stick rates to orientation directly;
//    the PID loop owns rotation now.
//
// 3. THROTTLE. Pass post-throttle-curve 0..1. Delete old vertical-thrust code;
//    thrust now comes out of the four motors via orientation.
//
// 4. DRAG. Keep your current mass-independent drag for now:
//      qp.externalDrag = (vel) => yourDragForce(vel);
//    Must return world-frame force in Newtons. Swap for anisotropic body-frame
//    drag in step 4 of the roadmap.
//
// 5. COLLISION. Your voxel collision runs in qp.onSubstep — check qp.position,
//    on hit: reflect qp.velocity component, damp, add angular kick:
//      qp.omega.x += (Math.random()-0.5) * impactSpeed * 2;  // crash tumble teaser
//
// 6. ARM GATE. Wire your existing arm-safety gate to qp.arm()/qp.disarm().
//
// 7. TUNE DB. Load a CLI dump's PID values straight in:
//      qp.setTune({ rollP: 36, rollI: 61, rollD: 27, ... });
//    Air65 II Champion tune from your DB drops right in. Users feel real tunes.
//
// 8. VOLTAGE SAG. Multiply cfg.maxThrustPerMotor by your existing sag factor
//    each frame: qp.cfg.maxThrustPerMotor = baseThrust * sagFactor.
//
// 9. FEEL CALIBRATION. If rotation feels sluggish/twitchy, adjust P_SCALE etc.
//    as a set — they're the bridge between Betaflight numbers and this sim's
//    physical units. Tune once on the 65mm preset until a real Air65 pilot
//    (you) says it's close, then check the 5" feels appropriately heavier.
//    That relative difference now comes from inertia + thrust — free realism.
