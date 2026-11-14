// Input is read when frames are slow: a frame whose own work takes longer than
// the old 100 ms horizon no longer throws away every input poll after it.
//   - In node: the input clock's default horizon is the core's longest frame
//     step (tools/test_sim_core.mjs has the stamps).
//   - In headless Chrome, the bf core's advance() made to take 150 ms of the
//     main thread every frame (as a device too slow for the sim's work does,
//     or the bf core's first frames as it takes over):
//       the keyboard: W held, the page's throttle rises;
//       a TX16S: raised from the bottom, the page's throttle follows it.
//     With the 100 ms horizon (the page before this test), every poll came
//     more than 150 ms after its frame began and was dropped: the throttle
//     stayed at zero.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { InputClock } from '../sim-core-adapter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const BUSY_MS = 150;             // each frame's own work: past the old 100 ms horizon

test('the input clock keeps a poll for the next frame up to its longest step', () => {
  assert.equal(new InputClock().horizonUs, 250_000);
});

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

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// Every profile this test makes goes when it ends, pass or fail: after each
// pass, and again on the way out for one a crash left behind.
const profiles = new Map();      // profile dir -> its Chrome
function dropProfile(dir) {
  const child = profiles.get(dir);
  if (child) killTree(child);
  for (let i = 0; i < 20; i++) {
    try { rmSync(dir, { recursive: true, force: true }); break; } catch (e) { spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},250)']); }
  }
  profiles.delete(dir);
}
process.on('exit', () => { for (const dir of [...profiles.keys()]) dropProfile(dir); });

// Before the page's scripts: a virtual pad (window.__pads), off unless seeded.
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, id: '', axes: [] };
  const make = () => ({ id: pads.id, index: 0, mapping: '', connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on ? make() : null, null, null, null];
    },
  });
})()`;

const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(20); }
    return !!fn();
  };
  const thr = () => window._axis().stick.t;
  const open = () => ({ prompt: !!(window._feel && window._feel.promptOpen), menu: !!(s.looks && s.looks.menuOpen) });
  // The bf core's advance() made to hold the main thread for ms each frame.
  const busy = (ms) => {
    const b = s.bfCore();
    if (!b || b.__busy) return false;
    const advance = b.advance;
    b.advance = function (...args) {
      const t0 = performance.now();
      const n = advance.apply(this, args);
      while (performance.now() - t0 < ms) { /* the frame's own work */ }
      return n;
    };
    b.__busy = ms;
    return true;
  };
  // Frame intervals over ms of wall time.
  const frames = (ms) => new Promise((res) => {
    const out = []; let last = null; const t0 = performance.now();
    const f = (now) => { if (last !== null) out.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else { out.sort((a, b) => a - b); res(out.length ? Math.round(out[out.length >> 1]) : null); } };
    requestAnimationFrame(f);
  });
  window.__lf = { s, wait, until, thr, open, busy, frames };
  return true;
})()`;

test('input in Chrome with frames whose own work takes 150 ms', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;

  async function pass(seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-longframes-'));
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=480,270',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    profiles.set(profile, child);
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let ws = null;
    try {
      let debugPort = null;
      for (let i = 0; i < 100 && !debugPort; i++) {
        await sleep(200);
        try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0] || null; } catch (e) { /* not yet */ }
      }
      assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-300));
      let page = null;
      for (let i = 0; i < 100 && !page; i++) {
        await sleep(200);
        try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* not yet */ }
      }
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      let seq = 0;
      const waiting = new Map();
      ws.addEventListener('message', (m) => { const o = JSON.parse(m.data); if (o.id && waiting.has(o.id)) { waiting.get(o.id)(o); waiting.delete(o.id); } });
      const send = (method, params) => new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error('cdp timeout ' + method)); }, 60000);
        waiting.set(id, (o) => { clearTimeout(timer); if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {}); });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
      const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text).slice(0, 400));
        return r.result ? r.result.value : undefined;
      };
      await send('Runtime.enable');
      await send('Page.enable');
      await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      await send('Page.navigate', { url: `${origin}/robots.txt` });
      for (let i = 0; i < 50; i++) { await sleep(100); try { if (await evaluate(`location.origin === ${JSON.stringify(origin)}`)) break; } catch (e) { /* loading */ } }
      await evaluate(`(() => {
        localStorage.clear();
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pad || { on: false, id: '', axes: [] })}));
        return true;
      })()`);
      await send('Page.navigate', { url: `${origin}/sim.html?quality=low&map=rig` });
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(250);
        try { ready = await evaluate(`!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
      }
      assert.ok(ready, 'the bf core flies');
      await evaluate(PAGE);
      const js = async (body) => { const v = await evaluate(`(async () => { const L = window.__lf; ${body} })()`); return typeof v === 'string' && /^[[{]/.test(v) ? JSON.parse(v) : v; };
      // Out of the first-run prompt and the menus, so the poll runs.
      const open = await js(`
        for (let i = 0; i < 20 && (L.open().prompt || L.open().menu); i++) {
          if (L.open().prompt) window._feel.hideFirstRun();
          const rig = document.querySelector('#menuLayer.show [data-fly-map="rig"]');
          if (rig) rig.click();
          else if (L.open().menu) { const f = document.getElementById('menuFly'); if (f) f.click(); }
          await L.wait(200);
        }
        return JSON.stringify(L.open());`);
      assert.deepEqual(open, { prompt: false, menu: false }, 'no menu: the poll runs');
      const key = (down, k, code, vk) => send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      await flow({ js, key });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      dropProfile(profile);
    }
  }

  try {
    await t.test('the keyboard: W held, the page\'s throttle rises', async () => {
      await pass({}, async ({ js, key }) => {
        let r = await js(`const ok = L.busy(${BUSY_MS}); return JSON.stringify({ ok, frameMs: await L.frames(1500), thr: L.thr() });`);
        console.log('keyboard: frames ' + r.frameMs + ' ms, each with ' + BUSY_MS + ' ms of work: ' + JSON.stringify(r));
        assert.equal(r.ok, true, 'the frames made slow');
        assert.ok(r.frameMs > 120, `frames well past the old 100 ms horizon (${r.frameMs} ms)`);
        assert.equal(r.thr, 0, 'the throttle down to start');
        await key(true, 'w', 'KeyW', 87);
        r = await js(`const up = await L.until(() => L.thr() > 0.3, 10000); return JSON.stringify({ up, thr: L.thr() });`);
        await key(false, 'w', 'KeyW', 87);
        console.log('keyboard: W held, throttle ' + r.thr.toFixed(2));
        assert.equal(r.up, true, `W held: the page's throttle rises (${r.thr.toFixed(2)})`);
      });
    });

    await t.test('a TX16S: raised from the bottom, the page\'s throttle follows', async () => {
      await pass({ pad: { on: true, id: TX, axes: [0, 0, -1, 0, -1, -1, -1, -1] } }, async ({ js }) => {
        let r = await js(`
          await L.until(() => !/no gamepad/.test(document.getElementById('radioInfo').textContent), 5000);
          const ok = L.busy(${BUSY_MS});
          return JSON.stringify({ ok, radio: document.getElementById('radioInfo').textContent.slice(0, 30), frameMs: await L.frames(1500), thr: L.thr() });`);
        console.log('radio: frames ' + r.frameMs + ' ms, ' + r.radio);
        assert.match(r.radio, /TX16S/, 'the radio has the sticks');
        assert.ok(r.frameMs > 120, `frames well past the old 100 ms horizon (${r.frameMs} ms)`);
        assert.equal(r.thr, 0, 'its throttle at the bottom');
        r = await js(`
          window.__pads.axes[2] = 0.2;
          const t0 = performance.now();
          const read = await L.until(() => Math.abs(L.thr() - 0.6) < 0.02, 5000);
          return JSON.stringify({ read, ms: Math.round(performance.now() - t0), thr: L.thr() });`);
        console.log('radio: raised to 0.6, read ' + (r.read ? 'in ' + r.ms + ' ms' : 'never (' + r.thr + ')'));
        assert.equal(r.read, true, `the page's throttle follows the radio (${r.thr})`);
      });
    });
  } finally {
    server.close();
  }
});
