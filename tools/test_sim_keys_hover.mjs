// The keyboard's first flight (the owner's spec, 2026-11-25), checked here: in
// Node, the hover spring (sim-3d.js stepKeysHover) and the page's source; in
// headless Chrome, first visits as a visitor makes them.
//   1. Easy mode on the keys, armed: no key the hover (which stops a rise or
//      a fall), W up, S down, eased 2.5 a second. The hover is read from the core's thrust-to-weight (the
//      battery's sag and the build's mass are in it). The first W after an arm
//      lifts to a hover; S held to the floor disarms; W arms again. Acro (and
//      3D) keep the keys' own throttle.
//   2. "W up · S down", the keys' hint, in flight only: never under the launch
//      menu or the No controller card. Space says it drops the quad in the air.
//   3. Nothing draws over the No controller card. The launch buttons read
//      Loading… and look inert until the module wires them; a click on one
//      before that is done once they are. No WebGL: a plain message.
//   4. A first visit's Fly with keyboard flies the class's map (the Rig) at
//      once, on the pad; a link that flies something keeps it.
//   5. The air time flew30 and the race offer count stops while a box holds
//      the quad, still: pinned (the ceiling at full throttle, 6 m up) or
//      propped (tipped on a shelf). Hovering beside a wall still counts.
// The novice: 400 ms reactions (on sim time), held keys, looks about every
// 3-5 s (A or D for 0.3-0.8 s, or a 0.25 s tap forward and one back); 30 s in
// the air with no crash, then up, down, a landing on S that disarms, W again.
// (With 0.8-2 s arrow holds it reached 30 s too, but ran into the Rig's
// shelves, propped at 70 degrees or ended on its side, which Easy mode counts
// as a crash: the walls, not the throttle.) Propped and still 1.5 s, it
// presses R, as the legend says.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs) for the page parts;
// SKIP_CHROME_BOOT=1 runs the Node parts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { spawnBrowser } from './browser_guard.mjs';
import {
  stepKeysHover, keysHoverSeed, hoverFromTwr, KEYS_CLIMB, KEYS_SINK, KEYS_SLEW, KEYS_LIFT_M, KEYS_HINT, KEYS_DAMP, KEYS_STEP_AT,
  KEYS_HOVER_SEED, KEYS_HOVER_SEED_ANY, armHintText,
} from '../sim-3d.js';
import { HOTKEYS, legendHtml, FIRST_FLIGHT_KEYS_ALT, FIRST_FLIGHT_KEYS_IMG } from '../sim-feel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'sim.html'), 'utf8');

// ---------- Node ----------
// n samples of 4 ms; o: the sample's fields (a function of the state for a plant).
function run(state, o, secs) {
  let st = state;
  let t = st.t || 0;
  for (let i = 0; i < Math.round(secs / 0.004); i++) {
    const extra = typeof o === 'function' ? o(st, t) : o;
    const out = stepKeysHover(st, { dt: 0.004, t, clearance: 0, landed: true, upZ: 1, twr: 0, contact: 1, seed: 0.41, ...extra });
    st = out.state;
    t = out.t;
  }
  return st;
}

test('the hover spring: Space-armed it idles; the first W lifts to a hover, a tap too; then no key the hover, W up, S down, eased 2.5 a second', () => {
  assert.equal(KEYS_CLIMB, 0.30);
  assert.equal(KEYS_SINK, 0.30);
  assert.equal(KEYS_STEP_AT, 0.41, 'at the Air65 hover: in proportion elsewhere');
  assert.equal(KEYS_SLEW, 2.5);
  assert.equal(KEYS_LIFT_M, 0.3);
  // Armed with Space on the pad: idle until W.
  let st = run({}, {}, 1);
  assert.equal(st.phase, 'idle');
  assert.equal(st.t, 0);
  // One sample of W, then let go, still on the floor: it lifts.
  st = run(st, { w: true }, 0.004);
  assert.equal(st.phase, 'lift');
  st = run(st, {}, 0.1);
  assert.ok(Math.abs(st.t - 0.26) < 0.006, 'eased at 2.5 a second (0.104 s): ' + st.t);
  st = run(st, {}, 0.3);
  assert.ok(Math.abs(st.t - 0.71) < 1e-9, 'to hover + climb while it lifts, landed or not: ' + st.t);
  assert.equal(st.phase, 'lift');
  st = run(st, { clearance: 0.31, landed: false, contact: 0 }, 0.004);
  assert.equal(st.phase, 'fly', 'clear of the floor by KEYS_LIFT_M: flying');
  st = run(st, { clearance: 1, landed: false, contact: 0 }, 0.5);
  assert.ok(Math.abs(st.t - 0.41) < 1e-9, 'no key: the hover ' + st.t);
  const fly = { clearance: 1, landed: false, contact: 0 };
  st = run(st, { ...fly, w: true }, 0.04);
  assert.ok(Math.abs(st.t - 0.51) < 1e-9, 'W eases up 2.5 a second: ' + st.t);
  st = run(st, { ...fly, w: true }, 0.5);
  assert.ok(Math.abs(st.t - 0.71) < 1e-9, 'W: hover + 0.30');
  st = run(st, { ...fly, s: true }, 0.5);
  assert.ok(Math.abs(st.t - 0.11) < 1e-9, 'S: hover - 0.30');
  st = run(st, { ...fly, w: true, s: true }, 0.5);
  assert.ok(Math.abs(st.t - 0.71) < 1e-9, 'both: W');
  // Tilted (upZ 0.64), the hover over sqrt(upZ); against a box, not.
  st = run(st, { ...fly, upZ: 0.64 }, 1);
  assert.ok(Math.abs(st.t - 0.41 / 0.8) < 1e-9, 'tilted: ' + st.t);
  st = run(st, { ...fly, upZ: 0.3, contact: 2 }, 1);
  assert.ok(Math.abs(st.t - 0.41) < 1e-9, 'wedged on a wall: no more than the hover ' + st.t);
  // No key: the hover less KEYS_DAMP per m/s up, more per m/s down; W and S plain.
  assert.equal(KEYS_DAMP, 0.06);
  st = run(st, { ...fly, vz: 2 }, 1);
  assert.ok(Math.abs(st.t - (0.41 - 0.12)) < 1e-9, 'rising 2 m/s, no key: ' + st.t);
  st = run(st, { ...fly, vz: -3 }, 1);
  assert.ok(Math.abs(st.t - (0.41 + 0.18)) < 1e-9, 'falling 3 m/s, no key: ' + st.t);
  st = run(st, { ...fly, vz: 2, w: true }, 1);
  assert.ok(Math.abs(st.t - 0.71) < 1e-9, 'W: plain');
  st = run(st, { ...fly, vz: -3, s: true }, 1);
  assert.ok(Math.abs(st.t - 0.11) < 1e-9, 'S: plain');
  // A crash latched: 0 until Easy mode disarms it, whatever key or fall.
  st = run(st, { ...fly, vz: -6, crashed: true }, 1);
  assert.equal(st.t, 0, 'crashed: 0');
  st = run(st, { ...fly, w: true, crashed: true }, 1);
  assert.equal(st.t, 0, 'crashed, W held: 0');
  // Tipped past 60 degrees or upside down, falling: the hover, no more.
  st = run(st, { ...fly, upZ: 0.4, vz: -3 }, 1);
  assert.ok(Math.abs(st.t - 0.41) < 1e-9, 'tipped, falling: the hover ' + st.t);
  st = run(st, { ...fly, upZ: -0.7, vz: -3 }, 1);
  assert.ok(Math.abs(st.t - 0.41) < 1e-9, 'upside down, falling: the hover ' + st.t);
  // Down at rest with W up: 0, for Easy mode's landed and crash disarms.
  st = run(st, { s: true }, 0.5);
  assert.equal(st.t, 0, 'landed, S held: 0');
  st = run(st, { clearance: 1, landed: false, contact: 0 }, 0.3);
  st = run(st, {}, 0.5);
  assert.equal(st.t, 0, 'landed, no key: 0');
  st = run(st, { w: true }, 0.5);
  assert.ok(Math.abs(st.t - 0.71) < 1e-9, 'landed, W: up again');
  // Another hover: the climb and the sink in proportion (the Fractal75's 0.23).
  st = run({ phase: 'fly', hover: 0.23, t: 0.23 }, { clearance: 1, landed: false, contact: 0, w: true }, 1);
  assert.ok(Math.abs(st.t - 0.23 * (1 + 0.30 / 0.41)) < 1e-9, 'W at hover 0.23: ' + st.t);
  st = run(st, { clearance: 1, landed: false, contact: 0, s: true }, 1);
  assert.ok(Math.abs(st.t - 0.23 * (1 - 0.30 / 0.41)) < 1e-9, 'S at hover 0.23: ' + st.t);
  // Taken over in the air (Acro to Angle): the hover, not idle.
  st = run({ t: 0.6 }, { clearance: 2, landed: false, contact: 0 }, 0.5);
  assert.equal(st.phase, 'fly');
  assert.ok(Math.abs(st.t - 0.41) < 1e-9, 'in the air: the hover ' + st.t);
});

test('the hover: a fixed point on throttle / sqrt(thrust-to-weight), read only with no key held, upright, clear and touching nothing; it finds a curved throttle\'s hover from a seed 0.12 off', () => {
  assert.equal(hoverFromTwr(0.4, 1), 0.4);
  assert.ok(Math.abs(hoverFromTwr(0.5, 1.45) - 0.4152) < 1e-4);
  assert.equal(hoverFromTwr(0.4, 0), null);
  assert.equal(hoverFromTwr(0, 1), null);
  // Plants: thrust goes as the motor output squared, the output a curve of the throttle.
  const plants = [
    { name: 'linear (the Air65)', f: (t) => t, h: 0.407 },
    { name: 'a curve (the Fractal75\'s throttle mid 65, expo 35)', f: (t) => Math.pow(t, 1.6), h: 0.232 },
    { name: 'a lifted bottom (the js core, mid 0.62)', f: (t) => 0.3 + 0.7 * t, h: 0.356 },
  ];
  for (const p of plants) {
    const twr = (t) => (p.f(t) / p.f(p.h)) ** 2;
    const flying = (st, t) => ({ clearance: 1.5, landed: false, upZ: 1, contact: 0, twr: twr(t), seed: p.h + 0.12 });
    let st = run({ phase: 'fly' }, flying, 4);
    assert.ok(Math.abs(st.hover - p.h) < 0.003, `${p.name}: ${st.hover.toFixed(4)} for ${p.h}`);
    // A sag: the same throttle lifts less; the hover follows.
    const sagged = (st2, t) => ({ ...flying(st2, t), twr: twr(t) * 0.93 });
    st = run(st, sagged, 4);
    assert.ok(Math.abs(twr(st.hover) * 0.93 - 1) < 0.01, `${p.name}: thrust-to-weight 1 at the hover after the sag (${(twr(st.hover) * 0.93).toFixed(4)})`);
  }
  // Never read while a key is held, touching a box, landed, tilted or low.
  const p = plants[1];
  const twr = (t) => (p.f(t) / p.f(p.h)) ** 2;
  const base = (st, t) => ({ clearance: 1.5, landed: false, upZ: 1, contact: 0, twr: twr(t), seed: 0.35 });
  for (const [what, o] of [['W held', { w: true }], ['S held', { s: true }], ['against a box', { contact: 2 }], ['landed', { landed: true }],
    ['tilted', { upZ: 0.8 }], ['5 cm up', { clearance: 0.05 }]]) {
    const st = run({ phase: 'fly' }, (s2, t) => ({ ...base(s2, t), ...o }), 3);
    assert.equal(st.hover, 0.35, what + ': no reading');
  }
});

test('the seeds: the hovers measured per core and class; the keys\' hint; Space\'s note in the legend, the keys card and the layout', () => {
  assert.equal(keysHoverSeed('bf', 'whoop65'), 0.41);
  assert.equal(keysHoverSeed('bf', 'whoop75'), 0.23);
  assert.equal(keysHoverSeed('js', 'whoop85'), 0.36);
  assert.equal(keysHoverSeed('js', 'whoop65'), 0.31);
  assert.equal(keysHoverSeed('bf', 'whoop99'), KEYS_HOVER_SEED_ANY);
  assert.ok(Object.isFrozen(KEYS_HOVER_SEED) && Object.isFrozen(KEYS_HOVER_SEED.bf));
  assert.equal(KEYS_HINT, 'W up · S down');
  assert.equal(armHintText({ easy: true, keys: true, low: true }), KEYS_HINT);
  const space = HOTKEYS.filter((k) => k.keys === 'Space' && k.group === 'Flying');
  assert.equal(space.length, 1);
  assert.equal(space[0].does, 'Arm / Disarm (drops it in the air)');
  assert.ok(legendHtml().includes('<b>Space — Arm / Disarm (drops it in the air)</b>'));
  assert.match(FIRST_FLIGHT_KEYS_ALT, /Space arm or disarm \(a disarm in the air drops the quad\)/);
  const svg = readFileSync(join(root, FIRST_FLIGHT_KEYS_IMG), 'utf8');
  assert.ok(svg.includes('>arm / disarm<') && svg.includes('>drops it in the air<'), 'the keyboard layout says it too');
});

test('the page: the spring on the keys in Easy mode, 2D, not Acro, armed only; flew30 and the race offer stop when a box holds it (pinned or propped); the card hides the toast and the hint; the launch buttons wait; the watchdog keeps an early click and says no WebGL', () => {
  assert.ok(html.includes("function keysSpringOn(){return easyMode()&&!threeD&&flightMode!=='acro';}"));
  assert.ok(html.includes('if(!disarmed&&keysSpringOn())kbThrottle=keysHoverStep(dt);'), 'armed only: disarmed, the keys arm as before');
  assert.ok(html.includes("twr:cs.twr,contact:cs.contactFlags,crashed:simClockMs-easyCrashAt<EASY_CRASH_MEMORY_MS,seed:keysHoverSeed(core.kind,droneType)"), 'the core\'s own thrust-to-weight and contacts, and Easy mode\'s crash latch');
  assert.ok(html.includes('function inTheAir(){return !!cs.airborne&&cs.clearance>AIR_CLEARANCE_M&&!heldByBox();}'));
  assert.ok(html.includes("if(!((cs.contactFlags|0)&2))return false;") && html.includes('return cs.twr>1.15||bodyUpZ(cs.quaternion)<0.5;'), 'held by a box: still, pinned (pushing) or propped (tipped)');
  assert.ok(html.includes('if(armed&&inTheAir())raceOffer.airMs+=ms;') && html.includes('if(!countPings.has(\'arm\')||!inTheAir()||countPings.has(\'flew30\'))return;'), 'both counts use it');
  assert.ok(html.includes('body.prompt-open #toast,body.prompt-open #hudArmHint{visibility:hidden}'));
  assert.ok(html.includes('<div id="startMenu" class="open wait">'));
  for (const id of ['menuFly', 'menuDaily', 'menuBoards', 'menuTune', 'menuControls']) assert.ok(html.includes(`id="${id}" aria-disabled="true">`), id + ' waits');
  assert.ok(html.includes('wireLooksUI();\nwireBuilderUI();\nmenuWired();\n'), 'wired, then no longer waiting');
  // The early click's capture: on the document, from the head, before the menu's markup.
  const capture = html.indexOf("e.target.closest('#startMenu.wait button.menu-launch')");
  assert.ok(capture > 0 && html.includes('window.__menuEarly=b.id||null;'), 'the early click kept before the module');
  assert.ok(capture < html.indexOf('</head>') && capture < html.indexOf('<div id="startMenu"'), 'from the head, before the menu paints');
  assert.ok(html.includes("gl=probe.getContext('webgl2')||probe.getContext('webgl');") && html.includes("document.documentElement.classList.add('no-webgl');"));
  assert.ok(!/HOLD W TO FLY/.test(html), 'no "hold W" left');
  assert.ok(html.includes("toast(kind==='touch'?'TOUCH STICKS — THROTTLE UP TO FLY':'KEYBOARD');"));
  assert.ok(html.includes("flyHint:stickInputKind()==='keyboard'&&keysSpringOn()?KEYS_HINT:''"), 'the hint stays up in flight on the keys');
});

// ---------- Chrome ----------
function resolveChrome() {
  const names = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'chrome'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mime = (p) => ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp',
  '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2', '.woff2': 'font/woff2' })[extname(p)] || 'application/octet-stream';
const GZ = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.wasm', '.txt', '.hdr']);

// The worktree, served; gzip as the site's host sends it (the throttled load
// measures what a visitor downloads, not the raw files).
async function serveRoot() {
  const zipped = new Map();
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    try {
      let body = readFileSync(file);
      const headers = { 'content-type': mime(file) };
      // ?teststall=MS: the page sent up to the end of the launch menu, then
      // held that long (a slow load's menu, painted before the rest arrives).
      const stall = rel === '/sim.html' ? +url.searchParams.get('teststall') : 0;
      if (stall > 0) {
        const cut = body.indexOf(Buffer.from('<div class="osd" id="osdTL">'));
        res.writeHead(200, headers);
        res.write(body.subarray(0, cut));
        setTimeout(() => res.end(body.subarray(cut)), stall);
        return;
      }
      if (GZ.has(extname(file)) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
        if (!zipped.has(file)) zipped.set(file, gzipSync(body, { level: 6 }));
        body = zipped.get(file);
        headers['content-encoding'] = 'gzip';
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

let cdpSeq = 0;
function cdp(ws, method, params) {
  const id = ++cdpSeq;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 150000);
    function on(msg) {
      let o; try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
      if (o.id !== id) return;
      clearTimeout(t); ws.removeEventListener('message', on);
      if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {});
    }
    ws.addEventListener('message', on);
  });
}
async function evaluate(ws, expression) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception ? r.exceptionDetails.exception.description || r.exceptionDetails.exception.value : r.exceptionDetails.text));
  return r.result ? r.result.value : undefined;
}
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// From the first document on: whatever draws over the No controller card
// (a top-level layer, visible, with text, over the card's box, above it), and
// the keys' hint shown under the launch menu or the card. Every 50 ms.
const WATCH = String.raw`(() => {
  const W = window.__watch = { samples: 0, cardSamples: 0, over: [], hintUnder: [], cardAt: null };
  const vis = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.02; };
  const visible = (e) => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) if (!vis(x)) return false; return true; };
  setInterval(() => {
    if (!document.body) return;
    W.samples++;
    const p = document.getElementById('feelPrompt');
    const card = p && p.classList.contains('show') ? p.querySelector('.feel-card') : null;
    const hint = document.getElementById('hudArmHint');
    const menu = document.body.classList.contains('menu-open');
    if (hint && hint.classList.contains('show') && hint.textContent && visible(hint) && (menu || card) && W.hintUnder.length < 5) {
      W.hintUnder.push({ t: Math.round(performance.now()), text: hint.textContent, menu, card: !!card });
    }
    if (!card) return;
    if (W.cardAt == null) W.cardAt = Math.round(performance.now());
    W.cardSamples++;
    const c = card.getBoundingClientRect();
    const kids = [...document.body.children];
    const pAt = kids.indexOf(p);
    kids.forEach((e, i) => {
      if (e === p) return;
      const z = parseInt(getComputedStyle(e).zIndex, 10);
      if (!(z > 26 || (z === 26 && i > pAt))) return;
      if (!visible(e)) return;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) return;
      const text = (e.innerText || '').trim();
      if (text && W.over.length < 10) W.over.push({ t: Math.round(performance.now()), id: e.id || String(e.className), text: text.slice(0, 48) });
    });
  }, 50);
})()`;

// From the first document on: every click the page gets, where and on what,
// and when (before the page's own listeners: registered first).
const CLICKLOG = String.raw`(() => {
  const L = window.__clickLog = [];
  document.addEventListener('click', (e) => {
    const t = e.target, b = t && t.closest ? t.closest('button') : null;
    L.push({ at: Math.round(performance.now()), x: Math.round(e.clientX), y: Math.round(e.clientY), target: t ? (t.id || t.tagName) : null, button: b ? b.id || b.tagName : null });
  }, true);
})()`;

// In the page: the flight as the novice and the checks read it; the air time
// as flew30 counts it (armed, the core's airborne, 4 cm clear, no box touched),
// added up on the sim clock; the crashes.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await wait(10); } return !!fn(); };
  const sim = () => s.simClockMs();
  const up = (q) => 1 - 2 * (q.x * q.x + q.y * q.y);
  const K = { airMs: 0, crashes: 0, lastClock: null, lastCrash: s.easy().crashAt, disarms: [] };
  let wasArmed = false;
  setInterval(() => {
    const c = s.coreState(), clock = sim();
    const dt = K.lastClock == null ? 0 : Math.max(0, clock - K.lastClock);
    K.lastClock = clock;
    if (c.armed && c.airborne && c.clearance > 0.04 && !((c.contactFlags | 0) & 2)) K.airMs += dt;
    const e = s.easy();
    if (e.crashAt !== K.lastCrash) { K.lastCrash = e.crashAt; if (Number.isFinite(e.crashAt)) K.crashes++; }
    if (wasArmed && !c.armed) K.disarms.push({ at: Math.round(clock), why: e.disarmReason });
    wasArmed = !!c.armed;
  }, 4);
  const hintEl = document.getElementById('hudArmHint');
  function state() {
    const c = s.coreState(), e = s.easy();
    return { sim: sim(), armed: !!c.armed, clr: +c.clearance, z: +c.position.z, vz: +c.velocity.z, up: up(c.quaternion), flags: c.contactFlags, t: s.stickOverlay().stick.t,
      air: K.airMs, crashes: K.crashes, dis: e.disarmReason, disarms: K.disarms.slice(-4), map: s.map(), menu: document.body.classList.contains('menu-open'),
      prompt: !!(window._feel && window._feel.promptOpen), hint: hintEl.classList.contains('show') ? hintEl.textContent : null, mode: e.flightMode,
      card: s.firstFlight().show };
  }
  window.__kh = { s, wait, until, sim, state, K };
  return true;
})()`;

const KEYS = { w: ['w', 'KeyW', 87], s: ['s', 'KeyS', 83], a: ['a', 'KeyA', 65], d: ['d', 'KeyD', 68], space: [' ', 'Space', 32],
  up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
  one: ['1', 'Digit1', 49], three: ['3', 'Digit3', 51], r: ['r', 'KeyR', 82] };

test('keyboard first flights in Chrome: the hover spring flown by a novice, the first screen, the early click, no WebGL', { timeout: 20 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const { server, port } = await serveRoot();

  // One browser, one page. opts: view [w, h], storage (seeded), query, core,
  // net (CDP network conditions), webgl (false: none), watch (WATCH from the
  // first document), boot (false: do not wait for the core).
  async function pass(opts, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-kbhover-'));
    const [w, h] = opts.view || [1366, 768];
    const gl = opts.webgl === false ? ['--disable-webgl', '--disable-3d-apis']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'];
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server', ...gl, '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      `--window-size=${w},${h}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let ws = null;
    try {
      let debugPort = 0;
      for (let i = 0; i < 600 && !debugPort; i++) { await sleep(100); try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ } }
      assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
      let page = null;
      for (let i = 0; i < 300 && !page; i++) {
        await sleep(100);
        try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* coming up */ }
      }
      assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      await cdp(ws, 'Runtime.enable');
      await cdp(ws, 'Page.enable');
      await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      if (process.env.SIM_CPU_THROTTLE) await cdp(ws, 'Emulation.setCPUThrottlingRate', { rate: +process.env.SIM_CPU_THROTTLE });
      if (opts.watch) await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: CLICKLOG });
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/robots.txt` });
      await sleep(300);
      await evaluate(ws, `(() => { localStorage.clear(); const seed = ${JSON.stringify(opts.storage || {})}; for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]); return true; })()`);
      if (opts.net) {
        await cdp(ws, 'Network.enable');
        await cdp(ws, 'Network.setCacheDisabled', { cacheDisabled: true });
        await cdp(ws, 'Network.emulateNetworkConditions', { offline: false, ...opts.net });
      }
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/sim.html?quality=low${opts.query ? '&' + opts.query : ''}` });
      const core = opts.core || 'bf';
      const boot = async () => {
        let ready = false;
        for (let i = 0; i < 480 && !ready; i++) {
          await sleep(250);
          try { ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* loading */ }
        }
        assert.ok(ready, `the ${core} core flies`);
        await evaluate(ws, PAGE);
      };
      if (opts.boot !== false) await boot();
      const keyEv = (type, k) => { const [key, code, vk] = KEYS[k]; return cdp(ws, 'Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk }); };
      const api = {
        ws,
        boot,
        js: async (body) => { const v = await evaluate(ws, `(async () => { const K = window.__kh; ${body} })()`); return typeof v === 'string' ? JSON.parse(v) : v; },
        raw: (expr) => evaluate(ws, expr),
        // One keydown, held until up (rawKeyDown only: rawKeyDown + keyDown toggles Space twice).
        down: (k) => keyEv('rawKeyDown', k),
        up: (k) => keyEv('keyUp', k),
        key: async (k) => { await keyEv('rawKeyDown', k); await sleep(60); await keyEv('keyUp', k); },
        // Enter as a keyboard types it: a focused button takes it.
        enter: async () => {
          await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
          await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        },
        click: async (x, y) => {
          await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
          for (const type of ['mousePressed', 'mouseReleased']) await cdp(ws, 'Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
        },
      };
      await flow(api);
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]);
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
    }
  }

  // The first screen at a size: nothing over the card from the first document
  // to 2 s after Betaflight took over; Enter on the card flies the class's
  // map on the pad, the hint up, the keyboard layout shown.
  async function firstScreen(api, label) {
    let r = await api.js(`await K.wait(2000); return JSON.stringify({ watch: window.__watch, st: K.state(), focus: document.activeElement && document.activeElement.id });`);
    console.log(label + ': ' + JSON.stringify({ samples: r.watch.samples, cardSamples: r.watch.cardSamples, cardAt: r.watch.cardAt, over: r.watch.over, hintUnder: r.watch.hintUnder }));
    assert.ok(r.watch.cardSamples >= 20, `${label}: the card watched (${r.watch.cardSamples} samples)`);
    assert.deepEqual(r.watch.over, [], `${label}: nothing drawn over the No controller card`);
    assert.deepEqual(r.watch.hintUnder, [], `${label}: no keys hint under the launch menu or the card`);
    assert.equal(r.st.prompt, true);
    assert.equal(r.focus, 'feelKeys', 'Fly with keyboard has the focus');
    await api.enter();
    r = await api.js(`const flying = await K.until(() => !document.body.classList.contains('menu-open') && !(window._feel && window._feel.promptOpen), 3000);
      await K.until(() => document.getElementById('hudArmHint').classList.contains('show'), 3000);
      // The layout is painted by the input poll's first-flight step; the quad
      // is set down from 0.35 m over the pad.
      await K.until(() => K.state().card === 'keys', 3000);
      await K.until(() => K.state().clr <= 0.05, 4000);
      return JSON.stringify({ flying, st: K.state(), choice: localStorage.getItem('quadmathSimInputChoice'), watch: window.__watch });`);
    assert.equal(r.flying, true, `${label}: Fly with keyboard flies at once, no launch menu`);
    assert.equal(r.st.map, 'rig', `${label}: the Rig`);
    assert.equal(r.choice, 'keyboard');
    assert.equal(r.st.armed, false, 'on the pad, not armed');
    assert.ok(r.st.clr <= 0.05, `${label}: on the pad (${r.st.clr})`);
    assert.equal(r.st.hint, KEYS_HINT, `${label}: the hint`);
    assert.equal(r.st.card, 'keys', `${label}: the keyboard layout ` + JSON.stringify(r.st));
    assert.deepEqual(r.watch.hintUnder, [], `${label}: still none under a menu`);
  }

  try {
    await t.test('a first visit at 1920x1080: nothing over the No controller card from load to Betaflight ready; Enter flies the Rig, on the pad, W up · S down shown', async () => {
      await pass({ view: [1920, 1080], watch: true }, async (api) => { await firstScreen(api, '1920x1080'); });
    });

    await t.test('a first visit at 1366x768, a novice on the keys: the card clear, the Rig at once; 30 s in the air with no crash; up, down, a landing on S that disarms, W again', async () => {
      await pass({ view: [1366, 768], watch: true }, async (api) => {
        await firstScreen(api, '1366x768');
        // Flown at 640x360: a software GPU's frame rate at 1366x768 (5 to 10
        // frames a second) flies nobody, novice or not.
        await cdp(api.ws, 'Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
        // The novice: decides on what it saw 400 ms of sim time ago; holds
        // keys; looks about every 3-5 s; after a disarm, lets go, 1 s, W again.
        let seed = 11;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const held = new Set();
        const press = async (k) => { if (!held.has(k)) { held.add(k); await api.down(k); } };
        const release = async (k) => { if (held.has(k)) { held.delete(k); await api.up(k); } };
        const releaseAll = async () => { for (const k of [...held]) await release(k); };
        const hist = [];
        let s = await api.js('return JSON.stringify(K.state());');
        const sim0 = s.sim;
        let nextWander = 3000 + rnd() * 2000, wanderKey = null, wanderUntil = 0, armedSeen = false, rearms = 0, stuckSince = null, respawns = 0;
        while (s.air < 30000 && s.sim - sim0 < 150000) {
          s = await api.js('return JSON.stringify(K.state());');
          const now = s.sim - sim0;
          hist.push({ now, ...s });
          while (hist.length > 2 && hist[1].now <= now - 400) hist.shift();
          const d = hist[0];
          if (s.armed) armedSeen = true;
          if (!s.armed && armedSeen) {
            await releaseAll(); wanderKey = null;
            const t0 = s.sim;
            await api.js(`await K.until(() => K.sim() - ${t0} >= 1000, 8000); return 1;`);
            // Upside down or on its side: the hint's full stick (Easy mode's turtle).
            const lying = await api.js('return JSON.stringify(K.state());');
            if (lying.up < 0.5) { await press('right'); await api.js(`const t1 = K.sim(); await K.until(() => K.sim() - t1 >= 1500, 9000); return 1;`); await release('right'); }
            rearms++;
            hist.length = 0;
            armedSeen = false;
            await press('w');
            continue;
          }
          // Propped on a wall or a shelf, tipped and not moving (the plant's
          // propped case): R, as the legend says, then on as before.
          const propped = s.armed && ((s.flags | 0) & 2) && s.up < 0.5 && Math.abs(s.vz) < 0.3;
          stuckSince = propped ? (stuckSince == null ? now : stuckSince) : null;
          if (stuckSince != null && now - stuckSince >= 1500) {
            await releaseAll(); wanderKey = null; stuckSince = null; respawns++;
            await api.key('r');
            hist.length = 0;
            await api.js(`const t1 = K.sim(); await K.until(() => K.sim() - t1 >= 800, 8000); return 1;`);
            continue;
          }
          if (d.clr < 0.6 && d.vz <= 0.2) await press('w');
          else if (held.has('w') && (d.vz > 0.8 || d.clr > 2.5)) await release('w');
          if (d.clr > 3.0 && d.vz >= -0.3) await press('s');
          else if (held.has('s') && (d.vz < -1.0 || d.clr < 1.5)) await release('s');
          if (wanderKey && now >= wanderUntil) {
            await release(wanderKey);
            // A look forward is a tap up and as long a tap back (it stays about where it was).
            if (wanderKey === 'up') { wanderKey = 'down'; wanderUntil = now + 250; await press('down'); }
            else { wanderKey = null; nextWander = now + 3000 + rnd() * 2000; }
          }
          if (!wanderKey && now >= nextWander && s.clr > 0.8) {
            const r = rnd();
            wanderKey = r < 0.4 ? 'up' : r < 0.7 ? 'a' : 'd';
            wanderUntil = now + (wanderKey === 'up' ? 250 : 300 + rnd() * 500);
            await press(wanderKey);
          }
          await sleep(40);
        }
        await releaseAll();
        const fps = await api.raw('Math.round(window._sim.looks.fps.avg || 0)');
        console.log('novice: ' + JSON.stringify({ simS: +((s.sim - sim0) / 1000).toFixed(1), airS: +(s.air / 1000).toFixed(1), crashes: s.crashes, rearms, respawns, disarms: s.disarms, mode: s.mode, fps }));
        assert.ok(s.air >= 30000, `30 s in the air as flew30 counts it (${(s.air / 1000).toFixed(1)} s in ${((s.sim - sim0) / 1000).toFixed(1)} s)`);
        assert.equal(s.crashes, 0, 'no crash');
        assert.ok(!s.disarms.some((x) => x.why === 'crash'), 'no crash disarm ' + JSON.stringify(s.disarms));

        // No key: it holds a hover, clear of the floor and the ceiling.
        const after = (ms) => api.js(`const t0 = K.sim(); await K.until(() => K.sim() - t0 >= ${ms}, ${ms * 6 + 4000}); return JSON.stringify(K.state());`);
        s = await after(200);
        if (!s.armed) { await press('w'); s = await after(1500); await release('w'); }
        if (s.clr > 2.5) { await press('s'); await api.js(`await K.until(() => K.state().clr < 1.8 || !K.state().armed, 8000); return 1;`); await release('s'); }
        s = await after(2500);
        assert.equal(s.armed, true, 'still flying ' + JSON.stringify(s));
        assert.ok(s.clr > 0.2 && s.clr < 5.5, 'no key: a hover, clear of the floor and the ceiling ' + s.clr);
        assert.ok(Math.abs(s.vz) < 1.2, 'not going anywhere fast: vz ' + s.vz);
        assert.equal(s.hint, KEYS_HINT, 'the hint stays up in flight');
        // W: up.
        const z0 = s.clr;
        await press('w');
        const up = await api.js(`const t0 = K.sim(); let top = -9; await K.until(() => { top = Math.max(top, K.state().vz); return K.sim() - t0 >= 700; }, 8000);
          return JSON.stringify({ top, st: K.state() });`);
        await release('w');
        console.log('W: ' + JSON.stringify({ z0, z: up.st.clr, top: up.top }));
        assert.ok(up.st.clr - z0 >= 0.3 && up.top >= 0.8, `W climbs (${z0.toFixed(2)} to ${up.st.clr.toFixed(2)} m, up to ${up.top.toFixed(2)} m/s)`);
        // S: down, and held to the floor: landed, disarmed.
        await press('s');
        const down = await api.js(`const t0 = K.sim(); let low = 9; const off = await K.until(() => { low = Math.min(low, K.state().vz); return !K.state().armed; }, 30000);
          const t1 = K.sim(); await K.until(() => K.sim() - t1 >= 200, 4000);
          return JSON.stringify({ off, low, simMs: K.sim() - t0, st: K.state(), flags: K.s.coreState().armingDisableFlags, bf: K.s.core() === 'bf' ? K.s.bfReport && K.s.bfReport() : null });`);
        await release('s');
        console.log('S: ' + JSON.stringify({ off: down.off, low: down.low, simMs: down.simMs, dis: down.st.dis, disarms: down.st.disarms, crashes: down.st.crashes, up: down.st.up, flags: down.flags }));
        assert.ok(down.low <= -0.5, `S sinks (${down.low.toFixed(2)} m/s)`);
        assert.equal(down.off, true, 'S held to the floor disarms');
        assert.equal(down.st.dis, 'landed', 'a landing, not a crash ' + JSON.stringify({ dis: down.st.dis, disarms: down.st.disarms, up: down.st.up, flags: down.flags }));
        assert.equal(down.st.crashes, 0);
        assert.ok(down.st.clr <= 0.05, 'on the floor');
        // W again: arms and lifts to a hover, a tap included.
        await api.js(`const t0 = K.sim(); await K.until(() => K.sim() - t0 >= 600, 6000); return 1;`);
        await press('w');
        await sleep(150);
        await release('w');
        const again = await api.js(`const t0 = K.sim(); const armed = await K.until(() => K.state().armed, 6000);
          const lifted = await K.until(() => K.state().clr > 0.3, 12000);
          const t1 = K.sim(); await K.until(() => K.sim() - t1 >= 2000, 14000);
          return JSON.stringify({ armed, lifted, st: K.state() });`);
        console.log('W again: ' + JSON.stringify({ armed: again.armed, lifted: again.lifted, clr: again.st.clr, vz: again.st.vz }));
        assert.equal(again.armed, true, 'a tap of W arms');
        assert.equal(again.lifted, true, 'and lifts');
        assert.equal(again.st.armed, true, 'and stays up, no key held');
        assert.ok(again.st.clr > 0.3 && again.st.clr < 5.5, 'hovering ' + again.st.clr);
        assert.equal(again.st.crashes, 0);
      });
    });

    await t.test('outside the spring: in Acro the keys keep their own throttle (W ramps 1.4 a second and stays where it is let go); back in Angle, no key eases to the hover', async () => {
      await pass({ view: [1366, 768], storage: { quadmathSimInputChoice: 'keyboard' }, query: 'map=rig' }, async (api) => {
        const T = 'window._sim.stickOverlay().stick.t';
        await api.key('three');
        let r = await api.js(`await K.until(() => window._sim.easy().flightMode === 'acro', 2000); return JSON.stringify(K.state());`);
        assert.equal(r.mode, 'acro', 'Acro on 3');
        await api.key('space');
        r = await api.js(`const armed = await K.until(() => K.state().armed, 3000); return JSON.stringify({ armed, t: ${T} });`);
        assert.equal(r.armed, true, 'Space arms');
        assert.equal(r.t, 0, 'armed at the bottom');
        await api.down('w');
        r = await api.js(`const t0 = K.sim(); await K.until(() => K.sim() - t0 >= 250, 4000); return JSON.stringify({ t: ${T} });`);
        await api.up('w');
        const after = await api.js(`const a = ${T}; const t0 = K.sim(); await K.until(() => K.sim() - t0 >= 800, 6000); return JSON.stringify({ a, b: ${T} });`);
        console.log('acro: ' + JSON.stringify({ held: r.t, after }));
        // The ramp runs on the page's input time, which slow frames shorten
        // against sim time: up, by some amount; then it stays.
        assert.ok(r.t > 0.1, 'W ramps (' + r.t + ')');
        assert.equal(after.b, after.a, 'let go, it stays where it is');
        await api.key('one');
        r = await api.js(`await K.until(() => window._sim.easy().flightMode === 'angle', 2000); const t0 = K.sim(); await K.until(() => K.sim() - t0 >= 600, 6000);
          return JSON.stringify({ mode: window._sim.easy().flightMode, t: ${T}, armed: K.state().armed, clr: K.state().clr });`);
        console.log('angle again: ' + JSON.stringify(r));
        assert.equal(r.mode, 'angle');
        assert.ok(Math.abs(r.t - after.b) > 0.02, 'in Angle the spring has it (' + r.t + ' from ' + after.b + ')');
        if (r.clr > 0.5) assert.ok(r.armed && r.t > 0.2, 'taken over in the air: it flies on at the hover ' + JSON.stringify(r));
      });
    });

    await t.test('pinned to the ceiling at full throttle is not flying: the race offer\'s air time (flew30\'s rule) stands still there and runs in the open', async () => {
      await pass({ view: [1024, 576], storage: { quadmathSimInputChoice: 'keyboard' }, query: 'map=rig' }, async (api) => {
        const r = await api.js(`const s = K.s;
          s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
          await K.wait(1200);
          s.tryArm();
          await K.until(() => K.state().armed, 3000);
          s.setTestStick({ r: 0, p: 0, y: 0, t: 0.8 });
          const pinned = await K.until(() => (K.state().flags | 0) & 2, 15000);
          const a0 = s.raceOffer().airMs; const c0 = K.sim();
          await K.until(() => K.sim() - c0 >= 3000, 20000);
          const atCeiling = { air: s.raceOffer().airMs - a0, sim: K.sim() - c0, flags: K.state().flags, clr: K.state().clr };
          // Down to 2.5 m and held there (a vz loop on the test stick, every 4 ms), then 2 s of it counted.
          let i = 0;
          const hold = setInterval(() => { const st = K.state(); const vzT = Math.max(-1.5, Math.min(1.5, (2.5 - st.clr) * 1.5));
            i = Math.max(-0.3, Math.min(0.3, i + (vzT - st.vz) * 0.001)); s.setTestStick({ r: 0, p: 0, y: 0, t: Math.max(0, Math.min(1, 0.41 + i + (vzT - st.vz) * 0.08)) }); }, 4);
          await K.until(() => Math.abs(K.state().clr - 2.5) < 0.4 && Math.abs(K.state().vz) < 0.3, 20000);
          const a1 = s.raceOffer().airMs; const c1 = K.sim();
          await K.until(() => K.sim() - c1 >= 2000, 20000);
          const open = { air: s.raceOffer().airMs - a1, sim: K.sim() - c1, flags: K.state().flags, clr: K.state().clr };
          clearInterval(hold);
          s.setTestStick(null);
          return JSON.stringify({ pinned: !!pinned, atCeiling, open });`);
        console.log('ceiling: ' + JSON.stringify(r));
        assert.equal(r.pinned, true, 'against the ceiling (a box contact)');
        assert.ok(r.atCeiling.air < 150, `pinned 3 s: ${r.atCeiling.air} ms counted`);
        assert.ok(r.open.air >= r.open.sim * 0.9, `in the open: ${r.open.air} of ${r.open.sim} ms counted`);
      });
    });

    // 1.6 Mbps down, 150 ms: the throttled load of 2026-11-25.
    const SLOW = { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 };
    // Until the launch screen's Fly is on screen; then its look, and a real click.
    const earlyClick = async (api, id) => {
      let b = null;
      for (let i = 0; i < 600 && !b; i++) {
        await sleep(50);
        try {
          b = await api.raw(`(() => { const e = document.getElementById(${JSON.stringify(id)}); const m = document.getElementById('startMenu');
            if (!e || !m) return null; const r = e.getBoundingClientRect(); if (!r.width || !m.classList.contains('open')) return null;
            const cs = getComputedStyle(e); return { x: r.left + r.width / 2, y: r.top + r.height / 2, wait: m.classList.contains('wait'), aria: e.getAttribute('aria-disabled'),
              after: getComputedStyle(e, '::after').content, opacity: +cs.opacity, cursor: cs.cursor, label: e.textContent, at: Math.round(performance.now()) }; })()`);
        } catch (e) { /* navigating */ }
      }
      assert.ok(b, id + ' on screen');
      console.log(id + ' before wiring: ' + JSON.stringify(b));
      assert.equal(b.wait, true, 'the launch menu waits for the module');
      assert.equal(b.aria, 'true');
      assert.match(b.after, /Loading/, 'it reads Loading…');
      assert.ok(b.opacity < 0.6 && b.cursor === 'progress', 'and looks it');
      // The card moves while it loads (the fonts, the stylesheet): clicked
      // where the button is, on two reads 50 ms apart, as a visitor clicks
      // what is there.
      let at = null;
      for (let i = 0; i < 60 && !at; i++) {
        at = await api.raw(`new Promise((res) => { const where = () => { const e = document.getElementById(${JSON.stringify(id)}), r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y); return { x, y, on: !!(hit && (hit === e || e.contains(hit))) }; };
          const a = where(); setTimeout(() => { const c = where(); res(a.on && c.on && a.x === c.x && a.y === c.y ? c : null); }, 50); })`);
      }
      assert.ok(at, id + ' still under its own centre');
      await api.click(at.x, at.y);
      // Kept once the page has handled the click (a page still parsing handles it late).
      const kept = await api.raw(`new Promise((res) => { const t0 = performance.now(); const f = () => { if (window.__menuEarly || performance.now() - t0 > 2000) res({ early: window.__menuEarly, picked: document.getElementById(${JSON.stringify(id)}).classList.contains('picked'),
        layer: document.getElementById('menuLayer').classList.contains('show'), clicks: window.__clickLog, wait: document.getElementById('startMenu').classList.contains('wait'), at: Math.round(performance.now()) }); else setTimeout(f, 20); }; f(); })`);
      console.log(id + ' clicked: ' + JSON.stringify({ moved: at.y !== b.y ? { from: b.y, to: at.y } : null, ...kept }));
      assert.equal(kept.early, id, 'the click kept ' + JSON.stringify(kept));
      assert.equal(kept.picked, true, 'and marked');
      assert.equal(kept.layer, false, 'nothing done yet');
      return b;
    };

    await t.test('an early Fly at 1.6 Mbps, a returning keyboard visitor: Loading…, the click kept, and the Fly picker opens once the buttons are wired', async () => {
      await pass({ view: [1366, 768], storage: { quadmathSimInputChoice: 'keyboard' }, net: SLOW, boot: false }, async (api) => {
        const b = await earlyClick(api, 'menuFly');
        const r = JSON.parse(await api.raw(`(async () => { const t0 = performance.now(); while (performance.now() - t0 < 120000 && document.getElementById('startMenu').classList.contains('wait')) await new Promise((r) => setTimeout(r, 50));
          const wiredAt = Math.round(performance.now());
          const w0 = performance.now();
          while (performance.now() - w0 < 5000 && !document.querySelector('#menuLayer.show [data-fly-map]')) await new Promise((r) => setTimeout(r, 50));
          return JSON.stringify({ wiredAt, openAt: Math.round(performance.now()), picker: !!document.querySelector('#menuLayer.show [data-fly-map]'),
            aria: document.getElementById('menuFly').getAttribute('aria-disabled'), after: getComputedStyle(document.getElementById('menuFly'), '::after').content }); })()`));
        console.log('early Fly: ' + JSON.stringify({ clickAt: b.at, ...r }));
        assert.ok(r.wiredAt - b.at > 500, `clicked well before the wiring (${b.at} ms, wired at ${r.wiredAt} ms)`);
        assert.equal(r.picker, true, 'the Fly picker opens, no second click');
        assert.equal(r.aria, null);
        assert.equal(r.after, 'none', 'no longer Loading…');
      });
    });

    await t.test('the launch menu painted and the rest of the page held 2.5 s: a click on Fly then is kept, and the Fly picker opens once the buttons are wired', async () => {
      await pass({ view: [1366, 768], storage: { quadmathSimInputChoice: 'keyboard' }, query: 'teststall=2500', boot: false }, async (api) => {
        const b = await earlyClick(api, 'menuFly');
        assert.ok(b.at < 2000, `clicked while the page was held (${b.at} ms)`);
        const r = JSON.parse(await api.raw(`(async () => { const t0 = performance.now(); while (performance.now() - t0 < 120000 && document.getElementById('startMenu').classList.contains('wait')) await new Promise((r) => setTimeout(r, 50));
          const w0 = performance.now();
          while (performance.now() - w0 < 5000 && !document.querySelector('#menuLayer.show [data-fly-map]')) await new Promise((r) => setTimeout(r, 50));
          return JSON.stringify({ picker: !!document.querySelector('#menuLayer.show [data-fly-map]') }); })()`));
        assert.equal(r.picker, true, 'the Fly picker opens, no second click');
      });
    });

    await t.test('an early Boards at 1.6 Mbps on a first visit: kept through the No controller card; Fly with keyboard then opens Boards, not a flight', async () => {
      await pass({ view: [1366, 768], net: SLOW, boot: false }, async (api) => {
        await earlyClick(api, 'menuBoards');
        await api.boot();
        let r = await api.js(`await K.until(() => window._feel && window._feel.promptOpen, 20000); return JSON.stringify({ prompt: window._feel.promptOpen, layer: document.getElementById('menuLayer').classList.contains('show') });`);
        assert.equal(r.prompt, true, 'the card first');
        assert.equal(r.layer, false, 'Boards waits for it');
        await api.enter();
        r = await api.js(`await K.until(() => document.getElementById('menuLayer').classList.contains('show'), 5000);
          return JSON.stringify({ layer: document.getElementById('menuLayer').classList.contains('show'), text: document.getElementById('menuLayer').innerText.slice(0, 60), st: K.state() });`);
        console.log('early Boards: ' + JSON.stringify({ layer: r.layer, text: r.text, menu: r.st.menu }));
        assert.equal(r.layer, true, 'Boards opens');
        assert.match(r.text, /board/i);
        assert.equal(r.st.menu, true, 'on the launch screen, not flying');
      });
    });

    await t.test('an early Fly at 1.6 Mbps on a first visit: Fly with keyboard is that Fly, the Rig at once', async () => {
      await pass({ view: [1366, 768], net: SLOW, boot: false }, async (api) => {
        await earlyClick(api, 'menuFly');
        await api.boot();
        await api.js(`await K.until(() => window._feel && window._feel.promptOpen, 20000); return 1;`);
        await api.enter();
        const r = await api.js(`await K.until(() => !document.body.classList.contains('menu-open'), 5000); return JSON.stringify(K.state());`);
        assert.equal(r.menu, false, 'flying');
        assert.equal(r.map, 'rig');
      });
    });

    await t.test('a first visit by a link that flies a map (?map=house): Fly with keyboard keeps it', async () => {
      await pass({ view: [1366, 768], query: 'map=house' }, async (api) => {
        let r = await api.js(`await K.until(() => window._feel && window._feel.promptOpen, 10000); return JSON.stringify(K.state());`);
        assert.equal(r.prompt, true);
        await api.enter();
        r = await api.js(`await K.until(() => !(window._feel && window._feel.promptOpen), 3000); await K.wait(800); return JSON.stringify(K.state());`);
        assert.equal(r.map, 'house', 'still The House');
        assert.equal(r.menu, false);
      });
    });

    await t.test('no WebGL: the launch screen says the sim needs it, with no buttons', async () => {
      await pass({ view: [1366, 768], webgl: false, boot: false }, async (api) => {
        let r = null;
        for (let i = 0; i < 100 && !(r && r.ready); i++) {
          await sleep(100);
          try { r = await api.raw(`({ ready: document.readyState !== 'loading', cls: document.documentElement.className, msg: (() => { const e = document.getElementById('noWebgl'); return e && e.getBoundingClientRect().height > 0 ? e.textContent : null; })(),
            buttons: [...document.querySelectorAll('#startMenu button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.id), wait: document.getElementById('startMenu').classList.contains('wait') })`); } catch (e) { /* loading */ }
        }
        console.log('no WebGL: ' + JSON.stringify(r));
        assert.match(r.cls, /no-webgl/);
        assert.match(r.msg || '', /needs WebGL/);
        assert.deepEqual(r.buttons, [], 'no buttons');
        assert.equal(r.wait, false, 'and no Loading…');
      });
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
});
