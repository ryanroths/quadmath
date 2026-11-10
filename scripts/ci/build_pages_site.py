#!/usr/bin/env python3
"""Build the directory GitHub Pages publishes for quadmath.com.

Every tracked file is sorted into published or excluded by the rules below. A
tracked file that no rule covers fails the build instead of quietly staying off
the site, so nothing can drop out of the deploy unnoticed:

  * a new page or sim module at the repo root matches by suffix
  * a new file under a published directory comes along with that directory
  * a new top-level directory, or a root file of a kind nobody has ruled on,
    stops the build until someone adds it to one list or the other

Files are copied byte for byte. Nothing is rendered or stamped here: the ?v=
cache-busters are already committed in the HTML and JS by stamp_asset_cache.py,
and the URLs they sit on must not move.

.nojekyll is written into the output only. Do not commit one to the repo root:
while Pages still builds from the branch, _config.yml's exclude list is what
keeps tools/, scripts/ and workers/ off the site, and .nojekyll turns that off.

Usage:
    python scripts/ci/build_pages_site.py --out _site
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import PurePosixPath

PUBLISH = "publish"
EXCLUDE = "exclude"

# Whole directories the site is served from. go/ is the affiliate short links
# gear.html and the guides point at; data/ is the bench records.
PUBLISH_DIRS = {
    "assets",
    "audio",
    "content",
    "data",
    "ghosts",
    "go",
    "tracks",
    "vendor",
}

EXCLUDE_DIRS = {".cursor", ".github", "docs", "scripts", "tools", "workers"}

ROOT_PUBLISH_SUFFIXES = {
    ".css",
    ".gif",
    ".html",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".png",
    ".svg",
    ".webp",
}

# SIM-NOTICE.txt is named in the GPL header of every sim module and points at
# ASSETS-LICENSES.md for the art credits, so both stay reachable.
ROOT_PUBLISH_NAMES = {
    "ASSETS-LICENSES.md",
    "CNAME",
    "SIM-NOTICE.txt",
    "robots.txt",
    "sitemap.xml",
}

ROOT_EXCLUDE_SUFFIXES = {".md", ".py"}

ROOT_EXCLUDE_NAMES = {"_config.yml", "go_map.json", "sim-tracks-test.mjs"}

# Never served, even from inside a published directory.
EXCLUDE_DIR_NAMES = {"fixtures"}
EXCLUDE_SUFFIXES = {".log", ".md"}


def classify(path: str) -> str | None:
    """Return PUBLISH or EXCLUDE for a tracked path, None if no rule covers it."""
    parts = path.split("/")
    name = parts[-1]
    suffix = PurePosixPath(name).suffix.lower()

    if len(parts) == 1:
        if name in ROOT_PUBLISH_NAMES:
            return PUBLISH
        if name.startswith(".") or name in ROOT_EXCLUDE_NAMES:
            return EXCLUDE
        if suffix in ROOT_EXCLUDE_SUFFIXES:
            return EXCLUDE
        if suffix in ROOT_PUBLISH_SUFFIXES:
            return PUBLISH
        return None

    if parts[0] in EXCLUDE_DIRS:
        return EXCLUDE
    if parts[0] not in PUBLISH_DIRS:
        return None
    if any(p.startswith(".") or p in EXCLUDE_DIR_NAMES for p in parts):
        return EXCLUDE
    if suffix in EXCLUDE_SUFFIXES:
        return EXCLUDE
    return PUBLISH


def tracked_files(repo: str) -> list[str]:
    out = subprocess.run(
        ["git", "-C", repo, "ls-files", "-z"],
        capture_output=True,
        check=True,
    ).stdout
    return sorted(p.decode("utf-8") for p in out.split(b"\0") if p)


def build(repo: str, out: str, files: list[str]) -> tuple[int, int]:
    """Copy the published files into `out`. Returns (file count, total bytes)."""
    count = total = 0
    for path in files:
        if classify(path) != PUBLISH:
            continue
        target = os.path.join(out, *path.split("/"))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(os.path.join(repo, *path.split("/")), target)
        count += 1
        total += os.path.getsize(target)
    with open(os.path.join(out, ".nojekyll"), "wb"):
        pass
    return count + 1, total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True, help="output directory (must not exist)")
    parser.add_argument("--repo", default=".", help="repository root (default: .)")
    args = parser.parse_args(argv)

    files = tracked_files(args.repo)
    unruled = [p for p in files if classify(p) is None]
    if unruled:
        for path in unruled:
            print(f"::error file={path}::no publish rule covers this file", file=sys.stderr)
        print(
            f"{len(unruled)} tracked file(s) have no rule. Add each to a publish or "
            "exclude list in scripts/ci/build_pages_site.py, so it cannot go missing "
            "from quadmath.com unnoticed.",
            file=sys.stderr,
        )
        return 1

    if os.path.exists(args.out):
        print(f"{args.out} already exists; refusing to mix it into the site", file=sys.stderr)
        return 1
    os.makedirs(args.out)

    count, total = build(args.repo, args.out, files)
    print(
        f"published {count} files, {total} bytes, to {args.out}; "
        f"excluded {sum(classify(p) == EXCLUDE for p in files)} tracked files"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
