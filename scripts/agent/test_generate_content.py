#!/usr/bin/env python3
"""Tests for the bench-data guard in generate_content.py.

    python -m unittest discover -s scripts/agent -p 'test_*.py'

No git fixtures needed: bench data flows through the base_read callable, so a
dict-backed fake stands in for `git show origin/main:<path>`. No network: the
one generation test monkeypatches call_api. Standard library only.
"""

from __future__ import annotations

import importlib.util
import json
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

_spec = importlib.util.spec_from_file_location(
    "generate_content", os.path.join(HERE, "generate_content.py")
)
gc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gc)

TARGET = "65mm/Happymodel SE0702/Gemfan 1207 3-blade"
BENCH_PATH = "data/bench/65mm-happymodel-se0702-gemfan-1207-3-blade.json"

VALID_BENCH = {
    "build_id": "65-se0702-28k-1207",
    "frame_size_mm": 65,
    "motor": "Happymodel SE0702 28000KV",
    "motor_kv": 28000,
    "prop": "Gemfan 1207 3-blade",
    "battery": "1S 300mAh HV",
    "auw_g": 27.8,
    "hover_time_s": 295,
    "freestyle_time_s": 205,
    "top_speed_mph": 38.5,
    "max_current_a": 14.2,
    "source": "measured 2026-07-29: scale, stopwatch, GPS logger",
}


def load_real_policy() -> dict:
    # The branch's own policy file, so tests and schema cannot drift apart.
    with open(
        os.path.join(REPO_ROOT, "scripts", "ci", "agent_policy.json"), encoding="utf-8"
    ) as fh:
        return json.load(fh)


def fake_base_read(files: dict):
    return lambda path: files.get(path)


def orphan_row(severity: str = "high") -> dict:
    return {
        "type": "build_orphan",
        "target": TARGET,
        "detail": "calculator can build it but no guide covers it",
        "severity": severity,
    }


class BenchGuard(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = load_real_policy()

    # -- the four required cases -------------------------------------------

    def test_valid_bench_present_allows_generation(self):
        read = fake_base_read({BENCH_PATH: json.dumps(VALID_BENCH)})
        gap, notes, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNotNone(gap, "valid bench data should unlock the build_orphan")
        self.assertEqual(gap["type"], "build_orphan")
        self.assertEqual(worklist, [])

        # And generation actually consumes the bench data (API stubbed out).
        captured = {}

        def stub_api(api_key, system, user):
            captured["system"] = system
            captured["user"] = user
            return "<html><head><title>x</title></head><body>ok</body></html>"

        original = gc.call_api
        gc.call_api = stub_api
        try:
            files = gc.generate_for_gap(gap, read, "fake-key", self.policy)
        finally:
            gc.call_api = original
        self.assertEqual(
            list(files),
            ["content/guides/65mm-happymodel-se0702-gemfan-1207-3-blade.html"],
        )
        self.assertIn(BENCH_PATH, captured["user"], "prompt should cite the bench file")
        for datum in ("295", "27.8", "38.5"):
            self.assertIn(datum, captured["user"], "measured %s should reach the prompt" % datum)
        self.assertIn("ONLY performance numbers", captured["user"])

    def test_absent_bench_refuses_and_emits_worklist(self):
        read = fake_base_read({})
        gap, notes, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap, "no bench data, nothing to generate")
        self.assertEqual(len(worklist), 1)
        item = worklist[0]
        self.assertEqual(item["target"], TARGET)
        self.assertEqual(item["bench_path"], BENCH_PATH)
        self.assertIn("no bench data", item["reason"])
        self.assertIn("measure this build", item["reason"])
        self.assertTrue(
            any("NEEDS BENCH DATA" in n for n in notes),
            "refusal must be loud in the notes, not a silent skip",
        )

    def test_missing_required_field_refuses(self):
        bench = dict(VALID_BENCH)
        del bench["battery"]
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap)
        self.assertIn("battery", worklist[0]["reason"])

    def test_one_flight_time_is_enough(self):
        # A bench session usually lands one flight type first. Requiring all
        # three is what pushes people to invent the missing ones.
        bench = dict(VALID_BENCH)
        del bench["freestyle_time_s"]
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNotNone(gap, "hover_time_s alone should satisfy the gate")
        self.assertEqual(worklist, [])

    def test_cruise_time_alone_is_enough(self):
        bench = dict(VALID_BENCH)
        del bench["freestyle_time_s"]
        del bench["hover_time_s"]
        bench["cruise_time_s"] = 233
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNotNone(gap, "a measured cruise run is real data")

    def test_no_flight_time_at_all_refuses(self):
        bench = dict(VALID_BENCH)
        del bench["freestyle_time_s"]
        del bench["hover_time_s"]
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap)
        self.assertIn("measured flight time", worklist[0]["reason"])

    def test_placeholder_value_refuses(self):
        bench = dict(VALID_BENCH)
        bench["battery"] = "TBD"
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap)
        self.assertIn("placeholder", worklist[0]["reason"])

    # -- additional failure shapes -----------------------------------------

    def test_out_of_range_value_refuses(self):
        bench = dict(VALID_BENCH)
        bench["hover_time_s"] = 5  # below the 30s floor: not a real hover test
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap)
        self.assertIn("hover_time_s", worklist[0]["reason"])
        self.assertIn("range", worklist[0]["reason"])

    def test_source_without_measurement_method_refuses(self):
        bench = dict(VALID_BENCH)
        bench["source"] = "seemed about right"
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap)
        self.assertIn("measurement method", worklist[0]["reason"])

    def test_bench_for_wrong_build_refuses(self):
        # A valid file for a DIFFERENT build must not unlock this one.
        bench = dict(VALID_BENCH)
        bench["frame_size_mm"] = 75
        read = fake_base_read({BENCH_PATH: json.dumps(bench)})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap)
        self.assertIn("does not match target frame", worklist[0]["reason"])

    def test_malformed_bench_json_refuses(self):
        read = fake_base_read({BENCH_PATH: "{ not json"})
        gap, _, worklist = gc.pick_gap([orphan_row()], self.policy, read)
        self.assertIsNone(gap)
        self.assertIn("not valid JSON", worklist[0]["reason"])

    def test_policy_without_bench_schema_fails_closed(self):
        policy = {k: v for k, v in self.policy.items() if k != "bench_schema"}
        read = fake_base_read({BENCH_PATH: json.dumps(VALID_BENCH)})
        gap, _, worklist = gc.pick_gap([orphan_row()], policy, read)
        self.assertIsNone(gap, "no schema means nothing can prove the data is real")
        self.assertIn("no bench_schema", worklist[0]["reason"])

    def test_generate_for_gap_refuses_directly_without_bench(self):
        # Defence in depth: calling the generator directly must also refuse.
        with self.assertRaises(RuntimeError) as ctx:
            gc.generate_for_gap(orphan_row(), fake_base_read({}), "fake-key", self.policy)
        self.assertIn("refused", str(ctx.exception))

    # -- unchanged behaviour -----------------------------------------------

    def test_tune_and_gear_gaps_still_hard_refused(self):
        rows = [
            {"type": "tune_gap", "target": "65mm/28000KV", "detail": "d", "severity": "high"},
            {"type": "gear_gap", "target": "Widget", "detail": "d", "severity": "high"},
        ]
        read = fake_base_read({BENCH_PATH: json.dumps(VALID_BENCH)})
        gap, notes, worklist = gc.pick_gap(rows, self.policy, read)
        self.assertIsNone(gap)
        self.assertEqual(worklist, [], "hard refusals are not bench worklist items")
        self.assertTrue(any("tune_gap" in n for n in notes))
        self.assertTrue(any("gear_gap" in n for n in notes))

    def test_metadata_gap_unaffected_by_bench_guard(self):
        rows = [
            {
                "type": "metadata_gap",
                "target": "content/guides/some-page.html",
                "detail": "missing OG tags",
                "severity": "low",
            }
        ]
        gap, _, worklist = gc.pick_gap(rows, self.policy, fake_base_read({}))
        self.assertIsNotNone(gap)
        self.assertEqual(gap["type"], "metadata_gap")
        self.assertEqual(worklist, [])

    def test_metadata_gap_orphan_is_skipped(self):
        # Deliberately the same row as the test above, changing only `detail`,
        # so the two read as a pair: an ordinary metadata gap is selected, an
        # orphan one is refused. The fix for an orphan is an inbound link on a
        # DIFFERENT page, and the generator only ever returns the gap's own
        # target -- agent PR #52 produced a breadcrumb no-op on the orphan
        # itself and left it just as unreachable.
        rows = [
            {
                "type": "metadata_gap",
                "target": "content/guides/some-page.html",
                "detail": "no inbound internal link from any indexed page",
                "severity": "low",
            }
        ]
        gap, notes, worklist = gc.pick_gap(rows, self.policy, fake_base_read({}))
        self.assertIsNone(gap, "orphan gaps must never be selected for generation")
        self.assertEqual(worklist, [], "orphan skips are not bench worklist items")
        self.assertTrue(any("orphan fix means editing a different page" in n for n in notes))

    def test_orphan_detail_wording_variants_all_skip(self):
        for detail in (
            "Page is an orphan -- nothing links to it",
            "missing inbound internal link",
            "ORPHAN: unreachable by crawl",
        ):
            rows = [
                {
                    "type": "metadata_gap",
                    "target": "content/guides/x.html",
                    "detail": detail,
                    "severity": "high",
                }
            ]
            gap, _, _ = gc.pick_gap(rows, self.policy, fake_base_read({}))
            self.assertIsNone(gap, "should have skipped for detail: %s" % detail)

    def test_missing_detail_key_does_not_crash(self):
        # detail is optional in collector output; the orphan check must not
        # explode on rows that omit it.
        rows = [
            {
                "type": "metadata_gap",
                "target": "content/guides/some-page.html",
                "severity": "low",
            }
        ]
        gap, _, _ = gc.pick_gap(rows, self.policy, fake_base_read({}))
        self.assertIsNotNone(gap, "a metadata_gap without detail is still actionable")

    def test_schema_shape_matches_spec(self):
        schema = self.policy["bench_schema"]
        self.assertEqual(
            schema["required_fields"],
            ["build_id", "frame_size_mm", "motor", "motor_kv", "prop", "battery",
             "auw_g", "source"],
        )
        # Flight times moved out of required_fields and into require_any_of.
        self.assertEqual(
            schema["require_any_of"],
            ["hover_time_s", "cruise_time_s", "freestyle_time_s"],
        )
        self.assertEqual(
            schema["optional_fields"],
            ["top_speed_mph", "max_current_a", "notes",
             "hover_time_s", "cruise_time_s", "freestyle_time_s"],
        )
        self.assertIn("TBD", schema["placeholder_values"])


class CosmeticFixes(unittest.TestCase):
    def test_no_double_assignment(self):
        with open(os.path.join(HERE, "generate_content.py"), encoding="utf-8") as fh:
            src = fh.read()
        self.assertNotIn("SYSTEM_GUIDE = SYSTEM_GUIDE =", src)

    def test_file_opens_declare_utf8(self):
        with open(os.path.join(HERE, "generate_content.py"), encoding="utf-8") as fh:
            src = fh.read()
        import re as _re

        # One nesting level so open(os.path.expanduser(x), ...) matches whole.
        undeclared = [
            m.group(0)
            for m in _re.finditer(r"open\((?:[^()]|\([^()]*\))*\)", src)
            if "encoding=" not in m.group(0)
            and "os.path" in m.group(0)
        ]
        self.assertEqual(undeclared, [], "every file open must pin encoding='utf-8'")


if __name__ == "__main__":
    unittest.main(verbosity=2)
