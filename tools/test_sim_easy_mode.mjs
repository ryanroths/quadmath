// Easy mode, the default for every input on every core.
//   - In node: the throttle arm and disarm (sim-3d.js stepEasyArm), the stick
//     turtle (sim-feel.js wantsEasyTurtle), the "flip your switch" wizard and
//     the per-radio save and migration (sim-touch.js), and the switches moved
//     onto the diff's channels (sim-core-adapter.js switchAux).
//   - In headless Chrome (fresh profile each): a fake TX16S with ARM on AUX4,
//     its AUX1 and AUX3 resting high. From the page opening to flying in the
//     Rig with no menu; arms by throttle, flies, disarms on the 2 s rule and
//     after a crash, turtles by roll and by pitch stick (the page on
//     Betaflight's turtle channel). The wizard on that radio, saved per radio.
//     A profile saved before Easy mode (AUX1 arm, AUX3 turtle) migrates to
//     switches-on and its channels pass through unchanged. And the other
//     input and core pairs: the radio on ?core=js, the keyboard on both cores,
//     a gamepad, touch.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stepEasyArm, EASY_ARM_HOLD_S, EASY_DISARM_HOLD_S, isLanded, armHintText } from '../sim-3d.js';
import { wantsEasyTurtle, flipHintText } from '../sim-feel.js';
import {
  AETR_MAP, ARM_SWITCH_PREFIX, AXIS_MAP_PREFIX, RADIO_PRESET_PREFIX, SWITCHES_PREFIX, GP_ID_KEY, sanitizeId,
  loadRadioSwitches, saveRadioSwitches, switchesAxisMap, auxNumberOfAxis,
  SWITCH_WIZARD_STEPS, createSwitchWizard, stepSwitchWizard, skipSwitchWizard, switchWizardResult,
  defaultFlightMode, saveFlightMode, hasArmSwitch,
} from '../sim-touch.js';
import { switchAux, radioAux, auxRanges } from '../sim-core-adapter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DIFF = readFileSync(join(root, 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt'), 'utf8');
const TX = 'RM TX16S Joystick (Vendor: 1209 Product: 4f54)';
const ZORRO = 'RadioMaster Zorro Joystick (Vendor: 1209 Product: 4f55)';
const SID = sanitizeId(TX);

function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const DT = 0.004;
// Run stepEasyArm for s seconds of 4 ms samples; returns the state and the
// first arm or disarm, with when it came.
function run(state, seconds, sample) {
  let st = state;
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const out = stepEasyArm(st, { dt: DT, ready: true, autoArm: true, ...sample });
    st = out.state;
    if (out.arm || out.disarm) return { state: st, out, at: (i + 1) * DT };
  }
  return { state: st, out: null, at: null };
}

test('easy arm: the throttle held at the bottom for 1 s, then raised, arms; a shorter hold does not', () => {
  assert.equal(EASY_ARM_HOLD_S, 1);
  let r = run({}, 0.9, { t: 0, armed: false });
  assert.equal(r.out, null, 'nothing while it is held');
  r = run(r.state, 0.2, { t: 0.5, armed: false });
  assert.equal(r.out, null, 'raised after 0.9 s: no arm');
  r = run(r.state, 0.2, { t: 0.5, armed: false });
  assert.equal(r.out, null, 'and the hold starts over');
  r = run({}, 1.01, { t: 0, armed: false });
  assert.equal(r.out, null);
  r = run(r.state, 0.05, { t: 0.08, armed: false });
  assert.equal(r.out, null, 'part way up is not raised, and keeps the hold');
  r = run(r.state, 0.05, { t: 0.5, armed: false });
  assert.equal(r.out.arm, true, 'raised after 1 s arms');
});

test('easy arm: a throttle that was never low, unsafe sticks, or upside down never arm; auto-arm off does not', () => {
  assert.equal(run({}, 3, { t: 0.5, armed: false }).out, null, 'throttle left up at load');
  let r = run({}, 2, { t: 0, armed: false, ready: false });
  assert.equal(run(r.state, 0.1, { t: 0.5, armed: false }).out, null, 'the safety gate counts for nothing');
  r = run({}, 2, { t: 0, armed: false, blocked: true });
  assert.equal(run(r.state, 0.1, { t: 0.5, armed: false, blocked: true }).out, null, 'upside down the stick turtles, the throttle does not arm');
  r = run({}, 2, { t: 0, armed: false, autoArm: false });
  assert.equal(run(r.state, 0.1, { t: 0.5, armed: false, autoArm: false }).out, null, 'Tune: auto-arm off');
  r = run({}, 1.2, { t: 0.5, threeD: true, armed: false });
  assert.equal(r.out, null, '3D: centred is its bottom');
  assert.equal(run(r.state, 0.05, { t: 0.9, threeD: true, armed: false }).out.arm, true, '3D: then leaving centre arms');
});

test('easy disarm: throttle at the bottom 2 s while landed, not in the air, not before it flew', () => {
  assert.equal(EASY_DISARM_HOLD_S, 2);
  let r = run({}, 0.1, { t: 0.5, armed: true, landed: false });
  r = run(r.state, 3, { t: 0, armed: true, landed: false });
  assert.equal(r.out, null, 'falling at zero throttle stays armed');
  r = run(r.state, 1.9, { t: 0, armed: true, landed: true });
  assert.equal(r.out, null, 'landed 1.9 s');
  r = run(r.state, 0.2, { t: 0, armed: true, landed: true });
  assert.equal(r.out.disarm, true, 'landed 2 s disarms');
  assert.equal(r.out.reason, 'landed');
  assert.ok(r.at <= 0.11 && r.at >= 0.09, `at 2.0 s (${1.9 + r.at})`);
  r = run({ raised: true }, 1.9, { t: 0, armed: true, landed: true });
  r = run(r.state, 0.2, { t: 0.2, armed: true, landed: true });
  assert.equal(r.out, null);
  r = run(r.state, 1.9, { t: 0, armed: true, landed: true });
  assert.equal(r.out, null, 'throttle touched: the 2 s start over');
  assert.equal(run({}, 5, { t: 0, armed: true, landed: true }).out, null, 'armed at idle (Space, the touch ARM button), never raised: stays armed');
});

test('easy disarm: a crash, once it has come to rest, at any throttle; the arm after it needs a new hold', () => {
  let r = run({ raised: true }, 0.1, { t: 0.4, armed: true, landed: false, crashed: true });
  assert.equal(r.out, null, 'still moving: a wall tap flies on');
  r = run(r.state, 0.1, { t: 0.4, armed: true, landed: true, crashed: true });
  assert.equal(r.out.disarm, true);
  assert.equal(r.out.reason, 'crash');
  assert.equal(run(r.state, 0.1, { t: 0.5, armed: false }).out, null, 'throttle still up: no re-arm');
  const down = run(r.state, 1.2, { t: 0, armed: false });
  assert.equal(run(down.state, 0.05, { t: 0.5, armed: false }).out.arm, true, 'down 1 s and up again');
});

test('isLanded and the hint texts', () => {
  assert.equal(isLanded({ clearanceM: 0.01, speed: 0.1, omega: 0.2 }), true);
  assert.equal(isLanded({ clearanceM: 0.2, speed: 0.1, omega: 0.2 }), false, 'in the air');
  assert.equal(isLanded({ clearanceM: 0.01, speed: 3, omega: 0.2 }), false, 'skidding');
  assert.equal(armHintText({ easy: true }), 'Throttle down 1 s, then up to fly');
  assert.equal(armHintText({ easy: true, autoArm: false }), 'Throttle down + Space/arm switch to arm', 'Tune: auto-arm off');
  assert.equal(armHintText({ easy: true, hasSwitch: true }), 'Flip arm switch');
  assert.equal(flipHintText({ easy: true, core: 'bf', armed: false }), 'FLIPPED — FULL ROLL OR PITCH STICK · R RESPAWNS');
  assert.equal(flipHintText({ easy: true, core: 'js', touch: true }), 'FLIPPED — FULL ROLL OR PITCH STICK · OR RESPAWN');
});

test('easy turtle: upside down at rest, a full roll or pitch stick, armed or not, any throttle', () => {
  const rest = { upZ: -1, clearanceM: 0.01, speed: 0, omega: 0, threeD: false, r: 1, p: 0 };
  assert.equal(wantsEasyTurtle(rest), true, 'full right roll');
  assert.equal(wantsEasyTurtle({ ...rest, r: -1 }), true, 'full left roll');
  assert.equal(wantsEasyTurtle({ ...rest, r: 0, p: 1 }), true, 'full pitch');
  assert.equal(wantsEasyTurtle({ ...rest, r: 0, p: -1 }), true, 'full pitch back');
  assert.equal(wantsEasyTurtle({ ...rest, r: 0.5 }), false, 'half a stick');
  assert.equal(wantsEasyTurtle({ ...rest, upZ: 1 }), false, 'upright');
  assert.equal(wantsEasyTurtle({ ...rest, clearanceM: 1 }), false, 'in the air');
  assert.equal(wantsEasyTurtle({ ...rest, speed: 2 }), false, 'still sliding');
  assert.equal(wantsEasyTurtle({ ...rest, omega: 9 }), false, 'still tumbling');
  assert.equal(wantsEasyTurtle({ ...rest, threeD: true }), false, '3D has no turtle');
});

test('acro is the first-visit flight mode; a saved one wins', () => {
  const store = memStore();
  assert.equal(defaultFlightMode(store), 'acro');
  saveFlightMode('angle', store);
  assert.equal(defaultFlightMode(store), 'angle');
});

// A TX16S's HID report; axes 4..7 are AUX1..AUX4.
const pad = (axes, buttons) => ({ axes, buttons: (buttons || []).map((b) => ({ pressed: !!b, value: b ? 1 : 0 })) });
const REST = [0, 0, -1, 0, 1, -1, 1, -1];
const withAxis = (axes, i, v) => axes.map((a, k) => (k === i ? v : a));
function settle(w, gp, map = AETR_MAP) {
  let out = null;
  for (let t = 0; t < 0.3; t += DT) out = stepSwitchWizard(w, gp, map, DT);
  return out;
}

test('the wizard: channel and direction of each switch, turtle and angle skippable, arm not', () => {
  assert.deepEqual(SWITCH_WIZARD_STEPS.map((s) => [s.key, s.skippable]), [['arm', false], ['turtle', true], ['angle', true]]);
  assert.match(SWITCH_WIZARD_STEPS[0].label, /FLIP YOUR ARM SWITCH/);
  const w = createSwitchWizard(pad(REST));
  settle(w, pad(REST));
  assert.equal(w.step, 0, 'nothing moved: AUX1 and AUX3 resting high are not flips');
  skipSwitchWizard(w, pad(REST));
  assert.equal(w.step, 0, 'the arm cannot be skipped');
  // ARM on AUX4, low to high.
  let axes = withAxis(REST, 7, 1);
  settle(w, pad(axes));
  assert.equal(w.step, 1, 'found');
  assert.deepEqual(w.picks.arm, { i: 7, sign: 1 });
  // The turtle on AUX1, which rests high: flipped low, so its direction is -1.
  axes = withAxis(axes, 4, -1);
  settle(w, pad(axes));
  assert.deepEqual(w.picks.turtle, { i: 4, sign: -1 }, 'direction: the end it was flipped to');
  const out = skipSwitchWizard(w, pad(axes));
  assert.equal(out.done, true, 'angle skipped');
  assert.deepEqual(switchWizardResult(w), { on: true, migrated: false, arm: { i: 7, sign: 1 }, turtle: { i: 4, sign: -1 }, angle: null });
});

test('the wizard: sticks are never a switch, no switch twice, a slow switch and a 3-position switch', () => {
  const w = createSwitchWizard(pad(REST));
  settle(w, pad(withAxis(withAxis(REST, 2, 1), 0, 1)));
  assert.equal(w.step, 0, 'throttle and roll are not switches');
  // A slowed switch (an EdgeTX mixer delay) crosses in small steps.
  for (let v = -1; v <= 1; v += 0.01) stepSwitchWizard(w, pad(withAxis(REST, 7, v)), AETR_MAP, DT);
  const up = withAxis(REST, 7, 1);
  settle(w, pad(up));
  assert.deepEqual(w.picks.arm, { i: 7, sign: 1 }, 'a slow flip is still found');
  settle(w, pad(withAxis(up, 7, -1)));
  assert.equal(w.step, 1, 'the arm switch flipped back is not the turtle switch');
  // A 3-position switch from low: the middle is not "flipped".
  const low = withAxis(up, 7, -1);
  const w2 = createSwitchWizard(pad(low));
  settle(w2, pad(withAxis(low, 5, 0)));
  assert.equal(w2.step, 0, 'in the middle: wait');
  settle(w2, pad(withAxis(low, 5, 1)));
  assert.deepEqual(w2.picks.arm, { i: 5, sign: 1 });
  // A switch reported as a button.
  const w3 = createSwitchWizard(pad(REST, [0, 0, 0]));
  settle(w3, pad(REST, [0, 0, 1]));
  assert.deepEqual(w3.picks.arm, { button: 2, sign: 1 });
});

test('saved per radio: a radio seen for the first time is off, and stays off once its preset is saved', () => {
  const store = memStore();
  assert.deepEqual(loadRadioSwitches(TX, store), { on: false, migrated: false, arm: null, turtle: null, angle: null });
  store.setItem(RADIO_PRESET_PREFIX + SID, 'radiomaster'); // what selectPad then saves
  assert.equal(loadRadioSwitches(TX, store).on, false, 'still off: this is not a radio from before Easy mode');
  saveRadioSwitches(TX, { on: true, arm: { i: 7, sign: 1 } }, store);
  assert.equal(loadRadioSwitches(TX, store).on, true);
  assert.deepEqual(loadRadioSwitches(TX, store).arm, { i: 7, sign: 1 });
  assert.equal(loadRadioSwitches(ZORRO, store).on, false, 'each radio its own');
  assert.equal(loadRadioSwitches(TX, store).on, true);
});

// The shapes main saved for a radio. On the bf core main passed AUX straight
// through (radioAux), so a pilot's AUX1 arm and AUX3 turtle are stored nowhere
// as such: what localStorage holds is the radio's preset, its calibration
// (ryflyAxisMap_<id>: the sticks plus arm and mode, written by the wizard's
// ARM and MODE steps or the Tune arm picker) and its arm switch
// (quadmathSimArm_<id>).
const CAL_MAP = { r: { i: 0, sign: 1 }, p: { i: 1, sign: 1 }, y: { i: 3, sign: 1 }, t: { i: 2, min: -1, max: 1 }, arm: { i: 4, sign: 1 }, mode: { i: 5, sign: 1 }, ver: 2 };
const SAVED = {
  'preset only (every radio that ever connected)': { [RADIO_PRESET_PREFIX + SID]: 'radiomaster' },
  'preset and arm switch': { [RADIO_PRESET_PREFIX + SID]: 'radiomaster', [ARM_SWITCH_PREFIX + SID]: JSON.stringify({ i: 4, sign: 1 }) },
  'calibrated, arm and mode saved': { [RADIO_PRESET_PREFIX + SID]: 'custom', [AXIS_MAP_PREFIX + SID]: JSON.stringify(CAL_MAP), [ARM_SWITCH_PREFIX + SID]: JSON.stringify({ i: 4, sign: 1 }) },
};

test('migration: a radio saved before Easy mode goes to switches-on, once', () => {
  for (const [name, init] of Object.entries(SAVED)) {
    const store = memStore({ [GP_ID_KEY]: TX, ...init });
    const rec = loadRadioSwitches(TX, store);
    assert.deepEqual(rec, { on: true, migrated: true, arm: null, turtle: null, angle: null }, name);
    assert.ok(store.getItem(SWITCHES_PREFIX + SID), `${name}: written`);
    saveRadioSwitches(TX, { ...rec, on: false }, store);
    assert.equal(loadRadioSwitches(TX, store).on, false, `${name}: switched off stays off, never migrated again`);
  }
  assert.equal(loadRadioSwitches(TX, memStore({ [GP_ID_KEY]: ZORRO })).on, false, "another radio's id is not this radio's setup");
});

test('the stick map: Easy mode has no arm or mode switch, even from a calibration; switches on keep them', () => {
  const off = switchesAxisMap(CAL_MAP, { i: 6, sign: 1 }, { on: false });
  assert.equal(hasArmSwitch(off), false);
  assert.equal(off.mode, undefined);
  assert.equal(off.t.i, 2, 'sticks kept');
  assert.equal(CAL_MAP.arm.i, 4, 'the saved map is not touched');
  assert.equal(switchesAxisMap(CAL_MAP, null, { on: true, migrated: true }), CAL_MAP, 'migrated: as it was');
  assert.deepEqual(switchesAxisMap(AETR_MAP, { i: 6, sign: 1 }, { on: true, migrated: true }).arm, { i: 6, sign: 1 }, 'its Tune arm switch');
  assert.deepEqual(switchesAxisMap(CAL_MAP, null, { on: true, arm: { i: 7, sign: -1 } }).arm, { i: 7, sign: -1 }, 'a wizard switch wins');
  assert.equal(auxNumberOfAxis(AETR_MAP, 7), 4, 'axis 7 is AUX4');
  assert.equal(auxNumberOfAxis(AETR_MAP, 2), null, 'a stick');
});

test('switchAux: ARM on AUX4 reaches ARM on AUX1; the owner\'s layout passes through value for value', () => {
  const ranges = auxRanges(DIFF);
  const sw = { on: true, migrated: false, arm: { i: 7, sign: 1 }, turtle: { i: 5, sign: 1 }, angle: null };
  // AUX1 rests high on this radio. ARM off: Betaflight's AUX1 low, whatever AUX1 does.
  let aux = switchAux(pad(REST), AETR_MAP, sw, ranges, { mode: 'acro' });
  assert.equal(aux[0], 1000, 'ARM off');
  assert.equal(aux[2], 1000, 'FLIP off');
  assert.equal(aux[1], 1000, 'acro: ANGLE off');
  aux = switchAux(pad(withAxis(REST, 7, 1)), AETR_MAP, sw, ranges, { mode: 'acro' });
  assert.equal(aux[0], 2000, 'AUX4 high: ARM on');
  aux = switchAux(pad(withAxis(REST, 5, 1)), AETR_MAP, sw, ranges, { mode: 'angle' });
  assert.equal(aux[2], 2000, 'its turtle switch: FLIP on');
  assert.equal(aux[1], 2000, 'a skipped angle: the page\'s mode');
  const rev = { ...sw, arm: { i: 7, sign: -1 } };
  assert.equal(switchAux(pad(REST), AETR_MAP, rev, ranges, {})[0], 2000, 'direction: armed at the low end');
  assert.equal(switchAux(pad(withAxis(REST, 7, 1)), AETR_MAP, rev, ranges, {})[0], 1000);
  // The owner's radio, migrated (no picks): exactly radioAux, half-way values included.
  const owner = [0, 0, -1, 0, 0.42, 1, -0.3, 1];
  assert.deepEqual(switchAux(pad(owner), AETR_MAP, { on: true, migrated: true }, ranges, {}), radioAux(pad(owner), AETR_MAP));
  // Migrated with a Tune arm pick on AUX1: still verbatim.
  assert.deepEqual(switchAux(pad(owner), AETR_MAP, { on: true, migrated: true, arm: { i: 4, sign: 1 } }, ranges, {}), radioAux(pad(owner), AETR_MAP));
  // A radio with its switches as buttons: no AUX axes at all.
  const buttons = pad([0, 0, -1, 0], [1, 0]);
  const b = switchAux(buttons, AETR_MAP, { on: true, arm: { button: 0, sign: 1 } }, ranges, {});
  assert.equal(b[0], 2000);
  assert.equal(b.length, 12);
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
// Chrome reports it. window.__pads holds its id, axes and buttons (kept in
// sessionStorage, so a reload keeps them); seeded by window.__seed, the
// launch arguments of a pass. A TX16S: roll, pitch, throttle, yaw, AUX1..AUX4.
const FAKE_PADS = String.raw`(() => {
  const KEY = '__fakePads';
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { /* none */ }
  const pads = window.__pads = saved || { on: false, id: '', mapping: '', axes: [], buttons: 0 };
  const make = () => ({ id: pads.id, index: 0, mapping: pads.mapping, connected: true, timestamp: performance.now(), axes: pads.axes.slice(),
    buttons: Array.from({ length: 24 }, (_, i) => { const on = !!((pads.buttons >> i) & 1); return { pressed: on, touched: on, value: on ? 1 : 0 }; }) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value() {
      try { sessionStorage.setItem(KEY, JSON.stringify(pads)); } catch (e) { /* ignore */ }
      return [pads.on ? make() : null, null, null, null];
    },
  });
})()`;

// In the page: the sticks, the state, waiting on it, the quad put upside down.
const PAGE = String.raw`(() => {
  const s = window._sim;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(8); }
    return !!fn();
  };
  const axis = (i, v) => { window.__pads.axes[i] = v; };
  const thr = (t) => axis(2, t * 2 - 1);
  const upZ = () => { const q = s.coreState().quaternion; return 1 - 2 * (q.x * q.x + q.y * q.y); };
  const speed = () => { const v = s.coreState().velocity; return Math.hypot(v.x, v.y, v.z); };
  const landed = () => s.coreState().clearance <= 0.04 && speed() < 0.5;
  const fc = () => s.bfCore().sim.fc;
  function menus() {
    const on = (id, c) => { const el = document.getElementById(id); return !!(el && el.classList.contains(c)); };
    return { start: on('startMenu', 'open'), looks: !!(s.looks && s.looks.menuOpen), layer: on('menuLayer', 'show'), prompt: on('feelPrompt', 'show'), picker: !!document.getElementById('gpPicker') };
  }
  function state() {
    const c = s.coreState(), e = s.easy();
    const out = { kind: c.kind, armed: c.armed, z: c.position.z, clearance: c.clearance, upZ: upZ(), speed: speed(), mode: c.flightMode, flags: c.armingDisableFlags,
      easy: e.mode, flight: e.flightMode, switches: e.switches, wizard: e.wizard, jsTurtle: !!e.jsTurtle, map: s.map(), menus: menus(),
      radio: document.getElementById('radioInfo').textContent };
    if (c.kind === 'bf') {
      const f = fc(), b = s.bfCore();
      out.rc = Array.from(f.rcData).slice(4, 8).map(Math.round);
      out.crashFlip = !!f.crashFlip;
      out.source = b.auxSource;
      out.phase = b.turtlePhase;
      out.auxTurtle = b.aux.turtle;
    }
    return out;
  }
  // On its back at rest where it stands: a pose only, no fall to speak of.
  async function flip() {
    const c = s.coreState(), z = c.position.z;
    const q = { x: 1, y: 0, z: 0, w: 0 };
    if (c.kind === 'bf') s.bfCore().teleport({ x: c.position.x, y: c.position.y, z: z + 0.03 }, q);
    else { window._qp.quaternion = q; window._qp.omega.x = window._qp.omega.y = window._qp.omega.z = 0; }
    await wait(150);
    return until(() => upZ() < -0.9 && s.coreState().clearance <= 0.04 && speed() < 0.3, 4000);
  }
  // A fall onto the floor at speed: a crash (the Rig's walls are foam: about
  // 20 m/s on the bf core).
  function drop() {
    const c = s.coreState();
    const q = { x: 0, y: 0, z: 0, w: 1 };
    if (c.kind === 'bf') s.bfCore().teleport({ x: c.position.x, y: c.position.y, z: 2.5 }, q, { x: 0, y: 0, z: -25 });
    else { window._qp.position.z = 2.5; window._qp.velocity.z = -40; }
  }
  window.__easy = { s, wait, until, axis, thr, upZ, speed, landed, fc, menus, state, flip, drop };
  return true;
})()`;

const LAYOUT = [0, 0, 0, 0, 1, -1, 1, -1];   // throttle left mid-stick, AUX1 and AUX3 resting high, ARM on AUX4

test('Easy mode in Chrome', { timeout: 10 * 60 * 1000 }, async (t) => {
  if (process.env.SKIP_CHROME_BOOT === '1') {
    t.skip('SKIP_CHROME_BOOT');
    return;
  }
  const { server, port } = await serveRoot();
  const debugPort = 9300 + (process.pid % 300);

  // A pass: a fresh Chrome profile, the given pad and localStorage, the page.
  async function pass(query, seed, flow) {
    const profile = mkdtempSync(join(tmpdir(), 'qm-easy-'));
    const child = spawn(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=480,270',
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
      const url = `http://127.0.0.1:${port}/sim.html?quality=low${query ? '&' + query : ''}`;
      // Same origin first, for localStorage and sessionStorage before the page's scripts.
      await cdp(ws, 'Page.navigate', { url: `http://127.0.0.1:${port}/robots.txt` });
      await sleep(250);
      await evaluate(ws, `(() => {
        localStorage.clear();
        const seed = ${JSON.stringify(seed.storage || {})};
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('__fakePads', JSON.stringify(${JSON.stringify(seed.pad || { on: false, id: '', mapping: '', axes: [], buttons: 0 })}));
        return true;
      })()`);
      await cdp(ws, 'Page.navigate', { url });
      const boot = async (core = seed.core || 'bf') => {
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
          await sleep(250);
          try {
            ready = await evaluate(ws, `!!(window._sim && window._sim.core && window._sim.core() === ${JSON.stringify(core)} && window._simQueryBooted && window._sim.easy && window._sim.looks && window._sim.looks.fps && window._sim.looks.fps.ready)`);
          } catch (e) { /* the page is still loading */ }
        }
        assert.ok(ready, `the ${core} core flies`);
        await evaluate(ws, PAGE);
      };
      await boot();
      const js = async (body) => JSON.parse(await evaluate(ws, `(async () => { const E = window.__easy; ${body} })()`));
      await flow({
        js,
        reload: async () => { await cdp(ws, 'Page.reload', {}); await boot(); },
        key: async (type, key, code, vk) => cdp(ws, 'Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk }),
      });
    } finally {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      killTree(child);
      await Promise.race([new Promise((res) => child.once('exit', res)), sleep(3000)]);
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); }
      }
    }
  }

  const tx = (axes = LAYOUT) => ({ on: true, id: TX, mapping: '', axes: axes.slice(), buttons: 0 });
  const KEY_TX = SWITCHES_PREFIX + SID;

  try {
    await t.test('a fresh profile, a TX16S with ARM on AUX4: flying in the Rig with no menu, arm by throttle, disarm, crash, turtle', async () => {
      await pass('', { pad: tx() }, async ({ js }) => {
        let r = await js(`return JSON.stringify(E.state());`);
        console.log('fresh: ' + JSON.stringify({ ...r, radio: undefined }));
        assert.deepEqual(r.menus, { start: false, looks: false, layer: false, prompt: false, picker: false }, 'no menu in the way');
        assert.equal(r.map, 'rig', 'in the Rig');
        assert.equal(r.kind, 'bf', 'on the bf core');
        assert.match(r.radio, /TX16S/, r.radio);
        assert.equal(r.easy, true, 'Easy mode');
        assert.equal(r.switches.on, false, 'radio switches off');
        assert.equal(r.flight, 'acro', 'acro');
        assert.equal(r.mode, 'acro', 'Betaflight in acro');
        assert.equal(r.source, 'page', 'the page drives AUX');
        assert.equal(r.armed, false);
        assert.deepEqual(r.rc.slice(0, 3), [1000, 1000, 1000], 'AUX1 and AUX3 are high on the radio; Betaflight sees the page\'s (low)');

        // Back to the launch screen: Fly goes straight to the Rig, no map menu.
        r = await js(`
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          await E.wait(100);
          document.getElementById('menuHome').click();
          await E.wait(100);
          document.getElementById('menuFly').click();
          await E.wait(400);
          return JSON.stringify({ st: E.state() });`);
        assert.deepEqual(r.st.menus, { start: false, looks: false, layer: false, prompt: false, picker: false }, 'Fly, no map menu');
        assert.equal(r.st.map, 'rig', 'and the Rig');

        // Throttle left up at load, then a short hold: nothing arms.
        r = await js(`
          await E.wait(1200);
          const up = E.state().armed;
          E.thr(0);
          await E.wait(350);
          E.thr(0.6);
          await E.wait(700);
          return JSON.stringify({ up, short: E.state().armed });`);
        assert.deepEqual(r, { up: false, short: false }, 'mid-stick at load does not arm; 0.35 s at the bottom does not');

        // Down for over a second, then up: armed and flying.
        r = await js(`
          E.thr(0);
          await E.wait(1300);
          const before = E.state();
          E.thr(0.6);
          const t0 = performance.now();
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          const armMs = performance.now() - t0;
          await E.wait(900);
          return JSON.stringify({ before, armed, armMs, after: E.state() });`);
        console.log('arm: ' + JSON.stringify({ armMs: r.armMs, z: r.after.z, flags: r.after.flags }));
        assert.equal(r.before.armed, false);
        assert.equal(r.armed, true, `armed by throttle (flags ${r.after.flags})`);
        assert.ok(r.after.z > 0.5, `flies (z ${r.after.z.toFixed(2)} m)`);
        assert.equal(r.after.rc[0], 2000, 'the page has ARM on, on the diff\'s AUX1');

        // Throttle to the bottom in the air: armed all the way down; then the 2 s.
        r = await js(`
          E.thr(0);
          let armedInAir = true;
          const down = await E.until(() => { if (!E.landed()) armedInAir = armedInAir && E.s.coreState().armed; return E.landed(); }, 8000);
          const t0 = performance.now();
          let earliest = null;
          const off = await E.until(() => { if (!E.s.coreState().armed && earliest === null) earliest = performance.now() - t0; return earliest !== null; }, 6000);
          return JSON.stringify({ down, armedInAir, off, ms: earliest });`);
        console.log('disarm: ' + JSON.stringify(r));
        assert.equal(r.down, true, 'it landed');
        assert.equal(r.armedInAir, true, 'armed in the air at zero throttle');
        assert.equal(r.off, true, 'disarmed landed');
        assert.ok(r.ms >= 1800 && r.ms < 4500, `about 2 s after landing (${Math.round(r.ms)} ms)`);

        // A crash: a throttle at 20 % never reaches the bottom; it disarms at rest.
        r = await js(`
          E.thr(0);
          await E.wait(1300);
          E.thr(0.2);
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          await E.wait(200);
          E.drop();
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          return JSON.stringify({ armed, off, st: E.state(), reason: E.s.easy().disarmReason });`);
        console.log('crash: ' + JSON.stringify({ armed: r.armed, off: r.off, thr: 0.2, upZ: r.st.upZ }));
        assert.equal(r.armed, true);
        assert.equal(r.off, true, 'disarmed after the crash, throttle still at 20 %');
        assert.equal(r.reason, 'crash', 'as a crash');

        // Turtle by roll: upside down at rest, disarmed. Full stick.
        for (const [name, stick, val] of [['full right roll', 0, 1], ['full back pitch', 1, -1]]) {
          r = await js(`
            E.thr(0);
            const rest = await E.flip();
            await E.wait(400);
            const before = E.state();
            E.axis(${stick}, ${val});
            const started = await E.until(() => E.s.bfCore().turtlePhase !== null, 2000);
            let crashFlip = false, flipRc = 0;
            const upright = await E.until(() => {
              const f = E.fc();
              if (f.crashFlip) { crashFlip = true; flipRc = Math.max(flipRc, Math.round(f.rcData[6])); }
              return E.s.bfCore().turtlePhase === null && E.upZ() > 0.9;
            }, 5000);
            await E.wait(500);
            const heldUp = E.state();
            E.axis(${stick}, 0);
            await E.wait(800);
            return JSON.stringify({ rest, before, started, crashFlip, flipRc, upright, heldUp, after: E.state() });`);
          console.log(`turtle (${name}): ` + JSON.stringify({ before: r.before.upZ, started: r.started, crashFlip: r.crashFlip, flipRc: r.flipRc, upright: r.upright, upZ: r.after.upZ, armed: r.after.armed }));
          assert.equal(r.rest, true, `${name}: upside down at rest`);
          assert.ok(r.before.upZ < -0.9, `${name}: on its back`);
          assert.equal(r.before.armed, false, `${name}: disarmed upside down`);
          assert.equal(r.before.rc[2], 1000, `${name}: the turtle channel off, though the radio's AUX3 is high`);
          assert.equal(r.started, true, `${name}: the stick starts the turtle`);
          assert.equal(r.crashFlip, true, `${name}: Betaflight in crash flip`);
          assert.ok(r.flipRc >= 1700, `${name}: the page drives the turtle channel (${r.flipRc})`);
          assert.equal(r.upright, true, `${name}: upright`);
          assert.ok(r.heldUp.upZ > 0.9, `${name}: stays up, stick still held (${r.heldUp.upZ.toFixed(2)})`);
          assert.equal(r.after.auxTurtle, false, `${name}: released`);
          assert.equal(r.after.rc[2], 1000, `${name}: turtle channel low again`);
          assert.equal(r.after.armed, false, `${name}: not armed by the turtle`);
          assert.ok(r.after.upZ > 0.9, `${name}: still upright (${r.after.upZ.toFixed(2)})`);
        }

        // And flies again: throttle down 1 s, up.
        r = await js(`
          E.thr(0);
          await E.wait(1300);
          E.thr(0.6);
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          await E.wait(900);
          const st = E.state();
          E.thr(0);
          return JSON.stringify({ armed, st });`);
        assert.equal(r.armed, true, `armed after the turtles (flags ${r.st.flags})`);
        assert.ok(r.st.z > 0.4, `flies after the turtles (z ${r.st.z.toFixed(2)})`);
      });
    });

    await t.test('the wizard on the TX16S: channel and direction, skip, saved per radio, flown on the switches', async () => {
      await pass('', { pad: tx([0, 0, -1, 0, 1, -1, 1, -1]) }, async ({ js, reload }) => {
        let r = await js(`
          await E.until(() => document.querySelector('#panel .cb-radio-switches'), 1000);
          const cb = document.querySelector('#panel .cb-radio-switches');
          const was = cb.checked;
          cb.click();
          await E.wait(150);
          const calib = document.getElementById('calib');
          return JSON.stringify({ was, open: calib.classList.contains('show'), step: document.getElementById('calibStep').textContent, skip: document.getElementById('calibSkip').style.display, wiz: E.state().wizard });`);
        console.log('wizard open: ' + JSON.stringify(r));
        assert.equal(r.was, false, 'off by default');
        assert.equal(r.open, true, 'the wizard opens');
        assert.match(r.step, /FLIP YOUR ARM SWITCH/);
        assert.equal(r.skip, 'none', 'the arm has no skip');
        r = await js(`
          E.axis(7, 1);
          await E.until(() => E.state().wizard && E.state().wizard.step === 1, 2000);
          await E.wait(100);
          const step = document.getElementById('calibStep').textContent, skip = document.getElementById('calibSkip').style.display;
          E.axis(4, -1);
          await E.until(() => E.state().wizard && E.state().wizard.step === 2, 2000);
          await E.wait(100);
          const step2 = document.getElementById('calibStep').textContent;
          document.getElementById('calibSkip').click();
          await E.wait(150);
          return JSON.stringify({ step, skip, step2, st: E.state(), saved: JSON.parse(localStorage.getItem(${JSON.stringify(KEY_TX)})), calib: document.getElementById('calib').classList.contains('show') });`);
        console.log('wizard done: ' + JSON.stringify({ ...r, st: r.st.switches }));
        assert.match(r.step, /FLIP YOUR TURTLE SWITCH/);
        assert.equal(r.skip, '', 'the turtle has a skip');
        assert.match(r.step2, /FLIP YOUR ANGLE SWITCH/);
        assert.equal(r.calib, false, 'done');
        assert.deepEqual(r.saved, { on: true, migrated: false, arm: { i: 7, sign: 1 }, turtle: { i: 4, sign: -1 }, angle: null }, 'saved: channels and directions');
        assert.equal(r.st.easy, false, 'off Easy mode');

        // Flying it: ARM on AUX4, onto the diff's AUX1. AUX1 (the turtle now) is low = on.
        r = await js(`
          E.axis(7, -1);
          E.axis(4, 1);
          await E.wait(1300);
          const off = E.state();
          E.thr(0.6);
          await E.wait(500);
          const thrUp = E.state();
          E.thr(0);
          await E.wait(800);
          E.axis(7, 1);
          const armed = await E.until(() => E.s.coreState().armed, 2500);
          await E.wait(100);
          const on = E.state();
          E.axis(7, -1);
          await E.wait(600);
          return JSON.stringify({ off, thrUp, armed, on, after: E.state() });`);
        console.log('flown: ' + JSON.stringify({ off: r.off.rc, on: r.on.rc, armed: r.armed, flags: r.on.flags }));
        assert.equal(r.off.source, 'radio', 'the radio drives AUX');
        assert.equal(r.off.rc[0], 1000, 'ARM channel low, though the radio\'s AUX1 is high');
        assert.equal(r.thrUp.armed, false, 'the throttle does not arm');
        assert.equal(r.armed, true, `arms on AUX4 (flags ${r.on.flags})`);
        assert.equal(r.on.rc[0], 2000, 'ARM reaches the diff\'s AUX1');
        assert.equal(r.after.armed, false, 'AUX4 low disarms');

        // A skipped angle stays the Controls toggle; the turtle switch is on the diff's AUX3.
        r = await js(`
          E.axis(4, -1);
          await E.wait(100);
          const turtleOn = E.state().rc[2];
          E.axis(4, 1);
          const cb = document.querySelector('#panel .cb-angle-mode');
          cb.click();
          await E.wait(250);
          const st = E.state();
          cb.click();
          await E.wait(150);
          return JSON.stringify({ turtleOn, disabled: cb.disabled, st, back: E.state().mode });`);
        assert.equal(r.turtleOn, 2000, 'the turtle switch reaches FLIP on the diff\'s AUX3');
        assert.equal(r.disabled, false, 'the angle toggle is live');
        assert.equal(r.st.mode, 'angle', 'angle on from Controls');
        assert.equal(r.st.rc[1], 2000, 'on the diff\'s ANGLE channel');
        assert.equal(r.back, 'acro', 'off again');

        await reload();
        r = await js(`await E.wait(800); return JSON.stringify(E.state());`);
        assert.equal(r.easy, false, 'after a reload: still on the switches');
        assert.deepEqual(r.switches.arm, { i: 7, sign: 1 });
        assert.equal(r.source, 'radio');

        // Another radio: its own record, Easy mode. Back to the first: on.
        r = await js(`
          window.__pads.id = ${JSON.stringify(ZORRO)};
          window.dispatchEvent(new Event('gamepaddisconnected'));
          window.dispatchEvent(new Event('gamepadconnected'));
          await E.wait(600);
          const other = E.state();
          window.__pads.id = ${JSON.stringify(TX)};
          window.dispatchEvent(new Event('gamepaddisconnected'));
          window.dispatchEvent(new Event('gamepadconnected'));
          await E.wait(600);
          return JSON.stringify({ other, back: E.state() });`);
        assert.match(r.other.radio, /Zorro/);
        assert.equal(r.other.easy, true, 'a second radio starts in Easy mode');
        assert.equal(r.back.easy, false, 'the first keeps its switches');

        // Toggle off: Easy mode, and arms by throttle.
        r = await js(`
          document.querySelector('#panel .cb-radio-switches').click();
          await E.wait(200);
          E.axis(7, -1);
          E.thr(0);
          await E.wait(1300);
          const st = E.state();
          E.thr(0.5);
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          E.thr(0);
          return JSON.stringify({ st, armed, saved: JSON.parse(localStorage.getItem(${JSON.stringify(KEY_TX)})) });`);
        assert.equal(r.st.easy, true);
        assert.equal(r.saved.on, false);
        assert.deepEqual(r.saved.arm, { i: 7, sign: 1 }, 'its picks kept');
        assert.equal(r.armed, true, 'arms by throttle again');

        // The wizard again, turtle and angle skipped: the stick still turtles.
        r = await js(`
          E.thr(0);
          await E.until(() => E.landed() && !E.s.coreState().armed, 6000);
          document.querySelector('#panel .cb-radio-switches').click();
          await E.wait(150);
          E.axis(7, 1);
          await E.until(() => E.state().wizard && E.state().wizard.step === 1, 2000);
          document.getElementById('calibSkip').click();
          await E.wait(100);
          document.getElementById('calibSkip').click();
          await E.wait(150);
          E.axis(7, -1);
          await E.wait(500);
          const set = E.state();
          const rest = await E.flip();
          await E.wait(300);
          E.axis(0, 1);
          const started = await E.until(() => E.s.bfCore().turtlePhase !== null, 2000);
          let flipRc = 0;
          const upright = await E.until(() => { flipRc = Math.max(flipRc, Math.round(E.fc().rcData[6])); return E.s.bfCore().turtlePhase === null && E.upZ() > 0.9; }, 5000);
          E.axis(0, 0);
          await E.wait(600);
          return JSON.stringify({ set, rest, started, flipRc, upright, after: E.state() });`);
        console.log('skipped: ' + JSON.stringify({ sw: r.set.switches, started: r.started, flipRc: r.flipRc, upright: r.upright, source: r.after.source }));
        assert.equal(r.set.source, 'radio', 'on the radio');
        assert.deepEqual([r.set.switches.turtle, r.set.switches.angle], [null, null], 'both skipped');
        assert.equal(r.rest, true);
        assert.equal(r.started, true, 'a skipped turtle stays on the stick');
        assert.ok(r.flipRc >= 1700, `the page drives FLIP for the turtle (${r.flipRc})`);
        assert.equal(r.upright, true, 'upright');
        assert.equal(r.after.source, 'radio', 'AUX back on the radio afterwards');
      });
    });

    await t.test('a radio that wakes after Fly was pressed: the map menu closes and it flies the Rig', async () => {
      await pass('', {}, async ({ js }) => {
        let r = await js(`
          document.getElementById('menuFly').click();
          await E.wait(200);
          const before = E.menus();
          Object.assign(window.__pads, { on: true, id: ${JSON.stringify(TX)}, mapping: '', axes: [0, 0, -1, 0, -1, -1, -1, -1], buttons: 0 });
          window.dispatchEvent(new Event('gamepadconnected'));
          await E.wait(500);
          return JSON.stringify({ before, st: E.state() });`);
        assert.equal(r.before.layer, true, 'no radio seen yet: the map menu');
        assert.deepEqual(r.st.menus, { start: false, looks: false, layer: false, prompt: false, picker: false }, 'closed by the radio');
        assert.equal(r.st.map, 'rig');
        assert.match(r.st.radio, /TX16S/);
      });
    });

    await t.test('a profile saved before Easy mode (AUX1 arm, AUX3 turtle): switches on, nothing changes', async () => {
      const saved = {
        [GP_ID_KEY]: TX,
        [RADIO_PRESET_PREFIX + SID]: 'custom',
        [AXIS_MAP_PREFIX + SID]: JSON.stringify(CAL_MAP),
        [ARM_SWITCH_PREFIX + SID]: JSON.stringify({ i: 4, sign: 1 }),
        quadmathSimInputChoice: 'radio',
      };
      await pass('', { storage: saved, pad: tx([0, 0, -1, 0, -1, -1, -1, -1]) }, async ({ js, reload }) => {
        let r = await js(`await E.wait(800); return JSON.stringify(E.state());`);
        console.log('migrated: ' + JSON.stringify(r.switches) + ' ' + r.rc);
        assert.deepEqual(r.switches, { on: true, migrated: true, arm: null, turtle: null, angle: null }, 'switches on');
        assert.equal(r.easy, false);
        assert.equal(r.source, 'radio', 'AUX pass through');
        // A half-way value too: it goes through as sent.
        r = await js(`
          E.axis(5, 0.5);
          await E.wait(120);
          const half = E.state().rc[1];
          E.axis(5, -1);
          E.thr(0);
          await E.wait(1300);
          E.thr(0.5);
          await E.wait(500);
          const thrUp = E.state();
          E.thr(0);
          await E.wait(800);
          E.axis(4, 1);
          const armed = await E.until(() => E.s.coreState().armed, 2500);
          await E.wait(100);
          const on = E.state();
          E.axis(4, -1);
          await E.wait(500);
          return JSON.stringify({ half, thrUp, armed, on, off: E.state() });`);
        assert.equal(r.half, 1750, 'AUX2 at 0.5 stays 1750');
        assert.equal(r.thrUp.armed, false, 'the throttle does not arm');
        assert.equal(r.armed, true, `armed on AUX1 (flags ${r.on.flags})`);
        assert.equal(r.on.rc[0], 2000, 'AUX1 high reaches Betaflight');
        assert.equal(r.off.armed, false, 'AUX1 low disarms');
        r = await js(`
          E.axis(6, 1);
          await E.wait(120);
          const aux3 = E.state().rc[2];
          E.axis(6, -1);
          return JSON.stringify({ aux3 });`);
        assert.equal(r.aux3, 2000, 'AUX3 reaches Betaflight, the owner\'s turtle switch');

        await reload();
        r = await js(`await E.wait(600); return JSON.stringify(E.state());`);
        assert.equal(r.switches.migrated, true, 'still migrated');
        assert.equal(r.source, 'radio');
        r = await js(`
          document.querySelector('#panel .cb-radio-switches').click();
          await E.wait(200);
          return JSON.stringify(E.state());`);
        assert.equal(r.easy, true, 'switched off');
        await reload();
        r = await js(`await E.wait(600); return JSON.stringify(E.state());`);
        assert.equal(r.easy, true, 'stays off: not migrated twice');
      });
    });

    await t.test('the radio on ?core=js: arms by throttle, disarms, turtles by stick', async () => {
      await pass('core=js', { core: 'js', pad: tx() }, async ({ js }) => {
        let r = await js(`await E.wait(600); return JSON.stringify(E.state());`);
        assert.equal(r.kind, 'js');
        assert.equal(r.easy, true);
        assert.equal(r.mode, 'acro', 'acro on the js core');
        assert.deepEqual(r.menus, { start: false, looks: false, layer: false, prompt: false, picker: false });
        r = await js(`
          E.thr(0);
          await E.wait(350);
          E.thr(0.7);
          await E.wait(300);
          const short = E.state().armed;
          E.thr(0);
          await E.wait(1300);
          E.thr(0.62);
          const armed = await E.until(() => E.s.coreState().armed, 1000);
          await E.wait(700);
          const up = E.state();
          E.thr(0);
          const down = await E.until(E.landed, 8000);
          const t0 = performance.now();
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          return JSON.stringify({ short, armed, up: up.z, down, off, ms: performance.now() - t0, reason: E.s.easy().disarmReason });`);
        console.log('js radio: ' + JSON.stringify(r));
        assert.equal(r.short, false, 'a short hold does not arm');
        assert.equal(r.armed, true, 'armed by throttle');
        assert.ok(r.up > 0.3, `flies (z ${r.up})`);
        assert.equal(r.off, true, 'disarmed landed');
        assert.equal(r.reason, 'landed', 'on the 2 s rule, not as a crash');
        assert.ok(r.ms >= 1800 && r.ms < 4500, `about 2 s (${Math.round(r.ms)} ms)`);
        for (const [name, stick, val] of [['roll', 0, -1], ['pitch', 1, 1]]) {
          r = await js(`
            E.thr(0);
            const rest = await E.flip();
            await E.wait(300);
            E.axis(${stick}, ${val});
            const started = await E.until(() => E.state().jsTurtle, 1500);
            const upright = await E.until(() => !E.state().jsTurtle && E.upZ() > 0.9, 6000);
            E.axis(${stick}, 0);
            await E.wait(900);
            return JSON.stringify({ rest, started, upright, st: E.state() });`);
          console.log(`js turtle ${name}: ` + JSON.stringify({ rest: r.rest, started: r.started, upright: r.upright, upZ: r.st.upZ, armed: r.st.armed }));
          assert.equal(r.started, true, `${name}: the stick starts it`);
          assert.equal(r.upright, true, `${name}: upright`);
          assert.equal(r.st.armed, false, `${name}: disarmed`);
          assert.ok(r.st.upZ > 0.97, `${name}: lands level (${r.st.upZ.toFixed(3)})`);
        }
      });
    });

    await t.test('the keyboard on the bf core: W arms, S and 2 s disarm, an arrow turtles', async () => {
      await pass('map=rig', {}, async ({ js, key }) => {
        await js(`window._feel.hideFirstRun(); await E.wait(1300); return JSON.stringify(1);`);
        await key('rawKeyDown', 'w', 'KeyW', 87);
        await key('keyDown', 'w', 'KeyW', 87);
        let r = await js(`const a = await E.until(() => E.s.coreState().armed, 2000); return JSON.stringify({ a, st: E.state() });`);
        await key('keyUp', 'w', 'KeyW', 87);
        console.log('kb bf: ' + JSON.stringify({ armed: r.a, flags: r.st.flags, mode: r.st.mode }));
        assert.equal(r.a, true, `W arms (flags ${r.st.flags})`);
        assert.equal(r.st.mode, 'acro');
        await key('keyDown', 's', 'KeyS', 83);
        r = await js(`await E.wait(1100); return JSON.stringify(1);`);
        r = await js(`
          const down = await E.until(E.landed, 8000);
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          return JSON.stringify({ down, off });`);
        await key('keyUp', 's', 'KeyS', 83);
        assert.deepEqual(r, { down: true, off: true }, 'S to the bottom, landed 2 s: disarmed');
        r = await js(`const rest = await E.flip(); await E.wait(200); return JSON.stringify({ rest });`);
        assert.equal(r.rest, true);
        await key('rawKeyDown', 'ArrowRight', 'ArrowRight', 39);
        await key('keyDown', 'ArrowRight', 'ArrowRight', 39);
        r = await js(`
          const started = await E.until(() => E.s.bfCore().turtlePhase !== null, 2000);
          const upright = await E.until(() => E.s.bfCore().turtlePhase === null && E.upZ() > 0.9, 5000);
          return JSON.stringify({ started, upright });`);
        await key('keyUp', 'ArrowRight', 'ArrowRight', 39);
        assert.deepEqual(r, { started: true, upright: true }, 'the arrow turtles');
      });
    });

    await t.test('the keyboard on ?core=js, a gamepad and touch: arm by throttle, turtle by stick', async () => {
      await pass('core=js&map=rig', { core: 'js' }, async ({ js, key }) => {
        await js(`window._feel.hideFirstRun(); await E.wait(1300); return JSON.stringify(1);`);
        await key('rawKeyDown', 'w', 'KeyW', 87);
        await key('keyDown', 'w', 'KeyW', 87);
        let r = await js(`return JSON.stringify(await E.until(() => E.s.coreState().armed, 2000));`);
        await key('keyUp', 'w', 'KeyW', 87);
        assert.equal(r, true, 'js keyboard: W arms');
        await key('keyDown', 's', 'KeyS', 83);
        r = await js(`await E.wait(1100); const a = await E.until(E.landed, 8000); return JSON.stringify(a && await E.until(() => !E.s.coreState().armed, 6000));`);
        await key('keyUp', 's', 'KeyS', 83);
        assert.equal(r, true, 'js keyboard: disarms');
        r = await js(`const rest = await E.flip(); await E.wait(200); return JSON.stringify(rest);`);
        assert.equal(r, true);
        await key('rawKeyDown', 'ArrowUp', 'ArrowUp', 38);
        await key('keyDown', 'ArrowUp', 'ArrowUp', 38);
        r = await js(`
          const started = await E.until(() => E.state().jsTurtle, 2000);
          const upright = await E.until(() => !E.state().jsTurtle && E.upZ() > 0.9, 6000);
          return JSON.stringify({ started, upright });`);
        await key('keyUp', 'ArrowUp', 'ArrowUp', 38);
        assert.deepEqual(r, { started: true, upright: true }, 'js keyboard: the pitch arrow turtles');
      });

      const xbox = { on: true, id: 'Xbox One Game Controller (STANDARD GAMEPAD)', mapping: 'standard', axes: [0, 0, 0, 0], buttons: 0 };
      await pass('map=rig', { pad: xbox }, async ({ js }) => {
        await js(`window._feel.hideFirstRun(); await E.wait(1300); return JSON.stringify(1);`);
        // A spring pad: left stick up is throttle (axis 1, up is -1).
        let r = await js(`
          E.axis(1, -0.7);
          const a = await E.until(() => E.s.coreState().armed, 2000);
          E.axis(1, 0);
          return JSON.stringify({ a, st: E.state() });`);
        console.log('gamepad bf: ' + JSON.stringify({ armed: r.a, source: r.st.source, flags: r.st.flags }));
        assert.equal(r.a, true, `gamepad: stick up arms (flags ${r.st.flags})`);
        assert.equal(r.st.source, 'page', 'gamepad: the page drives AUX');
        r = await js(`
          const down = await E.until(E.landed, 8000);
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          const rest = await E.flip();
          await E.wait(200);
          E.axis(2, 1);
          const started = await E.until(() => E.s.bfCore().turtlePhase !== null, 2000);
          const upright = await E.until(() => E.s.bfCore().turtlePhase === null && E.upZ() > 0.9, 5000);
          E.axis(2, 0);
          return JSON.stringify({ down, off, rest, started, upright });`);
        assert.deepEqual(r, { down: true, off: true, rest: true, started: true, upright: true }, 'gamepad: disarms, turtles');
      });

      await pass('core=js&map=rig', { core: 'js', storage: { quadmathSimInputChoice: 'touch' } }, async ({ js }) => {
        // Touch's read(), as the sticks would report it.
        let r = await js(`
          const stick = window.__touchStick = { r: 0, p: 0, y: 0, t: 0 };
          window._touch.read = () => ({ ...stick });
          window._touch.enabled = true;
          window._feel.hideFirstRun();
          await E.wait(1300);
          stick.t = 0.6;
          const a = await E.until(() => E.s.coreState().armed, 2000);
          stick.t = 0;
          return JSON.stringify(a);`);
        assert.equal(r, true, 'touch: throttle up arms');
        r = await js(`
          const stick = window.__touchStick;
          const down = await E.until(E.landed, 8000);
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          const rest = await E.flip();
          await E.wait(200);
          stick.r = 1;
          const started = await E.until(() => E.state().jsTurtle, 2000);
          const upright = await E.until(() => !E.state().jsTurtle && E.upZ() > 0.9, 6000);
          stick.r = 0;
          return JSON.stringify({ down, off, rest, started, upright });`);
        assert.deepEqual(r, { down: true, off: true, rest: true, started: true, upright: true }, 'touch: disarms, turtles');
      });
    });
  } finally {
    await new Promise((res) => server.close(res));
  }
});
