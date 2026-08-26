#!/usr/bin/env python3
"""Tests for collect_signals.py. Standard library only; run with

    python -m unittest discover -s scripts/agent -p 'test_*.py'

Fixtures are scratch git repositories built in a temp directory. Nothing here
touches the checkout, except test_real_script_js_matches_pin, which reads
script.js to assert its shape has not drifted.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
COLLECTOR = os.path.join(HERE, "collect_signals.py")


def _load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cs = _load_module("collect_signals", COLLECTOR)
refresh_pins = _load_module("refresh_pins", os.path.join(HERE, "refresh_pins.py"))


# The shape of script.js that the scraper is pinned to lives in
# script_js.pin.json, not in this file. If a reformat, a switch to
# `new Map([...])`, or a motor/prop edit changes these counts, this test fails
# -- which is the point. Refresh it deliberately, in the same commit as the
# script.js change, with `python scripts/agent/refresh_pins.py`; that script
# recomputes the shape through the same helpers used below and refuses to write
# anything if script.js stops parsing.
SCRIPT_JS_PIN = refresh_pins.read_pin()

MINI_SCRIPT_JS = """(function(){
  // ===== Frame size presets =====
  const framePresets = {
    65: { kv: 19000, cells: 1, capacity: 300, pitch: 0.7, weight: 28  },
    75: { kv: 22000, cells: 1, capacity: 450, pitch: 1.1, weight: 38  },
    85: { kv: 11000, cells: 2, capacity: 450, pitch: 0.9, weight: 65  },
  };
  const motorDB = {
    65: [
      { name: 'BetaFPV 0702 II',   kv: 19000, propPitch: 0.7, weightPerMotor: 1.50 },
      { name: 'VCI Spark 0702',    kv: 30000, propPitch: 0.7, weightPerMotor: 1.52 },
    ],
    75: [ { name: 'Happymodel RS0802', kv: 22000, propPitch: 1.1, weightPerMotor: 1.80 } ],
    85: [ { name: 'BetaFPV 1103',      kv: 11000, propPitch: 0.9, weightPerMotor: 3.20 } ],
  };
  const propDB = {
    65: [ { name: 'Gemfan 1207 3-blade', pitch: 0.7, weight: 0.15, shaft: '1.0mm' } ],
    75: [ { name: 'Gemfan 1611 3-blade', pitch: 1.1, weight: 0.085, shaft: '1.5mm' } ],
    85: [ { name: 'Gemfan 2020 T-mount', pitch: 0.9, weight: 0.4,  shaft: 'T-mount' } ],
  };
})();
"""

GEAR_HTML = """<!doctype html><html><head><meta name="description" content="gear">
<title>Gear</title></head><body>
  <div class="build-card">
    <div class="build-card-label">Analog Daily Driver</div>
    <div class="build-spec-row"><span class="spec-key">Frame</span><span class="spec-val">BetaFPV Air65</span><a href="https://webleedfpv.com/x" class="buy-btn">Buy</a></div>
    <div class="build-spec-row"><span class="spec-key">FC</span><span class="spec-val">BetaFPV 4-in-1 AIO</span><a href="https://bit.ly/a" class="buy-btn">Buy</a></div>
    <div class="build-spec-row"><span class="spec-key">Motors</span><span class="spec-val">VCI 0702 PRO DB 30000KV &times;4</span><a href="https://webleedfpv.com/y" class="buy-btn">Buy</a></div>
  </div>
</body></html>
"""

TUNE_75 = json.dumps(
    {
        "id": "beta75",
        "name": "Beta75 stock",
        "frame_size_mm": 75,
        "fc": "BETAFPV F4 1S 12A AIO",
        "motor_kv": 22000,
        "prop": "Gemfan 1611",
        "rate_type": "ACTUAL",
        "pids": {
            "roll": {"p": 62, "i": 90, "d": 48},
            "pitch": {"p": 66, "i": 95, "d": 50},
            "yaw": {"p": 70, "i": 90, "d": 0},
        },
        "source": "betaflight 4.5 cli dump, verified",
    },
    indent=2,
)

LINKED_PAGE = """<!doctype html><html lang="en"><head>
<meta name="description" content="A linked tune page.">
<meta property="og:title" content="t"><meta property="og:description" content="d">
<meta property="og:image" content="i"><title>Linked</title>
</head><body><h1>Linked</h1></body></html>
"""

ORPHAN_PAGE = """<!doctype html><html lang="en"><head><title>Orphan</title></head>
<body><h1>Orphan guide</h1></body></html>
"""

INDEX_PAGE = """<!doctype html><html lang="en"><head>
<meta name="description" content="home"><title>Home</title></head>
<body><a href="/content/tunes/linked.html">linked</a></body></html>
"""


def git(root: str, *args: str) -> None:
    subprocess.run(
        ("git", "-C", root) + args,
        check=True,
        capture_output=True,
        text=True,
    )


def write(root: str, path: str, content: str) -> None:
    full = os.path.join(root, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as handle:
        handle.write(content)


def make_repo(root: str, kind: str = "full") -> None:
    """kind: full | empty | nodata"""
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.email", "t@example.com")
    git(root, "config", "user.name", "Tester")

    if kind == "empty":
        write(root, "README.md", "placeholder\n")
    else:
        write(root, "script.js", MINI_SCRIPT_JS)
        write(root, "index.html", INDEX_PAGE)
        write(root, "gear.html", GEAR_HTML)
        if kind == "full":
            write(root, "data/tunes/beta75.json", TUNE_75)
            write(root, "data/tunes/broken.json", "{ this is not json\n")
            write(
                root,
                "data/gear/good.json",
                json.dumps(
                    {
                        "id": "g1",
                        "name": "Complete Widget",
                        "price": 29.99,
                        "affiliate_link": "https://bit.ly/x",
                        "specs": {"weight": "1g"},
                    }
                ),
            )
            write(root, "data/gear/bare.json", json.dumps({"id": "g2", "name": "Bare Widget"}))
            write(root, "content/tunes/linked.html", LINKED_PAGE)
            write(root, "content/guides/orphan.html", ORPHAN_PAGE)

    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "fixture")
    # The collector reads origin/main by default; give the fixture one.
    git(root, "update-ref", "refs/remotes/origin/main", "HEAD")


def run_collector(root: str, *extra: str) -> tuple[int, dict | None, str]:
    with tempfile.TemporaryDirectory() as out_dir:
        out_path = os.path.join(out_dir, "signals.json")
        proc = subprocess.run(
            [sys.executable, COLLECTOR, "--root", root, "--out", out_path, *extra],
            capture_output=True,
            text=True,
        )
        payload = None
        if os.path.exists(out_path):
            with open(out_path) as handle:
                payload = json.load(handle)
        return proc.returncode, payload, proc.stderr


class RepoFixture(unittest.TestCase):
    kind = "full"

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name
        make_repo(self.root, self.kind)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def types(self, payload: dict) -> dict:
        counts: dict[str, int] = {}
        for row in payload["rows"]:
            counts[row["type"]] = counts.get(row["type"], 0) + 1
        return counts

    def details(self, payload: dict, kind: str) -> list[str]:
        return [r["detail"] for r in payload["rows"] if r["type"] == kind]


class TestSignalTypes(RepoFixture):
    def test_every_signal_type_is_collected(self):
        code, payload, _ = run_collector(self.root)
        self.assertEqual(code, 0, "gaps are data, not failures")
        counts = self.types(payload)
        for kind in ("tune_gap", "build_orphan", "metadata_gap", "gear_gap", "data_error"):
            self.assertIn(kind, counts, "no %s rows collected" % kind)

    def test_gear_build_card_drives_a_high_tune_gap(self):
        _, payload, _ = run_collector(self.root)
        high = [
            r
            for r in payload["rows"]
            if r["type"] == "tune_gap" and r["severity"] == "high" and "gear build" in r["detail"]
        ]
        self.assertTrue(high, "gear build card should produce a high-severity tune gap")
        self.assertIn("65mm/30000KV", high[0]["target"])

    def test_covered_combo_is_not_reported(self):
        _, payload, _ = run_collector(self.root)
        targets = [r["target"] for r in payload["rows"] if r["type"] == "tune_gap"]
        self.assertNotIn("75mm/22000KV", targets, "a covered combo must not be a gap")

    def test_metadata_gaps_for_orphan_page(self):
        _, payload, _ = run_collector(self.root)
        rows = [r for r in payload["rows"] if r["target"] == "content/guides/orphan.html"]
        joined = " | ".join(r["detail"] for r in rows)
        self.assertIn("missing <meta name=", joined)
        self.assertIn("no inbound internal links", joined)
        self.assertIn("missing JSON-LD", joined)
        self.assertIn("missing OG tags", joined)

    def test_linked_page_is_not_flagged_as_orphan(self):
        _, payload, _ = run_collector(self.root)
        rows = [r for r in payload["rows"] if r["target"] == "content/tunes/linked.html"]
        joined = " | ".join(r["detail"] for r in rows)
        self.assertNotIn("no inbound internal links", joined)
        self.assertNotIn("missing <meta name=", joined)

    def test_gear_gap_severity_split(self):
        _, payload, _ = run_collector(self.root)
        bare = {r["detail"]: r["severity"] for r in payload["rows"] if r["target"] == "Bare Widget"}
        self.assertEqual(bare.get("missing affiliate link"), "high")
        self.assertEqual(bare.get("missing price"), "medium")
        self.assertEqual(bare.get("missing specs"), "low")
        complete = [r for r in payload["rows"] if r["target"] == "Complete Widget"]
        self.assertEqual(complete, [], "a complete gear entry should yield no gaps")

    def test_malformed_data_file_becomes_a_data_error(self):
        _, payload, _ = run_collector(self.root)
        errors = [r for r in payload["rows"] if r["type"] == "data_error"]
        self.assertTrue(any("broken.json" in r["target"] for r in errors))
        self.assertTrue(all(r["severity"] == "high" for r in errors))


class TestOrderingAndDeterminism(RepoFixture):
    def test_rows_sorted_by_severity_then_type(self):
        _, payload, _ = run_collector(self.root)
        keys = [
            (cs.SEVERITY_ORDER[r["severity"]], r["type"], r["target"], r["detail"])
            for r in payload["rows"]
        ]
        self.assertEqual(keys, sorted(keys))

    def test_output_is_byte_identical_across_runs(self):
        first = run_collector(self.root)[1]
        second = run_collector(self.root)[1]
        self.assertEqual(
            json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True)
        )

    def test_output_carries_no_timestamp(self):
        _, payload, _ = run_collector(self.root)
        blob = json.dumps(payload).lower()
        for banned in ('"generated_at"', '"timestamp"', '"date"'):
            self.assertNotIn(banned, blob, "a timestamp would break determinism")


class TestEmptyRepo(RepoFixture):
    kind = "empty"

    def test_no_calculator_is_a_hard_failure_not_a_clean_bill(self):
        code, _, stderr = run_collector(self.root)
        self.assertEqual(code, cs.EXIT_PARSER_DRIFT)
        self.assertIn("no calculator source found", stderr)
        self.assertIn("refusing to report zero gaps", stderr)


class TestMissingDirectories(RepoFixture):
    kind = "nodata"

    def test_missing_dirs_are_graceful(self):
        code, payload, stderr = run_collector(self.root)
        self.assertEqual(code, 0)
        self.assertIn("data/tunes/ absent", stderr)
        self.assertIn("content/ absent", stderr)
        counts = self.types(payload)
        self.assertNotIn("metadata_gap", counts)
        self.assertNotIn("gear_gap", counts)
        self.assertGreater(counts.get("tune_gap", 0), 0)


class TestParserDrift(RepoFixture):
    def _rewrite_script(self, transform) -> None:
        path = os.path.join(self.root, "script.js")
        with open(path) as handle:
            source = handle.read()
        with open(path, "w") as handle:
            handle.write(transform(source))
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", "drift")
        git(self.root, "update-ref", "refs/remotes/origin/main", "HEAD")

    def test_motordb_as_a_map_fails_loud(self):
        self._rewrite_script(
            lambda s: s.replace("const motorDB = {", "const motorDB = new Map([").replace(
                "  };\n  const propDB", "  ]);\n  const propDB"
            )
        )
        code, _, stderr = run_collector(self.root)
        self.assertEqual(code, cs.EXIT_PARSER_DRIFT)
        self.assertIn("parser found no entries for motorDB", stderr)
        self.assertIn("format likely changed", stderr)

    def test_missing_frame_key_fails_loud(self):
        self._rewrite_script(
            lambda s: s.replace(
                "    85: [ { name: 'BetaFPV 1103',      kv: 11000, "
                "propPitch: 0.9, weightPerMotor: 3.20 } ],\n",
                "",
            )
        )
        code, _, stderr = run_collector(self.root)
        self.assertEqual(code, cs.EXIT_PARSER_DRIFT)
        self.assertIn("motorDB frame 85", stderr)

    def test_empty_per_frame_list_fails_loud(self):
        self._rewrite_script(
            lambda s: s.replace(
                "    85: [ { name: 'BetaFPV 1103',      kv: 11000, "
                "propPitch: 0.9, weightPerMotor: 3.20 } ],",
                "    85: [],",
            )
        )
        code, _, stderr = run_collector(self.root)
        self.assertEqual(code, cs.EXIT_PARSER_DRIFT)
        self.assertIn("motorDB[85]", stderr)

    def test_parsed_counts_are_logged_every_run(self):
        _, _, stderr = run_collector(self.root)
        self.assertIn("calculator parse:", stderr)
        for name in cs.REQUIRED_JS_LITERALS:
            self.assertIn(name, stderr)


class TestReadOnlyAndLoopDamping(RepoFixture):
    def _dirty(self) -> str:
        proc = subprocess.run(
            ("git", "-C", self.root, "status", "--porcelain"),
            capture_output=True,
            text=True,
        )
        return proc.stdout

    def test_collector_leaves_the_tree_untouched(self):
        before = self._dirty()
        run_collector(self.root)
        self.assertEqual(before, self._dirty())

    def test_out_inside_the_repo_is_refused(self):
        target = os.path.join(self.root, "signals.json")
        proc = subprocess.run(
            [sys.executable, COLLECTOR, "--root", self.root, "--out", target],
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, cs.EXIT_ERROR)
        self.assertIn("never writes into the repo tree", proc.stderr)
        self.assertFalse(os.path.exists(target))

    def test_working_tree_edit_cannot_manufacture_a_signal(self):
        # The loop this guards: an agent adds a gear build, the collector
        # reports the gap it just created, the agent assigns itself the work.
        path = os.path.join(self.root, "gear.html")
        with open(path) as handle:
            source = handle.read()
        invented = (
            '  <div class="build-card">\n'
            '    <div class="build-card-label">Invented</div>\n'
            '    <div class="build-spec-row"><span class="spec-key">Frame</span>'
            '<span class="spec-val">Fake85</span><a href="https://bit.ly/z">Buy</a></div>\n'
            '    <div class="build-spec-row"><span class="spec-key">Motors</span>'
            '<span class="spec-val">Fake 99000KV</span><a href="https://bit.ly/z">Buy</a></div>\n'
            "  </div>\n"
        )
        with open(path, "w") as handle:
            handle.write(source.replace("</body>", invented + "</body>"))

        _, payload, _ = run_collector(self.root)
        self.assertFalse(
            any("99000" in r["target"] for r in payload["rows"]),
            "base-ref read must ignore an uncommitted build card",
        )

        code, payload, stderr = run_collector(self.root, "--worktree")
        self.assertEqual(code, 0)
        self.assertTrue(
            any("99000" in r["target"] for r in payload["rows"]),
            "--worktree is the escape hatch and should see the edit",
        )
        self.assertIn("warning: --worktree", stderr)


class TestOpenIssues(RepoFixture):
    def test_absent_issues_file_is_skipped(self):
        code, payload, stderr = run_collector(self.root, "--issues", "/nonexistent/issues.json")
        self.assertEqual(code, 0)
        self.assertIn("not found -- skipped", stderr)
        self.assertNotIn("open_issue", self.types(payload))

    def test_issue_severity_follows_labels(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "issues.json")
            with open(path, "w") as handle:
                json.dump(
                    [
                        {"number": 7, "title": "Missing 85mm tunes", "state": "open",
                         "labels": [{"name": "bug"}]},
                        {"number": 8, "title": "Tidy footer", "state": "open",
                         "labels": [{"name": "chore"}]},
                        {"number": 9, "title": "Unlabelled", "state": "open", "labels": []},
                        {"number": 10, "title": "Done", "state": "closed",
                         "labels": [{"name": "bug"}]},
                    ],
                    handle,
                )
            _, payload, _ = run_collector(self.root, "--issues", path)
        rows = {
            r["target"]: r["severity"] for r in payload["rows"] if r["type"] == "open_issue"
        }
        self.assertEqual(len(rows), 3, "closed issues must be excluded")
        self.assertEqual(rows["issue#7"], "high")
        self.assertEqual(rows["issue#8"], "low")
        self.assertEqual(rows["issue#9"], "medium")


class TestJsLiteralParser(unittest.TestCase):
    def test_trailing_commas_and_comments(self):
        parsed = cs.extract_js_literal(
            cs.strip_js_comments("const x = { 1: [ {a: 'b',}, ], /* c */ 2: {}, };"), "x"
        )
        self.assertEqual(parsed, {1: [{"a": "b"}], 2: {}})

    def test_braces_inside_strings_do_not_break_balancing(self):
        parsed = cs.extract_js_literal("const x = { a: '} not the end {' };", "x")
        self.assertEqual(parsed, {"a": "} not the end {"})

    def test_absent_literal_returns_none(self):
        self.assertIsNone(cs.extract_js_literal("const y = {};", "x"))

    def test_frame_size_inference(self):
        self.assertEqual(cs.infer_frame_size("BetaFPV Air65"), 65)
        self.assertEqual(cs.infer_frame_size("", "Mobula 75 HD"), 75)
        self.assertIsNone(cs.infer_frame_size("Some 5-inch quad"))

    def test_kv_inference(self):
        self.assertEqual(cs.infer_kv("VCI 0702 PRO DB 30000KV x4"), 30000)
        self.assertEqual(cs.infer_kv("Happymodel 0702 28000 kv"), 28000)
        self.assertIsNone(cs.infer_kv("no numbers here"))


class TestRealScriptJsPin(unittest.TestCase):
    """Pins the shape of the checked-in script.js.

    If this fails, script.js was reformatted or its component lists changed.
    That is deliberate friction: the collector must not start silently seeing
    fewer components than the site actually offers.
    """

    def test_real_script_js_matches_pin(self):
        path = os.path.join(REPO_ROOT, "script.js")
        if not os.path.exists(path):
            self.skipTest("script.js not present in this checkout")
        with open(path, encoding="utf-8", errors="replace") as handle:
            source = handle.read()
        actual = refresh_pins.script_js_shape(source)
        self.assertEqual(
            actual,
            SCRIPT_JS_PIN,
            "script.js shape drifted from scripts/agent/script_js.pin.json. "
            "Confirm the collector still parses it, then refresh the pin in the "
            "same commit with `python scripts/agent/refresh_pins.py`.",
        )


class TestRefreshPins(unittest.TestCase):
    """The refresher is the only sanctioned way to move the pin, so it has to
    be at least as strict as the test it feeds."""

    def _run(self, root: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, os.path.join(HERE, "refresh_pins.py"), "--root", root, "--check"],
            capture_output=True,
            text=True,
        )

    def test_broken_script_js_is_refused_rather_than_pinned(self):
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "script.js"), "w") as handle:
                handle.write(MINI_SCRIPT_JS.replace("const motorDB = {", "const motorDB = new Map(["))
            proc = self._run(root)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("refusing to refresh the pin", proc.stderr)
        self.assertIn("motorDB", proc.stderr)

    def test_missing_script_js_is_refused(self):
        with tempfile.TemporaryDirectory() as root:
            proc = self._run(root)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("refusing to refresh", proc.stderr)

    def test_empty_per_frame_list_is_refused(self):
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "script.js"), "w") as handle:
                handle.write(
                    MINI_SCRIPT_JS.replace(
                        "    85: [ { name: 'BetaFPV 1103',      kv: 11000, "
                        "propPitch: 0.9, weightPerMotor: 3.20 } ],",
                        "    85: [],",
                    )
                )
            proc = self._run(root)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("motorDB[85]", proc.stderr)

    def test_checked_in_pin_is_current(self):
        # --check writes nothing; it just says whether the committed JSON still
        # describes the committed script.js.
        proc = self._run(REPO_ROOT)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
