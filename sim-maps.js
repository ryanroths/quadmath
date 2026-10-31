// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim M2/W3 — original indoor whoop maps. Procedural boxes + V1 PBR tags.
// CC0 Poly Haven textures already shipped in assets/sim-looks (no new downloads).
// Kenney city kit is not used here so indoor stays cheap on the fps budget.
// W3 adds office, school gym, Tiny Trainer hall, and Your-room (from sim-room.js).
// Nothing here is copied from WebFPV (GPL).

import { planRoom } from './sim-room.js?v=c26e0c6bfbfc';
import {
  LOOK, lookMaterial, lookBoxUv, lookFloor, lookFloorPatch, lookAoTexture, lookGlass, lookLines, lookLooks, floorAo,
} from './sim-look.js?v=ad1c5d113420';

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

// Ryan's Phoenix backyard. ~17.5 m × 15 m at WS=3.5 (25% larger). Whoop gaps ≥ 0.85 wu.
// House at +Z, yard toward −Z, pool −X, turf / ficus +X. PVC sits on the turf center.
export const BACKYARD_PLAY = Object.freeze({
  whoopClear: 1.06,
  wallH: 7.88,
  house: Object.freeze({
    x: 1.88, z: 17.62, w: 43.75, d: 17.25, wallH: 24.06, thick: 0.53,
  }),
  ridge: Object.freeze({ x: 1.88, y: 30.25, z: 17.62, w: 45.25, h: 0.53, d: 0.69 }),
  eaveS: Object.freeze({ x: 1.88, y: 23.81, z: 6.94, w: 45.75, h: 0.35, d: 3.5 }),
  eaveN: Object.freeze({ x: 1.88, y: 23.81, z: 28.31, w: 45.75, h: 0.35, d: 3.5 }),
  roofS: Object.freeze({ x: 1.88, y: 26.75, z: 12.12, w: 44.5, h: 0.45, d: 9.25 }),
  roofN: Object.freeze({ x: 1.88, y: 26.75, z: 23.12, w: 44.5, h: 0.45, d: 9.25 }),
  patio: Object.freeze({
    x: 5.0, z: 2.44, w: 17.5, d: 13.12, ceilY: 11.81, ceilH: 0.28, col: 0.6,
  }),
  shade: Object.freeze({ x: 5.0, y: 11.4, z: -3.98, w: 17.0, h: 0.2, d: 0.28 }),
  turf: Object.freeze({ x: 13.75, z: -8.5, w: 32.5, d: 33.75 }),
  pvc: Object.freeze({
    x: 13.75, z: -8.5, innerW: 3.98, innerD: 3.98, h: 8.75, bar: 0.2, midY: 4.38,
  }),
  ficus: Object.freeze({ x: 21.5, z: -19.25, r: 0.56, h: 17.5 }),
  planter: Object.freeze({ x: 21.5, z: -19.25, rOut: 3.31, rIn: 2.15, h: 1.75 }),
  fire: Object.freeze({ x: 15.5, z: -21.5, w: 4.0, d: 4.0, bowlR: 0.78, bowlH: 0.53 }),
  shed: Object.freeze({ x: 28.25, z: -14.38, w: 5.25, h: 7.88, d: 4.38 }),
  pool: Object.freeze({ x: -10.62, z: -6.88, w: 15.0, d: 30.0 }),
  deckT: 1.94,
  fence: Object.freeze({
    x: -2.69, z0: -25.25, z1: 7.56, h: 5.25, post: 0.15, spacing: 6.56,
    meshT: 0.07, meshY: 0.35, meshH: 4.65,
  }),
  pots: Object.freeze([
    Object.freeze({ x: -4.0, z: -21.94, r: 0.35, h: 0.9 }),
    Object.freeze({ x: -4.0, z: -8.85, r: 0.33, h: 0.8 }),
    Object.freeze({ x: -3.98, z: 4.28, r: 0.38, h: 0.98 }),
    Object.freeze({ x: -1.38, z: -21.94, r: 0.3, h: 0.72 }),
  ]),
  patioPlanters: Object.freeze([
    Object.freeze({ x: 0.75, z: -3.19, r: 0.43, h: 0.9 }),
    Object.freeze({ x: 12.69, z: -3.19, r: 0.43, h: 0.9 }),
    Object.freeze({ x: 0.75, z: 7.69, r: 0.38, h: 0.78 }),
    Object.freeze({ x: 12.69, z: 7.69, r: 0.38, h: 0.78 }),
  ]),
  pad: Object.freeze({ x: -23.12, z: -19.38, w: 8.0, d: 7.0, h: 0.35 }),
  sofa: Object.freeze({
    x: -23.12, z: -20.69, w: 4.25, seatH: 0.78, d: 1.69, backH: 1.44, backD: 0.28,
  }),
  palms: Object.freeze([
    Object.freeze({ x: -25.75, z: -16.75, r: 0.2, h: 14.0 }),
    Object.freeze({ x: -20.5, z: -16.38, r: 0.19, h: 13.0 }),
    Object.freeze({ x: -24.0, z: -22.31, r: 0.35, h: 9.5 }),
  ]),
  umbrella: Object.freeze({
    x: -18.81, z: -18.25, r: 2.94, bar: 0.15, segs: 5,
  }),
  canopy: Object.freeze({
    x: -22.0, y: 1.94, z: -15.69, innerW: 2.94, innerH: 2.75, bar: 0.15, depth: 2.94,
  }),
  wing: Object.freeze({
    x: -21.94, z: 13.0, w: 3.62, d: 15.25, wallH: 13.0,
  }),
  wingEave: Object.freeze({ x: -21.94, y: 15.19, z: 13.0, w: 5.25, h: 0.35, d: 16.75 }),
  alley: Object.freeze({ x: -27.19, z0: 9.0, z1: 26.25, w: 6.88 }),
  woodGate: Object.freeze({ x: -27.19, z: 25.69, w: 6.06, h: 6.94, d: 0.22 }),
  ac: Object.freeze({ x: -26.88, z: 8.19, w: 1.94, h: 2.69, d: 1.62 }),
  alleyEave: Object.freeze({ x: -27.19, y: 23.81, z: 17.62, w: 7.0, h: 0.35, d: 17.5 }),
  streetWall: Object.freeze({ x: 10.5, w: 40.25 }),
});

export const LAYOUT = {
  living: { w: 21, d: 28, h: 9.1, wall: 0.38 },
  garage: { w: 21, d: 42, h: 10.5, wall: 0.4 },
  warehouse: { w: 56, d: 84, h: 21, wall: 0.5 },
  backyard: { w: 61.25, d: 52.5, h: 0, wall: 0.45 },
  office: { w: 36, d: 46, h: 9.2, wall: 0.36 },
  gym: { w: 48, d: 74, h: 28, wall: 0.46 },
  trainer: { w: 28, d: 36, h: 10.5, wall: 0.34 },
  // Inner faces at exactly 20 × 15 × 6 m; walls sit outside (see buildRig).
  rig: { w: 70, d: 52.5, h: 21, wall: 0.35 },
  // Inner faces at exactly 18 × 12 × 2.7 m, as the Rig (see buildHouse).
  house: { w: 63, d: 42, h: 9.45, wall: 0.35 },
};

// The House's one key: a low afternoon sun from the west-north-west, warm.
// Low, it lights a floor at sin 25 deg of its strength, so it is stronger than
// the look's key overhead: its patches on the floor read about three times
// the fill round them, as the Rig's key does.
export const HOUSE_KEY = Object.freeze({ elevation: 25, azimuth: 250, color: 0xffd9a8, intensity: 9 });

export const MAP_ORBIT = {
  city: { cx: 0, cy: 5, cz: 0, r: 92, h: 22, fov: 62 },
  // Stay inside the room shell so the start-menu camera does not sit in a wall.
  living: { cx: 0, cy: 1.7, cz: -1.5, r: 6.4, h: 5.5, fov: 62 },
  garage: { cx: 0, cy: 2.0, cz: 1.5, r: 7.2, h: 6.4, fov: 60 },
  warehouse: { cx: 0, cy: 2.4, cz: 0, r: 2.2, h: 17.2, fov: 72 },
  backyard: { cx: 2.5, cy: 4.25, cz: -2.5, r: 35, h: 18.75, fov: 58 },
  office: { cx: 4, cy: 1.8, cz: 2, r: 6.8, h: 6.0, fov: 62 },
  gym: { cx: 0, cy: 3.4, cz: 2, r: 5.5, h: 16.5, fov: 68 },
  trainer: { cx: 0, cy: 1.9, cz: 0, r: 8.2, h: 6.6, fov: 60 },
  room: { cx: 0, cy: 1.6, cz: 0, r: 3.4, h: 4.8, fov: 64 },
  rig: { cx: 0, cy: 3.0, cz: 0, r: 16, h: 14, fov: 66 },
  // Round the open living room and kitchen, under the fan's blades.
  house: { cx: 8.75, cy: 3.5, cz: 12.25, r: 5.25, h: 7, fov: 70 },
};

export const MAP_LOOKS = {
  living: { fog: 0.004, sun: 0.55, env: 0.62, bg: 0.38, hemi: 0.38 },
  garage: { fog: 0.003, sun: 0.7, env: 0.26, bg: 0.34, hemi: 0.60 },
  warehouse: { fog: 0.0018, sun: 0.55, env: 0.5, bg: 0.28, hemi: 0.28 },
  backyard: { fog: 0.0018, sun: 1.05, env: 1.15, bg: 0.30, hemi: 0.90 },
  city: { fog: 0.00105, sun: 0.30, env: 0.18, bg: 0.16, hemi: 0.56 },
  office: { fog: 0.0032, sun: 0.48, env: 0.58, bg: 0.34, hemi: 0.36 },
  gym: { fog: 0.0010, sun: 0.95, env: 0.70, bg: 0.44, hemi: 0.55 },
  trainer: { fog: 0.0028, sun: 0.58, env: 0.56, bg: 0.33, hemi: 0.34 },
  room: { fog: 0.0045, sun: 0.42, env: 0.55, bg: 0.32, hemi: 0.40 },
  // On the look (sim-look.js): one key, the HDRI's fill; no fog, no sky, no
  // hemisphere.
  rig: lookLooks(),
  house: lookLooks({ sun: HOUSE_KEY.intensity }),
};

export const MAP_IDS = ['rig', 'house', 'living', 'garage', 'warehouse', 'backyard', 'office', 'gym', 'trainer', 'room'];

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

function boxFrameX(THREE, parent, colliders, spec, material) {
  const hx = spec.innerD / 2, hz = spec.innerW / 2, b = spec.bar, h = spec.h;
  for (const dx of [-hx, hx]) {
    for (const dz of [-hz, hz]) {
      box(THREE, parent, colliders, spec.x + dx, 0, spec.z + dz, b, h, b, material);
    }
  }
  for (const y of [h - b, spec.midY]) {
    if (y == null) continue;
    box(THREE, parent, colliders, spec.x, y, spec.z - hz, spec.innerD + b, b, b, material);
    box(THREE, parent, colliders, spec.x, y, spec.z + hz, spec.innerD + b, b, b, material);
    box(THREE, parent, colliders, spec.x - hx, y, spec.z, b, b, spec.innerW + b, material);
    box(THREE, parent, colliders, spec.x + hx, y, spec.z, b, b, spec.innerW + b, material);
  }
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
  const P = BACKYARD_PLAY;
  const mats = {
    turf: mat(THREE, 0x3f8a4a, 'grass'),
    pebble: mat(THREE, 0xc2b39a, 'concrete'),
    stucco: mat(THREE, 0xc4a882, 'facade'),
    tile: mat(THREE, 0xc45a32, 'wood'),
    wood: mat(THREE, 0x6a4e32, 'wood'),
    shed: mat(THREE, 0x7a8680, 'concrete'),
    cmu: mat(THREE, 0xb89a72, 'concrete'),
    metal: mat(THREE, 0x2a2c30, 'concrete'),
  };
  const floor = makeFloor(THREE, parent, L.w + 10, L.d + 10, mats.pebble);
  const turf = makeFloor(THREE, parent, P.turf.w, P.turf.d, mats.turf, 0.03);
  turf.position.set(P.turf.x, 0.03, P.turf.z);
  const patio = makeFloor(THREE, parent, P.patio.w, P.patio.d, mats.pebble, 0.05);
  patio.position.set(P.patio.x, 0.05, P.patio.z);
  const hx = L.w / 2, hz = L.d / 2, t = L.wall, wh = P.wallH;
  box(THREE, parent, colliders, 0, 0, -hz, L.w, wh, t, mats.cmu);
  box(THREE, parent, colliders, -hx, 0, 0, t, wh, L.d, mats.cmu);
  box(THREE, parent, colliders, hx, 0, 0, t, wh, L.d, mats.cmu);
  box(THREE, parent, colliders, P.streetWall.x, 0, hz, P.streetWall.w, wh, t, mats.cmu);
  const hs = P.house;
  box(THREE, parent, colliders, hs.x, 0, hs.z, hs.w, hs.wallH, hs.d, mats.stucco);
  box(THREE, parent, colliders, P.ridge.x, P.ridge.y, P.ridge.z, P.ridge.w, P.ridge.h, P.ridge.d, mats.tile);
  const pt = P.patio;
  const col = pt.col;
  for (const dx of [-pt.w / 2 + col, pt.w / 2 - col]) {
    for (const dz of [-pt.d / 2 + col, pt.d / 2 - col]) {
      box(THREE, parent, colliders, pt.x + dx, 0, pt.z + dz, col, pt.ceilY, col, mats.stucco);
    }
  }
  box(THREE, parent, colliders, pt.x, pt.ceilY, pt.z, pt.w, pt.ceilH, pt.d, mats.stucco);
  box(THREE, parent, colliders, P.shade.x, P.shade.y, P.shade.z, P.shade.w, P.shade.h, P.shade.d, mats.metal);
  boxFrameX(THREE, parent, colliders, P.pvc, mats.wood);
  cyl(THREE, parent, colliders, P.ficus.x, 0, P.ficus.z, P.ficus.r, P.ficus.r, P.ficus.h, mats.wood);
  const ring = P.planter;
  const ringT = ring.rOut - ring.rIn;
  const ringR = (ring.rOut + ring.rIn) / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    box(THREE, parent, colliders, ring.x + Math.cos(a) * ringR, 0, ring.z + Math.sin(a) * ringR, ringT, ring.h, ringT * 1.15, mats.cmu);
  }
  box(THREE, parent, colliders, P.fire.x, 0, P.fire.z, P.fire.w, 0.12, P.fire.d, mats.pebble);
  cyl(THREE, parent, colliders, P.fire.x, 0.12, P.fire.z, P.fire.bowlR, P.fire.bowlR * 0.82, P.fire.bowlH, mats.metal);
  box(THREE, parent, colliders, P.shed.x, 0, P.shed.z, P.shed.w, P.shed.h, P.shed.d, mats.shed);
  const pl = P.pool, dt = P.deckT;
  box(THREE, parent, colliders, pl.x, 0, pl.z - pl.d / 2 - dt / 2, pl.w + dt * 2, 0.22, dt, mats.pebble);
  box(THREE, parent, colliders, pl.x, 0, pl.z + pl.d / 2 + dt / 2, pl.w + dt * 2, 0.22, dt, mats.pebble);
  box(THREE, parent, colliders, pl.x - pl.w / 2 - dt / 2, 0, pl.z, dt, 0.22, pl.d, mats.pebble);
  box(THREE, parent, colliders, pl.x + pl.w / 2 + dt / 2, 0, pl.z, dt, 0.22, pl.d, mats.pebble);
  const fn = P.fence;
  let fi = 0;
  for (let z = fn.z0; z <= fn.z1 + 0.05; z += fn.spacing, fi++) {
    box(THREE, parent, colliders, fn.x, 0, z, fn.post, fn.h, fn.post, mats.metal);
    if (fi % 2 === 0 && z + fn.spacing <= fn.z1 + 0.05) {
      box(
        THREE, parent, colliders,
        fn.x, fn.meshY, z + fn.spacing / 2,
        fn.meshT, fn.meshH, fn.spacing - fn.post, mats.metal,
      );
    }
  }
  for (const pot of P.pots) {
    cyl(THREE, parent, colliders, pot.x, 0, pot.z, pot.r, pot.r * 0.85, pot.h, mats.tile);
  }
  for (const pot of P.patioPlanters) {
    cyl(THREE, parent, colliders, pot.x, 0, pot.z, pot.r, pot.r * 0.85, pot.h, mats.tile);
  }
  box(THREE, parent, colliders, P.pad.x, 0, P.pad.z, P.pad.w, P.pad.h, P.pad.d, mats.pebble);
  const sf = P.sofa;
  box(THREE, parent, colliders, sf.x, 0, sf.z, sf.w, sf.seatH, sf.d, mats.wood);
  box(THREE, parent, colliders, sf.x, sf.seatH, sf.z - sf.d / 2 + sf.backD / 2, sf.w, sf.backH - sf.seatH, sf.backD, mats.wood);
  for (const palm of P.palms) {
    cyl(THREE, parent, colliders, palm.x, 0, palm.z, palm.r, palm.r * 0.85, palm.h, mats.wood);
  }
  hoopFrame(THREE, parent, colliders, P.canopy.x, P.canopy.y, P.canopy.z, P.canopy.innerW, P.canopy.innerH, P.canopy.bar, P.canopy.depth, mats.tile);
  const wg = P.wing;
  box(THREE, parent, colliders, wg.x, 0, wg.z, wg.w, wg.wallH, wg.d, mats.stucco);
  box(THREE, parent, colliders, P.woodGate.x, 0, P.woodGate.z, P.woodGate.w, P.woodGate.h, P.woodGate.d, mats.wood);
  box(THREE, parent, colliders, P.ac.x, 0, P.ac.z, P.ac.w, P.ac.h, P.ac.d, mats.metal);
  addLight(THREE, parent, lights, 5, 12.75, 2.5, 0xffe0b8, 2.2, 40);
  addLight(THREE, parent, lights, -10, 10.5, -7.5, 0xfff0d0, 1.8, 32);
  addLight(THREE, parent, lights, -26.88, 9.25, 17.5, 0xffe8c4, 1.5, 22);
  addLight(THREE, parent, lights, 17.5, 9.5, -7.5, 0xe8f4d0, 1.4, 25);
  addLight(THREE, parent, lights, 2.75, 14.38, -2.5, 0xfff4e0, 1.7, 42);
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

// The Rig: a 20 × 15 × 6 m industrial interior at whoop scale, flow-first.
// Metres here, scene axes (y up); buildRig scales by RIG_WS. Every object is
// threaded by the loop (tracks/rig-loop.json), clockwise seen from above: the
// 15 m straight along the -z wall heading +x, the crate slots up the +x wall,
// the tunnel back along the +z wall, the tower bay, then one dive in the plane
// x = drop: over the pipes, down a pipe slit, through the loft hole, out under
// the loft onto the straight. Boxes only, axis-aligned, nothing under 6 cm
// thick and no slot of 4–10 cm (sim-core issue #5).
export const RIG_WS = 3.5; // world units per metre, as sim-core-adapter.js WS
const RIG_DROP = -9.05;
function rigBoxes() {
  const out = [];
  const b = (feature, part, x0, y0, z0, x1, y1, z1) => {
    const r = (v) => Math.round(v * 1e4) / 1e4;
    out.push(Object.freeze({ feature, part, min: [r(x0), r(y0), r(z0)], max: [r(x1), r(y1), r(z1)] }));
  };
  // Crates: three 2 m walls of 0.5 m crates across x = 9, out to the +x wall.
  // One slot each on x = 9, narrowing 25 → 21 → 18 cm; flown in a straight line.
  const walls = [[-1.0, 0.25], [-0.2, 0.21], [0.6, 0.18]];
  walls.forEach(([z, gap], w) => {
    const rx = 9 - gap / 2, wx = 9 + gap / 2, mid = 7.7 + (rx - 7.7) / 2;
    for (let k = 0; k < 4; k++) {
      const y = 0.5 * k, n = `wall ${w + 1} crate ${k + 1}`;
      b('crates', n + 'a', 7.7, y, z, mid, y + 0.5, z + 0.4);
      b('crates', n + 'b', mid, y, z, rx, y + 0.5, z + 0.4);
      b('crates', n + 'c', wx, y, z, 10, y + 0.5, z + 0.4);
    }
  });
  // Tunnel: 30 cm square bore, 4 m, axis y 1.2 / z 5.6, on three trestles.
  b('tunnel', 'side -z', 0.05, 0.97, 5.37, 4.05, 1.43, 5.45);
  b('tunnel', 'side +z', 0.05, 0.97, 5.75, 4.05, 1.43, 5.83);
  b('tunnel', 'floor', 0.05, 0.97, 5.45, 4.05, 1.05, 5.75);
  b('tunnel', 'roof', 0.05, 1.35, 5.45, 4.05, 1.43, 5.75);
  for (const x of [0.35, 2.0, 3.65]) b('support', 'tunnel trestle', x, 0, 5.37, x + 0.1, 0.97, 5.83);
  // Scaffold tower: 1.3 × 2.2 m, decks at 1.7 / 3.4 / 5.1 m, ±x faces open
  // (the line crosses bay 2), guard rails on the ±z faces.
  const tx0 = -7.55, tx1 = -6.25, tz0 = 4.0, tz1 = 6.2, p = 0.08;
  for (const [x, z] of [[tx1 - p, tz0], [tx1 - p, tz1 - p], [tx0, tz0], [tx0, tz1 - p]]) {
    b('tower', 'post', x, 0, z, x + p, 5.1, z + p);
  }
  for (const y of [1.7, 3.4, 5.1]) b('tower', 'deck', tx0, y - 0.06, tz0, tx1, y, tz1);
  for (const y of [1.0, 2.7, 4.4]) {
    b('tower', 'rail', tx0 + p, y - 0.03, tz0, tx1 - p, y + 0.03, tz0 + 0.06);
    b('tower', 'rail', tx0 + p, y - 0.03, tz1 - 0.06, tx1 - p, y + 0.03, tz1);
  }
  // Pipe run: seven 15 cm pipes, 20 cm apart, the first flush to the -x wall
  // (no slot behind it). Up from the floor at z 3.2, along the ceiling into
  // the -z wall. The dive takes the slit centred on the drop plane.
  for (let k = 0; k < 7; k++) {
    const x = -10 + 0.35 * k;
    b('pipes', 'pipe', x, 4.8, -7.5, x + 0.15, 4.95, 3.2);
    b('pipes', 'riser', x, 0, 3.2, x + 0.15, 4.95, 3.35);
  }
  b('support', 'pipe hanger', -10, 4.74, -2.65, -7.69, 4.8, -2.55);
  b('support', 'pipe hanger rod', -7.75, 4.74, -2.63, -7.69, 6, -2.57);
  // Loft: 10 cm slab at 2.8 m over the -x end, a 1.0 × 1.8 m hole on the
  // drop plane, three posts on the room edge.
  const hx0 = RIG_DROP - 0.5, hx1 = RIG_DROP + 0.5, hz0 = -3.75, hz1 = -1.95;
  b('loft', 'floor', -10, 2.7, -4.6, hx0, 2.8, 0);
  b('loft', 'floor', hx1, 2.7, -4.6, -7.0, 2.8, 0);
  b('loft', 'floor', hx0, 2.7, hz1, hx1, 2.8, 0);
  b('loft', 'floor', hx0, 2.7, -4.6, hx1, 2.8, hz0);
  for (const z of [-4.6, -2.36, -0.12]) b('support', 'loft post', -7.12, 0, z, -7.0, 2.7, z + 0.12);
  return out;
}

export const RIG_PLAY = Object.freeze({
  room: Object.freeze({ w: 20, d: 15, h: 6 }),
  drop: RIG_DROP,
  // Designed gaps the line threads, metres.
  gaps: Object.freeze({ crates: Object.freeze([0.25, 0.21, 0.18]), pipes: 0.20, tunnel: 0.30, hole: Object.freeze([1.0, 1.8]) }),
  straight: 15,
  boxes: Object.freeze(rigBoxes()),
});

// The Rig on the look (sim-look.js): a real surface per zone, the zone's hue
// as a paint tint on it, so the zone still reads at a glance. The room (floor,
// walls, ceiling) stays neutral grey, the gates keep brand orange / green /
// white, and no zone takes those. A support takes the hue of what it holds.
function rigSurface(type, look, color) {
  const s = LOOK.surfaces[look];
  return Object.freeze({ type, look, color, roughness: s.roughness, metalness: s.metalness });
}
export const RIG_LOOK = Object.freeze({
  surfaces: Object.freeze({
    floor: rigSurface('concrete', 'concrete', 0xffffff),
    wall: rigSurface('painted block', 'paintedBlock', 0xe6e8ec),
    ceil: rigSurface('painted deck', 'deck', 0x9a9ea5),
    tower: rigSurface('painted steel scaffold', 'paintedSteel', 0xf2d10a),
    pipes: rigSurface('galvanised pipe', 'galvanised', 0x6f9be0),
    crates: rigSurface('plywood crate', 'plywood', 0xd9a066),
    tunnel: rigSurface('enamelled sheet steel', 'enamel', 0x9466e0),
    loft: rigSurface('rubber matting', 'rubber', 0xd0306a),
  }),
  // Floor grid, metres: the concrete's saw-cut joints, a cut every metre, a
  // wider one every 5 m.
  grid: Object.freeze({ minor: LOOK.joints.minor, major: LOOK.joints.major }),
});

function rigZone(box) {
  if (box.feature !== 'support') return box.feature;
  return box.part.startsWith('tunnel') ? 'tunnel' : box.part.startsWith('pipe') ? 'pipes' : 'loft';
}

function buildRig(THREE, parent, colliders) {
  const P = RIG_PLAY, s = RIG_WS, L = LAYOUT.rig;
  const hx = P.room.w * s / 2, hz = P.room.d * s / 2, H = P.room.h * s, t = L.wall;
  // Faces sit a hair behind their edge lines so the lines never z-fight.
  const surface = (key, opts) => {
    const f = RIG_LOOK.surfaces[key];
    const m = lookMaterial(THREE, f.look, f.color, Object.assign({
      extras: { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 },
    }, opts));
    m.name = 'rig ' + f.type;
    return m;
  };
  const mats = {
    floor: surface('floor', { joints: { origin: [-hx, -hz], unit: s } }), wall: surface('wall'), ceil: surface('ceil'),
    crates: surface('crates'), tunnel: surface('tunnel'), tower: surface('tower'),
    pipes: surface('pipes'), loft: surface('loft'),
  };
  const tiled = (mesh) => lookBoxUv(mesh, mesh.material.userData.lookTile * s);
  const vis = new THREE.Group();
  vis.name = 'rigArtVisuals';
  parent.add(vis);
  const edges = [];
  const edge = (a, b) => {
    const add = (p, q) => edges.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    for (const y of [a[1], b[1]]) {
      add([a[0], y, a[2]], [b[0], y, a[2]]); add([a[0], y, b[2]], [b[0], y, b[2]]);
      add([a[0], y, a[2]], [a[0], y, b[2]]); add([b[0], y, a[2]], [b[0], y, b[2]]);
    }
    for (const [x, z] of [[a[0], a[2]], [b[0], a[2]], [a[0], b[2]], [b[0], b[2]]]) add([x, a[1], z], [x, b[1], z]);
  };
  for (const r of P.boxes) {
    const a = r.min.map((v) => v * s), b = r.max.map((v) => v * s);
    const zone = rigZone(r);
    const mesh = box(THREE, vis, colliders, (a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2,
      b[0] - a[0], b[1] - a[1], b[2] - a[2], mats[zone]);
    mesh.name = 'rig_' + zone;
    tiled(mesh);
    edge(a, b);
  }
  // Shell: inner faces at exactly ±10 × ±7.5 × 6 m. One box per wall (no
  // split halves, no zero-width lintel); walls and ceiling cast no shadow so
  // the key comes in from above. The floor carries the soft AO under every
  // box (floorAo).
  const floor = makeFloor(THREE, vis, P.room.w * s, P.room.d * s, mats.floor);
  lookFloor(THREE, floor, P.room, s, floorAo(P.boxes, P.room));
  const shell = [
    box(THREE, vis, colliders, -hx - t / 2, 0, 0, t, H, 2 * hz + 2 * t, mats.wall),
    box(THREE, vis, colliders, hx + t / 2, 0, 0, t, H, 2 * hz + 2 * t, mats.wall),
    box(THREE, vis, colliders, 0, 0, -hz - t / 2, 2 * hx, H, t, mats.wall),
    box(THREE, vis, colliders, 0, 0, hz + t / 2, 2 * hx, H, t, mats.wall),
    box(THREE, vis, colliders, 0, H, 0, 2 * hx + 2 * t, 0.24, 2 * hz + 2 * t, mats.ceil),
  ];
  for (const m of shell) {
    m.castShadow = false;
    tiled(m);
  }
  edge([-hx, 0, -hz], [hx, H, hz]);
  // The edge lines at the look's 60%, bloomed (sim-look.js lookLines).
  const lines = lookLines(THREE, edges);
  lines.name = 'rigEdges';
  lines.userData.artKeep = true;
  vis.add(lines);
  return { floor, orbit: MAP_ORBIT.rig };
}

// The House: a one-storey home at whoop scale, 18 × 12 × 2.7 m, the second map
// on the look. Metres here, scene axes (y up, +z the street side); buildHouse
// scales by HOUSE_WS. The rooms ring a core and the House Loop
// (tracks/house-loop.json) rings them anticlockwise seen from above: the entry
// hall; the living room (through the bookshelf gap, round its end, over the
// sofa back under the fan); the kitchen (over the island, a dive over the
// stools); a climb through the hallway's three doors; the bedroom (over the
// bed); the walk-through closet; the bathroom (once round the tub, climbing);
// the back hall's sliding door; the patio (a chair, under the table, the other
// chair); the garden door back into the hall. Real sizes: doors 0.8 × 2.0,
// counters 0.9, table 0.75, chair backs 0.9, sofa seat 0.45, bed 0.55. Boxes
// only, axis-aligned, nothing under 6 cm thick and no slot of 4–10 cm
// (sim-core issue #5), as the Rig.
export const HOUSE_WS = 3.5; // world units per metre, as sim-core-adapter.js WS
const HOUSE_H = 2.7;
function houseBoxes() {
  const out = [];
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const b = (room, mat, feature, part, x0, y0, z0, x1, y1, z1) => {
    out.push(Object.freeze({ room, mat, feature, part, min: [r(x0), r(y0), r(z0)], max: [r(x1), r(y1), r(z1)] }));
  };
  // A wall t thick about c, from a0 to a1 along z (alongZ) or x, with door
  // openings { at, w, h }: the solid runs either side, a lintel over each.
  const wall = (room, alongZ, c, t, a0, a1, holes) => {
    const put = (p0, p1, y0, part) => {
      if (p1 - p0 < 1e-6) return;
      if (alongZ) b(room, 'wall', 'walls', part, c - t / 2, y0, p0, c + t / 2, HOUSE_H, p1);
      else b(room, 'wall', 'walls', part, p0, y0, c - t / 2, p1, HOUSE_H, c + t / 2);
    };
    let at = a0;
    for (const h of holes || []) {
      put(at, h.at - h.w / 2, 0, 'wall');
      put(h.at - h.w / 2, h.at + h.w / 2, h.h, 'lintel');
      at = h.at + h.w / 2;
    }
    put(at, a1, 0, 'wall');
  };
  const door = { w: 0.8, h: 2.0 };
  const at = (c, o) => Object.assign({ at: c }, door, o);
  // Walls. The house's west wall stands between the back hall / entry and the
  // patio: the sliding door (its open half, then the fixed pane) and the
  // garden door. The rest of the outer walls are the shell (buildHouse).
  wall('hall', true, -5.6, 0.2, -6, 6, [at(-4.6, { w: 2.0, h: 2.05 }), at(4.3)]);
  wall('core', false, -1.4, 0.1, -2.75, 9, [at(8.2)]);
  wall('entry', true, -2.5, 0.1, -1.35, 6, [at(4.3, { w: 1.2, h: 2.1 })]);
  wall('entry', false, 1.05, 0.1, -5.5, -2.55);
  wall('bathroom', true, -2.7, 0.1, -6, -1.45, [at(-5.1)]);
  wall('closet', true, 1.5, 0.1, -6, -1.45, [at(-5.1)]);
  wall('closet', true, 3.4, 0.1, -6, -1.45, [at(-5.1)]);
  wall('closet', false, -4.1, 0.1, 1.55, 3.35);
  wall('hallway', true, 7.4, 0.1, -1.35, 1.7);
  wall('hallway', false, 1.65, 0.1, 7.45, 9, [at(8.2)]);
  wall('hallway', false, 0.1, 0.1, 7.45, 9, [at(8.2)]);
  // Doors, open 90 degrees, beside their openings; the front door shut.
  b('hallway', 'white', 'doors', 'door 1', 8.6, 0, 0.8, 8.66, 2.0, 1.6);
  b('hallway', 'white', 'doors', 'door 2', 7.74, 0, -0.75, 7.8, 2.0, 0.05);
  b('bedroom', 'white', 'doors', 'door 3', 8.6, 0, -2.25, 8.66, 2.0, -1.45);
  b('hall', 'white', 'doors', 'bathroom door', -3.55, 0, -5.56, -2.75, 2.0, -5.5);
  b('patio', 'white', 'doors', 'garden door', -6.5, 0, 4.7, -5.7, 2.0, 4.76);
  b('entry', 'blue', 'doors', 'front door', -4.5, 0, 5.94, -3.5, 2.1, 6);
  // The sliding door: the moving pane parked over the fixed one.
  b('hall', 'glass', 'sliding door', 'fixed pane', -5.63, 0, -4.6, -5.57, 2.05, -3.6);
  b('hall', 'glass', 'sliding door', 'sliding pane', -5.69, 0, -4.6, -5.63, 2.05, -3.6);
  b('hall', 'steel', 'sliding door', 'mullion', -5.7, 0, -4.66, -5.5, 2.05, -4.6);
  // Entry hall: a sideboard and its mirror, a bench by the front door.
  b('entry', 'wood', 'entry', 'sideboard', -5.1, 0, 1.1, -3.7, 0.8, 1.5);
  b('entry', 'steel', 'entry', 'mirror', -4.9, 1.2, 1.1, -3.9, 1.9, 1.16);
  b('entry', 'wood', 'entry', 'bench', -5.5, 0, 5.6, -4.8, 0.45, 6);
  // Living room. The bookshelf: a free-standing open divider, three bays; the
  // middle bay has no shelf from 0.9 to 1.68 m: the gap the line threads.
  const sz0 = 1.45, sz1 = 1.8;
  const ups = [-1.92, -1.26, -0.6, 0.06];
  for (const x of ups) b('living', 'wood', 'bookshelf', 'upright', x, 0, sz0, x + 0.06, 1.94, sz1);
  // Boards the whole width (through the uprights): the 15 cm plinth, the
  // shelves at 0.42, 0.84 (the gap's sill) and 1.68 (its head), the top; the
  // outer bays a shelf at 1.26 too.
  for (const [y0, y1] of [[0, 0.15], [0.42, 0.48], [0.84, 0.9], [1.68, 1.74], [1.94, 2.0]]) {
    b('living', 'wood', 'bookshelf', y0 ? (y0 === 0.84 ? 'gap sill' : 'shelf') : 'plinth', ups[0], y0, sz0, ups[3] + 0.06, y1, sz1);
  }
  for (const i of [0, 2]) b('living', 'wood', 'bookshelf', 'shelf', ups[i] + 0.06, 1.26, sz0, ups[i + 1], 1.32, sz1);
  // Books: blocks 24 cm tall on a shelf (12 cm under the next), 16 on the
  // plinth, flush to an upright and never flush to both sides of one.
  const books = [
    [0.15, 0.16, -1.86, -1.56, 'blue'], [0.48, 0.24, -1.86, -1.62, 'white'], [0.9, 0.24, -1.5, -1.26, 'terracotta'],
    [1.32, 0.24, -1.86, -1.6, 'blue'], [0.15, 0.16, -1.2, -0.92, 'white'], [0.48, 0.24, -0.84, -0.6, 'terracotta'],
    [0.15, 0.16, -0.54, -0.3, 'terracotta'], [0.48, 0.24, -0.18, 0.06, 'blue'], [0.9, 0.24, -0.54, -0.3, 'white'],
    [1.32, 0.24, -0.24, 0.06, 'blue'],
  ];
  for (const [y, h, x0, x1, mat] of books) b('living', mat, 'bookshelf', 'books', x0, y, 1.5, x1, y + h, 1.75);
  // The sofa faces the TV on the street wall; the fan hangs over its back.
  b('living', 'sofa', 'sofa', 'seat', 1.2, 0, 2.1, 3.4, 0.45, 3.05);
  b('living', 'sofa', 'sofa', 'back', 1.2, 0.45, 2.1, 3.4, 0.85, 2.3);
  b('living', 'sofa', 'sofa', 'arm', 1.2, 0.45, 2.3, 1.4, 0.62, 3.05);
  b('living', 'sofa', 'sofa', 'arm', 3.2, 0.45, 2.3, 3.4, 0.62, 3.05);
  b('living', 'wood', 'coffee table', 'top', 1.3, 0.36, 3.6, 2.3, 0.42, 4.2);
  for (const [x, z] of [[1.3, 3.6], [2.24, 3.6], [1.3, 4.14], [2.24, 4.14]]) b('living', 'wood', 'coffee table', 'leg', x, 0, z, x + 0.06, 0.36, z + 0.06);
  b('living', 'wood', 'tv unit', 'unit', 1.3, 0, 5.55, 3.3, 0.5, 6);
  b('living', 'black', 'tv unit', 'tv', 1.7, 0.5, 5.7, 2.9, 1.22, 5.78);
  b('living', 'steel', 'fan', 'blade', 1.65, 2.29, 2.135, 2.95, 2.35, 2.265);
  b('living', 'steel', 'fan', 'blade', 2.235, 2.29, 1.55, 2.365, 2.35, 2.85);
  b('living', 'steel', 'fan', 'motor', 2.2, 2.35, 2.1, 2.4, 2.5, 2.3);
  b('living', 'steel', 'fan', 'downrod', 2.27, 2.5, 2.17, 2.33, 2.7, 2.23);
  b('living', 'sofa', 'armchair', 'seat', -2.25, 0, -1.2, -1.45, 0.42, -0.4);
  b('living', 'sofa', 'armchair', 'back', -2.25, 0.42, -1.2, -1.45, 0.8, -1.0);
  // Kitchen: the island (white, a steel top, its overhang over the stools),
  // three stools, the street-side run with the range and its hood between
  // open shelves, and on the core side the fridge and a second run.
  b('kitchen', 'white', 'island', 'base', 3.5, 0, 2.9, 4.4, 0.84, 4.7);
  b('kitchen', 'steel', 'island', 'top', 3.45, 0.84, 2.85, 4.6, 0.9, 4.75);
  for (const z of [3.2, 3.8, 4.4]) {
    b('kitchen', 'wood', 'stools', 'seat', 4.75, 0.62, z - 0.18, 5.11, 0.68, z + 0.18);
    for (const [x, dz] of [[4.75, -0.18], [5.05, -0.18], [4.75, 0.12], [5.05, 0.12]]) {
      b('kitchen', 'steel', 'stools', 'leg', x, 0, z + dz, x + 0.06, 0.62, z + dz + 0.06);
    }
  }
  b('kitchen', 'white', 'cabinets', 'base', 3.6, 0, 5.4, 9, 0.84, 6);
  b('kitchen', 'steel', 'cabinets', 'counter', 3.6, 0.84, 5.35, 9, 0.9, 6);
  b('kitchen', 'black', 'cabinets', 'oven', 5.95, 0.15, 5.34, 6.75, 0.84, 5.4);
  b('kitchen', 'steel', 'range hood', 'canopy', 5.9, 1.55, 5.45, 6.8, 1.75, 6);
  b('kitchen', 'steel', 'range hood', 'chimney', 6.15, 1.75, 5.7, 6.55, 2.7, 6);
  // Open shelves: three boards the run's length, the sides through them.
  const openShelves = (x0, x1, z0, z1) => {
    for (const y of [1.45, 1.85, 2.25]) b('kitchen', 'white', 'cabinets', 'open shelf', x0, y, z0, x1, y + 0.06, z1);
    for (const x of [x0, x1 - 0.06]) b('kitchen', 'white', 'cabinets', 'open shelf side', x, 1.45, z0, x + 0.06, 2.31, z1);
  };
  openShelves(3.6, 5.75, 5.65, 6);
  openShelves(6.95, 9, 5.65, 6);
  b('kitchen', 'steel', 'cabinets', 'fridge', 6.6, 0, -1.35, 7.35, 2.0, -0.65);
  b('kitchen', 'white', 'cabinets', 'base', 3.6, 0, -1.35, 6.45, 0.84, -0.75);
  b('kitchen', 'steel', 'cabinets', 'counter', 3.6, 0.84, -1.35, 6.45, 0.9, -0.7);
  openShelves(3.6, 6.45, -1.35, -1.0);
  // Bedroom: the bed's head on the back wall, a nightstand and lamp each side,
  // a dresser on the closet wall.
  b('bedroom', 'blue', 'bed', 'headboard', 4.45, 0, -6, 6.15, 1.1, -5.85);
  b('bedroom', 'blue', 'bed', 'base', 4.45, 0, -6, 6.15, 0.3, -3.9);
  b('bedroom', 'bedding', 'bed', 'duvet', 4.45, 0.3, -6, 6.15, 0.55, -3.9);
  b('bedroom', 'sofa', 'bed', 'pillow', 4.65, 0.55, -5.85, 5.22, 0.67, -5.45);
  b('bedroom', 'sofa', 'bed', 'pillow', 5.38, 0.55, -5.85, 5.95, 0.67, -5.45);
  for (const x of [4.0, 6.15]) {
    b('bedroom', 'blue', 'nightstands', 'nightstand', x, 0, -6, x + 0.45, 0.55, -5.55);
    b('bedroom', 'steel', 'nightstands', 'lamp', x + 0.195, 0.55, -5.81, x + 0.255, 0.85, -5.75);
    b('bedroom', 'sofa', 'nightstands', 'lamp shade', x + 0.115, 0.85, -5.89, x + 0.335, 1.05, -5.67);
  }
  b('bedroom', 'blue', 'bedroom', 'dresser', 3.45, 0, -3.6, 3.95, 0.8, -2.2);
  // Walk-through closet: hanging on the back wall, open shelves on the other.
  b('closet', 'steel', 'closet', 'rail', 1.55, 1.7, -5.8, 3.35, 1.76, -5.74);
  b('closet', 'sofa', 'closet', 'clothes', 1.55, 0.95, -6, 2.35, 1.7, -5.55);
  b('closet', 'bedding', 'closet', 'clothes', 2.5, 0.95, -6, 3.35, 1.7, -5.55);
  b('closet', 'blue', 'closet', 'shelf', 1.55, 1.9, -6, 3.35, 1.96, -5.6);
  for (const x of [1.55, 3.29]) b('closet', 'blue', 'closet', 'shelf side', x, 0, -4.55, x + 0.06, 1.94, -4.15);
  for (const y of [0, 0.5, 1.0, 1.5, 1.94]) b('closet', 'blue', 'closet', y ? 'shelf' : 'plinth', 1.55, y, -4.55, 3.35, y ? y + 0.06 : 0.15, -4.15);
  b('closet', 'sofa', 'closet', 'folded', 1.75, 0.15, -4.5, 2.2, 0.35, -4.15);
  b('closet', 'bedding', 'closet', 'folded', 2.5, 0.56, -4.5, 3.1, 0.76, -4.15);
  b('closet', 'sofa', 'closet', 'folded', 1.8, 1.06, -4.5, 2.6, 1.26, -4.15);
  // Bathroom: the tub free-standing in the middle (the line goes round it),
  // a vanity and mirror, the WC.
  b('bathroom', 'white', 'tub', 'bottom', -1.45, 0, -3.9, 0.25, 0.2, -3.1);
  b('bathroom', 'white', 'tub', 'side', -1.45, 0.2, -3.9, 0.25, 0.6, -3.82);
  b('bathroom', 'white', 'tub', 'side', -1.45, 0.2, -3.18, 0.25, 0.6, -3.1);
  b('bathroom', 'white', 'tub', 'end', -1.45, 0.2, -3.82, -1.37, 0.6, -3.18);
  b('bathroom', 'white', 'tub', 'end', 0.17, 0.2, -3.82, 0.25, 0.6, -3.18);
  b('bathroom', 'white', 'bathroom', 'vanity', -2.2, 0, -6, -0.9, 0.85, -5.45);
  b('bathroom', 'steel', 'bathroom', 'mirror', -2.1, 1.1, -6, -1.0, 1.9, -5.94);
  b('bathroom', 'white', 'bathroom', 'wc cistern', 1.25, 0, -2.3, 1.45, 0.8, -1.75);
  b('bathroom', 'white', 'bathroom', 'wc bowl', 0.8, 0, -2.2, 1.25, 0.42, -1.85);
  // Back hall: a sideboard and a pot by the sliding door's light.
  b('hall', 'wood', 'hall', 'sideboard', -3.0, 0, -1.2, -2.55, 0.8, 0.8);
  b('hall', 'terracotta', 'hall', 'pot', -5.35, 0, 0.45, -4.95, 0.45, 0.85);
  // Patio: posts holding the roof's edge, glass over the garden wall (the
  // shell's), the table, a chair either side of the line, two pots.
  for (const z of [-6, -0.06, 5.88]) b('patio', 'wood', 'patio', 'post', -9, 0, z, -8.88, HOUSE_H, z + 0.12);
  b('patio', 'glass', 'patio', 'screen', -9, 0.9, -6, -8.94, HOUSE_H, 6);
  b('patio', 'glass', 'patio', 'screen', -9, 0.9, -6, -5.7, HOUSE_H, -5.94);
  b('patio', 'glass', 'patio', 'screen', -9, 0.9, 5.94, -5.7, HOUSE_H, 6);
  b('patio', 'wood', 'patio table', 'top', -8.05, 0.69, -0.85, -7.15, 0.75, 0.05);
  for (const [x, z] of [[-8.05, -0.85], [-7.21, -0.85], [-8.05, -0.01], [-7.21, -0.01]]) b('patio', 'wood', 'patio table', 'leg', x, 0, z, x + 0.06, 0.69, z + 0.06);
  // A chair: the back legs run up as its back's posts.
  const chair = (x0, z0, backZ) => {
    b('patio', 'terracotta', 'patio chairs', 'seat', x0, 0.39, z0, x0 + 0.45, 0.45, z0 + 0.45);
    for (const [dx, dz] of [[0, 0], [0.39, 0], [0, 0.39], [0.39, 0.39]]) {
      const post = Math.abs(z0 + dz - backZ) < 1e-9;
      b('patio', 'terracotta', 'patio chairs', post ? 'post' : 'leg', x0 + dx, 0, z0 + dz, x0 + dx + 0.06, post ? 0.9 : 0.39, z0 + dz + 0.06);
    }
    b('patio', 'terracotta', 'patio chairs', 'back', x0, 0.45, backZ, x0 + 0.45, 0.9, backZ + 0.06);
  };
  chair(-8.2, -3.125, -3.125);
  chair(-7.45, 1.775, 2.165);
  b('patio', 'terracotta', 'patio', 'pot', -8.7, 0, -5.8, -8.25, 0.5, -5.35);
  b('patio', 'terracotta', 'patio', 'pot', -8.7, 0, 5.35, -8.25, 0.5, 5.8);
  return out;
}

// Floors: a surface per room, metres, tiling the 18 × 12 m with no overlap.
const HOUSE_FLOORS = Object.freeze([
  Object.freeze({ mat: 'floorWood', x0: -5.7, x1: 3.45, z0: -1.4, z1: 6 }),
  Object.freeze({ mat: 'floorWood', x0: -5.7, x1: -2.65, z0: -6, z1: -1.4 }),
  Object.freeze({ mat: 'floorWood', x0: 1.45, x1: 9, z0: -6, z1: -1.4 }),
  Object.freeze({ mat: 'floorTile', x0: 3.45, x1: 9, z0: -1.4, z1: 6 }),
  Object.freeze({ mat: 'floorBath', x0: -2.65, x1: 1.45, z0: -6, z1: -1.4 }),
  Object.freeze({ mat: 'floorPatio', x0: -9, x1: -5.7, z0: -6, z1: 6 }),
]);

// The House Loop's line, metres: a turtle from the start pad heading +x,
// through every room and back. ['L', d] runs straight; ['A', r, deg] arcs at
// radius r, turning left for a positive angle (+x toward -z); ['H', h] pins
// the height here (a monotone cubic between pins); ['G', size, name] puts a
// gate here, its ring radius size. tracks/house-loop.json is its gates
// (tools/build_house_loop.mjs).
const HOUSE_LINE = Object.freeze([
  ['H', 1.1], ['L', 1.7], ['G', 0.45, 'entry arch'], ['H', 1.15],
  ['A', 1.6, 90], ['L', 1.08], ['G', 0.3, 'bookshelf gap'], ['H', 1.29], ['L', 0.92],
  ['A', 1.6, -90], ['G', 0.4, 'round the bookshelf'], ['H', 1.45], ['A', 1.6, -90], ['L', 1.5], ['G', 0.4, 'sofa back, under the fan'], ['H', 1.2],
  ['A', 1.6, 90], ['L', 0.05], ['G', 0.4, 'kitchen island'], ['H', 1.25], ['L', 0.65], ['H', 1.21], ['L', 2.0],
  ['A', 1.6, 45], ['G', 0.4, 'into the hallway'], ['A', 1.6, 45], ['L', 0.55], ['G', 0.33, 'hallway door 1'], ['H', 0.75],
  ['L', 1.55], ['H', 1.05], ['L', 1.5], ['G', 0.33, 'hallway door 3'], ['H', 1.3], ['L', 2.1],
  ['A', 1.6, 45], ['G', 0.4, 'into the bedroom'], ['A', 1.6, 45], ['L', 1.3], ['G', 0.45, 'over the bed'], ['H', 1.0],
  ['L', 2.85], ['G', 0.33, 'closet'], ['H', 0.75], ['L', 3.05], ['H', 0.7],
  ['A', 1.65, 90], ['G', 0.4, 'round the tub'], ['A', 1.65, 90], ['G', 0.4, 'round the tub'], ['A', 1.65, 90], ['G', 0.4, 'round the tub'],
  ['A', 1.65, 90], ['G', 0.4, 'over the way in'], ['H', 1.45], ['L', 5.0], ['G', 0.4, 'sliding door'], ['H', 1.3], ['L', 0.15],
  ['A', 1.6, 90], ['L', 0.6], ['G', 0.4, 'patio chair'], ['H', 0.75], ['L', 1.3],
  ['A', 3, -15], ['H', 0.35], ['A', 3, -8.556], ['G', 0.3, 'under the table'], ['A', 3, 8.556], ['H', 0.35], ['A', 3, 15],
  ['L', 1.2], ['G', 0.4, 'patio chair'], ['L', 0.702],
  ['A', 1.6, 90], ['L', 0.65], ['G', 0.33, 'garden door'], ['H', 1.1], ['L', 1.4],
]);

// The line sampled every ds metres: points [x, y, z], the arc length s, the
// plan heading, and the gates { at (index), size, name, ry }.
export function houseLine(ds) {
  const step = ds || 0.01;
  let x = -4.2, z = 4.3, hx = 1, hz = 0, s = 0;
  const plan = [[x, z, s, hx, hz]], pins = [], gates = [];
  const go = (d) => { const n = Math.max(1, Math.ceil(d / step)); for (let i = 1; i <= n; i++) { x += hx * d / n; z += hz * d / n; s += d / n; plan.push([x, z, s, hx, hz]); } };
  const arc = (rad, deg) => {
    const a = Math.abs(deg) * Math.PI / 180, sgn = Math.sign(deg), n = Math.max(1, Math.ceil(rad * a / step));
    for (let i = 1; i <= n; i++) {
      const p = sgn * a / n, c = Math.cos(p), sn = Math.sin(p);
      // The chord of this step, then the turn: a left turn takes +x to -z.
      const mx = hx * Math.cos(p / 2) + hz * Math.sin(p / 2), mz = -hx * Math.sin(p / 2) + hz * Math.cos(p / 2);
      const chord = 2 * rad * Math.sin(a / n / 2);
      x += mx * chord; z += mz * chord; s += rad * a / n;
      [hx, hz] = [hx * c + hz * sn, -hx * sn + hz * c];
      plan.push([x, z, s, hx, hz]);
    }
  };
  for (const op of HOUSE_LINE) {
    if (op[0] === 'L') go(op[1]);
    else if (op[0] === 'A') arc(op[1], op[2]);
    else if (op[0] === 'H') pins.push([s, op[1]]);
    else if (op[0] === 'G') gates.push({ s, size: op[1], name: op[2], ry: Math.atan2(hx, hz) });
  }
  // Heights: a monotone cubic through the pins (Fritsch-Carlson), so a dive
  // never undershoots its pin; closed, so the end meets the start.
  const L = s, k = pins.concat([[L + pins[0][0], pins[0][1]]]);
  const m = k.map((p, i) => {
    if (i === 0 || i === k.length - 1) {
      const a = i ? k[i - 1] : [k[k.length - 2][0] - L, k[k.length - 2][1]], b = i ? [k[1][0] + L, k[1][1]] : k[1];
      const d0 = (p[1] - a[1]) / (p[0] - a[0]), d1 = (b[1] - p[1]) / (b[0] - p[0]);
      return d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1);
    }
    const d0 = (p[1] - k[i - 1][1]) / (p[0] - k[i - 1][0]), d1 = (k[i + 1][1] - p[1]) / (k[i + 1][0] - p[0]);
    return d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1);
  });
  const height = (t) => {
    let u = t < k[0][0] ? t + L : t;
    let i = 0;
    while (i < k.length - 2 && k[i + 1][0] < u) i++;
    const [s0, h0] = k[i], [s1, h1] = k[i + 1], d = s1 - s0, q = (u - s0) / d;
    const q2 = q * q, q3 = q2 * q;
    return (2 * q3 - 3 * q2 + 1) * h0 + (q3 - 2 * q2 + q) * d * m[i] + (-2 * q3 + 3 * q2) * h1 + (q3 - q2) * d * m[i + 1];
  };
  const points = plan.map(([px, pz, ps]) => [px, height(ps), pz]);
  const at = (t) => plan.findIndex((p) => p[2] >= t - 1e-9);
  return {
    length: L,
    closes: Math.hypot(x + 4.2, z - 4.3) + Math.hypot(hx - 1, hz),
    points,
    s: plan.map((p) => p[2]),
    gates: gates.map((g) => Object.assign(g, { at: at(g.s) })),
  };
}

export const HOUSE_PLAY = Object.freeze({
  room: Object.freeze({ w: 18, d: 12, h: HOUSE_H }),
  // The start pad, on the floor of the entry hall, nose down the line (+x).
  start: Object.freeze([-4.2, 0.35, 4.3]),
  // The patio strip, open air under the roof's edge: glass over a 0.9 m
  // garden wall on its three outer sides.
  patio: Object.freeze({ x0: -9, x1: -5.7, z0: -6, z1: 6, gardenWall: 0.9 }),
  // The owner's real dimensions, metres.
  sizes: Object.freeze({ door: Object.freeze([0.8, 2.0]), table: 0.75, chairBack: 0.9, counter: 0.9, sofaSeat: 0.45, bed: 0.55 }),
  floors: HOUSE_FLOORS,
  boxes: Object.freeze(houseBoxes()),
});

// The House on the look: every surface a look surface, the zone hues as paint
// and dye tints (living warm neutral, kitchen white and steel, bedroom blue,
// bathroom tile, patio terracotta). Walls and ceilings are warm white plaster.
// Floors: oak boards, glazed tile (kitchen and hallway, bathroom), terracotta
// on the patio. New to the look: the fabric set, and two surfaces with no new
// texture, plaster and glass.
// albedoVar: how much of its set's own albedo a paint lets show (sim-look.js).
function houseSurface(type, look, color, albedoVar) {
  const s = LOOK.surfaces[look];
  return Object.freeze({ type, look, color, roughness: s.roughness, metalness: s.metalness, albedoVar });
}
export const HOUSE_LOOK = Object.freeze({
  surfaces: Object.freeze({
    wall: houseSurface('painted plaster', 'plaster', 0xf2e6d6),
    ceiling: houseSurface('ceiling plaster', 'plaster', 0xf6f3ee),
    floorWood: houseSurface('oak floorboards', 'plywood', 0xc0915f),
    floorTile: houseSurface('glazed floor tile', 'enamel', 0xdcdcd8, 0.5),
    floorBath: houseSurface('bathroom tile', 'enamel', 0x86c6be, 0.5),
    floorPatio: houseSurface('terracotta tile', 'deck', 0xc56a43, 0.7),
    white: houseSurface('white lacquer', 'enamel', 0xf1efea, 0.35),
    steel: houseSurface('brushed steel', 'galvanised', 0xc9cdd2, 0.6),
    wood: houseSurface('oiled oak', 'plywood', 0xa77a4f),
    sofa: houseSurface('linen upholstery', 'fabric', 0xc8b59c),
    bedding: houseSurface('blue linen', 'fabric', 0x4a6dab),
    blue: houseSurface('blue paint', 'enamel', 0x45669b, 0.5),
    terracotta: houseSurface('terracotta paint', 'paintedSteel', 0xb85b37, 0.6),
    black: houseSurface('black gloss', 'enamel', 0x1c1d20, 0.5),
  }),
  // The HDRI fill's balance on every surface here (sim-look.js opts.fill):
  // warmer, and up to light rooms the low key reaches only in patches.
  fill: Object.freeze([1.55, 1.35, 1.12]),
  // The ceilings see the HDRI's dim lower half: their fill is up again, the
  // floors' bounce, and less warm.
  ceilingFill: Object.freeze([2.4, 2.2, 2.0]),
  // Each room's hue: the surface that carries it.
  zones: Object.freeze({ living: 'sofa', kitchen: 'white', bedroom: 'blue', bathroom: 'floorBath', patio: 'floorPatio' }),
  // Floor patterns, metres: boards 18 cm × 1.2 m; tiles 60 cm (kitchen and
  // hallway), 30 cm (bathroom), 40 cm (patio).
  boards: Object.freeze({ width: 0.18, length: 1.2 }),
  tiles: Object.freeze({ floorTile: 0.6, floorBath: 0.3, floorPatio: 0.4 }),
  // The sky past the patio glass: zenith, horizon, ground (linear RGB).
  sky: Object.freeze({ zenith: [0.42, 0.62, 0.95], horizon: [1.25, 1.12, 0.95], ground: [0.22, 0.26, 0.17] }),
});

function buildHouse(THREE, parent, colliders) {
  const P = HOUSE_PLAY, s = HOUSE_WS, R = P.room, L = LAYOUT.house;
  const hx = R.w * s / 2, hz = R.d * s / 2, H = R.h * s, t = L.wall;
  const S = HOUSE_LOOK.surfaces;
  const tileSpec = (m) => ({ minor: m, major: m, minorWidth: 0.004, majorWidth: 0.004, minorDark: 0.4, majorDark: 0.4 });
  // Faces sit a hair behind their edge lines so the lines never z-fight.
  const mats = {};
  for (const [key, f] of Object.entries(S)) {
    const o = { extras: { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, fill: key === 'ceiling' ? HOUSE_LOOK.ceilingFill : HOUSE_LOOK.fill, albedoVar: f.albedoVar };
    if (key === 'floorWood') o.boards = Object.assign({ origin: [-hx, -hz], unit: s }, HOUSE_LOOK.boards);
    if (HOUSE_LOOK.tiles[key]) o.joints = { origin: [-hx, -hz], unit: s, spec: tileSpec(HOUSE_LOOK.tiles[key]) };
    mats[key] = lookMaterial(THREE, f.look, f.color, o);
    mats[key].name = 'house ' + f.type;
  }
  mats.glass = lookGlass(THREE);
  mats.glass.name = 'house glass';
  const tiled = (mesh) => lookBoxUv(mesh, mesh.material.userData.lookTile * s);
  const vis = new THREE.Group();
  vis.name = 'houseArtVisuals';
  parent.add(vis);
  const edges = [];
  const edge = (a, b) => {
    const add = (p, q) => edges.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    for (const y of [a[1], b[1]]) {
      add([a[0], y, a[2]], [b[0], y, a[2]]); add([a[0], y, b[2]], [b[0], y, b[2]]);
      add([a[0], y, a[2]], [a[0], y, b[2]]); add([b[0], y, a[2]], [b[0], y, b[2]]);
    }
    for (const [x, z] of [[a[0], a[2]], [b[0], a[2]], [a[0], b[2]], [b[0], b[2]]]) add([x, a[1], z], [x, b[1], z]);
  };
  for (const r of P.boxes) {
    const a = r.min.map((v) => v * s), b = r.max.map((v) => v * s);
    const mesh = box(THREE, vis, colliders, (a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2,
      b[0] - a[0], b[1] - a[1], b[2] - a[2], mats[r.mat]);
    mesh.name = 'house_' + r.mat;
    if (r.mat === 'glass') {
      // The key comes in through the glass.
      mesh.castShadow = false;
      continue;
    }
    tiled(mesh);
    edge(a, b);
  }
  // The floors share one AO map (floorAo) over the 18 × 12 m.
  const ao = lookAoTexture(THREE, floorAo(P.boxes, R));
  let floor = null;
  for (const f of P.floors) {
    const mesh = lookFloorPatch(THREE, mats[f.mat], R, s, f, ao);
    mesh.name = 'house floor ' + f.mat;
    vis.add(mesh);
    if (!floor) floor = mesh;
  }
  // Shell: inner faces at exactly ±9 × ±6 × 2.7 m. The house's outer walls,
  // the 0.9 m garden wall round the patio (glass above it is the patio's), the
  // ceiling and the patio roof as one slab. Everything casts: the key is a
  // low afternoon sun from the west, and it comes in off the patio only.
  const px = P.patio.x1 * s, gw = P.patio.gardenWall * s;
  const shell = [
    box(THREE, vis, colliders, hx + t / 2, 0, 0, t, H, 2 * hz + 2 * t, mats.wall),
    box(THREE, vis, colliders, (px + hx + t) / 2, 0, -hz - t / 2, hx + t - px, H, t, mats.wall),
    box(THREE, vis, colliders, (px + hx + t) / 2, 0, hz + t / 2, hx + t - px, H, t, mats.wall),
    box(THREE, vis, colliders, (-hx - t + px) / 2, 0, -hz - t / 2, px + hx + t, gw, t, mats.wall),
    box(THREE, vis, colliders, (-hx - t + px) / 2, 0, hz + t / 2, px + hx + t, gw, t, mats.wall),
    box(THREE, vis, colliders, -hx - t / 2, 0, 0, t, gw, 2 * hz, mats.wall),
    box(THREE, vis, colliders, 0, H, 0, 2 * hx + 2 * t, 0.24, 2 * hz + 2 * t, mats.ceiling),
  ];
  for (const m of shell) tiled(m);
  edge([-hx, 0, -hz], [hx, H, hz]);
  // The sky past the glass: a gradient box, unlit, behind everything.
  const sky = new THREE.BoxGeometry(hx * 6, H * 12, hz * 8, 1, 12, 1);
  const pos = sky.getAttribute('position'), col = [];
  const K = HOUSE_LOOK.sky;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + H * 4;
    const u = Math.pow(Math.min(1, Math.max(0, y / (H * 6))), 0.6);
    const c = y < 0 ? K.ground : K.horizon.map((v, k) => v + (K.zenith[k] - v) * u);
    col.push(c[0], c[1], c[2]);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyMesh.position.y = H * 4;
  skyMesh.name = 'houseSky';
  skyMesh.renderOrder = -1;
  skyMesh.userData.artKeep = true;
  skyMesh.material.userData.looksSkip = true;
  vis.add(skyMesh);
  // The edge lines at the look's 60%, bloomed (sim-look.js lookLines).
  const lines = lookLines(THREE, edges);
  lines.name = 'houseEdges';
  lines.userData.artKeep = true;
  vis.add(lines);
  return { floor, orbit: MAP_ORBIT.house };
}

const BUILDERS = {
  rig: buildRig,
  house: buildHouse,
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

// City explore district. Hollow lofts + spin grove near whoop street.
// Stock city blocks stay solid; these sit on the clear axis corridor.
export const CITY_PLAY = Object.freeze({
  whoopClear: 0.85,
  loftA: Object.freeze({
    x: 22, z: 4, w: 10.0, d: 11.0, h: 8.6, wall: 0.28,
    floors: Object.freeze([3.15]),
    door: Object.freeze({ side: 'west', w: 2.10, h: 2.35 }),
    window: Object.freeze({ side: 'east', w: 1.90, h: 1.60, sill: 1.10 }),
    roofHole: Object.freeze({ w: 2.20, d: 2.20 }),
    stair: Object.freeze({ x: 3.15, z: -3.40, w: 1.55, d: 2.80, treads: 7 }),
  }),
  loftB: Object.freeze({
    x: 36, z: 4, w: 10.0, d: 11.0, h: 8.6, wall: 0.28,
    floors: Object.freeze([3.15]),
    door: Object.freeze({ side: 'west', w: 2.10, h: 2.35 }),
    window: Object.freeze({ side: 'east', w: 1.90, h: 1.60, sill: 1.10 }),
    roofHole: Object.freeze({ w: 2.20, d: 2.20 }),
    stair: Object.freeze({ x: 3.15, z: -3.40, w: 1.55, d: 2.80, treads: 7 }),
  }),
  walkup: Object.freeze({
    x: 29, z: -10, w: 11.0, d: 9.0, h: 11.2, wall: 0.28,
    floors: Object.freeze([3.20, 6.40]),
    door: Object.freeze({ side: 'north', w: 2.10, h: 2.35 }),
    window: Object.freeze({ side: 'south', w: 1.90, h: 1.60, sill: 1.10 }),
    roofHole: Object.freeze({ w: 2.10, d: 2.10 }),
    stair: Object.freeze({ x: -3.40, z: 0.10, w: 1.55, d: 3.20, treads: 9 }),
  }),
  spins: Object.freeze([
    Object.freeze({ x: 6.2, z: -8.0, h: 5.8, r: 0.16, kind: 'pole' }),
    Object.freeze({ x: 8.6, z: -6.2, h: 6.4, r: 0.14, kind: 'lamp' }),
    Object.freeze({ x: 4.0, z: -6.4, h: 5.6, r: 0.18, kind: 'tree' }),
    Object.freeze({ x: 8.4, z: -9.8, h: 6.2, r: 0.14, kind: 'pole' }),
    Object.freeze({ x: 3.8, z: -9.6, h: 5.4, r: 0.16, kind: 'lamp' }),
    Object.freeze({ x: 6.0, z: -11.2, h: 6.0, r: 0.15, kind: 'tree' }),
  ]),
});

function playBox(THREE, colliders, x, y, z, w, h, d) {
  const bb = new THREE.Box3(
    new THREE.Vector3(x - w / 2, y, z - d / 2),
    new THREE.Vector3(x + w / 2, y + h, z + d / 2),
  );
  bb._tag = 'map';
  bb._play = 'city-explore';
  colliders.push(bb);
}

function playWallHole(THREE, colliders, ax, alongZ, center, half, height, thick, holeX, holeW, holeH, sill) {
  if (holeW < 0.05 || holeH < 0.05) {
    if (alongZ) playBox(THREE, colliders, ax, 0, center, thick, height, half * 2);
    else playBox(THREE, colliders, center, 0, ax, half * 2, height, thick);
    return;
  }
  const leftW = holeX - holeW / 2 - (center - half);
  const rightW = (center + half) - (holeX + holeW / 2);
  const sillH = sill || 0;
  const lintelH = height - (sillH + holeH);
  if (alongZ) {
    if (leftW > 0.05) playBox(THREE, colliders, ax, 0, center - half + leftW / 2, thick, height, leftW);
    if (rightW > 0.05) playBox(THREE, colliders, ax, 0, center + half - rightW / 2, thick, height, rightW);
    if (sillH > 0.05) playBox(THREE, colliders, ax, 0, holeX, thick, sillH, holeW);
    if (lintelH > 0.05) playBox(THREE, colliders, ax, sillH + holeH, holeX, thick, lintelH, holeW);
  } else {
    if (leftW > 0.05) playBox(THREE, colliders, center - half + leftW / 2, 0, ax, leftW, height, thick);
    if (rightW > 0.05) playBox(THREE, colliders, center + half - rightW / 2, 0, ax, rightW, height, thick);
    if (sillH > 0.05) playBox(THREE, colliders, holeX, 0, ax, holeW, sillH, thick);
    if (lintelH > 0.05) playBox(THREE, colliders, holeX, sillH + holeH, ax, holeW, lintelH, thick);
  }
}

function playSlabHole(THREE, colliders, sx, y, sz, sw, sd, h, hx, hz, holeW, holeD) {
  const slabMinX = sx - sw / 2, slabMaxX = sx + sw / 2;
  const slabMinZ = sz - sd / 2, slabMaxZ = sz + sd / 2;
  const holeMinX = hx - holeW / 2, holeMaxX = hx + holeW / 2;
  const holeMinZ = hz - holeD / 2, holeMaxZ = hz + holeD / 2;
  const leftW = holeMinX - slabMinX;
  const rightW = slabMaxX - holeMaxX;
  if (leftW > 0.08) playBox(THREE, colliders, slabMinX + leftW / 2, y, sz, leftW, h, sd);
  if (rightW > 0.08) playBox(THREE, colliders, slabMaxX - rightW / 2, y, sz, rightW, h, sd);
  const south = holeMinZ - slabMinZ;
  const north = slabMaxZ - holeMaxZ;
  if (south > 0.08) playBox(THREE, colliders, hx, y, slabMinZ + south / 2, holeW, h, south);
  if (north > 0.08) playBox(THREE, colliders, hx, y, slabMaxZ - north / 2, holeW, h, north);
}

function installExploreBuilding(THREE, colliders, b) {
  const t = b.wall, hx = b.w / 2, hz = b.d / 2;
  const westHole = b.door.side === 'west' ? b.door : (b.window.side === 'west' ? b.window : null);
  const eastHole = b.door.side === 'east' ? b.door : (b.window.side === 'east' ? b.window : null);
  const northHole = b.door.side === 'north' ? b.door : (b.window.side === 'north' ? b.window : null);
  const southHole = b.door.side === 'south' ? b.door : (b.window.side === 'south' ? b.window : null);
  playWallHole(THREE, colliders, b.x - hx, true, b.z, hz, b.h, t,
    b.z, westHole ? westHole.w : 0, westHole ? westHole.h : 0, westHole && westHole.sill);
  playWallHole(THREE, colliders, b.x + hx, true, b.z, hz, b.h, t,
    b.z, eastHole ? eastHole.w : 0, eastHole ? eastHole.h : 0, eastHole && eastHole.sill);
  playWallHole(THREE, colliders, b.z + hz, false, b.x, hx, b.h, t,
    b.x, northHole ? northHole.w : 0, northHole ? northHole.h : 0, northHole && northHole.sill);
  playWallHole(THREE, colliders, b.z - hz, false, b.x, hx, b.h, t,
    b.x, southHole ? southHole.w : 0, southHole ? southHole.h : 0, southHole && southHole.sill);
  const st = b.stair;
  for (const fy of b.floors) {
    playSlabHole(THREE, colliders, b.x, fy, b.z, b.w - t, b.d - t, 0.14,
      b.x + st.x, b.z + st.z, st.w + 0.15, st.d + 0.15);
  }
  playSlabHole(THREE, colliders, b.x, b.h - 0.16, b.z, b.w + 0.2, b.d + 0.2, 0.16,
    b.x, b.z, b.roofHole.w, b.roofHole.d);
  const topY = b.floors[b.floors.length - 1] || 3.15;
  const rise = topY / st.treads;
  const stepD = st.d / st.treads;
  for (let i = 0; i < st.treads; i++) {
    playBox(THREE, colliders, b.x + st.x, i * rise, b.z + st.z - st.d / 2 + stepD * (i + 0.5), st.w, rise, stepD + 0.04);
  }
  playBox(THREE, colliders, b.x, 0, b.z + 0.35, b.w * 0.42, 2.20, t);
}

export function installCityExploreColliders(THREE, colliders) {
  if (!THREE || !colliders) return 0;
  if (colliders.some((c) => c && c._play === 'city-explore')) return 0;
  const P = CITY_PLAY;
  installExploreBuilding(THREE, colliders, P.loftA);
  installExploreBuilding(THREE, colliders, P.loftB);
  installExploreBuilding(THREE, colliders, P.walkup);
  for (const s of P.spins) {
    playBox(THREE, colliders, s.x, 0, s.z, s.r * 2, s.h, s.r * 2);
  }
  return colliders.filter((c) => c && c._play === 'city-explore').length;
}
