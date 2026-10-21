// Ryan's Yard — Felt Scale Phoenix backyard. Visual only.
// Colliders live in sim-maps.js BACKYARD_PLAY. No faces, no clutter.
// Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=a6b4469c954b';
import { applyFeltMaterial, feltBasic, feltEmissive } from './sim-art-felt.js?v=f76fc4f752df';
import { BACKYARD_PLAY } from './sim-maps.js?v=a81c48a1b734';

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
  { x: 13.5, y: 1.75, z: -3.5, size: 1.6 },
  { x: 17.2, y: 2.25, z: -15.4, size: 1.5 },
  { x: -8.5, y: 1.12, z: -5.5, size: 1.6 },
  { x: -15.05, y: 2.10, z: -14.6, size: 1.6 },
  { x: 21.75, y: 1.18, z: 14.0, size: 1.5 },
  { x: 1.5, y: 25.2, z: 14.1, size: 1.8 },
]);

export function backyardWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function backyardBudget(applied) {
  if (applied === 'low') {
    return {
      pots: 4, palms: 3, neighbors: 2, stones: 6, glow: false,
      leaves: 4, fenceMesh: true,
    };
  }
  if (applied === 'high') {
    return {
      pots: 8, palms: 3, neighbors: 4, stones: 10, glow: true,
      leaves: 8, fenceMesh: true,
    };
  }
  return {
    pots: 6, palms: 3, neighbors: 3, stones: 8, glow: true,
    leaves: 6, fenceMesh: true,
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

function turfTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#2f6e3a'], [0.5, '#3f8a4a'], [1, '#2a6234']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = i % 3 ? 'rgba(20,70,28,0.18)' : 'rgba(180,210,90,0.12)';
      g.fillRect((i * 17) % w, (i * 29) % h, 3, 8);
    }
  }, 8, 8);
}

function pebbleTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#c2b39a'], [1, '#b6a488']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${160 + (i % 40)},${140 + (i % 30)},${110},0.28)`;
      g.beginPath();
      g.arc((i * 23) % w, (i * 41) % h, 3 + (i % 4), 0, 6.3);
      g.fill();
    }
  }, 6, 6);
}

function stuccoTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#d2b892'], [1, '#c4a882']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = 'rgba(150,120,80,0.10)';
      g.fillRect((i * 13) % w, (i * 19) % h, 4, 3);
    }
  }, 4, 4);
}

function tileTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    g.fillStyle = '#c45a32';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a84624';
    for (let y = 0; y < h; y += 10) {
      g.fillRect(0, y, w, 8);
      g.fillStyle = '#d46a40';
      g.fillRect((y % 20) ? 8 : 0, y, w, 1);
      g.fillStyle = '#a84624';
    }
  }, 10, 6);
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
  return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 8 });
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
    stucco: feltBasic(THREE, 0xffffff, { map: stuccoTex(THREE) }),
    tile: feltBasic(THREE, 0xffffff, { map: tileTex(THREE) }),
    wood: feltBasic(THREE, hexNum('#6a4e32')),
    shed: feltBasic(THREE, hexNum('#7a8680')),
    cmu: feltBasic(THREE, hexNum('#b89a72')),
    metal: feltBasic(THREE, hexNum('#2a2c30')),
    leaf: feltBasic(THREE, hexNum('#3f8a4a')),
    darkLeaf: feltBasic(THREE, hexNum('#2a6234')),
    water: feltBasic(THREE, hexNum(pal.lane), { transparent: true, opacity: 0.72 }),
    window: feltBasic(THREE, hexNum(pal.windowOn)),
    pvc: feltBasic(THREE, 0xf4f1ea),
    yellow: feltBasic(THREE, hexNum('#e8c04a')),
    cactus: feltBasic(THREE, hexNum('#4a8a4a')),
    red: feltBasic(THREE, hexNum('#c45a40')),
    wicker: feltBasic(THREE, hexNum('#c4a06a')),
    sky: skipMat(new THREE.MeshBasicMaterial({
      map: afternoonSkyTex(THREE), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
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
      || col === BACKYARD_STOCK.metal) {
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
    if (t === 'PlaneGeometry' && (o === floor || col === BACKYARD_STOCK.pebble)) {
      m.map = pebble;
      m.color.setHex(0xffffff);
      skipMat(m);
      n++;
    } else if (t === 'PlaneGeometry' && col === BACKYARD_STOCK.turf) {
      m.map = turf;
      m.color.setHex(0xffffff);
      skipMat(m);
      n++;
    } else if (col === BACKYARD_STOCK.cmu) {
      m.color.setHex(0xb89a72);
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
    placedBox(THREE, P.roofS.w, P.roofS.h, P.roofS.d, P.roofS.x, P.roofS.y, P.roofS.z),
    placedBox(THREE, P.roofN.w, P.roofN.h, P.roofN.d, P.roofN.x, P.roofN.y, P.roofN.z),
    placedBox(THREE, P.eaveS.w, P.eaveS.h, P.eaveS.d, P.eaveS.x, P.eaveS.y, P.eaveS.z),
    placedBox(THREE, P.eaveN.w, P.eaveN.h, P.eaveN.d, P.eaveN.x, P.eaveN.y, P.eaveN.z),
    placedBox(THREE, P.wingEave.w, P.wingEave.h, P.wingEave.d, P.wingEave.x, P.wingEave.y, P.wingEave.z),
    placedBox(THREE, P.alleyEave.w, P.alleyEave.h, P.alleyEave.d, P.alleyEave.x, P.alleyEave.y, P.alleyEave.z),
  ];
  addMerged(THREE, parent, tile, mats.tile);
  const win = [
    placedBox(THREE, 6.4, 4.8, 0.08, -4.2, 3.2, hs.z - hs.d / 2 - 0.04),
    placedBox(THREE, 6.4, 4.8, 0.08, 8.2, 3.2, hs.z - hs.d / 2 - 0.04),
    placedBox(THREE, 5.2, 3.6, 0.08, -4.2, 12.4, hs.z - hs.d / 2 - 0.04),
    placedBox(THREE, 5.2, 3.6, 0.08, 8.2, 12.4, hs.z - hs.d / 2 - 0.04),
  ];
  addMerged(THREE, parent, win, mats.window);
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
  water.rotation.x = -Math.PI / 2;
  water.position.set(P.pool.x, 0.04, P.pool.z);
  water.userData.backyardPool = true;
  mark(water);
  parent.add(water);
  const deck = [
    placedBox(THREE, P.pool.w + P.deckT * 2, 0.18, P.deckT, P.pool.x, 0, P.pool.z - P.pool.d / 2 - P.deckT / 2),
    placedBox(THREE, P.pool.w + P.deckT * 2, 0.18, P.deckT, P.pool.x, 0, P.pool.z + P.pool.d / 2 + P.deckT / 2),
    placedBox(THREE, P.deckT, 0.18, P.pool.d, P.pool.x - P.pool.w / 2 - P.deckT / 2, 0, P.pool.z),
    placedBox(THREE, P.deckT, 0.18, P.pool.d, P.pool.x + P.pool.w / 2 + P.deckT / 2, 0, P.pool.z),
    placedBox(THREE, P.pad.w, P.pad.h, P.pad.d, P.pad.x, 0, P.pad.z),
    placedBox(THREE, P.fire.w, 0.1, P.fire.d, P.fire.x, 0, P.fire.z),
  ];
  addMerged(THREE, parent, deck, mats.pebble);
  if (budget.glow) {
    const shimmer = new THREE.Mesh(new THREE.CircleGeometry(4.8, 16), mats.glow);
    shimmer.rotation.x = -Math.PI / 2;
    shimmer.position.set(P.pool.x, 0.06, P.pool.z);
    shimmer.userData.backyardPool = true;
    mark(shimmer);
    parent.add(shimmer);
  }
}

function addFenceAndPots(THREE, parent, mats, budget, gates) {
  const fn = BACKYARD_PLAY.fence;
  const posts = [];
  let i = 0;
  for (let z = fn.z0; z <= fn.z1 + 0.05; z += fn.spacing, i++) {
    posts.push(placedBox(THREE, fn.post, fn.h, fn.post, fn.x, 0, z));
    if (i % 2 === 0 && z + fn.spacing <= fn.z1 + 0.05) {
      posts.push(placedBox(THREE, 0.05, 1.15, fn.spacing, fn.x, fn.h * 0.12, z + fn.spacing / 2));
      posts.push(placedBox(THREE, 0.04, 1.15, fn.spacing, fn.x, fn.h * 0.55, z + fn.spacing / 2));
    }
  }
  addMerged(THREE, parent, posts, mats.metal);
  const potSpots = [
    [1.15, -10.4, mats.cactus], [1.15, -5.2, mats.cactus],
    [1.20, 0.2, mats.red], [1.10, 2.8, mats.cactus],
    [-6.4, 2.6, mats.red], [6.8, 2.2, mats.cactus],
    [-12.2, -12.8, mats.cactus], [10.4, -14.6, mats.red],
  ];
  const n = Math.min(budget.pots, potSpots.length);
  for (let k = 0; k < n; k++) {
    const s = potSpots[k];
    if (!propClearOfCourse(s[0], s[1], 0.28, gates, { gatePad: 1.4, corridor: 1.2, yRange: 2 })) continue;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.42, 8), mats.tile);
    pot.position.set(s[0], 0.21, s[1]);
    mark(pot);
    parent.add(pot);
    const plant = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.55, 3, 6), s[2]);
    plant.position.set(s[0], 0.72, s[1]);
    mark(plant);
    parent.add(plant);
  }
}

function addLounge(THREE, parent, mats, budget) {
  const P = BACKYARD_PLAY;
  const sofa = new THREE.Mesh(placedBox(THREE, P.sofa.w, P.sofa.seatH, P.sofa.d, P.sofa.x, 0, P.sofa.z), mats.wicker);
  mark(sofa);
  parent.add(sofa);
  const back = new THREE.Mesh(placedBox(THREE, P.sofa.w, P.sofa.backH - P.sofa.seatH, P.sofa.backD, P.sofa.x, P.sofa.seatH, P.sofa.z - P.sofa.d / 2 + P.sofa.backD / 2), mats.wicker);
  mark(back);
  parent.add(back);
  const um = P.umbrella;
  const arch = [];
  for (let i = 0; i < um.segs; i++) {
    const a = (i / (um.segs - 1)) * Math.PI * 0.92;
    arch.push(placedBox(THREE, um.bar, um.bar + 0.16, um.bar, um.x + Math.sin(a) * um.r, (1 - Math.cos(a)) * um.r, um.z));
  }
  addMerged(THREE, parent, arch, mats.metal);
  const canopy = [];
  const c = P.canopy;
  canopy.push(placedBox(THREE, c.innerW + c.bar * 2, c.bar, c.depth, c.x, c.y + c.innerH / 2, c.z));
  canopy.push(placedBox(THREE, c.innerW + c.bar * 2, c.bar, c.depth, c.x, c.y - c.innerH / 2 - c.bar, c.z));
  canopy.push(placedBox(THREE, c.bar, c.innerH, c.depth, c.x - c.innerW / 2 - c.bar / 2, c.y - c.innerH / 2, c.z));
  canopy.push(placedBox(THREE, c.bar, c.innerH, c.depth, c.x + c.innerW / 2 + c.bar / 2, c.y - c.innerH / 2, c.z));
  addMerged(THREE, parent, canopy, mats.yellow);
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
  const ac = new THREE.Mesh(placedBox(THREE, P.ac.w, P.ac.h, P.ac.d, P.ac.x, 0, P.ac.z), mats.metal);
  mark(ac);
  parent.add(ac);
  const gate = new THREE.Mesh(placedBox(THREE, P.woodGate.w, P.woodGate.h, P.woodGate.d, P.woodGate.x, 0, P.woodGate.z), mats.wood);
  mark(gate);
  parent.add(gate);
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
  const roofs = [];
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    roofs.push(placedBox(THREE, s[2] + 1.2, 0.4, s[3] + 1.2, s[0], 16.5, s[1]));
  }
  addMerged(THREE, parent, roofs, mats.tile);
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
  const marks = [
    [4.0, 0.04, 2.0], [13.5, 0.04, -3.5], [17.2, 0.04, -12.6],
    [-8.5, 0.04, -5.5], [-15.05, 0.04, -14.6], [21.75, 0.04, 12.4],
  ];
  const geo = new THREE.CircleGeometry(0.22, 10);
  for (const m of marks) {
    if (!propClearOfCourse(m[0], m[2], 0.2, gates, { gatePad: 1.1, corridor: 1.0, yRange: 2 })) continue;
    const disc = new THREE.Mesh(geo, mats.tile);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(m[0], m[1], m[2]);
    mark(disc);
    extras.add(disc);
  }
  parent.add(extras);
}

export function buildRyanYard(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'backyardArtVisuals';
  group.userData.backyardArt = true;
  const budget = backyardBudget(quality);
  const mats = makeYardMats(THREE, vibe, quality);
  addSky(THREE, group, mats);
  addHouse(THREE, group, mats);
  addPvc(THREE, group, mats);
  addTree(THREE, group, mats, budget);
  addPool(THREE, group, mats, budget);
  addFenceAndPots(THREE, group, mats, budget, gates || BACKYARD_KEEP_GATES);
  addLounge(THREE, group, mats, budget);
  addYardExtras(THREE, group, mats);
  addNeighbors(THREE, group, mats, budget);
  addPlayLines(THREE, group, mats, gates || BACKYARD_KEEP_GATES);
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
  if (o.userData && o.userData.backyardPool && o.material && o.material.opacity != null) {
    o.material.opacity = 0.68 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.4));
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
