// QuadMath sim W3 — Your room planner.
// Converts L×W×H (ft or m) into a walled practice cell + furniture + a
// whoop-scale auto track. No THREE.js. Nothing here is copied from WebFPV (GPL).
// New localStorage key only: quadmathSimRoom. Do not write old ryfly* keys
// or the M2 custom-track / best-lap keys.

import { normalizeTrack, WS_PER_METRE } from './sim-tracks.js?v=d8fe327013fa';

export const ROOM_KEY = 'quadmathSimRoom';
export const ROOM_TRACK_ID = 'room-practice';

export const DEFAULT_ROOM = Object.freeze({
  units: 'ft',
  length: 16,
  width: 12,
  height: 8,
});

const FT_LIMIT = { length: [8, 40], width: [8, 40], height: [7, 16] };
const M_LIMIT = { length: [2.4, 12], width: [2.4, 12], height: [2.1, 5] };

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

export function roomUnits(raw) {
  return raw === 'm' || raw === 'meters' || raw === 'metres' ? 'm' : 'ft';
}

export function toMetres(value, units) {
  const n = num(value, 0);
  return roomUnits(units) === 'm' ? n : n * 0.3048;
}

export function toWorld(metres) {
  return metres * WS_PER_METRE;
}

export function fromWorld(wu, units) {
  const m = wu / WS_PER_METRE;
  return roomUnits(units) === 'm' ? m : m / 0.3048;
}

export function normalizeRoomSpec(raw) {
  const src = raw && typeof raw === 'object' ? raw : DEFAULT_ROOM;
  const units = roomUnits(src.units);
  const lim = units === 'm' ? M_LIMIT : FT_LIMIT;
  return {
    units,
    length: clamp(src.length, lim.length[0], lim.length[1]),
    width: clamp(src.width, lim.width[0], lim.width[1]),
    height: clamp(src.height, lim.height[0], lim.height[1]),
  };
}

export function loadRoom(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return normalizeRoomSpec(DEFAULT_ROOM);
  try {
    const raw = store.getItem(ROOM_KEY);
    if (!raw) return normalizeRoomSpec(DEFAULT_ROOM);
    return normalizeRoomSpec(JSON.parse(raw));
  } catch (e) {
    return normalizeRoomSpec(DEFAULT_ROOM);
  }
}

export function saveRoom(spec, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  try {
    store.setItem(ROOM_KEY, JSON.stringify(normalizeRoomSpec(spec)));
    return true;
  } catch (e) {
    return false;
  }
}

export function roomSignature(spec) {
  const s = normalizeRoomSpec(spec);
  return [s.units, s.length, s.width, s.height].join('x');
}

export function formatRoomSize(spec) {
  const s = normalizeRoomSpec(spec);
  const u = s.units === 'm' ? 'm' : 'ft';
  return s.length + '×' + s.width + '×' + s.height + ' ' + u;
}

export function furnitureAabb(item) {
  const hx = (item.w || 0) / 2, hz = (item.d || 0) / 2;
  return {
    min: { x: item.x - hx, y: item.y || 0, z: item.z - hz },
    max: { x: item.x + hx, y: (item.y || 0) + (item.h || 0), z: item.z + hz },
  };
}

export function aabbClearance(pos, aabb) {
  const dx = Math.max(aabb.min.x - pos.x, 0, pos.x - aabb.max.x);
  const dy = Math.max(aabb.min.y - pos.y, 0, pos.y - aabb.max.y);
  const dz = Math.max(aabb.min.z - pos.z, 0, pos.z - aabb.max.z);
  return Math.hypot(dx, dy, dz);
}

export function roomWallDist(pos, plan) {
  const hx = plan.w / 2, hz = plan.d / 2;
  const dx = hx - Math.abs(pos.x);
  const dz = hz - Math.abs(pos.z);
  const dy = Math.min(pos.y, plan.h - pos.y);
  return Math.min(dx, dz, dy);
}

function addFurniture(list, kind, x, z, w, h, d) {
  list.push({ kind, x, y: 0, z, w, h, d, ry: 0 });
}

function placeFurniture(w, d, h) {
  const items = [];
  const hx = w / 2, hz = d / 2;
  const inset = 0.45;
  // Bed against the -Z wall. Sized to the room so a 8×8 ft cell still flies.
  const bedW = Math.min(6.6, w * 0.48);
  const bedD = Math.min(4.4, d * 0.26);
  const bedH = Math.min(1.35, h * 0.18);
  addFurniture(items, 'bed', 0, -hz + bedD / 2 + inset, bedW, bedH, bedD);
  if (w > 11) {
    addFurniture(items, 'nightstand', bedW / 2 + 0.85, -hz + 0.85 + inset, 1.15, 1.15, 1.15);
  }
  // Desk + chair along +X.
  const deskW = Math.min(3.2, w * 0.28);
  const deskD = Math.min(1.55, d * 0.16);
  const deskH = 1.15;
  const deskX = hx - deskD / 2 - inset;
  const deskZ = Math.min(2.2, hz * 0.22);
  addFurniture(items, 'desk', deskX, deskZ, deskD, deskH, deskW);
  addFurniture(items, 'chair', deskX - deskD / 2 - 0.85, deskZ, 1.05, 1.15, 1.05);
  // Dresser on -X when the room is not a closet.
  if (w >= 12 && d >= 12) {
    addFurniture(items, 'dresser', -hx + 0.7 + inset, hz * 0.15, 1.35, 2.4, Math.min(3.4, d * 0.22));
  }
  // Sofa on +Z when there is a living-room-sized cell.
  if (d >= 18 && w >= 13) {
    addFurniture(items, 'sofa', 0, hz - 1.5 - inset, Math.min(6.4, w * 0.42), 1.7, 2.4);
  }
  return items;
}

function headingTo(a, b) {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

function gateOk(g, plan, furniture) {
  if (Math.abs(g.x) > plan.w / 2 - 1.35) return false;
  if (Math.abs(g.z) > plan.d / 2 - 1.35) return false;
  if (g.y < 1.15 || g.y > plan.h - 1.25) return false;
  for (const item of furniture) {
    if (aabbClearance(g, furnitureAabb(item)) < 1.25) return false;
  }
  return true;
}

function ovalGates(plan, y) {
  const rx = Math.max(2.6, plan.w / 2 - 2.7);
  const rz = Math.max(2.8, plan.d / 2 - 2.7);
  const n = (plan.w >= 16 && plan.d >= 18) ? 6 : 4;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: Math.sin(a) * rx, y, z: Math.cos(a) * rz });
  }
  return pts;
}

function figure8Gates(plan, y) {
  const sep = Math.min(plan.w * 0.22, 5.2);
  const r = Math.min(plan.w * 0.18, plan.d * 0.16, 4.2);
  return [
    { x: 0, y, z: r + 1.6 },
    { x: -sep, y, z: r * 0.15 },
    { x: -sep, y, z: -r },
    { x: 0, y, z: -r - 1.2 },
    { x: sep, y, z: -r },
    { x: sep, y, z: r * 0.15 },
    { x: 0, y, z: r * 0.4 },
  ];
}

export function generateRoomTrack(plan) {
  const y = clamp(plan.h * 0.26, 1.55, 2.45);
  const size = clamp(Math.min(1.9, plan.w * 0.12, plan.d * 0.10), 1.45, 1.95);
  const use8 = plan.w >= 16 && plan.d >= 18;
  let pts = use8 ? figure8Gates(plan, y) : ovalGates(plan, y);
  pts = pts.filter((p) => gateOk(p, plan, plan.furniture || []));
  if (pts.length < 4) {
    pts = ovalGates(plan, y).filter((p) => gateOk(p, plan, plan.furniture || []));
  }
  if (pts.length < 2) {
    const rx = Math.max(2.2, plan.w / 2 - 3.1);
    const rz = Math.max(2.4, plan.d / 2 - 3.1);
    pts = [
      { x: 0, y, z: rz },
      { x: -rx, y, z: 0 },
      { x: 0, y, z: -rz },
      { x: rx, y, z: 0 },
    ];
  }
  const gates = pts.map((p, i) => {
    const n = pts[(i + 1) % pts.length];
    return {
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      z: +p.z.toFixed(2),
      ry: +headingTo(p, n).toFixed(3),
      size: +size.toFixed(2),
      solid: true,
    };
  });
  return normalizeTrack({
    id: ROOM_TRACK_ID,
    map: 'room',
    name: 'Practice ' + formatRoomSize(plan.spec || DEFAULT_ROOM),
    class: 'whoop',
    gates,
    flags: [{ x: 0, y: +(y + 0.4).toFixed(2), z: 0, ry: 0 }],
    start: {
      x: Math.max(-plan.w / 2 + 1.3, Math.min(plan.w / 2 - 1.3, gates[0].x)),
      y: Math.max(0.95, gates[0].y * 0.45),
      z: Math.max(-plan.d / 2 + 1.3, Math.min(plan.d / 2 - 1.3, gates[0].z + Math.max(2.0, size * 2.2))),
    },
  });
}

export function planRoom(raw) {
  const spec = normalizeRoomSpec(raw);
  const w = toWorld(toMetres(spec.width, spec.units));
  const d = toWorld(toMetres(spec.length, spec.units));
  const h = toWorld(toMetres(spec.height, spec.units));
  const furniture = placeFurniture(w, d, h);
  const plan = {
    spec,
    w: +w.toFixed(3),
    d: +d.toFixed(3),
    h: +h.toFixed(3),
    wall: 0.28,
    furniture,
    orbit: {
      cx: 0,
      cy: Math.min(2.2, h * 0.28),
      cz: 0,
      r: Math.min(w, d) * 0.20,
      h: Math.min(h * 0.62, h - 1.4),
      fov: 64,
    },
  };
  plan.track = generateRoomTrack(plan);
  return plan;
}

export function parseRoomQuery(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|m)?$/);
  if (!m) return null;
  return normalizeRoomSpec({
    length: +m[1],
    width: +m[2],
    height: +m[3],
    units: m[4] || 'ft',
  });
}
