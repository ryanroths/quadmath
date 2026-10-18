// Regression tests for sim QA: track picker, boot URLs, flip toast, stamps.
// Node stdlib only: `node --test tools/test_sim_qa.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  findTrackIn, resolveSimBoot, firstTrackForMap, startPad, normalizeTrack,
  BUILTIN_TRACK_FILES, SELECTED_TRACK_KEY,
} from '../sim-tracks.js';
import { shouldToastFlip } from '../sim-feel.js';
import { MAP_LOOKS } from '../sim-maps.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const files = BUILTIN_TRACK_FILES.map((m) =>
  normalizeTrack(JSON.parse(readFileSync(join(root, m.file), 'utf8')))
);

test('findTrack(null) does not match Sofa Slalom via String(null)', () => {
  assert.equal(findTrackIn(null, files), null);
  assert.equal(findTrackIn('null', files), null);
  assert.equal(resolveSimBoot({ map: 'living' }, null, files).track, 'living-sofa');
  assert.equal(resolveSimBoot({ map: 'office' }, null, files).track, 'office-cubicles');
  assert.equal(resolveSimBoot({ map: 'room' }, null, files).track, 'room-practice');
  assert.equal(firstTrackForMap('gym', files).id, 'gym-court');
});

test('?map=&track= mismatch uses the track map; unknown map is not saved', () => {
  const mis = resolveSimBoot({ map: 'city', track: 'living-sofa' }, null, files);
  assert.equal(mis.map, 'living');
  assert.equal(mis.track, 'living-sofa');
  const unk = resolveSimBoot({ map: 'nope' }, { map: 'garage', track: 'garage-bench' }, files);
  assert.equal(unk.unknownMap, true);
  assert.equal(unk.save, false);
  assert.equal(unk.map, 'city');
  const rest = resolveSimBoot({}, { map: 'garage', track: 'garage-bench' }, files);
  assert.equal(rest.map, 'garage');
  assert.equal(rest.track, 'garage-bench');
  assert.equal(rest.restored, true);
  const early = resolveSimBoot({}, { map: 'garage', track: 'garage-bench' }, []);
  assert.equal(early.map, 'garage');
  assert.equal(early.track, 'garage-bench');
});

test('Mesa Zigzag start pad is at the zigzag, not City Loop origin', () => {
  const zig = files.find((t) => t.id === 'city-zigzag');
  const pad = startPad(zig);
  assert.ok(Math.hypot(pad.x - 210, pad.z + 345) < 40, 'near zigzag gate 0');
  assert.ok(Math.hypot(pad.x, pad.z - 20) > 200, 'not city historic pad');
  assert.ok(Number.isFinite(pad.yaw));
});

test('FLIPPED toast skips disarmed ground spawn', () => {
  assert.equal(shouldToastFlip({ upsideDown: true, armed: false, speed: 0, height: 0.2 }), false);
  assert.equal(shouldToastFlip({ upsideDown: true, armed: true, speed: 0, height: 0.2 }), false);
  assert.equal(shouldToastFlip({ upsideDown: true, armed: true, speed: 8, height: 2 }), true);
  assert.equal(shouldToastFlip({ upsideDown: false, armed: true, speed: 8, height: 2 }), false);
});

test('gym court lighting is bright enough to read the floor', () => {
  assert.ok(MAP_LOOKS.gym.hemi >= 0.5);
  assert.ok(MAP_LOOKS.gym.env >= 0.65);
  assert.ok(MAP_LOOKS.gym.bg >= 0.4);
});

test('sim.html wires picker rebuild, boot restore, and query-build no-save', () => {
  assert.ok(simSrc.includes('function setActiveTrack'));
  const active = simSrc.slice(
    simSrc.indexOf('function setActiveTrack'),
    simSrc.indexOf('function toggleStartMenu'),
  );
  assert.ok(active.includes('spawnTrackData') || active.includes('spawnCityRaces'), 'rebuild gates');
  assert.ok(active.includes('resetQuad()'), 'respawn on the picked track');
  assert.ok(active.includes('loadGhost') && active.includes('loadHostedGhost'), 'ghost load');
  assert.ok(simSrc.includes('resolveSimBoot') && simSrc.includes('loadSelected()'));
  const boot = simSrc.slice(
    simSrc.indexOf('function applyQueryBoot'),
    simSrc.indexOf('function publishTracks'),
  );
  assert.ok(boot.includes("applyBuild(decoded,{save:false,announce:true})"));
  assert.ok(boot.includes('boot.unknownMap'));
  assert.ok(boot.includes('already'), 'do not resetQuad/toast RESET on a no-op city reload');
  assert.ok(boot.includes('parseThreeDQuery') || boot.includes("q.get('3d')"));
  assert.ok(simSrc.includes('feel.noteFlip({'));
  assert.ok(simSrc.includes('armed:qp.armed'));
  assert.ok(!simSrc.includes('content/guides/'), 'do not edit guide HTML');
  assert.ok(simSrc.includes(SELECTED_TRACK_KEY) || simSrc.includes('loadSelected'));
});

test('L1 L2 L3 query boot is session-only and runs once', () => {
  assert.ok(simSrc.includes('let queryBooted=false') || simSrc.includes('let queryBooted = false'));
  assert.ok(simSrc.includes('if(queryBooted||!tracksReady)return') || simSrc.includes('if (queryBooted || !tracksReady) return'));
  assert.ok(simSrc.includes("setFlightMode(modeRaw,false)") || simSrc.includes('setFlightMode(modeRaw, false)'));
  assert.ok(simSrc.includes("setMap(d.map,d.track,{save:false})") || simSrc.includes("setMap(d.map, d.track, { save: false })"));
});

test('L5 Esc in a drill opens the Coach picker', () => {
  const esc = simSrc.slice(simSrc.indexOf("if(e.key==='Escape')"), simSrc.indexOf("if(e.key==='Tab')"));
  assert.ok(esc.includes('openCoachPicker()'));
  assert.ok(esc.includes('coach.cancel()'));
});

test('M2 leaderboard names render via textContent not innerHTML', () => {
  assert.ok(simSrc.includes('function renderBoardBody'));
  assert.ok(simSrc.includes("b.textContent=(i+1)+' '+sanitizePilotName(r.name)") || simSrc.includes('b.textContent=(i+1)+\' \'+sanitizePilotName(r.name)'));
  assert.equal(simSrc.includes('boardHtml('), false);
});
