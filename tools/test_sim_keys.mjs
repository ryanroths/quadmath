// The sim's keys: M mutes all sound and N skips to the next music track.
//   - In the source: one action per key in the keydown handler, M is
//     toggleMute, N is skipTrack, every letter or number key the sim reads is
//     in SIM_KEYS, the select guard lets Ctrl/Cmd/Alt shortcuts through, the
//     secret chime and the trick blips (their own AudioContexts) follow the
//     mute, and the on-screen help says M mutes and N skips.
//   - sim.html's own shuffleOrder and nextTrack, run in node through every
//     reshuffle: N never restarts the track that just played.
//   - In headless Chrome, with real key presses: M toggles the mute with the
//     page focused and with every <select> focused, and changes no select and
//     no class (Your build's Preset used to take M as type-ahead and jump
//     between the Mobula6, a 65, and the Meteor75 Pro, an 85); Ctrl+M on a
//     select is not cancelled; a letter the sim does not use still picks an
//     option. N plays a different track on every press, across a reshuffle.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'sim.html'), 'utf8');

// The main keydown handler, from its first line to the keyup line after it.
function keydownHandler() {
  const start = html.search(/^addEventListener\('keydown',e=>\{\r?$/m);
  const end = html.indexOf("addEventListener('keyup'", start);
  assert.ok(start > 0 && end > start, 'the keydown handler');
  return html.slice(start, end);
}

test('keys in the source: M is toggleMute, N is skipTrack, one action per key, SIM_KEYS covers them', () => {
  const src = keydownHandler();
  const flight = src.slice(src.indexOf('keys[e.key.toLowerCase()]=true;'));
  const bound = {};
  for (const m of flight.matchAll(/if\(e\.key(?:\.toLowerCase\(\))?==='([^']+)'\)(\{?)([^\r\n]*)/g)) {
    assert.ok(!bound[m[1]], `${m[1]} is bound once`);
    bound[m[1]] = m[2] ? '{block}' : m[3];
  }
  assert.equal(bound.m, 'toggleMute();', 'M mutes');
  assert.equal(bound.n, 'skipTrack();', 'N skips the track');
  const sim = new Set(JSON.parse(html.match(/const SIM_KEYS=new Set\((\[[^\]]+\])\)/)[1].replace(/'/g, '"')));
  const read = new Set([...html.matchAll(/keys\['([a-z0-9])'\]/g)].map((m) => m[1]));
  for (const k of [...Object.keys(bound), ...read].filter((k) => k.length === 1)) {
    assert.ok(sim.has(k), `${k} is in SIM_KEYS`);
  }
  assert.match(src, /tagName==='SELECT'&&!e\.ctrlKey&&!e\.metaKey&&!e\.altKey&&SIM_KEYS\.has\(e\.key\.toLowerCase\(\)\)\)e\.preventDefault\(\)/, 'no type-ahead on a select for the sim keys; browser shortcuts pass');
  // Everything that makes a sound answers to M: the chime and the blips have
  // their own AudioContexts, so their muted() hooks read simAudio's mute.
  const hooks = [...html.matchAll(/muted(?:\(\)\{return |:\(\)=>)([^;},\r\n]+)/g)].map((m) => m[1]);
  assert.equal(hooks.length, 2, 'the secret chime and the trick blip hooks: ' + hooks.join(' | '));
  for (const h of hooks) assert.match(h, /^simAudio\.muted\|\|!musicOn$/, 'muted by M: ' + h);
  assert.match(html, /<b>M — Sound On\/Off<\/b>/, 'the legend: M is sound');
  assert.match(html, /<b>N — Next Music Track<\/b>/, 'the legend: N');
  assert.match(html, /<b>M<\/b> mute &nbsp;<b>N<\/b> next track/, 'Tune\'s Controls');
  assert.match(html, /<span class="n">M<\/span> mute · <span class="n">N<\/span> next track/, 'the menu\'s Controls card');
});

// N never restarts the track that just played: sim.html's own shuffleOrder
// and nextTrack, run here with Math.random forced through every shuffle of
// three tracks, from the last track of every order.
test('N never restarts the track that just played, across every reshuffle', () => {
  const pick = (name) => {
    const i = html.indexOf('function ' + name + '(');
    assert.ok(i > 0, name + ' in sim.html');
    return html.slice(i, html.indexOf('\n}', i) + 2);
  };
  const code = pick('shuffleOrder') + '\n' + pick('nextTrack');
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  let shuffles = 0;
  for (const order of orders) {
    for (const r of [0, 0.2, 0.4, 0.6, 0.7, 0.9, 0.999]) {
      const run = new Function('start', 'r', `
        const TRACKS = ['a', 'b', 'c'], Math = { random: () => r, floor: globalThis.Math.floor };
        let musicOrder = start.slice(), musicIdx = start.length - 1, played = null;
        const playCurrentTrack = () => { played = musicOrder[musicIdx]; };
        ${code}
        nextTrack();
        return { played, idx: musicIdx, order: musicOrder };`);
      const out = run(order, r);
      assert.equal(out.idx, 0, 'after the last track, a new order from its start');
      assert.deepEqual(out.order.slice().sort(), [0, 1, 2], 'the new order holds every track');
      assert.notEqual(out.played, order[2], `from ${order} with random ${r}: not ${order[2]} again`);
      shuffles++;
    }
  }
  assert.equal(shuffles, 42);
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
    '.mp3': 'audio/mpeg',
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
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 20000);
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

// A real key through CDP: trusted, so a focused select takes it as type-ahead.
// modifiers: CDP's bit field (2 is Ctrl); a held modifier types no text.
async function press(ws, key, vk, modifiers) {
  const code = 'Key' + key.toUpperCase();
  const mods = modifiers ? { modifiers } : { text: key };
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, ...mods });
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, ...(modifiers ? { modifiers } : {}) });
  await sleep(150);
}

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// In the page: every select's value, the class, the mute and the music.
const STATE = `JSON.stringify({
  focus: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
  selects: Object.fromEntries([...document.querySelectorAll('select')].map((s) => [s.id, s.value])),
  frame: document.getElementById('buildFrame').value,
  drone: document.getElementById('droneType').value,
  muted: window._sim.audio.muted,
  music: window._sim.music(),
  toast: document.getElementById('toast').textContent,
})`;

test('keys in Chrome: M mutes from the page and from every select, never the class; N skips the track', { timeout: 5 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-keys-'));
  const debugPort = 9300 + (process.pid % 300);
  const url = `http://127.0.0.1:${port}/sim.html?quality=low`;
  const child = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update', '--disable-background-networking', '--disable-sync',
    '--window-size=900,600', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, url,
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
        page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url).includes('/sim.html'));
      } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    await cdp(ws, 'Runtime.enable');
    let ready = false;
    for (let i = 0; i < 160 && !ready; i++) {
      await sleep(250);
      ready = await evaluate(ws, `!!(window._sim && window._sim.music && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`);
    }
    assert.ok(ready, 'the page booted');
    const state = async () => JSON.parse(await evaluate(ws, STATE));

    // The Preset on the Mobula6, as a pilot who picked it: M there used to
    // jump to the Meteor75 Pro (an 85) and back.
    await evaluate(ws, `(() => { const s = document.getElementById('buildPreset'); s.value = 'mobula6'; s.dispatchEvent(new Event('change')); return true; })()`);
    await sleep(300);
    const ids = JSON.parse(await evaluate(ws, `JSON.stringify([...document.querySelectorAll('select')].map((s) => s.id))`));
    assert.ok(ids.includes('buildPreset') && ids.includes('droneType') && ids.includes('buildFrame'), 'the class selects are on the page');
    let focused = 0;
    for (const id of [null, ...ids]) {
      const on = await evaluate(ws, `(() => {
        if (document.activeElement) document.activeElement.blur();
        ${id ? `const el = document.getElementById(${JSON.stringify(id)}); el.focus(); return document.activeElement === el;` : 'return true;'}
      })()`);
      if (!on) continue; // hidden (a dev-only select): no focus, no type-ahead
      if (id) focused++;
      const where = id || 'the page';
      const before = await state();
      await press(ws, 'm', 77);
      const once = await state();
      assert.equal(once.muted, !before.muted, `M on ${where} toggles the mute`);
      assert.deepEqual(once.selects, before.selects, `M on ${where} changes no select`);
      assert.equal(once.frame, before.frame, `M on ${where} keeps the frame`);
      assert.equal(once.drone, before.drone, `M on ${where} keeps the drone type`);
      await press(ws, 'm', 77);
      const twice = await state();
      assert.equal(twice.muted, before.muted, `M again on ${where} toggles it back`);
      assert.deepEqual(twice.selects, before.selects, `M again on ${where} changes no select`);
    }
    assert.ok(focused >= 3, `M pressed on ${focused} focused selects`);

    // On a select, M's default (type-ahead) is cancelled; Ctrl+M's is not, so
    // a browser shortcut (Ctrl+R, Ctrl+F, ...) still works there. A listener
    // added now runs after the sim's own.
    await evaluate(ws, `(() => { window.__prevented = []; addEventListener('keydown', (e) => window.__prevented.push(e.defaultPrevented)); document.getElementById('buildPreset').focus(); return true; })()`);
    const pre = await state();
    await press(ws, 'm', 77);
    await press(ws, 'm', 77, 2);
    const prevented = await evaluate(ws, `JSON.stringify(window.__prevented)`);
    assert.equal(prevented, '[true,false]', 'M cancelled on the select, Ctrl+M not');
    assert.deepEqual((await state()).selects, pre.selects, 'neither changes a select');

    // N: the music starts on the next track; every N after it plays a
    // different track, across the reshuffle after the third.
    await evaluate(ws, `document.activeElement && document.activeElement.blur(), true`);
    const quiet = await state();
    let last = quiet;
    for (let i = 0; i < 5; i++) {
      await press(ws, 'n', 78);
      const now = await state();
      assert.equal(now.music.on, true, 'N plays music');
      assert.match(now.toast, /^♪ TRACK \d\/\d$/, `N says the track (${now.toast})`);
      assert.match(now.music.src, /audio\/track\d\.mp3$/, 'a track is loaded');
      assert.notEqual(now.music.src, last.music.src, `N ${i + 1} plays another track`);
      assert.equal(now.muted, quiet.muted, 'N leaves the mute alone');
      assert.deepEqual(now.selects, quiet.selects, 'N changes no select');
      last = now;
    }

    // A letter the sim does not use still picks on a select: T, the TreeTopper 75.
    await evaluate(ws, `document.getElementById('buildPreset').focus(), true`);
    await press(ws, 't', 84);
    const tree = await state();
    assert.equal(tree.selects.buildPreset, 'treetopper75', 'T on the Preset picks the TreeTopper');
    assert.equal(tree.frame, '75', 'and its frame');
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
