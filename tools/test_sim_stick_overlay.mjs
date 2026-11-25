// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The stick overlay (sim-feel.js createStickOverlay, sim.html syncStickOverlay):
// the sticks the core flies on, drawn small on the HUD, Mode 2.
//   node tools/test_sim_stick_overlay.mjs
// The Chrome part (one fresh profile per input path: keyboard, radio,
// gamepad, touch) needs CHROME set to a Chrome binary locally, and is skipped
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
  STICK_OVERLAY_KEY, STICK_BOX_PX, STICK_BOX_PHONE_PX, STICK_GAP_PX, STICK_OVERLAY_BOTTOM_PX, STICK_CLEAR_PX,
  STICK_OVERLAY_PHONE, STICK_DOT,
  loadStickOverlay, saveStickOverlay, stickOverlayDefault, stickOverlayOn, stickDots, stickDotRadius,
  stickOverlayPlacement, createStickOverlay,
} from '../sim-feel.js';

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

test('the saved choice: on, off, or none; every access survives a storage that throws', () => {
  const s = memStore();
  assert.equal(STICK_OVERLAY_KEY, 'quadmathSimStickOverlay');
  assert.equal(loadStickOverlay(s), null, 'never chosen');
  assert.equal(saveStickOverlay(true, s), true);
  assert.equal(s.m.get(STICK_OVERLAY_KEY), '1');
  assert.equal(loadStickOverlay(s), true);
  saveStickOverlay(false, s);
  assert.equal(s.m.get(STICK_OVERLAY_KEY), '0');
  assert.equal(loadStickOverlay(s), false);
  assert.equal(loadStickOverlay(memStore({ [STICK_OVERLAY_KEY]: 'yes' })), null, 'anything else is no choice');
  assert.equal(loadStickOverlay(throwing), null);
  assert.equal(saveStickOverlay(true, throwing), false);
});

test('on by default for keyboard and touch, off for a radio or a gamepad; a saved choice wins', () => {
  assert.equal(stickOverlayDefault('keyboard'), true);
  assert.equal(stickOverlayDefault('touch'), true);
  assert.equal(stickOverlayDefault('radio'), false);
  assert.equal(stickOverlayDefault('gamepad'), false);
  for (const kind of ['keyboard', 'touch', 'radio', 'gamepad']) {
    assert.equal(stickOverlayOn(null, kind), stickOverlayDefault(kind), kind);
    assert.equal(stickOverlayOn(true, kind), true, kind);
    assert.equal(stickOverlayOn(false, kind), false, kind);
  }
});

test('the dots: Mode 2, inside their boxes, whatever the sticks say', () => {
  for (const box of [STICK_BOX_PX, STICK_BOX_PHONE_PX]) {
    const pad = stickDotRadius(box) + 2;
    const rest = stickDots({ r: 0, p: 0, y: 0, t: 0 }, box);
    assert.equal(rest.r.x, box / 2); assert.equal(rest.r.y, box / 2, 'roll/pitch centred');
    assert.equal(rest.l.x, box / 2); assert.equal(rest.l.y, box - pad, 'throttle down: the bottom');
    const full = stickDots({ r: 1, p: 1, y: 1, t: 1 }, box);
    assert.deepEqual(full, { l: { x: box - pad, y: pad }, r: { x: box - pad, y: pad } }, 'all the way: right and up');
    const low = stickDots({ r: -1, p: -1, y: -1, t: 0 }, box);
    assert.deepEqual(low, { l: { x: pad, y: box - pad }, r: { x: pad, y: box - pad } });
    // 3D: the throttle's middle (no thrust) is the box's middle.
    assert.equal(stickDots({ t: 0.5 }, box).l.y, box / 2);
    // Past the ends, or not a number: clamped, or at rest, never out of the box.
    for (const s of [{ r: 9, p: -9, y: 9, t: 9 }, { r: NaN, p: undefined, y: 'x', t: Infinity }, null]) {
      const d = stickDots(s, box);
      for (const v of [d.l.x, d.l.y, d.r.x, d.r.y]) assert.ok(v >= pad && v <= box - pad, JSON.stringify(s) + ' ' + v);
    }
  }
});

const overlaps = (a, b, m = 0) => a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m;
const boxOf = (p, vh) => ({ left: p.left, right: p.left + p.w, top: vh - p.bottom - p.h, bottom: vh - p.bottom });
// The page's footer height under touch, about: four 14 px lines on a phone's
// portrait width, two on its landscape width, one on a wide screen.
const footerOf = (vw) => (vw < 560 ? 57 : vw < 900 ? 29 : 15);
// The touch sticks as sim.html lays them out (#touchLayer .vstick): 12 px
// (--stick-inset-y) above the footer.
function touchSticks(vw, vh, size, insetX = 18, insetY = footerOf(vw) + 12) {
  return [
    { left: insetX, right: insetX + size, top: vh - insetY - size, bottom: vh - insetY },
    { left: vw - insetX - size, right: vw - insetX, top: vh - insetY - size, bottom: vh - insetY },
  ];
}

test('placement: bottom centre; with touch sticks, never over one, and up only when it has to', () => {
  const desk = stickOverlayPlacement({ vw: 1280, vh: 720, box: STICK_BOX_PX });
  assert.deepEqual(desk, { left: Math.round((1280 - (2 * STICK_BOX_PX + STICK_GAP_PX)) / 2), bottom: STICK_OVERLAY_BOTTOM_PX, w: 2 * STICK_BOX_PX + STICK_GAP_PX, h: STICK_BOX_PX });
  // A landscape phone with the default sticks: room between them, so it stays down.
  const land = stickOverlayPlacement({ vw: 844, vh: 390, box: STICK_BOX_PHONE_PX, sticks: touchSticks(844, 390, 112) });
  assert.equal(land.bottom, STICK_OVERLAY_BOTTOM_PX);
  // A portrait phone with big sticks: no room between, so above them.
  const sticks = touchSticks(390, 844, 168);
  const port = stickOverlayPlacement({ vw: 390, vh: 844, box: STICK_BOX_PHONE_PX, sticks });
  assert.equal(port.bottom, 844 - sticks[0].top + STICK_CLEAR_PX);
  // Every size the Touch sticks slider gives, on phones and tablets both ways: clear of both.
  for (const [vw, vh] of [[390, 844], [844, 390], [667, 375], [375, 667], [768, 1024], [1024, 768], [360, 740], [740, 360]]) {
    for (let size = 64; size <= 180; size += 4) {
      const s = touchSticks(vw, vh, size);
      for (const box of [STICK_BOX_PX, STICK_BOX_PHONE_PX]) {
        const p = stickOverlayPlacement({ vw, vh, box, sticks: s });
        const o = boxOf(p, vh);
        for (const b of s) assert.equal(overlaps(o, b), false, `${vw}x${vh} size ${size} box ${box}: over a stick ${JSON.stringify({ o, b })}`);
        assert.ok(o.top >= 0, `${vw}x${vh} size ${size}: on screen`);
      }
    }
  }
  // Without sticks a short window keeps it on screen.
  const tiny = stickOverlayPlacement({ vw: 300, vh: 100, box: STICK_BOX_PX });
  assert.ok(100 - tiny.bottom - tiny.h >= 0);
});

test('placement: above a three-line throttle readout, and clear of the key legend and the #feelHud card', () => {
  // #osdBC: 18 px up, three 12 px lines (about 16 px each) on the bf core while it refuses to arm.
  assert.ok(STICK_OVERLAY_BOTTOM_PX >= 18 + 3 * 16, 'bottom ' + STICK_OVERLAY_BOTTOM_PX);
  // The desktop HUD: the legend bottom left (about 274 x 307), the card bottom right (up to 240 wide with the arm hint).
  const hud = (vw, vh, cardW = 240) => [
    { left: 16, right: 290, top: vh - 323, bottom: vh - 16 },
    { left: vw - 16 - cardW, right: vw - 16, top: vh - 86 - 160, bottom: vh - 86 },
  ];
  const wide = stickOverlayPlacement({ vw: 1280, vh: 720, box: STICK_BOX_PX, avoid: hud(1280, 720) });
  assert.equal(wide.left, Math.round((1280 - wide.w) / 2), 'a wide screen: centred');
  assert.equal(wide.bottom, STICK_OVERLAY_BOTTOM_PX);
  for (const [vw, vh] of [[683, 720], [640, 720], [640, 600], [600, 700], [720, 540], [800, 600], [1024, 600]]) {
    for (const cardW of [108, 240]) {
      const avoid = hud(vw, vh, cardW);
      const p = stickOverlayPlacement({ vw, vh, box: STICK_BOX_PX, avoid });
      const o = boxOf(p, vh);
      for (const b of avoid) assert.equal(overlaps(o, b), false, `${vw}x${vh} card ${cardW}: over the HUD ${JSON.stringify({ o, b })}`);
      assert.ok(o.left >= 0 && o.right <= vw && o.top >= 0, `${vw}x${vh}: on screen`);
    }
  }
  // Room beside the legend: it slides along the bottom rather than climb.
  const slid = stickOverlayPlacement({ vw: 683, vh: 720, box: STICK_BOX_PX, avoid: hud(683, 720, 108) });
  assert.equal(slid.bottom, STICK_OVERLAY_BOTTOM_PX);
  assert.equal(slid.left, 290 + STICK_CLEAR_PX);
});

test('placement: above #osdBC wherever it sits; under touch that is on the footer', () => {
  // #osdBC as sim.html sets it under touch: 3 px above the footer, 54 px tall.
  const readoutAt = (vw, vh) => {
    const bottom = footerOf(vw) + 3;
    return { left: vw / 2 - 74, right: vw / 2 + 74, top: vh - bottom - 54, bottom: vh - bottom };
  };
  // At 18 px up, where STICK_OVERLAY_BOTTOM_PX already clears it: nothing moves.
  const at18 = { left: 566, right: 714, top: 720 - 72, bottom: 720 - 18 };
  assert.deepEqual(stickOverlayPlacement({ vw: 1280, vh: 720, box: STICK_BOX_PX, readout: at18 }), stickOverlayPlacement({ vw: 1280, vh: 720, box: STICK_BOX_PX }));
  // A landscape phone, two footer lines: the line rises with #osdBC, centred between the sticks.
  const r = readoutAt(812, 375);
  const p = stickOverlayPlacement({ vw: 812, vh: 375, box: STICK_BOX_PHONE_PX, sticks: touchSticks(812, 375, 112), readout: r });
  assert.equal(p.bottom, STICK_OVERLAY_BOTTOM_PX + (footerOf(812) + 3 - 18));
  assert.equal(p.left, Math.round((812 - p.w) / 2));
  // No readout (none laid out yet), or an empty box: the old line.
  assert.equal(stickOverlayPlacement({ vw: 812, vh: 375, box: STICK_BOX_PHONE_PX, sticks: touchSticks(812, 375, 112), readout: null }).bottom, STICK_OVERLAY_BOTTOM_PX);
  assert.equal(stickOverlayPlacement({ vw: 812, vh: 375, box: STICK_BOX_PHONE_PX, readout: { left: 0, right: 0, top: 0, bottom: 0 } }).bottom, STICK_OVERLAY_BOTTOM_PX);
  // Every stick size on phones and tablets both ways: clear of the sticks and of #osdBC, and on screen.
  for (const [vw, vh] of [[375, 812], [812, 375], [667, 375], [320, 568], [390, 844], [844, 390], [932, 430], [768, 1024], [1024, 768]]) {
    const ro = readoutAt(vw, vh);
    for (let size = 64; size <= 180; size += 4) {
      const s = touchSticks(vw, vh, size);
      for (const box of [STICK_BOX_PX, STICK_BOX_PHONE_PX]) {
        const o = boxOf(stickOverlayPlacement({ vw, vh, box, sticks: s, readout: ro }), vh);
        for (const b of s) assert.equal(overlaps(o, b), false, `${vw}x${vh} size ${size} box ${box}: over a stick ${JSON.stringify({ o, b })}`);
        assert.equal(overlaps(o, ro), false, `${vw}x${vh} size ${size} box ${box}: over #osdBC ${JSON.stringify({ o, ro })}`);
        assert.ok(o.top >= 0, `${vw}x${vh} size ${size}: on screen`);
      }
    }
  }
});

// A canvas stand-in: its 2D calls counted, its class list and style kept.
function fakeCanvas() {
  const calls = [];
  const classes = new Set();
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push(k); }), set: (o, k, v) => { o[k] = v; return true; } });
  return {
    width: 0, height: 0, style: {}, calls, classes, ctx,
    getContext: () => ctx,
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); calls.push('toggle:' + c + ':' + on); } },
  };
}

test('createStickOverlay: paints only when a dot moved, writes its class only when it changes, sizes for the screen', () => {
  const c = fakeCanvas();
  const o = createStickOverlay(c, { lineColor: 'rgba(1,2,3,.4)' });
  const p = o.place({ vw: 1000, vh: 600, phone: false, sticks: [], dpr: 2 });
  assert.equal(c.width, (2 * STICK_BOX_PX + STICK_GAP_PX) * 2, 'device pixels');
  assert.equal(c.height, STICK_BOX_PX * 2);
  assert.equal(c.style.width, p.w + 'px');
  assert.equal(c.style.left, p.left + 'px');
  assert.equal(c.style.bottom, STICK_OVERLAY_BOTTOM_PX + 'px');
  const s = { r: 0, p: 0, y: 0, t: 0 };
  assert.equal(o.draw(s), true, 'the first paint');
  const n = c.calls.length;
  assert.equal(o.draw({ ...s }), false, 'nothing moved: no paint');
  assert.equal(o.draw({ ...s, r: 0.001 }), false, 'a hair (under a quarter pixel): no paint');
  assert.equal(c.calls.length, n);
  assert.equal(o.draw({ ...s, r: 0.5 }), true);
  assert.equal(o.state.draws, 2);
  assert.deepEqual(o.state.drawn, { r: 0.5, p: 0, y: 0, t: 0 });
  assert.ok(c.calls.includes('arc') && c.calls.includes('clearRect'));
  assert.equal(c.ctx.strokeStyle, 'rgba(1,2,3,.4)', 'the page\'s --line');
  assert.equal(c.ctx.fillStyle, STICK_DOT, 'the dot is the last fill');
  // A resize repaints on the next draw, at the phone box.
  o.place({ vw: 400, vh: 800, phone: true, sticks: [], dpr: 1 });
  assert.equal(o.state.box, STICK_BOX_PHONE_PX);
  assert.equal(o.draw({ ...s, r: 0.5 }), true);
  o.setShown(true); o.setShown(true); o.setShown(false); o.setShown(false);
  assert.deepEqual(c.calls.filter((k) => k.startsWith('toggle:')), ['toggle:on:true', 'toggle:on:false']);
  // No canvas (or no 2D): nothing breaks.
  const none = createStickOverlay(null);
  none.place({ vw: 100, vh: 100 });
  assert.equal(none.draw(s), false);
  none.setShown(true);
});

test('sim.html: the overlay reads the merged stick in the frame loop, and hides as the HUD does', () => {
  assert.match(html, /<canvas id="stickOverlay" [^>]*aria-hidden="true"><\/canvas>/);
  assert.match(html, /#stickOverlay\{position:fixed;[^}]*pointer-events:none;display:none\}/);
  assert.match(html, /#stickOverlay\.on\{display:block\}/);
  for (const c of ['body.menu-open', 'body.builder-on', 'body.calibrating', 'body:has(#panel.open)']) {
    assert.ok(new RegExp(c.replace(/[.()#:]/g, '\\$&') + ' #stickOverlay[,{]').test(html), c + ' hides it');
  }
  // :has() in a rule of its own: a browser without it drops only that rule.
  assert.match(html, /\n\s*body:has\(#panel\.open\) #stickOverlay\{visibility:hidden\}/);
  assert.match(html, /body\.menu-open #stickOverlay,body\.builder-on #stickOverlay,body\.calibrating #stickOverlay\{visibility:hidden\}/);
  assert.equal(STICK_OVERLAY_PHONE, '(max-width:559px),(max-height:500px)', 'the page\'s phone breakpoints');
  // The checkbox: in the Camera section, before Quality.
  const cam = html.indexOf('<h2>Camera</h2>'), q = html.indexOf('<h2>Quality</h2>');
  const cb = html.indexOf('id="cbStickOverlay"');
  assert.ok(cam > 0 && cb > cam && cb < q, 'Camera section');
  // Drawn from `stick` (readInput's output, as handed to core.input), once a frame.
  const sync = extract('syncStickOverlay');
  assert.match(sync, /stickOverlay\.draw\(stick\)/);
  assert.doesNotMatch(sync, /getGamepads|\.axes|getBoundingClientRect|offset(Width|Height|Top|Left)|style\./, 'no raw pad, no layout read, no style write per frame');
  assert.match(sync, /feel\.hudVisible/, 'H hides it with the HUD');
  assert.match(sync, /replayOn/);
  for (const c of ['menu-open', 'builder-on', 'calibrating']) assert.ok(sync.includes(`b.contains('${c}')`), c + ': off in script too');
  assert.match(sync, /const shown=want&&!covered&&/);
  assert.match(extract('loop'), /\n\s+syncStickOverlay\(\);\r?\n/);
  assert.match(html, /core\.input\(held===stick\.aux\?stick:/, 'the core flies the same object');
  // Placed only on a resize and a touch-stick change, the footer's height
  // (which the touch sticks stand on) measured first.
  assert.match(html, /addEventListener\('resize',\(\)=>\{measureFooter\(\);placeStickOverlay\(\);\}\);/, 'on a resize');
  assert.match(html, /new ResizeObserver\(\(\)=>\{measureFooter\(\);placeStickOverlay\(\);\}\);\r?\n\s+for\(const id of \['legend','feelHud','hudArmSlot','osdBC'\]\)[^\n]*\r?\n\s+if\(footerEl\)ro\.observe\(footerEl\);/,
    'when a card it avoids, the arm hint\'s slot, #osdBC or the footer changes size');
  assert.match(html, /touchCtl=createTouchControls\(\{[\s\S]{0,400}?\nsyncTouchSettingsUI\(\);\r?\n(\/\/[^\n]*\r?\n)+measureFooter\(\);\r?\nplaceStickOverlay\(\);/, 'at boot, once the touch sticks exist');
  assert.match(extract('placeStickOverlay'), /getElementById\('legend'\)[\s\S]*getElementById\('feelHud'\)/);
  assert.match(extract('placeStickOverlay'), /const readout=touch\?box\(document\.getElementById\('osdBC'\)\):null;[\s\S]*stickOverlay\.place\(\{[^}]*readout/, 'above #osdBC wherever it sits, under touch');
  assert.match(extract('measureFooter'), /setProperty\('--footer-h',h\+'px'\)/);
  // Under touch the sticks and #osdBC stand on the footer (--hud-floor), and
  // while flying only its links take a touch.
  assert.match(html, /:root\{--hud-floor:max\(var\(--footer-h, 29px\), env\(safe-area-inset-bottom, 0px\)\)\}/);
  assert.match(html, /#touchLayer \.vstick\{position:absolute;bottom:calc\(var\(--hud-floor\) \+ var\(--stick-inset-y\)\);/);
  assert.match(html, /body\.touch-on #osdBC\{bottom:calc\(var\(--hud-floor\) \+ 3px\)\}/);
  assert.match(html, /body\.touch-on:not\(\.menu-open\) footer\{pointer-events:none\}/);
  assert.doesNotMatch(html, /footer a\{pointer-events:auto\}/, 'its links take no touch either while flying');
  assert.match(extract('enableTouchLayer'), /placeStickOverlay\(\);/);
  assert.match(extract('applyTouchFromUI'), /placeStickOverlay\(\);/);
  // The old #feelHud pads are gone (one stick display).
  assert.equal(html.includes('stick-pad'), false);
  assert.equal(read('sim-feel.js').includes('stickDotL'), false);
  // The input the overlay names is the one the OSD names: a radio as the page
  // knows one (padIsRadio: its USB id, name or shape, or a radio preset).
  assert.match(extract('stickInputKind'), /gpConnected\?\(padIsRadio\(\{id:gpName\}\)\?'radio':'gamepad'\):\(touchCtl&&touchCtl\.enabled\?'touch':'keyboard'\)/);
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

// Before the page's scripts: navigator.getGamepads() with one fake pad, as
// Chrome reports it; window.__pads drives its axes.
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, id: '', mapping: '', axes: [] };
  const make = () => ({ id: pads.id, index: 0, mapping: pads.mapping || '', connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on ? make() : null, null, null, null];
    },
  });
})()`;

// In the page: the overlay's state, the canvas's pixels under each dot, and
// where the rest of the HUD sits (a toggle must move none of it).
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(16); }
    return !!fn();
  };
  const el = () => document.getElementById('stickOverlay');
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  function px(x, y) {
    const c = el();
    const d = c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }
  // The colour under each dot, and under the left box's top-left inside corner.
  function pixels() {
    const o = s.stickOverlay();
    if (!o.dots) return null;
    const k = o.dpr, gap = o.box + 8;
    return { l: px(o.dots.l.x * k, o.dots.l.y * k), r: px((gap + o.dots.r.x) * k, o.dots.r.y * k), corner: px(6 * k, 6 * k) };
  }
  function seen() {
    const c = el(), cs = getComputedStyle(c), b = c.getBoundingClientRect();
    return { display: cs.display, visibility: cs.visibility, on: c.classList.contains('on'), pe: cs.pointerEvents, pos: cs.position,
      rect: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height } };
  }
  // Layout shifts the browser saw (the CLS entries), counted from here on.
  const shifts = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) shifts.push(e.value); }).observe({ type: 'layout-shift', buffered: false });
  } catch (e) { /* no layout-shift entries in this browser */ }
  // The boxes whose size does not tick with what they read: the OSD's corner
  // readouts do; #osdBC keeps one box (osdBcHtml), so it is in the list.
  function layout() {
    const out = { shifts: shifts.length };
    for (const id of ['feelHud', 'legend', 'touchLayer', 'menuBtn', 'gear', 'osdBC']) {
      const e = document.getElementById(id);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      out[id] = [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10);
    }
    out.doc = [document.documentElement.scrollWidth, document.documentElement.scrollHeight];
    return out;
  }
  const close = (a, b, eps) => ['r', 'p', 'y', 't'].every((k) => Math.abs(a[k] - b[k]) <= eps);
  const r2 = (v) => Math.round(v * 100) / 100;
  const upZ = (q) => 1 - 2 * (q.x * q.x + q.y * q.y);
  // The flight as the page has it, for a failure's message: armed, height,
  // which way up, the sticks, the turtle and its stick hold, the last disarm.
  function state() {
    const c = s.coreState(), e = s.easy(), b = s.bfCore(), k = s.stickOverlay().stick;
    return { armed: c.armed, z: r2(c.position.z), upZ: r2(upZ(c.quaternion)), stick: { r: r2(k.r), p: r2(k.p), y: r2(k.y), t: r2(k.t) },
      stickHold: e.stickHold, turtle: b ? b.turtlePhase : null, disarmReason: e.disarmReason, crashAt: e.crashAt, arm: e.arm, pilotError: s.testPilotError() };
  }
  // A hover on the bf core, flown on the sim's own samples (_sim.setTestPilot:
  // every 4 ms of sim time, on that tick's state, however long the frames run):
  // nothing until it is armed (a raised throttle would refuse the arm), then
  // level (roll and pitch centred), no yaw, and the throttle that holds it at
  // z0 metres, closed on the core's own thrust-to-weight. The keys still move
  // the page's sticks, which are what the overlay draws; the core flies this.
  // env: how it flew, from the arm on.
  const env = { samples: 0, maxZ: null, minUpZ: null, disarmed: false, turtle: false, hold: false };
  function hover(z0) {
    let t = 0;
    s.setTestPilot((cs) => {
      if (!cs.armed) {
        if (env.samples) env.disarmed = true;
        t = 0;
        return { r: 0, p: 0, y: 0, t: 0 };
      }
      const z = cs.position.z, up = upZ(cs.quaternion);
      const a = Math.max(-3, Math.min(3, 2.5 * (z0 - z) - 2.5 * cs.velocity.z));
      t = Math.max(0, Math.min(1, t + 0.01 * ((1 + a / 9.81) / Math.max(up, 0.5) - cs.twr)));
      env.samples++;
      env.maxZ = env.maxZ === null ? z : Math.max(env.maxZ, z);
      env.minUpZ = env.minUpZ === null ? up : Math.min(env.minUpZ, up);
      const b = s.bfCore();
      if (b && b.turtlePhase != null) env.turtle = true;
      if (s.easy().stickHold) env.hold = true;
      return { r: 0, p: 0, y: 0, t };
    });
    return true;
  }
  window.__so = { s, wait, until, frame, pixels, seen, layout, close, state, hover, env };
  return true;
})()`;

const green = (p) => !!p && p[1] > 150 && p[0] < 140 && p[3] > 200;
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const PAD = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';

test('the stick overlay in Chrome: keyboard, radio, gamepad, touch', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const origin = `http://127.0.0.1:${port}`;

  // A pass: a fresh Chrome profile, the given pad, storage and screen, the page at url.
  async function pass(url, seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-sticks-'));
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
      // SIM_CPU_THROTTLE=6: the page's CPU slowed 6x, to run as on a slow CI runner.
      if (process.env.SIM_CPU_THROTTLE) await cdp(ws, 'Emulation.setCPUThrottlingRate', { rate: +process.env.SIM_CPU_THROTTLE });
      if (seed.phone) {
        const [w, h] = seed.phone;
        await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
        await cdp(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await cdp(ws, 'Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', platform: 'Android' });
      } else {
        // A desktop screen (the headless window's own viewport is under the phone breakpoint's 500 px).
        await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      }
      await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PADS });
      // Same origin first, for localStorage and sessionStorage before the page's scripts.
      await cdp(ws, 'Page.navigate', { url: `${origin}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pad || { on: false, id: '', mapping: '', axes: [] })}));
        return true;
      })()`);
      await cdp(ws, 'Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(250);
        try {
          ready = await evaluate(ws, `!!(window._sim && window._sim.stickOverlay && window._simQueryBooted && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready && window._ttff)`);
        } catch (e) { /* the page is still loading */ }
      }
      assert.ok(ready, 'the page booted');
      await evaluate(ws, PAGE);
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const S = window.__so; ${body} })()`));
      const hold = (down, k, code, vk) => cdp(ws, 'Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      const key = async (k, code, vk) => { await hold(true, k, code, vk); await hold(false, k, code, vk); };
      await flow({ js, hold, key, cdp: (m, p) => cdp(ws, m, p) });
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
  // The overlay drawn: the values it painted are the page's sticks (the keys,
  // the pad or the touch sticks as the poll leaves them; the keyboard pass's
  // core flies a test pilot's hover instead), a frame apart at most (eps),
  // and the green dot is under each one.
  const tracks = async (js, label, eps = 0.02) => {
    const r = await js(`await S.frame(); await S.frame(); return JSON.stringify({ o: S.s.stickOverlay(), px: S.pixels(), seen: S.seen(), armed: S.s.coreState().armed });`);
    assert.equal(r.o.shown, true, label + ': shown');
    assert.equal(r.seen.display, 'block', label);
    assert.equal(r.seen.visibility, 'visible', label);
    assert.ok(r.o.drawn, label + ': painted');
    for (const k of ['r', 'p', 'y', 't']) assert.ok(Math.abs(r.o.drawn[k] - r.o.stick[k]) <= eps, `${label}: drawn ${k} ${r.o.drawn[k]} vs stick ${r.o.stick[k]}`);
    assert.ok(green(r.px.l) && green(r.px.r), label + ': a dot under each value ' + JSON.stringify(r.px));
    return r;
  };

  try {
    await t.test('keyboard: on by default; the dots follow the keys; H, the menu and the checkbox hide it, and none of it moves the HUD', async () => {
      await pass(sim('map=rig'), { storage: { quadmathSimInputChoice: 'keyboard' } }, async ({ js, hold, key, cdp: send }) => {
        let r = await js(`await S.frame(); return JSON.stringify({ o: S.s.stickOverlay(), seen: S.seen(), cb: document.getElementById('cbStickOverlay').checked, prompt: !!(window._feel && window._feel.promptOpen), menu: document.body.classList.contains('menu-open') });`);
        assert.equal(r.prompt, false); assert.equal(r.menu, false);
        assert.equal(r.o.kind, 'keyboard');
        assert.equal(r.o.saved, null, 'nothing saved');
        assert.equal(r.o.wanted, true, 'on for the keyboard');
        assert.equal(r.cb, true, 'the checkbox says so');
        assert.equal(r.seen.pe, 'none'); assert.equal(r.seen.pos, 'fixed');
        assert.equal(r.o.box, STICK_BOX_PX);
        assert.equal(r.seen.rect.w, 2 * STICK_BOX_PX + STICK_GAP_PX); assert.equal(r.seen.rect.h, STICK_BOX_PX);
        assert.equal(r.seen.rect.bottom, 720 - STICK_OVERLAY_BOTTOM_PX, 'bottom centre');
        assert.equal(r.seen.rect.left, (1280 - r.seen.rect.w) / 2);
        await tracks(js, 'at rest');
        // At rest, disarmed: the arm hint shows, in its own slot outside the
        // card, so the card's box is the one it has armed (checked below).
        const rest = await js(`await S.frame(); const h = document.getElementById('hudArmHint');
          return JSON.stringify({ L: S.layout(), armed: S.s.coreState().armed, hint: h.classList.contains('show') && getComputedStyle(h).display !== 'none', text: h.textContent, inCard: !!h.closest('.feel-meta') });`);
        assert.equal(rest.armed, false, 'disarmed at rest');
        assert.equal(rest.hint, true, 'the arm hint shows at rest: ' + rest.text);
        assert.equal(rest.inCard, false, 'the arm hint is outside the card');
        const cardBox = rest.L.feelHud;
        const osdBox = rest.L.osdBC;
        // Clear of the HUD around it, with the bf core's arming flags under the throttle bar.
        const clearOfHud = async (label) => {
          const h = await js(`await S.frame(); const b = (id) => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); const cs = e && getComputedStyle(e); return r && r.width > 0 && cs.opacity !== '0' && cs.visibility !== 'hidden' ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, lines: e.innerHTML.split('<br>').length } : null; };
            return JSON.stringify({ seen: S.seen(), osdBC: b('osdBC'), legend: b('legend'), feelHud: b('feelHud'), hudArmHint: b('hudArmHint'), core: S.s.core(),
              L: S.layout(), hudArm: document.getElementById('hudArm').textContent, hint: document.getElementById('hudArmHint').classList.contains('show'),
              st: { armed: S.s.coreState().armed, z: +S.s.coreState().position.z.toFixed(2), reason: S.s.easy().disarmReason, arm: S.s.easy().arm, t: +S.s.stickOverlay().stick.t.toFixed(2), hint: document.getElementById('hudArmHint').textContent } });`);
          for (const id of ['osdBC', 'legend', 'feelHud', 'hudArmHint']) {
            if (h[id]) assert.equal(overlaps(h.seen.rect, h[id]), false, `${label}: over #${id} ${JSON.stringify({ o: h.seen.rect, b: h[id] })}`);
          }
          // The arm hint, outside the card, covers neither the key legend nor the throttle bar.
          if (h.hudArmHint && h.legend) assert.equal(overlaps(h.hudArmHint, h.legend), false, `${label}: the arm hint over the key legend`);
          if (h.hudArmHint && h.osdBC) assert.equal(overlaps(h.hudArmHint, h.osdBC), false, `${label}: the arm hint over the throttle bar`);
          return h;
        };
        let hud = await clearOfHud('at rest');
        assert.equal(hud.core, 'bf');
        assert.ok(hud.osdBC, 'the throttle bar is up');
        // Each wait is on the page's own state, and must get there: a miss
        // fails here, with the flight's state, not later on a stale read.
        const until = async (label, cond, ms = 8000) => {
          const w = await js(`const ok = await S.until(() => (${cond}), ${ms}); return JSON.stringify({ ok, st: S.state() });`);
          assert.equal(w.ok, true, `${label}: ${JSON.stringify(w.st)}`);
          return w.st;
        };
        // The core flies a hover, not the keys (S.hover: a test pilot on the
        // sim's samples holds it level at 1.5 m) while the keys move the
        // page's sticks, which are what the overlay draws. Flown on the keys
        // (full throttle, roll, yaw, then pitch), it reached the rig's 6 m
        // ceiling in every run and often went over onto its back; now and then
        // it came down on its back, crashed, and the turtle that followed held
        // roll and pitch at zero, so the arrows moved nothing.
        await js(`return S.hover(1.5);`);
        // Throttle up (W: the keys' hover spring climbs; let go, it holds the
        // hover), then roll right and yaw right. Easy mode arms on the throttle once it has been down a
        // second (the page's own count), so W waits for that; roll and yaw wait
        // until it is armed and the pilot has it off the floor.
        await until('a second of low throttle', `(() => { const a = S.s.easy().arm; return !!a && a.lowS >= 1; })()`);
        await hold(true, 'w', 'KeyW', 87);
        await until('armed and off the floor', `S.s.coreState().armed && S.s.coreState().position.z > 0.5`);
        await hold(true, 'ArrowRight', 'ArrowRight', 39);
        await hold(true, 'd', 'KeyD', 68);
        // The keys move the sticks in sim time (W ramps the throttle 1.4 a
        // second): held until they are there, however fast this machine runs
        // the sim against the wall clock (a CI runner's is about half).
        await until('roll, yaw and throttle up', `(() => { const k = S.s.stickOverlay().stick; return k.r > 0.9 && k.y > 0.9 && k.t > 0.4; })()`);
        await hold(false, 'w', 'KeyW', 87);
        await js(`await S.wait(500); return 1;`);
        r = await tracks(js, 'keys held');
        hud = await clearOfHud('keys held');
        console.log('osdBC lines with W up: ' + hud.osdBC.lines);
        // Armed, as the HUD itself says (its label and the hint are written in
        // one update, read here in one snapshot, the read above: no extra round
        // trip while the keys still fly it).
        assert.equal(hud.hudArm, 'ARMED', 'armed by the throttle ' + JSON.stringify(hud.st));
        assert.equal(hud.hint, true, 'the hint for the keys (W up · S down) stays up while armed in Easy mode');
        assert.deepEqual(hud.L.feelHud, cardBox, '#feelHud: the same box armed as disarmed');
        assert.deepEqual(hud.L.osdBC, osdBox, '#osdBC: the same box armed as disarmed');
        assert.ok(r.o.stick.r > 0.9 && r.o.stick.y > 0.9 && r.o.stick.t > 0.2, 'the keys moved the sticks (W let go: about the hover) ' + JSON.stringify(r.o.stick));
        assert.ok(r.o.dots.r.x > r.o.box * 0.8 && r.o.dots.l.x > r.o.box * 0.8, 'both dots to the right');
        assert.ok(r.o.dots.l.y < r.o.box * 0.7, 'throttle up');
        assert.equal(green(r.px.corner), false, 'not painted green everywhere');
        await hold(false, 'ArrowRight', 'ArrowRight', 39);
        await hold(true, 'ArrowUp', 'ArrowUp', 38);
        // The arrows glide the stick in sim time too: held until it is there.
        await until('pitch forward', `S.s.stickOverlay().stick.p > 0.9`);
        r = await tracks(js, 'pitch forward');
        assert.ok(r.o.stick.p > 0.9 && r.o.dots.r.y < r.o.box * 0.2, 'pitch forward: the right dot up ' + JSON.stringify({ stick: r.o.stick, dots: r.o.dots, box: r.o.box, armed: r.armed }));
        await hold(false, 'ArrowUp', 'ArrowUp', 38);
        await hold(false, 'd', 'KeyD', 68);
        await js(`await S.wait(800); return 1;`);
        await tracks(js, 'let go', 0.05);

        // H: hidden with the rest of the HUD, and back.
        const before = await js(`return JSON.stringify(S.layout());`);
        await key('h', 'KeyH', 72);
        r = await js(`await S.frame(); return JSON.stringify({ o: S.s.stickOverlay(), seen: S.seen(), hud: window._feel.hudVisible, layout: S.layout() });`);
        assert.equal(r.hud, false);
        assert.equal(r.o.shown, false, 'H hides it');
        assert.equal(r.seen.display, 'none');
        await key('h', 'KeyH', 72);
        r = await js(`await S.frame(); return JSON.stringify({ o: S.s.stickOverlay(), layout: S.layout() });`);
        assert.equal(r.o.shown, true, 'H again shows it');
        assert.deepEqual(r.layout, before, 'H moved nothing else');

        // The hover held from the arm to here: the pilot flew the core on
        // every sample since, with no error, well under the ceiling, level,
        // never disarmed, never turtled, roll and pitch never held at zero.
        r = await js(`return JSON.stringify({ env: S.env, st: S.state() });`);
        console.log('hover: ' + JSON.stringify(r.env));
        assert.equal(r.st.pilotError, null, 'the pilot flew without an error');
        assert.ok(r.env.samples > 0, 'the pilot flew the core ' + JSON.stringify(r.env));
        assert.ok(r.env.maxZ < 3, 'under 3 m (the ceiling is at 6) ' + JSON.stringify(r.env));
        assert.ok(r.env.minUpZ > 0.9, 'level ' + JSON.stringify(r.env));
        assert.equal(r.env.disarmed, false, 'never disarmed ' + JSON.stringify(r.st));
        assert.equal(r.env.turtle, false, 'never turtled');
        assert.equal(r.env.hold, false, 'roll and pitch never held at zero');
        // A crash: still armed, it is dropped onto the floor at 25 m/s (as
        // test_sim_easy_mode.mjs drop()). The throttle comes down to under a
        // quarter first (S), as that test's 20 %: left where W put it, the quad
        // climbs straight off the floor and never comes to rest to be disarmed.
        // The pilot lets go of the core in the drop's own step, so the keys fly
        // it from there. The page disarms it as a crash and shows the arm hint;
        // the card keeps its box.
        await hold(true, 's', 'KeyS', 83);
        await until('throttle under a quarter', `S.s.stickOverlay().stick.t < 0.25`);
        await hold(false, 's', 'KeyS', 83);
        r = await js(`S.s.setTestPilot(null);
          const c = S.s.coreState(), was = c.armed;
          if (was) S.s.bfCore().teleport({ x: c.position.x, y: c.position.y, z: 2.5 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: -25 });
          const off = await S.until(() => !S.s.coreState().armed, 6000);
          await S.until(() => document.getElementById('hudArmHint').classList.contains('show'), 2000);
          await S.frame();
          return JSON.stringify({ was, off, reason: S.s.easy().disarmReason, L: S.layout(), hint: document.getElementById('hudArmHint').classList.contains('show') });`);
        console.log('crash: ' + JSON.stringify({ dropped: r.was, reason: r.reason }));
        assert.equal(r.was, true, 'armed until the drop');
        assert.equal(r.off, true, 'disarmed after the crash');
        assert.equal(r.reason, 'crash', 'as a crash');
        assert.equal(r.hint, true, 'the arm hint shows after the crash');
        assert.deepEqual(r.L.feelHud, cardBox, '#feelHud: the same box after a crash');
        assert.deepEqual(r.L.osdBC, osdBox, '#osdBC: the same box after a crash, with the won\'t-arm line');
        await clearOfHud('after the crash');

        // At rest after the crash, nothing flying: the readouts' widths, on the page's own formatters.
        // #hudBtns keeps one width whatever the fps readout says: 9, 10, 99 and
        // 100 fps on every quality label (the page's own formatter and labels).
        r = await js(`const el = document.getElementById('fpsHud'), btns = document.getElementById('hudBtns');
          const live = el.textContent, w0 = btns.getBoundingClientRect().width, labels = S.s.looks.qualityLabels, widths = {};
          for (const f of [9, 10, 99, 100]) for (const q of labels) { el.textContent = S.s.looks.fpsHudText(f, q); widths[f + ' fps ' + q] = btns.getBoundingClientRect().width; }
          el.textContent = live;
          return JSON.stringify({ live, w0, labels, widths });`);
        assert.ok(r.labels.length >= 3, 'every quality label ' + JSON.stringify(r.labels));
        assert.ok(r.w0 > 0, '#hudBtns is on screen');
        for (const [k, w] of Object.entries(r.widths)) assert.equal(w, r.w0, `#hudBtns width at ${k} (as at "${r.live}")`);
        // #osdBC keeps one box whatever it reads: the throttle at 0, 9, 10 and
        // 100 %, TWR under and over 10 and past what its field holds (a
        // hand-lightened build; reverse thrust in 3D), the flight clock up to
        // and past 999:59, and every arming flag at once on the won't-arm line
        // (the page's own markup, osdBcHtml).
        r = await js(`const el = document.getElementById('osdBC'), live = el.innerHTML, box = () => { const b = el.getBoundingClientRect(); return [b.width, b.height].map((v) => Math.round(v * 10) / 10); };
          const { armingFlagNames } = await import('/sim-core-adapter.js');
          const all = armingFlagNames(0x3fffffff).join(' '), w0 = box(), out = {};
          for (const [l, bar] of [['0', 0], ['9', 0.09], ['10', 0.1], ['100', 1]]) for (const twr of [0, 9.96, 10.5, 122.3, -10.4]) for (const t of [7, 600, 5999, 6000, 59999, 60061]) for (const why of ['', all]) {
            el.innerHTML = S.s.osdBcHtml(bar, l, t, twr, false, why); out[[l + '%', 'TWR ' + twr, t + ' s', why ? 'all flags' : 'armed'].join(', ')] = box(); }
          const d3 = {};
          for (const l of ['0', '+9', '-10', '+100', '-100']) for (const twr of [1.2, -10.4, -150, 12.5, 122.3]) { el.innerHTML = S.s.osdBcHtml(0.5, l, 7, twr, true, ''); d3[l + '% TWR ' + twr] = box(); }
          el.innerHTML = live;
          const txt = { flt: S.s.osdBcHtml(0, '0', 60061, 0, false, ''), twr2: S.s.osdBcHtml(0, '0', 7, 122.3, false, ''), twr3: S.s.osdBcHtml(0.5, '-100', 7, -150, true, '') };
          return JSON.stringify({ w0, out, d3, flags: all.length, txt });`);
        assert.ok(r.flags > 60, 'a long list of flags ' + r.flags);
        for (const [k, b] of Object.entries(r.out)) assert.deepEqual(b, r.w0, `#osdBC box at ${k}`);
        const d3 = Object.values(r.d3);
        for (const b of d3) assert.deepEqual(b, d3[0], '#osdBC box in 3D ' + JSON.stringify(r.d3));
        // The box can't see the clock run backwards: past 999:59 it holds there.
        assert.ok(r.txt.flt.includes('FLT 999:59'), 'the flight clock holds at 999:59 ' + JSON.stringify(r.txt.flt));
        assert.ok(r.txt.twr2.includes('TWR 99.9'), 'TWR holds at 99.9 ' + JSON.stringify(r.txt.twr2));
        assert.ok(r.txt.twr3.includes('TWR -99.9'), 'TWR holds at -99.9 in 3D ' + JSON.stringify(r.txt.twr3));
        await cardSweep(js, 'keyboard 1280x720');

        // The menu (Esc) hides it; closing it brings it back. The frame loop
        // (syncStickOverlay) shows or hides it, so each read waits for the
        // page's own class, then a frame, not a fixed 300 ms: a CI runner's
        // frame can be longer than that.
        await key('Escape', 'Escape', 27);
        r = await js(`await S.until(() => document.body.classList.contains('menu-open'), 5000); await S.frame(); return JSON.stringify({ menu: document.body.classList.contains('menu-open'), seen: S.seen(), o: S.s.stickOverlay() });`);
        assert.equal(r.menu, true);
        assert.equal(r.o.shown, false, 'not over the menu');
        assert.equal(r.seen.display, 'none');
        assert.equal(r.seen.visibility, 'hidden', 'and the CSS rule says so too');
        await key('Escape', 'Escape', 27);
        r = await js(`await S.until(() => !document.body.classList.contains('menu-open'), 5000); await S.frame(); return JSON.stringify({ menu: document.body.classList.contains('menu-open'), seen: S.seen() });`);
        assert.equal(r.menu, false);
        assert.equal(r.seen.visibility, 'visible');
        assert.equal(r.seen.display, 'block');

        // The checkbox: off, saved, and nothing else on the page moves.
        r = await js(`
          const cb = document.getElementById('cbStickOverlay');
          const a = S.layout();
          cb.click();
          await S.frame();
          const off = { o: S.s.stickOverlay(), seen: S.seen(), saved: localStorage.getItem('${STICK_OVERLAY_KEY}'), layout: S.layout() };
          cb.click();
          await S.frame();
          const on = { o: S.s.stickOverlay(), saved: localStorage.getItem('${STICK_OVERLAY_KEY}'), layout: S.layout() };
          return JSON.stringify({ a, off, on });`);
        assert.equal(r.off.o.shown, false); assert.equal(r.off.seen.display, 'none');
        assert.equal(r.off.saved, '0', 'saved off');
        assert.deepEqual(r.off.layout, r.a, 'off: no layout shift');
        assert.equal(r.on.o.shown, true);
        assert.equal(r.on.saved, '1', 'saved on');
        assert.deepEqual(r.on.layout, r.a, 'on: no layout shift');
        // The Tune panel (Tab) covers it as it covers #feelHud.
        await key('Tab', 'Tab', 9);
        r = await js(`await S.until(() => document.getElementById('panel').classList.contains('open'), 5000); await S.frame(); return JSON.stringify({ open: document.getElementById('panel').classList.contains('open'), seen: S.seen() });`);
        assert.equal(r.open, true);
        assert.equal(r.seen.display, 'none', 'not under the Tune panel');
        await key('Tab', 'Tab', 9);
        r = await js(`await S.until(() => !document.getElementById('panel').classList.contains('open'), 5000); await S.frame(); return JSON.stringify({ open: document.getElementById('panel').classList.contains('open'), seen: S.seen() });`);
        assert.equal(r.open, false);
        assert.equal(r.seen.display, 'block');
        // A narrow window (a laptop screen split in two): still clear of the legend and the card.
        for (const [w, h] of [[683, 720], [640, 600]]) {
          await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
          await js(`await S.wait(300); return 1;`);
          const n = await clearOfHud(`${w}x${h}`);
          assert.ok(n.seen.rect.left >= 0 && n.seen.rect.right <= w, `${w}x${h}: on screen`);
        }
      });
    });

    await t.test('radio: off by default; switched on, the dots are the mapped channels, not the raw axes', async () => {
      // Sticks low and centred first: the safety gate opens.
      await pass(sim('map=rig'), { pad: { on: true, id: TX, axes: [0, 0, -1, 0, -1, -1, -1, -1] } }, async ({ js }) => {
        let r = await js(`await S.wait(600); return JSON.stringify({ o: S.s.stickOverlay(), seen: S.seen(), cb: document.getElementById('cbStickOverlay').checked });`);
        assert.equal(r.o.kind, 'radio');
        assert.equal(r.o.wanted, false, 'off for a radio');
        assert.equal(r.cb, false);
        assert.equal(r.seen.display, 'none');
        r = await js(`document.getElementById('cbStickOverlay').click(); window.__pads.axes = [0.5, -0.4, 0.2, -0.6, -1, -1, -1, -1]; await S.wait(500); return JSON.stringify({ saved: localStorage.getItem('${STICK_OVERLAY_KEY}') });`);
        assert.equal(r.saved, '1');
        r = await tracks(js, 'radio');
        // TX16S channels: roll, pitch, throttle (-1..1 to 0..1), yaw.
        assert.ok(S_near(r.o.stick, { r: 0.5, p: -0.4, t: 0.6, y: -0.6 }, 0.03), 'mapped ' + JSON.stringify(r.o.stick));
        assert.ok(Math.abs(r.o.drawn.t - 0.6) < 0.03, 'the throttle drawn is the mapped 0.6, not the raw axis 0.2');
      });
    });

    await t.test('gamepad: off by default, a saved choice shows it; the dots follow the pad', async () => {
      await pass(sim('map=rig'), { pad: { on: true, id: PAD, mapping: 'standard', axes: [0, 0, 0, 0] }, storage: { [STICK_OVERLAY_KEY]: '1', quadmathSimInputChoice: 'radio' } }, async ({ js }) => {
        let r = await js(`await S.wait(600); return JSON.stringify({ o: S.s.stickOverlay(), prompt: !!(window._feel && window._feel.promptOpen) });`);
        assert.equal(r.prompt, false, 'no first-run prompt');
        assert.equal(r.o.kind, 'gamepad');
        assert.equal(stickOverlayDefault(r.o.kind), false);
        assert.equal(r.o.saved, true, 'the saved choice');
        assert.equal(r.o.wanted, true);
        await js(`window.__pads.axes = [0.7, -0.5, 0.3, 0.4]; await S.wait(500); return 1;`);
        r = await tracks(js, 'gamepad');
        assert.ok(r.o.stick.y > 0.5 && r.o.stick.r > 0.2 && r.o.stick.p < -0.2 && r.o.stick.t > 0.3, 'the pad moved the sticks ' + JSON.stringify(r.o.stick));
      });
    });

    await t.test('touch: on by default, the phone box, clear of the thumb sticks; real touches move the dots; big sticks push it up', async () => {
      await pass(sim('map=rig'), { phone: [844, 390], storage: { quadmathSimInputChoice: 'touch' } }, async ({ js, cdp: send }) => {
        let ok = await js(`return JSON.stringify(await S.until(() => document.body.classList.contains('touch-on'), 8000));`);
        assert.equal(ok, true, 'touch sticks on');
        let r = await js(`await S.frame(); const st = [...document.querySelectorAll('#touchLayer .vstick')].map((e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; });
          return JSON.stringify({ o: S.s.stickOverlay(), seen: S.seen(), sticks: st, prompt: !!(window._feel && window._feel.promptOpen) });`);
        assert.equal(r.o.kind, 'touch');
        assert.equal(r.o.wanted, true, 'on for touch');
        assert.equal(r.o.box, STICK_BOX_PHONE_PX, 'the phone box');
        assert.equal(r.sticks.length, 2);
        for (const b of r.sticks) assert.equal(overlaps(r.seen.rect, b), false, 'never over a stick ' + JSON.stringify({ o: r.seen.rect, b }));
        await hintClear(js, r, 'landscape', true);
        // The Coach card comes down the middle from the top: the hint hides
        // while it is up, and its slot keeps its box (nothing moves).
        ok = await js(`const sl = document.getElementById('hudArmSlot'), coach = document.getElementById('coachHud'), bx = () => { const b = sl.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
          const a = bx(); coach.classList.add('show'); const vis = getComputedStyle(sl).visibility, b = bx(); coach.classList.remove('show');
          return JSON.stringify({ same: JSON.stringify(a) === JSON.stringify(b), vis, back: getComputedStyle(sl).visibility });`);
        assert.equal(ok.vis, 'hidden', 'the hint hides under the Coach card');
        assert.equal(ok.same, true, 'its slot keeps its box');
        assert.equal(ok.back, 'visible');
        await tracks(js, 'touch at rest');
        // A thumb on the right stick, pushed right and up.
        const [L, R] = r.sticks;
        const c = (b) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
        const rc = c(R), lc = c(L);
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rc.x, y: rc.y, id: 1 }] });
        for (let i = 1; i <= 6; i++) {
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rc.x + i * 7, y: rc.y - i * 6, id: 1 }] });
          await sleep(30);
        }
        await js(`await S.wait(200); return 1;`);
        r = await tracks(js, 'right thumb');
        assert.ok(r.o.stick.r > 0.3 && r.o.stick.p > 0.3, 'roll right, pitch forward ' + JSON.stringify(r.o.stick));
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // A thumb on the left stick, up: throttle (it holds where it is left).
        // It moves by the thumb's travel from the bottom (72 px of a 112 px
        // stick), not to where the thumb landed.
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lc.x, y: lc.y, id: 2 }] });
        for (let i = 1; i <= 6; i++) {
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: lc.x, y: lc.y - i * 12, id: 2 }] });
          await sleep(30);
        }
        await js(`await S.wait(200); return 1;`);
        r = await tracks(js, 'left thumb');
        assert.ok(r.o.stick.t > 0.6, 'throttle up ' + JSON.stringify(r.o.stick));
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

        // Portrait with the biggest sticks: no room between them, so it moves up, never over them.
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
        r = await js(`
          const s = document.getElementById('s_touchSize');
          s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true }));
          await S.wait(400); await S.frame();
          const st = [...document.querySelectorAll('#touchLayer .vstick')].map((e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; });
          return JSON.stringify({ o: S.s.stickOverlay(), seen: S.seen(), sticks: st, vh: innerHeight });`);
        assert.ok(r.sticks[0].right - r.sticks[0].left >= 160, 'big sticks ' + JSON.stringify(r.sticks[0]));
        for (const b of r.sticks) assert.equal(overlaps(r.seen.rect, b), false, 'portrait: never over a stick ' + JSON.stringify({ o: r.seen.rect, b }));
        assert.ok(r.seen.rect.bottom <= Math.min(...r.sticks.map((b) => b.top)), 'above the sticks');
        assert.ok(r.seen.rect.top >= 0);
        await hintClear(js, r, 'portrait');
      });
    });

    // A first-time pilot's thumb: on the left stick's knob, where it rests,
    // then up. The footer (one to four lines by width, fixed at the bottom,
    // z-index 45) once sat over the knob and the bottom of the stick, so the
    // touch went to the footer: no throttle, no arm. And a first touch set the
    // throttle where it landed (the stick's centre: 50 %, over the Air65's
    // 37.5 % hover); now it moves by the thumb's travel from where it is.
    // Then a crash, and the same gesture arms again. Each screen a fresh page,
    // and the layout checked at the other screens of its kind (a tablet too).
    const HOVER = 0.375; // vendor/sim-core/airframes/air65.json
    for (const [w, h, more] of [[375, 812, [[320, 568], [390, 844]]], [812, 375, [[932, 430], [844, 390]]], [667, 375, []], [1024, 768, [[768, 1024]]]]) {
      await t.test(`touch ${w}x${h}: the left knob and the stick's bottom take the thumb, clear of the footer; a first touch keeps the throttle; thumb on the knob and up arms, and again after a crash`, async () => {
        await pass(sim('map=rig'), { phone: [w, h], storage: { quadmathSimInputChoice: 'touch' } }, async ({ js, cdp: send }) => {
          const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
          const slide = async (x, y, dy, n = 10) => {
            for (let i = 1; i <= n; i++) { await touch('touchMove', x, y + (i * dy) / n); await sleep(30); }
          };
          const thr = async () => (await js(`await S.frame(); await S.frame(); return JSON.stringify(S.state().stick.t);`));
          const on = await js(`return JSON.stringify(await S.until(() => document.body.classList.contains('touch-on') && !document.body.classList.contains('menu-open'), 8000));`);
          assert.equal(on, true, 'flying on touch sticks');
          const g = await footerClear(js, `${w}x${h}`);
          // A first touch anywhere on the throttle stick leaves the throttle
          // at the bottom: its centre, its top, its bottom.
          const o = { x: (g.stick.left + g.stick.right) / 2, y: (g.stick.top + g.stick.bottom) / 2 };
          for (const [name, y] of [['centre', o.y], ['top', g.stick.top + 6], ['bottom', g.stick.bottom - 6]]) {
            await touch('touchStart', o.x, y);
            const t0 = await thr();
            await touch('touchEnd');
            assert.ok(t0 <= HOVER + 0.03, `a first touch at the stick's ${name}: throttle ${t0}, not over hover (${HOVER})`);
            assert.ok(t0 <= 0.05, `a first touch at the stick's ${name} leaves the throttle at the bottom (${t0})`);
          }
          // 1 s of the throttle at the bottom on the page's own hold count
          // (Easy mode's auto-arm, sim-3d.js stepEasyArm), with the bf core in:
          // an arm asked before it loads is refused and the hold starts over.
          const held = async (what) => {
            const r = await js(`const ok = await S.until(() => S.s.core() === 'bf' && S.s.easy().arm && S.s.easy().arm.lowS >= 1, 30000);
              return JSON.stringify({ ok, core: S.s.core(), easy: S.s.easy().mode, arm: S.s.easy().arm, st: S.state() });`);
            assert.ok(r.ok, `${what}: the bf core in, the throttle held down 1 s ` + JSON.stringify(r));
            assert.equal(r.st.armed, false, `${what}: not armed before the thumb`);
          };
          // The thumb on the knob, then 50 px up.
          const armByThumb = async (what) => {
            await touch('touchStart', g.knob.x, g.knob.y);
            await slide(g.knob.x, g.knob.y, -50);
            const r = await js(`const ok = await S.until(() => S.s.coreState().armed, 10000); return JSON.stringify({ ok, st: S.state() });`);
            assert.ok(r.ok, `${what}: thumb on the knob and up: armed on the bf core ` + JSON.stringify(r.st));
            assert.ok(Math.abs(r.st.stick.t - 50 / (g.stick.bottom - g.stick.top)) < 0.06, `${what}: the throttle moved by the thumb's travel ` + JSON.stringify(r.st.stick));
            await touch('touchEnd');
          };
          // The arm hint says that gesture.
          const hint = () => js(`await S.frame(); const e = document.getElementById('hudArmHint'); return JSON.stringify({ shown: e.classList.contains('show'), text: e.textContent });`);
          let hh = await hint();
          assert.deepEqual(hh, { shown: true, text: 'Thumb on the left stick, slide up to fly' }, 'the hint at rest');
          await held('first arm');
          await armByThumb('first arm');
          // A crash: dropped onto the floor at speed (as test_sim_easy_mode),
          // the throttle under hover first (a thumb on the knob, down 28 px:
          // about 20 %), or a quad left at 45 % flies on and never comes to rest.
          const k0 = await js(`const b = document.querySelector('#touchLayer .vstick.left i').getBoundingClientRect(); return JSON.stringify({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });`);
          await touch('touchStart', k0.x, k0.y);
          await slide(k0.x, k0.y, 28, 4);
          await touch('touchEnd');
          const t20 = await thr();
          assert.ok(t20 > 0.12 && t20 < HOVER, 'the throttle under hover, not at the bottom ' + t20);
          let r = await js(`const c = S.s.coreState();
            S.s.bfCore().teleport({ x: c.position.x, y: c.position.y, z: 2.5 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: -25 });
            const off = await S.until(() => !S.s.coreState().armed, 8000);
            return JSON.stringify({ off, reason: S.s.easy().disarmReason, st: S.state() });`);
          assert.equal(r.off, true, 'disarmed by the crash ' + JSON.stringify(r));
          hh = await hint();
          assert.deepEqual(hh, { shown: true, text: 'Left stick down 1 s, then slide up to fly' }, 'the hint with the throttle left up');
          // Re-arm, a thumb's way: on the stick, slide down past the bottom,
          // lift; the hold; then the knob and up, as the first time.
          const k = await js(`const b = document.querySelector('#touchLayer .vstick.left i').getBoundingClientRect(); return JSON.stringify({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });`);
          await touch('touchStart', k.x, k.y);
          await slide(k.x, k.y, 90);
          await touch('touchEnd');
          assert.ok((await thr()) <= 0.05, 'the throttle down at the bottom');
          await held('after the crash');
          await armByThumb('after the crash');
          // The same layout at the other screens of its kind.
          for (const [w2, h2] of more) {
            await send('Emulation.setDeviceMetricsOverride', { width: w2, height: h2, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: w2 > h2 ? 'landscapePrimary' : 'portraitPrimary', angle: w2 > h2 ? 90 : 0 } });
            await js(`await S.wait(400); await S.frame(); return 1;`);
            await footerClear(js, `${w2}x${h2}`);
          }
          await menuLinks(js, `${w}x${h}`);
        });
      });
    }
  } finally {
    server.close();
  }
});

// Flying on touch, at this screen: the left stick's knob and the bottom of the
// stick (its last 5 %, where the throttle-down band lay when a touch set the
// throttle where it landed) are the stick's to the hit test, and all of the
// stick, the knob, #osdBC and the stick overlay sit above the footer, which
// stays on screen and lets a touch through, its links too (with the menu
// open they tap: menuLinks). Returns the knob's centre.
async function footerClear(js, label) {
  const g = await js(`await S.frame();
    const R = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const mid = (b) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
    const what = (p) => { const e = document.elementFromPoint(p.x, p.y); return e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : '') : null; };
    const inside = (p, sel) => { const e = document.elementFromPoint(p.x, p.y); return !!(e && e.closest && e.closest(sel)); };
    const L = document.querySelector('#touchLayer .vstick.left'), stick = R(L), knobBox = R(L.querySelector('i'));
    const o = mid(stick), rad = (stick.right - stick.left) / 2, knob = mid(knobBox);
    const tAt = (p) => Math.max(0, Math.min(1, ((o.y - p.y) / rad + 1) / 2));
    const band = [[0, 0.92], [0, 0.98], [-0.2, 0.92], [0.2, 0.92]].map(([dx, dy]) => ({ x: o.x + dx * rad, y: o.y + dy * rad }));
    const f = document.querySelector('footer'), fs = getComputedStyle(f);
    const logo = R(f.querySelector('.sf-logo')), lic = R(f.querySelector('.sf-license')), credit = R(f.querySelector('.sf-credit'));
    return JSON.stringify({ vw: innerWidth, vh: innerHeight, stick, knob, knobBox, rad,
      knobHit: { on: inside(knob, '#touchLayer .vstick.left'), what: what(knob), t: tAt(knob) },
      band: band.map((p) => ({ p, t: tAt(p), on: inside(p, '#touchLayer .vstick.left'), what: what(p) })),
      footer: R(f), shown: fs.display !== 'none' && fs.visibility === 'visible' && +fs.opacity === 1, lic, logo,
      logoHit: inside(mid(logo), 'a.sf-logo'), licHit: inside(mid(lic), 'a.sf-license'), creditHit: what(mid(credit)), creditIn: inside(mid(credit), 'footer'),
      osdBC: R(document.getElementById('osdBC')), overlay: S.seen().rect, sticks: [...document.querySelectorAll('#touchLayer .vstick')].map(R) });`);
  console.log(`touch ${label}: footer ${JSON.stringify(g.footer)}, left stick ${JSON.stringify(g.stick)}, knob ${JSON.stringify(g.knobHit)}, #osdBC ${JSON.stringify(g.osdBC)}, overlay ${JSON.stringify(g.overlay)}`);
  assert.equal(g.knobHit.on, true, `${label}: the knob is the left stick's to a thumb, not ${g.knobHit.what}`);
  for (const b of g.band) {
    assert.ok(b.t <= 0.05, `${label}: a point in the stick's bottom 5 % ${JSON.stringify(b)}`);
    assert.equal(b.on, true, `${label}: the stick's bottom is the left stick's to a thumb, not ${b.what} ${JSON.stringify(b.p)}`);
  }
  for (const s of g.sticks) assert.ok(s.bottom <= g.footer.top, `${label}: a stick above the footer ${JSON.stringify({ s, footer: g.footer })}`);
  assert.ok(g.knobBox.bottom <= g.footer.top, `${label}: the knob above the footer ${JSON.stringify({ knob: g.knobBox, footer: g.footer })}`);
  assert.ok(g.osdBC.bottom <= g.footer.top, `${label}: #osdBC above the footer ${JSON.stringify({ osdBC: g.osdBC, footer: g.footer })}`);
  assert.equal(overlaps(g.overlay, g.osdBC), false, `${label}: the stick overlay clear of #osdBC ${JSON.stringify({ o: g.overlay, osdBC: g.osdBC })}`);
  for (const s of g.sticks) assert.equal(overlaps(g.overlay, s), false, `${label}: the stick overlay clear of a stick ${JSON.stringify({ o: g.overlay, s })}`);
  assert.equal(g.shown, true, `${label}: the footer shows`);
  assert.ok(g.lic.top >= g.footer.top && g.lic.bottom <= g.vh && g.lic.right <= g.vw && g.lic.left >= 0, `${label}: the licence notice on screen ${JSON.stringify(g.lic)}`);
  assert.equal(g.logoHit, false, `${label}: the footer's QuadMath link takes no touch while flying`);
  assert.equal(g.licHit, false, `${label}: the footer's licence link takes no touch while flying`);
  assert.equal(g.creditIn, false, `${label}: the rest of the footer lets a touch through, not ${g.creditHit}`);
  return g;
}

// Not flying (the menu open, from its button), the footer's two links are
// what a tap at each one's centre hits.
async function menuLinks(js, label) {
  const m = await js(`document.getElementById('menuBtn').click();
    await S.until(() => document.body.classList.contains('menu-open'), 3000); await S.frame();
    const f = document.querySelector('footer');
    const hit = (sel) => { const b = f.querySelector(sel).getBoundingClientRect(); const e = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
      return e ? (e.closest && e.closest(sel) ? true : e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')) : null; };
    return JSON.stringify({ menu: document.body.classList.contains('menu-open'), logo: hit('a.sf-logo'), lic: hit('a.sf-license') });`);
  assert.deepEqual(m, { menu: true, logo: true, lic: true }, `${label}: with the menu open, the footer's links tap`);
}

// Under touch, the arm hint's slot is laid out (whether the hint shows or not)
// and covers neither thumb stick nor the stick overlay, and stays on screen;
// with shown, the hint shows in it. r: { sticks, seen } as the touch test reads them.
async function hintClear(js, r, label, shown = false) {
  const h = await js(`await S.frame(); const e = document.getElementById('hudArmHint'), b = document.getElementById('hudArmSlot').getBoundingClientRect();
    return JSON.stringify({ laid: b.width > 0 && b.height > 0, shown: e.classList.contains('show') && getComputedStyle(e).display !== 'none', box: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, vw: innerWidth, vh: innerHeight, text: e.textContent });`);
  console.log(`touch ${label}: arm hint slot ${h.laid ? JSON.stringify(h.box) : 'not laid out'}, ${h.shown ? 'showing "' + h.text + '"' : 'hidden'}`);
  assert.equal(h.laid, true, `${label}: the arm hint's slot is laid out`);
  if (shown) assert.equal(h.shown, true, `${label}: the arm hint shows at rest, disarmed`);
  for (const s of r.sticks) assert.equal(overlaps(h.box, s), false, `${label}: the arm hint over a thumb stick ${JSON.stringify({ h: h.box, s })}`);
  assert.equal(overlaps(h.box, r.seen.rect), false, `${label}: the arm hint over the stick overlay`);
  assert.ok(h.box.left >= 0 && h.box.right <= h.vw && h.box.top >= 0 && h.box.bottom <= h.vh, `${label}: the arm hint on screen ${JSON.stringify(h.box)}`);
  await cardSweep(js, label);
}

// #feelHud and the arm hint's slot keep one box whatever the card reads, in
// one synchronous sweep through the page's own formatters (sim-feel.js
// updateHud, sim-3d.js throttleHudText): the throttle 0-100 % and 3D's
// -100-+100 %, BATT off and every reading from 2.50 to 8.50 V (1S and 2S),
// every flight mode, armed and disarmed. The next frame puts the live
// readouts back.
async function cardSweep(js, label) {
  const c = await js(`const { throttleHudText } = await import('/sim-3d.js');
    const card = document.getElementById('feelHud'), slot = document.getElementById('hudArmSlot');
    const bx = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(','); };
    const base = { stick: { r: 0, p: 0, y: 0, t: 0 }, battV: 4.2, battOn: true, mode: 'angle', armed: false, threeD: false, quad: 'AIR65' };
    const seen = {};
    const u = (k, o) => { const s = { ...base, ...o }; s.thrText = throttleHudText(s.stick.t, s.threeD); window._feel.updateHud(s); const b = bx(card) + ' | ' + bx(slot); (seen[b] = seen[b] || []).push(k); };
    for (let i = 0; i <= 100; i++) for (const threeD of [false, true]) u('THR stick ' + i + (threeD ? ' 3D' : ''), { stick: { r: 0, p: 0, y: 0, t: i / 100 }, threeD });
    for (let v = 250; v <= 850; v++) u('BATT ' + (v / 100).toFixed(2), { battV: v / 100 });
    for (const mode of ['angle', 'horizon', 'acro']) for (const armed of [false, true]) for (const battOn of [false, true]) for (const threeD of [false, true])
      u([mode, armed ? 'armed' : 'disarmed', battOn ? 'BATT on' : 'BATT off', threeD ? '3D' : '2D'].join(' '), { mode, armed, battOn, threeD });
    // The quad that flies (sim.html flyingQuadName), each name with the widest BATT.
    for (const quad of ['AIR65', 'FRACTAL75', '85 CLASSIC', '65 CLASSIC', '75 CLASSIC']) u('quad ' + quad, { quad, battV: 4.44, mode: 'horizon', armed: true });
    // The card took the sweep (updateHud writes nothing while the HUD is hidden).
    u('probe', { battV: 4.44, mode: 'horizon', armed: true });
    const probe = ['hudQuad', 'hudBatt', 'hudMode', 'hudArm'].map((id) => document.getElementById(id).textContent).join(' ');
    return JSON.stringify({ probe, groups: Object.entries(seen).map(([b, ks]) => ({ box: b, n: ks.length, e: ks.slice(0, 3) })) });`);
  console.log(`${label}: #feelHud | hint slot boxes across the card sweep ${JSON.stringify(c.groups)}`);
  assert.equal(c.probe, 'AIR65 BATT 4.44V HORIZON ARMED', `${label}: the card took the sweep`);
  assert.ok(c.groups.reduce((n, x) => n + x.n, 0) > 800, `${label}: the sweep ran ${JSON.stringify(c.groups)}`);
  assert.equal(c.groups.length, 1, `${label}: #feelHud and the hint slot keep one box whatever the card reads ${JSON.stringify(c.groups)}`);
}

function S_near(a, b, eps) {
  return ['r', 'p', 'y', 't'].every((k) => Math.abs(a[k] - b[k]) <= eps);
}
