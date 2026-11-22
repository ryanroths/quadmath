// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Pilot feedback fixes in headless Chrome, at a desktop and two phone layouts:
//   - the quad that flies, on the THR/BATT card (#hudQuad): AIR65, FRACTAL75,
//     85 CLASSIC, 65 CLASSIC while Betaflight loads; the card keeps its box;
//   - a new pack: under a low battery and LAND NOW, "P = new pack" (a NEW
//     PACK tap target on touch, clear of the sticks); P on both cores; the
//     in-flight menu's New pack; the first-flight card's line for the input;
//   - Tune's controls that do not reach the bf core are hidden there
//     ("classic physics only"), and a flight on bf proves it: the same
//     scripted flight, from the same respawn, with every one of them at one
//     end and then the other, is bit-identical to the flight without; Tune's
//     visible bf controls (throttle mid and expo, the rates) at both ends
//     change it;
//   - arming while Betaflight loads: held, said in plain words; ready, said;
//     armed on the js core at a takeover, said; a failed load frees arming.
// tools/test_sim_bf_rates_page.mjs has the rates and throttle boxes, the
// limits and a change made in flight. Requires Chrome (CHROME, as
// tools/test_sim_map_boot.mjs); the Chrome part skips under SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { FIRST_FLIGHT_PACK_TEXT, FIRST_FLIGHT_TEXT } from '../sim-feel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');

// What sim.html says (bfLoadPending, the takeover, newPack).
const LOADING_TOAST = 'BETAFLIGHT IS LOADING — ARM IN A MOMENT';
const LOADING_HINT = 'Betaflight is loading… arm in a moment';
const READY_TOAST = 'BETAFLIGHT READY — ARM AGAIN';
const TOOK_OVER = 'SWITCHED TO BETAFLIGHT — DISARMED, ARM AGAIN';
const FAILED = 'BETAFLIGHT DID NOT LOAD — FLYING CLASSIC PHYSICS';
// Tune's controls the bf core never reads: each at one end, then the other.
// The build's first: each of its inputs applies the build again, which sets
// Drag, Mass and Motor Response from it, so those are set after (and every
// value is read back before the flight).
const DEAD = {
  min: { s_buildKv: 8000, buildProp: '31', buildBlades: '2', buildCells: '1', s_buildMah: 200, s_buildAuw: 18,
    cbBounce: false, s_bounce: 0, s_crash: 6, cbGround: false, s_ground: 0, cbWash: false, s_wash: 'off', cbDraft: false, s_draft: 0,
    cbBattSim: false, cbSagThrust: false, s_sag: 0, s_float: 0, s_drag: 0.05, s_mass: 15, s_spool: 0.008, s_grav: 1, s_thc: 0.4 },
  max: { s_buildKv: 40000, buildProp: '51', buildBlades: '4', buildCells: '2', s_buildMah: 680, s_buildAuw: 80,
    cbBounce: true, s_bounce: 1.5, s_crash: 28, cbGround: true, s_ground: 2, cbWash: true, s_wash: 'high', cbDraft: true, s_draft: 2,
    cbBattSim: true, cbSagThrust: true, s_sag: 2, s_float: 1, s_drag: 0.8, s_mass: 90, s_spool: 0.15, s_grav: 5, s_thc: 2.6 },
};

test('sim.html: the quad on the card, a new pack for both cores, the classic-physics gate, plain loading words', () => {
  const html = read('sim.html').replace(/\r\n/g, '\n');
  const card = html.slice(html.indexOf('<div class="feel-meta">'), html.indexOf('<div id="hudArmSlot">'));
  assert.ok(card.indexOf('<span id="hudQuad">') < card.indexOf('<span id="hudThr">'), 'the quad heads the card');
  assert.ok(html.includes('quad:flyingQuadName()'), 'the frame loop names it');
  assert.ok(html.includes("<div id=\"osdLand\">LAND NOW</div>\n<!--") && html.includes('<button type="button" id="packHint" hidden>P = new pack</button>'));
  assert.ok(/<button class="menu-flight" id="menuPack">New pack \[P\]<\/button>/.test(html), 'the in-flight menu lists it');
  const pack = html.slice(html.indexOf('function newPack(){'), html.indexOf('// ---------- The House'));
  assert.ok(!pack.includes("core.kind!=='bf'||"), 'P works on the js core too');
  assert.ok(pack.includes('else{battCharge=1;battV=BATT_FULL;}'));
  assert.ok(!/new pack \(bf\)/.test(html), 'the key lists say P everywhere');
  assert.ok(html.includes("pack.textContent=FIRST_FLIGHT_PACK_TEXT["), 'the first-flight card\'s line');
  assert.deepEqual(FIRST_FLIGHT_PACK_TEXT, { keyboard: 'Battery low? P = new pack', touch: 'Battery low? Tap NEW PACK', controller: 'Battery low? P, or MENU then New pack' });
  assert.ok(html.includes("FIRST_FLIGHT_PACK_TEXT[gpConnected?'controller':(touchCtl&&touchCtl.enabled)?'touch':'keyboard']"), 'the input the hint goes by');
  const replay = html.slice(html.indexOf('function startReplay('), html.indexOf('function startReplay(') + 400);
  assert.ok(replay.includes('syncPackHint(false);'), 'no pack hint over a replay');
  assert.ok(html.includes('body:has(#coachHud.show) #packHint,body:has(#feelTutorial.show) #packHint,\n    body:has(#toast.has-action) #packHint{display:none}'), 'nor over the Coach card, the tutorial or an action toast');
  const svg = read('assets/sim-ui/keyboard-layout.svg');
  assert.ok(svg.includes('>P<') && svg.includes('new pack'), 'the keyboard layout shows P');
  // Every dead control sits inside a classic-only block; the note is in its place.
  assert.ok(html.includes('body.bf-core .phys-js,body:not(.bf-core) .phys-bf{display:none!important}'));
  // Each block to its own closing </div> (balanced: rows inside are divs too).
  const blocks = [];
  for (let at = html.indexOf('<div class="phys-js">'); at !== -1; at = html.indexOf('<div class="phys-js">', at + 1)) {
    let depth = 0, i = at;
    const tag = /<div\b|<\/div>/g;
    tag.lastIndex = at;
    for (let m; (m = tag.exec(html));) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) { i = m.index; break; }
    }
    blocks.push(html.slice(at, i));
  }
  assert.equal(blocks.length, 2, 'two classic-only blocks: Your build\'s numbers, and Physics');
  const blockText = blocks.join('\n');
  for (const id of Object.keys(DEAD.min).concat(['s_twr', 'cb3d'])) assert.ok(blockText.includes(`id="${id}"`), id + ' is classic physics only');
  for (const id of ['cbAutoArm', 'droneType', 'buildFrame', 'buildPreset']) assert.ok(!blockText.includes(`id="${id}"`), id + ' stays on bf');
  assert.equal((html.match(/class="build-note phys-bf"/g) || []).length, 2);
  // Arming while Betaflight loads: one predicate, plain words.
  assert.ok(html.includes("if(bfLoadPending()){bfArmHeld=droneType;toast(BF_LOADING_TOAST,{ms:2400});return false;}"));
  assert.ok(html.includes("bfLoadPending()?'LOADING BETAFLIGHT':"), 'the won\'t-arm line');
  assert.ok(html.includes('armHint:bfLoadPending()?BF_LOADING_HINT:'), 'the arm hint');
  assert.ok(html.includes(`const BF_LOADING_TOAST='${LOADING_TOAST}';`) && html.includes(`const BF_LOADING_HINT='${LOADING_HINT}';`));
  assert.ok(html.includes(`const BF_TOOK_OVER_TOAST='${TOOK_OVER}';`));
  assert.ok(html.includes(`toast('${FAILED}',{ms:3500});`));
});

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
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 120000);
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
  if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text).slice(0, 800));
  return r.result ? r.result.value : undefined;
}
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

const TOASTS = `window.__toasts = [];
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('toast');
  if (el) new MutationObserver(() => window.__toasts.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
});`;

// In the page: the start screens closed, and the probes this test reads.
const PAGE = `(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k === 'Escape' ? 'Escape' : 'Key' + k.toUpperCase() }));
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]') && el.getBoundingClientRect().width > 0;
  const overlap = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  ['startMenu', 'feelPrompt', 'menuLayer', 'firstFlight'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open', 'show'); el.style.display = 'none'; }
  });
  document.body.classList.remove('menu-open');
  if (s.looks && s.looks.setMenuOpen) s.looks.setMenuOpen(false);
  if (window._feel && window._feel.hideFirstRun) window._feel.hideFirstRun();
  function snap() {
    const cs = s.coreState(), hint = document.getElementById('packHint'), land = document.getElementById('osdLand');
    const why = document.querySelector('#osdBC .osdbc-why span');
    return { core: s.core(), quad: document.getElementById('hudQuad').textContent, armed: cs.armed, airborne: cs.airborne,
      v: cs.kind === 'bf' ? cs.battV : s.jsPack().v, charge: cs.kind === 'bf' ? cs.soc : s.jsPack().charge,
      hint: shown(hint) ? hint.textContent : null, hintRect: rect(hint), land: getComputedStyle(land).display !== 'none', landRect: rect(land),
      card: rect(document.querySelector('#feelHud .feel-meta')), why: why ? why.textContent : '', armHint: document.getElementById('hudArmHint').textContent,
      toast: document.getElementById('toast').textContent, toasts: window.__toasts.slice(-6),
      toastRect: rect(document.getElementById('toast')), toastShown: document.getElementById('toast').style.opacity === '1',
      hintTap: hint.classList.contains('tap'), hintPe: getComputedStyle(hint).pointerEvents,
      armSlot: shown(document.getElementById('hudArmHint')) && document.getElementById('hudArmHint').textContent ? rect(document.getElementById('hudArmSlot')) : null,
      overlay: shown(document.getElementById('stickOverlay')) ? rect(document.getElementById('stickOverlay')) : null,
      physJs: [...document.querySelectorAll('.phys-js')].map(shown), physBf: [...document.querySelectorAll('.phys-bf')].map(shown) };
  }
  // A nearly empty pack where the quad stands (as tools/test_sim_fresh_pack.mjs).
  async function lowPack(soc, v) {
    if (s.core() === 'bf') {
      const cs = s.coreState();
      s.bfCore().sim.reinit({ battery: { soc, vbatFiltered: v } });
      s.placeQuadAt(-cs.position.y * 3.5, cs.position.z * 3.5, -cs.position.x * 3.5);
    } else s.jsPack(soc);
    await wait(700);
    return snap();
  }
  // The scripted flight (sim time since the respawn's reboot: the core's
  // clock restarts there, so two flights are the same samples): arm at
  // 0.1 s, a slow lift through the floor's cushion, roll, yaw, a run
  // forward, then down to the floor.
  const cs0 = s.coreState();
  const pad = { x: -cs0.position.y * 3.5, y: cs0.position.z * 3.5, z: -cs0.position.x * 3.5 };
  function stick(t) {
    if (t < 0.2) return { r: 0, p: 0, y: 0, t: 0 };
    if (t < 1.0) return { r: 0, p: 0, y: 0, t: 0.41 };
    if (t < 1.6) return { r: 0, p: 0, y: 0, t: 0.45 };
    if (t < 2.0) return { r: 0.3, p: 0, y: 0, t: 0.40 };
    if (t < 2.4) return { r: -0.3, p: 0, y: 0.5, t: 0.40 };
    if (t < 3.4) return { r: 0, p: 0.35, y: 0, t: 0.42 };
    if (t < 4.2) return { r: 0, p: -0.2, y: 0, t: 0.36 };
    return { r: 0, p: 0, y: 0, t: 0.30 };
  }
  async function fly(ms = 5200) {
    const bf = s.bfCore();
    const rec = new Map();
    let t0 = null, contacts = 0, armedAt = null, last = null;
    s.setTestPilot(null);
    s.placeQuadAt(pad.x, pad.y, pad.z, 0.0001, { freshPack: true });
    s.setTestPilot((st) => {
      const us = bf.simTimeUs;
      if (t0 === null) t0 = us;
      const t = (us - t0) / 1e6;
      if (t >= 0.1 && !bf.aux.arm) bf.setArm(true);
      rec.set(Math.round((us - t0) / 4000), [st.position.x, st.position.y, st.position.z, st.quaternion.w, st.quaternion.x, st.quaternion.y, st.quaternion.z]);
      if (st.contactFlags) contacts++;
      if (st.armed && armedAt === null) armedAt = t;
      last = t;
      return stick(t);
    });
    const w0 = performance.now();
    while ((last === null || last < ms / 1000) && performance.now() - w0 < ms * 12) await wait(50);
    s.setTestPilot(null);
    bf.setArm(false);
    // Disarmed before the next change: a Tune change made armed is kept until
    // the landing (sim.html bfSetThrottle, bfPend, as coreArmed reads it), and
    // the next flight arms at 0.1 s, before it goes in. On a slow runner the
    // page can still read armed 250 ms after the switch went off.
    const armed = () => s.coreState().armed || bf.aux.arm || bf.turtlePhase !== null;
    for (let i = 0; i < 100 && armed(); i++) await wait(50);
    if (armed()) throw new Error('still armed 5 s after the flight');
    await wait(250);
    return { rec, n: rec.size, contacts, armedAt, end: last, err: s.testPilotError() };
  }
  function diff(a, b) {
    let worst = 0, common = 0;
    for (const [k, ra] of a.rec) {
      const rb = b.rec.get(k);
      if (!rb) continue;
      common++;
      for (let i = 0; i < 7; i++) worst = Math.max(worst, Math.abs(ra[i] - rb[i]));
    }
    return { worst, common };
  }
  function set(id, v) {
    const el = document.getElementById(id);
    if (!el) throw new Error('no #' + id);
    if (el.type === 'checkbox') { el.checked = !!v; el.dispatchEvent(new Event('change')); return; }
    el.value = String(v);
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  }
  // Low at rest (the warning), then flown until LAND NOW shows under the
  // load; act() in the air (land first), then landed (a new pack).
  async function packFlight(act) {
    const out = [await lowPack(0.02, 3.32)];
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); await wait(1300);
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0.5 });
    for (let i = 0; i < 100 && !snap().land; i++) await wait(100);
    out.push(snap());
    await act(); await wait(300);
    out.push(snap());
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
    for (let i = 0; i < 100 && (s.coreState().airborne || s.coreState().armed); i++) await wait(100);
    await wait(500);
    out.push(snap());
    await act(); await wait(800);
    out.push(snap());
    s.setTestStick(null);
    return out;
  }
  window.__pf = { s, wait, key, rect, shown, overlap, snap, lowPack, fly, diff, set, packFlight };
  return true;
})()`;

async function launch(opts = {}) {
  const { w = 1280, h = 720, phone = false } = opts;
  const profile = mkdtempSync(join(tmpdir(), 'qm-pilotfix-'));
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', `--window-size=${w},${h}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let debugPort = 0;
  for (let i = 0; i < 300 && !debugPort; i++) {
    await sleep(100);
    try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
  }
  assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
  let page = null;
  for (let i = 0; i < 300 && !page; i++) {
    await sleep(100);
    try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* coming up */ }
  }
  assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  const thrown = [];
  ws.addEventListener('message', (msg) => {
    try {
      const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
      if (o.method === 'Runtime.exceptionThrown') { const ex = o.params.exceptionDetails || {}; thrown.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text); }
    } catch (e) { /* ignore */ }
  });
  if (phone) {
    await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await cdp(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp(ws, 'Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', platform: 'Android' });
  } else {
    await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  }
  await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: TOASTS });
  return { ws, child, profile, thrown };
}
async function close(b) {
  try { if (b.ws) b.ws.close(); } catch (e) { /* ignore */ }
  killTree(b.child);
  await Promise.race([new Promise((res) => b.child.once('exit', res)), sleep(3000)]);
  for (let i = 0; i < 10; i++) {
    try { rmSync(b.profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
  }
}
// The page with a seeded profile, up to `ready` (the bf core flying, unless
// told otherwise), the start screens closed.
async function open(b, port, { seed = {}, query = 'quality=low&map=rig', ready = "window._sim.core() === 'bf'", hold = null } = {}) {
  await cdp(b.ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/robots.txt` });
  await sleep(300);
  await evaluate(b.ws, `localStorage.clear(), Object.entries(${JSON.stringify(seed)}).forEach(([k, v]) => localStorage.setItem(k, v)), true`);
  if (hold) await hold();
  await cdp(b.ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/sim.html?${query}` });
  const t0 = Date.now();
  let ok = false;
  while (!ok && Date.now() - t0 < 150000) {
    await sleep(250);
    try { ok = await evaluate(b.ws, `!!(window._sim && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && (${ready}))`); } catch (e) { /* navigating */ }
  }
  assert.ok(ok, `sim.html?${query}: ${ready}; thrown ${JSON.stringify(b.thrown.slice(-3))}`);
  await evaluate(b.ws, PAGE);
}
const run = async (b, js) => JSON.parse(await evaluate(b.ws, `(async () => { const P = window.__pf, s = P.s; ${js} })()`));
// Betaflight's wasm, held at the network until released (or failed).
async function holdWasm(b) {
  const held = { id: null };
  b.ws.addEventListener('message', (msg) => {
    try { const o = JSON.parse(String(msg.data)); if (o.method === 'Fetch.requestPaused') held.id = o.params.requestId; } catch (e) { /* ignore */ }
  });
  await cdp(b.ws, 'Fetch.enable', { patterns: [{ urlPattern: '*sim-core.wasm*', requestStage: 'Request' }] });
  held.release = async (fail) => {
    for (let i = 0; i < 200 && !held.id; i++) await sleep(100);
    assert.ok(held.id, 'the wasm request was held');
    if (fail) await cdp(b.ws, 'Fetch.failRequest', { requestId: held.id, errorReason: 'Failed' });
    else await cdp(b.ws, 'Fetch.continueRequest', { requestId: held.id });
    await cdp(b.ws, 'Fetch.disable');
  };
  return held;
}
const KEYS = { quadmathSimInputChoice: 'keyboard', quadmathSimFirstFlight: 'keys,keyboard,touch,controller', ryflyDroneType: 'whoop65' };

test('desktop, keyboard: the quad on the card, a held Betaflight load, a new pack, the classic-physics gate flown on bf', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();
  const b = await launch({ w: 1280, h: 720 });
  try {
    // Arming while Betaflight loads: held, said plainly; ready, said.
    let held = null;
    await open(b, port, { seed: KEYS, ready: "window._sim.core() === 'js'", hold: async () => { held = await holdWasm(b); } });
    const loading = await run(b, `await P.wait(600);
      P.key(' '); await P.wait(300);
      const a = P.snap();
      // The throttle gesture, its own toast (the log emptied first).
      s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); await P.wait(2500);
      window.__toasts.length = 0;
      s.setTestStick({ r: 0, p: 0, y: 0, t: 0.6 }); await P.wait(800);
      const c = P.snap(); s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
      return JSON.stringify([a, c]);`);
    for (const x of loading) {
      assert.equal(x.core, 'js');
      assert.equal(x.armed, false, 'not armed while Betaflight loads');
      assert.equal(x.quad, '65 CLASSIC', 'the card says what flies meanwhile');
      assert.equal(x.why, 'LOADING BETAFLIGHT', 'the won\'t-arm line says why');
      assert.equal(x.armHint, LOADING_HINT);
    }
    assert.equal(loading[0].toast, LOADING_TOAST, 'Space: said plainly');
    assert.ok(loading[1].toasts.includes(LOADING_TOAST), 'the throttle gesture said it too: ' + JSON.stringify(loading[1].toasts));
    await held.release(false);
    // The card names the quad from the core's state (flyingQuadName reads cs),
    // a frame or two after the core changes: on a slow runner, later than 400 ms.
    const ready = await run(b, `for (let i = 0; i < 400 && s.core() !== 'bf'; i++) await P.wait(100);
      for (let i = 0; i < 50 && P.snap().quad !== 'AIR65'; i++) await P.wait(100);
      await P.wait(400); s.setTestStick(null); return JSON.stringify(P.snap());`);
    assert.equal(ready.core, 'bf');
    assert.equal(ready.quad, 'AIR65');
    // Ready, said after the loading toast, as the takeover's last. Only the
    // rates note may follow it (bfRatesNote: 1.6 s after the takeover, once
    // the 1.5 s toast is gone), and a slow runner can read that late.
    const said = ready.toasts.lastIndexOf(READY_TOAST);
    assert.ok(said > ready.toasts.lastIndexOf(LOADING_TOAST), 'ready, said after loading: ' + JSON.stringify(ready.toasts));
    assert.ok(ready.toasts.slice(said + 1).every((x) => /^RATES: /.test(x)), 'ready, said last (the rates note may follow): ' + JSON.stringify(ready.toasts));
    assert.equal(ready.why === 'LOADING BETAFLIGHT', false);

    // The classic-physics gate on bf: hidden, its note shown.
    await open(b, port, { seed: KEYS });
    const gate = await run(b, 'await P.wait(500); return JSON.stringify(P.snap());');
    assert.deepEqual(gate.physJs, [false, false, false], 'every classic-only block is hidden on bf');
    assert.deepEqual(gate.physBf, [true, true], 'its note in their place');
    // The flight: the same samples flown twice are bit-identical; with every
    // dead control at one end, then the other, still bit-identical.
    const ab = await run(b, `const out = {};
      const base = await P.fly();
      out.base = { n: base.n, contacts: base.contacts, armedAt: base.armedAt, end: base.end, err: base.err };
      out.aa = P.diff(base, await P.fly());
      const DEAD = ${JSON.stringify(DEAD)};
      for (const end of ['min', 'max']) {
        for (const [id, v] of Object.entries(DEAD[end])) P.set(id, v);
        await P.wait(400);
        out[end + 'Back'] = Object.fromEntries(Object.keys(DEAD[end]).map((id) => { const el = document.getElementById(id); return [id, el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value]; }));
        out[end] = P.diff(base, await P.fly());
        out[end + 'Core'] = s.core();
      }
      // The visible bf controls, each at both ends: throttle expo; throttle
      // mid (which shapes the curve only with expo: with 0 it is straight);
      // the rates' centre, max and expo.
      // Throttle mid against a flight with expo 1.00 at mid 0.50 (with expo 0
      // the curve is straight, whatever the mid).
      const get = () => s.bfCore().sim.get(['thr_mid', 'thr_expo', 'roll_rc_rate', 'roll_srate', 'roll_expo']);
      const tune = [['bfs_thr_expo', 0, 100], ['bfs_thr_mid', 0, 99], ['bfs_roll_rcRate', 10, 2000], ['bfs_roll_srate', 0, 2000], ['bfs_roll_expo', 0, 1]];
      for (const [id, lo, hi] of tune) {
        const el = document.getElementById(id), was = el.value;
        let ref = base;
        if (id === 'bfs_thr_mid') { P.set('bfs_thr_expo', 100); await P.wait(500); ref = await P.fly(); out.expoRef = get(); }
        for (const v of [lo, hi]) {
          const n = window.__toasts.length;
          P.set(id, v); await P.wait(500);
          const kept = window.__toasts.slice(n).filter((x) => /WHEN YOU LAND/.test(x));
          out[id + '_' + v] = { d: P.diff(ref, await P.fly()).worst, held: get(), kept };
        }
        P.set(id, was); if (id === 'bfs_thr_mid') P.set('bfs_thr_expo', 0);
        await P.wait(500);
      }
      return JSON.stringify(out);`);
    assert.equal(ab.base.err, null);
    assert.ok(ab.base.n > 1200 && ab.base.armedAt !== null && ab.base.armedAt < 0.2, 'flown, armed at 0.1 s: ' + JSON.stringify(ab.base));
    assert.ok(ab.base.contacts > 0, 'the flight meets the floor or a wall (bounce, crash, cushion)');
    assert.equal(ab.aa.worst, 0, 'the same flight twice: bit-identical');
    for (const end of ['min', 'max']) {
      for (const [id, v] of Object.entries(DEAD[end])) assert.equal(ab[end + 'Back'][id], v, `${end}: #${id} flew at ${JSON.stringify(v)}`);
      assert.equal(ab[end + 'Core'], 'bf');
      assert.ok(ab[end].common > 1200, end + ': ' + JSON.stringify(ab[end]));
      assert.equal(ab[end].worst, 0, `every classic-only control at its ${end}: the bf flight is bit-identical`);
    }
    const moved = (k) => ab[k].d;
    // Each flew as set (read back from Betaflight).
    assert.deepEqual([ab.expoRef.thr_mid, ab.expoRef.thr_expo], ['50', '100'], 'the mid flights\' reference: expo 1.00 at mid 0.50');
    const want = { bfs_thr_expo_0: ['thr_expo', '0'], bfs_thr_expo_100: ['thr_expo', '100'], bfs_thr_mid_0: ['thr_mid', '0'], bfs_thr_mid_99: ['thr_mid', '99'],
      bfs_roll_rcRate_10: ['roll_rc_rate', '1'], bfs_roll_rcRate_2000: ['roll_rc_rate', '200'], bfs_roll_srate_0: ['roll_srate', '0'], bfs_roll_srate_2000: ['roll_srate', '200'],
      bfs_roll_expo_0: ['roll_expo', '0'], bfs_roll_expo_1: ['roll_expo', '100'] };
    // Made disarmed, each went in at once, not kept for the landing.
    for (const k of Object.keys(want)) assert.deepEqual(ab[k].kept, [], `${k}: made disarmed, it goes in at once`);
    for (const [k, [key, v]] of Object.entries(want)) assert.equal(ab[k].held[key], v, `${k}: Betaflight holds ${key} ${v}`);
    for (const k of ['bfs_thr_mid_0', 'bfs_thr_mid_99']) assert.equal(ab[k].held.thr_expo, '100', k + ' flown with expo 1.00');
    for (const [k, why] of [['bfs_thr_expo_100', 'throttle expo 1.00'], ['bfs_thr_mid_0', 'throttle mid 0.00 against 0.50 (expo 1.00)'], ['bfs_thr_mid_99', 'throttle mid 0.99 against 0.50 (expo 1.00)'],
      ['bfs_roll_rcRate_10', 'roll centre 10'], ['bfs_roll_rcRate_2000', 'roll centre 2000'], ['bfs_roll_srate_0', 'roll max 0'], ['bfs_roll_srate_2000', 'roll max 2000'],
      ['bfs_roll_expo_0', 'roll expo 0'], ['bfs_roll_expo_1', 'roll expo 1']]) {
      assert.ok(moved(k) > 0.01, `${why} changes the bf flight (${moved(k)} m): ${JSON.stringify(ab[k].held)}`);
    }
    assert.equal(ab.bfs_thr_expo_0.d, 0, 'throttle expo 0 is the Air65\'s own: the same flight');

    // A new pack: the hint from the low-battery warning, under LAND NOW in
    // flight; P in the air says land first, landed it is a new pack.
    const pack = await run(b, `return JSON.stringify(await P.packFlight(async () => P.key('p')));`);
    assert.equal(pack[0].hint, 'P = new pack', 'BATT low at rest: the hint, ' + pack[0].v + ' V');
    assert.equal(pack[0].land, false, 'no LAND NOW yet');
    assert.ok(pack[1].land && pack[1].airborne, 'flown to LAND NOW at ' + pack[1].v + ' V');
    assert.equal(pack[1].hint, 'P = new pack');
    assert.ok(pack[1].hintRect.t >= pack[1].landRect.b - 2, 'the hint sits under LAND NOW: ' + JSON.stringify([pack[1].landRect, pack[1].hintRect]));
    assert.ok(Math.abs((pack[1].hintRect.l + pack[1].hintRect.r) / 2 - (pack[1].landRect.l + pack[1].landRect.r) / 2) < 2, 'centred under it');
    assert.equal(pack[2].toast, 'LAND FOR A NEW PACK', 'P in the air');
    assert.ok(pack[2].toastShown && pack[2].hint && !P_overlap(pack[2].toastRect, pack[2].hintRect), 'the toast is not over the hint: ' + JSON.stringify([pack[2].toastRect, pack[2].hintRect]));
    assert.ok(pack[2].v < 3.6, 'the pack kept in the air');
    assert.ok(!pack[3].airborne, 'landed');
    assert.equal(pack[4].v.toFixed(1), '4.2', 'P landed: a new pack');
    assert.equal(pack[4].hint, null, 'and the hint goes');
    assert.equal(pack[4].toast, 'NEW PACK');
    // The in-flight menu lists it, and it does it.
    const menu = await run(b, `await P.lowPack(0.02, 3.32);
      document.getElementById('startMenu').style.display = ''; // this test's PAGE hid it at the start
      P.key('Escape'); await P.wait(400);
      const btn = document.getElementById('menuPack');
      const a = { shown: P.shown(btn), text: btn.textContent, menu: document.body.classList.contains('menu-open'), inFlight: document.getElementById('startMenu').classList.contains('in-flight') };
      btn.click(); await P.wait(800);
      return JSON.stringify([a, P.snap(), document.body.classList.contains('menu-open')]);`);
    assert.ok(menu[0].menu && menu[0].inFlight && menu[0].shown, 'the in-flight menu shows New pack: ' + JSON.stringify(menu[0]));
    assert.equal(menu[0].text, 'New pack [P]');
    assert.equal(menu[1].v.toFixed(1), '4.2', 'from the menu: a new pack');
    assert.equal(menu[2], false, 'and back to flying');
    // The first-flight card's line, for the keyboard: no input chosen yet, so
    // the card on the first arm attempt (a pilot who chose Fly with keyboard has
    // the keyboard layout from the start instead, with the same lines).
    await open(b, port, { seed: { ryflyDroneType: KEYS.ryflyDroneType, quadmathSimFirstFlight: 'touch,controller' } });
    const card = await run(b, `s.tryArm(); await P.wait(400);
      const el = document.getElementById('firstFlight');
      return JSON.stringify({ show: el.classList.contains('show'), lines: [...el.children].map((c) => c.textContent) });`);
    assert.ok(card.show, 'the first-flight card');
    assert.equal(card.lines[0], FIRST_FLIGHT_TEXT);
    assert.equal(card.lines[1], FIRST_FLIGHT_PACK_TEXT.keyboard);

    // The 85: classic physics, named so, its controls shown; P refills its pack.
    const c85 = await run(b, `const sel = document.getElementById('droneType');
      sel.value = 'whoop85'; sel.dispatchEvent(new Event('change'));
      for (let i = 0; i < 80 && s.core() !== 'js'; i++) await P.wait(100);
      await P.wait(600);
      const a = P.snap();
      const low = await P.lowPack(0.01);
      P.key('p'); await P.wait(600);
      return JSON.stringify([a, low, P.snap()]);`);
    assert.equal(c85[0].core, 'js');
    assert.equal(c85[0].quad, '85 CLASSIC');
    assert.deepEqual(c85[0].physJs, [true, true, true], 'the 85 shows the classic controls');
    assert.deepEqual(c85[0].physBf, [false, false]);
    assert.equal(c85[1].hint, 'P = new pack', 'the 85 runs low: ' + c85[1].v + ' V');
    assert.ok(c85[2].charge > 0.99 && c85[2].v > 4.1, 'P on the js core: a new pack (' + c85[2].charge + ', ' + c85[2].v + ' V)');
    assert.equal(c85[2].hint, null);
    // Card box: the same for every name it shows.
    const box = await run(b, `const out = {};
      for (const q of ['AIR65', 'FRACTAL75', '85 CLASSIC', '65 CLASSIC', '75 CLASSIC']) {
        window._feel.updateHud({ stick: { r: 0, p: 0, y: 0, t: 0 }, battV: 4.44, battOn: true, mode: 'angle', armed: false, threeD: false, quad: q });
        out[q] = P.rect(document.querySelector('#feelHud .feel-meta'));
      }
      return JSON.stringify(out);`);
    const boxes = new Set(Object.values(box).map((r) => [r.l, r.t, r.w, r.h].map((v) => v.toFixed(1)).join(',')));
    assert.equal(boxes.size, 1, 'one card box for every quad name: ' + JSON.stringify(box));
    // Armed on the js core, switched to a bf class: the takeover says it disarmed.
    const over = await run(b, `s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); await P.wait(400);
      if (!s.coreState().armed) P.key(' ');
      for (let i = 0; i < 30 && !s.coreState().armed; i++) await P.wait(100);
      s.setTestStick({ r: 0, p: 0, y: 0, t: 0.6 }); await P.wait(500);
      const armed = s.coreState().armed;
      const sel = document.getElementById('droneType'); sel.value = 'whoop65'; sel.dispatchEvent(new Event('change'));
      for (let i = 0; i < 200 && s.core() !== 'bf'; i++) await P.wait(50);
      await P.wait(300); s.setTestStick(null);
      return JSON.stringify({ armed, after: P.snap() });`);
    assert.ok(over.armed, 'armed on the 85');
    assert.equal(over.after.core, 'bf');
    assert.equal(over.after.toast, TOOK_OVER, 'said last: ' + JSON.stringify(over.after.toasts));
    assert.equal(over.after.quad, 'AIR65');

    // A failed load frees arming, and says so.
    let fail = null;
    await open(b, port, { seed: KEYS, ready: "window._sim.core() === 'js'", hold: async () => { fail = await holdWasm(b); } });
    await fail.release(true);
    const failed = await run(b, `await P.wait(1500); const a = P.snap(); P.key(' '); await P.wait(500); return JSON.stringify([a, P.snap()]);`);
    assert.ok(failed[0].toasts.includes(FAILED), JSON.stringify(failed[0].toasts));
    assert.equal(failed[0].why, '', 'no LOADING line once it failed');
    assert.equal(failed[0].quad, '65 CLASSIC');
    assert.equal(failed[1].armed, true, 'arming works on the js core');
    assert.deepEqual(b.thrown, [], 'nothing threw');
  } finally {
    await close(b);
    await new Promise((res) => server.close(res));
  }
});

// Real touches (Input.dispatchTouchEvent) at a CSS point.
async function tap(b, x, y) {
  await cdp(b.ws, 'Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await cdp(b.ws, 'Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const [w, h] of [[844, 390], [667, 375], [390, 844]]) {
  test(`phone ${w}x${h}, touch: the card names the quad, NEW PACK is a thumb's target clear of the sticks, Tune's boxes and the gate fit`, { timeout: 8 * 60 * 1000 }, async (t) => {
    if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
    const { server, port } = await serveRoot();
    const b = await launch({ w, h, phone: true });
    try {
      // Loading, on touch: the hint the pilot reads under the card.
      let held = null;
      await open(b, port, { seed: { ryflyDroneType: 'whoop65', quadmathSimFirstFlight: 'keys,keyboard,touch,controller' }, ready: "window._sim.core() === 'js'", hold: async () => { held = await holdWasm(b); } });
      const loading = await run(b, `await P.wait(500); return JSON.stringify(P.snap());`);
      assert.equal(loading.quad, '65 CLASSIC');
      assert.equal(loading.armHint, LOADING_HINT);
      await held.release(false);
      await run(b, `for (let i = 0; i < 400 && s.core() !== 'bf'; i++) await P.wait(100); return JSON.stringify(1);`);
      const page = await run(b, `await P.wait(600);
        const sticks = [...document.querySelectorAll('#touchLayer .vstick')].map(P.rect);
        const a = P.snap();
        a.sticks = sticks; a.touchOn = document.body.classList.contains('touch-on');
        a.btns = P.rect(document.getElementById('touchBtns'));
        return JSON.stringify(a);`);
      assert.ok(page.touchOn, 'touch sticks');
      assert.equal(page.quad, 'AIR65');
      for (const st of page.sticks) assert.ok(!P_overlap(page.card, st), 'the card is clear of a stick: ' + JSON.stringify([page.card, st]));
      assert.ok(page.card.r <= w && page.card.b <= h && page.card.l >= 0, 'the card is on screen');
      // A low pack: in the air in free flight, words under LAND NOW (no box
      // over the view), and no toast over them; landed, NEW PACK, a 44 px
      // button clear of the sticks, the touch buttons, the card and the arm
      // hint, nothing over it, and a real touch on it gives a new pack.
      await evaluate(b.ws, `window.__probeHint = () => { const el = document.getElementById('packHint'), r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { hitSelf: at === el, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }; true`);
      const lowRest = await run(b, `return JSON.stringify(await P.lowPack(0.02, 3.32));`);
      await run(b, `s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); await P.wait(1300); s.setTestStick({ r: 0, p: 0, y: 0, t: 0.5 });
        for (let i = 0; i < 100 && !P.snap().land; i++) await P.wait(100); return JSON.stringify(1);`);
      const inAir = await run(b, `const a = P.snap(); P.key('p'); await P.wait(250); a.after = P.snap(); return JSON.stringify(a);`);
      await run(b, `s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); for (let i = 0; i < 100 && (s.coreState().airborne || s.coreState().armed); i++) await P.wait(100); await P.wait(600); return JSON.stringify(1);`);
      const landed = await run(b, `const a = P.snap(); a.probe = window.__probeHint(); return JSON.stringify(a);`);
      await tap(b, landed.probe.x, landed.probe.y);
      const after = await run(b, `await P.wait(800); s.setTestStick(null); return JSON.stringify(P.snap());`);
      assert.equal(lowRest.hint, 'NEW PACK', 'landed with a low pack: the button, from the warning: ' + lowRest.v + ' V');
      assert.ok(lowRest.hintTap, 'a tap target');
      assert.ok(inAir.land && inAir.airborne, 'flown to LAND NOW');
      assert.ok(inAir.landRect.h < 60 && inAir.landRect.r <= w && inAir.landRect.l >= 0, 'LAND NOW on one line, on screen: ' + JSON.stringify(inAir.landRect));
      assert.equal(inAir.hint, 'Land for a new pack', 'in the air: words');
      assert.ok(!inAir.hintTap && inAir.hintPe === 'none', 'no button over the view in the air');
      assert.ok(inAir.hintRect.h < 30, 'a line, not a box: ' + inAir.hintRect.h);
      assert.ok(inAir.hintRect.t >= inAir.landRect.b - 2, 'under LAND NOW: ' + JSON.stringify([inAir.landRect, inAir.hintRect]));
      assert.equal(inAir.after.toast, 'LAND FOR A NEW PACK');
      assert.ok(inAir.after.toastShown && !P_overlap(inAir.after.toastRect, inAir.after.hintRect), 'no toast over the hint: ' + JSON.stringify([inAir.after.toastRect, inAir.after.hintRect]));
      assert.ok(!landed.airborne, 'landed');
      assert.equal(landed.hint, 'NEW PACK');
      assert.ok(landed.hintTap && landed.hintPe === 'auto', 'landed: a button');
      assert.ok(landed.hintRect.h >= 44, 'a thumb\'s 44 px: ' + landed.hintRect.h);
      assert.ok(landed.probe.hitSelf, 'nothing covers it');
      for (const st of page.sticks) assert.ok(!P_overlap(landed.hintRect, st), 'clear of a stick: ' + JSON.stringify([landed.hintRect, st]));
      assert.ok(!P_overlap(landed.hintRect, page.btns), 'clear of the touch buttons');
      assert.ok(!P_overlap(landed.hintRect, landed.card), 'clear of the card: ' + JSON.stringify([landed.hintRect, landed.card]));
      assert.ok(!landed.armSlot || !P_overlap(landed.hintRect, landed.armSlot), 'clear of the arm hint: ' + JSON.stringify([landed.hintRect, landed.armSlot]));
      for (const x of [inAir, landed]) assert.ok(!x.overlay || !P_overlap(x.hintRect, x.overlay), 'clear of the stick overlay: ' + JSON.stringify([x.hintRect, x.overlay]));
      assert.ok(landed.hintRect.b <= h, 'on screen');
      assert.equal(after.v.toFixed(1), '4.2', 'tapped landed: a new pack');
      assert.equal(after.hint, null);
      // Tune on a phone: the bf boxes are 16 px (no iOS zoom), inside the
      // panel; the classic-only blocks are hidden, the note shown.
      const tune = await run(b, `document.getElementById('panel').classList.add('open'); await P.wait(400);
        const panel = P.rect(document.getElementById('panel'));
        const boxes = [...document.querySelectorAll('#bfRates input[type=number]')].filter((el) => P.shown(el)).map((el) => ({ id: el.id, fs: parseFloat(getComputedStyle(el).fontSize), r: P.rect(el) }));
        const a = P.snap();
        document.getElementById('panel').classList.remove('open');
        return JSON.stringify({ panel, boxes, physJs: a.physJs, physBf: a.physBf });`);
      assert.ok(tune.boxes.length >= 8, 'the rates and throttle boxes: ' + tune.boxes.length);
      for (const x of tune.boxes) {
        assert.ok(x.fs >= 16, x.id + ' is 16 px on a phone: ' + x.fs);
        assert.ok(x.r.l >= tune.panel.l - 0.5 && x.r.r <= tune.panel.r + 0.5, x.id + ' fits the panel: ' + JSON.stringify([x.r, tune.panel]));
      }
      assert.deepEqual(tune.physJs, [false, false, false]);
      assert.deepEqual(tune.physBf, [true, true]);
      // The first-flight card on touch says how to get a new pack.
      await open(b, port, { seed: { ryflyDroneType: 'whoop65', quadmathSimFirstFlight: 'keys,keyboard,controller' } });
      const ffTouch = await run(b, `s.tryArm(); await P.wait(400);
        const el = document.getElementById('firstFlight');
        return JSON.stringify({ show: el.classList.contains('show'), lines: [...el.children].map((c) => c.textContent), touch: !!(window._touch && window._touch.enabled) });`);
      assert.ok(ffTouch.touch && ffTouch.show, 'the card, on touch: ' + JSON.stringify(ffTouch));
      assert.deepEqual(ffTouch.lines, [FIRST_FLIGHT_TEXT, FIRST_FLIGHT_PACK_TEXT.touch]);
      assert.deepEqual(b.thrown, [], 'nothing threw');
    } finally {
      await close(b);
      await new Promise((res) => server.close(res));
    }
  });
}
function P_overlap(a, b) { return !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }
