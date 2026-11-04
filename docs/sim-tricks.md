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

The page steps the detector on the **sim clock**: every 4 ms of sim time the
core hands it the latest physics tick (sim-core-adapter.js `SAMPLE_US`,
sim.html `onTrickSample`), whatever the frame rate. The HUD still draws once a
frame.

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
| `flip` | Flip | Beginner | 50 | 75 | **≥300° of pitch within any 1.2 s**, little net roll/yaw. Any speed, any travel. Front or back by the way the pitch turned (the pop says Front Flip / Back Flip). |
| `roll` | Roll | Beginner | 50 | 75 | **≥300° of roll within any 1.5 s at a mean rate of ≥250°/s**, little net pitch/yaw. Slower turns are not tricks. |
| `yawspin` | Yaw Spin | Beginner | 50 | 75 | Continuous ~360° yaw, mostly upright. |
| `maverick` | Maverick Loop | Beginner | 100 | 100 | Under → over → under. Camera stays **forward-looking**; never inverts. |
| `splits` | Split-S | Beginner | 100 | 100 | Over object, **180° roll**, dive the back, **pull** (pitch back) + throttle, pass **under flying forward**. |
| `cradle` | Cradle | Beginner | 150 | 150 | Pass an object, pitch back to keep it in view, level out **flying backward** clear of it. Not a flip. |
| `dive` | Building Dive | Beginner | 100 | 100 | Climb or start high, cut, nose down, fast altitude dump, level near the ground. |
| `gap` | Gap | Beginner | 125 | 125 | **Through an opening, in one face and out the other.** On the Rig, the House and the Warehouse, the map's authored gap volumes (crate slots, pipe and riser slits, tunnel, loft hole; bookshelf gap, under the patio table; rack shelves, the gap, the Ion hoop). Elsewhere a generic rule: walls on both sides within 2.5 frame widths of the path, passed through at least 10 cm; a floor or ceiling is never a side. 125 = TPW medium (12 in) gap. |
| `prox` | Proximity | Beginner | 150 | 150 | Wall near-miss at speed. Sim-only spatial; TPW Wall Ride/Tap need a knife-edge roll or tap we do not require. |
| `powerloop` | Powerloop | Novice | 200 | 200 | A **Flip whose path loops**: the path climbs **≥1.5 m** above the entry, comes back down to the entry height or below after its top, and the velocity turns **≥270°** in the vertical plane of the entry heading, the same way the flip turns. Otherwise it is a Flip. |
| `sideloop` | Side Loop | Novice | 200 | 225 | 90° **yaw** under the object, then a **roll-driven** vertical loop (roll + some yaw) over inverted, cut, reapply, level under. Carves a loop **sideways**, not a pitch Powerloop. Indoor 225 = TPW Under/Over. |
| `matty` | Matty Flip | Novice | 200 | 200 | Start **over**, **partial front flip** (pitch forward) keeping the object in view on the way down, throttle, level **flying backward under**. |
| `juicyflick` | Juicy Flick | Novice | 200 | 225 | Open-air: pitch **forward** with throttle to inverted, then a prompt **180° roll**. Travel stays forward. |
| `snapback` | Snapback | Novice | 200 | 225 | Pitch **back** to inverted (half-loop style), then a prompt **180° roll**. Not a completed Powerloop. |
| `halfmatty` | Half Matty | Intermediate | 350 | 350 | **180° roll first**, then the second half of a Matty, ending **backward under**. Optional stall after the roll. |
| `cubik` | Cubik's Rube | Intermediate | 350 | 450 | 180° roll → 360° flip → 180° roll, same roll direction. Open air. |
| `rubik` | Rubik's Cube | Intermediate | 325 | 450 | 180° flip → 360° roll → 180° flip, same pitch direction. Open air. |
| `ham` | Ham Spin | Intermediate | 300 | 300 | **Inverted yaw spin**: ≥360° yaw in ≤1.8s, little roll/pitch/drift, **upside-down the whole time** (tilt >135° from level). Also called ham. Flips/rolls that only pass through inverted, and upright yaw, are not Ham. |
| `trippy` | Trippy Spin | Intermediate | 500 | 500 | **≥720° of yaw at ≥300°/s while the path orbits a centre**: radius 0.3–2.5 m (the path's curvature), its direction turning a **full 360°** one way over the whole spin, at ≥1 m/s. Yaw is the turn about the vertical, so a tilted spin counts in full. Upright or inverted. A nearby pole/post at the centre (within 0.5 m) is a bonus: 1.25× points. |
| `barani` | Barani | Novice | 100 | 125 | **A flip with a half twist**: ≥300° of pitch and 180 ± 45° of roll inside the same 1.5 s, ending upright (the twist at the vertical). Scores above Flip. |

## Decision boundaries

### Flip, Roll, Powerloop: rotation first, path second

- Flip is decided by the rotation alone: ≥300° of pitch inside a 1.2 s
  window of the segment. Speed and travel do not matter. A pitch rotation that
  big is **never nothing**: when no trick reaches the 0.42 score (its roll or
  yaw too big for Flip's own terms), it is a Flip.
- Powerloop is a Flip plus a path that loops (climb ≥1.5 m, back down to or
  below the entry, ≥270° of velocity turn). A flip at speed whose path stays
  straight is a Flip, not nothing.
- Roll is ≥300° of roll inside a 1.5 s window at ≥250°/s on average between
  the window's two ends. A slow rolling turnaround (the Fractal75's after a
  punch: 300°+ over 3–4.5 s at under 272°/s) is not a Roll.

### Powerloop vs Matty Flip

These are **not** the same family.

- Powerloop: a flip, normally **back** pitch (pull), whose **path loops**:
  it climbs ≥1.5 m, comes back down to the entry height or below, and the
  velocity turns ≥270° the way the pitch turns.
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

- Powerloop: a full flip (≥300° of pitch within 1.2 s) on a looping path.
  Net pitch ≈ path pitch.
- Maverick: camera stays **forward-looking**; brief invert is allowed but
  it is not a full flip. Pitch is an **S-curve** (path pitch ≫ net pitch).
  Often flies **backward** over the object while still looking forward, so
  follow vs against is **not** the split. Heading in ≈ out.

### Trippy Spin vs Yaw Spin vs Ham Spin

- Yaw Spin: ~360° yaw, **little** roll/pitch, **upright**, open air OK.
- Ham Spin (ham): the same short-window ≥360° yaw and little drift, but
  **inverted the whole time** (tilt more than 135° from level). Open air
  OK. A flip or roll that only passes through inverted is not Ham — those
  have large pitch/roll and an upright start or exit. Normal upright yaw
  is a Yaw Spin, not Ham.
- Trippy Spin: **≥720° of yaw at ≥300°/s while the path orbits**. The
  yaw is the turn about the vertical (a tilted spin turns the heading at
  the full rate). Over the whole spin (for as long as the yaw keeps
  turning the same way at 240°/s or more) the path goes all the way round
  a centre: radius 0.3–2.5 m, its direction turning a full turn (360°) or
  more, one way, at 1 m/s or more. Half or three-quarters of an orbit is
  not a Trippy. Upright or inverted: an inverted spin that orbits is a
  Trippy, not Ham. A spin in place (no orbit) is a Yaw Spin or Ham Spin;
  a camera-lock orbit with one turn of yaw per orbit is not a Trippy.
  A nearby pole or post (a collider at most 0.5 m across and 1 m tall)
  within 0.5 m of the orbit's centre earns 1.25× the points.
- A coordinated turn, carve, or slight yaw is not a Trippy — those stay
  well under 720° of yaw.

### Barani vs Flip vs Juicy Flick

- Barani: a full flip (≥300° of pitch) **and** a half twist (180 ± 45° of
  roll) inside one 1.5 s window, ending upright. The twist comes at the
  vertical (nose straight down or up); twisted while inverted, the quad
  ends upside down and it is not a Barani.
- Flip: the pitch with little roll. Juicy Flick: half a flip to inverted,
  then a 180° roll.

### Gap: authored first

- The Rig, the House and the Warehouse carry their intentional gaps as
  volumes (sim-maps.js `mapGaps`). A pass goes in through one face across
  the volume's axis and out through the opposite face: flown through. In
  or out through a side is a skim and does not score. A pass during a
  rotation scores when the rotation ends (within 1 s). One volume scores
  again only after 1 s.
- Generic fallback, away from authored volumes (and 0.3 m clear of them):
  walls on both sides of the path, along the axis it moves most along,
  each within 2.5 frame widths of it (about 0.2 m on the Air65), passed
  through at least 10 cm and out the far end. A floor or ceiling is never a
  side: flying under a loft or a deck is not a gap.

### How to record a real trace

1. Freestyle, Tune panel → **Trick debug** (or `?trickdebug=1`).
2. Fly the maneuver. The overlay shows `rec N` while the window is live.
3. When it settles, click **Copy last trace**. That JSON is gyro
   (`ox,oy,oz`), attitude (`qx…qw`), stick (`sr,sp,sy`), and throttle.
4. Paste it to Ryan / an issue. Replay is `kind: quadmath-trick-trace`.
5. With `?tricks=debug`, the overlay's **Copy trick log** button copies every
   attempt it logged (one JSON line each, `kind: quadmath-trick-attempt`):
   every candidate's terms, the gap passes and skims, the dives.

### Side Loop vs Powerloop / Roll / Trippy

- Powerloop: **pitch-back** loop in the travel plane. Little roll/yaw.
- Side Loop: **yaw first** (~90°), then a **roll** loop (roll + some yaw)
  that carves a **vertical loop sideways**. Pitch stays small. Goes inverted
  over the top. Novice Jump Rope, same outdoor points as Powerloop.
- Roll: ~360° roll, little yaw, little altitude span. A Side Loop has
  both yaw and a loop-sized altitude span, so it is not a Roll.
- Trippy: **≥720° of yaw** while orbiting a centre (a nearby pole/tree a
  bonus), not yaw-then-roll, not a completed vertical loop, not a
  coordinated turn.

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

Start: body rate above a deadband tuned so **Actual/KISS half-stick**
(typical whoop Actual ~20°/s center, ~740°/s max) still opens a window.
Inverted hover alone does not start one. A throttle-cut building dive
(fast downward, modest rate) does not steal the dive spatial detector.

End: rates quiet for a short settle, or a max window (~4.5 s, long enough
for a slow camera-lock orbit). While
**inverted**, settle is longer so a Cradle does not split on a brief
rate dip.

Cruise / carving / hover wobble must classify as **none**.

## Added vs skipped

**Added** (besides the original set, retuned to TPW): Cradle, Juicy Flick,
Snapback, Rubik's Cube, Cubik's Rube, **Side Loop**, **Ham Spin**. Each has a distinct
axis-order or pitch-sign signature. The matrix covers both the synthetic
rad/s library and **pilot traces** (imperfect stick, varying throttle,
Actual/KISS curves from `sim-rates.js`).

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
- **Inverted Yaw Tracking / Uh-uh** — extra inverted-yaw flavors beyond
  Ham Spin. Ham covers the sustained inverted 360° yaw; tracking / uh-uh
  variants need camera-on-object features we do not have.
- **Wall Tap / Wall Ride / Ceiling Tap / Perch / Slide / Face Punch** — need
  a judged tap, land, or the pilot's face.
- **Double Flip / Double Roll / Segmented Flip** — 720° or a 0.5 s stall
  mid-trick; our window would split or merge unpredictably.
- **KWAD objectives, custom building-blocks** — event / calculator, not live
  detection.

Ryan can correct names, tiers, or points here; the classifier reads
`TRICK_LIST` in `sim-tricks.js`.
