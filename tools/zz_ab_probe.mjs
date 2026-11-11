// TEMPORARY (removed once read): what the page sees and how fast it runs on a
// CI runner, with the page's CSP <meta> in or stripped (the CI entry strips it
// for the "off" run). Not a test: it prints, and exits 0 unless it cannot run.
//   - pads: what navigator.getGamepads() really lists (no stub), the page's
//     radio readout, its input kind (stored and on the HUD);
//   - pacing: rAF frame intervals, the page's 4 ms poll firings, sim time
//     against wall time;
//   - the CSP test's keyboard drive (Space, W held 2.2 s of wall time): the
//     throttle the page reached and the height; then W held until it climbs,
//     with the sim time and wall time that took.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mime = (p) => ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.hdr': 'application/octet-stream' })[extname(p)] || 'application/octet-stream';
const chrome = process.env.CHROME || 'google-chrome';
const server = createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
  if (rel === '/') rel = '/sim.html';
  const f = join(root, rel.replace(/^\/+/, ''));
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime(f) }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const meta = /http-equiv="Content-Security-Policy"/.test(readFileSync(join(root, 'sim.html'), 'utf8'));
console.log('AB: csp meta in sim.html: ' + meta);

async function run(query, core) {
  const profile = mkdtempSync(join(tmpdir(), 'qm-ab-'));
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--disable-extensions', '--disable-background-networking', '--window-size=960,540',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let port = null;
    for (let i = 0; i < 100 && !port; i++) { await sleep(200); try { port = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0] || null; } catch (e) { /* not yet */ } }
    const pg = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page');
    ws = new WebSocket(pg.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let seq = 0; const wait = new Map(); const csp = [];
    ws.onmessage = (m) => { const o = JSON.parse(m.data); if (o.id && wait.has(o.id)) { wait.get(o.id)(o); wait.delete(o.id); } else if (o.method === 'Log.entryAdded' && /Content Security Policy/.test(o.params.entry.text)) csp.push(o.params.entry.text.slice(0, 120)); };
    const send = (method, params) => new Promise((res) => { const id = ++seq; wait.set(id, (o) => res(o.result || o.error)); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r && r.result ? r.result.value : r; };
    await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
    await send('Page.navigate', { url: `${origin}/sim.html?${query}` });
    let ok = false;
    for (let i = 0; i < 300 && !ok; i++) { await sleep(250); ok = await ev(`!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); }
    if (!ok) { console.log('AB: ' + core + ' did not boot'); return; }
    // The keyboard, from the first-run prompt; then what the page sees.
    const seen = await ev(`(async () => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      if (window._feel && window._feel.promptOpen && document.getElementById('feelKeys')) document.getElementById('feelKeys').click();
      await w(800);
      const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].map((p) => p && { id: p.id, connected: p.connected });
      return JSON.stringify({ pads, radioInfo: document.getElementById('radioInfo').textContent.slice(0, 40), choice: localStorage.getItem('quadmathSimInputChoice'),
        hud: document.getElementById('osdTR').textContent.slice(0, 60), fpsAvg: window._sim.looks.fps.avg });
    })()`);
    console.log('AB: ' + core + ' sees: ' + seen);
    // Pacing over 3 s of wall time.
    const pace = await ev(`(async () => {
      const fr = []; let iv = 0, on = true;
      (function f(t) { if (!on) return; fr.push(t); requestAnimationFrame(f); })(performance.now());
      const h = setInterval(() => iv++, 4);
      const c0 = window._sim.coreState().flightMs, w0 = performance.now();
      await new Promise((r) => setTimeout(r, 3000));
      on = false; clearInterval(h);
      const d = fr.slice(1).map((t, i) => t - fr[i]).sort((a, b) => a - b);
      return JSON.stringify({ wallMs: Math.round(performance.now() - w0), frames: fr.length, frameMedianMs: Math.round(d[d.length >> 1] || 0), frameMaxMs: Math.round(d[d.length - 1] || 0),
        pollTimerFiresPerS: Math.round(iv / 3), flightMsDelta: Math.round(window._sim.coreState().flightMs - c0) });
    })()`);
    console.log('AB: ' + core + ' pacing (disarmed, flightMs only runs armed): ' + pace);
    const key = async (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk });
    let armed = false;
    for (let i = 0; i < 6 && !armed; i++) {
      await key('rawKeyDown', ' ', 'Space', 32); await key('keyUp', ' ', 'Space', 32);
      for (let j = 0; j < 15 && !armed; j++) { await sleep(100); armed = await ev('window._sim.coreState().armed'); }
    }
    const a0 = await ev(`JSON.stringify({ t: window._axis().stick.t, sim: window._sim.coreState().flightMs, wall: performance.now() })`).then(JSON.parse);
    await key('rawKeyDown', 'w', 'KeyW', 87);
    await sleep(2200);
    const a1 = await ev(`JSON.stringify({ t: window._axis().stick.t, z: window._sim.coreState().position.z, sim: window._sim.coreState().flightMs, wall: performance.now(), armed: window._sim.coreState().armed })`).then(JSON.parse);
    console.log('AB: ' + core + ' W held 2.2 s wall: ' + JSON.stringify({ armed, throttle: a1.t, z: +a1.z.toFixed(2), simMs: Math.round(a1.sim - a0.sim), wallMs: Math.round(a1.wall - a0.wall) }));
    const a2 = await ev(`(async () => { const t0 = performance.now(); while (performance.now() - t0 < 40000 && window._sim.coreState().position.z <= 0.3) await new Promise((r) => setTimeout(r, 50));
      return JSON.stringify({ t: window._axis().stick.t, z: window._sim.coreState().position.z, sim: window._sim.coreState().flightMs, wall: performance.now() }); })()`).then(JSON.parse);
    await key('keyUp', 'w', 'KeyW', 87);
    console.log('AB: ' + core + ' W held until z > 0.3: ' + JSON.stringify({ climbed: a2.z > 0.3, throttle: a2.t, simMs: Math.round(a2.sim - a0.sim), wallMs: Math.round(a2.wall - a0.wall) }));
    console.log('AB: ' + core + ' CSP messages: ' + JSON.stringify(csp));
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
    await sleep(1000);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}
await run('quality=high&map=rig&track=rig-loop', 'bf');
await run('quality=low&core=js&map=rig', 'js');
server.close();
