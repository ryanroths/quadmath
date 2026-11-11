// The first-flight card: on the first arm attempt, "Throttle up to fly · Full
// stick to flip back over · Esc for menu"; with no controller 3 s into the
// flying page, the keyboard layout as an image card. Dismissed by any stick or
// key. Once per profile for each kind of input (keyboard, touch, controller),
// never shown again on that input.
//   - In node: the card's rules (sim-feel.js stepFirstFlight) and its storage.
//   - In headless Chrome, a fresh profile each: a fake TX16S (the card on the
//     first throttle raise, armed or not; it does not pause the flight; gone
//     on the stick; never again, across a reload), a TX16S awake before the
//     page loads with its throttle at the bottom (there at the page's first
//     look, or handed over by gamepadconnected after its scripts: the first
//     throttle-up arms and shows the card), the keyboard through the
//     real launch path (the layout image after 3 s, there until a key; then
//     the same profile opened again with the TX16S awake: its card), a
//     keyboard pilot who arms at once (the text card, no layout), touch, and
//     a radio on its own switches (no card: the throttle is not its arm).
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  FIRST_FLIGHT_KEY, FIRST_FLIGHT_TEXT, FIRST_FLIGHT_KEYS_IMG, FIRST_FLIGHT_KEYS_ALT, FIRST_FLIGHT_KEYS_AFTER_S, FIRST_FLIGHT_MIN_S,
  loadFirstFlight, saveFirstFlight, stepFirstFlight, firstFlightInput, FIRST_FLIGHT_SEEN,
} from '../sim-feel.js';
import { SWITCHES_PREFIX, sanitizeId } from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';

function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const DT = 0.004;
// Nothing shown yet.
const NONE = { keys: false, keyboard: false, touch: false, controller: false };
const REST = { r: 0, p: 0, y: 0, t: 0 };
// Step the card for some seconds of 4 ms samples; returns the state, what
// shows, what is seen, and when the card on screen changed.
function run(from, seconds, sample) {
  let state = from.state || {}, seen = from.seen || NONE, show = state.show || null;
  const changes = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const s = typeof sample === 'function' ? sample(i * DT) : sample;
    const out = stepFirstFlight(state, { dt: DT, seen, stick: REST, ...s });
    if (out.show !== show) changes.push([out.show, +((i + 1) * DT).toFixed(3)]);
    state = out.state; seen = out.seen; show = out.show;
  }
  return { state, seen, show, changes };
}
const once = (flag) => (t) => ({ [flag]: t === 0 });

test('the card says what the owner wrote, and its storage round-trips', () => {
  assert.equal(FIRST_FLIGHT_TEXT, 'Throttle up to fly · Full stick to flip back over · Esc for menu');
  assert.equal(FIRST_FLIGHT_KEYS_AFTER_S, 3);
  assert.ok(existsSync(join(root, FIRST_FLIGHT_KEYS_IMG)), 'the keyboard layout image is in the repo');
  const svg = readFileSync(join(root, FIRST_FLIGHT_KEYS_IMG), 'utf8');
  for (const k of ['>W<', '>A<', '>S<', '>D<', '>Space<', '>Esc<', '>R<', 'throttle', 'yaw', 'pitch', 'roll', 'respawn', 'menu']) {
    assert.ok(svg.includes(k), `the layout shows ${k}`);
  }
  assert.match(FIRST_FLIGHT_KEYS_ALT, /W and S throttle/);
  const store = memStore();
  assert.deepEqual(FIRST_FLIGHT_SEEN, ['keys', 'keyboard', 'touch', 'controller']);
  assert.deepEqual(loadFirstFlight(store), NONE, 'a fresh profile');
  saveFirstFlight({ ...NONE, controller: true }, store);
  assert.equal(store.getItem(FIRST_FLIGHT_KEY), 'controller');
  assert.deepEqual(loadFirstFlight(store), { ...NONE, controller: true });
  saveFirstFlight({ ...NONE, keys: true, keyboard: true, controller: true }, store);
  assert.equal(store.getItem(FIRST_FLIGHT_KEY), 'keys,keyboard,controller');
  assert.deepEqual(loadFirstFlight(store), { ...NONE, keys: true, keyboard: true, controller: true });
  assert.deepEqual(loadFirstFlight(memStore({ [FIRST_FLIGHT_KEY]: 'junk' })), NONE);
  // The input a pilot is on.
  assert.equal(firstFlightInput({}), 'keyboard');
  assert.equal(firstFlightInput({ touch: true }), 'touch');
  assert.equal(firstFlightInput({ controller: true }), 'controller');
  assert.equal(firstFlightInput({ controller: true, touch: true }), 'controller', 'a radio on a phone');
});

test('the first arm attempt shows the card, once; a controller never gets the keyboard layout', () => {
  let r = run({}, 5, { controller: true });
  assert.equal(r.show, null, 'no attempt, a controller: nothing, however long');
  assert.deepEqual(r.seen, NONE);
  r = run(r, 0.1, (t) => ({ controller: true, attempt: t === 0 }));
  assert.equal(r.show, 'card', 'the attempt shows it');
  assert.deepEqual(r.seen, { ...NONE, controller: true }, 'seen as soon as it is shown');
  // No input: it stays.
  r = run(r, 10, { controller: true });
  assert.equal(r.show, 'card', 'there until a stick or key');
  r = run(r, 0.02, (t) => ({ controller: true, key: t === 0 }));
  assert.equal(r.show, null, 'a key takes it away');
  r = run(r, 1, (t) => ({ controller: true, attempt: t === 0 }));
  assert.equal(r.show, null, 'never again');
});

test('any stick or key dismisses it, but not before it can be read', () => {
  const shown = () => run({}, 0.004, { controller: true, attempt: true });
  // The throttle that raised it keeps moving: gone at the minimum time.
  let r = run(shown(), 4, (t) => ({ controller: true, stick: { ...REST, t: Math.min(1, 0.06 + t) } }));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0][0], null);
  assert.ok(Math.abs(r.changes[0][1] - FIRST_FLIGHT_MIN_S) < 0.02, `gone at ${r.changes[0][1]} s`);
  // A key in the first second: the same.
  r = run(shown(), 4, (t) => ({ controller: true, key: Math.abs(t - 0.5) < 0.002 }));
  assert.ok(Math.abs(r.changes[0][1] - FIRST_FLIGHT_MIN_S) < 0.02, `a key at 0.5 s: gone at ${r.changes[0][1]} s`);
  // Each stick, after the minimum: at once.
  for (const k of ['r', 'p', 'y', 't']) {
    r = run(shown(), 3, { controller: true });
    assert.equal(r.show, 'card');
    r = run(r, 0.02, { controller: true, stick: { ...REST, [k]: k === 't' ? 0.5 : -0.5 } });
    assert.equal(r.show, null, `the ${k} stick`);
  }
  // Stick noise is not a move.
  r = run(shown(), 5, { controller: true, stick: { r: 0.05, p: -0.04, y: 0.03, t: 0.02 } });
  assert.equal(r.show, 'card');
});

test('no controller after 3 s: the keyboard layout; not on touch, not once armed', () => {
  let r = run({}, 2.9, {});
  assert.equal(r.show, null, 'not before 3 s');
  r = run(r, 0.2, {});
  assert.equal(r.show, 'keys', 'the layout');
  assert.deepEqual(r.seen, { ...NONE, keys: true });
  r = run(r, 5, {});
  assert.equal(r.show, 'keys', 'there until a key');
  r = run(r, 0.02, once('key'));
  assert.equal(r.show, null);
  // Then an arm on the keys: the layout carried the line, no second card.
  r = run(r, 1, once('attempt'));
  assert.equal(r.show, null);
  assert.deepEqual(r.seen, { ...NONE, keys: true, keyboard: true });
  // A controller or touch never gets it.
  assert.equal(run({}, 10, { controller: true }).show, null);
  assert.equal(run({}, 10, { touch: true }).show, null);
  assert.deepEqual(run({}, 10, { touch: true }).seen, NONE, 'and it is not used up');
  // Flying on the keys by 3 s: no layout, and none later.
  r = run({}, 1, once('attempt'));
  assert.equal(r.show, 'card', 'the arm attempt card first');
  r = run(r, 4, (t) => ({ armed: true, key: Math.abs(t - 3) < 0.002 }));
  assert.equal(r.show, null);
  assert.deepEqual(r.seen, { ...NONE, keys: true, keyboard: true }, 'the layout is not needed');
  assert.equal(run(r, 10, {}).show, null);
});

test('one card for each input: the keys used up, a radio and touch sticks still get theirs', () => {
  // The keyboard layout, a key, then W: the keyboard's card is used up unseen.
  let r = run({}, 3.1, {});
  r = run(r, 3, once('key'));
  r = run(r, 1, once('attempt'));
  assert.equal(r.show, null);
  assert.deepEqual(r.seen, { ...NONE, keys: true, keyboard: true });
  // The page is opened again with a radio awake: its first throttle-up.
  r = run({ seen: r.seen }, 5, { controller: true });
  assert.equal(r.show, null, 'not before the throttle moves');
  r = run(r, 0.1, (t) => ({ controller: true, attempt: t === 0 }));
  assert.equal(r.show, 'card', 'the radio gets the card');
  assert.deepEqual(r.seen, { ...NONE, keys: true, keyboard: true, controller: true });
  r = run(r, 3, (t) => ({ controller: true, stick: { ...REST, t: 0.5 } }));
  assert.equal(r.show, null);
  r = run(r, 1, (t) => ({ controller: true, attempt: t === 0 }));
  assert.equal(r.show, null, 'once: not on its second');
  // Touch sticks on the same profile: theirs.
  r = run({ seen: r.seen }, 0.1, (t) => ({ touch: true, attempt: t === 0 }));
  assert.equal(r.show, 'card', 'touch gets the card');
  assert.deepEqual(r.seen, { keys: true, keyboard: true, touch: true, controller: true });
  // A pilot who saw the card on a radio first, then flies the keys: the layout, and no second card after it.
  r = run({}, 0.1, (t) => ({ controller: true, attempt: t === 0 }));
  r = run(r, 3, (t) => ({ controller: true, stick: { ...REST, t: 0.5 } }));
  r = run({ seen: r.seen }, 3.1, {});
  assert.equal(r.show, 'keys', 'the keyboard layout is still new to them');
  r = run(r, 3, once('key'));
  r = run(r, 1, once('attempt'));
  assert.equal(r.show, null);
  // And one who arms on the keys at once gets the card there too.
  r = run({ seen: { ...NONE, controller: true } }, 0.1, once('attempt'));
  assert.equal(r.show, 'card', 'the keys get the card');
});

test('the keyboard layout, then a radio: its first arm attempt still gets the card', () => {
  let r = run({}, 3.1, {});
  assert.equal(r.show, 'keys');
  // The radio wakes: that is the stick that takes the layout away.
  r = run(r, 3, { controller: true });
  assert.equal(r.show, null, 'gone when the controller turns up');
  r = run(r, 0.1, (t) => ({ controller: true, attempt: t === 0 }));
  assert.equal(r.show, 'card');
  // An attempt that failed on the keys, the card dismissed, still not armed: the layout follows.
  r = run({}, 0.5, once('attempt'));
  assert.equal(r.show, 'card');
  r = run(r, 3, (t) => ({ key: Math.abs(t - 2.6) < 0.002 }));
  assert.equal(r.show, 'keys', 'the layout after the card');
});

test('the page: the card element, hidden behind the menus and out of the screenshots', () => {
  const html = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(html, /<div id="firstFlight" role="status" aria-live="polite"><\/div>/);
  assert.match(html, /#firstFlight\{[^}]*pointer-events:none/, 'never in the way of a click');
  assert.match(html, /body\.menu-open #firstFlight,body\.builder-on #firstFlight,body\.calibrating #firstFlight\{display:none\}/);
  assert.match(html, /if\(simPaused\(\)\)\{lastPollUs=null;return;\}/, 'stepped only while flying');
  assert.match(html, /lastPollUs=tUs;\s+\/\/[^\n]*\n\s+tickFirstFlight\(dt\);\s+readInput\(dt\);/, 'on each poll the page reads, with its input time');
  for (const f of ['tools/test_sim_map_boot.mjs', 'tools/capture_sim_shots.mjs']) {
    assert.match(readFileSync(join(root, f), 'utf8'), /'toast','panel','firstFlight'\]/, f + ' hides it before a screenshot');
  }
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2',
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
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 45000);
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

// Before the page's scripts: navigator.getGamepads() with one fake pad, as
// Chrome reports it (as tools/test_sim_easy_mode.mjs). A TX16S: roll, pitch,
// throttle, yaw, AUX1..AUX4.
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, id: '', mapping: '', axes: [], buttons: 0 };
  const make = () => ({ id: pads.id, index: 0, mapping: pads.mapping, connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  // afterBoot: as Chrome hands over a radio that was awake before the page was
  // opened. getGamepads() is empty while the page's scripts run; this many ms
  // after they have, the pad is there and gamepadconnected fires. Without it
  // the pad is there from the first call.
  let there = !(pads.afterBoot >= 0);
  if (!there) {
    const iv = setInterval(() => {
      if (!window._feel) return;
      clearInterval(iv);
      setTimeout(() => { there = true; window.dispatchEvent(new Event('gamepadconnected')); }, pads.afterBoot);
    }, 4);
  }
  // raiseAt: this many ms after the page's scripts have run, the throttle goes
  // to 60% by itself: a pilot who throttles up while the page is still
  // loading, before a test could. __early: when, on which core, and how long
  // the card has been on screen since.
  if (pads.raiseAt >= 0) {
    const iv = setInterval(() => {
      if (!window._feel) return;
      clearInterval(iv);
      const early = window.__early = { raisedAt: null, core: null, shownAt: null, cardMs: 0 };
      setTimeout(() => {
        pads.axes[2] = 0.2;
        early.raisedAt = performance.now();
        early.core = window._sim && window._sim.core ? window._sim.core() : null;
      }, pads.raiseAt);
      let last = performance.now();
      setInterval(() => {
        const now = performance.now();
        const el = document.getElementById('firstFlight');
        if (el && el.classList.contains('show') && getComputedStyle(el).display !== 'none') {
          if (early.shownAt === null) early.shownAt = now;
          early.cardMs += now - last;
        }
        last = now;
      }, 50);
    }, 4);
  }
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on && there ? make() : null, null, null, null];
    },
  });
})()`;

// In the page: the sticks, the card as the pilot sees it, waiting on it.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(8); }
    return !!fn();
  };
  const axis = (i, v) => { window.__pads.axes[i] = v; };
  const thr = (t) => axis(2, t * 2 - 1);
  function card() {
    const el = document.getElementById('firstFlight');
    const img = el.querySelector('img');
    const box = el.getBoundingClientRect();
    return {
      on: el.classList.contains('show') && getComputedStyle(el).display !== 'none' && box.width > 0,
      kind: el.dataset.kind || '',
      text: el.firstChild ? el.firstChild.textContent : '',
      img: img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, alt: img.alt, w: Math.round(img.getBoundingClientRect().width) } : null,
      inView: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
      clicks: getComputedStyle(el).pointerEvents,
      saved: localStorage.getItem('quadmathSimFirstFlight'),
      seen: s.firstFlight().seen,
    };
  }
  const shown = (ms) => until(() => card().on, ms);
  const gone = (ms) => until(() => !card().on, ms);
  const paused = () => document.body.classList.contains('menu-open') || !!(window._feel && window._feel.promptOpen);
  window.__ff = { s, wait, until, axis, thr, card, shown, gone, paused };
  return true;
})()`;

test('the first-flight card in Chrome', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const debugPort = 9300 + (process.pid % 300);

  // A pass: a fresh Chrome profile, the given pad and localStorage, the page.
  async function pass(query, seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-first-'));
    const child = spawn(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
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
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      const url = `http://127.0.0.1:${port}/sim.html?quality=low${query ? '&' + query : ''}`;
      // Same origin first, for localStorage and sessionStorage before the page's scripts.
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pad || { on: false, id: '', mapping: '', axes: [], buttons: 0 })}));
        return true;
      })()`);
      await cdp(ws, 'Page.navigate', { url });
      const boot = async (core = seed.core || 'bf') => {
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
          await sleep(250);
          try {
            ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.firstFlight && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`);
          } catch (e) { /* the page is still loading */ }
        }
        assert.ok(ready, `the ${core} core flies`);
        await evaluate(ws, PAGE);
      };
      await boot();
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const F = window.__ff; ${body} })()`));
      await flow({
        js,
        reload: async () => { await cdp(ws, 'Page.reload', {}); await boot(); },
        // A real key through CDP: down, or up.
        hold: async (down, key, code, vk) => cdp(ws, 'Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key, code, windowsVirtualKeyCode: vk }),
        // Pressed and let go.
        key: async (key, code, vk) => {
          await cdp(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
          await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
        },
      });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
      }
    }
  }

  const tx = (axes) => ({ on: true, id: TX, mapping: '', axes: axes.slice(), buttons: 0 });

  try {
    await t.test('a fresh profile with a TX16S: the card on the first throttle raise, over the flight; gone on the stick; never again', async () => {
      // The throttle left at mid-stick, as a radio is often plugged in.
      await pass('', { pad: tx([0, 0, 0, 0, -1, -1, -1, -1]) }, async ({ js, reload }) => {
        let r = await js(`await F.wait(3600); return JSON.stringify({ card: F.card(), paused: F.paused() });`);
        assert.equal(r.paused, false, 'flying, no menu');
        assert.equal(r.card.on, false, 'no card before an arm attempt (and no keyboard layout with a radio)');
        assert.equal(r.card.saved, null, 'nothing stored yet');

        // Down for a moment, then up: too soon to arm, but an attempt.
        r = await js(`
          F.thr(0);
          await F.wait(400);
          const low = F.card();
          F.thr(0.6);
          const shown = await F.shown(1500);
          const at = performance.now();
          const first = F.card();
          const armed = F.s.coreState().armed;
          // Down a second, then up: it arms and flies under the card.
          F.thr(0);
          await F.wait(1300);
          F.thr(0.6);
          const flew = await F.until(() => F.s.coreState().armed && F.s.coreState().position.z > 0.3, 2500);
          const during = F.card();
          const paused = F.paused();
          const gone = await F.gone(4000);
          const ms = performance.now() - at;
          F.thr(0);
          return JSON.stringify({ low, shown, first, armed, flew, during, paused, gone, ms });`);
        console.log('radio: ' + JSON.stringify({ shown: r.shown, armedAtShow: r.armed, flew: r.flew, goneMs: Math.round(r.ms), saved: r.first.saved }));
        assert.equal(r.low.on, false, 'the throttle going down is not an attempt');
        assert.equal(r.shown, true, 'the first throttle raise shows it');
        assert.equal(r.armed, false, 'on an attempt that did not arm');
        assert.equal(r.first.kind, 'card');
        assert.equal(r.first.text, FIRST_FLIGHT_TEXT, 'the line');
        assert.equal(r.first.img, null, 'no keyboard layout for a radio');
        assert.equal(r.first.inView, true, 'on screen');
        assert.equal(r.first.clicks, 'none', 'takes no click');
        assert.equal(r.first.saved, 'controller', 'stored as soon as it is shown');
        assert.equal(r.flew, true, 'it arms and flies with the card up');
        assert.equal(r.during.on, true, 'still up a second and a half in');
        assert.equal(r.paused, false, 'the sim is not paused');
        assert.equal(r.gone, true, 'gone on the stick');
        assert.ok(r.ms >= FIRST_FLIGHT_MIN_S * 1000 - 150 && r.ms < 3600, `after ${FIRST_FLIGHT_MIN_S} s on screen, not before (${Math.round(r.ms)} ms)`);

        // Land, and arm again: no card. Then a reload: none.
        r = await js(`
          await F.until(() => !F.s.coreState().armed, 9000);
          await F.wait(1300);
          F.thr(0.5);
          const again = await F.shown(1200);
          F.thr(0);
          return JSON.stringify({ again, card: F.card() });`);
        assert.equal(r.again, false, 'a second arm: no card');
        await reload();
        r = await js(`
          F.thr(0);
          await F.wait(1400);
          F.thr(0.5);
          const again = await F.shown(1500);
          F.thr(0);
          await F.wait(2000);
          return JSON.stringify({ again, card: F.card() });`);
        assert.equal(r.again, false, 'after a reload: never again');
        assert.equal(r.card.saved, 'controller', 'the keyboard layout is still unused: a radio never needs it');
      });
    });

    // The radio on the bench: plugged in, switched on and its throttle at the
    // bottom before the page is opened. Chrome hands such a pad to the page on
    // its first look, or by gamepadconnected once its scripts have run.
    for (const afterBoot of [null, 0, 300, 1500]) {
      const when = afterBoot === null ? 'there at the first look' : `handed over ${afterBoot} ms after the scripts`;
      await t.test(`a TX16S awake before the page loads (${when}), throttle at the bottom: the first throttle-up arms and shows the card`, async () => {
        await pass('', { pad: afterBoot === null ? tx([0, 0, -1, 0, -1, -1, -1, -1]) : { ...tx([0, 0, -1, 0, -1, -1, -1, -1]), afterBoot } }, async ({ js }) => {
          let r = await js(`
            await F.wait(4200);
            return JSON.stringify({ card: F.card(), paused: F.paused(), armed: F.s.coreState().armed, ff: F.s.firstFlight(), body: document.body.className,
              prompt: !!(window._feel && window._feel.promptOpen), radio: document.getElementById('radioInfo').textContent.slice(0, 30) });`);
          console.log('awake at load, ' + when + ': ' + JSON.stringify(r));
          assert.equal(r.paused, false, 'flying, no menu');
          assert.equal(r.armed, false, 'not armed by itself');
          assert.equal(r.card.on, false, 'no card before the throttle moves');
          assert.equal(r.card.saved, null, 'nothing stored yet');

          // Held at the bottom long enough already: the first raise arms.
          r = await js(`
            F.thr(0.6);
            const shown = await F.shown(1500);
            const first = F.card();
            const ff = F.s.firstFlight();
            const flew = await F.until(() => F.s.coreState().armed && F.s.coreState().position.z > 0.3, 2500);
            const during = F.card();
            // The throttle has not moved since the card came up: it stays. A stick does it.
            await F.wait(1200);
            const held = F.card();
            F.thr(0.35);
            const gone = await F.gone(4000);
            F.thr(0);
            return JSON.stringify({ shown, first, ff, flew, during, held, gone, body: document.body.className });`);
          console.log('  first raise: ' + JSON.stringify({ shown: r.shown, ff: r.ff, flew: r.flew, saved: r.first.saved, body: r.body }));
          assert.equal(r.shown, true, 'the first throttle-up shows it');
          assert.equal(r.first.kind, 'card');
          assert.equal(r.first.text, FIRST_FLIGHT_TEXT, 'the line');
          assert.equal(r.first.img, null, 'no keyboard layout for a radio');
          assert.equal(r.first.inView, true, 'on screen');
          assert.equal(r.first.saved, 'controller', 'stored as soon as it is shown');
          assert.equal(r.flew, true, 'that raise arms and flies, the card up');
          assert.equal(r.during.on, true, 'still up while it climbs');
          assert.equal(r.held.on, true, 'and until a stick moves');
          assert.equal(r.gone, true, 'gone on the stick');
        });
      });
    }

    // The same radio, and a pilot who does not wait for the page: the throttle
    // goes up by itself, before the 1 s hold or after it. On a slow load that
    // is while Betaflight is still loading; on a fast one the page is ready.
    for (const raiseAt of [300, 1600]) {
      await t.test(`a TX16S awake before the page loads, throttled up ${raiseAt} ms after its scripts, loaded or not: the card`, async () => {
        await pass('', { pad: { ...tx([0, 0, -1, 0, -1, -1, -1, -1]), afterBoot: 0, raiseAt } }, async ({ js }) => {
          // The throttle may go up after the page is ready: wait for the card, then let it stand.
          const r = await js(`
            await F.until(() => window.__early && window.__early.shownAt !== null, 8000);
            await F.wait(1300);
            return JSON.stringify({ early: window.__early, card: F.card(), armed: F.s.coreState().armed, paused: F.paused() });`);
          console.log('throttled up ' + raiseAt + ' ms in: ' + JSON.stringify({ early: r.early, on: r.card.on, saved: r.card.saved, armed: r.armed }));
          assert.ok(r.early && r.early.raisedAt !== null, 'the throttle went up');
          assert.equal(r.paused, false, 'flying, no menu');
          assert.ok(r.early.shownAt !== null, 'the card came up');
          assert.ok(r.early.shownAt - r.early.raisedAt < 1500, `on that throttle-up (${Math.round(r.early.shownAt - r.early.raisedAt)} ms after it)`);
          assert.equal(r.card.kind, 'card');
          assert.equal(r.card.saved, 'controller');
          // No stick has moved since: it is still there, and has been all along.
          assert.equal(r.card.on, true, 'still up');
          assert.ok(r.early.cardMs >= 1000, `on screen since (${Math.round(r.early.cardMs)} ms)`);
        });
      });
    }

    await t.test('a fresh profile with no controller: Fly with keyboard, Fly, the Rig; 3 s later the keyboard layout, there until a key; never again', async () => {
      await pass('', {}, async ({ js, reload, key, hold }) => {
        let r = await js(`
          const prompt = !!document.getElementById('feelKeys');
          document.getElementById('feelKeys').click();
          await F.wait(150);
          document.getElementById('menuFly').click();
          await F.wait(200);
          const pausedOnMenu = F.paused();
          await F.wait(3500);
          const onMenu = F.card();
          document.querySelector('#menuLayer [data-fly-map="rig"]').click();
          const t0 = performance.now();
          await F.wait(1800);
          const early = F.card();
          const shown = await F.shown(4000);
          const ms = performance.now() - t0;
          await F.until(() => { const i = document.querySelector('#firstFlight img'); return i && i.complete; }, 3000);
          return JSON.stringify({ prompt, pausedOnMenu, onMenu, early, shown, ms, card: F.card(), map: F.s.map() });`);
        console.log('keyboard: ' + JSON.stringify({ shownMs: Math.round(r.ms), img: r.card.img, saved: r.card.saved }));
        assert.equal(r.prompt, true, 'the first-run prompt offers the keyboard');
        assert.equal(r.pausedOnMenu, true);
        assert.equal(r.onMenu.on, false, 'time on the menus does not count');
        assert.equal(r.map, 'rig');
        assert.equal(r.early.on, false, 'not at 1.8 s');
        assert.equal(r.shown, true, 'the keyboard layout shows');
        assert.ok(r.ms >= 2800 && r.ms < 5000, `about 3 s into the flying page (${Math.round(r.ms)} ms)`);
        assert.equal(r.card.kind, 'keys');
        assert.equal(r.card.text, FIRST_FLIGHT_TEXT, 'under the same line');
        assert.ok(r.card.img, 'an image card');
        assert.equal(r.card.img.src, FIRST_FLIGHT_KEYS_IMG);
        assert.equal(r.card.img.loaded, true, 'the image loads');
        assert.equal(r.card.img.alt, FIRST_FLIGHT_KEYS_ALT);
        assert.ok(r.card.img.w >= 300, `at a readable size (${r.card.img.w} px wide)`);
        assert.equal(r.card.inView, true, 'all of it on screen');
        assert.equal(r.card.saved, 'keys');

        // No input: it stays. Then any key.
        r = await js(`await F.wait(3200); return JSON.stringify(F.card());`);
        assert.equal(r.on, true, 'there until a key');
        await key('ArrowLeft', 'ArrowLeft', 37);
        r = await js(`const gone = await F.gone(800); return JSON.stringify({ gone });`);
        assert.equal(r.gone, true, 'a key takes it away');

        // W arms: the layout carried the line, so no second card.
        await hold(true, 'w', 'KeyW', 87);
        r = await js(`
          const armed = await F.until(() => F.s.coreState().armed, 2500);
          await F.wait(400);
          return JSON.stringify({ armed, card: F.card() });`);
        await hold(false, 'w', 'KeyW', 87);
        assert.equal(r.armed, true, 'W arms');
        assert.equal(r.card.on, false, 'no second card on the keys');
        assert.equal(r.card.saved, 'keys,keyboard');

        await reload();
        r = await js(`
          document.getElementById('menuFly').click();
          await F.wait(200);
          document.querySelector('#menuLayer [data-fly-map="rig"]').click();
          const again = await F.shown(4500);
          return JSON.stringify({ again, prompt: !!(window._feel && window._feel.promptOpen) });`);
        assert.equal(r.prompt, false);
        assert.equal(r.again, false, 'after a reload: never again');

        // The same profile, the page opened again with the TX16S awake and its
        // throttle at the bottom (an incognito window keeps its storage from
        // one page to the next). The keys' card is used up; the radio's is not.
        await js(`
          Object.assign(window.__pads, ${JSON.stringify({ ...tx([0, 0, -1, 0, -1, -1, -1, -1]), afterBoot: 0 })});
          navigator.getGamepads();
          return JSON.stringify(1);`);
        await reload();
        r = await js(`
          await F.wait(1500);
          const before = F.card();
          const paused = F.paused();
          const radio = document.getElementById('radioInfo').textContent;
          F.thr(0.6);
          const shown = await F.shown(1500);
          const first = F.card();
          const armed = await F.until(() => F.s.coreState().armed, 2500);
          F.thr(0.3);
          const gone = await F.gone(4000);
          F.thr(0);
          return JSON.stringify({ before, paused, radio, shown, first, armed, gone });`);
        assert.match(r.radio, /TX16S/, 'the radio is the input');
        assert.equal(r.paused, false, 'a radio awake at load flies at once');
        assert.equal(r.before.on, false, 'no card before the throttle moves');
        assert.equal(r.shown, true, "the radio's first throttle-up gets the card on a profile that has flown the keys");
        assert.equal(r.first.kind, 'card');
        assert.equal(r.first.img, null);
        assert.equal(r.first.saved, 'keys,keyboard,controller');
        assert.equal(r.armed, true, 'that raise arms');
        assert.equal(r.gone, true, 'gone on the stick');
      });
    });

    await t.test('a keyboard pilot who arms at once: the card on Space, there until a key, and no layout after it', async () => {
      await pass('map=rig', {}, async ({ js, key }) => {
        // Betaflight wants a moment after the prompt's pause before it will arm.
        await js(`document.getElementById('feelKeys').click(); await F.wait(1500); return JSON.stringify(1);`);
        await key(' ', 'Space', 32);
        let r = await js(`
          const shown = await F.shown(1000);
          const first = F.card();
          const armed = await F.until(() => F.s.coreState().armed, 1200);
          await F.wait(3400);
          return JSON.stringify({ shown, first, armed, flags: F.s.coreState().armingDisableFlags, later: F.card() });`);
        assert.equal(r.shown, true, 'Space is an arm attempt');
        assert.equal(r.first.kind, 'card');
        assert.equal(r.first.img, null);
        assert.equal(r.armed, true, `Space arms (flags ${r.flags})`);
        assert.equal(r.later.on, true, 'the key that raised it does not dismiss it; no input, it stays');
        assert.equal(r.later.kind, 'card', 'still the card, not the layout');
        await key('ArrowLeft', 'ArrowLeft', 37);
        r = await js(`
          const gone = await F.gone(800);
          await F.wait(1500);
          return JSON.stringify({ gone, card: F.card() });`);
        assert.equal(r.gone, true, 'a key takes it away');
        assert.equal(r.card.on, false, 'armed by 3 s: no keyboard layout');
        assert.equal(r.card.saved, 'keys,keyboard');
      });
    });

    await t.test('touch: no keyboard layout; the card on the first throttle up', async () => {
      await pass('core=js&map=rig', { core: 'js', storage: { quadmathSimInputChoice: 'touch' } }, async ({ js }) => {
        const r = await js(`
          const stick = { r: 0, p: 0, y: 0, t: 0 };
          window._touch.read = () => ({ ...stick });
          window._touch.enabled = true;
          await F.wait(4200);
          const idle = F.card();
          stick.t = 0.6;
          const shown = await F.shown(1500);
          const card = F.card();
          stick.t = 0;
          return JSON.stringify({ idle, shown, card });`);
        assert.equal(r.idle.on, false, 'no keyboard layout on touch');
        assert.equal(r.idle.saved, null);
        assert.equal(r.shown, true, 'the card on the throttle');
        assert.equal(r.card.kind, 'card');
        assert.equal(r.card.saved, 'touch');
      });
    });

    await t.test('a radio on its own switches: no card, the throttle is not how it arms', async () => {
      const storage = { [SWITCHES_PREFIX + sanitizeId(TX)]: JSON.stringify({ on: true, arm: { i: 4, sign: 1 }, turtle: { i: 6, sign: 1 }, angle: { i: 5, sign: 1 } }) };
      await pass('', { storage, pad: tx([0, 0, -1, 0, -1, -1, -1, -1]) }, async ({ js }) => {
        const r = await js(`
          await F.wait(1200);
          F.thr(0.5);
          await F.wait(500);
          F.thr(0);
          await F.wait(800);
          F.axis(4, 1);
          const armed = await F.until(() => F.s.coreState().armed, 2500);
          await F.wait(600);
          F.axis(4, -1);
          return JSON.stringify({ armed, easy: F.s.easy().mode, card: F.card() });`);
        assert.equal(r.easy, false, 'on its switches');
        assert.equal(r.armed, true, 'armed on its switch');
        assert.equal(r.card.on, false, 'no card');
        assert.deepEqual(r.card.seen, NONE, 'and not used up: it shows if the pilot goes back to Easy mode');
      });
    });
  } finally {
    await new Promise((res) => server.close(res));
  }
});
