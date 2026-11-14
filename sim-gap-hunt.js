// QuadMath sim — Gap Hunt: fly through every named gap of a map.
//
// The gaps are the map's authored gap volumes (sim-maps.js mapGaps, also the
// trick detector's gap passes), scene units, axis-aligned, each flown along its axis. A
// gap is found the first time a frame's step crosses the plane through its
// middle, across its axis, inside its opening: the coach's ring test
// (sim-coach.js gateCrossing) with the opening as a rectangular aperture.
// Flying past it crosses that plane outside the opening and does not count.
//
// Progress is per map, in this browser only (localStorage, every access in
// try/catch): which gaps are found, the flying time since the first one, and
// the time the last one was found in. No meshes, no textures: the page shows
// it as a toast, a list in the menu and a card.

import { mapGaps } from './sim-maps.js?v=46239d27449d';
import { gateCrossing } from './sim-coach.js?v=20b0bf9b6ba5';

export const GAP_HUNT_KEY = 'qm_gap_hunt_v1';

// A step longer than this (metres) is a respawn or a teleport, not flight.
export const HUNT_MAX_STEP_M = 3;
// A clock step longer than this (ms) is a pause, not flying time.
export const HUNT_MAX_TICK_MS = 250;

// The maps with a hunt. The House's: every gap mapGaps lists, by its own
// name, each with a hint (one line) here, and which are hidden. The Bando's
// and the Warehouse's (depot): the gaps picked out of mapGaps (its volume's
// name), each with the name the hunt shows, its hint, and whether it is
// hidden; the rest of the map's volumes are not in the hunt. The names are
// what progress is saved under: do not rename one that has shipped.
// tools/test_sim_gap_hunt.mjs checks every hint and every pick's volume.
const pick = (vol, name, hint, hidden) => Object.freeze({ vol, name, hint, hidden: !!hidden });
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
  bando: Object.freeze({
    title: 'The Bando',
    picks: Object.freeze([
      pick('courtyard doorway', 'courtyard doorway', 'The big opening in the south face, at the ground.'),
      pick('ground door, x 13.75', 'east ground-floor door', 'A doorway in an inside wall, ground floor, east end.'),
      pick('ground door, x -12.55', 'west ground-floor door', 'A doorway in an inside wall, ground floor, west end.'),
      pick('ground window, south face, x -12.5', 'south-west corner window', 'Ground floor: the south face\'s westmost window.'),
      pick('first floor window, north face, x 0', 'north window, first floor', 'First floor, the middle of the north face.'),
      pick('second floor window, east face, z -12.75', 'high east window', 'Second floor, east face: the window furthest north.'),
      pick('second floor window, west face, z 2', 'high west window', 'Second floor, west face: the window furthest south.'),
      pick('floor hole, first floor, east', 'east floor hole, first floor', 'A ragged hole in the first floor: the east one.'),
      pick('floor hole, second floor, west', 'west floor hole, second floor', 'A ragged hole in the second floor: the west one.'),
      pick('floor hole, roof, west', 'west roof hole', 'A hole in the roof, the one further west.'),
      pick('stair well, second floor', 'stair well', 'Up or down the stairs\' well, north-west corner.'),
      pick('shaft door, ground', 'lift shaft door', 'The lift shaft\'s door at the ground.'),
      pick('shaft top', 'top of the lift shaft', 'Something by the start goes all the way down.', true),
      pick('ground rebar gap, 37 cm, x -8.98', 'ground-floor rebar gap', 'Between the bars of a broken wall, ground floor.'),
      pick('first floor rebar gap, 54 cm, z -13.80', 'first-floor rebar gap', 'Between the bars of a broken wall, first floor, north end.'),
      pick('second floor rebar gap, 30 cm, x 0.25', '30 cm rebar gap', 'The tightest gap between bars is upstairs.', true),
      pick('first floor door, z -11.4', 'first-floor door', 'A doorway in an inside wall, first floor.'),
      pick('second floor door, x 2.25', 'second-floor door', 'A doorway in an inside wall, second floor.'),
      pick('under the leaning slab', 'under the leaning slab', 'Under the fallen slab, east end.'),
      pick('first floor collapse', 'first floor collapse', 'Where the fallen slab came from.'),
      pick('parapet gap', 'parapet gap', 'A gap in the roof\'s low wall, south side.'),
      pick('through the van', 'through the van', 'End to end through the van out in the lot.'),
      pick('the van, front side windows', 'van cab windows', 'In one cab window of the van and out the other.', true),
    ]),
  }),
  depot: Object.freeze({
    title: 'The Warehouse',
    picks: Object.freeze([
      pick('roll-up door, z 1.65', 'first roll-up door', 'Under a half-open roll-up door into the dock.'),
      pick('roll-up door, z -3.85', 'second roll-up door', 'Under the other half-open roll-up door.'),
      pick('chain curtain parting', 'chain curtain', 'The parting in the hanging chain curtain.'),
      pick('under the forks', 'under the forks', 'Under the forklift\'s raised load.'),
      pick('rack gap', 'rack gap', 'The 60 cm gap through the double rack.'),
      pick('crossing gap, run B', 'crossing gap, first rack', 'Across the aisle: a second gap through the racks.'),
      pick('crossing gap, run C', 'crossing gap, second rack', 'The crossing gap goes through one more rack.'),
      pick('truss gap, x -20', 'roof truss, west end', 'Between a roof truss\'s posts, at the west end.'),
      pick('truss gap, x 2.5', 'roof truss, middle', 'Between a roof truss\'s posts, near the middle.'),
      pick('truss gap, x 17.5', 'roof truss, east end', 'Between a roof truss\'s posts, at the east end.'),
      pick('the hatch', 'the hatch', 'The mezzanine floor has a way through it.', true),
      pick('between the cable trays, z -5.1', 'between the cable trays', 'Down between two of the cable trays.'),
      pick('between the cable trays, z -4.4', 'between the other cable trays', 'Down between the other two cable trays.'),
      pick('under the truss over the cable trays, x -12.5', 'over the trays, under a truss', 'Along over the cable trays, under a truss.'),
      pick('through the container', 'through the container', 'End to end through the shipping container.'),
      pick('through the scissors', 'through the scissors', 'Across the scissor lift, between its two stages.'),
      pick('cargo net hole', 'cargo net hole', 'Look up: the cargo net has a hole.', true),
      pick('tyre bore, bottom row, west', 'tyre, bottom row, west', 'Through a tyre in the stack, bottom row, west.'),
      pick('tyre bore, bottom row, middle', 'tyre, bottom row, middle', 'Through a tyre in the stack, bottom row, middle.'),
      pick('tyre bore, bottom row, east', 'tyre, bottom row, east', 'Through a tyre in the stack, bottom row, east.'),
      pick('tyre bore, middle row, west', 'tyre, middle row, west', 'Through a tyre in the stack, middle row, west.'),
      pick('tyre bore, middle row, east', 'tyre, middle row, east', 'Through a tyre in the stack, middle row, east.'),
      pick('tyre bore, top', 'top tyre', 'The tyre at the very top of the stack.', true),
    ]),
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
// The House's: all of mapGaps. The others': the picks, in their order (a
// pick whose volume is gone is left out; the test fails on it).
function huntVolumes(mapId) {
  const H = HUNTS[mapId], vols = mapGaps(mapId);
  if (!H.picks) return vols.map((v) => ({ v, name: v.name, hint: H.hints[v.name] || 'Somewhere on this map.', hidden: H.hidden.includes(v.name) }));
  const by = new Map(vols.map((v) => [v.name, v]));
  return H.picks.filter((p) => by.has(p.vol)).map((p) => ({ v: by.get(p.vol), name: p.name, hint: p.hint, hidden: p.hidden }));
}
// The picks' volume names (the test checks each is one of mapGaps').
export function huntPickVolumes(mapId) {
  return hasHunt(mapId) && HUNTS[mapId].picks ? HUNTS[mapId].picks.map((p) => p.vol) : [];
}
export function huntGaps(mapId) {
  if (!hasHunt(mapId)) return [];
  return huntVolumes(mapId).map(({ v, name, hint, hidden }) => {
    const g = { axis: v.axis, shape: 'rect' };
    for (const a of ['x', 'y', 'z']) g[a] = (v.min[a] + v.max[a]) / 2;
    const [u, w] = PLANE[v.axis];
    g.hw = (v.max[u] - v.min[u]) / 2;
    g.hh = (v.max[w] - v.min[w]) / 2;
    return Object.freeze({
      name, hint, hidden, vol: v.name,
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
  return 'I found all ' + total + ' gaps in the QuadMath sim (' + huntTitle(mapId) + ') in ' + fmtHuntTime(ms) + ' of flying.';
}
