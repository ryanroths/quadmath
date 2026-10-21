// Jade Lot — original backyard vibe. Visual only.
// No third-party meshes. Nothing from the GPL whoop sim. No new colliders.
// Dusk lot, ziggurat shed, moss posts, stone-gold gates.

import { hexNum, propClearOfCourse } from './sim-art-city.js?v=d054ab081c29';

export const BACKYARD_STOCK = Object.freeze({
  grass: 0x5d7a3a,
  patio: 0xb7b0a4,
  wood: 0x6a4e32,
  shed: 0x7a8680,
  grill: 0x2a2c30,
  fence: 0x8a6a44,
});

export const BACKYARD_KEEP_GATES = Object.freeze([
  { x: 0.0, y: 2.4, z: 22.0, size: 2.0 },
  { x: -14.0, y: 2.3, z: 10.0, size: 1.9 },
  { x: -16.0, y: 2.5, z: -8.0, size: 1.9 },
  { x: 0.0, y: 2.4, z: -20.0, size: 2.0 },
  { x: 15.5, y: 2.5, z: -8.0, size: 1.9 },
  { x: 14.0, y: 2.3, z: 10.0, size: 1.9 },
  { x: 0.0, y: 2.4, z: 14.0, size: 2.0 },
]);

export function backyardWantsGlow(applied) {
  return applied === 'med' || applied === 'high';
}

export function backyardBudget(applied) {
  if (applied === 'low') {
    return {
      posts: 10, moss: 6, lanterns: 4, glow: false, steps: 3,
      pots: 6, stones: 8, chairs: 4, rails: 8,
    };
  }
  if (applied === 'high') {
    return {
      posts: 18, moss: 14, lanterns: 8, glow: true, steps: 4,
      pots: 12, stones: 14, chairs: 6, rails: 12,
    };
  }
  return {
    posts: 14, moss: 10, lanterns: 6, glow: true, steps: 3,
    pots: 10, stones: 12, chairs: 5, rails: 10,
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
    if (g) { g.fillStyle = '#3a4a28'; g.fillRect(0, 0, w, h); }
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

function jadeGrassTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, 0, w, h, [[0, '#1b2a18'], [0.45, '#3a4a28'], [1, '#2a3818']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 64; i++) {
      g.fillStyle = i % 2 ? '#4a6230' : '#243018';
      g.fillRect((i * 37) % w, (i * 53) % h, 16, 8);
    }
    g.fillStyle = '#c9a45b';
    g.globalAlpha = 0.16;
    g.fillRect(0, h * 0.46, w, 6);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.arc((i * 47) % w, (i * 71) % h, 14, 0, 6.3);
      g.fill();
    }
  }, 5, 6);
}

function patioTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, w, 0, [[0, '#6a4a2a'], [0.5, '#8a6a44'], [1, '#5a3a22']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a3220';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h);
    g.fillStyle = 'rgba(201,164,91,0.12)';
    g.fillRect(0, 0, w, 8);
  }, 4, 3);
}

function duskSkyTex(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    fillGrad(g, 0, h, 0, 0, [
      [0, '#8a4a2a'], [0.22, '#c9a45b'], [0.48, '#3a4a28'], [1, '#0c1410'],
    ]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe0b0';
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(w * 0.72, h * 0.38, 14, 0, 6.3);
    g.fill();
    g.globalAlpha = 0.18;
    g.beginPath();
    g.arc(w * 0.72, h * 0.38, 36, 0, 6.3);
    g.fill();
    g.globalAlpha = 1;
  }, 1, 1);
}

function idolTex(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    fillGrad(g, 0, 0, 0, h, [[0, '#c9a45b'], [1, '#8a4a2a']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2a18';
    g.fillRect(28, 18, 72, 16);
    g.fillRect(48, 48, 32, 52);
    g.fillStyle = '#ffe0b0';
    g.fillRect(20, h - 14, w - 40, 6);
  }, 1, 1);
}

function stoneRingGeo(THREE, size) {
  const s = new THREE.Shape();
  const o = size * 1.16;
  const i = size * 0.9;
  s.absarc(0, 0, o, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, i, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: size * 0.1, bevelEnabled: false, curveSegments: 12 });
}

function stoneMat(THREE, hex, extras) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.86, metalness: 0.04, envMapIntensity: 0.14,
  }, extras || {})));
}

function emitMat(THREE, hex, emit) {
  return skipMat(new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: emit == null ? 1.8 : emit,
    roughness: 0.45, metalness: 0.12, envMapIntensity: 0.1,
  }));
}

function glowMat(THREE, hex, opacity) {
  return skipMat(new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: opacity == null ? 0.28 : opacity,
    depthWrite: false, toneMapped: false,
  }));
}

function mossGeo(THREE) {
  const pts = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.2, 0.1),
    new THREE.Vector2(0.08, 0.22),
    new THREE.Vector2(0.16, 0.34),
    new THREE.Vector2(0.0, 0.4),
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

export function hideStockBackyardMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.artKeep || o.userData.artInstanced || o.userData.backyardArt) return;
    if (o.parent && o.parent.name === 'backyardArtVisuals') return;
    const col = o.material && o.material.color ? o.material.color.getHex() : 0;
    if (col === BACKYARD_STOCK.shed || col === BACKYARD_STOCK.grill || col === BACKYARD_STOCK.wood) {
      o.visible = false; o.userData.artHidden = true; n++;
    }
  });
  return n;
}

export function restyleBackyardShell(THREE, group, vibe, floor) {
  if (!group) return 0;
  let n = 0;
  const grassTex = jadeGrassTex(THREE);
  const stoneTex = patioTex(THREE);
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.artHidden) return;
    if (o.userData.backyardArt || (o.parent && o.parent.name === 'backyardArtVisuals')) return;
    const m = o.material;
    const col = m.color ? m.color.getHex() : 0;
    const t = o.geometry && o.geometry.type;
    if (t === 'PlaneGeometry' && (o === floor || col === BACKYARD_STOCK.grass)) {
      if (m.map && m.map !== grassTex && m.userData && m.userData.looksComposed) {
        try { m.map.dispose(); } catch (e) { /* ignore */ }
      }
      m.map = grassTex;
      m.color.setHex(0xffffff);
      m.roughness = 0.92;
      m.emissive.setHex(0x1b2a18);
      m.emissiveIntensity = 0.04;
      skipMat(m); n++;
    } else if (t === 'PlaneGeometry' && col === BACKYARD_STOCK.patio) {
      m.map = stoneTex;
      m.color.setHex(0xffffff);
      m.roughness = 0.8;
      skipMat(m); n++;
    }
  });
  return n;
}

function makeYardMats(THREE, vibe) {
  return {
    stone: stoneMat(THREE, 0x6a5340),
    laterite: stoneMat(THREE, hexNum(vibe.palette.neonC)),
    gold: emitMat(THREE, hexNum(vibe.palette.neonA), 1.6),
    moss: stoneMat(THREE, hexNum(vibe.palette.neonB), {
      emissive: hexNum(vibe.palette.neonB), emissiveIntensity: 0.22,
    }),
    grill: stoneMat(THREE, 0x2a2c30, { metalness: 0.4, roughness: 0.4 }),
    porch: glowMat(THREE, 0xffe0b0, 0.16),
    sky: skipMat(new THREE.MeshBasicMaterial({
      map: duskSkyTex(THREE), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
    })),
    idol: skipMat(new THREE.MeshBasicMaterial({
      map: idolTex(THREE), toneMapped: false,
    })),
    pot: stoneMat(THREE, 0x8a4a2a, { roughness: 0.8 }),
  };
}

function addZiggurat(THREE, parent, mats, budget) {
  for (let i = 0; i < budget.steps; i++) {
    const s = 7.0 - i * 1.15;
    const step = new THREE.Mesh(new THREE.BoxGeometry(s, 1.55, s + 0.4), i % 2 ? mats.gold : mats.stone);
    step.position.set(14.5, 0.78 + i * 1.55, -18);
    step.userData.backyardArt = true;
    parent.add(step);
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 2.4), mats.gold);
  cap.position.set(14.5, budget.steps * 1.55 + 0.2, -18);
  cap.userData.backyardIdol = true;
  cap.userData.backyardArt = true;
  parent.add(cap);
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.08), mats.idol);
  face.position.set(14.5, budget.steps * 1.55 - 0.4, -18 + (2.4 - budget.steps * 0.2));
  face.userData.backyardArt = true;
  parent.add(face);
}

function addPatioSet(THREE, parent, mats) {
  const table = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.16, 1.7), mats.stone);
  table.position.set(3.2, 1.12, -9.5);
  table.userData.backyardArt = true;
  parent.add(table);
  for (const [x, z] of [[2.2, -8.8], [4.2, -8.8], [2.2, -10.2], [4.2, -10.2]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.95, 3, 6), mats.laterite);
    leg.position.set(x, 0.56, z);
    leg.userData.backyardArt = true;
    parent.add(leg);
  }
  const grill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.1), mats.grill);
  grill.position.set(-4.2, 0.55, -10.5);
  grill.userData.backyardArt = true;
  parent.add(grill);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.grill);
  lid.position.set(-4.2, 1.2, -10.5);
  lid.userData.backyardArt = true;
  parent.add(lid);
}

function addWhoopLife(THREE, parent, mats, budget, gates) {
  const extras = new THREE.Group();
  extras.name = 'backyardArtExtras';
  extras.userData.backyardArt = true;
  const planter = new THREE.BoxGeometry(3.1, 1.25, 3.1);
  for (const [x, z] of [[-14.5, 8], [14.5, 8]]) {
    const box = new THREE.Mesh(planter, mats.laterite);
    box.position.set(x, 0.62, z);
    box.userData.backyardArt = true;
    extras.add(box);
    const moss = new THREE.Mesh(mossGeo(THREE), mats.moss);
    moss.position.set(x, 1.25, z);
    moss.scale.set(3.2, 2.2, 3.2);
    moss.userData.backyardMoss = true;
    moss.userData.backyardArt = true;
    extras.add(moss);
  }
  const postGeo = new THREE.CapsuleGeometry(0.12, 5.6, 4, 8);
  const hx = 21, hz = 28;
  addInstanced(THREE, extras, postGeo, mats.stone, budget.posts, (d, i) => {
    const edge = i % 4;
    let x = 0, z = 0;
    if (edge === 0) { x = -hx; z = -hz + ((i / 4) | 0) * 6.8; }
    else if (edge === 1) { x = hx; z = -hz + ((i / 4) | 0) * 6.8; }
    else if (edge === 2) { x = -hx + ((i / 4) | 0) * 6.8; z = -hz; }
    else { x = -hx + ((i / 4) | 0) * 6.8; z = hz; }
    if (Math.hypot(x, z - hz) < 3.4) return false;
    d.position.set(x, 3.0, z);
    return true;
  });
  addInstanced(THREE, extras, mossGeo(THREE), mats.moss, budget.moss, (d, i) => {
    const spots = [[-10, 16], [10, 16], [-8, -6], [8, -22], [-16, -16], [6, 4], [-6, 12], [16, -6], [-18, 4], [0, -24], [18, 18], [-12, -22], [12, 6], [-4, 20]];
    const s = spots[i % spots.length];
    if (!propClearOfCourse(s[0], s[1], 0.3, gates, { gatePad: 1.6, corridor: 1.4, yRange: 2 })) return false;
    d.position.set(s[0], 0, s[1]);
    return true;
  });
  if (budget.lanterns > 0) {
    addInstanced(THREE, extras, new THREE.SphereGeometry(0.18, 8, 6), mats.gold, budget.lanterns, (d, i) => {
      d.position.set(-16 + (i % 5) * 8, 5.4, -20 + ((i / 5) | 0) * 16);
      return true;
    });
  }
  if (budget.glow) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 16), mats.porch);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.06, -10);
    pool.userData.backyardArt = true;
    extras.add(pool);
  }
  addInstanced(THREE, extras, mossGeo(THREE), mats.pot, budget.pots, (d, i) => {
    const spots = [[-8.4, 14.2], [8.6, 13.8], [-6.2, -4.4], [6.4, -6.2], [-10.2, 2.4], [10.4, 4.2], [-5.2, 18.6], [5.4, 17.8], [-9.2, -20.4], [9.6, -14.6], [-3.4, 8.2], [3.8, 10.4]];
    const s = spots[i % spots.length];
    if (!propClearOfCourse(s[0], s[1], 0.28, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0, s[1]);
    d.scale.set(1.4, 1.1, 1.4);
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.55, 0.28, 0.7), mats.stone, budget.stones, (d, i) => {
    const spots = [[-7.2, 6.4], [7.4, 5.8], [-5.6, -14.2], [6.2, -16.4], [-11.2, -8.4], [11.4, -10.2], [-4.2, 20.2], [4.6, 19.4]];
    const s = spots[i % spots.length];
    if (!propClearOfCourse(s[0], s[1], 0.3, gates, { gatePad: 1.5, corridor: 1.3, yRange: 2 })) return false;
    d.position.set(s[0], 0.14, s[1]);
    d.rotation.y = i * 0.5;
    return true;
  });
  addInstanced(THREE, extras, new THREE.BoxGeometry(0.45, 0.7, 0.45), mats.laterite, budget.chairs, (d, i) => {
    const side = i % 2 ? 1 : -1;
    d.position.set(3.2 + side * 1.15, 0.35, -8.4 - ((i / 2) | 0) * 0.85);
    return true;
  });
  const rail = new THREE.BoxGeometry(0.12, 0.18, 5.4);
  addInstanced(THREE, extras, rail, mats.gold, budget.rails, (d, i) => {
    const edge = i % 2 ? 1 : -1;
    d.position.set(edge * 21, 5.7, -18 + ((i / 2) | 0) * 8);
    return true;
  });
  parent.add(extras);
}

function addDuskDome(THREE, parent, mats) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(88, 24, 16), mats.sky);
  dome.position.y = 8;
  dome.userData.backyardArt = true;
  parent.add(dome);
}

function addSecretDressing(THREE, parent, mats) {
  const peak = new THREE.Mesh(mossGeo(THREE), mats.gold);
  peak.position.set(14.5, 8.35, -15.2);
  peak.scale.set(2.6, 2.2, 2.6);
  peak.userData.backyardIdol = true;
  peak.userData.backyardArt = true;
  parent.add(peak);
  const hollow = new THREE.Mesh(mossGeo(THREE), mats.moss);
  hollow.position.set(19.4, 0.85, -26.2);
  hollow.scale.set(2.4, 1.6, 2.4);
  hollow.userData.backyardMoss = true;
  hollow.userData.backyardArt = true;
  parent.add(hollow);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mats.gold);
  glow.position.set(19.4, 1.15, -26.2);
  glow.userData.backyardIdol = true;
  glow.userData.backyardArt = true;
  parent.add(glow);
}

export function buildJadeLot(THREE, parent, vibe, quality, gates) {
  const group = new THREE.Group();
  group.name = 'backyardArtVisuals';
  group.userData.backyardArt = true;
  const budget = backyardBudget(quality);
  const mats = makeYardMats(THREE, vibe);
  addDuskDome(THREE, group, mats);
  addZiggurat(THREE, group, mats, budget);
  addPatioSet(THREE, group, mats);
  addWhoopLife(THREE, group, mats, budget, gates || BACKYARD_KEEP_GATES);
  addSecretDressing(THREE, group, mats);
  parent.add(group);
  return group;
}

export function decorateBackyardGate(THREE, ring, size, col, vibe) {
  if (!ring || ring.userData.artHalo) return null;
  const emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 3.2;
  if (ring.material) {
    ring.material.color.setHex(0x6a5340);
    ring.material.emissive.setHex(col);
    ring.material.emissiveIntensity = emit * 0.4;
    skipMat(ring.material);
  }
  const stone = new THREE.Mesh(stoneRingGeo(THREE, size), stoneMat(THREE, 0x6a5340, {
    emissive: col, emissiveIntensity: emit * 0.5,
  }));
  stone.position.z = -size * 0.05;
  const gold = new THREE.Mesh(new THREE.TorusGeometry(size * 1.14, size * 0.03, 6, 18), emitMat(THREE, hexNum(vibe.palette.neonA), emit));
  ring.add(stone);
  ring.add(gold);
  ring.userData.artHalo = stone;
  ring.userData.artStyle = 'stone-gold';
  ring.userData.artExtras = [gold];
  return stone;
}

export function pulseBackyardGate(g, isNext, passed, now, vibe) {
  const halo = g.mesh && g.mesh.userData && g.mesh.userData.artHalo;
  const extras = (g.mesh && g.mesh.userData && g.mesh.userData.artExtras) || [];
  const mats = [];
  if (halo && halo.material) mats.push(halo.material);
  for (const e of extras) if (e.material) mats.push(e.material);
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  let col = g.col;
  let emit = (vibe && vibe.lighting && vibe.lighting.gateEmissive) || 3.2;
  if (isNext) {
    col = 0xffe0b0;
    emit = ((vibe && vibe.lighting && vibe.lighting.gateEmissiveActive) || 4.5) + pulse;
    if (g.mesh) g.mesh.scale.setScalar(1 + Math.sin(now * 0.005) * 0.03);
  } else if (passed) {
    col = 0xc9a45b;
    emit = 1.8;
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
      if (u.backyardIdol || u.backyardMoss) list.push(o);
    });
    if (root.userData) root.userData.artTickers = list;
  }
  for (let i = 0; i < list.length; i++) {
    try { tickBackyardArtObject(list[i], t); } catch (e) { /* never abort the FPV render loop */ }
  }
}

function tickBackyardArtObject(o, t) {
  if (o.userData && o.userData.backyardIdol && o.material) {
    o.material.emissiveIntensity = 1.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.8));
  }
  if (o.userData && o.userData.backyardMoss) {
    o.rotation.y = t * 0.08;
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
  let visuals = null;
  if (root) {
    const old = root.getObjectByName('backyardArtVisuals');
    if (old && old.parent) old.parent.remove(old);
    visuals = buildJadeLot(THREE, root, vibe, quality, ctx.gates || BACKYARD_KEEP_GATES);
  }
  if (root) root.userData.backyardArtQuality = quality;
  return { visuals, vibe, quality, hidden: true };
}
