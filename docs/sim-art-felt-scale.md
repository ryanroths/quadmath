# Felt Scale — QuadMath studio lock

Ryan picked **Felt Scale**. This is the studio language for every sim map.
Palettes stay per-map. Night maps keep their hour. Living Room (Clay Parlor)
is the reference implementation.

WebFPV owns photoreal pilot houses and lookalike avatars. QuadMath wins by
making whoop scale the art: the house is a felt playset and you are the toy.
No photogrammetry. No faces. No WebFPV / GPL.

## Rules

1. **Materials unify.** Matte felt / clay. Metalness ≤ 0.05. Roughness ≥ 0.92
   on standard mats. Indoor hero furniture is `MeshBasic` so the dawn HDRI
   cannot wash them. Poly Haven maps are tint only, never identity.
2. **Lighting stays local.** Per-map palette. Felt bounce (high hemi, low
   env). No hard sun except Office / Gym keys when those maps roll out.
3. **Post.** Warm grade + light vignette. Bloom only where a map's emissives
   are the point (City neon, Garage tubes, Warehouse runners) and **never on
   Low**. Living (the reference) has bloom off at every quality.
4. **Phone budget (Low).** No bloom. No AO. No extra post passes. Pixel
   ratio cap 1. Shadows ≤ 512. Cardboard / clay boxes only — no lanterns,
   steam, or glow pools.
5. **Palettes do not flatten.** Clay Parlor, Volt Stall, Ion Nave, Neon
   Current, and the rest keep their names and hex. Materials lock; hue does
   not.
6. **Gameplay frozen.** Sparks, trick score, line timer, ghosts, gate
   numbers, and colliders do not move in a Felt Scale paint PR.
7. **Avatars.** None. If a body ever ships, it is a clay token.

Helpers live in `sim-art-felt.js`: `FELT_SCALE`, `applyFeltMaterial`,
`feltBasic`, `studioPhoneBudget`, `qualityWantsBloom(applied, vibe)`.

## Rollout

| PR | Map | Notes |
|---|---|---|
| 1 | Living Room (reference) + this bible + studio helpers | shipped |
| 2 | Garage | Volt Stall night hour stays; density + named lines |
| 3 | City | Neon Current night hour stays; explore district |
| 4 | Backyard | Ryan's Yard overcast afternoon; real Phoenix backyard |
| 5 | Your Room | Pocket Stage, same lock |
| 6 | Trainer | Licorice Grid |
| 7 | Office | Paper Sun; hard key allowed |
| 8 | Gym | Amber Court; hard key allowed |
| 9 | Warehouse | Ion Nave night hour stays |

Each PR is fresh off latest `main`, never stacked.

## City — Neon Current (explore)

- Time: night. Palette, bloom, and brand gates stay frozen.
- Materials: Felt lock on neon / facade / explore shells. MeshBasic felt
  for dull and emissive trim. `envIntensity` stays 0.
- Play: hollow lofts + walk-up on the whoop corridor (`CITY_PLAY`).
  Open doors and windows, interior rooms, stairwells, roof holes,
  a 4 wu alley, and a spin grove (poles / lamps / trees).
- Lines: `city-inside` (Interior Run) and `city-spins` (Spin Grove) join
  the Daily Line pool. `city-loop` / `city-zigzag` stay 3-lap.
- Low: city-art `callsEst` ≤ 48. No rain / bloom / AO on Low.

## Living Room — Clay Parlor (reference)

- Time: overcast afternoon through a felt window.
- Palette: `#f4d6c6` plaster, `#7ec8e3` clay sky, `#ff6b9a` cushion,
  `#ffe08a` lamp, `#6b3f2a` walnut. Unchanged.
- Materials: MeshBasic clay / felt nap on the sofa, gummy lamp, walnut
  blocks. No PBR sheen.
- Lighting: soft hemi bounce, env ≤ 0.28, bloom off.
- Gates: clay rings, pastel, no metal.
- Low: no lanterns, steam, or glow. Same furniture AABBs as `buildLiving`.

## Garage — Volt Stall (PR 2)

- Time: night. Sodium + cyan tubes stay. Bloom on Med/High, never Low.
- Palette: `#ffb347` sodium, `#2de2e6` work tubes, `#3d4654` steel. Unchanged.
- Materials: MeshBasic felt / clay on the stall furniture. No PBR sheen.
- Lighting: felt bounce, env ≤ 0.28, hemi up. Night hour stays.
- Play: under-bench crawl, shelf-gap threads, hanging bike rim, car orbit,
  tire-stack dive, door / rafter gap, two toy-scale clutter clusters.
- Named lines: `garage-shelf`, `garage-orbit`, `garage-door`.
- Low: no glow pools, sparks, or puddles. Cardboard / clay boxes only.

## Backyard — Ryan's Yard (PR 4)

- Time: overcast afternoon. No hard sun. Bloom off.
- Palette: `#c4a882` stucco, `#c45a32` terracotta, `#2ec4b6` pool,
  `#3f8a4a` turf. Warm desert tan, not Jade Lot dusk.
- Materials: MeshBasic felt on house, turf, pool, PVC, palms. env ≤ 0.28.
- Play: patio → PVC practice gate → ficus trunk, pool skim along the
  full-length mesh fence, west side-alley dive over the wood gate,
  roof-ridge powerloop. Patio is furniture-free (planters + pavers only).
  No hoses, toys, chairs, or people.
- Named lines: `backyard-gate`, `backyard-pool`, `backyard-alley`,
  `backyard-spin` (Daily Line pool). Picker name: Backyard (Ryan's).
- Low: merged house / roof / deck / fence. No water shimmer.

## Photo → map (later)

Friend photos are reference only. Blockout in `sim-maps` `box()`, dress with
CC0 Kenney / Poly Haven retinted through this lock, then Garage-template
lines. Photos never ship.
