// Input-timed things take their time at any frame rate: the page counts the
// real time between its input polls, not a share of each poll.
//   - In node: the switch wizard says when it takes a step, with the next
//     step's prompt (stepSwitchWizard advanced, label).
//   - In headless Chrome, the bf core, the page's 4 ms input poll made sparse
//     (every 60 or 120 ms, as on a main thread busy with slow frames; the
//     wrapper runs the page's own pollInput, only less often):
//       Easy mode's 1 s throttle-down hold is done 1 s after it starts, give
//       or take one poll gap; the keyboard throttle goes from 0 to full in its
//       0.71 s; the switch wizard takes a flipped switch 120 ms after it first
//       sees it, and draws the next step's prompt with that step.
//     With a 50 ms cap on each poll's time (the page before this test), the
//     hold took 1.2 s at 60 ms gaps and 2.4 s at 120 ms gaps.
//   Times are wall time, read right after each poll by a hook on the poll
//   itself; with frames under 250 ms the page's input time is wall time. The
//   limits allow one gap between the polls the page read (it drops polls
//   while its frames are slow), measured while each thing ran.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SWITCH_WIZARD_STEPS, createSwitchWizard, stepSwitchWizard } from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
// Roll, pitch, throttle (axis 2: -1 at the bottom), yaw, AUX1..AUX4.
const REST = [0, 0, -1, 0, 1, -1, 1, -1];
const HOLD_MS = 1000;            // sim-3d.js EASY_ARM_HOLD_S
const RAMP_MS = 1000 / 1.4;      // sim.html readInput: kbThrottle += 1.4 * dt
const WIZARD_MS = 120;           // sim-touch.js WIZARD_HOLD_S
const SLACK_MS = 30;             // timer jitter around a poll gap

test('the switch wizard says when it takes a step, with the next step\'s prompt', () => {
  const pad = (axes) => ({ axes, buttons: [] });
  const map = { r: { i: 0 }, p: { i: 1 }, t: { i: 2 }, y: { i: 3 } };
  const w = createSwitchWizard(pad(REST));
  const flipped = REST.map((a, i) => (i === 7 ? 1 : a));
  let out = stepSwitchWizard(w, pad(flipped), map, 0.004);
  assert.equal(out.advanced, undefined, 'first seen: not yet');
  assert.equal(out.label, SWITCH_WIZARD_STEPS[0].label);
  out = stepSwitchWizard(w, pad(flipped), map, 0.13);
  assert.equal(out.advanced, true, 'held 130 ms: taken');
  assert.equal(w.step, 1);
  assert.equal(out.label, SWITCH_WIZARD_STEPS[1].label, 'the prompt is the next step\'s');
  assert.equal(out.skippable, true, 'and its skip');
  assert.equal(out.done, false);
});

test('the page counts a poll\'s whole gap', () => {
  const html = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(html, /const POLL_DT_MAX_S=0\.25;/);
  assert.match(html, /const dt=\(lastPollUs===null\|\|tUs<lastPollUs\)\?0:Math\.min\(POLL_DT_MAX_S,\(tUs-lastPollUs\)\/1e6\);/);
  assert.match(html, /const dt=firstFlightAt===null\?0:Math\.min\(POLL_DT_MAX_S,\(nowMs-firstFlightAt\)\/1000\);/);
  assert.match(html, /if\(out\.done\|\|out\.advanced\|\|nowMs-calibDrawAt>60\)\{/);
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

// Before the page's scripts: a virtual pad (window.__pads), and the page's own
// input poll wrapped. window.__pollGapMs: the poll runs at most that often (0:
// every 4 ms, as the page sets it). window.__afterPoll: functions run right
// after each poll, with whether the page accepted it, dropped once one returns
// true. A poll the input clock drops (its stamp too far ahead of slow frames)
// returns before readInput, whose first act is navigator.getGamepads(): so a
// poll that called getGamepads is one the page read.
const BEFORE = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, id: '', axes: [] };
  const make = () => ({ id: pads.id, index: 0, mapping: '', connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      window.__gpCalls = (window.__gpCalls || 0) + 1;
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on ? make() : null, null, null, null];
    },
  });
  window.__pollGapMs = 0;
  window.__afterPoll = [];
  const si = window.setInterval;
  window.setInterval = function (fn, ms, ...rest) {
    if (typeof fn !== 'function' || fn.name !== 'pollInput') return si.call(window, fn, ms, ...rest);
    window.__pollWrapped = true;
    let last = -Infinity;
    return si.call(window, function () {
      const now = performance.now();
      if (now - last < window.__pollGapMs) return;
      last = now;
      const calls = window.__gpCalls || 0;
      fn.apply(this, arguments);
      const read = (window.__gpCalls || 0) > calls;
      const after = window.__afterPoll;
      for (let i = after.length - 1; i >= 0; i--) {
        let done = true;
        try { done = after[i](now, read); } catch (e) { /* drop it */ }
        if (done) after.splice(i, 1);
      }
    }, ms, ...rest);
  };
})()`;

const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // The time of the first poll after which fn() holds, or null after ms.
  const when = (fn, ms) => new Promise((res) => {
    let settled = false;
    const tm = setTimeout(() => { if (!settled) { settled = true; res(null); } }, ms);
    window.__afterPoll.push((t) => {
      if (settled) return true;
      let ok = false;
      try { ok = !!fn(); } catch (e) { /* not yet */ }
      if (ok) { settled = true; clearTimeout(tm); res(performance.now()); }
      return ok;
    });
  });
  // Run fn right after the next poll the page reads; resolves with that time.
  const afterPoll = (fn) => new Promise((res) => { window.__afterPoll.push((t, read) => { if (!read) return false; fn(); res(performance.now()); return true; }); });
  // The gaps between the polls the page read while a measurement runs.
  const gaps = () => {
    const out = []; let last = null, on = true, dropped = 0;
    window.__afterPoll.push((t, read) => {
      if (!on) return true;
      if (!read) { dropped++; return false; }
      const now = performance.now(); if (last !== null) out.push(now - last); last = now; return false;
    });
    return () => { on = false; const b = out.slice().sort((x, y) => x - y); return { n: out.length, dropped, median: b.length ? +b[b.length >> 1].toFixed(1) : null, max: b.length ? +b[b.length - 1].toFixed(1) : null }; };
  };
  const keyAt = {};
  addEventListener('keydown', (e) => { if (!e.repeat) keyAt[e.key.toLowerCase()] = performance.now(); }, true);
  const thr = () => window._axis().stick.t;
  const open = () => ({ prompt: !!(window._feel && window._feel.promptOpen), menu: !!(s.looks && s.looks.menuOpen) });
  window.__u = { s, wait, when, afterPoll, gaps, keyAt, thr, open };
  return true;
})()`;

test('input-timed things in Chrome take their time with sparse input polls', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;

  async function pass(query, seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-input-time-'));
    const child = spawn(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=480,270',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
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
      await send('Page.addScriptToEvaluateOnNewDocument', { source: BEFORE });
      await send('Page.navigate', { url: `${origin}/robots.txt` });
      for (let i = 0; i < 50; i++) { await sleep(100); try { if (await evaluate(`location.origin === ${JSON.stringify(origin)}`)) break; } catch (e) { /* loading */ } }
      await evaluate(`(() => {
        localStorage.clear();
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pad || { on: false, id: '', axes: [] })}));
        return true;
      })()`);
      await send('Page.navigate', { url: `${origin}/sim.html?quality=low&map=rig${query ? '&' + query : ''}` });
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(250);
        try { ready = await evaluate(`!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
      }
      assert.ok(ready, 'the bf core flies');
      assert.equal(await evaluate('window.__pollWrapped === true'), true, 'the page\'s input poll is pollInput, wrapped');
      await evaluate(PAGE);
      const js = async (body) => { const v = await evaluate(`(async () => { const U = window.__u; ${body} })()`); return typeof v === 'string' && /^[[{]/.test(v) ? JSON.parse(v) : v; };
      const key = (down, k, code, vk) => send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      await flow({ js, key });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
    }
  }

  const GAPS = [0, 60, 120];
  // Counted on real time, a thing started right after a poll is done at the
  // first poll after its nominal time: at most one gap (the longest measured
  // while it ran) late. Counted on a 50 ms share of each poll, it took
  // nominal x gap / 50.
  const atMost = (nominal, gaps) => Math.round(nominal + gaps.max + SLACK_MS);

  try {
    await t.test('the keyboard: Easy mode\'s 1 s hold, and the throttle from 0 to full', async () => {
      await pass('', {}, async ({ js, key }) => {
        let r = await js(`
          for (let i = 0; i < 20 && (U.open().prompt || U.open().menu); i++) {
            if (U.open().prompt) window._feel.hideFirstRun();
            const rig = document.querySelector('#menuLayer.show [data-fly-map="rig"]');
            if (rig) rig.click();
            else if (U.open().menu) { const f = document.getElementById('menuFly'); if (f) f.click(); }
            await U.wait(200);
          }
          return JSON.stringify({ open: U.open(), easy: U.s.easy().mode });`);
        assert.deepEqual(r.open, { prompt: false, menu: false }, 'no menu: the poll runs');
        assert.equal(r.easy, true, 'Easy mode');
        for (const g of GAPS) {
          // The hold: the throttle at the bottom and the page's count from 0,
          // right after a poll; done at the first poll that has counted 1 s.
          r = await js(`
            window.__pollGapMs = ${g};
            await U.wait(300);
            const stop = U.gaps();
            const t0 = await U.afterPoll(() => { U.s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); U.s.easy().arm.lowS = 0; });
            const t1 = await U.when(() => (+U.s.easy().arm.lowS || 0) >= 1 - 1e-9, 15000);
            const gaps = stop();
            // Then raised: armed, which is what the hold is for.
            U.s.setTestStick({ r: 0, p: 0, y: 0, t: 0.5 });
            const armed = await U.when(() => U.s.coreState().armed, 5000);
            U.s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
            await U.wait(200);
            U.s.setTestStick(null);
            return JSON.stringify({ ms: t1 === null ? null : t1 - t0, gaps, armed: armed !== null });`);
          console.log(`hold, polls ${g || 4} ms apart: ${r.ms === null ? 'never' : Math.round(r.ms) + ' ms'} (gaps ${JSON.stringify(r.gaps)})`);
          assert.notEqual(r.ms, null, `${g} ms gaps: the hold is counted`);
          assert.ok(r.gaps.median >= g, `${g} ms gaps: the polls were that far apart (${JSON.stringify(r.gaps)})`);
          assert.ok(r.ms >= HOLD_MS - SLACK_MS, `${g} ms gaps: the hold is not short (${Math.round(r.ms)} ms)`);
          assert.ok(r.ms <= atMost(HOLD_MS, r.gaps), `${g} ms gaps: the 1 s hold takes 1 s and at most one poll more (${Math.round(r.ms)} ms, at most ${atMost(HOLD_MS, r.gaps)})`);
          assert.equal(r.armed, true, `${g} ms gaps: raised after it, armed`);

          // The keyboard ramp: S to zero, then W from zero until full.
          await key(true, 's', 'KeyS', 83);
          r = await js(`return await U.when(() => U.thr() <= 0, 15000) !== null;`);
          await key(false, 's', 'KeyS', 83);
          assert.equal(r, true, 'S takes the throttle to zero');
          await js(`await U.wait(200); return 1;`);
          const full = js(`const stop = U.gaps(); const t1 = await U.when(() => U.thr() >= 0.999, 15000); return JSON.stringify({ t1, k: U.keyAt.w, gaps: stop() });`);
          await key(true, 'w', 'KeyW', 87);
          r = await full;
          await key(false, 'w', 'KeyW', 87);
          await key(true, 's', 'KeyS', 83);
          await js(`await U.when(() => U.thr() <= 0, 15000); return 1;`);
          await key(false, 's', 'KeyS', 83);
          const ms = r.t1 === null ? null : r.t1 - r.k;
          console.log(`ramp, polls ${g || 4} ms apart: ${ms === null ? 'never' : Math.round(ms) + ' ms'} (gaps ${JSON.stringify(r.gaps)})`);
          assert.notEqual(ms, null, `${g} ms gaps: W reaches full throttle`);
          assert.ok(r.gaps.median >= g, `${g} ms gaps: the polls were that far apart (${JSON.stringify(r.gaps)})`);
          // The first poll after the key counts its whole gap, part of it before the key.
          assert.ok(ms >= RAMP_MS - r.gaps.max - SLACK_MS, `${g} ms gaps: the ramp is not short (${Math.round(ms)} ms)`);
          assert.ok(ms <= atMost(RAMP_MS, r.gaps), `${g} ms gaps: 0 to full in 0.71 s and at most one poll more (${Math.round(ms)} ms, at most ${atMost(RAMP_MS, r.gaps)})`);
        }
        await js(`window.__pollGapMs = 0; return 1;`);
      });
    });

    await t.test('the switch wizard: a flip taken 120 ms after it is seen, the next prompt drawn with it', async () => {
      // A fresh page for each gap: the wizard from its first step, the arm
      // switch then the turtle switch.
      for (const g of GAPS) {
        await pass('', { pad: { on: true, id: TX, axes: REST.slice() } }, async ({ js }) => {
          let r = await js(`
            const cb = document.querySelector('#panel .cb-radio-switches');
            cb.click();
            const open = await U.when(() => U.s.easy().wizard && U.s.easy().wizard.step === 0 && /FLIP YOUR ARM SWITCH/.test(document.getElementById('calibStep').textContent), 10000);
            return JSON.stringify({ open: open !== null });`);
          assert.equal(r.open, true, 'the wizard opens on the arm switch');
          for (const [step, axis, to, next] of [[0, 7, 1, /FLIP YOUR TURTLE SWITCH/], [1, 4, -1, /FLIP YOUR ANGLE SWITCH/]]) {
            // The flip right after a poll: the next poll, one gap later, sees
            // it; the step is taken once 120 ms are counted from there.
            r = await js(`
              window.__pollGapMs = ${g};
              await U.wait(300);
              const stop = U.gaps();
              const t0 = await U.afterPoll(() => { window.__pads.axes[${axis}] = ${to}; });
              let text = null;
              const t1 = await U.when(() => {
                const w = U.s.easy().wizard;
                if (!w || w.step !== ${step + 1}) return false;
                text = document.getElementById('calibStep').textContent;
                return true;
              }, 15000);
              return JSON.stringify({ ms: t1 === null ? null : t1 - t0, text, gaps: stop() });`);
            // Seen at the poll after the flip (one gap), taken at the first poll
            // after 120 ms more (at most one gap late).
            const limit = r.gaps.max === null ? 0 : r.gaps.max + atMost(WIZARD_MS, r.gaps);
            console.log(`wizard step ${step + 1}, polls ${g || 4} ms apart: ${r.ms === null ? 'never' : Math.round(r.ms) + ' ms'} from the flip, prompt "${r.text}" (gaps ${JSON.stringify(r.gaps)})`);
            assert.notEqual(r.ms, null, `${g} ms gaps: the flip is taken`);
            assert.ok(r.gaps.median >= g, `${g} ms gaps: the polls were that far apart (${JSON.stringify(r.gaps)})`);
            assert.ok(r.ms >= WIZARD_MS, `${g} ms gaps: not before it has held 120 ms (${Math.round(r.ms)} ms)`);
            assert.ok(r.ms <= limit, `${g} ms gaps: taken 120 ms after it is seen, and at most one poll more (${Math.round(r.ms)} ms, at most ${limit})`);
            assert.match(r.text, next, 'the next prompt is drawn on the poll that takes the step');
          }
        });
      }
    });
  } finally {
    server.close();
  }
});
