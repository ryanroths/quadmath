# Trick detection on the bf core: audit, debug overlay, real logs

2026-11-04, against `main` at eb0344b (quadmath #305 merged: the 65 flies the
bf core on the Air65, the 75 the bf core on the Fractal75, the 85 the js
core) and sim-core v0.6.0 (754266f). No threshold changed. `sim-tricks.js`
is unchanged by this work.

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

- **Frame-rate dependence (both cores).** The detector's `dt` is clamped to
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
  - `abort`: a segment dropped by the jump guard, a crash or a reset;
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
