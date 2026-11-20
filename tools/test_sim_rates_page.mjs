// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Headless Chrome: rates are the pilot's, one profile for every class, on
// both cores. The page boots on the bf core (the 65); the class picker goes
// 65, 75, 85 and back:
//   - the 65's bf core holds the Air65 diff (read back from Betaflight, the
//     same as the diff alone in Node) with Tune's rates (Cruise, nothing
//     saved: tools/test_sim_bf_rates_page.mjs) and the 65's tune's PIDs,
//     every time the 65 flies;
//   - the 75's bf core (the Fractal75) holds its own diff with the same
//     Tune's rates: its throttle curve and its own PIDs, as in Node;
//   - the js core (the 85) flies the page's one profile: the Air65 diff's by
//     default, the pilot's once they move a slider, unchanged by every class
//     switch, and saved once (ryflyRates);
//   - an IMPORT CLI paste on bf stays with its class through the switches;
//   - under ?core=js the 65, 75 and 85 all fly the same saved profile;
//   - Tune names the source: "Rates: Cruise, the default (bf)", the default
//     or the saved profile on js.
// tools/test_sim_pilot_rates.mjs holds the per-class bf config in Node.
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
import vm from 'node:vm';
import { createBfCore } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import { pilotRatesDefault, ratesSourceText, bfRatesCli, bfRatesPreset } from '../sim-rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');

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

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

const AXES = ['roll', 'pitch', 'yaw'];
const RATE_KEYS = ['rates_type', 'thr_mid', 'thr_expo'];
for (const a of AXES) RATE_KEYS.push(`${a}_rc_rate`, `${a}_srate`, `${a}_expo`, `${a}_rate_limit`);
const PID_KEYS = AXES.flatMap((a) => [`p_${a}`, `i_${a}`, `d_${a}`]);

// In the page: the class picker, and what each core flies.
const PAGE = `(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const RATE_KEYS = ${JSON.stringify(RATE_KEYS)}, PID_KEYS = ${JSON.stringify(PID_KEYS)};
  const line = (id) => { const el = document.getElementById(id); return { text: el.textContent, shown: getComputedStyle(el).display !== 'none' }; };
  function snap() {
    const bf = s.core() === 'bf' ? s.bfCore().sim : null;
    return {
      type: document.getElementById('droneType').value, core: s.core(), rates: s.rates(),
      maxAll: document.getElementById('v_maxAll').textContent,
      srcBf: line('ratesSourceBf'), srcJs: line('ratesSourceJs'),
      bfRates: bf && bf.get(RATE_KEYS, { rateprofile: 0 }), bfPids: bf && bf.get(PID_KEYS, { profile: 0 }),
      saved: localStorage.getItem('ryflyRates'),
    };
  }
  async function cls(type, core) {
    const sel = document.getElementById('droneType');
    sel.value = type;
    sel.dispatchEvent(new Event('change'));
    for (let i = 0; i < 50 && s.core() !== core; i++) await wait(100);
    await wait(300);
    return snap();
  }
  function slider(id, v) {
    const el = document.getElementById(id);
    el.value = String(v);
    el.dispatchEvent(new Event('input'));
  }
  async function importCli(text) {
    document.getElementById('cliPaste').value = text;
    document.getElementById('btnCliImport').click();
    await wait(500);
    return document.getElementById('cliImportStatus').textContent;
  }
  window.__rates = { wait, snap, cls, slider, importCli };
  return true;
})()`;

test('rates are the pilot\'s: 65, 75, 85 and back keep the same rates on the bf and js cores; Tune names the source', { timeout: 5 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  // What Betaflight holds on the owner's diff alone, in Node, and the 65's tune.
  const air65 = await createBfCore({
    SimCore, wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: JSON.parse(read('vendor/sim-core/airframes/air65.json')),
    diff: read('vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), world: { floorZ: 0 },
  });
  const diffRates = air65.sim.get(RATE_KEYS, { rateprofile: 0 });
  // And on the Fractal75's diff alone: what the 75 flies.
  const fractal = await createBfCore({
    SimCore, wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: JSON.parse(read('vendor/sim-core/airframes/fractal75.json')),
    diff: read('vendor/sim-core/configs/fractal75-ryfly-2026-11-03.txt'), world: { floorZ: 0 },
  });
  const rates75 = fractal.sim.get(RATE_KEYS, { rateprofile: 0 });
  const pids75 = fractal.sim.get(PID_KEYS, { profile: 0 });
  for (const k of RATE_KEYS) if (!k.startsWith('thr_')) assert.equal(rates75[k], diffRates[k], k + ': the same stick rates');
  const w = {};
  vm.runInNewContext(read('tune-database.js'), { window: w, document: { readyState: 'complete', getElementById: () => null } });
  const card65 = w.QuadMathTunes.tunes.find((c) => c.id === '65-betafpv-ryfly-1219s');
  const pids65 = Object.fromEntries(AXES.flatMap((a) => card65.pids[a].map((v, i) => [`${'pid'[i]}_${a}`, String(v)])));
  const jsDefault = { quickRatesRcExpo: false, ...pilotRatesDefault() };
  // Tune's rates on bf with nothing saved: Cruise, on each class's diff.
  const cruise = Object.fromEntries(Object.entries(bfRatesCli(bfRatesPreset('cruise'))).map(([k, v]) => [k, String(v)]));
  const tune65 = { ...diffRates, ...cruise }, tune75 = { ...rates75, ...cruise };
  const SRC = {
    bf: ratesSourceText({ core: 'bf' }), bfCli: ratesSourceText({ core: 'bf', cli: 'top', bf: { paste: true } }), bf75: ratesSourceText({ core: 'bf' }),
    jsDefault: ratesSourceText({ core: 'js', js: 'default' }), jsSaved: ratesSourceText({ core: 'js', js: 'saved' }),
  };

  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-rates-'));
  const base = `http://127.0.0.1:${port}/sim.html?quality=low`;
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=640,360',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, base,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  try {
    // Chrome picks its DevTools port (port 0) and writes it in the profile.
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
        page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url).includes('/sim.html'));
      } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    // For a failure's message: what sim-core said and what threw.
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
      } catch (e) { /* ignore */ }
    });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    const ready = async (core) => {
      let ok = false;
      // Up to 2 minutes: a CI runner on SwiftShader loads the page and the wasm slowly.
      const t0 = Date.now();
      while (!ok && Date.now() - t0 < 120000) {
        await sleep(250);
        try {
          ok = await evaluate(ws, `!!(window._sim && typeof window._sim.rates === 'function' && window._simQueryBooted && window._sim.core() === '${core}')`);
        } catch (e) { /* navigating */ }
      }
      if (!ok) {
        let st = null;
        try { st = await evaluate(ws, `JSON.stringify({ sim: !!window._sim, booted: !!window._simQueryBooted, core: window._sim && window._sim.core ? window._sim.core() : null })`); } catch (e) { st = String(e); }
        assert.fail('the ' + core + ' core flies; page ' + st + '; sim-core: ' + JSON.stringify(said.slice(-12)));
      }
      await evaluate(ws, PAGE);
    };
    const run = async (js) => JSON.parse(await evaluate(ws, `(async () => { const R = window.__rates; ${js} })()`));

    // The bf core, the 65: the Air65 diff with Tune's rates and the 65's tune.
    await ready('bf');
    const b65 = await run('for (let i = 0; i < 40 && !window._sim.bfRates().back; i++) await R.wait(100); return JSON.stringify(R.snap());');
    assert.equal(b65.type, 'whoop65');
    assert.deepEqual(b65.bfRates, tune65, 'the bf core flies the Air65 diff with Tune\'s rates');
    assert.deepEqual(b65.bfPids, pids65, 'and the 65\'s tune\'s PIDs (65-betafpv-ryfly-1219s)');
    assert.deepEqual(b65.srcBf, { text: SRC.bf, shown: true });
    assert.equal(b65.srcJs.shown, false);
    assert.deepEqual(b65.rates, jsDefault, 'the js profile is the Air65 diff\'s by default');
    assert.equal(b65.saved, null);

    // The 75 flies its own bf core, the Fractal75 on its diff; the 85 the js
    // core: the same rates, the default named.
    const trip = await run(`const out = [];
      out.push(await R.cls('whoop75', 'bf'));
      out.push(await R.cls('whoop85', 'js'));
      out.push(await R.cls('whoop65', 'bf'));
      return JSON.stringify(out);`);
    assert.equal(trip[0].core, 'bf', 'the 75 flies Betaflight');
    assert.deepEqual(trip[0].bfRates, tune75, 'the Fractal75 diff with Tune\'s rates');
    assert.deepEqual(trip[0].bfPids, pids75, 'and its own PIDs');
    assert.deepEqual(trip[0].srcBf, { text: SRC.bf75, shown: true });
    assert.equal(trip[0].srcJs.shown, false);
    for (const s of trip.slice(0, 2)) {
      assert.deepEqual(s.rates, b65.rates, s.type + ' keeps the js profile');
      assert.equal(s.saved, null, s.type + ': a class switch saves no rates');
    }
    const s85 = trip[1];
    assert.equal(s85.core, 'js', s85.type);
    assert.equal(s85.maxAll, b65.maxAll, s85.type + ' max rate readout');
    assert.deepEqual(s85.srcJs, { text: SRC.jsDefault, shown: true }, s85.type);
    assert.equal(s85.srcBf.shown, false, s85.type);
    assert.equal(trip[2].core, 'bf');
    assert.deepEqual(trip[2].bfRates, tune65, 'back on the 65: the Air65 diff with Tune\'s rates');
    assert.deepEqual(trip[2].bfPids, pids65);
    assert.deepEqual(trip[2].srcBf, { text: SRC.bf, shown: true });

    // The pilot changes the js rates on the 85: saved once, the same on every class.
    const own = await run(`const out = [];
      out.push(await R.cls('whoop85', 'js'));
      R.slider('s_sr', 60);
      await R.wait(200);
      out.push(R.snap());
      out.push(await R.cls('whoop75', 'bf'));
      out.push(await R.cls('whoop65', 'bf'));
      out.push(await R.cls('whoop85', 'js'));
      return JSON.stringify(out);`);
    const mine = own[1];
    assert.equal(mine.rates.roll.srate, 60, 'the slider moved the roll max');
    assert.ok(mine.saved, 'saved as the pilot\'s');
    assert.deepEqual(mine.srcJs, { text: SRC.jsSaved, shown: true });
    for (const s of [own[2], own[4]]) {
      assert.deepEqual(s.rates, mine.rates, s.type + ': the pilot\'s profile');
      assert.equal(s.saved, mine.saved, s.type + ': saved profile unchanged');
    }
    assert.deepEqual(own[4].srcJs, { text: SRC.jsSaved, shown: true }, 'the 85 flies it');
    assert.deepEqual(own[2].bfRates, tune75, 'the 75 keeps flying Tune\'s bf rates');
    assert.deepEqual(own[3].bfRates, tune65, 'the bf core keeps flying Tune\'s bf rates');
    assert.deepEqual(own[3].rates, mine.rates, 'and the js profile is left alone on the 65');

    // IMPORT CLI on the bf core: a rate line on top of the diff, for the session.
    const cli = await run(`const out = [];
      out.push(await R.cls('whoop65', 'bf'));
      const status = await R.importCli('set roll_srate = 80');
      out.push(Object.assign(R.snap(), { status }));
      out.push(await R.cls('whoop75', 'bf'));
      out.push(await R.cls('whoop85', 'js'));
      out.push(await R.cls('whoop65', 'bf'));
      return JSON.stringify(out);`);
    assert.match(cli[1].status, /Betaflight took 1 line on top of 65-betafpv-ryfly-1219s/);
    assert.equal(cli[1].bfRates.roll_srate, '80');
    assert.deepEqual(cli[1].srcBf, { text: SRC.bfCli, shown: true });
    assert.deepEqual(cli[1].rates, mine.rates, 'the bf import leaves the js profile alone');
    for (const s of [cli[2], cli[3]]) assert.deepEqual(s.rates, mine.rates, s.type);
    assert.deepEqual(cli[2].bfRates, tune75, 'the paste stays with the 65: the 75 flies its own diff');
    assert.deepEqual(cli[2].srcBf, { text: SRC.bf75, shown: true });
    assert.deepEqual(cli[4].bfRates, { ...tune65, roll_srate: '80' }, 'back on the 65: the paste still flies');
    assert.deepEqual(cli[4].bfPids, pids65);
    assert.deepEqual(cli[4].srcBf, { text: SRC.bfCli, shown: true });

    // A paste that sets one of the sim's own settings (sim-core v0.8.0's
    // policy): it loads, the line is set by the sim, and the status shows the
    // note. Alone it changes nothing, so the earlier paste still flies.
    const NOTE = "rpm_filter_harmonics set to 0 in the sim (1 kHz loop can't track whoop motor rpm)";
    const pol = await run(`const out = [];
      const alone = await R.importCli('set rpm_filter_harmonics = 3');
      out.push(Object.assign(R.snap(), { status: alone }));
      const mixed = await R.importCli('set roll_srate = 81\\nset rpm_filter_harmonics = 3');
      out.push(Object.assign(R.snap(), { status: mixed }));
      return JSON.stringify(out);`);
    assert.equal(pol[0].status, 'Betaflight took none of it, 1 set by the sim; it flies what it flew before\n' + NOTE);
    assert.equal(pol[0].bfRates.roll_srate, '80', 'the earlier paste still flies');
    assert.equal(pol[1].status, 'Betaflight took 1 line on top of 65-betafpv-ryfly-1219s, 1 set by the sim\n' + NOTE);
    assert.equal(pol[1].bfRates.roll_srate, '81');
    for (const s of pol) assert.deepEqual(s.rates, mine.rates, 'the bf import leaves the js profile alone');

    // ?core=js (deprecated): the 65 on the js core too, the saved profile on every class.
    await cdp(ws, 'Page.navigate', { url: base + '&core=js' });
    await sleep(1000);
    await ready('js');
    const js = await run(`const out = [R.snap()];
      out.push(await R.cls('whoop75', 'js'));
      out.push(await R.cls('whoop85', 'js'));
      out.push(await R.cls('whoop65', 'js'));
      return JSON.stringify(out);`);
    assert.equal(js[0].type, 'whoop65', 'the last class flown');
    for (const s of js) {
      assert.equal(s.core, 'js', s.type);
      assert.deepEqual(s.rates, mine.rates, s.type + ' on ?core=js flies the saved profile');
      assert.deepEqual(s.srcJs, { text: SRC.jsSaved, shown: true }, s.type);
      assert.equal(s.saved, mine.saved);
    }

    // A build of another class (here Tune's Your build preset) loads that
    // class's stock PIDs on the js core and its camera angle (the 65 30, the
    // 85 15; a saved angle beats it), as the Drone type picker does; a build
    // within the class keeps the PIDs and the angle flying, a CLI paste's
    // PIDs included.
    const tune = await run(`const out = [];
      const tuneNow = () => ({ type: document.getElementById('droneType').value, rollP: window._qp.tune.rollP, pitchP: window._qp.tune.pitchP, yawI: window._qp.tune.yawI, cam: +document.getElementById('s_cam').value });
      const pick = async (id) => { const sel = document.getElementById('buildPreset'); sel.value = id; sel.dispatchEvent(new Event('change')); await R.wait(300); return tuneNow(); };
      out.push(tuneNow());
      out.push(await pick('whoop85_2s'));
      await R.importCli('set p_roll = 71');
      out.push(tuneNow());
      out.push(await pick('meteor75pro'));
      out.push(await pick('air65'));
      R.slider('s_cam', 22);
      await R.wait(100);
      out.push(Object.assign(tuneNow(), { saved: localStorage.getItem('quadmathSimCamDeg') }));
      out.push(await pick('whoop85_2s'));
      out.push(await pick('meteor75pro'));
      await R.cls('whoop65', 'js');
      out.push(tuneNow());
      return JSON.stringify(out);`);
    assert.deepEqual(tune[0], { type: 'whoop65', rollP: 36, pitchP: 37, yawI: 61, cam: 30 }, 'the 65 flies its stock PIDs at its 30 degrees');
    assert.deepEqual(tune[1], { type: 'whoop85', rollP: 67, pitchP: 70, yawI: 120, cam: 15 }, 'an 85 build from the 65 loads the 85\'s PIDs and its 15 degrees');
    assert.equal(tune[2].rollP, 71, 'the paste sets P roll');
    assert.deepEqual(tune[3], { type: 'whoop85', rollP: 71, pitchP: 70, yawI: 120, cam: 15 }, 'another 85 build keeps the PIDs and the angle flying');
    assert.deepEqual(tune[4], { type: 'whoop65', rollP: 36, pitchP: 37, yawI: 61, cam: 30 }, 'a 65 build loads the 65\'s PIDs and its 30 degrees');
    assert.equal(tune[5].cam, 22, 'the Cam angle slider sets 22');
    assert.equal(tune[5].saved, '22', 'and saves it');
    assert.deepEqual([tune[6].type, tune[6].cam], ['whoop85', 22], 'an 85 build keeps a saved angle over the 85 default, as the Drone type picker does');
    assert.deepEqual([tune[7].type, tune[7].cam], ['whoop85', 22], 'another 85 build keeps it');
    assert.deepEqual([tune[8].type, tune[8].cam], ['whoop65', 22], 'and so does the Drone type picker');
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
