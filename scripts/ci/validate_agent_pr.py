#!/usr/bin/env python3
"""CI gate for agent-authored pull requests.

Diffs merge-base(base, HEAD)...HEAD and enforces the policy in
scripts/ci/agent_policy.json: diff size caps, an allow/deny path list, HTML
hygiene, link resolution, and the tune JSON schema.

The policy is read from the *merge-base commit* via `git show`, never from the
working tree. Reading the head copy would let a pull request neuter its own
guardrails in the very commit CI is checking.

Violations are emitted as GitHub `::error::` annotations; exit status is 1 if
there was at least one.

Standard library only.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import posixpath
import re
import subprocess
import sys
from html.parser import HTMLParser

# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------

VIOLATIONS: list[str] = []


def _annotate(kind: str, message: str, path: str | None = None, line: int | None = None) -> None:
    props = []
    if path:
        props.append("file=" + path)
    if line:
        props.append("line=" + str(line))
    prefix = "::%s %s::" % (kind, ",".join(props)) if props else "::%s::" % kind
    print(prefix + message.replace("\n", " "))


def violation(message: str, path: str | None = None, line: int | None = None) -> None:
    VIOLATIONS.append(message)
    _annotate("error", message, path, line)


def notice(message: str) -> None:
    _annotate("notice", message)


# ---------------------------------------------------------------------------
# git
# ---------------------------------------------------------------------------


def git(*args: str, check: bool = True) -> str:
    proc = subprocess.run(
        ("git",) + args, capture_output=True, text=True, errors="replace"
    )
    if check and proc.returncode != 0:
        sys.stderr.write("git %s failed: %s\n" % (" ".join(args), proc.stderr.strip()))
        raise SystemExit(2)
    return proc.stdout


def git_ok(*args: str) -> tuple[bool, str]:
    proc = subprocess.run(
        ("git",) + args, capture_output=True, text=True, errors="replace"
    )
    return proc.returncode == 0, proc.stdout


# ---------------------------------------------------------------------------
# glob matching
# ---------------------------------------------------------------------------


def glob_to_regex(pattern: str) -> re.Pattern:
    """Translate a repo-root-anchored glob to a regex.

    `**` crosses directory separators, `*` and `?` do not. fnmatch is not
    usable here because its `*` happily eats `/`, which would make
    `data/tunes/*.json` match `data/tunes/nested/evil.json`.
    """
    out = ["^"]
    i = 0
    n = len(pattern)
    while i < n:
        char = pattern[i]
        if char == "*":
            if pattern.startswith("**/", i):
                out.append("(?:.*/)?")
                i += 3
                continue
            if pattern.startswith("**", i):
                out.append(".*")
                i += 2
                continue
            out.append("[^/]*")
        elif char == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(char))
        i += 1
    out.append("$")
    return re.compile("".join(out))


def matches_any(path: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        if glob_to_regex(pattern).match(path):
            return pattern
    return None


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

# Tags the HTML spec lets you leave unclosed. An unclosed one is not an error.
OPTIONAL_END_TAGS = {
    "p", "li", "td", "th", "tr", "dt", "dd", "option", "optgroup",
    "thead", "tbody", "tfoot", "colgroup", "rt", "rp", "head", "body", "html",
}

# Opening one of these implicitly closes an open <p>.
CLOSES_P = {
    "address", "article", "aside", "blockquote", "details", "div", "dl",
    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
    "h4", "h5", "h6", "header", "hgroup", "hr", "main", "menu", "nav", "ol",
    "p", "pre", "section", "table", "ul",
}

LINK_ATTRS = ("href", "src")
SCRIPT_SRC = "script-src"  # pseudo-attr marking a <script src>, judged separately
JSONLD_TYPE = "application/ld+json"  # the only inline script type ever exemptable
SKIP_SCHEMES = ("mailto:", "tel:", "data:", "javascript:", "sms:", "ftp:")


class PageParser(HTMLParser):
    """Tracks a tag stack and collects script tags, meta description and links."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.structure_errors: list[tuple[int, str]] = []
        self.inline_scripts: list[tuple[int, str]] = []  # line, raw body
        self.script_srcs: list[tuple[int, str]] = []
        self.meta_descriptions: list[str] = []
        self.links: list[tuple[int, str, str]] = []  # line, attr, url
        self.jsonld_blocks: list[tuple[int, str]] = []  # line, raw body
        self._ld_open: int | None = None
        self._ld_chunks: list[str] = []
        self._inline_open: int | None = None
        self._inline_chunks: list[str] = []

    # -- structure ---------------------------------------------------------

    def _line(self) -> int:
        return self.getpos()[0]

    def _pop_implied(self, tag: str) -> None:
        top = lambda: self.stack[-1][0] if self.stack else None
        if tag == "li":
            while top() == "li":
                self.stack.pop()
        elif tag in ("td", "th"):
            while top() in ("td", "th"):
                self.stack.pop()
        elif tag == "tr":
            while top() in ("td", "th", "tr"):
                self.stack.pop()
        elif tag in ("dt", "dd"):
            while top() in ("dt", "dd"):
                self.stack.pop()
        elif tag in ("thead", "tbody", "tfoot"):
            while top() in ("td", "th", "tr", "thead", "tbody", "tfoot"):
                self.stack.pop()
        elif tag in ("option", "optgroup"):
            while top() == "option":
                self.stack.pop()
        if tag in CLOSES_P:
            while top() == "p":
                self.stack.pop()

    def handle_starttag(self, tag, attrs):
        self._collect(tag, dict(attrs))
        if tag in VOID_TAGS:
            return
        self._pop_implied(tag)
        self.stack.append((tag, self._line()))

    def handle_startendtag(self, tag, attrs):
        # <div/> style self-closing: never pushed, so never unbalanced.
        self._collect(tag, dict(attrs))

    def handle_data(self, data):
        # HTMLParser switches to CDATA mode inside <script>, so this is the raw
        # body with no entity conversion -- which is what has to be hashed.
        if self._ld_open is not None:
            self._ld_chunks.append(data)
        elif self._inline_open is not None:
            self._inline_chunks.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._ld_open is not None:
            self.jsonld_blocks.append((self._ld_open, "".join(self._ld_chunks)))
            self._ld_open = None
            self._ld_chunks = []
        elif tag == "script" and self._inline_open is not None:
            self.inline_scripts.append((self._inline_open, "".join(self._inline_chunks)))
            self._inline_open = None
            self._inline_chunks = []
        if tag in VOID_TAGS:
            return
        open_names = [name for name, _ in self.stack]
        if tag not in open_names:
            self.structure_errors.append(
                (self._line(), "stray closing tag </%s> with no matching open tag" % tag)
            )
            return
        while self.stack[-1][0] != tag:
            name, opened_at = self.stack.pop()
            if name not in OPTIONAL_END_TAGS:
                self.structure_errors.append(
                    (
                        opened_at,
                        "unclosed tag <%s> (opened line %d, still open at </%s> on line %d)"
                        % (name, opened_at, tag, self._line()),
                    )
                )
        self.stack.pop()

    def close(self):
        super().close()
        # An unterminated <script> still has to be reported, not dropped.
        if self._inline_open is not None:
            self.inline_scripts.append((self._inline_open, "".join(self._inline_chunks)))
            self._inline_open = None
            self._inline_chunks = []
        for name, opened_at in self.stack:
            if name not in OPTIONAL_END_TAGS:
                self.structure_errors.append(
                    (opened_at, "unclosed tag <%s> (opened line %d, never closed)" % (name, opened_at))
                )
        self.stack = []

    # -- content -----------------------------------------------------------

    def _collect(self, tag: str, attrs: dict) -> None:
        line = self._line()
        if tag == "script":
            src = (attrs.get("src") or "").strip()
            if src:
                self.script_srcs.append((line, src))
                # Recorded under a distinct attr name so the generic link pass
                # does not re-judge it against the *page* host allowlist; the
                # script-host allowlist above is the authority for these.
                self.links.append((line, SCRIPT_SRC, src))
            elif (attrs.get("type") or "").strip().lower() == JSONLD_TYPE:
                # Recorded separately rather than as an inline script. Whether
                # that is an exemption or just a differently-worded violation is
                # check_html's call, driven by html_checks.allow_jsonld.
                self._ld_open = line
                self._ld_chunks = []
            else:
                # Body captured on the closing tag so it can be hashed against
                # html_checks.allow_inline_script_hashes.
                self._inline_open = line
                self._inline_chunks = []
            return
        if tag == "meta":
            if (attrs.get("name") or "").strip().lower() == "description":
                self.meta_descriptions.append((attrs.get("content") or "").strip())
        for attr in LINK_ATTRS:
            url = (attrs.get(attr) or "").strip()
            if url:
                self.links.append((line, attr, url))


def url_host(url: str) -> str:
    rest = url
    if "//" in rest:
        rest = rest.split("//", 1)[1]
    rest = rest.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    if "@" in rest:
        rest = rest.rsplit("@", 1)[1]
    if rest.startswith("["):  # IPv6 literal
        return rest.split("]", 1)[0].lstrip("[").lower()
    return rest.split(":", 1)[0].lower()


def host_allowed(host: str, allowed: list[str]) -> bool:
    for candidate in allowed:
        candidate = candidate.lower()
        if host == candidate or host.endswith("." + candidate):
            return True
    return False


def is_external(url: str) -> bool:
    return url.startswith("//") or bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url))


def inline_script_hash(body: str) -> str:
    """CSP-style `sha256-<base64>` for an inline script's text content.

    Two normalisations, and only two:

    * line endings are folded to LF. These files are CRLF in the working tree
      and LF in the object store, so without this the same script hashes two
      ways depending on where the check runs -- a check that passes on CI and
      fails on a maintainer's laptop is worse than no check.
    * leading and trailing whitespace is stripped, so reindenting a page does
      not break the build over a pinned script nobody touched.

    INTERNAL whitespace is left exactly as written. Collapsing it would let two
    different scripts hash the same, and the space between tokens is precisely
    where something could be slipped in.

    The tag and its attributes are not hashed -- only the body -- which matches
    what a CSP `script-src 'sha256-...'` covers. For a script whose source has
    no surrounding whitespace (the pinned one below is a single line inside its
    tags), the value here is byte-for-byte the value a browser computes, so it
    can be pasted straight into a real CSP header.
    """
    normalized = body.replace("\r\n", "\n").replace("\r", "\n").strip()
    digest = hashlib.sha256(normalized.encode("utf-8")).digest()
    return "sha256-" + base64.b64encode(digest).decode("ascii")


def check_html(path: str, text: str, policy: dict, tracked: set[str], repo_root: str) -> None:
    html_checks = policy.get("html_checks") or {}
    link_checks = policy.get("link_checks") or {}

    parser = PageParser()
    try:
        parser.feed(text)
        parser.close()
    except Exception as exc:  # a parse blowup is itself a failure
        violation("HTML: could not parse (%s)" % exc, path)
        return

    for line, message in sorted(parser.structure_errors):
        violation("HTML: " + message, path, line)

    if html_checks.get("forbid_inline_script", True):
        # Exact-content allowlist. The hash IS the identity: a pinned script can
        # keep its exemption only for as long as it stays character-for-character
        # what a human reviewed. One edit and it is an unknown script again.
        #
        # Deliberately NOT keyed on type or on filename. allow_jsonld can be,
        # because JSON-LD is inert data a browser never executes; these are
        # executable, and a per-type or per-file rule would exempt *any* inline
        # script in the blast radius -- the hole this check exists to close.
        # Absent key means an empty allowlist, so the blanket ban is the default.
        allowed_hashes = html_checks.get("allow_inline_script_hashes") or {}
        for line, body in parser.inline_scripts:
            digest = inline_script_hash(body)
            if digest in allowed_hashes:
                notice(
                    "%s:%d inline <script> allowed by pinned hash %s"
                    % (path, line, digest)
                )
                continue
            violation(
                "HTML: inline <script> is forbidden (computed %s). If this "
                "script is legitimate, a human reviewer can pin it by adding "
                "that hash to html_checks.allow_inline_script_hashes with a "
                "note on why it has to be inline." % digest,
                path,
                line,
            )
        # JSON-LD is the one inline script the SEO setup depends on, so it is
        # exemptable -- but only when it actually parses. An exemption that let
        # through a broken structured-data block would be worse than no
        # exemption, since search engines drop the whole block silently.
        if html_checks.get("allow_jsonld", True):
            for line, body in parser.jsonld_blocks:
                try:
                    json.loads(body)
                except json.JSONDecodeError as exc:
                    violation(
                        'HTML: <script type="%s"> does not contain valid JSON (%s)'
                        % (JSONLD_TYPE, exc),
                        path,
                        line,
                    )
        else:
            for line, _ in parser.jsonld_blocks:
                violation(
                    'HTML: inline <script> is forbidden (set html_checks.allow_jsonld '
                    'to permit <script type="%s">)' % JSONLD_TYPE,
                    path,
                    line,
                )

    allowed_hosts = html_checks.get("allowed_script_hosts") or []
    for line, src in parser.script_srcs:
        if is_external(src):
            host = url_host(src)
            if not host_allowed(host, allowed_hosts):
                violation(
                    "HTML: external script host %r is not allowed (allowed: %s)"
                    % (host, ", ".join(allowed_hosts) or "none"),
                    path,
                    line,
                )

    if html_checks.get("require_meta_description", True):
        if not parser.meta_descriptions:
            violation('HTML: missing <meta name="description">', path, 1)
        elif not any(parser.meta_descriptions):
            violation('HTML: <meta name="description"> has empty content', path, 1)

    external_allowed = link_checks.get("allowed_external_hosts") or []
    check_internal = link_checks.get("check_internal", True)
    for line, attr, url in parser.links:
        if url.startswith("#") or url.lower().startswith(SKIP_SCHEMES):
            continue
        if is_external(url):
            if attr == SCRIPT_SRC:
                continue  # already vetted against allowed_script_hosts
            host = url_host(url)
            if not host_allowed(host, external_allowed):
                violation(
                    "LINK: external host %r (%s=%r) is not in the allowed host list"
                    % (host, attr, url),
                    path,
                    line,
                )
            continue
        if not check_internal:
            continue
        target = url.split("#", 1)[0].split("?", 1)[0]
        if not target:
            continue
        if target.startswith("/"):
            resolved = posixpath.normpath(target.lstrip("/"))
        else:
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(path), target))
        if target.endswith("/") or resolved in (".", ""):
            resolved = posixpath.normpath(posixpath.join(resolved, "index.html"))
        if resolved.startswith(".."):
            violation(
                "LINK: internal link %r escapes the repository root" % url, path, line
            )
            continue
        if resolved in tracked or os.path.exists(os.path.join(repo_root, resolved)):
            continue
        violation(
            "LINK: internal link %r does not resolve on disk (looked for %s)"
            % (url, resolved),
            path,
            line,
        )


# ---------------------------------------------------------------------------
# tune schema
# ---------------------------------------------------------------------------


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_placeholder(value, placeholders: list[str]) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return True
        return stripped.upper() in {p.upper() for p in placeholders}
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def check_tune(path: str, tune: dict, schema: dict, label: str) -> None:
    def bad(message: str) -> None:
        violation("TUNE%s: %s" % (label, message), path, 1)

    placeholders = schema.get("placeholder_values") or ["TBD"]
    required = schema.get("required_fields") or []

    for field in required:
        if field not in tune:
            bad("missing required field %r" % field)
        elif is_placeholder(tune[field], placeholders):
            bad("field %r is a placeholder or empty (%r)" % (field, tune[field]))

    for field in schema.get("string_fields") or []:
        if field in tune and not isinstance(tune[field], str):
            bad("field %r must be a string, got %s" % (field, type(tune[field]).__name__))

    lo = schema.get("frame_size_mm_min", 50)
    hi = schema.get("frame_size_mm_max", 120)
    if "frame_size_mm" in tune:
        size = tune["frame_size_mm"]
        if not is_number(size):
            bad("frame_size_mm must be numeric, got %r" % (size,))
        elif not lo <= size <= hi:
            bad("frame_size_mm %s is outside the allowed range %s-%smm" % (size, lo, hi))

    if "motor_kv" in tune:
        kv = tune["motor_kv"]
        if not is_number(kv):
            bad("motor_kv must be numeric, got %r" % (kv,))
        elif kv <= 0:
            bad("motor_kv must be positive, got %r" % (kv,))

    rate_types = schema.get("rate_types") or []
    if "rate_type" in tune:
        rate_type = tune["rate_type"]
        if not isinstance(rate_type, str) or rate_type.strip().upper() not in {
            r.upper() for r in rate_types
        }:
            bad(
                "rate_type %r is not one of %s"
                % (rate_type, "/".join(rate_types))
            )

    needles = schema.get("source_must_contain_any") or []
    source = tune.get("source")
    if isinstance(source, str) and source.strip() and needles:
        lowered = source.lower()
        if not any(needle.lower() in lowered for needle in needles):
            bad(
                "source %r does not reference a verifiable origin (must contain one of: %s)"
                % (source, ", ".join(needles))
            )

    axes = schema.get("pid_axes") or ["roll", "pitch", "yaw"]
    terms = schema.get("pid_terms") or ["p", "i", "d"]
    pid_lo = schema.get("pid_min", 0)
    pid_hi = schema.get("pid_max", 255)
    pids = tune.get("pids")
    if pids is None:
        return
    if not isinstance(pids, dict):
        bad("pids must be an object keyed by axis, got %s" % type(pids).__name__)
        return
    for axis in axes:
        if axis not in pids:
            bad("pids is missing the %r axis" % axis)
            continue
        gains = pids[axis]
        if not isinstance(gains, dict):
            bad("pids.%s must be an object with %s, got %s" % (axis, "/".join(terms), type(gains).__name__))
            continue
        for term in terms:
            if term not in gains:
                bad("pids.%s is missing the %r term" % (axis, term))
                continue
            value = gains[term]
            if not is_number(value):
                bad("pids.%s.%s must be numeric, got %r" % (axis, term, value))
            elif not pid_lo <= value <= pid_hi:
                bad(
                    "pids.%s.%s value %s is outside the allowed range %s-%s"
                    % (axis, term, value, pid_lo, pid_hi)
                )


def check_tune_file(path: str, text: str, schema: dict) -> None:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        violation("TUNE: invalid JSON (%s)" % exc, path, getattr(exc, "lineno", 1))
        return
    if isinstance(data, dict) and isinstance(data.get("tunes"), list):
        data = data["tunes"]
    if isinstance(data, list):
        if not data:
            violation("TUNE: file contains no tunes", path, 1)
        for index, entry in enumerate(data):
            if isinstance(entry, dict):
                check_tune(path, entry, schema, "[%d]" % index)
            else:
                violation("TUNE[%d]: entry must be an object" % index, path, 1)
        return
    if not isinstance(data, dict):
        violation("TUNE: top level must be an object or a list of objects", path, 1)
        return
    check_tune(path, data, schema, "")


# ---------------------------------------------------------------------------
# diff
# ---------------------------------------------------------------------------


def parse_name_status(raw: str) -> list[tuple[str, str]]:
    fields = [f for f in raw.split("\0") if f != ""]
    entries = []
    for index in range(0, len(fields) - 1, 2):
        entries.append((fields[index][0], fields[index + 1]))
    return entries


def parse_numstat(raw: str) -> dict[str, tuple[int, int]]:
    stats: dict[str, tuple[int, int]] = {}
    for record in raw.split("\0"):
        if not record.strip():
            continue
        parts = record.split("\t")
        if len(parts) < 3:
            continue
        added, deleted, path = parts[0], parts[1], parts[2]
        stats[path] = (
            0 if added == "-" else int(added),
            0 if deleted == "-" else int(deleted),
        )
    return stats


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def resolve_commit(ref: str) -> str | None:
    """Resolve a ref to a commit sha, or None if it does not resolve."""
    ok, raw = git_ok("rev-parse", "--verify", "%s^{commit}" % ref)
    return raw.strip() if ok and raw.strip() else None


def load_base_policy(base_tip_sha: str, policy_path: str) -> dict | None:
    """Load the policy from the tip of the base branch.

    Deliberately the base *tip*, not the merge base: the merge base is where
    the pull request forked, so a long-lived branch would be judged by whatever
    policy existed back then and would be grandfathered past any tightening
    since. The tip is the rules in force now.

    Either way the commit is unreachable from the pull request, which is the
    property that matters -- reading the head copy would let a PR relax the
    guardrails in the same commit CI is checking.

    `base_tip_sha` must already be a resolved commit sha (see resolve_commit).
    That is what makes the None below unambiguous: the commit exists, so a
    failed read means the policy is genuinely absent from it, not that a ref
    failed to resolve. Conflating those would let a fetch problem silently
    downgrade the gate to the skip-enforcement path.
    """
    ok, raw = git_ok("show", "%s:%s" % (base_tip_sha, policy_path))
    if not ok:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        violation(
            "POLICY: %s at base commit %s is not valid JSON (%s)"
            % (policy_path, base_sha[:12], exc)
        )
        return {}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/main", help="base ref (default: origin/main)")
    parser.add_argument("--head", default="HEAD", help="head ref (default: HEAD)")
    parser.add_argument(
        "--policy",
        default="scripts/ci/agent_policy.json",
        help="repo-relative path to the policy file (default: scripts/ci/agent_policy.json)",
    )
    args = parser.parse_args(argv)

    repo_root = git("rev-parse", "--show-toplevel").strip()

    # Resolve the base ref before anything else. An unresolvable base is a CI
    # misconfiguration (shallow clone, unfetched branch), never a green build:
    # hard-fail rather than fall through to the skip-enforcement path.
    base_tip_sha = resolve_commit(args.base)
    if base_tip_sha is None:
        sys.stderr.write(
            "::error::base ref %r does not resolve to a commit; the gate cannot "
            "run. Check that the base branch was fetched (fetch-depth: 0).\n"
            % args.base
        )
        return 2

    ok, raw_base = git_ok("merge-base", args.base, args.head)
    if not ok or not raw_base.strip():
        sys.stderr.write(
            "::error::could not find a merge base between %r and %r\n" % (args.base, args.head)
        )
        return 2
    base_sha = raw_base.strip()
    head_sha = git("rev-parse", args.head).strip()
    print("Base ref %s -> tip %s, merge-base %s" % (args.base, base_tip_sha[:12], base_sha[:12]))
    print("Head %s -> %s" % (args.head, head_sha[:12]))

    policy = load_base_policy(base_tip_sha, args.policy)
    if policy is None:
        notice(
            "%s does not exist at the tip of %s (%s); treating this as the "
            "bootstrap PR that introduces the gate and skipping enforcement."
            % (args.policy, args.base, base_tip_sha[:12])
        )
        return 0
    print(
        "Policy loaded from %s:%s (tip of %s, not the working tree)"
        % (base_tip_sha[:12], args.policy, args.base)
    )

    entries = parse_name_status(
        git("diff", "--no-renames", "-z", "--name-status", base_sha, head_sha)
    )
    stats = parse_numstat(git("diff", "--no-renames", "-z", "--numstat", base_sha, head_sha))

    if not entries:
        print("No changes between merge base and head.")
        return 0

    allow_paths = policy.get("allow_paths") or []
    deny_paths = policy.get("deny_paths") or []
    max_lines = policy.get("max_changed_lines")
    max_files = policy.get("max_changed_files")
    max_new = policy.get("max_new_files")

    total_lines = sum(added + deleted for added, deleted in stats.values())
    new_files = [path for status, path in entries if status == "A"]
    deleted_files = [path for status, path in entries if status == "D"]

    print(
        "Changed files: %d | changed lines: %d | new files: %d | deleted files: %d"
        % (len(entries), total_lines, len(new_files), len(deleted_files))
    )

    # -- diff size caps ----------------------------------------------------
    if isinstance(max_lines, int) and total_lines > max_lines:
        violation(
            "DIFF CAP: %d changed lines exceeds max_changed_lines=%d"
            % (total_lines, max_lines)
        )
    if isinstance(max_files, int) and len(entries) > max_files:
        violation(
            "DIFF CAP: %d changed files exceeds max_changed_files=%d"
            % (len(entries), max_files)
        )
    if isinstance(max_new, int) and len(new_files) > max_new:
        violation(
            "DIFF CAP: %d new files exceeds max_new_files=%d" % (len(new_files), max_new)
        )

    # -- deletion guard ----------------------------------------------------
    for path in deleted_files:
        violation(
            "FILE DELETED: agent-authored pull requests may not delete files; "
            "restore %s or add the human-override label" % path,
            path,
        )

    # -- path allow / deny -------------------------------------------------
    # deny wins over allow, unconditionally.
    inspectable: list[str] = []
    for status, path in entries:
        denied_by = matches_any(path, deny_paths)
        if denied_by:
            violation(
                "DENIED PATH: %s matches deny pattern %r (deny overrides allow)"
                % (path, denied_by),
                path,
            )
            continue
        if not matches_any(path, allow_paths):
            violation(
                "PATH NOT ALLOWED: %s does not match any allow_paths pattern" % path,
                path,
            )
            continue
        if status != "D":
            inspectable.append(path)

    # -- content checks ----------------------------------------------------
    tracked = {
        line for line in git("ls-tree", "-r", "--name-only", head_sha).splitlines() if line
    }
    tune_schema = policy.get("tune_schema") or {}

    for path in inspectable:
        ok, text = git_ok("show", "%s:%s" % (head_sha, path))
        if not ok:
            violation("could not read %s from %s" % (path, head_sha[:12]), path)
            continue
        if path.endswith(".html"):
            check_html(path, text, policy, tracked, repo_root)
        elif path.startswith("data/tunes/") and path.endswith(".json"):
            check_tune_file(path, text, tune_schema)
        elif path.endswith(".json"):
            try:
                json.loads(text)
            except json.JSONDecodeError as exc:
                violation("invalid JSON (%s)" % exc, path, getattr(exc, "lineno", 1))

    # -- verdict -----------------------------------------------------------
    if VIOLATIONS:
        print(
            "\nAgent PR gate FAILED with %d violation(s). Fix them, or have a "
            "human reviewer add the 'human-override' label." % len(VIOLATIONS)
        )
        return 1
    print("\nAgent PR gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
