# QuadMath sim art direction (Phase 1)

Plan plus one playable prototype. Visual only. Gate numbers, colliders on the
race line, leaderboard keys, ghosts, and daily/weekly seeds stay frozen.
Nothing here is copied from a game, and nothing is taken from WebFPV (GPL).

**Studio lock: Felt Scale.** See `docs/sim-art-felt-scale.md`. Materials
unify (matte, MeshBasic indoors, metalness ≤ 0.05). Per-map palettes stay.
Night maps keep their hour. Living Room is the reference map. Phone Low has
no bloom, no AO, and no extra post passes.

Phase 1 ships **Neon Current** on the City map (City Loop / Mesa Zigzag).
**Clay Parlor** ships on Living Room, **Volt Stall** ships on Garage, and
**Ion Nave** ships on Warehouse.
**Amber Court** ships on Gym.
**Paper Sun** ships on Office.
**Licorice Grid** ships on Tiny Trainer.
**Ryan's Yard** ships on Backyard.
**Pocket Stage** ships on Your Room.
**Hard Key** ships on The Rig, the launch map: an exception to Felt Scale (below).
Remaining maps keep their current procedural rooms and pick up their vibe
one map per PR.

## Inventory (today)

### Maps

| Map id | Name | Kind | Builder | Tracks |
|---|---|---|---|---|
| `city` | City | Outdoor, open class | `sim.html` procedural grid + optional Kenney / costoWRLD GLBs | `city-loop` (legacy 0), `city-zigzag` (legacy 1) |
| `living` | Living Room | Indoor whoop | `sim-maps.js` `buildLiving` | `living-sofa`, `living-circuit` |
| `garage` | Garage | Indoor whoop | `buildGarage` | `garage-bench`, `garage-rafters`, `garage-shelf`, `garage-orbit`, `garage-door` |
| `warehouse` | Warehouse | Indoor whoop | `buildWarehouse` | `warehouse-aisle`, `warehouse-catwalk` |
| `backyard` | Backyard (Ryan's) | Outdoor whoop | `buildBackyard` | `backyard-gate`, `backyard-pool`, `backyard-alley`, `backyard-spin` |
| `office` | Office | Indoor whoop (W3) | `buildOffice` | `office-cubicles`, `office-hallway`, `office-desks` |
| `gym` | School Gym | Indoor whoop (W3) | `buildGym` | `gym-court`, `gym-bleachers`, `gym-hoops` |
| `trainer` | Tiny Trainer | Indoor whoop (W3) | `buildTrainer` | `trainer-figure8`, `trainer-slalom`, `trainer-hairpin` |
| `room` | Your Room | Indoor whoop (W3) | `sim-room.js` + `buildRoom` | `room-practice` (generated from L×W×H) |

Orbit and lighting knobs live in `MAP_ORBIT` / `MAP_LOOKS` (`sim-maps.js`).
City fallback lighting is the `LIGHTING` block in `sim.html`. Quality, HDRI,
PBR, bloom, AO, and the FPV lens live in `sim-looks.js`.

### Generated courses (not extra maps)

| Id pattern | Source | Map |
|---|---|---|
| `daily-YYYY-MM-DD` | `dailyTrackFor` in `sim-retention.js` | Rotates over `DAILY_MAPS` (living, garage, warehouse, office, gym, trainer). Deterministic from the UTC date. |
| `weekly-YYYY-Www` | `weeklyTrackFor` | Same indoor set, UTC week seed. |
| Custom tracks | `quadmathSimCustomTracks` | Whatever map the builder saved. |

Daily and weekly **inherit the host map's vibe**. Do not restyle them as their
own world — that would break the "same room, new tape" read and is unused by
the seed.

### Current city assets (the cookie-cutter pile)

Loaded by `_tryAssets` in `sim.html` after first paint.

| Asset | License | Notes |
|---|---|---|
| `assets/Models/GLB-format/low_poly_city_game-ready.glb` | CC BY 4.0, **costoWRLD** (Sketchfab) | Distant skyline only. Credit was in the sim footer. ~46 MB. |
| Kenney City Kit GLBs (`building-*.glb`, `tree-*.glb`, `truck-*.glb`, bridges, dumpsters, scaffolding, stairs, pallets, benches, awnings, sample towers) | CC0, Kenney (`assets/License.txt`) | Scattered on the city grid + Dreamland dressing. |
| Procedural beige boxes + palms in `sim.html` | Original | Fallback when GLTF fails; swapped out when the kit loads. |
| Poly Haven HDRI + PBR (`assets/sim-looks/`) | CC0 1.0 | Dawn HDRI (`kiara_1_dawn`), asphalt / grass / concrete / plaster. |
| Inter + JetBrains Mono | OFL 1.1 | HUD / OSD only. |
| Indoor maps | Original procedural boxes | Reuse the Poly Haven sets. No extra binaries. |
| three.js r180 post (bloom, GTAO, FPV shader) | MIT, jsDelivr addons | Already shipped. |

Phase 1 **stops loading** the Kenney kit and the costoWRLD city on the playable
City map. Files stay in the tree so a revert is one flag; Phase 2 can delete
unused GLBs. Indoor maps still use the CC0 PBR sets.

No new third-party models. No WebFPV assets.

## Performance budget

Targets: **60 fps** desktop, **45+** on mid phones (W6 touch). The city used
to pull ~40 GLBs including a 46 MB skyline; that fight with first paint is
why GLTF already waited a frame.

| Knob | Low (phones / Auto fallback) | Med | High |
|---|---|---|---|
| Bloom / UnrealBloom | **off** | on, 0.75 scale | on, full |
| AO (GTAO) | off | on | on |
| MSAA post samples | 0 | 2 | 4 |
| Extra neon point lights | 0 | 4 | 6 |
| Skyline instances | 48 | 96 | 140 |
| Street dressing instances | 80 | 160 | 220 |
| Shadows | 512, on | 1024 | 2048 |
| Pixel ratio cap | 1 | 1.25 | 1.5 |

Rules for every vibe implementation:

- Share materials. Instance repeated props (`InstancedMesh`).
- Merge one-off trim into the instance pools; do not add a Mesh per window.
- Emissive materials sell neon. Point lights are a cap, not a flood.
- New dressing is **visual-only** unless it replaces an existing collider box.
- Do not touch `FROZEN_CITY`, track JSON, `DAILY_MAPS` sizes, or storage keys.
- Auto quality already drops Med → Low when the rolling fps sits under 55.

City visuals are **instanced cores + merged trim + instanced props**. Stock
building/palm meshes stay as collider authors but are hidden. Measure with
`window._sim.artStats()` (skips `visible:false`). Phase 1 density measured
`callsEst` **186 High** / **181 Low** (SwiftShader). The City finish pass
measures **193 High** / **193 Med** / **185 Low**. High has 1913 instances
on 42 `InstancedMesh` plus rain/steam/stars; Low drops to 840 instances,
turns bloom, the wet overlay, and particles off, and stays within a few
instanced batches of the earlier Low. Landmark meshes still dominate the
unique mesh count. Target remains **120–200** on High.

Headless SwiftShader fps is a software-renderer floor, not a device number.
The product target stays **60 fps desktop / 45+ mid phone**.

## Vibe per map

Every row is original. Palette hex is the locked brand for that map. City
(**Neon Current**), Living Room (**Clay Parlor**), Garage (**Volt Stall**), and
Warehouse (**Ion Nave**), Gym (**Amber Court**), Office (**Paper Sun**), Tiny Trainer (**Licorice Grid**), Backyard (**Ryan's Yard**), and Your Room (**Pocket Stage**) are implemented. Remaining maps wait their turn.

### City — Neon Current (prototype)

- **Tracks:** City Loop, Mesa Zigzag (same map).
- **Time:** Night, after a heat-storm. Moon is a cold disc, not the dawn HDRI.
- **Palette:** `#070014` void, `#1a0533` zenith, `#ff2bd6` magenta horizon, `#00f0ff` cyan, `#ff7a18` ember, `#0c0a12` asphalt, `#ff3cac` lane, `#120816` facade.
- **Sky:** Procedural gradient sphere + sparse stars. HDRI hidden on this map.
- **Fog:** `#1a0830` exp2, density `0.00105`.
- **Lighting:** Dim cool key (`#88a0ff`, ~0.3), magenta fill, purple hemi. Exposure ~0.62.
- **Signature props:** Instanced night towers, roof neon strips, street lamps, distant skyline ring, hanging NEON banner, Stack Roof / Current Well dressing. Palms restyled as neon fronds. Mesas get a night-rock wash so Zigzag still reads as the same world. #212 cars stay.
- **Gates:** Brand orange / green kept (leaderboard / HUD language) with a second emissive halo and hotter bloom. Pulse unchanged.
- **Post:** Bloom on Med/High (threshold ~0.82 so only emissives catch). Off on Low. FPV barrel stays.
- **Not:** Vice City, Outrun box art, or any licensed skyline.

### Living Room — Clay Parlor (Felt Scale reference)

- **Time:** Overcast afternoon through a felt window.
- **Palette:** `#f4d6c6` plaster, `#7ec8e3` clay sky, `#ff6b9a` cushion, `#ffe08a` lamp, `#6b3f2a` walnut.
- **Sky / fog:** No sky (indoor). Fog `#f0e4d4` at `0.0052`.
- **Lighting:** Soft felt bounce, hemi high, env low. Dawn HDRI cannot wash MeshBasic furniture.
- **Props:** Felt-nap sofa, gummy lamp, wooden-block bookshelf.
- **Gates:** Soft rounded clay rings, pastel, no metal.
- **Post:** Warm lift, light vignette, bloom off at every quality. Low: no lanterns / steam / glow.

### Garage — Volt Stall (shipped)

- **Time:** Night, door cracked on a wet alley.
- **Palette:** `#14161c` oil, `#ffb347` sodium, `#2de2e6` tube, `#3d4654` steel, `#c45a22` tool chest.
- **Lighting:** Sodium key + cyan work-tube fill. Sun almost off.
- **Props:** Instanced tube lights, parked wedge car, wet-floor striping.
- **Gates:** Square neon frames, sodium / cyan alternate.
- **Post:** Thin bloom on tubes only. Low = tubes as emissive meshes, no bloom.

### Warehouse — Ion Nave (shipped)

- **Time:** Windowless, bioluminescent.
- **Palette:** `#0b1218` dark, `#1b3a4a` rack, `#39ffb0` spore, `#7a5cff` aisle, `#c45a22` pallet.
- **Lighting:** Cool overhead cans + teal aisle runners.
- **Props:** Emissive aisle arrows, glowing rack edges, spore cans, hanging ION banner, Spore Loft / Dock Crypt dressing.
- **Gates:** Hex frames with teal core.
- **Post:** Small bloom on runners. Fog `#0b1218` at `0.0018`.

### Backyard — Ryan's Yard (shipped)

- **Time:** Overcast Phoenix afternoon.
- **Palette:** `#c4a882` stucco, `#c45a32` terracotta, `#2ec4b6` pool, `#3f8a4a` turf, `#c2b39a` pebble.
- **Sky:** Warm overcast gradient, no hard sun sprite.
- **Props:** PVC practice gate, kidney pool, full-yard mesh fence, ficus planter, umbrella arch, yellow canopy, west side alley + wood gate + AC. Patio planters and pavers, no furniture. No clutter, faces, or dog.
- **Gates:** Stucco hoops with terracotta caps.
- **Post:** Warm grade, bloom off.

### Office — Paper Sun (shipped)

- **Time:** 10 a.m. cartoon sun through blinds.
- **Palette:** `#fff4d2` paper, `#ff5c5c` chair, `#3d7dff` screen, `#2ae59b` plant, `#1a1a1a` outline.
- **Lighting:** Hard toon sun, bright hemi, almost no fog.
- **Props:** Flat-shaded cubicles, bold shadow decals.
- **Gates:** Primary-color hoops with a black outline mesh.
- **Post:** No bloom. Optional toon ramp on High.

### School Gym — Amber Court (shipped)

- **Time:** Golden hour through high windows.
- **Palette:** `#f0b14b` sun, `#6a4224` court, `#fff6d8` line, `#c45a22` rim, `#8a8e94` truss.
- **Lighting:** Long warm key, bright fill so the paint stays readable (do not regress the court-black bug).
- **Props:** Honey bleachers, glowing rims, dust-mote sprites on High.
- **Gates:** Wood-and-brass rings.
- **Post:** Gentle bloom on rims only.

### Tiny Trainer — Licorice Grid (shipped)

- **Time:** Indoor night meet, tape still sticky.
- **Palette:** `#1a1020` floor, `#ff4d8d` tape, `#f2f0ea` PVC, `#ffe08a` bulb, `#00e5ff` next-gate.
- **Props:** Candy tape, clay cones, gummy spare frames on the bench.
- **Gates:** Frosted candy toruses.
- **Post:** Tiny bloom on tape. Low = saturated albedo only.

### Your Room — Pocket Stage (shipped)

- **Time:** Desk lamp + hallway spill.
- **Palette:** `#eee8de` wall, `#7a5130` furniture, `#ffb3c7` felt, `#7ec8e3` night-window.
- **Props:** Same furniture AABBs, clay/felt materials. Track still generated.
- **Gates:** Soft felt rings sized by the room planner.
- **Post:** None. Keep the cell readable at whoop scale.

### The Rig — Hard Key (shipped, the launch map)

- **Owner's spec:** whoop-scale, flow-first, 20 x 15 x 6 m industrial interior; high-contrast edges, one key light, ACES, no fog, no decor; bounce walls. After the first flight: ambient at about 15% so nothing is black, PBR surfaces with their own roughness, a floor grid, a hue per zone.
- **An exception to Felt Scale.** No felt, no hemisphere, no fill light: one hard key (the sun, through a ceiling and walls that cast no shadow), its hard shadows, and edge lines drawn on every box of the rig. The ambient is an image light at 15% of the key (`sim-lighting.js` `rigAmbientEnv`: a soft grey room, no lamp in it, a little warmer underfoot where the lit floor bounces), never the dawn HDRI. ACES is the renderer's, as everywhere.
- **Surfaces (`sim-maps.js` `RIG_LOOK`):** concrete floor `#9a9da2` (roughness 0.92) with a 1 m grid and a 5 m line; painted block walls `#9a9ea5` (0.85); ceiling `#868b92` (0.9). Zones, each its own hue: tower, painted scaffold, lemon `#f2d10a` (0.45); pipes, steel, blue `#6f9be0` (0.3, metal 0.7); crates, wood, `#d9a066` (0.8) with slats; tunnel, enamelled sheet steel, violet `#9466e0` (0.35); loft, painted plywood, raspberry `#d0306a` (0.65). A support wears the hue of what it holds. Edges `#f2f0ea`. Gates keep brand `#ff4d1a` / `#3ddc97`, and no zone takes those hues.
- **Props:** None. The six features (scaffold tower, ceiling pipe run, crate stacks, tunnel, loft, straight) are the map.
- **Gates:** Plain brand rings, not solid, on the Rig Loop (17 gates, 57 m). Every feature is on the loop; `tools/test_sim_rig.mjs` holds the clearances and the radius.
- **Post:** No grade, no bloom, no vignette, no fog; contact AO only, for the edges.

### Daily / weekly

No unique world. Use the host indoor vibe above. Seed, gate count, and
`dailyTrackValid` stay as they are.

## Proposed later maps (not in catalog)

Ideas that did not win a current slot. Keep them for a new map, do not paste
them onto an existing room.

| Name | Palette hook | Why later |
|---|---|---|
| Copper Wash | `#e8a04a` / `#6a2a12` | Golden-hour desert canyon. Mesa Zigzag already lives on City; splitting it is a new map + new leaderboard, not a Phase 1 paint. |
| Aurora Drift | `#7af0ff` / `#d0a0ff` | Snowfield. Needs a new outdoor shell. |
| Tide Hollow | `#031820` / `#3cffc8` | Underwater cave. Needs a water pass and a new collider set. |
| Afterimage Plaza | `#ff71ce` / `#01cdfe` | Vaporwave rooftop. Better as a city rooftop DLC than a living-room skin. |

## Phase 1 prototype (shipped in this PR)

City map only:

1. Skip Kenney / costoWRLD GLTF load (`_tryAssets` is dressing + snap).
2. Hide stock building/palm meshes. Collider boxes stay. Visuals are a
   merged window-shader core, setbacks/trim, and instanced rooftop/street
   props. New dressing **does not add colliders** and is keep-out tested
   against `FROZEN_CITY` race lines and gate openings.
3. World-Y neon sky shader (no UV seam) plus moon glow. Orange horizon
   slabs and the dawn sun sprite are gone on City. Cheap fake wet-road
   shader on Med/High (off on Low). Dawn HDRI stays for other maps.
4. Each City Loop gate gets a unique neon frame. Next gate pulses white;
   passed gates shift to violet. Positions unchanged.
5. Quality Low disables bloom, AO, reflections, and particles. Rain is a
   separate toggle (`quadmathSimRain`).
6. Canopy default stays off. HUD / OSD / footer chrome stay. Color grade +
   slight vignette/CA ride the existing FPV pass so bloom does not wash OSD.
7. Dreamland gets original instanced pillars instead of Kenney trees.

Landmarks that must still be there and still collide: triple stack, windmill,
tunnel, dive shaft, wall ride, portals, mesas (visual), zigzag gates.

Leftovers restyled in the City finish pass (visual only, colliders stay):

- Dive shaft sand walls + orange LED rings → night walls and cyan/magenta rings.
- Plain orange box arches → magenta neon posts plus a cyan hoop.
- Sandstone wall-ride slab → night facade wash.
- 900×180 magenta fog planes removed.

## What Phase 1 must not do

- Edit `content/guides/` or other guide HTML.
- Move a gate, change `FROZEN_CITY`, or rewrite track JSON.
- Change daily/weekly mulberry seeds or `DAILY_MAPS` sizes.
- Import WebFPV code or models.
- Add a non-CC0 third-party mesh.
- Turn the canopy on, or hide the HUD.
- Delete the unused GLBs in this PR (call that out for Phase 2).
