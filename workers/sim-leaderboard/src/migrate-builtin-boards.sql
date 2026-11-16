-- Built-in track boards, pilot name keys, bans, blocked words, run digests.
-- Idempotent: CREATE ... IF NOT EXISTS and INSERT OR IGNORE only; safe to run
-- again. Run it before deploying the Worker that reads these tables
-- (DEPLOY.md); the Worker before it never reads them.

-- A pilot's name, claimed under its key (sim-pilot-names.js pilotNameKey:
-- lower case, separators dropped, look-alikes folded) by the first token to
-- post under it. The name is the one the boards show.
CREATE TABLE IF NOT EXISTS pilot_keys (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  claimed_ms INTEGER NOT NULL
);

-- The claims made before name keys (pilots, by exact name) carry over, each
-- under its key; the first claim of a key wins. The SQL below is
-- pilotNameKey for the ASCII names a board takes
-- (tools/test_leaderboard_builtin_boards.mjs checks it against the JS).
INSERT OR IGNORE INTO pilot_keys (key, name, token_hash, claimed_ms)
  SELECT
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(name)), ' ', ''), '.', ''), '-', ''), '_', ''), 'vv', 'w'), 'rn', 'm'), '0', 'o'), '1', 'l'), 'i', 'l'), '2', 'z'), '3', 'e'), '4', 'a'), '5', 's'), '6', 'b'), '7', 't'), '8', 'b'), '9', 'g'), 'v', 'u'),
    trim(name), token_hash, claimed_ms
  FROM pilots ORDER BY claimed_ms ASC;

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
  PRIMARY KEY (board, class, name_key)
);
