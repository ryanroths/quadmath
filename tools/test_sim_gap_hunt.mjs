// Gap Hunt (sim-gap-hunt.js): on the House + backyard, every named gap
// (sim-maps.js mapGaps('house')) is found when flown through its centre,
// not when flown past it; progress is saved per map and survives a reload;
// finding them all is complete, with the flying time. Then, in headless
// Chrome on both cores (bf and ?core=js), the page: a drop through the dome
// crown is found (toast, counts), a drop beside it is not, and after a
// reload the progress and the menu's Gaps list are still there.
// node --test tools/test_sim_gap_hunt.mjs
// The Chrome part is skipped with SKIP_CHROME_BOOT=1, as the other Chrome
// tests. CHROME=<path> picks the browser. Helpers are
// tools/test_sim_house_yard_page.mjs's, copied.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnBrowser } from './browser_guard.mjs';
import {
  GAP_HUNT_KEY, HUNT_MAX_STEP_M, hasHunt, huntMaps, huntGaps, makeHunt, huntStep, huntTick, huntReset,
  huntCounts, huntComplete, huntList, loadHuntProgress, saveHuntProgress, fmtHuntTime, huntShareText,
} from '../sim-gap-hunt.js';
import { mapGaps, HOUSE_WS } from '../sim-maps.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SKIP = process.env.SKIP_CHROME_BOOT === '1';
const WS = HOUSE_WS;
const OTHER = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] };

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}

// Fly a straight line from a to b in steps of `step` scene units (frames),
// the clock ticking 16 ms a frame. Every event back.
function fly(h, a, b, opts) {
  const o = opts || {};
  const step = o.step || 0.12;
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    if (o.clock) { o.clock.t += 16; huntTick(h, o.clock.t); }
    const ev = huntStep(h, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
    if (ev) out.push(ev);
  }
  return out;
}

// Along the gap's axis through its centre, from d before the volume to d past it.
function throughPath(g, d) {
  const c = { x: g.gate.x, y: g.gate.y, z: g.gate.z };
  const a = { ...c }, b = { ...c };
  const k = g.gate.axis, half = (g.max[k] - g.min[k]) / 2;
  a[k] = c[k] - half - d; b[k] = c[k] + half + d;
  return [a, b];
}

// The same line moved off the opening along one of the plane's axes, by off
// past its edge.
function pastPath(g, d, which, off) {
  const [a, b] = throughPath(g, d);
  const u = OTHER[g.gate.axis][which];
  const shift = (which === 0 ? g.gate.hw : g.gate.hh) + off;
  a[u] += shift; b[u] += shift;
  return [a, b];
}

test('the House has a hunt of its 30 named gaps, each with its own hint; three hidden ones count', () => {
  assert.deepEqual(huntMaps(), ['house']);
  assert.ok(hasHunt('house') && !hasHunt('city') && !hasHunt('depot'));
  const gaps = huntGaps('house');
  const vols = mapGaps('house');
  assert.equal(gaps.length, vols.length, 'every authored gap is in the hunt');
  assert.equal(gaps.length, 30);
  assert.deepEqual(gaps.map((g) => g.name), vols.map((v) => v.name));
  for (const g of gaps) assert.notEqual(g.hint, 'Somewhere on this map.', g.name + ' has its own hint');
  for (const g of gaps) assert.ok(g.hint.length > 8 && g.hint.length <= 70 && !g.hint.includes('\n'), g.name + ': a one-line hint');
  assert.equal(new Set(gaps.map((g) => g.name)).size, gaps.length, 'names unique');
  assert.deepEqual(gaps.filter((g) => g.hidden).map((g) => g.name).sort(), ['doggy door', 'kitchen window', 'shed window']);
  const h = makeHunt('house', memStorage(), WS);
  assert.deepEqual(huntCounts(h), { found: 0, total: 30 });
  for (const r of huntList(h)) assert.equal(r.name, '???');
});

test('each gap registers when flown through its centre, either way', () => {
  for (const g of huntGaps('house')) {
    for (const back of [false, true]) {
      const h = makeHunt('house', memStorage(), WS);
      let [a, b] = throughPath(g, 0.6);
      if (back) [a, b] = [b, a];
      const evs = fly(h, a, b);
      const mine = evs.filter((e) => e.gap === g.name);
      assert.equal(mine.length, 1, `${g.name} (${back ? 'back' : 'forward'}): found once, got ${JSON.stringify(evs.map((e) => e.gap))}`);
      assert.equal(mine[0].total, 30);
      assert.equal(mine[0].hidden, g.hidden, g.name + ': hidden flag');
      assert.ok(h.found.has(g.name));
      // Through again: not a second find.
      assert.equal(fly(h, b, a).filter((e) => e.gap === g.name).length, 0, g.name + ': found only the first time');
    }
  }
});

test('each gap does not register when flown past it, beside or above/below its opening', () => {
  for (const g of huntGaps('house')) {
    for (const which of [0, 1]) {
      for (const side of [1, -1]) {
        const h = makeHunt('house', memStorage(), WS);
        const [a, b] = pastPath(g, 0.6, which, side * 0.15 * WS);
        if (side < 0) {
          // The far side: mirror the shift.
          const u = OTHER[g.gate.axis][which], s = 2 * ((which === 0 ? g.gate.hw : g.gate.hh) + 0.15 * WS);
          a[u] -= s; b[u] -= s;
        }
        fly(h, a, b);
        assert.ok(!h.found.has(g.name), `${g.name}: flown past (axis ${OTHER[g.gate.axis][which]}, side ${side}) must not count`);
      }
    }
    // Along the opening, never crossing it: not a pass.
    const h = makeHunt('house', memStorage(), WS);
    const u = OTHER[g.gate.axis][0];
    const a = { x: g.gate.x, y: g.gate.y, z: g.gate.z }, b = { ...a };
    a[u] -= g.gate.hw * 0.9; b[u] += g.gate.hw * 0.9;
    a[g.gate.axis] += 0.01; b[g.gate.axis] += 0.01;
    fly(h, a, b);
    assert.ok(!h.found.has(g.name), g.name + ': skimming along the opening must not count');
  }
});

// 20 m/s, a fast whoop pass: a frame's step (0.33 m at 60 fps, 2 m at
// 10 fps) is longer than most gaps are deep (10 cm), so a sample seldom lands
// inside one. The ring test is on the step's segment, not its samples.
const FAST_MS = 20;
test('at 20 m/s each gap still registers through its centre, at 60, 30, 15 and 10 fps, wherever the frames fall; past it, still not', () => {
  for (const fps of [60, 30, 15, 10]) {
    const step = FAST_MS * WS / fps;
    assert.ok(step < HUNT_MAX_STEP_M * WS, `${fps} fps: a 20 m/s step (${(step / WS).toFixed(2)} m) is under the teleport guard`);
    for (const g of huntGaps('house')) {
      for (const phase of [0, 0.37, 0.81]) {
        const [a0, b] = throughPath(g, 3 * WS);
        // Start a fraction of a step further back, so the plane falls at
        // another point of a step.
        const k = g.gate.axis, a = { ...a0 };
        a[k] -= Math.sign(b[k] - a0[k]) * step * phase;
        const h = makeHunt('house', memStorage(), WS);
        const evs = fly(h, a, b, { step });
        assert.equal(evs.filter((e) => e.gap === g.name).length, 1, `${g.name} at 20 m/s, ${fps} fps, phase ${phase}: found once`);
        const hp = makeHunt('house', memStorage(), WS);
        const [pa, pb] = pastPath(g, 3 * WS, 0, 0.15 * WS);
        pa[k] -= Math.sign(pb[k] - pa[k]) * step * phase;
        fly(hp, pa, pb, { step });
        assert.ok(!hp.found.has(g.name), `${g.name} at 20 m/s, ${fps} fps: flown past, not found`);
      }
    }
  }
});

test('a respawn or teleport across a gap is not a pass', () => {
  const g = huntGaps('house').find((x) => x.name === 'bookshelf gap');
  const [a, b] = throughPath(g, 0.6);
  // One step longer than the guard, straight through the centre.
  const h = makeHunt('house', memStorage(), WS);
  const far = { ...a }, k = g.gate.axis;
  far[k] = g.gate[k] - HUNT_MAX_STEP_M * WS * 0.6; const far2 = { ...b }; far2[k] = g.gate[k] + HUNT_MAX_STEP_M * WS * 0.6;
  huntStep(h, far);
  assert.equal(huntStep(h, far2), null);
  // huntReset: the next step starts over (no step from before it).
  const h2 = makeHunt('house', memStorage(), WS);
  huntStep(h2, a);
  huntReset(h2);
  assert.equal(huntStep(h2, b), null, 'no step from before the reset');
  assert.ok(!h2.found.has(g.name));
  // huntReset with the spawn (the page's placeQuadAt): a far respawn is not
  // a step, and the first frame from the spawn through the gap counts.
  const h3 = makeHunt('house', memStorage(), WS);
  huntStep(h3, far2);
  huntReset(h3, a);
  const ev = huntStep(h3, b);
  assert.ok(ev && ev.gap === g.name, 'first frame from the spawn through the gap: ' + JSON.stringify(ev));
});

test('progress survives a reload, per map; bad or missing storage is a fresh hunt', () => {
  const st = memStorage();
  const h = makeHunt('house', st, WS);
  const names = ['bookshelf gap', 'doggy door', 'dome crown'];
  for (const n of names) fly(h, ...throughPath(huntGaps('house').find((g) => g.name === n), 0.6));
  assert.equal(h.found.size, 3);
  const raw = JSON.parse(st.getItem(GAP_HUNT_KEY));
  assert.deepEqual(Object.keys(raw.maps), ['house'], 'saved under its map');
  // Reload: a new hunt from the same storage.
  const h2 = makeHunt('house', st, WS);
  assert.deepEqual([...h2.found].sort(), [...names].sort());
  assert.deepEqual(huntCounts(h2), { found: 3, total: 30 });
  const list = huntList(h2);
  assert.equal(list.filter((r) => r.found).length, 3);
  assert.ok(list.some((r) => r.found && r.name === 'doggy door' && r.hidden));
  assert.equal(list.filter((r) => r.name === '???').length, 27);
  // Two tabs: the one that saves last keeps the other's finds and longer time.
  const tabA = makeHunt('house', st, WS), tabB = makeHunt('house', st, WS);
  fly(tabA, ...throughPath(huntGaps('house').find((g) => g.name === 'shed door'), 0.6));
  fly(tabB, ...throughPath(huntGaps('house').find((g) => g.name === 'tube slide'), 0.6));
  assert.deepEqual(loadHuntProgress('house', st).found.sort(), [...names, 'shed door', 'tube slide'].sort(), 'neither tab loses a find the other made');
  // Another map's progress is its own.
  saveHuntProgress('depot', { found: ['rack gap'], ms: 5 }, st);
  assert.deepEqual(loadHuntProgress('house', st).found.sort(), [...names, 'shed door', 'tube slide'].sort());
  assert.deepEqual(loadHuntProgress('depot', st).found, ['rack gap']);
  // Names no longer on the map are not counted.
  const st2 = memStorage();
  saveHuntProgress('house', { found: ['bookshelf gap', 'gone gap'], ms: 0 }, st2);
  assert.deepEqual(huntCounts(makeHunt('house', st2, WS)), { found: 1, total: 30 });
  // Unreadable, throwing, or no storage: a fresh hunt, never a throw.
  const bad = memStorage(); bad.setItem(GAP_HUNT_KEY, '{nope');
  assert.equal(makeHunt('house', bad, WS).found.size, 0);
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const h3 = makeHunt('house', boom, WS);
  const evs = fly(h3, ...throughPath(huntGaps('house')[0], 0.6));
  assert.equal(evs.length, 1, 'still found in the session');
  assert.equal(saveHuntProgress('house', { found: [] }, boom), false);
  const h4 = makeHunt('house', null, WS);
  assert.equal(fly(h4, ...throughPath(huntGaps('house')[0], 0.6)).length, 1);
});

test('all 30: complete on the last, with the flying time from the first find; pauses do not count; it survives a reload', () => {
  const st = memStorage();
  const h = makeHunt('house', st, WS);
  const clock = { t: 1000 };
  const gaps = huntGaps('house');
  let last = null;
  for (let i = 0; i < gaps.length; i++) {
    // A pause between some finds (menu open): the clock jumps, not counted.
    if (i === 5) { clock.t += 60000; huntTick(h, clock.t); }
    const evs = fly(h, ...throughPath(gaps[i], 0.6), { clock });
    const mine = evs.find((e) => e.gap === gaps[i].name) || null;
    if (!h.found.has(gaps[i].name)) assert.fail(gaps[i].name + ' not found');
    if (mine) last = mine;
    if (i < gaps.length - 1) assert.equal(huntComplete(h), h.found.size === 30);
  }
  assert.ok(huntComplete(h));
  assert.ok(last && last.complete && last.found === 30 && last.total === 30, JSON.stringify(last));
  assert.ok(h.doneMs > 0 && h.doneMs < 60000, 'flying time without the pause: ' + h.doneMs);
  const done = h.doneMs;
  clock.t += 16; huntTick(h, clock.t); clock.t += 16; huntTick(h, clock.t);
  assert.equal(h.doneMs, done, 'the time stops at the last find');
  const h2 = makeHunt('house', st, WS);
  assert.ok(huntComplete(h2));
  assert.equal(h2.doneMs, done);
  assert.match(fmtHuntTime(done), /^\d+:\d\d$/);
  assert.equal(fmtHuntTime(3723000), '1:02:03');
  assert.match(huntShareText('house', 30, done), /all 30 gaps .*House \+ backyard.* in \d+:\d\d/);
});

test('sim.html wires the hunt: import, the frame, a respawn, the menu, the toasts, the card', () => {
  const html = readFileSync(join(root, 'sim.html'), 'utf8');
  assert.match(html, /from "\.\/sim-gap-hunt\.js\?v=[0-9a-f]{12}"/, 'stamped import');
  assert.match(html, /stepCore\(frameMs,now\);\s*updateSunShadow\(\);updateOSD\(\);updateGates\(\);updateGapHunt\(\);/, 'after each core step, either core');
  assert.match(html, /syncStateFromCore\(\);\s*if\(gapHunt\)huntReset\(gapHunt,state\.pos\);/, 'placeQuadAt starts the hunt from the spawn');
  assert.match(html, /<button class="menu-flight" id="menuGaps" style="display:none">Gaps<\/button>/, 'Gaps in the in-flight menu');
  assert.match(html, /on\('menuGaps',\(\)=>openGapsCard\(\)\);/);
  assert.match(html, /cls:'gap-secret'/, 'the hidden toast');
  assert.match(html, /id="gapShare">SHARE<\/button>/, 'SHARE on the completion card');
  assert.match(html, /addEventListener\('pagehide'/, 'flying time kept on pagehide');
  // No new art: the hunt adds no mesh or texture.
  const src = readFileSync(join(root, 'sim-gap-hunt.js'), 'utf8');
  assert.doesNotMatch(src, /THREE|Texture|Mesh|new Image|\.png|\.ktx2/);
});

// ---------------- Chrome: the page, both cores ----------------

function resolveChrome() {
  const names = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'chrome'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}

let runDirPath = null;
function runDir() {
  if (!runDirPath) runDirPath = mkdtempSync(join(tmpdir(), 'qm-gaps-'));
  return runDirPath;
}
function removeDir(dir) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* best effort */ }
}
let bootSeq = 0;
const liveChromes = new Set();
function startChrome(startUrl, profile) {
  bootSeq += 1;
  const run = { port: 9840 + bootSeq, profile };
  run.child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--window-size=1200,760',
    `--remote-debugging-port=${run.port}`, `--user-data-dir=${profile}`, startUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  liveChromes.add(run);
  return run;
}
function exited(child) { return child.exitCode !== null || child.signalCode !== null; }
function killTree(child) {
  if (exited(child)) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch (e) {
    try { child.kill('SIGKILL'); } catch (e2) { /* gone */ }
  }
}
async function stopChrome(run) {
  killTree(run.child);
  if (!exited(run.child)) await Promise.race([new Promise((res) => run.child.once('exit', res)), sleep(5000)]);
  liveChromes.delete(run);
}
function cleanUp() {
  for (const run of liveChromes) killTree(run.child);
  liveChromes.clear();
  if (runDirPath) removeDir(runDirPath);
  runDirPath = null;
}
after(cleanUp);
process.on('exit', cleanUp);
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function mime(p) {
  return ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' })[extname(p)] || 'application/octet-stream';
}
async function serveRoot() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    try { res.writeHead(200, { 'content-type': mime(file) }); res.end(readFileSync(file)); } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  return { server, port: server.address().port };
}
async function cdp(ws, method, params) {
  if (ws.readyState !== 1) throw new Error('cdp socket closed before ' + method);
  const id = cdp._n = (cdp._n || 0) + 1;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(t); ws.removeEventListener('message', on); ws.removeEventListener('close', closed); };
    const t = setTimeout(() => { done(); reject(new Error('cdp timeout ' + method)); }, 40000);
    function closed() { done(); reject(new Error('cdp socket closed during ' + method)); }
    function on(msg) {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        if (o.id === id) { done(); if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {}); }
      } catch (e) { /* ignore */ }
    }
    ws.addEventListener('message', on);
    ws.addEventListener('close', closed);
  });
}
async function waitForCdpPage(port, tries) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try {
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const hit = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      if (hit) return hit;
    } catch (e) { /* coming up */ }
  }
  return null;
}
async function evaluate(ws, expression) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result ? r.result.value : undefined;
}
const CLOSE_MENU_SRC = `(function(){
  ['startMenu','feelPrompt','menuLayer','legend','audioHint','panel','firstFlight'].forEach(function(id){
    var el=document.getElementById(id); if(!el)return;
    el.classList.remove('open','show'); el.style.display='none';
  });
  document.body.classList.remove('menu-open');
  var s=window._sim||{};
  if(s.looks&&s.looks.setMenuOpen)s.looks.setMenuOpen(false);
  if(window._feel&&window._feel.hideFirstRun)window._feel.hideFirstRun();
  return true;
})()`;

// Put the quad (unarmed) just above the dome crown's plane, at its centre or
// off to one side by `off` scene units, and let it fall: the frames' steps
// cross the plane. Back: the hunt's state and the toast after `ms`.
function dropSrc(off, ms) {
  return `new Promise(function(done){
  var s=window._sim, h=s.gapHunt(); var g=h.gaps.find(function(x){return x.name==='dome crown';}).gate;
  s.setLookSpot&&s.setLookSpot(null);
  s.placeQuadAt(g.x+${off},g.y+0.18,g.z,0);
  var ys=[],k=0,iv=setInterval(function(){
    var q=s.flyCheck().quad; ys.push([+q.x.toFixed(2),+q.y.toFixed(3),+q.z.toFixed(2),Math.round(s.simClockMs())]);
    if(++k>=8)clearInterval(iv);
  },${ms}/10);
  setTimeout(function(){
    var t=document.getElementById('toast');
    done({hunt:s.gapHunt(),toast:t?t.textContent:'',cls:t?t.className:'',gate:g,ys:ys,menu:!!(s.looks&&s.looks.menuOpen)});
  },${ms});
})`;
}

async function bootPage(url, profile, core) {
  const run = startChrome(url, profile);
  const page = await waitForCdpPage(run.port, 150);
  assert.ok(page, 'Chrome DevTools page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  const errors = [];
  ws.addEventListener('message', (msg) => {
    try {
      const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
      if (o.method === 'Runtime.exceptionThrown') {
        const ex = o.params.exceptionDetails || {};
        errors.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'exception');
      }
    } catch (e) { /* ignore */ }
  });
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await waitReady(ws, core);
  return { run, ws, errors };
}

async function waitReady(ws, core) {
  let ready = null;
  for (let i = 0; i < 240; i++) {
    ready = await evaluate(ws, `(function(){var s=window._sim||{};var f=s.looks&&s.looks.fps;
      return {map:s.map?s.map():null,ready:!!(f&&f.ready),core:s.core?s.core():null,hunt:!!(s.gapHunt&&s.gapHunt())};})()`);
    if (ready && ready.map === 'house' && ready.ready && ready.core === core && ready.hunt) break;
    await sleep(250);
  }
  assert.equal(ready.map, 'house', 'on the House');
  assert.equal(ready.core, core, 'the ' + core + ' core');
  assert.ok(ready.hunt, 'the House has its hunt');
}

for (const core of ['bf', 'js']) {
  test(`in Chrome (${core} core): a drop through the dome crown is found, one beside it is not, and both the find and the Gaps list survive a reload`, { skip: SKIP ? 'SKIP_CHROME_BOOT=1' : false, timeout: 300000 }, async (t) => {
    const { server, port } = await serveRoot();
    const url = `http://127.0.0.1:${port}/sim.html?map=house&menu=1&fpv=1&quality=low${core === 'js' ? '&core=js' : ''}`;
    const profile = join(runDir(), 'profile-' + core);
    let b = null;
    try {
      // A new profile: nothing stored yet.
      b = await bootPage(url, profile, core);
      let h = await evaluate(b.ws, 'window._sim.gapHunt()');
      assert.equal(h.found, 0, 'a fresh hunt');
      assert.equal(h.total, 30);
      await evaluate(b.ws, CLOSE_MENU_SRC);
      // Beside: a metre and a half off the crown's opening, the same height.
      const past = await evaluate(b.ws, dropSrc(1.5 * WS + 2, 2500));
      t.diagnostic('beside: ' + JSON.stringify({ found: past.hunt.found, names: past.hunt.names, ys: past.ys, menu: past.menu }));
      assert.ok(!past.hunt.names.includes('dome crown'), 'falling past the crown is not a find');
      // Through: the centre.
      const thru = await evaluate(b.ws, dropSrc(0, 2500));
      t.diagnostic('through: ' + JSON.stringify({ found: thru.hunt.found, names: thru.hunt.names, toast: thru.toast, gate: thru.gate, ys: thru.ys, menu: thru.menu }));
      assert.ok(thru.hunt.names.includes('dome crown'), 'falling through the crown is a find');
      assert.equal(thru.hunt.found, past.hunt.found + 1);
      assert.match(thru.toast, /DOME CROWN · \d+ \/ 30/, 'the toast: its name and found / total');
      assert.match(thru.cls, /gap-toast/);
      assert.deepEqual(b.errors, [], 'no page errors');
      // Reload the page: the find is kept, and the menu's Gaps lists it by name.
      await cdp(b.ws, 'Page.reload', { ignoreCache: true });
      await sleep(1500);
      await waitReady(b.ws, core);
      h = await evaluate(b.ws, 'window._sim.gapHunt()');
      assert.ok(h.names.includes('dome crown'), 'kept over a reload: ' + JSON.stringify(h.names));
      assert.equal(h.found, thru.hunt.found);
      const card = await evaluate(b.ws, `(function(){window._sim.openGapsCard();var l=document.getElementById('menuLayer');
        var rows=[].map.call(l.querySelectorAll('.gap-list li'),function(li){return {found:li.classList.contains('found'),name:li.querySelector('b').textContent,hint:li.querySelector('i').textContent};});
        return {h2:l.querySelector('h2').textContent,rows:rows};})()`);
      assert.equal(card.rows.length, 30);
      assert.match(card.h2, new RegExp('Gaps · ' + h.found + ' / 30'));
      assert.ok(card.rows.some((r) => r.found && r.name === 'dome crown'), 'dome crown by name');
      assert.equal(card.rows.filter((r) => !r.found).every((r) => r.name === '???' && r.hint.length > 0), true, 'unfound: ??? with a hint');
      assert.deepEqual(b.errors, [], 'no page errors after the reload');
      // All of them (stored, then a reload): the card has the time and SHARE.
      await evaluate(b.ws, `(function(){var h=window._sim.gapHunt();localStorage.setItem(${JSON.stringify(GAP_HUNT_KEY)},
        JSON.stringify({v:1,maps:{house:{found:h.gaps.map(function(g){return g.name;}),ms:754000,doneMs:754000}}}));return true;})()`);
      await cdp(b.ws, 'Page.reload', { ignoreCache: true });
      await sleep(1500);
      await waitReady(b.ws, core);
      const done = await evaluate(b.ws, `new Promise(function(res){var s=window._sim;s.openGapHuntDone();var l=document.getElementById('menuLayer');
        var out={h2:l.querySelector('h2').textContent,time:(document.getElementById('gapDoneTime')||{}).textContent,share:!!document.getElementById('gapShare'),hunt:s.gapHunt()};
        document.getElementById('gapShare').click();
        setTimeout(function(){out.toast=document.getElementById('toast').textContent;res(out);},400);})`);
      t.diagnostic('done: ' + JSON.stringify({ h2: done.h2, time: done.time, toast: done.toast }));
      assert.equal(done.hunt.found, 30);
      assert.equal(done.h2, 'All 30 gaps found');
      assert.equal(done.time, '12:34');
      assert.ok(done.share, 'SHARE');
      assert.ok(done.toast === 'GAP HUNT COPIED' || /all 30 gaps .* in 12:34 .*sim\.html\?map=house/.test(done.toast), 'SHARE copies (or shows) the text: ' + done.toast);
      assert.deepEqual(b.errors, [], 'no page errors on the card');
    } finally {
      if (b) { try { b.ws.close(); } catch (e) { /* closed */ } await stopChrome(b.run); }
      server.close();
    }
  });
}
