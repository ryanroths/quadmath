// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim M1 feel — first-run, tutorial, HUD, rate presets, aux helpers.
// Keep physics in quadphysics.js. Do not touch racing track layouts or ghosts.
// New localStorage keys: quadmathSimInputChoice, quadmathSimFloatiness,
//   quadmathSimFov, quadmathSimStickOverlay, quadmathSimSpeedUnits.
// Nothing here is copied from WebFPV.

import { makeWorldLabel } from './sim-art.js?v=2528f7c1d996';

export const INPUT_CHOICE_KEY = 'quadmathSimInputChoice';
export const FLOATINESS_KEY = 'quadmathSimFloatiness';
export const FOV_KEY = 'quadmathSimFov';
export const CAM_KEY = 'quadmathSimCamDeg';
// three.js PerspectiveCamera.fov is vertical. 90° V @ 16:9 ≈ 121° H, closer
// to an HD whoop than the old 110° V fish-eye (≈ 137° H).
export const VFOV_DEFAULT = 90;
export const VFOV_OLD_DEFAULT = 110;
export const CAM_TILT_PRESETS = Object.freeze({
  indoorWhoop: { id: 'indoorWhoop', label: 'Indoor whoop', deg: 15 },
  raceWhoop: { id: 'raceWhoop', label: 'Race whoop', deg: 25 },
  freestyle: { id: 'freestyle', label: 'Freestyle', deg: 30 },
});

export function loadFloatiness(fallback) {
  const fb = fallback != null ? fallback : 0.32;
  try {
    const v = parseFloat(localStorage.getItem(FLOATINESS_KEY));
    if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  } catch (e) { /* ignore */ }
  return fb;
}

export function saveFloatiness(v) {
  try { localStorage.setItem(FLOATINESS_KEY, String(v)); } catch (e) { /* ignore */ }
}

function fovStore(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch (e) { return null; }
}

function clampFov(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return VFOV_DEFAULT;
  return Math.max(80, Math.min(160, x));
}

// Bare "110" (or missing) is the old vertical default → 90. Versioned
// {v:1,fov:N} is an explicit choice and is kept, even if N is 110.
export function migrateSavedFov(raw) {
  if (raw == null || raw === '') return VFOV_DEFAULT;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && Number.isFinite(+o.fov) && +o.v >= 1) {
      return clampFov(+o.fov);
    }
  } catch (e) { /* plain number from an early write */ }
  const n = Number(raw);
  if (!Number.isFinite(n)) return VFOV_DEFAULT;
  if (Math.abs(n - VFOV_OLD_DEFAULT) < 0.5) return VFOV_DEFAULT;
  return clampFov(n);
}

export function loadFov(storage) {
  const store = fovStore(storage);
  if (!store || typeof store.getItem !== 'function') return VFOV_DEFAULT;
  try { return migrateSavedFov(store.getItem(FOV_KEY)); }
  catch (e) { return VFOV_DEFAULT; }
}

export function saveFov(v, storage) {
  const store = fovStore(storage);
  if (!store || typeof store.setItem !== 'function') return;
  try { store.setItem(FOV_KEY, JSON.stringify({ v: 1, fov: clampFov(v) })); }
  catch (e) { /* ignore quota / private mode */ }
}

// The FPV camera tilt the pilot set on the Cam angle slider (degrees, the
// slider's 0..60), or null when they never have: a saved angle beats the
// class default (sim.html DRONE_TYPES[...].cam).
export function loadCamDeg(storage) {
  const store = fovStore(storage);
  if (!store || typeof store.getItem !== 'function') return null;
  try {
    const raw = store.getItem(CAM_KEY);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : null;
  } catch (e) { return null; }
}

export function saveCamDeg(v, storage) {
  const store = fovStore(storage);
  const n = Number(v);
  if (!store || typeof store.setItem !== 'function' || !Number.isFinite(n)) return;
  try { store.setItem(CAM_KEY, String(Math.max(0, Math.min(60, n)))); }
  catch (e) { /* ignore quota / private mode */ }
}

// The arrow-key nudge (sim.html): the Cam angle 5 degrees up or down a press,
// within 0..45. An angle the slider set above 45 is not raised; down brings
// it back into range.
export const CAM_NUDGE_DEG = 5;
export const CAM_NUDGE_MAX = 45;
export function nudgeCamDeg(cur, dir) {
  const c = Number.isFinite(Number(cur)) ? Number(cur) : 0;
  if (dir > 0 && c >= CAM_NUDGE_MAX) return c;
  return Math.max(0, Math.min(CAM_NUDGE_MAX, c + (dir > 0 ? CAM_NUDGE_DEG : -CAM_NUDGE_DEG)));
}

// True when a FOV the pilot set on the slider is saved, old or new: it beats
// the look's lens (sim-look.js). A bare 110 is the old default, not a choice.
export function fovChosen(storage) {
  const store = fovStore(storage);
  if (!store || typeof store.getItem !== 'function') return false;
  try {
    const raw = store.getItem(FOV_KEY);
    if (raw == null || raw === '') return false;
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { /* plain number from an early write */ }
    if (o && typeof o === 'object') return +o.v >= 1 && Number.isFinite(+o.fov);
    const n = Number(raw);
    return Number.isFinite(n) && Math.abs(n - VFOV_OLD_DEFAULT) >= 0.5;
  } catch (e) { return false; }
}

export const RATE_PRESETS = {
  whoopBeginner: {
    label: 'Whoop beginner',
    type: 'BETAFLIGHT',
    roll:  { rcRate: 0.70, srate: 0.40, expo: 0.50 },
    pitch: { rcRate: 0.70, srate: 0.40, expo: 0.50 },
    yaw:   { rcRate: 0.70, srate: 0.35, expo: 0.45 },
  },
  whoopRace: {
    label: 'Whoop race',
    type: 'BETAFLIGHT',
    roll:  { rcRate: 1.10, srate: 0.72, expo: 0.25 },
    pitch: { rcRate: 1.10, srate: 0.72, expo: 0.25 },
    yaw:   { rcRate: 1.10, srate: 0.72, expo: 0.25 },
  },
  freestyle: {
    label: 'Freestyle',
    type: 'BETAFLIGHT',
    roll:  { rcRate: 1.30, srate: 0.80, expo: 0.30 },
    pitch: { rcRate: 1.30, srate: 0.80, expo: 0.30 },
    yaw:   { rcRate: 1.20, srate: 0.75, expo: 0.35 },
  },
  // Ryan / RyFly Actual: centre 20, max 740/740/700, expo 0.56 (stored = CLI
  // for ACTUAL): the owner's Air65 and Fractal75 diffs' rateprofile 0
  // (rc_rate 2), as the bf core's RyFly (stock) preset.
  ryanActual: {
    label: 'Ryan Actual',
    type: 'ACTUAL',
    roll:  { rcRate: 2, srate: 74, expo: 0.56 },
    pitch: { rcRate: 2, srate: 74, expo: 0.56 },
    yaw:   { rcRate: 2, srate: 70, expo: 0.56 },
  },
};

export function loadInputChoice() {
  try {
    const v = localStorage.getItem(INPUT_CHOICE_KEY);
    if (v === 'keyboard' || v === 'calibrate' || v === 'touch' || v === 'radio') return v;
  } catch (e) { /* ignore */ }
  return null;
}

export function saveInputChoice(v) {
  try { localStorage.setItem(INPUT_CHOICE_KEY, v); } catch (e) { /* ignore */ }
}

// ---------- Every key, in one list ----------
// The keys the sim answers, once: the corner legend (#legend: the ones marked
// legend, in this order) and the keys card (? or Controls, All keys) are both
// drawn from it, so neither can show a key the other lacks or word it another
// way. keys: as shown; does: what it does; group: the keys card's heading;
// legend: on the corner legend; id: that legend line's element id (G greys
// out until there is a ghost). L (the shadow camera's helper) is a
// developer's switch and is not listed.
export const HOTKEY_GROUPS = Object.freeze(['Flying', 'Camera and sound', 'Runs, races and ghosts', 'Menus', 'In a replay', 'In the track builder']);
export const HOTKEYS = Object.freeze([
  { keys: 'W/S', does: 'Throttle', group: 'Flying', legend: true },
  { keys: 'A/D', does: 'Yaw', group: 'Flying', legend: true },
  { keys: 'Arrows', does: 'Pitch / Roll', group: 'Flying', legend: true },
  { keys: 'M', does: 'Sound On/Off', group: 'Camera and sound', legend: true },
  { keys: 'N', does: 'Next Music Track', group: 'Camera and sound', legend: true },
  { keys: '1/2/3', does: 'Angle / Horizon / Acro', group: 'Flying', legend: true },
  { keys: 'Space', does: 'Arm / Disarm', group: 'Flying', legend: true },
  { keys: 'H', does: 'Stick HUD', group: 'Camera and sound', legend: true },
  { keys: 'G', does: 'Ghost Replay', group: 'Runs, races and ghosts', legend: true, id: 'legendGhost' },
  { keys: 'K', does: 'Share last run (link)', group: 'Runs, races and ghosts', legend: true },
  { keys: 'C', does: 'Coach / line', group: 'Runs, races and ghosts', legend: true },
  { keys: 'T', does: 'Race this map', group: 'Runs, races and ghosts', legend: true },
  { keys: 'R', does: 'Respawn last gate', group: 'Flying', legend: true },
  { keys: 'P', does: 'New pack', group: 'Flying', legend: true },
  { keys: 'F', does: 'Sim flip when upside down', group: 'Flying', legend: true },
  { keys: 'F', does: 'Right side up: the next flight mode (on bf a flip is logged as an assist)', group: 'Flying' },
  { keys: '\u2191/\u2193', does: 'Cam angle \u00b15\u00b0 (radio or pad)', group: 'Camera and sound', legend: true },
  { keys: 'ESC', does: 'Menu', group: 'Menus', legend: true },
  { keys: 'TAB', does: 'Tune Panel', group: 'Menus', legend: true },
  { keys: '?', does: 'All keys (this list)', group: 'Menus' },
  { keys: 'Enter', does: 'On touch sticks, after W, an arrow or Space: fly with the keyboard', group: 'Menus' },
  { keys: 'V', does: 'Replay the last run', group: 'Runs, races and ghosts' },
  { keys: 'Space', does: 'Play / pause', group: 'In a replay' },
  { keys: 'V or ESC', does: 'Leave the replay', group: 'In a replay' },
  { keys: 'Q/E', does: 'Rotate the piece', group: 'In the track builder' },
  { keys: 'Delete or Backspace', does: 'Remove the piece', group: 'In the track builder' },
  { keys: 'ESC', does: 'Close the builder', group: 'In the track builder' },
]);

function escKeyText(raw) {
  return String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The corner legend's lines (after its corner marks): "W/S \u2014 Throttle", ...
export function legendHtml(list = HOTKEYS) {
  return list.filter((k) => k.legend)
    .map((k) => '<b' + (k.id ? ' id="' + escKeyText(k.id) + '"' : '') + '>' + escKeyText(k.keys) + ' \u2014 ' + escKeyText(k.does) + '</b>')
    .join('<br>');
}

// The keys card: every key, under its group's heading, in the list's order.
export function keysCardHtml(list = HOTKEYS) {
  return HOTKEY_GROUPS.map((g) => {
    const rows = list.filter((k) => k.group === g);
    if (!rows.length) return '';
    return '<h3 class="keys-group">' + escKeyText(g) + '</h3><dl class="keys-list">' +
      rows.map((k) => '<dt><kbd>' + escKeyText(k.keys) + '</kbd></dt><dd>' + escKeyText(k.does) + '</dd>').join('') + '</dl>';
  }).join('');
}

export function applyRatePreset(rates, name) {
  const p = RATE_PRESETS[name];
  if (!p || !rates) return false;
  rates.type = p.type;
  for (const ax of ['roll', 'pitch', 'yaw']) {
    Object.assign(rates[ax], p[ax]);
  }
  return true;
}

// Quiet "stuck inverted" hint. Old trigger was the opposite of what we
// want: armed + |roll| or |pitch| > 2 rad, unless sitting still near the
// floor — so mid-flip, inverted hang, and inverted dive all flashed
// FLIPPED. Now it only fires when the craft is actually turtled.
export const STUCK_UP_Z = -0.5;          // body-up world Z (cos 120°)
export const STUCK_CLEARANCE_M = 0.02;   // ~2 cm
export const STUCK_SPEED_MS = 0.3;
export const STUCK_OMEGA = 1.5;          // rad/s
export const STUCK_HOLD_S = 1.5;

export function bodyUpZ(q) {
  if (!q) return 1;
  const x = q.x || 0, y = q.y || 0;
  return 1 - 2 * (x * x + y * y);
}

export function isStuckInverted(info) {
  if (!info) return false;
  const upZ = info.upZ == null
    ? (info.upsideDown ? -1 : 1)
    : +info.upZ;
  if (!(upZ < (info.easy ? EASY_TURTLE_UP_Z : STUCK_UP_Z))) return false;
  const clearance = info.clearanceM == null ? info.height : info.clearanceM;
  const contact = !!info.contact || (clearance != null && +clearance <= STUCK_CLEARANCE_M);
  if (!contact) return false;
  const speed = info.speed == null ? 99 : +info.speed;
  const omega = info.omega == null ? 0 : +info.omega;
  if (!(speed < STUCK_SPEED_MS)) return false;
  if (!(omega < STUCK_OMEGA)) return false;
  return true;
}

export function stepStuckHold(prev, info, dt) {
  if (!isStuckInverted(info)) return 0;
  const step = Number(dt);
  return (prev || 0) + (Number.isFinite(step) ? Math.max(0, step) : 0);
}

export function shouldToastFlip(info) {
  if (!isStuckInverted(info)) return false;
  const held = info.heldS == null ? 0 : +info.heldS;
  return held >= STUCK_HOLD_S - 1e-9;
}

// What the stuck-inverted toast tells the pilot (info: core 'js' or 'bf',
// radio, armed, threeD, touch, flipAux). The way out it names is the one that
// works there:
// - 3D: none to roll; respawn.
// - The bf core with a radio: Betaflight's crash flip on the radio, the
//   diff's FLIP OVER AFTER CRASH switch (flipAux) on before an arm.
// - Otherwise the turtle gesture, armed: full throttle and a hard roll. On
//   the bf core an arm while flipped turtles too, so the roll alone does.
// Then how to respawn: R, or the touch RESPAWN button.
export function flipHintText(info) {
  const i = info || {};
  if (i.threeD) return i.touch ? 'FLIPPED — TAP RESPAWN' : 'FLIPPED — R TO RESPAWN';
  const respawn = i.touch ? ' · OR RESPAWN' : ' · R RESPAWNS';
  if (i.easy) return 'FLIPPED — FULL ROLL OR PITCH STICK' + respawn;
  if (i.core === 'bf' && (i.radio || !i.flipAux)) {
    if (!i.flipAux) return 'FLIPPED — NO TURTLE SWITCH IN THE DIFF' + respawn;
    return 'FLIPPED — ' + (i.armed ? 'DISARM, ' : '') + 'AUX' + i.flipAux + ' ON, ARM, ROLL' + respawn;
  }
  if (i.armed) return 'FLIPPED — FULL THROTTLE + HARD ROLL' + respawn;
  return 'FLIPPED — ARM, THEN ' + (i.core === 'bf' ? 'ROLL' : 'FULL THROTTLE + HARD ROLL') + respawn;
}

// Turtle / flip-over: armed, inverted on the deck, full throttle + extreme roll.
export function wantsTurtle(info) {
  if (!info || !info.armed || info.threeD) return false;
  const upZ = info.upZ == null ? 1 : +info.upZ;
  if (!(upZ < -0.35)) return false;
  const clearance = info.clearanceM == null ? info.height : info.clearanceM;
  const contact = !!info.contact || (clearance != null && +clearance <= 0.04);
  if (!contact) return false;
  if (!(info.throttle >= 0.9)) return false;
  if (!(Math.abs(info.rollStick || 0) >= 0.82)) return false;
  return true;
}

// Easy mode's turtle: at rest and not upright (on its back or on any side), a
// full roll or pitch stick, armed or not and at any throttle. info: upZ,
// clearanceM, contact, speed, omega, threeD, r, p (sticks).
export const EASY_TURTLE_STICK = 0.9;
export const EASY_TURTLE_UP_Z = 0.5;
export function wantsEasyTurtle(info) {
  if (!info || info.threeD) return false;
  const upZ = info.upZ == null ? 1 : +info.upZ;
  if (!(upZ < EASY_TURTLE_UP_Z)) return false;
  const contact = !!info.contact || (info.clearanceM != null && +info.clearanceM <= 0.04);
  if (!contact) return false;
  if (!(+info.speed < STUCK_SPEED_MS) || !(+info.omega < STUCK_OMEGA)) return false;
  return Math.abs(info.r || 0) >= EASY_TURTLE_STICK || Math.abs(info.p || 0) >= EASY_TURTLE_STICK;
}

// ---- The first-flight card ----
// On the first arm attempt: FIRST_FLIGHT_TEXT, over the flight, not pausing
// it. Once per profile for each kind of input (the keyboard, touch sticks, a
// controller): a pilot who learned the keys and then plugs in a radio is on a
// first flight again, and the radio's first throttle-up gets the card. And
// once per profile, for a pilot with no controller (none detected after
// FIRST_FLIGHT_KEYS_AFTER_S of the flying page, and no touch sticks) who has
// not armed yet: the keyboard layout, as an image under the same line. Either
// goes on any stick or key, once it has been up long enough to read
// (FIRST_FLIGHT_MIN_S: the stick that raised it is still moving).
export const FIRST_FLIGHT_KEY = 'quadmathSimFirstFlight';
export const FIRST_FLIGHT_TEXT = 'Throttle up to fly · Full stick to flip back over · Esc for menu';
export const FIRST_FLIGHT_KEYS_IMG = 'assets/sim-ui/keyboard-layout.svg';
export const FIRST_FLIGHT_KEYS_ALT = 'Keyboard: W and S throttle, A and D yaw, up and down arrows pitch, left and right arrows roll, Space arm or disarm, R respawn, P new pack, Esc menu.';
// The card's second line: a new pack when the battery runs low (sim.html
// newPack), as the input that flies gets one.
export const FIRST_FLIGHT_PACK_TEXT = Object.freeze({
  keyboard: 'Battery low? P = new pack',
  touch: 'Battery low? Tap NEW PACK',
  controller: 'Battery low? P, or MENU then New pack',
});
export const FIRST_FLIGHT_KEYS_AFTER_S = 3;
export const FIRST_FLIGHT_MIN_S = 2.5;
const FIRST_FLIGHT_STICK = 0.2;

// What this profile has been shown: the keyboard layout (keys), and the card
// on each kind of input. { keys, keyboard, touch, controller }, stored as a list.
export const FIRST_FLIGHT_SEEN = ['keys', 'keyboard', 'touch', 'controller'];

// The input a pilot is on: a controller over touch sticks, else the keyboard.
export function firstFlightInput(info) {
  return info && info.controller ? 'controller' : (info && info.touch ? 'touch' : 'keyboard');
}

export function loadFirstFlight(storage) {
  const store = fovStore(storage);
  let raw = '';
  try { raw = (store && store.getItem(FIRST_FLIGHT_KEY)) || ''; } catch (e) { /* ignore */ }
  const parts = String(raw).split(',');
  const seen = {};
  for (const k of FIRST_FLIGHT_SEEN) seen[k] = parts.includes(k);
  return seen;
}

export function saveFirstFlight(seen, storage) {
  const store = fovStore(storage);
  const parts = FIRST_FLIGHT_SEEN.filter((k) => seen && seen[k]);
  try { if (store) store.setItem(FIRST_FLIGHT_KEY, parts.join(',')); } catch (e) { /* ignore quota / private mode */ }
}

// One sample of the flying page (not paused). state: {} to start. sample: dt
// (s), seen (as loadFirstFlight), attempt (an arm attempt in this sample),
// armed, controller (a gamepad or radio is connected), touch (touch sticks, or
// a phone), stick { r, p, y, t }, key (a key went down since the last sample),
// keysAtOnce (the pilot chose Fly with keyboard: the keyboard layout from the
// first sample, not after FIRST_FLIGHT_KEYS_AFTER_S, and no key or stick takes
// it away until FIRST_FLIGHT_MIN_S after the first arm, so the W that arms
// leaves it up).
// Returns the next state, the card on screen (null, 'card' or 'keys'), seen,
// and changed: seen is to be saved.
export function stepFirstFlight(state, sample) {
  const s = sample || {};
  const was = state || {};
  const dt = Number.isFinite(s.dt) && s.dt > 0 ? s.dt : 0;
  const seen = {};
  for (const k of FIRST_FLIGHT_SEEN) seen[k] = !!(s.seen && s.seen[k]);
  const st = { liveS: (+was.liveS || 0) + dt, show: was.show || null, shownS: +was.shownS || 0, base: was.base || null, input: !!was.input, armedS: +was.armedS || 0 };
  const stick = s.stick || {};
  const at = (k) => +stick[k] || 0;
  if (st.show) {
    st.shownS += dt;
    if (s.armed) st.armedS += dt;
    const moved = ['r', 'p', 'y', 't'].some((k) => Math.abs(at(k) - (+st.base[k] || 0)) >= FIRST_FLIGHT_STICK);
    const counts = !(st.show === 'keys' && s.keysAtOnce) || st.armedS >= FIRST_FLIGHT_MIN_S - 1e-9;
    if (((s.key || moved) && counts) || (st.show === 'keys' && s.controller)) st.input = true;
    if (st.input && st.shownS >= FIRST_FLIGHT_MIN_S - 1e-9) st.show = null;
    return { state: st, show: st.show, seen, changed: false };
  }
  const open = (kind) => {
    st.show = kind;
    st.shownS = 0;
    st.input = false;
    st.armedS = 0;
    st.base = { r: at('r'), p: at('p'), y: at('y'), t: at('t') };
  };
  const input = firstFlightInput(s);
  let changed = false;
  if (s.keysAtOnce && input === 'keyboard' && !seen.keys && !s.armed) {
    // Fly with keyboard chosen: the layout from the first sample. It carries
    // the card's line, so the keyboard's card is used up with it.
    seen.keys = true;
    seen.keyboard = true;
    changed = true;
    open('keys');
  } else if (s.attempt && !seen[input]) {
    seen[input] = true;
    changed = true;
    // After the keyboard layout, which carries the same line, an arm on the
    // keys needs no second card. That uses up the keyboard's card only.
    if (!(input === 'keyboard' && seen.keys)) open('card');
  } else if (input === 'keyboard' && !seen.keys && st.liveS >= FIRST_FLIGHT_KEYS_AFTER_S - 1e-9) {
    seen.keys = true;
    changed = true;
    // Armed already: flying on the keys, no layout needed.
    if (!s.armed) open('keys');
  }
  return { state: st, show: st.show, seen, changed };
}

// East of the default spawn, facing +Z (away from the afternoon sun) so the
// hover column and gates are readable. Independent of racing gate coordinates.
const TUTORIAL_ORIGIN = { x: 36, y: 0, z: 44 };
const TUTORIAL_YAW = Math.PI;
const TUTORIAL_STEPS = ['arm', 'hover', 'gate1', 'gate2', 'gate3', 'land', 'done'];

function stepCopy(step) {
  switch (step) {
    case 'arm': return 'Throttle down, then up to arm. Or press Space.';
    case 'hover': return 'Hover in the glow — hold altitude for a moment.';
    case 'gate1': return 'Fly through the first marked gate.';
    case 'gate2': return 'Second gate — keep it smooth.';
    case 'gate3': return 'Last gate, then the pad.';
    case 'land': return 'Land on the pad (low and slow).';
    case 'done': return 'Nice. You can fly a real lap now.';
    default: return '';
  }
}

// ---------- The stick overlay (HUD) ----------
// The two sticks the core flies on, drawn small: Mode 2, the left box yaw (x)
// and throttle (y), the right box roll (x) and pitch (y). The page hands draw()
// its merged `stick` (sim.html readInput: axis map, calibration and deadband
// done, rates not yet applied), the values every input path (radio, gamepad,
// keyboard, touch) gives the core. Never a pad's raw axes.
//
// One 2D canvas, position:fixed, pointer-events:none. The frame loop calls
// draw(), which repaints only when a dot moved and writes no DOM style, so a
// frame costs no layout. place() sizes and positions it (and the page reads
// the touch sticks' boxes for it): on a resize or a touch-stick change only.
//
// quadmathSimStickOverlay: '1' on, '0' off. Absent: the input's default
// (stickOverlayDefault).
export const STICK_OVERLAY_KEY = 'quadmathSimStickOverlay';
// A box's side in CSS px: desktop, and a phone (STICK_OVERLAY_PHONE, the
// page's own phone breakpoints).
export const STICK_BOX_PX = 72;
export const STICK_BOX_PHONE_PX = 56;
export const STICK_OVERLAY_PHONE = '(max-width:559px),(max-height:500px)';
// Between the two boxes.
export const STICK_GAP_PX = 8;
// The overlay's bottom edge: above the bottom-centre throttle readout (#osdBC,
// 18 px up), which is three lines on the bf core while it refuses to arm.
export const STICK_OVERLAY_BOTTOM_PX = 72;
// Clear space kept around whatever it must not cover.
export const STICK_CLEAR_PX = 12;
// The site's colours: #0D0E12 at 55%, the green dot. The border is the page's
// --line (the page reads it and passes it in); this is its value in sim.html.
export const STICK_BG = 'rgba(13,14,18,.55)';
export const STICK_DOT = '#3DDC97';
export const STICK_LINE = 'rgba(255,255,255,.12)';

function overlayStore(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch (e) { return null; }
}

// The saved choice: true, false, or null when the pilot never chose.
export function loadStickOverlay(storage) {
  const store = overlayStore(storage);
  if (!store) return null;
  try {
    const v = store.getItem(STICK_OVERLAY_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch (e) { return null; }
}

export function saveStickOverlay(on, storage) {
  const store = overlayStore(storage);
  if (!store) return false;
  try { store.setItem(STICK_OVERLAY_KEY, on ? '1' : '0'); return true; }
  catch (e) { return false; }
}

// kind: 'keyboard' | 'touch' | 'radio' | 'gamepad'. On where there are no
// sticks in the pilot's hands to look at; off with a radio or a gamepad.
export function stickOverlayDefault(kind) {
  return kind === 'keyboard' || kind === 'touch';
}

// On or off: the saved choice, else the input's default.
export function stickOverlayOn(saved, kind) {
  return saved === true || saved === false ? saved : stickOverlayDefault(kind);
}

// ---------- Speed units ----------
// The one place a speed becomes text the pilot reads: the OSD's SPD line
// (sim.html updateOSD) and anything else the sim shows as a speed. Speeds
// come in as true m/s, the physics' own unit; the scene's world units (WS per
// metre) are divided out by the caller before it gets here.
//
// quadmathSimSpeedUnits: 'mph', 'kmh' or 'off' (Tune: Camera, Speed units).
// Absent, or anything else: the pilot never chose, and the units follow the
// browser (speedUnitsDefault). The default is never written back, so a pilot
// who never chose keeps following their browser's language.
export const SPEED_UNITS_KEY = 'quadmathSimSpeedUnits';
export const SPEED_UNITS = Object.freeze(['mph', 'kmh', 'off']);
// m/s to each unit: 3600 s an hour over 1609.344 m an international mile;
// 3.6 for km/h.
export const SPEED_UNIT_FACTOR = Object.freeze({ mph: 3600 / 1609.344, kmh: 3.6 });
export const SPEED_UNIT_LABEL = Object.freeze({ mph: 'mph', kmh: 'km/h' });
// The OSD's number field: this many characters, right-aligned and capped at
// 999, so 9, 10 and 100 leave the unit where it was (the rule #fpsHud's rate
// follows). Shown with white-space: pre in a monospace font.
export const SPEED_FIELD_CHARS = 3;
const SPEED_FIELD_MAX = 999;

// mph where the browser's language is US English (navigator.language
// 'en-US', any case); km/h everywhere else, en-GB and a bare 'en' included.
export function speedUnitsDefault(lang) {
  return typeof lang === 'string' && lang.toLowerCase() === 'en-us' ? 'mph' : 'kmh';
}

// The saved choice: 'mph', 'kmh', 'off', or null when the pilot never chose.
export function loadSpeedUnits(storage) {
  const store = overlayStore(storage);
  if (!store) return null;
  try {
    const v = store.getItem(SPEED_UNITS_KEY);
    return SPEED_UNITS.includes(v) ? v : null;
  } catch (e) { return null; }
}

// Writes only one of SPEED_UNITS; anything else is refused (false).
export function saveSpeedUnits(units, storage) {
  if (!SPEED_UNITS.includes(units)) return false;
  const store = overlayStore(storage);
  if (!store) return false;
  try { store.setItem(SPEED_UNITS_KEY, units); return true; }
  catch (e) { return false; }
}

// The units in force: the saved choice, else the language's default.
export function speedUnitsOn(saved, lang) {
  return SPEED_UNITS.includes(saved) ? saved : speedUnitsDefault(lang);
}

// A speed in m/s as the pilot reads it: '9 mph', '35 km/h', or null for
// 'off' (and for anything that is not one of SPEED_UNITS). Whole units,
// rounded; a speed that is not a finite number reads 0. { field: true } pads
// the number to SPEED_FIELD_CHARS, right-aligned and capped at 999 ('  9 mph').
export function speedText(ms, units, opts) {
  if (units !== 'mph' && units !== 'kmh') return null;   // off, or not a unit
  const k = SPEED_UNIT_FACTOR[units];
  const v = Number(ms);
  const n = Math.round(Math.abs(Number.isFinite(v) ? v : 0) * k);
  const s = opts && opts.field ? String(Math.min(n, SPEED_FIELD_MAX)).padStart(SPEED_FIELD_CHARS, ' ') : String(n);
  return s + ' ' + SPEED_UNIT_LABEL[units];
}

function clampAxis(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < lo ? lo : n > hi ? hi : n;
}

// A dot's radius in CSS px for a box of side box.
export function stickDotRadius(box) {
  return Math.max(3, Math.round(box * 0.14) / 2);
}

// The two dots' centres in CSS px, each in its own box's coordinates
// (0..box), for the sticks s {r, p, y in -1..1; t in 0..1}. Mode 2: left x
// yaw, left y throttle (0 at the bottom), right x roll, right y pitch (+1 at
// the top). In 3D the throttle's 0.5 (no thrust) is the box's middle, where it
// is on the stick.
export function stickDots(s, box) {
  const st = s || {};
  const pad = stickDotRadius(box) + 2;
  const span = box - 2 * pad;
  const across = (v) => pad + (clampAxis(v, -1, 1) + 1) / 2 * span;
  return {
    l: { x: across(st.y), y: pad + (1 - clampAxis(st.t, 0, 1)) * span },
    r: { x: across(st.r), y: pad + (1 - clampAxis(st.p, -1, 1)) / 2 * span },
  };
}

// Where the overlay goes, in CSS px: {left, bottom, w, h}, left from the
// viewport's left edge and bottom from its bottom edge. sticks and avoid are
// boxes it must not cover, in viewport coordinates {left, right, top,
// bottom}: the touch sticks, and the HUD beside it (the key legend, the
// #feelHud card). STICK_OVERLAY_BOTTOM_PX up: centred when that clears every
// box by STICK_CLEAR_PX, else the nearest spot along that line that does; with
// none, centred and up above the boxes under it, as far as it takes. Never off
// screen; over a box only when the screen is too small to miss it.
// readout: #osdBC's box, where it sits higher than STICK_OVERLAY_BOTTOM_PX
// allows for (flying on touch it sits on the page's footer, one to four lines
// tall): the overlay's line rises with it, and so does everything above.
export function stickOverlayPlacement({ vw, vh: screenH, box, sticks, avoid, readout } = {}) {
  const lift = readout && readout.bottom > readout.top
    ? Math.max(0, Math.round(screenH - readout.top) - STICK_OVERLAY_BOTTOM_PX) : 0;
  const vh = screenH - lift;
  const w = box * 2 + STICK_GAP_PX, h = box;
  const C = STICK_CLEAR_PX;
  const list = [...(sticks || []), ...(avoid || [])].filter((b) => b && b.right > b.left && b.bottom > b.top);
  const maxLeft = Math.max(0, vw - w - 8);
  const atX = (x) => Math.round(Math.max(Math.min(8, maxLeft), Math.min(x, maxLeft)));
  const beside = (x, b) => x >= b.right + C || x + w <= b.left - C;
  const clears = (x, bot) => {
    const top = vh - bot - h, under = vh - bot;
    return list.every((b) => beside(x, b) || top >= b.bottom + C || under <= b.top - C);
  };
  const centre = atX((vw - w) / 2);
  const xs = [centre];
  for (const b of list) xs.push(atX(b.right + C), atX(b.left - C - w));
  xs.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
  let left = xs.find((x) => clears(x, STICK_OVERLAY_BOTTOM_PX));
  let bottom = STICK_OVERLAY_BOTTOM_PX;
  if (left === undefined) {
    left = centre;
    // Up past each box in its column, the lowest first, until it clears.
    const tops = list.filter((b) => !beside(left, b)).map((b) => b.top).sort((a, b) => b - a);
    for (const top of tops) {
      bottom = Math.max(bottom, Math.round(vh - top + C));
      if (clears(left, bottom)) break;
    }
  }
  bottom = Math.max(0, Math.min(bottom, vh - h - 8));
  return { left, bottom: bottom + lift, w, h };
}

// The overlay on canvas (an HTMLCanvasElement; null draws nothing). Returns
// { place(opts), draw(stick), setShown(on), state }.
//   place({vw, vh, phone, sticks, avoid, readout, dpr}): size and position.
//   draw(stick): repaint if a dot moved since the last paint; true if it did.
//   setShown(on): the canvas's 'on' class, written only when it changes.
export function createStickOverlay(canvas, { lineColor } = {}) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const line = lineColor || STICK_LINE;
  let box = STICK_BOX_PX;
  let dpr = 1;
  let shown = false;
  let key = '';
  let draws = 0;
  let dots = null;
  let drawn = null;
  let placed = null;

  function place({ vw, vh, phone, sticks, avoid, readout, dpr: ratio } = {}) {
    box = phone ? STICK_BOX_PHONE_PX : STICK_BOX_PX;
    dpr = Math.max(1, Math.min(3, Number(ratio) || 1));
    placed = stickOverlayPlacement({ vw, vh, box, sticks, avoid, readout });
    if (canvas) {
      const bw = Math.round(placed.w * dpr), bh = Math.round(placed.h * dpr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      const st = canvas.style;
      if (st) {
        st.width = placed.w + 'px';
        st.height = placed.h + 'px';
        st.left = placed.left + 'px';
        st.bottom = placed.bottom + 'px';
      }
    }
    key = ''; // a resized canvas is blank: the next draw paints
    return placed;
  }

  function paintBox(ox, dot) {
    const r = Math.max(4, Math.round(box * 0.14));
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(ox + 0.5, 0.5, box - 1, box - 1, r);
    else ctx.rect(ox + 0.5, 0.5, box - 1, box - 1);
    ctx.fillStyle = STICK_BG;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = line;
    ctx.stroke();
    // The centre, faint: where a sprung stick rests.
    const c = box / 2;
    ctx.beginPath();
    ctx.moveTo(ox + c, c - 4); ctx.lineTo(ox + c, c + 4);
    ctx.moveTo(ox + c - 4, c); ctx.lineTo(ox + c + 4, c);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox + dot.x, dot.y, stickDotRadius(box), 0, Math.PI * 2);
    ctx.fillStyle = STICK_DOT;
    ctx.fill();
  }

  function draw(s) {
    const st = s || {};
    const d = stickDots(st, box);
    // Quarter-pixel steps: a dot that has not visibly moved is not repainted.
    const q = (v) => Math.round(v * 4);
    const k = box + ':' + q(d.l.x) + ',' + q(d.l.y) + ',' + q(d.r.x) + ',' + q(d.r.y);
    if (k === key) return false;
    key = k;
    dots = d;
    drawn = { r: +st.r || 0, p: +st.p || 0, y: +st.y || 0, t: +st.t || 0 };
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box * 2 + STICK_GAP_PX, box);
    paintBox(0, d.l);
    paintBox(box + STICK_GAP_PX, d.r);
    draws++;
    return true;
  }

  function setShown(on) {
    const v = !!on;
    if (v === shown) return;
    shown = v;
    if (canvas && canvas.classList) canvas.classList.toggle('on', v);
  }

  return {
    place,
    draw,
    setShown,
    // Test hook: what is on the canvas now. dots in box coordinates, drawn the
    // stick values of the last paint.
    get state() { return { shown, box, dpr, draws, dots, drawn, placed }; },
  };
}

export function createFeel(ctx) {
  const {
    THREE, scene, toast, decorateGate, LIGHTING,
    onCalibrate, onKeyboard, onTouch, onRadio, onTryLap, onSkipTutorial, onToggleAcro, onToggleThreeD,
  } = ctx;

  let hudVisible = true;
  let promptOpen = false;
  let tutorial = null; // { group, gates, pad, hover, step, tHover, tLand, startedAt }
  let flippedToastAt = 0;
  let stuckHoldS = 0;

  const hudEl = document.getElementById('feelHud');
  const promptEl = document.getElementById('feelPrompt');
  const tutEl = document.getElementById('feelTutorial');
  const tutMsg = document.getElementById('feelTutMsg');
  const hudThr = document.getElementById('hudThr');
  const hudBatt = document.getElementById('hudBatt');
  const hudMode = document.getElementById('hudMode');
  const hudArm = document.getElementById('hudArm');
  const hudQuad = document.getElementById('hudQuad');

  function setHudVisible(v) {
    hudVisible = !!v;
    if (hudEl) hudEl.classList.toggle('hide', !hudVisible);
    return hudVisible;
  }
  setHudVisible(true);
  const hudAcroBtn = document.getElementById('hudAcro');
  if (hudAcroBtn) {
    hudAcroBtn.onclick = function (e) {
      e.preventDefault();
      if (onToggleAcro) onToggleAcro();
    };
  }
  const hud3dBtn = document.getElementById('hud3d');
  if (hud3dBtn) {
    hud3dBtn.onclick = function (e) {
      e.preventDefault();
      if (onToggleThreeD) onToggleThreeD();
    };
  }

  function updateHud(s) {
    if (!hudEl || !hudVisible) return;
    // The sticks themselves are the stick overlay's (createStickOverlay).
    const st = s.stick || { r: 0, p: 0, y: 0, t: 0 };
    // The quad that flies (sim.html flyingQuadName): AIR65, FRACTAL75, 85 CLASSIC.
    if (hudQuad && s.quad != null && hudQuad.textContent !== s.quad) hudQuad.textContent = s.quad;
    if (hudThr) {
      if (s.thrText) hudThr.textContent = s.thrText;
      else hudThr.textContent = 'THR ' + ((st.t * 100) | 0) + '%';
    }
    if (hudBatt) {
      hudBatt.textContent = s.battOn ? ('BATT ' + Number(s.battV).toFixed(2) + 'V') : 'BATT OFF';
    }
    if (hudMode) hudMode.textContent = String(s.mode || 'ANGLE').toUpperCase();
    if (hudArm) {
      const on = !!s.armed;
      hudArm.textContent = on ? 'ARMED' : 'DISARMED';
      hudArm.classList.toggle('on', on);
    }
    const hint = document.getElementById('hudArmHint');
    if (hint) {
      const text = s.armed ? '' : (s.armHint || 'Raise throttle to fly (auto-arm)');
      hint.textContent = text;
      hint.classList.toggle('show', !s.armed && !!text);
    }
    const acro = document.getElementById('hudAcro');
    if (acro) {
      const mode = String(s.mode || 'angle').toLowerCase();
      acro.textContent = mode === 'acro' ? 'ANGLE' : 'ACRO';
      acro.classList.toggle('on', mode === 'acro');
    }
    const hud3d = document.getElementById('hud3d');
    if (hud3d) {
      const on = !!s.threeD;
      hud3d.textContent = '3D';
      hud3d.classList.toggle('on', on);
      hud3d.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function hideFirstRun() {
    promptOpen = false;
    if (promptEl) {
      promptEl.classList.remove('show');
      promptEl.setAttribute('aria-hidden', 'true');
    }
  }

  // Text into the prompt's markup: the five characters markup is made of (as
  // sim-retention.js escapeHtml, which this module does not import).
  function escText(raw) {
    return String(raw == null ? '' : raw)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showFirstRun(info) {
    if (!promptEl) return;
    promptOpen = true;
    const has = !!(info && info.hasGamepad);
    const mobile = !!(info && info.mobile);
    const touchy = !!(info && (info.touch || info.mobile));
    // The controller's name is the device's own text, handed over as written:
    // escaped here, where it becomes markup.
    const name = (info && info.gpName) ? escText(String(info.gpName).slice(0, 48)) : '';
    const title = has ? 'Controller / radio detected' : 'No controller';
    const lead = has
      ? (name ? name : 'Gamepad connected') + ' — one click on Radio and you are flying. Mode 2 AETR is already loaded. Calibrate only if a stick is wrong. Touch sticks stay off while a radio is connected.'
      : (mobile
        ? 'Fly with on-screen sticks, or plug in a radio (Joystick mode) and wiggle a stick.'
        : 'Fly with the keyboard, or plug in a radio (Joystick mode) and wiggle a stick.');
    // Hide keyboard only on real phones (detectMobile). Chrome desktop
    // ontouchstart / maxTouchPoints must not hide Radio/Keyboard for a TX16S.
    const kbBtn = touchy && mobile ? '' : '<button type="button" id="feelKeys">Fly with keyboard</button>';
    const touchHtml = has
      ? '<button type="button" id="feelTouch">Touch sticks</button>'
      : (mobile
        ? '<button type="button" class="primary" id="feelTouch">Touch sticks</button>'
        : '<button type="button" id="feelTouch">Touch sticks</button>');
    const buttons = has
      ? '<button type="button" class="primary" id="feelRadio">Radio</button>' +
        '<button type="button" id="feelCalib">Calibrate</button>' +
        kbBtn +
        touchHtml
      : (mobile
        ? touchHtml + kbBtn
        : '<button type="button" class="primary" id="feelKeys">Fly with keyboard</button>' + touchHtml) +
        '<p class="menu-lead" style="margin-top:10px">TX16S: USB Joystick, then wiggle. Radio is plug-and-fly (Mode 2). Calibrate is optional.</p>';
    promptEl.innerHTML =
      '<div class="menu-card feel-card">' +
        '<div class="menu-brand">QuadMath</div>' +
        '<h1>' + title + '</h1>' +
        '<p class="menu-lead">' + lead + '</p>' +
        buttons +
      '</div>';
    promptEl.classList.add('show');
    promptEl.setAttribute('aria-hidden', 'false');
    const kb = document.getElementById('feelKeys');
    if (kb) kb.onclick = function () {
      saveInputChoice('keyboard');
      hideFirstRun();
      if (onKeyboard) onKeyboard();
    };
    // No controller on a computer: Fly with keyboard is the card's first
    // button, and has the focus, so Enter takes it with no mouse.
    if (kb && !has && !mobile) { try { kb.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    const touchBtn = document.getElementById('feelTouch');
    if (touchBtn) touchBtn.onclick = function () {
      saveInputChoice('touch');
      hideFirstRun();
      if (onTouch) onTouch();
    };
    const radioBtn = document.getElementById('feelRadio');
    if (radioBtn) radioBtn.onclick = function () {
      saveInputChoice('radio');
      hideFirstRun();
      if (onRadio) onRadio();
    };
    const cal = document.getElementById('feelCalib');
    if (cal) cal.onclick = function () {
      saveInputChoice('calibrate');
      hideFirstRun();
      if (onCalibrate) onCalibrate();
    };
  }

  function maybeFirstRun(info) {
    if (loadInputChoice()) return false;
    const hasPad = !!(info && info.hasGamepad);
    const touchy = !!(info && (info.touch || info.mobile));
    if (touchy && !hasPad) {
      // Auto-touch only when detectMobile said so. Chrome on Windows exposes
      // ontouchstart / maxTouchPoints on a desktop — that must not steal a TX16S.
      if (info && info.mobile) {
        saveInputChoice('touch');
        if (onTouch) onTouch();
        return false;
      }
    }
    showFirstRun(info || { hasGamepad: false });
    return true;
  }

  function onGamepadConnected(info) {
    showFirstRun({
      hasGamepad: true,
      gpName: info && info.gpName,
      mobile: info && info.mobile,
      touch: info && info.touch,
    });
  }

  function clearTutorialScene() {
    if (!tutorial) return;
    if (tutorial.group && tutorial.group.parent) tutorial.group.parent.remove(tutorial.group);
    tutorial = null;
  }

  function makeGate(x, y, z, ry, size, col) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(size, size * 0.08, 8, 28),
      new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: (LIGHTING && LIGHTING.gateEmissive) || 3, roughness: 0.4,
      })
    );
    ring.position.set(x, y, z);
    ring.rotation.y = ry || 0;
    if (decorateGate) decorateGate(THREE, ring, size, col);
    return { mesh: ring, pos: new THREE.Vector3(x, y, z), r: size * 0.9 };
  }

  function buildTutorial() {
    clearTutorialScene();
    const group = new THREE.Group();
    group.name = 'm1Tutorial';
    const o = TUTORIAL_ORIGIN;
    const hover = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 5.5, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x3DDC97, emissive: 0x3DDC97, emissiveIntensity: 1.2,
        transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    hover.position.set(o.x, 3.2, o.z);
    group.add(hover);

    const g1 = makeGate(o.x, 3.2, o.z + 14, Math.PI, 2.6, 0xFF4D1A);
    const g2 = makeGate(o.x - 8, 3.4, o.z + 26, Math.PI - 0.4, 2.6, 0x3DDC97);
    const g3 = makeGate(o.x, 3.2, o.z + 38, Math.PI, 2.6, 0xFF4D1A);
    group.add(g1.mesh, g2.mesh, g3.mesh);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.12, 28),
      new THREE.MeshStandardMaterial({
        color: 0x3DDC97, emissive: 0x3DDC97, emissiveIntensity: 1.8, roughness: 0.5,
      })
    );
    pad.position.set(o.x, 0.08, o.z + 50);
    group.add(pad);

    const label = function (text, pos) {
      const spr = makeWorldLabel(THREE, text, {
        font: '700 36px Inter, system-ui, sans-serif',
        fill: '#E8E9ED',
        glow: '#E8E9ED',
        strokeWidth: 6,
        scale: [8, 2],
      });
      spr.position.copy(pos); spr.position.y += 4;
      group.add(spr);
    };
    label('HOVER', hover.position);
    label('LAND', pad.position);

    scene.add(group);
    tutorial = {
      group, hover,
      gates: [g1, g2, g3],
      pad,
      padPos: pad.position.clone(),
      hoverPos: hover.position.clone(),
      spawn: new THREE.Vector3(o.x, 0.2, o.z - 8),
      spawnYaw: TUTORIAL_YAW,
      step: 'arm',
      tHover: 0,
      tLand: 0,
      startedAt: performance.now(),
      passed: [false, false, false],
    };
  }

  function setTutUI() {
    if (!tutEl) return;
    const active = !!tutorial;
    tutEl.classList.toggle('show', active);
    if (!active) return;
    if (tutMsg) tutMsg.textContent = stepCopy(tutorial.step);
    const skip = document.getElementById('feelTutSkip');
    const lap = document.getElementById('feelTutLap');
    if (skip) skip.style.display = tutorial.step === 'done' ? 'none' : '';
    if (lap) lap.style.display = tutorial.step === 'done' ? '' : 'none';
  }

  function startTutorial() {
    buildTutorial();
    setTutUI();
    if (toast) toast('TUTORIAL — SPACE TO ARM');
    return spawnForTutorial();
  }

  function skipTutorial() {
    clearTutorialScene();
    setTutUI();
    if (onSkipTutorial) onSkipTutorial();
  }

  function finishTutorial() {
    if (!tutorial) return;
    tutorial.step = 'done';
    setTutUI();
  }

  function pulseTarget(now) {
    if (!tutorial) return;
    const s = 1 + 0.06 * Math.sin(now * 0.008);
    tutorial.hover.scale.set(1, 1, 1);
    tutorial.gates.forEach((g) => g.mesh.scale.setScalar(1));
    tutorial.pad.scale.set(1, 1, 1);
    if (tutorial.step === 'hover') tutorial.hover.scale.set(s, 1, s);
    else if (tutorial.step === 'gate1') tutorial.gates[0].mesh.scale.setScalar(s);
    else if (tutorial.step === 'gate2') tutorial.gates[1].mesh.scale.setScalar(s);
    else if (tutorial.step === 'gate3') tutorial.gates[2].mesh.scale.setScalar(s);
    else if (tutorial.step === 'land') tutorial.pad.scale.set(s, 1, s);
  }

  function tickTutorial(state, dt, armed) {
    if (!tutorial || tutorial.step === 'done') {
      if (tutorial) pulseTarget(performance.now());
      return;
    }
    pulseTarget(performance.now());
    const pos = state.pos;
    if (tutorial.step === 'arm') {
      if (armed) { tutorial.step = 'hover'; tutorial.tHover = 0; setTutUI(); if (toast) toast('HOVER IN THE GLOW'); }
      return;
    }
    if (tutorial.step === 'hover') {
      const d = Math.hypot(pos.x - tutorial.hoverPos.x, pos.z - tutorial.hoverPos.z);
      const alt = pos.y;
      if (d < 3.2 && alt > 1.4 && alt < 6.5 && armed) tutorial.tHover += dt;
      else tutorial.tHover = Math.max(0, tutorial.tHover - dt * 0.5);
      if (tutorial.tHover > 1.4) { tutorial.step = 'gate1'; setTutUI(); if (toast) toast('GATE 1'); }
      return;
    }
    if (tutorial.step === 'gate1' || tutorial.step === 'gate2' || tutorial.step === 'gate3') {
      const idx = tutorial.step === 'gate1' ? 0 : tutorial.step === 'gate2' ? 1 : 2;
      const g = tutorial.gates[idx];
      if (pos.distanceTo(g.pos) < g.r) {
        tutorial.passed[idx] = true;
        if (idx === 0) { tutorial.step = 'gate2'; if (toast) toast('GATE 2'); }
        else if (idx === 1) { tutorial.step = 'gate3'; if (toast) toast('GATE 3'); }
        else { tutorial.step = 'land'; if (toast) toast('LAND ON THE PAD'); }
        setTutUI();
      }
      return;
    }
    if (tutorial.step === 'land') {
      const d = Math.hypot(pos.x - tutorial.padPos.x, pos.z - tutorial.padPos.z);
      const low = pos.y < 0.7;
      const idle = (state.stickT != null ? state.stickT : 0) < 0.14;
      if (d < 3.4 && low && idle) tutorial.tLand += dt;
      else tutorial.tLand = Math.max(0, tutorial.tLand - dt);
      if (tutorial.tLand > 0.7) finishTutorial();
    }
  }

  function spawnForTutorial() {
    const pos = tutorial
      ? tutorial.spawn.clone()
      : new THREE.Vector3(TUTORIAL_ORIGIN.x, 0.2, TUTORIAL_ORIGIN.z - 8);
    return { x: pos.x, y: pos.y, z: pos.z, yaw: (tutorial && tutorial.spawnYaw) || TUTORIAL_YAW };
  }

  // payload: the stuck test's fields, flipHintText's, and turtling (a turtle
  // under way: no hint).
  function noteFlip(info) {
    const payload = typeof info === 'boolean' ? { upsideDown: info } : (info || {});
    const dt = payload.dt == null ? 0 : +payload.dt;
    if (payload.turtling) {
      stuckHoldS = 0;
      return;
    }
    stuckHoldS = stepStuckHold(stuckHoldS, payload, dt);
    if (!shouldToastFlip({ ...payload, heldS: stuckHoldS })) return;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    if (now - flippedToastAt < 2500) return;
    flippedToastAt = now;
    if (toast) toast(flipHintText(payload));
  }

  if (tutEl) {
    const skip = document.getElementById('feelTutSkip');
    const lap = document.getElementById('feelTutLap');
    if (skip) skip.onclick = function () { skipTutorial(); };
    if (lap) lap.onclick = function () {
      clearTutorialScene();
      setTutUI();
      if (onTryLap) onTryLap();
    };
  }

  function fillRatePresetSelect(sel) {
    if (!sel) return;
    sel.innerHTML = '<option value="">Rate preset…</option>';
    for (const [k, p] of Object.entries(RATE_PRESETS)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = p.label;
      sel.appendChild(o);
    }
  }

  return {
    INPUT_CHOICE_KEY,
    RATE_PRESETS,
    get hudVisible() { return hudVisible; },
    setHudVisible,
    toggleHud() { return setHudVisible(!hudVisible); },
    updateHud,
    get promptOpen() { return promptOpen; },
    showFirstRun,
    hideFirstRun,
    maybeFirstRun,
    onGamepadConnected,
    startTutorial,
    skipTutorial,
    tickTutorial,
    isTutorial() { return !!tutorial; },
    tutorialStep() { return tutorial ? tutorial.step : null; },
    spawnForTutorial,
    noteFlip,
    fillRatePresetSelect,
    applyRatePreset,
    loadInputChoice,
    saveInputChoice,
  };
}
