#!/usr/bin/env python3
"""Regenerate sitemap.xml with <lastmod> dates taken from git history.

Why this exists: the hand-maintained sitemap drifted. Thirteen of fifteen
<lastmod> values were weeks stale and four URLs carried none at all, which is
worse than having no sitemap -- a stale lastmod affirmatively tells a crawler
nothing changed.

The one trap this script exists to avoid: scripts/ci/stamp_asset_cache.py
rewrites the ?v= cache-buster in every HTML file whenever style.css or
script.js moves. Commit e7bea11 touched eighteen files with one line each and
changed nothing a reader would notice. A naive `git log -1 --format=%ad` would
stamp all eighteen as freshly revised, which is inventing a freshness signal.
So we walk back through each file's history and skip any commit whose diff for
that file touches only ?v= lines.

<changefreq> and <priority> are deliberately not emitted. Google has stated it
ignores both.

Usage:
    python scripts/ci/gen_sitemap.py            # rewrite sitemap.xml
    python scripts/ci/gen_sitemap.py --check    # exit 1 if it would change
"""
import argparse
import io
import os
import subprocess
import sys

SITE = "https://quadmath.com"

# Deliberately excluded, with the reason, so nobody re-adds them:
#   404.html                  noindex, and it is the 404 response itself
#   station.html              <meta name="robots" content="noindex, nofollow">
#   go/*/index.html           affiliate stubs, all noindex,nofollow
#   tools|tunes|motors|guide|simulator.html    redirect stubs to real pages
#   googleb*.html             Search Console verification token
#   sim-promo-section.html    orphan fragment, no inbound links
#   assets/Overview.html      orphan asset-pack catalogue
PAGES = [
    ("index.html", "/"),
    ("guides.html", "/guides.html"),
    ("sim.html", "/sim.html"),
    ("blackbox.html", "/blackbox.html"),
    ("tune-database.html", "/tune-database.html"),
    ("bench.html", "/bench.html"),
    ("gear.html", "/gear.html"),
    ("hire.html", "/hire.html"),
]

GUIDE_DIR = "content/guides"


def run(args):
    out = subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if out.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed: {out.stderr.strip()}")
    return out.stdout


def is_stamp_only(sha, path):
    """True if this commit's diff for `path` touches only ?v= cache-buster lines."""
    diff = run(["git", "show", "--format=", "--unified=0", sha, "--", path])
    changed = [
        ln
        for ln in diff.splitlines()
        if (ln.startswith("+") or ln.startswith("-"))
        and not ln.startswith(("+++", "---"))
    ]
    if not changed:
        return False
    return all("?v=" in ln for ln in changed)


def last_meaningful_date(path):
    """Newest commit date for `path` whose change was not purely an asset stamp."""
    log = run(["git", "log", "--format=%H %ad", "--date=short", "--", path])
    lines = [ln for ln in log.splitlines() if ln.strip()]
    if not lines:
        return None
    for line in lines:
        sha, date = line.split(" ", 1)
        if not is_stamp_only(sha, path):
            return date.strip()
    # Every commit was a stamp: fall back to the oldest, which is the add.
    return lines[-1].split(" ", 1)[1].strip()


def build():
    entries = []
    for path, url in PAGES:
        if not os.path.exists(path):
            print(f"warning: {path} listed but missing on disk, skipped", file=sys.stderr)
            continue
        entries.append((SITE + url, last_meaningful_date(path)))

    guides = sorted(
        f for f in os.listdir(GUIDE_DIR) if f.endswith(".html")
    )
    for name in guides:
        path = f"{GUIDE_DIR}/{name}"
        entries.append((f"{SITE}/{path}", last_meaningful_date(path)))

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for loc, lastmod in entries:
        out.append("  <url>")
        out.append(f"    <loc>{loc}</loc>")
        if lastmod:
            out.append(f"    <lastmod>{lastmod}</lastmod>")
        out.append("  </url>")
    out.append("</urlset>")
    return "\r\n".join(out) + "\r\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="exit 1 if sitemap.xml is stale")
    args = ap.parse_args()

    new = build()
    try:
        old = io.open("sitemap.xml", "r", encoding="utf-8", newline="").read()
    except FileNotFoundError:
        old = None

    if args.check:
        if old != new:
            print("sitemap.xml is stale -- run: python scripts/ci/gen_sitemap.py")
            return 1
        print("sitemap.xml is current")
        return 0

    io.open("sitemap.xml", "w", encoding="utf-8", newline="").write(new)
    n = new.count("<loc>")
    print(f"sitemap.xml written: {n} urls" + ("" if old != new else " (unchanged)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
