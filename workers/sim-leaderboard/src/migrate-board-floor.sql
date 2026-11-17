-- Held runs on the built-in track boards (DEPLOY.md, "Held runs").
-- Idempotent: CREATE ... IF NOT EXISTS only; safe to run again. Run it before
-- deploying the Worker that writes the table; the Worker before it never
-- reads it.

-- A built-in board's held runs: faster than the board's floor
-- (sim-retention.js builtinFloorMs, the gate path at the class's speed cap
-- x 1.10). One per pilot per board per class (their fastest held), with its
-- ghost, out of every public list, count, place and trim until approved onto
-- the board, or rejected (DEPLOY.md).
CREATE TABLE IF NOT EXISTS track_held (
  board TEXT NOT NULL,
  class INTEGER NOT NULL,
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  floor_ms INTEGER NOT NULL,
  splits TEXT NOT NULL DEFAULT '[]',
  digest TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  ghost TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  submitted_ms INTEGER NOT NULL,
  PRIMARY KEY (board, class, name_key)
);
