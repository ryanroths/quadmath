// Headless Chrome: the bf core's sound (sim-audio.js), driven from sim-core's
// getState(). Boots The Rig on the bf core with no gesture, then presses keys
// through CDP (trusted input: a user activation): '1' (angle), Space (arm).
// Then a scripted flight of 2 min sim time: an altitude hold at 1.5 m with a
// 150 ms full-throttle punch every 20 s, a run at a wall to scrape along it,
// and a disarm in the air onto the floor. Asserts:
//   - no AudioContext before the first key (nothing for the autoplay policy
//     to refuse), the audio graph after it: two oscillators a motor, the
//     flight voices through the 3 kHz lowpass;
//   - the arming beep: Betaflight's beeper (sim-core v0.5.0) sounds on the
//     arm and the beeper voice plays it, then is quiet in the hover;
//   - in the hover (above 18 krpm) only the flight voice plays, each motor's
//     at its shaft rate (rpm / 60), and it rises on every punch;
//   - the punch frequency falls as vbat sags across the flight;
//   - wind follows airspeed, a wall slide scrapes, the floor impact thuds;
//   - M mutes and unmutes; the Controls card's master volume reads 60% and
//     sets the master;
//   - zero console errors and no autoplay warning.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs) and a few minutes;
// skipped under SKIP_CHROME_BOOT=1. SOUND_FLIGHT_JSON=<path> keeps the
// flight's samples there. The mappings themselves are tested first,
// in Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  shaftHz, bladePassHz, flightMix, motorLevels, flightWave, propBand, windLevel, windCutoffHz, thudLevel,
  TURTLE_RPM, FLIGHT_RPM, FLIGHT_LOWPASS_HZ,
  airframeBlades, loadSoundPrefs, saveSoundPrefs, createSimAudio, SOUND_VOL_DEFAULT,
} from '../sim-audio.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('sim-audio mappings: pitch from rpm, level from rpm squared, wind from airspeed squared, thud from impact speed', () => {
  assert.ok(Math.abs(shaftHz(32360) - 539.33) < 0.01, 'Air65 hover: shaft rate 32360 rpm / 60');
  assert.ok(Math.abs(bladePassHz(32360, 2) - 1078.67) < 0.01, 'its 2-blade fundamental, rpm / 30');
  assert.equal(bladePassHz(-6000, 2), 200, 'reversed motors (turtle) sound by speed');
  const hover = motorLevels(32360, 32360).flight;
  assert.ok(Math.abs(motorLevels(32360 * 1.5, 32360).flight / hover - 2.25) < 1e-9, 'rpm x1.5 is level x2.25');
  assert.deepEqual(motorLevels(0, 32360), { turtle: 0, flight: 0 }, 'a stopped motor is silent');
  assert.ok(propBand(40000, 2, 0.5).hz > propBand(30000, 2, 0.5).hz, 'prop band follows mean rpm');
  assert.ok(Math.abs(windLevel(10) / windLevel(5) - 4) < 1e-9, 'wind level from airspeed squared');
  assert.ok(windCutoffHz(10) > windCutoffHz(2), 'wind cutoff rises with speed');
  assert.equal(thudLevel(0.1, false), 0, 'a touch is not a thud');
  assert.ok(thudLevel(4, false) > thudLevel(2, false), 'thud level from impact speed');
  assert.ok(thudLevel(3, true) > thudLevel(3, false), 'a crash is louder');
});

test('sim-audio motor voices: below 15 krpm the turtle voice as first shipped; above 18 krpm shaft rate loudest, blade-pass -6 dB, its harmonic -12 dB, 6 dB under', () => {
  assert.equal(TURTLE_RPM, 15000);
  assert.equal(FLIGHT_RPM, 18000);
  assert.equal(FLIGHT_LOWPASS_HZ, 3000);
  assert.equal(flightMix(TURTLE_RPM), 0);
  assert.equal(flightMix(FLIGHT_RPM), 1);
  assert.equal(flightMix(16500), 0.5);
  // Below 15 krpm: the motor level and the prop band are the first voice's
  // (0.035 x (rpm / hover)^2; band at 2 x rpm / 60 x 3, Q 1.1, 0.22 x thrust).
  for (const rpm of [3000, 9000, 14999]) {
    const r = rpm / 32360;
    assert.deepEqual(motorLevels(rpm, 32360), { turtle: 0.035 * r * r, flight: 0 }, `${rpm} rpm: the turtle voice alone`);
    assert.deepEqual(propBand(rpm, 2, 0.4), { hz: Math.max(300, 2 * (rpm / 60 * 3)), q: 1.1, gain: 0.22 * 0.4 }, `${rpm} rpm: the turtle band`);
  }
  // From 18 krpm: the flight voice alone, 6 dB under; band wider and 3 dB up.
  const r = 40000 / 32360;
  const lv = motorLevels(40000, 32360);
  assert.equal(lv.turtle, 0);
  assert.ok(Math.abs(20 * Math.log10(lv.flight / (0.035 * r * r)) + 6.02) < 0.01, 'flight voice 6 dB under the turtle voice');
  const w = flightWave(2);
  assert.deepEqual([...w], [0, 1, 0.5, 0, 0.25], 'shaft rate, blade-pass (rpm / 30), its harmonic (rpm / 15)');
  assert.ok(Math.abs(20 * Math.log10(w[2] / w[1]) + 6.02) < 0.01, 'blade-pass 6 dB under the shaft rate');
  assert.ok(Math.abs(20 * Math.log10(w[4] / w[1]) + 12.04) < 0.01, 'its harmonic 12 dB under');
  const band = propBand(40000, 2, 0.4);
  assert.ok(Math.abs(band.hz - 2 * 40000 / 30) < 1e-9 && band.q < 1.1, 'prop band on the 2-blade fundamental, wider');
  assert.ok(Math.abs(20 * Math.log10(band.gain / (0.22 * 0.4)) - 3.01) < 0.01, 'prop band 3 dB up');
});

test('sim-audio: the blade count is the airframe\'s, and the Air65 has 2', () => {
  const air65 = JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8'));
  assert.equal(airframeBlades(air65, 3), 2, 'air65.json bladeCount: Gemfan 1219S, 2 blades');
  assert.equal(airframeBlades({ values: { blades: { value: 4 } } }, 2), 4, 'a numeric field wins');
  assert.equal(airframeBlades({ name: 'a 3-blade prop', values: {} }, 2), 3, 'else the prop record');
  assert.equal(airframeBlades({ name: 'unnamed', values: {} }, 2), 2, 'otherwise the fallback');
});

test('sim-audio: master volume 60% by default, saved with mute; no AudioContext without one', () => {
  assert.equal(SOUND_VOL_DEFAULT, 0.6);
  const store = memoryStore();
  assert.deepEqual(loadSoundPrefs(store), { vol: 0.6, muted: false });
  saveSoundPrefs({ vol: 0.25, muted: true }, store);
  assert.deepEqual(loadSoundPrefs(store), { vol: 0.25, muted: true });
  const a = createSimAudio({ storage: memoryStore(), AudioContext: null });
  assert.equal(a.volume, 0.6);
  assert.equal(a.unlock(), false, 'nothing to unlock without Web Audio');
  assert.equal(a.debug().state, 'none');
  a.update({ kind: 'bf', rpm: [1, 1, 1, 1] });
  a.contact(5, true);
});

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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mime(p) {
  return ({
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
    '.txt': 'text/plain',
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

// A real key through CDP: trusted, so it is a user activation.
async function press(ws, key, code, vk) {
  const text = key.length === 1 ? key : undefined;
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text });
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
}

// Chrome's renderer and GPU processes outlive a killed parent on Windows.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } }
}

// The flight, run in the page every 4 ms (the page's own input poll rate) on
// the bf core's state. Sim time (cs.flightMs) sets the schedule, so a slow
// frame stretches the wall clock, not the flight.
const FLIGHT = String.raw`(() => {
  const s = window._sim, a = s.audio;
  const F = window.__flight = { phase: 'arming', samples: [], punches: [], wind: [], wall: null, floor: null, done: false, error: null,
    beep: { firstOn: null, lastOn: null, onTicks: 0, peakGain: 0 } };
  const T_PUNCH = [8000, 28000, 48000, 68000, 88000, 108000];
  const PUNCH_MS = 150, HOVER_Z = 1.5, WALL_AT = 118000;
  let t0 = null, x0 = 0, y0 = 0, tHover = 0.4, punch = null, hoverHz = [], wallStart = null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const id = setInterval(() => {
    try {
      const cs = s.coreState();
      if (cs.kind !== 'bf') return;
      const d = a.debug();
      if (F.phase === 'arming') {
        if (!cs.armed) return;
        t0 = cs.flightMs; x0 = cs.position.x; y0 = cs.position.y;
        F.vbatArm = cs.battV;
        F.phase = 'hover';
      }
      const t = cs.flightMs - t0;
      // The arming beep (300 ms on, 50 off, 50 on), from the arm.
      if (t < 1000) {
        if (cs.beeper) { F.beep.onTicks++; F.beep.lastOn = t; if (F.beep.firstOn === null) F.beep.firstOn = t; }
        F.beep.peakGain = Math.max(F.beep.peakGain, d.beeperGain);
      }
      const q = cs.quaternion;
      const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const v = cs.velocity;
      const speed = Math.hypot(v.x, v.y, v.z);
      // Hold altitude: PD on height, the hover throttle learnt slowly.
      const ez = HOVER_Z - cs.position.z;
      let thr = clamp(tHover + 0.15 * ez - 0.12 * v.z, 0.05, 0.85);
      // Hold position in the body frame (angle mode: stick is tilt).
      const ex = x0 - cs.position.x, ey = y0 - cs.position.y;
      const fwdErr = ex * c + ey * sn, leftErr = -ex * sn + ey * c;
      const vFwd = v.x * c + v.y * sn, vLeft = -v.x * sn + v.y * c;
      let p = clamp(0.06 * fwdErr - 0.08 * vFwd, -0.2, 0.2);
      let r = clamp(-(0.06 * leftErr - 0.08 * vLeft), -0.2, 0.2);
      if (F.phase === 'hover') {
        tHover = clamp(tHover + 0.0005 * clamp(ez, -0.5, 0.5), 0.2, 0.6);
        if (t > 4000 && Math.abs(ez) < 0.25 && Math.abs(v.z) < 0.4) {
          hoverHz.push(mean(d.motorHz));
          if (hoverHz.length > 250) hoverHz.shift();
        }
        const next = T_PUNCH[F.punches.length];
        if (next !== undefined && t > next + 20000) throw new Error('no steady hover for punch ' + (F.punches.length + 1));
        if (next !== undefined && t >= next && hoverHz.length >= 50) {
          punch = { at: t, hoverHz: mean(hoverHz), vbat: cs.battV, peakHz: 0, peakTargetHz: 0, peakRpm: 0, peakProp: 0 };
          F.phase = 'punch';
        } else if (next === undefined && t >= WALL_AT) {
          F.phase = 'wall';
          wallStart = t;
          F.wall = { step: 'approach', contacts: 0, peakScrape: 0, peakScrapeSpeed: 0 };
        }
      }
      if (F.phase === 'punch') {
        thr = 1;
        const hz = mean(d.motorHz);
        if (hz > punch.peakHz) punch.peakHz = hz;
        punch.peakTargetHz = Math.max(punch.peakTargetHz, mean(d.motorTargetHz));
        punch.peakRpm = Math.max(punch.peakRpm, mean(cs.rpm));
        punch.peakProp = Math.max(punch.peakProp, d.propGain);
        if (t - punch.at >= PUNCH_MS) {
          F.punches.push(punch);
          hoverHz = [];
          F.phase = 'hover';
        }
      }
      if (F.phase === 'wall') {
        // Sticks set in the world frame (angle mode: stick is tilt) at the
        // hold altitude: toward the Rig's -X wall until a box is touched. Then
        // the slide, set up the same way every run: the quad 0.25 m off that
        // face (its attitude kept), moving 3.5 m/s along it (-Y) and 0.5 m/s
        // into it, flown on along it. (Flown into a wall, the Air65 leans on
        // it and sometimes sticks, sometimes slides.)
        const wall = cs.contactFlags & 2;
        if (F.wall.step === 'approach' && wall) {
          F.wall.step = 'graze';
          F.wall.touchX = cs.position.x;
          F.wall.at = t;
          s.bfCore().teleport({ x: cs.position.x + 0.25, y: cs.position.y, z: cs.position.z }, null, { x: -0.5, y: -3.5, z: 0 });
        }
        if (F.wall.step === 'graze' && wall) F.wall.contacts++;
        const wx = F.wall.step === 'graze' ? -0.1 : -0.5;
        const wy = F.wall.step === 'graze' ? -0.7 : 0;
        p = wx * c + wy * sn;
        r = -(-wx * sn + wy * c);
        if (F.wall.step === 'graze' && d.scrapeGain > F.wall.peakScrape) { F.wall.peakScrape = d.scrapeGain; F.wall.peakScrapeSpeed = speed; }
        if (t - wallStart > 12000 || (F.wall.step === 'graze' && t - F.wall.at > 2500)) {
          F.phase = 'drop';
          F.floor = { thudsBefore: d.thuds, at: t };
          s.setTestStick({ r: 0, p: 0, y: 0, t: 0 });
          window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
        }
      }
      if (F.phase === 'drop') {
        thr = 0; p = 0; r = 0;
        if (t - F.floor.at > 2500) {
          F.floor.thudsAfter = d.thuds;
          F.end = { vbat: cs.battV, t };
          F.done = true;
          clearInterval(id);
          return;
        }
      }
      if (F.phase !== 'drop' && F.phase !== 'arming') s.setTestStick({ r, p, y: 0, t: thr });
      if (F.phase !== 'arming' && F.samples.length < 4000 && (F.samples.length === 0 || t - F.samples[F.samples.length - 1].t >= 100)) {
        F.samples.push({ t: Math.round(t), z: +cs.position.z.toFixed(2), vbat: cs.battV, hz: +mean(d.motorHz).toFixed(1), rpm: Math.round(mean(cs.rpm)), fg: mean(d.flightGain), tg: mean(d.turtleGain), bp: d.beeperGain, thr: +thr.toFixed(3), armed: cs.armed, x: +cs.position.x.toFixed(2), y: +cs.position.y.toFixed(2), roll: +(cs.attitude.roll * 57.3).toFixed(1), pitch: +(cs.attitude.pitch * 57.3).toFixed(1), sp: +speed.toFixed(2), cf: cs.contactFlags, phase: F.phase });
      }
      if (speed > 1) F.wind.push({ t, speed, gain: d.windGain, targetGain: d.windTargetGain, targetHz: d.windTargetHz });
      if (F.wind.length > 2000) F.wind.shift();
    } catch (e) {
      F.error = String(e && e.stack || e);
      clearInterval(id);
    }
  }, 4);
  return true;
})()`;

test('bf core sound: graph on the first key, motor pitch from rpm rises on a punch and falls with sag, wind, scrape, thud; no console errors', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const profile = mkdtempSync(join(tmpdir(), 'qm-sound-'));
  const debugPort = 9600 + (process.pid % 300);
  const url = `http://127.0.0.1:${port}/sim.html?map=rig&quality=low&menu=1&fpv=1`;
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
    `--user-data-dir=${profile}`, url,
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
        page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl && String(p.url).includes('map=rig'));
      } catch (e) { /* Chrome is still coming up */ }
    }
    assert.ok(page, 'no CDP page\n' + stderr.slice(-400));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    const errors = [];
    const warnings = [];
    ws.addEventListener('message', (msg) => {
      try {
        const o = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        const text = (args) => (args || []).map((a) => a.value || a.description || '').join(' ');
        if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'error') errors.push(text(o.params.args));
        if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'warning') warnings.push(text(o.params.args));
        if (o.method === 'Runtime.exceptionThrown') {
          const ex = o.params.exceptionDetails || {};
          errors.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'exception');
        }
        // Chrome's autoplay notice arrives as a browser log entry, not console API.
        if (o.method === 'Log.entryAdded') {
          const e = o.params.entry;
          const line = e.url ? `${e.text} (${e.url})` : e.text;
          if (e.level === 'error') errors.push(line);
          if (e.level === 'warning') warnings.push(line);
        }
      } catch (e) { /* ignore */ }
    });
    await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Log.enable');
    await cdp(ws, 'Page.enable');

    // The bf core flying, the menus and first-run prompt out of the way
    // (by script: no gesture yet).
    let ready = false;
    for (let i = 0; i < 160 && !ready; i++) {
      await sleep(250);
      ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === 'bf' && window._sim.audio && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`);
    }
    assert.ok(ready, 'the bf core never flew');
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
    await sleep(500);

    const before = await evaluate(ws, `JSON.stringify({ audio: window._sim.audio.debug(), activated: navigator.userActivation.hasBeenActive })`);
    const b = JSON.parse(before);
    assert.equal(b.activated, false, 'no user activation before the first key');
    assert.equal(b.audio.state, 'none', 'no AudioContext before a gesture');

    await cdp(ws, 'Page.bringToFront');
    await press(ws, '1', 'Digit1', 49);
    await sleep(300);
    const g = JSON.parse(await evaluate(ws, `JSON.stringify(window._sim.audio.debug())`));
    assert.equal(g.graph, true, 'the first key builds the audio graph');
    assert.equal(g.state, 'running', 'the AudioContext runs after the key');
    assert.equal(g.motors, 4, 'four motors');
    assert.equal(g.oscillators, 8, 'two voices a motor');
    assert.equal(g.flightLowpassHz, 3000, 'the flight voices through the 3 kHz lowpass');
    assert.equal(g.blades, 2, 'the Air65 airframe: Gemfan 1219S, 2 blades');
    assert.equal(new Set(g.detune).size, 4, 'each motor detuned differently');
    assert.ok(Math.abs(g.master - 0.6) < 1e-3, `master volume 60% by default (${g.master})`);
    assert.ok(g.flightGain.concat(g.turtleGain).every((x) => x < 1e-3), 'disarmed: the motors are silent');

    await evaluate(ws, FLIGHT);
    await evaluate(ws, `window._sim.setTestStick({ r: 0, p: 0, y: 0, t: 0 }), true`);
    await press(ws, ' ', 'Space', 32);

    let f = null;
    const startedAt = Date.now();
    for (;;) {
      await sleep(2000);
      f = JSON.parse(await evaluate(ws, `JSON.stringify({ done: window.__flight.done, error: window.__flight.error, phase: window.__flight.phase, punches: window.__flight.punches.length })`));
      if (f.done || f.error) break;
      if (Date.now() - startedAt > 12 * 60 * 1000) break;
    }
    const flight = JSON.parse(await evaluate(ws, `JSON.stringify(window.__flight)`));
    await evaluate(ws, `window._sim.setTestStick(null), true`);

    // M mutes everything, M again unmutes; the start menu's Controls card
    // carries the master volume, and its slider sets it.
    const master = async () => JSON.parse(await evaluate(ws, `JSON.stringify({ master: window._sim.audio.debug().master, muted: window._sim.audio.muted })`));
    await press(ws, 'm', 'KeyM', 77);
    await sleep(400);
    const muted = await master();
    await press(ws, 'm', 'KeyM', 77);
    await sleep(400);
    const unmuted = await master();
    const card = JSON.parse(await evaluate(ws, `(function(){
      document.getElementById('menuControls').click();
      var el=document.querySelector('#menuLayer .sound-vol'), b=document.querySelector('#menuLayer .sound-btn');
      var shown={ value: el && +el.value, label: b && b.textContent };
      el.value='0.3'; el.dispatchEvent(new Event('input'));
      return JSON.stringify(shown);
    })()`));
    await sleep(400);
    const set = await master();
    const stored = await evaluate(ws, `localStorage.getItem('quadmathSimSoundVol')`);

    if (process.env.SOUND_FLIGHT_JSON) writeFileSync(process.env.SOUND_FLIGHT_JSON, JSON.stringify({ flight, errors, warnings }));
    const trace = () => flight.samples.filter((s, i) => i % 10 === 0).map((s) => `${s.t} ${s.phase} z ${s.z} ${s.vbat && s.vbat.toFixed(2)} V ${s.hz} Hz ${s.rpm} rpm thr ${s.thr}`).join('\n');
    assert.equal(flight.error, null, 'flight script: ' + flight.error + '\n' + trace());
    assert.ok(flight.done, `the flight finished (phase ${flight.phase}, ${flight.punches.length} punches)\n` + trace());

    // The arming beep: on from the arm, played, then quiet.
    assert.ok(flight.beep.firstOn !== null && flight.beep.firstOn < 100, `the arming beep starts ${flight.beep.firstOn} ms after the arm`);
    // In sim time: the poll is setInterval(4 ms), which a heavy frame slows.
    assert.ok(flight.beep.lastOn - flight.beep.firstOn >= 200, `it sounds for a while (${flight.beep.lastOn - flight.beep.firstOn} ms, ${flight.beep.onTicks} polls)`);
    assert.ok(flight.beep.peakGain > 0.1, `the beeper voice plays it (${flight.beep.peakGain})`);
    const hover = flight.samples.filter((s) => s.phase === 'hover' && s.t > 4000);
    assert.ok(hover.every((s) => s.bp < 1e-3), 'the beeper is quiet in the hover');
    assert.ok(hover.length > 300, `hovered (${hover.length} samples)`);
    // Every steady hover sample (at the hold altitude, rpm within 2% of the
    // sample 100 ms before; not the overshoot and spin-down after a punch,
    // which the oscillators glide through in a frame or two): the flight
    // voice alone, its oscillators at the shaft rate of the rpm, to 1%.
    const steady = hover.filter((s, i) => i > 0 && hover[i - 1].t >= s.t - 150
      && Math.abs(s.rpm - hover[i - 1].rpm) < 0.02 * s.rpm && Math.abs(s.z - 1.5) < 0.3);
    assert.ok(steady.length > 0.7 * hover.length, `mostly steady (${steady.length} of ${hover.length})`);
    for (const s of steady) {
      assert.ok(Math.abs(s.hz - s.rpm / 60) < 0.01 * s.rpm / 60, `motor Hz ${s.hz} vs rpm ${s.rpm} at ${s.t} ms`);
      assert.ok(s.fg > 0.01 && s.tg < 1e-4, `hover: the flight voice alone (flight ${s.fg}, turtle ${s.tg}) at ${s.t} ms`);
    }

    assert.equal(flight.punches.length, 6, 'six punches in 2 min');
    for (const p of flight.punches) {
      assert.ok(p.peakHz > 1.3 * p.hoverHz, `punch at ${p.at} ms: ${p.peakHz.toFixed(0)} Hz over hover ${p.hoverHz.toFixed(0)} Hz`);
      assert.ok(Math.abs(p.peakTargetHz - p.peakRpm / 60) < 0.01 * p.peakTargetHz, 'punch pitch is the rpm\'s');
      assert.ok(p.peakProp > 0.1, `prop noise rises with thrust on a punch (${p.peakProp})`);
    }
    const first = flight.punches[0];
    const last = flight.punches[flight.punches.length - 1];
    assert.ok(last.at - first.at >= 90000, 'punches span the flight');
    assert.ok(last.vbat < first.vbat - 0.1, `vbat sags: ${first.vbat.toFixed(2)} V to ${last.vbat.toFixed(2)} V`);
    assert.ok(last.peakHz < 0.98 * first.peakHz, `punch pitch falls with sag: ${first.peakHz.toFixed(0)} Hz to ${last.peakHz.toFixed(0)} Hz`);
    for (let i = 1; i < flight.punches.length; i++) {
      const a = flight.punches[i - 1], c = flight.punches[i];
      assert.ok(c.peakHz < a.peakHz * 1.005, `punch ${i + 1} (${c.peakHz.toFixed(0)} Hz) not above punch ${i} (${a.peakHz.toFixed(0)} Hz)`);
    }

    // Wind, over the last seconds flown (1 to 4 m/s): on every sample the
    // voice is set from the airspeed (level 0.3 x (v / 20 m/s)^2, cutoff
    // 250 + 180 v Hz); where the speed has held within 2% for 240 ms (three
    // of the level's 80 ms glide; a jump in speed, as the teleport before the
    // wall slide, lags) the live level is the set one, to 10%.
    assert.ok(flight.wind.length > 200, `wind samples (${flight.wind.length})`);
    for (const w of flight.wind) {
      const want = 0.3 * (w.speed / 20) ** 2;
      assert.ok(Math.abs(w.targetGain - want) < 0.02 * want, `wind level ${w.targetGain} at ${w.speed.toFixed(2)} m/s, want ${want}`);
      assert.ok(Math.abs(w.targetHz - (250 + 180 * w.speed)) < 1, `wind cutoff ${w.targetHz} at ${w.speed.toFixed(2)} m/s`);
    }
    // One sample a frame (sim time moves once a frame; the 4 ms polls between
    // repeat it), the window continuous (no frame gap over 50 ms) and 240 ms long.
    const frames = flight.wind.filter((x, i, a) => i === 0 || x.t !== a[i - 1].t);
    const steadyWind = frames.filter((w, i) => {
      const win = frames.filter((x, j) => j <= i && x.t >= w.t - 240);
      const before = frames[i - win.length];
      if (!before || w.t - before.t < 240 || win[0].t - before.t > 50) return false;
      if (!win.every((x, k) => k === 0 || x.t - win[k - 1].t <= 50)) return false;
      const speeds = win.map((x) => x.speed);
      return Math.max(...speeds) - Math.min(...speeds) < 0.02 * w.speed;
    });
    assert.ok(steadyWind.length > 100, `steady-speed wind samples (${steadyWind.length})`);
    for (const w of steadyWind) {
      assert.ok(Math.abs(w.gain - w.targetGain) < 0.1 * w.targetGain, `live wind level ${w.gain} vs ${w.targetGain} at ${w.speed.toFixed(2)} m/s`);
    }
    const slowest = flight.wind.reduce((a, w) => (w.speed < a.speed ? w : a));
    const fastest = flight.wind.reduce((a, w) => (w.speed > a.speed ? w : a));
    assert.ok(fastest.speed > 2 * slowest.speed && fastest.targetGain > 3.9 * slowest.targetGain, 'louder with airspeed');

    assert.ok(flight.wall && flight.wall.contacts > 0, 'the wall run touched a wall');
    assert.ok(flight.wall.peakScrape > 0.1 && flight.wall.peakScrapeSpeed > 1.5, `sliding along the wall scrapes (${flight.wall.peakScrape} at ${flight.wall.peakScrapeSpeed} m/s)`);
    assert.ok(flight.floor.thudsAfter > flight.floor.thudsBefore, 'the drop onto the floor thuds');

    assert.ok(muted.muted && muted.master < 0.01, `M mutes (master ${muted.master})`);
    assert.ok(!unmuted.muted && Math.abs(unmuted.master - 0.6) < 0.01, `M again unmutes (master ${unmuted.master})`);
    assert.equal(card.value, 0.6, 'the Controls card shows the master volume, 60%');
    assert.match(card.label, /SOUND \[M\]/, 'and the mute button');
    assert.ok(Math.abs(set.master - 0.3) < 0.01, `its slider sets the master (${set.master})`);
    assert.equal(stored, '0.3', 'and saves it');

    // Off quadmath.com, the page's Cloudflare analytics beacon has its report
    // refused (CORS on a 127.0.0.1 origin): the beacon's, not the page's.
    assert.deepEqual(errors.filter((e) => !/cloudflareinsights\.com/.test(e)), [], 'console errors');
    assert.deepEqual(warnings.filter((w) => /AudioContext|autoplay/i.test(w)), [], 'autoplay warnings');
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
