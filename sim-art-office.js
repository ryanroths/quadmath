// Paper Sun — original office vibe. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.
// Toon morning paper, primary chairs/screens, black-outline hoops.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=99aa44385b45';

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
]);

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
    return { plants: 3, decals: 4, blinds: 2, papers: 6, glow: false, screens: 6 };
  }
  if (applied === 'high') {
    return { plants: 8, decals: 12, blinds: 6, papers: 16, glow: true, screens: 8 };
  }
  return { plants: 6, decals: 8, blinds: 4, papers: 10, glow: true, screens: 8 };
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
    g.fillStyle = '#fff4d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d7dff';
    g.globalAlpha = 0.22;
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
    g.globalAlpha = 1;
    g.fillStyle = '#ff5c5c';
    g.globalAlpha = 0.18;
    g.fillRect(w * 0.48, 0, 4, h);
    g.globalAlpha = 1;
  }, 6, 8);
}

function paperWallTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#fff4d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(26,26,26,0.08)';
    for (let y = 16; y < h; y += 20) g.fillRect(0, y, w, 1);
  }, 8, 4);
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
      m.color.setHex(0xfff4d2);
      m.emissive.setHex(0xfff0c8);
      m.emissiveIntensity = 0.08;
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
    screen: emitMat(THREE, hexNum(vibe.palette.neonB), 1.6),
    plant: toonMat(THREE, hexNum(vibe.palette.neonC), {
      emissive: hexNum(vibe.palette.neonC), emissiveIntensity: 0.18,
    }),
    pot: toonMat(THREE, 0x1a1a1a),
    wood: toonMat(THREE, 0xc4a06a),
    desk: toonMat(THREE, 0x2a2a2a),
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
  const desk = new THREE.BoxGeometry(3.1, 0.12, 1.5);
  addInstanced(THREE, parent, desk, mats.desk, CUBES.length, (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] - 1.35, 0.86, c[1]);
    return true;
  });
  const screen = new THREE.BoxGeometry(1.15, 0.72, 0.08);
  addInstanced(THREE, parent, screen, mats.screen, Math.min(budget.screens, CUBES.length), (d, i) => {
    const c = CUBES[i];
    d.position.set(c[0] - 1.35, 1.28, c[1] - 0.42);
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
  const table = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.16, 2.3), mats.wood);
  table.position.set(4.6, 1.14, -16.2);
  table.userData.officeArt = true;
  parent.add(table);
  const leg = new THREE.CapsuleGeometry(0.08, 1.0, 3, 6);
  for (const [x, z] of [[2.4, -15.3], [6.8, -15.3], [2.4, -17.1], [6.8, -17.1]]) {
    const p = new THREE.Mesh(leg, mats.ink);
    p.position.set(x, 0.56, z);
    p.userData.officeArt = true;
    parent.add(p);
  }
  for (const z of [-14.4, -18.0]) {
    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.18, 4, 8), mats.chair);
    seat.position.set(4.6, 0.52, z);
    seat.userData.officeArt = true;
    parent.add(seat);
  }
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 1.45), mats.desk);
  desk.position.set(14.2, 0.6, 18.4);
  desk.userData.officeArt = true;
  parent.add(desk);
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
  }
  const screenPulse = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.78, 0.06), mats.screen);
  screenPulse.position.set(14.2, 1.55, 17.7);
  screenPulse.userData.officeScreen = true;
  screenPulse.userData.officeArt = true;
  extras.add(screenPulse);
  parent.add(extras);
}

export function buildPaperSun(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'officeArtVisuals';
  group.userData.officeArt = true;
  const budget = officeBudget(quality);
  const mats = makeOfficeMats(THREE, vibe);
  addCubicles(THREE, group, mats, budget);
  addHallAndConference(THREE, group, mats);
  addWhoopLife(THREE, group, mats, budget, gates || OFFICE_KEEP_GATES);
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
  ring.add(hoop);
  ring.add(outline);
  ring.userData.artHalo = hoop;
  ring.userData.artStyle = 'toon-hoop';
  ring.userData.artExtras = [outline];
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
  root.traverse((o) => {
    try {
      tickOfficeArtObject(o, t);
    } catch (e) { /* never abort the FPV render loop */ }
  });
}

function tickOfficeArtObject(o, t) {
  if (o.userData && o.userData.officeScreen && o.material) {
    o.material.emissiveIntensity = 1.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.1));
  }
  if (o.userData && o.userData.officePlant) {
    o.rotation.y = t * 0.15;
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
