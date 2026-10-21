// Volt Stall — playable whoop playground + Kenney CC0 shop kit.
// Colliders live in sim-maps.js GARAGE_PLAY and must match kit/proc meshes.
// Kenney kit (sim-art-kit.js) swaps hero props after first paint.
// Procedural meshes stay if a GLB fails. Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=a6b4469c954b';
import { applyFeltMaterial, feltBasic, feltEmissive } from './sim-art-felt.js?v=f76fc4f752df';
import { GARAGE_PLAY, garageRackSlabs } from './sim-maps.js?v=a81c48a1b734';

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
  { x: 0.0, y: 1.25, z: 18.6, size: 1.8 },
  { x: -2.4, y: 2.35, z: 9.2, size: 1.6 },
  { x: 0.0, y: 2.55, z: 3.4, size: 1.9 },
  { x: 4.2, y: 0.68, z: -5.5, size: 1.5 },
  { x: 0.0, y: 1.55, z: -12.2, size: 1.4 },
  { x: -8.4, y: 1.20, z: -8.0, size: 1.5 },
  { x: 8.6, y: 1.68, z: 7.9, size: 1.5 },
  { x: -8.6, y: 2.40, z: 14.8, size: 1.6 },
  { x: 2.2, y: 3.90, z: 6.4, size: 1.6 },
  { x: 0.0, y: 7.85, z: 5.4, size: 1.7 },
  { x: 0.0, y: 7.85, z: -5.4, size: 1.7 },
  { x: 4.2, y: 3.35, z: -5.5, size: 1.6 },
  { x: 8.6, y: 4.15, z: 7.9, size: 1.5 },
  { x: 0.0, y: 4.40, z: 3.4, size: 1.8 },
  { x: 0.0, y: 3.40, z: 14.0, size: 1.6 },
  { x: 8.6, y: 1.68, z: 3.6, size: 1.5 },
  { x: 8.6, y: 2.93, z: 12.2, size: 1.5 },
  { x: 0.0, y: 1.15, z: 20.6, size: 1.6 },
  { x: 0.0, y: 6.40, z: 18.8, size: 1.6 },
  { x: 5.6, y: 1.35, z: -16.4, size: 1.4 },
  { x: 7.5, y: 1.40, z: -5.5, size: 1.5 },
  { x: 0.9, y: 1.40, z: -5.5, size: 1.5 },
]);

const ROOM = Object.freeze({ w: 21, d: 42, h: 10.5 });

export function garageWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function planGarageKit() {
  return {
    // Kenney cabinet bench is skipped. The flyable bench is procedural.
    bench: [],
    chest: [{ x: -8.3, z: 8.2, ry: Math.PI / 2 }],
    // Kenney sedan long-axis is Z; autoForward + this yaw faces it down-stall.
    // y = jackH so the kit car sits on the stands, not the floor.
    car: [{ x: 4.2, z: -5.5, y: GARAGE_PLAY.car.jackH, ry: Math.PI / 2 }],
    crates: [
      { x: -5.4, z: 13.6 }, { x: 5.6, z: 12.8 }, { x: -5.2, z: -15.8 },
      { x: 5.4, z: -14.6 }, { x: -5.0, z: 2.4 }, { x: 5.1, z: -2.8 },
      { x: -5.6, z: 17.2 }, { x: 5.3, z: 5.4 }, { x: -4.9, z: -9.2 },
      { x: 5.2, z: 15.6 }, { x: -5.3, z: 8.8 }, { x: 5.5, z: -7.4 },
    ],
    cardboard: [
      { x: -5.1, z: -17.6 }, { x: 4.8, z: -18.4 }, { x: -5.4, z: 16.0 },
      { x: 5.4, z: 17.4 }, { x: -4.8, z: 0.6 }, { x: 4.9, z: 8.2 },
    ],
    toolboxes: [
      { x: -8.0, z: -0.6, ry: 0.15 },
      { x: -8.0, z: 5.4, ry: -0.2 },
      { x: 8.5, z: 1.6, ry: 1.15 },
    ],
    tires: [
      { x: -5.6, z: 18.4 }, { x: 5.4, z: 18.8 }, { x: -5.5, z: -18.6 },
      { x: 5.3, z: -18.2 }, { x: -5.8, z: 12.2 }, { x: 5.6, z: -12.6 },
      { x: -5.4, z: 4.8 }, { x: 5.2, z: 14.2 }, { x: -5.7, z: -7.2 },
      { x: 5.5, z: 2.6 }, { x: -5.3, z: -14.4 }, { x: 5.8, z: -3.8 },
    ],
    barrels: [
      { x: -8.0, z: -15.4 }, { x: 8.4, z: 15.8 }, { x: -8.0, z: 12.6 }, { x: 8.2, z: -17.2 },
    ],
    barriers: [
      { x: -7.2, z: 18.6, ry: 0.2 }, { x: 7.4, z: 18.8, ry: -0.15 },
      { x: -7.0, z: -18.8, ry: 0.1 }, { x: 7.2, z: -18.4, ry: -0.2 },
    ],
  };
}

export function garageBudget(applied) {
  if (applied === 'low') {
    return {
      tubes: 6, cones: 4, cans: 10, tools: 8, stripes: 8, puddles: 0,
      glow: false, sparks: false, extraCans: 0,
      joists: 6, tires: 8, bottles: 8, posters: 2, windows: 2, pegs: 10,
    };
  }
  if (applied === 'high') {
    return {
      tubes: 16, cones: 10, cans: 24, tools: 18, stripes: 14, puddles: 10,
      glow: true, sparks: true, extraCans: 8,
      joists: 10, tires: 14, bottles: 14, posters: 4, windows: 4, pegs: 16,
    };
  }
  return {
    tubes: 12, cones: 8, cans: 18, tools: 14, stripes: 12, puddles: 6,
    glow: true, sparks: true, extraCans: 4,
    joists: 8, tires: 12, bottles: 12, posters: 3, windows: 3, pegs: 14,
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
    fillGrad(g, 0, 0, w, 0, [[0, '#12141a'], [0.5, '#1c2026'], [1, '#0e1014']]);
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 22) {
      g.fillStyle = y % 44 === 0 ? '#262a32' : '#181b20';
      g.fillRect(0, y, w, 18);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, y + 18, w, 3);
    }
    g.fillStyle = '#ffb347';
    g.globalAlpha = 0.7;
    g.fillRect(w * 0.45, 0, 5, h);
    g.fillRect(w * 0.53, 0, 5, h);
    g.globalAlpha = 1;
    g.fillStyle = '#2de2e6';
    g.globalAlpha = 0.32;
    for (let y = 10; y < h; y += 32) g.fillRect(w * 0.46, y, 20, 7);
    g.globalAlpha = 1;
    for (let i = 0; i < 28; i++) {
      g.fillStyle = `rgba(8,8,10,${0.22 + (i % 4) * 0.08})`;
      g.beginPath();
      g.arc((i * 47) % w, (i * 71) % h, 12 + (i % 7), 0, 6.3);
      g.fill();
    }
    g.fillStyle = 'rgba(196,90,34,0.16)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.arc((i * 31) % w, (i * 53) % h, 18, 0, 6.3);
      g.fill();
    }
  }, 4, 8);
}

function steelWallTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#1a1e24'], [0.35, '#3d4654'], [1, '#4a5462']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a3038';
    for (let y = 0; y < h; y += 14) g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, 22);
    g.fillStyle = 'rgba(45,226,230,0.10)';
    g.fillRect(0, 48, w, 3);
    g.fillStyle = 'rgba(255,179,71,0.12)';
    g.fillRect(0, 96, w, 3);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 6; x < w; x += 18) g.fillRect(x, 0, 1, h);
  }, 8, 4);
}

function ceilJoistTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#0a0c10'], [0.6, '#1a1e24'], [1, '#12161c']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a3038';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 6, h);
    g.fillStyle = 'rgba(45,226,230,0.08)';
    g.fillRect(0, h * 0.4, w, 2);
  }, 10, 4);
}

function pegTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#2a1c14'], [1, '#3a2818']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a120c';
    for (let y = 8; y < h; y += 12) {
      for (let x = 8; x < w; x += 12) g.fillRect(x, y, 2, 2);
    }
  }, 4, 6);
}

function voltSignTex(THREE) {
  return canvasTex(THREE, 256, 96, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#0a0c10'], [1, '#14161c']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2de2e6';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ffb347';
    g.font = 'bold 48px sans-serif';
    g.textAlign = 'center';
    g.fillText('VOLT', w * 0.5, 64);
    g.fillStyle = '#2de2e6';
    g.fillRect(28, h - 18, w - 56, 4);
  }, 1, 1);
}

function posterTex(THREE, warm) {
  return canvasTex(THREE, 64, 96, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, warm
      ? [[0, '#c45a22'], [1, '#ffb347']]
      : [[0, '#1a2430'], [1, '#2de2e6']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#14161c';
    g.fillRect(8, 10, w - 16, 16);
    g.fillStyle = warm ? '#fff4d2' : '#e8ffff';
    g.fillRect(10, 36, w - 20, 44);
  }, 1, 1);
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
  const e = extras || {};
  const opts = {};
  if (e.map) opts.map = e.map;
  if (e.transparent != null) opts.transparent = e.transparent;
  if (e.opacity != null) opts.opacity = e.opacity;
  return feltBasic(THREE, hex, opts);
}

function emitMat(THREE, hex) {
  return feltEmissive(THREE, hex);
}

function glowMat(THREE, hex, opacity) {
  return applyFeltMaterial(new THREE.MeshBasicMaterial({
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

function furnitureHit(x, z) {
  if (x < -6.8 && z < -1.6 && z > -14.4) return true;
  if (x < -6.8 && z > 6.4 && z < 10.2) return true;
  if (x > 1.4 && x < 7.0 && z > -11.0 && z < 0.2) return true;
  if (x > 7.5 && z > 1.0 && z < 6.2) return true;
  if (x > 7.5 && z > 9.6 && z < 14.8) return true;
  if (Math.abs(x) < 2.1 && z > -14.2 && z < -10.2) return true;
  if (x < -8.8 && z > 13.6 && z < 16.0) return true;
  if (Math.abs(x) < 1.2 && z > 12.8 && z < 15.2) return true;
  if (Math.abs(x) > 1.6 && Math.abs(x) < 4.3 && z > 20.2) return true;
  if (x > 4.4 && x < 6.8 && z > -17.6 && z < -15.2) return true;
  if (x < -5.8 && z > 16.4 && z < 18.4) return true;
  if (x > 5.8 && z > -16.2 && z < -14.2) return true;
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
    if (col === GARAGE_STOCK.tire) {
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
  const ceilTex = ceilJoistTex(THREE);
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
      m.map = ceilTex;
      m.emissive.setHex(hexNum(vibe.palette.neonA));
      m.emissiveIntensity = 0.06;
      m.roughness = 0.86;
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
  const c = GARAGE_PLAY.car;
  const g = new THREE.Group();
  g.position.set(c.x, 0, c.z);
  const lift = c.jackH - 0.18;
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 8.4, 6, 12), mats.car);
  hull.rotation.x = Math.PI / 2;
  hull.position.set(0, lift + 1.05, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.82, 12, 8), mats.car);
  nose.scale.set(1.15, 0.72, 1.35);
  nose.position.set(0, lift + 0.95, -5.2);
  const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 3.6, 5, 10), mats.cabin);
  cabin.rotation.x = Math.PI / 2;
  cabin.position.set(0, lift + 1.95, 0.4);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8), mats.glass);
  canopy.scale.set(1.4, 0.55, 1.8);
  canopy.position.set(0, lift + 2.15, 0.2);
  g.add(hull, nose, cabin, canopy);
  const stands = new THREE.Group();
  stands.position.copy(g.position);
  for (const [x, z] of c.wheels) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, c.jackH, 8), mats.steel);
    stand.position.set(x, c.jackH / 2, z);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), mats.chest);
    pad.position.set(x, c.jackH, z);
    stands.add(stand, pad);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(c.wheelR, 0.16, 8, 14), mats.tire);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.42, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 8), mats.steel);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.42, z);
    g.add(wheel, hub);
  }
  g.userData.garageProcCar = true;
  g.traverse((o) => { o.userData.garageArt = true; o.userData.garageProcCar = true; o.castShadow = true; });
  stands.userData.garageProcJack = true;
  stands.traverse((o) => { o.userData.garageArt = true; o.userData.garageProcJack = true; o.castShadow = true; });
  parent.add(g, stands);
  return g;
}

function addWorkbench(THREE, parent, mats) {
  const b = GARAGE_PLAY.bench;
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  const top = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.topH, b.d), mats.steel);
  top.position.set(0, b.topY + b.topH * 0.5, 0);
  g.add(top);
  for (const [x, z] of b.legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(b.leg * 0.45, b.leg * 0.5, b.topY, 8), mats.wood);
    leg.position.set(x, b.topY * 0.5, z);
    g.add(leg);
  }
  const vise = new THREE.Mesh(viseGeo(THREE), mats.chest);
  vise.position.set(0.55, b.topY + 0.22, -4.4);
  g.add(vise);
  for (const bin of GARAGE_PLAY.benchBins) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(bin.w, bin.h, bin.d), mats.wood);
    crate.position.set(bin.x - b.x, bin.h * 0.5, bin.z - b.z);
    g.add(crate);
  }
  g.userData.garageProcBench = true;
  g.traverse((o) => { o.userData.garageArt = true; o.userData.garageProcBench = true; });
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
  g.userData.garageProcChest = true;
  g.traverse((o) => { o.userData.garageArt = true; o.userData.garageProcChest = true; });
  parent.add(g);
  return g;
}

function addOneRack(THREE, parent, mats, spec, budget, canOffset) {
  const g = new THREE.Group();
  g.position.set(spec.x, 0, spec.z);
  const hx = spec.w / 2 - 0.12, hz = spec.d / 2 - 0.12;
  const postGeo = new THREE.CapsuleGeometry(0.07, 5.05, 4, 6);
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    const p = new THREE.Mesh(postGeo, mats.steel);
    p.position.set(x, 2.6, z);
    g.add(p);
  }
  const slabs = garageRackSlabs(spec);
  for (const slab of slabs) {
    for (const y of GARAGE_PLAY.shelfYs) {
      const shelf = new THREE.Mesh(roundedSlabGeo(THREE, slab.w, GARAGE_PLAY.shelfH, slab.d, 0.08), mats.steel);
      shelf.position.set(slab.x - spec.x, y + GARAGE_PLAY.shelfH * 0.5, slab.z - spec.z);
      g.add(shelf);
    }
  }
  addInstanced(THREE, g, canGeo(THREE), mats.can, Math.max(4, (budget.cans / 2) | 0), (d, i) => {
    const row = i % 4;
    const slab = slabs[i % slabs.length];
    d.position.set(-0.35 + (i % 3) * 0.28, GARAGE_PLAY.shelfYs[row] + 0.12, slab.z - spec.z);
    d.rotation.y = i * 0.2 + canOffset;
    return true;
  });
  g.userData.garageProcRack = true;
  g.traverse((o) => { o.userData.garageArt = true; o.userData.garageProcRack = true; });
  parent.add(g);
  return g;
}

function addRack(THREE, parent, mats, budget) {
  addOneRack(THREE, parent, mats, GARAGE_PLAY.rackA, budget, 0);
  addOneRack(THREE, parent, mats, GARAGE_PLAY.rackB, budget, 1.1);
}

function addDoorAndTrim(THREE, parent, mats) {
  const d = GARAGE_PLAY.door;
  const alley = new THREE.Mesh(new THREE.PlaneGeometry(8.2, d.openH), mats.alley);
  alley.position.set(0, d.openH / 2, 21.15);
  alley.userData.garageArt = true;
  parent.add(alley);
  const slatN = 10;
  const slatH = d.panelH / slatN;
  for (let i = 0; i < slatN; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(d.w - 0.15, slatH - 0.04, 0.1), mats.steel);
    slat.position.set(0, d.openH + slatH * (i + 0.5), d.z);
    slat.userData.garageArt = true;
    parent.add(slat);
  }
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

  const joist = new THREE.BoxGeometry(20.4, 0.22, 0.28);
  addInstanced(THREE, extras, joist, mats.steel, budget.joists, (d, i) => {
    d.position.set(0, 10.15, -18 + i * (36 / Math.max(1, budget.joists - 1)));
    return true;
  });
  const tireMesh = addInstanced(THREE, extras, new THREE.TorusGeometry(0.32, 0.12, 6, 12), mats.tire, budget.tires, (d, i) => {
    const spots = [
      [-5.6, 18.4], [5.4, 18.8], [-5.5, -18.6], [5.3, -18.2],
      [-5.8, 12.2], [5.6, -12.6], [-5.4, 4.8], [5.2, 14.2],
      [-5.7, -7.2], [5.5, 2.6], [-5.3, -14.4], [5.8, -3.8],
      [-5.2, 16.6], [5.1, -16.8],
    ];
    const s = spots[i % spots.length];
    if (furnitureHit(s[0], s[1])) return false;
    if (!propClearOfCourse(s[0], s[1], 0.36, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0.32 + (i % 3) * 0.28, s[1]);
    d.rotation.x = Math.PI / 2;
    return true;
  });
  if (tireMesh) tireMesh.userData.garageProcTire = true;
  addInstanced(THREE, extras, canGeo(THREE), mats.can, budget.bottles, (d, i) => {
    const spots = [
      [-5.4, 13.6], [5.6, 12.8], [-5.2, -15.8], [5.4, -14.6],
      [-5.0, 2.4], [5.1, -2.8], [-5.6, 17.2], [5.3, 5.4],
      [-4.9, -9.2], [5.2, 15.6], [-5.3, 8.8], [5.5, -7.4],
      [-5.1, -17.6], [4.8, -18.4],
    ];
    const s = spots[i % spots.length];
    if (furnitureHit(s[0], s[1])) return false;
    if (!propClearOfCourse(s[0], s[1], 0.22, gates, { gatePad: 1.4, corridor: 1.2, yRange: 2 })) return false;
    d.position.set(s[0], 0, s[1]);
    return true;
  });
  const peg = new THREE.BoxGeometry(0.08, 3.6, 6.4);
  addInstanced(THREE, extras, peg, mats.peg, 2, (d, i) => {
    d.position.set(i ? 10.28 : -10.28, 3.4, i ? 4.2 : -8.0);
    return true;
  });
  addInstanced(THREE, extras, new THREE.CapsuleGeometry(0.03, 0.7, 3, 6), mats.tool, budget.pegs, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 10.18, 2.2 + (i % 5) * 0.55, (side > 0 ? 1.4 : -10.6) + ((i / 2) | 0) * 0.7);
    d.rotation.z = side * 0.35;
    return true;
  });
  addInstanced(THREE, extras, new THREE.PlaneGeometry(1.6, 2.2), mats.posterA, budget.posters, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 10.32, 4.8, -14 + ((i / 2) | 0) * 10);
    d.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.08, 2.6, 3.4), mats.window, budget.windows, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(side * 10.42, 7.2, -10 + ((i / 2) | 0) * 8);
    return true;
  });

  parent.add(extras);
  return extras;
}

function addHeroVoltSign(THREE, parent, mats) {
  const v = GARAGE_PLAY.volt;
  const hero = new THREE.Group();
  hero.name = 'garageArtHero';
  hero.userData.garageArt = true;
  const hangL = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 8.2 - (v.y + v.innerH / 2), 3, 6), mats.steel);
  hangL.position.set(-v.innerW / 2, (8.2 + v.y + v.innerH / 2) / 2, v.z);
  const hangR = hangL.clone();
  hangR.position.x = v.innerW / 2;
  hero.add(hangL, hangR);
  const ow = v.innerW + v.bar * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ow, v.bar, v.depth), mats.tube);
  top.position.set(v.x, v.y + v.innerH / 2 + v.bar / 2, v.z);
  top.userData.garageTube = true;
  const bot = top.clone();
  bot.position.y = v.y - v.innerH / 2 - v.bar / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(v.bar, v.innerH, v.depth), mats.tube);
  left.position.set(v.x - v.innerW / 2 - v.bar / 2, v.y, v.z);
  left.userData.garageTube = true;
  const right = left.clone();
  right.position.x = v.x + v.innerW / 2 + v.bar / 2;
  hero.add(top, bot, left, right);
  const face = new THREE.Mesh(new THREE.BoxGeometry(ow - 0.08, v.bar - 0.02, 0.06), mats.sign);
  face.position.set(v.x, v.y + v.innerH / 2 + v.bar / 2, v.z - 0.14);
  face.userData.garageSign = true;
  const faceBack = face.clone();
  faceBack.position.z = v.z + 0.14;
  faceBack.rotation.y = Math.PI;
  hero.add(face, faceBack);
  const fan = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.28), mats.sodium);
  fan.position.set(8.4, 8.6, -2.4);
  fan.userData.garageFan = true;
  hero.add(fan);
  hero.traverse((o) => { o.userData.garageArt = true; });
  parent.add(hero);
}

function addTireWell(THREE, parent, mats, spec) {
  const t = spec || GARAGE_PLAY.tireWell;
  const g = new THREE.Group();
  g.position.set(t.x, 0, t.z);
  for (let i = 0; i < t.rings; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry((t.inner + t.outer) / 4, (t.outer - t.inner) / 4, 8, 18), mats.tire);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t.ringH * (i + 0.5);
    g.add(ring);
  }
  g.traverse((o) => { o.userData.garageArt = true; });
  parent.add(g);
}

function addPlayLines(THREE, parent, mats) {
  const P = GARAGE_PLAY;
  const lines = new THREE.Group();
  lines.name = 'garageArtPlayLines';
  lines.userData.garageArt = true;

  const bike = P.bike;
  const hoop = new THREE.Group();
  const ow = bike.innerW + bike.bar * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ow, bike.bar, bike.depth), mats.tube);
  top.position.set(bike.x, bike.y + bike.innerH / 2 + bike.bar / 2, bike.z);
  top.userData.garageTube = true;
  const bot = top.clone();
  bot.position.y = bike.y - bike.innerH / 2 - bike.bar / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(bike.bar, bike.innerH, bike.depth), mats.tube);
  left.position.set(bike.x - bike.innerW / 2 - bike.bar / 2, bike.y, bike.z);
  left.userData.garageTube = true;
  const right = left.clone();
  right.position.x = bike.x + bike.innerW / 2 + bike.bar / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(bike.innerW * 0.42, 0.05, 8, 18), mats.steel);
  rim.position.set(bike.x, bike.y, bike.z);
  const hang = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 8.2 - (bike.y + bike.innerH / 2), 3, 6), mats.steel);
  hang.position.set(bike.x, (8.2 + bike.y + bike.innerH / 2) / 2, bike.z);
  hoop.add(top, bot, left, right, rim, hang);
  lines.add(hoop);

  for (const spec of [P.doorGap.left, P.doorGap.right]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mats.chest);
    stack.position.set(spec.x, spec.h * 0.5, spec.z);
    lines.add(stack);
  }
  const sof = P.doorSoffit;
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(sof.w, sof.h, sof.d), mats.wood);
  soffit.position.set(sof.x, sof.y + sof.h * 0.5, sof.z);
  lines.add(soffit);

  for (const toy of P.toys) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(toy.w, toy.h, toy.d), mats.can);
    box.position.set(toy.x, toy.h * 0.5, toy.z);
    lines.add(box);
  }

  const car = P.car;
  const orbit = [
    [car.x + 3.3, 0, car.z],
    [car.x - 3.3, 0, car.z],
    [car.x, 0, car.z + 4.1],
    [car.x, 0, car.z - 4.1],
  ];
  for (const [x, y, z] of orbit) {
    const cone = new THREE.Mesh(coneGeo(THREE), mats.cone);
    cone.position.set(x, y, z);
    lines.add(cone);
  }

  lines.traverse((o) => { o.userData.garageArt = true; });
  parent.add(lines);
  return lines;
}

function addLadder(THREE, parent, mats) {
  const lad = GARAGE_PLAY.ladder;
  const g = new THREE.Group();
  g.position.set(lad.x, 0, lad.z);
  const railL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, lad.h, 4, 6), mats.steel);
  railL.position.set(-lad.w / 2, lad.h / 2, 0);
  const railR = railL.clone();
  railR.position.x = lad.w / 2;
  g.add(railL, railR);
  for (let i = 0; i < lad.rungs; i++) {
    const rung = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, lad.w - 0.1, 3, 6), mats.wood);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, 0.45 + i * 0.62, 0);
    g.add(rung);
  }
  g.traverse((o) => { o.userData.garageArt = true; });
  parent.add(g);
}

function addHangLights(THREE, parent, mats) {
  for (const cord of GARAGE_PLAY.cords) {
    const drop = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, cord.y1 - cord.y0, 3, 6), mats.steel);
    drop.position.set(cord.x, (cord.y0 + cord.y1) / 2, cord.z);
    drop.userData.garageArt = true;
    parent.add(drop);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 1.15), mats.sodium);
    lamp.position.set(cord.x, cord.y0 - 0.1, cord.z);
    lamp.userData.garageArt = true;
    lamp.userData.garageTube = true;
    parent.add(lamp);
  }
}

function addSecretDressing(THREE, parent, mats) {
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 0.08, 12), mats.drip);
  pan.position.set(4.2, 0.05, 0.6);
  pan.userData.garageArt = true;
  parent.add(pan);
  for (const [dx, dz] of [[-0.35, 0.2], [0.32, -0.15], [0.08, 0.38]]) {
    const bottle = new THREE.Mesh(canGeo(THREE), mats.chest);
    bottle.position.set(4.2 + dx, 0, 0.6 + dz);
    bottle.userData.garageArt = true;
    parent.add(bottle);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mats.drip);
  glow.position.set(4.2, 0.22, 0.6);
  glow.userData.garageSpark = true;
  glow.userData.garageArt = true;
  parent.add(glow);
  const nest = new THREE.Mesh(roundedSlabGeo(THREE, 1.15, 0.28, 0.85, 0.1), mats.nest);
  nest.position.set(0, 9.42, -18.2);
  nest.userData.garageArt = true;
  parent.add(nest);
  const rag = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.55, 4, 6), mats.chest);
  rag.rotation.z = 0.6;
  rag.position.set(0.15, 9.62, -18.05);
  rag.userData.garageArt = true;
  parent.add(rag);
  const nestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), glowMat(THREE, 0x2de2e6, 0.28));
  nestGlow.position.set(0, 9.7, -18.2);
  nestGlow.userData.garageTube = true;
  nestGlow.userData.garageArt = true;
  parent.add(nestGlow);
}

function makeGarageMats(THREE, vibe) {
  return {
    steel: steelMat(THREE, hexNum(vibe.palette.facade)),
    wood: steelMat(THREE, hexNum('#4a3224')),
    car: feltBasic(THREE, hexNum('#1a2430')),
    cabin: feltBasic(THREE, hexNum('#243040')),
    glass: feltBasic(THREE, hexNum(vibe.palette.neonB), { transparent: true, opacity: 0.45 }),
    tire: steelMat(THREE, 0x141414),
    chest: feltBasic(THREE, hexNum(vibe.palette.neonC)),
    tube: emitMat(THREE, hexNum(vibe.palette.neonB)),
    sodium: emitMat(THREE, hexNum(vibe.palette.neonA)),
    can: feltBasic(THREE, hexNum(vibe.palette.neonA)),
    cone: feltBasic(THREE, hexNum(vibe.palette.neonA)),
    tool: feltBasic(THREE, hexNum(vibe.palette.neonB)),
    stripe: glowMat(THREE, 0xffb347, 0.55),
    puddle: glowMat(THREE, 0x2de2e6, 0.18),
    alley: skipMat(new THREE.MeshBasicMaterial({
      map: alleyTex(THREE), toneMapped: false, fog: true,
    })),
    peg: steelMat(THREE, 0xffffff, { map: pegTex(THREE) }),
    sign: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: voltSignTex(THREE), toneMapped: false,
    })),
    posterA: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: posterTex(THREE, true), toneMapped: false,
    })),
    posterB: skipMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: posterTex(THREE, false), toneMapped: false,
    })),
    window: glowMat(THREE, 0xffb347, 0.82),
    drip: glowMat(THREE, 0xc45a22, 0.35),
    nest: steelMat(THREE, hexNum('#4a3224')),
  };
}

export function buildVoltStall(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'garageArtVisuals';
  group.userData.garageArt = true;
  const budget = garageBudget(quality);
  const mats = makeGarageMats(THREE, vibe);
  group.userData.planned = planGarageKit();
  addDoorAndTrim(THREE, group, mats);
  addWedgeCar(THREE, group, mats);
  addWorkbench(THREE, group, mats);
  addToolChest(THREE, group, mats);
  addRack(THREE, group, mats, budget);
  addTireWell(THREE, group, mats, GARAGE_PLAY.tireWell);
  addTireWell(THREE, group, mats, GARAGE_PLAY.tireStack);
  addPlayLines(THREE, group, mats);
  addLadder(THREE, group, mats);
  addHangLights(THREE, group, mats);
  addWhoopLife(THREE, group, mats, budget, gates || GARAGE_KEEP_GATES);
  addHeroVoltSign(THREE, group, mats);
  addSecretDressing(THREE, group, mats);
  parent.add(group);
  return group;
}

export function decorateGarageGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const bar = feltEmissive(THREE, col);
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
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.garageTube || u.garageSpark || u.garageSign || u.garageFan) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickGarageArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickGarageArtObject(o, t) {
  if (o.userData && o.userData.garageTube && o.material) {
    const flicker = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 11.0 + (o.position.z || 0)));
    if (o.material.emissiveIntensity != null) {
      o.material.emissiveIntensity = 2.6 + 0.7 * (0.5 + 0.5 * Math.sin(t * 11.0 + (o.position.z || 0)));
    } else if (o.material.color) {
      o.material.color.setRGB(flicker * 0.18, flicker, flicker * 0.90);
    }
  }
  if (o.userData && o.userData.garageSpark && o.material) {
    const on = Math.sin(t * 18.0) > 0.35;
    if (o.material.emissiveIntensity != null) o.material.emissiveIntensity = on ? 5.5 : 0.4;
    else if (o.material.color) o.material.color.setRGB(on ? 1 : 0.25, on ? 0.88 : 0.22, on ? 0.54 : 0.12);
    o.scale.setScalar(0.7 + 0.6 * Math.max(0, Math.sin(t * 18.0)));
  }
  if (o.userData && o.userData.garageSign) {
    o.rotation.z = Math.sin(t * 0.55) * 0.04;
  }
  if (o.userData && o.userData.garageFan) {
    o.rotation.y = t * 3.2;
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
