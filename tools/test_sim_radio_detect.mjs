// Radio detection and device picking in the page (headless Chrome, fresh
// profiles, navigator.getGamepads replaced before the page's scripts with up
// to four virtual devices):
//   - A headset (0 axes) remembered by mistake beside an EdgeTX radio that
//     reports no product name ("Unknown Gamepad (Vendor: 1209 Product:
//     4f54)"): the radio flies AETR, the headset is never offered and is no
//     longer remembered, and the bf core flies the radio rates default.
//   - An EdgeTX radio sending 3 axes, with two gamepads: the Classic-mode
//     message, the radio never offered or flown; Tune's device list changes
//     the remembered gamepad, and "forget this device" clears its choice,
//     calibration and preset.
//     A keyboard's gamepad interface (4 axes that never move) beside them is
//     not offered.
//   - A device nothing names, shaped like a radio: "Looks like a radio" with
//     the preset picker one tap away, and the calibration's axis list.
//   - That keyboard interface alone: it is taken at first, and passed over
//     once the keyboard flies (W) and its sticks still have not moved.
// The node parts (sim-touch.js) are in tools/test_sim_radio.mjs.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); SKIP_CHROME_BOOT=1 skips it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { GP_ID_KEY, AXIS_MAP_PREFIX, RADIO_PRESET_PREFIX, RADIO_CLASSIC_MSG, sanitizeId } from '../sim-touch.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const EDGETX = 'Unknown Gamepad (Vendor: 1209 Product: 4f54)';
const TX15_3AX = 'RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)';
const HEADSET = 'Jabra Evolve2 65 (Vendor: 0b0e Product: 0302)';
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const F310 = 'Logitech Gamepad F310 (STANDARD GAMEPAD Vendor: 046d Product: c21d)';
const SHAPED = 'USB Gamepad (Vendor: 0483 Product: 5750)';
const KB_PAD = 'Gaming Keyboard (Vendor: 1532 Product: 0257)';
const CLASSIC_REST = [0, 0, -1, 0, -1, -1, -1, -1];

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

// Before the page's scripts: navigator.getGamepads() with the devices in
// window.__pads (one per slot, null for an empty one), each {id, mapping,
// axes, buttons: count}. The test sets their axes, or empties a slot.
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || [];
  const make = (p, i) => p ? ({ id: p.id, index: i, mapping: p.mapping || '', connected: true, timestamp: performance.now(),
    axes: p.axes.slice(), buttons: Array.from({ length: p.buttons == null ? 24 : p.buttons }, () => ({ pressed: false, touched: false, value: 0 })) }) : null;
  // window.__emptyFor = { fn, n }: the next n calls made from a page function
  // named fn get an empty poll (all slots null), as Chrome sometimes gives
  // with the devices still plugged in.
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      const e = window.__emptyFor;
      if (e && e.n > 0 && String(new Error().stack).includes(e.fn)) { e.n--; return [null, null, null, null]; }
      return [make(pads[0], 0), make(pads[1], 1), make(pads[2], 2), make(pads[3], 3)];
    },
  });
  window.__plugEvent = (i) => { const ev = new Event('gamepadconnected'); ev.gamepad = make(pads[i], i); window.dispatchEvent(ev); };
})()`;

const PAGE = String.raw`(() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await wait(20); } return !!fn(); };
  const $ = (id) => document.getElementById(id);
  const toasts = [];
  new MutationObserver(() => { const t = $('toast').textContent; if (t && toasts[toasts.length - 1] !== t) toasts.push(t); }).observe($('toast'), { childList: true, characterData: true, subtree: true });
  const devices = () => Array.from($('radioDevice').options).map((o) => ({ value: o.value, text: o.textContent }));
  const pick = (id) => { const o = devices().find((d) => d.text.includes(id.slice(0, 40))); const sel = $('radioDevice'); sel.value = o ? o.value : ''; sel.dispatchEvent(new Event('change')); return !!o; };
  const info = () => $('radioInfo').textContent;
  window.__u = { wait, until, $, toasts, devices, pick, info, axis: () => window._axis().stick };
  return true;
})()`;

const pad = (id, axes, extra) => Object.assign({ id, mapping: '', axes: axes.slice(), buttons: 24 }, extra || {});
const stdPad = (id) => pad(id, [0, 0, 0, 0], { mapping: 'standard', buttons: 17 });

test('radio detection and device picking in Chrome: USB id, headset, Classic message, device list, forget, shaped like a radio', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;

  async function pass(query, seed, core, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-radiodetect-'));
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let ws = null;
    const errors = [];
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
      ws.addEventListener('message', (m) => {
        const o = JSON.parse(m.data);
        if (o.id && waiting.has(o.id)) { waiting.get(o.id)(o); waiting.delete(o.id); }
        if (o.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(o.params.exceptionDetails.exception || o.params.exceptionDetails.text).slice(0, 300));
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
      await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      await send('Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(`(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        // A pilot who has flown here before: no first-run prompt over the page.
        localStorage.setItem('quadmathSimInputChoice', 'radio');
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pads || [])}));
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
      const key = (down, k, code, vk) => send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      await flow({ js, key });
      assert.deepEqual(errors, [], 'no page errors');
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
    }
  }

  try {
    await t.test('a headset remembered by mistake beside an EdgeTX radio with no product name: the radio flies AETR, radio rates', async () => {
      await pass('map=rig', { storage: { [GP_ID_KEY]: HEADSET }, pads: [pad(HEADSET, [], { buttons: 4 }), pad(EDGETX, CLASSIC_REST)] }, 'bf', async ({ js }) => {
        // No product name: Tune's radio line, its device list and the plug
        // toast call it "EdgeTX radio", never "Unknown Gamepad (Vendor: …)".
        const shown = 'EdgeTX radio';
        let r = await js(`await U.until(() => U.info().startsWith(${JSON.stringify(shown)}), 6000);
          return JSON.stringify({ info: U.info(), remembered: localStorage.getItem(${JSON.stringify(GP_ID_KEY)}), devices: U.devices(),
            preset: U.$('radioPreset').value, kind: window._sim.stickOverlay().kind });`);
        assert.ok(r.info.includes(shown), 'the radio flies: ' + r.info);
        assert.equal(r.remembered, EDGETX, 'and replaces the remembered headset');
        assert.deepEqual(r.devices.map((d) => d.text.replace(/^\S+ /, '')), ['EdgeTX radio'], 'the headset is never offered; the radio by its display name');
        assert.ok(!r.info.includes('Unknown Gamepad'), r.info);
        assert.equal(r.preset, 'radiomaster', 'the EdgeTX AETR preset');
        assert.equal(r.kind, 'radio');
        r = await js(`const n = U.toasts.length; U.pick('EdgeTX radio');
          await U.until(() => U.toasts.slice(n).some((s) => s.startsWith('EdgeTX radio detected, Mode 2 loaded.')), 2000);
          return JSON.stringify({ toasts: U.toasts.slice(n) });`);
        assert.ok(r.toasts.some((s) => s.startsWith('EdgeTX radio detected, Mode 2 loaded.')), 'the plug toast: ' + JSON.stringify(r.toasts));
        // Throttle on ax2, resting at -1: low, then the safety gate opens and
        // mid-stick is half throttle (the AETR map, not a sprung gamepad's).
        r = await js(`
          await U.wait(600);
          const low = U.axis().t;
          window.__pads[1].axes[2] = 0;
          const half = await U.until(() => Math.abs(U.axis().t - 0.5) < 0.02, 4000);
          window.__pads[1].axes[2] = -1;
          const rates = await U.until(() => /the default for a radio/.test(U.$('ratesSourceBf').textContent), 10000);
          return JSON.stringify({ low, half, t: U.axis().t, rates, src: U.$('ratesSourceBf').textContent, osd: U.$('osdTR').textContent });`);
        console.log('edgetx: ' + JSON.stringify(r));
        assert.equal(r.low, 0, 'ax2 at -1 is throttle 0');
        assert.equal(r.half, true, 'ax2 at 0 is half throttle');
        assert.equal(r.rates, true, 'the radio rates default: ' + r.src);
        assert.match(r.src, /Cruise/);
        assert.match(r.osd, /RADIO/);
      });
    });

    await t.test('an EdgeTX radio sending 3 axes beside two gamepads: the Classic message; Tune changes and forgets the remembered device', async () => {
      const sidX = sanitizeId(XBOX);
      const storage = {
        [GP_ID_KEY]: XBOX,
        [RADIO_PRESET_PREFIX + sidX]: 'radiomaster',
        [AXIS_MAP_PREFIX + sidX]: JSON.stringify({ r: { i: 1, sign: 1 }, p: { i: 0, sign: 1 }, y: { i: 3, sign: 1 }, t: { i: 2, min: -1, max: 1 }, ver: 2 }),
        ryflyRates: '{"type":"BETAFLIGHT"}',
      };
      await pass('core=js&map=rig', { storage, pads: [pad(TX15_3AX, [0, 0, 0]), stdPad(XBOX), stdPad(F310), pad(KB_PAD, [0, 0, 0, 0], { buttons: 8 })] }, 'js', async ({ js }) => {
        let r = await js(`await U.until(() => U.info().includes('Xbox Wireless'), 6000);
          return JSON.stringify({ info: U.info(), devices: U.devices().map((d) => d.text) });`);
        assert.ok(r.info.includes('Xbox Wireless'), 'the remembered gamepad flies: ' + r.info);
        assert.ok(r.info.includes(RADIO_CLASSIC_MSG), "Tune's radio line says why the radio isn't flying: " + r.info);
        assert.equal(r.devices.length, 2, 'two devices offered: ' + JSON.stringify(r.devices));
        assert.ok(r.devices.every((d) => !d.includes('TX15')), 'the 3-axis radio is never offered');
        assert.ok(r.devices.every((d) => !d.includes('Gaming Keyboard')), 'nor the keyboard interface whose axes never moved');
        // Unplugged and plugged back in (with its event): the message is told
        // again, and the gamepad flying is not picked again over it.
        r = await js(`
          const tx = window.__pads[0];
          window.__pads[0] = null;
          await U.until(() => !U.info().includes('Classic'), 5000);
          window.__pads[0] = tx;
          const n = U.toasts.length;
          window.__plugEvent(0);
          const told = await U.until(() => U.toasts.slice(n).some((s) => s.includes("throttle isn't coming through")), 3000);
          await U.wait(300);
          return JSON.stringify({ told, after: U.toasts.slice(n), info: U.info() });`);
        assert.equal(r.told, true, 'the Classic message as a toast: ' + JSON.stringify(r.after));
        assert.ok(!r.after.includes('GAMEPAD SELECTED'), 'the gamepad flying is not selected again: ' + JSON.stringify(r.after));
        assert.ok(!r.info.includes('TX15'), 'the radio never flies');
        // An empty poll (Chrome gives them with the radio still plugged in)
        // neither clears the message nor tells it again.
        r = await js(`
          const n = U.toasts.length;
          window.__emptyFor = { fn: 'noteRadioIssue', n: 2 };
          await U.until(() => window.__emptyFor.n === 0, 3000);
          await U.wait(1200);
          return JSON.stringify({ again: U.toasts.slice(n).filter((s) => s.includes("throttle isn't coming through")).length, info: U.info() });`);
        assert.equal(r.again, 0, 'not told again after an empty poll');
        assert.ok(r.info.includes(RADIO_CLASSIC_MSG), 'and still in Tune’s radio line');
        // Change the remembered device in Tune.
        r = await js(`
          U.pick(${JSON.stringify(F310)});
          await U.until(() => U.info().includes('Logitech'), 2000);
          return JSON.stringify({ info: U.info(), remembered: localStorage.getItem(${JSON.stringify(GP_ID_KEY)}) });`);
        assert.ok(r.info.includes('Logitech Gamepad F310'), 'the picked device flies: ' + r.info);
        assert.equal(r.remembered, F310, 'and is remembered');
        // Back to the Xbox pad, then forget it.
        r = await js(`
          U.pick(${JSON.stringify(XBOX)});
          await U.until(() => U.info().includes('Xbox Wireless'), 2000);
          const before = { preset: localStorage.getItem(${JSON.stringify(RADIO_PRESET_PREFIX + sidX)}), remembered: localStorage.getItem(${JSON.stringify(GP_ID_KEY)}) };
          U.$('btnForgetDevice').click();
          await U.wait(300);
          return JSON.stringify({ before,
            remembered: localStorage.getItem(${JSON.stringify(GP_ID_KEY)}),
            preset: localStorage.getItem(${JSON.stringify(RADIO_PRESET_PREFIX + sidX)}),
            map: localStorage.getItem(${JSON.stringify(AXIS_MAP_PREFIX + sidX)}),
            rates: localStorage.getItem('ryflyRates'),
            picker: !!document.getElementById('gpPicker'),
            dropdown: U.$('radioPreset').value,
            info: U.info(), toasts: U.toasts.slice(-3) });`);
        console.log('forget: ' + JSON.stringify(r));
        assert.deepEqual(r.before, { preset: 'radiomaster', remembered: XBOX });
        assert.equal(r.remembered, null, 'the choice is forgotten');
        assert.equal(r.preset, null, 'its preset is forgotten');
        assert.equal(r.map, null, 'its calibration is forgotten');
        assert.equal(r.rates, '{"type":"BETAFLIGHT"}', 'nothing else');
        assert.equal(r.picker, false, 'no picker pops up over Tune');
        assert.equal(r.dropdown, 'auto', 'the preset picker shows it as never seen');
        assert.match(r.info, /spring pad/, 'a gamepad flies on the gamepad layout again: ' + r.info);
        assert.ok(r.toasts.some((s) => s.startsWith('FORGOTTEN')), JSON.stringify(r.toasts));
      });
    });

    await t.test('a device nothing names, shaped like a radio: AETR Mode 2, the preset picker one tap away, the calibration axis list', async () => {
      await pass('core=js&map=rig', { pads: [pad(SHAPED, [0, 0, -1, 0, -1, -1, 1, -1], { buttons: 16 })] }, 'js', async ({ js }) => {
        let r = await js(`await U.until(() => U.info().includes('USB Gamepad'), 6000);
          U.pick(${JSON.stringify(SHAPED)});
          const said = await U.until(() => U.toasts.some((s) => s.startsWith('Looks like a radio: flying it AETR, Mode 2.')), 2000);
          const btn = document.getElementById('toastPreset');
          if (btn) btn.click();
          await U.wait(100);
          return JSON.stringify({ said, btn: !!btn, open: U.$('panel').classList.contains('open'), focus: document.activeElement && document.activeElement.id,
            preset: U.$('radioPreset').value, toasts: U.toasts });`);
        assert.equal(r.said, true, JSON.stringify(r.toasts));
        assert.equal(r.btn, true, 'a Change preset button');
        assert.equal(r.open, true, 'Tune opens');
        assert.equal(r.focus, 'radioPreset', 'at the preset picker');
        assert.equal(r.preset, 'aetr');
        // Calibration: after CENTER, the axis list; tapping ax0 takes roll.
        r = await js(`
          U.$('panel').classList.remove('open');
          U.$('btnCalib').click();
          const listed = await U.until(() => U.$('calibPick').querySelectorAll('button').length === 8, 3000);
          const label = U.$('calibStep').textContent;
          U.$('calibPick').querySelector('button[data-ax="0"]').click();
          await U.until(() => /PITCH/.test(U.$('calibStep').textContent), 1000);
          const next = U.$('calibStep').textContent;
          U.$('calibCancel').click();
          return JSON.stringify({ listed, label, next, n: U.$('calibPick').querySelectorAll('button').length });`);
        assert.equal(r.listed, true, 'every axis listed');
        assert.match(r.label, /ROLL/);
        assert.match(r.next, /PITCH/, 'the tap took roll');
      });
    });
    await t.test('the Classic message is the toast left showing: found on a poll with a gamepad, and with a gamepad plugged just after', async () => {
      await pass('core=js&map=rig', { pads: [] }, 'js', async ({ js }) => {
        const shown = `(() => { const el = U.$('toast'); return el.style.opacity === '1' && el.textContent.includes("throttle isn't coming through"); })()`;
        // Both appear with no event (the page's own 500 ms look finds them).
        let r = await js(`
          window.__pads[0] = { id: ${JSON.stringify(TX15_3AX)}, mapping: '', axes: [0, 0, 0], buttons: 24 };
          window.__pads[1] = { id: ${JSON.stringify(XBOX)}, mapping: 'standard', axes: [0, 0, 0, 0], buttons: 17 };
          await U.until(() => U.info().includes('Xbox Wireless'), 3000);
          await U.wait(300);
          return JSON.stringify({ shown: ${shown}, toast: U.$('toast').textContent, toasts: U.toasts });`);
        assert.equal(r.shown, true, 'the message, not GAMEPAD SELECTED: ' + JSON.stringify(r.toasts));
        // Both gone, then the radio plugged in, and the gamepad 200 ms later.
        r = await js(`
          window.__pads[0] = null; window.__pads[1] = null;
          await U.until(() => /no gamepad/.test(U.info()) && !U.info().includes('Classic'), 5000);
          window.__pads[0] = { id: ${JSON.stringify(TX15_3AX)}, mapping: '', axes: [0, 0, 0], buttons: 24 };
          window.__plugEvent(0);
          await U.wait(200);
          window.__pads[1] = { id: ${JSON.stringify(XBOX)}, mapping: 'standard', axes: [0, 0, 0, 0], buttons: 17 };
          window.__plugEvent(1);
          await U.wait(300);
          return JSON.stringify({ shown: ${shown}, toast: U.$('toast').textContent, info: U.info() });`);
        assert.equal(r.shown, true, 'told again over the pick: ' + r.toast);
        assert.ok(r.info.includes('Xbox Wireless'), 'the gamepad flies');
      });
    });

    await t.test('a headset waking while a radio flies: the radio keeps the sticks, the throttle is not cut', async () => {
      await pass('core=js&map=rig', { pads: [pad('RM TX16S Joystick (Vendor: 1209 Product: 4f54)', CLASSIC_REST)] }, 'js', async ({ js }) => {
        const r = await js(`
          await U.until(() => U.info().includes('TX16S'), 6000);
          // Throttle low, then half: auto-arm, flying.
          await U.wait(800);
          window.__pads[0].axes[2] = 0;
          const flying = await U.until(() => window._sim.coreState().armed && U.axis().t > 0.45, 5000);
          const t0 = U.axis().t;
          window.__pads[1] = { id: ${JSON.stringify(HEADSET)}, mapping: '', axes: [], buttons: 4 };
          window.__plugEvent(1);
          let lowest = 1;
          const t1 = performance.now();
          while (performance.now() - t1 < 800) { lowest = Math.min(lowest, U.axis().t); await U.wait(4); }
          const out = { flying, t0, lowest, armed: !!window._sim.coreState().armed, info: U.info(), toasts: U.toasts.slice(-3) };
          window.__pads[0].axes[2] = -1;
          return JSON.stringify(out);`);
        console.log('headset mid-flight: ' + JSON.stringify(r));
        assert.equal(r.flying, true, 'armed and flying first');
        assert.ok(r.lowest > 0.45, 'the throttle is never cut: lowest ' + r.lowest);
        assert.equal(r.armed, true, 'still armed');
        assert.ok(r.info.includes('TX16S'), 'the radio still flies');
      });
    });

    await t.test('a keyboard gamepad interface alone: taken at first, passed over once the keyboard flies and it has not moved', async () => {
      await pass('core=js&map=rig', { pads: [pad(KB_PAD, [0, 0, 0, 0], { buttons: 8 })] }, 'js', async ({ js, key }) => {
        let r = await js(`await U.until(() => U.info().includes('Gaming Keyboard'), 6000); return JSON.stringify({ info: U.info() });`);
        assert.ok(r.info.includes('Gaming Keyboard'), 'alone, it may be the pilot’s: ' + r.info);
        await key(true, 'w', 'KeyW', 87);
        r = await js(`const gone = await U.until(() => /no gamepad/.test(U.info()), 3000);
          return JSON.stringify({ gone, info: U.info(), toasts: U.toasts, t: U.axis().t });`);
        await key(false, 'w', 'KeyW', 87);
        console.log('keyboard interface: ' + JSON.stringify(r));
        assert.equal(r.gone, true, 'passed over: ' + r.info);
        assert.ok(r.toasts.some((s) => s.startsWith('NOT A CONTROLLER')), JSON.stringify(r.toasts));
        assert.ok(r.t > 0, 'and W flies the keyboard: t ' + r.t);
        r = await js(`await U.wait(1200); return JSON.stringify({ info: U.info() });`);
        assert.match(r.info, /no gamepad/, 'not taken again while it has not moved');
        r = await js(`window.__pads[0].axes[0] = 0.6; const back = await U.until(() => U.info().includes('Gaming Keyboard'), 3000); return JSON.stringify({ back, info: U.info() });`);
        assert.equal(r.back, true, 'once its sticks move it is offered again: ' + r.info);
      });
    });
  } finally {
    server.close();
  }
});
