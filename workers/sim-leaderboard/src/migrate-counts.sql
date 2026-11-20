-- Anonymous daily flight counts (POST /api/count, sim-retention.js
-- COUNT_EVENTS). Idempotent: CREATE TABLE IF NOT EXISTS only, safe to run
-- twice, and it touches no other table.
--   npx wrangler d1 execute quadmath-sim-leaderboard --remote --file=./src/migrate-counts.sql
--
-- One row per UTC day, event, class, core and input: the day's total, n.
-- No address, no agent, no time finer than the day. WITHOUT ROWID: the key is
-- the table, so a ping is one row written (a new row or n + 1), with no index
-- row beside it.
CREATE TABLE IF NOT EXISTS counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  class INTEGER NOT NULL,
  core TEXT NOT NULL,
  input TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, event, class, core, input)
) WITHOUT ROWID;
