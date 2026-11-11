// The first-flight card runs on the clock the flight runs on: on a device too
// slow to keep its sim at full speed, the card stays up for as much flying as
// it does at full speed, and is not gone before the quad that raised it has
// taken off.
//   In headless Chrome, the bf core slowed to 54% of wall time (its advance()
//   given 54% of each frame, as a slow CI runner gets: a 467 ms frame steps
//   250 ms), a fresh profile, a TX16S at mid-stick:
//     the throttle down and up: the card (an attempt, too soon to arm);
//     down again for the page's own 1 s hold, then up: it arms and climbs, and
//     the card is still up when it has; the card goes 2.5 s of sim time after
//     it showed, which is about 4.6 s of wall time here.
//   With the card on wall time (the page before this test), it went 2.5 s of
//   wall time after it showed, before the 1 s hold and the climb were done.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { FIRST_FLIGHT_MIN_S } from '../sim-feel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const SPEED = 0.54;              // the sim's share of wall time, as on CI's runner
const HOLD_S = 1.05;             // a little over Easy mode's 1 s hold (sim-3d.js EASY_ARM_HOLD_S)

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

// Before the page's scripts: navigator.getGamepads() with one virtual TX16S
// (roll, pitch, throttle, yaw, AUX1..AUX4), there from the first look.
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

// In the page: the sticks, the card as the pilot sees it, the sim's clock,
// and the bf core slowed to a share of wall time.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(8); }
    return !!fn();
  };
  const thr = (t) => { window.__pads.axes[2] = t * 2 - 1; };
  const card = () => {
    const el = document.getElementById('firstFlight');
    return { on: el.classList.contains('show') && getComputedStyle(el).display !== 'none', kind: el.dataset.kind || '' };
  };
  // The sim's own clock: the ticks the bf core has run, in ms.
  const simMs = () => s.bfCore().simTimeUs / 1000;
  const lowS = () => { const a = s.easy().arm; return a ? +a.lowS || 0 : 0; };
  const state = () => { const c = s.coreState(); return { armed: !!c.armed, z: +(+c.position.z).toFixed(2) }; };
  const paused = () => document.body.classList.contains('menu-open') || !!(window._feel && window._feel.promptOpen) || !!(s.looks && s.looks.menuOpen);
  // The bf core given this share of each frame's wall time to step.
  const slow = (share) => {
    const b = s.bfCore();
    if (!b || b.__slowed) return false;
    const advance = b.advance;
    b.advance = function (frameMs, ...rest) { return advance.call(this, frameMs * share, ...rest); };
    b.__slowed = share;
    return true;
  };
  window.__cc = { s, wait, until, thr, card, simMs, lowS, state, paused, slow };
  return true;
})()`;

test('the first-flight card in Chrome on a sim at 54% of wall time: up over the flight, 2.5 s of sim time', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'qm-cardclock-'));
  const child = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=640,360',
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
    const js = async (body) => JSON.parse(await evaluate(`(async () => { const C = window.__cc; ${body} })()`));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
    await send('Page.navigate', { url: `${origin}/robots.txt` });
    for (let i = 0; i < 50; i++) { await sleep(100); try { if (await evaluate(`location.origin === ${JSON.stringify(origin)}`)) break; } catch (e) { /* loading */ } }
    await evaluate(`(() => {
      localStorage.clear();
      sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify({ on: true, id: TX, axes: [0, 0, 0, 0, -1, -1, -1, -1] })}));
      return true;
    })()`);
    await send('Page.navigate', { url: `${origin}/sim.html?quality=low` });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(250);
      try { ready = await evaluate(`!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._simQueryBooted && window._sim.firstFlight && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
    }
    assert.ok(ready, 'the bf core flies');
    await evaluate(PAGE);

    // The sim at 54%: checked on its own clock against the wall's.
    let r = await js(`
      const slowed = C.slow(${SPEED});
      await C.wait(500);
      const w0 = performance.now(), s0 = C.simMs();
      await C.wait(3000);
      const rate = (C.simMs() - s0) / (performance.now() - w0);
      return JSON.stringify({ slowed, rate, paused: C.paused(), card: C.card() });`);
    console.log('sim speed: ' + r.rate.toFixed(3) + ' of wall time');
    assert.equal(r.slowed, true, 'the bf core slowed');
    assert.ok(Math.abs(r.rate - SPEED) < 0.06, `the sim runs at ${SPEED} of wall time (${r.rate.toFixed(3)})`);
    assert.equal(r.paused, false, 'flying, no menu');
    assert.equal(r.card.on, false, 'no card before an arm attempt');

    // Down (the page has read it down), then up: an attempt, too soon to arm.
    r = await js(`
      C.thr(0);
      const read = await C.until(() => C.lowS() > 0, 20000);
      C.thr(0.6);
      const shown = await C.until(() => C.card().on, 8000);
      return JSON.stringify({ read, shown, at: performance.now(), atSim: C.simMs(), armed: C.state().armed });`);
    assert.equal(r.read, true, 'the page read the throttle down');
    assert.equal(r.shown, true, 'the first throttle raise shows the card');
    assert.equal(r.armed, false, 'on an attempt that did not arm');
    const at = r.at, atSim = r.atSim;

    // Down for the page's own hold, then up: it arms and climbs with the card up.
    r = await js(`
      C.thr(0);
      const held = await C.until(() => C.lowS() >= ${HOLD_S}, 20000);
      C.thr(0.6);
      const flew = await C.until(() => C.state().armed && C.state().z > 0.3, 20000);
      const during = C.card();
      const flewSimS = (C.simMs() - ${atSim}) / 1000;
      const flewWallS = (performance.now() - ${at}) / 1000;
      C.thr(0.45);
      const gone = await C.until(() => !C.card().on, 20000);
      const goneSimS = (C.simMs() - ${atSim}) / 1000;
      const goneWallS = (performance.now() - ${at}) / 1000;
      C.thr(0);
      return JSON.stringify({ held, flew, during, flewSimS, flewWallS, gone, goneSimS, goneWallS, state: C.state() });`);
    console.log('card: ' + JSON.stringify({ flewSimS: +r.flewSimS.toFixed(2), flewWallS: +r.flewWallS.toFixed(2), goneSimS: +r.goneSimS.toFixed(2), goneWallS: +r.goneWallS.toFixed(2) }));
    assert.equal(r.held, true, 'the page held the throttle down a second');
    assert.equal(r.flew, true, 'it arms and climbs');
    assert.equal(r.during.on, true, `still up once it has taken off (${r.flewSimS.toFixed(2)} s of sim time, ${r.flewWallS.toFixed(2)} s of wall time after it showed)`);
    assert.equal(r.gone, true, 'gone on the stick, once read');
    // Gone at the first poll after 2.5 s of the page's input time; the
    // readings come once a frame (a frame here is some 10-40 ms of sim time).
    assert.ok(r.goneSimS >= FIRST_FLIGHT_MIN_S - 0.1, `not before ${FIRST_FLIGHT_MIN_S} s of sim time (${r.goneSimS.toFixed(2)} s)`);
    assert.ok(r.goneSimS < FIRST_FLIGHT_MIN_S + 0.3, `${FIRST_FLIGHT_MIN_S} s of sim time, not more (${r.goneSimS.toFixed(2)} s)`);
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    dropProfile(profile);
    server.close();
  }
});
