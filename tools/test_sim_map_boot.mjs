// Headless boot of every map: no console exceptions, correct resolveSimBoot,
// non-blank FPV. Requires Chrome + a local sim.html server (starts one).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveSimBoot, freestyleIdFor, MAPS } from '../sim-tracks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chrome = process.env.CHROME || 'google-chrome';
const LOOK = {
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

async function bootPage(base, spec) {
  // sim.html defaults currentMap to 'city' until fetchBuiltinTracks + applyQueryBoot.
  // A fixed sleep plus a reused CDP port / user-data-dir can read that default
  // (or a dying sibling Chrome) as "gym booted as city" when the full suite
  // saturates the machine. Isolate each boot and wait for the queried map.
  const trackQ = spec.track ? `&track=${spec.track}` : '';
  const url = `${base}/sim.html?map=${spec.map}${trackQ}&look=${spec.look}&quality=${spec.q}&menu=1&fpv=1`;
  bootSeq += 1;
  const port = 9700 + bootSeq;
  const userData = `/tmp/qm-boot-${process.pid}-${bootSeq}-${Date.now()}`;
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--window-size=1400,800', `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`, url,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const mapQ = 'map=' + spec.map;
  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(120);
    try {
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const page = pages.find((p) => (
        p.type === 'page' && p.webSocketDebuggerUrl && String(p.url || '').includes(mapQ)
      ));
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) { /* wait */ }
  }
  if (!wsUrl) {
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    throw new Error('no CDP for ' + spec.map + '\n' + stderr.slice(-400));
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  const consoles = [];
  ws.addEventListener('message', (msg) => {
    try {
      const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
      if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'error') {
        consoles.push((o.params.args || []).map((a) => a.value || a.description || '').join(' '));
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
    let parsed = {};
    for (let i = 0; i < 48; i++) {
      const probe = await cdp(ws, 'Runtime.evaluate', {
        expression: `JSON.stringify((function(){
          var s=window._sim||{};
          var map = s.map ? s.map() : null;
          var vibe = s.vibe ? s.vibe() : null;
          return { map: map, vibeId: vibe && vibe.id, ready: !!(s.map && s.vibe) };
        })())`,
        returnByValue: true,
      });
      const got = probe && probe.result && probe.result.value ? JSON.parse(probe.result.value) : {};
      if (got.map === spec.map && got.vibeId === spec.map) { parsed = got; break; }
      await sleep(250);
    }
    await cdp(ws, 'Runtime.evaluate', {
      expression: `(function(){
        ['startMenu','feelPrompt','menuLayer','legend','audioHint','toast','panel'].forEach(function(id){
          var el=document.getElementById(id); if(!el)return;
          el.classList.remove('open','show'); el.style.display='none';
        });
        document.body.classList.remove('menu-open');
        if(window._sim&&window._sim.looks) window._sim.looks.menuOpen=false;
        if(window._sim&&window._sim.setLookSpot){
          var look=new URLSearchParams(location.search).get('look');
          if(look)window._sim.setLookSpot(look);
        }
        return true;
      })()`,
    });
    await sleep(400);
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
        return { map: map, track: s.track ? s.track() : null, vibeId: vibe && vibe.id, artError: artError, avg: avg, n: n, triangles: triangles };
      })())`,
      returnByValue: true,
    });
    parsed = info && info.result && info.result.value ? JSON.parse(info.result.value) : parsed;
    try {
      const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
      const dir = mkdtempSync(join(tmpdir(), 'qm-boot-'));
      const png = join(dir, spec.map + '.png');
      writeFileSync(png, Buffer.from(shot.data, 'base64'));
      const py = spawnSync('python3', ['-c',
        'from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB"); '
        + 'px=im.tobytes(); n=len(px)//3; print(sum(px)/(n or 1))', png], { encoding: 'utf8' });
      parsed.shotAvg = Number(py.stdout);
    } catch (e) {
      parsed.shotError = e.message;
    }
    parsed.consoles = consoles;
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

test('headless Chrome boots every map without errors or a blank FPV', async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const base = 'http://127.0.0.1:' + port;
  try {
    const failures = [];
    for (const spec of CASES) {
      const got = await bootPage(base, spec);
      const wantTrack = spec.track || freestyleIdFor(spec.map);
      const refs = (got.consoles || []).filter((s) => /ReferenceError|is not defined/i.test(s));
      const fatal = (got.consoles || []).filter((s) => /ReferenceError|TypeError|SyntaxError/i.test(s));
      if (got.evalError) failures.push(spec.map + ' eval ' + got.evalError);
      if (got.map !== spec.map) failures.push(spec.map + ' booted as ' + got.map);
      if (got.vibeId !== spec.map) failures.push(spec.map + ' vibe ' + got.vibeId);
      if (got.artError) failures.push(spec.map + ' artError ' + got.artError);
      if (fatal.length) failures.push(spec.map + ' console ' + fatal[0]);
      if (refs.length) failures.push(spec.map + ' missing import ' + refs[0]);
      if (!(got.shotAvg > 12)) failures.push(spec.map + ' blank shotAvg=' + got.shotAvg);
      if (got.shotError) failures.push(spec.map + ' shot ' + got.shotError);
      if (spec.track && String(got.track) !== String(wantTrack) && spec.track === 'room-practice') {
        if (String(got.track) !== 'room-practice') failures.push('room-practice booted ' + got.track);
      }
    }
    assert.equal(failures.join('\n'), '');
  } finally {
    await new Promise((res) => server.close(res));
  }
}, { timeout: 240000 });
