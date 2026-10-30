// The sim look (sim-look.js): one art direction, defined once. Its assets,
// its budget, its lens, its grounding and its post, checked on the shipped
// data. node --test tools/test_sim_look.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import {
  LOOK, LOOK_TEXTURES, lookTextureBytes, vfovForDiagonal, lookVfov, yawBlurPx, floorAo,
  lookVibe, lookLooks, markBloom, lookShadowProxy, lookBoxUv,
} from '../sim-look.js';
import { RIG_PLAY } from '../sim-maps.js';
import { vibeFor } from '../sim-art.js';
import { fovChosen, saveFov, FOV_KEY } from '../sim-feel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const licenses = readFileSync(join(root, 'ASSETS-LICENSES.md'), 'utf8');

// Width and height of a WebP (lossy, lossless or extended).
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}

test('one HDRI, Poly Haven, 512 for the fill, shipped and licensed', () => {
  const f = join(root, LOOK.lighting.hdri);
  assert.ok(existsSync(f), LOOK.lighting.hdri);
  const head = readFileSync(f).subarray(0, 200).toString('latin1');
  assert.match(head, /^#\?RADIANCE/);
  assert.match(head, /-Y 256 \+X 512/, '512 equirect');
  assert.equal(LOOK.lighting.hdriWidth, 512);
  assert.ok(licenses.includes('`' + LOOK.lighting.hdri + '`'), 'licensed');
  assert.match(licenses, /autoshop_01_512\.hdr` \| https:\/\/polyhaven\.com\/a\/autoshop_01/);
  // The one key, ACES, exposure set once; the fill is the HDRI.
  assert.equal(LOOK.lighting.toneMapping, 'ACESFilmic');
  assert.ok(LOOK.lighting.env > 0 && LOOK.lighting.env < 1);
  assert.ok(LOOK.lighting.key.intensity > 0);
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /renderer\.toneMapping=THREE\.ACESFilmicToneMapping;/);
});

test('every texture is a Poly Haven set, shipped at its size and licensed, under the 24 MB budget', () => {
  const files = Object.keys(LOOK_TEXTURES);
  assert.equal(files.length, Object.values(LOOK.sets).reduce((n, s) => n + (s.packed ? 1 : 2), 0), 'two files a set, one if packed');
  for (const [file, px] of Object.entries(LOOK_TEXTURES)) {
    assert.ok(existsSync(join(root, file)), file);
    assert.deepEqual(webpSize(readFileSync(join(root, file))), [px, px], file);
    assert.ok(licenses.includes('`' + file + '`'), file + ' licensed');
  }
  // The floor is 1k (albedo, normal, roughness); the zone sets are 512.
  for (const [name, set] of Object.entries(LOOK.sets)) assert.equal(set.res, name === 'concrete_floor' ? '1k' : '512', name);
  // A set with no normal ships packed: the albedo with its roughness in alpha.
  for (const s of Object.values(LOOK.surfaces)) if (LOOK.sets[s.set].packed) assert.equal(s.normal, 0, s.set);
  const b = lookTextureBytes();
  assert.equal(b.env, 384 * 512 * 8, 'PMREM of a 512 HDRI, HalfFloat');
  assert.ok(b.total < 24e6, 'textures ' + (b.total / 1e6).toFixed(2) + ' MB');
});

test('the camera: the Air65 lens, a diagonal FOV, rendered at its aspect', () => {
  const C = LOOK.camera;
  assert.equal(C.lensMm, 2.1);
  assert.equal(C.diagonalFov, 125, 'the goggles crop the sensor: 125 deg diagonal (owner)');
  for (const aspect of [16 / 9, 4 / 3, 21 / 9, 1]) {
    const v = vfovForDiagonal(C.diagonalFov, aspect) * Math.PI / 360;
    const d = Math.atan(Math.tan(v) * Math.sqrt(1 + aspect * aspect)) * 360 / Math.PI;
    assert.ok(Math.abs(d - C.diagonalFov) < 1e-9, 'diagonal kept at ' + aspect);
  }
  assert.ok(Math.abs(lookVfov(16 / 9) - 86.56) < 0.05, 'vertical at 16:9 ' + lookVfov(16 / 9));
  assert.ok(C.barrel > 0 && C.barrel <= 0.3, 'a touch of barrel');
  assert.ok(C.near < 0.05 && C.far > 200, 'a lens a centimetre off the floor');
});

test('a FOV saved from the slider beats the lens, old saves too; the old bare default does not', () => {
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(fovChosen(store), false, 'nothing saved');
  store.setItem(FOV_KEY, '110');
  assert.equal(fovChosen(store), false, 'the old bare default');
  store.setItem(FOV_KEY, '100');
  assert.equal(fovChosen(store), true, 'an early bare save');
  store.setItem(FOV_KEY, '{"v":1,"fov":90}');
  assert.equal(fovChosen(store), true, 'an old versioned save, even at the default');
  saveFov(118, store);
  assert.equal(fovChosen(store), true);
  store.setItem(FOV_KEY, 'junk');
  assert.equal(fovChosen(store), false);
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /fovSlider=fovChosen\(\);/);
});

test('motion blur on fast yaw only, and mild', () => {
  const s = LOOK.camera.yawBlur;
  assert.equal(yawBlurPx(0), 0);
  assert.equal(yawBlurPx(s.fromDps), 0);
  assert.equal(yawBlurPx(-s.fromDps * 0.9), 0);
  assert.equal(yawBlurPx(s.fullDps), s.maxPx);
  assert.equal(yawBlurPx(5000), s.maxPx);
  assert.equal(yawBlurPx(-600), yawBlurPx(600));
  let prev = 0;
  for (let d = 0; d <= 1200; d += 10) {
    const px = yawBlurPx(d);
    assert.ok(px >= prev - 1e-12, 'monotonic at ' + d);
    prev = px;
  }
  assert.ok(s.maxPx <= 16, 'mild: ' + s.maxPx + ' px at 1080p');
  // The host feeds it from the FPV camera's own yaw rate.
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /px=yawBlurPx\(yaw\/dt\*180\/Math\.PI\);/);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /uniform vec2 blur;/);
});

test('soft AO under every object: the floor darkens at each foot and under the loft, open floor stays open', () => {
  const room = RIG_PLAY.room;
  const ao = floorAo(RIG_PLAY.boxes, room);
  const o = LOOK.grounding.floorAo;
  assert.equal(ao.width, Math.round(room.w / o.texel));
  assert.equal(ao.height, Math.round(room.d / o.texel));
  const at = (x, z) => {
    const i = Math.min(ao.width - 1, Math.floor((x + room.w / 2) / room.w * ao.width));
    const j = Math.min(ao.height - 1, Math.floor((room.d / 2 - z) / room.d * ao.height));
    return ao.data[j * ao.width + i];
  };
  assert.ok(at(0, 0) >= 250, 'mid-room, open floor ' + at(0, 0));
  // Every box on the floor has a darker rim at its foot.
  for (const b of RIG_PLAY.boxes.filter((q) => q.min[1] === 0)) {
    const cx = (b.min[0] + b.max[0]) / 2;
    assert.ok(at(cx, b.min[2] - 0.03) < 215, `${b.feature} ${b.part} foot ${at(cx, b.min[2] - 0.03)}`);
  }
  // A raised box (the tunnel at 0.97 m, the loft at 2.7 m) leaves a fainter, wider patch.
  const tunnel = at(1.2, 5.6), loft = at(-8.0, -1.0);
  assert.ok(tunnel < 255 && tunnel > at(0.4, 5.32), 'under the tunnel ' + tunnel);
  assert.ok(loft < 255, 'under the loft ' + loft);
  assert.ok(at(0, -7.47) < at(0, -6), 'the walls darken their foot');
  // Row 0 is the +z edge: the PlaneGeometry floor's v = 0, laid flat.
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  plane.rotation.x = -Math.PI / 2;
  plane.updateMatrixWorld();
  const p = new THREE.Vector3().fromBufferAttribute(plane.geometry.getAttribute('position'), 2).applyMatrix4(plane.matrixWorld);
  assert.equal(plane.geometry.getAttribute('uv').getY(2), 0);
  assert.ok(p.z > 0, 'v = 0 lies at +z');
});

test('the vibe on the look: every lighting, looks and post number comes from LOOK', () => {
  const v = vibeFor('rig');
  assert.equal(v.look, true);
  assert.deepEqual(v.looks, lookLooks());
  const L = v.lighting;
  assert.equal(L.sunIntensity, LOOK.lighting.key.intensity);
  assert.equal(L.sunColor, LOOK.lighting.key.color);
  assert.equal(L.sunElevation, LOOK.lighting.key.elevation);
  assert.equal(L.sunAzimuth, LOOK.lighting.key.azimuth);
  assert.equal(L.exposure, LOOK.lighting.exposure);
  assert.equal(L.bloomStrength, LOOK.post.bloom.strength);
  assert.equal(L.fillIntensity, 0);
  assert.equal(L.hemiIntensity, 0);
  assert.equal(L.fogDensity, 0);
  const P = v.post;
  assert.equal(P.bloom, true);
  assert.equal(P.bloomMask, true, 'bloom on the gates and edges only');
  assert.equal(P.vignette, LOOK.post.vignette);
  assert.ok(P.vignette > 0 && P.vignette <= 0.3, 'subtle vignette');
  assert.equal(P.grain, LOOK.post.grain);
  assert.ok(P.grain > 0 && P.grain <= 0.08, 'slight grain');
  assert.equal(P.ao, LOOK.grounding.contactAo);
  // A second map on the look would differ only in what is its own.
  const w = lookVibe({ id: 'x', name: 'X', palette: {}, shadow: { viewR: 10, height: 5 } });
  assert.deepEqual(w.looks, v.looks);
  assert.deepEqual(w.post, v.post);
  assert.equal(w.lighting.shadowViewR, 10);
  assert.equal(w.shadow, undefined);
  // No map module carries the look's numbers itself.
  const art = readFileSync(join(root, 'sim-art.js'), 'utf8');
  const rig = art.slice(art.indexOf('  rig: lookVibe({'), art.indexOf('export const MAP_VIBE_IDS'));
  assert.ok(rig.length > 0);
  assert.doesNotMatch(rig, /sunIntensity|exposure|bloomStrength|vignette|grain/);
});

test('bloom marks: gates and edge lines write alpha 0; the bright pass on a look map takes only those', () => {
  const m = new THREE.MeshStandardMaterial();
  let ran = 0;
  m.onBeforeCompile = () => { ran++; };
  markBloom(m);
  markBloom(m);
  const sh = { uniforms: {}, vertexShader: '', fragmentShader: 'x\n#include <opaque_fragment>\n}' };
  m.onBeforeCompile(sh, null);
  assert.equal(ran, 1, 'chains the old hook');
  assert.equal(sh.fragmentShader.match(/gl_FragColor\.a = 0\.0;/g).length, 1, 'patched once');
  assert.match(m.customProgramCacheKey(), /lookBloom$/);
  const looks = readFileSync(join(root, 'sim-looks.js'), 'utf8');
  assert.match(looks, /texel\.rgb \* clamp\( 1\.0 - texel\.a, 0\.0, 1\.0 \)/);
  assert.match(looks, /lookMask\.value = spec\.bloomMask \? 1 : 0/);
  const art = readFileSync(join(root, 'sim-art.js'), 'utf8');
  assert.match(art, /if \(vibe && vibe\.look\) markBloom\(ring\.material\);/);
});

test('one shadow proxy for the static casters: drawn once by the key, invisible in the frame', () => {
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  a.position.set(5, 0.5, 0);
  const b = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 6, 12));
  b.position.set(-3, 2, 1);
  const p = lookShadowProxy(THREE, [a, b]);
  assert.equal(p.castShadow, true);
  assert.equal(p.receiveShadow, false);
  assert.equal(p.material.colorWrite, false);
  assert.equal(p.material.depthWrite, false);
  const n = a.geometry.index.count + b.geometry.index.count;
  assert.equal(p.geometry.getAttribute('position').count, n);
  const box = new THREE.Box3().setFromBufferAttribute(p.geometry.getAttribute('position'));
  assert.ok(Math.abs(box.max.x - 5.5) < 1e-6 && Math.abs(box.min.x + 4.1) < 1e-6, 'in world space');
  const sim = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(sim, /shadowProxy=lookShadowProxy\(THREE,casters\);/);
});

test('box uvs in physical tiles, projected per face', () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 6));
  m.position.set(1, 0.25, -3);
  lookBoxUv(m, 1.5);
  const uv = m.geometry.getAttribute('uv'), n = m.geometry.getAttribute('normal'), pos = m.geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i) + 1, y = pos.getY(i) + 0.25, z = pos.getZ(i) - 3;
    const want = Math.abs(n.getX(i)) > 0.5 ? [z, y] : Math.abs(n.getY(i)) > 0.5 ? [x, z] : [x, y];
    assert.ok(Math.abs(uv.getX(i) - want[0] / 1.5) < 1e-6 && Math.abs(uv.getY(i) - want[1] / 1.5) < 1e-6, 'vertex ' + i);
  }
});

test('sim-look.js is first-party and stamped', () => {
  const stamp = readFileSync(join(root, 'scripts/ci/stamp_asset_cache.py'), 'utf8');
  assert.match(stamp, /"sim-look\.js",/);
  for (const f of ['sim.html', 'sim-maps.js', 'sim-art.js', 'sim-looks.js']) {
    assert.match(readFileSync(join(root, f), 'utf8'), /\.\/sim-look\.js\?v=[0-9a-f]{12}/, f);
  }
});
