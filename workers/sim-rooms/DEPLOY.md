# Deploy the QuadMath sim ghost rooms

Ghost rooms: up to 4 pilots fly one map together (Esc → **Room** in
`sim.html`). Freestyle only, no timing, no boards, no collision between
quads: the others are ghost quads with name tags and their own motor sound.
One Durable Object (`Room`, `src/room.js`) per 4-letter room code, and
one (`CreateLimit`, `src/limit.js`) per client IP for the create limit.

The sim works without this Worker. Until it is deployed, Create and Join
toast `ROOMS OFFLINE`.

Do **not** deploy from a cloud agent. Ryan deploys from a machine that is
logged into Cloudflare (`npx wrangler login`).

## Why its own Worker

The rooms are not in `workers/sim-leaderboard`:

- Every deploy of a Worker restarts its Durable Objects and closes their
  WebSockets. The leaderboard is redeployed on every `PHYS_VER` bump; in
  the same Worker, each of those would drop every pilot in every room.
- The two share nothing but CORS: no D1, no anti-cheat, no
  `sim-retention.js` logic beyond `pickCorsOrigin`. A bug or a bad deploy
  of one leaves the other up.
- Each has its own logs, limits and a URL the page can point at on its own.

## Once

1. Node 20+ and npm.
2. From this folder:

   ```bash
   cd workers/sim-rooms
   npm install
   npx wrangler login
   ```

3. Nothing to create by hand. `wrangler.jsonc` declares two bindings,
   `ROOMS` to the `Room` class and `CREATE_LIMIT` to the `CreateLimit`
   class, and their migration `v1`
   (`new_sqlite_classes: ["Room", "CreateLimit"]`). The first deploy creates
   both Durable Object namespaces. SQLite-backed, so it runs on the Workers
   Free plan.
4. Deploy:

   ```bash
   npx wrangler deploy
   ```

   It prints the URL, e.g. `https://sim-rooms.ryan-roths.workers.dev`.
   That is the page's default (`ROOMS_URL` in `sim-ghost-rooms.js`). If the
   printed URL differs, set `ROOMS_URL` to it, restamp
   (`python3 scripts/ci/stamp_asset_cache.py`), commit, deploy Pages.

## Checks

```bash
curl -sS https://sim-rooms.ryan-roths.workers.dev/health
curl -sS -X POST -H 'Content-Type: application/json' -d '{"map":"rig"}' https://sim-rooms.ryan-roths.workers.dev/rooms
curl -sS https://sim-rooms.ryan-roths.workers.dev/rooms/ABCD
```

The POST returns `{"ok":true,"code":"ABCD","map":"rig","track":"rig-freestyle"}`;
the GET (with that code) returns the room with `"pilots":0`. A code nobody
made is a 404. An 11th POST inside a minute from one IP is a 429:

```bash
# Within a minute of the POST above (the first of the 10):
for i in $(seq 1 10); do curl -s -o /dev/null -w '%{http_code} ' -X POST -d '{"map":"rig"}' https://sim-rooms.ryan-roths.workers.dev/rooms; done; echo
# 201 201 201 201 201 201 201 201 201 429
```

In the browser: two tabs on `https://quadmath.com/sim.html`, Fly, Esc →
Room → Create in one, Join with its code in the other. Each tab shows the
other's quad as a ghost with its name tag.

## Every release of this Worker

```bash
cd workers/sim-rooms
npx wrangler deploy
```

A deploy closes every live room's sockets: pilots get `ROOM <code> — ROOM
CLOSED` and can join again with the same code. The rooms themselves (code,
map) are in Durable Object storage and are kept. A room whose sockets went
this way (no close reached the object) is found empty by its next alarm
and expires one TTL after that, so at most 20 min instead of 10.

Do not rename the `Room` or `CreateLimit` class or drop the `v1`
migration. A class rename needs a `renamed_classes` migration, and a new
class a new tag (`v2`); see the Durable Objects migrations docs.

## What it does

- `POST /rooms {map}`: a random free code (24 letters, no I or O) on that
  map's freestyle track. The page sends its own map, so joiners fly the
  host's map.
- Rate limit: 10 creates a minute per IP (`CF-Connecting-IP`), a sliding
  window. The 11th is `429 {"ok":false,"reason":"TOO MANY ROOMS"}` with
  `Retry-After` (seconds); the page toasts `TOO MANY ROOMS`. Every POST
  counts, a bad one too; a refused one does not. Joining and room info are
  not limited. The limit's object keeps only the times of the last creates
  (not the IP: it is the object's name), deleted a minute after the last.
- `GET /rooms/CODE`: the room's map, track and pilot count, or 404.
- `GET /rooms/CODE/ws?name=` (WebSocket): the room. At most 4 pilots; the
  fifth is closed with 4409 (`ROOM FULL`), a code that is not live with
  4404 (`NO SUCH ROOM`).
- Each pilot sends its pose, `{t, pos[3], quat[4], rpm[4]}`, at 20 Hz as an
  18-byte binary frame. The room sends it to the other pilots with the
  sender's slot in front (19 bytes) and keeps the latest per pilot, so a
  late joiner gets everyone's current pose on connect. Poses past 30 a
  second (after a burst of 10) are dropped.
- Bandwidth: up 480 B/s, down 1260 B/s (3 others) per pilot in a full room,
  1740 B/s together, with WebSocket frame headers. permessage-deflate
  (Chrome and Cloudflare both offer it) brings that to about 1560 B/s on
  the wire (measured by `tools/test_sim_rooms_wrangler.mjs`).
- A room expires `ROOM_TTL_MS` (10 min) after its last pilot leaves, or
  after it was made if nobody joins: storage deleted, the code free again.
  Nothing else is stored. No auth, no chat, no persistence of flights.
- CORS and the WebSocket Origin: `ALLOWED_ORIGIN` (`https://quadmath.com`).
  A browser on another site is refused (403). Requests with no Origin (a
  script) are let in; they could send any Origin they liked.

## Local

```bash
cd workers/sim-rooms
npx wrangler dev --var ALLOWED_ORIGIN:http://127.0.0.1:4173
```

Then open `http://127.0.0.1:4173/sim.html?rooms=http://127.0.0.1:8787`.
`?rooms=` is honored only on a localhost page, and only there may it be
`http://`. Elsewhere the page takes localStorage `quadmathSimRoomsUrl`
(`https://` only), then `ROOMS_URL`.

Tests (wrangler from this folder's `npm install`, or `WRANGLER=<path to
wrangler/bin/wrangler.js>`; without one they skip, as in CI):

```bash
node tools/test_sim_rooms_wrangler.mjs      # 4 scripted pilots against wrangler dev
node tools/test_sim_ghost_room_page.mjs     # the page in a room (Chrome)
node tools/test_sim_ghost_rooms.mjs         # the logic, no network (always runs)
```
