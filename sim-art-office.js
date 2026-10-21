// Paper Sun — playable whoop playground + Kenney CC0 shop kit.
// Colliders live in sim-maps.js OFFICE_PLAY and must match kit/proc meshes.
// Kenney kit (sim-art-kit.js) swaps floor clutter after first paint.
// Procedural meshes stay if a mesh fails. Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=c9b36c5911c1';
import { OFFICE_PLAY } from './sim-maps.js?v=7a5d35835511';

export const OFFICE_STOCK = Object.freeze({
  wall: 0xd6d0c6,
  ceil: 0xe6e2da,
  floor: 0x8a8478,
  wood: 0x7a5130,
  dark: 0x2c2f36,
  cube: 0xc8c2b6,
  chair: 0x3d4a58,
  screen: 0x1a2a38,
});

export const OFFICE_KEEP_GATES = Object.freeze([
  { x: 13.5, y: 2.3, z: 18.2, size: 1.9 },
  { x: 13.5, y: 2.2, z: 15.5, size: 1.8 },
  { x: 4.2, y: 2.2, z: 15.5, size: 1.8 },
  { x: -8.3, y: 2.2, z: 6.0, size: 1.7 },
  { x: -8.3, y: 2.2, z: -6.0, size: 1.7 },
  { x: 4.2, y: 2.2, z: -17.4, size: 1.8 },
  { x: 13.5, y: 2.3, z: -17.4, size: 1.8 },
  { x: 13.5, y: 2.3, z: 12.0, size: 1.9 },
  { x: 4.6, y: 2.70, z: 6.2, size: 1.8 },
  { x: -3.75, y: 0.62, z: 0.0, size: 1.5 },
  { x: 4.6, y: 0.62, z: -16.2, size: 1.5 },
  { x: 4.6, y: 1.55, z: 12.4, size: 1.5 },
  { x: -3.75, y: 4.05, z: 12.0, size: 1.6 },
  { x: 0.0, y: 7.45, z: 6.0, size: 1.6 },
]);

export function planOfficeKit() {
  return {
    cardboard: [
      { x: 16.4, z: -20.6 }, { x: 16.2, z: 8.4 }, { x: -16.6, z: -20.2 },
      { x: -16.4, z: 20.6 }, { x: 16.6, z: -8.2 }, { x: -16.2, z: 6.4 },
    ],
    crates: [
      { x: 16.5, z: 14.2 }, { x: -16.5, z: -6.8 }, { x: 16.3, z: -14.4 },
      { x: -16.3, z: 18.2 }, { x: 15.8, z: 4.2 }, { x: -16.6, z: 2.2 },
    ],
    toolboxes: [
      { x: 16.4, z: -4.2, ry: 1.57 }, { x: -16.4, z: -14.6, ry: -1.57 },
      { x: 16.2, z: 20.2, ry: 3.14 },
    ],
  };
}

const CUBES = Object.freeze([
  [-13.25, -12], [-3.75, -12],
  [-13.25, 0], [-3.75, 0],
  [-13.25, 12], [-3.75, 12],
]);

export function officeWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function officeBudget(applied) {
  if (applied === 'low') {
    return {
      plants: 3, decals: 4, blinds: 4, papers: 8, glow: false, screens: 6,
      lamps: 6, mugs: 6, keys: 6, plates: 6, notes: 8, planes: 3, trays: 6,
      windows: 4, coolers: 1,
    };
  }
  if (applied === 'high') {
    return {
      plants: 8, decals: 12, blinds: 6, papers: 16, glow: true, screens: 8,
      lamps: 10, mugs: 8, keys: 8, plates: 8, notes: 14, planes: 8, trays: 8,
      windows: 8, coolers: 2,
    };
  }
  return {
    plants: 6, decals: 8, blinds: 5, papers: 10, glow: true, screens: 8,
    lamps: 8, mugs: 6, keys: 6, plates: 6, notes: 10, planes: 5, trays: 6,
    windows: 6, coolers: 2,
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
    if (g) { g.fillStyle = '#fff4d2'; g.fillRect(0, 0, w, h); }
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

function paperFloorTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#fff8dc'], [0.45, '#fff4d2'], [1, '#e8d8b0']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d7dff';
    g.globalAlpha = 0.2;
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
    g.globalAlpha = 0.1;
    for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 1, h);
    g.globalAlpha = 1;
    g.fillStyle = '#ff5c5c';
    g.globalAlpha = 0.22;
    g.fillRect(w * 0.48, 0, 5, h);
    g.globalAlpha = 0.12;
    g.fillStyle = '#1a1a1a';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.globalAlpha = 1;
  }, 6, 8);
}

function paperWallTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#fff8e0'], [0.7, '#fff4d2'], [1, '#e8dcc0']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(26,26,26,0.07)';
    for (let y = 16; y < h; y += 20) g.fillRect(0, y, w, 1);
    g.fillStyle = 'rgba(255,210,122,0.12)';
    for (let x = 8; x < w; x += 18) g.fillRect(x, 0, 3, h);
  }, 8, 4);
}

function paperCeilTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#fff8e8'], [1, '#f0e4c8']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(26,26,26,0.08)';
    g.lineWidth = 2;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = 'rgba(255,210,122,0.16)';
    g.fillRect(18, 18, w - 36, h - 36);
  }, 10, 8);
}

function sunSignTex(THREE) {
  return canvasTex(THREE, 256, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#ffd27a'], [0.55, '#fff4d2'], [1, '#ff5c5c']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a1a';
    g.fillRect(0, 0, w, 8);
    g.fillRect(0, h - 8, w, 8);
    g.fillRect(0, 0, 8, h);
    g.fillRect(w - 8, 0, 8, h);
    g.fillStyle = '#3d7dff';
    g.font = 'bold 58px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SUN', w * 0.5, h * 0.52);
    g.fillStyle = '#ff5c5c';
    g.fillRect(28, h * 0.5 - 18, 10, 36);
    g.fillRect(w - 38, h * 0.5 - 18, 10, 36);
  }, 1, 1);
}

function nameplateTex(THREE) {
  return canvasTex(THREE, 128, 48, (g, w, h) => {
    g.fillStyle = '#fff4d2';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 4;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#3d7dff';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('FLY', w * 0.5, h * 0.55);
  }, 1, 1);
}

function screenGlowTex(THREE) {
  return canvasTex(THREE, 64, 48, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#9ad4ff'], [0.5, '#3d7dff'], [1, '#1a2a38']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff4d2';
    g.globalAlpha = 0.35;
    g.fillRect(8, 8, w - 16, 6);
    g.fillRect(8, 18, w * 0.45, 4);
    g.globalAlpha = 1;
  }, 1, 1);
}

function toonMat(THREE, hex, extras) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.92, metalness: 0, flatShading: true, envMapIntensity: 0.08,
  }, extras || {})));
}

function emitMat(THREE, hex, emit) {
  return skipMat(new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: emit == null ? 1.4 : emit,
    roughness: 0.45, metalness: 0, flatShading: true, envMapIntensity: 0.06,
  }));
}

function inkMat(THREE) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: 0x1a1a1a, toneMapped: false,
  }));
}

function glowMat(THREE, hex, opacity) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: opacity == null ? 0.22 : opacity,
    depthWrite: false, toneMapped: false,
  }));
}

function plantGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.16, 0),
    new THREE.Vector2(0.14, 0.12),
    new THREE.Vector2(0.04, 0.22),
    new THREE.Vector2(0.18, 0.38),
    new THREE.Vector2(0.0, 0.52),
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
  mesh.userData.officeArt = true;
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

export function hideStockOfficeMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.officeArt) return;
    if (o.parent && o.parent.name === 'officeArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    if (col === OFFICE_STOCK.cube || col === OFFICE_STOCK.chair || col === OFFICE_STOCK.screen) {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (col === OFFICE_STOCK.wood || col === OFFICE_STOCK.dark) {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

export function restyleOfficeShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const wallTex = paperWallTex(THREE);
  const floorTex = paperFloorTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.officeArt || (o.parent && o.parent.name === 'officeArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === OFFICE_STOCK.wall) {
      m.color.setHex(0xfff4d2);
      m.map = wallTex;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.roughness = 0.94;
      m.flatShading = true;
      skipMat(m); n++;
    } else if (col === OFFICE_STOCK.ceil) {
      m.color.setHex(0xffffff);
      m.map = paperCeilTex(THREE);
      m.emissive.setHex(0xfff0c8);
      m.emissiveIntensity = 0.16;
      m.flatShading = true;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === OFFICE_STOCK.floor)) {
      if (m.map && m.map !== floorTex && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = floorTex;
      m.color.setHex(0xffffff);
      m.roughness = 0.9;
      m.metalness = 0;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      skipMat(m); n++;
    }
  });
  return n;
}

function makeOfficeMats(THREE, vibe) {
  return {
    paper: toonMat(THREE, hexNum(vibe.palette.facade)),
    ink: inkMat(THREE),
    chair: toonMat(THREE, hexNum(vibe.palette.neonA)),
    screen: skipMat(new THREE.MeshStandardMaterial({
      color: hexNum(vibe.palette.neonB),
      map: screenGlowTex(THREE),
      emissive: hexNum(vibe.palette.neonB),
      emissiveIntensity: 1.6,
      roughness: 0.4, metalness: 0, flatShading: true, envMapIntensity: 0.06,
    })),
    plant: toonMat(THREE, hexNum(vibe.palette.neonC), {
      emissive: hexNum(vibe.palette.neonC), emissiveIntensity: 0.18,
    }),
    pot: toonMat(THREE, 0x1a1a1a),
    wood: toonMat(THREE, 0xc4a06a),
    desk: toonMat(THREE, 0x2a2a2a),
    mug: toonMat(THREE, 0x3d7dff),
    mugAlt: toonMat(THREE, 0xff5c5c),
    key: toonMat(THREE, 0x1a1a1a),
    note: toonMat(THREE, 0xffd27a),
    tray: toonMat(THREE, 0xe8d8b0),
    lamp: skipMat(new THREE.MeshBasicMaterial({
      color: 0xfff0c8, toneMapped: false,
    })),
    lampArm: toonMat(THREE, 0x1a1a1a),
    sign: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: sunSignTex(THREE), toneMapped: false,
    })),
    plate: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: nameplateTex(THREE), toneMapped: false,
    })),
    glass: skipMat(new THREE.MeshBasicMaterial({
      color: 0x9ad4ff, transparent: true, opacity: 0.42, toneMapped: false,
    })),
    sky: skipMat(new THREE.MeshBasicMaterial({
      color: 0x9ad4ff, toneMapped: false,
    })),
    sunDisc: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffd27a, toneMapped: false,
    })),
    shaft: glowMat(THREE, 0xffd27a, 0.14),
    decal: glowMat(THREE, 0x1a1a1a, 0.18),
    sun: glowMat(THREE, 0xffd27a, 0.16),
  };
}

function addCubicles(THREE, parent, mats, budget) {
  const wallZ = new THREE.BoxGeometry(6.2, 3.4, 0.1);
  const wallX = new THREE.BoxGeometry(0.1, 3.4, 6.8);
  addInstanced(THREE, parent, wallZ, mats.paper, CUBES.length * 2, (d, i) => {
    const c = CUBES[(i / 2) | 0];
    d.position.set(c[0], 1.7, c[1] + (i % 2 ? 3.4 : -3.4));
    return true;
  });
  addInstanced(THREE, parent, wallX, mats.paper, CUBES.length, (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] - 3.15, 1.7, c[1]);
    return true;
  });
  const inkZ = new THREE.BoxGeometry(6.3, 0.06, 0.12);
  addInstanced(THREE, parent, inkZ, mats.ink, CUBES.length * 2, (d, i) => {
    const c = CUBES[(i / 2) | 0];
    d.position.set(c[0], 3.42, c[1] + (i % 2 ? 3.4 : -3.4));
    return true;
  });
  const P = OFFICE_PLAY;
  const desk = new THREE.BoxGeometry(P.desk.w, P.desk.topH, P.desk.d);
  addInstanced(THREE, parent, desk, mats.desk, CUBES.length, (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] + P.desk.localX, P.desk.topY + P.desk.topH / 2, c[1]);
    return true;
  });
  const legGeo = new THREE.BoxGeometry(P.desk.leg, P.desk.topY, P.desk.leg);
  addInstanced(THREE, parent, legGeo, mats.wood, CUBES.length * P.desk.legs.length, (d, i) => {
    const c = CUBES[(i / P.desk.legs.length) | 0];
    const lg = P.desk.legs[i % P.desk.legs.length];
    d.position.set(c[0] + P.desk.localX + lg[0], P.desk.topY / 2, c[1] + lg[1]);
    return true;
  });
  const screen = new THREE.BoxGeometry(1.15, 0.72, 0.08);
  addInstanced(THREE, parent, screen, mats.screen, Math.min(budget.screens, CUBES.length), (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] + P.desk.localX, P.desk.topY + P.desk.topH + 0.36, c[1] - 0.42);
    return true;
  });
  const seat = new THREE.CapsuleGeometry(0.42, 0.18, 4, 8);
  addInstanced(THREE, parent, seat, mats.chair, CUBES.length, (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] + 0.55, 0.52, c[1]);
    return true;
  });
  const back = new THREE.BoxGeometry(0.95, 1.05, 0.12);
  addInstanced(THREE, parent, back, mats.chair, CUBES.length, (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] + 0.55, 1.15, c[1] - 0.38);
    return true;
  });
  const key = new THREE.BoxGeometry(0.72, 0.04, 0.28);
  addInstanced(THREE, parent, key, mats.key, Math.min(budget.keys, CUBES.length), (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] - 1.35, OFFICE_PLAY.desk.topY + OFFICE_PLAY.desk.topH + 0.02, c[1] + 0.28);
    return true;
  });
  const mug = new THREE.CylinderGeometry(0.07, 0.06, 0.12, 8);
  addInstanced(THREE, parent, mug, mats.mug, Math.min(budget.mugs, CUBES.length), (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] - 0.35, OFFICE_PLAY.desk.topY + OFFICE_PLAY.desk.topH + 0.06, c[1] + 0.42);
    return true;
  });
  const plate = new THREE.BoxGeometry(0.42, 0.16, 0.03);
  addInstanced(THREE, parent, plate, mats.plate, Math.min(budget.plates, CUBES.length), (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] + 0.15, 1.55, c[1] - 3.28);
    return true;
  });
  const tray = new THREE.BoxGeometry(0.34, 0.06, 0.28);
  addInstanced(THREE, parent, tray, mats.tray, Math.min(budget.trays, CUBES.length), (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] - 2.2, OFFICE_PLAY.desk.topY + OFFICE_PLAY.desk.topH + 0.03, c[1] + 0.35);
    return true;
  });
  const poster = new THREE.BoxGeometry(1.15, 1.45, 0.04);
  addInstanced(THREE, parent, poster, mats.sign, CUBES.length, (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] - 0.4, 1.85, c[1] + 3.48);
    return true;
  });
}

function addHallAndConference(THREE, parent, mats) {
  const div = new THREE.BoxGeometry(0.14, 3.55, 28);
  const divider = new THREE.Mesh(div, mats.paper);
  divider.position.set(10.15, 1.78, -1.0);
  divider.userData.officeArt = true;
  parent.add(divider);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 28.2), mats.ink);
  stripe.position.set(10.15, 3.58, -1.0);
  stripe.userData.officeArt = true;
  parent.add(stripe);
  const endA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.55, 2.7), mats.paper);
  endA.position.set(10.15, 1.78, -21.6);
  endA.userData.officeArt = true;
  parent.add(endA);
  const endB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.55, 4.3), mats.paper);
  endB.position.set(10.15, 1.78, 20.8);
  endB.userData.officeArt = true;
  parent.add(endB);
  const conf = OFFICE_PLAY.conf;
  const table = new THREE.Mesh(new THREE.BoxGeometry(conf.w, conf.topH, conf.d), mats.wood);
  table.position.set(conf.x, conf.topY + conf.topH / 2, conf.z);
  table.userData.officeArt = true;
  parent.add(table);
  const leg = new THREE.BoxGeometry(conf.leg, conf.topY, conf.leg);
  for (const [dx, dz] of conf.legs) {
    const p = new THREE.Mesh(leg, mats.ink);
    p.position.set(conf.x + dx, conf.topY / 2, conf.z + dz);
    p.userData.officeArt = true;
    parent.add(p);
  }
  for (const z of [-14.4, -18.0]) {
    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.18, 4, 8), mats.chair);
    seat.position.set(4.6, 0.52, z);
    seat.userData.officeArt = true;
    parent.add(seat);
  }
  const rec = OFFICE_PLAY.reception;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(rec.w, rec.topH, rec.d), mats.desk);
  desk.position.set(rec.x, rec.topY + rec.topH / 2, rec.z);
  desk.userData.officeArt = true;
  parent.add(desk);
  for (const [dx, dz] of rec.legs) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(rec.leg, rec.topY, rec.leg), mats.ink);
    p.position.set(rec.x + dx, rec.topY / 2, rec.z + dz);
    p.userData.officeArt = true;
    parent.add(p);
  }
  const recMon = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.82, 0.08), mats.screen);
  recMon.position.set(14.2, rec.topY + rec.topH + 0.41, 17.72);
  recMon.userData.officeScreen = true;
  recMon.userData.officeArt = true;
  parent.add(recMon);
  const recMug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.13, 8), mats.mugAlt);
  recMug.position.set(13.15, OFFICE_PLAY.reception.topY + OFFICE_PLAY.reception.topH + 0.06, 18.15);
  recMug.userData.officeArt = true;
  parent.add(recMug);
  for (const z of [8.4, 2.2, -6.4, -14.2]) {
    const hallPoster = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.55, 1.2), mats.sign);
    hallPoster.position.set(10.26, 2.05, z);
    hallPoster.userData.officeArt = true;
    parent.add(hallPoster);
  }
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), mats.sunDisc);
  clock.position.set(10.26, 2.95, 12.6);
  clock.rotation.y = Math.PI / 2;
  clock.userData.officeSun = true;
  clock.userData.officeArt = true;
  parent.add(clock);
  const clockInk = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 16), mats.ink);
  clockInk.position.set(10.26, 2.95, 12.6);
  clockInk.rotation.y = Math.PI / 2;
  clockInk.userData.officeArt = true;
  parent.add(clockInk);
}

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const extras = new THREE.Group();
  extras.name = 'officeArtExtras';
  extras.userData.officeArt = true;
  const plantSpots = [
    [-16.6, 20.6], [16.4, 21.2], [16.6, -21.2], [-16.4, -21.0],
    [6.8, 20.4], [1.8, -20.6], [16.2, 8.4], [-16.8, 8.2],
  ];
  for (let i = 0; i < budget.plants; i++) {
    const s = plantSpots[i];
    if (!s) continue;
    if (!propClearOfCourse(s[0], s[1], 0.3, gates, { gatePad: 1.5, corridor: 1.2, yRange: 2 })) continue;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.22, 8), mats.pot);
    pot.position.set(s[0], 0.12, s[1]);
    const leaf = new THREE.Mesh(plantGeo(THREE), mats.plant);
    leaf.position.set(s[0], 0.22, s[1]);
    leaf.userData.officePlant = true;
    leaf.userData.officeArt = true;
    pot.userData.officeArt = true;
    extras.add(pot, leaf);
  }
  const paper = new THREE.BoxGeometry(0.28, 0.04, 0.36);
  const paperSpots = [
    [-14.6, -12], [-5.1, 0], [-14.6, 12], [-5.1, -12],
    [-14.6, 0], [-5.1, 12], [3.4, -16.2], [5.8, -16.2],
    [13.4, 18.4], [15.0, 18.4], [4.2, 8.4], [6.2, 7.6],
    [-12.2, -11.2], [-2.8, 1.1], [-12.4, 11.4], [-2.6, -11.6],
  ];
  addInstanced(THREE, extras, paper, mats.paper, budget.papers, (d, i) => {
    const s = paperSpots[i % paperSpots.length];
    d.position.set(s[0], 0.96 + (i % 3) * 0.05, s[1]);
    d.rotation.y = i * 0.3;
    return true;
  });
  if (budget.glow) {
    const decal = new THREE.PlaneGeometry(1.6, 0.7);
    addInstanced(THREE, extras, decal, mats.decal, budget.decals, (d, i) => {
      const spots = [[-8.3, 3], [-8.3, -3], [13.4, 8], [4.6, -12], [13.4, -8], [-8.3, 14], [4.6, 6], [13.5, 16]];
      const s = spots[i % spots.length];
      d.position.set(s[0], 0.03, s[1]);
      d.rotation.x = -Math.PI / 2;
      return true;
    });
    const slat = new THREE.BoxGeometry(0.06, 2.8, 4.8);
    addInstanced(THREE, extras, slat, glowMat(THREE, 0xffd27a, 0.35), budget.blinds, (d, i) => {
      d.position.set(17.72, 4.6, -14 + i * 6);
      return true;
    });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), mats.sun);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(12.4, 0.028, 4);
    pool.userData.officeArt = true;
    extras.add(pool);
    const shaft = new THREE.BoxGeometry(0.55, 7.2, 2.4);
    addInstanced(THREE, extras, shaft, mats.shaft, 3, (d, i) => {
      d.position.set(-16.4 + i * 0.8, 4.6, -10 + i * 8);
      d.rotation.z = 0.18;
      return true;
    });
  }
  const note = new THREE.BoxGeometry(0.22, 0.28, 0.02);
  addInstanced(THREE, extras, note, mats.note, budget.notes, (d, i) => {
    const c = CUBES[i % CUBES.length];
    const side = i % 2 ? 1 : -1;
    d.position.set(c[0] + side * 2.9, 1.7 + (i % 3) * 0.28, c[1] + (i % 2 ? 0.8 : -0.8));
    d.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    return true;
  });
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 36), skipMat(new THREE.MeshBasicMaterial({
    color: 0xff5c5c, transparent: true, opacity: 0.18, toneMapped: false,
  })));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(-8.3, 0.025, 0);
  runner.userData.officeArt = true;
  extras.add(runner);
  for (let i = 0; i < budget.planes; i++) {
    const plane = new THREE.Mesh(planeGeo(THREE), i % 2 ? mats.mug : mats.mugAlt);
    plane.position.set(-9.2 + (i % 3) * 4.4, 1.55 + (i % 3) * 0.45, -12 + ((i / 2) | 0) * 6.5);
    plane.scale.setScalar(2.4);
    plane.rotation.set(0.35, i * 0.7, 0.2);
    plane.userData.officePlane = true;
    plane.userData.officeBaseY = plane.position.y;
    plane.userData.officePhase = i * 1.1;
    plane.userData.officeArt = true;
    extras.add(plane);
  }
  const coolerSpots = [[16.2, 8.4], [16.4, -8.2]];
  for (let i = 0; i < budget.coolers; i++) {
    const s = coolerSpots[i];
    if (!s) continue;
    if (!propClearOfCourse(s[0], s[1], 0.35, gates, { gatePad: 1.5, corridor: 1.1, yRange: 2 })) continue;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.15, 0.48), mats.sky);
    body.position.set(s[0], 0.58, s[1]);
    const jug = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mats.glass);
    jug.position.set(s[0], 1.38, s[1]);
    body.userData.officeArt = true;
    jug.userData.officeArt = true;
    extras.add(body, jug);
  }
  const copier = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 0.7), mats.desk);
  copier.position.set(6.4, 0.54, 20.2);
  copier.userData.officeArt = true;
  extras.add(copier);
  const copierLid = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.62), mats.glass);
  copierLid.position.set(6.4, 1.1, 20.2);
  copierLid.userData.officeArt = true;
  extras.add(copierLid);
  parent.add(extras);
}

function planeGeo(THREE) {
  const shp = new THREE.Shape();
  shp.moveTo(0, 0);
  shp.lineTo(0.38, 0.08);
  shp.lineTo(0, 0.03);
  shp.lineTo(-0.38, 0.08);
  shp.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(shp, { depth: 0.012, bevelEnabled: false });
}

function addCeilingLamps(THREE, parent, mats, budget) {
  const bar = new THREE.BoxGeometry(2.6, 0.08, 0.42);
  addInstanced(THREE, parent, bar, mats.lamp, budget.lamps, (d, i) => {
    const col = i % 2;
    d.position.set(col ? 4.8 : -8.3, 8.55, -16 + ((i / 2) | 0) * 8);
    return true;
  });
  const arm = new THREE.BoxGeometry(0.06, 0.55, 0.06);
  addInstanced(THREE, parent, arm, mats.lampArm, budget.lamps, (d, i) => {
    const col = i % 2;
    d.position.set(col ? 4.8 : -8.3, 8.9, -16 + ((i / 2) | 0) * 8);
    return true;
  });
}

function addWindows(THREE, parent, mats, budget) {
  const pane = new THREE.BoxGeometry(0.06, 2.4, 3.2);
  addInstanced(THREE, parent, pane, mats.glass, budget.windows, (d, i) => {
    d.position.set(-17.72, 5.4, -16 + i * 5.4);
    return true;
  });
  const frame = new THREE.BoxGeometry(0.1, 2.55, 0.1);
  addInstanced(THREE, parent, frame, mats.ink, budget.windows * 2, (d, i) => {
    const n = (i / 2) | 0;
    d.position.set(-17.7, 5.4, -16 + n * 5.4 + (i % 2 ? 1.62 : -1.62));
    return true;
  });
}

function addHeroSunSign(THREE, parent, mats) {
  const hero = new THREE.Group();
  hero.name = 'officeArtHero';
  hero.userData.officeArt = true;
  const cable = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 3.4, 3, 6), mats.ink);
  cable.position.set(2.4, 7.15, 6.2);
  hero.add(cable);
  const cable2 = cable.clone();
  cable2.position.x = 4.6;
  hero.add(cable2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.25, 0.14), mats.desk);
  body.position.set(3.5, 4.55, 6.2);
  hero.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(3.35, 1.05, 0.06), mats.sign);
  face.position.set(3.5, 4.55, 6.1);
  hero.add(face);
  const faceBack = face.clone();
  faceBack.position.z = 6.3;
  faceBack.rotation.y = Math.PI;
  hero.add(faceBack);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20), mats.sunDisc);
  disc.position.set(3.5, 3.62, 6.2);
  disc.userData.officeSun = true;
  hero.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.04, 6, 18), mats.ink);
  rim.position.set(3.5, 3.62, 6.2);
  hero.add(rim);
  hero.traverse((o) => { o.userData.officeArt = true; });
  parent.add(hero);
}

function addSecretDressing(THREE, parent, mats) {
  // Blinds Bay {10.15, 4.2, 15.8} — divider top by the north door.
  const slat = new THREE.BoxGeometry(0.08, 1.15, 2.4);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(slat, glowMat(THREE, 0xffd27a, 0.32));
    s.position.set(10.15, 4.2, 15.8 + (i - 1.5) * 0.22);
    s.userData.officeBlind = true;
    s.userData.officeArt = true;
    parent.add(s);
  }
  const bayGlow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.6), glowMat(THREE, 0xffd27a, 0.4));
  bayGlow.position.set(10.15, 3.72, 15.8);
  bayGlow.userData.officeArt = true;
  parent.add(bayGlow);
  // Paper Loft {-16.4, 3.9, 12} — far west cube lid.
  const stack = new THREE.BoxGeometry(0.55, 0.14, 0.42);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(stack, i % 2 ? mats.note : mats.paper);
    p.position.set(-16.4 + (i - 1) * 0.18, 3.55 + i * 0.14, 12);
    p.rotation.y = i * 0.2;
    p.userData.officeArt = true;
    parent.add(p);
  }
  const loftGlow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.9), glowMat(THREE, 0xffd27a, 0.28));
  loftGlow.position.set(-16.4, 3.42, 12);
  loftGlow.userData.officeArt = true;
  parent.add(loftGlow);
  const stapler = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), mats.mugAlt);
  stapler.position.set(-16.05, 3.92, 12.15);
  stapler.userData.officeArt = true;
  parent.add(stapler);
}

function addPlayLines(THREE, parent, mats) {
  const P = OFFICE_PLAY;
  const sun = P.sun;
  const hoop = new THREE.Group();
  hoop.name = 'officeArtSunHoop';
  hoop.userData.officeArt = true;
  const ow = sun.innerW + sun.bar * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ow, sun.bar, sun.depth), mats.ink);
  top.position.set(sun.x, sun.y + sun.innerH / 2 + sun.bar / 2, sun.z);
  top.userData.officeSun = true;
  const bot = top.clone();
  bot.position.y = sun.y - sun.innerH / 2 - sun.bar / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(sun.bar, sun.innerH, sun.depth), mats.ink);
  left.position.set(sun.x - sun.innerW / 2 - sun.bar / 2, sun.y, sun.z);
  left.userData.officeSun = true;
  const right = left.clone();
  right.position.x = sun.x + sun.innerW / 2 + sun.bar / 2;
  hoop.add(top, bot, left, right);
  hoop.traverse((o) => { o.userData.officeArt = true; });
  parent.add(hoop);

  const joistGeo = new THREE.BoxGeometry(34.8, P.rafterH, P.rafterD);
  addInstanced(THREE, parent, joistGeo, mats.ink, P.rafterZs.length, (d, i) => {
    d.position.set(0, P.rafterY + P.rafterH / 2, P.rafterZs[i]);
    return true;
  });
  for (const spec of [P.gap.left, P.gap.right]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mats.desk);
    stack.position.set(spec.x, spec.h / 2, spec.z);
    stack.userData.officeArt = true;
    parent.add(stack);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.08, 0.08, spec.d + 0.08), mats.ink);
    lip.position.set(spec.x, spec.h + 0.04, spec.z);
    lip.userData.officeArt = true;
    parent.add(lip);
  }
}

export function buildPaperSun(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'officeArtVisuals';
  group.userData.officeArt = true;
  const budget = officeBudget(quality);
  const mats = makeOfficeMats(THREE, vibe);
  group.userData.planned = planOfficeKit();
  addCubicles(THREE, group, mats, budget);
  addHallAndConference(THREE, group, mats);
  addPlayLines(THREE, group, mats);
  addCeilingLamps(THREE, group, mats, budget);
  addWindows(THREE, group, mats, budget);
  addWhoopLife(THREE, group, mats, budget, gates || OFFICE_KEEP_GATES);
  addHeroSunSign(THREE, group, mats);
  addSecretDressing(THREE, group, mats);
  parent.add(group);
  return group;
}

export function decorateOfficeGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 2.8;
  if (ring.material) {
    ring.material.color.setHex(col);
    ring.material.emissive.setHex(col);
    ring.material.emissiveIntensity = emit;
    ring.material.flatShading = true;
    skipMat(ring.material);
  }
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(size * 1.02, size * 0.1, 8, 22), emitMat(THREE, col, emit));
  const outline = new THREE.Mesh(new THREE.TorusGeometry(size * 1.12, size * 0.035, 6, 20), inkMat(THREE));
  const tab = new THREE.Mesh(new THREE.BoxGeometry(size * 0.28, size * 0.16, size * 0.04), toonMat(THREE, 0xfff4d2));
  tab.position.set(0, size * 1.18, 0);
  ring.add(hoop);
  ring.add(outline);
  ring.add(tab);
  ring.userData.artHalo = hoop;
  ring.userData.artStyle = 'toon-hoop';
  ring.userData.artExtras = [outline, tab];
  return hoop;
}

export function pulseOfficeGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material && e.material.emissive) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 2.8;
  if (isNext) {
    col = 0xffffff;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 3.8) + pulse;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.03);
  } else if (passed) {
    col = 0x2ae59b;
    emit = 1.6;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickOfficeArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.officeScreen || u.officePlant || u.officeSun || u.officePlane || u.officeBlind) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickOfficeArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickOfficeArtObject(o, t) {
  if (o.userData && o.userData.officeScreen && o.material) {
    o.material.emissiveIntensity = 1.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.1));
  }
  if (o.userData && o.userData.officePlant) {
    o.rotation.y = t * 0.15;
  }
  if (o.userData && o.userData.officeSun) {
    o.rotation.z = t * 0.12;
  }
  if (o.userData && o.userData.officePlane) {
    const base = o.userData.officeBaseY == null ? o.position.y : o.userData.officeBaseY;
    o.rotation.y = t * 0.35 + (o.userData.officePhase || 0);
    o.position.y = base + Math.sin(t * 0.8 + (o.userData.officePhase || 0)) * 0.12;
  }
  if (o.userData && o.userData.officeBlind && o.material && o.material.opacity != null) {
    o.material.opacity = 0.28 + 0.08 * Math.sin(t * 1.4);
  }
}

export function restyleOffice(THREE, ctx) {
  try {
    return restyleOfficeInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleOffice', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleOfficeInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockOfficeMeshes(root);
  restyleOfficeShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('officeArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildPaperSun(THREE, root, vibe, quality, ctx.gates || OFFICE_KEEP_GATES);
  }
  if (root) root.userData.officeArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
