// Ryan's Yard — semi-realistic Phoenix backyard (Liftoff / Uncrashed bar).
// Visual only. Colliders live in sim-maps.js BACKYARD_PLAY.
// Generated / CC0 tiling textures. Nothing from the GPL whoop sim.

import { hexNum, propClearOfCourse, applyVibeLighting } from './sim-art-city.js?v=ef5849d4859b';
import { applyFeltMaterial, feltBasic, feltEmissive } from './sim-art-felt.js?v=f76fc4f752df';
import { BACKYARD_PLAY, LAYOUT } from './sim-maps.js?v=d9af70a64707';

export const BACKYARD_STOCK = Object.freeze({
  turf: 0x3f8a4a,
  pebble: 0xc2b39a,
  stucco: 0xc4a882,
  tile: 0xc45a32,
  wood: 0x6a4e32,
  shed: 0x7a8680,
  cmu: 0xb89a72,
  metal: 0x2a2c30,
});

export const BACKYARD_KEEP_GATES = Object.freeze([
  { x: 4.0, y: 2.20, z: 4.2, size: 1.8 },
  { x: 11.0, y: 1.75, z: -6.8, size: 1.6 },
  { x: 17.2, y: 2.25, z: -15.4, size: 1.5 },
  { x: -8.5, y: 1.12, z: -5.5, size: 1.6 },
  { x: -17.6, y: 1.55, z: -12.55, size: 1.6 },
  { x: -21.75, y: 1.18, z: 14.0, size: 1.5 },
  { x: -2.15, y: 5.15, z: 3.43, size: 1.6 },
  { x: -2.15, y: 1.22, z: -1.83, size: 1.6 },
  { x: 1.5, y: 25.2, z: 14.1, size: 1.8 },
]);

export function backyardWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function backyardBudget(applied) {
  if (applied === 'low') {
    return {
      pots: 4, palms: 3, neighbors: 2, stones: 6, glow: false,
      leaves: 64, fenceMesh: true, tufts: 8, pavers: 8, seams: true,
      grass: 160, fronds: 24, caustics: false, shadowCasters: false, skyRes: 256,
      hedge: 12, rimTrees: 4,
    };
  }
  if (applied === 'high') {
    return {
      pots: 8, palms: 3, neighbors: 4, stones: 10, glow: true,
      leaves: 220, fenceMesh: true, tufts: 16, pavers: 16, seams: true,
      grass: 900, fronds: 64, caustics: true, shadowCasters: true, skyRes: 512,
      hedge: 22, rimTrees: 8,
    };
  }
  return {
    pots: 6, palms: 3, neighbors: 3, stones: 8, glow: true,
    leaves: 140, fenceMesh: true, tufts: 12, pavers: 12, seams: true,
    grass: 400, fronds: 40, caustics: true, shadowCasters: true, skyRes: 384,
    hedge: 16, rimTrees: 6,
  };
}

function lockArt(m, extra) {
  if (!m) return m;
  if (!m.userData) m.userData = {};
  m.userData.artLocked = true;
  m.userData.feltLocked = true;
  if (extra) Object.assign(m.userData, extra);
  return m;
}

function heroMat(THREE, hex, extras) {
  const m = new THREE.MeshStandardMaterial(Object.assign({
    color: hex,
    roughness: 0.72,
    metalness: 0.02,
    envMapIntensity: 0.45,
  }, extras || {}));
  return lockArt(m);
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

function canvasTex(THREE, w, h, paint, rx, ry, opts) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  try { paint(g, w, h); } catch (e) {
    if (g) { g.fillStyle = '#3f8a4a'; g.fillRect(0, 0, w, h); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = (opts && opts.clamp) ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.repeat.set(rx == null ? 1 : rx, ry == null ? 1 : ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = !(opts && opts.noMip);
  t.minFilter = t.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.userData.looksComposed = true;
  t.userData.artLocked = true;
  t.needsUpdate = true;
  return t;
}

function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function turfTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = '#2f7a38';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const u = hash(i), v = hash(i + 19);
      const warm = hash(i + 41) > 0.55;
      g.fillStyle = warm
        ? `rgba(150,180,48,${0.07 + hash(i + 7) * 0.12})`
        : `rgba(18,72,26,${0.08 + hash(i + 3) * 0.16})`;
      g.fillRect(u * w, v * h, 1.6, 2.4 + hash(i + 11) * 3);
    }
  }, 18, 18);
}

function pebbleTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#c8b79a'], [1, '#b4a280']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 280; i++) {
      const u = hash(i), v = hash(i + 23);
      g.fillStyle = `rgba(${150 + (i % 50)},${132 + (i % 36)},${100 + (i % 20)},0.34)`;
      g.beginPath();
      g.ellipse(u * w, v * h, 2 + (i % 5), 1.4 + (i % 4), u * 3, 0, 6.3);
      g.fill();
    }
  }, 7, 7);
}

function paverTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#8e7a62';
    g.fillRect(0, 0, w, h);
    const cells = [[2, 2, '#c8b49a'], [66, 2, '#b4a080'], [2, 66, '#a89878'], [66, 66, '#c0ae90']];
    for (const c of cells) {
      g.fillStyle = c[2];
      g.fillRect(c[0], c[1], 60, 60);
      g.fillStyle = 'rgba(255,236,210,0.16)';
      g.fillRect(c[0] + 3, c[1] + 3, 22, 10);
    }
  }, 5, 5);
}

function stuccoTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#e8d2aa'], [0.55, '#c8a878'], [1, '#9a7a52']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 620; i++) {
      g.fillStyle = hash(i) > 0.5 ? 'rgba(110,80,40,0.22)' : 'rgba(250,230,190,0.20)';
      g.fillRect(hash(i + 2) * w, hash(i + 5) * h, 5 + (i % 6), 3 + (i % 4));
    }
    g.strokeStyle = 'rgba(90,70,40,0.18)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  }, 4, 4);
}

function tileTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#7a2e14';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      const ox = (y % 16) ? 8 : 0;
      for (let x = -8; x < w; x += 16) {
        g.fillStyle = '#c45a32';
        g.beginPath();
        g.ellipse(x + ox + 8, y + 4, 7, 3.4, 0, 0, 6.3);
        g.fill();
        g.fillStyle = '#e07848';
        g.beginPath();
        g.ellipse(x + ox + 6, y + 3, 3.2, 1.4, 0, 0, 6.3);
        g.fill();
      }
    }
  }, 12, 8);
}

function woodTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#8a6238'], [0.5, '#6a4e32'], [1, '#4e361e']]);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,24,12,0.28)';
    g.lineWidth = 1;
    for (let x = 4; x < w; x += 8) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 2, h); g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(90,50,20,${0.08 + hash(i) * 0.12})`;
      g.beginPath();
      g.moveTo(hash(i) * w, 0);
      g.bezierCurveTo(hash(i + 1) * w, 40, hash(i + 2) * w, 80, hash(i + 3) * w, h);
      g.stroke();
    }
  }, 2, 4);
}

function meshTex(THREE) {
  return canvasTex(THREE, 64, 64, (g, w, h) => {
    g.fillStyle = '#2a3036';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#121416';
    g.lineWidth = 2;
    for (let y = -8; y < h + 8; y += 10) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 18); g.stroke();
      g.beginPath(); g.moveTo(0, y + 18); g.lineTo(w, y); g.stroke();
    }
  }, 4, 8);
}

function waterTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#0e6e8a'], [0.45, '#1aa0b8'], [1, '#0a4e68']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(230,255,250,${0.06 + (i % 5) * 0.04})`;
      g.beginPath();
      g.arc(hash(i) * w, hash(i + 9) * h, 8 + (i % 10), 0.2, 2.6);
      g.stroke();
    }
    g.fillStyle = 'rgba(180,230,255,0.10)';
    g.fillRect(0, 0, w, 40);
  }, 3, 3);
}

function causticTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(210,255,240,${0.10 + hash(i) * 0.22})`;
      g.lineWidth = 1.2 + (i % 3);
      g.beginPath();
      const x = hash(i) * w, y = hash(i + 13) * h;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 18, y - 10, x + 36, y + 4);
      g.quadraticCurveTo(x + 52, y + 16, x + 22, y + 20);
      g.stroke();
    }
  }, 2, 2);
}

function poolTileTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#147a8c';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = (x + y) % 32 ? '#1a8fa0' : '#0e6a7a';
        g.fillRect(x + 1, y + 1, 14, 14);
        g.fillStyle = 'rgba(220,255,255,0.12)';
        g.fillRect(x + 2, y + 2, 6, 3);
      }
    }
  }, 8, 6);
}

function leafTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1a4a1c';
    g.beginPath();
    g.moveTo(w * 0.5, 4);
    g.bezierCurveTo(w * 0.95, h * 0.28, w * 0.88, h * 0.72, w * 0.5, h - 4);
    g.bezierCurveTo(w * 0.12, h * 0.72, w * 0.05, h * 0.28, w * 0.5, 4);
    g.fill();
    g.fillStyle = '#3d8f32';
    g.beginPath();
    g.moveTo(w * 0.5, 10);
    g.bezierCurveTo(w * 0.82, h * 0.30, w * 0.78, h * 0.66, w * 0.5, h - 10);
    g.bezierCurveTo(w * 0.22, h * 0.66, w * 0.18, h * 0.30, w * 0.5, 10);
    g.fill();
    g.strokeStyle = 'rgba(20,60,18,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.5, 8);
    g.lineTo(w * 0.5, h - 8);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const y = 22 + i * 14;
      g.beginPath();
      g.moveTo(w * 0.5, y);
      g.lineTo(w * 0.22, y + 8);
      g.moveTo(w * 0.5, y);
      g.lineTo(w * 0.78, y + 8);
      g.stroke();
    }
  }, 1, 1, { clamp: true });
}

function frondTex(THREE) {
  return canvasTex(THREE, 64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1e5a22';
    g.beginPath();
    g.moveTo(w * 0.5, 4);
    g.bezierCurveTo(w * 0.98, h * 0.22, w * 0.86, h * 0.7, w * 0.5, h - 2);
    g.bezierCurveTo(w * 0.14, h * 0.7, w * 0.02, h * 0.22, w * 0.5, 4);
    g.fill();
    g.fillStyle = '#3f8f36';
    g.beginPath();
    g.moveTo(w * 0.5, 14);
    g.bezierCurveTo(w * 0.82, h * 0.26, w * 0.74, h * 0.66, w * 0.5, h - 10);
    g.bezierCurveTo(w * 0.26, h * 0.66, w * 0.18, h * 0.26, w * 0.5, 14);
    g.fill();
    g.strokeStyle = 'rgba(16,48,16,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.5, 8);
    g.lineTo(w * 0.5, h - 6);
    g.stroke();
  }, 1, 1, { clamp: true });
}

function grassCardTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) {
      const x = 4 + (i * 5.4);
      g.fillStyle = i % 3 ? '#3d8f3a' : '#246628';
      g.beginPath();
      g.moveTo(x, h);
      g.quadraticCurveTo(x + 4, h * 0.42, x + (i % 2 ? 8 : -6), 4);
      g.quadraticCurveTo(x + 7, h * 0.5, x + 4, h);
      g.fill();
    }
  }, 1, 1, { clamp: true });
}

function afternoonSkyTex(THREE, res) {
  const w = res || 512;
  const h = Math.max(256, (res || 512) * 0.75);
  return canvasTex(THREE, w, h, (g, ww, hh) => {
    fillGrad(g, 0, 0, 0, hh, [
      [0, '#1f5fa8'], [0.28, '#3d8fd4'], [0.52, '#7eb6e8'], [0.72, '#c5d8ee'], [0.88, '#e2c89a'], [1, '#c4a070'],
    ]);
    g.fillRect(0, 0, ww, hh);
    g.fillStyle = 'rgba(255,214,140,0.55)';
    g.beginPath();
    g.arc(ww * 0.78, hh * 0.16, 18, 0, 6.3);
    g.fill();
    g.fillStyle = 'rgba(255,232,180,0.18)';
    g.beginPath();
    g.arc(ww * 0.78, hh * 0.16, 56, 0, 6.3);
    g.fill();
    const banks = [
      [0.22, 0.18, 160, 28], [0.58, 0.14, 190, 32], [0.84, 0.20, 140, 24],
    ];
    for (const [ux, uy, rx, ry] of banks) {
      const x = ux * ww, y = uy * hh;
      const rad = g.createRadialGradient(x, y, 8, x, y, rx);
      rad.addColorStop(0, 'rgba(236,242,248,0.38)');
      rad.addColorStop(0.55, 'rgba(200,216,232,0.18)');
      rad.addColorStop(1, 'rgba(140,160,184,0)');
      g.fillStyle = rad;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, 6.3);
      g.fill();
    }
  }, 1, 1, { clamp: true, noMip: true });
}

function dappleTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(20,40,16,${0.10 + hash(i) * 0.16})`;
      g.beginPath();
      g.ellipse(hash(i) * w, hash(i + 8) * h, 8 + (i % 10), 6 + (i % 7), hash(i) * 2, 0, 6.3);
      g.fill();
    }
  }, 1, 1, { clamp: true });
}

function mergeGeos(THREE, list) {
  const pos = [], nor = [], uv = [];
  for (const g of list) {
    if (!g) continue;
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    const u = src.getAttribute('uv');
    if (!p) {
      if (src !== g) src.dispose();
      g.dispose();
      continue;
    }
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
    }
    if (src !== g) src.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function placedBox(THREE, w, h, d, x, y, z, ry) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function placedCyl(THREE, rTop, rBot, h, x, y, z, segs) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs || 8);
  g.translate(x, y + h / 2, z);
  return g;
}

function kidneyGeo(THREE, depth, bevel) {
  const s = new THREE.Shape();
  s.moveTo(-10, -2);
  s.bezierCurveTo(-13, -6, -8, -8, -2, -6);
  s.bezierCurveTo(4, -4, 10, -5, 11, -1);
  s.bezierCurveTo(12, 3, 6, 6, 0, 5);
  s.bezierCurveTo(-8, 4, -12, 3, -10, -2);
  return new THREE.ExtrudeGeometry(s, {
    depth: depth == null ? 0.14 : depth,
    bevelEnabled: true,
    bevelThickness: bevel == null ? 0.05 : bevel,
    bevelSize: bevel == null ? 0.06 : bevel,
    bevelSegments: 1,
    curveSegments: 10,
  });
}

function placedBevelBox(THREE, w, h, d, x, y, z, bevel) {
  const s = new THREE.Shape();
  const hw = w * 0.5, hd = d * 0.5;
  s.moveTo(-hw, -hd);
  s.lineTo(hw, -hd);
  s.lineTo(hw, hd);
  s.lineTo(-hw, hd);
  s.closePath();
  const b = bevel == null ? 0.06 : bevel;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.08, h - b * 2),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(x, y + b, z);
  return g;
}

function canopyLathe(THREE) {
  const pts = [
    new THREE.Vector2(0.1, 0),
    new THREE.Vector2(3.4, 0.6),
    new THREE.Vector2(4.2, 2.2),
    new THREE.Vector2(2.6, 4.4),
    new THREE.Vector2(0.8, 5.6),
    new THREE.Vector2(0.0, 5.8),
  ];
  return new THREE.LatheGeometry(pts, 10);
}

function mark(o, shadow) {
  o.userData.backyardArt = true;
  if (shadow !== false) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  return o;
}

function addMerged(THREE, parent, geos, mat, shadow) {
  if (!geos.length) return null;
  const mesh = new THREE.Mesh(mergeGeos(THREE, geos), mat);
  mark(mesh, shadow);
  parent.add(mesh);
  return mesh;
}

function addInstanced(THREE, parent, geo, mat, count, place, shadow) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = !!shadow;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.artInstanced = true;
  mesh.userData.backyardArt = true;
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

function inPool(x, z) {
  const P = BACKYARD_PLAY.pool;
  return Math.abs(x - P.x) < P.w * 0.56 && Math.abs(z - P.z) < P.d * 0.56;
}

function onHardscape(x, z) {
  const patio = BACKYARD_PLAY.patio;
  const pad = BACKYARD_PLAY.pad;
  if (Math.abs(x - patio.x) < patio.w * 0.52 && Math.abs(z - patio.z) < patio.d * 0.52) return true;
  if (Math.abs(x - pad.x) < pad.w * 0.55 && Math.abs(z - pad.z) < pad.d * 0.55) return true;
  return false;
}

function makeYardMats(THREE, vibe, quality, budget) {
  const pal = vibe.palette;
  const glow = backyardWantsGlow(quality);
  const turf = turfTex(THREE);
  const pebble = pebbleTex(THREE);
  const stucco = stuccoTex(THREE);
  return {
    turf: heroMat(THREE, 0xffffff, {
      map: turf, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.22,
    }),
    pebble: heroMat(THREE, 0xffffff, {
      map: pebble, roughness: 0.88, metalness: 0.02, envMapIntensity: 0.28,
    }),
    paver: heroMat(THREE, 0xffffff, {
      map: paverTex(THREE), roughness: 0.82, metalness: 0.04,
    }),
    stucco: heroMat(THREE, 0xf2d4a8, {
      map: stucco, roughness: 0.86, metalness: 0.01, envMapIntensity: 0.22,
    }),
    tile: heroMat(THREE, 0xffffff, {
      map: tileTex(THREE), roughness: 0.70, metalness: 0.06,
    }),
    wood: heroMat(THREE, 0xffffff, {
      map: woodTex(THREE), roughness: 0.78, metalness: 0.02,
    }),
    shed: heroMat(THREE, hexNum('#6a7470'), { roughness: 0.80, metalness: 0.08 }),
    cmu: heroMat(THREE, 0xffffff, { map: stucco, roughness: 0.90, metalness: 0.02 }),
    metal: heroMat(THREE, hexNum('#2a2c30'), { roughness: 0.42, metalness: 0.38, envMapIntensity: 0.55 }),
    mesh: heroMat(THREE, 0xffffff, {
      map: meshTex(THREE), roughness: 0.55, metalness: 0.22, envMapIntensity: 0.4,
    }),
    leaf: heroMat(THREE, hexNum('#2f7a34'), { roughness: 0.82, metalness: 0.0 }),
    darkLeaf: heroMat(THREE, hexNum('#1e5a24'), { roughness: 0.86, metalness: 0.0 }),
    leafCard: heroMat(THREE, 0xffffff, {
      map: leafTex(THREE), transparent: true, alphaTest: 0.28, side: THREE.DoubleSide,
      roughness: 0.78, metalness: 0.0, depthWrite: true,
    }),
    frondCard: heroMat(THREE, 0xffffff, {
      map: frondTex(THREE), transparent: true, alphaTest: 0.28, side: THREE.DoubleSide,
      roughness: 0.76, metalness: 0.0, depthWrite: true,
    }),
    grassCard: heroMat(THREE, 0xffffff, {
      map: grassCardTex(THREE), transparent: true, alphaTest: 0.22, side: THREE.DoubleSide,
      roughness: 0.90, metalness: 0.0, depthWrite: true,
    }),
    water: lockArt(new THREE.MeshStandardMaterial({
      color: 0x2ec4d6,
      map: waterTex(THREE),
      transparent: true,
      opacity: 0.86,
      roughness: 0.06,
      metalness: 0.28,
      envMapIntensity: 1.35,
      depthWrite: false,
    }), { heroWet: true, looksSkip: true }),
    caustic: lockArt(new THREE.MeshBasicMaterial({
      map: causticTex(THREE),
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }), { looksSkip: true, heroWet: true }),
    poolTile: heroMat(THREE, 0xffffff, {
      map: poolTileTex(THREE), roughness: 0.35, metalness: 0.12, envMapIntensity: 0.7,
    }),
    dark: heroMat(THREE, hexNum('#2a241c'), { roughness: 0.70, metalness: 0.08 }),
    window: lockArt(new THREE.MeshBasicMaterial({
      color: 0xc8dce8,
      toneMapped: false,
    }), { looksSkip: true }),
    shade: heroMat(THREE, hexNum('#c45a32'), { roughness: 0.78, metalness: 0.02 }),
    pvc: heroMat(THREE, 0xf4f1ea, { roughness: 0.48, metalness: 0.04, envMapIntensity: 0.38 }),
    yellow: heroMat(THREE, hexNum('#e8c04a'), { roughness: 0.62, metalness: 0.04 }),
    cactus: heroMat(THREE, hexNum('#3a7a3a'), { roughness: 0.86, metalness: 0.0 }),
    red: heroMat(THREE, hexNum('#c45a40'), { roughness: 0.70, metalness: 0.04 }),
    wicker: heroMat(THREE, hexNum('#c4a06a'), { roughness: 0.80, metalness: 0.02 }),
    sky: lockArt(new THREE.MeshBasicMaterial({
      map: afternoonSkyTex(THREE, budget.skyRes),
      side: THREE.BackSide,
      fog: false,
      depthWrite: true,
      toneMapped: false,
    }), { looksSkip: true }),
    dapple: lockArt(new THREE.MeshBasicMaterial({
      map: dappleTex(THREE),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      toneMapped: false,
    }), { looksSkip: true }),
    glow: glow ? feltEmissive(THREE, hexNum(pal.laneAlt)) : feltBasic(THREE, hexNum(pal.laneAlt)),
  };
}

export function hideStockBackyardMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.backyardArt) return;
    if (o.parent && o.parent.name === 'backyardArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    if (col === BACKYARD_STOCK.stucco || col === BACKYARD_STOCK.tile
      || col === BACKYARD_STOCK.wood || col === BACKYARD_STOCK.shed
      || col === BACKYARD_STOCK.metal || col === BACKYARD_STOCK.cmu) {
      o.visible = false;
      o.userData.artHidden = true;
      n++;
    }
  });
  return n;
}

export function restyleBackyardShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const turf = turfTex(THREE);
  const pebble = pebbleTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.backyardArt || (o.parent && o.parent.name === 'backyardArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (t === 'PlaneGeometry' && o === floor) {
      m.map = pebble;
      m.color.setHex(0xffffff);
      if (m.roughness != null) m.roughness = 0.88;
      lockArt(m);
      o.receiveShadow = true;
      n++;
    } else if (t === 'PlaneGeometry' && col === BACKYARD_STOCK.pebble) {
      m.map = paverTex(THREE);
      m.color.setHex(0xffffff);
      if (m.roughness != null) m.roughness = 0.82;
      lockArt(m);
      o.receiveShadow = true;
      n++;
    } else if (t === 'PlaneGeometry' && col === BACKYARD_STOCK.turf) {
      m.map = turf;
      m.color.setHex(0xffffff);
      if (m.roughness != null) m.roughness = 0.92;
      lockArt(m);
      o.receiveShadow = true;
      n++;
    } else if (col === BACKYARD_STOCK.cmu) {
      m.map = pebble;
      m.color.setHex(0xffffff);
      lockArt(m);
      o.receiveShadow = true;
      n++;
    }
  });
  return n;
}

function addSky(THREE, parent, mats) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 16), mats.sky);
  dome.position.y = 8;
  mark(dome, false);
  dome.userData.backyardProcSky = true;
  parent.add(dome);
}

function addYardWalls(THREE, parent, mats) {
  const L = LAYOUT.backyard;
  const P = BACKYARD_PLAY;
  const t = L.wall, hx = L.w / 2, hz = L.d / 2, wh = P.wallH;
  addMerged(THREE, parent, [
    placedBevelBox(THREE, L.w, wh, t, 0, 0, -hz, 0.04),
    placedBevelBox(THREE, t, wh, L.d, -hx, 0, 0, 0.04),
    placedBevelBox(THREE, t, wh, L.d, hx, 0, 0, 0.04),
    placedBevelBox(THREE, P.streetWall.w, wh, t, P.streetWall.x, 0, hz, 0.04),
  ], mats.stucco);
}

function addHouse(THREE, parent, mats) {
  const P = BACKYARD_PLAY;
  const hs = P.house;
  const stucco = [
    placedBevelBox(THREE, hs.w, hs.wallH, hs.d, hs.x, 0, hs.z, 0.08),
    placedBevelBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x - P.patio.w / 2 + P.patio.col, 0, P.patio.z - P.patio.d / 2 + P.patio.col, 0.04),
    placedBevelBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x + P.patio.w / 2 - P.patio.col, 0, P.patio.z - P.patio.d / 2 + P.patio.col, 0.04),
    placedBevelBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x - P.patio.w / 2 + P.patio.col, 0, P.patio.z + P.patio.d / 2 - P.patio.col, 0.04),
    placedBevelBox(THREE, P.patio.col, P.patio.ceilY, P.patio.col, P.patio.x + P.patio.w / 2 - P.patio.col, 0, P.patio.z + P.patio.d / 2 - P.patio.col, 0.04),
    placedBevelBox(THREE, P.patio.w, P.patio.ceilH, P.patio.d, P.patio.x, P.patio.ceilY, P.patio.z, 0.04),
    placedBevelBox(THREE, P.wing.w, P.wing.wallH, P.wing.d, P.wing.x, 0, P.wing.z, 0.06),
  ];
  addMerged(THREE, parent, stucco, mats.stucco);
  addMerged(THREE, parent, [
    placedBevelBox(THREE, P.ridge.w, P.ridge.h, P.ridge.d, P.ridge.x, P.ridge.y, P.ridge.z, 0.04),
  ], mats.tile);
  const wins = [];
  const frames = [];
  const faceZ = hs.z - hs.d / 2 - 0.06;
  for (const [cx, cy] of [[-4.2, 4.4], [8.2, 4.4], [-4.2, 13.2], [8.2, 13.2]]) {
    for (const dx of [-0.95, 0.95]) {
      for (const dy of [-0.78, 0.78]) {
        wins.push(placedBox(THREE, 1.35, 1.12, 0.04, cx + dx, cy + dy, faceZ));
        frames.push(placedBox(THREE, 1.52, 0.07, 0.10, cx + dx, cy + dy - 0.58, faceZ - 0.04));
        frames.push(placedBox(THREE, 1.52, 0.07, 0.10, cx + dx, cy + dy + 0.58, faceZ - 0.04));
        frames.push(placedBox(THREE, 0.07, 1.24, 0.10, cx + dx - 0.70, cy + dy, faceZ - 0.04));
        frames.push(placedBox(THREE, 0.07, 1.24, 0.10, cx + dx + 0.70, cy + dy, faceZ - 0.04));
      }
    }
  }
  addMerged(THREE, parent, wins, mats.window, false);
  addMerged(THREE, parent, frames, mats.wood);
  const shade = new THREE.Mesh(placedBox(THREE, P.shade.w, P.shade.h, P.shade.d, P.shade.x, P.shade.y, P.shade.z), mats.metal);
  mark(shade);
  parent.add(shade);
}

function addPvc(THREE, parent, mats) {
  const p = BACKYARD_PLAY.pvc;
  const hx = p.innerD / 2, hz = p.innerW / 2, b = p.bar;
  const geos = [];
  for (const dx of [-hx, hx]) {
    for (const dz of [-hz, hz]) geos.push(placedBox(THREE, b, p.h, b, p.x + dx, 0, p.z + dz));
  }
  for (const y of [p.h - b, p.midY]) {
    geos.push(placedBox(THREE, p.innerD + b, b, b, p.x, y, p.z - hz));
    geos.push(placedBox(THREE, p.innerD + b, b, b, p.x, y, p.z + hz));
    geos.push(placedBox(THREE, b, b, p.innerW + b, p.x - hx, y, p.z));
    geos.push(placedBox(THREE, b, b, p.innerW + b, p.x + hx, y, p.z));
  }
  addMerged(THREE, parent, geos, mats.pvc);
}

function addLeafCards(THREE, parent, mats, cx, cy, cz, count, spread, tall, shadow, cardW, cardH) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  group.userData.backyardPalm = true;
  group.userData.backyardArt = true;
  const geo = new THREE.PlaneGeometry(cardW || 0.92, cardH || 1.08);
  addInstanced(THREE, group, geo, mats.leafCard, count, (dummy, i) => {
    const theta = hash(i) * Math.PI * 2;
    const phi = Math.acos(2 * hash(i + 3) - 1) * 0.62;
    const r = spread * (0.35 + hash(i + 5) * 0.7);
    dummy.position.set(
      Math.sin(phi) * Math.cos(theta) * r,
      cy + Math.cos(phi) * tall * 0.55,
      Math.sin(phi) * Math.sin(theta) * r,
    );
    dummy.rotation.set(-0.4 + hash(i + 7) * 0.8, theta + 0.4, hash(i + 9) * 0.7 - 0.35);
    const s = 0.7 + hash(i + 11) * 0.55;
    dummy.scale.set(s, s, 1);
  }, shadow);
  parent.add(group);
  return group;
}

function addPalmFronds(THREE, parent, mats, cx, cy, cz, count, span, shadow) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  group.userData.backyardPalm = true;
  group.userData.backyardArt = true;
  const geo = new THREE.PlaneGeometry(0.72, 5.4);
  geo.translate(0, 2.65, 0);
  addInstanced(THREE, group, geo, mats.frondCard, count, (dummy, i) => {
    const a = (i / count) * Math.PI * 2 + hash(i) * 0.16;
    const droop = 0.95 + hash(i) * 0.42;
    dummy.position.set(Math.cos(a) * 0.10, cy, Math.sin(a) * 0.10);
    dummy.rotation.set(droop, a, hash(i + 2) * 0.12 - 0.06);
    dummy.scale.set(0.82 + hash(i + 3) * 0.38, span, 1);
  }, shadow);
  parent.add(group);
  return group;
}

function addTree(THREE, parent, mats, budget) {
  const t = BACKYARD_PLAY.ficus;
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(t.r, t.h - t.r * 2, 4, 8), mats.wood);
  trunk.position.set(t.x, t.h / 2, t.z);
  trunk.userData.backyardProcTree = true;
  mark(trunk);
  parent.add(trunk);
  addLeafCards(THREE, parent, mats, t.x, t.h * 0.58, t.z, budget.leaves, 4.4, 4.0, budget.shadowCasters, 1.28, 1.55);
  const ring = BACKYARD_PLAY.planter;
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, ring.rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, ring.rIn, 0, Math.PI * 2, true);
  ringShape.holes.push(hole);
  const ringGeo = new THREE.ExtrudeGeometry(ringShape, { depth: ring.h, bevelEnabled: false, curveSegments: 10 });
  ringGeo.rotateX(-Math.PI / 2);
  const planter = new THREE.Mesh(ringGeo, mats.cmu);
  planter.position.set(ring.x, 0, ring.z);
  planter.userData.backyardProcPlanter = true;
  mark(planter);
  parent.add(planter);
  const dapple = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 9.2), mats.dapple);
  dapple.rotation.x = -Math.PI / 2;
  dapple.position.set(t.x + 0.8, 0.03, t.z + 0.6);
  mark(dapple, false);
  parent.add(dapple);
}

function addPool(THREE, parent, mats, budget) {
  const P = BACKYARD_PLAY;
  const basin = new THREE.Mesh(
    placedBox(THREE, P.pool.w * 0.94, 0.42, P.pool.d * 0.94, P.pool.x, -0.40, P.pool.z),
    mats.poolTile,
  );
  mark(basin);
  parent.add(basin);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(P.pool.w * 0.92, P.pool.d * 0.92), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(P.pool.x, 0.09, P.pool.z);
  water.userData.backyardPool = true;
  mark(water, false);
  parent.add(water);
  if (budget.caustics) {
    const caustic = new THREE.Mesh(new THREE.PlaneGeometry(P.pool.w * 0.9, P.pool.d * 0.9), mats.caustic);
    caustic.rotation.x = -Math.PI / 2;
    caustic.position.set(P.pool.x, 0.045, P.pool.z);
    caustic.userData.backyardPool = true;
    mark(caustic, false);
    parent.add(caustic);
  }
  const deck = [
    placedBevelBox(THREE, P.pool.w + P.deckT * 2, 0.22, P.deckT, P.pool.x, 0, P.pool.z - P.pool.d / 2 - P.deckT / 2, 0.03),
    placedBevelBox(THREE, P.pool.w + P.deckT * 2, 0.22, P.deckT, P.pool.x, 0, P.pool.z + P.pool.d / 2 + P.deckT / 2, 0.03),
    placedBevelBox(THREE, P.deckT, 0.22, P.pool.d, P.pool.x - P.pool.w / 2 - P.deckT / 2, 0, P.pool.z, 0.03),
    placedBevelBox(THREE, P.deckT, 0.22, P.pool.d, P.pool.x + P.pool.w / 2 + P.deckT / 2, 0, P.pool.z, 0.03),
    placedBevelBox(THREE, P.pad.w, P.pad.h, P.pad.d, P.pad.x, 0, P.pad.z, 0.03),
    placedBevelBox(THREE, P.fire.w, 0.12, P.fire.d, P.fire.x, 0, P.fire.z, 0.02),
  ];
  const coping = addMerged(THREE, parent, deck, mats.pebble);
  if (coping) coping.userData.backyardProcCoping = true;
}

function addFenceAndPots(THREE, parent, mats, budget, gates) {
  const P = BACKYARD_PLAY;
  const fn = P.fence;
  const posts = [];
  const panels = [];
  let i = 0;
  for (let z = fn.z0; z <= fn.z1 + 0.05; z += fn.spacing, i++) {
    posts.push(placedBox(THREE, fn.post, fn.h, fn.post, fn.x, 0, z));
    posts.push(placedBox(THREE, fn.post + 0.06, 0.10, fn.post + 0.06, fn.x, fn.h, z));
    if (i % 2 === 0 && z + fn.spacing <= fn.z1 + 0.05) {
      const mid = z + fn.spacing / 2;
      const span = fn.spacing - fn.post;
      panels.push(placedBox(THREE, fn.meshT, fn.meshH, span, fn.x, fn.meshY, mid));
      for (let r = 0; r < 5; r++) {
        posts.push(placedBox(THREE, 0.03, 0.05, span, fn.x + 0.04, fn.meshY + 0.35 + r * 0.68, mid));
      }
      for (let c = -2; c <= 2; c++) {
        posts.push(placedBox(THREE, 0.03, fn.meshH, 0.04, fn.x + 0.04, fn.meshY, mid + c * (span / 5)));
      }
    }
  }
  const postMesh = addMerged(THREE, parent, posts, mats.metal);
  const panelMesh = addMerged(THREE, parent, panels, mats.mesh);
  if (postMesh) postMesh.userData.backyardProcFence = true;
  if (panelMesh) panelMesh.userData.backyardProcFence = true;
  const potSpots = P.pots.map((pot, idx) => [pot.x, pot.z, idx % 2 ? mats.red : mats.cactus, pot.r, pot.h]);
  const extras = [
    [-6.4, 2.6, mats.red, 0.26, 0.62], [6.8, 2.2, mats.cactus, 0.24, 0.58],
    [-12.2, -12.8, mats.cactus, 0.26, 0.64], [10.4, -14.6, mats.red, 0.24, 0.58],
  ];
  const all = potSpots.concat(extras);
  const n = Math.min(budget.pots, all.length);
  for (let k = 0; k < n; k++) {
    const s = all[k];
    if (!propClearOfCourse(s[0], s[1], 0.28, gates, { gatePad: 1.4, corridor: 1.2, yRange: 2 })) continue;
    const pot = new THREE.Mesh(placedCyl(THREE, s[3], s[3] * 0.85, s[4], 0, 0, 0, 8), mats.tile);
    pot.position.set(s[0], 0, s[1]);
    pot.userData.backyardProcPot = true;
    mark(pot);
    parent.add(pot);
    const plant = new THREE.Mesh(new THREE.CapsuleGeometry(s[3] * 0.45, s[4] * 0.55, 3, 6), s[2]);
    plant.position.set(s[0], s[4] + 0.22, s[1]);
    plant.userData.backyardProcPot = true;
    plant.userData.backyardProcShrub = true;
    mark(plant);
    parent.add(plant);
  }
}

function addPatioDress(THREE, parent, mats, budget, gates) {
  const P = BACKYARD_PLAY;
  for (const pot of P.patioPlanters) {
    if (!propClearOfCourse(pot.x, pot.z, pot.r, gates, { gatePad: 1.2, corridor: 1.0, yRange: 2 })) continue;
    const body = new THREE.Mesh(placedCyl(THREE, pot.r, pot.r * 0.85, pot.h, 0, 0, 0, 8), mats.tile);
    body.position.set(pot.x, 0, pot.z);
    body.userData.backyardProcPot = true;
    mark(body);
    parent.add(body);
    const plant = new THREE.Mesh(new THREE.CapsuleGeometry(pot.r * 0.42, pot.h * 0.55, 3, 6), mats.cactus);
    plant.position.set(pot.x, pot.h + 0.22, pot.z);
    plant.userData.backyardProcPot = true;
    mark(plant);
    parent.add(plant);
    addLeafCards(THREE, parent, mats, pot.x, pot.h + 0.28, pot.z, Math.max(7, (budget.leaves / 12) | 0), 0.42, 0.38, false, 0.55, 0.68);
  }
}

function addSoftAoAndTufts(THREE, parent, mats, budget, gates) {
  const P = BACKYARD_PLAY;
  const tufts = [];
  const n = budget.tufts;
  const hw = P.turf.w * 0.42, hd = P.turf.d * 0.42;
  for (let i = 0; i < n; i++) {
    const x = P.turf.x + ((i * 17) % 80 - 40) / 40 * hw;
    const z = P.turf.z + ((i * 29) % 70 - 35) / 35 * hd;
    if (inPool(x, z) || onHardscape(x, z)) continue;
    if (!propClearOfCourse(x, z, 0.18, gates, { gatePad: 1.1, corridor: 1.0, yRange: 2 })) continue;
    tufts.push(placedCyl(THREE, 0.04, 0.08, 0.28 + (i % 3) * 0.05, x, 0.06, z, 5));
  }
  addMerged(THREE, parent, tufts, mats.leaf);
}

function addGrass(THREE, parent, mats, budget, gates) {
  const n = budget.grass;
  if (n <= 0) return;
  const T = BACKYARD_PLAY.turf;
  const blade = new THREE.PlaneGeometry(0.28, 0.40);
  blade.translate(0, 0.20, 0);
  const cross = blade.clone();
  cross.rotateY(Math.PI / 2);
  const geo = mergeGeos(THREE, [blade, cross]);
  addInstanced(THREE, parent, geo, mats.grassCard, n, (dummy, i) => {
    const x = T.x + (hash(i) - 0.5) * T.w * 0.88;
    const z = T.z + (hash(i + 17) - 0.5) * T.d * 0.88;
    if (inPool(x, z) || onHardscape(x, z)) return false;
    if (!propClearOfCourse(x, z, 0.16, gates, { gatePad: 1.05, corridor: 0.95, yRange: 2 })) return false;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, hash(i + 4) * 6.28, 0);
    const s = 0.95 + hash(i + 8) * 0.7;
    dummy.scale.set(s, 0.85 + hash(i + 10) * 0.55, 1);
  }, false);
}

function addLounge(THREE, parent, mats, budget) {
  const P = BACKYARD_PLAY;
  const sofa = new THREE.Mesh(placedBevelBox(THREE, P.sofa.w, P.sofa.seatH, P.sofa.d, P.sofa.x, 0, P.sofa.z, 0.04), mats.wicker);
  sofa.userData.backyardProcPatio = true;
  mark(sofa);
  parent.add(sofa);
  const back = new THREE.Mesh(placedBevelBox(THREE, P.sofa.w, P.sofa.backH - P.sofa.seatH, P.sofa.backD, P.sofa.x, P.sofa.seatH, P.sofa.z - P.sofa.d / 2 + P.sofa.backD / 2, 0.03), mats.wicker);
  back.userData.backyardProcPatio = true;
  mark(back);
  parent.add(back);
  const u = P.umbrella;
  const pole = new THREE.Mesh(placedCyl(THREE, u.bar, u.bar * 0.85, 2.55, u.x, 0, u.z, 6), mats.metal);
  pole.userData.backyardProcPatio = true;
  mark(pole);
  parent.add(pole);
  const cloth = new THREE.Mesh(new THREE.SphereGeometry(u.r, 12, 7, 0, Math.PI * 2, 0, 1.15), mats.shade);
  cloth.position.set(u.x, 2.62, u.z);
  cloth.scale.set(1, 0.38, 1);
  cloth.userData.backyardProcPatio = true;
  mark(cloth);
  parent.add(cloth);
  const n = Math.min(budget.palms, P.palms.length);
  for (let i = 0; i < n; i++) {
    const p = P.palms[i];
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(p.r, p.h - 0.4, 3, 6), mats.wood);
    trunk.position.set(p.x, p.h / 2, p.z);
    trunk.userData.backyardPalm = true;
    trunk.userData.backyardProcPalm = true;
    mark(trunk);
    parent.add(trunk);
    const fronds = addPalmFronds(THREE, parent, mats, p.x, p.h - 0.28, p.z, Math.max(18, (budget.fronds / n) | 0), i === 2 ? 1.7 : 1.35, budget.shadowCasters);
    if (fronds) fronds.userData.backyardProcPalm = true;
    const dapple = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), mats.dapple);
    dapple.rotation.x = -Math.PI / 2;
    dapple.position.set(p.x + 0.4, 0.025, p.z + 0.35);
    mark(dapple, false);
    parent.add(dapple);
  }
}

function addYardExtras(THREE, parent, mats) {
  const P = BACKYARD_PLAY;
  const shed = new THREE.Mesh(placedBevelBox(THREE, P.shed.w, P.shed.h, P.shed.d, P.shed.x, 0, P.shed.z, 0.05), mats.shed);
  mark(shed);
  parent.add(shed);
  const acBits = [placedBox(THREE, P.ac.w, P.ac.h, P.ac.d, P.ac.x, 0, P.ac.z)];
  for (let i = 0; i < 5; i++) {
    acBits.push(placedBox(THREE, P.ac.w - 0.18, 0.06, 0.04, P.ac.x, 0.28 + i * 0.34, P.ac.z + P.ac.d / 2 + 0.03));
  }
  const acMesh = addMerged(THREE, parent, acBits, mats.metal);
  if (acMesh) acMesh.userData.backyardProcAc = true;
  const planks = [];
  const gw = P.woodGate.w, gh = P.woodGate.h, gd = P.woodGate.d;
  const n = 7, pw = gw / n;
  for (let i = 0; i < n; i++) {
    planks.push(placedBox(THREE, pw + 0.02, gh, gd, P.woodGate.x - gw / 2 + (i + 0.5) * pw, 0, P.woodGate.z));
  }
  planks.push(placedBox(THREE, gw, 0.14, gd + 0.04, P.woodGate.x, 0.55, P.woodGate.z));
  planks.push(placedBox(THREE, gw, 0.14, gd + 0.04, P.woodGate.x, gh - 0.7, P.woodGate.z));
  const gateMesh = addMerged(THREE, parent, planks, mats.wood);
  if (gateMesh) gateMesh.userData.backyardProcGate = true;
  const bowl = new THREE.Mesh(placedCyl(THREE, P.fire.bowlR, P.fire.bowlR * 0.8, P.fire.bowlH, P.fire.x, 0.12, P.fire.z, 10), mats.metal);
  mark(bowl);
  parent.add(bowl);
}

function addNeighbors(THREE, parent, mats, budget) {
  const geos = [];
  const roofs = [];
  const spots = [
    [-38, -8, 18, 16], [38, 6, 16, 14], [-8, -36, 20, 14], [22, -36, 14, 12],
  ];
  const n = Math.min(budget.neighbors, spots.length);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    geos.push(placedBevelBox(THREE, s[2], 16.5, s[3], s[0], 0, s[1], 0.08));
    roofs.push(placedBevelBox(THREE, s[2] + 0.8, 0.45, s[3] + 0.8, s[0], 16.5, s[1], 0.06));
  }
  addMerged(THREE, parent, geos, mats.stucco);
  addMerged(THREE, parent, roofs, mats.tile);
  const palms = [
    [-32, -18], [34, -16], [-18, -32], [28, 28],
  ];
  for (let i = 0; i < Math.min(budget.neighbors, palms.length); i++) {
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 10, 3, 6), mats.wood);
    trunk.position.set(palms[i][0], 5.2, palms[i][1]);
    trunk.userData.backyardProcPalm = true;
    mark(trunk);
    parent.add(trunk);
    const nf = addPalmFronds(THREE, parent, mats, palms[i][0], 10.2, palms[i][1], 12, 1.2, false);
    if (nf) nf.userData.backyardProcPalm = true;
  }
}

function addRimTrees(THREE, parent, mats, budget) {
  const spots = [
    [-22.4, -18.2], [22.6, -17.8], [-20.8, 18.6], [20.4, 17.4],
    [-6.4, -19.6], [8.2, -19.8], [22.8, -4.2], [-22.6, -3.6],
  ];
  const n = Math.min(budget.rimTrees || 0, spots.length);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 7.4, 3, 6), mats.wood);
    trunk.position.set(s[0], 4.0, s[1]);
    trunk.userData.backyardPalm = true;
    trunk.userData.backyardProcTree = true;
    mark(trunk);
    parent.add(trunk);
    addLeafCards(THREE, parent, mats, s[0], 6.4, s[1], Math.max(28, (budget.leaves / 6) | 0), 2.6, 2.4, false, 1.05, 1.2);
  }
}

function applyCc0Maps(THREE, mats, quality) {
  if (typeof window === 'undefined' || !THREE.TextureLoader) return;
  let loader;
  try { loader = new THREE.TextureLoader(); } catch (e) { return; }
  const low = quality === 'low';
  const plaster = low
    ? 'assets/sim-backyard/tex/plaster_diff_512.webp'
    : 'assets/sim-backyard/tex/plaster_diff_1k.webp';
  const roof = low
    ? 'assets/sim-backyard/tex/roof_diff_512.webp'
    : 'assets/sim-backyard/tex/roof_diff_1k.webp';
  const jobs = [
    ['assets/sim-looks/tex/grass_diff_1k.webp', mats.turf, 'map', THREE.SRGBColorSpace, 22, 22],
    ['assets/sim-looks/tex/grass_nor_1k.webp', mats.turf, 'normalMap', THREE.LinearSRGBColorSpace, 22, 22],
    ['assets/sim-looks/tex/grass_rough_1k.webp', mats.turf, 'roughnessMap', THREE.LinearSRGBColorSpace, 22, 22],
    [plaster, mats.stucco, 'map', THREE.SRGBColorSpace, 5, 5],
    [roof, mats.tile, 'map', THREE.SRGBColorSpace, 8, 6],
    ['assets/sim-looks/tex/concrete_diff_1k.webp', mats.cmu, 'map', THREE.SRGBColorSpace, 4, 4],
    ['assets/sim-looks/tex/concrete_diff_1k.webp', mats.pebble, 'map', THREE.SRGBColorSpace, 8, 8],
  ];
  if (!low) {
    jobs.push(
      ['assets/sim-backyard/tex/plaster_nor_1k.webp', mats.stucco, 'normalMap', THREE.LinearSRGBColorSpace, 5, 5],
      ['assets/sim-backyard/tex/plaster_rough_1k.webp', mats.stucco, 'roughnessMap', THREE.LinearSRGBColorSpace, 5, 5],
      ['assets/sim-backyard/tex/roof_nor_1k.webp', mats.tile, 'normalMap', THREE.LinearSRGBColorSpace, 8, 6],
      ['assets/sim-backyard/tex/roof_rough_1k.webp', mats.tile, 'roughnessMap', THREE.LinearSRGBColorSpace, 8, 6],
    );
  }
  for (const [url, mat, key, space, rx, ry] of jobs) {
    if (!mat) continue;
    try {
      loader.load(url, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
        if (space != null) t.colorSpace = space;
        t.anisotropy = 8;
        t.userData.looksComposed = true;
        mat[key] = t;
        if (key === 'map' && mat === mats.stucco) mat.color.setHex(0xf2d4a8);
        if (key === 'normalMap' && mat.normalScale) mat.normalScale.set(0.85, 0.85);
        if (key === 'roughnessMap') mat.roughness = 1;
        mat.needsUpdate = true;
      });
    } catch (e) { /* canvas fallback stays */ }
  }
}

function addPlayLines(THREE, parent, mats, gates) {
  const extras = new THREE.Group();
  extras.name = 'backyardArtExtras';
  extras.userData.backyardArt = true;
  parent.add(extras);
}

function addSteppingStones(THREE, parent, mats, budget, gates) {
  const stones = [];
  const spots = [
    [8.2, -2.4], [9.6, -4.2], [12.4, -10.2], [14.8, -12.6], [6.2, -12.8],
    [4.8, -8.4], [16.2, -8.8], [13.6, -3.2], [7.4, -14.8], [15.4, -16.4],
  ];
  const n = Math.min(budget.stones, spots.length);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    if (inPool(s[0], s[1])) continue;
    if (!propClearOfCourse(s[0], s[1], 0.28, gates, { gatePad: 1.1, corridor: 1.0, yRange: 2 })) continue;
    stones.push(placedCyl(THREE, 0.34 + (i % 3) * 0.04, 0.30, 0.07, s[0], 0.01, s[1], 8));
  }
  addMerged(THREE, parent, stones, mats.paver);
}

export function buildRyanYard(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'backyardArtVisuals';
  group.userData.backyardArt = true;
  const budget = backyardBudget(quality);
  const mats = makeYardMats(THREE, vibe, quality, budget);
  const keep = gates || BACKYARD_KEEP_GATES;
  addSky(THREE, group, mats);
  addYardWalls(THREE, group, mats);
  addHouse(THREE, group, mats);
  addPvc(THREE, group, mats);
  addTree(THREE, group, mats, budget);
  addPool(THREE, group, mats, budget);
  addFenceAndPots(THREE, group, mats, budget, keep);
  addPatioDress(THREE, group, mats, budget, keep);
  addSoftAoAndTufts(THREE, group, mats, budget, keep);
  addGrass(THREE, group, mats, budget, keep);
  addSteppingStones(THREE, group, mats, budget, keep);
  addLounge(THREE, group, mats, budget);
  addYardExtras(THREE, group, mats);
  addNeighbors(THREE, group, mats, budget);
  addRimTrees(THREE, group, mats, budget);
  addPlayLines(THREE, group, mats, keep);
  applyCc0Maps(THREE, mats, quality);
  try {
    group.userData.planned = planBackyardKit();
  } catch (e) { /* kit plan is optional */ }
  parent.add(group);
  return group;
}

export function planBackyardKit() {
  const P = BACKYARD_PLAY;
  const rim = [
    [-22.4, -18.2, 8.6], [22.6, -17.8, 8.4], [-20.8, 18.6, 8.2], [20.4, 17.4, 8.0],
    [-6.4, -19.6, 7.6], [8.2, -19.8, 7.4], [22.8, -4.2, 8.0], [-22.6, -3.6, 7.8],
  ];
  const fence = [];
  const fn = P.fence;
  for (let z = fn.z0; z <= fn.z1 + 0.05; z += fn.spacing) {
    fence.push({ x: fn.x, z, ry: Math.PI / 2, s: fn.h });
  }
  return {
    trees: [{ x: P.ficus.x, z: P.ficus.z, s: P.ficus.h }].concat(
      rim.map((r) => ({ x: r[0], z: r[1], s: r[2] })),
    ),
    palms: P.palms.map((p) => ({ x: p.x, z: p.z, s: p.h })),
    fence,
    pots: P.pots.concat(P.patioPlanters).map((p) => ({ x: p.x, z: p.z, s: p.h })),
    woodGate: [{ x: P.woodGate.x, z: P.woodGate.z, s: P.woodGate.h }],
    ac: [{ x: P.ac.x, z: P.ac.z, s: P.ac.h }],
    sofa: [{ x: P.sofa.x, z: P.sofa.z, s: P.sofa.backH, ry: Math.PI }],
    bushes: [
      { x: -12.2, z: -12.8, s: 1.4 }, { x: 10.4, z: -14.6, s: 1.2 },
      { x: 6.8, z: 2.2, s: 1.1 }, { x: -6.4, z: 2.6, s: 1.15 },
    ],
    cactus: P.pots.slice(0, 2).map((p) => ({ x: p.x, z: p.z, s: p.h + 0.55 })),
  };
}

export const buildJadeLot = buildRyanYard;

export function decorateBackyardGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  if (ring.material) {
    ring.material.color.setHex(0xc4a882);
    if (ring.material.emissive) ring.material.emissive.setHex(0x3a2a18);
    if (ring.material.emissiveIntensity != null) ring.material.emissiveIntensity = 0.05;
    ring.material.transparent = false;
    ring.material.opacity = 1;
    skipMat(ring.material);
  }
  const hoop = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.02, size * 0.055, 8, 20),
    feltBasic(THREE, hexNum('#c4a882')),
  );
  const tile = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.22, size * 0.08, size * 0.08),
    feltBasic(THREE, hexNum('#c45a32')),
  );
  tile.position.set(0, size * 1.12, 0);
  ring.add(hoop);
  ring.add(tile);
  ring.userData.artHalo = hoop;
  ring.userData.artStyle = 'stucco-tile';
  ring.userData.artExtras = [tile];
  return hoop;
}

export function pulseBackyardGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = 0xc4a882;
  let emit = 0.06;
  if (isNext) {
    col = 0xc45a32;
    emit = 0.22 + pulse * 0.18;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.03);
  } else if (passed) {
    col = 0xc4a882;
    emit = 0.08;
    if (g.mesh) g.mesh.scale.setScalar(1);
  } else if (g.mesh) g.mesh.scale.setScalar(1);
  for (const m of mats) {
    if (m.color) m.color.setHex(col);
    if (m.emissive) m.emissive.setHex(col);
    if (m.emissiveIntensity != null) m.emissiveIntensity = emit;
  }
}

export function tickBackyardArt(root, now) {
  if (!root) return;
  const t = now * 0.001;
  let list = root.userData && root.userData.artTickers;
  if (!list) {
    list = [];
    root.traverse((o) => {
      const u = o.userData || {};
      if (u.backyardPalm || u.backyardPool) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickBackyardArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickBackyardArtObject(o, t) {
  if (o.userData && o.userData.backyardPalm) {
    const phase = (o.position && o.position.x) || 0;
    o.rotation.y = Math.sin(t * 0.7 + phase) * 0.08;
    o.rotation.z = Math.sin(t * 1.15 + phase * 0.4) * 0.035;
  }
  if (o.userData && o.userData.backyardPool && o.material && o.material.map) {
    const rep = o.material.map.repeat;
    if (rep) {
      o.material.map.offset.x = (t * 0.04) % 1;
      o.material.map.offset.y = (t * 0.025) % 1;
    }
  }
}

export function restyleBackyard(THREE, ctx) {
  try {
    return restyleBackyardInner(THREE, ctx);
  } catch (err) {
    try { console.error('restyleBackyard', err); } catch (e) { /* ignore */ }
    try { window._artError = String(err && err.stack || err); } catch (e) { /* ignore */ }
    return { visuals: null, vibe: ctx && ctx.vibe, quality: (ctx && ctx.quality) || 'med', error: String(err && err.message || err) };
  }
}

function restyleBackyardInner(THREE, ctx) {
  const vibe = ctx.vibe;
  const quality = ctx.quality || 'med';
  const root = ctx.group;
  hideStockBackyardMeshes(root);
  restyleBackyardShell(THREE, root, vibe, ctx.floor);
  applyVibeLighting(Object.assign({ THREE }, ctx), vibe);
  if (ctx.sun) {
    ctx.sun.position.set(22, 38, 18);
    if (ctx.sun.target) {
      ctx.sun.target.position.set(2, 0, -6);
      if (ctx.scene && ctx.sun.target.parent !== ctx.scene) ctx.scene.add(ctx.sun.target);
    }
    if (ctx.sun.shadow && ctx.sun.shadow.camera) {
      const cam = ctx.sun.shadow.camera;
      cam.left = -32;
      cam.right = 32;
      cam.top = 32;
      cam.bottom = -32;
      cam.near = 0.5;
      cam.far = 90;
      cam.updateProjectionMatrix();
    }
  }
  if (ctx.renderer && ctx.renderer.shadowMap) {
    ctx.renderer.shadowMap.enabled = true;
  }
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('backyardArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildRyanYard(THREE, root, vibe, quality, ctx.gates || BACKYARD_KEEP_GATES);
  }
  if (root) root.userData.backyardArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
