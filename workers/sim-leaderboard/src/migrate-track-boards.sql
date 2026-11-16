-- Custom track boards (builder tracks, #trk= links): POST /api/track/submit
-- and GET /api/track/board. A board's key is sim-retention.js customBoardKey:
-- 'c.' + 16 hex of SHA-256 of the map and gates + '.p' + PHYS_VER, computed by
-- the Worker from the submitted track. custom_tracks gets a row on a track's
-- first accepted run only. Idempotent; safe to run again.
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
