# QuadMath sim art direction (Phase 1)

Plan plus one playable prototype. Visual only. Gate numbers, colliders on the
race line, leaderboard keys, ghosts, and daily/weekly seeds stay frozen.
Nothing here is copied from a game, and nothing is taken from WebFPV (GPL).

Phase 1 ships **Neon Current** on the City map (City Loop / Mesa Zigzag).
Other maps keep their current procedural rooms and pick up their vibe in a
later pass.

## Inventory (today)

### Maps

| Map id | Name | Kind | Builder | Tracks |
|---|---|---|---|---|
| `city` | City | Outdoor, open class | `sim.html` procedural grid + optional Kenney / costoWRLD GLBs | `city-loop` (legacy 0), `city-zigzag` (legacy 1) |
| `living` | Living Room | Indoor whoop | `sim-maps.js` `buildLiving` | `living-sofa`, `living-circuit` |
| `garage` | Garage | Indoor whoop | `buildGarage` | `garage-bench`, `garage-rafters` |
| `warehouse` | Warehouse | Indoor whoop | `buildWarehouse` | `warehouse-aisle`, `warehouse-catwalk` |
| `backyard` | Backyard | Outdoor whoop | `buildBackyard` | `backyard-fence`, `backyard-patio` |
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

Phase 1 keeps the existing unique building/palm meshes and **shares materials**
plus instanced dressing. Measured in this PR (headless SwiftShader, not a
phone): `callsEst` ≈ **679** (`675` meshes + `4` `InstancedMesh` covering
`256` instances). That is still cheaper than the old Kenney kit + 46 MB
costoWRLD skyline. Phase 2 should merge building boxes and palm fronds to
push the race view toward **~120 calls**. Measure with `window._sim.artStats()`.

Headless SwiftShader fps in this environment was ~8–12 on High (bloom on)
and ~17–19 on Low (bloom off). Treat that as a software-renderer floor, not
a device number. The product target stays **60 fps desktop / 45+ mid phone**.

## Vibe per map

Every row is original. Palette hex is the locked brand for that map. Phase 1
implements **city** only.

### City — Neon Current (prototype)

- **Tracks:** City Loop, Mesa Zigzag (same map).
- **Time:** Night, after a heat-storm. Moon is a cold disc, not the dawn HDRI.
- **Palette:** `#070014` void, `#1a0533` zenith, `#ff2bd6` magenta horizon, `#00f0ff` cyan, `#ff7a18` ember, `#0c0a12` asphalt, `#ff3cac` lane, `#120816` facade.
- **Sky:** Procedural gradient sphere + sparse stars. HDRI hidden on this map.
- **Fog:** `#1a0830` exp2, density `0.00105`.
- **Lighting:** Dim cool key (`#88a0ff`, ~0.3), magenta fill, purple hemi. Exposure ~0.62.
- **Signature props:** Instanced night towers, roof neon strips, street lamps, distant skyline ring. Palms restyled as neon fronds. Mesas get a night-rock wash so Zigzag still reads as the same world.
- **Gates:** Brand orange / green kept (leaderboard / HUD language) with a second emissive halo and hotter bloom. Pulse unchanged.
- **Post:** Bloom on Med/High (threshold ~0.82 so only emissives catch). Off on Low. FPV barrel stays.
- **Not:** Vice City, Outrun box art, or any licensed skyline.

### Living Room — Clay Parlor

- **Time:** Overcast afternoon through a felt window.
- **Palette:** `#f4d6c6` plaster, `#7ec8e3` clay sky, `#ff6b9a` cushion, `#ffe08a` lamp, `#6b3f2a` walnut.
- **Sky / fog:** No sky (indoor). Fog `#f0e4d4` at `0.004`.
- **Lighting:** Soft bounce, no hard sun. Toon-ish ramp on furniture later.
- **Props:** Oversized clay sofa, gummy lamp, wooden-block bookshelf.
- **Gates:** Soft rounded clay rings, pastel emissive, no metal.
- **Post:** Almost none. A light toon ramp on Med/High, bloom off.

### Garage — Volt Stall

- **Time:** Night, door cracked on a wet alley.
- **Palette:** `#14161c` oil, `#ffb347` sodium, `#2de2e6` tube, `#3d4654` steel, `#c45a22` tool chest.
- **Lighting:** Sodium key + cyan work-tube fill. Sun almost off.
- **Props:** Instanced tube lights, parked wedge car, wet-floor striping.
- **Gates:** Square neon frames, sodium / cyan alternate.
- **Post:** Thin bloom on tubes only. Low = tubes as emissive meshes, no bloom.

### Warehouse — Ion Nave

- **Time:** Windowless, bioluminescent.
- **Palette:** `#0b1218` dark, `#1b3a4a` rack, `#39ffb0` spore, `#7a5cff` aisle, `#c45a22` pallet.
- **Lighting:** Cool overhead cans + teal aisle runners.
- **Props:** Emissive aisle arrows, glowing rack edges, spore cans.
- **Gates:** Hex frames with teal core.
- **Post:** Small bloom on runners. Fog `#0b1218` at `0.0018`.

### Backyard — Jade Lot

- **Time:** Dusk under a torn canopy.
- **Palette:** `#1b2a18` hedge, `#c9a45b` idol gold, `#5d7a3a` grass, `#8a4a2a` laterite, `#ffe0b0` porch.
- **Sky:** Deep green-dusk gradient, no HDRI.
- **Props:** Ziggurat shed, stone planters, moss posts. Not a named temple.
- **Gates:** Stone rings with gold leaf emissive.
- **Post:** Warm haze, bloom off on Low.

### Office — Paper Sun

- **Time:** 10 a.m. cartoon sun through blinds.
- **Palette:** `#fff4d2` paper, `#ff5c5c` chair, `#3d7dff` screen, `#2ae59b` plant, `#1a1a1a` outline.
- **Lighting:** Hard toon sun, bright hemi, almost no fog.
- **Props:** Flat-shaded cubicles, bold shadow decals.
- **Gates:** Primary-color hoops with a black outline mesh.
- **Post:** No bloom. Optional toon ramp on High.

### School Gym — Amber Court

- **Time:** Golden hour through high windows.
- **Palette:** `#f0b14b` sun, `#6a4224` court, `#fff6d8` line, `#c45a22` rim, `#8a8e94` truss.
- **Lighting:** Long warm key, bright fill so the paint stays readable (do not regress the court-black bug).
- **Props:** Honey bleachers, glowing rims, dust-mote sprites on High.
- **Gates:** Wood-and-brass rings.
- **Post:** Gentle bloom on rims only.

### Tiny Trainer — Licorice Grid

- **Time:** Indoor night meet, tape still sticky.
- **Palette:** `#1a1020` floor, `#ff4d8d` tape, `#f2f0ea` PVC, `#ffe08a` bulb, `#00e5ff` next-gate.
- **Props:** Candy tape, clay cones, gummy spare frames on the bench.
- **Gates:** Frosted candy toruses.
- **Post:** Tiny bloom on tape. Low = saturated albedo only.

### Your Room — Pocket Stage

- **Time:** Desk lamp + hallway spill.
- **Palette:** `#eee8de` wall, `#7a5130` furniture, `#ffb3c7` felt, `#7ec8e3` night-window.
- **Props:** Same furniture AABBs, clay/felt materials. Track still generated.
- **Gates:** Soft felt rings sized by the room planner.
- **Post:** None. Keep the cell readable at whoop scale.

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
2. Restyle the existing procedural buildings / palms / ground / sky in place.
   Collider boxes stay the ones `makeBuilding` / palms / landmarks already
   pushed. New neon is instanced and **does not add colliders**.
3. Neon gradient sky, night fog, moonlight. Dawn HDRI stays for other maps.
4. Gates keep orange/green and their positions; extra halo only.
5. Quality Low disables bloom (and AO, already).
6. Canopy default stays off. HUD / OSD / footer chrome stay.
7. Dreamland gets original procedural pillars instead of Kenney trees.

Landmarks that must still be there and still collide: triple stack, windmill,
tunnel, dive shaft, wall ride, portals, mesas (visual), zigzag gates.

## What Phase 1 must not do

- Edit `content/guides/` or other guide HTML.
- Move a gate, change `FROZEN_CITY`, or rewrite track JSON.
- Change daily/weekly mulberry seeds or `DAILY_MAPS` sizes.
- Import WebFPV code or models.
- Add a non-CC0 third-party mesh.
- Turn the canopy on, or hide the HUD.
- Delete the unused GLBs in this PR (call that out for Phase 2).
