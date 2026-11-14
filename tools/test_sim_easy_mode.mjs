// Easy mode, the default for every input on every core.
//   - In node: the throttle arm and disarm (sim-3d.js stepEasyArm), the stick
//     turtle (sim-feel.js wantsEasyTurtle), the "flip your switch" wizard and
//     the per-radio save (sim-touch.js), and the switches moved
//     onto the diff's channels (sim-core-adapter.js switchAux).
//   - In headless Chrome (fresh profile each): a fake TX16S with ARM on AUX4,
//     its AUX1 and AUX3 resting high. From the page opening to flying in the
//     Rig with no menu; arms by throttle, flies, disarms on the 0.5 s rule and
//     after a crash, turtles by roll and by pitch stick (the page on
//     Betaflight's turtle channel). The wizard on that radio, saved per radio.
//     A profile saved before Easy mode starts in Easy mode like any other. And
//     the other input and core pairs: the radio on ?core=js, the keyboard on
//     both cores (Angle by default; F still flips), a gamepad, touch (Angle).
//     At rest on either side, the nose, the tail or its back, on the floor and
//     on a slab, a full stick brings it back with no restart, on both cores.
//     Calibration asks for the sticks only.
// Requires Chrome (CHROME, as tools/test_sim_map_boot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { spawnBrowser } from './browser_guard.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stepEasyArm, EASY_ARM_HOLD_S, EASY_DISARM_HOLD_S, isLanded, armHintText } from '../sim-3d.js';
import { wantsEasyTurtle, flipHintText, isStuckInverted } from '../sim-feel.js';
import {
  AETR_MAP, ARM_SWITCH_PREFIX, AXIS_MAP_PREFIX, RADIO_PRESET_PREFIX, SWITCHES_PREFIX, GP_ID_KEY, sanitizeId,
  loadRadioSwitches, saveRadioSwitches, switchesAxisMap, auxNumberOfAxis, normalizeSwitches,
  SWITCH_WIZARD_STEPS, createSwitchWizard, stepSwitchWizard, skipSwitchWizard, switchWizardResult,
  defaultFlightMode, saveFlightMode, hasArmSwitch,
} from '../sim-touch.js';
import { switchAux, radioAux, auxRanges, createBfCore, armingFlagNames, WS } from '../sim-core-adapter.js';
import { SimCore } from '../vendor/sim-core/sim-core.js';

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

test('easy disarm: throttle at the bottom 0.5 s while landed, not in the air, not before it flew', () => {
  assert.equal(EASY_DISARM_HOLD_S, 0.5);
  let r = run({}, 0.1, { t: 0.5, armed: true, landed: false });
  r = run(r.state, 3, { t: 0, armed: true, landed: false });
  assert.equal(r.out, null, 'falling at zero throttle stays armed');
  r = run(r.state, 0.4, { t: 0, armed: true, landed: true });
  assert.equal(r.out, null, 'landed 0.4 s');
  r = run(r.state, 0.2, { t: 0, armed: true, landed: true });
  assert.equal(r.out.disarm, true, 'landed 0.5 s disarms');
  assert.equal(r.out.reason, 'landed');
  assert.ok(r.at <= 0.11 && r.at >= 0.09, `at 0.5 s (${0.4 + r.at})`);
  r = run({ raised: true }, 0.4, { t: 0, armed: true, landed: true });
  r = run(r.state, 0.2, { t: 0.2, armed: true, landed: true });
  assert.equal(r.out, null);
  r = run(r.state, 0.4, { t: 0, armed: true, landed: true });
  assert.equal(r.out, null, 'throttle touched: the 0.5 s start over');
  r = run({ raised: true }, 0.4, { t: 0, armed: true, landed: true });
  r = run(r.state, 0.05, { t: 0, armed: true, landed: false });
  r = run(r.state, 0.4, { t: 0, armed: true, landed: true });
  assert.equal(r.out, null, 'a hop off the floor: the 0.5 s start over');
  assert.equal(run({}, 5, { t: 0, armed: true, landed: true }).out, null, 'armed at idle (Space, the touch ARM button), never raised: stays armed');
});

test('easy disarm: the throttle-up that armed counts as raised, though the next sample has it at the bottom', () => {
  // CI's ?core=js keyboard run (PR 342): one poll a long frame, the arm on the
  // raise, and S already down at the next poll. It flew 2.9 m and landed, and
  // stayed armed on the floor.
  let r = run({}, 1.01, { t: 0, armed: false });
  const armed = stepEasyArm(r.state, { t: 0.6, dt: DT, ready: true, autoArm: true, armed: false });
  assert.equal(armed.arm, true, 'raised after the hold arms');
  r = run(armed.state, 1.5, { t: 0, armed: true, landed: false });
  assert.equal(r.out, null, 'in the air at zero throttle: armed');
  r = run(r.state, 0.4, { t: 0, armed: true, landed: true });
  assert.equal(r.out, null, 'landed 0.4 s');
  r = run(r.state, 0.2, { t: 0, armed: true, landed: true });
  assert.equal(r.out && r.out.disarm, true, 'landed 0.5 s disarms');
  assert.equal(r.out.reason, 'landed');
  // An arm the core refused: the next sample is not armed, and the raise is gone.
  const refused = stepEasyArm(run({}, 1.01, { t: 0, armed: false }).state, { t: 0.6, dt: DT, ready: true, autoArm: true, armed: false });
  r = run(refused.state, 0.1, { t: 0, armed: false });
  assert.equal(r.state.raised, false, 'refused: not raised');
  assert.equal(run(r.state, 5, { t: 0, armed: true, landed: true }).out, null, 'then armed at idle (Space): stays armed');
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

test('easy turtle: at rest and not upright, a full roll or pitch stick, armed or not, any throttle', () => {
  const rest = { upZ: -1, clearanceM: 0.01, speed: 0, omega: 0, threeD: false, r: 1, p: 0 };
  assert.equal(wantsEasyTurtle(rest), true, 'full right roll');
  assert.equal(wantsEasyTurtle({ ...rest, r: -1 }), true, 'full left roll');
  assert.equal(wantsEasyTurtle({ ...rest, r: 0, p: 1 }), true, 'full pitch');
  assert.equal(wantsEasyTurtle({ ...rest, r: 0, p: -1 }), true, 'full pitch back');
  assert.equal(wantsEasyTurtle({ ...rest, r: 0.5 }), false, 'half a stick');
  assert.equal(wantsEasyTurtle({ ...rest, upZ: 1 }), false, 'upright');
  assert.equal(wantsEasyTurtle({ ...rest, upZ: -0.788 }), true, 'tipped onto a duct edge');
  assert.equal(wantsEasyTurtle({ ...rest, upZ: 0 }), true, 'square on its side');
  assert.equal(wantsEasyTurtle({ ...rest, upZ: 0.49 }), true, 'just past 60 degrees of tilt');
  assert.equal(wantsEasyTurtle({ ...rest, upZ: 0.51 }), false, 'nearly upright: it stays as it is');
  const sideways = { upZ: 0, clearanceM: 0.01, speed: 0, omega: 0 };
  assert.equal(isStuckInverted({ ...sideways, easy: true }), true, 'Easy mode names the way out on its side');
  assert.equal(isStuckInverted(sideways), false, 'off Easy mode, only on its back');
  assert.equal(wantsEasyTurtle({ ...rest, clearanceM: 1 }), false, 'in the air');
  assert.equal(wantsEasyTurtle({ ...rest, speed: 2 }), false, 'still sliding');
  assert.equal(wantsEasyTurtle({ ...rest, omega: 9 }), false, 'still tumbling');
  assert.equal(wantsEasyTurtle({ ...rest, threeD: true }), false, '3D has no turtle');
});

test('the first-visit flight mode: Angle on the keyboard and touch, Acro on a pad; a saved one wins', () => {
  const store = memStore();
  assert.equal(defaultFlightMode(store, 'keyboard'), 'angle');
  assert.equal(defaultFlightMode(store, 'pad'), 'acro');
  assert.equal(defaultFlightMode(store), 'angle', 'no pad: keyboard and touch');
  saveFlightMode('acro', store);
  assert.equal(defaultFlightMode(store, 'keyboard'), 'acro');
  saveFlightMode('angle', store);
  assert.equal(defaultFlightMode(store, 'pad'), 'angle');
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
  assert.deepEqual(switchWizardResult(w), { on: true, arm: { i: 7, sign: 1 }, turtle: { i: 4, sign: -1 }, angle: null });
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

test('saved per radio: a radio seen for the first time is off', () => {
  const store = memStore();
  assert.deepEqual(loadRadioSwitches(TX, store), { on: false, arm: null, turtle: null, angle: null });
  saveRadioSwitches(TX, { on: true, arm: { i: 7, sign: 1 } }, store);
  assert.equal(loadRadioSwitches(TX, store).on, true);
  assert.deepEqual(loadRadioSwitches(TX, store).arm, { i: 7, sign: 1 });
  assert.equal(loadRadioSwitches(ZORRO, store).on, false, 'each radio its own');
  assert.equal(loadRadioSwitches(TX, store).on, true);
});

// What an older page saved for a radio: its preset, its calibration
// (ryflyAxisMap_<id>: the sticks plus arm and mode) and its arm switch
// (quadmathSimArm_<id>). None of it turns the radio's switches on.
const CAL_MAP = { r: { i: 0, sign: 1 }, p: { i: 1, sign: 1 }, y: { i: 3, sign: 1 }, t: { i: 2, min: -1, max: 1 }, arm: { i: 4, sign: 1 }, mode: { i: 5, sign: 1 }, ver: 2 };
const SAVED = {
  'preset only (every radio that ever connected)': { [RADIO_PRESET_PREFIX + SID]: 'radiomaster' },
  'preset and arm switch': { [RADIO_PRESET_PREFIX + SID]: 'radiomaster', [ARM_SWITCH_PREFIX + SID]: JSON.stringify({ i: 4, sign: 1 }) },
  'calibrated, arm and mode saved': { [RADIO_PRESET_PREFIX + SID]: 'custom', [AXIS_MAP_PREFIX + SID]: JSON.stringify(CAL_MAP), [ARM_SWITCH_PREFIX + SID]: JSON.stringify({ i: 4, sign: 1 }) },
};

test('no migration: a radio saved before Easy mode starts in Easy mode', () => {
  for (const [name, init] of Object.entries(SAVED)) {
    const store = memStore({ [GP_ID_KEY]: TX, ...init });
    assert.deepEqual(loadRadioSwitches(TX, store), { on: false, arm: null, turtle: null, angle: null }, name);
    assert.equal(hasArmSwitch(switchesAxisMap(CAL_MAP, loadRadioSwitches(TX, store))), false, `${name}: its saved arm switch is not used`);
  }
  assert.equal(normalizeSwitches({ on: true }).on, false, 'on needs an arm switch');
});

test('the stick map: no arm or mode switch from a calibration; the wizard\'s arm when switches are on', () => {
  const off = switchesAxisMap(CAL_MAP, { on: false });
  assert.equal(hasArmSwitch(off), false);
  assert.equal(off.mode, undefined);
  assert.equal(off.t.i, 2, 'sticks kept');
  assert.equal(CAL_MAP.arm.i, 4, 'the saved map is not touched');
  const on = switchesAxisMap(CAL_MAP, { on: true, arm: { i: 7, sign: -1 } });
  assert.deepEqual(on.arm, { i: 7, sign: -1 }, 'the wizard\'s switch');
  assert.equal(on.mode, undefined, 'a skipped angle stays the Controls toggle');
  assert.equal(auxNumberOfAxis(AETR_MAP, 7), 4, 'axis 7 is AUX4');
  assert.equal(auxNumberOfAxis(AETR_MAP, 2), null, 'a stick');
});

test('switchAux: ARM on AUX4 reaches ARM on AUX1; the owner\'s layout passes through value for value', () => {
  const ranges = auxRanges(DIFF);
  const sw = { on: true, arm: { i: 7, sign: 1 }, turtle: { i: 5, sign: 1 }, angle: null };
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
  // The owner's layout through the wizard (AUX1 arm, AUX2 angle, AUX3 turtle):
  // exactly radioAux, half-way values included.
  const owner = [0, 0, -1, 0, 0.42, 1, -0.3, 1];
  const picks = { on: true, arm: { i: 4, sign: 1 }, angle: { i: 5, sign: 1 }, turtle: { i: 6, sign: 1 } };
  assert.deepEqual(switchAux(pad(owner), AETR_MAP, picks, ranges, {}), radioAux(pad(owner), AETR_MAP));
  // A radio with its switches as buttons: no AUX axes at all.
  const buttons = pad([0, 0, -1, 0], [1, 0]);
  const b = switchAux(buttons, AETR_MAP, { on: true, arm: { button: 0, sign: 1 } }, ranges, {});
  assert.equal(b[0], 2000);
  assert.equal(b.length, 12);
});

// The bf core itself, stepped as the page does (a 4 ms poll, 60 Hz frames): on
// its back with a few degrees of lean, as a quad that got there by rolling
// (it settles over onto the edge of a duct, 38 degrees down on one side).
// A teleport skips Betaflight's estimate, and from dead flat it would be a
// full 180 degrees out, which its accelerometer cannot correct.
async function quickRig({ mode, leanDeg = 4, frameMs = 16 }) {
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8')),
    diff: DIFF,
    world: { floorZ: 0, boxes: [] },
  });
  core.setMode(mode);
  const rig = { core, stick: { r: 0, p: 0, y: 0, t: 0 }, events: [], wall: 0, each: null };
  rig.upZ = () => { const [, x, y] = core.sim.state.quat; return 1 - 2 * (x * x + y * y); };
  rig.run = (ms) => {
    for (const end = rig.wall + ms; rig.wall < end; rig.wall += 4) {
      const tUs = core.stamp(rig.wall);
      if (core.turtlePhase) { const e = core.stepTurtle(true, true); if (e) rig.events.push(e); }
      if (tUs !== null) core.input(rig.stick, tUs);
      if (rig.wall % frameMs === 0) { core.advance(frameMs); core.anchor(rig.wall); }
      if (rig.each) rig.each();
    }
  };
  rig.run(400);
  const half = (180 - leanDeg) * Math.PI / 360;
  core.teleport({ x: 0, y: 0, z: 0.05 }, { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) });
  rig.run(1500);
  assert.ok(rig.upZ() < -0.5, `on its back or side (up Z ${rig.upZ().toFixed(3)})`);
  return rig;
}

// Runs a turtle to flyable: its time from upright (up Z over 0.9), and the
// throttle channel's highest value before it was armed.
function toFlyable(rig) {
  const { core } = rig;
  let upUs = null, flyUs = null, heldThr = 0;
  rig.each = () => {
    const f = core.sim.fc;
    if (upUs === null && rig.upZ() > 0.9) upUs = core.sim.simTimeUs;
    if (upUs !== null && flyUs === null) {
      if (f.armed && core.turtlePhase === null) flyUs = core.sim.simTimeUs;
      else heldThr = Math.max(heldThr, Math.round(f.rcData[3]));
    }
  };
  rig.run(1500);
  rig.each = null;
  return { ms: upUs !== null && flyUs !== null ? (flyUs - upUs) / 1000 : null, heldThr };
}

const flags = (core) => armingFlagNames(core.sim.fc.armingDisableFlags).join(' ');

for (const [name, opts, start] of [
  ['the stick, in acro', { mode: 'acro' }, (c) => c.startEasyTurtle(1, 0)],
  ['the stick, in angle', { mode: 'angle' }, (c) => c.startEasyTurtle(0, -1)],
  ['F, in angle', { mode: 'angle' }, (c) => c.startFlip()],
  ['the stick, at 15 frames a second', { mode: 'angle', frameMs: 64 }, (c) => c.startEasyTurtle(1, 0)],
]) {
  test(`bf core, ${name}: upright to flyable under 300 ms, the throttle channel low until armed, then the pilot's; stays up`, async () => {
    const rig = await quickRig(opts);
    rig.stick = { r: 0, p: 0, y: 0, t: 0.6 };   // a pilot who left the throttle up
    assert.equal(start(rig.core), true);
    const out = toFlyable(rig);
    assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
    assert.ok(out.ms !== null && out.ms < 300, `upright to flyable: ${out.ms} ms`);
    assert.ok(out.heldThr <= 1000, `throttle channel held low until armed (${out.heldThr})`);
    assert.equal(rig.core.getState().armed, true, flags(rig.core));
    assert.equal(rig.core.getState().crashFlip, false, 'crash flip ended');
    assert.equal(Math.round(rig.core.sim.fc.rcData[3]), 1600, 'the pilot\'s throttle, handed back');
    assert.ok(rig.core.sim.state.pos[2] > 0.3, `flying on it (z ${rig.core.sim.state.pos[2].toFixed(2)})`);
    assert.ok(rig.upZ() > 0.9, `upright in the air (${rig.upZ().toFixed(3)})`);
  });
}

test('bf core: re-armed at idle in angle, it rests upright; a lost estimate waits rather than rolling it back over', async () => {
  let rig = await quickRig({ mode: 'angle' });
  rig.core.startEasyTurtle(1, 0);
  assert.ok(toFlyable(rig).ms < 300);
  let minUp = 1;
  rig.each = () => { minUp = Math.min(minUp, rig.upZ()); };
  rig.run(3000);
  assert.ok(minUp > 0.95, `rests upright armed at idle (lowest up Z ${minUp.toFixed(3)})`);
  assert.equal(rig.core.getState().armed, true);
  // Dead flat by teleport: the estimate is 180 degrees out, so ARM waits.
  rig = await quickRig({ mode: 'angle', leanDeg: 0 });
  rig.core.startEasyTurtle(1, 0);
  rig.run(1800);
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  assert.equal(rig.core.getState().armed, true, flags(rig.core));
  minUp = 1;
  rig.each = () => { minUp = Math.min(minUp, rig.upZ()); };
  rig.run(2000);
  assert.ok(minUp > 0.95, `stays upright (lowest up Z ${minUp.toFixed(3)})`);
});

// At rest on each side, on the floor and on a slab. A free Air65 does not stay
// square on its side: it tips onto a duct edge, 38 degrees off its back.
const HALF = Math.SQRT1_2;
const RESTS = [
  ['its right side', { x: HALF, y: 0, z: 0, w: HALF }],
  ['its left side', { x: -HALF, y: 0, z: 0, w: HALF }],
  ['its nose', { x: 0, y: HALF, z: 0, w: HALF }],
  ['its tail', { x: 0, y: -HALF, z: 0, w: HALF }],
  ['its back', { x: 1, y: 0, z: 0, w: 0 }],
];
const SURFACES = [
  ['the floor', [], 0],
  ['a slab', [{ min: [-1, -1, 0], max: [1, 1, 0.3] }], 0.3],
];

async function restRig(q, boxes, top) {
  const core = await createBfCore({
    SimCore,
    wasm: readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')),
    airframe: JSON.parse(readFileSync(join(root, 'vendor/sim-core/airframes/air65.json'), 'utf8')),
    diff: DIFF,
    world: { floorZ: 0, boxes },
  });
  core.setMode('acro');
  const rig = { core, stick: { r: 0, p: 0, y: 0, t: 0 }, events: [], wall: 0, each: null };
  rig.upZ = () => { const [, x, y] = core.sim.state.quat; return 1 - 2 * (x * x + y * y); };
  rig.run = (ms) => {
    for (const end = rig.wall + ms; rig.wall < end; rig.wall += 4) {
      const tUs = core.stamp(rig.wall);
      if (core.turtlePhase) { const e = core.stepTurtle(true, true); if (e) rig.events.push(e); }
      if (tUs !== null) core.input(rig.stick, tUs);
      if (rig.wall % 16 === 0) { core.advance(16); core.anchor(rig.wall); }
      if (rig.each) rig.each();
    }
  };
  rig.run(400);
  core.teleport({ x: 0, y: 0, z: top + 0.1 }, q);
  rig.run(1500);
  return rig;
}

for (const [where, boxes, top] of SURFACES) {
  for (const [pose, q] of RESTS) {
    for (const [stick, r, p] of [['a full roll', 1, 0], ['a full pitch', 0, -1]]) {
      test(`bf core, at rest on ${pose} on ${where}: ${stick} brings it back and re-arms it`, async () => {
        const rig = await restRig(q, boxes, top);
        const s = rig.core.sim.state;
        assert.ok(rig.upZ() < 0.5, `not upright (up Z ${rig.upZ().toFixed(3)})`);
        assert.ok(s.groundClearance <= 0.04, `on the surface (${s.groundClearance.toFixed(3)} m)`);
        assert.ok(Math.hypot(...s.omega) < 0.1, 'at rest');
        assert.equal(rig.core.startEasyTurtle(r, p), true);
        const out = toFlyable(rig);
        assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
        assert.ok(out.ms !== null && out.ms < 300, `upright to flyable: ${out.ms} ms`);
        assert.ok(rig.upZ() > 0.9, `upright (${rig.upZ().toFixed(3)})`);
        assert.equal(rig.core.getState().armed, true, flags(rig.core));
        assert.ok(Math.abs(s.pos[2] - top) < 0.05, `still on ${where} (z ${s.pos[2].toFixed(3)})`);
      });
    }
  }
}

test('bf core: resting against a wall, on a duct and leaning on it, the stick brings it back', async () => {
  const half = -75 * Math.PI / 360;
  const rig = await restRig({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }, [{ min: [-1, 0.04, 0], max: [1, 0.24, 1] }], -0.025);
  assert.ok(rig.upZ() > -0.7 && rig.upZ() < 0.5, `propped, neither upright nor on its back (up Z ${rig.upZ().toFixed(3)})`);
  assert.equal(rig.core.startEasyTurtle(1, 0), true);
  const out = toFlyable(rig);
  assert.deepEqual(rig.events, ['flip', 'upright', 'rearm']);
  assert.ok(out.ms < 300, `upright to flyable: ${out.ms} ms`);
  assert.equal(rig.core.getState().armed, true, flags(rig.core));
});

test('bf core: rearm false lets go disarmed, for a radio on its switches', async () => {
  const rig = await quickRig({ mode: 'acro' });
  rig.core.startEasyTurtle(1, 0, false);
  rig.run(1500);
  assert.deepEqual(rig.events, ['flip', 'upright']);
  assert.equal(rig.core.turtlePhase, null);
  assert.equal(rig.core.getState().armed, false);
});

// ---- headless Chrome ----

// Upright to flyable in the page: the 300 ms is checked only where the page's
// frames step the sim clock by under FRAME_STEP_MAX_MS. The page steps the
// core, the turtle and the read-back here once a frame, so each end of the
// time is good to a frame; a CI runner's software GL takes 80 ms frames and
// more, which adds frames, not turtle. There the sequence is still checked
// (it recovers, re-arms and flies); tools/test_sim_turtle_rearm.mjs times the
// 300 ms to the tick on the sim clock, tools/smoke_sim_headed.mjs at a real
// frame rate.
const FRAME_STEP_MAX_MS = 50;
function checkFlyableTime(name, ms, stepMs) {
  assert.ok(Number.isFinite(ms), `${name}: upright to flyable measured (${ms})`);
  assert.ok(Number.isFinite(stepMs) && stepMs > 0, `${name}: frame step measured (${stepMs})`);
  if (stepMs < FRAME_STEP_MAX_MS) {
    assert.ok(ms < 300, `${name}: under 300 ms from upright to flyable (${Math.round(ms)} ms, frame step ${stepMs} ms)`);
  } else {
    console.log(`${name}: upright to flyable ${Math.round(ms)} ms not timed: frame step ${stepMs} ms of sim time (timed under ${FRAME_STEP_MAX_MS} ms)`);
  }
}

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
  const tickUp = () => { const [, x, y] = s.bfCore().sim.state.quat; return 1 - 2 * (x * x + y * y); };
  // Easy mode's own count of the throttle at the bottom, its arm hold
  // (sim-3d.js stepEasyArm, kept in easy().arm). The page counts it only on
  // the input polls it accepts, so where frames are slow (a CI runner) a fixed
  // wall time with the throttle down can be a fraction of that hold, and a
  // raise after it starts the hold over. Raising once held() is true drives it
  // as a pilot does; a hold the page never counts still fails at the ceiling.
  const lowS = () => { const e = s.easy && s.easy().arm; return e ? +e.lowS || 0 : 0; };
  const held = (sec, ms) => until(() => lowS() >= sec, ms || 12000);
  // A wait of ms on the wall clock and as much again on the bf core's own
  // clock (simTimeUs). The core steps only inside frames, so where frames are
  // slow a fixed wall time can be much less of the page's time; a wait on both
  // is never shorter than the wall time alone. Used where the page keeps no
  // count of the thing waited for. Summed per core: a reboot starts its clock over.
  const simWait = (ms, ceil) => {
    const w0 = performance.now();
    let b = null, last = 0, us = 0;
    return until(() => {
      const nb = s.bfCore();
      if (nb && nb !== b) { b = nb; last = nb.simTimeUs; }
      if (b) { us += Math.max(0, b.simTimeUs - last); last = b.simTimeUs; }
      return performance.now() - w0 >= ms && us >= ms * 1000;
    }, ceil || 8000);
  };
  // The page's frame step on the sim clock (simClockMs, both cores), largest
  // since frames() began: the page runs one stepCore per animation frame
  // (loop), so the clock's change from one animation frame to the next is one
  // frame's step. The page steps the core, the turtle and its read-back only
  // in frames, so a time read here is good to a frame at each end; under
  // FRAME_STEP_MAX_MS it is timed, over it only the sequence is checked
  // (tools/test_sim_turtle_rearm.mjs times it to the tick, and
  // tools/smoke_sim_headed.mjs at a real frame rate).
  function frames() {
    let last = s.simClockMs(), max = 0, on = true;
    const f = () => {
      if (!on) return;
      const now = s.simClockMs();
      max = Math.max(max, now - last);
      last = now;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    return () => { on = false; return Math.round(max * 10) / 10; };
  }
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
  // On its back at rest where it stands: a pose only, no fall to speak of, with
  // a few degrees of lean, and on bf time for Betaflight's estimate to settle
  // on it disarmed, as if it had rolled there.
  async function flip() {
    const c = s.coreState(), z = c.position.z;
    const half = 88 * Math.PI / 180;
    const q = { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
    if (c.kind === 'bf') s.bfCore().teleport({ x: c.position.x, y: c.position.y, z: z + 0.03 }, q);
    else { window._qp.quaternion = q; window._qp.omega.x = window._qp.omega.y = window._qp.omega.z = 0; }
    await wait(150);
    await wait(c.kind === 'bf' ? 400 : 0);
    const rest = await until(() => upZ() < -0.5 && s.coreState().clearance <= 0.04 && speed() < 0.3, 4000);
    if (c.kind === 'bf') await wait(1200);
    return rest;
  }
  // Where to test a rest: open floor near the quad, and the widest slab in
  // the map with nothing over it, in module metres (z: the surface).
  function spots(ws) {
    const bbs = s.colliders().filter((b) => !b.isEmpty());
    const free = (x, z, top) => !bbs.some((b) => x > b.min.x - 0.4 * ws && x < b.max.x + 0.4 * ws && z > b.min.z - 0.4 * ws && z < b.max.z + 0.4 * ws
      && b.max.y > top + 0.001 * ws && b.min.y < top + 1.2 * ws);
    const mod = (x, y, z) => ({ x: -z / ws, y: -x / ws, z: y / ws });
    const c = s.coreState().position, cx = -c.y * ws, cz = -c.x * ws;
    let floor = null;
    for (let r = 0.5; r < 20 && !floor; r += 0.5) {
      for (let a = 0; a < 16 && !floor; a++) {
        const x = cx + Math.cos(a * Math.PI / 8) * r * ws, z = cz + Math.sin(a * Math.PI / 8) * r * ws;
        if (free(x, z, 0) && !bbs.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z)) floor = mod(x, 0, z);
      }
    }
    let slab = null, best = 0;
    for (const b of bbs) {
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z, h = b.max.y / ws;
      if (w < 0.7 * ws || d < 0.7 * ws || h < 0.12 || h > 3) continue;
      const x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
      if (w * d > best && free(x, z, b.max.y)) { best = w * d; slab = mod(x, b.max.y, z); }
    }
    return { floor, slab };
  }
  // Put down at this attitude just over the surface: it settles as it will.
  async function restOn(q, spot) {
    const c = s.coreState(), z = spot.z + 0.1;
    if (c.kind === 'bf') s.bfCore().teleport({ x: spot.x, y: spot.y, z }, q, { x: 0, y: 0, z: 0 });
    else {
      const p = window._qp;
      p.position.x = spot.x; p.position.y = spot.y; p.position.z = z;
      p.velocity.x = p.velocity.y = p.velocity.z = 0;
      p.omega.x = p.omega.y = p.omega.z = 0;
      p.quaternion = { ...q };
    }
    await wait(c.kind === 'bf' ? 600 : 250);
    const w = () => { const o = s.coreState().omega; return Math.hypot(o.x, o.y, o.z); };
    return until(() => upZ() < 0.5 && s.coreState().clearance <= 0.04 && speed() < 0.2 && w() < 1, 4000);
  }
  // A full stick on axis i: did it start, come upright and re-arm, how long
  // from upright to flyable on the sim clock, and the largest frame step
  // meanwhile (frames()).
  async function recover(i, v) {
    const bf = s.coreState().kind === 'bf', b = bf ? s.bfCore() : null;
    const busy = () => (bf ? b.turtlePhase !== null : !!s.easy().jsTurtle);
    const clock = () => (bf ? b.simTimeUs / 1000 : s.simClockMs());
    const up0 = upZ();
    const step = frames();
    axis(i, v);
    const started = await until(busy, 2000);
    let upT = null, flyT = null;
    const flyable = await until(() => {
      if (upT === null && (bf ? tickUp() : upZ()) > 0.9) upT = clock();
      if (upT !== null && flyT === null && s.coreState().armed && !busy()) flyT = clock();
      return flyT !== null;
    }, 6000);
    const stepMs = step();
    axis(i, 0);
    await wait(120);
    return { up0, started, flyable, ms: flyT - upT, stepMs, up: upZ(), armed: s.coreState().armed, pos: { ...s.coreState().position }, map: s.map() };
  }
  // A fall onto the floor at speed: a crash (the Rig's walls are foam: about
  // 20 m/s on the bf core).
  function drop() {
    const c = s.coreState();
    const q = { x: 0, y: 0, z: 0, w: 1 };
    if (c.kind === 'bf') s.bfCore().teleport({ x: c.position.x, y: c.position.y, z: 2.5 }, q, { x: 0, y: 0, z: -25 });
    else { window._qp.position.z = 2.5; window._qp.velocity.z = -40; }
  }
  window.__easy = { s, wait, until, axis, thr, upZ, tickUp, lowS, held, simWait, speed, landed, fc, menus, state, flip, drop, spots, restOn, recover, frames };
  return true;
})()`;

const LAYOUT = [0, 0, 0, 0, 1, -1, 1, -1];   // throttle left mid-stick, AUX1 and AUX3 resting high, ARM on AUX4
// A raise comes once the page has counted its arm hold, and a little over.
const HOLD_S = EASY_ARM_HOLD_S + 0.05;

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
    const child = spawnBrowser(resolveChrome(), [
      '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--hide-scrollbars',
      '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update',
      '--disable-background-networking', '--disable-sync', '--window-size=480,270', ...(process.env.SIM_GPU_OFF === '1' ? ['--disable-gpu'] : []),
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
      // SIM_CPU_THROTTLE=4: the page's CPU slowed 4x (DevTools' throttling), to
      // run as on a slow CI runner.
      if (process.env.SIM_CPU_THROTTLE) await cdp(ws, 'Emulation.setCPUThrottlingRate', { rate: +process.env.SIM_CPU_THROTTLE });
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

        // Throttle left up at load, then a short hold: nothing arms. The short
        // hold is 0.35 s of the page's own count, and the arm state is read
        // once the page has seen the raise (its count back to 0), so a slow
        // runner still tries a short hold rather than none at all.
        r = await js(`
          await E.wait(1200);
          const up = E.state().armed;
          E.thr(0);
          const counted = await E.held(0.35);
          E.thr(0.6);
          const read = await E.until(() => E.lowS() === 0, 5000);
          await E.wait(700);
          return JSON.stringify({ up, counted, read, short: E.state().armed });`);
        assert.equal(r.counted, true, 'the page counted 0.35 s at the bottom');
        assert.equal(r.read, true, 'the page read the raise');
        assert.deepEqual({ up: r.up, short: r.short }, { up: false, short: false }, 'mid-stick at load does not arm; 0.35 s at the bottom does not');

        // Down for over a second (the page's own count of it), then up: armed and flying.
        r = await js(`
          E.thr(0);
          const held = await E.held(${HOLD_S});
          const before = E.state();
          E.thr(0.6);
          const t0 = performance.now();
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          const armMs = performance.now() - t0;
          await E.wait(900);
          return JSON.stringify({ held, before, armed, armMs, after: E.state() });`);
        console.log('arm: ' + JSON.stringify({ armMs: r.armMs, z: r.after.z, flags: r.after.flags }));
        assert.equal(r.held, true, 'the page held the throttle down a second');
        assert.equal(r.before.armed, false);
        assert.equal(r.armed, true, `armed by throttle (flags ${r.after.flags})`);
        assert.ok(r.after.z > 0.5, `flies (z ${r.after.z.toFixed(2)} m)`);
        assert.equal(r.after.rc[0], 2000, 'the page has ARM on, on the diff\'s AUX1');

        // Throttle to the bottom in the air: armed all the way down; then the
        // 0.5 s. The hold counts the page's input time, which is the sim's: so
        // it is timed on the sim's clock (the core's flight time), with the
        // wall's as a floor (the sim never runs ahead of it).
        r = await js(`
          E.thr(0);
          let armedInAir = true;
          const down = await E.until(() => { if (!E.landed()) armedInAir = armedInAir && E.s.coreState().armed; return E.landed(); }, 8000);
          const t0 = performance.now(), s0 = E.s.coreState().flightMs;
          let earliest = null, sim = null;
          const off = await E.until(() => { if (!E.s.coreState().armed && earliest === null) { earliest = performance.now() - t0; sim = E.s.coreState().flightMs - s0; } return earliest !== null; }, 6000);
          return JSON.stringify({ down, armedInAir, off, ms: earliest, simMs: sim });`);
        console.log('disarm: ' + JSON.stringify(r));
        assert.equal(r.down, true, 'it landed');
        assert.equal(r.armedInAir, true, 'armed in the air at zero throttle');
        assert.equal(r.off, true, 'disarmed landed');
        assert.ok(r.simMs >= 450 && r.simMs < 1125, `about 0.5 s after landing (${Math.round(r.simMs)} ms of sim time)`);
        assert.ok(r.ms >= 450, `not before 0.5 s of wall time either (${Math.round(r.ms)} ms)`);

        // A crash: a throttle at 20 % never reaches the bottom; it disarms at rest.
        // A fresh second down, counted by the page from here: the count it kept
        // through the landing would arm at once.
        r = await js(`
          E.thr(0);
          const held = await E.held(E.lowS() + ${HOLD_S});
          E.thr(0.2);
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          await E.wait(200);
          E.drop();
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          return JSON.stringify({ held, armed, off, st: E.state(), reason: E.s.easy().disarmReason });`);
        console.log('crash: ' + JSON.stringify({ armed: r.armed, off: r.off, thr: 0.2, upZ: r.st.upZ }));
        assert.equal(r.held, true, 'the page held the throttle down a second');
        assert.equal(r.armed, true);
        assert.equal(r.off, true, 'disarmed after the crash, throttle still at 20 %');
        assert.equal(r.reason, 'crash', 'as a crash');

        // Turtle by stick: upside down at rest, disarmed. Upright, it re-arms
        // with no hold: the throttle channel held low until armed, then the
        // pilot's. Once at the bottom, once left at half.
        for (const [name, stick, val, thr] of [['full right roll, throttle down', 0, 1, 0], ['full back pitch, throttle at half', 1, -1, 0.5]]) {
          r = await js(`
            E.thr(0);
            const rest = await E.flip();
            const before = E.state();
            E.thr(${thr});
            E.axis(${stick}, ${val});
            const b = E.s.bfCore();
            const step = E.frames();
            const started = await E.until(() => b.turtlePhase !== null, 2000);
            let crashFlip = false, flipRc = 0, upUs = null, flyUs = null, heldThr = 0;
            const flyable = await E.until(() => {
              const f = E.fc();
              if (f.crashFlip) { crashFlip = true; flipRc = Math.max(flipRc, Math.round(f.rcData[6])); }
              if (upUs === null && E.tickUp() > 0.9) upUs = b.simTimeUs;
              if (upUs !== null && flyUs === null) {
                if (f.armed && b.turtlePhase === null && !f.crashFlip) flyUs = b.simTimeUs;
                else heldThr = Math.max(heldThr, Math.round(f.rcData[3]));
              }
              return flyUs !== null;
            }, 6000);
            const stepMs = step();
            await E.wait(150);
            const f = E.fc();
            const handed = { thr: Math.round(f.rcData[3]), held: Math.round(f.rcData[${stick}]) };
            await E.wait(350);
            const heldUp = E.state();
            E.axis(${stick}, 0);
            await E.wait(500);
            return JSON.stringify({ rest, before, started, crashFlip, flipRc, flyable, ms: (flyUs - upUs) / 1000, stepMs, heldThr, handed, heldUp, after: E.state() });`);
          console.log(`turtle (${name}): ` + JSON.stringify({ started: r.started, crashFlip: r.crashFlip, flipRc: r.flipRc, ms: r.ms, stepMs: r.stepMs, heldThr: r.heldThr, handed: r.handed, upZ: r.after.upZ, armed: r.after.armed, z: r.after.z }));
          assert.equal(r.rest, true, `${name}: upside down at rest`);
          assert.ok(r.before.upZ < -0.5, `${name}: upside down (${r.before.upZ.toFixed(2)})`);
          assert.equal(r.before.armed, false, `${name}: disarmed upside down`);
          assert.equal(r.before.rc[2], 1000, `${name}: the turtle channel off, though the radio's AUX3 is high`);
          assert.equal(r.started, true, `${name}: the stick starts the turtle`);
          assert.equal(r.crashFlip, true, `${name}: Betaflight in crash flip`);
          assert.ok(r.flipRc >= 1700, `${name}: the page drives the turtle channel (${r.flipRc})`);
          assert.equal(r.flyable, true, `${name}: re-armed`);
          checkFlyableTime(name, r.ms, r.stepMs);
          assert.ok(r.heldThr <= 1000, `${name}: the throttle channel held low until armed (${r.heldThr})`);
          assert.equal(r.handed.thr, 1000 + 1000 * thr, `${name}: then the pilot's throttle`);
          assert.equal(r.handed.held, 1500, `${name}: a stick still held waits for centre`);
          assert.ok(r.heldUp.upZ > 0.9, `${name}: stays up, stick still held (${r.heldUp.upZ.toFixed(2)})`);
          assert.equal(r.after.auxTurtle, false, `${name}: released`);
          assert.equal(r.after.rc[2], 1000, `${name}: turtle channel low again`);
          assert.equal(r.after.armed, true, `${name}: armed, no hold (flags ${r.after.flags})`);
          assert.ok(r.after.upZ > 0.9, `${name}: still upright (${r.after.upZ.toFixed(2)})`);
          if (thr) assert.ok(r.after.z > 0.3, `${name}: flying on the pilot's throttle (z ${r.after.z.toFixed(2)})`);
          r = await js(`E.thr(0); await E.until(E.landed, 8000); await E.wait(200); return JSON.stringify(1);`);
        }
      });
    });

    await t.test('the wizard on the TX16S: channel and direction, skip, saved per radio, flown on the switches', async () => {
      await pass('', { pad: tx([0, 0, -1, 0, 1, -1, 1, -1]) }, async ({ js, reload }) => {
        let r = await js(`
          await E.until(() => document.querySelector('#panel .cb-radio-switches'), 1000);
          const cb = document.querySelector('#panel .cb-radio-switches');
          const was = cb.checked;
          cb.click();
          // The wizard draws its step on an input poll the page accepts, not as
          // it opens: wait for that first draw, which slow frames can hold back
          // past any fixed wait.
          await E.until(() => document.getElementById('calibStep').textContent !== '', 10000);
          const calib = document.getElementById('calib');
          return JSON.stringify({ was, open: calib.classList.contains('show'), step: document.getElementById('calibStep').textContent, skip: document.getElementById('calibSkip').style.display, wiz: E.state().wizard });`);
        console.log('wizard open: ' + JSON.stringify(r));
        assert.equal(r.was, false, 'off by default');
        assert.equal(r.open, true, 'the wizard opens');
        assert.match(r.step, /FLIP YOUR ARM SWITCH/);
        assert.equal(r.skip, 'none', 'the arm has no skip');
        // A step's text and its Skip are drawn on a later accepted poll than the
        // one that moves the step, and at most every 60 ms, so each is read once
        // the page has redrawn the step text rather than after a fixed wait. The
        // step itself must still move within 2 s of the flip, as it always had to.
        r = await js(`
          const drawn = (was) => E.until(() => document.getElementById('calibStep').textContent !== was, 10000);
          const armText = document.getElementById('calibStep').textContent;
          E.axis(7, 1);
          const s1 = await E.until(() => E.state().wizard && E.state().wizard.step === 1, 2000);
          await drawn(armText);
          const step = document.getElementById('calibStep').textContent, skip = document.getElementById('calibSkip').style.display;
          E.axis(4, -1);
          const s2 = await E.until(() => E.state().wizard && E.state().wizard.step === 2, 2000);
          await drawn(step);
          const step2 = document.getElementById('calibStep').textContent;
          document.getElementById('calibSkip').click();
          await E.wait(150);
          return JSON.stringify({ s1, s2, step, skip, step2, st: E.state(), saved: JSON.parse(localStorage.getItem(${JSON.stringify(KEY_TX)})), calib: document.getElementById('calib').classList.contains('show') });`);
        console.log('wizard done: ' + JSON.stringify({ ...r, st: r.st.switches }));
        assert.equal(r.s1, true, 'the arm switch taken within 2 s of its flip');
        assert.equal(r.s2, true, 'the turtle switch taken within 2 s of its flip');
        assert.match(r.step, /FLIP YOUR TURTLE SWITCH/);
        assert.equal(r.skip, '', 'the turtle has a skip');
        assert.match(r.step2, /FLIP YOUR ANGLE SWITCH/);
        assert.equal(r.calib, false, 'done');
        assert.deepEqual(r.saved, { on: true, arm: { i: 7, sign: 1 }, turtle: { i: 4, sign: -1 }, angle: null }, 'saved: channels and directions');
        assert.equal(r.st.easy, false, 'off Easy mode');

        // Flying it: ARM on AUX4, onto the diff's AUX1. AUX1 (the turtle now) is low = on.
        // On its switches the page keeps no count of the throttle at the bottom
        // to wait on, so each hold here is on the bf core's clock as well as the
        // wall's: never shorter than it was, and that much of the page's own
        // time however slow its frames, before the raise that must not arm and
        // before each state is read.
        r = await js(`
          E.axis(7, -1);
          E.axis(4, 1);
          const low = await E.simWait(1300);
          const off = E.state();
          E.thr(0.6);
          const upHeld = await E.simWait(500);
          const thrUp = E.state();
          E.thr(0);
          const downHeld = await E.simWait(800);
          E.axis(7, 1);
          const armed = await E.until(() => E.s.coreState().armed, 2500);
          await E.wait(100);
          const on = E.state();
          E.axis(7, -1);
          const offHeld = await E.simWait(600);
          return JSON.stringify({ low, upHeld, downHeld, offHeld, off, thrUp, armed, on, after: E.state() });`);
        console.log('flown: ' + JSON.stringify({ off: r.off.rc, on: r.on.rc, armed: r.armed, flags: r.on.flags }));
        assert.deepEqual([r.low, r.upHeld, r.downHeld, r.offHeld], [true, true, true, true], 'each hold lasted its time on the sim clock too');
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
          const held = await E.held(${HOLD_S});
          const st = E.state();
          E.thr(0.5);
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          E.thr(0);
          return JSON.stringify({ held, st, armed, saved: JSON.parse(localStorage.getItem(${JSON.stringify(KEY_TX)})) });`);
        assert.equal(r.st.easy, true);
        assert.equal(r.saved.on, false);
        assert.equal(r.held, true, 'the page held the throttle down a second');
        assert.equal(r.armed, true, 'arms by throttle again');

        // The wizard again, turtle and angle skipped: the stick still turtles.
        r = await js(`
          E.thr(0);
          await E.until(() => E.landed() && !E.s.coreState().armed, 6000);
          document.querySelector('#panel .cb-radio-switches').click();
          await E.wait(150);
          E.axis(7, 1);
          const s1 = await E.until(() => E.state().wizard && E.state().wizard.step === 1, 2000);
          // Skip is clicked once the page shows it, with the turtle step drawn
          // (on a later accepted poll than the step itself).
          const skipUp = await E.until(() => document.getElementById('calibSkip').style.display === '', 10000);
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
          return JSON.stringify({ s1, skipUp, set, rest, started, flipRc, upright, after: E.state() });`);
        console.log('skipped: ' + JSON.stringify({ sw: r.set.switches, started: r.started, flipRc: r.flipRc, upright: r.upright, source: r.after.source }));
        assert.equal(r.s1, true, 'again: the arm switch taken within 2 s of its flip');
        assert.equal(r.skipUp, true, 'the turtle step shows its skip');
        assert.equal(r.set.source, 'radio', 'on the radio');
        assert.deepEqual([r.set.switches.turtle, r.set.switches.angle], [null, null], 'both skipped');
        assert.equal(r.rest, true);
        assert.equal(r.started, true, 'a skipped turtle stays on the stick');
        assert.ok(r.flipRc >= 1700, `the page drives FLIP for the turtle (${r.flipRc})`);
        assert.equal(r.upright, true, 'upright');
        assert.equal(r.after.source, 'radio', 'AUX back on the radio afterwards');
        assert.equal(r.after.armed, false, 'on its switches: the switch arms it, not the turtle');

        // Unplugged: the keyboard's Angle, with no word from the radio it was.
        r = await js(`
          localStorage.removeItem('quadmathSimFlightMode');
          window.__pads.on = false;
          window.dispatchEvent(new Event('gamepaddisconnected'));
          await E.wait(200);
          const out = { flight: E.state().flight, toast: document.getElementById('toast').textContent };
          window.__pads.on = true;
          window.dispatchEvent(new Event('gamepadconnected'));
          await E.wait(600);
          return JSON.stringify(out);`);
        assert.equal(r.flight, 'angle', 'unplugged from its switches: Angle');
        assert.doesNotMatch(r.toast, /ON THE RADIO/, r.toast);

        // Calibration: the sticks only. It takes the centre and each stick after
        // a hold it counts on the input polls it accepts (1 s centred, 0.6 s a
        // stick), and draws its next prompt on a later one; so each pose is held
        // until the page has drawn its next prompt, not for a fixed time that
        // slow frames can make too short.
        r = await js(`
          for (const [i, v] of [[0, 0], [1, 0], [2, -1], [3, 0]]) E.axis(i, v);
          await E.wait(100);
          document.getElementById('btnCalib').click();
          const seen = new Set();
          let skipShown = false;
          const prompt = () => document.getElementById('calibStep').textContent;
          const note = () => {
            seen.add(prompt());
            skipShown = skipShown || document.getElementById('calibSkip').style.display !== 'none';
          };
          const hold = async (ms) => {
            const t0 = performance.now();
            while (performance.now() - t0 < ms) { note(); await E.wait(20); }
          };
          // The sticks kept as they are until the page draws a new prompt (or ms
          // pass); true if it did, so a pose that ran out its time is reported.
          const next = async (ms) => {
            const was = prompt();
            const t0 = performance.now();
            while (prompt() === was && performance.now() - t0 < ms) { note(); await E.wait(20); }
            note();
            return prompt() !== was;
          };
          const drawn = [];
          drawn.push(await next(3000));    // its first prompt drawn (the text was still the wizard's)
          drawn.push(await next(10000));   // the centre taken
          for (const i of [0, 1, 3]) { E.axis(i, 1); drawn.push(await next(6000)); E.axis(i, 0); await hold(60); }
          E.axis(2, 1); drawn.push(await next(4000));
          E.axis(2, -1);
          await E.until(() => { note(); return !document.getElementById('calib').classList.contains('show'); }, 4000);
          return JSON.stringify({ drawn, open: document.getElementById('calib').classList.contains('show'), seen: [...seen], skipShown, map: JSON.parse(localStorage.getItem(${JSON.stringify(AXIS_MAP_PREFIX + SID)})) });`);
        console.log('calibration: ' + JSON.stringify(r));
        assert.deepEqual(r.drawn, [true, true, true, true, true, true], 'each pose ended on the page\'s next prompt: ' + r.seen.join(' | '));
        assert.equal(r.open, false, 'done after the throttle');
        assert.ok(!r.seen.some((l) => /ARM|MODE/.test(l)), 'never asks for a switch: ' + r.seen.join(' | '));
        assert.equal(r.skipShown, false, 'nothing to skip');
        assert.deepEqual([r.map.r.i, r.map.p.i, r.map.y.i, r.map.t.i], [0, 1, 3, 2], 'the sticks found');
        assert.equal(r.map.arm, undefined, 'no arm switch saved');
        assert.equal(r.map.mode, undefined, 'no mode switch saved');
      });
    });

    await t.test('a radio that wakes after Fly was pressed: the map menu closes and it flies the Rig', async () => {
      await pass('', {}, async ({ js }) => {
        let r = await js(`
          document.getElementById('menuFly').click();
          await E.wait(200);
          const before = E.menus();
          const kbMode = E.state().flight;
          Object.assign(window.__pads, { on: true, id: ${JSON.stringify(TX)}, mapping: '', axes: [0, 0, -1, 0, -1, -1, -1, -1], buttons: 0 });
          window.dispatchEvent(new Event('gamepadconnected'));
          await E.wait(500);
          const st = E.state();
          window.__pads.on = false;
          window.dispatchEvent(new Event('gamepaddisconnected'));
          await E.wait(300);
          return JSON.stringify({ before, kbMode, st, unplugged: E.state().flight });`);
        assert.equal(r.kbMode, 'angle', 'no radio yet: the keyboard\'s Angle');
        assert.equal(r.st.flight, 'acro', 'the radio: Acro');
        assert.equal(r.unplugged, 'angle', 'unplugged: Angle again');
        assert.equal(r.before.layer, true, 'no radio seen yet: the map menu');
        assert.deepEqual(r.st.menus, { start: false, looks: false, layer: false, prompt: false, picker: false }, 'closed by the radio');
        assert.equal(r.st.map, 'rig');
        assert.match(r.st.radio, /TX16S/);
      });
    });

    await t.test('a profile saved before Easy mode (calibrated, AUX1 arm saved): starts in Easy mode', async () => {
      const saved = {
        [GP_ID_KEY]: TX,
        [RADIO_PRESET_PREFIX + SID]: 'custom',
        [AXIS_MAP_PREFIX + SID]: JSON.stringify(CAL_MAP),
        [ARM_SWITCH_PREFIX + SID]: JSON.stringify({ i: 4, sign: 1 }),
        quadmathSimInputChoice: 'radio',
        quadmathSimFlightMode: 'angle',
      };
      await pass('', { storage: saved, pad: tx([0, 0, -1, 0, -1, -1, -1, -1]) }, async ({ js, reload }) => {
        let r = await js(`await E.wait(800); return JSON.stringify(E.state());`);
        console.log('saved profile: ' + JSON.stringify(r.switches) + ' ' + r.rc);
        assert.deepEqual(r.switches, { on: false, arm: null, turtle: null, angle: null }, 'switches off');
        assert.equal(r.easy, true, 'Easy mode');
        assert.equal(r.source, 'page', 'the page drives AUX');
        assert.equal(r.flight, 'angle', 'a saved flight mode still wins');
        // Its saved AUX1 arm switch does nothing; the throttle arms. AUX1 is
        // read 400 ms after it goes high on the bf core's clock as well as the
        // wall's, so the core has stepped with it high however slow its frames.
        r = await js(`
          E.thr(0);
          const held = await E.held(${HOLD_S});
          E.axis(4, 1);
          const saw = await E.simWait(400);
          const aux1 = E.state();
          E.axis(4, -1);
          E.thr(0.6);
          const armed = await E.until(() => E.s.coreState().armed, 1500);
          E.thr(0);
          return JSON.stringify({ held, saw, aux1, armed });`);
        assert.equal(r.held, true, 'the page held the throttle down a second');
        assert.equal(r.saw, true, 'AUX1 high for 400 ms on the sim clock too');
        assert.equal(r.aux1.armed, false, 'its saved AUX1 switch does not arm');
        assert.equal(r.aux1.rc[0], 1000, 'and does not reach Betaflight');
        assert.equal(r.armed, true, 'the throttle arms');
        await reload();
        r = await js(`await E.wait(600); return JSON.stringify(E.state());`);
        assert.equal(r.easy, true, 'after a reload: still Easy mode');
      });
    });

    await t.test('the radio on ?core=js: arms by throttle, disarms, turtles by stick', async () => {
      await pass('core=js', { core: 'js', pad: tx() }, async ({ js }) => {
        let r = await js(`await E.wait(600); return JSON.stringify(E.state());`);
        assert.equal(r.kind, 'js');
        assert.equal(r.easy, true);
        assert.equal(r.mode, 'acro', 'acro on the js core');
        assert.deepEqual(r.menus, { start: false, looks: false, layer: false, prompt: false, picker: false });
        // The short hold and the long one are the page's own count of the
        // throttle down; after the short one the arm state is read once the
        // page has seen the raise (its count back to 0). Two evaluations, so
        // their waits together stay inside one page call's time.
        r = await js(`
          E.thr(0);
          const counted = await E.held(0.35);
          E.thr(0.7);
          const read = await E.until(() => E.lowS() === 0, 5000);
          await E.wait(300);
          return JSON.stringify({ counted, read, short: E.state().armed });`);
        console.log('js radio, short hold: ' + JSON.stringify(r));
        assert.equal(r.counted, true, 'the page counted 0.35 s at the bottom');
        assert.equal(r.read, true, 'the page read the raise');
        assert.equal(r.short, false, 'a short hold does not arm');
        r = await js(`
          E.thr(0);
          const held = await E.held(${HOLD_S});
          E.thr(0.62);
          const armed = await E.until(() => E.s.coreState().armed, 1000);
          await E.wait(700);
          const up = E.state();
          E.thr(0);
          const down = await E.until(E.landed, 8000);
          const t0 = performance.now(), s0 = E.s.coreState().flightMs;
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          return JSON.stringify({ held, armed, up: up.z, down, off, ms: performance.now() - t0, simMs: E.s.coreState().flightMs - s0, reason: E.s.easy().disarmReason });`);
        console.log('js radio: ' + JSON.stringify(r));
        assert.equal(r.held, true, 'the page held the throttle down a second');
        assert.equal(r.armed, true, 'armed by throttle');
        assert.ok(r.up > 0.3, `flies (z ${r.up})`);
        assert.equal(r.off, true, 'disarmed landed');
        assert.equal(r.reason, 'landed', 'on the 0.5 s rule, not as a crash');
        assert.ok(r.simMs >= 450 && r.simMs < 1125, `about 0.5 s (${Math.round(r.simMs)} ms of sim time)`);
        assert.ok(r.ms >= 450, `not before 0.5 s of wall time either (${Math.round(r.ms)} ms)`);
        for (const [name, stick, val] of [['roll', 0, -1], ['pitch', 1, 1]]) {
          r = await js(`
            E.thr(0);
            const rest = await E.flip();
            await E.wait(300);
            const step = E.frames();
            E.axis(${stick}, ${val});
            const started = await E.until(() => E.state().jsTurtle, 1500);
            let upT = null, flyT = null;
            const upright = await E.until(() => {
              if (upT === null && E.upZ() > 0.9) upT = E.s.simClockMs();
              if (upT !== null && flyT === null && E.s.coreState().armed) flyT = E.s.simClockMs();
              return flyT !== null;
            }, 6000);
            const stepMs = step();
            await E.wait(400);
            const held = E.state();
            E.axis(${stick}, 0);
            await E.wait(500);
            return JSON.stringify({ rest, started, upright, ms: flyT - upT, stepMs, held, st: E.state() });`);
          console.log(`js turtle ${name}: ` + JSON.stringify({ rest: r.rest, started: r.started, upright: r.upright, ms: r.ms, stepMs: r.stepMs, upZ: r.st.upZ, armed: r.st.armed }));
          assert.equal(r.started, true, `${name}: the stick starts it`);
          assert.equal(r.upright, true, `${name}: upright and re-armed`);
          checkFlyableTime(name, r.ms, r.stepMs);
          assert.ok(r.held.upZ > 0.9, `${name}: stays up, stick still held (${r.held.upZ.toFixed(2)})`);
          assert.equal(r.st.armed, true, `${name}: armed, no hold`);
          assert.ok(r.st.upZ > 0.97, `${name}: lands level (${r.st.upZ.toFixed(3)})`);
        }
      });
    });

    // Every rest, on both surfaces, in one session: no respawn between them.
    for (const [core, query] of [['bf', ''], ['js', 'core=js']]) {
      await t.test(`on the ${core} core: at rest on each side and its back, floor and slab, the stick recovers it with no restart`, async () => {
        await pass(query, { core, pad: tx([0, 0, -1, 0, -1, -1, -1, -1]) }, async ({ js }) => {
          const where = await js(`return JSON.stringify(E.spots(${WS}));`);
          console.log(`${core} spots: ` + JSON.stringify(where));
          assert.ok(where.floor, 'open floor found');
          assert.ok(where.slab && where.slab.z > 0.1, 'a slab found');
          // stick: which axis and way, across and along the side it lies on.
          const sticks = [[0, 1], [1, 1], [0, -1], [1, -1], [0, 1]];
          for (const [surface, spot] of [['the floor', where.floor], ['a slab', where.slab]]) {
            let n = 0;
            for (const [pose, q] of RESTS) {
              const [i, v] = sticks[n++];
              const r = await js(`
                E.thr(0);
                const rest = await E.restOn(${JSON.stringify(q)}, ${JSON.stringify(spot)});
                const out = await E.recover(${i}, ${v});
                return JSON.stringify({ rest, ...out });`);
              const name = `${core}, ${pose} on ${surface}`;
              console.log(`${name}: ` + JSON.stringify({ up0: +r.up0.toFixed(3), ms: Math.round(r.ms), stepMs: r.stepMs, up: +r.up.toFixed(3), armed: r.armed }));
              assert.equal(r.rest, true, `${name}: at rest and not upright`);
              assert.ok(r.up0 < 0.5, `${name}: not upright (${r.up0.toFixed(3)})`);
              assert.equal(r.started, true, `${name}: the stick starts it`);
              assert.equal(r.flyable, true, `${name}: upright and re-armed`);
              checkFlyableTime(name, r.ms, r.stepMs);
              assert.ok(r.up > 0.9, `${name}: upright (${r.up.toFixed(3)})`);
              assert.equal(r.armed, true, `${name}: armed`);
              assert.ok(Math.hypot(r.pos.x - spot.x, r.pos.y - spot.y) < 0.6 && Math.abs(r.pos.z - spot.z) < 0.3, `${name}: where it lay, no respawn (${JSON.stringify(r.pos)})`);
              assert.equal(r.map, 'rig', `${name}: same map`);
            }
            // And it flies from there, in the same session.
            const f = await js(`
              E.thr(0.6);
              await E.wait(500);
              const z = E.s.coreState().position.z;
              E.thr(0);
              await E.wait(300);
              return JSON.stringify({ z, armed: E.s.coreState().armed });`);
            assert.ok(f.z > spot.z + 0.2, `${core} flies off ${surface} (z ${f.z.toFixed(2)})`);
          }
        });
      });
    }

    await t.test('the keyboard on the bf core: W arms, S and 0.5 s disarm, an arrow turtles', async () => {
      await pass('map=rig', {}, async ({ js, key }) => {
        // W once the page has counted the throttle down a second (a fixed wall
        // time can be much less of a hold where frames are slow).
        let r = await js(`window._feel.hideFirstRun(); return JSON.stringify(await E.held(${HOLD_S}));`);
        assert.equal(r, true, 'the page held the throttle down a second');
        await key('rawKeyDown', 'w', 'KeyW', 87);
        await key('keyDown', 'w', 'KeyW', 87);
        r = await js(`const a = await E.until(() => E.s.coreState().armed, 2000); return JSON.stringify({ a, st: E.state() });`);
        await key('keyUp', 'w', 'KeyW', 87);
        console.log('kb bf: ' + JSON.stringify({ armed: r.a, flags: r.st.flags, mode: r.st.mode }));
        assert.equal(r.a, true, `W arms (flags ${r.st.flags})`);
        assert.equal(r.st.mode, 'angle', 'the keyboard defaults to Angle');
        await key('keyDown', 's', 'KeyS', 83);
        r = await js(`await E.wait(1100); return JSON.stringify(1);`);
        r = await js(`
          const down = await E.until(E.landed, 8000);
          const off = await E.until(() => !E.s.coreState().armed, 6000);
          return JSON.stringify({ down, off });`);
        await key('keyUp', 's', 'KeyS', 83);
        assert.deepEqual(r, { down: true, off: true }, 'S to the bottom, landed 0.5 s: disarmed');
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

        // F, the sim's flip: an armed turtle upside down is not a crash.
        r = await js(`await E.wait(600); const rest = await E.flip(); await E.wait(300); return JSON.stringify({ rest });`);
        assert.equal(r.rest, true);
        await key('rawKeyDown', 'f', 'KeyF', 70);
        await key('keyDown', 'f', 'KeyF', 70);
        await key('keyUp', 'f', 'KeyF', 70);
        r = await js(`
          const b = E.s.bfCore();
          const step = E.frames();
          const started = await E.until(() => b.turtlePhase !== null, 2000);
          let auto = false, upUs = null, flyUs = null;
          const flyable = await E.until(() => {
            auto = auto || b.turtleAuto;
            if (upUs === null && E.tickUp() > 0.9) upUs = b.simTimeUs;
            if (upUs !== null && flyUs === null && E.fc().armed && b.turtlePhase === null) flyUs = b.simTimeUs;
            return flyUs !== null;
          }, 6000);
          const stepMs = step();
          await E.wait(400);
          return JSON.stringify({ started, auto, flyable, ms: (flyUs - upUs) / 1000, stepMs, flips: b.simFlips, armed: E.s.coreState().armed, upZ: E.upZ() });`);
        console.log('F flip: ' + JSON.stringify(r));
        assert.equal(r.started, true, 'F starts');
        assert.equal(r.auto, true, 'as an F flip');
        assert.equal(r.flyable, true, 'F re-arms in Easy mode');
        checkFlyableTime('F', r.ms, r.stepMs);
        assert.equal(r.flips, 1, 'counted once');
        assert.equal(r.armed, true, 'stays armed');
        assert.ok(r.upZ > 0.9, `stays up (${r.upZ.toFixed(2)})`);
      });
    });

    await t.test('the keyboard on ?core=js, a gamepad and touch: arm by throttle, turtle by stick', async () => {
      await pass('core=js&map=rig', { core: 'js' }, async ({ js, key }) => {
        // W once the page has counted the throttle down a second.
        let r = await js(`window._feel.hideFirstRun(); return JSON.stringify(await E.held(${HOLD_S}));`);
        assert.equal(r, true, 'js keyboard: the page held the throttle down a second');
        await key('rawKeyDown', 'w', 'KeyW', 87);
        await key('keyDown', 'w', 'KeyW', 87);
        r = await js(`return JSON.stringify({ armed: await E.until(() => E.s.coreState().armed, 2000), mode: E.s.coreState().flightMode });`);
        await key('keyUp', 'w', 'KeyW', 87);
        assert.deepEqual(r, { armed: true, mode: 'angle' }, 'js keyboard: W arms, in Angle');
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
        // Stick up once the page has counted the throttle down a second.
        let r = await js(`window._feel.hideFirstRun(); return JSON.stringify(await E.held(${HOLD_S}));`);
        assert.equal(r, true, 'gamepad: the page held the throttle down a second');
        // A spring pad: left stick up is throttle (axis 1, up is -1).
        r = await js(`
          E.axis(1, -0.7);
          const a = await E.until(() => E.s.coreState().armed, 2000);
          E.axis(1, 0);
          return JSON.stringify({ a, st: E.state() });`);
        console.log('gamepad bf: ' + JSON.stringify({ armed: r.a, source: r.st.source, flags: r.st.flags, mode: r.st.mode }));
        assert.equal(r.a, true, `gamepad: stick up arms (flags ${r.st.flags})`);
        assert.equal(r.st.mode, 'acro', 'the gamepad defaults to Acro');
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
        // Touch's read(), as the sticks would report it. Up once the page has
        // counted the throttle down a second.
        let r = await js(`
          const stick = window.__touchStick = { r: 0, p: 0, y: 0, t: 0 };
          window._touch.read = () => ({ ...stick });
          window._touch.enabled = true;
          window._feel.hideFirstRun();
          return JSON.stringify(await E.held(${HOLD_S}));`);
        assert.equal(r, true, 'touch: the page held the throttle down a second');
        r = await js(`
          const stick = window.__touchStick;
          stick.t = 0.6;
          const a = await E.until(() => E.s.coreState().armed, 2000);
          stick.t = 0;
          return JSON.stringify({ a, mode: E.s.coreState().flightMode });`);
        assert.deepEqual(r, { a: true, mode: 'angle' }, 'touch: throttle up arms, in Angle');
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
