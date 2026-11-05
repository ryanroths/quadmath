# Trick detection on the bf core: audit, debug overlay, real logs

2026-11-04, against `main` at eb0344b (quadmath #305 merged: the 65 flies the
bf core on the Air65, the 75 the bf core on the Fractal75, the 85 the js
core) and sim-core v0.6.0 (754266f). Sections 1-4 are the audit of the
detector as it was (no threshold changed there). Section 5 is the tuning that
followed it: the detector on the sim clock, and Flip, Roll and Powerloop
classified by rotation first, with before/after tables on both logs.

## 1. What the detector reads, and where it comes from

The detector is `stepDetector(d, sample, dt)` (`sim-tricks.js:1007`). The page
fills one `trickSample` per frame (`sim.html:3280`, filled at
`sim.html:7863-7877`) and calls `tricks.tick(trickSample, dt)`. Every
physical input comes from `cs`, the core's state for the frame:
`cs = emptyState()` (`sim.html:3430`), filled once a frame by
`syncStateFromCore()` → `core.getState(cs)` (`sim.html:3437-3439`, called from
`stepCore`, `sim.html:7438`). `core` is the js core at boot
(`sim.html:3435`) and becomes the class's bf core once it loads
(`sim.html:7656-7657`). The bf core is the default (`sim-core-adapter.js:3-5`);
`?core=js` forces the js core.

| Input | `trickSample` field ← page (`sim.html`) | bf core: `getState` (`sim-core-adapter.js`) | js core: `getState` | Detector uses it for (`sim-tricks.js`) |
|---|---|---|---|---|
| Attitude | `qx..qw` ← `cs.quaternion` (7864-7865) | `sim.lerpState().quat`, render-interpolated (824, 838); `vendor/sim-core/sim-core.js:653-668` | `qp.quaternion`, interpolated (`lerpPose`, 242) | Body-frame rotation per step from consecutive quaternions (1014-1016); upZ/inverted (1041, 954-956); heading (1042); body-forward vs velocity (966-980) |
| Body rates | `ox, oy, oz` ← `cs.omega` (7864, 7866) | `s.omega`, latest tick, rad/s, body axes (839); sim-core `src/sc.h:102` | `qp.omega`, latest tick, rad/s, body axes (243; `quadphysics.js:504`) | Segment start and settle: `rate` (1046, 1053, 1065); peaks `peakP/R/Y` (924-929; Trippy and Ham gate `peakY`). Rotation from omega only before the first quaternion (1017-1018) |
| Position | `wx, wy, wz` ← `state.pos` = `toScene(cs.position)` (7867, 3439) | `s.pos`, interpolated (836) | `qp.position`, interpolated | Horizontal travel and path closure (933-936, 947-948); clearance scan against colliders (1050); gap travel (1104) |
| Altitude | `alt` ← `cs.position.z` (7868) | as position | as position | span, drop (930-932); dive (1081-1086) |
| Velocity, speed | `vx, vy, vz, speed` ← `cs.velocity` (7869-7870) | `s.vel`, interpolated (837) | `qp.velocity`, interpolated | follow/against (966-980); speed peaks (957-959); vz for dive and the `diving` start block (960-961, 1054, 1081) |
| Clearance | `clearance` ← `cs.clearance` (7871) | `s.groundClearance`: hull clearance, CG height above what is beneath less `hullBelow` (842; sim-core `src/plant/plant.c:1653-1655`, `src/plant/world.c:370-373`) | `qp.groundClearance`: CG height above the floor or the box top beneath, page colliders (3434, 3395-3404) | `contact` = clearance ≤ 0.08 m (1044): blocks segment start, ends a segment, sets bump, landing |
| Armed | `armed` ← `cs.armed` (7874) | `fc.armed`, Betaflight's (840) | `qp.armed` (244) | Segment start, dive, gap, disarm event |
| Throttle, sticks | `throttle, sr, sp, sy` ← `stick` (7872-7873) | the page's polled sticks, before Betaflight (`sim.html:3659`) | same | `diving` start block (thr < 0.18, 1054), landing (1138); sticks only recorded |
| World | `colliders` (7875) | the page's scene boxes (the same boxes are sent to sim-core as its world) | same | Under/over/near features (950-953), gap (1098), proximity (1121) |

**Verdict: on the bf core the detector reads the bf core's `getState()`
throughout. Nothing comes from `quadphysics.js`.** The adapter gives both
cores the same field names and frame (module frame: X forward, Y left, Z up;
quaternion body to world; omega in body rad/s), so `sim-tricks.js` reads either
core unchanged (`sim-core-adapter.js:141-156`). sim-core's body rates are
Betaflight's gyro axes in that frame: roll + right wing down, pitch + nose down,
yaw + nose left (sim-core `src/plant/plant.c:29-31`). That matches the
detector's sign convention (`docs/sim-tricks.md`: positive pitch is a front
flip). `qp` still exists on the bf core because the js core is always
constructed (`sim.html:3433`), but no `trickSample` field reads it. The only
non-core inputs are the page's own: sticks, colliders and `WS`.

Differences between the two cores that reach the detector, all small:

- **Clearance datum.** On the bf core, clearance is the CG's height above
  what is beneath, less `hullBelow`. On the js core it is the CG's height above
  the floor less the page's 1 cm pad (`FLOOR_CLEARANCE_M`), or above a box top
  with no pad. For the Air65 (`hullBelow` 10 mm) the two agree on the floor
  and differ by 10 mm on box tops. For the Fractal75 (3 mm) they differ by
  7 mm on the floor and 3 mm on boxes. Against the 8 cm `contact` threshold,
  that is noise.
- **Interpolated pose, latest-tick rates.** Both cores interpolate position,
  velocity and quaternion for render and report omega from the latest tick.
  This is the same on both cores.
- **Throttle is the pilot's stick, not Betaflight's.** On the bf core
  Betaflight's throttle curve sits after the stick (the Fractal75 flies
  `thr_mid` 65, `thr_expo` 35). The detector only uses throttle for the
  `diving` start block and landing, so the curve does not reach a trick label.

## 2. Things noticed, not changed

- **Frame-rate dependence (both cores; fixed in section 5).** The detector's `dt` is clamped to
  0.05 s (`sim.html:7817`), but the core advances by the real frame time, up
  to 250 ms (`sim-core-adapter.js:23`, `sim.html:7429`). Below 20 fps the
  detector's own clocks (segment duration, settle, `tYaw360`, lockout,
  cooldowns) run slower than sim time. Below about 5.4 fps, a 740 °/s rotation
  turns more than the 2.4 rad jump guard in one frame (`sim-tricks.js:1032`),
  so the segment is dropped as a teleport. I saw this in a hidden browser pane
  running at about 4 fps. On the real log, stepping at 30 Hz instead of 60 Hz
  moves one label (section 4).
- **The velocity fallback uses the wrong frame.** When `vx`/`vy` are missing,
  `stepDetector` derives velocity from scene positions with scene x as module
  x (`sim-tricks.js:1023-1028`). `toScene` maps module x to scene -z
  (`sim-core-adapter.js:30-33`). The sim always sends velocity
  (`sim.html:7870`), so this branch is dead in the sim.
- **No test flies tricks on the bf core.** `tools/test_sim_tricks.mjs` flies
  every physics maneuver on `QuadPhysics` (its line 20, `qpSample` at 40-57).

## 3. The `?tricks=debug` overlay

`sim.html?tricks=debug` loads `sim-tricks-debug.js` with a dynamic import.
Without the flag the file is never fetched and nothing changes. The overlay
reads the detector from outside, before and after each `tricks.tick`
(`tricks.detector()`), and writes nothing back.

- **Panel (top right, below the OSD):**
  - the segment-start gates live: armed, airborne, rate ≥ 0.95, lockout,
    `diving` block;
  - the open segment's pitch, roll and yaw;
  - the last attempt with its features (travelH, close, span, drop,
    follow/against, inverted fraction, peak speed);
  - one row per candidate: Flip, Roll, Powerloop, Split-S, Matty Flip, Trippy
    Spin, Juicy Flick, Inverted yaw spin (Ham), Dive, Gap. Each row shows the
    score and either "fired", or the weakest threshold with its value, need
    and factor, plus how many other thresholds failed;
  - the other classifier candidates as one line of scores, and any re-label
    rule that applied.
- **Console:** one line of JSON per attempt (`kind: 'quadmath-trick-attempt'`):
  - `maneuver`: every candidate's every term (feature, value, need, fade,
    factor), the pick, the re-labels and the dive fallback;
  - `abort`: a segment dropped by a crash or a reset (before section 5, also
    by the jump guard);
  - `dive`: a dive the detector armed, or a descent past −3.8 m/s it never
    armed, with which start gate failed;
  - `gap`: a pass through a gap zone, fired or missed.

  `window._trickDebug.attempts()` returns the last 200 attempts.
- **Staying in step with the detector.** The overlay keeps a copy of
  `classifyFeat`'s score terms. `tools/test_sim_tricks_debug.mjs` parses
  `classifyFeat`'s source and fails if any feature, number, order or re-label
  rule differs. It also checks that the copy picks what `classifyFeat` picks
  (label, best and second) on 150,000 random segments. At run time each record
  carries `classifyFeat`'s own label, and `mismatch: true` flags any
  disagreement.

**Checked in a browser.** I flew the bf core (Air65, the Rig) in headless
Chrome at 76 fps with keyboard input:
- a front flip while climbing at speed logged as Matty Flip (score 0.83);
- a gap pass fired;
- dive misses logged their reasons ("speed never > 8");
- every attempt logged one JSON line.

Without the flag, no `sim-tricks-debug.js` request was made and there was no
overlay.

## 4. The detector on the owner's logs

**Method:**
- **Decoding.** sim-core's `readLog` (`tools/hover-from-log.mjs`, sim-core
  main a076865) with quadmath's vendored decoder, the logs read from
  `SIM_CORE_LOGS` (`D:/IGOW6/sim-core`).
- **Attitude.** The logged gyro (`gyroADC`, deg/s) integrated at the log
  rate. The start is level, read off the accelerometer, and the gyro's mean
  over the first 0.25 s on the ground is removed.
- **Stepping.** The detector runs at 60 Hz, like the sim's frame loop.
- **No world, no contact.** No colliders, clearance 1 m (no contact),
  armed throughout.

**Position is the catch.** A blackbox log has no position or velocity, and
many gates need them (Flip's `close ≥ 0.35` and `travelH ≤ 9.5`; Powerloop,
Matty, Split-S, Dive, Gap). So each log is run twice:

- **Held in place:** no travel, no speed. Only the attitude gates have real
  inputs.
- **Dead-reckoned:** velocity integrated from `accSmooth` through the gyro
  attitude, less gravity (as sim-core's `tools/punch-inflow.mjs` does), with a
  2 s leak to bound drift. This is a rough guess, not a measurement. Peak
  speeds came out at 16 m/s (Air65) and 14 m/s (Fractal75).

Trippy Spin and Gap need nearby objects. With no world they cannot fire on a
log, by construction.

### Air65 freestyle

`BTFL_..._20261023_143354`, log 1: 123.7 s, acro, 1971 Hz.
- Gyro bias at rest: 0.02, 0.06, 0.55 °/s.
- The gyro clips at 2000 °/s only at 98.5 s (a crash) and 123.3 s (the end).

68 rotation segments. Every segment with ≥ 270° on an axis is listed, plus
every labelled segment:

| t0 (s) | dur (s) | pitch° | roll° | yaw° | gyro shape | label, held in place | label, dead-reckoned |
|---:|---:|---:|---:|---:|---|---|---|
| 6.8 | 0.87 | 0 | -364 | -1 | roll | roll | roll |
| 11.1 | 0.75 | 0 | 376 | -1 | roll | roll | roll |
| 16.5 | 0.78 | 378 | 1 | -1 | front flip | — | flip |
| 18.8 | 0.68 | 314 | 1 | 0 | front flip | — | matty |
| 22.0 | 0.73 | 355 | -1 | -1 | front flip | — | flip |
| 25.6 | 0.70 | 1 | 348 | -1 | roll | roll | roll |
| 27.7 | 0.72 | 0 | 359 | 0 | roll | roll | roll |
| 29.6 | 0.70 | -2 | 349 | -1 | roll | roll | roll |
| 33.3 | 0.80 | -1 | -353 | -1 | roll | roll | roll |
| 35.0 | 0.72 | -1 | -360 | 1 | roll | roll | roll |
| 36.3 | 0.78 | 0 | -368 | 1 | roll | roll | roll |
| 40.7 | 0.92 | -377 | -3 | 0 | back flip | — | — |
| 42.1 | 0.70 | -345 | 0 | 0 | back flip | — | — |
| 43.1 | 0.97 | -387 | 3 | 0 | back flip | — | — |
| 48.4 | 2.33 | -341 | -64 | 2 | back flip | — | — |
| 56.8 | 4.52 | -275 | 37 | 59 | back flip (slow, timed out) | — | — |
| 62.0 | 4.52 | -106 | -279 | 376 | combined | — | — |
| 66.5 | 3.03 | 247 | -105 | -50 | under 270° | — | matty |
| 72.3 | 1.75 | -141 | -190 | -25 | under 270° | snapback | snapback |
| 75.0 | 2.17 | 37 | -56 | 506 | yaw spin | yawspin | yawspin |
| 77.6 | 0.87 | -1 | 14 | -423 | yaw spin | yawspin | yawspin |
| 78.9 | 1.03 | 94 | 18 | -37 | under 270° | — | cradle |
| 82.6 | 1.85 | -186 | -185 | 18 | under 270° | — | splits |
| 89.0 | 1.50 | 198 | -195 | 5 | under 270° | juicyflick | juicyflick |
| 98.3 | 0.77 | 41 | 74 | -323 | yaw spin (crash, gyro clipped) | — | — |
| 104.9 | 0.97 | 2 | 1 | -494 | yaw spin | yawspin | yawspin |
| 106.9 | 0.97 | 0 | -2 | 476 | yaw spin | yawspin | yawspin |
| 109.6 | 0.73 | 338 | 3 | -1 | front flip | — | flip |
| 111.1 | 0.75 | 334 | 0 | 0 | front flip | — | flip |
| 112.6 | 0.78 | -1 | -374 | -1 | roll | roll | roll |
| 116.1 | 0.70 | -1 | 348 | -1 | roll | roll | roll |
| 120.5 | 1.70 | 178 | -142 | -31 | under 270° | juicyflick | juicyflick |

| Detected | Held in place | Dead-reckoned |
|---|---:|---:|
| Roll | 10 | 10 |
| Yaw Spin | 4 | 4 |
| Juicy Flick | 2 | 2 |
| Snapback | 1 | 1 |
| Flip | 0 | 4 |
| Matty Flip | 0 | 2 |
| Split-S | 0 | 1 |
| Cradle | 0 | 1 |
| **Total labelled** | **17** | **25** |

What the gyro shows against what was labelled:
- **Rolls: 10 of 10, in both runs.**
- **Yaw spins: 4 of 5.** The miss at 98.3 s is a crash: 186° of roll path
  against Yaw Spin's `pathR ≤ 72°`, and the gyro clipped.
- **Front flips: 0 of 5 held in place, 5 of 5 dead-reckoned** (4 Flip, 1
  Matty). In place, each fails only Flip's `close ≥ 0.35`; every other Flip
  term passes. `close` is net horizontal displacement over path length, with
  the path floored at 0.35 scene units. So a flip that ends within about
  3.5 cm of where it started can never score; held in place, `close` is 0.
- **Back flips: 0 of 5, in both runs.**
  - **40.7, 42.1, 43.1 s:** clean, 345-387°, 0.7-0.97 s. Held in place they
    fail Flip's `close` as above. Dead-reckoned (6.9-8.8 m/s forward),
    `travelH` is 14.6-25.5 scene units (4-7 m). They fail Flip's
    `travelH ≤ 9.5` and Powerloop's `close ≤ 0.38` (their paths are
    straight, close ≈ 0.98). The second part does not depend on the
    dead-reckoned speed. Flip allows at most 2.7 m of travel during the
    rotation, and Powerloop needs the path to curve back. A flip flown faster
    than about 3.5 m/s that does not loop back (2.7 m in a 0.75 s flip) fits
    neither, and gets no label.
  - **48.4 s and 56.8 s:** slower, mixed with roll, or timed out at 4.5 s.
- **Juicy Flick (2) and Snapback (1)** are labelled the same in both runs.
- **The dead-reckoned extras** (Matty at 18.8 and 66.5 s, Split-S at 82.6 s,
  Cradle at 78.9 s) depend on the guessed velocity. They should not be read as
  ground truth.

**Frame rate.**
- At 144 Hz every label is the same as at 60 Hz.
- At 30 Hz:
  - the 4.5 s combined segment at 52.3 s (roll -244°, pitch 79°) becomes a
    Roll. It scored 0.375 at 60 Hz;
  - the 98.3 s crash trips the jump guard.

### Fractal75

`BTFL_..._CHOP_CHOP_20261103_111727`: 209.1 s, acro, 1991 Hz, 3,368 corrupt
frames dropped.
- The peak gyro is 272 / 172 / 272 °/s: a hover and punch flight, with no
  freestyle tricks.
- Gyro bias at rest: 0.10, 0.01, 0.11 °/s.
- The integrated attitude drifts 16-21° from the accelerometer's level by
  130-204 s, checked in steady hovers. This affects only the inverted gates.
  The per-segment rotations are body deltas and do not depend on it.

15 segments. Every segment with ≥ 180° on an axis is listed, plus every
labelled segment:

| t0 (s) | dur (s) | pitch° | roll° | yaw° | gyro shape | label, held in place | label, dead-reckoned |
|---:|---:|---:|---:|---:|---|---|---|
| 63.6 | 3.42 | -125 | -316 | 152 | combined | — | — |
| 95.2 | 2.10 | 98 | -49 | 0 | under 180° | — | dive |
| 97.4 | 4.52 | -231 | 268 | -198 | combined | — | — |
| 139.9 | 4.52 | -35 | -308 | 115 | combined | roll | roll |
| 188.3 | 2.23 | 106 | -67 | 0 | under 180° | — | dive |
| 190.7 | 4.52 | -136 | -406 | 214 | combined | — | — |

- **The large rotations come right after the four punches.** sim-core puts
  the punches at 61.75, 93.9, 138.3 and 186.8 s. Each turnaround is a slow
  rotation of 300-400° on mixed axes at ≤ 272 °/s, and three of them run to
  the 4.5 s segment limit.
- **One is labelled Roll (139.9 s).** It has 308° of roll and 115° of yaw over
  4.5 s. Roll has no rate or duration term (`sim-tricks.js:678-682`), so a
  slow rolling turnaround passes. The pilot can say whether it was a roll.
- **The others** fail Roll's `absP ≤ 106°` or `absY ≤ 117°`.
- **The two dead-reckoned Dives** (95.2 and 188.3 s, after the punches) come
  from `classifyFeat`'s dive fallback on guessed speeds and drops. They are
  plausible, but not measured.

## 5. Tuning: rotation first, path second

The owner's brief after the audit was to classify by rotation first and path
second.

### What changed

- **The detector runs on the sim clock.** While tricks are on, the core
  calls `onTrickSample` each time its clock reaches a multiple of 4 ms
  (`sim-core-adapter.js` `SAMPLE_US`, `advance(..., onSample)`). The detector
  reads that tick's state (`tickState`, not render-interpolated) and steps
  with `dt` = 4 ms.
  - On the js core the hook is called inside its tick loop.
  - On the bf core the frame time is fed to sim-core in pieces that end on
    each 4 ms boundary. Whole ticks are unchanged, and a sliced and an
    unsliced flight end byte-identical in sim-core's state and Betaflight
    blocks.
  - The HUD draws once a frame (`tricks.frame()`).
  - A frame of 249 ms or more is a pause (sim-core drops the excess beyond 250
    ticks). It advances unsampled, and the detector starts over at the next
    sample.
  - The 2.4 rad jump guard is gone. At 4 ms a sample turns a few degrees at
    most, respawns already reset the detector, and a portal keeps the
    attitude.
- **Flip:** at least 300° of pitch inside any 1.2 s window of the segment, at
  any speed and any travel. Flip's straight-path minimum (`close ≥ 0.35`) and
  its 2.7 m travel maximum are dropped. Front or back is read from the way the
  pitch turned, and the pop says "Front Flip" or "Back Flip" (same id, same
  points). A pitch rotation that big is never nothing: if no trick reaches
  0.42, it is a Flip.
- **Powerloop:** a Flip whose path also loops. The path must:
  - climb at least 1.5 m above the entry;
  - come back down to the entry height or below after its top;
  - turn its velocity through at least 270° in the vertical plane of the
    entry heading, the way the flip turns.

  The 270° is my reading of "path curvature consistent with a loop".
  Otherwise the segment is a Flip. The two re-labels that leaned on travel
  (`flip→powerloop` and `powerloop→flip`) are gone.
- **Roll:** at least 300° of roll inside any 1.5 s window, at a mean rate of
  at least 250 °/s between the window's two ends.
- **Windows.** The windows come from the segment's attitude history (`hist`,
  `spanWithin`, monotonic deques). Nothing else in the classifier changed.

### Ground truth: the logs replayed through sim-core

`tools/test_sim_tricks_logs.mjs` replays each log's sticks through sim-core
with the owner's diff:
- The fixtures were built by `tools/trick_log_fixture.mjs`: rcCommand inverted
  to channels on a probe instance, as sim-core's `sim-vs-log.mjs` does, at
  4 ms. They are 73 KB and 68 KB.
- The quad is armed on the floor, then flown 1000 m up in open air.
- The detector runs on the sim's state, as the page runs it.

| Air65 freestyle (log 1) | Gyro shows | Before (per 16 ms frame) | After (4 ms sim clock) |
|---|---:|---:|---:|
| Roll | 10 | 10 | 10 |
| Front flip | 5 | 5 (as Flip) | 5 |
| Back flip | 5 | 2 (as Flip) | 4 |
| Yaw spin | 4-5 | 4 | 4 |
| Matty, Snapback, Cradle, Split-S | | 1 each | 1 each |
| Juicy Flick | | 2 | 2 |

The test requires each count within one of the log (yaw spins 3-6), and
passes.
- The back flips found are at 41.5, 42.8, 44.1 and 98.2 s. Before, the ones at
  44.1 s and 98.2 s got no label.
- The fifth back flip in the log (48.4 s) turns only 273° inside 1.2 s; its
  341° are spread over 2.3 s.
- The 66.5 s segment is a front flip by its window (310°), and Matty wins it.

| Fractal75 (hover and punch) | Gyro shows | Before | After |
|---|---:|---:|---:|
| Roll | 0 (four slow post-punch turnarounds) | 1 (144.4 s) | 0 |

On the replay, the turnaround that was a Roll reaches only 145° of roll inside
1.5 s.

### The same, on the logs' gyro attitude

This is the audit's method (section 4): attitude integrated from the logged
gyro. Before is the old detector at 60 Hz; after is the new one at 4 ms.

Air65 freestyle, held in place (no position):

| t0 (s) | pitch° | roll° | yaw° | Gyro shape | Before | After |
|---:|---:|---:|---:|---|---|---|
| 6.8, 11.0, 25.6, 27.7, 29.6, 33.3, 35.0, 36.3, 112.6, 116.1 | | ±348..376 | | roll ×10 | roll ×10 | roll ×10 |
| 16.5 | 378 | 1 | -1 | front flip | — | front flip |
| 18.8 | 314 | 1 | 0 | front flip | — | front flip |
| 22.0 | 355 | -1 | -1 | front flip | — | front flip |
| 109.6 | 338 | 3 | -1 | front flip | — | front flip |
| 111.1 | 333 | 0 | 1 | front flip | — | front flip |
| 66.5 | 247 | -105 | -50 | combined (310° in 1.2 s) | — | front flip |
| 40.7 | -376 | -3 | 0 | back flip | — | back flip |
| 42.1 | -345 | 0 | 0 | back flip | — | back flip |
| 43.3 | -392 | -1 | 0 | back flip | — | back flip |
| 48.4 | -341 | -64 | 2 | back flip, slow (271° in 1.2 s) | — | — |
| 94.7 | -370 | -53 | 8 | back flip (299° in 1.2 s) | — | — |
| 56.7 | -275 | 35 | 60 | slow, 4.5 s | — | — |
| 75.0, 77.6, 104.9, 106.9 | | | ±423..506 | yaw spin ×4 | yawspin ×4 | yawspin ×4 |
| 98.3 | 38 | 74 | -321 | yaw spin (crash, gyro clipped) | — | — |
| 72.3 / 89.0 / 120.5 | | | | | snapback / juicy / juicy | the same |

- **Held in place.** Before, held in place, no flip could score: `close` was
  0. Now every flip found by the window scores.
- **The two misses at 94.7 s and 48.4 s are honest misses.** The 94.7 s flip
  is 1° short of 300° in the gyro's 1.2 s window; the sim's replay of it makes
  303° and labels it. The 48.4 s flip is too slow.
- **Dead-reckoned** (velocity integrated from the accelerometer, a rough
  guess):
  - Before, it had Flip on 4 of the 5 front flips and Matty on the 18.8 s
    one; after, all 5 are front flips.
  - Back flips: 0 → 3, as held in place.
  - Matty, Split-S and Cradle as before.

Fractal75: the four turnarounds before and after, the same either way:

| t0 (s) | pitch° | roll° | yaw° | Best roll in 1.5 s | Before | After |
|---:|---:|---:|---:|---|---|---|
| 63.6 | -126 | -316 | 153 | 254° at 170 °/s | — | — |
| 97.4 | -231 | 268 | -198 | 158° at 105 °/s | — | — |
| 139.9 | -35 | -308 | 115 | 147° at 98 °/s | roll | — |
| 190.7 | -135 | -406 | 213 | 178° at 119 °/s | — | — |

### Tests

- **`tools/test_sim_tricks.mjs`:**
  - **Each trick type on the bf core.** 20 flights covering all 19 trick
    types, on sim-core with the owner's Air65 diff and sampled every 4 ms
    through the adapter. Each must be its one label, and the two flips must
    say front and back. Eighteen are the library's own maneuvers, sticks
    through the diff's rates. Two are the bf core's own:
    - the library's powerloops climb under 1.5 m at its throttle on the
      Air65, and full throttle loops;
    - its matty flips turn a full flip on Betaflight, where the js core lags,
      so the bf matty uses a shorter flip.
  - **Frame rate.** A flight advanced in 16 ms frames and in 80 ms frames
    gives the same labels and byte-identical segment features.
  - **The js library still passes.** The library flown on `QuadPhysics` passes
    unchanged, the powerloops included.
- **`tools/test_sim_tricks_logs.mjs`:** the two log replays above (2.7 s).
- **`tools/test_sim_tricks_debug.mjs`:** the overlay's copy of the classifier
  follows the new terms (the source-parse test and the 150k-segment replica
  check pass).

## 6. Fixes from flying: Trippy, Barani, Gap, the trick log

### The gap rule as it was

`stepDetector` (before this change) called a step a gap zone (`inGap`) when
the clearance scan found any of:
- walls on both x sides, each under 3.2 scene units (0.91 m) away and under
  7 (2.0 m) together;
- the same on z;
- **anything overhead within 14 scene units (4.0 m)** (`clr.up < GAP_UP_W`).

A box counted as a side when it overlapped the quad's height and its
position along the path within 0.45 scene units (13 cm). It counted as
overhead when it overlapped in x and z and sat more than 0.12 above.

A gap started in such a zone at more than 2.8 m/s. It scored on leaving the
zone if the quad had moved more than 4.2 scene units (1.2 m) through it at a
peak above 3.4 m/s, with no rotation open and a 2.2 s cooldown.

The overhead clause is what fired at random. In the House the ceiling is at
2.7 m, so every fast straight run indoors was in a gap zone. In the Rig and
the Warehouse (ceilings at 6 m) any flight above 2 m was in one, and so was
any run under the loft, a tower deck, a shelf or a table. The side clause
took openings up to 2 m wide (corridors, doorways), while the 3.4 m/s peak
missed slow passes through real slots.

On the bf core in the Rig, the old rule:
- scored a Gap flying under the loft's slab and out past its edge (4.5 m/s);
- scored nothing through the three crate slots at 3.2 m/s.

The new rule scores the reverse: the three crate slots, and nothing under the
loft.

### What changed

- **Gap, authored first.** The Rig (17), the House (3) and the Warehouse
  (50) carry their intentional gaps as volumes (`sim-maps.js` `mapGaps`,
  scene units, each with the axis it is flown along):
  - Rig: crate slots, pipe slits and riser slits, the tunnel, the loft hole;
  - House: the bookshelf gap, under the patio table (either way);
  - Warehouse: every rack's shelf levels, the gap, the Ion hoop.

  A pass goes in through one face across the axis and out through the
  opposite face; in or out through a side is a skim. With no authored volume
  near (0.3 m), the generic rule needs walls on both sides of the path, each
  within 2.5 frame widths (the page passes the quad's width: the Air65 is
  8.2 cm, so 0.21 m). It also needs at least 10 cm of the opening flown
  through and out the far end. A floor or ceiling is never a side. No speed
  floor.
- **Trippy**, by the owner's definition: at least 720° of yaw at 300 °/s or
  more while the path orbits a centre. The orbit's radius is 0.3-2.5 m (the
  path's curvature), its direction turns a full turn (360°) or more one way,
  at 1 m/s or more. The orbit is measured over the whole spin: out from the
  720° window for as long as the yaw keeps turning the same way at 80 % of
  300 °/s, since a full orbit usually takes longer than the 2.4 s that 720°
  needs.
  - **Yaw.** It is measured about the vertical: in a tilted spin the
    body-axis yaw sees only cos(tilt) of the turn.
  - **Upright or inverted.** An inverted spin that orbits is a Trippy (the
    old `trippy→ham` re-label is now `ham→trippy`).
  - **Pole bonus.** A pole or post (a collider at most 0.5 m across and 1 m
    tall) within 0.5 m of the orbit's centre earns 1.25× the points.
  - **In-place spins.** A spin in place by a pole, the old Trippy, is now a
    Yaw Spin.
- **Barani**, new (Novice, 100 / 125 indoors, above Flip's 50 / 75): at
  least 300° of pitch and 180 ± 45° of roll inside one 1.5 s window, ending
  upright. The overlay lists it among its candidates.
- **Copy trick log**: a button on the `?tricks=debug` overlay copies every
  attempt it logged, one JSON line each.

### Checks

- **bf core in the Rig** (sim-core with the Rig's colliders, the page's
  4 ms sampling):
  - A Trippy round the spin pole (a pilot holding 0.7 m round it in angle
    mode, yawing at 6.2 rad/s) scores Trippy with the pole bonus, clear of
    the pole.
  - A Barani (pitch to vertical, half twist, pitch to upright) scores
    Barani.
  - Through the crate slots: three Gaps, one per slot. Under the loft and out
    past its edge: none. Past the crate walls' open end (one side): none.
- **Volumes.** Every authored gap volume is clear of every collider and has
  a wall.
- **The owner's logs.** Replayed on the bf core, the counts are unchanged:
  rolls 10, front flips 5, back flips 4, yaw spins 4. On the Fractal75,
  nothing.
  - The segment at 66.5 s in the Air65 freestyle (Flip after #307, Matty when
    dead-reckoned) is now a Barani. On the logged gyro it turns 310° of pitch
    with a 180° roll inside 1.5 s and ends upright.
  - Neither log has a Trippy (no orbiting spins).

## 7. Fixes from the trick log: Powerloop, Trippy, long tricks

The owner flew 90 attempts in the Warehouse on the bf core with
`?tricks=debug` and copied the log. It is a fixture now
(`tools/fixtures/tricklog-depot-bf-1.jsonl.gz`, replayed by
`tools/test_sim_tricks_attempt_log.mjs`).

### What the log showed

- **Powerloops scored nothing.** Seq 4 (701° of pitch), 59 (606°) and 79
  (372°) are loops at 150-200°/s:
  - none turns 300° inside Flip's 1.2 s window (286°, 224°, 233°);
  - 4 and 59 also end 0.5-0.8 m above their entry, and the old rule wanted
    the path back at the entry height or below.
- **The trippy scored nothing.** Seq 22, 23 and 24 are one trippy cut into
  4.5 s segments. Each turns 460-590° about the vertical at 190-245°/s
  round a 1.3-1.7 m orbit, rolling 600-780°. The old rule wanted 720° at
  300°/s.
- **Long tricks were cut at 4.5 s**: the trippy above, and both double loops
  (dur 4.504, the cap).

### The fixes

- **Powerloop**, the owner's definition:
  - at least 300° of pitch inside its own window of up to 3.5 s
    (`LOOP_WIN_S`), not Flip's 1.2 s;
  - after its top the path comes back down to at most 1.5 m above the entry
    (`loopRet ≥ -1.5`); the climb (≥1.5 m) and the velocity's turn (≥270°,
    now the way the loop's pitch turns) stay;
  - loops are counted over the segment's whole turn of pitch the loop's way
    (`loopTot`): 600° or more is a **Double Powerloop**, then one more per
    further 360°. Each loop scores the Powerloop's 200 points (`bonus` of
    `scoreTrick`), and the pop says Double / Triple Powerloop.
- **Trippy**, the owner's definition: at least 360° about the vertical at
  150°/s or more while the path orbits 360° or more at a radius of
  0.3-2.5 m. No roll term, so a rolling trippy counts. The orbit is still
  measured over the whole spin, now while the yaw keeps 80 % of 150°/s, and
  it still needs to turn one way (80 % of its turning) at 1 m/s or more.
- **Long tricks**: a segment that reaches 4.5 s while turning about the
  vertical at Trippy's rate, or looping (300° in 3.5 s, the velocity turning
  with it), runs on while it keeps 80 % of that rate over the last 0.5 s,
  up to 10 s (`MANEUVER_SUSTAIN_S`). The history holds 10 s at 1 ms steps.

### The log, replayed

The log carries what each segment saw and every gate's value, but not the
new loop window. The replay rebuilds each maneuver's features from them
(checked against every logged gate value) and bounds the loop window from
below: for seq 4, 59 and 79 the pitch turned one way only (`pathP` =
`|pitch|`), so their whole turn is exact, and their last 3.5 s hold at least
531°, 425° and 372°.

- Seq 4, 59 and 79: Powerloop; 4 and 59 Double Powerloops.
- Seq 22, 23 and 24: Trippy.
- The 16 labels the log fired are unchanged.
- Two more change: seq 25, the same trippy's last 4.4 s, is a Trippy; seq
  75, a front loop of 309° that climbed 2.1 m and ended 0.5 m above its
  entry, is a Powerloop.
- The log has no traces, so the longer segments are not replayed: flown
  again, the spin of seq 22-25 would run on past 4.5 s (up to 10 s) while it
  keeps turning, and so would seq 4 and 59 while their pitch keeps turning.

A camera-lock orbit (one turn of yaw per orbit) at 150°/s or more inside
2.5 m is now a Trippy, as the definition says; wider or slower ones are not.

## 8. Ham Spin, the inverted yaw spin, from the second trick log

The owner flew a second log (89 attempts, Warehouse, bf core) and copied it
with "Copy trick log". It is a fixture now
(`tools/fixtures/tricklog-depot-bf-2.jsonl.gz`, verbatim), replayed with the
first by `tools/test_sim_tricks_attempt_log.mjs`.

### What the log showed

- **The inverted yaw spins scored nothing, or a Flip.** Seq 9, 20, 26 and 77
  are a half flip in, a yaw while inverted and a half flip out: 331-383° of
  pitch, 304-318° of turn about the vertical, below up-Z -0.35 for 56-67 %
  of the segment, upright at both ends. Ham wanted the pitch under 69° and
  the craft inverted the whole time, so it never fired; seq 26 scored Flip
  (301° of pitch in 1.2 s).
- **Body yaw would not do.** Seq 9 turned 228° of body yaw in all and seq 20
  289°, but 318° and 311° about the vertical: yaw made while tilted, then
  pitched round, turns the heading further than the yaw axis does.

### The fix

- **Ham Spin**, the owner's definition: ≥300° of yaw counted only while
  inverted, up-Z below -0.5 (`HAM_UPZ`, `HAM_MIN`). The yaw is the turn
  about the vertical, as for Trippy (`invYaw`: the largest one-way turn of
  that sum, over the steps past up-Z -0.5). The half flips in and out turn
  little about the vertical and count only while past -0.5, so they are
  allowed, and the maneuver is one Ham (300 points), not a Flip. Ham's old
  terms (≥360° of body yaw in 1.8 s, pitch and roll small, inverted the
  whole time) are gone; an in-place inverted spin still is a Ham.
- **Re-labels:** an inverted spin that orbits is a Trippy (as before); a
  full Roll (≥300° in 1.5 s at ≥250°/s) that also turned about the
  vertical is a Roll. Log 1's seq 42 is such a roll: 318° about the
  vertical, 372° of roll.
- **The overlay** shows Ham's one gate (`invYaw`) and logs `invYawDeg` and
  `inv50` (the share of the segment past up-Z -0.5), so the next log
  replays it exactly.

### Flown

On both cores (`tools/test_sim_tricks.mjs`): a half back flip at 600°/s,
330° of yaw while inverted and a half flip out is one Ham, front or back;
260° of yaw is a Flip; with the yaw run 0.1-0.15 s into each flip,
340-350° of stick yaw turns only 190-275° about the vertical and it is a
Flip. In all
eight flights the turn past up-Z -0.5 comes within 5° of the segment's
whole turn about the vertical (`v.yawSpan`).

### The logs, replayed

Both logs predate the inverted turn. A segment that never went below up-Z
-0.5 has none, exactly. For the others the replay takes the segment's whole
turn about the vertical (the logged `vyawDeg`, its largest in 2.4 s), which
is what the flights above show for a half flip, a yaw and a half flip.

- Log 2: seq 9, 20, 26 and 77 are Ham Spins; seq 29 and 30 Trippy; seq 4 a
  Powerloop (554° of pitch, one loop).
- Of the 30 labels the two logs fired, one changes: log 2's seq 26, Flip,
  is a Ham Spin.
- Five unlabelled maneuvers change:
  - log 1's seq 12, 40 and 67 are Ham Spins: back flips of 335-423° with
    328-415° of yaw and 313-321° about the vertical, the same maneuver;
  - log 2's seq 82 and 84 are Ham by the estimate only: one tumble of 7.8 s
    (pitch, roll and yaw together, gyro peaks of 2500-5000°/s) that turned
    339° and 343° about the vertical. 84 was below up-Z -0.35 for 0.39 s,
    so it likely turned far less while inverted.
- The Air65 and Fractal75 replays (`tools/test_sim_tricks_logs.mjs`) give
  the same labels at the same times.

The owner's spins sit near the line: 304-318° about the vertical, and seq
26 and 77 at 305° and 304°. Flown, the inverted part comes 0-4° under the
whole turn, so a spin of 300-305° can fall either side of 300.
