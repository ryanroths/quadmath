// Pocket Stage — original Your Room vibe. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.
// Clay/felt furniture on the same AABBs. Felt-ring gates. Bloom off.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=d290c9ab2bdb';
import { planRoom } from './sim-room.js?v=423358ddd55a';

export const ROOM_STOCK = Object.freeze({
  wall: 0xd8d2c6,
  ceil: 0xeee8de,
  wood: 0x7a5130,
  dark: 0x2a2c32,
  sofa: 0x4a5a6a,
  cloth: 0x6a4a38,
});

const DEFAULT_PLAN = planRoom();

export const ROOM_KEEP_GATES = Object.freeze(
  (DEFAULT_PLAN.track && DEFAULT_PLAN.track.gates || []).map((g) => ({
    x: g.x, y: g.y, z: g.z, size: g.size,
  })),
);

export function roomWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function roomBudget(applied) {
  if (applied === 'low') {
    return {
      toys: 6, beads: 0, frames: 2, books: 6, plants: 1,
      glow: false, lamp: true, window: true,
      stars: 10, socks: 4, boxes: 2, posters: 3, shirts: 3,
    };
  }
  if (applied === 'high') {
    return {
      toys: 12, beads: 18, frames: 6, books: 16, plants: 3,
      glow: true, lamp: true, window: true,
      stars: 22, socks: 8, boxes: 4, posters: 5, shirts: 5,
    };
  }
  return {
    toys: 10, beads: 12, frames: 4, books: 12, plants: 2,
    glow: true, lamp: true, window: true,
    stars: 16, socks: 6, boxes: 3, posters: 4, shirts: 4,
  };
}

function skipMat(m) {
  if (!m) return m;
  m.userData.looksSkip = true;
  m.userData.artLocked = true;
  return m;
}

function tag(o) {
  if (o) o.userData.roomArt = true;
  return o;
}

function canvasTex(THREE, w, h, paint, rx, ry) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  try { paint(g, w, h); } catch (e) {
    if (g) { g.fillStyle = '#eee8de'; g.fillRect(0, 0, w, h); }
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

function feltFloorTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#8a5e3a'], [0.5, '#7a5130'], [1, '#5a381c']]);
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = y % 32 === 0 ? '#8a5e3a' : '#6e4628';
      g.fillRect(0, y, w, 10);
    }
    g.globalAlpha = 0.2;
    g.fillStyle = '#ffb3c7';
    for (let x = 12; x < w; x += 36) g.fillRect(x, 0, 2, h);
    g.globalAlpha = 0.16;
    g.fillStyle = '#1a1210';
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 14, w, 14);
    g.globalAlpha = 1;
  }, 4, 5);
}

function plasterTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#f6f0e6'], [0.7, '#eee8de'], [1, '#d8d2c6']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,179,199,${0.04 + (i % 4) * 0.02})`;
      g.beginPath();
      g.arc((i * 19) % w, (i * 23) % h, 5 + (i % 6), 0, 6.3);
      g.fill();
    }
    g.fillStyle = 'rgba(126,200,227,0.10)';
    for (let y = 10; y < h; y += 20) g.fillRect(0, y, w, 3);
  }, 6, 4);
}

function ceilTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#d8d2c6'], [1, '#c8c0b4']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(122,81,48,0.12)';
    g.lineWidth = 2;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = 'rgba(255,230,138,0.12)';
    g.fillRect(20, 20, w - 40, h - 40);
  }, 8, 6);
}

function stageSignTex(THREE) {
  return canvasTex(THREE, 256, 96, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#ffb3c7'], [0.55, '#ffe08a'], [1, '#7ec8e3']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a5130';
    g.fillRect(0, 0, w, 7);
    g.fillRect(0, h - 7, w, 7);
    g.fillRect(0, 0, 7, h);
    g.fillRect(w - 7, 0, 7, h);
    g.fillStyle = '#7a5130';
    g.font = 'bold 42px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('STAGE', w * 0.5, h * 0.55);
  }, 1, 1);
}

function nightPaneTex(THREE) {
  return canvasTex(THREE, 64, 96, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#1a2840'], [0.6, '#2a4060'], [1, '#7ec8e3']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe08a';
    for (let i = 0; i < 18; i++) {
      g.globalAlpha = 0.45 + (i % 3) * 0.15;
      g.fillRect((i * 13) % (w - 6) + 2, 8 + (i * 17) % (h - 28), 2, 2);
    }
    g.globalAlpha = 0.55;
    g.fillStyle = '#ffb3c7';
    g.fillRect(8, h - 22, 10, 16);
    g.fillRect(22, h - 30, 8, 24);
    g.fillRect(34, h - 18, 12, 12);
    g.globalAlpha = 1;
  }, 1, 1);
}

function walnutTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#7a5130';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 7) {
      g.fillStyle = y % 14 === 0 ? '#8d5d38' : '#6a4426';
      g.fillRect(0, y, w, 4);
    }
  }, 2, 2);
}

function feltRugTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#ffb3c7';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7ec8e3';
    g.globalAlpha = 0.22;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.28, 0, 6.3);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = '#ffe08a';
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
  }, 1, 1);
}

function clayMat(THREE, hex, extras) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.82, metalness: 0, envMapIntensity: 0.1,
  }, extras || {})));
}

function emitMat(THREE, hex, emit) {
  return skipMat(new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: emit == null ? 1.6 : emit,
    roughness: 0.5, metalness: 0, envMapIntensity: 0.08,
  }));
}

function glowMat(THREE, hex, opacity) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: opacity == null ? 0.28 : opacity,
    depthWrite: false, toneMapped: false,
  }));
}

function addMesh(parent, mesh) {
  tag(mesh);
  parent.add(mesh);
  return mesh;
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
  mesh.userData.roomArt = true;
  const dummy = new THREE.Object3D();
  let written = 0;
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
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

export function hideStockRoomMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.roomArt) return;
    if (o.parent && o.parent.name === 'roomArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === ROOM_STOCK.sofa || col === ROOM_STOCK.cloth || col === ROOM_STOCK.dark) {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (col === ROOM_STOCK.wood && t === 'BoxGeometry') {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

export function restyleRoomShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const wallTex = plasterTex(THREE);
  const floorTex = feltFloorTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.roomArt || (o.parent && o.parent.name === 'roomArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === ROOM_STOCK.wall) {
      m.color.setHex(0xeee8de);
      m.map = wallTex;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      skipMat(m); n++;
    } else if (col === ROOM_STOCK.ceil) {
      m.color.setHex(0xffffff);
      m.map = ceilTex(THREE);
      m.emissive.setHex(0xffe6c4);
      m.emissiveIntensity = 0.14;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === ROOM_STOCK.wood)) {
      if (m.map && m.map !== floorTex && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = floorTex;
      m.color.setHex(0xffffff);
      m.roughness = 0.86;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      skipMat(m); n++;
    }
  });
  return n;
}

function makeRoomMats(THREE, vibe) {
  const grain = walnutTex(THREE);
  return {
    felt: clayMat(THREE, hexNum(vibe.palette.neonA)),
    clay: clayMat(THREE, hexNum('#d4a078')),
    walnut: clayMat(THREE, hexNum(vibe.palette.mesa), { map: grain }),
    sky: emitMat(THREE, hexNum(vibe.palette.neonB), 1.1),
    lamp: emitMat(THREE, hexNum(vibe.palette.neonC), 2.4),
    toy: clayMat(THREE, hexNum(vibe.palette.neonB)),
    toyAlt: clayMat(THREE, hexNum(vibe.palette.neonC)),
    bead: clayMat(THREE, hexNum(vibe.palette.neonA), {
      emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.45,
    }),
    plant: clayMat(THREE, hexNum('#7ec8e3')),
    book: clayMat(THREE, hexNum('#7ec8e3')),
    bookAlt: clayMat(THREE, hexNum('#ffe08a')),
    frame: clayMat(THREE, hexNum(vibe.palette.mesa)),
    art: emitMat(THREE, hexNum(vibe.palette.neonB), 0.35),
    rug: clayMat(THREE, hexNum(vibe.palette.neonA), { map: feltRugTex(THREE), roughness: 0.95 }),
    pool: glowMat(THREE, 0xffe6c4, 0.16),
    curtain: clayMat(THREE, hexNum(vibe.palette.neonA), { roughness: 0.9 }),
    sign: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: stageSignTex(THREE), toneMapped: false,
    })),
    star: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffe08a, toneMapped: false,
    })),
    night: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: nightPaneTex(THREE), toneMapped: false,
    })),
    sock: clayMat(THREE, hexNum('#7ec8e3')),
    shirt: clayMat(THREE, hexNum('#ffb3c7')),
    box: clayMat(THREE, hexNum('#ffe08a')),
  };
}

function localBox(THREE, parent, mats, x, y, z, w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return addMesh(parent, m);
}

function addFeltBed(THREE, parent, mats, item) {
  const g = new THREE.Group();
  g.position.set(item.x, item.y, item.z);
  if (item.ry) g.rotation.y = item.ry;
  tag(g);
  const w = item.w, h = item.h, d = item.d;
  localBox(THREE, g, mats, 0, 0.12, 0, w * 0.96, 0.16, d * 0.96, mats.walnut);
  localBox(THREE, g, mats, 0, h * 0.42, 0, w * 0.92, h * 0.42, d * 0.9, mats.felt);
  localBox(THREE, g, mats, 0, h * 0.72, d * 0.02, w * 0.86, 0.12, d * 0.62, mats.clay);
  localBox(THREE, g, mats, 0, h * 0.72, -d * 0.42, w * 0.98, h * 0.85, 0.16, mats.felt);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.1, 0.2), mats.clay);
  cap.position.set(0, h * 1.16, -d * 0.42);
  addMesh(g, cap);
  for (const sx of [-w * 0.22, w * 0.22]) {
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.28, 0.16, d * 0.22), mats.clay);
    pillow.position.set(sx, h * 0.82, -d * 0.22);
    addMesh(g, pillow);
  }
  const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, w * 0.42, 3, 6), mats.felt);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, h * 0.78, d * 0.28);
  addMesh(g, roll);
  const stuff = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mats.toy);
  stuff.position.set(w * 0.22, h * 0.86, d * 0.08);
  addMesh(g, stuff);
  const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mats.felt);
  ear.position.set(w * 0.16, h * 1.02, d * 0.08);
  addMesh(g, ear);
  const ear2 = ear.clone();
  ear2.position.x = w * 0.28;
  addMesh(g, ear2);
  parent.add(g);
}

function addFeltSoftSeat(THREE, parent, mats, item) {
  const g = new THREE.Group();
  g.position.set(item.x, item.y, item.z);
  if (item.ry) g.rotation.y = item.ry;
  tag(g);
  const w = item.w, h = item.h, d = item.d;
  localBox(THREE, g, mats, 0, h * 0.32, 0, w * 0.92, h * 0.42, d * 0.88, mats.felt);
  localBox(THREE, g, mats, 0, h * 0.72, 0, w * 0.84, 0.12, d * 0.72, mats.clay);
  localBox(THREE, g, mats, 0, h * 0.78, -d * 0.36, w * 0.92, h * 0.55, 0.16, mats.felt);
  if (item.kind === 'sofa') {
    localBox(THREE, g, mats, -w * 0.42, h * 0.55, 0, 0.16, h * 0.5, d * 0.86, mats.felt);
    localBox(THREE, g, mats, w * 0.42, h * 0.55, 0, 0.16, h * 0.5, d * 0.86, mats.felt);
  }
  parent.add(g);
}

function addWalnutCase(THREE, parent, mats, item, budget) {
  const g = new THREE.Group();
  g.position.set(item.x, item.y, item.z);
  if (item.ry) g.rotation.y = item.ry;
  tag(g);
  const w = item.w, h = item.h, d = item.d;
  localBox(THREE, g, mats, 0, h * 0.5, 0, w, h, d, mats.walnut);
  const rows = item.kind === 'dresser' ? 3 : 1;
  for (let i = 0; i < rows; i++) {
    const y = h * (0.22 + i * (0.55 / rows));
    localBox(THREE, g, mats, w * 0.02, y, d * 0.46, w * 0.78, h * 0.16, 0.04, mats.clay);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), mats.felt);
    knob.position.set(0, y, d * 0.5);
    addMesh(g, knob);
  }
  if (item.kind === 'nightstand') {
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.12, 8), mats.sky);
    mug.position.set(w * 0.12, h + 0.08, 0);
    addMesh(g, mug);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.2), mats.bookAlt);
    book.position.set(-w * 0.16, h + 0.04, 0.05);
    addMesh(g, book);
  }
  if (item.kind === 'dresser' && budget.plants > 0) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.16, 8), mats.walnut);
    pot.position.set(0, h + 0.1, 0);
    addMesh(g, pot);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mats.plant);
    leaf.position.set(0, h + 0.32, 0);
    addMesh(g, leaf);
  }
  parent.add(g);
}

function addFeltDesk(THREE, parent, mats, item, budget) {
  const g = new THREE.Group();
  g.position.set(item.x, item.y, item.z);
  if (item.ry) g.rotation.y = item.ry;
  tag(g);
  const w = item.w, h = item.h, d = item.d;
  localBox(THREE, g, mats, 0, h - 0.06, 0, w, 0.12, d, mats.walnut);
  localBox(THREE, g, mats, 0, h - 0.18, 0, w * 0.9, 0.1, d * 0.82, mats.clay);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, h - 0.28, 3, 6), mats.walnut);
    leg.position.set(sx * w * 0.4, (h - 0.12) / 2, sz * d * 0.38);
    addMesh(g, leg);
  }
  if (budget.lamp) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 8), mats.walnut);
    base.position.set(0, h + 0.04, -d * 0.22);
    addMesh(g, base);
    const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.22, 3, 6), mats.walnut);
    stem.position.set(0, h + 0.2, -d * 0.22);
    addMesh(g, stem);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.14, 10), mats.lamp);
    shade.position.set(0, h + 0.38, -d * 0.22);
    shade.userData.roomLamp = true;
    addMesh(g, shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mats.lamp);
    bulb.position.set(0, h + 0.32, -d * 0.22);
    bulb.userData.roomLamp = true;
    addMesh(g, bulb);
  }
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 8), mats.felt);
  cup.position.set(w * 0.28, h + 0.07, d * 0.12);
  addMesh(g, cup);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.22), mats.book);
  stack.position.set(-w * 0.26, h + 0.06, d * 0.08);
  addMesh(g, stack);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.2), mats.walnut);
  keys.position.set(0, h + 0.04, d * 0.12);
  addMesh(g, keys);
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.05), mats.night);
  mon.position.set(0, h + 0.36, -d * 0.38);
  mon.userData.roomLamp = true;
  addMesh(g, mon);
  parent.add(g);
}

function addFeltFurniture(THREE, parent, mats, plan, budget) {
  const items = (plan && plan.furniture) || DEFAULT_PLAN.furniture;
  for (const item of items) {
    if (item.kind === 'bed') addFeltBed(THREE, parent, mats, item);
    else if (item.kind === 'sofa' || item.kind === 'chair') addFeltSoftSeat(THREE, parent, mats, item);
    else if (item.kind === 'desk') addFeltDesk(THREE, parent, mats, item, budget);
    else addWalnutCase(THREE, parent, mats, item, budget);
  }
}

function latheCone(THREE) {
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.11, 0),
    new THREE.Vector2(0.02, 0.24),
    new THREE.Vector2(0, 0.26),
  ];
  return new THREE.LatheGeometry(pts, 8);
}

function frameShape(THREE) {
  const s = new THREE.Shape();
  s.moveTo(-0.32, -0.22);
  s.lineTo(0.32, -0.22);
  s.lineTo(0.32, 0.22);
  s.lineTo(-0.32, 0.22);
  s.lineTo(-0.32, -0.22);
  const hole = new THREE.Path();
  hole.moveTo(-0.22, -0.14);
  hole.lineTo(0.22, -0.14);
  hole.lineTo(0.22, 0.14);
  hole.lineTo(-0.22, 0.14);
  hole.lineTo(-0.22, -0.14);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 1 });
}

function addWhoopLife(THREE, parent, mats, budget, plan, gates) {
  const extras = new THREE.Group();
  extras.name = 'roomArtExtras';
  extras.userData.roomArt = true;
  const w = (plan && plan.w) || DEFAULT_PLAN.w;
  const d = (plan && plan.d) || DEFAULT_PLAN.d;
  const h = (plan && plan.h) || DEFAULT_PLAN.h;
  const hx = w / 2 - 0.22;
  const hz = d / 2 - 0.22;

  if (budget.window) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, Math.min(2.2, h * 0.38), Math.min(2.4, d * 0.24)), mats.night);
    pane.position.set(w / 2 - 0.18, h * 0.58, -d * 0.08);
    addMesh(extras, pane);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.04, Math.min(2.0, h * 0.34), Math.min(2.2, d * 0.22)), glowMat(THREE, 0x7ec8e3, 0.22));
    glow.position.set(w / 2 - 0.22, h * 0.58, -d * 0.08);
    addMesh(extras, glow);
    localBox(THREE, extras, mats, w / 2 - 0.22, h * 0.58, -d * 0.08, 0.08, Math.min(2.4, h * 0.42), 0.08, mats.walnut);
    localBox(THREE, extras, mats, w / 2 - 0.22, h * 0.58, -d * 0.08 + Math.min(1.15, d * 0.12), 0.08, Math.min(2.4, h * 0.42), 0.08, mats.walnut);
    localBox(THREE, extras, mats, w / 2 - 0.22, h * 0.58, -d * 0.08 - Math.min(1.15, d * 0.12), 0.08, Math.min(2.4, h * 0.42), 0.08, mats.walnut);
    localBox(THREE, extras, mats, w / 2 - 0.22, h * 0.38, -d * 0.08, 0.16, 0.08, Math.min(2.5, d * 0.26), mats.walnut);
    const cL = new THREE.Mesh(new THREE.BoxGeometry(0.05, Math.min(2.1, h * 0.36), 0.35), mats.curtain);
    cL.position.set(w / 2 - 0.26, h * 0.58, -d * 0.08 - Math.min(1.05, d * 0.11));
    addMesh(extras, cL);
    const cR = cL.clone();
    cR.position.z = -d * 0.08 + Math.min(1.05, d * 0.11);
    addMesh(extras, cR);
  }

  const rug = new THREE.Mesh(new THREE.CircleGeometry(Math.min(2.5, w * 0.24), 20), mats.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.03, 0.35);
  addMesh(extras, rug);

  const boards = [
    [0, 0.07, -hz, w - 0.5, 0.14, 0.1],
    [0, 0.07, hz, w - 0.5, 0.14, 0.1],
    [-hx, 0.07, 0, 0.1, 0.14, d - 0.5],
    [hx, 0.07, 0, 0.1, 0.14, d - 0.5],
  ];
  for (const [x, y, z, bw, bh, bd] of boards) {
    localBox(THREE, extras, mats, x, y, z, bw, bh, bd, mats.walnut);
  }
  const rails = [
    [0, 1.12, -hz, w - 0.6, 0.06, 0.05],
    [0, 1.12, hz, w - 0.6, 0.06, 0.05],
    [-hx, 1.12, 0, 0.05, 0.06, d - 0.6],
    [hx, 1.12, 0, 0.05, 0.06, d - 0.6],
  ];
  for (const [x, y, z, bw, bh, bd] of rails) {
    localBox(THREE, extras, mats, x, y, z, bw, bh, bd, mats.felt);
  }

  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.lamp);
  lantern.position.set(0, h - 0.55, 0.2);
  lantern.userData.roomLamp = true;
  addMesh(extras, lantern);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), mats.walnut);
  cord.position.set(0, h - 0.28, 0.2);
  addMesh(extras, cord);

  const frameGeo = frameShape(THREE);
  addInstanced(THREE, extras, frameGeo, mats.frame, budget.frames, (dmy, i) => {
    const left = i % 2 === 0;
    dmy.position.set(left ? -w / 2 + 0.2 : w / 2 - 0.2, 1.85 + (i % 3) * 0.85, -d * 0.12 + ((i * 2) % 4) * 1.05);
    dmy.rotation.set(0, left ? Math.PI / 2 : -Math.PI / 2, 0);
    dmy.scale.set(1.7, 1.7, 1);
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.72, 0.48, 0.03), mats.art, budget.frames, (dmy, i) => {
    const left = i % 2 === 0;
    dmy.position.set(left ? -w / 2 + 0.22 : w / 2 - 0.22, 1.85 + (i % 3) * 0.85, -d * 0.12 + ((i * 2) % 4) * 1.05);
    dmy.rotation.set(0, left ? Math.PI / 2 : -Math.PI / 2, 0);
    return true;
  });

  const bookGeo = new THREE.BoxGeometry(0.22, 0.32, 0.06);
  addInstanced(THREE, extras, bookGeo, mats.book, budget.books, (dmy, i) => {
    const x = -w * 0.32 + (i % 5) * 0.12;
    const z = d * 0.22;
    if (!propClearOfCourse(x, z, 0.16, gates, { gatePad: 1.15, corridor: 1.0, yRange: 2 })) return false;
    dmy.position.set(x, 0.18 + ((i / 5) | 0) * 0.08, z);
    dmy.rotation.y = 0.15 + (i % 3) * 0.08;
    return true;
  });

  const toyBox = new THREE.BoxGeometry(0.26, 0.16, 0.26);
  addInstanced(THREE, extras, toyBox, mats.toy, Math.ceil(budget.toys / 2), (dmy, i) => {
    const x = -w * 0.16 + (i % 3) * 0.5;
    const z = d * 0.06 + ((i / 3) | 0) * 0.42;
    if (!propClearOfCourse(x, z, 0.16, gates, { gatePad: 1.2, corridor: 1.1, yRange: 2 })) return false;
    dmy.position.set(x, 0.1, z);
    dmy.rotation.y = i * 0.35;
    return true;
  });
  addInstanced(THREE, extras, latheCone(THREE), mats.toyAlt, Math.floor(budget.toys / 2), (dmy, i) => {
    const x = w * 0.02 + (i % 3) * 0.42;
    const z = d * 0.1 + ((i / 3) | 0) * 0.4;
    if (!propClearOfCourse(x, z, 0.14, gates, { gatePad: 1.2, corridor: 1.1, yRange: 2 })) return false;
    dmy.position.set(x, 0.02, z);
    dmy.rotation.y = i * 0.5;
    return true;
  });

  if (budget.plants > 1) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.18, 8), mats.walnut);
    pot.position.set(w * 0.18, 0.1, -d * 0.28);
    addMesh(extras, pot);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mats.plant);
    leaf.position.set(w * 0.18, 0.34, -d * 0.28);
    addMesh(extras, leaf);
  }

  if (budget.beads > 0) {
    addInstanced(THREE, extras, new THREE.SphereGeometry(0.08, 6, 5), mats.bead, budget.beads, (dmy, i) => {
      const col = i % 6;
      dmy.position.set(-w * 0.22 + col * 0.18, h - 0.85 - (i % 3) * 0.22, -d * 0.06);
      return true;
    });
  }
  if (budget.glow) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), mats.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(w * 0.22, 0.025, -d * 0.06);
    addMesh(extras, pool);
  }

  addInstanced(THREE, extras, new THREE.SphereGeometry(0.05, 6, 5), mats.star, budget.stars, (dmy, i) => {
    dmy.position.set(-w * 0.32 + (i % 5) * (w * 0.16), h - 0.35, -d * 0.32 + ((i / 5) | 0) * (d * 0.18));
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.22, 0.08, 0.12), mats.sock, budget.socks, (dmy, i) => {
    const x = -w * 0.12 + (i % 4) * 0.38;
    const z = d * 0.08 + ((i / 4) | 0) * 0.3;
    if (!propClearOfCourse(x, z, 0.14, gates, { gatePad: 1.15, corridor: 1.0, yRange: 2 })) return false;
    dmy.position.set(x, 0.06, z);
    dmy.rotation.y = i * 0.4;
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(1.15, 1.35, 0.04), mats.art, budget.posters, (dmy, i) => {
    dmy.position.set(-w * 0.34 + i * 1.45, 2.55, -d / 2 + 0.2);
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.42, 0.55, 0.08), mats.shirt, budget.shirts, (dmy, i) => {
    dmy.position.set(-w / 2 + 0.85, 1.85, -d * 0.02 + i * 0.42);
    dmy.rotation.y = Math.PI / 2;
    return true;
  });

  parent.add(extras);
}

function addHeroStageSign(THREE, parent, mats, plan) {
  const w = (plan && plan.w) || DEFAULT_PLAN.w;
  const d = (plan && plan.d) || DEFAULT_PLAN.d;
  const h = (plan && plan.h) || DEFAULT_PLAN.h;
  const hero = new THREE.Group();
  hero.name = 'roomArtHero';
  hero.userData.roomArt = true;
  const cable = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, h * 0.42, 3, 6), mats.walnut);
  cable.position.set(-0.85, h * 0.72, -d * 0.18);
  addMesh(hero, cable);
  const cable2 = cable.clone();
  cable2.position.x = 0.85;
  addMesh(hero, cable2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3.2, w * 0.42), 0.95, 0.1), mats.walnut);
  body.position.set(0, h * 0.46, -d * 0.18);
  addMesh(hero, body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.95, w * 0.38), 0.78, 0.05), mats.sign);
  face.position.set(0, h * 0.46, -d * 0.18 - 0.08);
  addMesh(hero, face);
  const faceBack = face.clone();
  faceBack.position.z = -d * 0.18 + 0.08;
  faceBack.rotation.y = Math.PI;
  addMesh(hero, faceBack);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), mats.star);
  disc.position.set(0, h * 0.32, -d * 0.18);
  disc.userData.roomStage = true;
  addMesh(hero, disc);
  const pip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mats.bead);
  pip.position.set(-1.15, h * 0.46, -d * 0.18 - 0.08);
  pip.userData.roomMobile = true;
  addMesh(hero, pip);
  const pip2 = pip.clone();
  pip2.position.x = 1.15;
  addMesh(hero, pip2);
  hero.traverse((o) => { o.userData.roomArt = true; });
  parent.add(hero);
}

function addSecretDressing(THREE, parent, mats, plan) {
  const d = (plan && plan.d) || DEFAULT_PLAN.d;
  // Under-bed nook — whoop crawl at the foot of the default bed.
  for (let i = 0; i < 3; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.42), i % 2 ? mats.box : mats.felt);
    box.position.set(-0.55 + i * 0.55, 0.14, -d * 0.26);
    addMesh(parent, box);
  }
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.7), glowMat(THREE, 0xffe08a, 0.28));
  glow.position.set(0, 0.04, -d * 0.26);
  addMesh(parent, glow);
  const stuffed = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.toyAlt);
  stuffed.position.set(0.15, 0.32, -d * 0.26);
  stuffed.userData.roomMobile = true;
  addMesh(parent, stuffed);
}

export function buildPocketStage(THREE, parent, vibe, quality, gates, plan) {
  const group = new THREE.Group();
  group.name = 'roomArtVisuals';
  group.userData.roomArt = true;
  const budget = roomBudget(quality);
  const mats = makeRoomMats(THREE, vibe);
  const used = plan || DEFAULT_PLAN;
  const keep = gates || (used.track && used.track.gates) || ROOM_KEEP_GATES;
  addFeltFurniture(THREE, group, mats, used, budget);
  addWhoopLife(THREE, group, mats, budget, used, keep);
  addHeroStageSign(THREE, group, mats, used);
  addSecretDressing(THREE, group, mats, used);
  parent.add(group);
  return group;
}

export function decorateRoomGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 2.2;
  if (ring.material) {
    ring.material.color.setHex(col);
    ring.material.emissive.setHex(col);
    ring.material.emissiveIntensity = emit;
    skipMat(ring.material);
  }
  const felt = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.04, size * 0.12, 8, 20),
    clayMat(THREE, col, { emissive: col, emissiveIntensity: emit }),
  );
  ring.add(felt);
  ring.userData.artHalo = felt;
  ring.userData.artStyle = 'felt-ring';
  const pips = [];
  for (let i = 0; i < 5; i++) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(size * 0.08, 6, 5), emitMat(THREE, hexNum(vibe.palette.neonB), emit));
    const a = i * Math.PI * 2 / 5;
    pip.position.set(Math.cos(a) * size * 1.04, Math.sin(a) * size * 1.04, 0);
    ring.add(pip);
    pips.push(pip);
  }
  ring.userData.artExtras = pips;
  return felt;
}

export function pulseRoomGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 2.2;
  if (isNext) {
    col = 0xffffff;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 3.2) + pulse;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.03);
  } else if (passed) {
    col = 0x7ec8e3;
    emit = 1.4;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickRoomArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.roomLamp || u.roomStage || u.roomMobile) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickRoomArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickRoomArtObject(o, t) {
  if (o.userData && o.userData.roomLamp && o.material) {
    o.material.emissiveIntensity = 1.8 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2));
  }
  if (o.userData && o.userData.roomStage) {
    o.rotation.z = t * 0.2;
  }
  if (o.userData && o.userData.roomMobile) {
    if (o.userData.roomBaseY == null) o.userData.roomBaseY = o.position.y;
    o.rotation.y = t * 0.55;
    o.position.y = o.userData.roomBaseY + Math.sin(t * 1.6) * 0.05;
  }
}

export function restyleRoom(THREE, ctx) {
  try {
    return restyleRoomInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleRoom', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleRoomInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockRoomMeshes(root);
  restyleRoomShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('roomArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    const used = ctx.plan || DEFAULT_PLAN;
    const keep = ctx.gates || (used.track && used.track.gates) || ROOM_KEEP_GATES;
    visuals = buildPocketStage(THREE, root, vibe, quality, keep, used);
  }
  if (root) root.userData.roomArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
