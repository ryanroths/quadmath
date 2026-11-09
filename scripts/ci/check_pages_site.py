#!/usr/bin/env python3
"""Crawl a built Pages site and fail if anything it references is missing.

Starts from every HTML page in the site, plus sitemap.xml and robots.txt, and
follows what a browser would:

  HTML    src, href, srcset, poster, <meta> image URLs, import maps, inline
          <script> and <style>
  CSS     url() and @import
  JS      import / export ... from, import(), new Worker(), importScripts()
  JS      any string literal shaped like a file path, for everything fetched by
          name: fetch('tracks/rig-loop.json'), { file: 'sedan.glb' }

Paths assembled at runtime are matched as patterns, and at least one published
file has to match:

  `${TEX}/look_${name}_${kind}_${res}.webp`   -> */look_*_*_*.webp
  'ghosts/track_' + legacy + '.json'          -> ghosts/track_*

URLs resolve the way GitHub Pages serves them: exact file, then foo.html for
/foo, then foo/index.html for /foo/. Links to https://quadmath.com/ count as
local; every other host is ignored.

Usage:
    python scripts/ci/check_pages_site.py _site
    python scripts/ci/check_pages_site.py _site --root index.html --report out.json
"""

from __future__ import annotations

import argparse
import fnmatch
import html
import json
import os
import posixpath
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

SITE_HOSTS = {"quadmath.com", "www.quadmath.com"}

EXTENSIONS = (
    "bin|css|gif|glb|gltf|hdr|html|ico|jpeg|jpg|js|json|ktx2|mjs|mp3|ogg|png|"
    "svg|txt|wasm|wav|webp|woff|woff2|xml"
)

# Whole-literal only, so a sentence that merely contains "style.css" is skipped.
PATH_LITERAL = re.compile(
    r"""(?<![\w$])(['"`])((?:\.{0,2}/)?[\w@%%~+\-./]*[\w@%%~+\-]\.(?:%s)(?:\?[^'"`\s]*)?)\1""" % EXTENSIONS
)
TEMPLATE_LITERAL = re.compile(
    r"`((?:[\w@%%~+\-./]|\$\{[^{}`]*\})*\$\{[^{}`]*\}(?:[\w@%%~+\-./]|\$\{[^{}`]*\})*\.(?:%s))`"
    % EXTENSIONS
)
CONCAT_PREFIX = re.compile(r"""(['"])((?:\.{0,2}/)?[\w\-.]+/[\w\-./]*)\1\s*\+""")
TOP_DIRS_ONLY = re.compile(r"^(?:\.{0,2}/)?(assets|audio|content|data|ghosts|go|tracks|vendor)/")

MODULE_REFS = [
    re.compile(r"""\bimport\s+(?:[\w$*{}\s,]+\sfrom\s*)?['"]([^'"\n]+)['"]"""),
    re.compile(r"""\bexport\s+[\w$*{}\s,]+\sfrom\s*['"]([^'"\n]+)['"]"""),
    re.compile(r"""\bimport\(\s*['"]([^'"\n]+)['"]"""),
    re.compile(r"""\bnew\s+Worker\(\s*['"]([^'"\n]+)['"]"""),
    re.compile(r"""\bimportScripts\(\s*['"]([^'"\n]+)['"]"""),
]
CSS_REFS = [
    re.compile(r"""url\(\s*['"]?([^'")\s]+)['"]?\s*\)"""),
    re.compile(r"""@import\s+['"]([^'"]+)['"]"""),
]
SITE_URL = re.compile(r"""https?://(?:www\.)?quadmath\.com(/[^\s"'<>)\\]*)""")

# Skip third-party bundles when looking for path-shaped literals; their strings
# are not addresses on this site. Their imports are still followed.
VENDORED_BUNDLES = ("vendor/three.", "vendor/blackbox-log.")

# String literals that look like paths and are not. Key: literal, or the
# pattern a runtime-built one turns into.
NOT_SITE_PATHS = {
    "quadmath-replay.png": "name given to a file the pilot downloads",
    "quadmath-blackbox-*.json": "name given to a file the pilot downloads",
}

# Full-line comments document paths; only code asks for them.
LINE_COMMENT = re.compile(r"^[ 	]*//.*$", re.M)


def is_external(ref: str) -> bool:
    parts = urlsplit(ref)
    if ref.startswith("//"):
        return parts.netloc.lower() not in SITE_HOSTS
    if parts.scheme in ("http", "https"):
        return parts.netloc.lower() not in SITE_HOSTS
    return bool(parts.scheme)


class Site:
    """The set of published files and the way Pages maps a URL onto them."""

    def __init__(self, root: str) -> None:
        self.root = root
        self.files: set[str] = set()
        for folder, _, names in os.walk(root):
            for name in names:
                rel = os.path.relpath(os.path.join(folder, name), root)
                self.files.add(rel.replace(os.sep, "/"))
        self.basenames = {posixpath.basename(p) for p in self.files}

    def lookup(self, rel: str) -> str | None:
        name = rel.strip("/")
        if name in ("", "."):
            candidates = ["index.html"]
        elif rel.endswith("/"):
            candidates = [name + "/index.html"]
        else:
            candidates = [name, name + ".html", name + "/index.html"]
        return next((c for c in candidates if c in self.files), None)

    def read(self, rel: str) -> str:
        with open(os.path.join(self.root, *rel.split("/")), encoding="utf-8", errors="replace") as fh:
            return fh.read()


def resolve(ref: str, base: str) -> str | None:
    """A reference as a site-relative path, or None for nothing to check."""
    ref = html.unescape(ref).strip()
    if not ref or ref[0] == "#" or ref.startswith("${") or is_external(ref):
        return None
    path = unquote(urlsplit(ref).path)
    if not path:
        return None
    if path.startswith("/"):
        return path
    trailing = "/" if path.endswith("/") else ""
    joined = posixpath.normpath(posixpath.join(base, path))
    return (joined + trailing).replace("//", "/")


class PageParser(HTMLParser):
    ATTRS = ("src", "href", "poster", "data-src", "data-href")
    SRCSETS = ("srcset", "imagesrcset", "data-srcset")

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[str] = []
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.import_map: dict[str, str] = {}
        self._open: tuple[str, str] | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        for name in self.ATTRS:
            if values.get(name):
                self.refs.append(values[name])
        for name in self.SRCSETS:
            if values.get(name):
                self.refs += [c.split()[0] for c in values[name].split(",") if c.strip()]
        if tag == "meta" and re.search(
            r"image|url$", (values.get("property") or values.get("name") or ""), re.I
        ):
            content = values.get("content") or ""
            if "/" in content or re.search(r"\.\w+$", content):
                self.refs.append(content)
        if values.get("style"):
            self.styles.append(values["style"])
        if tag in ("script", "style"):
            self._open = (tag, (values.get("type") or "").lower())
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._open:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag not in ("script", "style") or not self._open:
            return
        opened, kind = self._open
        self._open = None
        data = "".join(self._text)
        if opened == "style":
            self.styles.append(data)
        elif kind == "importmap":
            self.import_map.update(json.loads(data).get("imports", {}))
        elif kind != "application/ld+json":
            self.scripts.append(data)


class Crawl:
    def __init__(self, site: Site) -> None:
        self.site = site
        self.found: dict[str, set[str]] = {}
        self.missing: dict[str, set[str]] = {}
        self.patterns: dict[str, set[str]] = {}
        self.import_map: dict[str, str] = {}
        self.queue: list[str] = []
        self.seen: set[str] = set()

    def enqueue(self, rel: str) -> None:
        if rel not in self.seen:
            self.seen.add(rel)
            self.queue.append(rel)

    def hit(self, target: str, referrer: str) -> None:
        self.found.setdefault(target, set()).add(referrer)
        self.enqueue(target)

    def strict(self, ref: str, base: str, referrer: str) -> None:
        rel = resolve(ref, base)
        if rel is None:
            return
        target = self.site.lookup(rel)
        if target:
            self.hit(target, referrer)
        else:
            self.missing.setdefault(rel, set()).add(referrer)

    def site_urls(self, text: str, referrer: str) -> None:
        for path in SITE_URL.findall(html.unescape(text)):
            self.strict(path, "", referrer)

    def mapped_prefix(self, spec: str) -> str | None:
        for prefix in sorted(self.import_map, key=len, reverse=True):
            if spec == prefix or (prefix.endswith("/") and spec.startswith(prefix)):
                return prefix
        return None

    def module(self, spec: str, base: str, referrer: str) -> None:
        prefix = self.mapped_prefix(spec)
        if prefix is not None:
            self.strict(self.import_map[prefix] + spec[len(prefix):], "", referrer)
        elif spec.startswith((".", "/")) or re.match(r"https?:", spec):
            self.strict(spec, base, referrer)

    def literal(self, text: str, base: str, referrer: str) -> None:
        """A path-shaped string: page-relative, module-relative, or a bare name
        joined to a directory constant elsewhere in the module."""
        if text in NOT_SITE_PATHS or self.mapped_prefix(text) is not None:
            return
        path = unquote(urlsplit(text).path)
        stripped = path[2:] if path.startswith("./") else path
        for candidate in (posixpath.normpath(stripped), posixpath.normpath(posixpath.join(base, path))):
            target = self.site.lookup(candidate.lstrip("/"))
            if target:
                self.hit(target, referrer)
                return
        tail = stripped.lstrip("/")
        matches = sorted(p for p in self.site.files if p == tail or p.endswith("/" + tail))
        if matches:
            for match in matches:
                self.hit(match, referrer)
            return
        self.missing.setdefault(path, set()).add(referrer)

    def pattern(self, glob: str, referrer: str) -> None:
        if glob in NOT_SITE_PATHS:
            return
        self.patterns.setdefault(glob, set()).add(referrer)
        for path in sorted(self.site.files):
            if fnmatch.fnmatchcase(path, glob):
                self.hit(path, referrer)
                break
        else:
            self.missing.setdefault(glob, set()).add(referrer)

    def scan_js(self, text: str, base: str, referrer: str) -> None:
        text = LINE_COMMENT.sub("", text)
        for regex in MODULE_REFS:
            for spec in regex.findall(text):
                self.module(spec, base, referrer)
        if referrer.startswith(VENDORED_BUNDLES):
            return
        self.site_urls(text, referrer)
        for _, literal in PATH_LITERAL.findall(text):
            self.literal(literal, base, referrer)
        for template in TEMPLATE_LITERAL.findall(text):
            self.pattern(re.sub(r"\$\{[^{}`]*\}", "*", template).lstrip("./"), referrer)
        for _, prefix in CONCAT_PREFIX.findall(text):
            if TOP_DIRS_ONLY.match(prefix):
                self.pattern(prefix.lstrip("./") + "*", referrer)

    def scan_css(self, text: str, base: str, referrer: str) -> None:
        for regex in CSS_REFS:
            for ref in regex.findall(text):
                self.strict(ref, base, referrer)

    def scan_html(self, text: str, base: str, referrer: str) -> None:
        parser = PageParser()
        parser.feed(text)
        self.import_map.update(parser.import_map)
        for spec in parser.import_map.values():
            self.strict(spec, base, referrer)
        for ref in parser.refs:
            self.strict(ref, base, referrer)
        for css in parser.styles:
            self.scan_css(css, base, referrer)
        for js in parser.scripts:
            self.scan_js(js, base, referrer)
        self.site_urls(text, referrer)

    def run(self, roots: list[str]) -> None:
        for root in roots:
            self.enqueue(root)
        while self.queue:
            rel = self.queue.pop()
            base = posixpath.dirname(rel)
            suffix = posixpath.splitext(rel)[1].lower()
            if suffix == ".html":
                self.scan_html(self.site.read(rel), base, rel)
            elif suffix == ".css":
                self.scan_css(self.site.read(rel), base, rel)
            elif suffix in (".js", ".mjs"):
                self.scan_js(self.site.read(rel), base, rel)
            elif suffix == ".xml" or rel == "robots.txt":
                self.site_urls(self.site.read(rel), rel)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("site", help="built site directory")
    parser.add_argument("--root", action="append", help="crawl from this page only (repeatable)")
    parser.add_argument("--report", help="write the full crawl as JSON")
    args = parser.parse_args(argv)

    site = Site(args.site)
    # assets/ holds a third-party asset pack's own catalogue page; nothing links
    # to it and its preview images were never part of this repo.
    roots = args.root or sorted(
        p
        for p in site.files
        if (p.endswith(".html") and not p.startswith("assets/"))
        or p in ("sitemap.xml", "robots.txt")
    )
    crawl = Crawl(site)
    # Import maps live in the HTML, so read every page before following modules.
    html_first = sorted(roots, key=lambda p: not p.endswith(".html"))
    crawl.run(html_first)

    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "roots": roots,
                    "found": {k: sorted(v) for k, v in sorted(crawl.found.items())},
                    "missing": {k: sorted(v) for k, v in sorted(crawl.missing.items())},
                    "patterns": {k: sorted(v) for k, v in sorted(crawl.patterns.items())},
                },
                fh,
                indent=1,
            )

    print(
        f"crawled {len(crawl.seen)} files from {len(roots)} roots: "
        f"{len(crawl.found)} referenced targets found, {len(crawl.missing)} missing"
    )
    for target, referrers in sorted(crawl.missing.items()):
        print(f"::error::{target} is referenced but not published ({', '.join(sorted(referrers)[:3])})")
    return 1 if crawl.missing else 0


if __name__ == "__main__":
    sys.exit(main())
