// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The pilot's smoke test: headed Chrome on this machine's real GPU, at full
// speed (no CPU throttling, no SwiftShader), quality HIGH, fresh profile, on
// each core (Betaflight, then ?core=js). Run it before every push that touches
// sim.html or sim-core-adapter.js; it must pass in under 3 minutes.
//
//   node tools/smoke_sim_headed.mjs            (CHROME= to pick the browser)
//
// Per core, one page, as a pilot flies it:
//   1. Keyboard: Space, W within 300 ms, a climb within 1 s of W.
//   2. Virtual radio (a TX16S plugged in): Easy mode's hold at the bottom,
//      then the throttle up: armed and climbing within 1 s of the raise.
//   3. Turtle and re-arm: on its back at rest, a full roll stick turns it
//      over; upright it re-arms, flyable under 300 ms of sim time from
//      upright; the throttle up climbs within 1 s of the re-arm.
//   4. Unplug: the radio pulled in flight; Space, W: the keyboard climbs
//      within 1 s of W.
//   5. Every map the Fly picker offers loads with its look applied.
// The turtle's time is a timing only when the run can be trusted for one: the
// sim clock's largest step from one animation frame to the next while it is
// measured under FRAME_STEP_MAX_MS (the page reads it once a frame, so a read
// is good to a frame at each end), and this machine not busy (all of it under
// MACHINE_LOAD_MAX, and the processes other than this test's Chrome and node
// under OTHER_LOAD_MAX of it, over the same window: node samples the CPU every
// CPU_SAMPLE_MS and takes the samples either side of it). Otherwise the check
// says NOT TIMED with the frame step and the load, and the run ends SMOKE
// UNTIMED (exit 2) if nothing failed: no 300 ms verdict either way.
// The window must stay visible and drawing (each page tracks its visibility,
// focus and animation-frame rate; CDP gives the window's state). A window
// hidden, minimized or not drawing (no animation frame for a whole second; a
// slow frame rate alone is not that, and shows in the text) is reported as
// that, not as a boot or flight failure, and the run
// ends SMOKE INVALID (exit 3): it says nothing about the sim.
// Not in CI (it needs a display and a GPU): its name is not tools/test_*.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BUDGET_MS = 180_000;
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const T0 = Date.now();
// The trust rules for the turtle's sim-time measurement (see the header).
// FRAME_STEP_MAX_MS is tools/test_sim_easy_mode.mjs's.
const FRAME_STEP_MAX_MS = 50;
const MACHINE_LOAD_MAX = 0.75;
const OTHER_LOAD_MAX = 0.25;
const CPU_SAMPLE_MS = 200;
const WINDOW_MIN_FPS = 1;

// This machine's CPU over a window: all of it, and the part not used by this
// test's own Chrome (its processes' CPU time from SystemInfo.getProcessInfo)
// or node. Fractions of every logical CPU.
function cpuTimes() {
  let busy = 0, all = 0;
  for (const c of cpus()) {
    const t = c.times;
    const sum = t.user + t.nice + t.sys + t.idle + t.irq;
    all += sum;
    busy += sum - t.idle;
  }
  return { busy: busy / 1000, all: all / 1000 }; // s, summed over CPUs
}
function nodeCpuS() { const u = process.cpuUsage(); return (u.user + u.system) / 1e6; }
async function cpuSnap(browserSend) {
  let chrome = null;
  if (browserSend) {
    try {
      const r = await browserSend('SystemInfo.getProcessInfo');
      chrome = r.processInfo.reduce((a, q) => a + (+q.cpuTime || 0), 0);
    } catch (e) { chrome = null; }
  }
  return { m: cpuTimes(), chrome, node: nodeCpuS(), wall: Date.now() };
}
// Samples every CPU_SAMPLE_MS until stop(); between(t0, t1) is the load over
// the samples either side of [t0, t1] (epoch ms), so it holds the window and
// at most a sample's time more at each end.
function cpuSampler(browserSend) {
  const snaps = [];
  let on = true, busy = false;
  const take = async () => { if (busy) return; busy = true; try { snaps.push(await cpuSnap(browserSend)); } finally { busy = false; } };
  take();
  const timer = setInterval(() => { if (on) take(); }, CPU_SAMPLE_MS);
  return {
    async stop() { on = false; clearInterval(timer); while (busy) await sleep(5); await take(); },
    between(t0, t1) {
      let a = null, b = null;
      for (const q of snaps) { if (q.wall <= t0) a = q; if (b === null && q.wall >= t1) b = q; }
      return a && b && b.wall > a.wall ? { load: cpuLoad(a, b), spanMs: b.wall - a.wall } : null;
    },
  };
}
function cpuLoad(a, b) {
  const all = b.m.all - a.m.all, busy = b.m.busy - a.m.busy;
  if (!(all > 0)) return null;
  const mine = (a.chrome !== null && b.chrome !== null ? b.chrome - a.chrome : NaN) + (b.node - a.node);
  const other = Number.isFinite(mine) ? Math.max(0, busy - mine) / all : null;
  return { machine: busy / all, other };
}
const pct = (x) => (x === null || !Number.isFinite(x) ? 'n/a' : Math.round(x * 100) + '%');

function resolveChrome() {
  const names = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('no Chrome: set CHROME');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain',
  '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
};
async function serveRoot() {
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    try { res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* gone */ } }
}

// Before the page's scripts: navigator.getGamepads() with one virtual TX16S,
// unplugged until window.__plug(); window.__pads drives its axes (roll,
// pitch, throttle, yaw, AUX1..AUX4; -1..1).
const FAKE_PADS = String.raw`(() => {
  // The window, from the page: hidden time, blurs, and the animation frames
  // of the last second (a hidden or occluded window draws none or few).
  const vis = window.__vis = { hiddenMs: 0, since: document.visibilityState === 'hidden' ? performance.now() : null, blurs: 0, frames: [] };
  document.addEventListener('visibilitychange', () => {
    const now = performance.now();
    if (document.visibilityState === 'hidden') { if (vis.since === null) vis.since = now; }
    else if (vis.since !== null) { vis.hiddenMs += now - vis.since; vis.since = null; }
  });
  addEventListener('blur', () => { vis.blurs++; });
  const tick = (t) => { vis.frames.push(t); while (vis.frames.length && vis.frames[0] < t - 1000) vis.frames.shift(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  vis.now = () => {
    const now = performance.now();
    return { visibility: document.visibilityState, focused: document.hasFocus(), blurs: vis.blurs,
      hiddenMs: Math.round(vis.hiddenMs + (vis.since !== null ? now - vis.since : 0)),
      fps: vis.frames.filter((t) => t >= now - 1000).length };
  };
  const pads = window.__pads = { on: false, id: ${JSON.stringify(TX)}, axes: [0, 0, -1, 0, -1, -1, -1, -1] };
  const make = () => ({ id: pads.id, index: 0, mapping: '', connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [pads.on ? make() : null, null, null, null]; } });
  window.__plug = () => { pads.on = true; const e = new Event('gamepadconnected'); e.gamepad = make(); window.dispatchEvent(e); };
  window.__unplug = () => { const g = make(); g.connected = false; pads.on = false; const e = new Event('gamepaddisconnected'); e.gamepad = g; window.dispatchEvent(e); };
})()`;

// In the page.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await wait(4); } return !!fn(); };
  const st = () => { const c = s.coreState(); const q = c.quaternion; return { kind: c.kind, armed: !!c.armed, z: c.position.z, flags: c.armingDisableFlags || 0,
    upZ: 1 - 2 * (q.x * q.x + q.y * q.y), clearance: c.clearance, speed: Math.hypot(c.velocity.x, c.velocity.y, c.velocity.z) }; };
  const open = () => !!((window._feel && window._feel.promptOpen) || (s.looks && s.looks.menuOpen));
  const radio = () => !/no gamepad/i.test(document.getElementById('radioInfo').textContent);
  const lowS = () => { const a = s.easy && s.easy().arm; return a ? +a.lowS || 0 : 0; };
  const toasts = [];
  const te = document.getElementById('toast');
  new MutationObserver(() => { const t = te.textContent; if (t && toasts[toasts.length - 1] !== t) toasts.push(t); }).observe(te, { childList: true, characterData: true, subtree: true });
  const keys = {};
  addEventListener('keydown', (e) => { if (!e.repeat) keys[e.code] = performance.now(); }, true);
  const landed = () => { const x = st(); return x.clearance <= 0.04 && x.speed < 0.5; };
  // On its back at rest where it stands.
  async function flip() {
    const c = s.coreState(), z = c.position.z;
    const half = 88 * Math.PI / 180;
    const q = { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
    if (c.kind === 'bf') s.bfCore().teleport({ x: c.position.x, y: c.position.y, z: z + 0.03 }, q, { x: 0, y: 0, z: 0 });
    else { const p = window._qp; p.quaternion = q; p.omega.x = p.omega.y = p.omega.z = 0; p.velocity.x = p.velocity.y = p.velocity.z = 0; }
    await wait(300);
    return until(() => st().upZ < -0.5 && st().clearance <= 0.04 && st().speed < 0.3, 4000);
  }
  // Until z has risen by dz above z0, within ms of t0; when it did.
  async function climb(z0, t0, ms, dz) {
    while (performance.now() - t0 < ms) { if (st().z > z0 + dz) return Math.round(performance.now() - t0); await wait(4); }
    return null;
  }
  // The sim clock's largest step from one animation frame to the next, from
  // now until the returned function is called (as tools/test_sim_easy_mode.mjs).
  function frames() {
    let last = s.simClockMs(), max = 0, n = 0, on = true;
    const f = () => {
      if (!on) return;
      const now = s.simClockMs();
      max = Math.max(max, now - last);
      last = now;
      n++;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    return () => { on = false; return { max: Math.round(max * 10) / 10, n }; };
  }
  window.__u = { s, wait, until, st, open, radio, lowS, toasts, keys, landed, flip, climb, frames };
  return true;
})()`;

const results = [];
// The window as the page and the browser see it; hidden: why it cannot count.
function windowVerdict(w) {
  const why = [];
  if (!w) return { hidden: false, text: 'window state not read' };
  if (w.visibility && w.visibility !== 'visible') why.push(`page ${w.visibility}`);
  if (w.windowState && w.windowState !== 'normal' && w.windowState !== 'maximized' && w.windowState !== 'fullscreen') why.push(`window ${w.windowState}`);
  if (Number.isFinite(w.fps) && w.fps < WINDOW_MIN_FPS) why.push('no animation frame in the last second (not drawing)');
  const text = `visibility ${w.visibility}, window ${w.windowState || 'n/a'}, focused ${w.focused}, ${w.fps} fps, hidden ${w.hiddenMs} ms, blurs ${w.blurs}`;
  return { hidden: why.length > 0, text: why.length ? why.join('; ') + ' [' + text + ']' : text };
}
function windowCheck(name, w) {
  const v = windowVerdict(w);
  results.push({ name, ok: !v.hidden, window: true, detail: v.text });
  console.log(`${v.hidden ? 'WINDOW HIDDEN' : 'WINDOW OK'}  ${name}  ${v.text}`);
  return !v.hidden;
}
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}
// A check that is a timing: judged only when the run can be trusted for one.
function timedCheck(name, ok, value, trust) {
  if (trust.ok) { check(name, ok, `${value}; ${trust.text}`); return; }
  results.push({ name, ok: true, untimed: true, detail: trust.text });
  console.log(`NOT TIMED  ${name}  read ${value}, not a timing: ${trust.text}`);
}
function trustOf(step, load) {
  const why = [];
  if (!(step && step.max > 0)) why.push('no frame step measured');
  else if (step.max >= FRAME_STEP_MAX_MS) why.push(`frame step ${step.max} ms of sim time (timed under ${FRAME_STEP_MAX_MS})`);
  if (!load) why.push('no CPU load measured');
  else {
    if (load.machine >= MACHINE_LOAD_MAX) why.push(`machine CPU ${pct(load.machine)} (timed under ${pct(MACHINE_LOAD_MAX)})`);
    if (load.other === null) why.push('CPU of other processes not measured');
    else if (load.other >= OTHER_LOAD_MAX) why.push(`other processes ${pct(load.other)} of the CPU (timed under ${pct(OTHER_LOAD_MAX)})`);
  }
  const text = `frame step ${step ? step.max : 'n/a'} ms over ${step ? step.n : 0} frames, CPU ${load ? pct(load.machine) : 'n/a'} (other processes ${load ? pct(load.other) : 'n/a'})`;
  return { ok: !why.length, text: why.length ? why.join('; ') + ' [' + text + ']' : text };
}

async function main() {
  // The machine before Chrome starts: 2 s of its CPU, for the summary.
  const pre0 = await cpuSnap(null);
  await sleep(2000);
  const preLoad = cpuLoad(pre0, await cpuSnap(null));
  const { server, origin } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-smoke-'));
  const child = spawn(resolveChrome(), [
    // Headed, on the real GPU, never paused or throttled as a hidden window.
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update', '--disable-sync',
    '--disable-background-networking', '--window-size=1280,760', '--mute-audio',
    '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null, browserSend = null, closeBrowserWs = () => {}, runSnap0 = null, runLoad = null;
  try {
    let port = null;
    for (let i = 0; i < 100 && !port; i++) { await sleep(150); try { port = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0] || null; } catch (e) { /* not yet */ } }
    if (!port) throw new Error('Chrome gave no DevTools port');
    let target = null;
    for (let i = 0; i < 100 && !target; i++) { await sleep(150); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* not yet */ } }
    // The browser's own target, for its processes' CPU time.
    let bws = null, bseq = 0;
    const bwait = new Map();
    try {
      const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      bws = new WebSocket(ver.webSocketDebuggerUrl);
      await new Promise((res, rej) => { bws.onopen = res; bws.onerror = () => rej(new Error('browser ws')); });
      bws.addEventListener('message', (m) => { const o = JSON.parse(m.data); if (o.id && bwait.has(o.id)) { bwait.get(o.id)(o); bwait.delete(o.id); } });
    } catch (e) { bws = null; }
    browserSend = bws && ((method, params) => new Promise((resolve, reject) => {
      const id = ++bseq;
      const timer = setTimeout(() => { bwait.delete(id); reject(new Error('cdp timeout ' + method)); }, 10000);
      bwait.set(id, (o) => { clearTimeout(timer); if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {}); });
      bws.send(JSON.stringify({ id, method, params: params || {} }));
    }));
    closeBrowserWs = () => { try { if (bws) bws.close(); } catch (e) { /* closed */ } };
    runSnap0 = await cpuSnap(browserSend);
    ws = new WebSocket(target.webSocketDebuggerUrl);
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
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text).slice(0, 400));
      return r.result ? r.result.value : undefined;
    };
    const js = async (body) => { const v = await ev(`(async () => { const U = window.__u; ${body} })()`); return typeof v === 'string' && /^[[{]/.test(v) ? JSON.parse(v) : v; };
    const key = (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk });
    const winState = async () => {
      let w = null;
      try { w = await ev(`window.__vis ? window.__vis.now() : null`); } catch (e) { w = null; }
      w = w || { visibility: null, focused: null, fps: null, hiddenMs: null, blurs: null };
      try { w.windowState = (await send('Browser.getWindowForTarget')).bounds.windowState; } catch (e) { w.windowState = null; }
      return w;
    };
    const tap = async (k, code, vk) => { await key('rawKeyDown', k, code, vk); await key('keyUp', k, code, vk); };
    const SPACE = [' ', 'Space', 32], W = ['w', 'KeyW', 87], R = ['r', 'KeyR', 82], ESC = ['Escape', 'Escape', 27];

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
    await send('Page.navigate', { url: `${origin}/robots.txt` });
    await sleep(300);

    for (const core of ['bf', 'js']) {
      const tag = core === 'bf' ? 'bf' : 'js';
      // A fresh profile, quality HIGH.
      await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`);
      await send('Page.navigate', { url: `${origin}/sim.html?quality=high&map=rig${core === 'js' ? '&core=js' : ''}` });
      let ready = false;
      for (let i = 0; i < 160 && !ready; i++) {
        await sleep(150);
        try { ready = await ev(`!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
      }
      // A boot that never got there says which part did not, and whether the
      // window was there to draw it: a hidden one is reported as that.
      let why = '';
      const bootWin = await winState();
      if (!ready && windowVerdict(bootWin).hidden) {
        windowCheck(`${tag}: window visible and drawing while it boots`, bootWin);
        continue;
      }
      if (!ready) {
        try {
          why = JSON.stringify(await ev(`(() => { const s = window._sim, l = s && s.looks; return { url: location.pathname + location.search, sim: !!s, core: s && s.core ? s.core() : null, queryBooted: !!window._simQueryBooted, looks: !!l, fpsReady: !!(l && l.fps && l.fps.ready), quality: l && l.quality ? l.quality : null, gl: (() => { try { const g = document.createElement('canvas').getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch (e) { return String(e); } })() }; })()`));
        } catch (e) { why = 'page did not answer: ' + (e && e.message || e); }
      }
      if (!ready) why += `; window: ${windowVerdict(bootWin).text}`;
      check(`${tag}: boots`, ready, why);
      if (!ready) continue;
      await ev(PAGE);
      const gl = await ev(`(() => { const g = window._sim.renderer.getContext(); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })()`);
      if (/swiftshader|llvmpipe|software/i.test(gl)) throw new Error('not a real GPU: ' + gl);
      // The first-run prompt: the keyboard.
      await js(`for (let i = 0; i < 30 && U.open(); i++) { const k = document.getElementById('feelKeys'); if (k) k.click(); else if (window._feel && window._feel.promptOpen) window._feel.hideFirstRun(); await U.wait(150); } return 1;`);
      const readyToArm = () => js(`return JSON.stringify(await U.until(() => !U.open() && U.st().flags === 0 && !U.st().armed && U.landed(), 15000));`);

      // 1. Keyboard: Space, W 150 ms later, a climb within 1 s of W.
      let ok = await readyToArm();
      let r0 = await js(`U.toasts.length = 0; return JSON.stringify({ z: U.st().z, fps: Math.round(U.s.looks.fps.avg || 0) });`);
      await tap(...SPACE);
      await sleep(150);
      await key('rawKeyDown', ...W);
      let r = await js(`
        const t0 = U.keys.KeyW || performance.now();
        const ms = await U.climb(${r0.z}, t0, 1000, 0.5);
        return JSON.stringify({ ms, st: U.st(), toasts: U.toasts.slice(), wAfterSpace: Math.round((U.keys.KeyW || 0) - (U.keys.Space || 0)) });`);
      await key('keyUp', ...W);
      check(`${tag}: keyboard Space, W ${r.wAfterSpace} ms later, climbs within 1 s`, ok && r.ms !== null,
        `${r.ms === null ? 'no climb' : 'up 0.5 m in ' + r.ms + ' ms'}; armed ${r.st.armed}, z ${r.st.z.toFixed(2)}, toasts ${JSON.stringify(r.toasts)}, ${r0.fps} fps, ${gl.replace(/^ANGLE \(|\)$/g, '').slice(0, 40)}`);
      // Down: disarm, respawn.
      await tap(...SPACE);
      await sleep(100);
      await tap(...R);

      // 2. Virtual radio: Easy hold at the bottom, then the throttle up.
      r = await js(`window.__pads.axes[2] = -1; window.__plug(); return JSON.stringify({ radio: await U.until(() => U.radio(), 4000) });`);
      ok = r.radio && await js(`return JSON.stringify(await U.until(() => U.st().flags === 0 && !U.st().armed && U.lowS() >= 1.05, 15000));`);
      r0 = await js(`U.toasts.length = 0; return JSON.stringify({ z: U.st().z, lowS: U.lowS() });`);
      r = await js(`
        window.__pads.axes[2] = 0.2;
        const t0 = performance.now();
        const ms = await U.climb(${r0.z}, t0, 1000, 0.5);
        return JSON.stringify({ ms, st: U.st(), toasts: U.toasts.slice() });`);
      check(`${tag}: radio, Easy hold ${r0.lowS.toFixed(2)} s, throttle up, climbs within 1 s`, ok && r.ms !== null,
        `${r.ms === null ? 'no climb' : 'up 0.5 m in ' + r.ms + ' ms'}; armed ${r.st.armed}, z ${r.st.z.toFixed(2)}, toasts ${JSON.stringify(r.toasts)}`);

      // 3. Turtle and re-arm: down, disarmed, on its back; a full roll stick.
      await js(`window.__pads.axes[2] = -1; await U.wait(50); return 1;`);
      await tap(...SPACE);           // disarm (Easy mode's radio: the page's arm, not a switch)
      await sleep(100);
      await tap(...R);
      const sampler = cpuSampler(browserSend);
      r = await js(`
        await U.until(() => !U.st().armed && U.landed(), 4000);
        const rest = await U.flip();
        U.toasts.length = 0;
        window.__pads.axes[0] = 1;
        const bf = U.st().kind === 'bf';
        const busy = () => (bf ? U.s.bfCore().turtlePhase !== null : !!U.s.easy().jsTurtle);
        const started = await U.until(busy, 2000);
        // Upright to flyable on the sim clock, at this machine's frame rate.
        const step = U.frames();
        const w0 = performance.timeOrigin + performance.now();
        let upT = null, flyT = null;
        const rearmed = await U.until(() => {
          const x = U.st();
          if (upT === null && x.upZ > 0.9) upT = U.s.simClockMs();
          if (upT !== null && flyT === null && x.armed && !busy()) flyT = U.s.simClockMs();
          return !busy() && x.upZ > 0.9 && x.armed;
        }, 6000);
        const stepMs = step();
        const w1 = performance.timeOrigin + performance.now();
        const flyMs = upT !== null && flyT !== null ? Math.round(flyT - upT) : null;
        window.__pads.axes[0] = 0;
        const z0 = U.st().z;
        window.__pads.axes[2] = 0.2;
        const t0 = performance.now();
        const ms = rearmed ? await U.climb(z0, t0, 1000, 0.5) : null;
        return JSON.stringify({ rest, started, rearmed, flyMs, stepMs, w0, w1, ms, st: U.st(), toasts: U.toasts.slice() });`);
      await sampler.stop();
      // The load over the timed window alone (frames() to step()), not the
      // waits for the landing, the flip and the start around it.
      const win = sampler.between(r.w0, r.w1);
      const turtleLoad = win ? win.load : null;
      check(`${tag}: turtle by roll stick, re-armed upright, throttle up climbs within 1 s`, r.rest && r.started && r.rearmed && r.ms !== null,
        `rest ${r.rest}, started ${r.started}, re-armed ${r.rearmed}, ${r.ms === null ? 'no climb' : 'up 0.5 m in ' + r.ms + ' ms'}; armed ${r.st.armed}, z ${r.st.z.toFixed(2)}, toasts ${JSON.stringify(r.toasts)}`);
      if (r.flyMs === null) check(`${tag}: turtle upright to flyable under 300 ms of sim time`, false, 'not measured');
      else {
        const trust = trustOf(r.stepMs, turtleLoad);
        trust.text += `, over ${Math.round(r.w1 - r.w0)} ms timed (CPU over ${win ? win.spanMs : 'n/a'} ms)`;
        timedCheck(`${tag}: turtle upright to flyable under 300 ms of sim time`, r.flyMs < 300, `${r.flyMs} ms`, trust);
      }

      // 4. Unplug in flight, then the keyboard: Space (disarm what the radio
      // armed if it still is), Space, W.
      r = await js(`window.__unplug(); return JSON.stringify({ gone: await U.until(() => !U.radio(), 3000) });`);
      await sleep(100);
      if (await js(`return JSON.stringify(U.st().armed);`)) { await tap(...SPACE); await sleep(100); }
      await tap(...R);
      ok = r.gone && await readyToArm();
      r0 = await js(`U.toasts.length = 0; return JSON.stringify({ z: U.st().z });`);
      await tap(...SPACE);
      await sleep(150);
      await key('rawKeyDown', ...W);
      r = await js(`
        const t0 = U.keys.KeyW || performance.now();
        const ms = await U.climb(${r0.z}, t0, 1000, 0.5);
        return JSON.stringify({ ms, st: U.st(), toasts: U.toasts.slice() });`);
      await key('keyUp', ...W);
      check(`${tag}: radio unplugged, then keyboard Space, W climbs within 1 s`, ok && r.ms !== null,
        `${r.ms === null ? 'no climb' : 'up 0.5 m in ' + r.ms + ' ms'}; armed ${r.st.armed}, z ${r.st.z.toFixed(2)}, toasts ${JSON.stringify(r.toasts)}`);
      await tap(...SPACE);

      // 5. Every map the Fly picker offers, with its look.
      await tap(...ESC);
      await sleep(150);
      const ids = await js(`
        const home = document.getElementById('menuHome'); if (home && home.offsetParent) home.click();
        await U.wait(150);
        document.getElementById('menuFly').click();
        await U.wait(150);
        return JSON.stringify(Array.from(document.querySelectorAll('#menuLayer [data-fly-map]')).map((b) => b.dataset.flyMap));`);
      for (const id of ids) {
        const t0 = Date.now();
        r = await js(`
          if (!document.querySelector('#menuLayer.show [data-fly-map="${id}"]')) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            await U.wait(100);
            const home = document.getElementById('menuHome'); if (home && home.offsetParent) home.click();
            await U.wait(100);
            document.getElementById('menuFly').click();
            await U.wait(150);
          }
          document.querySelector('#menuLayer [data-fly-map="${id}"]').click();
          const ok = await U.until(() => { const v = U.s.vibe && U.s.vibe(); return U.s.map() === '${id}' && v && v.id === '${id}' && U.s.looks.fps.ready && !U.open(); }, 30000);
          const v = U.s.vibe && U.s.vibe();
          return JSON.stringify({ ok, map: U.s.map(), vibe: v && v.id, core: U.s.core() });`);
        check(`${tag}: map ${id} loads with its look`, r.ok && r.core === core, `map ${r.map}, look ${r.vibe}, core ${r.core}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
      // The window over this core's run (hidden time since this page loaded).
      const endWin = await winState();
      if (endWin && endWin.hiddenMs > 0 && windowVerdict(endWin).hidden === false) endWin.visibility = 'hidden for part of the run';
      windowCheck(`${tag}: window stayed visible and drawing`, endWin);
    }
    if (runSnap0) runLoad = cpuLoad(runSnap0, await cpuSnap(browserSend));
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* closed */ }
    closeBrowserWs();
    killTree(child);
    await sleep(800);
    for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(300); } }
    server.close();
  }
  const ms = Date.now() - T0;
  const hidden = results.filter((x) => x.window && !x.ok);
  const failed = results.filter((x) => !x.ok && !x.window);
  const untimed = results.filter((x) => x.untimed);
  const inTime = ms < BUDGET_MS;
  const verdict = hidden.length ? 'SMOKE INVALID (window hidden or occluded)' : failed.length || !inTime ? 'SMOKE FAIL' : untimed.length ? 'SMOKE UNTIMED' : 'SMOKE PASS';
  const judged = results.length - untimed.length - results.filter((x) => x.window).length;
  console.log(`CPU: before Chrome ${pct(preLoad && preLoad.machine)}; through the run ${pct(runLoad && runLoad.machine)} (other processes ${pct(runLoad && runLoad.other)})`);
  console.log(`${verdict}: ${judged - failed.length}/${judged} checks${untimed.length ? `, ${untimed.length} not timed (${untimed.map((x) => x.name.split(':')[0]).join(', ')})` : ''} in ${(ms / 1000).toFixed(0)} s (limit ${BUDGET_MS / 1000} s)`);
  process.exit(hidden.length ? 3 : failed.length || !inTime ? 1 : untimed.length ? 2 : 0);
}

main().catch((e) => { console.error('SMOKE FAIL: ' + (e && e.stack || e)); process.exit(1); });
