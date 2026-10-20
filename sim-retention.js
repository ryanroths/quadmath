// QuadMath sim W5 — Retention: daily whoop, weekly boards, ghost duels, skins.
// Nothing here is copied from WebFPV (GPL).
// New localStorage keys: quadmathSimDaily, quadmathSimBoard, quadmathSimSkin,
// quadmathSimPilotToken, quadmathSimCanopy. Optional: quadmathSimLeaderboardUrl
// (online boards).
// Do not write old ryfly* keys.
// This file has no sim-*.js imports so the Cloudflare Worker can bundle it.

export const DAILY_KEY = 'quadmathSimDaily';
export const BOARD_KEY = 'quadmathSimBoard';
export const SKIN_KEY = 'quadmathSimSkin';
export const CANOPY_KEY = 'quadmathSimCanopy';
export const LEADERBOARD_URL_KEY = 'quadmathSimLeaderboardUrl';
export const PILOT_TOKEN_KEY = 'quadmathSimPilotToken';
export const SHARE_PREFIX = 'QM2.';
export const DUEL_KIND = 'duel';
export const WS_PER_METRE = 3.5;
export const RUN_LAPS = 3;
export const LEADERBOARD_URL = 'https://sim-leaderboard.ryan-roths.workers.dev';
export const CLASS_IDS = Object.freeze([65, 75, 85]);
export const CLASS_MAX_SPEED = Object.freeze({ 65: 48, 75: 58, 85: 72 });
export const MISS_PENALTY_MS = 2000;
export const PHYS_VER = 2;
export const DAILY_GEN = 2;
export const PILOT_NAME_MAX = 16;
export const GATE_SIZE_MIN = 0.28 * WS_PER_METRE;
export const GATE_SIZE_MAX = 0.40 * WS_PER_METRE;
export const LAP_PACE_MS = 2.6;
export const WEEK_GRACE_MS = 36 * 60 * 60 * 1000;
export const DEFAULT_ALLOWED_ORIGIN = 'https://quadmath.com';

// Indoor fly boxes, numbers copied from sim-maps LAYOUT. Tests pin the match.
export const DAILY_MAPS = Object.freeze([
  { id: 'living', name: 'Living Room', w: 21, d: 28, h: 9.1, wall: 0.38 },
  { id: 'garage', name: 'Garage', w: 21, d: 42, h: 10.5, wall: 0.4 },
  { id: 'warehouse', name: 'Warehouse', w: 56, d: 84, h: 21, wall: 0.5 },
  { id: 'office', name: 'Office', w: 36, d: 46, h: 9.2, wall: 0.36 },
  { id: 'gym', name: 'School Gym', w: 48, d: 74, h: 28, wall: 0.46 },
  { id: 'trainer', name: 'Tiny Trainer', w: 28, d: 36, h: 10.5, wall: 0.34 },
]);

// Stored `id` values and unlock rules are frozen. Display names, palettes, and
// vibe labels are visual only. Palettes follow docs/sim-art-direction.md map
// vibes. Original QuadMath looks — not WebFPV.
export const SKINS = Object.freeze([
  {
    id: 'stock', name: 'Pocket Felt', vibe: 'Pocket Stage',
    canopy: 0xffb3c7, body: 0x3a2a20, frame: 0x7a5130, prop: 0x7ec8e3,
    led: 0xffe0b0, trail: 0xffb3c7,
    unlock: { type: 'always' },
  },
  {
    id: 'bronze', name: 'Clay Cushion', vibe: 'Clay Parlor',
    canopy: 0xff6b9a, body: 0x6b3f2a, frame: 0xc48a6a, prop: 0xffe08a,
    led: 0x7ec8e3, trail: 0xff6b9a,
    unlock: { type: 'medals', medal: 'bronze', count: 1 },
  },
  {
    id: 'silver', name: 'Paper Blinds', vibe: 'Paper Sun',
    canopy: 0xfff4d2, body: 0x1a1a1a, frame: 0x1a1a1a, prop: 0xff5c5c,
    led: 0x2ae59b, trail: 0x3d7dff,
    unlock: { type: 'medals', medal: 'silver', count: 3 },
  },
  {
    id: 'gold', name: 'Amber Line', vibe: 'Amber Court',
    canopy: 0xf0b14b, body: 0x6a4224, frame: 0xc45a22, prop: 0xfff6d8,
    led: 0xf0b14b, trail: 0xf0b14b,
    unlock: { type: 'medals', medal: 'gold', count: 3 },
  },
  {
    id: 'streak3', name: 'Licorice Tape', vibe: 'Licorice Grid',
    canopy: 0xff4d8d, body: 0x1a1020, frame: 0xf2f0ea, prop: 0x00e5ff,
    led: 0xffe08a, trail: 0xff4d8d,
    unlock: { type: 'streak', days: 3 },
  },
  {
    id: 'streak7', name: 'Volt Tube', vibe: 'Volt Stall',
    canopy: 0xffb347, body: 0x14161c, frame: 0x3d4654, prop: 0x2de2e6,
    led: 0xffb347, trail: 0x2de2e6,
    unlock: { type: 'streak', days: 7 },
  },
  {
    id: 'daily-fast', name: 'Neon Current', vibe: 'Neon Current',
    canopy: 0x00f0ff, body: 0x120816, frame: 0x1a0533, prop: 0xff2bd6,
    led: 0xff7a18, trail: 0xff3cac,
    unlock: { type: 'dailyMs', ms: 90000 },
  },
  {
    id: 'coach-all', name: 'Ion Spore', vibe: 'Ion Nave',
    canopy: 0x39ffb0, body: 0x0b1218, frame: 0x1b3a4a, prop: 0x7a5cff,
    led: 0x39ffb0, trail: 0x7a5cff,
    unlock: { type: 'medals', medal: 'gold', count: 7 },
  },
]);

const MEDAL_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function utcDateId(now) {
  const d = now ? new Date(now) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error('BAD DATE');
  return d.toISOString().slice(0, 10);
}

export function utcWeekId(now) {
  const d = now ? new Date(now) : new Date();
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return year + '-W' + String(week).padStart(2, '0');
}

export function previousUtcWeekId(now) {
  const d = now != null ? new Date(now) : new Date();
  return utcWeekId(d.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export function msSinceUtcMonday(now) {
  const d = now != null ? new Date(now) : new Date();
  const day = d.getUTCDay() || 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1), 0, 0, 0, 0);
  return d.getTime() - monday;
}

export function weekAllowed(week, now) {
  if (typeof week !== 'string' || !/^\d{4}-W\d{2}$/.test(week)) return false;
  const t = now != null ? now : Date.now();
  if (week === utcWeekId(t)) return true;
  return week === previousUtcWeekId(t) && msSinceUtcMonday(t) < WEEK_GRACE_MS;
}

export function addUtcDays(utc, days) {
  const [y, m, d] = String(utc).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isDailyTrackId(id) {
  return typeof id === 'string' && /^daily-\d{4}-\d{2}-\d{2}$/.test(id);
}

export function isWeeklyTrackId(id) {
  return typeof id === 'string' && /^weekly-\d{4}-W\d{2}(?:-g\d+)?$/.test(id);
}

export function dailyIdFor(utc) {
  return 'daily-' + utc;
}

export function weeklyIdFor(week) {
  const w = String(week || '').replace(/-g\d+$/, '');
  return 'weekly-' + w + '-g' + DAILY_GEN;
}

export function weekFromTrackId(id) {
  const m = typeof id === 'string' && id.match(/^weekly-(\d{4}-W\d{2})(?:-g\d+)?$/);
  return m ? m[1] : '';
}

function mapById(id) {
  return DAILY_MAPS.find((m) => m.id === id) || DAILY_MAPS[0];
}

function headingTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function gateRadius(g) {
  return (g.size || 1.8) * 0.8;
}

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function insideGate(pos, gate) {
  const r = gate.r != null ? gate.r : gateRadius(gate);
  return dist3(pos, gate) < r;
}

function enteredGate(prev, pos, gate) {
  return insideGate(pos, gate) && !insideGate(prev, gate);
}

function detectPassOrMiss(prev, pos, gates, nextIndex) {
  if (!gates || !gates.length) return { type: 'none' };
  const n = ((nextIndex % gates.length) + gates.length) % gates.length;
  for (let i = 0; i < gates.length; i++) {
    if (!enteredGate(prev, pos, gates[i])) continue;
    if (i === n) return { type: 'pass', index: i };
    return { type: 'miss', index: i, expected: n, penaltyMs: MISS_PENALTY_MS };
  }
  return { type: 'none' };
}

function lapLength(gates) {
  if (!gates || gates.length < 2) return 0;
  let d = 0;
  for (let i = 0; i < gates.length; i++) {
    const a = gates[i], b = gates[(i + 1) % gates.length];
    d += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  return d;
}

function lapLengthMetres(gates) {
  return lapLength(gates) / WS_PER_METRE;
}

function startPad(track) {
  const g = track && track.gates && track.gates[0];
  if (!g) return { x: 0, y: 0.9, z: 4 };
  const dist = (g.size || 1.8) * 3.2;
  return {
    x: g.x - Math.sin(g.ry || 0) * dist,
    y: Math.max(0.9, (g.y || 2) * 0.45),
    z: g.z - Math.cos(g.ry || 0) * dist,
  };
}

function normalizeGate(raw) {
  const g = {
    x: num(raw.x, 0),
    y: num(raw.y, 2),
    z: num(raw.z, 0),
    ry: num(raw.ry, 0),
    size: num(raw.size, 1.8),
    solid: !!raw.solid,
  };
  g.r = gateRadius(g);
  return g;
}

function normalizeTrack(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') throw new Error('BAD TRACK');
  const gates = Array.isArray(raw.gates) ? raw.gates.map(normalizeGate) : [];
  if (gates.length < 2) throw new Error('TRACK NEEDS 2+ GATES');
  return {
    id: raw.id != null ? String(raw.id) : String(fallbackId || 'custom'),
    map: raw.map || 'living',
    name: String(raw.name || 'Custom').slice(0, 32),
    class: raw.class || 'whoop',
    gates,
    flags: Array.isArray(raw.flags) ? raw.flags.map((f) => ({
      x: num(f.x, 0), y: num(f.y, 2), z: num(f.z, 0), ry: num(f.ry, 0),
    })) : [],
    start: raw.start && typeof raw.start === 'object'
      ? { x: num(raw.start.x, 0), y: num(raw.start.y, 0.9), z: num(raw.start.z, 0) }
      : null,
  };
}

function aabb(x, y, z, w, h, d) {
  return [x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2];
}

function wallBoxes(map) {
  const hx = map.w / 2, hz = map.d / 2, t = map.wall || 0.4, H = map.h;
  return [
    [-hx - t, 0, -hz - t, hx + t, H, -hz + t * 0.55],
    [-hx - t, 0, hz - t * 0.55, hx + t, H, hz + t],
    [-hx - t, 0, -hz - t, -hx + t * 0.55, H, hz + t],
    [hx - t * 0.55, 0, -hz - t, hx + t, H, hz + t],
    [-hx, H - 0.28, -hz, hx, H + 0.2, hz],
  ];
}

function furnitureBoxes(mapId) {
  if (mapId === 'living') {
    return [
      aabb(0, 0, -10.6, 7.2, 2.35, 2.7),
      aabb(0, 2.35, -11.5, 7.2, 1.15, 0.7),
      aabb(-3.4, 1.1, -10.6, 0.55, 1.1, 2.5),
      aabb(3.4, 1.1, -10.6, 0.55, 1.1, 2.5),
      aabb(0, 0, -5.9, 3.5, 1.12, 1.9),
      aabb(8.4, 0, 0.2, 1.5, 1.55, 5.6),
      aabb(9.55, 2.2, 0.2, 0.12, 2.6, 4.4),
      aabb(-7.1, 0, -3.8, 2.5, 2.15, 2.5),
      aabb(-6.2, 0, 8.2, 1.5, 4.8, 1.5),
      aabb(8.4, 0, -10.6, 1.6, 5.6, 2.4),
    ];
  }
  if (mapId === 'garage') {
    const out = [];
    for (const z of [-12.2, -8.0, -3.8]) {
      out.push(aabb(-8.4, 0, z, 2.44, 2.15, 2.22));
    }
    out.push(
      aabb(-8.3, 0, 8.2, 3.01, 2.85, 2.89),
      aabb(4.2, 1.32, -5.5, 4.35, 3.77, 7.40),
      aabb(0, 2.35, 20.92, 8.2, 6.05, 0.16),
    );
    for (const z of [3.6, 12.2]) {
      for (const y of [1.05, 2.30, 3.55, 4.80]) out.push(aabb(8.6, y, z, 1.55, 0.10, 5.0));
    }
    return out;
  }
  if (mapId === 'warehouse') {
    const out = [];
    for (const z of [-24, 0, 24]) {
      for (const x of [-22.5, -7.5, 7.5, 22.5]) out.push(aabb(x, 0, z, 3.4, 12.5, 18));
    }
    out.push(aabb(-22, 0, 36, 4.2, 4.2, 4.2));
    out.push(aabb(22, 0, 36, 4.2, 2.4, 4.2));
    out.push(aabb(0, 0, 40.5, 16, 1.1, 3.2));
    return out;
  }
  if (mapId === 'office') {
    const out = [];
    for (const z of [-12, 0, 12]) {
      out.push(aabb(-13.25, 0, z, 6.4, 3.55, 7.0));
      out.push(aabb(-3.75, 0, z, 6.4, 3.55, 7.0));
    }
    out.push(aabb(10.15, 0, -21.6, 0.16, 3.7, 2.8));
    out.push(aabb(10.15, 0, -1.0, 0.16, 3.7, 28.0));
    out.push(aabb(10.15, 0, 20.8, 0.16, 3.7, 4.4));
    out.push(aabb(4.6, 0, -16.2, 5.6, 1.12, 2.4));
    out.push(aabb(4.6, 0.35, -14.4, 1.05, 1.47, 1.2));
    out.push(aabb(4.6, 0.35, -18.0, 1.05, 1.47, 1.2));
    out.push(aabb(14.2, 0, 18.4, 3.6, 1.25, 1.5));
    return out;
  }
  if (mapId === 'gym') {
    const out = [];
    for (let i = 0; i < 4; i++) {
      out.push(aabb(-17.4 - i * 1.35, 0, 0, 1.28, 1.05 + i * 1.05, 54));
      out.push(aabb(17.4 + i * 1.35, 0, 0, 1.28, 1.05 + i * 1.05, 54));
    }
    out.push(aabb(0, 0, 25.15, 0.4, 10.6, 0.4));
    out.push(aabb(0, 9.5, 25.37, 3.6, 2.2, 0.14));
    out.push(aabb(0, 0, -25.15, 0.4, 10.6, 0.4));
    out.push(aabb(0, 9.5, -25.37, 3.6, 2.2, 0.14));
    return out;
  }
  if (mapId === 'trainer') {
    return [
      aabb(-12.2, 0, 0, 1.6, 1.15, 8.4),
      aabb(-12.2, 1.15, -2.4, 2.0, 1.7, 2.2),
      aabb(-12.2, 1.15, 1.2, 2.0, 1.7, 2.2),
      aabb(12.2, 0, -12.4, 1.4, 2.2, 3.2),
    ];
  }
  return [];
}

export function mapObstacles(map) {
  const m = typeof map === 'string' ? mapById(map) : map;
  return wallBoxes(m).concat(furnitureBoxes(m.id));
}

export function minGateSpacing(map) {
  if (map.w >= 45) return 3.2 * WS_PER_METRE;
  if (map.id === 'office') return 8.2;
  return 8.5;
}

export function dailyLapRange(map) {
  if (map.id === 'living') return { minM: 36, maxM: 90 };
  if (map.id === 'trainer') return { minM: 55, maxM: 95 };
  if (map.id === 'garage') return { minM: 36, maxM: 110 };
  const peri = (map.w + map.d) * 1.45;
  const minM = clamp(peri * 0.38 / WS_PER_METRE, 18, 48);
  const maxM = clamp(peri * 1.65 / WS_PER_METRE, 42, 180);
  return { minM, maxM };
}

export function estimateLapSeconds(gates, paceMs) {
  return lapLengthMetres(gates) / (paceMs || LAP_PACE_MS);
}

function inFloor(p, map, margin) {
  if (Math.abs(p.x) > map.w / 2 - margin) return false;
  if (Math.abs(p.z) > map.d / 2 - margin) return false;
  if (p.y < 0.5 || p.y > map.h - 0.7) return false;
  return true;
}

function inBox(p, map, margin) {
  if (!inFloor(p, map, margin)) return false;
  if (p.y < 1.35 || p.y > Math.min(map.h * 0.48, map.h - 1.35)) return false;
  return true;
}

function sphereHitsAabb(px, py, pz, r, b) {
  const qx = clamp(px, b[0], b[3]);
  const qy = clamp(py, b[1], b[4]);
  const qz = clamp(pz, b[2], b[5]);
  return Math.hypot(px - qx, py - qy, pz - qz) < r;
}

function hitsObstacles(px, py, pz, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    if (sphereHitsAabb(px, py, pz, r, boxes[i])) return true;
  }
  return false;
}

function gateAxis(ry) {
  const s = Math.sin(ry), c = Math.cos(ry);
  return { ax: s, az: c, lx: c, lz: -s };
}

function gateClearanceSamples(g) {
  const size = g.size || 1.2;
  const extra = size;
  const { ax, az, lx, lz } = gateAxis(g.ry || 0);
  const pts = [];
  for (const s of [-1, -0.5, 0, 0.5, 1]) {
    for (const u of [-0.7, 0, 0.7]) {
      pts.push({
        x: g.x + lx * s * (size + extra),
        y: g.y + u * size,
        z: g.z + lz * s * (size + extra),
        r: 0.14,
      });
    }
  }
  for (let i = 1; i <= 3; i++) {
    const d = i * 0.55;
    pts.push({
      x: g.x - ax * d,
      y: g.y,
      z: g.z - az * d,
      r: size * 0.35,
    });
  }
  return pts;
}

export function gateHasClearance(g, map, boxes, from) {
  const size = g.size || 1.2;
  const margin = (map.wall || 0.4) + size + size * 0.7;
  if (!inBox(g, map, margin)) return false;
  const obs = boxes || mapObstacles(map);
  const samples = gateClearanceSamples(g);
  for (const s of samples) {
    if (!inBox(s, map, (map.wall || 0.4) + 0.22)) return false;
    if (hitsObstacles(s.x, s.y, s.z, s.r, obs)) return false;
  }
  if (from && !segmentClear(from, g, map, obs, Math.max(0.26, size * 0.26))) return false;
  return true;
}

function segmentClear(a, b, map, boxes, radius) {
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    if (!inFloor({ x, y, z }, map, (map.wall || 0.4) + radius)) return false;
    if (hitsObstacles(x, y, z, radius, boxes)) return false;
  }
  return true;
}

function padClear(track, map, boxes) {
  const pad = startPad(track);
  const g = track.gates[0];
  const r = Math.max(0.45, (g.size || 1.2) * 0.45);
  if (Math.abs(pad.x) > map.w / 2 - 0.8 || Math.abs(pad.z) > map.d / 2 - 0.8) return false;
  if (pad.y < 0.4 || pad.y > map.h * 0.5) return false;
  if (hitsObstacles(pad.x, pad.y, pad.z, r, boxes)) return false;
  return segmentClear(pad, g, map, boxes, r);
}

function ovalPts(map, y, n, inset) {
  const rx = Math.max(2.8, map.w / 2 - inset);
  const rz = Math.max(3.0, map.d / 2 - inset);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: Math.sin(a) * rx, y, z: Math.cos(a) * rz });
  }
  return pts;
}

function slalomPts(map, y, n, inset, amp) {
  const rz = Math.max(3.2, map.d / 2 - inset);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const z = rz - u * rz * 2;
    const x = Math.sin(u * Math.PI * (n > 5 ? 3 : 2)) * amp;
    const yy = y + Math.sin(u * Math.PI) * Math.min(1.1, map.h * 0.08);
    pts.push({ x, y: yy, z });
  }
  return pts;
}

function figure8Pts(map, y, inset) {
  const sep = Math.min(map.w * 0.28, map.w / 2 - inset - 0.4);
  const r = Math.min(map.w * 0.22, map.d * 0.20, map.d / 2 - inset);
  return [
    { x: 0, y, z: Math.min(map.d / 2 - inset, r + 2.8) },
    { x: -sep, y, z: r * 0.15 },
    { x: -sep, y: y + 0.35, z: -r },
    { x: 0, y, z: -Math.min(map.d / 2 - inset, r + 2.2) },
    { x: sep, y: y + 0.35, z: -r },
    { x: sep, y, z: r * 0.15 },
    { x: 0, y, z: r * 0.4 },
  ];
}

function livingLoop(map, y, inset) {
  const ix = map.w / 2 - inset, iz = map.d / 2 - inset;
  return [
    { x: ix * 0.72, y, z: iz * 0.92 },
    { x: ix * 0.88, y: y + 0.1, z: iz * 0.18 },
    { x: ix * 0.78, y, z: -iz * 0.70 },
    { x: 0, y: y + 0.45, z: -iz * 0.74 },
    { x: -ix * 0.62, y, z: -iz * 0.70 },
    { x: -ix * 0.42, y, z: -0.4 },
    { x: -ix * 0.88, y: y + 0.15, z: iz * 0.32 },
    { x: -ix * 0.22, y, z: iz * 0.92 },
    { x: ix * 0.18, y, z: iz * 0.28 },
  ];
}

function garageLoop(map, y, inset) {
  const iz = map.d / 2 - inset;
  return [
    { x: -2.8, y, z: iz * 0.88 },
    { x: -5.6, y, z: iz * 0.28 },
    { x: -5.4, y: y + 0.12, z: -iz * 0.32 },
    { x: -2.6, y, z: -iz * 0.88 },
    { x: -1.4, y, z: -iz * 0.18 },
    { x: -2.2, y, z: iz * 0.22 },
    { x: -2.8, y, z: iz * 0.62 },
  ];
}

function warehouseWeave(map, y, inset) {
  const zFar = Math.min(map.d / 2 - inset, 36.2);
  return [
    { x: 0, y, z: zFar },
    { x: -14, y, z: zFar },
    { x: -14, y, z: 12 },
    { x: -14, y, z: -12 },
    { x: -14, y, z: -zFar },
    { x: 0, y, z: -zFar },
    { x: 14, y, z: -zFar },
    { x: 14, y, z: -12 },
    { x: 14, y, z: 12 },
    { x: 14, y, z: zFar },
  ];
}

function officeLoop(map, y, inset) {
  return [
    { x: 13.5, y, z: 16.8 },
    { x: 13.5, y, z: -2.2 },
    { x: 13.5, y, z: -18.4 },
    { x: 4.6, y: y + 0.2, z: -18.4 },
    { x: 4.6, y, z: 2.2 },
    { x: 4.6, y, z: 16.4 },
  ];
}

function gymLoop(map, y, inset) {
  const ix = Math.min(map.w / 2 - inset, 12.5);
  const iz = Math.min(map.d / 2 - inset, 30);
  return [
    { x: 6.2, y, z: iz * 0.88 },
    { x: -ix * 0.78, y, z: iz * 0.42 },
    { x: -ix * 0.78, y, z: -iz * 0.42 },
    { x: -6.2, y, z: -iz * 0.88 },
    { x: ix * 0.78, y, z: -iz * 0.42 },
    { x: ix * 0.78, y, z: iz * 0.42 },
    { x: 0, y, z: iz * 0.18 },
    { x: 0, y: y + 0.4, z: -iz * 0.18 },
    { x: 6.2, y, z: iz * 0.58 },
  ];
}

function trainerLoop(map, y, inset) {
  const ix = map.w / 2 - inset, iz = map.d / 2 - inset;
  return [
    { x: 0, y, z: iz * 0.92 },
    { x: -ix * 0.80, y, z: iz * 0.36 },
    { x: -ix * 0.78, y: y + 0.16, z: -iz * 0.36 },
    { x: 0, y, z: -iz * 0.92 },
    { x: ix * 0.80, y: y + 0.16, z: -iz * 0.36 },
    { x: ix * 0.80, y, z: iz * 0.36 },
    { x: 0, y, z: iz * 0.12 },
    { x: -ix * 0.40, y, z: -iz * 0.12 },
  ];
}

function starWeave(map, y, inset) {
  const yLo = y;
  const yHi = Math.min(y + 1.25, map.h * 0.40);
  if (map.id === 'living') {
    return [
      { x: 5.8, y: yLo, z: 10.4 },
      { x: -4.6, y: yHi, z: -7.3 },
      { x: 5.8, y: yLo, z: -7.4 },
      { x: -4.8, y: yHi, z: 10.2 },
      { x: 0.2, y: yLo, z: -7.5 },
      { x: -5.8, y: yHi, z: 2.6 },
      { x: 6.2, y: yLo, z: 2.0 },
      { x: -3.0, y: yHi, z: 10.4 },
      { x: 5.4, y: yHi, z: 6.4 },
      { x: -4.4, y: yLo, z: 6.6 },
    ];
  }
  if (map.id === 'garage') {
    const iz = map.d / 2 - inset;
    return [
      { x: -2.8, y: yLo, z: iz * 0.90 },
      { x: -5.6, y: yHi, z: -iz * 0.88 },
      { x: -1.5, y: yLo, z: -iz * 0.88 },
      { x: -5.6, y: yHi, z: iz * 0.90 },
      { x: -1.5, y: yLo, z: iz * 0.12 },
      { x: -5.5, y: yHi, z: -iz * 0.12 },
      { x: -2.6, y: yLo, z: -iz * 0.55 },
      { x: -5.4, y: yHi, z: iz * 0.55 },
      { x: -1.6, y: yLo, z: -iz * 0.55 },
      { x: -4.8, y: yHi, z: iz * 0.20 },
      { x: -2.2, y: yLo, z: iz * 0.70 },
      { x: -5.2, y: yHi, z: -iz * 0.70 },
    ];
  }
  const ix = map.w / 2 - inset;
  const izF = map.d / 2 - inset;
  const izB = map.id === 'living' ? Math.min(izF, 8.0) : izF;
  const bx = map.id === 'living' ? ix * 0.80 : ix * 0.86;
  return [
    { x: bx, y: yLo, z: izF * 0.90 },
    { x: -bx, y: yHi, z: -izB * 0.90 },
    { x: bx, y: yLo, z: -izB * 0.90 },
    { x: -bx, y: yHi, z: izF * 0.90 },
    { x: bx * 0.12, y: yLo, z: -izB * 0.90 },
    { x: -bx, y: yHi, z: izF * 0.12 },
    { x: bx, y: yLo, z: izF * 0.12 },
    { x: -bx * 0.12, y: yHi, z: izF * 0.90 },
    { x: bx * 0.55, y: yHi, z: -izB * 0.28 },
    { x: -bx * 0.55, y: yLo, z: izF * 0.38 },
    { x: bx * 0.72, y: yHi, z: izF * 0.55 },
    { x: -bx * 0.72, y: yLo, z: -izB * 0.40 },
  ];
}

function mapLoop(map, y, inset, kind) {
  if (kind === 'weave') {
    if (map.id === 'living' || map.id === 'trainer' || map.id === 'garage') {
      return starWeave(map, y, inset);
    }
    return mapLoop(map, y, inset, 'aisle');
  }
  if (kind === 'aisle' || kind === 'safe') {
    if (map.id === 'living') return livingLoop(map, y, inset);
    if (map.id === 'garage') return garageLoop(map, y, inset);
    if (map.id === 'warehouse') return warehouseWeave(map, y, inset);
    if (map.id === 'office') return officeLoop(map, y, inset);
    if (map.id === 'gym') return gymLoop(map, y, inset);
    if (map.id === 'trainer') return trainerLoop(map, y, inset);
  }
  return null;
}

function resampleClosed(pts, n) {
  if (!pts || pts.length < 2) return pts || [];
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = dist3(a, b);
    seg.push({ a, b, d, start: total });
    total += d;
  }
  if (total < 1e-3) return pts.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    let u = (i / n) * total;
    if (u >= total) u = total - 1e-6;
    let s = seg[0];
    for (let k = 0; k < seg.length; k++) if (u >= seg[k].start) s = seg[k];
    const t = s.d < 1e-6 ? 0 : (u - s.start) / s.d;
    out.push({
      x: s.a.x + (s.b.x - s.a.x) * t,
      y: s.a.y + (s.b.y - s.a.y) * t,
      z: s.a.z + (s.b.z - s.a.z) * t,
    });
  }
  return out;
}

function placeClear(p, ry, size, map, boxes) {
  const inwardX = p.x === 0 ? 0 : -Math.sign(p.x);
  const inwardZ = p.z === 0 ? 0 : -Math.sign(p.z);
  const dirs = [
    [0, 0, 0],
    [inwardX, 0, 0], [0, 0, inwardZ], [inwardX, 0, inwardZ],
    [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    [0.7, 0, 0.7], [-0.7, 0, 0.7], [0.7, 0, -0.7], [-0.7, 0, -0.7],
    [0, 0.55, 0], [0, -0.35, 0], [0, 0.9, 0],
  ];
  const steps = [0, 0.4, 0.85, 1.35, 1.9, 2.6, 3.3];
  const yLo = 1.55, yHi = Math.min(map.h * 0.42, 4.6);
  for (let s = 0; s < steps.length; s++) {
    for (let d = 0; d < dirs.length; d++) {
      const q = {
        x: p.x + dirs[d][0] * steps[s],
        y: clamp(p.y + dirs[d][1] * steps[s], yLo, yHi),
        z: p.z + dirs[d][2] * steps[s],
        ry, size, solid: true,
      };
      if (gateHasClearance(q, map, boxes)) return q;
    }
  }
  return null;
}

function thinSpacing(gates, minD) {
  if (gates.length < 2) return gates;
  const out = [gates[0]];
  for (let i = 1; i < gates.length; i++) {
    if (dist3(out[out.length - 1], gates[i]) >= minD) out.push(gates[i]);
  }
  while (out.length > 4 && dist3(out[out.length - 1], out[0]) < minD) out.pop();
  return out;
}

function finishGates(placed, size, map, boxes) {
  const out = [];
  for (let i = 0; i < placed.length; i++) {
    const n = placed[(i + 1) % placed.length];
    const ry = headingTo(placed[i], n);
    const hit = placeClear(placed[i], ry, size, map, boxes);
    if (!hit) continue;
    hit.ry = headingTo(hit, n);
    hit.size = size;
    hit.solid = true;
    out.push(hit);
  }
  const spaced = thinSpacing(out, minGateSpacing(map));
  if (spaced.length < 4) return [];
  for (let i = 0; i < spaced.length; i++) {
    const n = spaced[(i + 1) % spaced.length];
    const ry = headingTo(spaced[i], n);
    const hit = placeClear(spaced[i], ry, size, map, boxes) || spaced[i];
    hit.ry = +headingTo(hit, n).toFixed(3);
    hit.x = +hit.x.toFixed(2);
    hit.y = +hit.y.toFixed(2);
    hit.z = +hit.z.toFixed(2);
    hit.size = +size.toFixed(2);
    hit.solid = true;
    spaced[i] = hit;
  }
  return spaced;
}

function buildGatesFromPts(pts, size, map, boxes) {
  const placed = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], n = pts[(i + 1) % pts.length];
    const hit = placeClear(p, headingTo(p, n), size, map, boxes);
    if (hit) placed.push(hit);
  }
  return finishGates(thinSpacing(placed, minGateSpacing(map)), size, map, boxes);
}

function rotateStart(gates, map, boxes) {
  let best = 0, bestScore = -1e9;
  for (let i = 0; i < gates.length; i++) {
    const rot = gates.slice(i).concat(gates.slice(0, i));
    const t = { gates: rot, map: map.id };
    if (!padClear(t, map, boxes)) continue;
    const pad = startPad(t);
    const score = Math.min(map.w / 2 - Math.abs(pad.x), map.d / 2 - Math.abs(pad.z));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best ? gates.slice(best).concat(gates.slice(0, best)) : gates;
}

function trackFromPts(pts, size, map, id, name, boxes) {
  const built = buildGatesFromPts(pts, size, map, boxes);
  if (built.length < 4) return null;
  const gates = rotateStart(built, map, boxes);
  const flags = [{
    x: +((gates[0].x + gates[Math.floor(gates.length / 2)].x) * 0.5).toFixed(2),
    y: +(gates[0].y + 0.35).toFixed(2),
    z: +((gates[0].z + gates[Math.floor(gates.length / 2)].z) * 0.5).toFixed(2),
    ry: 0,
  }];
  return normalizeTrack({ id, map: map.id, name, class: 'whoop', gates, flags });
}

function playableInset(map, size) {
  return (map.wall || 0.4) + size + size * 0.95 + 0.25;
}

function shapePts(kind, map, y, inset, size, rand) {
  const nHi = kind === 'weave' ? 14 : map.w >= 45 ? 12 : map.w >= 30 ? 10 : 8;
  if (kind === 'slalom') {
    const n = 6 + Math.floor(rand() * (nHi - 5));
    const amp = Math.min(map.w / 2 - inset - 0.5, (map.w < 30 ? 5.2 : 8.5) + rand() * 3);
    return slalomPts(map, y, n, inset, Math.max(2.2, amp));
  }
  if (kind === 'figure8' && map.w >= 24 && map.d >= 28) return figure8Pts(map, y, inset);
  if (kind === 'oval') {
    const n = 6 + Math.floor(rand() * (nHi - 5));
    return ovalPts(map, y, n, inset);
  }
  const loop = mapLoop(map, y, inset, kind);
  if (!loop) return ovalPts(map, y, 6, inset);
  const spacing = minGateSpacing(map);
  let len = 0;
  let spaced = true;
  for (let i = 0; i < loop.length; i++) {
    const d = dist3(loop[i], loop[(i + 1) % loop.length]);
    len += d;
    if (d < spacing) spaced = false;
  }
  if (kind === 'weave' && loop.length >= 8 && spaced) return loop;
  const nLo = kind === 'weave' ? 8 : 5;
  const n = clamp(Math.floor(len / spacing), nLo, nHi);
  return resampleClosed(loop, n);
}

function generateOnMap(seedKey, map, id, name) {
  const rand = mulberry32(hashStr(seedKey + '|g' + DAILY_GEN + '|' + map.id));
  const size = clamp(GATE_SIZE_MIN + rand() * (GATE_SIZE_MAX - GATE_SIZE_MIN), GATE_SIZE_MIN, GATE_SIZE_MAX);
  const y = clamp(map.h * 0.22, 1.85, 3.2);
  const inset = playableInset(map, size);
  const boxes = mapObstacles(map);
  const shapes = (map.id === 'warehouse' || map.id === 'office')
    ? ['aisle', 'safe']
    : (map.id === 'living' || map.id === 'trainer' || map.id === 'garage')
      ? ['weave', 'aisle', 'figure8']
      : ['aisle', 'oval', 'slalom', 'figure8'];
  const sizes = [
    size,
    clamp(size - 0.14, GATE_SIZE_MIN, GATE_SIZE_MAX),
    clamp((GATE_SIZE_MIN + GATE_SIZE_MAX) * 0.5, GATE_SIZE_MIN, GATE_SIZE_MAX),
  ];
  let best = null;
  for (let si = 0; si < sizes.length; si++) {
    const sz = sizes[si];
    const insetSz = playableInset(map, sz);
    const order = [];
    order.push(shapes[Math.floor(rand() * shapes.length)]);
    for (const s of shapes) if (!order.includes(s)) order.push(s);
    order.push('safe');
    for (let i = 0; i < order.length; i++) {
      const kind = order[i];
      const pts = shapePts(kind, map, y, insetSz, sz, rand);
      const track = trackFromPts(pts, sz, map, id, name, boxes);
      if (track && dailyTrackValid(track)) return track;
      if (track && !best) best = track;
      const fat = insetSz + 0.55;
      const retry = trackFromPts(shapePts(kind, map, y, fat, sz, rand), sz, map, id, name, boxes);
      if (retry && dailyTrackValid(retry)) return retry;
      if (retry && !best) best = retry;
    }
  }
  const fallback = trackFromPts(mapLoop(map, y, inset + 0.4, 'safe') || ovalPts(map, y, 6, inset + 0.6), size, map, id, name, boxes);
  if (fallback) return fallback;
  const last = buildGatesFromPts(ovalPts(map, y, 5, Math.max(inset, 4.4)), size, map, boxes);
  if (last.length >= 4) {
    return normalizeTrack({ id, map: map.id, name, class: 'whoop', gates: last, flags: [] });
  }
  return normalizeTrack({
    id, map: map.id, name, class: 'whoop',
    gates: finishGates(safeCourse(map, y, size), size, map, boxes),
    flags: [],
  });
}

function safeCourse(map, y, size) {
  const pts = mapLoop(map, y, playableInset(map, size) + 0.8, 'safe') || ovalPts(map, y, 5, 4.8);
  return pts.map((p, i) => {
    const n = pts[(i + 1) % pts.length];
    return { x: p.x, y: p.y, z: p.z, ry: headingTo(p, n), size, solid: true };
  });
}

export function dailyTrackInvalidReason(track) {
  let t;
  try { t = normalizeTrack(track); }
  catch (e) { return 'BAD TRACK'; }
  const map = DAILY_MAPS.find((m) => m.id === t.map);
  if (!map) return 'MAP';
  if (t.class !== 'whoop') return 'CLASS';
  if (t.gates.length < 4 || t.gates.length > 14) return 'COUNT';
  const boxes = mapObstacles(map);
  const spacing = minGateSpacing(map);
  for (let i = 0; i < t.gates.length; i++) {
    const g = t.gates[i];
    if (g.size < GATE_SIZE_MIN - 0.04 || g.size > GATE_SIZE_MAX + 0.08) return 'SIZE';
    if (!g.solid) return 'SOLID';
    const prev = t.gates[(i + t.gates.length - 1) % t.gates.length];
    if (!gateHasClearance(g, map, boxes, prev)) return 'CLEAR ' + i;
    const nxt = t.gates[(i + 1) % t.gates.length];
    if (dist3(g, nxt) < spacing - 0.05) return 'SPACE ' + i;
    if (!segmentClear(g, nxt, map, boxes, Math.max(0.26, g.size * 0.26))) return 'PATH ' + i;
  }
  const metres = lapLengthMetres(t.gates);
  const range = dailyLapRange(map);
  if (metres < range.minM || metres > range.maxM) return 'LAP';
  if (!padClear(t, map, boxes)) return 'PAD';
  return '';
}

export function dailyTrackValid(track) {
  return dailyTrackInvalidReason(track) === '';
}

function seedPrefix() {
  return 'g' + DAILY_GEN + '|';
}

export function dailyTrackOnMap(seedKey, mapId, id, name) {
  const map = mapById(mapId);
  return generateOnMap(seedKey, map, id || ('gen-' + map.id), name || map.name);
}

export function dailyTrackFor(utc, now) {
  const day = utc || utcDateId(now);
  const rand = mulberry32(hashStr(seedPrefix() + 'daily|' + day));
  const map = DAILY_MAPS[Math.floor(rand() * DAILY_MAPS.length)];
  const id = dailyIdFor(day);
  const name = 'Daily ' + day.slice(5);
  return generateOnMap(seedPrefix() + 'daily|' + day, map, id, name);
}

export function weeklyTrackFor(week, now) {
  const w = String(week || utcWeekId(now)).replace(/-g\d+$/, '');
  const rand = mulberry32(hashStr(seedPrefix() + 'weekly|' + w));
  const map = DAILY_MAPS[Math.floor(rand() * DAILY_MAPS.length)];
  const id = weeklyIdFor(w);
  const name = 'Week ' + w.replace('W', '');
  return generateOnMap(seedPrefix() + 'weekly|' + w, map, id, name);
}

export function trackFromRetentionId(id, now) {
  if (isDailyTrackId(id)) return dailyTrackFor(id.slice(6), now);
  if (isWeeklyTrackId(id)) return weeklyTrackFor(weekFromTrackId(id) || id.slice(7), now);
  if (id === 'daily') return dailyTrackFor(utcDateId(now), now);
  if (id === 'weekly') return weeklyTrackFor(utcWeekId(now), now);
  return null;
}

export function ghostPayloadError(p, expectTrack) {
  if (!p || p.v !== 1 || !Array.isArray(p.samples) || p.samples.length < 2) return 'BAD GHOST CODE';
  const okLegacy = p.track === 0 || p.track === 1;
  const okNew = typeof p.track === 'string' && p.track.length > 0 && p.track.length < 48;
  if (!okLegacy && !okNew) return 'BAD GHOST TRACK';
  if (expectTrack !== null && expectTrack !== undefined) {
    const asLegacy = (id) => {
      if (id === 0 || id === '0' || id === 'city-loop') return 0;
      if (id === 1 || id === '1' || id === 'city-zigzag') return 1;
      return null;
    };
    const a = asLegacy(p.track), b = asLegacy(expectTrack);
    const match = a !== null && b !== null ? a === b : String(p.track) === String(expectTrack);
    if (!match) return 'GHOST IS FOR TRACK ' + String(p.track) + ' — SWITCH TRACKS TO RACE IT';
  }
  let lastT = -1;
  for (const s of p.samples) {
    if (!Array.isArray(s) || s.length < 8 || s.some((n) => typeof n !== 'number' || !isFinite(n))) return 'BAD GHOST DATA';
    if (!(s[0] >= 0 && s[0] < 6e5 && s[0] >= lastT)) return 'BAD GHOST TIMESTAMPS';
    if (Math.abs(s[1]) > 3000 || Math.abs(s[3]) > 3000 || s[2] < -50 || s[2] > 1200) return 'GHOST OUT OF BOUNDS';
    lastT = s[0];
  }
  return null;
}

function lapsFrom(samples, gates, startNext) {
  let next = startNext;
  let laps = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = { x: samples[i - 1][1], y: samples[i - 1][2], z: samples[i - 1][3] };
    const pos = { x: samples[i][1], y: samples[i][2], z: samples[i][3] };
    const hit = detectPassOrMiss(prev, pos, gates, next);
    if (hit.type !== 'pass') continue;
    next = (next + 1) % gates.length;
    if (next === 0) laps++;
  }
  return laps;
}

export function countGhostLaps(samples, track) {
  const gates = (track.gates || []).map((g) => normalizeGate(g));
  if (gates.length < 2 || !samples || samples.length < 2) return 0;
  // Ghost recording starts at the gate-0 run start (next = 1) or includes that
  // pass (next = 0). Take the better sequential count.
  return Math.max(lapsFrom(samples, gates, 0), lapsFrom(samples, gates, 1));
}

export function sampleSpeeds(samples) {
  const out = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i][0] - samples[i - 1][0]) / 1000;
    if (dt <= 0) continue;
    const dist = Math.hypot(
      samples[i][1] - samples[i - 1][1],
      samples[i][2] - samples[i - 1][2],
      samples[i][3] - samples[i - 1][3],
    );
    out.push(dist / dt);
  }
  return out;
}

export function classId(frameMm) {
  const n = +frameMm;
  if (n === 75 || n === 85) return n;
  return 65;
}

export function classFromBuild(build) {
  if (!build || typeof build !== 'object') return null;
  if (build.frameMm == null && build.class == null) return null;
  return classId(build.frameMm != null ? build.frameMm : build.class);
}

export function validateSubmittedRun(input) {
  const src = input || {};
  const frameMm = classId(src.frameMm);
  const timeMs = +src.timeMs;
  const ghost = src.ghost;
  let track = src.track;
  if (typeof track === 'string') track = trackFromRetentionId(track);
  if (!track || typeof track !== 'object') return { ok: false, reason: 'NO TRACK' };
  try { track = normalizeTrack(track); }
  catch (e) { return { ok: false, reason: 'BAD TRACK' }; }

  if (src.threeD || (ghost && (ghost.threeD || ghost.mode3d))) {
    return { ok: false, reason: '3D MODE' };
  }

  const payloadErr = ghostPayloadError(ghost, track.id);
  if (payloadErr) return { ok: false, reason: payloadErr };

  const samples = ghost.samples;
  if (samples.length < 8) return { ok: false, reason: 'TOO FEW SAMPLES' };
  if (!Number.isFinite(timeMs) || timeMs < 5000 || timeMs > 180000) return { ok: false, reason: 'BAD TIME' };
  const span = samples[samples.length - 1][0] - samples[0][0];
  if (Math.abs(span - timeMs) > 4000) return { ok: false, reason: 'TIME MISMATCH' };

  let lastT = samples[0][0];
  const maxV = CLASS_MAX_SPEED[frameMm];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i][0] - lastT) / 1000;
    if (dt < 0) return { ok: false, reason: 'BAD TIMESTAMPS' };
    if (dt > 0.85) return { ok: false, reason: 'SPARSE SAMPLES' };
    if (dt > 0) {
      const dist = Math.hypot(
        samples[i][1] - samples[i - 1][1],
        samples[i][2] - samples[i - 1][2],
        samples[i][3] - samples[i - 1][3],
      );
      if (dist / dt > maxV * 1.08) return { ok: false, reason: 'SPEED LIMIT' };
    }
    lastT = samples[i][0];
  }

  const laps = countGhostLaps(samples, track);
  if (laps < RUN_LAPS) return { ok: false, reason: 'INCOMPLETE LAPS' };
  return { ok: true, laps, frameMm, timeMs, trackId: track.id };
}

function nameCharOk(ch) {
  if (ch === ' ' || ch === '.' || ch === '-' || ch === '_') return true;
  try { return /\p{L}|\p{N}/u.test(ch); }
  catch (e) { return /[A-Za-z0-9]/.test(ch); }
}

export function sanitizePilotName(raw) {
  const chars = [];
  const src = String(raw == null ? 'PILOT' : raw).normalize('NFC');
  for (const ch of src) {
    if (nameCharOk(ch)) chars.push(ch);
    if (chars.length >= PILOT_NAME_MAX) break;
  }
  const s = chars.join('').trim();
  return s || 'PILOT';
}

export function escapeHtml(raw) {
  return String(raw == null ? '' : raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function b64utf8(str) {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(str)));
  }
  return Buffer.from(str, 'utf8').toString('base64');
}

function utf8b64(b64) {
  const clean = String(b64).replace(/\s+/g, '');
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(clean)));
  }
  return Buffer.from(clean, 'base64').toString('utf8');
}

function parseMaybeJson(s) {
  try { return JSON.parse(s); }
  catch (e) { return null; }
}

export function shareTrackPayload(track) {
  const t = normalizeTrack(track);
  return {
    v: 1,
    id: t.id,
    n: t.name,
    m: t.map,
    g: t.gates.map((g) => [g.x, g.y, g.z, g.ry, g.size, g.solid ? 1 : 0]),
    f: (t.flags || []).map((f) => [f.x, f.y, f.z, f.ry]),
  };
}

export function fromShareTrackPayload(p) {
  if (!p || p.v !== 1 || !Array.isArray(p.g) || p.g.length < 2) throw new Error('BAD TRACK CODE');
  return normalizeTrack({
    id: p.id || 'custom',
    name: p.n || 'Custom',
    map: p.m || 'city',
    gates: p.g.map((g) => ({
      x: g[0], y: g[1], z: g[2], ry: g[3], size: g[4], solid: !!g[5],
    })),
    flags: Array.isArray(p.f) ? p.f.map((f) => ({ x: f[0], y: f[1], z: f[2], ry: f[3] })) : [],
  });
}

export function ghostFromObj(p) {
  const err = ghostPayloadError(p, null);
  if (err) throw new Error(err);
  return {
    v: 1,
    phys: p.phys,
    track: p.track,
    name: sanitizePilotName(p.name),
    lapTime: +p.lapTime || 0,
    samples: p.samples,
  };
}

export function encodeDuel({ ghost, track } = {}) {
  const g = ghostFromObj(ghost);
  const payload = { v: 1, k: DUEL_KIND, ghost: g };
  if (track) payload.track = shareTrackPayload(track);
  return SHARE_PREFIX + b64utf8(JSON.stringify(payload));
}

export function decodeQm2(code) {
  const s = String(code || '').trim();
  if (!s) throw new Error('PASTE A CODE FIRST');
  let p = null;
  if (s[0] === '{') p = parseMaybeJson(s);
  else {
    const body = s.indexOf(SHARE_PREFIX) === 0 ? s.slice(SHARE_PREFIX.length) : s;
    try { p = JSON.parse(utf8b64(body)); }
    catch (e) { p = null; }
  }
  if (!p || p.v !== 1) throw new Error('BAD CODE');
  if (p.k === DUEL_KIND || p.kind === DUEL_KIND) {
    const ghost = ghostFromObj(p.ghost || p);
    let track = null;
    if (p.track && p.track.g) track = fromShareTrackPayload(p.track);
    else if (ghost.track != null) track = trackFromRetentionId(ghost.track);
    return { type: 'duel', ghost, track };
  }
  if (Array.isArray(p.g)) {
    return { type: 'track', track: fromShareTrackPayload(p) };
  }
  if (Array.isArray(p.samples)) {
    return { type: 'ghost', ghost: ghostFromObj(p) };
  }
  throw new Error('BAD CODE');
}

export function decodeDuel(code) {
  const r = decodeQm2(code);
  if (r.type !== 'duel' && r.type !== 'ghost') throw new Error('NOT A DUEL CODE');
  return r;
}

export function duelResult(playerMs, rivalMs) {
  const a = +playerMs, b = +rivalMs;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) {
    return { kind: 'done', deltaMs: 0, text: 'RUN ' + a };
  }
  const delta = a - b;
  if (delta < 0) return { kind: 'win', deltaMs: delta, text: 'DUEL WIN −' + fmtMs(-delta) };
  if (delta > 0) return { kind: 'lose', deltaMs: delta, text: 'DUEL LOSS +' + fmtMs(delta) };
  return { kind: 'tie', deltaMs: 0, text: 'DUEL TIE' };
}

export function fmtMs(ms) {
  const n = Math.max(0, Math.round(+ms || 0));
  const m = Math.floor(n / 60000);
  const s = Math.floor((n % 60000) / 1000);
  const cs = Math.floor((n % 1000) / 10);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
}

export function emptyDaily() {
  return { v: 1, streak: 0, bestStreak: 0, lastUtc: null, bestByDay: {}, playsByDay: {} };
}

export function normalizeDaily(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = emptyDaily();
  out.streak = Math.max(0, Math.min(3650, num(src.streak, 0) | 0));
  out.bestStreak = Math.max(out.streak, Math.min(3650, num(src.bestStreak, 0) | 0));
  if (typeof src.lastUtc === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.lastUtc)) out.lastUtc = src.lastUtc;
  if (src.bestByDay && typeof src.bestByDay === 'object') {
    for (const [k, v] of Object.entries(src.bestByDay)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(+v) && +v > 0) out.bestByDay[k] = +v;
    }
  }
  if (src.playsByDay && typeof src.playsByDay === 'object') {
    for (const [k, v] of Object.entries(src.playsByDay)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(+v) && +v > 0) out.playsByDay[k] = +v | 0;
    }
  }
  return out;
}

function storageOf(storage) {
  return storage || (typeof localStorage !== 'undefined' ? localStorage : null);
}

export function loadDaily(storage, now, skipReset) {
  const store = storageOf(storage);
  if (!store) {
    const empty = normalizeDaily(emptyDaily());
    return skipReset ? empty : applyMissedDayReset(empty, now).progress;
  }
  try {
    const raw = store.getItem(DAILY_KEY);
    const parsed = raw ? normalizeDaily(JSON.parse(raw)) : normalizeDaily(emptyDaily());
    if (skipReset) return parsed;
    return applyMissedDayReset(parsed, now).progress;
  } catch (e) {
    return normalizeDaily(emptyDaily());
  }
}

export function saveDaily(progress, storage) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    store.setItem(DAILY_KEY, JSON.stringify(normalizeDaily(progress)));
    return true;
  } catch (e) {
    return false;
  }
}

export function applyMissedDayReset(progress, now) {
  const p = normalizeDaily(progress);
  const today = utcDateId(now);
  if (!p.lastUtc) return { progress: p, reset: false };
  if (p.lastUtc === today || addUtcDays(p.lastUtc, 1) === today) {
    return { progress: p, reset: false };
  }
  if (p.streak === 0) return { progress: p, reset: false };
  p.streak = 0;
  return { progress: p, reset: true };
}

export function syncDailyStreak(storage, now) {
  const store = storageOf(storage);
  const applied = applyMissedDayReset(loadDaily(store, now, true), now);
  if (applied.reset) saveDaily(applied.progress, store);
  return applied;
}

export function recordDailyFinish(progress, { utc, timeMs, trackId } = {}, now) {
  const p = normalizeDaily(progress);
  const today = utcDateId(now);
  const day = utc || today;
  const t = +timeMs;
  if (!Number.isFinite(t) || t <= 0) return { progress: p, improved: false, streak: p.streak, counted: false };
  if (day !== today) return { progress: p, improved: false, streak: p.streak, counted: false };
  if (trackId && trackId !== dailyIdFor(today)) {
    return { progress: p, improved: false, streak: p.streak, counted: false };
  }
  p.playsByDay[day] = (p.playsByDay[day] || 0) + 1;
  let improved = false;
  if (!p.bestByDay[day] || t < p.bestByDay[day]) {
    p.bestByDay[day] = t;
    improved = true;
  }
  if (p.lastUtc !== day) {
    if (p.lastUtc && addUtcDays(p.lastUtc, 1) === day) p.streak = (p.streak || 0) + 1;
    else p.streak = 1;
    p.lastUtc = day;
  }
  if (p.streak > p.bestStreak) p.bestStreak = p.streak;
  return { progress: p, improved, streak: p.streak, bestMs: p.bestByDay[day], counted: true };
}

export function emptyBoard() {
  return { v: 1, weeks: {} };
}

export function normalizeBoard(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = emptyBoard();
  const weeks = src.weeks && typeof src.weeks === 'object' ? src.weeks : {};
  for (const [week, classes] of Object.entries(weeks)) {
    if (!/^\d{4}-W\d{2}$/.test(week) || !classes || typeof classes !== 'object') continue;
    out.weeks[week] = { 65: [], 75: [], 85: [] };
    for (const c of CLASS_IDS) {
      const list = Array.isArray(classes[c]) ? classes[c] : (Array.isArray(classes[String(c)]) ? classes[String(c)] : []);
      const rows = [];
      for (const row of list) {
        if (!row || !Number.isFinite(+row.timeMs) || +row.timeMs <= 0) continue;
        rows.push({
          name: sanitizePilotName(row.name),
          timeMs: +row.timeMs | 0,
          trackId: String(row.trackId || ''),
          at: num(row.at, 0),
        });
      }
      rows.sort((a, b) => a.timeMs - b.timeMs);
      out.weeks[week][c] = rows.slice(0, 20);
    }
  }
  return out;
}

export function loadBoard(storage) {
  const store = storageOf(storage);
  if (!store) return emptyBoard();
  try {
    const raw = store.getItem(BOARD_KEY);
    if (!raw) return emptyBoard();
    return normalizeBoard(JSON.parse(raw));
  } catch (e) {
    return emptyBoard();
  }
}

export function saveBoard(board, storage) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    store.setItem(BOARD_KEY, JSON.stringify(normalizeBoard(board)));
    return true;
  } catch (e) {
    return false;
  }
}

export function recordLocalBoard(board, { week, frameMm, name, timeMs, trackId, at } = {}) {
  const b = normalizeBoard(board);
  const w = week || utcWeekId();
  const c = classId(frameMm);
  if (!b.weeks[w]) b.weeks[w] = { 65: [], 75: [], 85: [] };
  const row = {
    name: sanitizePilotName(name),
    timeMs: +timeMs | 0,
    trackId: String(trackId || ''),
    at: at || Date.now(),
  };
  const list = b.weeks[w][c].filter((r) => r.name !== row.name);
  list.push(row);
  list.sort((a, b2) => a.timeMs - b2.timeMs);
  b.weeks[w][c] = list.slice(0, 20);
  return b;
}

export function boardRows(board, week, frameMm) {
  const b = normalizeBoard(board);
  const w = week || utcWeekId();
  const c = classId(frameMm);
  return (b.weeks[w] && b.weeks[w][c]) || [];
}

export function isLocalHost(loc) {
  if (!loc) return false;
  const host = String(loc.hostname || loc.host || '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

export function allowedOriginList(spec) {
  const raw = spec == null || spec === '' ? DEFAULT_ALLOWED_ORIGIN : String(spec);
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function pickCorsOrigin(spec, requestOrigin) {
  const list = allowedOriginList(spec);
  if (list.includes('*')) return requestOrigin || '*';
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0] || DEFAULT_ALLOWED_ORIGIN;
}

export function leaderboardUrl(storage, loc) {
  const place = loc || (typeof location !== 'undefined' ? location : null);
  try {
    if (isLocalHost(place)) {
      const search = place && (place.search || '');
      if (search) {
        const q = new URLSearchParams(search.startsWith('?') ? search : '?' + search).get('lb');
        if (q && /^https:\/\//i.test(q)) return q.replace(/\/$/, '');
      }
    }
  } catch (e) { /* ignore */ }
  const store = storageOf(storage);
  try {
    const s = store && store.getItem(LEADERBOARD_URL_KEY);
    if (s && /^https:\/\//i.test(s)) return s.replace(/\/$/, '');
  } catch (e) { /* ignore */ }
  return String(LEADERBOARD_URL || '').replace(/\/$/, '');
}

function randomHex(n) {
  const bytes = new Uint8Array(n);
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else {
    for (let i = 0; i < n; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

export function issuePilotToken(storage) {
  const store = storageOf(storage);
  try {
    const existing = store && store.getItem(PILOT_TOKEN_KEY);
    if (existing && /^[a-f0-9]{32,64}$/i.test(existing)) return existing;
  } catch (e) { /* ignore */ }
  const token = randomHex(16);
  try { if (store) store.setItem(PILOT_TOKEN_KEY, token); }
  catch (e) { /* ignore */ }
  return token;
}

export async function hashPilotToken(token) {
  const text = String(token || '');
  const bytes = new TextEncoder().encode(text);
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && c.subtle && typeof c.subtle.digest === 'function') {
    const buf = await c.subtle.digest('SHA-256', bytes);
    const arr = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return hex;
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex');
}

export function onlineBoardsEnabled(url) {
  return !!(url && /^https:\/\//i.test(url));
}

export function medalCount(medals, need) {
  const src = medals && typeof medals === 'object' ? medals : {};
  const rank = MEDAL_RANK[need] || 0;
  let n = 0;
  for (const v of Object.values(src)) {
    if ((MEDAL_RANK[v] || 0) >= rank) n++;
  }
  return n;
}

export function bestDailyMs(daily) {
  const p = normalizeDaily(daily);
  let best = null;
  for (const v of Object.values(p.bestByDay)) {
    if (best == null || v < best) best = v;
  }
  return best;
}

export function isSkinUnlocked(skin, { medals, daily } = {}) {
  const rule = (skin && skin.unlock) || { type: 'always' };
  if (rule.type === 'always') return true;
  const d = normalizeDaily(daily);
  if (rule.type === 'streak') return (d.bestStreak || d.streak || 0) >= rule.days;
  if (rule.type === 'dailyMs') {
    const best = bestDailyMs(d);
    return best != null && best <= rule.ms;
  }
  if (rule.type === 'medals') return medalCount(medals, rule.medal) >= rule.count;
  return false;
}

export function skinUnlockLabel(skin) {
  const rule = (skin && skin.unlock) || { type: 'always' };
  if (rule.type === 'always') return 'Free';
  if (rule.type === 'streak') return rule.days + '-day streak';
  if (rule.type === 'dailyMs') return 'Daily under ' + fmtMs(rule.ms);
  if (rule.type === 'medals') {
    const n = rule.count;
    const word = n === 1 ? 'medal' : 'medals';
    return n + ' ' + rule.medal + ' ' + word;
  }
  return 'Locked';
}

export function skinHex(n) {
  return '#' + (Number(n) >>> 0).toString(16).padStart(6, '0');
}

function hexRgb(n) {
  const v = Number(n) >>> 0;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function colorLum(n) {
  const { r, g, b } = hexRgb(n);
  const chan = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function mixHex(a, b, t) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return (r << 16) | (g << 8) | bl;
}

// Dark frames vanish on the Skins panel (#15171D). Lift them toward paper
// cream so the swatch still reads as a ducted whoop. 3D craft keeps pal.frame.
const SWATCH_PAPER = 0xf2f0ea;
const SWATCH_MIN_LUM = 0.14;

export function skinSwatchStroke(skin) {
  const pal = skinPalette(skin);
  const frame = pal.frame;
  if (colorLum(frame) >= SWATCH_MIN_LUM) return frame;
  let t = 0.42;
  let stroke = mixHex(frame, SWATCH_PAPER, t);
  while (colorLum(stroke) < SWATCH_MIN_LUM && t < 0.85) {
    t += 0.08;
    stroke = mixHex(frame, SWATCH_PAPER, t);
  }
  return stroke;
}

export function skinPalette(skin) {
  const s = skin || SKINS[0];
  return {
    canopy: s.canopy,
    body: s.body,
    frame: s.frame != null ? s.frame : s.body,
    prop: s.prop != null ? s.prop : s.canopy,
    led: s.led != null ? s.led : s.canopy,
    trail: s.trail != null ? s.trail : s.canopy,
  };
}

export function skinCssVars(skin) {
  const pal = skinPalette(skin);
  return '--sk-frame:' + skinHex(pal.frame)
    + ';--sk-stroke:' + skinHex(skinSwatchStroke(skin))
    + ';--sk-canopy:' + skinHex(pal.canopy)
    + ';--sk-prop:' + skinHex(pal.prop)
    + ';--sk-led:' + skinHex(pal.led)
    + ';--sk-body:' + skinHex(pal.body)
    + ';--sk-trail:' + skinHex(pal.trail);
}

export function skinMiniMarkup() {
  const ducts = [[20, 20], [60, 20], [20, 60], [60, 60]];
  let svg = '<svg class="skin-mini" viewBox="0 0 80 80" aria-hidden="true">';
  for (const [cx, cy] of ducts) {
    svg += '<circle class="sk-prop" cx="' + cx + '" cy="' + cy + '" r="11"/>';
    let blades = '';
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      blades += 'M' + cx + ' ' + cy + 'L'
        + (cx + Math.cos(a) * 11).toFixed(1) + ' '
        + (cy + Math.sin(a) * 11).toFixed(1);
    }
    svg += '<path class="sk-blade" d="' + blades + '"/>';
    svg += '<circle class="sk-duct-edge" cx="' + cx + '" cy="' + cy + '" r="16"/>';
    svg += '<circle class="sk-duct" cx="' + cx + '" cy="' + cy + '" r="16"/>';
    svg += '<circle class="sk-led" cx="' + cx + '" cy="' + (cy + 13) + '" r="2.4"/>';
  }
  svg += '<path class="sk-frame-edge" d="M28 28 L52 52 M52 28 L28 52"/>';
  svg += '<path class="sk-frame" d="M28 28 L52 52 M52 28 L28 52"/>';
  svg += '<ellipse class="sk-body" cx="40" cy="42" rx="9" ry="7"/>';
  svg += '<ellipse class="sk-canopy" cx="40" cy="36" rx="8" ry="7"/>';
  svg += '<circle class="sk-lens" cx="40" cy="30" r="2.2"/>';
  svg += '</svg>';
  return svg;
}

export function unlockedSkins(progress) {
  return SKINS.filter((s) => isSkinUnlocked(s, progress));
}

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export function loadSkinId(storage) {
  const store = storageOf(storage);
  if (!store) return 'stock';
  try {
    const id = store.getItem(SKIN_KEY);
    return SKINS.some((s) => s.id === id) ? id : 'stock';
  } catch (e) {
    return 'stock';
  }
}

export function saveSkinId(id, storage) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    store.setItem(SKIN_KEY, skinById(id).id);
    return true;
  } catch (e) {
    return false;
  }
}

export function resolveSkin(id, progress) {
  const skin = skinById(id);
  if (isSkinUnlocked(skin, progress)) return skin;
  return SKINS[0];
}

export function loadCanopyOn(storage) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    return store.getItem(CANOPY_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function saveCanopyOn(on, storage) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    store.setItem(CANOPY_KEY, on ? '1' : '0');
    return true;
  } catch (e) {
    return false;
  }
}

// Thin FPV lip only. No overhead box. Pieces sit on the live frustum so a
// 110° camera cannot fill the screen the way the old 0.13–0.15 m boxes did.
export const CANOPY_DIST = 0.12;
export const CANOPY_LIP_SCREEN = 0.04;
export const CANOPY_LIP_SCREEN_MAX = 0.06;

export function canopyViewHalfHeight(fovDeg, dist) {
  const d = Number(dist);
  const fov = Number(fovDeg);
  if (!(d > 0) || !Number.isFinite(fov)) return 0;
  return d * Math.tan((fov * Math.PI / 180) / 2);
}

export function canopyViewBottomY(fovDeg, dist) {
  return -canopyViewHalfHeight(fovDeg, dist);
}

export function canopyFpvVisible(state) {
  const s = state || {};
  return !!s.on && !s.menuOpen && !s.lookSpot && !s.replay && !s.builder && !s.chase;
}

export function craftChaseVisible(state) {
  const s = state || {};
  if (s.builder || s.lookSpot) return false;
  return !!s.chase || !!s.menuOpen || !!s.replay;
}

function canopyCam(opts) {
  const o = opts || {};
  const fov = Number(o.fov);
  const aspect = Number(o.aspect);
  const dist = Number(o.dist);
  return {
    fov: Number.isFinite(fov) && fov > 0 ? fov : 110,
    aspect: Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9,
    dist: Number.isFinite(dist) && dist > 0 ? dist : CANOPY_DIST,
  };
}

export function layoutCanopyPieces(opts) {
  const { fov, aspect, dist } = canopyCam(opts);
  const halfH = canopyViewHalfHeight(fov, dist);
  const halfW = halfH * aspect;
  const lipFrac = Math.min(
    CANOPY_LIP_SCREEN_MAX,
    opts && Number.isFinite(Number(opts.lipScreen)) && Number(opts.lipScreen) > 0
      ? Number(opts.lipScreen)
      : CANOPY_LIP_SCREEN,
  );
  const lipH = 2 * halfH * lipFrac;
  const lipW = 2 * halfW * 1.04;
  const lipD = Math.min(0.005, dist * 0.04);
  const lipY = canopyViewBottomY(fov, dist) + lipH / 2;
  const ductR = Math.min(0.005, lipH * 0.3);
  // Sit fully below the frustum so they cannot cover the FPV view.
  const ductY = canopyViewBottomY(fov, dist + lipD) - ductR * 3;
  const ductX = halfW * 0.72;
  return {
    fov,
    aspect,
    dist,
    lip: { x: 0, y: lipY, z: -dist, sx: lipW, sy: lipH, sz: lipD },
    ducts: [
      { x: -ductX, y: ductY, z: -dist, r: ductR, len: lipD },
      { x: ductX, y: ductY, z: -dist, r: ductR, len: lipD },
    ],
  };
}

function projectNdc(x, y, z, fovDeg, aspect) {
  const d = -z;
  const halfH = canopyViewHalfHeight(fovDeg, d);
  if (!(halfH > 0) || !(d > 0)) return null;
  return { x: x / (halfH * aspect), y: y / halfH };
}

export function boxNdcCoverage(box, fovDeg, aspect) {
  if (!box) return 0;
  const sx = Number(box.sx) || 0, sy = Number(box.sy) || 0, sz = Number(box.sz) || 0;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const dx of [-hx, hx]) {
    for (const dy of [-hy, hy]) {
      for (const dz of [-hz, hz]) {
        const p = projectNdc(box.x + dx, box.y + dy, box.z + dz, fovDeg, aspect);
        if (!p) continue;
        any = true;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (!any) return 0;
  const w = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX));
  const h = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
  return (w * h) / 4;
}

export function canopyPieceCoverage(opts) {
  const L = layoutCanopyPieces(opts);
  const fov = L.fov;
  const aspect = L.aspect;
  const lip = boxNdcCoverage(L.lip, fov, aspect);
  const ducts = L.ducts.map((d) => boxNdcCoverage({
    x: d.x, y: d.y, z: d.z, sx: d.r * 2, sy: d.r * 2, sz: d.len,
  }, fov, aspect));
  return { lip, ducts, max: Math.max(lip, ...ducts) };
}

export function layoutCanopyGroup(group, camera) {
  if (!group) return null;
  const L = layoutCanopyPieces({
    fov: camera && camera.fov,
    aspect: camera && camera.aspect,
    dist: camera && camera.userData && camera.userData.canopyDist,
  });
  const kids = group.children || [];
  for (const o of kids) {
    const role = o.userData && o.userData.canopyRole;
    if (role === 'lip' && L.lip) {
      o.position.set(L.lip.x, L.lip.y, L.lip.z);
      if (o.scale && o.scale.set) o.scale.set(L.lip.sx, L.lip.sy, L.lip.sz);
    } else if (role === 'duct') {
      const side = o.userData.canopySide < 0 ? 0 : 1;
      const d = L.ducts[side];
      o.position.set(d.x, d.y, d.z);
      if (o.scale && o.scale.set) o.scale.set(d.r, d.len, d.r);
    }
  }
  return L;
}

export function makeCanopyGroup(THREE, skin) {
  const pal = skinPalette(skin || SKINS[0]);
  const g = new THREE.Group();
  g.name = 'qmCanopy';
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: pal.canopy, emissive: pal.led, emissiveIntensity: 1.15, roughness: 0.42, metalness: 0.12,
    }),
  );
  lip.name = 'qmCanopyLip';
  lip.userData.skinPart = 'canopy';
  lip.userData.looksSkip = true;
  lip.userData.canopyRole = 'lip';
  g.add(lip);
  for (const side of [-1, 1]) {
    const duct = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 8),
      new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.5, metalness: 0.18 }),
    );
    duct.name = side < 0 ? 'qmCanopyDuctL' : 'qmCanopyDuctR';
    duct.rotation.z = Math.PI / 2;
    duct.userData.skinPart = 'body';
    duct.userData.looksSkip = true;
    duct.userData.canopyRole = 'duct';
    duct.userData.canopySide = side;
    g.add(duct);
  }
  layoutCanopyGroup(g, { fov: 110, aspect: 16 / 9 });
  g.visible = false;
  return g;
}

function skipLooks(o) {
  o.userData.looksSkip = true;
  o.castShadow = false;
  o.receiveShadow = false;
}

export function makeCraftGroup(THREE, skin) {
  const pal = skinPalette(skin || SKINS[0]);
  const g = new THREE.Group();
  g.name = 'qmCraft';
  const side = THREE.DoubleSide != null ? THREE.DoubleSide : 2;
  const frameMat = new THREE.MeshStandardMaterial({
    color: pal.frame, emissive: pal.frame, emissiveIntensity: 0.08, roughness: 0.5, metalness: 0.22, side,
  });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: pal.body, roughness: 0.52, metalness: 0.14,
  });
  const propMat = new THREE.MeshStandardMaterial({
    color: pal.prop, emissive: pal.prop, emissiveIntensity: 0.16, roughness: 0.46, metalness: 0.04,
  });
  const blurMat = new THREE.MeshStandardMaterial({
    color: pal.prop, emissive: pal.prop, emissiveIntensity: 0.1, roughness: 0.9, metalness: 0,
    transparent: true, opacity: 0.3, side, depthWrite: false,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: pal.canopy, emissive: pal.canopy, emissiveIntensity: 0.28, roughness: 0.36, metalness: 0.08,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: pal.led, emissive: pal.led, emissiveIntensity: 2.2, roughness: 0.28, metalness: 0.08, side,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x14161c, emissive: 0x1a2430, emissiveIntensity: 0.28, roughness: 0.22, metalness: 0.35,
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 8), bodyMat);
  hub.userData.skinPart = 'body';
  skipLooks(hub);
  g.add(hub);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), canopyMat);
  canopy.scale.set(0.72, 0.42, 1.45);
  canopy.position.set(0, 0.062, -0.07);
  canopy.userData.skinPart = 'canopy';
  skipLooks(canopy);
  g.add(canopy);
  const camHouse = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.05), bodyMat);
  camHouse.position.set(0, 0.048, -0.175);
  camHouse.userData.skinPart = 'body';
  skipLooks(camHouse);
  g.add(camHouse);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.03, 8), lensMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.048, -0.205);
  lens.userData.skinPart = 'body';
  skipLooks(lens);
  g.add(lens);
  const armGeo = new THREE.BoxGeometry(0.055, 0.034, 0.34);
  const ductGeo = new THREE.CylinderGeometry(0.275, 0.255, 0.085, 12, 1, true);
  const bladeGeo = new THREE.BoxGeometry(0.18, 0.008, 0.032);
  const capGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.016, 8);
  const ledGeo = new THREE.CylinderGeometry(0.262, 0.248, 0.014, 12, 1, true);
  const blurGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.006, 12);
  const spread = 0.3;
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const c of corners) {
    const x = c[0] * spread;
    const z = c[1] * spread;
    const arm = new THREE.Mesh(armGeo, frameMat);
    arm.position.set(x * 0.5, 0, z * 0.5);
    arm.rotation.y = Math.atan2(c[0], c[1]);
    arm.userData.skinPart = 'frame';
    skipLooks(arm);
    g.add(arm);
    const duct = new THREE.Mesh(ductGeo, frameMat);
    duct.position.set(x, 0.015, z);
    duct.userData.skinPart = 'frame';
    duct.userData.craftRole = 'duct';
    skipLooks(duct);
    g.add(duct);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(x, -0.036, z);
    led.userData.skinPart = 'led';
    skipLooks(led);
    g.add(led);
    const prop = new THREE.Group();
    prop.position.set(x, 0.02, z);
    prop.userData.spin = true;
    skipLooks(prop);
    const cap = new THREE.Mesh(capGeo, propMat);
    cap.userData.skinPart = 'prop';
    skipLooks(cap);
    prop.add(cap);
    for (let i = 0; i < 3; i++) {
      const ang = i * Math.PI * 2 / 3;
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.rotation.y = ang;
      blade.position.set(Math.cos(ang) * 0.09, 0, -Math.sin(ang) * 0.09);
      blade.userData.skinPart = 'prop';
      blade.userData.craftRole = 'blade';
      skipLooks(blade);
      prop.add(blade);
    }
    const blur = new THREE.Mesh(blurGeo, blurMat);
    blur.userData.skinPart = 'prop';
    blur.userData.propBlur = true;
    blur.visible = false;
    skipLooks(blur);
    prop.add(blur);
    g.add(prop);
  }
  g.visible = false;
  g.userData.keepInScene = true;
  g.userData.looksSkip = true;
  return g;
}

export const TRAIL_POINTS = 24;

export function makeSkinTrail(THREE, skin) {
  const pal = skinPalette(skin || SKINS[0]);
  const n = TRAIL_POINTS;
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (geo.setDrawRange) geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    color: pal.trail, transparent: true, opacity: 0.72, depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.name = 'qmSkinTrail';
  line.frustumCulled = false;
  line.visible = false;
  line.userData.skinPart = 'trail';
  line.userData.looksSkip = true;
  line.userData.keepInScene = true;
  return { line, pos, n, len: 0, geo };
}

export function pushSkinTrail(trail, x, y, z) {
  if (!trail || !trail.pos) return;
  const n = trail.n;
  if (trail.len < n) {
    const i = trail.len * 3;
    trail.pos[i] = x;
    trail.pos[i + 1] = y;
    trail.pos[i + 2] = z;
    trail.len += 1;
  } else {
    trail.pos.copyWithin(0, 3);
    const i = (n - 1) * 3;
    trail.pos[i] = x;
    trail.pos[i + 1] = y;
    trail.pos[i + 2] = z;
  }
  if (trail.geo && trail.geo.attributes && trail.geo.attributes.position) {
    trail.geo.attributes.position.needsUpdate = true;
  }
  if (trail.geo && trail.geo.setDrawRange) trail.geo.setDrawRange(0, trail.len);
}

export function clearSkinTrail(trail) {
  if (!trail) return;
  trail.len = 0;
  if (trail.geo && trail.geo.setDrawRange) trail.geo.setDrawRange(0, 0);
}

export function tintGroup(group, skin) {
  if (!group || !skin) return;
  const pal = skinPalette(skin);
  group.traverse((o) => {
    if (!o.material) return;
    const part = o.userData && o.userData.skinPart;
    const mat = o.material;
    if (part === 'canopy' && mat.color) {
      mat.color.setHex(pal.canopy);
      if (mat.emissive) mat.emissive.setHex(pal.canopy);
    }
    if (part === 'body' && mat.color) mat.color.setHex(pal.body);
    if ((part === 'frame' || part === 'duct') && mat.color) {
      mat.color.setHex(pal.frame);
      if (mat.emissive) mat.emissive.setHex(pal.frame);
    }
    if (part === 'prop' && mat.color) {
      mat.color.setHex(pal.prop);
      if (mat.emissive) mat.emissive.setHex(pal.prop);
    }
    if (part === 'led' && mat.color) {
      mat.color.setHex(pal.led);
      if (mat.emissive) mat.emissive.setHex(pal.led);
    }
    if (part === 'trail' && mat.color) mat.color.setHex(pal.trail);
  });
}

function catmullPt(P, i, t) {
  const n = P.length;
  const p0 = P[(i - 1 + n) % n], p1 = P[i % n], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

function pacePositions(gates, speed, hz, laps) {
  const P = (gates || []).map((g) => ({ x: g.x, y: g.y, z: g.z }));
  const n = P.length;
  if (n < 2 || !(speed > 0) || !(hz > 0)) return [];
  const pts = [];
  const totalSegs = (laps || RUN_LAPS) * n - 1;
  for (let s = 0; s < totalSegs; s++) {
    for (let k = 0; k < 40; k++) pts.push(catmullPt(P, s % n, k / 40));
  }
  pts.push({ x: P[totalSegs % n].x, y: P[totalSegs % n].y, z: P[totalSegs % n].z });
  const d = [];
  for (let i = 0; i < pts.length - 1; i++) {
    d.push(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z));
  }
  const cum = [0];
  for (const x of d) cum.push(cum[cum.length - 1] + x);
  const L = cum[cum.length - 1];
  const T = L / speed;
  const samples = [];
  let idx = 0;
  for (let t = 0; t <= T + 1e-9; t += 1 / hz) {
    const s = Math.min(t * speed, L);
    while (idx < d.length - 1 && cum[idx + 1] < s) idx++;
    const f = d[idx] > 0 ? (s - cum[idx]) / d[idx] : 0;
    const p = pts[idx];
    const q = pts[idx + 1] || p;
    samples.push([
      Math.round(t * 1000),
      Math.round((p.x + (q.x - p.x) * f) * 100) / 100,
      Math.round((p.y + (q.y - p.y) * f) * 100) / 100,
      Math.round((p.z + (q.z - p.z) * f) * 100) / 100,
    ]);
  }
  return samples;
}

function positionsMatch(a, b, tol) {
  const n = Math.min(a.length, b.length);
  if (n < 8) return false;
  if (Math.abs(a.length - b.length) > 3) return false;
  const step = Math.max(1, Math.floor(n / 16));
  let hits = 0, checks = 0;
  for (let i = 0; i < n; i += step) {
    checks++;
    const dx = a[i][1] - b[i][1], dy = a[i][2] - b[i][2], dz = a[i][3] - b[i][3];
    if (Math.hypot(dx, dy, dz) <= tol) hits++;
  }
  return checks > 0 && hits / checks >= 0.9;
}

export function isPaceBotGhost(ghost, track) {
  if (!ghost || !Array.isArray(ghost.samples) || ghost.samples.length < 8) return false;
  const name = String(ghost.name || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (name === 'PACE BOT' || name === 'PACE') return true;
  const gates = track && track.gates;
  if (!gates || gates.length < 2) return false;
  let dist = 0;
  const samples = ghost.samples;
  for (let i = 1; i < samples.length; i++) {
    dist += Math.hypot(
      samples[i][1] - samples[i - 1][1],
      samples[i][2] - samples[i - 1][2],
      samples[i][3] - samples[i - 1][3],
    );
  }
  const span = (samples[samples.length - 1][0] - samples[0][0]) / 1000;
  const speedGuess = span > 0 ? dist / span : 0;
  const dt = samples.length > 1 ? (samples[1][0] - samples[0][0]) : 0;
  const hzGuess = dt > 0 ? Math.round(1000 / dt) : 0;
  const speeds = [6, 8];
  if (speedGuess > 1) speeds.push(Math.round(speedGuess * 10) / 10, Math.round(speedGuess));
  const hzs = [8, 12, 16];
  if (hzGuess >= 4 && hzGuess <= 40) hzs.push(hzGuess);
  const seen = new Set();
  for (const speed of speeds) {
    for (const hz of hzs) {
      const key = speed + ':' + hz;
      if (seen.has(key) || !(speed > 0) || !(hz > 0)) continue;
      seen.add(key);
      const pace = pacePositions(gates, speed, hz, RUN_LAPS);
      if (positionsMatch(samples, pace, 0.025)) return true;
    }
  }
  return false;
}

function submittedTrackId(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw.id != null) return String(raw.id);
  return '';
}

export function normalizeSubmit(body, now) {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'BAD JSON' };
  const frameMm = classId(body.frameMm || body.class);
  const builtClass = classFromBuild(body.build);
  if (builtClass != null && builtClass !== frameMm) return { ok: false, reason: 'CLASS MISMATCH' };
  const name = sanitizePilotName(body.name);
  const timeMs = +body.timeMs;
  const week = typeof body.week === 'string' && /^\d{4}-W\d{2}$/.test(body.week)
    ? body.week : utcWeekId(now);
  if (!weekAllowed(week, now)) return { ok: false, reason: 'BAD WEEK' };
  const track = weeklyTrackFor(week);
  if (!dailyTrackValid(track)) return { ok: false, reason: 'BAD TRACK' };
  const givenId = submittedTrackId(body.track);
  if (givenId) {
    const aliases = [track.id, weeklyIdFor(week), 'weekly-' + week, 'weekly'];
    if (!aliases.includes(givenId)) return { ok: false, reason: 'TRACK MISMATCH' };
  }
  const ghost = body.ghost;
  if (ghostPayloadError(ghost, null)) return { ok: false, reason: ghostPayloadError(ghost, null) };
  const ghostPhys = ghost && ghost.phys;
  if (ghostPhys !== PHYS_VER) return { ok: false, reason: 'PHYS MISMATCH' };
  if (isPaceBotGhost(ghost, track)) return { ok: false, reason: 'PACE BOT' };
  const checked = validateSubmittedRun({ ghost, track, frameMm, timeMs });
  if (!checked.ok) return checked;
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  return {
    ok: true,
    week,
    frameMm,
    name,
    timeMs: timeMs | 0,
    trackId: track.id || checked.trackId,
    token,
  };
}

export function rateWindowId(now) {
  const d = now ? new Date(now) : new Date();
  return d.toISOString().slice(0, 13);
}
