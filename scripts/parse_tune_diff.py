#!/usr/bin/env python3
"""
Betaflight `diff all` -> one TUNES-shaped entry for tune-database.js.

Reads raw CLI text, extracts only what the firmware actually reported, and
emits the dict shape tune-database.js already uses:

    { id, frame, brand, source, sourceType, fc, combo, rateType,
      pids:  { roll: [P, I, D], pitch: [P, I, D], yaw: [P, I, 0] },
      rates: { roll: [rcRate, super, expo], ... } | None,
      notes: [str, ...] }

Hardware the firmware cannot know -- brand, motor, prop, and who is being
credited -- is never guessed. It comes in as arguments from the submission
form and is passed through untouched.

WHAT "ABSENT" MEANS
-------------------
A `diff` prints only what differs from the firmware defaults, so an absent
parameter positively asserts "this is at default". That is fine for a note
(no line -> no claim) and useless for a number: PID and rate defaults are
per-target and per-firmware-version, so "at default" does not tell us what
value the pilot is flying. So:

  * notes    -- a parameter that is absent produces no note. Nothing is
                inferred, nothing is filled in.
  * PIDs     -- a missing term is a refusal, naming the exact `set` lines the
                submitter has to add. Publishing a guessed P term is how
                someone flashes a tune that is not the one that was flown.
  * rates    -- all nine values or none. None emits `rates: null`, which the
                card already renders as "Not published yet -- PIDs only" with
                the CLI button hidden (see 75-betafpv-stock). A partial rate
                block would be exported verbatim by that button, so it is a
                refusal, not a half tune.
  * yaw D    -- taken from `d_yaw` when present, otherwise 0. This is not an
                assumed default: the schema in tune-database.js defines the
                yaw row as [P, I, 0], and all eight hand-authored entries
                carry 0 there.
  * rateType -- `rates_type` absent means BETAFLIGHT. This is the one default
                the parser applies, because the rate *type* default is the
                same on every target across BF 4.4 and 4.5, unlike the
                numeric defaults above.

UNITS
-----
Values are stored exactly as the diff prints them, matching the note at the
top of tune-database.js: "Values are stored exactly as they appear in the
pilot's Betaflight diff, so the CLI export can emit them verbatim without
unit conversion." The CLI integers are the Configurator display value x100
for rates (rc_rate 100 -> 1.00, srate 70 -> 0.70, expo 0 -> 0.00) and plain
for PIDs. The validator's ranges are stated in display units and converted
before comparison, so the stored numbers stay round-trippable.

BF 4.4 vs 4.5
-------------
Parameters renamed between the two are read under both names and reported
under the name the diff actually used -- they are not folded together:

  d_min_roll/pitch/yaw   (4.4)  -> "D-min R../P.."
  d_max_roll/pitch/yaw   (4.5)  -> "D-max R../P.."

D-min is a floor and D-max is a ceiling; calling one the other would make the
note say the opposite of what the pilot flew.

Usage:
    python3 scripts/parse_tune_diff.py --diff submission.txt \\
        --frame 65 --brand BetaFPV --motor "VCI 0702 30K KV" \\
        --prop "Gemfan 1219S" --pilot someone

    cat submission.txt | python3 scripts/parse_tune_diff.py --frame 65 ...

Exits 0 and prints JSON on success. Exits 2 and prints the reasons on any
refusal. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

# --------------------------------------------------------------------------
# limits
# --------------------------------------------------------------------------

PID_MIN, PID_MAX = 0, 255

# Display units. CLI integers are these x100 (rc_rate 100 -> 1.00).
RC_RATE_MIN, RC_RATE_MAX = 0.01, 2.55
SRATE_MIN, SRATE_MAX = 0.0, 1.00
EXPO_MIN, EXPO_MAX = 0.0, 1.00
RATE_SCALE = 100.0

# A whoop `diff all` runs well under a hundred `set` lines. A `dump all` runs
# to several hundred because it prints every parameter at its default. The
# header check below is the real discriminator; this is the backstop for a
# dump with a hand-pasted `# diff` line on top, which would otherwise be read
# as "every setting on this quad is custom".
MAX_SET_LINES = 250

# Reserved for first-party tunes. A submitter cannot claim either of them:
# the badge on the card is the whole provenance signal, so a stranger typing
# "RyFly" into the credit field must not come out the other side wearing the
# bench-verified badge.
RESERVED_SOURCES = {"ryfly", "stock"}
ANON_SOURCE = "Community"
HANDLE_MAX = 24
_HANDLE_STRIP = re.compile(r"[^A-Za-z0-9_.@\-]")

VALID_FRAMES = (65, 75, 85)
RATE_TYPES = ("BETAFLIGHT", "ACTUAL", "QUICK", "RACEFLIGHT", "KISS")

AXES = ("roll", "pitch", "yaw")


class TuneRefused(Exception):
    """Raised with one or more reasons. Nothing is emitted when this fires."""

    def __init__(self, reasons):
        self.reasons = [reasons] if isinstance(reasons, str) else list(reasons)
        super().__init__("; ".join(self.reasons))


# --------------------------------------------------------------------------
# lexing
# --------------------------------------------------------------------------

_SET_RE = re.compile(r"^\s*set\s+([a-zA-Z0-9_]+)\s*=\s*(.+?)\s*$", re.MULTILINE)

# `diff all`, `diff`, or the commented echo Configurator adds. Betaflight has
# printed this line in every 4.x release.
_DIFF_MARKER = re.compile(r"^\s*#?\s*diff(?:\s+\w+)*\s*$", re.MULTILINE)
_DUMP_MARKER = re.compile(r"^\s*#?\s*dump(?:\s+\w+)*\s*$", re.MULTILINE)

# "# Betaflight / STM32F411 (S411) 4.5.1 Jun 12 2024 / 05:11:31 (77d01ba3b)"
_VERSION_RE = re.compile(
    r"^#\s*Betaflight\s*/\s*(\S+)\s*\(([^)]*)\)\s*(\d+\.\d+\.\d+)",
    re.MULTILINE | re.IGNORECASE,
)


def parse_settings(text: str) -> dict[str, str]:
    """Every `set key = value` in the text, last write wins.

    Last-wins matters: a `diff all` prints one block per PID profile and per
    rate profile, so a quad with two profiles emits p_roll twice. Betaflight
    replays the file top to bottom, so the final value is the one that lands.
    """
    found: dict[str, str] = {}
    for match in _SET_RE.finditer(text):
        found[match.group(1).lower()] = match.group(2).strip()
    return found


def parse_header(text: str) -> dict[str, str | None]:
    match = _VERSION_RE.search(text)
    if not match:
        return {"target": None, "manufacturer_id": None, "version": None}
    return {
        "target": match.group(1).strip() or None,
        "manufacturer_id": match.group(2).strip() or None,
        "version": match.group(3).strip() or None,
    }


# --------------------------------------------------------------------------
# typed reads -- absent stays absent, junk is a refusal
# --------------------------------------------------------------------------


def _as_int(settings: dict[str, str], key: str, problems: list[str]):
    raw = settings.get(key)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        problems.append("%s is not an integer: %r" % (key, raw))
        return None


def _as_flag(settings: dict[str, str], key: str, problems: list[str]):
    raw = settings.get(key)
    if raw is None:
        return None
    upper = raw.strip().upper()
    if upper in ("ON", "TRUE", "1"):
        return True
    if upper in ("OFF", "FALSE", "0"):
        return False
    problems.append("%s is not ON/OFF: %r" % (key, raw))
    return None


def _first_present(settings: dict[str, str], *keys: str) -> str | None:
    """Name of the first key that is in the diff, for 4.4/4.5 aliases."""
    for key in keys:
        if key in settings:
            return key
    return None


# --------------------------------------------------------------------------
# PIDs and rates
# --------------------------------------------------------------------------


def extract_pids(settings: dict[str, str], problems: list[str]):
    """[P, I, D] per axis. Yaw D is the schema's fixed 0 unless d_yaw is set."""
    missing: list[str] = []
    pids: dict[str, list[int]] = {}

    for axis in AXES:
        row: list[int] = []
        for term in ("p", "i", "d"):
            key = "%s_%s" % (term, axis)
            if key not in settings:
                if term == "d" and axis == "yaw":
                    # tune-database.js documents the yaw row as [P, I, 0].
                    row.append(0)
                    continue
                missing.append(key)
                row.append(None)  # already refused below; not a value
                continue
            row.append(_as_int(settings, key, problems))
        pids[axis] = row

    if len(missing) >= 8:
        problems.append(
            "no PID lines in the diff -- nothing to publish (looked for %s)"
            % ", ".join("set " + key for key in missing)
        )
    elif missing:
        problems.append(
            "incomplete PIDs, missing %d line(s): %s. Betaflight omits a "
            "parameter that is at its default, and PID defaults differ per "
            "target and per firmware version, so these cannot be filled in "
            "here -- run `get %s` on the quad and add the line(s)."
            % (len(missing), ", ".join("set " + key for key in missing), missing[0])
        )
    return pids


def extract_rates(settings: dict[str, str], problems: list[str]):
    """All nine rate values or None. Partial is a refusal, never a half tune."""
    keys = {
        axis: ["%s_rc_rate" % axis, "%s_srate" % axis, "%s_expo" % axis] for axis in AXES
    }
    flat = [key for row in keys.values() for key in row]
    present = [key for key in flat if key in settings]

    if not present:
        return None
    missing = [key for key in flat if key not in settings]
    if missing:
        problems.append(
            "incomplete rates, missing %d of 9 line(s): %s. The card's Copy "
            "CLI button exports rates verbatim, so a partial block would be "
            "flashed as if it were the flown tune -- run `get %s` and add the "
            "line(s), or drop every rate line to publish PIDs only."
            % (len(missing), ", ".join("set " + key for key in missing), missing[0])
        )
        return None

    rates: dict[str, list[int]] = {}
    for axis in AXES:
        row = []
        for key in keys[axis]:
            row.append(_as_int(settings, key, problems))
        rates[axis] = row
    return rates


# --------------------------------------------------------------------------
# notes -- terse, same voice as the hand-authored entries
# --------------------------------------------------------------------------


def _axis_note(label: str, values: dict[str, int | None]) -> str | None:
    """'D-min R36/P49' -- only the axes the diff actually carried."""
    parts = [
        "%s%d" % (prefix, values[axis])
        for axis, prefix in (("roll", "R"), ("pitch", "P"), ("yaw", "Y"))
        if values.get(axis) is not None
    ]
    if not parts:
        return None
    return "%s %s" % (label, "/".join(parts))


def build_notes(settings: dict[str, str], header: dict, problems: list[str]) -> list[str]:
    notes: list[str] = []

    # D-min (4.4) / D-max (4.5). Reported under the name the diff used --
    # a floor and a ceiling are not interchangeable.
    for prefix, label in (("d_min", "D-min"), ("d_max", "D-max")):
        values = {axis: _as_int(settings, "%s_%s" % (prefix, axis), problems) for axis in AXES}
        note = _axis_note(label, values)
        if note:
            notes.append(note)

    # TPA. 'TPA 60' or 'TPA 75/1250' when the breakpoint moved too.
    tpa_rate = _as_int(settings, "tpa_rate", problems)
    if tpa_rate is not None:
        tpa_break = _as_int(settings, "tpa_breakpoint", problems)
        if tpa_break is None:
            notes.append("TPA %d" % tpa_rate)
        else:
            notes.append("TPA %d/%d" % (tpa_rate, tpa_break))

    # Feedforward. `f_roll` on 4.4/4.5, `ff_roll` on older exports.
    ff = {}
    for axis in AXES:
        key = _first_present(settings, "f_%s" % axis, "ff_%s" % axis)
        ff[axis] = _as_int(settings, key, problems) if key else None
    if any(value is not None for value in ff.values()):
        if all(value in (0, None) for value in ff.values()):
            notes.append("FF off")
        else:
            notes.append(_axis_note("FF", ff))

    thrust_linear = _as_int(settings, "thrust_linear", problems)
    if thrust_linear is not None:
        notes.append("Thrust linear %d" % thrust_linear)

    # RPM filter rides on bidirectional DSHOT; without it there are no motor
    # RPMs to notch on, so dshot_bidir is the parameter that decides.
    bidir = _as_flag(settings, "dshot_bidir", problems)
    if bidir is True:
        proto = (settings.get("motor_pwm_protocol") or "").strip().upper()
        notes.append("RPM filter ON, bidir %s" % proto if proto else "RPM filter ON")
    elif bidir is False:
        notes.append("RPM filter off")

    # Gyro LPF1, static or dynamic. BF 4.4 and 4.5 share these names.
    static_hz = _as_int(settings, "gyro_lpf1_static_hz", problems)
    dyn_min = _as_int(settings, "gyro_lpf1_dyn_min_hz", problems)
    dyn_max = _as_int(settings, "gyro_lpf1_dyn_max_hz", problems)
    if dyn_min is not None and dyn_max is not None and (dyn_min or dyn_max):
        notes.append("Gyro LPF1 dyn %d–%dhz" % (dyn_min, dyn_max))
    elif static_hz is not None:
        notes.append("Gyro LPF1 off" if static_hz == 0 else "Gyro LPF1 %dhz" % static_hz)

    # Dynamic notch. 'Dyn notch 1xQ500 120-500hz', or whichever parts are set.
    count = _as_int(settings, "dyn_notch_count", problems)
    q_factor = _as_int(settings, "dyn_notch_q", problems)
    min_hz = _as_int(settings, "dyn_notch_min_hz", problems)
    max_hz = _as_int(settings, "dyn_notch_max_hz", problems)
    if count == 0:
        notes.append("Dyn notch off")
    else:
        bits = []
        if count is not None and q_factor is not None:
            bits.append("%d×Q%d" % (count, q_factor))
        elif q_factor is not None:
            bits.append("Q%d" % q_factor)
        if min_hz is not None and max_hz is not None:
            bits.append("%d–%dhz" % (min_hz, max_hz))
        if bits:
            notes.append("Dyn notch %s" % " ".join(bits))

    # Simplified ("slider") PIDs. Worth surfacing because it means the numbers
    # above were produced by the sliders rather than tuned term by term.
    mode = settings.get("simplified_pids_mode")
    if mode and mode.strip().upper() != "OFF":
        master = _as_int(settings, "simplified_master_multiplier", problems)
        if master is None:
            notes.append("Simplified PID mode, %s" % mode.strip().upper())
        else:
            notes.append("Simplified PID mode, master ×%d" % master)

    if header.get("version"):
        notes.append("BF %s" % header["version"])

    return [note for note in notes if note]


# --------------------------------------------------------------------------
# provenance
# --------------------------------------------------------------------------


def clean_handle(pilot: str | None) -> str:
    """Pilot handle for the card badge, or 'Community' when anonymous.

    Reserved first-party names are refused rather than accepted, so the badge
    keeps meaning what it says. Also stripped to a conservative charset -- the
    value lands in a JS string literal in tune-database.js and in a badge on
    the page.
    """
    handle = _HANDLE_STRIP.sub("", (pilot or "").strip())[:HANDLE_MAX].strip("@.-_")
    if not handle or handle.lower() in RESERVED_SOURCES:
        return ANON_SOURCE
    return handle


def make_id(frame: int, brand: str, source: str) -> str:
    bits = [str(frame), re.sub(r"[^a-z0-9]+", "", (brand or "").lower()) or "unknown",
            re.sub(r"[^a-z0-9]+", "-", source.lower()).strip("-") or "community"]
    return "-".join(bits)


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------


def check_is_diff(text: str, settings: dict[str, str]) -> list[str]:
    problems: list[str] = []
    if not _DIFF_MARKER.search(text):
        if _DUMP_MARKER.search(text):
            problems.append(
                "this is a `dump`, not a `diff all`. A dump prints every "
                "parameter at its default, so every filter and feedforward "
                "value would be read as a deliberate choice and published as "
                "a custom setting. Re-run `diff all` and paste that."
            )
        else:
            problems.append(
                "no `# diff` header found. Paste the whole `diff all` output, "
                "starting at the `# diff all` line -- the header is what "
                "separates a diff from a dump."
            )
    elif _DUMP_MARKER.search(text):
        problems.append("text contains both a diff and a dump marker -- paste one `diff all`")
    if len(settings) > MAX_SET_LINES:
        problems.append(
            "%d `set` lines is far past anything a whoop diff produces (cap "
            "%d) -- this looks like a dump with a diff header pasted on top"
            % (len(settings), MAX_SET_LINES)
        )
    return problems


def check_ranges(pids: dict, rates, problems: list[str]) -> None:
    for axis in AXES:
        for term, value in zip(("P", "I", "D"), pids.get(axis, [])):
            # None means the line was absent or unreadable, and both of those
            # are already reported by name. Repeating them as a range failure
            # buries the actionable message under noise.
            if value is None:
                continue
            if not (PID_MIN <= value <= PID_MAX):
                problems.append(
                    "%s %s = %s is outside %d-%d" % (axis, term, value, PID_MIN, PID_MAX)
                )
    if rates is None:
        return
    bounds = (
        ("rc_rate", RC_RATE_MIN, RC_RATE_MAX),
        ("srate", SRATE_MIN, SRATE_MAX),
        ("expo", EXPO_MIN, EXPO_MAX),
    )
    for axis in AXES:
        for raw, (name, low, high) in zip(rates.get(axis, []), bounds):
            if raw is None:
                continue
            display = raw / RATE_SCALE
            if not (low <= display <= high):
                problems.append(
                    "%s %s = %s (%.2f in Configurator units) is outside %.2f-%.2f"
                    % (axis, name, raw, display, low, high)
                )


# --------------------------------------------------------------------------
# the parse
# --------------------------------------------------------------------------


def parse_tune_diff(
    text: str,
    *,
    frame: int,
    brand: str,
    motor: str = "",
    prop: str = "",
    pilot: str | None = None,
    tune_id: str | None = None,
) -> dict:
    """Raw `diff all` -> one TUNES entry. Raises TuneRefused on any problem."""
    settings = parse_settings(text)
    header = parse_header(text)

    problems = check_is_diff(text, settings)
    if problems:
        # No point reading PIDs out of something that is not a diff -- the
        # numbers would be defaults dressed up as choices.
        raise TuneRefused(problems)

    if frame not in VALID_FRAMES:
        problems.append("frame %r is not one of %s" % (frame, ", ".join(map(str, VALID_FRAMES))))
    if not (brand or "").strip():
        problems.append("brand is required -- it comes from the form, never from the diff")

    pids = extract_pids(settings, problems)
    rates = extract_rates(settings, problems)
    check_ranges(pids, rates, problems)

    rate_type = (settings.get("rates_type") or "BETAFLIGHT").strip().upper()
    if rate_type not in RATE_TYPES:
        problems.append("rates_type %r is not one of %s" % (rate_type, ", ".join(RATE_TYPES)))

    # board_name is what the pilot flashed; manufacturer_id is the 4-character
    # target code, which is all a generic build reports.
    fc = (settings.get("board_name") or settings.get("manufacturer_id")
          or header.get("manufacturer_id") or "").strip()
    if not fc:
        problems.append(
            "no board identity in the diff -- expected `set board_name` or "
            "`set manufacturer_id`, or a `# Betaflight / TARGET (ID)` header"
        )

    notes = build_notes(settings, header, problems)

    if problems:
        raise TuneRefused(problems)

    source = clean_handle(pilot)
    combo = " · ".join(bit for bit in ((motor or "").strip(), (prop or "").strip()) if bit)

    return {
        "id": tune_id or make_id(frame, brand, source),
        "frame": frame,
        "brand": brand.strip(),
        "source": source,
        # Read by the card renderer to pick the badge and print the "submitted,
        # not bench-verified" line. Absent on the eight first-party entries.
        "sourceType": "community",
        "fc": fc,
        "combo": combo,
        "rateType": rate_type,
        "pids": pids,
        "rates": rates,
        "notes": notes,
    }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--diff", help="file with the raw `diff all` (default: stdin)")
    ap.add_argument("--frame", type=int, required=True, choices=list(VALID_FRAMES))
    ap.add_argument("--brand", required=True, help="from the form, never inferred")
    ap.add_argument("--motor", default="", help="from the form, never inferred")
    ap.add_argument("--prop", default="", help="from the form, never inferred")
    ap.add_argument("--pilot", default="", help="credit handle; blank -> Community")
    ap.add_argument("--id", dest="tune_id", help="override the generated entry id")
    args = ap.parse_args(argv)

    if args.diff:
        with open(args.diff, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    else:
        text = sys.stdin.read()

    try:
        entry = parse_tune_diff(
            text,
            frame=args.frame,
            brand=args.brand,
            motor=args.motor,
            prop=args.prop,
            pilot=args.pilot,
            tune_id=args.tune_id,
        )
    except TuneRefused as exc:
        sys.stderr.write("refused -- nothing emitted:\n")
        for reason in exc.reasons:
            sys.stderr.write("  * %s\n" % reason)
        return 2

    json.dump(entry, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
