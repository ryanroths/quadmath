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
owner's Matty, Half Matty and Half Mavvy need one: over it, under it or
through an authored gap (the phase matcher, below). Elsewhere colliders are a
**bonus** feature, and open air (no collider) still classifies from motion, so
City freestyle without a pole still scores.

## Definitions (supported)

Points are TPW **Outdoors**. Indoor maps use the TPW **Indoors** column when
the site lists one; otherwise Outdoors. Roll uses **50** (spreadsheet; the
site lists both 150 and 50).

| Id | Name | Tier | Out | In | Detection essence |
|---|---|---|---|---|---|
| `flip` | Flip | Beginner | 50 | 75 | Phase matcher: **≥300° of pitch within any 1.2 s**, little net roll/yaw. Any speed, any travel. Front or back by the way the pitch turned (the pop says Front Flip / Back Flip). |
| `roll` | Roll | Beginner | 50 | 75 | **≥300° of roll within any 1.5 s at a mean rate of ≥250°/s**, little net pitch/yaw. Slower turns are not tricks. |
| `yawspin` | Yaw Spin | Beginner | 50 | 75 | Continuous ~360° yaw, mostly upright. |
| `maverick` | Maverick Loop | Beginner | 100 | 100 | Phase matcher: **back pitch 150–210° climbing ≥1 m to an inverted top**, then a **forward pitch ≥60°** that stops the loop, then **back towards the entry against the nose** (velocity·nose ≤ −0.3 on average) for **≥0.3 s**. Back out through the authored gap it came in by (passed at most 1.5 s before, or in the maneuver): **1.25×** points. |
| `splits` | Split-S | Beginner | 100 | 100 | Phase matcher: a **roll of 103–258°**, then a **back pitch of 69–258°** (pull), the path dropping ≥0.35 m, flying with the nose. The old terms' tolerances, so it fires where it did. |
| `immelmann` | Immelmann | Beginner | 100 | 100 | Phase matcher, the Split-S's mirror: **back pitch 180 ± 45° climbing ≥1 m**, then a **roll of 180 ± 45°**, ending **upright**, the **heading reversed** (180 ± 45°), **out higher** than in. |
| `cradle` | Cradle | Beginner | 150 | 150 | Pass an object, pitch back to keep it in view, level out **flying backward** clear of it. Not a flip. |
| `dive` | Building Dive | Beginner | 100 | 100 | Climb or start high, cut, nose down, fast altitude dump, level near the ground. |
| `gap` | Gap | Beginner | 125 | 125 | **Through an opening, in one face and out the other.** On the Rig, the House and the Warehouse, the map's authored gap volumes (crate slots, pipe and riser slits, tunnel, loft hole; bookshelf gap, under the patio table; rack shelves, the gap, the Ion hoop). Elsewhere a generic rule: walls on both sides within 2.5 frame widths of the path, passed through at least 10 cm; a floor or ceiling is never a side. 125 = TPW medium (12 in) gap. |
| `prox` | Proximity | Beginner | 150 | 150 | Wall near-miss at speed. Sim-only spatial; TPW Wall Ride/Tap need a knife-edge roll or tap we do not require. |
| `powerloop` | Powerloop | Novice | 200 | 200 | Phase matcher: **≥300° of pitch within any 3.5 s** (its own window: a loop is slower than a flip), little net roll/yaw, on a **path that loops**: it climbs **≥1.5 m** above the entry, after its top comes back down to **at most 1.5 m above the entry**, and the velocity turns **≥270°** in the vertical plane of the entry heading, the way the pitch turns. Otherwise a flip is a Flip. Loops are counted over the whole turn of pitch: **≥600° is a Double Powerloop**, then one more loop per further 360° (Triple from 960°); each loop scores the 200 points. |
| `sideloop` | Side Loop | Novice | 200 | 225 | 90° **yaw** under the object, then a **roll-driven** vertical loop (roll + some yaw) over inverted, cut, reapply, level under. Carves a loop **sideways**, not a pitch Powerloop. Indoor 225 = TPW Under/Over. |
| `matty` | Matty Flip | Novice | 200 | 200 | Phase matcher: a **forward-pitch loop ≥300°** climbing **≥1 m over an object** (the object below at or before the top), then **down behind and under or through it** (an object above, or an authored gap), ending **upright**. |
| `juicyflick` | Juicy Flick | Novice | 200 | 225 | Open-air: pitch **forward** with throttle to inverted, then a prompt **180° roll**. Travel stays forward. |
| `snapback` | Snapback | Novice | 200 | 225 | Pitch **back** to inverted (half-loop style), then a prompt **180° roll**. Not a completed Powerloop. |
| `halfmatty` | Half Matty | Intermediate | 350 | 350 | Phase matcher: a Matty's **first 180 ± 45°** of forward pitch, climbing **≥1 m over the object**, ending **inverted** (nose down behind it). |
| `halfmavvy` | Half Mavvy | Intermediate | 400 | 400 | Phase matcher: a **back pitch climbing ≥1 m** (60–225°), a **roll of 180 ± 45°**, then a **forward pitch** (60–225°) down **under or through the object**, flown blind like a Matty's second half, ending **upright**. The two pitches add to about 180° (see below). Scores above Maverick and Matty. |
| `cubik` | Cubik's Rube | Intermediate | 350 | 450 | 180° roll → 360° flip → 180° roll, same roll direction. Open air. |
| `rubik` | Rubik's Cube | Intermediate | 325 | 450 | 180° flip → 360° roll → 180° flip, same pitch direction. Open air. |
| `ham` | Ham Spin | Intermediate | 300 | 300 | **Inverted yaw spin**: **≥300° of yaw counted only while inverted** (up-Z below −0.5, tilted more than 120° from level). The yaw is the turn about the vertical. A **half flip in and a half flip out are allowed** and the whole maneuver is one Ham, not a Flip: the flips turn little about the vertical. A flip or roll that only passes through inverted, and upright yaw, are not Ham; a full Roll stays a Roll, and an inverted spin that orbits is a Trippy. Also called ham. |
| `trippy` | Trippy Spin | Intermediate | 500 | 500 | **≥360° of yaw at ≥150°/s while the path orbits a centre ≥360°**: radius 0.3–2.5 m (the path's curvature), its direction turning a **full 360°** one way over the whole spin, at ≥1 m/s. Yaw is the turn about the vertical, so a tilted spin counts in full. Upright or inverted; the body may roll as it spins (the owner's rolls 600–780°). A nearby pole/post at the centre (within 0.5 m) is a bonus: 1.25× points. |
| `barani` | Barani | Novice | 100 | 125 | **A flip with a half twist**: ≥300° of pitch and 180 ± 45° of roll inside the same 1.5 s, ending upright (the twist at the vertical). Scores above Flip. |

## Decision boundaries

### Phase matcher

Flip, Powerloop, Split-S, Immelmann, Maverick, Matty, Half Matty and Half
Mavvy are one matcher in `sim-tricks.js` (`PHASE_SPECS`, `measureSpec`): each
is **ordered phases** in one segment of at most 4.5 s. A phase is a turn about
one axis (pitch, roll, or the turn about the vertical) in a stated way (pitch
**back = nose up**, the Powerloop's way; **forward = nose down**, a front
flip's) and size, 180 ± 45° unless the trick says otherwise. A phase may
also ask:

- a **climb**: its highest point that far above where it began;
- an **end state**: upright (up-Z ≥ 0.5) or inverted (≤ −0.5);
- an **object over** (one below the quad at or before the phase's top) or
  **under / through** (after the top, one above it, or an authored gap
  passed).

The phases follow one another. Before the first and after the last, pitch
and roll each turn at most 45°; inside a phase, the other of the two turns
at most 45°, and its own axis turns back against its way at most 45° (a
phase is one turn, not one and part of the next). A trick may also ask of
the whole segment: an end state, a **heading change**, a **drop or climb**
from entry to exit, and a **velocity-vs-nose** stretch (the Maverick's tail:
the last stretch flown back towards the entry with velocity·nose ≤ −0.3).
The matcher finds the best phase bounds in the segment's history (every
4 ms row, scanned on at most 200) and scores the trick 0–1; that score is
the trick's term in the classifier.

Flip and Powerloop are one phase each, the largest turn of pitch inside
their window (1.2 s, 3.5 s); Split-S is a half roll then a back pitch. Their
scores are exactly their old terms, so on the owner's two logs they fire
where they did. Maverick, Matty and Half Matty are the owner's definitions;
Immelmann and Half Mavvy are new. On the logs that changes eight labels
(docs/sim-tricks-audit.md section 9).

The Half Mavvy's end state: a back pitch, a 180° roll and a forward pitch
end upright only when the two pitches add to about 180° (120–240°: a pull to
the vertical, the roll there, the fall over the other way, blind, like a
Matty's second half). A half loop back (180°), the roll and a forward half
flip (180°) end inverted, facing the way the quad came.

### Flip, Roll, Powerloop: rotation first, path second

- Flip is decided by the rotation alone: ≥300° of pitch inside a 1.2 s
  window of the segment. Speed and travel do not matter. A pitch rotation that
  big is **never nothing**: when no trick reaches the 0.42 score (its roll or
  yaw too big for Flip's own terms), it is a Flip.
- Powerloop has its own window: ≥300° of pitch inside 3.5 s (a slow loop
  turns 150–200°/s, under a Flip's 300° in 1.2 s), on a path that loops
  (climb ≥1.5 m, back down to at most 1.5 m above the entry, ≥270° of
  velocity turn). A flip at speed whose path stays straight is a Flip, not
  nothing. Two loops (≥600° of pitch) are one Double Powerloop.
- Roll is ≥300° of roll inside a 1.5 s window at ≥250°/s on average between
  the window's two ends. A slow rolling turnaround (the Fractal75's after a
  punch: 300°+ over 3–4.5 s at under 272°/s) is not a Roll.

### Powerloop vs Matty Flip

These are **not** the same family.

- Powerloop: a flip, normally **back** pitch (pull), whose **path loops**:
  ≥300° of pitch inside 3.5 s, it climbs ≥1.5 m, comes back down to at most
  1.5 m above the entry, and the velocity turns ≥270° the way the pitch turns.
- Matty: a **forward** loop (nose down) of ≥300° climbing ≥1 m **over an
  object**, down behind it and **under or through** it, upright. Without the
  object it is a Flip.

Pitch **sign** is the primary split. A Powerloop must never also score as Matty.

### Matty vs Half Matty

- Matty: the whole forward loop round the object, ≥300°, upright at the end.
- Half Matty: its first 180 ± 45°, over the object, **ending inverted**
  behind it. One maneuver, one label — continuing through a full Matty is
  a Matty, not a Half Matty plus something.

### Split-S vs Half Matty

- Split-S: a half roll first, then a **pull** (back pitch), dropping, flying
  **forward** out.
- Half Matty: no roll: a **forward** half loop over an object, climbing,
  ending inverted.

### Maverick Loop vs Powerloop

- Powerloop: a full loop of pitch (≥300° within 3.5 s) on a looping path.
  Net pitch ≈ path pitch.
- Maverick: half a loop back (150–210°) to an **inverted top**, then the
  pitch **reverses** (forward ≥60°) and the quad flies back towards the
  entry **against the nose** (camera away from where it goes). Path pitch ≫
  net pitch. Back out through the gap it came in by is the bonus.

### Half Mavvy vs Maverick

- Maverick: back, then forward, no roll; flown back against the nose.
- Half Mavvy: back (climbing), a **half roll**, then forward down under or
  through the object, upright. The roll is the split; Half Mavvy scores
  above both Maverick and Matty.

### Immelmann vs Split-S

Mirrors: the same two turns in the other order and the other way up.

- Split-S: roll, then pull; the path **drops**, flying out with the nose.
- Immelmann: pull (a back half loop) **climbing ≥1 m**, then roll; upright,
  the heading reversed, **out higher** than in. A back half flip and a half
  roll without the climb, or out lower, is a Snapback.

### Trippy Spin vs Yaw Spin vs Ham Spin

- Yaw Spin: ~360° yaw, **little** roll/pitch, **upright**, open air OK.
- Ham Spin (ham), the inverted yaw spin: **≥300° of yaw while inverted**.
  Only the yaw made while up-Z is below −0.5 (tilted more than 120° from
  level) counts, and the yaw is the turn about the vertical, as for
  Trippy. Ham allows inverted the whole time or flipped into and out of: a half flip
  in, the yaw upside down and a half flip out is one Ham, not a Flip (the
  owner's: 330–385° of pitch round 304–318° of turn about the vertical,
  inverted for 55–65 % of the segment). Yaw made while tilting in or out
  counts little or not at all: run 0.1 s into each flip, 340–350° of stick
  yaw turns only 190–275° inverted. A flip or roll that only passes through inverted turns little
  about the vertical there, so it is not Ham; a full Roll (≥300° in 1.5 s
  at ≥250°/s) that also turns about the vertical stays a Roll. Normal
  upright yaw is a Yaw Spin, not Ham.
- Trippy Spin: **≥360° of yaw at ≥150°/s while the path orbits ≥360°**.
  The yaw is the turn about the vertical (a tilted spin turns the heading at
  the full rate); the body may roll as it spins. Over the whole spin (for as
  long as the yaw keeps turning the same way at 120°/s or more) the path goes all the way round
  a centre: radius 0.3–2.5 m, its direction turning a full turn (360°) or
  more, one way, at 1 m/s or more. Half or three-quarters of an orbit is
  not a Trippy. Upright or inverted: an inverted spin that orbits is a
  Trippy, not Ham. A spin in place (no orbit) is a Yaw Spin or Ham Spin.
  A camera-lock orbit (one turn of yaw per orbit) is a Trippy when it is
  tight and fast enough: 0.3–2.5 m at 150°/s or more.
  A nearby pole or post (a collider at most 0.5 m across and 1 m tall)
  within 0.5 m of the orbit's centre earns 1.25× the points.
- A coordinated turn, carve, or slight yaw is not a Trippy — those do not
  go all the way round a centre 2.5 m or closer at 150°/s.

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
- Trippy: **≥360° of yaw** while orbiting a centre (a nearby pole/tree a
  bonus), not yaw-then-roll, not a completed vertical loop, not a
  coordinated turn.

### Juicy Flick vs Snapback vs Split-S vs Immelmann

- Juicy Flick: **front** pitch to inverted, then 180° roll. Exits forward.
- Snapback: **back** pitch to inverted, then 180° roll. Does not finish a loop.
- Split-S: **roll first**, then pull. Opposite order from Juicy/Snapback.
- Immelmann: a Snapback's turns climbing ≥1 m in the half loop, heading
  reversed and out higher than in (the phase matcher). It scores above
  Snapback where both match.

### Rubik's Cube vs Cubik's Rube

Site wording (not the spreadsheet, which swaps them):

- Rubik: 180 **flip**, 360 **roll**, 180 **flip**.
- Cubik: 180 **roll**, 360 **flip**, 180 **roll**.

Order of the 180° axis is the split.

### Cradle vs Maverick / Matty

- Cradle: look-back at a passed object, then level **backward**. Small invert
  fraction. Not a loop closure.
- Maverick: a back half loop to an inverted top, the pitch reversed, flown
  back against the nose.
- Matty: a forward loop round an object.

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
for a slow camera-lock orbit). A **sustained** rotation runs past it while
it keeps turning, up to **10 s**: a turn about the vertical at Trippy's
rate (≥360° at ≥150°/s: a Trippy, a Yaw Spin) while it keeps 120°/s over
the last 0.5 s, or a loop's pitch (≥300° in 3.5 s with the velocity
turning: a run of Powerloops) while it keeps 69°/s. So a long Trippy is
one Trippy and a double loop one Double Powerloop. While
**inverted**, settle is longer so a Cradle does not split on a brief
rate dip.

Cruise / carving / hover wobble must classify as **none**.

## Added vs skipped

**Added** (besides the original set, retuned to TPW): Cradle, Juicy Flick,
Snapback, Rubik's Cube, Cubik's Rube, **Side Loop**, **Ham Spin**, and from
the phase matcher **Immelmann** and **Half Mavvy**. Each has a distinct
axis-order or pitch-sign signature. The matrix covers both the synthetic
rad/s library and **pilot traces** (imperfect stick, varying throttle,
Actual/KISS curves from `sim-rates.js`).

**Skipped** (and why):

- **Inverted Hang** — not a TPW trick.
- **Barani / Power Swap** — Barani requires horizon or back-wall in view
  before the inverted yaw; without a camera feature they collapse into
  “half loop + 180 yaw vs 180 roll”. Too easy to steal Powerloop / Matty.
- **Mavvelmann** — a Maverick into an Immelmann; not defined yet.
- **Anti Matty / Power Matty / Matty Roll / …** — extra flips on a Matty;
  would double-count or steal Matty.
- **Orbits / Jump Rope / Cinnamon / Trippy Switch / Pole Dance** — need
  sustained object tracking and multi-orbit counts; false-positive on carve.
- **Inverted Yaw Tracking / Uh-uh** — extra inverted-yaw flavors beyond
  Ham Spin. Ham covers the inverted yaw (≥300°, flipped into and out of or
  not); tracking / uh-uh
  variants need camera-on-object features we do not have.
- **Wall Tap / Wall Ride / Ceiling Tap / Perch / Slide / Face Punch** — need
  a judged tap, land, or the pilot's face.
- **Double Flip / Double Roll / Segmented Flip** — 720° or a 0.5 s stall
  mid-trick; our window would split or merge unpredictably.
- **KWAD objectives, custom building-blocks** — event / calculator, not live
  detection.

Ryan can correct names, tiers, or points here; the classifier reads
`TRICK_LIST` in `sim-tricks.js`.
