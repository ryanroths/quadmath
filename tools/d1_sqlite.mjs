// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// A D1 for the leaderboard Worker's tests: real SQLite (node:sqlite, in
// memory), made from workers/sim-leaderboard/src/schema.sql, with D1's
// prepare / bind / first / all / run / batch. So the tests run the Worker's
// own SQL, as D1 runs it, instead of matching statements by their text.
//
// Views the older tests read, built from the tables on each access:
//   lines   Map id -> code             (lines)
//   tracks  Map key -> row             (custom_tracks)
//   scores  Map 'key|class|name' -> row (custom_scores)
//   pilots  Map key -> token_hash      (pilot_keys)
//   rate    Map 'ip|window' -> n       (rate_limit)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const LEADERBOARD_SQL_DIR = join(root, 'workers', 'sim-leaderboard', 'src');

const plain = (row) => (row ? { ...row } : row);

// files: SQL files (names in LEADERBOARD_SQL_DIR, or paths) run in order on
// the fresh database; default schema.sql.
export function sqliteD1({ files = ['schema.sql'] } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const f of files) db.exec(readFileSync(f.includes('/') || f.includes('\\') ? f : join(LEADERBOARD_SQL_DIR, f), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    async first(col) {
      const row = db.prepare(sql).get(...args);
      if (row === undefined) return null;
      return col ? row[col] : plain(row);
    },
    async all() {
      return { results: db.prepare(sql).all(...args).map(plain), success: true, meta: {} };
    },
    async run() {
      const info = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
    },
  });
  const rows = (sql) => db.prepare(sql).all().map(plain);
  return {
    prepare: (sql) => statement(sql),
    async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
    exec: (sql) => db.exec(sql),
    rows,
    sqlite: db,
    get lines() { return new Map(rows('SELECT id, code FROM lines').map((r) => [r.id, r.code])); },
    get tracks() { return new Map(rows('SELECT * FROM custom_tracks').map((r) => [r.key, r])); },
    get scores() { return new Map(rows('SELECT * FROM custom_scores').map((r) => [r.key + '|' + r.class + '|' + r.name, r])); },
    get pilots() { return new Map(rows('SELECT key, token_hash FROM pilot_keys').map((r) => [r.key, r.token_hash])); },
    get rate() { return new Map(rows('SELECT ip, window, n FROM rate_limit').map((r) => [r.ip + '|' + r.window, r.n])); },
  };
}
