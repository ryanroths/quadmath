#!/usr/bin/env python3
"""Collect a ranked content-gap list for the QuadMath site.

Scans the repository and emits `signals.json`: rows of {type, target, detail,
severity} describing work a later generator step can pick up. No LLM, no
network, no third-party dependencies, and nothing is ever written into the
repository tree.

Deterministic: same input revision, same output bytes. There is no timestamp in
the output and every collection iterates sorted keys.


WHY SOURCES ARE READ FROM A GIT REF, NOT THE WORKING TREE
---------------------------------------------------------
By default every source file is read with `git show <ref>:<path>` (default ref
`origin/main`), never from disk. The reason is a feedback loop, not tidiness.

`gear.html` and `data/gear/*.json` are both on the agent gate's allow list. If
the collector read them from the working tree, an agent could add a gear entry,
manufacture a tune-coverage gap, and then assign itself the work of filling the
gap it just invented -- a loop with no damping. Reading from a ref the pull
request cannot have modified breaks that cycle for every source at once, rather
than for whichever source we happened to think of.

Note that moving the FC/stack data out of `gear.html` and into
`data/gear/*.json` does NOT by itself close this loop: both paths are
agent-writable, so the same manufacture-your-own-work cycle survives the move.
The base-ref read is what damps it.

`--worktree` reads from disk instead. It is meant for local iteration while
editing the site, and it prints a warning because its output is not loop-damped
and must not be fed to an automated generator.


PARSER DRIFT IS A HARD FAILURE
------------------------------
The calculator's component lists are JS object literals in `script.js`. Scraping
them breaks if someone reformats `motorDB` or switches it to a `Map`. A broken
scrape yields an empty parse, an empty parse yields zero gaps, and zero gaps
looks exactly like success. That is the worst available failure mode, so it is
the one exception to "gaps are data, not failures": if any of framePresets,
motorDB or propDB parses to nothing, or is missing any of the 65/75/85 frame
keys, the collector exits non-zero (3) rather than reporting a clean bill of
health. Parsed counts go to stderr on every run so partial drift is visible
before it becomes total.


SEVERITY RULES
--------------
Fixed rules, not judgement. `--explain-severity` prints this table.

tune_gap      high   combo is the calculator's default for that frame
                     (kv == framePresets[frame].kv), or the combo comes from a
                     published gear build. The site actively recommends it and
                     there is no tune.
              medium selectable motorDB option, and that frame has zero tunes.
              low    selectable motorDB option, and that frame already has at
                     least one tune (a variant gap).

build_orphan  high   motor kv is the frame's calculator default -- the build
                     path a first-time visitor lands on.
              medium motor appears in a published gear build.
              low    otherwise.

metadata_gap  high   missing meta description, or zero inbound internal links
                     (an orphan page nothing links to).
              medium missing JSON-LD.
              low    missing OG tags. Cheap to add, low traffic impact.

gear_gap      high   missing affiliate link (revenue-bearing).
              medium missing price.
              low    missing specs.

open_issue    high   label in {priority:high, p0, p1, bug, security}.
              low    label in {good first issue, low, chore, docs}.
              medium otherwise.

data_error    high   always. A data file that cannot be parsed hides whatever
                     gaps it contained.


KNOWN POLICY CONFLICT
---------------------
metadata_gap reports missing JSON-LD, but `scripts/ci/agent_policy.json` sets
html_checks.forbid_inline_script, and the validator treats any <script> without
a src as inline -- including <script type="application/ld+json">. Acting on a
JSON-LD signal would therefore fail the agent gate. Either the policy needs to
exempt application/ld+json or this signal needs to be dropped; flagging rather
than silently emitting unactionable work.
"""

from __future__ import annotations

import argparse
import html as html_mod
import json
import os
import posixpath
import re
import subprocess
import sys
from html.parser import HTMLParser

SCHEMA_VERSION = 1

EXIT_OK = 0
EXIT_ERROR = 2
EXIT_PARSER_DRIFT = 3

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}

FRAME_SIZES = (65, 75, 85)
REQUIRED_JS_LITERALS = ("framePresets", "motorDB", "propDB")

ISSUE_HIGH_LABELS = {"priority:high", "priority: high", "p0", "p1", "bug", "security"}
ISSUE_LOW_LABELS = {"good first issue", "low", "priority:low", "priority: low", "chore", "docs"}


# ---------------------------------------------------------------------------
# source access
# ---------------------------------------------------------------------------


class SourceError(Exception):
    """Raised when the repository cannot be read at all."""


class GitRefSource:
    """Reads file content out of a git ref. Never touches the working tree."""

    def __init__(self, root: str, ref: str) -> None:
        self.root = root
        self.ref = ref
        self._sha = self._resolve(ref)
        self._files = self._list()

    @property
    def describe(self) -> str:
        return "%s (%s)" % (self.ref, self._sha[:12])

    def _git(self, *args: str) -> tuple[bool, str]:
        proc = subprocess.run(
            ("git", "-C", self.root) + args,
            capture_output=True,
            text=True,
            errors="replace",
        )
        return proc.returncode == 0, proc.stdout

    def _resolve(self, ref: str) -> str:
        ok, out = self._git("rev-parse", "--verify", "%s^{commit}" % ref)
        if not ok or not out.strip():
            raise SourceError(
                "ref %r does not resolve to a commit. The collector reads sources "
                "from a base ref so a pull request cannot manufacture its own "
                "signals; fetch it first, or pass --worktree for a local "
                "(non-loop-damped) run." % ref
            )
        return out.strip()

    def _list(self) -> list[str]:
        ok, out = self._git("ls-tree", "-r", "--name-only", self._sha)
        if not ok:
            raise SourceError("could not list files at %s" % self.ref)
        return sorted(line for line in out.splitlines() if line)

    def list_files(self) -> list[str]:
        return list(self._files)

    def exists(self, path: str) -> bool:
        return path in self._files

    def read(self, path: str) -> str | None:
        if not self.exists(path):
            return None
        ok, out = self._git("show", "%s:%s" % (self._sha, path))
        return out if ok else None


class WorktreeSource:
    """Reads from disk. Opt-in only: results are not loop-damped."""

    def __init__(self, root: str) -> None:
        self.root = root
        self._files = self._walk()

    @property
    def describe(self) -> str:
        return "working tree at %s" % self.root

    def _walk(self) -> list[str]:
        found = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = sorted(d for d in dirnames if d not in (".git", "node_modules"))
            for name in sorted(filenames):
                full = os.path.join(dirpath, name)
                found.append(os.path.relpath(full, self.root).replace(os.sep, "/"))
        return sorted(found)

    def list_files(self) -> list[str]:
        return list(self._files)

    def exists(self, path: str) -> bool:
        return path in self._files

    def read(self, path: str) -> str | None:
        if not self.exists(path):
            return None
        try:
            with open(os.path.join(self.root, path), "r", errors="replace") as handle:
                return handle.read()
        except OSError:
            return None


# ---------------------------------------------------------------------------
# JS object literal parsing
# ---------------------------------------------------------------------------


def strip_js_comments(text: str) -> str:
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        char = text[i]
        if char in "'\"`":
            quote = char
            out.append(char)
            i += 1
            while i < n:
                if text[i] == "\\":
                    out.append(text[i : i + 2])
                    i += 2
                    continue
                out.append(text[i])
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        if char == "/" and i + 1 < n:
            if text[i + 1] == "/":
                while i < n and text[i] != "\n":
                    i += 1
                continue
            if text[i + 1] == "*":
                end = text.find("*/", i + 2)
                i = n if end == -1 else end + 2
                continue
        out.append(char)
        i += 1
    return "".join(out)


def balanced_slice(text: str, start: int) -> str | None:
    """Return the {...} or [...] literal beginning at or after `start`."""
    opens = {"{": "}", "[": "]"}
    while start < len(text) and text[start] not in opens:
        if not text[start].isspace():
            return None
        start += 1
    if start >= len(text):
        return None
    depth = 0
    i = start
    n = len(text)
    while i < n:
        char = text[i]
        if char in "'\"":
            quote = char
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        if char in "{[":
            depth += 1
        elif char in "}]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
        i += 1
    return None


_TOKEN_RE = re.compile(
    r"""(?P<ws>\s+)
      | (?P<punct>[{}\[\]:,])
      | (?P<str>'(?:[^'\\]|\\.)*' | "(?:[^"\\]|\\.)*")
      | (?P<num>-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)
      | (?P<ident>[A-Za-z_$][A-Za-z0-9_$]*)
    """,
    re.X,
)


def _tokenize(text: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    i, n = 0, len(text)
    while i < n:
        match = _TOKEN_RE.match(text, i)
        if not match:
            raise ValueError("unparseable at offset %d: %r" % (i, text[i : i + 20]))
        kind = match.lastgroup
        if kind != "ws":
            tokens.append((kind, match.group()))
        i = match.end()
    return tokens


def _unquote(raw: str) -> str:
    body = raw[1:-1]
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), body)


def _coerce(kind: str, raw: str):
    if kind == "str":
        return _unquote(raw)
    if kind == "num":
        return float(raw) if ("." in raw or "e" in raw.lower()) else int(raw)
    if raw == "true":
        return True
    if raw == "false":
        return False
    if raw == "null":
        return None
    return raw


def parse_js_literal(text: str):
    """Parse a JS object/array literal into Python. Tolerates trailing commas."""
    tokens = _tokenize(text)
    pos = 0

    def parse_value():
        nonlocal pos
        kind, raw = tokens[pos]
        if raw == "{":
            pos += 1
            obj = {}
            while True:
                kind, raw = tokens[pos]
                if raw == "}":
                    pos += 1
                    return obj
                if raw == ",":
                    pos += 1
                    continue
                key = _coerce(kind, raw)
                pos += 1
                if tokens[pos][1] != ":":
                    raise ValueError("expected ':' after key %r" % (key,))
                pos += 1
                obj[key] = parse_value()
        if raw == "[":
            pos += 1
            arr = []
            while True:
                kind, raw = tokens[pos]
                if raw == "]":
                    pos += 1
                    return arr
                if raw == ",":
                    pos += 1
                    continue
                arr.append(parse_value())
        pos += 1
        return _coerce(kind, raw)

    value = parse_value()
    return value


def extract_js_literal(source: str, name: str):
    """Find `const NAME = {...}` in source and parse it. None if absent."""
    pattern = re.compile(r"\b(?:const|let|var)\s+%s\s*=\s*" % re.escape(name))
    match = pattern.search(source)
    if not match:
        return None
    literal = balanced_slice(source, match.end())
    if literal is None:
        return None
    try:
        return parse_js_literal(literal)
    except ValueError:
        return None


def normalise_frame_keys(obj) -> dict:
    """Frame keys arrive as ints or strings depending on the literal; unify to int."""
    if not isinstance(obj, dict):
        return {}
    out = {}
    for key, value in obj.items():
        try:
            out[int(key)] = value
        except (TypeError, ValueError):
            continue
    return out


# ---------------------------------------------------------------------------
# loaders
# ---------------------------------------------------------------------------

CALCULATOR_CANDIDATES = ("script.js",)


class Calculator:
    def __init__(self, presets: dict, motors: dict, props: dict, source_path: str) -> None:
        self.presets = presets
        self.motors = motors
        self.props = props
        self.source_path = source_path

    def counts(self) -> dict:
        return {
            "framePresets": {frame: 1 for frame in sorted(self.presets)},
            "motorDB": {frame: len(self.motors[frame]) for frame in sorted(self.motors)},
            "propDB": {frame: len(self.props[frame]) for frame in sorted(self.props)},
        }


def load_calculator(source) -> tuple[Calculator | None, list[str]]:
    """Parse the calculator's component lists. Returns (calculator, problems)."""
    problems: list[str] = []
    js_path = next((p for p in CALCULATOR_CANDIDATES if source.exists(p)), None)
    if js_path is None:
        problems.append(
            "no calculator source found (looked for: %s)" % ", ".join(CALCULATOR_CANDIDATES)
        )
        return None, problems

    raw = source.read(js_path) or ""
    clean = strip_js_comments(raw)

    parsed = {}
    for name in REQUIRED_JS_LITERALS:
        value = normalise_frame_keys(extract_js_literal(clean, name))
        parsed[name] = value
        if not value:
            problems.append(
                "parser found no entries for %s -- %s format likely changed" % (name, js_path)
            )
            continue
        missing = [f for f in FRAME_SIZES if f not in value]
        if missing:
            problems.append(
                "parser found no entries for %s frame %s -- %s format likely changed"
                % (name, "/".join(str(m) for m in missing), js_path)
            )

    # Per-frame lists must be non-empty too: a parse that yields {65: []} is
    # just as blind as one that yields {}.
    for name in ("motorDB", "propDB"):
        for frame in sorted(parsed.get(name) or {}):
            if not parsed[name][frame]:
                problems.append(
                    "parser found no entries for %s[%s] -- %s format likely changed"
                    % (name, frame, js_path)
                )

    if problems:
        return None, problems
    return (
        Calculator(parsed["framePresets"], parsed["motorDB"], parsed["propDB"], js_path),
        problems,
    )


def _iter_json_dir(source, prefix: str):
    """Yield (path, parsed_or_None) for every *.json directly under prefix."""
    for path in source.list_files():
        if not path.startswith(prefix) or not path.endswith(".json"):
            continue
        if "/" in path[len(prefix) :]:
            continue  # only the immediate directory
        raw = source.read(path)
        if raw is None:
            yield path, None
            continue
        try:
            yield path, json.loads(raw)
        except json.JSONDecodeError:
            yield path, None


def _flatten_records(data, key: str) -> list[dict]:
    if isinstance(data, dict) and isinstance(data.get(key), list):
        data = data[key]
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def load_tunes(source) -> tuple[list[dict], list[tuple[str, str]]]:
    tunes: list[dict] = []
    errors: list[tuple[str, str]] = []
    for path, data in _iter_json_dir(source, "data/tunes/"):
        if data is None:
            errors.append((path, "not valid JSON"))
            continue
        records = _flatten_records(data, "tunes")
        if not records:
            errors.append((path, "contains no tune objects"))
        tunes.extend(records)
    return tunes, errors


def load_gear(source) -> tuple[list[dict], list[tuple[str, str]]]:
    gear: list[dict] = []
    errors: list[tuple[str, str]] = []
    for path, data in _iter_json_dir(source, "data/gear/"):
        if data is None:
            errors.append((path, "not valid JSON"))
            continue
        records = _flatten_records(data, "gear")
        if not records:
            errors.append((path, "contains no gear objects"))
        for record in records:
            record.setdefault("_source_path", path)
        gear.extend(records)
    return gear, errors


# -- gear.html build cards ---------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")
_SPEC_ROW_RE = re.compile(
    r'class="spec-key"\s*>(?P<key>.*?)</span>\s*'
    r'<span[^>]*class="spec-val"\s*>(?P<val>.*?)</span>'
    r'(?:\s*<a[^>]*href="(?P<href>[^"]*)")?',
    re.S,
)
_CARD_LABEL_RE = re.compile(r'class="build-card-label"\s*>(.*?)</div>', re.S)


def _text(raw: str) -> str:
    return html_mod.unescape(_TAG_RE.sub("", raw)).strip()


def load_gear_html_builds(source, path: str = "gear.html") -> list[dict]:
    """Extract build-card component rows from the gear page.

    The FC/stack dimension of the coverage matrix lives here rather than in the
    calculator, which has no FC list at all.
    """
    raw = source.read(path)
    if raw is None:
        return []
    builds = []
    chunks = raw.split('class="build-card"')[1:]
    for index, chunk in enumerate(chunks):
        label_match = _CARD_LABEL_RE.search(chunk)
        label = _text(label_match.group(1)) if label_match else "build %d" % (index + 1)
        components = {}
        links = {}
        for row in _SPEC_ROW_RE.finditer(chunk):
            key = _text(row.group("key"))
            components[key] = _text(row.group("val"))
            if row.group("href"):
                links[key] = row.group("href")
        if components:
            builds.append({"label": label, "components": components, "links": links})
    return builds


def infer_frame_size(*texts: str) -> int | None:
    """Infer a whoop frame class from product names like 'Air65' or 'Mobula 6'."""
    for text in texts:
        if not text:
            continue
        for frame in FRAME_SIZES:
            if re.search(r"(?<!\d)%d(?!\d)" % frame, text):
                return frame
    return None


def infer_kv(*texts: str) -> int | None:
    for text in texts:
        if not text:
            continue
        match = re.search(r"(?<!\d)(\d{4,6})\s*KV", text, re.I)
        if match:
            return int(match.group(1))
    return None


# -- pages ------------------------------------------------------------------


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta_description = ""
        self.og_properties: set[str] = set()
        self.has_json_ld = False
        self.links: list[str] = []
        self._in_ld = False

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "meta":
            name = (attrs_d.get("name") or "").strip().lower()
            prop = (attrs_d.get("property") or "").strip().lower()
            if name == "description":
                self.meta_description = (attrs_d.get("content") or "").strip()
            if prop.startswith("og:"):
                self.og_properties.add(prop)
        elif tag == "script":
            if (attrs_d.get("type") or "").strip().lower() == "application/ld+json":
                self.has_json_ld = True
        for attr in ("href", "src"):
            value = (attrs_d.get(attr) or "").strip()
            if value:
                self.links.append(value)


def _is_external(url: str) -> bool:
    return url.startswith("//") or bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url))


def resolve_internal(url: str, from_path: str) -> str | None:
    if url.startswith("#") or _is_external(url):
        return None
    if url.lower().startswith(("mailto:", "tel:", "data:", "javascript:")):
        return None
    target = url.split("#", 1)[0].split("?", 1)[0]
    if not target:
        return None
    if target.startswith("/"):
        resolved = posixpath.normpath(target.lstrip("/"))
    else:
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(from_path), target))
    if target.endswith("/") or resolved in (".", ""):
        resolved = posixpath.normpath(posixpath.join(resolved, "index.html"))
    return None if resolved.startswith("..") else resolved


def load_pages(source) -> tuple[dict[str, PageParser], dict[str, int]]:
    """Parse every HTML page; return (parsed pages, inbound link counts)."""
    pages: dict[str, PageParser] = {}
    for path in source.list_files():
        if not path.endswith(".html"):
            continue
        raw = source.read(path)
        if raw is None:
            continue
        parser = PageParser()
        try:
            parser.feed(raw)
            parser.close()
        except Exception:
            pass  # a page we cannot fully parse still contributes what it read
        pages[path] = parser

    inbound: dict[str, int] = {path: 0 for path in pages}
    for path, parser in sorted(pages.items()):
        for url in parser.links:
            target = resolve_internal(url, path)
            if target is not None and target in inbound and target != path:
                inbound[target] += 1
    return pages, inbound


# ---------------------------------------------------------------------------
# signal collection
# ---------------------------------------------------------------------------


def row(kind: str, target: str, detail: str, severity: str) -> dict:
    return {"type": kind, "target": target, "detail": detail, "severity": severity}


def collect_tune_gaps(calc: Calculator, tunes: list[dict], gear_builds: list[dict]) -> list[dict]:
    covered_frame_kv = set()
    frames_with_tunes = set()
    covered_frame_fc = set()
    for tune in tunes:
        frame = tune.get("frame_size_mm")
        kv = tune.get("motor_kv")
        fc = (tune.get("fc") or "").strip().lower()
        if isinstance(frame, (int, float)):
            frames_with_tunes.add(int(frame))
            if isinstance(kv, (int, float)):
                covered_frame_kv.add((int(frame), int(kv)))
            if fc:
                covered_frame_fc.add((int(frame), fc))

    gear_kv_combos = set()
    rows = []

    # Gear-page builds: the site actively sells these, so a missing tune is high.
    for build in gear_builds:
        components = build["components"]
        frame_text = components.get("Frame", "")
        motor_text = components.get("Motors", "")
        fc_text = components.get("FC", "")
        frame = infer_frame_size(frame_text, build["label"])
        kv = infer_kv(motor_text)
        if frame is None or kv is None:
            continue
        gear_kv_combos.add((frame, kv))
        if (frame, kv) in covered_frame_kv:
            continue
        detail = "gear build %r (frame %r, FC %r, motors %r) has no tune for %dmm at %dKV" % (
            build["label"],
            frame_text,
            fc_text or "unspecified",
            motor_text,
            frame,
            kv,
        )
        rows.append(row("tune_gap", "%dmm/%dKV" % (frame, kv), detail, "high"))

    # Calculator-selectable combos.
    for frame in sorted(calc.motors):
        default_kv = None
        preset = calc.presets.get(frame)
        if isinstance(preset, dict) and isinstance(preset.get("kv"), (int, float)):
            default_kv = int(preset["kv"])
        seen_kv = set()
        for motor in calc.motors[frame]:
            kv = motor.get("kv")
            if not isinstance(kv, (int, float)):
                continue
            kv = int(kv)
            if (frame, kv) in seen_kv:
                continue
            seen_kv.add((frame, kv))
            if (frame, kv) in covered_frame_kv:
                continue
            if (frame, kv) in gear_kv_combos:
                continue  # already emitted above at high severity
            if kv == default_kv:
                severity = "high"
                why = "calculator default KV for %dmm" % frame
            elif frame not in frames_with_tunes:
                severity = "medium"
                why = "selectable motor, and %dmm has no tunes at all" % frame
            else:
                severity = "low"
                why = "selectable motor variant; %dmm already has tune coverage" % frame
            detail = "no tune for %dmm at %dKV (%s); calculator offers %s" % (
                frame,
                kv,
                why,
                motor.get("name", "unnamed motor"),
            )
            rows.append(row("tune_gap", "%dmm/%dKV" % (frame, kv), detail, severity))
    return rows


def collect_build_orphans(
    calc: Calculator, tunes: list[dict], gear_builds: list[dict], pages: dict
) -> tuple[list[dict], int]:
    """Coherent frame x motor x prop combos with no tune and no guide page.

    Scoped to physically coherent pairings -- prop pitch equal to the motor's
    propPitch -- because the raw cross product is mostly nonsense the
    calculator would never be driven into. The number of combos dropped by that
    filter is returned so the narrowing is never silent.
    """
    covered_kv = {
        (int(t["frame_size_mm"]), int(t["motor_kv"]))
        for t in tunes
        if isinstance(t.get("frame_size_mm"), (int, float))
        and isinstance(t.get("motor_kv"), (int, float))
    }
    guide_text = " ".join(
        sorted(
            path
            for path in pages
            if path.startswith("content/guides/") or path.startswith("content/tunes/")
        )
    ).lower()

    gear_motors = {
        (build["components"].get("Motors") or "").lower() for build in gear_builds
    }

    rows = []
    dropped = 0
    for frame in sorted(calc.motors):
        preset = calc.presets.get(frame) or {}
        default_kv = int(preset["kv"]) if isinstance(preset.get("kv"), (int, float)) else None
        props = calc.props.get(frame) or []
        for motor in calc.motors[frame]:
            kv = motor.get("kv")
            name = motor.get("name", "unnamed motor")
            if not isinstance(kv, (int, float)):
                continue
            kv = int(kv)
            for prop in props:
                coherent = prop.get("pitch") == motor.get("propPitch")
                if not coherent:
                    dropped += 1
                    continue
                if (frame, kv) in covered_kv:
                    continue
                if name.lower() in guide_text:
                    continue
                if kv == default_kv:
                    severity = "high"
                elif any(name.lower() in gm for gm in gear_motors if gm):
                    severity = "medium"
                else:
                    severity = "low"
                target = "%dmm/%s/%s" % (frame, name, prop.get("name", "unnamed prop"))
                detail = (
                    "calculator can build %dmm + %s (%dKV) + %s but no tune or guide "
                    "page covers it" % (frame, name, kv, prop.get("name", "unnamed prop"))
                )
                rows.append(row("build_orphan", target, detail, severity))
    return rows, dropped


def collect_metadata_gaps(pages: dict[str, PageParser], inbound: dict[str, int]) -> list[dict]:
    rows = []
    for path in sorted(pages):
        if not path.startswith("content/"):
            continue
        parser = pages[path]
        if not parser.meta_description:
            rows.append(
                row("metadata_gap", path, 'missing <meta name="description">', "high")
            )
        if inbound.get(path, 0) == 0:
            rows.append(
                row(
                    "metadata_gap",
                    path,
                    "no inbound internal links from any other page (orphan page)",
                    "high",
                )
            )
        if not parser.has_json_ld:
            rows.append(
                row(
                    "metadata_gap",
                    path,
                    'missing JSON-LD (<script type="application/ld+json">); note this '
                    "conflicts with html_checks.forbid_inline_script in the agent policy",
                    "medium",
                )
            )
        missing_og = sorted({"og:title", "og:description", "og:image"} - parser.og_properties)
        if missing_og:
            rows.append(
                row("metadata_gap", path, "missing OG tags: %s" % ", ".join(missing_og), "low")
            )
    return rows


AFFILIATE_KEYS = ("affiliate_link", "affiliate_url", "buy_link", "buy_url", "url", "link")
PRICE_KEYS = ("price", "price_usd", "msrp")
SPEC_KEYS = ("specs", "specifications", "spec")


def _first_present(record: dict, keys) -> object:
    for key in keys:
        value = record.get(key)
        if value not in (None, "", [], {}):
            return value
    return None


def collect_gear_gaps(gear: list[dict]) -> list[dict]:
    rows = []
    for index, record in enumerate(gear):
        name = (
            record.get("name")
            or record.get("id")
            or record.get("title")
            or "%s#%d" % (record.get("_source_path", "data/gear"), index)
        )
        target = str(name)
        if _first_present(record, AFFILIATE_KEYS) is None:
            rows.append(row("gear_gap", target, "missing affiliate link", "high"))
        if _first_present(record, PRICE_KEYS) is None:
            rows.append(row("gear_gap", target, "missing price", "medium"))
        if _first_present(record, SPEC_KEYS) is None:
            rows.append(row("gear_gap", target, "missing specs", "low"))
    return rows


def collect_open_issues(path: str | None) -> tuple[list[dict], list[tuple[str, str]]]:
    """Optional issues.json, exported separately. Absent is fine, not an error."""
    if not path:
        return [], []
    if not os.path.exists(path):
        return [], []
    try:
        with open(path, "r", errors="replace") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        return [], [(path, "issues file could not be read (%s)" % exc)]

    if isinstance(data, dict) and isinstance(data.get("issues"), list):
        data = data["issues"]
    if not isinstance(data, list):
        return [], [(path, "issues file is not a list of issues")]

    rows = []
    for issue in data:
        if not isinstance(issue, dict):
            continue
        if (issue.get("state") or "open").strip().lower() != "open":
            continue
        title = (issue.get("title") or "").strip() or "untitled issue"
        number = issue.get("number")
        labels = set()
        for label in issue.get("labels") or []:
            if isinstance(label, dict):
                name = label.get("name")
            else:
                name = label
            if isinstance(name, str):
                labels.add(name.strip().lower())
        if labels & ISSUE_HIGH_LABELS:
            severity = "high"
        elif labels & ISSUE_LOW_LABELS:
            severity = "low"
        else:
            severity = "medium"
        target = "issue#%s" % number if number is not None else "issue:%s" % title
        detail = title if not labels else "%s [%s]" % (title, ", ".join(sorted(labels)))
        rows.append(row("open_issue", target, detail, severity))
    return rows, []


# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------


def sort_rows(rows: list[dict]) -> list[dict]:
    return sorted(
        rows,
        key=lambda r: (
            SEVERITY_ORDER.get(r["severity"], 99),
            r["type"],
            r["target"],
            r["detail"],
        ),
    )


def build_counts(rows: list[dict]) -> dict:
    per_type: dict[str, int] = {}
    per_severity: dict[str, int] = {}
    for item in rows:
        per_type[item["type"]] = per_type.get(item["type"], 0) + 1
        per_severity[item["severity"]] = per_severity.get(item["severity"], 0) + 1
    return {"total": len(rows), "by_type": per_type, "by_severity": per_severity}


def write_summary(stream, rows, counts, calc_counts, source_desc, notes) -> None:
    stream.write("signals collected from %s\n" % source_desc)
    if calc_counts:
        stream.write("calculator parse:\n")
        for name in REQUIRED_JS_LITERALS:
            entries = calc_counts.get(name, {})
            rendered = ", ".join("%s:%d" % (frame, n) for frame, n in sorted(entries.items()))
            stream.write("  %-13s %s\n" % (name, rendered or "(none)"))
    stream.write("total rows: %d\n" % counts["total"])
    if counts["by_severity"]:
        stream.write(
            "by severity: %s\n"
            % ", ".join(
                "%s=%d" % (sev, counts["by_severity"].get(sev, 0))
                for sev in ("high", "medium", "low")
                if counts["by_severity"].get(sev)
            )
        )
    if counts["by_type"]:
        stream.write("by type:\n")
        for kind in sorted(counts["by_type"]):
            stream.write("  %-14s %d\n" % (kind, counts["by_type"][kind]))
    for note in notes:
        stream.write("note: %s\n" % note)
    if rows:
        stream.write("top %d:\n" % min(10, len(rows)))
        for item in rows[:10]:
            stream.write(
                "  [%-6s] %-14s %s -- %s\n"
                % (item["severity"], item["type"], item["target"], item["detail"])
            )
    else:
        stream.write("no gaps found\n")


def assert_out_outside_repo(out_path: str, root: str) -> None:
    resolved = os.path.realpath(out_path)
    repo = os.path.realpath(root)
    if resolved == repo or resolved.startswith(repo + os.sep):
        raise SourceError(
            "--out %s is inside the repository at %s; this tool never writes into "
            "the repo tree. Pick a path outside it." % (out_path, root)
        )


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    default_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    parser = argparse.ArgumentParser(
        description="Collect a ranked content-gap list for the QuadMath site.",
        epilog="Sources are read from --ref by default so a pull request cannot "
        "manufacture its own signals. Gaps are data: exit 0. A failed parse of "
        "script.js is a broken instrument: exit 3.",
    )
    parser.add_argument("--root", default=default_root, help="repository root")
    parser.add_argument(
        "--ref",
        default="origin/main",
        help="git ref to read sources from (default: origin/main)",
    )
    parser.add_argument(
        "--worktree",
        action="store_true",
        help="read from the working tree instead of --ref; not loop-damped, local use only",
    )
    parser.add_argument("--issues", help="optional issues.json exported separately")
    parser.add_argument("--out", help="write signals.json here (must be outside the repo)")
    parser.add_argument(
        "--explain-severity", action="store_true", help="print the severity rules and exit"
    )
    args = parser.parse_args(argv)

    if args.explain_severity:
        rules = __doc__.split("SEVERITY RULES", 1)[1].split("KNOWN POLICY CONFLICT", 1)[0]
        sys.stdout.write("SEVERITY RULES" + rules)
        return EXIT_OK

    try:
        if args.out:
            assert_out_outside_repo(args.out, args.root)
        if args.worktree:
            sys.stderr.write(
                "warning: --worktree reads the working tree, so a change in this "
                "checkout can manufacture its own signals. Do not feed this output "
                "to an automated generator.\n"
            )
            source = WorktreeSource(args.root)
        else:
            source = GitRefSource(args.root, args.ref)
    except SourceError as exc:
        sys.stderr.write("error: %s\n" % exc)
        return EXIT_ERROR

    notes: list[str] = []

    calc, problems = load_calculator(source)
    if calc is None:
        for problem in problems:
            sys.stderr.write("error: %s\n" % problem)
        sys.stderr.write(
            "refusing to report zero gaps from a failed parse -- that would read as "
            "success. Fix the parser or the source, then re-run.\n"
        )
        return EXIT_PARSER_DRIFT

    tunes, tune_errors = load_tunes(source)
    gear, gear_errors = load_gear(source)
    gear_builds = load_gear_html_builds(source)
    pages, inbound = load_pages(source)
    issue_rows, issue_errors = collect_open_issues(args.issues)

    rows: list[dict] = []
    rows.extend(collect_tune_gaps(calc, tunes, gear_builds))
    orphan_rows, dropped = collect_build_orphans(calc, tunes, gear_builds, pages)
    rows.extend(orphan_rows)
    rows.extend(collect_metadata_gaps(pages, inbound))
    rows.extend(collect_gear_gaps(gear))
    rows.extend(issue_rows)

    for path, reason in tune_errors + gear_errors + issue_errors:
        rows.append(row("data_error", path, reason, "high"))

    if dropped:
        notes.append(
            "%d calculator motor/prop combos skipped as pitch-incoherent "
            "(prop pitch != motor propPitch)" % dropped
        )
    if not source.exists("data/gear/"):
        gear_files = [p for p in source.list_files() if p.startswith("data/gear/")]
        if not gear_files:
            notes.append("data/gear/ absent -- no gear signals collected")
    if not any(p.startswith("data/tunes/") for p in source.list_files()):
        notes.append("data/tunes/ absent -- every calculator combo counts as uncovered")
    if not any(p.startswith("content/") for p in source.list_files()):
        notes.append("content/ absent -- no metadata signals collected")
    if not gear_builds:
        notes.append("no build-cards parsed from gear.html")
    if args.issues and not os.path.exists(args.issues):
        notes.append("issues file %s not found -- skipped" % args.issues)

    rows = sort_rows(rows)
    counts = build_counts(rows)
    payload = {"schema_version": SCHEMA_VERSION, "counts": counts, "rows": rows}
    rendered = json.dumps(payload, indent=2, sort_keys=True) + "\n"

    if args.out:
        try:
            with open(args.out, "w") as handle:
                handle.write(rendered)
        except OSError as exc:
            sys.stderr.write("error: could not write %s (%s)\n" % (args.out, exc))
            return EXIT_ERROR
    else:
        sys.stdout.write(rendered)

    write_summary(sys.stderr, rows, counts, calc.counts(), source.describe, notes)
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
