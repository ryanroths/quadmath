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

5. Optional: set `ALLOWED_ORIGIN` in `wrangler.jsonc` to
   `https://quadmath.com` instead of `*`.

## Every release of this Worker

```bash
cd workers/sim-leaderboard
npx wrangler deploy
```

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

3. Dev only: `sim.html?lb=https://sim-leaderboard.<subdomain>.workers.dev`

Reload. Start menu → **Boards** should show an Online column. A 3-lap
finish on this week's course (class 65 / 75 / 85 from Your build) can
submit. Pilot name is `quadmath_pilotName`.

## Checks

```bash
curl -sS https://sim-leaderboard.<subdomain>.workers.dev/health
curl -sS 'https://sim-leaderboard.<subdomain>.workers.dev/api/board?week=2026-W42&class=65'
```

Anti-cheat (sample timing, 3 sequential gate laps, class speed cap) runs
on POST `/api/submit`. Rate limit is 12 posts / IP / UTC hour.

## Local

```bash
npx wrangler dev
# then sim.html?lb=http://127.0.0.1:8787  — http is ignored by the client
# (https only). Use a tunnel or set LEADERBOARD_URL_KEY after deploying.
```

The client only accepts `https://` URLs so a Pages origin talking to
plain `wrangler dev` will stay on local boards. That is intentional.
