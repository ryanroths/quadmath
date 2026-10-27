// Unit tests for W4 Coach: drill scoring + bronze/silver/gold progression.
// Node stdlib only: `node --test tools/test_sim_coach.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY } from '../sim-tracks.js';
import { BUILD_KEY } from '../sim-build.js';
import { WHOOP_KEY } from '../sim-whoop.js';
import { ROOM_KEY, planRoom, DEFAULT_ROOM } from '../sim-room.js';
import {
  COACH_KEY, GUIDE_DIR, GUIDE_FILES, DRILLS, TRAINER_SLALOM_GATES,
  drillById, emptyProgress, normalizeProgress, loadCoach, saveCoach,
  isUnlocked, unlockedIds, nextLockedId, applyAttempt, scoreDrill,
  scoreHoverHold, scoreYawSpin, scoreStraightLine, scoreGatePass,
  scoreDoorwayPass, scoreSplitS, scorePowerLoop,
  defaultSpec, attachDt, samplesToGhost, pickGhostLine, liveDelta,
  formatDelta, tipsFor, guideHref, roomDoorway, livingDoorway,
  attemptFinished, ladderRows, referenceSamples,
  drillSpawn, drillBox, facesTarget, headingTo,
} from '../sim-coach.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const coachSrc = readFileSync(join(root, 'sim-coach.js'), 'utf8');
const simSrc = existsSync(join(root, 'sim.html')) ? readFileSync(join(root, 'sim.html'), 'utf8') : '';
const slalom = JSON.parse(readFileSync(join(root, 'tracks/trainer-slalom.json'), 'utf8'));

function memStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    keys: () => [...mem.keys()],
  };
}

function hoverSamples(opts) {
  const o = opts || {};
  const t = o.target || { x: 0, y: 2.2, z: 0 };
  const n = o.n || 90;
  const dt = o.dt || 0.1;
  const jitter = o.jitter == null ? 0.05 : o.jitter;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      t: i * dt, dt,
      x: t.x + (o.dx || 0) + jitter * Math.sin(i * 0.3),
      y: t.y + (o.dy || 0),
      z: t.z + (o.dz || 0) + jitter * Math.cos(i * 0.3),
      vx: o.vx || 0, vy: 0, vz: 0,
      roll: 0, pitch: 0, yaw: 0, armed: true, crashed: !!o.crashed,
    });
  }
  return attachDt(out);
}

function yawSamples(opts) {
  const o = opts || {};
  const t = o.target || { x: 0, y: 1.8, z: 0 };
  const turns = o.turns == null ? 1 : o.turns;
  const drift = o.drift || 0;
  const out = [];
  for (let i = 0; i <= 80; i++) {
    const u = i / 80;
    out.push({
      t: u * 6, dt: 6 / 80,
      x: t.x + drift * u, y: t.y, z: t.z,
      vx: 0, vy: 0, vz: 0,
      roll: 0, pitch: 0, yaw: u * Math.PI * 2 * turns,
      armed: true, crashed: !!o.crashed,
    });
  }
  return attachDt(out);
}

function lineSamples(opts) {
  const o = opts || {};
  const spec = defaultSpec('straight-line');
  const a = spec.a, b = spec.b;
  const n = 50;
  const out = [];
  const reach = o.reach !== false;
  const weave = o.weave || 0;
  for (let i = 0; i <= n; i++) {
    const u = reach ? i / n : i / n * 0.4;
    out.push({
      t: u * (o.time || 4.4),
      x: a.x + (b.x - a.x) * u + weave * Math.sin(u * 8),
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
      vx: 0, vy: 0, vz: -4, roll: 0, pitch: -0.1, yaw: Math.PI,
      armed: true, crashed: !!o.crashed,
    });
  }
  return attachDt(out);
}

function gateSamples(opts) {
  const o = opts || {};
  const gates = defaultSpec('gate-pass').gates;
  const out = [{ t: 0, x: gates[0].x, y: gates[0].y, z: gates[0].z + 3, vx: 0, vy: 0, vz: -4, roll: 0, pitch: 0, yaw: Math.PI, armed: true }];
  const count = o.count == null ? gates.length : o.count;
  for (let i = 0; i < count; i++) {
    const g = gates[i];
    const off = o.centerOff || 0;
    out.push({
      t: 1 + i * 1.1,
      x: g.x + off, y: g.y, z: g.z,
      vx: 0, vy: 0, vz: -5, roll: 0, pitch: 0, yaw: 0, armed: true, crashed: !!o.crashed,
    });
  }
  return attachDt(out);
}

function doorSamples(opts) {
  const o = opts || {};
  const door = defaultSpec('doorway-pass').doorway;
  const off = o.off || 0;
  const out = [];
  for (let i = 0; i <= 30; i++) {
    const u = i / 30;
    out.push({
      t: u * 3.5,
      x: door.x + off, y: o.centerY ? door.y : door.y * 0.7, z: door.z - 5 + u * 8,
      vx: 0, vy: 0, vz: 4, roll: 0, pitch: 0, yaw: 0, armed: true, crashed: !!o.crashed,
    });
  }
  return attachDt(out);
}

function splitSamples(opts) {
  const o = opts || {};
  const out = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const roll = o.noInvert ? 0.1 : (u < 0.3 ? u / 0.3 * Math.PI : (u < 0.65 ? Math.PI : Math.PI * (1 - (u - 0.65) / 0.35)));
    const yaw = o.noInvert ? 0 : (u < 0.35 ? 0 : (u - 0.35) / 0.65 * Math.PI);
    out.push({
      t: u * 5, x: 0, y: 10 - u * 5, z: 2 - u * 6,
      vx: 0, vy: -2, vz: -2, roll, pitch: 0.1, yaw, armed: true, crashed: !!o.crashed,
    });
  }
  return attachDt(out);
}

function loopSamples(opts) {
  const o = opts || {};
  const frac = o.frac == null ? 1 : o.frac;
  const out = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const u = i / n * frac;
    const ang = u * Math.PI * 2;
    out.push({
      t: u * 5.2, x: 0, y: 8 + Math.sin(ang) * 4, z: Math.cos(ang) * 4,
      vx: 0, vy: 0, vz: 0, roll: 0, pitch: ang, yaw: 0, armed: true, crashed: !!o.crashed,
    });
  }
  return attachDt(out);
}

test('new storage key only; never writes old keys or WebFPV', () => {
  assert.equal(COACH_KEY, 'quadmathSimCoach');
  assert.ok(coachSrc.includes('setItem(COACH_KEY'));
  assert.ok(coachSrc.includes('Nothing here is copied from WebFPV') || coachSrc.includes('copied from WebFPV'));
  for (const banned of ['ryflyDroneType', 'ryflyRates', CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY, BUILD_KEY, WHOOP_KEY, ROOM_KEY]) {
    assert.equal(coachSrc.includes(banned), false, 'must not mention ' + banned);
  }
  const store = memStore();
  saveCoach({ medals: { 'hover-hold': 'gold' } }, store);
  assert.deepEqual(store.keys(), [COACH_KEY]);
  const loaded = loadCoach(store);
  assert.equal(loaded.medals['hover-hold'], 'gold');
});

test('unlock order is hover → yaw → line → gates → door → split-S → loop', () => {
  assert.deepEqual(DRILLS.map((d) => d.id), [
    'hover-hold', 'yaw-spin', 'straight-line', 'gate-pass',
    'doorway-pass', 'split-s', 'power-loop',
  ]);
  const p = emptyProgress();
  assert.deepEqual(unlockedIds(p), ['hover-hold']);
  assert.equal(isUnlocked(p, 'yaw-spin'), false);
  assert.equal(nextLockedId(p), 'yaw-spin');
  const goldHover = applyAttempt(p, { id: 'hover-hold', score: 90, medal: 'gold' });
  assert.deepEqual(goldHover.unlocked, ['yaw-spin']);
  assert.equal(isUnlocked(goldHover.progress, 'yaw-spin'), true);
  assert.equal(isUnlocked(goldHover.progress, 'straight-line'), false);
  const bronzeYaw = applyAttempt(goldHover.progress, { id: 'yaw-spin', score: 55, medal: 'bronze' });
  assert.deepEqual(bronzeYaw.unlocked, ['straight-line']);
});

test('medals never downgrade; best score can still rise', () => {
  let p = emptyProgress();
  p = applyAttempt(p, { id: 'hover-hold', score: 88, medal: 'gold' }).progress;
  p = applyAttempt(p, { id: 'hover-hold', score: 40, medal: 'none' }).progress;
  assert.equal(p.medals['hover-hold'], 'gold');
  assert.equal(p.best['hover-hold'].score, 88);
  p = applyAttempt(p, { id: 'hover-hold', score: 94, medal: 'gold' }).progress;
  assert.equal(p.best['hover-hold'].score, 94);
});

function approachThenHold() {
  const t = { x: 0, y: 2.2, z: 0 };
  const out = [];
  for (let i = 0; i < 20; i++) {
    const u = i / 19;
    out.push({
      t: i * 0.1, dt: 0.1,
      x: 7.2 * (1 - u), y: 0.2 + 2.0 * u, z: 0,
      vx: 0, vy: 0, vz: 0, roll: 0, pitch: 0, yaw: 0, armed: true,
    });
  }
  for (let i = 0; i < 90; i++) {
    out.push({
      t: 2 + i * 0.1, dt: 0.1,
      x: t.x, y: t.y, z: t.z,
      vx: 0, vy: 0, vz: 0, roll: 0, pitch: 0, yaw: 0, armed: true,
    });
  }
  return attachDt(out);
}

test('hover hold scores bronze/silver/gold from flight data', () => {
  const gold = scoreHoverHold(hoverSamples({ n: 90, jitter: 0.04 }));
  assert.equal(gold.pass, true);
  assert.equal(gold.medal, 'gold');
  assert.ok(gold.score >= 86, gold.score);
  const silver = scoreHoverHold(hoverSamples({ n: 75, jitter: 0.28 }));
  assert.equal(silver.pass, true);
  assert.ok(silver.medal === 'silver' || silver.medal === 'bronze', silver.medal);
  const bronze = scoreHoverHold(hoverSamples({ n: 55, jitter: 0.55 }));
  assert.equal(bronze.pass, true);
  assert.ok(bronze.medal === 'bronze' || bronze.medal === 'silver', bronze.medal);
  const fail = scoreHoverHold(hoverSamples({ n: 20, dx: 4, jitter: 0.8 }));
  assert.equal(fail.pass, false);
  assert.equal(fail.medal, 'none');
  const crash = scoreHoverHold(hoverSamples({ n: 90, crashed: true }));
  assert.equal(crash.medal, 'none');
});

test('H3 hover hold ignores approach; scripted perfect hold is gold', () => {
  const perfect = scoreHoverHold(hoverSamples({ n: 90, jitter: 0, dt: 0.1 }));
  assert.equal(perfect.medal, 'gold');
  assert.ok(perfect.rmsHoriz < 0.05, perfect.rmsHoriz);
  const approached = scoreHoverHold(approachThenHold());
  assert.equal(approached.pass, true);
  assert.equal(approached.medal, 'gold');
  assert.ok(approached.rmsHoriz < 0.2, approached.rmsHoriz);
});

test('H2 every drill spawn is inside the map and faces its target', () => {
  const targets = {
    'hover-hold': (s) => s.target,
    'yaw-spin': (s) => s.target,
    'straight-line': (s) => s.a,
    'gate-pass': (s) => s.gates[0],
    'doorway-pass': (s) => s.doorway,
    'split-s': () => ({ x: 0, z: 0 }),
    'power-loop': () => ({ x: 0, z: 0 }),
  };
  for (const d of DRILLS) {
    const spec = defaultSpec(d.id);
    const box = drillBox(d.id, spec);
    const spawn = drillSpawn(d.id, spec);
    const m = 1.4;
    assert.ok(Math.abs(spawn.x) <= box.w / 2 - m + 1e-6, d.id + ' x=' + spawn.x + ' w=' + box.w);
    assert.ok(Math.abs(spawn.z) <= box.d / 2 - m + 1e-6, d.id + ' z=' + spawn.z + ' d=' + box.d);
    const tgt = targets[d.id](spec);
    assert.equal(facesTarget(spawn, tgt), true, d.id + ' yaw=' + spawn.yaw + ' want=' + headingTo(spawn, tgt));
  }
  const gate = drillSpawn('gate-pass', defaultSpec('gate-pass'));
  assert.ok(gate.z < 18, 'gate-pass must spawn inside trainer z<=18, got ' + gate.z);
});

test('yaw spin, line, gates, doorway, split-S, loop have clear pass criteria', () => {
  const yawGold = scoreYawSpin(yawSamples({ turns: 1, drift: 0.05 }));
  assert.equal(yawGold.medal, 'gold');
  const yawFail = scoreYawSpin(yawSamples({ turns: 0.2, drift: 2.5 }));
  assert.equal(yawFail.medal, 'none');

  const lineGold = scoreStraightLine(lineSamples({ time: 4.4, weave: 0.05 }));
  assert.equal(lineGold.medal, 'gold');
  const lineFail = scoreStraightLine(lineSamples({ reach: false, weave: 1.8 }));
  assert.equal(lineFail.pass, false);

  const gateGold = scoreGatePass(gateSamples({}));
  assert.equal(gateGold.passes, TRAINER_SLALOM_GATES.length);
  assert.equal(gateGold.medal, 'gold');
  const gateBronze = scoreGatePass(gateSamples({ count: 4, centerOff: 0.3 }));
  assert.equal(gateBronze.pass, true);
  assert.ok(gateBronze.medal === 'bronze' || gateBronze.medal === 'silver', gateBronze.medal);

  const doorGold = scoreDoorwayPass(doorSamples({ off: 0, centerY: true }));
  assert.equal(doorGold.crossed, true);
  assert.equal(doorGold.medal, 'gold');
  const doorFail = scoreDoorwayPass(doorSamples({ off: 3.5 }));
  assert.equal(doorFail.pass, false);

  const splitGold = scoreSplitS(splitSamples({}), defaultSpec('split-s', { mode: 'acro' }));
  assert.equal(splitGold.inverted, true);
  assert.equal(splitGold.recovered, true);
  assert.ok(splitGold.medal === 'gold' || splitGold.medal === 'silver', splitGold.medal);
  const splitAngle = scoreSplitS(splitSamples({}), defaultSpec('split-s', { mode: 'angle' }));
  assert.notEqual(splitAngle.medal, 'gold');
  const splitFail = scoreSplitS(splitSamples({ noInvert: true }));
  assert.equal(splitFail.pass, false);

  const loopGold = scorePowerLoop(loopSamples({ frac: 1 }), defaultSpec('power-loop', { mode: 'acro' }));
  assert.equal(loopGold.medal, 'gold');
  const loopFail = scorePowerLoop(loopSamples({ frac: 0.25 }));
  assert.equal(loopFail.pass, false);
});

test('scoreDrill dispatches; attemptFinished trips on success or crash', () => {
  const h = scoreDrill('hover-hold', hoverSamples({ n: 90 }));
  assert.equal(h.id, 'hover-hold');
  assert.equal(h.medal, 'gold');
  assert.equal(attemptFinished('hover-hold', hoverSamples({ n: 90 }), defaultSpec('hover-hold'), false), true);
  assert.equal(attemptFinished('hover-hold', hoverSamples({ n: 10 }), defaultSpec('hover-hold'), false), false);
  assert.equal(attemptFinished('yaw-spin', yawSamples({}), defaultSpec('yaw-spin'), true), true);
});

test('ghost ribbon uses best run or bundled reference; live delta signs correctly', () => {
  const ref = pickGhostLine(emptyProgress(), 'straight-line');
  assert.equal(ref.kind, 'ref');
  assert.ok(ref.samples.length >= 2);
  let p = emptyProgress();
  const goldLine = lineSamples({ time: 4.4 });
  p = applyAttempt(p, { id: 'straight-line', score: 90, medal: 'gold' }, goldLine).progress;
  const best = pickGhostLine(p, 'straight-line');
  assert.equal(best.kind, 'best');
  const ghost = samplesToGhost(referenceSamples('straight-line'));
  const mid = ghost[Math.floor(ghost.length / 2)];
  const ahead = liveDelta(ghost, (mid[0] / 1000) - 0.4, { x: mid[1], y: mid[2], z: mid[3] });
  const behind = liveDelta(ghost, (mid[0] / 1000) + 0.4, { x: mid[1], y: mid[2], z: mid[3] });
  assert.ok(ahead.delta < 0, 'ahead should be negative');
  assert.ok(behind.delta > 0, 'behind should be positive');
  assert.equal(formatDelta(-0.32)[0], '−');
  assert.equal(formatDelta(0.41)[0], '+');
});

test('tips only link existing guide filenames from the repo', () => {
  const onDisk = new Set(readdirSync(join(root, 'content/guides')).filter((f) => f.endsWith('.html')));
  for (const f of GUIDE_FILES) {
    assert.ok(onDisk.has(f), 'missing guide ' + f);
    assert.equal(guideHref(f), GUIDE_DIR + f);
  }
  const kinds = ['crash', 'fail', 'gold', 'pass'];
  const ids = DRILLS.map((d) => d.id);
  for (const kind of kinds) {
    for (const id of ids) {
      const tips = tipsFor(kind, { id, mode: id === 'split-s' ? 'angle' : 'acro', input: 'keyboard' });
      assert.ok(tips.length >= 1, kind + ' ' + id);
      for (const t of tips) {
        assert.ok(onDisk.has(t.file), t.file);
        assert.ok(t.href.startsWith('content/guides/'));
        assert.ok(!t.href.includes('webfpv'), 'no WebFPV links');
      }
    }
  }
});

test('Tiny Trainer slalom gates match the shipped JSON; doorway matches Your room', () => {
  assert.equal(TRAINER_SLALOM_GATES.length, slalom.gates.length);
  for (let i = 0; i < slalom.gates.length; i++) {
    const a = TRAINER_SLALOM_GATES[i], b = slalom.gates[i];
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
    assert.equal(a.z, b.z);
    assert.equal(a.ry, b.ry);
    assert.equal(a.size, b.size);
  }
  const plan = planRoom(DEFAULT_ROOM);
  const door = roomDoorway(plan);
  assert.ok(Math.abs(door.z - plan.d / 2) < 1e-6);
  assert.ok(door.w > 1 && door.h > 3);
  const living = livingDoorway();
  assert.equal(living.z, 14);
  const hover = drillById('hover-hold');
  const yaw = drillById('yaw-spin');
  assert.equal(hover.map, 'trainer');
  assert.equal(yaw.map, 'room');
  assert.equal(drillById('doorway-pass').map, 'room');
  assert.equal(drillById('split-s').map, 'gym');
});

test('normalize rejects junk; ladder rows expose lock state', () => {
  const n = normalizeProgress({
    v: 9, ribbon: false, lastDrill: 'nope',
    medals: { 'hover-hold': 'platinum', 'yaw-spin': 'bronze' },
    best: { 'yaw-spin': { score: 120, medal: 'bronze' } },
    ghosts: { 'yaw-spin': [[0, 1, 2, 3], ['bad']] },
  });
  assert.equal(n.v, 1);
  assert.equal(n.ribbon, false);
  assert.equal(n.lastDrill, null);
  assert.equal(n.medals['hover-hold'], undefined);
  assert.equal(n.medals['yaw-spin'], 'bronze');
  assert.equal(n.best['yaw-spin'].score, 100);
  assert.equal(n.ghosts['yaw-spin'], undefined);
  const rows = ladderRows(emptyProgress());
  assert.equal(rows[0].unlocked, true);
  assert.equal(rows[1].unlocked, false);
});

test('sim.html wires Coach without touching old keys or guide HTML', () => {
  assert.ok(simSrc.includes('sim-coach.js'));
  assert.ok(simSrc.includes('id="menuCoach"'));
  assert.ok(simSrc.includes('id="coachHud"'));
  assert.ok(simSrc.includes('COACH_KEY'));
  assert.ok(simSrc.includes('createCoach'));
  assert.ok(!simSrc.includes('content/guides/'), 'guide hrefs stay in sim-coach.js');
  for (const k of ['ryflyRates', 'ryflyDroneType', 'quadmath_bestLap_', 'ghostStorageKey(', 'ROOM_KEY']) {
    assert.ok(simSrc.includes(k), 'must keep reading old key ' + k);
  }
});

test('M1 coach result actions use display block so Retry/Next/Menu show', () => {
  assert.ok(coachSrc.includes("actionsEl.style.display = 'block'"));
  assert.ok(coachSrc.includes("actionsEl.classList.add('show')"));
  assert.ok(simSrc.includes('#coachActions.show{display:block}') || simSrc.includes('#coachActions.show { display: block'));
});
