#!/usr/bin/env python3
"""Tests for the JSON-LD exemption in validate_agent_pr.py.

    python -m unittest discover -s scripts/ci -p 'test_*.py'

These exercise check_html directly rather than driving a scratch git repo,
because the behaviour under test is entirely about HTML parsing and policy
flags. Standard library only.
"""

from __future__ import annotations

import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATOR = os.path.join(HERE, "validate_agent_pr.py")

_spec = importlib.util.spec_from_file_location("validate_agent_pr", VALIDATOR)
v = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(v)


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

EXTERNAL_SCRIPT = (
    '  <script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>'
)


def policy(**html_overrides) -> dict:
    checks = {"forbid_inline_script": True, "require_meta_description": True}
    checks.update(html_overrides)
    return {"html_checks": checks, "link_checks": {"check_internal": False}}


def run(body_head: str, pol: dict) -> list[str]:
    """Run check_html over a page and return the violation messages."""
    v.VIOLATIONS.clear()
    v.check_html("content/guides/x.html", PAGE % body_head, pol, set(), HERE)
    return list(v.VIOLATIONS)


class TestJsonLdExemption(unittest.TestCase):
    def tearDown(self) -> None:
        v.VIOLATIONS.clear()

    def test_valid_jsonld_passes_when_allowed(self):
        problems = run(VALID_JSONLD, policy(allow_jsonld=True))
        self.assertEqual(problems, [], "valid JSON-LD should be exempt")

    def test_malformed_jsonld_fails_even_when_allowed(self):
        problems = run(MALFORMED_JSONLD, policy(allow_jsonld=True))
        self.assertTrue(problems, "malformed JSON-LD must not slip through")
        self.assertIn("does not contain valid JSON", problems[0])

    def test_plain_inline_script_still_fails_when_jsonld_allowed(self):
        problems = run(PLAIN_INLINE, policy(allow_jsonld=True))
        self.assertTrue(problems)
        self.assertIn("inline <script> is forbidden", problems[0])

    def test_allow_jsonld_false_restores_the_blanket_ban(self):
        problems = run(VALID_JSONLD, policy(allow_jsonld=False))
        self.assertTrue(problems, "with the flag off, JSON-LD is just an inline script")
        self.assertIn("inline <script> is forbidden", problems[0])
        self.assertIn("allow_jsonld", problems[0], "the message should name the escape hatch")

    def test_absent_key_defaults_to_the_old_behaviour(self):
        # Fail closed: a policy predating this change must not silently start
        # permitting inline scripts of any kind.
        problems = run(VALID_JSONLD, policy())
        self.assertTrue(problems)
        self.assertIn("inline <script> is forbidden", problems[0])

    def test_external_script_is_unaffected(self):
        pol = policy(allow_jsonld=True, allowed_script_hosts=["static.cloudflareinsights.com"])
        self.assertEqual(run(EXTERNAL_SCRIPT, pol), [])

    def test_jsonld_and_plain_inline_together_reports_only_the_plain_one(self):
        problems = run(VALID_JSONLD + "\n" + PLAIN_INLINE, policy(allow_jsonld=True))
        self.assertEqual(len(problems), 1)
        self.assertIn("inline <script> is forbidden", problems[0])

    def test_empty_jsonld_block_is_invalid_json(self):
        empty = '  <script type="application/ld+json"></script>'
        problems = run(empty, policy(allow_jsonld=True))
        self.assertTrue(problems, "an empty structured-data block is a defect")
        self.assertIn("does not contain valid JSON", problems[0])

    def test_type_match_is_exact(self):
        # A near-miss type is not the exemption; it stays a forbidden inline script.
        near = '  <script type="application/json">{"a": 1}</script>'
        problems = run(near, policy(allow_jsonld=True))
        self.assertTrue(problems)
        self.assertIn("inline <script> is forbidden", problems[0])

    def test_type_match_tolerates_case_and_whitespace(self):
        odd = '  <script type=" Application/LD+JSON ">{"a": 1}</script>'
        self.assertEqual(run(odd, policy(allow_jsonld=True)), [])

    def test_two_jsonld_blocks_are_checked_independently(self):
        problems = run(VALID_JSONLD + "\n" + MALFORMED_JSONLD, policy(allow_jsonld=True))
        self.assertEqual(len(problems), 1)
        self.assertIn("does not contain valid JSON", problems[0])

    def test_jsonld_does_not_disturb_the_tag_stack(self):
        problems = run(VALID_JSONLD + "\n  <div>", policy(allow_jsonld=True))
        self.assertTrue(any("unclosed tag <div>" in p for p in problems))
        self.assertFalse(any("script" in p for p in problems))


class TestShippedPolicy(unittest.TestCase):
    def test_repo_policy_enables_the_exemption(self):
        import json

        path = os.path.join(HERE, "agent_policy.json")
        with open(path) as handle:
            pol = json.load(handle)
        checks = pol["html_checks"]
        self.assertTrue(checks["forbid_inline_script"])
        self.assertTrue(checks["allow_jsonld"], "the site's SEO setup depends on JSON-LD")


if __name__ == "__main__":
    unittest.main(verbosity=2)
