// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim — Betaflight-style 3D (reversible motors).
// Center stick = zero thrust, above = normal, below = reverse. Acro only.
// New localStorage key: quadmathSim3D. Do not write old ryfly* keys.
// Nothing here is copied from WebFPV.

export const THREED_KEY = 'quadmathSim3D';
export const THREED_DEADBAND = 0.05; // ± of the 0..1 stick around 0.5 (~Betaflight 3d_deadband_throttle 50)
export const THREED_REVERSE_SCALE = 0.85; // keep in lockstep with quadphysics.REVERSE_THRUST_SCALE
export const THREED_ARM_BAND = 0.08; // arm when |stick.t - 0.5| is inside this
// 2D throttle mid / expo. Mid 0.62 + linear exponent puts hover at ~30–35%
// stick with TWR 6.0 / 5.0 / 4.6 and idle 5.5%. Expo 0 is piecewise-linear mid.
export const THROTTLE_MID_DEFAULT = 0.62;
export const THROTTLE_EXPO_DEFAULT = 0;

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function storeOf(storage) {
  return storage || (typeof localStorage !== 'undefined' ? localStorage : null);
}

export function loadThreeD(storage) {
  const store = storeOf(storage);
  if (!store) return false;
  try {
    const v = store.getItem(THREED_KEY);
    return v === '1' || v === 'true' || v === 'on';
  } catch (e) { return false; }
}

export function saveThreeD(on, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try { store.setItem(THREED_KEY, on ? '1' : '0'); }
  catch (e) { /* ignore quota / private mode */ }
}

// stick01 is the existing 0..1 throttle channel (all inputs already map here).
// Returns mixer collective in -1..1. Deadband around 0.5 is true zero.
// curve is the same exponent used for 2D throttle (applied to magnitude).
export function mapThrottle3d(stick01, opts) {
  const o = opts || {};
  const t = clamp(stick01, 0, 1);
  const db = clamp(o.deadband != null ? o.deadband : THREED_DEADBAND, 0, 0.45);
  const curve = o.curve != null ? Number(o.curve) : 1;
  const exp = Number.isFinite(curve) && curve > 0 ? curve : 1;
  const centered = t - 0.5;
  if (Math.abs(centered) <= db) return 0;
  const mag = (Math.abs(centered) - db) / (0.5 - db);
  const shaped = Math.pow(Math.max(0, Math.min(1, mag)), exp);
  return centered < 0 ? -shaped : shaped;
}

export function throttleSafeToArm(stick01, threeD) {
  const t = clamp(stick01, 0, 1);
  if (threeD) return Math.abs(t - 0.5) <= THREED_ARM_BAND;
  return t <= 0.05;
}

export function parseThreeDQuery(raw) {
  if (raw == null || raw === '') return null;
  const v = String(raw).toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return null;
}

export function runCountsForBoards(threeD) {
  return !threeD;
}

export function throttleHudText(stick01, threeD) {
  const t = clamp(stick01, 0, 1);
  if (!threeD) return 'THR ' + ((t * 100) | 0) + '%';
  const mapped = mapThrottle3d(t);
  const pct = (mapped * 100) | 0;
  if (pct === 0) return 'THR 0%';
  return 'THR ' + (pct > 0 ? '+' : '') + pct + '%';
}

// Piecewise throttle mid + cubic expo around half-stick. mid=0.5 and expo=0
// is identity. Clean-room radio-mixer shape — not copied from any FC source.
export function applyThrottleMidExpo(stick01, mid, expo) {
  const t = clamp(stick01, 0, 1);
  const mRaw = Number(mid);
  const eRaw = Number(expo);
  const m = Number.isFinite(mRaw) ? clamp(mRaw, 0.2, 0.8) : 0.5;
  const e = Number.isFinite(eRaw) ? clamp(eRaw, 0, 1) : 0;
  if (Math.abs(m - 0.5) < 1e-12 && e === 0) return t;
  if (t <= 0.5) {
    const x = t * 2;
    const y = x * (1 - e) + x * x * x * e;
    return y * m;
  }
  const x = (t - 0.5) * 2;
  const y = x * (1 - e) + x * x * x * e;
  return m + y * (1 - m);
}

// Same curve sim.html feeds QuadPhysics. 3D is -1..1; 2D is 0..1 post-mid/expo
// then optional exponent. Omitting mid keeps the old t^curve path (mid=0.5).
export function throttleCollective(stick01, threeD, curve, mid, expo) {
  if (threeD) return mapThrottle3d(stick01, { curve, deadband: THREED_DEADBAND });
  const shaped = applyThrottleMidExpo(stick01, mid == null ? 0.5 : mid, expo);
  const exp = Number(curve);
  const e = Number.isFinite(exp) && exp > 0 ? exp : 1;
  return Math.pow(shaped, e);
}

export function throttleWantsArm(stick01, threeD) {
  const t = clamp(stick01, 0, 1);
  if (threeD) return Math.abs(t - 0.5) > THREED_ARM_BAND + 0.04;
  return t >= 0.12;
}

// Auto-arm: only after throttle has been seen safe (low / 3D center), then
// it leaves that band. Starting mid-stick never arms. Switch mapping wins.
export function stepAutoArm(state, sample) {
  const s = sample || {};
  const next = { seenLow: !!(state && state.seenLow) };
  if (s.hasSwitch || s.autoArm === false) {
    next.seenLow = false;
    return { state: next, arm: false };
  }
  if (s.armed) {
    next.seenLow = false;
    return { state: next, arm: false };
  }
  if (s.resetLatch) next.seenLow = false;
  const t = s.t;
  if (throttleSafeToArm(t, s.threeD)) {
    next.seenLow = true;
    return { state: next, arm: false };
  }
  if (next.seenLow && throttleWantsArm(t, s.threeD)) {
    next.seenLow = false;
    return { state: next, arm: true };
  }
  return { state: next, arm: false };
}

// Easy mode, the default for every input on every core: the throttle arms and
// disarms the quad, with no switch. Throttle at the bottom (3D: centred) for
// EASY_ARM_HOLD_S, then raised: armed. Landed with the throttle at the bottom
// for EASY_DISARM_HOLD_S: disarmed, so a new pilot does not sit on the floor
// armed after a flight (half a second: long enough for a touch-and-go, short
// enough that the props stop as the quad settles). A crash (the page's latch)
// disarms once the quad has come to rest. seenLow: the input's throttle came
// up from exactly the bottom, which meets the hold at once (the keyboard's:
// it is at the bottom until W; the hold is for a stick left up).
export const EASY_ARM_HOLD_S = 1;
export const EASY_DISARM_HOLD_S = 0.5;
const EASY_LANDED_CLEARANCE_M = 0.04;
const EASY_LANDED_SPEED_MS = 0.5;
const EASY_LANDED_OMEGA = 2;             // rad/s

export function isLanded(info) {
  const i = info || {};
  return i.clearanceM <= EASY_LANDED_CLEARANCE_M && i.speed < EASY_LANDED_SPEED_MS && i.omega < EASY_LANDED_OMEGA;
}

// One input sample (every 4 ms). state: { lowS, downS, raised }, {} to start.
// sample: t, threeD, dt (s), armed, autoArm (false: the throttle never arms),
// ready (false: the sticks are not proven safe yet, so nothing counts), landed,
// crashed (a crash is latched, or the quad lies upside down), blocked (no arm
// from here: upside down, where the stick turtles it).
// The disarm waits for the throttle to have been raised since the arm, so
// Space or the touch ARM button at idle on the pad stays armed until the pilot
// flies. A throttle-up that arms is that raise: the next sample may already
// have the throttle back at the bottom (the page polls on a 4 ms timer, which
// a long frame holds back, so the next poll can come a frame later with the
// throttle already down), and that flight still disarms when it lands.
export function stepEasyArm(state, sample) {
  const s = sample || {};
  const dt = Number.isFinite(s.dt) && s.dt > 0 ? s.dt : 0;
  const was = state || {};
  const next = { lowS: +was.lowS || 0, downS: +was.downS || 0, raised: !!was.raised };
  const safe = throttleSafeToArm(s.t, s.threeD);
  const wants = throttleWantsArm(s.t, s.threeD);
  if (s.ready === false) next.lowS = 0;
  else if (safe) next.lowS += dt;
  const none = { state: next, arm: false, disarm: false, reason: null };
  if (s.armed) {
    if (!safe) next.lowS = 0;
    if (wants) next.raised = true;
    if (s.landed && s.crashed) {
      next.downS = 0;
      next.raised = false;
      return { state: next, arm: false, disarm: true, reason: 'crash' };
    }
    if (s.landed && safe && next.raised) {
      next.downS += dt;
      if (next.downS >= EASY_DISARM_HOLD_S - 1e-9) {
        next.downS = 0;
        next.raised = false;
        return { state: next, arm: false, disarm: true, reason: 'landed' };
      }
    } else {
      next.downS = 0;
    }
    return none;
  }
  next.downS = 0;
  next.raised = false;
  if (safe || !wants) return none;
  // Raised: the auto-arm's own rule, its "seen low" earned by the hold. Raised
  // too soon, or from where it cannot arm, the hold starts over.
  const held = s.seenLow === true || next.lowS >= EASY_ARM_HOLD_S - 1e-9;
  next.lowS = 0;
  if (s.blocked) return none;
  const arm = stepAutoArm({ seenLow: held }, { t: s.t, threeD: s.threeD, armed: false, autoArm: s.autoArm, hasSwitch: false }).arm;
  if (arm) next.raised = true;
  return { state: next, arm, disarm: false, reason: null };
}

// ---------- The keyboard's hover spring (Easy mode) ----------
// On the keys in Easy mode (2D, Angle or Horizon), armed: no key holds the
// hover throttle, W holds hover + a climb, S hover - a sink, and the throttle
// eases to that at KEYS_SLEW a second. The climb and the sink go with the
// hover: KEYS_CLIMB and KEYS_SINK at the Air65's (KEYS_STEP_AT), in
// proportion elsewhere. A fixed 0.30 on the Fractal75 (hover 0.23, a curved
// throttle) hit the Warehouse's ceiling at 9.1 m/s and latched a crash; in
// proportion it is 7.1 m/s, no crash. A keyboard has no stick to
// leave where it is: on the old keys a W ramped the throttle 0 to 100% in
// 0.7 s and it stayed there when let go, so a first flight met the ceiling
// a second after lift-off. Disarmed, nothing here: the keys arm as before.
// The first W after an arm lifts to a hover (KEYS_LIFT_M clear of the floor)
// even as a tap; Space-armed on the pad, the quad idles until that W. At rest on the
// floor with W up the throttle goes to 0, so Easy mode's landed and crash
// disarms come as they do. Contact sizes (Air65, the Rig, 2026-11-25): the
// ceiling at 7.7 m/s (hover + 0.29 held from the floor to 6 m) and the floor
// at 6.2 m/s (a 6 m drop at 0) latch no crash; 10.8 m/s into the ceiling did.
export const KEYS_CLIMB = 0.30;
export const KEYS_SINK = 0.30;
export const KEYS_STEP_AT = 0.41;
export const KEYS_SLEW = 2.5;              // throttle a second
export const KEYS_LIFT_M = 0.3;
// No key is a hover, not only the hover throttle: at thrust-to-weight 1 the
// quad keeps whatever vertical speed it has, and a novice reacting 400 ms
// late rode it from 0.5 m to 5.3 m and back at 6 m/s (2026-11-25). So with
// no key the throttle takes KEYS_DAMP off per m/s up (adds it per m/s down):
// a rise or a fall stops in about a third of a second. W and S are plain.
export const KEYS_DAMP = 0.06;             // throttle per m/s
// The hover throttle. Thrust goes as the motor output squared, so at a
// throttle t with thrust-to-weight twr the hover is about t / sqrt(twr):
// exact at the hover itself (twr 1), whatever the throttle curve, and near it
// off it (0.1 off the hover: Air65 0.01, Fractal75 0.045, the js core's 85
// 0.017). So it is read only while no key is held, the quad upright and clear
// of everything, and the throttle settled on the estimate; each reading is a
// step of a fixed point that lands on the hover. twr is the core's own
// thrust over weight: the battery's sag and the build's mass are in it.
// Measured hovers (vz 0 for 2 s at 1.5 m): Air65 0.407 (0.413 after 60 s),
// Fractal75 0.232 (0.246), the js core's 85 0.356 (0.375), its 65 0.307.
// The seeds are those (the js core's 75, flown only when Betaflight fails to
// load, takes its 65's: not measured), until a flight reads the quad's own.
export const KEYS_HOVER_SEED = Object.freeze({
  bf: Object.freeze({ whoop65: 0.41, whoop75: 0.23 }),
  js: Object.freeze({ whoop65: 0.31, whoop75: 0.31, whoop85: 0.36 }),
});
export const KEYS_HOVER_SEED_ANY = 0.35;
// The keys' hint in Easy mode, disarmed on the pad and in the air.
export const KEYS_HINT = 'W up · S down';
const KEYS_HOVER_TAU = 0.3;                // s
const KEYS_HOVER_SETTLED_S = 0.15;
const KEYS_HOVER_NEAR = 0.06;
const KEYS_HOVER_MIN = 0.08, KEYS_HOVER_MAX = 0.9;

export function keysHoverSeed(core, type) {
  const c = KEYS_HOVER_SEED[core];
  const v = c && c[type];
  return Number.isFinite(v) ? v : KEYS_HOVER_SEED_ANY;
}

export function hoverFromTwr(t, twr) {
  if (!(t > 0) || !(twr > 0.05)) return null;
  return t / Math.sqrt(twr);
}

// One input sample (every 4 ms), armed. state: { t, hover, phase, settledS },
// {} to start (phase 'idle': armed, no W yet). sample: dt (s), w, s (held),
// t (the throttle now), clearance (m), landed (isLanded), upZ (the body's up
// axis, world z), vz (m/s, up), twr, contact (the core's contactFlags: a box,
// the ceiling among them, is bit 1), crashed (Easy mode's crash latch),
// seed (the hover before any reading).
// Returns the next state and the throttle.
export function stepKeysHover(state, sample) {
  const s = sample || {};
  const was = state || {};
  const dt = Number.isFinite(s.dt) && s.dt > 0 ? s.dt : 0;
  const seed = Number.isFinite(s.seed) ? s.seed : KEYS_HOVER_SEED_ANY;
  const next = {
    t: Number.isFinite(s.t) ? s.t : (Number.isFinite(was.t) ? was.t : 0),
    hover: Number.isFinite(was.hover) ? was.hover : seed,
    phase: was.phase || 'idle',
    settledS: +was.settledS || 0,
  };
  const w = !!s.w, down = !!s.s && !w;
  const upZ = Number.isFinite(s.upZ) ? s.upZ : 1;
  const clear = Number.isFinite(s.clearance) ? s.clearance : 0;
  // Idle is for the pad: taken over in the air (Acro to Angle, a class's
  // core back), it flies on at the hover.
  if (next.phase === 'idle' && clear > KEYS_LIFT_M) next.phase = 'fly';
  if (next.phase === 'idle' && w) next.phase = 'lift';
  if (next.phase === 'lift' && (down || clear > KEYS_LIFT_M)) next.phase = 'fly';
  // Tilted, the thrust's vertical part is upZ of it: thrust goes as t squared.
  // Upright only (upZ 0.5 or more): tipped further, or upside down after a
  // hit, more throttle (or the damping's, falling) only drives it at the
  // floor. Not against a box either: a quad propped on a wall at 70 degrees
  // held there on the extra throttle; without it, it slides down and lands.
  const boxed = !!((s.contact | 0) & 2);
  const upright = upZ >= 0.5;
  const level = boxed || !upright ? 1 : Math.sqrt(clamp(upZ, 0.5, 1));
  const vz = upright && Number.isFinite(s.vz) ? s.vz : 0;
  const climb = next.hover * (1 + KEYS_CLIMB / KEYS_STEP_AT);
  const sink = next.hover * (1 - KEYS_SINK / KEYS_STEP_AT);
  let want;
  // A crash (Easy mode's latch, still fresh): 0, so the quad comes to rest
  // and Easy mode disarms it, as on any input; W after that arms again.
  if (next.phase === 'idle' || s.crashed) want = 0;
  else if (next.phase === 'lift') want = climb / level;
  else if (s.landed && !w) want = 0;
  else if (w) want = climb / level;
  else if (down) want = sink / level;
  else want = next.hover / level - KEYS_DAMP * vz;
  want = clamp(want, 0, 1);
  const step = KEYS_SLEW * dt;
  next.t = clamp(next.t + clamp(want - next.t, -step, step), 0, 1);
  // The hover, read while it is flown: no key, upright, clear, settled on it.
  const est = hoverFromTwr(next.t, s.twr);
  const reading = next.phase === 'fly' && !w && !down && !s.landed && upZ > 0.9 && clear > 0.1 &&
    !boxed && est != null && Math.abs(next.t - next.hover / level) < KEYS_HOVER_NEAR &&
    Math.abs(want - next.t) < 0.01;
  next.settledS = reading ? next.settledS + dt : 0;
  if (reading && next.settledS >= KEYS_HOVER_SETTLED_S - 1e-9) {
    next.hover = clamp(next.hover + (est - next.hover) * (1 - Math.exp(-dt / KEYS_HOVER_TAU)), KEYS_HOVER_MIN, KEYS_HOVER_MAX);
  }
  return { state: next, t: next.t };
}

export function armHintText(threeDOrOpts, extra) {
  const o = (threeDOrOpts && typeof threeDOrOpts === 'object')
    ? threeDOrOpts
    : Object.assign({ threeD: !!threeDOrOpts }, extra || {});
  if (o.hasSwitch) {
    if (o.blocked) return o.threeD ? 'Center throttle to arm' : 'Lower throttle to arm';
    return 'Flip arm switch';
  }
  // Touch sticks (touch: the throttle stick's side, 'left' or 'right'): the
  // gesture itself. The held throttle moves by the thumb's travel, so with it
  // at the bottom (low: in the arm-safe band now) a thumb on the stick and up
  // arms; anywhere else it goes down first, for the auto-arm's 1 s hold.
  if (o.touch === 'left' || o.touch === 'right') {
    const Stick = o.touch === 'left' ? 'Left stick' : 'Right stick';
    const down = o.threeD ? ' to centre' : ' down';
    if (o.autoArm === false) return o.low ? 'Tap ARM to arm' : Stick + down + ', then tap ARM';
    return o.low ? 'Thumb on the ' + o.touch + ' stick, slide up to fly' : Stick + down + ' 1 s, then slide up to fly';
  }
  // The keyboard (keys): W is the throttle, at the bottom (low) until W. In
  // Easy mode W arms and lifts (the hover spring, stepKeysHover); outside it
  // Space does. Not low only while W is held and nothing has armed (the page
  // puts a disarmed keys throttle back).
  if (o.keys) {
    const base = o.threeD ? 'W/S to centre' : 'S to the bottom';
    if (o.easy && o.autoArm !== false) return o.low ? KEYS_HINT : base + ', then W';
    return o.low ? 'Space to arm, then W to fly' : base + ', then Space';
  }
  // A controller in Easy mode: ready once the 1 s hold is done (the next
  // raise arms).
  if (o.easy && o.autoArm !== false) {
    if (o.ready) return o.threeD ? 'Ready — move the throttle' : 'Ready — throttle up';
    return o.threeD ? 'Throttle centred 1 s, then move it to fly' : 'Throttle down 1 s, then up to fly';
  }
  if (o.autoArm !== false) {
    return o.threeD ? 'Leave center to fly (auto-arm)' : 'Raise throttle to fly (auto-arm)';
  }
  return o.threeD
    ? 'Center throttle + Space/arm switch to arm'
    : 'Throttle down + Space/arm switch to arm';
}

// ---------- A controller's arm, said: the connect-time check, the readout ----------
// When a radio or gamepad is picked, the page holds its throttle at zero until
// its sticks have been seen safe once (sim.html readInput's armGate): the
// throttle low (throttleSafeToArm) and roll, pitch and yaw centred within a
// tolerance. A radio's sticks centre within RADIO_CENTRE_TOL. A spring
// gamepad's rest where they rest: a worn stick sits 0.2 off, and Microsoft's
// recommended XInput thumbstick deadzones are 0.24 (left, 7849/32767) and 0.27
// (right, 8689/32767), so a pad's are centred within PAD_CENTRE_TOL, which
// takes 0.2 of drift with room to spare. Only this check widens: the sticks
// still fly what the pad sends.
export const RADIO_CENTRE_TOL = 0.15;
export const PAD_CENTRE_TOL = 0.25;
// The arm line, as the readout states it (throttleSafeToArm).
export const ARM_LOW_LINE = 0.05;
// The calibration offer: the throttle, disarmed, at the lowest it has read
// since the device was picked or last disarmed (a trim bumped in flight shows
// at the next landing), steady (within THR_STEADY) for THR_STEADY_S, and
// above the line but not above THR_STUCK_MAX. A throttle left higher is left
// up, not stuck: a radio parked at half throttle gets the readout and no offer.
export const THR_STEADY = 0.01;
export const THR_STEADY_S = 1;
export const THR_STUCK_MAX = 0.2;

const STICK_NAMES = Object.freeze({ t: 'Throttle', r: 'Roll', p: 'Pitch', y: 'Yaw' });

// What keeps the connect-time check from passing: null when the sticks are
// safe, else { stick: 't' | 'r' | 'p' | 'y', v } (the throttle first, then the
// stick furthest off centre). st: the sticks (r, p, y in -1..1, t 0..1) before
// the check holds the throttle; tol: the centre tolerance.
export function sticksUnsafe(st, threeD, tol) {
  const s = st || {};
  if (!throttleSafeToArm(s.t, threeD)) return { stick: 't', v: clamp(s.t, 0, 1) };
  const lim = Number.isFinite(tol) ? tol : RADIO_CENTRE_TOL;
  let worst = null;
  for (const k of ['r', 'p', 'y']) {
    const v = Number(s[k]) || 0;
    if (Math.abs(v) >= lim && (!worst || Math.abs(v) > Math.abs(worst.v))) worst = { stick: k, v };
  }
  return worst;
}

// One input sample of the throttle watch (the calibration offer). state: {}
// to start; sample: t (the controller's throttle before the connect-time
// check), dt (s), armed, live (a controller flying), threeD. stuck: the offer
// is due.
export function stepThrottleWatch(state, sample) {
  const s = sample || {};
  const t = Number(s.t);
  if (s.armed || !s.live || s.threeD || !Number.isFinite(t)) return { state: {}, stuck: false };
  const was = state || {};
  const dt = Number.isFinite(s.dt) && s.dt > 0 ? s.dt : 0;
  const minT = Number.isFinite(was.minT) ? Math.min(was.minT, t) : t;
  let ref = was.ref;
  let steadyS = +was.steadyS || 0;
  if (!Number.isFinite(ref) || Math.abs(t - ref) > THR_STEADY) { ref = t; steadyS = 0; }
  else steadyS += dt;
  const stuck = t > ARM_LOW_LINE && t <= THR_STUCK_MAX && steadyS >= THR_STEADY_S - 1e-9 && t <= minT + THR_STEADY;
  return { state: { minT, ref, steadyS }, stuck };
}

// A throttle as a percentage against the arm line: one decimal under 10 %,
// rounded away from the line, so a reading just over 5 % never shows as 5.0.
export function throttlePct(t) {
  const x = clamp(t, 0, 1);
  const pct = x * 100;
  if (pct >= 10) return Math.round(pct) + '%';
  const tenths = x > ARM_LOW_LINE ? Math.ceil(pct * 10 - 1e-9) : Math.floor(pct * 10 + 1e-9);
  return (tenths / 10).toFixed(1) + '%';
}

export function throttleReadout(t) {
  return 'THR ' + throttlePct(t) + ' · arm under ' + Math.round(ARM_LOW_LINE * 100) + '%';
}

// A controller's arm hint while disarmed (2D): why it cannot arm, or the hint
// (base) with the live throttle under it. h: base, ready, unsafe (sticksUnsafe
// while the connect-time check holds), stuck (stepThrottleWatch), t (the
// throttle before the check). cal: offer Calibrate.
export function controllerArmHelp(h) {
  const o = h || {};
  const u = o.unsafe;
  if (u && u.stick === 't') return { text: 'Throttle reads ' + throttlePct(u.v) + ' — needs under 5%', cal: true, why: 'throttle' };
  if (u) return { text: STICK_NAMES[u.stick] + ' ' + Math.round(Math.abs(u.v) * 100) + '% off centre — centre the sticks', cal: true, why: u.stick };
  if (o.stuck) return { text: 'Throttle stays at ' + throttlePct(o.t) + ' — needs under 5%', cal: true, why: 'stuck' };
  return { text: (o.base || '') + '\n' + throttleReadout(o.t), cal: false, why: null };
}
