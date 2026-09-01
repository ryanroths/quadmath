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


class _FakeResponse:
    """Stand-in for the urlopen context manager, so call_api can be driven
    with a canned API body without touching the network."""

    def __init__(self, payload: dict):
        self._body = json.dumps(payload).encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def call_api_with(payload: dict) -> str:
    original = gc.urllib.request.urlopen
    gc.urllib.request.urlopen = lambda req, timeout=None: _FakeResponse(payload)
    try:
        return gc.call_api("fake-key", "system", "user")
    finally:
        gc.urllib.request.urlopen = original


class RefusalGuard(unittest.TestCase):
    """A refusal is an HTTP 200 with stop_reason 'refusal' and no usable text.
    Left unchecked it reaches validate_html and is reported as a missing meta
    description, which names the wrong cause. See PR #55."""

    def test_refusal_stop_reason_raises(self):
        with self.assertRaises(gc.ModelRefusal) as ctx:
            call_api_with({"stop_reason": "refusal", "content": []})
        self.assertIn("model refused generation", str(ctx.exception))
        self.assertIn("stop_reason=refusal", str(ctx.exception))

    def test_empty_text_raises_even_on_normal_stop_reason(self):
        # Same failure wearing a different hat: nothing usable came back.
        with self.assertRaises(gc.ModelRefusal) as ctx:
            call_api_with({"stop_reason": "end_turn", "content": []})
        self.assertIn("stop_reason=end_turn", str(ctx.exception))

    def test_whitespace_only_text_raises(self):
        with self.assertRaises(gc.ModelRefusal):
            call_api_with(
                {"stop_reason": "end_turn", "content": [{"type": "text", "text": "   \n"}]}
            )

    def test_refusal_is_not_recovered_from(self):
        # No fallback model, no retry -- a refusal must surface to a human.
        with open(os.path.join(HERE, "generate_content.py"), encoding="utf-8") as fh:
            src = fh.read()
        self.assertNotIn("fallbacks", src, "refusals must not reroute to another model")

    def test_normal_response_still_returns_text(self):
        # The guard must not fire on a healthy generation.
        out = call_api_with(
            {
                "stop_reason": "end_turn",
                "content": [{"type": "text", "text": "<html>ok</html>\n"}],
            }
        )
        self.assertEqual(out, "<html>ok</html>")


GUIDE_PATH = "content/guides/65mm-happymodel-se0702-gemfan-1219-3-blade.html"

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="description" content="A page.">
  <title>Page</title>
%s
</head>
<body><h1>Page</h1></body>
</html>
"""

VALID_JSONLD = """  <script type="application/ld+json">
  {"@context": "https://schema.org", "@type": "Article", "headline": "Beta65 tune"}
  </script>"""

MALFORMED_JSONLD = """  <script type="application/ld+json">
  {"@context": "https://schema.org", "@type": "Article",,, headline: nope}
  </script>"""

PLAIN_INLINE = """  <script>window.track('pageview');</script>"""

JSONLD_GAP = {
    "type": "metadata_gap",
    "target": GUIDE_PATH,
    "detail": 'missing JSON-LD (<script type="application/ld+json">)',
    "severity": "medium",
}

OG_GAP = {
    "type": "metadata_gap",
    "target": "content/guides/other-page.html",
    "detail": "missing OG tags: og:image",
    "severity": "low",
}


def html_policy(**overrides) -> dict:
    policy = load_real_policy()
    checks = dict(policy.get("html_checks") or {})
    checks.update(overrides)
    policy = dict(policy)
    policy["html_checks"] = checks
    return policy


def clean_page(extra_head: str = "") -> str:
    return PAGE % extra_head


class JsonLdLocalGate(unittest.TestCase):
    """The local validator must match the CI gate on JSON-LD.

    The 2026-09-01 Sunday run aborted because validate_html treated
    <script type="application/ld+json"> as a forbidden inline script, even
    though html_checks.allow_jsonld is true in the shipped policy.
    """

    def test_valid_jsonld_passes_under_shipped_policy(self):
        problems = gc.validate_html(GUIDE_PATH, clean_page(VALID_JSONLD), load_real_policy())
        self.assertEqual(problems, [], "valid JSON-LD must not trip forbid_inline_script")

    def test_malformed_jsonld_fails_even_when_allowed(self):
        problems = gc.validate_html(GUIDE_PATH, clean_page(MALFORMED_JSONLD), load_real_policy())
        self.assertTrue(problems, "malformed JSON-LD must not slip through")
        self.assertTrue(any("not valid JSON" in p for p in problems))
        self.assertFalse(any("inline <script> forbidden" in p for p in problems))

    def test_plain_inline_script_still_fails(self):
        problems = gc.validate_html(GUIDE_PATH, clean_page(PLAIN_INLINE), load_real_policy())
        self.assertTrue(problems)
        self.assertTrue(any("inline <script> forbidden" in p for p in problems))

    def test_allow_jsonld_false_restores_the_blanket_ban(self):
        problems = gc.validate_html(
            GUIDE_PATH, clean_page(VALID_JSONLD), html_policy(allow_jsonld=False)
        )
        self.assertTrue(problems, "with the flag off, JSON-LD is just an inline script")
        self.assertTrue(any("inline <script> forbidden" in p for p in problems))

    def test_absent_key_defaults_to_allowed(self):
        policy = html_policy()
        policy["html_checks"].pop("allow_jsonld", None)
        self.assertEqual(gc.validate_html(GUIDE_PATH, clean_page(VALID_JSONLD), policy), [])

    def test_inline_text_javascript_still_fails(self):
        js = '  <script type="text/javascript">window.track(1);</script>'
        problems = gc.validate_html(GUIDE_PATH, clean_page(js), load_real_policy())
        self.assertTrue(any("inline <script> forbidden" in p for p in problems))

    def test_near_miss_type_is_still_forbidden(self):
        near = '  <script type="application/json">{"a": 1}</script>'
        problems = gc.validate_html(GUIDE_PATH, clean_page(near), load_real_policy())
        self.assertTrue(any("inline <script> forbidden" in p for p in problems))

    def test_type_match_tolerates_case_and_whitespace(self):
        odd = '  <script type=" Application/LD+JSON ">{"a": 1}</script>'
        self.assertEqual(gc.validate_html(GUIDE_PATH, clean_page(odd), load_real_policy()), [])

    def test_empty_jsonld_block_is_invalid_json(self):
        empty = '  <script type="application/ld+json"></script>'
        problems = gc.validate_html(GUIDE_PATH, clean_page(empty), load_real_policy())
        self.assertTrue(any("not valid JSON" in p for p in problems))

    def test_jsonld_and_plain_inline_together_reports_only_the_plain_one(self):
        problems = gc.validate_html(
            GUIDE_PATH, clean_page(VALID_JSONLD + "\n" + PLAIN_INLINE), load_real_policy()
        )
        self.assertEqual(len([p for p in problems if "inline <script>" in p]), 1)
        self.assertFalse(any("not valid JSON" in p for p in problems))

    def test_sunday_guide_plus_jsonld_is_gate_clean(self):
        # Focused reproduction of the 2026-09-01 abort: the selected guide
        # plus a valid JSON-LD block must pass the local validator.
        with open(os.path.join(REPO_ROOT, GUIDE_PATH), encoding="utf-8") as handle:
            original = handle.read()
        self.assertNotIn("application/ld+json", original)
        injected = original.replace(
            "</head>",
            '  <script type="application/ld+json">\n'
            "  {"
            '"@context": "https://schema.org", '
            '"@type": "Article", '
            '"headline": "65mm SE0702 28000KV + Gemfan 1219 3-blade", '
            '"url": "https://quadmath.com/%s"'
            "}\n"
            "  </script>\n</head>" % GUIDE_PATH,
        )
        problems = gc.validate_html(GUIDE_PATH, injected, load_real_policy())
        self.assertEqual(problems, [], "the Sunday candidate plus JSON-LD must be legal")


class JsonLdSelectionAndSkip(unittest.TestCase):
    def test_jsonld_gap_is_selected_under_shipped_policy(self):
        gap, notes, worklist = gc.pick_gap([JSONLD_GAP], load_real_policy(), fake_base_read({}))
        self.assertIsNotNone(gap, "JSON-LD is legal work under allow_jsonld")
        self.assertEqual(gap["target"], GUIDE_PATH)
        self.assertEqual(worklist, [])
        self.assertFalse(any("allow_jsonld is off" in n for n in notes))

    def test_jsonld_gap_is_skipped_when_allow_jsonld_is_off(self):
        gap, notes, _ = gc.pick_gap(
            [JSONLD_GAP], html_policy(allow_jsonld=False), fake_base_read({})
        )
        self.assertIsNone(gap, "do not pick work the gate would reject")
        self.assertTrue(any("allow_jsonld is off" in n for n in notes))

    def test_rank_gaps_keeps_jsonld_ahead_of_lower_severity(self):
        candidates, _, _ = gc.rank_gaps(
            [OG_GAP, JSONLD_GAP], load_real_policy(), fake_base_read({})
        )
        self.assertEqual([c["target"] for c in candidates], [GUIDE_PATH, OG_GAP["target"]])

    def test_try_candidates_skips_gate_failure_and_takes_next(self):
        dirty = {GUIDE_PATH: clean_page(PLAIN_INLINE)}
        clean = {OG_GAP["target"]: clean_page()}

        def produce(gap):
            return dirty if gap["target"] == GUIDE_PATH else clean

        gap, files, notes = gc.try_candidates(
            [JSONLD_GAP, OG_GAP], produce, load_real_policy(), fake_base_read({})
        )
        self.assertIsNotNone(gap)
        self.assertEqual(gap["target"], OG_GAP["target"])
        self.assertEqual(files, clean)
        self.assertTrue(any("FAIL the gate; trying next" in n for n in notes))
        self.assertFalse(any("aborting" in n for n in notes))

    def test_try_candidates_returns_none_when_every_candidate_fails(self):
        def produce(_gap):
            return {GUIDE_PATH: clean_page(PLAIN_INLINE)}

        gap, files, notes = gc.try_candidates(
            [JSONLD_GAP], produce, load_real_policy(), fake_base_read({})
        )
        self.assertIsNone(gap)
        self.assertIsNone(files)
        self.assertTrue(any("FAIL the gate; trying next" in n for n in notes))
        self.assertFalse(any("aborting" in n for n in notes))

    def test_try_candidates_skips_model_refusal_and_takes_next(self):
        def produce(gap):
            if gap["target"] == GUIDE_PATH:
                raise gc.ModelRefusal("model refused generation (stop_reason=refusal)")
            return {OG_GAP["target"]: clean_page()}

        gap, files, notes = gc.try_candidates(
            [JSONLD_GAP, OG_GAP], produce, load_real_policy(), fake_base_read({})
        )
        self.assertEqual(gap["target"], OG_GAP["target"])
        self.assertIsNotNone(files)
        self.assertTrue(any("trying next" in n for n in notes))

    def test_try_candidates_accepts_jsonld_output(self):
        def produce(_gap):
            return {GUIDE_PATH: clean_page(VALID_JSONLD)}

        gap, files, notes = gc.try_candidates(
            [JSONLD_GAP], produce, load_real_policy(), fake_base_read({})
        )
        self.assertEqual(gap["target"], GUIDE_PATH)
        self.assertIn(GUIDE_PATH, files)
        self.assertTrue(any("validation: clean" in n for n in notes))

    def test_source_no_longer_aborts_on_gate_failure(self):
        with open(os.path.join(HERE, "generate_content.py"), encoding="utf-8") as handle:
            src = handle.read()
        self.assertNotIn("aborting, nothing pushed", src)
        self.assertIn("trying next", src)
        self.assertIn("allow_jsonld", src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
