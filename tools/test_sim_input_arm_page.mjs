// First flights that went wrong (a pilot's report, 2026-11-24), each fixed and
// checked here: in Node, the pure parts; in headless Chrome, the page.
//   1. Touch sticks picked on a desktop: a flight key offers the keyboard back
//      (one press: Enter), and Controls (launch screen and in-flight menu) has
//      "Fly with: Keyboard / Touch / Radio / Gamepad". Keyboard picked with a
//      gamepad connected sets it aside until it moves again.
//   2. A controller that cannot arm says why: a spring gamepad's throttle
//      resting up to 12% off centre reads 0 (it arms, no calibration), its
//      roll, pitch and yaw centred within 0.25 for the connect-time check
//      (0.2 of drift arms); a radio keeps the 5% line and 0.15, and its hint
//      says what holds it, with Calibrate; calibrated from there, it arms. A
//      throttle steady at its lowest above the line after a disarm gets the
//      offer too, a radio parked at half throttle does not. The 1 s hold done:
//      "Ready — throttle up" and a tick.
//   3. The arm frame: ARMED at full strength (no fade in) on the very frame
//      the core arms, on both cores and every input; the js core's arm tone
//      on that frame (on the bf core Betaflight's own beep is the arm tone,
//      and no cue is added); the disarm tone on the disarm frame, both cores,
//      Betaflight's disarm beeps held off under it.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs) for the page parts;
// SKIP_CHROME_BOOT=1 runs the Node parts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnBrowser } from './browser_guard.mjs';
import {
  sticksUnsafe, stepThrottleWatch, throttlePct, throttleReadout, controllerArmHelp, armHintText,
  RADIO_CENTRE_TOL, PAD_CENTRE_TOL, THR_STUCK_MAX,
} from '../sim-3d.js';
import { applyAxisMap, PAD_MAP, AETR_MAP, PAD_THR_DEADZONE } from '../sim-touch.js';
import { CUES, DISARM_BEEPER_MUTE_S } from '../sim-audio.js';
import { HOTKEYS, HOTKEY_GROUPS, legendHtml } from '../sim-feel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------- Node ----------
test('a spring gamepad: the throttle rests up to 12% off centre at 0, full stick still 100%; a radio keeps its full travel', () => {
  assert.equal(PAD_THR_DEADZONE, 0.12);
  const padT = (ly) => applyAxisMap([0, ly, 0, 0], PAD_MAP, {}).t;
  assert.equal(padT(0), 0);
  assert.equal(padT(-0.08), 0, 'resting 8% up');
  assert.equal(padT(-0.12), 0, 'resting 12% up');
  assert.ok(Math.abs(padT(-1) - 1) < 1e-12, 'full stick');
  assert.ok(Math.abs(padT(-0.56) - 0.5) < 1e-12, 'rescaled: (0.56 - 0.12) / 0.88');
  assert.equal(padT(1), 0, 'pulled down');
  // The arm raise (0.12) needs the stick 22.6% up.
  assert.ok(padT(-0.23) >= 0.12 && padT(-0.22) < 0.12);
  const txT = (raw) => applyAxisMap([0, 0, raw, 0], AETR_MAP, {}).t;
  assert.ok(Math.abs(txT(-0.84) - 0.08) < 1e-12, 'a radio at raw -0.84 reads 8%');
  assert.equal(txT(-1), 0);
});

test('the connect-time check: the throttle first, then the stick furthest off centre; a pad\'s tolerance takes 0.2 of drift, a radio\'s does not', () => {
  assert.equal(RADIO_CENTRE_TOL, 0.15);
  assert.equal(PAD_CENTRE_TOL, 0.25);
  assert.equal(sticksUnsafe({ t: 0, r: 0, p: 0, y: 0 }, false, RADIO_CENTRE_TOL), null);
  assert.deepEqual(sticksUnsafe({ t: 0.08, r: 0.3, p: 0, y: 0 }, false, RADIO_CENTRE_TOL), { stick: 't', v: 0.08 });
  assert.deepEqual(sticksUnsafe({ t: 0, r: 0.2, p: -0.3, y: 0 }, false, RADIO_CENTRE_TOL), { stick: 'p', v: -0.3 });
  assert.equal(sticksUnsafe({ t: 0, r: 0.2, p: 0, y: 0 }, false, PAD_CENTRE_TOL), null, '0.2 of drift on a pad');
  assert.deepEqual(sticksUnsafe({ t: 0, r: 0.2, p: 0, y: 0 }, false, RADIO_CENTRE_TOL), { stick: 'r', v: 0.2 }, 'on a radio');
  assert.deepEqual(sticksUnsafe({ t: 0, r: 0, p: 0, y: 0.25 }, false, PAD_CENTRE_TOL), { stick: 'y', v: 0.25 });
  assert.equal(sticksUnsafe({ t: 0.5, r: 0, p: 0, y: 0 }, true, RADIO_CENTRE_TOL), null, '3D: centred is low');
});

test('the readout: one decimal under 10%, never 5.0% for a reading over the line; the hint says why, or the hint and the readout', () => {
  assert.equal(throttlePct(0.05), '5.0%');
  assert.equal(throttlePct(0.0501), '5.1%');
  assert.equal(throttlePct(0.0499), '4.9%');
  assert.equal(throttlePct(0.08), '8.0%');
  assert.equal(throttlePct(0.5), '50%');
  assert.equal(throttleReadout(0), 'THR 0.0% · arm under 5%');
  assert.deepEqual(controllerArmHelp({ unsafe: { stick: 't', v: 0.08 }, t: 0.08 }), { text: 'Throttle reads 8.0% — needs under 5%', cal: true, why: 'throttle' });
  assert.deepEqual(controllerArmHelp({ unsafe: { stick: 'r', v: -0.3 } }), { text: 'Roll 30% off centre — centre the sticks', cal: true, why: 'r' });
  assert.deepEqual(controllerArmHelp({ stuck: true, t: 0.08 }), { text: 'Throttle stays at 8.0% — needs under 5%', cal: true, why: 'stuck' });
  assert.deepEqual(controllerArmHelp({ base: 'Ready — throttle up', t: 0 }), { text: 'Ready — throttle up\nTHR 0.0% · arm under 5%', cal: false, why: null });
  assert.equal(armHintText({ easy: true, ready: true }), 'Ready — throttle up');
  assert.equal(armHintText({ easy: true, ready: true, touch: 'left', low: true }), 'Thumb on the left stick, slide up to fly', 'touch keeps its words');
  assert.equal(armHintText({ easy: true, ready: true, keys: true, low: true }), 'Hold W to fly', 'the keys keep theirs');
});

test('the calibration offer: steady 1 s at its lowest, above the line, up to 20%; not a throttle that went lower, not one parked high, not armed', () => {
  const run = (ts, dt = 0.004, extra = {}) => {
    let st = {}, out = null;
    for (const t of ts) { out = stepThrottleWatch(st, { t, dt, armed: false, live: true, threeD: false, ...extra }); st = out.state; }
    return out;
  };
  const hold = (t, s) => Array(Math.round(s / 0.004)).fill(t);
  assert.equal(run(hold(0.08, 0.9)).stuck, false, 'under 1 s');
  assert.equal(run(hold(0.08, 1.05)).stuck, true, '1 s at 8%');
  assert.equal(run([...hold(0.03, 0.2), ...hold(0.08, 2)]).stuck, false, 'it read lower: it can go lower');
  assert.equal(run(hold(0.5, 3)).stuck, false, 'parked at half throttle');
  assert.equal(run(hold(THR_STUCK_MAX + 0.01, 3)).stuck, false);
  assert.equal(run(hold(0.04, 3)).stuck, false, 'under the line');
  assert.equal(run(hold(0.08, 3), 0.004, { armed: true }).stuck, false, 'armed');
  const wob = []; for (let i = 0; i < 400; i++) wob.push(i % 2 ? 0.08 : 0.1);
  assert.equal(run(wob).stuck, false, 'not steady');
});

test('the cues: the js arm tone is Betaflight\'s arming beep pattern; the disarm falls a fifth in its disarm rhythm', () => {
  assert.deepEqual(CUES.arm.map((s) => [...s]), [[0, 0.3, 1600], [0.35, 0.05, 1600]]);
  assert.deepEqual(CUES.disarm.map((s) => s.map((x) => Math.round(x * 1000) / 1000)), [[0, 0.15, 1600], [0.2, 0.15, 1066.667]]);
  assert.equal(DISARM_BEEPER_MUTE_S, 0.4);
  const html = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.ok(html.includes("if(core.kind!=='bf')simAudio.cue('arm');"), 'no cue over Betaflight\'s arm beep');
  assert.ok(!html.includes("toast('ARMED')"), 'ARMED is the flash, on the arm frame');
});

test('one list of keys: the legend is drawn from it as it read before; every key the page answers is in it', () => {
  const lines = legendHtml().split('<br>');
  assert.equal(lines.length, 18);
  assert.equal(lines[0], '<b>W/S — Throttle</b>');
  assert.equal(lines[8], '<b id="legendGhost">G — Ghost Replay</b>');
  assert.equal(lines[17], '<b>TAB — Tune Panel</b>');
  for (const k of HOTKEYS) assert.ok(HOTKEY_GROUPS.includes(k.group), k.keys + ': a group the card shows');
  const html = readFileSync(join(root, 'sim.html'), 'utf8');
  const legend = html.match(/<div id="legend">([\s\S]*?)<\/div>\s*<div id="feelPrompt"/);
  assert.ok(legend && !/<b[ >]/.test(legend[1].replace(/<div class="lgc[^>]*><\/div>/g, '')), 'no legend line written in the markup: they come from the list');
  // The letters the keydown handler answers (L: the shadow camera's helper, a developer's switch).
  const letters = new Set([...html.matchAll(/e\.key\.toLowerCase\(\)==='([a-z])'/g)].map((m) => m[1]));
  const listed = new Set(HOTKEYS.flatMap((k) => k.keys.toLowerCase().split(/\/| or /)).map((x) => x.trim()));
  for (const c of ['w', 's', 'a', 'd', 'q', 'e', ...letters]) if (c !== 'l') assert.ok(listed.has(c), c.toUpperCase() + ' is in the list');
  for (const k of ['1', '2', '3', '?', 'tab', 'esc', 'space', 'enter', 'delete']) assert.ok(listed.has(k), k + ' is in the list');
});

// ---------- Chrome ----------
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
const mime = (p) => ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp',
  '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg' })[extname(p)] || 'application/octet-stream';

async function serveRoot() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    try { res.writeHead(200, { 'content-type': mime(file) }); res.end(readFileSync(file)); } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

let cdpSeq = 0;
function cdp(ws, method, params) {
  const id = ++cdpSeq;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 30000);
    function on(msg) {
      let o; try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
      if (o.id !== id) return;
      clearTimeout(t); ws.removeEventListener('message', on);
      if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {});
    }
    ws.addEventListener('message', on);
  });
}
async function evaluate(ws, expression) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception ? r.exceptionDetails.exception.description || r.exceptionDetails.exception.value : r.exceptionDetails.text));
  return r.result ? r.result.value : undefined;
}
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
// TX16S Classic: roll, pitch, THROTTLE, yaw, then AUX1..4 at rest.
const txPad = (thr, roll = 0) => ({ id: TX, mapping: '', axes: [roll, 0, thr, 0, -1, -1, -1, -1], buttons: 24, on: true });
// A spring gamepad, Mode 2: LX yaw, LY throttle (up is -1), RX roll, RY pitch.
const xboxPad = (ly, rx = 0) => ({ id: XBOX, mapping: 'standard', axes: [0, ly, rx, 0], buttons: 17, on: true });

// Before the page's scripts: navigator.getGamepads() from window.__pads.list
// (kept in sessionStorage, so a reload keeps it).
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { list: [] };
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      const out = [null, null, null, null];
      pads.list.forEach((p, i) => { if (p.on) out[i] = { id: p.id, index: i, mapping: p.mapping || '', connected: true, timestamp: performance.now(),
        axes: p.axes.slice(), buttons: Array.from({ length: p.buttons || 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; });
      return out;
    },
  });
})()`;

// In the page: the state the tests read, the pads' axes, a per-frame record.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await wait(8); } return !!fn(); };
  const tEl = document.getElementById('toast');
  const toasts = [];
  new MutationObserver(() => { const x = tEl.textContent; if (x && toasts[toasts.length - 1] !== x) toasts.push(x); })
    .observe(tEl, { childList: true, characterData: true, subtree: true });
  const hintEl = document.getElementById('hudArmHint');
  const calEl = document.getElementById('hudArmCal');
  function snap() {
    const c = s.coreState(), h = s.armHelp(), a = s.audio.debug();
    return { core: s.core(), armed: !!c.armed, z: +c.position.z.toFixed(3), t: s.stickOverlay().stick.t, help: h,
      hint: hintEl.classList.contains('show') ? hintEl.textContent : null, cal: !calEl.hidden && calEl.getBoundingClientRect().width > 0,
      calib: document.getElementById('calib').classList.contains('show'), touchOn: document.body.classList.contains('touch-on'),
      toast: tEl.textContent, toastOp: +getComputedStyle(tEl).opacity, offer: !!document.getElementById('toastKeys') && +tEl.style.opacity > 0,
      cues: a.graph ? a.cues : null, actx: a.state, toasts: toasts.slice(-4) };
  }
  const axis = (i, a, v) => { window.__pads.list[i].axes[a] = v; };
  // Each painted frame, after the page's own loop (a rAF callback registered
  // after it runs after it): the core's armed, the toast as drawn, the cues.
  let rec = null;
  function frame(now) {
    if (!rec) return;
    const c = s.coreState(), a = s.audio.debug();
    rec.push({ at: Math.round(now), armed: !!c.armed, beeper: c.beeper === true, flash: tEl.classList.contains('arm-flash'), text: tEl.textContent,
      op: +getComputedStyle(tEl).opacity, cues: a.graph ? Object.assign({}, a.cues) : null, beeperGain: a.graph ? a.beeperGain : null });
    requestAnimationFrame(frame);
  }
  const record = () => { rec = []; requestAnimationFrame(frame); };
  const stopRec = () => { const r = rec; rec = null; return r; };
  window.__ia = { s, wait, until, snap, axis, record, stopRec, toasts };
  return true;
})()`;

test('first flights in Chrome: the input pick, the arm said, the arm frame', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();

  async function pass(opts, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-inarm-'));
    const [w, h] = opts.view || [960, 540];
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', `--window-size=${w},${h}`, ...(process.env.SIM_GPU_OFF === '1' ? ['--disable-gpu'] : []),
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let ws = null;
    try {
      let debugPort = 0;
      for (let i = 0; i < 600 && !debugPort; i++) { await sleep(100); try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ } }
      assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
      let page = null;
      for (let i = 0; i < 300 && !page; i++) {
        await sleep(100);
        try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* coming up */ }
      }
      assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      await cdp(ws, 'Runtime.enable');
      await cdp(ws, 'Page.enable');
      // opts.mobile: a phone (as tools/test_sim_mobile_launch.mjs): its screen, touch, its user agent.
      await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: opts.mobile ? 3 : 1, mobile: !!opts.mobile });
      if (opts.mobile) {
        await cdp(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await cdp(ws, 'Emulation.setUserAgentOverride', { userAgent: PHONE_UA, platform: 'Android' });
      }
      if (process.env.SIM_CPU_THROTTLE) await cdp(ws, 'Emulation.setCPUThrottlingRate', { rate: +process.env.SIM_CPU_THROTTLE });
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => { localStorage.clear(); const seed = ${JSON.stringify(opts.storage || {})}; for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify({ list: opts.pads || [] })})); return true; })()`);
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/sim.html?quality=low${opts.query ? '&' + opts.query : ''}` });
      const core = opts.core || 'bf';
      const boot = async () => {
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
          await sleep(250);
          try { ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.armHelp && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
        }
        assert.ok(ready, `the ${core} core flies`);
        await evaluate(ws, PAGE);
      };
      await boot();
      const keyEv = (type, key, code, vk) => cdp(ws, 'Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk });
      const KEYS = { w: ['w', 'KeyW', 87], space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13], up: ['ArrowUp', 'ArrowUp', 38], esc: ['Escape', 'Escape', 27],
        tab: ['Tab', 'Tab', 9], help: ['?', 'Slash', 191] };
      const api = {
        js: async (body) => { const v = await evaluate(ws, `(async () => { const I = window.__ia, s = I.s; ${body} })()`); return typeof v === 'string' ? JSON.parse(v) : v; },
        reload: async () => { await cdp(ws, 'Page.reload', {}); await boot(); },
        // One keydown (rawKeyDown only: rawKeyDown + keyDown toggles Space twice).
        hold: (down, k) => keyEv(down ? 'rawKeyDown' : 'keyUp', ...KEYS[k]),
        key: async (k) => { await keyEv('rawKeyDown', ...KEYS[k]); await keyEv('keyUp', ...KEYS[k]); },
        // A real click (a user activation: the audio unlocks on it).
        click: async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await cdp(ws, 'Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); },
        clickSel: async (sel) => {
          const b = await evaluate(ws, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
          assert.ok(b, sel + ' on screen');
          await api.click(b.x, b.y);
        },
        // A finger on it and off (a real touch, as a phone).
        tapSel: async (sel) => {
          const b = await evaluate(ws, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
          assert.ok(b, sel + ' on screen');
          await cdp(ws, 'Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
          await sleep(60);
          await cdp(ws, 'Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        },
        view: (vw, vh) => cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: opts.mobile ? 3 : 1, mobile: !!opts.mobile }),
      };
      await flow(api);
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]);
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
    }
  }
  const snap = 'return JSON.stringify(I.snap());';
  // Fly, The Rig, from the launch screen.
  const flyRig = `document.getElementById('menuFly').click(); await I.wait(200); document.querySelector('#menuLayer [data-fly-map="rig"]').click();
    await I.until(() => !document.body.classList.contains('menu-open'), 3000); await I.wait(600); return 1;`;

  try {
    await t.test('a desktop picks Touch sticks, then gets the keyboard back: W offers it, Enter takes it, W flies; Controls in flight picks either, and it is remembered', async () => {
      await pass({ view: [1280, 720] }, async (a) => {
        let r = await a.js(`return JSON.stringify({ card: !!(window._feel && window._feel.promptOpen), touchBtn: !!document.getElementById('feelTouch') });`);
        assert.equal(r.card, true, 'the first-run card');
        await a.clickSel('#feelTouch');
        await a.js(flyRig);
        r = await a.js(snap);
        assert.equal(r.help.choice, 'touch');
        assert.equal(r.touchOn, true);
        // W: the keyboard offered, nothing else.
        await a.key('w');
        r = await a.js(`await I.until(() => I.snap().offer, 2000); return JSON.stringify(I.snap());`);
        assert.equal(r.offer, true, 'W offers the keyboard: ' + JSON.stringify(r));
        assert.match(r.toast, /Fly with keyboard \[Enter\]/);
        assert.equal(r.armed, false);
        // Space with the offer up: no arm (a desktop's Space had armed with no throttle to fly on).
        await a.key('space');
        await a.js('await I.wait(500); return 1;');
        r = await a.js(snap);
        assert.equal(r.armed, false, 'Space does not arm under touch with a keyboard: ' + JSON.stringify(r));
        assert.equal(r.offer, true);
        // Enter: one press, the keyboard flies.
        await a.key('enter');
        r = await a.js(`await I.until(() => !I.snap().touchOn, 2000); return JSON.stringify(I.snap());`);
        assert.equal(r.help.choice, 'keyboard', 'saved: ' + JSON.stringify(r));
        assert.equal(r.touchOn, false);
        assert.equal(r.help.kind, 'keyboard');
        await a.hold(true, 'w');
        r = await a.js(`await I.until(() => I.snap().armed && I.snap().z > 0.3, 6000); return JSON.stringify(I.snap());`);
        await a.hold(false, 'w');
        assert.equal(r.armed, true, 'W arms: ' + JSON.stringify(r));
        assert.ok(r.z > 0.3, 'and climbs: ' + r.z);
        await a.key('space');
        await a.js('await I.until(() => !I.snap().armed, 3000); return 1;');
        // Controls is in the in-flight menu; "Fly with" picks Touch, then Keyboard.
        await a.key('esc');
        r = await a.js(`await I.until(() => document.body.classList.contains('menu-open'), 2000);
          const b = document.getElementById('menuControlsFlight'); const seen = !!b.offsetParent; b.click(); await I.wait(300);
          const pick = [...document.querySelectorAll('#menuLayer .input-pick [data-input]')].map((x) => x.dataset.input + ':' + x.getAttribute('aria-pressed'));
          return JSON.stringify({ seen, pick });`);
        assert.equal(r.seen, true, 'Controls in the in-flight menu');
        assert.deepEqual(r.pick, ['keyboard:true', 'touch:false', 'pad:false']);
        await a.clickSel('#menuLayer [data-input="touch"]');
        r = await a.js(`await I.wait(200); return JSON.stringify(Object.assign(I.snap(), { pick: [...document.querySelectorAll('#menuLayer [data-input]')].map((x) => x.getAttribute('aria-pressed')) }));`);
        assert.equal(r.help.choice, 'touch');
        assert.equal(r.touchOn, true);
        assert.deepEqual(r.pick, ['false', 'true', 'false']);
        await a.clickSel('#menuLayer [data-input="keyboard"]');
        r = await a.js(`await I.wait(200); return JSON.stringify(I.snap());`);
        assert.equal(r.help.choice, 'keyboard');
        assert.equal(r.touchOn, false);
        // Remembered: a reload flies the keyboard, no first-run card.
        await a.reload();
        r = await a.js(`await I.wait(500); return JSON.stringify(Object.assign(I.snap(), { card: !!(window._feel && window._feel.promptOpen) }));`);
        assert.equal(r.help.choice, 'keyboard');
        assert.equal(r.card, false);
        assert.equal(r.touchOn, false);
      });
    });

    await t.test('Keyboard picked in Controls with a gamepad flying: the pad is set aside, the keys fly; the pad moves and takes the sticks again', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'radio' }, pads: [xboxPad(0)] }, async (a) => {
        let r = await a.js(`await I.wait(1500); return JSON.stringify(I.snap());`);
        assert.equal(r.help.kind, 'gamepad');
        await a.key('esc');
        await a.js(`await I.until(() => document.body.classList.contains('menu-open'), 2000); document.getElementById('menuControlsFlight').click(); await I.wait(300); return 1;`);
        await a.clickSel('#menuLayer [data-input="keyboard"]');
        r = await a.js(`await I.wait(1500); return JSON.stringify(I.snap());`);
        assert.equal(r.help.kind, 'keyboard', 'the keys fly: ' + JSON.stringify(r.help));
        assert.deepEqual(r.help.aside, [XBOX]);
        assert.equal(r.help.choice, 'keyboard');
        // Back in flight (the input poll waits under the menu), the pad sends input: it flies again.
        await a.key('esc');
        await a.key('esc');
        // Past the page's 3 s hold on re-picking a device just dropped (PAD_REPICK_MS):
        // what keeps it out then is the set-aside.
        r = await a.js(`await I.until(() => !document.body.classList.contains('menu-open'), 2000); await I.wait(4000); return JSON.stringify(I.snap());`);
        assert.equal(r.help.kind, 'keyboard', 'set aside, the pad stays out while it rests');
        r = await a.js(`I.axis(0, 2, 0.6); await I.until(() => I.s.armHelp().kind === 'gamepad', 3000); I.axis(0, 2, 0); return JSON.stringify(I.snap());`);
        assert.equal(r.help.kind, 'gamepad', 'a controller that moves takes the sticks: ' + JSON.stringify(r.help));
      });
    });

    await t.test('a gamepad resting 8% up arms with no calibration: Ready, a tick, its throttle at 0.0%', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'radio' }, pads: [xboxPad(-0.08)] }, async (a) => {
        await a.click(4, 4); // a gesture: the audio unlocks
        let r = await a.js(`await I.until(() => (I.snap().hint || '').startsWith('Ready'), 8000); return JSON.stringify(I.snap());`);
        assert.equal(r.help.gate, false, 'the connect-time check passed: ' + JSON.stringify(r.help));
        assert.equal(r.help.pre.t, 0, 'the throttle reads 0 at an 8% rest');
        assert.equal(r.hint, 'Ready — throttle up\nTHR 0.0% · arm under 5%');
        assert.equal(r.cal, false);
        assert.equal(r.actx, 'running');
        assert.ok(r.cues.ready >= 1, 'the ready tick: ' + JSON.stringify(r.cues));
        r = await a.js(`I.axis(0, 1, -0.6); await I.until(() => I.snap().armed, 4000); await I.wait(800); return JSON.stringify(I.snap());`);
        assert.equal(r.armed, true, 'arms: ' + JSON.stringify(r));
        assert.ok(r.z > 0.3, 'and flies: ' + r.z);
        assert.equal(r.calib, false, 'no calibration');
      });
    });

    await t.test('a gamepad drifting 0.2 on roll arms', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'radio' }, pads: [xboxPad(0, 0.2)] }, async (a) => {
        let r = await a.js(`await I.until(() => I.s.armHelp().ready, 8000); return JSON.stringify(I.snap());`);
        assert.equal(r.help.gate, false, 'the check passed with 0.2 of roll: ' + JSON.stringify(r.help));
        assert.equal(r.help.pre.r, 0.2);
        r = await a.js(`I.axis(0, 1, -0.6); await I.until(() => I.snap().armed, 4000); return JSON.stringify(I.snap());`);
        assert.equal(r.armed, true, 'arms: ' + JSON.stringify(r));
      });
    });

    await t.test('a radio off centre: the hint names the stick and offers Calibrate; centred, the sticks go live', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'radio' }, pads: [txPad(-1, 0.3)] }, async (a) => {
        let r = await a.js(`await I.wait(1500); return JSON.stringify(I.snap());`);
        assert.equal(r.help.gate, true);
        assert.equal(r.hint, 'Roll 30% off centre — centre the sticks');
        assert.equal(r.cal, true, 'Calibrate offered');
        r = await a.js(`I.axis(0, 0, 0); await I.until(() => !I.s.armHelp().gate, 3000); await I.wait(100); return JSON.stringify(I.snap());`);
        assert.equal(r.help.gate, false);
        assert.equal(r.cal, false);
        assert.ok(r.toasts.includes('STICKS SAFE — LIVE'), JSON.stringify(r.toasts));
      });
    });

    await t.test('a radio bottoming at 8%: the hint says why with Calibrate, the raise does nothing; calibrated from that button, it arms', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'radio' }, pads: [txPad(-0.84)] }, async (a) => {
        let r = await a.js(`await I.wait(1500); return JSON.stringify(I.snap());`);
        assert.equal(r.help.gate, true);
        assert.deepEqual(r.help.why, { stick: 't', v: r.help.why.v });
        assert.equal(r.hint, 'Throttle reads 8.0% — needs under 5%');
        assert.equal(r.cal, true);
        r = await a.js(`I.axis(0, 2, 0.2); await I.wait(1500); const x = I.snap(); I.axis(0, 2, -0.84); await I.wait(300); return JSON.stringify(x);`);
        assert.equal(r.armed, false, 'the raise does not arm');
        assert.equal(r.hint, 'Throttle reads 60% — needs under 5%');
        await a.clickSel('#hudArmCal');
        r = await a.js(`await I.until(() => I.snap().calib, 2000); return JSON.stringify(I.snap());`);
        assert.equal(r.calib, true, 'Calibrate opens the calibration');
        // The steps, as the overlay asks them: centre (throttle low), roll right, pitch up, yaw right, throttle up, throttle down.
        const steps = await a.js(`
          const step = () => document.getElementById('calibStep').textContent;
          const centre = () => { I.axis(0, 0, 0); I.axis(0, 1, 0); I.axis(0, 3, 0); };
          const plan = [() => { centre(); I.axis(0, 2, -0.84); }, () => I.axis(0, 0, 1), () => { I.axis(0, 0, 0); I.axis(0, 1, -1); },
            () => { I.axis(0, 1, 0); I.axis(0, 3, 1); }, () => { I.axis(0, 3, 0); I.axis(0, 2, 1); }, () => I.axis(0, 2, -0.84)];
          const seen = [];
          for (const go of plan) {
            const s0 = step(); go();
            await I.until(() => step() !== s0 || !I.snap().calib, 6000);
            seen.push(s0);
            centre(); await I.wait(300);
          }
          return JSON.stringify({ seen, open: I.snap().calib });`);
        assert.equal(steps.open, false, 'calibration done: ' + JSON.stringify(steps.seen));
        // The hint is painted by the frame after the poll that makes it ready.
        r = await a.js(`await I.until(() => (I.snap().hint || '').startsWith('Ready'), 8000); return JSON.stringify(I.snap());`);
        assert.equal(r.help.gate, false, JSON.stringify(r.help));
        assert.equal(r.hint, 'Ready — throttle up\nTHR 0.0% · arm under 5%');
        r = await a.js(`I.axis(0, 2, 0.2); await I.until(() => I.snap().armed, 4000); return JSON.stringify(I.snap());`);
        assert.equal(r.armed, true, 'calibrated, it arms: ' + JSON.stringify(r));
      });
    });

    await t.test('the calibration offer after a disarm: a radio steady at 8% gets it; parked at half throttle it gets the readout only', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'radio' }, pads: [txPad(-1)] }, async (a) => {
        let r = await a.js(`await I.until(() => I.s.armHelp().ready, 8000); I.axis(0, 2, -0.2); await I.until(() => I.snap().armed, 4000); return JSON.stringify(I.snap());`);
        assert.equal(r.armed, true);
        await a.key('space');
        r = await a.js(`await I.until(() => !I.snap().armed, 3000); I.axis(0, 2, -0.84); await I.until(() => I.s.armHelp().stuck, 4000); await I.wait(100); return JSON.stringify(I.snap());`);
        assert.equal(r.armed, false);
        assert.equal(r.help.stuck, true, JSON.stringify(r.help));
        assert.equal(r.hint, 'Throttle stays at 8.0% — needs under 5%');
        assert.equal(r.cal, true);
        r = await a.js(`I.axis(0, 2, 0); await I.wait(2500); return JSON.stringify(I.snap());`);
        assert.equal(r.help.stuck, false, 'parked at 50%: no offer');
        assert.equal(r.cal, false);
        assert.equal(r.hint, 'Throttle down 1 s, then up to fly\nTHR 50% · arm under 5%');
      });
    });

    // Tune's close button as drawn: open, where, whether it is what a click
    // there hits, and the panel's last element (the site link).
    const TUNE = `const p = document.getElementById('panel'), b = document.getElementById('panelClose');
      const r = b.getBoundingClientRect(), pr = p.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return JSON.stringify({ open: p.classList.contains('open'), top: Math.round(r.top), h: Math.round(r.height), inPanel: r.left >= pr.left - 1 && r.right <= pr.right + 1,
        onTop: hit === b || b.contains(hit), last: p.lastElementChild && p.lastElementChild.id, text: b.textContent });`;

    await t.test('Tune\'s close button on a desktop: at the top, nothing over it, still there scrolled to the bottom; a click closes Tune; the site link is last; Tab and Esc still close Tune', async () => {
      await pass({ view: [1280, 720], query: 'map=rig', storage: { quadmathSimInputChoice: 'keyboard' } }, async (a) => {
        await a.key('tab');
        let r = await a.js(`await I.wait(400); ${TUNE}`);
        assert.equal(r.open, true);
        assert.ok(r.top >= 0 && r.top < 40, 'at the top: ' + JSON.stringify(r));
        assert.equal(r.onTop, true, 'nothing over it: ' + JSON.stringify(r));
        assert.equal(r.inPanel, true);
        assert.equal(r.text, '✕ CLOSE');
        assert.equal(r.last, 'panelHome', 'Back to QuadMath at the bottom');
        r = await a.js(`const p = document.getElementById('panel'); p.scrollTop = p.scrollHeight; await I.wait(300); ${TUNE}`);
        assert.ok(r.top >= 0 && r.top < 40 && r.onTop, 'scrolled to the bottom, still at the top: ' + JSON.stringify(r));
        await a.clickSel('#panelClose');
        r = await a.js(`await I.wait(300); ${TUNE}`);
        assert.equal(r.open, false, 'a click closes Tune');
        await a.key('tab');
        r = await a.js(`await I.wait(300); ${TUNE}`);
        assert.equal(r.open, true);
        await a.key('tab');
        r = await a.js(`await I.wait(300); ${TUNE}`);
        assert.equal(r.open, false, 'Tab closes it');
        await a.key('tab');
        await a.js('await I.wait(300); return 1;');
        await a.key('esc');
        r = await a.js(`await I.wait(300); ${TUNE}`);
        assert.equal(r.open, false, 'Esc closes it');
      });
    });

    await t.test('Tune\'s close button on a phone: Tune tapped open from the HUD, the close at the top, still there scrolled down, and a tap closes Tune (two landscape screens)', async () => {
      await pass({ mobile: true, view: [844, 390], query: 'map=rig' }, async (a) => {
        for (const [vw, vh] of [[844, 390], [667, 375]]) {
          const size = vw + 'x' + vh;
          await a.view(vw, vh);
          await a.js('await I.wait(600); return 1;');
          await a.tapSel('#gear');
          let r = await a.js(`await I.wait(500); ${TUNE}`);
          assert.equal(r.open, true, size + ': the HUD\'s TUNE opens it');
          assert.ok(r.top >= 0 && r.top < 40 && r.onTop && r.h >= 30, size + ': at the top, a thumb\'s size, nothing over it: ' + JSON.stringify(r));
          r = await a.js(`const p = document.getElementById('panel'); p.scrollTop = p.scrollHeight; await I.wait(300); ${TUNE}`);
          assert.ok(r.top >= 0 && r.top < 40 && r.onTop, size + ': scrolled down, still at the top: ' + JSON.stringify(r));
          await a.tapSel('#panelClose');
          r = await a.js(`await I.wait(500); ${TUNE}`);
          assert.equal(r.open, false, size + ': a tap closes Tune');
        }
      });
    });

    await t.test('the keys card: ? in flight opens it over the menu, ? again closes it back to flight; Controls\' All keys opens it, Esc goes back to the menu; it lists every key in the list, and the legend shows the list\'s lines', async () => {
      await pass({ view: [1280, 720], query: 'map=rig', storage: { quadmathSimInputChoice: 'keyboard' } }, async (a) => {
        const CARD = `const L = document.getElementById('menuLayer'); const up = L.classList.contains('show') && !!L.querySelector('.keys-card');
          return JSON.stringify({ up, menu: document.body.classList.contains('menu-open'),
            rows: [...L.querySelectorAll('.keys-card .keys-list dt')].map((dt) => dt.textContent + ' — ' + dt.nextElementSibling.textContent),
            groups: [...L.querySelectorAll('.keys-card .keys-group')].map((h) => h.textContent),
            legend: [...document.querySelectorAll('#legend b')].map((b) => b.textContent) });`;
        let r = await a.js(`await I.wait(300); ${CARD}`);
        assert.deepEqual(r.legend, HOTKEYS.filter((k) => k.legend).map((k) => k.keys + ' — ' + k.does), 'the legend: the list\'s lines');
        assert.equal(r.up, false);
        await a.key('help');
        r = await a.js(`await I.wait(300); ${CARD}`);
        assert.equal(r.up, true, '? opens the keys card');
        assert.equal(r.menu, true, 'over the menu (the sim waits)');
        assert.deepEqual(r.groups, HOTKEY_GROUPS);
        assert.deepEqual(r.rows, HOTKEY_GROUPS.flatMap((g) => HOTKEYS.filter((k) => k.group === g).map((k) => k.keys + ' — ' + k.does)), 'every key in the list');
        await a.key('help');
        r = await a.js(`await I.wait(300); ${CARD}`);
        assert.equal(r.up, false, '? again closes it');
        assert.equal(r.menu, false, 'back to flight');
        await a.key('esc');
        await a.js(`await I.until(() => document.body.classList.contains('menu-open'), 2000); document.getElementById('menuControlsFlight').click(); await I.wait(300); return 1;`);
        await a.clickSel('#keysOpen');
        r = await a.js(`await I.wait(300); ${CARD}`);
        assert.equal(r.up, true, 'Controls\' All keys opens it');
        await a.key('esc');
        r = await a.js(`await I.wait(300); ${CARD}`);
        assert.equal(r.up, false);
        assert.equal(r.menu, true, 'Esc: back to the menu');
      });
    });

    // The arm and disarm frames, from the per-frame record.
    const armFrame = (rec) => rec.findIndex((f) => f.armed);
    const flashOn = (f) => f.flash && f.text === 'ARMED' && f.op >= 0.99;
    function checkArm(rec, label, js) {
      const i = armFrame(rec);
      assert.ok(i > 0, label + ': armed within the record, not before it: ' + JSON.stringify(rec.slice(0, 3)));
      assert.equal(rec[i - 1].flash, false, label + ': no flash before');
      assert.ok(flashOn(rec[i]), label + ': ARMED at full strength on the arm frame: ' + JSON.stringify(rec.slice(i - 1, i + 2)));
      if (js) assert.equal(rec[i].cues.arm, rec[i - 1].cues.arm + 1, label + ': the arm tone on the arm frame: ' + JSON.stringify(rec.slice(i - 1, i + 2)));
      else {
        assert.equal(rec[i].cues.arm, 0, label + ': no cue over Betaflight\'s beep');
        assert.ok(rec.slice(i, i + 3).some((f) => f.beeper), label + ': Betaflight\'s arming beep: ' + JSON.stringify(rec.slice(i, i + 3)));
      }
      return i;
    }
    function checkDisarm(rec, from, label, bf) {
      const j = rec.findIndex((f, k) => k > from && !f.armed);
      assert.ok(j > from, label + ': disarmed in the record');
      assert.equal(rec[j].cues.disarm, rec[j - 1].cues.disarm + 1, label + ': the disarm tone on the disarm frame: ' + JSON.stringify(rec.slice(j - 1, j + 2)));
      if (bf) {
        const under = rec.filter((f, k) => k >= j && f.at - rec[j].at < DISARM_BEEPER_MUTE_S * 1000 - 100);
        assert.ok(under.every((f) => f.beeperGain < 0.01), label + ': Betaflight\'s disarm beeps held off under it: ' + JSON.stringify(under));
      }
    }

    await t.test('the arm frame on the js core: ARMED and the arm tone on it (keyboard W); the disarm tone on Space\'s', async () => {
      await pass({ query: 'map=rig&core=js', core: 'js', storage: { quadmathSimInputChoice: 'keyboard' } }, async (a) => {
        await a.click(4, 4);
        await a.js(`await I.wait(1500); await I.until(() => +getComputedStyle(document.getElementById('toast')).opacity === 0, 6000); I.record(); await I.wait(200); return 1;`);
        await a.hold(true, 'w');
        await a.js(`await I.until(() => I.snap().armed, 4000); await I.wait(300); return 1;`);
        await a.hold(false, 'w');
        await a.key('space');
        const rec = await a.js(`await I.until(() => !I.snap().armed, 3000); await I.wait(300); return JSON.stringify(I.stopRec());`);
        assert.equal(rec[0].cues !== null, true, 'the audio unlocked');
        const i = checkArm(rec, 'js keyboard W', true);
        checkDisarm(rec, i, 'js Space', false);
      });
    });

    await t.test('the arm frame on the bf core: ARMED on it, Betaflight\'s beep the tone (a radio\'s raise); the disarm tone on Space\'s, its beeps held off', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'radio' }, pads: [txPad(-1)] }, async (a) => {
        await a.click(4, 4);
        await a.js(`await I.until(() => I.s.armHelp().ready, 8000); await I.until(() => +getComputedStyle(document.getElementById('toast')).opacity === 0, 6000); I.record(); await I.wait(200); return 1;`);
        await a.js(`I.axis(0, 2, -0.4); await I.until(() => I.snap().armed, 4000); await I.wait(500); I.axis(0, 2, -1); return 1;`);
        await a.key('space');
        const rec = await a.js(`await I.until(() => !I.snap().armed, 3000); await I.wait(500); return JSON.stringify(I.stopRec());`);
        const i = checkArm(rec, 'bf radio raise', false);
        checkDisarm(rec, i, 'bf Space', true);
      });
    });

    await t.test('the arm frame on the bf core with touch sticks and with the keyboard\'s Space', async () => {
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'touch' } }, async (a) => {
        await a.click(4, 4);
        let rec = await a.js(`
          const stick = { r: 0, p: 0, y: 0, t: 0 };
          window._touch.read = () => ({ ...stick });
          window._touch.enabled = true;
          await I.wait(1500); await I.until(() => +getComputedStyle(document.getElementById('toast')).opacity === 0, 6000);
          I.record(); await I.wait(200);
          stick.t = 0.6; await I.until(() => I.snap().armed, 4000); await I.wait(300); stick.t = 0;
          return JSON.stringify(I.stopRec());`);
        checkArm(rec, 'bf touch raise', false);
      });
      await pass({ query: 'map=rig', storage: { quadmathSimInputChoice: 'keyboard' } }, async (a) => {
        await a.click(4, 4);
        await a.js(`await I.wait(1500); await I.until(() => +getComputedStyle(document.getElementById('toast')).opacity === 0, 6000); I.record(); await I.wait(200); return 1;`);
        await a.key('space');
        const rec = await a.js(`await I.until(() => I.snap().armed, 3000); await I.wait(300); return JSON.stringify(I.stopRec());`);
        checkArm(rec, 'bf keyboard Space', false);
      });
    });
  } finally {
    server.close();
  }
});
