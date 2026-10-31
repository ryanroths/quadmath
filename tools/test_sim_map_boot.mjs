// Headless boot of every map: no console exceptions, correct resolveSimBoot,
// non-blank FPV, on both flight cores: the default (Betaflight in sim-core,
// which must actually load) and ?core=js. Requires Chrome + a local sim.html
// server (starts one).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
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
  rig: 'rigWhoop',
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
// The default core on classes sim-core has no plant for: the js core flies
// them, with JS CORE on the OSD. The class is the one the page restores. The
// gym case is also the reload that used to catch the gym's kit landing before
// its boot-time restyle (sim-art-gym.js inGymArt).
const FALLBACK_CASES = [
  { map: 'living', track: null, look: 'livingWhoop', q: 'med', droneType: 'whoop75' },
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
  const id = cdp._n = (cdp._n || 0) + 1;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 20000);
    function on(msg) {
      try {
        const raw = typeof msg.data === 'string' ? msg.data : msg.data && msg.data.toString();
        const o = JSON.parse(raw);
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

let bootSeq = 0;

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

async function bootPageOnce(base, spec) {
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
  // The core the page should fly: bf by default on the 65 (the class a fresh
  // profile starts on), js for ?core=js and for a class with no sim-core plant.
  const wantCore = spec.core === 'js' || spec.droneType ? 'js' : 'bf';
  bootSeq += 1;
  const port = 9700 + bootSeq;
  const userData = `/tmp/qm-boot-${process.pid}-${bootSeq}-${Date.now()}`;
  const child = spawn(chrome, chromeArgs(port, userData, url), { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const mapQ = 'map=' + spec.map;
  const page = await waitForCdpPage(port, (p) => (
    p.type === 'page' && p.webSocketDebuggerUrl && String(p.url || '').includes(mapQ)
  ), 100);
  if (!page) {
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    throw new Error('no CDP for ' + spec.map + '\n' + stderr.slice(-400));
  }
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
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
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
    await cdp(ws, 'Runtime.evaluate', {
      expression: `(function(){
        ['startMenu','feelPrompt','menuLayer','legend','audioHint','toast','panel'].forEach(function(id){
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
    for (let i = 0; i < 20; i++) {
      const osd = await cdp(ws, 'Runtime.evaluate', {
        expression: `(function(){var o=document.getElementById('osdTR');return o?o.innerText:''})()`,
        returnByValue: true,
      });
      if (osd && osd.result && osd.result.value) break;
      await sleep(150);
    }
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
    try {
      const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
      const pngBuf = Buffer.from(shot.data, 'base64');
      const dir = mkdtempSync(join(tmpdir(), 'qm-boot-'));
      const png = join(dir, spec.map + '.png');
      writeFileSync(png, pngBuf);
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
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    await Promise.race([
      new Promise((res) => child.once('exit', res)),
      sleep(2000),
    ]);
  }
}

async function bootPage(base, spec) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await bootPageOnce(base, spec);
    } catch (e) {
      last = e;
      const msg = String(e && e.message || e);
      if (!/no CDP|ws\b|cdp timeout Page/.test(msg)) throw e;
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

// Boot every case on one server; one line per failure.
async function bootCases(cases) {
  const { server, port } = await serveRoot();
  const base = 'http://127.0.0.1:' + port;
  try {
    // First Chrome after apt-install is slow and often lands on about:blank.
    // Warm the binary so the city case can attach CDP in time.
    bootSeq += 1;
    const warmPort = 9700 + bootSeq;
    const warmDir = `/tmp/qm-boot-warm-${process.pid}-${Date.now()}`;
    const warm = spawn(chrome, chromeArgs(warmPort, warmDir, 'about:blank'), { stdio: ['ignore', 'pipe', 'pipe'] });
    await waitForCdpPage(warmPort, (p) => p.type === 'page' && p.webSocketDebuggerUrl, 80);
    try { warm.kill('SIGKILL'); } catch (e) { /* ignore */ }
    await Promise.race([new Promise((res) => warm.once('exit', res)), sleep(2000)]);
    const failures = [];
    for (const spec of cases) {
      const got = await bootPage(base, spec);
      const name = spec.map + (spec.core ? ' core=' + spec.core : '') + (spec.droneType ? ' ' + spec.droneType : '');
      const wantTrack = spec.track || freestyleIdFor(spec.map);
      const refs = (got.consoles || []).filter((s) => /ReferenceError|is not defined/i.test(s));
      const fatal = (got.consoles || []).filter((s) => /ReferenceError|TypeError|SyntaxError/i.test(s));
      if (got.evalError) failures.push(name + ' eval ' + got.evalError);
      if (got.map !== spec.map) failures.push(name + ' booted as ' + got.map);
      if (got.vibeId !== spec.map) failures.push(name + ' vibe ' + got.vibeId);
      if (got.artError) failures.push(name + ' artError ' + got.artError);
      if (fatal.length) failures.push(name + ' console ' + fatal[0]);
      if (refs.length) failures.push(name + ' missing import ' + refs[0]);
      if (!(got.shotAvg > 12)) failures.push(name + ' blank shotAvg=' + got.shotAvg);
      if (got.shotError) failures.push(name + ' shot ' + got.shotError);
      if (spec.track && String(got.track) !== String(wantTrack) && spec.track === 'room-practice') {
        if (String(got.track) !== 'room-practice') failures.push('room-practice booted ' + got.track);
      }
      // The core that flies, and the OSD line that says so.
      const warns = got.warnings || [];
      if (got.core !== got.wantCore) failures.push(name + ' flies the ' + got.core + ' core, want ' + got.wantCore);
      const line = got.wantCore === 'bf' ? 'BF CORE' : 'JS CORE';
      if (!String(got.osdTR || '').includes(line)) failures.push(name + ' OSD has no ' + line + ': ' + JSON.stringify(got.osdTR));
      // Tune's rates drive the js core only: on bf they give way to the IMPORT CLI line.
      const ratesShown = got.ratesJs !== 'none' && got.ratesBf === 'none';
      const cliShown = got.ratesJs === 'none' && got.ratesBf !== 'none';
      if (got.wantCore === 'bf' ? !cliShown : !ratesShown) failures.push(name + ' Tune rates ' + got.ratesJs + ' / IMPORT CLI line ' + got.ratesBf + ' on the ' + got.wantCore + ' core');
      const failed = warns.find((s) => /did not load/.test(s));
      if (failed) failures.push(name + ' ' + failed);
      const deprecated = warns.some((s) => /\?core=js is deprecated, removed next release/.test(s));
      if (deprecated !== (spec.core === 'js')) failures.push(name + (deprecated ? ' warns ?core=js deprecated' : ' has no ?core=js deprecation note'));
    }
    return failures;
  } finally {
    await new Promise((res) => server.close(res));
  }
}

// What a fresh profile (no saved choices) shows once the page has booted and
// its boot map is applied: the labels of the launch card's visible buttons,
// and the map behind them.
async function launchScreen(base, query) {
  bootSeq += 1;
  const port = 9700 + bootSeq;
  const url = `${base}/sim.html${query || ''}`;
  const child = spawn(chrome, chromeArgs(port, `/tmp/qm-boot-${process.pid}-${bootSeq}-${Date.now()}`, url), { stdio: ['ignore', 'pipe', 'pipe'] });
  const page = await waitForCdpPage(port, (p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url || '').includes('/sim.html'), 100);
  if (!page) {
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    throw new Error('no CDP for the launch screen');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  try {
    await cdp(ws, 'Runtime.enable');
    const here = await cdp(ws, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true });
    if (!String(here && here.result && here.result.value || '').includes('/sim.html')) await cdp(ws, 'Page.navigate', { url });
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
              return !b.closest('#flyMaps')&&b.getClientRects().length>0&&cs.visibility!=='hidden'&&cs.opacity!=='0';
            }).map(function(b){return b.textContent.trim();}),
            // Fly's own row: the maps it flies.
            flyMaps: Array.prototype.filter.call(document.querySelectorAll('#flyMaps button'),function(b){
              return b.getClientRects().length>0;
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
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    await Promise.race([new Promise((res) => child.once('exit', res)), sleep(2000)]);
  }
}

test('the launch screen shows exactly five buttons without ?dev: Fly (its row: The Rig, The House), Daily, Boards, Tune, Controls; The Rig behind them from the first frame, and closed, unknown and spark links land there too', async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  try {
    const plain = await launchScreen('http://127.0.0.1:' + port, '');
    assert.deepEqual(plain && plain.labels, ['Fly', 'Daily', 'Boards', 'Tune', 'Controls']);
    assert.deepEqual(plain && plain.flyMaps, ['The Rig', 'The House'], 'Fly offers the House beside the Rig');
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
}, { timeout: 240000 });

test('headless Chrome boots every map on the default core (Betaflight) without errors or a blank FPV; classes with no plant fly JS CORE', async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  assert.equal((await bootCases(CASES.concat(FALLBACK_CASES))).join('\n'), '');
}, { timeout: 420000 });

test('headless Chrome boots every map on ?core=js (deprecated) without errors or a blank FPV', async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  assert.equal((await bootCases(JS_CASES)).join('\n'), '');
}, { timeout: 300000 });
