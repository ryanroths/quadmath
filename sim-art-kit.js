// Kenney CC0 city + garage + warehouse + office kits. Visual only.
// Meshopt-compressed files live under assets/sim-city/, assets/sim-garage/,
// assets/sim-warehouse/, and assets/sim-office/. If a load fails, the
// procedural meshes already in the scene stay visible. Nothing from the GPL whoop sim.

import { hexNum, CAR_TYPES, carHeading } from './sim-art-city.js?v=d290c9ab2bdb';

const KIT_ROOT = 'assets/sim-city/';

export const CITY_KIT_CARS = Object.freeze({
  sedan: { file: 'sedan.glb', bytes: 13308, length: 4.2 },
  hatch: { file: 'hatch.glb', bytes: 13812, length: 3.9 },
  van: { file: 'van.glb', bytes: 13544, length: 4.6 },
  taxi: { file: 'taxi.glb', bytes: 13640, length: 4.2 },
});

export const CITY_KIT_PROPS = Object.freeze({
  buildingA: { file: 'building-a.glb', bytes: 3256, height: 5.4 },
  buildingC: { file: 'building-c.glb', bytes: 2988, height: 4.8 },
  buildingWide: { file: 'building-wide.glb', bytes: 3028, height: 4.6 },
  awning: { file: 'awning.glb', bytes: 2176, width: 3.1 },
  dumpster: { file: 'dumpster.glb', bytes: 3452, height: 1.15 },
  traffic: { file: 'traffic-light.glb', bytes: 3348, height: 4.4 },
  streetSign: { file: 'street-sign.glb', bytes: 2892, height: 3.2 },
  stopSign: { file: 'stop-sign.glb', bytes: 2620, height: 2.8 },
  lamp: { file: 'street-lamp.glb', bytes: 2468, height: 5.6 },
});

const CAR_BYTES = Object.values(CITY_KIT_CARS).reduce((n, e) => n + e.bytes, 0);
const PROP_BYTES = Object.values(CITY_KIT_PROPS).reduce((n, e) => n + e.bytes, 0);

export function kitBytesForQuality(quality) {
  return quality === 'low' ? CAR_BYTES : CAR_BYTES + PROP_BYTES;
}

function skipMat(m) {
  if (!m) return m;
  m.userData.looksSkip = true;
  m.userData.artLocked = true;
  return m;
}

function neonMat(THREE, color, emit, extra) {
  return skipMat(new THREE.MeshStandardMaterial(Object.assign({
    color, emissive: color, emissiveIntensity: emit == null ? 2.4 : emit,
    roughness: 0.42, metalness: 0.08,
    envMapIntensity: 0,
  }, extra || {})));
}

function carMat(THREE, pal) {
  // Same unlit paint as the procedural cars. MeshStandard + dawn IBL is what
  // turned Kenney instances into translucent blue glass after first paint.
  return skipMat(new THREE.MeshBasicMaterial({
    color: pal.body,
    transparent: false,
    opacity: 1,
  }));
}

function carPalette(type, vibe) {
  const win = vibe && vibe.palette ? hexNum(vibe.palette.windowAlt) : 0x4ad4e8;
  if (type === 'taxi') {
    return { body: 0xffc43a, emit: 0xfff3a0, glow: 2.8 };
  }
  if (type === 'van') {
    return { body: 0x1a2438, emit: hexNum(vibe.palette.neonB), glow: 2.2 };
  }
  if (type === 'hatch') {
    return { body: 0x3a1030, emit: hexNum(vibe.palette.neonA), glow: 2.4 };
  }
  return { body: 0x24142e, emit: win, glow: 1.8 };
}

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function mergeScene(THREE, scene) {
  // Kenney meshopt GLBs store POSITION as quantized uint16. Baking
  // matrixWorld on that typed array truncates Y/Z to 0, so copy to
  // float first, then apply the node transform.
  scene.updateMatrixWorld(true);
  const pos = [], nor = [];
  const v = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const nrmMat = new THREE.Matrix3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const p = src.getAttribute('position');
    if (!p) {
      if (src !== o.geometry) src.dispose();
      return;
    }
    const n = src.getAttribute('normal');
    nrmMat.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
      if (n) {
        nrm.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(nrmMat).normalize();
        nor.push(nrm.x, nrm.y, nrm.z);
      } else nor.push(0, 1, 0);
    }
    if (src !== o.geometry) src.dispose();
  });
  if (!pos.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

function fitGeo(THREE, geo, opts) {
  if (!geo) return null;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  if (opts.forward === 'z' || (opts.autoForward && size.z > size.x * 1.08)) {
    geo.rotateY(Math.PI / 2);
    geo.computeBoundingBox();
    bb.copy(geo.boundingBox);
    bb.getSize(size);
  }
  let s = 1;
  if (opts.length) s = opts.length / Math.max(size.x, 0.05);
  else if (opts.height) s = opts.height / Math.max(size.y, 0.05);
  else if (opts.width) s = opts.width / Math.max(size.x, 0.05);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(
    -0.5 * (b.min.x + b.max.x),
    -b.min.y,
    -0.5 * (b.min.z + b.max.z),
  );
  geo.computeBoundingBox();
  const ok = geo.boundingBox.getSize(new THREE.Vector3());
  if (ok.x < 0.35 || ok.y < 0.25 || ok.z < 0.35) return null;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function addInstanced(THREE, parent, geo, mat, count, place) {
  if (!geo || count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.artInstanced = true;
  mesh.userData.cityKit = true;
  const dummy = new THREE.Object3D();
  let written = 0;
  for (let i = 0; i < count; i++) {
    if (place(dummy, i) === false) continue;
    dummy.updateMatrix();
    mesh.setMatrixAt(written, dummy.matrix);
    written++;
  }
  mesh.count = written;
  if (!written) {
    mesh.dispose();
    return null;
  }
  parent.add(mesh);
  return mesh;
}

function hideTagged(root, key) {
  let n = 0;
  root.traverse((o) => {
    if (o.userData && o.userData[key]) {
      o.visible = false;
      n++;
    }
  });
  return n;
}

function findProcCar(root, type) {
  let found = null;
  root.traverse((o) => {
    if (found) return;
    if (o.userData && o.userData.cityProcCar && o.userData.carType === type) found = o;
  });
  return found;
}

let dressGen = 0;
const geoCache = new Map();

async function geoFor(THREE, loader, entry, root) {
  const url = (root || KIT_ROOT) + entry.file;
  if (geoCache.has(url)) return geoCache.get(url);
  const gltf = await loadGltf(loader, url);
  const merged = mergeScene(THREE, gltf.scene);
  const fitted = fitGeo(THREE, merged, entry);
  geoCache.set(url, fitted);
  return fitted;
}

async function instanceProp(THREE, kitGroup, loader, spec, list, mat, place, root) {
  if (!list || !list.length || !spec) return 0;
  const geo = await geoFor(THREE, loader, spec, root);
  if (!geo) return 0;
  const mesh = addInstanced(THREE, kitGroup, geo, mat, list.length, place);
  return mesh ? spec.bytes : 0;
}

export async function tryDressCityKit(THREE, ctx) {
  const group = ctx && ctx.group;
  const loader = ctx && ctx.loader;
  const vibe = ctx && ctx.vibe;
  const quality = (ctx && ctx.quality) || 'med';
  if (!THREE || !group || !loader || !vibe) return { used: false, bytes: 0 };
  const gen = ++dressGen;
  const old = group.getObjectByName('cityArtKit');
  if (old && old.parent) old.parent.remove(old);
  const kitGroup = new THREE.Group();
  kitGroup.name = 'cityArtKit';
  const planned = group.userData && group.userData.planned;
  const wantProps = quality === 'med' || quality === 'high';
  const hideKeys = [];
  let bytes = 0;
  try {
    const byType = { sedan: [], hatch: [], van: [], taxi: [] };
    const cars = (planned && planned.cars) || [];
    cars.forEach((p, i) => {
      if (!p) return;
      const type = p.type && CITY_KIT_CARS[p.type] ? p.type : CAR_TYPES[i % 4];
      byType[type].push(p);
    });
    const maxPer = quality === 'low' ? 14 : quality === 'high' ? 99 : 28;
    for (const type of CAR_TYPES) {
      const spec = CITY_KIT_CARS[type];
      const list = byType[type].slice(0, maxPer);
      if (!list.length) continue;
      const geo = await geoFor(THREE, loader, Object.assign({ autoForward: true }, spec));
      if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
      if (!geo) continue;
      const pal = carPalette(type, vibe);
      const mat = carMat(THREE, pal);
      const mesh = addInstanced(THREE, kitGroup, geo, mat, list.length, (d, i) => {
        const p = list[i];
        if (!p) return false;
        d.position.set(p.x, 0, p.z);
        d.rotation.set(0, carHeading(p), 0);
        d.scale.set(1, 1, 1);
      });
      if (!mesh) continue;
      bytes += spec.bytes;
      mesh.userData.carType = type;
      const proc = findProcCar(group, type);
      if (proc) {
        hideKeys.push(proc);
        if (quality !== 'low' && proc.userData.cityCruise) {
          mesh.userData.cityCruise = true;
          mesh.userData.dummy = new THREE.Object3D();
          mesh.userData.homes = (proc.userData.homes || []).slice(0, mesh.count);
        }
      }
    }

    if (wantProps && planned) {
      const placeAt = (list) => (d, i) => {
        const p = list[i];
        if (!p) return false;
        d.position.set(p.x, 0, p.z);
        d.rotation.set(0, p.ry || 0, 0);
        d.scale.set(1, 1, 1);
      };
      try {
        const buildings = [
          CITY_KIT_PROPS.buildingA,
          CITY_KIT_PROPS.buildingC,
          CITY_KIT_PROPS.buildingWide,
        ];
        const kiosks = planned.kiosks || [];
        let built = 0;
        for (let b = 0; b < buildings.length; b++) {
          const spec = buildings[b];
          const list = kiosks.filter((_, i) => i % buildings.length === b);
          if (!list.length) continue;
          const n = await instanceProp(THREE, kitGroup, loader, spec, list, neonMat(THREE, hexNum(vibe.palette.facade), 0.55, {
            color: hexNum(vibe.palette.facadeAlt),
            emissive: hexNum(vibe.palette.windowOn),
            roughness: 0.5,
          }), placeAt(list));
          if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
          if (n) { bytes += n; built += 1; }
        }
        if (built) hideKeys.push('cityProcKiosk');
      } catch (e) { /* keep cars; skip this prop family */ }

      try {
        if (planned.awnings && planned.awnings.length) {
          const n = await instanceProp(THREE, kitGroup, loader, CITY_KIT_PROPS.awning, planned.awnings,
            neonMat(THREE, hexNum(vibe.palette.neonC), 0.55), placeAt(planned.awnings));
          if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
          if (n) { bytes += n; hideKeys.push('cityProcAwning'); }
        }
      } catch (e) { /* skip */ }

      try {
        if (planned.bins && planned.bins.length) {
          const n = await instanceProp(THREE, kitGroup, loader, CITY_KIT_PROPS.dumpster, planned.bins,
            neonMat(THREE, 0x2a3440, 0.32, { emissive: hexNum(vibe.palette.neonC), emissiveIntensity: 0.28 }),
            placeAt(planned.bins));
          if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
          if (n) { bytes += n; hideKeys.push('cityProcBin'); }
        }
      } catch (e) { /* skip */ }

      try {
        const signs = planned.lowSigns || [];
        if (signs.length) {
          const street = signs.filter((_, i) => i % 2 === 0);
          const stop = signs.filter((_, i) => i % 2 === 1);
          let n = 0;
          if (street.length) {
            n += await instanceProp(THREE, kitGroup, loader, CITY_KIT_PROPS.streetSign, street,
              neonMat(THREE, hexNum(vibe.palette.neonA), 0.32), placeAt(street));
          }
          if (stop.length) {
            n += await instanceProp(THREE, kitGroup, loader, CITY_KIT_PROPS.stopSign, stop,
              neonMat(THREE, 0xff3344, 0.34, { color: 0x1a1014, emissive: 0xff3344 }), placeAt(stop));
          }
          if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
          if (n) { bytes += n; hideKeys.push('cityProcLowSign'); }
        }
      } catch (e) { /* skip */ }

      try {
        if (planned.traffic && planned.traffic.length) {
          const n = await instanceProp(THREE, kitGroup, loader, CITY_KIT_PROPS.traffic, planned.traffic,
            neonMat(THREE, 0x1a1c20, 0.38, { emissive: 0xffcc44, emissiveIntensity: 0.38, color: 0x1a1c20 }),
            placeAt(planned.traffic));
          if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
          if (n) { bytes += n; hideKeys.push('cityProcTraffic'); }
        }
      } catch (e) { /* skip */ }

      try {
        const lamps = (planned.lamps || []).slice(0, quality === 'high' ? 96 : 48);
        if (lamps.length) {
          const n = await instanceProp(THREE, kitGroup, loader, CITY_KIT_PROPS.lamp, lamps,
            neonMat(THREE, hexNum(vibe.palette.neonC), 0.38, { color: 0x1a1420, emissive: hexNum(vibe.palette.neonC) }),
            placeAt(lamps));
          if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
          if (n) { bytes += n; hideKeys.push('cityProcLamp'); }
        }
      } catch (e) { /* skip */ }
    }

    if (gen !== dressGen) return { used: false, stale: true, bytes: 0 };
    if (!kitGroup.children.length) return { used: false, bytes: 0 };
    for (const key of hideKeys) {
      if (typeof key === 'string') hideTagged(group, key);
      else if (key) key.visible = false;
    }
    group.add(kitGroup);
    return { used: true, bytes, quality };
  } catch (err) {
    try { if (kitGroup.parent) kitGroup.parent.remove(kitGroup); } catch (e) { /* ignore */ }
    return { used: false, bytes: 0, error: String(err && err.message || err) };
  }
}

const GARAGE_ROOT = 'assets/sim-garage/';

export const GARAGE_KIT_CORE = Object.freeze({
  chest: { file: 'chest.glb', bytes: 8452, height: 2.85 },
  crate: { file: 'crate.glb', bytes: 3708, height: 0.88 },
});

// Cabinet mesh. Kept on disk / licensed, not instanced — the flyable bench
// is an open-legged procedural table (legs + top).
export const GARAGE_KIT_SKIP = Object.freeze({
  bench: { file: 'workbench.glb', bytes: 5224, height: 2.15 },
});

export const GARAGE_KIT_EXTRA = Object.freeze({
  toolbox: { file: 'toolbox.glb', bytes: 4460, height: 1.05 },
  cardboard: { file: 'cardboard.glb', bytes: 2792, height: 0.62 },
  tire: { file: 'tire.glb', bytes: 5080, height: 0.68 },
  sedan: { file: 'sedan.glb', bytes: 14224, length: 7.4, autoForward: true },
  barrel: { file: 'barrel.glb', bytes: 5116, height: 0.98 },
  barrier: { file: 'barrier.glb', bytes: 2072, height: 0.82 },
});

const GARAGE_CORE_BYTES = Object.values(GARAGE_KIT_CORE).reduce((n, e) => n + e.bytes, 0);
const GARAGE_EXTRA_BYTES = Object.values(GARAGE_KIT_EXTRA).reduce((n, e) => n + e.bytes, 0);

export function garageKitBytesForQuality(quality) {
  return quality === 'low' ? GARAGE_CORE_BYTES : GARAGE_CORE_BYTES + GARAGE_EXTRA_BYTES;
}

function placeAt(list) {
  return (d, i) => {
    const p = list[i];
    if (!p) return false;
    d.position.set(p.x, p.y || 0, p.z);
    d.rotation.set(0, p.ry || 0, 0);
    d.scale.set(1, 1, 1);
  };
}

function garageMat(THREE, vibe, kind) {
  // Same #230 lesson as city cars: MeshStandard + dawn IBL turns Kenney
  // instances blue/glassy once scene.environment lands. Indoor maps keep IBL.
  const pal = vibe && vibe.palette ? vibe.palette : {};
  let color = hexNum(pal.neonA || '#ffb347');
  if (kind === 'bench') color = hexNum('#3d4654');
  else if (kind === 'chest') color = hexNum(pal.neonC || '#c45a22');
  else if (kind === 'crate') color = hexNum('#4a3224');
  else if (kind === 'shelf') color = hexNum(pal.facadeAlt || '#2a3038');
  else if (kind === 'toolbox') color = hexNum(pal.neonA || '#ffb347');
  else if (kind === 'cardboard') color = hexNum('#6a5340');
  else if (kind === 'tire') color = 0x141414;
  else if (kind === 'sedan') color = hexNum('#1a2430');
  else if (kind === 'barrel') color = hexNum(pal.neonC || '#c45a22');
  return skipMat(new THREE.MeshBasicMaterial({
    color,
    transparent: false,
    opacity: 1,
  }));
}

let garageDressGen = 0;

export async function tryDressGarageKit(THREE, ctx) {
  const group = ctx && ctx.group;
  const loader = ctx && ctx.loader;
  const vibe = ctx && ctx.vibe;
  const quality = (ctx && ctx.quality) || 'med';
  if (!THREE || !group || !loader || !vibe) return { used: false, bytes: 0 };
  const gen = ++garageDressGen;
  const old = group.getObjectByName('garageArtKit');
  if (old && old.parent) old.parent.remove(old);
  const kitGroup = new THREE.Group();
  kitGroup.name = 'garageArtKit';
  const planned = (group.userData && group.userData.planned) || {};
  const wantExtra = quality === 'med' || quality === 'high';
  const hideKeys = [];
  let bytes = 0;
  const root = GARAGE_ROOT;
  try {
    const one = async (spec, list, kind, hide) => {
      if (!list || !list.length || !spec) return 0;
      const n = await instanceProp(THREE, kitGroup, loader, spec, list, garageMat(THREE, vibe, kind), placeAt(list), root);
      if (n && hide) hideKeys.push(hide);
      return n;
    };
    try {
      const n = await one(GARAGE_KIT_CORE.chest, planned.chest, 'chest', 'garageProcChest');
      if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
      bytes += n;
    } catch (e) { /* keep proc chest */ }
    try {
      const crates = (planned.crates || []).slice(0, quality === 'low' ? 6 : 12);
      const n = await one(GARAGE_KIT_CORE.crate, crates, 'crate', null);
      if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
      bytes += n;
    } catch (e) { /* skip crates */ }

    if (wantExtra) {
      try {
        const n = await one(GARAGE_KIT_EXTRA.toolbox, planned.toolboxes, 'toolbox', null);
        if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
      try {
        const n = await one(GARAGE_KIT_EXTRA.cardboard, planned.cardboard, 'cardboard', null);
        if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
      try {
        const tires = (planned.tires || []).slice(0, quality === 'high' ? 12 : 8);
        const n = await one(GARAGE_KIT_EXTRA.tire, tires, 'tire', 'garageProcTire');
        if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* keep proc tires */ }
      try {
        const n = await one(GARAGE_KIT_EXTRA.sedan, planned.car, 'sedan', 'garageProcCar');
        if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* keep wedge car */ }
      try {
        const n = await one(GARAGE_KIT_EXTRA.barrel, planned.barrels, 'barrel', null);
        if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
      try {
        const n = await one(GARAGE_KIT_EXTRA.barrier, planned.barriers, 'barrier', null);
        if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
    }

    if (gen !== garageDressGen) return { used: false, stale: true, bytes: 0 };
    if (!kitGroup.children.length) return { used: false, bytes: 0 };
    for (const key of hideKeys) hideTagged(group, key);
    group.add(kitGroup);
    return { used: true, bytes, quality };
  } catch (err) {
    try { if (kitGroup.parent) kitGroup.parent.remove(kitGroup); } catch (e) { /* ignore */ }
    return { used: false, bytes: 0, error: String(err && err.message || err) };
  }
}

const WAREHOUSE_ROOT = 'assets/sim-warehouse/';

export const WAREHOUSE_KIT_CORE = Object.freeze({
  crate: { file: 'crate.glb', bytes: 3708, height: 0.88 },
});

export const WAREHOUSE_KIT_EXTRA = Object.freeze({
  barrel: { file: 'barrel.glb', bytes: 5116, height: 0.98 },
  cardboard: { file: 'cardboard.glb', bytes: 2792, height: 0.62 },
});

const WAREHOUSE_CORE_BYTES = Object.values(WAREHOUSE_KIT_CORE).reduce((n, e) => n + e.bytes, 0);
const WAREHOUSE_EXTRA_BYTES = Object.values(WAREHOUSE_KIT_EXTRA).reduce((n, e) => n + e.bytes, 0);

export function warehouseKitBytesForQuality(quality) {
  return quality === 'low' ? WAREHOUSE_CORE_BYTES : WAREHOUSE_CORE_BYTES + WAREHOUSE_EXTRA_BYTES;
}

function warehouseMat(THREE, vibe, kind) {
  const pal = vibe && vibe.palette ? vibe.palette : {};
  let color = hexNum(pal.neonC || '#c45a22');
  if (kind === 'crate') color = hexNum('#1a3342');
  else if (kind === 'barrel') color = hexNum(pal.neonB || '#7a5cff');
  else if (kind === 'cardboard') color = hexNum('#2a4a5c');
  return skipMat(new THREE.MeshBasicMaterial({
    color,
    transparent: false,
    opacity: 1,
  }));
}

let warehouseDressGen = 0;

export async function tryDressWarehouseKit(THREE, ctx) {
  const group = ctx && ctx.group;
  const loader = ctx && ctx.loader;
  const vibe = ctx && ctx.vibe;
  const quality = (ctx && ctx.quality) || 'med';
  if (!THREE || !group || !loader || !vibe) return { used: false, bytes: 0 };
  const gen = ++warehouseDressGen;
  const old = group.getObjectByName('warehouseArtKit');
  if (old && old.parent) old.parent.remove(old);
  const kitGroup = new THREE.Group();
  kitGroup.name = 'warehouseArtKit';
  const planned = (group.userData && group.userData.planned) || {};
  const wantExtra = quality === 'med' || quality === 'high';
  let bytes = 0;
  const root = WAREHOUSE_ROOT;
  try {
    const one = async (spec, list, kind) => {
      if (!list || !list.length || !spec) return 0;
      return instanceProp(THREE, kitGroup, loader, spec, list, warehouseMat(THREE, vibe, kind), placeAt(list), root);
    };
    try {
      const crates = (planned.crates || []).slice(0, quality === 'low' ? 6 : 12);
      const n = await one(WAREHOUSE_KIT_CORE.crate, crates, 'crate');
      if (gen !== warehouseDressGen) return { used: false, stale: true, bytes: 0 };
      bytes += n;
    } catch (e) { /* skip crates */ }

    if (wantExtra) {
      try {
        const n = await one(WAREHOUSE_KIT_EXTRA.barrel, planned.barrels, 'barrel');
        if (gen !== warehouseDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
      try {
        const n = await one(WAREHOUSE_KIT_EXTRA.cardboard, planned.cardboard, 'cardboard');
        if (gen !== warehouseDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
    }

    if (gen !== warehouseDressGen) return { used: false, stale: true, bytes: 0 };
    if (!kitGroup.children.length) return { used: false, bytes: 0 };
    group.add(kitGroup);
    return { used: true, bytes, quality };
  } catch (err) {
    try { if (kitGroup.parent) kitGroup.parent.remove(kitGroup); } catch (e) { /* ignore */ }
    return { used: false, bytes: 0, error: String(err && err.message || err) };
  }
}

const OFFICE_ROOT = 'assets/sim-office/';

export const OFFICE_KIT_CORE = Object.freeze({
  cardboard: { file: 'cardboard.glb', bytes: 2792, height: 0.62 },
});

export const OFFICE_KIT_EXTRA = Object.freeze({
  crate: { file: 'crate.glb', bytes: 3708, height: 0.88 },
  toolbox: { file: 'toolbox.glb', bytes: 4460, height: 1.05 },
});

const OFFICE_CORE_BYTES = Object.values(OFFICE_KIT_CORE).reduce((n, e) => n + e.bytes, 0);
const OFFICE_EXTRA_BYTES = Object.values(OFFICE_KIT_EXTRA).reduce((n, e) => n + e.bytes, 0);

export function officeKitBytesForQuality(quality) {
  return quality === 'low' ? OFFICE_CORE_BYTES : OFFICE_CORE_BYTES + OFFICE_EXTRA_BYTES;
}

function officeMat(THREE, vibe, kind) {
  const pal = vibe && vibe.palette ? vibe.palette : {};
  let color = hexNum(pal.neonA || '#ff5c5c');
  if (kind === 'cardboard') color = hexNum('#e8d8b0');
  else if (kind === 'crate') color = hexNum('#2a2a2a');
  else if (kind === 'toolbox') color = hexNum(pal.neonB || '#3d7dff');
  return skipMat(new THREE.MeshBasicMaterial({
    color,
    transparent: false,
    opacity: 1,
  }));
}

let officeDressGen = 0;

export async function tryDressOfficeKit(THREE, ctx) {
  const group = ctx && ctx.group;
  const loader = ctx && ctx.loader;
  const vibe = ctx && ctx.vibe;
  const quality = (ctx && ctx.quality) || 'med';
  if (!THREE || !group || !loader || !vibe) return { used: false, bytes: 0 };
  const gen = ++officeDressGen;
  const old = group.getObjectByName('officeArtKit');
  if (old && old.parent) old.parent.remove(old);
  const kitGroup = new THREE.Group();
  kitGroup.name = 'officeArtKit';
  const planned = (group.userData && group.userData.planned) || {};
  const wantExtra = quality === 'med' || quality === 'high';
  let bytes = 0;
  const root = OFFICE_ROOT;
  try {
    const one = async (spec, list, kind) => {
      if (!list || !list.length || !spec) return 0;
      return instanceProp(THREE, kitGroup, loader, spec, list, officeMat(THREE, vibe, kind), placeAt(list), root);
    };
    try {
      const boxes = (planned.cardboard || []).slice(0, quality === 'low' ? 4 : 6);
      const n = await one(OFFICE_KIT_CORE.cardboard, boxes, 'cardboard');
      if (gen !== officeDressGen) return { used: false, stale: true, bytes: 0 };
      bytes += n;
    } catch (e) { /* skip */ }
    if (wantExtra) {
      try {
        const n = await one(OFFICE_KIT_EXTRA.crate, planned.crates, 'crate');
        if (gen !== officeDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
      try {
        const n = await one(OFFICE_KIT_EXTRA.toolbox, planned.toolboxes, 'toolbox');
        if (gen !== officeDressGen) return { used: false, stale: true, bytes: 0 };
        bytes += n;
      } catch (e) { /* skip */ }
    }
    if (gen !== officeDressGen) return { used: false, stale: true, bytes: 0 };
    if (!kitGroup.children.length) return { used: false, bytes: 0 };
    group.add(kitGroup);
    return { used: true, bytes, quality };
  } catch (err) {
    try { if (kitGroup.parent) kitGroup.parent.remove(kitGroup); } catch (e) { /* ignore */ }
    return { used: false, bytes: 0, error: String(err && err.message || err) };
  }
}
