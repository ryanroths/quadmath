// The look's textures in the page: KTX2 where the GPU has a compressed format,
// the WebP with ?ktx2=0 and when a KTX2 will not load; nothing errors either way.
// Headless Chrome on SwiftShader. SKIP_CHROME_BOOT=1 skips it.
// node --test tools/test_sim_ktx2.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnBrowser, killBrowserTree, closeBrowsers } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

// Every Chrome profile this file made and has not removed yet.
const profiles = new Set();

function exited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

// Resolves once the child has exited, or after ms, whichever comes first.
function exitWithin(child, ms) {
  if (!child || exited(child)) return Promise.resolve();
  let t;
  return Promise.race([
    new Promise((r) => child.once('exit', r)),
    new Promise((r) => { t = setTimeout(r, ms); }),
  ]).finally(() => clearTimeout(t));
}

// Stops this boot's Chrome and waits for it to exit. First Browser.close over
// its own browser socket, so Chrome ends its GPU, network and utility
// processes itself; then the tree and anything else on its profile
// (killBrowserTree), for whatever is still running. A bare kill ends only the
// browser process on Windows, and the helpers it leaves keep the profile
// locked.
const EXIT_MS = 5000;
async function stopChrome(child, browserWs) {
  if (!child) return;
  if (browserWs && !exited(child)) {
    let ws = null;
    try {
      ws = new WebSocket(browserWs);
      await Promise.race([
        new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws')); }),
        sleep(2000).then(() => { throw new Error('browser socket did not open'); }),
      ]);
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      await exitWithin(child, EXIT_MS);
    } catch (e) { /* the tree kill below */ }
    try { ws && ws.close(); } catch (e) { /* closed */ }
  }
  killBrowserTree(child);
  await exitWithin(child, EXIT_MS);
}

// Removes a profile, trying again with a doubling wait while Windows still
// holds a dead Chrome's files; says so when it still cannot.
async function removeProfile(dir) {
  let err = null;
  for (let i = 0, wait = 100; ; i++, wait *= 2) {
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) { err = e; }
    if (!existsSync(dir)) { profiles.delete(dir); return true; }
    if (i === 7) break;
    await sleep(wait);
  }
  console.warn(`test_sim_ktx2: Chrome profile not removed: ${dir} (${err ? err.code || err.message : 'still there'})`);
  return false;
}

// Pass or fail, a profile a boot could not remove goes when the file ends:
// its browsers killed first (closeBrowsers also sweeps their profiles).
after(async () => {
  closeBrowsers();
  for (const dir of [...profiles]) await removeProfile(dir);
});
process.on('exit', () => {
  closeBrowsers();
  for (const dir of profiles) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* said below */ }
    if (existsSync(dir)) console.warn(`test_sim_ktx2: Chrome profile not removed: ${dir}`);
  }
});

// Boots the Rig, waits for its look textures to land, returns what they became.
async function boot(query, opts) {
  const { srv, fetched, port } = await serve(opts || {});
  const profile = mkdtempSync(join(tmpdir(), 'qm-ktx2-'));
  profiles.add(profile);
  let child = null;
  let browserWs = null;
  let ws;
  try {
    // DevTools on port 0: Chrome takes a free port and writes it, and its
    // browser socket's path, to the profile's DevToolsActivePort. A fixed
    // port could be another run's Chrome, and Browser.close would close that.
    child = spawnBrowser(chrome, ['--headless=new', '--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=800,450', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: process.platform !== 'win32' });
    let dbg = 0;
    let page = null;
    for (let i = 0; i < 150 && !page; i++) {
      await sleep(200);
      if (!dbg) {
        try {
          const [p, path] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
          dbg = parseInt(p, 10) || 0;
          if (dbg && path && path.trim()) browserWs = `ws://127.0.0.1:${dbg}${path.trim()}`;
        } catch (e) { /* not written yet */ }
        if (!dbg) continue;
      }
      try { page = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* not up */ }
    }
    assert.ok(page, 'no CDP page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0;
    const wait = new Map(), errors = [];
    // A Chrome that dies or a page that crashes answers nothing: fail every
    // call still waiting, so the boot ends and its finally cleans up.
    const failAll = (why) => { for (const w of wait.values()) w.j(new Error(why)); wait.clear(); };
    ws.addEventListener('close', () => failAll('cdp: Chrome closed its socket'));
    ws.addEventListener('message', (m) => {
      const o = JSON.parse(m.data);
      if (o.id && wait.has(o.id)) { wait.get(o.id).r(o); wait.delete(o.id); }
      if (o.method === 'Inspector.targetCrashed') failAll('cdp: the page crashed');
      if (o.method === 'Runtime.exceptionThrown') errors.push(o.params.exceptionDetails.exception?.description || o.params.exceptionDetails.text);
      if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'error') errors.push(o.params.args.map((a) => a.value || a.description).join(' '));
    });
    const cdp = (method, params) => new Promise((r, j) => {
      if (ws.readyState !== 1) return j(new Error('cdp socket closed before ' + method));
      const id = ++seq;
      wait.set(id, { r, j });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
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
    await stopChrome(child, browserWs);
    srv.close();
    await removeProfile(profile);
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
