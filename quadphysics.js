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
  // kQ raised ~25x across the board. At the original values the yaw axis could
  // not reach its own commanded rate (95 deg/s of a commanded 286) and the loop
  // sat saturated, so a yaw spin carried for more than a full rotation after the
  // stick centred. Relative spacing between presets is unchanged.
  whoop65: {
    name: '65mm whoop',
    mass: 0.027, wheelbase: 0.065, propDiameter: 0.031,
    maxThrustPerMotor: 0.20,      // ~0.8N total, ~3:1 TWR
    motorTau: 0.020,               // tiny props spool fast
    kQ: 0.30,                      // yaw torque per unit thrust (N·m per N, scaled by arm)
    idleThrottle: 0.055,
  },
  whoop75: {
    name: '75mm whoop',
    mass: 0.032, wheelbase: 0.075, propDiameter: 0.040,
    maxThrustPerMotor: 0.26, motorTau: 0.024, kQ: 0.325, idleThrottle: 0.055,
  },
  whoop85: {
    name: '85mm whoop',
    mass: 0.048, wheelbase: 0.085, propDiameter: 0.048,
    maxThrustPerMotor: 0.40, motorTau: 0.028, kQ: 0.35, idleThrottle: 0.055,
  },
  freestyle25: {
    name: '2.5" freestyle',
    mass: 0.120, wheelbase: 0.115, propDiameter: 0.063,
    maxThrustPerMotor: 1.4, motorTau: 0.040, kQ: 0.40, idleThrottle: 0.045,
  },
  freestyle5: {
    name: '5" freestyle',
    mass: 0.650, wheelbase: 0.225, propDiameter: 0.127,
    maxThrustPerMotor: 9.0, motorTau: 0.060, kQ: 0.50, idleThrottle: 0.040,
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
const PHYSICS_HZ = 240;
const PHYSICS_DT = 1 / PHYSICS_HZ;

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
// Motor: first-order spool toward commanded output. Thrust ∝ output².
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
    // spool-up slightly faster than spool-down (props unload quicker than they drive)
    const tau = this.command > this.output ? this.cfg.motorTau : this.cfg.motorTau * 1.4;
    this.output += (this.command - this.output) * (dt / (tau + dt));
  }
  thrust() { return this.cfg.maxThrustPerMotor * this.output * this.output; }
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
    if (!airborne) this.iterm *= 0.99;   // bleed I on ground — no windup while disarmed/landed

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
    this.setPreset(preset);
    this.setTune(tune);
    this.reset();
    this.accumulator = 0;
    // hook: existing drag model. fn(velocityWorld, quadState) -> world-frame force N.
    // Replace with anisotropic body-frame drag in step 4.
    this.externalDrag = null;
    // hook: collision. fn(state) called after each substep; mutate position/velocity there.
    this.onSubstep = null;
  }

  setPreset(preset) {
    this.cfg = { ...preset };
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
    if (this.pid) this.resetControllers();
  }

  setTune(tune) {
    this.tune = { ...DEFAULT_TUNE, ...tune };
    this.resetControllers();
  }

  resetControllers() {
    const t = this.tune;
    this.pid = {
      roll:  new RateAxis(t.rollP,  t.rollI,  t.rollD,  t.rollF,  t, PHYSICS_DT),
      pitch: new RateAxis(t.pitchP, t.pitchI, t.pitchD, t.pitchF, t, PHYSICS_DT),
      yaw:   new RateAxis(t.yawP,   t.yawI,   t.yawD,   t.yawF,   t, PHYSICS_DT),
    };
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

  // -------------------------------------------------------------------------
  // Main entry. Call once per render frame.
  //   frameDt: seconds since last frame
  //   setpoint: {roll, pitch, yaw} desired body rates rad/s (feed your existing
  //             Betaflight rates math output here — sticks → rates unchanged)
  //   throttle: 0..1 (post-curve)
  // Fixed 240Hz substeps internally regardless of render rate.
  // -------------------------------------------------------------------------
  step(frameDt, setpoint, throttle) {
    this.accumulator += Math.min(frameDt, 0.1); // clamp huge hitches
    while (this.accumulator >= PHYSICS_DT) {
      this.substep(setpoint, throttle);
      this.accumulator -= PHYSICS_DT;
    }
  }

  substep(setpoint, throttle) {
    const dt = PHYSICS_DT;
    const cfg = this.cfg;

    // ---- FC: rate loop ----
    let r = 0, p = 0, y = 0, thr = 0;
    if (this.armed) {
      r = this.pid.roll.update(setpoint.roll, this.omega.x, this.airborne);
      p = this.pid.pitch.update(setpoint.pitch, this.omega.y, this.airborne);
      y = this.pid.yaw.update(setpoint.yaw, this.omega.z, this.airborne);
      thr = cfg.idleThrottle + throttle * (1 - cfg.idleThrottle); // Betaflight idle
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
    const mMax = Math.max(...m), mMin = Math.min(...m);
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

    // ---- Forces & torques (body frame) ----
    let totalThrust = 0;
    let torque = v3();
    for (const mo of this.motors) {
      const t = mo.thrust();
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
    if (this.externalDrag) force = vAdd(force, this.externalDrag(this.velocity, this));

    this.velocity = vAdd(this.velocity, vScale(force, dt / cfg.mass));
    this.position = vAdd(this.position, vScale(this.velocity, dt));

    this.airborne = this.position.z > 0.05 || totalThrust > cfg.mass * G * 0.5;

    if (this.onSubstep) this.onSubstep(this);
  }

  // debug/OSD readouts
  get motorOutputs() { return this.motors.map(mo => mo.output); }
  get totalThrustN() { return this.motors.reduce((s, mo) => s + mo.thrust(), 0); }
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
