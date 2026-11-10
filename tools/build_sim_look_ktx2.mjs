// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Writes each look set's KTX2 beside its WebP (assets/sim-looks/tex), from the
// shipped WebP: Basis ETC1S for an albedo (sRGB, smallest on the wire), Basis
// UASTC with zstd for a normal + roughness (linear, no ETC1S blocking in the
// lighting). Mips included; flipped here because a compressed texture cannot be
// flipped at upload (the WebP path flips at decode). Not run by CI. Needs Pillow
// and the Basis encoder, in the npm package ktx2-encoder (not a dependency):
//   npm pack ktx2-encoder@0.6.0 && tar -xzf ktx2-encoder-0.6.0.tgz
//   node tools/build_sim_look_ktx2.mjs package [set ...]
import { spawnSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LOOK_TEXTURES } from '../sim-look.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Pillow's decode: straight alpha, top row first.
const DECODE = 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(im.tobytes())';
function rgba(file, px) {
  const r = spawnSync('python', ['-c', DECODE, file], { maxBuffer: px * px * 4 + 16 });
  if (r.status !== 0) throw new Error(file + ': ' + r.stderr);
  if (r.stdout.length !== px * px * 4) throw new Error(`${file}: ${r.stdout.length} bytes, expected ${px} square RGBA`);
  return new Uint8Array(r.stdout);
}

function encode(M, src, px, uastc) {
  const e = new M.BasisEncoder();
  try {
    e.setCreateKTX2File(true);
    e.setMipGen(true);
    e.setYFlip(true);
    e.setUASTC(uastc);
    // The transfer function setter was renamed in Basis 2.5.
    const srgb = (e.setKTX2AndBasisSRGBTransferFunc || e.setKTX2SRGBTransferFunc).bind(e);
    srgb(!uastc);
    if (uastc) {
      // Linear data: no perceptual metric, linear mips. Level 2 of 0..4, a
      // light RDO so zstd can bite.
      (e.setNormalMapPreset || e.setNormalMap).call(e);
      e.setPackUASTCFlags(2);
      e.setRDOUASTC(true);
      e.setRDOUASTCQualityScalar(1.0);
      e.setKTX2UASTCSupercompression(true);
    } else {
      e.setQualityLevel(255);
      (e.setETC1SCompressionLevel || e.setCompressionLevel).call(e, 4);
    }
    if (e.setSliceSourceImage(0, src, px, px, 0) === false) throw new Error('source rejected');
    const out = new Uint8Array(px * px * 4 * 2 + 65536);
    const n = e.encode(out);
    if (!n) throw new Error('encode failed');
    return out.slice(0, n);
  } finally {
    e.delete();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [pkg, ...only] = process.argv.slice(2);
  if (!pkg) throw new Error('usage: node tools/build_sim_look_ktx2.mjs <ktx2-encoder package dir> [set ...]');
  const { default: BASIS } = await import(pathToFileURL(resolve(pkg, 'dist/basis/basis_encoder.js')).href);
  const M = await BASIS({ print() {}, printErr() {} });
  M.initializeBasis();
  let webp = 0, ktx = 0;
  for (const [file, px] of Object.entries(LOOK_TEXTURES)) {
    if (only.length && !only.some((n) => file.includes(`/look_${n}_`))) continue;
    const dst = file.replace(/\.webp$/, '.ktx2');
    const uastc = file.includes('_nr_');
    const t0 = Date.now();
    const bytes = encode(M, rgba(join(root, file), px), px, uastc);
    writeFileSync(join(root, dst), bytes);
    const was = statSync(join(root, file)).size;
    webp += was;
    ktx += bytes.length;
    console.log(`${dst}: ${uastc ? 'UASTC' : 'ETC1S'} ${(bytes.length / 1024).toFixed(0)} KB (WebP ${(was / 1024).toFixed(0)} KB), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  console.log(`on disk: WebP ${(webp / 1e6).toFixed(2)} MB, KTX2 ${(ktx / 1e6).toFixed(2)} MB`);
}
