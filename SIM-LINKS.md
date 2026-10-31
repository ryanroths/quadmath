# Sim deep links for QuadMath guides

W1 “Your build” is in the sim only. **Do not edit guide HTML in this PR.** Paste the snippet below into a guide when you want a “Try it in the sim” button.

Values are **approximate**. Build codes set mass / thrust / spool / pack sag. They do not overwrite a pasted Betaflight CLI dump (PIDs still come from Tune). URL `?preset=` / `?rates=` set rates only — never PIDs.

Boot apply order: map/track → build → mode → **preset → rates** → drill. Precedence is `rates=` > `preset=` > saved `ryflyRates`. Query rates are **session-only** (not written to localStorage). Neither overwrites `?build=`. PIDs never come from the URL.

## Snippet

```html
<p>
  <a href="https://quadmath.com/sim.html?map=living&amp;track=living-sofa&amp;mode=angle&amp;build=QB1.air65&amp;preset=whoopBeginner&amp;drill=hover-hold&amp;dev=1">Try it in the sim</a>
  — approximate whoop physics, not a thrust-stand log. Paste your Betaflight dump in Tune (Tab) if these rates are not yours.
</p>
```

Swap from the pairing table. Two-link pages (analog vs HDZero, Air vs Meteor, 65 vs 75 pack) get two anchors, same sentence. Every guide link ends in `&dev=1`: the guides pair with the dev maps, and without it a link lands on The Rig.

| Param | What |
| --- | --- |
| `map` | `rig` (The Rig, the launch map), `house` (The House). `city` `living` `garage` `warehouse` `office` `gym` `trainer` `room` `backyard` open only with `dev=1`; without it the link lands on The Rig (free flight). |
| `build` | Share code. Named presets (`QB1.air65`) or full `QB1.65-23000-31x3-1s300-27`. Physics only. |
| `track` | Course id (`rig-loop`, `house-loop`; with `dev=1`: `living-sofa`, `office-cubicles`, `gym-court`, `trainer-figure8`, `city-loop`, `0` / `1` for legacy city). |
| `mode` | `angle` (default for newcomers), `horizon`, or `acro`. |
| `preset` | Rate preset id: `whoopBeginner` `whoopRace` `freestyle` `ryanActual`. |
| `rates` | Compact token `TYPE.rollRc.rollSr.rollEx.pitchRc.pitchSr.pitchEx.yawRc.yawSr.yawEx` (CLI integers; expo 0–100). Wins over `preset`. Example: `ACTUAL.4.74.56.4.74.56.4.70.56`. Card aliases: `card.65-betafpv-stock`, `card.65-betafpv-ryfly-1219s`, `card.75-betafpv-ryfly-o4-gf1811`, `card.75-happymodel-aio-stock`. |
| `3d` | `1` enables Betaflight-style 3D (reversible motors, acro). Center throttle is zero thrust. 3D runs are not counted on boards. |
| `drill` | W4 Coach id (`hover-hold`, `yaw-spin`, `straight-line`, `gate-pass`, `doorway-pass`, `split-s`, `power-loop`). Bronze on the previous drill unlocks the next. |

Copy a live rates URL from Tune → COPY RATES LINK (next to IMPORT CLI). Copy a build-only URL from Tune → Your build → COPY BUILD LINK. Both add `&dev=1` themselves when the map you are flying needs it (any map but The Rig and The House, except a Daily, weekly or room-practice course).

## Preset codes

| Code | Approx. hardware | Notes |
| --- | --- | --- |
| `QB1.whoop65` | 65mm 1S 23000KV, 31×3, 300 mAh, 27 g | Class ballpark (19000–25000 KV). |
| `QB1.air65` | 65mm 30000KV, 31×3, 1S 300, 25.4 g | AUW from `data/bench/air65-analog-vci0702-30k.json`. |
| `QB1.mobula6` | 65mm 28000KV, 31×3, 1S 300, 27.7 g | AUW from `data/bench/mobula6-2024-hdzero-se0702-28k.json`. |
| `QB1.whoop75_1s` | 75mm 1S 22000KV, 40×3, 450 mAh, 32 g | Class ballpark. |
| `QB1.fractal75` | 75mm 25000KV, 40×2, 1S 450, 35.7 g | AUW from `data/bench/fractal75-analog-rcinpower0802-25k.json` (provisional). |
| `QB1.cockroach75` | 75mm 28000KV, 40×2, 1S 450, 36.3 g | AUW from `data/bench/cockroach75-hdzero-champion0802-28k.json` (provisional). |
| `QB1.treetopper75` | 75mm 32500KV, 40×2, 1S 450, 34.6 g | AUW from `data/bench/treetopper75-analog-0802-32500k.json` (provisional). |
| `QB1.whoop75_2s` | 75mm 2S 14000KV, 40×3, 300 mAh, 42 g | Community default, not a bench log. |
| `QB1.meteor75pro` | 85mm-class 1S 19000KV, 40×4, 480 mAh, 41.5 g | Guide 80mm / 41.5 g O4 Wide; nearest picker class is 85mm. |
| `QB1.whoop85_2s` | 85mm 2S 11000KV, 51×3, 450 mAh, 48 g | Class ballpark. |

Indoor whoop tracks to prefer: `rig-loop` (no `dev=1` needed); with `dev=1`: `living-sofa`, `living-circuit`, `garage-bench`, `warehouse-aisle`, `office-cubicles`, `gym-court`, `trainer-figure8`. City loop remains `city-loop` (legacy `0`).

## Rate presets

| Id | Type | What |
| --- | --- | --- |
| `whoopBeginner` | Betaflight | Soft indoor whoop. |
| `whoopRace` | Betaflight | Faster whoop race. |
| `freestyle` | Betaflight | 5-inch-ish freestyle. |
| `ryanActual` | Actual | Center 40, max 740 / 740 / 700, expo 0.56. Token `ACTUAL.4.74.56.4.74.56.4.70.56`. |

Published cards (also `?rates=card.<id>`):

| Card | Type | CLI (roll / pitch / yaw) |
| --- | --- | --- |
| `card.65-betafpv-stock` | Actual | 7,58,0 / 7,58,0 / 7,50,0 |
| `card.65-betafpv-ryfly-1219s` | Actual | 2,74,56 / 2,74,56 / 2,70,56 |
| `card.75-betafpv-ryfly-o4-gf1811` | Actual | 2,73,56 / 2,73,56 / 2,70,56 |
| `card.75-happymodel-aio-stock` | Betaflight | 100,70,0 (all axes) |

The Rig is the launch map; it and The House are the maps open without `dev=1`: `?map=rig` (free flight) or `?track=rig-loop` (the 17-gate loop), `?map=house` or `?track=house-loop` (the 20-gate loop). Links to any other map carry `&dev=1`; the snippet and every example here do. A link without it opens The Rig.

Your room (W3) is generated in the sim from L×W×H. Deep-link the last saved cell with `?map=room&dev=1` or `?track=room-practice` (a generated course, open without `dev=1`), or pass `?room=16x12x8ft` / `?room=5x4x2.6m`.

## Existing guides (scan of `content/guides/`)

Suggested params for Ryan to apply. No guide file is edited here. Skip chargers / connectors / US rules — not a flight page.

| Guide | map | track | mode | build | preset / rates | drill |
| --- | --- | --- | --- | --- | --- | --- |
| [`first-tiny-whoop-setup.html`](content/guides/first-tiny-whoop-setup.html) | living | `living-sofa` | angle | `QB1.air65` | `whoopBeginner` | `hover-hold` |
| [`sim-to-first-pack.html`](content/guides/sim-to-first-pack.html) | living | `living-sofa` | angle | `QB1.air65` | `ryanActual` (paste-your-dump is the point) | `hover-hold` then F for acro |
| [`air65-pid-tune.html`](content/guides/air65-pid-tune.html) | living | `living-circuit` | acro | `QB1.air65` | `rates=ACTUAL.2.74.56.2.74.56.2.70.56` (optional stock Champion `ACTUAL.7.58.0.7.58.0.7.50.0`) | — |
| [`air65-ii-freestyle-vs-racing-vs-champion.html`](content/guides/air65-ii-freestyle-vs-racing-vs-champion.html) | living | `living-sofa` | angle | `QB1.air65` | `whoopBeginner` | — |
| [`65mm-happymodel-se0702-gemfan-1219-3-blade.html`](content/guides/65mm-happymodel-se0702-gemfan-1219-3-blade.html) | living | `living-circuit` | acro | `QB1.mobula6` | `whoopRace` | `gate-pass` |
| [`hdzero-vs-analog-65mm-flight-time.html`](content/guides/hdzero-vs-analog-65mm-flight-time.html) | living | `living-sofa` | angle | analog `QB1.air65` **and** HDZero `QB1.mobula6` | `whoopBeginner` | — |
| [`whoop-video-analog-vs-digital.html`](content/guides/whoop-video-analog-vs-digital.html) | living | `living-sofa` | angle | same two-link fork | `whoopBeginner` | — |
| [`betafpv-air-vs-meteor-pavo.html`](content/guides/betafpv-air-vs-meteor-pavo.html) | living / garage | `living-sofa` / `garage-bench` | angle | `QB1.air65` / `QB1.meteor75pro` | `whoopBeginner` | — |
| [`meteor75-pro-ii-o4-wide.html`](content/guides/meteor75-pro-ii-o4-wide.html) | garage | `garage-bench` | angle | `QB1.meteor75pro` | `whoopBeginner` | `straight-line` |
| [`1s-whoop-battery-by-size.html`](content/guides/1s-whoop-battery-by-size.html) | living / garage | `living-sofa` / `garage-bench` | angle | `QB1.air65` / `QB1.fractal75` | `whoopBeginner` | — |
| [`expresslrs-binding-radio-setup.html`](content/guides/expresslrs-binding-radio-setup.html) | trainer | `trainer-figure8` | angle | `QB1.whoop65` | `whoopBeginner` | `hover-hold` (optional hop) |
| [`1s-whoop-battery-connectors.html`](content/guides/1s-whoop-battery-connectors.html) | — | skip | — | — | — | — |
| [`1s-whoop-charger-whoopstor-vs-w63.html`](content/guides/1s-whoop-charger-whoopstor-vs-w63.html) | — | skip | — | — | — | — |
| [`whoopstor-v3-vs-betafpv-hexacharger.html`](content/guides/whoopstor-v3-vs-betafpv-hexacharger.html) | — | skip | — | — | — | — |
| [`us-tiny-whoop-rules-checklist.html`](content/guides/us-tiny-whoop-rules-checklist.html) | — | skip | — | — | — | — |

Example URLs:

```
https://quadmath.com/sim.html?map=living&track=living-sofa&mode=angle&build=QB1.air65&preset=whoopBeginner&drill=hover-hold&dev=1
https://quadmath.com/sim.html?map=living&track=living-circuit&mode=acro&build=QB1.air65&rates=ACTUAL.2.74.56.2.74.56.2.70.56&dev=1
https://quadmath.com/sim.html?build=QB1.mobula6&track=living-circuit&mode=acro&preset=whoopRace&dev=1
https://quadmath.com/sim.html?build=QB1.meteor75pro&track=garage-bench&mode=angle&preset=whoopBeginner&dev=1
https://quadmath.com/sim.html?build=QB1.whoop85_2s&track=warehouse-aisle&mode=horizon&dev=1
https://quadmath.com/sim.html?build=QB1.air65&track=office-cubicles&mode=angle&dev=1
https://quadmath.com/sim.html?build=QB1.air65&track=gym-court&mode=angle&dev=1
https://quadmath.com/sim.html?build=QB1.whoop65&track=trainer-figure8&mode=angle&preset=whoopBeginner&dev=1
https://quadmath.com/sim.html?build=QB1.air65&track=trainer-slalom&mode=acro&dev=1
https://quadmath.com/sim.html?map=room&room=16x12x8ft&mode=angle&dev=1
https://quadmath.com/sim.html?build=QB1.air65&track=trainer-figure8&mode=acro&3d=1&dev=1
```

W3 indoor maps (same `?track=` / `?map=` / `?mode=` scheme as W1):

| Map | Tracks |
| --- | --- |
| Office | `office-cubicles`, `office-hallway`, `office-desks` |
| School gym | `gym-court`, `gym-bleachers`, `gym-hoops` |
| Tiny Trainer | `trainer-figure8`, `trainer-slalom`, `trainer-hairpin` |
| Your room | `room-practice` (generated; optional `?room=LxWxHft`) |
