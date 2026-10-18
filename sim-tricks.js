// QuadMath sim — freestyle trick score + combo.
// Detects maneuvers from body-frame rotation (gyro / quat delta), altitude,
// speed, and collider gaps. Combo window, variety, banked session score.
// Ideas only from other sims — nothing here is copied from WebFPV (GPL).
// Style is Neon Current (docs/sim-art-direction.md): magenta / cyan / ember.
// New localStorage key only: quadmathSimTricks. Do not write old ryfly* keys.
// This file has no sim-*.js imports. Do not change flight physics.

export const TRICKS_KEY = 'quadmathSimTricks';
export const STORE_VER = 1;
export const COMBO_WINDOW_S = 2.8;
export const MUL_CAP = 6;
export const LOCKOUT_S = 0.55;

export const TRICK_LIST = Object.freeze([
  Object.freeze({ id: 'flip', name: 'Flip', points: 200 }),
  Object.freeze({ id: 'roll', name: 'Roll', points: 200 }),
  Object.freeze({ id: 'yawspin', name: 'Yaw Spin', points: 250 }),
  Object.freeze({ id: 'powerloop', name: 'Power Loop', points: 450 }),
  Object.freeze({ id: 'splits', name: 'Split-S', points: 400 }),
  Object.freeze({ id: 'matty', name: 'Matty Flip', points: 600 }),
  Object.freeze({ id: 'hang', name: 'Inverted Hang', points: 300 }),
  Object.freeze({ id: 'dive', name: 'Dive', points: 350 }),
  Object.freeze({ id: 'gap', name: 'Gap Thread', points: 500 }),
  Object.freeze({ id: 'prox', name: 'Proximity', points: 280 }),
]);

const BY_ID = Object.create(null);
for (let i = 0; i < TRICK_LIST.length; i++) BY_ID[TRICK_LIST[i].id] = TRICK_LIST[i];
export const TRICK_BY_ID = BY_ID;

const DEAD = 1.15;          // rad/s — hover wobble stays under this
const PEAK_FLIP = 4.0;      // rad/s
const PEAK_LOOP = 2.5;
const PEAK_YAW = 3.6;
const TURN = 5.76;          // ~330°
const QUIET_RESET = 0.18;
const HANG_S = 0.75;
const DIVE_DROP = 3.4;      // metres
const DIVE_VZ = -6.5;
const GAP_UP_W = 14;        // world units (~4 m)
const GAP_LAT_W = 7;
const GAP_TRAVEL_W = 4.2;
const PROX_M = 0.42;
const PROX_SPD = 7.5;
const COMBO_IDS = 16;

function makeDlt() { return { r: 0, p: 0, y: 0 }; }
function makeClr() { return { up: 50, dn: 50, px: 50, nx: 50, pz: 50, nz: 50, near: 50 }; }

export function trickById(id) {
  return BY_ID[id] || null;
}

export function formatScore(n) {
  const v = Math.max(0, Math.floor(n || 0));
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (v < 100000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(v / 1000) + 'k';
}

export function formatScoreFull(n) {
  const v = Math.max(0, Math.floor(n || 0));
  const s = String(v);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return out;
}

export function comboMul(count) {
  if (count <= 1) return 1;
  const m = 1 + 0.5 * (count - 1);
  return m > MUL_CAP ? MUL_CAP : m;
}

export function varietyMul(priorSame) {
  if (priorSame <= 0) return 1;
  if (priorSame === 1) return 0.55;
  return 0.3;
}

export function uniqueBonus(uniqueN) {
  if (uniqueN >= 5) return 1.2;
  if (uniqueN >= 3) return 1.1;
  return 1;
}

export function scoreTrick(id, priorSame, chainCount, uniqueN) {
  const def = BY_ID[id];
  if (!def) return 0;
  const pts = def.points * varietyMul(priorSame) * comboMul(chainCount) * uniqueBonus(uniqueN);
  return Math.max(1, Math.round(pts));
}

export function upZParts(x, y) {
  return 1 - 2 * (x * x + y * y);
}

export function headingParts(x, y, z, w) {
  const fx = 1 - 2 * (y * y + z * z);
  const fy = 2 * (x * y + w * z);
  return Math.atan2(fy, fx);
}

export function upZOf(q) {
  if (!q) return 1;
  return upZParts(q.x || q.qx || 0, q.y || q.qy || 0);
}

export function headingOf(q) {
  return headingParts(q.x || q.qx || 0, q.y || q.qy || 0, q.z || q.qz || 0, q.w || q.qw || 1);
}

export function unwrapDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function bodyDeltaParts(ax, ay, az, aw, bx, by, bz, bw, out) {
  const o = out || makeDlt();
  const cx = -ax, cy = -ay, cz = -az, cw = aw;
  let x = cw * bx + cx * bw + cy * bz - cz * by;
  let y = cw * by - cx * bz + cy * bw + cz * bx;
  let z = cw * bz + cx * by - cy * bx + cz * bw;
  let w = cw * bw - cx * bx - cy * by - cz * bz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-12) { o.r = 0; o.p = 0; o.y = 0; return o; }
  const ang = 2 * Math.atan2(s, w);
  const k = ang / s;
  o.r = x * k; o.p = y * k; o.y = z * k;
  return o;
}

export function bodyDelta(q0, q1, out) {
  if (!q0 || !q1) {
    const o = out || makeDlt();
    o.r = 0; o.p = 0; o.y = 0;
    return o;
  }
  return bodyDeltaParts(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w, out);
}

export function scanClearance(wx, wy, wz, colliders, out) {
  const o = out || makeClr();
  o.up = 50; o.dn = wy; o.px = 50; o.nx = 50; o.pz = 50; o.nz = 50; o.near = 50;
  if (!colliders || !colliders.length) return o;
  const n = colliders.length;
  for (let i = 0; i < n; i++) {
    const b = colliders[i];
    if (!b || !b.min || !b.max) continue;
    const min = b.min, max = b.max;
    const dx = wx < min.x ? min.x - wx : (wx > max.x ? wx - max.x : 0);
    const dy = wy < min.y ? min.y - wy : (wy > max.y ? wy - max.y : 0);
    const dz = wz < min.z ? min.z - wz : (wz > max.z ? wz - max.z : 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < o.near) o.near = dist;
    const oy = wy >= min.y - 0.45 && wy <= max.y + 0.45;
    const oz = wz >= min.z - 0.45 && wz <= max.z + 0.45;
    const ox = wx >= min.x - 0.45 && wx <= max.x + 0.45;
    if (oy && oz) {
      if (min.x >= wx) { const d = min.x - wx; if (d < o.px) o.px = d; }
      else if (max.x <= wx) { const d = wx - max.x; if (d < o.nx) o.nx = d; }
    }
    if (ox && oy) {
      if (min.z >= wz) { const d = min.z - wz; if (d < o.pz) o.pz = d; }
      else if (max.z <= wz) { const d = wz - max.z; if (d < o.nz) o.nz = d; }
    }
    if (ox && oz && min.y > wy) {
      const d = min.y - wy; if (d > 0.12 && d < o.up) o.up = d;
    }
  }
  return o;
}

function emptyMapScores() {
  return { bestCombo: 0, bestSession: 0 };
}

export function emptyStore() {
  return { v: STORE_VER, hud: true, maps: Object.create(null) };
}

export function normalizeStore(raw) {
  const s = emptyStore();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.hud === false) s.hud = false;
  const maps = raw.maps;
  if (maps && typeof maps === 'object') {
    for (const k in maps) {
      if (!Object.prototype.hasOwnProperty.call(maps, k)) continue;
      const m = maps[k] || {};
      s.maps[k] = {
        bestCombo: Math.max(0, Math.floor(+m.bestCombo || 0)),
        bestSession: Math.max(0, Math.floor(+m.bestSession || 0)),
      };
    }
  }
  return s;
}

export function loadStore(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return emptyStore();
  try {
    const raw = store.getItem(TRICKS_KEY);
    if (!raw) return emptyStore();
    return normalizeStore(JSON.parse(raw));
  } catch (e) {
    return emptyStore();
  }
}

export function saveStore(state, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  try {
    store.setItem(TRICKS_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function bestForMap(state, mapId) {
  const id = mapId || 'city';
  return (state && state.maps && state.maps[id]) || emptyMapScores();
}

export function recordBest(state, mapId, combo, session) {
  const id = mapId || 'city';
  if (!state.maps[id]) state.maps[id] = emptyMapScores();
  const m = state.maps[id];
  let changed = false;
  if (combo > m.bestCombo) { m.bestCombo = combo; changed = true; }
  if (session > m.bestSession) { m.bestSession = session; changed = true; }
  return changed;
}

export function bestLine(state, mapId) {
  const m = bestForMap(state, mapId);
  if (!m.bestCombo && !m.bestSession) return '—';
  return formatScore(m.bestCombo) + ' · ' + formatScore(m.bestSession);
}

export function makeDetector() {
  return {
    dlt: makeDlt(),
    clr: makeClr(),
    haveQ: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    px: 0, py: 0, pz: 0,
    accumR: 0, accumP: 0, accumY: 0,
    peakR: 0, peakP: 0, peakY: 0,
    quietR: 0, quietP: 0, quietY: 0,
    liveR: 0, liveP: 0, liveY: 0,
    alt0: 0, altMin: 0, altMax: 0, pSnap: 0,
    h0x: 0, h0z: 0, travelH: 0,
    yawDuringP: 0, rollDuringP: 0, pitchDuringR: 0,
    head0: 0,
    spdPeak: 0,
    split: 0, splitT: 0, splitAlt: 0, splitHead: 0, splitPitch: 0,
    hangT: 0, hangGot: 0,
    diveOn: 0, diveAlt: 0, diveDrop: 0,
    gapOn: 0, gapX: 0, gapY: 0, gapZ: 0, gapTravel: 0, gapSpd: 0, gapKind: 0,
    proxT: 0, proxCd: 0, gapCd: 0, hangCd: 0, diveCd: 0,
    lockout: 0,
    airT: 0,
    landT: 0,
    armedPrev: 0,
    wasAir: 0,
  };
}

export function resetDetector(d, sample) {
  d.haveQ = 0;
  d.accumR = d.accumP = d.accumY = 0;
  d.peakR = d.peakP = d.peakY = 0;
  d.quietR = d.quietP = d.quietY = 0;
  d.liveR = d.liveP = d.liveY = 0;
  d.yawDuringP = d.rollDuringP = d.pitchDuringR = 0;
  d.travelH = 0;
  d.pSnap = 0;
  d.split = 0; d.splitT = 0; d.splitPitch = 0;
  d.hangT = 0; d.hangGot = 0;
  d.diveOn = 0; d.diveDrop = 0;
  d.gapOn = 0; d.gapTravel = 0;
  d.proxT = 0;
  d.lockout = LOCKOUT_S;
  d.landT = 0;
  d.airT = 0;
  d.wasAir = 0;
  if (sample) {
    d.qx = sample.qx || 0; d.qy = sample.qy || 0; d.qz = sample.qz || 0; d.qw = sample.qw == null ? 1 : sample.qw;
    d.haveQ = 1;
    d.px = sample.wx || 0; d.py = sample.wy || 0; d.pz = sample.wz || 0;
    d.armedPrev = sample.armed ? 1 : 0;
  }
}

function axisApply(d, letter, dAng, rate, dt) {
  let accum = d['accum' + letter];
  let peak = d['peak' + letter];
  let quiet = d['quiet' + letter];
  let live = d['live' + letter];
  const ar = Math.abs(rate);
  const aa = Math.abs(dAng);
  if (ar >= DEAD || aa >= DEAD * dt) {
    if (!live) {
      live = 1;
      accum = 0;
      peak = 0;
      quiet = 0;
    }
    accum += dAng;
    if (ar > peak) peak = ar;
    quiet = 0;
  } else if (live) {
    quiet += dt;
    const almost = Math.abs(accum) > 4.8;
    const limit = almost ? 0.5 : QUIET_RESET;
    if (quiet > limit) {
      live = 0;
      accum = 0;
      peak = 0;
      quiet = 0;
    }
  }
  d['accum' + letter] = accum;
  d['peak' + letter] = peak;
  d['quiet' + letter] = quiet;
  d['live' + letter] = live;
}

function uniqueCount(ids, n) {
  let u = 0;
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    let seen = 0;
    for (let j = 0; j < i; j++) if (ids[j] === id) { seen = 1; break; }
    if (!seen) u++;
  }
  return u;
}

export function makeCombo() {
  return {
    n: 0,
    ids: new Array(COMBO_IDS),
    points: 0,
    mul: 1,
    lastAt: 0,
    live: 0,
    unique: 0,
  };
}

export function resetCombo(c) {
  c.n = 0;
  c.points = 0;
  c.mul = 1;
  c.lastAt = 0;
  c.live = 0;
  c.unique = 0;
}

export function pushCombo(c, id, now) {
  const prior = (() => {
    let n = 0;
    for (let i = 0; i < c.n; i++) if (c.ids[i] === id) n++;
    return n;
  })();
  const nextN = c.n + 1;
  const uniq = uniqueCount(c.ids, c.n) + (prior === 0 ? 1 : 0);
  const pts = scoreTrick(id, prior, nextN, uniq);
  if (c.n < COMBO_IDS) c.ids[c.n] = id;
  c.n = nextN;
  c.points += pts;
  c.mul = comboMul(nextN);
  c.lastAt = now;
  c.live = 1;
  c.unique = uniq;
  return pts;
}

export function comboRemain(c, now) {
  if (!c.live) return 0;
  const left = COMBO_WINDOW_S - (now - c.lastAt);
  return left > 0 ? left : 0;
}

function inGap(clr) {
  const latX = clr.px + clr.nx;
  const latZ = clr.pz + clr.nz;
  if (latX < GAP_LAT_W && clr.px < 3.2 && clr.nx < 3.2) return 1;
  if (latZ < GAP_LAT_W && clr.pz < 3.2 && clr.nz < 3.2) return 2;
  if (clr.up < GAP_UP_W) return 3;
  return 0;
}

export function stepDetector(d, sample, dt) {
  if (!d || !sample) return null;
  const step = dt > 0 && dt < 0.12 ? dt : 0.016;
  if (d.lockout > 0) d.lockout -= step;
  const sx = sample.qx || 0, sy = sample.qy || 0, sz = sample.qz || 0, sw = sample.qw == null ? 1 : sample.qw;
  const ox = sample.ox || 0, oy = sample.oy || 0, oz = sample.oz || 0;
  let dr, dp, dy;
  if (d.haveQ) {
    bodyDeltaParts(d.qx, d.qy, d.qz, d.qw, sx, sy, sz, sw, d.dlt);
    dr = d.dlt.r; dp = d.dlt.p; dy = d.dlt.y;
  } else {
    dr = ox * step; dp = oy * step; dy = oz * step;
  }
  d.qx = sx; d.qy = sy; d.qz = sz; d.qw = sw; d.haveQ = 1;
  if (Math.abs(dr) + Math.abs(dp) + Math.abs(dy) > 2.4) {
    d.accumR = d.accumP = d.accumY = 0;
    d.liveR = d.liveP = d.liveY = 0;
    d.peakR = d.peakP = d.peakY = 0;
    d.split = 0;
    return null;
  }

  const wx = sample.wx || 0, wy = sample.wy || 0, wz = sample.wz || 0;
  const dx = wx - d.px, dz = wz - d.pz;
  d.px = wx; d.py = wy; d.pz = wz;

  const alt = sample.alt != null ? sample.alt : wy / (sample.ws || 3.5);
  const speed = sample.speed || 0;
  const upZ = upZParts(sx, sy);
  const head = headingParts(sx, sy, sz, sw);
  const armed = !!sample.armed;
  const contact = (sample.clearance != null ? sample.clearance : 1) <= 0.08;
  const thr = sample.throttle || 0;

  if (contact) { d.airT = 0; } else { d.airT += step; if (d.airT > 0.25) d.wasAir = 1; }

  axisApply(d, 'R', dr, ox, step);
  axisApply(d, 'P', dp, oy, step);
  axisApply(d, 'Y', dy, oz, step);

  if (d.liveP) {
    if (!d.pSnap) {
      d.pSnap = 1;
      d.alt0 = alt; d.altMin = alt; d.altMax = alt;
      d.h0x = wx; d.h0z = wz; d.head0 = head;
      d.yawDuringP = 0; d.rollDuringP = 0; d.spdPeak = speed; d.travelH = 0;
    }
    if (alt < d.altMin) d.altMin = alt;
    if (alt > d.altMax) d.altMax = alt;
    d.travelH += Math.hypot(dx, dz);
    d.yawDuringP += dy;
    d.rollDuringP += dr;
    if (speed > d.spdPeak) d.spdPeak = speed;
  } else {
    d.altMin = 0; d.altMax = 0; d.travelH = 0; d.yawDuringP = 0; d.rollDuringP = 0; d.pSnap = 0;
  }
  if (d.liveR) d.pitchDuringR += dp;
  else d.pitchDuringR = 0;

  // Split-S phases: half-roll to inverted, then pull through with a drop + heading reverse.
  if (d.split === 0) {
    if (upZ < -0.4 && Math.abs(d.accumR) > 1.25 && Math.abs(d.accumR) < 2.9
      && Math.abs(d.accumP) < 1.05 && speed > 3.2 && d.peakR > 2.8) {
      d.split = 1; d.splitT = 0; d.splitAlt = alt; d.splitHead = head; d.splitPitch = 0;
    }
  } else {
    d.splitT += step;
    d.splitPitch += dp;
    if (d.split === 1 && Math.abs(d.splitPitch) > 0.9 && alt < d.splitAlt - 0.4) d.split = 2;
    if (d.split >= 1 && upZ > 0.55 && Math.abs(d.splitPitch) > 1.15) {
      const drop = d.splitAlt - alt;
      const hd = Math.abs(unwrapDelta(d.splitHead, head));
      if (drop > 1.15 && hd > 1.7 && d.splitT < 2.5 && speed > 2.4) {
        d.split = 0;
        d.accumR = 0; d.liveR = 0; d.peakR = 0;
        d.accumP = 0; d.liveP = 0; d.peakP = 0;
        return 'splits';
      }
    }
    if (d.splitT > 2.6 || Math.abs(d.accumR) > 5.5) {
      d.split = 0;
    }
  }

  let hit = null;
  if (d.lockout <= 0 && armed) {
    const pitchDone = Math.abs(d.accumP) >= TURN && d.liveP;
    const rollDone = Math.abs(d.accumR) >= TURN && d.liveR;
    const yawDone = Math.abs(d.accumY) >= TURN && d.liveY;

    if (pitchDone && Math.abs(d.rollDuringP) < 2.4) {
      const span = d.altMax - d.altMin;
      const yawMix = Math.abs(d.yawDuringP);
      if (yawMix > 2.15 && yawMix < 4.6 && d.peakP >= 3.2) hit = 'matty';
      else if (span > 3.15 && d.travelH > 2.6 && d.spdPeak > 4.5 && d.peakP >= PEAK_LOOP) hit = 'powerloop';
      else if (d.peakP >= PEAK_FLIP) hit = 'flip';
      if (hit) {
        d.accumP = 0; d.liveP = 0; d.peakP = 0; d.quietP = 0;
        d.accumY *= 0.2;
      }
    }
    if (!hit && rollDone && Math.abs(d.pitchDuringR) < 1.6 && d.peakR >= PEAK_FLIP && d.split === 0) {
      hit = 'roll';
      d.accumR = 0; d.liveR = 0; d.peakR = 0; d.quietR = 0;
    }
    if (!hit && yawDone && Math.abs(d.accumP) < 1.1 && Math.abs(d.accumR) < 1.1
      && d.peakY >= PEAK_YAW && upZ > 0.25) {
      hit = 'yawspin';
      d.accumY = 0; d.liveY = 0; d.peakY = 0; d.quietY = 0;
    }
  }

  const ws = sample.ws || 3.5;
  scanClearance(wx, wy, wz, sample.colliders, d.clr);

  if (!hit && armed && d.hangCd <= 0) {
    const hanging = upZ < -0.55 && !contact && (sample.clearance == null || sample.clearance > 0.22)
      && speed < 2.8 && Math.hypot(ox, oy, oz) < 3.2;
    if (hanging) {
      d.hangT += step;
      if (d.hangT >= HANG_S && !d.hangGot) {
        d.hangGot = 1;
        d.hangCd = 3.5;
        hit = 'hang';
      }
    } else {
      d.hangT = 0;
      if (upZ > -0.2) d.hangGot = 0;
    }
  } else if (d.hangCd > 0) d.hangCd -= step;

  if (!hit && armed && d.diveCd <= 0) {
    const vz = sample.vz != null ? sample.vz : 0;
    if (!d.diveOn && vz < DIVE_VZ && speed > 8 && alt > 4) {
      d.diveOn = 1; d.diveAlt = alt; d.diveDrop = 0;
    }
    if (d.diveOn) {
      if (alt < d.diveAlt) d.diveDrop = d.diveAlt - alt;
      if (d.diveDrop >= DIVE_DROP && speed > 8) {
        d.diveOn = 0; d.diveCd = 3.2;
        hit = 'dive';
      }
      if (vz > -2 || contact) d.diveOn = 0;
    }
  } else if (d.diveCd > 0) d.diveCd -= step;

  const kind = inGap(d.clr);
  if (!hit && armed && d.gapCd <= 0) {
    if (kind && speed > 2.8) {
      if (!d.gapOn) {
        d.gapOn = 1; d.gapX = wx; d.gapY = wy; d.gapZ = wz; d.gapTravel = 0; d.gapSpd = speed; d.gapKind = kind;
      } else {
        d.gapTravel = Math.hypot(wx - d.gapX, wy - d.gapY, wz - d.gapZ);
        if (speed > d.gapSpd) d.gapSpd = speed;
      }
    } else if (d.gapOn) {
      if (d.gapTravel > GAP_TRAVEL_W && d.gapSpd > 3.4) {
        hit = 'gap';
        d.gapCd = 2.2;
      }
      d.gapOn = 0; d.gapTravel = 0;
    }
  } else if (d.gapCd > 0) d.gapCd -= step;

  if (!hit && armed && d.proxCd <= 0 && !d.gapOn) {
    const nearM = d.clr.near / ws;
    const close = nearM < PROX_M && speed > PROX_SPD && !contact && (sample.clearance == null || sample.clearance > 0.12);
    if (close) {
      d.proxT += step;
      if (d.proxT > 0.16) {
        hit = 'prox';
        d.proxCd = 2.4;
        d.proxT = 0;
      }
    } else d.proxT = 0;
  } else if (d.proxCd > 0) d.proxCd -= step;

  // Landing / disarm ends a combo (caller banks). Signal via sentinel ids.
  let end = null;
  if (d.wasAir && contact && speed < 0.85 && upZ > 0.65 && thr < 0.2) {
    d.landT += step;
    if (d.landT > 0.28) { end = 'land'; d.wasAir = 0; d.landT = 0; }
  } else d.landT = 0;
  if (d.armedPrev && !armed) end = end || 'disarm';
  d.armedPrev = armed ? 1 : 0;

  if (hit) {
    d.lockout = 0.18;
    return hit;
  }
  return end;
}

const HUD_CSS = '#trickHud{position:fixed;left:50%;top:20%;transform:translateX(-50%);z-index:14;pointer-events:none;text-align:center;display:none;font-family:Inter,system-ui,sans-serif}'
  + '#trickHud.on{display:block}'
  + '#trickPop{font-size:26px;font-weight:700;letter-spacing:.18em;color:#ff2bd6;text-transform:uppercase;'
  + 'text-shadow:0 0 16px rgba(255,43,214,.5),0 1px 8px rgba(0,0,0,.8);opacity:0;transform:scale(.94);'
  + 'transition:opacity 90ms linear,transform 140ms ease-out}'
  + '#trickPop.show{opacity:1;transform:scale(1)}'
  + '#trickMul{font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:18px;font-weight:600;color:#00f0ff;'
  + 'text-shadow:0 0 12px rgba(0,240,255,.4),0 1px 6px rgba(0,0,0,.75);margin-top:4px;opacity:0}'
  + '#trickMul.show{opacity:1}'
  + '#trickBar{width:132px;height:3px;margin:8px auto 0;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;opacity:0}'
  + '#trickBar.show{opacity:1}'
  + '#trickBar>i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff2bd6,#00f0ff);transform-origin:left center;transform:scaleX(0);will-change:transform}'
  + '#trickScore{position:fixed;top:36px;left:50%;transform:translateX(-50%);z-index:14;pointer-events:none;'
  + 'font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:12px;letter-spacing:.12em;color:#00f0ff;'
  + 'text-shadow:0 0 10px rgba(0,240,255,.35),0 1px 6px rgba(0,0,0,.8);display:none}'
  + '#trickScore.on{display:block}'
  + 'body.menu-open #trickHud,body.menu-open #trickScore,body.builder-on #trickHud,body.builder-on #trickScore,'
  + 'body:has(#panel.open) #trickHud,body:has(#panel.open) #trickScore{opacity:0}';

function ensureHud(doc) {
  if (!doc || !doc.body) return null;
  let style = doc.getElementById('trickHudStyle');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'trickHudStyle';
    style.textContent = HUD_CSS;
    doc.head.appendChild(style);
  }
  let hud = doc.getElementById('trickHud');
  if (!hud) {
    hud = doc.createElement('div');
    hud.id = 'trickHud';
    hud.innerHTML = '<div id="trickPop"></div><div id="trickMul"></div><div id="trickBar"><i></i></div>';
    doc.body.appendChild(hud);
  }
  let score = doc.getElementById('trickScore');
  if (!score) {
    score = doc.createElement('div');
    score.id = 'trickScore';
    doc.body.appendChild(score);
  }
  return {
    hud,
    pop: doc.getElementById('trickPop'),
    mul: doc.getElementById('trickMul'),
    bar: hud.querySelector('#trickBar'),
    fill: hud.querySelector('#trickBar>i'),
    score,
  };
}

function playBlip(ctxHolder, muted, kind, mul) {
  if (muted && muted()) return;
  try {
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!AC) return;
    if (!ctxHolder.ctx) ctxHolder.ctx = new AC();
    const ctx = ctxHolder.ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const now = ctx.currentTime;
    const base = kind === 'bank' ? 220 : 440 + Math.min(8, mul || 1) * 70;
    o.type = 'sine';
    o.frequency.setValueAtTime(base, now);
    o.frequency.exponentialRampToValueAtTime(base * (kind === 'bank' ? 0.7 : 1.35), now + 0.07);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(kind === 'bank' ? 0.05 : 0.07, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    o.connect(g); g.connect(ctx.destination);
    o.start(now); o.stop(now + 0.1);
  } catch (e) { /* ignore */ }
}

export function createTricks(opts) {
  const o = opts || {};
  const doc = o.document || (typeof document !== 'undefined' ? document : null);
  const storage = o.storage || null;
  const muted = o.muted || function () { return true; };
  const nowFn = o.now || function () {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() * 0.001 : Date.now() * 0.001;
  };

  const store = loadStore(storage);
  const det = makeDetector();
  const combo = makeCombo();
  const audio = { ctx: null };
  let hudEls = null;
  let active = false;
  let mapId = 'city';
  let session = 0;
  let popName = '';
  let popUntil = 0;
  let scoreShown = '';
  let lastHudOn = -1;
  let bankFlashUntil = 0;

  function hudWanted() {
    return !!(store.hud && active);
  }

  function paintHud(t) {
    if (!doc) return;
    if (!hudEls) hudEls = ensureHud(doc);
    if (!hudEls) return;
    const on = hudWanted();
    if (on !== lastHudOn) {
      lastHudOn = on ? 1 : 0;
      hudEls.hud.className = on ? 'on' : '';
      hudEls.score.className = on ? 'on' : '';
    }
    if (!on) return;
    const remain = comboRemain(combo, t);
    const showPop = t < popUntil;
    if (hudEls.pop.textContent !== popName) hudEls.pop.textContent = popName;
    hudEls.pop.className = showPop ? 'show' : '';
    const mulTxt = combo.live ? ('×' + combo.mul.toFixed(1)) : (bankFlashUntil > t ? 'BANKED' : '');
    if (hudEls.mul.textContent !== mulTxt) hudEls.mul.textContent = mulTxt;
    hudEls.mul.className = mulTxt ? 'show' : '';
    hudEls.bar.className = combo.live ? 'show' : '';
    const frac = combo.live ? Math.min(1, remain / COMBO_WINDOW_S) : 0;
    if (hudEls.fill) hudEls.fill.style.transform = 'scaleX(' + (frac < 0 ? 0 : frac).toFixed(3) + ')';
    const line = formatScoreFull(session) + (combo.live ? ('  +' + formatScoreFull(combo.points)) : '');
    if (line !== scoreShown) {
      scoreShown = line;
      hudEls.score.textContent = line;
    }
  }

  function bank(reason) {
    if (!combo.live || combo.points <= 0) {
      resetCombo(combo);
      return 0;
    }
    const pts = combo.points;
    session += pts;
    recordBest(store, mapId, pts, session);
    saveStore(store, storage);
    resetCombo(combo);
    bankFlashUntil = nowFn() + 0.9;
    playBlip(audio, muted, 'bank', 1);
    return pts;
  }

  function award(id) {
    const t = nowFn();
    const remain = comboRemain(combo, t);
    if (combo.live && remain <= 0) bank('timeout');
    const got = pushCombo(combo, id, t);
    const def = BY_ID[id];
    popName = def ? def.name : id;
    popUntil = t + 1.05;
    playBlip(audio, muted, 'trick', combo.mul);
    recordBest(store, mapId, combo.points, session);
    saveStore(store, storage);
    return got;
  }

  function setActive(on, map) {
    const next = !!on;
    if (map) mapId = map;
    if (active && !next) bank('leave');
    if (!active && next) {
      session = 0;
      resetCombo(combo);
      resetDetector(det, null);
    }
    active = next;
    if (map) mapId = map;
    lastHudOn = -1;
  }

  function setMap(id) {
    if (id && id !== mapId) {
      if (active) bank('map');
      session = 0;
      mapId = id;
      resetCombo(combo);
      resetDetector(det, null);
    } else if (id) mapId = id;
  }

  let lastEv = null;
  const tickWrapped = function (sample, dt) {
    lastEv = null;
    try {
      const t = nowFn();
      if (combo.live && comboRemain(combo, t) <= 0) bank('timeout');
      if (active && sample) {
        const ev = stepDetector(det, sample, dt);
        lastEv = ev;
        if (ev === 'land' || ev === 'disarm') bank(ev);
        else if (ev && BY_ID[ev]) award(ev);
      }
      paintHud(t);
    } catch (err) {
      try { if (typeof console !== 'undefined') console.warn('tricks', err); } catch (e) { /* #198: never blank the FPV frame */ }
    }
    return lastEv;
  };

  function noteCrash() {
    try {
      if (!active) return 0;
      return bank('crash');
    } catch (e) { return 0; }
  }

  function noteReset() {
    try {
      if (active) bank('reset');
      resetDetector(det, null);
    } catch (e) { /* ignore */ }
  }

  function setHudOn(v) {
    store.hud = !!v;
    saveStore(store, storage);
    lastHudOn = -1;
  }

  function debugPop(name, mul, pts) {
    popName = name || 'Flip';
    const t = nowFn();
    popUntil = t + 8;
    combo.live = 1;
    combo.n = Math.max(2, combo.n || 2);
    combo.mul = mul == null ? 2.5 : mul;
    combo.points = pts == null ? 1250 : pts;
    combo.lastAt = t + 60;
    session = Math.max(session, 4200);
    lastHudOn = -1;
    try { paintHud(t); } catch (e) { /* ignore */ }
  }

  return {
    TRICKS_KEY,
    setActive,
    setMap,
    tick: tickWrapped,
    noteCrash,
    noteReset,
    setHudOn,
    hudOn: function () { return store.hud !== false; },
    isActive: function () { return active; },
    mapId: function () { return mapId; },
    session: function () { return session; },
    comboPoints: function () { return combo.points; },
    comboMul: function () { return combo.mul; },
    comboN: function () { return combo.n; },
    bestLine: function (id) { return bestLine(store, id || mapId); },
    bestFor: function (id) { return bestForMap(store, id || mapId); },
    store: function () { return store; },
    debugPop,
    resetDetector: function (s) { resetDetector(det, s); },
  };
}
