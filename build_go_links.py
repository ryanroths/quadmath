"""
build_go_links.py — trackable affiliate redirects for QuadMath.

Run from repo root (C:\\Users\\Risfo\\Claude Code\\files).

What it does:
  1. Scans *.html for affiliate hrefs (webleedfpv.com, bit.ly)
  2. Assigns a stable slug per unique destination
  3. Writes go/<slug>/index.html redirect stubs
  4. Rewrites hrefs to /go/<slug>/
  5. Adds rel="sponsored noopener" target="_blank"
  6. Writes go_map.json so slugs stay stable across runs

Dry run first:   python build_go_links.py
Apply changes:   python build_go_links.py --write
"""

import json
import os
import re
import sys
from urllib.parse import urlparse

REPO = os.path.dirname(os.path.abspath(__file__))
GO_DIR = os.path.join(REPO, "go")
MAP_FILE = os.path.join(REPO, "go_map.json")

AFFILIATE_HOSTS = ("webleedfpv.com", "bit.ly")

# Manual slug overrides — short, readable, stable.
OVERRIDES = {
    "https://bit.ly/4eY8Auy": "betafpv",
    "https://webleedfpv.com/products/betafpv-x-webleedfpv-air65-champion-edition-frame?bg_ref=9qGDmIxyuc": "wb-air65-frame",
    "https://webleedfpv.com/products/gemfan-props-31mm-1mm-shaft-1219s-3-blade?bg_ref=9qGDmIxyuc": "wb-gemfan-31mm",
    "https://webleedfpv.com/products/happymodel-se0702-brushless-motors-kv23000-or-kv26000?bg_ref=9qGDmIxyuc": "wb-hm-se0702",
    "https://webleedfpv.com/products/hdzero-aio5?bg_ref=9qGDmIxyuc": "wb-hdzero-aio5",
    "https://webleedfpv.com/products/hdzero-lux-camera?bg_ref=9qGDmIxyuc": "wb-hdzero-lux",
    "https://webleedfpv.com/products/mobula6-freestyle-hd-2024?bg_ref=9qGDmIxyuc": "wb-mobula6",
    "https://webleedfpv.com/products/radiomaster-tx16s-mkii-max-ag01-red-webleedfpv-edition?bg_ref=9qGDmIxyuc": "wb-tx16s",
    "https://webleedfpv.com/products/vci-0702-pro-lite-brushless-motor-set-30000kv-4-pcs-copy?bg_ref=9qGDmIxyuc": "wb-vci-0702-30k",
    "https://webleedfpv.com/products/webleedfpv-0702-40-000kv-skrrrt-1-5mm-w-knurled-shaft-design-set-of-4-motors?bg_ref=9qGDmIxyuc": "wb-skrrrt-0702-40k",
    "https://webleedfpv.com/products/webleedfpv-1-5mm-0702-32500kv?bg_ref=9qGDmIxyuc": "wb-0702-32k5",
    "https://webleedfpv.com/products/webleedfpv-1-5mm-0802-32-500kv-moefpv-treetoppers-w-knurled-shaft-design-set-of-4-motors?bg_ref=9qGDmIxyuc": "wb-treetopper-0802",
    "https://webleedfpv.com/products/webleedfpv-1-5mm-25-000kv-vs-w-knurled-shaft-design-set-of-4-motors?bg_ref=9qGDmIxyuc": "wb-vs-25k",
    # 1.5mm-shaft biblade — distinct from wb-gemfan-31mm, which is the 1mm-shaft
    # 1219S triblade. The 1.5mm shaft is what the SKRRRT motors take.
    "https://webleedfpv.com/products/special-edition-gemfan-props-31mm-1-5mm-2-blades?bg_ref=9qGDmIxyuc": "wb-gemfan-31mm-bi",
}

HREF_RE = re.compile(r'href="(https?://[^"]+)"')

STUB = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="description" content="Redirecting to the store page.">
<meta http-equiv="refresh" content="0;url={url}">
<link rel="canonical" href="{url}">
<title>Redirecting…</title>
<style>
  body {{
    background:#0D0E12; color:#8b8f9a; margin:0;
    font-family:'JetBrains Mono',ui-monospace,monospace;
    display:flex; align-items:center; justify-content:center;
    height:100vh; text-align:center;
  }}
  a {{ color:#FF4D1A; }}
</style>
</head>
<body>
<div>
  <p>Redirecting…</p>
  <p><a href="{url}">Continue</a></p>
</div>
</body>
</html>
"""


def slugify(url):
    if url in OVERRIDES:
        return OVERRIDES[url]
    p = urlparse(url)
    host = p.netloc.replace("www.", "").split(".")[0]
    tail = p.path.rstrip("/").split("/")[-1] or "home"
    tail = re.sub(r"[^a-z0-9]+", "-", tail.lower()).strip("-")
    # trim absurdly long product slugs
    parts = tail.split("-")
    if len(parts) > 6:
        tail = "-".join(parts[:6])
    return f"{host}-{tail}"


def load_map():
    if os.path.exists(MAP_FILE):
        with open(MAP_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def collect(html_files):
    urls = set()
    for path in html_files:
        with open(path, encoding="utf-8") as f:
            for m in HREF_RE.finditer(f.read()):
                u = m.group(1)
                if any(h in u for h in AFFILIATE_HOSTS):
                    urls.add(u)
    return sorted(urls)


def main():
    write = "--write" in sys.argv

    html_files = [
        os.path.join(REPO, f)
        for f in os.listdir(REPO)
        if f.endswith(".html")
    ]

    urls = collect(html_files)
    if not urls:
        print("No affiliate links found.")
        return

    mapping = load_map()
    used = set(mapping.values())

    for u in urls:
        if u in mapping:
            continue
        slug = slugify(u)
        base, n = slug, 2
        while slug in used:
            slug = f"{base}-{n}"
            n += 1
        mapping[u] = slug
        used.add(slug)

    print(f"{len(urls)} unique affiliate targets\n")
    for u in urls:
        print(f"  /go/{mapping[u]}/")
        print(f"      -> {u}")

    if not write:
        print("\nDry run. Re-run with --write to apply.")
        return

    # 1. write stubs
    os.makedirs(GO_DIR, exist_ok=True)
    for u, slug in mapping.items():
        d = os.path.join(GO_DIR, slug)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(STUB.format(url=u))

    # 2. rewrite hrefs
    total = 0
    for path in html_files:
        with open(path, encoding="utf-8") as f:
            src = f.read()
        out = src
        for u, slug in mapping.items():
            old = f'href="{u}"'
            new = f'href="/go/{slug}/" rel="sponsored noopener" target="_blank"'
            n = out.count(old)
            if n:
                out = out.replace(old, new)
                total += n
        if out != src:
            with open(path, "w", encoding="utf-8") as f:
                f.write(out)
            print(f"\nrewrote {os.path.basename(path)}")

    with open(MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2)

    print(f"\n{total} links rewritten")
    print(f"{len(mapping)} stubs in go/")
    print("go_map.json written — keeps slugs stable next run")


if __name__ == "__main__":
    main()
