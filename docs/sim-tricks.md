# QuadMath freestyle trick definitions

Ryan-facing spec for the maneuver classifier in `sim-tricks.js`.

Trick definitions and point values based on Tyrantt's Pro Whooper tricktionary,
[prowhooper.com](https://prowhooper.com). Paraphrased in our own words — this
file is not their text, and we do not vendor their JSON.

The detector does **not** run independent overlapping triggers. It segments a
rotation into one maneuver, then classifies it as **exactly one** label (most
specific wins). Atomic Flip / Roll / Yaw Spin only score when the maneuver is
not a bigger named trick. Spatial tricks (Dive, Gap, Proximity) only score when
no rotation segment is open.

Coordinates: physics Z-up, X-forward, Y-left. Pitch/roll/yaw below are
**body-axis integrals** (unwrapped). Camera-forward is body +X. Stick pitch up
= nose down = **front** flip (positive pitch). Stick pitch down = **pull** /
backflip (negative pitch).

Many TPW loops are object-relative (under/over a bar, table, gate). The
classifier uses collider under/over/near as a **bonus** feature. Open-air
(no collider) still classifies from motion — a lenient fallback so City
freestyle without a pole still scores.

## Definitions (supported)

Points are TPW **Outdoors**. Indoor maps use the TPW **Indoors** column when
the site lists one; otherwise Outdoors. Roll uses **50** (spreadsheet; the
site lists both 150 and 50).

| Id | Name | Tier | Out | In | Detection essence |
|---|---|---|---|---|---|
| `flip` | Flip | Beginner | 50 | 75 | Continuous ~360° pitch, little roll/yaw, little travel. Front or back. |
| `roll` | Roll | Beginner | 50 | 75 | Continuous ~360° roll, little pitch/yaw. |
| `yawspin` | Yaw Spin | Beginner | 50 | 75 | Continuous ~360° yaw, mostly upright. |
| `maverick` | Maverick Loop | Beginner | 100 | 100 | Under → over → under. Camera stays **forward-looking**; never inverts. |
| `splits` | Split-S | Beginner | 100 | 100 | Over object, **180° roll**, dive the back, **pull** (pitch back) + throttle, pass **under flying forward**. |
| `cradle` | Cradle | Beginner | 150 | 150 | Pass an object, pitch back to keep it in view, level out **flying backward** clear of it. Not a flip. |
| `dive` | Building Dive | Beginner | 100 | 100 | Climb or start high, cut, nose down, fast altitude dump, level near the ground. |
| `gap` | Gap | Beginner | 125 | 125 | Through a narrow opening at speed. 125 = TPW medium (12 in) gap. |
| `prox` | Proximity | Beginner | 150 | 150 | Wall near-miss at speed. Sim-only spatial; TPW Wall Ride/Tap need a knife-edge roll or tap we do not require. |
| `powerloop` | Powerloop | Novice | 200 | 200 | Start **under**, **pitch back** + throttle over until inverted, cut still pitching back, reapply, level **under**. Nose follows. Heading in ≈ out. |
| `matty` | Matty Flip | Novice | 200 | 200 | Start **over**, **partial front flip** (pitch forward) keeping the object in view on the way down, throttle, level **flying backward under**. |
| `juicyflick` | Juicy Flick | Novice | 200 | 225 | Open-air: pitch **forward** with throttle to inverted, then a prompt **180° roll**. Travel stays forward. |
| `snapback` | Snapback | Novice | 200 | 225 | Pitch **back** to inverted (half-loop style), then a prompt **180° roll**. Not a completed Powerloop. |
| `halfmatty` | Half Matty | Intermediate | 350 | 350 | **180° roll first**, then the second half of a Matty, ending **backward under**. Optional stall after the roll. |
| `cubik` | Cubik's Rube | Intermediate | 350 | 450 | 180° roll → 360° flip → 180° roll, same roll direction. Open air. |
| `rubik` | Rubik's Cube | Intermediate | 325 | 450 | 180° flip → 360° roll → 180° flip, same pitch direction. Open air. |
| `trippy` | Trippy Spin | Intermediate | 500 | 500 | From a Cradle: inverted, object top-of-screen, **opposite** roll + yaw orbit. Object-relative inverted orbit, not an open-air corkscrew. |

## Decision boundaries

### Powerloop vs Matty Flip

These are **not** the same family.

- Powerloop: starts **under**, **back** pitch (pull) through inverted, nose
  **follows** velocity, closes, heading in ≈ out.
- Matty: starts **over**, **front** pitch (nose down) over the object, camera
  on the object while descending, exits **backward under**.

Pitch **sign** is the primary split. A Powerloop must never also score as Matty.

### Matty vs Half Matty

- Matty: pitch-primary front flip from above. Little roll.
- Half Matty: **roll-first** (~180°), then Matty's second half (front pitch),
  exit backward. One maneuver, one label — continuing through a full Matty is
  a Matty, not a Half Matty plus something.

### Split-S vs Half Matty

Both start with a 180° roll over/near an object and drop.

- Split-S: after the roll, **pull** (pitch back) and fly **forward** out under.
- Half Matty: after the roll, **front** pitch (Matty second half) and fly
  **backward** under.

Pitch sign after the roll + exit follow vs against.

### Maverick Loop vs Powerloop

Same under → over → under path.

- Powerloop: goes **inverted**, ~360° back pitch, nose follows.
- Maverick: **never inverts**. Camera stays forward-looking the whole time.
  Pitch is an S-curve (back then forward), not a full flip.

### Trippy Spin vs Yaw Spin

- Yaw Spin: ~360° yaw, little roll/pitch, **upright**, no object required.
- Trippy Spin: **inverted** orbit, roll and yaw in **opposite** directions,
  object kept top-center. Open-air corkscrew (same-sign roll+yaw, no object)
  is **not** a Trippy.

### Juicy Flick vs Snapback vs Split-S vs Immelmann (skipped)

- Juicy Flick: **front** pitch to inverted, then 180° roll. Exits forward.
- Snapback: **back** pitch to inverted, then 180° roll. Does not finish a loop.
- Split-S: **roll first**, then pull. Opposite order from Juicy/Snapback.
- Immelmann (not detected): Powerloop to the peak + 180° roll, fly away at
  the top. Too close to Snapback without a reliable “exits at the peak”
  feature, so it is skipped.

### Rubik's Cube vs Cubik's Rube

Site wording (not the spreadsheet, which swaps them):

- Rubik: 180 **flip**, 360 **roll**, 180 **flip**.
- Cubik: 180 **roll**, 360 **flip**, 180 **roll**.

Order of the 180° axis is the split.

### Cradle vs Maverick / Matty

- Cradle: look-back at a passed object, then level **backward**. Small invert
  fraction. Not a loop closure.
- Maverick: altitude span + path closure, heading in ≈ out, forward-looking.
- Matty: inverted front flip from above.

## Scoring (TPW-inspired)

Combo chain / multiplier is **ours** (TPW never defines combo math). We keep
`comboMul` (1, 1.5, … cap 6) and a small unique-trick bonus (×1.1 / ×1.2).

TPW rules we do use:

- **Repeat** of the same trick in a session: 100/75/50/0% (1st / 2nd / 3rd / 4th+).
- **Back-to-back** same trick: 1st of the run full, then ×0.5, ×0.25, …
  (compounding −50%). Stacks with repeat. Ends the combo window.
- **Sloppy** (broken constant loop motion — a mid-maneuver pause then the
  rotation resumes): ×0.65. Ends combo.
- **Bump** (contact during the maneuver): ×0.50. Ends combo.
- **Crash / disarm while a rotation is live**: that maneuver is 0. Combo
  already in the bank stays (our combo). Streak resets to 1.0.

**Streak** (simple Showdown-style): multiplier starts at 1.0. After a scored
trick, add `basePoints / 10000` (a 500-pt trick → +5%), cap 2.0. Applied to
the **next** trick. Crash resets to 1.0. Bump halves it, floored at 1.0.
TotW, KWAD, obstacle-of-the-week, and obstacle-switching are **not**
implemented (event rules, not a sim HUD).

## Segmentation

Start: body rate above a deadband (inverted hover alone does not start a
window).

End: rates quiet for a short settle, or a max window (~2.8 s).

Cruise / carving / hover wobble must classify as **none**.

## Added vs skipped

**Added** (besides the original set, retuned to TPW): Cradle, Juicy Flick,
Snapback, Rubik's Cube, Cubik's Rube. Each has a distinct axis-order or
pitch-sign signature and a clean synthetic matrix.

**Skipped** (and why):

- **Inverted Hang** — not a TPW trick.
- **Barani / Power Swap** — Barani requires horizon or back-wall in view
  before the inverted yaw; without a camera feature they collapse into
  “half loop + 180 yaw vs 180 roll”. Too easy to steal Powerloop / Matty.
- **Immelmann / Mavvelmann** — Snapback-shaped (pitch to inverted + 180 roll)
  without a stable “exit at the peak vs under the object” split.
- **Anti Matty / Power Matty / Matty Roll / …** — extra flips on a Matty;
  would double-count or steal Matty.
- **Orbits / Jump Rope / Cinnamon / Trippy Switch / Pole Dance** — need
  sustained object tracking and multi-orbit counts; false-positive on carve.
- **Inverted Yaw Tracking / Inverted Yaw Spin / Uh-uh** — yaw-while-inverted
  recipes that collide with Trippy and Snapback.
- **Wall Tap / Wall Ride / Ceiling Tap / Perch / Slide / Face Punch** — need
  a judged tap, land, or the pilot's face.
- **Double Flip / Double Roll / Segmented Flip** — 720° or a 0.5 s stall
  mid-trick; our window would split or merge unpredictably.
- **KWAD objectives, custom building-blocks** — event / calculator, not live
  detection.

Ryan can correct names, tiers, or points here; the classifier reads
`TRICK_LIST` in `sim-tricks.js`.
