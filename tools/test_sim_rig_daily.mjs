// The generated Daily and Boards (sim-retention.js rigCourseFor,
// rigWeeklyCourse, dailyTrackFor, weeklyTrackFor): the Rig's six Coach drills
// chained by the day's seed, the House Loop on the days between, and every
// loop the generator can draw flown by the Coach autopilot on the bf core
// (tools/rig_daily.mjs). Every Daily of 14 days and Boards for their weeks
// flown as the page runs them, three laps.
// node --test tools/test_sim_rig_daily.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RIG_GEN_DAILY_FROM, RIG_GEN_WEEKLY_FROM, RIG_DAILY_FROM, RIG_SEGMENTS, RIG_LOOP_MS, RIG_START_MS, RIG_DAILY_SEGMENTS,
  RIG_DAILY_LAP_MS, RIG_DAILY_FRESH, RIG_WEEKLY_SEGMENTS, RIG_WEEKLY_LAP_MS, HOUSE_LINE_GATES, DAILY_LINE_TRACKS,
  PHYS_VER, DAILY_GEN, dailyMapFor, rigCourseFor, rigWeeklyCourse, rigLapMs, rigLoopKey, rigCourseTrack,
  dailyTrackFor, weeklyTrackFor, dailyLineFor, dailyLinePool, dailyTrackValid, addUtcDays, utcWeekId, weekMonday,
  countGhostLaps, normalizeSubmit,
} from '../sim-retention.js';
import { RIG_COURSES } from '../sim-coach.js';
import {
  SEGMENT_IDS, loadLinks, measure, retentionBlock, BLOCK_OPEN, BLOCK_CLOSE, flyCourses, chainGates, segmentPad, allLoops,
} from './rig_daily.mjs';
import { WS } from '../sim-core-adapter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LINKS = loadLinks();
const days = (from, n) => Array.from({ length: n }, (_, i) => addUtcDays(from, i));
const m = (v) => v / WS;

test('PHYS_VER and the generator version are unchanged; sim-retention.js still imports nothing, for the Worker', () => {
  assert.equal(PHYS_VER, 7);
  assert.equal(DAILY_GEN, 2);
  const src = readFileSync(join(root, 'sim-retention.js'), 'utf8');
  assert.ok(!/^import /m.test(src), 'no imports');
  // The Worker bundles it as before: weeklyTrackFor (now the generator) and
  // normalizeSubmit, from the one file.
  const worker = readFileSync(join(root, 'workers/sim-leaderboard/src/index.js'), 'utf8');
  assert.match(worker, /from '\.\.\/\.\.\/\.\.\/sim-retention\.js'/);
  assert.match(worker, /weeklyTrackFor/);
  assert.match(worker, /normalizeSubmit/);
});

test('past days and weeks keep their tracks', () => {
  // Fingerprints of every Daily, Daily Line and week of 2026 before the cut-over,
  // taken on main before the generator.
  const h = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
  const past = days('2026-01-01', 307);
  assert.equal(past[past.length - 1], '2026-11-03');
  assert.ok(past[past.length - 1] < RIG_GEN_DAILY_FROM);
  assert.equal(h(past.map((d) => dailyTrackFor(d))), '8a9f86c64661cd8b25a09c2aa63a8b942a6e91a756d479c6921f64a51e8e3c6e');
  assert.equal(h(past.map((d) => dailyLineFor(d))), '1e09ba68e7e66658265a5be7362e0518393d336a0d8d6784484556e313450609');
  const weeks = Array.from({ length: 45 }, (_, i) => '2026-W' + String(i + 1).padStart(2, '0'));
  assert.ok(weeks[weeks.length - 1] < RIG_GEN_WEEKLY_FROM);
  assert.equal(h(weeks.map((w) => weeklyTrackFor(w))), '09f14fbbdc127f8a7db582f5d0d72c86781ed355013d5c95881861c3e01b598a');
  // The cut-overs: the day and the week after the Rig Loop's.
  assert.ok(RIG_GEN_DAILY_FROM > RIG_DAILY_FROM);
  assert.equal(utcWeekId(Date.parse(weekMonday(RIG_GEN_WEEKLY_FROM))), RIG_GEN_WEEKLY_FROM);
});

test('the segments are the six Coach drills: every drill gate has a ring in its opening', () => {
  const of = { 'tower-climb': 'tower', 'pipe-slit': 'pipes', 'crate-slalom': 'crates', tunnel: 'tunnel', 'loft-dive': 'loft', straight: 'straight' };
  assert.deepEqual(Object.values(of).sort(), [...SEGMENT_IDS].sort());
  for (const [drill, seg] of Object.entries(of)) {
    const rings = RIG_SEGMENTS[seg].gates.map((g) => [m(g.x), m(g.y), m(g.z)]);
    for (const g of RIG_COURSES[drill].gates) {
      if (g.shape === 'pad') continue; // the loft dive's landing: a race leaves low under the loft instead
      const c = [m(g.x), m(g.y), m(g.z)], k = { x: 0, y: 1, z: 2 }[g.axis];
      const reach = g.shape === 'ring' ? m(g.r) : Math.hypot(m(g.hw), m(g.hh));
      assert.ok(rings.some((p) => Math.abs(p[k] - c[k]) < 1e-3 && Math.hypot(...p.map((v, i) => (i === k ? 0 : v - c[i]))) <= reach + 1e-3),
        `${drill}: ${g.name} has a ring in its opening`);
    }
  }
  // A race ring is entered once: the tower is its climb, bays 1 to 3 and over
  // the top; the straight's way back has its own ring beside the way out.
  assert.equal(RIG_SEGMENTS.tower.gates.length, 5);
  assert.equal(RIG_SEGMENTS.straight.gates.length, 4);
});

test('every loop the generator can draw, flown again: two laps, clean, its lap the data\'s to the millisecond', { timeout: 20 * 60 * 1000 }, async () => {
  for (const id of SEGMENT_IDS) {
    assert.deepEqual(RIG_SEGMENTS[id].gates.map((g) => ({ ...g })), chainGates([id]).map(({ x, y, z, ry, size }) => ({ x, y, z, ry, size })), id + ' gates');
    const pad = segmentPad(id);
    assert.deepEqual(RIG_SEGMENTS[id].start, { x: Math.round(pad.p[0] * WS * 1e4) / 1e4, y: Math.round(pad.p[1] * WS * 1e4) / 1e4, z: Math.round(pad.p[2] * WS * 1e4) / 1e4 }, id + ' start');
  }
  // A link for every ordered pair; every loop of 3 to 5 segments.
  assert.equal(Object.keys(LINKS).length, 30);
  assert.equal(allLoops().length, 40 + 90 + 144);
  // Every loop flown, two laps, a fresh core each, on threads
  // (tools/rig_daily.mjs measure): the clean ones, their laps and the first
  // lap's extra are the data's to the millisecond (the bf core is
  // deterministic). A loop that is not clean is not in RIG_LOOP_MS, so it is
  // never drawn.
  const times = await measure(LINKS);
  assert.deepEqual(Object.keys(times.loops), Object.keys(RIG_LOOP_MS));
  assert.equal(times.startMs, RIG_START_MS);
  assert.ok(Object.keys(RIG_LOOP_MS).length >= 250, Object.keys(RIG_LOOP_MS).length + ' clean loops; not clean: ' + times.unclean.join('; '));
  const src = readFileSync(join(root, 'sim-retention.js'), 'utf8').replace(/\r\n/g, '\n');
  const block = src.slice(src.indexOf(BLOCK_OPEN), src.indexOf(BLOCK_CLOSE) + BLOCK_CLOSE.length);
  assert.equal(block, retentionBlock(times), 'node tools/rig_daily.mjs --write');
});

test('14 days from the cut-over: 7 Rig days, 7 courses apart, and 7 House Loop days; any 14 days the same', () => {
  const window = days(RIG_GEN_DAILY_FROM, 14);
  assert.deepEqual(window.map(dailyMapFor), Array.from({ length: 14 }, (_, i) => (i % 2 ? 'house' : 'rig')));
  const rig = window.filter((d) => dailyMapFor(d) === 'rig').map((d) => rigCourseFor(d));
  assert.equal(new Set(rig.map(rigLoopKey)).size, 7, 'seven different Rig loops');
  for (const d of window) {
    const t = dailyTrackFor(d);
    assert.ok(dailyTrackValid(t), d);
    assert.equal(t.id, 'daily-' + d);
    if (dailyMapFor(d) === 'house') {
      assert.equal(t.map, 'house');
      assert.equal(t.line, 'house-loop');
      assert.deepEqual(t.gates, HOUSE_LINE_GATES['house-loop'].gates);
      continue;
    }
    const ids = rigCourseFor(d);
    assert.ok(ids.length >= RIG_DAILY_SEGMENTS[0] && ids.length <= RIG_DAILY_SEGMENTS[1], d + ' ' + ids.length + ' segments');
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(rigLapMs(ids) >= RIG_DAILY_LAP_MS[0] && rigLapMs(ids) + RIG_START_MS <= RIG_DAILY_LAP_MS[1], d + ' lap ' + rigLapMs(ids));
    assert.deepEqual(t, rigCourseTrack(ids, t.id, t.name));
    assert.equal(t.course, ids.join('>'));
  }
  // Seeded by the day: the same day, the same course; a Rig day's loop is none
  // of the six before it, so any 14 days running hold 7 different courses.
  assert.deepEqual(dailyTrackFor(RIG_GEN_DAILY_FROM), dailyTrackFor(RIG_GEN_DAILY_FROM));
  assert.equal(RIG_DAILY_FRESH, 6);
  for (const from of [addUtcDays(RIG_GEN_DAILY_FROM, 1), addUtcDays(RIG_GEN_DAILY_FROM, 9), addUtcDays(RIG_GEN_DAILY_FROM, 400)]) {
    const loops = days(from, 14).filter((d) => dailyMapFor(d) === 'rig').map((d) => rigLoopKey(rigCourseFor(d)));
    assert.equal(loops.length, 7);
    assert.equal(new Set(loops).size, 7, 'from ' + from);
  }
  // The House Loop joins the Daily pool on the cut-over day.
  const h = DAILY_LINE_TRACKS.find((x) => x.id === 'house-loop');
  assert.ok(h && h.map === 'house' && h.gates === 20 && h.from === RIG_GEN_DAILY_FROM);
  assert.ok(!dailyLinePool(addUtcDays(RIG_GEN_DAILY_FROM, -1)).includes(h));
  assert.ok(dailyLinePool(RIG_GEN_DAILY_FROM).includes(h));
  const file = JSON.parse(readFileSync(join(root, 'tracks/house-loop.json'), 'utf8'));
  assert.deepEqual(HOUSE_LINE_GATES['house-loop'].gates, file.gates);
  assert.deepEqual(HOUSE_LINE_GATES['house-loop'].start, file.start);
});

test('Boards: the Rig only, five segments, seeded by the week', () => {
  for (let k = 0; k < 8; k++) {
    const w = utcWeekId(Date.parse(weekMonday(RIG_GEN_WEEKLY_FROM)) + k * 7 * 86400000);
    const t = weeklyTrackFor(w), ids = rigWeeklyCourse(w);
    assert.equal(t.map, 'rig');
    assert.equal(ids.length, RIG_WEEKLY_SEGMENTS);
    assert.equal(t.course, ids.join('>'));
    assert.ok(rigLapMs(ids) + RIG_START_MS <= RIG_WEEKLY_LAP_MS, w);
    assert.ok(dailyTrackValid(t), w);
    assert.deepEqual(weeklyTrackFor(w), t);
  }
});

// Flown: each course from its first segment's pad, `laps` laps, all at once
// (flyCourses). Every lap a clean one.
async function flown(courses, laps) {
  const out = [];
  await flyCourses(courses.map((ids) => ({ ids, laps })), LINKS, (k, f) => { out[k] = f; });
  return out.map((f, k) => {
    const name = courses[k].join('>');
    assert.equal(f.contacts.length, 0, name + ' touched the Rig');
    assert.ok(!f.stalled, name + ' stalled');
    assert.deepEqual(f.misses, [], name + ' missed a gate');
    assert.equal(f.laps.length, laps, name + ' laps');
    return f;
  });
}
// The flight as a ghost the page would record (20 Hz, ms from the run's start
// on gate 0 to the end of its third lap), and its time.
function ghostOf(f) {
  const zero = f.passes.filter((p) => p.i === 0).map((p) => p.t);
  const t0 = zero[0], t1 = zero[3];
  const samples = [];
  let next = t0;
  for (const s of f.samples) {
    if (s.t < t0 - 1e-9 || s.t > t1 + 1e-9) continue;
    if (s.t + 1e-9 >= next || s === f.samples[f.samples.length - 1]) { samples.push([Math.round((s.t - t0) * 1000), s.x, s.y, s.z, 0, 0, 0, 0]); next += 0.05; }
  }
  return { samples, timeMs: Math.round((t1 - t0) * 1000) };
}

test('the autopilot flies every Daily of the 14 days, three laps each, every lap 20 to 40 s', { timeout: 10 * 60 * 1000 }, async () => {
  const rig = days(RIG_GEN_DAILY_FROM, 14).filter((x) => dailyMapFor(x) === 'rig');
  const flights = await flown(rig.map((d) => dailyTrackFor(d).course.split('>')), 3);
  rig.forEach((d, k) => {
    const t = dailyTrackFor(d), f = flights[k];
    // Flown on the track's own gates.
    assert.deepEqual(f.gates.map(({ x, y, z, ry, size }) => ({ x, y, z, ry, size, solid: false })), t.gates);
    for (const lap of f.laps) assert.ok(lap * 1000 >= RIG_DAILY_LAP_MS[0] && lap * 1000 <= RIG_DAILY_LAP_MS[1], d + ' lap ' + lap.toFixed(2));
    const g = ghostOf(f);
    assert.ok(countGhostLaps(g.samples, t) >= 3, d + ': the page counts three laps');
  });
});

test('the autopilot flies Boards for the weeks the 14 days reach, and the Worker\'s check takes the runs', { timeout: 10 * 60 * 1000 }, async () => {
  const weeks = [...new Set(days(RIG_GEN_DAILY_FROM, 14).map((d) => utcWeekId(Date.parse(d))))].filter((w) => w >= RIG_GEN_WEEKLY_FROM);
  assert.ok(weeks.length >= 1);
  const flights = await flown(weeks.map((w) => weeklyTrackFor(w).course.split('>')), 3);
  weeks.forEach((w, k) => {
    const t = weeklyTrackFor(w), f = flights[k];
    for (const lap of f.laps) assert.ok(lap * 1000 <= RIG_WEEKLY_LAP_MS, w + ' lap ' + lap.toFixed(2));
    const g = ghostOf(f);
    // normalizeSubmit is what the Worker runs on a submit (it bundles this file).
    const now = Date.parse(weekMonday(w)) + 36e5 * 30;
    const r = normalizeSubmit({ name: 'AUTOPILOT', week: w, frameMm: 65, timeMs: g.timeMs, track: t.id, ghost: { v: 1, track: t.id, phys: PHYS_VER, name: 'AUTOPILOT', samples: g.samples } }, now);
    assert.ok(r.ok, w + ': ' + r.reason);
    assert.equal(r.trackId, t.id);
  });
});
