// QuadMath sim — Gap Hunt: fly through every named gap of a map.
//
// The gaps are the map's authored gap volumes (sim-maps.js mapGaps, the trick
// detector's Gap), scene units, axis-aligned, each flown along its axis. A
// gap is found the first time a frame's step crosses the plane through its
// middle, across its axis, inside its opening: the coach's ring test
// (sim-coach.js gateCrossing) with the opening as a rectangular aperture.
// Flying past it crosses that plane outside the opening and does not count.
//
// Progress is per map, in this browser only (localStorage, every access in
// try/catch): which gaps are found, the flying time since the first one, and
// the time the last one was found in. No meshes, no textures: the page shows
// it as a toast, a list in the menu and a card.

import { mapGaps } from './sim-maps.js?v=2677c28cc6f2';
import { gateCrossing } from './sim-coach.js?v=14e860c757b3';

export const GAP_HUNT_KEY = 'qm_gap_hunt_v1';

// A step longer than this (metres) is a respawn or a teleport, not flight.
export const HUNT_MAX_STEP_M = 3;
// A clock step longer than this (ms) is a pause, not flying time.
export const HUNT_MAX_TICK_MS = 250;

// The maps with a hunt, and for each its gaps' hints (one line each, by the
// gap's name) and which are hidden. Every gap mapGaps lists for the map must
// have a hint here (tools/test_sim_gap_hunt.mjs).
const HUNTS = Object.freeze({
  house: Object.freeze({
    title: 'House + backyard',
    hidden: Object.freeze(['doggy door', 'kitchen window', 'shed window']),
    hints: Object.freeze({
      'bookshelf gap': 'Indoors: one bay of the bookshelf has no shelf.',
      'under the patio table (along z)': 'Low under the patio table, end to end.',
      'under the patio table (along x)': 'Low under the patio table, side to side.',
      'kitchen window': 'The kitchen window is open, but only a crack.',
      'doggy door': 'Something on the east side is hiding a very small door.',
      'under the slide': 'Under the slide, where it runs down.',
      'pool ladder rails': 'Between the rails of the pool ladder.',
      'trampoline zipper': 'The trampoline net has a door in it.',
      'trampoline open top': 'Drop into the trampoline from above.',
      'swing A-frame (west)': 'Through the swing set\'s west legs.',
      'swing A-frame (east)': 'Through the swing set\'s east legs.',
      'between the swings': 'Between the two swing seats.',
      'swing gap (west)': 'Between the west legs and a seat.',
      'swing gap (east)': 'Between a seat and the east legs.',
      'citrus branch gap (west)': 'Under the citrus tree\'s west branch.',
      'citrus branch gap (east)': 'Under the citrus tree\'s east branch.',
      'shed door': 'The shed\'s door is open.',
      'shed window': 'Round the back of the shed.',
      'dome crown': 'Dive into the top of the dome.',
      'dome window (east)': 'A window in the dome, east side.',
      'dome window (west)': 'A window in the dome, west side.',
      'under the monkey bars': 'Under the monkey-bar arch.',
      'between the monkey bars': 'Down between the middle rungs of the monkey bars.',
      'tube slide': 'Out of the tube slide\'s mouth.',
      'sliding door': 'The back hall\'s sliding door is half open.',
      'patio posts (back)': 'Between the patio posts, back end.',
      'patio posts (middle)': 'Between the patio posts, the middle pair.',
      'patio posts (front)': 'Between the patio posts, front end.',
      'patio wall gap (back)': 'Over the patio\'s low wall, back end.',
      'patio wall gap (front)': 'Over the patio\'s low wall, front end.',
    }),
  }),
});

const PLANE = Object.freeze({ x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] });

export function huntMaps() {
  return Object.keys(HUNTS);
}
export function hasHunt(mapId) {
  return Object.prototype.hasOwnProperty.call(HUNTS, mapId);
}
export function huntTitle(mapId) {
  return hasHunt(mapId) ? HUNTS[mapId].title : '';
}

// The map's gaps for the hunt: each its name, hint, hidden flag, volume, and
// the ring test's gate (the plane through the volume's middle across its
// axis, the opening's half sizes along the plane's two axes).
export function huntGaps(mapId) {
  if (!hasHunt(mapId)) return [];
  const H = HUNTS[mapId];
  return mapGaps(mapId).map((v) => {
    const g = { axis: v.axis, shape: 'rect' };
    for (const a of ['x', 'y', 'z']) g[a] = (v.min[a] + v.max[a]) / 2;
    const [u, w] = PLANE[v.axis];
    g.hw = (v.max[u] - v.min[u]) / 2;
    g.hh = (v.max[w] - v.min[w]) / 2;
    return Object.freeze({
      name: v.name,
      hint: H.hints[v.name] || 'Somewhere on this map.',
      hidden: H.hidden.includes(v.name),
      min: v.min, max: v.max,
      gate: Object.freeze(g),
    });
  });
}

// ---- Storage ----

function readAll(storage) {
  try {
    const raw = storage && storage.getItem(GAP_HUNT_KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object' && o.maps && typeof o.maps === 'object') return o;
  } catch (e) { /* unreadable: start over */ }
  return { v: 1, maps: {} };
}

function normalizeMap(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const found = Array.isArray(r.found) ? r.found.filter((n) => typeof n === 'string').slice(0, 500) : [];
  const ms = Number.isFinite(r.ms) && r.ms > 0 ? r.ms : 0;
  const doneMs = Number.isFinite(r.doneMs) && r.doneMs > 0 ? r.doneMs : null;
  return { found: [...new Set(found)], ms, doneMs };
}

export function loadHuntProgress(mapId, storage) {
  return normalizeMap(readAll(storage).maps[mapId]);
}

export function saveHuntProgress(mapId, progress, storage) {
  try {
    if (!storage) return false;
    const all = readAll(storage);
    all.v = 1;
    all.maps[mapId] = normalizeMap(progress);
    storage.setItem(GAP_HUNT_KEY, JSON.stringify(all));
    return true;
  } catch (e) {
    return false;
  }
}

// ---- The hunt ----

// A map's hunt, its progress loaded from storage (null: none kept). ws:
// scene units per metre (the teleport guard).
export function makeHunt(mapId, storage, ws) {
  const gaps = huntGaps(mapId);
  const p = loadHuntProgress(mapId, storage);
  const known = new Set(gaps.map((g) => g.name));
  return {
    mapId, gaps, storage: storage || null,
    maxStep: HUNT_MAX_STEP_M * (ws > 0 ? ws : 1),
    found: new Set(p.found.filter((n) => known.has(n))),
    ms: p.ms, doneMs: p.doneMs,
    prev: null, lastClock: null,
  };
}

export function huntCounts(h) {
  return { found: h ? h.found.size : 0, total: h ? h.gaps.length : 0 };
}

export function huntComplete(h) {
  return !!h && h.gaps.length > 0 && h.found.size >= h.gaps.length;
}

// The list for the menu: found gaps by name, the rest as ??? with the hint.
export function huntList(h) {
  if (!h) return [];
  return h.gaps.map((g) => {
    const got = h.found.has(g.name);
    return { name: got ? g.name : '???', hint: g.hint, found: got, hidden: g.hidden };
  });
}

// Forget the last position (a map change, a pause): the next step starts
// from where the quad is then. With pos (a respawn: where it was put), the
// next step starts from there, so a first frame that already crosses a gap
// still counts.
export function huntReset(h, pos) {
  if (!h) return;
  h.prev = pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
  h.lastClock = null;
}

// Merged with what is stored first (another tab, or this page's own later
// save): a save never loses a find, and the time kept is the longer one.
function save(h) {
  const known = new Set(h.gaps.map((g) => g.name));
  const kept = loadHuntProgress(h.mapId, h.storage);
  for (const n of kept.found) if (known.has(n)) h.found.add(n);
  if (kept.ms > h.ms) h.ms = kept.ms;
  if (h.doneMs == null && kept.doneMs != null) h.doneMs = kept.doneMs;
  if (h.doneMs == null && huntComplete(h)) h.doneMs = Math.round(h.ms);
  return saveHuntProgress(h.mapId, { found: [...h.found], ms: h.ms, doneMs: h.doneMs }, h.storage);
}

// The flying clock (ms, the page's sim clock): adds to the hunt's time once
// the first gap is found and until the last; pauses do not count.
export function huntTick(h, clockMs) {
  if (!h || !Number.isFinite(clockMs)) return;
  const last = h.lastClock;
  h.lastClock = clockMs;
  if (last == null || h.found.size === 0 || h.doneMs != null) return;
  const d = clockMs - last;
  if (d > 0 && d <= HUNT_MAX_TICK_MS) h.ms += d;
}

// One frame's step from the last position to pos ({x, y, z}, scene units).
// Returns the gap found by it ({ gap, found, total, hidden, complete, ms }),
// or null.
export function huntStep(h, pos) {
  if (!h || !pos) return null;
  const prev = h.prev;
  h.prev = { x: pos.x, y: pos.y, z: pos.z };
  if (!prev) return null;
  const step = Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z);
  if (!(step > 0) || step > h.maxStep) return null;
  let hit = null;
  for (const g of h.gaps) {
    if (h.found.has(g.name)) continue;
    if (gateCrossing(prev, pos, g.gate) >= 0) { hit = g; break; }
  }
  if (!hit) return null;
  h.found.add(hit.name);
  const complete = huntComplete(h);
  if (complete && h.doneMs == null) h.doneMs = Math.round(h.ms);
  save(h);
  return { gap: hit.name, found: h.found.size, total: h.gaps.length, hidden: hit.hidden, complete, ms: h.doneMs != null ? h.doneMs : Math.round(h.ms) };
}

// Keep the flying time (the page calls this on pagehide).
export function huntSave(h) {
  return h ? save(h) : false;
}

// m:ss (or h:mm:ss) of a time in ms.
export function fmtHuntTime(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? h + ':' + pad(m) + ':' + pad(r) : m + ':' + pad(r);
}

// The completion's SHARE text.
export function huntShareText(mapId, total, ms) {
  return 'I found all ' + total + ' gaps on the QuadMath sim\'s ' + huntTitle(mapId) + ' map in ' + fmtHuntTime(ms) + ' of flying.';
}
