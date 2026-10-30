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
  RIG_WS, RIG_COURSES, MEDAL_FACTORS, medalTimes, medalTimesText, drillOpen, nextDrillId, ladderHtml,
  gateCrossing, onPad, chainStart, chainStep, chainResult, chainReadout, scoreChain,
} from '../sim-coach.js';
import { RIG_LINES, RIG_LINES_CORE } from '../sim-coach-lines.js';
import { RIG_PLAY, RIG_WS as MAPS_WS } from '../sim-maps.js';

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

test('unlock order: the Rig ladder tower → slit → crates → tunnel → loft → straight; the old maps\' (dev) hover → yaw → line → gates → door → split-S → loop', () => {
  assert.deepEqual(DRILLS.map((d) => d.id), [
    'tower-climb', 'pipe-slit', 'crate-slalom', 'tunnel', 'loft-dive', 'straight',
    'hover-hold', 'yaw-spin', 'straight-line', 'gate-pass',
    'doorway-pass', 'split-s', 'power-loop',
  ]);
  const p = emptyProgress();
  assert.deepEqual(unlockedIds(p), ['tower-climb', 'hover-hold']);
  assert.equal(isUnlocked(p, 'pipe-slit'), false);
  assert.equal(isUnlocked(p, 'yaw-spin'), false);
  assert.equal(nextLockedId(p), 'pipe-slit');
  // The Rig's: bronze on each opens the next, to the straight.
  const rig = ['tower-climb', 'pipe-slit', 'crate-slalom', 'tunnel', 'loft-dive', 'straight'];
  let q = emptyProgress();
  rig.forEach((id, i) => {
    assert.equal(isUnlocked(q, id), true, id);
    if (rig[i + 1]) assert.equal(isUnlocked(q, rig[i + 1]), false, rig[i + 1]);
    const a = applyAttempt(q, { id, score: 55, medal: 'bronze' });
    assert.deepEqual(a.unlocked, rig[i + 1] ? [rig[i + 1]] : [], id);
    q = a.progress;
  });
  assert.equal(isUnlocked(q, 'yaw-spin'), false, 'the Rig\'s medals open nothing on the old ladder');
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
    'tower-climb': (s) => s.gates[0],
    'pipe-slit': (s) => s.gates[0],
    'crate-slalom': (s) => s.gates[0],
    'tunnel': (s) => s.gates[0],
    'loft-dive': (s) => s.gates[0],
    'straight': (s) => s.gates[0],
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

// ---- Coach on the Rig ----

const RIG_IDS = ['tower-climb', 'pipe-slit', 'crate-slalom', 'tunnel', 'loft-dive', 'straight'];
const M = (v) => v / RIG_WS;
const PLANE = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] };
const inBox = (p, b, pad = 0) => [0, 1, 2].every((k) => p[k] >= b.min[k] - pad && p[k] <= b.max[k] + pad);
const inRoom = (p, pad = 0) => p[0] > -10 + pad && p[0] < 10 - pad && p[1] > pad && p[1] < 6 - pad && p[2] > -7.5 + pad && p[2] < 7.5 - pad;
const free = (p, pad = 0) => inRoom(p, pad) && !RIG_PLAY.boxes.some((b) => inBox(p, b, pad));
// A point of gate g's plane, metres: du, dv along its (u, v) from the centre.
function onPlane(g, du, dv) {
  const c = { x: M(g.x), y: M(g.y), z: M(g.z) };
  const [u, v] = PLANE[g.axis];
  c[u] += du;
  c[v] += dv;
  return [c.x, c.y, c.z];
}
function aperture(g, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      if (g.shape === 'ring') {
        const a = 2 * Math.PI * i / n, r = 0.999 * M(g.r) * j / n;
        out.push(onPlane(g, r * Math.cos(a), r * Math.sin(a)));
      } else {
        out.push(onPlane(g, 0.999 * M(g.hw) * (2 * i / n - 1), 0.999 * M(g.hh) * (2 * j / n - 1)));
      }
    }
  }
  return out;
}

test('Rig drills: six, on the Rig, open without ?dev=1; the old seven need it', () => {
  const rig = DRILLS.filter((d) => d.map === 'rig');
  assert.deepEqual(rig.map((d) => d.id), RIG_IDS);
  for (const d of rig) {
    assert.equal(d.chain, true, d.id);
    assert.equal(d.track, 'rig-freestyle', d.id + ': no loop gates under the drill');
    assert.ok(!d.dev && drillOpen(d.id, false), d.id);
    assert.ok(RIG_COURSES[d.id], d.id);
  }
  const old = DRILLS.filter((d) => d.map !== 'rig');
  assert.equal(old.length, 7);
  for (const d of old) {
    assert.equal(d.dev, true, d.id);
    assert.equal(drillOpen(d.id, false), false, d.id);
    assert.equal(drillOpen(d.id, true), true, d.id);
  }
  assert.equal(drillOpen('nope', true), false);
  // The ladder: the Rig's alone; with ?dev=1 the old maps' after it.
  assert.deepEqual(ladderRows(emptyProgress()).map((r) => r.id), RIG_IDS);
  assert.deepEqual(ladderRows(emptyProgress(), true).map((r) => r.id), DRILLS.map((d) => d.id));
  const html = ladderHtml(emptyProgress(), true, false);
  for (const d of old) assert.ok(!html.includes('data-drill="' + d.id + '"'), d.id + ' hidden');
  const dev = ladderHtml(emptyProgress(), true, true);
  for (const d of DRILLS) assert.ok(dev.includes('data-drill="' + d.id + '"'), d.id + ' listed with ?dev=1');
  assert.ok(dev.indexOf('Old maps') > dev.indexOf('data-drill="straight"'));
  for (const id of RIG_IDS) assert.ok(html.includes(medalTimesText(medalTimes(id))), id + ' shows its medal times');
  // Next: along its own ladder, never from one to the other.
  assert.equal(nextDrillId('tower-climb', false), 'pipe-slit');
  assert.equal(nextDrillId('straight', true), null);
  assert.equal(nextDrillId('hover-hold', false), null, 'closed without ?dev=1');
  assert.equal(nextDrillId('hover-hold', true), 'yaw-spin');
  assert.equal(nextDrillId('power-loop', true), null);
});

test('Rig drills: an old drill\'s saved progress stays in storage and counts, without ?dev=1', () => {
  const store = memStore();
  saveCoach({ medals: { 'hover-hold': 'gold', 'split-s': 'silver', tunnel: 'bronze' }, lastDrill: 'split-s',
    best: { 'hover-hold': { score: 91, medal: 'gold', at: 5 } } }, store);
  let p = loadCoach(store);
  assert.equal(p.medals['hover-hold'], 'gold');
  assert.equal(p.medals['split-s'], 'silver');
  assert.equal(p.lastDrill, 'split-s');
  // A Rig attempt saved over it keeps it.
  p = applyAttempt(p, { id: 'tower-climb', score: 70, medal: 'silver' }).progress;
  saveCoach(p, store);
  const back = JSON.parse(store.getItem(COACH_KEY));
  assert.equal(back.medals['hover-hold'], 'gold');
  assert.equal(back.best['hover-hold'].score, 91);
  assert.equal(back.medals['tower-climb'], 'silver');
  // Not on the ladder, and its unlock is the old ladder's own.
  assert.ok(!ladderRows(back).some((r) => r.id === 'hover-hold'));
  assert.equal(isUnlocked(back, 'yaw-spin'), true);
});

test('Rig drills: each gate is the feature\'s own gap, open, and tight to the geometry', () => {
  assert.equal(RIG_WS, MAPS_WS, 'the Rig\'s scale');
  const G = RIG_PLAY.gaps;
  const c = RIG_COURSES;
  // Every ring and aperture is open air (the quad's centre crosses there).
  for (const id of RIG_IDS) {
    for (const g of c[id].gates) {
      if (g.shape === 'pad') continue;
      for (const p of aperture(g)) assert.ok(free(p), `${id} ${g.name} blocked at ${p.map((v) => v.toFixed(3))}`);
    }
  }
  // The designed gaps: the aperture is the gap, a box just past each edge.
  const tight = (g, edges) => {
    for (const [du, dv] of edges) {
      const p = onPlane(g, du, dv);
      assert.ok(RIG_PLAY.boxes.some((x) => inBox(p, x, 1e-6)), `${g.name}: open past its edge at ${du}, ${dv}`);
    }
  };
  const slots = c['crate-slalom'].gates;
  assert.deepEqual(slots.map((g) => +(2 * M(g.hw)).toFixed(4)), [...G.crates]);
  for (const g of slots) {
    assert.equal(M(g.x), 9);
    const wall = RIG_PLAY.boxes.find((b) => b.feature === 'crates' && Math.abs((b.min[2] + b.max[2]) / 2 - M(g.z)) < 1e-6);
    assert.ok(wall, g.name + ' on a wall\'s mid-plane');
    assert.ok(M(g.y) - M(g.hh) >= 0 && M(g.y) + M(g.hh) <= 2 + 1e-9, g.name + ' within the 2 m wall');
    tight(g, [[M(g.hw) + 0.005, 0], [-M(g.hw) - 0.005, 0]]);
  }
  const [over, slit, under] = c['pipe-slit'].gates;
  assert.equal(+(2 * M(slit.hw)).toFixed(4), G.pipes);
  assert.equal(M(slit.x), RIG_PLAY.drop);
  const pipe = RIG_PLAY.boxes.find((b) => b.part === 'pipe');
  assert.ok(M(slit.y) > pipe.min[1] && M(slit.y) < pipe.max[1], 'the slit plane at the pipes\' height');
  tight(slit, [[M(slit.hw) + 0.005, 0], [-M(slit.hw) - 0.005, 0]]);
  assert.ok(M(over.y) - M(over.r) > pipe.max[1] && M(under.y) + M(under.r) < pipe.min[1], 'over the pipes, then under');
  const [tin, tout] = c.tunnel.gates;
  const roof = RIG_PLAY.boxes.find((b) => b.feature === 'tunnel' && b.part === 'roof');
  assert.ok(Math.abs(M(tin.x) - roof.max[0]) < 1e-9 && Math.abs(M(tout.x) - roof.min[0]) < 1e-9, 'at the bore\'s two mouths');
  for (const g of [tin, tout]) {
    assert.equal(+(2 * M(g.hw)).toFixed(4), G.tunnel);
    assert.equal(+(2 * M(g.hh)).toFixed(4), G.tunnel);
    tight(g, [[M(g.hw) + 0.005, 0], [-M(g.hw) - 0.005, 0], [0, M(g.hh) + 0.005], [0, -M(g.hh) - 0.005]]);
  }
  const [hole, land] = c['loft-dive'].gates;
  assert.deepEqual([+(2 * M(hole.hw)).toFixed(4), +(2 * M(hole.hh)).toFixed(4)], [...G.hole]);
  assert.equal(M(hole.x), RIG_PLAY.drop);
  tight(hole, [[M(hole.hw) + 0.005, 0], [-M(hole.hw) - 0.005, 0], [0, M(hole.hh) + 0.005], [0, -M(hole.hh) - 0.005]]);
  // The tower: bays 1-3 between its decks inside the posts, then over deck 3;
  // up and back down.
  const tower = c['tower-climb'].gates;
  assert.deepEqual(tower.map((g) => g.name), ['bay 1', 'bay 2', 'bay 3', 'over deck 3', 'bay 3', 'bay 2', 'bay 1']);
  const decks = RIG_PLAY.boxes.filter((b) => b.part === 'deck').sort((a, b) => a.min[1] - b.min[1]);
  const posts = RIG_PLAY.boxes.filter((b) => b.part === 'post');
  const z0 = Math.max(...posts.map((b) => b.max[2]).filter((z) => z < 5.1)), z1 = Math.min(...posts.map((b) => b.min[2]).filter((z) => z > 5.1));
  tower.slice(0, 3).forEach((g, i) => {
    assert.ok(M(g.y) - M(g.hh) >= (i ? decks[i - 1].max[1] : 0) - 1e-9 && M(g.y) + M(g.hh) <= decks[i].min[1] + 1e-9, g.name + ' between decks');
    assert.ok(M(g.z) - M(g.hw) >= z0 - 1e-9 && M(g.z) + M(g.hw) <= z1 + 1e-9, g.name + ' inside the posts');
    assert.ok(M(g.x) > decks[i].min[0] && M(g.x) < decks[i].max[0], g.name + ' in the tower');
  });
  assert.ok(M(tower[3].y) - M(tower[3].hh) >= decks[2].max[1] - 1e-9 && M(tower[3].y) + M(tower[3].hh) <= 6 + 1e-9, 'over deck 3, under the ceiling');
  // The straight: out through its first ring, round a far one, back through the first.
  const st = c.straight.gates;
  assert.equal(st[0], st[2]);
  assert.ok(M(st[1].x) - M(st[0].x) >= 10, 'down most of the 15 m straight');
  assert.equal(c.straight.limit, 8);
  // The pads: on a free floor or the loft top; the landing under the loft.
  for (const id of RIG_IDS) {
    const sp = drillSpawn(id);
    const base = M(sp.y) - M(0.2);
    for (let a = 0; a < 8; a++) {
      const p = [M(sp.x) + 0.33 * Math.cos(a), base + 0.05, M(sp.z) + 0.33 * Math.sin(a)];
      assert.ok(free(p), `${id} pad blocked at ${p}`);
      assert.ok(free([p[0], base + 0.4, p[2]]), `${id} pad roofed at ${p}`);
    }
    const under = [M(sp.x), base - 0.03, M(sp.z)];
    assert.ok(base < 1e-9 || RIG_PLAY.boxes.some((b) => inBox(under, b)), id + ' pad on a surface');
    assert.ok(facesTarget(sp, c[id].gates[0]), id + ' faces its first gate');
  }
  assert.equal(land.shape, 'pad');
  const loft = RIG_PLAY.boxes.filter((b) => b.feature === 'loft');
  assert.ok(loft.some((b) => inBox([M(land.x), 2.75, M(land.z)], b)), 'the landing pad is under the loft');
  assert.ok(free([M(land.x), 0.3, M(land.z)]), 'and clear over it');
  assert.ok(M(drillSpawn('loft-dive').y) > 2.8, 'the loft dive starts on the loft');
});

test('Rig drills: medal times are the flown line\'s at 1x / 1.3x / 1.7x; the straight\'s bronze under 8 s', () => {
  assert.deepEqual({ ...MEDAL_FACTORS }, { gold: 1, silver: 1.3, bronze: 1.7 });
  for (const id of RIG_IDS) {
    const line = RIG_LINES[id];
    assert.ok(line && line.ms > 1000, id + ' has a flown line');
    const t = medalTimes(id);
    assert.equal(t.gold, line.ms / 1000, id);
    assert.equal(t.silver, Math.round(line.ms * 1.3) / 1000, id);
    assert.equal(t.bronze, Math.min(RIG_COURSES[id].limit ? RIG_COURSES[id].limit * 1000 : Infinity, Math.round(line.ms * 1.7)) / 1000, id);
    assert.deepEqual(defaultSpec(id).times, t);
    assert.equal(defaultSpec(id).timeout, Math.ceil(line.ms * 3 / 1000) + 5);
    assert.equal(line.splits.length, RIG_COURSES[id].gates.length);
    assert.ok(Math.abs(line.splits[line.splits.length - 1] - line.ms) <= 1, id + ': the last split is the time');
  }
  assert.ok(medalTimes('straight').bronze < 8, 'the straight: there and back under 8 s for bronze');
  assert.equal(medalTimes('straight').bronze, Math.round(RIG_LINES.straight.ms * 1.7) / 1000, 'and that is its 1.7x');
  assert.equal(medalTimes('hover-hold'), null);
  assert.ok(/^Gold \d+\.\d\d · silver \d+\.\d\d · bronze \d+\.\d\d s$/.test(medalTimesText(medalTimes('tunnel'))));
});

// A synthetic flight on the tunnel: up off the pad at 1 m/s, then west down
// the bore at v m/s. Samples every 10 ms, world units, t from the arm.
function tunnelRun(v, opts) {
  const o = opts || {};
  const sp = drillSpawn('tunnel');
  const y0 = 0.01, out = [];
  let t = 0;
  const push = (x, y, z, vx) => { out.push({ t, x: x * RIG_WS, y: y * RIG_WS, z: z * RIG_WS, vx: vx * RIG_WS, vy: 0, vz: 0, roll: 0, pitch: 0, armed: true, crashed: false }); t += 0.01; };
  const dir = o.reverse ? 1 : -1;
  const xs = o.reverse ? -1.5 : M(sp.x), xe = o.reverse ? 6.0 : -1.5;
  const zc = o.z == null ? 5.6 : o.z, yc = o.y == null ? 1.2 : o.y;
  for (let k = 0; k < 20; k++) push(xs, y0, zc, 0);
  for (let y = y0; y < yc; y += 0.01) push(xs, y, zc, 0);
  for (let x = xs; dir < 0 ? x > xe : x < xe; x += dir * v * 0.01) push(x, yc, zc, dir * v);
  return out;
}

test('Rig drills: the chain scores lift-off to the last gate, in order, inside each aperture', () => {
  const spec = defaultSpec('tunnel');
  const T = spec.times;
  // Lift-off to out: (1.2 - 0.01 - 0.1) m up at 1 m/s, then 6.8 - 0.05 m west.
  const want = (v) => (1.2 - 0.01 - 0.1) + (M(drillSpawn('tunnel').x) - 0.05) / v;
  const vFor = (time) => (M(drillSpawn('tunnel').x) - 0.05) / (time - (1.2 - 0.01 - 0.1));
  const cases = [[0.95, 'gold'], [1.2, 'silver'], [1.6, 'bronze'], [1.9, 'none']];
  for (const [k, medal] of cases) {
    const v = vFor(T.gold * k);
    const r = scoreChain(tunnelRun(v), spec);
    assert.equal(r.done, true, k + 'x');
    assert.equal(r.passes, 2);
    assert.ok(Math.abs(r.time - want(v)) < 0.012, `${k}x: ${r.time} vs ${want(v)}`);
    assert.equal(r.medal, medal, k + 'x');
    assert.equal(r.pass, true, k + 'x completes');
    assert.ok(Math.abs(r.lift - (0.2 + 0.1)) < 0.012, 'lift-off 0.1 m up: ' + r.lift);
  }
  // Scores: gold 90, 5 a 10% off it; faster than gold scores higher still.
  const score = (k) => scoreChain(tunnelRun(vFor(T.gold * k)), spec).score;
  assert.ok(Math.abs(score(1) - 90) <= 0.3 && Math.abs(score(1.3) - 75) <= 0.3 && Math.abs(score(1.7) - 55) <= 0.3, [score(1), score(1.3), score(1.7)].join(' '));
  assert.ok(score(0.9) > score(0.95) && score(0.95) > score(1), 'faster is better past gold');
  assert.equal(score(0.75), 100);
  const fast = scoreChain(tunnelRun(vFor(T.gold * 0.95)), spec);
  // Off the bore (5 cm too high is still in; 16 cm is not): no pass.
  assert.equal(scoreChain(tunnelRun(3, { y: 1.25 }), spec).passes, 2);
  const high = scoreChain(tunnelRun(3, { y: 1.36 }), spec);
  assert.equal(high.passes, 0);
  assert.equal(high.done, false);
  assert.equal(high.medal, 'none');
  // Backwards: out's plane first counts for nothing, then in: 1 of 2.
  const back = scoreChain(tunnelRun(3, { reverse: true }), spec);
  assert.equal(back.passes, 1);
  assert.equal(back.done, false);
  // A crash: no medal, half the score.
  const run = tunnelRun(vFor(T.gold * 0.95));
  run[run.length - 5].crashed = true;
  const crashed = scoreChain(run, spec);
  assert.equal(crashed.done, true);
  assert.equal(crashed.pass, false);
  assert.equal(crashed.medal, 'none');
  assert.ok(Math.abs(crashed.score - fast.score / 2) <= 0.1, 'a crash halves it: ' + crashed.score);
  // Scored sample by sample, as the page does, it is the same; and the HUD.
  const st = chainStart();
  const runs = tunnelRun(vFor(T.gold * 1.2));
  assert.equal(chainReadout(st, spec, 0).detail.startsWith('LIFT OFF TO START'), true);
  for (const p of runs) chainStep(st, spec, p);
  assert.deepEqual(chainResult(st, spec), scoreChain(runs, spec));
  assert.equal(chainReadout(st, spec, 99).line, 'DONE');
  assert.equal(attemptFinished('tunnel', runs, spec, false), true);
  assert.equal(attemptFinished('tunnel', runs.slice(0, 200), spec, false), false);
  assert.equal(scoreDrill('tunnel', runs).medal, 'silver');
});

test('Rig drills: gate planes, rings and the landing pad', () => {
  const ring = RIG_COURSES.straight.gates[0];
  const at = (x, y, z) => ({ x: x * RIG_WS, y: y * RIG_WS, z: z * RIG_WS });
  assert.ok(Math.abs(gateCrossing(at(-4.5, 1.2, -5.6), at(-4.25, 1.2, -5.6), ring) - 0.6) < 1e-9, 'crossed 0.6 of the way');
  assert.ok(gateCrossing(at(-4.25, 1.3, -5.5), at(-4.5, 1.3, -5.5), ring) > 0, 'either way');
  assert.equal(gateCrossing(at(-4.5, 1.2, -5.0), at(-4.25, 1.2, -5.0), ring), -1, '0.6 m off: outside the ring');
  assert.equal(gateCrossing(at(-4.5, 1.2, -5.6), at(-4.4, 1.2, -5.6), ring), -1, 'short of the plane');
  // A sample on the plane is on its + side: a crossing counts once, which
  // ever step it falls in.
  const onIt = at(-4.35, 1.2, -5.6);
  assert.ok(gateCrossing(at(-4.5, 1.2, -5.6), onIt, ring) >= 0, 'from below, the step onto the plane crosses');
  assert.equal(gateCrossing(onIt, at(-4.2, 1.2, -5.6), ring), -1, 'and the step on from it does not');
  assert.equal(gateCrossing(at(-4.2, 1.2, -5.6), onIt, ring), -1, 'from above, the step onto it does not');
  assert.ok(gateCrossing(onIt, at(-4.5, 1.2, -5.6), ring) >= 0, 'the step off it below does');
  const pad = RIG_COURSES['loft-dive'].gates[1];
  const sit = { ...at(-9.05, 0.01, -4.15), vx: 0, vy: 0, vz: 0, roll: 0, pitch: 0 };
  assert.equal(onPad(sit, pad), true);
  assert.equal(onPad({ ...sit, vy: -0.6 * RIG_WS }, pad), false, 'still moving');
  assert.equal(onPad({ ...sit, y: 0.1 * RIG_WS }, pad), false, 'above it');
  assert.equal(onPad({ ...sit, x: -8.6 * RIG_WS }, pad), false, 'off it');
  assert.equal(onPad({ ...sit, roll: 1.2 }, pad), false, 'on its side');
});

test('Rig drills: the shipped lines are flown on the bf core again, to the same times, touching nothing', { timeout: 5 * 60 * 1000 }, async () => {
  const coreVersion = readFileSync(join(root, 'vendor/sim-core/VERSION'), 'utf8').trim();
  assert.equal(RIG_LINES_CORE, coreVersion, 'flown on the vendored sim-core: re-fly with tools/fly_coach_rig.mjs --write');
  const { flyAll } = await import('./fly_coach_rig.mjs');
  const all = await flyAll();
  for (const id of RIG_IDS) {
    const { flight, line } = all[id];
    const shipped = RIG_LINES[id];
    assert.equal(flight.contacts.length, 0, id + ': no touch from the arm');
    assert.equal(flight.result.done, true, id);
    assert.ok(Math.abs(line.ms - shipped.ms) <= 2, `${id}: flown ${line.ms} ms, shipped ${shipped.ms} ms`);
    line.splits.forEach((s, i) => assert.ok(Math.abs(s - shipped.splits[i]) <= 2, `${id} split ${i}: ${s} vs ${shipped.splits[i]}`));
    assert.equal(line.line.length, shipped.line.length, id + ' ribbon');
    // The flight's own time is gold: the line is the gold run.
    assert.equal(chainResult(chainStart(), defaultSpec(id)).medal, 'none');
    const r = scoreChain(flight.samples, defaultSpec(id));
    assert.equal(r.medal, 'gold', id);
    assert.ok(r.time <= medalTimes(id).gold, id);
  }
  // The ghost ribbon is the flown line, from its lift-off.
  for (const id of RIG_IDS) {
    const g = pickGhostLine(emptyProgress(), id);
    assert.equal(g.kind, 'ref');
    assert.deepEqual(g.samples, RIG_LINES[id].line);
    assert.ok(g.samples.length >= 2 && g.samples.length <= 200);
    assert.equal(referenceSamples(id).length, g.samples.length);
  }
});

test('sim.html: Coach launches only open drills, on the bf core\'s clock, the Rig gates on the look', () => {
  const html = simSrc.replace(/\r\n/g, '\n');
  const launch = html.slice(html.indexOf('function launchCoachDrill(id){'), html.indexOf('function openCoachPicker(){'));
  assert.ok(launch.includes("if(!coach.isOpen(id)){toast('OLD-MAP DRILL — ?dev=1 ONLY');openCoachPicker();return;}"));
  assert.ok(launch.indexOf('coach.isOpen(id)') < launch.indexOf('setMap(d.map,d.track,{save:false})'), 'checked before the map changes');
  assert.ok(html.includes('dev:DEV_UI,'), 'the coach knows ?dev=1');
  assert.ok(html.includes("rigGate(mesh,col){decorateRigGate(mesh,col,vibeFor('rig'));},"));
  assert.ok(html.includes('simMs:cs.flightMs,'), 'drill times on the core\'s flight clock');
  assert.ok(html.includes('const next=coach.nextId(coach.currentId());'));
  assert.ok(!html.includes("'hover-hold','yaw-spin','straight-line'"), 'no hard-coded ladder');
  assert.ok(coachSrc.includes("if (!drillOpen(id, dev)) {"), 'startDrill refuses a closed drill too');
});
