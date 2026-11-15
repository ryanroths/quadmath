#!/usr/bin/env python3
"""Decide whether a pull request's human-override label counts.

The label waves a PR past the agent gate, so it is only worth the rule for who
may apply it. It counts when the most recent `labeled` event for it in the
PR's timeline has the repository owner as its actor, as a plain user, and was
not performed through a GitHub App. Anything else -- another user, a bot, or
an app acting with the owner's token (an agent labelling its own PR) -- fails
the gate with:

    human-override must be applied by the owner

Only the PR's number comes from the event payload ($GITHUB_EVENT_PATH). The
labels the PR carries and the timeline that says who applied them are both
read from the REST API when the script runs (or from --labels FILE and
--timeline FILE, for tests). The payload's own copy of the labels is not used:
it is what the PR looked like when the event fired, so a push that landed in
the same second as the owner's label carried no label, and a re-run of that
job replays the same payload however long ago the label went on.

The verdict is written to $GITHUB_OUTPUT as override=true|false:

    exit 0, override=false   no label: run the gate as usual
    exit 0, override=true    the owner applied it: skip the gate
    exit 1, override=false   someone else applied it: fail

Anything this script cannot establish -- an API error reading the labels or
the timeline, a timeline that never shows the label being applied -- fails
closed.

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request

LABEL = "human-override"
OWNER = "ryanroths"
FAIL = "human-override must be applied by the owner"


# ---------------------------------------------------------------------------
# verdict
# ---------------------------------------------------------------------------


def label_trail(events: list[dict], label: str = LABEL) -> list[dict]:
    """The labeled/unlabeled events for `label`, oldest first.

    The API already returns the timeline in order; the stable sort on
    created_at only guards against pages or fixtures arriving shuffled.
    """
    trail = [
        e for e in events
        if e.get("event") in ("labeled", "unlabeled")
        and (e.get("label") or {}).get("name") == label
    ]
    return sorted(trail, key=lambda e: e.get("created_at") or "")


def judge(
    labels: list[str],
    events: list[dict],
    sender: str | None = None,
    owner: str = OWNER,
    label: str = LABEL,
) -> tuple[str, str]:
    """Return (verdict, detail).

    verdict is one of:
      absent    the PR does not carry the label
      granted   the latest labelling was the owner, by hand
      rejected  the latest labelling was anyone or anything else
      stale     the timeline does not (yet) agree with the event payload

    `sender` is the login that triggered this run, passed only when the run is
    the labelling itself. The timeline is read seconds after the webhook fired,
    so a newest event that is missing, or by someone other than the sender,
    means the timeline is behind -- not that an older event should be trusted.
    """
    if label not in labels:
        return "absent", "no %s label" % label
    trail = label_trail(events, label)
    if not trail or trail[-1].get("event") != "labeled":
        return "stale", "the timeline does not show %s being applied" % label
    last = trail[-1]
    actor = last.get("actor") or {}
    login = actor.get("login") or "(unknown)"
    at = last.get("created_at") or "(unknown time)"
    if sender is not None and login.lower() != sender.lower():
        return "stale", (
            "this run was triggered by %s labelling the PR, but the timeline's "
            "latest %s event is by %s" % (sender, label, login)
        )
    app = last.get("performed_via_github_app")
    if app:
        name = app.get("name") or app.get("slug") or "a GitHub App"
        return "rejected", "applied by %s via the %s app at %s" % (login, name, at)
    if actor.get("type") != "User":
        return "rejected", "applied by %s (%s) at %s" % (login, actor.get("type") or "no type", at)
    if login.lower() != owner.lower():
        return "rejected", "applied by %s at %s" % (login, at)
    return "granted", "applied by %s at %s" % (login, at)


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------


def next_link(header: str | None) -> str | None:
    """The rel="next" URL of a Link header, or None on the last page."""
    for part in (header or "").split(","):
        match = re.match(r'\s*<([^>]+)>\s*;\s*rel="next"', part)
        if match:
            return match.group(1)
    return None


def fetch_pages(url: str | None, token: str, what: str) -> list[dict]:
    """Every page of a list endpoint, following rel="next"."""
    events: list[dict] = []
    while url:
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": "Bearer " + token,
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "agent-gate",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            page = json.load(response)
            if not isinstance(page, list):
                raise ValueError("%s page is not a list" % what)
            events.extend(page)
            url = next_link(response.headers.get("Link"))
    return events


def fetch_timeline(repo: str, number: int, token: str, api: str = "https://api.github.com") -> list[dict]:
    url = "%s/repos/%s/issues/%d/timeline?per_page=100" % (api.rstrip("/"), repo, number)
    return fetch_pages(url, token, "timeline")


def fetch_labels(repo: str, number: int, token: str, api: str = "https://api.github.com") -> list[str]:
    """The names of the labels the PR carries now."""
    url = "%s/repos/%s/issues/%d/labels?per_page=100" % (api.rstrip("/"), repo, number)
    return label_names(fetch_pages(url, token, "labels"))


def label_names(labels: list) -> list[str]:
    names = []
    for item in labels:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            raise ValueError("a label without a name")
        names.append(item["name"])
    return names


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def write_output(override: bool) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write("override=%s\n" % ("true" if override else "false"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--event", default=os.environ.get("GITHUB_EVENT_PATH"), help="event payload JSON")
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"), help="owner/name")
    parser.add_argument("--labels", help="read the PR's labels from this JSON file instead of the API")
    parser.add_argument("--timeline", help="read the timeline from this JSON file instead of the API")
    parser.add_argument("--retries", type=int, default=3, help="re-reads of a timeline that is behind")
    parser.add_argument("--wait", type=float, default=5.0, help="seconds between re-reads")
    args = parser.parse_args(argv)

    if not args.event:
        print("::error::no event payload (--event or GITHUB_EVENT_PATH)")
        write_output(False)
        return 2
    with open(args.event, encoding="utf-8") as fh:
        payload = json.load(fh)
    pr = payload.get("pull_request") or {}
    # The number is all the payload is trusted for: it does not change. Its
    # labels are the PR as it was when the event fired (see the docstring).
    number = pr.get("number") or payload.get("number")
    sender = None
    if payload.get("action") == "labeled" and (payload.get("label") or {}).get("name") == LABEL:
        sender = (payload.get("sender") or {}).get("login")
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    api = os.environ.get("GITHUB_API_URL") or "https://api.github.com"

    def read_labels() -> list[str]:
        if args.labels:
            with open(args.labels, encoding="utf-8") as fh:
                return label_names(json.load(fh))
        return fetch_labels(args.repo, int(number), token, api)

    def read_timeline() -> list[dict]:
        if args.timeline:
            with open(args.timeline, encoding="utf-8") as fh:
                return json.load(fh)
        return fetch_timeline(args.repo, int(number), token, api)

    # Each attempt reads the labels and then the timeline, both as they are
    # now: a label taken off between two attempts is off.
    verdict, detail = "stale", ""
    for attempt in range(args.retries + 1):
        if attempt:
            time.sleep(args.wait)
        try:
            labels = read_labels()
        except Exception as exc:  # fail closed on anything the API throws
            print("::error::%s (could not read the PR's labels: %s)" % (FAIL, exc))
            write_output(False)
            return 2
        if LABEL not in labels:
            verdict, detail = "absent", "no %s label" % LABEL
            break
        try:
            events = read_timeline()
        except Exception as exc:
            print("::error::%s (could not read the PR timeline: %s)" % (FAIL, exc))
            write_output(False)
            return 2
        verdict, detail = judge(labels, events, sender=sender)
        if verdict != "stale":
            break

    if verdict == "absent":
        print("No %s label; the gate runs." % LABEL)
        write_output(False)
        return 0
    if verdict == "granted":
        print("::notice::%s %s; the gate is skipped." % (LABEL, detail))
        write_output(True)
        return 0
    if verdict == "rejected":
        print("::error::%s (%s); this one was %s." % (FAIL, OWNER, detail))
    else:  # still stale after the re-reads
        print("::error::%s (%s); could not confirm who applied it: %s." % (FAIL, OWNER, detail))
    write_output(False)
    return 1


if __name__ == "__main__":
    sys.exit(main())
