// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Headless Chrome: rates are the pilot's, one profile for every class, on
// both cores. The page boots on the bf core (the 65); the class picker goes
// 65, 75, 85 and back:
//   - the bf core holds the Air65 diff's rates (read back from Betaflight,
//     the same as the diff alone in Node) and the 65's tune's PIDs, every
//     time the 65 flies;
//   - the js core (the 75 and 85) flies the page's one profile: the Air65
//     diff's by default, the pilot's once they move a slider, unchanged by
//     every class switch, and saved once (ryflyRates);
//   - an IMPORT CLI paste on bf stays through the class switches;
//   - under ?core=js the 65, 75 and 85 all fly the same saved profile;
//   - Tune names the source: "Rates: your Air65 diff (bf)", the default or
//     the saved profile on js.
// tools/test_sim_pilot_rates.mjs holds the per-class bf config in Node.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); skipped under
// SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createBfCore } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';
import { pilotRatesDefault, ratesSourceText } from '../sim-rates.js';

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
  const w = {};
  vm.runInNewContext(read('tune-database.js'), { window: w, document: { readyState: 'complete', getElementById: () => null } });
  const card65 = w.QuadMathTunes.tunes.find((c) => c.id === '65-betafpv-ryfly-1219s');
  const pids65 = Object.fromEntries(AXES.flatMap((a) => card65.pids[a].map((v, i) => [`${'pid'[i]}_${a}`, String(v)])));
  const jsDefault = { quickRatesRcExpo: false, ...pilotRatesDefault() };
  const SRC = {
    bf: ratesSourceText({ core: 'bf' }), bfCli: ratesSourceText({ core: 'bf', cli: 'top' }),
    jsDefault: ratesSourceText({ core: 'js', js: 'default' }), jsSaved: ratesSourceText({ core: 'js', js: 'saved' }),
  };

  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-rates-'));
  const debugPort = 9400 + (process.pid % 300);
  const base = `http://127.0.0.1:${port}/sim.html?quality=low`;
  const child = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=640,360',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, base,
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
        page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url).includes('/sim.html'));
      } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    const ready = async (core) => {
      let ok = false;
      for (let i = 0; i < 200 && !ok; i++) {
        await sleep(250);
        try {
          ok = await evaluate(ws, `!!(window._sim && typeof window._sim.rates === 'function' && window._simQueryBooted && window._sim.core() === '${core}')`);
        } catch (e) { /* navigating */ }
      }
      assert.ok(ok, 'the ' + core + ' core flies');
      await evaluate(ws, PAGE);
    };
    const run = async (js) => JSON.parse(await evaluate(ws, `(async () => { const R = window.__rates; ${js} })()`));

    // The bf core, the 65: the Air65 diff's rates and the 65's tune.
    await ready('bf');
    const b65 = await run('return JSON.stringify(R.snap());');
    assert.equal(b65.type, 'whoop65');
    assert.deepEqual(b65.bfRates, diffRates, 'the bf core flies the Air65 diff\'s rates');
    assert.deepEqual(b65.bfPids, pids65, 'and the 65\'s tune\'s PIDs (65-betafpv-ryfly-1219s)');
    assert.deepEqual(b65.srcBf, { text: SRC.bf, shown: true });
    assert.equal(b65.srcJs.shown, false);
    assert.deepEqual(b65.rates, jsDefault, 'the js profile is the Air65 diff\'s by default');
    assert.equal(b65.saved, null);

    // 75 and 85 fly the js core: the same rates, the default named.
    const trip = await run(`const out = [];
      out.push(await R.cls('whoop75', 'js'));
      out.push(await R.cls('whoop85', 'js'));
      out.push(await R.cls('whoop65', 'bf'));
      return JSON.stringify(out);`);
    for (const s of trip.slice(0, 2)) {
      assert.equal(s.core, 'js', s.type);
      assert.deepEqual(s.rates, b65.rates, s.type + ' keeps the rates');
      assert.equal(s.maxAll, b65.maxAll, s.type + ' max rate readout');
      assert.deepEqual(s.srcJs, { text: SRC.jsDefault, shown: true }, s.type);
      assert.equal(s.srcBf.shown, false, s.type);
      assert.equal(s.saved, null, s.type + ': a class switch saves no rates');
    }
    assert.equal(trip[2].core, 'bf');
    assert.deepEqual(trip[2].bfRates, diffRates, 'back on the 65: the Air65 diff\'s rates');
    assert.deepEqual(trip[2].bfPids, pids65);
    assert.deepEqual(trip[2].srcBf, { text: SRC.bf, shown: true });

    // The pilot changes the js rates on the 85: saved once, the same on every class.
    const own = await run(`const out = [];
      out.push(await R.cls('whoop85', 'js'));
      R.slider('s_sr', 60);
      await R.wait(200);
      out.push(R.snap());
      out.push(await R.cls('whoop75', 'js'));
      out.push(await R.cls('whoop65', 'bf'));
      out.push(await R.cls('whoop85', 'js'));
      return JSON.stringify(out);`);
    const mine = own[1];
    assert.equal(mine.rates.roll.srate, 60, 'the slider moved the roll max');
    assert.ok(mine.saved, 'saved as the pilot\'s');
    assert.deepEqual(mine.srcJs, { text: SRC.jsSaved, shown: true });
    for (const s of [own[2], own[4]]) {
      assert.deepEqual(s.rates, mine.rates, s.type + ' flies the pilot\'s profile');
      assert.equal(s.saved, mine.saved, s.type + ': saved profile unchanged');
      assert.deepEqual(s.srcJs, { text: SRC.jsSaved, shown: true }, s.type);
    }
    assert.deepEqual(own[3].bfRates, diffRates, 'the bf core keeps flying its diff\'s rates');
    assert.deepEqual(own[3].rates, mine.rates, 'and the js profile is left alone on the 65');

    // IMPORT CLI on the bf core: a rate line on top of the diff, for the session.
    const cli = await run(`const out = [];
      out.push(await R.cls('whoop65', 'bf'));
      const status = await R.importCli('set roll_srate = 80');
      out.push(Object.assign(R.snap(), { status }));
      out.push(await R.cls('whoop75', 'js'));
      out.push(await R.cls('whoop85', 'js'));
      out.push(await R.cls('whoop65', 'bf'));
      return JSON.stringify(out);`);
    assert.match(cli[1].status, /Betaflight took 1 line on top of 65-betafpv-ryfly-1219s/);
    assert.equal(cli[1].bfRates.roll_srate, '80');
    assert.deepEqual(cli[1].srcBf, { text: SRC.bfCli, shown: true });
    assert.deepEqual(cli[1].rates, mine.rates, 'the bf import leaves the js profile alone');
    for (const s of [cli[2], cli[3]]) assert.deepEqual(s.rates, mine.rates, s.type);
    assert.deepEqual(cli[4].bfRates, { ...diffRates, roll_srate: '80' }, 'back on the 65: the paste still flies');
    assert.deepEqual(cli[4].bfPids, pids65);
    assert.deepEqual(cli[4].srcBf, { text: SRC.bfCli, shown: true });

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
