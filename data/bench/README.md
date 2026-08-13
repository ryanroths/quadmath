# data/bench/

One JSON file per build. First-hand measured data only — nothing here is modelled,
interpolated, or copied off a spec sheet. `bench.html` is hand-authored and cites these
files; it does not read them at runtime.

Two consumers:

- `scripts/agent/generate_content.py` — refuses to write a build guide unless a file here
  validates against `bench_schema` in `scripts/ci/agent_policy.json`.
- `script.js` — has its own hardcoded `BENCH_ANCHORS` list. It does **not** read these
  files. A build only changes a calculator estimate when it is added to that list by hand.

## Core fields

Required by `bench_schema`: `build_id`, `frame_size_mm`, `motor`, `motor_kv`, `prop`,
`battery`, `auw_g`, `source`, and at least one of `hover_time_s` / `cruise_time_s` /
`freestyle_time_s`. Also carried on every file: `name`, `class_mm`, `video`,
`motor_detail`, `prop_detail`, `firmware`, `weights_g`, `current_sensor`, `flights`,
`pending`, `applies_to`.

`applies_to` is a list of `"<frame>mm/<motor>/<prop>"` strings, matched exactly by the
content generator when the file's name does not match the target slug. Leave it empty on
any build that should not back published claims.

## Provisional-build fields

Added for builds that are published before they are trustworthy. A build is provisional
when `current_sensor.correction_factor` is null or `controlled` is false; `bench.html`
renders those with a badge, amber raw-value cells, and an inline caveat.

| Field | Level | Meaning |
| --- | --- | --- |
| `controlled` | build and flight | `false` when charge state, cutoff, or throttle profile were not held constant. Runs marked false cannot be compared against each other. |
| `packs` | build | Map of `pack_id` to a pack object, for builds flown on more than one pack. Single-pack builds keep the flat `pack` object instead; the renderer falls back to it. |
| `pack_id` | flight | Key into `packs`. Absent on single-pack builds. |
| `auw_g` | flight | All-up weight for that run — varies with pack. Authoritative over the build-level `auw_g`, which is a single required scalar and names one representative pack. |
| `mah_per_min_raw` | flight | Raw OSD mAh divided by duration in minutes. Uncorrected. |
| `avg_current_a_raw` | flight | Raw OSD average current. Uncorrected. |
| `connector_note` | build | Connector mismatches, adapters, and what that does to resistance or measured weight. |
| `motor_detail.shaft_type` | build | Shaft finish, e.g. `knurled`. Optional. |
| `weights_g.includes` | build | What the dry weight actually covers, e.g. `frame`, `motors`, `fc`, `camera`, `vtx`, `antenna`, `canopy`, `props`, `hardware`. Add it only where the convention is confirmed — an absent array means unrecorded, not props-off. |
| `weights_crosscheck` | build | Corroboration, not conflict. Holds `auw_measured_g` and `auw_derived_g` keyed by `pack_id` — an independent scale reading against the dry+pack sum — plus a `note` recording the agreement and which set the file uses throughout. |

`motor` and `motor_detail.model` carry the motor DB `name` verbatim from the `motorDB`
table in `script.js`, with KV in the separate `motor_kv` field. The display label a user
sees in the calculator (`name  —  32,500 KV  ·  ✓ bench-verified`) is assembled at render
time and is not what gets stored here.

On a provisional build set `cruise_time_s`, `mah_corrected`, `correction_factor`, and
`avg_current_a_corrected` to null, and leave `applies_to` empty. Null `cruise_time_s`
means the file will fail `bench_schema` — that is intended. It is what stops the content
generator writing a guide off uncorrected numbers.

## Current files

| File | Class | Status |
| --- | --- | --- |
| `air65-analog-vci0702-30k.json` | 65mm | Calibrated, controlled |
| `mobula6-2024-hdzero-se0702-28k.json` | 65mm | Calibrated, controlled |
| `treetopper75-analog-0802-32500k.json` | 75mm | Provisional — uncalibrated sensor, uncontrolled runs |
