#!/usr/bin/env python3
"""Tests for scripts/ci/stamp_asset_cache.py.

    python -m unittest discover -s scripts/ci -p 'test_*.py'

Two jobs: the rewriter itself (quoted first-party URLs gain a content hash;
third-party URLs do not) and a pin on the checked-in HTML so a script.js
change that forgets to restamp fails CI the same way the 4-hour CDN cache
already failed users.
"""

from __future__ import annotations

import importlib.util
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

_spec = importlib.util.spec_from_file_location(
    "stamp_asset_cache", os.path.join(HERE, "stamp_asset_cache.py")
)
stamp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(stamp)


def _write(root: str, rel: str, content: str) -> None:
    full = os.path.join(root, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)


PAGE = """<!doctype html>
<html lang="en">
<head>
  <link rel="stylesheet" href="style.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
</head>
<body>
  <script src="nav.js" defer></script>
  <script src="motion.js" defer></script>
  <script src="script.js"></script>
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>
</body>
</html>
"""

SIM_SNIP = """<link rel="stylesheet" href="style.css">
<script type="importmap">
{
  "imports": {
    "three": "./vendor/three.module.min.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"
  }
}
</script>
<script type="module">
import {QuadPhysics} from "./quadphysics.js";
</script>
<script src="nav.js" defer></script>
"""

GUIDE = '<link rel="stylesheet" href="/style.css">\n'


class StampHtmlText(unittest.TestCase):
    def setUp(self) -> None:
        self.hashes = {
            "style.css": "aaa111aaa111",
            "script.js": "bbb222bbb222",
            "nav.js": "ccc333ccc333",
            "motion.js": "ddd444ddd444",
            "tune-database.js": "eee555eee555",
            "quadphysics.js": "fff666fff666",
            "vendor/three.module.min.js": "abc123abc123",
        }

    def test_script_and_link_tags_gain_query_hash(self):
        out = stamp.stamp_html_text(PAGE, self.hashes)
        self.assertIn('href="style.css?v=aaa111aaa111"', out)
        self.assertIn('src="nav.js?v=ccc333ccc333"', out)
        self.assertIn('src="motion.js?v=ddd444ddd444"', out)
        self.assertIn('src="script.js?v=bbb222bbb222"', out)

    def test_third_party_urls_are_untouched(self):
        out = stamp.stamp_html_text(PAGE, self.hashes)
        self.assertIn("https://fonts.googleapis.com", out)
        self.assertIn("https://static.cloudflareinsights.com/beacon.min.js", out)
        self.assertNotIn("beacon.min.js?v=", out)
        self.assertNotIn("fonts.googleapis.com/css2?v=", out)

    def test_root_prefixed_guide_css(self):
        out = stamp.stamp_html_text(GUIDE, self.hashes)
        self.assertEqual(out, '<link rel="stylesheet" href="/style.css?v=aaa111aaa111">\n')

    def test_esm_import_and_importmap(self):
        out = stamp.stamp_html_text(SIM_SNIP, self.hashes)
        self.assertIn('"./vendor/three.module.min.js?v=abc123abc123"', out)
        self.assertIn('from "./quadphysics.js?v=fff666fff666"', out)
        self.assertIn("https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/", out)
        self.assertNotIn("jsdelivr.net/npm/three@0.180.0/examples/jsm/?v=", out)

    def test_restamp_replaces_old_hash(self):
        once = stamp.stamp_html_text('src="script.js"', self.hashes)
        again = stamp.stamp_html_text(once, {"script.js": "999999999999"})
        self.assertEqual(again, 'src="script.js?v=999999999999"')

    def test_missing_hash_leaves_url_alone(self):
        out = stamp.stamp_html_text('src="script.js"', {})
        self.assertEqual(out, 'src="script.js"')

    def test_apply_to_html_map_skips_non_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            _write(tmp, "style.css", "body{}\n")
            files = {
                "page.html": '<link rel="stylesheet" href="/style.css">\n',
                "tune-database.js": "const TUNES=[];\n",
            }
            out = stamp.apply_to_html_map(tmp, files)
            self.assertIn("?v=", out["page.html"])
            self.assertEqual(out["tune-database.js"], files["tune-database.js"])


class StampTreeAndCheck(unittest.TestCase):
    def test_check_reports_unstamped_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            _write(tmp, "style.css", "body{color:red}\n")
            _write(tmp, "index.html", '<link rel="stylesheet" href="style.css">\n')
            stale = stamp.check_tree(tmp)
            self.assertEqual(stale, ["index.html"])

    def test_stamp_then_check_is_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            _write(tmp, "style.css", "body{color:red}\n")
            _write(tmp, "nav.js", "console.log(1)\n")
            _write(tmp, "index.html", PAGE)
            changed = stamp.stamp_tree(tmp)
            self.assertEqual(changed, ["index.html"])
            self.assertEqual(stamp.check_tree(tmp), [])
            with open(os.path.join(tmp, "index.html"), encoding="utf-8") as handle:
                text = handle.read()
            digest = stamp.file_digest(os.path.join(tmp, "style.css"))
            self.assertIn("style.css?v=%s" % digest, text)
            self.assertIn("https://static.cloudflareinsights.com/beacon.min.js", text)

    def test_digest_ignores_line_endings(self):
        # A Windows checkout with core.autocrlf sees CRLF; CI sees LF. Both
        # must stamp identically or local restamps fail the CI check.
        with tempfile.TemporaryDirectory() as tmp:
            lf = os.path.join(tmp, "lf.js")
            crlf = os.path.join(tmp, "crlf.js")
            with open(lf, "wb") as handle:
                handle.write(b"const a = 1;\nconst b = 2;\n")
            with open(crlf, "wb") as handle:
                handle.write(b"const a = 1;\r\nconst b = 2;\r\n")
            self.assertEqual(stamp.file_digest(lf), stamp.file_digest(crlf))

    def test_changing_asset_makes_check_fail_until_restamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            _write(tmp, "script.js", "const a=1;\n")
            _write(tmp, "index.html", '<script src="script.js"></script>\n')
            stamp.stamp_tree(tmp)
            self.assertEqual(stamp.check_tree(tmp), [])
            _write(tmp, "script.js", "const a=2;\n")
            self.assertEqual(stamp.check_tree(tmp), ["index.html"])
            stamp.stamp_tree(tmp)
            self.assertEqual(stamp.check_tree(tmp), [])


class RepoPin(unittest.TestCase):
    """The live pages must already carry hashes that match the files they load."""

    def test_checked_in_html_stamps_match_asset_bytes(self):
        stale = stamp.check_tree(REPO_ROOT)
        self.assertEqual(
            stale,
            [],
            "HTML asset stamps are stale. Run: python scripts/ci/stamp_asset_cache.py\n"
            "Offending files: %s" % ", ".join(stale),
        )

    def test_live_pages_reference_hashed_first_party_js(self):
        # The two files that already burned users when the CDN served last week's JS.
        index_path = os.path.join(REPO_ROOT, "index.html")
        tunes_path = os.path.join(REPO_ROOT, "tune-database.html")
        with open(index_path, encoding="utf-8") as handle:
            index = handle.read()
        with open(tunes_path, encoding="utf-8") as handle:
            tunes = handle.read()
        self.assertRegex(index, r'src="script\.js\?v=[0-9a-f]{%d}"' % stamp.HASH_LEN)
        self.assertRegex(
            tunes, r'src="tune-database\.js\?v=[0-9a-f]{%d}"' % stamp.HASH_LEN
        )


if __name__ == "__main__":
    unittest.main()
