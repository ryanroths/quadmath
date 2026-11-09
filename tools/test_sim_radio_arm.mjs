// Headless Chrome, the bf core and a fake TX16S on "use my radio switches" (a
// fresh profile but for that: tools/test_sim_easy_mode.mjs flies the default):
// arm on AUX1 and lift off. An Xbox pad is plugged in too and is seen first, alone (a
// lone pad is remembered as the pilot's, ryflyGamepadId); the radio must still
// be the pad the page flies, now and after a reload, with its AUX channels
// going to Betaflight. And the look's textures upload with no GL error (a
// texture first sent as its 1x1 placeholder took no second size).
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SWITCHES_PREFIX, sanitizeId } from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX_ID = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';

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

// Before the page's scripts: navigator.getGamepads() with an Xbox pad at
// index 0 and the TX16S at index 1, as the owner's PC enumerates them (ids
// as Chrome reports them). window.__pads says which the page can see and the
// TX16S axes (EdgeTX AETR: roll, pitch, throttle, yaw, then AUX1..AUX4); both
// live in sessionStorage, so a reload keeps them.
const FAKE_PADS = String.raw`(() => {
  try { localStorage.setItem(${JSON.stringify(SWITCHES_PREFIX + sanitizeId(TX_ID))}, JSON.stringify({ on: true, arm: { i: 4, sign: 1 }, turtle: { i: 6, sign: 1 }, angle: { i: 5, sign: 1 } })); } catch (e) { /* about:blank */ }
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { xbox: false, tx: false, axes: [0, 0, -1, 0, -1, -1, -1, -1] };
  const xbox = () => ({ id: 'Xbox One Game Controller (STANDARD GAMEPAD)', index: 0, mapping: 'standard', connected: true,
    timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  const tx = () => ({ id: ${JSON.stringify(TX_ID)}, index: 1, mapping: '', connected: true,
    timestamp: performance.now(), axes: pads.axes.slice(), buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.xbox ? xbox() : null, pads.tx ? tx() : null, null, null];
    },
  });
})()`;

// In the page: plug a pad in (it shows in getGamepads, then the event), set
// a TX16S axis, and the state the test checks.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const plug = (which) => { window.__pads[which] = true; window.dispatchEvent(new Event('gamepadconnected')); };
  const axis = (i, v) => { window.__pads.axes[i] = v; };
  function state() {
    const c = s.coreState(), fc = s.bfCore().sim.fc;
    return { armed: c.armed, flags: c.armingDisableFlags, z: c.position.z, aux1: Math.round(fc.rcData[4]),
      pad: document.getElementById('radioInfo').textContent, input: document.getElementById('osdTR').textContent };
  }
  // Throttle low, AUX1 high: armed within 2 s, or the state as it is.
  async function arm() {
    axis(2, -1); axis(4, -1);
    await wait(800);
    const before = state();
    axis(4, 1);
    for (let i = 0; i < 20 && !s.coreState().armed; i++) await wait(100);
    return { before, after: state() };
  }
  // 60 % throttle for 1.5 s, then the height; throttle down and disarm.
  async function lift() {
    axis(2, 0.2);
    await wait(1500);
    const up = state();
    axis(2, -1);
    await wait(1200);
    axis(4, -1);
    await wait(400);
    return { up, after: state() };
  }
  window.__radio = { wait, plug, axis, state, arm, lift };
  return true;
})()`;

test('the bf core: a fake TX16S on its switches, with an Xbox pad seen first, arms on AUX1 and lifts off, before and after a reload; the look textures upload with no GL error', { timeout: 5 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-radio-'));
  const debugPort = 9300 + (process.pid % 300);
  const child = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=640,360',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  const glErrors = [];
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
    ws.addEventListener('message', (msg) => {
      const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
      if (o.method === 'Log.entryAdded' && /GL_INVALID|Texture is immutable|overflows texture/.test(o.params.entry.text)) glErrors.push(o.params.entry.text);
    });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Log.enable');
    await cdp(ws, 'Page.enable');
    await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
    const boot = async () => {
      let ready = false;
      for (let i = 0; i < 160 && !ready; i++) {
        await sleep(250);
        try {
          ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`);
        } catch (e) { /* the page is still loading */ }
      }
      assert.ok(ready, 'the bf core flies');
      // Off the launch screen, as a pilot who has clicked Fly.
      await evaluate(ws, `(function(){
        ['startMenu','feelPrompt','menuLayer','toast','panel'].forEach(function(id){
          var el=document.getElementById(id); if(!el)return;
          el.classList.remove('open','show'); el.style.display='none';
        });
        document.body.classList.remove('menu-open');
        if(window._sim.looks.setMenuOpen) window._sim.looks.setMenuOpen(false);
        if(window._feel&&window._feel.hideFirstRun) window._feel.hideFirstRun();
        return true;
      })()`);
      await evaluate(ws, PAGE);
    };
    const run = async (js) => JSON.parse(await evaluate(ws, `(async () => { const R = window.__radio; ${js} })()`));
    await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/sim.html?quality=low` });
    await boot();

    // The Xbox pad wakes first, alone; then the TX16S.
    let r = await run(`
      R.plug('xbox');
      await R.wait(600);
      const xboxAlone = R.state().pad;
      R.plug('tx');
      await R.wait(1200);
      return JSON.stringify({ xboxAlone, remembered: localStorage.getItem('ryflyGamepadId'), withRadio: R.state() });`);
    console.log('plug: ' + JSON.stringify(r));
    assert.match(r.withRadio.pad, /TX16S/, `the TX16S is the pad the page flies, not the Xbox pad (${r.withRadio.pad})`);
    assert.match(r.withRadio.input, /RADIO/, `the OSD says RADIO (${r.withRadio.input})`);

    for (const pass of ['fresh profile', 'after a reload']) {
      if (pass === 'after a reload') {
        await cdp(ws, 'Page.reload', {});
        await boot();
        r = await run(`window.dispatchEvent(new Event('gamepadconnected')); await R.wait(1200); return JSON.stringify(R.state());`);
        console.log('reload: ' + JSON.stringify(r));
        assert.match(r.pad, /TX16S/, `after a reload, both pads plugged in: still the TX16S (${r.pad})`);
        assert.match(r.input, /RADIO/, `after a reload, the OSD says RADIO (${r.input})`);
      }
      r = await run(`return JSON.stringify(await R.arm());`);
      console.log(pass + ' arm: ' + JSON.stringify(r));
      assert.equal(r.before.aux1, 1000, `${pass}: AUX1 low reaches Betaflight (${r.before.aux1})`);
      assert.equal(r.after.aux1, 2000, `${pass}: AUX1 high reaches Betaflight (${r.after.aux1})`);
      assert.equal(r.after.armed, true, `${pass}: armed on AUX1 (flags ${r.after.flags})`);
      r = await run(`return JSON.stringify(await R.lift());`);
      console.log(pass + ' lift: ' + JSON.stringify(r));
      assert.ok(r.up.z > 0.5, `${pass}: lifts off at 60 % throttle (z ${r.up.z.toFixed(2)} m)`);
      assert.equal(r.after.armed, false, `${pass}: AUX1 low disarms`);
    }
    assert.deepEqual(glErrors, [], 'no GL errors (the look textures)');
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
