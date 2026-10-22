// Neon Current — dense original city dressing. Visual only.
// Play colliders live in sim-maps.js CITY_PLAY. Nothing from the GPL whoop sim.

import { applyFeltMaterial, feltBasic, feltEmissive } from './sim-art-felt.js?v=f76fc4f752df';
import { CITY_PLAY } from './sim-maps.js?v=a3d287837e89';

export const RAIN_KEY = 'quadmathSimRain';

export const SIGN_WORDS = Object.freeze([
  'ZUV', 'KREX', 'WULO', 'PYXA', 'VELT', 'JUXA', 'QINN', 'TROV',
  'MYRA', 'ORBI', 'LUMO', 'KAIZ', 'VEXA', 'DRIF', 'PLEX', 'NYXX',
]);

export const GATE_STYLES = Object.freeze([
  'halo-pips', 'square-frame', 'hex-ring', 'triple-hoop', 'diamond',
  'chevrons', 'brackets', 'scallop', 'oval', 'spokes',
]);

export const BRAND_BLOCKLIST = Object.freeze([
  'nike', 'sony', 'visa', 'uber', 'tesla', 'apple', 'google', 'coca',
  'pepsi', 'adidas', 'ford', 'toyota', 'honda', 'bmw', 'audi',
]);

const HEX = /^#[0-9a-fA-F]{6}$/;

export function hexNum(h) {
  if (typeof h === 'number' && Number.isFinite(h)) return h >>> 0;
  const s = String(h || '').trim();
  if (!HEX.test(s)) return 0x000000;
  return parseInt(s.slice(1), 16);
}

export function qualityWantsBloom(applied, vibe) {
  if (applied !== 'med' && applied !== 'high') return false;
  if (vibe && vibe.post && vibe.post.bloom === false) return false;
  return true;
}

export function qualityWantsAo(applied) {
  return applied === 'med' || applied === 'high';
}

export function qualityWantsGrade(applied) {
  return applied === 'med' || applied === 'high';
}

export function qualityWantsReflections(applied) {
  return applied === 'med' || applied === 'high';
}

export function qualityWantsParticles(applied) {
  return applied === 'med' || applied === 'high';
}

export function qualityBudget(applied) {
  if (applied === 'low') {
    return {
      skyline: 36, lamps: 40, strips: 40, stars: 0, lights: 0,
      cars: 20, signs: 28, roof: 36, street: 40, rain: 0, shafts: 0, trails: 0,
      benches: 10, bins: 12, kiosks: 0, awnings: 0, vents: 0, lowSigns: 12,
      reflect: false, particles: false,
    };
  }
  if (applied === 'high') {
    return {
      skyline: 88, lamps: 96, strips: 96, stars: 0, lights: 5,
      cars: 56, signs: 88, roof: 96, street: 100, rain: 1200, shafts: 0, trails: 6,
      benches: 22, bins: 24, kiosks: 14, awnings: 18, vents: 18, lowSigns: 36,
      reflect: true, particles: true,
    };
  }
  return {
    skyline: 64, lamps: 72, strips: 72, stars: 0, lights: 3,
    cars: 40, signs: 56, roof: 64, street: 70, rain: 700, shafts: 0, trails: 4,
    benches: 16, bins: 18, kiosks: 10, awnings: 14, vents: 12, lowSigns: 24,
    reflect: true, particles: true,
  };
}

export function loadRain() {
  try {
    const v = localStorage.getItem(RAIN_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch (e) { /* ignore */ }
  return true;
}

export function saveRain(on) {
  try { localStorage.setItem(RAIN_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
}

export function mulberry32(a) {
  let t = a >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function distToSeg(x, z, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  let t = ((x - ax) * vx + (z - az) * vz) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + vx * t, pz = az + vz * t;
  return Math.hypot(x - px, z - pz);
}

export function pointHitsGate(x, y, z, gate, pad) {
  const dx = x - gate.x, dy = y - (gate.y || 0), dz = z - gate.z;
  const r = (gate.size || 7) + (pad == null ? 3.2 : pad);
  return dx * dx + dy * dy + dz * dz < r * r;
}

export function propClearOfCourse(x, z, y, gates, opts) {
  if (!gates || !gates.length) return true;
  const pad = opts && opts.gatePad != null ? opts.gatePad : 3.4;
  const corridor = opts && opts.corridor != null ? opts.corridor : 4.6;
  const yRange = opts && opts.yRange != null ? opts.yRange : 10;
  const yy = y == null ? 2 : y;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    const gy = g.y == null ? 7 : g.y;
    if (Math.abs(yy - gy) < yRange + (g.size || 7)
      && pointHitsGate(x, gy, z, g, pad)) return false;
    const n = gates[(i + 1) % gates.length];
    if (distToSeg(x, z, g.x, g.z, n.x, n.z) < corridor) return false;
  }
  return true;
}

export function signsAreOriginal(words) {
  const list = words || SIGN_WORDS;
  return list.every((w) => {
    const s = String(w).toLowerCase();
    return s.length >= 3 && s.length <= 6 && !BRAND_BLOCKLIST.some((b) => s.includes(b));
  });
}

function sidewalkCandidates(step) {
  const out = [];
  const s = step || 22;
  for (let a = -360; a <= 360; a += s) {
    if (Math.abs(a) < 10) continue;
    out.push({ x: 16, z: a, ry: 0 });
    out.push({ x: -16, z: a, ry: Math.PI });
    out.push({ x: a, z: 16, ry: Math.PI / 2 });
    out.push({ x: a, z: -16, ry: -Math.PI / 2 });
  }
  return out;
}

function curbCandidates(step) {
  const out = [];
  const s = step || 18;
  for (let a = -340; a <= 340; a += s) {
    if (Math.abs(a) < 8) continue;
    out.push({ x: 9.4, z: a, ry: -Math.PI / 2 });
    out.push({ x: -9.4, z: a, ry: Math.PI / 2 });
    out.push({ x: a, z: 9.4, ry: Math.PI });
    out.push({ x: a, z: -9.4, ry: 0 });
  }
  return out;
}

const PORTAL_XZ = Object.freeze({ x: 350, z: -350 });

export function planCityProps(gates, quality) {
  const budget = qualityBudget(quality);
  const rng = mulberry32(9011);
  const walk = sidewalkCandidates(quality === 'low' ? 32 : 22);
  const curb = curbCandidates(quality === 'low' ? 26 : 16);
  const pickFrom = (spots, n, y, extraPad, minDist) => {
    const got = [];
    const gap = minDist == null ? 5.5 : minDist;
    for (let i = 0; i < spots.length && got.length < n; i++) {
      const s = spots[(i * 7 + (rng() * spots.length) | 0) % spots.length];
      const jx = (rng() - 0.5) * 2.4, jz = (rng() - 0.5) * 2.4;
      const x = s.x + jx, z = s.z + jz;
      if (!propClearOfCourse(x, z, y, gates, { gatePad: extraPad || 3.6, corridor: 4.8 })) continue;
      if (got.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
      got.push({ x, z, y, ry: s.ry, seed: rng() });
    }
    return got;
  };
  const planned = {
    cars: pickFrom(curb, budget.cars, 0.55, 5.0, 8.0),
    vending: pickFrom(walk, Math.min(18, budget.street >> 2), 1.1, 4.0, 6.0),
    bollards: pickFrom(curb, Math.min(40, budget.street >> 1), 0.45, 3.2, 4.2),
    traffic: pickFrom(walk, Math.min(12, budget.street >> 3), 2.4, 5.5, 8.0),
    crates: pickFrom(walk, Math.min(28, budget.street >> 2), 0.4, 3.4, 5.0),
    trash: pickFrom(walk, Math.min(28, budget.street >> 2), 0.28, 3.2, 4.5),
    lanterns: pickFrom(walk, Math.min(36, budget.lamps), 5.2, 3.8, 6.0),
    chain: pickFrom(walk, Math.min(16, budget.street >> 3), 1.2, 4.2, 7.0),
    benches: pickFrom(curb, budget.benches || 0, 0.42, 3.8, 6.5),
    bins: pickFrom(curb, budget.bins || 0, 0.45, 3.4, 5.0),
    kiosks: pickFrom(walk, budget.kiosks || 0, 0.95, 4.4, 8.0),
    awnings: pickFrom(curb, budget.awnings || 0, 2.05, 4.0, 7.0),
    vents: pickFrom(curb, budget.vents || 0, 0.12, 3.6, 8.5),
    lowSigns: pickFrom(curb, budget.lowSigns || 0, 1.45, 4.2, 7.5),
  };
  const inWhoopStreet = (p) => Math.abs(p.x) < 20 && p.z > -16 && p.z < 28;
  planned.cars = planned.cars.filter((p) => !inWhoopStreet(p));
  planned.lowSigns = planned.lowSigns.filter((p) => !inWhoopStreet(p));
  planned.benches = planned.benches.filter((p) => !inWhoopStreet(p) || p.z < 14);
  planned.bins = planned.bins.filter((p) => !inWhoopStreet(p) || p.z < 14);
  // Whoop-street FPV is at (3.2, 26) looking -Z / +X. Park cars PARALLEL to
  // the Z-street (heading = ry + π/2, so ry = 0 or π) on both curbs.
  const whoopCars = [
    [14.6, 18, 0, 'taxi'],
    [-9.2, 16, Math.PI, 'sedan'],
    [14.6, 8, 0, 'van'],
    [-9.2, 10, Math.PI, 'hatch'],
    [14.6, -2, Math.PI, 'sedan'],
    [-9.2, 2, 0, 'taxi'],
    [14.6, -12, 0, 'hatch'],
    [-8.6, -8, Math.PI, 'van'],
  ];
  for (const [x, z, ry, type] of whoopCars) {
    pushIfClear(planned.cars, gates, x, z, 0.55, ry, 5.0, { type });
  }
  pushIfClear(planned.cars, gates, -112, -100, 0.55, -0.8, 5.0);
  pushIfClear(planned.cars, gates, 318, -330, 0.55, 0.7, 5.0);
  pushIfClear(planned.benches, gates, 9.0, 6, 0.42, -Math.PI / 2, 3.8);
  pushIfClear(planned.benches, gates, -9.0, 8, 0.42, Math.PI / 2, 3.8);
  pushIfClear(planned.benches, gates, 9.0, -4, 0.42, -Math.PI / 2, 3.8);
  pushIfClear(planned.benches, gates, -9.0, 4, 0.42, Math.PI / 2, 3.8);
  // Face the whoopStreet camera (3.2, 26) → (11.5, -6), never end-on.
  pushIfClear(planned.lowSigns, gates, 9.3, 10, 1.45, Math.atan2(3.2 - 9.3, 26 - 10), 4.2);
  pushIfClear(planned.lowSigns, gates, -9.3, 8, 1.45, Math.atan2(3.2 + 9.3, 26 - 8), 4.2);
  pushIfClear(planned.lowSigns, gates, 9.3, -6, 1.45, Math.atan2(3.2 - 9.3, 26 + 6), 4.2);
  pushIfClear(planned.lowSigns, gates, -9.3, -2, 1.45, Math.atan2(3.2 + 9.3, 26 + 2), 4.2);
  pushIfClear(planned.lowSigns, gates, -128, -105, 1.45, 0.7, 4.2);
  pushIfClear(planned.lowSigns, gates, 320, -318, 1.45, 0.8, 4.2);
  pushIfClear(planned.kiosks, gates, 16.2, 6, 0.95, -Math.PI / 2, 4.4);
  pushIfClear(planned.kiosks, gates, -8.6, 10, 0.95, Math.PI / 2, 4.4);
  pushIfClear(planned.kiosks, gates, 16.2, -8, 0.95, -Math.PI / 2, 4.4);
  pushIfClear(planned.bins, gates, 8.8, 8, 0.45, -Math.PI / 2, 3.4);
  pushIfClear(planned.bins, gates, -8.8, 6, 0.45, Math.PI / 2, 3.4);
  pushIfClear(planned.kiosks, gates, 336, -332, 0.95, 0.55, 5.0);
  pushIfClear(planned.vending, gates, 362, -332, 1.1, -0.5, 5.0);
  pushIfClear(planned.lowSigns, gates, 340, -324, 1.45, 0.45, 5.0);
  pushIfClear(planned.benches, gates, 344, -330, 0.42, 0.4, 4.2);
  pushIfClear(planned.bins, gates, 338, -326, 0.45, 0.4, 4.0);
  const ring = [
    [332, -328, 0.9], [368, -328, -0.6], [332, -372, 2.2], [368, -372, 0.4],
    [318, -350, 1.57], [382, -350, -1.57], [350, -318, 3.14],
  ];
  for (const [x, z, ry] of ring) {
    pushIfClear(planned.cars, gates, x, z, 0.55, ry, 6.0);
    pushIfClear(planned.lowSigns, gates, x + Math.cos(ry) * 3.2, z + Math.sin(ry) * 3.2, 1.45, ry, 5.0);
    pushIfClear(planned.benches, gates, x - Math.cos(ry) * 4.2, z - Math.sin(ry) * 4.2, 0.42, ry, 4.2);
    pushIfClear(planned.bollards, gates, x + Math.sin(ry) * 2.4, z - Math.cos(ry) * 2.4, 0.45, ry, 4.0);
  }
  // Brown crates / faceted trash read as unlit shards at whoop height.
  const offWhoopStreet = (p) => Math.abs(p.x) > 28 || p.z < -20 || p.z > 40;
  planned.crates = (planned.crates || []).filter(offWhoopStreet);
  planned.trash = (planned.trash || []).filter(offWhoopStreet);
  planned.awnings = (planned.awnings || []).filter(offWhoopStreet);
  planned.vents = (planned.vents || []).filter(offWhoopStreet);
  // Portal FPV (328,-308) looking at the plaza: drop leftover crate shards.
  const offPortal = (p) => Math.hypot(p.x - PORTAL_XZ.x, p.z - PORTAL_XZ.z) > 46;
  planned.crates = planned.crates.filter(offPortal);
  planned.trash = planned.trash.filter(offPortal);
  return planned;
}

export function planPortalBlocks(gates, quality) {
  const n = quality === 'low' ? 10 : (quality === 'high' ? 20 : 14);
  const rng = mulberry32(7721);
  const out = [];
  const pushBlock = (x, z, h, w, d) => {
    if (out.length >= n) return;
    if (Math.hypot(x - PORTAL_XZ.x, z - PORTAL_XZ.z) < 34) return;
    if (!propClearOfCourse(x, z, h / 2, gates || [], { gatePad: 8, corridor: 6.0, yRange: 14 })) return;
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 16)) return;
    out.push({ x, y: h / 2, z, w, h, d, top: h });
  };
  // Forced flank / behind blocks so the whoopPortal shot is a plaza, not a plain.
  const forced = [
    [308, -378, 26, 14, 12], [296, -346, 20, 13, 14], [314, -404, 32, 16, 13],
    [394, -366, 28, 14, 14], [404, -338, 22, 13, 12], [382, -404, 34, 15, 14],
    [350, -422, 24, 18, 14], [328, -414, 18, 12, 12], [370, -322, 20, 12, 11],
    [388, -390, 16, 11, 12], [300, -390, 22, 12, 12], [410, -372, 18, 12, 11],
  ];
  for (const [x, z, h, w, d] of forced) pushBlock(x, z, h, w, d);
  const approach = Math.atan2(42, -22);
  for (let i = 0; i < 40 && out.length < n; i++) {
    const a = (i / 40) * Math.PI * 2;
    let da = Math.abs(Math.atan2(Math.sin(a - approach), Math.cos(a - approach)));
    if (da < 0.32) continue;
    const r = 48 + (i % 3) * 14 + rng() * 4;
    pushBlock(
      PORTAL_XZ.x + Math.cos(a) * r,
      PORTAL_XZ.z + Math.sin(a) * r,
      16 + rng() * 26,
      11 + rng() * 8,
      11 + rng() * 8,
    );
  }
  return out;
}

function pushIfClear(list, gates, x, z, y, ry, extraPad, extra) {
  if (!propClearOfCourse(x, z, y, gates, { gatePad: extraPad || 3.6, corridor: 4.8 })) return;
  if (list.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) return;
  list.push(Object.assign({
    x, z, y, ry,
    seed: Math.abs(x * 0.17 + z * 0.31) % 1,
  }, extra || {}));
}

function canvasTex(THREE, w, h, draw, rx, ry) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx == null ? 1 : rx, ry == null ? 1 : ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.looksComposed = true;
  t.userData.artLocked = true;
  t.needsUpdate = true;
  return t;
}

function skipMat(m) {
  return applyFeltMaterial(m);
}

function mergeGeos(THREE, list) {
  const pos = [], nor = [], uv = [], col = [];
  let anyColor = false;
  for (const g of list) {
    if (!g) continue;
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    const u = src.getAttribute('uv');
    const c = src.getAttribute('color');
    if (!p) {
      if (src !== g) src.dispose();
      g.dispose();
      continue;
    }
    if (c) anyColor = true;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
      if (c) col.push(c.getX(i), c.getY(i), c.getZ(i));
      else col.push(1, 1, 1);
    }
    if (src !== g) src.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (anyColor) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function paintGeo(THREE, g, color) {
  if (!g || color == null) return g;
  const n = ((color >>> 0) & 0xffffff);
  const r = ((n >> 16) & 255) / 255;
  const gv = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const p = g.getAttribute('position');
  if (!p) return g;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    arr[i * 3] = r; arr[i * 3 + 1] = gv; arr[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

function boxAt(THREE, w, h, d, x, y, z, ry, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  if (color != null) paintGeo(THREE, g, color);
  return g;
}

function cylAt(THREE, rTop, rBot, h, x, y, z, rx, rz, color, segs) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs || 8);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  if (color != null) paintGeo(THREE, g, color);
  return g;
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
  const dummy = new THREE.Object3D();
  let written = 0;
  for (let i = 0; i < count; i++) {
    if (place(dummy, i) === false) continue;
    dummy.updateMatrix();
    mesh.setMatrixAt(written, dummy.matrix);
    written++;
  }
  mesh.count = written;
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

export function collectBuildingFootprints(root) {
  const tops = [];
  if (!root) return tops;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== 'BoxGeometry') return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((m) => m && m.userData && m.userData.looksFacade)) return;
    const p = o.geometry.parameters;
    if (!p || p.height < 6) return;
    tops.push({
      x: o.position.x, y: o.position.y, z: o.position.z,
      w: p.width, h: p.height, d: p.depth,
      top: o.position.y + p.height / 2,
    });
  });
  return tops;
}

export function hideStockCityMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m && m.userData && (m.userData.looksFacade || m.userData.looksRoof))) {
      o.visible = false;
      o.userData.artHidden = true;
      n++;
      return;
    }
    const t = o.geometry.type;
    const p = o.geometry.parameters || {};
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    // Palms (green fronds / tan trunks) and leftover AC boxes read as broken
    // roof shards from whoop height. Hide by color so a missed side/width
    // check cannot leave floating triangles on the skyline.
    if (col === 0x3f7a34 || col === 0x8a6a45 || col === 0x9aa0a8) {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (t === 'CylinderGeometry' && p.radiusTop < 0.4 && p.height < 14) {
      o.visible = false; o.userData.artHidden = true; n++;
    } else if (t === 'PlaneGeometry' && o.material && (o.material.side === 2 || p.width < 6)) {
      o.visible = false; o.userData.artHidden = true; n++;
    } else if (t === 'BoxGeometry' && p.height <= 1.85 && p.width < 8 && o.position.y > 10) {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

function windowMaterial(THREE, vibe, seed) {
  const rng = mulberry32(seed || 9001);
  const walls = [vibe.palette.facade, vibe.palette.facadeAlt, '#241018', '#0e1628', '#1a1410', '#22101a'];
  const wall = walls[(seed || 0) % walls.length];
  const map = canvasTex(THREE, 256, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, wall);
    gr.addColorStop(0.72, wall);
    gr.addColorStop(1, '#07060a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, 430, 256, 82);
    const cols = 6, rows = 14, wx = 256 / cols, wy = 512 / rows;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const on = rng() < 0.46;
        const kind = rng();
        if (on) {
          g.fillStyle = kind < 0.4 ? vibe.palette.windowOn : (kind < 0.75 ? vibe.palette.windowAlt : '#ff8ad4');
          g.globalAlpha = 0.55 + rng() * 0.45;
        } else {
          g.fillStyle = 'rgb(10,8,16)';
          g.globalAlpha = 0.85;
        }
        g.fillRect(c * wx + wx * 0.18, r * wy + wy * 0.2, wx * 0.64, wy * 0.52);
        g.globalAlpha = 1;
        if (on && rng() < 0.35) {
          g.fillStyle = 'rgba(40,20,50,0.45)';
          g.fillRect(c * wx + wx * 0.18, r * wy + wy * 0.2, wx * 0.28, wy * 0.52);
        }
        g.fillStyle = 'rgba(255,43,214,0.22)';
        g.fillRect(c * wx + wx * 0.18, r * wy + wy * 0.2, wx * 0.64, 2);
      }
    }
    g.fillStyle = vibe.palette.neonB;
    g.globalAlpha = 0.55;
    g.fillRect(0, 8, 256, 3);
    g.globalAlpha = 1;
  }, 1, 1);
  const emit = canvasTex(THREE, 256, 512, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 512);
    const cols = 6, rows = 14, wx = 256 / cols, wy = 512 / rows;
    const rngE = mulberry32((seed || 0) + 17);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        if (rngE() > 0.46) continue;
        const kind = rngE();
        g.fillStyle = kind < 0.4 ? vibe.palette.windowOn : (kind < 0.75 ? vibe.palette.windowAlt : '#ff8ad4');
        g.fillRect(c * wx + wx * 0.18, r * wy + wy * 0.2, wx * 0.64, wy * 0.52);
      }
    }
  }, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: emit,
    emissive: 0xffffff,
    emissiveIntensity: 1.35,
    roughness: 0.78,
    metalness: 0.12,
    color: 0xffffff,
    envMapIntensity: 0,
  });
  skipMat(mat);
  mat.userData.cityWindow = true;
  mat.userData.cityWindowPhase = ((seed || 0) % 997) * 0.31;
  return mat;
}

function signAtlas(THREE, vibe) {
  return canvasTex(THREE, 1024, 512, (g, w, h) => {
    g.fillStyle = '#08060c';
    g.fillRect(0, 0, w, h);
    const cols = 8, rows = 2;
    const cw = w / cols, ch = h / rows;
    const colsA = [vibe.palette.neonA, vibe.palette.neonB, vibe.palette.neonC, '#ffe08a'];
    for (let i = 0; i < SIGN_WORDS.length; i++) {
      const c = i % cols, r = (i / cols) | 0;
      const x = c * cw, y = r * ch;
      g.fillStyle = '#100818';
      g.fillRect(x + 6, y + 8, cw - 12, ch - 16);
      g.strokeStyle = colsA[i % colsA.length];
      g.lineWidth = 6;
      g.strokeRect(x + 10, y + 12, cw - 20, ch - 24);
      g.fillStyle = colsA[i % colsA.length];
      g.font = 'bold 42px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(SIGN_WORDS[i], x + cw / 2, y + ch / 2 - 6);
      g.globalAlpha = 0.55;
      g.font = '16px sans-serif';
      g.fillText('· ' + '△▽◇'[i % 3] + ' ·', x + cw / 2, y + ch / 2 + 32);
      g.globalAlpha = 1;
    }
  }, 1, 1);
}

function wetGround(THREE, vibe) {
  return canvasTex(THREE, 1024, 1024, (g, s) => {
    g.fillStyle = vibe.palette.street;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = `rgba(90,70,120,${0.03 + Math.random() * 0.07})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    const rw = s * 0.16, sw = s * 0.04;
    g.fillStyle = vibe.palette.sidewalk;
    g.fillRect(0, 0, s, rw + sw);
    g.fillRect(0, 0, rw + sw, s);
    g.fillStyle = '#1c1624';
    for (let u = 0; u < s; u += 28) {
      for (let v = 0; v < rw + sw; v += 28) {
        g.fillRect(u + 1, v + 1, 26, 26);
      }
      for (let v = 0; v < rw + sw; v += 28) {
        g.fillRect(v + 1, u + 1, 26, 26);
      }
    }
    g.fillStyle = vibe.palette.street;
    g.fillRect(0, 0, s, rw);
    g.fillRect(0, 0, rw, s);
    g.strokeStyle = '#d8c878';
    g.setLineDash([]);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, rw * 0.18); g.lineTo(s, rw * 0.18);
    g.moveTo(0, rw * 0.82); g.lineTo(s, rw * 0.82);
    g.stroke();
    g.strokeStyle = vibe.palette.lane;
    g.setLineDash([18, 16]);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, rw / 2); g.lineTo(s, rw / 2);
    g.stroke();
    g.strokeStyle = vibe.palette.laneAlt;
    g.beginPath();
    g.moveTo(rw / 2, 0); g.lineTo(rw / 2, s);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(240,240,250,0.78)';
    for (let k = 0; k < 6; k++) {
      const cx = 80 + k * 150;
      for (let b = 0; b < 5; b++) g.fillRect(cx + b * 10, rw * 0.28, 6, rw * 0.44);
    }
    g.fillStyle = '#3a3640';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.arc(120 + i * 110, 200 + (i % 3) * 180, 10, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 28; i++) {
      g.strokeStyle = i % 2 ? 'rgba(0,240,255,0.22)' : 'rgba(255,43,214,0.2)';
      g.lineWidth = 10 + (i % 5) * 4;
      g.beginPath();
      const x = (i * 73) % s;
      g.moveTo(x, 0);
      g.lineTo(x + ((i % 7) - 3) * 8, s);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }, 10, 10);
}

function makeRoofHutGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 1.35, 0.82, 1.15, 0, 0.42, 0, 0),
    boxAt(THREE, 0.55, 0.32, 0.55, 0.28, 0.98, 0.12, 0),
    boxAt(THREE, 0.72, 0.62, 0.72, -0.22, 1.12, -0.18, 0),
  ]);
}

function makePlusSignGeo(THREE, w, h, t) {
  return mergeGeos(THREE, [
    boxAt(THREE, w, h, t, 0, 0, 0, 0),
    boxAt(THREE, t, h, w, 0, 0, 0, 0),
  ]);
}

function makeLowSignGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 2.2, 0.95, 0.22, 0, 0.48, 0, 0),
    boxAt(THREE, 0.22, 0.95, 2.2, 0, 0.48, 0, 0),
    boxAt(THREE, 0.16, 1.15, 0.16, 0, -0.22, 0, 0),
  ]);
}

function makeFireEscapeGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 1.35, 0.08, 0.62, 0, 0, 0, 0),
    boxAt(THREE, 0.08, 1.05, 0.62, -0.64, 0.52, 0, 0),
    boxAt(THREE, 0.08, 1.05, 0.62, 0.64, 0.52, 0, 0),
    boxAt(THREE, 1.35, 0.08, 0.62, 0, 1.04, 0, 0),
  ]);
}

function makeBlimpGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 7.2, 1.8, 1.8, 0, 0, 0, 0),
    boxAt(THREE, 1.4, 0.7, 0.18, -3.2, 0.15, 0, 0),
    boxAt(THREE, 0.18, 1.1, 1.4, 3.2, 0.2, 0, 0),
  ]);
}

export const CAR_TYPES = Object.freeze(['sedan', 'hatch', 'van', 'taxi']);

export function carTypeForSeed(seed) {
  const s = Math.abs(Number(seed));
  const n = Number.isFinite(s) ? s : 0;
  return CAR_TYPES[(Math.floor(n * 997) + Math.floor(n * 13)) % CAR_TYPES.length];
}

// Local +X is forward. Yaw around Y maps that to world (cos yaw, 0, -sin yaw).
export function carYawFromDir(dx, dz) {
  const len = Math.hypot(dx, dz) || 1;
  return Math.atan2(-(dz / len), dx / len) || 0;
}

export function carHeading(p) {
  if (!p) return 0;
  const curb = (v) => Math.abs(v) >= 8 && Math.abs(v) <= 18;
  if (curb(p.x) && !curb(p.z)) return p.x >= 0 ? carYawFromDir(0, -1) : carYawFromDir(0, 1);
  if (curb(p.z) && !curb(p.x)) return p.z >= 0 ? carYawFromDir(-1, 0) : carYawFromDir(1, 0);
  return (p.ry || 0) + Math.PI / 2;
}

function carPalette(type, vibe) {
  const win = vibe && vibe.windowAlt ? hexNum(vibe.windowAlt) : 0x4ad4e8;
  const glass = win;
  if (type === 'taxi') {
    return { body: 0xffc43a, accent: 0x161018, cabin: 0x2a2010, glass, tire: 0x121014, rim: 0x3a3a42, head: 0xfff4c8, tail: 0xff2a33 };
  }
  if (type === 'van') {
    return { body: 0x1a2438, accent: 0x00c8e0, cabin: 0x152030, glass, tire: 0x121014, rim: 0x4a5560, head: 0xfff1c2, tail: 0xff3355 };
  }
  if (type === 'hatch') {
    return { body: 0x3a1030, accent: 0xff2bd6, cabin: 0x241028, glass, tire: 0x121014, rim: 0x3a3a42, head: 0xffe6aa, tail: 0xff2a55 };
  }
  return { body: 0x24142e, accent: 0x7a4dff, cabin: 0x1a1024, glass, tire: 0x121014, rim: 0x3a3a42, head: 0xffe6aa, tail: 0xff2a33 };
}

function carWheels(THREE, wb, track, r, w, pal) {
  const parts = [];
  const axles = [wb, -wb];
  const sides = [track, -track];
  for (const x of axles) {
    for (const z of sides) {
      parts.push(cylAt(THREE, r, r, w, x, r, z, Math.PI / 2, 0, pal.tire, 8));
      parts.push(cylAt(THREE, r * 0.55, r * 0.55, w + 0.04, x, r, z, Math.PI / 2, 0, pal.rim, 8));
    }
  }
  return parts;
}

// Merged, vertex-colored car. +X forward, wheels sit on y=0. One draw per type.
export function makeCarGeo(THREE, type, vibe) {
  const kind = CAR_TYPES.indexOf(type) >= 0 ? type : 'sedan';
  const pal = carPalette(kind, vibe && vibe.palette);
  const parts = [];
  const wheel = (wb, track, r, w) => { parts.push.apply(parts, carWheels(THREE, wb, track, r, w, pal)); };

  if (kind === 'van') {
    wheel(1.35, 0.84, 0.34, 0.24);
    parts.push(boxAt(THREE, 1.15, 0.55, 1.72, 1.55, 0.72, 0, 0, pal.body)); // hood
    parts.push(boxAt(THREE, 3.15, 1.55, 1.78, -0.35, 1.22, 0, 0, pal.body)); // cabin box
    parts.push(boxAt(THREE, 0.08, 0.62, 1.55, 1.18, 1.55, 0, 0, pal.glass)); // windshield
    parts.push(boxAt(THREE, 1.9, 0.55, 0.06, -0.2, 1.55, 0.91, 0, pal.glass));
    parts.push(boxAt(THREE, 1.9, 0.55, 0.06, -0.2, 1.55, -0.91, 0, pal.glass));
    parts.push(boxAt(THREE, 0.06, 0.7, 1.5, -1.9, 1.58, 0, 0, pal.glass)); // rear window
    parts.push(boxAt(THREE, 0.16, 0.14, 0.32, 2.12, 0.72, 0.62, 0, pal.head));
    parts.push(boxAt(THREE, 0.16, 0.14, 0.32, 2.12, 0.72, -0.62, 0, pal.head));
    parts.push(boxAt(THREE, 0.12, 0.18, 0.38, -1.92, 0.78, 0.68, 0, pal.tail));
    parts.push(boxAt(THREE, 0.12, 0.18, 0.38, -1.92, 0.78, -0.68, 0, pal.tail));
    parts.push(boxAt(THREE, 0.35, 0.08, 1.7, 2.08, 0.48, 0, 0, pal.accent)); // bumper
  } else if (kind === 'hatch') {
    wheel(1.28, 0.80, 0.32, 0.22);
    parts.push(boxAt(THREE, 3.55, 0.58, 1.68, 0.05, 0.68, 0, 0, pal.body)); // lower
    parts.push(boxAt(THREE, 1.15, 0.22, 1.55, 1.35, 1.02, 0, 0, pal.body)); // hood
    parts.push(boxAt(THREE, 2.05, 0.78, 1.58, -0.35, 1.38, 0, 0, pal.cabin)); // cabin into hatch
    parts.push(boxAt(THREE, 0.7, 0.42, 1.52, -1.55, 1.22, 0, 0, pal.body)); // hatch tail
    parts.push(boxAt(THREE, 0.08, 0.52, 1.42, 0.68, 1.42, 0, 0, pal.glass)); // windshield
    parts.push(boxAt(THREE, 1.15, 0.42, 0.05, -0.15, 1.42, 0.80, 0, pal.glass));
    parts.push(boxAt(THREE, 1.15, 0.42, 0.05, -0.15, 1.42, -0.80, 0, pal.glass));
    parts.push(boxAt(THREE, 0.06, 0.48, 1.38, -1.85, 1.28, 0, 0, pal.glass));
    parts.push(boxAt(THREE, 0.16, 0.12, 0.30, 1.82, 0.70, 0.58, 0, pal.head));
    parts.push(boxAt(THREE, 0.16, 0.12, 0.30, 1.82, 0.70, -0.58, 0, pal.head));
    parts.push(boxAt(THREE, 0.12, 0.14, 0.36, -1.78, 0.72, 0.62, 0, pal.tail));
    parts.push(boxAt(THREE, 0.12, 0.14, 0.36, -1.78, 0.72, -0.62, 0, pal.tail));
  } else {
    // sedan + taxi share the three-box silhouette (hood / cabin / trunk)
    wheel(1.32, 0.82, 0.32, 0.22);
    parts.push(boxAt(THREE, 3.85, 0.58, 1.70, 0.0, 0.68, 0, 0, pal.body));
    parts.push(boxAt(THREE, 1.20, 0.22, 1.55, 1.38, 1.04, 0, 0, pal.body)); // hood
    parts.push(boxAt(THREE, 1.55, 0.72, 1.55, -0.12, 1.38, 0, 0, pal.cabin)); // cabin
    parts.push(boxAt(THREE, 0.95, 0.28, 1.52, -1.58, 1.02, 0, 0, pal.body)); // trunk
    parts.push(boxAt(THREE, 0.08, 0.52, 1.40, 0.64, 1.42, 0, 0, pal.glass)); // windshield
    parts.push(boxAt(THREE, 0.95, 0.40, 0.05, -0.12, 1.42, 0.79, 0, pal.glass));
    parts.push(boxAt(THREE, 0.95, 0.40, 0.05, -0.12, 1.42, -0.79, 0, pal.glass));
    parts.push(boxAt(THREE, 0.06, 0.40, 1.35, -0.88, 1.40, 0, 0, pal.glass)); // rear window
    parts.push(boxAt(THREE, 0.16, 0.12, 0.30, 1.95, 0.70, 0.58, 0, pal.head));
    parts.push(boxAt(THREE, 0.16, 0.12, 0.30, 1.95, 0.70, -0.58, 0, pal.head));
    parts.push(boxAt(THREE, 0.12, 0.14, 0.36, -1.95, 0.72, 0.62, 0, pal.tail));
    parts.push(boxAt(THREE, 0.12, 0.14, 0.36, -1.95, 0.72, -0.62, 0, pal.tail));
    if (kind === 'taxi') {
      parts.push(boxAt(THREE, 0.55, 0.16, 1.55, 1.35, 1.12, 0, 0, pal.accent)); // black hood band
      parts.push(boxAt(THREE, 0.42, 0.18, 0.22, -0.05, 1.84, 0, 0, pal.body)); // roof lamp
      parts.push(boxAt(THREE, 0.28, 0.10, 0.16, -0.05, 1.96, 0, 0, 0xfff3a0));
    }
  }
  return mergeGeos(THREE, parts);
}

function makeBenchGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 1.9, 0.1, 0.58, 0, 0.44, 0, 0),
    boxAt(THREE, 1.9, 0.48, 0.08, 0, 0.74, -0.25, 0),
    boxAt(THREE, 0.1, 0.44, 0.52, -0.84, 0.22, 0, 0),
    boxAt(THREE, 0.1, 0.44, 0.52, 0.84, 0.22, 0, 0),
  ]);
}

function makeBinGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 0.5, 0.92, 0.5, 0, 0.46, 0, 0),
    boxAt(THREE, 0.56, 0.07, 0.56, 0, 0.94, 0, 0),
  ]);
}

function makeKioskGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 1.2, 1.9, 0.9, 0, 0.95, 0, 0),
    boxAt(THREE, 1.08, 0.62, 0.12, 0, 1.38, 0.42, 0),
    boxAt(THREE, 1.28, 0.1, 1.0, 0, 1.95, 0, 0),
  ]);
}

function makeVentGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 0.78, 0.14, 0.78, 0, 0.08, 0, 0),
    boxAt(THREE, 0.24, 0.32, 0.24, 0, 0.28, 0, 0),
  ]);
}

function makeVendingGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 1.1, 2.2, 0.7, 0, 1.1, 0, 0),
    boxAt(THREE, 0.85, 0.7, 0.12, 0, 1.45, 0.36, 0),
  ]);
}

function addStreetDressing(THREE, group, vibe, quality, gates) {
  const marks = [];
  const curbs = [];
  const pushMark = (x, z, w, d, ry) => {
    if (!propClearOfCourse(x, z, 0.03, gates || [], { gatePad: 4.4, corridor: 2.2 })) return;
    marks.push({ x, z, w, d, ry });
  };
  const pushCurb = (x, z, w, d, ry) => {
    if (!propClearOfCourse(x, z, 0.12, gates || [], { gatePad: 3.6, corridor: 3.4 })) return;
    curbs.push({ x, z, w, d, ry });
  };
  for (let a = -340; a <= 340; a += 10) {
    if (Math.abs(a) < 12) continue;
    pushMark(1.9, a, 0.32, 4.2, 0);
    pushMark(-1.9, a, 0.32, 4.2, 0);
    pushMark(a, 1.9, 4.2, 0.32, 0);
    pushMark(a, -1.9, 4.2, 0.32, 0);
    pushCurb(8.15, a, 0.55, 9.2, 0);
    pushCurb(-8.15, a, 0.55, 9.2, 0);
    pushCurb(a, 8.15, 9.2, 0.55, 0);
    pushCurb(a, -8.15, 9.2, 0.55, 0);
  }
  const crosses = [[0, 0], [0, 72], [0, -72], [72, 0], [-72, 0], [0, 144], [144, 0]];
  for (const [cx, cz] of crosses) {
    for (let i = -4; i <= 4; i++) {
      pushMark(cx + i * 0.85, cz, 0.42, 6.4, 0);
      pushMark(cx, cz + i * 0.85, 6.4, 0.42, 0);
    }
  }
  const markMat = skipMat(new THREE.MeshBasicMaterial({
    color: hexNum(vibe.palette.lane),
  }));
  addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), markMat, marks.length, (d, i) => {
    const m = marks[i];
    if (!m) return false;
    d.position.set(m.x, 0.022, m.z);
    d.scale.set(m.w, 0.03, m.d);
    d.rotation.set(0, m.ry, 0);
  });
  const curbMat = skipMat(new THREE.MeshBasicMaterial({ color: hexNum(vibe.palette.sidewalk) }));
  addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), curbMat, curbs.length, (d, i) => {
    const c = curbs[i];
    if (!c) return false;
    d.position.set(c.x, 0.11, c.z);
    d.scale.set(c.w, 0.22, c.d);
    d.rotation.set(0, c.ry, 0);
  });
  if (quality !== 'low') {
    const poolMat = skipMat(new THREE.MeshBasicMaterial({
      color: hexNum(vibe.palette.neonC),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const pools = [];
    for (let s = -360; s <= 360; s += 36) {
      if (Math.abs(s) < 16) continue;
      for (const p of [[14, s], [-14, s], [s, 14], [s, -14]]) {
        if (propClearOfCourse(p[0], p[1], 0.04, gates || [], { gatePad: 3.5, corridor: 4.2 })) {
          pools.push(p);
        }
      }
    }
    const n = Math.min(quality === 'high' ? 96 : 64, pools.length);
    addInstanced(THREE, group, new THREE.CircleGeometry(3.4, 12), poolMat, n, (d, i) => {
      const p = pools[i];
      if (!p) return false;
      d.position.set(p[0], 0.03, p[1]);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.set(1, 1, 1);
    });
  }
}

function addDiveHoops(THREE, group, vibe) {
  const hoopMat = neonMat(THREE, hexNum(vibe.palette.neonA), 4.8);
  const arms = [
    { x0: 150, y: 63, z0: -150, dx: -1, dz: 0, len: 50 },
    { x0: 150, y: 135, z0: -150, dx: 0, dz: 1, len: 50 },
  ];
  const spots = [];
  for (const a of arms) {
    for (let k = 0; k < 5; k++) {
      const t = 0.18 + k * 0.16;
      spots.push({
        x: a.x0 + a.dx * (9 + a.len * t),
        y: a.y,
        z: a.z0 + a.dz * (9 + a.len * t),
        ry: a.dx ? Math.PI / 2 : 0,
      });
    }
  }
  addInstanced(THREE, group, new THREE.TorusGeometry(3.1, 0.11, 8, 18), hoopMat, spots.length, (d, i) => {
    const s = spots[i];
    d.position.set(s.x, s.y, s.z);
    d.rotation.set(0, s.ry, 0);
    d.scale.set(1, 1, 1);
  });
}

function neonSignTex(THREE) {
  return canvasTex(THREE, 256, 96, (g, w, h) => {
    g.fillStyle = '#00f0ff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff2bd6';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.fillRect(0, 0, 10, h);
    g.fillRect(w - 10, 0, 10, h);
    g.fillStyle = '#070014';
    g.font = 'bold 48px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('NEON', w * 0.5, h * 0.54);
    g.fillStyle = '#ff7a18';
    g.fillRect(18, h * 0.5 - 16, 8, 32);
    g.fillRect(w - 26, h * 0.5 - 16, 8, 32);
  }, 1, 1);
}

function addHeroNeonSign(THREE, parent) {
  const hero = new THREE.Group();
  hero.name = 'cityArtHero';
  const x = 7.4, y = 4.8, z = 10.2;
  const cableMat = skipMat(new THREE.MeshBasicMaterial({ color: 0x2a2038 }));
  hero.add(new THREE.Mesh(mergeGeos(THREE, [
    boxAt(THREE, 0.06, 4.6, 0.06, x - 1.55, y + 2.4, z, 0),
    boxAt(THREE, 0.06, 4.6, 0.06, x + 1.55, y + 2.4, z, 0),
    boxAt(THREE, 5.4, 0.16, 0.16, x, y + 0.78, z, 0),
  ]), cableMat));
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(5.1, 1.28, 0.08),
    skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: neonSignTex(THREE), toneMapped: false, side: THREE.DoubleSide,
    })),
  );
  face.position.set(x, y, z);
  hero.add(face);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 16),
    skipMat(new THREE.MeshBasicMaterial({
      color: 0x00f0ff, toneMapped: false, transparent: true, opacity: 0.9,
    })),
  );
  disc.position.set(x, y - 0.88, z);
  disc.userData.cityCurrent = true;
  hero.add(disc);
  parent.add(hero);
}

function addSecretDressing(THREE, parent, vibe) {
  const mat = neonMat(THREE, hexNum(vibe.palette.neonA), 2.6, { color: 0x2a1428, roughness: 0.5 });
  const spots = [
    // Stack Roof {0, 13.55, 300} — triple cap.
    { x: 0, y: 13.2, z: 300, s: 2.2 },
    { x: -0.8, y: 13.62, z: 300, s: 0.7 },
    { x: 0.7, y: 13.62, z: 299.4, s: 0.55 },
    // Current Well {150, 168, -150} — dive crown.
    { x: 150, y: 167.55, z: -150, s: 2.6 },
    { x: 150, y: 168.15, z: -150, s: 0.85 },
    { x: 149.2, y: 168.0, z: -149.3, s: 0.5 },
  ];
  addInstanced(THREE, parent, new THREE.BoxGeometry(1, 0.22, 1), mat, spots.length, (d, i) => {
    const s = spots[i];
    d.position.set(s.x, s.y, s.z);
    d.scale.set(s.s, 1, s.s);
    d.rotation.set(0, i * 0.3, 0);
  });
}

export function restyleDiveTubes(root, vibe, THREE) {
  if (!root) return 0;
  let n = 0;
  let map = null;
  if (THREE) {
    map = canvasTex(THREE, 256, 128, (g, w, h) => {
      g.fillStyle = '#140814';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = i % 2 ? vibe.palette.neonA : vibe.palette.neonC;
        const x = 8 + i * 34;
        g.beginPath();
        g.moveTo(x, 18);
        g.lineTo(x + 20, 64);
        g.lineTo(x, 110);
        g.lineTo(x + 10, 110);
        g.lineTo(x + 30, 64);
        g.lineTo(x + 10, 18);
        g.closePath();
        g.fill();
      }
      g.fillStyle = vibe.palette.neonB;
      g.fillRect(0, 0, w, 8);
      g.fillRect(0, h - 8, w, 8);
    }, 3, 1);
  }
  root.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color || !o.geometry) return;
    const p = o.geometry.parameters || {};
    const isTube = o.geometry.type === 'BoxGeometry'
      && p.width >= 40 && p.height < 12 && p.depth < 12
      && Math.abs(p.height - p.depth) < 0.2;
    if (!isTube) return;
    const col = o.material.color.getHex();
    const em = o.material.emissive ? o.material.emissive.getHex() : 0;
    if (col !== 0x243040 && em !== 0x00f0ff) return;
    o.material.color.setHex(0x221028);
    if (o.material.emissive) o.material.emissive.setHex(hexNum(vibe.palette.neonA));
    o.material.emissiveIntensity = 0.78;
    if (map) {
      o.material.map = map;
      o.material.emissiveMap = map;
    }
    o.material.roughness = 0.4;
    o.material.metalness = 0.16;
    o.material.needsUpdate = true;
    o.userData.artLocked = true;
    o.userData.cityDive = true;
    n++;
  });
  return n;
}

function vec3FromHex(THREE, hex) {
  const n = hexNum(hex);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function applySkyTexture(THREE, skyMesh, vibe) {
  if (!skyMesh) return;
  if (!skyMesh.userData.origSkyMat && skyMesh.material) {
    skyMesh.userData.origSkyMat = skyMesh.material;
  }
  const mat = new THREE.ShaderMaterial({
    name: 'cityWorldSky',
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      uVoid: { value: vec3FromHex(THREE, vibe.palette.void) },
      uZenith: { value: vec3FromHex(THREE, vibe.palette.zenith) },
      uHorizon: { value: vec3FromHex(THREE, vibe.palette.horizon) },
      uDusk: { value: vec3FromHex(THREE, '#221036') },
      uMoonDir: { value: new THREE.Vector3(-420, 380, -680).normalize() },
    },
    vertexShader: [
      'varying vec3 vWorld;',
      'void main(){',
      '  vec4 w = modelMatrix * vec4(position, 1.0);',
      '  vWorld = w.xyz;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uVoid;',
      'uniform vec3 uZenith;',
      'uniform vec3 uHorizon;',
      'uniform vec3 uDusk;',
      'uniform vec3 uMoonDir;',
      'varying vec3 vWorld;',
      'void main(){',
      '  vec3 dir = normalize(vWorld);',
      '  float h = dir.y;',
      '  vec3 col = mix(uDusk, uHorizon, smoothstep(-0.12, 0.06, h));',
      '  col = mix(col, uZenith, smoothstep(0.04, 0.48, h));',
      '  col = mix(col, uVoid, smoothstep(0.42, 0.95, h));',
      '  float md = max(0.0, dot(dir, normalize(uMoonDir)));',
      '  col += vec3(0.62, 0.70, 1.0) * pow(md, 48.0) * 1.15;',
      '  col += vec3(0.28, 0.22, 0.55) * pow(md, 8.0) * 0.28;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  skyMesh.material = mat;
  skyMesh.userData.citySky = true;
  skyMesh.material.needsUpdate = true;
}

export function disposeArtGroup(root) {
  if (!root) return;
  if (root.parent) root.parent.remove(root);
  root.traverse((o) => {
    const kit = o.userData && (o.userData.cityKit || o.userData.garageKit);
    if (o.geometry && o.geometry.dispose && !kit) {
      try { o.geometry.dispose(); } catch (e) { /* ignore */ }
    }
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m) continue;
      if (m.map && m.map.userData && m.map.userData.looksComposed && m.map.dispose) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      if (m.dispose) {
        try { m.dispose(); } catch (e) { /* ignore */ }
      }
    }
  });
}

export function applyResolvedLighting(ctx, spec) {
  if (!spec || !spec.lighting) return spec;
  const L = spec.lighting;
  const { LIGHTING, sun, sunFill, hemi, scene, bloomPass, renderer } = ctx || {};
  if (LIGHTING) {
    LIGHTING.sunColor = L.sunColor;
    LIGHTING.sunIntensity = L.sunIntensity;
    LIGHTING.fillIntensity = L.fillIntensity;
    LIGHTING.hemiSky = L.hemiSky;
    LIGHTING.hemiGround = L.hemiGround;
    LIGHTING.hemiIntensity = L.hemiIntensity;
    LIGHTING.exposure = L.exposure;
    LIGHTING.fogColor = L.fogColor;
    LIGHTING.fogDensity = L.fogDensity;
    LIGHTING.bloomStrength = L.bloomStrength;
    LIGHTING.bloomRadius = L.bloomRadius;
    LIGHTING.bloomThreshold = L.bloomThreshold;
    LIGHTING.gateEmissive = L.gateEmissive;
    LIGHTING.gateEmissiveActive = L.gateEmissiveActive;
    // Backyard (and any later map) can pin a tighter sun frustum. Missing
    // fields restore the city afternoon defaults so indoor maps do not keep
    // a 30-unit whoop box after you leave Ryan's Yard.
    LIGHTING.sunElevation = L.sunElevation != null ? L.sunElevation : 18;
    LIGHTING.sunAzimuth = L.sunAzimuth != null ? L.sunAzimuth : 118;
    LIGHTING.shadowBias = L.shadowBias != null ? L.shadowBias : -0.0005;
    LIGHTING.shadowNormalBias = L.shadowNormalBias != null ? L.shadowNormalBias : 0.02;
    LIGHTING.shadowViewR = L.shadowViewR != null ? L.shadowViewR : null;
    LIGHTING.shadowHeight = L.shadowHeight != null ? L.shadowHeight : null;
  }
  if (sun) {
    sun.color.setHex(L.sunColor);
    sun.intensity = L.sunIntensity;
    if (sun.shadow && LIGHTING) {
      sun.shadow.bias = LIGHTING.shadowBias;
      sun.shadow.normalBias = LIGHTING.shadowNormalBias;
    }
  }
  if (sunFill) {
    sunFill.color.setHex(L.fillColor);
    sunFill.intensity = L.fillIntensity;
  }
  if (hemi) {
    hemi.color.setHex(L.hemiSky);
    hemi.groundColor.setHex(L.hemiGround);
    hemi.intensity = L.hemiIntensity;
  }
  const bgHex = spec.bgHex != null ? spec.bgHex : L.fogColor;
  const Color = (ctx && ctx.THREE && ctx.THREE.Color)
    || (typeof THREE !== 'undefined' ? THREE.Color : null);
  if (scene && scene.fog) {
    scene.fog.color.setHex(L.fogColor);
    scene.fog.density = L.fogDensity;
  }
  if (scene && (spec.citySky || (scene.background && scene.background.isColor))) {
    // Never share fog.color as scene.background — later fog writes then
    // recolor the sky. City keeps a night hex; other maps copy the fog hex
    // onto a separate Color.
    if (scene.background && scene.background.isColor && scene.fog && scene.background !== scene.fog.color) {
      scene.background.setHex(bgHex);
    } else if (Color) {
      scene.background = new Color(bgHex);
    }
  }
  if (scene && spec.citySky) {
    scene.environment = null;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0;
  } else if (scene && spec.envIntensity != null && 'environmentIntensity' in scene) {
    scene.environmentIntensity = spec.envIntensity;
  }
  if (renderer) renderer.toneMappingExposure = L.exposure;
  if (bloomPass) {
    bloomPass.strength = L.bloomStrength;
    bloomPass.radius = L.bloomRadius;
    bloomPass.threshold = L.bloomThreshold;
  }
  if (ctx && typeof ctx.applySunFrustum === 'function') ctx.applySunFrustum();
  return spec;
}

export function applyVibeLighting(ctx, vibe) {
  if (!vibe || !vibe.lighting) return;
  applyResolvedLighting(ctx, {
    mapId: vibe.id,
    citySky: vibe.id === 'city',
    lighting: vibe.lighting,
    looks: vibe.looks,
    bgHex: vibe.id === 'city' ? 0x070014 : vibe.lighting.fogColor,
    envIntensity: vibe.id === 'city' ? 0 : (vibe.looks && vibe.looks.env),
  });
}

function neonMat(THREE, color, emit, extra) {
  const hex = extra && extra.color != null ? extra.color : color;
  return feltEmissive(THREE, hex, extra);
}

function dullMat(THREE, color, extra) {
  return feltBasic(THREE, color, extra);
}

function wallHoleGeos(THREE, list, ax, alongZ, center, half, height, thick, holeX, holeW, holeH, sill) {
  if (holeW < 0.05 || holeH < 0.05) {
    if (alongZ) list.push(boxAt(THREE, thick, height, half * 2, ax, height / 2, center, 0));
    else list.push(boxAt(THREE, half * 2, height, thick, center, height / 2, ax, 0));
    return;
  }
  const leftW = holeX - holeW / 2 - (center - half);
  const rightW = (center + half) - (holeX + holeW / 2);
  const sillH = sill || 0;
  const lintelH = height - (sillH + holeH);
  if (alongZ) {
    if (leftW > 0.05) list.push(boxAt(THREE, thick, height, leftW, ax, height / 2, center - half + leftW / 2, 0));
    if (rightW > 0.05) list.push(boxAt(THREE, thick, height, rightW, ax, height / 2, center + half - rightW / 2, 0));
    if (sillH > 0.05) list.push(boxAt(THREE, thick, sillH, holeW, ax, sillH / 2, holeX, 0));
    if (lintelH > 0.05) list.push(boxAt(THREE, thick, lintelH, holeW, ax, sillH + holeH + lintelH / 2, holeX, 0));
  } else {
    if (leftW > 0.05) list.push(boxAt(THREE, leftW, height, thick, center - half + leftW / 2, height / 2, ax, 0));
    if (rightW > 0.05) list.push(boxAt(THREE, rightW, height, thick, center + half - rightW / 2, height / 2, ax, 0));
    if (sillH > 0.05) list.push(boxAt(THREE, holeW, sillH, thick, holeX, sillH / 2, ax, 0));
    if (lintelH > 0.05) list.push(boxAt(THREE, holeW, lintelH, thick, holeX, sillH + holeH + lintelH / 2, ax, 0));
  }
}

function slabHoleGeos(THREE, list, sx, y, sz, sw, sd, h, hx, hz, holeW, holeD) {
  const slabMinX = sx - sw / 2, slabMaxX = sx + sw / 2;
  const slabMinZ = sz - sd / 2, slabMaxZ = sz + sd / 2;
  const holeMinX = hx - holeW / 2, holeMaxX = hx + holeW / 2;
  const holeMinZ = hz - holeD / 2, holeMaxZ = hz + holeD / 2;
  const cy = y + h / 2;
  const leftW = holeMinX - slabMinX;
  const rightW = slabMaxX - holeMaxX;
  if (leftW > 0.08) list.push(boxAt(THREE, leftW, h, sd, slabMinX + leftW / 2, cy, sz, 0));
  if (rightW > 0.08) list.push(boxAt(THREE, rightW, h, sd, slabMaxX - rightW / 2, cy, sz, 0));
  const south = holeMinZ - slabMinZ;
  const north = slabMaxZ - holeMaxZ;
  if (south > 0.08) list.push(boxAt(THREE, holeW, h, south, hx, cy, slabMinZ + south / 2, 0));
  if (north > 0.08) list.push(boxAt(THREE, holeW, h, north, hx, cy, slabMaxZ - north / 2, 0));
}

function frameGeos(THREE, list, x, y, z, w, h, d, t) {
  list.push(boxAt(THREE, w, t, t, x, y + h / 2, z + d / 2, 0));
  list.push(boxAt(THREE, w, t, t, x, y + h / 2, z - d / 2, 0));
  list.push(boxAt(THREE, t, h, t, x + w / 2, y + h / 2, z, 0));
  list.push(boxAt(THREE, t, h, t, x - w / 2, y + h / 2, z, 0));
}

function exploreBuildingGeos(THREE, shell, glow, b) {
  const t = b.wall, hx = b.w / 2, hz = b.d / 2;
  const westHole = b.door.side === 'west' ? b.door : (b.window.side === 'west' ? b.window : null);
  const eastHole = b.door.side === 'east' ? b.door : (b.window.side === 'east' ? b.window : null);
  const northHole = b.door.side === 'north' ? b.door : (b.window.side === 'north' ? b.window : null);
  const southHole = b.door.side === 'south' ? b.door : (b.window.side === 'south' ? b.window : null);
  wallHoleGeos(THREE, shell, b.x - hx, true, b.z, hz, b.h, t,
    b.z, westHole ? westHole.w : 0, westHole ? westHole.h : 0, westHole && westHole.sill);
  wallHoleGeos(THREE, shell, b.x + hx, true, b.z, hz, b.h, t,
    b.z, eastHole ? eastHole.w : 0, eastHole ? eastHole.h : 0, eastHole && eastHole.sill);
  wallHoleGeos(THREE, shell, b.z + hz, false, b.x, hx, b.h, t,
    b.x, northHole ? northHole.w : 0, northHole ? northHole.h : 0, northHole && northHole.sill);
  wallHoleGeos(THREE, shell, b.z - hz, false, b.x, hx, b.h, t,
    b.x, southHole ? southHole.w : 0, southHole ? southHole.h : 0, southHole && southHole.sill);
  const st = b.stair;
  for (const fy of b.floors) {
    slabHoleGeos(THREE, shell, b.x, fy, b.z, b.w - t, b.d - t, 0.14,
      b.x + st.x, b.z + st.z, st.w + 0.15, st.d + 0.15);
  }
  slabHoleGeos(THREE, shell, b.x, b.h - 0.16, b.z, b.w + 0.2, b.d + 0.2, 0.16,
    b.x, b.z, b.roofHole.w, b.roofHole.d);
  const topY = b.floors[b.floors.length - 1] || 3.15;
  const rise = topY / st.treads;
  const stepD = st.d / st.treads;
  for (let i = 0; i < st.treads; i++) {
    shell.push(boxAt(THREE, st.w, rise, stepD + 0.04,
      b.x + st.x, i * rise + rise / 2, b.z + st.z - st.d / 2 + stepD * (i + 0.5), 0));
  }
  shell.push(boxAt(THREE, b.w * 0.42, 2.20, t, b.x, 1.10, b.z + 0.35, 0));
  const holes = [b.door, b.window];
  for (const hole of holes) {
    if (!hole) continue;
    const sill = hole.sill || 0;
    if (hole.side === 'west') frameGeos(THREE, glow, b.x - hx, sill, b.z, t + 0.08, hole.h, hole.w, 0.08);
    if (hole.side === 'east') frameGeos(THREE, glow, b.x + hx, sill, b.z, t + 0.08, hole.h, hole.w, 0.08);
    if (hole.side === 'north') frameGeos(THREE, glow, b.x, sill, b.z + hz, hole.w, hole.h, t + 0.08, 0.08);
    if (hole.side === 'south') frameGeos(THREE, glow, b.x, sill, b.z - hz, hole.w, hole.h, t + 0.08, 0.08);
  }
  frameGeos(THREE, glow, b.x, b.h - 0.22, b.z, b.roofHole.w + 0.24, 0.18, b.roofHole.d + 0.24, 0.08);
}

function addCityExplore(THREE, shell, glow) {
  exploreBuildingGeos(THREE, shell, glow, CITY_PLAY.loftA);
  exploreBuildingGeos(THREE, shell, glow, CITY_PLAY.loftB);
  exploreBuildingGeos(THREE, shell, glow, CITY_PLAY.walkup);
  for (const s of CITY_PLAY.spins) {
    shell.push(cylAt(THREE, s.r, s.r * 1.15, s.h, s.x, s.h / 2, s.z, 0, 0, null, 6));
    if (s.kind === 'lamp') {
      glow.push(boxAt(THREE, 0.62, 0.12, 0.62, s.x, s.h + 0.08, s.z, 0));
    } else if (s.kind === 'tree') {
      shell.push(cylAt(THREE, 0.05, 1.20, 1.85, s.x, s.h * 0.70, s.z, 0, 0, null, 6));
    }
  }
}

export function buildNeonCity(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'cityArtVisuals';
  parent.add(group);
  const budget = qualityBudget(quality);
  const rng = mulberry32(4242);
  const footprints = collectBuildingFootprints(parent);
  for (const b of planPortalBlocks(gates || [], quality)) footprints.push(b);
  // Visual-only skybridge docks: west arm mouth ~ (92.5, 63, -150), south
  // arm mouth ~ (150, 135, -92.5). Buildings sit just off the fly-through
  // centerline so the teal arm reads as plugged into a windowed tower.
  footprints.push(
    { x: 92, y: 39, z: -166, w: 18, h: 78, d: 32, top: 78 },
    { x: 166, y: 74, z: -92, w: 32, h: 148, d: 16, top: 148 },
  );
  hideStockCityMeshes(parent);
  const planned = planCityProps(gates || [], quality);
  group.userData.planned = planned;
  group.userData.budget = budget;

  const winMats = [0, 1, 2, 3].map((i) => windowMaterial(THREE, vibe, 4200 + i * 97));
  const corePools = [[], [], [], []];
  const ledges = [];
  const trim = [];
  addCityExplore(THREE, trim, ledges);
  for (let bi = 0; bi < footprints.length; bi++) {
    const b = footprints[bi];
    corePools[bi % 4].push(b);
    ledges.push(boxAt(THREE, b.w + 0.7, 0.22, b.d + 0.7, b.x, b.top + 0.12, b.z, 0));
    if (b.h > 16) {
      ledges.push(boxAt(THREE, b.w + 0.45, 0.16, b.d + 0.45, b.x, b.y - b.h * 0.12, b.z, 0));
    }
    trim.push(boxAt(THREE, b.w + 0.2, 0.35, 0.18, b.x, 2.1, b.z + b.d / 2 + 0.1, 0));
    trim.push(boxAt(THREE, 0.18, 0.35, b.d + 0.2, b.x + b.w / 2 + 0.1, 2.1, b.z, 0));
  }
  for (let p = 0; p < 4; p++) {
    const list = corePools[p];
    if (!list.length) continue;
    addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), winMats[p], list.length, (d, i) => {
      const b = list[i];
      if (!b) return false;
      d.position.set(b.x, b.y, b.z);
      d.scale.set(b.w, b.h, b.d);
      d.rotation.set(0, 0, 0);
    });
  }
  const ledgeMat = neonMat(THREE, hexNum(vibe.palette.neonB), 0.55, { roughness: 0.45, color: hexNum('#2a2038') });
  if (ledges.length) {
    const ledgeMesh = new THREE.Mesh(mergeGeos(THREE, ledges), ledgeMat);
    ledgeMesh.name = 'cityExploreGlow';
    ledgeMesh.userData.artKeep = true;
    group.add(ledgeMesh);
  }
  const trimMat = dullMat(THREE, hexNum('#2a1820'));
  if (trim.length) {
    const trimMesh = new THREE.Mesh(mergeGeos(THREE, trim), trimMat);
    trimMesh.name = 'cityExploreShell';
    trimMesh.userData.artKeep = true;
    group.add(trimMesh);
  }

  const hutMat = dullMat(THREE, 0x2a2438, { metalness: 0.18, roughness: 0.62, emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.12 });
  const acMat = dullMat(THREE, 0x3a3648, { metalness: 0.22, roughness: 0.55, emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.08 });
  const antMat = dullMat(THREE, 0x2a2030, { metalness: 0.35 });
  const blinkMat = neonMat(THREE, 0xff2a2a, 1.7);
  blinkMat.userData.cityBlink = true;
  const awnMat = neonMat(THREE, hexNum(vibe.palette.neonC), 1.1, { roughness: 0.55 });
  const balcMat = dullMat(THREE, 0x2a2030, { metalness: 0.3 });

  const roofN = Math.min(budget.roof, Math.max(1, footprints.length));
  addInstanced(THREE, group, makeRoofHutGeo(THREE), hutMat, roofN, (d, i) => {
    const b = footprints[i % footprints.length];
    if (!b) return false;
    d.position.set(b.x + (rng() - 0.5) * b.w * 0.28, b.top + 0.02, b.z + (rng() - 0.5) * b.d * 0.28);
    d.scale.set(1, 1, 1); d.rotation.set(0, (i % 4) * (Math.PI / 2), 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(1.15, 0.55, 0.95), acMat, roofN, (d, i) => {
    const b = footprints[(i * 3) % footprints.length];
    if (!b) return false;
    d.position.set(b.x + (rng() - 0.5) * b.w * 0.32, b.top + 0.38, b.z + (rng() - 0.5) * b.d * 0.32);
    d.scale.set(1, 1, 1); d.rotation.set(0, (i % 2) * Math.PI / 2, 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(0.14, 2.4, 0.14), antMat, roofN, (d, i) => {
    const b = footprints[(i * 5 + 1) % footprints.length];
    if (!b) return false;
    d.position.set(b.x + b.w * 0.22, b.top + 1.3, b.z - b.d * 0.18);
    d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.SphereGeometry(0.16, 8, 8), blinkMat, roofN, (d, i) => {
    const b = footprints[(i * 5 + 1) % footprints.length];
    if (!b) return false;
    d.position.set(b.x + b.w * 0.22, b.top + 2.6, b.z - b.d * 0.18);
    d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });

  const faceSpots = [];
  for (const b of footprints) {
    const faces = [
      { x: b.x, z: b.z + b.d / 2 + 0.55, ry: 0 },
      { x: b.x, z: b.z - b.d / 2 - 0.55, ry: Math.PI },
      { x: b.x + b.w / 2 + 0.55, z: b.z, ry: -Math.PI / 2 },
      { x: b.x - b.w / 2 - 0.55, z: b.z, ry: Math.PI / 2 },
    ];
    for (const f of faces) {
      if (propClearOfCourse(f.x, f.z, 4, gates || [], { gatePad: 4.2, corridor: 4.2 })) {
        faceSpots.push({ ...f, y: 3.2, h: b.h, top: b.top });
      }
    }
  }
  addInstanced(THREE, group, new THREE.BoxGeometry(2.6, 0.12, 1.1), awnMat, Math.min(budget.signs, faceSpots.length), (d, i) => {
    const f = faceSpots[(i * 3) % faceSpots.length];
    if (!f) return false;
    d.position.set(f.x, 3.05, f.z);
    d.rotation.set(0, f.ry, 0);
    d.scale.set(1, 1, 1);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(1.8, 0.7, 0.7), balcMat, Math.min(budget.roof, faceSpots.length), (d, i) => {
    const f = faceSpots[(i * 5 + 1) % faceSpots.length];
    if (!f) return false;
    d.position.set(f.x, 8 + (i % 3) * 4.2, f.z);
    d.rotation.set(0, f.ry, 0);
    d.scale.set(1, 1, 1);
  });
  const shopMat = neonMat(THREE, hexNum(vibe.palette.windowOn), 2.8, { color: 0x1a1420, roughness: 0.35 });
  addInstanced(THREE, group, new THREE.BoxGeometry(3.4, 1.55, 0.1), shopMat, Math.min(quality === 'low' ? 22 : 40, faceSpots.length), (d, i) => {
    const f = faceSpots[(i * 2) % faceSpots.length];
    if (!f) return false;
    d.position.set(f.x, 1.55, f.z);
    d.rotation.set(0, f.ry, 0);
    d.scale.set(1, 1, 1);
  });
  if (quality !== 'low') {
    addInstanced(THREE, group, makeFireEscapeGeo(THREE), dullMat(THREE, 0x2a2030, { metalness: 0.4, emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.16 }), Math.min(budget.roof, faceSpots.length), (d, i) => {
      const f = faceSpots[(i * 4 + 2) % faceSpots.length];
      if (!f || f.h < 18) return false;
      d.position.set(f.x, 6.4 + (i % 2) * 5.2, f.z);
      d.rotation.set(0, f.ry, 0);
      d.scale.set(1, 1, 1);
    });
  }

  const atlas = signAtlas(THREE, vibe);
  const signMat = skipMat(new THREE.MeshBasicMaterial({
    map: atlas, transparent: true, side: THREE.DoubleSide,
  }));
  signMat.userData.citySign = true;
  const holoMat = skipMat(new THREE.MeshBasicMaterial({
    map: atlas, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  holoMat.userData.cityHolo = true;
  const bladeN = Math.min(budget.signs, faceSpots.length);
  addInstanced(THREE, group, makePlusSignGeo(THREE, 0.85, 3.4, 0.12), signMat, bladeN, (d, i) => {
    const f = faceSpots[i];
    if (!f) return false;
    d.position.set(f.x, 5.6, f.z);
    d.rotation.set(0, f.ry, 0);
    d.scale.set(1, 1, 1);
  });
  addInstanced(THREE, group, makePlusSignGeo(THREE, 2.8, 0.7, 0.12), signMat, bladeN, (d, i) => {
    const f = faceSpots[(i + 4) % faceSpots.length];
    if (!f) return false;
    d.position.set(f.x, 4.15, f.z);
    d.rotation.set(0, f.ry, 0);
    d.scale.set(1, 1, 1);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(2.2, 3.0, 0.08), holoMat, Math.min(18, bladeN), (d, i) => {
    const f = faceSpots[(i * 7) % faceSpots.length];
    if (!f) return false;
    d.position.set(f.x, Math.min(f.top - 2, 14), f.z);
    d.rotation.set(0, f.ry, 0);
    d.scale.set(1, 1, 1);
  });

  const stripMat = neonMat(THREE, hexNum(vibe.palette.neonA), 1.8);
  addInstanced(THREE, group, new THREE.BoxGeometry(1, 0.08, 1), stripMat, Math.min(budget.strips, footprints.length), (d, i) => {
    const b = footprints[i];
    if (!b) return false;
    d.position.set(b.x, b.top + 0.38, b.z);
    d.scale.set(Math.max(2, b.w * 0.94), 1, Math.max(2, b.d * 0.94));
    d.rotation.set(0, 0, 0);
  });

  const lampMat = dullMat(THREE, 0x1a1420, { metalness: 0.45 });
  const bulbMat = neonMat(THREE, hexNum(vibe.palette.neonC), 1.9);
  const lampPos = [];
  for (let s = -360; s <= 360; s += 36) {
    if (Math.abs(s) < 16) continue;
    const cands = [[14, s], [-14, s], [s, 14], [s, -14]];
    for (const p of cands) {
      if (propClearOfCourse(p[0], p[1], 3.5, gates || [], { gatePad: 3.5, corridor: 4.2 })) lampPos.push(p);
    }
  }
  const lampN = Math.min(budget.lamps, lampPos.length);
  planned.lamps = lampPos.slice(0, lampN).map((p) => ({ x: p[0], z: p[1], y: 0, ry: 0, seed: 0 }));
  const lampPole = addInstanced(THREE, group, new THREE.CylinderGeometry(0.1, 0.14, 6.4, 6), lampMat, lampN, (d, i) => {
    const p = lampPos[i];
    d.position.set(p[0], 3.2, p[1]); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  if (lampPole) lampPole.userData.cityProcLamp = true;
  const lampBulb = addInstanced(THREE, group, new THREE.SphereGeometry(0.32, 8, 8), bulbMat, lampN, (d, i) => {
    const p = lampPos[i];
    d.position.set(p[0], 6.5, p[1]); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  if (lampBulb) lampBulb.userData.cityProcLamp = true;

  const byType = { sedan: [], hatch: [], van: [], taxi: [] };
  planned.cars.forEach((p, i) => {
    if (!p) return;
    const type = p.type || carTypeForSeed((p.seed || 0) + i * 0.17);
    p.type = type;
    byType[type].push(p);
  });
  let carMesh = null;
  for (let t = 0; t < CAR_TYPES.length; t++) {
    const type = CAR_TYPES[t];
    const list = byType[type];
    if (!list.length) continue;
    const carMat = skipMat(new THREE.MeshBasicMaterial({ vertexColors: true }));
    const mesh = addInstanced(THREE, group, makeCarGeo(THREE, type, vibe), carMat, list.length, (d, i) => {
      const p = list[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z);
      d.rotation.set(0, carHeading(p), 0);
      d.scale.set(1, 1, 1);
    });
    if (mesh) {
      carMesh = mesh;
      mesh.userData.cityProcCar = true;
      mesh.userData.carType = type;
      if (quality !== 'low') {
        mesh.userData.cityCruise = true;
        mesh.userData.dummy = new THREE.Object3D();
        mesh.userData.homes = list.map((p) => ({
          x: p.x, z: p.z, heading: carHeading(p),
          // Keep whoop-street curb cars parked so FPV at spawn still reads them.
          parked: Math.abs(p.x) < 22 && Math.abs(p.z) < 40,
        }));
      }
    }
  }

  if (planned.benches && planned.benches.length) {
    addInstanced(THREE, group, makeBenchGeo(THREE), skipMat(new THREE.MeshBasicMaterial({ color: 0x4a3a58 })), planned.benches.length, (d, i) => {
      const p = planned.benches[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
  }
  if (planned.bins && planned.bins.length) {
    const binMesh = addInstanced(THREE, group, makeBinGeo(THREE), dullMat(THREE, 0x2a3440, { metalness: 0.35, emissive: hexNum(vibe.palette.neonC), emissiveIntensity: 0.14 }), planned.bins.length, (d, i) => {
      const p = planned.bins[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
    if (binMesh) binMesh.userData.cityProcBin = true;
  }
  if (planned.kiosks && planned.kiosks.length) {
    const kioskMesh = addInstanced(THREE, group, makeKioskGeo(THREE), skipMat(new THREE.MeshBasicMaterial({ color: 0x4a3858 })), planned.kiosks.length, (d, i) => {
      const p = planned.kiosks[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
    if (kioskMesh) kioskMesh.userData.cityProcKiosk = true;
    const kioskNeon = addInstanced(THREE, group, new THREE.BoxGeometry(1.02, 0.55, 0.08), neonMat(THREE, hexNum(vibe.palette.neonA), 3.6), planned.kiosks.length, (d, i) => {
      const p = planned.kiosks[i];
      if (!p) return false;
      d.position.set(p.x + Math.sin(p.ry) * 0.48, 1.38, p.z + Math.cos(p.ry) * 0.48);
      d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
    if (kioskNeon) kioskNeon.userData.cityProcKiosk = true;
  }
  if (planned.awnings && planned.awnings.length) {
    const awnMesh = addInstanced(THREE, group, new THREE.BoxGeometry(2.8, 0.1, 1.45), neonMat(THREE, hexNum(vibe.palette.neonC), 1.4, { roughness: 0.5 }), planned.awnings.length, (d, i) => {
      const p = planned.awnings[i];
      if (!p) return false;
      d.position.set(p.x, 2.05, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
    if (awnMesh) awnMesh.userData.cityProcAwning = true;
  }
  if (planned.vents && planned.vents.length) {
    addInstanced(THREE, group, makeVentGeo(THREE), dullMat(THREE, 0x2a3038, { metalness: 0.55 }), planned.vents.length, (d, i) => {
      const p = planned.vents[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
  }
  if (planned.lowSigns && planned.lowSigns.length) {
    const signMesh = addInstanced(THREE, group, makeLowSignGeo(THREE), signMat, planned.lowSigns.length, (d, i) => {
      const p = planned.lowSigns[i];
      if (!p) return false;
      d.position.set(p.x, 1.1, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
    if (signMesh) signMesh.userData.cityProcLowSign = true;
  }

  const vendMat = neonMat(THREE, hexNum(vibe.palette.neonB), 1.8, { roughness: 0.45, color: 0x1a2030 });
  addInstanced(THREE, group, makeVendingGeo(THREE), vendMat, planned.vending.length, (d, i) => {
    const p = planned.vending[i];
    if (!p) return false;
    d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
  });
  addInstanced(THREE, group, new THREE.CylinderGeometry(0.16, 0.18, 1.25, 8), skipMat(new THREE.MeshBasicMaterial({ color: hexNum(vibe.palette.neonB) })), planned.bollards.length, (d, i) => {
    const p = planned.bollards[i];
    if (!p) return false;
    d.position.set(p.x, 0.62, p.z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  const headMat = neonMat(THREE, 0xffcc44, 3.6);
  const trafficPole = addInstanced(THREE, group, new THREE.BoxGeometry(0.35, 1.6, 0.35), dullMat(THREE, 0x1a1c20), planned.traffic.length, (d, i) => {
    const p = planned.traffic[i];
    if (!p) return false;
    d.position.set(p.x, 2.4, p.z); d.scale.set(1, 1, 1); d.rotation.set(0, p.ry, 0);
  });
  if (trafficPole) trafficPole.userData.cityProcTraffic = true;
  const trafficHead = addInstanced(THREE, group, new THREE.BoxGeometry(0.22, 0.55, 0.18), headMat, planned.traffic.length, (d, i) => {
    const p = planned.traffic[i];
    if (!p) return false;
    d.position.set(p.x, 3.05, p.z); d.scale.set(1, 1, 1); d.rotation.set(0, p.ry, 0);
  });
  if (trafficHead) trafficHead.userData.cityProcTraffic = true;
  addInstanced(THREE, group, new THREE.BoxGeometry(0.7, 0.7, 0.7), skipMat(new THREE.MeshBasicMaterial({ color: 0x8a6a9a })), planned.crates.length, (d, i) => {
    const p = planned.crates[i];
    if (!p) return false;
    d.position.set(p.x, 0.35, p.z); d.rotation.set(0, p.seed * 3, 0); d.scale.set(1, 1, 1);
  });
  addInstanced(THREE, group, new THREE.SphereGeometry(0.32, 6, 5), dullMat(THREE, 0x1a2218), planned.trash.length, (d, i) => {
    const p = planned.trash[i];
    if (!p) return false;
    d.position.set(p.x, 0.28, p.z); d.scale.set(1.1, 0.85, 1); d.rotation.set(0, 0, 0);
  });
  const lanMat = neonMat(THREE, hexNum(vibe.palette.neonA), 4.2);
  addInstanced(THREE, group, new THREE.SphereGeometry(0.22, 8, 8), lanMat, planned.lanterns.length, (d, i) => {
    const p = planned.lanterns[i];
    if (!p) return false;
    d.position.set(p.x, 5.1, p.z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), winMats[0], budget.skyline, (d, i) => {
    const a = (i / budget.skyline) * Math.PI * 2 + rng() * 0.06;
    const dist = 640 + rng() * 220;
    const h = 28 + Math.pow(rng(), 1.2) * 70;
    const w = 12 + rng() * 24;
    d.position.set(Math.cos(a) * dist, h / 2, Math.sin(a) * dist);
    d.scale.set(w, h, w * (0.65 + rng() * 0.5));
    d.rotation.set(0, a * 0.2, 0);
  });
  if (quality !== 'low') {
    const farN = quality === 'high' ? 48 : 32;
    const farMat = dullMat(THREE, 0x0a0614, { emissive: hexNum(vibe.palette.zenith), emissiveIntensity: 0.18 });
    addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), farMat, farN, (d, i) => {
      const a = (i / farN) * Math.PI * 2 + 0.2;
      const dist = 1180 + rng() * 180;
      const h = 40 + rng() * 90;
      const w = 18 + rng() * 28;
      d.position.set(Math.cos(a) * dist, h / 2, Math.sin(a) * dist);
      d.scale.set(w, h, w * 0.7);
      d.rotation.set(0, a, 0);
    });
  }

  const wirePos = [];
  const wireCol = [];
  const wc = new THREE.Color(vibe.palette.neonB);
  for (let i = 0; i < footprints.length - 1; i += 2) {
    const a = footprints[i], b = footprints[i + 1];
    if (!a || !b) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) > 90) continue;
    const midY = Math.min(a.top, b.top) - 1.2;
    wirePos.push(a.x, a.top - 0.4, a.z, (a.x + b.x) / 2, midY - 2.5, (a.z + b.z) / 2);
    wirePos.push((a.x + b.x) / 2, midY - 2.5, (a.z + b.z) / 2, b.x, b.top - 0.4, b.z);
    wireCol.push(wc.r, wc.g, wc.b, wc.r, wc.g, wc.b, wc.r, wc.g, wc.b, wc.r, wc.g, wc.b);
  }
  if (wirePos.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({
      color: hexNum(vibe.palette.neonB), transparent: true, opacity: 0.45,
    }));
    wires.name = 'cityWires';
    group.add(wires);
  }

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(28, 16, 16),
    skipMat(new THREE.MeshBasicMaterial({ color: 0xf4f7ff })),
  );
  moon.position.set(-420, 380, -680);
  moon.name = 'cityMoon';
  group.add(moon);
  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(56, 12, 12),
    skipMat(new THREE.MeshBasicMaterial({
      color: 0xc8d6ff, transparent: true, opacity: 0.42, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })),
  );
  moonGlow.position.copy(moon.position);
  group.add(moonGlow);

  if (budget.stars > 0) {
    const pos = new Float32Array(budget.stars * 3);
    for (let i = 0; i < budget.stars; i++) {
      const a = rng() * Math.PI * 2;
      const e = 0.2 + rng() * 1.1;
      const r = 1700;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffd6ff, size: 2, sizeAttenuation: false, fog: false, depthWrite: false,
    }));
    stars.name = 'cityStars';
    stars.userData.keepInScene = true;
    group.add(stars);
  }

  if (quality !== 'low') {
    const puddleMap = canvasTex(THREE, 256, 256, (g, s) => {
      const rad = g.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s * 0.5);
      rad.addColorStop(0, '#03060a');
      rad.addColorStop(0.28, '#05040a');
      rad.addColorStop(0.62, '#020208');
      rad.addColorStop(1, 'rgba(2,1,6,0)');
      g.fillStyle = rad;
      g.fillRect(0, 0, s, s);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(0,240,255,0.95)';
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(18, 30); g.lineTo(230, 196); g.stroke();
      g.strokeStyle = 'rgba(255,43,214,0.8)';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(40, 232); g.lineTo(220, 50); g.stroke();
      g.fillStyle = 'rgba(0,240,255,0.45)';
      g.fillRect(50, 88, 140, 4);
      g.fillStyle = 'rgba(255,43,214,0.35)';
      g.fillRect(70, 148, 90, 3);
      g.globalCompositeOperation = 'source-over';
    }, 1, 1);
    const puddleMat = skipMat(new THREE.MeshBasicMaterial({
      map: puddleMap, transparent: true, opacity: 0.92, depthWrite: false,
    }));
    const rng2 = mulberry32(3331);
    const spots = [];
    const addPuddle = (x, z, w, d, ry) => {
      if (Math.abs(x) < 26 && z > -24 && z < 44) return;
      if (Math.hypot(x + 118, z + 92) < 28) return;
      if (Math.hypot(x - 350, z + 350) < 36) return;
      if (!propClearOfCourse(x, z, 0.02, gates || [], { gatePad: 5, corridor: 2.6 })) return;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) return;
      spots.push({ x, z, w, d, ry });
    };
    for (const [fx, fz] of [[48, 80], [-70, 40]]) {
      addPuddle(fx, fz, 5.4, 3.6, 0.15);
    }
    for (let i = 0; i < 22; i++) {
      const along = (rng2() - 0.5) * 360;
      const side = (rng2() - 0.5) * 7.5;
      const x = i % 2 ? along : side;
      const z = i % 2 ? side : along;
      addPuddle(x, z, 3.4 + rng2() * 2.4, 2.4 + rng2() * 1.8, rng2() * Math.PI);
    }
    const puddleMesh = addInstanced(THREE, group, new THREE.PlaneGeometry(1, 1), puddleMat, spots.length, (d, i) => {
      const s = spots[i];
      if (!s) return false;
      d.position.set(s.x, 0.036, s.z);
      d.rotation.set(-Math.PI / 2, 0, s.ry);
      d.scale.set(s.w, s.d, 1);
    });
    if (puddleMesh) {
      puddleMesh.name = 'cityPuddles';
      puddleMesh.renderOrder = 2;
    }
  }

  addInstanced(THREE, group, new THREE.TorusGeometry(4.15, 0.09, 8, 24), neonMat(THREE, hexNum(vibe.palette.neonB), 4.4), 2, (d, i) => {
    const spots = [{ x: 0, z: -40, ry: 0 }, { x: 30, z: 60, ry: Math.PI / 4 }];
    const s = spots[i];
    d.position.set(s.x, 8, s.z);
    d.rotation.set(0, s.ry, 0);
    d.scale.set(1, 1.15, 1);
  });

  const manholes = [];
  for (let i = 0; i < 10; i++) {
    const x = (i % 2 ? 8 : -8), z = -200 + i * 42;
    if (!propClearOfCourse(x, z, 0.04, gates || [], { gatePad: 4, corridor: 3 })) continue;
    manholes.push(new THREE.Vector3(x, 0.04, z));
  }
  addInstanced(THREE, group, new THREE.CylinderGeometry(0.55, 0.55, 0.05, 10), dullMat(THREE, 0x2a2c30, { metalness: 0.7 }), manholes.length, (d, i) => {
    const p = manholes[i];
    d.position.copy(p); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  addStreetDressing(THREE, group, vibe, quality, gates);
  addDiveHoops(THREE, group, vibe);

  if (budget.particles && budget.rain > 0 && loadRain()) {
    const rp = new Float32Array(budget.rain * 3);
    for (let i = 0; i < budget.rain; i++) {
      rp[i * 3] = (rng() - 0.5) * 420;
      rp[i * 3 + 1] = rng() * 80;
      rp[i * 3 + 2] = (rng() - 0.5) * 420;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    const rain = new THREE.Points(rg, new THREE.PointsMaterial({
      color: 0xaaccff, size: 0.18, transparent: true, opacity: 0.45, depthWrite: false,
    }));
    rain.name = 'cityRain';
    rain.userData.cityRain = true;
    group.add(rain);
  }

  if (budget.trails > 0) {
    const trailMat = neonMat(THREE, hexNum(vibe.palette.neonA), 5.5);
    const trails = addInstanced(THREE, group, new THREE.BoxGeometry(4.2, 0.18, 0.18), trailMat, budget.trails, (d, i) => {
      d.position.set((rng() - 0.5) * 200, 55 + rng() * 40, (rng() - 0.5) * 200);
      d.rotation.set(0, rng() * Math.PI, 0);
      d.scale.set(1, 1, 1);
    });
    if (trails) {
      trails.userData.cityTrails = true;
      trails.userData.seeds = Array.from({ length: budget.trails }, () => rng());
      trails.userData.dummy = new THREE.Object3D();
    }
  }
  if (quality !== 'low') {
    const droneN = quality === 'high' ? 2 : 1;
    const droneMat = neonMat(THREE, hexNum(vibe.palette.neonB), 2.4, { color: 0x2a2038, roughness: 0.4 });
    const drones = addInstanced(THREE, group, makeBlimpGeo(THREE), droneMat, droneN, (d, i) => {
      d.position.set(80 + i * 40, 42 + i * 8, -60 - i * 30);
      d.rotation.set(0, i, 0);
      d.scale.set(1, 1, 1);
    });
    if (drones) {
      drones.userData.cityDrone = true;
      drones.userData.dummy = new THREE.Object3D();
      drones.userData.seeds = Array.from({ length: droneN }, () => rng());
    }
    const hangN = quality === 'high' ? 28 : 16;
    const hangMat = neonMat(THREE, hexNum(vibe.palette.neonA), 3.8);
    addInstanced(THREE, group, new THREE.BoxGeometry(8.5, 0.08, 0.08), hangMat, hangN, (d, i) => {
      const a = footprints[(i * 3) % footprints.length];
      const b = footprints[(i * 3 + 1) % footprints.length];
      if (!a || !b) return false;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 48) return false;
      if (!propClearOfCourse(mx, mz, 5, gates || [], { gatePad: 4, corridor: 3.6 })) return false;
      d.position.set(mx, 6.4 + (i % 3) * 0.8, mz);
      d.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
      d.scale.set(Math.min(1.2, Math.hypot(a.x - b.x, a.z - b.z) / 8.5), 1, 1);
    });
  }

  if (budget.particles) {
    const steamN = 80;
    const steamSrc = manholes.concat((planned.vents || []).map((p) => new THREE.Vector3(p.x, 0.04, p.z)));
    const sp = new Float32Array(steamN * 3);
    for (let i = 0; i < steamN && steamSrc.length; i++) {
      const m = steamSrc[i % steamSrc.length];
      sp[i * 3] = m.x + (rng() - 0.5) * 0.4;
      sp[i * 3 + 1] = 0.2 + rng() * 2.2;
      sp[i * 3 + 2] = m.z + (rng() - 0.5) * 0.4;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const steam = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xccddee, size: 0.35, transparent: true, opacity: 0.28, depthWrite: false,
    }));
    steam.name = 'citySteam';
    steam.userData.citySteam = true;
    group.add(steam);
  }

  const lights = [];
  const lightCols = [hexNum(vibe.palette.neonA), hexNum(vibe.palette.neonB), hexNum(vibe.palette.neonC)];
  const lightSpots = [[36, 14, 36], [-44, 12, -28], [8, 16, 90], [70, 12, -18], [-80, 15, 50]];
  for (let i = 0; i < budget.lights; i++) {
    const p = lightSpots[i];
    const l = new THREE.PointLight(lightCols[i % 3], 28, 55, 2);
    l.position.set(p[0], p[1], p[2]);
    l.castShadow = false;
    group.add(l);
    lights.push(l);
  }
  group.userData.artLights = lights;
  void carMesh;
  addHeroNeonSign(THREE, group);
  addSecretDressing(THREE, group, vibe);
  return group;
}

export function makeWetRoadMaterial(THREE, vibe) {
  const map = canvasTex(THREE, 512, 512, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 36; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,240,255,0.55)' : 'rgba(255,43,214,0.5)';
      const x = (i * 47 + 13) % s;
      g.fillRect(x, 0, 5 + (i % 4) * 3, s);
    }
    for (let i = 0; i < 18; i++) {
      const cx = (i * 89) % s, cz = (i * 53) % s;
      const rad = g.createRadialGradient(cx, cz, 2, cx, cz, 40 + (i % 5) * 10);
      rad.addColorStop(0, i % 2 ? 'rgba(0,240,255,0.7)' : 'rgba(255,43,214,0.65)');
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rad;
      g.beginPath();
      g.arc(cx, cz, 55, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    void vibe;
  }, 8, 8);
  const mat = skipMat(new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  mat.name = 'cityWetRoad';
  mat.userData.cityWet = true;
  return mat;
}

export function attachWetReflector(THREE, parent, vibe, quality) {
  const old = parent.getObjectByName('cityWetMirror');
  if (old && old.parent) old.parent.remove(old);
  if (!qualityWantsReflections(quality) || !parent) return null;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(720, 720), makeWetRoadMaterial(THREE, vibe));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.028;
  mesh.name = 'cityWetMirror';
  mesh.userData.cityWet = true;
  mesh.renderOrder = 1;
  parent.add(mesh);
  parent.userData.wetRoad = mesh;
  return mesh;
}

export function restyleLandmarks(root, vibe) {
  if (!root) return 0;
  let n = 0;
  const neonA = hexNum(vibe.palette.neonA);
  const neonB = hexNum(vibe.palette.neonB);
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.color) continue;
      const col = m.color.getHex();
      const em = m.emissive ? m.emissive.getHex() : 0;
      if (col === 0xC9B458 || col === 0x8A7A3A) {
        m.color.setHex(col === 0x8A7A3A ? 0x120816 : 0x1a1028);
        if (m.emissive) m.emissive.setHex(col === 0x8A7A3A ? neonA : neonB);
        m.emissiveIntensity = col === 0x8A7A3A ? 0.22 : 0.14;
        m.roughness = 0.55;
        m.metalness = 0.22;
        m.userData.artLocked = true;
        n++;
      } else if (col === 0xFF6A00 || em === 0xFF6A00) {
        m.color.setHex(neonB);
        if (m.emissive) m.emissive.setHex(neonB);
        m.userData.artLocked = true;
        n++;
      } else if (col === 0x17181d || col === 0x788089 || col === 0x8a8f96) {
        m.color.setHex(0x1a1428);
        if (m.emissive) m.emissive.setHex(neonB);
        m.emissiveIntensity = 0.12;
        m.roughness = 0.48;
        m.metalness = 0.38;
        m.userData.artLocked = true;
        n++;
      } else if (col === 0xc9a97a) {
        m.color.setHex(0x221028);
        if (m.emissive) m.emissive.setHex(neonA);
        m.emissiveIntensity = 0.16;
        m.userData.artLocked = true;
        n++;
      } else if ((col === 0xFF4D1A || o.userData.cityArch) && o.geometry && o.geometry.type === 'BoxGeometry') {
        const p = o.geometry.parameters || {};
        const archPost = Math.abs(p.height - 14) < 0.21 && Math.abs(p.width - 1.2) < 0.21;
        const archLint = Math.abs(p.width - 10) < 0.21 && Math.abs(p.height - 1.2) < 0.21;
        if (archPost || archLint || o.userData.cityArch) {
          m.color.setHex(neonA);
          if (m.emissive) m.emissive.setHex(neonA);
          m.emissiveIntensity = 2.6;
          m.roughness = 0.32;
          m.metalness = 0.38;
          m.userData.artLocked = true;
          n++;
        }
      }
    }
  });
  return n;
}

export function decorateVibeGate(THREE, ring, size, col, vibe, trackIdx) {
  if (!ring || ring.userData.artHalo) return null;
  const idx = ((trackIdx == null ? 0 : trackIdx) % GATE_STYLES.length + GATE_STYLES.length) % GATE_STYLES.length;
  const style = GATE_STYLES[idx];
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 6;
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(size + size * 0.12, size * 0.012, 6, 32),
    neonMat(THREE, col, emit),
  );
  halo.name = 'gateHalo';
  ring.add(halo);
  ring.userData.artHalo = halo;
  ring.userData.artStyle = style;
  const extras = [];
  if (style === 'halo-pips') {
    for (let i = 0; i < 6; i++) {
      const pip = new THREE.Mesh(new THREE.BoxGeometry(size * 0.08, size * 0.08, size * 0.08), neonMat(THREE, col, emit + 1));
      const a = i / 6 * Math.PI * 2;
      pip.position.set(Math.cos(a) * (size + 0.35), Math.sin(a) * (size + 0.35), 0);
      extras.push(pip);
    }
  } else if (style === 'square-frame') {
    const t = size * 0.06, s = size * 1.15;
    extras.push(new THREE.Mesh(new THREE.BoxGeometry(s * 2, t, t), neonMat(THREE, col, emit)));
    extras[0].position.y = s;
    const b = extras[0].clone(); b.position.y = -s; extras.push(b);
    extras.push(new THREE.Mesh(new THREE.BoxGeometry(t, s * 2, t), neonMat(THREE, col, emit)));
    extras[2].position.x = s;
    const r = extras[2].clone(); r.position.x = -s; extras.push(r);
  } else if (style === 'hex-ring') {
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(size * 1.05, size * 0.06, size * 0.06), neonMat(THREE, col, emit));
      bar.rotation.z = i * Math.PI / 3;
      extras.push(bar);
    }
  } else if (style === 'triple-hoop') {
    for (const k of [-0.22, 0.22]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(size * 0.92, size * 0.02, 6, 24), neonMat(THREE, col, emit));
      h.position.z = k * size;
      extras.push(h);
    }
  } else if (style === 'diamond') {
    const q = new THREE.Mesh(new THREE.TorusGeometry(size, size * 0.03, 6, 4), neonMat(THREE, col, emit));
    q.rotation.z = Math.PI / 4;
    extras.push(q);
  } else if (style === 'chevrons') {
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(size * 0.7, size * 0.08, size * 0.08), neonMat(THREE, col, emit));
      c.position.set(s * size * 0.55, size * 0.7, 0);
      c.rotation.z = s * 0.7;
      extras.push(c);
    }
  } else if (style === 'brackets') {
    for (const s of [-1, 1]) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(size * 0.12, size * 1.5, size * 0.12), neonMat(THREE, col, emit));
      br.position.x = s * (size + 0.4);
      extras.push(br);
    }
  } else if (style === 'scallop') {
    extras.push(new THREE.Mesh(new THREE.TorusGeometry(size + size * 0.2, size * 0.04, 6, 10), neonMat(THREE, col, emit)));
  } else if (style === 'oval') {
    const o = new THREE.Mesh(new THREE.TorusGeometry(size, size * 0.03, 6, 28), neonMat(THREE, col, emit));
    o.scale.set(1, 1.28, 1);
    extras.push(o);
  } else if (style === 'spokes') {
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 0.05, size * 0.05), neonMat(THREE, col, emit));
      const a = i / 8 * Math.PI * 2;
      sp.position.set(Math.cos(a) * size, Math.sin(a) * size, 0);
      extras.push(sp);
    }
  }
  for (const e of extras) {
    e.castShadow = false;
    e.receiveShadow = false;
    ring.add(e);
  }
  ring.userData.artExtras = extras;
  return halo;
}

export function pulseCityGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 5;
  if (isNext) {
    col = 0xffffff;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 8) + pulse * 2.2;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.05);
  } else if (passed) {
    col = 0x9a3cff;
    emit = 3.2;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickCityArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      const mu = o.material && o.material.userData;
      if (u.cityRain || u.citySteam || u.cityWet || u.cityTrails || u.cityCruise || u.cityCurrent || u.cityDrone || (mu && (mu.cityHolo || mu.cityWindow || mu.cityBlink))) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickCityArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickCityArtObject(o, t) {
    if (o.material && o.material.userData && o.material.userData.cityWindow) {
      o.material.emissiveIntensity = 1.30;
    }
    if (o.material && o.material.userData && o.material.userData.cityBlink) {
      o.material.emissiveIntensity = 1.55;
    }
    if (o.material && o.material.userData && o.material.userData.cityHolo && o.material.map) {
      o.material.map.offset.x = (t * 0.12) % 1;
    }
    if (o.userData && o.userData.cityRain && o.geometry) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - 0.9;
        if (y < 0) y = 70;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    if (o.userData && o.userData.citySteam && o.geometry) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + 0.012;
        if (y > 3.2) y = 0.15;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    if (o.userData && o.userData.cityWet && o.material && o.material.uniforms && o.material.uniforms.uTime) {
      o.material.uniforms.uTime.value = t;
    }
    if (o.userData && o.userData.cityTrails) {
      const dummy = o.userData.dummy;
      if (!dummy) return;
      const seeds = o.userData.seeds || [];
      for (let i = 0; i < o.count; i++) {
        const s = seeds[i] || 0.3;
        const a = t * (0.12 + s * 0.2) + i;
        dummy.position.set(Math.cos(a) * (140 + s * 80), 48 + s * 40, Math.sin(a * 0.7) * (140 + s * 60));
        dummy.rotation.set(0, a + Math.PI / 2, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        o.setMatrixAt(i, dummy.matrix);
      }
      o.instanceMatrix.needsUpdate = true;
    }
    if (o.userData && o.userData.cityCruise) {
      const dummy = o.userData.dummy;
      const homes = o.userData.homes || [];
      if (!dummy || !homes.length) return;
      for (let i = 0; i < o.count; i++) {
        const h = homes[i] || homes[0];
        const alongZ = Math.abs(h.x) < 18;
        const speed = 4.2 + (i % 5) * 0.6;
        const dir = (i % 2) ? 1 : -1;
        let x = h.x, z = h.z, yaw = h.heading;
        if (!h.parked) {
          if (alongZ) {
            z = ((h.z + t * speed * dir + 360) % 720) - 360;
            yaw = carYawFromDir(0, dir);
          } else {
            x = ((h.x + t * speed * dir + 360) % 720) - 360;
            yaw = carYawFromDir(dir, 0);
          }
        }
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        o.setMatrixAt(i, dummy.matrix);
      }
      o.instanceMatrix.needsUpdate = true;
    }
    if (o.userData && o.userData.cityCurrent) {
      const s = 1 + 0.08 * Math.sin(t * 2.4);
      o.scale.setScalar(s);
      if (o.material && o.material.opacity != null) {
        o.material.opacity = 0.75 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.4));
      }
    }
    if (o.userData && o.userData.cityDrone) {
      const dummy = o.userData.dummy;
      if (!dummy) return;
      const seeds = o.userData.seeds || [];
      for (let i = 0; i < o.count; i++) {
        const s = seeds[i] || 0.4;
        const a = t * (0.07 + s * 0.04) + i * 1.7;
        dummy.position.set(Math.cos(a) * (90 + s * 40), 38 + Math.sin(a * 0.6) * 6, Math.sin(a) * (90 + s * 40));
        dummy.rotation.set(0, a + Math.PI / 2, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        o.setMatrixAt(i, dummy.matrix);
      }
      o.instanceMatrix.needsUpdate = true;
    }
}

export function restyleMesas(root, vibe) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const tagged = !!(o.userData && o.userData.stockMesa);
    const p = o.geometry.parameters || {};
    const bigBowl = o.geometry.type === 'CylinderGeometry' && p.height >= 30 && p.radiusBottom >= 40;
    if (!tagged && !bigBowl) return;
    if (o.material && o.material.map) o.material.map = null;
    if (o.material && o.material.color) {
      o.material.color.setHex(hexNum(vibe.palette.void));
      o.material.emissive = o.material.emissive || o.material.color.clone();
      o.material.emissive.setHex(hexNum(vibe.palette.neonA));
      o.material.emissiveIntensity = 0;
      o.material.roughness = 1;
      o.material.userData.artLocked = true;
    }
    o.visible = false;
    o.userData.artHidden = true;
    o.userData.stockMesa = true;
    n++;
  });
  return n;
}

export function buildDreamlandArt(THREE, parent, vibe) {
  const DX = 1500, DZ = 1500;
  const group = new THREE.Group();
  group.name = 'dreamlandArt';
  group.position.set(DX, 0, DZ);
  const floorTex = canvasTex(THREE, 256, 256, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, '#140820');
    gr.addColorStop(0.5, '#2a1050');
    gr.addColorStop(1, '#3a1870');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = vibe.palette.neonB;
    g.globalAlpha = 0.35;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.arc(s / 2, s / 2, 18 + i * 14, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, 1, 1);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.88, metalness: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const pillarMat = skipMat(new THREE.MeshStandardMaterial({
    color: 0x221036, emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.55, roughness: 0.55,
  }));
  const capMat = neonMat(THREE, hexNum(vibe.palette.neonB), 3.4);
  const spots = [
    [-130, 60, 18], [140, -40, 16], [-40, -140, 14],
    [60, 130, 20], [-140, -60, 17], [120, 100, 15],
    [100, -120, 22], [-120, 90, 19], [20, 140, 16],
  ];
  addInstanced(THREE, group, new THREE.CylinderGeometry(1.1, 1.6, 1, 8), pillarMat, spots.length, (d, i) => {
    const s = spots[i];
    d.position.set(s[0], s[2] / 2, s[1]);
    d.scale.set(1, s[2], 1);
    d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.TorusGeometry(2.2, 0.18, 6, 16), capMat, spots.length, (d, i) => {
    const s = spots[i];
    d.position.set(s[0], s[2] + 0.4, s[1]);
    d.rotation.set(Math.PI / 2, 0, 0);
    d.scale.set(1, 1, 1);
  });
  const pl = new THREE.PointLight(0x8f6bff, 1.8, 420, 2);
  pl.position.set(0, 80, 0);
  group.add(pl);
  parent.add(group);
  return group;
}

export function restyleCity(THREE, ctx) {
  try {
    return restyleCityInner(THREE, ctx);
  } catch (err) {
    console.error('restyleCity', err);
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    applyVibeLighting(Object.assign({ THREE }, ctx), ctx.vibe);
    return { visuals: null, dream: null, vibe: ctx.vibe, quality: ctx.quality || 'med', error: String(err && err.message || err) };
  }
}

function restyleCityInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.proceduralGroup;
  if (ctx.ground && ctx.ground.material) {
    const gtex = wetGround(THREE, vibe);
    const mat = ctx.ground.material;
    if (mat.map && mat.map !== gtex && mat.userData && mat.userData.looksComposed) {
      try { mat.map.dispose(); } catch (e) { /* ignore */ }
    }
    mat.map = gtex;
    mat.color.setHex(0xffffff);
    mat.roughness = quality === 'low' ? 0.74 : 0.42;
    mat.metalness = quality === 'low' ? 0.08 : 0.22;
    if ('envMapIntensity' in mat) mat.envMapIntensity = 0;
    mat.emissive.setHex(hexNum(vibe.palette.neonA));
    mat.emissiveIntensity = quality === 'low' ? 0.03 : 0.06;
    applyFeltMaterial(mat);
    mat.userData.looksComposed = true;
    mat.normalMap = null;
    mat.roughnessMap = null;
    mat.needsUpdate = true;
  }
  if (ctx.skyMesh) applySkyTexture(THREE, ctx.skyMesh, vibe);
  if (ctx.sunSprite) ctx.sunSprite.visible = false;
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('cityArtVisuals');
    if (old) disposeArtGroup(old);
    const oldDress = root.getObjectByName('cityArtDressing');
    if (oldDress) disposeArtGroup(oldDress);
    visuals = buildNeonCity(THREE, root, vibe, quality, ctx.gates || []);
    attachWetReflector(THREE, visuals, vibe, quality);
  }
  const host = ctx.cityWorld || root;
  if (host) {
    const oldDream = host.getObjectByName('dreamlandArt');
    if (oldDream) disposeArtGroup(oldDream);
  }
  const dream = host ? buildDreamlandArt(THREE, host, vibe) : null;
  if (ctx.scene) {
    restyleMesas(ctx.scene, vibe);
    restyleLandmarks(ctx.scene, vibe);
    restyleDiveTubes(ctx.scene, vibe, THREE);
  }
  applyVibeLighting(Object.assign({ THREE }, ctx), vibe);
  if (root) root.userData.cityArtQuality = quality;
  return { visuals, dream, vibe, quality };
}

export function nightGround() { return null; }
export function buildCityDressing(THREE, parent, vibe, quality) {
  return buildNeonCity(THREE, parent, vibe, quality, []);
}
