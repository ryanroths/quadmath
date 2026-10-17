-- Anti-cheat follow-up for the weekly leaderboard (D1).
-- Safe to re-run: CREATE INDEX / CREATE TABLE IF NOT EXISTS.
-- Apply remote after deploying this Worker (see DEPLOY.md).

CREATE INDEX IF NOT EXISTS scores_rank_track ON scores (week, class, track_id, time_ms);

CREATE TABLE IF NOT EXISTS pilots (
  name TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  claimed_ms INTEGER NOT NULL
);
