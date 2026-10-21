// QuadMath sim W2 — real whoop physics helpers.
// Duct bounce, propwash, ground-effect scale, LiPo voltage curve, indoor drafts.
// Strength follows the W1 build (frame, KV, AUW). Ideas only — nothing here is
// copied from WebFPV (GPL) or other simulators.
// New localStorage key: quadmathSimWhoop. Do not write old ryfly* keys.
// Ghosts stay kinematic {v:1,samples}; new recordings add phys: PHYSICS_VER.

import { normalizeBuild, DEFAULT_BUILD, batteryFromBuild } from './sim-build.js?v=fa0942d7ccfb';

export const WHOOP_KEY = 'quadmathSimWhoop';
export const PHYSICS_VER = 2;
export const WHOOP_FEEL_VER = 3; // bump: wash + drafts default Off; migrate once
export const GHOST_FORMAT_V = 1;

export const DEFAULT_WHOOP = Object.freeze({
  bounce: true,
  bounceStr: 0.75,
  crashSpeed: 9,
  ground: true,
  groundStr: 1,
  wash: false,
  washStr: 0,
  batt: true,
  sagThrust: true,
  sagStr: 1,
  draft: false,
  draftStr: 0.55,
  feelVer: WHOOP_FEEL_VER,
});

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function bool(v, fb) {
  if (v === true || v === false) return v;
  return fb;
}

export function normalizeWhoop(raw) {
  const src = raw && typeof raw === 'object' ? raw : DEFAULT_WHOOP;
  return {
    bounce: bool(src.bounce, true),
    bounceStr: clamp(src.bounceStr, 0, 1.5),
    crashSpeed: clamp(src.crashSpeed, 6, 28),
    ground: bool(src.ground, true),
    groundStr: clamp(src.groundStr, 0, 2),
    wash: bool(src.wash, false),
    washStr: clamp(src.washStr, 0, 2),
    batt: bool(src.batt, true),
    sagThrust: bool(src.sagThrust, true),
    sagStr: clamp(src.sagStr, 0, 2),
    draft: bool(src.draft, false),
    draftStr: clamp(src.draftStr, 0, 2),
    feelVer: Number(src.feelVer) >= WHOOP_FEEL_VER ? WHOOP_FEEL_VER : (Number(src.feelVer) || 0),
  };
}

function migrateFeel(parsed) {
  const src = parsed && typeof parsed === 'object' ? { ...parsed } : {};
  const ver = Number(src.feelVer) || 0;
  if (ver < WHOOP_FEEL_VER) {
    src.wash = false;
    src.washStr = 0;
    src.draft = false;
    src.feelVer = WHOOP_FEEL_VER;
  }
  const out = normalizeWhoop(src);
  out.feelVer = WHOOP_FEEL_VER;
  return { migrated: ver < WHOOP_FEEL_VER, settings: out };
}

export function loadWhoop(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return normalizeWhoop(DEFAULT_WHOOP);
  try {
    const raw = store.getItem(WHOOP_KEY);
    if (!raw) return normalizeWhoop(DEFAULT_WHOOP);
    const { migrated, settings } = migrateFeel(JSON.parse(raw));
    if (migrated) saveWhoop(settings, store);
    return settings;
  } catch (e) { return normalizeWhoop(DEFAULT_WHOOP); }
}

export function saveWhoop(settings, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    const n = normalizeWhoop(settings);
    n.feelVer = WHOOP_FEEL_VER;
    store.setItem(WHOOP_KEY, JSON.stringify(n));
  } catch (e) { /* ignore quota / private mode */ }
}

// Build-tied multipliers. 65mm / 27 g / 23000 KV is 1.0 on each axis.
// Smaller / lighter ducts bounce more; heavier / bigger crash sooner;
// high-KV + big props wash harder; small packs sag more.
export function whoopScale(raw) {
  const b = normalizeBuild(raw || DEFAULT_BUILD);
  const frame = b.frameMm / 65;
  const mass = b.auwG / 27;
  const kv = b.kv / 23000;
  const prop = b.propMm / 31;
  return {
    frameMm: b.frameMm,
    auwG: b.auwG,
    kv: b.kv,
    bounce: clamp(Math.sqrt(1 / frame) * Math.sqrt(1 / mass), 0.55, 1.45),
    crashAt: clamp(Math.sqrt(1 / mass) * Math.pow(1 / frame, 0.3), 0.60, 1.35),
    spin: clamp(0.65 + 0.45 * kv / Math.sqrt(mass), 0.45, 1.7),
    // 65mm was the noisiest (scale ~1.1). Keep small frames gentler so a
    // whoop's leftover puff is a nudge, not a roll-off.
    wash: clamp((0.40 + 0.30 * kv * prop / mass) * (frame <= 1 ? 0.72 : 1), 0.25, 1.25),
    ground: clamp((1.05 / Math.sqrt(mass)) * prop, 0.50, 1.65),
    sag: clamp(Math.sqrt(300 / b.mah) * (b.cells === 2 ? 0.88 : 1), 0.50, 1.8),
    draft: clamp(1.15 / (frame * Math.sqrt(mass)), 0.40, 1.55),
  };
}

function v3(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; }
function vAdd(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
function vScale(a, s) { return v3(a.x * s, a.y * s, a.z * s); }
function vDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function vLen(a) { return Math.hypot(a.x, a.y, a.z); }
function vNorm(a) {
  const n = vLen(a) || 1;
  return v3(a.x / n, a.y / n, a.z / n);
}

// Quadratic cushion. Same shape as quadphysics.js groundEffectMult — kept here
// so node tests can pin the whoop-scaled bonus without spinning the whole FC.
export function groundEffectMult(clearanceM, propDiameterM, kGE) {
  const k = kGE == null ? 0.065 : kGE;
  const ceil = 1 * (propDiameterM || 0.031);
  if (!(clearanceM < ceil) || k <= 0) return 1;
  const x = 1 - Math.max(0, clearanceM) / ceil;
  return 1 + k * x * x;
}

export function whoopGroundK(build, settings) {
  const s = normalizeWhoop(settings);
  if (!s.ground) return 0;
  return 0.062 * s.groundStr * whoopScale(build).ground;
}

export function whoopGroundMult(clearanceM, build, settings) {
  const b = normalizeBuild(build || DEFAULT_BUILD);
  return groundEffectMult(clearanceM, b.propMm / 1000, whoopGroundK(build, settings));
}

// LiPo open-circuit voltage per cell. Not linear — a real pack sits on a
// ~3.75–3.87 V plateau for most of the flight, then falls off a cliff.
const OCV = [
  [0.00, 3.30],
  [0.05, 3.50],
  [0.15, 3.60],
  [0.40, 3.75],
  [0.70, 3.87],
  [0.90, 4.05],
  [1.00, 4.20],
];

export function lipoOcv(soc, cells) {
  const u = clamp(soc, 0, 1);
  let a = OCV[0], b = OCV[OCV.length - 1];
  for (let i = 0; i < OCV.length - 1; i++) {
    if (u >= OCV[i][0] && u <= OCV[i + 1][0]) { a = OCV[i]; b = OCV[i + 1]; break; }
  }
  const span = b[0] - a[0] || 1;
  const v = a[1] + (b[1] - a[1]) * ((u - a[0]) / span);
  return v * (cells === 2 ? 2 : 1);
}

export function stepBattery(prev, dt, loadFrac, packOrBuild, settings) {
  const s = normalizeWhoop(settings);
  const pack = packOrBuild && packOrBuild.full != null
    ? packOrBuild
    : batteryFromBuild(packOrBuild || DEFAULT_BUILD);
  const sc = whoopScale({
    cells: pack.cells, mah: pack.mah,
    frameMm: 65, kv: 23000, propMm: 31, blades: 3, auwG: 27,
    ...(packOrBuild && packOrBuild.frameMm ? packOrBuild : {}),
  });
  if (!s.batt) {
    return { charge: 1, voltage: pack.full, sagFactor: 1 };
  }
  const load = clamp(loadFrac, 0, 1);
  const hoverS = Math.max(20, pack.hoverS || 180);
  const charge = Math.max(0, num(prev && prev.charge, 1) - dt * (0.25 + 1.5 * load) / hoverS);
  const ocv = lipoOcv(charge, pack.cells);
  const ir = (pack.sagDrop || 0.33) * s.sagStr * sc.sag * (1.0 + 0.35 * (1 - charge));
  const vInst = ocv - load * ir;
  const prevV = num(prev && prev.voltage, ocv);
  const tau = 0.15;
  const voltage = prevV + (vInst - prevV) * (dt / (tau + dt));
  const sagFactor = s.sagThrust
    ? Math.pow(Math.max(0.45, voltage / pack.full), 2)
    : 1;
  return { charge, voltage, sagFactor, ocv, vInst };
}

function unitOrDefault(n, fb) {
  if (!n || !Number.isFinite(n.x + n.y + n.z)) return fb;
  const L = vLen(n);
  if (L < 1e-9) return fb;
  return v3(n.x / L, n.y / L, n.z / L);
}

// Duct bounce. Soft hits rebound + spin. Crash only above a build-scaled
// impact threshold. Disabled → low restitution, easy crash (old "hard wall").
export function resolveDuctHit(hit, build, settings) {
  const s = normalizeWhoop(settings);
  const sc = whoopScale(build);
  const n = unitOrDefault(hit && hit.normal, v3(0, 1, 0));
  const vel = v3(hit && hit.vel && hit.vel.x, hit && hit.vel && hit.vel.y, hit && hit.vel && hit.vel.z);
  const omega = v3(hit && hit.omega && hit.omega.x, hit && hit.omega && hit.omega.y, hit && hit.omega && hit.omega.z);
  const vn = vDot(vel, n);
  const into = hit && hit.into != null ? Math.max(0, num(hit.into, 0)) : Math.max(0, -vn);
  const crashAt = s.crashSpeed * sc.crashAt;
  const crashed = into > crashAt;
  let rest;
  if (!s.bounce) rest = crashed ? 0.08 : 0.12;
  else if (crashed) rest = 0.10;
  // TPU ducts are ~0.20–0.35, not a superball. Default 65mm at bounceStr
  // 0.75 lands ~0.32; the slider can still push it if someone wants more.
  else rest = 0.24 + 0.11 * s.bounceStr * sc.bounce;
  if (hit && hit.floor && !crashed) rest *= 0.55;

  const leave = vn < 0 ? vn : -into;
  const nextVel = vAdd(vel, vScale(n, -(1 + rest) * leave));
  const tangent = vAdd(nextVel, vScale(n, -vDot(nextVel, n)));
  const tanDamp = crashed ? 0.55 : (s.bounce ? 0.82 : 0.70);
  const bounced = vAdd(vScale(n, vDot(nextVel, n)), vScale(tangent, tanDamp));

  const spinK = (crashed ? 1.6 : 0.48) * (s.bounce ? s.bounceStr : 0.35) * sc.spin * Math.min(into, 28);
  // Glance: leftover tangent × normal → a body-rate kick (ducts catch a corner).
  const tx = tangent.x, ty = tangent.y, tz = tangent.z;
  const kick = v3(
    (n.y * tz - n.z * ty) * spinK * 0.08,
    (n.z * tx - n.x * tz) * spinK * 0.08,
    (n.x * ty - n.y * tx) * spinK * 0.10,
  );
  // Head-on hits still yaw — a whoop never kisses a wall perfectly centered.
  kick.x += n.z * spinK * 0.035 + (crashed ? spinK * 0.06 : 0);
  kick.y += n.x * spinK * 0.035;
  kick.z += spinK * (crashed ? 0.08 : 0.025);
  if (hit && hit.floor) {
    kick.x += -ty * spinK * 0.05;
    kick.y += tx * spinK * 0.05;
  }
  // Tiny garnish so two identical crashes are not pixel-identical on replay,
  // but tests can pass rng=0 for a locked result.
  const rng = hit && typeof hit.rng === 'function' ? hit.rng : null;
  if (rng) {
    kick.x += (rng() - 0.5) * spinK * 0.04;
    kick.y += (rng() - 0.5) * spinK * 0.04;
    kick.z += (rng() - 0.5) * spinK * 0.02;
  }
  return {
    vel: bounced,
    omega: vAdd(omega, kick),
    crashed,
    bounced: true,
    into,
    rest,
  };
}

// Deterministic [0,1) hash — no Math.random in the models so tests lock.
export function hash01(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export function hash3(x, y, z) {
  return v3(hash01(x, y, z) * 2 - 1, hash01(y, z, x) * 2 - 1, hash01(z, x, y) * 2 - 1);
}

export function emptyWake() {
  return { x: 0, y: 0, z: 0, s: 0, age: 1 };
}

export const WASH_LEVELS = Object.freeze({
  off: 0,
  low: 0.0125, // old Low × 0.05
  med: 0.06,
  high: 0.25,  // about today's old Low
});

export function washLevelFromStr(n) {
  const v = Number(n);
  if (!(v > 0.002)) return 'off';
  if (v <= 0.03) return 'low';
  if (v <= 0.12) return 'med';
  return 'high';
}

export function washStrFromLevel(level) {
  const k = String(level || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(WASH_LEVELS, k) ? WASH_LEVELS[k] : WASH_LEVELS.low;
}

// Propwash: leave a puff of downwash (or 3D upwash) behind a pulling whoop.
// Always-on turbulence is throttle × (1 − |collective|) — zero at 3D center
// and at a straight punch-out, a nudge at mid stick. A stronger term fires
// when you descend / chop back into that puff. |throttle| so 3D reverse is
// not treated as a chop-to-zero. Module/SI frame.
export function stepPropwash(wake, sample, dt, build, settings) {
  const s = normalizeWhoop(settings);
  const sc = whoopScale(build);
  const w = wake && typeof wake === 'object' ? wake : emptyWake();
  const pos = (sample && sample.pos) || v3();
  const vel = (sample && sample.vel) || v3();
  const signed = Number(sample && sample.throttle);
  const raw = Number.isFinite(signed) ? clamp(signed, -1, 1) : 0;
  const thr = Math.abs(raw);
  const blow = raw < 0 ? 1 : -1;
  if (!s.wash || s.washStr <= 0) {
    return { wake: { ...w, s: 0 }, force: v3(), torque: v3(), excite: 0, turb: 0, wakeHit: 0 };
  }
  const next = { x: w.x, y: w.y, z: w.z, s: w.s, age: w.age };
  if (thr > 0.38) {
    next.s = Math.max(next.s * 0.88, thr);
    next.x = pos.x;
    next.y = pos.y;
    next.z = pos.z + blow * 0.32;
    next.age = 0;
  } else {
    next.age += dt;
    next.s *= Math.exp(-dt * 1.9);
  }
  const d = Math.hypot(pos.x - next.x, pos.y - next.y, pos.z - next.z);
  const toX = next.x - pos.x, toY = next.y - pos.y, toZ = next.z - pos.z;
  const sep = Math.hypot(toX, toY, toZ) || 1;
  const approach = (vel.x * toX + vel.y * toY + vel.z * toZ) / sep;
  const intoWash = approach > 0.85;
  const lowThr = thr < 0.28;
  const inWash = d < 0.55 && next.s > 0.18 && next.age >= 0.02;
  const k = s.washStr * sc.wash;
  // No always-on buzz. That term fired at mid stick with no wake nearby and
  // read as random kicks. Wash, when enabled, is descent / chop into the puff.
  const turb = 0;
  const chopHit = (inWash && intoWash && lowThr) ? (0.22 * next.s + 0.12) * k : 0;
  const descent = (inWash && vel.z < -0.35)
    ? (0.16 * next.s + 0.06) * k * Math.min(1, -vel.z / 3)
    : 0;
  const wakeHit = chopHit + descent;
  const excite = turb + wakeHit;
  const n = hash3(pos.x + next.age, pos.y, pos.z);
  return {
    wake: next,
    force: v3(n.x * excite * 0.040, n.y * excite * 0.040, -excite * 0.07),
    torque: v3(n.x * excite * 0.11, n.y * excite * 0.11, n.z * excite * 0.035),
    excite,
    turb,
    wakeHit,
  };
}

// Indoor drafts: weak turbulence that grows near walls. `wallDist` metres.
export function indoorDraft(pos, wallDist, t, build, settings) {
  const s = normalizeWhoop(settings);
  const sc = whoopScale(build);
  if (!s.draft) return { force: v3(), torque: v3(), prox: 0 };
  const d = Math.max(0, num(wallDist, 8));
  const prox = d >= 1.8 ? 0 : (d <= 0.15 ? 1 : (1.8 - d) / 1.65);
  if (prox <= 0) return { force: v3(), torque: v3(), prox: 0 };
  const n = hash3(pos.x * 0.7 + t * 0.35, pos.y * 0.7, pos.z * 0.7 + t * 0.21);
  const k = prox * s.draftStr * sc.draft;
  return {
    force: v3(n.x * k * 0.018, n.y * k * 0.018, n.z * k * 0.010),
    torque: v3(n.x * k * 0.028, n.y * k * 0.028, n.z * k * 0.012),
    prox,
  };
}

export function combineDisturbance(a, b) {
  const A = a || {};
  const B = b || {};
  return {
    force: vAdd(A.force || v3(), B.force || v3()),
    torque: vAdd(A.torque || v3(), B.torque || v3()),
  };
}

export function tagGhost(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  return { ...src, v: GHOST_FORMAT_V, phys: PHYSICS_VER };
}

export function ghostSamples(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (data.samples && Array.isArray(data.samples)) return data.samples;
  return null;
}

export function ghostPhys(data) {
  if (!data || Array.isArray(data)) return null;
  const p = data.phys;
  return Number.isFinite(p) ? p : null;
}
