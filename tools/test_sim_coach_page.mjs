// Headless Chrome: Coach on the Rig, in the page. Boots The Rig on the bf
// core with saved coach progress (bronze up to the loft dive, so all six Rig
// drills are open, and a gold on an old-map drill), then:
//   - the Coach picker lists the six Rig drills alone, each with its medal
//     times; with ?dev=1 the old maps' seven after them;
//   - each Rig drill launches on the Rig (no loop gates), the quad on its
//     pad, its markers and the flown line's ribbon in the scene, the HUD
//     showing the gold time;
//   - the tunnel, flown in the page by the coach lines' own autopilot
//     (tools/coach_rig_autopilot.mjs, sticks every 4 ms through
//     _sim.setTestStick, Space through CDP), ends in a medal on the coach
//     card, saved, and the old-map gold is still saved beside it;
//   - ?drill=hover-hold without ?dev=1 does not launch it: the picker opens
//     on the Rig;
//   - zero console errors.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); skipped under
// SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DRILLS, RIG_COURSES, drillSpawn, medalTimes, medalTimesText, COACH_KEY } from '../sim-coach.js';
import { toModule } from '../sim-core-adapter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RIG_IDS = DRILLS.filter((d) => d.map === 'rig').map((d) => d.id);

function resolveChrome() {
  const names = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'chrome'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
    '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
  })[extname(p)] || 'application/octet-stream';
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
  return { server, port: server.address().port };
}

let cdpSeq = 0;
function cdp(ws, method, params) {
  const id = ++cdpSeq;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 30000);
    function on(msg) {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
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

async function evaluate(ws, expression) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
  return r.result ? r.result.value : undefined;
}

async function press(ws, key, code, vk) {
  const text = key.length === 1 ? key : undefined;
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text });
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
}

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// Saved before the page's first script: bronze up to the loft dive (all six
// Rig drills open) and a gold on an old-map drill. Once a tab (session).
const SEED = {
  v: 1, ribbon: true, lastDrill: null, ghosts: {}, best: {},
  medals: { 'tower-climb': 'bronze', 'pipe-slit': 'bronze', 'crate-slalom': 'bronze', tunnel: 'bronze', 'loft-dive': 'bronze', 'hover-hold': 'gold' },
};

async function booted(ws) {
  for (let i = 0; i < 200; i++) {
    await sleep(250);
    const ok = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._coach && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._sim.tracks)`);
    if (ok) { await sleep(1500); return true; }
  }
  return false;
}

const pickerRows = `(function(){
  document.getElementById('menuCoach').click();
  var rows=[].map.call(document.querySelectorAll('#menuLayer .coach-row'),function(b){return {id:b.dataset.drill,locked:b.disabled,text:b.textContent};});
  return JSON.stringify({rows:rows,html:document.getElementById('menuLayer').innerHTML});
})()`;

test('Coach on the Rig in the page: the picker, six drills on their pads, the tunnel flown to a medal, old drills dev-only', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-coach-'));
  const debugPort = 9300 + (process.pid % 300);
  const url = (q) => `http://127.0.0.1:${port}/sim.html?map=rig&quality=low&menu=1&fpv=1${q || ''}`;
  const child = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-webgl', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--window-size=640,360', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  try {
    let page = null;
    for (let i = 0; i < 100 && !page; i++) {
      await sleep(200);
      try {
        const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    const errors = [];
    ws.addEventListener('message', (msg) => {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        const text = (args) => (args || []).map((a) => a.value || a.description || '').join(' ');
        if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'error') errors.push(text(o.params.args));
        if (o.method === 'Runtime.exceptionThrown') {
          const ex = o.params.exceptionDetails || {};
          errors.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'exception');
        }
      } catch (e) { /* ignore */ }
    });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Page.enable');
    await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `try{if(!sessionStorage.getItem('qmCoachSeed')){localStorage.setItem(${JSON.stringify(COACH_KEY)},${JSON.stringify(JSON.stringify(SEED))});sessionStorage.setItem('qmCoachSeed','1');}}catch(e){}`,
    });
    await cdp(ws, 'Page.navigate', { url: url() });
    assert.ok(await booted(ws), 'the page never booted on the bf core');

    // The picker: the six Rig drills, their medal times, no old drill.
    const pick = JSON.parse(await evaluate(ws, pickerRows));
    assert.deepEqual(pick.rows.map((r) => r.id), RIG_IDS);
    assert.ok(pick.rows.every((r) => !r.locked), 'all six open on the seeded bronzes');
    for (const r of pick.rows) {
      const tm = medalTimes(r.id);
      assert.ok(r.text.includes('Gold ' + tm.gold.toFixed(2)) && r.text.includes('bronze ' + tm.bronze.toFixed(2)), r.id + ' medal times on its row');
    }
    assert.ok(!pick.html.includes('Old maps'), 'no old-map ladder without ?dev=1');

    // Each drill: on the Rig, no loop gates, the quad on its pad, the
    // markers and the ribbon, the gold time on the HUD.
    for (const id of RIG_IDS) {
      await evaluate(ws, `(function(){document.getElementById('menuCoach').click();document.querySelector('.coach-row[data-drill="${id}"]').click();return true;})()`);
      await sleep(1200);
      const got = JSON.parse(await evaluate(ws, `(function(){
        var g=window._sim.scene.getObjectByName('w4Coach'), cs=window._sim.coreState();
        return JSON.stringify({map:window._sim.map(),track:window._sim.track(),id:window._coach.currentId(),phase:window._coach.phase(),
          pos:{x:cs.position.x,y:cs.position.y,z:cs.position.z},armed:cs.armed,
          kids:g?g.children.length:0,ribbon:!!(g&&g.getObjectByName('coachRibbon')),
          hud:document.getElementById('coachHud').classList.contains('show'),meta:document.getElementById('coachMeta').textContent,
          title:document.getElementById('coachTitle').textContent});
      })()`));
      const sp = drillSpawn(id);
      const want = toModule({ x: sp.x, y: sp.y, z: sp.z }, {});
      assert.equal(got.map, 'rig', id);
      assert.equal(got.track, 'rig-freestyle', id);
      assert.equal(got.id, id);
      assert.equal(got.phase, 'arm', id);
      assert.equal(got.armed, false, id);
      assert.ok(Math.hypot(got.pos.x - want.x, got.pos.y - want.y) < 0.03, `${id}: on its pad (${JSON.stringify(got.pos)} vs ${JSON.stringify(want)})`);
      assert.ok(got.pos.z < want.z + 0.01 && got.pos.z > want.z - 0.08, `${id}: resting on it (z ${got.pos.z})`);
      assert.ok(got.kids >= RIG_COURSES[id].gates.length + 2, `${id}: ${got.kids} markers`);
      assert.ok(got.ribbon, id + ': the flown line\'s ribbon');
      assert.ok(got.hud, id + ': the coach card');
      assert.ok(got.meta.includes(medalTimesText(medalTimes(id))), id + ': ' + got.meta);
    }

    // The tunnel, flown in the page: the coach card gives a medal and it is saved.
    await evaluate(ws, `(function(){document.getElementById('menuCoach').click();document.querySelector('.coach-row[data-drill="tunnel"]').click();return true;})()`);
    await sleep(1500);
    await evaluate(ws, `import('/tools/coach_rig_autopilot.mjs').then(function(A){
      var s=window._sim, path=A.buildPath(A.PLANS.tunnel), mem=A.trackerMemory();
      var F=window.__fly={done:false,error:null,polls:0};
      s.setTestStick({r:0,p:0,y:0,t:0});
      var id=setInterval(function(){
        try{
          if(window._coach.phase()==='result'){clearInterval(id);s.setTestStick({r:0,p:0,y:0,t:0});F.done=true;return;}
          var cs=s.coreState(); if(!cs.armed)return;
          var c=A.track(path,A.sceneState(cs),mem,{});
          s.setTestStick({r:c.r,p:c.p,y:c.y,t:c.t}); F.polls++;
        }catch(e){F.error=String(e&&e.stack||e);clearInterval(id);}
      },4);
      return true;
    })`);
    // The first-run prompt and any menu out of the way (as the sound test),
    // then Space, a real key, arms.
    await evaluate(ws, `(function(){
      ['startMenu','feelPrompt','menuLayer','toast','panel'].forEach(function(id){
        var el=document.getElementById(id); if(!el)return;
        el.classList.remove('open','show'); el.style.display='none';
      });
      document.body.classList.remove('menu-open');
      if(window._sim.looks.setMenuOpen) window._sim.looks.setMenuOpen(false);
      if(window._feel&&window._feel.hideFirstRun) window._feel.hideFirstRun();
      return true;
    })()`);
    await sleep(300);
    await cdp(ws, 'Page.bringToFront');
    let armed = null;
    for (let k = 0; k < 3 && !(armed && armed.armed); k++) {
      await press(ws, ' ', 'Space', 32);
      await sleep(800);
      armed = JSON.parse(await evaluate(ws, `JSON.stringify({armed:window._sim.coreState().armed,flags:window._sim.coreState().armingDisableFlags,phase:window._coach.phase()})`));
    }
    assert.ok(armed.armed, 'Space armed the quad: ' + JSON.stringify(armed));
    let fly = null;
    for (let i = 0; i < 120; i++) {
      await sleep(500);
      fly = JSON.parse(await evaluate(ws, `JSON.stringify(window.__fly)`));
      if (fly.done || fly.error) break;
    }
    const after = JSON.parse(await evaluate(ws, `JSON.stringify({title:document.getElementById('coachTitle').textContent,msg:document.getElementById('coachMsg').textContent,
      actions:document.getElementById('coachActions').classList.contains('show'),saved:JSON.parse(localStorage.getItem(${JSON.stringify(COACH_KEY)}))})`));
    await evaluate(ws, `window._sim.setTestStick(null), true`);
    assert.equal(fly.error, null, 'the in-page pilot: ' + fly.error);
    assert.ok(fly.done, `the tunnel finished (${fly.polls} polls; ${after.title} / ${after.msg})`);
    const medal = after.saved.medals.tunnel;
    assert.ok(['bronze', 'silver', 'gold'].includes(medal), `a medal on the tunnel: ${after.title} / ${after.msg}`);
    assert.match(after.title, /^Tunnel — (GOLD|SILVER|BRONZE)$/);
    assert.match(after.msg, /^Time \d+\.\d\d s · score \d+$/);
    assert.ok(after.actions, 'Retry / Next / Menu');
    assert.ok(after.saved.best.tunnel && after.saved.ghosts.tunnel && after.saved.ghosts.tunnel.length >= 2, 'best run and its ghost saved');
    assert.equal(after.saved.medals['hover-hold'], 'gold', 'the old-map gold is kept');
    console.log(`in-page tunnel: ${after.msg} (${after.title}); the flown line's gold ${medalTimes('tunnel').gold.toFixed(2)} s`);

    // ?drill= for an old-map drill without ?dev=1: not launched, the picker on the Rig.
    await cdp(ws, 'Page.navigate', { url: url('&drill=hover-hold') });
    assert.ok(await booted(ws), 'the page never booted again');
    const old = JSON.parse(await evaluate(ws, `JSON.stringify({active:window._coach.isActive(),map:window._sim.map(),
      rows:document.querySelectorAll('#menuLayer .coach-row').length,saved:JSON.parse(localStorage.getItem(${JSON.stringify(COACH_KEY)}))})`));
    assert.equal(old.active, false, 'hover-hold not launched');
    assert.equal(old.map, 'rig');
    assert.equal(old.rows, RIG_IDS.length, 'the Coach picker instead');
    assert.equal(old.saved.medals['hover-hold'], 'gold');
    assert.ok(['bronze', 'silver', 'gold'].includes(old.saved.medals.tunnel));

    // ?dev=1: the old maps' seven after the Rig's six.
    await cdp(ws, 'Page.navigate', { url: url('&dev=1') });
    assert.ok(await booted(ws), 'the page never booted with ?dev=1');
    const dev = JSON.parse(await evaluate(ws, pickerRows));
    assert.deepEqual(dev.rows.map((r) => r.id), DRILLS.map((d) => d.id));
    assert.ok(dev.html.includes('Old maps'));
    assert.equal(dev.rows.find((r) => r.id === 'hover-hold').text.includes('GOLD'), true, 'its saved gold shows there');

    assert.deepEqual(errors.filter((e) => !/cloudflareinsights\.com/.test(e)), [], 'console errors');
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    killTree(child);
    await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
    await new Promise((res) => server.close(res));
    for (let i = 0; i < 10; i++) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
    }
  }
});
