// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Speed units (sim-feel.js speedText and the saved choice; sim.html updateOSD
// and the Tune panel's Speed units): the OSD's SPD line in mph, km/h or off.
//   node tools/test_sim_speed_units.mjs
// The Chrome part (one fresh profile per browser language and saved choice)
// needs CHROME set to a Chrome binary locally, and is skipped with
// SKIP_CHROME_BOOT=1 (the sim-tests job).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  SPEED_UNITS_KEY, SPEED_UNITS, SPEED_UNIT_FACTOR, SPEED_UNIT_LABEL, SPEED_FIELD_CHARS,
  speedUnitsDefault, loadSpeedUnits, saveSpeedUnits, speedUnitsOn, speedText,
} from '../sim-feel.js';
import { WS } from '../sim-core-adapter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
const html = read('sim.html');

function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m };
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

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

test('the saved choice: mph, kmh, off, or none; every access survives a storage that throws', () => {
  assert.equal(SPEED_UNITS_KEY, 'quadmathSimSpeedUnits');
  assert.deepEqual([...SPEED_UNITS], ['mph', 'kmh', 'off']);
  const s = memStore();
  assert.equal(loadSpeedUnits(s), null, 'never chosen');
  for (const u of SPEED_UNITS) {
    assert.equal(saveSpeedUnits(u, s), true, u);
    assert.equal(s.m.get(SPEED_UNITS_KEY), u);
    assert.equal(loadSpeedUnits(s), u);
  }
  // Anything else is no choice, and is never written.
  for (const bad of ['km/h', 'MPH', 'kph', '', 'on', '1']) {
    assert.equal(loadSpeedUnits(memStore({ [SPEED_UNITS_KEY]: bad })), null, JSON.stringify(bad));
  }
  const s2 = memStore({ [SPEED_UNITS_KEY]: 'mph' });
  for (const bad of ['km/h', 'knots', '', null, undefined, 3]) assert.equal(saveSpeedUnits(bad, s2), false, String(bad));
  assert.equal(s2.m.get(SPEED_UNITS_KEY), 'mph', 'a refused save leaves the choice alone');
  assert.equal(loadSpeedUnits(throwing), null);
  assert.equal(saveSpeedUnits('mph', throwing), false);
});

test('the default by language: mph for en-US only, km/h for every other language', () => {
  for (const l of ['en-US', 'en-us', 'EN-US']) assert.equal(speedUnitsDefault(l), 'mph', l);
  for (const l of ['en-GB', 'en', 'en-CA', 'en-AU', 'es-US', 'de-DE', 'fr-FR', 'ja', 'pt-BR', '', undefined, null, 42]) {
    assert.equal(speedUnitsDefault(l), 'kmh', String(l));
  }
});

test('the stored choice wins over the language; no choice, or a bad one, falls back to it', () => {
  for (const lang of ['en-US', 'de-DE', undefined]) {
    for (const u of SPEED_UNITS) assert.equal(speedUnitsOn(u, lang), u, `${u} under ${lang}`);
    for (const none of [null, undefined, 'km/h', 'fast']) assert.equal(speedUnitsOn(none, lang), speedUnitsDefault(lang), `${none} under ${lang}`);
  }
  // Through storage, as the page reads it.
  assert.equal(speedUnitsOn(loadSpeedUnits(memStore({ [SPEED_UNITS_KEY]: 'kmh' })), 'en-US'), 'kmh');
  assert.equal(speedUnitsOn(loadSpeedUnits(memStore({ [SPEED_UNITS_KEY]: 'mph' })), 'de-DE'), 'mph');
  assert.equal(speedUnitsOn(loadSpeedUnits(memStore({ [SPEED_UNITS_KEY]: 'off' })), 'en-US'), 'off');
  assert.equal(speedUnitsOn(loadSpeedUnits(memStore()), 'en-US'), 'mph');
  assert.equal(speedUnitsOn(loadSpeedUnits(memStore()), 'de-DE'), 'kmh');
  assert.equal(speedUnitsOn(loadSpeedUnits(throwing), 'de-DE'), 'kmh');
});

test('speedText: m/s to whole mph and km/h, each with its label; off is null', () => {
  assert.equal(SPEED_UNIT_FACTOR.kmh, 3.6);
  assert.equal(SPEED_UNIT_FACTOR.mph, 3600 / 1609.344, 'the international mile');
  assert.deepEqual({ ...SPEED_UNIT_LABEL }, { mph: 'mph', kmh: 'km/h' });
  assert.equal(speedText(10, 'kmh'), '36 km/h');
  assert.equal(speedText(10, 'mph'), '22 mph');          // 22.37
  assert.equal(speedText(26.8224, 'mph'), '60 mph');     // 60 mph exactly
  assert.equal(speedText(16.6667, 'kmh'), '60 km/h');
  assert.equal(speedText(0, 'mph'), '0 mph');
  assert.equal(speedText(0.13, 'kmh'), '0 km/h');        // 0.47, rounds down
  assert.equal(speedText(0.14, 'kmh'), '1 km/h');        // 0.50, rounds up
  assert.equal(speedText(-10, 'kmh'), '36 km/h', 'a speed, not a velocity');
  for (const junk of [NaN, Infinity, undefined, null, 'x']) assert.equal(speedText(junk, 'mph'), '0 mph', String(junk));
  assert.equal(speedText(10, 'off'), null);
  for (const bad of ['km/h', 'knots', '', undefined, 'constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(speedText(10, bad), null, String(bad));
  // Unpadded text is never capped: a card can say what happened.
  assert.equal(speedText(1000, 'kmh'), '3600 km/h');
});

test('speedText field: the number is always 3 characters, right-aligned, capped at 999', () => {
  assert.equal(SPEED_FIELD_CHARS, 3);
  assert.equal(speedText(9 / 3.6, 'kmh', { field: true }), '  9 km/h');
  assert.equal(speedText(10 / 3.6, 'kmh', { field: true }), ' 10 km/h');
  assert.equal(speedText(100 / 3.6, 'kmh', { field: true }), '100 km/h');
  assert.equal(speedText(1000, 'kmh', { field: true }), '999 km/h');
  assert.equal(speedText(0, 'mph', { field: true }), '  0 mph');
  assert.equal(speedText(NaN, 'mph', { field: true }), '  0 mph');
  assert.equal(speedText(5, 'off', { field: true }), null);
  for (const u of ['mph', 'kmh']) {
    const len = `000 ${SPEED_UNIT_LABEL[u]}`.length;
    for (let ms = 0; ms <= 600; ms += 0.37) {
      const t = speedText(ms, u, { field: true });
      assert.equal(t.length, len, `${ms} m/s in ${u}: ${JSON.stringify(t)}`);
      assert.ok(t.endsWith(' ' + SPEED_UNIT_LABEL[u]));
    }
  }
});

test('sim.html: the OSD reads true m/s and metres, through the one helper', () => {
  assert.equal(WS, 3.5);
  const osd = extract('updateOSD');
  assert.match(osd, /speedText\(state\.vel\.length\(\)\/WS,speedUnitsNow\(\),\{field:true\}\)/, 'SPD from m/s, in the pilot\'s units, fixed width');
  assert.match(osd, /alt=\(state\.pos\.y\/WS\)\.toFixed\(1\)/, 'ALT in metres');
  assert.match(osd, /`<span class="osd-spd\$\{spd\?'':' off'\}">SPD \$\{spd\|\|''\}<\/span><br>ALT \$\{alt\} m\$\{battLine\}`/);
  assert.doesNotMatch(osd, /3\.6/, 'no conversion of its own');
  // Nowhere else in the sim makes its own km/h or mph: every speed shown goes through speedText.
  const pages = ['sim.html', ...readdirSync(root).filter((f) => /^sim-.*\.js$/.test(f) && f !== 'sim-feel.js')];
  for (const f of pages) {
    const src = read(f).split('\n');
    src.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      if (f === 'sim.html' && /<option value="(mph|kmh)">|id="speedUnits" title=/.test(line)) return;
      assert.doesNotMatch(line, /km\/h|\bmph\b|\*\s*3\.6\b|\b3\.6\s*\*|2\.2369/, `${f}:${i + 1} ${line.trim()}`);
    });
  }
  // The CSS: the padded field keeps its spaces; off keeps the line's box.
  assert.match(html, /#osdTL \.osd-spd\{white-space:pre\}/);
  assert.match(html, /#osdTL \.osd-spd\.off\{visibility:hidden\}/);
  // Styled as the panel's other selects are (by id).
  assert.match(html, /#camTiltPreset,#fpvStyle,#speedUnits,[^{]*\{width:100%;/);
});

test('sim.html: Speed units in the Tune panel\'s Camera section, the page\'s choice and its save', () => {
  const cam = html.slice(html.indexOf('<h2>Camera</h2>'), html.indexOf('<h2>Quality</h2>'));
  assert.ok(cam.length > 0, 'the Camera section');
  const m = cam.match(/<select id="speedUnits"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(m, 'the select sits in the Camera section');
  const opts = [...m[1].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((o) => [o[1], o[2]]);
  assert.deepEqual(opts, [['mph', 'mph'], ['kmh', 'km/h'], ['off', 'Off']]);
  assert.match(cam, /<label for="speedUnits">Speed units<\/label>/);
  assert.match(html, /let speedUnitsSaved=loadSpeedUnits\(\);/);
  assert.match(html, /function speedUnitsNow\(\)\{return speedUnitsOn\(speedUnitsSaved,navigator\.language\);\}/);
  const set = extract('setSpeedUnits');
  assert.match(set, /if\(!SPEED_UNITS\.includes\(v\)\)return false;/);
  assert.match(set, /saveSpeedUnits\(v\);/);
  assert.match(set, /updateOSD\(\);/, 'shown at once, even with the sim paused under a menu');
  assert.match(html, /sel\.value=speedUnitsNow\(\);\s*sel\.onchange=\(\)=>setSpeedUnits\(sel\.value\);/);
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

// In the page: choose units the way the Tune panel does, and render the OSD
// with the quad at a given true speed and height (the real updateOSD on the
// real state, put back after), measuring where its text lands.
const PAGE = String.raw`(async () => {
  const s = window._sim;
  // The OSD's face (JetBrains Mono 500, font-display: swap) in before anything
  // is measured, so no swap lands between two measurements.
  try { await document.fonts.load('500 12px "JetBrains Mono"'); await document.fonts.ready; } catch (e) { /* measured on the fallback */ }
  const WS = ${WS};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(16); }
    return !!fn();
  };
  const tl = () => document.getElementById('osdTL');
  const sel = () => document.getElementById('speedUnits');
  const r1 = (v) => Math.round(v * 100) / 100;
  const rect = (b) => ({ left: r1(b.left), top: r1(b.top), right: r1(b.right), bottom: r1(b.bottom), w: r1(b.width), h: r1(b.height) });
  // The box of the first run of str in #osdTL's text, from a Range over its text node.
  function textBox(str) {
    const walk = document.createTreeWalker(tl(), NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const i = n.data.indexOf(str);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + str.length);
      return rect(r.getBoundingClientRect());
    }
    return null;
  }
  function choose(u) {
    sel().value = u;
    sel().dispatchEvent(new Event('change', { bubbles: true }));
    return { value: sel().value, on: s.speedUnits().on, saved: s.speedUnits().saved, stored: localStorage.getItem(s.SPEED_UNITS_KEY), now: read() };
  }
  // What #osdTL shows now.
  function read() {
    const spd = tl().querySelector('.osd-spd');
    const cs = spd ? getComputedStyle(spd) : null;
    const altM = /ALT (-?[\d.]+) m/.exec(tl().textContent);
    return {
      spd: spd ? spd.textContent : null, off: !!(spd && spd.classList.contains('off')),
      vis: cs && cs.visibility, ws: cs && cs.whiteSpace, font: cs && cs.fontFamily,
      spdBox: spd ? rect(spd.getBoundingClientRect()) : null,
      alt: altM ? +altM[1] : null, altBox: textBox('ALT'),
      unitBox: textBox('mph') || textBox('km/h'),
      tl: rect(tl().getBoundingClientRect()),
    };
  }
  function render(ms, altM) {
    const st = s.osdState();
    const v = st.vel.clone(), y = st.pos.y;
    st.vel.set(ms * WS * 0.6, 0, -ms * WS * 0.8);   // any direction: a speed is a length
    st.pos.y = altM * WS;
    try { s.updateOSD(); return read(); }
    finally { st.vel.copy(v); st.pos.y = y; s.updateOSD(); }
  }
  // Several speeds rendered in one task, so nothing (a font, a resize) can
  // change between them but the number.
  const renders = (list, altM) => list.map((ms) => render(ms, altM));
  const options = () => Array.from(sel().options, (o) => [o.value, o.textContent]);
  const monoIn = () => document.fonts.check('500 12px "JetBrains Mono"');
  window.__su = { s, until, choose, read, render, renders, options, monoIn, lang: () => navigator.language };
  return true;
})()`;

test('speed units in Chrome: the default by language, each option, the stored choice, one width', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;
  const url = `${origin}/sim.html?quality=low&map=rig`;

  // A pass: a fresh Chrome profile whose browser language is lang, the given
  // storage, the page at url; flow runs with js() into the page.
  async function pass(lang, storage, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-speed-'));
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=960,540',
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
      // A desktop screen (the headless window's own viewport is under the phone breakpoint's 500 px).
      await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      // The browser's language, whatever the machine's: navigator.language follows the
      // Accept-Language override (alone: no --lang, which Chrome on Linux may ignore).
      const { userAgent } = await cdp(ws, 'Browser.getVersion');
      await cdp(ws, 'Emulation.setUserAgentOverride', { userAgent, acceptLanguage: lang });
      // Same origin first, for localStorage before the page's scripts.
      await cdp(ws, 'Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        const seed = ${JSON.stringify({ quadmathSimInputChoice: 'keyboard', ...storage })};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        return true;
      })()`);
      const boot = async () => {
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
          await sleep(250);
          try {
            ready = await evaluate(ws, `!!(window._sim && window._sim.speedUnits && window._sim.osdState && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._ttff)`);
          } catch (e) { /* the page is still loading */ }
        }
        assert.ok(ready, 'the page booted');
        await evaluate(ws, PAGE);
      };
      await cdp(ws, 'Page.navigate', { url });
      await boot();
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const S = window.__su; ${body} })()`));
      const reload = async () => { await cdp(ws, 'Page.navigate', { url }); await boot(); };
      await flow({ js, reload });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
      }
    }
  }

  // The flown OSD's own render: what the frame loop wrote, once it has run.
  const live = (unit) => `await S.until(() => { const r = S.read(); return r.spd !== null && ${unit === 'off' ? 'r.off' : `!r.off && r.spd.endsWith(' ${unit}')`}; }, 8000); return JSON.stringify(S.read());`;
  let usAltTop = null;

  try {
    await t.test('en-US, never chosen: mph; each option renders and is saved; one width at 9, 10, 100; the choice survives a reload', async () => {
      await pass('en-US', {}, async ({ js, reload }) => {
        const first = await js(`return JSON.stringify({ lang: S.lang(), units: S.s.speedUnits(), value: document.getElementById('speedUnits').value, stored: localStorage.getItem(S.s.SPEED_UNITS_KEY), options: S.options() });`);
        assert.equal(first.lang, 'en-US', 'the browser language took');
        assert.deepEqual(first.units, { on: 'mph', saved: null, lang: 'en-US' });
        assert.equal(first.value, 'mph', 'the select shows what is in force');
        assert.equal(first.stored, null, 'the default is never saved');
        assert.deepEqual(first.options, [['mph', 'mph'], ['kmh', 'km/h'], ['off', 'Off']]);
        const flown = await js(live('mph'));
        assert.match(flown.spd, /^SPD [ \d]{3} mph$/, 'the frame loop writes mph: ' + JSON.stringify(flown.spd));
        assert.equal(flown.ws, 'pre');
        assert.match(flown.font, /JetBrains Mono|monospace/i);

        // True speed and height: 10 m/s at 2 m.
        const mph = await js(`return JSON.stringify(S.render(10, 2));`);
        assert.equal(mph.spd, 'SPD  22 mph');
        assert.equal(mph.alt, 2, 'ALT in metres');
        usAltTop = mph.altBox.top;

        // Each option, chosen as the Tune panel does: saved, in force, shown at once.
        for (const [u, label] of [['kmh', 'km/h'], ['off', null], ['mph', 'mph']]) {
          const c = await js(`return JSON.stringify(S.choose(${JSON.stringify(u)}));`);
          assert.equal(c.value, u); assert.equal(c.on, u); assert.equal(c.saved, u); assert.equal(c.stored, u, `${u} saved`);
          if (label) {
            assert.equal(c.now.off, false); assert.equal(c.now.vis, 'visible');
            assert.ok(c.now.spd.endsWith(' ' + label), `${u} shown at once: ${JSON.stringify(c.now.spd)}`);
          } else {
            assert.equal(c.now.off, true, 'off: the line is hidden'); assert.equal(c.now.vis, 'hidden');
            assert.equal(c.now.unitBox, null, 'no unit written');
          }
          const r = await js(`return JSON.stringify(S.render(10, 2));`);
          if (u === 'kmh') assert.equal(r.spd, 'SPD  36 km/h');
          if (u === 'mph') assert.equal(r.spd, 'SPD  22 mph');
          if (u === 'off') {
            assert.equal(r.vis, 'hidden');
            assert.ok(r.spdBox.h > 0, 'off keeps the line box');
          }
          // Off moves no other line: ALT sits where it does with the line shown.
          assert.deepEqual(r.altBox, mph.altBox, `${u}: ALT in place`);
          assert.equal(r.tl.top, mph.tl.top); assert.equal(r.tl.left, mph.tl.left); assert.equal(r.tl.h, mph.tl.h, `${u}: the OSD box keeps its height`);
          assert.equal(r.alt, 2);
        }
        const flownOff = await js(`S.choose('off'); ${live('off')}`);
        assert.equal(flownOff.vis, 'hidden', 'the frame loop keeps it hidden');
        assert.equal(flownOff.altBox.top, usAltTop, 'ALT on the same line as with SPD shown');

        // One width: 9, 10, 100 (and past 999, capped) leave the unit, the field and ALT where they were.
        assert.equal(await js(`return JSON.stringify(S.monoIn());`), true, 'the OSD face loaded');
        for (const [u, label, k] of [['mph', 'mph', 3600 / 1609.344], ['kmh', 'km/h', 3.6]]) {
          await js(`S.choose(${JSON.stringify(u)}); return '{}';`);
          const shownList = [9, 10, 100, 999, 1500];
          const rows = await js(`return JSON.stringify(S.renders(${JSON.stringify(shownList.map((v) => v / k))}, 1.5));`);
          rows.forEach((r, i) => {
            const shown = shownList[i];
            assert.equal(r.spd, `SPD ${String(Math.min(shown, 999)).padStart(3, ' ')} ${label}`, `${shown} ${label}`);
          });
          const [a, ...rest] = rows;
          for (const r of rest) {
            assert.deepEqual(r.unitBox, a.unitBox, `${label}: the unit stays put (${r.spd})`);
            assert.deepEqual(r.spdBox, a.spdBox, `${label}: the field keeps one box (${r.spd})`);
            assert.deepEqual(r.altBox, a.altBox, `${label}: ALT stays put (${r.spd})`);
            assert.deepEqual(r.tl, a.tl, `${label}: the OSD box keeps one size (${r.spd})`);
          }
        }

        // The stored choice wins over en-US after a reload.
        await js(`S.choose('kmh'); return '{}';`);
        await reload();
        const back = await js(`return JSON.stringify({ units: S.s.speedUnits(), value: document.getElementById('speedUnits').value });`);
        assert.deepEqual(back.units, { on: 'kmh', saved: 'kmh', lang: 'en-US' });
        assert.equal(back.value, 'kmh');
        const flownBack = await js(live('km/h'));
        assert.match(flownBack.spd, /^SPD [ \d]{3} km\/h$/);
      });
    });

    await t.test('de-DE, never chosen: km/h', async () => {
      await pass('de-DE', {}, async ({ js }) => {
        const r = await js(`return JSON.stringify({ lang: S.lang(), units: S.s.speedUnits(), value: document.getElementById('speedUnits').value, stored: localStorage.getItem(S.s.SPEED_UNITS_KEY) });`);
        assert.equal(r.lang, 'de-DE', 'the browser language took');
        assert.deepEqual(r.units, { on: 'kmh', saved: null, lang: 'de-DE' });
        assert.equal(r.value, 'kmh');
        assert.equal(r.stored, null, 'the default is never saved');
        const flown = await js(live('km/h'));
        assert.match(flown.spd, /^SPD [ \d]{3} km\/h$/);
        const at = await js(`return JSON.stringify(S.render(10, 2));`);
        assert.equal(at.spd, 'SPD  36 km/h');
        assert.equal(at.alt, 2);
      });
    });

    await t.test('de-DE, mph saved: the stored choice wins', async () => {
      await pass('de-DE', { [SPEED_UNITS_KEY]: 'mph' }, async ({ js }) => {
        const r = await js(`return JSON.stringify({ lang: S.lang(), units: S.s.speedUnits(), value: document.getElementById('speedUnits').value });`);
        assert.equal(r.lang, 'de-DE');
        assert.deepEqual(r.units, { on: 'mph', saved: 'mph', lang: 'de-DE' });
        assert.equal(r.value, 'mph');
        const flown = await js(live('mph'));
        assert.match(flown.spd, /^SPD [ \d]{3} mph$/);
      });
    });

    await t.test('en-US, off saved: the line is hidden from the first frame, ALT where it always is', async () => {
      await pass('en-US', { [SPEED_UNITS_KEY]: 'off' }, async ({ js }) => {
        const r = await js(`return JSON.stringify({ units: S.s.speedUnits(), value: document.getElementById('speedUnits').value });`);
        assert.deepEqual(r.units, { on: 'off', saved: 'off', lang: 'en-US' });
        assert.equal(r.value, 'off');
        const flown = await js(live('off'));
        assert.equal(flown.vis, 'hidden');
        assert.equal(flown.unitBox, null);
        // ALT on the line it has with SPD shown, in this same page.
        const both = await js(`const off = S.render(10, 2); S.choose('mph'); const on = S.render(10, 2); return JSON.stringify({ off, on });`);
        assert.equal(both.off.vis, 'hidden');
        assert.equal(both.on.spd, 'SPD  22 mph');
        assert.deepEqual(both.off.altBox, both.on.altBox, 'ALT where it is with SPD shown');
        assert.deepEqual(both.off.tl.top, both.on.tl.top);
      });
    });
  } finally {
    server.close();
  }
});
