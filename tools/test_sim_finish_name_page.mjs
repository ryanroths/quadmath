// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// A finish to a name on a board (sim.html maybeSubmitBuiltin, openResultAsk,
// the result card, openNameCard).
//   - In node: the page's built-in race tracks (fetchBuiltinTracks, the rule
//     of builtinBoardTrack) are the Worker's (sim-builtin-boards.js), gate for
//     gate: the same ids and the same hashes, so a run the page sends is on
//     the board it was flown on. The test's own flight of the Rig Loop (a
//     smooth path through the gates and the pipe slit) clears the Rig's boxes
//     and its 15 Hz samples pass the Worker's check. In the source: the result
//     card pauses the sim, Not now holds for the tab session, R in a run keeps
//     it off the boards, a run the board would refuse is not asked about, the
//     note that sent pilots to Tune is gone.
//   - In headless Chrome, desktop (keyboard, 1280x720) and phone (touch,
//     812x375): a fresh visitor flies the Rig Loop to its finish. The result
//     card asks for a name and the sim waits (its clock stands still); the
//     splits keep one line; on the phone the field and buttons are 44 px or
//     more. The name typed and Post (Enter on the desktop, a tap on the
//     phone): the run goes up, the board shows with the pilot's row lit, #1,
//     the Worker has it, and the lap and name pings went out. Fly on: the sim
//     runs again. The same pilot's next finish, faster: posted with no card,
//     the lap panel's place. Desktop, another fresh visitor: Not now closes
//     the card, the time kept; the next finish asks nothing.
// The leaderboard Worker is its real handler in this process on an in-memory
// SQLite D1 (tools/d1_sqlite.mjs); every request to it is caught (CDP
// Fetch), and the count pings are recorded. The page is served as
// sim.quadmath.test (the counter is off on a local page). The flight is the
// quad put on its path each frame (the bf core's teleport), as
// tools/test_sim_track_boards.mjs flies, so a slow runner slows it and
// skips nothing.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); its Chrome parts
// skip under SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  LEADERBOARD_URL, PHYS_VER, builtinTrackHash, normalizeBuiltinSubmit, lineRunPasses, flightSpikes,
} from '../sim-retention.js';
import { fetchBuiltinTracks, PUBLIC_MAPS } from '../sim-tracks.js';
import { BUILTIN_BOARD_TRACKS } from '../sim-builtin-boards.js';
import { buildPath } from './coach_rig_autopilot.mjs';
import { mapWorld } from './coach_rig_pilot.mjs';
import { toModule } from '../sim-core-adapter.js';
import { sqliteD1 } from './d1_sqlite.mjs';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';
import { pilotNameKey } from '../sim-pilot-names.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HOST = 'sim.quadmath.test';
const WS = 3.5;
const html = readFileSync(join(root, 'sim.html'), 'utf8').replace(/\r\n/g, '\n');
const extract = (name) => {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  let i = html.indexOf('{', start), depth = 0;
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1); }
  throw new Error(name);
};

// The page's built-in tracks, read from tracks/*.json as the page fetches them.
const pageTracks = () => fetchBuiltinTracks(async (file) => {
  const p = join(root, file);
  return { ok: existsSync(p), json: async () => JSON.parse(readFileSync(p, 'utf8')) };
});

// The test's flight of the Rig Loop: waypoints in metres (scene axes), a
// point 0.4 m either side of each gate along the line, and the pipe slit
// between gates 13 and 14 (sim-maps.js RIG_PLAY.gaps.pipes); the autopilot's
// smooth path through them. The same in the page (FLY below).
function rigWaypoints(track) {
  const m = (g) => [g.x / WS, g.y / WS, g.z / WS];
  const wps = [];
  track.gates.forEach((g, i) => {
    const c = m(g);
    if (i === 14) wps.push([-9.05, 4.875, 0.45], [-9.05, 4.2, -0.2]);
    const n = track.gates[i + 1] ? m(track.gates[i + 1]) : null, p = track.gates[i - 1] ? m(track.gates[i - 1]) : null;
    let nx = Math.sin(g.ry), nz = Math.cos(g.ry);
    const dir = n ? [n[0] - c[0], n[2] - c[2]] : [c[0] - p[0], c[2] - p[2]];
    if (nx * dir[0] + nz * dir[1] < 0) { nx = -nx; nz = -nz; }
    wps.push([c[0] - nx * 0.4, c[1], c[2] - nz * 0.4], c, [c[0] + nx * 0.4, c[1], c[2] + nz * 0.4]);
  });
  return wps;
}
const PATH_PLAN = (wps) => ({ wps: wps.map((p) => ({ p, v: 9 })), yaw0: 0, limits: { lat: 12, acc: 9, dec: 13 }, vEnd: 9 });

test('the page\'s built-in race tracks are the Worker\'s, gate for gate: the same ids, the same hashes', async () => {
  const tracks = await pageTracks();
  // sim.html builtinBoardTrack: not a city loop, not free flight, a public map, gates.
  assert.match(extract('builtinBoardTrack'), /t&&t\.legacyId==null&&!t\.freestyle&&mapOpen\(t\.map,false\)&&Array\.isArray\(t\.gates\)&&t\.gates\.length>1\?t:null/);
  const boards = tracks.filter((t) => t.legacyId == null && !t.freestyle && PUBLIC_MAPS.includes(t.map) && Array.isArray(t.gates) && t.gates.length > 1);
  assert.deepEqual(boards.map((t) => t.id), BUILTIN_BOARD_TRACKS.map((t) => t.id));
  for (const t of boards) {
    const w = BUILTIN_BOARD_TRACKS.find((b) => b.id === t.id);
    assert.equal(await builtinTrackHash(t), await builtinTrackHash(w), t.id);
  }
});

test('the test\'s flight of the Rig Loop: clear of the Rig\'s boxes, and its samples pass the Worker\'s check', async () => {
  const t = BUILTIN_BOARD_TRACKS.find((b) => b.id === 'rig-loop');
  const path = buildPath(PATH_PLAN(rigWaypoints(t)));
  const world = await mapWorld('rig');
  const R = 0.05;
  const hits = path.filter((q, i) => i % 5 === 0).filter((q) => {
    const m = toModule({ x: q.p.x * WS, y: q.p.y * WS, z: q.p.z * WS }, {});
    return world.boxes.some((b) => m.x > b.min[0] - R && m.x < b.max[0] + R && m.y > b.min[1] - R && m.y < b.max[1] + R && m.z > b.min[2] - R && m.z < b.max[2] + R);
  });
  assert.equal(hits.length, 0, 'within 5 cm of a box: ' + JSON.stringify(hits.slice(0, 3).map((q) => q.p)));
  // 15 Hz samples along it at the test's speeds, from gate 0 to the finish.
  const S = [0];
  for (let i = 1; i < path.length; i++) S.push(S[i - 1] + Math.hypot(path[i].p.x - path[i - 1].p.x, path[i].p.y - path[i - 1].p.y, path[i].p.z - path[i - 1].p.z));
  const at = (d) => { let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= d) lo = mid; else hi = mid; } return path[lo].p; };
  const near = (g) => { let b = 0, bd = Infinity; path.forEach((q, i) => { const d = Math.hypot(q.p.x - g.x / WS, q.p.y - g.y / WS, q.p.z - g.z / WS); if (d < bd) { bd = d; b = i; } }); return S[b]; };
  const d0 = near(t.gates[0]), d1 = near(t.gates[t.gates.length - 1]);
  for (const speed of [4, 5]) {
    const samples = [];
    for (let ms = 0; ; ms += 67) {
      const d = Math.min(d1, d0 + speed * ms / 1000), q = at(d);
      samples.push([d === d1 ? Math.round((d1 - d0) / speed * 1000) : ms, +(q.x * WS).toFixed(2), +(q.y * WS).toFixed(2), +(q.z * WS).toFixed(2), 0, 0, 0, 1]);
      if (d === d1) break;
    }
    const pass = lineRunPasses(samples, t);
    assert.ok(pass.start >= 0 && pass.finish >= 0, speed + ' m/s: every gate in order');
    const timeMs = samples[pass.finish][0] - samples[pass.start][0];
    const ghost = { v: 1, phys: PHYS_VER, track: t.id, name: 'Tester', lapTime: timeMs, samples };
    const r = await normalizeBuiltinSubmit({ track: t.id, trackHash: await builtinTrackHash(t), frameMm: 65, name: 'Tester', timeMs, ghost, token: 'x' }, BUILTIN_BOARD_TRACKS);
    assert.equal(r.ok, true, speed + ' m/s: ' + r.reason);
    assert.equal(r.held, false, 'over the floor');
    assert.ok(flightSpikes(samples, 65) <= 1, 'no force spikes');
  }
});

test('the result card in the source: a pause only while it asks, Not now for the tab session, R keeps a run off, a refused run not asked about, no note sending pilots to Tune', () => {
  assert.match(html, /function simPaused\(\)\{return [^}]*\|\|!!resultAsk;\}/, 'the sim waits behind the card');
  assert.doesNotMatch(html, /SET A PILOT NAME|onlineNameNote/, 'the Tune note is gone');
  const finish = extract('noteRetentionFinish');
  assert.match(finish, /if\(builtinBoardTrack\(id\)&&!offBoards\)\{\s*if\(testPilotUsed\)held=true;\s*else if\(!runRespawned\)maybeSubmitBuiltin\(id, total, fullRec\|\|submitRec\|\|rec\);/);
  assert.match(finish, /!onlineNameOk\(\)&&!nameLater\(\)&&onlineBoardsEnabled\(leaderboardUrl\(\)\)/, 'asked only with no name, not after Not now');
  assert.match(extract('finishRun'), /downsampleGhost\(ghostRec,BUILTIN_GHOST_MAX_SAMPLES\)/, 'a long loop keeps its full rate');
  // R in a run: a jump the boards refuse; the built-in and builder posts skip it.
  assert.match(extract('resetQuad'), /if\(hasGate\)\{\s*if\(runActive\)runRespawned=true;/);
  assert.match(extract('startRun'), /runRespawned=false;/);
  assert.match(extract('maybeSubmitBuiltin'), /if\(testPilotUsed\|\|runRespawned\)return null;/);
  assert.match(extract('maybeSubmitTrackBoard'), /if\(testPilotUsed\|\|runRespawned\)return null;/);
  // Checked as the Worker checks it before it is sent or asked about.
  const submit = extract('maybeSubmitBuiltin');
  assert.ok(submit.indexOf('builtinCheck(body)') < submit.indexOf("'/api/builtin/submit'"), 'checked first');
  assert.match(submit, /if\(!\(opts&&opts\.post\)&&pb&&total>pb&&builtinSent\.has\(sentKey\)\)j=await builtinBoardGet/, 'posted when a best, the first this session, or the card\'s Post; else the place by GET');
  assert.match(submit, /j\.refused&&j\.status!==429&&!NAME_REFUSALS\.has\(j\.refused\)/, 'a name refused leaves the run to be sent again');
  assert.match(extract('postBoardRun'), /maybeSubmitBuiltin\(run\.id,run\.total,run\.rec,\{post:true\}\)/);
  assert.match(extract('maybeSubmitTrackBoard'), /j\.refused&&j\.status!==429&&!NAME_REFUSALS\.has\(j\.refused\)/);
  // A flight key held into the field: its repeats type nothing; the keys let go on open.
  assert.match(html, /if\(e\.repeat\)\{e\.preventDefault\(\);return;\}\n    if\(e\.key==='Enter'\)\{e\.preventDefault\(\);resultPost\(\);\}/);
  assert.match(extract('openResultAsk'), /for\(const k of Object\.keys\(keys\)\)keys\[k\]=false;/);
  assert.match(submit, /if\(j&&j\.ok\)countNote\('name'\);/);
  assert.match(extract('openResultAsk'), /const ok=await boardRunCheck\(run\);[\s\S]*if\(!ok\.ok\)/);
  // Not now: the tab session.
  assert.match(extract('resultLater'), /sessionStorage\.setItem\(NAME_LATER_KEY,'1'\)/);
  assert.match(extract('nameLater'), /sessionStorage\.getItem\(NAME_LATER_KEY\)==='1'/);
  // A name the board refuses is not kept.
  assert.match(extract('resultPost'), /if\(NAME_REFUSALS\.has\(reason\)\)\{savePilotName\(was\);/);
  // The menu's Pilot name: in flight, and from Boards on the launch screen.
  assert.match(html, /<button class="menu-flight" id="menuName">Pilot name<\/button>/);
  assert.match(extract('openBoardsCard'), /id="boardName"/);
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
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
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// In the page: the flight (the quad put on its path each frame), and what the
// result card, the toast and the lap panel show.
const FLY = String.raw`import('/tools/coach_rig_autopilot.mjs').then((A) => {
  const s = window._sim;
  const $ = (id) => document.getElementById(id);
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; }
    return true;
  };
  const W = window.__fn = { flight: null, cards: 0 };
  // The card's showings, counted on the frame they start.
  let wasUp = false;
  const watch = () => { const up = !!s.resultCard().up; if (up && !wasUp) W.cards++; wasUp = up; requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  W.start = (wps, speed) => {
    const path = A.buildPath({ wps: wps.map((p) => ({ p, v: 9 })), yaw0: 0, limits: { lat: 12, acc: 9, dec: 13 }, vEnd: 9 });
    const S = [0];
    for (let i = 1; i < path.length; i++) S.push(S[i - 1] + Math.hypot(path[i].p.x - path[i - 1].p.x, path[i].p.y - path[i - 1].p.y, path[i].p.z - path[i - 1].p.z));
    const at = (d) => { let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= d) lo = mid; else hi = mid; } return path[lo].p; };
    const t = s.findTrack(s.track()), g0 = t.gates[0];
    let d = 0, bd = Infinity;
    path.forEach((q, i) => { const e = Math.hypot(q.p.x - g0.x / 3.5, q.p.y - g0.y / 3.5, q.p.z - g0.z / 3.5); if (e < bd) { bd = e; d = S[i]; } });
    d = Math.max(0, d - 0.6);
    const b = s.bfCore();
    // Rising at the speed 250 ms of free fall brings back to the path.
    const put = (p) => b.teleport({ x: -p.z, y: -p.x, z: p.y }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 9.81 * 0.125 });
    const f = W.flight = { over: false, frames: 0, longestMs: 0, d, total: S[S.length - 1], t0: performance.now() };
    let last = performance.now();
    const step = () => {
      if (f.over) return;
      // The finish: the toast's time, or the card; the flight stops there.
      if (/^(LINE|RUN) \d/.test($('toast').textContent) && +getComputedStyle($('toast')).opacity > 0.05 || s.resultCard().up) { f.over = true; f.ms = Math.round(performance.now() - f.t0); return; }
      if (f.d >= f.total) { f.over = true; f.ms = Math.round(performance.now() - f.t0); f.ran = true; return; }
      put(at(f.d));
      const now = performance.now(), ms = now - last;
      last = now; f.frames++; f.longestMs = Math.max(f.longestMs, ms);
      // No frame moves it more than 10 cm: a long frame slows the run, skips no gate.
      if (!s.resultCard().paused) f.d += Math.min(ms / 1000 * speed, 0.1);
      requestAnimationFrame(step);
    };
    // The toast from before (the track's name) is not this flight's finish.
    $('toast').textContent = '';
    requestAnimationFrame(step);
    return true;
  };
  W.state = () => {
    const card = s.resultCard(), el = $('resultCard');
    const box = (id) => { const e = $(id); if (!shown(e)) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) }; };
    const sp = $('rcSplits'), ts = document.querySelector('#toast .toast-splits');
    const line = (e) => { if (!e || !e.textContent) return null; const r = e.getBoundingClientRect(); return { h: Math.round(r.height), lh: parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3, right: Math.round(r.right), text: e.textContent }; };
    return { card, cards: W.cards, shown: shown(el), clock: s.simClockMs(), track: String(s.track()), view: [innerWidth, innerHeight],
      title: $('rcTitle').textContent, time: $('rcTime').textContent, place: $('rcPlace').textContent,
      me: [...document.querySelectorAll('#rcRows .board-row.me')].map((r) => r.textContent),
      rows: [...document.querySelectorAll('#rcRows .board-row')].map((r) => r.textContent),
      why: $('rcWhy').textContent, focus: document.activeElement ? document.activeElement.id : null,
      boxes: { name: box('rcName'), post: box('rcPost'), later: box('rcLater'), done: box('rcDone'), card: (() => { const r = el.getBoundingClientRect(); return shown(el) ? { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null; })() },
      field: $('rcName').value,
      splits: line(sp), toastSplits: shown($('toast')) ? line(ts) : null,
      toastButtons: [...document.querySelectorAll('#toast button')].filter(shown).map((e) => Math.round(e.getBoundingClientRect().height)),
      toast: $('toast').textContent, lap: $('osdLap').innerText, touchLayer: getComputedStyle($('touchLayer') || document.body).visibility,
      flight: W.flight ? { over: W.flight.over, frames: W.flight.frames, longestMs: Math.round(W.flight.longestMs), d: +W.flight.d.toFixed(1), total: +W.flight.total.toFixed(1), ran: !!W.flight.ran, ms: W.flight.ms } : null,
      name: localStorage.getItem('quadmath_pilotName'), later: sessionStorage.getItem('quadmathSimNameLater') };
  };
  return true;
})`;

// One Chrome, one page, its Worker: { open, evaluate, key, type, tap, click, state, pings, calls, worker, close }.
async function openPage({ mobile, w, h }) {
  const { server, port } = await serveRoot();
  const site = `http://${HOST}:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'qm-finish-name-'));
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--window-size=${w},${h}`, `--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${site}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  const close = async () => {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    killTree(child);
    await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
    await new Promise((res) => server.close(res));
    for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
  };
  try {
    let debugPort = 0;
    for (let i = 0; i < 300 && !debugPort; i++) {
      await sleep(100);
      try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
    }
    assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
    let page = null;
    for (let i = 0; i < 300 && !page; i++) {
      await sleep(100);
      try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  } catch (e) { await close(); throw e; }
  let seq = 0;
  const cdp = (method, params) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 30000);
      const on = (msg) => {
        let o;
        try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
        if (o.id !== id) return;
        clearTimeout(t);
        ws.removeEventListener('message', on);
        if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {});
      };
      ws.addEventListener('message', on);
    });
  };
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  // The Worker: its real handler on an in-memory D1. A count ping is
  // recorded and answered 204; the rooms Worker and Cloudflare's analytics
  // are refused.
  const worker = { env: { DB: sqliteD1(), ALLOWED_ORIGIN: site } };
  const pings = [], calls = [];
  ws.addEventListener('message', async (msg) => {
    let o;
    try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
    if (!o || o.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = o.params;
    try {
      if (!request.url.startsWith(LEADERBOARD_URL + '/')) { await cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
      const path = new URL(request.url).pathname;
      if (path === '/api/count' && request.method === 'POST') {
        pings.push(JSON.parse(request.postData));
        await cdp('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }] });
        return;
      }
      calls.push(request.method + ' ' + path);
      const headers = { ...request.headers };
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'origin')) headers.Origin = site;
      headers['CF-Connecting-IP'] = '203.0.113.7';
      const init = { method: request.method, headers };
      if (request.postData != null) init.body = request.postData;
      const res = await handleLeaderboard(new Request(request.url, init), worker.env);
      await cdp('Fetch.fulfillRequest', {
        requestId, responseCode: res.status,
        responseHeaders: [...res.headers].map(([name, value]) => ({ name, value })),
        body: Buffer.from(await res.arrayBuffer()).toString('base64'),
      });
    } catch (e) {
      try { await cdp('Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch (e2) { /* the page is gone */ }
    }
  });
  await cdp('Fetch.enable', { patterns: [
    { urlPattern: LEADERBOARD_URL + '/*' }, { urlPattern: 'https://sim-rooms.ryan-roths.workers.dev/*' },
    { urlPattern: 'https://static.cloudflareinsights.com/*' }, { urlPattern: 'https://cloudflareinsights.com/*' },
  ] });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  if (process.env.SIM_CPU_THROTTLE) await cdp('Emulation.setCPUThrottlingRate', { rate: +process.env.SIM_CPU_THROTTLE });
  await cdp('Emulation.setDeviceMetricsOverride', mobile
    ? { width: w, height: h, deviceScaleFactor: 2.625, mobile: true, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } }
    : { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  if (mobile) {
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', platform: 'Android' });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  const key = async (k, code, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(k.length === 1 ? { text: k } : {}) });
    await sleep(50);
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  // A key held down (its auto-repeats sent with repeat: true), let go apart.
  const keyDown = (k, code, vk, repeat) => cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, autoRepeat: !!repeat, text: k });
  const keyUp = (k, code, vk) => cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  const size = (W, H) => cdp('Emulation.setDeviceMetricsOverride', mobile
    ? { width: W, height: H, deviceScaleFactor: 2.625, mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } }
    : { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const frames = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
  const type = (text) => cdp('Input.insertText', { text });
  const centre = async (id) => {
    const r = JSON.parse(await evaluate(`JSON.stringify((() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return null; const b = el.getBoundingClientRect(); return b.width > 1 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })())`));
    assert.ok(r, id + ' is on screen');
    return r;
  };
  const tap = async (id) => {
    const { x, y } = await centre(id);
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const click = async (id) => {
    const { x, y } = await centre(id);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const state = async () => JSON.parse(await evaluate('JSON.stringify(window.__fn.state())'));
  const until = async (fn, ms, what) => {
    const t0 = Date.now();
    let v;
    while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(100); }
    assert.fail(what + ' (waited ' + ms + ' ms): ' + JSON.stringify(await state()));
  };
  // A fresh visitor's page: storage clear but the input choice (no first-run
  // prompt over the race); the Rig Loop picked as the Tracks picker picks it.
  const open = async (input) => {
    await cdp('Page.navigate', { url: `${site}/robots.txt` });
    await sleep(250);
    await evaluate(`(localStorage.clear(), sessionStorage.clear(), localStorage.setItem('quadmathSimInputChoice', ${JSON.stringify(input)}), true)`);
    await cdp('Page.navigate', { url: `${site}/sim.html?quality=low` });
    let ok = false;
    const t0 = Date.now();
    while (!ok && Date.now() - t0 < 120000) {
      await sleep(250);
      try { ok = await evaluate(`!!(window._sim && window._simQueryBooted && window._sim.core && window._sim.core() === 'bf' && window._sim.resultCard && window._sim.builtinBoardTrack('rig-loop'))`); } catch (e) { /* navigating */ }
    }
    assert.ok(ok, 'booted on the bf core, the built-in tracks in');
    await evaluate(FLY);
    await until(() => evaluate('!!window.__fn'), 10000, 'the flight helper loaded');
  };
  // The Rig Loop from its pad, flown to the finish at speed m/s.
  const rig = JSON.parse(readFileSync(join(root, 'tracks', 'rig-loop.json'), 'utf8'));
  const flyRig = async (speed, o = {}) => {
    await evaluate(`(window._sim.flyPickedTrack('rig', 'rig-loop'), true)`);
    await until(async () => (await state()).track === 'rig-loop', 10000, 'on the Rig Loop');
    await sleep(500);
    await evaluate(`window.__fn.start(${JSON.stringify(rigWaypoints(rig))}, ${speed})`);
    if (o.hold) await keyDown('w', 'KeyW', 87, false);
    const t0 = Date.now();
    let s;
    while (Date.now() - t0 < 240000) {
      s = await state();
      if (s.flight && s.flight.over) break;
      await sleep(250);
    }
    assert.ok(s.flight && s.flight.over && !s.flight.ran, 'the finish, before the path ran out: ' + JSON.stringify(s));
    return s;
  };
  const board = async () => {
    const r = await handleLeaderboard(new Request(LEADERBOARD_URL + '/api/builtin/board?track=rig-loop&class=65', { headers: { Origin: site } }), worker.env);
    return (await r.json()).entries;
  };
  return { cdp, evaluate, key, keyDown, keyUp, size, frames, type, tap, click, state, until, open, flyRig, board, pings, calls, worker, close };
}

const skipChrome = (t) => { if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return true; } return false; };

// A fresh visitor's finish, named and posted; then the same pilot's next
// finish, faster, posted with no card. press(id): a click or a tap.
async function nameAndPost(P, { mobile, input, press, name, taken }) {
  await P.open(input);
  // Desktop: W held through the finish, as a keyboard pilot's throttle is.
  const fin = await P.flyRig(4, { hold: !mobile });
  let s = await P.until(async () => { const x = await P.state(); return x.card.up && x.card.asking ? x : null; }, 10000, 'the result card');
  if (!mobile) {
    // Its auto-repeats, the field focused: they type nothing.
    for (let i = 0; i < 5; i++) { await P.keyDown('w', 'KeyW', 87, true); await sleep(40); }
    await P.keyUp('w', 'KeyW', 87);
    assert.equal((await P.state()).field, '', 'a held key types nothing into the field');
  }
  assert.equal(fin.card.up || s.card.up, true);
  assert.equal(s.card.kind, 'builtin');
  assert.equal(s.cards, 1, 'one card');
  assert.equal(s.title, 'Rig Loop');
  assert.match(s.time, /^\d+:\d\d\.\d\d$/);
  assert.equal(s.card.paused, true, 'the sim waits');
  const c0 = s.clock;
  await sleep(700);
  assert.equal((await P.state()).clock, c0, 'its clock stands still behind the card');
  // The splits: one line, inside the view.
  assert.ok(s.splits && s.splits.text.split(' / ').length === 16, 'sixteen gate splits: ' + JSON.stringify(s.splits));
  assert.ok(s.splits.h <= s.splits.lh * 1.5 && s.splits.right <= s.view[0], 'one line, in view: ' + JSON.stringify(s.splits));
  const fits = (x, where) => {
    for (const k of ['name', 'post', 'later']) assert.ok(x.boxes[k] && x.boxes[k].h >= 44, where + ': ' + k + ' is a thumb\'s 44 px: ' + JSON.stringify(x.boxes));
    const c = x.boxes.card;
    assert.ok(c && c.top >= 0 && c.left >= 0 && c.right <= x.view[0] && c.bottom <= x.view[1], where + ': the card inside the view ' + JSON.stringify(c) + ' ' + x.view);
    assert.ok(x.splits.h <= x.splits.lh * 1.5 && x.splits.right <= x.view[0], where + ': the splits on one line ' + JSON.stringify(x.splits));
  };
  if (mobile) {
    fits(s, '812x375');
    assert.equal(s.touchLayer, 'hidden', 'the sticks are out of the way');
    for (const [W, H] of [[667, 375], [375, 812]]) {
      await P.size(W, H);
      await P.frames();
      await sleep(300);
      fits(await P.state(), W + 'x' + H);
    }
    await P.size(812, 375);
    await P.frames();
  } else assert.equal(s.focus, 'rcName', 'the field has the keyboard');
  assert.ok(P.pings.some((p) => p.event === 'lap'), 'the lap ping');
  assert.ok(!P.pings.some((p) => p.event === 'name'), 'no name ping yet');
  assert.ok(!P.calls.includes('POST /api/builtin/submit'), 'nothing posted without a name');
  let posts = 0;
  const postsNow = () => P.calls.filter((c) => c === 'POST /api/builtin/submit').length;
  // A name another browser holds: the reason in the card, the name not kept,
  // and the field asks again.
  if (taken) {
    await P.worker.env.DB.prepare('INSERT INTO pilot_keys (key, name, token_hash, claimed_ms) VALUES (?, ?, ?, ?)').bind(pilotNameKey(taken), taken, 'f'.repeat(64), 1).run();
    if (mobile) await press('rcName');
    await P.type(taken);
    if (mobile) await press('rcPost'); else await P.key('Enter', 'Enter', 13);
    s = await P.until(async () => { const x = await P.state(); return /Another pilot has that name/.test(x.why) ? x : null; }, 15000, 'the taken name refused');
    assert.equal(s.card.posted, false);
    assert.equal(s.card.paused, true, 'still waiting');
    assert.equal(s.name || '', '', 'the taken name not kept');
    assert.equal(postsNow(), ++posts, 'sent once, refused');
    await P.evaluate(`(document.getElementById('rcName').value = '', true)`);
  }
  // The name, and Post.
  if (mobile) await press('rcName');
  await P.type(name);
  if (mobile) await press('rcPost'); else await P.key('Enter', 'Enter', 13);
  s = await P.until(async () => { const x = await P.state(); return x.card.posted ? x : null; }, 15000, 'posted');
  assert.match(s.place, /^#1 of 1 · Rig Loop · 65 mm$/, s.place);
  assert.equal(s.me.length, 1, 'the pilot\'s row lit: ' + JSON.stringify(s.rows));
  assert.match(s.me[0], new RegExp('^1 ' + name));
  assert.equal(s.name, name, 'the name kept');
  assert.equal(postsNow(), ++posts);
  const rows = await P.board();
  assert.deepEqual(rows.map((r) => r.name), [name], 'on the Worker\'s board');
  const first = rows[0].timeMs;
  const named = P.pings.filter((p) => p.event === 'name');
  assert.equal(named.length, 1, 'the name ping, once');
  assert.deepEqual(named[0], { event: 'name', class: 65, core: 'bf', input }, 'its fields');
  if (mobile) assert.ok(s.boxes.done && s.boxes.done.h >= 44, 'Fly on is 44 px: ' + JSON.stringify(s.boxes));
  // Fly on: the sim runs again.
  if (mobile) await press('rcDone'); else await P.key('Enter', 'Enter', 13);
  s = await P.until(async () => { const x = await P.state(); return !x.card.up ? x : null; }, 5000, 'the card closed');
  assert.equal(s.card.paused, false);
  const c1 = s.clock;
  await P.until(async () => (await P.state()).clock > c1, 5000, 'the clock runs');
  // The same pilot's next finish, faster: posted, no card.
  const fin2 = await P.flyRig(5);
  assert.equal(fin2.card.up, false, 'no card at the finish');
  assert.match(fin2.toast, /^LINE \d/, 'the finish toast');
  if (mobile) assert.ok(fin2.toastButtons.length && fin2.toastButtons.every((hh) => hh >= 44), 'its buttons are 44 px: ' + JSON.stringify(fin2.toastButtons));
  assert.ok(fin2.toastSplits && fin2.toastSplits.h <= fin2.toastSplits.lh * 1.5 && fin2.toastSplits.right <= fin2.view[0], 'its splits on one line: ' + JSON.stringify(fin2.toastSplits));
  s = await P.until(async () => { const x = await P.state(); return /ONLINE #1 OF 1/.test(x.lap) ? x : null; }, 15000, 'the place on the lap panel');
  assert.equal(s.cards, 1, 'still the one card');
  assert.equal(postsNow(), ++posts, 'the new best posted');
  const rows2 = await P.board();
  assert.equal(rows2.length, 1);
  assert.ok(rows2[0].timeMs < first, 'the faster run is the board\'s: ' + rows2[0].timeMs + ' < ' + first);
  return { first, second: rows2[0].timeMs, flights: [fin.flight, fin2.flight] };
}

test('desktop, keyboard: a fresh visitor finishes the Rig Loop, names, posts (Enter), sees their row; the next finish posts with no card; another visitor\'s Not now holds', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (skipChrome(t)) return;
  const P = await openPage({ mobile: false, w: 1280, h: 720 });
  try {
    const r = await nameAndPost(P, { mobile: false, input: 'keyboard', press: P.click, name: 'FirstLap', taken: 'TakenOne' });
    t.diagnostic('desktop: ' + JSON.stringify(r));
    // Another fresh visitor (a new page load, storage cleared): Not now.
    await P.open('keyboard');
    const before = P.calls.filter((c) => c === 'POST /api/builtin/submit').length;
    await P.flyRig(4);
    let s = await P.until(async () => { const x = await P.state(); return x.card.up ? x : null; }, 10000, 'the result card');
    await P.click('rcLater');
    s = await P.until(async () => { const x = await P.state(); return !x.card.up ? x : null; }, 5000, 'Not now closed it');
    assert.equal(s.later, '1', 'for the tab session');
    assert.equal(s.card.paused, false);
    assert.equal(s.name, null, 'no name');
    assert.match(s.lap, /PB \d/, 'the time kept on this browser: ' + s.lap);
    // The next finish asks nothing.
    const fin = await P.flyRig(5);
    assert.equal(fin.card.up, false);
    await sleep(1500);
    s = await P.state();
    assert.equal(s.cards, 1, 'no card again: ' + JSON.stringify(s.card));
    assert.equal(P.calls.filter((c) => c === 'POST /api/builtin/submit').length, before, 'nothing posted');
  } finally { await P.close(); }
});

test('phone, touch, 812x375: a fresh visitor finishes the Rig Loop, names, taps Post, sees their row, 44 px targets, splits on one line; the next finish posts with no card', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (skipChrome(t)) return;
  const P = await openPage({ mobile: true, w: 812, h: 375 });
  try {
    const r = await nameAndPost(P, { mobile: true, input: 'touch', press: P.tap, name: 'ThumbLap' });
    t.diagnostic('phone: ' + JSON.stringify(r));
  } finally { await P.close(); }
});
