// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Headless Chrome: Tune's Rates on the bf core (sim.html bfSetRates,
// bfApplyRates, importCliToBf opts.rates). Every check reads the rates back
// from Betaflight itself (the flying core's sim.get), not from the page:
//   - nothing saved: Cruise flies, the toast says so once, nothing is saved;
//   - each preset reads back from the core as set, and is saved;
//   - a slider goes to the core on release (roll and pitch linked, then
//     not), and reads back;
//   - an IMPORT CLI paste with rate lines flies its own and the sliders show
//     them; a slider after it goes on top; a paste wins on its class through
//     class changes;
//   - the saved rates fly after a reload and on the other bf class; the 85
//     (js core) shows its own rates UI;
//   - the default and its toast only with nothing saved;
//   - ?preset= and ?rates= links fly on bf for the session, unsaved, with no
//     "JS CORE ONLY" toast;
//   - nothing saved, the default by input: a gamepad Beginner, a radio Cruise,
//     the keyboard Cruise, each said in its toast;
//   - the js core's saved rates carried once, as Custom, where they differ
//     from its default: "RATES: YOUR SAVED RATES", once.
// tools/test_sim_bf_rates.mjs holds the presets and the set lines in Node.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); skipped under
// SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  BF_RATE_KEYS, BF_RATE_PRESETS, BF_RATES_KEY, BF_RATES_TOAST_KEY, BF_RATES_FROM_JS_KEY, bfRatesCli, bfRatesPreset, ratesSourceText, encodeRates,
  pilotRatesDefault, rateSetpoint, BF_THR_KEYS, BF_THR_KEY,
} from '../sim-rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// A virtual pad for navigator.getGamepads(), unplugged at each page load:
// window.__plug(id, axes) and window.__unplug(), as a browser reports them.
const PADS = String.raw`(() => {
  const pad = { on: false, id: '', axes: [] };
  const make = () => ({ id: pad.id, index: 0, mapping: /STANDARD/.test(pad.id) ? 'standard' : '', connected: true, timestamp: performance.now(), axes: pad.axes.slice(),
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [pad.on ? make() : null, null, null, null]; } });
  window.__plug = (id, axes) => { pad.on = true; pad.id = id; pad.axes = axes; const e = new Event('gamepadconnected'); e.gamepad = make(); window.dispatchEvent(e); };
  window.__unplug = () => { const g = make(); g.connected = false; pad.on = false; const e = new Event('gamepaddisconnected'); e.gamepad = g; window.dispatchEvent(e); };
})()`;
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const TX16S = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';

// Every toast the page shows, from before its scripts run.
const TOASTS = `window.__toasts = [];
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('toast');
  if (el) new MutationObserver(() => window.__toasts.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
});`;

// In the page: what Betaflight holds (read from the flying core), the panel,
// and the pilot's controls.
const PAGE = `(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const KEYS = ${JSON.stringify(BF_RATE_KEYS)};
  const THR = ${JSON.stringify(BF_THR_KEYS)};
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]');
  // The OSD (osdTR, sim.html updateOSD) and the core's state (cs) are drawn
  // once a frame: a snap after a change waits for two frames painted, not a
  // wall time alone (on a slow runner 300 ms can pass before the next frame).
  const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
  async function painted() { await frames(); return snap(); }
  function snap() {
    const bf = s.core() === 'bf' ? s.bfCore().sim : null;
    const sl = {};
    for (const ax of ['roll', 'pitch', 'yaw']) for (const f of ['rcRate', 'srate', 'expo']) sl[ax + '_' + f] = +document.getElementById('bfs_' + ax + '_' + f).value;
    return {
      type: document.getElementById('droneType').value, core: s.core(),
      held: bf && bf.get(KEYS), info: s.bfRates(), sliders: sl,
      preset: document.getElementById('bfRatePreset').value, linked: document.getElementById('cbBfRatesLink').checked,
      pitchShown: shown(document.getElementById('bfAxis_pitch')),
      bfShown: shown(document.getElementById('bfRates')), jsShown: shown(document.querySelector('#panel div.rates-js')),
      osd: document.getElementById('osdTR').innerText, src: document.getElementById('ratesSourceBf').textContent,
      saved: localStorage.getItem(${JSON.stringify(BF_RATES_KEY)}), toastSeen: localStorage.getItem(${JSON.stringify(BF_RATES_TOAST_KEY)}),
      toasts: window.__toasts.slice(), status: document.getElementById('bfRatesStatus').textContent,
      // The number boxes, Tune's throttle and what Betaflight holds of it, the max readouts.
      nums: Object.fromEntries([...document.querySelectorAll('#bfRates input[type=number]')].map((el) => [el.id, el.value])),
      thrHeld: bf && bf.get(THR), thrFrom: document.getElementById('bfThrFrom').textContent,
      thrSaved: localStorage.getItem(${JSON.stringify(BF_THR_KEY)}),
      max: { roll: document.getElementById('bfMax_roll').textContent, yaw: document.getElementById('bfMax_yaw').textContent },
      pending: s.bfRates().pending, armed: s.coreState().armed, mode: s.coreState().flightMode,
    };
  }
  // A typed number in a box: Enter or leaving it sends it.
  async function num(id, v) {
    const el = document.getElementById(id);
    el.focus();
    el.value = String(v);
    el.dispatchEvent(new Event('change'));
    el.blur();
    await wait(300);
    return painted();
  }
  async function thrSlider(f, v) {
    const el = document.getElementById('bfs_thr_' + f);
    el.value = String(v);
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    await wait(300);
    return painted();
  }
  async function cls(type, core) {
    const sel = document.getElementById('droneType');
    sel.value = type;
    sel.dispatchEvent(new Event('change'));
    for (let i = 0; i < 80 && s.core() !== core; i++) await wait(100);
    await wait(400);
    return painted();
  }
  async function preset(id) {
    const sel = document.getElementById('bfRatePreset');
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
    await wait(300);
    return painted();
  }
  async function slider(ax, f, v) {
    const el = document.getElementById('bfs_' + ax + '_' + f);
    el.value = String(v);
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    await wait(300);
    return painted();
  }
  async function link(on) {
    const el = document.getElementById('cbBfRatesLink');
    el.checked = on;
    el.dispatchEvent(new Event('change'));
    await wait(300);
    return painted();
  }
  async function importCli(text) {
    document.getElementById('cliPaste').value = text;
    document.getElementById('btnCliImport').click();
    await wait(500);
    return Object.assign(await painted(), { cliStatus: document.getElementById('cliImportStatus').textContent });
  }
  // The start menu and a fresh profile's first-run prompt pause the sim, and
  // with it the OSD (as tools/test_sim_map_boot.mjs closes them).
  ['startMenu', 'feelPrompt', 'menuLayer', 'firstFlight'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open', 'show'); el.style.display = 'none'; }
  });
  document.body.classList.remove('menu-open');
  if (s.looks && s.looks.setMenuOpen) s.looks.setMenuOpen(false);
  if (window._feel && window._feel.hideFirstRun) window._feel.hideFirstRun();
  // A rates toast waits for no other toast to be up: up to ms for one like re.
  async function toastOr(ms, re = '^RATES: CRUISE') {
    const t0 = performance.now();
    while (performance.now() - t0 < ms && !window.__toasts.some((x) => new RegExp(re).test(x))) await wait(100);
    return painted();
  }
  async function until(fn, ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms && !fn()) await wait(100);
    await wait(200);
    return painted();
  }
  window.__bf = { wait, frames, snap, painted, toastOr, until, cls, preset, slider, link, importCli, num, thrSlider };
  return true;
})()`;

// Betaflight's get of BF_RATE_KEYS for a preset (as it prints them: strings).
const held = (st) => Object.fromEntries(Object.entries(bfRatesCli(st)).map(([k, v]) => [k, String(v)]));

test('Tune\'s Rates on the bf core: presets, sliders, a paste, class changes, reloads and links, read back from Betaflight', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const CRUISE = held(bfRatesPreset('cruise'));
  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-bfrates-'));
  // ?map= closes the start menu, so the sim (and its OSD) runs.
  const base = `http://127.0.0.1:${port}/sim.html?quality=low&map=rig`;
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=640,360',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  try {
    // Chrome picks its DevTools port (port 0) and writes it in the profile:
    // no port this test could share with anything else on the machine.
    let debugPort = 0;
    for (let i = 0; i < 300 && !debugPort; i++) {
      await sleep(100);
      try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
    }
    assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
    let page = null;
    for (let i = 0; i < 300 && !page; i++) {
      await sleep(100);
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
    await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: TOASTS });
    await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: PADS });
    // sim-core's own complaints (a readback that is not what Tune set, a load
    // that failed), and for a failure's message what sim-core said and what threw.
    const coreErrors = [];
    const said = [];
    ws.addEventListener('message', (msg) => {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        if (o.method === 'Runtime.exceptionThrown') {
          const ex = o.params.exceptionDetails || {};
          said.push('THREW ' + ((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text));
        }
        if (o.method !== 'Runtime.consoleAPICalled') return;
        const text = (o.params.args || []).map((a) => a.value).join(' ');
        if (/sim-core/.test(text)) said.push(o.params.type + ' ' + text);
        if (['error', 'warning'].includes(o.params.type) && /sim-core/.test(text)) coreErrors.push(text);
      } catch (e) { /* ignore */ }
    });
    const pageState = `JSON.stringify({ sim: !!window._sim, booted: !!window._simQueryBooted, core: window._sim && window._sim.core ? window._sim.core() : null,
      back: !!(window._sim && window._sim.bfRates && window._sim.bfRates().back), report: !!(window._sim && window._sim.bfReport && window._sim.bfReport()) })`;
    // Load url and wait for the given core to fly with Tune's rates read back.
    const open = async (url, core = 'bf') => {
      await cdp(ws, 'Page.navigate', { url });
      let ok = false;
      // Up to 2 minutes: a CI runner on SwiftShader loads the page and the wasm slowly.
      const t0 = Date.now();
      while (!ok && Date.now() - t0 < 120000) {
        await sleep(250);
        try {
          ok = await evaluate(ws, `!!(window._sim && typeof window._sim.bfRates === 'function' && window._simQueryBooted && window._sim.core() === '${core}'`
            + (core === 'bf' ? ` && !!window._sim.bfRates().back)` : ')'));
        } catch (e) { /* navigating */ }
      }
      if (!ok) {
        let st = null;
        try { st = await evaluate(ws, pageState); } catch (e) { st = String(e); }
        assert.fail(url + ': the ' + core + ' core flies; page ' + st + '; sim-core: ' + JSON.stringify(said.slice(-12)));
      }
      await evaluate(ws, PAGE);
    };
    const run = async (js) => JSON.parse(await evaluate(ws, `(async () => { const B = window.__bf; ${js} })()`));
    const toastText = 'RATES: CRUISE — change in Tune';

    // Nothing saved: Cruise flies on the 65, said once; nothing is saved.
    await open(base);
    const first = await run('return JSON.stringify(await B.toastOr(10000));');
    assert.equal(first.type, 'whoop65');
    assert.deepEqual(first.held, CRUISE, 'Betaflight holds Cruise');
    assert.equal(first.info.from, 'default');
    assert.equal(first.src, ratesSourceText({ core: 'bf', bf: { from: 'default', preset: 'cruise' } }));
    assert.match(first.osd, /TUNE 65-betafpv-ryfly-1219s · RATES CRUISE/);
    assert.ok(first.toasts.includes(toastText), 'the default\'s toast: ' + JSON.stringify(first.toasts));
    assert.equal(first.toastSeen, 'cruise', 'the default said');
    assert.equal(first.saved, null, 'the default is not saved');
    assert.ok(first.bfShown && !first.jsShown, 'the bf Rates section, not the js one');
    assert.equal(first.preset, 'cruise');
    assert.deepEqual([first.sliders.roll_rcRate, first.sliders.roll_srate, first.sliders.roll_expo, first.sliders.yaw_srate], [70, 450, 0.3, 400]);
    assert.ok(first.linked && !first.pitchShown, 'roll and pitch linked');
    assert.match(first.status, /^Betaflight took 10 rate lines; it flies Cruise Actual roll 70\/450\/0.30/);

    // Each preset reads back from the core as set, and is saved.
    for (const id of Object.keys(BF_RATE_PRESETS)) {
      const s = await run(`return JSON.stringify(await B.preset('${id}'));`);
      assert.deepEqual(s.held, held(bfRatesPreset(id)), id + ' read back from Betaflight');
      assert.equal(s.info.from, 'saved', id);
      assert.equal(JSON.parse(s.saved).preset, id, id + ' saved');
      assert.equal(s.preset, id);
      assert.equal(s.src, ratesSourceText({ core: 'bf', bf: { from: 'saved', preset: id } }));
      assert.ok(s.osd.includes('RATES ' + BF_RATE_PRESETS[id].osd), id + ': ' + s.osd);
      if (id === 'ryfly') {
        // The running core's own setpoint (sim-core rateCurve) on each axis:
        // the Actual curve of 20/740/0.56 (yaw 700), to the hundredth.
        const curves = JSON.parse(await evaluate(ws, 'JSON.stringify([0, 1, 2].map((i) => window._sim.bfCore().sim.rateCurve(i, 101)))'));
        const st = bfRatesPreset('ryfly');
        curves.forEach((curve, i) => {
          const ax = ['roll', 'pitch', 'yaw'][i];
          const worst = Math.max(...curve.map((c) => Math.abs(Math.abs(c.rate) - Math.abs(rateSetpoint('ACTUAL', c.stick, st[ax])))));
          assert.ok(worst < 0.01, `ryfly ${ax}: the running core's setpoint is ${worst} °/s off the Actual curve`);
        });
      }
    }

    // A slider: to the core on release, read back; linked, pitch follows roll.
    const sl = await run(`const out = [];
      await B.preset('cruise');
      out.push(await B.slider('roll', 'srate', 600));
      out.push(await B.slider('yaw', 'expo', 0.12));
      out.push(await B.link(false));
      out.push(await B.slider('pitch', 'rcRate', 90));
      out.push(await B.link(true));
      return JSON.stringify(out);`);
    assert.deepEqual(sl[0].held, { ...CRUISE, roll_srate: '60', pitch_srate: '60' }, 'roll max 600: roll and pitch, read back');
    assert.equal(sl[0].preset, '', 'Custom');
    assert.ok(sl[0].osd.includes('RATES CUSTOM'), sl[0].osd);
    assert.equal(sl[0].src, 'Rates: your own (bf, saved in this browser)');
    assert.deepEqual(sl[1].held, { ...CRUISE, roll_srate: '60', pitch_srate: '60', yaw_expo: '12' }, 'yaw on its own');
    assert.ok(!sl[2].linked && sl[2].pitchShown, 'unlinked: the pitch sliders');
    assert.deepEqual(sl[3].held, { ...CRUISE, roll_srate: '60', pitch_srate: '60', yaw_expo: '12', pitch_rc_rate: '9' }, 'pitch on its own');
    assert.equal(JSON.parse(sl[3].saved).link, false);
    assert.deepEqual(sl[4].held, { ...CRUISE, roll_srate: '60', pitch_srate: '60', yaw_expo: '12' }, 'linked again: pitch is roll\'s');
    assert.ok(sl[4].linked && !sl[4].pitchShown);
    const mine = sl[4].held;
    const mineSaved = sl[4].saved;

    // A paste with rate lines flies its own; the sliders show them; not saved.
    const paste = await run(`const out = [];
      out.push(await B.importCli('set p_roll = 50'));
      out.push(await B.importCli('set roll_srate = 90\\nset pitch_srate = 90\\nset yaw_expo = 40'));
      out.push(await B.slider('yaw', 'srate', 500));
      return JSON.stringify(out);`);
    assert.match(paste[0].cliStatus, /^Betaflight took 1 line on top of 65-betafpv-ryfly-1219s/);
    assert.deepEqual(paste[0].held, mine, 'a paste with no rate lines: Tune\'s rates still fly');
    assert.equal(paste[0].info.pasteWins, false);
    assert.equal(paste[0].src, 'Rates: your own (bf, saved in this browser), your CLI lines on top');
    assert.ok(paste[0].osd.includes('TUNE CLI IMPORT · RATES CUSTOM'), paste[0].osd);
    assert.deepEqual(paste[1].held, { ...mine, roll_srate: '90', pitch_srate: '90', yaw_expo: '40' }, 'the paste\'s rate lines fly');
    assert.equal(paste[1].info.pasteWins, true);
    assert.deepEqual([paste[1].sliders.roll_srate, paste[1].sliders.yaw_expo], [900, 0.4], 'the sliders show what the paste set');
    assert.equal(paste[1].src, ratesSourceText({ core: 'bf', cli: 'top', bf: { paste: true } }));
    assert.ok(paste[1].osd.includes('RATES CLI'), paste[1].osd);
    assert.equal(paste[1].saved, mineSaved, 'a paste is not saved');
    assert.deepEqual(paste[2].held, { ...mine, roll_srate: '90', pitch_srate: '90', yaw_expo: '40', yaw_srate: '50' }, 'a slider after the paste goes on top of it');
    assert.equal(paste[2].info.pasteWins, false);
    assert.equal(paste[2].info.ratesLast, true);
    assert.deepEqual(JSON.parse(paste[2].saved).yaw, [7, 50, 40], 'and saves what flies');
    const mine2 = paste[2].held;

    // Class changes: the 75 flies the saved rates; a paste there wins on the
    // 75 through the switches; the 85 is the js core's.
    const trip = await run(`const out = [];
      out.push(await B.cls('whoop75', 'bf'));
      out.push(await B.importCli('set roll_srate = 95'));
      out.push(await B.cls('whoop65', 'bf'));
      out.push(await B.cls('whoop85', 'js'));
      out.push(await B.cls('whoop75', 'bf'));
      return JSON.stringify(out);`);
    assert.match(trip[0].osd, /BF CORE · FRACTAL75/);
    assert.deepEqual(trip[0].held, mine2, 'the 75 flies the saved rates, read back');
    assert.deepEqual(trip[1].held, { ...mine2, roll_srate: '95' }, 'a paste on the 75');
    assert.deepEqual(trip[2].held, mine2, 'the 65: its own config and the saved rates');
    assert.ok(!trip[3].bfShown && trip[3].jsShown, 'the 85 shows the js core\'s rates');
    assert.deepEqual(trip[4].held, { ...mine2, roll_srate: '95' }, 'back on the 75: its paste still wins');
    assert.equal(trip[4].info.pasteWins, true);

    // A reload: the saved rates fly on boot and on the other class; no toast.
    await open(base);
    const again = await run(`const out = [];
      out.push(await B.toastOr(5000));
      out.push(await B.cls(B.snap().type === 'whoop65' ? 'whoop75' : 'whoop65', 'bf'));
      return JSON.stringify(out);`);
    for (const s of again) {
      assert.deepEqual(s.held, mine2, s.type + ' after a reload: the saved rates');
      assert.equal(s.info.from, 'saved');
      assert.ok(!s.toasts.includes(toastText), 'no default toast with rates saved');
    }

    // Nothing saved again, the toast seen: Cruise, no toast. Then nothing at
    // all: Cruise and the toast.
    await evaluate(ws, `localStorage.removeItem(${JSON.stringify(BF_RATES_KEY)}), true`);
    await open(base);
    const seen = await run('return JSON.stringify(await B.toastOr(5000));');
    assert.deepEqual(seen.held, CRUISE);
    assert.equal(seen.info.from, 'default');
    assert.ok(!seen.toasts.includes(toastText), 'the toast shows once');
    await evaluate(ws, `localStorage.removeItem(${JSON.stringify(BF_RATES_TOAST_KEY)}), true`);
    await open(base);
    const fresh = await run('return JSON.stringify(await B.toastOr(10000));');
    assert.deepEqual(fresh.held, CRUISE);
    assert.ok(fresh.toasts.includes(toastText));

    // Rates links on bf: for the session, unsaved, no "JS CORE ONLY" toast.
    await run(`await B.preset('beginner'); return JSON.stringify(1);`);
    const savedBeginner = await evaluate(ws, `localStorage.getItem(${JSON.stringify(BF_RATES_KEY)})`);
    const links = [
      ['preset=race', held(bfRatesPreset('race')), 'Rates: Race, the rates link (bf, this session)'],
      ['preset=whoopRace', held(bfRatesPreset('race')), 'Rates: Race, the rates link (bf, this session)'],
      ['rates=' + encodeRates({ type: 'ACTUAL', roll: { rcRate: 12, srate: 60, expo: 0.2 }, pitch: { rcRate: 12, srate: 60, expo: 0.2 }, yaw: { rcRate: 10, srate: 50, expo: 0.2 } }),
        { rates_type: 'ACTUAL', roll_rc_rate: '12', roll_srate: '60', roll_expo: '20', pitch_rc_rate: '12', pitch_srate: '60', pitch_expo: '20', yaw_rc_rate: '10', yaw_srate: '50', yaw_expo: '20' },
        'Rates: the rates link (bf, this session)'],
      ['rates=card.75-happymodel-aio-stock',
        { rates_type: 'BETAFLIGHT', roll_rc_rate: '100', roll_srate: '70', roll_expo: '0', pitch_rc_rate: '100', pitch_srate: '70', pitch_expo: '0', yaw_rc_rate: '100', yaw_srate: '70', yaw_expo: '0' },
        'Rates: the rates link (bf, this session)'],
    ];
    for (const [q, want, src] of links) {
      await open(base + '&' + q);
      const s = await run('await B.wait(600); return JSON.stringify(B.snap());');
      assert.deepEqual(s.held, want, q + ': Betaflight flies the link\'s rates');
      assert.equal(s.info.from, 'link', q);
      assert.equal(s.src, src, q);
      assert.equal(s.saved, savedBeginner, q + ': the saved rates are left alone');
      assert.ok(!s.toasts.some((x) => /JS CORE ONLY/.test(x)), q + ': ' + JSON.stringify(s.toasts));
      if (want.rates_type === 'BETAFLIGHT') {
        assert.equal(s.preset, '', 'Custom');
        assert.deepEqual([s.sliders.roll_rcRate, s.sliders.roll_srate], [200, 670], 'Betaflight rates, shown as Actual: the centre and the max');
      }
    }
    await open(base);
    const after = await run('return JSON.stringify(B.snap());');
    assert.deepEqual(after.held, held(bfRatesPreset('beginner')), 'without the link: the saved rates');

    // Nothing saved, the default by input: the keyboard Cruise; a gamepad
    // that is not a radio Beginner, said; unplugged, Cruise again, said; a
    // radio Cruise, nothing new to say.
    await evaluate(ws, `localStorage.removeItem(${JSON.stringify(BF_RATES_KEY)}), localStorage.setItem(${JSON.stringify(BF_RATES_TOAST_KEY)}, 'cruise'), true`);
    await open(base);
    const pads = await run(`const out = [B.snap()];
      window.__plug(${JSON.stringify(XBOX)}, [0, 0, 0, 0]);
      await B.until(() => window._sim.bfRates().osd === 'BEGINNER', 8000);
      out.push(await B.toastOr(8000, '^RATES: BEGINNER'));
      window.__unplug();
      await B.until(() => window._sim.bfRates().osd === 'CRUISE', 8000);
      out.push(await B.toastOr(8000, '^RATES: CRUISE'));
      window.__plug(${JSON.stringify(TX16S)}, [0, 0, -1, 0, -1, -1, -1, -1]);
      await B.until(() => /for a radio/.test(document.getElementById('ratesSourceBf').textContent), 8000);
      await B.wait(2500);
      out.push(B.snap());
      return JSON.stringify(out);`);
    assert.deepEqual(pads[0].held, CRUISE, 'the keyboard: Cruise');
    assert.equal(pads[0].src, 'Rates: Cruise, the default (bf)');
    assert.deepEqual(pads[1].held, held(bfRatesPreset('beginner')), 'a gamepad: Beginner, read back');
    assert.equal(pads[1].src, 'Rates: Beginner, the default for a gamepad (bf)');
    assert.ok(pads[1].osd.includes('RATES BEGINNER'), pads[1].osd);
    assert.ok(pads[1].toasts.includes('RATES: BEGINNER (GAMEPAD) — change in Tune'), JSON.stringify(pads[1].toasts));
    assert.equal(pads[1].saved, null, 'the default is not saved');
    assert.deepEqual(pads[2].held, CRUISE, 'unplugged: Cruise again');
    assert.equal(pads[2].toasts.filter((x) => x === toastText).length, 1, 'and said: ' + JSON.stringify(pads[2].toasts));
    assert.deepEqual(pads[3].held, CRUISE, 'a radio: Cruise');
    assert.equal(pads[3].src, 'Rates: Cruise, the default for a radio (bf)');
    assert.ok(!pads[3].toasts.some((x) => /^RATES: CRUISE \(RADIO\)/.test(x)), 'Cruise was said already: ' + JSON.stringify(pads[3].toasts));
    assert.equal(pads[3].toastSeen, 'cruise');

    // The js core's saved rates, where they differ from its default: carried
    // once, as the pilot's own (Custom), said once.
    const own = { quickRatesRcExpo: false, type: 'ACTUAL', roll: { rcRate: 4, srate: 74, expo: 0.56 }, pitch: { rcRate: 4, srate: 74, expo: 0.56 }, yaw: { rcRate: 4, srate: 70, expo: 0.56 } };
    const seed = (rates) => evaluate(ws, `localStorage.clear(), localStorage.setItem('ryflyRates', ${JSON.stringify(JSON.stringify(rates))}), true`);
    await seed(own);
    await open(base);
    const carried = await run(`return JSON.stringify(await B.toastOr(10000, '^RATES: YOUR SAVED RATES$'));`);
    assert.deepEqual(carried.held, held(own), 'Betaflight flies the js core\'s saved rates');
    assert.equal(carried.info.from, 'saved');
    assert.equal(JSON.parse(carried.saved).js, true, 'saved as the bf core\'s, carried');
    assert.equal(carried.preset, '', 'Custom');
    assert.equal(carried.src, 'Rates: your own, from the js core (bf, saved in this browser)');
    assert.ok(carried.toasts.includes('RATES: YOUR SAVED RATES'), JSON.stringify(carried.toasts));
    assert.ok(!carried.toasts.some((x) => /change in Tune/.test(x)), 'no default toast');
    assert.equal(await evaluate(ws, `localStorage.getItem(${JSON.stringify(BF_RATES_FROM_JS_KEY)})`), '1');
    await open(base);
    const again2 = await run(`return JSON.stringify(await B.toastOr(5000, '^RATES: YOUR SAVED RATES$'));`);
    assert.deepEqual(again2.held, held(own), 'after a reload: still the carried rates');
    assert.ok(!again2.toasts.includes('RATES: YOUR SAVED RATES'), 'said once');
    // Once only: with the bf rates gone, js rates saved since are not carried.
    await evaluate(ws, `localStorage.removeItem(${JSON.stringify(BF_RATES_KEY)}), localStorage.setItem('ryflyRates', ${JSON.stringify(JSON.stringify({ ...own, roll: { rcRate: 9, srate: 60, expo: 0.1 } }))}), true`);
    await open(base);
    const once = await run('return JSON.stringify(B.snap());');
    assert.deepEqual(once.held, CRUISE, 'carried once: now the default');
    assert.equal(once.saved, null);
    // The js default saved as it is: not carried; the default, and its toast.
    await seed({ quickRatesRcExpo: false, ...pilotRatesDefault() });
    await open(base);
    const same = await run('return JSON.stringify(await B.toastOr(10000));');
    assert.deepEqual(same.held, CRUISE, 'the js default is not carried');
    assert.equal(same.saved, null);
    assert.ok(same.toasts.includes(toastText));

    // Typed numbers, to Betaflight's own limits: yaw 300 / 800 / 0 (a pilot
    // could not get past 250 centre), read back, shown, saved; kept through
    // another slider, a reload and a rates link. Over the top clamps to 2000,
    // which flies Betaflight's 1998 setpoint cap; a junk box changes nothing.
    await evaluate(ws, 'localStorage.clear(), true');
    await open(base);
    const typed = await run(`const out = [];
      out.push(await B.num('bfn_yaw_rcRate', 300));
      out.push(await B.num('bfn_yaw_srate', 800));
      out.push(await B.num('bfn_yaw_expo', 0));
      out.push(await B.slider('roll', 'rcRate', 80));
      out.push(await B.num('bfn_roll_srate', 2500));
      out.push(await B.num('bfn_roll_expo', 'junk'));
      return JSON.stringify(out);`);
    const yaw300 = { yaw_rc_rate: '30', yaw_srate: '80', yaw_expo: '0' };
    assert.deepEqual(typed[2].held, { ...CRUISE, ...yaw300 }, 'yaw 300/800/0 typed: Betaflight holds it');
    assert.deepEqual([typed[2].sliders.yaw_rcRate, typed[2].sliders.yaw_srate, typed[2].sliders.yaw_expo], [300, 800, 0], 'the sliders show it');
    assert.deepEqual([typed[2].nums.bfn_yaw_rcRate, typed[2].nums.bfn_yaw_srate, typed[2].nums.bfn_yaw_expo], ['300', '800', '0.00'], 'and the boxes');
    assert.equal(typed[2].max.yaw, 'max 800 °/s');
    assert.deepEqual(JSON.parse(typed[2].saved).yaw, [30, 80, 0], 'saved');
    assert.deepEqual(typed[3].held, { ...CRUISE, ...yaw300, roll_rc_rate: '8', pitch_rc_rate: '8' }, 'another slider moved: yaw stays 300');
    assert.equal(typed[4].held.roll_srate, '200', '2500 typed: Betaflight\'s 2000');
    assert.equal(typed[4].nums.bfn_roll_srate, '2000');
    assert.equal(typed[4].max.roll, 'max 1998 °/s (Betaflight\'s limit)', 'the setpoint cap, said');
    assert.deepEqual(typed[5].held, typed[4].held, 'junk in a box: nothing sent');
    assert.equal(typed[5].nums.bfn_roll_expo, '0.30', 'and the box shows what flies');
    // A digit typed in a box is not a hotkey (3 is acro).
    const key = await run(`const el = document.getElementById('bfn_roll_expo'); el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: '3', code: 'Digit3', bubbles: true })); await B.wait(200); el.blur();
      return JSON.stringify(B.snap());`);
    assert.equal(key.mode, typed[5].mode, 'typing 3 in a box leaves the flight mode');
    const typedHeld = typed[5].held;
    await open(base);
    const reloaded = await run('return JSON.stringify(B.snap());');
    assert.deepEqual(reloaded.held, typedHeld, 'a reload: the typed rates fly');
    const token = encodeRates({ type: 'ACTUAL', roll: { rcRate: 7, srate: 45, expo: 0.3 }, pitch: { rcRate: 7, srate: 45, expo: 0.3 }, yaw: { rcRate: 30, srate: 80, expo: 0 } });
    await open(base + '&rates=' + token);
    const linked = await run('await B.wait(600); return JSON.stringify(B.snap());');
    assert.deepEqual(linked.held, { ...CRUISE, ...yaw300 }, 'a rates link of yaw 300/800/0 flies it');

    // Throttle mid and expo: each class's config's own (the Air65 diff sets
    // none: Betaflight's 0.50/0.00; the Fractal75's 0.65/0.35), until the
    // pilot sets that class's own, read back and saved for that class.
    await open(base);
    const thr = await run(`const out = [B.snap()];
      out.push(await B.num('bfn_thr_mid', '0.40'));
      out.push(await B.thrSlider('expo', 30));
      out.push(await B.cls('whoop75', 'bf'));
      out.push(await B.num('bfn_thr_mid', '1.00'));
      out.push(await B.cls('whoop65', 'bf'));
      return JSON.stringify(out);`);
    assert.deepEqual(thr[0].thrHeld, { thr_mid: '50', thr_expo: '0' }, 'the 65: Betaflight\'s, from its diff');
    assert.deepEqual([thr[0].nums.bfn_thr_mid, thr[0].nums.bfn_thr_expo, thr[0].thrFrom], ['0.50', '0.00', 'Air65 default']);
    assert.deepEqual(thr[1].thrHeld, { thr_mid: '40', thr_expo: '0' }, 'throttle mid 0.40 typed: read back');
    assert.match(thr[1].status, /^Betaflight took 12 rate lines; .*throttle mid 0\.40, expo 0\.00 \(read back\)/);
    assert.deepEqual(thr[2].thrHeld, { thr_mid: '40', thr_expo: '30' }, 'expo from its slider');
    assert.equal(thr[2].thrFrom, 'your own (65mm)');
    assert.deepEqual(thr[3].thrHeld, { thr_mid: '65', thr_expo: '35' }, 'the 75 flies its diff\'s own');
    assert.deepEqual([thr[3].nums.bfn_thr_mid, thr[3].nums.bfn_thr_expo, thr[3].thrFrom], ['0.65', '0.35', 'Fractal75 default']);
    assert.deepEqual(thr[4].thrHeld, { thr_mid: '99', thr_expo: '35' }, '1.00 typed stops at 0.99 (100 divides by zero in Betaflight)');
    assert.deepEqual(thr[5].thrHeld, { thr_mid: '40', thr_expo: '30' }, 'back on the 65: its own');
    assert.deepEqual(JSON.parse(thr[5].thrSaved), { v: 1, classes: { whoop65: [40, 30], whoop75: [99, 35] } });
    assert.deepEqual(thr[5].held, typedHeld, 'the rates are not touched by the throttle');
    await open(base);
    const thrAgain = await run(`const out = [B.snap()]; out.push(await B.cls('whoop75', 'bf')); return JSON.stringify(out);`);
    assert.deepEqual(thrAgain.map((x) => x.thrHeld), [{ thr_mid: '40', thr_expo: '30' }, { thr_mid: '99', thr_expo: '35' }], 'after a reload, each class its own');

    // Armed: a rates and a throttle change are kept, said, shown on the
    // sliders; disarmed in the air they wait (a load respawns the quad where
    // it is), and go to Betaflight once it is down.
    await open(base);
    const SPACE = "window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))";
    const inFlight = await run(`const s = window._sim;
      if (B.snap().type !== 'whoop65') await B.cls('whoop65', 'bf');
      s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); await B.wait(300);
      ${SPACE}; await B.until(() => s.coreState().armed, 4000);
      s.setTestStick({ r: 0, p: 0, y: 0, t: 0.5 });
      await B.until(() => s.coreState().airborne, 6000);
      const a = await B.slider('yaw', 'rcRate', 500);
      const b = await B.num('bfn_thr_mid', '0.45');
      // Disarmed on the next input sample, read from cs a frame later: polled
      // (50 ms steps, so it is read while still falling), not a flat 120 ms.
      ${SPACE};
      for (let i = 0; i < 60 && s.coreState().armed; i++) await B.wait(50);
      const air = B.snap(); air.airborne = s.coreState().airborne;
      s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
      const c = await B.until(() => !s.bfRates().pending && B.snap().held.yaw_rc_rate === '50', 10000);
      s.setTestStick(null);
      return JSON.stringify([a, b, air, c]);`);
    const kept = (x, k) => Array.isArray(x.pending) && x.pending.some((o) => o.k === k);
    assert.ok(inFlight[0].armed, 'armed, flying');
    assert.deepEqual(inFlight[0].held, reloaded.held, 'in flight Betaflight still flies what it flew');
    assert.equal(inFlight[0].sliders.yaw_rcRate, 500, 'the slider keeps the change');
    assert.ok(kept(inFlight[0], 'rates'), 'kept: ' + JSON.stringify(inFlight[0].pending));
    assert.ok(inFlight[0].toasts.includes('RATES CHANGE APPLIES WHEN YOU LAND'), JSON.stringify(inFlight[0].toasts.slice(-4)));
    assert.match(inFlight[0].status, /kept: Betaflight takes settings only while disarmed/);
    assert.deepEqual(inFlight[1].thrHeld, { thr_mid: '40', thr_expo: '30' }, 'throttle kept too, not sent');
    assert.equal(inFlight[1].nums.bfn_thr_mid, '0.45');
    assert.ok(!inFlight[2].armed && inFlight[2].airborne, 'disarmed in the air: ' + JSON.stringify(inFlight[2]));
    assert.ok(kept(inFlight[2], 'rates') && kept(inFlight[2], 'thr'), 'still kept in the air');
    assert.equal(inFlight[2].held.yaw_rc_rate, reloaded.held.yaw_rc_rate, 'nothing loaded in the air');
    assert.ok(!inFlight[3].armed, 'landed, disarmed: ' + JSON.stringify(inFlight[3]));
    assert.equal(inFlight[3].pending, null, 'nothing left waiting');
    assert.equal(inFlight[3].held.yaw_rc_rate, '50', 'the rates change went in once down');
    assert.deepEqual(inFlight[3].thrHeld, { thr_mid: '45', thr_expo: '30' }, 'and the throttle');
    assert.ok(inFlight[3].toasts.includes('RATES CHANGE APPLIED'), JSON.stringify(inFlight[3].toasts.slice(-4)));
    assert.deepEqual(JSON.parse(inFlight[3].saved).yaw, [50, 80, 0], 'saved once it flew');
    assert.deepEqual(JSON.parse(inFlight[3].thrSaved).classes.whoop65, [45, 30]);
    assert.ok(!inFlight[3].toasts.includes('DISARM TO LOAD A DIFF'), 'never the old refusal');

    // A paste and the throttle, each of Tune's parts under a paste until the
    // pilot changes it after the paste: the paste's own thr_mid flies; a rates
    // change after it leaves that throttle; a throttle change after it goes on
    // top. A full diff pasted stands in for Tune's lines, and a throttle change
    // after it flies on top of it (it used to throw).
    const AIR65_DIFF = readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8');
    const order = await run(`const out = [];
      out.push(await B.importCli('set thr_mid = 60'));
      out.push(await B.slider('roll', 'srate', 500));
      out.push(await B.num('bfn_thr_mid', '0.42'));
      out.push(await B.importCli(JSON.parse(${JSON.stringify(JSON.stringify(AIR65_DIFF))})));
      out.push(await B.num('bfn_thr_mid', '0.38'));
      return JSON.stringify(out);`);
    assert.deepEqual(order[0].thrHeld, { thr_mid: '60', thr_expo: '30' }, 'the paste\'s own thr_mid flies over Tune\'s');
    assert.equal(order[0].thrFrom, 'your pasted CLI');
    assert.equal(order[1].held.roll_srate, '50', 'a rates change after the paste');
    assert.deepEqual(order[1].thrHeld, { thr_mid: '60', thr_expo: '30' }, '... leaves the paste\'s throttle');
    assert.deepEqual(order[2].thrHeld, { thr_mid: '42', thr_expo: '30' }, 'a throttle change after the paste goes on top');
    assert.equal(order[2].thrFrom, 'your own (65mm)');
    assert.deepEqual(JSON.parse(order[2].thrSaved).classes.whoop65, [42, 30]);
    assert.match(order[3].cliStatus, /a full diff, in place of/);
    assert.deepEqual(order[3].held, held(bfRatesPreset('ryfly')), 'the full diff\'s own rates fly');
    assert.deepEqual(order[3].thrHeld, { thr_mid: '50', thr_expo: '0' }, 'and its own throttle (it sets none: Betaflight\'s)');
    assert.equal(order[3].thrFrom, 'your pasted CLI');
    assert.deepEqual(order[4].thrHeld, { thr_mid: '38', thr_expo: '0' }, 'a throttle change after a full diff flies on top of it');
    assert.deepEqual(order[4].held, held(bfRatesPreset('ryfly')), '... leaving its rates');
    assert.match(order[4].status, /^Betaflight took 2 rate lines under your paste, whose own rates fly; .*throttle mid 0\.38, expo 0\.00 \(read back\)/, 'the two throttle lines, on the paste\'s rates');

    // A throttle change kept on one class waits for that class: a switch to
    // the other bf class in flight keeps it, and it goes in when the first
    // class is back, landed.
    const keep = await run(`const s = window._sim;
      s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); await B.wait(300);
      ${SPACE}; await B.until(() => s.coreState().armed, 4000);
      const a = await B.num('bfn_thr_mid', '0.47');
      await B.cls('whoop75', 'bf'); await B.wait(1500);
      const y = B.snap();
      await B.cls('whoop65', 'bf');
      const w = await B.until(() => !s.bfRates().pending, 8000);
      s.setTestStick(null);
      return JSON.stringify([a, y, w]);`);
    assert.ok(keep[0].armed && kept(keep[0], 'thr'), 'armed on the 65: kept');
    assert.equal(keep[1].type, 'whoop75');
    assert.deepEqual(keep[1].thrHeld, { thr_mid: '99', thr_expo: '35' }, 'the 75 flies its own');
    assert.ok(kept(keep[1], 'thr'), 'the 65\'s change still kept on the 75');
    assert.equal(keep[2].pending, null);
    assert.deepEqual(keep[2].thrHeld, { thr_mid: '47', thr_expo: '0' }, 'back on the 65, down: it went in');
    assert.deepEqual(coreErrors, [], 'sim-core warned');
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
