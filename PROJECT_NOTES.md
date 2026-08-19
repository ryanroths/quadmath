# QuadMath — Project Notes

FPV drone build calculator. Web tool that estimates top speed, flight time, and
thrust-to-weight from a pilot's motor/prop/battery setup. Goal: niche hobby tool
monetized with ads (AdSense), light maintenance, SEO-driven traffic.

Built by Ryan (RyFly) — FPV freestyle pilot, learning Python, into agentic tooling.

## Current state

Single self-contained file: `index.html` (HTML + CSS + vanilla JS, all client-side,
no backend, no build step). Open directly in a browser — no server needed.

Working features:
- Frame size selector: 65mm whoop, 75mm whoop, 3" freestyle, 5" freestyle, 7" long range.
  Each button auto-populates typical defaults (KV, cells, capacity, pitch, weight).
- Live calc on input change: top speed (hero stat), flight time, thrust-to-weight
  (with a fun rating label), total thrust.
- OSD-style results panel (corner brackets, monospace green telemetry look) — meant to
  evoke goggle on-screen display.
- Two ad-slot placeholders positioned after primary interaction and mid-content.

## Design system (keep consistent if extending)

- Colors: bg #0D0E12, panel #15171D, text #E8E6E1, muted #8A8F98 (WCAG AA — do not
  darken below this; it clears 4.5:1 by only 0.4 on .tune-badge),
  orange #FF4D1A (prop-stripe accent), green #3DDC97 (telemetry stat color), border #2A2D35.
- Fonts: Space Grotesk (display/headings), Inter (body), JetBrains Mono (numbers/stats/labels).
- Signature element: the OSD results panel. Don't lose it.
- Grounded in real FPV visual language (OSD telemetry, prop warning orange) — avoid
  generic SaaS-template look.

## Known issues / next steps (priority order)

1. **TOP SPEED MODEL IS A BAND-AID.** Currently: speed = pitch × (KV × voltage ×
   pitchEfficiency) × 60 / 63360. The `pitchEfficiency` constants are per-frame fudge
   factors (65mm 0.42, 75mm 0.22, 3" 0.65, 5" 0.82, 7" 0.85) hand-tuned to make whoop
   numbers believable. The real problem: pure prop-pitch-speed doesn't account for RPM
   dropping under aerodynamic load, which dominates at small-prop/high-KV scale.
   PROPER FIX: model a load-limited max RPM (thrust vs drag equilibrium) instead of
   scaling raw unloaded pitch speed. This is the most important rewrite.

2. **Thrust + current constants are rough community averages.** `thrustPerWatt` and the
   `estMaxCurrentPerMotor` model are simplified. Validate against real bench data or
   pilot-reported numbers. Ryan can sanity-check with his actual HA65 (30K KV motors)
   and other builds.

3. **Flight time** uses 80% usable capacity + an avg-current-fraction estimate per frame.
   Reasonable but unvalidated. Same validation approach.

4. Add more calculators: voltage sag estimator, prop pitch speed reference table,
   battery C-rating headroom check.

## Blocked on measurement

Motors deliberately left out of `motorDB` in `script.js`. Each was researched
against the vendor, retailers, and aggregators; none publishes a per-motor
weight. Weight drives AUW, thrust-to-weight, and the build score, so an
invented figure is worse than an absent entry. Do not re-research these from
scratch — they need a scale, not another search.

- **BetaFPV 0702 Freestyle (2026) 25000** — the weight cell is blank in
  BetaFPV's own 2026 spec table. Champion (1.59g) and Racing (1.50g) are
  populated, Freestyle is not. Same gap on the 0802 Freestyle, which is why
  that entry carries an unsourced 1.90 marked `weight UNSOURCED`. Note that
  search summaries will happily claim Freestyle matches Racing — that is a
  misread of the table, the cell is empty.
- **weBLEEDfpv BORGSLAYER 0802 21500** — no published weight. wrekd's Shopify
  data exposes `weight: 23`, which is package mass for the 4-pack, not motor
  mass; 23/4 = 5.75g against an 0802 family range of 1.80-2.10g.

**Unblock condition:** one reading per motor at 0.01g resolution, weighed
as-shipped with leads and plug attached. One number each is enough to add
both. Use as-shipped rather than the trimmed basis used for the SCREAMERS
row -- see "Known data-quality issues" below for why that row is the
exception and not the pattern to copy.

## Known data-quality issues

`motorDB` `weightPerMotor` has no single basis. Rows are a mix of vendor
as-shipped figures, vendor no-connector figures, and now one owner measurement
taken with cut leads and no plug. BetaFPV alone publishes both conventions for
the same motor (1.52g with connector, 1.45g without), and the two VCI rows
(Spark 1.52, PRO DB 1.49) come from different pages using different
conventions.

`weightPerMotor` x 4 feeds the derived dry weight, so the inconsistency
propagates into AUW, thrust-to-weight, and the build score.

The fix is to pick one convention — recommend as-shipped, wires and plug on
— record the basis per row, and re-source. Not urgent: worst-case spread is
about 0.15g per motor, roughly 0.6g on a 25g build. But it should not grow, so
new rows should record their basis even before the back-fill happens.

The clearest current example is `weBLEEDfpv SCREAMERS 0702 (1mm)`, which is
owner-measured at 1.43g with leads cut to 25mm and plugs off. As-shipped is
probably ~1.58g. The delta is not applied, because it is an estimate stack
rather than a measurement, so that motor currently derives a dry weight about
0.6g light against its peers.

## Deployment plan (not started)

- Host as static site — Netlify, Cloudflare Pages, or GitHub Pages (all free, easy).
- Add Google AdSense once there's traffic (needs site approval first).
- SEO: add blog content ("best motors for 5 inch freestyle 2026", per-frame build guides)
  linking to the calculators. Static markdown pages or simple CMS.
- Consider splitting into multiple pages once content grows (currently single page).

## Validation idea

Early on, Ryan's real-world flying experience is the best "data source." Plug actual
builds into the tool and tune constants against what the numbers *feel* like in the air.
