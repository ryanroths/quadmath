// Ghost rooms against `wrangler dev` (workers/sim-rooms), four scripted
// pilots in Node on the page's own client (sim-ghost-rooms.js openRoom):
//   - create: a 4-letter code on the host's map and its freestyle track
//   - join: slots 0-3, each welcome lists the pilots already in
//   - late join: with the other three holding still (not sending), the
//     fourth gets each one's current pose on connect
//   - fan-out: 4 pilots at 20 Hz for 5 s; each gets every other pilot's
//     poses, as sent, and never its own
//   - max: a fifth is refused (ROOM FULL, close 4409); once one leaves, a
//     new pilot gets the free slot
//   - bandwidth: each pilot's socket runs through a counting TCP proxy, so
//     what is counted is the wire (WebSocket frames, not TCP/IP headers);
//     up + down together under 2 KB/s a pilot in the full room
//   - expiry: the room lives on with nobody in it, a rejoin restarts the
//     clock, and ROOM_TTL_MS after the last pilot leaves it is gone (GET 404,
//     joins refused). wrangler dev runs with ROOM_TTL_MS 6000 for that; the
//     shipped 10 min is checked in tools/test_sim_ghost_rooms.mjs.
// Needs wrangler (tools/sim_rooms_dev.mjs): `npm install` in workers/sim-rooms,
// or WRANGLER=<path to wrangler's bin/wrangler.js>. Without one it skips: CI
// installs none. The room's logic also runs in-process, always, in
// tools/test_sim_ghost_rooms.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import {
  openRoom, createRoom, roomInfo, decodePose, posUnitsPerWu,
  POSE_HZ, ROOM_MAX, CLOSE_FULL, POSE_BYTES, RELAY_BYTES,
} from '../sim-ghost-rooms.js';
import { findWrangler, startRoomsDev, sleep } from './sim_rooms_dev.mjs';

const TTL_MS = 6000;
const BUDGET_BPS = 2000;
const log = process.env.ROOMS_DEBUG ? (...a) => console.log('[rooms]', ...a) : () => {};

// One listening port per pilot, piped to wrangler dev, counting bytes each way.
function countingProxy(targetPort) {
  const count = { up: 0, down: 0 };
  const socks = new Set();
  const server = createServer((c) => {
    const s = connect(targetPort, '127.0.0.1');
    socks.add(c); socks.add(s);
    c.on('data', (d) => { count.up += d.length; s.write(d); });
    s.on('data', (d) => { count.down += d.length; c.write(d); });
    const end = () => { c.destroy(); s.destroy(); socks.delete(c); socks.delete(s); };
    c.on('close', end); s.on('close', end); c.on('error', end); s.on('error', end);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port, count,
      close: () => new Promise((r) => { for (const x of socks) x.destroy(); server.close(() => r()); }),
    }));
  });
}

// A scripted pilot: its own proxy, the page's client, a 20 Hz pose timer
// flying a slot-specific circle, and a log of what it sent and got.
async function makePilot(name, wsBase, code, slotHint) {
  const proxy = await countingProxy(wsBase.port);
  const events = [];
  let room;
  try {
    room = await openRoom({
      base: 'http://127.0.0.1:' + proxy.port, code, name, WebSocket,
      onEvent: (e) => events.push(e),
    });
  } catch (e) {
    await proxy.close();
    throw new Error(name + ': ' + e.message);
  }
  const pilot = { name, room, proxy, events, sent: new Map(), timer: null, n: 0, slotHint };
  pilot.pose = (i) => {
    const s = room.slot, a = (i / POSE_HZ) * (0.6 + 0.1 * s);
    const yaw = a + s;
    return {
      t: (1000 * i / POSE_HZ + 7919 * s) | 0,
      pos: [1.5 * Math.cos(a) + s, 1 + 0.2 * s, 1.5 * Math.sin(a) - s],
      quat: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
      rpm: [30000 + 100 * s, 31000, 32000 + 10 * i % 4000, 33000],
    };
  };
  pilot.sendOne = () => {
    const p = pilot.pose(pilot.n++);
    if (room.sendPose(p)) pilot.sent.set(p.t & 0xffff, p);
    return p;
  };
  // Due-time schedule, as the page's: a coarse timer (15.6 ms on Windows)
  // would make setInterval(50) a 16 Hz sender.
  pilot.start = () => {
    if (pilot.timer) return;
    let due = performance.now();
    pilot.timer = setInterval(() => {
      const now = performance.now();
      if (now - due > 2000 / POSE_HZ) due = now;
      while (now >= due) { pilot.sendOne(); due += 1000 / POSE_HZ; }
    }, 5);
  };
  pilot.stop = () => { clearInterval(pilot.timer); pilot.timer = null; };
  pilot.leave = async () => { pilot.stop(); room.close(); await sleep(150); await proxy.close(); };
  return pilot;
}

// Every frame a pilot gets is one its sender sent, within the wire's steps.
const pick = (b) => ({ pu: b.up, pd: b.down });

function quantizedEqual(got, want, units) {
  for (let i = 0; i < 3; i++) if (Math.abs(got.pos[i] - want.pos[i]) > 0.51 / units) return false;
  const dot = Math.abs(got.quat.reduce((s, v, i) => s + v * want.quat[i], 0));
  if (dot < 0.99999) return false;
  for (let i = 0; i < 4; i++) if (Math.abs(got.rpm[i] - want.rpm[i]) > 200) return false;
  return true;
}

test('ghost rooms: 4 scripted pilots against wrangler dev', { timeout: 240000 }, async (t) => {
  const bin = findWrangler();
  if (!bin) { t.skip('no wrangler (npm install in workers/sim-rooms, or WRANGLER=)'); return; }
  const w = await startRoomsDev(bin, { ROOM_TTL_MS: String(TTL_MS) });
  const { port, base } = w;
  const pilots = [];
  try {
    // ---- a code nobody made
    log('a code nobody made');
    const other = 'ZZZZ';
    assert.equal((await fetch(base + '/rooms/' + other)).status, 404);
    const tNo = Date.now();
    await assert.rejects(openRoom({ base, code: other, name: 'x', WebSocket }), /NO SUCH ROOM/);
    log('refused in', Date.now() - tNo, 'ms');

    // ---- create
    log('create');
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.ok, true);
    const made = await createRoom(base, 'rig');
    assert.match(made.code, /^[A-HJ-NP-Z]{4}$/);
    assert.equal(made.map, 'rig');
    assert.equal(made.track, 'rig-freestyle');
    const info0 = await roomInfo(base, made.code);
    assert.deepEqual([info0.map, info0.track, info0.pilots, info0.max], ['rig', 'rig-freestyle', 0, ROOM_MAX]);
    const bad = await fetch(base + '/rooms', { method: 'POST', body: '{"map":"../x"}' });
    assert.equal(bad.status, 400);
    const units = posUnitsPerWu('rig');

    // ---- join: three pilots
    log('join');
    const ws = { port };
    for (const name of ['Ana', 'Bo', 'Cy']) pilots.push(await makePilot(name, ws, made.code));
    assert.deepEqual(pilots.map((p) => p.room.slot), [0, 1, 2]);
    assert.deepEqual([pilots[0].room.map, pilots[0].room.track], ['rig', 'rig-freestyle']);
    assert.deepEqual([...pilots[2].room.pilots.values()].map((p) => p.name), ['Ana', 'Bo']);
    await sleep(200);
    assert.deepEqual(pilots[0].events.filter((e) => e.type === 'join').map((e) => e.name), ['Bo', 'Cy']);

    // ---- late join: the three fly 1 s, then hold still (stop sending)
    log('late join');
    for (const p of pilots) p.start();
    await sleep(1000);
    for (const p of pilots) p.stop();
    await sleep(300);
    const last = pilots.map((p) => p.pose(p.n - 1));

    const d = await makePilot('Dee', ws, made.code);
    pilots.push(d);
    assert.equal(d.room.slot, 3);
    await sleep(250);
    for (let s = 0; s < 3; s++) {
      const tr = d.room.pilots.get(s).track;
      assert.equal(tr.samples.length, 1, 'late join: one pose from slot ' + s + ' with nobody sending');
      const got = { pos: tr.samples[0].pos, quat: tr.samples[0].quat, rpm: tr.samples[0].rpm };
      assert.ok(quantizedEqual(got, last[s], units), 'late join: slot ' + s + ' is its current pose');
    }

    // ---- fan-out and bandwidth: all four at 20 Hz, a 5 s window
    log('fan-out and bandwidth');
    const got = pilots.map(() => new Map());       // per receiver: slot -> count
    const wrong = [];
    for (const [ri, p] of pilots.entries()) {
      const prev = p.room.ws.onmessage;
      p.room.ws.onmessage = (ev) => {
        prev(ev);
        if (typeof ev.data === 'string') return;
        const dv = new DataView(ev.data);
        const slot = dv.getUint8(0);
        const sender = pilots.find((q) => q.room.slot === slot);
        const pose = decodePose(dv, units, 1);
        const want = sender && sender.sent.get(pose.t);
        if (slot === p.room.slot || !want || !quantizedEqual(pose, want, units)) wrong.push({ ri, slot, t: pose.t });
        got[ri].set(slot, (got[ri].get(slot) || 0) + 1);
      };
    }
    for (const p of pilots) p.start();
    await sleep(500);
    const before = pilots.map((p) => ({ ...p.proxy.count, ...pick(p.room.bytes) }));
    for (const g of got) g.clear();
    const t0 = Date.now();
    await sleep(5000);
    const secs = (Date.now() - t0) / 1000;
    const after = pilots.map((p) => ({ ...p.proxy.count, ...pick(p.room.bytes) }));
    const sentInWindow = Math.round(secs * POSE_HZ);
    // wire: what crossed the proxy (permessage-deflate on, if negotiated);
    // frames: the same frames uncompressed, payload plus frame header (6
    // bytes up, masked; 2 down).
    const report = pilots.map((p, i) => {
      const up = (after[i].up - before[i].up) / secs, down = (after[i].down - before[i].down) / secs;
      const pu = (after[i].pu - before[i].pu) / secs, pd = (after[i].pd - before[i].pd) / secs;
      const frames = pu * (1 + 6 / POSE_BYTES) + pd * (1 + 2 / RELAY_BYTES);
      return { pilot: p.name, up: Math.round(up), down: Math.round(down), wire: Math.round(up + down), frames: Math.round(frames) };
    });
    console.log('bandwidth per pilot, bytes/s (4 pilots, ' + POSE_HZ + ' Hz; extensions "'
      + pilots[0].room.ws.extensions + '"):', JSON.stringify(report));
    assert.deepEqual(wrong, [], 'every frame is a pose its sender sent, never the receiver\'s own');
    for (const [ri, p] of pilots.entries()) {
      for (const q of pilots) {
        if (q === p) { assert.equal(got[ri].get(q.room.slot) || 0, 0); continue; }
        const n = got[ri].get(q.room.slot) || 0;
        assert.ok(n >= 0.85 * sentInWindow && n <= 1.1 * sentInWindow,
          p.name + ' got ' + n + ' poses from ' + q.name + ' in ' + secs.toFixed(2) + ' s');
      }
    }
    for (const r of report) {
      assert.ok(r.wire < BUDGET_BPS, r.pilot + ': ' + r.wire + ' B/s up + down on the wire');
      assert.ok(r.frames < BUDGET_BPS, r.pilot + ': ' + r.frames + ' B/s up + down uncompressed');
    }

    // ---- max: a fifth is refused; a leave frees the slot
    log('max');
    assert.equal((await roomInfo(base, made.code)).pilots, 4);
    const fifth = await countingProxy(port);
    await assert.rejects(openRoom({ base: 'http://127.0.0.1:' + fifth.port, code: made.code, name: 'Eve', WebSocket }),
      /ROOM FULL/);
    await fifth.close();
    const closeCode = await new Promise((resolve) => {
      const sock = new WebSocket(base.replace('http', 'ws') + '/rooms/' + made.code + '/ws?name=Eve');
      sock.onclose = (ev) => resolve(ev.code);
    });
    assert.equal(closeCode, CLOSE_FULL);
    await pilots[1].leave();
    await sleep(300);
    assert.ok(pilots[0].events.some((e) => e.type === 'leave' && e.name === 'Bo'));
    assert.equal(pilots[0].room.pilots.has(1), false);
    const e = await makePilot('Eve', ws, made.code);
    assert.equal(e.room.slot, 1, 'the free slot');
    pilots.splice(1, 1, e);

    // ---- expiry
    log('expiry');
    for (const p of pilots) await p.leave();
    pilots.length = 0;
    await sleep(300);
    const empty = await roomInfo(base, made.code);
    assert.equal(empty.pilots, 0, 'the room outlives its last pilot');
    await sleep(TTL_MS / 2);
    const back = await makePilot('Ana', ws, made.code);       // rejoin within the TTL
    assert.equal(back.room.slot, 0);
    await back.leave();
    const leftAt = Date.now();
    await sleep(TTL_MS * 0.75);
    assert.equal((await roomInfo(base, made.code)).ok, true, 'the rejoin restarted the clock');
    await sleep(TTL_MS * 0.25 + 1500 - (Date.now() - leftAt - TTL_MS * 0.75));
    assert.equal((await fetch(base + '/rooms/' + made.code)).status, 404, 'expired');
    await assert.rejects(openRoom({ base, code: made.code, name: 'late', WebSocket }), /NO SUCH ROOM/);
  } finally {
    for (const p of pilots) { try { await p.leave(); } catch (e) { /* ignore */ } }
    await w.stop();
  }
});
