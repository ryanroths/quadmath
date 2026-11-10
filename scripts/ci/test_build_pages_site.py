"""Tests for the Pages file selection and its crawl.

The point of both scripts is that nothing can go missing from quadmath.com
unnoticed, so these pin the two ways that could happen: a rule that stops
matching a new file, and a reference to a file that was not published.
"""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import tempfile
import unittest

import build_pages_site as build
import check_pages_site as check

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class Classify(unittest.TestCase):
    def test_new_root_page_and_sim_module_publish_without_a_list_entry(self):
        for path in ("new-page.html", "sim-new-module.js", "new-style.css", "og-new.png"):
            self.assertEqual(build.classify(path), build.PUBLISH, path)

    def test_new_file_under_a_served_directory_publishes(self):
        for path in (
            "tracks/new.json",
            "ghosts/new.json",
            "audio/new.mp3",
            "assets/sim-new/kit.glb",
            "vendor/sim-core/airframes/new.json",
            "content/guides/new.html",
            "go/new-link/index.html",
            "data/bench/new.json",
        ):
            self.assertEqual(build.classify(path), build.PUBLISH, path)

    def test_repo_tooling_is_excluded(self):
        for path in (
            "tools/test_sim.mjs",
            "tools/fixtures/log.json.gz",
            "docs/sim-tricks.md",
            "scripts/ci/gen_sitemap.py",
            "workers/sim-rooms/src/index.js",
            ".github/workflows/pages.yml",
            "README.md",
            "fdm.py",
            "go_map.json",
            "_config.yml",
            "sim-tracks-test.mjs",
            ".gitignore",
        ):
            self.assertEqual(build.classify(path), build.EXCLUDE, path)

    def test_non_site_files_inside_a_served_directory_are_excluded(self):
        for path in ("audio/.gitkeep", "data/bench/README.md", "assets/fixtures/a.png", "assets/x.log"):
            self.assertEqual(build.classify(path), build.EXCLUDE, path)

    def test_unruled_paths_are_reported_not_dropped(self):
        for path in ("newdir/page.html", "site.webmanifest", "notes.mjs"):
            self.assertIsNone(build.classify(path), path)

    def test_every_file_in_this_repo_has_a_rule(self):
        unruled = [p for p in build.tracked_files(REPO) if build.classify(p) is None]
        self.assertEqual(unruled, [])

    def test_served_files_the_site_depends_on_are_published(self):
        tracked = build.tracked_files(REPO)
        for wanted in ("index.html", "sim.html", "CNAME", "robots.txt", "sitemap.xml"):
            self.assertIn(wanted, tracked)
            self.assertEqual(build.classify(wanted), build.PUBLISH, wanted)
        for folder in ("go/", "data/", "vendor/sim-core/", "tracks/", "ghosts/", "audio/"):
            self.assertTrue(
                any(p.startswith(folder) and build.classify(p) == build.PUBLISH for p in tracked),
                folder,
            )


class Build(unittest.TestCase):
    def repo(self, root: str, files: dict[str, bytes]) -> None:
        for rel, data in files.items():
            target = os.path.join(root, *rel.split("/"))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "wb") as fh:
                fh.write(data)
        subprocess.run(["git", "init", "-q", root], check=True)
        subprocess.run(["git", "-C", root, "add", "."], check=True)

    def test_copies_published_files_byte_for_byte_and_adds_nojekyll(self):
        with tempfile.TemporaryDirectory() as root:
            repo = os.path.join(root, "repo")
            out = os.path.join(root, "site")
            os.makedirs(repo)
            data = b"\xff\x00crlf\r\nkept"
            self.repo(repo, {"index.html": data, "assets/a.bin": data, "tools/t.mjs": b"x", "README.md": b"x"})
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(build.main(["--repo", repo, "--out", out]), 0)
            with open(os.path.join(out, "assets", "a.bin"), "rb") as fh:
                self.assertEqual(fh.read(), data)
            self.assertEqual(
                sorted(os.listdir(out)), [".nojekyll", "assets", "index.html"]
            )

    def test_unruled_file_stops_the_build(self):
        with tempfile.TemporaryDirectory() as root:
            repo = os.path.join(root, "repo")
            out = os.path.join(root, "site")
            os.makedirs(repo)
            self.repo(repo, {"index.html": b"", "newdir/page.html": b""})
            with contextlib.redirect_stderr(io.StringIO()) as err:
                self.assertEqual(build.main(["--repo", repo, "--out", out]), 1)
            self.assertIn("newdir/page.html", err.getvalue())
            self.assertFalse(os.path.exists(out))


class Crawl(unittest.TestCase):
    def crawl(self, files: dict[str, str]) -> check.Crawl:
        with tempfile.TemporaryDirectory() as root:
            for rel, text in files.items():
                target = os.path.join(root, *rel.split("/"))
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as fh:
                    fh.write(text)
            result = check.Crawl(check.Site(root))
            result.run([p for p in files if p.endswith(".html")])
        return result

    def test_clean_site_has_no_misses(self):
        result = self.crawl(
            {
                "index.html": '<script type="module" src="./a.js?v=1"></script>'
                '<link rel="stylesheet" href="style.css"><a href="/guides">x</a><a href="/go/x/">y</a>',
                "guides.html": "",
                "go/x/index.html": "",
                "style.css": "body{background:url('img/a.png')}",
                "img/a.png": "",
                "a.js": "import './b.js';fetch('tracks/t.json');",
                "b.js": "",
                "tracks/t.json": "{}",
            }
        )
        self.assertEqual(result.missing, {})

    def test_missing_html_reference_is_caught(self):
        result = self.crawl({"index.html": '<img src="assets/gone.png">'})
        self.assertIn("assets/gone.png", result.missing)

    def test_missing_module_import_is_caught(self):
        result = self.crawl(
            {"index.html": '<script type="module" src="a.js"></script>', "a.js": "import('./gone.js')"}
        )
        self.assertIn("gone.js", result.missing)

    def test_missing_fetched_file_is_caught(self):
        result = self.crawl(
            {"index.html": '<script src="a.js"></script>', "a.js": "fetch('tracks/gone.json')"}
        )
        self.assertIn("tracks/gone.json", result.missing)

    def test_runtime_built_path_needs_a_matching_file(self):
        ok = self.crawl(
            {
                "index.html": '<script src="a.js"></script>',
                "a.js": "const u = 'ghosts/' + id + '.json'; const v = `${T}/look_${n}.webp`;",
                "ghosts/a.json": "{}",
                "assets/tex/look_x.webp": "",
            }
        )
        self.assertEqual(ok.missing, {})
        gone = self.crawl(
            {"index.html": '<script src="a.js"></script>', "a.js": "const u = 'ghosts/' + id + '.json';"}
        )
        self.assertIn("ghosts/*", gone.missing)

    def test_import_map_targets_and_external_hosts(self):
        result = self.crawl(
            {
                "index.html": '<script type="importmap">{"imports":{"three":"./v/three.js",'
                '"three/addons/":"https://cdn.example/jsm/"}}</script>'
                '<script type="module">import * as T from "three";'
                'import("three/addons/GLTFLoader.js");</script>'
                '<a href="https://example.com/x.html">e</a>',
                "v/three.js": "",
            }
        )
        self.assertEqual(result.missing, {})

    def test_links_to_the_live_domain_count_as_local(self):
        result = self.crawl({"index.html": '<a href="https://quadmath.com/gone.html">x</a>'})
        self.assertIn("/gone.html", result.missing)

    def test_comments_are_not_references(self):
        result = self.crawl(
            {"index.html": '<script src="a.js"></script>', "a.js": "// 'tower.glb' is the format\n"}
        )
        self.assertEqual(result.missing, {})

    def test_main_exits_nonzero_on_a_miss(self):
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "index.html"), "w", encoding="utf-8") as fh:
                fh.write('<img src="gone.png">')
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(check.main([root]), 1)


if __name__ == "__main__":
    unittest.main()
