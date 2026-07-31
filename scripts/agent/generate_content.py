#!/usr/bin/env python3
"""
Step 3 of the quadmath agent pipeline: the generator.

Consumes the ranked gap list emitted by scripts/agent/collect_signals.py,
picks ONE actionable gap, asks the Anthropic API to produce the fix, validates
the result against the same agent policy the CI gate enforces (loaded from
origin/main, never the working tree), then pushes a branch and opens a PR.

Hard rules, by design:
  * tune_gap rows are NEVER generated. The tune schema requires a real
    Betaflight CLI dump as source. A model inventing PIDs and calling it a
    CLI dump is data poisoning. These rows are reported and skipped.
  * gear_gap rows are skipped in v1. Affiliate links must be real referral
    URLs; prices/specs must come from a source, not a guess.
  * One gap -> one branch -> one PR. Small diffs, reviewable, under the
    gate's caps.
  * Everything the generator writes is validated locally against
    agent_policy.json BEFORE commit. If it would fail the gate, nothing is
    pushed.
  * The policy is read from origin/main via `git show`, same pattern as the
    gate itself, so a compromised working tree cannot loosen the rules.

stdlib only, except the API call which uses urllib. No pip deps.

Usage:
  export ANTHROPIC_API_KEY=...        # or present in .env already loaded
  export GITHUB_TOKEN=...             # repo scope, classic or fine-grained
  python3 scripts/agent/generate_content.py \
      --gaps ~/quadmath_gaps.json --root ~/quadmath [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096
GITHUB_API = "https://api.github.com"
POLICY_PATH = "scripts/ci/agent_policy.json"
ACTIONABLE = ("metadata_gap", "build_orphan")
SKIP_REASONS = {
    "tune_gap": "requires real Betaflight CLI dump -- human bench work, never generated",
    "gear_gap": "affiliate links/prices must be real, not generated -- human task",
    "open_issue": "triage is human work",
    "data_error": "collector input problem -- fix data, not content",
}
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}

# --------------------------------------------------------------------------
# shell helpers
# --------------------------------------------------------------------------


def run(root: str, *args: str, check: bool = True) -> str:
    proc = subprocess.run(
        args, cwd=root, capture_output=True, text=True, errors="replace"
    )
    if check and proc.returncode != 0:
        raise RuntimeError("command failed: %s\n%s" % (" ".join(args), proc.stderr.strip()))
    return proc.stdout


def git(root: str, *args: str, check: bool = True) -> str:
    return run(root, "git", *args, check=check)


# --------------------------------------------------------------------------
# policy (from origin/main -- never the working tree)
# --------------------------------------------------------------------------


def load_policy(root: str, ref: str) -> dict:
    raw = git(root, "show", "%s:%s" % (ref, POLICY_PATH))
    return json.loads(raw)


def _glob_to_re(pattern: str) -> re.Pattern:
    out = []
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == "*":
            if pattern[i : i + 2] == "**":
                out.append(".*")
                i += 2
                if i < len(pattern) and pattern[i] == "/":
                    i += 1
                continue
            out.append("[^/]*")
        elif ch in ".^$+{}[]()|\\":
            out.append("\\" + ch)
        else:
            out.append(ch)
        i += 1
    return re.compile("^" + "".join(out) + "$")


def path_allowed(path: str, policy: dict) -> tuple[bool, str]:
    for pat in policy.get("deny_paths", []):
        if _glob_to_re(pat).match(path):
            return False, "denied by %s" % pat
    for pat in policy.get("allow_paths", []):
        if _glob_to_re(pat).match(path):
            return True, "allowed by %s" % pat
    return False, "not on allowlist"


# --------------------------------------------------------------------------
# local validation mirroring the gate
# --------------------------------------------------------------------------

_SCRIPT_RE = re.compile(r"<script\b([^>]*)>", re.IGNORECASE)
_SRC_RE = re.compile(r"""src\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
_META_DESC_RE = re.compile(
    r"""<meta\s[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']+["']""",
    re.IGNORECASE,
)
_HREF_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def validate_html(path: str, text: str, policy: dict) -> list[str]:
    problems: list[str] = []
    checks = policy.get("html_checks", {})
    if not checks.get("enabled", True):
        return problems
    allowed_hosts = set(checks.get("allowed_script_src_hosts", []))
    for match in _SCRIPT_RE.finditer(text):
        attrs = match.group(1)
        src = _SRC_RE.search(attrs)
        if src is None:
            if checks.get("forbid_inline_script", True):
                problems.append("%s: inline <script> forbidden" % path)
        else:
            host = re.sub(r"^https?://", "", src.group(1)).split("/")[0]
            if checks.get("forbid_external_script_src", True) and host not in allowed_hosts:
                problems.append("%s: external script src %s not allowed" % (path, host))
    if checks.get("require_meta_description", True) and not _META_DESC_RE.search(text):
        problems.append("%s: missing <meta name=\"description\">" % path)
    link_checks = policy.get("link_checks", {})
    if link_checks.get("enabled", True):
        allowed_ext = set(link_checks.get("allowed_external_hosts", []))
        for match in _HREF_RE.finditer(text):
            url = match.group(1)
            if url.startswith(("http://", "https://")):
                host = re.sub(r"^https?://", "", url).split("/")[0]
                bare = host[4:] if host.startswith("www.") else host
                if host not in allowed_ext and bare not in allowed_ext:
                    problems.append("%s: external link host %s not allowed" % (path, host))
    return problems


def validate_diff_caps(files: dict[str, str], base_texts: dict[str, str], policy: dict) -> list[str]:
    problems: list[str] = []
    max_lines = int(policy.get("max_changed_lines", 200))
    max_files = int(policy.get("max_changed_files", 12))
    max_new = int(policy.get("max_new_files", 6))
    if len(files) > max_files:
        problems.append("too many changed files: %d > %d" % (len(files), max_files))
    new_files = [p for p in files if p not in base_texts]
    if len(new_files) > max_new:
        problems.append("too many new files: %d > %d" % (len(new_files), max_new))
    changed = 0
    for path, text in files.items():
        new_lines = text.splitlines()
        old_lines = base_texts.get(path, "").splitlines()
        if path in base_texts:
            old_set = set(old_lines)
            new_set = set(new_lines)
            changed += len([l for l in new_lines if l not in old_set])
            changed += len([l for l in old_lines if l not in new_set])
        else:
            changed += len(new_lines)
    if changed > max_lines:
        problems.append("diff too large: ~%d changed lines > %d cap" % (changed, max_lines))
    return problems


# --------------------------------------------------------------------------
# gap selection
# --------------------------------------------------------------------------


def pick_gap(rows: list[dict], policy: dict) -> tuple[dict | None, list[str]]:
    notes: list[str] = []
    candidates = []
    for r in rows:
        kind = r.get("type")
        if kind in SKIP_REASONS:
            notes.append("skip [%s] %s -- %s" % (kind, r.get("target"), SKIP_REASONS[kind]))
            continue
        if kind not in ACTIONABLE:
            notes.append("skip [%s] %s -- unknown type" % (kind, r.get("target")))
            continue
        if kind == "metadata_gap":
            ok, why = path_allowed(r.get("target", ""), policy)
            if not ok:
                notes.append(
                    "skip [metadata_gap] %s -- target %s (gate would block)"
                    % (r.get("target"), why)
                )
                continue
        candidates.append(r)
    candidates.sort(key=lambda r: SEVERITY_ORDER.get(r.get("severity"), 99))
    return (candidates[0] if candidates else None), notes


# --------------------------------------------------------------------------
# Anthropic API
# --------------------------------------------------------------------------


def call_api(api_key: str, system: str, user: str) -> str:
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": MAX_TOKENS,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
    ).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": API_VERSION,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())
    parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "".join(parts).strip()


SYSTEM_METADATA = """You edit HTML pages for quadmath.com, a whoop FPV build \
calculator and tune database. You will receive a full HTML file and an \
instruction describing missing metadata. Return ONLY the complete corrected \
HTML file. Do not add scripts, do not restructure, do not reword body copy. \
Change the minimum number of lines. Meta description: 140-160 chars, plain, \
specific to the page. OG tags mirror title/description; og:url uses \
https://quadmath.com/<page>. No markdown fences in your reply."""

SYSTEM_GUIDE = SYSTEM_GUIDE = """You write one HTML guide page for quadmath.com, a whoop FPV \
site (65-85mm builds, Betaflight). Audience: whoop pilots. Voice: terse, \
technical, no marketing fluff. Return ONLY a complete HTML file, no markdown \
fences. Hard constraints: total file under 170 lines; <link rel="stylesheet" \
href="/style.css"> for styling, ZERO <script> tags, ZERO inline styles beyond \
what is essential; must include <meta name="description"> (140-160 chars) and \
og:title/og:description/og:url; internal links ONLY from this exact set: \
"/" (the build calculator), "/tune-database.html", "/gear.html", \
"/sim.html" -- never "/calculator", never directory paths like \
"/content/guides/"; external links only to betaflight.com; mention ONLY the \
exact motor and prop named in the task -- no other model numbers, no \
substitute hardware; factual hardware claims only where certain -- prefer \
principles over invented specs; never state PID values, never invent \
prices."""


def generate_for_gap(gap: dict, base_read, api_key: str) -> dict[str, str]:
    kind = gap["type"]
    if kind == "metadata_gap":
        path = gap["target"]
        original = base_read(path)
        if original is None:
            raise RuntimeError("metadata_gap target %s not readable from base" % path)
        user = (
            "File: %s\nProblem: %s\n\nFull current file below. Return the "
            "complete corrected file.\n\n%s" % (path, gap["detail"], original)
        )
        fixed = call_api(api_key, SYSTEM_METADATA, user)
        return {path: _strip_fences(fixed)}
    if kind == "build_orphan":
        slug = re.sub(r"[^a-z0-9]+", "-", gap["target"].lower()).strip("-") or "guide"
        path = "content/guides/%s.html" % slug
        user = (
            "Write the guide page.\nTarget build/topic: %s\nWhy it is needed "
            "(collector detail): %s\nOutput path will be /%s so og:url is "
            "https://quadmath.com/%s" % (gap["target"], gap["detail"], path, path)
        )
        page = call_api(api_key, SYSTEM_GUIDE, user)
        return {path: _strip_fences(page)}
    raise RuntimeError("no generator for gap type %s" % kind)


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n", "", text)
        text = re.sub(r"\n```$", "", text)
    return text.strip() + "\n"


# --------------------------------------------------------------------------
# git + PR
# --------------------------------------------------------------------------


def remote_slug(root: str) -> str:
    url = git(root, "remote", "get-url", "origin").strip()
    m = re.search(r"github\.com[:/]+([^/]+/[^/.]+)", url)
    if not m:
        raise RuntimeError("cannot parse GitHub slug from remote: %s" % url)
    return m.group(1)


def branch_exists(root: str, name: str) -> bool:
    out = git(root, "ls-remote", "--heads", "origin", name)
    return bool(out.strip())


def open_pr(slug: str, token: str, head: str, base: str, title: str, body: str) -> str:
    payload = json.dumps({"title": title, "head": head, "base": base, "body": body}).encode()
    req = urllib.request.Request(
        "%s/repos/%s/pulls" % (GITHUB_API, slug),
        data=payload,
        headers={
            "authorization": "Bearer %s" % token,
            "accept": "application/vnd.github+json",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    return data.get("html_url", "(no url in response)")


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gaps", required=True, help="gap JSON from collect_signals.py")
    ap.add_argument("--root", required=True, help="path to quadmath clone")
    ap.add_argument("--ref", default="origin/main", help="base ref (default origin/main)")
    ap.add_argument("--base-branch", default="main")
    ap.add_argument("--dry-run", action="store_true", help="generate + validate, no push, no PR")
    args = ap.parse_args()
    root = os.path.abspath(os.path.expanduser(args.root))

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not api_key:
        sys.stderr.write("error: ANTHROPIC_API_KEY not set\n")
        return 2
    if not token and not args.dry_run:
        sys.stderr.write("error: GITHUB_TOKEN not set (or use --dry-run)\n")
        return 2

    git(root, "fetch", "origin")
    policy = load_policy(root, args.ref)

    with open(os.path.expanduser(args.gaps), "r", errors="replace") as fh:
        payload = json.load(fh)
    rows = payload.get("rows") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        sys.stderr.write("error: gaps file has no row list\n")
        return 2

    gap, notes = pick_gap(rows, policy)
    for note in notes:
        sys.stderr.write(note + "\n")
    if gap is None:
        sys.stderr.write("no actionable gaps -- nothing to do\n")
        return 0
    sys.stderr.write(
        "selected: [%s] %s %s -- %s\n"
        % (gap["severity"], gap["type"], gap["target"], gap["detail"])
    )

    def base_read(path: str) -> str | None:
        try:
            return git(root, "show", "%s:%s" % (args.ref, path))
        except RuntimeError:
            return None

    files = generate_for_gap(gap, base_read, api_key)

    # ---- validate against the gate before anything touches git ----
    problems: list[str] = []
    base_texts: dict[str, str] = {}
    for path in files:
        ok, why = path_allowed(path, policy)
        if not ok:
            problems.append("%s: %s" % (path, why))
        existing = base_read(path)
        if existing is not None:
            base_texts[path] = existing
    for path, text in files.items():
        if path.endswith(".html"):
            problems.extend(validate_html(path, text, policy))
    problems.extend(validate_diff_caps(files, base_texts, policy))
    if problems:
        for p in problems:
            sys.stderr.write("validation: %s\n" % p)
        sys.stderr.write("generated output would FAIL the gate -- aborting, nothing pushed\n")
        return 1
    sys.stderr.write("validation: clean (paths, html, caps)\n")

    if args.dry_run:
        for path, text in files.items():
            sys.stderr.write("--- %s (%d lines) ---\n" % (path, len(text.splitlines())))
            sys.stdout.write(text)
        sys.stderr.write("dry run -- no branch, no PR\n")
        return 0

    stamp = _dt.date.today().strftime("%Y%m%d")
    slug_bit = re.sub(r"[^a-z0-9]+", "-", gap["target"].lower()).strip("-")[:40]
    branch = "agent/%s-%s-%s" % (gap["type"], slug_bit, stamp)
    if branch_exists(root, branch):
        sys.stderr.write("branch %s already on remote -- skipping (already proposed)\n" % branch)
        return 0

    git(root, "checkout", "-B", branch, args.ref)
    for path, text in files.items():
        full = os.path.join(root, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as fh:
            fh.write(text)
        git(root, "add", path)
    title = "agent: %s -- %s" % (gap["type"], gap["target"])
    body = (
        "Automated PR from generate_content.py (step 3).\n\n"
        "Gap: `[%s] %s %s -- %s`\n\nModel: %s\n"
        "Validated locally against %s@%s: paths, HTML rules, diff caps -- clean.\n\n"
        "Note: sitemap.xml is gate-denied; if this adds a page, add it to the "
        "sitemap in a human PR.\n"
        % (gap["severity"], gap["type"], gap["target"], gap["detail"], MODEL, POLICY_PATH, args.ref)
    )
    git(root, "commit", "-m", title)
    git(root, "push", "-u", "origin", branch)
    url = open_pr(remote_slug(root), token, branch, args.base_branch, title, body)
    sys.stderr.write("PR opened: %s\n" % url)
    git(root, "checkout", args.base_branch, check=False)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as exc:
        sys.stderr.write("HTTP %s: %s\n" % (exc.code, exc.read().decode(errors="replace")[:500]))
        sys.exit(1)
    except RuntimeError as exc:
        sys.stderr.write("error: %s\n" % exc)
        sys.exit(1)
  
