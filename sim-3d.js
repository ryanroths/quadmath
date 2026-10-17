// QuadMath sim — Betaflight-style 3D (reversible motors).
// Center stick = zero thrust, above = normal, below = reverse. Acro only.
// New localStorage key: quadmathSim3D. Do not write old ryfly* keys.
// Nothing here is copied from WebFPV.

export const THREED_KEY = 'quadmathSim3D';
export const THREED_DEADBAND = 0.05; // ± of the 0..1 stick around 0.5 (~Betaflight 3d_deadband_throttle 50)
export const THREED_REVERSE_SCALE = 0.85; // keep in lockstep with quadphysics.REVERSE_THRUST_SCALE
export const THREED_ARM_BAND = 0.08; // arm when |stick.t - 0.5| is inside this

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
