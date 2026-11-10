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

From the repo root, after this anti-cheat change is on the branch you are
shipping:

```bash
cd workers/sim-leaderboard
npx wrangler deploy
```

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

Reload. Start menu → **Boards**: the card says "Online: on.", and
**Refresh online** loads the board with no `ONLINE UNAVAILABLE` toast (and
no `[CSP]` warning in the console). A 3-lap finish on this week's course
(class 65 / 75 / 85 from Your build) can submit. Pilot name is `quadmath_pilotName`. The per-browser claim token
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
  `sim-retention.js`: 6 since sim-core v0.6.0 put the 75 on the bf core
  (the Fractal75), 5 since sim-core v0.4.0's wall contact, 4 since the
  bf core became the default, 3 for the fixed 1 kHz cores before it).
- Every board is kept per physics version: `scores.week` holds
  `boardKeyFor(week)`, the week (or Daily Line `D`+day) plus `.p` and
  `PHYS_VER`, e.g. `2026-W44.p6`. A `PHYS_VER` bump needs no D1 migration:
  once deployed, the Worker reads and writes the new keys, the boards start
  empty, and the old rows stay in D1 unlisted. Deploy it when the page with
  the same `PHYS_VER` goes live: until then each side refuses the other's
  submits (`PHYS MISMATCH`).
- Class must match submitted build `frameMm`; speeds use that class cap.
- Generated pace-bot ghosts are rejected.
- Pilot names are sanitized (Unicode letters, length cap). First browser
  to use a name claims it; other tokens get `NAME TAKEN`.
- CORS origin is `https://quadmath.com` (plus localhost when that var
  lists it).

Rate limit is 12 posts / IP / UTC hour.

## "Fly my line" (`/api/line`)

`POST /api/line` keeps a line code too long for a link (`sim-share.js`) in
the `lines` table, under an id made from its content, and returns the id;
`GET /api/line?id=` gives the code back. It shares the rate limit above.

Before the first deploy with these routes, add the table (idempotent):

```bash
npx wrangler d1 execute quadmath-sim-leaderboard --file=./src/migrate-lines.sql --remote
```

Until a Worker with these routes is live, SHARE copies the long link
instead, and links that carry the ghost in the URL work without it.

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
`ONLINE UNAVAILABLE` toast, and SHARE on a run too long for a link says
`LINK COPIED — RACE MY LINE` with no `LONG LINK`: the line is stored in the
local D1. No `[CSP]` warning in the console.

The page's Content-Security-Policy lets it connect to this machine
(`localhost` and `127.0.0.1`, any port) and to the deployed Worker. A
tunnel, or a Worker on another `workers.dev` subdomain, is refused until its
host is added to `connect-src` in `sim.html` (see "Point the sim at it").
