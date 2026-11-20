-- Anonymous daily flight counts (POST /api/count; sim-retention.js
-- COUNT_EVENTS). Idempotent: every statement is IF NOT EXISTS, so it is safe
-- to run twice, and it changes no other table's rows.
--   npx wrangler d1 execute quadmath-sim-leaderboard --remote --file=./src/migrate-counts.sql
--
-- One row per UTC day, event, class, core and input: the day's total, n.
-- No address, no agent, no time finer than the day.
CREATE TABLE IF NOT EXISTS counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  class INTEGER NOT NULL,
  core TEXT NOT NULL,
  input TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, event, class, core, input)
);

-- The rate limit's table, as schema.sql has it (already there on a deployed
-- database), and an index on its window: the 'count' bucket deletes its rows
-- from earlier hours by window, a range on this index rather than a scan.
CREATE TABLE IF NOT EXISTS rate_limit (
  ip TEXT NOT NULL,
  window TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (ip, window)
);
CREATE INDEX IF NOT EXISTS rate_limit_window ON rate_limit (window);
