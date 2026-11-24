# QuadMath freestyle trick definitions

Ryan-facing spec for the maneuver classifier in `sim-tricks.js`.

Trick definitions and point values based on Tyrantt's Pro Whooper tricktionary,
[prowhooper.com](https://prowhooper.com). Paraphrased in our own words — this
file is not their text, and we do not vendor their JSON.

The detector does **not** run independent overlapping triggers. It segments a
rotation into one maneuver, then classifies it as **exactly one** label (most
specific wins). Atomic Flip / Roll / Yaw Spin only score when the maneuver is
not a bigger named trick. Spatial tricks (Dive, Proximity) only score when
no rotation segment is open. The Cradle is the exception: a **path event**,
two passes round a post, called at the second pass whatever the rotation is
doing (an open segment closes there as the Cradle; see "The Cradle" below).
Flying through a gap is not a trick and scores nothing (Gap Hunt answers
it; see "Gap passes (not a trick)" below).

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
through an authored gap (the phase matcher, below); the Cradle needs a post.
Elsewhere colliders are a **bonus** feature, and open air (no collider) still
classifies from motion, so City freestyle without a pole still scores.

## Definitions (supported)

Points are TPW **Outdoors**. Indoor maps use the TPW **Indoors** column when
the site lists one; otherwise Outdoors. Roll uses **50** (spreadsheet; the
site lists both 150 and 50).

| Id | Name | Tier | Out | In | Detection essence |
|---|---|---|---|---|---|
| `flip` | Flip | Beginner | 50 | 75 | Phase matcher: **≥300° of pitch within any 1.2 s**, little net roll/yaw. Any speed, any travel. Front or back by the way the pitch turned (the pop says Front Flip / Back Flip). |
| `roll` | Roll | Beginner | 50 | 75 | **≥300° of roll within any 1.5 s at a mean rate of ≥250°/s**, little net pitch/yaw. Slower turns are not tricks. |
| `yawspin` | Yaw Spin | Beginner | 50 | 75 | Continuous ~360° yaw, mostly upright. |
| `maverick` | Maverick Loop | Beginner | 100 | 100 | **The loop gate** (below), as the owner flies it: **under an object**, the climb **over the same object**, **never upside down** (up-Z above −0.5 throughout; the owner's dip to −0.06 counts), a pull back of **≥50°**, then above the object's top a **fast forward pitch**: **≥60° inside 0.4 s** (a slow level-out is not one), then **≥0.3 s gliding down backwards** (descending, moving back against the nose's heading across the floor), and **back under the same object**, all inside **4 s**. A touch between the passes voids it. The object in the camera's view on the glide is logged, not judged. Called 0.3 s after the pass back under; back out through the authored gap it came in by: **1.25×** points. A wall beside the path, or open air, is no Maverick. |
| `splits` | Split-S | Beginner | 100 | 100 | Phase matcher: a **roll of 103–258°**, then a **back pitch of 69–258°** (pull), the path dropping ≥0.35 m, flying with the nose. The old terms' tolerances, so it fires where it did. |
| `immelmann` | Immelmann | Beginner | 100 | 100 | Phase matcher, the Split-S's mirror: **back pitch 180 ± 45° climbing ≥1 m**, then a **roll of 180 ± 45°**, ending **upright**, the **heading reversed** (180 ± 45°), **out higher** than in. |
| `cradle` | Cradle | Beginner | 150 | 150 | As the owner flies it (2026-11-20): **past a post flying forward** with it on one side (**≤2 m** out), the **nose up ≥25°**, **never over the top** and **not turning round** (**≤55°** about the vertical), then **back past it travelling backwards, against the nose** (**≥115°** off it, **≥1.5 m/s**, not upside down) **on the other side** (**≤3 m** out), within **2.5 s**, both passes beside the post (within its height). Called at the second pass, no wait. A post: a pole, column, tree or post (**≤0.5 m** across, near square, **≥1 m** tall, standing), or a chair or table leg (**≥0.31 m**, on the floor, slender); never a wall, floor or ceiling. A touch (of the post or anything), a crash, a disarm or a respawn between the passes voids it. Both passes round a post make a Cradle however high the nose comes (short of over the top); the Maverick is the open-air move. See "The Cradle" below. |
| `dive` | Building Dive | Beginner | 100 | 100 | Climb or start high, cut, nose down, fast altitude dump, level near the ground. |
| `prox` | Proximity | Beginner | 150 | 150 | Wall near-miss at speed. Sim-only spatial; TPW Wall Ride/Tap need a knife-edge roll or tap we do not require. |
| `powerloop` | Powerloop | Novice | 200 | 200 | **The loop gate** (below): **under an object**, over **the same object**, **upside down** at the top (up-Z ≤ −0.5), and **back under it**, inside **4 s**, with **≥270° of back pitch**, the roll **≤97°** net and **under 90°** of yaw made upside down. The object must be **inside the loop**: a box 2 m to the side, a crate passed over but never under, or open air, is no Powerloop (a loop that fast is a Flip). A loop on round the same object adds a loop: the call waits 1.6 s for the next climb over it, then scores them all at once (**≥2 loops: Double Powerloop**, each loop the Powerloop's points). A touch voids the loop flying. |
| `sideloop` | Side Loop | Novice | 200 | 225 | 90° **yaw** under the object, then a **roll-driven** vertical loop (roll + some yaw) over inverted, cut, reapply, level under. Carves a loop **sideways**, not a pitch Powerloop. Indoor 225 = TPW Under/Over. |
| `matty` | Matty Flip | Novice | 200 | 200 | Phase matcher, as the owner flies it: **250–400° of forward pitch over an object** (the object below at or before the top), **climbed into**: the top ≥1 m above the altitude **1.0 s before the maneuver began**, and no lower at the start than then (a climb made inside the flip after a descent does not count). Flown **against the nose** half the time or more (or of the inverted part), ending **upright**. |
| `juicyflick` | Juicy Flick | Novice | 200 | 225 | Open-air: pitch **forward** with throttle to inverted, then a prompt **180° roll**. Travel stays forward. |
| `snapback` | Snapback | Novice | 200 | 225 | Pitch **back** to inverted (half-loop style), then a prompt **180° roll**. Not a completed Powerloop. |
| `halfmatty` | Half Matty | Intermediate | 350 | 350 | Phase matcher: a Matty's **first 180 ± 45°** of forward pitch, climbing **≥1 m over the object**, ending **inverted** (nose down behind it). |
| `halfmavvy` | Half Mavvy | Intermediate | 400 | 400 | Phase matcher, as the owner flies it: **forward pitch, a roll of 180 ± 45° between its halves, forward pitch on to upright**: **330–450° of forward pitch net**, a **climb ≥3 m**, the segment **≥2 s**, ending **upright**, **through an object**: under one (an object above, within 2.3 m) for **≥25 %** of the maneuver, and flown **against the nose ≥30 %** of the time after the roll. The pull-up before it may turn 120° back; the pitch may run on through the roll. Without the object it is a Barani. Scores above Maverick, Matty and Barani. |
| `cubik` | Cubik's Rube | Intermediate | 350 | 450 | 180° roll → 360° flip → 180° roll, same roll direction. Open air. |
| `rubik` | Rubik's Cube | Intermediate | 325 | 450 | 180° flip → 360° roll → 180° flip, same pitch direction. Open air. |
| `ham` | Ham Spin | Intermediate | 300 | 300 | **Inverted yaw spin**: **≥300° of yaw counted only while inverted** (up-Z below −0.5, tilted more than 120° from level). The yaw is the turn about the vertical. A **half flip in and a half flip out are allowed** and the whole maneuver is one Ham, not a Flip: the flips turn little about the vertical. A flip or roll that only passes through inverted, and upright yaw, are not Ham; a full Roll stays a Roll, and an inverted orbit is a Trippy. Also called ham. |
| `trippy` | Trippy Spin | Intermediate | 500 | 500 | **≥360° of yaw at ≥150°/s while the path orbits a centre ≥360°**, radius **0.3 m or more** (the path's curvature), its direction turning a **full 360°** one way over the whole spin, at ≥1 m/s, **the tail to the centre or the body inverted** for **≥70 %** of the orbit: tilted back round it (nose up, away from the centre, within 0.7 of the plane through it) or upside down. Tilt-independent: the body's attitude, not the camera's. Yaw is the turn about the vertical, so a tilted spin counts in full. The body may roll as it spins (the owner's rolls 600–1490°). An upright orbit with the nose on the centre is an Orbit, never a Trippy. A nearby pole/post at the centre (within 0.5 m) is a bonus: 1.25× points. |
| `orbit` | Orbit | Beginner | 75 | 100 | **An upright orbit**: **≥360° of yaw inside 4.4 s at ≥90°/s** while the path orbits a centre ≥360° (0.3 m or more, at ≥1 m/s, as Trippy's), the tail to the centre or inverted **≤30 %** of it (the nose on the centre, or the nose all round). One orbit scores once, however long it goes on: a piece after the 4.5 s cap that goes on orbiting the same way scores nothing. The same pole bonus as the Trippy's. |
| `barani` | Barani | **Master** | **750** | **800** | **The loop gate** (below), the Tricktionary's: **under an object**, a **half loop back to upside down over the same object**, the **horizon in view before the yaw** (where the yaw begins, the camera no more than half the vertical FOV above the horizon: 45° at the default 90°), **120–225° of yaw upside down** (each step's yaw times up-Z, counted while up-Z is below −0.5), then the **Matty back under the same object**: ≥90° forward, **upright**, **flying backwards** (velocity·nose ≤ −0.3), inside **4 s** of the first pass. Pulled back ≥135° before the yaw. A touch voids it. The roll measure (a twist about the flight path) no longer counts: a flip with a twist in open air is no Barani. |

## Decision boundaries

### Phase matcher

Flip, Split-S, Immelmann, Matty, Half Matty and Half Mavvy are one matcher
in `sim-tricks.js` (`PHASE_SPECS`, `measureSpec`): each
is **ordered phases** in one segment of at most 4.5 s. A phase is a turn about
one axis (pitch, roll, or the turn about the vertical) in a stated way (pitch
**back = nose up**, a back flip's way; **forward = nose down**, a front
flip's) and size, 180 ± 45° unless the trick says otherwise. A phase may
also ask:

- a **climb**: its highest point that far above the lowest before it in the
  phase (a dive and a pull climbs from the dive's bottom); the Matty's from
  the altitude 1.0 s before the maneuver began, climbed into;
- an **end state**: upright (up-Z ≥ 0.5) or inverted (≤ −0.5);
- an **object over** (one below the quad at or before the phase's top) or
  **under / through** (after the top, one above it, or an authored gap
  passed).

The phases follow one another. Before the first and after the last, pitch
and roll each turn at most 45°; inside a phase, the other of the two turns
at most 45°, and its own axis turns back against its way at most 45° (a
phase is one turn, not one and part of the next). A trick may also ask of
the whole segment: an end state, a **heading change**, a **drop or climb**
from entry to exit, and a **velocity-vs-nose** stretch (the last stretch
flown back towards the entry with velocity·nose at most a given value).
A trick may allow more turning before its first phase (the Half Mavvy's
pull-up, 120°) or across a phase (its pitch through the roll, 90°). The
matcher finds the best phase bounds in the segment's history (every 4 ms
row, scanned on at most 200) and scores the trick 0–1; that score is the
trick's term in the classifier.

**Compound tricks across segments.** The segmentation ends a maneuver when
the rates go quiet, so a trick flown with a pause in it (a pull, a breath,
a push) comes out as two segments. The
detector keeps one history across consecutive segments while each pause
between them is under **0.8 s** and none of them scored, and when a segment
finishes it scores the matcher's tricks (all but Flip and Split-S) over the
run from each earlier segment's start to now, at most 4.5 s. A match stands
over the segment's own label (unless that is a matcher trick ranked above
it).
A segment that scored ends the run, and so does a Cradle (called on its own
second pass, below).

Flip is one phase, the largest turn of pitch inside 1.2 s; Split-S is a
half roll then a back pitch. Their scores are exactly their old terms, so on
the owner's logs they fire where they did. Matty and Half Mavvy are the
owner's as flown in the third log; Half Matty and Immelmann as first defined
(docs/sim-tricks-audit.md sections 9 and 10). Barani, Powerloop and Maverick
are not the matcher's: they are the loop gate's (below).

The Half Mavvy's shape: forward to the nose straight down (after a pull-up),
the half roll there, then forward on through to upright (the owner's turn
360–430° forward net), under an object. Without the object it is nothing.
A phase may also ask a share of it flown **against the nose** (the Half
Mavvy's after its roll, 0.3).

### Flip and Roll: rotation first

- Flip is decided by the rotation alone: ≥300° of pitch inside a 1.2 s
  window of the segment. Speed and travel do not matter. A pitch rotation that
  big is **never nothing**: when no trick reaches the 0.42 score (its roll or
  yaw too big for Flip's own terms), it is a Flip.
- A loop of pitch is a Powerloop only round an object (the loop gate,
  below). In open air it is nothing, or a Flip when it turns 300° inside
  1.2 s.
- Roll is ≥300° of roll inside a 1.5 s window at ≥250°/s on average between
  the window's two ends. A slow rolling turnaround (the Fractal75's after a
  punch: 300°+ over 3–4.5 s at under 272°/s) is not a Roll.

### Powerloop vs Matty Flip

These are **not** the same family.

- Powerloop: a **back** loop round an object (the loop gate, below): under
  it, over it upside down, back under it.
- Matty: a **forward** flip or loop (nose down) of 250–400° **over an
  object**, climbed into from the second before, against the nose, upright.
  Without the object, or without the climb into it, it is a Flip.

Pitch **sign** is the primary split. A loop the gate calls a Powerloop closes
its segment as that: it never also scores as Matty.

### Matty vs Half Matty

- Matty: the whole forward flip over the object, 250–400°, upright at the end.
- Half Matty: its first 180 ± 45°, over the object, **ending inverted**
  behind it. One maneuver, one label — continuing through a full Matty is
  a Matty, not a Half Matty plus something.

### Split-S vs Half Matty

- Split-S: a half roll first, then a **pull** (back pitch), dropping, flying
  **forward** out.
- Half Matty: no roll: a **forward** half loop over an object, climbing,
  ending inverted.

### Maverick Loop vs Powerloop

Both are the same circuit round one object (the loop gate, below): under
it, over it, back under it. The owner's split:

- Powerloop: **upside down at the top**, the loop finished by pitching on
  back, like a long, moving back flip.
- Maverick: **never upside down**: at the apex a **fast forward pitch**
  (the level-out, ≥60° inside 0.4 s) so the camera looks at the object, then
  the glide down backwards and back under it. Back out through the gap it
  came in by is the bonus.

### Half Mavvy vs Maverick

- Maverick: the loop gate's circuit round an object, never upside down, a
  fast push at the top, the glide down backwards.
- Half Mavvy: forward, a **half roll**, forward on to upright, 330–450° net,
  climbing 3 m, 2 s or longer. The roll and the way of the pitch are the
  split; Half Mavvy scores above both Maverick and Matty.

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
- Trippy Spin: **≥360° of yaw at ≥150°/s while the path orbits ≥360°,
  the tail to the centre or the body inverted**. The yaw is the turn about
  the vertical (a tilted spin turns the heading at the full rate); the body
  may roll as it spins. Over the whole spin (for as long as the yaw keeps
  turning the same way at 120°/s or more) the path goes all the way round
  a centre: radius 0.3 m or more (no top), its direction turning a full
  turn (360°) or more, one way, at 1 m/s or more. Half or three-quarters of
  an orbit is not a Trippy. Over that orbit, **70 % or more** of the steps
  have the tail to the centre (the nose pointing away from it, within 0.7
  of the vertical plane through it: tilted back round it, which is what
  turns the owner's picture upside down) or the body inverted (up-Z below
  0). The centre is square to the velocity, on the side the path turns to.
  The term is the body's, not the camera's: the same move scores the same
  at any cam tilt. The owner's Trippies read 0.92–1.0 (24 logged steps
  each), the owner's orbits 0; the inverted half has no flown trace yet (synthetic
  only). An inverted orbit is a Trippy, not Ham. A spin in place (no
  orbit) is a Yaw Spin or Ham Spin. A nearby pole or post (a collider at
  most 0.5 m across and 1 m tall) within 0.5 m of the orbit's centre earns
  1.25× the points.
- Orbit: the same orbit **upright**, the tail to the centre or inverted
  30 % of it or less (the nose on the centre, a camera lock; or spinning on
  its own, a quarter), slower: **≥360° inside 4.4 s at ≥90°/s**. An upright
  orbit is never a Trippy, however tight and fast. One orbit scores once:
  the 4.5 s cap cuts a slow one into pieces, and a piece that goes on
  orbiting the same way (an Orbit, or a slower piece turning on at 72°/s or
  more, half a turn or more, the path half way round, which alone is
  nothing or a Yaw Spin) under 0.8 s after the last scores nothing. The
  Trippy's pole bonus.
- A coordinated turn, carve, or slight yaw is neither — those do not go all
  the way round a centre at 90°/s.

### The loop gate: Barani, Powerloop, Maverick

The owner's rulings of 2026-11-24, on the Tricktionary's definitions: each of
the three is a **loop round one object**, judged on the path, not on a
segment's rotation (`sim-tricks.js` `LOOP`, `loopStep`). Like the Cradle it
runs beside the segments, every 4 ms step, and its call closes an open
segment as the trick when that segment began before the pass back under (one
begun after it flies on as its own: a roll after a Powerloop is a Roll, not
part of the Powerloop); a trick a segment finished while a loop is half flown
(pulled back 45° or over the object) waits for it, and is replaced by the
call (a Half Mavvy, which holds a Maverick's loop and more, stands) or called
when the loop comes to nothing.

Three passes:

1. **Under** an object (a box over the quad, its underside ≤2.5 m above),
   level (up-Z ≥0.9), ≥1 m/s. The loop starts where the quad leaves its
   underside. A climb that passes under something higher (the roof truss, at
   up-Z 0.72 in the owner's re-fly) is not level, so it doesn't start the loop
   over.
2. **Over** the same object (over a box of it, its top ≤6 m below).
3. **Back under** the same object, ≥2 m below the highest point since,
   inside **4 s** of the first.

**The same object** (provisional, fitted to the Warehouse's stairs): a box
within **2.0 m** of a first-pass box across the floor (the gap between their
footprints), its underside and top each within **1 m** of that box's. That
joins a staircase's steps and the mezzanine edge they meet (the owner's first
Barani came back under 1.4 m along the stairs), and not a step 1.63 m on but
1.13 m higher (the re-fly's attempt 35 crossed one) or the roof truss 0.94 m
from them across the floor but 4.4 m higher. No verdict of the re-fly turns
on 1.5 or 2.0 m. The detector's own objects split a staircase into its steps, and
boxes that touch join the whole Warehouse into one.

A **touch**, a crash, a disarm or a respawn between the first pass under and
the pass back under voids the loop; a touch after the pass back under
doesn't. The touch is the physics core's own contact where the core gives
one (the bf core's `contactFlags`: the floor or a box), else the detector's
(the floor within 8 cm, a box within 6 cm). The owner's three voided
Baranis of the re-fly each met the bf core's floor contact before the pass
back under.

At the pass back under, the gate calls:

- **Barani**: upside down at some step; 120–225° of yaw made upside down;
  the **horizon in view before the yaw**: where the body's yaw that way began
  (15° on from its last low; a pause of 0.15 s under 60°/s starts it over),
  the camera (the page's tilt) at no more than half the vertical FOV above
  the horizon. Above that it sees only sky: the yaw began before the half
  loop came over. Pulled back ≥135° before the yaw, ≥90° forward after it,
  through the pass upright and flying backwards (velocity·nose ≤ −0.3):
  the Matty back under. A yaw in the band with anything else short is
  **nothing** (Power Swap and True Barani are queued for later, with the
  audit).
- **Powerloop**: upside down at some step; under 90° of yaw upside down;
  ≥270° of back pitch; the roll ≤97° net. Loops on round the same object
  are one Powerloop of that many loops.
- **Maverick**: never upside down; ≥50° pulled back (the owner's read 60–112°,
  one 59.8°); above the object's top
  ≥60° forward inside 0.4 s; then ≥0.3 s descending while moving back
  against the nose's heading (the nose is down as it falls, so velocity·nose
  itself is positive there). The object in the camera's view on that glide
  is logged (`objView`), not judged: the logs to date cannot measure it.

The owner's Baranis of 2026-11-24 read 125–188° of yaw upside down, the
camera at +2° to +29° where they went upside down (the frame's top half),
2.7–3.5 s from pass to pass; the Powerloops' lowest up-Z −0.85 to −1, the
Mavericks' 0.14 to 0.47.

Each verdict goes in the debug log as a record of type `loop` with the
gate's inputs at every step (position, velocity, nose, up axis, the step's
body turns, flags) from 0.5 s before the loop began to 0.4 s past the
verdict, the boxes it saw, and the camera's tilt and FOV: a replay
(`makeLoopGate`, then `loopStep` on each row) gives the same verdict. A
called loop also notes when it was called (`calledT`) and whether the call
closed a segment (`closed`: the record's seq, 0 when it closed none, as for a
Double Powerloop called at the chain wait).

The owner's re-fly of 2026-11-24 (16 loop records,
`tools/fixtures/tricklog-depot-bf-refly-loops.jsonl.gz`) replays on today's
gate to his tricks: two Baranis of eight attempts (three touched the floor
between the passes), the Powerloop, the Double (two loops, pending when its
rows end: its call is due 1.6 s after its pass back under), four Mavericks,
and nothing for the early yaw, the half loop rolled at the top or the flips
(`tools/test_sim_tricks_loops.mjs`). Its touches are the detector's (the
log predates the core's contact), and no verdict in it turns on the same
object's reach or on which segment a call closes: the kinematic tests pin
those.

### Gap passes (not a trick)

A gap is **not a trick**: no callout, no points, no row in the list above,
nothing in the combo, the streak or the repeat count. Gap Hunt
(`sim-gap-hunt.js`, the House, the Warehouse and the Bando) is the only thing
that answers flying a gap. Until 2026-11-14 `gap` scored 125 (TPW medium
gap); it was taken out because a pass is the hunt's, not a freestyle trick.
The per-map bests saved before then counted it, so the store went to
version 2 (`STORE_VER`): loading drops bests saved under version 1, and
keeps the HUD and debug settings. Version 3 (2026-11-18) dropped them again
(an upright orbit had scored as a 500-point Trippy), and version 4
(2026-11-20) once more: the Cradle had scored 150 on a segment's pitch with
no post. Version 5 (2026-11-24) again: the Barani, Powerloop and Maverick
had scored with no object round them, and the Barani is 750 now.

The detector still **tracks every pass**, exactly as it did when it scored,
because tricks read them:

- the Maverick's **1.25×** for back out through the gap it came in by (the
  loop gate reads the passes);
- compound tricks across segments: the chain keeps its own passes;
- the phase matcher's per-phase "under / through" measurement counts a
  pass too, though no trick asks for it today (the Matty and Half Matty
  ask for an object **over** them, the Half Mavvy for one **above** it:
  colliders, not gaps);
- Proximity: it waits while the path is in or near a gap (between generic
  walls, in an authored volume or 0.3 m from one), and for the step a pass
  resolves (out of the gap, or when a rotation it was passed in ends,
  within 1 s; one volume again only after 1 s; generic, 1 s apart).

One thing differs from when it scored: a landing or a disarm on the step a
pass resolves now banks the combo (a scored Gap used to hide it, and the
combo banked when it timed out).

What counts as a pass:

- The Rig, the House, the Warehouse, the Bando and the archived Warehouse
  carry their intentional gaps as volumes (sim-maps.js `mapGaps`): crate
  slots, pipe and riser slits, tunnel, loft hole; bookshelf gap, under the
  patio table and the backyard's (sim-house-yard.js: the windows, the
  doggy door, the slide, the pool ladder, the trampoline, the swings, the
  citrus tree, the shed, the dome, the monkey bars); the roll-up doors, the
  chain curtain's parting, under the forks, the rack gap and the crossing
  gap through both runs, the trusses' gaps, the hatch, between the cable
  trays and under a truss over them, through the container, through the
  scissor lift, the cargo net's hole, every tyre's bore; every window
  frame, floor hole, stair well, shaft door and the shaft's top, rebar gap,
  door opening, the parapet gap, under the leaning slab, the first floor's
  collapse and the van; rack shelves, the gap, the Ion hoop. A pass goes in
  through one face across the volume's axis and out through the opposite
  face: flown through. In or out through a side is a skim.
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
   every candidate's terms, the gap passes and skims (type `gap`, never a
   result: not a trick), the dives. The overlay shows the gap passes on a
   line of their own under the candidates, marked "not a trick".

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

- Cradle: two passes round a post, forward then backward against the nose,
  on its two sides, the nose up between and never over the top (below).
  Not a segment's label.
- Maverick: a loop round an object, under it, over it and back under (the
  loop gate). A pull and push round a post, past it on its two sides with
  the nose short of over the top, is a Cradle.
- Matty: a forward flip over an object, climbed into.

### The Cradle

The owner's definition (2026-11-20): there is a close object; the quad
passes it on one side, the nose goes up, and it comes back past it going
backwards on the opposite side. `sim-tricks.js` `CRADLE`, `cradleStep`:

- **Posts.** The colliders, grouped into objects (boxes face to face with
  matching faces: a pole split into cells is one object), each **≤0.5 m**
  across with its short side **≥0.6** of its long one, and either **≥1 m**
  tall and standing (on the floor, or its foot on a box's top: poles,
  columns, trees, rack uprights, a column on a deck; not a chain hanging
  from a header), or a leg: **≥0.31 m** tall, on the floor, and **≥3** times
  its width tall (the House's coffee-table, chair, stool and patio-table
  legs, 0.36–0.90 m; not a pot, a nightstand or the mower). Walls, decks,
  floors and ceilings are never posts. The census (2026-11-20, as the page
  builds the colliders): Rig 15, House 52 (28 of them legs), Warehouse 125,
  Bando 59, and no clutter.
- **A pass** is the post's centre crossing the line square to a level
  direction through the quad (0.1 m of hysteresis), the quad **beside** it:
  within 0.05 m of the post's height (not over a table, not under the beam
  a post stands on).
- **First pass.** The post goes from ahead of the line square to the way the
  quad travels to behind it (the travel not turned round meanwhile), flying
  **forward** (≥1 m/s level, within 60° of the nose's level heading), the
  post **≤2 m** to the side, no touch in the 0.3 s before. The frame from
  then on is the **nose's level heading at this pass** (F1). Until the nose
  comes up, a later pass forward is the first pass.
- **Between.** The nose's elevation must reach **25°**; its pitch in F1's
  vertical plane never passes **90°** (over the top); and the quad **does
  not turn round**: its net turn about the vertical never past **55°**
  either way (an orbit or a Trippy round the post turns the nose with the
  path, a Cradle does not; a roll about the nose counts sin(nose) of
  itself). Between the passes the nose's level heading is judged only
  through over the top (the nose up, pitch past 90° in F1's plane is the
  heading more than 90° off F1). It is logged. With the nose 50–65° up a
  yaw at the top (or a pull while banked) swings it far, a body yaw
  turning the heading by about 1/cos(nose) of itself and the quad about
  the vertical by cos(nose) of it (56° and 58° off F1 on two of the
  owner's Cradles that turned 40° and 27°).
- **Second pass**, within **2.5 s**: the post's centre back across the line
  square to F1 (the quad went back past it), **on the other side**, **≤3 m**
  out, travelling back along F1 at **≥1.5 m/s** and **≥115°** off the
  nose's level heading (off F1 when the nose is over 60° from level, its
  heading within 90° of F1 and the level travel behind square of it; else
  off the heading: a turnaround, a hammerhead or a Split-S comes back nose
  side first; past 75° from level the heading is undefined, a void), **not
  still turning** (**≤45°** about the vertical in the 0.25 s before: a
  Trippy over 180°/s yaws through it), **not upside down** (no cap on the
  nose but over the top). The Cradle is called on that step, with no
  wait; an open rotation segment closes there as the Cradle and the chain
  of unscored segments before it ends. A trick that
  finished while the Cradle was half flown waits for it: the Cradle
  replaces it, or it is called when the Cradle comes to nothing. A second pass the other way flown
  forward is a first pass of its own.
- **Void.** A touch (the quad's centre within **0.06 m** of the post, or of
  any box: the detector's floor contact never sees a post's side), floor
  contact, a crash, a disarm or a respawn between the passes: a Cradle that
  ends in a crash does not score.

Set from the owner's 18 Cradles (two dumps and a fly on the gate's build,
2026-11-20, replayed through the gate from the positions and inputs they
logged): first pass 0.14–1.41 m out; nose up 39–77°; 11–40° of net turn
about the vertical on fly 3 (the dumps log positions only: their heading
turned 7–38°), against 63–80° by the second pass for slow orbits round a
post with the nose turning with the path 15–30° behind the radial
(kinematic; further behind, from 39°, they turn 55° or less and most are
Cradles, as with the old heading rule; at Trippy speed those 34–38° behind
stay Trippies, the cap voiding the Cradle first: at 60° the Cradle would
cut them short); 21° of yaw at most in the quarter second before the second pass (the dumps'
heading; 8° on fly 3; the Trippies a nose lag
turns into Cradles, on the js core: 57–89°); second pass 0.42–2.47 m out
on the other side, 3.35–7.21 m/s back, 123–179° off the nose, up-Z ≥0.45;
0.79–1.44 s apart.
The misses flown with them: two that clipped a column (one crashed), two
back on the same side climbing, one that slid wide and never came back
abeam, and one over the top into the floor.
The debug log (`?tricks=debug`) writes a record of type `cradle` per step
with a verdict (each Cradle, and each miss past an attempt: the nose up;
the other posts' verdicts that step in `others`), with the gate's inputs
every step, which replay to the same verdict. A miss's inputs run on to
2.5 s past its first pass (every 8 ms: a row carries the turn of the step
left out before it, and any touch on it), and a miss inside the last miss
record's window shares its rows (`inputs.same`).

## Scoring (TPW-inspired)

Combo chain / multiplier is **ours** (TPW never defines combo math). We keep
`comboMul` (1, 1.5, … cap 6) and a small unique-trick bonus (×1.1 / ×1.2).

TPW rules we do use:

- **Repeat** of the same trick in a session: 100/75/50/0% (1st / 2nd / 3rd / 4th+).
- **Back-to-back** same trick: 1st of the run full, then ×0.5, ×0.25, …
  (compounding −50%). Stacks with repeat. Ends the combo window.
- **Sloppy** (broken constant loop motion — a mid-maneuver pause then the
  rotation resumes): ×0.65. Ends combo.
- **Bump** (contact during the maneuver): ×0.50. Ends combo. (The Cradle
  has none: contact between its passes voids it.)
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
turning: a run of loops) while it keeps 69°/s. So a long Trippy is one
Trippy and a run of loops one segment (the loop gate scores the Powerloops).
A slower orbit is cut
at the cap; the Orbit scores once across its pieces (above). While
**inverted**, settle is longer so a maneuver does not split on a brief
rate dip. Consecutive unscored segments with pauses under 0.8 s are also
scored as one for the matcher's tricks (compound tricks, above).

Cruise / carving / hover wobble must classify as **none**.

## Added vs skipped

**Added** (besides the original set, retuned to TPW): Cradle, Juicy Flick,
Snapback, Rubik's Cube, Cubik's Rube, **Side Loop**, **Ham Spin**, from the
phase matcher **Immelmann** and **Half Mavvy**, and from the loop gate the
Tricktionary's **Barani**. Each has a distinct
axis-order or pitch-sign signature. The matrix covers both the synthetic
rad/s library and **pilot traces** (imperfect stick, varying throttle,
Actual/KISS curves from `sim-rates.js`).

**Skipped** (and why):

- **Gap** — scored until 2026-11-14, now not a trick: Gap Hunt answers
  flying a gap. The passes are still tracked (above).
- **Inverted Hang** — not a TPW trick.
- **Power Swap / True Barani** — queued with the Tricktionary audit (a
  failed Barani horizon check, or a roll at the top, scores nothing today).
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
