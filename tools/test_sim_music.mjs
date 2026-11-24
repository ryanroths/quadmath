// The sim's music: five Kevin MacLeod tracks (CC BY 4.0), fetched only when
// one is about to play, credited on the page.
//   - In the source: TRACKS lists audio/track1.mp3 to audio/track5.mp3 in
//     order, each with its title and artist and a ?v= stamp that is the first
//     8 hex of the file's SHA-256 (the names held other songs before, and a
//     browser keeps an mp3 for four hours); audio/ holds exactly those files,
//     so the three earlier tracks are gone; each file is an MPEG-1 Layer III
//     stream at 128 kbps, 44.1 kHz, stereo, frame by frame to its end.
//   - Credits: the Tune panel's #musicCredits (under Audio), SIM-NOTICE.txt
//     and ASSETS-LICENSES.md carry each track's credit line and the licence.
//   - sim.html's own trackAt and playCurrentTrack, run in node: a track index
//     that is not in the list (a removed track's, a stale or junk value) plays
//     the first track, Galactic Rap, and throws nothing.
//   - Nothing downloads the music with the page: the element is preload none,
//     and its src is set only in playCurrentTrack and startMusic.
//   - In headless Chrome, as a returning visitor with the music on
//     (ryflyMusicOn=1): the page loads with no audio request and no page
//     error; the first gesture fetches one track and it plays, its title and
//     artist in the toast; N fetches one more, the same; the two-line toast
//     clears #packHint on phone sizes; every listed file plays; Tune opens
//     and shows each credit and licence link. Logs the page weight at load.
// Requires Chrome for the last part (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'sim.html'), 'utf8');

const TITLES = ['Galactic Rap', 'Funky Boxstep', 'Brain Dance', 'Tyrant', 'Robobozo'];
const ARTIST = 'Kevin MacLeod';
const LICENCE_URL = 'http://creativecommons.org/licenses/by/4.0/';
const CREDIT = (title) => `"${title}" Kevin MacLeod (incompetech.com)`;
const LICENCE = 'Licensed under Creative Commons: By Attribution 4.0 License, ' + LICENCE_URL;

// sim.html's TRACKS, as the page has it.
function tracksFromSource() {
  const m = html.match(/^const TRACKS=(\[[\s\S]*?\r?\n\]);\r?$/m);
  assert.ok(m, 'const TRACKS=[ ... ]; in sim.html');
  return new Function('return ' + m[1])();
}

// A function from sim.html, from its line to the closing brace at column 0.
function pick(name) {
  const i = html.indexOf('function ' + name + '(');
  assert.ok(i > 0, name + ' in sim.html');
  return html.slice(i, html.indexOf('\n}', i) + 2);
}

test('the track list: five Kevin MacLeod tracks, audio/track1..5.mp3 in order, each stamped with its file\'s hash; audio/ holds only them', () => {
  const tracks = tracksFromSource();
  assert.equal(tracks.length, TITLES.length, 'five tracks');
  tracks.forEach((t, i) => {
    assert.equal(t.title, TITLES[i], `track ${i + 1}'s title`);
    assert.equal(t.artist, ARTIST, `track ${i + 1}'s artist`);
    const m = String(t.src).match(/^audio\/track(\d+)\.mp3\?v=([0-9a-f]{8})$/);
    assert.ok(m, `track ${i + 1}'s src: ${t.src}`);
    assert.equal(Number(m[1]), i + 1, `track ${i + 1} is audio/track${i + 1}.mp3`);
    const file = join(root, 'audio', `track${i + 1}.mp3`);
    assert.ok(existsSync(file), `audio/track${i + 1}.mp3 exists`);
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
    assert.equal(m[2], hash, `audio/track${i + 1}.mp3's ?v= is its hash (after re-encoding a track, update its stamp)`);
  });
  const onDisk = readdirSync(join(root, 'audio')).filter((f) => !f.startsWith('.')).sort();
  const listed = tracks.map((t) => t.src.replace(/^audio\//, '').replace(/\?.*$/, '')).sort();
  assert.deepEqual(onDisk, listed, 'audio/ holds exactly the listed tracks');
});

// The first MPEG audio frame, past an ID3v2 tag.
function firstFrame(buf) {
  let off = 0;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    off = 10 + size + ((buf[5] & 0x10) ? 10 : 0);
  }
  while (off < buf.length - 4 && !(buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0)) off++;
  return off;
}

test('each track file is MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo, frame by frame to its end, over a minute long', (t) => {
  for (let i = 1; i <= TITLES.length; i++) {
    const name = `audio/track${i}.mp3`;
    const buf = readFileSync(join(root, name));
    let off = firstFrame(buf);
    let frames = 0;
    let end = buf.length;
    if (end > 128 && buf.subarray(end - 128, end - 125).toString('latin1') === 'TAG') end -= 128; // ID3v1
    while (off + 4 <= end) {
      const [b0, b1, b2, b3] = [buf[off], buf[off + 1], buf[off + 2], buf[off + 3]];
      assert.ok(b0 === 0xff && (b1 & 0xe0) === 0xe0, `${name}: frame sync at byte ${off}`);
      assert.equal((b1 >> 3) & 3, 3, `${name}: MPEG-1`);
      assert.equal((b1 >> 1) & 3, 1, `${name}: Layer III`);
      assert.equal(b2 >> 4, 9, `${name}: 128 kbps`);
      assert.equal((b2 >> 2) & 3, 0, `${name}: 44.1 kHz`);
      assert.notEqual(b3 >> 6, 3, `${name}: stereo, not mono`);
      off += Math.floor((144 * 128000) / 44100) + ((b2 >> 1) & 1);
      frames++;
    }
    assert.equal(off, end, `${name}: the last frame ends at the file's end`);
    const seconds = (frames * 1152) / 44100;
    assert.ok(seconds > 60, `${name}: ${seconds.toFixed(1)} s`);
    t.diagnostic(`${name}: ${buf.length} bytes, ${seconds.toFixed(1)} s`);
  }
});

test('credits: the Tune panel under Audio, SIM-NOTICE.txt and ASSETS-LICENSES.md carry each credit line and the licence', () => {
  const block = html.match(/<div class="music-credits" id="musicCredits">([\s\S]*?)<\/div>/);
  assert.ok(block, '#musicCredits in sim.html');
  const items = [...block[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items.length, TITLES.length, 'one credit per track');
  items.forEach((li, i) => {
    const spans = [...li.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    assert.deepEqual(spans, [CREDIT(TITLES[i]), LICENCE], `${TITLES[i]}'s credit, exactly`);
    assert.ok(li.includes(`<a href="${LICENCE_URL}"`), `${TITLES[i]}: the licence is a link`);
  });
  const panel = html.indexOf('<div id="panel">');
  const audio = html.indexOf('<h2>Audio</h2>', panel);
  const next = html.indexOf('<h2>', audio + 1);
  const at = html.indexOf('id="musicCredits"');
  assert.ok(panel > 0 && audio > panel && at > audio && at < next, 'in the Tune panel, under Audio');
  assert.match(html, /<a class="sf-license" href="SIM-NOTICE\.txt">/, 'the footer links SIM-NOTICE.txt');

  const notice = readFileSync(join(root, 'SIM-NOTICE.txt'), 'utf8').replace(/\r\n/g, '\n');
  for (const title of TITLES) assert.ok(notice.includes(CREDIT(title) + '\n' + LICENCE + '\n'), `SIM-NOTICE.txt credits ${title}`);

  const lic = readFileSync(join(root, 'ASSETS-LICENSES.md'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  TITLES.forEach((title, i) => {
    const row = lic.filter((l) => l.startsWith(`| \`audio/track${i + 1}.mp3\` |`));
    assert.equal(row.length, 1, `ASSETS-LICENSES.md has one row for audio/track${i + 1}.mp3`);
    const cells = row[0].split(' | ').map((c) => c.replace(/^\| |\s*\|$/g, ''));
    assert.deepEqual(cells, [`\`audio/track${i + 1}.mp3\``, title, ARTIST, 'incompetech.com', 'CC BY 4.0', CREDIT(title) + ' ' + LICENCE],
      `ASSETS-LICENSES.md: ${title}'s file, title, artist, source, licence, credit line`);
  });
});

test('a returning visitor: a track index not in the list (a removed track\'s, stale or junk) plays the first track and throws nothing', () => {
  const tracks = tracksFromSource();
  assert.equal((html.match(/\bTRACKS\[/g) || []).length, 1, 'TRACKS is indexed only in trackAt');
  const current = html.match(/^function currentTrack\(\)\{return trackAt\(musicOrder\[musicIdx\]\);\}\r?$/m);
  assert.ok(current, 'currentTrack goes through trackAt');
  for (const fn of ['playCurrentTrack', 'startMusic']) assert.match(pick(fn), /musicEl\.src=currentTrack\(\)\.src;/, fn + ' plays currentTrack()');
  const play = new Function('TRACKS', 'order', 'idx', `
    let musicOrder = order, musicIdx = idx;
    const musicEl = { src: '', play: () => Promise.resolve() };
    const console = { log() {} };
    ${pick('trackAt')}
    ${current[0]}
    ${pick('playCurrentTrack')}
    playCurrentTrack();
    return musicEl.src;`);
  tracks.forEach((t, i) => assert.equal(play(tracks, [i], 0), t.src, `index ${i} plays ${t.title}`));
  const stale = [5, 6, 7, -1, 2.5, NaN, Infinity, undefined, null, '1', '', 'audio/track3.mp3', 'audio/track9.mp3', {}];
  for (const v of stale) assert.equal(play(tracks, [v], 0), tracks[0].src, `${String(v)} plays ${tracks[0].title}`);
  assert.equal(play(tracks, [], 0), tracks[0].src, 'an empty order plays the first track');
  assert.equal(play(tracks, [4, 2], 9), tracks[0].src, 'a position past the order plays the first track');
});

test('nothing downloads the music with the page; the toasts name the track', () => {
  assert.match(html, /^const musicEl=new Audio\(\);\r?\nmusicEl\.preload='none';\r?$/m, 'the element is made with no src and preload none');
  const sets = [...html.matchAll(/musicEl\.src=/g)].map((m) => m.index);
  assert.equal(sets.length, 2, 'musicEl.src is set in two places');
  const inPlay = html.indexOf('function playCurrentTrack(');
  const inStart = html.indexOf('function startMusic(');
  assert.ok(sets.every((at) => (at > inPlay && at < html.indexOf('\n}', inPlay)) || (at > inStart && at < html.indexOf('\n}', inStart))),
    'only in playCurrentTrack and startMusic, each right before play()');
  assert.doesNotMatch(html, /<audio\b|<link[^>]+audio\/|rel="preload"[^>]+\.mp3/, 'no audio element or preload link in the markup');
  assert.match(pick('skipTrack'), /musicToast\('♪ TRACK '\+\(musicIdx\+1\)\+'\/'\+musicOrder\.length\);/, 'N: the track number, title and artist');
  assert.match(pick('toggleMusic'), /if\(musicOn\)musicToast\('♪ MUSIC ON'\);else toast\('MUSIC OFF'\);/, 'MUSIC ON: the title and artist');
  assert.match(pick('startMusic'), /musicToast\('♪ MUSIC ON'\);/, 'the saved choice\'s start: the title and artist');
  assert.match(pick('musicToast'), /toast\(head\+'\\n'\+t\.title\+' — '\+t\.artist,\{cls:'music-toast'\}\);/, 'the title and artist on a line of their own');
  assert.match(pick('toast'), /classList\.remove\([^)]*'music-toast'/, 'the music toast\'s class does not stick to the next toast');
  // A short landscape puts #packHint 20 px under the toast's centre: the
  // two-line music toast is set smaller there, after (so over) its own rule.
  const base = html.indexOf('#toast.music-toast{font-size:18px');
  const short = html.indexOf('@media (max-height:430px){#toast.music-toast{font-size:14px;line-height:1.2}}');
  assert.ok(base > 0 && short > base, 'the music toast is under 40 px tall on a short landscape');
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
    '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary',
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

// CDP over one page socket: send() for commands, events[] for everything else.
function cdpSession(ws) {
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (msg) => {
    let o;
    try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
    if (o.id && pending.has(o.id)) {
      const p = pending.get(o.id);
      pending.delete(o.id);
      clearTimeout(p.timer);
      if (o.error) p.reject(new Error(p.method + ': ' + JSON.stringify(o.error)));
      else p.resolve(o.result || {});
    } else if (o.method) events.push(o);
  });
  function send(method, params, ms) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('cdp timeout ' + method)); }, ms || 20000);
      pending.set(id, { resolve, reject, timer, method });
    });
  }
  async function evaluate(expression, ms) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms);
    if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  }
  return { send, evaluate, events };
}

// A real key through CDP: trusted, so it is a user gesture.
async function press(s, key, vk) {
  const code = 'Key' + key.toUpperCase();
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(150);
}

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

test('music in Chrome: a returning visitor loads no audio; the first gesture plays one track, N one more; every file plays; credits on the page', { timeout: 5 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const tracks = tracksFromSource();
  const titleOf = new Map(tracks.map((x) => [x.src, x.title]));
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'qm-music-'));
  // No --autoplay-policy flag: the page's music waits for a gesture, as for
  // a visitor; the keys below are trusted gestures.
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update', '--disable-background-networking', '--disable-sync',
    '--window-size=900,600', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  try {
    // Chrome picks its DevTools port (port 0) and writes it in the profile,
    // so no other test's Chrome can hold it (as tools/test_sim_first_flight.mjs).
    let debugPort = 0;
    for (let i = 0; i < 600 && !debugPort; i++) {
      await sleep(100);
      try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
    }
    assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
    let page = null;
    for (let i = 0; i < 300 && !page; i++) {
      await sleep(100);
      try {
        const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl && p.url === 'about:blank');
      } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    const s = cdpSession(ws);
    await s.send('Runtime.enable');
    await s.send('Network.enable');
    await s.send('Page.enable');
    // A returning visitor who left the music on.
    await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('ryflyMusicOn','1');}catch(e){}` });
    await s.send('Page.navigate', { url: `${origin}/sim.html?quality=low` });
    let ready = false;
    for (let i = 0; i < 160 && !ready; i++) {
      await sleep(250);
      try { ready = await s.evaluate(`!!(window._sim && window._sim.music && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`); } catch (e) { /* navigating */ }
    }
    assert.ok(ready, 'the page booted');
    await sleep(3000); // anything the page loads after it is ready

    const requests = () => s.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
    const audioUrls = () => [...new Set(requests().filter((u) => /\/audio\//.test(u)))];
    const done = s.events.filter((e) => e.method === 'Network.loadingFinished');
    const bytes = done.reduce((sum, e) => sum + e.params.encodedDataLength, 0);
    t.diagnostic(`page weight at load: ${requests().length} requests, ${bytes} bytes; audio: ${audioUrls().length} requests`);
    assert.deepEqual(audioUrls(), [], 'no audio requested with the page');
    const boot = await s.evaluate(`window._sim.music()`);
    assert.equal(boot.on, false, 'music not playing before a gesture');
    assert.equal(boot.src, '', 'no track loaded before a gesture');
    assert.equal(boot.tracks.length, TITLES.length, 'the page lists five tracks');
    assert.equal(await s.evaluate(`localStorage.getItem('ryflyMusicOn')`), '1', 'the visitor\'s saved choice is music on');

    // The credits, in the DOM.
    const credits = await s.evaluate(`[...document.querySelectorAll('#musicCredits li')].map((li) => ({ spans: [...li.querySelectorAll('span')].map((x) => x.textContent), href: li.querySelector('a') && li.querySelector('a').getAttribute('href') }))`);
    assert.equal(credits.length, TITLES.length, 'five credits on the page');
    credits.forEach((c, i) => {
      assert.deepEqual(c.spans, [CREDIT(TITLES[i]), LICENCE], `${TITLES[i]}'s credit on the page`);
      assert.equal(c.href, LICENCE_URL, `${TITLES[i]}'s licence link`);
    });

    // Every toast the page shows from here on, so a later one (the
    // Betaflight core's, say) cannot hide the music's.
    await s.evaluate(`(() => { window.__toasts = []; const el = document.getElementById('toast'); new MutationObserver(() => window.__toasts.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); return true; })()`);
    const toasted = async (want, what) => {
      for (let i = 0; i < 40; i++) {
        if ((await s.evaluate(`window.__toasts.slice()`)).includes(want)) return;
        await sleep(100);
      }
      assert.fail(`${what}: no toast ${JSON.stringify(want)} among ${JSON.stringify(await s.evaluate(`window.__toasts.slice()`))}`);
    };

    // Waits until the music element is past 0.3 s of the given src.
    const playing = async (what) => {
      let m = null;
      for (let i = 0; i < 80; i++) {
        m = await s.evaluate(`window._sim.music()`);
        if (m.err) break;
        if (m.on && m.src && m.t > 0.3 && !m.paused) return m;
        await sleep(125);
      }
      assert.fail(`${what}: not playing ${JSON.stringify(m)}`);
    };
    const srcPath = (u) => new URL(u).pathname.slice(1) + new URL(u).search;

    // The first gesture: a key the sim does not use. The saved choice starts
    // the music on one track, and that is the only audio fetched.
    await press(s, 'x', 88);
    const first = await playing('the first gesture');
    assert.equal(first.err, 0, 'no media error');
    assert.equal(first.n, TITLES.length, 'the shuffle holds five tracks');
    assert.ok(titleOf.has(srcPath(first.src)), `a listed track: ${first.src}`);
    assert.equal(first.title, titleOf.get(srcPath(first.src)), 'its title');
    assert.deepEqual(audioUrls(), [first.src], 'one track fetched, the one playing');
    await toasted(`♪ MUSIC ON\n${first.title} — ${ARTIST}`, 'MUSIC ON names the track');

    // N: the next track, one more fetch, its number, title and artist.
    await s.evaluate(`window.__toasts.length = 0, true`);
    await press(s, 'n', 78);
    const second = await playing('after N');
    assert.notEqual(second.src, first.src, 'N plays another track');
    assert.equal(second.title, titleOf.get(srcPath(second.src)), 'its title');
    assert.deepEqual(audioUrls(), [first.src, second.src], 'N fetched one track, the one playing');
    await toasted(`♪ TRACK ${second.idx + 1}/${TITLES.length}\n${second.title} — ${ARTIST}`, 'N names the track');

    // The two-line toast keeps clear of #packHint (P = new pack), which sits
    // at 44% + 20 px on a short landscape and 44% + 44 px otherwise; measured
    // on the longest title, on a landscape phone and a small portrait one.
    for (const [w, h, gap] of [[844, 390, 20], [568, 320, 20], [320, 568, 44], [375, 667, 44]]) {
      await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      const box = await s.evaluate(`(() => {
        const el = document.getElementById('toast');
        el.classList.add('music-toast');
        el.textContent = '♪ TRACK 2/5\\nFunky Boxstep — Kevin MacLeod';
        const r = el.getBoundingClientRect();
        return { bottom: r.bottom, height: r.height, line: innerHeight * 0.44 + ${gap}, lines: Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight)) };
      })()`);
      assert.ok(box.bottom <= box.line, `${w}x${h}: the music toast (${box.lines} lines, bottom ${box.bottom.toFixed(1)}) clears #packHint at ${box.line.toFixed(1)}`);
    }
    await s.send('Emulation.clearDeviceMetricsOverride');
    await sleep(300);

    // Every listed file plays in Chrome, each on its own element.
    const plays = await s.evaluate(`(async () => {
      const out = [];
      for (const src of window._sim.music().tracks) {
        const a = new Audio(src);
        a.muted = true;
        out.push(await new Promise((res) => {
          const to = setTimeout(() => res({ src, ok: false, why: 'timeout', t: a.currentTime }), 15000);
          a.addEventListener('error', () => { clearTimeout(to); res({ src, ok: false, why: 'error ' + (a.error && a.error.code) }); });
          a.addEventListener('timeupdate', function tu() {
            if (a.currentTime > 0.25) { clearTimeout(to); a.removeEventListener('timeupdate', tu); res({ src, ok: true, t: a.currentTime, dur: a.duration }); }
          });
          a.play().catch((e) => { clearTimeout(to); res({ src, ok: false, why: String(e) }); });
        }));
        a.pause();
      }
      return out;
    })()`, 120000);
    assert.equal(plays.length, TITLES.length, 'five files tried');
    for (const p of plays) {
      assert.ok(p.ok, `${p.src} plays: ${JSON.stringify(p)}`);
      assert.ok(p.dur > 60, `${p.src}: ${p.dur} s`);
    }

    // A visitor finds the credits in Tune (the start menu's Tune, or ⚙ TUNE
    // and Tab in flight), under Audio: on screen, not only in the DOM.
    // The panel's 0.2 s slide runs on animation frames, which CI's software
    // GPU draws few of (its first run here found the panel still off screen
    // 800 ms after the click): the slide is off for this check, which is
    // about where the open panel puts the credits, not the animation.
    const via = await s.evaluate(`(() => {
      document.getElementById('panel').style.transition = 'none';
      const m = document.body.classList.contains('menu-open') && document.getElementById('menuTune');
      (m || document.getElementById('gear')).click();
      return m ? 'menuTune' : 'gear';
    })()`);
    let slid = null;
    for (let i = 0; i < 100; i++) {
      slid = await s.evaluate(`(() => { const p = document.getElementById('panel').getBoundingClientRect(); return { left: p.left, right: p.right, w: innerWidth, fps: window._sim.looks.fps.avg }; })()`);
      if (slid.left < slid.w && Math.abs(slid.right - slid.w) < 1) break;
      await sleep(100);
    }
    const seen = await s.evaluate(`(() => {
      const vis = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      const p = document.getElementById('panel').getBoundingClientRect();
      const box = document.getElementById('musicCredits');
      box.scrollIntoView({ block: 'center' });
      const r = box.getBoundingClientRect();
      return { open: document.getElementById('panel').classList.contains('open'), panelOn: p.left < innerWidth && p.right > 0,
        box: vis(box) && r.height > 0 && r.left >= p.left - 1 && r.right <= p.right + 1,
        items: [...box.querySelectorAll('li')].map((li) => vis(li) && li.getBoundingClientRect().height > 0),
        links: [...box.querySelectorAll('a')].map((a) => vis(a) && a.getBoundingClientRect().width > 0) };
    })()`);
    assert.ok(seen.open && seen.panelOn, `Tune opens (${via}): ${JSON.stringify(seen)}, panel ${JSON.stringify(slid)}`);
    assert.ok(seen.box, 'the credits box is shown inside the panel');
    assert.deepEqual(seen.items, TITLES.map(() => true), 'each credit is shown');
    assert.deepEqual(seen.links, TITLES.map(() => true), 'each licence link is shown');

    const thrown = s.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    assert.deepEqual(thrown.map((e) => e.params.exceptionDetails.exception ? e.params.exceptionDetails.exception.description : e.params.exceptionDetails.text), [], 'no page error');
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
