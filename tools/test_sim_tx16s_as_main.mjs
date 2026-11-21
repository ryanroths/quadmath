// A working TX16S behaves exactly as it does on main: the same script, run in
// headless Chrome on main's page and on this tree's, gives the same trace.
//   - main's page: every served file this tree changes against origin/main
//     (`git diff --name-only origin/main`, tools/ left out) comes from
//     `git show origin/main:<file>`; everything else from this tree.
//   - the script: a fresh visitor (the first-run prompt up), a TX16S
//     (Classic, 8 axes) plugged in with its event, then wiggled, flown (throttle
//     low, then up: auto-arm and climb) and brought down; and a second visit
//     with the radio already there at load.
//   - the trace: every toast from the first paint, the prompt and the menu,
//     Tune's radio line, the preset, the OSD's input, the rates line, the
//     sticks at set poses, armed and climbed, the ryfly* keys saved.
// Local only: needs origin/main in the clone and Chrome (CHROME, as
// tools/test_sim_map_boot.mjs); SKIP_CHROME_BOOT=1 or a shallow clone skips it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const REST = [0, 0, -1, 0, -1, -1, -1, -1];

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

function git(args) {
  return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
}

// main's versions of the served files this tree changes.
function mainOverlay() {
  const changed = git(['diff', '--name-only', 'origin/main']).toString().split(/\r?\n/).filter((f) => f && !f.startsWith('tools/'));
  const out = new Map();
  for (const f of changed) {
    try { out.set('/' + f, git(['show', 'origin/main:' + f])); } catch (e) { out.set('/' + f, null); }
  }
  return out;
}

async function serve(overlay) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    if (overlay && overlay.has(rel)) {
      const body = overlay.get(rel);
      if (!body) { res.writeHead(404); res.end('missing on main'); return; }
      res.writeHead(200, { 'content-type': mime(rel) }); res.end(body); return;
    }
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

// Before the page's scripts: one virtual slot (window.__pad: null or axes),
// and every toast the page shows, from the first paint.
const BEFORE = String.raw`(() => {
  const KEY = '__fakePad';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  window.__pad = saved;
  const make = () => window.__pad ? ({ id: ${JSON.stringify(TX)}, index: 0, mapping: '', connected: true, timestamp: performance.now(),
    axes: window.__pad.slice(), buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) }) : null;
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() { try { sessionStorage.setItem(KEY, JSON.stringify(window.__pad)); } catch (e) { /* ignore */ } return [make(), null, null, null]; },
  });
  window.__plug = (axes) => { window.__pad = axes.slice(); const e = new Event('gamepadconnected'); e.gamepad = make(); window.dispatchEvent(e); };
  window.__toasts = [];
  new MutationObserver(() => {
    const el = document.getElementById('toast');
    const t = el && el.textContent;
    if (t && window.__toasts[window.__toasts.length - 1] !== t) window.__toasts.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
})()`;

// The script, the same on both pages. Returns the trace.
const SCRIPT = String.raw`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await wait(20); } return !!fn(); };
  const $ = (id) => document.getElementById(id);
  const s = window._sim;
  const look = () => ({
    prompt: !!(window._feel && window._feel.promptOpen),
    menu: !!(s.looks && s.looks.menuOpen),
    info: $('radioInfo').textContent,
    preset: $('radioPreset').value,
    input: (($('osdTR').textContent || '').match(/RADIO|GAMEPAD|KEYBOARD|TOUCH/) || [''])[0],
    rates: ($('ratesSourceBf') || {}).textContent || '',
  });
  const stick = () => { const a = window._axis().stick; return [a.r, a.p, a.y, a.t].map((v) => Math.round(v * 100) / 100); };
  const trace = { boot: look() };
  if (!window.__pad) { window.__plug(${JSON.stringify(REST)}); }
  await until(() => /TX16S/.test($('radioInfo').textContent), 5000);
  await wait(1500);
  trace.plugged = look();
  const pose = async (axes) => { window.__pad = axes.slice(); await wait(250); return stick(); };
  trace.sticks = {
    rest: await pose([0, 0, -1, 0, -1, -1, -1, -1]),
    roll: await pose([0.6, 0, -1, 0, -1, -1, -1, -1]),
    pitch: await pose([0, 0.6, -1, 0, -1, -1, -1, -1]),
    yaw: await pose([0, 0, -1, 0.6, -1, -1, -1, -1]),
    back: await pose([0, 0, -1, 0, -1, -1, -1, -1]),
  };
  await wait(600);
  window.__pad = [0, 0, 0.2, 0, -1, -1, -1, -1];
  trace.armed = await until(() => s.coreState().armed, 4000);
  trace.climbed = await until(() => s.coreState().position.z > 0.3, 6000);
  window.__pad = [0, 0, -1, 0, -1, -1, -1, -1];
  trace.disarmed = await until(() => !s.coreState().armed, 6000);
  await wait(500);
  trace.after = look();
  trace.toasts = window.__toasts.slice();
  trace.saved = Object.keys(localStorage).filter((k) => /^ryfly/.test(k)).sort().map((k) => [k, k === 'ryflyRates' ? '(rates)' : localStorage.getItem(k)]);
  return JSON.stringify(trace);
})()`;

test('a TX16S behaves exactly as on main: same toasts, prompt, map, arming and saves', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  let overlay;
  try { overlay = mainOverlay(); } catch (e) { t.skip('no origin/main here'); return; }
  if (!overlay.size) { t.skip('nothing served differs from main'); return; }
  console.log('main’s versions of: ' + [...overlay.keys()].join(', '));

  async function run(over, seed) {
    const { server, port } = await serve(over);
    const origin = `http://127.0.0.1:${port}`;
    const profile = mkdtempSync(join(tmpdir(), 'qm-tx16s-'));
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let ws = null;
    try {
      let debugPort = null;
      for (let i = 0; i < 100 && !debugPort; i++) {
        await sleep(200);
        try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0] || null; } catch (e) { /* not yet */ }
      }
      assert.ok(debugPort, 'no DevTools port');
      let page = null;
      for (let i = 0; i < 100 && !page; i++) {
        await sleep(200);
        try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* not yet */ }
      }
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      let seq = 0;
      const waiting = new Map();
      const errors = [];
      ws.addEventListener('message', (m) => {
        const o = JSON.parse(m.data);
        if (o.id && waiting.has(o.id)) { waiting.get(o.id)(o); waiting.delete(o.id); }
        if (o.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(o.params.exceptionDetails.exception || o.params.exceptionDetails.text).slice(0, 200));
      });
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
      await send('Page.addScriptToEvaluateOnNewDocument', { source: BEFORE });
      await send('Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(`(() => { localStorage.clear(); sessionStorage.setItem('__fakePad', ${JSON.stringify(JSON.stringify(seed))}); return true; })()`);
      await send('Page.navigate', { url: `${origin}/sim.html?quality=low&map=rig` });
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(250);
        try { ready = await evaluate(`!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
      }
      assert.ok(ready, 'the bf core flies');
      const trace = JSON.parse(await evaluate(SCRIPT));
      trace.errors = errors;
      return trace;
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
      server.close();
    }
  }

  for (const [name, seed] of [['plugged in after load', null], ['there at load', REST]]) {
    await t.test(name, async () => {
      const onMain = await run(overlay, seed);
      const here = await run(null, seed);
      console.log(`${name}, main:   ${JSON.stringify(onMain)}`);
      console.log(`${name}, branch: ${JSON.stringify(here)}`);
      assert.deepEqual(onMain.errors, [], 'main: no page errors');
      assert.equal(onMain.armed, true, 'main arms (the script is sound)');
      assert.deepEqual(here, onMain, 'the branch behaves as main');
    });
  }
});
