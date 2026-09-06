#!/usr/bin/env python3
"""Pins the component-ID contract used by calculator share links.

The deployed page is static, so motor and prop rows live in script.js rather
than a separate data file. Reuse the content agent's JS-literal parser here:
if that parser cannot read the tables, its own tests fail independently.
"""

from __future__ import annotations

import importlib.util
import os
import re
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COLLECTOR = os.path.join(ROOT, "scripts", "agent", "collect_signals.py")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def load_collector():
    spec = importlib.util.spec_from_file_location("collect_signals_for_ids", COLLECTOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SharedComponentIds(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        parser = load_collector()
        with open(os.path.join(ROOT, "script.js"), encoding="utf-8") as handle:
            source = parser.strip_js_comments(handle.read())
        cls.tables = {
            name: parser.normalise_frame_keys(parser.extract_js_literal(source, name))
            for name in ("motorDB", "propDB")
        }

    def entries(self):
        for table_name, frames in self.tables.items():
            self.assertTrue(frames, f"{table_name} must parse")
            for frame, rows in frames.items():
                for row in rows:
                    yield table_name, frame, row

    def test_every_component_has_a_url_safe_id(self):
        for table_name, frame, row in self.entries():
            component_id = row.get("id")
            label = f"{table_name}[{frame}] {row.get('name', '<unnamed>')}"
            self.assertIsInstance(component_id, str, f"{label} needs a stable id")
            self.assertRegex(component_id, ID_RE, f"{label} id is not URL-safe")

    def test_component_ids_are_globally_unique(self):
        seen = {}
        for table_name, frame, row in self.entries():
            component_id = row["id"]
            location = f"{table_name}[{frame}] {row.get('name', '<unnamed>')}"
            self.assertNotIn(
                component_id,
                seen,
                f"{component_id!r} is reused by {seen.get(component_id)} and {location}",
            )
            seen[component_id] = location


if __name__ == "__main__":
    unittest.main()
