// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Headless Chrome: the race offer, the race count and the sprints (sim.html
// tickRaceOffer, raceThisMap, startRun's countNote('race'), flyFullLoop).
//   - In node: each sprint (sim-tracks.js BUILTIN_SPRINTS) is its loop's
//     first gates (Rig 5, House 6, Warehouse 5) from the loop's pad, listed
//     after its loop (a map's first track is still its loop), with a pace
//     ghost and a board of its own; the Bando has none. The test's flight of
//     the Rig Sprint clears the Rig's boxes and passes the Worker's check.
//   - Desktop, keyboard (flown at 640x360, placed at 1280x720): T armed
//     before the offer does nothing. Free flight on the Rig, 30 s of sim time
//     in the air, and the prompt shows, not before: "RACE THE RIG · 5 gates
//     · T" (the Rig Sprint), off the view's centre and clear of the HUD (the
//     Warehouse's longer name too), for 10 s of sim time. The next disarm
//     shows it once more, held while Tune is open (which hides it) until Tune
//     closes; the disarm after that does not. Disarmed, T from a text or
//     number box does nothing; T itself flies the Rig Sprint as the Tracks
//     picker does: on its pad, the START ring there, the arm hint up. Space
//     arms, the quad flies through gate 0, and the race ping goes out once:
//     { event: 'race', class: 65, core: 'bf', input: 'keyboard' }. T armed in
//     the race does nothing.
//   - Desktop, a gamepad (Angle): the offer at 30 s; T while it is up, from
//     the air: the Rig Sprint, the arm hint at once (two frames); gate 0, the
//     race ping with input 'gamepad'.
//   - Desktop, the 85 on classic physics (the js core, The Warehouse): the
//     offer names the Warehouse Sprint's 5 gates; T flies it.
//   - Phone, touch, 812x375: the launch screen's line about tracks, its five
//     buttons clear (and at 667x375; 375x812 keeps the whole blurb). In the
//     air 30 s: the prompt with a RACE button, 44 px or more, clear of the
//     sticks, the footer and the HUD at 812x375, 667x375 and 375x812 (the
//     Warehouse's name too). One tap on RACE from the air: the Rig Sprint,
//     the arm hint at once, ARM, gate 0, the race ping with input 'touch'.
//     Back in free flight after that race, a disarm shows nothing: no offer
//     once a race has started.
//   - Desktop, keyboard, the Worker in the test: a fresh visitor takes the
//     offer (T), and R in the sprint is a new attempt from its pad. The
//     sprint flown to its finish: the result card asks, the name and Enter
//     post it, the board shows the pilot's row lit, #1, and "Full loop · 17
//     gates"; T there flies the Rig Loop. T on the loop's pad flies the
//     sprint again: posted with no card, the place on the lap panel, and its
//     "Full loop · 17 gates" clear to click (640x360 and 1280x720), which
//     flies the loop.
//   - Phone, touch, 812x375, the Worker in the test: a fresh visitor taps
//     RACE on the offer, flies the sprint to its finish, names, taps Post,
//     sees their row, and taps "Full loop · 17 gates" (44 px or more, clear,
//     at three sizes): the Rig Loop.
//   - In the source: no offer for a test's pilot; T is not in SIM_KEYS (a
//     select keeps its type-ahead; tools/test_sim_keys.mjs) and does nothing
//     from a select, or armed with no offer up; T and RACE go through
//     flyPickedTrack, the Tracks picker's own, as does the full loop; R and P
//     on a sprint are a new attempt (attemptTrack); the Tracks picker lists
//     each sprint above its loop.
// The sticks are set once a frame by the Coach autopilot through
// _sim.setTestStick, which leaves the counter on (_sim.setTestPilot turns it
// off, and keeps a run off the boards). In the sprint tests the quad is held
// in the air for the offer's 30 s and flown to the finish put on its path
// each frame (RUN), whatever the frame rate, as
// tools/test_sim_finish_name_page.mjs flies. The page is served as
// sim.quadmath.test (the counter is off on a local page) and every Worker
// request is caught (CDP Fetch): nothing leaves. With the Worker in the
// test, its real handler on an in-memory SQLite D1 (tools/d1_sqlite.mjs)
// answers.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs); its Chrome parts
// skip under SKIP_CHROME_BOOT=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LEADERBOARD_URL, PHYS_VER, builtinTrackHash, normalizeBuiltinSubmit, lineRunPasses, flightSpikes,
} from '../sim-retention.js';
import { legendHtml } from '../sim-feel.js';
import {
  BUILTIN_TRACK_FILES, BUILTIN_SPRINTS, sprintForMap, sprintLoopOf, isSprintTrackId, firstTrackForMap, MAPS,
} from '../sim-tracks.js';
import { BUILTIN_BOARD_TRACKS } from '../sim-builtin-boards.js';
import { buildPath } from './coach_rig_autopilot.mjs';
import { mapWorld } from './coach_rig_pilot.mjs';
import { toModule } from '../sim-core-adapter.js';
import { sqliteD1 } from './d1_sqlite.mjs';
import { handleLeaderboard } from '../workers/sim-leaderboard/src/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HOST = 'sim.quadmath.test';
const WS = 3.5;
const readTrack = (id) => JSON.parse(readFileSync(join(root, 'tracks', id + '.json'), 'utf8'));
// The sprints (sim-tracks.js BUILTIN_SPRINTS): each its loop's first n gates.
const SPRINT_GATES = { 'rig-sprint': 5, 'house-sprint': 6, 'depot-sprint': 5 };
const SPRINT_NAMES = { 'rig-sprint': 'Rig Sprint', 'house-sprint': 'House Sprint', 'depot-sprint': 'Warehouse Sprint' };

// The test's flight of a Rig track (as tools/test_sim_finish_name_page.mjs
// flies the Rig Loop): waypoints in metres (scene axes), a point 0.4 m either
// side of each gate along the line; the autopilot's smooth path through them.
function rigWaypoints(track) {
  const m = (g) => [g.x / WS, g.y / WS, g.z / WS];
  const wps = [];
  track.gates.forEach((g, i) => {
    const c = m(g);
    const n = track.gates[i + 1] ? m(track.gates[i + 1]) : null, p = track.gates[i - 1] ? m(track.gates[i - 1]) : null;
    let nx = Math.sin(g.ry), nz = Math.cos(g.ry);
    const dir = n ? [n[0] - c[0], n[2] - c[2]] : [c[0] - p[0], c[2] - p[2]];
    if (nx * dir[0] + nz * dir[1] < 0) { nx = -nx; nz = -nz; }
    wps.push([c[0] - nx * 0.4, c[1], c[2] - nz * 0.4], c, [c[0] + nx * 0.4, c[1], c[2] + nz * 0.4]);
  });
  return wps;
}
const PATH_PLAN = (wps) => ({ wps: wps.map((p) => ({ p, v: 9 })), yaw0: 0, limits: { lat: 12, acc: 9, dec: 13 }, vEnd: 9 });
// The page flight's speed along the path, in sim time. The page checks gates
// once a frame: a frame must move the quad less than the smallest gate's
// 0.8 m (the Rig Sprint's last two, 0.40 m rings), and a CI runner's frames
// have run to 778 ms (0.47 m here).
const SPRINT_SPEED = 0.6;

function resolveChrome() {
  const names = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'chrome'].filter(Boolean);
  for (const n of names) {
    if (existsSync(n)) return n;
    const which = spawnSync('which', [n], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return process.env.CHROME || 'google-chrome';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.webp': 'image/webp', '.hdr': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
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
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// The page's own helpers: what is on screen, and where the prompt sits.
const PAGE = `(() => {
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; }
    return true;
  };
  const box = (r) => ({ left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const uncovered = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); };
  // What the prompt must stay clear of, where it is on screen.
  const HUD = ['#osdTR', '#osdTL', '#osdGate', '#osdLap', '#osdBC', '#osdBR', '#menuBtn', '#gear', '#feelHud .feel-meta', '#hudArmHint',
    '#legend', '#touchBtns', '#touchLandscape', '#touchLayer .vstick.left', '#touchLayer .vstick.right', 'footer', '#stickOverlay', '#packHint', '#firstFlight', '#coachHud'];
  window.__ro = {
    shown,
    offer() {
      const el = document.getElementById('raceOffer');
      if (!shown(el)) return { shown: false };
      const r = el.getBoundingClientRect();
      const W = innerWidth, H = innerHeight;
      const centre = { left: W / 3, right: 2 * W / 3, top: H / 3, bottom: 2 * H / 3 };
      const over = HUD.map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && shown(e) && hit(r, e.getBoundingClientRect())).map(([q]) => q);
      const go = document.getElementById('raceOfferGo');
      const g = shown(go) ? go.getBoundingClientRect() : null;
      return { shown: true, text: el.innerText.replace(/\\s+/g, ' ').trim(), rect: box(r), view: [W, H],
        inView: r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H, overCentre: hit(r, centre), over,
        go: g ? { w: Math.round(g.width), h: Math.round(g.height), uncovered: uncovered(go) } : null };
    },
    launch() {
      const ids = ['menuFly', 'menuDaily', 'menuBoards', 'menuTune', 'menuControls'];
      const t = document.querySelector('.menu-tracks'), l = document.querySelector('.menu-lead.menu-launch');
      return { buttons: ids.map((id) => { const b = document.getElementById(id); return { id, shown: shown(b), uncovered: shown(b) && uncovered(b) }; }),
        tracks: shown(t) ? t.textContent.trim() : null, lead: shown(l) ? l.textContent.trim() : null };
    },
    hint() { const h = document.getElementById('hudArmHint'); return shown(h) ? h.textContent.trim() : null; },
    race() {
      const s = window._sim, g = s.scene.getObjectByName('raceGroup');
      const rings = g ? g.children.filter((o) => o.geometry && o.geometry.type === 'TorusGeometry') : [];
      const t = s.findTrack(s.track());
      const g0 = t && t.gates && t.gates[0];
      const start = g ? g.children.filter((o) => o.isSprite && g0 && Math.hypot(o.position.x - g0.x, o.position.z - g0.z) < 0.5 && o.position.y > g0.y) : [];
      const c = s.coreState();
      const a = document.activeElement, P = window.__pilot;
      return { map: s.map(), track: String(s.track()), gates: t && t.gates ? t.gates.length : 0, rings: rings.length, startRing: rings.length > 0 && start.length === 1,
        armed: !!c.armed, offer: s.raceOffer(), gate: document.getElementById('osdGate').textContent,
        // For a failure: the throttle the page read, focus, where the quad is.
        toast: document.getElementById('toast').textContent,
        diag: { air: !!c.airborne, z: +c.position.z.toFixed(2), clearance: +c.clearance.toFixed(2), vz: +c.velocity.z.toFixed(2), thr: +s.stickOverlay().stick.t.toFixed(3),
          focus: a ? (a.id || a.tagName) : null, clock: s.simClockMs(), menuOpen: document.body.classList.contains('menu-open'),
          pilot: P ? { mode: P.mode, frames: P.frames, error: P.error } : null, contact: c.contactFlags } };
    },
  };
  return true;
})()`;

// The pilot, once a frame in the page (requestAnimationFrame), through
// _sim.setTestStick: the Coach autopilot along a path, a slow landing, or
// sticks at rest; disarmed, sticks at rest (the throttle down, to arm). The
// landing is 0.12 down to the floor and 0 on it: ground contact by clearance,
// not the core's airborne flag (the bf plant can hold that true on the floor
// at 12%).
const PILOT = `import('/tools/coach_rig_autopilot.mjs').then((A) => {
  const s = window._sim;
  const P = window.__pilot = { mode: 'off', path: null, mem: null, frames: 0, error: null };
  const LIM = { lat: 6, acc: 4, dec: 6 };
  P.here = () => { const st = A.sceneState(s.coreState()); return { p: [st.p.x, st.p.y, st.p.z], yaw: st.yaw }; };
  P.plan = (pts, v) => {
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dz = b[2] - a[2];
    const yaw0 = Math.hypot(dx, dz) > 0.05 ? Math.atan2(-dx, -dz) : P.here().yaw;
    P.path = A.buildPath({ wps: pts.map((p, i) => ({ p, v: i === 0 ? 0.5 : v })), yaw0, limits: LIM, vEnd: 0 });
    P.mem = A.trackerMemory();
  };
  // Up from where it is to h metres, 40 cm ahead, and hold there.
  P.hover = (h) => {
    const { p, yaw } = P.here();
    const f = [-Math.sin(yaw), -Math.cos(yaw)];
    P.plan([[p[0], Math.max(0.01, p[1]), p[2]], [p[0], 0.6, p[2]], [p[0] + f[0] * 0.4, h, p[2] + f[1] * 0.4]], 0.8);
    P.mode = 'fly';
  };
  P.to = (pts, v) => { P.plan([P.here().p, ...pts], v); P.mode = 'fly'; };
  // Hold h metres up, the other sticks centred: no Coach tune needed.
  P.hold = (h) => { P.h = h; P.I = 0; P.mode = 'hold'; };
  // 'none': the sticks left to another (RUN's flight).
  const tick = () => {
    try {
      const cs = s.coreState();
      if (P.mode === 'none') { /* RUN's */ }
      else if (!cs.armed || P.mode === 'off') s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
      else if (P.mode === 'land') s.setTestStick({ r: 0, p: 0, y: 0, t: cs.clearance <= 0.04 ? 0 : 0.12 });
      else if (P.mode === 'hold') {
        const e = P.h - cs.position.z;
        P.I = Math.max(-0.35, Math.min(0.35, P.I + e * 0.01));
        s.setTestStick({ r: 0, p: 0, y: 0, t: Math.max(0.05, Math.min(0.95, 0.4 + P.I + 0.3 * e - 0.25 * cs.velocity.z)) });
      }
      else { const c = A.track(P.path, A.sceneState(cs), P.mem, {}); s.setTestStick({ r: c.r, p: c.p, y: c.y, t: c.t }); }
      P.frames++;
    } catch (e) { P.error = String(e && e.stack || e); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})`;

// A race flown to its finish (as tools/test_sim_finish_name_page.mjs FLY
// flies): the quad, armed and holding a hover throttle, put on the path at
// each frame's start (__preFrame, before the page steps its sim) moving along
// it at v m/s of sim time, so the ghost's in-frame samples follow it at any
// frame rate. Until it is armed it is left on its pad, the throttle down (so
// Space or ARM can arm it). And what the result card and the lap panel show.
const RUN = String.raw`import('/tools/coach_rig_autopilot.mjs').then((A) => {
  const s = window._sim, $ = (id) => document.getElementById(id), shown = window.__ro.shown;
  const R = window.__run = { flight: null, cards: 0, toasts: [] };
  // Every toast shown, in order.
  new MutationObserver(() => { const t = $('toast').textContent; if (t && R.toasts[R.toasts.length - 1] !== t) R.toasts.push(t); }).observe($('toast'), { childList: true, characterData: true, subtree: true });
  let wasUp = false;
  const watch = () => { const up = !!s.resultCard().up; if (up && !wasUp) R.cards++; wasUp = up; requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  R.start = (wps, v) => {
    const path = A.buildPath({ wps: wps.map((p) => ({ p, v: 9 })), yaw0: 0, limits: { lat: 12, acc: 9, dec: 13 }, vEnd: 9 });
    const S = [0];
    for (let i = 1; i < path.length; i++) S.push(S[i - 1] + Math.hypot(path[i].p.x - path[i - 1].p.x, path[i].p.y - path[i - 1].p.y, path[i].p.z - path[i - 1].p.z));
    const at = (d) => { let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= d) lo = mid; else hi = mid; } return path[lo].p; };
    const t = s.findTrack(s.track()), g0 = t.gates[0];
    let d = 0, bd = Infinity;
    path.forEach((q, i) => { const e = Math.hypot(q.p.x - g0.x / 3.5, q.p.y - g0.y / 3.5, q.p.z - g0.z / 3.5); if (e < bd) { bd = e; d = S[i]; } });
    const d0 = Math.max(0, d - 0.6);
    const b = s.bfCore();
    const core = (p) => ({ x: -p.z, y: -p.x, z: p.y });
    const f = R.flight = { over: false, started: false, frames: 0, longestMs: 0, d: d0, total: S[S.length - 1], speed: v, ran: false, toast: '' };
    const along = (dd) => { const a = at(dd), n = at(Math.min(f.total, dd + 0.05)), L = Math.hypot(n.x - a.x, n.y - a.y, n.z - a.z) || 1; return { x: (n.x - a.x) / L * v, y: (n.y - a.y) / L * v, z: (n.z - a.z) / L * v }; };
    let sim0 = null;
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
    window.__preFrame = () => {
      if (f.over) { window.__preFrame = null; return; }
      if (!s.coreState().armed) { if (!f.started) s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); return; }
      const now = s.simClockMs();
      if (!f.started) { f.started = true; sim0 = now; s.setTestStick({ r: 0, p: 0, y: 0, t: 0.42 }); }
      if (!s.resultCard().paused) f.d = d0 + v * (now - sim0) / 1000;
      b.teleport(core(at(Math.min(f.d, f.total))), { x: 0, y: 0, z: 0, w: 1 }, core(along(f.d)));
    };
    // Done: still where it is, hovering.
    R.stop = () => { f.over = true; window.__preFrame = null; const c = s.coreState(); if (c.position) b.teleport({ x: c.position.x, y: c.position.y, z: c.position.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }); };
    let last = performance.now();
    const step = () => {
      if (f.over) return;
      if (/^(LINE|RUN) \d/.test($('toast').textContent) && +getComputedStyle($('toast')).opacity > 0.05 || s.resultCard().up) { f.toast = $('toast').textContent; R.stop(); return; }
      if (f.d >= f.total) { f.ran = true; R.stop(); return; }
      const now = performance.now();
      if (f.started) { f.frames++; f.longestMs = Math.max(f.longestMs, now - last); }
      last = now;
      requestAnimationFrame(step);
    };
    $('toast').textContent = '';
    requestAnimationFrame(step);
    return true;
  };
  // Held h metres up over where it is, still, a hover throttle, once armed
  // (the throttle down until then): in the air for the offer's 30 s at any
  // frame rate. R.stop lets go.
  R.hover = (h) => {
    const b = s.bfCore(), core = (p) => ({ x: -p.z, y: -p.x, z: p.y });
    const st = A.sceneState(s.coreState());
    const at = { x: st.p.x, y: h, z: st.p.z };
    const f = R.flight = { over: false, started: false, frames: 0, longestMs: 0, d: 0, total: 0, speed: 0, ran: false, toast: '', hover: true };
    s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
    window.__preFrame = () => {
      if (f.over) { window.__preFrame = null; return; }
      if (!s.coreState().armed) { if (!f.started) s.setTestStick({ r: 0, p: 0, y: 0, t: 0 }); return; }
      if (!f.started) { f.started = true; s.setTestStick({ r: 0, p: 0, y: 0, t: 0.42 }); }
      b.teleport(core(at), { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 });
    };
    R.stop = () => { f.over = true; window.__preFrame = null; };
    return true;
  };
  // What a click at an element's centre lands on: hit when it is the element.
  R.top = (id) => {
    const el = $(id);
    if (!el || !shown(el)) return { found: false };
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
    return { found: true, hit: top === el, w: Math.round(r.width), h: Math.round(r.height), view: [innerWidth, innerHeight], top: top ? top.tagName + '#' + top.id : null };
  };
  R.state = () => {
    const f = R.flight;
    return { card: s.resultCard(), cards: R.cards, clock: s.simClockMs(), track: String(s.track()), title: $('rcTitle').textContent,
      place: $('rcPlace').textContent, me: [...document.querySelectorAll('#rcRows .board-row.me')].map((r) => r.textContent),
      rows: [...document.querySelectorAll('#rcRows .board-row')].map((r) => r.textContent), why: $('rcWhy').textContent,
      splits: $('rcSplits').textContent, focus: document.activeElement ? document.activeElement.id : null,
      loop: shown($('rcLoop')) ? $('rcLoop').textContent : null, lapLoop: shown($('lapLoop')) ? $('lapLoop').textContent : null,
      toastLoop: shown($('toastLoop')) ? $('toastLoop').textContent : null, toastUp: +getComputedStyle($('toast')).opacity > 0.05,
      lap: $('osdLap').innerText, toast: $('toast').textContent, toasts: R.toasts.slice(-8), gate: $('osdGate').textContent, offer: s.raceOffer(), armed: !!s.coreState().armed,
      flight: f ? { over: f.over, started: f.started, frames: f.frames, longestMs: Math.round(f.longestMs), d: +f.d.toFixed(1), total: +f.total.toFixed(1), ran: f.ran, toast: f.toast } : null,
      name: localStorage.getItem('quadmath_pilotName') };
  };
  return true;
})`;

// One Chrome, one page: { cdp, evaluate, key, tap, click, pings, close }.
// worker: the leaderboard Worker's real handler on an in-memory D1 answers
// the page (a count ping still recorded and answered 204), with RUN's frame
// hook and no gamepad of this machine's; RO_WORKER_ROOT: the Worker of that
// checkout instead (the deployed one, to see the page against it).
async function openPage({ mobile, w, h, before, worker: withWorker }) {
  const { server, port } = await serveRoot();
  const site = `http://${HOST}:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'qm-race-offer-'));
  const child = spawnBrowser(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--window-size=${w},${h}`, `--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${site}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  let ws = null;
  const close = async () => {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    killTree(child);
    await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
    await new Promise((res) => server.close(res));
    for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
  };
  try {
    let debugPort = 0;
    for (let i = 0; i < 300 && !debugPort; i++) {
      await sleep(100);
      try { debugPort = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
    }
    assert.ok(debugPort, 'no DevTools port\n' + stderr.slice(-400));
    let page = null;
    for (let i = 0; i < 300 && !page; i++) {
      await sleep(100);
      try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((p) => p.type === 'page' && p.webSocketDebuggerUrl); } catch (e) { /* coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  } catch (e) { await close(); throw e; }
  let seq = 0;
  const cdp = (method, params) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 30000);
      const on = (msg) => {
        let o;
        try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
        if (o.id !== id) return;
        clearTimeout(t);
        ws.removeEventListener('message', on);
        if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error))); else resolve(o.result || {});
      };
      ws.addEventListener('message', on);
    });
  };
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  // Every request to the Worker, the rooms Worker or Cloudflare's analytics:
  // a count recorded and answered 204; with the Worker, the rest of the
  // Worker's answered by it; anything else failed.
  const pings = [], calls = [];
  const lb = !withWorker ? null : process.env.RO_WORKER_ROOT
    ? (await import(pathToFileURL(join(process.env.RO_WORKER_ROOT, 'workers', 'sim-leaderboard', 'src', 'index.js')).href)).handleLeaderboard
    : handleLeaderboard;
  const worker = withWorker ? { env: { DB: sqliteD1(), ALLOWED_ORIGIN: site } } : null;
  ws.addEventListener('message', async (msg) => {
    let o;
    try { o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString()); } catch (e) { return; }
    if (!o || o.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = o.params;
    try {
      if (request.url === LEADERBOARD_URL + '/api/count' && request.method === 'POST') {
        pings.push({ body: JSON.parse(request.postData), type: o.params.resourceType });
        await cdp('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }] });
        return;
      }
      if (!worker || !request.url.startsWith(LEADERBOARD_URL + '/')) { await cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
      const path = new URL(request.url).pathname;
      const headers = { ...request.headers };
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'origin')) headers.Origin = site;
      headers['CF-Connecting-IP'] = '203.0.113.8';
      const init = { method: request.method, headers };
      if (request.postData != null) init.body = request.postData;
      const res = await lb(new Request(request.url, init), worker.env);
      const buf = Buffer.from(await res.arrayBuffer());
      calls.push({ call: request.method + ' ' + path, status: res.status, body: buf.toString('utf8').slice(0, 300) });
      await cdp('Fetch.fulfillRequest', { requestId, responseCode: res.status, responseHeaders: [...res.headers].map(([name, value]) => ({ name, value })), body: buf.toString('base64') });
    } catch (e) {
      try { await cdp('Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch (e2) { /* the page is gone */ }
    }
  });
  await cdp('Fetch.enable', { patterns: [
    { urlPattern: LEADERBOARD_URL + '/*' }, { urlPattern: 'https://sim-rooms.ryan-roths.workers.dev/*' },
    { urlPattern: 'https://static.cloudflareinsights.com/*' }, { urlPattern: 'https://cloudflareinsights.com/*' },
  ] });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  if (before) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: before });
  if (withWorker) {
    // No pad of this machine's in the page: a paired controller that wakes
    // mid-run turns the keyboard visitor into a radio pilot.
    if (!before) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [], configurable: true });` });
    // window.__preFrame(ts): once a frame, before any of the frame's
    // callbacks (the page's loop included): RUN puts the quad on its path.
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const raf = window.requestAnimationFrame.bind(window); let last = -1;
      window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== last) { last = ts; const h = window.__preFrame; if (h) { try { h(ts); } catch (e) { window.__preFrameError = String(e && e.stack || e); } } } cb(ts); }); })();` });
  }
  // SIM_CPU_THROTTLE=6: a slow runner's frame rate (the pilot steers once a frame).
  if (process.env.SIM_CPU_THROTTLE) await cdp('Emulation.setCPUThrottlingRate', { rate: +process.env.SIM_CPU_THROTTLE });
  const size = async (W, H) => {
    await cdp('Emulation.setDeviceMetricsOverride', mobile
      ? { width: W, height: H, deviceScaleFactor: 2.625, mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } }
      : { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  };
  if (mobile) {
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', platform: 'Android' });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await size(w, h);
  const key = async (k, code, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(k.length === 1 ? { text: k } : {}) });
    await sleep(50);
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  const centre = async (sel) => {
    const r = JSON.parse(await evaluate(`JSON.stringify((() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || !window.__ro.shown(el)) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })())`));
    assert.ok(r, sel + ' is on screen');
    return r;
  };
  const tap = async (sel) => {
    const { x, y } = await centre(sel);
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const click = async (sel) => {
    const { x, y } = await centre(sel);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const open = async () => {
    await cdp('Page.navigate', { url: `${site}/sim.html?quality=low` });
    let ok = false;
    const t0 = Date.now();
    while (!ok && Date.now() - t0 < 120000) {
      await sleep(250);
      try { ok = await evaluate(`!!(window._sim && window._simQueryBooted && window._sim.core && window._sim.core() === 'bf' && window._sim.raceOffer)`); } catch (e) { /* navigating */ }
    }
    assert.ok(ok, 'booted on the bf core');
    await evaluate(PAGE);
  };
  const until = async (fn, ms, what) => {
    const t0 = Date.now();
    let v;
    while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(100); }
    assert.fail(what + ' (waited ' + ms + ' ms): ' + JSON.stringify(await evaluate(`JSON.stringify(window.__ro.race())`)));
  };
  const race = async () => JSON.parse(await evaluate(`JSON.stringify(window.__ro.race())`));
  const offer = async () => JSON.parse(await evaluate(`JSON.stringify(window.__ro.offer())`));
  const sim = async () => JSON.parse(await evaluate(`JSON.stringify((() => { const s = window._sim, c = s.coreState(), v = c.velocity; return { clock: s.simClockMs(), armed: !!c.armed, air: !!c.airborne, z: c.position.z, clr: c.clearance, speed: Math.hypot(v.x, v.y, v.z), offer: s.raceOffer(), testPilot: s.testPilotUsed() }; })())`));
  // Two painted frames from now.
  const frames = () => evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
  const type = (text) => cdp('Input.insertText', { text });
  const loadRun = async () => {
    if (await evaluate('!!window.__run')) return;
    await evaluate(RUN);
    await until(() => evaluate('!!window.__run'), 10000, 'the flight helper loaded');
  };
  const run = async () => { await loadRun(); return JSON.parse(await evaluate(`JSON.stringify(window.__run.state())`)); };
  const top = async (id) => { await loadRun(); return JSON.parse(await evaluate(`JSON.stringify(window.__run.top(${JSON.stringify(id)}))`)); };
  // The active race flown from its pad to its finish (RUN): armed by the arm
  // control (Space, the touch ARM) once RUN holds the throttle down, pressed
  // again only while it is not armed (a long frame can let Easy mode disarm
  // it on the pad first). Returns RUN's state at the finish.
  // RUN's flight (start) or hover begun: armed by the arm control once RUN
  // holds the throttle down, pressed again only while it is not armed.
  const begin = async (call, arm) => {
    await loadRun();
    await evaluate(`(window.__pilot && (window.__pilot.mode = 'none'), true)`);
    await evaluate(call);
    await frames();
    for (let i = 0; i < 6 && !(await run()).flight.started; i++) {
      if (!(await run()).armed) await arm();
      const t0 = Date.now();
      while (Date.now() - t0 < 5000 && !(await run()).flight.started) await sleep(100);
    }
    assert.ok((await run()).flight.started, 'armed, under way: ' + JSON.stringify(await run()));
  };
  const startRace = (wps, arm, v = SPRINT_SPEED) => begin(`window.__run.start(${JSON.stringify(wps)}, ${v})`, arm);
  // Free flight held 1 m up until the offer shows: never before 30 s of sim
  // time in the air. Let go (RUN's stop) once it has.
  const hoverUntilOffer = async (arm, race = 'rig-sprint') => {
    await begin(`window.__run.hover(1.0)`, arm);
    const t0 = Date.now();
    let s;
    while (Date.now() - t0 < 400000) {
      s = await run();
      assert.equal(s.offer.shown && s.offer.airMs < 30000, false, 'not before 30 s in the air: ' + JSON.stringify(s.offer));
      if (s.offer.shown) break;
      await sleep(250);
    }
    await evaluate('(window.__run.stop(), true)');
    assert.ok(s.offer.shown, 'the offer after 30 s in the air: ' + JSON.stringify(s));
    assert.ok(s.offer.airMs >= 30000 && s.offer.airMs < 31500, '30 s in the air: ' + s.offer.airMs);
    assert.equal(s.offer.shows, 1);
    assert.equal(s.offer.track, race, 'the map\'s race: its sprint');
    return s;
  };
  const flyRace = async (wps, arm, v = SPRINT_SPEED) => {
    await startRace(wps, arm, v);
    const t0 = Date.now();
    let s;
    while (Date.now() - t0 < 300000) { s = await run(); if (s.flight.over) break; await sleep(250); }
    assert.ok(s.flight.over && !s.flight.ran, 'the finish, before the path ran out: ' + JSON.stringify(s));
    return s;
  };
  const board = async (track) => {
    const r = await lb(new Request(LEADERBOARD_URL + '/api/builtin/board?track=' + track + '&class=65', { headers: { Origin: site } }), worker.env);
    return r.status === 200 ? (await r.json()).entries : { status: r.status, body: await r.json() };
  };
  return { cdp, evaluate, key, tap, click, size, open, until, race, offer, sim, frames, type, run, top, startRace, hoverUntilOffer, flyRace, board, pings, calls, close };
}

// Free flight, armed and holding 1 m, until the prompt shows: never before
// 30 s of sim time in the air. o.race: the map's race; o.up: the pilot's way
// up ('hover', the Coach autopilot, or 'hold'); o.early: run once, 3 s into
// the air. Returns the sim clock when it showed.
async function flyUntilOffer(P, arm, o = {}) {
  const up = `window.__pilot.${o.up || 'hover'}(1.0), true`;
  await P.evaluate(PILOT);
  await P.until(() => P.evaluate(`!!window.__pilot`), 5000, 'the pilot loaded');
  await P.evaluate(up);
  // Betaflight can refuse an early arm (the toast says why): the arm control
  // again, only while it is not armed, up to three times.
  for (let i = 0; i < 3 && !(await P.sim()).armed; i++) {
    await arm();
    const t0 = Date.now();
    while (Date.now() - t0 < 5000 && !(await P.sim()).armed) await sleep(100);
  }
  await P.until(async () => (await P.sim()).armed, 1000, 'armed');
  const t0 = Date.now();
  let s = null, aloft = Date.now(), early = !o.early;
  while (Date.now() - t0 < 120000) {
    s = await P.sim();
    assert.equal(s.offer.shown && s.offer.airMs < 30000, false, 'not before 30 s in the air: ' + JSON.stringify(s));
    if (s.offer.shown) break;
    if (s.air) aloft = Date.now();
    if (!early && s.armed && s.air && s.offer.airMs > 3000) { early = true; await o.early(); }
    if (!s.armed) { await arm(); await P.evaluate(up); aloft = Date.now(); }
    // Down but armed (a slow frame rate let the hover touch): up again.
    else if (Date.now() - aloft > 1500) { await P.evaluate(up); aloft = Date.now(); }
    await sleep(200);
  }
  assert.ok(s.offer.shown, 'the offer after 30 s in the air: ' + JSON.stringify(s));
  assert.ok(s.offer.airMs >= 30000 && s.offer.airMs < 31500, '30 s in the air: ' + s.offer.airMs);
  assert.equal(s.offer.shows, 1);
  assert.equal(s.offer.track, o.race || 'rig-sprint', 'the map\'s race: its sprint');
  assert.equal(s.testPilot, false, 'no test pilot: the counter is on');
  return s.clock;
}

// On the floor and still: clearance and speed, as tools/test_sim_easy_mode.mjs.
const landed = (s) => s.clr <= 0.04 && s.speed < 0.5;
// Down and disarmed: the pilot lands; Easy mode disarms it 0.5 s after it is
// down with the throttle at the bottom. If it has not in 2 s, the arm control
// (Space, the touch ARM) once: Easy mode would have by then, so this never
// arms it again.
async function landAndDisarm(P, toggle) {
  await P.evaluate(`window.__pilot.mode = 'land', true`);
  await P.until(async () => landed(await P.sim()), 20000, 'landed');
  const t0 = Date.now();
  while (Date.now() - t0 < 2000 && (await P.sim()).armed) await sleep(100);
  if ((await P.sim()).armed) await toggle();
  await P.until(async () => !(await P.sim()).armed, 3000, 'disarmed');
}

// Off the view's centre, inside the view, over nothing of the HUD.
function assertPlaced(o, where) {
  assert.ok(o.shown, where + ': shown');
  assert.ok(o.inView, where + ': inside the view ' + JSON.stringify(o));
  assert.equal(o.overCentre, false, where + ': not over the centre of the view ' + JSON.stringify(o));
  assert.deepEqual(o.over, [], where + ': clear of the HUD, the sticks and the footer ' + JSON.stringify(o));
}

// Fly from the pad through the race's gate 0, on to 1.2 m past it.
async function throughGate0(P) {
  await P.evaluate(`(() => {
    const t = window._sim.findTrack(window._sim.track()), g = t.gates[0], h = window.__pilot.here().p;
    const g0 = [g.x / ${WS}, g.y / ${WS}, g.z / ${WS}], dx = g0[0] - h[0], dz = g0[2] - h[2], d = Math.hypot(dx, dz) || 1;
    window.__pilot.to([[h[0], 0.6, h[2]], g0, [g0[0] + dx / d * 1.2, g0[1], g0[2] + dz / d * 1.2]], 1.2);
    return true;
  })()`);
}

test('the race offer in the source: no offer for a test pilot; T not in SIM_KEYS, not from a select, only disarmed or with the offer up; T and RACE through the Tracks picker\'s flyPickedTrack', () => {
  const html = readFileSync(join(root, 'sim.html'), 'utf8').replace(/\r\n/g, '\n');
  const fn = (name) => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, name); return html.slice(i, html.indexOf('\n}', i) + 2); };
  assert.ok(fn('raceOfferTrack').includes('testPilotUsed'), 'none for a test pilot');
  assert.ok(fn('raceOfferTrack').includes('raceOffer.raceStarted'), 'none once a race has started');
  assert.ok(fn('startRun').includes("countNote('race');") && fn('startRun').includes('raceOffer.raceStarted=true;'));
  assert.ok(fn('raceThisMap').includes('return flyPickedTrack(currentMap,t.id);'), 'the Tracks picker\'s own way in');
  assert.ok(html.includes('flyPickedTrack(pickerMap,id);'), 'which the Tracks picker\'s rows call');
  assert.doesNotMatch(html, /const SIM_KEYS=new Set\(\[[^\]]*'t'[^\]]*\]\)/, 'T is not a sim key: a select keeps T for its type-ahead');
  assert.ok(html.includes("if(e.key.toLowerCase()==='t'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){\n    if(e.target&&e.target.tagName==='SELECT')return;\n    if(sprintResultUp())flyFullLoop();\n    else if(!cs.armed||raceOfferUp())raceThisMap();\n    return;\n  }"));
  assert.ok(legendHtml().includes('<b>T — Race this map</b><br>'), 'the legend (sim-feel.js HOTKEYS)');
  assert.ok(html.includes("go.addEventListener('click',e=>{e.preventDefault();go.blur();raceThisMap();});"), 'RACE on touch');
  // The map's race: its sprint, else its loop.
  assert.ok(fn('mapRace').includes('sprintForMap(mapId)') && fn('mapRace').includes('return s||mapLoop(mapId);'), 'the sprint, else the loop');
  assert.ok(fn('raceOfferTrack').includes('return mapRace(currentMap);') && fn('raceThisMap').includes('const t=mapRace(currentMap);'));
  // A sprint's result: the full loop through the Tracks picker's own way in,
  // from the card's board, the lap panel and T (on the card too).
  assert.ok(fn('flyFullLoop').includes('closeResultCard();') && fn('flyFullLoop').includes('return flyPickedTrack(o.map,o.id);'));
  assert.ok(fn('fullLoopOffer').includes('sprintLoopOf(id)'));
  assert.ok(fn('showResultBoard').includes('const loop=fullLoopOffer(run.id),loopBtn=rcEl(\'rcLoop\');'), 'the card\'s board offers it');
  assert.ok(html.includes("on('rcLoop',()=>{const a=resultAsk;flyFullLoop(a?a.run.id:null);});"));
  assert.ok(fn('lapActionsHtml').includes('<button type="button" id="lapLoop">'), 'the lap panel offers it');
  assert.ok(html.includes("if(loopBtn)loopBtn.onclick=function(e){e.preventDefault();loopBtn.blur();flyFullLoop();};"));
  assert.ok(html.includes("else if(e.key.toLowerCase()==='t'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&sprintResultUp()){e.preventDefault();flyFullLoop();}"), 'T on the card\'s board');
  // R and P on a sprint: a new attempt from its pad.
  assert.ok(fn('attemptTrack').includes('isSprintTrackId(activeTrackId)'));
  assert.ok(fn('resetQuad').includes('!attemptTrack()') && fn('newPack').includes('attemptTrack()'));
  // The Tracks picker: each sprint above its loop.
  assert.ok(fn('openTrackPicker').includes('const lid=sprintLoopOf(t.id),at=lid?list.findIndex(x=>x.id===lid):-1;'));
});

test('the sprints: each its loop\'s first gates from its pad, listed after its loop, a pace ghost and a board each; none on the Bando', async () => {
  assert.deepEqual(BUILTIN_SPRINTS.map((s) => [s.id, s.map, s.loop]), [['rig-sprint', 'rig', 'rig-loop'], ['house-sprint', 'house', 'house-loop'], ['depot-sprint', 'depot', 'depot-loop']]);
  const catalog = JSON.parse(readFileSync(join(root, 'tracks', 'catalog.json'), 'utf8'));
  for (const s of BUILTIN_SPRINTS) {
    const t = readTrack(s.id), loop = readTrack(s.loop);
    assert.equal(t.id, s.id);
    assert.equal(t.name, SPRINT_NAMES[s.id]);
    assert.equal(t.gates.length, SPRINT_GATES[s.id], s.id + ': its gates');
    assert.deepEqual(t.gates, loop.gates.slice(0, SPRINT_GATES[s.id]), s.id + ': the loop\'s first gates, as they are');
    assert.deepEqual(t.start, loop.start, s.id + ': the loop\'s pad');
    assert.deepEqual([t.map, t.class, t.flags], [loop.map, loop.class, loop.flags]);
    assert.deepEqual(Object.keys(t), Object.keys(loop), s.id + ': the loop\'s fields');
    // Listed right after its loop, in both lists; the map's first track is its loop.
    for (const list of [BUILTIN_TRACK_FILES, catalog.tracks]) {
      const i = list.findIndex((x) => x.id === s.id);
      assert.ok(i > 0 && list[i - 1].id === s.loop, s.id + ' after ' + s.loop);
      assert.deepEqual([list[i].map, list[i].name, list[i].file], [s.map, SPRINT_NAMES[s.id], 'tracks/' + s.id + '.json']);
    }
    assert.equal(firstTrackForMap(s.map, BUILTIN_TRACK_FILES).id, s.loop, s.map + ': its first track is still its loop');
    assert.equal(sprintForMap(s.map), s.id);
    assert.equal(sprintLoopOf(s.id), s.loop);
    assert.equal(isSprintTrackId(s.id) && !isSprintTrackId(s.loop), true);
    // A pace ghost of its own, one pass from gate 0 to its last gate.
    const g = JSON.parse(readFileSync(join(root, 'ghosts', s.id + '.json'), 'utf8'));
    assert.equal(g.track, s.id);
    const end = g.samples[g.samples.length - 1], last = t.gates[t.gates.length - 1];
    assert.ok(Math.hypot(end[1] - last.x, end[2] - last.y, end[3] - last.z) < 0.5, s.id + ': the pace ghost ends at the last gate');
    // A board of its own: the Worker's copy is the file, keyed apart from the loop's.
    const w = BUILTIN_BOARD_TRACKS.find((x) => x.id === s.id);
    assert.ok(w, s.id + ' has a board');
    assert.deepEqual(w.gates, t.gates.map(({ x, y, z, ry, size, solid }) => ({ x, y, z, ry, size, solid: !!solid })));
    assert.notEqual(await builtinTrackHash(w), await builtinTrackHash(BUILTIN_BOARD_TRACKS.find((x) => x.id === s.loop)), s.id + ': its own board');
  }
  // The Bando: no sprint; its race is its loop.
  assert.equal(sprintForMap('bando'), null);
  assert.ok(MAPS.some((m) => m.id === 'bando'));
});

test('the test\'s flight of the Rig Sprint: clear of the Rig\'s boxes, and its samples pass the Worker\'s check', async () => {
  const t = BUILTIN_BOARD_TRACKS.find((b) => b.id === 'rig-sprint');
  const path = buildPath(PATH_PLAN(rigWaypoints(t)));
  const world = await mapWorld('rig');
  const R = 0.05;
  const hits = path.filter((q, i) => i % 5 === 0).filter((q) => {
    const m = toModule({ x: q.p.x * WS, y: q.p.y * WS, z: q.p.z * WS }, {});
    return world.boxes.some((b) => m.x > b.min[0] - R && m.x < b.max[0] + R && m.y > b.min[1] - R && m.y < b.max[1] + R && m.z > b.min[2] - R && m.z < b.max[2] + R);
  });
  assert.equal(hits.length, 0, 'within 5 cm of a box: ' + JSON.stringify(hits.slice(0, 3).map((q) => q.p)));
  // Samples every 67 ms along it at the page flight's speed (and twice it),
  // from gate 0 to the finish.
  const S = [0];
  for (let i = 1; i < path.length; i++) S.push(S[i - 1] + Math.hypot(path[i].p.x - path[i - 1].p.x, path[i].p.y - path[i - 1].p.y, path[i].p.z - path[i - 1].p.z));
  const at = (d) => { let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= d) lo = mid; else hi = mid; } return path[lo].p; };
  const near = (g) => { let b = 0, bd = Infinity; path.forEach((q, i) => { const d = Math.hypot(q.p.x - g.x / WS, q.p.y - g.y / WS, q.p.z - g.z / WS); if (d < bd) { bd = d; b = i; } }); return S[b]; };
  const d0 = near(t.gates[0]), d1 = near(t.gates[t.gates.length - 1]);
  for (const speed of [SPRINT_SPEED, 2 * SPRINT_SPEED]) {
    const samples = [];
    for (let ms = 0; ; ms += 67) {
      const d = Math.min(d1, d0 + speed * ms / 1000), q = at(d);
      samples.push([d === d1 ? Math.round((d1 - d0) / speed * 1000) : ms, +(q.x * WS).toFixed(2), +(q.y * WS).toFixed(2), +(q.z * WS).toFixed(2), 0, 0, 0, 1]);
      if (d === d1) break;
    }
    const pass = lineRunPasses(samples, t);
    assert.ok(pass.start >= 0 && pass.finish >= 0, speed + ' m/s: every gate in order');
    const timeMs = samples[pass.finish][0] - samples[pass.start][0];
    const ghost = { v: 1, phys: PHYS_VER, track: t.id, name: 'Tester', lapTime: timeMs, samples };
    const r = await normalizeBuiltinSubmit({ track: t.id, trackHash: await builtinTrackHash(t), frameMm: 65, name: 'Tester', timeMs, ghost, token: 'x' }, BUILTIN_BOARD_TRACKS);
    assert.equal(r.ok, true, speed + ' m/s: ' + r.reason);
    assert.ok(flightSpikes(samples, 65) <= 1, 'no force spikes');
  }
});

test('desktop, keyboard: T armed before 30 s does nothing; the offer at 30 s; once more at the next disarm, not after; T from a text or number box does nothing; T disarmed, the Rig Sprint, gate 0, the race ping; T in the race does nothing', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  // Flown at 640x360 (a slow runner's frame rate holds the hover); every
  // placement is measured at 1280x720.
  const P = await openPage({ mobile: false, w: 640, h: 360 });
  const at1280 = async (fn) => { await P.size(1280, 720); await sleep(250); await P.frames(); try { return await fn(); } finally { await P.size(640, 360); } };
  try {
    await P.open();
    // As a visitor: the keyboard on the first-run prompt flies the Rig.
    await P.click('#feelKeys');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    await P.until(() => P.evaluate(`window._sim.map() === 'rig'`), 10000, 'The Rig');
    await P.cdp('Page.bringToFront');
    const space = () => P.key(' ', 'Space', 32);
    const tKey = () => P.key('t', 'KeyT', 84);
    // T armed, no offer up yet: nothing.
    await flyUntilOffer(P, space, { early: async () => {
      await tKey();
      await P.frames();
      const r = await P.race();
      assert.equal(r.track, 'rig-freestyle', 'T armed before the offer: still free flight ' + JSON.stringify(r));
      assert.equal(r.armed, true, 'and still flying');
    } });
    await at1280(async () => {
      const o1 = await P.offer();
      assert.equal(o1.text, 'RACE THE RIG · 5 gates · T');
      assert.equal(o1.go, null, 'no button on a keyboard');
      assertPlaced(o1, 'desktop 1280x720');
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE WAREHOUSE', document.getElementById('raceOfferGates').textContent = '19 gates', true`);
      await P.frames();
      assertPlaced(await P.offer(), 'desktop 1280x720, RACE THE WAREHOUSE');
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE RIG', document.getElementById('raceOfferGates').textContent = '5 gates', true`);
    });
    // 10 s of sim time, by the page's own clock (the step that ends it can run
    // up to a frame past).
    let s = await P.until(async () => { const v = await P.sim(); return v.offer.shown ? null : v; }, 30000, 'the offer goes after 10 s');
    const held = s.offer.hiddenAt - s.offer.shownAt;
    assert.ok(held >= 10000 && held < 10600, 'shown 10 s of sim time: ' + held);
    // Down and disarmed with Tune open: the showing waits for Tune (which
    // hides it), then comes when Tune closes.
    await P.key('Tab', 'Tab', 9);
    await P.until(() => P.evaluate(`document.getElementById('panel').classList.contains('open')`), 3000, 'Tune open');
    await landAndDisarm(P, space);
    await sleep(1200);
    s = await P.sim();
    assert.equal(s.offer.shown, false, 'not while Tune is open');
    assert.equal(s.offer.shows, 1, 'the showing not spent behind Tune');
    assert.equal(s.offer.due, true, 'it waits for Tune');
    await P.key('Tab', 'Tab', 9);
    s = await P.until(async () => { const v = await P.sim(); return !v.armed && v.offer.shown ? v : null; }, 3000, 'the offer again once Tune closes');
    assert.equal(s.offer.shows, 2);
    await at1280(async () => {
      const o2 = await P.offer();
      assert.equal(o2.text, 'RACE THE RIG · 5 gates · T');
      assertPlaced(o2, 'desktop 1280x720, disarmed (the arm hint up)');
    });
    await P.until(async () => !(await P.sim()).offer.shown, 30000, 'the second showing goes');
    // Up and down again: never a third time.
    await P.evaluate(`window.__pilot.hover(1.0), true`);
    await space();
    await P.until(async () => (await P.sim()).air, 8000, 'in the air again');
    await sleep(1500);
    await landAndDisarm(P, space);
    await sleep(1500);
    s = await P.sim();
    assert.equal(s.offer.shown, false, 'no third showing');
    assert.equal(s.offer.shows, 2);
    // Disarmed, no offer up: T from Tune's pilot name (text) or a rates box
    // (number) does nothing.
    for (const id of ['pilotName', 'bfn_roll_expo']) {
      assert.ok(await P.evaluate(`(() => { const el = document.getElementById('${id}'); el.focus(); return document.activeElement === el; })()`), id + ' focused');
      await tKey();
      await P.frames();
      assert.equal((await P.race()).track, 'rig-freestyle', 'T in #' + id + ' starts no race');
      await P.evaluate(`document.activeElement && document.activeElement.blur(), true`);
    }
    // Disarmed: T flies the Rig Sprint, on its pad, the START ring, the arm
    // hint up within two painted frames.
    await tKey();
    await P.frames();
    const hint = await P.evaluate('window.__ro.hint()');
    const r = await P.race();
    assert.equal(r.map, 'rig');
    assert.equal(r.track, 'rig-sprint', 'the Rig Sprint: ' + JSON.stringify(r));
    assert.equal(r.rings, r.gates, 'its gates');
    assert.equal(r.gates, 5);
    assert.ok(r.startRing, 'the START ring');
    assert.equal(r.armed, false, 'disarmed on its pad');
    assert.equal(r.offer.shown, false, 'the offer gone');
    assert.ok(hint && /W/.test(hint), 'the arm hint at once, for the keys: ' + hint);
    // Space, gate 0, the race ping.
    assert.ok(!P.pings.some((p) => p.body.event === 'race'), 'no race ping before gate 0');
    await throughGate0(P);
    await space();
    await P.until(async () => /LINE/.test((await P.race()).gate), 30000, 'gate 0 passed');
    await P.until(async () => P.pings.some((p) => p.body.event === 'race'), 5000, 'the race ping');
    await sleep(1000);
    const race = P.pings.filter((p) => p.body.event === 'race');
    assert.equal(race.length, 1, 'once');
    assert.deepEqual(race[0].body, { event: 'race', class: 65, core: 'bf', input: 'keyboard' });
    assert.equal(race[0].type, 'Ping', 'a beacon');
    const events = P.pings.map((p) => p.body.event);
    assert.ok(events.indexOf('race') > events.indexOf('ready'), 'after ready: ' + events.join(' '));
    assert.equal((await P.sim()).testPilot, false);
    // Armed in the race: T does nothing (the run goes on, no new pad).
    const before = await P.race();
    await tKey();
    await sleep(500);
    const after = await P.race();
    assert.equal(after.track, 'rig-sprint');
    assert.equal(after.armed, true, 'still flying the race');
    assert.match(after.gate, /LINE/, 'the run goes on: ' + after.gate + ' (was ' + before.gate + ')');
  } finally { await P.close(); }
});

// A gamepad before the page's scripts: navigator.getGamepads() with one pad,
// as Chrome reports an Xbox pad (tools/test_sim_easy_mode.mjs FAKE_PADS).
const XBOX = `(() => {
  const pad = { id: 'Xbox One Game Controller (STANDARD GAMEPAD)', index: 0, mapping: 'standard', connected: true,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { pad.timestamp = performance.now(); return [pad, null, null, null]; } });
})()`;

test('desktop, gamepad: the offer at 30 s; T while it is up, from the air: the Rig Sprint, the arm hint at once; gate 0, the race ping says gamepad', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const P = await openPage({ mobile: false, w: 640, h: 360, before: XBOX });
  try {
    await P.open();
    await P.evaluate(`window._feel && window._feel.hideFirstRun && window._feel.hideFirstRun(), true`);
    await P.click('#menuFly');
    await sleep(700);
    if (await P.evaluate(`!!document.querySelector('#menuLayer .fly-map.on') && window.__ro.shown(document.querySelector('#menuLayer .fly-map.on'))`)) await P.click('#menuLayer .fly-map.on');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    await P.cdp('Page.bringToFront');
    // A pad starts in Acro; the pilot flies Angle (1).
    await P.key('1', 'Digit1', 49);
    await P.until(() => P.evaluate(`window._sim.coreState().flightMode === 'angle'`), 3000, 'Angle');
    const space = () => P.key(' ', 'Space', 32);
    await flyUntilOffer(P, space);
    const o = await P.offer();
    assert.equal(o.text, 'RACE THE RIG · 5 gates · T');
    // T with the offer up, armed in the air: the race, the arm hint at once.
    assert.equal(await P.evaluate('window.__ro.hint()'), null, 'no arm hint while armed');
    await P.key('t', 'KeyT', 84);
    await P.frames();
    const hint = await P.evaluate('window.__ro.hint()');
    const r = await P.race();
    assert.equal(r.track, 'rig-sprint', 'the Rig Sprint: ' + JSON.stringify(r));
    assert.equal(r.rings, 5);
    assert.ok(r.startRing, 'the START ring');
    assert.equal(r.armed, false);
    assert.ok(hint, 'the arm hint at once, for the pad: ' + hint);
    await throughGate0(P);
    await space();
    await P.until(async () => /LINE/.test((await P.race()).gate), 30000, 'gate 0 passed');
    await P.until(async () => P.pings.some((p) => p.body.event === 'race'), 5000, 'the race ping');
    const race = P.pings.filter((p) => p.body.event === 'race');
    assert.equal(race.length, 1);
    assert.deepEqual(race[0].body, { event: 'race', class: 65, core: 'bf', input: 'gamepad' });
  } finally { await P.close(); }
});

test('desktop, the 85 on classic physics: the offer for the Warehouse at 30 s; T flies the Warehouse Sprint', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const P = await openPage({ mobile: false, w: 640, h: 360 });
  try {
    await P.open();
    // The 85 (Your build's drone type), before the first flight: classic
    // physics (the js core), its class's map The Warehouse. Then the keyboard
    // on the first-run prompt, which flies the class's map.
    await P.evaluate(`(() => { const sel = document.getElementById('droneType'); sel.value = 'whoop85'; sel.dispatchEvent(new Event('change')); return true; })()`);
    await P.until(() => P.evaluate(`window._sim.core() === 'js'`), 15000, 'the 85 on the js core');
    await P.click('#feelKeys');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    await P.until(() => P.evaluate(`window._sim.map() === 'depot'`), 10000, 'The Warehouse');
    await P.cdp('Page.bringToFront');
    const space = () => P.key(' ', 'Space', 32);
    await flyUntilOffer(P, space, { race: 'depot-sprint', up: 'hold' });
    const o = await P.offer();
    assert.equal(o.text, 'RACE THE WAREHOUSE · 5 gates · T');
    await P.key('t', 'KeyT', 84);
    await P.frames();
    const r = await P.race();
    assert.equal(r.map, 'depot');
    assert.equal(r.track, 'depot-sprint', 'the Warehouse Sprint: ' + JSON.stringify(r));
    assert.equal(r.rings, 5);
    assert.ok(r.startRing, 'the START ring');
    assert.equal(r.armed, false);
    assert.equal(await P.evaluate(`window._sim.core()`), 'js', 'still classic physics');
    assert.ok(await P.evaluate('window.__ro.hint()'), 'the arm hint at once');
  } finally { await P.close(); }
});

test('phone, touch: the launch line about tracks; the offer with RACE, clear at three sizes; one tap, the Rig Sprint, the arm hint at once, gate 0, the race ping; none after a race', { timeout: 6 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const P = await openPage({ mobile: true, w: 812, h: 375 });
  try {
    await P.open();
    // The launch screen: its line about tracks where the blurb gives way.
    for (const [W, H] of [[812, 375], [667, 375], [375, 812]]) {
      await P.size(W, H);
      await P.frames();
      const l = JSON.parse(await P.evaluate('JSON.stringify(window.__ro.launch())'));
      for (const b of l.buttons) assert.ok(b.shown && b.uncovered, `${W}x${H}: ${b.id} on screen and clear ` + JSON.stringify(l));
      const line = l.tracks || l.lead;
      assert.ok(line && /MENU opens tracks/.test(line), `${W}x${H}: the line about tracks ` + JSON.stringify(l));
    }
    await P.size(812, 375);
    await P.frames();
    await P.tap('#menuFly');
    await sleep(700);
    await P.tap('#menuLayer .fly-map.on');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    const arm = () => P.tap('#touchArm');
    await flyUntilOffer(P, arm);
    // The prompt and its RACE, at three sizes.
    for (const [W, H] of [[812, 375], [667, 375], [375, 812]]) {
      await P.size(W, H);
      await sleep(300);
      await P.frames();
      const o = await P.offer();
      assert.equal(o.text, 'RACE THE RIG 5 gates RACE', `${W}x${H}`);
      assertPlaced(o, `phone ${W}x${H}`);
      assert.ok(o.go && o.go.h >= 44 && o.go.w >= 44 && o.go.uncovered, `${W}x${H}: RACE, 44 px or more and clear ` + JSON.stringify(o.go));
      // The longest map's name (The Warehouse) stays clear too.
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE WAREHOUSE', document.getElementById('raceOfferGates').textContent = '19 gates', true`);
      await P.frames();
      assertPlaced(await P.offer(), `phone ${W}x${H}, RACE THE WAREHOUSE`);
      await P.evaluate(`document.getElementById('raceOfferMap').textContent = 'RACE THE RIG', document.getElementById('raceOfferGates').textContent = '5 gates', true`);
    }
    await P.size(812, 375);
    await sleep(300);
    // One tap, from the air: the Rig Sprint, the arm hint (which flying hides)
    // within two painted frames.
    assert.equal((await P.sim()).armed, true, 'flying');
    assert.equal(await P.evaluate('window.__ro.hint()'), null, 'no arm hint while armed');
    await P.tap('#raceOfferGo');
    await P.frames();
    const hint = await P.evaluate('window.__ro.hint()');
    const r = await P.race();
    assert.equal(r.track, 'rig-sprint', 'the Rig Sprint: ' + JSON.stringify(r));
    assert.equal(r.rings, 5);
    assert.ok(r.startRing, 'the START ring');
    assert.equal(r.armed, false);
    assert.equal(r.offer.shown, false);
    assert.ok(hint && /stick|ARM/.test(hint), 'the arm hint at once, for touch: ' + hint);
    await throughGate0(P);
    await arm();
    await P.until(async () => /LINE/.test((await P.race()).gate), 30000, 'gate 0 passed');
    await P.until(async () => P.pings.some((p) => p.body.event === 'race'), 5000, 'the race ping');
    const race = P.pings.filter((p) => p.body.event === 'race');
    assert.equal(race.length, 1);
    assert.deepEqual(race[0].body, { event: 'race', class: 65, core: 'bf', input: 'touch' });
    // Back to free flight on the Rig: a disarm would have brought the second
    // showing; after a race, nothing.
    await P.evaluate(`window.__pilot.mode = 'land', true`);
    await P.until(async () => landed(await P.sim()), 20000, 'landed');
    await P.tap('#menuBtn');
    await sleep(600);
    await P.tap('#menuTracks');
    await sleep(600);
    await P.tap('.track-list [data-tid="rig-freestyle"]');
    await P.until(async () => /freestyle/.test((await P.race()).track), 10000, 'free flight');
    await P.evaluate(`window.__pilot.hover(1.0), true`);
    if (!(await P.sim()).armed) await arm();
    await P.until(async () => (await P.sim()).air, 8000, 'in the air');
    await sleep(1000);
    await landAndDisarm(P, arm);
    await sleep(1500);
    const s = await P.sim();
    assert.equal(s.offer.shown, false, 'no offer once a race has started');
    assert.equal(s.offer.raceStarted, true);
    assert.equal(s.offer.shows, 1);
  } finally { await P.close(); }
});

// The Rig Sprint's flight (RUN), and the full loop it offers.
const SPRINT_WPS = () => rigWaypoints(readTrack('rig-sprint'));
const PILOT_NAME = 'SprintPilot';
const onLoop = async (P, what) => {
  const r = await P.until(async () => { const x = await P.race(); return x.track === 'rig-loop' ? x : null; }, 10000, what);
  assert.equal(r.map, 'rig');
  assert.equal(r.rings, 17, 'the loop\'s gates');
  assert.ok(r.startRing, 'the START ring');
  assert.equal(r.armed, false, 'disarmed on its pad');
  const s = await P.run();
  assert.equal(s.card.up, false, 'the card gone');
  assert.equal(s.card.paused, false, 'the sim runs');
  return r;
};

test('desktop, keyboard, the Worker in the test: a fresh visitor takes the offer (T); R in the sprint, a new attempt from its pad; the finish asks, Enter posts, the row lit, "Full loop · 17 gates", T flies the loop; T on the loop\'s pad flies the sprint, posted with no card, the lap panel\'s full loop clear and clicked', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const P = await openPage({ mobile: false, w: 640, h: 360, worker: true });
  const at1280 = async (fn) => { await P.size(1280, 720); await sleep(250); await P.frames(); try { return await fn(); } finally { await P.size(640, 360); } };
  try {
    await P.open();
    await P.click('#feelKeys');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    await P.until(() => P.evaluate(`window._sim.map() === 'rig'`), 10000, 'The Rig');
    await P.cdp('Page.bringToFront');
    const space = () => P.key(' ', 'Space', 32);
    const tKey = () => P.key('t', 'KeyT', 84);
    // The offer (held in the air its 30 s), and T from the air: the Rig Sprint.
    await P.hoverUntilOffer(space);
    assert.equal((await P.offer()).text, 'RACE THE RIG · 5 gates · T');
    await tKey();
    await P.frames();
    let r = await P.race();
    assert.equal(r.track, 'rig-sprint', 'the Rig Sprint: ' + JSON.stringify(r));
    assert.equal(r.rings, 5);
    assert.equal(r.armed, false);
    // R in the sprint, once through gate 0: a new attempt, on its pad, disarmed.
    await P.startRace(SPRINT_WPS(), space);
    await P.until(async () => /LINE/.test((await P.race()).gate), 60000, 'gate 0 passed');
    await P.evaluate('(window.__run.stop(), true)');
    await P.key('r', 'KeyR', 82);
    r = await P.until(async () => { const x = await P.race(); return !x.armed && !/LINE/.test(x.gate) ? x : null; }, 10000, 'R: a new attempt');
    assert.equal(r.track, 'rig-sprint', 'still the sprint');
    const pad = JSON.parse(await P.evaluate(`JSON.stringify((() => { const t = window._sim.findTrack('rig-sprint'), p = window._sim.coreState().position; return { d: Math.hypot(-p.y - t.start.x / 3.5, -p.x - t.start.z / 3.5) }; })())`));
    assert.ok(pad.d < 0.6, 'on its pad: ' + JSON.stringify(pad));
    const toasts = (await P.run()).toasts;
    assert.ok(toasts.some((x) => /^NEW ATTEMPT/.test(x)), 'the toast says so: ' + JSON.stringify(toasts));
    // The sprint to its finish: the card asks.
    await P.flyRace(SPRINT_WPS(), space);
    let s = await P.until(async () => { const x = await P.run(); return x.card.up && x.card.asking ? x : null; }, 10000, 'the result card');
    assert.equal(s.card.kind, 'builtin');
    assert.equal(s.title, 'Rig Sprint');
    assert.equal(s.splits.split(' / ').length, 4, 'four gate splits: ' + s.splits);
    assert.equal(s.focus, 'rcName');
    assert.equal(s.loop, null, 'no full loop while it asks for the name');
    await P.type(PILOT_NAME);
    await P.key('Enter', 'Enter', 13);
    s = await P.until(async () => { const x = await P.run(); return x.card.posted ? x : null; }, 15000, 'posted');
    assert.match(s.place, /^#1 of 1 · Rig Sprint · 65 mm$/, s.place);
    assert.equal(s.me.length, 1, 'the pilot\'s row lit: ' + JSON.stringify(s.rows));
    assert.equal(s.loop, 'Full loop · 17 gates', 'the full loop on the board');
    assert.deepEqual((await P.board('rig-sprint')).map((x) => x.name), [PILOT_NAME], 'on the sprint\'s board');
    assert.deepEqual(await P.board('rig-loop'), [], 'not the loop\'s');
    assert.equal(s.card.paused, true, 'the sim waits');
    // T on the card's board: the Rig Loop.
    await tKey();
    await onLoop(P, 'T on the card: the Rig Loop');
    // T on the loop's pad (disarmed): the map's race, the sprint, again.
    await tKey();
    r = await P.until(async () => { const x = await P.race(); return x.track === 'rig-sprint' ? x : null; }, 10000, 'T: the sprint');
    // Flown again, named: posted with no card, the place on the lap panel.
    await P.flyRace(SPRINT_WPS(), space);
    // The finish toast offers it while it is up (over the lap panel's on a
    // small view), and once it has gone the lap panel's is clear.
    s = await P.run();
    assert.equal(s.flight.toast.startsWith('LINE '), true, 'the finish toast: ' + s.flight.toast);
    if (s.toastUp) {
      assert.equal(s.toastLoop, 'Full loop · 17 gates', 'the toast offers the full loop');
      const top = await P.top('toastLoop');
      assert.ok(top.found && top.hit, "the toast's full loop clear: " + JSON.stringify(top));
    }
    s = await P.until(async () => { const x = await P.run(); return /ONLINE #1 OF 1/.test(x.lap) && x.lapLoop && !x.toastUp ? x : null; }, 15000, 'the place and the full loop on the lap panel, the toast gone');
    assert.equal(s.cards, 1, 'no second card');
    assert.equal(s.lapLoop, 'Full loop · 17 gates');
    for (const [where, check] of [['640x360', () => P.top('lapLoop')], ['1280x720', () => at1280(() => P.top('lapLoop'))]]) {
      const top = await check();
      assert.ok(top.found && top.hit, where + ': the full loop is the top element at its centre ' + JSON.stringify(top));
    }
    assert.equal((await P.run()).offer.sprintResultUp, true, 'the sprint\'s result is up');
    await P.click('#lapLoop');
    await onLoop(P, 'the lap panel\'s full loop: the Rig Loop');
    assert.equal(P.pings.filter((p) => p.body.event === 'name').length, 1, 'the name ping, once');
  } finally { await P.close(); }
});

test('phone, touch, 812x375, the Worker in the test: a fresh visitor taps RACE, flies the sprint to its finish, names, taps Post, sees their row, taps "Full loop · 17 gates" (44 px, clear at three sizes): the Rig Loop', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  const P = await openPage({ mobile: true, w: 812, h: 375, worker: true });
  try {
    await P.open();
    await P.tap('#menuFly');
    await sleep(700);
    await P.tap('#menuLayer .fly-map.on');
    await P.until(async () => !(await P.evaluate(`document.body.classList.contains('menu-open')`)), 10000, 'flying');
    const arm = () => P.tap('#touchArm');
    await P.hoverUntilOffer(arm);
    await P.tap('#raceOfferGo');
    await P.frames();
    const r = await P.race();
    assert.equal(r.track, 'rig-sprint', 'the Rig Sprint: ' + JSON.stringify(r));
    assert.equal(r.rings, 5);
    await P.flyRace(SPRINT_WPS(), arm);
    let s = await P.until(async () => { const x = await P.run(); return x.card.up && x.card.asking ? x : null; }, 10000, 'the result card');
    assert.equal(s.title, 'Rig Sprint');
    await P.tap('#rcName');
    await P.type(PILOT_NAME);
    await P.tap('#rcPost');
    s = await P.until(async () => { const x = await P.run(); return x.card.posted ? x : null; }, 15000, 'posted');
    assert.match(s.place, /^#1 of 1 · Rig Sprint · 65 mm$/, s.place);
    assert.equal(s.me.length, 1, 'the pilot\'s row lit: ' + JSON.stringify(s.rows));
    assert.equal(s.loop, 'Full loop · 17 gates');
    assert.deepEqual((await P.board('rig-sprint')).map((x) => x.name), [PILOT_NAME]);
    for (const [W, H] of [[812, 375], [667, 375], [375, 812]]) {
      await P.size(W, H);
      await sleep(300);
      await P.frames();
      const top = await P.top('rcLoop');
      assert.ok(top.found && top.hit && top.h >= 44 && top.w >= 44, `${W}x${H}: the full loop, 44 px or more and clear ` + JSON.stringify(top));
    }
    await P.size(812, 375);
    await sleep(300);
    await P.frames();
    await P.tap('#rcLoop');
    await onLoop(P, 'the card\'s full loop: the Rig Loop');
    const named = P.pings.filter((p) => p.body.event === 'name');
    assert.equal(named.length, 1, 'the name ping, once');
    assert.equal(named[0].body.input, 'touch');
  } finally { await P.close(); }
});

// Before the Worker with the sprints' boards is deployed: the page against
// the Worker of another checkout (RO_WORKER_ROOT, at the deployed commit).
// Prints what a fresh visitor's card and a named pilot's lap panel say.
test('probe: the Rig Sprint against another checkout\'s Worker (RO_WORKER_ROOT): what the card and the lap panel say', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') { t.skip('SKIP_CHROME_BOOT'); return; }
  if (!process.env.RO_WORKER_ROOT) { t.skip('RO_WORKER_ROOT'); return; }
  const P = await openPage({ mobile: false, w: 640, h: 360, worker: true });
  try {
    await P.open();
    await P.click('#feelKeys');
    await P.until(() => P.evaluate(`window._sim.map() === 'rig'`), 10000, 'The Rig');
    await P.cdp('Page.bringToFront');
    const space = () => P.key(' ', 'Space', 32);
    const fly = async () => {
      await P.evaluate(`(window._sim.flyPickedTrack('rig', 'rig-sprint'), true)`);
      await P.until(async () => (await P.race()).track === 'rig-sprint', 10000, 'the sprint');
      await P.flyRace(SPRINT_WPS(), space);
    };
    await fly();
    const asked = await P.until(async () => { const x = await P.run(); return x.card.up ? x : (x.card.notAsked ? x : null); }, 10000, 'the card, or why not');
    const out = { asked: { up: asked.card.up, notAsked: asked.card.notAsked } };
    if (asked.card.up) {
      await P.type(PILOT_NAME);
      await P.key('Enter', 'Enter', 13);
      const s = await P.until(async () => { const x = await P.run(); return x.card.posted ? x : null; }, 15000, 'the board view');
      out.card = { place: s.place, rows: s.rows, loop: s.loop };
      await P.key('Enter', 'Enter', 13);
    }
    await sleep(1000);
    out.lapAfterCard = (await P.run()).lap;
    await fly();
    await sleep(6000);
    const s2 = await P.run();
    out.named = { cards: s2.cards, lap: s2.lap, lapLoop: s2.lapLoop };
    out.calls = P.calls.filter((c) => /builtin/.test(c.call)).map((c) => c.call + ' ' + c.status + ' ' + c.body.slice(0, 80));
    console.log('PROBE ' + JSON.stringify(out, null, 1));
  } finally { await P.close(); }
});
