-- QuadMath sim W5 weekly leaderboard (D1).
CREATE TABLE IF NOT EXISTS scores (
  week TEXT NOT NULL,
  class INTEGER NOT NULL,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  track_id TEXT NOT NULL,
  submitted_ms INTEGER NOT NULL,
  PRIMARY KEY (week, class, name)
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (week, class, time_ms);
CREATE INDEX IF NOT EXISTS scores_rank_track ON scores (week, class, track_id, time_ms);

CREATE TABLE IF NOT EXISTS rate_limit (
  ip TEXT NOT NULL,
  window TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (ip, window)
);
-- The 'count' bucket prunes its earlier hours by window (migrate-counts.sql).
CREATE INDEX IF NOT EXISTS rate_limit_window ON rate_limit (window);

-- Anonymous daily flight counts (migrate-counts.sql, POST /api/count): the
-- UTC day's total per event, class, core and input. No address, no agent,
-- no time finer than the day.
CREATE TABLE IF NOT EXISTS counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  class INTEGER NOT NULL,
  core TEXT NOT NULL,
  input TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, event, class, core, input)
);

-- "Fly my line" (sim-share.js): line codes behind short links, by content id.
CREATE TABLE IF NOT EXISTS lines (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pilots (
  name TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  claimed_ms INTEGER NOT NULL
);

-- Custom track boards (migrate-track-boards.sql): keyed by sim-retention.js
-- customBoardKey, which the Worker computes from the submitted track.
CREATE TABLE IF NOT EXISTS custom_tracks (
  key TEXT PRIMARY KEY,
  map TEXT NOT NULL,
  gates INTEGER NOT NULL,
  code TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_scores (
  key TEXT NOT NULL,
  class INTEGER NOT NULL,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  submitted_ms INTEGER NOT NULL,
  PRIMARY KEY (key, class, name)
);
CREATE INDEX IF NOT EXISTS custom_scores_rank ON custom_scores (key, class, time_ms);

-- Built-in track boards, name keys, bans, blocked words, run digests
-- (migrate-builtin-boards.sql).
-- A pilot's name, claimed under its key (sim-pilot-names.js pilotNameKey:
-- lower case, separators dropped, look-alikes folded) by the first token to
-- post under it. The name is the one the boards show.
CREATE TABLE IF NOT EXISTS pilot_keys (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  claimed_ms INTEGER NOT NULL
);

-- A banned pilot token (its SHA-256, as pilot_keys and pilots hold it): its
-- score submits and shares are refused.
CREATE TABLE IF NOT EXISTS bans (
  token_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_ms INTEGER NOT NULL DEFAULT 0
);

-- Words refused anywhere in a name's key, besides sim-pilot-names.js's own.
CREATE TABLE IF NOT EXISTS blocked_names (
  word TEXT PRIMARY KEY
);

-- A posted or shared run's ghost digest (sim-retention.js ghostDigest) and
-- the name key it came under: the same run under another name is refused.
CREATE TABLE IF NOT EXISTS ghost_digests (
  digest TEXT PRIMARY KEY,
  name_key TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);

-- Built-in track boards: board is sim-retention.js builtinBoardKey ('b.' +
-- 16 hex of the track's gates + '.p' + PHYS_VER). One row per pilot per board
-- per class, the 200 fastest kept, with the run's splits (JSON, ms from gate
-- 0) and its ghost's digest.
CREATE TABLE IF NOT EXISTS track_scores (
  board TEXT NOT NULL,
  class INTEGER NOT NULL,
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  splits TEXT NOT NULL DEFAULT '[]',
  digest TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  submitted_ms INTEGER NOT NULL,
  PRIMARY KEY (board, class, name_key)
);
CREATE INDEX IF NOT EXISTS track_scores_rank ON track_scores (board, class, time_ms, submitted_ms);

-- The full ghost of a built-in board's 10 fastest only.
CREATE TABLE IF NOT EXISTS track_ghosts (
  board TEXT NOT NULL,
  class INTEGER NOT NULL,
  name_key TEXT NOT NULL,
  ghost TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  track_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (board, class, name_key)
);

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
