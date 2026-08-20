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
3. `scripts/agent/ingest_tunes.py` turns approved community tune submissions into pull requests: it parses the pilot's `diff all` with `scripts/parse_tune_diff.py`, appends the entry to the `TUNES` array in `tune-database.js`, and links the issue.

Both run weekly on a Raspberry Pi, Sunday 09:00, in the `mesh_env` virtualenv:

```cron
0 9 * * 0 cd ~/quadmath && ~/mesh_env/bin/python scripts/agent/collect_signals.py --ref origin/main --out ~/quadmath_gaps.json && ~/mesh_env/bin/python scripts/agent/generate_content.py --gaps ~/quadmath_gaps.json --root ~/quadmath && ~/mesh_env/bin/python scripts/agent/ingest_tunes.py --root ~/quadmath
```

### Community tune submissions

Anyone can send a tune through the [issue form](.github/ISSUE_TEMPLATE/tune-submission.yml). What happens to it:

- The form collects the hardware the firmware cannot report — motor, prop, frame size — plus the raw `diff all` and a credit handle.
- **A human reads it and adds the `approved` label.** Nothing else starts the pipeline. The agent never applies that label; `ingest_tunes.py` raises if asked to, and a test pins it. Submissions are untrusted input from the internet, and a gate the agent can open is not a gate.
- The parser refuses more than it accepts: a `dump` instead of a `diff` (a dump prints every default, so everything would read as a deliberate choice), PIDs outside 0–255, rates outside the Configurator's range, a truncated diff, a partial rate block. A refusal names the missing `set` lines and writes nothing.
- Nothing is inferred. A parameter absent from a diff produces no note — the notes on a card are only what the firmware actually reported.
- The resulting PR goes through the same `agent-gate` job as every other agent PR and still needs a human to merge. Nothing auto-merges.

Community tunes carry the submitter's handle as their `source` (or `Community` when anonymous), a dashed badge rather than the RyFly one, and a line on the card saying so. `RyFly` and `Stock` are reserved: a submitter who types either into the credit field gets `Community` instead. Someone deciding whether to flash a tune should be able to tell from the card whether it was measured here or arrived through a form.

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
scripts/parse_tune_diff.py   Betaflight `diff all` -> one TUNES entry
scripts/agent/        signal collector + content generator + tune ingest + tests
scripts/ci/           agent policy (allowlists, schemas, caps)
go/                   affiliate redirect stubs
```

## Stack

GitHub Pages behind Cloudflare. Vanilla HTML/CSS/JS — no framework, no build step. Three.js (vendored, ES modules) for the sim. Python 3 for the agent pipeline and CI tooling.

## Disclosure

Some outbound links are affiliate links (BetaFPV, weBLEED FPV). They never affect what the calculator recommends — scoring is math on measured data, and the bench JSONs are public so you can check.
