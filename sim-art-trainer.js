// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Licorice Grid — original trainer vibe. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.
// Night meet floor, candy tape, gummy PVC frames, candy-torus gates.

import { hexNum, propClearOfCourse, disposeArtGroup, swapOwnedMap } from './sim-art-city.js?v=60afda68c1d2';

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
    return {
      cones: 4, bulbs: 3, frames: 2, candy: 8, glow: false, sparks: false,
      stools: 4, rolls: 6, posters: 2, strings: 4, chairs: 4,
    };
  }
  if (applied === 'high') {
    return {
      cones: 10, bulbs: 8, frames: 4, candy: 16, glow: true, sparks: true,
      stools: 8, rolls: 12, posters: 4, strings: 8, chairs: 8,
    };
  }
  return {
    cones: 7, bulbs: 6, frames: 3, candy: 12, glow: true, sparks: true,
    stools: 6, rolls: 10, posters: 3, strings: 6, chairs: 6,
  };
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
    fillGrad(g, 0, 0, 0, h, [[0, '#120c18'], [0.5, '#1a1020'], [1, '#0e0812']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1830';
    for (let y = 0; y < h; y += 26) g.fillRect(0, y, w, 10);
    g.fillStyle = '#ff4d8d';
    g.globalAlpha = 0.7;
    g.fillRect(0, h * 0.48, w, 6);
    g.globalAlpha = 1;
    g.fillStyle = '#00e5ff';
    g.globalAlpha = 0.38;
    g.fillRect(w * 0.47, 0, 5, h);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      g.arc((i * 41) % w, (i * 67) % h, 8 + (i % 5), 0, 6.3);
      g.fill();
    }
  }, 4, 6);
}

function nightWallTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#120818'], [0.4, '#2a1830'], [1, '#3a2040']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, 20);
    g.fillStyle = 'rgba(255,77,141,0.14)';
    for (let y = 18; y < h; y += 22) g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(0,229,255,0.08)';
    g.fillRect(0, 70, w, 3);
  }, 6, 4);
}

function nightCeilTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#0c0810'], [1, '#1a1020']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,77,141,0.18)';
    g.lineWidth = 2;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = 'rgba(255,224,138,0.08)';
    g.fillRect(18, 18, w - 36, h - 36);
  }, 8, 6);
}

function meetSignTex(THREE) {
  return canvasTex(THREE, 256, 96, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#120818'], [1, '#1a1020']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#00e5ff';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ff4d8d';
    g.font = 'bold 46px sans-serif';
    g.textAlign = 'center';
    g.fillText('MEET', w * 0.5, 64);
    g.fillStyle = '#ffe08a';
    g.fillRect(32, h - 18, w - 64, 4);
  }, 1, 1);
}

function flyerTex(THREE, pink) {
  return canvasTex(THREE, 64, 96, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, pink
      ? [[0, '#ff4d8d'], [1, '#2a1830']]
      : [[0, '#00e5ff'], [1, '#1a1020']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe08a';
    g.fillRect(8, 12, w - 16, 10);
    g.fillRect(10, 36, w - 20, 40);
  }, 1, 1);
}

function tapeRollGeo(THREE) {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.28, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.12, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 10 });
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
  const ceilTex = nightCeilTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.trainerArt || (o.parent && o.parent.name === 'trainerArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === TRAINER_STOCK.wall) {
      m.color.setHex(0x2a1830);
      swapOwnedMap(m, wallTex);
      m.emissive.setHex(0xff4d8d);
      m.emissiveIntensity = 0.06;
      skipMat(m); n++;
    } else if (col === TRAINER_STOCK.ceil) {
      m.color.setHex(0xffffff);
      swapOwnedMap(m, ceilTex);
      m.emissive.setHex(0xffe08a);
      m.emissiveIntensity = 0.1;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === TRAINER_STOCK.floor)) {
      swapOwnedMap(m, floorTex);
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
    sign: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: meetSignTex(THREE), toneMapped: false,
    })),
    flyerA: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: flyerTex(THREE, true), toneMapped: false,
    })),
    flyerB: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: flyerTex(THREE, false), toneMapped: false,
    })),
    stool: clayMat(THREE, 0x3a2438, { roughness: 0.7 }),
    roll: emitMat(THREE, hexNum(vibe.palette.neonA), 1.1),
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
  addInstanced(THREE, extras, new THREE.CylinderGeometry(0.18, 0.22, 0.42, 8), mats.stool, budget.stools, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 9.2, 0.22, -8 + ((i / 2) | 0) * 4.6);
    return true;
  });
  addInstanced(THREE, extras, tapeRollGeo(THREE), mats.roll, budget.rolls, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 9.6, 0.16, 10.4 - ((i / 2) | 0) * 3.4);
    d.rotation.y = i * 0.4;
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.42, 0.85, 0.42), mats.stool, budget.chairs, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 10.4, 0.42, -12 + ((i / 2) | 0) * 5.2);
    return true;
  });
  addInstanced(THREE, extras, new THREE.PlaneGeometry(1.35, 1.9), mats.flyerA, budget.posters, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 13.55, 4.2, -8 + ((i / 2) | 0) * 8);
    d.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    return true;
  });
  addInstanced(THREE, extras, new THREE.CapsuleGeometry(0.04, 6.4, 3, 6), mats.ice, budget.strings, (d, i) => {
    d.position.set(-9 + (i % 4) * 6, 9.35, -6 + ((i / 4) | 0) * 10);
    d.rotation.z = Math.PI / 2;
    return true;
  });
  parent.add(extras);
}

function addHeroMeetSign(THREE, parent, mats) {
  const hero = new THREE.Group();
  hero.name = 'trainerArtHero';
  hero.userData.trainerArt = true;
  const cable = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 3.2, 3, 6), mats.pvc);
  cable.position.set(-1.7, 8.1, 5.2);
  hero.add(cable);
  const cable2 = cable.clone();
  cable2.position.x = 1.7;
  hero.add(cable2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.55, 0.16), mats.crate);
  body.position.set(0, 6.15, 5.2);
  hero.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.3, 0.06), mats.sign);
  face.position.set(0, 6.15, 5.08);
  face.userData.trainerSign = true;
  hero.add(face);
  const faceBack = face.clone();
  faceBack.position.z = 5.32;
  faceBack.rotation.y = Math.PI;
  hero.add(faceBack);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.08, 0.2), mats.gummy);
  rim.position.set(0, 5.32, 5.2);
  rim.userData.trainerFrame = true;
  hero.add(rim);
  const roll = new THREE.Mesh(tapeRollGeo(THREE), mats.roll);
  roll.position.set(2.6, 5.55, 5.05);
  roll.scale.set(1.8, 1.8, 1.8);
  hero.add(roll);
  hero.traverse((o) => { o.userData.trainerArt = true; });
  parent.add(hero);
}

function addSecretDressing(THREE, parent, mats) {
  const attic = new THREE.Mesh(tapeRollGeo(THREE), mats.roll);
  attic.position.set(-12.0, 9.2, 0);
  attic.scale.set(2.2, 2.2, 2.2);
  attic.userData.trainerArt = true;
  parent.add(attic);
  const attic2 = attic.clone();
  attic2.position.set(-11.55, 9.2, 0.35);
  parent.add(attic2);
  const atticGlow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.1), glowMat(THREE, 0xff4d8d, 0.3));
  atticGlow.position.set(-12.0, 9.05, 0);
  atticGlow.userData.trainerArt = true;
  parent.add(atticGlow);
  const cubby = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.7), mats.crate);
  cubby.position.set(12.9, 0.42, -15.35);
  cubby.userData.trainerArt = true;
  parent.add(cubby);
  const sticky = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mats.gummy);
  sticky.position.set(12.9, 0.9, -15.35);
  sticky.userData.trainerSpark = true;
  sticky.userData.trainerArt = true;
  parent.add(sticky);
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
  addHeroMeetSign(THREE, group, mats);
  addSecretDressing(THREE, group, mats);
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
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.trainerBulb || u.trainerSpark || u.trainerFrame || u.trainerSign) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickTrainerArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
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
  if (o.userData && o.userData.trainerSign) {
    o.rotation.z = Math.sin(t * 0.5) * 0.035;
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
    if (old) disposeArtGroup(old);
    visuals = buildLicoriceGrid(THREE, root, vibe, quality, ctx.gates || TRAINER_KEEP_GATES);
  }
  if (root) root.userData.trainerArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
