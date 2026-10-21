// QuadMath sim M2/W3 — original indoor whoop maps. Procedural boxes + V1 PBR tags.
// CC0 Poly Haven textures already shipped in assets/sim-looks (no new downloads).
// Kenney city kit is not used here so indoor stays cheap on the fps budget.
// W3 adds office, school gym, Tiny Trainer hall, and Your-room (from sim-room.js).
// Nothing here is copied from WebFPV (GPL).

import { planRoom } from './sim-room.js?v=0314f2c75e7d';

// Garage playground. Gaps sized for a 65–85 mm whoop (~0.23–0.30 wu).
// Clearance stays ≥ 0.85 wu except the raised-car crawl (1.32 wu / ~38 cm).
export const GARAGE_PLAY = Object.freeze({
  whoopClear: 0.85,
  bench: Object.freeze({
    // Open-legged table. Kenney cabinet bench is skipped, so the flyable
    // bench is procedural: thin top + legs only.
    x: -8.4, z: -8.0, w: 2.44, d: 12.0, topY: 2.20, topH: 0.14, leg: 0.16,
    legs: Object.freeze([
      [-1.05, -5.4], [1.05, -5.4], [-1.05, 0], [1.05, 0], [-1.05, 5.4], [1.05, 5.4],
    ]),
  }),
  chest: Object.freeze({ x: -8.3, z: 8.2, w: 3.01, h: 2.85, d: 2.89 }),
  car: Object.freeze({
    // Kenney sedan at jackH: 4.35 x 3.77 x 7.40, min.y = 1.32.
    x: 4.2, z: -5.5, jackH: 1.32,
    bodyW: 4.35, bodyH: 3.77, bodyD: 7.40,
    wheels: Object.freeze([[-1.85, -3.5], [1.85, -3.5], [-1.85, 3.1], [1.85, 3.1]]),
    wheelR: 0.42, wheelH: 0.28,
  }),
  rackA: Object.freeze({ x: 8.6, z: 3.6, w: 1.55, d: 5.0 }),
  rackB: Object.freeze({ x: 8.6, z: 12.2, w: 1.55, d: 5.0 }),
  // Split each shelf into two slabs so mid-z is a threadable gap.
  rackGapD: 1.15,
  shelfYs: Object.freeze([1.05, 2.30, 3.55, 4.80]),
  shelfH: 0.10,
  benchBins: Object.freeze([
    Object.freeze({ x: -8.4, z: -12.8, w: 1.70, h: 0.68, d: 1.20 }),
    Object.freeze({ x: -8.4, z: -3.2, w: 1.70, h: 0.68, d: 1.20 }),
  ]),
  door: Object.freeze({ z: 20.92, w: 8.2, openH: 2.35, panelH: 6.05, thick: 0.16 }),
  doorGap: Object.freeze({
    left: Object.freeze({ x: -2.95, z: 20.92, w: 2.30, h: 2.20, d: 0.55 }),
    right: Object.freeze({ x: 2.95, z: 20.92, w: 2.30, h: 2.20, d: 0.55 }),
  }),
  doorSoffit: Object.freeze({ x: 0, y: 6.90, z: 18.8, w: 8.4, h: 0.26, d: 1.60 }),
  volt: Object.freeze({ x: 0, y: 2.55, z: 3.4, innerW: 2.05, innerH: 1.75, bar: 0.14, depth: 0.22 }),
  bike: Object.freeze({ x: 0, y: 3.40, z: 14.0, innerW: 1.90, innerH: 1.90, bar: 0.12, depth: 0.18 }),
  tireWell: Object.freeze({ x: 0, z: -12.2, inner: 1.15, outer: 1.85, rings: 4, ringH: 0.42 }),
  tireStack: Object.freeze({ x: 5.6, z: -16.4, inner: 1.10, outer: 1.80, rings: 6, ringH: 0.42 }),
  ladder: Object.freeze({ x: -9.55, z: 14.8, w: 0.85, d: 0.22, h: 6.4, rungs: 9 }),
  cords: Object.freeze([
    Object.freeze({ x: -2.4, z: 9.2, y0: 4.15, y1: 8.7 }),
    Object.freeze({ x: 2.2, z: 6.4, y0: 3.85, y1: 8.7 }),
    Object.freeze({ x: -1.6, z: -2.2, y0: 4.35, y1: 8.7 }),
  ]),
  toys: Object.freeze([
    Object.freeze({ x: -6.8, z: 17.4, w: 0.52, h: 0.40, d: 0.52 }),
    Object.freeze({ x: -6.2, z: 17.9, w: 0.44, h: 0.58, d: 0.44 }),
    Object.freeze({ x: -7.3, z: 16.9, w: 0.38, h: 0.32, d: 0.38 }),
    Object.freeze({ x: 6.8, z: -15.2, w: 0.52, h: 0.40, d: 0.52 }),
    Object.freeze({ x: 6.2, z: -15.8, w: 0.44, h: 0.56, d: 0.44 }),
    Object.freeze({ x: 7.3, z: -14.6, w: 0.38, h: 0.32, d: 0.38 }),
  ]),
  rafterY: 8.55,
});

export function garageRackSlabs(spec) {
  const gap = GARAGE_PLAY.rackGapD;
  const slabD = (spec.d - gap) / 2;
  const off = (slabD + gap) / 2;
  return [
    { x: spec.x, z: spec.z - off, w: spec.w, d: slabD },
    { x: spec.x, z: spec.z + off, w: spec.w, d: slabD },
  ];
}

// Warehouse playground. Gaps sized for a 65–85 mm whoop (~0.23–0.30 wu).
// Clearance stays ≥ 0.85 wu. Open racks match Ion Nave posts + shelf slabs.
export const WAREHOUSE_PLAY = Object.freeze({
  whoopClear: 0.85,
  rackXs: Object.freeze([-22.5, -7.5, 7.5, 22.5]),
  rackZs: Object.freeze([-24, 0, 24]),
  shelfW: 3.2,
  shelfD: 16.8,
  shelfH: 0.22,
  shelfYs: Object.freeze([1.2, 4.35, 7.5, 10.65]),
  post: 0.36,
  postOffX: 1.45,
  postOffZ: 8.3,
  postH: 17.7,
  ion: Object.freeze({
    x: 0, y: 2.80, z: 12, innerW: 2.40, innerH: 2.00, bar: 0.16, depth: 0.24,
  }),
  pallets: Object.freeze([
    Object.freeze({ x: -24.05, z: 36, w: 1.55, h: 2.20, d: 1.55 }),
    Object.freeze({ x: -19.95, z: 36, w: 1.55, h: 2.20, d: 1.55 }),
    Object.freeze({ x: 19.95, z: 36, w: 1.55, h: 2.40, d: 1.55 }),
    Object.freeze({ x: 24.05, z: 36, w: 1.55, h: 2.40, d: 1.55 }),
  ]),
  gap: Object.freeze({
    left: Object.freeze({ x: -2.25, z: -38.4, w: 2.4, h: 3.6, d: 1.6 }),
    right: Object.freeze({ x: 2.25, z: -38.4, w: 2.4, h: 3.6, d: 1.6 }),
  }),
  rafterY: 17.15,
  rafterH: 0.32,
  rafterD: 0.45,
  rafterZs: Object.freeze([-36, -24, -12, 0, 12, 24, 36]),
  ridgeXs: Object.freeze([-14, 14]),
  dock: Object.freeze({ x: 0, z: 40.5, w: 16, h: 1.1, d: 3.2 }),
});

export const LAYOUT = {
  living: { w: 21, d: 28, h: 9.1, wall: 0.38 },
  garage: { w: 21, d: 42, h: 10.5, wall: 0.4 },
  warehouse: { w: 56, d: 84, h: 21, wall: 0.5 },
  backyard: { w: 42, d: 56, h: 0, wall: 0.22 },
  office: { w: 36, d: 46, h: 9.2, wall: 0.36 },
  gym: { w: 48, d: 74, h: 28, wall: 0.46 },
  trainer: { w: 28, d: 36, h: 10.5, wall: 0.34 },
};

export const MAP_ORBIT = {
  city: { cx: 0, cy: 5, cz: 0, r: 92, h: 22, fov: 62 },
  // Stay inside the room shell so the start-menu camera does not sit in a wall.
  living: { cx: 0, cy: 1.7, cz: -1.5, r: 6.4, h: 5.5, fov: 62 },
  garage: { cx: 0, cy: 2.0, cz: 1.5, r: 7.2, h: 6.4, fov: 60 },
  warehouse: { cx: 0, cy: 2.4, cz: 0, r: 2.2, h: 17.2, fov: 72 },
  backyard: { cx: 0, cy: 2.2, cz: -6, r: 22, h: 11, fov: 58 },
  office: { cx: 4, cy: 1.8, cz: 2, r: 6.8, h: 6.0, fov: 62 },
  gym: { cx: 0, cy: 3.4, cz: 2, r: 5.5, h: 16.5, fov: 68 },
  trainer: { cx: 0, cy: 1.9, cz: 0, r: 8.2, h: 6.6, fov: 60 },
  room: { cx: 0, cy: 1.6, cz: 0, r: 3.4, h: 4.8, fov: 64 },
};

export const MAP_LOOKS = {
  living: { fog: 0.004, sun: 0.55, env: 0.62, bg: 0.38, hemi: 0.38 },
  garage: { fog: 0.003, sun: 0.7, env: 0.26, bg: 0.34, hemi: 0.60 },
  warehouse: { fog: 0.0018, sun: 0.55, env: 0.5, bg: 0.28, hemi: 0.28 },
  backyard: { fog: 0.0025, sun: 1.5, env: 0.72, bg: 0.48, hemi: 0.16 },
  city: { fog: 0.00105, sun: 0.30, env: 0.18, bg: 0.16, hemi: 0.44 },
  office: { fog: 0.0032, sun: 0.48, env: 0.58, bg: 0.34, hemi: 0.36 },
  gym: { fog: 0.0010, sun: 0.95, env: 0.70, bg: 0.44, hemi: 0.55 },
  trainer: { fog: 0.0028, sun: 0.58, env: 0.56, bg: 0.33, hemi: 0.34 },
  room: { fog: 0.0045, sun: 0.42, env: 0.55, bg: 0.32, hemi: 0.40 },
};

export const MAP_IDS = ['living', 'garage', 'warehouse', 'backyard', 'office', 'gym', 'trainer', 'room'];

function mat(THREE, hex, set, extras) {
  const m = new THREE.MeshStandardMaterial(Object.assign({
    color: hex, roughness: 0.86, metalness: 0.04,
  }, extras || {}));
  if (set) m.userData.looksSet = set;
  return m;
}

function woodTex(THREE) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#6b4a2e';
  g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 7) {
    g.fillStyle = `rgba(${80 + (y % 17)},${46 + (y % 11)},${22},${0.18 + (y % 5) * 0.04})`;
    g.fillRect(0, y, s, 5);
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(40,20,8,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 8);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.looksComposed = true;
  return t;
}

function box(THREE, parent, colliders, x, y, z, w, h, d, material, rx, collide) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  if (rx) mesh.rotation.y = rx;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  if (collide !== false) {
    mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(mesh);
    bb._tag = 'map';
    colliders.push(bb);
  }
  return mesh;
}

function hoopFrame(THREE, parent, colliders, x, y, z, innerW, innerH, bar, depth, material) {
  const ow = innerW + bar * 2;
  box(THREE, parent, colliders, x, y + innerH / 2, z, ow, bar, depth, material);
  box(THREE, parent, colliders, x, y - innerH / 2 - bar, z, ow, bar, depth, material);
  box(THREE, parent, colliders, x - innerW / 2 - bar / 2, y - innerH / 2, z, bar, innerH, depth, material);
  box(THREE, parent, colliders, x + innerW / 2 + bar / 2, y - innerH / 2, z, bar, innerH, depth, material);
}

function tireWell(THREE, parent, colliders, spec, material) {
  const thick = (spec.outer - spec.inner) / 2;
  for (let i = 0; i < spec.rings; i++) {
    const y = i * spec.ringH;
    box(THREE, parent, colliders, spec.x, y, spec.z + spec.inner / 2 + thick / 2, spec.outer, spec.ringH, thick, material);
    box(THREE, parent, colliders, spec.x, y, spec.z - spec.inner / 2 - thick / 2, spec.outer, spec.ringH, thick, material);
    box(THREE, parent, colliders, spec.x + spec.inner / 2 + thick / 2, y, spec.z, thick, spec.ringH, spec.inner, material);
    box(THREE, parent, colliders, spec.x - spec.inner / 2 - thick / 2, y, spec.z, thick, spec.ringH, spec.inner, material);
  }
}

function cyl(THREE, parent, colliders, x, y, z, rTop, rBot, h, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 12), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(mesh);
  bb._tag = 'map';
  colliders.push(bb);
  return mesh;
}

function wallWithHole(THREE, parent, colliders, ax, alongZ, center, half, height, thick, holeX, holeW, holeH, material) {
  // Wall in X or Z. Hole is a doorway / window cut.
  const leftW = holeX - holeW / 2 - (center - half);
  const rightW = (center + half) - (holeX + holeW / 2);
  const lintelH = height - holeH;
  if (alongZ) {
    if (leftW > 0.05) box(THREE, parent, colliders, ax, 0, center - half + leftW / 2, thick, height, leftW, material);
    if (rightW > 0.05) box(THREE, parent, colliders, ax, 0, center + half - rightW / 2, thick, height, rightW, material);
    if (lintelH > 0.05) box(THREE, parent, colliders, ax, holeH, holeX, thick, lintelH, holeW, material);
  } else {
    if (leftW > 0.05) box(THREE, parent, colliders, center - half + leftW / 2, 0, ax, leftW, height, thick, material);
    if (rightW > 0.05) box(THREE, parent, colliders, center + half - rightW / 2, 0, ax, rightW, height, thick, material);
    if (lintelH > 0.05) box(THREE, parent, colliders, holeX, holeH, ax, holeW, lintelH, thick, material);
  }
}

function makeFloor(THREE, parent, w, d, material, y) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y || 0;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeCeiling(THREE, parent, colliders, w, d, h, material) {
  return box(THREE, parent, colliders, 0, h - 0.12, 0, w, 0.24, d, material);
}

function roomShell(THREE, parent, colliders, L, mats, holes) {
  const hx = L.w / 2, hz = L.d / 2, t = L.wall, H = L.h;
  // -Z wall (back)
  wallWithHole(THREE, parent, colliders, -hz, false, 0, hx, H, t,
    holes.back ? holes.back.x : 0, holes.back ? holes.back.w : 0, holes.back ? holes.back.h : 0, mats.wall);
  // +Z wall (front / door)
  wallWithHole(THREE, parent, colliders, hz, false, 0, hx, H, t,
    holes.front ? holes.front.x : 0, holes.front ? holes.front.w : 0, holes.front ? holes.front.h : 0, mats.wall);
  // -X wall
  wallWithHole(THREE, parent, colliders, -hx, true, 0, hz, H, t,
    holes.left ? holes.left.z : 0, holes.left ? holes.left.w : 0, holes.left ? holes.left.h : 0, mats.wall);
  // +X wall
  wallWithHole(THREE, parent, colliders, hx, true, 0, hz, H, t,
    holes.right ? holes.right.z : 0, holes.right ? holes.right.w : 0, holes.right ? holes.right.h : 0, mats.wall);
  makeCeiling(THREE, parent, colliders, L.w, L.d, H, mats.ceil);
}

function addLight(THREE, parent, lights, x, y, z, color, intensity, dist) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(x, y, z);
  l.castShadow = false;
  parent.add(l);
  lights.push(l);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xfff2d0, emissive: 0xffe8b0, emissiveIntensity: 4.5, roughness: 0.4,
    }),
  );
  bulb.position.copy(l.position);
  bulb.material.userData.looksSkip = true;
  parent.add(bulb);
}

export const LIVING_PLAY = Object.freeze({
  whoopClear: 0.85,
  sofa: Object.freeze({
    x: 0, z: -10.6, w: 7.2, d: 2.7, seatY: 1.20, seatH: 0.22,
    backY: 1.42, backH: 2.08, backD: 0.70, backZ: -11.5,
    armW: 0.55, armH: 1.15, armX: 3.4,
  }),
  table: Object.freeze({
    x: 0, z: -5.9, w: 3.5, d: 1.9, topY: 1.20, topH: 0.12, leg: 0.16,
    legs: Object.freeze([[-1.35, -0.70], [1.35, -0.70], [-1.35, 0.70], [1.35, 0.70]]),
  }),
  chair: Object.freeze({
    x: -7.1, z: -3.8, w: 2.5, d: 2.5, seatY: 1.20, seatH: 0.22,
    backY: 1.42, backH: 0.95, backD: 0.42, backZ: -4.72,
  }),
  tv: Object.freeze({
    x: 8.4, z: 0.2, w: 1.5, d: 5.6, topY: 1.20, topH: 0.16,
    legs: Object.freeze([[-0.55, -2.40], [0.55, -2.40], [-0.55, 2.40], [0.55, 2.40]]),
    leg: 0.14,
    panelX: 9.55, panelY: 2.2, panelH: 2.6, panelD: 4.4, panelW: 0.12,
  }),
  shelf: Object.freeze({
    x: 8.4, z: -10.6, w: 1.6, d: 2.4, shelfH: 0.12,
    shelfYs: Object.freeze([1.20, 2.48, 3.76, 5.04]),
    post: 0.14, postH: 5.20,
  }),
  clay: Object.freeze({
    x: 0, y: 2.70, z: -8.2, innerW: 2.00, innerH: 1.70, bar: 0.14, depth: 0.18,
  }),
  gap: Object.freeze({
    left: Object.freeze({ x: 5.9, z: 9.8, w: 1.5, h: 2.8, d: 1.4 }),
    right: Object.freeze({ x: 8.7, z: 9.8, w: 1.5, h: 2.8, d: 1.4 }),
  }),
  rafterY: 7.72,
  rafterH: 0.20,
  rafterD: 0.32,
  rafterZs: Object.freeze([-10, 0, 10]),
});

function buildLiving(THREE, parent, colliders, lights) {
  const L = LAYOUT.living;
  const mats = {
    wall: mat(THREE, 0xd8cfc4, 'facade'),
    ceil: mat(THREE, 0xe8e2d8, 'facade', { emissive: 0xfff4e0, emissiveIntensity: 0.18 }),
    wood: mat(THREE, 0x7a5130, 'wood', { map: woodTex(THREE), roughness: 0.72 }),
    sofa: mat(THREE, 0x4a5a6a, 'facade'),
    cushion: mat(THREE, 0xc45a3a, 'facade'),
    dark: mat(THREE, 0x2a2c32, 'concrete'),
    lamp: mat(THREE, 0xe8d9a8, 'facade'),
  };
  const floor = makeFloor(THREE, parent, L.w, L.d, mats.wood);
  floor.userData.looksSet = 'wood';
  roomShell(THREE, parent, colliders, L, mats, {
    front: { x: 0, w: 3.2, h: 6.4 },
    left: { z: 4, w: 4.2, h: 4.6 },
  });
  const P = LIVING_PLAY;
  const sofa = P.sofa;
  box(THREE, parent, colliders, sofa.x, sofa.seatY, sofa.z, sofa.w, sofa.seatH, sofa.d, mats.sofa);
  box(THREE, parent, colliders, sofa.x, sofa.backY, sofa.backZ, sofa.w, sofa.backH, sofa.backD, mats.sofa);
  box(THREE, parent, colliders, -sofa.armX, sofa.seatY, sofa.z, sofa.armW, sofa.armH, sofa.d, mats.cushion);
  box(THREE, parent, colliders, sofa.armX, sofa.seatY, sofa.z, sofa.armW, sofa.armH, sofa.d, mats.cushion);
  const tbl = P.table;
  box(THREE, parent, colliders, tbl.x, tbl.topY, tbl.z, tbl.w, tbl.topH, tbl.d, mats.dark);
  for (const [dx, dz] of tbl.legs) {
    box(THREE, parent, colliders, tbl.x + dx, 0, tbl.z + dz, tbl.leg, tbl.topY, tbl.leg, mats.wood);
  }
  const tv = P.tv;
  box(THREE, parent, colliders, tv.x, tv.topY, tv.z, tv.w, tv.topH, tv.d, mats.dark);
  for (const [dx, dz] of tv.legs) {
    box(THREE, parent, colliders, tv.x + dx, 0, tv.z + dz, tv.leg, tv.topY, tv.leg, mats.wood);
  }
  box(THREE, parent, colliders, tv.panelX, tv.panelY, tv.z, tv.panelW, tv.panelH, tv.panelD, mats.dark);
  const ch = P.chair;
  box(THREE, parent, colliders, ch.x, ch.seatY, ch.z, ch.w, ch.seatH, ch.d, mats.sofa);
  box(THREE, parent, colliders, ch.x, ch.backY, ch.backZ, ch.w, ch.backH, ch.backD, mats.sofa);
  cyl(THREE, parent, colliders, -6.2, 0, 8.2, 0.18, 0.22, 4.4, mats.dark);
  cyl(THREE, parent, colliders, -6.2, 4.4, 8.2, 0.7, 0.55, 0.35, mats.lamp);
  const sh = P.shelf;
  const hx = sh.w / 2 - sh.post / 2, hz = sh.d / 2 - sh.post / 2;
  for (const [dx, dz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    box(THREE, parent, colliders, sh.x + dx, 0, sh.z + dz, sh.post, sh.postH, sh.post, mats.wood);
  }
  for (const y of sh.shelfYs) {
    box(THREE, parent, colliders, sh.x, y, sh.z, sh.w, sh.shelfH, sh.d, mats.wood);
  }
  const clay = P.clay;
  hoopFrame(THREE, parent, colliders, clay.x, clay.y, clay.z, clay.innerW, clay.innerH, clay.bar, clay.depth, mats.dark);
  const gL = P.gap.left, gR = P.gap.right;
  box(THREE, parent, colliders, gL.x, 0, gL.z, gL.w, gL.h, gL.d, mats.sofa);
  box(THREE, parent, colliders, gR.x, 0, gR.z, gR.w, gR.h, gR.d, mats.sofa);
  for (const z of P.rafterZs) {
    box(THREE, parent, colliders, 0, P.rafterY, z, 19.4, P.rafterH, P.rafterD, mats.wood);
  }
  addLight(THREE, parent, lights, 0, 8.0, 0, 0xffe6c4, 90, 36);
  addLight(THREE, parent, lights, -6.2, 5.0, 8.2, 0xffd9a0, 40, 18);
  addLight(THREE, parent, lights, 6.4, 6.2, -6, 0xffe8c8, 36, 20);
  return { floor, orbit: MAP_ORBIT.living };
}

function buildGarageRack(THREE, parent, colliders, spec, mats) {
  const post = 0.16;
  const hx = spec.w / 2 - post / 2, hz = spec.d / 2 - post / 2;
  for (const [dx, dz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    box(THREE, parent, colliders, spec.x + dx, 0, spec.z + dz, post, 5.05, post, mats.metal);
  }
  for (const slab of garageRackSlabs(spec)) {
    for (const y of GARAGE_PLAY.shelfYs) {
      box(THREE, parent, colliders, slab.x, y, slab.z, slab.w, GARAGE_PLAY.shelfH, slab.d, mats.metal);
    }
  }
}

function buildGarage(THREE, parent, colliders, lights) {
  const L = LAYOUT.garage;
  const P = GARAGE_PLAY;
  const mats = {
    wall: mat(THREE, 0xb7b3a8, 'concrete'),
    ceil: mat(THREE, 0x9a958c, 'concrete', { emissive: 0xfff2d8, emissiveIntensity: 0.12 }),
    floor: mat(THREE, 0x8a8680, 'concrete'),
    wood: mat(THREE, 0x6a4e32, 'wood'),
    metal: mat(THREE, 0x6d7380, 'concrete', { metalness: 0.45, roughness: 0.45 }),
    car: mat(THREE, 0x2c5f8a, 'concrete', { metalness: 0.35, roughness: 0.4 }),
    tire: mat(THREE, 0x1a1a1a, 'asphalt'),
    door: mat(THREE, 0xffffff, 'facade', { transparent: true, opacity: 0.08, roughness: 0.2 }),
  };
  const floor = makeFloor(THREE, parent, L.w, L.d, mats.floor);
  roomShell(THREE, parent, colliders, L, mats, {
    front: { x: 0, w: 8.5, h: 8.4 },
  });
  const b = P.bench;
  box(THREE, parent, colliders, b.x, b.topY, b.z, b.w, b.topH, b.d, mats.metal);
  for (const [dx, dz] of b.legs) {
    box(THREE, parent, colliders, b.x + dx, 0, b.z + dz, b.leg, b.topY, b.leg, mats.wood);
  }
  for (const bin of P.benchBins) {
    box(THREE, parent, colliders, bin.x, 0, bin.z, bin.w, bin.h, bin.d, mats.wood);
  }
  const ch = P.chest;
  box(THREE, parent, colliders, ch.x, 0, ch.z, ch.w, ch.h, ch.d, mats.metal);
  const c = P.car;
  box(THREE, parent, colliders, c.x, c.jackH, c.z, c.bodyW, c.bodyH, c.bodyD, mats.car);
  for (const [dx, dz] of c.wheels) {
    box(THREE, parent, colliders, c.x + dx, 0, c.z + dz, 0.22, c.jackH, 0.22, mats.metal);
  }
  for (let i = -3; i <= 3; i++) {
    box(THREE, parent, colliders, 0, P.rafterY, i * 5.4, 19.5, 0.28, 0.42, mats.wood);
  }
  box(THREE, parent, colliders, -6.6, 8.4, 0, 0.38, 0.55, 40, mats.wood);
  box(THREE, parent, colliders, 6.6, 8.4, 0, 0.38, 0.55, 40, mats.wood);
  buildGarageRack(THREE, parent, colliders, P.rackA, mats);
  buildGarageRack(THREE, parent, colliders, P.rackB, mats);
  const d = P.door;
  box(THREE, parent, colliders, 0, d.openH, d.z, d.w, d.panelH, d.thick, mats.metal);
  const gL = P.doorGap.left, gR = P.doorGap.right;
  box(THREE, parent, colliders, gL.x, 0, gL.z, gL.w, gL.h, gL.d, mats.metal);
  box(THREE, parent, colliders, gR.x, 0, gR.z, gR.w, gR.h, gR.d, mats.metal);
  const sof = P.doorSoffit;
  box(THREE, parent, colliders, sof.x, sof.y, sof.z, sof.w, sof.h, sof.d, mats.wood);
  const v = P.volt;
  hoopFrame(THREE, parent, colliders, v.x, v.y, v.z, v.innerW, v.innerH, v.bar, v.depth, mats.metal);
  const bk = P.bike;
  hoopFrame(THREE, parent, colliders, bk.x, bk.y, bk.z, bk.innerW, bk.innerH, bk.bar, bk.depth, mats.metal);
  tireWell(THREE, parent, colliders, P.tireWell, mats.tire);
  tireWell(THREE, parent, colliders, P.tireStack, mats.tire);
  for (const toy of P.toys) {
    box(THREE, parent, colliders, toy.x, 0, toy.z, toy.w, toy.h, toy.d, mats.wood);
  }
  const lad = P.ladder;
  box(THREE, parent, colliders, lad.x - lad.w / 2, 0, lad.z, 0.12, lad.h, lad.d, mats.wood);
  box(THREE, parent, colliders, lad.x + lad.w / 2, 0, lad.z, 0.12, lad.h, lad.d, mats.wood);
  for (let i = 0; i < lad.rungs; i++) {
    box(THREE, parent, colliders, lad.x, 0.45 + i * 0.62, lad.z, lad.w, 0.08, lad.d, mats.wood);
  }
  for (const cord of P.cords) {
    box(THREE, parent, colliders, cord.x, cord.y0, cord.z, 0.08, cord.y1 - cord.y0, 0.08, mats.metal);
    box(THREE, parent, colliders, cord.x, cord.y0 - 0.18, cord.z, 0.55, 0.16, 1.15, mats.metal);
  }
  addLight(THREE, parent, lights, 0, 9.4, 8, 0xf2f0e4, 110, 44);
  addLight(THREE, parent, lights, 0, 9.4, -8, 0xf2f0e4, 90, 42);
  addLight(THREE, parent, lights, 0, 9.4, -18, 0xf2f0e4, 70, 36);
  return { floor, orbit: MAP_ORBIT.garage };
}

function buildWarehouseRack(THREE, parent, colliders, x, z, mats) {
  const P = WAREHOUSE_PLAY;
  for (const [ox, oz] of [
    [-P.postOffX, -P.postOffZ], [P.postOffX, -P.postOffZ],
    [-P.postOffX, P.postOffZ], [P.postOffX, P.postOffZ],
  ]) {
    box(THREE, parent, colliders, x + ox, 0, z + oz, P.post, P.postH, P.post, mats.metal);
  }
  for (const cy of P.shelfYs) {
    box(THREE, parent, colliders, x, cy - P.shelfH / 2, z, P.shelfW, P.shelfH, P.shelfD, mats.metal);
  }
}

function buildWarehouse(THREE, parent, colliders, lights) {
  const L = LAYOUT.warehouse;
  const P = WAREHOUSE_PLAY;
  const mats = {
    wall: mat(THREE, 0x8d9096, 'concrete'),
    ceil: mat(THREE, 0x6e7278, 'concrete', { emissive: 0xe8f0ff, emissiveIntensity: 0.14 }),
    floor: mat(THREE, 0x7a7d82, 'concrete'),
    metal: mat(THREE, 0x5c6570, 'concrete', { metalness: 0.5, roughness: 0.42 }),
    wood: mat(THREE, 0x6b5340, 'wood'),
    orange: mat(THREE, 0xc45a22, 'facade'),
  };
  const floor = makeFloor(THREE, parent, L.w, L.d, mats.floor);
  roomShell(THREE, parent, colliders, L, mats, {
    front: { x: 0, w: 12, h: 12 },
  });
  for (const z of P.rackZs) {
    for (const x of P.rackXs) buildWarehouseRack(THREE, parent, colliders, x, z, mats);
  }
  for (const pal of P.pallets) {
    box(THREE, parent, colliders, pal.x, 0, pal.z, pal.w, pal.h, pal.d, mats.wood);
  }
  const gL = P.gap.left, gR = P.gap.right;
  box(THREE, parent, colliders, gL.x, 0, gL.z, gL.w, gL.h, gL.d, mats.orange);
  box(THREE, parent, colliders, gR.x, 0, gR.z, gR.w, gR.h, gR.d, mats.orange);
  const ion = P.ion;
  hoopFrame(THREE, parent, colliders, ion.x, ion.y, ion.z, ion.innerW, ion.innerH, ion.bar, ion.depth, mats.metal);
  for (const z of P.rafterZs) {
    box(THREE, parent, colliders, 0, P.rafterY, z, 54.4, P.rafterH, P.rafterD, mats.wood);
  }
  for (const x of P.ridgeXs) {
    box(THREE, parent, colliders, x, P.rafterY - 0.08, 0, 0.42, 0.48, 80, mats.wood);
  }
  const d = P.dock;
  box(THREE, parent, colliders, d.x, 0, d.z, d.w, d.h, d.d, mats.floor);
  addLight(THREE, parent, lights, 0, 18, 24, 0xe8f0ff, 220, 90);
  addLight(THREE, parent, lights, 0, 18, 0, 0xe8f0ff, 220, 90);
  addLight(THREE, parent, lights, 0, 18, -24, 0xe8f0ff, 180, 90);
  addLight(THREE, parent, lights, -14, 16, 8, 0xe8f0ff, 120, 60);
  addLight(THREE, parent, lights, 14, 16, -8, 0xe8f0ff, 120, 60);
  return { floor, orbit: MAP_ORBIT.warehouse };
}

function fenceRun(THREE, parent, colliders, x0, z0, x1, z1, h, mats, gateGap) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const postEvery = 3.4;
  const n = Math.max(2, Math.round(len / postEvery));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + dx * t, z = z0 + dz * t;
    if (gateGap && Math.hypot(x - gateGap.x, z - gateGap.z) < gateGap.w / 2) continue;
    cyl(THREE, parent, colliders, x, 0, z, 0.09, 0.1, h, mats.wood);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.08), mats.wood);
  rail.position.set((x0 + x1) / 2, h * 0.55, (z0 + z1) / 2);
  rail.rotation.y = Math.atan2(dx, dz);
  rail.castShadow = rail.receiveShadow = true;
  parent.add(rail);
  if (!gateGap) {
    const bb = new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1) - 0.12, 0, Math.min(z0, z1) - 0.12),
      new THREE.Vector3(Math.max(x0, x1) + 0.12, h, Math.max(z0, z1) + 0.12),
    );
    bb._tag = 'map';
    colliders.push(bb);
  }
}

function buildBackyard(THREE, parent, colliders, lights) {
  const L = LAYOUT.backyard;
  const mats = {
    grass: mat(THREE, 0x5d7a3a, 'grass'),
    patio: mat(THREE, 0xb7b0a4, 'concrete'),
    wood: mat(THREE, 0x6a4e32, 'wood'),
    shed: mat(THREE, 0x7a8680, 'concrete'),
    grill: mat(THREE, 0x2a2c30, 'concrete', { metalness: 0.6, roughness: 0.35 }),
    fence: mat(THREE, 0x8a6a44, 'wood'),
  };
  const floor = makeFloor(THREE, parent, L.w + 8, L.d + 8, mats.grass);
  const patio = makeFloor(THREE, parent, 16, 12, mats.patio, 0.04);
  patio.position.set(0, 0.04, -10);
  const hx = L.w / 2, hz = L.d / 2, fh = 6.2;
  fenceRun(THREE, parent, colliders, -hx, -hz, hx, -hz, fh, mats, null);
  fenceRun(THREE, parent, colliders, -hx, hz, hx, hz, fh, mats, { x: 0, z: hz, w: 6.5 });
  fenceRun(THREE, parent, colliders, -hx, -hz, -hx, hz, fh, mats, null);
  fenceRun(THREE, parent, colliders, hx, -hz, hx, hz, fh, mats, null);
  // shed
  box(THREE, parent, colliders, 14.5, 0, -18, 7.2, 6.8, 8.0, mats.shed);
  box(THREE, parent, colliders, 14.5, 6.8, -18, 7.6, 1.1, 8.4, mats.wood);
  // grill + table on patio
  box(THREE, parent, colliders, -4.2, 0, -10.5, 1.6, 2.4, 1.2, mats.grill);
  box(THREE, parent, colliders, 3.2, 0, -9.5, 3.6, 1.15, 1.8, mats.wood);
  // planter boxes
  box(THREE, parent, colliders, -14.5, 0, 8, 3.2, 1.4, 3.2, mats.wood);
  box(THREE, parent, colliders, 14.5, 0, 8, 3.2, 1.4, 3.2, mats.wood);
  addLight(THREE, parent, lights, 0, 6.5, -10, 0xffe0b0, 2.4, 22);
  return { floor, orbit: MAP_ORBIT.backyard };
}

// Office playground. Gaps sized for a 65–85 mm whoop (~0.23–0.30 wu).
export const OFFICE_PLAY = Object.freeze({
  whoopClear: 0.85,
  cubes: Object.freeze([
    Object.freeze([-13.25, -12]), Object.freeze([-3.75, -12]),
    Object.freeze([-13.25, 0]), Object.freeze([-3.75, 0]),
    Object.freeze([-13.25, 12]), Object.freeze([-3.75, 12]),
  ]),
  cube: Object.freeze({ w: 6.4, d: 7.0, h: 3.55, t: 0.12 }),
  desk: Object.freeze({
    localX: -1.35, localZ: 0,
    w: 3.15, d: 1.55, topY: 1.20, topH: 0.10, leg: 0.12,
    legs: Object.freeze([[-1.40, -0.62], [1.40, -0.62], [-1.40, 0.62], [1.40, 0.62]]),
  }),
  chair: Object.freeze({
    localX: 0.55, localZ: 0, w: 1.05, seatY: 0.35, seatH: 0.42, backH: 1.05, backD: 0.14,
  }),
  conf: Object.freeze({
    x: 4.6, z: -16.2, w: 5.6, d: 2.4, topY: 1.20, topH: 0.10, leg: 0.14,
    legs: Object.freeze([[-2.50, -0.95], [2.50, -0.95], [-2.50, 0.95], [2.50, 0.95]]),
  }),
  reception: Object.freeze({
    x: 14.2, z: 18.4, w: 3.6, d: 1.5, topY: 1.20, topH: 0.10, leg: 0.12,
    legs: Object.freeze([[-1.55, -0.55], [1.55, -0.55], [-1.55, 0.55], [1.55, 0.55]]),
  }),
  sun: Object.freeze({
    x: 4.6, y: 2.70, z: 6.2, innerW: 2.20, innerH: 1.85, bar: 0.14, depth: 0.20,
  }),
  gap: Object.freeze({
    left: Object.freeze({ x: 2.35, z: 12.4, w: 1.7, h: 3.2, d: 1.4 }),
    right: Object.freeze({ x: 6.85, z: 12.4, w: 1.7, h: 3.2, d: 1.4 }),
  }),
  rafterY: 7.85,
  rafterH: 0.22,
  rafterD: 0.38,
  rafterZs: Object.freeze([-18, -6, 6, 18]),
});

function desk(THREE, parent, colliders, x, z, mats, ry) {
  const d = OFFICE_PLAY.desk;
  box(THREE, parent, colliders, x, d.topY, z, d.w, d.topH, d.d, mats.dark, ry);
  for (const [dx, dz] of d.legs) {
    box(THREE, parent, colliders, x + dx, 0, z + dz, d.leg, d.topY, d.leg, mats.wood, ry);
  }
  box(THREE, parent, colliders, x, d.topY + d.topH, z - 0.42, 1.15, 0.72, 0.08, mats.screen, ry);
  box(THREE, parent, colliders, x, d.topY + d.topH, z + 0.18, 1.35, 0.04, 0.55, mats.dark, ry);
}

function officeChair(THREE, parent, colliders, x, z, mats, ry) {
  box(THREE, parent, colliders, x, 0.35, z, 1.05, 0.42, 1.05, mats.chair, ry);
  box(THREE, parent, colliders, x, 0.77, z - 0.38, 1.05, 1.05, 0.14, mats.chair, ry);
}

function cubicle(THREE, parent, colliders, x, z, mats) {
  // 6.4 × 7.0 cell, open toward +X so the aisle stays flyable.
  const w = 6.4, d = 7.0, h = 3.55, t = 0.12;
  box(THREE, parent, colliders, x - w / 2, 0, z, t, h, d, mats.cube);
  box(THREE, parent, colliders, x, 0, z - d / 2, w, h, t, mats.cube);
  box(THREE, parent, colliders, x, 0, z + d / 2, w, h, t, mats.cube);
  desk(THREE, parent, colliders, x - 1.35, z, mats, 0);
  officeChair(THREE, parent, colliders, x + 0.55, z, mats, 0);
}

function buildOffice(THREE, parent, colliders, lights) {
  const L = LAYOUT.office;
  const mats = {
    wall: mat(THREE, 0xd6d0c6, 'facade'),
    ceil: mat(THREE, 0xe6e2da, 'facade', { emissive: 0xfff4e4, emissiveIntensity: 0.16 }),
    floor: mat(THREE, 0x8a8478, 'concrete'),
    wood: mat(THREE, 0x7a5130, 'wood', { map: woodTex(THREE), roughness: 0.72 }),
    dark: mat(THREE, 0x2c2f36, 'concrete'),
    cube: mat(THREE, 0xc8c2b6, 'facade'),
    chair: mat(THREE, 0x3d4a58, 'facade'),
    screen: mat(THREE, 0x1a2a38, 'facade', { emissive: 0x3a6a88, emissiveIntensity: 0.55 }),
    glass: mat(THREE, 0xc5d4e0, 'facade', { transparent: true, opacity: 0.18, roughness: 0.22 }),
  };
  const floor = makeFloor(THREE, parent, L.w, L.d, mats.floor);
  roomShell(THREE, parent, colliders, L, mats, {
    front: { x: 13.5, w: 3.4, h: 6.6 },
  });
  // Cubicle farm: two columns × three rows, aisles at x≈-8.3 and z=±6.
  for (const z of [-12, 0, 12]) {
    cubicle(THREE, parent, colliders, -13.25, z, mats);
    cubicle(THREE, parent, colliders, -3.75, z, mats);
  }
  // Hallway divider — 6.4-unit corridor along +X, doorways at both ends.
  box(THREE, parent, colliders, 10.15, 0, -21.6, 0.16, 3.7, 2.8, mats.cube);
  box(THREE, parent, colliders, 10.15, 0, -1.0, 0.16, 3.7, 28.0, mats.cube);
  box(THREE, parent, colliders, 10.15, 0, 20.8, 0.16, 3.7, 4.4, mats.cube);
  const conf = OFFICE_PLAY.conf;
  box(THREE, parent, colliders, conf.x, conf.topY, conf.z, conf.w, conf.topH, conf.d, mats.wood);
  for (const [dx, dz] of conf.legs) {
    box(THREE, parent, colliders, conf.x + dx, 0, conf.z + dz, conf.leg, conf.topY, conf.leg, mats.wood);
  }
  officeChair(THREE, parent, colliders, 4.6, -14.4, mats, 0);
  officeChair(THREE, parent, colliders, 4.6, -18.0, mats, Math.PI);
  const rec = OFFICE_PLAY.reception;
  box(THREE, parent, colliders, rec.x, rec.topY, rec.z, rec.w, rec.topH, rec.d, mats.dark);
  for (const [dx, dz] of rec.legs) {
    box(THREE, parent, colliders, rec.x + dx, 0, rec.z + dz, rec.leg, rec.topY, rec.leg, mats.wood);
  }
  const sun = OFFICE_PLAY.sun;
  hoopFrame(THREE, parent, colliders, sun.x, sun.y, sun.z, sun.innerW, sun.innerH, sun.bar, sun.depth, mats.dark);
  const gL = OFFICE_PLAY.gap.left, gR = OFFICE_PLAY.gap.right;
  box(THREE, parent, colliders, gL.x, 0, gL.z, gL.w, gL.h, gL.d, mats.cube);
  box(THREE, parent, colliders, gR.x, 0, gR.z, gR.w, gR.h, gR.d, mats.cube);
  for (const z of OFFICE_PLAY.rafterZs) {
    box(THREE, parent, colliders, 0, OFFICE_PLAY.rafterY, z, 34.8, OFFICE_PLAY.rafterH, OFFICE_PLAY.rafterD, mats.wood);
  }
  addLight(THREE, parent, lights, 0, 8.2, 0, 0xffe6c4, 95, 40);
  addLight(THREE, parent, lights, 13.2, 7.8, 10, 0xffe8c8, 55, 24);
  addLight(THREE, parent, lights, -8, 7.8, -8, 0xffe4c0, 50, 22);
  return { floor, orbit: MAP_ORBIT.office };
}

export const GYM_PLAY = Object.freeze({
  whoopClear: 0.85,
  x0: 17.4,
  rowStep: 1.35,
  rows: 4,
  plankW: 1.20,
  seatH: 0.16,
  seatYs: Object.freeze([1.20, 2.40, 3.60, 4.80]),
  segD: 22.0,
  segZs: Object.freeze([-15.4, 15.4]),
  stringer: 0.14,
  amber: Object.freeze({
    x: 0, y: 2.80, z: 8.0, innerW: 2.20, innerH: 1.85, bar: 0.14, depth: 0.20,
  }),
  gap: Object.freeze({
    left: Object.freeze({ x: -2.25, z: 32.4, w: 2.2, h: 3.4, d: 1.6 }),
    right: Object.freeze({ x: 2.25, z: 32.4, w: 2.2, h: 3.4, d: 1.6 }),
  }),
  rafterY: 25.49,
  rafterH: 0.22,
  rafterD: 0.32,
  rafterZs: Object.freeze([-30, -18, -6, 6, 18, 30]),
});

function bleacherBank(THREE, parent, colliders, side, mats) {
  const P = GYM_PLAY;
  for (let row = 0; row < P.rows; row++) {
    const x = side * (P.x0 + row * P.rowStep);
    const y = P.seatYs[row];
    for (const z of P.segZs) {
      box(THREE, parent, colliders, x, y, z, P.plankW, P.seatH, P.segD, mats.wood);
      const dx = P.plankW / 2 - P.stringer / 2;
      const dz = P.segD / 2 - P.stringer / 2;
      for (const [ox, oz] of [[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]]) {
        box(THREE, parent, colliders, x + ox, 0, z + oz, P.stringer, y, P.stringer, mats.wood);
      }
    }
  }
}

function hoop(THREE, parent, colliders, z, face, mats) {
  const postZ = z + face * 1.15;
  cyl(THREE, parent, colliders, 0, 0, postZ, 0.14, 0.16, 10.6, mats.metal);
  box(THREE, parent, colliders, 0, 9.5, postZ + face * 0.22, 3.6, 2.2, 0.14, mats.back);
  // Rim is visual only so a whoop can fly the hole. Race gates mark the pass.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.06, 8, 20),
    mats.rim,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 10.5, z);
  rim.castShadow = rim.receiveShadow = true;
  parent.add(rim);
}

function buildGym(THREE, parent, colliders, lights) {
  const L = LAYOUT.gym;
  const mats = {
    wall: mat(THREE, 0xb8b4aa, 'concrete'),
    ceil: mat(THREE, 0x8a8e94, 'concrete', { emissive: 0xe8f0ff, emissiveIntensity: 0.28 }),
    floor: mat(THREE, 0x6a4224, 'wood', { map: woodTex(THREE), roughness: 0.7 }),
    wood: mat(THREE, 0x6a4e32, 'wood'),
    metal: mat(THREE, 0x5c6570, 'concrete', { metalness: 0.5, roughness: 0.42 }),
    back: mat(THREE, 0xe8e4dc, 'facade'),
    rim: mat(THREE, 0xc45a22, 'facade', { metalness: 0.35, roughness: 0.4 }),
    line: mat(THREE, 0xfff6d8, 'facade', { emissive: 0xfff0c8, emissiveIntensity: 0.35 }),
  };
  const floor = makeFloor(THREE, parent, L.w, L.d, mats.floor);
  roomShell(THREE, parent, colliders, L, mats, {
    front: { x: 0, w: 8.5, h: 10 },
  });
  // Court paint — thin lines only (no filled slab, no colliders).
  const lt = 0.16, ly = 0.03;
  box(THREE, parent, colliders, -14, ly, 0, lt, 0.03, 52, mats.line, 0, false);
  box(THREE, parent, colliders, 14, ly, 0, lt, 0.03, 52, mats.line, 0, false);
  box(THREE, parent, colliders, 0, ly, -26, 28.16, 0.03, lt, mats.line, 0, false);
  box(THREE, parent, colliders, 0, ly, 26, 28.16, 0.03, lt, mats.line, 0, false);
  box(THREE, parent, colliders, 0, ly, 0, 28, 0.03, lt, mats.line, 0, false);
  for (const z of [20, -20]) {
    box(THREE, parent, colliders, 0, ly, z, 12.4, 0.03, lt, mats.line, 0, false);
    box(THREE, parent, colliders, -6.2, ly, z + Math.sign(z) * 3, lt, 0.03, 6.0, mats.line, 0, false);
    box(THREE, parent, colliders, 6.2, ly, z + Math.sign(z) * 3, lt, 0.03, 6.0, mats.line, 0, false);
  }
  const circle = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 6, 28), mats.line);
  circle.rotation.x = Math.PI / 2;
  circle.position.set(0, 0.05, 0);
  parent.add(circle);
  bleacherBank(THREE, parent, colliders, -1, mats);
  bleacherBank(THREE, parent, colliders, 1, mats);
  hoop(THREE, parent, colliders, 24.0, 1, mats);
  hoop(THREE, parent, colliders, -24.0, -1, mats);
  const amb = GYM_PLAY.amber;
  hoopFrame(THREE, parent, colliders, amb.x, amb.y, amb.z, amb.innerW, amb.innerH, amb.bar, amb.depth, mats.metal);
  const gL = GYM_PLAY.gap.left, gR = GYM_PLAY.gap.right;
  box(THREE, parent, colliders, gL.x, 0, gL.z, gL.w, gL.h, gL.d, mats.wood);
  box(THREE, parent, colliders, gR.x, 0, gR.z, gR.w, gR.h, gR.d, mats.wood);
  for (const z of GYM_PLAY.rafterZs) {
    box(THREE, parent, colliders, 0, GYM_PLAY.rafterY, z, 46.4, GYM_PLAY.rafterH, GYM_PLAY.rafterD, mats.metal);
  }
  addLight(THREE, parent, lights, 0, 24, 18, 0xe8f0ff, 240, 90);
  addLight(THREE, parent, lights, 0, 24, -18, 0xe8f0ff, 220, 90);
  addLight(THREE, parent, lights, 0, 22, 0, 0xf2f4ff, 160, 80);
  // Court-level fill: ceiling cans at y=24 fall off as 1/r² on a 28-high gym,
  // so Court Loop spawn looked near-black. These sit over the paint.
  addLight(THREE, parent, lights, 0, 12, 20, 0xf2f4ff, 220, 48);
  addLight(THREE, parent, lights, 0, 12, -20, 0xf2f4ff, 200, 48);
  addLight(THREE, parent, lights, -12, 11, 0, 0xe8f0ff, 180, 42);
  addLight(THREE, parent, lights, 12, 11, 0, 0xe8f0ff, 180, 42);
  return { floor, orbit: MAP_ORBIT.gym };
}

function trainerFrame(THREE, parent, colliders, x, y, z, size, ry, mats) {
  const t = 0.09, h = size, w = size * 1.15;
  box(THREE, parent, colliders, x, y, z, t, h, t, mats.pvc, ry);
  box(THREE, parent, colliders, x + Math.cos(ry) * w, y, z - Math.sin(ry) * w, t, h, t, mats.pvc, ry);
  box(THREE, parent, colliders, x + Math.cos(ry) * w * 0.5, y + h - t, z - Math.sin(ry) * w * 0.5, w, t, t, mats.pvc, ry);
}

function buildTrainer(THREE, parent, colliders, lights) {
  const L = LAYOUT.trainer;
  const mats = {
    wall: mat(THREE, 0xc8c4ba, 'facade'),
    ceil: mat(THREE, 0xddd8ce, 'facade', { emissive: 0xfff2dc, emissiveIntensity: 0.14 }),
    floor: mat(THREE, 0x8a8680, 'concrete'),
    wood: mat(THREE, 0x6a4e32, 'wood'),
    pvc: mat(THREE, 0xf2f0ea, 'facade'),
    tape: mat(THREE, 0xc45a22, 'facade'),
    dark: mat(THREE, 0x2a2c32, 'concrete'),
  };
  const floor = makeFloor(THREE, parent, L.w, L.d, mats.floor);
  roomShell(THREE, parent, colliders, L, mats, {
    front: { x: 0, w: 3.6, h: 6.6 },
  });
  // Floor tape — classic Tiny Trainer grid, no colliders.
  for (const z of [-10, 0, 10]) {
    box(THREE, parent, colliders, 0, 0.02, z, 18, 0.03, 0.12, mats.tape, 0, false);
  }
  for (const x of [-6, 0, 6]) {
    box(THREE, parent, colliders, x, 0.02, 0, 0.12, 0.03, 24, mats.tape, 0, false);
  }
  // Bench + stacked spare frames against -X (bounce/drafts still hit these).
  box(THREE, parent, colliders, -12.2, 0, 0, 1.6, 1.15, 8.4, mats.wood);
  trainerFrame(THREE, parent, colliders, -12.2, 1.15, -2.4, 1.7, 0, mats);
  trainerFrame(THREE, parent, colliders, -12.2, 1.15, 1.2, 1.7, 0, mats);
  box(THREE, parent, colliders, 12.2, 0, -12.4, 1.4, 2.2, 3.2, mats.dark);
  addLight(THREE, parent, lights, 0, 9.2, 6, 0xffe8c8, 90, 36);
  addLight(THREE, parent, lights, 0, 9.2, -8, 0xffe8c8, 80, 34);
  return { floor, orbit: MAP_ORBIT.trainer };
}

function buildRoom(THREE, parent, colliders, lights, spec) {
  const plan = planRoom(spec);
  const L = { w: plan.w, d: plan.d, h: plan.h, wall: plan.wall };
  const mats = {
    wall: mat(THREE, 0xd8d2c6, 'facade'),
    ceil: mat(THREE, 0xeee8de, 'facade', { emissive: 0xfff4e0, emissiveIntensity: 0.16 }),
    wood: mat(THREE, 0x7a5130, 'wood', { map: woodTex(THREE), roughness: 0.72 }),
    dark: mat(THREE, 0x2a2c32, 'concrete'),
    sofa: mat(THREE, 0x4a5a6a, 'facade'),
    cloth: mat(THREE, 0x6a4a38, 'facade'),
  };
  const floor = makeFloor(THREE, parent, L.w, L.d, mats.wood);
  floor.userData.looksSet = 'wood';
  roomShell(THREE, parent, colliders, L, mats, {
    front: { x: 0, w: Math.min(2.8, L.w * 0.28), h: Math.min(6.4, L.h * 0.78) },
  });
  for (const item of plan.furniture) {
    const m = item.kind === 'sofa' || item.kind === 'chair' ? mats.sofa
      : item.kind === 'bed' ? mats.cloth
      : item.kind === 'desk' || item.kind === 'dresser' || item.kind === 'nightstand' ? mats.wood
      : mats.dark;
    box(THREE, parent, colliders, item.x, item.y, item.z, item.w, item.h, item.d, m, item.ry);
  }
  addLight(THREE, parent, lights, 0, plan.h - 0.9, 0, 0xffe6c4, 70, Math.max(16, plan.w));
  addLight(THREE, parent, lights, plan.w * 0.22, plan.h * 0.62, -plan.d * 0.18, 0xffd9a0, 28, 14);
  return { floor, orbit: plan.orbit || MAP_ORBIT.room, plan };
}

const BUILDERS = {
  living: buildLiving,
  garage: buildGarage,
  warehouse: buildWarehouse,
  backyard: buildBackyard,
  office: buildOffice,
  gym: buildGym,
  trainer: buildTrainer,
  room: buildRoom,
};

export function buildMap(THREE, mapId, opts) {
  const group = new THREE.Group();
  group.name = 'map_' + mapId;
  const colliders = [];
  const lights = [];
  const builder = BUILDERS[mapId];
  if (!builder) return { group, colliders, lights, floor: null, orbit: MAP_ORBIT.city, mapId };
  const extra = mapId === 'room'
    ? builder(THREE, group, colliders, lights, opts && opts.room)
    : (builder(THREE, group, colliders, lights) || {});
  return {
    group, colliders, lights,
    floor: extra.floor || null,
    orbit: extra.orbit || MAP_ORBIT[mapId] || MAP_ORBIT.city,
    mapId,
    plan: extra.plan || null,
  };
}

export function setIndoorLights(lights, quality) {
  // Point lights stay on at every preset — Low already cuts shadows/AO/HDRI.
  // Killing them left indoor maps as a black box on Auto→Low (SwiftShader).
  const scale = quality === 'low' ? 0.72 : 1;
  for (const l of lights || []) {
    l.visible = true;
    if (l.intensity0 == null) l.intensity0 = l.intensity;
    l.intensity = l.intensity0 * scale;
  }
}

export function makeFlagMesh(THREE, col) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.4 }),
  );
  pole.position.y = 1.2;
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.5, 0.04),
    new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 2.4, roughness: 0.4,
    }),
  );
  flag.position.set(0.45, 2.05, 0);
  flag.material.userData.looksSkip = true;
  g.add(pole); g.add(flag);
  g.userData.flagMesh = flag;
  return g;
}
