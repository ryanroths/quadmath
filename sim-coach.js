// QuadMath sim W4 — Coach. Skill-ladder drills, scoring from flight samples,
// bronze/silver/gold progression, optional ghost ribbon + live delta, and
// post-drill / post-crash tips that only link existing QuadMath guides.
// Nothing here is copied from WebFPV (GPL).
// New localStorage key only: quadmathSimCoach. Do not write old ryfly* keys
// or the M2 / W1 / W2 / W3 keys.

import { detectPassOrMiss, gateRadius } from './sim-tracks.js?v=7ca83407298d';
import { DEFAULT_ROOM, planRoom } from './sim-room.js?v=5b05276e1d0b';
import { makeWorldLabel } from './sim-art.js?v=dd2d6713a4a6';

export const COACH_KEY = 'quadmathSimCoach';
export const GUIDE_DIR = 'content/guides/';

// Filenames scanned from content/guides/. Tests pin that every href exists
// and that this module never invents a guide page.
export const GUIDE_FILES = Object.freeze([
  'sim-to-first-pack.html',
  'first-tiny-whoop-setup.html',
  'expresslrs-binding-radio-setup.html',
  'air65-pid-tune.html',
  'us-tiny-whoop-rules-checklist.html',
  '1s-whoop-battery-by-size.html',
]);

export function guideHref(file) {
  return GUIDE_DIR + file;
}

// Frozen copy of tracks/trainer-slalom.json gates. Gate-pass scores these
// numbers so tests do not need a browser fetch. Do not drift the JSON.
export const TRAINER_SLALOM_GATES = Object.freeze([
  { x: 0.0, y: 2.2, z: 14.0, ry: 0.00, size: 1.8, solid: true },
  { x: -4.6, y: 2.2, z: 8.0, ry: 0.35, size: 1.7, solid: true },
  { x: 4.6, y: 2.2, z: 2.0, ry: -0.35, size: 1.7, solid: true },
  { x: -4.6, y: 2.2, z: -4.0, ry: 0.35, size: 1.7, solid: true },
  { x: 4.6, y: 2.2, z: -10.0, ry: -0.35, size: 1.7, solid: true },
  { x: 0.0, y: 2.2, z: -14.2, ry: 1.57, size: 1.8, solid: true },
  { x: 0.0, y: 2.2, z: 8.5, ry: 3.14, size: 1.8, solid: true },
]);

export const MEDAL_RANK = Object.freeze({ none: 0, bronze: 1, silver: 2, gold: 3 });
export const MEDAL_ORDER = Object.freeze(['none', 'bronze', 'silver', 'gold']);

export const DRILLS = Object.freeze([
  {
    id: 'hover-hold',
    name: 'Hover hold',
    blurb: 'Arm, then hold the glow. Smooth sticks, no drift.',
    map: 'trainer',
    track: 'trainer-figure8',
    preferMode: 'angle',
    unlockAfter: null,
    whoop: false,
    timeout: 12,
  },
  {
    id: 'yaw-spin',
    name: 'Yaw spin',
    blurb: 'Yaw a full turn in place. Whoop indoor skill.',
    map: 'room',
    track: 'room-practice',
    preferMode: 'angle',
    unlockAfter: 'hover-hold',
    whoop: true,
    timeout: 12,
  },
  {
    id: 'straight-line',
    name: 'Straight line',
    blurb: 'Ride the tape. No weave, hold altitude.',
    map: 'trainer',
    track: 'trainer-slalom',
    preferMode: 'angle',
    unlockAfter: 'yaw-spin',
    whoop: false,
    timeout: 16,
  },
  {
    id: 'gate-pass',
    name: 'Gate pass',
    blurb: 'Thread the Tiny Trainer slalom. Hit centers.',
    map: 'trainer',
    track: 'trainer-slalom',
    preferMode: 'angle',
    unlockAfter: 'straight-line',
    whoop: false,
    timeout: 28,
  },
  {
    id: 'doorway-pass',
    name: 'Doorway pass',
    blurb: 'Thread Your-room door without a kiss.',
    map: 'room',
    track: 'room-practice',
    preferMode: 'angle',
    unlockAfter: 'gate-pass',
    whoop: true,
    timeout: 16,
  },
  {
    id: 'split-s',
    name: 'Split-S',
    blurb: 'Invert, pull through, swap heading. Acro.',
    map: 'gym',
    track: 'gym-court',
    preferMode: 'acro',
    unlockAfter: 'doorway-pass',
    whoop: false,
    timeout: 16,
  },
  {
    id: 'power-loop',
    name: 'Power loop',
    blurb: 'Full loop in the gym box. Acro.',
    map: 'gym',
    track: 'gym-court',
    preferMode: 'acro',
    unlockAfter: 'split-s',
    whoop: false,
    timeout: 18,
  },
]);

export function drillById(id) {
  return DRILLS.find((d) => d.id === id) || null;
}

export function drillIndex(id) {
  return DRILLS.findIndex((d) => d.id === id);
}

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function unwrapDelta(prev, next) {
  let d = next - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function rms(values) {
  if (!values.length) return 0;
  let s = 0;
  for (const v of values) s += v * v;
  return Math.sqrt(s / values.length);
}

function medalAtLeast(got, need) {
  return (MEDAL_RANK[got] || 0) >= (MEDAL_RANK[need] || 0);
}

function betterMedal(a, b) {
  return (MEDAL_RANK[a] || 0) >= (MEDAL_RANK[b] || 0) ? (a || 'none') : (b || 'none');
}

export function emptyProgress() {
  return { v: 1, medals: {}, best: {}, ghosts: {}, ribbon: true, lastDrill: null };
}

export function normalizeProgress(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = emptyProgress();
  out.ribbon = src.ribbon !== false;
  if (src.lastDrill && drillById(src.lastDrill)) out.lastDrill = src.lastDrill;
  for (const d of DRILLS) {
    const m = src.medals && src.medals[d.id];
    if (m === 'bronze' || m === 'silver' || m === 'gold') out.medals[d.id] = m;
    const b = src.best && src.best[d.id];
    if (b && typeof b === 'object' && Number.isFinite(+b.score)) {
      out.best[d.id] = {
        score: clamp(+b.score, 0, 100),
        medal: (b.medal === 'bronze' || b.medal === 'silver' || b.medal === 'gold') ? b.medal : 'none',
        at: num(b.at, 0),
      };
    }
    const g = src.ghosts && src.ghosts[d.id];
    if (Array.isArray(g) && g.length >= 2) {
      const clean = [];
      for (const s of g) {
        if (!Array.isArray(s) || s.length < 4) continue;
        if (!s.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
        clean.push([s[0], s[1], s[2], s[3]]);
        if (clean.length >= 200) break;
      }
      if (clean.length >= 2) out.ghosts[d.id] = clean;
    }
  }
  return out;
}

export function loadCoach(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return normalizeProgress(emptyProgress());
  try {
    const raw = store.getItem(COACH_KEY);
    if (!raw) return normalizeProgress(emptyProgress());
    return normalizeProgress(JSON.parse(raw));
  } catch (e) {
    return normalizeProgress(emptyProgress());
  }
}

export function saveCoach(progress, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  try {
    store.setItem(COACH_KEY, JSON.stringify(normalizeProgress(progress)));
    return true;
  } catch (e) {
    return false;
  }
}

export function isUnlocked(progress, id) {
  const d = drillById(id);
  if (!d) return false;
  if (!d.unlockAfter) return true;
  const p = normalizeProgress(progress);
  return medalAtLeast(p.medals[d.unlockAfter] || 'none', 'bronze');
}

export function unlockedIds(progress) {
  return DRILLS.filter((d) => isUnlocked(progress, d.id)).map((d) => d.id);
}

export function nextLockedId(progress) {
  const p = normalizeProgress(progress);
  for (const d of DRILLS) {
    if (!isUnlocked(p, d.id)) return d.id;
  }
  return null;
}

export function roomDoorway(plan) {
  const p = plan || planRoom(DEFAULT_ROOM);
  const w = Math.min(2.8, p.w * 0.28);
  const h = Math.min(6.4, p.h * 0.78);
  return { x: 0, y: h * 0.5, z: p.d / 2, w, h, ry: 0 };
}

export function livingDoorway() {
  // Front hole in sim-maps buildLiving: z = +d/2, w=3.2, h=6.4.
  return { x: 0, y: 3.2, z: 14, w: 3.2, h: 6.4, ry: 0 };
}

export function defaultSpec(id, extras) {
  const d = drillById(id);
  const extra = extras || {};
  const trainerHover = { x: 0, y: 2.2, z: 0 };
  const lineA = { x: 0, y: 2.2, z: 12 };
  const lineB = { x: 0, y: 2.2, z: -12 };
  const room = extra.room || planRoom(DEFAULT_ROOM);
  const door = extra.doorway || roomDoorway(room);
  const gates = (extra.gates || TRAINER_SLALOM_GATES).map((g) => ({
    x: g.x, y: g.y, z: g.z, ry: g.ry || 0, size: g.size || 1.8, r: g.r || gateRadius(g),
  }));
  const base = {
    id,
    mode: extra.mode || (d && d.preferMode) || 'angle',
    timeout: extra.timeout != null ? extra.timeout : (d ? d.timeout : 12),
  };
  if (id === 'hover-hold') {
    return { ...base, target: extra.target || trainerHover, radius: extra.radius || 1.15, altTol: extra.altTol || 0.85 };
  }
  if (id === 'yaw-spin') {
    return { ...base, target: extra.target || { x: 0, y: 1.8, z: 0 }, radius: extra.radius || 1.05, altTol: extra.altTol || 0.7 };
  }
  if (id === 'straight-line') {
    return { ...base, a: extra.a || lineA, b: extra.b || lineB, endR: extra.endR || 1.4 };
  }
  if (id === 'gate-pass') {
    return { ...base, gates, need: extra.need || Math.min(4, gates.length) };
  }
  if (id === 'doorway-pass') {
    return { ...base, doorway: door };
  }
  if (id === 'split-s') {
    return { ...base, box: extra.box || { x: 0, y: 8, z: 0, w: 18, h: 20, d: 22 } };
  }
  if (id === 'power-loop') {
    return { ...base, box: extra.box || { x: 0, y: 9, z: 0, w: 16, h: 20, d: 16 } };
  }
  return base;
}

export function headingTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function drillBox(id, spec) {
  const s = spec || defaultSpec(id);
  if (id === 'yaw-spin' || id === 'doorway-pass') {
    const room = s.room || planRoom(DEFAULT_ROOM);
    return { w: room.w, d: room.d, h: room.h };
  }
  if (id === 'split-s' || id === 'power-loop') return { w: 48, d: 74, h: 28 };
  return { w: 28, d: 36, h: 10.5 };
}

export function spawnInside(pos, box, margin) {
  const m = margin == null ? 1.3 : margin;
  const hw = Math.max(0.4, box.w / 2 - m);
  const hd = Math.max(0.4, box.d / 2 - m);
  return {
    x: clamp(pos.x, -hw, hw),
    y: pos.y,
    z: clamp(pos.z, -hd, hd),
    yaw: pos.yaw,
  };
}

export function facesTarget(spawn, target, slop) {
  if (!spawn || !target) return false;
  const dx = target.x - spawn.x, dz = target.z - spawn.z;
  if (Math.hypot(dx, dz) < 0.35) return true;
  const want = headingTo(spawn, target);
  let d = (spawn.yaw || 0) - want;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= (slop == null ? 0.2 : slop);
}

export function drillSpawn(id, spec) {
  const s = spec || defaultSpec(id);
  const box = drillBox(id, s);
  let pad;
  if (id === 'hover-hold') {
    const t = s.target;
    pad = { x: t.x, y: 0.2, z: t.z, yaw: 0 };
  } else if (id === 'yaw-spin') {
    const t = s.target;
    pad = { x: t.x, y: 0.2, z: t.z + 2.4, yaw: 0 };
    pad.yaw = headingTo(pad, t);
  } else if (id === 'straight-line') {
    const a = s.a;
    pad = { x: a.x, y: 0.2, z: a.z + 3.2, yaw: 0 };
    pad.yaw = headingTo(pad, a);
  } else if (id === 'gate-pass') {
    const g = s.gates[0];
    const dist = (g.size || 1.8) * 2.4;
    pad = {
      x: g.x - Math.sin(g.ry || 0) * dist,
      y: 0.2,
      z: g.z - Math.cos(g.ry || 0) * dist,
      yaw: 0,
    };
    pad.yaw = headingTo(pad, g);
  } else if (id === 'doorway-pass') {
    const door = s.doorway;
    pad = { x: door.x, y: 0.2, z: door.z - 6.5, yaw: 0 };
    pad.yaw = headingTo(pad, door);
  } else if (id === 'split-s') {
    pad = { x: 0, y: 0.2, z: 10, yaw: 0 };
    pad.yaw = headingTo(pad, { x: 0, z: 0 });
  } else if (id === 'power-loop') {
    pad = { x: 0, y: 0.2, z: 6, yaw: 0 };
    pad.yaw = headingTo(pad, { x: 0, z: 0 });
  } else {
    pad = { x: 0, y: 0.2, z: 4, yaw: 0 };
  }
  return spawnInside(pad, box, 1.4);
}

function finishScore(score, medal, pass) {
  return {
    score: clamp(Math.round(score * 10) / 10, 0, 100),
    medal: pass ? (medal || 'none') : 'none',
    pass: !!pass,
  };
}

export function scoreHoverHold(samples, spec) {
  const s = spec || defaultSpec('hover-hold');
  const t = s.target;
  const holdH = [];
  const holdA = [];
  const holdSpd = [];
  let holdTime = 0;
  let crashes = 0;
  let inside = false;
  for (const p of samples) {
    if (p.crashed) crashes++;
    const horiz = Math.hypot(p.x - t.x, p.z - t.z);
    const alt = Math.abs(p.y - t.y);
    const spd = Math.hypot(p.vx || 0, p.vy || 0, p.vz || 0);
    const inGlow = p.armed !== false && horiz <= s.radius && alt <= s.altTol && p.y > 0.6;
    if (inGlow) inside = true;
    if (!inside) continue;
    if (inGlow) {
      holdH.push(horiz);
      holdA.push(alt);
      holdSpd.push(spd);
      holdTime += p.dt || 0;
    }
  }
  const rmsH = holdH.length ? rms(holdH) : 99;
  const rmsA = holdA.length ? rms(holdA) : 99;
  const maxSpd = holdSpd.length ? Math.max(...holdSpd) : 0;
  let score = 0;
  score += clamp(holdTime / 8, 0, 1) * 46;
  score += (1 - clamp(rmsH / 1.4, 0, 1)) * 24;
  score += (1 - clamp(rmsA / 1.0, 0, 1)) * 16;
  score += (1 - clamp(maxSpd / 5.5, 0, 1)) * 14;
  if (crashes) score *= 0.45;
  const pass = holdTime >= 4.5 && crashes === 0;
  let medal = 'none';
  if (pass && holdTime >= 5 && rmsH < 1.2) medal = 'bronze';
  if (pass && holdTime >= 6.5 && rmsH < 0.85) medal = 'silver';
  if (pass && holdTime >= 8 && rmsH < 0.45 && rmsA < 0.40) medal = 'gold';
  const out = finishScore(score, medal, pass);
  out.holdTime = holdTime;
  out.rmsHoriz = rmsH;
  out.rmsAlt = rmsA;
  out.crashes = crashes;
  out.pass = pass;
  out.id = 'hover-hold';
  return out;
}

export function scoreYawSpin(samples, spec) {
  const s = spec || defaultSpec('yaw-spin');
  const t = s.target;
  let yaw = 0;
  let crashes = 0;
  const drifts = [];
  const alts = [];
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i];
    const prev = samples[i - 1];
    if (p.crashed) crashes++;
    yaw += unwrapDelta(prev.yaw || 0, p.yaw || 0);
    drifts.push(Math.hypot(p.x - t.x, p.z - t.z));
    alts.push(Math.abs(p.y - t.y));
  }
  const turned = Math.abs(yaw);
  const drift = drifts.length ? rms(drifts) : 99;
  const alt = alts.length ? rms(alts) : 99;
  let score = clamp(turned / (Math.PI * 2), 0, 1.15) * 50;
  score += (1 - clamp(drift / 1.5, 0, 1)) * 30;
  score += (1 - clamp(alt / 0.9, 0, 1)) * 20;
  if (crashes) score *= 0.4;
  const pass = turned >= 5.0 && drift < 1.55 && crashes === 0;
  let medal = 'none';
  if (pass && turned >= 5.2 && drift < 1.35) medal = 'bronze';
  if (pass && turned >= 6.0 && drift < 0.8) medal = 'silver';
  if (pass && turned >= 6.15 && drift < 0.4 && alt < 0.32) medal = 'gold';
  const out = finishScore(score, medal, pass);
  out.yawRad = turned;
  out.drift = drift;
  out.rmsAlt = alt;
  out.crashes = crashes;
  out.pass = pass;
  out.id = 'yaw-spin';
  return out;
}

function pointLineDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz || 1;
  let u = (apx * abx + apy * aby + apz * abz) / ab2;
  u = clamp(u, 0, 1);
  return Math.hypot(apx - abx * u, apy - aby * u, apz - abz * u);
}

export function scoreStraightLine(samples, spec) {
  const s = spec || defaultSpec('straight-line');
  const a = s.a, b = s.b;
  let reached = false;
  let tEnd = null;
  let crashes = 0;
  const errs = [];
  for (const p of samples) {
    if (p.crashed) crashes++;
    errs.push(pointLineDist(p, a, b));
    if (!reached && Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) <= (s.endR || 1.4)) {
      reached = true;
      tEnd = p.t;
    }
  }
  const err = errs.length ? rms(errs) : 99;
  const time = tEnd != null ? tEnd : (samples.length ? samples[samples.length - 1].t : 99);
  let score = reached ? 38 : 8;
  score += (1 - clamp(err / 1.8, 0, 1)) * 42;
  score += (1 - clamp((time - 3.2) / 8, 0, 1)) * 20;
  if (crashes) score *= 0.4;
  const pass = reached && crashes === 0 && err < 1.7;
  let medal = 'none';
  if (pass && err < 1.55) medal = 'bronze';
  if (pass && err < 0.85 && time < 8.5) medal = 'silver';
  if (pass && err < 0.42 && time < 5.6) medal = 'gold';
  const out = finishScore(score, medal, pass);
  out.rmsLine = err;
  out.time = time;
  out.reached = reached;
  out.crashes = crashes;
  out.pass = pass;
  out.id = 'straight-line';
  return out;
}

export function scoreGatePass(samples, spec) {
  const s = spec || defaultSpec('gate-pass');
  const gates = s.gates;
  let next = 0;
  let passes = 0;
  let misses = 0;
  let crashes = 0;
  const centers = [];
  let tDone = null;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1], p = samples[i];
    if (p.crashed) crashes++;
    const hit = detectPassOrMiss(prev, p, gates, next);
    if (hit.type === 'miss') {
      misses++;
    } else if (hit.type === 'pass') {
      const g = gates[hit.index];
      centers.push(Math.hypot(p.x - g.x, p.y - g.y, p.z - g.z));
      passes++;
      next = (hit.index + 1) % gates.length;
      if (passes >= gates.length && tDone == null) tDone = p.t;
    }
  }
  const need = s.need || Math.min(4, gates.length);
  const center = centers.length ? rms(centers) : 99;
  const time = tDone != null ? tDone : (samples.length ? samples[samples.length - 1].t : 99);
  let score = clamp(passes / gates.length, 0, 1) * 44;
  score += (1 - clamp(center / 1.1, 0, 1)) * 28;
  score += (1 - clamp(misses / 3, 0, 1)) * 16;
  score += (1 - clamp((time - 6) / 16, 0, 1)) * 12;
  if (crashes) score *= 0.5;
  const pass = passes >= need && crashes === 0;
  let medal = 'none';
  if (pass && passes >= need && misses <= 2) medal = 'bronze';
  if (pass && passes >= gates.length && misses === 0 && center < 0.75) medal = 'silver';
  if (pass && passes >= gates.length && misses === 0 && center < 0.42 && time < 16) medal = 'gold';
  const out = finishScore(score, medal, pass);
  out.passes = passes;
  out.misses = misses;
  out.center = center;
  out.time = time;
  out.crashes = crashes;
  out.pass = pass;
  out.id = 'gate-pass';
  return out;
}

function crossedDoor(prev, p, door) {
  const z0 = prev.z, z1 = p.z, plane = door.z;
  if ((z0 - plane) * (z1 - plane) > 0) return false;
  const f = Math.abs(z1 - z0) < 1e-9 ? 1 : (plane - z0) / (z1 - z0);
  const x = prev.x + (p.x - prev.x) * f;
  const y = prev.y + (p.y - prev.y) * f;
  return Math.abs(x - door.x) <= door.w * 0.5 && y > 0.25 && y < door.h;
}

export function scoreDoorwayPass(samples, spec) {
  const s = spec || defaultSpec('doorway-pass');
  const door = s.doorway;
  let crossed = false;
  let tCross = null;
  let off = 99;
  let spd = 0;
  let crashes = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1], p = samples[i];
    if (p.crashed) crashes++;
    if (!crossed && crossedDoor(prev, p, door)) {
      crossed = true;
      tCross = p.t;
      const f = Math.abs(p.z - prev.z) < 1e-9 ? 1 : (door.z - prev.z) / (p.z - prev.z);
      const x = prev.x + (p.x - prev.x) * f;
      const y = prev.y + (p.y - prev.y) * f;
      off = Math.hypot(x - door.x, y - door.y);
      spd = Math.hypot(p.vx || 0, p.vy || 0, p.vz || 0);
    }
  }
  let score = crossed ? 40 : 6;
  score += (1 - clamp(off / 1.4, 0, 1)) * 36;
  score += (1 - clamp(Math.abs(spd - 4.2) / 6, 0, 1)) * 14;
  score += (1 - clamp(((tCross != null ? tCross : 16) - 2) / 10, 0, 1)) * 10;
  if (crashes) score *= 0.35;
  const pass = crossed && crashes === 0 && off < 1.35;
  let medal = 'none';
  if (pass && off < 1.2) medal = 'bronze';
  if (pass && off < 0.7) medal = 'silver';
  if (pass && off < 0.38 && spd < 8) medal = 'gold';
  const out = finishScore(score, medal, pass);
  out.offset = off;
  out.speed = spd;
  out.time = tCross != null ? tCross : (samples.length ? samples[samples.length - 1].t : 99);
  out.crossed = crossed;
  out.crashes = crashes;
  out.pass = pass;
  out.id = 'doorway-pass';
  return out;
}

function inBox(p, box) {
  return Math.abs(p.x - box.x) <= box.w / 2
    && Math.abs(p.y - box.y) <= box.h / 2
    && Math.abs(p.z - box.z) <= box.d / 2;
}

export function scoreSplitS(samples, spec) {
  const s = spec || defaultSpec('split-s');
  let invertAt = -1;
  let recoverAt = -1;
  let heading0 = 0;
  let heading1 = 0;
  let alt0 = 0;
  let alt1 = 0;
  let crashes = 0;
  let outBox = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    if (p.crashed) crashes++;
    if (s.box && !inBox(p, s.box)) outBox++;
    const inverted = Math.abs(p.roll || 0) > 2.15 || Math.abs(p.pitch || 0) > 2.35;
    if (invertAt < 0 && inverted) {
      invertAt = i;
      heading0 = p.yaw || 0;
      alt0 = p.y;
    }
    if (invertAt >= 0 && recoverAt < 0 && i > invertAt + 2) {
      const level = Math.abs(p.roll || 0) < 0.55 && Math.abs(p.pitch || 0) < 0.55;
      if (level) {
        recoverAt = i;
        heading1 = p.yaw || 0;
        alt1 = p.y;
      }
    }
  }
  const inverted = invertAt >= 0;
  const recovered = recoverAt >= 0;
  const head = recovered ? Math.abs(unwrapDelta(heading0, heading1)) : 0;
  const drop = recovered ? Math.max(0, alt0 - alt1) : 0;
  let score = inverted ? 28 : 4;
  if (recovered) score += 22;
  score += clamp(head / Math.PI, 0, 1.15) * 28;
  score += (drop > 0.8 && drop < 12 ? 14 : clamp(drop / 8, 0, 1) * 8);
  score += outBox ? 0 : 8;
  if (crashes) score *= 0.4;
  if (s.mode === 'angle' && inverted) score = Math.min(score, 74);
  const pass = inverted && recovered && crashes === 0;
  let medal = 'none';
  if (pass) medal = 'bronze';
  if (pass && head > 2.0 && drop > 1.0) medal = 'silver';
  if (pass && head > 2.5 && drop > 1.6 && drop < 14 && outBox === 0 && s.mode !== 'angle') medal = 'gold';
  const out = finishScore(score, medal, pass);
  out.inverted = inverted;
  out.recovered = recovered;
  out.heading = head;
  out.drop = drop;
  out.crashes = crashes;
  out.pass = pass;
  out.id = 'split-s';
  out.mode = s.mode;
  return out;
}

export function scorePowerLoop(samples, spec) {
  const s = spec || defaultSpec('power-loop');
  let pitch = 0;
  let crashes = 0;
  let outBox = 0;
  const ys = [];
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i], prev = samples[i - 1];
    if (p.crashed) crashes++;
    if (s.box && !inBox(p, s.box)) outBox++;
    pitch += unwrapDelta(prev.pitch || 0, p.pitch || 0);
    ys.push(p.y);
  }
  const turned = Math.abs(pitch);
  const ySpan = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  let score = clamp(turned / (Math.PI * 2), 0, 1.2) * 56;
  score += clamp(ySpan / 7, 0, 1) * 22;
  score += outBox ? 0 : 14;
  score += crashes ? 0 : 8;
  if (crashes) score *= 0.4;
  if (s.mode === 'angle') score = Math.min(score, 72);
  const pass = turned >= 4.4 && crashes === 0 && ySpan > 2.2;
  let medal = 'none';
  if (pass && turned >= 4.6) medal = 'bronze';
  if (pass && turned >= 5.6 && outBox === 0) medal = 'silver';
  if (pass && turned >= 6.0 && outBox === 0 && ySpan > 4 && s.mode !== 'angle') medal = 'gold';
  const out = finishScore(score, medal, pass);
  out.pitchRad = turned;
  out.ySpan = ySpan;
  out.crashes = crashes;
  out.pass = pass;
  out.id = 'power-loop';
  out.mode = s.mode;
  return out;
}

const SCORERS = {
  'hover-hold': scoreHoverHold,
  'yaw-spin': scoreYawSpin,
  'straight-line': scoreStraightLine,
  'gate-pass': scoreGatePass,
  'doorway-pass': scoreDoorwayPass,
  'split-s': scoreSplitS,
  'power-loop': scorePowerLoop,
};

export function scoreDrill(id, samples, spec) {
  const fn = SCORERS[id];
  if (!fn) throw new Error('unknown drill ' + id);
  const out = fn(samples, spec || defaultSpec(id));
  out.id = id;
  return out;
}

export function samplesToGhost(samples) {
  const out = [];
  let last = -999;
  for (const p of samples) {
    const t = Math.round((p.t || 0) * 1000);
    if (t - last < 45 && out.length) continue;
    out.push([t, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100]);
    last = t;
    if (out.length >= 200) break;
  }
  return out;
}

export function applyAttempt(progress, result, samples) {
  const p = normalizeProgress(progress);
  const id = result.id;
  if (!drillById(id)) return { progress: p, unlocked: [], improved: false };
  const prevMedal = p.medals[id] || 'none';
  const prevScore = p.best[id] ? p.best[id].score : -1;
  const medal = betterMedal(prevMedal, result.medal || 'none');
  if (medal !== 'none') p.medals[id] = medal;
  const improved = (result.score || 0) > prevScore;
  if (improved) {
    p.best[id] = { score: result.score, medal: result.medal || 'none', at: Date.now() };
    if (samples && samples.length >= 2) p.ghosts[id] = samplesToGhost(samples);
  }
  p.lastDrill = id;
  const unlocked = [];
  const next = DRILLS.find((d) => d.unlockAfter === id);
  if (next && medalAtLeast(medal, 'bronze') && !medalAtLeast(prevMedal, 'bronze')) {
    unlocked.push(next.id);
  }
  return { progress: p, unlocked, improved, medal };
}

export function attachDt(samples) {
  const out = samples.map((p) => ({ ...p }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].dt == null) {
      out[i].dt = i === 0 ? 0 : Math.max(0, (out[i].t || 0) - (out[i - 1].t || 0));
    }
  }
  return out;
}

function pushLine(samples, a, b, n, t0, dur) {
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    samples.push({
      t: t0 + dur * u,
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
      vx: 0, vy: 0, vz: 0, roll: 0, pitch: -0.15, yaw: 0, armed: true,
    });
  }
}

export function referenceSamples(id, spec) {
  const s = spec || defaultSpec(id);
  const out = [];
  if (id === 'hover-hold') {
    const t = s.target;
    for (let i = 0; i <= 80; i++) {
      out.push({
        t: i * 0.1, x: t.x, y: t.y, z: t.z,
        vx: 0, vy: 0, vz: 0, roll: 0, pitch: 0, yaw: 0, armed: true,
      });
    }
    return attachDt(out);
  }
  if (id === 'yaw-spin') {
    const t = s.target;
    for (let i = 0; i <= 72; i++) {
      const u = i / 72;
      out.push({
        t: u * 6, x: t.x, y: t.y, z: t.z,
        vx: 0, vy: 0, vz: 0, roll: 0, pitch: 0, yaw: u * Math.PI * 2, armed: true,
      });
    }
    return attachDt(out);
  }
  if (id === 'straight-line') {
    pushLine(out, s.a, s.b, 48, 0, 4.6);
    return attachDt(out);
  }
  if (id === 'gate-pass') {
    let t = 0;
    const g0 = s.gates[0];
    out.push({ t: 0, x: g0.x, y: g0.y, z: g0.z + 4, vx: 0, vy: 0, vz: -4, roll: 0, pitch: -0.1, yaw: Math.PI, armed: true });
    for (let i = 0; i < s.gates.length; i++) {
      const g = s.gates[i];
      t += 1.15;
      out.push({ t, x: g.x, y: g.y, z: g.z, vx: 0, vy: 0, vz: -5, roll: 0, pitch: -0.12, yaw: g.ry || 0, armed: true });
    }
    return attachDt(out);
  }
  if (id === 'doorway-pass') {
    const d = s.doorway;
    pushLine(out, { x: d.x, y: 1.6, z: d.z - 6 }, { x: d.x, y: d.y * 0.7, z: d.z + 2.5 }, 36, 0, 4);
    return attachDt(out);
  }
  if (id === 'split-s') {
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const roll = u < 0.35 ? u / 0.35 * Math.PI : (u < 0.7 ? Math.PI : Math.PI * (1 - (u - 0.7) / 0.3));
      const yaw = u < 0.4 ? 0 : (u - 0.4) / 0.6 * Math.PI;
      out.push({
        t: u * 5, x: 0, y: 10 - u * 5, z: 4 - u * 8,
        vx: 0, vy: -2, vz: -3, roll, pitch: u > 0.4 && u < 0.75 ? -0.8 : 0, yaw, armed: true,
      });
    }
    return attachDt(out);
  }
  if (id === 'power-loop') {
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      const ang = u * Math.PI * 2;
      out.push({
        t: u * 5.2, x: 0, y: 8 + Math.sin(ang) * 4.2, z: Math.cos(ang) * 4.2,
        vx: 0, vy: Math.cos(ang) * 4, vz: -Math.sin(ang) * 4,
        roll: 0, pitch: ang, yaw: 0, armed: true,
      });
    }
    return attachDt(out);
  }
  return attachDt(out);
}

export function ghostPoints(samples) {
  if (!samples || !samples.length) return [];
  if (Array.isArray(samples[0])) {
    return samples.map((s) => ({ t: (s[0] || 0) / 1000, x: s[1], y: s[2], z: s[3] }));
  }
  return samples.map((p) => ({ t: p.t || 0, x: p.x, y: p.y, z: p.z }));
}

export function liveDelta(samples, tNow, pos) {
  const pts = ghostPoints(samples);
  if (pts.length < 2) return null;
  let best = 0, bestD = Infinity, acc = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    segs.push({ a, b, len, acc });
    acc += len;
  }
  const total = acc || 1;
  for (const seg of segs) {
    const abx = seg.b.x - seg.a.x, aby = seg.b.y - seg.a.y, abz = seg.b.z - seg.a.z;
    const apx = pos.x - seg.a.x, apy = pos.y - seg.a.y, apz = pos.z - seg.a.z;
    const ab2 = abx * abx + aby * aby + abz * abz || 1;
    const u = clamp((apx * abx + apy * aby + apz * abz) / ab2, 0, 1);
    const dx = pos.x - (seg.a.x + abx * u);
    const dy = pos.y - (seg.a.y + aby * u);
    const dz = pos.z - (seg.a.z + abz * u);
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = (seg.acc + seg.len * u) / total;
    }
  }
  const ghostT = pts[0].t + (pts[pts.length - 1].t - pts[0].t) * best;
  return {
    delta: (tNow || 0) - ghostT,
    along: best,
    dist: Math.sqrt(bestD),
  };
}

export function pickGhostLine(progress, id, spec) {
  const p = normalizeProgress(progress);
  if (p.ghosts[id] && p.ghosts[id].length >= 2) return { kind: 'best', samples: p.ghosts[id] };
  return { kind: 'ref', samples: samplesToGhost(referenceSamples(id, spec || defaultSpec(id))) };
}

export function formatDelta(delta) {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const sign = delta <= 0 ? '−' : '+';
  return sign + Math.abs(delta).toFixed(2);
}

function tip(file, text) {
  return { text, href: guideHref(file), file };
}

export function tipsFor(kind, ctx) {
  const c = ctx || {};
  const id = c.id || '';
  const mode = c.mode || 'angle';
  const input = c.input || 'keyboard';
  const out = [];
  if (kind === 'crash') {
    out.push(tip('sim-to-first-pack.html', 'Crash: reset, hover first, then retry the line. Angle until it is dull.'));
    out.push(tip('first-tiny-whoop-setup.html', 'Indoor maiden hops are the same idea: low, slow, then a doorway.'));
    if (input === 'keyboard') {
      out.push(tip('expresslrs-binding-radio-setup.html', 'A radio in Joystick mode is easier than arrows. Bind notes live here.'));
    }
  }
  if (id === 'hover-hold') {
    out.push(tip('sim-to-first-pack.html', 'Hover hold: tiny throttle, look at a point. Paste the rates you will actually fly.'));
    if (mode === 'acro') out.push(tip('sim-to-first-pack.html', 'Switch to Angle (1) for this drill. Acro comes after hover is boring.'));
  }
  if (id === 'yaw-spin') {
    out.push(tip('sim-to-first-pack.html', 'Yaw only. Leave throttle where hover lives. Same TX16S you will maiden with.'));
  }
  if (id === 'straight-line' || id === 'gate-pass') {
    out.push(tip('sim-to-first-pack.html', 'Look through the line, not at the quad. Gate centers beat speed.'));
    out.push(tip('air65-pid-tune.html', 'If it wobbles through gates, the Air65 cards are the rates/PID starting point.'));
  }
  if (id === 'doorway-pass') {
    out.push(tip('first-tiny-whoop-setup.html', 'Doorways are the first real indoor pack. Center, then commit.'));
    out.push(tip('us-tiny-whoop-rules-checklist.html', 'Real indoor flying still wants a spotter and a weighed-under-250g whoop.'));
  }
  if (id === 'split-s' || id === 'power-loop') {
    out.push(tip('sim-to-first-pack.html', 'Acro (3) for invert work. Angle will cap the medal on these two.'));
    out.push(tip('air65-pid-tune.html', 'A published 65mm PID card keeps the loop from oscillating mid-pull.'));
  }
  if (kind === 'gold') {
    out.push(tip('sim-to-first-pack.html', 'Gold here. Next step on the real pack is the same rates, same radio.'));
  }
  if (kind === 'fail' && !out.length) {
    out.push(tip('sim-to-first-pack.html', 'Retry the drill. Short scored hops beat aimless laps.'));
  }
  // De-dupe by file, keep first (most specific) copy.
  const seen = new Set();
  return out.filter((t) => {
    if (seen.has(t.file)) return false;
    seen.add(t.file);
    return true;
  }).slice(0, 3);
}

export function ladderRows(progress) {
  const p = normalizeProgress(progress);
  return DRILLS.map((d) => ({
    id: d.id,
    name: d.name,
    blurb: d.blurb,
    map: d.map,
    track: d.track,
    preferMode: d.preferMode,
    whoop: d.whoop,
    unlocked: isUnlocked(p, d.id),
    medal: p.medals[d.id] || 'none',
    best: p.best[d.id] || null,
  }));
}

export function liveReadout(id, samples, spec) {
  const s = spec || defaultSpec(id);
  if (!samples.length) return { line: 'ARM TO START', detail: '' };
  const last = samples[samples.length - 1];
  if (id === 'hover-hold') {
    const r = scoreHoverHold(samples, s);
    return { line: r.holdTime.toFixed(1) + 's in glow', detail: 'rms ' + r.rmsHoriz.toFixed(2) + ' u' };
  }
  if (id === 'yaw-spin') {
    const r = scoreYawSpin(samples, s);
    return { line: (r.yawRad / (Math.PI * 2) * 360).toFixed(0) + '° yaw', detail: 'drift ' + r.drift.toFixed(2) };
  }
  if (id === 'straight-line') {
    const r = scoreStraightLine(samples, s);
    return { line: r.reached ? 'LINE DONE' : 'FLY THE TAPE', detail: 'err ' + r.rmsLine.toFixed(2) };
  }
  if (id === 'gate-pass') {
    const r = scoreGatePass(samples, s);
    return { line: r.passes + '/' + s.gates.length + ' gates', detail: r.misses ? (r.misses + ' miss') : 'clean' };
  }
  if (id === 'doorway-pass') {
    const r = scoreDoorwayPass(samples, s);
    return { line: r.crossed ? 'DOOR CLEARED' : 'THREAD THE DOOR', detail: r.crossed ? ('off ' + r.offset.toFixed(2)) : '' };
  }
  if (id === 'split-s') {
    const r = scoreSplitS(samples, s);
    return { line: r.inverted ? (r.recovered ? 'SPLIT-S DONE' : 'PULL THROUGH') : 'INVERT', detail: r.recovered ? (r.heading.toFixed(1) + ' rad') : '' };
  }
  if (id === 'power-loop') {
    const r = scorePowerLoop(samples, s);
    return { line: (r.pitchRad / (Math.PI * 2) * 100).toFixed(0) + '% loop', detail: 'span ' + r.ySpan.toFixed(1) };
  }
  return { line: '', detail: '' };
}

export function attemptFinished(id, samples, spec, crashed) {
  const s = spec || defaultSpec(id);
  const lastT = samples.length ? samples[samples.length - 1].t : 0;
  if (crashed) return true;
  if (lastT >= (s.timeout || 12)) return true;
  if (id === 'hover-hold') return scoreHoverHold(samples, s).holdTime >= 8.2;
  if (id === 'yaw-spin') return scoreYawSpin(samples, s).yawRad >= Math.PI * 2;
  if (id === 'straight-line') return scoreStraightLine(samples, s).reached;
  if (id === 'gate-pass') return scoreGatePass(samples, s).passes >= (s.gates || []).length;
  if (id === 'doorway-pass') return scoreDoorwayPass(samples, s).crossed;
  if (id === 'split-s') return scoreSplitS(samples, s).recovered;
  if (id === 'power-loop') return scorePowerLoop(samples, s).pitchRad >= Math.PI * 2 * 0.96;
  return false;
}

function medalClass(m) {
  return m === 'gold' || m === 'silver' || m === 'bronze' ? m : 'none';
}

export function ladderHtml(progress, ribbonOn) {
  const rows = ladderRows(progress);
  const items = rows.map((r) => {
    const lock = r.unlocked ? '' : ' locked';
    const medal = r.medal === 'none' ? (r.unlocked ? '—' : 'LOCK') : r.medal.toUpperCase();
    const score = r.best ? r.best.score.toFixed(0) : '';
    return '<button type="button" class="coach-row' + lock + '" data-drill="' + r.id + '"' +
      (r.unlocked ? '' : ' disabled') + '>' +
      '<span><b>' + r.name + '</b><i>' + r.blurb + '</i></span>' +
      '<span class="coach-medal ' + medalClass(r.medal) + '">' + medal + (score ? ' ' + score : '') + '</span>' +
      '</button>';
  }).join('');
  const on = ribbonOn !== false;
  return '<h2>Coach</h2><p>Short scored drills. Bronze unlocks the next. Ghost line is a better run or a bundled reference.</p>' +
    '<div class="coach-list">' + items + '</div>' +
    '<label class="coach-toggle"><input type="checkbox" id="coachRibbon"' + (on ? ' checked' : '') + '> Ghost line + live delta</label>' +
    '<button type="button" id="layerClose">Close</button>';
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function makeRibbonGeom(THREE, pts, width) {
  const w = width == null ? 0.16 : width;
  if (pts.length < 2) return null;
  const pos = [];
  const idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    let sx = -tz, sy = 0, sz = tx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx = sx / sl * w; sz = sz / sl * w;
    pos.push(pts[i].x - sx, pts[i].y + 0.04, pts[i].z - sz);
    pos.push(pts[i].x + sx, pts[i].y + 0.04, pts[i].z + sz);
    if (i > 0) {
      const i0 = (i - 1) * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createCoach(ctx) {
  const {
    THREE, scene, toast, decorateGate, LIGHTING,
    onPrepare, onFinished, onCancel,
  } = ctx;

  let progress = loadCoach();
  let session = null;
  let group = null;
  let ribbonMesh = null;
  let ghostPts = [];

  const hud = document.getElementById('coachHud');
  const titleEl = document.getElementById('coachTitle');
  const msgEl = document.getElementById('coachMsg');
  const metaEl = document.getElementById('coachMeta');
  const deltaEl = document.getElementById('coachDelta');
  const tipsEl = document.getElementById('coachTips');
  const actionsEl = document.getElementById('coachActions');

  function persist() {
    saveCoach(progress);
  }

  function clearScene() {
    if (group && group.parent) group.parent.remove(group);
    group = null;
    ribbonMesh = null;
  }

  function addLabel(text, pos, scale) {
    const spr = makeWorldLabel(THREE, text, {
      font: '700 32px Inter, system-ui, sans-serif',
      fill: '#E8E9ED',
      glow: '#E8E9ED',
      strokeWidth: 6,
      scale: scale || 4.2,
      position: pos,
    });
    group.add(spr);
  }

  function glowCyl(x, y, z, r, h, color) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 22, 1, true),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 1.15,
        transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function pad(x, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 0.1, 22),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 1.5, roughness: 0.5,
      }),
    );
    mesh.position.set(x, 0.06, z);
    group.add(mesh);
    return mesh;
  }

  function makeGateRing(g, color) {
    const size = g.size || 1.8;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(size * 0.72, size * 0.07, 8, 24),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: (LIGHTING && LIGHTING.gateEmissive) || 2.6, roughness: 0.4,
      }),
    );
    ring.position.set(g.x, g.y, g.z);
    ring.rotation.y = g.ry || 0;
    if (decorateGate) decorateGate(THREE, ring, size, color);
    group.add(ring);
    return ring;
  }

  function rebuildRibbon(pts) {
    if (ribbonMesh && group) group.remove(ribbonMesh);
    ribbonMesh = null;
    ghostPts = pts || [];
    if (!progress.ribbon || ghostPts.length < 2 || !THREE) return;
    const geom = makeRibbonGeom(THREE, ghostPts, 0.14);
    if (!geom) return;
    ribbonMesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        color: 0x3DDC97, emissive: 0x3DDC97, emissiveIntensity: 1.4,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ribbonMesh.name = 'coachRibbon';
    group.add(ribbonMesh);
  }

  function buildMarkers(id, spec) {
    clearScene();
    group = new THREE.Group();
    group.name = 'w4Coach';
    if (id === 'hover-hold') {
      const t = spec.target;
      glowCyl(t.x, t.y, t.z, spec.radius, 3.4, 0x3DDC97);
      addLabel('HOVER', { x: t.x, y: t.y + 2.2, z: t.z });
    } else if (id === 'yaw-spin') {
      const t = spec.target;
      glowCyl(t.x, t.y, t.z, spec.radius, 2.8, 0xFF4D1A);
      addLabel('YAW', { x: t.x, y: t.y + 1.8, z: t.z });
    } else if (id === 'straight-line') {
      pad(spec.a.x, spec.a.z, 0x3DDC97);
      pad(spec.b.x, spec.b.z, 0xFF4D1A);
      addLabel('START', { x: spec.a.x, y: 2.8, z: spec.a.z });
      addLabel('END', { x: spec.b.x, y: 2.8, z: spec.b.z });
    } else if (id === 'gate-pass') {
      spec.gates.forEach((g, i) => makeGateRing(g, i === 0 ? 0xFF4D1A : 0x3DDC97));
    } else if (id === 'doorway-pass') {
      const d = spec.doorway;
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(d.w, d.h) * 0.42, 0.07, 8, 20),
        new THREE.MeshStandardMaterial({
          color: 0xFF4D1A, emissive: 0xFF4D1A, emissiveIntensity: 2.4, roughness: 0.4,
        }),
      );
      frame.position.set(d.x, Math.min(d.y, 2.2), d.z - 0.2);
      group.add(frame);
      addLabel('DOOR', { x: d.x, y: d.h * 0.7, z: d.z - 0.4 });
    } else if (id === 'split-s') {
      glowCyl(0, 8, 0, 3.2, 8, 0xFF4D1A);
      addLabel('SPLIT-S', { x: 0, y: 12, z: 0 }, 6);
    } else if (id === 'power-loop') {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(4.2, 0.08, 8, 40),
        new THREE.MeshStandardMaterial({
          color: 0x3DDC97, emissive: 0x3DDC97, emissiveIntensity: 1.6,
          transparent: true, opacity: 0.7,
        }),
      );
      torus.rotation.y = Math.PI / 2;
      torus.position.set(0, 8, 0);
      group.add(torus);
      addLabel('LOOP', { x: 0, y: 13, z: 0 }, 5);
    }
    scene.add(group);
    const ghost = pickGhostLine(progress, id, spec);
    rebuildRibbon(ghostPoints(ghost.samples));
  }

  function showHud(show) {
    if (hud) hud.classList.toggle('show', !!show);
  }

  function renderTips(list) {
    if (!tipsEl) return;
    if (!list || !list.length) { tipsEl.innerHTML = ''; return; }
    tipsEl.innerHTML = list.map((t) => '<a href="' + t.href + '" target="_blank" rel="noopener">' + t.text + '</a>').join('');
  }

  function setFlyingUI(id) {
    const d = drillById(id);
    setText(titleEl, d ? d.name : 'Coach');
    setText(msgEl, d ? d.blurb : '');
    setText(metaEl, 'Space to arm');
    setText(deltaEl, '');
    renderTips([]);
    if (actionsEl) {
      actionsEl.style.display = 'none';
      actionsEl.classList.remove('show');
    }
    showHud(true);
  }

  function setResultUI(result, tips) {
    const d = drillById(result.id);
    const medal = (result.medal || 'none').toUpperCase();
    setText(titleEl, (d ? d.name : 'Drill') + ' — ' + medal);
    setText(msgEl, result.pass
      ? ('Score ' + result.score.toFixed(0) + (result.medal === 'gold' ? ' · gold' : ''))
      : ('No medal · ' + result.score.toFixed(0)));
    setText(metaEl, result.pass ? 'Retry or unlock the next one.' : 'Retry. Criteria are on the ladder.');
    renderTips(tips);
    if (actionsEl) {
      actionsEl.style.display = 'block';
      actionsEl.classList.add('show');
    }
    showHud(true);
  }

  function finish(crashed) {
    if (!session || session.phase === 'result') return session && session.result;
    const samples = attachDt(session.samples);
    const result = scoreDrill(session.id, samples, session.spec);
    result.crashed = !!crashed;
    result.mode = session.spec.mode;
    const applied = applyAttempt(progress, result, samples);
    progress = applied.progress;
    persist();
    session.phase = 'result';
    session.result = result;
    const kind = crashed ? 'crash' : (result.medal === 'gold' ? 'gold' : (result.pass ? 'pass' : 'fail'));
    const tips = tipsFor(kind, { id: session.id, mode: session.spec.mode, input: session.input });
    if (kind !== 'crash' && crashed) {
      // already crash
    }
    if (crashed) {
      const extra = tipsFor('crash', { id: session.id, mode: session.spec.mode, input: session.input });
      extra.forEach((t) => { if (!tips.some((x) => x.file === t.file)) tips.push(t); });
    }
    setResultUI(result, tips.slice(0, 3));
    if (toast) {
      if (crashed) toast('CRASH — ' + (result.medal === 'none' ? 'NO MEDAL' : result.medal.toUpperCase()));
      else toast((result.medal === 'none' ? 'NO MEDAL' : result.medal.toUpperCase()) + ' · ' + result.score.toFixed(0));
    }
    if (onFinished) onFinished({ result, unlocked: applied.unlocked, progress });
    return result;
  }

  function startDrill(id, opts) {
    const d = drillById(id);
    if (!d) return null;
    if (!isUnlocked(progress, id)) {
      if (toast) toast('LOCKED — BRONZE THE PREVIOUS DRILL');
      return null;
    }
    const o = opts || {};
    const spec = defaultSpec(id, {
      mode: o.mode || d.preferMode,
      room: o.room,
      doorway: o.doorway,
      gates: o.gates,
    });
    session = {
      id,
      spec,
      phase: 'arm',
      samples: [],
      input: o.input || 'keyboard',
      startedAt: 0,
      result: null,
    };
    buildMarkers(id, spec);
    setFlyingUI(id);
    if (onPrepare) onPrepare({ drill: d, spec, spawn: drillSpawn(id, spec) });
    if (toast) {
      const modeHint = d.preferMode === 'acro' ? ' — 3 FOR ACRO' : (d.preferMode === 'angle' ? ' — 1 FOR ANGLE' : '');
      toast((d.name.toUpperCase()) + modeHint);
    }
    return drillSpawn(id, spec);
  }

  function cancel() {
    const had = !!session;
    session = null;
    clearScene();
    showHud(false);
    if (had && onCancel) onCancel();
  }

  function sampleFromState(state, extra) {
    const att = extra.attitude || {};
    const vel = state.vel || {};
    return {
      t: extra.t,
      dt: extra.dt,
      x: state.pos.x, y: state.pos.y, z: state.pos.z,
      vx: vel.x || 0, vy: vel.y || 0, vz: vel.z || 0,
      roll: att.roll || 0, pitch: att.pitch || 0, yaw: att.yaw || 0,
      throttle: extra.throttle || 0,
      crashed: !!extra.crashed,
      armed: extra.armed !== false,
    };
  }

  function tick(state, dt, extra) {
    if (!session || session.phase === 'result') return;
    const ex = extra || {};
    if (session.phase === 'arm') {
      if (ex.armed) {
        session.phase = 'fly';
        session.startedAt = performance.now();
        session.spec.mode = ex.mode || session.spec.mode;
        if (toast) toast('DRILL LIVE');
      }
      setText(metaEl, 'Space / aux to arm');
      return;
    }
    const t = (performance.now() - session.startedAt) / 1000;
    const samp = sampleFromState(state, { t, dt, armed: ex.armed, attitude: ex.attitude, throttle: ex.throttle, crashed: ex.crashed });
    session.samples.push(samp);
    if (session.samples.length > 2400) session.samples.shift();
    const read = liveReadout(session.id, attachDt(session.samples), session.spec);
    setText(msgEl, read.line);
    setText(metaEl, read.detail || (t.toFixed(1) + 's'));
    if (progress.ribbon && ghostPts.length >= 2 && deltaEl) {
      const live = liveDelta(ghostPts, t, state.pos);
      if (live) {
        deltaEl.textContent = formatDelta(live.delta);
        deltaEl.classList.toggle('ahead', live.delta <= 0);
        deltaEl.classList.toggle('behind', live.delta > 0);
      }
    }
    if (ex.crashed || attemptFinished(session.id, attachDt(session.samples), session.spec, !!ex.crashed)) {
      finish(!!ex.crashed);
    }
  }

  function noteCrash() {
    if (!session || session.phase !== 'fly') return;
    finish(true);
  }

  function toggleRibbon(force) {
    progress.ribbon = force == null ? !progress.ribbon : !!force;
    persist();
    if (session && group) {
      const ghost = pickGhostLine(progress, session.id, session.spec);
      rebuildRibbon(ghostPoints(ghost.samples));
    }
    if (toast) toast(progress.ribbon ? 'COACH LINE ON' : 'COACH LINE OFF');
    return progress.ribbon;
  }

  function retry() {
    if (!session) return null;
    return startDrill(session.id, { mode: session.spec.mode, input: session.input, room: session.spec.room });
  }

  function nextDrill() {
    const cur = session && session.id;
    const idx = drillIndex(cur);
    for (let i = idx + 1; i < DRILLS.length; i++) {
      if (isUnlocked(progress, DRILLS[i].id)) return startDrill(DRILLS[i].id, { input: session && session.input });
    }
    return null;
  }

  return {
    COACH_KEY,
    isActive: () => !!session,
    phase: () => (session ? session.phase : 'idle'),
    currentId: () => (session ? session.id : null),
    progress: () => progress,
    ribbonOn: () => progress.ribbon,
    spawn: () => (session ? drillSpawn(session.id, session.spec) : null),
    startDrill,
    cancel,
    tick,
    noteCrash,
    toggleRibbon,
    retry,
    nextDrill,
    finish,
    ladderHtml: () => ladderHtml(progress, progress.ribbon),
    setRibbon(v) { return toggleRibbon(!!v); },
    reload() { progress = loadCoach(); return progress; },
  };
}
