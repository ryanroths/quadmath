// Neon Current — dense original city dressing. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.

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

export function qualityWantsBloom(applied) {
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
      skyline: 88, lamps: 96, strips: 96, stars: 140, lights: 5,
      cars: 56, signs: 88, roof: 96, street: 100, rain: 1200, shafts: 0, trails: 6,
      benches: 22, bins: 24, kiosks: 14, awnings: 18, vents: 18, lowSigns: 36,
      reflect: true, particles: true,
    };
  }
  return {
    skyline: 64, lamps: 72, strips: 72, stars: 90, lights: 3,
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
  pushIfClear(planned.cars, gates, 14.8, 48, 0.55, -Math.PI / 2, 5.0);
  pushIfClear(planned.cars, gates, -14.8, 48, 0.55, Math.PI / 2, 5.0);
  pushIfClear(planned.cars, gates, -112, -100, 0.55, -0.8, 5.0);
  pushIfClear(planned.cars, gates, 318, -330, 0.55, 0.7, 5.0);
  pushIfClear(planned.benches, gates, 9.0, 20, 0.42, -Math.PI / 2, 3.8);
  pushIfClear(planned.benches, gates, -9.0, 8, 0.42, Math.PI / 2, 3.8);
  pushIfClear(planned.lowSigns, gates, -128, -105, 1.45, 0.7, 4.2);
  pushIfClear(planned.lowSigns, gates, 320, -318, 1.45, 0.8, 4.2);
  pushIfClear(planned.kiosks, gates, 18.4, 36, 0.95, 0, 4.4);
  pushIfClear(planned.bins, gates, 8.8, 22, 0.45, -Math.PI / 2, 3.4);
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
  // Whoop-street FPV looks down the origin axes; thin signs and parked cars
  // there read as shards / pancakes. Keep that shot as road + puddles + skyline.
  const offStreetShot = (p) => Math.abs(p.x) > 16 || p.z < -12 || p.z > 44;
  planned.lowSigns = planned.lowSigns.filter(offStreetShot);
  planned.cars = planned.cars.filter(offStreetShot);
  planned.kiosks = (planned.kiosks || []).filter(offStreetShot);
  planned.benches = (planned.benches || []).filter(offStreetShot);
  planned.bins = (planned.bins || []).filter(offStreetShot);
  return planned;
}

const PORTAL_XZ = Object.freeze({ x: 350, z: -350 });

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

function pushIfClear(list, gates, x, z, y, ry, extraPad) {
  if (!propClearOfCourse(x, z, y, gates, { gatePad: extraPad || 3.6, corridor: 4.8 })) return;
  if (list.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) return;
  list.push({ x, z, y, ry, seed: 0.5 });
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
  if (!m) return m;
  m.userData.looksSkip = true;
  m.userData.artLocked = true;
  return m;
}

function mergeGeos(THREE, list) {
  const pos = [], nor = [], uv = [];
  for (const g of list) {
    if (!g) continue;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    if (!p) continue;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function boxAt(THREE, w, h, d, x, y, z, ry) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
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
  });
  skipMat(mat);
  mat.userData.cityWindow = true;
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

function makeCarGeo(THREE) {
  return mergeGeos(THREE, [
    boxAt(THREE, 4.0, 0.88, 1.85, 0, 0.74, 0, 0),
    boxAt(THREE, 2.05, 0.95, 1.62, -0.35, 1.58, 0, 0),
    boxAt(THREE, 0.55, 0.48, 0.22, 1.2, 0.30, 0.92, 0),
    boxAt(THREE, 0.55, 0.48, 0.22, 1.2, 0.30, -0.92, 0),
    boxAt(THREE, 0.55, 0.48, 0.22, -1.2, 0.30, 0.92, 0),
    boxAt(THREE, 0.55, 0.48, 0.22, -1.2, 0.30, -0.92, 0),
  ]);
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

export function applyVibeLighting(ctx, vibe) {
  const L = vibe.lighting;
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
  }
  if (sun) {
    sun.color.setHex(L.sunColor);
    sun.intensity = L.sunIntensity;
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
  if (scene && scene.fog) {
    scene.fog.color.setHex(L.fogColor);
    scene.fog.density = L.fogDensity;
    if (scene.background && scene.background.isColor) {
      const citySky = ctx && ctx.skyMesh && ctx.skyMesh.userData && ctx.skyMesh.userData.citySky;
      scene.background.setHex(citySky ? 0x070014 : L.fogColor);
    }
  }
  if (renderer) renderer.toneMappingExposure = L.exposure;
  if (bloomPass) {
    bloomPass.strength = L.bloomStrength;
    bloomPass.radius = L.bloomRadius;
    bloomPass.threshold = L.bloomThreshold;
  }
}

function neonMat(THREE, color, emit, extra) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color, emissive: color, emissiveIntensity: emit == null ? 3.4 : emit,
    roughness: 0.35, metalness: 0.12,
  }, extra || {})));
}

function dullMat(THREE, color, extra) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color, roughness: 0.78, metalness: 0.22,
  }, extra || {})));
}

export function buildNeonCity(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'cityArtVisuals';
  parent.add(group);
  const budget = qualityBudget(quality);
  const rng = mulberry32(4242);
  const footprints = collectBuildingFootprints(parent);
  for (const b of planPortalBlocks(gates || [], quality)) footprints.push(b);
  hideStockCityMeshes(parent);
  const planned = planCityProps(gates || [], quality);
  group.userData.planned = planned;
  group.userData.budget = budget;

  const winMats = [0, 1, 2, 3].map((i) => windowMaterial(THREE, vibe, 4200 + i * 97));
  const corePools = [[], [], [], []];
  const setbacks = [];
  const ledges = [];
  const trim = [];
  for (let bi = 0; bi < footprints.length; bi++) {
    const b = footprints[bi];
    corePools[bi % 4].push(b);
    const steps = 1 + ((rng() * 3) | 0);
    let tw = b.w * 0.72, td = b.d * 0.72, ty = b.top;
    for (let s = 0; s < steps; s++) {
      const sh = 3.2 + rng() * 5.5;
      setbacks.push(boxAt(THREE, tw, sh, td, b.x + (rng() - 0.5) * 1.2, ty + sh / 2, b.z + (rng() - 0.5) * 1.2, 0));
      ty += sh;
      tw *= 0.78;
      td *= 0.78;
    }
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
  const setMat = dullMat(THREE, hexNum('#1a1224'), { roughness: 0.7, metalness: 0.18, emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.08 });
  if (setbacks.length) group.add(new THREE.Mesh(mergeGeos(THREE, setbacks), setMat));
  const ledgeMat = neonMat(THREE, hexNum(vibe.palette.neonB), 0.55, { roughness: 0.45, color: hexNum('#2a2038') });
  if (ledges.length) group.add(new THREE.Mesh(mergeGeos(THREE, ledges), ledgeMat));
  const trimMat = dullMat(THREE, hexNum('#2a1820'));
  if (trim.length) group.add(new THREE.Mesh(mergeGeos(THREE, trim), trimMat));

  const tankMat = dullMat(THREE, 0x6a7380, { metalness: 0.55, roughness: 0.4 });
  const acMat = dullMat(THREE, 0x8a9098, { metalness: 0.35 });
  const antMat = dullMat(THREE, 0x1a1420, { metalness: 0.6 });
  const blinkMat = neonMat(THREE, 0xff2a2a, 5.5);
  blinkMat.userData.cityBlink = true;
  const billMat = dullMat(THREE, 0x141018);
  const awnMat = neonMat(THREE, hexNum(vibe.palette.neonC), 1.1, { roughness: 0.55 });
  const balcMat = dullMat(THREE, 0x2a2030, { metalness: 0.3 });

  const roofN = Math.min(budget.roof, Math.max(1, footprints.length));
  addInstanced(THREE, group, new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), tankMat, roofN, (d, i) => {
    const b = footprints[i % footprints.length];
    if (!b) return false;
    d.position.set(b.x + (rng() - 0.5) * b.w * 0.35, b.top + 1.1, b.z + (rng() - 0.5) * b.d * 0.35);
    d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(1.4, 0.7, 1.1), acMat, roofN, (d, i) => {
    const b = footprints[(i * 3) % footprints.length];
    if (!b) return false;
    d.position.set(b.x + (rng() - 0.5) * b.w * 0.4, b.top + 0.55, b.z + (rng() - 0.5) * b.d * 0.4);
    d.scale.set(1, 1, 1); d.rotation.set(0, rng() * 1.2, 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(0.1, 2.6, 0.1), antMat, roofN, (d, i) => {
    const b = footprints[(i * 5 + 1) % footprints.length];
    if (!b) return false;
    d.position.set(b.x + b.w * 0.28, b.top + 1.5, b.z - b.d * 0.22);
    d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.SphereGeometry(0.12, 6, 6), blinkMat, roofN, (d, i) => {
    const b = footprints[(i * 5 + 1) % footprints.length];
    if (!b) return false;
    d.position.set(b.x + b.w * 0.28, b.top + 2.95, b.z - b.d * 0.22);
    d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(3.6, 2.1, 0.12), billMat, Math.min(roofN, 40), (d, i) => {
    const b = footprints[(i * 2 + 2) % footprints.length];
    if (!b) return false;
    d.position.set(b.x, b.top + 3.4, b.z + b.d * 0.52);
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
  addInstanced(THREE, group, new THREE.BoxGeometry(0.7, 3.4, 0.1), signMat, bladeN, (d, i) => {
    const f = faceSpots[i];
    if (!f) return false;
    d.position.set(f.x, 5.6, f.z);
    d.rotation.set(0, f.ry, 0);
    d.scale.set(1, 1, 1);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(2.8, 0.7, 0.1), signMat, bladeN, (d, i) => {
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

  const stripMat = neonMat(THREE, hexNum(vibe.palette.neonA), 4.6);
  addInstanced(THREE, group, new THREE.BoxGeometry(1, 0.08, 1), stripMat, Math.min(budget.strips, footprints.length), (d, i) => {
    const b = footprints[i];
    if (!b) return false;
    d.position.set(b.x, b.top + 0.38, b.z);
    d.scale.set(Math.max(2, b.w * 0.94), 1, Math.max(2, b.d * 0.94));
    d.rotation.set(0, 0, 0);
  });

  const lampMat = dullMat(THREE, 0x1a1420, { metalness: 0.45 });
  const bulbMat = neonMat(THREE, hexNum(vibe.palette.neonC), 5.2);
  const lampPos = [];
  for (let s = -360; s <= 360; s += 36) {
    if (Math.abs(s) < 16) continue;
    const cands = [[14, s], [-14, s], [s, 14], [s, -14]];
    for (const p of cands) {
      if (propClearOfCourse(p[0], p[1], 3.5, gates || [], { gatePad: 3.5, corridor: 4.2 })) lampPos.push(p);
    }
  }
  const lampN = Math.min(budget.lamps, lampPos.length);
  addInstanced(THREE, group, new THREE.CylinderGeometry(0.1, 0.14, 6.4, 6), lampMat, lampN, (d, i) => {
    const p = lampPos[i];
    d.position.set(p[0], 3.2, p[1]); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });
  addInstanced(THREE, group, new THREE.SphereGeometry(0.32, 8, 8), bulbMat, lampN, (d, i) => {
    const p = lampPos[i];
    d.position.set(p[0], 6.5, p[1]); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
  });

  const carMat = skipMat(new THREE.MeshBasicMaterial({ color: 0x16101c }));
  const carMesh = addInstanced(THREE, group, makeCarGeo(THREE), carMat, planned.cars.length, (d, i) => {
    const p = planned.cars[i];
    if (!p) return false;
    const heading = p.ry + Math.PI / 2;
    d.position.set(p.x, 0, p.z); d.rotation.set(0, heading, 0); d.scale.set(1.15, 1.15, 1.15);
  });
  const tailMat = neonMat(THREE, 0xff2a33, 6.2);
  addInstanced(THREE, group, new THREE.BoxGeometry(0.14, 0.14, 1.55), tailMat, planned.cars.length, (d, i) => {
    const p = planned.cars[i];
    if (!p) return false;
    const heading = p.ry + Math.PI / 2;
    d.position.set(p.x - Math.cos(heading) * 2.2, 0.55, p.z + Math.sin(heading) * 2.2);
    d.rotation.set(0, heading, 0); d.scale.set(1.15, 1.15, 1.15);
  });
  if (quality !== 'low') {
    const headMatCar = neonMat(THREE, 0xffe6aa, 5.4);
    addInstanced(THREE, group, new THREE.BoxGeometry(0.12, 0.12, 1.4), headMatCar, planned.cars.length, (d, i) => {
      const p = planned.cars[i];
      if (!p) return false;
      const heading = p.ry + Math.PI / 2;
      d.position.set(p.x + Math.cos(heading) * 2.2, 0.52, p.z - Math.sin(heading) * 2.2);
      d.rotation.set(0, heading, 0); d.scale.set(1.15, 1.15, 1.15);
    });
  }

  if (planned.benches && planned.benches.length) {
    addInstanced(THREE, group, makeBenchGeo(THREE), dullMat(THREE, 0x2a2030, { roughness: 0.7 }), planned.benches.length, (d, i) => {
      const p = planned.benches[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
  }
  if (planned.bins && planned.bins.length) {
    addInstanced(THREE, group, makeBinGeo(THREE), dullMat(THREE, 0x1a2430, { metalness: 0.4 }), planned.bins.length, (d, i) => {
      const p = planned.bins[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
  }
  if (planned.kiosks && planned.kiosks.length) {
    addInstanced(THREE, group, makeKioskGeo(THREE), dullMat(THREE, 0x161018, { roughness: 0.55 }), planned.kiosks.length, (d, i) => {
      const p = planned.kiosks[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
    addInstanced(THREE, group, new THREE.BoxGeometry(1.02, 0.55, 0.08), neonMat(THREE, hexNum(vibe.palette.neonA), 3.6), planned.kiosks.length, (d, i) => {
      const p = planned.kiosks[i];
      if (!p) return false;
      d.position.set(p.x + Math.sin(p.ry) * 0.48, 1.38, p.z + Math.cos(p.ry) * 0.48);
      d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
  }
  if (planned.awnings && planned.awnings.length) {
    addInstanced(THREE, group, new THREE.BoxGeometry(2.8, 0.1, 1.45), neonMat(THREE, hexNum(vibe.palette.neonC), 1.4, { roughness: 0.5 }), planned.awnings.length, (d, i) => {
      const p = planned.awnings[i];
      if (!p) return false;
      d.position.set(p.x, 2.05, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
  }
  if (planned.vents && planned.vents.length) {
    addInstanced(THREE, group, makeVentGeo(THREE), dullMat(THREE, 0x2a3038, { metalness: 0.55 }), planned.vents.length, (d, i) => {
      const p = planned.vents[i];
      if (!p) return false;
      d.position.set(p.x, 0, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
  }
  if (planned.lowSigns && planned.lowSigns.length) {
    addInstanced(THREE, group, new THREE.BoxGeometry(2.2, 0.95, 0.12), signMat, planned.lowSigns.length, (d, i) => {
      const p = planned.lowSigns[i];
      if (!p) return false;
      d.position.set(p.x, 1.55, p.z); d.rotation.set(0, p.ry, 0); d.scale.set(1, 1, 1);
    });
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
  addInstanced(THREE, group, new THREE.BoxGeometry(0.35, 1.6, 0.35), dullMat(THREE, 0x1a1c20), planned.traffic.length, (d, i) => {
    const p = planned.traffic[i];
    if (!p) return false;
    d.position.set(p.x, 2.4, p.z); d.scale.set(1, 1, 1); d.rotation.set(0, p.ry, 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(0.22, 0.55, 0.18), headMat, planned.traffic.length, (d, i) => {
    const p = planned.traffic[i];
    if (!p) return false;
    d.position.set(p.x, 3.05, p.z); d.scale.set(1, 1, 1); d.rotation.set(0, p.ry, 0);
  });
  addInstanced(THREE, group, new THREE.BoxGeometry(0.7, 0.7, 0.7), dullMat(THREE, 0x6a4a28), planned.crates.length, (d, i) => {
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
  const skyMat = dullMat(THREE, hexNum(vibe.palette.facade), { emissive: hexNum(vibe.palette.windowOn), emissiveIntensity: 0.35 });
  addInstanced(THREE, group, new THREE.BoxGeometry(1, 1, 1), skyMat, budget.skyline, (d, i) => {
    const a = (i / budget.skyline) * Math.PI * 2 + rng() * 0.06;
    const dist = 1580 + rng() * 480;
    const h = 32 + Math.pow(rng(), 1.2) * 120;
    const w = 12 + rng() * 24;
    d.position.set(Math.cos(a) * dist, h / 2, Math.sin(a) * dist);
    d.scale.set(w, h, w * (0.65 + rng() * 0.5));
    d.rotation.set(0, a * 0.2, 0);
  });
  const winkMat = neonMat(THREE, hexNum(vibe.palette.windowOn), 3.4);
  addInstanced(THREE, group, new THREE.BoxGeometry(2.2, 1.4, 0.4), winkMat, Math.min(80, budget.skyline), (d, i) => {
    const a = (i / 80) * Math.PI * 2;
    const dist = 1570 + rng() * 400;
    d.position.set(Math.cos(a) * dist, 20 + rng() * 80, Math.sin(a) * dist);
    d.scale.set(1, 1, 1); d.rotation.set(0, a, 0);
  });

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
      if (!propClearOfCourse(x, z, 0.02, gates || [], { gatePad: 5, corridor: 2.6 })) return;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) return;
      spots.push({ x, z, w, d, ry });
    };
    for (const [fx, fz] of [[-5.5, 15.5], [3.4, 10.5], [340, -338]]) {
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
    }
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
  group.userData.winMat = winMat;
  void carMesh;
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
  root.traverse((o) => {
    if (o.material && o.material.userData && o.material.userData.cityWindow) {
      o.material.emissiveIntensity = 1.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.1));
    }
    if (o.material && o.material.userData && o.material.userData.cityBlink) {
      o.material.emissiveIntensity = 2.2 + 5.5 * (Math.sin(t * 7.0) > 0.35 ? 1 : 0.15);
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
      const dummy = new THREE.Object3D();
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
  });
}

export function restyleMesas(root, vibe) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'CylinderGeometry') return;
    const p = o.geometry.parameters;
    if (!p || p.height < 30 || p.radiusBottom < 40) return;
    if (!o.material || !o.material.color) return;
    o.material.color.setHex(hexNum(vibe.palette.mesa));
    o.material.emissive = o.material.emissive || o.material.color.clone();
    o.material.emissive.setHex(hexNum(vibe.palette.neonA));
    o.material.emissiveIntensity = 0.18;
    o.material.roughness = 0.95;
    o.material.userData.artLocked = true;
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
    applyVibeLighting(ctx, ctx.vibe);
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
    mat.roughness = quality === 'low' ? 0.62 : 0.08;
    mat.metalness = quality === 'low' ? 0.12 : 0.78;
    if ('envMapIntensity' in mat) mat.envMapIntensity = quality === 'low' ? 0.18 : 1.45;
    mat.emissive.setHex(hexNum(vibe.palette.neonA));
    mat.emissiveIntensity = quality === 'low' ? 0.02 : 0.09;
    mat.userData.looksComposed = true;
    mat.userData.artLocked = true;
    mat.userData.looksSkip = true;
    mat.normalMap = null;
    mat.roughnessMap = null;
    mat.needsUpdate = true;
  }
  if (ctx.skyMesh) applySkyTexture(THREE, ctx.skyMesh, vibe);
  if (ctx.sunSprite) ctx.sunSprite.visible = false;
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('cityArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    const oldDress = root.getObjectByName('cityArtDressing');
    if (oldDress && oldDress.parent) oldDress.parent.remove(oldDress);
    visuals = buildNeonCity(THREE, root, vibe, quality, ctx.gates || []);
    attachWetReflector(THREE, visuals, vibe, quality);
  }
  const host = ctx.cityWorld || root;
  if (host) {
    const oldDream = host.getObjectByName('dreamlandArt');
    if (oldDream && oldDream.parent) oldDream.parent.remove(oldDream);
  }
  const dream = host ? buildDreamlandArt(THREE, host, vibe) : null;
  if (ctx.scene) {
    restyleMesas(ctx.scene, vibe);
    restyleLandmarks(ctx.scene, vibe);
  }
  applyVibeLighting(ctx, vibe);
  if (root) root.userData.cityArtQuality = quality;
  return { visuals, dream, vibe, quality };
}

export function nightGround() { return null; }
export function buildCityDressing(THREE, parent, vibe, quality) {
  return buildNeonCity(THREE, parent, vibe, quality, []);
}
