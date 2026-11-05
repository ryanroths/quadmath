#!/usr/bin/env python3
"""Tests for check_human_override.py: who may apply the human-override label.

    python -m unittest discover -s scripts/ci -p 'test_*.py'

The fixtures are two real PR timelines from this repository, as the REST API
returned them (commit emails redacted):

* fixtures/timeline_pr309.json -- ryanroths applied human-override by hand.
* fixtures/timeline_pr311.json -- the label shows ryanroths as its actor, but
  it went through the Cursor GitHub App, thirteen seconds after the Cursor
  agent's commit. That is an agent waving its own PR through, and it is the
  case the actor check exists for.

Every other case is one of those timelines with its labelling event edited:
the actor swapped for a bot or another user, or a later relabel appended.

Standard library only.
"""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import os
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures")
SCRIPT = os.path.join(HERE, "check_human_override.py")
WORKFLOW = os.path.join(HERE, "..", "..", ".github", "workflows", "agent-gate.yml")

_spec = importlib.util.spec_from_file_location("check_human_override", SCRIPT)
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

FAIL = "human-override must be applied by the owner"
LABELS = ["human-override"]

BOT = {"login": "github-actions[bot]", "id": 41898282, "type": "Bot"}
STRANGER = {"login": "octocat", "id": 583231, "type": "User"}


def timeline(n: int) -> list[dict]:
    with open(os.path.join(FIXTURES, "timeline_pr%d.json" % n), encoding="utf-8") as fh:
        return json.load(fh)


def labelling(events: list[dict]) -> dict:
    (event,) = [e for e in events if e.get("event") == "labeled"]
    return event


def by_hand() -> list[dict]:
    """PR #309: the owner, by hand."""
    return timeline(309)


def with_actor(actor: dict) -> list[dict]:
    events = by_hand()
    labelling(events)["actor"] = dict(actor)
    return events


def relabel(events: list[dict], actor: dict, at: str, app: dict | None = None) -> list[dict]:
    """Append an unlabel by the owner and a fresh label by `actor`."""
    first = labelling(events)
    off = copy.deepcopy(first)
    off.update(event="unlabeled", created_at=at.replace(":30Z", ":20Z"), id=first["id"] + 1)
    on = copy.deepcopy(first)
    on.update(event="labeled", created_at=at, id=first["id"] + 2, actor=dict(actor),
              performed_via_github_app=app)
    return events + [off, on]


class FixturesTest(unittest.TestCase):
    def test_the_fixtures_are_what_the_docstring_says(self):
        hand, app = labelling(timeline(309)), labelling(timeline(311))
        for event in (hand, app):
            self.assertEqual(event["label"]["name"], "human-override")
            self.assertEqual(event["actor"]["login"], "ryanroths")
            self.assertEqual(event["actor"]["type"], "User")
        self.assertIsNone(hand["performed_via_github_app"])
        self.assertEqual(app["performed_via_github_app"]["slug"], "cursor")


class JudgeTest(unittest.TestCase):
    def test_owner_by_hand_counts(self):
        verdict, detail = h.judge(LABELS, by_hand())
        self.assertEqual(verdict, "granted")
        self.assertIn("ryanroths", detail)

    def test_owner_through_an_app_does_not(self):
        verdict, detail = h.judge(LABELS, timeline(311))
        self.assertEqual(verdict, "rejected")
        self.assertIn("via the Cursor app", detail)

    def test_a_bot_does_not(self):
        verdict, detail = h.judge(LABELS, with_actor(BOT))
        self.assertEqual(verdict, "rejected")
        self.assertIn("github-actions[bot] (Bot)", detail)

    def test_another_user_does_not(self):
        verdict, detail = h.judge(LABELS, with_actor(STRANGER))
        self.assertEqual(verdict, "rejected")
        self.assertIn("octocat", detail)

    def test_a_bot_named_like_the_owner_does_not(self):
        verdict, _ = h.judge(LABELS, with_actor({"login": "ryanroths", "type": "Bot"}))
        self.assertEqual(verdict, "rejected")

    def test_login_case_does_not_matter(self):
        verdict, _ = h.judge(LABELS, with_actor({"login": "RyanRoths", "type": "User"}))
        self.assertEqual(verdict, "granted")

    def test_the_latest_labelling_is_the_one_that_counts(self):
        # Owner applied it, then a bot took it off and put it back.
        events = relabel(by_hand(), BOT, "2026-11-04T22:30:30Z")
        self.assertEqual(h.judge(LABELS, events)[0], "rejected")
        # A stranger applied it, then the owner took it off and put it back.
        events = relabel(with_actor(STRANGER), {"login": "ryanroths", "type": "User"},
                         "2026-11-04T22:30:30Z")
        self.assertEqual(h.judge(LABELS, events)[0], "granted")

    def test_order_comes_from_created_at_not_position(self):
        events = relabel(by_hand(), BOT, "2026-11-04T22:30:30Z")
        events.reverse()
        self.assertEqual(h.judge(LABELS, events)[0], "rejected")

    def test_other_labels_are_ignored(self):
        events = by_hand()
        bug = copy.deepcopy(labelling(events))
        bug.update(label={"name": "bug", "color": "d73a4a"}, actor=dict(BOT),
                   created_at="2026-11-04T22:40:00Z")
        self.assertEqual(h.judge(LABELS, events + [bug])[0], "granted")

    def test_no_label_means_the_gate_runs(self):
        self.assertEqual(h.judge(["bug"], timeline(311))[0], "absent")

    def test_a_timeline_that_never_shows_the_label_is_stale(self):
        events = [e for e in by_hand() if e.get("event") != "labeled"]
        self.assertEqual(h.judge(LABELS, events)[0], "stale")

    def test_a_timeline_ending_in_unlabeled_is_stale(self):
        events = by_hand()
        off = copy.deepcopy(labelling(events))
        off.update(event="unlabeled", created_at="2026-11-04T22:50:00Z")
        self.assertEqual(h.judge(LABELS, events + [off])[0], "stale")

    def test_the_run_that_labels_must_find_its_own_event(self):
        # Triggered by octocat's labelling, but the newest event the timeline
        # has is the owner's older one: the timeline is behind, not a pass.
        verdict, detail = h.judge(LABELS, by_hand(), sender="octocat")
        self.assertEqual(verdict, "stale")
        self.assertIn("octocat", detail)
        self.assertEqual(h.judge(LABELS, by_hand(), sender="ryanroths")[0], "granted")


class CommandLineTest(unittest.TestCase):
    """The script as the workflow runs it: exit code, annotation, GITHUB_OUTPUT."""

    def run_script(self, events: list[dict] | None, payload: dict) -> tuple[int, str, str]:
        with tempfile.TemporaryDirectory() as tmp:
            event_path = os.path.join(tmp, "event.json")
            output_path = os.path.join(tmp, "output")
            with open(event_path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            argv = ["--event", event_path, "--retries", "1", "--wait", "0"]
            if events is not None:
                timeline_path = os.path.join(tmp, "timeline.json")
                with open(timeline_path, "w", encoding="utf-8") as fh:
                    json.dump(events, fh)
                argv += ["--timeline", timeline_path]
            out = io.StringIO()
            with mock.patch.dict(os.environ, {"GITHUB_OUTPUT": output_path}), \
                    contextlib.redirect_stdout(out):
                code = h.main(argv)
            with open(output_path, encoding="utf-8") as fh:
                return code, out.getvalue(), fh.read()

    @staticmethod
    def payload(labels: list[str], action: str = "synchronize", sender: str = "ryanroths") -> dict:
        body = {
            "action": action,
            "sender": {"login": sender},
            "pull_request": {"number": 309, "labels": [{"name": n} for n in labels]},
        }
        if action == "labeled":
            body["label"] = {"name": "human-override"}
        return body

    def test_owner_skips_the_gate(self):
        code, out, output = self.run_script(by_hand(), self.payload(LABELS))
        self.assertEqual(code, 0)
        self.assertEqual(output, "override=true\n")
        self.assertIn("::notice::", out)

    def test_app_fails_with_the_message(self):
        code, out, output = self.run_script(timeline(311), self.payload(LABELS))
        self.assertEqual(code, 1)
        self.assertEqual(output, "override=false\n")
        self.assertIn("::error::" + FAIL, out)
        self.assertIn("Cursor", out)

    def test_bot_fails_with_the_message(self):
        code, out, output = self.run_script(with_actor(BOT), self.payload(LABELS, "labeled", BOT["login"]))
        self.assertEqual(code, 1)
        self.assertEqual(output, "override=false\n")
        self.assertIn("::error::" + FAIL, out)

    def test_unconfirmed_fails_closed_with_the_message(self):
        events = [e for e in by_hand() if e.get("event") != "labeled"]
        code, out, output = self.run_script(events, self.payload(LABELS))
        self.assertEqual(code, 1)
        self.assertEqual(output, "override=false\n")
        self.assertIn("::error::" + FAIL, out)

    def test_no_label_runs_the_gate_without_reading_the_timeline(self):
        # No --timeline and no token: reaching for the API would raise.
        with mock.patch.object(h, "fetch_timeline", side_effect=AssertionError("fetched")):
            code, out, output = self.run_script(None, self.payload(["bug"]))
        self.assertEqual(code, 0)
        self.assertEqual(output, "override=false\n")

    def test_api_errors_fail_closed(self):
        with mock.patch.object(h, "fetch_timeline", side_effect=OSError("HTTP 502")):
            code, out, output = self.run_script(None, self.payload(LABELS))
        self.assertEqual(code, 2)
        self.assertEqual(output, "override=false\n")
        self.assertIn("::error::" + FAIL, out)


class FetchTest(unittest.TestCase):
    def test_next_link(self):
        header = ('<https://api.github.com/repositories/1/issues/9/timeline?per_page=100&page=2>; rel="next", '
                  '<https://api.github.com/repositories/1/issues/9/timeline?per_page=100&page=3>; rel="last"')
        self.assertTrue(h.next_link(header).endswith("page=2"))
        self.assertIsNone(h.next_link('<https://x/?page=1>; rel="first"'))
        self.assertIsNone(h.next_link(None))

    def test_pages_are_followed_and_the_token_sent(self):
        events = by_hand()
        pages = {
            "https://api.github.com/repos/o/r/issues/9/timeline?per_page=100": (events[:2], '<https://p2>; rel="next"'),
            "https://p2": (events[2:], None),
        }
        seen = []

        class Response(io.BytesIO):
            def __init__(self, body, link):
                super().__init__(json.dumps(body).encode())
                self.headers = {"Link": link} if link else {}

            def __exit__(self, *exc):
                self.close()

        def urlopen(request, timeout):
            seen.append((request.full_url, request.get_header("Authorization")))
            return Response(*pages[request.full_url])

        with mock.patch.object(h.urllib.request, "urlopen", urlopen):
            got = h.fetch_timeline("o/r", 9, "tkn")
        self.assertEqual(got, events)
        self.assertEqual([u for u, _ in seen], list(pages))
        self.assertTrue(all(a == "Bearer tkn" for _, a in seen))


class WorkflowTest(unittest.TestCase):
    """The label must not skip the job before the actor is checked."""

    def setUp(self):
        with open(WORKFLOW, encoding="utf-8") as fh:
            self.text = fh.read()

    def test_the_job_is_not_skipped_on_the_label_alone(self):
        self.assertNotIn("!contains(github.event.pull_request.labels", self.text)

    def test_the_check_runs_from_the_base_and_gates_the_validator(self):
        self.assertIn("for name in validate_agent_pr check_human_override", self.text)
        self.assertIn('run: python "$RUNNER_TEMP/check_human_override.py"', self.text)
        self.assertIn("if: steps.override.outputs.override != 'true'", self.text)
        self.assertIn("pull-requests: read", self.text)


if __name__ == "__main__":
    unittest.main()
