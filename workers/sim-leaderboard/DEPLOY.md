# Deploy the QuadMath sim weekly leaderboard

The sim works without this Worker. Online boards stay hidden until
`LEADERBOARD_URL` in `sim-retention.js` (or localStorage
`quadmathSimLeaderboardUrl`) is a `https://` origin.

Do **not** deploy from a cloud agent. Ryan deploys from a machine that is
logged into Cloudflare (`npx wrangler login`).

## Once

1. Node 20+ and npm.
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

5. `ALLOWED_ORIGIN` in `wrangler.jsonc` is `https://quadmath.com`. For local
   `wrangler dev`, override with a comma-separated list that includes
   localhost, e.g.

   ```bash
   npx wrangler dev --var ALLOWED_ORIGIN:https://quadmath.com,http://localhost:4173,http://127.0.0.1:5500
   ```

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

Reload. Start menu → **Boards** should show an Online column. A 3-lap
finish on this week's course (class 65 / 75 / 85 from Your build) can
submit. Pilot name is `quadmath_pilotName`. The per-browser claim token
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
  `sim-retention.js`: 4 since the bf core became the default, 3 for the
  fixed 1 kHz cores before it).
- Every board is kept per physics version: `scores.week` holds
  `boardKeyFor(week)`, the week (or Daily Line `D`+day) plus `.p` and
  `PHYS_VER`, e.g. `2026-W44.p4`. A `PHYS_VER` bump needs no D1 migration:
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

## Local

```bash
npx wrangler dev --var ALLOWED_ORIGIN:https://quadmath.com,http://localhost:4173,http://127.0.0.1:8787
# then open sim.html on localhost; ?lb=https://... is honored only there.
# http://127.0.0.1:8787 is ignored by the client (https only). Use a
# tunnel or set LEADERBOARD_URL_KEY after deploying.
```

The client only accepts `https://` URLs so a Pages origin talking to
plain `wrangler dev` will stay on local boards. That is intentional.
