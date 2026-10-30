// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The coach lines' autopilot, on its own (no imports, so the page can load it
// too: tools/test_sim_coach_page.mjs flies a drill in the page with it).
// tools/coach_rig_pilot.mjs flies it on the bf core in Node.
//
// A path (centripetal Catmull-Rom through waypoints, metres in scene axes),
// a speed profile on it (each waypoint's cap, lateral and longitudinal
// acceleration limits), and a tracker: the nearest path point, the velocity
// along the path plus a pull back onto it, the curve's acceleration fed
// forward, drag fed forward, then tilt and throttle; tilt to Betaflight
// angle-mode sticks through the diff's own rates (the stick sets the angle on
// the rate curve: 60 degrees at full), yaw to the path's heading through the
// yaw rate curve.
const G = 9.81;

// ---- Betaflight Actual rates, as the owner's diff sets them ----
// rc_rate 2 (20 deg/s centre), srate 74 / 70 (740 / 700 deg/s), expo 0.56;
// angle mode puts the stick's place on that curve on a 60 degree limit.
function actual(s, center, max, expo) {
  const a = Math.min(1, Math.abs(s));
  const e = a * (Math.pow(a, 5) * expo + a * (1 - expo));
  return Math.sign(s) * (a * center + Math.max(0, max - center) * e);
}
function invert(fn, want) {
  const sgn = Math.sign(want), w = Math.abs(want);
  if (w >= fn(1)) return sgn;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < w) lo = mid; else hi = mid;
  }
  return sgn * (lo + hi) / 2;
}
const ANGLE_LIMIT = 60 * Math.PI / 180;
const angleOf = (s) => ANGLE_LIMIT * actual(s, 20, 740, 0.56) / 740;
const stickForAngle = (rad) => invert(angleOf, rad);
const yawRateOf = (s) => actual(s, 20, 700, 0.56) * Math.PI / 180;
const stickForYawRate = (rad) => invert(yawRateOf, rad);

// ---- The path ----
const v3 = (x, y, z) => ({ x, y, z });
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Centripetal Catmull-Rom through the waypoints, every DS metres, with each
// sample's cap interpolated between its waypoints'.
const DS = 0.01;
function samplePath(wps) {
  const P = wps.map((w) => v3(w.p[0], w.p[1], w.p[2]));
  const n = P.length;
  const ext = [add(P[0], sub(P[0], P[1])), ...P, add(P[n - 1], sub(P[n - 1], P[n - 2]))];
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = ext[i], p1 = ext[i + 1], p2 = ext[i + 2], p3 = ext[i + 3];
    const k = (a, b) => Math.max(Math.sqrt(len(sub(b, a))), 1e-4);
    const t1 = k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
    const lerp = (a, b, ta, tb, t) => add(mul(a, (tb - t) / (tb - ta)), mul(b, (t - ta) / (tb - ta)));
    const m = Math.max(2, Math.ceil(len(sub(p2, p1)) / (DS / 4)));
    const capA = wps[i].v, capB = wps[i + 1].v;
    for (let j = 0; j < m; j++) {
      const u = j / m, t = t1 + u * (t2 - t1);
      const a1 = lerp(p0, p1, 0, t1, t), a2 = lerp(p1, p2, t1, t2, t), a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, 0, t2, t), b2 = lerp(a2, a3, t1, t3, t);
      out.push({ p: lerp(b1, b2, t1, t2, t), cap: capA + (capB - capA) * u, wp: i });
    }
  }
  out.push({ p: P[n - 1], cap: wps[n - 1].v, wp: n - 1 });
  // Resample evenly by arc length.
  const pts = [out[0]];
  let acc = 0;
  for (let i = 1; i < out.length; i++) {
    acc += len(sub(out[i].p, out[i - 1].p));
    if (acc >= DS || i === out.length - 1) { pts.push(out[i]); acc = 0; }
  }
  return pts;
}

// Tangent, curvature (vector), heading and the speed profile.
export function buildPath(plan) {
  const pts = samplePath(plan.wps);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 3)].p, b = pts[Math.min(n - 1, i + 3)].p;
    const d = sub(b, a);
    pts[i].T = mul(d, 1 / (len(d) || 1));
  }
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 6)], b = pts[Math.min(n - 1, i + 6)];
    const ds = Math.max(DS, len(sub(b.p, a.p)));
    pts[i].K = mul(sub(b.T, a.T), 1 / ds);
  }
  // Heading: along the path where it runs level enough, else held.
  let yaw = plan.yaw0;
  for (let i = 0; i < n; i++) {
    const T = pts[i].T;
    if (Math.hypot(T.x, T.z) > 0.5) yaw = Math.atan2(-T.x, -T.z);
    pts[i].yaw0 = yaw;
  }
  // Smooth the heading (unwrapped) over +-0.15 m.
  const un = [pts[0].yaw0];
  for (let i = 1; i < n; i++) un.push(un[i - 1] + wrap(pts[i].yaw0 - pts[i - 1].yaw0));
  const W = 15;
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { s += un[j]; c++; }
    pts[i].yaw = s / c;
  }
  // Speed: the caps, the lateral limit on the curve, then accel / decel.
  const L = plan.limits;
  for (const q of pts) {
    const k = len(q.K);
    q.v = Math.min(q.cap, k > 1e-6 ? Math.sqrt(L.lat / k) : Infinity);
  }
  pts[0].v = Math.min(pts[0].v, 0.3);
  for (let i = 1; i < n; i++) pts[i].v = Math.min(pts[i].v, Math.sqrt(pts[i - 1].v ** 2 + 2 * L.acc * DS));
  pts[n - 1].v = Math.min(pts[n - 1].v, plan.vEnd || 0);
  for (let i = n - 2; i >= 0; i--) pts[i].v = Math.min(pts[i].v, Math.sqrt(pts[i + 1].v ** 2 + 2 * L.dec * DS));
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    pts[i].dvds = (b.v - a.v) / (2 * DS);
  }
  return pts;
}

// ---- The core's state in scene metres ----
export function sceneState(cs) {
  const m = cs.position, v = cs.velocity, q = cs.quaternion;
  return {
    p: v3(-m.y, m.z, -m.x),
    v: v3(-v.y, v.z, -v.x),
    yaw: Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)),
    up: 1 - 2 * (q.x * q.x + q.y * q.y),
  };
}

// The tracker's gains (per second) and the drag it feeds forward: the Air65
// on the bf core holds about 9.4 m/s at the 60 degree limit (a ~ 0.2 v^2).
const GAIN = { kp: 3.2, kv: 4.5, kyaw: 6, drag: 0.2, hover: 0.405, thrExp: 1.5, ki: 0.25, maxTilt: 60 * Math.PI / 180 };

// The tracker's state across polls: where on the path it is, the hover
// throttle it has learnt.
export function trackerMemory() {
  return { i: 0, hover: GAIN.hover };
}

export function track(path, s, mem, opts) {
  const o = opts || {};
  const n = path.length;
  // The nearest point, searched forward from the last.
  let best = mem.i, bestD = Infinity;
  for (let j = Math.max(0, mem.i - 20); j < Math.min(n, mem.i + 120); j++) {
    const d = len(sub(path[j].p, s.p));
    if (d < bestD) { bestD = d; best = j; }
  }
  mem.i = best;
  const q = path[best];
  const e = sub(q.p, s.p);
  const ePerp = sub(e, mul(q.T, dot(e, q.T)));
  const vRef = q.v;
  const vDes = add(mul(q.T, vRef), mul(ePerp, GAIN.kp));
  let a = add(mul(q.K, vRef * vRef), mul(q.T, q.dvds * vRef));
  a = add(a, mul(sub(vDes, s.v), GAIN.kv));
  // Drag, fed forward.
  a = add(a, mul(s.v, GAIN.drag * len(s.v)));
  const vert = G + a.y;
  const maxTilt = o.maxTilt || GAIN.maxTilt;
  const f = v3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
  const r = v3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
  const tp = clamp(Math.atan2(dot(a, f), vert), -maxTilt, maxTilt);
  const tr = clamp(Math.atan2(dot(a, r), vert), -maxTilt, maxTilt);
  // Throttle from the thrust it needs, the hover learnt on the climb rate.
  mem.hover = clamp(mem.hover + GAIN.ki * ((vDes.y) - s.v.y) * 0.004 * 0.1, 0.3, 0.55);
  const need = Math.hypot(Math.tan(tp), Math.tan(tr), 1) * Math.max(0.2, vert) / G;
  let t = clamp(mem.hover * Math.pow(need, 1 / GAIN.thrExp), 0.05, 1);
  // Heading: the path's, with its rate fed forward.
  const ahead = path[Math.min(n - 1, best + 1)];
  const yawRate = (ahead.yaw - q.yaw) / DS * vRef;
  const w = clamp(GAIN.kyaw * wrap(q.yaw - s.yaw) + yawRate, -8, 8);
  if (o.land && best >= n - 2 && s.p.y - path[n - 1].p.y < 0.08) t = 0;
  return {
    r: stickForAngle(tr),
    p: stickForAngle(tp),
    y: -stickForYawRate(w),
    t,
    end: best >= n - 2,
  };
}

// ---- The lines: waypoints in scene metres ----
// One pilot for every line: 12 m/s^2 into a turn, 9 to speed up, 13 to brake.
const LIMITS = { lat: 12, acc: 9, dec: 13 };
const wp = (x, y, z, v) => ({ p: [x, y, z], v });
// The rest pose on a floor pad (1 cm hull below) or on the loft slab.
const REST = 0.01;

// The tower: -x through a bay at z 4.5, +x at z 5.7, the U-turns outside
// the tower climbing (or sinking) half a level each side.
function towerPlan() {
  const zW = 4.5, zE = 5.7, xW = -7.85, xE = -5.95, apW = -8.45, apE = -5.35, mid = 5.1;
  const lv = [0.82, 2.52, 4.22, 5.55];
  const v = 3.2;
  const w = [wp(-4.4, REST, 4.6, 1), wp(-4.6, 0.55, 4.55, 1.5), wp(xE, lv[0], zW, v)];
  // W is -x, E +x: up through bays 1-3 and over the top, back down.
  const legs = [[lv[0], 'W'], [lv[1], 'E'], [lv[2], 'W'], [lv[3], 'E'], [lv[2], 'W'], [lv[1], 'E'], [lv[0], 'W']];
  legs.forEach(([y, dir], k) => {
    if (dir === 'W') w.push(wp(xW, y, zW, v));
    else w.push(wp(xE, y, zE, v));
    const next = legs[k + 1];
    if (!next) return;
    const ym = (y + next[0]) / 2;
    if (dir === 'W') { w.push(wp(apW, ym, mid, v)); w.push(wp(xW, next[0], zE, v)); }
    else { w.push(wp(apE, ym, mid, v)); w.push(wp(xE, next[0], zW, v)); }
  });
  w.push(wp(-8.9, lv[0], zW, 2));
  return { wps: w, yaw0: Math.PI / 2, limits: LIMITS, vEnd: 1.5 };
}

export const PLANS = Object.freeze({
  'tower-climb': towerPlan(),
  'pipe-slit': {
    wps: [
      wp(-9.05, REST, 6.6, 1), wp(-9.05, 1.2, 6.55, 2), wp(-9.05, 3.6, 5.9, 3), wp(-9.05, 5.4, 4.5, 3),
      wp(-9.05, 5.45, 3.0, 2.6), wp(-9.05, 5.35, 1.7, 2.0), wp(-9.05, 4.875, 0.6, 1.8),
      wp(-9.05, 4.2, -0.2, 2.2), wp(-9.05, 3.6, -1.6, 2.4), wp(-9.05, 3.5, -2.3, 1.5),
    ],
    yaw0: 0, limits: LIMITS, vEnd: 1,
  },
  'crate-slalom': {
    wps: [
      wp(9, REST, -3.4, 1), wp(9, 0.55, -3.2, 1.5), wp(9, 1.0, -2.3, 2.6), wp(9, 1.0, -0.8, 2.6),
      wp(9, 1.0, 0, 2.6), wp(9, 1.0, 0.8, 2.6), wp(9, 1.0, 2.2, 2),
    ],
    yaw0: Math.PI, limits: LIMITS, vEnd: 1,
  },
  'tunnel': {
    wps: [
      wp(6.8, REST, 5.6, 1), wp(6.6, 0.7, 5.6, 1.6), wp(5.5, 1.2, 5.6, 3), wp(4.05, 1.2, 5.6, 3.6),
      wp(2.05, 1.2, 5.6, 3.6), wp(0.05, 1.2, 5.6, 3.6), wp(-1.3, 1.2, 5.6, 2.5),
    ],
    yaw0: Math.PI / 2, limits: LIMITS, vEnd: 1,
  },
  'loft-dive': {
    wps: [
      wp(-9.05, 2.8 + REST, -0.85, 1), wp(-9.05, 3.15, -1.25, 1.2), wp(-9.05, 3.2, -2.25, 1.4),
      wp(-9.05, 2.75, -2.85, 1.5), wp(-9.05, 1.6, -3.35, 1.5), wp(-9.05, 0.5, -3.9, 1.0),
      wp(-9.05, REST, -4.15, 0.35),
    ],
    yaw0: 0, limits: LIMITS, vEnd: 0, land: true,
  },
  'straight': {
    wps: [
      wp(-6.1, REST, -5.6, 1), wp(-5.75, 0.7, -5.6, 4), wp(-4.35, 1.2, -5.6, 9.5), wp(3.5, 1.2, -5.6, 9.5),
      wp(6.0, 1.2, -5.6, 9), wp(6.99, 1.2, -4.7, 9), wp(6.0, 1.2, -3.8, 9),
      wp(2.0, 1.2, -5.5, 9.5), wp(-4.35, 1.2, -5.6, 9.5), wp(-8.0, 1.2, -5.6, 9.5),
    ],
    yaw0: -Math.PI / 2, limits: LIMITS, vEnd: 6,
  },
});
