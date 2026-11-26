// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Headless Chrome: the anonymous flight counts a page sends (sim.html
// countNote). The page counts nothing on a local page, so it is served here
// under a name that is not one (sim.quadmath.test, mapped to this machine and
// treated as secure), and every request to the leaderboard Worker is caught
// (CDP Fetch): a ping is recorded and answered 204; nothing reaches the
// Worker, or Cloudflare's analytics.
//   - A normal flight (a fresh profile, the keyboard, the bf core, the 65; no
//     test pilot): ready, then kbd (a real click on the first-run prompt's
//     Fly with keyboard), then arm, then flew30 (30 s armed in the air, held
//     on real W and S keys), each once, each { event, class, core, input }
//     and nothing more; nothing stored for it (no cookie, no storage key).
//     A reload is a new page load: ready again (no prompt, no kbd).
//   - The keyboard chosen while Betaflight's wasm is held: nothing before
//     ready, then ready and kbd.
//   - Armed on the floor at 30% throttle for 33 s of sim time (the bf plant
//     reads that airborne): no flew30, no race-offer air time.
//   - Nothing at all with Global Privacy Control on, Do Not Track on, ?dev=1,
//     on 127.0.0.1, or the owner's ?nocount=1 and the loads after it, booted
//     and armed; ?nocount=0 counts again, its key gone.
// tools/test_sim_count.mjs holds the counter and the Worker in Node.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); skipped under
// SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { LEADERBOARD_URL } from '../sim-retention.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HOST = 'sim.quadmath.test';

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
let cdpSeq = 0;
function cdp(ws, method, params) {
  const id = ++cdpSeq;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 30000);
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
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// The start menu and a fresh profile's first-run prompt pause the sim (as
// tools/test_sim_map_boot.mjs closes them).
const UNPAUSE = `(() => {
  ['startMenu', 'feelPrompt', 'menuLayer', 'firstFlight'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open', 'show'); el.style.display = 'none'; }
  });
  document.body.classList.remove('menu-open');
  if (window._sim.looks && window._sim.looks.setMenuOpen) window._sim.looks.setMenuOpen(false);
  if (window._feel && window._feel.hideFirstRun) window._feel.hideFirstRun();
  return true;
})()`;
const STATE = `JSON.stringify((() => { const c = window._sim.coreState(); return { armed: !!c.armed, air: !!c.airborne, z: c.position.z, vz: c.velocity.z, core: window._sim.core() }; })())`;

test('anonymous flight counts: a normal flight sends ready, kbd, arm, flew30 in order; kbd chosen before ready goes after it; idling on the floor is not flying; the opt-outs, the owner\'s included, send nothing', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const site = `http://${HOST}:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'qm-count-'));
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--window-size=640,360', `--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${site}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
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

    // Every request to the Worker, the rooms Worker or Cloudflare's analytics
    // is caught: a ping recorded and answered 204, anything else failed.
    const pings = [];
    const caught = [];
    let currentPage = 'none';
    // Betaflight's wasm, held while holdWasm is set (the keyboard chosen
    // before ready), let through otherwise.
    let holdWasm = false;
    const heldWasm = [];
    ws.addEventListener('message', (msg) => {
      let o;
      try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
      if (!o || o.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = o.params;
      if (/sim-core\.wasm/.test(request.url)) {
        if (holdWasm) heldWasm.push(requestId);
        else cdp(ws, 'Fetch.continueRequest', { requestId }).catch(() => {});
        return;
      }
      caught.push(request.method + ' ' + request.url);
      if (request.url === LEADERBOARD_URL + '/api/count' && request.method === 'POST') {
        pings.push({ at: Date.now(), body: request.postData, type: o.params.resourceType, page: currentPage });
        cdp(ws, 'Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }] }).catch(() => {});
      } else {
        cdp(ws, 'Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });
    await cdp(ws, 'Fetch.enable', { patterns: [
      { urlPattern: LEADERBOARD_URL + '/*' }, { urlPattern: 'https://sim-rooms.ryan-roths.workers.dev/*' },
      { urlPattern: 'https://static.cloudflareinsights.com/*' }, { urlPattern: 'https://cloudflareinsights.com/*' },
      { urlPattern: '*sim-core.wasm*' },
    ] });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    const key = async (type, k, code, vk) => cdp(ws, 'Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk });
    const hold = async (k, code, vk, ms) => { await key('rawKeyDown', k, code, vk); await key('keyDown', k, code, vk); await sleep(ms); await key('keyUp', k, code, vk); };
    // The sim samples keys once a frame and runs at most 50 ms a frame: on
    // CI's software GPU (about 8 frames a second) a 25-150 ms wall-time tap is
    // seen for no frame or one, so a hover flown on wall time gets a random
    // gain. Held for ms of sim time instead (at most 10 s wall).
    const simMs = async () => evaluate(ws, `window._sim.simClockMs()`);
    const holdSim = async (k, code, vk, ms) => {
      await key('rawKeyDown', k, code, vk); await key('keyDown', k, code, vk);
      const s0 = await simMs(), w0 = Date.now();
      while ((await simMs()) - s0 < ms && Date.now() - w0 < 10000) await sleep(20);
      await key('keyUp', k, code, vk);
    };
    const state = async () => JSON.parse(await evaluate(ws, STATE));
    // Easy mode's arm: the throttle down a second, then W raises it. Held
    // until armed (or 2 s); else S to the bottom and again.
    const arm = async () => {
      for (let tries = 0; tries < 4; tries++) {
        await sleep(1500);
        await key('rawKeyDown', ...W);
        await key('keyDown', ...W);
        // Held until armed, up to 2 s of sim time (at most 15 s wall).
        const s0 = await simMs(), w0 = Date.now();
        let st = await state();
        while (!st.armed && (await simMs()) - s0 < 2000 && Date.now() - w0 < 15000) { await sleep(50); st = await state(); }
        await key('keyUp', ...W);
        if (st.armed) return true;
        await holdSim(...S, 1200);
      }
      return false;
    };
    const W = ['w', 'KeyW', 87], S = ['s', 'KeyS', 83];
    // Load url as page `label` (an opt-out set up by script, or none) and
    // wait for it to boot with Betaflight flying. keepPrompt: leave the
    // first-run prompt up (the keyboard choice is clicked on it).
    const open = async (label, url, script, opts = {}) => {
      currentPage = label;
      let scriptId = null;
      if (script) scriptId = (await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: script })).identifier;
      await cdp(ws, 'Page.navigate', { url });
      let ok = false;
      const t0 = Date.now();
      while (!ok && Date.now() - t0 < 120000) {
        await sleep(250);
        try { ok = await evaluate(ws, `!!(window._sim && window._simQueryBooted && window._sim.core() === 'bf')`); } catch (e) { /* navigating */ }
      }
      assert.ok(ok, label + ': booted on the bf core');
      if (scriptId) await cdp(ws, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
      if (!opts.keepPrompt) await evaluate(ws, UNPAUSE);
    };
    const events = (label) => pings.filter((p) => p.page === label).map((p) => JSON.parse(p.body).event);
    const waitFor = async (label, event, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms && !events(label).includes(event)) await sleep(100);
      return events(label).includes(event);
    };
    // A real click on the first-run prompt's Fly with keyboard.
    const clickKeys = async () => {
      const r = JSON.parse(await evaluate(ws, `JSON.stringify((() => { const b = document.getElementById('feelKeys'); if (!b) return null; const x = b.getBoundingClientRect(); return x.width ? { x: x.left + x.width / 2, y: x.top + x.height / 2 } : null; })())`));
      assert.ok(r, 'Fly with keyboard on screen');
      await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(40);
      await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    };
    // Space toggles the arm: one keydown (rawKeyDown and keyDown would be two).
    const space = async () => { await key('rawKeyDown', ' ', 'Space', 32); await sleep(50); await key('keyUp', ' ', 'Space', 32); };

    // A normal flight: a first visit, the keyboard chosen on the first-run
    // prompt (after ready), the 65 on Betaflight, the Rig.
    await open('flight', `${site}/sim.html?quality=low&map=rig`, null, { keepPrompt: true });
    assert.ok(await waitFor('flight', 'ready', 15000), 'ready: ' + JSON.stringify(caught.slice(-5)));
    assert.deepEqual(events('flight'), ['ready'], 'nothing else before the keyboard choice');
    await clickKeys();
    assert.ok(await waitFor('flight', 'kbd', 5000), 'kbd on Fly with keyboard');
    await evaluate(ws, UNPAUSE);
    // Hold a hover at 1.2 m on W and S: W from the bottom arms it (Easy mode),
    // then taps as far off the height (and its rate) as it is.
    const t0 = Date.now();
    let st = null, taps = 0;
    while (Date.now() - t0 < 240000 && !events('flight').includes('flew30')) {
      st = await state();
      if (!st.armed) { assert.ok(await arm(), 'W arms it'); continue; }
      const u = (1.2 - st.z) * 1.0 - st.vz * 0.6;
      if (u > 0.12) { await holdSim(...W, Math.min(150, Math.max(25, u * 90))); taps++; }
      else if (u < -0.12) { await holdSim(...S, Math.min(150, Math.max(25, -u * 90))); taps++; }
      else await sleep(60);
    }
    const fps = await evaluate(ws, `Math.round((window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.avg) || 0)`).catch(() => 0);
    t.diagnostic(`flew30 after ${((Date.now() - t0) / 1000).toFixed(1)} s wall, ${taps} taps, ${fps} fps; last ${JSON.stringify(st)}`);
    assert.ok(events('flight').includes('flew30'), 'flew30 after 30 s in the air: ' + JSON.stringify(st));
    await sleep(2000);
    const flight = pings.filter((p) => p.page === 'flight');
    assert.deepEqual(flight.map((p) => JSON.parse(p.body).event), ['ready', 'kbd', 'arm', 'flew30'], 'in order, each once');
    for (const p of flight) assert.deepEqual(Object.keys(JSON.parse(p.body)), ['event', 'class', 'core', 'input'], 'nothing else: ' + p.body);
    assert.deepEqual(JSON.parse(flight[0].body), { event: 'ready', class: 65, core: 'bf', input: 'keyboard' });
    assert.deepEqual(JSON.parse(flight[1].body), { event: 'kbd', class: 65, core: 'bf', input: 'keyboard' });
    assert.equal(flight[2].type, 'Ping', 'sent as a beacon');
    // Nothing stored for it.
    const stored = JSON.parse(await evaluate(ws, `JSON.stringify({ cookie: document.cookie, local: Object.keys(localStorage), session: Object.keys(sessionStorage) })`));
    assert.equal(stored.cookie, '', 'no cookie');
    for (const k of stored.local.concat(stored.session)) assert.ok(!/count|ping|visit|funnel/i.test(k), 'no storage key for it: ' + k);
    // A reload is a new page load: ready again, nothing carried over; the
    // keyboard is chosen already, so no prompt and no kbd.
    await open('reload', `${site}/sim.html?quality=low&map=rig`);
    assert.ok(await waitFor('reload', 'ready', 15000));
    await sleep(1500);
    assert.deepEqual(events('reload'), ['ready']);

    // The keyboard chosen while Betaflight still loads (its wasm held): kbd
    // waits for ready and goes just after it. A first visit again: no input
    // chosen in this browser.
    currentPage = 'early';
    holdWasm = true;
    const fresh = (await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.removeItem('quadmathSimInputChoice'); } catch (e) {}" })).identifier;
    await cdp(ws, 'Page.navigate', { url: `${site}/sim.html?quality=low&map=rig` });
    let up = false;
    for (let i = 0; i < 240 && !up; i++) {
      await sleep(250);
      try { up = await evaluate(ws, `!!(window._sim && window._simQueryBooted && document.getElementById('feelKeys'))`); } catch (e) { /* navigating */ }
    }
    await cdp(ws, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: fresh });
    assert.ok(up, 'early: the first-run prompt is up');
    // The prompt can be up before the bf core asks for its wasm (a slow boot
    // on CI's software GL), so wait for the request, not just the prompt.
    for (let i = 0; i < 80 && heldWasm.length === 0; i++) await sleep(250);
    assert.ok(heldWasm.length > 0, 'early: Betaflight\'s wasm held');
    assert.notEqual(await evaluate(ws, `window._sim.core()`), 'bf', 'early: Betaflight not flying yet');
    await clickKeys();
    await sleep(1000);
    assert.deepEqual(events('early'), [], 'nothing before ready, kbd included');
    holdWasm = false;
    for (const id of heldWasm.splice(0)) cdp(ws, 'Fetch.continueRequest', { requestId: id }).catch(() => {});
    assert.ok(await waitFor('early', 'kbd', 60000), 'kbd once ready: ' + JSON.stringify(events('early')));
    await sleep(1000);
    assert.deepEqual(events('early'), ['ready', 'kbd'], 'kbd just after ready');

    // Armed on the floor at 30% throttle, still: the bf plant reads airborne,
    // but 33 s of it count as no flying (flew30, the race offer's 30 s).
    await open('floor', `${site}/sim.html?quality=low&map=rig`);
    assert.ok(await waitFor('floor', 'ready', 15000));
    await evaluate(ws, `window._sim.setTestStick({ r: 0, p: 0, y: 0, t: 0 }), true`);
    await space();
    let armedUp = false;
    for (let i = 0; i < 40 && !armedUp; i++) { await sleep(100); armedUp = await evaluate(ws, `window._sim.coreState().armed`); }
    assert.ok(armedUp, 'floor: armed on the pad');
    const armMs = await evaluate(ws, `window._sim.simClockMs()`);
    // Frame times (wall ms) against the sim clock, the last 40, so a lift can
    // be read against the frames around it: a long frame, or steady ones.
    await evaluate(ws, `(() => { const f = window.__floorFrames = { last: performance.now(), ring: [] }; const tick = (now) => { f.ring.push([Math.round(window._sim.simClockMs()), Math.round(now - f.last)]); f.last = now; if (f.ring.length > 40) f.ring.shift(); if (!f.stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`);
    await evaluate(ws, `window._sim.setTestStick({ r: 0, p: 0, y: 0, t: 0.3 }), true`);
    const f0 = await evaluate(ws, `window._sim.simClockMs()`);
    let sawAir = false, lifted = 0, last = null, liftAt = null;
    while ((await evaluate(ws, `window._sim.simClockMs()`)) - f0 < 33000) {
      last = JSON.parse(await evaluate(ws, `JSON.stringify((() => { const c = window._sim.coreState(); return { ms: window._sim.simClockMs(), air: !!c.airborne, clr: c.clearance, vz: c.velocity && c.velocity.z, twr: c.twr, armed: !!c.armed, airMs: window._sim.raceOffer().airMs }; })())`));
      sawAir = sawAir || last.air;
      if (last.clr > lifted) {
        lifted = last.clr;
        if (lifted > 0.04 && !liftAt) liftAt = { ...last, ms: last.ms - f0, frames: await evaluate(ws, `JSON.stringify(window.__floorFrames.ring.map(([ms, d]) => [ms - ${f0}, d]))`) };
      }
      await sleep(250);
    }
    await evaluate(ws, `window._sim.setTestStick({ r: 0, p: 0, y: 0, t: 0 }), true`);
    await evaluate(ws, `(window.__floorFrames.stop = true)`);
    t.diagnostic('floor: ' + JSON.stringify({ sawAir, lifted, armToThrottleMs: Math.round(f0 - armMs), liftAt, last }));
    assert.ok(last.armed, 'floor: armed throughout');
    assert.ok(lifted <= 0.04, 'floor: never off the floor: ' + lifted);
    assert.equal(last.airMs, 0, 'floor: no race-offer air time');
    assert.deepEqual(events('floor'), ['ready', 'arm'], 'floor: no flew30');
    await evaluate(ws, `window._sim.setTestStick(null), true`);
    await space();

    // The opt-outs: booted, armed and flown a moment, and not one ping.
    const optOuts = [
      ['gpc', `${site}/sim.html?quality=low&map=rig`, "Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });"],
      ['dnt', `${site}/sim.html?quality=low&map=rig`, "Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1', configurable: true });"],
      ['dev', `${site}/sim.html?quality=low&map=rig&dev=1`, null],
      ['local', `http://127.0.0.1:${port}/sim.html?quality=low&map=rig`, null],
      // The owner: ?nocount=1 once, then plain loads: nothing from either.
      ['owner', `${site}/sim.html?quality=low&map=rig&nocount=1`, null],
      ['owner, later', `${site}/sim.html?quality=low&map=rig`, null],
    ];
    for (const [label, url, script] of optOuts) {
      await open(label, url, script);
      assert.ok(await arm(), label + ': armed');
      await hold(...W, 300);
      await sleep(2500);
      await hold(...S, 800);
      await sleep(1000);
      assert.deepEqual(events(label), [], label + ': nothing sent');
    }
    assert.equal(await evaluate(ws, `localStorage.getItem('quadmathNoCount')`), '1', 'the owner\'s key, kept');
    // ?nocount=0: the key out, counted again.
    await open('owner, undone', `${site}/sim.html?quality=low&map=rig&nocount=0`);
    assert.ok(await waitFor('owner, undone', 'ready', 15000), '?nocount=0: counted again');
    assert.equal(await evaluate(ws, `localStorage.getItem('quadmathNoCount')`), null, 'the key gone');
    await sleep(1000);
    assert.equal(pings.length, 10, 'ten pings in all: ' + JSON.stringify(pings.map((p) => p.page + ':' + JSON.parse(p.body).event)));
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    killTree(child);
    await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
    await new Promise((res) => server.close(res));
    for (let i = 0; i < 10; i++) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
    }
  }
});
