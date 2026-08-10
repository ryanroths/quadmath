# QuadMath

**[quadmath.com](https://quadmath.com)** — build math, tunes, and a flight sim for tiny whoops (65–85mm FPV drones). Static site, no backend, no tracking scripts. Built and maintained by [RyFly](https://quadmath.com/hire.html).

## What's here

**Build calculator** (`index.html`, `script.js`) — pick frame class, motor, prop, battery; get thrust-to-weight, AUW scoring, flight-time estimates, and C-rating sanity checks. Flying-style selector (Cruise / Freestyle / Aggressive) weights the scoring. Motor/prop combos with incoherent pitch pairings are filtered out. Shareable build links.

**Bench data** (`data/bench/`) — first-hand measured numbers: AUW on a scale, flight times on a stopwatch, per-build JSON with the pack, style, and method recorded. No manufacturer claims, no estimates dressed up as measurements. Flight-time estimates in the calculator are anchored to these files.

**Tune database** (`tune-database.html`, `tune-database.js`) — real Betaflight CLI dumps from flown builds. Every tune names its hardware and firmware target.

**Flight simulator** (`sim.html`, `quadphysics.js`) — browser-based whoop sim on Three.js. Four-motor quad-X model with airmode desaturation mixing, per-motor spool lag, rate-loop PID+FF at 240Hz, ground effect, and class presets using real flight-controller PID defaults. Gamepad support with per-device calibration (a TX16S in joystick mode works well).

**Guides** (`content/guides/`) — build write-ups backed by the bench data files they cite.

## The content agent

Part of the site's content is produced by an autonomous pipeline that runs on a weekly schedule:

1. `scripts/agent/collect_signals.py` reads the site **from `origin/main`** (never the working tree — a pull request cannot manufacture its own signals) and emits a ranked list of content gaps: builds the calculator offers with no coverage, missing metadata, and similar.
2. `scripts/agent/generate_content.py` picks one gap, generates a fix via the Anthropic API, validates it, and opens a pull request. A human reviews every PR before merge.

The interesting part is what it **refuses to do**:

- **No invented performance numbers.** A build guide is generated only if a bench-data file for that exact build exists at `data/bench/<slug>.json` and validates against the schema in `scripts/ci/agent_policy.json`. No bench file → the gap goes on a worklist for a human with a scale and a stopwatch.
- **No generated tunes.** PID tunes require a real CLI dump from a flown quad. Hard-refused, always.
- **No fixes it structurally can't make.** Orphan-page gaps (a page nobody links to) require editing a *different* page, so the single-file generator skips them and flags a human.
- **Model refusals fail loud.** A declined generation exits nonzero and names the gap — it is never silently retried or rerouted.

CI enforces the same policy on the receiving end: an `agent-gate` job checks every agent PR against path allowlists, diff caps, and HTML rules read from the base branch, so the agent can't loosen its own leash. A `human-override` label exists for maintainer changes to protected paths and is never applied reflexively.

## Repo layout

```
index.html            calculator + bench table
sim.html              flight simulator
quadphysics.js        sim physics module
tune-database.*       tune DB page + logic
data/bench/           measured build data (JSON)
content/guides/       build guides
scripts/agent/        signal collector + content generator + tests
scripts/ci/           agent policy (allowlists, schemas, caps)
go/                   affiliate redirect stubs
```

## Stack

GitHub Pages behind Cloudflare. Vanilla HTML/CSS/JS — no framework, no build step. Three.js (vendored, ES modules) for the sim. Python 3 for the agent pipeline and CI tooling.

## Disclosure

Some outbound links are affiliate links (BetaFPV, weBLEED FPV). They never affect what the calculator recommends — scoring is math on measured data, and the bench JSONs are public so you can check.
