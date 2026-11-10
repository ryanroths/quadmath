-- "Fly my line" (sim-share.js): the table POST /api/line stores to.
-- Idempotent; safe to run on a database that already has it.
CREATE TABLE IF NOT EXISTS lines (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
