// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Writes The Bando's graffiti atlas (BANDO_ATLAS, sim-bando-dress.js): one
// 512 x 512 greyscale PNG holding every piece as a signed distance field, so
// the wall's shader draws the fill, the outline, the block shadow and the
// highlight from one channel and an edge stays sharp at any distance (and 512
// x 512 x 1 byte, with its mips, is 350 KB of the 24 MB). Lettering is this
// file's own stroked capitals; no font, no copied piece, no real name, crew,
// brand or logo. The words are plain words; change one here and rerun.
//   node tools/build_bando_decals.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANDO_ATLAS } from '../sim-bando-dress.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The alphabet: strokes in a 1 x 1 cell, y up, baseline 0.
const GLYPHS = {
  A: [[[0, 0], [0.5, 1], [1, 0]], [[0.2, 0.38], [0.8, 0.38]]],
  B: [[[0, 0], [0, 1], [0.62, 1], [0.86, 0.82], [0.62, 0.52], [0, 0.52]], [[0.62, 0.52], [0.96, 0.3], [0.68, 0], [0, 0]]],
  C: [[[0.96, 0.8], [0.68, 1], [0.3, 1], [0.04, 0.72], [0.04, 0.28], [0.3, 0], [0.68, 0], [0.96, 0.2]]],
  D: [[[0, 0], [0, 1], [0.55, 1], [0.92, 0.72], [0.92, 0.28], [0.55, 0], [0, 0]]],
  E: [[[0.92, 1], [0, 1], [0, 0], [0.92, 0]], [[0, 0.52], [0.7, 0.52]]],
  F: [[[0.92, 1], [0, 1], [0, 0]], [[0, 0.5], [0.7, 0.5]]],
  G: [[[0.96, 0.8], [0.68, 1], [0.3, 1], [0.04, 0.72], [0.04, 0.28], [0.3, 0], [0.7, 0], [0.96, 0.2], [0.96, 0.48], [0.55, 0.48]]],
  H: [[[0, 0], [0, 1]], [[0.92, 0], [0.92, 1]], [[0, 0.52], [0.92, 0.52]]],
  I: [[[0.3, 0], [0.3, 1]]],
  K: [[[0, 0], [0, 1]], [[0.9, 1], [0, 0.42]], [[0.28, 0.62], [0.96, 0]]],
  L: [[[0, 1], [0, 0], [0.86, 0]]],
  M: [[[0, 0], [0, 1], [0.55, 0.36], [1.1, 1], [1.1, 0]]],
  N: [[[0, 0], [0, 1], [0.92, 0], [0.92, 1]]],
  O: [[[0.5, 1], [0.14, 0.84], [0.02, 0.5], [0.14, 0.16], [0.5, 0], [0.86, 0.16], [0.98, 0.5], [0.86, 0.84], [0.5, 1]]],
  P: [[[0, 0], [0, 1], [0.66, 1], [0.92, 0.8], [0.66, 0.44], [0, 0.44]]],
  R: [[[0, 0], [0, 1], [0.66, 1], [0.92, 0.8], [0.66, 0.44], [0, 0.44]], [[0.46, 0.44], [0.96, 0]]],
  S: [[[0.94, 0.82], [0.7, 1], [0.26, 1], [0.04, 0.78], [0.26, 0.55], [0.72, 0.45], [0.96, 0.22], [0.72, 0], [0.26, 0], [0.02, 0.18]]],
  T: [[[0, 1], [0.92, 1]], [[0.46, 1], [0.46, 0]]],
  U: [[[0, 1], [0, 0.24], [0.2, 0], [0.72, 0], [0.92, 0.24], [0.92, 1]]],
  W: [[[0, 1], [0.26, 0], [0.56, 0.62], [0.86, 0], [1.12, 1]]],
  Y: [[[0, 1], [0.46, 0.46], [0.92, 1]], [[0.46, 0.46], [0.46, 0]]],
  Z: [[[0, 1], [0.92, 1], [0, 0], [0.92, 0]]],
};
const advance = (c) => (c === 'I' ? 0.6 : c === 'M' || c === 'W' ? 1.3 : c === ' ' ? 0.55 : 1.14);

// A seeded generator, so the art is the same every build.
function rng(seed) {
  let s = seed * 2654435761 % 4294967296;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// A piece is a list of shapes, each a signed distance in pixels; the union's
// distance, less the cuts.
const seg = (p, a, b, ra, rb) => {
  const bx = b[0] - a[0], by = b[1] - a[1], px = p[0] - a[0], py = p[1] - a[1];
  const l = bx * bx + by * by;
  const t = l > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / l)) : 0;
  return Math.hypot(px - bx * t, py - by * t) - (ra + (rb - ra) * t);
};
const poly = (p, v) => {
  let d = Infinity, s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const a = v[i], b = v[j];
    const ex = b[0] - a[0], ey = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
    const c1 = p[1] >= a[1], c2 = p[1] < b[1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
};
const smin = (a, b, k) => {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

function art() {
  const P = {};
  const piece = (id, w, h) => (P[id] = { id, w, h, add: [], cut: [], smooth: 0 });
  // A stroke through points, radius r (or r0 to r1 along it), into a list.
  const stroke = (list, pts, r0, r1) => {
    for (let i = 1; i < pts.length; i++) {
      const u0 = (i - 1) / (pts.length - 1), u1 = i / (pts.length - 1), R1 = r1 == null ? r0 : r1;
      list.push({ kind: 's', a: pts[i - 1], b: pts[i], ra: r0 + (R1 - r0) * u0, rb: r0 + (R1 - r0) * u1 });
    }
  };
  // Text: its glyphs mapped by f(cellX, cellY, letterIndex) to pixels.
  const text = (txt, f, cb) => {
    let x = 0, k = 0;
    for (const c of txt) {
      if (c !== ' ') cb(GLYPHS[c].map((st) => st.map(([u, v]) => f(x + u, v, k))), k);
      x += advance(c);
      k++;
    }
    return x;
  };
  const widthOf = (txt) => [...txt].reduce((n, c) => n + advance(c), 0) - 0.14;

  // --- Wildstyle: letters leaning into each other, angular, barbed at every
  // stroke's end, bars across, split by inner lines. 506 x 100.
  const wild = (id, txt, seed) => {
    const p = piece(id, 506, 100), R = rng(seed), W = widthOf(txt), sx = 452 / W, top = 76, base = 15;
    const kink = (q, k) => [q[0] + (R() - 0.5) * 7, q[1] + (R() - 0.5) * 6 + (k % 2 ? 4 : -4)];
    text(txt, (u, v) => [27 + u * sx + (v - 0.5) * 16, base + v * (top - base)], (strokes, k) => {
      for (const st of strokes) {
        const pts = st.map((q) => kink(q, k));
        stroke(p.add, pts, 10.5, 7.8);
        // A barb off each end, along the stroke, and a thin line inside it.
        for (const [a, b] of [[pts[1], pts[0]], [pts[pts.length - 2], pts[pts.length - 1]]]) {
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
          const reach = 9 + R() * 12;
          const t = [b[0] + ux * reach, b[1] + uy * reach];
          p.add.push({ kind: 'p', v: [[b[0] - uy * 10, b[1] + ux * 10], [b[0] + uy * 10, b[1] - ux * 10], t] });
        }
        for (let i = 1; i < pts.length; i++) {
          const [a, b] = [pts[i - 1], pts[i]];
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 26) p.cut.push({ kind: 's', a: [a[0] * 0.86 + b[0] * 0.14 + 1.2, a[1] * 0.86 + b[1] * 0.14 + 1.2], b: [a[0] * 0.14 + b[0] * 0.86 + 1.2, a[1] * 0.14 + b[1] * 0.86 + 1.2], ra: 0.9, rb: 0.9 });
        }
      }
    });
    // Bars behind the word, tying the letters together; arrows off the ends.
    stroke(p.add, [[10, 34], [122, 26], [208, 44]], 3.5, 2.2);
    stroke(p.add, [[300, 42], [392, 22], [494, 30]], 2.2, 3.5);
    p.add.push({ kind: 'p', v: [[484, 18], [503, 33], [482, 44]] });
    p.add.push({ kind: 'p', v: [[22, 22], [3, 36], [24, 48]] });
    // Sparks.
    for (let i = 0; i < 7; i++) {
      const c = [40 + R() * 430, 8 + R() * 8 + (i % 2) * 70];
      const r = 4 + R() * 4;
      p.add.push({ kind: 'p', v: [0, 1, 2, 3, 4, 5, 6, 7].map((j) => [c[0] + Math.cos(j * Math.PI / 4) * (j % 2 ? r * 0.35 : r), c[1] + Math.sin(j * Math.PI / 4) * (j % 2 ? r * 0.35 : r)]) });
    }
  };
  wild('damp', 'DAMP', 11);
  wild('mould', 'MOULD', 23);

  // --- Throw-ups: three fat letters, round, leaning on each other. 122 x 78.
  const throwUp = (id, txt, seed) => {
    const p = piece(id, 122, 78), R = rng(seed), W = widthOf(txt), sx = 86 / W;
    p.smooth = 1.6;
    text(txt, (u, v) => [17 + u * sx + v * 5, 18 + v * 40], (strokes, k) => {
      const lift = (k % 2 ? 2 : -2) + R() * 1.5;
      for (const st of strokes) stroke(p.add, st.map(([x, y]) => [x, y + lift]), 6.6 + R() * 0.5);
    });
    // Drips off the foot of the word.
    for (let i = 0; i < 3; i++) { const x = 24 + R() * 74, y = 15 - R() * 3; stroke(p.add, [[x, y], [x + R(), y - 6 - R() * 7]], 1.3, 1); }
  };
  throwUp('oof', 'OOF', 3);
  throwUp('nah', 'NAH', 5);
  throwUp('zap', 'ZAP', 7);
  throwUp('yep', 'YEP', 9);

  // --- Tags: one quick line, leaning, the baseline climbing; a flick under
  // it, a drip or two. 122 x 44.
  const tag = (id, txt, seed) => {
    const p = piece(id, 122, 44), R = rng(seed), W = widthOf(txt), sx = 104 / W, climb = 4 + R() * 6;
    const jit = () => (R() - 0.5) * 2.2;
    let lastX = 8;
    text(txt, (u, v, k) => [8 + u * sx + v * 9 + jit(), 9 + (u / W) * climb + v * 24 + (k % 3) * 0.9 + jit()], (strokes) => {
      for (const st of strokes) { stroke(p.add, st, 1.5 + R() * 0.45); lastX = Math.max(lastX, st[st.length - 1][0]); }
    });
    stroke(p.add, [[10, 7], [50, 3.5], [Math.min(116, lastX + 4), 6.5]], 1.2, 0.65);
    const x = 30 + R() * 60;
    stroke(p.add, [[x, 9], [x, 2.4]], 0.9, 0.8);
  };
  tag('lowbatt', 'LOW BATT', 13);
  tag('landnow', 'LAND NOW', 17);
  tag('yaw', 'YAW', 19);
  tag('nosignal', 'NO SIGNAL', 29);
  tag('turtle', 'TURTLE', 31);
  tag('gapit', 'GAP IT', 37);

  // --- Stencils: square strokes with the bridges a cut stencil leaves.
  const block = (p, x0, y0, txt, cap, cw, t, gap) => {
    let x = x0;
    for (const c of txt) {
      if (c === ' ') { x += cw * 0.7; continue; }
      const scale = (u, v) => [x + u * cw, y0 + v * cap];
      for (const st of GLYPHS[c]) {
        for (let i = 1; i < st.length; i++) {
          const a = scale(...st[i - 1]), b = scale(...st[i]);
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * t / 2, ny = dx / l * t / 2;
          const ux = dx / l * t * 0.3, uy = dy / l * t * 0.3;
          p.add.push({ kind: 'p', v: [[a[0] - ux + nx, a[1] - uy + ny], [b[0] + ux + nx, b[1] + uy + ny], [b[0] + ux - nx, b[1] + uy - ny], [a[0] - ux - nx, a[1] - uy - ny]] });
        }
        // A bridge across the stroke's middle, on the long strokes.
        const a = scale(...st[0]), b = scale(...st[st.length - 1]);
        const mid = st.length === 2 ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : scale(...st[(st.length / 2) | 0]);
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        if (l > cap * 0.5) p.cut.push({ kind: 'p', v: [[mid[0] - dy / l * t, mid[1] + dx / l * t], [mid[0] + dy / l * t, mid[1] - dx / l * t], [mid[0] + dy / l * t + dx / l * 1.5, mid[1] - dx / l * t + dy / l * 1.5], [mid[0] - dy / l * t + dx / l * 1.5, mid[1] + dx / l * t + dy / l * 1.5]] });
      }
      x += cw * (c === 'I' ? 0.3 : c === 'M' ? 1.1 : c === 'W' ? 1.12 : 0.92) + t + gap;
    }
  };
  {
    // The joke: a whoop, seen from above, in a no-entry ring, and the words.
    const p = piece('nofly', 244, 104);
    const c = [52, 52], arm = 26;
    p.add.push({ kind: 'r', c, r: 44, t: 6 });
    for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      stroke(p.add, [c, [c[0] + sx * arm, c[1] + sy * arm]], 3.6);
      p.add.push({ kind: 'r', c: [c[0] + sx * arm, c[1] + sy * arm], r: 10.5, t: 2.6 });
    }
    p.add.push({ kind: 'c', c, r: 8.5 });
    p.add.push({ kind: 'p', v: [[20, 86], [28, 92], [86, 20], [78, 14]] });
    block(p, 110, 60, 'NO FLY', 30, 15.5, 5.2, 2.4);
    block(p, 112, 16, 'ZONE', 30, 21, 5.2, 3.2);
  }
  { const p = piece('keepout', 122, 44); block(p, 8, 10, 'KEEP OUT', 25, 10.6, 3.4, 1.7); }
  { const p = piece('wetfloor', 122, 44); block(p, 6, 10, 'WET FLOOR', 25, 8.8, 3.2, 1.5); }

  // --- Arrows. 82 x 104.
  {
    const p = piece('arrow', 82, 104);
    p.add.push({ kind: 'p', v: [[8, 36], [46, 36], [46, 16], [76, 52], [46, 88], [46, 68], [8, 68]] });
    p.cut.push({ kind: 'p', v: [[24, 34], [30, 34], [30, 70], [24, 70]] });
  }
  {
    const p = piece('swoop', 82, 104);
    const pts = [];
    for (let i = 0; i <= 14; i++) { const a = Math.PI * (0.05 + 0.82 * i / 14); pts.push([44 + 28 * Math.cos(a), 56 + 40 * Math.sin(a)]); }
    p.smooth = 2;
    stroke(p.add, pts, 8, 6);
    const e = pts[pts.length - 1];
    p.add.push({ kind: 'p', v: [[e[0] - 20, e[1] + 4], [e[0] + 18, e[1] + 6], [e[0] - 2, e[1] - 28]] });
  }
  {
    const p = piece('chevrons', 82, 104);
    for (const y of [76, 50, 24]) stroke(p.add, [[16, y - 16], [41, y + 8], [66, y - 16]], 6.4, 6.4);
  }
  return P;
}

// The field of a piece, in atlas pixels, y up in the piece, encoded 0..255:
// 128 on the edge, 255 at spread inside, 0 at spread outside.
function field(p, spread, out, size, rect) {
  const dist = (s, q) => {
    if (s.kind === 's') return seg(q, s.a, s.b, s.ra, s.rb);
    if (s.kind === 'p') return poly(q, s.v);
    if (s.kind === 'c') return Math.hypot(q[0] - s.c[0], q[1] - s.c[1]) - s.r;
    return Math.abs(Math.hypot(q[0] - s.c[0], q[1] - s.c[1]) - s.r) - s.t / 2; // a ring
  };
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const q = [x + 0.5, rect.h - y - 0.5];
      let d = Infinity;
      for (const s of p.add) d = p.smooth ? smin(d === Infinity ? 1e3 : d, dist(s, q), p.smooth) : Math.min(d, dist(s, q));
      for (const s of p.cut) d = Math.max(d, -dist(s, q));
      const v = Math.round(255 * Math.max(0, Math.min(1, 0.5 - d / (2 * spread))));
      out[(rect.y + y) * size + rect.x + x] = v;
    }
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(gray, size) {
  const chunk = (t, d) => {
    const b = Buffer.alloc(12 + d.length);
    b.writeUInt32BE(d.length, 0);
    b.write(t, 4, 'latin1');
    d.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((size + 1) * size);
  // The Paeth-free "up" filter halves a smooth field.
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 2;
    for (let x = 0; x < size; x++) {
      raw[y * (size + 1) + 1 + x] = (gray[y * size + x] - (y ? gray[(y - 1) * size + x] : 0)) & 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function buildAtlas() {
  const { size, spread, pieces } = BANDO_ATLAS;
  const gray = new Uint8Array(size * size);
  const P = art();
  for (const [id, rect] of Object.entries(pieces)) {
    const p = P[id];
    if (!p) throw new Error('no art for ' + id);
    if (p.w !== rect.w || p.h !== rect.h) throw new Error(`${id}: art ${p.w} x ${p.h}, rect ${rect.w} x ${rect.h}`);
    field(p, spread, gray, size, rect);
  }
  for (const id of Object.keys(P)) if (!pieces[id]) throw new Error('no rect for ' + id);
  return gray;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gray = buildAtlas();
  const file = join(root, BANDO_ATLAS.file);
  const bytes = png(gray, BANDO_ATLAS.size);
  writeFileSync(file, bytes);
  console.log(`${BANDO_ATLAS.file}: ${Object.keys(BANDO_ATLAS.pieces).length} pieces, ${(bytes.length / 1024).toFixed(1)} KB`);
}
