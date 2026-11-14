// The House's backyard in headless Chrome: sim.html?map=house boots with no
// console errors and the yard built (its art group, colliders, the page's
// yard data); from each yard look spot (sim-looks.js LOOK_SPOTS houseYard*,
// and houseEntry) a whole frame issues fewer than 60 WebGL draw calls; the
// page's water crash and soft boundary fire (window._sim.yardState).
// node --test tools/test_sim_house_yard_page.mjs
// Skipped with SKIP_CHROME_BOOT=1, as the other Chrome tests. CHROME=<path>
// picks the browser. QM_YARD_SHOTS=<dir> keeps a screenshot per spot.
// The server and Chrome helpers are tools/test_sim_map_boot.mjs's, copied.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SKIP = process.env.SKIP_CHROME_BOOT === '1';

// The spots: the House's entry (the interior, for comparison) and the yard's seven.
const SPOTS = ['houseEntry', 'houseYardPatio', 'houseYardPool', 'houseYardTramp', 'houseYardSwing', 'houseYardShed', 'houseYardNeighbor', 'houseYardGym'];
// The owner's budget with the yard in view: draw calls a whole frame (every
// pass: shadow, scene, post), fewer than this.
const DRAW_CALL_LIMIT = 60;
// Colliders the House builds with its yard (tools/test_sim_house_yard.mjs pins
// the exact layout): at least these (the patio's two glass screens gone).
const MIN_COLLIDERS = 409;

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

let runDirPath = null;
function runDir() {
  if (!runDirPath) runDirPath = mkdtempSync(join(tmpdir(), 'qm-yard-'));
  return runDirPath;
}
function removeDir(dir) {
  // Windows keeps a dead Chrome's files locked for a moment: retry, don't leak.
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* best effort */ }
}

let bootSeq = 0;
const liveChromes = new Set();

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

function startChrome(startUrl) {
  bootSeq += 1;
  const run = { port: 9780 + bootSeq, profile: join(runDir(), 'profile-' + bootSeq) };
  run.child = spawnBrowser(resolveChrome(), chromeArgs(run.port, run.profile, startUrl), {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  liveChromes.add(run);
  return run;
}

function exited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

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
    const t = setTimeout(() => { done(); reject(new Error('cdp timeout ' + method)); }, 40000);
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

// Evaluate in the page, awaiting a promise, the value back by value.
async function evaluate(ws, expression) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result ? r.result.value : undefined;
}

const CLOSE_MENU_SRC = `(function(){
  ['startMenu','feelPrompt','menuLayer','legend','audioHint','toast','panel','firstFlight'].forEach(function(id){
    var el=document.getElementById(id); if(!el)return;
    el.classList.remove('open','show'); el.style.display='none';
  });
  document.body.classList.remove('menu-open');
  var s=window._sim||{};
  if(s.looks&&s.looks.setMenuOpen)s.looks.setMenuOpen(false);
  if(window._feel&&window._feel.hideFirstRun)window._feel.hideFirstRun();
  return true;
})()`;

// Count every WebGL draw call: wrap the context's draw functions (and the
// multi-draw extension's, counted per sub-draw) once. Counting on the
// context, between two of our rAFs (queued after sim.html's loop), is a whole
// frame: the shadow pass, the scene, every composer pass, whatever
// renderer.info.autoReset does to three's own counters.
const HOOK_SRC = `(function(){
  var s=window._sim, r=s&&s.renderer; if(!r)return 'no renderer';
  if(window.__yardDc)return 'already';
  var gl=r.getContext(); var H=window.__yardDc={n:0};
  function wrap(obj,name,countOf){
    if(!obj||typeof obj[name]!=='function')return;
    var orig=obj[name];
    obj[name]=function(){H.n+=countOf?countOf(arguments):1;return orig.apply(this,arguments);};
  }
  ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','drawRangeElements'].forEach(function(n){wrap(gl,n);});
  var md=gl.getExtension('WEBGL_multi_draw');
  if(md){
    ['multiDrawArraysWEBGL','multiDrawElementsWEBGL','multiDrawArraysInstancedWEBGL','multiDrawElementsInstancedWEBGL']
      .forEach(function(n){wrap(md,n,function(a){return a[a.length-1]|0;});});
  }
  return 'ok';
})()`;

// After `settle` frames, the draw calls of each of the next `n` frames.
function framesSrc(settle, n) {
  return `new Promise(function(done){
  var H=window.__yardDc,out=[],k=0,n0=0;
  function tick(){
    k++;
    if(k===${settle})n0=H.n;
    else if(k>${settle}){out.push(H.n-n0);n0=H.n;if(out.length>=${n}){done(out);return;}}
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  setTimeout(function(){done(out);},30000);
})`;
}

const YARD_SRC = `(function(){
  var s=window._sim||{};
  var g=s.scene&&s.scene.getObjectByName('houseYardArtVisuals');
  var h=s.scene&&s.scene.getObjectByName('houseArtVisuals');
  var visible=!!g; for(var p=g;p;p=p.parent)if(p.visible===false)visible=false;
  var meshes=0; if(g)g.traverse(function(o){if(o.isMesh||o.isLineSegments)meshes++;});
  var hm=0; if(h)h.traverse(function(o){if(o.isMesh||o.isLineSegments)hm++;});
  var cols=s.colliders?s.colliders():null;
  var ys=s.yardState?s.yardState():null;
  return {group:!!g,visible:visible,yardObjects:meshes,houseObjects:hm,sibling:!!(g&&h&&g.parent===h.parent),
    colliders:cols?cols.length:null,
    yardState:!!ys,yard:ys&&ys.yard?{hazards:ys.yard.hazards,bounds:ys.yard.bounds}:null,
    map:s.map?s.map():null,core:s.core?s.core():null};
})()`;

// From a look spot: where the camera is and looks, against the spot
// (window.__yardSpots, sim.html's own LOOK_SPOTS); whether houseYardArtVisuals'
// box meets the camera frustum; and on a 7 x 7 grid of rays through the frame,
// how many hit a yard mesh first (the sky box and edge lines aside).
const THREE_SPEC = (readFileSync(join(root, 'sim.html'), 'utf8').match(/"three"\s*:\s*"([^"]+)"/) || [])[1] || 'three';
const YARD_RAYS_MIN = 10;
function VIEW_SRC(name) {
  return `import(${JSON.stringify(THREE_SPEC)}).then(function(THREE){
  var s=window._sim, c=s.camera, sp=window.__yardSpots&&window.__yardSpots[${JSON.stringify(name)}];
  if(!sp)return {error:'no spot'};
  var g=s.scene.getObjectByName('houseYardArtVisuals'); if(!g)return {error:'no yard group'};
  s.scene.updateMatrixWorld(true); c.updateMatrixWorld(true);
  var fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse));
  var gb=new THREE.Box3().setFromObject(g);
  var dir=new THREE.Vector3(); c.getWorldDirection(dir);
  var want=new THREE.Vector3(sp.target[0]-sp.pos[0],sp.target[1]-sp.pos[1],sp.target[2]-sp.pos[2]).normalize();
  var tp=new THREE.Vector3(sp.target[0],sp.target[1],sp.target[2]).project(c);
  var meshes=[]; s.scene.traverseVisible(function(o){if(o.isMesh&&o.name!=='houseSky')meshes.push(o);});
  var rc=new THREE.Raycaster(), n=0, yard=0, N=7;
  for(var i=0;i<N;i++)for(var j=0;j<N;j++){
    rc.setFromCamera(new THREE.Vector2(-0.9+1.8*i/(N-1),-0.9+1.8*j/(N-1)),c);
    var h=rc.intersectObjects(meshes,false)[0]; n++;
    if(!h)continue;
    for(var p=h.object;p;p=p.parent)if(p===g){yard++;break;}
  }
  return {cam:[c.position.x,c.position.y,c.position.z],spot:sp.pos.slice(),aim:dir.dot(want),
    targetInView:Math.abs(tp.x)<=1&&Math.abs(tp.y)<=1&&tp.z>-1&&tp.z<1,
    yardInFrustum:fr.intersectsBox(gb),rays:n,yardRays:yard};
})`;
}

test('the House\'s backyard in Chrome: boots clean, the yard built, under 60 draw calls from every yard spot, the pool and the boundary fire', { skip: SKIP ? 'SKIP_CHROME_BOOT=1' : false, timeout: 300000 }, async (t) => {
  const { server, port } = await serveRoot();
  const url = `http://127.0.0.1:${port}/sim.html?map=house&menu=1&fpv=1&quality=med`;
  const run = startChrome(url);
  let ws = null;
  try {
    const page = await waitForCdpPage(run.port, (p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url || '').includes('map=house'), 150);
    assert.ok(page, 'Chrome DevTools page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
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
          consoles.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'exception');
        }
      } catch (e) { /* ignore */ }
    });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    const href = await evaluate(ws, 'location.href');
    if (!String(href || '').includes('map=house')) {
      await cdp(ws, 'Page.navigate', { url });
      await sleep(1000);
    }
    // The map, its look and frame rate, and the bf core (it loads after first paint).
    let ready = null;
    const t0 = Date.now();
    for (let i = 0; i < 240; i++) {
      ready = await evaluate(ws, `(function(){var s=window._sim||{};var v=s.vibe?s.vibe():null;var f=s.looks&&s.looks.fps;
        return {map:s.map?s.map():null,vibe:v&&v.id,ready:!!(f&&f.ready),core:s.core?s.core():null};})()`);
      if (ready && ready.map === 'house' && ready.vibe === 'house' && ready.ready && ready.core === 'bf') break;
      await sleep(250);
    }
    t.diagnostic(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${JSON.stringify(ready)}`);
    assert.equal(ready.map, 'house', 'booted on the House');
    assert.ok(ready.ready, 'the look is ready');

    // The yard is there: its own art group beside the House's, its colliders,
    // the page's yard data (world units).
    const yard = await evaluate(ws, YARD_SRC);
    t.diagnostic('yard: ' + JSON.stringify({ ...yard, yard: undefined }));
    assert.ok(yard.group && yard.visible, 'houseYardArtVisuals in the scene, visible');
    assert.ok(yard.sibling, 'beside houseArtVisuals');
    assert.ok(yard.yardObjects > 0 && yard.yardObjects <= 20, 'yard draw objects (merged) ' + yard.yardObjects);
    assert.ok(yard.houseObjects > 0 && yard.houseObjects <= 20, 'house draw objects (merged) ' + yard.houseObjects);
    assert.ok(yard.colliders >= MIN_COLLIDERS, 'colliders ' + yard.colliders);
    if (yard.yardState) {
      assert.ok(yard.yard && yard.yard.hazards.length === 1 && yard.yard.hazards[0].kind === 'water', 'the page has the pool');
      assert.ok(yard.yard.bounds && yard.yard.bounds.soft && yard.yard.bounds.respawn, 'the page has the soft boundary');
    }

    // Fly: the menu closed, the counter on the context.
    await evaluate(ws, CLOSE_MENU_SRC);
    assert.equal(await evaluate(ws, HOOK_SRC), 'ok', 'draw counter hooked');
    // The spots from the very module sim.html runs (its stamped specifier, so
    // the same module instance, not a second copy).
    const looksSpec = (readFileSync(join(root, 'sim.html'), 'utf8').match(/from\s*"(\.\/sim-looks\.js[^"]*)"/) || [])[1];
    assert.ok(looksSpec, 'sim.html imports sim-looks.js');
    const known = await evaluate(ws, `import(${JSON.stringify(looksSpec)}).then(function(m){window.__yardSpots=m.LOOK_SPOTS;return ${JSON.stringify(SPOTS)}.filter(function(n){return !m.LOOK_SPOTS[n];});})`);
    assert.deepEqual(known, [], 'every spot in LOOK_SPOTS');
    const counts = {};
    const shots = process.env.QM_YARD_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    for (const name of SPOTS) {
      await evaluate(ws, `(function(){window._sim.setLookSpot(${JSON.stringify(name)});return true;})()`);
      const frames = await evaluate(ws, framesSrc(6, 3));
      assert.ok(Array.isArray(frames) && frames.length === 3, name + ': frames counted ' + JSON.stringify(frames));
      const view = await evaluate(ws, VIEW_SRC(name));
      assert.ok(view && !view.error, name + ': view ' + JSON.stringify(view));
      const cam = view.cam;
      counts[name] = Math.max(...frames);
      console.log(`# ${name.padEnd(18)} draw calls a frame ${frames.join(' / ')} (max ${counts[name]}), camera ${cam.map((v) => +v.toFixed(2)).join(', ')}, yard first on ${view.yardRays}/${view.rays} rays`);
      // The camera is at the spot, looking at its target: setLookSpot took.
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(cam[k] - view.spot[k]) <= 1e-3, `${name}: camera ${cam} not at the spot ${view.spot}`);
      assert.ok(view.aim >= 1 - 1e-3, `${name}: camera not looking at the spot's target (cos ${view.aim})`);
      assert.ok(view.targetInView, name + ': the spot\'s target in the frame');
      // The yard is in view: its art group in the frustum, and for a yard
      // spot the yard is the first thing hit on a good share of the frame.
      assert.ok(view.yardInFrustum, name + ': houseYardArtVisuals in the camera frustum');
      if (name !== 'houseEntry') assert.ok(view.yardRays >= YARD_RAYS_MIN, `${name}: the yard first on ${view.yardRays}/${view.rays} rays (at least ${YARD_RAYS_MIN})`);
      if (shots) {
        const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
        writeFileSync(join(shots, name + '.png'), Buffer.from(shot.data, 'base64'));
      }
    }
    for (const name of SPOTS) assert.ok(counts[name] > 0 && counts[name] < DRAW_CALL_LIMIT, `${name}: ${counts[name]} draw calls a frame (limit < ${DRAW_CALL_LIMIT})`);

    // The page's yard hooks: into the pool armed is one crash and the motors
    // cut; out past the soft line a TURN BACK, past the respawn line a reset.
    await t.test('water crash and soft boundary (window._sim.yardState)', async (st) => {
      const hooks = await evaluate(ws, `(function(){var s=window._sim||{};return ['yardState','yardWatch','placeQuadAt','tryArm','coreArmed'].filter(function(k){return typeof s[k]!=='function';});})()`);
      if (hooks.length) { st.skip('the page exposes no ' + hooks.join(', ')); return; }
      const wet = await evaluate(ws, `(function(){
        var s=window._sim, y=s.yardState().yard, h=y.hazards[0];
        var cx=(h.min.x+h.max.x)/2, cz=(h.min.z+h.max.z)/2;
        s.setLookSpot(null);
        s.placeQuadAt(cx,0,cz,0);
        var before=s.yardState().splashes;
        var armed=s.tryArm({fromAuto:true}), armedNow=s.coreArmed();
        s.yardWatch();
        var a=s.yardState();
        s.yardWatch();
        return {armed:armed,armedNow:armedNow,before:before,after:a.splashes,water:a.water,again:s.yardState().splashes,armedAfter:s.coreArmed()};
      })()`);
      st.diagnostic('water: ' + JSON.stringify(wet));
      if (!wet.armed || !wet.armedNow) { st.skip('could not arm on this page (' + JSON.stringify(wet) + ')'); return; }
      assert.equal(wet.after, wet.before + 1, 'into the water armed: one splash');
      assert.equal(wet.water, true, 'in the water');
      assert.equal(wet.again, wet.after, 'once per entry');
      assert.equal(wet.armedAfter, false, 'the motors cut');
      // With a radio (bf core), Betaflight reads the radio's ARM switch, so the
      // splash holds the ARM box's channels off until the radio shows it off.
      if ((await evaluate(ws, 'window._sim.core()')) === 'bf') {
        const hold = await evaluate(ws, `(function(){
          var s=window._sim; if(typeof s.yardHoldArm!=='function')return {missing:true};
          var arm=s.yardHoldArm(null,false).arm;
          if(!arm.length)return {noArm:true};
          var act=function(r,v){v=Math.min(2099,Math.max(900,v));return v>=r.lo&&v<r.hi;};
          var anyArm=function(a){return arm.some(function(r){return act(r,a[r.ch]);});};
          var on=new Array(12).fill(1000), off=new Array(12).fill(1000);
          arm.forEach(function(r){on[r.ch]=Math.min(2000,Math.max(1000,Math.round((r.lo+r.hi)/2)));});
          arm.forEach(function(r){for(var v=1000;v<=2000;v+=25)if(!arm.filter(function(q){return q.ch===r.ch;}).some(function(q){return act(q,v);})){off[r.ch]=v;break;}});
          var onCopy=on.slice();
          var held=s.yardHoldArm(on,true);
          var again=s.yardHoldArm(on);
          var free=s.yardHoldArm(off);
          var after=s.yardHoldArm(on);
          return {arm:arm,onArmed:anyArm(on),offArmed:anyArm(off),heldArmed:anyArm(held.aux),heldHold:held.hold,
            againArmed:anyArm(again.aux),untouched:JSON.stringify(on)===JSON.stringify(onCopy),
            freeSame:JSON.stringify(free.aux)===JSON.stringify(off),freeHold:free.hold,
            afterArmed:anyArm(after.aux),afterHold:after.hold};
        })()`);
        st.diagnostic('radio hold: ' + JSON.stringify(hold));
        assert.ok(!hold.missing, 'window._sim.yardHoldArm');
        if (!hold.noArm) {
          assert.ok(hold.onArmed && !hold.offArmed, 'the radio channels: ARM on, then off');
          assert.equal(hold.heldArmed, false, 'held: Betaflight gets ARM off with the radio\'s switch on');
          assert.equal(hold.heldHold, true, 'held until the radio shows ARM off');
          assert.equal(hold.againArmed, false, 'still held the next frame');
          assert.ok(hold.untouched, 'the radio\'s own channels unchanged');
          assert.ok(hold.freeSame && hold.freeHold === false, 'the radio\'s switch off: the hold ends, its channels as they are');
          assert.ok(hold.afterArmed && hold.afterHold === false, 'after the hold: the radio arms again');
        }
      }
      const out = await evaluate(ws, `(function(){
        var s=window._sim, B=s.yardState().yard.bounds;
        var y=1.0*3.5, z=(B.soft.min.z+B.soft.max.z)/2;
        var t0=s.yardState().turnBacks, r0=s.yardState().respawns;
        s.placeQuadAt(B.soft.min.x-B.margin/2,y,z,0);
        s.yardWatch();
        var a=s.yardState();
        s.yardWatch();
        var b=s.yardState();
        s.placeQuadAt(B.respawn.min.x-1,y,z,0);
        s.yardWatch();
        var c=s.yardState();
        return {t0:t0,r0:r0,turnBacks:a.turnBacks,out:a.out,turnBacksAgain:b.turnBacks,respawns:c.respawns,outAfter:c.out};
      })()`);
      st.diagnostic('boundary: ' + JSON.stringify(out));
      assert.equal(out.turnBacks, out.t0 + 1, 'past the soft line: TURN BACK');
      assert.equal(out.out, true);
      assert.equal(out.turnBacksAgain, out.turnBacks, 'once per exit');
      assert.equal(out.respawns, out.r0 + 1, 'past the respawn line: back to the pad');
      assert.equal(out.outAfter, false, 'back inside after the reset');
    });

    await sleep(300);
    const errors = consoles.filter(Boolean);
    assert.deepEqual(errors, [], 'console errors');
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    await stopChrome(run);
    await new Promise((res) => server.close(res));
  }
});
