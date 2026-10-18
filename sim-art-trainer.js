// Licorice Grid — original trainer vibe. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.
// Night meet floor, candy tape, gummy PVC frames, candy-torus gates.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=c235d936652f';

export const TRAINER_STOCK = Object.freeze({
  wall: 0xc8c4ba,
  ceil: 0xddd8ce,
  floor: 0x8a8680,
  wood: 0x6a4e32,
  pvc: 0xf2f0ea,
  tape: 0xc45a22,
  dark: 0x2a2c32,
});

export const TRAINER_KEEP_GATES = Object.freeze([
  { x: 0.0, y: 2.2, z: 10.0, size: 1.8 },
  { x: -6.0, y: 2.2, z: 3.6, size: 1.7 },
  { x: -6.0, y: 2.2, z: -3.6, size: 1.7 },
  { x: 0.0, y: 2.2, z: -8.4, size: 1.8 },
  { x: 6.0, y: 2.2, z: -3.6, size: 1.7 },
  { x: 6.0, y: 2.2, z: 3.6, size: 1.7 },
  { x: 0.0, y: 2.2, z: 5.2, size: 1.8 },
]);

export function trainerWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function trainerBudget(applied) {
  if (applied === 'low') {
    return { cones: 4, bulbs: 3, frames: 2, candy: 8, glow: false, sparks: false };
  }
  if (applied === 'high') {
    return { cones: 10, bulbs: 8, frames: 4, candy: 16, glow: true, sparks: true };
  }
  return { cones: 7, bulbs: 6, frames: 3, candy: 12, glow: true, sparks: true };
}

function skipMat(m) {
  if (!m) return m;
  m.userData.looksSkip = true;
  m.userData.artLocked = true;
  return m;
}

function canvasTex(THREE, w, h, paint, rx, ry) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  try { paint(g, w, h); } catch (e) {
    if (g) { g.fillStyle = '#1a1020'; g.fillRect(0, 0, w, h); }
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

function licoriceFloorTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = '#1a1020';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1830';
    for (let y = 0; y < h; y += 28) g.fillRect(0, y, w, 12);
    g.fillStyle = '#ff4d8d';
    g.globalAlpha = 0.55;
    g.fillRect(0, h * 0.48, w, 5);
    g.globalAlpha = 1;
    g.fillStyle = '#00e5ff';
    g.globalAlpha = 0.28;
    g.fillRect(w * 0.48, 0, 4, h);
    g.globalAlpha = 1;
  }, 4, 6);
}

function nightWallTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#2a1830';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,77,141,0.10)';
    for (let y = 18; y < h; y += 24) g.fillRect(0, y, w, 2);
  }, 6, 4);
}

function clayMat(THREE, hex, extras) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.78, metalness: 0.04, envMapIntensity: 0.12,
  }, extras || {})));
}

function emitMat(THREE, hex, emit) {
  return skipMat(new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: emit == null ? 2.2 : emit,
    roughness: 0.4, metalness: 0.06, envMapIntensity: 0.1,
  }));
}

function glowMat(THREE, hex, opacity) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: opacity == null ? 0.4 : opacity,
    depthWrite: false, toneMapped: false,
  }));
}

function coneGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.22, 0),
    new THREE.Vector2(0.22, 0.06),
    new THREE.Vector2(0.12, 0.1),
    new THREE.Vector2(0.03, 0.48),
    new THREE.Vector2(0.0, 0.5),
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
  mesh.userData.trainerArt = true;
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

export function hideStockTrainerMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.trainerArt) return;
    if (o.parent && o.parent.name === 'trainerArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    if (col === TRAINER_STOCK.wood || col === TRAINER_STOCK.pvc || col === TRAINER_STOCK.dark) {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

export function restyleTrainerShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const wallTex = nightWallTex(THREE);
  const floorTex = licoriceFloorTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.trainerArt || (o.parent && o.parent.name === 'trainerArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === TRAINER_STOCK.wall) {
      m.color.setHex(0x2a1830);
      m.map = wallTex;
      m.emissive.setHex(0xff4d8d);
      m.emissiveIntensity = 0.06;
      skipMat(m); n++;
    } else if (col === TRAINER_STOCK.ceil) {
      m.color.setHex(0x1a1020);
      m.emissive.setHex(0xffe08a);
      m.emissiveIntensity = 0.08;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === TRAINER_STOCK.floor)) {
      if (m.map && m.map !== floorTex && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = floorTex;
      m.color.setHex(0xffffff);
      m.roughness = 0.72;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      skipMat(m); n++;
    } else if (col === TRAINER_STOCK.tape) {
      m.color.setHex(0xff4d8d);
      m.emissive.setHex(0xff4d8d);
      m.emissiveIntensity = 1.8;
      skipMat(m); n++;
    }
  });
  return n;
}

function makeTrainerMats(THREE, vibe) {
  return {
    bench: clayMat(THREE, 0x4a2a38, { emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.12 }),
    pvc: clayMat(THREE, 0xf2f0ea),
    crate: clayMat(THREE, 0x2a2c32, { emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.1 }),
    candy: glowMat(THREE, hexNum(vibe.palette.neonA), 0.7),
    ice: glowMat(THREE, hexNum(vibe.palette.neonB), 0.55),
    cone: clayMat(THREE, hexNum(vibe.palette.neonA), {
      emissive: hexNum(vibe.palette.neonA), emissiveIntensity: 0.35,
    }),
    bulb: emitMat(THREE, hexNum(vibe.palette.neonC), 2.8),
    gummy: emitMat(THREE, hexNum(vibe.palette.neonA), 1.6),
  };
}

function addBenchAndCrate(THREE, parent, mats) {
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.1, 8.3), mats.bench);
  bench.position.set(-12.2, 0.55, 0);
  bench.userData.trainerArt = true;
  parent.add(bench);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.15, 3.1), mats.crate);
  crate.position.set(12.2, 1.08, -12.4);
  crate.userData.trainerArt = true;
  parent.add(crate);
}

function addGummyFrames(THREE, parent, mats, budget) {
  const spots = [[-12.2, -2.4], [-12.2, 1.2], [-12.2, 3.4], [-12.2, -4.6]];
  for (let i = 0; i < budget.frames; i++) {
    const s = spots[i];
    if (!s) continue;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 8, 18), mats.gummy);
    hoop.position.set(s[0], 2.05, s[1]);
    hoop.rotation.y = Math.PI / 2;
    hoop.userData.trainerArt = true;
    hoop.userData.trainerFrame = true;
    parent.add(hoop);
    const post = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 1.6, 3, 6), mats.pvc);
    post.position.set(s[0], 1.95, s[1] - 0.7);
    post.userData.trainerArt = true;
    parent.add(post);
  }
}

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const extras = new THREE.Group();
  extras.name = 'trainerArtExtras';
  extras.userData.trainerArt = true;
  const tapeH = new THREE.BoxGeometry(18, 0.04, 0.16);
  addInstanced(THREE, extras, tapeH, mats.candy, 3, (d, i) => {
    d.position.set(0, 0.04, -10 + i * 10);
    return true;
  });
  const tapeV = new THREE.BoxGeometry(0.16, 0.04, 24);
  addInstanced(THREE, extras, tapeV, mats.ice, 3, (d, i) => {
    d.position.set(-6 + i * 6, 0.045, 0);
    return true;
  });
  const coneSpots = [
    [-8.4, 14.2], [8.4, 14.0], [-8.6, -14.2], [8.2, -14.0],
    [-10.6, 8.4], [10.4, 8.2], [-10.2, -8.6], [10.6, -8.2],
    [0.8, 16.2], [-1.0, -16.0],
  ];
  addInstanced(THREE, extras, coneGeo(THREE), mats.cone, budget.cones, (d, i) => {
    const s = coneSpots[i % coneSpots.length];
    if (!propClearOfCourse(s[0], s[1], 0.24, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0, s[1]);
    return true;
  });
  const candy = new THREE.SphereGeometry(0.09, 8, 6);
  addInstanced(THREE, extras, candy, mats.gummy, budget.candy, (d, i) => {
    d.position.set(-10.8 + (i % 5) * 0.28, 1.28, -3.2 + ((i / 5) | 0) * 1.4);
    return true;
  });
  addInstanced(THREE, extras, new THREE.SphereGeometry(0.16, 8, 6), mats.bulb, budget.bulbs, (d, i) => {
    const x = -8 + (i % 4) * 5.2;
    const z = -12 + ((i / 4) | 0) * 10;
    if (Math.abs(x) < 0.4 && Math.abs(z) < 0.4) return false;
    d.position.set(x, 9.55, z);
    return true;
  });
  if (budget.glow) {
    for (const z of [-10, 0, 10]) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 14), glowMat(THREE, 0xff4d8d, 0.12));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.03, z);
      pool.userData.trainerArt = true;
      extras.add(pool);
    }
  }
  if (budget.sparks) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), emitMat(THREE, 0xffe08a, 3.8));
    spark.position.set(-10.6, 2.2, 0.4);
    spark.userData.trainerSpark = true;
    spark.userData.trainerArt = true;
    extras.add(spark);
  }
  const bulbTick = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mats.bulb);
  bulbTick.position.set(0, 9.55, 8);
  bulbTick.userData.trainerBulb = true;
  bulbTick.userData.trainerArt = true;
  extras.add(bulbTick);
  parent.add(extras);
}

export function buildLicoriceGrid(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'trainerArtVisuals';
  group.userData.trainerArt = true;
  const budget = trainerBudget(quality);
  const mats = makeTrainerMats(THREE, vibe);
  addBenchAndCrate(THREE, group, mats);
  addGummyFrames(THREE, group, mats, budget);
  addWhoopLife(THREE, group, mats, budget, gates || TRAINER_KEEP_GATES);
  parent.add(group);
  return group;
}

export function decorateTrainerGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 4.4;
  if (ring.material) {
    ring.material.color.setHex(col);
    ring.material.emissive.setHex(col);
    ring.material.emissiveIntensity = emit * 0.5;
    skipMat(ring.material);
  }
  const candy = new THREE.Mesh(new THREE.TorusGeometry(size * 1.04, size * 0.12, 8, 22), emitMat(THREE, col, emit));
  ring.add(candy);
  ring.userData.artHalo = candy;
  ring.userData.artStyle = 'candy-torus';
  const pips = [];
  for (let i = 0; i < 6; i++) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(size * 0.07, 6, 5), emitMat(THREE, hexNum(vibe.palette.neonC), emit));
    const a = i * Math.PI / 3;
    pip.position.set(Math.cos(a) * size * 1.04, Math.sin(a) * size * 1.04, 0);
    ring.add(pip);
    pips.push(pip);
  }
  ring.userData.artExtras = pips;
  return candy;
}

export function pulseTrainerGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 4.4;
  if (isNext) {
    col = 0x00e5ff;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 6) + pulse;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.04);
  } else if (passed) {
    col = 0xffe08a;
    emit = 2.2;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickTrainerArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  root.traverse((o) => {
    try {
      tickTrainerArtObject(o, t);
    } catch (e) { /* never abort the FPV render loop */ }
  });
}

function tickTrainerArtObject(o, t) {
  if (o.userData && o.userData.trainerBulb && o.material) {
    o.material.emissiveIntensity = 2.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 4.2));
  }
  if (o.userData && o.userData.trainerSpark) {
    o.scale.setScalar(0.8 + 0.4 * (0.5 + 0.5 * Math.sin(t * 7)));
  }
  if (o.userData && o.userData.trainerFrame) {
    o.rotation.z = Math.sin(t * 0.8) * 0.04;
  }
}

export function restyleTrainer(THREE, ctx) {
  try {
    return restyleTrainerInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleTrainer', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleTrainerInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockTrainerMeshes(root);
  restyleTrainerShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('trainerArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildLicoriceGrid(THREE, root, vibe, quality, ctx.gates || TRAINER_KEEP_GATES);
  }
  if (root) root.userData.trainerArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
