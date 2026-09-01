#!/usr/bin/env python3
"""Stamp first-party JS/CSS URLs in HTML with a content-hash query string.

quadmath.com is GitHub Pages behind Cloudflare. HTML is Cache-Control
max-age=600 and Cloudflare-DYNAMIC; JS and CSS are max-age=14400. Script and
link tags without a version query keep serving the previous file for up to
four hours after a Pages deploy. That already shipped stale calculator JS
(address-bar rewrite after PR #88) and stale tune-database.js (filters
showing "0 of N tunes").

This rewrites only local first-party asset URLs: <script src>, <link href>,
ESM import specifiers, and import-map entries. Third-party hosts
(fonts.googleapis.com, cdn.jsdelivr.net, static.cloudflareinsights.com) are
left alone. Cloudflare TTL is not touched -- we cannot write that API.

Usage:
  python scripts/ci/stamp_asset_cache.py           # rewrite HTML in place
  python scripts/ci/stamp_asset_cache.py --check   # exit 1 if any HTML is stale
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

# Paths relative to the repo root, as they appear in HTML (with an optional
# leading ./ or /). Longer paths first so vendor/foo.js is not eaten by foo.js.
FIRST_PARTY_ASSETS = (
    "vendor/three.module.min.js",
    "tune-database.js",
    "quadphysics.js",
    "style.css",
    "script.js",
    "motion.js",
    "nav.js",
)

HASH_LEN = 12
SKIP_DIR_NAMES = {".git", "node_modules", "__pycache__"}

_ASSET_ALT = "|".join(re.escape(name) for name in FIRST_PARTY_ASSETS)
# Quoted local reference: "style.css", "./quadphysics.js", "/style.css",
# plus an optional existing ?v= stamp so re-running is idempotent.
QUOTED_REF = re.compile(
    r"(?P<q>['\"])(?P<lead>\.?/)?"
    r"(?P<asset>%s)"
    r"(?:\?v=[0-9a-f]*)?"
    r"(?P=q)" % _ASSET_ALT
)


def file_digest(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        digest.update(handle.read())
    return digest.hexdigest()[:HASH_LEN]


def asset_hashes(root: str) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for asset in FIRST_PARTY_ASSETS:
        path = os.path.join(root, asset.replace("/", os.sep))
        if os.path.isfile(path):
            hashes[asset] = file_digest(path)
    return hashes


def stamp_html_text(text: str, hashes: dict[str, str]) -> str:
    """Return HTML with first-party asset URLs stamped. Missing hashes are skipped."""

    def repl(match: re.Match[str]) -> str:
        asset = match.group("asset")
        digest = hashes.get(asset)
        if not digest:
            return match.group(0)
        lead = match.group("lead") or ""
        quote = match.group("q")
        return "%s%s%s?v=%s%s" % (quote, lead, asset, digest, quote)

    return QUOTED_REF.sub(repl, text)


def iter_html_paths(root: str) -> list[str]:
    found: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES]
        for name in filenames:
            if name.endswith(".html"):
                found.append(os.path.join(dirpath, name))
    found.sort()
    return found


def apply_to_html_map(root: str, files: dict[str, str]) -> dict[str, str]:
    """Stamp HTML strings (used by the content agent before it writes)."""
    hashes = asset_hashes(root)
    out: dict[str, str] = {}
    for path, text in files.items():
        if path.endswith(".html"):
            out[path] = stamp_html_text(text, hashes)
        else:
            out[path] = text
    return out


def stamp_tree(root: str) -> list[str]:
    """Rewrite HTML files on disk. Returns repo-relative paths that changed."""
    hashes = asset_hashes(root)
    changed: list[str] = []
    for full in iter_html_paths(root):
        with open(full, encoding="utf-8", newline="") as handle:
            original = handle.read()
        stamped = stamp_html_text(original, hashes)
        if stamped == original:
            continue
        with open(full, "w", encoding="utf-8", newline="") as handle:
            handle.write(stamped)
        changed.append(os.path.relpath(full, root).replace(os.sep, "/"))
    return changed


def check_tree(root: str) -> list[str]:
    """Return repo-relative HTML paths whose stamps do not match file contents."""
    hashes = asset_hashes(root)
    stale: list[str] = []
    for full in iter_html_paths(root):
        with open(full, encoding="utf-8", newline="") as handle:
            original = handle.read()
        if stamp_html_text(original, hashes) != original:
            stale.append(os.path.relpath(full, root).replace(os.sep, "/"))
    return stale


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--root",
        default=REPO_ROOT,
        help="repository root (default: inferred from this file)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if any HTML stamp is missing or stale; write nothing",
    )
    args = parser.parse_args(argv)
    root = os.path.abspath(os.path.expanduser(args.root))

    if args.check:
        stale = check_tree(root)
        if stale:
            sys.stderr.write(
                "stale first-party asset stamps (run scripts/ci/stamp_asset_cache.py):\n"
            )
            for path in stale:
                sys.stderr.write("  %s\n" % path)
            return 1
        print("asset cache stamps are current")
        return 0

    changed = stamp_tree(root)
    if not changed:
        print("no HTML changes")
        return 0
    print("stamped %d file(s):" % len(changed))
    for path in changed:
        print("  %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
