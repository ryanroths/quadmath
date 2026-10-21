// Node tests for M2 tracks: frozen city layouts, share codes, missed-gate.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  FROZEN_CITY, cityTrackJson, normalizeTrack, tracksEqualLayout, lapLength,
  lapLengthMetres, encodeShare, decodeShare, detectPassOrMiss, enteredGate,
  applyMissPenalty, MISS_PENALTY_MS, ghostStorageKey, bestLapStorageKey,
  bestRunStorageKey, ghostPayloadError, makePaceGhost, loadCustomTracks,
  saveCustomTracks, CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, loadSelected,
  saveSelected, BUILTIN_TRACK_FILES, SHARE_PREFIX, startPad, gateRadius, MAPS,
  findTrackIn, resolveSimBoot, firstTrackForMap, knownMapId, isBlankTrackId,
  isFreestyleTrackId, isEphemeralTrackId, freestyleTrack, freestyleIdFor,
  resolveFly, resolveTrackPick, persistableSelection,
  isLineTrackId, lineFinishIndex, afterLinePass, ghostSampleDue, downsampleGhost,
  interpolateGhostPose, lineDeltaMs, fmtSignedDelta, visibleSplits,
  LINE_GHOST_HZ, LINE_GHOST_MAX,
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
assert.ok((byMap.office || 0) >= 2, 'office needs 2+ tracks');
assert.ok((byMap.gym || 0) >= 2, 'gym needs 2+ tracks');
assert.ok((byMap.trainer || 0) >= 2, 'trainer needs 2+ tracks');
assert.equal(byMap.living, 4);
assert.equal(byMap.office, 5);
assert.equal(byMap.gym, 5);
assert.equal(byMap.trainer, 3);
assert.ok((byMap.city || 0) >= 4, 'city needs loop + zigzag + 2 named lines');

for (const t of files.filter((x) => ['living', 'office', 'gym', 'trainer'].includes(x.map) || ['city-inside', 'city-spins'].includes(x.id))) {
  for (const g of t.gates) {
    assert.ok(g.size <= 2.2, t.id + ' whoop gate too large: ' + g.size);
    assert.ok(g.solid, t.id + ' whoop gates should be solid');
  }
  assert.ok(lapLengthMetres(t.gates) > 6 && lapLengthMetres(t.gates) < 200, t.id + ' lap m ' + lapLengthMetres(t.gates));
}

const catalog = JSON.parse(readFileSync('tracks/catalog.json', 'utf8'));
assert.equal(catalog.tracks.length, BUILTIN_TRACK_FILES.length);
for (const meta of BUILTIN_TRACK_FILES) {
  assert.ok(catalog.tracks.some((t) => t.id === meta.id && t.map === meta.map), 'catalog missing ' + meta.id);
}
assert.ok(catalog.maps.some((m) => m.id === 'office'));
assert.ok(catalog.maps.some((m) => m.id === 'gym'));
assert.ok(catalog.maps.some((m) => m.id === 'trainer'));
assert.ok(catalog.maps.some((m) => m.id === 'room'));
assert.ok(MAPS.some((m) => m.id === 'office' && m.indoor));
assert.ok(MAPS.some((m) => m.id === 'room' && m.indoor));

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
// last-gate respawn parks at JSON gate center; next index is the following gate
const lastGate = { x: g1.x, y: g1.y, z: g1.z };
assert.equal(detectPassOrMiss(lastGate, lastGate, living.gates, 2).type, 'none');

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
assert.ok(Number.isFinite(pad.yaw), 'pad faces the first gate');
assert.equal(startPad(city0).y, 0.15);
const zigPad = startPad(city1);
assert.ok(Math.hypot(zigPad.x - city1.gates[0].x, zigPad.z - city1.gates[0].z) < 40);
assert.ok(Math.hypot(zigPad.x, zigPad.z - 20) > 200, 'Mesa Zigzag pad is not City Loop origin');

const metres = lapLengthMetres(living.gates);
assert.ok(metres > 8 && metres < 80, 'living sofa should be a whoop-scale lap, got ' + metres);

for (const t of files) {
  const url = t.legacyId != null ? 'ghosts/track_' + t.legacyId + '.json' : 'ghosts/' + t.id + '.json';
  assert.ok(existsSync(url), 'missing pace ghost ' + url);
  const g = JSON.parse(readFileSync(url, 'utf8'));
  assert.equal(ghostPayloadError(g, t.legacyId != null ? t.legacyId : t.id), null, url);
}

assert.ok(isBlankTrackId(null) && isBlankTrackId(undefined) && isBlankTrackId(''));
assert.equal(findTrackIn(null, files), null, 'findTrack(null) must not match legacyId null (Sofa Slalom)');
assert.equal(findTrackIn(undefined, files), null);
assert.equal(findTrackIn('', files), null);
assert.equal(findTrackIn('living-sofa', files).id, 'living-sofa');
assert.equal(findTrackIn(1, files).id, 'city-zigzag');
assert.equal(knownMapId('office'), 'office');
assert.equal(knownMapId('narnia'), null);
assert.equal(firstTrackForMap('office', files).id, 'office-cubicles');
assert.equal(firstTrackForMap('room', files).id, 'room-practice');

const sofa = files.find((t) => t.id === 'living-sofa');
assert.equal(resolveSimBoot({ map: 'living' }, null, files).track, 'living-freestyle');
assert.equal(resolveSimBoot({ map: 'office' }, null, files).track, 'office-freestyle');
assert.equal(resolveSimBoot({ map: 'room' }, null, files).track, 'room-freestyle');
assert.equal(resolveSimBoot({ map: 'gym' }, null, files).track, 'gym-freestyle');
assert.equal(resolveSimBoot({ map: 'living' }, null, files).mode, 'free');
const mismatch = resolveSimBoot({ map: 'city', track: 'living-sofa' }, null, files);
assert.equal(mismatch.map, 'living');
assert.equal(mismatch.track, 'living-sofa');
assert.equal(mismatch.mode, 'race');
const unknown = resolveSimBoot({ map: 'narnia' }, { map: 'garage', track: 'garage-bench' }, files);
assert.equal(unknown.map, 'city');
assert.equal(unknown.track, 'city-freestyle');
assert.equal(unknown.save, false);
assert.equal(unknown.unknownMap, true);
const restored = resolveSimBoot({}, { map: 'garage', track: 'garage-bench' }, files);
assert.equal(restored.map, 'garage');
assert.equal(restored.track, 'garage-freestyle');
assert.equal(restored.mode, 'free');
assert.equal(restored.save, false);
assert.equal(restored.restored, true);
const zigBoot = resolveSimBoot({ map: 'city', track: 'city-zigzag' }, null, files);
assert.equal(zigBoot.track, 1);
assert.ok(sofa && String(sofa.legacyId) === String(null), 'legacyId null still stringifies; matcher must not use that');

assert.equal(isFreestyleTrackId('city-freestyle'), true);
assert.equal(isFreestyleTrackId('living-freestyle'), true);
assert.equal(isFreestyleTrackId('narnia-freestyle'), false);
assert.equal(isEphemeralTrackId('room-practice'), true);
assert.equal(isEphemeralTrackId('daily-2026-10-18'), true);
assert.equal(isEphemeralTrackId('weekly-2026-W42-g2'), true);
assert.equal(isEphemeralTrackId('living-sofa'), false);
assert.equal(freestyleTrack('trainer').gates.length, 0);
assert.equal(freestyleIdFor('gym'), 'gym-freestyle');

const emptyBoot = resolveSimBoot({}, null, files);
assert.equal(emptyBoot.map, 'city');
assert.equal(emptyBoot.track, 'city-freestyle');
assert.equal(emptyBoot.mode, 'free');
const roomQuery = resolveSimBoot({ track: 'room-practice' }, { map: 'city', track: 'city-loop' }, files);
assert.equal(roomQuery.map, 'room');
assert.equal(roomQuery.track, 'room-practice');
assert.equal(roomQuery.save, false);
assert.equal(roomQuery.mode, 'race');
const roomQueryMapped = resolveSimBoot({ map: 'room', track: 'room-practice' }, null, files);
assert.equal(roomQueryMapped.map, 'room');
assert.equal(roomQueryMapped.track, 'room-practice');
assert.equal(roomQueryMapped.mode, 'race');
const roomSaved = resolveSimBoot({}, { map: 'room', track: 'room-practice' }, files);
assert.equal(roomSaved.map, 'room');
assert.equal(roomSaved.track, 'room-freestyle');
const dailySaved = resolveSimBoot({}, { map: 'trainer', track: 'daily-2026-10-18' }, files);
assert.equal(dailySaved.map, 'trainer');
assert.equal(dailySaved.track, 'trainer-freestyle');
assert.equal(resolveFly({ map: 'living', track: 'living-sofa' }).track, 'living-freestyle');
assert.equal(resolveFly(null).track, 'city-freestyle');
assert.equal(resolveTrackPick('office', 'office-hallway', files).track, 'office-hallway');
assert.equal(resolveTrackPick('office', 'office-hallway', files).map, 'office');
assert.equal(resolveTrackPick('office', 'freestyle', files).track, 'office-freestyle');
assert.equal(resolveTrackPick('living', 'garage-bench', files).map, 'garage');
assert.equal(persistableSelection({ map: 'room', track: 'room-practice' }).track, 'room-freestyle');
assert.equal(persistableSelection({ map: 'gym', track: 'daily-2026-10-18' }).map, 'gym');
assert.equal(persistableSelection({ map: 'gym', track: 'daily-2026-10-18' }).track, 'gym-freestyle');
assert.equal(persistableSelection({ map: 'warehouse', track: 'warehouse-aisle' }).track, 'warehouse-aisle');
assert.equal(persistableSelection({ map: 'warehouse', track: 'warehouse-aisle' }).mode, 'race');
saveSelected({ map: 'room', track: 'room-practice' }, store);
assert.equal(loadSelected(store).track, 'room-freestyle');
assert.equal(loadSelected(store).mode, 'free');
const freeNorm = normalizeTrack(freestyleTrack('city'));
assert.equal(freeNorm.freestyle, true);
assert.equal(freeNorm.gates.length, 0);
assert.equal(startPad(freeNorm).z, 20);

assert.equal(isLineTrackId('garage-bench'), true);
assert.equal(isLineTrackId('garage-rafters'), true);
assert.equal(isLineTrackId('warehouse-racks'), true);
assert.equal(isLineTrackId('warehouse-rafters'), true);
assert.equal(isLineTrackId('living-sofa'), true);
assert.equal(isLineTrackId('living-under'), true);
assert.equal(isLineTrackId('living-rafters'), true);
assert.equal(isLineTrackId('living-circuit'), true);
assert.equal(isLineTrackId('living-freestyle'), false);
assert.equal(isLineTrackId('office-under'), true);
assert.equal(isLineTrackId('office-rafters'), true);
assert.equal(isLineTrackId('office-cubicles'), true);
assert.equal(isLineTrackId('office-hallway'), true);
assert.equal(isLineTrackId('office-desks'), true);
assert.equal(isLineTrackId('office-freestyle'), false);
assert.equal(isLineTrackId('gym-under'), true);
assert.equal(isLineTrackId('gym-rafters'), true);
assert.equal(isLineTrackId('gym-court'), true);
assert.equal(isLineTrackId('gym-bleachers'), true);
assert.equal(isLineTrackId('gym-hoops'), true);
assert.equal(isLineTrackId('gym-freestyle'), false);
assert.equal(isLineTrackId(0), false);
assert.equal(isLineTrackId(1), false);
assert.equal(isLineTrackId('city-loop'), false);
assert.equal(isLineTrackId('city-freestyle'), false);
assert.equal(isLineTrackId('city-inside'), true);
assert.equal(isLineTrackId('city-spins'), true);
assert.equal(lineFinishIndex(8), 7);
assert.deepEqual(afterLinePass(0, 8, false), { start: true, finish: false, nextIndex: 1 });
assert.deepEqual(afterLinePass(3, 8, true), { start: false, finish: false, nextIndex: 4 });
assert.deepEqual(afterLinePass(7, 8, true), { start: false, finish: true, nextIndex: 0 });
assert.equal(ghostSampleDue(null, 0, LINE_GHOST_HZ), true);
assert.equal(ghostSampleDue(0, 60, LINE_GHOST_HZ), false);
assert.equal(ghostSampleDue(0, 70, LINE_GHOST_HZ), true);
const fat = [];
for (let i = 0; i < 1200; i++) fat.push([i, i, 1, 0, 0, 0, 0, 1]);
const slim = downsampleGhost(fat, LINE_GHOST_MAX);
assert.ok(slim.length <= LINE_GHOST_MAX + 1);
assert.equal(slim[0][0], 0);
assert.equal(slim[slim.length - 1][0], 1199);
const pose = interpolateGhostPose(
  [[0, 0, 0, 0, 0, 0, 0, 1], [1000, 10, 0, 0, 0, 0, 0, 1]],
  250,
);
assert.ok(Math.abs(pose[1] - 2.5) < 1e-9);
assert.equal(lineDeltaMs(10100, 10000), 100);
assert.equal(lineDeltaMs(9900, 10000), -100);
assert.equal(lineDeltaMs(10000, 0), null);
assert.equal(fmtSignedDelta(-320), '-0.32');
assert.equal(fmtSignedDelta(1250), '+1.25');
assert.deepEqual(visibleSplits([1, 2, 3, 4, 5], 3), [3, 4, 5]);
const lineGhost = makePaceGhost(living.gates, { track: 'living-sofa', speed: 6, hz: LINE_GHOST_HZ, laps: 1 });
assert.equal(ghostPayloadError(lineGhost, 'living-sofa'), null);
assert.ok(lineGhost.samples.length > 4 && lineGhost.samples.length < 400);
const tableDive = files.find((t) => t.id === 'living-under');
assert.ok(tableDive && tableDive.gates.length >= 4);
assert.deepEqual(afterLinePass(0, tableDive.gates.length, false), { start: true, finish: false, nextIndex: 1 });
assert.deepEqual(
  afterLinePass(tableDive.gates.length - 1, tableDive.gates.length, true),
  { start: false, finish: true, nextIndex: 0 },
);
const livingLineGhost = makePaceGhost(tableDive.gates, { track: 'living-under', speed: 6, hz: LINE_GHOST_HZ, laps: 1 });
assert.equal(ghostPayloadError(livingLineGhost, 'living-under'), null);
assert.ok(livingLineGhost.samples.length > 4 && livingLineGhost.samples.length <= LINE_GHOST_MAX);
const ceilingRun = files.find((t) => t.id === 'living-rafters');
assert.ok(ceilingRun && ceilingRun.gates.length >= 4);
assert.deepEqual(
  afterLinePass(ceilingRun.gates.length - 1, ceilingRun.gates.length, true),
  { start: false, finish: true, nextIndex: 0 },
);
const livingRafterGhost = makePaceGhost(ceilingRun.gates, { track: 'living-rafters', speed: 6, hz: LINE_GHOST_HZ, laps: 1 });
assert.equal(ghostPayloadError(livingRafterGhost, 'living-rafters'), null);
assert.ok(livingRafterGhost.samples.length > 4 && livingRafterGhost.samples.length <= LINE_GHOST_MAX);
const deskDive = files.find((t) => t.id === 'office-under');
assert.ok(deskDive && deskDive.gates.length >= 4);
assert.deepEqual(afterLinePass(0, deskDive.gates.length, false), { start: true, finish: false, nextIndex: 1 });
assert.deepEqual(
  afterLinePass(deskDive.gates.length - 1, deskDive.gates.length, true),
  { start: false, finish: true, nextIndex: 0 },
);
const officeLineGhost = makePaceGhost(deskDive.gates, { track: 'office-under', speed: 6, hz: LINE_GHOST_HZ, laps: 1 });
assert.equal(ghostPayloadError(officeLineGhost, 'office-under'), null);
assert.ok(officeLineGhost.samples.length > 4 && officeLineGhost.samples.length < 400);
const benchDive = files.find((t) => t.id === 'gym-under');
assert.ok(benchDive && benchDive.gates.length >= 4);
assert.deepEqual(afterLinePass(0, benchDive.gates.length, false), { start: true, finish: false, nextIndex: 1 });
assert.deepEqual(
  afterLinePass(benchDive.gates.length - 1, benchDive.gates.length, true),
  { start: false, finish: true, nextIndex: 0 },
);
const gymLineGhost = makePaceGhost(benchDive.gates, { track: 'gym-under', speed: 6, hz: LINE_GHOST_HZ, laps: 1 });
assert.equal(ghostPayloadError(gymLineGhost, 'gym-under'), null);
assert.ok(gymLineGhost.samples.length > 4 && gymLineGhost.samples.length <= LINE_GHOST_MAX);

console.log('ok', files.length, 'tracks; city layouts frozen; share round-trip; miss 100%; old keys untouched');
