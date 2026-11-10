// Names that come from outside the page are shown as text, never as markup:
// a track's name and id (a pasted track or duel code, a saved custom track),
// a rival's name (a pasted ghost code) and a controller's name (the device).
//   - In node: escapeHtml, that a code keeps a name as written (so the page
//     must be the one to show it as text), and a check of sim.html for a name
//     put into markup as written.
//   - In headless Chrome, a fresh profile each: a pilot pastes a track code
//     whose name is markup, then one whose id is, and flies each (the lap
//     HUD, the track picker and its rows, across a reload); pastes a ghost
//     code whose pilot name is markup (the HUD's VS line); and plugs in a
//     controller whose name is markup (the first-run prompt, Tune's radio
//     line). Nothing runs, and each name reads as it was written.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { encodeShare, decodeShare } from '../sim-tracks.js';
import { escapeHtml, encodeDuel, decodeQm2 } from '../sim-retention.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// A track name is 32 characters at most: room for this.
const EVIL_NAME = '<img src=x onerror="__pwn=1">';
const EVIL_ID = 'x"><img src=x onerror=__pwn=2>';
// A rival's name is 16: this runs a() where it is taken as markup.
const EVIL_PILOT = '<svg onload=a()>';
const EVIL_PAD = '<img src=x onerror=__pwn=4> pad';
const GATES = [{ x: -15, y: 4, z: -19, ry: 1.57, size: 1.9 }, { x: 15, y: 4, z: -19, ry: 1.57, size: 1.9 }];
const TRACK_NAME = { id: 'custom-evil-name', name: EVIL_NAME, map: 'rig', gates: GATES };
const TRACK_ID = { id: EVIL_ID, name: 'Plain', map: 'rig', gates: GATES };
const SAMPLES = [[0, 0, 2, 0, 0, 0, 0, 1], [100, 1, 2, 0, 0, 0, 0, 1], [200, 2, 2, 0, 0, 0, 0, 1]];

test('escapeHtml: the five characters markup is made of', () => {
  assert.equal(escapeHtml('<b a="1" c=\'2\'>&</b>'), '&lt;b a=&quot;1&quot; c=&#39;2&#39;&gt;&amp;&lt;/b&gt;');
  assert.equal(escapeHtml('Café loop_2 - v1.5'), 'Café loop_2 - v1.5', 'an honest name is untouched');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(7), '7');
});

test('a code keeps a name and an id as written, so the page shows them as text', () => {
  // A pilot may name a track "<3 loop": the code does not change it.
  let t = decodeShare(encodeShare(TRACK_NAME));
  assert.equal(t.name, EVIL_NAME);
  t = decodeShare(encodeShare(TRACK_ID));
  assert.equal(t.id, EVIL_ID);
  // A duel code carries its track the same way.
  const duel = decodeQm2(encodeDuel({ ghost: { v: 1, phys: 'x', track: TRACK_NAME.id, name: 'RyFly', lapTime: 200, samples: SAMPLES }, track: TRACK_NAME }));
  assert.equal(duel.track.name, EVIL_NAME);
});

test('the page: no name goes into markup as written', () => {
  const lines = readFileSync(join(root, 'sim.html'), 'utf8').split(/\r?\n/);
  const bad = [];
  lines.forEach((line, i) => {
    // A line of script that builds markup: a tag inside a string.
    if (!/['"`+]\s*<\/?[a-z][a-z0-9]*[ >]|<br>/i.test(line) || !/[+`]/.test(line)) return;
    // What is escaped is text.
    const rest = line.replace(/\b(?:escapeHtml|esc)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, 'TEXT');
    if (/\+\s*[\w$.]*\.name\b(?!\s*[=:(?])/.test(rest) || /[\w$)]\.name\s*\+/.test(rest) || /\+\s*gpName\b/.test(rest) || /\btrackLabel\(/.test(rest)) {
      bad.push((i + 1) + ': ' + line.trim().slice(0, 140));
    }
  });
  assert.deepEqual(bad, [], 'a name in markup goes through escapeHtml');
  // The lap HUD's track label, where it becomes markup.
  const html = lines.join('\n');
  for (const m of html.matchAll(/^.*\btrackLabel\(.*$/gm)) {
    const line = m[0];
    assert.ok(/function trackLabel\(|escapeHtml\(trackLabel\(|\.textContent=|\btoast\(trackLabel\(/.test(line), 'trackLabel as text: ' + line.trim().slice(0, 120));
  }
  // The controller's name: sim-feel.js puts it into the first-run prompt's
  // markup, so the page hands it over escaped, every time.
  const handed = [...html.matchAll(/\bfeel\.\w+\(\{[^}]*\bgpName\b[^}]*\}/g)].map((m) => m[0]);
  assert.equal(handed.length, 3, 'the three places the prompt is given a controller name');
  for (const call of handed) assert.match(call, /\bgpName:gpNameHtml\(\)/, call);
  assert.match(html, /function gpNameHtml\(\)\{return escapeHtml\(gpName\.slice\(0,40\)\);\}/);
});

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
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2',
  })[extname(p)] || 'application/octet-stream';
}

async function serveRoot() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/sim.html';
    const file = join(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    try { res.writeHead(200, { 'content-type': mime(file) }); res.end(readFileSync(file)); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  return { server, port: server.address().port };
}

let cdpSeq = 0;
function cdp(ws, method, params) {
  const id = ++cdpSeq;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 45000);
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

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// Before the page's scripts: navigator.getGamepads() with one fake pad, as
// Chrome reports it (as tools/test_sim_easy_mode.mjs).
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, id: '', mapping: '', axes: [], buttons: 0 };
  const make = () => ({ id: pads.id, index: 0, mapping: pads.mapping, connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on ? make() : null, null, null, null];
    },
  });
})()`;

// In the page: what an element holds (its tags and its text), the picker's
// rows, and a track code pasted into the builder and flown.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const look = (el) => (el ? { tags: [...new Set([...el.querySelectorAll('*')].map((e) => e.tagName))].sort(), text: el.textContent } : null);
  const rowEls = () => [...document.querySelectorAll('#menuLayer .track-list [data-tid]')];
  const rows = () => rowEls().map((b) => ({ tid: b.dataset.tid, name: b.children[0] ? b.children[0].textContent : '', kids: b.children.length, tags: look(b).tags }));
  // Set by the markup in a name, if it ever runs.
  const pwn = () => (window.__pwn === undefined ? null : window.__pwn);
  window.a = () => { window.__pwn = 3; };
  async function importAndFly(code) {
    s.openTrackPicker('rig');
    $('pickerBuild').click();
    await wait(250);
    $('builderCode').value = code;
    $('builderImport').click();
    await wait(500);
    const draft = { hud: look($('osdLap')), pwn: pwn(), track: s.track() };
    $('builderFly').click();
    await wait(800);
    return draft;
  }
  // The picker, opened, and the row with this id clicked.
  async function pick(id) {
    s.openTrackPicker('rig');
    await wait(300);
    const b = rowEls().find((x) => x.dataset.tid === id);
    if (!b) return false;
    b.click();
    await wait(800);
    return true;
  }
  window.__esc = { s, wait, $, look, rows, pwn, importAndFly, pick };
  return true;
})()`;

const onlyTags = (found, allowed) => found.filter((t) => !allowed.includes(t));

test('names as text in Chrome', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const debugPort = 9640 + (process.pid % 300);

  // A pass: a fresh Chrome profile, the given pad, the page.
  async function pass(pad, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-esc-'));
    const child = spawn(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
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
      await cdp(ws, 'Runtime.enable');
      await cdp(ws, 'Page.enable');
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      // Same origin first, for localStorage and sessionStorage before the page's scripts.
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(pad || { on: false, id: '', mapping: '', axes: [], buttons: 0 })}));
        return true;
      })()`);
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/sim.html?quality=low` });
      const boot = async () => {
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
          await sleep(250);
          try {
            ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._simQueryBooted && window._sim.openTrackPicker && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`);
          } catch (e) { /* the page is still loading */ }
        }
        assert.ok(ready, 'the page flies');
        await evaluate(ws, PAGE);
      };
      await boot();
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const F = window.__esc; ${body} })()`));
      await flow({ js, reload: async () => { await cdp(ws, 'Page.reload', {}); await boot(); } });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
      }
    }
  }

  const codeName = encodeShare(TRACK_NAME);
  const codeId = encodeShare(TRACK_ID);
  // A ghost code as COPY GHOST makes it: gzip, base64.
  const ghostCode = gzipSync(Buffer.from(JSON.stringify({ v: 1, phys: 'x', track: TRACK_NAME.id, name: EVIL_PILOT, lapTime: 12340, samples: SAMPLES }))).toString('base64');
  const HUD_TAGS = ['BR', 'SPAN'];

  try {
    await t.test('pasted track codes with markup for a name and for an id: the HUD and the picker show text, across a reload', async () => {
      await pass(null, async ({ js, reload }) => {
        // The keyboard, from the first-run prompt.
        let r = await js(`
          if (window._feel && window._feel.promptOpen && F.$('feelKeys')) F.$('feelKeys').click();
          await F.wait(400);
          const draft = await F.importAndFly(${JSON.stringify(codeName)});
          await F.wait(400);
          const hud = F.look(F.$('osdLap'));
          F.s.openTrackPicker('rig');
          await F.wait(400);
          return JSON.stringify({ draft, track: F.s.track(), map: F.s.map(), hud, rows: F.rows(), list: F.look(document.querySelector('#menuLayer .track-list')).tags, pwn: F.pwn() });
        `);
        assert.equal(r.map, 'rig');
        assert.equal(r.track, TRACK_NAME.id, 'flying the pasted track');
        assert.equal(r.draft.pwn, null, 'nothing ran while it was a draft');
        assert.deepEqual(onlyTags(r.draft.hud.tags, HUD_TAGS), [], 'the HUD over the draft is its own markup only');
        assert.equal(r.pwn, null, 'nothing in the name ran');
        assert.deepEqual(onlyTags(r.hud.tags, HUD_TAGS), [], 'the HUD is its own markup only');
        assert.ok(r.hud.text.includes(EVIL_NAME), 'the HUD shows the name as written: ' + r.hud.text);
        let row = r.rows.find((x) => x.tid === TRACK_NAME.id);
        assert.ok(row, 'the picker lists it: ' + JSON.stringify(r.rows.map((x) => x.tid)));
        assert.equal(row.name, EVIL_NAME, 'its row shows the name as written');
        assert.deepEqual([row.kids, row.tags], [2, ['SPAN']], 'a row is its name and its best time');
        assert.deepEqual(onlyTags(r.list, ['BUTTON', 'SPAN']), [], 'the list is rows only');

        // The second code: an id that would close the attribute it sits in.
        r = await js(`
          F.$('layerClose').click();
          const draft = await F.importAndFly(${JSON.stringify(codeId)});
          await F.wait(400);
          const flown = F.s.track();
          const hud = F.look(F.$('osdLap'));
          F.s.openTrackPicker('rig');
          await F.wait(400);
          const rows = F.rows();
          const list = F.look(document.querySelector('#menuLayer .track-list')).tags;
          // Back to the first by its row, then to this one by its row.
          const a = await F.pick(${JSON.stringify(TRACK_NAME.id)});
          const onA = F.s.track();
          const b = await F.pick(${JSON.stringify(EVIL_ID)});
          const onB = F.s.track();
          const hudB = F.look(F.$('osdLap'));
          return JSON.stringify({ draft, flown, hud, rows, list, a, onA, b, onB, hudB, pwn: F.pwn() });
        `);
        assert.equal(r.flown, EVIL_ID, 'flying the second pasted track');
        assert.equal(r.pwn, null, 'nothing in the id ran');
        assert.deepEqual(onlyTags(r.draft.hud.tags, HUD_TAGS), [], 'the HUD over the draft, which shows its id');
        assert.deepEqual(onlyTags(r.hud.tags, HUD_TAGS), []);
        row = r.rows.find((x) => x.tid === EVIL_ID);
        assert.ok(row, 'its row carries the id whole: ' + JSON.stringify(r.rows.map((x) => x.tid)));
        assert.deepEqual([row.name, row.kids, row.tags], ['Plain', 2, ['SPAN']]);
        assert.deepEqual(onlyTags(r.list, ['BUTTON', 'SPAN']), [], 'the list is rows only');
        assert.deepEqual([r.a, r.onA], [true, TRACK_NAME.id], 'a row with markup for a name flies its track');
        assert.deepEqual([r.b, r.onB], [true, EVIL_ID], 'a row with markup for an id flies its track');
        assert.ok(r.hudB.text.includes('Plain'), r.hudB.text);

        // A pasted ghost code: its pilot's name on the HUD's VS line.
        r = await js(`
          await F.pick(${JSON.stringify(TRACK_NAME.id)});
          F.$('ghostCode').value = ${JSON.stringify(ghostCode)};
          F.$('btnGhostLoad').click();
          await F.wait(1200);
          return JSON.stringify({ track: F.s.track(), hud: F.look(F.$('osdLap')), toast: F.$('toast').textContent, pwn: F.pwn() });
        `);
        assert.equal(r.track, TRACK_NAME.id);
        assert.ok(r.hud.text.includes('VS ' + EVIL_PILOT), 'the rival is on the HUD by the name as written: ' + r.hud.text + ' / ' + r.toast);
        assert.deepEqual(onlyTags(r.hud.tags, HUD_TAGS), [], 'the VS line is its own markup only');
        assert.equal(r.pwn, null, 'nothing in the pilot name ran');

        // Saved: the same after a reload.
        await reload();
        r = await js(`
          await F.wait(600);
          const hud = F.look(F.$('osdLap'));
          F.s.openTrackPicker('rig');
          await F.wait(500);
          return JSON.stringify({ track: F.s.track(), hud, rows: F.rows(), list: F.look(document.querySelector('#menuLayer .track-list')).tags, pwn: F.pwn() });
        `);
        assert.equal(r.pwn, null, 'nothing ran on the way back in');
        assert.deepEqual(onlyTags(r.hud.tags, HUD_TAGS), []);
        assert.deepEqual(onlyTags(r.list, ['BUTTON', 'SPAN']), []);
        assert.equal((r.rows.find((x) => x.tid === TRACK_NAME.id) || {}).name, EVIL_NAME, 'the saved track, by its name as written');
        assert.ok(r.rows.find((x) => x.tid === EVIL_ID), 'the saved track, by its id whole');
      });
    });

    await t.test('a controller whose name is markup: the first-run prompt and the radio line show text', async () => {
      await pass({ on: true, id: EVIL_PAD, mapping: '', axes: [0, 0, 0, 0], buttons: 0 }, async ({ js }) => {
        const r = await js(`
          // A stick moved, for a page that waits on one.
          window.__pads.axes[0] = 0.6;
          await F.wait(500);
          window.__pads.axes[0] = 0;
          await F.wait(1200);
          return JSON.stringify({ open: !!(window._feel && window._feel.promptOpen), prompt: F.look(F.$('feelPrompt')), radio: F.look(F.$('radioInfo')), pwn: F.pwn() });
        `);
        assert.equal(r.pwn, null, 'nothing in the controller name ran');
        assert.ok(r.radio.text.includes(EVIL_PAD), 'the radio line shows the name as written: ' + r.radio.text);
        assert.deepEqual(onlyTags(r.radio.tags, ['B', 'BR']), [], 'the radio line is its own markup only');
        assert.equal(r.open, true, 'a pad that is not a known radio gets the prompt');
        assert.ok(r.prompt.text.includes(EVIL_PAD), 'the prompt shows the name as written: ' + r.prompt.text.slice(0, 160));
        assert.deepEqual(onlyTags(r.prompt.tags, ['BUTTON', 'DIV', 'H1', 'P']), [], 'the prompt is its own markup only');
      });
    });
  } finally {
    server.close();
  }
});
