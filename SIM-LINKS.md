# Sim deep links for QuadMath guides

W1 “Your build” is in the sim only. **Do not edit guide HTML in this PR.** Paste the snippet below into a guide when you want a “Fly this build” button.

Values are **approximate**. Build codes set mass / thrust / spool / pack sag. They do not overwrite a pasted Betaflight CLI dump (rates / filters still come from Tune).

## Snippet

```html
<p>
  <a href="https://quadmath.com/sim.html?build=QB1.air65&amp;track=living-sofa&amp;mode=angle">Fly this build</a>
  in the QuadMath sim (approximate whoop physics — not a thrust-stand log).
</p>
```

Swap `build`, `track`, and `mode`:

| Param | What |
| --- | --- |
| `build` | Share code. Named presets (`QB1.air65`) or full `QB1.65-23000-31x3-1s300-27`. |
| `track` | M2 id (`living-sofa`, `garage-bench`, `city-loop`, `0` / `1` for legacy city). |
| `mode` | `angle` (default for newcomers), `horizon`, or `acro`. |

Copy the live code from Tune → Your build → COPY BUILD LINK.

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

Indoor whoop tracks to prefer: `living-sofa`, `living-circuit`, `garage-bench`, `warehouse-aisle`. City loop remains `city-loop` (legacy `0`).

## Existing guides (scan of `content/guides/`)

Suggested params for Ryan to apply. No guide file is edited here.

| Guide | Suggested `build` | `track` | `mode` | Why |
| --- | --- | --- | --- | --- |
| [`first-tiny-whoop-setup.html`](content/guides/first-tiny-whoop-setup.html) | `QB1.air65` | `living-sofa` | `angle` | First cart is the measured Air65 analog (25.42 g, 300 mAh 1S). |
| [`sim-to-first-pack.html`](content/guides/sim-to-first-pack.html) | `QB1.air65` | `living-sofa` | `angle` | Same maiden: paste rates in Tune, then this build. |
| [`air65-ii-freestyle-vs-racing-vs-champion.html`](content/guides/air65-ii-freestyle-vs-racing-vs-champion.html) | `QB1.air65` | `living-sofa` | `angle` | Closest flown analog stack. Champion/Racing BNFs are not separate presets. |
| [`air65-pid-tune.html`](content/guides/air65-pid-tune.html) | `QB1.air65` | `living-circuit` | `angle` | Build for physics; paste the card CLI for rates/PIDs. |
| [`65mm-happymodel-se0702-gemfan-1219-3-blade.html`](content/guides/65mm-happymodel-se0702-gemfan-1219-3-blade.html) | `QB1.mobula6` | `living-circuit` | `acro` | SE0702 28000KV + Gemfan 1219 3-blade, 27.73 g. |
| [`hdzero-vs-analog-65mm-flight-time.html`](content/guides/hdzero-vs-analog-65mm-flight-time.html) | analog `QB1.air65` / HDZero `QB1.mobula6` | `living-sofa` | `angle` | Two links: 25.42 g analog vs 27.73 g HDZero, same 300 mAh pack. |
| [`betafpv-air-vs-meteor-pavo.html`](content/guides/betafpv-air-vs-meteor-pavo.html) | Air `QB1.air65` / Meteor `QB1.meteor75pro` | `living-sofa` / `garage-bench` | `angle` | 65mm analog first; Meteor is the heavier 1S step. |
| [`meteor75-pro-ii-o4-wide.html`](content/guides/meteor75-pro-ii-o4-wide.html) | `QB1.meteor75pro` | `garage-bench` | `angle` | ~41.5 g, 1S, 480 mAh, ~80mm → 85mm picker class. Analog Pro II is ~28 g — use `QB1.65-19000-40x4-1s480-28` if you want that. |
| [`1s-whoop-battery-by-size.html`](content/guides/1s-whoop-battery-by-size.html) | 65mm `QB1.air65` / 75mm `QB1.fractal75` | `living-sofa` / `garage-bench` | `angle` | LAVA 300 on 65mm vs weBLEED 450 on 75mm. |
| [`1s-whoop-battery-connectors.html`](content/guides/1s-whoop-battery-connectors.html) | `QB1.whoop65` | `living-sofa` | `angle` | No specific airframe; class 65mm 1S is enough. |
| [`1s-whoop-charger-whoopstor-vs-w63.html`](content/guides/1s-whoop-charger-whoopstor-vs-w63.html) | `QB1.air65` | `living-sofa` | `angle` | Charger guide; Air65 is the pack those chargers see first. |
| [`whoopstor-v3-vs-betafpv-hexacharger.html`](content/guides/whoopstor-v3-vs-betafpv-hexacharger.html) | `QB1.air65` | `living-sofa` | `angle` | Same — not a whoop physics page. |
| [`whoop-video-analog-vs-digital.html`](content/guides/whoop-video-analog-vs-digital.html) | analog `QB1.air65` / digital `QB1.mobula6` | `living-sofa` | `angle` | Same 65mm fork as the flight-time guide. |
| [`expresslrs-binding-radio-setup.html`](content/guides/expresslrs-binding-radio-setup.html) | `QB1.whoop65` | `living-sofa` | `angle` | Radio setup; any 65mm 1S is fine. |
| [`us-tiny-whoop-rules-checklist.html`](content/guides/us-tiny-whoop-rules-checklist.html) | skip, or `QB1.whoop65` | `living-sofa` | `angle` | Rules, not a build. Optional tutorial hop. |

Example URLs:

```
https://quadmath.com/sim.html?build=QB1.air65&track=living-sofa&mode=angle
https://quadmath.com/sim.html?build=QB1.mobula6&track=living-circuit&mode=acro
https://quadmath.com/sim.html?build=QB1.meteor75pro&track=garage-bench&mode=angle
https://quadmath.com/sim.html?build=QB1.whoop85_2s&track=warehouse-aisle&mode=horizon
```
