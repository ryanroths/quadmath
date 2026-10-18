// QuadMath sim W1 — Your build. Maps whoop hardware knobs onto existing
// quadphysics.js params (thrust, mass, inertia, spool, battery sag).
// Approximate community / bench-AUW values only — not a thrust stand.
// New localStorage key: quadmathSimBuild. Do not write old ryfly* keys.
// Nothing here is copied from WebFPV or Betaflight GPL sources.

export const BUILD_KEY = 'quadmathSimBuild';
export const BUILD_PREFIX = 'QB1.';

// Class ballparks. KV bands: 65mm 1S ~19000–25000; 75mm 1S/2S; 85mm 2S.
// Thrust/spool/kQ copied from PRESETS.whoop* in quadphysics.js so a default
// 65mm build still flies like the existing whoop65 preset.
export const CLASS_REF = {
  65: {
    frameMm: 65, kv: 23000, propMm: 31, blades: 3, cells: 1, mah: 300, auwG: 27,
    thrustN: 0.397, tau: 0.013, kQ: 0.72, drag: 0.55, idleThrottle: 0.055,
  },
  75: {
    frameMm: 75, kv: 22000, propMm: 40, blades: 3, cells: 1, mah: 450, auwG: 32,
    thrustN: 0.392, tau: 0.014, kQ: 0.75, drag: 0.60, idleThrottle: 0.055,
  },
  85: {
    frameMm: 85, kv: 11000, propMm: 51, blades: 3, cells: 2, mah: 450, auwG: 48,
    thrustN: 0.542, tau: 0.015, kQ: 0.78, drag: 0.62, idleThrottle: 0.055,
  },
};

export const DEFAULT_BUILD = {
  frameMm: 65, kv: 23000, propMm: 31, blades: 3, cells: 1, mah: 300, auwG: 27,
};

const FRAME_MM = [65, 75, 85];
const PROP_MM = [31, 40, 51];
const BLADES = [2, 3, 4];

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function nearest(list, n) {
  let best = list[0], d = Infinity;
  for (const v of list) {
    const dd = Math.abs(v - n);
    if (dd < d) { best = v; d = dd; }
  }
  return best;
}

export function normalizeBuild(raw) {
  const src = raw && typeof raw === 'object' ? raw : DEFAULT_BUILD;
  const frameMm = FRAME_MM.includes(+src.frameMm) ? +src.frameMm : 65;
  const ref = CLASS_REF[frameMm];
  const cells = src.cells === 2 ? 2 : 1;
  let propMm = +src.propMm;
  if (!PROP_MM.includes(propMm)) propMm = ref.propMm;
  let blades = +src.blades;
  if (!BLADES.includes(blades)) blades = 3;
  const kv = Math.round(clamp(src.kv, 8000, 45000) / 100) * 100;
  const mah = Math.round(clamp(src.mah, 150, 800) / 10) * 10;
  const auwG = Math.round(clamp(src.auwG, 15, 90) * 10) / 10;
  const out = { frameMm, kv, propMm, blades, cells, mah, auwG };
  if (src.id && BUILD_PRESETS[src.id]) out.id = src.id;
  return out;
}

// Named whoops. AUW from data/bench where a file exists; KV/prop from those
// same files or the matching guide. Marked approximate — sim thrust is scaled
// from class presets, not from a logged thrust curve.
export const BUILD_PRESETS = {
  whoop65: {
    id: 'whoop65',
    label: '65mm 1S typical',
    approx: true,
    note: 'Class ballpark: 65mm 1S ~19000–25000 KV, 31mm tri-blade, 300 mAh, ~27 g AUW.',
    ...CLASS_REF[65],
  },
  air65: {
    id: 'air65',
    label: 'Air65 analog',
    approx: true,
    // AUW + hardware: data/bench/air65-analog-vci0702-30k.json (measured 2026-08-05).
    note: 'AUW 25.42 g from data/bench/air65-analog-vci0702-30k.json. Thrust is scaled, not a stand log.',
    frameMm: 65, kv: 30000, propMm: 31, blades: 3, cells: 1, mah: 300, auwG: 25.4,
  },
  mobula6: {
    id: 'mobula6',
    label: 'Mobula6 HDZero',
    approx: true,
    // AUW + hardware: data/bench/mobula6-2024-hdzero-se0702-28k.json.
    note: 'AUW 27.73 g from data/bench/mobula6-2024-hdzero-se0702-28k.json. Thrust is scaled, not a stand log.',
    frameMm: 65, kv: 28000, propMm: 31, blades: 3, cells: 1, mah: 300, auwG: 27.7,
  },
  whoop75_1s: {
    id: 'whoop75_1s',
    label: '75mm 1S typical',
    approx: true,
    note: 'Class ballpark: 75mm 1S ~19000–28000 KV 0802, 40mm props, 450 mAh, ~32–38 g.',
    ...CLASS_REF[75],
  },
  fractal75: {
    id: 'fractal75',
    label: 'Fractal 75 analog 25k',
    approx: true,
    // AUW: data/bench/fractal75-analog-rcinpower0802-25k.json (provisional).
    note: 'AUW 35.72 g from data/bench/fractal75-analog-rcinpower0802-25k.json (provisional). Bi-blade 1610.',
    frameMm: 75, kv: 25000, propMm: 40, blades: 2, cells: 1, mah: 450, auwG: 35.7,
  },
  cockroach75: {
    id: 'cockroach75',
    label: 'Cockroach 75 HDZero',
    approx: true,
    // AUW: data/bench/cockroach75-hdzero-champion0802-28k.json (provisional).
    note: 'AUW 36.34 g from data/bench/cockroach75-hdzero-champion0802-28k.json (provisional). Champion 0802 28k.',
    frameMm: 75, kv: 28000, propMm: 40, blades: 2, cells: 1, mah: 450, auwG: 36.3,
  },
  treetopper75: {
    id: 'treetopper75',
    label: 'TreeTopper 75 32.5k',
    approx: true,
    // AUW: data/bench/treetopper75-analog-0802-32500k.json (provisional).
    note: 'AUW 34.57 g from data/bench/treetopper75-analog-0802-32500k.json (provisional).',
    frameMm: 75, kv: 32500, propMm: 40, blades: 2, cells: 1, mah: 450, auwG: 34.6,
  },
  whoop75_2s: {
    id: 'whoop75_2s',
    label: '75mm 2S typical',
    approx: true,
    note: 'Lower KV on 2S. Approximate community default, not a bench log.',
    frameMm: 75, kv: 14000, propMm: 40, blades: 3, cells: 2, mah: 300, auwG: 42,
  },
  meteor75pro: {
    id: 'meteor75pro',
    label: 'Meteor75 Pro II O4-ish',
    approx: true,
    // Guide content/guides/meteor75-pro-ii-o4-wide.html: 41.5 g, 1S, ~80mm, LAVA II 480.
    // Nearest picker class is 85mm (65/75/85 only).
    note: 'Guide cites ~41.5 g, 1S, 80mm, 480 mAh. Mapped to 85mm class (nearest picker size).',
    frameMm: 85, kv: 19000, propMm: 40, blades: 4, cells: 1, mah: 480, auwG: 41.5,
  },
  whoop85_2s: {
    id: 'whoop85_2s',
    label: '85mm 2S typical',
    approx: true,
    note: 'Class ballpark: 85mm 2S ~10000–14000 KV, 51mm props, 450 mAh, ~48 g.',
    ...CLASS_REF[85],
  },
};

export function matchPresetId(build) {
  const b = normalizeBuild(build);
  for (const [id, p] of Object.entries(BUILD_PRESETS)) {
    const n = normalizeBuild(p);
    if (n.frameMm === b.frameMm && n.kv === b.kv && n.propMm === b.propMm
      && n.blades === b.blades && n.cells === b.cells && n.mah === b.mah
      && Math.abs(n.auwG - b.auwG) < 0.15) return id;
  }
  return '';
}

function bladeMul(blades) {
  if (blades === 2) return 0.88;
  if (blades === 4) return 1.08;
  return 1;
}

export function physicsFromBuild(raw) {
  const b = normalizeBuild(raw);
  const ref = CLASS_REF[b.frameMm];
  const kvRatio = b.kv / ref.kv;
  const voltRatio = b.cells / ref.cells;
  const propRatio = b.propMm / ref.propMm;
  // Milder than RPM²·D⁴ so 2S / high-KV stays flyable. TWR clamped below.
  let thrustN = ref.thrustN
    * Math.pow(kvRatio, 0.70)
    * Math.pow(voltRatio, 1.15)
    * Math.pow(propRatio, 1.6)
    * bladeMul(b.blades);
  const massKg = b.auwG / 1000;
  const twr = (thrustN * 4) / (massKg * 9.81);
  if (twr < 2.2) thrustN *= 2.2 / twr;
  if (twr > 8.5) thrustN *= 8.5 / twr;
  const spoolTau = clamp(ref.tau * propRatio * (1 + 0.05 * (b.blades - 3)), 0.010, 0.08);
  const drag = clamp(ref.drag * Math.pow(propRatio, 0.4) * (0.96 + 0.02 * b.blades), 0.35, 0.85);
  const kQ = ref.kQ * Math.pow(propRatio, 0.3);
  const droneType = b.frameMm === 85 ? 'whoop85' : (b.frameMm === 75 ? 'whoop75' : 'whoop65');
  const twrOut = (thrustN * 4) / (massKg * 9.81);
  return {
    build: b,
    droneType,
    massG: b.auwG,
    drag,
    spoolTau,
    preset: {
      name: b.frameMm + 'mm whoop build',
      mass: massKg,
      wheelbase: b.frameMm / 1000,
      propDiameter: b.propMm / 1000,
      maxThrustPerMotor: thrustN,
      motorTau: spoolTau,
      kQ,
      idleThrottle: ref.idleThrottle,
    },
    twr: twrOut,
    label: b.frameMm + 'mm ' + b.cells + 'S ' + b.kv + 'KV',
    approx: true,
  };
}

export function batteryFromBuild(raw) {
  const b = normalizeBuild(raw);
  const full = b.cells * 4.2;
  const empty = b.cells * 3.5;
  return {
    cells: b.cells,
    mah: b.mah,
    full,
    empty,
    warn: b.cells * 3.5,
    crit: b.cells * 3.3,
    // 300 mAh 1S ≈ 180 s hover in the existing sim. Scale by capacity; 2S
    // lasts a bit longer at the same mAh (more energy, not 2× current).
    hoverS: 180 * (b.mah / 300) * (b.cells === 2 ? 1.15 : 1),
    sagDrop: 0.33 * b.cells * Math.sqrt(300 / b.mah),
  };
}

const CODE_RE = /^(\d{2})-(\d{4,5})-(\d{2})x([234])-([12])s(\d{2,4})-(\d+(?:\.\d+)?)$/;

export function encodeBuild(raw) {
  const b = normalizeBuild(raw);
  const id = matchPresetId(b);
  if (id) return BUILD_PREFIX + id;
  const auw = Number.isInteger(b.auwG) ? String(b.auwG) : b.auwG.toFixed(1);
  return BUILD_PREFIX + b.frameMm + '-' + b.kv + '-' + b.propMm + 'x' + b.blades
    + '-' + b.cells + 's' + b.mah + '-' + auw;
}

export function decodeBuild(code) {
  if (code == null) return null;
  let s = String(code).trim();
  if (!s) return null;
  if (s.indexOf(BUILD_PREFIX) === 0) s = s.slice(BUILD_PREFIX.length);
  if (BUILD_PRESETS[s]) return normalizeBuild(BUILD_PRESETS[s]);
  const m = s.match(CODE_RE);
  if (!m) return null;
  return normalizeBuild({
    frameMm: +m[1], kv: +m[2], propMm: +m[3], blades: +m[4],
    cells: +m[5], mah: +m[6], auwG: +m[7],
  });
}

export function loadBuild(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return null;
  try {
    const raw = store.getItem(BUILD_KEY);
    if (!raw) return null;
    return normalizeBuild(JSON.parse(raw));
  } catch (e) { return null; }
}

export function saveBuild(build, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    if (build == null) store.removeItem(BUILD_KEY);
    else store.setItem(BUILD_KEY, JSON.stringify(normalizeBuild(build)));
  } catch (e) { /* ignore quota / private mode */ }
}

export function buildDeepLink({ origin, build, track, mode, threeD } = {}) {
  const base = origin || 'https://quadmath.com';
  const u = new URL('/sim.html', base.endsWith('/') ? base : base + '/');
  if (build) u.searchParams.set('build', encodeBuild(build));
  if (track != null && track !== '') u.searchParams.set('track', String(track));
  if (mode) u.searchParams.set('mode', String(mode).toLowerCase());
  if (threeD) u.searchParams.set('3d', '1');
  return u.toString();
}

export function classDefault(frameMm) {
  const f = FRAME_MM.includes(+frameMm) ? +frameMm : 65;
  const id = f === 85 ? 'whoop85_2s' : (f === 75 ? 'whoop75_1s' : 'whoop65');
  return normalizeBuild(BUILD_PRESETS[id]);
}

export { nearest, FRAME_MM, PROP_MM, BLADES };
