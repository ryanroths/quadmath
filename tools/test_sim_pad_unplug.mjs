// A radio unplugged in flight: the page drops it at once and flies the
// keyboard (or touch), with nothing the radio last sent left behind;
// plugged back in, the radio has the sticks again.
//   - In node: a remembered "radio" input with no radio connected does not
//     keep touch off on a phone (shouldEnableTouch).
//   - In headless Chrome, fresh profiles, a virtual TX16S (navigator.getGamepads
//     replaced before the page's scripts) left at mid-stick:
//       unplugged with gamepaddisconnected; unplugged with Chrome still
//       listing it as disconnected (frozen at mid); gone with no event at all.
//       Each time: Space arms (never "STICKS NOT SAFE") and W climbs, on the
//       Betaflight core and the js core. Plugged back in, with or without an
//       event, the radio has the sticks again.
//     A profile that remembers "radio" with no radio there: Space and W fly.
//     A phone on touch sticks: a radio plugged in has the sticks; unplugged,
//     touch has them again: its ARM button arms and its throttle climbs.
//   The waits are on what the page does (armed, height, readouts), with
//   generous caps, not on fixed wall times.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { shouldEnableTouch } from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
// Roll, pitch, throttle (axis 2: -1 bottom, 0 mid-stick), yaw, AUX1..AUX4.
const MID = [0, 0, 0, 0, -1, -1, -1, -1];

test('a remembered radio with none connected is not a pad: touch on a phone, keyboard elsewhere', () => {
  assert.equal(shouldEnableTouch({ inputChoice: 'radio', mobile: true }), true);
  assert.equal(shouldEnableTouch({ inputChoice: 'radio', mobile: false }), false);
  assert.equal(shouldEnableTouch({ inputChoice: 'radio', mobile: true, gamepadConnected: true }), false, 'a connected radio still wins');
  assert.equal(shouldEnableTouch({ inputChoice: 'radio', mobile: true, padLive: true }), false);
  assert.equal(shouldEnableTouch({ inputChoice: 'keyboard', mobile: true }), false, 'a chosen keyboard stays the keyboard');
  assert.equal(shouldEnableTouch({ inputChoice: 'touch', mobile: false }), true);
});

test('the page drops a missing pad and clears what it sent', () => {
  const html = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(html, /if\(gp&&gp\.connected!==false&&!padRecentlyGone\(gp\)\)out\.push\(gp\);/, 'a pad reported disconnected is not listed');
  assert.match(html, /const PAD_GONE_MS=500, PAD_REPICK_MS=3000;/);
  assert.match(html, /else if\(performance\.now\(\)-padMissingSince>=PAD_GONE_MS\)dropPad\('CONTROLLER GONE'\);/, 'missing for PAD_GONE_MS: dropped, event or not');
  const drop = html.slice(html.indexOf('function dropPad('), html.indexOf('function pickGamepad('));
  for (const s of ['stick.r=stick.p=stick.y=0;stick.aux=null;', 'kbThrottle=threeD?0.5:0;stick.t=kbThrottle;', 'armGate=false;', 'padLive=false;pollGp=null;',
    'armSwState={prev:null};armSwitchBlocked=false;', 'easyArmState={};turtleStickHold=false;', 'if(switchWiz)endSwitchWizard();', 'bootTouchLayer();']) {
    assert.ok(drop.includes(s), 'dropPad clears: ' + s);
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

// Before the page's scripts: navigator.getGamepads() with one virtual pad.
// on: listed; stale: still listed but connected:false, its last values
// frozen (as some browsers report an unplugged pad); window.__pads to drive it.
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, stale: false, id: '', axes: [] };
  const make = () => ({ id: pads.id, index: 0, mapping: '', connected: !pads.stale, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on || pads.stale ? make() : null, null, null, null];
    },
  });
  // Plug and unplug, as a browser reports them.
  window.__plug = (event) => {
    pads.on = true; pads.stale = false;
    if (event) { const e = new Event('gamepadconnected'); e.gamepad = make(); window.dispatchEvent(e); }
  };
  window.__unplug = (how) => {
    const g = make();
    pads.on = false; pads.stale = how === 'stale';
    if (how !== 'silent') { const e = new Event('gamepaddisconnected'); g.connected = false; e.gamepad = g; window.dispatchEvent(e); }
  };
})()`;

const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await wait(20); } return !!fn(); };
  const $ = (id) => document.getElementById(id);
  const state = () => { const c = s.coreState(); return { armed: !!c.armed, z: +(+c.position.z).toFixed(2), flags: c.armingDisableFlags || 0 }; };
  const radio = () => !/no gamepad/.test($('radioInfo').textContent);
  const toasts = [];
  new MutationObserver(() => { const t = $('toast').textContent; if (t && toasts[toasts.length - 1] !== t) toasts.push(t); }).observe($('toast'), { childList: true, characterData: true, subtree: true });
  window.__u = { s, wait, until, $, state, radio, toasts, axis: () => window._axis().stick };
  return true;
})()`;

test('a radio unplugged in Chrome: the keyboard or touch at once, nothing left behind; plugged back in, the radio', { timeout: 12 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;

  async function pass(query, seed, core, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-unplug-'));
    const child = spawn(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
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
      await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      if (seed.phone) {
        // A phone: its user agent and touch points (sim-touch.js detectMobile).
        await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36' });
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      }
      await send('Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(`(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pad || { on: false, stale: false, id: '', axes: [] })}));
        return true;
      })()`);
      await send('Page.navigate', { url: `${origin}/sim.html?quality=low${query ? '&' + query : ''}` });
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(250);
        try { ready = await evaluate(`!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
      }
      assert.ok(ready, `the ${core} core flies`);
      await evaluate(PAGE);
      const js = async (body) => { const v = await evaluate(`(async () => { const U = window.__u; ${body} })()`); return typeof v === 'string' && /^[[{]/.test(v) ? JSON.parse(v) : v; };
      const key = async (k, code, vk) => {
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      };
      const hold = (down, k, code, vk) => send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      // Space until armed (Betaflight wants a moment after a pause), then W until it climbs.
      const keyboardFlies = async (label) => {
        let armed = false;
        for (let i = 0; i < 8 && !armed; i++) {
          await key(' ', 'Space', 32);
          armed = await js(`return await U.until(() => U.state().armed, 1500);`);
        }
        const toasts = await js(`return JSON.stringify(U.toasts);`);
        assert.ok(!toasts.includes('STICKS NOT SAFE'), label + ': never "STICKS NOT SAFE": ' + toasts.join(' | '));
        assert.equal(armed, true, label + ': Space arms (' + JSON.stringify(await js(`return JSON.stringify(U.state());`)) + ')');
        await hold(true, 'w', 'KeyW', 87);
        const up = await js(`return JSON.stringify({ climbed: await U.until(() => U.state().z > 0.3, 8000), state: U.state(), axis: U.axis() });`);
        await hold(false, 'w', 'KeyW', 87);
        assert.equal(up.climbed, true, label + ': W climbs: ' + JSON.stringify(up));
        // Back down, disarmed, for what follows.
        await hold(true, 's', 'KeyS', 83);
        await js(`await U.until(() => U.axis().t < 0.02, 4000); return 1;`);
        await hold(false, 's', 'KeyS', 83);
        await key(' ', 'Space', 32);
        await js(`await U.until(() => !U.state().armed, 3000); return 1;`);
        return up;
      };
      await flow({ js, key, hold, keyboardFlies });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
    }
  }

  const radio = { on: true, stale: false, id: TX, axes: MID.slice() };

  try {
    for (const core of ['bf', 'js']) {
      for (const how of ['event', 'stale', 'silent']) {
        const name = { event: 'unplugged (gamepaddisconnected)', stale: 'unplugged, still listed as disconnected at mid-stick', silent: 'gone with no event' }[how];
        await t.test(`${core} core, the radio at mid-stick, ${name}: Space arms, W climbs; plugged back in, the radio`, async () => {
          await pass(core === 'js' ? 'core=js&map=rig' : 'map=rig', { pad: radio }, core, async ({ js, keyboardFlies }) => {
            let r = await js(`await U.until(() => U.radio(), 4000); return JSON.stringify({ radio: U.radio(), info: U.$('radioInfo').textContent.slice(0, 40), axis: U.axis() });`);
            assert.equal(r.radio, true, 'the radio has the sticks: ' + r.info);
            assert.equal(r.axis.t, 0, 'held at zero by the safety gate: the stick is at mid, never seen low');
            r = await js(`
              const t0 = performance.now();
              window.__unplug(${JSON.stringify(how)});
              const gone = await U.until(() => !U.radio(), 3000);
              return JSON.stringify({ gone, ms: Math.round(performance.now() - t0), toasts: U.toasts.slice(-2), axis: U.axis() });`);
            console.log(`${core} ${how}: dropped in ${r.ms} ms, ${JSON.stringify(r.toasts)}`);
            assert.equal(r.gone, true, 'the radio is dropped');
            if (how === 'silent') assert.ok(r.ms >= 400, 'not on a single empty poll (' + r.ms + ' ms)');
            else assert.ok(r.ms < 300, 'at once (' + r.ms + ' ms)');
            assert.deepEqual([r.axis.r, r.axis.p, r.axis.y, r.axis.t], [0, 0, 0, 0], 'nothing the radio sent is left');
            const up = await keyboardFlies(`${core} ${how}`);
            console.log(`  ${core} ${how}: keyboard climbed to ${up.state.z} m`);
            // Plugged back in (with the event, or found by the page's own look
            // once PAD_REPICK_MS have passed): the radio again, gated until low.
            r = await js(`
              window.__pads.axes[2] = -1;
              window.__plug(${how !== 'silent'});
              const back = await U.until(() => U.radio(), 6000);
              // The safety gate opens once the page has seen the sticks low.
              await U.wait(500);
              window.__pads.axes[2] = -0.2;
              const follows = await U.until(() => Math.abs(U.axis().t - 0.4) < 0.02, 3000);
              return JSON.stringify({ back, follows, axis: U.axis() });`);
            assert.equal(r.back, true, 'plugged back in, the radio has the sticks');
            assert.equal(r.follows, true, 'and its throttle drives the quad: ' + JSON.stringify(r.axis));
          });
        });
      }
    }

    await t.test('a profile that remembers "radio", with no radio there: Space arms, W climbs', async () => {
      await pass('map=rig', { storage: { quadmathSimInputChoice: 'radio' } }, 'bf', async ({ js, keyboardFlies }) => {
        const r = await js(`return JSON.stringify({ radio: U.radio(), prompt: !!(window._feel && window._feel.promptOpen), touch: document.body.classList.contains('touch-on') });`);
        assert.deepEqual(r, { radio: false, prompt: false, touch: false });
        await keyboardFlies('remembered radio');
      });
    });

    await t.test('a phone on touch sticks: a radio plugged in has the sticks; unplugged, touch has them again, arms and climbs', async () => {
      await pass('core=js&map=rig', { pad: radio, phone: true, storage: { quadmathSimInputChoice: 'touch' } }, 'js', async ({ js }) => {
        let r = await js(`await U.until(() => U.radio(), 4000); return JSON.stringify({ radio: U.radio(), touch: document.body.classList.contains('touch-on') });`);
        assert.deepEqual(r, { radio: true, touch: false }, 'the radio wins over touch while it is there');
        r = await js(`
          const stick = { r: 0, p: 0, y: 0, t: 0 };
          window._touch.read = () => ({ ...stick });
          window.__unplug('event');
          const touch = await U.until(() => document.body.classList.contains('touch-on') && !U.radio(), 3000);
          // The touch pilot's ARM button, throttle down; then the throttle up.
          await U.until(() => U.axis().t === 0, 1000);
          U.$('touchArm').click();
          const armed = await U.until(() => U.state().armed, 6000);
          stick.t = 0.75;
          const climbed = await U.until(() => U.state().z > 0.3, 8000);
          stick.t = 0;
          return JSON.stringify({ touch, armed, climbed, state: U.state(), axis: U.axis(), toasts: U.toasts.slice(-3) });`);
        console.log('touch: ' + JSON.stringify(r));
        assert.equal(r.touch, true, 'touch sticks are back on');
        assert.ok(!r.toasts.includes('STICKS NOT SAFE'));
        assert.equal(r.armed, true, 'touch ARM arms: ' + JSON.stringify(r));
        assert.equal(r.climbed, true, 'and climbs');
      });
    });
  } finally {
    server.close();
  }
});
