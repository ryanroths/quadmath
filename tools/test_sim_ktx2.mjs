// The look's textures in the page: KTX2 where the GPU has a compressed format,
// the WebP with ?ktx2=0 and when a KTX2 will not load; nothing errors either way.
// Headless Chrome on SwiftShader. SKIP_CHROME_BOOT=1 skips it.
// node --test tools/test_sim_ktx2.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chrome = process.env.CHROME || ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find((p) => existsSync(p)) || 'google-chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve(opts) {
  const fetched = { ktx2: 0, webp: 0 };
  const srv = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = normalize(join(root, p === '/' ? 'index.html' : p));
      const e = extname(f).toLowerCase();
      if (/look_/.test(f) && e === '.ktx2') {
        fetched.ktx2++;
        if (opts.blockKtx2) { res.writeHead(404); return res.end(); }
      }
      if (/look_/.test(f) && e === '.webp') fetched.webp++;
      await stat(f);
      res.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(f));
    } catch (err) { res.writeHead(404); res.end('nf'); }
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, fetched, port: srv.address().port })));
}

let portSeq = 0;
// Boots the Rig, waits for its look textures to land, returns what they became.
async function boot(query, opts) {
  const { srv, fetched, port } = await serve(opts || {});
  const dbg = 9500 + (process.pid % 300) + (portSeq++);
  const profile = mkdtempSync(join(tmpdir(), 'qm-ktx2-'));
  const child = spawnBrowser(chrome, ['--headless=new', '--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=800,450', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    let page = null;
    for (let i = 0; i < 150 && !page; i++) {
      await sleep(200);
      try { page = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* not up */ }
    }
    assert.ok(page, 'no CDP page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0;
    const wait = new Map(), errors = [];
    ws.addEventListener('message', (m) => {
      const o = JSON.parse(m.data);
      if (o.id && wait.has(o.id)) { wait.get(o.id)(o); wait.delete(o.id); }
      if (o.method === 'Runtime.exceptionThrown') errors.push(o.params.exceptionDetails.exception?.description || o.params.exceptionDetails.text);
      if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'error') errors.push(o.params.args.map((a) => a.value || a.description).join(' '));
    });
    const cdp = (method, params) => new Promise((r) => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const ev = async (expression) => (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/sim.html?map=rig&look=rigWhoop&quality=low&menu=1&fpv=1${query}` });
    const read = `(()=>{const S=window._sim;if(!S||!S.scene)return null;const seen=new Map();
      S.scene.traverseVisible((o)=>{if(!o.material)return;for(const m of [].concat(o.material))for(const k in m){const t=m[k];if(t&&t.isTexture&&/^look_.*_(diff|nr|dr)_/.test(t.name||''))seen.set(t.uuid,{name:t.name,compressed:!!t.isCompressedTexture,w:(t.image&&t.image.width)||0,format:t.format,mips:(t.mipmaps&&t.mipmaps.length)||0});}});
      const gl=S.renderer.getContext();
      return {list:[...seen.values()],frames:S.renderer.info.render.frame,glError:gl.getError()};})()`;
    let got = null;
    for (let i = 0; i < 300; i++) {
      await sleep(300);
      got = await ev(read);
      if (got && got.list.length && got.list.every((t) => t.w > 1) && got.frames > 10) break;
    }
    await sleep(1200);
    got = await ev(read);
    return { ...got, errors, fetched };
  } finally {
    try { ws && ws.close(); } catch (e) { /* closed */ }
    try { child.kill('SIGKILL'); } catch (e) { /* gone */ }
    srv.close();
    await sleep(600);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked on Windows */ }
  }
}

const skip = process.env.SKIP_CHROME_BOOT === '1' ? 'SKIP_CHROME_BOOT' : false;

test('the Rig loads its look sets as compressed KTX2, every mip, no WebP fetched, no error', { skip }, async () => {
  const r = await boot('');
  assert.deepEqual(r.errors, []);
  assert.equal(r.glError, 0);
  assert.ok(r.list.length >= 3, 'its look textures: ' + r.list.length);
  for (const t of r.list) {
    assert.ok(t.compressed, t.name + ' compressed');
    assert.ok(t.w >= 256, t.name + ' landed, ' + t.w);
    assert.equal(t.mips, Math.log2(t.w) + 1, t.name + ' every mip');
  }
  assert.ok(r.fetched.ktx2 >= r.list.length && r.fetched.webp === 0, JSON.stringify(r.fetched));
});

test('?ktx2=0 keeps the WebPs', { skip }, async () => {
  const r = await boot('&ktx2=0');
  assert.deepEqual(r.errors, []);
  assert.ok(r.list.length >= 3 && r.list.every((t) => !t.compressed && t.w >= 256), JSON.stringify(r.list));
  assert.equal(r.fetched.ktx2, 0);
});

test('a KTX2 that will not load falls back to its WebP', { skip }, async () => {
  const r = await boot('', { blockKtx2: true });
  assert.ok(r.fetched.ktx2 > 0, 'it tried');
  assert.equal(r.glError, 0);
  assert.ok(r.list.length >= 3 && r.list.every((t) => !t.compressed && t.w >= 256), JSON.stringify(r.list));
  assert.ok(r.fetched.webp >= r.list.length, JSON.stringify(r.fetched));
});
