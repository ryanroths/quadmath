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
| Kenney City Kit GLBs under `assets/Models/` | CC0 (`assets/License.txt`) | Kenney (www.kenney.nl). Still in the tree; **Phase 1 city no longer loads them**. |
| `assets/Models/GLB-format/low_poly_city_game-ready.glb` | CC BY 4.0 | **costoWRLD (Sketchfab, CC BY)** — not loaded in Phase 1. City playable art is original procedural `Neon Current` (`sim-art.js`). |

### Proposed removal (unused `assets/Models/GLB-format/`, ~53 MB)

Verified unused by sim JS, kit loaders, guides, and site HTML (only mentioned in this file, `docs/sim-art-direction.md`, and the banned-asset test string). City/garage kits load Meshopt files from `assets/sim-city/` and `assets/sim-garage/`. Do not delete Kenney preview/docs at `assets/Overview.html`, `assets/Preview*.png`, or `assets/License.txt`.

| Path | Bytes | Why unused |
|---|---|---|
| `assets/Models/GLB-format/low_poly_city_game-ready.glb` | 46,285,516 | costoWRLD skyline; Phase 1 never fetches it |
| 444 Kenney City Kit `.glb` tiles (buildings, roads, roofs, props) | 7,164,872 | Replaced by `assets/sim-city/` Meshopt kit |
| **Folder total** | **53,450,388** | Safe to delete the folder in a follow-up if Ryan agrees |

## W3 indoor maps (no new binary textures)

Office, school gym, Tiny Trainer hall, and Your-room are procedural boxes/cylinders that reuse the same V1 Poly Haven PBR sets (concrete, plaster facade, wood canvas + plaster normal). No new downloads. No WebFPV assets, layouts, or code. Track JSON lives in `tracks/`. Hosted pace ghosts for the new courses are synthetic splines in `ghosts/<track-id>.json`. Your-room dimensions persist in `localStorage` key `quadmathSimRoom` only.

## M2 maps / tracks (no new binary textures)

Indoor whoop maps are procedural boxes that reuse the V1 Poly Haven PBR sets above (concrete, plaster facade, grass, asphalt). Wood floors are a canvas albedo plus the plaster normal/roughness on Med/High. No WebFPV assets, layouts, or code. Track JSON lives in `tracks/`. Hosted pace ghosts for new courses are synthetic splines in `ghosts/<track-id>.json` (city `ghosts/track_{0,1}.json` unchanged).

## Code (not assets)

Post-processing (EffectComposer, UnrealBloom, GTAO, ShaderPass, Afterimage, RGBELoader) is loaded from the existing three.js r180 addons CDN. three.js is MIT. No WebFPV code or assets.
