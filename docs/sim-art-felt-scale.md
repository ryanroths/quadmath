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
| 1 | Living Room (reference) + this bible + studio helpers | this PR |
| 2 | Your Room | Pocket Stage, same lock |
| 3 | Trainer | Licorice Grid |
| 4 | Office | Paper Sun; hard key allowed |
| 5 | Gym | Amber Court; hard key allowed |
| 6 | Garage | Volt Stall night hour stays |
| 7 | Warehouse | Ion Nave night hour stays |
| 8 | City | Neon Current night hour stays |

Each PR is fresh off latest `main`, never stacked.

## Living Room — Clay Parlor (reference)

- Time: overcast afternoon through a felt window.
- Palette: `#f4d6c6` plaster, `#7ec8e3` clay sky, `#ff6b9a` cushion,
  `#ffe08a` lamp, `#6b3f2a` walnut. Unchanged.
- Materials: MeshBasic clay / felt nap on the sofa, gummy lamp, walnut
  blocks. No PBR sheen.
- Lighting: soft hemi bounce, env ≤ 0.28, bloom off.
- Gates: clay rings, pastel, no metal.
- Low: no lanterns, steam, or glow. Same furniture AABBs as `buildLiving`.

## Photo → map (later)

Friend photos are reference only. Blockout in `sim-maps` `box()`, dress with
CC0 Kenney / Poly Haven retinted through this lock, then Garage-template
lines. Photos never ship.
