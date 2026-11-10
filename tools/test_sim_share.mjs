// "Fly my line": the finish screen's SHARE copies a link (map + track + the
// run's ghost); opening it lands on that track with the ghost loaded and a
// "Race RyFly's line" banner.
//   - In node: the line code (sim-share.js: resample, pack, deflate, the link
//     and its fragment, the rates a link tries), and the leaderboard Worker's
//     /api/line on an in-memory D1.
//   - In headless Chrome, fresh profiles: a pilot flies the Rig Loop, presses
//     SHARE and the link is on the clipboard (the ghost in the URL; then, too
//     long for a link, stored on the Worker; then, the Worker down, the long
//     link); a second fresh profile opens each link and lands on the track
//     with the ghost and the banner; and a custom track travels with its
//     ghost. SHARE outlives the finish toast: 30 s after a finish it is still
//     under the result on the lap panel and in the pause menu, each clicked
//     with the mouse, and on the K key; it leaves the panel when the next run
//     starts. The Worker is the real handler, answering the page's requests in
//     place of the network (CDP Fetch): nothing reaches the deployed one.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  LINE_URL_MAX, LINE_CODE_MAX, LINE_RATES_HZ, LINE_SAMPLES_MAX, LINE_ID_RE,
  resampleGhost, packLine, unpackLine, encodeLineCode, decodeLineCode, lineLink, lineFromHash, lineForLink, lineIdOf, lineBannerText,
} from '../sim-share.js';
import { ghostPayloadError, ghostFromObj, shareTrackPayload, fromShareTrackPayload, LEADERBOARD_URL } from '../sim-retention.js';
import { CUSTOM_TRACKS_KEY } from '../sim-tracks.js';
import { WS } from '../sim-core-adapter.js';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const BASE = { origin: 'https://quadmath.com', path: '/sim.html', map: 'rig', track: 'rig-loop' };

// A flown-looking ghost: seconds at 15 Hz, a wandering line with turns, climbs
// and rolls, rounded as the page stores them.
function flight(seconds, { hz = 15, name = 'RyFly', track = 'rig-loop', seed = 1 } = {}) {
  const samples = [];
  let x = -20, y = 1.2, z = -19, heading = 0;
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
  const n = Math.round(seconds * hz);
  for (let i = 0; i <= n; i++) {
    const t = Math.round(i * 1000 / hz);
    heading += 0.05 + rnd() * 0.06;
    const speed = (6 + Math.sin(i / 23) * 3) * 3.5 / hz;
    x += Math.cos(heading) * speed;
    z += Math.sin(heading) * speed;
    y = 4 + Math.sin(i / 31) * 2.5 + rnd() * 0.05;
    const roll = Math.sin(i / 11) * 0.6, pitch = -0.3 + rnd() * 0.05;
    const q = [Math.sin(pitch / 2) * Math.cos(roll / 2), Math.sin(heading / 2) * Math.cos(roll / 2), Math.sin(roll / 2), Math.cos(heading / 2) * Math.cos(pitch / 2) * Math.cos(roll / 2)];
    const len = Math.hypot(...q);
    samples.push([t, +x.toFixed(2), +y.toFixed(2), +z.toFixed(2), ...q.map((v) => +(v / len).toFixed(3))]);
  }
  return { v: 1, phys: 7, track, name, lapTime: samples[samples.length - 1][0] + 13, samples };
}

const angleDeg = (a, b) => {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b)))) * 180 / Math.PI;
};

test('a line code carries the ghost: every rate, to 2 cm and 2 degrees of what went in', async () => {
  const ghost = flight(30);
  for (const hz of LINE_RATES_HZ) {
    const want = resampleGhost(ghost.samples, 1000 / hz);
    const code = await encodeLineCode({ ghost }, hz);
    assert.match(code, /^L1\.[A-Za-z0-9_-]+$/, 'deflated, base64url');
    const line = await decodeLineCode(code);
    const got = line.ghost;
    assert.equal(ghostPayloadError(got, 'rig-loop'), null, 'a ghost the page takes');
    assert.equal(got.name, 'RyFly');
    assert.equal(got.track, 'rig-loop');
    assert.equal(got.lapTime, ghost.lapTime);
    assert.equal(got.phys, 7);
    assert.equal(line.trackPayload, null);
    assert.equal(got.samples.length, want.rows.length, `${hz} Hz: ${want.rows.length} rows`);
    assert.equal(got.samples[0][0], 0);
    assert.equal(got.samples[got.samples.length - 1][0], ghost.samples[ghost.samples.length - 1][0], 'ends when the run did');
    let worstPos = 0, worstDeg = 0;
    got.samples.forEach((s, i) => {
      const w = want.rows[i];
      worstPos = Math.max(worstPos, Math.abs(s[1] - w[0]), Math.abs(s[2] - w[1]), Math.abs(s[3] - w[2]));
      worstDeg = Math.max(worstDeg, angleDeg(s.slice(4), w.slice(3)));
      if (i) assert.ok(s[0] > got.samples[i - 1][0], 'time rises');
    });
    assert.ok(worstPos <= 0.0151, `${hz} Hz: position within 1.5 hundredths of a unit (${worstPos.toFixed(4)})`);
    assert.ok(worstDeg < 2, `${hz} Hz: attitude within 2 degrees (${worstDeg.toFixed(2)})`);
  }
  // The last sample is the run's last, exactly where it ended.
  const end = ghost.samples[ghost.samples.length - 1];
  const got = (await decodeLineCode(await encodeLineCode({ ghost }, 10))).ghost.samples;
  assert.ok(Math.abs(got[got.length - 1][1] - end[1]) <= 0.011 && Math.abs(got[got.length - 1][3] - end[3]) <= 0.011);
});

test('resampling: fixed steps from the first sample to the last, the short way round between attitudes', () => {
  const r = resampleGhost([[0, 0, 0, 0, 0, 0, 0, 1], [100, 1, 2, 3, 0, 0, 0, -1], [250, 2, 2, 3, 0, 1, 0, 0]], 50);
  assert.deepEqual([r.startMs, r.endMs, r.dtMs, r.rows.length], [0, 250, 50, 6]);
  assert.deepEqual(r.rows[1].slice(0, 3), [0.5, 1, 1.5], 'half way');
  assert.ok(Math.abs(Math.abs(r.rows[1][6]) - 1) < 1e-9, 'q and -q are one attitude: no spin between them');
  assert.deepEqual(r.rows[5].slice(0, 3), [2, 2, 3], 'the last row is the last sample');
  assert.ok(Math.abs(Math.hypot(...r.rows[3].slice(3)) - 1) < 1e-9, 'unit attitudes');
});

test('the link: map and track in the query, the ghost in the fragment; the best rate that fits 2000 characters', async () => {
  assert.equal(LINE_URL_MAX, 2000);
  const short = await lineForLink({ ghost: flight(12) }, BASE);
  assert.equal(short.fits, true);
  assert.equal(short.hz, 10, 'a short run at the full rate');
  assert.ok(short.link.length <= LINE_URL_MAX);
  assert.ok(short.link.startsWith('https://quadmath.com/sim.html?map=rig&track=rig-loop#line=L1.'), short.link.slice(0, 80));
  assert.equal(lineFromHash(new URL(short.link).hash), short.code, 'the fragment gives the code back');
  assert.equal(new URL(short.link).searchParams.get('track'), 'rig-loop');
  // Longer: a lower rate, still in the link.
  let lower = null;
  for (const seconds of [30, 40, 50, 60, 75]) {
    const r = await lineForLink({ ghost: flight(seconds) }, BASE);
    if (r.fits && r.hz < 10) { lower = { seconds, ...r }; break; }
  }
  assert.ok(lower, 'some run fits only at a lower rate');
  assert.ok(lower.link.length <= LINE_URL_MAX);
  assert.ok(LINE_RATES_HZ.includes(lower.hz) && lower.hz < 10, `${lower.seconds} s at ${lower.hz} Hz`);
  // Too long for any rate: not fitted, and the code is the full-rate one, for the Worker.
  const long = await lineForLink({ ghost: flight(240) }, BASE);
  assert.equal(long.fits, false);
  assert.equal(long.hz, 10);
  assert.ok(long.link.length > LINE_URL_MAX);
  assert.ok(long.code.length <= LINE_CODE_MAX, `the Worker takes it (${long.code.length} characters)`);
  assert.equal(long.code, await encodeLineCode({ ghost: flight(240) }, 10));
  // A dev-only map's link says so; a legacy track id rides as its name.
  assert.equal(lineLink({ ...BASE, map: 'city', track: 'city-loop', dev: true, code: 'L0.AA' }), 'https://quadmath.com/sim.html?map=city&track=city-loop&dev=1#line=L0.AA');
  assert.equal(lineLink({ ...BASE, code: '@abcDEF123456_-xy' }), 'https://quadmath.com/sim.html?map=rig&track=rig-loop#line=@abcDEF123456_-xy');
});

test('the fragment: a code or a Worker id, nothing else', () => {
  assert.equal(lineFromHash('#line=L1.abc_DEF-123'), 'L1.abc_DEF-123');
  assert.equal(lineFromHash('#foo=1&line=L0.AAAA&bar=2'), 'L0.AAAA');
  assert.equal(lineFromHash('#line=@abcDEF123456_-xy'), '@abcDEF123456_-xy');
  assert.equal(lineFromHash('#line=%40abcDEF123456_-xy'), '@abcDEF123456_-xy', 'an @ a chat app escaped');
  for (const bad of ['', '#', '#line=', '#line=<script>', '#line=L2.abc', '#line=@short', '#line=@has space1234', '#other=L1.abc', '#line=javascript:alert(1)']) {
    assert.equal(lineFromHash(bad), null, bad);
  }
});

test('a very long run still packs: never more than the sample cap, the step stretched', async () => {
  const ghost = flight(500, { hz: 3 });
  const line = unpackLine(packLine({ ghost }, 10));
  assert.ok(line.ghost.samples.length <= LINE_SAMPLES_MAX, `${line.ghost.samples.length} rows`);
  assert.ok(line.ghost.samples.length > LINE_SAMPLES_MAX * 0.9, 'and close to it');
  assert.equal(ghostPayloadError(line.ghost, null), null);
  assert.ok((await encodeLineCode({ ghost }, 10)).length <= LINE_CODE_MAX);
});

test('without CompressionStream: the plain form, read the same', async () => {
  const ghost = flight(8);
  const plain = await encodeLineCode({ ghost }, 10, { compress: false });
  assert.match(plain, /^L0\./);
  assert.deepEqual((await decodeLineCode(plain)).ghost, (await decodeLineCode(await encodeLineCode({ ghost }, 10))).ghost);
});

test('a custom track travels with its ghost', async () => {
  const track = { id: 'custom-yard', name: 'Yard', map: 'rig', gates: [{ x: -15, y: 4, z: -19, ry: 1.57, size: 1.9 }, { x: 0, y: 4, z: -19, ry: 1.57, size: 1.9 }, { x: 15, y: 4, z: -19, ry: 1.57, size: 1.9 }] };
  const code = await encodeLineCode({ ghost: flight(6, { track: 'custom-yard' }), trackPayload: shareTrackPayload(track) }, 10);
  const line = await decodeLineCode(code);
  const back = fromShareTrackPayload(line.trackPayload);
  assert.equal(back.id, 'custom-yard');
  assert.equal(back.map, 'rig');
  assert.equal(back.gates.length, 3);
  assert.deepEqual([back.gates[2].x, back.gates[2].y, back.gates[2].z], [15, 4, -19]);
});

// A code is bytes anyone can write: the header of a real one, rewritten.
async function forge(line, change) {
  const bytes = packLine(line, 10);
  const headLen = bytes[1] | (bytes[2] << 8);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(3, 3 + headLen)));
  const lie = new TextEncoder().encode(JSON.stringify(change(head)));
  const out = new Uint8Array(3 + lie.length + bytes.length - 3 - headLen);
  out.set([bytes[0], lie.length & 0xff, lie.length >> 8]);
  out.set(lie, 3);
  out.set(bytes.subarray(3 + headLen), 3 + lie.length);
  return out;
}

test('a link is one click: what it names is plain text, or it is refused', async () => {
  const track = { id: 'custom-yard', name: 'Yard', map: 'rig', gates: [{ x: -15, y: 4, z: -19, ry: 1.57, size: 1.9 }, { x: 15, y: 4, z: -19, ry: 1.57, size: 1.9 }] };
  const line = { ghost: flight(5, { track: 'custom-yard' }), trackPayload: shareTrackPayload(track) };
  // A track name with markup in it: only its letters come through.
  let out = unpackLine(await forge(line, (h) => ({ ...h, tr: { ...h.tr, n: '<img src=x onerror=alert(1)>' } })));
  assert.equal(out.trackPayload.n, 'img srcx onerroralert1');
  assert.equal(fromShareTrackPayload(out.trackPayload).name, 'img srcx onerroralert1');
  out = unpackLine(await forge(line, (h) => ({ ...h, tr: { ...h.tr, n: 'Café loop_2 - v1.5' } })));
  assert.equal(out.trackPayload.n, 'Café loop_2 - v1.5', 'an honest name is kept');
  // Ids and the map are plain, and the track is the one the ghost names.
  for (const [name, change] of [
    ['a track id with markup', (h) => ({ ...h, t: '"><svg onload=x>', tr: { ...h.tr, id: '"><svg onload=x>' } })],
    ['a ghost for another track than the one sent', (h) => ({ ...h, tr: { ...h.tr, id: 'custom-other' } })],
    ['a map with markup', (h) => ({ ...h, tr: { ...h.tr, m: '<b>rig' } })],
    ['a track id that is not text', (h) => ({ ...h, t: { x: 1 } })],
    ['a legacy index that is not one', (h) => ({ ...h, t: 7 })],
  ]) {
    const forged = await forge(line, change);
    assert.throws(() => unpackLine(forged), /BAD LINE CODE/, name);
  }
  // The ids the sim makes all pass.
  for (const id of ['rig-loop', 'bando-loop-v2', 'daily-2026-11-09', 'weekly-2026-W45-g2', 'custom-1731182000000', 'room-practice']) {
    assert.equal(unpackLine(packLine({ ghost: flight(3, { track: id }) }, 10)).ghost.track, id);
  }
  assert.equal(unpackLine(packLine({ ghost: { ...flight(3), track: 0 } }, 10)).ghost.track, 0, 'a city track by its index');
  // The pilot name is cleaned by the page (ghostFromObj), as every ghost's is.
  const named = unpackLine(await forge(line, (h) => ({ ...h, n: '<i>Ry</i>' })));
  assert.equal(ghostFromObj(named.ghost).name, 'iRyi');
  assert.equal(lineBannerText(ghostFromObj(named.ghost).name), "Race iRyi's line");
});

test('bad codes are refused, not half read', async () => {
  const good = await encodeLineCode({ ghost: flight(5) }, 10);
  const plain = await encodeLineCode({ ghost: flight(5) }, 10, { compress: false });
  for (const [name, code] of [
    ['empty', ''], ['no prefix', good.slice(3)], ['another version', 'L9.' + good.slice(3)], ['not base64url', 'L1.a+b/c='],
    ['cut short', good.slice(0, good.length - 40)], ['plain, cut short', plain.slice(0, plain.length - 24)],
    ['plain, bytes added', plain + 'AAAA'], ['too long', 'L0.' + 'A'.repeat(LINE_CODE_MAX)], ['a duel code', 'QM2.' + good.slice(3)],
  ]) {
    await assert.rejects(() => decodeLineCode(code), /BAD LINE CODE/, name);
  }
  assert.throws(() => packLine({ ghost: { samples: [] } }), /NO RUN TO SHARE/);
  // A header that lies about its count.
  const bytes = packLine({ ghost: flight(5) }, 10);
  const headLen = bytes[1] | (bytes[2] << 8);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(3, 3 + headLen)));
  const lie = new TextEncoder().encode(JSON.stringify({ ...head, c: head.c + 1 }));
  assert.equal(lie.length, headLen, 'same length header');
  const forged = Uint8Array.from(bytes);
  forged.set(lie, 3);
  assert.throws(() => unpackLine(forged), /BAD LINE CODE/);
});

test('the banner and the id', async () => {
  assert.equal(lineBannerText('RyFly'), "Race RyFly's line");
  assert.equal(lineBannerText('PILOT'), 'Race this line', 'a pilot who never set a name');
  assert.equal(lineBannerText(''), 'Race this line');
  const code = await encodeLineCode({ ghost: flight(5) }, 10);
  const id = await lineIdOf(code);
  assert.match(id, LINE_ID_RE);
  assert.equal(id, await lineIdOf(code), 'the same line, the same id');
  assert.notEqual(id, await lineIdOf(await encodeLineCode({ ghost: flight(5, { seed: 2 }) }, 10)));
});

// An in-memory D1 for the statements the Worker's line and rate-limit code runs.
function fakeD1() {
  const lines = new Map(), rate = new Map();
  return {
    lines,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() {
          if (/FROM rate_limit/.test(sql)) { const n = rate.get(args.join('|')); return n ? { n } : null; }
          if (/FROM lines/.test(sql)) { const code = lines.get(args[0]); return code ? { code } : null; }
          throw new Error('fake D1: ' + sql);
        },
        async run() {
          if (/INTO rate_limit/.test(sql)) { const k = args.join('|'); rate.set(k, (rate.get(k) || 0) + 1); return {}; }
          if (/INTO lines/.test(sql)) { if (!lines.has(args[0])) lines.set(args[0], args[1]); return {}; }
          throw new Error('fake D1: ' + sql);
        },
      };
      return stmt;
    },
  };
}

const post = (body, headers) => new Request('https://x/api/line', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('the Worker: POST /api/line stores a line once under its content id; GET gives it back', async () => {
  const env = { DB: fakeD1(), ALLOWED_ORIGIN: 'https://quadmath.com' };
  const code = (await lineForLink({ ghost: flight(240) }, BASE)).code;
  let r = await handleLeaderboard(post({ code }, { Origin: 'https://quadmath.com' }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://quadmath.com');
  const saved = await r.json();
  assert.equal(saved.ok, true);
  assert.equal(saved.id, await lineIdOf(code));
  assert.match(saved.id, LINE_ID_RE);
  r = await handleLeaderboard(post({ code }), env);
  assert.equal((await r.json()).id, saved.id, 'again: the same id');
  assert.equal(env.DB.lines.size, 1, 'stored once');
  r = await handleLeaderboard(new Request('https://x/api/line?id=' + saved.id, { headers: { Origin: 'https://quadmath.com' } }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://quadmath.com');
  const got = await r.json();
  assert.equal(got.code, code, 'the code as it was stored');
  assert.equal(ghostPayloadError((await decodeLineCode(got.code)).ghost, 'rig-loop'), null);
  // The preflight a browser sends before the POST.
  r = await handleLeaderboard(new Request('https://x/api/line', { method: 'OPTIONS', headers: { Origin: 'https://quadmath.com' } }), env);
  assert.equal(r.status, 204);
  assert.match(r.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('the Worker: refuses what is not a line, an unknown id, and a flood', async () => {
  const env = { DB: fakeD1() };
  const status = async (req, e = env) => { const r = await handleLeaderboard(req, e); return [r.status, (await r.json()).reason]; };
  assert.deepEqual(await status(post({ code: 'L1.notaline' })), [400, 'BAD LINE CODE']);
  assert.deepEqual(await status(post({ code: 42 })), [400, 'BAD LINE CODE']);
  assert.deepEqual(await status(post({})), [400, 'BAD LINE CODE']);
  assert.deepEqual(await status(post('{')), [400, 'BAD JSON']);
  assert.deepEqual(await status(post({ code: 'L0.' + 'A'.repeat(LINE_CODE_MAX) })), [400, 'BAD LINE CODE']);
  // A well-formed line whose ghost the page would refuse (out of the world).
  const far = flight(5);
  far.samples.forEach((s) => { s[1] += 9000; });
  assert.deepEqual(await status(post({ code: await encodeLineCode({ ghost: far }, 10) })), [400, 'GHOST OUT OF BOUNDS']);
  assert.equal(env.DB.lines.size, 0, 'nothing stored');
  assert.deepEqual(await status(new Request('https://x/api/line?id=AAAAAAAAAAAAAAAA')), [404, 'NOT FOUND']);
  assert.deepEqual(await status(new Request('https://x/api/line?id=no')), [400, 'BAD ID']);
  assert.deepEqual(await status(new Request('https://x/api/line')), [400, 'BAD ID']);
  // No database: the page falls back to the long link.
  assert.deepEqual(await status(post({ code: await encodeLineCode({ ghost: flight(5) }, 10) }), {}), [503, 'NO DATABASE']);
  assert.deepEqual(await status(new Request('https://x/api/line?id=AAAAAAAAAAAAAAAA'), {}), [503, 'NO DATABASE']);
  // The rate limit the board submits share: 12 posts an hour from one address.
  const flood = { DB: fakeD1() };
  const code = await encodeLineCode({ ghost: flight(5) }, 10);
  for (let i = 0; i < 12; i++) assert.equal((await handleLeaderboard(post({ code }, { 'CF-Connecting-IP': '9.9.9.9' }), flood)).status, 200, 'post ' + (i + 1));
  assert.deepEqual(await status(post({ code }, { 'CF-Connecting-IP': '9.9.9.9' }), flood), [429, 'RATE LIMIT']);
  assert.equal((await handleLeaderboard(post({ code }, { 'CF-Connecting-IP': '8.8.8.8' }), flood)).status, 200, 'another address');
});

test('the files: sim-share.js imports nothing (the Worker bundles it), is stamped, and the table has its SQL', () => {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  assert.ok(!/^\s*import\b/m.test(read('sim-share.js')), 'no imports');
  assert.match(read('scripts/ci/stamp_asset_cache.py'), /"sim-share\.js",/);
  assert.match(read('sim.html'), /from "\.\/sim-share\.js\?v=[0-9a-f]{12}"/);
  for (const f of ['workers/sim-leaderboard/src/schema.sql', 'workers/sim-leaderboard/src/migrate-lines.sql']) {
    assert.match(read(f), /CREATE TABLE IF NOT EXISTS lines \(\s*id TEXT PRIMARY KEY,\s*code TEXT NOT NULL,\s*created_ms INTEGER NOT NULL\s*\);/, f);
  }
  assert.match(read('workers/sim-leaderboard/DEPLOY.md'), /migrate-lines\.sql/);
  const html = read('sim.html');
  assert.match(html, /<button type="button" id="toastShare">SHARE<\/button>/, 'SHARE on the finish screen');
  assert.match(html, /'<button type="button" id="lapShare">SHARE<\/button><\/span>'/, 'SHARE under the result on the lap panel');
  assert.match(html, /<button class="menu-flight" id="menuShare" disabled>Finish a run to share<\/button>/, 'SHARE in the pause menu');
  assert.match(html, /if\(e\.key\.toLowerCase\(\)==='k'&&!e\.repeat&&!e\.ctrlKey&&!e\.metaKey&&!e\.altKey\)shareLine\(\);/, 'K shares');
  assert.match(html, /if\(e\.key\.toLowerCase\(\)==='h'\)\{\s+if\(feel\)toast\(feel\.toggleHud\(\)/, 'H is the stick HUD already, so SHARE is K');
  assert.match(html, /<b>K — Share last run \(link\)<\/b>/, 'K is in the legend');
  assert.match(html, /syncBuildUI\(\);\s+applyLineLink\(\);\s+\}\s+function publishTracks/, 'a line link is read once the boot has landed its map and track');
  assert.match(html, /<div id="lineBanner" role="status"><\/div>/);
});

// ---- headless Chrome ----

function resolveChrome() {
  const names = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'chrome'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2',
  })[extname(p)] || 'application/octet-stream';
}

async function serveRoot() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    try { res.writeHead(200, { 'content-type': mime(file) }); res.end(readFileSync(file)); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  return { server, port: server.address().port };
}

let cdpSeq = 0;
function cdp(ws, method, params) {
  const id = ++cdpSeq;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 45000);
    function on(msg) {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        if (o.id === id) {
          clearTimeout(t);
          ws.removeEventListener('message', on);
          if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error)));
          else resolve(o.result || {});
        }
      } catch (e) { /* ignore */ }
    }
    ws.addEventListener('message', on);
  });
}

async function evaluate(ws, expression) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
  return r.result ? r.result.value : undefined;
}

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// Before the page's scripts: navigator.getGamepads() with one fake pad, as
// Chrome reports it (as tools/test_sim_easy_mode.mjs).
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, id: '', mapping: '', axes: [], buttons: 0 };
  const make = () => ({ id: pads.id, index: 0, mapping: pads.mapping, connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on ? make() : null, null, null, null];
    },
  });
})()`;

// In the page: a run flown gate to gate, the finish screen, the banner.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(8); }
    return !!fn();
  };
  const toast = () => document.getElementById('toast');
  // The quad put at each gate of the active track in turn (the core's own
  // teleport, so the page sees it cross them): gate 1 starts the run, the last
  // finishes it. A hop once the page has counted the gate before (a slow
  // frame must not skip one), and never under 150 ms apart; ws: scene units
  // per metre.
  async function flyGates(ws) {
    const track = s.tracks().find((t) => t.id === s.track());
    const b = s.bfCore();
    // The gate number only: the split beside it ticks every frame.
    const counter = () => (/ GATE (\d+)\//.exec(document.getElementById('osdGate').textContent) || [])[1];
    for (const g of track.gates) {
      const before = counter();
      // A pass is entering the gate's sphere: a gate whose sphere already holds
      // the gate before it is entered from above it.
      const put = (up) => b.teleport({ x: -g.z / ws, y: -g.x / ws, z: (g.y + up) / ws }, { x: 0, y: 0, z: 0, w: 1 });
      put(0);
      let counted = await until(() => counter() !== before, 600);
      for (let i = 0; i < 3 && !counted; i++) {
        put(3 * (g.size || 2));
        await wait(120);
        put(0);
        counted = await until(() => counter() !== before, 600);
      }
      await wait(150);
    }
    const done = await until(() => !!document.getElementById('toastShare'), 3000);
    return { gates: track.gates.length, done, toast: toast().textContent, run: s.line().run };
  }
  async function share() {
    const before = s.line().link;
    document.getElementById('toastShare').click();
    const copied = await until(() => s.line().link !== before && /LINK|CLIPBOARD/.test(toast().textContent), 6000);
    let clip = null;
    try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'unreadable: ' + e.message; }
    return { copied, link: s.line().link, toast: toast().textContent, clip };
  }
  function landed() {
    const el = document.getElementById('lineBanner');
    const box = el.getBoundingClientRect();
    return {
      map: s.map(), track: s.track(), line: s.line(),
      banner: { on: el.classList.contains('show') && getComputedStyle(el).display !== 'none' && box.width > 0, text: el.textContent,
        inView: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth },
      menu: document.body.classList.contains('menu-open'), prompt: !!(window._feel && window._feel.promptOpen),
      gates: (s.tracks().find((t) => t.id === s.track()) || { gates: [] }).gates.length, toast: toast().textContent,
    };
  }
  // The lap panel: its text, whether it is a result, its buttons.
  function panel() {
    const el = document.getElementById('osdLap');
    const btn = document.getElementById('lapShare');
    const box = btn ? btn.getBoundingClientRect() : null;
    return {
      text: el.textContent, result: / RESULT /.test(el.textContent),
      replay: !!document.getElementById('lapReplay'), share: !!btn,
      inView: !!box && box.width > 0 && box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
    };
  }
  // Before a share by any button or key: nothing said, and something else on
  // the clipboard. After it: what the page said and what the clipboard holds.
  async function unmark(mark) {
    toast().textContent = '';
    await navigator.clipboard.writeText(mark);
  }
  async function shared() {
    const said = await until(() => /LINK COPIED|CLIPBOARD/.test(toast().textContent), 6000);
    let clip = null;
    try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'unreadable: ' + e.message; }
    return { said, link: s.line().link, toast: toast().textContent, clip };
  }
  window.__sh = { s, wait, until, flyGates, share, landed, panel, unmark, shared };
  return true;
})()`;

test('Fly my line in Chrome', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;
  const debugPort = 9300 + (process.pid % 300);
  // The leaderboard Worker, in this process: its real handler on an in-memory
  // D1, answering the page's requests to the deployed Worker's address.
  const worker = { env: { DB: fakeD1(), ALLOWED_ORIGIN: origin }, up: true, calls: [] };

  // A pass: a fresh Chrome profile, the given pad and localStorage, the page at url.
  async function pass(url, seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-share-'));
    const child = spawn(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let ws = null;
    try {
      let page = null;
      for (let i = 0; i < 100 && !page; i++) {
        await sleep(200);
        try {
          const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
          page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
        } catch (e) { /* Chrome is still coming up */ }
      }
      assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      // Every request to the Worker's address stops here.
      ws.addEventListener('message', async (msg) => {
        let o = null;
        try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
        if (!o || o.method !== 'Fetch.requestPaused') return;
        const { requestId, request } = o.params;
        try {
          worker.calls.push(request.method + ' ' + new URL(request.url).pathname);
          if (!worker.up) { await cdp(ws, 'Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }); return; }
          const headers = { ...request.headers };
          if (!Object.keys(headers).some((k) => k.toLowerCase() === 'origin')) headers.Origin = origin;
          const init = { method: request.method, headers };
          if (request.postData != null) init.body = request.postData;
          const res = await handleLeaderboard(new Request(request.url, init), worker.env);
          await cdp(ws, 'Fetch.fulfillRequest', {
            requestId, responseCode: res.status,
            responseHeaders: [...res.headers].map(([name, value]) => ({ name, value })),
            body: Buffer.from(await res.arrayBuffer()).toString('base64'),
          });
        } catch (e) {
          try { await cdp(ws, 'Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch (e2) { /* the page is gone */ }
        }
      });
      await cdp(ws, 'Runtime.enable');
      await cdp(ws, 'Page.enable');
      await cdp(ws, 'Fetch.enable', { patterns: [{ urlPattern: LEADERBOARD_URL + '/*' }] });
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      // Same origin first, for localStorage and sessionStorage before the page's scripts.
      await cdp(ws, 'Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pad || { on: false, id: '', mapping: '', axes: [], buttons: 0 })}));
        return true;
      })()`);
      await cdp(ws, 'Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(250);
        try {
          ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._simQueryBooted && window._sim.line && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`);
        } catch (e) { /* the page is still loading */ }
      }
      assert.ok(ready, 'the bf core flies');
      // The clipboard, as a pilot with the page in front who allowed it (a
      // headless page is never focused, and asks nobody).
      await cdp(ws, 'Emulation.setFocusEmulationEnabled', { enabled: true });
      await cdp(ws, 'Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
      await evaluate(ws, PAGE);
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const S = window.__sh; ${body} })()`));
      // A real click: the mouse, at the middle of the element, when the element is what is there.
      const click = async (id) => {
        const p = JSON.parse(await evaluate(ws, `(() => {
          const el = document.getElementById(${JSON.stringify(id)});
          if (!el) return JSON.stringify({ found: false });
          el.scrollIntoView({ block: 'center' });
          const b = el.getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          const top = document.elementFromPoint(x, y);
          // And it is what the pilot sees there: nothing painted over it (a box that
          // takes no clicks, as the key legend, would hide it and still let the click through).
          const all = document.createElement('style');
          all.textContent = '*{pointer-events:auto !important}';
          document.head.appendChild(all);
          const stack = document.elementsFromPoint(x, y);
          all.remove();
          const shown = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n); if (c.opacity === '0' || c.visibility === 'hidden' || c.display === 'none') return false; } return true; };
          const over = stack.find(shown);
          return JSON.stringify({ found: true, x, y, hit: top === el, seen: over === el, over: over ? (over.id || over.tagName) : null, top: top ? (top.id || top.tagName) : null, disabled: !!el.disabled, text: el.textContent });
        })()`));
        if (p.found && p.hit) {
          await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
          await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
          await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
        }
        return p;
      };
      // A real key, pressed and let go.
      const key = async (k, code, vk) => {
        await cdp(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk });
        await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      };
      await flow({ js, click, key });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
      }
    }
  }

  const tx = { on: true, id: TX, mapping: '', axes: [0, 0, -1, 0, -1, -1, -1, -1], buttons: 0 };
  const sim = (query) => `${origin}/sim.html?quality=low&${query}`;
  const NO_MENUS = { menu: false, prompt: false };
  const links = {};
  const flown = {};

  try {
    await t.test('a fresh profile flies the Rig Loop; SHARE on the finish screen copies a link: in the URL, then on the Worker, then (Worker down) the long link', async () => {
      await pass(sim('map=rig&track=rig-loop'), { pad: tx }, async ({ js }) => {
        let r = await js(`
          const name = document.getElementById('pilotName');
          name.value = 'RyFly';
          name.dispatchEvent(new Event('input'));
          await S.wait(600);
          return JSON.stringify({ track: S.s.track(), before: S.s.line(), share: !!document.getElementById('toastShare') });`);
        assert.equal(r.track, 'rig-loop');
        assert.equal(r.before.run, null, 'nothing to share before a run');
        assert.equal(r.share, false);

        r = await js(`const fly = await S.flyGates(${WS}); const out = await S.share(); return JSON.stringify({ fly, out, rival: S.s.line().rival });`);
        console.log('inline: ' + JSON.stringify({ toast: r.fly.toast.slice(0, 60), n: r.fly.run && r.fly.run.n, link: r.out.link.length, said: r.out.toast }));
        assert.equal(r.fly.done, true, `the run finished with SHARE on its finish screen (${r.fly.toast})`);
        assert.match(r.fly.toast, /^LINE \d/, 'the finish screen');
        assert.match(r.fly.toast, /Replay\s*SHARE$/, 'Replay and SHARE');
        assert.ok(r.fly.run.n >= 2, 'a ghost was recorded');
        assert.equal(r.out.copied, true);
        assert.equal(r.out.toast, 'LINK COPIED — RACE MY LINE');
        assert.equal(r.out.clip, r.out.link, 'the link is on the clipboard');
        assert.ok(r.out.link.startsWith(`${origin}/sim.html?map=rig&track=rig-loop#line=L1.`), r.out.link.slice(0, 90));
        assert.ok(r.out.link.length <= LINE_URL_MAX, `a link that fits (${r.out.link.length})`);
        assert.deepEqual(worker.calls, [], 'no Worker needed');
        links.inline = r.out.link;
        flown.inline = r.fly.run;

        // The same flight with a link limit it cannot meet: the Worker keeps it.
        r = await js(`
          S.s.setLineUrlMax(200);
          await S.wait(400);
          const fly = await S.flyGates(${WS});
          const out = await S.share();
          return JSON.stringify({ fly, out });`);
        console.log('stored: ' + JSON.stringify({ link: r.out.link, said: r.out.toast, calls: worker.calls }));
        assert.equal(r.fly.done, true);
        assert.equal(r.out.toast, 'LINK COPIED — RACE MY LINE');
        assert.match(r.out.link, new RegExp('^' + origin.replace(/\./g, '\\.') + '/sim\\.html\\?map=rig&track=rig-loop#line=@[A-Za-z0-9_-]{10,32}$'), 'the link carries the id');
        assert.equal(r.out.clip, r.out.link);
        assert.ok(worker.calls.includes('POST /api/line'), worker.calls.join(', '));
        assert.equal(worker.env.DB.lines.size, 1, 'one line stored');
        links.stored = r.out.link;
        flown.stored = r.fly.run;

        // The Worker unreachable: the long link, said to be one.
        worker.up = false;
        r = await js(`
          await S.wait(400);
          const fly = await S.flyGates(${WS});
          const out = await S.share();
          return JSON.stringify({ fly, out });`);
        worker.up = true;
        console.log('worker down: ' + JSON.stringify({ link: r.out.link.length, said: r.out.toast }));
        assert.match(r.out.toast, /^LINK COPIED — RACE MY LINE — LONG LINK \(\d+KB\)$/);
        assert.ok(r.out.link.includes('#line=L1.') && r.out.link.length > 200, 'the ghost itself, in the link');
        assert.equal(r.out.clip, r.out.link);
        const line = await decodeLineCode(lineFromHash(new URL(r.out.link).hash));
        assert.equal(ghostPayloadError(line.ghost, 'rig-loop'), null, 'and it is a line');
        assert.equal(worker.env.DB.lines.size, 1, 'nothing more stored');
      });
    });

    await t.test('SHARE 30 s after a finish: still on the lap panel and in the pause menu, by the mouse; K shares too; off the panel when the next run starts', async () => {
      await pass(sim('map=rig&track=rig-loop'), { pad: tx }, async ({ js, click, key }) => {
        // Before any run: nothing on the panel, the menu's button says what to do, and so does K.
        let r = await js(`
          const menu = document.getElementById('menuShare');
          await S.unmark('none yet');
          return JSON.stringify({ panel: S.panel(), menu: { text: menu.textContent, disabled: menu.disabled }, run: S.s.line().run });`);
        assert.equal(r.run, null);
        assert.equal(r.panel.share, false, 'no SHARE on the panel before a run');
        assert.deepEqual(r.menu, { text: 'Finish a run to share', disabled: true }, 'the menu says how to have one');
        await key('k', 'KeyK', 75);
        r = await js(`await S.wait(300); return JSON.stringify({ toast: document.getElementById('toast').textContent, link: S.s.line().link });`);
        assert.equal(r.toast, 'FINISH A RUN TO SHARE', 'K with no run says so');
        assert.equal(r.link, '');

        // A run, then 30 s of nothing: the finish toast has been gone for 25.
        r = await js(`
          const fly = await S.flyGates(${WS});
          const t0 = performance.now();
          await S.wait(30000);
          const toastEl = document.getElementById('toast');
          return JSON.stringify({ fly, waited: performance.now() - t0, toast: { opacity: getComputedStyle(toastEl).opacity, clicks: getComputedStyle(toastEl).pointerEvents }, panel: S.panel() });`);
        console.log('30 s after: ' + JSON.stringify({ waited: Math.round(r.waited), toast: r.toast, panel: r.panel }));
        assert.equal(r.fly.done, true, 'the run finished');
        assert.ok(r.waited >= 30000, `${Math.round(r.waited)} ms after the finish`);
        assert.deepEqual(r.toast, { opacity: '0', clicks: 'none' }, 'the finish toast is gone and takes no click');
        assert.deepEqual([r.panel.result, r.panel.replay, r.panel.share], [true, true, true], 'the result, with Replay and SHARE under it: ' + r.panel.text);
        assert.equal(r.panel.inView, true, 'on screen');

        // The panel's SHARE, with the mouse.
        await js(`await S.unmark('before the panel'); return 1;`);
        let hit = await click('lapShare');
        assert.deepEqual([hit.found, hit.hit, hit.text], [true, true, 'SHARE'], 'the button is what is under the mouse: ' + JSON.stringify(hit));
        assert.equal(hit.seen, true, 'and nothing is painted over it: ' + JSON.stringify(hit));
        r = await js(`return JSON.stringify(await S.shared());`);
        assert.equal(r.toast, 'LINK COPIED — RACE MY LINE', 'the panel SHARE works');
        assert.ok(r.link.startsWith(`${origin}/sim.html?map=rig&track=rig-loop#line=L1.`), r.link.slice(0, 90));
        assert.equal(r.clip, r.link, 'the link is on the clipboard');
        const link = r.link;

        // The pause menu's, with the mouse.
        await key('Escape', 'Escape', 27);
        r = await js(`
          await S.wait(400);
          const menu = document.getElementById('menuShare');
          await S.unmark('before the menu');
          return JSON.stringify({ open: document.body.classList.contains('menu-open'), text: menu.textContent, disabled: menu.disabled });`);
        assert.deepEqual(r, { open: true, text: 'SHARE last run', disabled: false }, 'the pause menu offers the last run');
        hit = await click('menuShare');
        assert.deepEqual([hit.found, hit.hit, hit.seen], [true, true, true], 'the button is what is under the mouse, in plain sight: ' + JSON.stringify(hit));
        r = await js(`return JSON.stringify(await S.shared());`);
        assert.equal(r.toast, 'LINK COPIED — RACE MY LINE', 'the menu SHARE works');
        assert.equal(r.clip, link, 'the same run, the same link');

        // K, flying again.
        await key('Escape', 'Escape', 27);
        await js(`await S.wait(400); await S.unmark('before K'); return 1;`);
        await key('k', 'KeyK', 75);
        r = await js(`return JSON.stringify({ ...(await S.shared()), menu: document.body.classList.contains('menu-open'), panel: S.panel() });`);
        assert.equal(r.menu, false, 'back in flight');
        assert.equal(r.toast, 'LINK COPIED — RACE MY LINE', 'K works');
        assert.equal(r.clip, link, 'K copies the same link');
        assert.equal(r.panel.share, true, 'and SHARE is still on the panel');

        // The next run starts: the panel is the live clock, without the buttons.
        r = await js(`
          const g = S.s.tracks().find((t) => t.id === S.s.track()).gates[0];
          S.s.bfCore().teleport({ x: -g.z / ${WS}, y: -g.x / ${WS}, z: g.y / ${WS} }, { x: 0, y: 0, z: 0, w: 1 });
          await S.wait(600);
          return JSON.stringify(S.panel());`);
        assert.deepEqual([r.result, r.share, r.replay], [false, false, false], 'a run under way: ' + r.text);
        assert.match(r.text, / LINE /, 'the live clock');
      });
    });

    await t.test('a second fresh profile opens the link: the Rig Loop, the ghost loaded, "Race RyFly\'s line"', async () => {
      const before = worker.calls.length;
      await pass(links.inline.replace('?', '?quality=low&'), { pad: tx }, async ({ js }) => {
        const r = await js(`await S.until(() => S.landed().banner.on, 5000); await S.wait(300); return JSON.stringify(S.landed());`);
        console.log('opened: ' + JSON.stringify({ map: r.map, track: r.track, banner: r.banner, rival: r.line.rival && { name: r.line.rival.name, n: r.line.rival.n, lapTime: r.line.rival.lapTime } }));
        assert.equal(r.map, 'rig');
        assert.equal(r.track, 'rig-loop', 'on that track');
        assert.equal(r.gates, 17, 'its gates');
        assert.deepEqual({ menu: r.menu, prompt: r.prompt }, NO_MENUS, 'flying, no menu');
        assert.ok(r.line.rival, 'the ghost is loaded');
        assert.equal(r.line.rival.name, 'RyFly');
        assert.equal(r.line.rival.track, 'rig-loop');
        assert.equal(r.line.rival.lapTime, Math.round(flown.inline.total), 'with its time');
        assert.ok(r.line.rival.n >= 2, `${r.line.rival.n} samples`);
        assert.equal(r.banner.on, true, 'the banner is up');
        assert.equal(r.banner.text, "Race RyFly's line");
        assert.equal(r.banner.inView, true);
        assert.equal(worker.calls.length, before, 'the ghost came in the link: no Worker');
      });
    });

    await t.test('a fresh profile with no controller opens the Worker link: the ghost fetched, the banner once the first-run prompt is answered', async () => {
      await pass(links.stored.replace('?', '?quality=low&'), {}, async ({ js }) => {
        let r = await js(`await S.until(() => !!S.s.line().rival, 5000); return JSON.stringify(S.landed());`);
        assert.ok(worker.calls.includes('GET /api/line'), worker.calls.join(', '));
        assert.equal(r.track, 'rig-loop');
        assert.ok(r.line.rival, 'the ghost is loaded');
        assert.equal(r.line.rival.name, 'RyFly');
        assert.equal(r.line.rival.lapTime, Math.round(flown.stored.total));
        assert.equal(r.prompt, true, 'the first-run prompt, as on any first visit');
        r = await js(`document.getElementById('feelKeys').click(); await S.wait(400); return JSON.stringify(S.landed());`);
        assert.equal(r.banner.on, true);
        assert.equal(r.banner.text, "Race RyFly's line");
        assert.equal(r.banner.inView, true);
      });
      // An id the Worker does not have: on the track, and told so where the
      // banner would be, for a while.
      await pass(sim('map=rig&track=rig-loop') + '#line=@AAAAAAAAAAAAAAAA', { pad: tx }, async ({ js }) => {
        const r = await js(`
          const first = S.landed();
          const gone = await S.until(() => !S.landed().banner.on, 9000);
          return JSON.stringify({ first, gone, rival: S.s.line().rival });`);
        assert.equal(r.first.banner.on, true);
        assert.equal(r.first.banner.text, 'Line link not found');
        assert.equal(r.first.track, 'rig-loop', 'still on the track');
        assert.equal(r.rival, null, 'no rival');
        assert.equal(r.gone, true, 'and the note goes');
      });
      // A link cut short in a chat: not valid, said the same way.
      await pass(links.inline.replace('?', '?quality=low&').slice(0, -30), { pad: tx }, async ({ js }) => {
        const r = await js(`return JSON.stringify(S.landed());`);
        assert.equal(r.banner.text, 'Line link not valid');
        assert.equal(r.track, 'rig-loop');
        assert.equal(r.line.rival, null);
      });
    });

    await t.test('a custom track travels with its ghost: the opener has never seen it, and lands on it', async () => {
      const track = { id: 'custom-yard', name: 'Yard', map: 'rig', class: 'whoop', flags: [],
        gates: [{ x: -15.225, y: 4.2, z: -19.6, ry: 1.5708, size: 1.925, solid: false }, { x: 0, y: 4.2, z: -19.6, ry: 1.5708, size: 1.925, solid: false }, { x: 15.225, y: 4.2, z: -19.6, ry: 1.5708, size: 1.925, solid: false }] };
      let link = null;
      await pass(sim('map=rig&track=custom-yard'), { pad: tx, storage: { [CUSTOM_TRACKS_KEY]: JSON.stringify([track]) } }, async ({ js }) => {
        const r = await js(`await S.wait(500); const track = S.s.track(); const fly = await S.flyGates(${WS}); const out = await S.share(); return JSON.stringify({ track, fly, out });`);
        assert.equal(r.track, 'custom-yard');
        assert.equal(r.fly.done, true, r.fly.toast);
        assert.match(r.out.toast, /^LINK COPIED — RACE MY LINE/);
        link = r.out.link;
        const line = await decodeLineCode(lineFromHash(new URL(link).hash));
        assert.equal(fromShareTrackPayload(line.trackPayload).gates.length, 3, 'the track is in the link');
      });
      await pass(link.replace('?', '?quality=low&'), { pad: tx }, async ({ js }) => {
        const r = await js(`await S.until(() => S.landed().banner.on, 5000); await S.wait(300); return JSON.stringify(S.landed());`);
        assert.equal(r.map, 'rig');
        assert.equal(r.track, 'custom-yard', 'on the track that came with the link');
        assert.equal(r.gates, 3);
        assert.equal(r.banner.text, 'Race this line', 'a pilot with no name set');
        assert.ok(r.line.rival && r.line.rival.track === 'custom-yard');
      });
    });
  } finally {
    await new Promise((res) => server.close(res));
  }
});
