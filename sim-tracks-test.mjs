// Node tests for M2 tracks: frozen city layouts, share codes, missed-gate.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  FROZEN_CITY, cityTrackJson, normalizeTrack, tracksEqualLayout, lapLength,
  lapLengthMetres, encodeShare, decodeShare, detectPassOrMiss, enteredGate,
  applyMissPenalty, MISS_PENALTY_MS, ghostStorageKey, bestLapStorageKey,
  bestRunStorageKey, ghostPayloadError, makePaceGhost, loadCustomTracks,
  saveCustomTracks, CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, loadSelected,
  saveSelected, BUILTIN_TRACK_FILES, SHARE_PREFIX, startPad, gateRadius,
} from './sim-tracks.js';

function readTrack(file) {
  return normalizeTrack(JSON.parse(readFileSync(file, 'utf8')));
}

const city0 = readTrack('tracks/city-loop.json');
const city1 = readTrack('tracks/city-zigzag.json');
assert.equal(city0.legacyId, 0);
assert.equal(city1.legacyId, 1);
assert.ok(tracksEqualLayout(city0, cityTrackJson(0)), 'city-loop JSON drifted from frozen layout');
assert.ok(tracksEqualLayout(city1, cityTrackJson(1)), 'city-zigzag JSON drifted from frozen layout');
assert.equal(city0.gates.length, FROZEN_CITY[0].length);
assert.equal(city1.gates.length, FROZEN_CITY[1].length);
for (let i = 0; i < city0.gates.length; i++) {
  const g = city0.gates[i], f = FROZEN_CITY[0][i];
  assert.equal(g.x, f.x);
  assert.equal(g.y, f.y);
  assert.equal(g.z, f.z);
  assert.equal(g.ry, f.ry);
  assert.equal(g.size, f.size);
  assert.equal(!!g.solid, !!f.solid);
}

const files = BUILTIN_TRACK_FILES.map((m) => readTrack(m.file));
assert.ok(files.length >= 8, 'need 6+ tracks (city 2 + indoor)');
for (const t of files) {
  assert.ok(t.gates.length >= 2, t.id + ' needs 2+ gates');
  assert.ok(lapLength(t.gates) > 0, t.id + ' lap length');
}

const byMap = {};
for (const t of files) {
  byMap[t.map] = (byMap[t.map] || 0) + 1;
}
assert.ok((byMap.living || 0) >= 2);
assert.ok((byMap.garage || 0) >= 2);
assert.ok((byMap.warehouse || 0) >= 2);
assert.ok((byMap.backyard || 0) >= 2);

const living = files.find((t) => t.id === 'living-sofa');
for (const g of living.gates) {
  assert.ok(g.size <= 2.2, 'whoop gate too large: ' + g.size);
  assert.ok(g.solid, 'whoop gates should be solid');
}

const code = encodeShare(living);
assert.ok(code.startsWith(SHARE_PREFIX));
const round = decodeShare(code);
assert.ok(tracksEqualLayout(round, living));
assert.equal(round.name, living.name);
const rawJson = decodeShare(JSON.stringify({
  v: 1, n: 'X', m: 'living',
  g: living.gates.map((g) => [g.x, g.y, g.z, g.ry, g.size, 1]),
  f: [],
}));
assert.equal(rawJson.gates.length, living.gates.length);

const g0 = living.gates[0];
const g1 = living.gates[1];
const outside = { x: g1.x + 50, y: g1.y, z: g1.z };
const justOut = { x: g1.x, y: g1.y, z: g1.z + gateRadius(g1) + 0.2 };
const inside = { x: g1.x, y: g1.y, z: g1.z };
assert.equal(detectPassOrMiss(outside, justOut, living.gates, 0).type, 'none');
assert.equal(detectPassOrMiss(justOut, inside, living.gates, 0).type, 'miss', 'wrong gate must miss');
assert.equal(detectPassOrMiss(justOut, inside, living.gates, 1).type, 'pass');
assert.equal(detectPassOrMiss(inside, inside, living.gates, 1).type, 'none', 'no re-trigger while sitting in gate');
assert.equal(detectPassOrMiss(
  { x: g0.x, y: g0.y, z: g0.z + gateRadius(g0) + 0.3 },
  { x: g0.x, y: g0.y, z: g0.z },
  living.gates, 0,
).type, 'pass');
assert.equal(applyMissPenalty(10000, 2), 10000 + 2 * MISS_PENALTY_MS);
assert.ok(enteredGate(justOut, inside, g1));
assert.ok(!enteredGate(inside, inside, g1));

assert.equal(ghostStorageKey(0), 'quadmath_bestGhost_0');
assert.equal(ghostStorageKey(1), 'quadmath_bestGhost_1');
assert.equal(ghostStorageKey('city-loop'), 'quadmath_bestGhost_0');
assert.equal(bestLapStorageKey(0), 'quadmath_bestLap_0');
assert.equal(bestRunStorageKey(1), 'quadmath_bestRun_1');
assert.equal(ghostStorageKey('living-sofa'), 'quadmathSimGhost_living-sofa');
assert.equal(bestLapStorageKey('living-sofa'), 'quadmathSimBestLap_living-sofa');

const mem = {};
const store = {
  getItem: (k) => mem[k] ?? null,
  setItem: (k, v) => { mem[k] = String(v); },
};
saveCustomTracks([living], store);
assert.ok(mem[CUSTOM_TRACKS_KEY]);
assert.equal(loadCustomTracks(store)[0].id, 'living-sofa');
saveSelected({ map: 'garage', track: 'garage-bench' }, store);
assert.equal(loadSelected(store).map, 'garage');
assert.equal(loadSelected(store).track, 'garage-bench');
assert.ok(!mem.quadmath_bestLap_0 && !mem.quadmath_bestGhost_0, 'must not write old keys');

const ghost0 = JSON.parse(readFileSync('ghosts/track_0.json', 'utf8'));
const ghost1 = JSON.parse(readFileSync('ghosts/track_1.json', 'utf8'));
assert.equal(ghostPayloadError(ghost0, 0), null);
assert.equal(ghostPayloadError(ghost1, 1), null);
assert.ok(ghostPayloadError(ghost0, 1));
const newGhost = makePaceGhost(living.gates, { track: 'living-sofa', speed: 6, hz: 8, laps: 3 });
assert.equal(ghostPayloadError(newGhost, 'living-sofa'), null);
assert.ok(newGhost.samples.length > 10);

const pad = startPad(living);
assert.ok(Number.isFinite(pad.x) && pad.y >= 0.9, 'indoor pad should hover, not sit on carpet');
assert.ok(Math.abs(pad.z - living.gates[0].z) > 2, 'pad stands off first gate');
assert.equal(startPad(city0).y, 0.15);

const metres = lapLengthMetres(living.gates);
assert.ok(metres > 8 && metres < 80, 'living sofa should be a whoop-scale lap, got ' + metres);

for (const t of files) {
  const url = t.legacyId != null ? 'ghosts/track_' + t.legacyId + '.json' : 'ghosts/' + t.id + '.json';
  assert.ok(existsSync(url), 'missing pace ghost ' + url);
  const g = JSON.parse(readFileSync(url, 'utf8'));
  assert.equal(ghostPayloadError(g, t.legacyId != null ? t.legacyId : t.id), null, url);
}

console.log('ok', files.length, 'tracks; city layouts frozen; share round-trip; miss 100%; old keys untouched');
