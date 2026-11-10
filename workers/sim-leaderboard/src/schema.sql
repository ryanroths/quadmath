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

-- "Fly my line" (sim-share.js): line codes too long for a link, by content id.
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
