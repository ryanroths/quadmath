// QuadMath sim ghost rooms: the create rate limit, one Durable Object per
// client IP (idFromName(ip); the IP itself is not stored). At most
// CREATE_LIMIT room creates in any CREATE_WINDOW_MS (10 a minute, sliding):
// storage holds the times of the last ones, and an alarm deletes them once
// the window has passed.
//
// CreateLimitLogic is the limit without the runtime, so
// tools/test_sim_ghost_rooms.mjs runs it in Node; CreateLimit is the Durable
// Object around it.

export const CREATE_LIMIT = 10;
export const CREATE_WINDOW_MS = 60 * 1000;

const HITS = 'hits';

// storage: {get, put, deleteAll, setAlarm}
export class CreateLimitLogic {
  constructor(storage) {
    this.storage = storage;
  }

  // One create at `now`: {ok: true}, or {ok: false, retryAfterS} when the
  // last CREATE_LIMIT are all inside the window. A refused one is not counted.
  async take(now) {
    const hits = ((await this.storage.get(HITS)) || []).filter((t) => now - t < CREATE_WINDOW_MS);
    if (hits.length >= CREATE_LIMIT) {
      return { ok: false, retryAfterS: Math.max(1, Math.ceil((hits[0] + CREATE_WINDOW_MS - now) / 1000)) };
    }
    hits.push(now);
    await this.storage.put(HITS, hits);
    await this.storage.setAlarm(now + CREATE_WINDOW_MS);
    return { ok: true };
  }

  async alarm(now) {
    const hits = ((await this.storage.get(HITS)) || []).filter((t) => now - t < CREATE_WINDOW_MS);
    if (hits.length) await this.storage.setAlarm(hits[hits.length - 1] + CREATE_WINDOW_MS);
    else await this.storage.deleteAll();
  }
}

export class CreateLimit {
  constructor(state) {
    this.limit = new CreateLimitLogic(state.storage);
  }

  async fetch() {
    const r = await this.limit.take(Date.now());
    return new Response(JSON.stringify(r), { status: r.ok ? 200 : 429 });
  }

  async alarm() {
    await this.limit.alarm(Date.now());
  }
}
