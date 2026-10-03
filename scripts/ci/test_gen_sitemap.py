#!/usr/bin/env python3
"""Tests for scripts/ci/gen_sitemap.py.

    python -m unittest discover -s scripts/ci -p 'test_*.py'

The generator used to emit CRLF, so its --check matched only a Windows
checkout with core.autocrlf=true and could never pass on Linux CI or the Pi.
These pin the LF output and the EOL-blind comparison. They read git history
(CI checks out with fetch-depth 0) and write nothing.

There is deliberately no pin on the checked-in sitemap.xml: <lastmod> comes
from commit dates, and a squash merge can land on a later day than the branch
commit it replaces, so such a pin would fail for reasons no edit can fix.
"""

from __future__ import annotations

import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

_spec = importlib.util.spec_from_file_location(
    "gen_sitemap", os.path.join(HERE, "gen_sitemap.py")
)
gen_sitemap = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen_sitemap)


class LineEndings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # build() reads relative paths and shells out to git, so run it once
        # from the repo root -- it walks the history of every listed page.
        cwd = os.getcwd()
        os.chdir(REPO_ROOT)
        try:
            cls.built = gen_sitemap.build()
        finally:
            os.chdir(cwd)

    def test_build_emits_lf_only(self):
        self.assertNotIn("\r", self.built)
        self.assertTrue(self.built.endswith("</urlset>\n"))

    def test_crlf_copy_of_the_same_content_is_current(self):
        crlf = self.built.replace("\n", "\r\n")
        self.assertTrue(gen_sitemap.is_current(crlf, self.built))

    def test_lf_copy_is_current(self):
        self.assertTrue(gen_sitemap.is_current(self.built, self.built))

    def test_changed_content_is_stale(self):
        edited = self.built.replace("<lastmod>", "<lastmod>1", 1)
        self.assertNotEqual(edited, self.built)
        self.assertFalse(gen_sitemap.is_current(edited, self.built))

    def test_missing_file_is_stale(self):
        self.assertFalse(gen_sitemap.is_current(None, self.built))


if __name__ == "__main__":
    unittest.main()
