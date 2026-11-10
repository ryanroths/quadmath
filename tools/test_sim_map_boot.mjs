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

function startChrome(startUrl) {
  bootSeq += 1;
  const run = { port: 9700 + bootSeq, profile: join(runDir(), 'profile-' + bootSeq) };
  run.child = spawn(chrome, chromeArgs(run.port, run.profile, startUrl), {
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

async function cdp(ws, method, params) {
  if (ws.readyState !== 1) throw new Error('cdp socket closed before ' + method);
  const id = cdp._n = (cdp._n || 0) + 1;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(t);
      ws.removeEventListener('message', on);
      ws.removeEventListener('close', closed);
    };
    const t = setTimeout(() => { done(); reject(new Error('cdp timeout ' + method)); }, 20000);
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

function chromeArgs(port, userData, startUrl) {
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
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
