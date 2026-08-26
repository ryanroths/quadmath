#!/usr/bin/env python3
"""Recompute scripts/agent/script_js.pin.json from the checked-in script.js.

    python scripts/agent/refresh_pins.py

The pin is deliberate friction: test_real_script_js_matches_pin in
test_collect_signals.py fails whenever script.js grows, loses, or reshapes a
component list, so nobody can change the calculator's data without the
collector being looked at. That friction is only useful if refreshing the pin
is a single reviewable command -- hand-editing a dict inside a test file
invites "make the test pass" edits that never check the collector at all.

So: this script parses script.js with the same collect_signals helpers the
test uses, and refuses to write anything if that parse comes back short. A
refresh must never pin garbage -- pinning a broken parse would convert a loud
failure into a silent, permanently wrong baseline.

Exit codes: 0 written (or already current), 1 refused.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
PIN_PATH = os.path.join(HERE, "script_js.pin.json")
REFRESH_COMMAND = "python scripts/agent/refresh_pins.py"


def _load_collector():
    spec = importlib.util.spec_from_file_location(
        "collect_signals", os.path.join(HERE, "collect_signals.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cs = _load_collector()


class PinRefused(Exception):
    """script.js did not parse cleanly enough to pin."""


def script_js_shape(source: str) -> dict:
    """The pinned shape of script.js: per-frame counts for each literal.

    Shared with the test on purpose, so the refresher cannot write a shape the
    test would compute differently. Raises PinRefused rather than returning a
    thin result, because a thin result is exactly what the pin exists to catch.
    """
    clean = cs.strip_js_comments(source)
    shape: dict = {}
    problems: list[str] = []
    for name in cs.REQUIRED_JS_LITERALS:
        parsed = cs.normalise_frame_keys(cs.extract_js_literal(clean, name))
        if not parsed:
            problems.append("%s: parser found no entries -- format likely changed" % name)
            continue
        missing = [f for f in cs.FRAME_SIZES if f not in parsed]
        if missing:
            problems.append(
                "%s: no entries for frame %s"
                % (name, "/".join(str(m) for m in missing))
            )
        counts = {}
        for frame, value in sorted(parsed.items()):
            if name == "framePresets":
                counts[frame] = 1
                continue
            if not value:
                problems.append("%s[%s]: empty list" % (name, frame))
                continue
            counts[frame] = len(value)
        shape[name] = counts
    if problems:
        raise PinRefused("; ".join(problems))
    return shape


def read_pin(path: str = PIN_PATH) -> dict:
    """The pin as the test wants it: int frame keys, int counts."""
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    return {
        name: {int(frame): int(count) for frame, count in sorted(frames.items())}
        for name, frames in raw.items()
    }


def _serialise(shape: dict) -> str:
    payload = {
        name: {str(frame): count for frame, count in sorted(frames.items())}
        for name, frames in shape.items()
    }
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def _report(old: dict, new: dict) -> bool:
    """Print old -> new per key. Returns True if anything moved."""
    moved = False
    names = sorted(set(old) | set(new))
    for name in names:
        frames = sorted(set(old.get(name, {})) | set(new.get(name, {})))
        for frame in frames:
            was = old.get(name, {}).get(frame)
            now = new.get(name, {}).get(frame)
            key = "%s[%s]" % (name, frame)
            if was == now:
                print("  %-18s %s (unchanged)" % (key, now))
            else:
                moved = True
                print("  %-18s %s -> %s" % (key, "absent" if was is None else was,
                                            "absent" if now is None else now))
    return moved


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=REPO_ROOT, help="repository root")
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift and exit non-zero without writing the pin",
    )
    args = parser.parse_args(argv)

    js_path = os.path.join(args.root, "script.js")
    if not os.path.exists(js_path):
        print("refusing to refresh: %s not found" % js_path, file=sys.stderr)
        return 1

    with open(js_path, encoding="utf-8", errors="replace") as handle:
        source = handle.read()

    try:
        new = script_js_shape(source)
    except PinRefused as exc:
        print(
            "refusing to refresh the pin: script.js did not parse (%s).\n"
            "A pin written from a broken parse would hide the drift it exists "
            "to catch. Fix the parse, or teach collect_signals.py the new "
            "format, then re-run." % exc,
            file=sys.stderr,
        )
        return 1

    old = read_pin() if os.path.exists(PIN_PATH) else {}
    print("script.js -> %s" % os.path.relpath(PIN_PATH, args.root))
    moved = _report(old, new)

    if args.check:
        if moved:
            print("pin is stale; run %s" % REFRESH_COMMAND, file=sys.stderr)
            return 1
        return 0

    if not moved and old:
        print("pin already current -- nothing written")
        return 0

    with open(PIN_PATH, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(_serialise(new))
    print("wrote %s" % os.path.relpath(PIN_PATH, args.root))
    return 0


if __name__ == "__main__":
    sys.exit(main())
