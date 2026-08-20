#!/usr/bin/env python3
"""
Read and append to the TUNES array inside tune-database.js.

tune-database.js is the single source of truth for the tune cards and it is a
JavaScript file, not JSON: unquoted keys, single-quoted strings, trailing
commas, and comments in the middle of the array. This module reads that array
into Python and appends one entry back, without reformatting the eight
hand-authored entries or losing the comments between them.

Two rules the writer holds to, because the entries it appends are derived from
issue text typed by strangers:

  * every string is emitted through json.dumps, so a quote or a newline in a
    board name closes as an escape rather than as a JS string terminator. The
    page escapes on render; this escapes on write, which is the half that a
    renderer cannot cover.
  * the file is re-read and the appended entry compared field by field before
    the caller is told the write succeeded. A write that does not round-trip
    is backed out.

Standard library only.
"""

from __future__ import annotations

import json
import re

ARRAY_HEADER = re.compile(r"\bvar\s+TUNES\s*=\s*\[", re.MULTILINE)

# The entry shape the page renders. Anything else is refused rather than
# written, so a schema drift shows up here and not as an undefined on a card.
ENTRY_KEYS = ("id", "frame", "brand", "source", "sourceType", "fc", "combo",
              "rateType", "pids", "rates", "notes")
REQUIRED_KEYS = ("id", "frame", "brand", "source", "fc", "rateType", "pids", "notes")
AXES = ("roll", "pitch", "yaw")


class TuneDbError(RuntimeError):
    pass


# --------------------------------------------------------------------------
# reading
# --------------------------------------------------------------------------


def _scan_array(text: str, start: int) -> tuple[str, int]:
    """Return the array literal starting at `start` ('[') and the index after it.

    Bracket counting has to skip over strings and comments or a `//` note
    containing a bracket would end the array early.
    """
    depth = 0
    i = start
    end = len(text)
    while i < end:
        ch = text[i]
        if ch in "\"'":
            quote = ch
            i += 1
            while i < end and text[i] != quote:
                i += 2 if text[i] == "\\" else 1
            i += 1
            continue
        if ch == "/" and i + 1 < end and text[i + 1] == "/":
            i = text.find("\n", i)
            if i == -1:
                break
            continue
        if ch == "/" and i + 1 < end and text[i + 1] == "*":
            close = text.find("*/", i + 2)
            i = end if close == -1 else close + 2
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1], i + 1
        i += 1
    raise TuneDbError("TUNES array is not closed")


_JS_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f",
               "v": "\v", "0": "\0", "\\": "\\", "'": "'", '"': '"', "/": "/"}


def _read_js_string(src: str, start: int) -> tuple[str, int]:
    """Decode the JS string literal at `start`.

    Returns the value and the index just past the closing quote. Escapes are
    decoded here rather than passed through, so json.dumps can re-encode them
    for the target quote style without double-escaping.
    """
    quote = src[start]
    out: list[str] = []
    i = start + 1
    end = len(src)
    while i < end and src[i] != quote:
        if src[i] != "\\":
            out.append(src[i])
            i += 1
            continue
        nxt = src[i + 1] if i + 1 < end else ""
        if nxt == "u" and i + 6 <= end:
            out.append(chr(int(src[i + 2 : i + 6], 16)))
            i += 6
            continue
        if nxt == "x" and i + 4 <= end:
            out.append(chr(int(src[i + 2 : i + 4], 16)))
            i += 4
            continue
        out.append(_JS_ESCAPES.get(nxt, nxt))
        i += 2
    if i >= end:
        raise TuneDbError("unterminated string literal in TUNES")
    return "".join(out), i + 1


def _js_to_json(src: str) -> str:
    """JS object/array literal -> JSON text.

    Character by character rather than by regex: the substitutions (drop
    comments, quote bare keys, requote single-quoted strings, drop trailing
    commas) are all wrong if they fire inside a string, and the notes arrays
    are full of punctuation.
    """
    out: list[str] = []
    i = 0
    end = len(src)
    while i < end:
        ch = src[i]

        if ch == "/" and i + 1 < end and src[i + 1] == "/":
            nl = src.find("\n", i)
            i = end if nl == -1 else nl
            continue
        if ch == "/" and i + 1 < end and src[i + 1] == "*":
            close = src.find("*/", i + 2)
            i = end if close == -1 else close + 2
            continue

        if ch in "\"'":
            value, i = _read_js_string(src, i)
            # Re-encode so a double quote inside a single-quoted JS string
            # comes out escaped rather than terminating the JSON string.
            out.append(json.dumps(value, ensure_ascii=False))
            continue

        # Bare object key -> quoted key.
        if ch.isalpha() or ch == "_":
            match = re.match(r"[A-Za-z_$][\w$]*", src[i:])
            word = match.group()
            after = src[i + len(word):]
            if re.match(r"\s*:", after):
                out.append(json.dumps(word))
            elif word in ("true", "false", "null"):
                out.append(word)
            else:
                raise TuneDbError("unsupported JS identifier in TUNES: %r" % word)
            i += len(word)
            continue

        out.append(ch)
        i += 1

    # Trailing commas: legal in JS, not in JSON.
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def read_tunes(text: str) -> list[dict]:
    """Every entry in the TUNES array of a tune-database.js file."""
    header = ARRAY_HEADER.search(text)
    if not header:
        raise TuneDbError("no `var TUNES = [` in the file")
    literal, _ = _scan_array(text, header.end() - 1)
    return json.loads(_js_to_json(literal))


# --------------------------------------------------------------------------
# writing
# --------------------------------------------------------------------------


def _js_string(value) -> str:
    """A JS string literal. json.dumps is the escaping, deliberately."""
    return json.dumps(str(value), ensure_ascii=False)


def _js_row(values) -> str:
    return "[" + ", ".join(str(int(v)) for v in values) + "]"


def render_entry(entry: dict, indent: str = "    ") -> str:
    """One TUNES entry as JS, formatted like the hand-authored ones."""
    problems = [key for key in REQUIRED_KEYS if entry.get(key) in (None, "")]
    if problems:
        raise TuneDbError("entry is missing %s" % ", ".join(problems))
    unknown = sorted(set(entry) - set(ENTRY_KEYS))
    if unknown:
        raise TuneDbError("entry has unknown key(s): %s" % ", ".join(unknown))

    pad = indent + "  "
    lines = [indent + "{"]
    # Same field order as the hand-authored entries above it.
    for key in ("id", "frame", "brand", "source", "sourceType", "fc", "combo", "rateType"):
        value = entry.get(key)
        if value in (None, ""):
            continue
        if key == "frame":
            lines.append("%sframe: %d," % (pad, int(value)))
        else:
            lines.append("%s%s: %s," % (pad, key, _js_string(value)))

    lines.append("%spids:  { %s }," % (pad, ", ".join(
        "%s: %s" % (axis, _js_row(entry["pids"][axis])) for axis in AXES)))
    if entry.get("rates"):
        lines.append("%srates: { %s }," % (pad, ", ".join(
            "%s: %s" % (axis, _js_row(entry["rates"][axis])) for axis in AXES)))
    else:
        lines.append("%s// No rate lines in the submitted diff -- the card hides" % pad)
        lines.append("%s// the CLI button rather than exporting a half tune." % pad)
        lines.append("%srates: null," % pad)

    lines.append("%snotes: [" % pad)
    for note in entry.get("notes") or []:
        lines.append("%s  %s," % (pad, _js_string(note)))
    lines.append("%s]," % pad)
    lines.append(indent + "},")
    return "\n".join(lines) + "\n"


def append_tune(text: str, entry: dict) -> str:
    """tune-database.js text with `entry` appended to TUNES.

    Inserts before the array's closing bracket instead of re-serialising the
    whole array, so the diff is the new entry and nothing else -- the eight
    existing entries and the comments between them are untouched.
    """
    header = ARRAY_HEADER.search(text)
    if not header:
        raise TuneDbError("no `var TUNES = [` in the file")
    literal, after = _scan_array(text, header.end() - 1)

    existing = json.loads(_js_to_json(literal))
    if any(item.get("id") == entry.get("id") for item in existing):
        raise TuneDbError("a tune with id %r is already in TUNES" % entry.get("id"))

    close = after - 1  # index of the array's ']'
    line_start = text.rfind("\n", 0, close) + 1
    indent = re.match(r"[ \t]*", text[line_start:close]).group() + "  "

    updated = text[:line_start] + render_entry(entry, indent) + text[line_start:]

    # Refuse to hand back something that does not read back as what went in.
    round_tripped = read_tunes(updated)
    if len(round_tripped) != len(existing) + 1:
        raise TuneDbError("append produced %d entries, expected %d"
                          % (len(round_tripped), len(existing) + 1))
    written = round_tripped[-1]
    for key in ENTRY_KEYS:
        if entry.get(key) in (None, "") and key not in written:
            continue
        if written.get(key) != entry.get(key):
            raise TuneDbError(
                "append did not round-trip: %s is %r on disk, %r in the entry"
                % (key, written.get(key), entry.get(key))
            )
    return updated
