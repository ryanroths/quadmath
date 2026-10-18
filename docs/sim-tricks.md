# QuadMath freestyle trick definitions

Ryan-facing spec for the maneuver classifier in `sim-tricks.js`. Public FPV usage
(Rotor Riot tricktionary, FPV Compass, community terminology) was used for
**ideas only** — no copied wording or code. Correct these if a label feels wrong.

The detector does **not** run independent overlapping triggers. It segments a
rotation into one maneuver, then classifies it as **exactly one** label (most
specific wins). Atomic Flip / Roll / Yaw Spin only score when the maneuver is
not a bigger named trick. Spatial tricks (Hang, Dive, Gap, Proximity) only
score when no rotation segment is open.

Coordinates: physics Z-up, X-forward, Y-left. Pitch/roll/yaw below are
**body-axis integrals** (unwrapped). “Camera-forward” is body +X. “Against
travel” means camera-forward · velocity-hat is negative.

## Definitions

| Id | Name | Points | What it is (this sim) |
|---|---|---|---|
| `flip` | Flip | 200 | ~360° pitch in place. Little roll/yaw, little altitude loop, little travel. |
| `roll` | Roll | 200 | ~360° roll. Little pitch/yaw. Not a corkscrew. |
| `yawspin` | Yaw Spin | 250 | ~360° yaw while mostly upright. Little pitch/roll. |
| `powerloop` | Power Loop | 450 | ~360° pitch **around/over a line**. Nose **follows** the path (camera stays with velocity). Goes inverted. Exit heading ≈ entry. Altitude span + horizontal travel. |
| `matty` | Matty Flip | 600 | Full **backward** pitch while **momentum carries** the quad. Camera points **against** travel during the flip. Distinct from a power loop. |
| `halfmatty` | Half Matty | 350 | The 180° Matty: ~180° pitch, camera against travel, **heading reversed** at the end. Not a roll-then-pull. |
| `maverick` | Maverick | 650 | Maverick loop: under → over → back under (or out-and-back over an object) while the camera stays **forward-looking** (little/no inverted time). Pitch is real but **not** a full 360 through inverted. |
| `trippy` | Trippy Spin | 400 | Continuous roll (often inverted) plus yaw, traveling — a corkscrew / inverted-orbit, not a flat yaw spin. |
| `splits` | Split-S | 400 | **Half-roll to inverted**, then **pull** pitch to dive and reverse heading. Roll happens first. Altitude drops. |
| `hang` | Inverted Hang | 300 | Inverted **hover** in the air ≥0.75 s. Not turtled on the deck. Not the leftover inverted pose of a just-scored flip. |
| `dive` | Dive | 350 | Fast altitude dump at speed, nose down. Not the descending half of a loop that already classified. |
| `gap` | Gap Thread | 500 | Through a narrow opening / under a deck at speed. |
| `prox` | Proximity | 280 | Near-miss a wall at speed, not inside a gap. |

## Decision boundaries (pairs that confuse)

### Power Loop vs Matty Flip

Both can be ~360° pitch with travel. Split on **camera vs velocity** over the
maneuver:

- Power Loop: mean(camera · vel) **positive** — nose follows the loop.
- Matty: mean(camera · vel) **negative** — momentum carries the craft, camera
  looks backward along the original line.

Also: a power loop **closes heading** (in ≈ out) and has a clear altitude
span. A Matty may reverse apparent travel. If both scores are close, the
against/follow sign wins before Flip.

### Matty vs Half Matty

Same “camera against travel” family.

- Matty: |pitch| ≳ 300° (a full flip).
- Half Matty: |pitch| in ~140–250°, **heading change ≳ 90°** (ends reversed).

If the pilot continues through 360°, it is a Matty, not two Half Mattys
(one maneuver, one label).

### Split-S vs Half Matty

Both reverse heading and drop altitude.

- Split-S: **roll-first** (~180° roll, then pitch pull). |roll| and |pitch|
  both substantial; time-to-180° roll **before** time-to-180° pitch.
- Half Matty: **pitch-first / pitch-primary**. |roll| stays small.

### Maverick vs Power Loop

Similar out-and-back / over-an-object path.

- Power Loop: goes **inverted** (upZ strongly negative) and completes ~360°
  pitch; nose follows.
- Maverick: camera stays **forward-looking** — inverted fraction low, |pitch|
  stops short of a full flip through inverted. Path still has altitude span
  and returns toward the start (closure).

### Trippy Spin vs Yaw Spin

Both spin.

- Yaw Spin: |yaw| ≳ 300°, |roll| and |pitch| small, **upright**.
- Trippy Spin: |roll| ≳ 240° **and** meaningful yaw, usually inverted, while
  traveling. Corkscrew, not a flat pirouette.

### Flip vs Power Loop / Matty

A Flip is the leftover: ~360° pitch **without** the travel/span/follow of a
Power Loop and **without** the against-travel of a Matty.

## Segmentation

Start: body rate above a deadband, or attitude leaves upright **with** rate
(not hover wobble).

End: rates quiet for a short settle, or a max window (~2.4 s). Low-rate
inverted hover does **not** start a rotation segment (that is Hang).

Cruise / carving / hover wobble must classify as **none**.
