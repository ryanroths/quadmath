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

export function armHintText(threeDOrOpts, extra) {
  const o = (threeDOrOpts && typeof threeDOrOpts === 'object')
    ? threeDOrOpts
    : Object.assign({ threeD: !!threeDOrOpts }, extra || {});
  if (o.hasSwitch) {
    if (o.blocked) return o.threeD ? 'Center throttle to arm' : 'Lower throttle to arm';
    return 'Flip arm switch';
  }
  if (o.autoArm !== false) {
    return o.threeD ? 'Leave center to fly (auto-arm)' : 'Raise throttle to fly (auto-arm)';
  }
  return o.threeD
    ? 'Center throttle + Space/arm switch to arm'
    : 'Throttle down + Space/arm switch to arm';
}
