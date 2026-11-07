// Headless Chrome as a phone (touch, DPR 3, a phone UA): the launch screen and
// Fly's map chooser at 390x844 (portrait) and 844x390 (landscape). The five
// launch buttons are on screen and on top where a thumb lands; Fly opens the
// chooser, whose four cards (The Rig, The House, The Warehouse, The Bando) and
// thumbnails (loaded) are on screen and on top; a tap on The House's
// thumbnail flies The House.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

// In the page: each element of a selector, whether it lies wholly in the
// viewport and whether it (or its own child) is what a tap hits at its centre
// and 3 px in from each corner: nothing (the footer, another panel) covers
// any part of it.
const PROBE = String.raw`window.__probe = function (sel, pick) {
  const W = innerWidth, H = innerHeight;
  return Array.prototype.filter.call(document.querySelectorAll(sel), function (el) {
    const cs = getComputedStyle(el);
    return el.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }).map(function (el) {
    const target = pick ? el.querySelector(pick) || el : el;
    const r = target.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pts = [[cx, cy], [r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
    const covered = pts.filter(function (p) {
      const hit = document.elementFromPoint(p[0], p[1]);
      return !hit || !(hit === target || el.contains(hit));
    }).map(function (p) {
      const hit = document.elementFromPoint(p[0], p[1]);
      return Math.round(p[0]) + ',' + Math.round(p[1]) + ':' + (hit ? (hit.id || hit.tagName) : 'none');
    });
    return {
      label: (el.dataset.flyMap || el.textContent.trim()).slice(0, 20),
      x: Math.round(cx), y: Math.round(cy), w: Math.round(r.width), h: Math.round(r.height),
      inView: r.left >= 0 && r.top >= 0 && r.right <= W + 0.5 && r.bottom <= H + 0.5,
      onTop: covered.length === 0, covered: covered,
      loaded: target.tagName === 'IMG' ? target.complete && target.naturalWidth > 0 : null,
    };
  });
};
true`;

for (const size of [{ name: 'portrait 390x844', width: 390, height: 844 }, { name: 'landscape 844x390', width: 844, height: 390 }]) {
  test(`phone ${size.name}: the launch screen's five buttons and Fly's map chooser are on screen and tappable, thumbnails shown; a tap flies The House`, { timeout: 3 * 60 * 1000 }, async (t) => {
    if (process.env.SKIP_CHROME_BOOT === '1') {
      t.skip('SKIP_CHROME_BOOT');
      return;
    }
    const { server, port } = await serveRoot();
    const profile = mkdtempSync(join(tmpdir(), 'qm-phone-'));
    const debugPort = 9200 + (process.pid % 300) + size.width % 7;
    const child = spawn(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', `--window-size=${size.width},${size.height}`,
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
      await cdp(ws, 'Runtime.enable');
      await cdp(ws, 'Page.enable');
      await cdp(ws, 'Emulation.setDeviceMetricsOverride', {
        width: size.width, height: size.height, deviceScaleFactor: 3, mobile: true,
        screenWidth: size.width, screenHeight: size.height,
        screenOrientation: size.width < size.height ? { type: 'portraitPrimary', angle: 0 } : { type: 'landscapePrimary', angle: 90 },
      });
      await cdp(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp(ws, 'Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
      await cdp(ws, 'Emulation.setUserAgentOverride', { userAgent: PHONE_UA, platform: 'Android' });
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/sim.html?quality=low` });
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) {
        await sleep(250);
        try {
          ready = await evaluate(ws, `!!(window._sim && window._sim.map && window._sim.map() && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._simQueryBooted)`);
        } catch (e) { /* the page is still loading */ }
      }
      assert.ok(ready, 'the page boots');
      await sleep(600);
      await evaluate(ws, PROBE);
      // A tap: a touch down and up (Input.synthesizeTapGesture fires no click
      // in headless Chrome; these do, as a finger does).
      const tap = async (x, y) => {
        await cdp(ws, 'Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await sleep(60);
        await cdp(ws, 'Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };

      // The launch screen: no first-run prompt over it (a phone gets touch).
      const launch = await evaluate(ws, `JSON.stringify({ mobile: document.body.classList.contains('touch-on') || !!(window._feel && window._feel.loadInputChoice && window._feel.loadInputChoice() === 'touch'),
        prompt: !!(window._feel && window._feel.promptOpen), buttons: __probe('#startMenu .menu-card button') })`);
      const L = JSON.parse(launch);
      console.log(size.name + ' launch: ' + JSON.stringify(L));
      assert.equal(L.prompt, false, 'no first-run prompt over the launch screen on a phone');
      assert.deepEqual(L.buttons.map((b) => b.label), ['Fly', 'Daily', 'Boards', 'Tune', 'Controls']);
      for (const b of L.buttons) {
        assert.ok(b.inView, `${b.label} is wholly on screen (${JSON.stringify(b)})`);
        assert.ok(b.onTop, `${b.label} is what a tap at its centre hits (${JSON.stringify(b)})`);
        assert.ok(b.h >= 44, `${b.label} is at least 44 px tall, a thumb's target (${b.h}px)`);
      }

      // Fly: the chooser.
      const fly = L.buttons.find((b) => b.label === 'Fly');
      await tap(fly.x, fly.y);
      let C = null;
      for (let i = 0; i < 20; i++) {
        await sleep(200);
        C = JSON.parse(await evaluate(ws, `JSON.stringify({ shown: document.getElementById('menuLayer').classList.contains('show'),
          cards: __probe('#menuLayer [data-fly-map]'), thumbs: __probe('#menuLayer [data-fly-map]', 'img'), close: __probe('#layerClose') })`));
        if (C.shown && C.thumbs.length && C.thumbs.every((th) => th.loaded)) break;
      }
      console.log(size.name + ' chooser: ' + JSON.stringify(C));
      assert.ok(C.shown, 'a tap on Fly opens the chooser');
      assert.deepEqual(C.cards.map((c) => c.label), ['rig', 'house', 'depot', 'bando']);
      for (const th of C.thumbs) {
        assert.ok(th.loaded, `${th.label} thumbnail loaded`);
        assert.ok(th.inView, `${th.label} thumbnail wholly on screen (${JSON.stringify(th)})`);
        assert.ok(th.onTop, `${th.label} thumbnail is what a tap hits (${JSON.stringify(th)})`);
        assert.ok(th.w >= 120 && th.h >= 60, `${th.label} thumbnail big enough to see (${th.w}x${th.h})`);
      }
      for (const c of C.cards) {
        assert.ok(c.inView, `${c.label} card wholly on screen (${JSON.stringify(c)})`);
        assert.ok(c.h >= 44, `${c.label} card at least 44 px tall (${c.h}px)`);
      }
      assert.ok(C.close.length === 1 && C.close[0].inView && C.close[0].onTop, `Close is on screen and on top (${JSON.stringify(C.close)})`);
      assert.ok(C.close[0].h >= 44, `Close is at least 44 px tall (${C.close[0].h}px)`);

      // A tap on The House's thumbnail flies The House.
      const house = C.thumbs.find((th) => th.label === 'house');
      await tap(house.x, house.y);
      let flown = null;
      for (let i = 0; i < 30; i++) {
        await sleep(200);
        flown = JSON.parse(await evaluate(ws, `JSON.stringify({ map: window._sim.map(), menuOpen: !!window._sim.looks.menuOpen })`));
        if (flown.map === 'house' && !flown.menuOpen) break;
      }
      console.log(size.name + ' flown: ' + JSON.stringify(flown));
      assert.equal(flown.map, 'house', 'the tap flies The House');
      assert.equal(flown.menuOpen, false, 'and the menu is closed');
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
}
