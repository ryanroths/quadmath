// Headless Chrome, the page in a ghost room against `wrangler dev`, with a
// scripted pilot in Node (the page's own client, sim-ghost-rooms.js):
//   - same map: the page, on Trainer, joins a room the Node pilot made on
//     the Rig: it flies the Rig, on rig-freestyle
//   - late join: the Node pilot holds still before the page joins; its
//     ghost shows at that pose at once
//   - the page sends its pose at 20 Hz, where its quad is
//   - the Node pilot's ghost: visible, its name tag, between its poses, and
//     its motor voice (shaft rate rpm / 60) at remoteLevel(distance)
//   - no collision: the ghost flies through the page's quad, standing on
//     the pad, and sim-core's state does not move
//   - leaving the room's map leaves the room; Create makes one on the
//     page's map and the Node pilot joins it there
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs) and wrangler
// (tools/sim_rooms_dev.mjs); skipped under SKIP_CHROME_BOOT=1 or without
// wrangler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openRoom, createRoom, POSE_HZ } from '../sim-ghost-rooms.js';
import { remoteLevel } from '../sim-audio.js';
import { findWrangler, startRoomsDev, sleep } from './sim_rooms_dev.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WS = 3.5;   // world units per metre (sim-core-adapter.js CORE_WS)

function resolveChrome() {
  const names = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'chrome'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}

function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
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
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 60000);
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
const page = async (ws, js) => JSON.parse(await evaluate(ws, `(async () => { const s = window._sim; ${js} })()`));

// A real key through CDP: trusted, so it is a user activation (audio unlocks).
async function press(ws, key, code, vk) {
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key });
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
}

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killChrome(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// The page's quad in the render frame (sim-core is Z up: x fwd, y left).
const QUAD = `const c = s.coreState().position; const quad = [-c.y * 3.5, c.z * 3.5, -c.x * 3.5];`;

// The Node pilot's 20 Hz sender, on a due-time schedule.
function sender(room, poseAt) {
  let i = 0, due = performance.now();
  const sent = [];
  const timer = setInterval(() => {
    const now = performance.now();
    if (now - due > 100) due = now;
    while (now >= due) {
      const p = poseAt(i++, now);
      room.sendPose(p);
      sent.push({ at: now, pose: p });
      due += 1000 / POSE_HZ;
    }
  }, 5);
  return { sent, stop: () => clearInterval(timer) };
}

test('ghost room in the page: same map, late join, ghost and voice, no collision, leave', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const bin = findWrangler();
  if (!bin) { t.skip('no wrangler (npm install in workers/sim-rooms, or WRANGLER=)'); return; }
  const { server, port } = await serveRoot();
  const origin = 'http://127.0.0.1:' + port;
  const dev = await startRoomsDev(bin, { ALLOWED_ORIGIN: origin });
  const profile = mkdtempSync(join(tmpdir(), 'qm-roompage-'));
  const debugPort = 9300 + (process.pid % 300);
  const url = `${origin}/sim.html?quality=low&dev=1&rooms=${encodeURIComponent(dev.base)}`;
  const child = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update', '--disable-background-networking', '--disable-sync',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=640,360',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  const rooms = [];
  try {
    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
      await sleep(200);
      try {
        const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        target = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url).includes('/sim.html'));
      } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(target, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    await cdp(ws, 'Runtime.enable');
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) {
      await sleep(250);
      ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._sim.tracks().length > 0)`);
    }
    assert.ok(ready, 'the bf core flies');
    await evaluate(ws, `(function(){
      ['feelPrompt','toast','panel'].forEach(function(id){
        var el=document.getElementById(id); if(!el)return;
        el.classList.remove('open','show'); el.style.display='none';
      });
      if(window._feel&&window._feel.hideFirstRun) window._feel.hideFirstRun();
      return true;
    })()`);
    await cdp(ws, 'Page.bringToFront');
    {
      // Fly, the Rig from its map chooser (leaves the launch screen), then
      // Trainer freestyle; a key unlocks audio.
      await evaluate(ws, `document.getElementById('menuFly').click(), document.querySelector('#menuLayer [data-fly-map="rig"]').click(), true`);
      await press(ws, '1', 'Digit1', 49);
      const r = await page(ws, `await s.setMap('trainer','trainer-freestyle'); s.placeQuadAt(0, 0.15, 0, 0);
        await new Promise((r) => setTimeout(r, 800));
        return JSON.stringify({ map: s.map(), track: s.track(), audio: s.audio.debug().state });`);
      assert.deepEqual([r.map, r.track], ['trainer', 'trainer-freestyle']);
      assert.equal(r.audio, 'running', 'audio unlocked by the key');
    }

    // ---- the Node pilot makes a room on the Rig, flies, then holds still
    const made = await createRoom(dev.base, 'rig');
    const hostEvents = [];
    const host = await openRoom({ base: dev.base, code: made.code, name: 'Host', WebSocket, onEvent: (e) => hostEvents.push(e) });
    rooms.push(host);
    const hold = { t: 1234, pos: [0.5, 1.2, -0.75], quat: [0, Math.sin(0.3), 0, Math.cos(0.3)], rpm: [30000, 30000, 30000, 30000] };
    for (let i = 0; i < 5; i++) { host.sendPose({ ...hold, t: hold.t - 50 * (5 - i) }); await sleep(50); }
    host.sendPose(hold);
    await sleep(400);

    // ---- the page joins by code: the Rig, rig-freestyle, the held pose at once
    let r = await page(ws, `const room = await s.roomJoinCode(${JSON.stringify(made.code.toLowerCase())});
      await new Promise((r) => setTimeout(r, 300));
      const g = s.roomGhosts.get(0);
      return JSON.stringify({ ok: !!room, map: s.map(), track: s.track(), slot: room && room.slot,
        n: room && room.pilots.get(0).track.samples.length,
        visible: !!(g && g.mesh.visible), pos: g && g.mesh.position.toArray(), name: g && g.name,
        label: !!(g && g.label.visible && g.label.material.map),
        osd: document.getElementById('osdTR').textContent, menu: document.body.classList.contains('menu-open') });`);
    console.log('join: ' + JSON.stringify(r));
    assert.ok(r.ok, 'joined');
    assert.deepEqual([r.map, r.track], ['rig', 'rig-freestyle'], 'joining puts the page on the host\'s map and track');
    assert.equal(r.slot, 1);
    assert.equal(r.n, 1, 'late join: the held pose, with nobody sending');
    assert.ok(r.visible && r.label && r.name === 'Host', 'the ghost and its name tag');
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(r.pos[k] - hold.pos[k]) < 0.01, 'at the held pose');
    assert.match(r.osd, new RegExp('ROOM ' + made.code + ' · 2/4'));
    assert.equal(r.menu, false, 'flying');
    await sleep(500);
    assert.ok(hostEvents.some((e) => e.type === 'join' && e.slot === 1), 'the host hears the page join');

    // ---- the page sends its pose at 20 Hz, where its quad is. The pose
    // changes once a frame, so a page drawing fewer than 20 fps (SwiftShader
    // here, no GPU) sends once a frame: the rate is checked against
    // min(20, fps). The 20 Hz schedule itself: test_sim_rooms_wrangler.mjs.
    const tr = host.pilots.get(1).track;
    let fromPage = 0;
    const prev = host.ws.onmessage;
    host.ws.onmessage = (ev) => { prev(ev); if (typeof ev.data !== 'string' && new DataView(ev.data).getUint8(0) === 1) fromPage++; };
    const n0 = fromPage, at0 = performance.now();
    const frames = `return JSON.stringify(window.__frames || ((function f() { window.__frames = (window.__frames || 0) + 1; requestAnimationFrame(f); })(), 0));`;
    const f0 = await page(ws, frames);
    await sleep(3000);
    const f1 = await page(ws, frames);
    const secs = (performance.now() - at0) / 1000;
    const rate = (fromPage - n0) / secs;
    const fps = (f1 - f0) / secs;
    r = await page(ws, `${QUAD} return JSON.stringify({ quad });`);
    const last = tr.samples[tr.samples.length - 1];
    console.log('page poses: ' + rate.toFixed(1) + ' Hz at ' + fps.toFixed(1) + ' fps, last ' + JSON.stringify(last.pos) + ' quad ' + JSON.stringify(r.quad));
    assert.ok(rate > 0.85 * Math.min(POSE_HZ, fps) && rate < 1.1 * POSE_HZ, rate.toFixed(1) + ' Hz at ' + fps.toFixed(1) + ' fps');
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(last.pos[k] - r.quad[k]) < 0.02, 'the page quad\'s position');
    const quad = r.quad;

    // ---- the ghost flies through the page's quad (disarmed, on the pad)
    const before = await page(ws, `const c = s.coreState(); return JSON.stringify({ p: [c.position.x, c.position.y, c.position.z], v: [c.velocity.x, c.velocity.y, c.velocity.z], armed: c.armed });`);
    assert.equal(before.armed, false);
    const speed = 1.5 * WS;   // 1.5 m/s
    const fly = sender(host, (i, now) => {
      const x = quad[0] - 2 * WS + speed * i / POSE_HZ;   // from 2 m before the quad to past it
      return { t: Math.round(now), pos: [x, quad[1], quad[2]], quat: [0, 0, 0, 1], rpm: [30000, 30000, 30000, 30000] };
    });
    const looks = [];
    for (let i = 0; i < 12; i++) {
      await sleep(250);
      looks.push(await page(ws, `${QUAD} const g = s.roomGhosts.get(0); const a = s.audio.debug().remotes.find((x) => x.id === 0);
        return JSON.stringify({ at: performance.now(), g: g.mesh.position.toArray(), visible: g.mesh.visible, quad, a });`));
    }
    fly.stop();
    const after = await page(ws, `const c = s.coreState(); return JSON.stringify({ p: [c.position.x, c.position.y, c.position.z], v: [c.velocity.x, c.velocity.y, c.velocity.z] });`);
    console.log('fly-through: ghost x ' + looks.map((l) => (l.g[0] - quad[0]).toFixed(2)).join(' ') + '; audio ' + JSON.stringify(looks[6].a));
    for (const l of looks) assert.ok(l.visible, 'the ghost is drawn');
    for (let i = 1; i < looks.length; i++) assert.ok(looks[i].g[0] > looks[i - 1].g[0], 'it moves on, between poses');
    assert.ok(looks[0].g[0] < quad[0] && looks[looks.length - 1].g[0] > quad[0], 'through the quad');
    // Drawn about INTERP_DELAY_MS behind the newest pose sent by then.
    for (const l of looks) {
      const lagWu = (fly.sent[fly.sent.length - 1].pose.pos[0] - l.g[0]);
      assert.ok(lagWu > -0.05, 'never ahead of what was sent');
    }
    for (const l of looks) {
      const d = Math.hypot(l.g[0] - l.quad[0], l.g[1] - l.quad[1], l.g[2] - l.quad[2]) / WS;
      assert.ok(Math.abs(l.a.target - remoteLevel(d)) < 0.02, 'voice level ' + l.a.target.toFixed(3) + ' at ' + d.toFixed(2) + ' m');
      for (const hz of l.a.motorHz) assert.ok(Math.abs(hz - 500) < 5, 'shaft rate 30000 rpm / 60: ' + hz);
      assert.ok(l.a.flightGain.every((v) => v > 0), 'the flight voice');
    }
    // A resting quad's state moves by float noise (1e-15 m); a hit by a
    // 1.5 m/s quad would move it by centimetres.
    const moved = Math.max(...after.p.map((v, k) => Math.abs(v - before.p[k])));
    const dv = Math.max(...after.v.map((v, k) => Math.abs(v - before.v[k])));
    assert.ok(moved < 1e-6, 'no collision: sim-core\'s position moved ' + moved + ' m');
    assert.ok(dv < 1e-6, 'nor its velocity: ' + dv + ' m/s');

    // ---- the pilot leaves the room's map: the room is left
    r = await page(ws, `await s.setMap('trainer','trainer-freestyle');
      await new Promise((r) => setTimeout(r, 400));
      return JSON.stringify({ room: !!s.ghostRoom(), ghosts: s.roomGhosts.size, remotes: s.audio.debug().remotes.length });`);
    assert.deepEqual(r, { room: false, ghosts: 0, remotes: 0 });
    await sleep(300);
    assert.ok(hostEvents.some((e) => e.type === 'leave' && e.slot === 1), 'the host hears the page leave');

    // ---- Create on the page's map; the Node pilot joins it there
    r = await page(ws, `const room = await s.roomCreate(); return JSON.stringify({ code: room && room.code, map: room && room.map, slot: room && room.slot, here: s.map() });`);
    assert.ok(r.code, 'created');
    assert.deepEqual([r.map, r.here, r.slot], ['trainer', 'trainer', 0]);
    const guest = await openRoom({ base: dev.base, code: r.code, name: 'Guest', WebSocket });
    rooms.push(guest);
    assert.deepEqual([guest.map, guest.track, guest.slot], ['trainer', 'trainer-freestyle', 1]);
    const g0 = await page(ws, frames);
    await sleep(2000);
    const g1 = await page(ws, frames);
    const sent = await page(ws, `const g = s.ghostRoom(); return JSON.stringify({ open: g && g.open, up: g && g.bytes.up, ready: g && g.ws.readyState, map: s.map(), track: s.track() });`);
    sent.fps = (g1 - g0) / 2;
    console.log('guest: ' + JSON.stringify({ n: guest.pilots.get(0) && guest.pilots.get(0).track.samples.length, down: guest.bytes.down, page: sent }));
    assert.ok(guest.pilots.get(0).track.samples.length >= 8, 'the page\'s poses reach the guest');
    r = await page(ws, `await new Promise((r) => setTimeout(r, 200)); const card = (s.openRoomCard(), document.querySelector('#menuLayer .room-card').textContent);
      s.leaveGhostRoom(); return JSON.stringify({ card, room: !!s.ghostRoom() });`);
    assert.ok(r.card.includes('Guest'), 'the card lists the guest');
    assert.equal(r.room, false);
  } finally {
    for (const room of rooms) room.close();
    if (ws) try { ws.close(); } catch (e) { /* ignore */ }
    killChrome(child);
    server.close();
    await dev.stop();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});
