// Ion Nave — playable whoop playground + Kenney CC0 shop kit.
// Colliders live in sim-maps.js WAREHOUSE_PLAY and must match kit/proc meshes.
// Kenney kit (sim-art-kit.js) swaps floor clutter after first paint.
// Procedural meshes stay if a mesh fails. Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=10aecc280e13';
import { WAREHOUSE_PLAY } from './sim-maps.js?v=9419f0a07e21';

export const WAREHOUSE_STOCK = Object.freeze({
  wall: 0x8d9096,
  ceil: 0x6e7278,
  floor: 0x7a7d82,
  metal: 0x5c6570,
  wood: 0x6b5340,
  orange: 0xc45a22,
});

export const WAREHOUSE_KEEP_GATES = Object.freeze([
  { x: 0.0, y: 2.6, z: 34.0, size: 2.1 },
  { x: -14.0, y: 2.4, z: 18.0, size: 1.9 },
  { x: -14.0, y: 2.4, z: -6.0, size: 1.9 },
  { x: -14.0, y: 2.5, z: -28.0, size: 1.9 },
  { x: 0.0, y: 2.6, z: -34.0, size: 2.0 },
  { x: 14.0, y: 2.4, z: -18.0, size: 1.9 },
  { x: 14.0, y: 2.4, z: 6.0, size: 1.9 },
  { x: 14.0, y: 2.5, z: 24.0, size: 1.9 },
  { x: 0.0, y: 2.6, z: 26.0, size: 2.1 },
  { x: 0.0, y: 2.8, z: 32.0, size: 2.0 },
  { x: -14.0, y: 8.5, z: 16.0, size: 1.8 },
  { x: -14.0, y: 11.5, z: -8.0, size: 1.7 },
  { x: 0.0, y: 12.0, z: -28.0, size: 1.8 },
  { x: 14.0, y: 11.2, z: -8.0, size: 1.7 },
  { x: 14.0, y: 6.5, z: 14.0, size: 1.8 },
  { x: 0.0, y: 3.2, z: 20.0, size: 2.0 },
  { x: 0.0, y: 2.80, z: 12.0, size: 1.9 },
  { x: -7.5, y: 0.65, z: 0.0, size: 1.5 },
  { x: -22.0, y: 1.10, z: 36.0, size: 1.5 },
  { x: 7.5, y: 2.85, z: 24.0, size: 1.5 },
  { x: 22.5, y: 11.10, z: 0.0, size: 1.6 },
  { x: 0.0, y: 1.55, z: -38.4, size: 1.5 },
  { x: 0.0, y: 16.25, z: 12.0, size: 1.6 },
  { x: 0.0, y: 16.25, z: -12.0, size: 1.6 },
  { x: 14.0, y: 16.25, z: 0.0, size: 1.6 },
]);

export function planWarehouseKit() {
  return {
    crates: [
      { x: -26.4, z: -30.2 }, { x: 26.4, z: -30.2 },
      { x: -26.4, z: 8.4 }, { x: 26.4, z: 8.4 },
      { x: -26.4, z: 28.6 }, { x: 26.4, z: 28.6 },
      { x: -26.2, z: -8.8 }, { x: 26.2, z: -8.8 },
      { x: -22.5, y: 1.42, z: -16.8 }, { x: 22.5, y: 1.42, z: 16.8 },
      { x: -7.5, y: 1.42, z: 7.6 }, { x: 7.5, y: 1.42, z: -7.6 },
    ],
    barrels: [
      { x: -26.2, z: -40.4 }, { x: 26.2, z: -40.4 },
      { x: -26.2, z: 32.6 }, { x: 26.2, z: 32.6 },
    ],
    cardboard: [
      { x: -10.4, z: 40.2 }, { x: 10.4, z: 40.2 },
      { x: -26.0, z: 16.4 }, { x: 26.0, z: 16.4 },
      { x: -26.0, z: -18.6 }, { x: 26.0, z: -18.6 },
    ],
  };
}

const RACK_X = Object.freeze([-22.5, -7.5, 7.5, 22.5]);
const RACK_Z = Object.freeze([-24, 0, 24]);
const AISLES = Object.freeze([-14, 0, 14]);

export function warehouseWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function warehouseBudget(applied) {
  if (applied === 'low') {
    return {
      cans: 8, arrows: 12, spores: 36, orbs: 0, edges: 12,
      glow: false, runners: true,
      plates: 8, crates: 16, chevrons: 6, bays: 6,
    };
  }
  if (applied === 'high') {
    return {
      cans: 20, arrows: 24, spores: 72, orbs: 12, edges: 24,
      glow: true, runners: true,
      plates: 16, crates: 28, chevrons: 12, bays: 12,
    };
  }
  return {
    cans: 16, arrows: 18, spores: 54, orbs: 8, edges: 18,
    glow: true, runners: true,
    plates: 12, crates: 22, chevrons: 9, bays: 9,
  };
}

function skipMat(m) {
  if (!m) return m;
  m.userData.looksSkip = true;
  m.userData.artLocked = true;
  return m;
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
    if (g) { g.fillStyle = '#0b1218'; g.fillRect(0, 0, w, h); }
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

function naveFloorTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = '#1a2430';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#243446';
    for (let y = 0; y < h; y += 32) {
      for (let x = 0; x < w; x += 32) g.fillRect(x + 2, y + 2, 28, 28);
    }
    g.fillStyle = '#0e181f';
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
    g.fillStyle = '#39ffb0';
    g.globalAlpha = 0.38;
    g.fillRect(w * 0.47, 0, 5, h);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(122,92,255,0.16)';
    for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 1, h);
  }, 4, 8);
}

function ceilBayTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#0a1016'], [1, '#142028']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(57,255,176,0.12)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 32) g.strokeRect(4, y + 4, w - 8, 24);
    g.fillStyle = 'rgba(122,92,255,0.1)';
    g.fillRect(0, 0, w, 3);
  }, 10, 6);
}

function ionSignTex(THREE) {
  return canvasTex(THREE, 256, 96, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#39ffb0'], [0.5, '#d8fff4'], [1, '#7a5cff']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0b1218';
    g.fillRect(0, 0, w, 8);
    g.fillRect(0, h - 8, w, 8);
    g.fillRect(0, 0, 8, h);
    g.fillRect(w - 8, 0, 8, h);
    g.font = 'bold 48px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ION', w * 0.5, h * 0.54);
    g.fillStyle = '#39ffb0';
    g.fillRect(22, h * 0.5 - 16, 8, 32);
    g.fillRect(w - 30, h * 0.5 - 16, 8, 32);
  }, 1, 1);
}

function bayPlateTex(THREE) {
  return canvasTex(THREE, 128, 48, (g, w, h) => {
    g.fillStyle = '#102028';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#39ffb0';
    g.lineWidth = 4;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#39ffb0';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BAY', w * 0.5, h * 0.55);
  }, 1, 1);
}

function rackWallTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#102028'], [1, '#1b3a4a']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(57,255,176,0.08)';
    for (let y = 8; y < h; y += 18) g.fillRect(0, y, w, 2);
  }, 8, 4);
}

function steelMat(THREE, hex, extras) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.58, metalness: 0.22, envMapIntensity: 0.18,
  }, extras || {})));
}

function emitMat(THREE, hex, emit) {
  return skipMat(new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: emit == null ? 2.4 : emit,
    roughness: 0.32, metalness: 0.06, envMapIntensity: 0.1,
  }));
}

function glowMat(THREE, hex, opacity) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: opacity == null ? 0.55 : opacity,
    depthWrite: false, toneMapped: false,
  }));
}

function sporeGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.28, 0.04),
    new THREE.Vector2(0.34, 0.22),
    new THREE.Vector2(0.30, 0.52),
    new THREE.Vector2(0.16, 0.64),
    new THREE.Vector2(0.0, 0.68),
  ];
  return new THREE.LatheGeometry(pts, 10);
}

function palletGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.55, 0),
    new THREE.Vector2(0.55, 0.1),
    new THREE.Vector2(0.48, 0.14),
    new THREE.Vector2(0.0, 0.14),
  ];
  return new THREE.LatheGeometry(pts, 8);
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
  mesh.userData.warehouseArt = true;
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

function rackHit(x, z) {
  for (let i = 0; i < RACK_X.length; i++) {
    for (let j = 0; j < RACK_Z.length; j++) {
      if (Math.abs(x - RACK_X[i]) < 2.3 && Math.abs(z - RACK_Z[j]) < 9.4) return true;
    }
  }
  if (Math.abs(x) < 8.2 && z > 38.6) return true;
  if (Math.abs(Math.abs(x) - 22) < 2.6 && Math.abs(z - 36) < 2.6) return true;
  return false;
}

export function hideStockWarehouseMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.warehouseArt) return;
    if (o.parent && o.parent.name === 'warehouseArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    const t = o.geometry.type;
    if (col === WAREHOUSE_STOCK.metal || col === WAREHOUSE_STOCK.orange) {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (col === WAREHOUSE_STOCK.wood && t === 'BoxGeometry') {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (col === WAREHOUSE_STOCK.floor && t === 'BoxGeometry') {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

export function restyleWarehouseShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const wallTex = rackWallTex(THREE);
  const floorTex = naveFloorTex(THREE);
  const ceilTex = ceilBayTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.warehouseArt || (o.parent && o.parent.name === 'warehouseArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === WAREHOUSE_STOCK.wall) {
      m.color.setHex(0x142430);
      m.map = wallTex;
      m.emissive.setHex(hexNum(vibe.palette.neonB));
      m.emissiveIntensity = 0.04;
      m.roughness = 0.86;
      m.metalness = 0.08;
      skipMat(m); n++;
    } else if (col === WAREHOUSE_STOCK.ceil) {
      m.color.setHex(0x8aa0b0);
      m.map = ceilTex;
      m.emissive.setHex(0x102028);
      m.emissiveIntensity = 0.08;
      m.roughness = 0.9;
      m.metalness = 0.04;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === WAREHOUSE_STOCK.floor)) {
      if (m.map && m.map !== floorTex && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = floorTex;
      m.color.setHex(0x9aa4ae);
      m.roughness = 0.92;
      m.metalness = 0.04;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      skipMat(m); n++;
    }
  });
  return n;
}

function addRacks(THREE, parent, mats, budget) {
  const P = WAREHOUSE_PLAY;
  const postGeo = new THREE.CapsuleGeometry(P.post / 2, P.postH - P.post, 4, 8);
  const shelfGeo = new THREE.BoxGeometry(P.shelfW, P.shelfH, P.shelfD);
  const edgeGeo = new THREE.CapsuleGeometry(0.055, P.shelfD - 0.4, 3, 6);
  const footGeo = new THREE.CapsuleGeometry(0.32, 0.18, 4, 8);
  addInstanced(THREE, parent, postGeo, mats.rack, 48, (d, i) => {
    const bay = (i / 4) | 0;
    const corner = i % 4;
    const rx = P.rackXs[bay % 4], rz = P.rackZs[(bay / 4) | 0];
    const ox = corner % 2 ? P.postOffX : -P.postOffX;
    const oz = corner < 2 ? P.postOffZ : -P.postOffZ;
    d.position.set(rx + ox, P.postH * 0.5, rz + oz);
    return true;
  });
  addInstanced(THREE, parent, footGeo, mats.dock, 48, (d, i) => {
    const bay = (i / 4) | 0;
    const corner = i % 4;
    const rx = P.rackXs[bay % 4], rz = P.rackZs[(bay / 4) | 0];
    const ox = corner % 2 ? P.postOffX : -P.postOffX;
    const oz = corner < 2 ? P.postOffZ : -P.postOffZ;
    d.position.set(rx + ox, 0.16, rz + oz);
    d.scale.set(1.4, 1, 1.4);
    return true;
  });
  addInstanced(THREE, parent, shelfGeo, mats.shelf, 48, (d, i) => {
    const bay = (i / 4) | 0;
    const row = i % 4;
    const rx = P.rackXs[bay % 4], rz = P.rackZs[(bay / 4) | 0];
    d.position.set(rx, P.shelfYs[row], rz);
    return true;
  });
  addInstanced(THREE, parent, edgeGeo, mats.spore, budget.edges > 12 ? 48 : 24, (d, i) => {
    const bay = (i / 4) | 0;
    const row = i % 4;
    const rx = P.rackXs[bay % 4], rz = P.rackZs[(bay / 4) | 0];
    d.position.set(rx + (rx > 0 ? -1.62 : 1.62), P.shelfYs[row] + 0.08, rz);
    d.rotation.x = Math.PI / 2;
    return true;
  });
}

function addSpores(THREE, parent, mats, budget) {
  addInstanced(THREE, parent, sporeGeo(THREE), mats.can, budget.spores, (d, i) => {
    const bay = i % 12;
    const rx = RACK_X[bay % 4], rz = RACK_Z[(bay / 4) | 0];
    const row = ((i / 12) | 0) % 4;
    const slot = (i * 3) % 7;
    d.position.set(rx + ((i % 2) ? -0.55 : 0.55), 1.42 + row * 3.15, rz - 7.1 + slot * 2.05);
    d.rotation.y = i * 0.3;
    d.scale.setScalar(1.15);
    return true;
  });
}

function addAisles(THREE, parent, mats, budget, gates) {
  for (const x of AISLES) {
    const run = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 78), mats.runner);
    run.rotation.x = -Math.PI / 2;
    run.position.set(x, 0.028, 0);
    run.userData.warehouseArt = true;
    parent.add(run);
    const runB = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 78), mats.runnerAlt);
    runB.rotation.x = -Math.PI / 2;
    runB.position.set(x + 0.34, 0.03, 0);
    runB.userData.warehouseArt = true;
    parent.add(runB);
  }
  const arrowGeo = new THREE.ConeGeometry(0.28, 0.7, 6);
  addInstanced(THREE, parent, arrowGeo, mats.arrow, budget.arrows, (d, i) => {
    const aisle = AISLES[i % 3];
    const z = -32 + ((i / 3) | 0) * 8.5;
    if (rackHit(aisle, z)) return false;
    if (!propClearOfCourse(aisle, z, 0.2, gates, { gatePad: 1.6, corridor: 1.2, yRange: 2 })) return false;
    d.position.set(aisle, 0.14, z);
    d.rotation.x = Math.PI / 2;
    return true;
  });
}

function addCansAndDock(THREE, parent, mats, budget) {
  const canGeo = new THREE.CapsuleGeometry(0.32, 1.35, 4, 8);
  addInstanced(THREE, parent, canGeo, mats.overhead, budget.cans, (d, i) => {
    const x = AISLES[i % 3];
    const z = -36 + ((i / 3) | 0) * 9;
    d.position.set(x, 17.6, z);
    return true;
  });
  const dock = new THREE.Mesh(new THREE.CapsuleGeometry(1.35, 14.8, 5, 10), mats.dock);
  dock.rotation.z = Math.PI / 2;
  dock.scale.set(1, 0.62, 1.55);
  dock.position.set(0, 0.62, 40.5);
  dock.userData.warehouseArt = true;
  parent.add(dock);
  const lip = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 15.4, 4, 8), mats.spore);
  lip.rotation.z = Math.PI / 2;
  lip.position.set(0, 1.22, 39.05);
  lip.userData.warehouseTube = true;
  lip.userData.warehouseArt = true;
  parent.add(lip);
  for (const pal of WAREHOUSE_PLAY.pallets) {
    const base = new THREE.Mesh(palletGeo(THREE), mats.pallet);
    base.scale.set(1.35, 1.15, 1.35);
    base.position.set(pal.x, 0, pal.z);
    base.userData.warehouseArt = true;
    parent.add(base);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(pal.w * 0.92, pal.h - 0.18, pal.d * 0.92), mats.crate);
    crate.position.set(pal.x, 0.18 + (pal.h - 0.18) / 2, pal.z);
    crate.userData.warehouseArt = true;
    parent.add(crate);
  }
  addPlayLines(THREE, parent, mats);
  addForklift(THREE, parent, mats);
  addWallRibs(THREE, parent, mats);
}

function addPlayLines(THREE, parent, mats) {
  const P = WAREHOUSE_PLAY;
  const ion = P.ion;
  const hoop = new THREE.Group();
  hoop.name = 'warehouseArtIonHoop';
  hoop.userData.warehouseArt = true;
  const ow = ion.innerW + ion.bar * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ow, ion.bar, ion.depth), mats.spore);
  top.position.set(ion.x, ion.y + ion.innerH / 2 + ion.bar / 2, ion.z);
  top.userData.warehouseTube = true;
  const bot = top.clone();
  bot.position.y = ion.y - ion.innerH / 2 - ion.bar / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(ion.bar, ion.innerH, ion.depth), mats.spore);
  left.position.set(ion.x - ion.innerW / 2 - ion.bar / 2, ion.y, ion.z);
  left.userData.warehouseTube = true;
  const right = left.clone();
  right.position.x = ion.x + ion.innerW / 2 + ion.bar / 2;
  hoop.add(top, bot, left, right);
  hoop.traverse((o) => { o.userData.warehouseArt = true; });
  parent.add(hoop);

  const joistGeo = new THREE.BoxGeometry(54.4, P.rafterH, P.rafterD);
  addInstanced(THREE, parent, joistGeo, mats.rack, P.rafterZs.length, (d, i) => {
    d.position.set(0, P.rafterY + P.rafterH / 2, P.rafterZs[i]);
    return true;
  });
  const ridgeGeo = new THREE.BoxGeometry(0.42, 0.48, 80);
  addInstanced(THREE, parent, ridgeGeo, mats.rack, P.ridgeXs.length, (d, i) => {
    d.position.set(P.ridgeXs[i], P.rafterY + 0.16, 0);
    return true;
  });

  for (const spec of [P.gap.left, P.gap.right]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mats.crate);
    stack.position.set(spec.x, spec.h / 2, spec.z);
    stack.userData.warehouseArt = true;
    parent.add(stack);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.08, 0.1, spec.d + 0.08), mats.spore);
    lip.position.set(spec.x, spec.h + 0.05, spec.z);
    lip.userData.warehouseTube = true;
    lip.userData.warehouseArt = true;
    parent.add(lip);
  }
}

function addForklift(THREE, parent, mats) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.8, 5, 10), mats.crate);
  body.rotation.z = Math.PI / 2;
  body.scale.set(1, 0.72, 1.15);
  body.position.set(-8.6, 0.72, 37.4);
  body.userData.warehouseArt = true;
  parent.add(body);
  const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 5, 8), mats.violet);
  cabin.position.set(-7.7, 1.55, 37.4);
  cabin.userData.warehouseArt = true;
  parent.add(cabin);
  const mast = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 2.2, 4, 8), mats.rack);
  mast.position.set(-7.05, 1.4, 37.4);
  mast.userData.warehouseArt = true;
  parent.add(mast);
  for (const z of [37.05, 37.75]) {
    const tine = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 1.15, 3, 6), mats.shelf);
    tine.rotation.z = Math.PI / 2;
    tine.position.set(-6.35, 0.38, z);
    tine.userData.warehouseArt = true;
    parent.add(tine);
  }
}

function addWallRibs(THREE, parent, mats) {
  const ribGeo = new THREE.CapsuleGeometry(0.11, 18.4, 4, 6);
  addInstanced(THREE, parent, ribGeo, mats.rack, 16, (d, i) => {
    const side = i < 8 ? -1 : 1;
    const k = i % 8;
    d.position.set(side * 27.6, 9.4, -32 + k * 9);
    return true;
  });
}

function addCatwalkAndOrbs(THREE, parent, mats, budget) {
  for (const x of [-14, 14]) {
    const walk = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 52, 4, 8), mats.violet);
    walk.rotation.x = Math.PI / 2;
    walk.scale.set(1, 1, 0.42);
    walk.position.set(x, 11.4, 0);
    walk.userData.warehouseArt = true;
    parent.add(walk);
  }
  const cross = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 28, 4, 8), mats.violet);
  cross.rotation.z = Math.PI / 2;
  cross.scale.set(0.42, 1, 1);
  cross.position.set(0, 11.4, -8);
  cross.userData.warehouseArt = true;
  parent.add(cross);
  const extras = new THREE.Group();
  extras.name = 'warehouseArtExtras';
  extras.userData.warehouseArt = true;
  if (budget.orbs > 0) {
    const orbGeo = new THREE.SphereGeometry(0.28, 8, 6);
    addInstanced(THREE, extras, orbGeo, mats.orb, budget.orbs, (d, i) => {
      const x = AISLES[i % 3];
      d.position.set(x + ((i % 2) ? 1.8 : -1.8), 8.2 + (i % 4) * 0.9, -28 + i * 4.6);
      return true;
    });
    for (let i = 0; i < Math.min(4, budget.orbs); i++) {
      const o = new THREE.Mesh(orbGeo, mats.orb);
      o.position.set(AISLES[i % 3], 6.4, -10 + i * 8);
      o.userData.warehouseOrb = true;
      o.userData.phase = i * 0.8;
      o.userData.warehouseArt = true;
      extras.add(o);
    }
  }
  if (budget.glow) {
    for (const x of AISLES) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 14), glowMat(THREE, 0x39ffb0, 0.18));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.024, 8);
      pool.userData.warehouseArt = true;
      extras.add(pool);
    }
  }
  if (extras.children.length) parent.add(extras);
}

function addHeroIonSign(THREE, parent, mats) {
  const hero = new THREE.Group();
  hero.name = 'warehouseArtHero';
  hero.userData.warehouseArt = true;
  const cable = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 6.4, 3, 6), mats.rack);
  cable.position.set(-1.35, 8.35, 12);
  hero.add(cable);
  const cable2 = cable.clone();
  cable2.position.x = 1.35;
  hero.add(cable2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.4, 0.16), mats.dock);
  body.position.set(0, 4.55, 12);
  hero.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.18, 0.06), mats.sign);
  face.position.set(0, 4.55, 12.12);
  hero.add(face);
  const faceBack = face.clone();
  faceBack.position.z = 11.88;
  faceBack.rotation.y = Math.PI;
  hero.add(faceBack);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), mats.disc);
  disc.position.set(0, 3.62, 12);
  disc.userData.warehouseIon = true;
  hero.add(disc);
  const stencil = new THREE.Mesh(new THREE.CircleGeometry(1.35, 18), mats.stencil);
  stencil.rotation.x = -Math.PI / 2;
  stencil.position.set(0, 0.034, 12);
  hero.add(stencil);
  hero.traverse((o) => { o.userData.warehouseArt = true; });
  parent.add(hero);
}

function addSecretDressing(THREE, parent, mats) {
  // Spore Loft {22.5, 13.2, 24} — far rack top.
  const loft = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 4.4), mats.shelf);
  loft.position.set(22.5, 12.55, 24);
  loft.userData.warehouseArt = true;
  parent.add(loft);
  const loftGlow = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 2.8), glowMat(THREE, 0x39ffb0, 0.32));
  loftGlow.position.set(22.5, 12.66, 24);
  loftGlow.userData.warehouseArt = true;
  parent.add(loftGlow);
  for (let i = 0; i < 3; i++) {
    const can = new THREE.Mesh(sporeGeo(THREE), mats.can);
    can.position.set(22.5 + (i - 1) * 0.85, 12.68, 24 + (i % 2 ? 0.55 : -0.55));
    can.scale.setScalar(1.05);
    can.userData.warehouseArt = true;
    parent.add(can);
  }
  const loftBead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.disc);
  loftBead.position.set(22.5, 13.2, 24);
  loftBead.userData.warehouseIon = true;
  loftBead.userData.warehouseArt = true;
  parent.add(loftBead);
  const loftCrate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.55), mats.crate);
  loftCrate.position.set(21.7, 12.86, 22.6);
  loftCrate.userData.warehouseArt = true;
  parent.add(loftCrate);

  // Dock Crypt {-24.4, 1.15, 39.4} — pallet shadow.
  const cryptPal = new THREE.Mesh(palletGeo(THREE), mats.pallet);
  cryptPal.scale.set(1.7, 1.2, 1.7);
  cryptPal.position.set(-24.4, 0, 39.4);
  cryptPal.userData.warehouseArt = true;
  parent.add(cryptPal);
  const cryptCrate = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.42, 5, 8), mats.crate);
  cryptCrate.scale.set(1.15, 0.9, 1.15);
  cryptCrate.position.set(-24.4, 0.85, 39.4);
  cryptCrate.userData.warehouseArt = true;
  parent.add(cryptCrate);
  const cryptGlow = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), glowMat(THREE, 0x7a5cff, 0.28));
  cryptGlow.rotation.x = -Math.PI / 2;
  cryptGlow.position.set(-24.4, 0.03, 39.4);
  cryptGlow.userData.warehouseArt = true;
  parent.add(cryptGlow);
  const cryptBead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mats.violet);
  cryptBead.position.set(-24.4, 1.15, 39.4);
  cryptBead.userData.warehouseIon = true;
  cryptBead.userData.warehouseArt = true;
  parent.add(cryptBead);
}

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const crateGeo = new THREE.BoxGeometry(1.15, 0.72, 0.88);
  addInstanced(THREE, parent, crateGeo, mats.crate, budget.crates, (d, i) => {
    const inner = i % 2 ? 7.5 : -7.5;
    const row = ((i / 2) | 0) % 2;
    const slot = (i / 4) | 0;
    const x = inner + (inner > 0 ? -0.55 : 0.55);
    const z = 20 - slot * 4.2;
    if (!propClearOfCourse(x, z, 1.7 + row * 3.15, gates, { gatePad: 1.6, corridor: 1.2, yRange: 2 })) return false;
    d.position.set(x, 1.68 + row * 3.15, z);
    d.rotation.y = (i % 3) * 0.12;
    return true;
  });
  const plateGeo = new THREE.BoxGeometry(1.05, 0.42, 0.05);
  addInstanced(THREE, parent, plateGeo, mats.plate, budget.plates, (d, i) => {
    const inner = i % 2 ? 7.5 : -7.5;
    const bay = ((i / 2) | 0) % 3;
    const z = RACK_Z[bay] + 8.42;
    if (!propClearOfCourse(inner, z, 2.2, gates, { gatePad: 1.5, corridor: 1.1, yRange: 2 })) return false;
    d.position.set(inner, 2.2, z);
    return true;
  });
  const chevGeo = new THREE.BoxGeometry(0.85, 0.04, 0.28);
  addInstanced(THREE, parent, chevGeo, mats.arrow, budget.chevrons, (d, i) => {
    const aisle = AISLES[i % 3];
    const z = 22 - ((i / 3) | 0) * 5;
    if (rackHit(aisle, z)) return false;
    if (!propClearOfCourse(aisle, z, 0.16, gates, { gatePad: 1.6, corridor: 1.2, yRange: 2 })) return false;
    d.position.set(aisle + 0.78, 0.045, z);
    d.rotation.y = Math.PI / 4;
    return true;
  });
  const lipGeo = new THREE.BoxGeometry(0.12, 0.08, 15.6);
  addInstanced(THREE, parent, lipGeo, mats.spore, 8, (d, i) => {
    const inner = i % 2 ? 7.5 : -7.5;
    const row = ((i / 2) | 0) % 2;
    d.position.set(inner + (inner > 0 ? -1.62 : 1.62), 1.34 + row * 3.15, 8 - ((i / 4) | 0) * 24);
    return true;
  });
  const bayGeo = new THREE.BoxGeometry(0.18, 0.12, 7.2);
  addInstanced(THREE, parent, bayGeo, mats.overhead, budget.bays, (d, i) => {
    d.position.set(AISLES[i % 3], 17.15, -30 + ((i / 3) | 0) * 12);
    return true;
  });
}

function makeWarehouseMats(THREE, vibe) {
  return {
    rack: steelMat(THREE, 0x1a3342, {
      emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.12, roughness: 0.62,
    }),
    shelf: steelMat(THREE, 0x2a4a5c, {
      emissive: 0x39ffb0, emissiveIntensity: 0.16, roughness: 0.62,
    }),
    spore: emitMat(THREE, hexNum(vibe.palette.neonA), 2.8),
    can: emitMat(THREE, hexNum(vibe.palette.neonA), 1.35),
    violet: emitMat(THREE, hexNum(vibe.palette.neonB), 1.8),
    overhead: emitMat(THREE, 0xd8fff4, 3.1),
    runner: glowMat(THREE, 0x39ffb0, 0.88),
    runnerAlt: glowMat(THREE, 0x7a5cff, 0.7),
    arrow: glowMat(THREE, 0x39ffb0, 0.95),
    dock: steelMat(THREE, 0x163040, {
      emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.16,
    }),
    pallet: steelMat(THREE, hexNum(vibe.palette.neonC), { roughness: 0.72, metalness: 0.08 }),
    crate: steelMat(THREE, hexNum(vibe.palette.neonC), {
      emissive: hexNum(vibe.palette.neonC), emissiveIntensity: 0.45,
    }),
    orb: emitMat(THREE, hexNum(vibe.palette.neonA), 3.4),
    sign: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: ionSignTex(THREE), toneMapped: false,
    })),
    disc: skipMat(new THREE.MeshBasicMaterial({
      color: 0x39ffb0, toneMapped: false, transparent: true, opacity: 0.92,
    })),
    stencil: skipMat(new THREE.MeshBasicMaterial({
      color: 0x39ffb0, toneMapped: false, transparent: true, opacity: 0.42,
      depthWrite: false,
    })),
    plate: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: bayPlateTex(THREE), toneMapped: false,
    })),
  };
}

export function buildIonNave(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'warehouseArtVisuals';
  group.userData.warehouseArt = true;
  const budget = warehouseBudget(quality);
  const mats = makeWarehouseMats(THREE, vibe);
  group.userData.planned = planWarehouseKit();
  addRacks(THREE, group, mats, budget);
  addSpores(THREE, group, mats, budget);
  addAisles(THREE, group, mats, budget, gates || WAREHOUSE_KEEP_GATES);
  addCansAndDock(THREE, group, mats, budget);
  addCatwalkAndOrbs(THREE, group, mats, budget);
  addWhoopLife(THREE, group, mats, budget, gates || WAREHOUSE_KEEP_GATES);
  addHeroIonSign(THREE, group, mats);
  addSecretDressing(THREE, group, mats);
  parent.add(group);
  return group;
}

export function decorateWarehouseGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 5.5;
  if (ring.material) {
    ring.material.color.setHex(col);
    ring.material.emissive.setHex(col);
    ring.material.emissiveIntensity = emit * 0.35;
    ring.material.transparent = true;
    ring.material.opacity = 0.22;
    skipMat(ring.material);
  }
  const barMat = emitMat(THREE, col, emit);
  const extras = [];
  const s = size * 1.05;
  const t = size * 0.13;
  for (let i = 0; i < 6; i++) {
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(t * 0.45, s * 1.15, 4, 8), barMat);
    bar.rotation.z = i * Math.PI / 3;
    extras.push(bar);
  }
  const core = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.78, size * 0.045, 6, 18),
    emitMat(THREE, hexNum(vibe.palette.gateB), emit * 0.9),
  );
  extras.push(core);
  const halo = extras[0];
  ring.add(halo);
  ring.userData.artHalo = halo;
  ring.userData.artStyle = 'hex-frame';
  for (let i = 1; i < extras.length; i++) {
    extras[i].castShadow = extras[i].receiveShadow = false;
    ring.add(extras[i]);
  }
  ring.userData.artExtras = extras.slice(1);
  return halo;
}

export function pulseWarehouseGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 5.5;
  if (isNext) {
    col = 0xffffff;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 7.2) + pulse * 1.6;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.04);
  } else if (passed) {
    col = 0x7a5cff;
    emit = 2.6;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickWarehouseArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.warehouseTube || u.warehouseOrb || u.warehouseIon) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickWarehouseArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickWarehouseArtObject(o, t) {
  if (o.userData && o.userData.warehouseTube && o.material) {
    o.material.emissiveIntensity = 2.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4.2));
  }
  if (o.userData && o.userData.warehouseOrb) {
    const phase = o.userData.phase || 0;
    o.position.y = 6.4 + Math.sin(t * 0.9 + phase) * 0.18;
    if (o.material) o.material.emissiveIntensity = 2.8 + 0.8 * Math.sin(t * 2.4 + phase);
  }
  if (o.userData && o.userData.warehouseIon) {
    const s = 1 + 0.08 * Math.sin(t * 2.2);
    o.scale.setScalar(s);
    if (o.material && o.material.opacity != null) {
      o.material.opacity = 0.78 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2.2));
    }
  }
}

export function restyleWarehouse(THREE, ctx) {
  try {
    return restyleWarehouseInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleWarehouse', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleWarehouseInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockWarehouseMeshes(root);
  restyleWarehouseShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('warehouseArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildIonNave(THREE, root, vibe, quality, ctx.gates || WAREHOUSE_KEEP_GATES);
  }
  if (root) root.userData.warehouseArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
