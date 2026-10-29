// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Amber Court — playable whoop playground + Kenney CC0 sideline kit.
// Colliders live in sim-maps.js GYM_PLAY and must match kit/proc meshes.
// Kenney kit (sim-art-kit.js) swaps wall clutter after first paint.
// Procedural meshes stay if a mesh fails. Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse, disposeArtGroup, swapOwnedMap } from './sim-art-city.js?v=584705ba27b2';
import { GYM_PLAY } from './sim-maps.js?v=992aefab189b';

export const GYM_STOCK = Object.freeze({
  wall: 0xb8b4aa,
  ceil: 0x8a8e94,
  floor: 0x6a4224,
  wood: 0x6a4e32,
  metal: 0x5c6570,
  back: 0xe8e4dc,
  rim: 0xc45a22,
  line: 0xfff6d8,
});

export const GYM_KEEP_GATES = Object.freeze([
  { x: 0.0, y: 2.6, z: 28.0, size: 2.0 },
  { x: -10.0, y: 2.4, z: 16.0, size: 1.9 },
  { x: -10.0, y: 2.4, z: -16.0, size: 1.9 },
  { x: 0.0, y: 2.6, z: -28.0, size: 2.0 },
  { x: 10.0, y: 2.4, z: -16.0, size: 1.9 },
  { x: 10.0, y: 2.4, z: 16.0, size: 1.9 },
  { x: 0.0, y: 2.6, z: 20.0, size: 2.0 },
  { x: 0.0, y: 2.80, z: 8.0, size: 1.8 },
  { x: -17.4, y: 0.62, z: 15.4, size: 1.5 },
  { x: -19.4, y: 2.40, z: 0.0, size: 1.6 },
  { x: 0.0, y: 1.70, z: 32.4, size: 1.5 },
  { x: -21.45, y: 5.24, z: 15.4, size: 1.6 },
  { x: 0.0, y: 24.80, z: 18.0, size: 1.6 },
]);

export function planGymKit() {
  return {
    cardboard: [
      { x: 22.6, z: -34.4 }, { x: -22.6, z: 34.2 }, { x: 22.4, z: 34.6 },
      { x: -22.8, z: -34.8 }, { x: 22.8, z: 8.4 }, { x: -22.4, z: -8.2 },
    ],
    barrels: [
      { x: 22.5, z: 18.2 }, { x: -22.5, z: -18.4 }, { x: 22.3, z: -22.6 },
      { x: -22.7, z: 22.8 }, { x: 22.6, z: -6.4 }, { x: -22.2, z: 6.2 },
    ],
    barriers: [
      { x: 22.4, z: 28.4, ry: 1.57 }, { x: -22.4, z: -28.6, ry: -1.57 },
      { x: 22.2, z: -32.2, ry: 3.14 },
    ],
  };
}

export function gymWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function gymBudget(applied) {
  if (applied === 'low') {
    return {
      windows: 4, dust: 0, glow: false, rows: 3, seats: 24,
      truss: 6, pads: 8, banners: 4, balls: 8, bottles: 10, cones: 6,
      towels: 10, bags: 8, racks: 4, lockers: 6, cans: 8, murals: 2,
      shafts: 0, hashes: 16,
    };
  }
  if (applied === 'high') {
    return {
      windows: 10, dust: 96, glow: true, rows: 4, seats: 40,
      truss: 12, pads: 14, banners: 8, balls: 16, bottles: 18, cones: 10,
      towels: 18, bags: 14, racks: 6, lockers: 10, cans: 16, murals: 4,
      shafts: 4, hashes: 28,
    };
  }
  return {
    windows: 8, dust: 0, glow: true, rows: 4, seats: 32,
    truss: 10, pads: 12, banners: 6, balls: 12, bottles: 14, cones: 8,
    towels: 14, bags: 10, racks: 5, lockers: 8, cans: 12, murals: 3,
    shafts: 2, hashes: 22,
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
    if (g) { g.fillStyle = '#c9a57a'; g.fillRect(0, 0, w, h); }
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

function courtFloorTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#d8b07a'], [0.45, '#c9a57a'], [1, '#a87848']]);
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 14) {
      g.fillStyle = y % 28 === 0 ? '#b88858' : '#c09460';
      g.fillRect(0, y, w, 12);
      g.fillStyle = 'rgba(90,50,24,0.28)';
      g.fillRect(0, y + 12, w, 2);
      g.fillStyle = 'rgba(255,246,216,0.08)';
      g.fillRect(4 + (y % 18), y + 3, w - 10, 1);
    }
    g.fillStyle = '#fff6d8';
    g.globalAlpha = 0.22;
    g.fillRect(0, h * 0.48, w, 4);
    g.globalAlpha = 1;
  }, 8, 12);
}

function plasterTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#c8b49a'], [0.55, '#d8c8b0'], [1, '#efe4d2']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,48,20,0.16)';
    g.fillRect(0, 0, w, 18);
    g.fillStyle = 'rgba(240,177,75,0.12)';
    for (let y = 16; y < h; y += 20) g.fillRect(0, y, w, 3);
    g.fillStyle = 'rgba(106,66,36,0.10)';
    for (let x = 8; x < w; x += 26) g.fillRect(x, 0, 1, h);
    g.fillStyle = 'rgba(255,246,216,0.08)';
    for (let i = 0; i < 40; i++) g.fillRect((i * 17) % w, (i * 11) % h, 3, 2);
  }, 10, 6);
}

function woodPanelTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#6a4224'], [0.5, '#8a5a30'], [1, '#5a3218']]);
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = x % 64 === 0 ? '#7a4a28' : '#9a6a38';
      g.fillRect(x, 0, 28, h);
      g.fillStyle = 'rgba(40,20,8,0.35)';
      g.fillRect(x + 28, 0, 4, h);
    }
    g.fillStyle = 'rgba(255,210,120,0.08)';
    for (let y = 6; y < h; y += 11) g.fillRect(0, y, w, 1);
  }, 6, 2);
}

function ceilingTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#3a2a1c'], [0.6, '#5a4030'], [1, '#2a1a10']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(240,177,75,0.22)';
    g.lineWidth = 3;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = 'rgba(255,210,122,0.10)';
    g.fillRect(18, 18, w - 36, h - 36);
  }, 8, 6);
}

function bannerTex(THREE, a, b) {
  return canvasTex(THREE, 64, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, a], [1, b]]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6d8';
    g.globalAlpha = 0.5;
    g.fillRect(8, 14, w - 16, 12);
    g.fillRect(8, h * 0.42, w - 16, 8);
    g.fillRect(8, h - 28, w - 16, 10);
    g.globalAlpha = 1;
  }, 1, 1);
}

function jerseyTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#c45a22'], [1, '#8a3010']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6d8';
    g.fillRect(22, 8, 20, 8);
    g.fillRect(18, 28, 28, 22);
    g.fillStyle = '#f0b14b';
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h - 4, w, 4);
  }, 1, 1);
}

function scoreboardTex(THREE) {
  return canvasTex(THREE, 256, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#2a1a0c'], [0.5, '#4a2a14'], [1, '#1a1008']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f0b14b';
    g.fillRect(8, 8, w - 16, 6);
    g.fillRect(8, h - 14, w - 16, 6);
    g.fillStyle = '#fff6d8';
    g.font = 'bold 36px sans-serif';
    g.textAlign = 'center';
    g.fillText('AMBER', w * 0.5, 52);
    g.fillStyle = '#c45a22';
    g.fillRect(28, 68, 70, 36);
    g.fillRect(w - 98, 68, 70, 36);
    g.fillStyle = '#fff6d8';
    g.font = 'bold 28px sans-serif';
    g.fillText('12', 63, 96);
    g.fillText('09', w - 63, 96);
    g.fillStyle = '#f0b14b';
    g.fillRect(w * 0.5 - 10, 74, 20, 24);
  }, 1, 1);
}

function matTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#8a3010'], [0.5, '#c45a22'], [1, '#6a220c']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,246,216,0.18)';
    for (let y = 6; y < h; y += 10) g.fillRect(0, y, w, 2);
  }, 4, 1);
}

function honeyMat(THREE, hex, extras) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.74, metalness: 0.04, envMapIntensity: 0.12,
  }, extras || {})));
}

function emitMat(THREE, hex, emit) {
  return skipMat(new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: emit == null ? 1.6 : emit,
    roughness: 0.42, metalness: 0.1, envMapIntensity: 0.1,
  }));
}

function glowMat(THREE, hex, opacity) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: opacity == null ? 0.28 : opacity,
    depthWrite: false, toneMapped: false,
  }));
}

function urnGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.16, 0),
    new THREE.Vector2(0.18, 0.08),
    new THREE.Vector2(0.08, 0.22),
    new THREE.Vector2(0.14, 0.34),
    new THREE.Vector2(0.0, 0.4),
  ];
  return new THREE.LatheGeometry(pts, 8);
}

function woodFrameGeo(THREE, size) {
  const s = new THREE.Shape();
  const o = size * 1.18;
  const i = size * 0.88;
  s.moveTo(-o, -o); s.lineTo(o, -o); s.lineTo(o, o); s.lineTo(-o, o); s.lineTo(-o, -o);
  const hole = new THREE.Path();
  hole.moveTo(-i, -i); hole.lineTo(-i, i); hole.lineTo(i, i); hole.lineTo(i, -i); hole.lineTo(-i, -i);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: size * 0.08, bevelEnabled: false, curveSegments: 1 });
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
  mesh.userData.gymArt = true;
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

// The gym's own art, at any depth: tagged itself or under a tagged group
// (gymArtVisuals is). The kit lands asynchronously in gymArtKit (sim-art-kit.js),
// untagged, a level below gymArtVisuals, so a parent-only check let a restyle
// after it landed take kit meshes for stock ones.
function inGymArt(o) {
  for (let p = o; p; p = p.parent) {
    if (p.userData && (p.userData.gymArt || p.userData.artKeep || p.userData.artInstanced)) return true;
  }
  return false;
}

export function hideStockGymMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (inGymArt(o)) return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    const t = o.geometry.type;
    if (col === GYM_STOCK.wood && t === 'BoxGeometry') {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (col === GYM_STOCK.metal || col === GYM_STOCK.back || col === GYM_STOCK.rim) {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

export function restyleGymShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const wallTex = plasterTex(THREE);
  const floorTex = courtFloorTex(THREE);
  const ceilTex = ceilingTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (inGymArt(o)) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === GYM_STOCK.wall) {
      m.color.setHex(0xe4c8a4);
      swapOwnedMap(m, wallTex);
      m.emissive.setHex(0xf0b14b);
      m.emissiveIntensity = 0.03;
      m.roughness = 0.9;
      m.envMapIntensity = 0.14;
      skipMat(m); n++;
    } else if (col === GYM_STOCK.ceil) {
      m.color.setHex(0xc4a078);
      swapOwnedMap(m, ceilTex);
      m.emissive.setHex(0xf0b14b);
      m.emissiveIntensity = 0.1;
      m.envMapIntensity = 0.1;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === GYM_STOCK.floor)) {
      swapOwnedMap(m, floorTex);
      m.color.setHex(0xf2d8b0);
      m.roughness = 0.72;
      m.metalness = 0.02;
      m.emissive.setHex(0xf0b14b);
      m.emissiveIntensity = 0.02;
      m.envMapIntensity = 0.16;
      skipMat(m); n++;
    } else if (col === GYM_STOCK.line) {
      m.color.setHex(0xfff6d8);
      m.emissive.setHex(0xfff0c8);
      m.emissiveIntensity = 0.9;
      skipMat(m); n++;
    }
  });
  return n;
}

function makeGymMats(THREE, vibe) {
  const woodMap = woodPanelTex(THREE);
  return {
    honey: honeyMat(THREE, 0x6e4524, {
      map: woodMap, emissive: 0xf0b14b, emissiveIntensity: 0.08, roughness: 0.74,
    }),
    seat: honeyMat(THREE, 0x8a5028, { roughness: 0.64 }),
    brass: emitMat(THREE, hexNum(vibe.palette.neonA), 1.5),
    rim: emitMat(THREE, hexNum(vibe.palette.neonC), 2.4),
    glass: honeyMat(THREE, 0xfff6d8, { roughness: 0.35, metalness: 0.08 }),
    window: glowMat(THREE, 0xffd27a, 0.92),
    frame: honeyMat(THREE, 0x6a4224),
    pad: honeyMat(THREE, 0xc45a22, {
      emissive: 0xc45a22, emissiveIntensity: 0.12, roughness: 0.8,
    }),
    ball: honeyMat(THREE, 0xc45a22, { roughness: 0.55 }),
    bottle: emitMat(THREE, 0xfff6d8, 0.8),
    cone: honeyMat(THREE, 0xf0b14b, {
      emissive: 0xf0b14b, emissiveIntensity: 0.22,
    }),
    paint: skipMat(new THREE.MeshBasicMaterial({
      color: 0xfff6d8, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false,
    })),
    key: skipMat(new THREE.MeshBasicMaterial({
      color: 0xc45a22, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false,
    })),
    towel: honeyMat(THREE, 0xfff6d8, { roughness: 0.9 }),
    bag: honeyMat(THREE, 0x6a4224, { roughness: 0.8 }),
    locker: honeyMat(THREE, 0x8a5a30, {
      map: woodMap, emissive: 0xf0b14b, emissiveIntensity: 0.08,
    }),
    can: emitMat(THREE, 0xffd27a, 1.8),
    bannerA: skipMat(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: bannerTex(THREE, '#c45a22', '#8a5a30'),
      roughness: 0.7, metalness: 0, envMapIntensity: 0.1,
    })),
    bannerB: skipMat(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: bannerTex(THREE, '#f0b14b', '#6a4224'),
      roughness: 0.7, metalness: 0, envMapIntensity: 0.1,
    })),
    jersey: skipMat(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: jerseyTex(THREE), roughness: 0.72, metalness: 0,
    })),
    score: skipMat(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: scoreboardTex(THREE), roughness: 0.45, metalness: 0.08,
      emissive: 0xf0b14b, emissiveIntensity: 0.35,
    })),
    matRoll: skipMat(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: matTex(THREE), roughness: 0.82, metalness: 0,
    })),
    dust: skipMat(new THREE.PointsMaterial({
      color: 0xfff6d8, size: 0.08, transparent: true, opacity: 0.45,
      depthWrite: false, sizeAttenuation: true,
    })),
    shaft: glowMat(THREE, 0xffd27a, 0.07),
    urn: emitMat(THREE, 0xf0b14b, 1.1),
  };
}

function addBleachers(THREE, parent, mats, budget) {
  const P = GYM_PLAY;
  const rows = Math.min(budget.rows, P.rows);
  const plankN = 2 * rows * P.segZs.length;
  addInstanced(THREE, parent, new THREE.BoxGeometry(P.plankW, P.seatH, P.segD), mats.honey, plankN, (d, i) => {
    const side = i < rows * P.segZs.length ? -1 : 1;
    const local = i % (rows * P.segZs.length);
    const row = local % rows;
    const seg = (local / rows) | 0;
    d.position.set(side * (P.x0 + row * P.rowStep), P.seatYs[row] + P.seatH / 2, P.segZs[seg]);
    return true;
  });
  addInstanced(THREE, parent, new THREE.BoxGeometry(P.stringer, 1, P.stringer), mats.honey, plankN * 4, (d, i) => {
    const plank = (i / 4) | 0;
    const corner = i % 4;
    const side = plank < rows * P.segZs.length ? -1 : 1;
    const local = plank % (rows * P.segZs.length);
    const row = local % rows;
    const seg = (local / rows) | 0;
    const x = side * (P.x0 + row * P.rowStep);
    const y = P.seatYs[row];
    const z = P.segZs[seg];
    const dx = P.plankW / 2 - P.stringer / 2;
    const dz = P.segD / 2 - P.stringer / 2;
    const ox = corner % 2 ? dx : -dx;
    const oz = corner < 2 ? -dz : dz;
    d.position.set(x + ox, y / 2, z + oz);
    d.scale.set(1, y, 1);
    return true;
  });
  addInstanced(THREE, parent, new THREE.BoxGeometry(1.05, 0.12, 1.35), mats.seat, budget.seats, (d, i) => {
    const side = i % 2 ? 1 : -1;
    const row = (i >> 1) % rows;
    const along = ((i >> 1) / rows) | 0;
    const x = side * (P.x0 + row * P.rowStep);
    const y = P.seatYs[row] + P.seatH + 0.06;
    const z = -24 + (along % 18) * 2.7;
    if (Math.abs(z) < 4.4) return false;
    d.position.set(x, y, z);
    return true;
  });
  addInstanced(THREE, parent, new THREE.CapsuleGeometry(0.05, 10.4, 3, 6), mats.brass, rows * 4, (d, i) => {
    const side = i < rows * 2 ? -1 : 1;
    const local = i % (rows * 2);
    const row = local % rows;
    const seg = (local / rows) | 0;
    d.position.set(side * (P.x0 + 0.55 + row * P.rowStep), P.seatYs[row] + 0.28, P.segZs[seg]);
    d.rotation.x = Math.PI / 2;
    return true;
  });
}

function addHoops(THREE, parent, mats, budget) {
  for (const face of [1, -1]) {
    const z = face * 24;
    const postZ = z + face * 1.15;
    const post = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 10.4, 5, 8), mats.brass);
    post.position.set(0, 5.3, postZ);
    post.userData.gymArt = true;
    parent.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.15), mats.brass);
    arm.position.set(0, 10.15, postZ + face * 0.55);
    arm.userData.gymArt = true;
    parent.add(arm);
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 0.14), mats.glass);
    board.position.set(0, 10.2, postZ + face * 0.18);
    board.userData.gymArt = true;
    parent.add(board);
    const square = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.72, 0.04), mats.rim);
    square.position.set(0, 10.05, postZ + face * 0.08);
    square.userData.gymArt = true;
    parent.add(square);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.07, 8, 22), mats.rim);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 10.5, z);
    rim.userData.gymRim = true;
    rim.userData.gymArt = true;
    parent.add(rim);
    if (budget.glow) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.04, 6, 20), glowMat(THREE, 0xf0b14b, 0.45));
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, 10.5, z);
      halo.userData.gymArt = true;
      parent.add(halo);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const net = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.55, 3, 5), mats.bottle);
      net.position.set(Math.cos(a) * 0.62, 10.12, z + Math.sin(a) * 0.12);
      net.userData.gymArt = true;
      parent.add(net);
    }
  }
}

function addTrusses(THREE, parent, mats, budget) {
  const P = GYM_PLAY;
  const beam = new THREE.BoxGeometry(46.4, P.rafterH, P.rafterD);
  addInstanced(THREE, parent, beam, mats.brass, P.rafterZs.length, (d, i) => {
    d.position.set(0, P.rafterY + P.rafterH / 2, P.rafterZs[i]);
    return true;
  });
  const rib = new THREE.BoxGeometry(0.22, 0.22, 68);
  addInstanced(THREE, parent, rib, mats.honey, 4, (d, i) => {
    d.position.set(-16.5 + i * 11, 25.6, 0);
    return true;
  });
  const coffer = new THREE.BoxGeometry(10.4, 0.16, 8.4);
  addInstanced(THREE, parent, coffer, mats.locker, 8, (d, i) => {
    const col = i % 4;
    const row = (i / 4) | 0;
    d.position.set(-16.5 + col * 11, 26.2, -16 + row * 32);
    return true;
  });
}

function addCeilingCans(THREE, parent, mats, budget) {
  const can = new THREE.CylinderGeometry(0.22, 0.28, 0.18, 8);
  addInstanced(THREE, parent, can, mats.can, budget.cans, (d, i) => {
    const col = i % 4;
    const row = (i / 4) | 0;
    d.position.set(-16.5 + col * 11, 25.35, -28 + row * 9.2);
    d.userData = d.userData || {};
    return true;
  });
  if (budget.cans) {
    const pulse = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), mats.can);
    pulse.position.set(0, 25.35, 0);
    pulse.userData.gymCan = true;
    pulse.userData.gymArt = true;
    parent.add(pulse);
  }
  if (budget.shafts > 0) {
    const shaft = new THREE.PlaneGeometry(3.2, 18);
    addInstanced(THREE, parent, shaft, mats.shaft, budget.shafts, (d, i) => {
      const side = i % 2 ? 1 : -1;
      d.position.set(side * 18.4, 16.2, -12 + ((i / 2) | 0) * 16);
      d.rotation.z = side * 0.42;
      return true;
    });
  }
}

function addWindowsPadsBanners(THREE, parent, mats, budget) {
  const extras = new THREE.Group();
  extras.name = 'gymArtExtras';
  extras.userData.gymArt = true;
  const win = new THREE.BoxGeometry(0.1, 3.2, 6.4);
  const frame = new THREE.BoxGeometry(0.16, 3.5, 6.8);
  addInstanced(THREE, extras, frame, mats.frame, budget.windows, (d, i) => {
    const side = i % 2 ? 1 : -1;
    const k = (i / 2) | 0;
    d.position.set(side * 23.72, 18.4, -22 + k * 9);
    return true;
  });
  addInstanced(THREE, extras, win, mats.window, budget.windows, (d, i) => {
    const side = i % 2 ? 1 : -1;
    const k = (i / 2) | 0;
    d.position.set(side * 23.78, 18.4, -22 + k * 9);
    return true;
  });
  const pad = new THREE.BoxGeometry(0.22, 2.2, 4.6);
  addInstanced(THREE, extras, pad, mats.pad, budget.pads, (d, i) => {
    const end = i % 2 ? 1 : -1;
    const k = (i / 2) | 0;
    const x = -16 + (k % 7) * 5.4;
    if (Math.abs(x) < 5.2) return false;
    d.position.set(x, 1.2, end * 36.55);
    return true;
  });
  const ban = new THREE.BoxGeometry(0.08, 3.6, 1.6);
  addInstanced(THREE, extras, ban, mats.bannerA, budget.banners, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 23.4, 12.4, -18 + ((i / 2) | 0) * 10);
    return true;
  });
  const hang = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.8, 1.4), mats.bannerB);
  hang.position.set(-23.35, 10.8, 6);
  hang.userData.gymBanner = true;
  hang.userData.gymArt = true;
  extras.add(hang);
  const hang2 = hang.clone();
  hang2.position.set(23.35, 10.8, -8);
  hang2.userData.gymBanner = true;
  extras.add(hang2);
  if (budget.glow) {
    for (const z of [-16, 0, 16]) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.8, 16), glowMat(THREE, 0xf0b14b, 0.08));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.026, z);
      pool.userData.gymArt = true;
      extras.add(pool);
    }
  }
  if (budget.dust > 0) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(budget.dust * 3);
    for (let i = 0; i < budget.dust; i++) {
      pos[i * 3] = ((i * 17) % 80 - 40) * 0.45;
      pos[i * 3 + 1] = 2 + (i % 14) * 0.7;
      pos[i * 3 + 2] = ((i * 13) % 90 - 45) * 0.7;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, mats.dust);
    pts.userData.gymDust = true;
    pts.userData.gymArt = true;
    extras.add(pts);
  }
  parent.add(extras);
}

function addCourtPaint(THREE, parent, mats, budget) {
  const extras = new THREE.Group();
  extras.name = 'gymArtPaint';
  extras.userData.gymArt = true;
  for (const z of [20, -20]) {
    const key = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 6.2), mats.key);
    key.rotation.x = -Math.PI / 2;
    key.position.set(0, 0.022, z + Math.sign(z) * 3.1);
    key.userData.gymArt = true;
    extras.add(key);
  }
  const center = new THREE.Mesh(new THREE.CircleGeometry(3.6, 20), mats.paint);
  center.rotation.x = -Math.PI / 2;
  center.position.set(0, 0.021, 0);
  center.userData.gymArt = true;
  extras.add(center);
  const hash = new THREE.BoxGeometry(0.55, 0.03, 0.08);
  addInstanced(THREE, extras, hash, mats.paint, budget.hashes, (d, i) => {
    const side = i % 2 ? 1 : -1;
    const k = (i / 2) | 0;
    d.position.set(side * (6.4 + (k % 3) * 0.7), 0.04, -18 + ((k / 3) | 0) * 4.6);
    return true;
  });
  for (const face of [1, -1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.16, 6, 28, Math.PI), mats.paint);
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = face > 0 ? Math.PI : 0;
    arc.position.set(0, 0.045, face * 16.2);
    arc.userData.gymArt = true;
    extras.add(arc);
  }
  const sideline = new THREE.BoxGeometry(0.14, 0.04, 48);
  addInstanced(THREE, extras, sideline, mats.paint, 2, (d, i) => {
    d.position.set(i ? 12.4 : -12.4, 0.04, 0);
    return true;
  });
  parent.add(extras);
}

function addWainscotMurals(THREE, parent, mats, budget) {
  const board = new THREE.BoxGeometry(0.12, 2.4, 8.4);
  addInstanced(THREE, parent, board, mats.honey, 12, (d, i) => {
    const side = i < 6 ? -1 : 1;
    const k = i % 6;
    d.position.set(side * 23.68, 1.22, -28 + k * 11.2);
    return true;
  });
  const stripe = new THREE.BoxGeometry(0.08, 0.22, 72);
  const band = new THREE.Mesh(stripe, mats.rim);
  band.position.set(-23.7, 3.55, 0);
  band.userData.gymArt = true;
  parent.add(band);
  const band2 = band.clone();
  band2.position.x = 23.7;
  parent.add(band2);
  const mural = new THREE.PlaneGeometry(5.4, 3.2);
  addInstanced(THREE, parent, mural, mats.jersey, budget.murals, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 23.62, 7.4, -10 + ((i / 2) | 0) * 14);
    d.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    return true;
  });
}

function addHeroScoreboard(THREE, parent, mats) {
  const hero = new THREE.Group();
  hero.name = 'gymArtHero';
  hero.userData.gymArt = true;
  const hang = new THREE.Mesh(new THREE.BoxGeometry(0.18, 10.8, 0.18), mats.brass);
  hang.position.set(0, 19.6, 0);
  hero.add(hang);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.8, 5.6), mats.locker);
  cube.position.set(0, 13.2, 0);
  hero.add(cube);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const face = new THREE.Mesh(new THREE.BoxGeometry(5.15, 2.4, 0.1), mats.score);
    face.position.set(Math.sin(yaw) * 2.84, 13.2, Math.cos(yaw) * 2.84);
    face.rotation.y = yaw;
    face.userData.gymCan = true;
    hero.add(face);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.1, 8, 24), mats.urn);
  ring.position.set(0, 11.55, 0);
  ring.rotation.x = Math.PI / 2;
  hero.add(ring);
  for (const z of [35.4, -35.4]) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.6, 0.55), mats.locker);
    body.position.set(0, 14.8, z);
    hero.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.9, 0.1), mats.score);
    face.position.set(0, 14.8, z + (z > 0 ? -0.32 : 0.32));
    face.userData.gymCan = true;
    hero.add(face);
    const urn = new THREE.Mesh(urnGeo(THREE), mats.urn);
    urn.position.set(-3.6, 12.75, z + (z > 0 ? -0.2 : 0.2));
    urn.scale.set(2.4, 2.4, 2.4);
    hero.add(urn);
    const urn2 = urn.clone();
    urn2.position.x = 3.6;
    hero.add(urn2);
  }
  hero.traverse((o) => { o.userData.gymArt = true; });
  parent.add(hero);
}

function addSecretDressing(THREE, parent, mats, budget) {
  const locker = new THREE.BoxGeometry(0.85, 2.15, 0.55);
  addInstanced(THREE, parent, locker, mats.locker, budget.lockers, (d, i) => {
    d.position.set(-21.2 + (i % 5) * 0.92, 1.08, -24.6 - ((i / 5) | 0) * 0.7);
    return true;
  });
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 2.2), glowMat(THREE, 0xf0b14b, 0.35));
  glow.position.set(-21.45, 4.55, -24.5);
  glow.userData.gymArt = true;
  parent.add(glow);
  const well = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 16), mats.urn);
  well.rotation.x = Math.PI / 2;
  well.position.set(0, 10.5, 26.35);
  well.userData.gymRim = true;
  well.userData.gymArt = true;
  parent.add(well);
}

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const extras = new THREE.Group();
  extras.name = 'gymArtWhoop';
  extras.userData.gymArt = true;
  const ballSpots = [
    [-13.2, 32.2], [13.4, 31.6], [-13.0, -32.4], [13.2, -31.8],
    [-13.6, 8.8], [13.8, -9.2], [-13.4, -18.4], [13.6, 18.8],
    [-14.0, 26.4], [13.8, -26.2], [-13.1, 2.2], [13.3, 4.4],
    [-13.8, -6.8], [13.0, 12.6], [-12.8, 22.2], [12.6, -14.4],
  ];
  addInstanced(THREE, extras, new THREE.SphereGeometry(0.22, 10, 8), mats.ball, budget.balls, (d, i) => {
    const s = ballSpots[i % ballSpots.length];
    if (!propClearOfCourse(s[0], s[1], 0.28, gates, { gatePad: 1.6, corridor: 1.4, yRange: 2 })) return false;
    d.position.set(s[0], 0.22, s[1]);
    return true;
  });
  const bottleSpots = [
    [-18.2, 14.4], [18.4, -14.2], [-19.4, -8.6], [19.2, 10.8],
    [-18.0, 28.6], [18.1, -28.2], [-20.2, 6.4], [20.0, -4.8],
    [-18.6, -20.4], [18.8, 22.2], [-19.0, 2.8], [19.1, -16.6],
    [-20.6, 18.2], [20.4, -22.4], [-18.3, -12.2], [18.5, 8.2],
    [-19.6, 24.8], [19.4, -30.2],
  ];
  addInstanced(THREE, extras, new THREE.CapsuleGeometry(0.05, 0.22, 3, 6), mats.bottle, budget.bottles, (d, i) => {
    const s = bottleSpots[i % bottleSpots.length];
    d.position.set(s[0], 1.55 + (i % 3) * 1.02, s[1]);
    return true;
  });
  const coneSpots = [
    [-14.8, 34.6], [14.8, 34.4], [-14.6, -34.6], [14.6, -34.4],
    [-16.4, 20.8], [16.4, -20.6], [-16.2, -2.4], [16.2, 3.6],
    [-15.2, 12.2], [15.1, -8.8],
  ];
  addInstanced(THREE, extras, new THREE.ConeGeometry(0.18, 0.42, 8), mats.cone, budget.cones, (d, i) => {
    const s = coneSpots[i % coneSpots.length];
    if (!propClearOfCourse(s[0], s[1], 0.24, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0.21, s[1]);
    return true;
  });
  const towelSpots = [
    [-13.4, 10.4], [13.6, -11.2], [-13.8, 18.8], [14.0, 6.2],
    [-13.2, -14.6], [13.0, 24.2], [-13.6, 30.2], [13.8, -26.4],
    [-12.9, 1.4], [13.2, -3.2], [-14.0, -22.8], [13.9, 14.6],
    [-12.8, 8.0], [13.1, 20.0], [-13.7, -6.4], [13.4, -18.2],
    [-13.0, 26.8], [12.8, -30.6],
  ];
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.42, 0.12, 0.28), mats.towel, budget.towels, (d, i) => {
    const s = towelSpots[i % towelSpots.length];
    d.position.set(s[0], 0.08 + (i % 2) * 0.12, s[1]);
    d.rotation.y = (i % 5) * 0.4;
    return true;
  });
  const bagSpots = [
    [-13.2, 16.2], [13.4, -16.8], [-12.9, -10.4], [13.1, 11.6],
    [-13.8, 4.8], [14.0, -5.2], [-13.0, 28.8], [13.2, -28.4],
    [-13.6, 22.4], [13.7, 2.2], [-13.4, -20.2], [13.3, 18.6],
    [-13.5, 12.8], [13.6, -24.6],
  ];
  addInstanced(THREE, extras, new THREE.CapsuleGeometry(0.16, 0.42, 3, 6), mats.bag, budget.bags, (d, i) => {
    const s = bagSpots[i % bagSpots.length];
    if (!propClearOfCourse(s[0], s[1], 0.3, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0.22, s[1]);
    d.rotation.z = Math.PI / 2;
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.7, 1.15, 0.55), mats.honey, budget.racks, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 13.6, 0.58, 31.2 - ((i / 2) | 0) * 9.6);
    return true;
  });
  const bench = new THREE.BoxGeometry(0.55, 0.42, 3.4);
  addInstanced(THREE, extras, bench, mats.seat, 6, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 13.05, 0.22, -18 + ((i / 2) | 0) * 14);
    return true;
  });
  addInstanced(THREE, extras, new THREE.CylinderGeometry(0.32, 0.36, 0.95, 8), mats.bottle, 4, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 13.2, 0.48, 8.6 - ((i / 2) | 0) * 22);
    return true;
  });
  addInstanced(THREE, extras, new THREE.CylinderGeometry(0.42, 0.42, 2.4, 10), mats.matRoll, 4, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 14.2, 0.42, -28 + ((i / 2) | 0) * 18);
    d.rotation.z = Math.PI / 2;
    return true;
  });
  const pennant = new THREE.BoxGeometry(0.06, 0.55, 0.42);
  addInstanced(THREE, extras, pennant, mats.bannerA, 16, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 14.8, 6.4, -24 + ((i / 2) | 0) * 6.4);
    d.rotation.z = side * 0.18;
    return true;
  });
  parent.add(extras);
}

function addPlayLines(THREE, parent, mats) {
  const P = GYM_PLAY;
  const amb = P.amber;
  const hoop = new THREE.Group();
  hoop.name = 'gymArtAmberHoop';
  hoop.userData.gymArt = true;
  const ow = amb.innerW + amb.bar * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ow, amb.bar, amb.depth), mats.brass);
  top.position.set(amb.x, amb.y + amb.innerH / 2 + amb.bar / 2, amb.z);
  top.userData.gymRim = true;
  const bot = top.clone();
  bot.position.y = amb.y - amb.innerH / 2 - amb.bar / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(amb.bar, amb.innerH, amb.depth), mats.brass);
  left.position.set(amb.x - amb.innerW / 2 - amb.bar / 2, amb.y, amb.z);
  left.userData.gymRim = true;
  const right = left.clone();
  right.position.x = amb.x + amb.innerW / 2 + amb.bar / 2;
  hoop.add(top, bot, left, right);
  hoop.traverse((o) => { o.userData.gymArt = true; });
  parent.add(hoop);
  for (const spec of [P.gap.left, P.gap.right]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mats.honey);
    stack.position.set(spec.x, spec.h / 2, spec.z);
    stack.userData.gymArt = true;
    parent.add(stack);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.08, 0.08, spec.d + 0.08), mats.brass);
    lip.position.set(spec.x, spec.h + 0.04, spec.z);
    lip.userData.gymArt = true;
    parent.add(lip);
  }
}

export function buildAmberCourt(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'gymArtVisuals';
  group.userData.gymArt = true;
  const budget = gymBudget(quality);
  const mats = makeGymMats(THREE, vibe);
  const keep = gates || GYM_KEEP_GATES;
  group.userData.planned = planGymKit();
  addBleachers(THREE, group, mats, budget);
  addHoops(THREE, group, mats, budget);
  addPlayLines(THREE, group, mats);
  addTrusses(THREE, group, mats, budget);
  addCeilingCans(THREE, group, mats, budget);
  addWindowsPadsBanners(THREE, group, mats, budget);
  addCourtPaint(THREE, group, mats, budget);
  addWainscotMurals(THREE, group, mats, budget);
  addHeroScoreboard(THREE, group, mats);
  addSecretDressing(THREE, group, mats, budget);
  addWhoopLife(THREE, group, mats, budget, keep);
  parent.add(group);
  return group;
}

export function decorateGymGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 3.6;
  if (ring.material) {
    ring.material.color.setHex(0x8a5a30);
    ring.material.emissive.setHex(col);
    ring.material.emissiveIntensity = emit * 0.45;
    skipMat(ring.material);
  }
  const extras = [];
  const wood = honeyMat(THREE, 0x8a5a30, { emissive: col, emissiveIntensity: emit * 0.5 });
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(size * 1.02, size * 0.08, 8, 22), wood);
  extras.push(hoop);
  const frame = new THREE.Mesh(woodFrameGeo(THREE, size), wood);
  frame.position.z = -size * 0.04;
  extras.push(frame);
  for (let i = 0; i < 4; i++) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(size * 0.08, 8, 6), emitMat(THREE, hexNum(vibe.palette.neonA), emit));
    const a = i * Math.PI / 2;
    pip.position.set(Math.cos(a) * size * 1.02, Math.sin(a) * size * 1.02, 0);
    extras.push(pip);
  }
  const halo = extras[0];
  ring.add(halo);
  ring.userData.artHalo = halo;
  ring.userData.artStyle = 'brass-wood';
  for (let i = 1; i < extras.length; i++) {
    extras[i].castShadow = extras[i].receiveShadow = false;
    ring.add(extras[i]);
  }
  ring.userData.artExtras = extras.slice(1);
  return halo;
}

export function pulseGymGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 3.6;
  if (isNext) {
    col = 0xffffff;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 5) + pulse * 1.2;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.035);
  } else if (passed) {
    col = 0xf0b14b;
    emit = 2.2;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickGymArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.gymRim || u.gymDust || u.gymBanner || u.gymCan) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickGymArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickGymArtObject(o, t) {
  if (o.userData && o.userData.gymRim && o.material) {
    o.material.emissiveIntensity = 2.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.6));
  }
  if (o.userData && o.userData.gymDust) {
    o.rotation.y = t * 0.04;
  }
  if (o.userData && o.userData.gymBanner) {
    o.rotation.z = Math.sin(t * 0.7) * 0.06;
  }
  if (o.userData && o.userData.gymCan && o.material) {
    o.material.emissiveIntensity = 1.6 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.8));
  }
}

export function restyleGym(THREE, ctx) {
  try {
    return restyleGymInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleGym', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleGymInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockGymMeshes(root);
  restyleGymShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('gymArtVisuals');
    if (old) disposeArtGroup(old);
    visuals = buildAmberCourt(THREE, root, vibe, quality, ctx.gates || GYM_KEEP_GATES);
  }
  if (root) root.userData.gymArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
