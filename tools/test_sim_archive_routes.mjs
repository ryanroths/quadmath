// Headless Chrome, no ?dev=1: every menu path that loads a map ends on The
// Rig, or says why not. The Rig and The House are open without ?dev=1
// (sim-tracks.js mapOpen: Fly and Tracks); the other maps are the archive.
// Daily, Boards and Coach stay Rig-only: from the House they fly the Rig.
//   - Daily flies a Rig track (from 2026-10-30, sim-retention.js RIG_DAILY_FROM).
//   - Boards flies the week's course: a Rig track from 2026-W45; until that
//     Monday, this week's generated course, as the owner chose.
//   - Freestyle this map on an archived map: the Rig, and the archive toast.
//   - The builder's Import of a share code for an archived map: the Rig and
//     the toast; the builder closes.
//   - A ghost / duel code for an archived map's track: the Rig and the toast,
//     no rival loaded; a duel on the open Rig from elsewhere names the map it
//     moved to.
// Coach is the sixth path; its drills move to the Rig in their own PR.
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
const ARCHIVE = 'THAT MAP IS IN THE ARCHIVE (?dev=1)';

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
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 20000);
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

// Runs in the page: click a button by id, then report the map and the toast.
const after = (js) => `(async () => {
  ${js}
  await new Promise((r) => setTimeout(r, 300));
  const toast = document.getElementById('toast');
  return JSON.stringify({ map: window._sim.map(), toast: toast ? toast.textContent : '', builder: document.body.classList.contains('builder-on') });
})()`;
const click = (id) => `document.getElementById(${JSON.stringify(id)}).click();`;

test('without ?dev=1 Daily, Boards, Freestyle this map, builder Import and duel codes end on the Rig or toast the archive', { timeout: 5 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-routes-'));
  const debugPort = 9300 + (process.pid % 300);
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
      ready = await evaluate(ws, `!!(window._sim && window._sim.map && window._sim.map() === 'rig' && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._sim.tracks().length > 0)`);
    }
    assert.ok(ready, 'the page booted on the Rig');
    assert.equal(await evaluate(ws, `document.body.classList.contains('dev')`), false, 'no ?dev=1');

    // Daily.
    let r = JSON.parse(await evaluate(ws, after(click('menuDaily') + click('dailyFly'))));
    assert.equal(r.map, 'rig', `Daily flies the Rig (${r.map})`);

    // Boards: this week's course; the Rig from 2026-W45.
    const week = JSON.parse(await evaluate(ws, `JSON.stringify((() => { const w = window._sim.weeklyTrackFor(); return { map: w.map, id: w.id }; })())`));
    r = JSON.parse(await evaluate(ws, after(click('menuBoards') + click('boardFly'))));
    const weekId = week.id.replace(/^weekly-/, '').replace(/-g\d+$/, '');
    if (weekId >= '2026-W45') assert.equal(r.map, 'rig', `Boards flies the Rig (${weekId}, ${r.map})`);
    else assert.equal(r.map, week.map, `Boards keeps ${weekId}'s course until Monday`);

    // Freestyle this map: on the Rig it stays; on an archived map, the Rig and the toast.
    await evaluate(ws, `window._sim.setMap('rig'), true`);
    r = JSON.parse(await evaluate(ws, after(click('menuFreestyleMap'))));
    assert.equal(r.map, 'rig');
    assert.equal(r.toast, 'FREESTYLE — NO GATES');
    await evaluate(ws, `window._sim.setMap('gym'), true`);
    assert.equal(await evaluate(ws, `window._sim.map()`), 'gym');
    r = JSON.parse(await evaluate(ws, after(click('menuFreestyleMap'))));
    assert.equal(r.map, 'rig', 'Freestyle this map on the gym goes to the Rig');
    assert.equal(r.toast, ARCHIVE);

    // The builder's Import, a share code for a gym track.
    await evaluate(ws, `window._sim.setMap('rig'), true`);
    r = JSON.parse(await evaluate(ws, after(click('menuBuilder') + `
      const gym = window._sim.findTrack('gym-court');
      if (!gym || gym.map !== 'gym') throw new Error('no gym-court');
      document.getElementById('builderCode').value = window._sim.encodeShare(gym);
      ` + click('builderImport'))));
    assert.equal(r.map, 'rig', 'Import of a gym track stays on the Rig');
    assert.equal(r.toast, ARCHIVE);
    assert.equal(r.builder, false, 'and the builder closes');

    // Ghost / duel codes.
    const ghost = (track) => `{ v: 1, phys: 5, track: ${JSON.stringify(track)}, name: 'RIVAL', lapTime: 12345,
      samples: Array.from({ length: 12 }, (_, i) => [i * 100, i * 0.1, 2, 0, 0, 0, 0, 1]) }`;
    const duel = (trackJs, track) => `
      document.getElementById('ghostCode').value = window._sim.encodeDuel({ ghost: ${ghost(track)}, track: ${trackJs} });
      ` + click('btnGhostLoad');
    r = JSON.parse(await evaluate(ws, after(duel(`window._sim.findTrack('gym-court')`, 'gym-court'))));
    assert.equal(r.map, 'rig', 'a duel on a gym track stays on the Rig');
    assert.equal(r.toast, ARCHIVE, 'and says why, with no rival');
    await evaluate(ws, `window._sim.setMap('gym'), true`);
    r = JSON.parse(await evaluate(ws, after(duel(`window._sim.findTrack('rig-loop')`, 'rig-loop'))));
    assert.equal(r.map, 'rig', 'a duel on the Rig Loop moves to the Rig');
    assert.match(r.toast, /^DUEL: RIVAL .* · THE RIG$/, `and names the map it moved to (${r.toast})`);

    // The House: Fly lists it beside the Rig, and Freestyle this map stays on
    // it; Daily, Boards and Coach from the House fly the Rig.
    assert.equal(await evaluate(ws, `[...document.querySelectorAll('#flyMaps [data-map]')].map((b) => b.dataset.map).join(',')`), 'rig,house');
    await evaluate(ws, `window._sim.setMap('house'), true`);
    r = JSON.parse(await evaluate(ws, after(click('menuFreestyleMap'))));
    assert.equal(r.map, 'house', 'Freestyle this map on the House stays');
    assert.equal(r.toast, 'FREESTYLE — NO GATES');
    r = JSON.parse(await evaluate(ws, after(click('menuDaily') + click('dailyFly'))));
    assert.equal(r.map, 'rig', `Daily from the House flies the Rig (${r.map})`);
    if (weekId >= '2026-W45') {
      await evaluate(ws, `window._sim.setMap('house'), true`);
      r = JSON.parse(await evaluate(ws, after(click('menuBoards') + click('boardFly'))));
      assert.equal(r.map, 'rig', `Boards from the House flies the Rig (${r.map})`);
    }
    await evaluate(ws, `window._sim.setMap('house'), true`);
    r = JSON.parse(await evaluate(ws, after(click('menuCoach') + `document.querySelector('.coach-row[data-drill="tower-climb"]').click();`)));
    assert.equal(r.map, 'rig', `Coach from the House flies its drill on the Rig (${r.map})`);
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
