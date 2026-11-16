// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// A shared track from the URL: the builder's Share copies
// sim.html?map=<map>#trk=<QM2 code> (sim-tracks.js trackLink), and opening it
// flies that track (sim.html applyTrackLink).
//   - In node: the link and its fragment, a line in the fragment winning, ids
//     a link may not carry, names, bad codes, and how many gates fit a link.
//   - In headless Chrome, fresh profiles: a pilot builds a track (the lap
//     length counting as each gate goes down) and Share puts the link on the
//     clipboard and the bare code in the box; a link past LINE_URL_MAX copies
//     the code. A second fresh profile, no account, opens the link: the track,
//     raced gate to gate to the finish, never saved until the pilot saves it.
//     A bad code, an empty one, a line beside it, a closed map and a
//     built-in course's id each do what they should, and the page boots.
//   node tools/test_sim_track_url.mjs
// The Chrome part needs CHROME set to a Chrome binary locally, and is skipped
// with SKIP_CHROME_BOOT=1 (the sim-tests job).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  TRACK_PARAM, SHARE_PREFIX, CUSTOM_TRACKS_KEY, SELECTED_TRACK_KEY,
  trackLink, trackCodeFromHash, trackFromLinkCode, encodeShare, decodeShare, isFreestyleTrackId,
} from '../sim-tracks.js';
import { LINE_URL_MAX, lineFromHash } from '../sim-share.js';
import { WS } from '../sim-core-adapter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'sim.html'), 'utf8');

// A function's source in sim.html, braces matched.
function extract(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() not found in sim.html`);
  let i = html.indexOf('{', start), depth = 0, end = -1;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  assert.notEqual(end, -1, `${name}() has unbalanced braces`);
  return html.slice(start, end);
}

// A builder track as the builder makes one: n gates round a loop on the map.
function built(n = 3, extra = {}) {
  const gates = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: +(Math.cos(a) * 4).toFixed(2) + 0, y: 1.2, z: +(Math.sin(a) * 4).toFixed(2) + 0, ry: +(a + 1.57).toFixed(2), size: 1.8, solid: false };
  });
  return { id: 'custom-mhx3k2a1', map: 'rig', name: 'Desk loop', gates, flags: [], ...extra };
}

test('the link: the map in the query, the code in #trk= as it is', () => {
  const code = encodeShare(built());
  const link = trackLink({ origin: 'https://quadmath.com', path: '/sim.html', map: 'rig', code });
  assert.equal(TRACK_PARAM, 'trk');
  assert.equal(link, 'https://quadmath.com/sim.html?map=rig#trk=' + code);
  const u = new URL(link);
  assert.equal(u.searchParams.get('map'), 'rig');
  assert.equal(trackCodeFromHash(u.hash), code, 'read back whole');
  assert.equal(trackLink({ origin: 'https://q.x', path: '/sim.html', map: 'gym', dev: true, code: 'QM2.A' }), 'https://q.x/sim.html?map=gym&dev=1#trk=QM2.A', 'a closed map: dev=1');
  assert.equal(trackLink({ origin: '', path: '', map: 'a b', code: 'QM2.A' }), '/sim.html?map=a%20b#trk=QM2.A');
});

test('the fragment: the trk code, base64 as it is or percent-encoded; a line wins', () => {
  const code = 'QM2.eyJ2IjoxfQ+/x=';
  assert.equal(trackCodeFromHash('#trk=' + code), code, '+ / = kept (never URLSearchParams)');
  assert.equal(trackCodeFromHash('trk=' + code), code);
  assert.equal(trackCodeFromHash('#a=1&trk=' + code + '&b=2'), code);
  assert.equal(trackCodeFromHash('#trk=' + encodeURIComponent(code)), code, 'a chat app encoded it');
  assert.equal(trackCodeFromHash('#trk=%E0%A4%A'), '%E0%A4%A', 'a broken escape: as it is (decodeShare refuses it)');
  assert.equal(trackCodeFromHash('#trk='), '', 'empty: a bad code, not none');
  assert.equal(trackCodeFromHash('#trk'), '');
  for (const none of ['', '#', '#foo=1', '#track=1', '#trkx=QM2.A', null, undefined]) assert.equal(trackCodeFromHash(none), null, String(none));
  // #line= beside it, before or after, valid or not: the line wins.
  assert.equal(trackCodeFromHash('#line=L1.AAAA&trk=' + code), null);
  assert.equal(trackCodeFromHash('#trk=' + code + '&line=@abcdefghijkl'), null);
  assert.equal(trackCodeFromHash('#line=&trk=' + code), null);
  assert.equal(lineFromHash('#line=L1.AAAA&trk=' + code), 'L1.AAAA', 'and the line link still reads its own');
});

test('a link\'s track: the builder\'s id and gates kept; ids a link may not carry, renamed; names as plain text', () => {
  const t = built(4);
  const back = trackFromLinkCode(encodeShare(t));
  assert.equal(back.id, t.id);
  assert.equal(back.map, 'rig');
  assert.equal(back.name, 'Desk loop');
  assert.equal(back.gates.length, 4);
  assert.deepEqual(back.gates.map((g) => [g.x, g.z, g.ry]), t.gates.map((g) => [g.x, g.z, g.ry]));
  // A built-in course's id, a generated one (daily, weekly: their boards),
  // freestyle, room practice: never flown by its id from a link.
  const ids = ['rig-loop', 'city-loop', '0', '1', 'daily-2026-11-15', 'weekly-2026-W46', 'weekly', 'daily', 'rig-freestyle', 'room-practice', 'custom', 'custom-', 'custom-a/b', 'x'.repeat(60), '<img src=x>'];
  const seen = new Set();
  for (const id of ids) {
    const r = trackFromLinkCode(encodeShare(built(3, { id })));
    assert.match(r.id, /^custom-shared-[0-9a-z]+$/, id);
    assert.equal(isFreestyleTrackId(r.id), false, id);
    assert.equal(r.legacyId, null, id);
    seen.add(r.id);
  }
  assert.equal(seen.size, 1, 'the same gates: the same id, whatever id came with them');
  assert.notEqual(trackFromLinkCode(encodeShare(built(5, { id: 'rig-loop' }))).id, [...seen][0], 'other gates: another id');
  // Names: text, without control or direction characters.
  assert.equal(trackFromLinkCode(encodeShare(built(3, { name: 'Ry‮Fly\u0000 loop‏' }))).name, 'RyFly loop');
  assert.equal(trackFromLinkCode(encodeShare(built(3, { name: '‮\u0007' }))).name, 'Custom');
  assert.equal(trackFromLinkCode(encodeShare(built(3, { name: '<b>x</b>' }))).name, '<b>x</b>', 'markup stays text (the page writes names as text)');
});

test('bad codes throw BAD TRACK CODE, whatever is wrong with them', () => {
  const one = SHARE_PREFIX + Buffer.from(JSON.stringify({ v: 1, id: 'custom-a', n: 'x', m: 'rig', g: [[0, 1, 0, 0, 1.8, 0]], f: [] })).toString('base64');
  for (const bad of ['', '   ', 'QM2.', 'QM2.!!!!', 'QM2.' + Buffer.from('not json').toString('base64'), 'QM2.' + Buffer.from('{"v":2,"g":[]}').toString('base64'), one, '{', '{"v":1}', 'L1.AAAA', '%E0%A4%A']) {
    assert.throws(() => trackFromLinkCode(bad), /^Error: BAD TRACK CODE$/, JSON.stringify(bad));
  }
});

test('a link fits about thirty gates in LINE_URL_MAX; a bigger track is past it', () => {
  const base = { origin: 'https://quadmath.com', path: '/sim.html', map: 'rig' };
  const len = (n) => trackLink({ ...base, code: encodeShare(built(n)) }).length;
  assert.ok(len(12) <= LINE_URL_MAX, '12 gates: ' + len(12));
  assert.ok(len(24) <= LINE_URL_MAX, '24 gates: ' + len(24));
  assert.ok(len(60) > LINE_URL_MAX, '60 gates: ' + len(60));
});

test('sim.html: Share copies the link and keeps the code in the box; boot reads #trk= before #line=; nothing saved', () => {
  const share = html.slice(html.indexOf("document.getElementById('builderShare').onclick"), html.indexOf("document.getElementById('builderImport').onclick"));
  assert.match(share, /ta\.value=code;/, 'the bare code in the box');
  assert.match(share, /trackLink\(\{origin:location\.origin,path:location\.pathname,map,dev:linkNeedsDev\(map,builder\.draft\.id\),code\}\)/);
  assert.match(share, /link\.length<=lineUrlMax/, 'LINE_URL_MAX (lowered by a test with setLineUrlMax)');
  assert.match(share, /writeText\(fits\?link:code\)/);
  assert.ok(share.includes("'TRACK TOO BIG FOR A LINK — CODE COPIED'"));
  const apply = extract('applyTrackLink');
  assert.match(apply, /trackCodeFromHash\(location\.hash\)/);
  assert.match(apply, /trackFromLinkCode\(code\)/);
  assert.ok(apply.includes("toast('BAD TRACK CODE')"));
  assert.match(apply, /if\(!mapOpen\(t\.map,DEV_UI\)\)\{archivedToRig\(\);return;\}/, 'Import\'s map check');
  assert.match(apply, /setMap\(t\.map,t\.id,\{save:false\}\)/);
  assert.ok(apply.includes("toast('SHARED TRACK: '+t.name"));
  assert.doesNotMatch(apply, /saveCustomTracks|localStorage|saveSelected/, 'this session\'s only');
  // Boot: after the query's map, before the line link (tools/test_sim_share.mjs pins the line link last).
  assert.match(extract('applyQueryBoot'), /applyTrackLink\(\);\s+syncMenuSparks\(\);\s+syncBuildUI\(\);\s+applyLineLink\(\);\s+\}$/);
});

// ---- headless Chrome ----

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

// Before the page's scripts: every toast the page shows, in order (a later
// boot toast covers an earlier one on screen).
const TOASTS = String.raw`(() => {
  window.__toasts = [];
  const hook = () => {
    const el = document.getElementById('toast');
    if (!el) return false;
    new MutationObserver(() => {
      const t = el.textContent;
      if (t && window.__toasts[window.__toasts.length - 1] !== t) window.__toasts.push(t);
    }).observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
})()`;

const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(16); }
    return !!fn();
  };
  const $ = (id) => document.getElementById(id);
  // The quad put at each gate of the active track in turn (the bf core's own
  // teleport, as tools/test_sim_share.mjs flies the Rig Loop).
  async function flyGates(ws) {
    const track = s.tracks().find((t) => t.id === s.track());
    const b = s.bfCore();
    const counter = () => (/ GATE (\d+)\//.exec($('osdGate').textContent) || [])[1];
    for (const g of track.gates) {
      const before = counter();
      const put = (up) => b.teleport({ x: -g.z / ws, y: -g.x / ws, z: (g.y + up) / ws }, { x: 0, y: 0, z: 0, w: 1 });
      put(0);
      let counted = await until(() => counter() !== before, 600);
      for (let i = 0; i < 3 && !counted; i++) {
        put(3 * (g.size || 2));
        await wait(120);
        put(0);
        counted = await until(() => counter() !== before, 600);
      }
      await wait(150);
    }
    const done = await until(() => !!$('toastShare'), 3000);
    return { gates: track.gates.length, done, toast: $('toast').textContent };
  }
  function landed() {
    const t = s.tracks().find((x) => x.id === s.track()) || null;
    let sel = null;
    try { sel = localStorage.getItem('${SELECTED_TRACK_KEY}'); } catch (e) { /* none */ }
    return {
      map: s.map(), track: s.track(), gates: t ? t.gates.length : 0, name: t ? t.name : null,
      toasts: window.__toasts.slice(), custom: localStorage.getItem('${CUSTOM_TRACKS_KEY}'), selected: sel,
      menu: document.body.classList.contains('menu-open'), banner: $('lineBanner').textContent, err: s.artError(),
    };
  }
  window.__tu = { s, wait, until, $, flyGates, landed };
  return true;
})()`;

test('a shared track link in Chrome', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;

  // A pass: a fresh Chrome profile and storage, the page at url; go() opens
  // another url in the same profile.
  async function pass(url, seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-trk-'));
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=1280,720',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let ws = null;
    try {
      let debugPort = 0;
      for (let i = 0; i < 100 && !debugPort; i++) {
        await sleep(100);
        try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
      }
      assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
      let page = null;
      for (let i = 0; i < 100 && !page; i++) {
        await sleep(100);
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
      await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: TOASTS });
      await cdp(ws, 'Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        return true;
      })()`);
      const go = async (to, { bf = false } = {}) => {
        await cdp(ws, 'Page.navigate', { url: to });
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
          await sleep(250);
          try {
            ready = await evaluate(ws, `!!(window._sim && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._ttff${bf ? " && window._sim.core() === 'bf'" : ''})`);
          } catch (e) { /* the page is still loading */ }
        }
        assert.ok(ready, 'the page booted: ' + to.slice(0, 120));
        await evaluate(ws, PAGE);
        await sleep(400);
      };
      await go(url, seed);
      await cdp(ws, 'Emulation.setFocusEmulationEnabled', { enabled: true });
      await cdp(ws, 'Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const S = window.__tu; ${body} })()`));
      // A real click at (x, y), or at an element's middle when it is what is there.
      const mouse = async (x, y) => {
        await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      };
      const click = async (id) => {
        const p = JSON.parse(await evaluate(ws, `(() => {
          const el = document.getElementById(${JSON.stringify(id)});
          if (!el) return JSON.stringify({ found: false });
          const b = el.getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          return JSON.stringify({ found: true, x, y, hit: document.elementFromPoint(x, y) === el });
        })()`));
        assert.ok(p.found && p.hit, id + ' is there to click ' + JSON.stringify(p));
        await mouse(p.x, p.y);
      };
      await flow({ js, click, mouse, go });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
      }
    }
  }

  const sim = (query) => `${origin}/sim.html?quality=low&${query}`;
  const KEYS = { quadmathSimInputChoice: 'keyboard' };
  let link = null, code = null;

  try {
    await t.test('a fresh profile builds a track: the lap length counts as each gate goes down; Share copies the link, the box keeps the code', async () => {
      await pass(sim('map=rig&builder=1'), { storage: KEYS }, async ({ js, click, mouse }) => {
        let r = await js(`await S.until(() => document.body.classList.contains('builder-on'), 5000); return JSON.stringify({ on: document.body.classList.contains('builder-on'), len: S.$('builderLen').textContent, n: S.$('builderList').querySelectorAll('li[data-kind="gate"]').length });`);
        assert.equal(r.on, true, 'the builder is open');
        const lens = [];
        // Three gates, each a real click on the floor in the builder's view.
        for (const [x, y] of [[640, 300], [470, 380], [810, 380]]) {
          const before = r.n;
          await mouse(x, y);
          r = await js(`await S.wait(250); return JSON.stringify({ len: S.$('builderLen').textContent, n: S.$('builderList').querySelectorAll('li[data-kind="gate"]').length });`);
          assert.equal(r.n, before + 1, `a gate at ${x},${y}`);
          lens.push(r.len);
        }
        assert.equal(lens[0], 'place 2+ gates');
        assert.match(lens[1], /^\d+\.\d m$/, 'two gates: a lap length');
        assert.match(lens[2], /^\d+\.\d m$/);
        assert.notEqual(lens[2], lens[1], 'the third gate changed it, live');

        await js(`await navigator.clipboard.writeText('nothing yet'); window.__toasts.length = 0; return 1;`);
        await click('builderShare');
        r = await js(`await S.until(() => /COPIED|COPY/.test(S.$('toast').textContent), 3000); let clip = null; try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'unreadable ' + e.message; }
          return JSON.stringify({ toast: S.$('toast').textContent, clip, link: S.s.trackLink(), box: S.$('builderCode').value, custom: localStorage.getItem('${CUSTOM_TRACKS_KEY}') });`);
        assert.equal(r.toast, 'TRACK LINK COPIED');
        assert.equal(r.clip, r.link, 'the link is on the clipboard');
        assert.match(r.link, new RegExp('^' + origin.replace(/\./g, '\\.') + '/sim\\.html\\?map=rig#trk=QM2\\.[A-Za-z0-9+/=]+$'));
        assert.equal(r.box, trackCodeFromHash(new URL(r.link).hash), 'the bare code stays in the box');
        assert.ok(r.link.length <= LINE_URL_MAX);
        assert.equal(r.custom, null, 'Share saves nothing');
        const t3 = decodeShare(r.box);
        assert.equal(t3.gates.length, 3);
        assert.equal(t3.map, 'rig');
        link = r.link; code = r.box;

        // Past the link limit: the code alone, said so.
        await js(`S.s.setLineUrlMax(60); await navigator.clipboard.writeText('nothing yet'); return 1;`);
        await click('builderShare');
        r = await js(`await S.until(() => /TOO BIG/.test(S.$('toast').textContent), 3000); return JSON.stringify({ toast: S.$('toast').textContent, clip: await navigator.clipboard.readText(), link: S.s.trackLink(), box: S.$('builderCode').value });`);
        assert.equal(r.toast, 'TRACK TOO BIG FOR A LINK — CODE COPIED');
        assert.equal(r.clip, code, 'the code, not a link');
        assert.equal(r.box, code);
        assert.equal(r.link, '');
        await js(`S.s.setLineUrlMax(0); return 1;`);
      });
    });

    await t.test('another fresh profile, no account, opens the link: the shared track, raced to the finish, saved only when the pilot saves it', async () => {
      assert.ok(link, 'the link from the build');
      const name = decodeShare(code).name;
      const id = decodeShare(code).id;
      await pass(link.replace('?', '?quality=low&'), { storage: KEYS, bf: true }, async ({ js, click, go }) => {
        let r = await js(`return JSON.stringify(S.landed());`);
        assert.ok(r.toasts.includes('SHARED TRACK: ' + name), 'said so: ' + JSON.stringify(r.toasts));
        assert.equal(r.map, 'rig');
        assert.equal(r.track, id, 'the shared track is the race');
        assert.equal(r.gates, 3);
        assert.equal(r.menu, false, 'straight to the track');
        assert.equal(r.custom, null, 'not saved');
        assert.ok(!String(r.selected || '').includes(id), 'not the saved selection either: ' + r.selected);
        assert.equal(r.err, null);
        r = await js(`return JSON.stringify(await S.flyGates(${WS}));`);
        assert.equal(r.done, true, 'raced to the finish: ' + r.toast);
        r = await js(`return JSON.stringify(S.landed());`);
        assert.equal(r.custom, null, 'still not saved after a run');
        // The pilot saves it: the builder (a copy of the track flown) and Save local.
        r = await js(`S.s.openTrackPicker('rig'); await S.wait(300); S.$('pickerBuild').click(); await S.wait(400);
          S.$('builderSave').click(); await S.wait(200); return JSON.stringify({ toast: S.$('toast').textContent, custom: JSON.parse(localStorage.getItem('${CUSTOM_TRACKS_KEY}') || '[]') });`);
        assert.match(r.toast, /^SAVED LOCAL \(3 gates\)$/);
        assert.equal(r.custom.length, 1, 'saved when the pilot saves');
        // A reload of the link: the track again, with nothing new saved.
        await go(link.replace('?', '?quality=low&n=2&'));
        r = await js(`return JSON.stringify(S.landed());`);
        assert.equal(r.track, id);
        assert.equal(JSON.parse(r.custom).length, 1);
      });
    });

    await t.test('bad codes, an empty one, a line beside it, a closed map, a built-in id: each says so or steps aside, and the page boots', async () => {
      assert.ok(code);
      const gym = encodeShare({ ...decodeShare(code), map: 'gym' });
      const weekly = encodeShare({ ...decodeShare(code), id: 'weekly-2026-W46', name: 'Not the weekly' });
      await pass(sim('map=rig&n=1#trk=QM2.notbase64!!'), { storage: KEYS }, async ({ js, go }) => {
        let r = await js(`return JSON.stringify(S.landed());`);
        assert.ok(r.toasts.includes('BAD TRACK CODE'), JSON.stringify(r.toasts));
        assert.equal(r.map, 'rig');
        assert.equal(isFreestyleTrackId(r.track), true, 'the boot as it was: ' + r.track);
        assert.equal(r.err, null);

        await go(sim('map=rig&n=2#trk='));
        r = await js(`return JSON.stringify(S.landed());`);
        assert.ok(r.toasts.includes('BAD TRACK CODE'), 'empty: ' + JSON.stringify(r.toasts));
        assert.equal(isFreestyleTrackId(r.track), true);

        await go(sim('map=rig&n=3#line=L1.AAAA&trk=' + code));
        r = await js(`await S.wait(600); return JSON.stringify(S.landed());`);
        assert.ok(!r.toasts.some((x) => /SHARED TRACK/.test(x)), 'the line wins: ' + JSON.stringify(r.toasts));
        assert.notEqual(r.track, decodeShare(code).id);
        assert.equal(r.banner, 'Line link not valid', 'the line link said its own');

        await go(sim('map=gym&n=4#trk=' + gym));
        r = await js(`return JSON.stringify(S.landed());`);
        assert.ok(r.toasts.some((x) => /ARCHIVE/.test(x)), 'a closed map: ' + JSON.stringify(r.toasts));
        assert.ok(!r.toasts.some((x) => /SHARED TRACK/.test(x)));
        assert.equal(r.map, 'rig');

        await go(sim('map=rig&n=5#trk=' + encodeURIComponent(weekly)));
        r = await js(`return JSON.stringify(S.landed());`);
        assert.ok(r.toasts.includes('SHARED TRACK: Not the weekly'), JSON.stringify(r.toasts));
        assert.match(r.track, /^custom-shared-/, 'never the weekly course or its board');
        assert.equal(r.gates, 3);
        assert.equal(r.custom, null);
      });
    });
  } finally {
    server.close();
  }
});
