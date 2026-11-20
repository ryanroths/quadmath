# Deploy the QuadMath sim weekly leaderboard

The sim works without this Worker. Online boards stay hidden until
`LEADERBOARD_URL` in `sim-retention.js` (or localStorage
`quadmathSimLeaderboardUrl`) is a `https://` origin.

Do **not** deploy from a cloud agent. Ryan deploys from a machine that is
logged into Cloudflare (`npx wrangler login`).

## Once

1. Node 22+ and npm (wrangler 4 needs Node 22).
2. From this folder:

   ```bash
   cd workers/sim-leaderboard
   npm install
   npx wrangler login
   ```

3. Create D1 and paste the printed `database_id` into `wrangler.jsonc`
   (`REPLACE_AFTER_D1_CREATE`):

   ```bash
   npx wrangler d1 create quadmath-sim-leaderboard
   ```

4. Apply schema (local + remote):

   ```bash
   npx wrangler d1 execute quadmath-sim-leaderboard --file=./src/schema.sql --local
   npx wrangler d1 execute quadmath-sim-leaderboard --file=./src/schema.sql --remote
   ```

5. `ALLOWED_ORIGIN` in `wrangler.jsonc` is `https://quadmath.com`. To run
   the Worker locally, see "Local" below: it overrides `ALLOWED_ORIGIN` with
   the local page's origin.

## Every release of this Worker

Ship only what is merged: deploy from the main checkout, on `main`, after
`git pull --ff-only`. Work on branches in their own worktrees
(`git worktree add`), never by switching this checkout off `main`.

First run the guard, `scripts/predeploy.mjs`, on its own. It deploys nothing:

```bash
cd workers/sim-leaderboard
npm run predeploy
```

Check the `PHYS_VER` it prints against the live `sim.html`'s (see below),
then deploy:

```bash
npm run deploy
```

`npm run deploy` runs the guard again and, if it passes, goes straight on to
`wrangler deploy --config wrangler.jsonc` with no pause. The guard fetches
`main` from origin and refuses, deploying nothing, unless:

- the checkout is on `main` (not another branch, not a detached HEAD),
- `main` is the same commit as `origin/main`, and
- nothing the Worker ships has uncommitted changes, staged or not: the
  tracked files in this folder and the modules `src/index.js` imports
  (`sim-retention.js`, `sim-share.js`). An imported module that git does not
  track also refuses. Untracked files here (such as `package-lock.json`) and
  uncommitted changes elsewhere in the repo do not.

It lists every reason it refuses. When it passes, it prints the commit and
the `PHYS_VER` the Worker will run. Boards are kept per `PHYS_VER` (see
"Checks"): a Worker and a page with different ones refuse each other's
submits, which is why that check comes before `npm run deploy`.
`npx wrangler deploy` skips the guard, so do not ship with it.

No D1 migration for the weekly id bump (`weekly-YYYY-Wxx-g2`). The Worker
imports `weeklyTrackFor` from `sim-retention.js`; after deploy it writes and
filters that new `track_id`. Old `weekly-YYYY-Wxx` rows stay in D1 but drop
off the board (empty week until new submits). The anticheat migrate is already
applied and is optional/idempotent:

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --file=./src/migrate-anticheat.sql --remote
```

The migrate file is idempotent (`CREATE TABLE IF NOT EXISTS pilots`,
`CREATE INDEX IF NOT EXISTS scores_rank_track`). It does not rewrite
existing scores. First submit of a name after this deploy claims that
pilot name to the browser's `quadmathSimPilotToken`.

Copy the `*.workers.dev` URL (no trailing slash), e.g.
`https://sim-leaderboard.<subdomain>.workers.dev`.

### The generated Daily and Boards

`sim-retention.js` generates the Rig's courses from the six Coach drills, and
the Worker bundles it as before, so it generates the same ones:

- From `RIG_GEN_WEEKLY_FROM` (2026-W46) Boards fly a five-drill Rig course
  seeded by the week (`weeklyTrackFor`); `/api/week`, `/api/board` and
  `/api/submit` use it.
- From `RIG_GEN_DAILY_FROM` (2026-11-04) the House Loop joins the Daily pool,
  so `/api/daily` (`dailyLineFor`) can draw it.

Deploy before the next UTC midnight after the merge, and before
`RIG_GEN_DAILY_FROM`. If the merge lands on or after that day, move it on to
the next UTC day first (and `RIG_GEN_WEEKLY_FROM` on to the next ISO week if
that week has begun; earlier days and weeks keep their courses), restamp and
deploy. No D1 migration: the track ids
are unchanged (`weekly-YYYY-Wxx-g2`, `daily-line-YYYY-MM-DD`).

## Point the sim at it

Pick one (first match wins):

1. Edit `LEADERBOARD_URL` in `sim-retention.js` to that URL, restamp
   (`python3 scripts/ci/stamp_asset_cache.py`), commit, deploy Pages.
2. In the browser console on `sim.html`:

   ```js
   localStorage.setItem('quadmathSimLeaderboardUrl', 'https://sim-leaderboard.<subdomain>.workers.dev')
   ```

3. Dev only, and only when the page itself is on localhost:
   `sim.html?lb=https://sim-leaderboard.<subdomain>.workers.dev`
   Production origins ignore `?lb=`.

Any host other than `https://sim-leaderboard.ryan-roths.workers.dev` (or
this machine) must also be added to `connect-src` in the
`<meta http-equiv="Content-Security-Policy">` at the top of `sim.html`.
Until it is, the page's requests to it are refused, with a
`[CSP] connect-src blocked ...` warning in the console.

Reload. Start menu → **Boards**: the card lists **Online · top 20** and
**This browser** apart, and the online list loads (or says "No online times
yet.") with no `ONLINE UNAVAILABLE` toast on **Refresh online** (and no
`[CSP]` warning in the console). A finish on this week's course, one pass
from gate 0 to the last gate (class 65 / 75 / 85 from Your build), submits. Pilot name is `quadmath_pilotName`. The per-browser claim token
is `quadmathSimPilotToken`.

## Checks

```bash
curl -sS https://sim-leaderboard.ryan-roths.workers.dev/health
curl -sS 'https://sim-leaderboard.ryan-roths.workers.dev/api/board?week=2026-W42&class=65'
```

Anti-cheat on POST `/api/submit`:

- Server derives the track from `week` via `weeklyTrackFor(week)` and
  rejects a mismatched or invalid track.
- `week` must be the current ISO week; the previous week is accepted
  only for 36 hours after Monday 00:00 UTC.
- Board GET filters by that week's track id.
- Ghost `phys` must equal current physics version (`PHYS_VER` in
  `sim-retention.js`: 7 since sim-core v0.7.0 turned the RPM filter off in
  the sim's policy, kept by v0.8.0, which changes only the config report and
  no trace, 6 since sim-core v0.6.0 put the 75 on the bf core
  (the Fractal75), 5 since sim-core v0.4.0's wall contact, 4 since the
  bf core became the default, 3 for the fixed 1 kHz cores before it).
- Every board is kept per physics version: `scores.week` holds
  `boardKeyFor(week)`, the week (or Daily Line `D`+day) plus `.p` and
  `PHYS_VER`, e.g. `2026-W46.p7`. A `PHYS_VER` bump needs no D1 migration:
  once deployed, the Worker reads and writes the new keys, the boards start
  empty, and the old rows stay in D1 unlisted. Deploy it when the page with
  the same `PHYS_VER` goes live: until then each side refuses the other's
  submits (`PHYS MISMATCH`).
- The run is one pass, as the page flies it (every track but the city
  loops is a line, `isLineTrackId`): the ghost passes gate 0, then every
  gate in order to the last (`lineRunPasses`, swept between samples), and
  ends on the finish frame, inside the last gate's sphere. A step may pass
  a gate at most 0.6 u outside its sphere, and steps are at most 500 ms
  apart. The time must be the ghost's, from the gate-0 sample to the last,
  plus whole 2 s miss penalties, within 150 ms. At most 1600 samples.
- Class must match submitted build `frameMm`; speeds use that class cap.
- Generated pace-bot ghosts are rejected.
- Pilot names follow `sim-pilot-names.js` (see "Built-in track boards,
  names and bans" below): 3 to 16 ASCII letters and digits with single
  separators, not reserved or blocked. A name is claimed under its key
  (look-alikes are one name) by the first browser to post under it; other
  tokens get `NAME TAKEN`.
- A run flown by a test's pilot (`_sim.setTestPilot`) is refused (`TEST
  PILOT`), as is a run already posted or shared under another name
  (`COPIED RUN`), and any post from a banned token (`BANNED`).
- CORS origin is `https://quadmath.com` (plus localhost when that var
  lists it).

Rate limits, per IP per UTC hour: 30 score posts (weekly, Daily Line,
builder and built-in boards, together) and, apart from them, 12 SHAREs
(`/api/line`). Reads are not limited.

## Weekly one-pass rule (first real rows)

Before this release the page flew the weekly course as one pass but the
Worker wanted three laps, and the page dropped every submit before sending
it: D1 held no score rows. After the page and this Worker are both live, a
finish on this week's course writes a row.

The page goes live when the PR merges (Pages). Deploy the Worker right
after, from the main checkout, through the guard (see "Every release of
this Worker" above):

```bash
git pull --ff-only
cd workers/sim-leaderboard
npm run predeploy
npm run deploy
```

Until the Worker is deployed, a weekly finish on the new page is refused by
the old Worker (toast `INCOMPLETE LAPS`, or `TIME MISMATCH` for a run with
misses) and stays on the local board only; it is not sent again. Deploying
this Worker before the merge would be safe (the old page never sends a
one-pass run), but it means deploying from a branch, which the predeploy
guard refuses; deploy from main right after the merge instead. No D1
migration.

A run that fails the page's own check now says so (`NOT SENT: <reason>`,
and a console warning) instead of being dropped silently.

To see the row land after a weekly finish (newest first):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "SELECT week, class, name, time_ms, track_id, datetime(submitted_ms/1000,'unixepoch') AS at FROM scores ORDER BY submitted_ms DESC LIMIT 10"
```

## Removing a row

`name` is the name as the board shows it and `week` the board key from the
query above (e.g. `2026-W47.p7`):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "DELETE FROM scores WHERE week='2026-W47.p7' AND class=65 AND name='SomeName'"
```

Built-in boards, freeing a name and bans: see "Built-in track boards, names
and bans" below.

## Built-in track boards, names and bans

Every race on a public map has its own board: `rig-loop`, `house-loop`,
`house-backyard-lap`, `depot-loop` and `bando-loop-v2`
(`sim-builtin-boards.js`, generated from `tracks/*.json` by
`node tools/build_builtin_boards.mjs --write`). Routes:

- `POST /api/builtin/submit` `{track, trackHash, frameMm, name, timeMs, ghost, build, token}`
- `GET /api/builtin/board?track=&class=[&name=]`: the top 20, the row count, the named pilot's place
- `GET /api/builtin/tops?class=`: each track's fastest
- `GET /api/builtin/ghost?track=&class=&name=`: a top-10 pilot's ghost

A board is keyed `b.` + 16 hex of the track's gates + `.p` + `PHYS_VER`: an
edit to a track's gates starts its boards clean once this Worker (with the
regenerated module) is deployed. Until then the Worker refuses runs from the
new page on that track (`TRACK CHANGED`). The run is checked against the
Worker's copy of the track, never one a client sent:

- one pass, every gate in order;
- the time is the ghost's plus whole miss penalties;
- the speed cap for the class, `PHYS_VER`;
- at the page's rate: the median step between samples at most 80 ms
  (`SPARSE SAMPLES`), so a turn can be seen, and up to 2800 samples;
- flown as a whoop can fly (`IMPLAUSIBLE FLIGHT` otherwise): the force on
  the quad at most 1.3 x its thrust plus drag, a few bumps allowed. A ghost
  drawn straight from gate to gate fails this; a smooth path scripted at
  the speed cap does not. On these boards only, not yet on the weekly or
  builder boards;
- not a pace bot, not a test pilot's run;
- not a copy (`COPIED RUN`): not the exact flight already posted or shared
  under another name, and not within 0.2 u (mean) of the path of a stored
  top-10 ghost under another name, however it was nudged or retimed. A
  SHARE notes its run as its name's only when the sharing browser holds
  that name.

A board keeps its 200 fastest per class, each row with its time, splits
and the ghost's digest. The full ghost is kept for the 10 fastest only,
stored as the board serves it (its samples under the pilot's claimed name;
at most 1600 samples, about 100 KB), so about 14 MB at most over the five
tracks' fifteen boards. A pilot who moves into the top 10 because rows
above were deleted has no ghost until their next better run. A run slower
than the 200th is not stored, and the reply gives its place. Builder boards
also keep their 200 fastest. A clean Daily Line (no modifier) on one of
these tracks is also posted to that track's board, when its ghost passes
these checks (the Daily's ghost is strided to 480 samples, so on a run over
about 40 s it is too sparse and only the Daily Line board takes it).

Names (`sim-pilot-names.js`), on every board:

- 3 to 16 characters: ASCII letters and digits, with single spaces, dots,
  dashes or underscores between them. At least one letter.
- A name is claimed under its key: lower case, separators dropped,
  look-alikes folded (0 o, 1 i l, 3 e, 4 a, 5 s, 7 t, v u). "RyFly",
  "ry_fly", "RYFLY", "Ry Fly", "RyFIy" and "RyF1y" are one name. The first
  token to post under a key holds it, and the boards show the name it was
  claimed with.
- Refused: no name or the default `PILOT` (`SET A NAME`); anything outside
  the rules (`BAD NAME`); reserved names, a blocked word anywhere in the
  key, or a word in D1's `blocked_names` (`NAME NOT ALLOWED`).

### Deploy (in this order)

The migration first: the new Worker reads its tables, and the old Worker
never touches them.

1. Merge the PR (Pages ships the page).
2. From the main checkout:

```bash
git pull --ff-only
```

```bash
cd workers/sim-leaderboard
```

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --file=./src/migrate-builtin-boards.sql
```

Check that the tables are there (it errors with `no such table` if not):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "SELECT COUNT(*) FROM pilot_keys, bans, blocked_names, ghost_digests, track_scores, track_ghosts"
```

```bash
npm run predeploy
```

Check that its `PHYS_VER` line shows 7 and its `bundles` line lists
`sim-builtin-boards.js` and `sim-pilot-names.js`, then:

```bash
npm run deploy
```

Then run the migration once more: the old Worker kept claiming new names in
`pilots` until this deploy, and this carries those over too (it is
idempotent, and keeps every claim already made).

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --file=./src/migrate-builtin-boards.sql
```

3. Check:

```bash
curl.exe -sS "https://sim-leaderboard.ryan-roths.workers.dev/api/builtin/tops?class=65"
```

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "SELECT key, name FROM pilot_keys"
```

The first lists the five tracks with `"top":null`. The second shows each
earlier claim under its key (`ryfly | RyFly`).

Never `migrations apply`: production's `d1_migrations` table is empty.

Deployed before the migration, the new Worker answers the routes that need
the new tables with `503 NOT MIGRATED` (the boards' reads keep working):
run the migration, nothing else is needed.

Between the merge and the Worker deploy:

- this release's page sends no built-in submits (the boards' page comes
  next);
- its SHAREs carry the pilot token, which the old Worker ignores;
- a test pilot's runs are never sent, shared or counted locally;
- a name the new rules refuse is not sent: the page says why ("SET A PILOT
  NAME" or "PILOT NAME BAD NAME", with the rule) instead of posting it.

Once the new Worker is live:

- a page from before this release still posts. A name the rules refuse
  gets that reason back as a toast.
- its SHARE gets `NO TOKEN` and copies the long link instead.

### One-line commands

A pilot is found by their key, from `pilot_keys` (`SELECT key, name FROM
pilot_keys WHERE name LIKE '%fly%'`):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "DELETE FROM track_scores WHERE name_key='somekey'; DELETE FROM track_ghosts WHERE name_key='somekey'; DELETE FROM track_held WHERE name_key='somekey'"
```

deletes their rows on every built-in board (add `AND track_id='rig-loop'`
to each statement for one track).

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "INSERT OR IGNORE INTO bans (token_hash, reason, created_ms) SELECT token_hash, 'why', strftime('%s','now')*1000 FROM pilot_keys WHERE key='somekey'"
```

bans the browser that holds a name: its score posts and SHAREs are refused
(`BANNED`; a SHARE needs the token). A ban is per browser token: clearing
the browser's storage gives a new token, which needs a new name.

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "DELETE FROM bans WHERE token_hash=(SELECT token_hash FROM pilot_keys WHERE key='somekey')"
```

lifts that ban.

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "INSERT OR IGNORE INTO blocked_names (word) VALUES ('someword')"
```

blocks a word anywhere in a name's key, from the next minute.

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "DELETE FROM scores WHERE name=(SELECT name FROM pilot_keys WHERE key='somekey'); DELETE FROM custom_scores WHERE name=(SELECT name FROM pilot_keys WHERE key='somekey'); DELETE FROM track_scores WHERE name_key='somekey'; DELETE FROM track_ghosts WHERE name_key='somekey'; DELETE FROM track_held WHERE name_key='somekey'; DELETE FROM ghost_digests WHERE name_key='somekey'; DELETE FROM pilot_keys WHERE key='somekey'"
```

frees a name for the next browser to post under it, with its rows on every
board, so the next holder starts with none of them.

### Held runs (faster than a board's floor)

Each built-in board has a floor per class: the time to fly the track's gate
path (gate 0's centre to each next gate's, to the last) at the class's speed
cap the whole way, x 1.10 (`builtinFloorMs` in `sim-retention.js`, from the
track's gates; the page computes the same, `_sim.builtinFloorMs(track,
class)`). A run faster than its floor is held:

- stored in `track_held`, with its ghost: the pilot's fastest held run per
  board per class;
- out of the board's list, its count, every place, `/api/builtin/tops`, the
  ghosts served and the 200-row trim, so it pushes no run off a board;
- answered as if stored: the pilot gets their time, place and the top 20
  with it in, no error and no toast. Their public row, if any, stays.

A clean Daily Line under the floor on one of these tracks is held the same
way (the Daily Line board itself takes it as before).

Deploy: the migration first, then the Worker (the Worker before it never
touches `track_held`; this one, on a database without it, answers a held
run with `503 NOT MIGRATED`):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --file=./src/migrate-board-floor.sql
```

It is idempotent (`CREATE TABLE IF NOT EXISTS`). Never `migrations apply`.

List the held runs, newest first (times in ms; `name_key` and `track_id`
are what the commands below take):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "SELECT board, class, name, time_ms, floor_ms, datetime(submitted_ms / 1000, 'unixepoch') AS submitted, track_id, name_key FROM track_held ORDER BY submitted_ms DESC"
```

Approve one (`somekey`'s held run on `rig-loop`, class 65): it goes onto
the board as a run of theirs (if faster than their row there), its ghost
with it while it is in the top 10, and the board is trimmed to its 200
fastest and 10 ghosts again:

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "INSERT INTO track_scores (board, class, name_key, name, time_ms, splits, digest, track_id, submitted_ms) SELECT board, class, name_key, name, time_ms, splits, digest, track_id, submitted_ms FROM track_held WHERE name_key='somekey' AND track_id='rig-loop' AND class=65 ON CONFLICT(board, class, name_key) DO UPDATE SET name = excluded.name, time_ms = excluded.time_ms, splits = excluded.splits, digest = excluded.digest, submitted_ms = excluded.submitted_ms WHERE excluded.time_ms < track_scores.time_ms; INSERT INTO track_ghosts (board, class, name_key, ghost, time_ms, track_id, path) SELECT board, class, name_key, ghost, time_ms, track_id, path FROM track_held WHERE name_key='somekey' AND track_id='rig-loop' AND class=65 ON CONFLICT(board, class, name_key) DO UPDATE SET ghost = excluded.ghost, time_ms = excluded.time_ms, path = excluded.path WHERE excluded.time_ms < track_ghosts.time_ms; DELETE FROM track_held WHERE name_key='somekey' AND track_id='rig-loop' AND class=65; DELETE FROM track_scores WHERE rowid IN (SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (PARTITION BY board, class ORDER BY time_ms, submitted_ms) AS r FROM track_scores) WHERE r > 200); DELETE FROM track_ghosts WHERE NOT EXISTS (SELECT 1 FROM (SELECT board, class, name_key, ROW_NUMBER() OVER (PARTITION BY board, class ORDER BY time_ms, submitted_ms) AS r FROM track_scores) s WHERE s.board = track_ghosts.board AND s.class = track_ghosts.class AND s.name_key = track_ghosts.name_key AND s.r <= 10)"
```

Reject one: the run is deleted. Its digest stays in `ghost_digests`, so the
same flight is refused under another name. Add a ban (above) if needed.

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "DELETE FROM track_held WHERE name_key='somekey' AND track_id='rig-loop' AND class=65"
```

The first real held runs are the data `IMPLAUSIBLE FLIGHT`'s threshold is
calibrated on. It is not changed with the floor.

## "Fly my line" (`/api/line`)

`POST /api/line` keeps a line code (`sim-share.js`: every SHARE posts one) in
the `lines` table, under an id made from its content, and returns the id;
`GET /api/line?id=` gives the code back. It shares the rate limit above.

Before the first deploy with these routes, add the table (idempotent):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --file=./src/migrate-lines.sql --remote
```

Until a Worker with these routes is live, SHARE copies the long link
instead, and links that carry the ghost in the URL work without it.

## Builder track boards (`/api/track/submit`, `/api/track/board`)

Online boards for builder tracks: the ones a pilot builds, saves, or opens
from a `#trk=` link. A board is keyed by the track itself
(`sim-retention.js` `customBoardKey`: `c.` + 16 hex of SHA-256 over the map
and the gates + `.p` + `PHYS_VER`), which the Worker computes from the track
each run is submitted with. Runs go into `custom_scores` (a pilot's best per
board and class, as `scores`), and the track's code into `custom_tracks` on its
first accepted run. `scores`, the weekly and daily routes and `PHYS_VER` are
unchanged.

Caps: a track needs 3 gates (`CUSTOM_TRACK_MIN_GATES`), and its share code at
most 4096 characters (`CUSTOM_TRACK_CODE_MAX`, about 65 gates). The run must
be at least 2.5 s (the Daily Line's floor) and is checked like a weekly run
(`validateSubmittedRun`: one pass, gates in order, speed, time). Posts share
the 12 / IP / hour rate limit.

Deploy order (the page copes with either order: until the Worker answers
these routes, a 404 hides the board quietly):

1. Merge the PR (Pages ships the page).
2. From the main checkout, add the tables, then deploy through the guard:

   ```bash
   git pull --ff-only
   cd workers/sim-leaderboard
   npx wrangler d1 execute quadmath-sim-leaderboard --file=./src/migrate-track-boards.sql --remote
   npm run predeploy
   npm run deploy
   ```

   The migration is idempotent (`IF NOT EXISTS`) and touches only the two new
   tables. Run it before `npm run deploy`: the new routes need the tables.

3. Check:

   ```bash
   curl -sS 'https://sim-leaderboard.ryan-roths.workers.dev/api/track/board?key=c.0123456789abcdef.p7&class=65'
   curl -sS 'https://sim-leaderboard.ryan-roths.workers.dev/api/track/board?key=bad'
   ```

   The first answers `{"ok":true,...,"entries":[],"online":true}`, the second
   `{"ok":false,"reason":"BAD KEY"}` (400). In the sim, a finished run on a
   builder track (or a `#trk=` link) shows "<track name> · online" under the
   result on the lap panel.

To see the rows:

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "SELECT key, class, name, time_ms, datetime(submitted_ms/1000,'unixepoch') AS at FROM custom_scores ORDER BY submitted_ms DESC LIMIT 10"
```

Removing a row: `DELETE FROM custom_scores WHERE key='c.…' AND class=65 AND name='SomeName'`.

## Anonymous flight counts (`/api/count`)

How far visitors get, as daily totals. The sim sends one small ping per event,
each at most once per page load (`sim-retention.js` `COUNT_EVENTS`):

| event | when |
|---|---|
| `ready` | the sim has loaded and the class's core flies (Betaflight once it has taken over) |
| `arm` | the first arm |
| `flew30` | 30 s of sim time armed and in the air |
| `pack2` | a fresh pack after an arm (a second pack started) |
| `lap` | the first timed lap finished (a loop's lap, a line's finish) |
| `name` | a board took a run under the pilot's name, which claims it |

A ping carries only the event, the class (65/75/85), the core (bf/js) and the
input (radio/gamepad/keyboard/touch). Nothing is stored on the device: no
cookie, no localStorage, no id; the flags live in the page's memory. No pings
at all with Global Privacy Control or Do Not Track on, on localhost, under
`?dev=1`, or once a test's pilot has flown (`_sim.setTestPilot`).

`POST /api/count` checks the ping against the allowed values (anything else
is a 400 and writes nothing), refuses a page served by another origin (403),
and adds one to `counts` for the UTC day, event, class, core and input. The
table has no address, no user agent and no time finer than the day.

Rate limit: 30 pings per client per UTC hour (`RATE_COUNT_MAX`: five full
funnels), in `rate_limit`'s own `count` bucket, so it never uses up the
boards' 30 or SHARE's 12. The bucket never stores the address: its key is an
HMAC-SHA-256 of the address and the hour under the `COUNT_KEY` secret, a new
one every hour, and its rows from earlier hours are deleted as each hour's
first ping from a client lands. Without `COUNT_KEY` the route answers 503
(`NOT CONFIGURED`) and counts nothing.

Deploy order (the page copes with either: until the Worker answers, a ping
fails quietly):

1. Merge the PR (Pages ships the page).
2. From the main checkout, add the table and the index, set the secret once,
   then deploy through the guard:

   ```bash
   git pull --ff-only
   cd workers/sim-leaderboard
   npx wrangler d1 execute quadmath-sim-leaderboard --remote --file=./src/migrate-counts.sql
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   npx wrangler secret put COUNT_KEY
   npm run predeploy
   npm run deploy
   ```

   Paste the printed value when `wrangler secret put` asks for it (it is
   never needed again; a new one only restarts the hour's limit). The
   migration is idempotent (`IF NOT EXISTS`), safe to run twice, and changes
   no rows: it adds `counts` and an index on `rate_limit (window)`.
   `npm run predeploy` prints PHYS_VER 7: no board changes.

3. Check: a ping is taken, a bad one refused:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: https://quadmath.com' --data '{"event":"ready","class":65,"core":"bf","input":"keyboard"}' https://sim-leaderboard.ryan-roths.workers.dev/api/count
   curl -sS -X POST -H 'Origin: https://quadmath.com' --data '{"event":"hello","class":65,"core":"bf","input":"keyboard"}' https://sim-leaderboard.ryan-roths.workers.dev/api/count
   ```

   The first prints `204`, the second `{"ok":false,"reason":"BAD EVENT"}`
   (400). The check's own ping is one `ready` in today's counts.

The last 14 days as a funnel per day:

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "SELECT day, SUM(CASE WHEN event = 'ready' THEN n ELSE 0 END) AS ready, SUM(CASE WHEN event = 'arm' THEN n ELSE 0 END) AS arm, SUM(CASE WHEN event = 'flew30' THEN n ELSE 0 END) AS flew30, SUM(CASE WHEN event = 'pack2' THEN n ELSE 0 END) AS pack2, SUM(CASE WHEN event = 'lap' THEN n ELSE 0 END) AS lap, SUM(CASE WHEN event = 'name' THEN n ELSE 0 END) AS name FROM counts WHERE day >= date('now', '-13 days') GROUP BY day ORDER BY day DESC"
```

The same, split by input:

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --remote --command "SELECT day, input, SUM(CASE WHEN event = 'ready' THEN n ELSE 0 END) AS ready, SUM(CASE WHEN event = 'arm' THEN n ELSE 0 END) AS arm, SUM(CASE WHEN event = 'flew30' THEN n ELSE 0 END) AS flew30, SUM(CASE WHEN event = 'pack2' THEN n ELSE 0 END) AS pack2, SUM(CASE WHEN event = 'lap' THEN n ELSE 0 END) AS lap, SUM(CASE WHEN event = 'name' THEN n ELSE 0 END) AS name FROM counts WHERE day >= date('now', '-13 days') GROUP BY day, input ORDER BY day DESC, ready DESC"
```

Days are UTC (`date('now')` in D1 is UTC). For class or core, put `class` or
`core` where `input` is.

Cost: a page load sends at most six pings, so six requests. Rows written, as
D1 counts them (an index entry is a row; measured on a local D1): the
client's first ping in an hour 3 for its rate row, 1 for its counts row, and
about 1 more for deleting an earlier hour's row; each further ping 2 (its rate
row and its counts row). That is 2k + 3 for k pings: 5 for a visit that only
loads, 15 for one that does all six. Per 1,000 visitors a day: 1,000 to 6,000
requests (Workers Free: 100,000 a day) and 5,000 to 15,000 rows written (D1
Free: 100,000 a day, shared with the boards; at the limit D1 refuses every
query, the boards' too, until 00:00 UTC). Reads are a few rows a ping (the
prune is a range on `rate_limit_window`), under 25,000 per 1,000 visitors
against 5,000,000. `counts` grows by at most 144 rows a day (6 events x 3
classes x 2 cores x 4 inputs).

## Local

The client takes `https://` leaderboard URLs only, so run the Worker over
https, on a local D1 with its tables made first:

```bash
cd workers/sim-leaderboard
npx wrangler d1 execute quadmath-sim-leaderboard --local --file=./src/schema.sql
npx wrangler dev --local-protocol https --ip 127.0.0.1 --port 8787 --var ALLOWED_ORIGIN:http://127.0.0.1:4173
```

and, in another terminal, serve the site from the repo root (`python` on
Windows):

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `https://127.0.0.1:8787/health` once and accept wrangler's self-signed
certificate, then open `http://127.0.0.1:4173/sim.html?lb=https://127.0.0.1:8787`.
`?lb=` is honored only on a localhost page. To check it: Start menu →
**Boards** → **Refresh online** shows the (empty) board with no
`ONLINE UNAVAILABLE` toast, and SHARE on a finished run says
`SHORT LINK COPIED` (not `LONG LINK COPIED`): the line is stored in the
local D1. No `[CSP]` warning in the console.

The page's Content-Security-Policy lets it connect to this machine
(`localhost` and `127.0.0.1`, any port) and to the deployed Worker. A
tunnel, or a Worker on another `workers.dev` subdomain, is refused until its
host is added to `connect-src` in `sim.html` (see "Point the sim at it").
