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
//     "JS CORE ONLY" toast.
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
  BF_RATE_KEYS, BF_RATE_PRESETS, BF_RATES_KEY, BF_RATES_TOAST_KEY, bfRatesCli, bfRatesPreset, ratesSourceText, encodeRates,
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
  window.__bf = { wait, snap, cls, preset, slider, link, importCli };
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
  const debugPort = 9700 + (process.pid % 250);
  // ?map= closes the start menu, so the sim (and its OSD) runs.
  const base = `http://127.0.0.1:${port}/sim.html?quality=low&map=rig`;
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=640,360',
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
    await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: TOASTS });
    // sim-core's own complaints: a readback that is not what Tune set, a load
    // that failed.
    const coreErrors = [];
    ws.addEventListener('message', (msg) => {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        if (o.method !== 'Runtime.consoleAPICalled' || !['error', 'warning'].includes(o.params.type)) return;
        const text = (o.params.args || []).map((a) => a.value).join(' ');
        if (/sim-core/.test(text)) coreErrors.push(text);
      } catch (e) { /* ignore */ }
    });
    // Load url and wait for the given core to fly with Tune's rates read back.
    const open = async (url, core = 'bf') => {
      await cdp(ws, 'Page.navigate', { url });
      let ok = false;
      for (let i = 0; i < 240 && !ok; i++) {
        await sleep(250);
        try {
          ok = await evaluate(ws, `!!(window._sim && typeof window._sim.bfRates === 'function' && window._simQueryBooted && window._sim.core() === '${core}'`
            + (core === 'bf' ? ` && !!window._sim.bfRates().back)` : ')'));
        } catch (e) { /* navigating */ }
      }
      assert.ok(ok, url + ': the ' + core + ' core flies');
      await evaluate(ws, PAGE);
    };
    const run = async (js) => JSON.parse(await evaluate(ws, `(async () => { const B = window.__bf; ${js} })()`));
    const toastText = 'RATES: CRUISE — change in Tune';

    // Nothing saved: Cruise flies on the 65, said once; nothing is saved.
    await open(base);
    const first = await run('await B.wait(2600); return JSON.stringify(B.snap());');
    assert.equal(first.type, 'whoop65');
    assert.deepEqual(first.held, CRUISE, 'Betaflight holds Cruise');
    assert.equal(first.info.from, 'default');
    assert.equal(first.src, ratesSourceText({ core: 'bf', bf: { from: 'default', preset: 'cruise' } }));
    assert.match(first.osd, /TUNE 65-betafpv-ryfly-1219s · RATES CRUISE/);
    assert.ok(first.toasts.includes(toastText), 'the default\'s toast: ' + JSON.stringify(first.toasts));
    assert.equal(first.toastSeen, '1');
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
      await B.wait(2600);
      out.push(B.snap());
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
    const seen = await run('await B.wait(2600); return JSON.stringify(B.snap());');
    assert.deepEqual(seen.held, CRUISE);
    assert.equal(seen.info.from, 'default');
    assert.ok(!seen.toasts.includes(toastText), 'the toast shows once');
    await evaluate(ws, `localStorage.removeItem(${JSON.stringify(BF_RATES_TOAST_KEY)}), true`);
    await open(base);
    const fresh = await run('await B.wait(2600); return JSON.stringify(B.snap());');
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
