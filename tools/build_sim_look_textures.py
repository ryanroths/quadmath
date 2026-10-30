#!/usr/bin/env python3
"""Build the sim look's texture sets from Poly Haven CC0 1k PNGs (offline).

Not run by CI. Reproduces assets/sim-looks/tex/look_* from the Poly Haven
downloads, so every shipped texel can be traced back to its source:

  python tools/build_sim_look_textures.py <dir of Poly Haven 1k PNGs>

The directory holds <asset>_{diff,nor_gl,rough}_1k.png as downloaded from
https://polyhaven.com (see ASSETS-LICENSES.md). Pillow only (no numpy).

Each set ships two files:
  look_<set>_diff_<res>.webp  albedo, sRGB. Zone sets are grey: the zone hue
                              is the material colour, a paint tint over it.
  look_<set>_nr_<res>.webp    OpenGL normal in RGB; alpha is the roughness
                              map's deviation from its own mean, +0.5. The
                              material's roughness is the mean (sim-look.js).
"""

from __future__ import annotations

import os
import sys

from PIL import Image

# set: (Poly Haven asset, output size, crop box in 1k px or None, mode,
# contrast). mode 'real' keeps the albedo's colour, calibrated to a mid
# concrete's mean; 'tint' makes it grey at a fixed mean so the material colour
# reads as paint; 'destripe' also removes a corrugation profile (columns)
# before going grey. contrast scales a grey albedo's variation about its mean.
SETS = {
    'concrete_floor': ('concrete_floor_worn_001', 1024, None, 'real', 1),
    # Between the plate's two panel seams (it is mirrored-tiled in the sim).
    'painted_steel': ('blue_metal_plate', 256, (322, 40, 778, 496), 'tint', 1),
    'galvanised': ('corrugated_iron_02', 256, None, 'destripe', 1.6),
    'plywood': ('plywood', 256, None, 'tint', 1.3),
    'rubber_mat': ('rubber_tiles', 512, None, 'tint', 1.8),
}
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
    rough = Image.new('F', (1024, 1024))
    rough.putdata(load_grey16(os.path.join(src_dir, f'{asset}_rough_1k.png')))
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
    nr = nor.copy()
    nr.putalpha(alpha)
    albedo.save(os.path.join(out_dir, f'look_{key}_diff_{res}.webp'), 'WEBP', quality=90, method=6)
    nr.save(os.path.join(out_dir, f'look_{key}_nr_{res}.webp'), 'WEBP', quality=92, alpha_quality=100, exact=True, method=6)
    print(f'{key}: {asset} {res} roughness mean {mean:.3f}')


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), 'assets', 'sim-looks', 'tex')
    for key in SETS:
        build(sys.argv[1], out, key)
    return 0


if __name__ == '__main__':
    sys.exit(main())
