// QuadMath sim — hidden sparks + secret spots for freestyle.
// Original look per docs/sim-art-direction.md. No third-party sim code.
// New localStorage key only: quadmathSimSecrets.
// Stock skin ids / unlocks in sim-retention.js stay frozen.

import { SKINS, isSkinUnlocked, mapObstacles, skinById as stockSkinById } from './sim-retention.js?v=3ad022ce389c';
import { LAYOUT } from './sim-maps.js?v=beaa1b943d6e';
import { MAPS, knownMapId, isFreestyleTrackId } from './sim-tracks.js?v=7ca83407298d';

export const SECRETS_KEY = 'quadmathSimSecrets';
export const SPARK_NAME = 'Spark';
export const HINT_M = 3;
export const WS_PER_METRE = 3.5;
export const HINT_U = HINT_M * WS_PER_METRE;
export const COLLECT_U = 0.82;
export const WHOOP_R = 0.24;
export const SECRET_MAP_IDS = Object.freeze([
  'city', 'living', 'garage', 'warehouse', 'backyard', 'office', 'gym', 'trainer',
]);

const STOCK_IDS = Object.freeze(SKINS.map((s) => s.id));

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function hexNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v >>> 0;
  const s = String(v || '').replace('#', '');
  return parseInt(s, 16) >>> 0;
}

function aabb(x, y, z, w, h, d) {
  return [x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2];
}

function sphereHitsAabb(px, py, pz, r, b) {
  const qx = clamp(px, b[0], b[3]);
  const qy = clamp(py, b[1], b[4]);
  const qz = clamp(pz, b[2], b[5]);
  return Math.hypot(px - qx, py - qy, pz - qz) < r;
}

function hitsBoxes(px, py, pz, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    if (sphereHitsAabb(px, py, pz, r, boxes[i])) return true;
  }
  return false;
}

function storageOf(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch (e) { return null; }
}

export function emptySecrets() {
  const maps = {};
  for (let i = 0; i < SECRET_MAP_IDS.length; i++) {
    maps[SECRET_MAP_IDS[i]] = { sparks: [], secrets: [] };
  }
  return { v: 1, maps };
}

export function normalizeSecrets(raw) {
  const out = emptySecrets();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw.maps && typeof raw.maps === 'object' ? raw.maps : raw;
  for (let i = 0; i < SECRET_MAP_IDS.length; i++) {
    const id = SECRET_MAP_IDS[i];
    const row = src[id];
    if (!row || typeof row !== 'object') continue;
    const sparks = Array.isArray(row.sparks) ? row.sparks : [];
    const secrets = Array.isArray(row.secrets) ? row.secrets : [];
    out.maps[id] = {
      sparks: sparks.filter((s) => typeof s === 'string' && s.length > 0 && s.length < 48),
      secrets: secrets.filter((s) => typeof s === 'string' && s.length > 0 && s.length < 48),
    };
  }
  return out;
}

export function loadSecrets(storage) {
  const store = storageOf(storage);
  if (!store) return emptySecrets();
  try {
    return normalizeSecrets(JSON.parse(store.getItem(SECRETS_KEY) || 'null'));
  } catch (e) {
    return emptySecrets();
  }
}

export function saveSecrets(progress, storage) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    store.setItem(SECRETS_KEY, JSON.stringify(normalizeSecrets(progress)));
    return true;
  } catch (e) {
    return false;
  }
}

function hasId(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i] === id) return true;
  return false;
}

export function markSpark(progress, mapId, sparkId) {
  const p = normalizeSecrets(progress);
  const row = p.maps[mapId];
  if (!row || hasId(row.sparks, sparkId)) return p;
  row.sparks = row.sparks.concat([sparkId]);
  return p;
}

export function markSecret(progress, mapId, secretId) {
  const p = normalizeSecrets(progress);
  const row = p.maps[mapId];
  if (!row || hasId(row.secrets, secretId)) return p;
  row.secrets = row.secrets.concat([secretId]);
  return p;
}

export function mapBounds(mapId) {
  if (mapId === 'city') return { w: 1400, d: 1400, h: 220, wall: 0 };
  if (mapId === 'backyard') return { w: LAYOUT.backyard.w, d: LAYOUT.backyard.d, h: 22, wall: LAYOUT.backyard.wall };
  const L = LAYOUT[mapId];
  if (!L) return { w: 24, d: 24, h: 10, wall: 0.4 };
  return { w: L.w, d: L.d, h: L.h, wall: L.wall };
}

function extraBoxes(mapId) {
  if (mapId === 'garage') {
    const out = [];
    for (let i = -3; i <= 3; i++) out.push(aabb(0, 8.55, i * 5.4, 19.5, 0.28, 0.42));
    out.push(aabb(-6.6, 8.4, 0, 0.38, 0.55, 40));
    out.push(aabb(6.6, 8.4, 0, 0.38, 0.55, 40));
    out.push(aabb(2.0, 0, -10.2, 1.44, 0.55, 1.44));
    out.push(aabb(6.4, 0, -10.2, 1.44, 0.55, 1.44));
    out.push(aabb(2.0, 0, -0.8, 1.44, 0.55, 1.44));
    out.push(aabb(6.4, 0, -0.8, 1.44, 0.55, 1.44));
    return out;
  }
  if (mapId === 'backyard') {
    return [
      aabb(14.5, 0, -18, 7.2, 6.8, 8.0),
      aabb(14.5, 6.8, -18, 7.6, 1.1, 8.4),
      aabb(-4.2, 0, -10.5, 1.6, 2.4, 1.2),
      aabb(3.2, 0, -9.5, 3.6, 1.15, 1.8),
      aabb(-14.5, 0, 8, 3.2, 1.4, 3.2),
      aabb(14.5, 0, 8, 3.2, 1.4, 3.2),
      aabb(0, 0, -28, 42, 6.2, 0.24),
      aabb(-21, 0, 0, 0.24, 6.2, 56),
      aabb(21, 0, 0, 0.24, 6.2, 56),
      aabb(-14.25, 0, 28, 13.5, 6.2, 0.24),
      aabb(14.25, 0, 28, 13.5, 6.2, 0.24),
    ];
  }
  return [];
}

function cityBoxes() {
  return [
    aabb(0, 0, 300, 14, 1.9, 10),
    aabb(0, 4.1, 300, 14, 1.8, 10),
    aabb(0, 8.1, 300, 14, 1.8, 10),
    aabb(0, 12.1, 300, 14, 0.7, 10),
    aabb(-6.7, 0, 300, 0.5, 12.8, 0.5),
    aabb(6.7, 0, 300, 0.5, 12.8, 0.5),
    aabb(-6.7, 0, 295.3, 0.5, 12.8, 0.5),
    aabb(6.7, 0, 295.3, 0.5, 12.8, 0.5),
    aabb(-6.7, 0, 304.7, 0.5, 12.8, 0.5),
    aabb(6.7, 0, 304.7, 0.5, 12.8, 0.5),
    aabb(-330, 0, 0, 2.1, 63, 2.1),
    aabb(-330, 41.3, 10.5, 1.4, 1.4, 21),
    aabb(-319.5, 41.3, 0, 21, 1.4, 1.4),
    aabb(-330, 41.3, -10.5, 1.4, 1.4, 21),
    aabb(-340.5, 41.3, 0, 21, 1.4, 1.4),
    aabb(-70, 0, 70, 3.2, 55, 3.2),
    aabb(-4.4, 0, -40, 1.2, 14, 1.2),
    aabb(4.4, 0, -40, 1.2, 14, 1.2),
    aabb(0, 13.4, -40, 10, 1.2, 1.2),
    aabb(160, 15, 12, 70, 20, 2.2),
    aabb(137.5, 0, 12, 13, 15, 2.2),
    aabb(160, 0, 12, 13, 15, 2.2),
    aabb(182.5, 0, 12, 13, 15, 2.2),
  ];
}

export function colliderBoxes(mapId) {
  if (mapId === 'city') return cityBoxes();
  if (mapId === 'backyard') return extraBoxes('backyard');
  const b = mapBounds(mapId);
  const map = { id: mapId, w: b.w, d: b.d, h: b.h, wall: b.wall };
  return mapObstacles(map).concat(extraBoxes(mapId));
}

export function inPlayable(mapId, p, margin) {
  const b = mapBounds(mapId);
  const m = margin == null ? 0.35 : margin;
  if (mapId === 'city') {
    if (p.y < 0.12 || p.y > b.h - 2) return false;
    return Math.abs(p.x) < 700 && Math.abs(p.z) < 700;
  }
  const wall = b.wall || 0;
  if (Math.abs(p.x) > b.w / 2 - wall - m) return false;
  if (Math.abs(p.z) > b.d / 2 - wall - m) return false;
  if (p.y < 0.16 || p.y > b.h - 0.45) return false;
  return true;
}

export function pointClearReason(mapId, p, radius) {
  const r = radius == null ? WHOOP_R : radius;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return 'POS';
  if (!inPlayable(mapId, p, r + 0.08)) return 'BOUNDS';
  if (hitsBoxes(p.x, p.y, p.z, r, colliderBoxes(mapId))) return 'HIT';
  return '';
}

export function pointClear(mapId, p, radius) {
  return pointClearReason(mapId, p, radius) === '';
}

function P(id, x, y, z, hint) {
  return { id, x, y, z, hint: hint || id };
}

function S(id, name, x, y, z, r, hint) {
  return { id, name, x, y, z, r: r || 1.6, hint: hint || name };
}

// Hand-placed skill spots. Positions are world units (WS = 3.5 / metre).
const PLACEMENTS = Object.freeze({
  city: Object.freeze({
    sparks: Object.freeze([
      P('c01', 0, 3.0, 300, 'triple low slot'),
      P('c02', 0, 11.0, 300, 'triple high slot'),
      P('c03', 0, 6.5, -40, 'south arch'),
      P('c04', 0, 2.0, -120, 'south street'),
      P('c05', 0, 2.4, 90, 'north street'),
      P('c06', 110, 2.2, 0, 'east street'),
      P('c07', -110, 2.2, 0, 'west street'),
      P('c08', 90, 3.2, 120, 'tunnel bore'),
      P('c09', 148.75, 7.0, 12, 'wall-ride gap'),
      P('c10', -70, 56.4, 70, 'tower crown'),
      P('c11', -330, 44.2, 23.2, 'mill perch'),
      P('c12', 150, 48, -150, 'shaft mid'),
      P('c13', 60, 7.5, 60, 'empty block'),
    ]),
    secrets: Object.freeze([
      S('well', 'Current Well', 150, 168, -150, 2.4, 'dive crown'),
      S('roof', 'Stack Roof', 0, 13.55, 300, 1.5, 'triple cap'),
    ]),
  }),
  living: Object.freeze({
    sparks: Object.freeze([
      P('l01', 0, 0.85, -13.05, 'sofa crawl'),
      P('l02', 0, 3.75, -10.4, 'sofa back'),
      P('l03', 0, 1.52, -5.9, 'table top'),
      P('l04', 7.15, 0.75, 0.2, 'tv gap'),
      P('l05', -7.1, 2.45, -3.8, 'chair top'),
      P('l06', -6.2, 5.2, 8.2, 'lamp shade'),
      P('l07', 8.4, 5.95, -10.6, 'shelf top'),
      P('l08', 7.15, 1.8, -10.6, 'shelf side'),
      P('l09', -9.4, 2.1, 4.0, 'window nook'),
      P('l10', 0, 6.7, 13.15, 'door lintel'),
      P('l11', 8.6, 1.1, 11.6, 'front corner'),
      P('l12', -8.8, 8.15, 11.4, 'ceiling nook'),
    ]),
    secrets: Object.freeze([
      S('nook', 'Felt Nook', 9.62, 1.7, -12.55, 1.15, 'behind shelf'),
    ]),
  }),
  garage: Object.freeze({
    sparks: Object.freeze([
      P('g01', -8.4, 3.05, -8.0, 'bench top'),
      P('g02', -6.7, 0.7, -14.2, 'bench end'),
      P('g03', -8.3, 3.45, 8.2, 'chest top'),
      P('g04', 4.2, 0.18, -5.6, 'under car'),
      P('g05', 4.2, 3.88, -4.2, 'cabin top'),
      P('g06', -0.4, 1.15, -8.2, 'bay gap'),
      P('g07', 0, 8.15, 0, 'rafter line'),
      P('g08', 0, 8.15, -16.2, 'rafter south'),
      P('g09', 8.6, 6.15, 8.0, 'shelf top'),
      P('g10', 0, 8.65, 20.15, 'door header'),
      P('g11', 8.4, 1.4, -18.8, 'far corner'),
      P('g12', -8.6, 1.1, 16.4, 'door side'),
    ]),
    secrets: Object.freeze([
      S('crawl', 'Oil Crawl', 4.2, 0.18, -1.4, 1.15, 'car tail'),
      S('nest', 'Rafter Nest', 0, 9.55, -18.2, 1.35, 'above joists'),
    ]),
  }),
  warehouse: Object.freeze({
    sparks: Object.freeze([
      P('w01', 0, 1.4, 0, 'nave floor'),
      P('w02', 14, 1.3, -24, 'east aisle'),
      P('w03', -14, 1.3, 24, 'west aisle'),
      P('w04', -22.5, 13.05, -24, 'rack crown'),
      P('w05', 7.5, 13.05, 0, 'mid rack'),
      P('w06', 0, 2.0, -12, 'row gap'),
      P('w07', 5.0, 6.2, 24, 'rack face'),
      P('w08', -22, 4.55, 36, 'pallet stack'),
      P('w09', 22, 2.75, 36, 'dock crate'),
      P('w10', 0, 1.55, 40.5, 'dock step'),
      P('w11', 0, 16.2, 0, 'high nave'),
      P('w12', 24, 17.8, -36, 'high corner'),
      P('w13', 0, 8.2, 40.8, 'dock door'),
    ]),
    secrets: Object.freeze([
      S('loft', 'Spore Loft', 22.5, 13.2, 24, 1.6, 'far rack top'),
      S('crypt', 'Dock Crypt', -24.4, 1.15, 39.4, 1.25, 'pallet shadow'),
    ]),
  }),
  backyard: Object.freeze({
    sparks: Object.freeze([
      P('b01', 3.2, 1.45, -9.5, 'patio table'),
      P('b02', -4.2, 2.7, -10.5, 'grill lid'),
      P('b03', 14.5, 8.25, -18, 'shed roof'),
      P('b04', 14.5, 1.3, -23.6, 'shed lee'),
      P('b05', 9.9, 1.15, -18, 'shed side'),
      P('b06', -14.5, 1.7, 8, 'west planter'),
      P('b07', 14.5, 1.7, 8, 'east planter'),
      P('b08', -19.4, 5.7, -26.4, 'fence post'),
      P('b09', 0, 2.0, 27.4, 'gate fly'),
      P('b10', 0, 3.4, 4, 'yard hover'),
      P('b11', -7.2, 0.7, -10.2, 'patio edge'),
      P('b12', 14.5, 12.2, -18, 'shed sky'),
    ]),
    secrets: Object.freeze([
      S('peak', 'Idol Peak', 14.5, 8.35, -15.2, 1.4, 'shed ridge'),
      S('moss', 'Moss Hollow', 19.4, 0.85, -26.2, 1.2, 'fence pocket'),
    ]),
  }),
  office: Object.freeze({
    sparks: Object.freeze([
      P('o01', -8.35, 1.5, 0, 'cube aisle'),
      P('o02', -8.35, 1.5, -12, 'south aisle'),
      P('o03', -8.35, 5.4, 12, 'high aisle'),
      P('o04', -13.25, 3.85, -12, 'cube lid'),
      P('o05', -3.75, 3.85, 0, 'mid lid'),
      P('o06', 4.6, 1.52, -16.2, 'conf table'),
      P('o07', 13.4, 1.7, 2.0, 'hall fly'),
      P('o08', 10.15, 1.8, -17.6, 'hall door'),
      P('o09', 14.2, 1.55, 18.4, 'reception'),
      P('o10', 10.15, 4.15, -1.0, 'divider top'),
      P('o11', 15.2, 7.9, -20.4, 'ceiling bay'),
      P('o12', 4.6, 2.4, 8.2, 'open bay'),
    ]),
    secrets: Object.freeze([
      S('blinds', 'Blinds Bay', 10.15, 4.2, 15.8, 1.25, 'north door top'),
      S('paper', 'Paper Loft', -16.4, 3.9, 12, 1.2, 'far cube lid'),
    ]),
  }),
  gym: Object.freeze({
    sparks: Object.freeze([
      P('y01', 0, 10.5, 24.0, 'south rim'),
      P('y02', 0, 10.5, -24.0, 'north rim'),
      P('y03', 0, 1.2, 0, 'center court'),
      P('y04', -17.4, 1.35, 8, 'low bench'),
      P('y05', -21.45, 4.55, 0, 'west top'),
      P('y06', 21.45, 4.55, 12, 'east top'),
      P('y07', -23.15, 1.4, 22, 'bleacher lee'),
      P('y08', 3.1, 2.0, 25.15, 'post circle'),
      P('y09', 0, 22.5, 0, 'truss hover'),
      P('y10', 20.4, 1.8, 32.4, 'corner'),
      P('y11', 0, 1.05, 20, 'paint key'),
      P('y12', 0, 12.15, 25.55, 'backboard'),
      P('y13', 0, 6.2, 35.8, 'door'),
    ]),
    secrets: Object.freeze([
      S('honey', 'Honey Loft', -21.45, 4.55, -24.5, 1.4, 'far bleacher'),
      S('rim', 'Rim Well', 0, 10.5, 26.35, 1.2, 'behind glass'),
    ]),
  }),
  trainer: Object.freeze({
    sparks: Object.freeze([
      P('t01', 0, 1.5, 0, 'grid center'),
      P('t02', 6, 0.65, 10, 'tape cross'),
      P('t03', -6, 0.65, -10, 'tape south'),
      P('t04', -12.2, 1.52, -0.6, 'bench top'),
      P('t05', -10.55, 2.05, -2.4, 'frame side'),
      P('t06', -10.55, 2.05, 1.2, 'frame two'),
      P('t07', 12.2, 2.55, -12.4, 'crate top'),
      P('t08', 10.6, 0.85, -12.4, 'crate side'),
      P('t09', 0, 3.1, 16.8, 'door'),
      P('t10', 0, 9.15, 0, 'ceiling'),
      P('t11', 11.2, 1.15, 15.2, 'front corner'),
      P('t12', -11.0, 4.4, -15.2, 'high corner'),
    ]),
    secrets: Object.freeze([
      S('attic', 'Tape Attic', -12.0, 9.2, 0, 1.25, 'above bench'),
      S('cubby', 'Sticky Cubby', 12.9, 0.9, -15.35, 1.15, 'crate shadow'),
    ]),
  }),
});

export function placementsFor(mapId) {
  const row = PLACEMENTS[mapId];
  if (!row) return { sparks: [], secrets: [] };
  return {
    sparks: row.sparks.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, hint: p.hint })),
    secrets: row.secrets.map((s) => ({
      id: s.id, name: s.name, x: s.x, y: s.y, z: s.z, r: s.r, hint: s.hint,
    })),
  };
}

export function sparkCount(mapId) {
  const row = PLACEMENTS[mapId];
  return row ? row.sparks.length : 0;
}

export function secretCount(mapId) {
  const row = PLACEMENTS[mapId];
  return row ? row.secrets.length : 0;
}

export function catalogTotals() {
  let sparks = 0, secrets = 0;
  for (let i = 0; i < SECRET_MAP_IDS.length; i++) {
    sparks += sparkCount(SECRET_MAP_IDS[i]);
    secrets += secretCount(SECRET_MAP_IDS[i]);
  }
  return { sparks, secrets, maps: SECRET_MAP_IDS.length };
}

export function mapProgress(mapId, progress) {
  const p = normalizeSecrets(progress);
  const row = p.maps[mapId] || { sparks: [], secrets: [] };
  const total = sparkCount(mapId);
  const got = row.sparks.length;
  const secretsGot = row.secrets.length;
  return {
    map: mapId,
    got,
    total,
    secretsGot,
    secretsTotal: secretCount(mapId),
    complete: total > 0 && got >= total,
    foundSecret: secretsGot > 0,
  };
}

export function sparksLabel(mapId, progress) {
  const m = mapProgress(mapId, progress);
  if (!m.total) return '—';
  return 'Sparks ' + m.got + '/' + m.total;
}

export function totalProgress(progress) {
  const p = normalizeSecrets(progress);
  let got = 0, total = 0, secretsGot = 0, secretsTotal = 0, mapsDone = 0;
  for (let i = 0; i < SECRET_MAP_IDS.length; i++) {
    const id = SECRET_MAP_IDS[i];
    const m = mapProgress(id, p);
    got += m.got;
    total += m.total;
    secretsGot += m.secretsGot;
    secretsTotal += m.secretsTotal;
    if (m.complete) mapsDone++;
  }
  return { got, total, secretsGot, secretsTotal, mapsDone };
}

export function menuSparksText(progress) {
  const t = totalProgress(progress);
  return 'Sparks ' + t.got + '/' + t.total;
}

export const SECRET_SKINS = Object.freeze([
  {
    id: 'spark-city', name: 'Horizon Ember', vibe: 'Neon Current',
    canopy: 0xff7a18, body: 0x070014, frame: 0xff2bd6, prop: 0x00f0ff,
    led: 0xff7a18, trail: 0xff2bd6,
    unlock: { type: 'sparks', map: 'city' },
  },
  {
    id: 'secret-city', name: 'Current Well', vibe: 'Neon Current',
    canopy: 0x5ce1ff, body: 0x120816, frame: 0x1a0533, prop: 0xff3cac,
    led: 0x00f0ff, trail: 0x5ce1ff,
    unlock: { type: 'secret', map: 'city' },
  },
  {
    id: 'spark-living', name: 'Gummy Lamp', vibe: 'Clay Parlor',
    canopy: 0xffe08a, body: 0x6b3f2a, frame: 0xf4d6c6, prop: 0xff6b9a,
    led: 0xffe08a, trail: 0x7ec8e3,
    unlock: { type: 'sparks', map: 'living' },
  },
  {
    id: 'secret-living', name: 'Walnut Nook', vibe: 'Clay Parlor',
    canopy: 0x6b3f2a, body: 0x3a2418, frame: 0xc48a6a, prop: 0xf4d6c6,
    led: 0xff6b9a, trail: 0xffe08a,
    unlock: { type: 'secret', map: 'living' },
  },
  {
    id: 'spark-garage', name: 'Sodium Tube', vibe: 'Volt Stall',
    canopy: 0x2de2e6, body: 0x14161c, frame: 0xffb347, prop: 0xc45a22,
    led: 0x2de2e6, trail: 0xffb347,
    unlock: { type: 'sparks', map: 'garage' },
  },
  {
    id: 'secret-garage', name: 'Oil Crawl', vibe: 'Volt Stall',
    canopy: 0xc45a22, body: 0x0c0d10, frame: 0x3d4654, prop: 0xffb347,
    led: 0xffb347, trail: 0xc45a22,
    unlock: { type: 'secret', map: 'garage' },
  },
  {
    id: 'spark-warehouse', name: 'Spore Can', vibe: 'Ion Nave',
    canopy: 0x39ffb0, body: 0x0b1218, frame: 0x7a5cff, prop: 0xc45a22,
    led: 0x39ffb0, trail: 0x39ffb0,
    unlock: { type: 'sparks', map: 'warehouse' },
  },
  {
    id: 'secret-warehouse', name: 'Aisle Violet', vibe: 'Ion Nave',
    canopy: 0x7a5cff, body: 0x102028, frame: 0x1b3a4a, prop: 0x39ffb0,
    led: 0x7a5cff, trail: 0x7a5cff,
    unlock: { type: 'secret', map: 'warehouse' },
  },
  {
    id: 'spark-backyard', name: 'Idol Leaf', vibe: 'Jade Lot',
    canopy: 0xc9a45b, body: 0x1b2a18, frame: 0x5d7a3a, prop: 0xffe0b0,
    led: 0xc9a45b, trail: 0xc9a45b,
    unlock: { type: 'sparks', map: 'backyard' },
  },
  {
    id: 'secret-backyard', name: 'Moss Hollow', vibe: 'Jade Lot',
    canopy: 0x5d7a3a, body: 0x12180e, frame: 0x8a4a2a, prop: 0xc9a45b,
    led: 0xffe0b0, trail: 0x5d7a3a,
    unlock: { type: 'secret', map: 'backyard' },
  },
  {
    id: 'spark-office', name: 'Paper Plant', vibe: 'Paper Sun',
    canopy: 0x2ae59b, body: 0xfff4d2, frame: 0x3d7dff, prop: 0xff5c5c,
    led: 0x2ae59b, trail: 0x3d7dff,
    unlock: { type: 'sparks', map: 'office' },
  },
  {
    id: 'secret-office', name: 'Blinds Bay', vibe: 'Paper Sun',
    canopy: 0x3d7dff, body: 0x1a1a1a, frame: 0xff5c5c, prop: 0xfff4d2,
    led: 0x3d7dff, trail: 0xff5c5c,
    unlock: { type: 'secret', map: 'office' },
  },
  {
    id: 'spark-gym', name: 'Brass Rim', vibe: 'Amber Court',
    canopy: 0xc45a22, body: 0x6a4224, frame: 0xf0b14b, prop: 0xfff6d8,
    led: 0xc45a22, trail: 0xf0b14b,
    unlock: { type: 'sparks', map: 'gym' },
  },
  {
    id: 'secret-gym', name: 'Honey Loft', vibe: 'Amber Court',
    canopy: 0xfff6d8, body: 0x4a2e18, frame: 0x8a8e94, prop: 0xf0b14b,
    led: 0xf0b14b, trail: 0xfff6d8,
    unlock: { type: 'secret', map: 'gym' },
  },
  {
    id: 'spark-trainer', name: 'Candy Cone', vibe: 'Licorice Grid',
    canopy: 0xffe08a, body: 0x1a1020, frame: 0xff4d8d, prop: 0x00e5ff,
    led: 0xffe08a, trail: 0xff4d8d,
    unlock: { type: 'sparks', map: 'trainer' },
  },
  {
    id: 'secret-trainer', name: 'Sticky Cubby', vibe: 'Licorice Grid',
    canopy: 0x00e5ff, body: 0x2a1830, frame: 0xf2f0ea, prop: 0xff4d8d,
    led: 0x00e5ff, trail: 0x00e5ff,
    unlock: { type: 'secret', map: 'trainer' },
  },
]);

export function allSkins() {
  return SKINS.concat(SECRET_SKINS);
}

export function catalogSkinById(id) {
  const hit = SECRET_SKINS.find((s) => s.id === id);
  if (hit) return hit;
  return stockSkinById(id);
}

function secretUnlockMet(rule, secrets) {
  if (!rule || !rule.map) return false;
  const m = mapProgress(rule.map, secrets);
  if (rule.type === 'sparks') return m.complete;
  if (rule.type === 'secret') return m.foundSecret;
  return false;
}

export function catalogSkinUnlocked(skin, progress, secrets) {
  const rule = skin && skin.unlock;
  if (rule && (rule.type === 'sparks' || rule.type === 'secret')) {
    return secretUnlockMet(rule, secrets);
  }
  return isSkinUnlocked(skin, progress);
}

export function catalogSkinLabel(skin) {
  const rule = skin && skin.unlock;
  if (rule && rule.type === 'sparks') {
    const meta = MAPS.find((m) => m.id === rule.map);
    return 'All sparks · ' + ((meta && meta.name) || rule.map);
  }
  if (rule && rule.type === 'secret') {
    const meta = MAPS.find((m) => m.id === rule.map);
    return 'Secret · ' + ((meta && meta.name) || rule.map);
  }
  return '';
}

export function unlockedCatalogSkins(progress, secrets) {
  return allSkins().filter((s) => catalogSkinUnlocked(s, progress, secrets));
}

export function loadCatalogSkinId(storage) {
  const store = storageOf(storage);
  if (!store) return 'stock';
  try {
    const id = store.getItem('quadmathSimSkin');
    if (SECRET_SKINS.some((s) => s.id === id)) return id;
    return SKINS.some((s) => s.id === id) ? id : 'stock';
  } catch (e) {
    return 'stock';
  }
}

export function saveCatalogSkinId(id, storage) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    store.setItem('quadmathSimSkin', catalogSkinById(id).id);
    return true;
  } catch (e) {
    return false;
  }
}

export function resolveCatalogSkin(id, progress, secrets) {
  const skin = catalogSkinById(id);
  if (catalogSkinUnlocked(skin, progress, secrets)) return skin;
  return SKINS[0];
}

export function rewardsForMap(mapId) {
  return SECRET_SKINS.filter((s) => s.unlock && s.unlock.map === mapId);
}

export function isSecretsMap(mapId) {
  return SECRET_MAP_IDS.indexOf(mapId) !== -1;
}

export function freestyleSecretsActive(trackId, mapId) {
  if (trackId === 'freestyle') return isSecretsMap(knownMapId(mapId) || 'city');
  if (isFreestyleTrackId(trackId)) {
    return isSecretsMap(String(trackId).slice(0, -'-freestyle'.length));
  }
  return false;
}

const VIBE_HEX = Object.freeze({
  city: { a: 0xff2bd6, b: 0x00f0ff },
  living: { a: 0xff6b9a, b: 0xffe08a },
  garage: { a: 0xffb347, b: 0x2de2e6 },
  warehouse: { a: 0x39ffb0, b: 0x7a5cff },
  backyard: { a: 0xc9a45b, b: 0x5d7a3a },
  office: { a: 0xff5c5c, b: 0x3d7dff },
  gym: { a: 0xf0b14b, b: 0xfff6d8 },
  trainer: { a: 0xff4d8d, b: 0x00e5ff },
});

function vibePair(mapId) {
  return VIBE_HEX[mapId] || VIBE_HEX.city;
}

function playChime(muted) {
  if (muted) return;
  try {
    const AC = typeof AudioContext !== 'undefined' ? AudioContext
      : (typeof window !== 'undefined' && window.webkitAudioContext);
    if (!AC) return;
    const ctx = playChime._ctx || (playChime._ctx = new AC());
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.type = 'sine';
    o2.type = 'triangle';
    o1.frequency.setValueAtTime(784, t0);
    o2.frequency.setValueAtTime(1175, t0);
    o1.frequency.exponentialRampToValueAtTime(988, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o1.connect(g);
    o2.connect(g);
    g.connect(ctx.destination);
    o1.start(t0);
    o2.start(t0);
    o1.stop(t0 + 0.24);
    o2.stop(t0 + 0.24);
  } catch (e) { /* mute / autoplay */ }
}

export function createSecrets(THREE, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  group.name = 'simSecrets';
  group.visible = false;
  group.userData.keepInScene = true;
  const dummy = new THREE.Object3D();
  const geo = new THREE.OctahedronGeometry(0.52, 0);
  const wispGeo = new THREE.OctahedronGeometry(0.7, 0);
  const popGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const mats = Object.create(null);
  const popMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false,
  });
  popMat.userData.looksSkip = true;
  const pop = new THREE.Mesh(popGeo, popMat);
  pop.visible = false;
  group.add(pop);

  const MAX_S = 16;
  const MAX_K = 2;
  let sparkMesh = null;
  let wispMesh = null;
  let mapId = '';
  let active = false;
  let quality = 'med';
  let sparks = [];
  let secrets = [];
  let collected = new Uint8Array(MAX_S);
  let found = new Uint8Array(MAX_K);
  let nS = 0;
  let nK = 0;
  let popT = -1;
  let revealT = -1;
  let nearest = -1;
  let hintOn = 0;
  const rgb = new Float32Array(MAX_S * 3);
  const tmpC = new THREE.Color();

  function matFor(id, kind) {
    const key = id + ':' + kind + ':' + (quality === 'low' ? 'L' : 'H');
    if (mats[key]) return mats[key];
    const pair = vibePair(id);
    const col = kind === 'wisp' ? pair.b : pair.a;
    const m = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: kind === 'wisp' ? 0.38 : 1,
      depthWrite: false, toneMapped: false,
    });
    m.userData.looksSkip = true;
    mats[key] = m;
    return m;
  }

  function writeSpark(i, live, pulse) {
    const p = sparks[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0.4, i * 0.7, 0.2);
    const s = live ? (1.15 + pulse * 1.4) : 0.0001;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    sparkMesh.setMatrixAt(i, dummy.matrix);
    const pair = vibePair(mapId);
    tmpC.setHex(i & 1 ? pair.b : pair.a);
    const k = live ? (0.72 + pulse * 2.1) : 0;
    rgb[i * 3] = tmpC.r * k;
    rgb[i * 3 + 1] = tmpC.g * k;
    rgb[i * 3 + 2] = tmpC.b * k;
  }

  function writeWisp(i, live, pulse) {
    const s = secrets[i];
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0.2, i * 1.1, 0);
    const sc = live ? (0.55 + pulse) : 0.0001;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    wispMesh.setMatrixAt(i, dummy.matrix);
  }

  function rebuild() {
    if (sparkMesh) {
      group.remove(sparkMesh);
      sparkMesh = null;
    }
    if (wispMesh) {
      group.remove(wispMesh);
      wispMesh = null;
    }
    if (!nS && !nK) return;
    sparkMesh = new THREE.InstancedMesh(geo, matFor(mapId, 'spark'), Math.max(1, nS));
    sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sparkMesh.frustumCulled = false;
    sparkMesh.count = Math.max(1, nS);
    wispMesh = new THREE.InstancedMesh(wispGeo, matFor(mapId, 'wisp'), Math.max(1, nK));
    wispMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wispMesh.frustumCulled = false;
    wispMesh.count = Math.max(1, nK);
    group.add(sparkMesh);
    group.add(wispMesh);
    for (let i = 0; i < nS; i++) writeSpark(i, collected[i] === 0, 0);
    for (let i = 0; i < nK; i++) writeWisp(i, found[i] === 0, 0.08);
    sparkMesh.instanceMatrix.needsUpdate = true;
    if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
    wispMesh.instanceMatrix.needsUpdate = true;
  }

  function readProgress() {
    return o.load ? o.load() : loadSecrets();
  }

  function writeProgress(p) {
    if (o.save) o.save(p);
    else saveSecrets(p);
  }

  function applySaved() {
    const prog = readProgress();
    const row = (prog.maps && prog.maps[mapId]) || { sparks: [], secrets: [] };
    for (let i = 0; i < nS; i++) collected[i] = hasId(row.sparks, sparks[i].id) ? 1 : 0;
    for (let i = 0; i < nK; i++) found[i] = hasId(row.secrets, secrets[i].id) ? 1 : 0;
  }

  function toastSparks() {
    let got = 0;
    for (let i = 0; i < nS; i++) if (collected[i]) got++;
    if (o.toast) o.toast('Sparks ' + got + '/' + nS);
  }

  function maybeUnlock(kind) {
    const skin = SECRET_SKINS.find((s) => s.unlock && s.unlock.map === mapId && s.unlock.type === kind);
    if (!skin) return;
    const prog = o.skinProgress ? o.skinProgress() : {};
    if (!catalogSkinUnlocked(skin, prog, readProgress())) return;
    if (o.onUnlock) o.onUnlock(skin, kind);
  }

  function collectIndex(i) {
    if (i < 0 || i >= nS || collected[i]) return false;
    collected[i] = 1;
    const p = markSpark(readProgress(), mapId, sparks[i].id);
    writeProgress(p);
    pop.position.set(sparks[i].x, sparks[i].y, sparks[i].z);
    pop.scale.set(0.4, 0.4, 0.4);
    pop.visible = true;
    popT = 0;
    tmpC.setHex(vibePair(mapId).a);
    popMat.color.copy(tmpC);
    popMat.opacity = 0.95;
    writeSpark(i, false, 0);
    if (sparkMesh) sparkMesh.instanceMatrix.needsUpdate = true;
    playChime(o.muted ? o.muted() : false);
    toastSparks();
    let got = 0;
    for (let k = 0; k < nS; k++) if (collected[k]) got++;
    if (got >= nS) maybeUnlock('sparks');
    if (o.onCollect) o.onCollect(mapId, sparks[i], got, nS);
    return true;
  }

  function revealIndex(i) {
    if (i < 0 || i >= nK || found[i]) return false;
    found[i] = 1;
    const sec = secrets[i];
    const p = markSecret(readProgress(), mapId, sec.id);
    writeProgress(p);
    pop.position.set(sec.x, sec.y, sec.z);
    pop.scale.set(0.8, 0.8, 0.8);
    pop.visible = true;
    revealT = 0;
    popT = 0;
    tmpC.setHex(vibePair(mapId).b);
    popMat.color.copy(tmpC);
    popMat.opacity = 1;
    writeWisp(i, false, 0);
    if (wispMesh) wispMesh.instanceMatrix.needsUpdate = true;
    playChime(o.muted ? o.muted() : false);
    if (o.toast) o.toast('SECRET — ' + String(sec.name).toUpperCase());
    maybeUnlock('secret');
    if (o.onReveal) o.onReveal(mapId, sec);
    return true;
  }

  function attach(nextMap, on) {
    mapId = knownMapId(nextMap) || '';
    active = !!(on && isSecretsMap(mapId));
    const pack = active ? placementsFor(mapId) : { sparks: [], secrets: [] };
    sparks = pack.sparks;
    secrets = pack.secrets;
    nS = sparks.length;
    nK = secrets.length;
    collected.fill(0);
    found.fill(0);
    nearest = -1;
    hintOn = 0;
    popT = -1;
    revealT = -1;
    pop.visible = false;
    if (active) applySaved();
    rebuild();
    group.visible = active;
    return active;
  }

  function setQuality(q) {
    quality = q === 'low' ? 'low' : (q === 'high' ? 'high' : 'med');
    if (active) rebuild();
  }

  function tick(now, pos, dt) {
    try {
      if (!active || !pos) return;
      const t = (now || 0) * 0.001;
      const px = pos.x, py = pos.y, pz = pos.z;
      let nearI = -1;
      let nearD = HINT_U;
      for (let i = 0; i < nS; i++) {
        if (collected[i]) continue;
        const p = sparks[i];
        const d = Math.hypot(px - p.x, py - p.y, pz - p.z);
        if (d < COLLECT_U) {
          collectIndex(i);
          continue;
        }
        if (d < nearD) { nearD = d; nearI = i; }
      }
      for (let i = 0; i < nK; i++) {
        if (found[i]) continue;
        const s = secrets[i];
        const d = Math.hypot(px - s.x, py - s.y, pz - s.z);
        if (d < s.r) revealIndex(i);
        else if (d < nearD) { nearD = d; nearI = -2 - i; }
      }
      const pulse = 0.08 + 0.10 * (0.5 + 0.5 * Math.sin(t * 5.2));
      if (sparkMesh) {
        for (let i = 0; i < nS; i++) {
          const live = collected[i] === 0;
          const extra = (live && i === nearI) ? pulse * 1.6 : (live ? 0.04 * Math.sin(t * 2.3 + i) : 0);
          writeSpark(i, live, extra);
        }
        sparkMesh.instanceMatrix.needsUpdate = true;
      }
      if (wispMesh) {
        for (let i = 0; i < nK; i++) {
          const live = found[i] === 0;
          const close = live && nearI === -2 - i;
          writeWisp(i, live, close ? (0.18 + pulse) : 0.06);
        }
        wispMesh.instanceMatrix.needsUpdate = true;
      }
      nearest = nearI;
      hintOn = nearI >= 0 || nearI <= -2 ? 1 : 0;
      if (popT >= 0) {
        popT += dt || 0.016;
        const u = popT / 0.32;
        if (u >= 1) {
          pop.visible = false;
          popT = -1;
        } else {
          const s = 0.4 + u * (revealT >= 0 ? 4.2 : 1.8);
          pop.scale.set(s, s, s);
          popMat.opacity = 0.95 * (1 - u);
          pop.visible = true;
        }
      }
      if (revealT >= 0) {
        revealT += dt || 0.016;
        if (revealT > 0.9) revealT = -1;
      }
    } catch (e) { /* never abort the FPV render loop */ }
  }

  function progressNow() {
    return mapProgress(mapId, readProgress());
  }

  function lookTarget(kind, index) {
    if (kind === 'secret') {
      const s = secrets[index] || secrets[0];
      return s ? { x: s.x, y: s.y, z: s.z, yaw: 0, map: mapId, kind: 'secret', id: s.id } : null;
    }
    const p = sparks[index] || sparks[0];
    return p ? { x: p.x, y: p.y, z: p.z, yaw: 0, map: mapId, kind: 'spark', id: p.id } : null;
  }

  return {
    group,
    attach,
    detach() { attach('', false); },
    setQuality,
    tick,
    collectIndex,
    revealIndex,
    progress: progressNow,
    lookTarget,
    get mapId() { return mapId; },
    get active() { return active; },
    get sparkCount() { return nS; },
    get secretCount() { return nK; },
    get nearest() { return nearest; },
    get hintOn() { return hintOn; },
    placements: () => placementsFor(mapId),
  };
}

export const STOCK_SKIN_IDS = STOCK_IDS;
export { hexNum };
