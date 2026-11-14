// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// An arm on the bf core waits for Betaflight from when the ARM switch reaches
// it, not from the key. The switch goes to Betaflight on the next input
// sample, and on a slow device that sample is late: the page polls about
// once a frame, and stamps a poll's sample ahead of the sim after a long
// frame. Counted from the key, the page's 300 ms (sim.html bfArmWatch) ran out
// first: NOT ARMED, then ARMED on the switch already sent, then DISARMED by
// the page's own NOT ARMED (Space on a phone-class CPU, 83-117 ms frames).
//   - In node: an arm's throttle hold (Easy mode's throttle-rise auto-arm,
//     setArm holdThrottle) runs 200 ms from the sample that carries it, so
//     a sample that lands 250 ms after setArm still arms and stays armed.
//   - In headless Chrome, the bf core, a fresh keyboard profile: Space, with
//     the page's own 4 ms input poll held back (as on a main thread busy with
//     slow frames) for 0, 400 or 1000 ms of sim time after the key. Space
//     arms once the poll carries the switch, toasts ARMED and nothing else,
//     and stays armed. Counted from the key (the page before this test), a
//     hold of 400 or 1000 ms toasted NOT ARMED and never armed.
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
import { createBfCore, armingFlagNames } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WATCH_MS = 300;            // sim.html bfArmWatch: Betaflight's time to arm
const LATE_US = 250_000;         // past sim-core-adapter.js HOLD_US (200 ms)
const HOLDS_MS = [0, 400, 1000]; // the poll held back after Space, in sim time

test('an arm\'s throttle hold runs 200 ms from the sample that carries it: one that lands 250 ms after setArm still arms', async () => {
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8')),
    diff: readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8'),
    world: { floorZ: 0 },
  });
  const send = (t, leadUs) => core.input({ r: 0, p: 0, y: 0, t }, core.simTimeUs + leadUs);
  for (let i = 0; i < 40; i++) { send(0, 0); core.advance(10); }
  assert.equal(core.sim.fc.armingDisableFlags, 0, `ready to arm (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  // Easy mode's auto-arm: the throttle already raised, held low on the
  // channel with ARM. 50 ms frames, one poll each, every sample landing
  // 250 ms ahead of the sim.
  core.setArm(true, { holdThrottle: true });
  const askedUs = core.simTimeUs;
  let armedUs = null;
  let disarmedUs = null;
  for (let i = 0; i < 20; i++) {
    send(0.2, LATE_US);
    core.advance(50);
    if (core.sim.fc.armed && armedUs === null) armedUs = core.simTimeUs;
    if (!core.sim.fc.armed && armedUs !== null && disarmedUs === null) disarmedUs = core.simTimeUs;
  }
  assert.notEqual(armedUs, null, `armed (flags ${armingFlagNames(core.sim.fc.armingDisableFlags)})`);
  assert.ok(armedUs - askedUs >= LATE_US, `on the sample that carried ARM, ${(armedUs - askedUs) / 1000} ms after setArm`);
  assert.equal(disarmedUs, null, `never disarmed after (disarmed ${disarmedUs === null ? '' : (disarmedUs - askedUs) / 1000 + ' ms after setArm'})`);
  assert.equal(core.aux.arm, true, 'the ARM switch stays on');
  assert.equal(core.aux.holdThrottle, false, 'armed: the hold let go');
  assert.equal(core.sim.fc.armed, true, '1 s on, still armed');
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

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// Before the page's scripts: no gamepad, and the page's own input poll
// wrapped. While window.__pollHeld is true the poll does not run (a main
// thread busy with slow frames runs it late); window.__pollRuns counts the
// runs. window.__afterPoll: functions
// run right after each poll, dropped once one returns true. readInput's first
// act is navigator.getGamepads(), so a poll that called it is one the page
// read (the input clock dropped none).
const BEFORE = String.raw`(() => {
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() { window.__gpCalls = (window.__gpCalls || 0) + 1; return [null, null, null, null]; },
  });
  window.__pollHeld = false;
  window.__afterPoll = [];
  const si = window.setInterval;
  window.setInterval = function (fn, ms, ...rest) {
    if (typeof fn !== 'function' || fn.name !== 'pollInput') return si.call(window, fn, ms, ...rest);
    window.__pollWrapped = true;
    return si.call(window, function () {
      if (window.__pollHeld) return;
      window.__pollRuns = (window.__pollRuns || 0) + 1;
      const calls = window.__gpCalls || 0;
      fn.apply(this, arguments);
      const read = (window.__gpCalls || 0) > calls;
      const after = window.__afterPoll;
      for (let i = after.length - 1; i >= 0; i--) {
        let done = true;
        try { done = after[i](read); } catch (e) { /* drop it */ }
        if (done) after.splice(i, 1);
      }
    }, ms, ...rest);
  };
})()`;

// In the page: the toasts as they show, Betaflight's arm per frame on the bf
// core's clock, and Space's time on it.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const simUs = () => s.bfCore().simTimeUs;
  const toasts = [];
  const el = document.getElementById('toast');
  new MutationObserver(() => { const t = el.textContent; if (t && toasts[toasts.length - 1] !== t) toasts.push(t); })
    .observe(el, { childList: true, characterData: true, subtree: true });
  const frames = [];
  (function f() { frames.push([simUs(), !!s.coreState().armed]); requestAnimationFrame(f); })();
  const keyAt = { us: null };
  addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) keyAt.us = simUs(); }, true);
  // Run fn right after the next poll the page reads.
  const afterPoll = (fn) => new Promise((res) => { window.__afterPoll.push((read) => { if (!read) return false; fn(); res(true); return true; }); });
  const open = () => ({ prompt: !!(window._feel && window._feel.promptOpen), menu: !!(s.looks && s.looks.menuOpen) });
  window.__u = { s, wait, simUs, toasts, frames, keyAt, afterPoll, open };
  return true;
})()`;

test('Space on the bf core arms however late the poll carries the switch to Betaflight', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'qm-arm-window-'));
  let child = null;
  let ws = null;
  try {
    child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=480,270',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
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
    const js = async (body) => { const v = await evaluate(`(async () => { const U = window.__u; ${body} })()`); return typeof v === 'string' && /^[[{]/.test(v) ? JSON.parse(v) : v; };
    const space = async () => {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: BEFORE });
    // A fresh profile: nothing saved, the first-run prompt up.
    await send('Page.navigate', { url: `${origin}/robots.txt` });
    for (let i = 0; i < 50; i++) { await sleep(100); try { if (await evaluate(`location.origin === ${JSON.stringify(origin)}`)) break; } catch (e) { /* loading */ } }
    await evaluate(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`);
    await send('Page.navigate', { url: `${origin}/sim.html?quality=low&map=rig` });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(250);
      try { ready = await evaluate(`!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
    }
    assert.ok(ready, 'the bf core flies');
    assert.equal(await evaluate('window.__pollWrapped === true'), true, 'the page\'s input poll is pollInput, wrapped');
    await evaluate(PAGE);

    // The keyboard picked at the first-run prompt, no menu, Betaflight ready to arm.
    let r = await js(`
      for (let i = 0; i < 40 && (U.open().prompt || U.open().menu); i++) {
        const keys = document.getElementById('feelKeys');
        if (U.open().prompt && keys) keys.click();
        else if (U.open().prompt) window._feel.hideFirstRun();
        const rig = document.querySelector('#menuLayer.show [data-fly-map="rig"]');
        if (rig) rig.click();
        else if (U.open().menu) { const f = document.getElementById('menuFly'); if (f) f.click(); }
        await U.wait(200);
      }
      const t0 = performance.now();
      while (performance.now() - t0 < 20000 && U.s.coreState().armingDisableFlags !== 0) await U.wait(20);
      await U.wait(500);
      return JSON.stringify({ open: U.open(), flags: U.s.coreState().armingDisableFlags, armed: U.s.coreState().armed, thr: window._axis().stick.t, easy: U.s.easy().mode });`);
    assert.deepEqual(r.open, { prompt: false, menu: false }, 'no prompt, no menu: the poll runs');
    assert.equal(r.flags, 0, 'Betaflight shows no arming flag');
    assert.equal(r.armed, false, 'disarmed');
    assert.equal(r.thr, 0, 'the keyboard throttle at the bottom');

    for (const holdMs of HOLDS_MS) {
      // Right after a poll the page read: the poll held back, then Space.
      await js(`U.toasts.length = 0; U.keyAt.us = null; await U.afterPoll(() => { window.__pollHeld = ${holdMs > 0}; }); return 1;`);
      await space();
      r = await js(`
        const t0 = performance.now();
        while (U.keyAt.us === null && performance.now() - t0 < 5000) await U.wait(5);
        const keyUs = U.keyAt.us;
        const runs0 = window.__pollRuns || 0;
        // The poll held for ${holdMs} ms of sim time after the key.
        while (U.simUs() - keyUs < ${holdMs * 1000} && performance.now() - t0 < 30000) await U.wait(5);
        const pollsHeld = (window.__pollRuns || 0) - runs0;
        const releasedUs = U.simUs();
        const from = U.frames.length;
        window.__pollHeld = false;
        await U.wait(1500);
        const frames = U.frames.slice(from);
        const armedAt = frames.find((f) => f[1]);
        const offAfter = armedAt ? frames.find((f) => f[0] > armedAt[0] && !f[1]) : null;
        return JSON.stringify({
          keyUs, releasedUs, pollsHeld,
          armedMs: armedAt ? (armedAt[0] - keyUs) / 1000 : null,
          offMs: offAfter ? (offAfter[0] - keyUs) / 1000 : null,
          armed: !!U.s.coreState().armed, flags: U.s.coreState().armingDisableFlags,
          toasts: U.toasts.slice(), frameMs: frames.length > 1 ? +((frames[frames.length - 1][0] - frames[0][0]) / 1000 / (frames.length - 1)).toFixed(1) : null,
        });`);
      console.log(`Space, the poll held ${holdMs} ms: ${r.armedMs === null ? 'never armed' : 'armed ' + r.armedMs + ' ms after the key'}${r.offMs === null ? '' : ', disarmed ' + r.offMs + ' ms after it'}; toasts ${JSON.stringify(r.toasts)} (polls run while held ${r.pollsHeld}, released ${(r.releasedUs - r.keyUs) / 1000} ms after the key, frames ${r.frameMs} ms)`);
      assert.notEqual(r.keyUs, null, 'the page saw Space');
      if (holdMs > 0) {
        assert.equal(r.pollsHeld, 0, `${holdMs} ms: no poll while held`);
        assert.ok(r.releasedUs - r.keyUs >= Math.max(holdMs, WATCH_MS) * 1000, `${holdMs} ms: the switch reached Betaflight past the page's ${WATCH_MS} ms`);
      }
      assert.ok(!r.toasts.some((x) => /NOT ARMED/.test(x)), `${holdMs} ms: no NOT ARMED (${JSON.stringify(r.toasts)})`);
      assert.notEqual(r.armedMs, null, `${holdMs} ms: Space arms (flags ${r.flags})`);
      assert.ok(r.armedMs >= holdMs, `${holdMs} ms: on the poll that carried the switch (${r.armedMs} ms after the key)`);
      assert.equal(r.offMs, null, `${holdMs} ms: and stays armed (disarmed ${r.offMs} ms after the key)`);
      assert.equal(r.armed, true, `${holdMs} ms: armed 1.5 s after the poll`);
      assert.ok(r.toasts.includes('ARMED'), `${holdMs} ms: ARMED (${JSON.stringify(r.toasts)})`);
      assert.ok(!r.toasts.includes('DISARMED'), `${holdMs} ms: no DISARMED (${JSON.stringify(r.toasts)})`);

      // Space again disarms, for the next hold.
      await space();
      r = await js(`
        const t0 = performance.now();
        while (performance.now() - t0 < 5000 && (U.s.coreState().armed || U.s.bfCore().aux.arm)) await U.wait(20);
        await U.wait(600);
        return JSON.stringify({ armed: !!U.s.coreState().armed, flags: U.s.coreState().armingDisableFlags });`);
      assert.equal(r.armed, false, 'Space again: disarmed');
      assert.equal(r.flags, 0, 'ready to arm again');
    }
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    if (child) {
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
    }
    for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
    server.close();
  }
});
