// Headless boot of every map: no console exceptions, correct resolveSimBoot,
// non-blank FPV, on both flight cores: the default (Betaflight in sim-core,
// which must actually load) and ?core=js. Requires Chrome + a local sim.html
// server (starts one).
//
// CI runs it in shards (.github/workflows/sim-tests.yml):
//   SIM_BOOT_CORE=bf|js   only the default-core cases, or only ?core=js
//   SIM_BOOT_SHARD=k/n    only every n-th case, starting at the k-th
// Unset, it runs everything. QM_BOOT_SHOTS=<dir> keeps each map's screenshot
// there; otherwise nothing is written outside the run's temp directory, which
// is removed when the run ends, pass or fail.
//
// The tours at the end fly every map as a pilot does, at low, med and high on
// both cores (sharded with the boot cases): see "Fly every map" below.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolveSimBoot, freestyleIdFor, MAPS } from '../sim-tracks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function resolveChrome() {
  const names = [
    process.env.CHROME,
    'google-chrome',
    'google-chrome-stable',
    'chromium-browser',
    'chromium',
    'chrome',
  ].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}

const chrome = resolveChrome();

// The longest one map may take, its retries included. The slowest boot measured
// on a 4-vCPU runner's share of CPU is depot at 36 s (#322); this is 2.5 times
// that. Past it the map fails on its own, named, instead of the job running into
// its 15-minute limit.
const PER_MAP_MS = 90000;

// Every Chrome profile the run makes lives in one directory under the OS temp
// dir. Each profile goes as soon as its Chrome has exited, and the directory
// when the run ends, pass or fail.
let runDirPath = null;
function runDir() {
  if (!runDirPath) runDirPath = mkdtempSync(join(tmpdir(), 'qm-boot-'));
  return runDirPath;
}
function removeDir(dir) {
  // Windows keeps a dead Chrome's files locked for a moment: retry, don't leak.
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* best effort */ }
}

let bootSeq = 0;
const liveChromes = new Set();

function startChrome(startUrl, opts) {
  bootSeq += 1;
  const run = { port: 9700 + bootSeq, profile: join(runDir(), 'profile-' + bootSeq) };
  run.child = spawn(chrome, chromeArgs(run.port, run.profile, startUrl, opts), {
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group on POSIX, so stopping it stops the GPU and
    // renderer processes with it.
    detached: process.platform !== 'win32',
  });
  liveChromes.add(run);
  return run;
}

function exited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

// The whole tree: on Windows a plain kill ends only the browser process.
function killTree(child) {
  if (exited(child)) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch (e) {
    try { child.kill('SIGKILL'); } catch (e2) { /* already gone */ }
  }
}

async function stopChrome(run) {
  killTree(run.child);
  if (!exited(run.child)) await Promise.race([new Promise((res) => run.child.once('exit', res)), sleep(5000)]);
  liveChromes.delete(run);
  removeDir(run.profile);
}

function cleanUp() {
  for (const run of liveChromes) killTree(run.child);
  liveChromes.clear();
  if (runDirPath) removeDir(runDirPath);
  runDirPath = null;
}
after(cleanUp);
process.on('exit', cleanUp);

// Which cases this process runs (SIM_BOOT_CORE, SIM_BOOT_SHARD).
const ONLY_CORE = process.env.SIM_BOOT_CORE || '';
if (ONLY_CORE && ONLY_CORE !== 'bf' && ONLY_CORE !== 'js') throw new Error('SIM_BOOT_CORE must be bf or js, not ' + ONLY_CORE);
const SHARD = (() => {
  const raw = process.env.SIM_BOOT_SHARD || '';
  if (!raw) return { k: 1, n: 1 };
  const m = raw.match(/^(\d+)\/(\d+)$/);
  if (!m || +m[1] < 1 || +m[1] > +m[2]) throw new Error('SIM_BOOT_SHARD must be k/n with 1 <= k <= n, not ' + raw);
  return { k: +m[1], n: +m[2] };
})();
function pickShard(cases, k, n) {
  return cases.filter((c, i) => i % n === k - 1);
}
function shardOf(cases) {
  return pickShard(cases, SHARD.k, SHARD.n);
}

// Average RGB of an 8-bit PNG. CI cannot depend on Pillow being on PATH.
export function pngRgbAverage(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('not png');
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = 0;
  const idats = [];
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (!width || !height) throw new Error('png missing IHDR');
  if (depth !== 8) throw new Error('png depth ' + depth);
  const bpp = color === 2 ? 3 : color === 6 ? 4 : color === 0 ? 1 : 0;
  if (!bpp) throw new Error('png color ' + color);
  const raw = inflateSync(Buffer.concat(idats));
  const stride = width * bpp;
  const rowBytes = stride + 1;
  if (raw.length < height * rowBytes) throw new Error('png short IDAT');
  const prev = Buffer.alloc(stride);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * rowBytes];
    const cur = raw.subarray(y * rowBytes + 1, y * rowBytes + 1 + stride);
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (filter !== 0) {
        throw new Error('png filter ' + filter);
      }
      out[i] = v;
    }
    out.copy(prev);
    for (let x = 0; x < width; x++) {
      const i = x * bpp;
      if (bpp === 1) sum += out[i] * 3;
      else sum += out[i] + out[i + 1] + out[i + 2];
      n += 1;
    }
  }
  return n ? sum / (n * 3) : 0;
}
const LOOK = {
  rig: 'rigWhoop', depot: 'depotStart', bando: 'bandoStart',
  city: 'whoopStreet', living: 'livingWhoop', garage: 'garageWhoop',
  warehouse: 'warehouseWhoop', gym: 'gymWhoop', office: 'officeWhoop',
  trainer: 'trainerWhoop', backyard: 'backyardWhoop', room: 'roomWhoop',
};
const MAP_IDS = ['city'].concat(MAPS.map((m) => m.id));
const CASES = MAP_IDS.map((map) => ({
  map, track: null, look: LOOK[map], q: 'med',
})).concat([
  { map: 'room', track: 'room-practice', look: 'roomWhoop', q: 'med' },
  { map: 'city', track: 'city-loop', look: 'whoopStreet', q: 'low' },
  { map: 'gym', track: null, look: 'gymWhoop', q: 'high' },
  { map: 'office', track: null, look: 'officeWhoop', q: 'low' },
]);
// ?core=js, deprecated: every map once.
const JS_CASES = [...new Set(MAP_IDS)].map((map) => ({
  map, track: null, look: LOOK[map], q: 'med', core: 'js',
}));
// The classes the default core has a plant for, and the quad the OSD names on
// each (sim.html BF_CLASSES): the 75 boots its own Betaflight core, the
// Fractal75.
const BF_QUAD = { whoop65: 'AIR65', whoop75: 'FRACTAL75' };
// The default core on classes sim-core has no plant for: the js core flies
// them, with JS CORE on the OSD. The class is the one the page restores. The
// gym case is also the reload that used to catch the gym's kit landing before
// its boot-time restyle (sim-art-gym.js inGymArt). The living case with the 75
// flies Betaflight.
const FALLBACK_CASES = [
  { map: 'living', track: null, look: 'livingWhoop', q: 'med', droneType: 'whoop75' },
  { map: 'living', track: null, look: 'livingWhoop', q: 'med', droneType: 'whoop85' },
  { map: 'gym', track: null, look: 'gymWhoop', q: 'med', droneType: 'freestyle5' },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mime(p) {
  const e = extname(p);
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  })[e] || 'application/octet-stream';
}

async function serveRoot() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404); res.end('missing'); return;
    }
    try {
      res.writeHead(200, { 'content-type': mime(file) });
      res.end(readFileSync(file));
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  return { server, port };
}

async function cdp(ws, method, params, ms) {
  if (ws.readyState !== 1) throw new Error('cdp socket closed before ' + method);
  const id = cdp._n = (cdp._n || 0) + 1;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(t);
      ws.removeEventListener('message', on);
      ws.removeEventListener('close', closed);
    };
    const t = setTimeout(() => { done(); reject(new Error('cdp timeout ' + method)); }, ms || 20000);
    // A Chrome stopped mid-call (the per-map limit) answers nothing: fail now.
    function closed() { done(); reject(new Error('cdp socket closed during ' + method)); }
    function on(msg) {
      try {
        const raw = typeof msg.data === 'string' ? msg.data : msg.data && msg.data.toString();
        const o = JSON.parse(raw);
        if (o.id === id) {
          done();
          if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error)));
          else resolve(o.result || {});
        }
      } catch (e) { /* ignore */ }
    }
    ws.addEventListener('message', on);
    ws.addEventListener('close', closed);
  });
}

// opts.gpu: a headed Chrome on this machine's own GPU (QM_BOOT_GPU=1, the
// tours only), not headless SwiftShader.
function chromeArgs(port, userData, startUrl, opts) {
  // Headed, a window under others is throttled to a few frames a second:
  // never, here.
  const gl = opts && opts.gpu ? ['--autoplay-policy=no-user-gesture-required', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] : [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ];
  return [
    ...gl,
    '--enable-webgl', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync',
    '--window-size=1400,800', `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`, startUrl,
  ];
}

async function waitForCdpPage(port, pred, tries) {
  const n = tries > 0 ? tries : 100;
  for (let i = 0; i < n; i++) {
    await sleep(200);
    try {
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const hit = pages.find(pred)
        || pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      if (hit && hit.webSocketDebuggerUrl) return hit;
    } catch (e) { /* Chrome is still coming up */ }
  }
  return null;
}

// The core a case should fly: bf by default on the 65 (the class a fresh
// profile starts on) and the 75, js for ?core=js and for a class with no
// sim-core plant.
function wantCoreOf(spec) {
  return spec.core === 'js' || (spec.droneType && !BF_QUAD[spec.droneType]) ? 'js' : 'bf';
}

// How a case is named in every failure: map, core, and what else sets it apart.
function labelOf(spec) {
  const extra = [spec.droneType, spec.track, 'q=' + spec.q].filter(Boolean).join(', ');
  return `${spec.map} (${wantCoreOf(spec)} core${spec.core === 'js' ? ' via ?core=js' : ''}, ${extra})`;
}

// boot: { label, step, over }. step says what the case is doing, for the
// error if it fails there; over is set once the per-map limit has passed.
async function bootPageOnce(base, spec, boot) {
  try {
    return await bootPageSteps(base, spec, boot);
  } catch (e) {
    throw new Error(`${boot.label}: ${e.message}, while ${boot.step}`, { cause: e });
  }
}

async function bootPageSteps(base, spec, boot) {
  // sim.html defaults currentMap to 'city' until fetchBuiltinTracks + applyQueryBoot.
  // A fixed sleep plus a reused CDP port / user-data-dir can read that default
  // (or a dying sibling Chrome) as "gym booted as city" when the full suite
  // saturates the machine. Isolate each boot and wait for the queried map.
  // First Chrome after apt-install often opens about:blank for several seconds
  // before the launch URL sticks — accept any page, then navigate.
  const trackQ = spec.track ? `&track=${spec.track}` : '';
  const coreQ = spec.core ? `&core=${spec.core}` : '';
  // Every map but The Rig is open with ?dev=1 only (sim-tracks.js mapOpen).
  const devQ = spec.map === 'rig' ? '' : '&dev=1';
  const url = `${base}/sim.html?map=${spec.map}${trackQ}&look=${spec.look}&quality=${spec.q}&menu=1&fpv=1${coreQ}${devQ}`;
  const wantCore = wantCoreOf(spec);
  if (boot.over) throw new Error('per-map limit already passed');
  boot.step = 'starting Chrome';
  const run = startChrome(url);
  boot.chromes.add(run);
  try {
    return await bootPageAttached(spec, boot, run, url, wantCore);
  } finally {
    await stopChrome(run);
    boot.chromes.delete(run);
  }
}

async function bootPageAttached(spec, boot, run, url, wantCore) {
  let stderr = '';
  run.child.stderr.on('data', (d) => { stderr += d.toString(); });
  const mapQ = 'map=' + spec.map;
  boot.step = 'waiting for Chrome\'s DevTools page';
  const page = await waitForCdpPage(run.port, (p) => (
    p.type === 'page' && p.webSocketDebuggerUrl && String(p.url || '').includes(mapQ)
  ), 100);
  if (!page) throw new Error('no CDP for ' + spec.map + '\n' + stderr.slice(-400));
  boot.step = 'attaching to the page';
  const wsUrl = page.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  const consoles = [];
  const warnings = [];
  ws.addEventListener('message', (msg) => {
    try {
      const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
      if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'error') {
        consoles.push((o.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
      if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'warning') {
        warnings.push((o.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
      if (o.method === 'Runtime.exceptionThrown') {
        const ex = o.params.exceptionDetails || {};
        consoles.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'exc');
      }
    } catch (e) { /* ignore */ }
  });
  try {
    boot.step = 'enabling DevTools on the page';
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    boot.step = 'loading sim.html';
    const here = await cdp(ws, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true });
    const href = here && here.result && here.result.value;
    if (!String(href || '').includes(mapQ)) {
      await cdp(ws, 'Page.navigate', { url });
      for (let i = 0; i < 40; i++) {
        await sleep(200);
        const again = await cdp(ws, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true });
        if (String((again && again.result && again.result.value) || '').includes(mapQ)) break;
      }
    }
    if (spec.droneType) {
      // The class the page restores at boot, then the boot again with it.
      boot.step = 'restoring class ' + spec.droneType + ' and reloading';
      await cdp(ws, 'Runtime.evaluate', {
        expression: `localStorage.setItem('ryflyDroneType', ${JSON.stringify(spec.droneType)}); true`,
      });
      warnings.length = 0;
      consoles.length = 0;
      await cdp(ws, 'Page.reload', { ignoreCache: false });
      await sleep(600);
    }
    let parsed = {};
    // The bf core loads after first paint (a dynamic import and two fetches),
    // so a bf boot also waits for it to fly.
    boot.step = 'waiting for the map, its look and its frame rate' + (wantCore === 'bf' ? ', and the bf core' : '');
    for (let i = 0; i < 80; i++) {
      const probe = await cdp(ws, 'Runtime.evaluate', {
        expression: `JSON.stringify((function(){
          var s=window._sim||{};
          var map = s.map ? s.map() : null;
          var vibe = s.vibe ? s.vibe() : null;
          var fps = s.looks && s.looks.fps;
          return {
            map: map,
            vibeId: vibe && vibe.id,
            ready: !!(fps && fps.ready),
            avg: fps && fps.avg,
            core: s.core ? s.core() : null
          };
        })())`,
        returnByValue: true,
      });
      const got = probe && probe.result && probe.result.value ? JSON.parse(probe.result.value) : {};
      if (got.map === spec.map && got.vibeId === spec.map && got.ready && (wantCore !== 'bf' || got.core === 'bf')) { parsed = got; break; }
      await sleep(250);
    }
    boot.step = 'closing the menu to fly';
    await cdp(ws, 'Runtime.evaluate', {
      expression: `(function(){
        ['startMenu','feelPrompt','menuLayer','legend','audioHint','toast','panel','firstFlight'].forEach(function(id){
          var el=document.getElementById(id); if(!el)return;
          el.classList.remove('open','show'); el.style.display='none';
        });
        document.body.classList.remove('menu-open');
        // menuOpen is a getter: setMenuOpen is what unpauses the sim.
        if(window._sim&&window._sim.looks&&window._sim.looks.setMenuOpen) window._sim.looks.setMenuOpen(false);
        // A fresh profile opens the first-run input prompt, which pauses the
        // sim (and the OSD read below) as the menu does.
        if(window._feel&&window._feel.hideFirstRun) window._feel.hideFirstRun();
        if(window._sim&&window._sim.setLookSpot){
          var look=new URLSearchParams(location.search).get('look');
          if(look)window._sim.setLookSpot(look);
        }
        return true;
      })()`,
    });
    await sleep(400);
    // The OSD is written by the first unpaused frame, which a heavy map under
    // swiftshader can take a while to draw.
    boot.step = 'waiting for the OSD of the first unpaused frame';
    for (let i = 0; i < 20; i++) {
      const osd = await cdp(ws, 'Runtime.evaluate', {
        expression: `(function(){var o=document.getElementById('osdTR');return o?o.innerText:''})()`,
        returnByValue: true,
      });
      if (osd && osd.result && osd.result.value) break;
      await sleep(150);
    }
    boot.step = 'reading the frame back';
    const info = await cdp(ws, 'Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        var s=window._sim||{};
        var map = s.map ? s.map() : null;
        var vibe = s.vibe ? s.vibe() : null;
        var artError = s.artError ? s.artError() : (window._artError||null);
        var avg = 0, n = 0, triangles = 0;
        try {
          if (s.renderer) {
            triangles = (s.renderer.info && s.renderer.info.render && s.renderer.info.render.triangles) || 0;
            var src = s.renderer.domElement;
            var c = document.createElement('canvas');
            c.width = 96; c.height = 54;
            var ctx = c.getContext('2d');
            ctx.drawImage(src, 0, 0, c.width, c.height);
            var pix = ctx.getImageData(0, 0, c.width, c.height).data;
            n = c.width * c.height;
            var sum = 0;
            for (var i=0;i<n;i++) sum += pix[i*4]+pix[i*4+1]+pix[i*4+2];
            avg = n ? sum/(n*3) : 0;
          }
        } catch (e) { return { evalError: String(e), map: map, vibe: vibe, artError: artError }; }
        var osd = document.getElementById('osdTR');
        var ratesJs = document.querySelector('#panel .rates-js'), ratesBf = document.querySelector('#panel .rates-bf');
        return { map: map, track: s.track ? s.track() : null, vibeId: vibe && vibe.id, artError: artError, avg: avg, n: n, triangles: triangles,
          core: s.core ? s.core() : null, osdTR: osd ? osd.innerText : null,
          ratesJs: ratesJs ? getComputedStyle(ratesJs).display : null, ratesBf: ratesBf ? getComputedStyle(ratesBf).display : null };
      })())`,
      returnByValue: true,
    });
    parsed = info && info.result && info.result.value ? JSON.parse(info.result.value) : parsed;
    boot.step = 'taking the screenshot';
    try {
      const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
      const pngBuf = Buffer.from(shot.data, 'base64');
      if (process.env.QM_BOOT_SHOTS) {
        mkdirSync(process.env.QM_BOOT_SHOTS, { recursive: true });
        const name = [spec.map, wantCore, spec.droneType, spec.track, spec.q].filter(Boolean).join('-');
        writeFileSync(join(process.env.QM_BOOT_SHOTS, name + '.png'), pngBuf);
      }
      parsed.shotAvg = pngRgbAverage(pngBuf);
    } catch (e) {
      parsed.shotError = e.message;
    }
    parsed.consoles = consoles;
    parsed.warnings = warnings;
    parsed.wantCore = wantCore;
    parsed.href = url;
    return parsed;
  } finally {
    try { ws.close(); } catch (e) { /* ignore */ }
  }
}

// One case inside PER_MAP_MS, retried when Chrome itself would not come up.
async function bootPage(base, spec) {
  const boot = { label: labelOf(spec), step: 'starting', over: false, chromes: new Set() };
  let timer = null;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      boot.over = true;
      reject(new Error(`${boot.label}: over the ${PER_MAP_MS / 1000} s per-map limit, while ${boot.step}`));
    }, PER_MAP_MS);
  });
  try {
    return await Promise.race([bootAttempts(base, spec, boot), limit]);
  } finally {
    clearTimeout(timer);
    // A case past its limit is still running: stop its Chrome so the next
    // case starts on a quiet machine.
    for (const run of boot.chromes) await stopChrome(run);
  }
}

async function bootAttempts(base, spec, boot) {
  let last = null;
  for (let attempt = 0; attempt < 3 && !boot.over; attempt++) {
    try {
      return await bootPageOnce(base, spec, boot);
    } catch (e) {
      last = e;
      const msg = String((e && e.cause && e.cause.message) || (e && e.message) || e);
      if (boot.over || !/no CDP|ws\b|cdp timeout Page/.test(msg)) throw e;
      await sleep(500);
    }
  }
  throw last;
}

test('pngRgbAverage reads an 8-bit RGB PNG without Pillow', () => {
  // 1x1 opaque red (#ff0000), filter 0. Generated with Node zlib + CRC32.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJGQobAAAAAElFTkSuQmCC',
    'base64',
  );
  assert.ok(Math.abs(pngRgbAverage(png) - 85) < 0.5, 'red (255,0,0) avg is 85');
});

test('shards split the cases: every case in exactly one shard, for any count', () => {
  for (const all of [CASES.concat(FALLBACK_CASES), JS_CASES]) {
    for (let n = 1; n <= 4; n++) {
      const seen = [];
      for (let k = 1; k <= n; k++) seen.push(...pickShard(all, k, n));
      assert.equal(seen.length, all.length, n + ' shards');
      assert.equal(new Set(seen).size, all.length, n + ' shards, no case twice');
    }
  }
});

test('a failure names the map and the core', () => {
  assert.equal(labelOf({ map: 'depot', q: 'med' }), 'depot (bf core, q=med)');
  assert.equal(labelOf({ map: 'depot', q: 'med', core: 'js' }), 'depot (js core via ?core=js, q=med)');
  assert.equal(labelOf({ map: 'gym', q: 'med', droneType: 'freestyle5' }), 'gym (js core, freestyle5, q=med)');
});

test('resolveSimBoot keeps every catalog map off City unless asked', () => {
  for (const map of MAP_IDS) {
    const boot = resolveSimBoot({ map }, null, []);
    assert.equal(boot.map, map, map);
    assert.equal(boot.track, freestyleIdFor(map));
    assert.equal(boot.unknownMap, undefined);
  }
  const room = resolveSimBoot({ track: 'room-practice' }, null, []);
  assert.equal(room.map, 'room');
  assert.equal(room.track, 'room-practice');
});

// Each case's time, for the CI job summary (one shard per job).
function reportTimes(title, times) {
  const total = times.reduce((t, [, s]) => t + s, 0);
  const lines = times.map(([label, s, ok]) => `| ${label} | ${s.toFixed(1)} | ${ok ? 'pass' : 'FAIL'} |`);
  console.log(`${title}: ${times.length} cases in ${total.toFixed(0)} s`);
  for (const [label, s, ok] of times) console.log(`  ${s.toFixed(1).padStart(6)} s  ${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    `### ${title}: ${times.length} cases, ${total.toFixed(0)} s`, '',
    '| Case | Seconds | Result |', '|---|---:|---|', ...lines, '', '',
  ].join('\n'));
}

// Boot every case on one server; one line per failure. A case that throws
// (a timeout, the per-map limit) is a failure like any other: the rest still run.
async function bootCases(title, cases) {
  const { server, port } = await serveRoot();
  const base = 'http://127.0.0.1:' + port;
  const failures = [];
  const times = [];
  try {
    // First Chrome after apt-install is slow and often lands on about:blank.
    // Warm the binary so the city case can attach CDP in time.
    const warm = startChrome('about:blank');
    try {
      await waitForCdpPage(warm.port, (p) => p.type === 'page' && p.webSocketDebuggerUrl, 80);
    } finally {
      await stopChrome(warm);
    }
    for (const spec of cases) {
      const t0 = Date.now();
      const before = failures.length;
      let got;
      try {
        got = await bootPage(base, spec);
      } catch (e) {
        failures.push(String(e && e.message || e));
        times.push([labelOf(spec), (Date.now() - t0) / 1000, false]);
        continue;
      }
      const name = labelOf(spec);
      const wantTrack = spec.track || freestyleIdFor(spec.map);
      const refs = (got.consoles || []).filter((s) => /ReferenceError|is not defined/i.test(s));
      const fatal = (got.consoles || []).filter((s) => /ReferenceError|TypeError|SyntaxError/i.test(s));
      if (got.evalError) failures.push(name + ': eval ' + got.evalError);
      if (got.map !== spec.map) failures.push(name + ': booted as ' + got.map);
      if (got.vibeId !== spec.map) failures.push(name + ': vibe ' + got.vibeId);
      if (got.artError) failures.push(name + ': artError ' + got.artError);
      if (fatal.length) failures.push(name + ': console ' + fatal[0]);
      if (refs.length) failures.push(name + ': missing import ' + refs[0]);
      if (!(got.shotAvg > 12)) failures.push(name + ': blank shotAvg=' + got.shotAvg);
      if (got.shotError) failures.push(name + ': shot ' + got.shotError);
      if (spec.track && String(got.track) !== String(wantTrack) && spec.track === 'room-practice') {
        if (String(got.track) !== 'room-practice') failures.push(name + ': booted track ' + got.track);
      }
      // The core that flies, and the OSD line that says so.
      const warns = got.warnings || [];
      if (got.core !== got.wantCore) failures.push(name + ': flies the ' + got.core + ' core, want ' + got.wantCore);
      const line = got.wantCore === 'bf' ? 'BF CORE · ' + BF_QUAD[spec.droneType || 'whoop65'] : 'JS CORE';
      if (!String(got.osdTR || '').includes(line)) failures.push(name + ': OSD has no ' + line + ': ' + JSON.stringify(got.osdTR));
      // Tune's rates drive the js core only: on bf they give way to the IMPORT CLI line.
      const ratesShown = got.ratesJs !== 'none' && got.ratesBf === 'none';
      const cliShown = got.ratesJs === 'none' && got.ratesBf !== 'none';
      if (got.wantCore === 'bf' ? !cliShown : !ratesShown) failures.push(name + ': Tune rates ' + got.ratesJs + ' / IMPORT CLI line ' + got.ratesBf + ' on the ' + got.wantCore + ' core');
      const failed = warns.find((s) => /did not load/.test(s));
      if (failed) failures.push(name + ': ' + failed);
      const deprecated = warns.some((s) => /\?core=js is deprecated, removed next release/.test(s));
      if (deprecated !== (spec.core === 'js')) failures.push(name + ':' + (deprecated ? ' warns ?core=js deprecated' : ' has no ?core=js deprecation note'));
      times.push([name, (Date.now() - t0) / 1000, failures.length === before]);
    }
    reportTimes(title, times);
    return failures;
  } finally {
    await new Promise((res) => server.close(res));
  }
}

// What a fresh profile (no saved choices) shows once the page has booted and
// its boot map is applied: the labels of the launch card's visible buttons,
// and the map behind them. opts.droneType: the class the profile restores
// (ryflyDroneType), set on the sim's origin before the sim's first load.
async function launchScreen(base, query, opts) {
  const url = `${base}/sim.html${query || ''}`;
  const droneType = opts && opts.droneType;
  const label = `launch screen (${query || 'no query'}${droneType ? ', ' + droneType : ''})`;
  let step = 'starting Chrome';
  const start = droneType ? `${base}/tracks/catalog.json` : url;
  const run = startChrome(start);
  let ws = null;
  try {
    step = 'waiting for Chrome\'s DevTools page';
    const page = await waitForCdpPage(run.port, (p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url || '').includes(droneType ? '/tracks/catalog.json' : '/sim.html'), 100);
    if (!page) throw new Error('no CDP for the launch screen');
    step = 'attaching to the page';
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    return await launchScreenSteps(ws, base, url, start, droneType, (s) => { step = s; });
  } catch (e) {
    throw new Error(`${label}: ${e.message}, while ${step}`, { cause: e });
  } finally {
    await stopChrome(run);
  }
}

async function launchScreenSteps(ws, base, url, start, droneType, at) {
  const href = async () => {
    try {
      const h = await cdp(ws, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true });
      return String(h && h.result && h.result.value || '');
    } catch (e) { return ''; }
  };
  try {
    at('loading the page');
    await cdp(ws, 'Runtime.enable');
    if (droneType) {
      // A plain page on the sim's origin first (Chrome may still be on
      // about:blank), the class there, then the sim.
      at('restoring class ' + droneType + ' on the sim\'s origin');
      if (!(await href()).startsWith(base)) await cdp(ws, 'Page.navigate', { url: start });
      for (let i = 0; i < 40 && !(await href()).startsWith(base); i++) await sleep(200);
      await cdp(ws, 'Runtime.evaluate', { expression: `localStorage.setItem('ryflyDroneType', ${JSON.stringify(droneType)}); true` });
      await cdp(ws, 'Page.navigate', { url });
      for (let i = 0; i < 40 && !(await href()).includes('/sim.html'); i++) await sleep(200);
    }
    at('loading sim.html');
    const here = await cdp(ws, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true });
    if (!String(here && here.result && here.result.value || '').includes('/sim.html')) await cdp(ws, 'Page.navigate', { url });
    at('waiting for the launch screen and its boot map');
    let out = null;
    let first = null;
    for (let i = 0; i < 80; i++) {
      const got = await cdp(ws, 'Runtime.evaluate', {
        expression: `JSON.stringify((function(){
          var s=window._sim||{};
          var first=s.map?s.map():null;
          if(!(s.map&&s.map()&&s.looks&&s.looks.fps&&s.looks.fps.ready))return {first:first};
          // Wait for the query boot so a ?map= has landed too.
          if(!window._simQueryBooted)return {first:first};
          var sparks=document.getElementById('menuSparks');
          return {
            first: first,
            sparks: !!(sparks&&sparks.getClientRects().length),
            map: s.map(),
            labels: Array.prototype.filter.call(document.querySelectorAll('#startMenu .menu-card button'),function(b){
              var cs=getComputedStyle(b);
              return b.getClientRects().length>0&&cs.visibility!=='hidden'&&cs.opacity!=='0';
            }).map(function(b){return b.textContent.trim();})
          };
        })())`,
        returnByValue: true,
      });
      out = got && got.result && got.result.value ? JSON.parse(got.result.value) : null;
      if (out && !first) first = out.first;
      if (out && out.map) break;
      out = null;
      await sleep(250);
    }
    // The first map the page reported, before the tracks loaded.
    return out && { ...out, first };
  } finally {
    try { ws.close(); } catch (e) { /* ignore */ }
  }
}

// Launch-screen checks run once: in the first default-core shard.
function runsLaunchScreen(t) {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return false; }
  if (ONLY_CORE === 'js' || SHARD.k !== 1) { t.skip('runs in the first default-core shard'); return false; }
  return true;
}

test('the launch screen shows exactly five buttons without ?dev: Fly, Daily, Boards, Tune, Controls; The Rig behind them from the first frame, and closed, unknown and spark links land there too', { timeout: 240000 }, async (t) => {
  if (!runsLaunchScreen(t)) return;
  const { server, port } = await serveRoot();
  try {
    const plain = await launchScreen('http://127.0.0.1:' + port, '');
    assert.deepEqual(plain && plain.labels, ['Fly', 'Daily', 'Boards', 'Tune', 'Controls']);
    assert.equal(plain && plain.map, 'rig', 'a fresh pilot launches into The Rig');
    assert.equal(plain && plain.first, 'rig', 'no City behind the launch card while the tracks load');
    assert.equal(plain && plain.sparks, false, 'every spark is on a closed map: no tally without ?dev=1');
    const closed = await launchScreen('http://127.0.0.1:' + port, '?map=garage&menu=1');
    assert.equal(closed && closed.map, 'rig', 'garage without ?dev=1 lands on The Rig');
    const unknown = await launchScreen('http://127.0.0.1:' + port, '?map=narnia');
    assert.equal(unknown && unknown.map, 'rig', 'an unknown ?map= lands on The Rig');
    const spark = await launchScreen('http://127.0.0.1:' + port, '?spark=garage:0');
    assert.equal(spark && spark.map, 'rig', 'a spark link to a closed map stays on The Rig');
  } finally {
    await new Promise((res) => server.close(res));
  }
});

test('with nothing saved the launch screen is the class\'s map: a 75 launches into The Warehouse from the first frame, a 65 still into The Rig', { timeout: 240000 }, async (t) => {
  if (!runsLaunchScreen(t)) return;
  const { server, port } = await serveRoot();
  try {
    const w75 = await launchScreen('http://127.0.0.1:' + port, '', { droneType: 'whoop75' });
    assert.deepEqual(w75 && w75.labels, ['Fly', 'Daily', 'Boards', 'Tune', 'Controls']);
    assert.equal(w75 && w75.map, 'depot', 'a fresh 75 launches into The Warehouse');
    assert.equal(w75 && w75.first, 'depot', 'no other map behind the launch card while the tracks load');
    const w65 = await launchScreen('http://127.0.0.1:' + port, '', { droneType: 'whoop65' });
    assert.equal(w65 && w65.map, 'rig', 'a fresh 65 still launches into The Rig');
    assert.equal(w65 && w65.first, 'rig');
  } finally {
    await new Promise((res) => server.close(res));
  }
});

const BF_RUN = shardOf(CASES.concat(FALLBACK_CASES));
const JS_RUN = shardOf(JS_CASES);
// A boot test's limit is its cases' per-map limits, plus a minute for the
// server and the warm-up Chrome; the per-map limit fires first.
const limitFor = (cases) => cases.length * PER_MAP_MS + 60000;
function runsBoots(t, core, cases) {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return false; }
  if (ONLY_CORE && ONLY_CORE !== core) { t.skip('SIM_BOOT_CORE=' + ONLY_CORE); return false; }
  if (!cases.length) { t.skip('no cases in shard ' + SHARD.k + '/' + SHARD.n); return false; }
  return true;
}

test('headless Chrome boots every map on the default core (Betaflight) without errors or a blank FPV; classes with no plant fly JS CORE', { timeout: limitFor(BF_RUN) }, async (t) => {
  if (!runsBoots(t, 'bf', BF_RUN)) return;
  assert.equal((await bootCases(`Default core, shard ${SHARD.k}/${SHARD.n}`, BF_RUN)).join('\n'), '');
});

test('headless Chrome boots every map on ?core=js (deprecated) without errors or a blank FPV', { timeout: limitFor(JS_RUN) }, async (t) => {
  if (!runsBoots(t, 'js', JS_RUN)) return;
  assert.equal((await bootCases(`?core=js, shard ${SHARD.k}/${SHARD.n}`, JS_RUN)).join('\n'), '');
});

// ---------- Fly every map: a pilot's tour, every quality, both cores ----------
// The boot cases above check a map's first picture through a ?look= spot with
// the menus forced shut. A pilot does neither: they boot (or pick a map from
// Tracks), the camera goes to the quad on its pad, and they arm with the
// radio. A tour is one fresh profile per core and quality with a TX16S on
// the Easy-mode arm: booted on one map with ?map=, then every other map
// through the real menu (MENU, Tracks, the map's tab, Freestyle). On each map:
//   - no page exception, console TypeError/ReferenceError/SyntaxError, "did
//     not load" warning or art error since the map was picked (for the boot
//     map: since the page loaded);
//   - the look: the quality applied, the post chain on at med and high, the
//     HDRI's light on the scene (not the City's own sky), a picture that is
//     not blank;
//   - the camera on the quad, the quad on the map's pad, no chase cam;
//   - throttle down 1.2 s (the sim's clock) then up: Betaflight (or the js
//     core) armed, and the quad climbs; an arm refused or dropped before
//     the climb is tried again, as a pilot would, up to three tries, and
//     each is reported (#336, slow devices).
// What CI cannot see: GitHub's runners have no GPU, and on software WebGL the
// look turns MSAA off (sim-looks.js presetOf), so #337's e51c907 (the post
// chain's targets built at 0 samples, then set to 2 or 4: every
// composer.render() threw at med and high on a real GPU) passes the tours in
// CI. QM_BOOT_GPU=1 runs them headed on this machine's GPU, where e51c907
// fails at med and high on both cores. The shim below gives SwiftShader
// KHR_parallel_shader_compile (every program reported linked), so the look's
// parallel-compile path at least runs in CI.
const TOUR_GPU = process.env.QM_BOOT_GPU === '1';
const TOUR_QUALITIES = ['low', 'med', 'high'];
const TOUR_MAPS = [...new Set(MAP_IDS)];
const TOURS = ['bf', 'js'].flatMap((core) => TOUR_QUALITIES.map((q, i) => ({
  core, q,
  // Each tour boots a different map with ?map=, so both ways in are covered.
  first: TOUR_MAPS[(i * 5 + (core === 'js' ? 2 : 0)) % TOUR_MAPS.length],
})));
// One map of a tour: the pick, its art and look (TOUR_STEP), then the arm and
// climb (TOUR_FLY). Each in-page step's own waits add up to less than its
// limit, so a step never outlives the CDP call that awaits it.
const TOUR_STEP_MS = 75000;
const TOUR_FLY_MS = 70000;
// A CI job is cut at 15 minutes (.github/workflows/sim-tests.yml), whatever a
// test's own timeout says, and its setup (checkout, Node, Chrome) runs before
// this process starts. On CI a tour starts a map only while that map's worst
// case (its two steps and the screenshot) still ends by TOUR_JOB_BUDGET_MS
// after this process started, and names the maps it did not fly.
const TOUR_JOB_BUDGET_MS = 12 * 60000;
const TOUR_MAP_WORST_MS = TOUR_STEP_MS + TOUR_FLY_MS + 20000;
const tourDeadline = () => (process.env.GITHUB_ACTIONS ? TOUR_JOB_BUDGET_MS - process.uptime() * 1000 + Date.now() - TOUR_MAP_WORST_MS : Infinity);

const PARALLEL_COMPILE_SHIM = String.raw`(() => {
  const EXT = 'KHR_parallel_shader_compile', DONE = 0x91B1;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const getExt = C.prototype.getExtension, getSupported = C.prototype.getSupportedExtensions, getParam = C.prototype.getProgramParameter;
    const shimmed = new WeakSet();
    C.prototype.getExtension = function (name) {
      const real = getExt.call(this, name);
      if (name !== EXT || real) return real;
      shimmed.add(this);
      return { COMPLETION_STATUS_KHR: DONE };
    };
    C.prototype.getSupportedExtensions = function () {
      const list = getSupported.call(this) || [];
      return list.includes(EXT) ? list : list.concat([EXT]);
    };
    C.prototype.getProgramParameter = function (program, pname) {
      if (pname === DONE && shimmed.has(this)) return true;
      return getParam.call(this, program, pname);
    };
  }
  window.__parallelShim = true;
})()`;

// A TX16S as Chrome reports it (tools/test_sim_first_flight.mjs): roll, pitch,
// throttle (axis 2, -1 at the bottom), yaw, AUX1..AUX4 off. The page's own
// switches are not set up, so this is Easy mode: throttle down 1 s, then up.
const TOUR_TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const TOUR_PAD = String.raw`(() => {
  const pads = window.__pads = { axes: [0, 0, -1, 0, -1, -1, -1, -1] };
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() {
    return [{ id: ${JSON.stringify(TOUR_TX)}, index: 0, mapping: '', connected: true, timestamp: performance.now(),
      axes: pads.axes.slice(), buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) }, null, null, null];
  } });
})()`;

// Shared by both in-page steps: each claims window.__tourGen, and its waits
// stop as soon as a newer step has claimed it (a step whose CDP call timed out
// must not keep driving the throttle on the next map).
const TOUR_HELPERS = String.raw`
  const s = window._sim;
  const gen = window.__tourGen = (window.__tourGen || 0) + 1;
  const live = () => window.__tourGen === gen;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (live() && performance.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* not yet */ } await wait(25); }
    try { return live() && !!fn(); } catch (e) { return false; }
  };`;

// One map of a tour, in the page: picked through the menu unless it is the
// one the page booted on, then checked. Returns what it saw. Its waits: 3 x 4 s
// of menu, 40 s to fly, 12 s for the HDRI, 0.7 s, 8 s for a frame drawn:
// under TOUR_STEP_MS.
const TOUR_STEP = String.raw`async (map, picked, wantCore) => {${TOUR_HELPERS}
  const shown = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const out = { map, steps: [] };
  const step = (m) => out.steps.push(m);
  if (picked) {
    window._artError = null;
    // The pilot's way: MENU, Tracks, the map's tab, its Freestyle row.
    if (!shown(document.getElementById('menuTracks'))) document.getElementById('menuBtn').click();
    if (!(await until(() => shown(document.getElementById('menuTracks')), 4000))) { out.error = 'MENU did not open the menu'; return out; }
    document.getElementById('menuTracks').click();
    const tab = () => document.querySelector('.track-maps [data-map="' + map + '"]');
    if (!(await until(() => tab(), 4000))) { out.error = 'Tracks has no ' + map + ' tab'; return out; }
    tab().click();
    const fid = s.freestyleIdFor(map);
    const row = () => [...document.querySelectorAll('.track-list [data-tid]')].find((b) => b.dataset.tid === fid || b.dataset.tid === 'freestyle');
    if (!(await until(() => row(), 4000))) { out.error = 'no Freestyle row on ' + map; return out; }
    row().click();
    step('picked');
  } else if (shown(document.getElementById('menuFly'))) {
    // A launch card over the boot map: Fly, as a pilot would.
    document.getElementById('menuFly').click();
    step('fly');
  }
  const arrived = () => s.map() === map && s.vibe() && s.vibe().id === map && s.looks && s.looks.fps.ready
    && window._simQueryBooted && s.core() === wantCore && !document.body.classList.contains('menu-open')
    && !(s.looks.menuOpen);
  if (!(await until(arrived, 40000))) {
    if (document.visibilityState === 'hidden') { out.error = 'the page is hidden (a minimized or covered headed window draws no frames): not a sim failure'; return out; }
    out.error = 'never flying on ' + map + ': ' + JSON.stringify({ map: s.map(), vibe: s.vibe() && s.vibe().id, ready: s.looks && s.looks.fps.ready,
      core: s.core(), menu: document.body.classList.contains('menu-open'), lookMenu: s.looks && s.looks.menuOpen,
      shown: document.visibilityState, frames: s.renderer && s.renderer.info.render.frame, fps: s.looks && Math.round(s.looks.fps.avg), applied: s.looks && s.looks.applied });
    return out;
  }
  if (window._feel && window._feel.promptOpen && window._feel.hideFirstRun) window._feel.hideFirstRun();
  // A map's own HDRI (the Backyard's yard sky) may still be on its way: its
  // light, not the fog-colour stand-in. The City lights itself.
  await until(() => map === 'city' || !!s.scene.environment, 12000);
  await wait(700);
  // The camera follows the quad only in the render loop (updateCamera), and
  // the pick moved the quad synchronously, between frames. Under SwiftShader
  // a frame on a new map can take longer than the 700 ms above, so until the
  // loop has drawn once the camera (and the screenshot) are still the last
  // map's. Two of this step's own animation frames: the loop's callback was
  // queued a frame earlier than ours, so it has run at least once after them.
  let rafs = 0;
  const rafTick = () => { rafs++; if (rafs < 2 && live()) requestAnimationFrame(rafTick); };
  requestAnimationFrame(rafTick);
  if (!(await until(() => rafs >= 2, 8000))) { out.error = 'no frame drawn in 8 s after arriving on ' + map; return out; }
  // The screenshot (taken next, outside the page) waits on this too.
  out.drawn = true;
  // The look, as it is now; the picture is the screenshot taken next.
  const L = s.looks;
  out.look = { applied: L.applied, composer: !!L.composer, env: !!s.scene.environment, sky: L.skyMode || null };
  out.artError = s.artError();
  // Where everything is, before the arm.
  out.at = s.flyCheck();
  return out;
}`;

// Then the arm and the climb, on the sim's clock (Easy mode's hold counts the
// input polls' time, which SwiftShader runs slower than the wall's). Its
// waits: 0.3 s, then per try 8 s down, 4 s to arm, 6 s of climb, 0.5 s:
// under TOUR_FLY_MS.
const TOUR_FLY = String.raw`async () => {${TOUR_HELPERS}
  const thr = (v) => { if (live()) window.__pads.axes[2] = v; };
  const out = { tries: [] };
  if (s.flyCheck().armed) { s.flyDisarm(); await wait(300); }
  const why = (stage) => {
    const cs = s.coreState ? s.coreState() : {};
    const t = document.getElementById('toast');
    return { stage, flags: cs.armingDisableFlags, fcArmed: s.flyCheck().fcArmed, flightMs: cs.flightMs, easy: s.easy().arm,
      toast: t ? t.innerText : null, paused: document.body.classList.contains('menu-open') || !!(s.looks && s.looks.menuOpen) };
  };
  // Throttle down until Easy mode has seen it there 1.2 s, then up past half:
  // the core's own arm (Betaflight's, on bf), and a climb. A pilot whose arm
  // was refused, or dropped before the quad left the pad, does it again: up
  // to three tries, each failed one reported. On a slow device (SwiftShader)
  // Betaflight can refuse an arm, or arm and drop it, with THROTTLE: the
  // arm's throttle hold runs out before its sample lands (#336).
  for (let i = 0; i < 3 && !out.flew && live(); i++) {
    thr(-1);
    out.held = await until(() => (+(s.easy().arm || {}).lowS || 0) >= 1.2, 8000);
    if (!out.held) { out.heldWhy = why('hold'); break; }
    thr(0.3);
    out.armed = await until(() => s.flyCheck().fcArmed, 4000);
    if (out.armed) {
      const y0 = s.flyCheck().quad.y;
      await until(() => s.flyCheck().quad.y - y0 > 0.5 || !s.flyCheck().fcArmed, 6000);
      out.climb = s.flyCheck().quad.y - y0;
      out.flew = out.climb > 0.3;
      if (!out.flew) out.tries.push(Object.assign(why(s.flyCheck().fcArmed ? 'armed, no climb' : 'armed, then dropped'), { climb: out.climb }));
    } else {
      out.tries.push(why('refused'));
    }
    thr(-1);
    if (live()) s.flyDisarm();
    await wait(500);
  }
  return out;
}`;

function tourLabel(tour) {
  return `tour ${tour.core} core, q=${tour.q}${TOUR_GPU ? ', real GPU' : ''}`;
}

// The checks on one map's step: one line per failure. errors: the page's
// exceptions and console errors and warnings since the map was picked, read
// as the boot cases read them: a Type/Reference/SyntaxError in an exception
// or console.error, a "did not load" warning.
function tourFailures(tour, got, errors) {
  const name = `${tourLabel(tour)}: ${got.map}`;
  const f = [];
  const fatal = errors.filter((e) => e.kind !== 'warning' && /TypeError|ReferenceError|SyntaxError/.test(e.text));
  if (fatal.length) f.push(`${name}: page ${fatal[0].kind} ${fatal[0].text.slice(0, 300)}`);
  const unloaded = errors.find((e) => e.kind === 'warning' && /did not load/.test(e.text));
  if (unloaded) f.push(`${name}: ${unloaded.text.slice(0, 200)}`);
  if (got.error) { f.push(`${name}: ${got.error}`); return f; }
  if (got.artError) f.push(`${name}: art error ${String(got.artError).slice(0, 300)}`);
  const L = got.look || {};
  if (L.applied !== tour.q) f.push(`${name}: look applied ${L.applied}, want ${tour.q}`);
  if (L.composer !== (tour.q !== 'low')) f.push(`${name}: post chain ${L.composer ? 'on' : 'off'} at ${tour.q}`);
  if (got.map !== 'city' && !L.env) f.push(`${name}: no HDRI light on the scene`);
  if (!(got.avg > 12)) f.push(`${name}: blank picture (avg ${got.avg}${got.avgError ? ', ' + got.avgError : ''})`);
  const at = got.at || {};
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  if (at.quad && at.pad) {
    const off = Math.hypot(at.quad.x - at.pad.x, at.quad.z - at.pad.z);
    if (off > 1 || Math.abs(at.quad.y - at.pad.y) > 1.5) f.push(`${name}: quad ${JSON.stringify(at.quad)} is not on the pad ${JSON.stringify(at.pad)}`);
  } else f.push(`${name}: no position`);
  if (at.chase) f.push(`${name}: chase cam, not FPV`);
  if (at.cam && at.quad && d(at.cam, at.quad) > 0.6) f.push(`${name}: camera ${JSON.stringify(at.cam)} is not on the quad ${JSON.stringify(at.quad)}`);
  if (got.flyError) f.push(`${name}: flying: ${got.flyError}`);
  else if (!got.held) f.push(`${name}: the throttle never counted as down (Easy mode's hold): ${JSON.stringify(got.heldWhy)}`);
  else if (!got.flew) f.push(`${name}: no arm and climb in three tries (throttle down 1.2 s, then up): ${JSON.stringify(got.tries)}`);
  return f;
}

// One page-side step through CDP: its value, or { error } (the step threw, or
// ran past its limit).
async function tourEval(ws, expression, ms) {
  try {
    const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms);
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails.exception;
      return { error: 'threw ' + ((ex && (ex.description || ex.value)) || r.exceptionDetails.text) };
    }
    return (r.result && r.result.value) || { error: 'no value' };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

async function runTour(base, tour, deadline) {
  const failures = [];
  const times = [];
  const label = tourLabel(tour);
  const coreQ = tour.core === 'js' ? '&core=js' : '';
  const url = `${base}/sim.html?map=${tour.first}&quality=${tour.q}&dev=1${coreQ}`;
  const run = startChrome('about:blank', { gpu: TOUR_GPU });
  // A whole tour is minutes of Chrome: keep its pipes drained.
  run.child.stdout.resume();
  run.child.stderr.resume();
  let ws = null;
  let step = 'starting Chrome';
  const errors = [];
  try {
    step = 'waiting for Chrome\'s DevTools page';
    const page = await waitForCdpPage(run.port, (p) => p.type === 'page' && p.webSocketDebuggerUrl, 100);
    if (!page) throw new Error('no CDP');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    ws.addEventListener('message', (msg) => {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        if (o.method === 'Runtime.exceptionThrown') {
          const ex = o.params.exceptionDetails || {};
          errors.push({ kind: 'exception', text: String((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'exception') });
        } else if (o.method === 'Runtime.consoleAPICalled' && (o.params.type === 'error' || o.params.type === 'warning')) {
          errors.push({ kind: o.params.type, text: (o.params.args || []).map((a) => a.value || a.description || '').join(' ') });
        }
      } catch (e) { /* ignore */ }
    });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    if (!TOUR_GPU) await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: PARALLEL_COMPILE_SHIM });
    if (TOUR_GPU) {
      // Headed: a minimized or covered window's page is hidden and draws no
      // frames at all (document.visibilityState 'hidden'): to the front, normal.
      try {
        await cdp(ws, 'Page.bringToFront');
        const { windowId } = await cdp(ws, 'Browser.getWindowForTarget');
        await cdp(ws, 'Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      } catch (e) { /* best effort; a hidden page is named below */ }
    }
    await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: TOUR_PAD });
    step = 'loading ' + url;
    await cdp(ws, 'Page.navigate', { url });
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      try {
        const r = await cdp(ws, 'Runtime.evaluate', { expression: '!!(window._sim && window._sim.flyCheck && window._sim.freestyleIdFor)', returnByValue: true });
        if (r.result && r.result.value) break;
      } catch (e) { /* loading */ }
    }
    const order = [tour.first].concat(TOUR_MAPS.filter((m) => m !== tour.first));
    let stuck = 0;
    for (let i = 0; i < order.length; i++) {
      const map = order[i];
      if (Date.now() > deadline) {
        failures.push(`${label}: out of the CI job's time before flying ${order.slice(i).join(', ')}`);
        break;
      }
      const t0 = Date.now();
      step = 'flying ' + map;
      // The boot map's errors count from the page's load.
      if (i > 0) errors.length = 0;
      const got = await tourEval(ws, `(${TOUR_STEP})(${JSON.stringify(map)}, ${i > 0}, ${JSON.stringify(tour.core)})`, TOUR_STEP_MS);
      got.map = map;
      // The screenshot, and the fly after it, only once the loop has drawn
      // this map (got.drawn, TOUR_STEP): before that the page still shows the
      // last map's picture, from the last map's camera.
      if (!got.error && !got.drawn) got.error = 'the step returned before a frame was drawn on ' + map;
      if (!got.error && ws.readyState === 1) {
        try {
          const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png' });
          const png = Buffer.from(shot.data, 'base64');
          got.avg = pngRgbAverage(png);
          if (process.env.QM_BOOT_SHOTS) {
            mkdirSync(process.env.QM_BOOT_SHOTS, { recursive: true });
            writeFileSync(join(process.env.QM_BOOT_SHOTS, `tour-${tour.core}-${tour.q}-${map}.png`), png);
          }
        } catch (e) { got.avgError = String(e && e.message || e); }
        const fly = await tourEval(ws, `(${TOUR_FLY})()`, TOUR_FLY_MS);
        if (fly.error) got.flyError = fly.error;
        else Object.assign(got, fly);
      }
      const f = tourFailures(tour, got, errors.slice());
      if (got.flew && got.tries && got.tries.length) console.log(`${label}: ${map}: flew on try ${got.tries.length + 1}; before that: ${JSON.stringify(got.tries)}`);
      if (process.env.QM_TOUR_LOG) console.log(JSON.stringify({ tour: label, ...got }));
      failures.push(...f);
      const secs = (Date.now() - t0) / 1000;
      times.push([`${label}: ${map}`, secs, !f.length]);
      // As it goes, so a job cut short still names what it flew.
      console.log(`  ${secs.toFixed(1).padStart(6)} s  ${f.length ? 'FAIL' : 'pass'}  ${label}: ${map} (as flown)`);
      // A page that never flies again (e51c907 threw on every frame): four
      // such maps are enough.
      if (got.error && /never flying|did not open|timeout/.test(got.error)) stuck++;
      if (stuck >= 4) {
        failures.push(`${label}: stopped after ${map}: ${order.slice(i + 1).join(', ')} not flown`);
        break;
      }
    }
  } catch (e) {
    failures.push(`${label}: ${e.message}, while ${step}`);
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    await stopChrome(run);
  }
  reportTimes(label, times);
  return failures;
}

// The bf tours one to a default-core shard (3 shards in CI). The js tours on
// the ?core=js shards from the last: with 2 shards, shard 2 (the 6 boot cases)
// takes two tours and shard 1 (7) one.
function tourShardOf(tours, core, k, n) {
  return core === 'js' ? pickShard(tours, n - k + 1, n) : pickShard(tours, k, n);
}
const BF_TOURS = tourShardOf(TOURS.filter((t) => t.core === 'bf'), 'bf', SHARD.k, SHARD.n);
const JS_TOURS = tourShardOf(TOURS.filter((t) => t.core === 'js'), 'js', SHARD.k, SHARD.n);
const tourLimit = (tours) => tours.length * (TOUR_MAPS.length * (TOUR_STEP_MS + TOUR_FLY_MS + 10000) + 60000) + 60000;

test('the tours cover every map at every quality on both cores, each map booted with ?map= by some tour', () => {
  assert.equal(TOURS.length, 6);
  for (const core of ['bf', 'js']) {
    const all = TOURS.filter((t) => t.core === core);
    assert.deepEqual(all.map((t) => t.q), TOUR_QUALITIES);
    for (let n = 1; n <= 3; n++) {
      const seen = [];
      for (let k = 1; k <= n; k++) seen.push(...tourShardOf(all, core, k, n));
      assert.equal(seen.length, all.length, `${core}, ${n} shards`);
      assert.equal(new Set(seen).size, all.length, `${core}, ${n} shards, no tour twice`);
    }
  }
  assert.deepEqual(tourShardOf(TOURS.filter((t) => t.core === 'js'), 'js', 1, 2).map((t) => t.q), ['med'], 'js shard 1 of 2 (7 boot cases): one tour');
  assert.equal(new Set(TOURS.map((t) => t.first)).size, TOURS.length, 'six different boot maps');
});

for (const [core, tours] of [['bf', BF_TOURS], ['js', JS_TOURS]]) {
  test(`a pilot flies every map on the ${core} core at ${tours.map((t) => t.q).join(', ') || 'no quality in this shard'}: the look on, the camera at the pad, the TX16S arms, the quad climbs`, { timeout: tourLimit(tours) }, async (t) => {
    if (!runsBoots(t, core, tours)) return;
    const { server, port } = await serveRoot();
    const deadline = tourDeadline();
    try {
      const failures = [];
      for (const tour of tours) failures.push(...await runTour('http://127.0.0.1:' + port, tour, deadline));
      assert.equal(failures.join('\n'), '');
    } finally {
      await new Promise((res) => server.close(res));
    }
  });
}
