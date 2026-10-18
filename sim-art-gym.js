// Amber Court — original gym vibe. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.
// Honey bleachers, brass rims, amber trusses. Court paint stays readable.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=c235d936652f';

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
]);

export function gymWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function gymBudget(applied) {
  if (applied === 'low') {
    return {
      windows: 4, dust: 0, glow: false, rows: 3, seats: 24,
      truss: 6, pads: 8, banners: 2, balls: 6, bottles: 8, cones: 4,
    };
  }
  if (applied === 'high') {
    return {
      windows: 10, dust: 96, glow: true, rows: 4, seats: 40,
      truss: 12, pads: 14, banners: 6, balls: 14, bottles: 18, cones: 8,
    };
  }
  return {
    windows: 8, dust: 0, glow: true, rows: 4, seats: 32,
    truss: 10, pads: 12, banners: 4, balls: 10, bottles: 14, cones: 6,
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
    fillGrad(g, 0, 0, w, 0, [[0, '#d8b07a'], [0.5, '#c9a57a'], [1, '#b88858']]);
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 18) {
      g.fillStyle = y % 36 === 0 ? '#a87848' : '#c09460';
      g.fillRect(0, y, w, 16);
      g.fillStyle = '#8a5a30';
      g.fillRect(0, y + 16, w, 2);
    }
    g.fillStyle = '#fff6d8';
    g.globalAlpha = 0.35;
    g.fillRect(0, h * 0.48, w, 3);
    g.globalAlpha = 1;
  }, 8, 12);
}

function plasterTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#d8c8b0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(240,177,75,0.10)';
    for (let y = 10; y < h; y += 22) g.fillRect(0, y, w, 3);
    g.fillStyle = 'rgba(106,66,36,0.08)';
    for (let x = 8; x < w; x += 28) g.fillRect(x, 0, 1, h);
  }, 10, 6);
}

function bannerTex(THREE, a, b) {
  return canvasTex(THREE, 64, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, a], [1, b]]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6d8';
    g.globalAlpha = 0.45;
    g.fillRect(8, 18, w - 16, 10);
    g.fillRect(8, h - 28, w - 16, 10);
    g.globalAlpha = 1;
  }, 1, 1);
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

export function hideStockGymMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.gymArt) return;
    if (o.parent && o.parent.name === 'gymArtVisuals') return;
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
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.gymArt || (o.parent && o.parent.name === 'gymArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (col === GYM_STOCK.wall) {
      m.color.setHex(0xd8c8b0);
      m.map = wallTex;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.roughness = 0.86;
      m.envMapIntensity = 0.16;
      skipMat(m); n++;
    } else if (col === GYM_STOCK.ceil) {
      m.color.setHex(0x5a4a38);
      m.emissive.setHex(0xf0b14b);
      m.emissiveIntensity = 0.06;
      m.envMapIntensity = 0.1;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && (o === floor || col === GYM_STOCK.floor)) {
      if (m.map && m.map !== floorTex && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = floorTex;
      m.color.setHex(0xffffff);
      m.roughness = 0.68;
      m.metalness = 0.02;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.envMapIntensity = 0.18;
      skipMat(m); n++;
    } else if (col === GYM_STOCK.line) {
      m.color.setHex(0xfff6d8);
      m.emissive.setHex(0xfff0c8);
      m.emissiveIntensity = 0.7;
      skipMat(m); n++;
    }
  });
  return n;
}

function makeGymMats(THREE, vibe) {
  return {
    honey: honeyMat(THREE, 0x8a5a30, {
      emissive: 0xf0b14b, emissiveIntensity: 0.1, roughness: 0.7,
    }),
    seat: honeyMat(THREE, 0xa86c38, { roughness: 0.62 }),
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
    paint: glowMat(THREE, 0xfff6d8, 0.42),
    bannerA: skipMat(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: bannerTex(THREE, '#c45a22', '#8a5a30'),
      roughness: 0.7, metalness: 0, envMapIntensity: 0.1,
    })),
    bannerB: skipMat(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: bannerTex(THREE, '#f0b14b', '#6a4224'),
      roughness: 0.7, metalness: 0, envMapIntensity: 0.1,
    })),
    dust: skipMat(new THREE.PointsMaterial({
      color: 0xfff6d8, size: 0.08, transparent: true, opacity: 0.45,
      depthWrite: false, sizeAttenuation: true,
    })),
  };
}

function addBleachers(THREE, parent, mats, budget) {
  const plank = new THREE.BoxGeometry(1.28, 0.28, 12.8);
  const seat = new THREE.BoxGeometry(1.05, 0.16, 1.35);
  const rail = new THREE.CapsuleGeometry(0.05, 12.4, 3, 6);
  const rows = budget.rows;
  addInstanced(THREE, parent, plank, mats.honey, rows * 8, (d, i) => {
    const side = i < rows * 4 ? -1 : 1;
    const local = i % (rows * 4);
    const row = local % rows;
    const seg = (local / rows) | 0;
    const x = side * (17.6 + row * 1.32);
    const y = 0.62 + row * 1.02;
    const z = -19.2 + seg * 12.8;
    d.position.set(x, y, z);
    return true;
  });
  addInstanced(THREE, parent, seat, mats.seat, budget.seats, (d, i) => {
    const side = i % 2 ? 1 : -1;
    const row = (i >> 1) % rows;
    const along = ((i >> 1) / rows) | 0;
    const x = side * (17.6 + row * 1.32);
    const y = 0.82 + row * 1.02;
    const z = -24 + (along % 18) * 2.7;
    if (Math.abs(z + 24.5) < 1.2 && side < 0 && row >= 2) return false;
    d.position.set(x, y, z);
    return true;
  });
  addInstanced(THREE, parent, rail, mats.brass, rows * 2, (d, i) => {
    const side = i < rows ? -1 : 1;
    const row = i % rows;
    d.position.set(side * (18.15 + row * 1.32), 1.15 + row * 1.02, 0);
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
  const beam = new THREE.BoxGeometry(46.4, 0.22, 0.32);
  addInstanced(THREE, parent, beam, mats.brass, budget.truss, (d, i) => {
    const z = -30 + i * (60 / Math.max(1, budget.truss - 1));
    if (Math.abs(z) < 1.2) return false;
    d.position.set(0, 25.6, z);
    return true;
  });
  const rib = new THREE.BoxGeometry(0.22, 0.22, 68);
  addInstanced(THREE, parent, rib, mats.honey, 4, (d, i) => {
    d.position.set(-16.5 + i * 11, 25.6, 0);
    return true;
  });
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
    d.position.set(side * 23.4, 12.4, -18 + ((i / 2) | 0) * 12);
    return true;
  });
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

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const extras = new THREE.Group();
  extras.name = 'gymArtWhoop';
  extras.userData.gymArt = true;
  const ballSpots = [
    [-15.6, 32.2], [15.8, 31.6], [-15.4, -32.4], [15.6, -31.8],
    [-16.0, 8.8], [16.1, -9.2], [-15.8, -18.4], [15.9, 18.8],
    [-16.2, 26.4], [16.0, -26.2], [-15.5, 2.2], [15.7, 4.4],
    [-16.1, -6.8], [15.4, 12.6],
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
  ];
  addInstanced(THREE, extras, new THREE.ConeGeometry(0.18, 0.42, 8), mats.cone, budget.cones, (d, i) => {
    const s = coneSpots[i % coneSpots.length];
    if (!propClearOfCourse(s[0], s[1], 0.24, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0.21, s[1]);
    return true;
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.6, 0.12), mats.bannerB);
  board.position.set(0, 16.4, -36.4);
  board.userData.gymArt = true;
  extras.add(board);
  const board2 = board.clone();
  board2.position.set(0, 16.4, 36.4);
  extras.add(board2);
  parent.add(extras);
}

export function buildAmberCourt(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'gymArtVisuals';
  group.userData.gymArt = true;
  const budget = gymBudget(quality);
  const mats = makeGymMats(THREE, vibe);
  const keep = gates || GYM_KEEP_GATES;
  addBleachers(THREE, group, mats, budget);
  addHoops(THREE, group, mats, budget);
  addTrusses(THREE, group, mats, budget);
  addWindowsPadsBanners(THREE, group, mats, budget);
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
  root.traverse((o) => {
    try {
      tickGymArtObject(o, t);
    } catch (e) { /* never abort the FPV render loop */ }
  });
}

function tickGymArtObject(o, t) {
  if (o.userData && o.userData.gymRim && o.material) {
    o.material.emissiveIntensity = 2.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.6));
  }
  if (o.userData && o.userData.gymDust) {
    o.rotation.y = t * 0.04;
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
    if (old && old.parent) old.parent.remove(old);
    visuals = buildAmberCourt(THREE, root, vibe, quality, ctx.gates || GYM_KEEP_GATES);
  }
  if (root) root.userData.gymArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
