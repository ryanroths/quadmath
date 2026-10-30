// Headless Chrome, the bf core: every attempt starts on a fresh pack.
//   - Coach drill 1, flown down to LAND NOW, then Retry: vbat reads 4.2;
//     R in the drill: 4.2 again.
//   - Daily: R is a new attempt, on a fresh pack.
//   - Freestyle keeps its draining pack through R; P (new pack) swaps it.
// "Down to LAND NOW": the pack is first set nearly empty through sim-core's
// battery carry (reinit { battery }), then flown until the page shows LAND
// NOW, so the test takes seconds rather than minutes of hover; Retry is
// pressed there, in flight.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// In the page. A nearly empty pack where the quad stands: sim-core's battery
// carry, then a respawn in place (placeQuadAt without FRESH carries it).
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase() }));
  const land = () => getComputedStyle(document.getElementById('osdLand')).display !== 'none';
  const vbat = () => s.coreState().battV;
  const toast = () => document.getElementById('toast').textContent;
  async function nearlyEmpty() {
    const cs = s.coreState();
    s.bfCore().sim.reinit({ battery: { soc: 0.02, vbatFiltered: 3.32 } });
    s.placeQuadAt(-cs.position.y * 3.5, cs.position.z * 3.5, -cs.position.x * 3.5);
    await wait(300);
    return vbat();
  }
  // Arm and climb until the page shows LAND NOW; then(), still flying at LAND
  // NOW, and throttle down.
  async function flyToLandNow(then) {
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
    await wait(100);
    key(' ');
    for (let i = 0; i < 20 && !s.coreState().armed; i++) await wait(100);
    const armed = s.coreState().armed;
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0.5 });
    let seen = false;
    for (let i = 0; i < 50 && !seen; i++) { await wait(100); seen = land(); }
    const at = vbat();
    const landAtThen = land();
    if (then) then();
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
    await wait(400);
    if (s.coreState().armed) key(' ');
    await wait(400);
    s.setTestStick(null);
    return { armed, seen, at, landAtThen };
  }
  window.__pack = { wait, key, land, vbat, toast, nearlyEmpty, flyToLandNow };
  return true;
})()`;

test('the bf core: Coach Retry and R, Daily R give a fresh pack (vbat 4.2); Freestyle keeps its pack through R, P swaps it', { timeout: 5 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-pack-'));
  const debugPort = 9000 + (process.pid % 300);
  const url = `http://127.0.0.1:${port}/sim.html?quality=low`;
  const child = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=640,360',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, url,
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
    let ready = false;
    for (let i = 0; i < 160 && !ready; i++) {
      await sleep(250);
      ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._sim.tracks().length > 0)`);
    }
    assert.ok(ready, 'the bf core flies');
    await evaluate(ws, `(function(){
      ['startMenu','feelPrompt','menuLayer','toast','panel'].forEach(function(id){
        var el=document.getElementById(id); if(!el)return;
        el.classList.remove('open','show'); el.style.display='none';
      });
      document.body.classList.remove('menu-open');
      if(window._sim.looks.setMenuOpen) window._sim.looks.setMenuOpen(false);
      if(window._feel&&window._feel.hideFirstRun) window._feel.hideFirstRun();
      return true;
    })()`);
    await evaluate(ws, PAGE);
    const run = async (js) => JSON.parse(await evaluate(ws, `(async () => { const P = window.__pack; ${js} })()`));

    // Coach drill 1, down to LAND NOW, then Retry.
    let r = await run(`
      document.getElementById('menuCoach').click();
      document.querySelector('.coach-row[data-drill]').click();
      await P.wait(800);
      const start = P.vbat();
      const low = await P.nearlyEmpty();
      const flown = await P.flyToLandNow(() => document.getElementById('coachRetry').click());
      await P.wait(400);
      return JSON.stringify({ start, low, flown, after: P.vbat(), landAfter: P.land() });`);
    console.log('coach: ' + JSON.stringify(r));
    assert.equal(r.start.toFixed(1), '4.2', `drill 1 starts on a full pack (${r.start})`);
    assert.ok(r.flown.armed, 'armed in the drill');
    assert.ok(r.flown.seen && r.flown.landAtThen, `flown down to LAND NOW, Retry pressed there (${r.flown.at} V)`);
    assert.equal(r.after.toFixed(1), '4.2', `Retry: vbat reads 4.2 (${r.after})`);
    assert.equal(r.landAfter, false, 'and LAND NOW is gone');

    // R in the drill.
    r = await run(`
      const low = await P.nearlyEmpty();
      P.key('r');
      await P.wait(800);
      return JSON.stringify({ low, after: P.vbat(), toast: P.toast() });`);
    assert.ok(r.low < 3.5, `nearly empty (${r.low})`);
    assert.equal(r.after.toFixed(1), '4.2', `R in Coach: vbat reads 4.2 (${r.after})`);

    // Daily: Fly, then R is a new attempt.
    r = await run(`
      document.getElementById('menuDaily').click();
      document.getElementById('dailyFly').click();
      await P.wait(1200);
      const fly = P.vbat();
      const low = await P.nearlyEmpty();
      P.key('r');
      await P.wait(800);
      return JSON.stringify({ fly, low, after: P.vbat(), toast: P.toast() });`);
    console.log('daily: ' + JSON.stringify(r));
    assert.equal(r.fly.toFixed(1), '4.2', 'Daily flies on a full pack');
    assert.equal(r.after.toFixed(1), '4.2', `R in Daily: vbat reads 4.2 (${r.after})`);
    assert.equal(r.toast, 'NEW ATTEMPT — NEW PACK');

    // Freestyle: R keeps the pack, P swaps it.
    r = await run(`
      document.getElementById('menuFreestyleMap').click();
      await P.wait(1200);
      const low = await P.nearlyEmpty();
      P.key('r');
      await P.wait(800);
      const afterR = P.vbat();
      P.key('p');
      await P.wait(800);
      return JSON.stringify({ low, afterR, afterP: P.vbat(), toast: P.toast() });`);
    console.log('freestyle: ' + JSON.stringify(r));
    assert.ok(r.afterR < 3.5, `R in Freestyle keeps the draining pack (${r.afterR})`);
    assert.equal(r.afterP.toFixed(1), '4.2', `P: a new pack (${r.afterP})`);
    assert.equal(r.toast, 'NEW PACK');
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
