#!/usr/bin/env python3
"""Build the sim look's texture sets and HDRI from Poly Haven CC0 1k files (offline).

Not run by CI. Reproduces assets/sim-looks/tex/look_* and the look's 512 HDRI
from the Poly Haven downloads, so every shipped texel can be traced back to
its source:

  python tools/build_sim_look_textures.py <dir of Poly Haven 1k files> [set ...]
  python tools/build_sim_look_textures.py --overcast

The directory holds <asset>_{diff,nor_gl,rough}_1k.png and the HDRI's
<hdri>_1k.hdr as downloaded from https://polyhaven.com (see
ASSETS-LICENSES.md). Pillow only (no numpy). Named sets build only those
sets (no HDRI); with none, every set and the HDRI.

Each set ships two files:
  look_<set>_diff_<res>.webp  albedo, sRGB. Zone sets are grey: the zone hue
                              is the material colour, a paint tint over it.
  look_<set>_nr_<res>.webp    OpenGL normal in RGB; alpha is the roughness
                              map's deviation from its own mean, +0.5. The
                              material's roughness is the mean (sim-look.js).
A set with no normal (packed) ships one:
  look_<set>_dr_<res>.webp    the albedo, with that roughness in its alpha.
The HDRI is box-filtered 2 x 2 from 1k to 512 (the look uses it as fill only).

--overcast writes the open maps' fill (The Bando), downloading nothing: a
CIE standard overcast sky (luminance (1 + 2 sin elevation) / 3 of the
zenith's, the same all round) over a dull ground, 128 x 64, its up-facing
irradiance set to the room HDRI's (3.07 a unit, so env 0.5 fills alike).
"""

from __future__ import annotations

import math
import os
import sys

from PIL import Image

# set: (Poly Haven asset, output size, crop box in 1k px or None, mode,
# contrast). mode 'real' keeps the albedo's colour, calibrated to a mid
# concrete's mean; 'tint' makes it grey at a fixed mean so the material colour
# reads as paint; 'destripe' also removes a corrugation profile (columns)
# before going grey, and leaves no normal, so the set ships packed (_dr_).
# contrast scales a grey albedo's variation about its mean.
SETS = {
    'concrete_floor': ('concrete_floor_worn_001', 1024, None, 'real', 1),
    # Between the plate's two panel seams (it is mirrored-tiled in the sim).
    'painted_steel': ('blue_metal_plate', 512, (318, 30, 782, 494), 'tint', 1),
    'galvanised': ('corrugated_iron_02', 512, None, 'destripe', 1.6),
    'plywood': ('plywood', 512, None, 'tint', 1.3),
    'rubber_mat': ('rubber_tiles', 512, None, 'tint', 1.8),
    # The House's upholstery and bedding, 256: a fine weave on a 27 cm tile,
    # and it keeps every look set under the budget. The 1k download is
    # 1024 x 1026: the square top.
    'fabric': ('rough_linen', 256, (0, 0, 1024, 1024), 'tint', 1.4),
}
HDRI = 'autoshop_01'

# Albedo means, linear: a mid-grey concrete (0.24); tinted sets about 0.8, so
# the tint times about 0.8.
REAL_MEAN_LIN = 0.24
TINT_MEAN_LIN = 0.8


def srgb_to_lin(v: float) -> float:
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lin_to_srgb(v: float) -> float:
    v = min(max(v, 0.0), 1.0)
    return v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


LUT_LIN = [srgb_to_lin(i / 255) for i in range(256)]


def px(im: Image.Image) -> list:
    """Pixel values, flat (Pillow 12 renamed getdata)."""
    get = getattr(im, 'get_flattened_data', None)
    return list(get() if get else im.getdata())


def load_grey16(path: str) -> list[float]:
    """Roughness 0..1 from an 8-bit, RGB or 16-bit PNG."""
    im = Image.open(path)
    if im.mode in ('I;16', 'I;16B', 'I'):
        return [v / 65535 for v in px(im)]
    return [v / 255 for v in px(im.convert('L'))]


def crop_resize(im: Image.Image, box, size: int) -> Image.Image:
    if box:
        im = im.crop(box)
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return im


def grey_lin(im: Image.Image) -> list[float]:
    """Linear luminance of an sRGB image."""
    out = []
    for r, g, b in px(im.convert('RGB')):
        out.append(0.2126 * LUT_LIN[r] + 0.7152 * LUT_LIN[g] + 0.0722 * LUT_LIN[b])
    return out


def destripe(vals: list[float], w: int, h: int) -> list[float]:
    """Divide each column by its mean: a corrugation profile goes, mottling stays."""
    col = [0.0] * w
    for y in range(h):
        row = vals[y * w:(y + 1) * w]
        for x in range(w):
            col[x] += row[x]
    col = [c / h for c in col]
    mean = sum(col) / w
    return [vals[y * w + x] * mean / max(col[x], 1e-6) for y in range(h) for x in range(w)]


def build(src_dir: str, out_dir: str, key: str) -> None:
    asset, size, box, mode, contrast = SETS[key]
    res = '1k' if size == 1024 else str(size)
    diff = Image.open(os.path.join(src_dir, f'{asset}_diff_1k.png')).convert('RGB')
    nor = Image.open(os.path.join(src_dir, f'{asset}_nor_gl_1k.png')).convert('RGB')
    rough_path = os.path.join(src_dir, f'{asset}_rough_1k.png')
    rough = Image.new('F', Image.open(rough_path).size)
    rough.putdata(load_grey16(rough_path))
    if mode == 'destripe':
        g = destripe(grey_lin(diff), 1024, 1024)
        rough.putdata(destripe(px(rough), 1024, 1024))
        # The corrugation lives in the normal map too: a flat normal.
        nor = Image.new('RGB', (1024, 1024), (128, 128, 255))
        grey = Image.new('F', (1024, 1024))
        grey.putdata(g)
    diff = crop_resize(diff, box, size)
    nor = crop_resize(nor, box, size)
    rough = crop_resize(rough, box, size)
    if mode == 'real':
        rgb = px(diff)
        k = REAL_MEAN_LIN / (sum(grey_lin(diff)) / (size * size))
        albedo = Image.new('RGB', (size, size))
        albedo.putdata([tuple(round(255 * lin_to_srgb(LUT_LIN[c] * k)) for c in p) for p in rgb])
    else:
        lin = px(crop_resize(grey, box, size)) if mode == 'destripe' else grey_lin(diff)
        mean = sum(lin) / len(lin)
        k = TINT_MEAN_LIN / mean
        albedo = Image.new('L', (size, size))
        albedo.putdata([round(255 * lin_to_srgb((mean + (v - mean) * contrast) * k)) for v in lin])
        albedo = albedo.convert('RGB')
    rv = px(rough)
    mean = sum(rv) / len(rv)
    alpha = Image.new('L', (size, size))
    alpha.putdata([max(0, min(255, round(255 * (v - mean + 0.5)))) for v in rv])
    if mode == 'destripe':
        dr = albedo.copy()
        dr.putalpha(alpha)
        dr.save(os.path.join(out_dir, f'look_{key}_dr_{res}.webp'), 'WEBP', quality=90, alpha_quality=100, exact=True, method=6)
    else:
        nr = nor.copy()
        nr.putalpha(alpha)
        albedo.save(os.path.join(out_dir, f'look_{key}_diff_{res}.webp'), 'WEBP', quality=90, method=6)
        nr.save(os.path.join(out_dir, f'look_{key}_nr_{res}.webp'), 'WEBP', quality=92, alpha_quality=100, exact=True, method=6)
    print(f'{key}: {asset} {res} roughness mean {mean:.3f}')


def read_hdr(path: str):
    """Radiance RGBE (new-style RLE scanlines) to rows of float (r, g, b)."""
    data = open(path, 'rb').read()
    i = 0
    while True:
        j = data.index(b'\n', i)
        line = data[i:j]
        i = j + 1
        if line.startswith(b'-Y'):
            break
    parts = line.split()
    h, w = int(parts[1]), int(parts[3])
    rows = []
    for _ in range(h):
        assert data[i] == 2 and data[i + 1] == 2, 'flat HDR not handled'
        i += 4
        ch = [bytearray() for _ in range(4)]
        for c in range(4):
            while len(ch[c]) < w:
                n = data[i]
                i += 1
                if n > 128:
                    ch[c].extend(bytes([data[i]]) * (n - 128))
                    i += 1
                else:
                    ch[c].extend(data[i:i + n])
                    i += n
        row = []
        for x in range(w):
            e = ch[3][x]
            s = 0.0 if e == 0 else math.ldexp(1.0, e - 136)
            row.append((ch[0][x] * s, ch[1][x] * s, ch[2][x] * s))
        rows.append(row)
    return w, h, rows


def write_hdr(path: str, w: int, h: int, rows) -> None:
    """Rows of float (r, g, b) to Radiance RGBE, RLE scanlines (literal runs)."""
    out = bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
    for row in rows:
        ch = [bytearray(), bytearray(), bytearray(), bytearray()]
        for r, g, b in row:
            m = max(r, g, b)
            if m < 1e-32:
                q = (0, 0, 0, 0)
            else:
                f, e = math.frexp(m)
                k = f * 256 / m
                q = (int(r * k), int(g * k), int(b * k), e + 128)
            for c in range(4):
                ch[c].append(q[c])
        out += bytes([2, 2, w >> 8, w & 255])
        for c in range(4):
            for s in range(0, w, 128):
                chunk = ch[c][s:s + 128]
                out.append(len(chunk))
                out += chunk
    open(path, 'wb').write(out)


def build_hdri(src_dir: str, out_dir: str) -> None:
    w, h, rows = read_hdr(os.path.join(src_dir, f'{HDRI}_1k.hdr'))
    half = []
    for y in range(0, h, 2):
        a, b = rows[y], rows[y + 1]
        half.append([tuple((a[x][c] + a[x + 1][c] + b[x][c] + b[x + 1][c]) / 4 for c in range(3)) for x in range(0, w, 2)])
    write_hdr(os.path.join(out_dir, f'{HDRI}_{w // 2}.hdr'), w // 2, h // 2, half)
    print(f'hdri: {HDRI} {w}x{h} -> {w // 2}x{h // 2}')


# The overcast fill: size, the up-facing irradiance it gives, the sky's tint
# (a touch cool) and the ground's (warm grey, its albedo under that sky).
OVERCAST = {'w': 128, 'h': 64, 'irradiance': 3.07, 'sky': (0.96, 1.0, 1.06), 'ground': (1.0, 0.96, 0.9), 'albedo': 0.18}


def build_overcast(out_dir: str) -> None:
    o = OVERCAST
    w, h = o['w'], o['h']
    # The CIE overcast sky's up-facing irradiance is 7 pi / 9 of its zenith's
    # luminance; the ground is lambertian under it.
    lz = o['irradiance'] / (7 * math.pi / 9)
    lg = o['albedo'] * o['irradiance'] / math.pi
    rows = []
    for j in range(h):
        el = math.pi / 2 - (j + 0.5) / h * math.pi
        sky = lz * (1 + 2 * math.sin(max(el, 0.0))) / 3
        # A two-degree blend across the horizon, no seam.
        t = min(1.0, max(0.0, (el + math.radians(2)) / math.radians(2)))
        rgb = tuple(sky * o['sky'][c] * t + lg * o['ground'][c] * (1 - t) for c in range(3))
        rows.append([rgb] * w)
    path = os.path.join(out_dir, f'overcast_cie_{w}.hdr')
    write_hdr(path, w, h, rows)
    # Check: the up-facing irradiance of what was written, read back.
    _, _, back = read_hdr(path)
    e = 0.0
    for j in range(h):
        el = math.pi / 2 - (j + 0.5) / h * math.pi
        if el <= 0:
            continue
        lum = sum(back[j][0]) / 3
        dw = (2 * math.pi / w) * (math.pi / h) * math.cos(el)
        e += w * lum * math.sin(el) * dw
    print(f'hdri: overcast_cie_{w} {w}x{h}, up-facing irradiance {e:.3f}')


def main() -> int:
    if sys.argv[1:] == ['--overcast']:
        here = os.path.dirname(os.path.abspath(__file__))
        build_overcast(os.path.join(os.path.dirname(here), 'assets', 'sim-looks', 'hdri'))
        return 0
    if len(sys.argv) < 2 or any(k not in SETS for k in sys.argv[2:]):
        print(__doc__)
        return 2
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), 'assets', 'sim-looks', 'tex')
    for key in sys.argv[2:] or SETS:
        build(sys.argv[1], out, key)
    if len(sys.argv) == 2:
        build_hdri(sys.argv[1], os.path.join(os.path.dirname(here), 'assets', 'sim-looks', 'hdri'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
