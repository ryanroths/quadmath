// Unit tests for W3 Your-room planner.
// Node stdlib only: `node --test tools/test_sim_room.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, WS_PER_METRE, normalizeTrack } from '../sim-tracks.js';
import { indoorDraft, DEFAULT_WHOOP } from '../sim-whoop.js';
import { DEFAULT_BUILD } from '../sim-build.js';
import {
  ROOM_KEY, ROOM_TRACK_ID, DEFAULT_ROOM,
  normalizeRoomSpec, loadRoom, saveRoom, planRoom, roomSignature,
  formatRoomSize, parseRoomQuery, toMetres, toWorld, furnitureAabb,
  aabbClearance, roomWallDist, generateRoomTrack,
} from '../sim-room.js';
import { MAP_IDS, LAYOUT, MAP_ORBIT, MAP_LOOKS } from '../sim-maps.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const roomSrc = readFileSync(join(root, 'sim-room.js'), 'utf8');
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';

test('new storage key only; never writes old keys', () => {
  assert.equal(ROOM_KEY, 'quadmathSimRoom');
  assert.ok(roomSrc.includes('setItem(ROOM_KEY'));
  assert.equal(roomSrc.includes('ryflyDroneType'), false);
  assert.equal(roomSrc.includes('ryflyRates'), false);
  assert.equal(roomSrc.includes(CUSTOM_TRACKS_KEY), false);
  assert.equal(roomSrc.includes(SELECTED_TRACK_KEY), false);
  assert.ok(roomSrc.includes('copied from WebFPV') || roomSrc.includes('Nothing here is copied from WebFPV'));
  const mem = new Map();
  const store = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  };
  saveRoom({ units: 'm', length: 5, width: 4, height: 2.6 }, store);
  assert.equal([...mem.keys()].join(','), ROOM_KEY);
  const loaded = loadRoom(store);
  assert.equal(loaded.units, 'm');
  assert.ok(Math.abs(loaded.length - 5) < 1e-9);
});

test('normalize clamps and converts units', () => {
  const ft = normalizeRoomSpec({ units: 'ft', length: 2, width: 99, height: 3 });
  assert.equal(ft.units, 'ft');
  assert.equal(ft.length, 8);
  assert.equal(ft.width, 40);
  assert.equal(ft.height, 7);
  const m = normalizeRoomSpec({ units: 'm', length: 1, width: 20, height: 1 });
  assert.equal(m.length, 2.4);
  assert.equal(m.width, 12);
  assert.equal(m.height, 2.1);
  assert.ok(Math.abs(toMetres(10, 'ft') - 3.048) < 1e-9);
  assert.ok(Math.abs(toWorld(1) - WS_PER_METRE) < 1e-9);
  assert.deepEqual(parseRoomQuery('16x12x8ft'), normalizeRoomSpec(DEFAULT_ROOM));
  assert.equal(parseRoomQuery('5x4x2.6m').units, 'm');
  assert.equal(parseRoomQuery('nope'), null);
});

test('planner builds a walled cell, furniture, and a whoop practice track', () => {
  const plan = planRoom(DEFAULT_ROOM);
  assert.ok(plan.w > 10 && plan.d > 12 && plan.h > 7);
  assert.ok(plan.furniture.length >= 3, 'need bed/desk/chair at least');
  for (const item of plan.furniture) {
    const bb = furnitureAabb(item);
    assert.ok(bb.min.x > -plan.w / 2 + 0.05, item.kind + ' through -X wall');
    assert.ok(bb.max.x < plan.w / 2 - 0.05, item.kind + ' through +X wall');
    assert.ok(bb.min.z > -plan.d / 2 + 0.05, item.kind + ' through -Z wall');
    assert.ok(bb.max.z < plan.d / 2 - 0.05, item.kind + ' through +Z wall');
    assert.ok(bb.max.y < plan.h - 0.4, item.kind + ' through ceiling');
  }
  const t = plan.track;
  assert.equal(t.id, ROOM_TRACK_ID);
  assert.equal(t.map, 'room');
  assert.ok(t.gates.length >= 2);
  for (const g of t.gates) {
    assert.ok(g.solid);
    assert.ok(g.size <= 2.2);
    assert.ok(Math.abs(g.x) < plan.w / 2 - 1.1);
    assert.ok(Math.abs(g.z) < plan.d / 2 - 1.1);
    assert.ok(g.y > 1.1 && g.y < plan.h - 1.1);
    for (const item of plan.furniture) {
      assert.ok(aabbClearance(g, furnitureAabb(item)) >= 1.2, 'gate in ' + item.kind);
    }
  }
  assert.ok(formatRoomSize(DEFAULT_ROOM).includes('16'));
  assert.equal(roomSignature(DEFAULT_ROOM), roomSignature(normalizeRoomSpec(DEFAULT_ROOM)));
});

test('small and large rooms both get a flyable auto track', () => {
  const tiny = planRoom({ units: 'ft', length: 8, width: 8, height: 7 });
  const hall = planRoom({ units: 'm', length: 10, width: 8, height: 3.5 });
  assert.ok(tiny.track.gates.length >= 2);
  assert.ok(hall.track.gates.length >= 4);
  assert.ok(hall.furniture.some((f) => f.kind === 'sofa') || hall.w > 20);
  const regen = generateRoomTrack(tiny);
  assert.equal(normalizeTrack(regen).gates.length, tiny.track.gates.length);
});

test('W2 drafts grow near planned room walls', () => {
  const plan = planRoom({ units: 'm', length: 10, width: 8, height: 4.5 });
  const nearPos = { x: plan.w / 2 - 0.25, y: 1.6, z: 0 };
  const farPos = { x: 0, y: plan.h * 0.45, z: 0 };
  const nearD = roomWallDist(nearPos, plan) / WS_PER_METRE;
  const farD = roomWallDist(farPos, plan) / WS_PER_METRE;
  const near = indoorDraft(nearPos, nearD, 1.0, DEFAULT_BUILD, DEFAULT_WHOOP);
  const far = indoorDraft(farPos, farD, 1.0, DEFAULT_BUILD, DEFAULT_WHOOP);
  assert.ok(near.prox > 0.5, 'near wall prox ' + near.prox);
  assert.ok(farD > 1.8, 'center should be outside the draft radius, got ' + farD);
  assert.equal(far.prox, 0);
});

test('W3 maps are registered with orbits and looks', () => {
  for (const id of ['office', 'gym', 'trainer', 'room']) {
    assert.ok(MAP_IDS.includes(id), id);
    assert.ok(MAP_ORBIT[id], id + ' orbit');
    assert.ok(MAP_LOOKS[id], id + ' looks');
  }
  assert.ok(LAYOUT.office.w > 20 && LAYOUT.gym.h > 20 && LAYOUT.trainer.w > 16);
  assert.ok(MAP_LOOKS.gym.hemi >= 0.5, 'gym court needs fill so spawn is not near-black');
  assert.ok(MAP_LOOKS.gym.bg >= 0.4);
  const mapsSrc = readFileSync(join(root, 'sim-maps.js'), 'utf8');
  assert.ok(mapsSrc.includes('0, 12, 20'), 'gym court-level fill lights');
});

test('sim.html wires Your room without touching old localStorage keys', () => {
  assert.ok(simSrc.includes('sim-room.js'));
  assert.ok(simSrc.includes('id="menuRoom"'));
  assert.ok(simSrc.includes('id="roomBuild"'));
  assert.ok(simSrc.includes('ROOM_KEY') && simSrc.includes('applyRoomSpec'));
  assert.ok(simSrc.includes('parseRoomQuery'));
  for (const k of [
    'ryflyRates', 'ryflyDroneType', 'quadmath_bestLap_', 'quadmath_bestGhost_',
    'loadCustomTracks', 'CUSTOM_TRACKS_KEY', 'SELECTED_TRACK_KEY',
  ]) {
    assert.ok(simSrc.includes(k), 'must keep reading old key ' + k);
  }
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML from the sim PR');
});
