// Volt Stall — original garage vibe. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.
// Sculpted with capsules, lathes, and rounded extrudes — not stacked slabs.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=c235d936652f';

export const GARAGE_STOCK = Object.freeze({
  wall: 0xb7b3a8,
  ceil: 0x9a958c,
  floor: 0x8a8680,
  wood: 0x6a4e32,
  metal: 0x6d7380,
  car: 0x2c5f8a,
  tire: 0x1a1a1a,
});

export const GARAGE_KEEP_GATES = Object.freeze([
  { x: 0.0, y: 2.4, z: 16.5, size: 2.0 },
  { x: -6.8, y: 2.3, z: 6.0, size: 1.8 },
  { x: -6.6, y: 2.5, z: -8.5, size: 1.8 },
  { x: 0.2, y: 2.2, z: -16.5, size: 1.9 },
  { x: 6.4, y: 2.6, z: -8.0, size: 1.8 },
  { x: 6.2, y: 2.4, z: 6.5, size: 1.8 },
  { x: 0.0, y: 2.4, z: 10.0, size: 2.0 },
  { x: 0.0, y: 2.6, z: 17.0, size: 2.0 },
  { x: -5.5, y: 7.6, z: 8.0, size: 1.7 },
  { x: 5.5, y: 8.0, z: 2.7, size: 1.7 },
  { x: -5.5, y: 7.8, z: -8.0, size: 1.7 },
  { x: 0.0, y: 4.2, z: -16.0, size: 1.8 },
  { x: 6.0, y: 2.5, z: -4.0, size: 1.8 },
  { x: 0.0, y: 2.6, z: 8.5, size: 2.0 },
]);

const ROOM = Object.freeze({ w: 21, d: 42, h: 10.5 });

export function garageWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function garageBudget(applied) {
  if (applied === 'low') {
    return {
      tubes: 6, cones: 4, cans: 10, tools: 8, stripes: 8, puddles: 0,
      glow: false, sparks: false, extraCans: 0,
    };
  }
  if (applied === 'high') {
    return {
      tubes: 16, cones: 10, cans: 24, tools: 18, stripes: 14, puddles: 10,
      glow: true, sparks: true, extraCans: 8,
    };
  }
  return {
    tubes: 12, cones: 8, cans: 18, tools: 14, stripes: 12, puddles: 6,
    glow: true, sparks: true, extraCans: 4,
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
    if (g) { g.fillStyle = '#14161c'; g.fillRect(0, 0, w, h); }
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

function oilFloorTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = '#1a1c20';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 28) {
      g.fillStyle = y % 56 === 0 ? '#22262c' : '#16181c';
      g.fillRect(0, y, w, 26);
    }
    g.fillStyle = '#ffb347';
    g.globalAlpha = 0.55;
    g.fillRect(w * 0.46, 0, 6, h);
    g.fillRect(w * 0.52, 0, 6, h);
    g.globalAlpha = 1;
    g.fillStyle = '#2de2e6';
    g.globalAlpha = 0.28;
    for (let y = 12; y < h; y += 36) g.fillRect(w * 0.47, y, 18, 8);
    g.globalAlpha = 1;
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(8,8,10,${0.18 + (i % 4) * 0.06})`;
      g.beginPath();
      g.arc((i * 47) % w, (i * 71) % h, 10 + (i % 6), 0, 6.3);
      g.fill();
    }
  }, 4, 8);
}

function steelWallTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#3d4654';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a3038';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 1);
    g.fillStyle = 'rgba(45,226,230,0.08)';
    g.fillRect(0, 40, w, 3);
    g.fillStyle = 'rgba(255,179,71,0.08)';
    g.fillRect(0, 90, w, 2);
  }, 6, 4);
}

function alleyTex(THREE) {
  return canvasTex(THREE, 128, 160, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [
      [0, '#0a0c10'], [0.45, '#1c1810'], [1, '#ffb347'],
    ]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2de2e6';
    g.globalAlpha = 0.35;
    g.fillRect(w * 0.2, h * 0.62, w * 0.6, 4);
    g.globalAlpha = 1;
  }, 1, 1);
}

function steelMat(THREE, hex, extras) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.62, metalness: 0.28, envMapIntensity: 0.2,
  }, extras || {})));
}

function emitMat(THREE, hex, emit) {
  return skipMat(new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: emit == null ? 2.4 : emit,
    roughness: 0.35, metalness: 0.08, envMapIntensity: 0.12,
  }));
}

function glowMat(THREE, hex, opacity) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: opacity == null ? 0.2 : opacity,
    depthWrite: false, toneMapped: false,
  }));
}

function roundedSlabGeo(THREE, w, h, d, r) {
  const hw = w / 2, hd = d / 2;
  const rr = Math.min(r, hw - 0.02, hd - 0.02);
  const s = new THREE.Shape();
  s.moveTo(-hw + rr, -hd);
  s.lineTo(hw - rr, -hd);
  s.absarc(hw - rr, -hd + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - rr);
  s.absarc(hw - rr, hd - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(-hw + rr, hd);
  s.absarc(-hw + rr, hd - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + rr);
  s.absarc(-hw + rr, -hd + rr, rr, Math.PI, Math.PI * 1.5, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, h / 2, 0);
  return geo;
}

function coneGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.28, 0),
    new THREE.Vector2(0.28, 0.08),
    new THREE.Vector2(0.16, 0.12),
    new THREE.Vector2(0.04, 0.62),
    new THREE.Vector2(0.0, 0.64),
  ];
  return new THREE.LatheGeometry(pts, 10);
}

function canGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.11, 0),
    new THREE.Vector2(0.12, 0.04),
    new THREE.Vector2(0.12, 0.28),
    new THREE.Vector2(0.09, 0.32),
    new THREE.Vector2(0.0, 0.32),
  ];
  return new THREE.LatheGeometry(pts, 8);
}

function viseGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.16, 0),
    new THREE.Vector2(0.14, 0.12),
    new THREE.Vector2(0.08, 0.22),
    new THREE.Vector2(0.06, 0.38),
    new THREE.Vector2(0.0, 0.4),
  ];
  return new THREE.LatheGeometry(pts, 10);
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
  mesh.userData.garageArt = true;
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

function furnitureHit(x, z) {
  if (x < -6.6 && z < -1.4 && z > -14.6) return true;
  if (x < -6.6 && z > 6.2 && z < 10.4) return true;
  if (x > 1.1 && x < 7.2 && z > -11.4 && z < 0.6) return true;
  if (x > 7.4 && z > 2.8 && z < 13.2) return true;
  return false;
}

export function hideStockGarageMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.garageArt) return;
    if (o.parent && o.parent.name === 'garageArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    const t = o.geometry.type;
    const p = o.geometry.parameters || {};
    if (col === GARAGE_STOCK.car || col === GARAGE_STOCK.metal) {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (col === GARAGE_STOCK.tire && t === 'CylinderGeometry') {
      o.visible = false; o.userData.artHidden = true; n++;
      return;
    }
    if (col === GARAGE_STOCK.wood && t === 'BoxGeometry' && p.height > 1) {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

export function restyleGarageShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const wallTex = steelWallTex(THREE);
  const floorTex = oilFloorTex(THREE);
  const wallHex = hexNum(vibe.palette.facade);
  const ceilHex = hexNum(vibe.palette.facadeAlt);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.garageArt || (o.parent && o.parent.name === 'garageArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    const p = o.geometry && o.geometry.parameters || {};
    if (col === GARAGE_STOCK.wall) {
      m.color.setHex(wallHex);
      m.map = wallTex;
      m.roughness = 0.78;
      m.metalness = 0.18;
      m.emissive.setHex(hexNum(vibe.palette.neonA));
      m.emissiveIntensity = 0.04;
      skipMat(m); n++;
    } else if (col === GARAGE_STOCK.ceil) {
      m.color.setHex(ceilHex);
      m.emissive.setHex(hexNum(vibe.palette.neonA));
      m.emissiveIntensity = 0.08;
      m.roughness = 0.82;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === GARAGE_STOCK.floor)) {
      if (m.map && m.map !== floorTex && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = floorTex;
      m.color.setHex(0xffffff);
      m.roughness = 0.55;
      m.metalness = 0.08;
      m.emissive.setHex(hexNum(vibe.palette.neonB));
      m.emissiveIntensity = 0.03;
      skipMat(m); n++;
    } else if (col === GARAGE_STOCK.wood && t === 'BoxGeometry' && p.height < 1) {
      m.color.setHex(hexNum(vibe.palette.facade));
      m.emissive.setHex(hexNum(vibe.palette.neonB));
      m.emissiveIntensity = 0.12;
      m.roughness = 0.55;
      m.metalness = 0.32;
      skipMat(m); n++;
    }
  });
  return n;
}

function addWedgeCar(THREE, parent, mats) {
  const g = new THREE.Group();
  g.position.set(4.2, 0, -5.5);
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 8.4, 6, 12), mats.car);
  hull.rotation.x = Math.PI / 2;
  hull.position.set(0, 1.05, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.82, 12, 8), mats.car);
  nose.scale.set(1.15, 0.72, 1.35);
  nose.position.set(0, 0.95, -5.2);
  const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 3.6, 5, 10), mats.cabin);
  cabin.rotation.x = Math.PI / 2;
  cabin.position.set(0, 1.95, 0.4);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8), mats.glass);
  canopy.scale.set(1.4, 0.55, 1.8);
  canopy.position.set(0, 2.15, 0.2);
  g.add(hull, nose, cabin, canopy);
  for (const [x, z] of [[-1.85, -3.6], [1.85, -3.6], [-1.85, 3.2], [1.85, 3.2]]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 8, 14), mats.tire);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.42, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 8), mats.steel);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.42, z);
    g.add(wheel, hub);
  }
  g.traverse((o) => { o.userData.garageArt = true; o.castShadow = true; });
  parent.add(g);
  return g;
}

function addWorkbench(THREE, parent, mats) {
  const g = new THREE.Group();
  g.position.set(-8.4, 0, -8.0);
  const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 11.4, 5, 10), mats.steel);
  top.rotation.x = Math.PI / 2;
  top.scale.set(2.8, 1, 1);
  top.position.y = 2.58;
  const apron = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 11.2, 4, 8), mats.wood);
  apron.rotation.x = Math.PI / 2;
  apron.position.set(0, 2.32, 0);
  g.add(top, apron);
  for (const [x, z] of [[-0.85, -5.4], [0.85, -5.4], [-0.85, 5.4], [0.85, 5.4], [-0.85, 0], [0.85, 0]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 2.2, 4, 8), mats.sodium);
    leg.position.set(x, 1.15, z);
    g.add(leg);
  }
  const vise = new THREE.Mesh(viseGeo(THREE), mats.chest);
  vise.position.set(0.55, 2.72, -4.2);
  g.add(vise);
  const matRoll = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 1.4, 4, 8), mats.tube);
  matRoll.rotation.z = Math.PI / 2;
  matRoll.position.set(0, 2.78, 2.4);
  g.add(matRoll);
  g.traverse((o) => { o.userData.garageArt = true; });
  parent.add(g);
  return g;
}

function addToolChest(THREE, parent, mats) {
  const g = new THREE.Group();
  g.position.set(-8.3, 0, 8.2);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 1.35, 6, 12), mats.chest);
  body.scale.set(1.05, 1, 1.55);
  body.position.y = 1.52;
  const lid = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 2.4, 4, 8), mats.steel);
  lid.rotation.x = Math.PI / 2;
  lid.position.set(0, 3.12, 0);
  g.add(body, lid);
  for (const y of [0.7, 1.4, 2.1]) {
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.85, 3, 6), mats.steel);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.85, y, 0);
    g.add(handle);
  }
  g.traverse((o) => { o.userData.garageArt = true; });
  parent.add(g);
  return g;
}

function addRack(THREE, parent, mats, budget) {
  const g = new THREE.Group();
  g.position.set(8.6, 0, 8.0);
  const postGeo = new THREE.CapsuleGeometry(0.07, 5.4, 4, 6);
  for (const [x, z] of [[-0.65, -4.4], [0.65, -4.4], [-0.65, 4.4], [0.65, 4.4]]) {
    const p = new THREE.Mesh(postGeo, mats.steel);
    p.position.set(x, 2.8, z);
    g.add(p);
  }
  for (let i = 0; i < 4; i++) {
    const shelf = new THREE.Mesh(roundedSlabGeo(THREE, 1.5, 0.08, 9.4, 0.08), mats.steel);
    shelf.position.y = 1.1 + i * 1.25;
    g.add(shelf);
  }
  addInstanced(THREE, g, canGeo(THREE), mats.can, budget.cans, (d, i) => {
    const row = i % 4;
    const col = (i / 4) | 0;
    d.position.set(-0.35 + (i % 3) * 0.32, 1.2 + row * 1.25, -3.6 + (col % 6) * 1.15);
    d.rotation.y = i * 0.2;
    return true;
  });
  g.traverse((o) => { o.userData.garageArt = true; });
  parent.add(g);
  return g;
}

function addDoorAndTrim(THREE, parent, mats) {
  const alley = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 8.1), mats.alley);
  alley.position.set(0, 4.05, 21.15);
  alley.userData.garageArt = true;
  parent.add(alley);
  const jambL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 8.0, 4, 6), mats.sodium);
  jambL.position.set(-4.2, 4.1, 20.7);
  const jambR = jambL.clone();
  jambR.position.x = 4.2;
  const lintel = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 8.2, 4, 6), mats.tube);
  lintel.rotation.z = Math.PI / 2;
  lintel.position.set(0, 8.15, 20.7);
  for (const o of [jambL, jambR, lintel]) {
    o.userData.garageArt = true;
    o.userData.garageTube = true;
    parent.add(o);
  }
}

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const extras = new THREE.Group();
  extras.name = 'garageArtExtras';
  extras.userData.garageArt = true;

  const tubeGeo = new THREE.CapsuleGeometry(0.07, 4.6, 4, 8);
  const tubeZs = [-16, -10, -5, 0, 5, 10, 15, -18, -7, 3, 12, -13, 8, -2, 17, -8];
  addInstanced(THREE, extras, tubeGeo, mats.tube, budget.tubes, (d, i) => {
    d.position.set((i % 2 ? -5.8 : 5.8), 8.85, tubeZs[i % tubeZs.length]);
    d.rotation.x = Math.PI / 2;
    return true;
  });
  for (let i = 0; i < Math.min(4, budget.tubes); i++) {
    const tube = new THREE.Mesh(tubeGeo, i % 2 ? mats.sodium : mats.tube);
    tube.position.set(i % 2 ? -2.4 : 2.4, 8.7, -12 + i * 7);
    tube.rotation.x = Math.PI / 2;
    tube.userData.garageTube = true;
    tube.userData.garageArt = true;
    extras.add(tube);
    if (budget.glow) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 14), glowMat(THREE, i % 2 ? 0xffb347 : 0x2de2e6, 0.16));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(i % 2 ? -2.4 : 2.4, 0.03, -12 + i * 7);
      pool.userData.garageArt = true;
      extras.add(pool);
    }
  }

  const stripeGeo = new THREE.PlaneGeometry(0.22, 2.4);
  addInstanced(THREE, extras, stripeGeo, mats.stripe, budget.stripes, (d, i) => {
    const z = -16 + i * 2.6;
    if (furnitureHit(0, z)) return false;
    d.position.set(0, 0.025, z);
    d.rotation.x = -Math.PI / 2;
    return true;
  });

  addInstanced(THREE, extras, coneGeo(THREE), mats.cone, budget.cones, (d, i) => {
    const spots = [[-4.6, 14.2], [4.8, 14.6], [-4.4, -15.5], [4.6, -15.2], [-3.8, 3.2], [3.6, 4.0], [-4.2, -3.4], [3.8, -6.2], [0.8, 18.4], [-1.2, -18.2]];
    const s = spots[i % spots.length];
    if (furnitureHit(s[0], s[1])) return false;
    if (!propClearOfCourse(s[0], s[1], 0.3, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0, s[1]);
    return true;
  });

  const toolGeo = new THREE.CapsuleGeometry(0.035, 0.55, 3, 6);
  addInstanced(THREE, extras, toolGeo, mats.tool, budget.tools, (d, i) => {
    d.position.set(-10.15, 3.1 + (i % 5) * 0.42, -12 + ((i * 1.1) % 10));
    d.rotation.set(0, 0, (i % 2 ? 0.4 : -0.3));
    return true;
  });

  if (budget.puddles > 0) {
    const pudGeo = new THREE.CircleGeometry(0.55, 12);
    addInstanced(THREE, extras, pudGeo, mats.puddle, budget.puddles, (d, i) => {
      const spots = [[-2.2, 8.4], [1.8, 5.2], [-1.4, -2.6], [2.4, -8.8], [0.6, 12.2], [-2.8, -12.4], [1.2, -15.6], [-0.8, 2.2], [2.0, 16.4], [-1.6, 18.0]];
      const s = spots[i % spots.length];
      if (furnitureHit(s[0], s[1])) return false;
      d.position.set(s[0], 0.02, s[1]);
      d.rotation.x = -Math.PI / 2;
      d.scale.set(1 + (i % 3) * 0.25, 1, 0.7 + (i % 2) * 0.3);
      return true;
    });
  }

  if (budget.sparks) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), emitMat(THREE, 0xffe08a, 4.2));
    spark.position.set(-7.6, 2.85, -4.2);
    spark.userData.garageSpark = true;
    spark.userData.garageArt = true;
    extras.add(spark);
  }

  const cord = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 6.5, 3, 6), mats.chest);
  cord.rotation.z = 0.18;
  cord.position.set(-4.2, 0.08, -2.4);
  cord.rotation.x = Math.PI / 2;
  cord.userData.garageArt = true;
  extras.add(cord);
  const jack = new THREE.Mesh(viseGeo(THREE), mats.steel);
  jack.scale.set(1.6, 1.8, 1.6);
  jack.position.set(1.6, 0, -10.6);
  jack.userData.garageArt = true;
  extras.add(jack);
  const creeper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.6, 4, 8), mats.chest);
  creeper.rotation.x = Math.PI / 2;
  creeper.scale.set(1.8, 1, 1);
  creeper.position.set(-2.6, 0.12, 1.4);
  creeper.userData.garageArt = true;
  extras.add(creeper);
  const backTube = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 8.5, 4, 8), mats.sodium);
  backTube.rotation.z = Math.PI / 2;
  backTube.position.set(0, 6.8, -20.6);
  backTube.userData.garageTube = true;
  backTube.userData.garageArt = true;
  extras.add(backTube);

  parent.add(extras);
  return extras;
}

function makeGarageMats(THREE, vibe) {
  return {
    steel: steelMat(THREE, hexNum(vibe.palette.facade)),
    wood: steelMat(THREE, hexNum('#4a3224'), { metalness: 0.08, roughness: 0.82 }),
    car: steelMat(THREE, hexNum('#1a2430'), {
      emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.16, roughness: 0.38, metalness: 0.22,
    }),
    cabin: steelMat(THREE, hexNum('#243040'), { roughness: 0.42, metalness: 0.18 }),
    glass: skipMat(new THREE.MeshStandardMaterial({
      color: hexNum(vibe.palette.neonB), emissive: hexNum(vibe.palette.neonB),
      emissiveIntensity: 0.35, transparent: true, opacity: 0.45, roughness: 0.2, metalness: 0.1,
    })),
    tire: steelMat(THREE, 0x141414, { roughness: 0.9, metalness: 0.02 }),
    chest: steelMat(THREE, hexNum(vibe.palette.neonC), {
      emissive: hexNum(vibe.palette.neonC), emissiveIntensity: 0.18, roughness: 0.55,
    }),
    tube: emitMat(THREE, hexNum(vibe.palette.neonB), 3.2),
    sodium: emitMat(THREE, hexNum(vibe.palette.neonA), 3.0),
    can: steelMat(THREE, hexNum(vibe.palette.neonA), { emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.22 }),
    cone: steelMat(THREE, hexNum(vibe.palette.neonA), { emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.35 }),
    tool: steelMat(THREE, hexNum(vibe.palette.neonB), { metalness: 0.4, roughness: 0.4 }),
    stripe: glowMat(THREE, 0xffb347, 0.55),
    puddle: glowMat(THREE, 0x2de2e6, 0.18),
    alley: skipMat(new THREE.MeshBasicMaterial({
      map: alleyTex(THREE), toneMapped: false, fog: true,
    })),
  };
}

export function buildVoltStall(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'garageArtVisuals';
  group.userData.garageArt = true;
  const budget = garageBudget(quality);
  const mats = makeGarageMats(THREE, vibe);
  addDoorAndTrim(THREE, group, mats);
  addWedgeCar(THREE, group, mats);
  addWorkbench(THREE, group, mats);
  addToolChest(THREE, group, mats);
  addRack(THREE, group, mats, budget);
  addWhoopLife(THREE, group, mats, budget, gates || GARAGE_KEEP_GATES);
  parent.add(group);
  return group;
}

export function decorateGarageGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 5.2;
  const bar = skipMat(new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: emit, roughness: 0.32, metalness: 0.12,
  }));
  const t = size * 0.07, s = size * 1.12;
  const extras = [];
  const top = new THREE.Mesh(new THREE.BoxGeometry(s * 2, t, t), bar);
  top.position.y = s;
  const bot = top.clone(); bot.position.y = -s;
  const right = new THREE.Mesh(new THREE.BoxGeometry(t, s * 2, t), bar);
  right.position.x = s;
  const left = right.clone(); left.position.x = -s;
  extras.push(top, bot, right, left);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const pip = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.07, 6, 5),
      emitMat(THREE, hexNum(vibe.palette.gateB), emit * 0.8),
    );
    pip.position.set(Math.cos(a) * s, Math.sin(a) * s, 0);
    extras.push(pip);
  }
  const halo = extras[0];
  ring.add(halo);
  ring.userData.artHalo = halo;
  ring.userData.artStyle = 'square-neon';
  for (let i = 1; i < extras.length; i++) {
    extras[i].castShadow = extras[i].receiveShadow = false;
    ring.add(extras[i]);
  }
  ring.userData.artExtras = extras.slice(1);
  return halo;
}

export function pulseGarageGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 5.2;
  if (isNext) {
    col = 0xffffff;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 7) + pulse * 1.6;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.04);
  } else if (passed) {
    col = 0x2de2e6;
    emit = 2.4;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickGarageArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  root.traverse((o) => {
    try {
      tickGarageArtObject(o, t);
    } catch (e) { /* never abort the FPV render loop */ }
  });
}

function tickGarageArtObject(o, t) {
  if (o.userData && o.userData.garageTube && o.material) {
    const flicker = 2.6 + 0.7 * (0.5 + 0.5 * Math.sin(t * 11.0 + (o.position.z || 0)));
    o.material.emissiveIntensity = flicker;
  }
  if (o.userData && o.userData.garageSpark && o.material) {
    o.material.emissiveIntensity = Math.sin(t * 18.0) > 0.35 ? 5.5 : 0.4;
    o.scale.setScalar(0.7 + 0.6 * Math.max(0, Math.sin(t * 18.0)));
  }
}

export function restyleGarage(THREE, ctx) {
  try {
    return restyleGarageInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleGarage', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleGarageInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockGarageMeshes(root);
  restyleGarageShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('garageArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildVoltStall(THREE, root, vibe, quality, ctx.gates || GARAGE_KEEP_GATES);
  }
  if (root) root.userData.garageArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
