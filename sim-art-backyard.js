// Ryan's Yard — Felt Scale Phoenix backyard. Visual only.
// Colliders live in sim-maps.js BACKYARD_PLAY. No faces, no clutter.
// Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=9a1038ea2564';
import { applyFeltMaterial, feltBasic, feltEmissive } from './sim-art-felt.js?v=f76fc4f752df';
import { BACKYARD_PLAY, LAYOUT } from './sim-maps.js?v=634e469a7282';

export const BACKYARD_STOCK = Object.freeze({
  turf: 0x3f8a4a,
  pebble: 0xc2b39a,
  stucco: 0xc4a882,
  tile: 0xc45a32,
  wood: 0x6a4e32,
  shed: 0x7a8680,
  cmu: 0xb89a72,
  metal: 0x2a2c30,
});

export const BACKYARD_KEEP_GATES = Object.freeze([
  { x: 4.0, y: 2.20, z: 4.2, size: 1.8 },
  { x: 11.0, y: 1.75, z: -6.8, size: 1.6 },
  { x: 17.2, y: 2.25, z: -15.4, size: 1.5 },
  { x: -8.5, y: 1.12, z: -5.5, size: 1.6 },
  { x: -17.6, y: 1.55, z: -12.55, size: 1.6 },
  { x: -21.75, y: 1.18, z: 14.0, size: 1.5 },
  { x: -2.15, y: 5.15, z: 3.43, size: 1.6 },
  { x: -2.15, y: 1.22, z: -1.83, size: 1.6 },
  { x: 1.5, y: 25.2, z: 14.1, size: 1.8 },
]);

export function backyardWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function backyardBudget(applied) {
  if (applied === 'low') {
    return {
      pots: 4, palms: 3, neighbors: 2, stones: 6, glow: false,
      leaves: 4, fenceMesh: true, tufts: 10, pavers: 12, seams: true,
    };
  }
  if (applied === 'high') {
    return {
      pots: 8, palms: 3, neighbors: 4, stones: 10, glow: true,
      leaves: 8, fenceMesh: true, tufts: 22, pavers: 20, seams: true,
    };
  }
  return {
    pots: 6, palms: 3, neighbors: 3, stones: 8, glow: true,
    leaves: 6, fenceMesh: true, tufts: 16, pavers: 16, seams: true,
  };
}

function skipMat(m) {
  return applyFeltMaterial(m);
}

function fillGrad(g, x0, y0, x1, y1, stops) {
  const last = stops[stops.length - 1][1];
  if (!g || typeof g.createLinearGradient !== 'function') {
    g.fillStyle = last;
    return;
  }
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  if (!gr || typeof gr.addColorStop !== 'function') {
    g.fillStyle = last;
    return;
  }
  for (let i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
  g.fillStyle = gr;
}

function canvasTex(THREE, w, h, paint, rx, ry) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  try { paint(g, w, h); } catch (e) {
    if (g) { g.fillStyle = '#c4a882'; g.fillRect(0, 0, w, h); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx == null ? 1 : rx, ry == null ? 1 : ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.userData.looksComposed = true;
  t.userData.artLocked = true;
  t.needsUpdate = true;
  return t;
}

function stitchGrid(g, w, h, color, step) {
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.setLineDash([3, 5]);
  for (let x = 0; x < w; x += step) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }
  for (let y = 0; y < h; y += step) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }
  g.setLineDash([]);
}

function turfTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#2f6e3a'], [0.5, '#3f8a4a'], [1, '#2a6234']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = i % 3 ? 'rgba(20,70,28,0.22)' : 'rgba(180,210,90,0.16)';
      const x = (i * 17) % w, y = (i * 29) % h;
      g.beginPath();
      g.moveTo(x, y + 9);
      g.quadraticCurveTo(x + 1.5, y + 3, x + 0.4, y);
      g.quadraticCurveTo(x + 3, y + 4, x + 2.4, y + 9);
      g.fill();
    }
    stitchGrid(g, w, h, 'rgba(40,90,48,0.18)', 32);
  }, 8, 8);
}

function pebbleTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#c2b39a'], [1, '#b6a488']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${160 + (i % 40)},${140 + (i % 30)},${110},0.30)`;
      g.beginPath();
      g.arc((i * 23) % w, (i * 41) % h, 3 + (i % 4), 0, 6.3);
      g.fill();
    }
    stitchGrid(g, w, h, 'rgba(90,70,50,0.14)', 32);
  }, 6, 6);
}

function paverTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    g.fillStyle = '#b8a488';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8b49a';
    g.fillRect(2, 2, 28, 28);
    g.fillRect(34, 34, 28, 28);
    g.fillStyle = '#a89878';
    g.fillRect(34, 2, 28, 28);
    g.fillRect(2, 34, 28, 28);
    stitchGrid(g, w, h, 'rgba(80,60,40,0.22)', 32);
  }, 4, 4);
}

function stuccoTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#d8be98'], [0.55, '#c4a882'], [1, '#b89870']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 110; i++) {
      g.fillStyle = i % 2 ? 'rgba(150,120,80,0.12)' : 'rgba(220,190,150,0.10)';
      g.fillRect((i * 13) % w, (i * 19) % h, 4, 3);
    }
    stitchGrid(g, w, h, 'rgba(120,90,60,0.16)', 32);
  }, 4, 4);
}

function tileTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    g.fillStyle = '#8a3418';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      const ox = (y % 16) ? 8 : 0;
      for (let x = -8; x < w; x += 16) {
        g.fillStyle = '#c45a32';
        g.beginPath();
        g.ellipse(x + ox + 8, y + 4, 7, 3.4, 0, 0, 6.3);
        g.fill();
        g.fillStyle = '#d46a40';
        g.beginPath();
        g.ellipse(x + ox + 6, y + 3, 3.2, 1.4, 0, 0, 6.3);
        g.fill();
        g.fillStyle = '#a84624';
        g.fillRect(x + ox, y + 6, 16, 1);
      }
    }
  }, 12, 8);
}

function woodTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#7a5a38'], [0.5, '#6a4e32'], [1, '#5a3e28']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,24,12,0.22)';
    g.lineWidth = 1;
    for (let x = 4; x < w; x += 8) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 2, h); g.stroke();
    }
    stitchGrid(g, w, h, 'rgba(40,24,12,0.20)', 16);
  }, 2, 4);
}

function meshTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    g.fillStyle = '#3a4048';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1c20';
    g.lineWidth = 2;
    for (let y = -8; y < h + 8; y += 10) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 18); g.stroke();
      g.beginPath(); g.moveTo(0, y + 18); g.lineTo(w, y); g.stroke();
    }
    stitchGrid(g, w, h, 'rgba(220,210,190,0.16)', 16);
  }, 4, 8);
}

function waterTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#1fa8a0'], [0.5, '#2ec4b6'], [1, '#188f88']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(230,255,250,${0.08 + (i % 4) * 0.04})`;
      g.beginPath();
      g.arc((i * 19) % w, (i * 31) % h, 6 + (i % 5), 0.2, 2.4);
      g.stroke();
    }
  }, 3, 3);
}

function afternoonSkyTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [
      [0, '#8eb4c8'], [0.45, '#c8d6c4'], [0.72, '#e8c9a0'], [1, '#d4b48a'],
    ]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (const [x, y, r] of [[40, 50, 28], [120, 36, 36], [200, 58, 24]]) {
      g.beginPath();
      g.arc(x, y, r, 0, 6.3);
      g.fill();
    }
  }, 1, 1);
}

function mergeGeos(THREE, list) {
  const pos = [], nor = [], uv = [];
  for (const g of list) {
    if (!g) continue;
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    const u = src.getAttribute('uv');
    if (!p) {
      if (src !== g) src.dispose();
      g.dispose();
      continue;
    }
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
    }
    if (src !== g) src.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function placedBox(THREE, w, h, d, x, y, z, ry) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function placedCyl(THREE, rTop, rBot, h, x, y, z, segs) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs || 8);
  g.translate(x, y + h / 2, z);
  return g;
}

function kidneyGeo(THREE) {
  const s = new THREE.Shape();
  s.moveTo(-10, -2);
  s.bezierCurveTo(-13, -6, -8, -8, -2, -6);
  s.bezierCurveTo(4, -4, 10, -5, 11, -1);
  s.bezierCurveTo(12, 3, 6, 6, 0, 5);
  s.bezierCurveTo(-8, 4, -12, 3, -10, -2);
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06,
    bevelSegments: 1, curveSegments: 8,
  });
}

function placedBevelBox(THREE, w, h, d, x, y, z, bevel) {
  const s = new THREE.Shape();
  const hw = w * 0.5, hd = d * 0.5;
  s.moveTo(-hw, -hd);
  s.lineTo(hw, -hd);
  s.lineTo(hw, hd);
  s.lineTo(-hw, hd);
  s.closePath();
  const b = bevel == null ? 0.05 : bevel;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.08, h - b * 2),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(x, y + b, z);
  return g;
}

function canopyLathe(THREE) {
  const pts = [
    new THREE.Vector2(0.1, 0),
    new THREE.Vector2(3.4, 0.6),
    new THREE.Vector2(4.2, 2.2),
    new THREE.Vector2(2.6, 4.4),
    new THREE.Vector2(0.8, 5.6),
    new THREE.Vector2(0.0, 5.8),
  ];
  return new THREE.LatheGeometry(pts, 10);
}

function mark(o) {
  o.userData.backyardArt = true;
  return o;
}

function addMerged(THREE, parent, geos, mat) {
  if (!geos.length) return null;
  const mesh = new THREE.Mesh(mergeGeos(THREE, geos), mat);
  mark(mesh);
  parent.add(mesh);
  return mesh;
}

function makeYardMats(THREE, vibe, quality) {
  const pal = vibe.palette;
  const glow = backyardWantsGlow(quality);
  return {
    turf: feltBasic(THREE, 0xffffff, { map: turfTex(THREE) }),
    pebble: feltBasic(THREE, 0xffffff, { map: pebbleTex(THREE) }),
    paver: feltBasic(THREE, 0xffffff, { map: paverTex(THREE) }),
    stucco: feltBasic(THREE, 0xffffff, { map: stuccoTex(THREE) }),
    tile: feltBasic(THREE, 0xffffff, { map: tileTex(THREE) }),
    wood: feltBasic(THREE, 0xffffff, { map: woodTex(THREE) }),
    shed: feltBasic(THREE, hexNum('#7a8680')),
    cmu: feltBasic(THREE, 0xffffff, { map: stuccoTex(THREE) }),
    metal: feltBasic(THREE, hexNum('#2a2c30')),
    mesh: feltBasic(THREE, 0xffffff, { map: meshTex(THREE) }),
    leaf: feltBasic(THREE, hexNum('#3f8a4a')),
    darkLeaf: feltBasic(THREE, hexNum('#2a6234')),
    water: feltBasic(THREE, 0xffffff, {
      map: waterTex(THREE), transparent: true, opacity: 0.78, depthWrite: false,
    }),
    dark: feltBasic(THREE, hexNum('#2a241c')),
    window: feltBasic(THREE, hexNum(pal.windowOn)),
    pvc: feltBasic(THREE, 0xf4f1ea),
    yellow: feltBasic(THREE, hexNum('#e8c04a')),
    cactus: feltBasic(THREE, hexNum('#4a8a4a')),
    red: feltBasic(THREE, hexNum('#c45a40')),
    wicker: feltBasic(THREE, hexNum('#c4a06a')),
    sky: skipMat(new THREE.MeshBasicMaterial({
      map: afternoonSkyTex(THREE), side: THREE.BackSide, fog: false, depthWrite: true, toneMapped: false,
    })),
    glow: glow ? feltEmissive(THREE, hexNum(pal.laneAlt)) : feltBasic(THREE, hexNum(pal.laneAlt)),
  };
}

export function hideStockBackyardMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.backyardArt) return;
    if (o.parent && o.parent.name === 'backyardArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    if (col === BACKYARD_STOCK.stucco || col === BACKYARD_STOCK.tile
      || col === BACKYARD_STOCK.wood || col === BACKYARD_STOCK.shed
      || col === BACKYARD_STOCK.metal || col === BACKYARD_STOCK.cmu) {
      o.visible = false;
      o.userData.artHidden = true;
      n++;
    }
  });
  return n;
}

export function restyleBackyardShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const turf = turfTex(THREE);
  const pebble = pebbleTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.backyardArt || (o.parent && o.parent.name === 'backyardArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (t === 'PlaneGeometry' && o === floor) {
      m.map = pebble;
      m.color.setHex(0xffffff);
      skipMat(m);
      n++;
    } else if (t === 'PlaneGeometry' && col === BACKYARD_STOCK.pebble) {
      m.map = paverTex(THREE);
      m.color.setHex(0xffffff);
      skipMat(m);
      n++;
    } else if (t === 'PlaneGeometry' && col === BACKYARD_STOCK.turf) {
      m.map = turf;
      m.color.setHex(0xffffff);
      skipMat(m);
      n++;
    } else if (col === BACKYARD_STOCK.cmu) {
      m.map = pebble;
      m.color.setHex(0xffffff);
      skipMat(m);
      n++;
    }
  });
  return n;
}

function addSky(THREE, parent, mats) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(96, 20, 12), mats.sky);
  dome.position.y = 10;
  mark(dome);
  parent.add(dome);
}

function addYardWalls(THREE, parent, mats) {
  const L = LAYOUT.backyard;
  const P = BACKYARD_PLAY;
  const t = L.wall, hx = L.w / 2, hz = L.d / 2, wh = P.wallH;
  addMerged(THREE, parent, [
    placedBox(THREE, L.w, wh, t, 0, 0, -hz),
    placedBox(THREE, t, wh, L.d, -hx, 0, 0),
    placedBox(THREE, t, wh, L.d, hx, 0, 0),
    placedBox(THREE, P.streetWall.w, wh, t, P.streetWall.x, 0, hz),
  ], mats.cmu);
}

function addHouse(THREE, parent, mats) {
  const P = BACKYARD_PLAY;
  const hs = P.house;
  const stucco = [
    placedBox(THREE, hs.w, hs.wallH, hs.d, hs.x, 0, hs.z),
    placedBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x - P.patio.w / 2 + P.patio.col, 0, P.patio.z - P.patio.d / 2 + P.patio.col),
    placedBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x + P.patio.w / 2 - P.patio.col, 0, P.patio.z - P.patio.d / 2 + P.patio.col),
    placedBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x - P.patio.w / 2 + P.patio.col, 0, P.patio.z + P.patio.d / 2 - P.patio.col),
    placedBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x + P.patio.w / 2 - P.patio.col, 0, P.patio.z + P.patio.d / 2 - P.patio.col),
    placedBox(THREE, P.patio.w, P.patio.ceilH, P.patio.d, P.patio.x, P.patio.ceilY, P.patio.z),
    placedBox(THREE, P.wing.w, P.wing.wallH, P.wing.d, P.wing.x, 0, P.wing.z),
  ];
  addMerged(THREE, parent, stucco, mats.stucco);
  const tile = [
    placedBox(THREE, P.ridge.w, P.ridge.h, P.ridge.d, P.ridge.x, P.ridge.y, P.ridge.z),
  ];
  addMerged(THREE, parent, tile, mats.tile);
  const win = [
    placedBox(THREE, 6.4, 4.8, 0.08, -4.2, 3.2, hs.z - hs.d / 2 - 0.05),
    placedBox(THREE, 6.4, 4.8, 0.08, 8.2, 3.2, hs.z - hs.d / 2 - 0.05),
    placedBox(THREE, 5.2, 3.6, 0.08, -4.2, 12.4, hs.z - hs.d / 2 - 0.05),
    placedBox(THREE, 5.2, 3.6, 0.08, 8.2, 12.4, hs.z - hs.d / 2 - 0.05),
  ];
  addMerged(THREE, parent, win, mats.window);
  const frames = [
    placedBox(THREE, 6.7, 0.12, 0.10, -4.2, 3.14, hs.z - hs.d / 2 - 0.10),
    placedBox(THREE, 6.7, 0.12, 0.10, -4.2, 7.94, hs.z - hs.d / 2 - 0.10),
    placedBox(THREE, 6.7, 0.12, 0.10, 8.2, 3.14, hs.z - hs.d / 2 - 0.10),
    placedBox(THREE, 6.7, 0.12, 0.10, 8.2, 7.94, hs.z - hs.d / 2 - 0.10),
  ];
  addMerged(THREE, parent, frames, mats.wood);
  const shade = new THREE.Mesh(placedBox(THREE, P.shade.w, P.shade.h, P.shade.d, P.shade.x, P.shade.y, P.shade.z), mats.metal);
  mark(shade);
  parent.add(shade);
}

function addPvc(THREE, parent, mats) {
  const p = BACKYARD_PLAY.pvc;
  const hx = p.innerD / 2, hz = p.innerW / 2, b = p.bar;
  const geos = [];
  for (const dx of [-hx, hx]) {
    for (const dz of [-hz, hz]) geos.push(placedBox(THREE, b, p.h, b, p.x + dx, 0, p.z + dz));
  }
  for (const y of [p.h - b, p.midY]) {
    geos.push(placedBox(THREE, p.innerD + b, b, b, p.x, y, p.z - hz));
    geos.push(placedBox(THREE, p.innerD + b, b, b, p.x, y, p.z + hz));
    geos.push(placedBox(THREE, b, b, p.innerW + b, p.x - hx, y, p.z));
    geos.push(placedBox(THREE, b, b, p.innerW + b, p.x + hx, y, p.z));
  }
  addMerged(THREE, parent, geos, mats.pvc);
}

function addTree(THREE, parent, mats, budget) {
  const t = BACKYARD_PLAY.ficus;
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(t.r, t.h - t.r * 2, 4, 8), mats.wood);
  trunk.position.set(t.x, t.h / 2, t.z);
  mark(trunk);
  parent.add(trunk);
  const canopy = new THREE.Mesh(canopyLathe(THREE), mats.leaf);
  canopy.position.set(t.x, t.h * 0.42, t.z);
  canopy.userData.backyardPalm = true;
  mark(canopy);
  parent.add(canopy);
  const n = budget.leaves;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1.35, 8, 6), i % 2 ? mats.leaf : mats.darkLeaf);
    puff.position.set(t.x + Math.cos(a) * 2.4, t.h * 0.62 + (i % 3) * 0.8, t.z + Math.sin(a) * 2.4);
    puff.userData.backyardPalm = true;
    mark(puff);
    parent.add(puff);
  }
  const ring = BACKYARD_PLAY.planter;
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, ring.rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, ring.rIn, 0, Math.PI * 2, true);
  ringShape.holes.push(hole);
  const ringGeo = new THREE.ExtrudeGeometry(ringShape, { depth: ring.h, bevelEnabled: false, curveSegments: 10 });
  ringGeo.rotateX(-Math.PI / 2);
  const planter = new THREE.Mesh(ringGeo, mats.cmu);
  planter.position.set(ring.x, 0, ring.z);
  mark(planter);
  parent.add(planter);
}

function addPool(THREE, parent, mats, budget) {
  const P = BACKYARD_PLAY;
  const water = new THREE.Mesh(kidneyGeo(THREE), mats.water);
  water.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
  water.position.set(P.pool.x, 0.08, P.pool.z);
  water.userData.backyardPool = true;
  mark(water);
  parent.add(water);
  const deck = [
    placedBox(THREE, P.pool.w + P.deckT * 2, 0.22, P.deckT, P.pool.x, 0, P.pool.z - P.pool.d / 2 - P.deckT / 2),
    placedBox(THREE, P.pool.w + P.deckT * 2, 0.22, P.deckT, P.pool.x, 0, P.pool.z + P.pool.d / 2 + P.deckT / 2),
    placedBox(THREE, P.deckT, 0.22, P.pool.d, P.pool.x - P.pool.w / 2 - P.deckT / 2, 0, P.pool.z),
    placedBox(THREE, P.deckT, 0.22, P.pool.d, P.pool.x + P.pool.w / 2 + P.deckT / 2, 0, P.pool.z),
    placedBox(THREE, P.pad.w, P.pad.h, P.pad.d, P.pad.x, 0, P.pad.z),
    placedBox(THREE, P.fire.w, 0.12, P.fire.d, P.fire.x, 0, P.fire.z),
  ];
  addMerged(THREE, parent, deck, mats.pebble);
}

function addFenceAndPots(THREE, parent, mats, budget, gates) {
  const P = BACKYARD_PLAY;
  const fn = P.fence;
  const posts = [];
  const panels = [];
  let i = 0;
  for (let z = fn.z0; z <= fn.z1 + 0.05; z += fn.spacing, i++) {
    posts.push(placedBox(THREE, fn.post, fn.h, fn.post, fn.x, 0, z));
    posts.push(placedBox(THREE, fn.post + 0.06, 0.10, fn.post + 0.06, fn.x, fn.h, z));
    if (i % 2 === 0 && z + fn.spacing <= fn.z1 + 0.05) {
      const mid = z + fn.spacing / 2;
      const span = fn.spacing - fn.post;
      panels.push(placedBox(THREE, fn.meshT, fn.meshH, span, fn.x, fn.meshY, mid));
      for (let r = 0; r < 5; r++) {
        posts.push(placedBox(THREE, 0.03, 0.05, span, fn.x + 0.04, fn.meshY + 0.35 + r * 0.68, mid));
      }
      for (let c = -2; c <= 2; c++) {
        posts.push(placedBox(THREE, 0.03, fn.meshH, 0.04, fn.x + 0.04, fn.meshY, mid + c * (span / 5)));
      }
    }
  }
  addMerged(THREE, parent, posts, mats.metal);
  addMerged(THREE, parent, panels, mats.mesh);
  const potSpots = P.pots.map((pot, idx) => [pot.x, pot.z, idx % 2 ? mats.red : mats.cactus, pot.r, pot.h]);
  const extras = [
    [-6.4, 2.6, mats.red, 0.26, 0.62], [6.8, 2.2, mats.cactus, 0.24, 0.58],
    [-12.2, -12.8, mats.cactus, 0.26, 0.64], [10.4, -14.6, mats.red, 0.24, 0.58],
  ];
  const all = potSpots.concat(extras);
  const n = Math.min(budget.pots, all.length);
  for (let k = 0; k < n; k++) {
    const s = all[k];
    if (!propClearOfCourse(s[0], s[1], 0.28, gates, { gatePad: 1.4, corridor: 1.2, yRange: 2 })) continue;
    const pot = new THREE.Mesh(placedCyl(THREE, s[3], s[3] * 0.85, s[4], 0, 0, 0, 8), mats.tile);
    pot.position.set(s[0], 0, s[1]);
    mark(pot);
    parent.add(pot);
    const plant = new THREE.Mesh(new THREE.CapsuleGeometry(s[3] * 0.45, s[4] * 0.55, 3, 6), s[2]);
    plant.position.set(s[0], s[4] + 0.22, s[1]);
    mark(plant);
    parent.add(plant);
  }
}

function addPatioDress(THREE, parent, mats, budget, gates) {
  const P = BACKYARD_PLAY;
  for (const pot of P.patioPlanters) {
    if (!propClearOfCourse(pot.x, pot.z, pot.r, gates, { gatePad: 1.2, corridor: 1.0, yRange: 2 })) continue;
    const body = new THREE.Mesh(placedCyl(THREE, pot.r, pot.r * 0.85, pot.h, 0, 0, 0, 8), mats.tile);
    body.position.set(pot.x, 0, pot.z);
    mark(body);
    parent.add(body);
    const plant = new THREE.Mesh(new THREE.CapsuleGeometry(pot.r * 0.42, pot.h * 0.55, 3, 6), mats.cactus);
    plant.position.set(pot.x, pot.h + 0.22, pot.z);
    mark(plant);
    parent.add(plant);
  }
}

function addSoftAoAndTufts(THREE, parent, mats, budget, gates) {
  const P = BACKYARD_PLAY;
  const tufts = [];
  const n = budget.tufts;
  const hw = P.turf.w * 0.42, hd = P.turf.d * 0.42;
  for (let i = 0; i < n; i++) {
    const x = P.turf.x + ((i * 17) % 80 - 40) / 40 * hw;
    const z = P.turf.z + ((i * 29) % 70 - 35) / 35 * hd;
    if (!propClearOfCourse(x, z, 0.18, gates, { gatePad: 1.1, corridor: 1.0, yRange: 2 })) continue;
    tufts.push(placedCyl(THREE, 0.04, 0.08, 0.28 + (i % 3) * 0.05, x, 0.06, z, 5));
  }
  addMerged(THREE, parent, tufts, mats.leaf);
}

function addLounge(THREE, parent, mats, budget) {
  const P = BACKYARD_PLAY;
  const sofa = new THREE.Mesh(placedBox(THREE, P.sofa.w, P.sofa.seatH, P.sofa.d, P.sofa.x, 0, P.sofa.z), mats.wicker);
  mark(sofa);
  parent.add(sofa);
  const back = new THREE.Mesh(placedBox(THREE, P.sofa.w, P.sofa.backH - P.sofa.seatH, P.sofa.backD, P.sofa.x, P.sofa.seatH, P.sofa.z - P.sofa.d / 2 + P.sofa.backD / 2), mats.wicker);
  mark(back);
  parent.add(back);
  const canopy = [];
  const c = P.canopy;
  const t = Math.max(c.bar, 0.14);
  canopy.push(placedBox(THREE, c.innerW + t * 2, t, t, c.x, c.y + c.innerH / 2, c.z));
  canopy.push(placedBox(THREE, c.innerW + t * 2, t, t, c.x, c.y - c.innerH / 2 - t, c.z));
  canopy.push(placedBox(THREE, t, c.innerH, t, c.x - c.innerW / 2 - t / 2, c.y - c.innerH / 2, c.z));
  canopy.push(placedBox(THREE, t, c.innerH, t, c.x + c.innerW / 2 + t / 2, c.y - c.innerH / 2, c.z));
  addMerged(THREE, parent, canopy, mats.dark);
  const n = Math.min(budget.palms, P.palms.length);
  for (let i = 0; i < n; i++) {
    const p = P.palms[i];
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(p.r, p.h - 0.4, 3, 6), mats.wood);
    trunk.position.set(p.x, p.h / 2, p.z);
    trunk.userData.backyardPalm = true;
    mark(trunk);
    parent.add(trunk);
    const frond = new THREE.Mesh(new THREE.SphereGeometry(i === 2 ? 1.8 : 1.15, 8, 6), mats.leaf);
    frond.position.set(p.x, p.h + 0.2, p.z);
    frond.scale.set(1.15, 0.55, 1.15);
    frond.userData.backyardPalm = true;
    mark(frond);
    parent.add(frond);
  }
}

function addYardExtras(THREE, parent, mats) {
  const P = BACKYARD_PLAY;
  const shed = new THREE.Mesh(placedBox(THREE, P.shed.w, P.shed.h, P.shed.d, P.shed.x, 0, P.shed.z), mats.shed);
  mark(shed);
  parent.add(shed);
  const acBody = placedBox(THREE, P.ac.w, P.ac.h, P.ac.d, P.ac.x, 0, P.ac.z);
  const acBits = [acBody];
  for (let i = 0; i < 5; i++) {
    acBits.push(placedBox(THREE, P.ac.w - 0.18, 0.06, 0.04, P.ac.x, 0.28 + i * 0.34, P.ac.z + P.ac.d / 2 + 0.03));
  }
  addMerged(THREE, parent, acBits, mats.metal);
  const planks = [];
  const gw = P.woodGate.w, gh = P.woodGate.h, gd = P.woodGate.d;
  const n = 7, pw = gw / n;
  for (let i = 0; i < n; i++) {
    planks.push(placedBox(THREE, pw + 0.02, gh, gd, P.woodGate.x - gw / 2 + (i + 0.5) * pw, 0, P.woodGate.z));
  }
  planks.push(placedBox(THREE, gw, 0.14, gd + 0.04, P.woodGate.x, 0.55, P.woodGate.z));
  planks.push(placedBox(THREE, gw, 0.14, gd + 0.04, P.woodGate.x, gh - 0.7, P.woodGate.z));
  addMerged(THREE, parent, planks, mats.wood);
  const bowl = new THREE.Mesh(placedCyl(THREE, P.fire.bowlR, P.fire.bowlR * 0.8, P.fire.bowlH, P.fire.x, 0.12, P.fire.z, 10), mats.metal);
  mark(bowl);
  parent.add(bowl);
}

function addNeighbors(THREE, parent, mats, budget) {
  const geos = [];
  const spots = [
    [-38, -8, 18, 16], [38, 6, 16, 14], [-8, -36, 20, 14], [22, -36, 14, 12],
  ];
  const n = Math.min(budget.neighbors, spots.length);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    geos.push(placedBox(THREE, s[2], 16.5, s[3], s[0], 0, s[1]));
  }
  addMerged(THREE, parent, geos, mats.stucco);
  const palms = [
    [-32, -18], [34, -16], [-18, -32], [28, 28],
  ];
  for (let i = 0; i < Math.min(budget.neighbors, palms.length); i++) {
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 10, 3, 6), mats.wood);
    trunk.position.set(palms[i][0], 5.2, palms[i][1]);
    mark(trunk);
    parent.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), mats.leaf);
    top.position.set(palms[i][0], 10.6, palms[i][1]);
    top.scale.set(1.2, 0.5, 1.2);
    mark(top);
    parent.add(top);
  }
}

function addPlayLines(THREE, parent, mats, gates) {
  const extras = new THREE.Group();
  extras.name = 'backyardArtExtras';
  extras.userData.backyardArt = true;
  parent.add(extras);
}

export function buildRyanYard(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'backyardArtVisuals';
  group.userData.backyardArt = true;
  const budget = backyardBudget(quality);
  const mats = makeYardMats(THREE, vibe, quality);
  const keep = gates || BACKYARD_KEEP_GATES;
  addSky(THREE, group, mats);
  addYardWalls(THREE, group, mats);
  addHouse(THREE, group, mats);
  addPvc(THREE, group, mats);
  addTree(THREE, group, mats, budget);
  addPool(THREE, group, mats, budget);
  addFenceAndPots(THREE, group, mats, budget, keep);
  addPatioDress(THREE, group, mats, budget, keep);
  addSoftAoAndTufts(THREE, group, mats, budget, keep);
  addLounge(THREE, group, mats, budget);
  addYardExtras(THREE, group, mats);
  addNeighbors(THREE, group, mats, budget);
  addPlayLines(THREE, group, mats, keep);
  parent.add(group);
  return group;
}

export const buildJadeLot = buildRyanYard;

export function decorateBackyardGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 1.6;
  if (ring.material) {
    ring.material.color.setHex(0xc4a882);
    if (ring.material.emissive) ring.material.emissive.setHex(col);
    if (ring.material.emissiveIntensity != null) ring.material.emissiveIntensity = emit * 0.35;
    skipMat(ring.material);
  }
  const hoop = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.08, size * 0.045, 6, 18),
    feltEmissive(THREE, hexNum((vibe && vibe.palette && vibe.palette.neonA) || '#c45a32')),
  );
  const tile = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.22, size * 0.08, size * 0.08),
    feltBasic(THREE, hexNum('#c45a32')),
  );
  tile.position.set(0, size * 1.12, 0);
  ring.add(hoop);
  ring.add(tile);
  ring.userData.artHalo = hoop;
  ring.userData.artStyle = 'stucco-tile';
  ring.userData.artExtras = [tile];
  return hoop;
}

export function pulseBackyardGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 1.6;
  if (isNext) {
    col = 0x2ec4b6;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 2.4) + pulse;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.03);
  } else if (passed) {
    col = 0xc45a32;
    emit = 1.1;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickBackyardArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.backyardPalm || u.backyardPool) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickBackyardArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickBackyardArtObject(o, t) {
  if (o.userData && o.userData.backyardPalm) {
    o.rotation.y = t * 0.06;
  }
  if (o.userData && o.userData.backyardPool && o.material && o.material.map) {
    const rep = o.material.map.repeat;
    if (rep) {
      o.material.map.offset.x = (t * 0.03) % 1;
      o.material.map.offset.y = (t * 0.02) % 1;
    }
  }
}

export function restyleBackyard(THREE, ctx) {
  try {
    return restyleBackyardInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleBackyard', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleBackyardInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockBackyardMeshes(root);
  restyleBackyardShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('backyardArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildRyanYard(THREE, root, vibe, quality, ctx.gates || BACKYARD_KEEP_GATES);
  }
  if (root) root.userData.backyardArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
