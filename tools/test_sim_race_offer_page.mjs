// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Headless Chrome: the race offer and the race count (sim.html tickRaceOffer,
// raceThisMap, startRun's countNote('race')).
//   - Desktop, keyboard (flown at 640x360, placed at 1280x720): free flight on the Rig, 30 s of sim time
//     in the air, and the prompt shows, not before: "RACE THE RIG · 17 gates
//     · T", off the view's centre and clear of the HUD (the Warehouse's
//     longer name too), for 10 s of sim time. The next disarm shows it once
//     more, held while Tune is open (which hides it) until Tune closes; the
//     disarm after that does not. From the air, T (one key) flies the Rig
//     Loop as the Tracks picker does: on its pad, disarmed, the START ring
//     there, the arm hint up at once (two frames).
//     Space arms, the quad flies through gate 0, and the race ping goes out
//     once: { event: 'race', class: 65, core: 'bf', input: 'keyboard' }.
//   - Phone, touch, 812x375: the launch screen's line about tracks, its five
//     buttons clear (and at 667x375; 375x812 keeps the whole blurb). In the
//     air 30 s: the prompt with a RACE button, 44 px or more, clear of the
//     sticks, the footer and the HUD at 812x375, 667x375 and 375x812 (the
//     Warehouse's name too). One tap on RACE from the air: the Rig Loop, the
//     arm hint at once, ARM, gate 0, the race
//     ping with input 'touch'. Back in free flight after that race, a disarm
//     shows nothing: no offer once a race has started.
//   - In the source: no offer for a test's pilot; T is in SIM_KEYS and the
//     legend; T and RACE go through flyPickedTrack, the Tracks picker's own.
// The sticks are set once a frame by the Coach autopilot through
// _sim.setTestStick, which leaves the counter on (_sim.setTestPilot turns it
// off). The page is served as sim.quadmath.test (the counter is off on a
// local page) and every Worker request is caught (CDP Fetch): nothing leaves.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); its Chrome parts
// skip under SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { LEADERBOARD_URL } from '../sim-retention.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HOST = 'sim.quadmath.test';
const WS = 3.5;

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
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// The page's own helpers: what is on screen, and where the prompt sits.
const PAGE = `(() => {
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; }
    return true;
  };
  const box = (r) => ({ left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const uncovered = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); };
  // What the prompt must stay clear of, where it is on screen.
  const HUD = ['#osdTR', '#osdTL', '#osdGate', '#osdLap', '#osdBC', '#osdBR', '#menuBtn', '#gear', '#feelHud .feel-meta', '#hudArmHint',
    '#legend', '#touchBtns', '#touchLandscape', '#touchLayer .vstick.left', '#touchLayer .vstick.right', 'footer', '#stickOverlay', '#packHint', '#firstFlight', '#coachHud'];
  window.__ro = {
    shown,
    offer() {
      const el = document.getElementById('raceOffer');
      if (!shown(el)) return { shown: false };
      const r = el.getBoundingClientRect();
      const W = innerWidth, H = innerHeight;
      const centre = { left: W / 3, right: 2 * W / 3, top: H / 3, bottom: 2 * H / 3 };
      const over = HUD.map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && shown(e) && hit(r, e.getBoundingClientRect())).map(([q]) => q);
      const go = document.getElementById('raceOfferGo');
      const g = shown(go) ? go.getBoundingClientRect() : null;
      return { shown: true, text: el.innerText.replace(/\\s+/g, ' ').trim(), rect: box(r), view: [W, H],
        inView: r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H, overCentre: hit(r, centre), over,
        go: g ? { w: Math.round(g.width), h: Math.round(g.height), uncovered: uncovered(go) } : null };
    },
    launch() {
      const ids = ['menuFly', 'menuDaily', 'menuBoards', 'menuTune', 'menuControls'];
      const t = document.querySelector('.menu-tracks'), l = document.querySelector('.menu-lead.menu-launch');
      return { buttons: ids.map((id) => { const b = document.getElementById(id); return { id, shown: shown(b), uncovered: shown(b) && uncovered(b) }; }),
        tracks: shown(t) ? t.textContent.trim() : null, lead: shown(l) ? l.textContent.trim() : null };
    },
    hint() { const h = document.getElementById('hudArmHint'); return shown(h) ? h.textContent.trim() : null; },
    race() {
      const s = window._sim, g = s.scene.getObjectByName('raceGroup');
      const rings = g ? g.children.filter((o) => o.geometry && o.geometry.type === 'TorusGeometry') : [];
      const t = s.findTrack(s.track());
      const g0 = t && t.gates && t.gates[0];
      const start = g ? g.children.filter((o) => o.isSprite && g0 && Math.hypot(o.position.x - g0.x, o.position.z - g0.z) < 0.5 && o.position.y > g0.y) : [];
      const c = s.coreState();
      return { map: s.map(), track: String(s.track()), gates: t && t.gates ? t.gates.length : 0, rings: rings.length, startRing: rings.length > 0 && start.length === 1,
        armed: !!c.armed, offer: s.raceOffer(), gate: document.getElementById('osdGate').textContent };
    },
  };
  return true;
})()`;

// The pilot, once a frame in the page (requestAnimationFrame), through
// _sim.setTestStick: the Coach autopilot along a path, a slow landing, or
// sticks at rest; disarmed, sticks at rest (the throttle down, to arm).
const PILOT = `import('/tools/coach_rig_autopilot.mjs').then((A) => {
  const s = window._sim;
  const P = window.__pilot = { mode: 'off', path: null, mem: null, frames: 0, error: null };
  const LIM = { lat: 6, acc: 4, dec: 6 };
  P.here = () => { const st = A.sceneState(s.coreState()); return { p: [st.p.x, st.p.y, st.p.z], yaw: st.yaw }; };
  P.plan = (pts, v) => {
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dz = b[2] - a[2];
    const yaw0 = Math.hypot(dx, dz) > 0.05 ? Math.atan2(-dx, -dz) : P.here().yaw;
    P.path = A.buildPath({ wps: pts.map((p, i) => ({ p, v: i === 0 ? 0.5 : v })), yaw0, limits: LIM, vEnd: 0 });
    P.mem = A.trackerMemory();
  };
  // Up from where it is to h metres, 40 cm ahead, and hold there.
  P.hover = (h) => {
    const { p, yaw } = P.here();
    const f = [-Math.sin(yaw), -Math.cos(yaw)];
    P.plan([[p[0], Math.max(0.01, p[1]), p[2]], [p[0], 0.6, p[2]], [p[0] + f[0] * 0.4, h, p[2] + f[1] * 0.4]], 0.8);
    P.mode = 'fly';
  };
  P.to = (pts, v) => { P.plan([P.here().p, ...pts], v); P.mode = 'fly'; };
  const tick = () => {
    try {
      const cs = s.coreState();
      if (!cs.armed || P.mode === 'off') s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
      else if (P.mode === 'land') s.setTestStick({ r: 0, p: 0, y: 0, t: cs.airborne ? 0.12 : 0 });
      else { const c = A.track(P.path, A.sceneState(cs), P.mem, {}); s.setTestStick({ r: c.r, p: c.p, y: c.y, t: c.t }); }
      P.frames++;
    } catch (e) { P.error = String(e && e.stack || e); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})`;

// One Chrome, one page: { cdp, evaluate, key, tap, click, pings, close }.
async function openPage({ mobile, w, h }) {
  const { server, port } = await serveRoot();
  const site = `http://${HOST}:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'qm-race-offer-'));
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--window-size=${w},${h}`, `--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${site}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  const close = async () => {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    killTree(child);
    await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
    await new Promise((res) => server.close(res));
    for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
  };
  try {
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
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  } catch (e) { await close(); throw e; }
  let seq = 0;
  const cdp = (method, params) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 30000);
      const on = (msg) => {
        let o;
        try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
        if (o.id !== id) return;
        clearTimeout(t);
        ws.removeEventListener('message', on);
        if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {});
      };
      ws.addEventListener('message', on);
    });
  };
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  // Every request to the Worker, the rooms Worker or Cloudflare's analytics:
  // a count recorded and answered 204, anything else failed.
  const pings = [];
  ws.addEventListener('message', (msg) => {
    let o;
    try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
    if (!o || o.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = o.params;
    if (request.url === LEADERBOARD_URL + '/api/count' && request.method === 'POST') {
      pings.push({ body: JSON.parse(request.postData), type: o.params.resourceType });
      cdp('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }] }).catch(() => {});
    } else cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
  });
  await cdp('Fetch.enable', { patterns: [
    { urlPattern: LEADERBOARD_URL + '/*' }, { urlPattern: 'https://sim-rooms.ryan-roths.workers.dev/*' },
    { urlPattern: 'https://static.cloudflareinsights.com/*' }, { urlPattern: 'https://cloudflareinsights.com/*' },
  ] });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  // SIM_CPU_THROTTLE=6: a slow runner's frame rate (the pilot steers once a frame).
  if (process.env.SIM_CPU_THROTTLE) await cdp('Emulation.setCPUThrottlingRate', { rate: +process.env.SIM_CPU_THROTTLE });
  const size = async (W, H) => {
    await cdp('Emulation.setDeviceMetricsOverride', mobile
      ? { width: W, height: H, deviceScaleFactor: 2.625, mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } }
      : { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  };
  if (mobile) {
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', platform: 'Android' });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await size(w, h);
  const key = async (k, code, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(k.length === 1 ? { text: k } : {}) });
    await sleep(50);
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  const centre = async (sel) => {
    const r = JSON.parse(await evaluate(`JSON.stringify((() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || !window.__ro.shown(el)) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })())`));
    assert.ok(r, sel + ' is on screen');
    return r;
  };
  const tap = async (sel) => {
    const { x, y } = await centre(sel);
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const click = async (sel) => {
    const { x, y } = await centre(sel);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const open = async () => {
    await cdp('Page.navigate', { url: `${site}/sim.html?quality=low` });
    let ok = false;
    const t0 = Date.now();
    while (!ok && Date.now() - t0 < 120000) {
      await sleep(250);
      try { ok = await evaluate(`!!(window._sim && window._simQueryBooted && window._sim.core && window._sim.core() === 'bf' && window._sim.raceOffer)`); } catch (e) { /* navigating */ }
    }
    assert.ok(ok, 'booted on the bf core');
    await evaluate(PAGE);
  };
  const until = async (fn, ms, what) => {
    const t0 = Date.now();
    let v;
    while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(100); }
    assert.fail(what + ' (waited ' + ms + ' ms): ' + JSON.stringify(await evaluate(`JSON.stringify(window.__ro.race())`)));
  };
  const race = async () => JSON.parse(await evaluate(`JSON.stringify(window.__ro.race())`));
  const offer = async () => JSON.parse(await evaluate(`JSON.stringify(window.__ro.offer())`));
  const sim = async () => JSON.parse(await evaluate(`JSON.stringify((() => { const s = window._sim, c = s.coreState(); return { clock: s.simClockMs(), armed: !!c.armed, air: !!c.airborne, z: c.position.z, offer: s.raceOffer(), testPilot: s.testPilotUsed() }; })())`));
  // Two painted frames from now.
  const frames = () => evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
  return { cdp, evaluate, key, tap, click, size, open, until, race, offer, sim, frames, pings, close };
}

// Free flight, armed and holding 1 m, until the prompt shows: never before
// 30 s of sim time in the air. Returns the sim clock when it showed.
async function flyUntilOffer(P, arm) {
  await P.evaluate(PILOT);
  await P.until(() => P.evaluate(`!!window.__pilot`), 5000, 'the pilot loaded');
  await P.evaluate(`window.__pilot.hover(1.0), true`);
  await arm();
  await P.until(async () => (await P.sim()).armed, 5000, 'armed');
  const t0 = Date.now();
  let s = null, aloft = Date.now();
  while (Date.now() - t0 < 120000) {
    s = await P.sim();
    assert.equal(s.offer.shown && s.offer.airMs < 30000, false, 'not before 30 s in the air: ' + JSON.stringify(s));
    if (s.offer.shown) break;
    if (s.air) aloft = Date.now();
    if (!s.armed) { await arm(); await P.evaluate(`window.__pilot.hover(1.0), true`); aloft = Date.now(); }
    // Down but armed (a slow frame rate let the hover touch): up again.
    else if (Date.now() - aloft > 1500) { await P.evaluate(`window.__pilot.hover(1.0), true`); aloft = Date.now(); }
    await sleep(200);
  }
  assert.ok(s.offer.shown, 'the offer after 30 s in the air: ' + JSON.stringify(s));
  assert.ok(s.offer.airMs >= 30000 && s.offer.airMs < 31500, '30 s in the air: ' + s.offer.airMs);
  assert.equal(s.offer.shows, 1);
  assert.equal(s.offer.track, 'rig-loop', 'the Rig\'s race');
  assert.equal(s.testPilot, false, 'no test pilot: the counter is on');
  return s.clock;
}

// Off the view's centre, inside the view, over nothing of the HUD.
function assertPlaced(o, where) {
  assert.ok(o.shown, where + ': shown');
  assert.ok(o.inView, where + ': inside the view ' + JSON.stringify(o));
  assert.equal(o.overCentre, false, where + ': not over the centre of the view ' + JSON.stringify(o));
  assert.deepEqual(o.over, [], where + ': clear of the HUD, the sticks and the footer ' + JSON.stringify(o));
}

// Fly from the pad through the race's gate 0, on to 1.2 m past it.
async function throughGate0(P) {
  await P.evaluate(`(() => {
    const t = window._sim.findTrack(window._sim.track()), g = t.gates[0], h = window.__pilot.here().p;
    const g0 = [g.x / ${WS}, g.y / ${WS}, g.z / ${WS}], dx = g0[0] - h[0], dz = g0[2] - h[2], d = Math.hypot(dx, dz) || 1;
    window.__pilot.to([[h[0], 0.6, h[2]], g0, [g0[0] + dx / d * 1.2, g0[1], g0[2] + dz / d * 1.2]], 1.2);
    return true;
  })()`);
}

test('the race offer in the source: no offer for a test pilot; T in SIM_KEYS and the legend; T and RACE through the Tracks picker\'s flyPickedTrack', () => {
  const html = readFileSync(join(root, 'sim.html'), 'utf8').replace(/\r\n/g, '\n');
  const fn = (name) => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, name); return html.slice(i, html.indexOf('\n}', i) + 2); };
  assert.ok(fn('raceOfferTrack').includes('testPilotUsed'), 'none for a test pilot');
  assert.ok(fn('raceOfferTrack').includes('raceOffer.raceStarted'), 'none once a race has started');
  assert.ok(fn('startRun').includes("countNote('race');") && fn('startRun').includes('raceOffer.raceStarted=true;'));
  assert.ok(fn('raceThisMap').includes('return flyPickedTrack(currentMap,t.id);'), 'the Tracks picker\'s own way in');
  assert.ok(html.includes('flyPickedTrack(pickerMap,id);'), 'which the Tracks picker\'s rows call');
  assert.match(html, /const SIM_KEYS=new Set\(\[[^\]]*'t'[^\]]*\]\)/, 'T is a sim key: no type-ahead on a select');
  assert.ok(html.includes("if(e.key.toLowerCase()==='t'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){raceThisMap();return;}"));
  assert.ok(html.includes('<b>T — Race this map</b><br>'), 'the legend');
  assert.ok(html.includes("go.addEventListener('click',e=>{e.preventDefault();go.blur();raceThisMap();});"), 'RACE on touch');
});

test('desktop, keyboard: 30 s in the air, the offer; once more at the next disarm, not after; T, the Rig Loop, the arm hint at once, gate 0, the race ping', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  // Flown at 640x360 (a slow runner's frame rate holds the hover); every
  // placement is measured at 1280x720.
  const P = await openPage({ mobile: false, w: 640, h: 360 });
  const at1280 = async (fn) => { await P.size(1280, 720); await sleep(250); await P.frames(); try { return await fn(); } finally { await P.size(640, 360); } };
  try {
    await P.open();
    // As a visitor: the keyboard on the first-run prompt, Fly, the Rig.
    await P.click('#feelKeys');
    await sleep(500);
    await P.click('#menuFly');
    await sleep(700);
    await P.click('#menuLayer .fly-map.on');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    await P.cdp('Page.bringToFront');
    const space = () => P.key(' ', 'Space', 32);
    await flyUntilOffer(P, space);
    await at1280(async () => {
      const o1 = await P.offer();
      assert.equal(o1.text, 'RACE THE RIG · 17 gates · T');
      assert.equal(o1.go, null, 'no button on a keyboard');
      assertPlaced(o1, 'desktop 1280x720');
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE WAREHOUSE', document.getElementById('raceOfferGates').textContent = '19 gates', true`);
      await P.frames();
      assertPlaced(await P.offer(), 'desktop 1280x720, RACE THE WAREHOUSE');
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE RIG', document.getElementById('raceOfferGates').textContent = '17 gates', true`);
    });
    // 10 s of sim time, by the page's own clock (the step that ends it can run
    // up to a frame past).
    let s = await P.until(async () => { const v = await P.sim(); return v.offer.shown ? null : v; }, 30000, 'the offer goes after 10 s');
    const held = s.offer.hiddenAt - s.offer.shownAt;
    assert.ok(held >= 10000 && held < 10600, 'shown 10 s of sim time: ' + held);
    // Down and disarmed with Tune open: the showing waits for Tune (which
    // hides it), then comes when Tune closes.
    await P.evaluate(`window.__pilot.mode = 'land', true`);
    await P.until(async () => !(await P.sim()).air, 20000, 'landed');
    await P.key('Tab', 'Tab', 9);
    await P.until(() => P.evaluate(`document.getElementById('panel').classList.contains('open')`), 3000, 'Tune open');
    await space();
    await P.until(async () => !(await P.sim()).armed, 3000, 'disarmed');
    await sleep(1200);
    s = await P.sim();
    assert.equal(s.offer.shown, false, 'not while Tune is open');
    assert.equal(s.offer.shows, 1, 'the showing not spent behind Tune');
    assert.equal(s.offer.due, true, 'it waits for Tune');
    await P.key('Tab', 'Tab', 9);
    s = await P.until(async () => { const v = await P.sim(); return !v.armed && v.offer.shown ? v : null; }, 3000, 'the offer again once Tune closes');
    assert.equal(s.offer.shows, 2);
    await at1280(async () => {
      const o2 = await P.offer();
      assert.equal(o2.text, 'RACE THE RIG · 17 gates · T');
      assertPlaced(o2, 'desktop 1280x720, disarmed (the arm hint up)');
    });
    await P.until(async () => !(await P.sim()).offer.shown, 30000, 'the second showing goes');
    // Up and down again: never a third time.
    await P.evaluate(`window.__pilot.hover(1.0), true`);
    await space();
    await P.until(async () => (await P.sim()).air, 8000, 'in the air again');
    await sleep(1500);
    await P.evaluate(`window.__pilot.mode = 'land', true`);
    await P.until(async () => !(await P.sim()).air, 20000, 'landed again');
    await space();
    await P.until(async () => !(await P.sim()).armed, 3000, 'disarmed again');
    await sleep(1500);
    s = await P.sim();
    assert.equal(s.offer.shown, false, 'no third showing');
    assert.equal(s.offer.shows, 2);
    // In the air again, then T: the Rig Loop, on its pad, disarmed, the START
    // ring; the arm hint, which flying hides, within two painted frames.
    await P.evaluate(`window.__pilot.hover(1.0), true`);
    await space();
    await P.until(async () => (await P.sim()).air, 8000, 'flying before T');
    await sleep(800);
    assert.equal(await P.evaluate('window.__ro.hint()'), null, 'no arm hint while armed');
    await P.key('t', 'KeyT', 84);
    await P.frames();
    const hint = await P.evaluate('window.__ro.hint()');
    const r = await P.race();
    assert.equal(r.map, 'rig');
    assert.equal(r.track, 'rig-loop', 'the Rig Loop: ' + JSON.stringify(r));
    assert.equal(r.rings, r.gates, 'its gates');
    assert.equal(r.gates, 17);
    assert.ok(r.startRing, 'the START ring');
    assert.equal(r.armed, false, 'disarmed on its pad');
    assert.equal(r.offer.shown, false, 'the offer gone');
    assert.ok(hint && /W/.test(hint), 'the arm hint at once, for the keys: ' + hint);
    // Space, gate 0, the race ping.
    assert.ok(!P.pings.some((p) => p.body.event === 'race'), 'no race ping before gate 0');
    await throughGate0(P);
    await space();
    await P.until(async () => /LINE/.test((await P.race()).gate), 30000, 'gate 0 passed');
    await P.until(async () => P.pings.some((p) => p.body.event === 'race'), 5000, 'the race ping');
    await sleep(1000);
    const race = P.pings.filter((p) => p.body.event === 'race');
    assert.equal(race.length, 1, 'once');
    assert.deepEqual(race[0].body, { event: 'race', class: 65, core: 'bf', input: 'keyboard' });
    assert.equal(race[0].type, 'Ping', 'a beacon');
    const events = P.pings.map((p) => p.body.event);
    assert.ok(events.indexOf('race') > events.indexOf('ready'), 'after ready: ' + events.join(' '));
    assert.equal((await P.sim()).testPilot, false);
  } finally { await P.close(); }
});

test('phone, touch: the launch line about tracks; the offer with RACE, clear at three sizes; one tap, the Rig Loop, the arm hint at once, gate 0, the race ping; none after a race', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const P = await openPage({ mobile: true, w: 812, h: 375 });
  try {
    await P.open();
    // The launch screen: its line about tracks where the blurb gives way.
    for (const [W, H] of [[812, 375], [667, 375], [375, 812]]) {
      await P.size(W, H);
      await P.frames();
      const l = JSON.parse(await P.evaluate('JSON.stringify(window.__ro.launch())'));
      for (const b of l.buttons) assert.ok(b.shown && b.uncovered, `${W}x${H}: ${b.id} on screen and clear ` + JSON.stringify(l));
      const line = l.tracks || l.lead;
      assert.ok(line && /MENU opens tracks/.test(line), `${W}x${H}: the line about tracks ` + JSON.stringify(l));
    }
    await P.size(812, 375);
    await P.frames();
    await P.tap('#menuFly');
    await sleep(700);
    await P.tap('#menuLayer .fly-map.on');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    const arm = () => P.tap('#touchArm');
    await flyUntilOffer(P, arm);
    // The prompt and its RACE, at three sizes.
    for (const [W, H] of [[812, 375], [667, 375], [375, 812]]) {
      await P.size(W, H);
      await sleep(300);
      await P.frames();
      const o = await P.offer();
      assert.equal(o.text, 'RACE THE RIG 17 gates RACE', `${W}x${H}`);
      assertPlaced(o, `phone ${W}x${H}`);
      assert.ok(o.go && o.go.h >= 44 && o.go.w >= 44 && o.go.uncovered, `${W}x${H}: RACE, 44 px or more and clear ` + JSON.stringify(o.go));
      // The longest map's name (The Warehouse) stays clear too.
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE WAREHOUSE', document.getElementById('raceOfferGates').textContent = '19 gates', true`);
      await P.frames();
      assertPlaced(await P.offer(), `phone ${W}x${H}, RACE THE WAREHOUSE`);
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE RIG', document.getElementById('raceOfferGates').textContent = '17 gates', true`);
    }
    await P.size(812, 375);
    await sleep(300);
    // One tap, from the air: the Rig Loop, the arm hint (which flying hides)
    // within two painted frames.
    assert.equal((await P.sim()).armed, true, 'flying');
    assert.equal(await P.evaluate('window.__ro.hint()'), null, 'no arm hint while armed');
    await P.tap('#raceOfferGo');
    await P.frames();
    const hint = await P.evaluate('window.__ro.hint()');
    const r = await P.race();
    assert.equal(r.track, 'rig-loop', 'the Rig Loop: ' + JSON.stringify(r));
    assert.equal(r.rings, 17);
    assert.ok(r.startRing, 'the START ring');
    assert.equal(r.armed, false);
    assert.equal(r.offer.shown, false);
    assert.ok(hint && /stick|ARM/.test(hint), 'the arm hint at once, for touch: ' + hint);
    await throughGate0(P);
    await arm();
    await P.until(async () => /LINE/.test((await P.race()).gate), 30000, 'gate 0 passed');
    await P.until(async () => P.pings.some((p) => p.body.event === 'race'), 5000, 'the race ping');
    const race = P.pings.filter((p) => p.body.event === 'race');
    assert.equal(race.length, 1);
    assert.deepEqual(race[0].body, { event: 'race', class: 65, core: 'bf', input: 'touch' });
    // Back to free flight on the Rig: a disarm would have brought the second
    // showing; after a race, nothing.
    await P.evaluate(`window.__pilot.mode = 'land', true`);
    await P.until(async () => !(await P.sim()).air, 20000, 'landed');
    await P.tap('#menuBtn');
    await sleep(600);
    await P.tap('#menuTracks');
    await sleep(600);
    await P.tap('.track-list [data-tid="rig-freestyle"]');
    await P.until(async () => /freestyle/.test((await P.race()).track), 10000, 'free flight');
    await P.evaluate(`window.__pilot.hover(1.0), true`);
    await arm();
    await P.until(async () => (await P.sim()).air, 8000, 'in the air');
    await sleep(1000);
    await P.evaluate(`window.__pilot.mode = 'land', true`);
    await P.until(async () => !(await P.sim()).air, 20000, 'landed again');
    await arm();
    await P.until(async () => !(await P.sim()).armed, 3000, 'disarmed');
    await sleep(1500);
    const s = await P.sim();
    assert.equal(s.offer.shown, false, 'no offer once a race has started');
    assert.equal(s.offer.raceStarted, true);
    assert.equal(s.offer.shows, 1);
  } finally { await P.close(); }
});
