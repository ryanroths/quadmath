#!/usr/bin/env python3
"""Tests for scripts/parse_tune_diff.py and scripts/agent/tune_db.py.

    python -m unittest discover -s scripts/agent -p 'test_*.py'

The centrepiece is the round trip: for each of the eight hand-authored entries
in tune-database.js, rebuild the `diff all` that would have produced it, parse
that back, and compare. A mismatch is a parser bug. tune-database.js is read,
never written, by this file -- editing the data to make a test pass would
defeat the point of the test.

Reconstruction rules, so the fixtures below stay honest:

  * PIDs, rates and rates_type come from the entry itself.
  * `board_name` is the real board where a "Board: X" note records one, and
    the entry's `fc` otherwise. It is not back-filled from `fc` when the two
    are known to differ -- see FC_IS_PROSE.
  * every other `set` line is derived from the entry's notes, one fixture per
    entry, and nothing else is added. Notes that no diff could produce (voice,
    opinion, cross-references) are listed in `editorial` and expected not to
    come back.

Standard library only. No network, no git.
"""

from __future__ import annotations

import importlib.util
import io
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))


def _load(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


parser = _load("parse_tune_diff", os.path.join(REPO_ROOT, "scripts", "parse_tune_diff.py"))
tune_db = _load("tune_db", os.path.join(HERE, "tune_db.py"))

TUNE_DB_PATH = os.path.join(REPO_ROOT, "tune-database.js")


def read_db_text() -> str:
    with io.open(TUNE_DB_PATH, encoding="utf-8") as fh:
        return fh.read()


def load_entries() -> dict[str, dict]:
    return {entry["id"]: entry for entry in tune_db.read_tunes(read_db_text())}


# --------------------------------------------------------------------------
# per-entry reconstruction fixtures
# --------------------------------------------------------------------------
#
# settings  : the non-PID, non-rate `set` lines the entry's notes imply.
# board     : what `set board_name` said on that quad.
# version   : the `# Betaflight / ...` header, only where the entry records one.
# editorial : notes a diff cannot produce. Not a parser gap.
# gaps      : notes the parser DOES emit that the hand-authored entry words
#             differently. Each one is a real finding, written down rather
#             than papered over.

FIXTURES = {
    "65-betafpv-ryfly-1219s": {
        "board": "AIR65 RYFLY",
        "settings": {
            "d_min_roll": "36", "d_min_pitch": "49",
            "tpa_rate": "60",
            "f_roll": "0", "f_pitch": "0", "f_yaw": "0",
            "gyro_lpf1_static_hz": "0",
            "dyn_notch_count": "1", "dyn_notch_q": "500",
            "dyn_notch_min_hz": "120", "dyn_notch_max_hz": "500",
            "dshot_bidir": "ON", "motor_pwm_protocol": "DSHOT300",
        },
        "editorial": ["Crash recovery ON", "Board: AIR65 RYFLY"],
        "gaps": {},
    },
    "65-betafpv-ryfly-hq31": {
        "board": "AIR65 RYFLY",
        "settings": {
            "d_min_roll": "41", "d_min_pitch": "51",
            "tpa_rate": "60",
            "f_roll": "0", "f_pitch": "0", "f_yaw": "0",
        },
        "editorial": ["Same filter config as the 1219S tune", "Board: AIR65 RYFLY"],
        "gaps": {},
    },
    "65-happymodel-stock": {
        "board": "Happymodel CrazyBee F4 SX",
        "settings": {
            "simplified_pids_mode": "RPY", "simplified_master_multiplier": "155",
            "f_roll": "111", "f_pitch": "110", "f_yaw": "111",
        },
        "editorial": [],
        "gaps": {},
    },
    "65-happymodel-ryfly": {
        "board": "Happymodel CrazyBee F4 SX",
        "settings": {
            "f_roll": "138", "f_pitch": "143",
            "d_min_roll": "23", "d_min_pitch": "28",
            "thrust_linear": "20",
            "dshot_bidir": "ON",
            "gyro_lpf1_static_hz": "0",
            "dyn_notch_count": "0",
        },
        "editorial": [
            "D-term dyn 67–135hz",
            "Aggressive — for clean bidir builds",
        ],
        # The hand-authored note packs the whole RPM filter config into one
        # line; the parser reports only what dshot_bidir and
        # motor_pwm_protocol actually said.
        "gaps": {"RPM filter ON": "RPM filter ON (bidir dshot, 1H, 100/20/100)"},
    },
    "65-newbeedrone-stock": {
        "board": "NewBeeDrone Hummingbird RaceSpec V2",
        "settings": {},
        "editorial": [
            "Stock BF 4.5.1 defaults",
            "motor_kv 1960 — verify against your actual motor KV",
        ],
        "gaps": {},
    },
    "75-betafpv-stock": {
        "board": "BetaFPV G473_V2",
        "version": "4.5.3",
        "settings": {},
        "editorial": [
            "Rates N/A — not yet pulled, will follow with the stock diff",
            "Optimized for stock motor/prop per BetaFPV spec",
        ],
        "gaps": {},
    },
    "75-betafpv-ryfly-gf40": {
        "board": "RY75",
        "settings": {
            "f_roll": "79", "f_pitch": "82",
            "d_min_roll": "37", "d_min_pitch": "43",
            "tpa_rate": "75", "tpa_breakpoint": "1250",
            "dyn_notch_count": "1", "dyn_notch_q": "350",
            "dyn_notch_min_hz": "150", "dyn_notch_max_hz": "350",
            "motor_pwm_protocol": "DSHOT300",
        },
        "editorial": ["No stock tune published for this board — custom build"],
        # 'DSHOT300' on its own is a hand-authored note. The parser reports the
        # protocol only as part of the RPM filter line, and this diff carries
        # no dshot_bidir, so it says nothing -- which is the intended
        # behaviour: no parameter, no claim.
        "gaps": {},
        "unmatched_hand_notes": ["DSHOT300"],
    },
    "85-happymodel-ryfly": {
        "board": "Happymodel CrazyBee F4 DX (HAMO)",
        "settings": {
            "f_roll": "180", "f_pitch": "187",
            "d_min_roll": "40", "d_min_pitch": "45",
            "dyn_notch_min_hz": "125", "dyn_notch_max_hz": "850",
            "thrust_linear": "20",
        },
        "editorial": [
            "Crash recovery ON",
            "dyn_idle_min_rpm 35",
            "Higher RC rate than the other builds",
            "No stock tune published — custom build",
        ],
        # 'thrust_linear 20' lower-case in this entry, 'Thrust linear 20' in
        # 65-happymodel-ryfly. The parser has to pick one; it picks the form
        # used by the majority of the hand-authored entries.
        "gaps": {"Thrust linear 20": "thrust_linear 20"},
    },
}

# fc on the hand-authored entries is human prose naming the hardware
# ("BetaFPV G473 (BEFH)"), not the string a diff carries in `board_name`
# ("AIR65 RYFLY"). The parser reads board_name as specified, so on these
# entries its fc is correct and simply differs from the hand-written one.
FC_IS_PROSE = {
    "65-betafpv-ryfly-1219s",
    "65-betafpv-ryfly-hq31",
    "75-betafpv-ryfly-gf40",
}

AXES = ("roll", "pitch", "yaw")


def rebuild_diff(entry: dict, fixture: dict) -> str:
    """The `diff all` that would have produced `entry`."""
    lines = ["# diff all", "#", "# version"]
    version = fixture.get("version")
    if version:
        lines.append("# Betaflight / STM32G473 (SG47) %s Feb 14 2025 / 09:12:44 (abc1234) "
                     "MSP API: 1.46" % version)
    lines += ["#", "board_name %s" % fixture["board"], "#", "# master"]

    lines.append("set board_name = %s" % fixture["board"])
    for key, value in sorted(fixture["settings"].items()):
        lines.append("set %s = %s" % (key, value))

    lines += ["#", "# profile 0", "profile 0"]
    for axis in AXES:
        p_term, i_term, d_term = entry["pids"][axis]
        lines.append("set p_%s = %d" % (axis, p_term))
        lines.append("set i_%s = %d" % (axis, i_term))
        if not (axis == "yaw" and d_term == 0):
            lines.append("set d_%s = %d" % (axis, d_term))

    lines += ["#", "# rateprofile 0", "rateprofile 0"]
    if entry["rates"]:
        lines.append("set rates_type = %s" % entry["rateType"])
        for axis in AXES:
            rc_rate, srate, expo = entry["rates"][axis]
            lines.append("set %s_rc_rate = %d" % (axis, rc_rate))
            lines.append("set %s_srate = %d" % (axis, srate))
            lines.append("set %s_expo = %d" % (axis, expo))
    lines.append("save")
    return "\n".join(lines) + "\n"


class RoundTrip(unittest.TestCase):
    """Every hand-authored entry, rebuilt as a diff and parsed back."""

    @classmethod
    def setUpClass(cls):
        cls.entries = load_entries()

    def test_every_entry_has_a_fixture(self):
        self.assertEqual(sorted(self.entries), sorted(FIXTURES),
                         "tune-database.js and the round-trip fixtures have drifted apart")

    def parse_entry(self, tune_id: str):
        entry = self.entries[tune_id]
        fixture = FIXTURES[tune_id]
        text = rebuild_diff(entry, fixture)
        return entry, fixture, parser.parse_tune_diff(
            text,
            frame=entry["frame"],
            brand=entry["brand"],
            motor=entry["combo"],
            pilot="roundtrip",
        )

    def test_pids_round_trip(self):
        for tune_id in FIXTURES:
            with self.subTest(tune=tune_id):
                entry, _, parsed = self.parse_entry(tune_id)
                self.assertEqual(parsed["pids"], entry["pids"])

    def test_rates_round_trip(self):
        for tune_id in FIXTURES:
            with self.subTest(tune=tune_id):
                entry, _, parsed = self.parse_entry(tune_id)
                self.assertEqual(parsed["rates"], entry["rates"])

    def test_rate_type_round_trips(self):
        for tune_id in FIXTURES:
            with self.subTest(tune=tune_id):
                entry, _, parsed = self.parse_entry(tune_id)
                self.assertEqual(parsed["rateType"], entry["rateType"])

    def test_fc_is_board_name(self):
        for tune_id in FIXTURES:
            with self.subTest(tune=tune_id):
                entry, fixture, parsed = self.parse_entry(tune_id)
                self.assertEqual(parsed["fc"], fixture["board"])
                if tune_id not in FC_IS_PROSE:
                    self.assertEqual(parsed["fc"], entry["fc"])

    def test_derived_notes_match_the_hand_authored_wording(self):
        """Every derived note is either verbatim in the entry or a listed gap."""
        for tune_id in FIXTURES:
            with self.subTest(tune=tune_id):
                entry, fixture, parsed = self.parse_entry(tune_id)
                hand = set(entry["notes"])
                gaps = fixture["gaps"]
                for note in parsed["notes"]:
                    if note in hand:
                        continue
                    self.assertIn(
                        note, gaps,
                        "%s: parser emitted %r, which is not in the entry and is "
                        "not a recorded gap" % (tune_id, note),
                    )
                    self.assertIn(gaps[note], hand,
                                  "%s: recorded gap target %r is not in the entry"
                                  % (tune_id, gaps[note]))

    def test_editorial_notes_are_not_invented(self):
        """The parser never reproduces a note that no diff could support."""
        for tune_id in FIXTURES:
            with self.subTest(tune=tune_id):
                _, fixture, parsed = self.parse_entry(tune_id)
                for note in fixture["editorial"]:
                    self.assertNotIn(note, parsed["notes"])

    def test_community_provenance_is_stamped(self):
        for tune_id in FIXTURES:
            with self.subTest(tune=tune_id):
                _, _, parsed = self.parse_entry(tune_id)
                self.assertEqual(parsed["sourceType"], "community")
                self.assertEqual(parsed["source"], "roundtrip")


# --------------------------------------------------------------------------
# refusals
# --------------------------------------------------------------------------

GOOD_DIFF = """# diff all
#
# version
# Betaflight / STM32G473 (SG47) 4.5.1 Feb 14 2025 / 09:12:44 (abc1234)
#
# master
set board_name = AIR65 RYFLY
set dshot_bidir = ON
set motor_pwm_protocol = DSHOT300
set tpa_rate = 60
#
# profile 0
set p_roll = 54
set i_roll = 77
set d_roll = 38
set p_pitch = 62
set i_pitch = 89
set d_pitch = 52
set p_yaw = 54
set i_yaw = 77
#
# rateprofile 0
set rates_type = BETAFLIGHT
set roll_rc_rate = 4
set roll_srate = 74
set roll_expo = 56
set pitch_rc_rate = 4
set pitch_srate = 74
set pitch_expo = 56
set yaw_rc_rate = 4
set yaw_srate = 70
set yaw_expo = 56
save
"""


def parse_good(**overrides):
    kwargs = {"frame": 65, "brand": "BetaFPV", "motor": "VCI 0702", "prop": "Gemfan 1219S"}
    kwargs.update(overrides)
    return parser.parse_tune_diff(GOOD_DIFF, **kwargs)


class Refusals(unittest.TestCase):
    def assert_refused(self, text, needle, **kwargs):
        opts = {"frame": 65, "brand": "BetaFPV"}
        opts.update(kwargs)
        with self.assertRaises(parser.TuneRefused) as ctx:
            parser.parse_tune_diff(text, **opts)
        joined = " ".join(ctx.exception.reasons).lower()
        self.assertIn(needle.lower(), joined,
                      "refused, but not for the expected reason: %s" % ctx.exception.reasons)
        return ctx.exception

    def test_baseline_diff_parses(self):
        entry = parse_good()
        self.assertEqual(entry["pids"]["roll"], [54, 77, 38])
        self.assertEqual(entry["pids"]["yaw"], [54, 77, 0])
        self.assertEqual(entry["fc"], "AIR65 RYFLY")

    def test_dump_is_refused(self):
        # A dump prints every parameter at its default; publishing it would
        # claim the whole config as deliberate.
        dump = GOOD_DIFF.replace("# diff all", "# dump all")
        self.assert_refused(dump, "this is a `dump`")

    def test_dump_without_any_header_is_refused(self):
        self.assert_refused(GOOD_DIFF.replace("# diff all\n", ""), "no `# diff` header")

    def test_dump_wearing_a_diff_header_is_refused(self):
        padded = GOOD_DIFF + "".join(
            "set padding_param_%d = 0\n" % n for n in range(parser.MAX_SET_LINES + 1)
        )
        self.assert_refused(padded, "looks like a dump")

    def test_truncated_before_the_pids_is_refused(self):
        truncated = GOOD_DIFF.split("# profile 0")[0]
        self.assert_refused(truncated, "no PID lines")

    def test_truncated_mid_pids_is_refused(self):
        truncated = GOOD_DIFF.split("set p_yaw")[0] + "save\n"
        exc = self.assert_refused(truncated, "incomplete pids")
        self.assertIn("set p_yaw", " ".join(exc.reasons))
        self.assertIn("set i_yaw", " ".join(exc.reasons))

    def test_truncated_mid_rates_is_refused(self):
        truncated = GOOD_DIFF.split("set yaw_rc_rate")[0] + "save\n"
        exc = self.assert_refused(truncated, "incomplete rates")
        self.assertIn("set yaw_rc_rate", " ".join(exc.reasons))

    def test_no_rate_lines_emits_null_rates(self):
        # 75-betafpv-stock is exactly this case: the card hides the CLI button.
        no_rates = GOOD_DIFF.split("# rateprofile 0")[0] + "save\n"
        entry = parser.parse_tune_diff(no_rates, frame=65, brand="BetaFPV")
        self.assertIsNone(entry["rates"])
        self.assertEqual(entry["rateType"], "BETAFLIGHT")

    def test_pid_over_255_is_refused(self):
        self.assert_refused(GOOD_DIFF.replace("set p_roll = 54", "set p_roll = 300"),
                            "outside 0-255")

    def test_negative_pid_is_refused(self):
        self.assert_refused(GOOD_DIFF.replace("set i_pitch = 89", "set i_pitch = -1"),
                            "outside 0-255")

    def test_rc_rate_over_range_is_refused(self):
        # 256 in CLI units is 2.56 in Configurator units, one past the ceiling.
        self.assert_refused(GOOD_DIFF.replace("set roll_rc_rate = 4", "set roll_rc_rate = 256"),
                            "outside 0.01-2.55")

    def test_rc_rate_of_zero_is_refused(self):
        self.assert_refused(GOOD_DIFF.replace("set roll_rc_rate = 4", "set roll_rc_rate = 0"),
                            "outside 0.01-2.55")

    def test_srate_over_range_is_refused(self):
        self.assert_refused(GOOD_DIFF.replace("set pitch_srate = 74", "set pitch_srate = 101"),
                            "outside 0.00-1.00")

    def test_expo_over_range_is_refused(self):
        self.assert_refused(GOOD_DIFF.replace("set yaw_expo = 56", "set yaw_expo = 150"),
                            "outside 0.00-1.00")

    def test_non_numeric_pid_is_refused(self):
        self.assert_refused(GOOD_DIFF.replace("set d_roll = 38", "set d_roll = abc"),
                            "not an integer")

    def test_no_board_identity_is_refused(self):
        stripped = GOOD_DIFF.replace("set board_name = AIR65 RYFLY\n", "").replace(
            "# Betaflight / STM32G473 (SG47) 4.5.1 Feb 14 2025 / 09:12:44 (abc1234)\n", "")
        self.assert_refused(stripped, "no board identity")

    def test_unknown_frame_is_refused(self):
        self.assert_refused(GOOD_DIFF, "frame", frame=120)

    def test_missing_brand_is_refused(self):
        self.assert_refused(GOOD_DIFF, "brand is required", brand="  ")


class Provenance(unittest.TestCase):
    def test_handle_is_kept(self):
        self.assertEqual(parse_good(pilot="whoopdad")["source"], "whoopdad")

    def test_blank_handle_becomes_community(self):
        self.assertEqual(parse_good(pilot="")["source"], parser.ANON_SOURCE)
        self.assertEqual(parse_good(pilot=None)["source"], parser.ANON_SOURCE)

    def test_reserved_handles_cannot_be_claimed(self):
        # The badge is the provenance signal. A submitter must not be able to
        # wear the bench-verified one.
        for claim in ("RyFly", "ryfly", "RYFLY", "Stock", "stock"):
            with self.subTest(claim=claim):
                self.assertEqual(parse_good(pilot=claim)["source"], parser.ANON_SOURCE)

    def test_handle_is_stripped_to_a_safe_charset(self):
        entry = parse_good(pilot="<script>alert(1)</script>")
        self.assertNotIn("<", entry["source"])
        self.assertNotIn(">", entry["source"])

    def test_handle_length_is_capped(self):
        self.assertLessEqual(len(parse_good(pilot="x" * 200)["source"]), parser.HANDLE_MAX)

    def test_every_parsed_entry_is_marked_community(self):
        self.assertEqual(parse_good(pilot="whoopdad")["sourceType"], "community")


class BetaflightNaming(unittest.TestCase):
    """4.4 and 4.5 spell some of these differently."""

    def notes_for(self, extra: dict) -> list[str]:
        lines = "".join("set %s = %s\n" % item for item in extra.items())
        return parser.parse_tune_diff(
            GOOD_DIFF.replace("set tpa_rate = 60\n", "set tpa_rate = 60\n" + lines),
            frame=65, brand="BetaFPV",
        )["notes"]

    def test_d_min_is_reported_as_d_min(self):
        notes = self.notes_for({"d_min_roll": "36", "d_min_pitch": "49"})
        self.assertIn("D-min R36/P49", notes)

    def test_d_max_is_reported_as_d_max(self):
        # BF 4.5 renamed D Min to D Max, and it is a ceiling rather than a
        # floor -- folding the two together would invert the note.
        notes = self.notes_for({"d_max_roll": "36", "d_max_pitch": "49"})
        self.assertIn("D-max R36/P49", notes)
        self.assertNotIn("D-min R36/P49", notes)

    def test_feedforward_reads_both_spellings(self):
        self.assertIn("FF R111/P110/Y111",
                      self.notes_for({"f_roll": "111", "f_pitch": "110", "f_yaw": "111"}))
        self.assertIn("FF R111/P110/Y111",
                      self.notes_for({"ff_roll": "111", "ff_pitch": "110", "ff_yaw": "111"}))

    def test_all_zero_feedforward_reads_as_off(self):
        self.assertIn("FF off", self.notes_for({"f_roll": "0", "f_pitch": "0", "f_yaw": "0"}))

    def test_absent_parameters_produce_no_note(self):
        notes = self.notes_for({})
        for fragment in ("D-min", "D-max", "Thrust linear", "Simplified", "Gyro LPF1"):
            self.assertFalse([n for n in notes if n.startswith(fragment)],
                             "invented a %s note with no `set` line to support it" % fragment)

    def test_dyn_notch_count_zero_reads_as_off(self):
        self.assertIn("Dyn notch off", self.notes_for({"dyn_notch_count": "0"}))

    def test_dyn_notch_range_without_count(self):
        self.assertIn("Dyn notch 125–850hz",
                      self.notes_for({"dyn_notch_min_hz": "125", "dyn_notch_max_hz": "850"}))

    def test_gyro_lpf1_zero_reads_as_off(self):
        self.assertIn("Gyro LPF1 off", self.notes_for({"gyro_lpf1_static_hz": "0"}))

    def test_gyro_lpf1_dynamic_range(self):
        self.assertIn("Gyro LPF1 dyn 100–200hz",
                      self.notes_for({"gyro_lpf1_dyn_min_hz": "100",
                                      "gyro_lpf1_dyn_max_hz": "200"}))

    def test_bidir_off_reads_as_rpm_filter_off(self):
        notes = parser.parse_tune_diff(
            GOOD_DIFF.replace("set dshot_bidir = ON", "set dshot_bidir = OFF"),
            frame=65, brand="BetaFPV")["notes"]
        self.assertIn("RPM filter off", notes)

    def test_version_header_becomes_a_note(self):
        self.assertIn("BF 4.5.1", parse_good()["notes"])

    def test_last_profile_block_wins(self):
        # `diff all` prints every PID profile; Betaflight replays the file top
        # to bottom, so the last block is the one that lands.
        two_profiles = GOOD_DIFF.replace("save\n", "") + (
            "# profile 1\nset p_roll = 99\nsave\n")
        self.assertEqual(parser.parse_tune_diff(
            two_profiles, frame=65, brand="BetaFPV")["pids"]["roll"][0], 99)


# --------------------------------------------------------------------------
# tune_db read/append
# --------------------------------------------------------------------------


class TuneDbIO(unittest.TestCase):
    def setUp(self):
        self.text = read_db_text()

    def test_reads_all_eight_entries(self):
        entries = tune_db.read_tunes(self.text)
        self.assertEqual(len(entries), 8)
        self.assertEqual(entries[0]["id"], "65-betafpv-ryfly-1219s")
        self.assertIsNone(entries[5]["rates"])

    def test_append_adds_exactly_one_entry(self):
        entry = parse_good(pilot="whoopdad")
        updated = tune_db.append_tune(self.text, entry)
        before = tune_db.read_tunes(self.text)
        after = tune_db.read_tunes(updated)
        self.assertEqual(len(after), len(before) + 1)
        self.assertEqual(after[:-1], before, "appending rewrote an existing entry")
        self.assertEqual(after[-1], entry)

    def test_append_leaves_the_rest_of_the_file_alone(self):
        updated = tune_db.append_tune(self.text, parse_good(pilot="whoopdad"))
        added = len(updated.splitlines()) - len(self.text.splitlines())
        self.assertLess(added, 40, "append should be one entry, not a reformat")
        self.assertIn("var PENDING = [", updated)
        self.assertIn("window.QuadMathTunes", updated)

    def test_duplicate_id_is_refused(self):
        entry = parse_good(pilot="whoopdad")
        entry["id"] = "65-betafpv-ryfly-1219s"
        with self.assertRaises(tune_db.TuneDbError):
            tune_db.append_tune(self.text, entry)

    def test_null_rates_are_written_as_null(self):
        entry = parse_good(pilot="whoopdad")
        entry["rates"] = None
        updated = tune_db.append_tune(self.text, entry)
        self.assertIsNone(tune_db.read_tunes(updated)[-1]["rates"])
        self.assertIn("rates: null,", updated)

    def test_strings_are_escaped_on_write(self):
        # The renderer escapes for HTML; this is the other half -- a quote in
        # a board name must not close the JS string literal it lands in.
        entry = parse_good(pilot="whoopdad")
        entry["fc"] = 'evil", x: 1, y: "'
        entry["notes"] = ["line\nbreak", 'quote " inside', "back\\slash"]
        updated = tune_db.append_tune(self.text, entry)
        written = tune_db.read_tunes(updated)[-1]
        self.assertEqual(written["fc"], entry["fc"])
        self.assertEqual(written["notes"], entry["notes"])
        self.assertEqual(len(tune_db.read_tunes(updated)), 9)

    def test_unknown_keys_are_refused(self):
        entry = parse_good(pilot="whoopdad")
        entry["onclick"] = "alert(1)"
        with self.assertRaises(tune_db.TuneDbError):
            tune_db.append_tune(self.text, entry)


if __name__ == "__main__":
    unittest.main()
