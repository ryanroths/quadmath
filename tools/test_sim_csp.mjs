// The sim's Content-Security-Policy (step 1): a <meta http-equiv> first in
// sim.html's <head>, and sim-csp.js, which warns in the console about anything
// it blocks.
//   - In node: the policy is exactly the one tested, before anything it
//     governs; the page writes no on*= handler into markup (script-src-attr
//     'none' would stop it); sim-csp.js's warning names the directive and what
//     was blocked.
//   - In headless Chrome, under the policy as the page carries it, with not
//     one violation: the Betaflight core and the js core, each armed and
//     flown on the keyboard, on all four open maps; a run on the Rig Loop and
//     its SHARE from the lap panel and the pause menu (by the mouse) and on K;
//     the menus and cards; the leaderboard read (boards, Daily Line) and
//     posted to (a line stored); a room created in one tab and joined from
//     another. Then <img onerror> and <svg onload> put into the page do not
//     run, and the page's own listener warns about each.
//     The leaderboard is its real handler on an in-memory D1, answering the
//     page in place of the network (CDP Fetch); the rooms are the real rooms
//     Worker under `wrangler dev` over https, reached at the deployed address
//     (Chrome maps that host to it), so the policy judges the URLs the live
//     site uses. Nothing reaches a deployed Worker; any other host is
//     refused after the policy has passed it (the analytics script, say).
//   - The same boot, flights, maps, menus and SHARE in Playwright's WebKit
//     and Firefox, where installed (PLAYWRIGHT=<the playwright package>).
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); rooms need
// wrangler (tools/sim_rooms_dev.mjs) and are skipped without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LEADERBOARD_URL } from '../sim-retention.js';
import { ROOMS_URL } from '../sim-ghost-rooms.js';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';
import { findWrangler, startRoomsDev, startLeaderboardDev, trustCert } from './sim_rooms_dev.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
const WS = 3.5; // scene units per metre (sim-core-adapter.js WS)

// Step 1, as it was tried before it was proposed. A change here is a change to
// the policy the live site runs under: it is meant to be one.
const POLICY = "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; " +
  "script-src-attr 'none'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "font-src 'self'; " +
  'connect-src \'self\' data: blob: https://cdn.jsdelivr.net https://sim-leaderboard.ryan-roths.workers.dev ' +
  'https://sim-rooms.ryan-roths.workers.dev wss://sim-rooms.ryan-roths.workers.dev https://cloudflareinsights.com ' +
  // A Worker on this machine, for local development (?lb=, ?rooms=).
  'http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* ' +
  'http://127.0.0.1:* https://127.0.0.1:* ws://127.0.0.1:* wss://127.0.0.1:*; ' +
  "worker-src 'self' blob:; " +
  "frame-src 'none'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none'";

test('the policy: a <meta> first in <head>, exactly as agreed (step 1, and this machine for connections), with sim-csp.js right after it', () => {
  const html = read('sim.html');
  const metas = [...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)">/gi)];
  assert.equal(metas.length, 1, 'one policy');
  assert.equal(metas[0][1], POLICY, 'the policy as tested');
  assert.equal((html.match(/Content-Security-Policy/gi) || []).length, 2, 'named once more, in the comment above it, and nowhere else');
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  const at = head.indexOf(metas[0][0]);
  // Before it: the charset and the viewport, and comments. Nothing it governs.
  const before = head.slice('<head>'.length, at).replace(/<!--[\s\S]*?-->/g, '').trim();
  assert.match(before, /^<meta charset="UTF-8">\s*<meta name="viewport" content="[^"]*">$/, 'only the charset and the viewport before it: ' + before.slice(0, 200));
  // Right after it: the listener, a plain file from this site, before anything else.
  const after = head.slice(at + metas[0][0].length).trimStart();
  assert.match(after, /^<script src="sim-csp\.js\?v=[0-9a-f]{12}"><\/script>\s*<title>/, 'sim-csp.js first');
  // Step 1: handlers off, no base, frames, plugins or form posts.
  const dirs = Object.fromEntries(POLICY.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(dirs['script-src-attr'], ["'none'"]);
  for (const k of ['frame-src', 'object-src', 'base-uri', 'form-action']) assert.deepEqual(dirs[k], ["'none'"], k);
  // This machine, any port, for connections only (a Worker in local
  // development); no other directive names it, and nothing else is a wildcard.
  const LOCAL = ['http://localhost:*', 'https://localhost:*', 'ws://localhost:*', 'wss://localhost:*',
    'http://127.0.0.1:*', 'https://127.0.0.1:*', 'ws://127.0.0.1:*', 'wss://127.0.0.1:*'];
  assert.deepEqual(dirs['connect-src'].filter((src) => /localhost|127\.0\.0\.1/.test(src)), LOCAL, 'connect-src: this machine');
  assert.ok(dirs['connect-src'].filter((src) => src.includes('*')).every((src) => LOCAL.includes(src)), 'connect-src: no other wildcard');
  // Its other sources: this site, data:, blob:, or a named https or wss host. No bare scheme, no plain http or ws.
  for (const src of dirs['connect-src']) {
    if (LOCAL.includes(src)) continue;
    assert.ok(["'self'", 'data:', 'blob:'].includes(src) || /^(https|wss):\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(src), 'connect-src: ' + src);
  }
  // Each directive once (a second one would be read past by the checks above).
  const names = POLICY.split(';').map((d) => d.trim().split(/\s+/)[0]);
  assert.equal(new Set(names).size, names.length, 'no directive twice');
  for (const [k, v] of Object.entries(dirs)) {
    if (k === 'connect-src') continue;
    assert.ok(!v.some((src) => /localhost|127\.0\.0\.1|^http:|^ws:|\*/.test(src)), k + ': no local host, plain http or ws, or wildcard');
  }
  assert.match(read('scripts/ci/stamp_asset_cache.py'), /"sim-csp\.js",/, 'sim-csp.js is stamped');
});

test('the page writes no on*= handler into markup (script-src-attr \'none\' would stop it)', () => {
  // A handler attribute: whitespace, on<name>, =, inside a tag or a string that builds one.
  // Attribute names are any case. setAttribute('on...') is the same thing by another road.
  const handler = /<[a-zA-Z][^<>]*\son[a-z]+\s*=|setAttribute\(\s*['"`]on/i;
  assert.ok(handler.test(`box.innerHTML = '<img src="x" onerror="a()">';`) && handler.test('<b onClick=x>') && handler.test("el.setAttribute('onclick', f)"), 'the pattern finds an attribute');
  assert.ok(!handler.test('b.onclick=()=>go();'), 'and not a property');
  // Every script the page runs: sim.html, its modules and the classic tune-database.js.
  const files = ['sim.html', 'quadphysics.js', 'tune-database.js', ...readdirSync(root).filter((f) => /^sim-[a-z0-9-]+\.js$/.test(f))];
  assert.ok(files.includes('sim-csp.js') && files.includes('sim-tricks-debug.js') && files.length >= 35, files.length + ' files');
  const bad = [];
  for (const f of files) {
    read(f).split(/\r?\n/).forEach((line, i) => { if (handler.test(line)) bad.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 120)); });
  }
  assert.deepEqual(bad, [], 'handlers are set from script (el.onclick=), never as attributes');
});

test('sim-csp.js: whatever the policy blocks is a console warning naming the directive and what was blocked', () => {
  let listener = null, kind = null;
  const warned = [];
  const doc = { addEventListener(k, f) { kind = k; listener = f; } };
  new Function('document', 'console', read('sim-csp.js'))(doc, { warn: (...a) => warned.push(a.join(' ')) });
  assert.equal(kind, 'securitypolicyviolation');
  listener({ effectiveDirective: 'script-src-attr', blockedURI: 'inline', sourceFile: 'https://quadmath.com/sim.html', lineNumber: 9 });
  listener({ effectiveDirective: 'connect-src', blockedURI: 'https://evil.example/x', sourceFile: '', lineNumber: 0 });
  listener({ effectiveDirective: 'img-src', blockedURI: '' });
  assert.deepEqual(warned, [
    '[CSP] script-src-attr blocked inline at https://quadmath.com/sim.html:9',
    '[CSP] connect-src blocked https://evil.example/x',
    '[CSP] img-src blocked (no URI)',
  ]);
});

// ---- the browsers ----

// An in-memory D1 for what the leaderboard Worker runs: lines, the rate limit,
// and empty boards.
function fakeD1() {
  const lines = new Map(), rate = new Map();
  return {
    lines,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() {
          if (/FROM rate_limit/.test(sql)) { const n = rate.get(args.join('|')); return n ? { n } : null; }
          if (/FROM lines/.test(sql)) { const code = lines.get(args[0]); return code ? { code } : null; }
          return null;
        },
        async run() {
          if (/INTO rate_limit/.test(sql)) { const k = args.join('|'); rate.set(k, (rate.get(k) || 0) + 1); return {}; }
          if (/INTO lines/.test(sql)) { if (!lines.has(args[0])) lines.set(args[0], args[1]); return {}; }
          return {};
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
}

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

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// Before the page's scripts: every violation the document sees.
const COLLECT = String.raw`(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__csp.push({ d: e.effectiveDirective, u: String(e.blockedURI || '').slice(0, 120), f: String(e.sourceFile || '').slice(-60), l: e.lineNumber });
  }, true);
})()`;

// In the page, once it flies: waiting, the lap panel, a run flown gate to
// gate, what a share said, where a button is.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(20); }
    return !!fn();
  };
  const $ = (id) => document.getElementById(id);
  const toast = () => $('toast').textContent;
  // The quad put at each gate of the active track in turn (the bf core's own
  // teleport): gate 1 starts the run, the last finishes it. A pass is entering
  // a gate's sphere, so a gate whose sphere already holds the gate before it
  // is entered from above it. A hop once the page has counted the gate.
  async function flyGates() {
    const track = s.tracks().find((t) => t.id === s.track());
    const b = s.bfCore();
    // The gate number only: the split beside it ticks every frame.
    const counter = () => (/ GATE (\d+)\//.exec($('osdGate').textContent) || [])[1];
    for (const g of track.gates) {
      const before = counter();
      const put = (up) => b.teleport({ x: -g.z / ${WS}, y: -g.x / ${WS}, z: (g.y + up) / ${WS} }, { x: 0, y: 0, z: 0, w: 1 });
      put(0);
      let counted = await until(() => counter() !== before, 600);
      for (let i = 0; i < 3 && !counted; i++) {
        put(3 * (g.size || 2));
        await wait(120);
        put(0);
        counted = await until(() => counter() !== before, 600);
      }
      await wait(150);
    }
    return until(() => !!$('lapShare'), 4000);
  }
  async function shared(before) {
    const said = await until(() => /LINK COPIED|CLIPBOARD BLOCKED/.test(toast()) && s.line().link !== before, 8000);
    return { said, toast: toast(), link: s.line().link };
  }
  // Where a button is, and whether it is what the pilot sees and clicks there.
  function spot(id) {
    const el = $(id);
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, hit: top === el, disabled: !!el.disabled, text: el.textContent };
  }
  const state = () => { const c = s.coreState(); return { core: s.core(), armed: !!c.armed, z: +(+c.position.z).toFixed(2), flags: c.armingDisableFlags || 0 }; };
  window.__t = { s, wait, until, $, toast, flyGates, shared, spot, state };
  return true;
})()`;

// What a browser is driven with: CDP for Chrome, Playwright for the others.
// js(body) runs an async body in the page with T = window.__t; key presses
// and lets go; hold presses or lets go; click is the mouse at an element.
async function flows(d, label, { core, share, menus, record }) {
  const say = (m) => console.log(label + ': ' + m);
  const ready = await d.js(`return JSON.stringify({ meta: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, core: T.s.core() });`);
  assert.equal(ready.meta, POLICY, label + ': the page carries the policy');
  assert.equal(ready.core, core, label + ': the ' + core + ' core');

  // The keyboard, from the first-run prompt if it is up.
  await d.js(`if (window._feel && window._feel.promptOpen && T.$('feelKeys')) T.$('feelKeys').click(); await T.wait(1500); return 1;`);
  let armed = false;
  for (let i = 0; i < 6 && !armed; i++) {
    await d.key(' ', 'Space', 32);
    armed = await d.js(`return await T.until(() => T.state().armed, 1500);`);
  }
  assert.equal(armed, true, label + ': Space arms');
  await d.hold(true, 'w', 'KeyW', 87);
  await sleep(2200);
  await d.hold(false, 'w', 'KeyW', 87);
  let st = await d.js(`return T.state();`);
  say('armed and flown: ' + JSON.stringify(st));
  assert.equal(st.armed, true, label + ': still armed');
  assert.ok(st.z > 0.3, label + ': it climbed (' + st.z + ' m)');
  await d.hold(true, 's', 'KeyS', 83);
  await sleep(1500);
  await d.hold(false, 's', 'KeyS', 83);
  await d.key(' ', 'Space', 32);
  await sleep(800);
  record('arm and fly');

  if (share) {
    // A run on the Rig Loop (the boot's track), long enough a link that the
    // Worker keeps it: a post to the leaderboard.
    let r = await d.js(`T.s.setLineUrlMax(200); const done = await T.flyGates(); return JSON.stringify({ done, panel: T.$('osdLap').textContent.slice(0, 40) });`);
    assert.equal(r.done, true, label + ': the run finished with SHARE on the lap panel: ' + r.panel);
    const before = await d.js(`return T.s.line().link;`);
    let hit = await d.click('lapShare');
    assert.deepEqual([hit.found, hit.hit, hit.text], [true, true, 'SHARE'], label + ': panel SHARE under the mouse');
    r = await d.js(`return JSON.stringify(await T.shared(${JSON.stringify(before)}));`);
    say('panel SHARE: ' + r.toast);
    assert.equal(r.said, true, label + ': the panel SHARE copied: ' + r.toast);
    assert.match(r.link, /#line=@[A-Za-z0-9_-]{10,32}$/, label + ': stored on the Worker');
    const link = r.link;
    record('panel SHARE');
    // The pause menu's.
    await d.key('Escape', 'Escape', 27);
    await sleep(500);
    await d.js(`T.s.setLineUrlMax(0); return 1;`);
    hit = await d.click('menuShare');
    assert.deepEqual([hit.found, hit.hit, hit.text], [true, true, 'SHARE last run'], label + ': menu SHARE under the mouse');
    r = await d.js(`return JSON.stringify(await T.shared(${JSON.stringify(link)}));`);
    say('menu SHARE: ' + r.toast);
    assert.equal(r.said, true, label + ': the menu SHARE copied: ' + r.toast);
    record('menu SHARE');
    // K, in flight.
    await d.js(`T.$('menuResume').click(); await T.wait(400); T.s.setLineUrlMax(200); return 1;`);
    const k0 = r.link;
    await d.key('k', 'KeyK', 75);
    r = await d.js(`return JSON.stringify(await T.shared(${JSON.stringify(k0)}));`);
    say('K: ' + r.toast);
    assert.equal(r.said, true, label + ': K copied: ' + r.toast);
    assert.equal(r.link, link, label + ': K shares the same run as the panel');
    record('K');
  }

  if (menus) {
    // Every menu and card a pilot can open, each closed again. The launch
    // screen's (Daily, Boards, Tune, Controls) by their buttons too.
    const opened = await d.js(`
      const out = [];
      const what = (id) => ({ id, h2: document.querySelector('#menuLayer.show h2') ? document.querySelector('#menuLayer.show h2').textContent : null,
        panel: T.$('panel').classList.contains('open'), track: T.s.track() });
      const closeAll = async () => {
        if (T.$('builderClose') && document.body.classList.contains('builder-on')) T.$('builderClose').click();
        if (T.$('layerClose')) T.$('layerClose').click();
        if (T.$('panel').classList.contains('open')) T.$('panel').classList.remove('open');
        await T.wait(200);
      };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await T.wait(400);
      for (const id of ['menuTracks', 'menuCoach', 'menuBuild', 'menuGhostCodes', 'menuGhostRoom', 'menuDaily', 'menuDailyLine', 'menuBoards', 'menuTune', 'menuControls', 'menuHowTo', 'menuWhoop', 'menuFreestyleMap']) {
        const b = T.$(id);
        if (!b) { out.push({ id, missing: true }); continue; }
        b.click();
        await T.wait(700);
        if (id === 'menuBoards' && T.$('boardRefresh')) { T.$('boardRefresh').click(); await T.wait(700); }
        out.push(what(id));
        await closeAll();
        if (!document.body.classList.contains('menu-open')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await T.wait(400); }
      }
      T.$('menuBuilder').click();
      await T.wait(900);
      out.push({ id: 'menuBuilder', builder: document.body.classList.contains('builder-on') });
      await closeAll();
      if (!document.body.classList.contains('menu-open')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await T.wait(400); }
      T.$('menuReplay').click();
      await T.wait(1500);
      out.push({ id: 'menuReplay', replay: T.s.replayOn() });
      return JSON.stringify(out);`);
    say('menus: ' + opened.map((m) => m.id + ':' + (m.h2 || (m.panel ? 'panel' : '') || (m.builder ? 'builder' : '') || (m.replay ? 'replay' : '') || m.track)).join(', '));
    const by = Object.fromEntries(opened.map((m) => [m.id, m]));
    const cards = { menuTracks: 'Tracks', menuCoach: 'Coach', menuBuild: 'Your build', menuGhostRoom: 'Room', menuDaily: 'Daily whoop',
      menuDailyLine: 'Daily Line', menuBoards: 'Weekly boards', menuControls: 'Controls', menuHowTo: 'How to', menuWhoop: 'Whoop' };
    for (const [id, h2] of Object.entries(cards)) assert.equal(by[id] && by[id].h2, h2, label + ': ' + id + ' opens its card: ' + JSON.stringify(by[id]));
    for (const id of ['menuTune', 'menuGhostCodes']) assert.equal(by[id] && by[id].panel, true, label + ': ' + id + ' opens Tune: ' + JSON.stringify(by[id]));
    assert.match(String(by.menuFreestyleMap && by.menuFreestyleMap.track), /freestyle$/, label + ': Freestyle this map');
    assert.equal(by.menuBuilder.builder, true, label + ': the track builder opens');
    assert.equal(by.menuReplay.replay, true, label + ': the replay plays');
    await d.key('Escape', 'Escape', 27); // ends the replay
    await sleep(600);
    await d.js(`if (document.body.classList.contains('menu-open')) T.$('menuResume').click(); await T.wait(300); return 1;`);
    record('menus');
  }

  // All four open maps, by the track picker.
  const tabs = await d.js(`
    T.s.openTrackPicker('rig');
    await T.wait(300);
    const tabs = [...document.querySelectorAll('#menuLayer .track-maps [data-map]')].map((b) => b.dataset.map);
    T.$('layerClose').click();
    return JSON.stringify(tabs);`);
  const maps = { tabs, out: [] };
  for (const m of tabs) {
    maps.out.push(await d.js(`
      T.s.openTrackPicker(${JSON.stringify(m)});
      await T.wait(300);
      const row = document.querySelector('#menuLayer .track-list [data-tid]');
      if (!row) return ${JSON.stringify(m + ':no row')};
      row.click();
      await T.until(() => T.s.map() === ${JSON.stringify(m)}, 15000);
      await T.wait(5000);
      return ${JSON.stringify(m + ':')} + T.s.map() + ':' + (T.s.artError() || 'ok');`));
  }
  say('maps: ' + maps.out.join(', '));
  assert.deepEqual(maps.tabs, ['rig', 'house', 'depot', 'bando'], label + ': the four open maps');
  assert.deepEqual(maps.out, maps.tabs.map((m) => m + ':' + m + ':ok'), label + ': each map loads');
  record('maps');
}

// The markup the policy is for: a handler on an image and on an svg. Neither
// runs, and the page's listener warns about what was blocked. Whether a
// browser fires an svg's load at all varies (WebKit does not, for one put in
// by innerHTML), so each handler is also asked for: a browser compiles it on
// that read, and under the policy refuses to, and gives null.
async function injection(d, label) {
  const r = await d.js(`
    window.__pwn = null;
    const box = document.createElement('div');
    box.innerHTML = '<img src="x-missing.png" onerror="window.__pwn=1"><svg onload="window.__pwn=2"></svg>';
    document.body.appendChild(box);
    await T.wait(1500);
    const fired = window.__csp.length;
    const what = (h) => (h === null ? 'null' : typeof h);
    const compiled = { img: what(box.querySelector('img').onerror), svg: what(box.querySelector('svg').onload) };
    await T.wait(500);
    box.remove();
    return JSON.stringify({ pwn: window.__pwn, fired, compiled, csp: window.__csp.slice() });`);
  console.log(label + ' injection: ' + JSON.stringify({ pwn: r.pwn, fired: r.fired, compiled: r.compiled, csp: r.csp.length }));
  assert.equal(r.pwn, null, label + ': neither handler ran');
  assert.deepEqual(r.compiled, { img: 'null', svg: 'null' }, label + ': neither handler exists: the policy refused both (null, not a function)');
  assert.ok(r.fired >= 1, label + ': the image error was blocked as it happened: ' + JSON.stringify(r.csp));
  assert.ok(r.csp.length >= 2, label + ': each refusal is a violation: ' + JSON.stringify(r.csp));
  assert.ok(r.csp.every((v) => /^script-src(-attr)?$/.test(v.d) && v.u === 'inline'), label + ': and only those: ' + JSON.stringify(r.csp));
  return r.csp;
}

test('the sim under its policy in Chrome: no violations; injected handlers do not run', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  // Everything started is stopped in the finally, however far the setup got.
  let server = null, rooms = null, child = null, profile = null;
  let stderr = '';
  const tabs = [];
  const steps = [];
  try {
    const served = await serveRoot();
    server = served.server;
    const origin = `http://127.0.0.1:${served.port}`;
    const bin = findWrangler();
    rooms = bin ? await startRoomsDev(bin, { ALLOWED_ORIGIN: origin }, { https: true }) : null;
    if (!rooms) console.log('rooms: no wrangler (npm install in workers/sim-rooms, or WRANGLER=): the room steps are skipped');
    const worker = { env: { DB: fakeD1(), ALLOWED_ORIGIN: origin }, calls: [] };
    const outside = [];
    const local = []; // Workers on this machine, reached by ?rooms= and ?lb=: sent as they are.
    const localCalls = []; // what the page sent them
    profile = mkdtempSync(join(tmpdir(), 'qm-csp-'));
    const flags = [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      // Port 0: Chrome takes a free one and names it in DevToolsActivePort, so no
      // other test's Chrome can be the one this test drives.
      '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    ];
    // The rooms Worker answers at the deployed address: the policy judges the URL the live site uses.
    if (rooms) flags.push(`--host-resolver-rules=MAP ${new URL(ROOMS_URL).hostname} 127.0.0.1:${rooms.port}`, '--ignore-certificate-errors');
    child = spawn(resolveChrome(), [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (x) => { stderr += x.toString(); });

    // A tab: its own CDP connection, what it saw, and its driver.
    async function tab(info) {
      const ws = new WebSocket(info.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      let seq = 0;
      const waiting = new Map();
      const send = (method, params) => new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error('cdp timeout ' + method)); }, 60000);
        waiting.set(id, (o) => { clearTimeout(timer); if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {}); });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
      const seen = { warns: [], logged: [] };
      ws.addEventListener('message', async (msg) => {
        let o = null;
        try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
        if (o.id && waiting.has(o.id)) { const w = waiting.get(o.id); waiting.delete(o.id); w(o); return; }
        if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'warning') {
          const text = o.params.args.map((a) => a.value != null ? a.value : (a.description || '')).join(' ');
          if (text.startsWith('[CSP]')) seen.warns.push(text.slice(0, 200));
        } else if (o.method === 'Log.entryAdded') {
          // Workers' violations too, which never reach the document.
          const e = o.params.entry;
          if (/Content Security Policy/i.test(e.text)) seen.logged.push(e.text.slice(0, 240));
        } else if (o.method === 'Fetch.requestPaused') {
          const { requestId, request } = o.params;
          const u = request.url;
          try {
            if (u.startsWith(origin + '/') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('https://cdn.jsdelivr.net/npm/three@')) {
              await send('Fetch.continueRequest', { requestId });
            } else if (u.startsWith(LEADERBOARD_URL + '/')) {
              worker.calls.push(request.method + ' ' + new URL(u).pathname);
              const headers = { ...request.headers };
              if (!Object.keys(headers).some((k) => k.toLowerCase() === 'origin')) headers.Origin = origin;
              const init = { method: request.method, headers };
              if (request.postData != null) init.body = request.postData;
              const res = await handleLeaderboard(new Request(u, init), worker.env);
              await send('Fetch.fulfillRequest', {
                requestId, responseCode: res.status,
                responseHeaders: [...res.headers].map(([name, value]) => ({ name, value })),
                body: Buffer.from(await res.arrayBuffer()).toString('base64'),
              });
            } else if ((rooms && u.startsWith(ROOMS_URL + '/')) || local.some((base) => u.startsWith(base + '/'))) {
              if (local.some((base) => u.startsWith(base + '/'))) localCalls.push(request.method + ' ' + u.split('?')[0]);
              await send('Fetch.continueRequest', { requestId });
            } else {
              // Past the policy, and not sent.
              outside.push(u.slice(0, 120));
              await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
            }
          } catch (e) { /* the page is gone */ }
        }
      });
      await send('Runtime.enable');
      await send('Page.enable');
      await send('Log.enable');
      await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECT });
      const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text).slice(0, 400));
        return r.result ? r.result.value : undefined;
      };
      const d = {
        seen,
        async open(query, core) {
          await send('Page.navigate', { url: `${origin}/sim.html?${query}` });
          let ok = false;
          for (let i = 0; i < 300 && !ok; i++) {
            await sleep(250);
            try { ok = await evaluate(`!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.line && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
          }
          assert.ok(ok, 'the ' + core + ' core flies\n' + stderr.slice(-300));
          await send('Emulation.setFocusEmulationEnabled', { enabled: true });
          await send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
          await evaluate(PAGE);
        },
        async js(body) {
          const v = await evaluate(`(async () => { const T = window.__t; ${body} })()`);
          return typeof v === 'string' && /^[[{]/.test(v) ? JSON.parse(v) : v;
        },
        key: async (key, code, vk) => {
          await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
        },
        hold: (down, key, code, vk) => send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key, code, windowsVirtualKeyCode: vk }),
        async click(id) {
          const p = await evaluate(`JSON.stringify(window.__t.spot(${JSON.stringify(id)}))`).then(JSON.parse);
          if (p.found && p.hit) {
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
          }
          return p;
        },
        front: () => send('Page.bringToFront'),
        // Every violation this tab has had: the document's, and any logged (a worker's).
        async violations() { return { doc: await evaluate('JSON.stringify(window.__csp || [])').then(JSON.parse), warns: seen.warns.slice(), logged: seen.logged.slice() }; },
        close: () => { try { ws.close(); } catch (e) { /* ignore */ } },
      };
      tabs.push(d);
      return d;
    }

    let debugPort = null;
    for (let i = 0; i < 100 && !debugPort; i++) {
      await sleep(200);
      try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0] || null; } catch (e) { /* not written yet */ }
    }
    assert.ok(debugPort, 'Chrome named no DevTools port\n' + stderr.slice(-400));
    let first = null;
    for (let i = 0; i < 100 && !first; i++) {
      await sleep(200);
      try { first = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(first, 'no CDP page\n' + stderr.slice(-400));
    const a = await tab(first);
    const none = async (d, after) => {
      const v = await d.violations();
      assert.deepEqual([v.doc, v.warns, v.logged], [[], [], []], 'no violation, after ' + after + ': ' + JSON.stringify(v));
    };

    await t.test('the Betaflight core, high quality (KTX2 textures, bloom): flies, SHARE three ways, menus, all four maps', async () => {
      await a.open('quality=high&map=rig&track=rig-loop', 'bf');
      await none(a, 'the boot');
      await flows(a, 'bf', { core: 'bf', share: true, menus: true, record: (s) => steps.push('bf ' + s) });
      await none(a, steps.join(', '));
      assert.ok(worker.calls.includes('POST /api/line'), 'posted to the leaderboard: ' + worker.calls.join(', '));
      assert.ok(worker.calls.includes('GET /api/board'), 'read the boards: ' + worker.calls.join(', '));
      assert.ok(worker.calls.includes('GET /api/daily'), 'read the Daily Line: ' + worker.calls.join(', '));
    });

    let code = null;
    await t.test('a room, created on the Betaflight tab', { skip: rooms ? false : 'no wrangler' }, async () => {
      const r = await a.js(`
        T.s.openRoomCard();
        await T.wait(300);
        const name = T.$('roomName');
        name.value = 'CSP A';
        name.dispatchEvent(new Event('input'));
        T.$('roomCreate').click();
        const ok = await T.until(() => T.s.ghostRoom() && T.s.ghostRoom().open, 15000);
        const g = T.s.ghostRoom();
        return JSON.stringify({ ok, code: g && g.code, map: T.s.map(), toast: T.toast() });`);
      console.log('room created: ' + JSON.stringify(r));
      assert.equal(r.ok, true, 'created and connected: ' + r.toast);
      assert.match(r.code, /^[A-Z]{4}$/);
      code = r.code;
      await none(a, 'creating a room');
    });

    let b = null;
    await t.test('the js core in a second tab: flies, all four maps', async () => {
      const info = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
      b = await tab(info);
      await b.front();
      await b.open('quality=low&core=js&map=rig', 'js');
      await none(b, 'the boot');
      await flows(b, 'js', { core: 'js', share: false, menus: false, record: (s) => steps.push('js ' + s) });
      await none(b, 'the js core');
    });

    await t.test('the room joined from the js tab', { skip: rooms ? false : 'no wrangler' }, async () => {
      assert.ok(code && b, 'a room to join, and the js tab');
      {
        const r = await b.js(`
          T.s.openRoomCard();
          await T.wait(300);
          const name = T.$('roomName');
          name.value = 'CSP B';
          name.dispatchEvent(new Event('input'));
          T.$('roomCode').value = ${JSON.stringify(code)};
          T.$('roomJoinBtn').click();
          const ok = await T.until(() => T.s.ghostRoom() && T.s.ghostRoom().open && T.s.ghostRoom().pilots.size >= 1, 15000);
          const g = T.s.ghostRoom();
          return JSON.stringify({ ok, code: g && g.code, pilots: g ? [...g.pilots.values()].map((p) => p.name) : [], toast: T.toast() });`);
        console.log('room joined: ' + JSON.stringify(r));
        assert.equal(r.ok, true, 'joined: ' + r.toast);
        assert.equal(r.code, code);
        assert.deepEqual(r.pilots, ['CSP A'], 'and sees the pilot who made it');
        const seenByA = await a.js(`await T.until(() => T.s.ghostRoom() && T.s.ghostRoom().pilots.size >= 1, 8000); return JSON.stringify([...T.s.ghostRoom().pilots.values()].map((p) => p.name));`);
        assert.deepEqual(seenByA, ['CSP B'], 'who sees them');
        steps.push('room created and joined');
        await b.js(`T.s.leaveGhostRoom(); return 1;`);
        await a.js(`T.s.leaveGhostRoom(); return 1;`);
      }
      await none(b, 'joining the room');
      await none(a, 'the room');
    });

    // The local steps in workers/sim-rooms/DEPLOY.md and workers/sim-leaderboard/DEPLOY.md:
    // a page on this machine pointed at a rooms Worker over http (?rooms=) and a
    // leaderboard Worker over https (?lb=, the client takes https only), each
    // under wrangler dev on its own port. A room is made and a run is shared
    // (stored on the local leaderboard); the boards are read from it.
    await t.test('local Workers by ?rooms= (http) and ?lb= (https): a room, the boards, a stored line, no violation', { skip: rooms ? false : 'no wrangler' }, async () => {
      const devRooms = await startRoomsDev(findWrangler(), { ALLOWED_ORIGIN: origin });
      let devLb = null;
      try {
        devLb = await startLeaderboardDev(findWrangler(), { ALLOWED_ORIGIN: origin }, { https: true });
        local.push(devRooms.base, devLb.base);
        const info = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
        const c = await tab(info);
        await c.front();
        await c.open(`quality=low&map=rig&track=rig-loop&rooms=${encodeURIComponent(devRooms.base)}&lb=${encodeURIComponent(devLb.base)}`, 'bf');
        await none(c, 'the boot');
        const calls0 = worker.calls.length;
        let r = await c.js(`
          if (window._feel && window._feel.promptOpen && T.$('feelKeys')) T.$('feelKeys').click();
          await T.wait(800);
          // The boards, read from the local leaderboard.
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          await T.wait(400);
          T.$('menuBoards').click();
          await T.wait(500);
          const refresh = !!T.$('boardRefresh');
          if (refresh) T.$('boardRefresh').click();
          await T.wait(1500);
          const boards = { refresh, toast: T.toast(), body: T.$('boardBody') ? T.$('boardBody').textContent.slice(0, 80) : null };
          T.$('layerClose').click();
          T.$('menuResume').click();
          await T.wait(400);
          // A run, shared: the line too long for a link goes to the local leaderboard.
          T.s.setLineUrlMax(200);
          const done = await T.flyGates();
          const before = T.s.line().link;
          T.$('lapShare').click();
          const shared = await T.shared(before);
          // A room on the local rooms Worker.
          T.s.openRoomCard();
          await T.wait(300);
          T.$('roomCreate').click();
          const room = await T.until(() => T.s.ghostRoom() && T.s.ghostRoom().open, 15000);
          const g = T.s.ghostRoom();
          const out = { boards, done, shared, room, code: g && g.code, roomToast: T.toast() };
          T.s.leaveGhostRoom();
          return JSON.stringify(out);`);
        console.log('local Workers: ' + JSON.stringify(r));
        assert.equal(r.boards.refresh, true, 'the boards are online (?lb= taken)');
        assert.notEqual(r.boards.toast, 'ONLINE UNAVAILABLE', 'and read from the local leaderboard');
        console.log('sent to the local Workers: ' + [...new Set(localCalls)].join(', '));
        for (const call of [`GET ${devLb.base}/api/board`, `POST ${devLb.base}/api/line`, `POST ${devRooms.base}/rooms`]) {
          assert.ok(localCalls.includes(call), 'the page sent ' + call + ': ' + localCalls.join(', '));
        }
        assert.equal(r.done, true, 'the run finished');
        assert.equal(r.shared.said, true, 'SHARE: ' + r.shared.toast);
        assert.match(r.shared.link, /#line=@[A-Za-z0-9_-]{10,32}$/, 'the line stored on the local leaderboard');
        assert.equal(r.room, true, 'a room on the local rooms Worker: ' + r.roomToast);
        assert.match(String(r.code), /^[A-Z]{4}$/);
        assert.equal(worker.calls.length, calls0, 'nothing went to the deployed leaderboard\'s address');
        // And the stored line comes back from the local leaderboard (where
        // this Node can trust the run's certificate).
        if (trustCert(devLb.cert)) {
          const id = r.shared.link.split('#line=@')[1];
          const back = await (await fetch(devLb.base + '/api/line?id=' + id, { headers: { Origin: origin } })).json();
          assert.ok(back && back.ok && /^L[01]\./.test(back.code), 'the line is in the local D1: ' + JSON.stringify(back).slice(0, 120));
        }
        await none(c, 'local Workers');
        steps.push('local Workers by ?rooms= and ?lb=');
      } finally {
        local.length = 0;
        await devRooms.stop();
        if (devLb) await devLb.stop();
      }
    });

    await t.test('markup with handlers put into the page: nothing runs, and the page warns', async () => {
      await a.front();
      await sleep(500);
      const csp = await injection(a, 'chrome');
      const v = await a.violations();
      const blocked = v.warns.filter((w) => /^\[CSP\] script-src(-attr)? blocked inline/.test(w));
      assert.equal(blocked.length, csp.length, "the page's own listener warned about each: " + JSON.stringify(v.warns));
      assert.ok(csp.every((x) => /^script-src(-attr)?$/.test(x.d)), 'and nothing else was blocked: ' + JSON.stringify(csp));
    });

    console.log('steps with no violation: ' + steps.join(', '));
    console.log('passed by the policy, not sent: ' + [...new Set(outside)].join(', '));
    console.log('leaderboard calls: ' + worker.calls.join(', '));
  } finally {
    for (const d of tabs) d.close();
    if (child) {
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
    }
    if (rooms) await rooms.stop();
    for (let i = 0; profile && i < 10; i++) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
    }
    if (server) server.close();
  }
});

// The same in Playwright's WebKit and Firefox, where they are installed:
// PLAYWRIGHT=<the playwright package folder>. No rooms here (they need two
// pages on one wrangler), and the clipboard may be refused (SHARE then puts
// the link in Tune's box, and says so).
test('the sim under its policy in WebKit and Firefox (Playwright)', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const dir = process.env.PLAYWRIGHT;
  if (!dir || !existsSync(join(dir, 'index.mjs'))) { t.skip('no Playwright (PLAYWRIGHT=<the playwright package folder>)'); return; }
  const pw = await import(pathToFileURL(join(dir, 'index.mjs')).href);
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (const name of ['webkit', 'firefox']) {
      await t.test(name, async (st) => {
        const type = pw[name];
        let exe = '';
        try { exe = type.executablePath(); } catch (e) { /* no build for this platform */ }
        if (!exe || !existsSync(exe)) { st.skip(name + ' is not installed for this Playwright'); return; }
        const worker = { env: { DB: fakeD1(), ALLOWED_ORIGIN: origin }, calls: [] };
        const browser = await type.launch({ headless: true });
        try {
          const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
          if (name !== 'webkit') { try { await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }); } catch (e) { /* not offered */ } }
          const page = await context.newPage();
          const seen = { warns: [], logged: [] };
          page.on('console', (m) => {
            const text = m.text();
            if (m.type() === 'warning' && text.startsWith('[CSP]')) seen.warns.push(text.slice(0, 200));
            else if (/Content Security Policy|Refused to/i.test(text)) seen.logged.push(text.slice(0, 240));
          });
          await page.addInitScript(COLLECT);
          await page.route('**/*', async (route) => {
            const req = route.request();
            const u = req.url();
            if (u.startsWith(origin + '/') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('https://cdn.jsdelivr.net/npm/three@')) return route.continue();
            if (u.startsWith(LEADERBOARD_URL + '/')) {
              worker.calls.push(req.method() + ' ' + new URL(u).pathname);
              const headers = { ...req.headers(), origin };
              const init = { method: req.method(), headers };
              const body = req.postData();
              if (body != null) init.body = body;
              const res = await handleLeaderboard(new Request(u, init), worker.env);
              return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
            }
            return route.abort('blockedbyclient');
          });
          const keyName = (key) => (key === ' ' ? 'Space' : key);
          const d = {
            async open(query, core) {
              await page.goto(`${origin}/sim.html?${query}`, { waitUntil: 'load', timeout: 90000 });
              let ok = false;
              for (let i = 0; i < 300 && !ok; i++) {
                await sleep(250);
                ok = await page.evaluate(`!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.line && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`).catch(() => false);
              }
              assert.ok(ok, name + ': the ' + core + ' core flies');
              await page.evaluate(PAGE);
            },
            async js(body) {
              const v = await page.evaluate(`(async () => { const T = window.__t; ${body} })()`);
              return typeof v === 'string' && /^[[{]/.test(v) ? JSON.parse(v) : v;
            },
            key: async (key) => page.keyboard.press(keyName(key)),
            hold: async (down, key) => (down ? page.keyboard.down(keyName(key)) : page.keyboard.up(keyName(key))),
            async click(id) {
              const p = JSON.parse(await page.evaluate(`JSON.stringify(window.__t.spot(${JSON.stringify(id)}))`));
              if (p.found && p.hit) await page.mouse.click(p.x, p.y);
              return p;
            },
            async violations() { return { doc: JSON.parse(await page.evaluate('JSON.stringify(window.__csp || [])')), warns: seen.warns.slice(), logged: seen.logged.slice() }; },
          };
          const none = async (after) => {
            const v = await d.violations();
            assert.deepEqual([v.doc, v.warns, v.logged], [[], [], []], name + ': no violation, after ' + after + ': ' + JSON.stringify(v));
          };
          const steps = [];
          await d.open('quality=high&map=rig&track=rig-loop', 'bf');
          await none('the boot');
          await flows(d, name + ' bf', { core: 'bf', share: true, menus: true, record: (s) => steps.push('bf ' + s) });
          await none(steps.join(', '));
          await d.open('quality=low&core=js&map=rig', 'js');
          await none('the js core boot');
          await flows(d, name + ' js', { core: 'js', share: false, menus: false, record: (s) => steps.push('js ' + s) });
          await none(steps.join(', '));
          const csp = await injection(d, name);
          const v = await d.violations();
          assert.ok(csp.every((x) => /^script-src(-attr)?$/.test(x.d)), name + ': nothing else blocked: ' + JSON.stringify(csp));
          assert.equal(v.warns.length, csp.length, name + ": the page's own listener warned about each: " + JSON.stringify(v.warns));
          console.log(name + ': steps with no violation: ' + steps.join(', ') + '; leaderboard calls: ' + worker.calls.join(', '));
          for (const call of ['POST /api/line', 'GET /api/board', 'GET /api/daily']) assert.ok(worker.calls.includes(call), name + ': ' + call + ': ' + worker.calls.join(', '));
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    server.close();
  }
});
