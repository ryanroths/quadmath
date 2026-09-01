#!/usr/bin/env python3
"""
Step 4 of the quadmath agent pipeline: community tune submissions.

Reads open issues that carry BOTH `tune-submission` AND `approved`, runs the
diff in each through scripts/parse_tune_diff.py, appends the resulting entry
to the TUNES array in tune-database.js, and opens one pull request per issue.

WHY `approved` IS THE WHOLE DESIGN
----------------------------------
Every field in these issues is typed by a stranger on the internet: the diff,
the board name that becomes the card's headline, the handle that becomes the
provenance badge. `approved` is the point at which a person has read that and
decided it can be published. So:

  * an issue without `approved` is not read, not parsed, and not touched.
  * this script never applies `approved`. It cannot -- see WRITABLE_LABELS,
    and the test that pins it. A label the agent can apply to itself is not a
    gate, it is a formality.
  * the PR it opens is a proposal. It goes through the same agent-gate job as
    every other agent PR, and branch protection still requires a human to
    merge it. Nothing here merges anything.

WHAT IT REFUSES
---------------
  * a diff the parser refuses -- the reasons are reported and the issue is
    left open and unlabelled for a human. Nothing half-parsed is written.
  * an issue whose form fields are missing or unreadable.
  * a submission whose id already exists in TUNES.
  * anything that would fail the agent gate locally: path allowlist and diff
    caps are checked from origin/main before a branch is created.

The pilot's prose ("how does it fly") is deliberately NOT copied into the
tune's notes. Notes on a card are machine-derived from the diff; publishing a
stranger's paragraph is a human decision, so the text is quoted in the PR body
for the reviewer instead.

Runs on the Pi alongside the rest of the pipeline. Standard library only.

Usage:
  export GITHUB_TOKEN=...
  python3 scripts/agent/ingest_tunes.py --root ~/quadmath [--dry-run]
  python3 scripts/agent/ingest_tunes.py --root ~/quadmath --issues issues.json
"""

from __future__ import annotations

import argparse
import datetime as _dt
import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

GITHUB_API = "https://api.github.com"
POLICY_PATH = "scripts/ci/agent_policy.json"
TUNE_DB_PATH = "tune-database.js"

SUBMISSION_LABEL = "tune-submission"
APPROVAL_LABEL = "approved"

# The only labels this script is allowed to put on anything. `approved` is
# absent on purpose: it is the human gate, and a gate the agent can open is
# not a gate. `human-override` is absent for the same reason -- it is what
# waves a PR past the agent gate entirely.
WRITABLE_LABELS = ("tune-submission", "needs-review")
FORBIDDEN_LABELS = frozenset({APPROVAL_LABEL, "human-override"})

FRAME_RE = re.compile(r"(\d{2,3})\s*mm", re.IGNORECASE)
BLANK_FIELD = "_no response_"


def _load(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


parser_mod = _load(
    "parse_tune_diff",
    os.path.join(os.path.dirname(os.path.dirname(HERE)), "scripts", "parse_tune_diff.py"),
)
tune_db = _load("tune_db", os.path.join(HERE, "tune_db.py"))
generate_content = _load("generate_content", os.path.join(HERE, "generate_content.py"))
stamp_asset_cache = _load(
    "stamp_asset_cache",
    os.path.join(os.path.dirname(HERE), "ci", "stamp_asset_cache.py"),
)

git = generate_content.git
path_allowed = generate_content.path_allowed
remote_slug = generate_content.remote_slug
branch_exists = generate_content.branch_exists


class SubmissionRefused(RuntimeError):
    def __init__(self, reasons):
        self.reasons = [reasons] if isinstance(reasons, str) else list(reasons)
        super().__init__("; ".join(self.reasons))


# --------------------------------------------------------------------------
# issues
# --------------------------------------------------------------------------


def label_names(issue: dict) -> set[str]:
    names = set()
    for label in issue.get("labels") or []:
        name = label.get("name") if isinstance(label, dict) else label
        if isinstance(name, str):
            names.add(name.strip().lower())
    return names


def is_approved_submission(issue: dict) -> bool:
    """Both labels, open, and not a pull request.

    GitHub's issues endpoint returns PRs too; a PR carrying these labels is
    not a submission and must not be re-ingested.
    """
    if (issue.get("state") or "open").strip().lower() != "open":
        return False
    if issue.get("pull_request"):
        return False
    names = label_names(issue)
    return SUBMISSION_LABEL in names and APPROVAL_LABEL in names


def fetch_issues(slug: str, token: str) -> list[dict]:
    """Open issues carrying both labels. Server-side filter, then re-checked."""
    query = urllib.parse.urlencode({
        "state": "open",
        "labels": "%s,%s" % (SUBMISSION_LABEL, APPROVAL_LABEL),
        "per_page": "50",
    })
    req = urllib.request.Request(
        "%s/repos/%s/issues?%s" % (GITHUB_API, slug, query),
        headers={"authorization": "Bearer %s" % token,
                 "accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def load_issues(path: str) -> list[dict]:
    with open(os.path.expanduser(path), "r", encoding="utf-8", errors="replace") as fh:
        data = json.load(fh)
    if isinstance(data, dict) and isinstance(data.get("issues"), list):
        data = data["issues"]
    if not isinstance(data, list):
        raise RuntimeError("issues file is not a list of issues")
    return data


# --------------------------------------------------------------------------
# issue form body
# --------------------------------------------------------------------------


def split_form(body: str) -> dict[str, str]:
    """GitHub issue-form body -> {heading: value}.

    Rendered form bodies are `### Heading` followed by the value, so the
    headings from .github/ISSUE_TEMPLATE/tune-submission.yml are the keys.

    FIRST occurrence wins, deliberately. The free-text fields are typed by the
    submitter and a heading line inside one of them parses as a new section --
    so a "how does it fly" answer containing `### Betaflight diff all` would,
    under last-wins, replace the diff that was actually submitted. GitHub
    renders each template field exactly once and in order, so first-wins is
    also what a genuine body looks like.

    First-wins alone only protects fields that appear before the free-text
    ones. `duplicate_headings` is the other half: a repeated heading means
    somebody typed a section into a field, and that whole submission is
    refused rather than parsed around.
    """
    fields: dict[str, str] = {}
    heading = None
    buffer: list[str] = []

    def flush():
        if heading is not None and heading not in fields:
            fields[heading] = "\n".join(buffer).strip()

    for line in (body or "").splitlines():
        if line.startswith("### "):
            flush()
            heading = line[4:].strip().lower()
            buffer = []
            continue
        if heading is not None:
            buffer.append(line)
    flush()
    return fields


def duplicate_headings(body: str) -> list[str]:
    """Headings that appear more than once in the rendered body.

    GitHub emits one `### Heading` per template field, so a repeat can only
    come from somebody typing one into a textarea. That is an attempt to
    supply a second value for a field a reviewer has already read, so it is
    grounds to refuse the submission outright rather than to pick a winner.
    """
    seen: dict[str, int] = {}
    for line in (body or "").splitlines():
        if line.startswith("### "):
            key = line[4:].strip().lower()
            seen[key] = seen.get(key, 0) + 1
    return sorted(key for key, count in seen.items() if count > 1)


def field(fields: dict[str, str], *names: str) -> str:
    for name in names:
        value = fields.get(name.lower())
        if value and value.strip().lower() != BLANK_FIELD:
            return value.strip()
    return ""


def unfence(text: str) -> str:
    """Strip the ``` fence the form's `render: shell` wraps the diff in."""
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    body = lines[1:]
    if body and body[-1].strip().startswith("```"):
        body = body[:-1]
    return "\n".join(body)


def read_submission(issue: dict) -> dict:
    """The form fields this pipeline needs. Raises on anything missing."""
    body = issue.get("body") or ""
    repeated = duplicate_headings(body)
    if repeated:
        raise SubmissionRefused(
            "the issue body has %d repeated form heading(s): %s. GitHub writes "
            "each one once, so a repeat means a `### ` section was typed into "
            "a text field -- a second value for a field a reviewer has already "
            "read. Not parsed."
            % (len(repeated), ", ".join(repr(name) for name in repeated))
        )

    fields = split_form(body)
    problems: list[str] = []

    frame_text = field(fields, "Frame size")
    match = FRAME_RE.search(frame_text)
    if not match:
        problems.append("frame size is missing or unreadable: %r" % frame_text)
    frame = int(match.group(1)) if match else 0

    motor = field(fields, "Motor")
    prop = field(fields, "Prop")
    diff = unfence(field(fields, "Betaflight diff all", "Betaflight `diff all`"))
    if not motor:
        problems.append("motor is missing -- it is not in the diff, it has to come from the form")
    if not prop:
        problems.append("prop is missing -- it is not in the diff, it has to come from the form")
    if not diff:
        problems.append("no diff in the issue body")
    if problems:
        raise SubmissionRefused(problems)

    return {
        "frame": frame,
        "motor": motor,
        "prop": prop,
        "diff": diff,
        "pilot": field(fields, "Credit as"),
        "flies": field(fields, "How does it fly?"),
        "packs": field(fields, "Roughly how many packs on this tune?"),
    }


def infer_brand(motor: str, prop: str, fc: str) -> str:
    """Brand for the card's filter chip, from the strings the form supplied.

    The filter chips are a fixed list, so an unrecognised vendor falls back to
    the fc string rather than inventing a chip nobody can select.
    """
    haystack = " ".join((motor, prop, fc)).lower()
    for known in ("BetaFPV", "Happymodel", "NewBeeDrone"):
        if known.lower() in haystack.replace(" ", ""):
            return known
    return (fc or "Unknown").strip()


# --------------------------------------------------------------------------
# GitHub writes
# --------------------------------------------------------------------------


def _post(url: str, token: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"authorization": "Bearer %s" % token,
                 "accept": "application/vnd.github+json",
                 "content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode() or "{}")


def add_labels(slug: str, token: str, number: int, labels) -> list[str]:
    """Apply labels to an issue or PR. Refuses the human-gate labels outright.

    This raises rather than filtering, so a future edit that tries to add
    `approved` here fails loudly instead of silently doing nothing.
    """
    wanted = list(labels)
    blocked = FORBIDDEN_LABELS.intersection(name.lower() for name in wanted)
    if blocked:
        raise RuntimeError(
            "refusing to apply %s -- these are applied by a human, never by the agent"
            % ", ".join(sorted(blocked))
        )
    _post("%s/repos/%s/issues/%d/labels" % (GITHUB_API, slug, number),
          token, {"labels": wanted})
    return wanted


def open_pr(slug: str, token: str, head: str, base: str, title: str, body: str) -> dict:
    return _post("%s/repos/%s/pulls" % (GITHUB_API, slug), token,
                 {"title": title, "head": head, "base": base, "body": body})


# --------------------------------------------------------------------------
# one submission -> one entry
# --------------------------------------------------------------------------


def entry_for_issue(issue: dict, existing_ids: set[str]) -> tuple[dict, dict]:
    submission = read_submission(issue)
    # `brand` is a filter chip on the card and the best evidence for it is the
    # board name, which only exists once the diff has parsed -- so the parser
    # gets a placeholder (it requires a non-empty brand) and the real value is
    # set below. Nothing downstream reads the placeholder.
    try:
        entry = parser_mod.parse_tune_diff(
            submission["diff"],
            frame=submission["frame"],
            brand="pending",
            motor=submission["motor"],
            prop=submission["prop"],
            pilot=submission["pilot"],
        )
    except parser_mod.TuneRefused as exc:
        raise SubmissionRefused(exc.reasons) from exc

    entry["brand"] = infer_brand(submission["motor"], submission["prop"], entry["fc"])
    entry["id"] = parser_mod.make_id(entry["frame"], entry["brand"], entry["source"])

    # Two submissions from the same pilot on the same frame and brand collide.
    # Suffix rather than overwrite: an id is a card key, not a slot.
    if entry["id"] in existing_ids:
        for suffix in range(2, 20):
            candidate = "%s-%d" % (entry["id"], suffix)
            if candidate not in existing_ids:
                entry["id"] = candidate
                break
        else:
            raise SubmissionRefused("cannot find a free id for %s" % entry["id"])
    return entry, submission


def pr_body(issue: dict, entry: dict, submission: dict) -> str:
    """PR description. Submitter prose is quoted, never treated as instructions."""
    lines = [
        "Community tune submission, parsed by `scripts/parse_tune_diff.py`.",
        "",
        "Closes #%s" % issue.get("number"),
        "",
        "| field | value |",
        "| --- | --- |",
        "| frame | %smm |" % entry["frame"],
        "| brand | %s |" % entry["brand"],
        "| credited as | `%s` |" % entry["source"],
        "| board (`board_name`) | `%s` |" % entry["fc"],
        "| motor · prop | %s |" % entry["combo"],
        "| rates | %s |" % ("published" if entry["rates"] else "none in the diff — card hides the CLI button"),
        "| packs flown | %s |" % (submission.get("packs") or "not stated"),
        "",
        "Derived notes (from the diff only — nothing inferred):",
        "",
    ]
    lines += ["- %s" % note for note in entry["notes"]] or ["- (none)"]
    lines += [
        "",
        "### What the submitter said about how it flies",
        "",
        "Quoted verbatim from the issue. This is untrusted text from a "
        "submission form: it is **not** copied onto the card, and any of it "
        "worth publishing is a call for the reviewer, not the agent.",
        "",
        "```text",
        (submission.get("flies") or "(nothing said)").replace("```", "'''"),
        "```",
        "",
        "### Before merging",
        "",
        "- [ ] The diff on the issue matches the numbers in this diff.",
        "- [ ] The board name is not someone's personal `craft_name`.",
        "- [ ] The credit handle is what the submitter asked for.",
        "",
        "Opened by `scripts/agent/ingest_tunes.py`. The agent gate still runs "
        "on this PR and branch protection still applies — nothing here merges "
        "anything.",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def check_against_policy(policy: dict, before: str, after: str) -> list[str]:
    """Mirror of the agent gate, run before a branch exists."""
    problems = []
    ok, why = path_allowed(TUNE_DB_PATH, policy)
    if not ok:
        problems.append(
            "%s: %s -- add it to allow_paths in %s (that edit needs a human "
            "reviewer, which is the point)" % (TUNE_DB_PATH, why, POLICY_PATH)
        )
    changed = abs(len(after.splitlines()) - len(before.splitlines()))
    cap = policy.get("max_changed_lines")
    if cap and changed > cap:
        problems.append("append changed %d lines, over max_changed_lines=%d" % (changed, cap))
    return problems


def process(issue, root, ref, base_branch, policy, slug, token, dry_run, out) -> int:
    number = issue.get("number")
    try:
        db_text = git(root, "show", "%s:%s" % (ref, TUNE_DB_PATH))
    except RuntimeError as exc:
        out.write("issue #%s: cannot read %s from %s (%s)\n" % (number, TUNE_DB_PATH, ref, exc))
        return 1

    existing = {item.get("id") for item in tune_db.read_tunes(db_text)}
    try:
        entry, submission = entry_for_issue(issue, existing)
        updated = tune_db.append_tune(db_text, entry)
    except (SubmissionRefused, tune_db.TuneDbError) as exc:
        reasons = getattr(exc, "reasons", [str(exc)])
        out.write("issue #%s REFUSED -- nothing written:\n" % number)
        for reason in reasons:
            out.write("  * %s\n" % reason)
        out.write("  leave the issue open; the submitter needs to fix the diff\n")
        return 1

    problems = check_against_policy(policy, db_text, updated)
    if problems:
        for problem in problems:
            out.write("issue #%s: %s\n" % (number, problem))
        out.write("issue #%s: would FAIL the agent gate -- nothing pushed\n" % number)
        return 1

    out.write("issue #%s -> %s (%smm %s, credited %s)\n"
              % (number, entry["id"], entry["frame"], entry["brand"], entry["source"]))
    if dry_run:
        out.write("dry run -- no branch, no PR\n")
        out.write(json.dumps(entry, indent=2, ensure_ascii=False) + "\n")
        return 0

    stamp = _dt.date.today().strftime("%Y%m%d")
    branch = "agent/tune-submission-%s-%s" % (number, stamp)
    if branch_exists(root, branch):
        out.write("issue #%s: branch %s already on remote -- already proposed\n"
                  % (number, branch))
        return 0

    git(root, "checkout", "-B", branch, ref)
    with open(os.path.join(root, TUNE_DB_PATH), "w", encoding="utf-8", newline="") as fh:
        fh.write(updated)
    git(root, "add", TUNE_DB_PATH)
    # Appending a tune changes tune-database.js bytes, so the HTML ?v= stamp
    # has to move with it. Otherwise Pages deploys new JS under the old query
    # string and Cloudflare keeps serving the previous file for four hours --
    # the "0 of N tunes" failure. tune-database.html is on the agent allowlist.
    stamped = stamp_asset_cache.stamp_tree(root)
    if stamped:
        git(root, "add", *stamped)
    title = "agent: tune submission #%s -- %smm %s (%s)" % (
        number, entry["frame"], entry["brand"], entry["source"])
    git(root, "commit", "-m", title)
    git(root, "push", "-u", "origin", branch)

    pull = open_pr(slug, token, branch, base_branch, title, pr_body(issue, entry, submission))
    out.write("PR opened: %s\n" % pull.get("html_url", "(no url)"))
    if pull.get("number"):
        applied = add_labels(slug, token, pull["number"], WRITABLE_LABELS)
        out.write("labels applied to the PR: %s\n" % ", ".join(applied))
    git(root, "checkout", base_branch, check=False)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", required=True, help="path to the quadmath clone")
    ap.add_argument("--ref", default="origin/main", help="base ref (default origin/main)")
    ap.add_argument("--base-branch", default="main")
    ap.add_argument("--issues", help="issues JSON instead of the GitHub API (offline runs)")
    ap.add_argument("--limit", type=int, default=3,
                    help="most issues to process in one run (default 3)")
    ap.add_argument("--dry-run", action="store_true",
                    help="parse and validate, no branch, no PR, no labels")
    args = ap.parse_args(argv)

    root = os.path.abspath(os.path.expanduser(args.root))
    token = os.environ.get("GITHUB_TOKEN", "")
    out = sys.stderr

    if not args.issues and not token:
        out.write("error: GITHUB_TOKEN not set (or pass --issues for an offline run)\n")
        return 2
    if not token and not args.dry_run:
        out.write("error: GITHUB_TOKEN not set -- --issues alone cannot open a PR\n")
        return 2

    git(root, "fetch", "origin")
    policy = generate_content.load_policy(root, args.ref)
    slug = remote_slug(root)

    issues = load_issues(args.issues) if args.issues else fetch_issues(slug, token)
    # Re-check the labels locally even when the API filtered them. The filter
    # is a query parameter; the gate is not something to delegate to a query
    # string.
    approved = [issue for issue in issues if is_approved_submission(issue)]
    skipped = len(issues) - len(approved)
    if skipped:
        out.write("%d issue(s) without both `%s` and `%s` -- not read\n"
                  % (skipped, SUBMISSION_LABEL, APPROVAL_LABEL))
    if not approved:
        out.write("no approved tune submissions -- nothing to do\n")
        return 0

    failures = 0
    for issue in approved[: args.limit]:
        failures += process(issue, root, args.ref, args.base_branch, policy,
                            slug, token, args.dry_run, out)
    if len(approved) > args.limit:
        out.write("%d more approved submission(s) left for the next run (--limit %d)\n"
                  % (len(approved) - args.limit, args.limit))
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as exc:
        sys.stderr.write("HTTP %s: %s\n" % (exc.code, exc.read().decode(errors="replace")[:500]))
        sys.exit(1)
    except RuntimeError as exc:
        sys.stderr.write("error: %s\n" % exc)
        sys.exit(1)
