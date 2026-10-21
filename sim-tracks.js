// QuadMath sim M2 — track data, share codes, splits / missed-gate logic.
// No physics. City layouts 0 and 1 are frozen so existing ghosts stay valid.
// New localStorage keys only: quadmathSimCustomTracks, quadmathSimTrack,
// quadmathSimBestLap_*, quadmathSimBestRun_*, quadmathSimGhost_*.

export const CUSTOM_TRACKS_KEY = 'quadmathSimCustomTracks';
export const SELECTED_TRACK_KEY = 'quadmathSimTrack';
export const MISS_PENALTY_MS = 2000;
export const SHARE_PREFIX = 'QM2.';
export const WS_PER_METRE = 3.5;

// Frozen city gate lists copied from the pre-M2 addGate() calls in sim.html.
// Do not edit numbers: hosted ghosts, local bests, and share codes key off them.
export const FROZEN_CITY = {
  0: [
    { x: -140, y: 7, z: -120, ry: 0.00, size: 8, solid: false },
    { x: -150, y: 6, z: -30, ry: 0.15, size: 8, solid: false },
    { x: -140, y: 9, z: 55, ry: -0.20, size: 8, solid: false },
    { x: -70, y: 24, z: 110, ry: 0.90, size: 7, solid: false },
    { x: -25, y: 5.5, z: 70, ry: -0.65, size: 7, solid: false },
    { x: 0, y: 6, z: -90, ry: 1.57, size: 5.5, solid: false },
    { x: 45, y: 10, z: -70, ry: 0.70, size: 5.5, solid: false },
    { x: 70, y: 12, z: -50, ry: -0.70, size: 6, solid: false },
    { x: 0, y: 7, z: 285, ry: 0.00, size: 5.5, solid: false },
    { x: -40, y: 8, z: -150, ry: 0.10, size: 9, solid: false },
  ],
  1: [
    { x: 210, y: 8, z: -345, ry: 0.30, size: 9, solid: true },
    { x: 490, y: 14, z: -390, ry: 1.95, size: 7, solid: true },
    { x: 220, y: 26, z: -435, ry: -1.95, size: 7, solid: true },
    { x: 480, y: 40, z: -480, ry: 1.95, size: 6, solid: true },
    { x: 350, y: 46, z: -515, ry: 3.14, size: 6, solid: true },
    { x: 220, y: 28, z: -550, ry: -1.95, size: 7, solid: true },
    { x: 490, y: 16, z: -585, ry: 1.95, size: 7, solid: true },
    { x: 350, y: 10, z: -620, ry: 3.14, size: 8, solid: true },
    { x: 220, y: 18, z: -655, ry: -1.95, size: 7, solid: true },
    { x: 480, y: 12, z: -680, ry: 1.60, size: 7, solid: true },
    { x: 350, y: 22, z: -685, ry: 0.90, size: 8, solid: true },
    { x: 280, y: 10, z: -405, ry: -2.60, size: 9, solid: true },
  ],
};

export const MAPS = [
  { id: 'city', name: 'City', class: 'open', indoor: false },
  { id: 'living', name: 'Living Room', class: 'whoop', indoor: true },
  { id: 'garage', name: 'Garage', class: 'whoop', indoor: true },
  { id: 'warehouse', name: 'Warehouse', class: 'whoop', indoor: true },
  { id: 'backyard', name: 'Backyard', class: 'whoop', indoor: false },
  { id: 'office', name: 'Office', class: 'whoop', indoor: true },
  { id: 'gym', name: 'School Gym', class: 'whoop', indoor: true },
  { id: 'trainer', name: 'Tiny Trainer', class: 'whoop', indoor: true },
  { id: 'room', name: 'Your Room', class: 'whoop', indoor: true },
];

export function isLegacyTrackId(id) {
  return id === 0 || id === 1 || id === '0' || id === '1';
}

export function legacyIndex(id) {
  if (id === 0 || id === '0' || id === 'city-loop') return 0;
  if (id === 1 || id === '1' || id === 'city-zigzag') return 1;
  return null;
}

export function isBlankTrackId(id) {
  return id == null || id === '' || id === 'null' || id === 'undefined';
}

export function trackRefId(t) {
  if (!t) return null;
  return t.legacyId != null ? t.legacyId : t.id;
}

export function knownMapId(id) {
  if (id == null || id === '') return null;
  return MAPS.some((m) => m.id === id) ? id : null;
}

export function matchTrack(t, id) {
  if (!t || isBlankTrackId(id)) return false;
  const L = legacyIndex(id);
  if (t.id === id) return true;
  if (L !== null && t.legacyId === L) return true;
  // Never String(null)===String(id): indoor tracks have legacyId null and
  // findTrack(null) used to match Sofa Slalom on ?map= without ?track=.
  if (t.legacyId != null && String(t.legacyId) === String(id)) return true;
  return false;
}

export function findTrackIn(id, tracks) {
  if (isBlankTrackId(id)) return null;
  if (id === 'freestyle') return freestyleTrack('city');
  if (isFreestyleTrackId(id)) {
    const map = String(id).slice(0, -'-freestyle'.length);
    if (knownMapId(map)) return freestyleTrack(map);
  }
  const L = legacyIndex(id);
  for (const t of tracks || []) {
    if (matchTrack(t, id)) return t;
  }
  if (L !== null) return cityTrackJson(L);
  return null;
}

export function firstTrackForMap(mapId, tracks) {
  if (mapId === 'room') {
    const hit = (tracks || []).find((t) => t.id === 'room-practice' || t.map === 'room');
    return hit || { id: 'room-practice', map: 'room', name: 'Practice' };
  }
  const list = (tracks || []).filter((t) => t.map === mapId);
  if (mapId === 'city' && !list.length) return cityTrackJson(0);
  return list[0] || null;
}

export function isFreestyleTrackId(id) {
  if (typeof id !== 'string' || !id.endsWith('-freestyle')) return false;
  return !!knownMapId(id.slice(0, -'-freestyle'.length));
}

export function freestyleIdFor(mapId) {
  const map = knownMapId(mapId) || 'city';
  return map + '-freestyle';
}

export function isEphemeralTrackId(id) {
  const s = id == null ? '' : String(id);
  if (s === 'room-practice' || s === 'daily' || s === 'weekly') return true;
  return /^daily-\d{4}-\d{2}-\d{2}$/.test(s)
    || /^weekly-\d{4}-W\d{2}(?:-g\d+)?$/.test(s);
}

export function freestyleStart(mapId) {
  const map = knownMapId(mapId) || 'city';
  if (map === 'city') return { x: 0, y: 0.15, z: 20, yaw: 0 };
  return { x: 0, y: 1.2, z: 0, yaw: 0 };
}

export function freestyleTrack(mapId) {
  const map = knownMapId(mapId) || 'city';
  const meta = MAPS.find((m) => m.id === map) || MAPS[0];
  return {
    id: freestyleIdFor(map),
    legacyId: null,
    map,
    name: 'Freestyle',
    class: meta.class || 'whoop',
    gates: [],
    flags: [],
    start: freestyleStart(map),
    freestyle: true,
  };
}

// Last map is the Fly destination. Daily / weekly / Your-room practice must
// not become the boot or Fly race — those are session courses.
export function persistableSelection(sel) {
  const map = knownMapId(sel && sel.map) || 'city';
  const track = sel && sel.track;
  if (isFreestyleTrackId(track) || isEphemeralTrackId(track) || sel && sel.mode === 'free') {
    return { map, track: freestyleIdFor(map), mode: 'free' };
  }
  if (isBlankTrackId(track)) {
    return { map, track: freestyleIdFor(map), mode: 'free' };
  }
  return { map, track, mode: 'race' };
}

export function resolveFly(saved) {
  const map = knownMapId(saved && saved.map) || 'city';
  return { map, track: freestyleIdFor(map), mode: 'free' };
}

export function resolveTrackPick(mapId, trackId, tracks) {
  const map = knownMapId(mapId) || 'city';
  if (isBlankTrackId(trackId) || trackId === 'freestyle' || isFreestyleTrackId(trackId)) {
    return { map, track: freestyleIdFor(map), mode: 'free' };
  }
  const found = findTrackIn(trackId, tracks);
  if (found) {
    return {
      map: found.map || map,
      track: trackRefId(found),
      mode: found.freestyle ? 'free' : 'race',
    };
  }
  if (isEphemeralTrackId(trackId)) {
    return { map, track: String(trackId), mode: 'race' };
  }
  return { map, track: freestyleIdFor(map), mode: 'free' };
}

// Deep-link / reload resolver. Track id wins map when they disagree.
// Map-only query, saved state, and empty boot are free flight on that map.
// Daily / weekly / room-practice in localStorage must not lock boot to a race.
// Unknown ?map= falls back to city freestyle and must not be persisted.
export function resolveSimBoot(query, saved, tracks) {
  const q = query || {};
  if (isFreestyleTrackId(q.track) || q.track === 'freestyle') {
    const fromId = isFreestyleTrackId(q.track)
      ? String(q.track).slice(0, -'-freestyle'.length)
      : q.map;
    const map = knownMapId(fromId) || knownMapId(q.map) || 'city';
    return { map, track: freestyleIdFor(map), save: true, mode: 'free' };
  }
  // Query ?track=room-practice is a session race on Your Room. Saved
  // room-practice still remaps to room-freestyle via persistableSelection
  // so a reload without the query does not lock Fly to the generated cell.
  if (q.track === 'room-practice') {
    return { map: 'room', track: 'room-practice', save: false, mode: 'race' };
  }
  const found = findTrackIn(q.track, tracks);
  if (found) {
    const mode = found.freestyle ? 'free' : 'race';
    return { map: found.map, track: trackRefId(found), save: true, mode };
  }
  const known = knownMapId(q.map);
  if (q.map && !known) {
    return {
      map: 'city', track: freestyleIdFor('city'),
      save: false, unknownMap: true, mode: 'free',
    };
  }
  if (known) {
    return { map: known, track: freestyleIdFor(known), save: true, mode: 'free' };
  }
  if (saved && knownMapId(saved.map)) {
    const fly = resolveFly(saved);
    return { map: fly.map, track: fly.track, save: false, restored: true, mode: 'free' };
  }
  return {
    map: 'city', track: freestyleIdFor('city'),
    save: false, restored: true, mode: 'free',
  };
}

export function ghostStorageKey(id) {
  const legacy = legacyIndex(id);
  if (legacy !== null) return 'quadmath_bestGhost_' + legacy;
  return 'quadmathSimGhost_' + id;
}

export function bestLapStorageKey(id) {
  const legacy = legacyIndex(id);
  if (legacy !== null) return 'quadmath_bestLap_' + legacy;
  return 'quadmathSimBestLap_' + id;
}

export function bestRunStorageKey(id) {
  const legacy = legacyIndex(id);
  if (legacy !== null) return 'quadmath_bestRun_' + legacy;
  return 'quadmathSimBestRun_' + id;
}

export function gateRadius(g) {
  return (g.size || 7) * 0.8;
}

function num(v, fallback) {
  const n = +v;
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeGate(raw) {
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

export function normalizeFlag(raw) {
  return {
    x: num(raw.x, 0),
    y: num(raw.y, 2),
    z: num(raw.z, 0),
    ry: num(raw.ry, 0),
  };
}

export function normalizeTrack(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') throw new Error('BAD TRACK');
  const gates = Array.isArray(raw.gates) ? raw.gates.map(normalizeGate) : [];
  const flags = Array.isArray(raw.flags) ? raw.flags.map(normalizeFlag) : [];
  const id = raw.id != null ? String(raw.id) : String(fallbackId || 'custom');
  const freestyle = !!raw.freestyle || isFreestyleTrackId(id);
  if (gates.length < 2 && !freestyle) throw new Error('TRACK NEEDS 2+ GATES');
  const legacy = raw.legacyId != null ? +raw.legacyId : legacyIndex(id);
  const map = raw.map || 'city';
  return {
    id,
    legacyId: Number.isInteger(legacy) ? legacy : null,
    map,
    name: String(raw.name || (freestyle ? 'Freestyle' : 'Custom')).slice(0, 32),
    class: raw.class || 'whoop',
    gates,
    flags,
    start: raw.start && typeof raw.start === 'object'
      ? { x: num(raw.start.x, 0), y: num(raw.start.y, 0.15), z: num(raw.start.z, 0) }
      : (freestyle ? freestyleStart(map) : null),
    freestyle,
  };
}

export function cityTrackJson(legacyId) {
  const gates = FROZEN_CITY[legacyId];
  if (!gates) throw new Error('unknown city track');
  return {
    id: legacyId === 0 ? 'city-loop' : 'city-zigzag',
    legacyId,
    map: 'city',
    name: legacyId === 0 ? 'City Loop' : 'Mesa Zigzag',
    class: 'open',
    gates: gates.map((g) => ({ ...g })),
    flags: [],
  };
}

export function tracksEqualLayout(a, b) {
  if (!a || !b || a.gates.length !== b.gates.length) return false;
  for (let i = 0; i < a.gates.length; i++) {
    const g = a.gates[i], h = b.gates[i];
    if (g.x !== h.x || g.y !== h.y || g.z !== h.z) return false;
    if (g.ry !== h.ry || g.size !== h.size) return false;
    if (!!g.solid !== !!h.solid) return false;
  }
  return true;
}

export function lapLength(gates) {
  if (!gates || gates.length < 2) return 0;
  let d = 0;
  for (let i = 0; i < gates.length; i++) {
    const a = gates[i], b = gates[(i + 1) % gates.length];
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    d += Math.hypot(dx, dy, dz);
  }
  return d;
}

export function lapLengthMetres(gates) {
  return lapLength(gates) / WS_PER_METRE;
}

function headingTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function startPad(track) {
  const g = track && track.gates && track.gates[0];
  if (track && track.start) {
    const s = { ...track.start };
    if (s.yaw == null && g) s.yaw = headingTo(s, g);
    return s;
  }
  if (!g) return { x: 0, y: 0.15, z: 20, yaw: 0 };
  const indoor = track.map && track.map !== 'city';
  const dist = indoor ? (g.size || 1.8) * 3.2 : (g.size || 7) * 1.8;
  const pad = {
    x: g.x - Math.sin(g.ry || 0) * dist,
    y: indoor ? Math.max(0.9, (g.y || 2) * 0.45) : 0.15,
    z: g.z - Math.cos(g.ry || 0) * dist,
  };
  pad.yaw = headingTo(pad, g);
  return pad;
}

export function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

export function insideGate(pos, gate) {
  const r = gate.r != null ? gate.r : gateRadius(gate);
  return dist3(pos, gate) < r;
}

// Rising-edge: was outside last sample, now inside the gate sphere.
export function enteredGate(prev, pos, gate) {
  return insideGate(pos, gate) && !insideGate(prev, gate);
}

// Pass the next gate, or miss if any other gate is entered.
export function detectPassOrMiss(prev, pos, gates, nextIndex) {
  if (!gates || !gates.length) return { type: 'none' };
  const n = ((nextIndex % gates.length) + gates.length) % gates.length;
  for (let i = 0; i < gates.length; i++) {
    if (!enteredGate(prev, pos, gates[i])) continue;
    if (i === n) return { type: 'pass', index: i };
    return { type: 'miss', index: i, expected: n, penaltyMs: MISS_PENALTY_MS };
  }
  return { type: 'none' };
}

export function applyMissPenalty(lapMs, missCount) {
  return (lapMs || 0) + (missCount || 0) * MISS_PENALTY_MS;
}

export function sharePayload(track) {
  const t = normalizeTrack(track);
  return {
    v: 1,
    id: t.id,
    n: t.name,
    m: t.map,
    g: t.gates.map((g) => [g.x, g.y, g.z, g.ry, g.size, g.solid ? 1 : 0]),
    f: t.flags.map((f) => [f.x, f.y, f.z, f.ry]),
  };
}

export function fromSharePayload(p) {
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

export function encodeShare(track) {
  return SHARE_PREFIX + b64utf8(JSON.stringify(sharePayload(track)));
}

export function decodeShare(code) {
  const s = String(code || '').trim();
  if (!s) throw new Error('PASTE A TRACK CODE FIRST');
  if (s[0] === '{' ) return fromSharePayload(JSON.parse(s));
  const body = s.indexOf(SHARE_PREFIX) === 0 ? s.slice(SHARE_PREFIX.length) : s;
  return fromSharePayload(JSON.parse(utf8b64(body)));
}

export function loadCustomTracks(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return [];
  try {
    const raw = store.getItem(CUSTOM_TRACKS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map((t, i) => normalizeTrack(t, 'custom-' + i));
  } catch (e) {
    return [];
  }
}

export function saveCustomTracks(list, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  const payload = (list || []).map((t) => {
    const n = normalizeTrack(t);
    return {
      id: n.id, map: n.map, name: n.name, class: n.class,
      gates: n.gates.map(({ x, y, z, ry, size, solid }) => ({ x, y, z, ry, size, solid })),
      flags: n.flags,
    };
  });
  store.setItem(CUSTOM_TRACKS_KEY, JSON.stringify(payload));
  return true;
}

export function loadSelected(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return persistableSelection(null);
  try {
    const raw = store.getItem(SELECTED_TRACK_KEY);
    if (!raw) return persistableSelection(null);
    const o = JSON.parse(raw);
    return persistableSelection({
      map: o.map,
      track: o.track,
      mode: o.mode,
    });
  } catch (e) {
    return persistableSelection(null);
  }
}

export function saveSelected(sel, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return persistableSelection(sel);
  const out = persistableSelection(sel);
  store.setItem(SELECTED_TRACK_KEY, JSON.stringify(out));
  return out;
}

function catmull(P, i, t) {
  const n = P.length;
  const p0 = P[(i - 1 + n) % n], p1 = P[i % n], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function axisQ(axis, ang) {
  const s = Math.sin(ang / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)];
}

function heading(v) {
  return Math.atan2(-v.x, -v.z);
}

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }

export function makePaceGhost(gates, opts) {
  const o = opts || {};
  const speed = o.speed || 8;
  const hz = o.hz || 8;
  const laps = o.laps || 3;
  const P = gates.map((g) => ({ x: g.x, y: g.y, z: g.z }));
  const n = P.length;
  const pts = [];
  const totalSegs = laps * n - 1;
  for (let s = 0; s < totalSegs; s++) {
    for (let k = 0; k < 40; k++) pts.push(catmull(P, s % n, k / 40));
  }
  pts.push({ x: P[totalSegs % n].x, y: P[totalSegs % n].y, z: P[totalSegs % n].z });
  const d = [];
  for (let i = 0; i < pts.length - 1; i++) d.push(norm(sub(pts[i + 1], pts[i])));
  const cum = [0];
  for (const x of d) cum.push(cum[cum.length - 1] + x);
  const L = cum[cum.length - 1];
  const T = L / speed;
  const samples = [];
  let idx = 0;
  const G = 9.81;
  for (let t = 0; t <= T + 1e-9; t += 1 / hz) {
    const s = Math.min(t * speed, L);
    while (idx < d.length - 1 && cum[idx + 1] < s) idx++;
    const f = d[idx] > 0 ? (s - cum[idx]) / d[idx] : 0;
    const p = add(pts[idx], mul(sub(pts[idx + 1], pts[idx]), f));
    let v = sub(pts[Math.min(idx + 3, pts.length - 1)], pts[Math.max(idx - 3, 0)]);
    if (Math.abs(v.x) + Math.abs(v.z) < 1e-6) v = { x: 0, y: 0, z: -1 };
    const yaw = heading(v);
    const pa = pts[Math.max(idx - 8, 0)];
    const pb = pts[Math.min(idx + 8, pts.length - 1)];
    const ha = heading(sub(pts[idx], pa));
    const hb = heading(sub(pb, pts[idx]));
    let dyaw = (hb - ha + Math.PI) % (Math.PI * 2) - Math.PI;
    const arc = norm(sub(pb, pa));
    const omega = arc > 0 ? dyaw / (arc / speed) : 0;
    const bank = Math.max(-1.1, Math.min(1.1, Math.atan(omega * speed / G)));
    const pitch = -0.35 - 0.1 * Math.abs(bank);
    const q = quatMul(axisQ([0, 1, 0], yaw), quatMul(axisQ([0, 0, 1], bank), axisQ([1, 0, 0], pitch)));
    const r2 = (x) => Math.round(x * 100) / 100;
    const r3 = (x) => Math.round(x * 1000) / 1000;
    samples.push([Math.round(t * 1000), r2(p.x), r2(p.y), r2(p.z), r3(q[0]), r3(q[1]), r3(q[2]), r3(q[3])]);
  }
  return {
    v: 1,
    phys: o.phys != null ? o.phys : 2, // W2 tag; playback is still kinematic v:1
    track: o.track != null ? o.track : 0,
    name: o.name || 'PACE BOT',
    lapTime: Math.round(T * 1000),
    samples,
  };
}

export function ghostPayloadError(p, expectTrack) {
  if (!p || p.v !== 1 || !Array.isArray(p.samples) || p.samples.length < 2) return 'BAD GHOST CODE';
  const okLegacy = p.track === 0 || p.track === 1;
  const okNew = typeof p.track === 'string' && p.track.length > 0 && p.track.length < 48;
  if (!okLegacy && !okNew) return 'BAD GHOST TRACK';
  if (expectTrack !== null && expectTrack !== undefined) {
    const a = legacyIndex(p.track);
    const b = legacyIndex(expectTrack);
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

export const BUILTIN_TRACK_FILES = [
  { id: 'city-loop', file: 'tracks/city-loop.json', legacyId: 0, map: 'city', name: 'City Loop' },
  { id: 'city-zigzag', file: 'tracks/city-zigzag.json', legacyId: 1, map: 'city', name: 'Mesa Zigzag' },
  { id: 'living-sofa', file: 'tracks/living-sofa.json', map: 'living', name: 'Sofa Slalom' },
  { id: 'living-circuit', file: 'tracks/living-circuit.json', map: 'living', name: 'Living Circuit' },
  { id: 'garage-bench', file: 'tracks/garage-bench.json', map: 'garage', name: 'Workbench' },
  { id: 'garage-rafters', file: 'tracks/garage-rafters.json', map: 'garage', name: 'Rafters' },
  { id: 'warehouse-aisle', file: 'tracks/warehouse-aisle.json', map: 'warehouse', name: 'Aisle Run' },
  { id: 'warehouse-catwalk', file: 'tracks/warehouse-catwalk.json', map: 'warehouse', name: 'Catwalk' },
  { id: 'warehouse-racks', file: 'tracks/warehouse-racks.json', map: 'warehouse', name: 'Rack Weave' },
  { id: 'warehouse-rafters', file: 'tracks/warehouse-rafters.json', map: 'warehouse', name: 'Truss Run' },
  { id: 'backyard-fence', file: 'tracks/backyard-fence.json', map: 'backyard', name: 'Fence Loop' },
  { id: 'backyard-patio', file: 'tracks/backyard-patio.json', map: 'backyard', name: 'Patio Dive' },
  { id: 'office-cubicles', file: 'tracks/office-cubicles.json', map: 'office', name: 'Cubicle Weave' },
  { id: 'office-hallway', file: 'tracks/office-hallway.json', map: 'office', name: 'Hallway Run' },
  { id: 'office-desks', file: 'tracks/office-desks.json', map: 'office', name: 'Desk Hop' },
  { id: 'gym-court', file: 'tracks/gym-court.json', map: 'gym', name: 'Court Loop' },
  { id: 'gym-bleachers', file: 'tracks/gym-bleachers.json', map: 'gym', name: 'Bleacher Climb' },
  { id: 'gym-hoops', file: 'tracks/gym-hoops.json', map: 'gym', name: 'Hoop Dive' },
  { id: 'trainer-figure8', file: 'tracks/trainer-figure8.json', map: 'trainer', name: 'Figure 8' },
  { id: 'trainer-slalom', file: 'tracks/trainer-slalom.json', map: 'trainer', name: 'Slalom' },
  { id: 'trainer-hairpin', file: 'tracks/trainer-hairpin.json', map: 'trainer', name: 'Hairpin' },
];

export function hostedGhostUrl(id) {
  const legacy = legacyIndex(id);
  if (legacy !== null) return 'ghosts/track_' + legacy + '.json';
  return 'ghosts/' + id + '.json';
}

export async function fetchBuiltinTracks(fetchFn) {
  const f = fetchFn || fetch;
  return Promise.all(BUILTIN_TRACK_FILES.map(async (meta) => {
    try {
      const r = await f(meta.file);
      if (!r.ok) throw new Error('missing');
      const json = await r.json();
      const t = normalizeTrack(json, meta.id);
      if (meta.legacyId != null) {
        const frozen = cityTrackJson(meta.legacyId);
        if (!tracksEqualLayout(t, frozen)) {
          throw new Error('CITY LAYOUT DRIFT ' + meta.id);
        }
        t.legacyId = meta.legacyId;
      }
      return t;
    } catch (e) {
      if (meta.legacyId != null) return normalizeTrack(cityTrackJson(meta.legacyId));
      throw e;
    }
  }));
}
