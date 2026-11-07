// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim M2/W3 — original indoor whoop maps. Procedural boxes + V1 PBR tags.
// CC0 Poly Haven textures already shipped in assets/sim-looks (no new downloads).
// Kenney city kit is not used here so indoor stays cheap on the fps budget.
// W3 adds office, school gym, Tiny Trainer hall, and Your-room (from sim-room.js).
// Nothing here is copied from WebFPV (GPL).

import { planRoom } from './sim-room.js?v=2108fba17d3d';
import {
  LOOK, lookMaterial, lookBoxUv, lookFloor, lookFloorPatch, lookAoTexture, lookGlass, lookLines, lookLooks, lookShafts, lookGraffiti, floorAo,
} from './sim-look.js?v=826bc4bd463d';

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
  // Inner faces at exactly 45 × 30 × 9 m (see buildDepot).
  depot: { w: 157.5, d: 105, h: 31.5, wall: 0.35 },
  // The lot, 36 x 36 m, open sky to 16 m (see buildBando).
  bando: { w: 126, d: 126, h: 56, wall: 0.3 },
};

// The House's one key: a low afternoon sun from the west-north-west, warm.
// Low, it lights a floor at sin 25 deg of its strength, so it is stronger than
// the look's key overhead: its patches on the floor read about three times
// the fill round them, as the Rig's key does.
export const HOUSE_KEY = Object.freeze({ elevation: 25, azimuth: 250, color: 0xffd9a8, intensity: 9 });

// The Warehouse's one key: a low morning sun on the window wall's side (+z),
// a little from -x, warm. It comes in through the clerestories only, and its
// shafts land across the centre run. Its shadow box (world units) is the
// hall's half diagonal and more, and reaches over the roof: three lights any
// floor outside the box as if it had no roof (checked corner to corner).
export const DEPOT_KEY = Object.freeze({ elevation: 26, azimuth: 345, color: 0xffe0b0, intensity: 8.5 });
export const DEPOT_SHADOW = Object.freeze({ viewR: 160, height: 34 });

// The Bando's one key: a pale sun breaking through the overcast, low in the
// south over the courtyard (35°, azimuth 20°), so it comes in at the
// courtyard face's windows and down through the roof's holes; soft
// shadows (shadowIntensity), the overcast filling the rest. Its shadow box
// (world units) covers the lot from over the parapet.
export const BANDO_KEY = Object.freeze({ elevation: 35, azimuth: 20, color: 0xfff0dc, intensity: 4.2 });
export const BANDO_SHADOW = Object.freeze({ viewR: 92, height: 46 });
export const BANDO_SHADOW_INTENSITY = 0.8;

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
  // Round the middle of the hall at 6 m, over the centre run and the second
  // aisle's racking, under the trusses.
  depot: { cx: 0, cy: 7, cz: 10.5, r: 21, h: 21, fov: 68 },
  // Round the Bando from over the lot's wall, 16 m up, looking in at it.
  bando: { cx: 0, cy: 17.5, cz: -10.5, r: 77, h: 56, fov: 62 },
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
  depot: lookLooks({ sun: DEPOT_KEY.intensity }),
  bando: lookLooks({ sun: BANDO_KEY.intensity }),
};

export const MAP_IDS = ['rig', 'house', 'depot', 'bando', 'living', 'garage', 'warehouse', 'backyard', 'office', 'gym', 'trainer', 'room'];

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
// Metres here, scene axes (y up); buildRig scales by RIG_WS. The loop
// (tracks/rig-loop.json) threads the crates, tunnel, pipes and loft,
// clockwise seen from above: the 15 m straight along the -z wall heading +x,
// the crate slots up the +x wall, the tunnel back along the +z wall, a ring in
// open air where the tower stood, then one dive in the plane x = drop: over
// the pipes, down a pipe slit, through the loft hole, out under the loft onto
// the straight. Off the loop, in the room:
// the scaffold tower near the middle (the Coach's tower climb; a loop leg
// through it there would turn tighter than its 1.4 m flow radius) and the
// spin pole, standing alone with 1.5 m clear all round to orbit it. Boxes
// only, axis-aligned, nothing under 6 cm thick and no slot of 4–10 cm
// (sim-core issue #5).
export const RIG_WS = 3.5; // world units per metre, as sim-core-adapter.js WS
const RIG_DROP = -9.05;
// The scaffold tower's centre (it is 1.3 m along x, 2.2 m along z, open on
// its ±x faces) and the spin pole: a 10 cm steel pole, floor to ceiling.
const RIG_TOWER = Object.freeze({ x: -2.9, z: 1.0 });
const RIG_POLE = Object.freeze({ x: 3.0, z: -1.5, d: 0.1 });
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
  // Scaffold tower near the middle of the room, off the loop (the Coach's
  // tower climb): 1.3 × 2.2 m, decks at 1.7 / 3.4 / 5.1 m, ±x faces open,
  // guard rails on the ±z faces.
  const tx0 = RIG_TOWER.x - 0.65, tx1 = RIG_TOWER.x + 0.65, tz0 = RIG_TOWER.z - 1.1, tz1 = RIG_TOWER.z + 1.1, p = 0.08;
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
  // Spin pole: its collider a 10 cm square post, floor to ceiling; drawn round.
  const pr = RIG_POLE.d / 2;
  b('pole', 'pole', RIG_POLE.x - pr, 0, RIG_POLE.z - pr, RIG_POLE.x + pr, 6, RIG_POLE.z + pr);
  return out;
}

export const RIG_PLAY = Object.freeze({
  room: Object.freeze({ w: 20, d: 15, h: 6 }),
  drop: RIG_DROP,
  tower: RIG_TOWER,
  pole: RIG_POLE,
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
    pole: rigSurface('painted steel pole', 'paintedSteel', 0x22b8cf),
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
    pipes: surface('pipes'), loft: surface('loft'), pole: surface('pole'),
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
    if (zone === 'pole') {
      // Round to look at; the collider box() took stays the square post.
      mesh.geometry.dispose();
      mesh.geometry = new THREE.CylinderGeometry((b[0] - a[0]) / 2, (b[0] - a[0]) / 2, b[1] - a[1], 24);
      continue;
    }
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
// counters 0.9, table 0.75, chair backs 0.9, sofa seat 0.45, bed 0.55. The
// clutter (books, a lamp, a fig, a rug, pictures, mugs and fruit, a laundry
// basket, shoes, curtains, towels, a bike) is each a line of its own, off the
// loop and out of the two powerloops. Boxes only, axis-aligned, nothing under
// 6 cm thick and no slot of 4–10 cm (sim-core issue #5), as the Rig.
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
  // Each shelf a second block, 11–16 cm clear of the first: flush to the
  // bay's other upright, or where the next bay's books are flush to that
  // upright's far side, standing 11 cm off it. Lying stacks 8 cm tall under
  // the top board. The gap (the middle bay, 0.9 to 1.68 m) stays empty.
  books.push(
    [0.15, 0.16, -1.45, -1.37, 'terracotta'], [0.15, 0.16, -0.81, -0.71, 'blue'], [0.15, 0.16, -0.16, 0.06, 'white'],
    [0.48, 0.24, -1.46, -1.26, 'black'], [0.48, 0.24, -1.09, -0.95, 'blue'], [0.48, 0.24, -0.43, -0.29, 'terracotta'],
    [0.9, 0.24, -1.86, -1.64, 'blue'], [0.9, 0.24, -0.16, 0.06, 'black'],
    [1.32, 0.24, -1.44, -1.26, 'white'], [1.32, 0.24, -0.54, -0.38, 'terracotta'],
    [1.74, 0.08, -1.86, -1.6, 'blue'], [1.74, 0.08, -1.2, -0.96, 'white'], [1.74, 0.08, -0.2, 0.06, 'terracotta'],
  );
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
  // Clutter, every piece a collider and each a line of its own, clear of the
  // loop and of both powerloops (HOUSE_PLAY.powerloops).
  // Living room. An arc lamp over the coffee table: under its arm, round its
  // pole. Its arm at 1.8 m, under the menu camera's 2 m orbit.
  b('living', 'steel', 'lamp', 'base', 0.45, 0, 3.75, 0.75, 0.06, 4.05);
  b('living', 'steel', 'lamp', 'pole', 0.57, 0, 3.87, 0.63, 1.8, 3.93);
  b('living', 'steel', 'lamp', 'arm', 0.57, 1.74, 3.87, 1.9, 1.8, 3.93);
  b('living', 'sofa', 'lamp', 'shade', 1.62, 1.42, 3.72, 1.98, 1.74, 4.08);
  // A wool rug under the coffee table, 6 cm deep pile; a landing pad.
  b('living', 'rug', 'rug', 'rug', 0.95, 0, 3.3, 2.95, 0.06, 5.25);
  // A fig by the TV wall: round its trunk, under the leaves (65 cm over the pot).
  b('living', 'terracotta', 'plant', 'pot', -0.3, 0, 5.4, 0.1, 0.4, 5.8);
  b('living', 'wood', 'plant', 'trunk', -0.13, 0.4, 5.57, -0.07, 1.05, 5.63);
  b('living', 'leaf', 'plant', 'leaves', -0.45, 1.05, 5.25, 0.25, 1.45, 5.88);
  b('living', 'leaf', 'plant', 'leaves', -0.33, 1.45, 5.36, 0.13, 1.85, 5.84);
  // Pictures, 6 cm canvases in black frames, the canvas standing 1 cm proud:
  // over the armchair, on the street wall, on the entry wall.
  const picture = (axis, face, dir, a0, a1, y0, y1, mat) => {
    const put = (inset, depth, m, part) => {
      const p0 = a0 + inset, p1 = a1 - inset, f1 = face + dir * depth;
      const [lo, hi] = [Math.min(face, f1), Math.max(face, f1)];
      if (axis === 'z') b('living', m, 'pictures', part, p0, y0 + inset, lo, p1, y1 - inset, hi);
      else b('living', m, 'pictures', part, lo, y0 + inset, p0, hi, y1 - inset, p1);
    };
    put(0, 0.06, 'black', 'frame');
    put(0.07, 0.07, mat, 'canvas');
  };
  picture('z', -1.35, 1, -2.2, -1.5, 1.3, 1.8, 'blue');
  picture('z', 6, -1, -2.15, -1.05, 1.15, 1.85, 'terracotta');
  picture('x', -2.45, 1, 0.1, 0.9, 1.2, 1.75, 'bedding');
  // Kitchen: a fruit bowl and three mugs on the island, either side of the
  // line over it; skim between them. Each set into the 6 cm top down to the
  // base, so no 6 cm slot between them and it.
  b('kitchen', 'white', 'island things', 'fruit bowl', 3.75, 0.84, 2.98, 4.05, 1.0, 3.28);
  b('kitchen', 'terracotta', 'island things', 'oranges', 3.8, 0.84, 3.05, 3.96, 1.05, 3.2);
  b('kitchen', 'leaf', 'island things', 'apple', 3.88, 0.84, 3.12, 3.98, 1.07, 3.22);
  b('kitchen', 'white', 'island things', 'mug', 3.6, 0.84, 4.35, 3.68, 1.0, 4.43);
  b('kitchen', 'blue', 'island things', 'mug', 3.82, 0.84, 4.45, 3.9, 1.0, 4.53);
  b('kitchen', 'black', 'island things', 'mug', 4.2, 0.84, 4.3, 4.28, 1.0, 4.38);
  // Back hall. A laundry basket on the bathroom wall, open: 20 cm deep over
  // the washing, 43 × 28 cm inside; dunk it. Its pieces run to the wall.
  b('hall', 'wood', 'laundry basket', 'side', -3.3, 0, -3.75, -3.24, 0.5, -3.35);
  b('hall', 'wood', 'laundry basket', 'side', -2.81, 0, -3.75, -2.75, 0.5, -3.35);
  b('hall', 'wood', 'laundry basket', 'side', -3.24, 0, -3.75, -2.75, 0.5, -3.69);
  b('hall', 'wood', 'laundry basket', 'side', -3.24, 0, -3.41, -2.75, 0.5, -3.35);
  b('hall', 'wood', 'laundry basket', 'bottom', -3.24, 0, -3.69, -2.75, 0.15, -3.41);
  b('hall', 'bedding', 'laundry basket', 'washing', -3.24, 0.15, -3.69, -2.75, 0.3, -3.41);
  // Shoes by the sliding door, toes out from the wall, a pair each: skim them.
  for (const [z, h, mat] of [[-2.85, 0.1, 'black'], [-2.5, 0.1, 'white'], [-2.15, 0.25, 'terracotta']]) {
    for (const dz of [0, 0.1]) b('hall', mat, 'shoes', 'shoe', -5.5, 0, z + dz, -5.22, h, z + dz + 0.1);
  }
  // Linen curtains drawn back either side of the sliding door, on a rod; the
  // open half 90 cm between them and the parked pane.
  b('hall', 'steel', 'curtains', 'rod', -5.5, 2.2, -6, -5.44, 2.26, -2.98);
  b('hall', 'sofa', 'curtains', 'curtain', -5.5, 0, -6, -5.38, 2.2, -5.5);
  b('hall', 'sofa', 'curtains', 'curtain', -5.5, 0, -3.48, -5.38, 2.2, -2.98);
  // Bathroom: towels over the tub's side and its end.
  b('bathroom', 'sofa', 'towels', 'towel', -1.0, 0.36, -3.97, -0.6, 0.66, -3.76);
  b('bathroom', 'bedding', 'towels', 'towel', 0.12, 0.36, -3.65, 0.32, 0.66, -3.3);
  // Patio: a bike against the house wall, its bars on the wall. Behind it,
  // a 32 cm slot under the bars; through its frame, 63 × 42 cm.
  b('patio', 'black', 'bike', 'wheel', -6.08, 0, -2.6, -6.02, 0.66, -1.94);
  b('patio', 'black', 'bike', 'wheel', -6.08, 0, -1.56, -6.02, 0.66, -0.9);
  b('patio', 'blue', 'bike', 'top tube', -6.08, 0.78, -2.1, -6.02, 0.84, -1.35);
  b('patio', 'blue', 'bike', 'down tube', -6.08, 0.3, -2.1, -6.02, 0.36, -1.35);
  b('patio', 'blue', 'bike', 'seat tube', -6.08, 0.3, -2.1, -6.02, 0.95, -2.04);
  b('patio', 'blue', 'bike', 'head tube', -6.08, 0.3, -1.41, -6.02, 1.0, -1.35);
  b('patio', 'black', 'bike', 'saddle', -6.12, 0.95, -2.22, -5.98, 1.01, -1.98);
  b('patio', 'steel', 'bike', 'bars', -6.35, 1.0, -1.41, -5.7, 1.06, -1.35);
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
  return turtleLine(HOUSE_LINE, -4.2, 4.3, ds);
}

// A designed line (HOUSE_LINE, DEPOT_LINE) from its start (x0, z0), heading
// +x, sampled every ds metres.
function turtleLine(ops, x0, z0, ds) {
  const step = ds || 0.01;
  let x = x0, z = z0, hx = 1, hz = 0, s = 0;
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
  for (const op of ops) {
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
    closes: Math.hypot(x - x0, z - z0) + Math.hypot(hx - 1, hz),
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
  // The two powerloops, floor to ceiling, in the plane the loop flies them:
  // through the bookshelf gap and over the shelf's top, under the patio table
  // and over it. Each the gap's width and 30 cm either side, 1.5 m out from
  // each face. Nothing stands in them but the bookshelf and the table.
  powerloops: Object.freeze({
    bookshelf: Object.freeze({ feature: 'bookshelf', min: Object.freeze([-1.5, 0, -0.05]), max: Object.freeze([-0.3, HOUSE_H, 3.3]) }),
    table: Object.freeze({ feature: 'patio table', min: Object.freeze([-8.35, 0, -2.35]), max: Object.freeze([-6.85, HOUSE_H, 1.55]) }),
  }),
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
    leaf: houseSurface('fig leaves', 'paintedSteel', 0x4f7d3a, 0.6),
    rug: houseSurface('wool rug', 'fabric', 0x9a4434),
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

// The Warehouse: a 45 × 30 × 9 m warehouse at micro-class scale, sized for
// the 75 and 85 mm whoops (the 65 flies it too), the third map on the look.
// Its id is depot: the archived map keeps warehouse. Metres here, scene axes
// (y up, +z the window wall, +x the dock); buildDepot scales by DEPOT_WS.
// The Warehouse Loop (tracks/depot-loop.json) runs: the 25 m clear centre run
// east; under the first half-open roll-up door into the dock, round through
// the parted chain curtain, back under the second; under the forklift's
// raised load; through a 60 cm gap in the double rack and west down the aisle
// behind it; between the stacked pallets; up the mezzanine's stair and over
// its deck, climbing; east along the trusses through two of their 60 cm
// gaps; down round the spin pole; back over the mezzanine's edge and down
// through its drop-through hatch; round under the mezzanine onto the centre
// run. Off the Loop, more lines for freestyle, sized for the 85 (depotLines):
// a second aisle south of the centre run with a crossing gap through both
// racks; cable trays over it, 40 cm apart and 40 cm under the trusses; a
// shipping container with both ends' doors open; a scissor lift half raised;
// a cargo net to dive through; a stack of tyres to thread; two more spin
// poles. The tall ones stay out of the sun shafts' way, the low ones under
// them. Boxes only, axis-aligned, nothing under 6 cm thick, no slot of 4–10 cm
// (sim-core issue #5), every box on the floor or at least 15 cm over it, as
// the Rig and the House.
export const DEPOT_WS = 3.5; // world units per metre, as sim-core-adapter.js WS
const DEPOT_H = 9;
// The dock partition (its west face at x, t thick, h tall) and its two
// roll-up doors, half open: openings doorW × doorH, centred on z, the curtain
// rolled down to `open` over the floor.
const DEPOT_DOCK = Object.freeze({ x: 13.5, t: 0.25, h: 6, doors: Object.freeze([1.65, -3.85]), doorW: 3.6, doorH: 4.2, open: 2.1 });
// The chain curtain across the dock at z, hung from a header at y; strands
// every pitch, parted for gap metres round x.
const DEPOT_CURTAIN = Object.freeze({ z: -1.1, y: 3.4, pitch: 0.3, x: 17.5, gap: 1.44 });
// Racking: ten 2.7 m bays from x0. Frames are 1.1 m deep: run A along the
// rack wall, run B two frames back to back over a 30 cm flue. Beam tops at
// 1.8 and 3.6 m and a top tie at 5.27 m. The line goes through bay 7 of run
// B, over its floor loads.
// The second aisle: run C, one frame of seven bays from x0, 4.3 m north of
// run B. The crossing gap is the same 60 cm over the floor loads in bay
// crossBay of run C and of run B, in line: from the centre run across both
// aisles.
const DEPOT_RACK = Object.freeze({
  x0: -17.04, bays: 10, bay: 2.7, post: 0.08, levels: Object.freeze([1.8, 3.6]), tie: 5.27,
  frames: Object.freeze([Object.freeze([-14.8, -13.7]), Object.freeze([-9.4, -8.3]), Object.freeze([-8.0, -6.9])]),
  gapBay: 7,
  runC: Object.freeze([-2.6, -1.5]), baysC: 7, crossBay: 3,
});
// Cable trays under the trusses over the second aisle: three 30 cm trays
// with 40 cm gaps between them, their tops 40 cm under the bottom chords,
// each truss they pass carrying them on a trapeze.
const DEPOT_TRAYS = Object.freeze({ x0: -12.56, x1: 2.56, zs: Object.freeze([-5.6, -4.9, -4.2]), w: 0.3, y0: 6.78, y1: 6.9 });
// The mezzanine: its deck over x0..x1, z0..z1, its top at y, 25 cm thick on
// 30 cm edge beams; the drop-through hatch; the stair up its south edge.
const DEPOT_MEZZ = Object.freeze({
  x0: -22.5, x1: -7.5, z0: 4, z1: 15, y: 3.6,
  hatch: Object.freeze({ x0: -11.0, x1: -8.6, z0: 6.45, z1: 7.85 }),
  stair: Object.freeze({ x0: -19, x1: -18, z0: -2.5, z1: 4, risers: 16 }),
});
// Roof trusses across the hall at each x, chords 12 cm, the open web's posts
// every 66 cm: 60 cm gaps, one centred on z = gapZ (the line's).
const DEPOT_TRUSS = Object.freeze({ xs: Object.freeze([-20, -12.5, -5, 2.5, 10, 17.5]), y0: 7.3, y1: 8.5, chord: 0.12, pitch: 0.66, post: 0.06, gapZ: 12.65 });
// The spin pole: a 10 cm steel pole, floor to roof, the line round it.
const DEPOT_POLE = Object.freeze({ x: -1.75, z: 9.9, d: 0.1 });
// Every spin pole: the Loop's, one past the container, one in the dock.
const DEPOT_POLES = Object.freeze([DEPOT_POLE, Object.freeze({ x: 11.75, z: 7.75, d: 0.1 }), Object.freeze({ x: 19.5, z: 12.5, d: 0.1 })]);
// A 20 ft shipping container (6.06 × 2.44 × 2.59 m) along x, both ends'
// doors swung open 90°, flat out along its sides: fly through it.
const DEPOT_CONTAINER = Object.freeze({ x0: 2.5, x1: 8.56, z0: 9.0, z1: 11.44, h: 2.59, post: 0.15, wall: 0.06, header: 2.2 });
// A scissor lift, half raised, 2.3 m long along z: its chassis to base, two
// scissor stages, the deck on them. Each arm is a run of steps, rising dy
// over dz; dy over 10 cm keeps every step clear of the chassis and deck.
const DEPOT_LIFT = Object.freeze({ x0: 5.0, x1: 6.15, z0: 11.9, z1: 14.2, base: 0.5, stage: 1.025, stages: 2, steps: 10 });
// A cargo net hung flat at y: its west edge from the dock's truss, its east
// edge from the purlins; a 50 cm mesh, a 1 m hole to dive through.
const DEPOT_NET = Object.freeze({ x0: 17.5, x1: 21.5, z0: 4.5, z1: 7.5, y: 4.0, pitch: 0.5, hole: Object.freeze({ x0: 19.0, x1: 20.0, z0: 5.5, z1: 6.5 }) });
// A stack of truck tyres on their treads, three, two and one, 1 m across
// with a 56 cm bore, 30 cm deep along z: thread a bore.
const DEPOT_TYRES = Object.freeze({ x0: 15.4, z0: -7.3, z1: -7.0, d: 1.0, bore: 0.56, rows: 3 });
// Clerestory windows in the window wall, between its columns: x0..x1, y0..y1.
// A shaft is drawn over the part of a window (shaft: true, or x0..x1) whose
// light falls clear to the floor; where it would pass through the mezzanine,
// the dock partition or the dock's wall, the light lands as a patch only.
const DEPOT_WINDOWS = Object.freeze([[-19.25, -13.25], [-11.75, -5.75, [-8.15, -5.75]], [-4.25, 1.75, true], [3.25, 9.25, true], [10.75, 16.75, [13.8, 16.75]], [18.25, 21.75]]
  .map(([x0, x1, shaft]) => Object.freeze({ x0, x1, y0: 6.0, y1: 7.2, shaft: shaft || false })));
// Every pallet sits on a multiple of this: the pallet shader draws its boards
// from the height alone.
const PALLET = 0.15;

function depotBoxes() {
  const out = [];
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const b = (zone, mat, feature, part, x0, y0, z0, x1, y1, z1) => {
    out.push(Object.freeze({ zone, mat, feature, part, min: [r(x0), r(y0), r(z0)], max: [r(x1), r(y1), r(z1)] }));
  };
  // A pallet and its carton load, one footprint; a stack of empty pallets.
  const load = (zone, x0, z0, x1, z1, y, top) => {
    b(zone, 'pallet', 'pallets', 'pallet', x0, y, z0, x1, y + PALLET, z1);
    if (top > y + PALLET) b(zone, 'carton', 'cartons', 'carton', x0, y + PALLET, z0, x1, top, z1);
  };
  const stack = (zone, feature, x0, z0, x1, z1, n) => {
    for (let i = 0; i < n; i++) b(zone, 'pallet', feature, 'pallet', x0, i * PALLET, z0, x1, (i + 1) * PALLET, z1);
  };
  // The dock partition: block to 2.4 m, cladding over; the doors' openings,
  // the curtains rolled down to half, the drums over them, the guides.
  const D = DEPOT_DOCK, dx0 = D.x, dx1 = D.x + D.t, hw = D.doorW / 2;
  const pier = (z0, z1, y0) => {
    if (y0 < 2.4) b('dock', 'block', 'partition', 'wall', dx0, y0, z0, dx1, 2.4, z1);
    b('dock', 'cladding', 'partition', y0 < 2.4 ? 'cladding' : 'lintel', dx0, Math.max(y0, 2.4), z0, dx1, D.h, z1);
  };
  const doors = D.doors.slice().sort((p, q) => p - q);
  let at = -15;
  for (const z of doors) {
    pier(at, z - hw, 0);
    pier(z - hw, z + hw, D.doorH);
    b('dock', 'door', 'roll-up doors', 'curtain', dx0, D.open, z - hw, dx0 + 0.06, D.doorH, z + hw);
    b('dock', 'steel', 'roll-up doors', 'drum', dx0 - 0.4, D.doorH, z - hw - 0.12, dx0, D.doorH + 0.45, z + hw + 0.12);
    for (const g of [z - hw - 0.12, z + hw]) b('dock', 'steel', 'roll-up doors', 'guide', dx0 - 0.12, 0, g, dx0, D.doorH, g + 0.12);
    at = z + hw;
  }
  pier(at, 15, 0);
  // The chain curtain: a header the dock's width, strands down to 20 cm over
  // the floor, parted where the line goes through.
  const C = DEPOT_CURTAIN;
  b('dock', 'steel', 'chain curtain', 'header', dx1, C.y, C.z - 0.06, 22.5, C.y + 0.15, C.z + 0.06);
  for (let x = dx1 + 0.2; x < 22.5 - 0.15; x += C.pitch) {
    if (Math.abs(x - C.x) < C.gap / 2 + 0.03) continue;
    b('dock', 'steel', 'chain curtain', 'chain', x - 0.03, 0.2, C.z - 0.03, x + 0.03, C.y, C.z + 0.03);
  }
  // Two docks on the outside wall, either side of the curtain: the dock door
  // shut, its seal, the leveller plate in front.
  for (const z of [-7.0, 5.0]) {
    b('dock', 'door', 'docks', 'dock door', 22.44, 0, z - 1.5, 22.5, 3.2, z + 1.5);
    b('dock', 'dark', 'docks', 'seal', 22.3, 3.2, z - 1.7, 22.5, 3.5, z + 1.7);
    for (const s of [z - 1.7, z + 1.5]) b('dock', 'dark', 'docks', 'seal', 22.3, 0, s, 22.5, 3.2, s + 0.2);
    b('dock', 'steel', 'docks', 'leveller', 20.3, 0, z - 1.0, 22.5, 0.06, z + 1.0);
    b('dock', 'amber', 'docks', 'leveller lip', 20.2, 0, z - 1.0, 20.3, 0.06, z + 1.0);
  }
  // Staged loads waiting at the docks, clear of the line.
  for (const [x, z, n] of [[19.0, 8.5, 1], [19.0, 10.2, 1], [16.6, 8.5, 1], [19.0, -10.5, 1], [16.6, -10.5, 1], [19.0, -12.2, 1]]) {
    load('dock', x - 0.5, z - 0.55, x + 0.5, z + 0.55, 0, 1.2 + 0.08 * n);
  }
  stack('dock', 'pallet stacks', 15.4, 12.6, 16.6, 13.6, 7);
  // Racking. Each frame: two posts at each upright, braces between them; on
  // each bay its beams at both faces; two pallet places a level, filled from
  // a fixed pattern, cartons leaving 40–60 cm under the beam over them. Runs
  // A and B, then run C.
  const K = DEPOT_RACK, xs = Array.from({ length: K.bays + 1 }, (_, k) => K.x0 + K.bay * k);
  const tops = [[1.2, 1.12], [2.95, 2.88], [4.75, 4.68]];
  K.frames.map((z) => [z, K.bays]).concat([[K.runC, K.baysC]]).forEach(([[z0, z1], bays], f) => {
    for (const x of xs.slice(0, bays + 1)) {
      for (const z of [z0, z1 - K.post]) b('racking', 'upright', 'racking', 'upright', x, 0, z, x + K.post, K.tie, z + K.post);
      for (const y of [0.3, 4.9]) b('racking', 'upright', 'racking', 'brace', x, y, z0 + K.post, x + K.post, y + 0.06, z1 - K.post);
    }
    for (let k = 0; k < bays; k++) {
      // Beams run onto both uprights, so a run's beams meet end to end.
      const bx0 = xs[k] + K.post, bx1 = xs[k + 1];
      for (const top of [...K.levels, K.tie]) {
        for (const z of [z0, z1 - 0.06]) b('racking', 'amber', 'racking', top === K.tie ? 'tie' : 'beam', xs[k], top - 0.12, z, bx1 + K.post, top, z + 0.06);
      }
      // The Loop's gap through run B; the crossing gap through runs B and C.
      const gap = f > 0 && (k === K.gapBay || k === K.crossBay);
      [0, ...K.levels].forEach((y, l) => {
        for (const [p, px] of [[0, bx0 + 0.2], [1, bx0 + 1.42]]) {
          const n = (f * 7 + k * 5 + l * 3 + p * 11) % 9;
          if (!gap && n === 0) continue;
          const top = gap && l === 0 ? 1.08 : tops[l][(k + p + f) % 2];
          load('racking', px, z0, px + 1.0, z1, y, top);
        }
      });
    }
  });
  // Run B's flue: spacers tying its two frames at each upright.
  for (const x of xs) for (const y of [1.2, 3.0]) b('racking', 'upright', 'racking', 'spacer', x, y, -8.3, x + K.post, y + 0.06, -8.0);
  // The forklift, in the aisle in front of run B, facing it, its load raised
  // over the line: under the forks.
  const fx = 9.0;
  b('forklift', 'green', 'forklift', 'body', fx - 0.5, 0.15, -3.0, fx + 0.5, 1.0, -0.95);
  b('forklift', 'green', 'forklift', 'counterweight', fx - 0.5, 1.0, -1.3, fx + 0.5, 1.2, -0.95);
  for (const z of [-3.05, -1.6]) for (const x of [fx - 0.55, fx + 0.3]) b('forklift', 'dark', 'forklift', 'wheel', x, 0, z, x + 0.25, 0.45, z + 0.45);
  b('forklift', 'dark', 'forklift', 'seat', fx - 0.25, 1.0, -1.9, fx + 0.25, 1.15, -1.45);
  b('forklift', 'dark', 'forklift', 'seat back', fx - 0.25, 1.15, -1.5, fx + 0.25, 1.55, -1.42);
  for (const x of [fx - 0.5, fx + 0.44]) for (const z of [-2.7, -1.36]) b('forklift', 'dark', 'forklift', 'guard post', x, 1.0, z, x + 0.06, 2.1, z + 0.06);
  b('forklift', 'dark', 'forklift', 'guard', fx - 0.5, 2.1, -2.7, fx + 0.5, 2.16, -1.3);
  for (const x of [fx - 0.45, fx + 0.33]) {
    b('forklift', 'dark', 'forklift', 'mast', x, 0, -3.38, x + 0.12, 2.25, -3.2);
    b('forklift', 'dark', 'forklift', 'mast', x + 0.02, 2.25, -3.38, x + 0.1, 3.3, -3.2);
  }
  b('forklift', 'dark', 'forklift', 'mast tie', fx - 0.45, 3.3, -3.38, fx + 0.45, 3.38, -3.2);
  b('forklift', 'dark', 'forklift', 'mast mount', fx - 0.45, 0.15, -3.2, fx + 0.45, 1.0, -3.0);
  b('forklift', 'dark', 'forklift', 'carriage', fx - 0.45, 2.04, -3.38, fx + 0.45, 2.6, -3.2);
  for (const x of [fx - 0.35, fx + 0.23]) b('forklift', 'dark', 'forklift', 'fork', x, 2.04, -4.5, x + 0.12, 2.1, -3.38);
  load('forklift', fx - 0.6, -4.38, fx + 0.6, -3.38, 2.1, 3.05);
  // Stacked pallets either side of the line north of the racking's end.
  stack('racking', 'pallet stacks', -20.3, -6.0, -19.1, -5.0, 12);
  stack('racking', 'pallet stacks', -17.9, -6.0, -16.7, -5.0, 10);
  stack('racking', 'pallet stacks', -21.5, -2.6, -20.3, -1.6, 4);
  // The mezzanine: its deck round the hatch, edge beams, columns, guard rails
  // with openings at the stair head and where the line comes in, rails either
  // side of the hatch.
  const M = DEPOT_MEZZ, H = M.hatch, dy = M.y - 0.25;
  b('mezzanine', 'steel', 'mezzanine', 'deck', M.x0, dy, M.z0, H.x0, M.y, M.z1);
  b('mezzanine', 'steel', 'mezzanine', 'deck', H.x1, dy, M.z0, M.x1, M.y, M.z1);
  b('mezzanine', 'steel', 'mezzanine', 'deck', H.x0, dy, M.z0, H.x1, M.y, H.z0);
  b('mezzanine', 'steel', 'mezzanine', 'deck', H.x0, dy, H.z1, H.x1, M.y, M.z1);
  b('mezzanine', 'dark', 'mezzanine', 'edge beam', M.x0, dy - 0.3, M.z0, M.x1, dy, M.z0 + 0.2);
  b('mezzanine', 'dark', 'mezzanine', 'edge beam', M.x1 - 0.2, dy - 0.3, M.z0 + 0.2, M.x1, dy, M.z1);
  for (const z of [H.z0 - 0.2, H.z1]) b('mezzanine', 'dark', 'mezzanine', 'hatch trimmer', H.x0, dy - 0.3, z, H.x1, dy, z + 0.2);
  for (const [x, z] of [[-22.5, M.z0], [-16.6, M.z0], [-10.6, M.z0], [M.x1 - 0.2, M.z0], [M.x1 - 0.2, 9.5], [M.x1 - 0.2, M.z1 - 0.2]]) {
    b('mezzanine', 'dark', 'mezzanine', 'column', x, 0, z, x + 0.2, dy - 0.3, z + 0.2);
  }
  const rail = (axis, c, a0, a1) => {
    const n = Math.max(1, Math.round((a1 - a0) / 1.5));
    const put = (p0, p1, y0, y1, part) => (axis === 'x'
      ? b('mezzanine', 'amber', 'guard rails', part, p0, y0, c, p1, y1, c + 0.06)
      : b('mezzanine', 'amber', 'guard rails', part, c, y0, p0, c + 0.06, y1, p1));
    for (let i = 0; i <= n; i++) {
      const p = a0 + (a1 - a0 - 0.06) * i / n;
      put(p, p + 0.06, M.y + 0.15, M.y + 1.04, 'post');
    }
    put(a0, a1, M.y + 1.04, M.y + 1.1, 'top rail');
    put(a0, a1, M.y + 0.52, M.y + 0.58, 'mid rail');
    put(a0, a1, M.y, M.y + 0.15, 'toe board');
  };
  const S = M.stair;
  rail('x', M.z0, M.x0, S.x0 - 0.2);
  rail('x', M.z0, S.x1 + 0.2, M.x1 - 0.06);
  rail('z', M.x1 - 0.06, M.z0 + 0.06, 6.15);
  rail('z', M.x1 - 0.06, 8.15, M.z1);
  rail('x', H.z0 - 0.06, H.x0, H.x1);
  rail('x', H.z1, H.x0, H.x1);
  // On the deck: the shift office in the far corner, cartons on pallets.
  b('mezzanine', 'block', 'mezzanine', 'office', M.x0, M.y, 10.5, -20.0, 6.1, M.z1);
  for (const [x, z] of [[-14.6, 13.4], [-13.2, 13.4], [-21.5, 5.4]]) load('mezzanine', x - 0.5, z - 0.55, x + 0.5, z + 0.55, M.y, M.y + 1.1);
  // The stair: steel treads between stepped stringers, the top one at the
  // deck. The line flies up it.
  const go = (S.z1 - S.z0) / S.risers, rise = M.y / S.risers;
  for (let k = 1; k <= S.risers; k++) {
    const z0 = S.z0 + go * (k - 1), z1 = z0 + go, y = rise * k;
    b('mezzanine', 'dark', 'stair', 'tread', S.x0 + 0.06, y - 0.06, z0, S.x1 - 0.06, y, z1);
    for (const x of [S.x0, S.x1 - 0.06]) b('mezzanine', 'amber', 'stair', 'stringer', x, y - 0.35 < 0.15 ? 0 : y - 0.35, z0, x + 0.06, y, z1);
  }
  // Roof trusses: two chords, posts every 66 cm; purlins on them; columns
  // carrying them on the window wall.
  const T = DEPOT_TRUSS;
  for (const x of T.xs) {
    for (const [y0, y1, part] of [[T.y0, T.y0 + T.chord, 'bottom chord'], [T.y1 - T.chord, T.y1, 'top chord']]) {
      b('trusses', 'steel', 'trusses', part, x - 0.06, y0, -15, x + 0.06, y1, 15);
    }
    const first = T.gapZ - T.pitch / 2 - T.pitch * Math.floor((T.gapZ + 15 - 0.2) / T.pitch);
    for (let z = first; z + T.post / 2 < 15 - 0.2; z += T.pitch) {
      b('trusses', 'steel', 'trusses', 'post', x - 0.06, T.y0 + T.chord, z - T.post / 2, x + 0.06, T.y1 - T.chord, z + T.post / 2);
    }
    b('trusses', 'dark', 'columns', 'column', x - 0.15, 0, 14.7, x + 0.15, T.y0, 15);
  }
  // Over a spin pole the purlin stops on the trusses either side of it (or
  // on the last truss, past it), so the pole stands 1.5 m clear all the way
  // to the roof.
  for (let z = -13.5; z < 14; z += 3) {
    let runs = [[-22.5, 22.5]];
    for (const p of DEPOT_POLES.filter((q) => Math.abs(z - q.z) < 1.7)) {
      const tw = Math.max(...T.xs.filter((x) => x < p.x)), te = Math.min(...T.xs.filter((x) => x > p.x));
      runs = runs.flatMap(([x0, x1]) => [[x0, Math.min(x1, tw + 0.06)], [Math.max(x0, te - 0.06), x1]]).filter(([x0, x1]) => x1 - x0 > 0.06);
    }
    for (const [x0, x1] of runs) b('trusses', 'steel', 'purlins', 'purlin', x0, T.y1, z - 0.06, x1, T.y1 + 0.2, z + 0.06);
  }
  // The cable trays: each one piece from the truss at x -12.5 to the one at
  // 2.5, over the second aisle's east 15 m; under them at each truss a
  // trapeze, its bar and two rods up to the bottom chord.
  const Y = DEPOT_TRAYS, yz0 = Y.zs[0] - 0.06, yz1 = Y.zs[Y.zs.length - 1] + Y.w + 0.06;
  for (const z of Y.zs) b('racking', 'steel', 'cable trays', 'tray', Y.x0, Y.y0, z, Y.x1, Y.y1, z + Y.w);
  for (const x of T.xs.filter((q) => q > Y.x0 && q < Y.x1)) {
    b('racking', 'dark', 'cable trays', 'trapeze', x - 0.03, Y.y0 - 0.06, yz0, x + 0.03, Y.y0, yz1);
    for (const z of [yz0, yz1 - 0.06]) b('racking', 'dark', 'cable trays', 'rod', x - 0.03, Y.y0, z, x + 0.03, T.y0, z + 0.06);
  }
  // The spin poles: each collider a 10 cm square post, floor to roof; drawn round.
  for (const p of DEPOT_POLES) {
    const pr = p.d / 2;
    b('pole', 'pole', 'pole', 'pole', p.x - pr, 0, p.z - pr, p.x + pr, DEPOT_H, p.z + pr);
  }
  // The container: its base, corner posts, corrugated sides and roof, a
  // header over each end's opening, and the four doors swung open.
  const CT = DEPOT_CONTAINER, cp = CT.post, cw = CT.wall, ct = CT.h - 0.15;
  b('container', 'dark', 'container', 'base', CT.x0, 0, CT.z0, CT.x1, 0.15, CT.z1);
  for (const x of [CT.x0, CT.x1 - cp]) {
    for (const z of [CT.z0, CT.z1 - cp]) b('container', 'dark', 'container', 'corner post', x, 0.15, z, x + cp, ct, z + cp);
    b('container', 'dark', 'container', 'header', x, CT.header, CT.z0 + cw, x + cp, ct, CT.z1 - cw);
  }
  for (const z of [CT.z0, CT.z1 - cw]) b('container', 'door', 'container', 'side', CT.x0 + cp, 0.15, z, CT.x1 - cp, ct, z + cw);
  b('container', 'door', 'container', 'roof', CT.x0, ct, CT.z0, CT.x1, CT.h, CT.z1);
  const leaf = (CT.z1 - CT.z0 - 2 * cp) / 2;
  for (const [x0, x1] of [[CT.x0 - leaf, CT.x0], [CT.x1, CT.x1 + leaf]]) {
    for (const z of [CT.z0, CT.z1 - cw]) b('container', 'door', 'container', 'door', x0, 0.15, z, x1, CT.header, z + cw);
  }
  // The scissor lift: wheels, chassis; on each side an outer and an inner
  // arm plane 12 cm apart, the outer arms rising toward +z and the inner
  // toward -z, stage over stage; the deck on the top steps, its rails.
  const F = DEPOT_LIFT, za = F.z0 + 0.1, zb = F.z1 - 0.1, fz = (zb - za) / F.steps, fy = F.stage / F.steps, hb = 0.14;
  for (const x of [F.x0, F.x1 - 0.12]) for (const z of [F.z0 + 0.1, F.z1 - 0.4]) b('lift', 'dark', 'scissor lift', 'wheel', x, 0, z, x + 0.12, 0.3, z + 0.3);
  b('lift', 'amber', 'scissor lift', 'chassis', F.x0, 0.15, F.z0, F.x1, F.base, F.z1);
  for (const [px, up] of [[F.x0, true], [F.x0 + 0.18, false], [F.x1 - 0.24, false], [F.x1 - 0.06, true]]) {
    for (let s = 0; s < F.stages; s++) {
      for (let i = 0; i < F.steps; i++) {
        const z0 = up ? za + fz * i : zb - fz * (i + 1), y0 = F.base + F.stage * s + fy * i;
        b('lift', 'amber', 'scissor lift', 'arm', px, y0, z0, px + 0.06, y0 + hb, z0 + fz);
      }
    }
  }
  const deck = F.base + F.stage * (F.stages - 1) + fy * (F.steps - 1) + hb, dt = deck + 0.15;
  b('lift', 'steel', 'scissor lift', 'deck', F.x0, deck, F.z0, F.x1, dt, F.z1);
  for (const x of [F.x0, F.x1 - 0.06]) {
    for (const z of [F.z0, (F.z0 + F.z1) / 2 - 0.03, F.z1 - 0.06]) b('lift', 'amber', 'scissor lift', 'rail post', x, dt, z, x + 0.06, dt + 1.1, z + 0.06);
    for (const y of [dt + 0.52, dt + 1.04]) b('lift', 'amber', 'scissor lift', 'rail', x, y, F.z0, x + 0.06, y + 0.06, F.z1);
  }
  for (const z of [F.z0, F.z1 - 0.06]) for (const y of [dt + 0.52, dt + 1.04]) b('lift', 'amber', 'scissor lift', 'rail', F.x0 + 0.06, y, z, F.x1 - 0.06, y + 0.06, z + 0.06);
  // The cargo net: ropes along x and z every pitch, the two through the hole
  // stopping at its edges; hangers up to the truss and the purlins.
  const N = DEPOT_NET, NH = N.hole, rr = 0.03;
  const nx = Math.round((N.x1 - N.x0) / N.pitch), nz = Math.round((N.z1 - N.z0) / N.pitch);
  for (let k = 0; k <= nz; k++) {
    const z = N.z0 + N.pitch * k, cut = z > NH.z0 + 1e-6 && z < NH.z1 - 1e-6;
    for (const [x0, x1] of cut ? [[N.x0 - rr, NH.x0 + rr], [NH.x1 - rr, N.x1 + rr]] : [[N.x0 - rr, N.x1 + rr]]) b('dock', 'amber', 'cargo net', 'rope', x0, N.y, z - rr, x1, N.y + 0.06, z + rr);
  }
  for (let k = 0; k <= nx; k++) {
    const x = N.x0 + N.pitch * k, cut = x > NH.x0 + 1e-6 && x < NH.x1 - 1e-6;
    for (const [z0, z1] of cut ? [[N.z0 - rr, NH.z0 + rr], [NH.z1 - rr, N.z1 + rr]] : [[N.z0 - rr, N.z1 + rr]]) b('dock', 'amber', 'cargo net', 'rope', x - rr, N.y, z0, x + rr, N.y + 0.06, z1);
  }
  for (const z of [N.z0, N.z1]) {
    b('dock', 'amber', 'cargo net', 'hanger', N.x0 - rr, N.y + 0.06, z - rr, N.x0 + rr, T.y0, z + rr);
    b('dock', 'amber', 'cargo net', 'hanger', N.x1 - rr, N.y + 0.06, z - rr, N.x1 + rr, T.y1, z + rr);
  }
  // The tyres, each a ring of four pieces round its bore, each piece only
  // just past the bore's width so the ring's corners are cut and it reads
  // round; chocks at the ends.
  const W = DEPOT_TYRES, wr = W.d / 2, wi = W.bore / 2, wc = wi + 0.02;
  for (let row = 0; row < W.rows; row++) {
    for (let k = 0; k < W.rows - row; k++) {
      const cx = W.x0 + wr * (row + 1) + W.d * k, cy = wr + W.d * row;
      b('dock', 'dark', 'tyres', 'tyre', cx - wc, cy - wr, W.z0, cx + wc, cy - wi, W.z1);
      b('dock', 'dark', 'tyres', 'tyre', cx - wc, cy + wi, W.z0, cx + wc, cy + wr, W.z1);
      for (const [x0, x1] of [[cx - wr, cx - wi], [cx + wi, cx + wr]]) b('dock', 'dark', 'tyres', 'tyre', x0, cy - wc, W.z0, x1, cy + wc, W.z1);
    }
  }
  for (const x of [W.x0 - 0.15, W.x0 + W.d * W.rows]) b('dock', 'amber', 'tyres', 'chock', x, 0, W.z0, x + 0.15, 0.3, W.z1);
  return out;
}

// The Warehouse Loop's line, metres, as HOUSE_LINE: from the start pad on the
// centre run heading +x. tracks/depot-loop.json is its gates
// (tools/build_depot_loop.mjs).
const DEPOT_LINE = Object.freeze([
  ['H', 1.3], ['L', 2.5], ['G', 0.5, 'centre run'], ['L', 9.85], ['G', 0.5, 'centre run'], ['L', 6.5], ['G', 0.5, 'centre run'],
  ['H', 1.3], ['L', 7.125], ['G', 0.6, 'roll-up door'], ['H', 1.1], ['L', 1.125],
  ['A', 2.75, 90], ['G', 0.45, 'chain curtain'], ['H', 1.3], ['A', 2.75, 90],
  ['L', 1.125], ['G', 0.6, 'roll-up door'], ['H', 1.1], ['L', 4.625], ['G', 0.35, 'under the forks'], ['H', 1.25], ['L', 3.0],
  ['A', 2.75, -90], ['L', 1.55], ['G', 0.28, 'rack gap'], ['H', 1.38], ['L', 1.55],
  ['A', 2.75, 90], ['H', 1.3], ['L', 2.5], ['G', 0.45, 'down the aisle'], ['L', 13.75],
  ['A', 2.75, 90], ['G', 0.45, 'end of the aisle'], ['L', 4.2], ['G', 0.5, 'pallet stacks'], ['H', 1.3], ['L', 1.5], ['H', 1.4],
  ['L', 3.5], ['G', 0.45, 'up the stair'], ['L', 4.75], ['G', 0.45, 'over the mezzanine'], ['H', 5.0], ['L', 5.65], ['H', 7.4],
  ['A', 2.75, 90], ['H', 7.9], ['L', 3.25], ['G', 0.28, 'truss'], ['L', 7.5], ['G', 0.28, 'truss'], ['L', 3.25], ['H', 7.9],
  ['A', 2.75, 90], ['G', 0.45, 'round the pole'], ['A', 2.75, 90], ['H', 5.6],
  ['L', 5.75], ['G', 0.45, 'over the rail'], ['H', 4.5], ['L', 3.1], ['G', 0.4, 'the hatch'], ['H', 3.05], ['L', 1.75],
  ['A', 2.75, -90], ['G', 0.45, 'under the mezzanine'], ['H', 1.9], ['A', 2.75, -90],
]);

export function depotLine(ds) {
  return turtleLine(DEPOT_LINE, -12.35, 1.65, ds);
}

// The new obstacles' own lines, off the Loop, for freestyle: each a short
// pass, metres, that an 85 mm whoop flies clear (tools/test_sim_depot.mjs).
function depotLines() {
  const K = DEPOT_RACK, Y = DEPOT_TRAYS, CT = DEPOT_CONTAINER, F = DEPOT_LIFT, N = DEPOT_NET, W = DEPOT_TYRES;
  const crossX = K.x0 + K.bay * K.crossBay + (K.post + K.bay) / 2;
  const trayGap = Y.zs[2] - 0.2, hx = (N.hole.x0 + N.hole.x1) / 2, hz = (N.hole.z0 + N.hole.z1) / 2;
  const round = (p) => Array.from({ length: 49 }, (_, i) => [p.x + 1.2 * Math.cos(i * Math.PI / 24), 1.5, p.z + 1.2 * Math.sin(i * Math.PI / 24)]);
  return [
    // From the centre run south through run C, the second aisle, run B.
    { name: 'crossing gap', feature: 'racking', pts: [[crossX, 1.38, 0], [crossX, 1.38, -11.5]] },
    // Down between two trays; along over one, under a truss's bottom chord.
    { name: 'between the trays', feature: 'cable trays', pts: [[-4.5, 7.4, trayGap], [-1.5, 5.4, trayGap]] },
    { name: 'under the truss', feature: 'cable trays', pts: [[-7, 7.1, Y.zs[1] + Y.w / 2], [-3, 7.1, Y.zs[1] + Y.w / 2]] },
    { name: 'through the container', feature: 'container', pts: [[CT.x0 - 2, 1.2, (CT.z0 + CT.z1) / 2], [CT.x1 + 2, 1.2, (CT.z0 + CT.z1) / 2]] },
    // Across the lift through the diamond between its two stages.
    { name: 'through the scissors', feature: 'scissor lift', pts: [[F.x0 - 1.5, F.base + F.stage, (F.z0 + F.z1) / 2], [F.x1 + 1.5, F.base + F.stage, (F.z0 + F.z1) / 2]] },
    { name: 'dive the net', feature: 'cargo net', pts: [[hx, N.y + 2, hz + 2], [hx, N.y - 2, hz - 2]] },
    // North to south through the bore of the second row's first tyre.
    { name: 'thread the tyres', feature: 'tyres', pts: [[W.x0 + W.d, W.d * 1.5, W.z1 + 2.4], [W.x0 + W.d, W.d * 1.5, W.z0 - 2.2]] },
    { name: 'round the second pole', feature: 'pole', pts: round(DEPOT_POLES[1]) },
    { name: 'round the third pole', feature: 'pole', pts: round(DEPOT_POLES[2]) },
  ];
}

export const DEPOT_PLAY = Object.freeze({
  room: Object.freeze({ w: 45, d: 30, h: DEPOT_H }),
  // The start pad, on the floor at the head of the centre run, nose down it (+x).
  start: Object.freeze([-12.35, 0.35, 1.65]),
  dock: DEPOT_DOCK,
  curtain: DEPOT_CURTAIN,
  rack: DEPOT_RACK,
  mezzanine: DEPOT_MEZZ,
  trusses: DEPOT_TRUSS,
  pole: DEPOT_POLE,
  poles: DEPOT_POLES,
  trays: DEPOT_TRAYS,
  container: DEPOT_CONTAINER,
  lift: DEPOT_LIFT,
  net: DEPOT_NET,
  tyres: DEPOT_TYRES,
  windows: DEPOT_WINDOWS,
  pallet: PALLET,
  // The centre run: x0 to x1 (the first roll-up door's drum) along z, clear
  // w either side from the floor to the trusses.
  run: Object.freeze({ x0: -12.35, x1: 13, z: 1.65, w: 2 }),
  boxes: Object.freeze(depotBoxes()),
  lines: Object.freeze(depotLines()),
});

// The Warehouse on the look: every surface a look surface. The hall itself is
// neutral: sealed concrete, painted block to 2.4 m with corrugated steel over
// it, the roof deck, galvanised trusses and decking. The zone hues are
// paint: racking blue, its beams and the mezzanine's rails and stair safety
// amber, the forklift green, the dock's doors blue-violet, the spin pole the
// Rig's teal. Sixteen draws in all, so a frame with every gate in view stays
// under 60.
// New to the look, and no new texture: corrugated steel (the galvanised set,
// its ribs drawn by the shader) and pallet wood (the plywood set, its boards
// drawn by the shader).
function depotSurface(type, look, color, albedoVar) {
  const s = LOOK.surfaces[look];
  return Object.freeze({ type, look, color, roughness: s.roughness, metalness: s.metalness, albedoVar });
}
export const DEPOT_LOOK = Object.freeze({
  surfaces: Object.freeze({
    floor: depotSurface('sealed concrete', 'concrete', 0xe6e3dd),
    block: depotSurface('painted block', 'paintedBlock', 0xd9dcdf),
    cladding: depotSurface('corrugated steel', 'galvanised', 0xc8cdd3),
    roof: depotSurface('roof deck', 'deck', 0x9ca1a8),
    steel: depotSurface('galvanised steel', 'galvanised', 0xb9bfc6, 0.6),
    dark: depotSurface('painted steel', 'paintedSteel', 0x3c4148, 0.6),
    upright: depotSurface('blue rack upright', 'paintedSteel', 0x2f6fc4, 0.5),
    amber: depotSurface('safety amber', 'enamel', 0xf2a91c, 0.5),
    pallet: depotSurface('pallet wood', 'plywood', 0xd9bb8c),
    carton: depotSurface('kraft carton', 'plywood', 0xb48654, 0.45),
    green: depotSurface('forklift green', 'enamel', 0x5a9a2a, 0.5),
    door: depotSurface('painted roll-up door', 'paintedSteel', 0x4a4fb0, 0.5),
    pole: depotSurface('painted steel pole', 'paintedSteel', 0x22b8cf),
  }),
  // The HDRI fill's balance on every surface here (sim-look.js opts.fill):
  // the big hall a little cooler than the sun; the roof sees the HDRI's dim
  // lower half, so its fill is up, the floor's bounce.
  fill: Object.freeze([1.35, 1.38, 1.45]),
  roofFill: Object.freeze([2.1, 2.1, 2.2]),
  // Each zone's hue: the surface that carries it.
  zones: Object.freeze({ racking: 'upright', mezzanine: 'amber', forklift: 'green', dock: 'door', pole: 'pole' }),
  // The new surfaces' patterns (sim-look.js LOOK.ribs, LOOK.pallet): the
  // cladding's ribs the look's, the roll-up doors' slats every 10 cm.
  ribs: Object.freeze({
    cladding: Object.freeze({ axis: 'h' }),
    door: Object.freeze({ axis: 'v', pitch: 0.1, depth: 0.5, dark: 0.3 }),
  }),
  // The slab's saw cuts: a light one every 3 m, a wider one every 6 m.
  joints: Object.freeze({ minor: 3, major: 6, minorWidth: 0.008, majorWidth: 0.016, minorDark: 0.55, majorDark: 0.62 }),
  // The clerestories' glazing: frosted polycarbonate, the morning's light
  // through it (linear RGB, unlit).
  glazing: Object.freeze([1.5, 1.42, 1.3]),
});

// The key's way in, toward the sun (azimuth clockwise from +z), and the floor
// AO's casters: everything low enough to shade the floor (the roof's trusses
// and purlins are too high to).
const toSun = (k) => {
  const e = k.elevation * Math.PI / 180, a = k.azimuth * Math.PI / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
};
const depotAoBoxes = () => DEPOT_PLAY.boxes.filter((b) => b.max[1] <= 6.2);

// The sun shafts, metres (sim-look.js lookShafts): from each clerestory that
// has one, 1.5 cm inside the wall, long enough that its top edge reaches the
// floor and the floor cuts it where the light lands. Where the spin pole
// stands in a shaft, the slice of light it stops ends at the pole, as the
// shadow map cuts it from the patch.
export function depotShafts() {
  const d = toSun(DEPOT_KEY).map((v) => -v), z = DEPOT_PLAY.room.d / 2 - 0.015;
  const P = DEPOT_POLE, near = (P.z + P.d / 2 - z) / d[2];
  const px = P.x - d[0] * (P.z - z) / d[2], half = P.d / 2 + Math.abs(d[0] / d[2]) * P.d / 2;
  const out = [];
  const put = (x0, x1, y0, y1, length) => out.push({ quad: [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], dir: d, length });
  for (const w of DEPOT_WINDOWS.filter((q) => q.shaft)) {
    const [a, b] = w.shaft === true ? [w.x0, w.x1] : w.shaft, full = w.y1 / -d[1] + 0.3;
    if (px + half > a && px - half < b) {
      put(a, px - half, w.y0, w.y1, full);
      put(px - half, px + half, w.y0, w.y1, near);
      put(px + half, b, w.y0, w.y1, full);
    } else put(a, b, w.y0, w.y1, full);
  }
  return out;
}

function buildDepot(THREE, parent, colliders) {
  const P = DEPOT_PLAY, s = DEPOT_WS, R = P.room, L = LAYOUT.depot;
  const hx = R.w * s / 2, hz = R.d * s / 2, H = R.h * s, t = L.wall;
  const S = DEPOT_LOOK.surfaces;
  // Faces sit a hair behind their edge lines so the lines never z-fight.
  const mats = {};
  for (const [key, f] of Object.entries(S)) {
    const o = { extras: { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, fill: key === 'roof' ? DEPOT_LOOK.roofFill : DEPOT_LOOK.fill, albedoVar: f.albedoVar };
    if (key === 'floor') o.joints = { origin: [-hx, -hz], unit: s, spec: DEPOT_LOOK.joints };
    if (DEPOT_LOOK.ribs[key]) o.ribs = Object.assign({ unit: s }, DEPOT_LOOK.ribs[key]);
    if (key === 'pallet') o.pallet = { unit: s, module: P.pallet };
    mats[key] = lookMaterial(THREE, f.look, f.color, o);
    mats[key].name = 'depot ' + f.type;
  }
  const G = DEPOT_LOOK.glazing;
  mats.glazing = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(G[0], G[1], G[2]) });
  mats.glazing.name = 'depot glazing';
  mats.glazing.userData.looksSkip = true;
  const tiled = (mesh) => lookBoxUv(mesh, mesh.material.userData.lookTile * s);
  const vis = new THREE.Group();
  vis.name = 'depotArtVisuals';
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
    mesh.name = 'depot_' + r.mat;
    if (r.mat === 'pole') {
      // Round to look at; the collider box() took stays the square post.
      mesh.geometry.dispose();
      mesh.geometry = new THREE.CylinderGeometry((b[0] - a[0]) / 2, (b[0] - a[0]) / 2, b[1] - a[1], 24);
      continue;
    }
    tiled(mesh);
    edge(a, b);
  }
  // The floor carries the soft AO under everything low (floorAo).
  const floor = makeFloor(THREE, vis, R.w * s, R.d * s, mats.floor);
  lookFloor(THREE, floor, R, s, floorAo(depotAoBoxes(), R));
  // Shell: inner faces at exactly ±22.5 × ±15 × 9 m. Painted block to 2.4 m,
  // corrugated cladding over it; in the window wall the clerestories, their
  // glazing letting the key through. Everything else casts: the morning sun
  // comes in through the clerestories only.
  const bk = 2.4 * s, wall = (x0, x1, z0, z1, y0, y1, m) => {
    const mesh = box(THREE, vis, colliders, (x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, m);
    tiled(mesh);
    return mesh;
  };
  for (const [x0, x1, z0, z1] of [[-hx - t, -hx, -hz - t, hz + t], [hx, hx + t, -hz - t, hz + t], [-hx, hx, -hz - t, -hz]]) {
    wall(x0, x1, z0, z1, 0, bk, mats.block);
    wall(x0, x1, z0, z1, bk, H, mats.cladding);
  }
  const wy0 = DEPOT_WINDOWS[0].y0 * s, wy1 = DEPOT_WINDOWS[0].y1 * s;
  wall(-hx, hx, hz, hz + t, 0, bk, mats.block);
  wall(-hx, hx, hz, hz + t, bk, wy0, mats.cladding);
  wall(-hx, hx, hz, hz + t, wy1, H, mats.cladding);
  let px = -hx;
  for (const w of DEPOT_WINDOWS) {
    wall(px, w.x0 * s, hz, hz + t, wy0, wy1, mats.cladding);
    const pane = box(THREE, vis, colliders, (w.x0 + w.x1) * s / 2, wy0, hz + t / 2, (w.x1 - w.x0) * s, wy1 - wy0, 0.06 * s, mats.glazing);
    pane.name = 'depot_glazing';
    // The key comes in through the glazing.
    pane.castShadow = false;
    pane.receiveShadow = false;
    px = w.x1 * s;
  }
  wall(px, hx, hz, hz + t, wy0, wy1, mats.cladding);
  wall(-hx - t, hx + t, -hz - t, hz + t, H, H + 0.24, mats.roof);
  edge([-hx, 0, -hz], [hx, H, hz]);
  // The sun shafts, one soft beam a clerestory, in the air over the floor.
  const shafts = lookShafts(THREE, depotShafts().map((q) => ({ quad: q.quad.map((p) => p.map((v) => v * s)), dir: q.dir, length: q.length * s })), { name: 'depotShafts' });
  vis.add(shafts);
  // The edge lines at the look's 60%, bloomed (sim-look.js lookLines).
  const lines = lookLines(THREE, edges);
  lines.name = 'depotEdges';
  lines.userData.artKeep = true;
  vis.add(lines);
  return { floor, orbit: MAP_ORBIT.depot };
}

// The Bando: a gutted three-storey concrete frame, 30 × 20 m, 3.5 m a
// storey, its open roof and a ground-level courtyard, at the Warehouse's
// micro-class scale, sized for the 75 and 85 mm whoops (the 65 flies it
// too): the fourth map on the look. Metres here, scene axes (y up, +z the
// courtyard side, south; +x east); buildBando scales by BANDO_WS.
// Vertical first: ragged floor holes on every level, stacked so one dive
// takes two (or three) of them; an open switchback stair, no rails; a
// 1.6 × 1.6 m lift shaft from the ground to the roof with a door gap on each
// floor; empty window frames in every facade; broken block walls with rebar
// gaps and door openings; a grid of columns to orbit; a slab fallen from the
// first floor, leaning at 30° to fly under; a parapet round the roof with a
// gap to dive into the courtyard, where a rusted van, pallets and a dead
// tree stand. Boxes only, axis-aligned, by the Rig's rules: nothing under
// 6 cm thick, no slot of 10 cm or less between any two, every box on the
// ground or at least 15 cm over it. The leaning slab collides as a run of
// steps under the slab drawn at 30°.
// The Bando Loop (tracks/bando-loop-v2.json) is a designed line, as the
// House's and the Warehouse's, but in 3D (bandoLine): from the pad on the
// roof beside the lift shaft's top, south over the roof, through the parapet
// gap and down into the courtyard; between the pallets and through the van;
// a climbing turn and a quarter round the dead tree, in at a second-floor
// window; between the columns and round one, through a rebar gap, down
// through two floor holes in one dive to the ground; round a column, under
// the leaning slab, through a door, round a column, in at the shaft's door
// on the ground floor and up it to the finish at its top, by the pad.
export const BANDO_WS = 3.5; // world units per metre, as sim-core-adapter.js WS
// The lot: the courtyard and the yards round the frame, inside a 2.4 m block
// wall (the shell); open sky over it (h only bounds the flying).
const BANDO_LOT = Object.freeze({ w: 36, d: 36, h: 16, wall: 2.4 });
// The frame: its footprint, walls and slabs 25 cm, the floors' tops (the
// ground, the first and second floors, the roof).
const BANDO_FRAME = Object.freeze({ x0: -15, x1: 15, z0: -16, z1: 4, wall: 0.25, slab: 0.25, tops: Object.freeze([0, 3.5, 7, 10.5]) });
// Window frames on every facade, every storey: centres along the facade,
// widths 1.2 m (the long faces) and 0.9 m (the ends), sills 0.9 m over the
// floor, heads 2.1 m. On the ground, the courtyard face's middle window is a
// doorway, 2.4 × 2.6 m.
const BANDO_WINDOWS = Object.freeze({
  south: Object.freeze({ at: Object.freeze([-12.5, -8.25, -4, 0, 4, 8.25, 12.5]), w: 1.2 }),
  north: Object.freeze({ at: Object.freeze([-9, -4.5, 0, 4.5, 9, 12.75]), w: 1.2 }),
  east: Object.freeze({ at: Object.freeze([-12.75, -6.25, -3.3, 0.75]), w: 0.9 }),
  west: Object.freeze({ at: Object.freeze([-9.5, -5.5, -1.5, 2.0]), w: 0.9 }),
  sill: 0.9, head: 2.1,
  doorway: Object.freeze({ at: 0, w: 2.4, h: 2.6 }),
});
// The parapet round the roof: 1.1 m, the wall's thickness; the gap in its
// courtyard side, 1.6 m, x0..x1.
const BANDO_PARAPET = Object.freeze({ h: 1.1, gap: Object.freeze([7.45, 9.05]) });
// The columns: 40 cm square, on a grid, every storey.
const BANDO_COLUMNS = Object.freeze({ xs: Object.freeze([-11, -5.5, 0, 5.5, 11]), zs: Object.freeze([-11, -6, -1]), d: 0.4 });
// The lift shaft: 1.6 × 1.6 m inside, 20 cm walls, ground to roof, a door
// gap 1.0 × 2.1 m in its north wall on every floor; its top open.
const BANDO_SHAFT = Object.freeze({ x: 8.25, z: -6, inner: 1.6, wall: 0.2, door: Object.freeze({ w: 1.0, h: 2.1 }) });
// The stair: switchback, no rails, in the north-west corner over x0..x1,
// z0..z1. Each storey two flights of 10 risers (17.5 cm, 30 cm goings), 1.2 m
// wide, 40 cm apart (the open well), a 1.5 m landing against the north wall;
// flight A up the west wall northward, flight B back south to the floor over.
// Flight A stands 15 cm off the wall and the slab's opening runs 15 cm past
// flight B's open side (inset), so no tread sits in a slot.
const BANDO_STAIR = Object.freeze({ x0: -14.75, x1: -11.65, z0: -15.75, z1: -11.55, inset: 0.15, flight: 1.2, well: 0.4, risers: 10, rise: 0.175, going: 0.3, tread: 0.2, landing: 1.5 });
// The fallen slab: out of the first floor's collapse (hole), its foot on the
// ground at xf, its top against the east wall 3 m up, z0..z1 wide, 25 cm
// thick, at 30°. It collides as steps every d along x.
const BANDO_LEAN = Object.freeze((() => {
  const a = 30 * Math.PI / 180, top = 3.0, x1 = 14.75, xf = x1 - top / Math.tan(a);
  // The steps stop 15 cm short of the wall (no slot under the floor's edge
  // over it).
  return { angle: 30, xf, x1, top, z0: -4.8, z1: -1.8, t: 0.25, steps: 34, stepEnd: x1 - 0.15, hole: Object.freeze([8.9, 14.75, -5.0, -1.6]) };
})());
// The courtyard: a rusted van (its glass long gone: fly in at the windscreen
// and out at the back, or through its side windows), pallets stacked either
// side of the line in, a dead tree.
const BANDO_VAN = Object.freeze({ x0: -2.1, x1: 2.1, z0: 13.85, z1: 15.65, sill: 0.9, roof: 1.5, roofT: 0.08, cab: Object.freeze([-1.4, 1.0]), b: -0.2, inset: 0.1, pillar: 0.06, wheel: 0.62 });
const BANDO_PALLETS = Object.freeze([
  Object.freeze({ x0: 3.0, x1: 4.2, z0: 13.15, z1: 13.95, n: 6 }),
  Object.freeze({ x0: 3.0, x1: 4.2, z0: 15.55, z1: 16.35, n: 4 }),
  Object.freeze({ x0: 11.0, x1: 12.2, z0: 15.0, z1: 15.8, n: 3 }),
  Object.freeze({ x0: 12.6, x1: 13.8, z0: 15.0, z1: 15.8, n: 7 }),
]);
const BANDO_TREE = Object.freeze({ x: -5.5, z: 12.0 });
// Every pallet's base is a multiple of this (the pallet shader).
const BANDO_PALLET = 0.15;
// Interior walls: block, 20 cm, floor to slab, along 'x' (at z = c) or 'z'
// (at x = c) from a to b; door openings 0.9 × 2.1 m at their centres;
// breaks u0..u1 by v0..v1 over the floor with rebar standing across them
// (centres, 6 cm bars): the gaps between, 30 to 60 cm.
const BANDO_WALLS = Object.freeze([
  { s: 0, along: 'x', c: -8.5, a: 10.0, b: 14.75, doors: [13.75], breaks: [] },
  { s: 0, along: 'x', c: -3.5, a: -14.75, b: -8.0, doors: [-12.55], breaks: [{ u0: -10.6, u1: -8.8, v0: 0.6, v1: 2.2, bars: [-10.15, -9.65, -9.2] }] },
  { s: 1, along: 'z', c: 2.75, a: -15.75, b: -10.2, doors: [-11.4], breaks: [{ u0: -14.6, u1: -13.0, v0: 0.5, v1: 2.3, bars: [-14.1, -13.5] }] },
  { s: 1, along: 'x', c: -3.5, a: -14.75, b: -7.0, doors: [-9.0], breaks: [{ u0: -13.4, u1: -11.8, v0: 0.5, v1: 2.3, bars: [-12.9, -12.3] }] },
  { s: 2, along: 'z', c: 0, a: -0.8, b: 3.75, doors: [], breaks: [{ u0: 0.85, u1: 2.95, v0: 0.6, v1: 2.7, bars: [1.42, 2.08, 2.59] }] },
  { s: 2, along: 'x', c: -7.4, a: -2.5, b: 4.0, doors: [2.25], breaks: [{ u0: -1.6, u1: 0.4, v0: 0.4, v1: 2.4, bars: [-1.05, -0.45, 0.07] }] },
].map((w) => Object.freeze(w)));
const BANDO_DOOR = Object.freeze({ w: 0.9, h: 2.1 });

// The line's arcs: every pitch arc 2.5 m, every turn 2.75 m in plan.
const BANDO_R = 2.5, BANDO_T = 2.75;
const rad = (d) => d * Math.PI / 180;
const arcRise = (deg) => BANDO_R * (1 - Math.cos(rad(deg)));
const arcRun = (deg) => BANDO_R * Math.sin(rad(deg));
// The double dive: off the second floor at y2, from x d along z 1.75, at
// pitch, to the ground at y0.
const BANDO_DIVE = Object.freeze({ x: 1.6, z: 1.75, pitch: 50, y2: 8.6, y0: 1.0 });
// Where the dive's straight crosses height y.
const diveX = (y) => {
  const D = BANDO_DIVE, x0 = D.x + arcRun(D.pitch), y0 = D.y2 - arcRise(D.pitch);
  return x0 + (y0 - y) / Math.tan(rad(D.pitch));
};
// The climbing turn round the dead tree: from x climb (after the van) to the
// second-floor window, rising at a pitch found here.
const BANDO_CLIMB = Object.freeze((() => {
  const y0 = 1.2, y1 = BANDO_DIVE.y2, x = -2.6, helix = BANDO_T * rad(450);
  const rise = (p) => 2 * arcRise(p) + (x - arcRun(p) - (BANDO_TREE.x)) * Math.tan(rad(p)) + helix * Math.tan(rad(p));
  let lo = 1, hi = 40;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (rise(m) < y1 - y0) lo = m; else hi = m; }
  return { x, y0, pitch: (lo + hi) / 2 };
})());
// The roof's descent to the parapet gap: from the shaft's exit to 55 cm
// over the roof, two arcs.
const BANDO_GAP_Y = BANDO_FRAME.tops[3] + 0.55;
// Out of the shaft the line levels at BANDO_EXIT_Y, 1.3 m over the roof.
const BANDO_EXIT_Y = BANDO_FRAME.tops[3] + 1.3;
// The start: where the line levels out of the shaft, 1.3 m over the roof,
// above the pad, heading south (+z) for the first gate, 2 m on; each lap
// ends up the shaft, at the finish gate over its top, and levels out back
// here.
const BANDO_START = Object.freeze([BANDO_SHAFT.x, BANDO_EXIT_Y, BANDO_SHAFT.z + BANDO_R]);
const BANDO_ROOF_DIP = Math.acos(1 - (BANDO_EXIT_Y - BANDO_GAP_Y) / (2 * BANDO_R)) * 180 / Math.PI;
// The dive into the courtyard: from the gap at 65° to 1.2 m, levelling out
// 12 m south, where the turn round to the van starts.
const BANDO_DROP = Object.freeze((() => {
  const p = 65, y1 = 1.2, zEnd = 12.0;
  const z = zEnd - 2 * arcRun(p) - (BANDO_GAP_Y - y1 - 2 * arcRise(p)) / Math.tan(rad(p));
  return { pitch: p, y1, z, zEnd };
})());

// The Bando Loop's line, metres: a turtle in 3D from BANDO_START heading +z,
// level. ['L', d] straight on at the line's pitch; ['X', x], ['Y', y], ['Z', z]
// straight on until that coordinate is reached; ['A', r, deg] a turn about
// the vertical, radius r in plan, left for a positive angle (+x toward -z, as
// HOUSE_LINE), a helix when pitched (its radius r / cos^2 of the pitch);
// ['P', r, deg] a pitch arc in the heading's vertical plane, up for a
// positive angle, radius r, through vertical and over with the heading held;
// ['G', size, name] a gate here, its ring radius size. tracks/bando-loop-v2.json
// is its gates (tools/build_bando_loop.mjs).
const BANDO_LINE = Object.freeze((() => {
  const D = BANDO_DIVE, C = BANDO_CLIMB, Q = BANDO_DROP, S = BANDO_SHAFT, r = BANDO_R, t = BANDO_T;
  return [
    // Out of the shaft and over the roof, down to the parapet gap.
    ['Z', -1.5], ['G', 0.45, 'out of the shaft'], ['P', r, -BANDO_ROOF_DIP], ['P', r, BANDO_ROOF_DIP],
    ['Z', BANDO_FRAME.z1 - BANDO_FRAME.wall / 2], ['G', 0.45, 'parapet gap'],
    // The roof dive into the courtyard.
    ['Z', Q.z], ['P', r, -Q.pitch], ['Y', Q.y1 + arcRise(Q.pitch)], ['P', r, Q.pitch], ['G', 0.5, 'into the courtyard'],
    // Round to the van, between the pallets, through the van.
    ['A', t, -90], ['X', 3.6], ['G', 0.45, 'between the pallets'],
    ['X', -0.2], ['G', 0.28, 'through the van'],
    // The climbing turn and a quarter round the dead tree.
    ['X', C.x], ['P', r, C.pitch], ['X', BANDO_TREE.x],
    ['A', t, -90], ['G', 0.45, 'round the dead tree'], ['A', t, -90], ['G', 0.45, 'round the dead tree'],
    ['A', t, -90], ['G', 0.45, 'round the dead tree'], ['A', t, -90], ['G', 0.45, 'round the dead tree'],
    ['A', t, -90], ['P', r, -C.pitch],
    // In at the second-floor window; between the columns, round one.
    ['Z', BANDO_FRAME.z1 - BANDO_FRAME.wall / 2], ['G', 0.45, 'second-floor window'],
    ['Z', -3.25], ['G', 0.45, 'between the columns'],
    ['Z', -6], ['A', t, -90], ['G', 0.45, 'round the column'], ['A', t, -90],
    ['Z', -1], ['A', t, 45], ['G', 0.45, 'round the column'], ['A', t, 45],
    // The rebar gap; the dive through two floor holes to the ground.
    ['X', 0], ['G', 0.28, 'rebar gap'],
    ['X', D.x], ['P', r, -D.pitch], ['Y', (BANDO_FRAME.tops[1] + BANDO_FRAME.tops[2] - BANDO_FRAME.slab) / 2], ['G', 0.45, 'through the floors'],
    ['Y', D.y0 + arcRise(D.pitch)], ['P', r, D.pitch],
    ['X', 10.6], ['G', 0.45, 'ground floor'],
    // Round a column, under the leaning slab, through the door, round a column.
    ['X', 11], ['A', t, 90], ['Z', (BANDO_LEAN.z0 + BANDO_LEAN.z1) / 2], ['G', 0.45, 'under the slab'],
    ['Z', -8.5], ['G', 0.35, 'door'],
    ['Z', -11], ['A', t, 90], ['G', 0.45, 'round the column'], ['A', t, 90],
    // In at the shaft's door and up it to the roof: the finish over its top,
    // halfway round the arc out of it, so the climb is in every timed run.
    ['Z', S.z - r], ['P', r, 40], ['G', 0.35, 'shaft door'], ['P', r, 50],
    ['Y', BANDO_EXIT_Y - r], ['P', r, -45], ['G', 0.45, 'top of the shaft'], ['P', r, -45],
  ].map((op) => Object.freeze(op));
})());

export function bandoLine(ds) {
  return pathLine(BANDO_LINE, BANDO_START, [0, 1], ds);
}

// A designed line in 3D (BANDO_LINE) from p0, heading h0 [x, z] level,
// sampled every ds metres of line: points, the arc length s along it, and the
// gates { at (index), s, size, name, ry (the plan heading) }.
function pathLine(ops, p0, h0, ds) {
  const step = ds || 0.01;
  let [x, y, z] = p0, [hx, hz] = h0, ph = 0, s = 0;
  const pts = [[x, y, z]], S = [0], gates = [];
  const push = () => { pts.push([x, y, z]); S.push(s); };
  const dir = (p) => [hx * Math.cos(p), Math.sin(p), hz * Math.cos(p)];
  const run = (d) => {
    const n = Math.max(1, Math.ceil(d / step)), u = dir(ph);
    for (let i = 1; i <= n; i++) { x += u[0] * d / n; y += u[1] * d / n; z += u[2] * d / n; s += d / n; push(); }
  };
  for (const op of ops) {
    if (op[0] === 'L') run(op[1]);
    else if (op[0] === 'X' || op[0] === 'Y' || op[0] === 'Z') {
      const k = 'XYZ'.indexOf(op[0]), u = dir(ph)[k], at = [x, y, z][k], d = (op[1] - at) / u;
      if (!(d > -1e-9) || !Number.isFinite(d)) throw new Error('bando line: ' + op[0] + ' ' + op[1] + ' is behind (at ' + at.toFixed(3) + ')');
      if (d > 1e-9) run(d);
    } else if (op[0] === 'A') {
      const r = op[1], a = Math.abs(op[2]) * Math.PI / 180, sg = Math.sign(op[2]);
      const plan = r * a, len = plan / Math.cos(ph), n = Math.max(1, Math.ceil(len / step));
      for (let i = 1; i <= n; i++) {
        const p = sg * a / n, c = Math.cos(p), sn = Math.sin(p);
        // The chord of this step, then the turn: a left turn takes +x to -z.
        const mx = hx * Math.cos(p / 2) + hz * Math.sin(p / 2), mz = -hx * Math.sin(p / 2) + hz * Math.cos(p / 2);
        const chord = 2 * r * Math.sin(a / n / 2);
        x += mx * chord; z += mz * chord; y += plan / n * Math.tan(ph); s += len / n;
        [hx, hz] = [hx * c + hz * sn, -hx * sn + hz * c];
        push();
      }
    } else if (op[0] === 'P') {
      const r = op[1], a = op[2] * Math.PI / 180, n = Math.max(1, Math.ceil(r * Math.abs(a) / step));
      for (let i = 1; i <= n; i++) {
        const p1 = ph + a / n, u = dir((ph + p1) / 2), chord = 2 * r * Math.sin(Math.abs(a / n) / 2);
        x += u[0] * chord; y += u[1] * chord; z += u[2] * chord; s += r * Math.abs(a) / n; ph = p1;
        push();
      }
    } else if (op[0] === 'G') gates.push({ s, size: op[1], name: op[2], ry: Math.atan2(hx, hz) });
  }
  const at = (t) => S.findIndex((q) => q >= t - 1e-9);
  return {
    length: s,
    closes: Math.hypot(x - p0[0], y - p0[1], z - p0[2]) + Math.hypot(hx - h0[0], hz - h0[1]) + Math.abs(ph),
    points: pts,
    s: S,
    gates: gates.map((g) => Object.assign(g, { at: at(g.s) })),
  };
}

// A wall or a slab with openings: the rectangle u0..u1 by v0..v1 less the
// holes [u0, u1, v0, v1], as the solid's rectangles (each band's runs, merged
// on while they repeat) and its outline (the sides between solid and open,
// the rectangle's own included), for the edge lines. Breakpoints are rounded
// to 0.1 mm.
function bandoPanel(u0, u1, v0, v1, holes) {
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const hs = holes.map((h) => [Math.max(u0, h[0]), Math.min(u1, h[1]), Math.max(v0, h[2]), Math.min(v1, h[3])].map(r))
    .filter((h) => h[1] > h[0] && h[3] > h[2]);
  const us = [...new Set([u0, u1, ...hs.flatMap((h) => [h[0], h[1]])].map(r))].sort((a, b) => a - b);
  const vs = [...new Set([v0, v1, ...hs.flatMap((h) => [h[2], h[3]])].map(r))].sort((a, b) => a - b);
  const I = us.length - 1, J = vs.length - 1;
  const solid = (i, j) => {
    if (i < 0 || j < 0 || i >= I || j >= J) return false;
    const cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2;
    return !hs.some((h) => cu > h[0] && cu < h[1] && cv > h[2] && cv < h[3]);
  };
  const rects = [];
  let open = [];
  for (let j = 0; j < J; j++) {
    const runs = [];
    for (let i = 0; i < I; i++) {
      if (!solid(i, j)) continue;
      if (runs.length && runs[runs.length - 1][1] === i) runs[runs.length - 1][1] = i + 1;
      else runs.push([i, i + 1]);
    }
    const next = [];
    for (const [a, b] of runs) {
      let q = open.find((o) => o.a === a && o.b === b);
      if (q) q.j1 = j + 1;
      else { q = { a, b, j0: j, j1: j + 1 }; rects.push(q); }
      next.push(q);
    }
    open = next;
  }
  // Outline: along u at each v line, along v at each u line, merged.
  const lines = new Map();
  const add = (axis, c, a, b) => {
    const k = axis + c;
    if (!lines.has(k)) lines.set(k, { axis, c, segs: [] });
    lines.get(k).segs.push([a, b]);
  };
  for (let j = 0; j <= J; j++) for (let i = 0; i < I; i++) if (solid(i, j - 1) !== solid(i, j)) add('u', vs[j], us[i], us[i + 1]);
  for (let i = 0; i <= I; i++) for (let j = 0; j < J; j++) if (solid(i - 1, j) !== solid(i, j)) add('v', us[i], vs[j], vs[j + 1]);
  const segs = [];
  for (const { axis, c, segs: list } of lines.values()) {
    list.sort((p, q) => p[0] - q[0]);
    let cur = null;
    for (const s of list) {
      if (cur && Math.abs(s[0] - cur[1]) < 1e-9) cur[1] = s[1];
      else { if (cur) segs.push([axis, c, cur[0], cur[1]]); cur = [s[0], s[1]]; }
    }
    if (cur) segs.push([axis, c, cur[0], cur[1]]);
  }
  const cells = [];
  for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) cells.push(solid(i, j) ? 1 : 0);
  return { rects: rects.map((q) => [us[q.a], us[q.b], vs[q.j0], vs[q.j1]]), segs, us, vs, cells };
}

// A ragged hole: its core (1.35 to 1.5 m by 1.2 to 1.4 m) and the notches
// bitten out round it, on a 15 cm grid from its corner (no slot); 2 m across
// at the most, either way.
function bandoRagged(x0, x1, z0, z1, flip) {
  const z = (a) => (flip ? z1 - a : z0 + a), zz = (a, b) => [Math.min(z(a), z(b)), Math.max(z(a), z(b))];
  return [
    [x0, x1, z0, z1],
    [x0 - 0.15, x0, ...zz(0.3, 0.9)],
    [x0 - 0.3, x0 - 0.15, ...zz(0.45, 0.75)],
    [x1, x1 + 0.15, ...zz(0.15, 0.6)],
    [x0 + 0.3, x0 + 0.9, ...(flip ? [z0 - 0.3, z0] : [z1, z1 + 0.3])],
    [x0 + 0.6, x0 + 1.2, ...(flip ? [z1, z1 + 0.3] : [z0 - 0.3, z0])],
  ];
}

// The floor holes, every level: the loop's pair where its dive crosses the
// second floor and the first, the roof's over them in line (one dive takes
// all three), and a second stack west along z -9. Each { slab (1 the first
// floor, 3 the roof), name, core [x0, x1, z0, z1], rects (the ragged hole) }.
const BANDO_HOLES = Object.freeze((() => {
  const F = BANDO_FRAME, s5 = (v) => Math.round(v * 20) / 20, D = BANDO_DIVE;
  const mid = (k) => F.tops[k] - F.slab / 2;
  const at = (k, w, d0, d1) => { const c = s5(diveX(mid(k))); return [s5(c - w / 2), s5(c + w / 2), d0, d1]; };
  const out = [];
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const put = (slab, name, core, flip) => out.push(Object.freeze({ slab, name, core: Object.freeze(core.map(r4)), rects: Object.freeze(bandoRagged(...core, flip).map((q) => Object.freeze(q.map(r4)))) }));
  put(2, 'second floor, east', at(2, 1.5, D.z - 0.7, D.z + 0.7), false);
  put(1, 'first floor, east', at(1, 1.5, D.z - 0.7, D.z + 0.7), true);
  put(3, 'roof, east', at(3, 1.35, D.z - 0.6, D.z + 0.6), true);
  put(3, 'roof, west', [-3.75, -2.25, -9.6, -8.4], false);
  put(2, 'second floor, west', [-0.75, 0.75, -9.6, -8.4], true);
  put(1, 'first floor, west', [2.25, 3.75, -9.6, -8.4], false);
  return out;
})());

const BANDO_EDGES = [];
// The walls and slabs drawn whole (bandoPanelMesh): each panel's frame,
// thickness and cell grid; its boxes collide.
const BANDO_PANELS = [];

function bandoBoxes() {
  const out = [];
  BANDO_EDGES.length = 0;
  BANDO_PANELS.length = 0;
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const b = (zone, mat, feature, part, x0, y0, z0, x1, y1, z1, extra) => {
    const rec = Object.assign({ zone, mat, feature, part, min: [r(x0), r(y0), r(z0)], max: [r(x1), r(y1), r(z1)] }, extra || {});
    out.push(Object.freeze(rec));
    return rec;
  };
  const line = (p, q) => BANDO_EDGES.push(p[0], p[1], p[2], q[0], q[1], q[2]);
  const boxEdges = (a, c) => {
    for (const y of [a[1], c[1]]) {
      line([a[0], y, a[2]], [c[0], y, a[2]]); line([a[0], y, c[2]], [c[0], y, c[2]]);
      line([a[0], y, a[2]], [a[0], y, c[2]]); line([c[0], y, a[2]], [c[0], y, c[2]]);
    }
    for (const [x, z] of [[a[0], a[2]], [c[0], a[2]], [a[0], c[2]], [c[0], c[2]]]) line([x, a[1], z], [x, c[1], z]);
  };
  const box = (zone, mat, feature, part, x0, y0, z0, x1, y1, z1, extra) => {
    const rec = b(zone, mat, feature, part, x0, y0, z0, x1, y1, z1, extra);
    if (!rec.round && rec.draw !== false) boxEdges(rec.min, rec.max);
    return rec;
  };
  // A panel: frame 'y' a slab (u x, v z, thickness y), 'z' a wall along x
  // (u x, v y, thickness z), 'x' a wall along z (u z, v y, thickness x).
  const P = (frame, t0, t1) => (u, v, t) => (frame === 'y' ? [u, t, v] : frame === 'z' ? [u, v, t] : [t, v, u]);
  const panel = (zone, mat, feature, part, frame, t0, t1, u0, u1, v0, v1, holes) => {
    const p = P(frame, t0, t1), pan = bandoPanel(u0, u1, v0, v1, holes), id = BANDO_PANELS.length;
    BANDO_PANELS.push(Object.freeze({ mat, frame, t0, t1, us: Object.freeze(pan.us), vs: Object.freeze(pan.vs), cells: Object.freeze(pan.cells) }));
    for (const [a0, a1, c0, c1] of pan.rects) {
      const lo = p(a0, c0, t0), hi = p(a1, c1, t1);
      b(zone, mat, feature, part, Math.min(lo[0], hi[0]), Math.min(lo[1], hi[1]), Math.min(lo[2], hi[2]), Math.max(lo[0], hi[0]), Math.max(lo[1], hi[1]), Math.max(lo[2], hi[2]), { panel: id });
    }
    const corners = new Set();
    for (const [axis, c, a0, a1] of pan.segs) {
      for (const t of [t0, t1]) line(axis === 'u' ? p(a0, c, t) : p(c, a0, t), axis === 'u' ? p(a1, c, t) : p(c, a1, t));
      for (const e of [a0, a1]) corners.add(axis === 'u' ? e + ',' + c : c + ',' + e);
    }
    for (const k of corners) { const [u, v] = k.split(',').map(Number); line(p(u, v, t0), p(u, v, t1)); }
  };
  const F = BANDO_FRAME, T = F.tops, w = F.wall, W = BANDO_WINDOWS, Sh = BANDO_SHAFT, St = BANDO_STAIR, L = BANDO_LEAN;
  const ceil = (s) => T[s + 1] - F.slab;
  const name = ['ground', 'first floor', 'second floor', 'roof'];
  // Facades, a storey at a time, their window frames open.
  for (let s = 0; s < 3; s++) {
    const win = (list) => list.at.map((c) => [c - list.w / 2, c + list.w / 2, T[s] + W.sill, T[s] + W.head]);
    const south = win(W.south).filter((h, i) => !(s === 0 && W.south.at[i] === W.doorway.at));
    if (s === 0) south.push([W.doorway.at - W.doorway.w / 2, W.doorway.at + W.doorway.w / 2, T[0], T[0] + W.doorway.h]);
    panel(name[s], 'concrete', 'facade', 'south wall', 'z', F.z1 - w, F.z1, F.x0, F.x1, T[s], ceil(s), south);
    panel(name[s], 'concrete', 'facade', 'north wall', 'z', F.z0, F.z0 + w, F.x0, F.x1, T[s], ceil(s), win(W.north));
    panel(name[s], 'concrete', 'facade', 'east wall', 'x', F.x1 - w, F.x1, F.z0 + w, F.z1 - w, T[s], ceil(s), win(W.east));
    panel(name[s], 'concrete', 'facade', 'west wall', 'x', F.x0, F.x0 + w, F.z0 + w, F.z1 - w, T[s], ceil(s), win(W.west));
  }
  // The slabs: the first floor, the second, the roof; each open over the
  // shaft and the stair, its ragged holes, the first floor's collapse.
  const sx0 = Sh.x - Sh.inner / 2 - Sh.wall, sx1 = Sh.x + Sh.inner / 2 + Sh.wall, sz0 = Sh.z - Sh.inner / 2 - Sh.wall, sz1 = Sh.z + Sh.inner / 2 + Sh.wall;
  for (let k = 1; k <= 3; k++) {
    const holes = [[sx0, sx1, sz0, sz1], [St.x0, St.x1, St.z0, St.z1]];
    for (const h of BANDO_HOLES.filter((q) => q.slab === k)) holes.push(...h.rects.map((q) => [q[0], q[1], q[2], q[3]]));
    if (k === 1) holes.push(L.hole.slice());
    panel(name[k], 'concrete', k === 3 ? 'roof' : 'slab', k === 3 ? 'roof slab' : 'slab', 'y', T[k] - F.slab, T[k], F.x0, F.x1, F.z0, F.z1, holes);
  }
  // The parapet on the roof's edge, its gap on the courtyard side.
  const top = T[3] + BANDO_PARAPET.h;
  panel('roof', 'concrete', 'parapet', 'parapet', 'z', F.z1 - w, F.z1, F.x0, F.x1, T[3], top, [[BANDO_PARAPET.gap[0], BANDO_PARAPET.gap[1], T[3], top]]);
  panel('roof', 'concrete', 'parapet', 'parapet', 'z', F.z0, F.z0 + w, F.x0, F.x1, T[3], top, []);
  panel('roof', 'concrete', 'parapet', 'parapet', 'x', F.x1 - w, F.x1, F.z0 + w, F.z1 - w, T[3], top, []);
  panel('roof', 'concrete', 'parapet', 'parapet', 'x', F.x0, F.x0 + w, F.z0 + w, F.z1 - w, T[3], top, []);
  // The lift shaft, ground to roof: a door gap in its north wall on every floor.
  const doors = [0, 1, 2].map((s) => [Sh.x - Sh.door.w / 2, Sh.x + Sh.door.w / 2, T[s], T[s] + Sh.door.h]);
  panel('shaft', 'concrete', 'lift shaft', 'shaft wall', 'z', sz0, sz0 + Sh.wall, sx0, sx1, 0, T[3], doors);
  panel('shaft', 'concrete', 'lift shaft', 'shaft wall', 'z', sz1 - Sh.wall, sz1, sx0, sx1, 0, T[3], []);
  panel('shaft', 'concrete', 'lift shaft', 'shaft wall', 'x', sx0, sx0 + Sh.wall, sz0 + Sh.wall, sz1 - Sh.wall, 0, T[3], []);
  panel('shaft', 'concrete', 'lift shaft', 'shaft wall', 'x', sx1 - Sh.wall, sx1, sz0 + Sh.wall, sz1 - Sh.wall, 0, T[3], []);
  // The columns, every storey, floor to slab.
  const C = BANDO_COLUMNS, cd = C.d / 2;
  for (let s = 0; s < 3; s++) for (const x of C.xs) for (const z of C.zs) box(name[s], 'concrete', 'columns', 'column', x - cd, T[s], z - cd, x + cd, ceil(s), z + cd);
  // The stair: per storey flight A north up the west wall, the landing,
  // flight B south to the floor over. Treads 20 cm thick over 17.5 cm
  // risers, so each sits on the one before (no slot under a flight).
  for (let s = 0; s < 3; s++) {
    const y = T[s], ax0 = St.x0 + St.inset, ax1 = ax0 + St.flight, bx1 = St.x1 - St.inset, bx0 = bx1 - St.flight;
    for (let k = 1; k < St.risers; k++) {
      const zt = St.z1 - St.going * k, yt = y + St.rise * k;
      box(name[s], 'concrete', 'stair', 'tread', ax0, Math.max(y, yt - St.tread), zt, ax1, yt, zt + St.going);
    }
    const yl = y + St.rise * St.risers, zl = St.z1 - St.going * (St.risers - 1);
    box(name[s], 'concrete', 'stair', 'landing', St.x0, yl - St.tread, St.z0, bx1, yl, zl);
    for (let k = 1; k < St.risers; k++) {
      const zt = zl + St.going * (k - 1), yt = yl + St.rise * k;
      box(name[s], 'concrete', 'stair', 'tread', bx0, yt - St.tread, zt, bx1, yt, zt + St.going);
    }
  }
  // The block walls inside, broken, their doors and rebar.
  for (const wl of BANDO_WALLS) {
    const y0 = T[wl.s], y1 = ceil(wl.s), t0 = wl.c - 0.1, t1 = wl.c + 0.1, frame = wl.along === 'x' ? 'z' : 'x';
    const holes = wl.doors.map((c) => [c - BANDO_DOOR.w / 2, c + BANDO_DOOR.w / 2, y0, y0 + BANDO_DOOR.h]);
    for (const k of wl.breaks) holes.push([k.u0, k.u1, y0 + k.v0, y0 + k.v1]);
    panel(name[wl.s], 'block', 'block walls', 'wall', frame, t0, t1, wl.a, wl.b, y0, y1, holes);
    for (const k of wl.breaks) {
      for (const u of k.bars) {
        if (wl.along === 'x') box(name[wl.s], 'rust', 'rebar', 'bar', u - 0.03, y0 + k.v0, wl.c - 0.03, u + 0.03, y0 + k.v1, wl.c + 0.03, { round: 'y' });
        else box(name[wl.s], 'rust', 'rebar', 'bar', wl.c - 0.03, y0 + k.v0, u - 0.03, wl.c + 0.03, y0 + k.v1, u + 0.03, { round: 'y' });
      }
    }
  }
  // The fallen slab's steps: each d along x, from the slab's underside at
  // its middle to its top there; a step under 15 cm sits on the ground.
  const d = (L.stepEnd - L.xf) / L.steps, tan = Math.tan(rad(L.angle)), thick = L.t / Math.cos(rad(L.angle));
  for (let k = 0; k < L.steps; k++) {
    const x0 = L.xf + d * k, yb = (d * (k + 0.5)) * tan;
    b('ground', 'concrete', 'leaning slab', 'step', x0, yb < 0.15 ? 0 : yb, L.z0, x0 + d, yb + thick, L.z1, { draw: false });
  }
  // The courtyard: the van, rusted through, its glass gone.
  const V = BANDO_VAN, pz0 = V.z0 + V.inset, pz1 = V.z1 - V.inset, pp = V.pillar;
  box('courtyard', 'rust', 'van', 'body', V.x0, 0.3, V.z0, V.x1, V.sill, V.z1);
  box('courtyard', 'rust', 'van', 'roof', V.cab[0], V.roof, pz0, V.cab[1], V.roof + V.roofT, pz1);
  for (const x of [V.cab[1] - pp, V.b, V.cab[0]]) {
    for (const z of [pz0, pz1 - pp]) box('courtyard', 'rust', 'van', 'pillar', x, V.sill, z, x + pp, V.roof, z + pp);
  }
  for (const x of [V.x0 + 0.55, V.x1 - 0.55]) {
    for (const [z0, z1] of [[V.z0 - 0.05, V.z0 + 0.2], [V.z1 - 0.2, V.z1 + 0.05]]) box('courtyard', 'dark', 'van', 'wheel', x - V.wheel / 2, 0, z0, x + V.wheel / 2, V.wheel, z1, { round: 'z' });
  }
  // The pallets, stacked.
  for (const p of BANDO_PALLETS) for (let i = 0; i < p.n; i++) box('courtyard', 'pallet', 'pallets', 'pallet', p.x0, i * BANDO_PALLET, p.z0, p.x1, (i + 1) * BANDO_PALLET, p.z1);
  // The dead tree: a trunk and three limbs, each a run of short stems
  // stepping out as it climbs, gnarled; each stem drawn round inside its box,
  // so the bark never stands outside what collides. All within 1.2 m of the
  // trunk.
  const TR = BANDO_TREE;
  box('courtyard', 'bark', 'dead tree', 'trunk', TR.x - 0.18, 0, TR.z - 0.18, TR.x + 0.18, 3.0, TR.z + 0.18, { round: 'y' });
  // A limb: n stems from y0, each h tall, w0 wide less 2 cm a stem, stepping
  // `shift` along (dx, dz) from `from` off the trunk's axis.
  const limb = (dx, dz, from, shift, y0, n, w0, h) => {
    for (let k = 0; k < n; k++) {
      const wk = w0 - 0.02 * k, cx = TR.x + dx * (from + shift * k), cz = TR.z + dz * (from + shift * k);
      box('courtyard', 'bark', 'dead tree', 'limb', cx - wk / 2, y0 + h * k, cz - wk / 2, cx + wk / 2, y0 + h * (k + 1), cz + wk / 2, { round: 'y' });
    }
  };
  limb(1, 0, 0.06, 0.12, 3.0, 4, 0.26, 0.7);
  limb(0, -1, 0.27, 0.14, 2.2, 4, 0.24, 0.65);
  limb(-Math.SQRT1_2, Math.SQRT1_2, 0.2, 0.16, 1.5, 4, 0.22, 0.6);
  return out;
}

// The off-loop lines for freestyle, each a pass an 85 flies clear (15 cm
// from every box: half its 13 cm span and margin; tools/test_sim_bando.mjs).
function bandoLines() {
  const F = BANDO_FRAME, D = BANDO_DIVE, V = BANDO_VAN, Sh = BANDO_SHAFT, St = BANDO_STAIR;
  const west = (y) => (6.875 - y) * 3 / 3.5;
  const round = (x, y, z, r) => Array.from({ length: 49 }, (_, i) => [x + r * Math.cos(i * Math.PI / 24), y, z + r * Math.sin(i * Math.PI / 24)]);
  return [
    // The roof's hole, the second floor's and the first's, in one dive.
    { name: 'the triple drop', feature: 'floor holes', pts: [[diveX(12.6), 12.6, D.z], [diveX(1.4), 1.4, D.z]] },
    { name: 'the west drop', feature: 'floor holes', pts: [[west(12.6), 12.6, -9.0], [west(1.4), 1.4, -9.0]] },
    // Straight down the stair's open well, roof to ground.
    { name: 'down the stairwell', feature: 'stair', pts: [[St.x0 + St.inset + St.flight + St.well / 2, 12.6, -13.0], [St.x0 + St.inset + St.flight + St.well / 2, 0.6, -13.0]] },
    // In at a side window of the van and out the other side.
    { name: 'through the van sideways', feature: 'van', pts: [[(V.cab[1] + V.b + V.pillar) / 2, 1.2, 12.4], [(V.cab[1] + V.b + V.pillar) / 2, 1.2, 17.2]] },
    // Down the shaft from the roof and out at the second floor's door.
    { name: 'down the shaft', feature: 'lift shaft', pts: [[Sh.x, 12.6, Sh.z], [Sh.x, F.tops[2] + 1.1, Sh.z], [Sh.x, F.tops[2] + 1.1, Sh.z - 3]] },
    // The second floor's other rebar gaps, 45 and 33 cm; the ground's.
    { name: 'the 45 cm rebar gap', feature: 'rebar', pts: [[-1.6, 8.6, 2.335], [1.7, 8.6, 2.335]] },
    { name: 'the 33 cm rebar gap', feature: 'rebar', pts: [[-1.6, 8.6, 2.785], [1.7, 8.6, 2.785]] },
    { name: 'the ground floor rebar gap', feature: 'rebar', pts: [[-9.425, 1.4, -5.5], [-9.425, 1.4, -1.6]] },
    // Orbits round a first-floor column.
    { name: 'round a first-floor column', feature: 'columns', pts: round(-5.5, 5.1, -6, 1.2) },
  ];
}

// The authored gaps (sim-tricks.js Gap): every opening the Bando is built
// with, as gapVolume. Windows and doors through their wall's thickness; floor
// holes, the stair's well and the shaft's top through their slab's; the slab
// underpass along z under the steps; the parapet gap; the van.
function bandoGaps() {
  const s = BANDO_WS, F = BANDO_FRAME, T = F.tops, w = F.wall, W = BANDO_WINDOWS, Sh = BANDO_SHAFT, St = BANDO_STAIR, L = BANDO_LEAN, V = BANDO_VAN;
  const out = [];
  const g = (name, axis, x0, y0, z0, x1, y1, z1) => out.push(gapVolume('bando', name, axis, s, x0, y0, z0, x1, y1, z1));
  const floor = ['ground', 'first floor', 'second floor'];
  for (let k = 0; k < 3; k++) {
    for (const [face, list] of Object.entries({ south: W.south, north: W.north, east: W.east, west: W.west })) {
      for (const c of list.at) {
        const y0 = T[k] + W.sill, y1 = T[k] + W.head, a = c - list.w / 2, b = c + list.w / 2;
        if (face === 'south' && k === 0 && c === W.doorway.at) {
          g('courtyard doorway', 'z', c - W.doorway.w / 2, 0, F.z1 - w, c + W.doorway.w / 2, W.doorway.h, F.z1);
          continue;
        }
        const nm = `${floor[k]} window, ${face} face, ${face === 'south' || face === 'north' ? 'x' : 'z'} ${c}`;
        if (face === 'south') g(nm, 'z', a, y0, F.z1 - w, b, y1, F.z1);
        else if (face === 'north') g(nm, 'z', a, y0, F.z0, b, y1, F.z0 + w);
        else if (face === 'east') g(nm, 'x', F.x1 - w, y0, a, F.x1, y1, b);
        else g(nm, 'x', F.x0, y0, a, F.x0 + w, y1, b);
      }
    }
  }
  for (const h of BANDO_HOLES) g('floor hole, ' + h.name, 'y', h.core[0], T[h.slab] - F.slab, h.core[2], h.core[1], T[h.slab], h.core[3]);
  for (let k = 1; k <= 3; k++) g('stair well, ' + ['', 'first floor', 'second floor', 'roof'][k], 'y', St.x0, T[k] - F.slab, St.z0, St.x1, T[k], St.z1 - St.going);
  const zs0 = Sh.z - Sh.inner / 2 - Sh.wall;
  for (let k = 0; k < 3; k++) g('shaft door, ' + floor[k], 'z', Sh.x - Sh.door.w / 2, T[k], zs0, Sh.x + Sh.door.w / 2, T[k] + Sh.door.h, zs0 + Sh.wall);
  g('shaft top', 'y', Sh.x - Sh.inner / 2, T[3] - F.slab, Sh.z - Sh.inner / 2, Sh.x + Sh.inner / 2, T[3], Sh.z + Sh.inner / 2);
  for (const wl of BANDO_WALLS) {
    const y0 = T[wl.s], t0 = wl.c - 0.1, t1 = wl.c + 0.1;
    const put = (nm, u0, u1, v0, v1) => (wl.along === 'x' ? g(nm, 'z', u0, v0, t0, u1, v1, t1) : g(nm, 'x', t0, v0, u0, t1, v1, u1));
    for (const c of wl.doors) put(`${floor[wl.s]} door, ${wl.along === 'x' ? 'x' : 'z'} ${c}`, c - BANDO_DOOR.w / 2, c + BANDO_DOOR.w / 2, y0, y0 + BANDO_DOOR.h);
    for (const k of wl.breaks) {
      const edges = [k.u0, ...k.bars.flatMap((u) => [u - 0.03, u + 0.03]), k.u1];
      for (let i = 0; i < edges.length; i += 2) {
        const gap = Math.round((edges[i + 1] - edges[i]) * 100);
        put(`${floor[wl.s]} rebar gap, ${gap} cm, ${wl.along === 'x' ? 'x' : 'z'} ${((edges[i] + edges[i + 1]) / 2).toFixed(2)}`, edges[i], edges[i + 1], y0 + k.v0, y0 + k.v1);
      }
    }
  }
  // Under the fallen slab: from the step at x 12.4 on, up to that step's
  // underside, to the east wall.
  const d = (L.stepEnd - L.xf) / L.steps, k0 = Math.ceil((12.4 - L.xf) / d), tan = Math.tan(rad(L.angle));
  g('under the leaning slab', 'z', L.xf + d * k0, 0, L.z0, L.x1, Math.round(d * (k0 + 0.5) * tan * 1e4) / 1e4, L.z1);
  // The collapse in the first floor, where the slab came from: clear of the
  // steps' tops.
  const thick = L.t / Math.cos(rad(L.angle));
  let k1 = 0;
  while (k1 < L.steps && d * (k1 + 0.5) * tan + thick < T[1] - F.slab - 1e-9) k1++;
  g('first floor collapse', 'y', L.hole[0], T[1] - F.slab, L.hole[2], k1 >= L.steps ? L.hole[1] : Math.round((L.xf + d * k1) * 1e4) / 1e4, T[1], L.hole[3]);
  g('parapet gap', 'z', BANDO_PARAPET.gap[0], T[3], F.z1 - w, BANDO_PARAPET.gap[1], T[3] + BANDO_PARAPET.h, F.z1);
  const pz0 = V.z0 + V.inset, pz1 = V.z1 - V.inset, pp = V.pillar;
  g('through the van', 'x', V.cab[0], V.sill, pz0 + pp, V.cab[1], V.roof, pz1 - pp);
  g('the van, front side windows', 'z', V.b + pp, V.sill, pz0, V.cab[1] - pp, V.roof, pz1);
  g('the van, rear side windows', 'z', V.cab[0] + pp, V.sill, pz0, V.b, V.roof, pz1);
  return out;
}

export const BANDO_PLAY = Object.freeze({
  room: Object.freeze({ w: BANDO_LOT.w, d: BANDO_LOT.d, h: BANDO_LOT.h }),
  lot: BANDO_LOT,
  frame: BANDO_FRAME,
  // The start pad, on the roof by the shaft's top, nose south (+z) to the
  // first gate, out of the shaft.
  start: Object.freeze([BANDO_START[0], BANDO_FRAME.tops[3] + 0.35, BANDO_START[2]]),
  windows: BANDO_WINDOWS,
  parapet: BANDO_PARAPET,
  columns: BANDO_COLUMNS,
  shaft: BANDO_SHAFT,
  stair: BANDO_STAIR,
  lean: BANDO_LEAN,
  van: BANDO_VAN,
  pallets: BANDO_PALLETS,
  pallet: BANDO_PALLET,
  tree: BANDO_TREE,
  walls: BANDO_WALLS,
  door: BANDO_DOOR,
  holes: BANDO_HOLES,
  dive: BANDO_DIVE,
  boxes: Object.freeze(bandoBoxes()),
  edges: Object.freeze(BANDO_EDGES.slice()),
  panels: Object.freeze(BANDO_PANELS.slice()),
  lines: Object.freeze(bandoLines().map((l) => Object.freeze(l))),
});

// The Bando on the look: every surface a look surface, the look's sets, no
// new texture. Raw concrete (the floor's set, weathered in the shader:
// mottle, streaks under every slab edge, rising damp, old puddles), painted
// block gone pale, rusted steel, perished rubber, weathered pallet wood and
// dead wood. Under the roof the overcast's fill is dimmed (opts.shelter),
// eased up toward the facades and their windows. The colour is the graffiti.
function bandoSurface(type, look, color, albedoVar) {
  const s = LOOK.surfaces[look];
  return Object.freeze({ type, look, color, roughness: s.roughness, metalness: s.metalness, albedoVar });
}
export const BANDO_LOOK = Object.freeze({
  surfaces: Object.freeze({
    concrete: bandoSurface('raw concrete', 'concrete', 0xf0ece4),
    floor: bandoSurface('concrete floor', 'concrete', 0xddd8cf),
    block: bandoSurface('pale painted block', 'paintedBlock', 0xd6dccd),
    rust: bandoSurface('rusted steel', 'rust', 0x9c5630),
    dark: bandoSurface('perished rubber', 'paintedSteel', 0x2b2c2e, 0.5),
    pallet: bandoSurface('weathered pallet wood', 'plywood', 0xb7a183),
    bark: bandoSurface('dead wood', 'plywood', 0x75695c),
  }),
  // The overcast's balance on every surface (sim-look.js opts.fill): a
  // touch cool. Under the roof it falls to `shelter.fill` of itself, eased
  // in over `ramp` metres from the facades; the slabs' undersides take
  // `soffit` times that (the floors' bounce).
  fill: Object.freeze([1.5, 1.53, 1.62]),
  shelter: Object.freeze({ fill: 0.5, ramp: 3.0, soffit: 3.2 }),
  // The yard's concrete: a saw cut every 3 m, wider every 6 m.
  joints: Object.freeze({ minor: 3, major: 6, minorWidth: 0.01, majorWidth: 0.018, minorDark: 0.45, majorDark: 0.55 }),
  // The sky past the windows and over the roof: overcast, a grey dome
  // brighter at the horizon (linear RGB, unlit); the ground beyond the wall;
  // the town round the lot, grey blocks in the haze.
  sky: Object.freeze({ zenith: [0.42, 0.45, 0.5], horizon: [0.78, 0.79, 0.8], ground: [0.1, 0.1, 0.095], yard: [0.12, 0.118, 0.11], town: [0.2, 0.215, 0.24] }),
  // The graffiti, metres: original pieces (sim-look.js lookGraffiti), on the
  // courtyard face, the yard's walls, the shaft, a block wall, the parapet.
  // Hues apart from the gates' brand orange and green.
  graffiti: Object.freeze([
    { c: [-10.4, 1.35, 4.0], n: '+z', w: 2.6, h: 1.2, style: 0, seed: 1.3, a: 0x3fb85f, b: 0xd6f06a },
    { c: [6.1, 1.4, 4.0], n: '+z', w: 2.4, h: 1.1, style: 2, seed: 2.7, a: 0xc92f78, b: 0xff9ec9 },
    { c: [-2.0, 5.0, 4.0], n: '+z', w: 2.2, h: 1.0, style: 1, seed: 4.1, a: 0x1f9fc6, b: 0xa6efff },
    { c: [-9.0, 1.25, 18.0], n: '-z', w: 4.2, h: 1.6, style: 0, seed: 5.9, a: 0xe0a01c, b: 0xffe56e },
    { c: [7.5, 1.3, 18.0], n: '-z', w: 2.6, h: 1.5, style: 1, seed: 7.3, a: 0x6a3fd0, b: 0xc9a6ff },
    { c: [18.0, 1.2, 9.0], n: '-x', w: 3.4, h: 1.4, style: 2, seed: 8.8, a: 0x12a58a, b: 0x9fe8ff },
    { c: [-18.0, 1.25, 13.0], n: '+x', w: 3.0, h: 1.4, style: 0, seed: 9.6, a: 0xc8323c, b: 0xff9ad6 },
    { c: [11.6, 1.4, -8.4], n: '+z', w: 2.2, h: 1.1, style: 1, seed: 3.3, a: 0xe4be19, b: 0xfff3a0 },
    { c: [8.25, 1.5, -5.0], n: '+z', w: 1.7, h: 0.9, style: 0, seed: 6.6, a: 0x2a62d8, b: 0x8fd8ff },
    { c: [8.25, 8.4, -5.0], n: '+z', w: 1.7, h: 0.9, style: 2, seed: 10.2, a: 0x58c234, b: 0xe2ff8a },
    { c: [0.1, 8.3, 0.0], n: '+x', w: 1.4, h: 0.9, style: 0, seed: 11.4, a: 0xd23a8c, b: 0xffd84a },
    { c: [-6.0, 11.0, 3.75], n: '-z', w: 3.2, h: 0.85, style: 2, seed: 12.5, a: 0x1fb5c8, b: 0xd2fbff },
    { c: [-6.75, 5.2, -15.75], n: '+z', w: 2.8, h: 1.2, style: 1, seed: 13.7, a: 0x4a5fe0, b: 0xb8c4ff },
  ].map((d) => Object.freeze(d))),
});


// The sun shafts, metres (sim-look.js lookShafts): from the courtyard face's
// windows whose light falls clear to the floor inside, and down from the
// roof's holes to the second floor. A window or a hole whose light meets a
// box on its way, or lands where the key's shadow is, has none.
export function bandoShafts() {
  const d = toSun(BANDO_KEY).map((v) => -v), F = BANDO_FRAME, T = F.tops, W = BANDO_WINDOWS, B = BANDO_PLAY.boxes;
  // Whether the ray p + u t, t0 <= t <= t1, meets a box (the slab test).
  const hits = (p, u, t0, t1) => B.some((b) => {
    let lo = t0, hi = t1;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(u[k]) < 1e-12) { if (p[k] <= b.min[k] || p[k] >= b.max[k]) return false; continue; }
      const a = (b.min[k] - p[k]) / u[k], c = (b.max[k] - p[k]) / u[k];
      lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c));
      if (hi - lo < 1e-9) return false;
    }
    return true;
  });
  // Clear: every sample of the quad reaches the floor without meeting a box,
  // and nothing stands between it and the sun.
  const up = d.map((c) => -c);
  const clear = (quad, floor) => {
    for (let u = 0.05; u <= 0.95 + 1e-9; u += 0.1125) {
      for (let v = 0.05; v <= 0.95 + 1e-9; v += 0.225) {
        const p = [0, 1, 2].map((k) => quad[0][k] + (quad[1][k] - quad[0][k]) * u + (quad[3][k] - quad[0][k]) * v);
        if (hits(p, d, 0.02, (p[1] - floor) / -d[1] - 0.01)) return false;
        if (hits(p, up, 0.02, 60)) return false;
      }
    }
    return true;
  };
  const out = [];
  const z = F.z1 - F.wall - 0.015;
  for (let s = 0; s < 3; s++) {
    for (const c of W.south.at) {
      if (s === 0 && c === W.doorway.at) continue;
      // The window's inner opening, less the part its reveals keep in shade
      // (the outer opening seen along the light through the wall).
      const sh = F.wall / -d[2], x0 = Math.max(c - W.south.w / 2, c - W.south.w / 2 + d[0] * sh), x1 = Math.min(c + W.south.w / 2, c + W.south.w / 2 + d[0] * sh);
      const y0 = T[s] + W.sill, y1 = T[s] + W.head + d[1] * sh;
      const quad = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
      if (clear(quad, T[s])) out.push({ quad, dir: d, length: (y1 - T[s]) / -d[1] + 0.3, from: 'window' });
    }
  }
  for (const h of BANDO_HOLES.filter((q) => q.slab === 3)) {
    // Under the roof slab: the part of the hole the sun sees through it.
    const y = T[3] - F.slab - 0.01, sh = F.slab / -d[1];
    const x0 = Math.max(h.core[0], h.core[0] + d[0] * sh), x1 = Math.min(h.core[1], h.core[1] + d[0] * sh);
    const z0 = Math.max(h.core[2], h.core[2] + d[2] * sh), z1 = Math.min(h.core[3], h.core[3] + d[2] * sh);
    const quad = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    if (clear(quad, T[2])) out.push({ quad, dir: d, length: (y - T[2]) / -d[1] + 0.3, from: 'roof hole' });
  }
  return out;
}

// The town round the lot: blocks on two rings, 40 to 86 m out, world units
// (seeded, the same every build). bandoSky draws them; buildBando makes each
// a collider, so they are as solid as they look.
export function bandoTown(s) {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const out = [];
  for (const [ring, n] of [[40, 14], [56, 18]]) {
    for (let i = 0; i < n; i++) {
      const a = (i + rnd() * 0.6) / n * Math.PI * 2, r = (ring + rnd() * 16) * s;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, w = (8 + rnd() * 12) * s, d = (8 + rnd() * 10) * s, h = (6 + rnd() * (ring > 50 ? 30 : 16)) * s;
      out.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h, far: ring > 50 });
    }
  }
  return out;
}
// The flying's bounds: walls 86 m out and a ceiling 72 m up, 3 m thick,
// unseen, inside the sky's dome (91 m, 74 m), so a pilot never flies out of
// the world.
const BANDO_BOUNDS = Object.freeze({ r: 86, h: 72, t: 3 });

// The sky round the Bando: an overcast dome as a box, brighter at the
// horizon; the ground beyond the lot's wall; the town round it, grey blocks
// in the haze, all inside the dome (40 to 86 m out; its walls 91 m). One
// unlit mesh, behind everything (world units).
function bandoSky(THREE, s) {
  const K = BANDO_LOOK.sky, pos = [], col = [];
  const quad = (a, b, c, d, cl) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); col.push(...(cl(p) || cl)); } };
  // Inside the camera's far plane (600) to the corners.
  const R = 320, Y = 260;
  // The far ground's haze, where the yard meets the dome's foot.
  const haze = K.yard.map((v, k) => v + (K.horizon[k] - v) * 0.6);
  const skyCol = (p) => {
    const u = Math.pow(Math.min(1, Math.max(0, p[1] / Y)), 0.55);
    if (p[1] < 0) return K.ground;
    if (p[1] < 60) return haze.map((v, k) => v + (K.horizon[k] - v) * (p[1] / 60));
    return K.horizon.map((v, k) => v + (K.zenith[k] - v) * u);
  };
  // The dome's box, its walls split at the horizon and up it.
  const ys = [-Y, 0, 20, 60, 150, Y];
  const sides = [[[-R, -R], [R, -R]], [[R, -R], [R, R]], [[R, R], [-R, R]], [[-R, R], [-R, -R]]];
  for (const [[ax, az], [bx, bz]] of sides) {
    for (let i = 0; i + 1 < ys.length; i++) quad([ax, ys[i], az], [bx, ys[i], bz], [bx, ys[i + 1], bz], [ax, ys[i + 1], az], skyCol);
  }
  quad([-R, Y, -R], [R, Y, -R], [R, Y, R], [-R, Y, R], () => K.zenith);
  quad([-R, -Y, -R], [-R, -Y, R], [R, -Y, R], [R, -Y, -R], () => K.ground);
  // The ground round the lot, out to the dome's foot, hazing out with distance.
  const L = BANDO_LOT, hx = L.w / 2 * s, hz = L.d / 2 * s, G = R, g = -0.03 * s;
  const yard = (p) => {
    const t = Math.min(1, Math.max(0, (Math.max(Math.abs(p[0]), Math.abs(p[2])) - hx) / (G - hx)));
    return K.yard.map((v, k) => v + (haze[k] - v) * t);
  };
  quad([-G, g, -G], [G, g, -G], [G, g, -hz], [-G, g, -hz], yard);
  quad([-G, g, hz], [G, g, hz], [G, g, G], [-G, g, G], yard);
  quad([-G, g, -hz], [-hx, g, -hz], [-hx, g, hz], [-G, g, hz], yard);
  quad([hx, g, -hz], [G, g, -hz], [G, g, hz], [hx, g, hz], yard);
  // The town: blocks on two rings, their faces shaded by facing, hazier far.
  for (const { x0, x1, z0, z1, h, far } of bandoTown(s)) {
    const haze = far ? 0.35 : 0.18;
    const shade = (f) => () => K.town.map((v, k) => (v * f) * (1 - haze) + K.horizon[k] * haze);
    quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], shade(0.95));
    quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], shade(0.8));
    quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], shade(0.88));
    quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], shade(0.85));
    quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], shade(1.05));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  // It writes depth, so the town's blocks hide each other right; drawn
  // first and farthest, everything else draws over it.
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  m.userData.looksSkip = true;
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'bandoSky';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.userData.artKeep = true;
  return mesh;
}

// A wall or a slab drawn whole (BANDO_PANELS): its two faces from the solid
// cells of its grid, its sides along the outline only, every vertex on the
// grid, so no T-junction opens a crack; uvs in tile units from world space,
// as lookBoxUv's. World units.
function bandoPanelMesh(THREE, pan, s, material) {
  const { frame, us, vs, cells } = pan, I = us.length - 1, J = vs.length - 1, t0 = pan.t0 * s, t1 = pan.t1 * s;
  const P = (u, v, t) => (frame === 'y' ? [u * s, t, v * s] : frame === 'z' ? [u * s, v * s, t] : [t, v * s, u * s]);
  const ax = frame === 'y' ? 1 : frame === 'z' ? 2 : 0;
  const tile = (material.userData.lookTile || 1) * s;
  const pos = [], nor = [], uv = [];
  const solid = (i, j) => i >= 0 && j >= 0 && i < I && j < J && cells[j * I + i] === 1;
  const quad = (q, n) => {
    // Wound to face n.
    const e1 = q[1].map((v, k) => v - q[0][k]), e2 = q[2].map((v, k) => v - q[0][k]);
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const o = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of o) {
      const p = q[k];
      pos.push(...p);
      nor.push(...n);
      if (Math.abs(n[0]) > 0.5) uv.push(p[2] / tile, p[1] / tile);
      else if (Math.abs(n[1]) > 0.5) uv.push(p[0] / tile, p[2] / tile);
      else uv.push(p[0] / tile, p[1] / tile);
    }
  };
  const N = (k, sg) => [0, 1, 2].map((i) => (i === k ? sg : 0));
  // The u and v axes in the scene.
  const au = frame === 'x' ? 2 : 0, av = frame === 'y' ? 2 : 1;
  for (let j = 0; j < J; j++) {
    for (let i = 0; i < I; i++) {
      if (!solid(i, j)) continue;
      const [a, b, c, d] = [[us[i], vs[j]], [us[i + 1], vs[j]], [us[i + 1], vs[j + 1]], [us[i], vs[j + 1]]];
      quad([P(...a, t1), P(...b, t1), P(...c, t1), P(...d, t1)], N(ax, 1));
      quad([P(...a, t0), P(...b, t0), P(...c, t0), P(...d, t0)], N(ax, -1));
      // Sides where the cell meets open (or the panel's edge).
      if (!solid(i, j - 1)) quad([P(us[i], vs[j], t0), P(us[i + 1], vs[j], t0), P(us[i + 1], vs[j], t1), P(us[i], vs[j], t1)], N(av, -1));
      if (!solid(i, j + 1)) quad([P(us[i], vs[j + 1], t0), P(us[i + 1], vs[j + 1], t0), P(us[i + 1], vs[j + 1], t1), P(us[i], vs[j + 1], t1)], N(av, 1));
      if (!solid(i - 1, j)) quad([P(us[i], vs[j], t0), P(us[i], vs[j + 1], t0), P(us[i], vs[j + 1], t1), P(us[i], vs[j], t1)], N(au, -1));
      if (!solid(i + 1, j)) quad([P(us[i + 1], vs[j], t0), P(us[i + 1], vs[j + 1], t0), P(us[i + 1], vs[j + 1], t1), P(us[i + 1], vs[j], t1)], N(au, 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function buildBando(THREE, parent, colliders) {
  const P = BANDO_PLAY, s = BANDO_WS, R = P.room, F = P.frame, Lk = BANDO_LOOK, S = Lk.surfaces;
  const hx = R.w * s / 2, hz = R.d * s / 2;
  const shelter = {
    min: [(F.x0 + 0.02) * s, -s, (F.z0 + 0.02) * s],
    max: [(F.x1 - 0.02) * s, (F.tops[3] - 0.02) * s, (F.z1 - 0.02) * s],
    fill: Lk.shelter.fill, ramp: Lk.shelter.ramp * s, soffit: Lk.shelter.soffit,
  };
  // Faces sit a hair behind their edge lines so the lines never z-fight.
  const mats = {};
  for (const [key, f] of Object.entries(S)) {
    const o = { extras: { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, fill: Lk.fill, albedoVar: f.albedoVar, shelter };
    if (key === 'concrete' || key === 'floor' || key === 'block') o.stains = { unit: s, storey: 3.5 };
    if (key === 'floor') o.joints = { origin: [-hx, -hz], unit: s, spec: Lk.joints };
    if (key === 'pallet') o.pallet = { unit: s, module: P.pallet };
    mats[key] = lookMaterial(THREE, f.look, f.color, o);
    mats[key].name = 'bando ' + f.type;
  }
  const tiled = (mesh) => lookBoxUv(mesh, mesh.material.userData.lookTile * s);
  const vis = new THREE.Group();
  vis.name = 'bandoArtVisuals';
  parent.add(vis);
  for (const r of P.boxes) {
    const a = r.min.map((v) => v * s), b = r.max.map((v) => v * s);
    if (r.draw === false || r.panel != null) {
      // A step of the fallen slab, a strip of a wall or a slab: it collides;
      // the slab and the panels are drawn whole.
      const bb = new THREE.Box3(new THREE.Vector3(...a), new THREE.Vector3(...b));
      bb._tag = 'map';
      colliders.push(bb);
      continue;
    }
    const mesh = box(THREE, vis, colliders, (a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2,
      b[0] - a[0], b[1] - a[1], b[2] - a[2], mats[r.mat]);
    mesh.name = 'bando_' + r.mat;
    if (r.round) {
      // Round to look at (rebar, the tree, the van's wheels); the collider
      // box() took stays the box.
      const w = b[0] - a[0], h = b[1] - a[1], d = b[2] - a[2];
      mesh.geometry.dispose();
      if (r.round === 'z') mesh.geometry = new THREE.CylinderGeometry(Math.min(w, h) / 2, Math.min(w, h) / 2, d, 18).rotateX(Math.PI / 2);
      else mesh.geometry = new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, h, 10);
      continue;
    }
    tiled(mesh);
  }
  // The walls and slabs, each one mesh on its cell grid: no seam between
  // its strips (they meet in T-junctions), no face inside it.
  for (const pan of P.panels) {
    const mesh = bandoPanelMesh(THREE, pan, s, mats[pan.mat]);
    mesh.name = 'bando_' + pan.mat;
    vis.add(mesh);
  }
  // The fallen slab, drawn whole at 30°: its underside from the foot on the
  // ground to the east wall; uvs laid before it tilts.
  const L = P.lean, ang = L.angle * Math.PI / 180, len = (L.x1 - L.xf) / Math.cos(ang);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(len * s, L.t * s, (L.z1 - L.z0) * s), mats.concrete);
  const bx = (L.xf + L.x1) / 2 - Math.sin(ang) * L.t / 2, by = L.top / 2 + Math.cos(ang) * L.t / 2, bz = (L.z0 + L.z1) / 2;
  slab.position.set(bx * s, by * s, bz * s);
  tiled(slab);
  slab.rotation.z = ang;
  slab.castShadow = slab.receiveShadow = true;
  slab.name = 'bando_leaning_slab';
  vis.add(slab);
  const edges = P.edges.map((v) => v * s);
  slab.updateMatrixWorld(true);
  const se = new THREE.EdgesGeometry(slab.geometry).applyMatrix4(slab.matrixWorld).getAttribute('position');
  for (let i = 0; i < se.count; i++) edges.push(se.getX(i), se.getY(i), se.getZ(i));
  // The ground: the lot's concrete, one patch, its AO from everything low.
  const ao = lookAoTexture(THREE, floorAo(P.boxes.filter((q) => q.max[1] <= 3.6), R, { texel: 0.1 }));
  const floor = lookFloorPatch(THREE, mats.floor, R, s, { x0: -R.w / 2, x1: R.w / 2, z0: -R.d / 2, z1: R.d / 2 }, ao);
  floor.name = 'bando floor';
  vis.add(floor);
  // Shell: the lot's block wall, outside the lot, 2.4 m.
  const lw = P.lot.wall * s, t = 0.3 * s;
  for (const [x0, x1, z0, z1] of [[-hx - t, hx + t, -hz - t, -hz], [-hx - t, hx + t, hz, hz + t], [-hx - t, -hx, -hz, hz], [hx, hx + t, -hz, hz]]) {
    const mesh = box(THREE, vis, colliders, (x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, lw, z1 - z0, mats.block);
    mesh.name = 'bando_lot_wall';
    tiled(mesh);
  }
  edges.push(-hx, lw, -hz, hx, lw, -hz, hx, lw, -hz, hx, lw, hz, hx, lw, hz, -hx, lw, hz, -hx, lw, hz, -hx, lw, -hz);
  // The sun shafts; the graffiti; the sky.
  const shafts = lookShafts(THREE, bandoShafts().map((q) => ({ quad: q.quad.map((p) => p.map((v) => v * s)), dir: q.dir, length: q.length * s })), { name: 'bandoShafts' });
  vis.add(shafts);
  const paint = lookGraffiti(THREE, Lk.graffiti.map((g) => Object.assign({}, g, { c: g.c.map((v) => v * s), w: g.w * s, h: g.h * s })), { fill: Lk.fill, shelter, unit: s, name: 'bandoGraffiti' });
  vis.add(paint);
  vis.add(bandoSky(THREE, s));
  // The town's blocks collide; the flying's bounds, unseen, inside the sky.
  const solid = (x0, y0, z0, x1, y1, z1) => {
    const bb = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    bb._tag = 'map';
    colliders.push(bb);
  };
  for (const q of bandoTown(s)) solid(q.x0, 0, q.z0, q.x1, q.h, q.z1);
  const Bd = BANDO_BOUNDS, br = Bd.r * s, bt = Bd.t * s, bh = Bd.h * s;
  for (const [x0, x1, z0, z1] of [[-br - bt, br + bt, -br - bt, -br], [-br - bt, br + bt, br, br + bt], [-br - bt, -br, -br, br], [br, br + bt, -br, br]]) solid(x0, 0, z0, x1, bh + bt, z1);
  solid(-br - bt, bh, -br - bt, br + bt, bh + bt, br + bt);
  // The edge lines at the look's 60%, bloomed (sim-look.js lookLines).
  const lines = lookLines(THREE, edges);
  lines.name = 'bandoEdges';
  lines.userData.artKeep = true;
  vis.add(lines);
  return { floor, orbit: MAP_ORBIT.bando };
}

const BUILDERS = {
  rig: buildRig,
  house: buildHouse,
  depot: buildDepot,
  bando: buildBando,
  living: buildLiving,
  garage: buildGarage,
  warehouse: buildWarehouse,
  backyard: buildBackyard,
  office: buildOffice,
  gym: buildGym,
  trainer: buildTrainer,
  room: buildRoom,
};

// ---- Authored gaps (the trick detector's Gap) ----
//
// Every intentional gap of the Rig, the House, the Warehouse (depot), the
// Bando and the archived Warehouse (warehouse) as a volume
// the quad passes through: scene units, axis-aligned, and the axis it is
// flown along ('x', 'y' or 'z'). A pass enters through one of the two faces
// across that axis and leaves through the other (sim-tricks.js). Each volume
// is the opening itself, between the boxes that make it, from the map's own
// numbers above.
function gapVolume(map, name, axis, s, x0, y0, z0, x1, y1, z1) {
  const r = (v) => Math.round(v * s * 1e4) / 1e4;
  return Object.freeze({
    map, name, axis,
    min: Object.freeze({ x: r(x0), y: r(y0), z: r(z0) }),
    max: Object.freeze({ x: r(x1), y: r(y1), z: r(z1) }),
  });
}
function rigGaps() {
  const s = RIG_WS, out = [];
  // Crate slots: on x = 9, through each 0.4 m wall of crates along z.
  [[-1.0, 0.25], [-0.2, 0.21], [0.6, 0.18]].forEach(([z, g], w) => {
    out.push(gapVolume('rig', `crate slot ${w + 1} (${Math.round(g * 100)} cm)`, 'z', s, 9 - g / 2, 0, z, 9 + g / 2, 2.0, z + 0.4));
  });
  // Tunnel: the 30 cm bore, 4 m along x.
  out.push(gapVolume('rig', 'tunnel', 'x', s, 0.05, 1.05, 5.45, 4.05, 1.35, 5.75));
  // Pipe slits: the 20 cm between the seven pipes of the run, down through it
  // (the dive takes the one on the drop plane), and between the risers, along z.
  for (let k = 0; k < 6; k++) {
    const x0 = -10 + 0.35 * k + 0.15, x1 = -10 + 0.35 * (k + 1);
    out.push(gapVolume('rig', `pipe slit ${k + 1}`, 'y', s, x0, 4.8, -7.5, x1, 4.95, 3.2));
    out.push(gapVolume('rig', `riser slit ${k + 1}`, 'z', s, x0, 0, 3.2, x1, 4.8, 3.35));
  }
  // Loft hole: 1.0 x 1.8 m through the 10 cm slab, down or up.
  out.push(gapVolume('rig', 'loft hole', 'y', s, RIG_DROP - 0.5, 2.7, -3.75, RIG_DROP + 0.5, 2.8, -1.95));
  return out;
}
function houseGaps() {
  const s = HOUSE_WS;
  return [
    // The bookshelf's middle bay, 0.9 to 1.68 m, through the shelf along z.
    gapVolume('house', 'bookshelf gap', 'z', s, -1.2, 0.9, 1.45, -0.6, 1.68, 1.8),
    // Under the patio table, between its legs, either way.
    gapVolume('house', 'under the patio table (along z)', 'z', s, -7.99, 0, -0.85, -7.21, 0.69, 0.05),
    gapVolume('house', 'under the patio table (along x)', 'x', s, -8.05, 0, -0.79, -7.15, 0.69, -0.01),
  ];
}
function warehouseGaps() {
  const P = WAREHOUSE_PLAY, out = [];
  // Rack shelves: each level of each rack, floor to the first shelf and
  // shelf to shelf, flown across the rack (along x) between its end posts.
  const half = P.shelfH / 2;
  const levels = [[0, P.shelfYs[0] - half]];
  for (let i = 0; i + 1 < P.shelfYs.length; i++) levels.push([P.shelfYs[i] + half, P.shelfYs[i + 1] - half]);
  for (const z of P.rackZs) {
    for (const x of P.rackXs) {
      levels.forEach(([y0, y1], i) => {
        out.push(gapVolume('warehouse', `rack ${x},${z} level ${i}`, 'x', 1,
          x - P.shelfW / 2, y0, z - P.postOffZ + P.post / 2, x + P.shelfW / 2, y1, z + P.postOffZ - P.post / 2));
      });
    }
  }
  // The gap: between the two orange blocks, along z.
  const gl = P.gap.left, gr = P.gap.right;
  out.push(gapVolume('warehouse', 'the gap', 'z', 1, gl.x + gl.w / 2, 0, gl.z - gl.d / 2, gr.x - gr.w / 2, gl.h, gl.z + gl.d / 2));
  // The Ion hoop: its inner opening, along z.
  const ion = P.ion;
  out.push(gapVolume('warehouse', 'ion hoop', 'z', 1, ion.x - ion.innerW / 2, ion.y - ion.innerH / 2, ion.z - ion.depth / 2,
    ion.x + ion.innerW / 2, ion.y + ion.innerH / 2, ion.z + ion.depth / 2));
  return out;
}
// The Warehouse's (depot): the Loop's gaps and every one of its new
// obstacles' (the second aisle's crossing gap, the cable trays, the
// container, the scissor lift, the cargo net, the tyres), each from its
// numbers above. Its pallet stacks and the mezzanine's open rail ends are
// left to the generic rule, as the Bando's pallets.
function depotGaps() {
  const s = DEPOT_WS, out = [];
  const g = (name, axis, x0, y0, z0, x1, y1, z1) => out.push(gapVolume('depot', name, axis, s, x0, y0, z0, x1, y1, z1));
  // The Loop's. The roll-up doors, under each half-open curtain through the
  // dock partition, along x.
  const D = DEPOT_DOCK, hw = D.doorW / 2;
  for (const z of D.doors) g(`roll-up door, z ${z}`, 'x', D.x, 0, z - hw, D.x + D.t, D.open, z + hw);
  // The chain curtain's parting: between the strands either side of it, floor
  // to header, along z.
  const C = DEPOT_CURTAIN, strands = [];
  for (let x = D.x + D.t + 0.2; x < 22.5 - 0.15; x += C.pitch) if (Math.abs(x - C.x) >= C.gap / 2 + 0.03) strands.push(x);
  const sw = Math.max(...strands.filter((x) => x < C.x)), se = Math.min(...strands.filter((x) => x > C.x));
  g('chain curtain parting', 'z', sw + 0.03, 0, C.z - 0.03, se - 0.03, C.y, C.z + 0.03);
  // Under the forklift's raised load: the forks' length, the load's width,
  // floor to forks, along x.
  g('under the forks', 'x', 9.0 - 0.6, 0, -4.5, 9.0 + 0.6, 2.04, -3.38);
  // The racking's 60 cm gaps, over the lowered floor loads (1.08 m) to the
  // first beams, between a bay's uprights, through the run along z: the
  // Loop's through run B, the crossing gap's through run C and run B.
  const K = DEPOT_RACK, bayX = (k) => K.x0 + K.bay * k;
  const rack = (name, k, z0, z1) => g(name, 'z', bayX(k) + K.post, 1.08, z0, bayX(k + 1), K.levels[0] - 0.12, z1);
  rack('rack gap', K.gapBay, K.frames[1][0], K.frames[2][1]);
  rack('crossing gap, run C', K.crossBay, K.runC[0], K.runC[1]);
  rack('crossing gap, run B', K.crossBay, K.frames[1][0], K.frames[2][1]);
  // Each truss's 60 cm web gap on the line's z, between two posts and the
  // chords, along x (the Loop flies two of them).
  const T = DEPOT_TRUSS, tg = T.pitch / 2 - T.post / 2;
  for (const x of T.xs) g(`truss gap, x ${x}`, 'x', x - 0.06, T.y0 + T.chord, T.gapZ - tg, x + 0.06, T.y1 - T.chord, T.gapZ + tg);
  // The mezzanine's drop-through hatch, through the deck, down or up.
  const M = DEPOT_MEZZ, H = M.hatch;
  g('the hatch', 'y', H.x0, M.y - 0.25, H.z0, H.x1, M.y, H.z1);
  // The new obstacles'. The cable trays: down through the 40 cm between two
  // trays, along their length; along over them under a truss's bottom chord,
  // between the trapeze's rods.
  const Y = DEPOT_TRAYS, yz0 = Y.zs[0] - 0.06, yz1 = Y.zs[Y.zs.length - 1] + Y.w + 0.06;
  for (let i = 0; i + 1 < Y.zs.length; i++) {
    const z0 = Y.zs[i] + Y.w, z1 = Y.zs[i + 1];
    g(`between the cable trays, z ${Math.round((z0 + z1) / 2 * 100) / 100}`, 'y', Y.x0, Y.y0, z0, Y.x1, Y.y1, z1);
  }
  for (const x of T.xs.filter((q) => q > Y.x0 && q < Y.x1)) {
    g(`under the truss over the cable trays, x ${x}`, 'x', x - 0.06, Y.y1, yz0 + 0.06, x + 0.06, T.y0, yz1 - 0.06);
  }
  // Through the container, end to end: between its corner posts, its floor
  // to the headers over its doors.
  const CT = DEPOT_CONTAINER;
  g('through the container', 'x', CT.x0, 0.15, CT.z0 + CT.post, CT.x1, CT.header, CT.z1 - CT.post);
  // The scissor lift's diamond between its two stages, across the lift: the
  // biggest box clear of every arm step, two steps (42 cm) either side of
  // the lift's middle along z, from the top of the lower stage's highest arm
  // step there to the bottom of the upper stage's lowest.
  const F = DEPOT_LIFT, za = F.z0 + 0.1, fz = (F.z1 - 0.1 - za) / F.steps, fy = F.stage / F.steps, hb = 0.14, half = F.steps / 2, w = 2;
  g('through the scissors', 'x', F.x0, F.base + fy * (half - 1 + w) + hb, za + fz * (half - w), F.x1, F.base + F.stage + fy * (half - w), za + fz * (half + w));
  // The cargo net's hole, inside the ropes round it, down or up through it.
  const N = DEPOT_NET, NH = N.hole, rr = 0.03;
  g('cargo net hole', 'y', NH.x0 + rr, N.y, NH.z0 + rr, NH.x1 - rr, N.y + 0.06, NH.z1 - rr);
  // Every tyre's bore, through the stack along z.
  const W = DEPOT_TYRES, wr = W.d / 2, wi = W.bore / 2;
  const rows = ['bottom row', 'middle row', 'top'], at = [['west', 'middle', 'east'], ['west', 'east'], ['']];
  for (let row = 0; row < W.rows; row++) {
    for (let k = 0; k < W.rows - row; k++) {
      const cx = W.x0 + wr * (row + 1) + W.d * k, cy = wr + W.d * row;
      g(['tyre bore', rows[row], at[row][k]].filter(Boolean).join(', '), 'z', cx - wi, cy - wi, W.z0, cx + wi, cy + wi, W.z1);
    }
  }
  return out;
}
const MAP_GAPS = Object.freeze({
  rig: Object.freeze(rigGaps()),
  house: Object.freeze(houseGaps()),
  depot: Object.freeze(depotGaps()),
  bando: Object.freeze(bandoGaps()),
  warehouse: Object.freeze(warehouseGaps()),
});
// A map's authored gap volumes (empty where it has none).
export function mapGaps(mapId) {
  return MAP_GAPS[mapId] || Object.freeze([]);
}

export function buildMap(THREE, mapId, opts) {
  const group = new THREE.Group();
  group.name = 'map_' + mapId;
  const colliders = [];
  const lights = [];
  const builder = BUILDERS[mapId];
  if (!builder) return { group, colliders, lights, floor: null, orbit: MAP_ORBIT.city, mapId, gaps: mapGaps(mapId) };
  const extra = mapId === 'room'
    ? builder(THREE, group, colliders, lights, opts && opts.room)
    : (builder(THREE, group, colliders, lights) || {});
  return {
    group, colliders, lights,
    floor: extra.floor || null,
    orbit: extra.orbit || MAP_ORBIT[mapId] || MAP_ORBIT.city,
    mapId,
    plan: extra.plan || null,
    gaps: mapGaps(mapId),
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
