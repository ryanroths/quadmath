# Sim V1 looks — asset licenses

New files shipped for the QuadMath sim looks pass. Nothing here is copied from WebFPV (GPLv3). Existing city-model credit stays in the `sim.html` footer.

## Poly Haven — CC0 1.0

License: https://creativecommons.org/publicdomain/zero/1.0/
Source: https://polyhaven.com

| File | Source | Notes |
|---|---|---|
| `assets/sim-looks/hdri/kiara_1_dawn_1k.hdr` | https://polyhaven.com/a/kiara_1_dawn | HDRI, 1K, used on Low/Med |
| `assets/sim-looks/hdri/kiara_1_dawn_2k.hdr` | https://polyhaven.com/a/kiara_1_dawn | HDRI, 2K, used on High |
| `assets/sim-looks/tex/asphalt_diff_1k.webp` | https://polyhaven.com/a/asphalt_02 | albedo, converted to WebP |
| `assets/sim-looks/tex/asphalt_nor_1k.webp` | https://polyhaven.com/a/asphalt_02 | OpenGL normal |
| `assets/sim-looks/tex/asphalt_rough_1k.webp` | https://polyhaven.com/a/asphalt_02 | roughness |
| `assets/sim-looks/tex/grass_diff_1k.webp` | https://polyhaven.com/a/aerial_grass_rock | albedo |
| `assets/sim-looks/tex/grass_nor_1k.webp` | https://polyhaven.com/a/aerial_grass_rock | OpenGL normal |
| `assets/sim-looks/tex/grass_rough_1k.webp` | https://polyhaven.com/a/aerial_grass_rock | roughness |
| `assets/sim-looks/tex/concrete_diff_1k.webp` | https://polyhaven.com/a/concrete_layers | albedo |
| `assets/sim-looks/tex/concrete_nor_1k.webp` | https://polyhaven.com/a/concrete_layers | OpenGL normal |
| `assets/sim-looks/tex/concrete_rough_1k.webp` | https://polyhaven.com/a/concrete_layers | roughness |
| `assets/sim-looks/tex/facade_diff_1k.webp` | https://polyhaven.com/a/plastered_wall_02 | albedo |
| `assets/sim-looks/tex/facade_nor_1k.webp` | https://polyhaven.com/a/plastered_wall_02 | OpenGL normal |
| `assets/sim-looks/tex/facade_rough_1k.webp` | https://polyhaven.com/a/plastered_wall_02 | roughness |

CC0 — no attribution required. Listed here so the sim can name every new file.

## Inter — SIL Open Font License 1.1

Source: https://github.com/rsms/inter/releases/tag/v4.1
License text: `assets/sim-looks/fonts/Inter-LICENSE.txt`

| File |
|---|
| `assets/sim-looks/fonts/Inter-Regular.woff2` |
| `assets/sim-looks/fonts/Inter-Medium.woff2` |
| `assets/sim-looks/fonts/Inter-SemiBold.woff2` |
| `assets/sim-looks/fonts/Inter-Bold.woff2` |

## JetBrains Mono — SIL Open Font License 1.1

Source: https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304
License text: `assets/sim-looks/fonts/JetBrainsMono-OFL.txt`

| File |
|---|
| `assets/sim-looks/fonts/JetBrainsMono-Regular.woff2` |
| `assets/sim-looks/fonts/JetBrainsMono-Medium.woff2` |

Used only for numeric readouts (OSD values, sliders, CLI/ghost fields).

## Already in the repo (unchanged)

| Asset | License | Credit |
|---|---|---|
| Kenney City Kit GLBs under `assets/Models/` | CC0 (`assets/License.txt`) | Kenney (www.kenney.nl) |
| `assets/Models/GLB-format/low_poly_city_game-ready.glb` | CC BY 4.0 | **City model by costoWRLD (Sketchfab, CC BY)** — kept in the sim footer |

## Code (not assets)

Post-processing (EffectComposer, UnrealBloom, GTAO, ShaderPass, Afterimage, RGBELoader) is loaded from the existing three.js r180 addons CDN. three.js is MIT. No WebFPV code or assets.
