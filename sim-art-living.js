// Clay Parlor — Felt Scale reference + whoop playground + Kenney CC0 parlor kit.
// Colliders live in sim-maps.js LIVING_PLAY and must match kit/proc meshes.
// Kenney kit (sim-art-kit.js) swaps wall clutter after first paint.
// Procedural meshes stay if a mesh fails. Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=d290c9ab2bdb';
import { applyFeltMaterial, feltBasic, feltEmissive } from './sim-art-felt.js?v=f76fc4f752df';
import { LIVING_PLAY } from './sim-maps.js?v=9b5e706b9457';

export const LIVING_STOCK = Object.freeze({
  sofa: 0x4a5a6a,
  cushion: 0xc45a3a,
  dark: 0x2a2c32,
  lamp: 0xe8d9a8,
  wood: 0x7a5130,
  wall: 0xd8cfc4,
  ceil: 0xe8e2d8,
});

export const LIVING_KEEP_GATES = Object.freeze([
  { x: 0, y: 2.3, z: 11.2, size: 1.9 },
  { x: -6.4, y: 2.2, z: -7.8, size: 1.8 },
  { x: 0.0, y: 3.8, z: -12.2, size: 1.7 },
  { x: 6.4, y: 2.2, z: -7.8, size: 1.8 },
  { x: 0.0, y: 3.5, z: -5.8, size: 1.7 },
  { x: 6.6, y: 2.4, z: 0.4, size: 1.8 },
  { x: -6.2, y: 2.2, z: -1.6, size: 1.8 },
  { x: 0.0, y: 2.3, z: 7.4, size: 1.9 },
  { x: 4.2, y: 2.2, z: 8.2, size: 1.8 },
  { x: 7.0, y: 4.6, z: 2.2, size: 1.7 },
  { x: 4.4, y: 2.0, z: -8.2, size: 1.8 },
  { x: -4.2, y: 2.2, z: -10.2, size: 1.7 },
  { x: -7.0, y: 5.0, z: -1.8, size: 1.7 },
  { x: -3.2, y: 1.55, z: 4.2, size: 1.6 },
  { x: 2.8, y: 2.5, z: 6.0, size: 1.8 },
  { x: 0.0, y: 2.70, z: -8.2, size: 1.7 },
  { x: 0.0, y: 0.62, z: -5.9, size: 1.5 },
  { x: 0.0, y: 0.62, z: -10.6, size: 1.5 },
  { x: 7.3, y: 1.42, z: 9.8, size: 1.5 },
  { x: 0.0, y: 7.40, z: 0.0, size: 1.6 },
]);

export function planLivingKit() {
  return {
    cardboard: [
      { x: 9.4, z: 12.4 }, { x: -9.4, z: 12.2 }, { x: 9.2, z: -12.6 },
      { x: -9.6, z: -12.4 }, { x: 9.5, z: 6.4 }, { x: -9.3, z: -8.2 },
    ],
    crates: [
      { x: 9.3, z: 8.8 }, { x: -9.5, z: 9.2 }, { x: 9.1, z: -8.6 },
      { x: -9.2, z: 2.4 }, { x: 9.6, z: -4.2 },
    ],
    toolboxes: [
      { x: 9.4, z: 3.2, ry: 1.57 }, { x: -9.4, z: -2.8, ry: -1.57 },
      { x: 9.2, z: 11.2, ry: 3.14 },
    ],
  };
}

const ROOM = Object.freeze({ w: 21, d: 28, h: 9.1 });

export function livingWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function livingBudget(applied) {
  if (applied === 'low') {
    return {
      books: 18, frames: 4, lanterns: 0, beads: 0, toys: 4,
      steam: false, glow: false, screen: false, plants: 2,
      posters: 3, mags: 4, candles: 2,
    };
  }
  if (applied === 'high') {
    return {
      books: 48, frames: 10, lanterns: 8, beads: 22, toys: 10,
      steam: true, glow: true, screen: true, plants: 4,
      posters: 5, mags: 8, candles: 4,
    };
  }
  return {
    books: 36, frames: 8, lanterns: 6, beads: 16, toys: 8,
    steam: true, glow: true, screen: true, plants: 3,
    posters: 4, mags: 6, candles: 3,
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
    if (g) { g.fillStyle = '#f4d6c6'; g.fillRect(0, 0, w, h); }
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

function ceilTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#efe0d0'], [1, '#e0d2c2']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(107,63,42,0.1)';
    g.lineWidth = 2;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = 'rgba(255,224,138,0.1)';
    g.fillRect(18, 18, w - 36, h - 36);
  }, 8, 6);
}

function parlorSignTex(THREE) {
  return canvasTex(THREE, 256, 96, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#ff6b9a'], [0.5, '#ffe08a'], [1, '#7ec8e3']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#6b3f2a';
    g.fillRect(0, 0, w, 7);
    g.fillRect(0, h - 7, w, 7);
    g.fillRect(0, 0, 7, h);
    g.fillRect(w - 7, 0, 7, h);
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('CLAY', w * 0.5, h * 0.55);
  }, 1, 1);
}

function plasterTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#f8e0d2'], [0.7, '#f4d6c6'], [1, '#e8c4b0']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = `rgba(236,196,176,${0.08 + (i % 5) * 0.03})`;
      g.beginPath();
      g.arc((i * 17) % w, (i * 29) % h, 6 + (i % 7), 0, 6.3);
      g.fill();
    }
    g.fillStyle = 'rgba(110,70,50,0.05)';
    for (let y = 8; y < h; y += 18) g.fillRect(0, y, w, 1);
  }, 4, 3);
}

function walnutTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#6b3f2a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = y % 16 === 0 ? '#7a4a32' : '#5c3522';
      g.fillRect(0, y, w, 7);
      g.fillStyle = 'rgba(40,18,10,0.18)';
      g.fillRect(0, y + 6, w, 1);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(30,12,6,${0.06 + (i % 4) * 0.03})`;
      g.fillRect((i * 13) % w, (i * 19) % h, 18, 2);
    }
  }, 8, 10);
}

function rugTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#e8c4b0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff6b9a';
    g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#7ec8e3';
    for (let y = 16; y < h - 16; y += 12) {
      for (let x = 16; x < w - 16; x += 12) {
        g.fillRect(x, y, 6, 6);
      }
    }
    g.fillStyle = '#ffe08a';
    g.fillRect(20, 20, w - 40, 6);
    g.fillRect(20, h - 26, w - 40, 6);
  }, 1, 1);
}

function skyTex(THREE) {
  return canvasTex(THREE, 128, 160, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [
      [0, '#7ec8e3'], [0.55, '#b8e4f2'], [1, '#f4d6c6'],
    ]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,224,138,0.55)';
    g.beginPath();
    g.arc(w * 0.72, h * 0.22, 18, 0, 6.3);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(28, 40, 16, 0, 6.3);
    g.arc(48, 36, 12, 0, 6.3);
    g.fill();
  }, 1, 1);
}

function feltScreenTex(THREE) {
  return canvasTex(THREE, 128, 80, (g, w, h) => {
    g.fillStyle = '#2a4050';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#7ec8e3' : '#ff6b9a';
      g.globalAlpha = 0.35;
      g.fillRect(i * 14 - 8, 8, 18, h - 16);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffe08a';
    g.fillRect(0, h * 0.62, w, 8);
  }, 1, 1);
}

function feltNapTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#e8c4b0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      const x = (i * 19) % w;
      const y = (i * 37) % h;
      g.fillStyle = i % 3 === 0 ? 'rgba(255,224,138,0.16)' : 'rgba(107,63,42,0.10)';
      g.fillRect(x, y, 2, 3);
    }
    g.strokeStyle = 'rgba(107,63,42,0.08)';
    g.lineWidth = 1;
    for (let y = 4; y < h; y += 8) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + 1);
      g.stroke();
    }
  }, 3, 2);
}

function clayMat(THREE, hex, extras) {
  const e = extras || {};
  const opts = {};
  if (e.map) opts.map = e.map;
  if (e.transparent != null) opts.transparent = e.transparent;
  if (e.opacity != null) opts.opacity = e.opacity;
  return feltBasic(THREE, e.emissive != null ? e.emissive : hex, opts);
}

function gummyMat(THREE, hex) {
  return feltBasic(THREE, hex, {
    transparent: true,
    opacity: 0.92,
  });
}

function glowMat(THREE, hex) {
  const m = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    toneMapped: false,
  });
  return skipMat(m);
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
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
  if (Math.abs(x) < 4.1 && z < -8.8 && z > -13.2) return true;
  if (Math.abs(x) < 2.2 && z < -4.7 && z > -7.2) return true;
  if (x > 7.2) return true;
  if (x < -5.5 && z < -2.2 && z > -5.4) return true;
  if (Math.hypot(x + 6.2, z - 8.2) < 1.1) return true;
  return false;
}

export function hideStockLivingMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.livingArt) return;
    if (o.parent && o.parent.name === 'livingArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    const t = o.geometry.type;
    if (col === LIVING_STOCK.sofa || col === LIVING_STOCK.cushion
      || col === LIVING_STOCK.dark || col === LIVING_STOCK.lamp) {
      o.visible = false;
      o.userData.artHidden = true;
      n++;
      return;
    }
    if (col === LIVING_STOCK.wood && t === 'BoxGeometry') {
      o.visible = false;
      o.userData.artHidden = true;
      n++;
    }
  });
  return n;
}

export function restyleLivingShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const plaster = plasterTex(THREE);
  const walnut = walnutTex(THREE);
  const wallHex = hexNum(vibe.palette.facade);
  const ceilHex = hexNum(vibe.palette.facadeAlt);
  const floorHex = hexNum('#6b3f2a');
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.livingArt || (o.parent && o.parent.name === 'livingArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === LIVING_STOCK.wall || (t === 'BoxGeometry' && col === 0xd8cfc4)) {
      m.color.setHex(wallHex);
      m.map = plaster;
      m.roughness = 0.96;
      m.metalness = 0;
      m.envMapIntensity = 0;
      m.emissive.setHex(0x000000);
      skipMat(m);
      n++;
    } else if (col === LIVING_STOCK.ceil) {
      m.color.setHex(0xffffff);
      m.map = ceilTex(THREE);
      m.emissive.setHex(hexNum(vibe.palette.windowOn));
      m.emissiveIntensity = 0.14;
      m.roughness = 0.96;
      m.metalness = 0;
      m.envMapIntensity = 0;
      skipMat(m);
      n++;
    } else if (t === 'PlaneGeometry' && (col === LIVING_STOCK.wood || o === floor || o.userData.looksSet === 'wood')) {
      if (m.map && m.map !== walnut && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = walnut;
      m.color.setHex(0xffffff);
      m.roughness = 0.96;
      m.metalness = 0;
      m.envMapIntensity = 0;
      m.emissive.setHex(hexNum(vibe.palette.street));
      m.emissiveIntensity = 0.04;
      skipMat(m);
      n++;
    }
  });
  return n;
}

function addClaySofa(THREE, parent, mats) {
  const P = LIVING_PLAY.sofa;
  const g = new THREE.Group();
  g.position.set(P.x, 0, P.z);
  const body = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.15, P.seatH, P.d - 0.15), mats.body);
  body.position.y = P.seatY + P.seatH / 2;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.28, 2.15), mats.seat);
  seat.position.y = P.seatY + P.seatH + 0.14;
  const back = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.15, P.backH - 0.2, P.backD - 0.08), mats.body);
  back.position.set(0, P.backY + (P.backH - 0.2) / 2, P.backZ - P.z);
  const backCap = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.15, 0.18, P.backD), mats.cushion);
  backCap.position.set(0, P.backY + P.backH - 0.09, P.backZ - P.z);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 2.45, 12), mats.body);
  armL.rotation.x = Math.PI / 2;
  armL.position.set(-P.armX, P.seatY + P.armH / 2, 0);
  const armR = armL.clone();
  armR.position.x = P.armX;
  const bolL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.05, 10), mats.cushion);
  bolL.rotation.z = Math.PI / 2;
  bolL.position.set(-2.45, P.seatY + P.seatH + 0.42, 0.18);
  const bolR = bolL.clone();
  bolR.position.x = 2.45;
  const midCush = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 1.7), mats.cushion);
  midCush.position.set(0, P.seatY + P.seatH + 0.26, 0.15);
  for (const o of [body, seat, back, backCap, armL, armR, bolL, bolR, midCush]) {
    o.castShadow = o.receiveShadow = true;
    o.userData.livingArt = true;
    g.add(o);
  }
  for (const sx of [-2.4, 0, 2.4]) {
    const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 2.0), mats.walnut);
    stitch.position.set(sx, 1.72, 0.08);
    stitch.userData.livingArt = true;
    g.add(stitch);
  }
  parent.add(g);
  return g;
}

function addClayChair(THREE, parent, mats) {
  const P = LIVING_PLAY.chair;
  const g = new THREE.Group();
  g.position.set(P.x, 0, P.z);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.35, P.seatH, 2.35), mats.body);
  body.position.y = P.seatY + P.seatH / 2;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 2.05), mats.cushion);
  seat.position.y = P.seatY + P.seatH + 0.14;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.35, P.backH, P.backD), mats.body);
  back.position.set(0, P.backY + P.backH / 2, P.backZ - P.z);
  for (const o of [body, seat, back]) {
    o.castShadow = o.receiveShadow = true;
    o.userData.livingArt = true;
    g.add(o);
  }
  parent.add(g);
  return g;
}

function addClayTable(THREE, parent, mats, budget) {
  const P = LIVING_PLAY.table;
  const g = new THREE.Group();
  g.position.set(P.x, 0, P.z);
  const top = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.15, P.topH, P.d - 0.15), mats.walnut);
  top.position.y = P.topY + P.topH / 2;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.4, 0.10, P.d - 0.4), mats.body);
  apron.position.y = P.topY - 0.05;
  g.add(top, apron);
  for (const [x, z] of P.legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, P.topY, 8), mats.clayAccent);
    leg.position.set(x, P.topY / 2, z);
    g.add(leg);
  }
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.22, 10), mats.sky);
  mug.position.set(0.55, P.topY + P.topH + 0.11, 0.2);
  g.add(mug);
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.38), mats.cushion);
  book.position.set(-0.7, P.topY + P.topH + 0.04, -0.15);
  g.add(book);
  if (budget.steam) {
    const steam = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.55), glowMat(THREE, 0xfff6e0));
    steam.position.set(0.55, P.topY + P.topH + 0.42, 0.2);
    steam.userData.livingSteam = true;
    steam.userData.steamBase = P.topY + P.topH + 0.42;
    g.add(steam);
  }
  g.traverse((o) => { o.userData.livingArt = true; });
  parent.add(g);
  return g;
}

function addGummyLamp(THREE, parent, mats, budget) {
  const g = new THREE.Group();
  g.position.set(-6.2, 0, 8.2);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.2, 12), mats.walnut);
  base.position.y = 0.1;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4.15, 10), mats.gummy);
  stem.position.y = 2.2;
  stem.userData.livingLamp = true;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.62, 0.58, 14), mats.lamp);
  shade.position.y = 4.52;
  shade.userData.livingLamp = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.lamp);
  cap.position.y = 4.86;
  g.add(base, stem, shade, cap);
  if (budget.glow) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), glowMat(THREE, 0xffe08a));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    g.add(pool);
  }
  g.traverse((o) => { o.userData.livingArt = true; });
  parent.add(g);
  return g;
}

function addBlockShelf(THREE, parent, mats, budget) {
  const P = LIVING_PLAY.shelf;
  const g = new THREE.Group();
  g.position.set(P.x, 0, P.z);
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(P.post, P.postH, P.d - 0.15), mats.walnut);
  sideL.position.set(-(P.w / 2 - P.post / 2), P.postH / 2, 0);
  const sideR = sideL.clone();
  sideR.position.x = P.w / 2 - P.post / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.24, P.postH, 0.12), mats.body);
  back.position.set(0, P.postH / 2, -(P.d / 2 - 0.06));
  g.add(sideL, sideR, back);
  for (const y of P.shelfYs) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.22, P.shelfH, P.d - 0.25), mats.walnut);
    shelf.position.y = y + P.shelfH / 2;
    g.add(shelf);
  }
  const bookCols = [0xff6b9a, 0x7ec8e3, 0xffe08a, 0xf4d6c6, 0x6b3f2a, 0xff9a6b];
  const matsBooks = bookCols.map((c) => clayMat(THREE, c));
  const geo = new THREE.BoxGeometry(0.22, 0.72, 0.48);
  let placed = 0;
  const n = budget.books;
  addInstanced(THREE, g, geo, matsBooks[0], n, (d, i) => {
    const row = i % 4;
    const col = (i / 4) | 0;
    if (col > 5) return false;
    d.position.set(-0.22 + (i % 3) * 0.28, 0.72 + row * 1.28, -0.72 + ((col % 4) * 0.5));
    d.rotation.set(0, (i % 5) * 0.04, 0);
    d.scale.set(1, 0.85 + (i % 4) * 0.08, 1);
    placed++;
    return true;
  });
  for (let i = 1; i < matsBooks.length; i++) {
    const extra = new THREE.Mesh(geo, matsBooks[i]);
    extra.position.set(-0.2 + (i % 3) * 0.28, 0.72 + (i % 4) * 1.28, 0.55);
    extra.userData.livingArt = true;
    g.add(extra);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.28, 8), mats.sky);
  pot.position.set(0, 5.62, 0);
  g.add(pot);
  const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 0.42, 10), mats.cushion);
  pouf.position.set(-3.4, 0.22, -7.6);
  pouf.userData.livingArt = true;
  parent.add(pouf);
  g.traverse((o) => { o.userData.livingArt = true; });
  parent.add(g);
  return g;
}

function addClayScreen(THREE, parent, mats, budget) {
  const P = LIVING_PLAY.tv;
  const g = new THREE.Group();
  g.position.set(P.x, 0, P.z);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.1, P.topH, P.d - 0.25), mats.walnut);
  stand.position.y = P.topY + P.topH / 2;
  for (const [dx, dz] of P.legs) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(P.leg, P.topY, P.leg), mats.body);
    leg.position.set(dx, P.topY / 2, dz);
    g.add(leg);
  }
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.28, 1.4), mats.body);
  drawer.position.set(-0.02, P.topY + P.topH + 0.14, 1.4);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.45, 4.2), mats.body);
  panel.position.set(1.12, 3.15, 0);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.15, 3.85), mats.screen);
  screen.position.set(1.05, 3.15, 0);
  if (budget.screen && mats.screen.map) {
    screen.userData.livingScreen = true;
  }
  g.add(stand, drawer, panel, screen);
  g.traverse((o) => { o.userData.livingArt = true; });
  parent.add(g);
  return g;
}

function addRugAndTrim(THREE, parent, mats) {
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 10.2), mats.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.02, -7.4);
  rug.userData.livingArt = true;
  parent.add(rug);
  const hx = ROOM.w / 2 - 0.22, hz = ROOM.d / 2 - 0.22;
  const boards = [
    [0, 0.08, -hz, ROOM.w - 0.6, 0.16, 0.12],
    [0, 0.08, hz, ROOM.w - 0.6, 0.16, 0.12],
    [-hx, 0.08, 0, 0.12, 0.16, ROOM.d - 0.6],
    [hx, 0.08, 0, 0.12, 0.16, ROOM.d - 0.6],
  ];
  for (const [x, y, z, w, h, d] of boards) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.walnut);
    b.position.set(x, y, z);
    b.userData.livingArt = true;
    parent.add(b);
  }
  const rails = [
    [0, 1.18, -hz, ROOM.w - 0.7, 0.08, 0.06],
    [0, 1.18, hz, ROOM.w - 0.7, 0.08, 0.06],
    [-hx, 1.18, 0, 0.06, 0.08, ROOM.d - 0.7],
    [hx, 1.18, 0, 0.06, 0.08, ROOM.d - 0.7],
  ];
  for (const [x, y, z, w, h, d] of rails) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.cushion);
    r.position.set(x, y, z);
    r.userData.livingArt = true;
    parent.add(r);
  }
}

function addWindowAndDoor(THREE, parent, mats) {
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.3), mats.skyPane);
  sky.position.set(-10.28, 2.25, 4);
  sky.rotation.y = Math.PI / 2;
  sky.userData.livingArt = true;
  parent.add(sky);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 4.15), mats.walnut);
  sill.position.set(-10.2, 0.08, 4);
  sill.userData.livingArt = true;
  parent.add(sill);
  const felt = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.18, 0.12), mats.cushion);
  felt.position.set(0, 6.28, 13.55);
  felt.userData.livingArt = true;
  parent.add(felt);
  for (const x of [-1.1, -0.35, 0.35, 1.1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.6, 0.04), mats.gummy);
    strip.position.set(x, 3.1, 13.58);
    strip.userData.livingArt = true;
    parent.add(strip);
  }
}

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const extras = new THREE.Group();
  extras.name = 'livingArtExtras';
  extras.userData.livingArt = true;
  const frameGeo = new THREE.BoxGeometry(1.7, 1.25, 0.08);
  const artGeo = new THREE.BoxGeometry(1.42, 0.98, 0.04);
  addInstanced(THREE, extras, frameGeo, mats.frame, budget.frames, (d, i) => {
    const left = i % 2 === 0;
    d.position.set(left ? -10.15 : 10.15, 2.8 + (i % 3) * 1.6, -5 + ((i * 4) % 12));
    d.rotation.set(0, left ? Math.PI / 2 : -Math.PI / 2, 0);
    return true;
  });
  addInstanced(THREE, extras, artGeo, mats.sky, Math.min(budget.frames, 6), (d, i) => {
    const left = i % 2 === 0;
    d.position.set(left ? -10.1 : 10.1, 2.8 + (i % 3) * 1.6, -5 + ((i * 4) % 12));
    d.rotation.set(0, left ? Math.PI / 2 : -Math.PI / 2, 0);
    return true;
  });
  const toyGeo = new THREE.BoxGeometry(0.42, 0.28, 0.42);
  const toySpots = [
    [-3.6, 4.8], [3.8, 5.2], [-2.2, 2.4], [2.6, 3.1],
    [-4.4, 9.2], [4.2, 8.6], [1.4, 10.4], [-1.6, 11.0],
    [5.2, -3.2], [-5.0, 6.4],
  ];
  addInstanced(THREE, extras, toyGeo, mats.toy, budget.toys, (d, i) => {
    const s = toySpots[i % toySpots.length];
    if (furnitureHit(s[0], s[1])) return false;
    if (!propClearOfCourse(s[0], s[1], 0.2, gates, { gatePad: 1.6, corridor: 1.4, yRange: 2 })) return false;
    d.position.set(s[0], 0.12, s[1]);
    d.rotation.y = i * 0.4;
    return true;
  });
  const plantSpots = [[-8.6, 11.6], [8.6, 11.4], [-8.8, -8.8], [6.6, 8.8]];
  for (let i = 0; i < budget.plants; i++) {
    const s = plantSpots[i];
    if (!s || furnitureHit(s[0], s[1])) continue;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.36, 8), mats.walnut);
    pot.position.set(s[0], 0.18, s[1]);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), mats.plant);
    leaf.position.set(s[0], 0.62, s[1]);
    pot.userData.livingArt = true;
    leaf.userData.livingArt = true;
    extras.add(pot, leaf);
  }
  const vine = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.05, 0.05), mats.gummy);
  vine.position.set(0, 2.42, -1.2);
  vine.userData.livingArt = true;
  extras.add(vine);
  for (let i = 0; i < 7; i++) {
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), i % 2 ? mats.cushion : mats.lamp);
    drip.position.set(-4.5 + i * 1.5, 2.22, -1.2);
    drip.userData.livingArt = true;
    extras.add(drip);
  }
  if (budget.lanterns > 0) {
    const lanGeo = new THREE.SphereGeometry(0.22, 8, 6);
    addInstanced(THREE, extras, lanGeo, mats.lantern, budget.lanterns, (d, i) => {
      const x = -6 + (i % 5) * 3.0;
      const z = -8 + ((i * 5) % 18);
      if (!propClearOfCourse(x, z, 7.4, gates, { gatePad: 1.8, corridor: 1.2, yRange: 3 })) return false;
      d.position.set(x, 7.55, z);
      return true;
    });
    for (let i = 0; i < Math.min(4, budget.lanterns); i++) {
      const hang = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mats.lantern);
      hang.position.set(-4.5 + i * 3.0, 7.35, 1.2);
      hang.userData.livingLantern = true;
      hang.userData.phase = i * 0.9;
      hang.userData.livingArt = true;
      extras.add(hang);
    }
  }
  if (budget.beads > 0) {
    const beadGeo = new THREE.SphereGeometry(0.07, 6, 5);
    addInstanced(THREE, extras, beadGeo, mats.bead, budget.beads, (d, i) => {
      d.position.set(-7 + (i * 0.68), 7.85, -2 + Math.sin(i * 0.7) * 3.2);
      return true;
    });
  }
  addInstanced(THREE, extras, new THREE.BoxGeometry(1.35, 1.55, 0.05), mats.sky, budget.posters, (d, i) => {
    d.position.set(-3.2 + i * 2.2, 3.15, -13.72);
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.42, 0.05, 0.32), mats.mag, budget.mags, (d, i) => {
    const x = -1.4 + (i % 4) * 0.7;
    const z = -6.8 + ((i / 4) | 0) * 0.55;
    if (!propClearOfCourse(x, z, 0.18, gates, { gatePad: 1.5, corridor: 1.2, yRange: 2 })) return false;
    d.position.set(x, 0.05, z);
    d.rotation.y = i * 0.35;
    return true;
  });
  addInstanced(THREE, extras, new THREE.CylinderGeometry(0.07, 0.08, 0.16, 8), mats.lamp, budget.candles, (d, i) => {
    d.position.set(-0.85 + i * 0.42, 1.22, -5.55);
    return true;
  });
  parent.add(extras);
  return extras;
}

function addHeroClaySign(THREE, parent, mats) {
  const hero = new THREE.Group();
  hero.name = 'livingArtHero';
  hero.userData.livingArt = true;
  const cable = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 3.2, 3, 6), mats.walnut);
  cable.position.set(-0.95, 6.35, -7.15);
  hero.add(cable);
  const cable2 = cable.clone();
  cable2.position.x = 0.95;
  hero.add(cable2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 0.12), mats.walnut);
  body.position.set(0, 4.45, -7.15);
  hero.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.85, 0.05), mats.sign);
  face.position.set(0, 4.45, -7.24);
  hero.add(face);
  const faceBack = face.clone();
  faceBack.position.z = -7.06;
  faceBack.rotation.y = Math.PI;
  hero.add(faceBack);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), mats.disc);
  disc.position.set(0, 3.72, -7.15);
  disc.userData.livingClay = true;
  hero.add(disc);
  hero.traverse((o) => { o.userData.livingArt = true; });
  parent.add(hero);
}

function addSecretDressing(THREE, parent, mats) {
  // Felt Nook {9.62, 1.7, -12.55} — behind the block shelf.
  const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.38, 10), mats.cushion);
  pouf.position.set(9.62, 0.2, -12.55);
  pouf.userData.livingArt = true;
  parent.add(pouf);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.38), mats.gummy);
  stack.position.set(9.62, 0.62, -12.55);
  stack.userData.livingArt = true;
  parent.add(stack);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.9), glowMat(THREE, 0xff6b9a));
  glow.position.set(9.62, 0.04, -12.55);
  glow.userData.livingArt = true;
  parent.add(glow);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mats.bead);
  bead.position.set(9.62, 1.7, -12.55);
  bead.userData.livingClay = true;
  bead.userData.livingArt = true;
  parent.add(bead);
}

function makeLivingMats(THREE, vibe) {
  const screenMap = feltScreenTex(THREE);
  const nap = feltNapTex(THREE);
  const screen = feltBasic(THREE, 0xffffff, { map: screenMap });
  return {
    body: clayMat(THREE, hexNum('#d4a078'), { map: nap }),
    seat: clayMat(THREE, hexNum('#e8c4a8'), { map: nap }),
    cushion: gummyMat(THREE, hexNum(vibe.palette.neonA)),
    walnut: clayMat(THREE, hexNum('#6b3f2a')),
    clayAccent: clayMat(THREE, hexNum(vibe.palette.mesa)),
    sky: clayMat(THREE, hexNum(vibe.palette.neonB)),
    gummy: gummyMat(THREE, hexNum('#ffb3c7')),
    lamp: feltEmissive(THREE, hexNum(vibe.palette.windowOn)),
    screen,
    rug: feltBasic(THREE, 0xffffff, { map: rugTex(THREE) }),
    skyPane: skipMat(new THREE.MeshBasicMaterial({
      map: skyTex(THREE), toneMapped: false, fog: true,
    })),
    frame: clayMat(THREE, hexNum('#8a5a3a')),
    toy: clayMat(THREE, hexNum(vibe.palette.neonC)),
    plant: clayMat(THREE, 0x5aaa6a),
    lantern: feltEmissive(THREE, hexNum(vibe.palette.windowOn)),
    bead: gummyMat(THREE, hexNum(vibe.palette.neonA), 0.8),
    sign: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: parlorSignTex(THREE), toneMapped: false,
    })),
    disc: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffe08a, toneMapped: false,
    })),
    mag: clayMat(THREE, hexNum('#7ec8e3')),
  };
}

function addPlayLines(THREE, parent, mats) {
  const P = LIVING_PLAY;
  const clay = P.clay;
  const hoop = new THREE.Group();
  hoop.name = 'livingArtClayHoop';
  hoop.userData.livingArt = true;
  const ow = clay.innerW + clay.bar * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ow, clay.bar, clay.depth), mats.body);
  top.position.set(clay.x, clay.y + clay.innerH / 2 + clay.bar / 2, clay.z);
  const bot = top.clone();
  bot.position.y = clay.y - clay.innerH / 2 - clay.bar / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(clay.bar, clay.innerH, clay.depth), mats.body);
  left.position.set(clay.x - clay.innerW / 2 - clay.bar / 2, clay.y, clay.z);
  const right = left.clone();
  right.position.x = clay.x + clay.innerW / 2 + clay.bar / 2;
  hoop.add(top, bot, left, right);
  hoop.traverse((o) => { o.userData.livingArt = true; });
  parent.add(hoop);
  const joist = new THREE.BoxGeometry(19.4, P.rafterH, P.rafterD);
  addInstanced(THREE, parent, joist, mats.walnut, P.rafterZs.length, (d, i) => {
    d.position.set(0, P.rafterY + P.rafterH / 2, P.rafterZs[i]);
    return true;
  });
  for (const spec of [P.gap.left, P.gap.right]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mats.body);
    stack.position.set(spec.x, spec.h / 2, spec.z);
    stack.userData.livingArt = true;
    parent.add(stack);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.08, 0.08, spec.d + 0.08), mats.cushion);
    lip.position.set(spec.x, spec.h + 0.04, spec.z);
    lip.userData.livingArt = true;
    parent.add(lip);
  }
}

export function buildClayParlor(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'livingArtVisuals';
  group.userData.livingArt = true;
  const budget = livingBudget(quality);
  const mats = makeLivingMats(THREE, vibe);
  group.userData.planned = planLivingKit();
  addRugAndTrim(THREE, group, mats);
  addWindowAndDoor(THREE, group, mats);
  addClaySofa(THREE, group, mats);
  addClayChair(THREE, group, mats);
  addClayTable(THREE, group, mats, budget);
  addGummyLamp(THREE, group, mats, budget);
  addBlockShelf(THREE, group, mats, budget);
  addClayScreen(THREE, group, mats, budget);
  addPlayLines(THREE, group, mats);
  addWhoopLife(THREE, group, mats, budget, gates || LIVING_KEEP_GATES);
  addHeroClaySign(THREE, group, mats);
  addSecretDressing(THREE, group, mats);
  parent.add(group);
  return group;
}

export function decorateLivingGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const clay = feltEmissive(THREE, col);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(size + size * 0.1, size * 0.06, 8, 22),
    clay,
  );
  halo.name = 'gateHalo';
  ring.add(halo);
  ring.userData.artHalo = halo;
  ring.userData.artStyle = 'clay-ring';
  const extras = [];
  for (let i = 0; i < 8; i++) {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.08, 6, 5),
      feltEmissive(THREE, i % 2 ? hexNum(vibe.palette.gateB) : hexNum(vibe.palette.neonC)),
    );
    const a = i / 8 * Math.PI * 2;
    bead.position.set(Math.cos(a) * (size + size * 0.16), Math.sin(a) * (size + size * 0.16), 0);
    extras.push(bead);
  }
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.86, size * 0.02, 6, 18),
    feltEmissive(THREE, hexNum(vibe.palette.gateB)),
  );
  extras.push(inner);
  for (const e of extras) {
    e.castShadow = false;
    e.receiveShadow = false;
    ring.add(e);
  }
  ring.userData.artExtras = extras;
  return halo;
}

export function pulseLivingGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 2.4;
  if (isNext) {
    col = 0xfff6e8;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 3.4) + pulse * 1.1;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.04);
  } else if (passed) {
    col = 0x7ec8e3;
    emit = 1.6;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickLivingArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.livingLamp || u.livingLantern || u.livingSteam || u.livingScreen || u.livingClay) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickLivingArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickLivingArtObject(o, t) {
  if (o.userData && o.userData.livingLamp && o.material) {
    const pulse = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.35));
    if (o.material.emissiveIntensity != null) {
      o.material.emissiveIntensity = 1.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.35));
    } else if (o.material.color) {
      o.material.color.setRGB(pulse, pulse * 0.88, pulse * 0.52);
    }
  }
  if (o.userData && o.userData.livingLantern) {
    const phase = o.userData.phase || 0;
    o.position.y = 7.35 + Math.sin(t * 0.8 + phase) * 0.06;
    o.rotation.z = Math.sin(t * 0.65 + phase) * 0.08;
  }
  if (o.userData && o.userData.livingSteam) {
    const base = o.userData.steamBase || 1.62;
    let y = o.position.y + 0.01;
    if (y > base + 0.55) y = base;
    o.position.y = y;
    if (o.material && o.material.opacity != null) {
      o.material.opacity = 0.08 + 0.16 * (1 - (y - base) / 0.55);
    }
  }
  if (o.userData && o.userData.livingScreen && o.material && o.material.map) {
    o.material.map.offset.x = (t * 0.04) % 1;
  }
  if (o.userData && o.userData.livingClay) {
    o.rotation.z = t * 0.18;
  }
}

export function restyleLiving(THREE, ctx) {
  try {
    return restyleLivingInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleLiving', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleLivingInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockLivingMeshes(root);
  restyleLivingShell(THREE, root, vibe, ctx.floor);
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('livingArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildClayParlor(THREE, root, vibe, quality, ctx.gates || LIVING_KEEP_GATES);
  }
  if (ctx.applyLighting !== false && typeof ctx.LIGHTING !== 'undefined') {
    // lighting applied by the host via applyVibeLighting
  }
  if (root) root.userData.livingArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
