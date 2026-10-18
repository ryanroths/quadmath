#!/usr/bin/env python3
"""Stamp first-party JS/CSS URLs in HTML and JS with a content-hash query string.

quadmath.com is GitHub Pages behind Cloudflare. HTML is Cache-Control
max-age=600 and Cloudflare-DYNAMIC; JS and CSS are max-age=14400. Script and
link tags without a version query keep serving the previous file for up to
four hours after a Pages deploy. That already shipped stale calculator JS
(address-bar rewrite after PR #88) and stale tune-database.js (filters
showing "0 of N tunes"). Module-to-module imports (sim-maps.js -> sim-room.js,
sim-whoop.js -> sim-build.js) have the same hole: the browser caches the
unversioned specifier and can mix two deploys.

This rewrites only local first-party asset URLs: <script src>, <link href>,
ESM import specifiers in HTML and in first-party .js, and import-map entries.
Third-party hosts (fonts.googleapis.com, cdn.jsdelivr.net,
static.cloudflareinsights.com) are left alone. Cloudflare TTL is not touched
-- we cannot write that API.

Usage:
  python scripts/ci/stamp_asset_cache.py           # rewrite HTML/JS in place
  python scripts/ci/stamp_asset_cache.py --check   # exit 1 if any stamp is stale
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
    "sim-feel.js",
    "sim-build.js",
    "sim-whoop.js",
    "sim-looks.js",
    "sim-art.js",
    "sim-art-city.js",
    "sim-art-living.js",
    "sim-art-garage.js",
    "sim-secrets.js",
    "sim-maps.js",
    "sim-tracks.js",
    "sim-room.js",
    "sim-coach.js",
    "sim-retention.js",
    "sim-touch.js",
    "sim-3d.js",
    "style.css",
    "script.js",
    "motion.js",
    "contact.js",
    "nav.js",
)

HASH_LEN = 12
# .claude holds Claude Code worktrees: full checkouts of other branches whose
# pages must never be stamped or checked against this tree.
# betaflight/ is the gitignored local SITL clone -- never part of the site, and
# its vendored Release_Notes.html files are cp1252, which used to abort the walk.
SKIP_DIR_NAMES = {".git", ".claude", "node_modules", "__pycache__", "betaflight"}

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
    """Content hash of an asset, independent of line endings.

    The repo stores LF and CI checks out LF, but a Windows clone with
    core.autocrlf materialises CRLF in the working tree. Hashing raw bytes
    there produced stamps that CI (hashing LF bytes) rejected as stale, so
    every asset is normalised to LF before hashing. Pages served from a
    Linux deploy are LF anyway, so the stamp still tracks what ships.
    """
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        digest.update(handle.read().replace(b"\r\n", b"\n"))
    return digest.hexdigest()[:HASH_LEN]


def asset_hashes(root: str) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for asset in FIRST_PARTY_ASSETS:
        path = os.path.join(root, asset.replace("/", os.sep))
        if os.path.isfile(path):
            hashes[asset] = file_digest(path)
    return hashes


def stamp_html_text(text: str, hashes: dict[str, str]) -> str:
    """Return text with first-party asset URLs stamped. Missing hashes are skipped.

    Used for HTML and for first-party JS (relative ESM imports).
    """

    def repl(match: re.Match[str]) -> str:
        asset = match.group("asset")
        digest = hashes.get(asset)
        if not digest:
            return match.group(0)
        lead = match.group("lead") or ""
        quote = match.group("q")
        return "%s%s%s?v=%s%s" % (quote, lead, asset, digest, quote)

    return QUOTED_REF.sub(repl, text)


def text_digest(text: str) -> str:
    """Same as file_digest, for an in-memory UTF-8 string."""
    data = text.replace("\r\n", "\n").encode("utf-8")
    return hashlib.sha256(data).hexdigest()[:HASH_LEN]


def iter_html_paths(root: str) -> list[str]:
    found: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES]
        for name in filenames:
            if name.endswith(".html"):
                found.append(os.path.join(dirpath, name))
    found.sort()
    return found


def iter_js_asset_paths(root: str) -> list[str]:
    """First-party JS we rewrite so relative imports carry ?v= stamps.

    vendor/ bundles are hashed for HTML import-maps but never rewritten.
    """
    found: list[str] = []
    for asset in FIRST_PARTY_ASSETS:
        if not asset.endswith(".js") or asset.startswith("vendor/"):
            continue
        path = os.path.join(root, asset.replace("/", os.sep))
        if os.path.isfile(path):
            found.append(path)
    found.sort()
    return found


def iter_stamp_paths(root: str) -> list[str]:
    return iter_html_paths(root) + iter_js_asset_paths(root)


def _rel(root: str, full: str) -> str:
    return os.path.relpath(full, root).replace(os.sep, "/")


def load_stampable(root: str) -> dict[str, str]:
    files: dict[str, str] = {}
    for full in iter_stamp_paths(root):
        original = _read_utf8(full)
        if original is None:
            continue
        files[_rel(root, full)] = original
    return files


def hashes_for_texts(root: str, texts: dict[str, str]) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for asset in FIRST_PARTY_ASSETS:
        if asset in texts:
            hashes[asset] = text_digest(texts[asset])
            continue
        path = os.path.join(root, asset.replace("/", os.sep))
        if os.path.isfile(path):
            hashes[asset] = file_digest(path)
    return hashes


def stamp_texts(root: str, files: dict[str, str]) -> dict[str, str]:
    """Fixpoint-stamp HTML + first-party JS. Import hashes follow stamped bytes."""
    current = dict(files)
    for _ in range(8):
        hashes = hashes_for_texts(root, current)
        nxt = {path: stamp_html_text(text, hashes) for path, text in current.items()}
        if nxt == current:
            return nxt
        current = nxt
    return current


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


def _read_utf8(full: str):
    """Read an HTML file, or None if it is not UTF-8.

    Returning None rather than raising matters because ingest_tunes.py calls
    stamp_tree() after `git add` and before `commit`: an abort mid-walk leaves
    a dirty branch with staged changes and no commit.
    """
    try:
        with open(full, encoding="utf-8", newline="") as handle:
            return handle.read()
    except UnicodeDecodeError:
        print("warning: %s is not UTF-8, skipped" % full, file=sys.stderr)
        return None


def stamp_tree(root: str) -> list[str]:
    """Rewrite HTML and first-party JS on disk. Returns repo-relative paths that changed."""
    original = load_stampable(root)
    stamped = stamp_texts(root, original)
    changed: list[str] = []
    for rel, text in stamped.items():
        if text == original.get(rel):
            continue
        full = os.path.join(root, rel.replace("/", os.sep))
        with open(full, "w", encoding="utf-8", newline="") as handle:
            handle.write(text)
        changed.append(rel)
    return changed


def check_tree(root: str) -> list[str]:
    """Return repo-relative HTML/JS paths whose stamps do not match file contents."""
    original = load_stampable(root)
    stamped = stamp_texts(root, original)
    return sorted(rel for rel, text in original.items() if stamped.get(rel) != text)


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
        help="exit 1 if any HTML or JS stamp is missing or stale; write nothing",
    )
    args = parser.parse_args(argv)
    root = os.path.abspath(os.path.expanduser(args.root))

    if args.check:
        stale = check_tree(root)
        if stale:
            sys.stderr.write(
                "stale first-party asset stamps in HTML/JS (run scripts/ci/stamp_asset_cache.py):\n"
            )
            for path in stale:
                sys.stderr.write("  %s\n" % path)
            return 1
        print("asset cache stamps are current")
        return 0

    changed = stamp_tree(root)
    if not changed:
        print("no HTML/JS changes")
        return 0
    print("stamped %d file(s):" % len(changed))
    for path in changed:
        print("  %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
