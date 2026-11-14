#!/usr/bin/env node
// Boot and draw-call bench for sim.html (built for the House + backyard work,
// works for any ?map=). Headless Chrome over CDP, no dependencies (Node 24:
// global fetch and WebSocket).
//
//   node tools/bench_house_boot.mjs [--root <dir>] [--ab <rootB>] [--runs N]
//        [--query "map=house&menu=1&fpv=1&quality=med"] [--json <file>]
//        [--calls --spots houseEntry,houseKitchen,houseThumb] [--calls-runs N]
//        [--no-cdn-cache] [--timeout <ms>]
//
// Boot timing (each run: a fresh Chrome and a fresh temp profile, the page
// loaded by Page.navigate from about:blank so the navigation timing is clean):
//   firstFrameMs  performance mark 'sim-first-frame' (sim.html loop(), first rAF)
//   readyMs       first in-page 50 ms poll where _sim.map()===<map>,
//                 _sim.vibe().id===<map> and _sim.looks.fps.ready (the
//                 test_sim_map_boot.mjs readiness predicate, minus the core)
//   settledMs     third rAF after ready with the composer up: the frames
//                 that compile the final shader variants are inside it
//   bfCoreMs      first poll where, additionally, _sim.core()==='bf'
//   responseEndMs navigation entry responseEnd
//   heapUsedMB    Runtime.getHeapUsage usedSize at ready (no forced GC);
//                 heapAfterGcMB the same after HeapProfiler.collectGarbage
// All times are performance.now() in the page (ms from navigation start).
// --ab interleaves A,B,A,B... (each root on its own port) and reports the
// percent change of the medians, B against A.
//
// The three/addons modules come from cdn.jsdelivr.net (sim.html import map).
// By default the bench fetches each once in Node and answers the page from
// that cache through CDP Fetch, so network jitter stays out of the numbers
// (--no-cdn-cache turns that off).
//
// --calls: after ready, close the menu, then for each --spots name call
// _sim.setLookSpot(name), let 3 frames settle and count draws per frame.
// Why renderer.info.render.calls is not the frame's draw calls on this page:
//   * sim.html renders through an EffectComposer (RenderPass, contact-AO
//     ShaderPass, UnrealBloomPass, FPV ShaderPass, AfterimagePass, OutputPass);
//     every pass is its own renderer.render(), and with info.autoReset (the
//     default) each render() zeroes the counters, so after a frame info shows
//     only the LAST render(): the OutputPass's single full-screen quad.
//   * three r180's WebGLRenderer.render() runs shadowMap.render() BEFORE its
//     info.reset(), so even the main RenderPass's own count leaves out the
//     shadow pass.
// So the bench reports, per spot:
//   infoCalls     renderer.info.render.calls as the page leaves it (naive)
//   infoFrame     renderer.info.render.calls over a whole frame with
//                 info.autoReset=false, reset at each frame boundary
//   glFrame       WebGL draw calls actually issued in the frame (drawArrays,
//                 drawElements, drawArraysInstanced, drawElementsInstanced,
//                 drawRangeElements, WEBGL_multi_draw multiDraw* counted per
//                 sub-draw), counted on the context between two rAFs
//   glScene       of glFrame, the draws inside the main scene's render()
//                 (camera pass + its shadow pass), glShadow the shadow pass
//                 alone, glPost the rest (composer passes).
// The renderer is window._sim.renderer (sim.html sets
// window._sim={renderer,scene,camera}); nothing in sim.html is edited.
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_QUERY = 'map=house&menu=1&fpv=1&quality=med';

function parseArgs(argv) {
  const o = {
    root: HERE_ROOT, ab: null, runs: 7, query: DEFAULT_QUERY, json: null,
    calls: false, spots: [], callsRuns: 1, cdnCache: true, timeout: 120000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(a + ' needs a value');
      return argv[++i];
    };
    if (a === '--root') o.root = resolve(next());
    else if (a === '--ab') o.ab = resolve(next());
    else if (a === '--runs') o.runs = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === '--query') o.query = next().replace(/^\?/, '');
    else if (a === '--json') o.json = resolve(next());
    else if (a === '--calls') o.calls = true;
    else if (a === '--spots') o.spots = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--calls-runs') o.callsRuns = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--no-cdn-cache') o.cdnCache = false;
    else if (a === '--timeout') o.timeout = Math.max(10000, parseInt(next(), 10) || 120000);
    else if (a === '-h' || a === '--help') { o.help = true; }
    else throw new Error('unknown argument ' + a);
  }
  if (o.calls && !o.spots.length) o.spots = ['houseEntry', 'houseKitchen', 'houseThumb'];
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- static server (same approach as tools/test_sim_map_boot.mjs) ----------
function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
    '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream',
    '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  })[extname(p).toLowerCase()] || 'application/octet-stream';
}

async function serveRoot(root) {
  const base = root.endsWith(sep) ? root : root + sep;
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    if (rel === '/__bench_blank') {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end('<!doctype html><title>bench</title>'); return;
    }
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404); res.end('missing'); return;
    }
    try {
      res.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' });
      res.end(readFileSync(file));
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port, root };
}

// ---- Chrome ---------------------------------------------------------------
function resolveChrome() {
  const names = [process.env.CHROME, 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    if (process.platform !== 'win32') {
      const w = spawnSync('which', [n], { encoding: 'utf8' });
      if (w.status === 0 && w.stdout.trim()) return w.stdout.trim();
    }
  }
  throw new Error('Chrome not found: set CHROME');
}

function chromeArgs(profile) {
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-webgl', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    // Windows proxy auto-detect (WPAD) otherwise stalls the first request of
    // every fresh profile by ~7 s before it even resolves 127.0.0.1.
    '--no-proxy-server',
    '--window-size=1400,800', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ];
}

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch (e) { try { child.kill('SIGKILL'); } catch (e2) { /* gone */ } }
}

const live = new Set();
let runDirPath = null;
function runDir() {
  if (!runDirPath) runDirPath = mkdtempSync(join(tmpdir(), 'qm-bench-'));
  return runDirPath;
}
function removeDir(d) {
  try { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* best effort */ }
}
function cleanUp() {
  for (const c of live) killTree(c);
  live.clear();
  if (runDirPath) removeDir(runDirPath);
  runDirPath = null;
}
process.on('exit', cleanUp);
process.on('SIGINT', () => { cleanUp(); process.exit(130); });

let seq = 0;
async function launchChrome(chromePath) {
  seq += 1;
  const profile = join(runDir(), 'p' + seq);
  const child = spawnBrowser(chromePath, chromeArgs(profile), {
    stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32',
  });
  live.add(child);
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 8000) stderr = stderr.slice(-4000); });
  const portFile = join(profile, 'DevToolsActivePort');
  let port = 0;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    try { port = parseInt(readFileSync(portFile, 'utf8').split('\n')[0], 10) || 0; } catch (e) { /* not yet */ }
  }
  if (!port) { killTree(child); throw new Error('Chrome gave no DevTools port\n' + stderr.slice(-400)); }
  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || null;
    } catch (e) { /* coming up */ }
    if (!page) await sleep(100);
  }
  if (!page) { killTree(child); throw new Error('no CDP page'); }
  const stop = async () => {
    killTree(child);
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([new Promise((r) => child.once('exit', r)), sleep(5000)]);
    }
    live.delete(child);
    removeDir(profile);
  };
  return { child, port, page, stop };
}

// ---- CDP client -----------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws; this.n = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (m) => {
      let o;
      try { o = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString()); } catch (e) { return; }
      if (o.id && this.pending.has(o.id)) {
        const p = this.pending.get(o.id); this.pending.delete(o.id); clearTimeout(p.t);
        if (o.error) p.reject(new Error(p.method + ': ' + JSON.stringify(o.error))); else p.resolve(o.result || {});
      } else if (o.method) {
        for (const h of this.handlers.get(o.method) || []) { try { h(o.params || {}); } catch (e) { /* ignore */ } }
      }
    });
    ws.addEventListener('close', () => {
      for (const p of this.pending.values()) { clearTimeout(p.t); p.reject(new Error('cdp closed during ' + p.method)); }
      this.pending.clear();
    });
  }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws open failed')); });
    return new Cdp(ws);
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  send(method, params, timeoutMs) {
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('cdp timeout ' + method)); }, timeoutMs || 30000);
      this.pending.set(id, { resolve, reject, t, method });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async eval(expr, opts) {
    const r = await this.send('Runtime.evaluate', Object.assign({ expression: expr, returnByValue: true, awaitPromise: true }, opts || {}), 60000);
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails;
      throw new Error('page eval: ' + ((ex.exception && ex.exception.description) || ex.text));
    }
    return r.result ? r.result.value : undefined;
  }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

// ---- CDN cache (three/addons from jsdelivr) --------------------------------
const cdnCache = new Map();
async function cdnFetch(url) {
  if (cdnCache.has(url)) return cdnCache.get(url);
  const p = (async () => {
    const r = await fetch(url);
    const body = Buffer.from(await r.arrayBuffer());
    const headers = [];
    r.headers.forEach((v, k) => {
      if (/^(content-encoding|content-length|transfer-encoding|connection)$/i.test(k)) return;
      headers.push({ name: k, value: v });
    });
    if (!headers.some((h) => h.name.toLowerCase() === 'access-control-allow-origin')) {
      headers.push({ name: 'access-control-allow-origin', value: '*' });
    }
    return { status: r.status, headers, body: body.toString('base64') };
  })();
  cdnCache.set(url, p);
  try { return await p; } catch (e) { cdnCache.delete(url); throw e; }
}

// ---- in-page probe (installed before any page script) ----------------------
function probeSource(wantMap) {
  return `(function(){
  var W=${JSON.stringify(wantMap)};
  var b=window.__bench={want:W,polls:0};
  var iv=setInterval(function(){
    b.polls++;
    try{
      var s=window._sim; if(!s||typeof s.map!=='function')return;
      var m=s.map();
      if(b.mapAt==null&&m===W)b.mapAt=performance.now();
      var v=s.vibe?s.vibe():null, f=s.looks&&s.looks.fps;
      var ok=m===W&&v&&v.id===W&&f&&f.ready;
      if(ok&&b.readyAt==null){
        b.readyAt=performance.now();
        // settledAt: the third rAF after ready, once the composer is up (at
        // low, no post chain: three frames), so the frames that compile the
        // final shader variants are inside it.
        var n=0;(function f(){var L=s.looks;if(L&&(L.composer||L.applied==='low'))n++;if(n>=3){b.settledAt=performance.now();return;}requestAnimationFrame(f);})();
      }
      if(ok&&b.bfAt==null&&s.core&&s.core()==='bf')b.bfAt=performance.now();
      if(b.readyAt!=null&&(b.bfAt!=null||performance.now()-b.readyAt>15000))clearInterval(iv);
    }catch(e){b.err=String(e);}
  },50);
})();`;
}

// Hook the renderer: GL draw counters on the context, a wrapper on render()
// and shadowMap.render() that records each call's GL draws. Idempotent.
const HOOK_SRC = `(function(){
  var s=window._sim, r=s&&s.renderer; if(!r)return 'no renderer';
  if(window.__dc)return 'already';
  var gl=r.getContext(); var H=window.__dc={gl:0,byFn:{},renders:[],shadow:0,log:false};
  function wrap(obj,name,countOf){
    if(!obj||typeof obj[name]!=='function')return;
    var orig=obj[name];
    obj[name]=function(){var k=countOf?countOf(arguments):1;H.gl+=k;H.byFn[name]=(H.byFn[name]||0)+k;return orig.apply(this,arguments);};
  }
  ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','drawRangeElements'].forEach(function(n){wrap(gl,n);});
  var md=gl.getExtension('WEBGL_multi_draw');
  if(md){
    wrap(md,'multiDrawArraysWEBGL',function(a){return a[a.length-1]|0;});
    wrap(md,'multiDrawElementsWEBGL',function(a){return a[a.length-1]|0;});
    wrap(md,'multiDrawArraysInstancedWEBGL',function(a){return a[a.length-1]|0;});
    wrap(md,'multiDrawElementsInstancedWEBGL',function(a){return a[a.length-1]|0;});
  }
  var origRender=r.render;
  r.render=function(sc,cam){
    var g0=H.gl,i0=r.info.render.calls,sh0=H.shadow;
    var out=origRender.apply(this,arguments);
    if(H.log)H.renders.push({main:sc===s.scene,gl:H.gl-g0,shadowGl:H.shadow-sh0,info:r.info.render.calls-i0});
    return out;
  };
  var sm=r.shadowMap;
  if(sm&&typeof sm.render==='function'){
    var origSm=sm.render;
    sm.render=function(){var g0=H.gl;var out=origSm.apply(this,arguments);H.shadow+=H.gl-g0;return out;};
  }
  return 'ok';
})()`;

// Count `n` frames after `settle` frames. Our rAF is queued after sim.html's
// loop (the loop re-queues itself at the top of its callback, before ours
// is first queued from outside a frame), so the counter delta between two of
// our callbacks is exactly one loop() frame. mode 'naive' leaves info as the
// page has it; mode 'whole' sets info.autoReset=false and resets info at each
// boundary.
function framesSrc(settle, n, mode) {
  return `new Promise(function(done){
  var s=window._sim,r=s.renderer,H=window.__dc,info=r.info;
  var whole=${JSON.stringify(mode)}==='whole';
  var prevAuto=info.autoReset;
  var out=[],k=0,g0=0,sh0=0;
  function tick(){
    k++;
    if(k===${settle}){
      if(whole){info.autoReset=false;info.reset();}
      g0=H.gl;sh0=H.shadow;H.renders=[];H.log=true;
    }else if(k>${settle}){
      var rs=H.renders;H.renders=[];
      var sceneGl=0,sceneShadow=0,postGl=0,passes=rs.length;
      rs.forEach(function(x){if(x.main){sceneGl+=x.gl;sceneShadow+=x.shadowGl;}else postGl+=x.gl;});
      out.push({glFrame:H.gl-g0,glShadow:H.shadow-sh0,glScene:sceneGl,glSceneShadow:sceneShadow,glPost:postGl,
        renders:passes,info:info.render.calls,triangles:info.render.triangles});
      g0=H.gl;sh0=H.shadow;
      if(whole)info.reset();
      if(out.length>=${n}){H.log=false;info.autoReset=prevAuto;done(out);return;}
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  setTimeout(function(){H.log=false;info.autoReset=prevAuto;done(out);},30000);
})`;
}

const CLOSE_MENU_SRC = `(function(){
  ['startMenu','feelPrompt','menuLayer','legend','audioHint','toast','panel','firstFlight'].forEach(function(id){
    var el=document.getElementById(id); if(!el)return;
    el.classList.remove('open','show'); el.style.display='none';
  });
  document.body.classList.remove('menu-open');
  var s=window._sim||{};
  if(typeof s.setMenuOpen==='function')s.setMenuOpen(false);
  if(s.looks&&s.looks.setMenuOpen)s.looks.setMenuOpen(false);
  if(window._feel&&window._feel.hideFirstRun)window._feel.hideFirstRun();
  return {setMenuOpen:typeof s.setMenuOpen==='function',looksSetMenuOpen:!!(s.looks&&s.looks.setMenuOpen),composer:!!(s.looks&&s.looks.composer)};
})()`;

function spotSrc(name) {
  return `(async function(){
  var s=window._sim; if(!s||!s.setLookSpot)return {ok:false,why:'no setLookSpot'};
  var known=null;
  try{ var m=await import('./sim-looks.js'); known=!!(m.LOOK_SPOTS&&m.LOOK_SPOTS[${JSON.stringify(name)}]); }catch(e){}
  s.setLookSpot(${JSON.stringify(name)});
  return {ok:true,known:known};
})()`;
}
const CAM_SRC = `(function(){var c=window._sim.camera;return [c.position.x,c.position.y,c.position.z].map(function(v){return +v.toFixed(3);});})()`;

// ---- one run --------------------------------------------------------------
async function oneRun(chromePath, srv, opts, label, doCalls) {
  const url = `http://127.0.0.1:${srv.port}/sim.html?${opts.query}`;
  const wantMap = new URLSearchParams(opts.query).get('map') || 'rig';
  const chrome = await launchChrome(chromePath);
  const cdp = await Cdp.open(chrome.page.webSocketDebuggerUrl);
  const errors = [];
  const rec = { label, root: srv.root, url, t: new Date().toISOString() };
  try {
    cdp.on('Runtime.exceptionThrown', (p) => {
      const ex = p.exceptionDetails || {};
      errors.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'exception');
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') errors.push((p.args || []).map((a) => a.value || a.description || '').join(' '));
    });
    let cdnHits = 0;
    if (opts.cdnCache) {
      cdp.on('Fetch.requestPaused', async (p) => {
        try {
          const got = await cdnFetch(p.request.url);
          cdnHits++;
          await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: got.status, responseHeaders: got.headers, body: got.body });
        } catch (e) {
          try { await cdp.send('Fetch.continueRequest', { requestId: p.requestId }); } catch (e2) { /* page gone */ }
        }
      });
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://cdn.jsdelivr.net/*', requestStage: 'Request' }] });
    }
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    // A tiny page on the same origin first: a fresh Chrome profile on Windows
    // stalls its first request by 7-9 s (network service start-up), which
    // has nothing to do with the site. The profile stays fresh: nothing of the
    // site is cached by it.
    const loaded = () => new Promise((res) => {
      const t = setTimeout(res, 20000);
      cdp.on('Page.loadEventFired', () => { clearTimeout(t); res(); });
    });
    const warmLoad = loaded();
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/__bench_blank` });
    await warmLoad;
    await sleep(300);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: probeSource(wantMap) });
    await cdp.send('Page.navigate', { url });
    const t0 = Date.now();
    let b = null;
    while (Date.now() - t0 < opts.timeout) {
      await sleep(200);
      try {
        b = await cdp.eval(`window.__bench&&location.href.indexOf(${JSON.stringify('/sim.html')})>=0?JSON.stringify(window.__bench):null`);
        b = b ? JSON.parse(b) : null;
      } catch (e) { b = null; }
      if (b && b.readyAt != null) {
        // Ready; also wait (up to the probe's 15 s) for the bf core to fly.
        if (b.bfAt != null && b.settledAt != null) break;
        const nowIn = await cdp.eval('performance.now()');
        if (nowIn - b.readyAt > 15000) break;
      }
    }
    if (!b || b.readyAt == null) throw new Error(`${label}: not ready in ${opts.timeout} ms (map ${b && b.mapAt != null ? 'seen' : 'not seen'}${b && b.err ? ', ' + b.err : ''})`);
    const timing = JSON.parse(await cdp.eval(`JSON.stringify((function(){
      var ff=performance.getEntriesByName('sim-first-frame')[0];
      var nav=performance.getEntriesByType('navigation')[0];
      var pm=performance.memory;
      return {firstFrameMs:ff?ff.startTime:null,responseEndMs:nav?nav.responseEnd:null,
        domContentLoadedMs:nav?nav.domContentLoadedEventEnd:null,loadEventMs:nav?nav.loadEventEnd:null,
        nav:nav?{fetchStart:nav.fetchStart,domainLookupStart:nav.domainLookupStart,connectStart:nav.connectStart,connectEnd:nav.connectEnd,
          requestStart:nav.requestStart,responseStart:nav.responseStart,responseEnd:nav.responseEnd,transferSize:nav.transferSize,
          domInteractive:nav.domInteractive}:null,
        perfHeapMB:pm?pm.usedJSHeapSize/1048576:null,core:window._sim&&window._sim.core?window._sim.core():null};
    })())`));
    const heap = await cdp.send('Runtime.getHeapUsage');
    let gcHeap = null;
    try { await cdp.send('HeapProfiler.collectGarbage'); gcHeap = await cdp.send('Runtime.getHeapUsage'); } catch (e) { /* optional */ }
    Object.assign(rec, {
      firstFrameMs: timing.firstFrameMs, readyMs: b.readyAt, settledMs: b.settledAt == null ? null : b.settledAt, mapMs: b.mapAt, bfCoreMs: b.bfAt == null ? null : b.bfAt,
      responseEndMs: timing.responseEndMs, domContentLoadedMs: timing.domContentLoadedMs, loadEventMs: timing.loadEventMs,
      heapUsedMB: heap.usedSize / 1048576, heapTotalMB: heap.totalSize / 1048576,
      heapAfterGcMB: gcHeap ? gcHeap.usedSize / 1048576 : null, perfHeapMB: timing.perfHeapMB,
      core: timing.core, cdnHits, nav: timing.nav,
    });
    if (doCalls) rec.calls = await measureCalls(cdp, opts.spots);
    rec.errors = errors.slice(0, 20);
    return rec;
  } finally {
    cdp.close();
    await chrome.stop();
  }
}

async function measureCalls(cdp, spots) {
  const menu = await cdp.eval(CLOSE_MENU_SRC);
  // Let the post chain (composer) come up and the unpaused sim settle.
  for (let i = 0; i < 40; i++) {
    const c = await cdp.eval('!!(window._sim&&window._sim.looks&&window._sim.looks.composer)');
    if (c) break;
    await sleep(250);
  }
  await sleep(1000);
  const hook = await cdp.eval(HOOK_SRC);
  const out = { menu, hook, spots: {} };
  for (const name of spots) {
    const spot = await cdp.eval(spotSrc(name));
    // settle 3 frames, then 3 frames as the page leaves info, then 3 frames
    // with info.autoReset off.
    const naive = await cdp.eval(framesSrc(3, 3, 'naive'));
    const whole = await cdp.eval(framesSrc(1, 3, 'whole'));
    const byFn = await cdp.eval('JSON.stringify(window.__dc.byFn)');
    spot.camera = await cdp.eval(CAM_SRC);
    const pick = (arr, k) => arr.map((f) => f[k]);
    const med = (a) => median(a.filter((x) => x != null));
    out.spots[name] = {
      spot,
      infoCalls: med(pick(naive, 'info')),
      infoFrame: med(pick(whole, 'info')),
      glFrame: med(pick(naive, 'glFrame').concat(pick(whole, 'glFrame'))),
      glScene: med(pick(naive, 'glScene').concat(pick(whole, 'glScene'))),
      glShadow: med(pick(naive, 'glShadow').concat(pick(whole, 'glShadow'))),
      glPost: med(pick(naive, 'glPost').concat(pick(whole, 'glPost'))),
      renders: med(pick(naive, 'renders').concat(pick(whole, 'renders'))),
      frames: { naive, whole },
      byFnSoFar: JSON.parse(byFn),
    };
  }
  return out;
}

// ---- stats ----------------------------------------------------------------
function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stats(a) {
  const v = a.filter((x) => typeof x === 'number' && isFinite(x));
  if (!v.length) return null;
  const mean = v.reduce((t, x) => t + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((t, x) => t + (x - mean) * (x - mean), 0) / Math.max(1, v.length - 1));
  return { n: v.length, median: median(v), mean, min: Math.min(...v), max: Math.max(...v), sd };
}
const METRICS = ['firstFrameMs', 'readyMs', 'settledMs', 'bfCoreMs', 'responseEndMs', 'heapUsedMB', 'heapAfterGcMB'];
function summarize(runs) {
  const o = {};
  for (const m of METRICS) o[m] = stats(runs.map((r) => r[m]));
  return o;
}
function fmt(x, d) { return x == null ? '   -   ' : x.toFixed(d == null ? 1 : d); }
function printSummary(label, s) {
  console.log(`\n${label}`);
  console.log('  metric           median     mean      min      max     sd    n');
  for (const m of METRICS) {
    const v = s[m];
    if (!v) { console.log(`  ${m.padEnd(15)}  (none)`); continue; }
    const d = /MB$/.test(m) ? 2 : 1;
    console.log(`  ${m.padEnd(15)} ${fmt(v.median, d).padStart(8)} ${fmt(v.mean, d).padStart(8)} ${fmt(v.min, d).padStart(8)} ${fmt(v.max, d).padStart(8)} ${fmt(v.sd, d).padStart(6)} ${String(v.n).padStart(4)}`);
  }
}

// ---- main -----------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 12).join('\n'));
    return;
  }
  const chromePath = resolveChrome();
  const roots = [opts.root].concat(opts.ab ? [opts.ab] : []);
  for (const r of roots) if (!existsSync(join(r, 'sim.html'))) throw new Error('no sim.html in ' + r);
  const servers = [];
  for (const r of roots) servers.push(await serveRoot(r));
  const labels = opts.ab ? ['A', 'B'] : ['A'];
  console.log(`bench_house_boot: query ?${opts.query}, runs ${opts.runs}${opts.ab ? ' interleaved A/B' : ''}, cdn cache ${opts.cdnCache ? 'on' : 'off'}`);
  servers.forEach((s, i) => console.log(`  ${labels[i]}: ${s.root} on :${s.port}`));
  console.log(`  chrome: ${chromePath}`);
  const result = { query: opts.query, chrome: chromePath, node: process.version, date: new Date().toISOString(),
    roots: Object.fromEntries(servers.map((s, i) => [labels[i], s.root])), runs: {}, summary: {}, calls: {} };
  for (const l of labels) result.runs[l] = [];
  const failures = [];
  try {
    // Warm Chrome's binary and the CDN cache (one untimed run, root A).
    if (opts.runs > 0) {
      process.stdout.write('  warm-up ... ');
      try { await oneRun(chromePath, servers[0], opts, 'warm', false); console.log('ok'); } catch (e) { console.log('failed: ' + e.message); }
    }
    for (let i = 0; i < opts.runs; i++) {
      for (let k = 0; k < servers.length; k++) {
        const l = labels[k];
        try {
          const r = await oneRun(chromePath, servers[k], opts, `${l}${i + 1}`, false);
          result.runs[l].push(r);
          console.log(`  ${l}${i + 1}: firstFrame ${fmt(r.firstFrameMs)} ms, ready ${fmt(r.readyMs)} ms, bfCore ${fmt(r.bfCoreMs)} ms, responseEnd ${fmt(r.responseEndMs)} ms, heap ${fmt(r.heapUsedMB, 2)} MB (after GC ${fmt(r.heapAfterGcMB, 2)})${r.errors.length ? ', ' + r.errors.length + ' page errors' : ''}`);
        } catch (e) {
          failures.push(e.message);
          console.log(`  ${l}${i + 1}: FAILED ${e.message}`);
        }
      }
    }
    if (opts.runs > 0) {
      for (const l of labels) {
        result.summary[l] = summarize(result.runs[l]);
        printSummary(`${l} (${result.roots[l]})`, result.summary[l]);
      }
      if (opts.ab) {
        result.change = {};
        console.log('\nB vs A, change of medians:');
        for (const m of METRICS) {
          const a = result.summary.A[m]; const bb = result.summary.B[m];
          const pct = a && bb && a.median ? (bb.median - a.median) / a.median * 100 : null;
          result.change[m] = pct;
          console.log(`  ${m.padEnd(15)} ${pct == null ? '-' : (pct >= 0 ? '+' : '') + pct.toFixed(1) + ' %'}`);
        }
      }
    }
    if (opts.calls) {
      console.log(`\ndraw calls (spots ${opts.spots.join(', ')}):`);
      for (let k = 0; k < servers.length; k++) {
        const l = labels[k];
        result.calls[l] = [];
        for (let i = 0; i < opts.callsRuns; i++) {
          try {
            const r = await oneRun(chromePath, servers[k], opts, `${l}calls${i + 1}`, true);
            result.calls[l].push(r);
            console.log(`  ${l} run ${i + 1}: menu ${JSON.stringify(r.calls.menu)}, hook ${r.calls.hook}`);
            for (const [name, v] of Object.entries(r.calls.spots)) {
              console.log(`    ${name.padEnd(18)} info.calls ${String(v.infoCalls).padStart(4)} | whole frame: info ${String(v.infoFrame).padStart(4)}, gl ${String(v.glFrame).padStart(4)} (scene ${v.glScene} incl. shadow ${v.glShadow}, post ${v.glPost}, ${v.renders} render() calls) | spot ${JSON.stringify(v.spot)}`);
            }
            if (r.errors.length) console.log(`    page errors: ${r.errors.length}: ${r.errors[0].slice(0, 200)}`);
          } catch (e) {
            failures.push(e.message);
            console.log(`  ${l} calls run ${i + 1}: FAILED ${e.message}`);
          }
        }
      }
    }
  } finally {
    for (const s of servers) await new Promise((r) => s.server.close(r));
    cleanUp();
  }
  result.failures = failures;
  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify(result, null, 2));
    console.log('\nwrote ' + opts.json);
  }
  if (failures.length) { console.log(`\n${failures.length} run(s) failed`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e && e.stack || e); cleanUp(); process.exit(1); });
