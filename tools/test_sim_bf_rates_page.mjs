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
  pilotRatesDefault, rateSetpoint,
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
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]');
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
    };
  }
  async function cls(type, core) {
    const sel = document.getElementById('droneType');
    sel.value = type;
    sel.dispatchEvent(new Event('change'));
    for (let i = 0; i < 80 && s.core() !== core; i++) await wait(100);
    await wait(400);
    return snap();
  }
  async function preset(id) {
    const sel = document.getElementById('bfRatePreset');
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
    await wait(300);
    return snap();
  }
  async function slider(ax, f, v) {
    const el = document.getElementById('bfs_' + ax + '_' + f);
    el.value = String(v);
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    await wait(300);
    return snap();
  }
  async function link(on) {
    const el = document.getElementById('cbBfRatesLink');
    el.checked = on;
    el.dispatchEvent(new Event('change'));
    await wait(300);
    return snap();
  }
  async function importCli(text) {
    document.getElementById('cliPaste').value = text;
    document.getElementById('btnCliImport').click();
    await wait(500);
    return Object.assign(snap(), { cliStatus: document.getElementById('cliImportStatus').textContent });
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
    return snap();
  }
  async function until(fn, ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms && !fn()) await wait(100);
    await wait(200);
    return snap();
  }
  window.__bf = { wait, snap, toastOr, until, cls, preset, slider, link, importCli };
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
