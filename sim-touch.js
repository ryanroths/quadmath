// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim W6 — touch sticks, mobile boot, default flight mode.
// Dual virtual sticks, deadzone/expo, angle-first newcomers, lazy-load hooks.
// Ideas only — nothing here is copied from WebFPV (GPL) or other simulators.
// New localStorage keys: quadmathSimTouch, quadmathSimFlightMode,
//   quadmathSimAutoArm, quadmathSimArm_<id>.
// Per-device radio keys (load/save only, never wipe other ryfly* data):
//   ryflyAxisMap_<id>, ryflyRadioPreset_<id>, ryflyGamepadId.
// Do not write old ryfly* keys (the global ryflyAxisMap / ryflyRadioPreset).

export const TOUCH_KEY = 'quadmathSimTouch';
export const FLIGHT_MODE_KEY = 'quadmathSimFlightMode';
export const AUTOARM_KEY = 'quadmathSimAutoArm';
export const ARM_SWITCH_PREFIX = 'quadmathSimArm_';
export const SWITCHES_PREFIX = 'quadmathSimSwitches_';
// Radio stick deadzone. EdgeTX already has its own deadband; this is a tiny
// extra hole that must rescale like touch ((abs-d)/(1-d)) or center reads
// as a notch. 0.02 is enough for HID noise without eating micro-corrections.
export const RADIO_DZ = 0.02;

export const DEFAULT_TOUCH = Object.freeze({
  mode: 2,
  size: 112,
  opacity: 0.70,
  deadzone: 0.08,
  expo: 0.25,
  thrSpring: false,
});

const SAVED_PREF_KEYS = Object.freeze([
  'ryflyRates',
  'ryflyRatesType',
  'ryflyDroneType',
  'ryflyCamCustom',
  'quadmathSimInputChoice',
  'quadmathSimQuality',
  'quadmathSimFlightMode',
  'quadmathSimTouch',
]);

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function bool(v, fb) {
  if (v === true || v === false) return v;
  return fb;
}

export function normalizeTouch(raw) {
  const src = raw && typeof raw === 'object' ? raw : DEFAULT_TOUCH;
  const mode = src.mode === 1 || src.mode === '1' ? 1 : 2;
  return {
    mode,
    size: clamp(src.size, 64, 180),
    opacity: clamp(src.opacity, 0.2, 1),
    deadzone: clamp(src.deadzone, 0, 0.4),
    expo: clamp(src.expo, 0, 0.8),
    thrSpring: bool(src.thrSpring, false),
  };
}

function storeOf(storage) {
  return storage || (typeof localStorage !== 'undefined' ? localStorage : null);
}

export function loadTouch(storage) {
  const store = storeOf(storage);
  if (!store) return normalizeTouch(DEFAULT_TOUCH);
  try {
    const raw = store.getItem(TOUCH_KEY);
    if (!raw) return normalizeTouch(DEFAULT_TOUCH);
    return normalizeTouch(JSON.parse(raw));
  } catch (e) { return normalizeTouch(DEFAULT_TOUCH); }
}

export function saveTouch(settings, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try { store.setItem(TOUCH_KEY, JSON.stringify(normalizeTouch(settings))); }
  catch (e) { /* ignore quota / private mode */ }
}

export function applyDeadzone(v, dz) {
  const x = clamp(v, -1, 1);
  const d = clamp(dz, 0, 0.95);
  const a = Math.abs(x);
  if (a <= d) return 0;
  return (x < 0 ? -1 : 1) * (a - d) / (1 - d);
}

export function applyExpo(v, expo) {
  const x = clamp(v, -1, 1);
  const e = clamp(expo, 0, 1);
  if (!e) return x;
  const absX = Math.abs(x);
  return x * Math.pow(absX, 3) * e + x * (1 - e);
}

export function shapeAxis(v, opts) {
  const o = opts || {};
  return applyExpo(applyDeadzone(v, o.deadzone || 0), o.expo || 0);
}

// left/right: {x, y} in -1..1, y+ is stick-up.
// Mode 2 (default): left = yaw/throttle, right = roll/pitch.
// Mode 1: left = yaw/pitch, right = roll/throttle.
export function mapStickAxes(left, right, mode) {
  const l = left || { x: 0, y: 0 };
  const r = right || { x: 0, y: 0 };
  const lx = clamp(l.x, -1, 1);
  const ly = clamp(l.y, -1, 1);
  const rx = clamp(r.x, -1, 1);
  const ry = clamp(r.y, -1, 1);
  if (mode === 1 || mode === '1') {
    return { r: rx, p: ly, y: lx, t: (ry + 1) / 2 };
  }
  return { r: rx, p: ry, y: lx, t: (ly + 1) / 2 };
}

export function pointerToStick(px, py, origin, radius) {
  const rad = Math.max(8, Number(radius) || 56);
  const ox = origin && Number.isFinite(origin.x) ? origin.x : 0;
  const oy = origin && Number.isFinite(origin.y) ? origin.y : 0;
  const dx = (px - ox) / rad;
  const dy = (oy - py) / rad;
  const mag = Math.hypot(dx, dy);
  if (mag <= 1) return { x: dx, y: dy };
  return { x: dx / mag, y: dy / mag };
}

export function releaseStick(prev, opts) {
  const o = opts || {};
  const p = prev || { x: 0, y: 0 };
  if (o.holdY) return { x: 0, y: clamp(p.y, -1, 1) };
  return { x: 0, y: 0 };
}

export function throttleFromStickY(y) {
  return clamp((Number(y) + 1) / 2, 0, 1);
}

export function detectMobile(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w) return false;
  try {
    const coarse = !!(w.matchMedia && w.matchMedia('(pointer: coarse)').matches);
    const nav = w.navigator || {};
    const touch = ('ontouchstart' in w) && (nav.maxTouchPoints > 0);
    const screen = w.screen || {};
    const small = Math.min(screen.width || 0, screen.height || 0) < 768;
    const uaPhone = /iphone|ipod|android.+mobile/i.test(String(nav.userAgent || ''));
    return !!((coarse || uaPhone) && (touch || small));
  } catch (e) { return false; }
}

// WebGL UNMASKED_RENDERER string -> 'low' | 'med' | 'high' | null (unknown).
// Safari masks every Apple chip as "Apple GPU"; treat it as M-series (Auto
// steps down if it is an old Intel Mac).
export function gpuTier(info) {
  const s = String(info || '').toLowerCase();
  if (!s) return null;
  if (/swiftshader|llvmpipe|softpipe|software|virtualbox|microsoft basic/.test(s)) return 'low';
  if (/apple m\d|apple gpu/.test(s)) return 'high';
  if (/nvidia|geforce|quadro|radeon|\bamd\b/.test(s)) return 'high';
  if (/intel/.test(s)) return /\bxe\b|\barc\b/.test(s) ? 'med' : 'low';
  const adreno = s.match(/adreno\D*(\d*)/);
  if (adreno) return /adreno\W*x\d/.test(s) || +adreno[1] >= 600 ? 'med' : 'low';
  if (/immortalis|mali-g(7[7-9]|[6-9]\d\d)\b/.test(s)) return 'med';
  if (/mali|powervr|videocore/.test(s)) return 'low';
  return null;
}

// Phones cap at med; unknown phone GPUs stay low.
export function resolveAutoQuality(info) {
  const i = info || {};
  const t = i.gpu || (i.gpuLow ? 'low' : i.gpuHigh ? 'high' : null);
  if (t === 'low') return 'low';
  if (i.mobile) return t ? 'med' : 'low';
  return t || 'med';
}

// Auto downgrade monitor. Feed real frame dt (ms) each frame; returns the
// level to step down to, or null. Frames that are steady (few >1.5x-median
// hitches) are display-paced (30 fps iOS Low Power, 50 Hz panels): those
// may drop high->med but never med->low unless below 24 fps. Jittery
// sub-55 fps means missed vsyncs (GPU-bound) and steps down a level.
export function autoQualityStep(s, dt, level) {
  if (!(dt > 0) || dt > 250) return null; // hidden tab / map-build stall
  const d = s.dts || (s.dts = []);
  d.push(dt);
  if (d.length > 90) d.shift();
  if (d.length < 30) return null;
  const med = d.slice().sort((a, b) => a - b)[d.length >> 1];
  let sum = 0, hitch = 0;
  for (const x of d) { sum += x; if (x > med * 1.5) hitch++; }
  const fps = 1000 * d.length / sum;
  const steady = hitch / d.length < 0.1;
  const bad = fps < 24 || (fps < 55 && (!steady || level === 'high'));
  s.lowMs = bad ? (s.lowMs || 0) + dt : 0;
  if (s.lowMs < 3000) return null;
  s.lowMs = 0;
  d.length = 0;
  return level === 'high' ? 'med' : level === 'med' ? 'low' : null;
}

export function hasSavedSettings(storage) {
  const store = storeOf(storage);
  if (!store) return false;
  try {
    for (const k of SAVED_PREF_KEYS) {
      const v = store.getItem(k);
      if (v != null && v !== '') return true;
    }
  } catch (e) { return false; }
  return false;
}

export function loadFlightMode(storage) {
  const store = storeOf(storage);
  if (!store) return null;
  try {
    const v = store.getItem(FLIGHT_MODE_KEY);
    if (v === 'angle' || v === 'horizon' || v === 'acro') return v;
  } catch (e) { /* ignore */ }
  return null;
}

export function saveFlightMode(mode, storage) {
  const store = storeOf(storage);
  if (!store) return;
  if (mode !== 'angle' && mode !== 'horizon' && mode !== 'acro') return;
  try { store.setItem(FLIGHT_MODE_KEY, mode); }
  catch (e) { /* ignore */ }
}

// No saved mode: Angle on the keyboard and touch, Acro on a pad (a radio or a
// gamepad: input 'pad'). A stored mode wins.
export function defaultFlightMode(storage, input) {
  return loadFlightMode(storage) || (input === 'pad' ? 'acro' : 'angle');
}

export function toggleAcro(current) {
  return current === 'acro' ? 'angle' : 'acro';
}

export function shouldEnableTouch(info) {
  const i = info || {};
  // A connected radio/gamepad always wins. Chrome on Windows often returns an
  // empty GamepadList for a still-plugged TX16S; those empty polls must not
  // fall through to on-screen sticks and scramble the channel map.
  if (i.gamepadConnected || i.hasGamepad || i.padLive) return false;
  if (i.inputChoice === 'touch') return true;
  if (i.inputChoice === 'keyboard') return false;
  // A remembered radio (or calibration) with no pad connected is not a pad:
  // the device's own default, touch on a phone, until one is plugged in.
  return !!i.mobile;
}

export function resolveInputSource(info) {
  const i = info || {};
  if (i.gamepadConnected || i.hasGamepad || i.padLive) return 'gamepad';
  if (i.touchEnabled) return 'touch';
  return 'keyboard';
}

export function shouldShowLandscape(info) {
  const i = info || {};
  if (!i.mobile && !i.touchEnabled) return false;
  const w = Number(i.width) || 0;
  const h = Number(i.height) || 0;
  if (w < 8 || h < 8) return false;
  return h > w * 1.05;
}

export function createTouchControls(ctx) {
  const {
    root, onArm, onMode, onRespawn, onChange, settings: initial,
  } = ctx || {};
  let settings = normalizeTouch(initial);
  let threeD = !!(ctx && ctx.threeD);
  const state = {
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
    active: { L: null, R: null },
    enabled: false,
  };

  function holdYFor(side) {
    if (settings.thrSpring) return false;
    if (settings.mode === 2) return side === 'L';
    return side === 'R';
  }

  // 2D throttle rests at the bottom (zero). 3D rests at center (zero thrust).
  // thrSpring already centers; 3D without spring still HOLDS last Y on release
  // (a 3D radio has a center detent, not a spring).
  function restY(side) {
    if (settings.thrSpring) return 0;
    if (holdYFor(side)) return threeD ? 0 : -1;
    return 0;
  }

  state.left.y = restY('L');
  state.right.y = restY('R');

  function shaped() {
    const dz = settings.deadzone;
    const expo = settings.expo;
    const L = {
      x: shapeAxis(state.left.x, { deadzone: dz, expo }),
      y: holdYFor('L')
        ? applyExpo(state.left.y, expo)
        : shapeAxis(state.left.y, { deadzone: dz, expo }),
    };
    const R = {
      x: shapeAxis(state.right.x, { deadzone: dz, expo }),
      y: holdYFor('R')
        ? applyExpo(state.right.y, expo)
        : shapeAxis(state.right.y, { deadzone: dz, expo }),
    };
    return mapStickAxes(L, R, settings.mode);
  }

  function emit() {
    if (onChange) onChange(shaped(), settings, state);
  }

  function setEnabled(v) {
    state.enabled = !!v;
    if (root) {
      root.hidden = !state.enabled;
      root.setAttribute('aria-hidden', state.enabled ? 'false' : 'true');
      root.classList.toggle('on', state.enabled);
    }
    return state.enabled;
  }

  function applySettings(next) {
    settings = normalizeTouch(Object.assign({}, settings, next || {}));
    if (root) {
      root.style.setProperty('--stick-size', settings.size + 'px');
      root.style.setProperty('--stick-opacity', String(settings.opacity));
    }
    emit();
    return settings;
  }
  applySettings(settings);

  function snapIdleThrottle() {
    for (const side of ['L', 'R']) {
      if (!holdYFor(side)) continue;
      if (state.active[side] != null) continue;
      setStick(side, { y: restY(side) });
    }
  }

  function setThreeD(on) {
    threeD = !!on;
    snapIdleThrottle();
    paint();
    return threeD;
  }

  function setStick(side, next) {
    const cur = side === 'R' ? state.right : state.left;
    if (next.x != null) cur.x = clamp(next.x, -1, 1);
    if (next.y != null) cur.y = clamp(next.y, -1, 1);
    emit();
  }

  function padEl(side) {
    if (!root) return null;
    return root.querySelector(side === 'R' ? '[data-stick="R"]' : '[data-stick="L"]');
  }

  function originOf(side) {
    const el = padEl(side);
    if (!el) return { x: 0, y: 0, r: settings.size / 2 };
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.min(b.width, b.height) / 2 };
  }

  function paint() {
    if (!root) return;
    for (const side of ['L', 'R']) {
      const knob = root.querySelector('[data-stick="' + side + '"] i');
      if (!knob) continue;
      const s = side === 'R' ? state.right : state.left;
      knob.style.left = (50 + s.x * 38) + '%';
      knob.style.top = (50 - s.y * 38) + '%';
    }
  }

  function assignSide(x, width) {
    return x < width * 0.5 ? 'L' : 'R';
  }

  function onPointerDown(e) {
    if (!state.enabled || !root) return;
    if (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea,#feelHud,#osdLap,#gear')) return;
    const side = assignSide(e.clientX, (root.ownerDocument || document).documentElement.clientWidth);
    if (state.active[side] != null) return;
    state.active[side] = e.pointerId;
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const o = originOf(side);
    const s = pointerToStick(e.clientX, e.clientY, o, o.r);
    setStick(side, s);
    paint();
    if (e.cancelable) e.preventDefault();
  }

  function onPointerMove(e) {
    if (!state.enabled) return;
    for (const side of ['L', 'R']) {
      if (state.active[side] !== e.pointerId) continue;
      const o = originOf(side);
      setStick(side, pointerToStick(e.clientX, e.clientY, o, o.r));
      paint();
      if (e.cancelable) e.preventDefault();
    }
  }

  function onPointerUp(e) {
    for (const side of ['L', 'R']) {
      if (state.active[side] !== e.pointerId) continue;
      state.active[side] = null;
      const next = releaseStick(side === 'R' ? state.right : state.left, { holdY: holdYFor(side) });
      setStick(side, next);
      paint();
    }
  }

  if (root) {
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    const arm = root.querySelector('[data-touch="arm"]');
    const mode = root.querySelector('[data-touch="mode"]');
    const respawn = root.querySelector('[data-touch="respawn"]');
    if (arm) arm.addEventListener('click', function (e) { e.preventDefault(); if (onArm) onArm(); });
    if (mode) mode.addEventListener('click', function (e) { e.preventDefault(); if (onMode) onMode(); });
    if (respawn) respawn.addEventListener('click', function (e) { e.preventDefault(); if (onRespawn) onRespawn(); });
  }

  function read() { return shaped(); }

  function syncLandscape(info) {
    if (!root) return shouldShowLandscape(info);
    const show = shouldShowLandscape(info);
    const el = root.querySelector('[data-touch="landscape"]');
    if (el) el.hidden = !show;
    root.classList.toggle('portrait', show);
    return show;
  }

  emit();
  paint();

  return {
    setEnabled,
    applySettings,
    setThreeD,
    read,
    shaped,
    get settings() { return settings; },
    get state() { return state; },
    get threeD() { return threeD; },
    get enabled() { return state.enabled; },
    syncLandscape,
    paint,
    setStick,
  };
}

export function guardPageGestures(doc, opts) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return function () {};
  const o = opts || {};
  const allow = o.allowSelector || '#panel, #startMenu, #menuLayer, #feelPrompt, #calib, textarea, input, select';
  function block(e) {
    if (!e || !e.cancelable) return;
    const t = e.target;
    if (t && t.closest && t.closest(allow)) return;
    e.preventDefault();
  }
  d.addEventListener('touchmove', block, { passive: false });
  d.addEventListener('gesturestart', block, { passive: false });
  return function () {
    d.removeEventListener('touchmove', block);
    d.removeEventListener('gesturestart', block);
  };
}

// ---------- Radio / gamepad (TX16S, EdgeTX HID) ----------
// Per-device ryflyAxisMap_<id> / ryflyRadioPreset_<id> / ryflyGamepadId.
// Load and persist those; never wipe other ryfly* keys (rates, drone type, …).
export const AXIS_MAP_PREFIX = 'ryflyAxisMap_';
export const RADIO_PRESET_PREFIX = 'ryflyRadioPreset_';
export const GP_ID_KEY = 'ryflyGamepadId';

export function sanitizeId(id) {
  return String(id == null ? '' : id).replace(/[^a-z0-9]+/gi, '_').slice(0, 64);
}

function padId(gp) {
  return gp && gp.id != null ? String(gp.id) : '';
}

// Every EdgeTX and OpenTX radio enumerates as USB 1209:4F54 (pid.codes),
// whatever the model, so the USB numbers in the id name it even when the
// browser has no product name for it: Chrome "Unknown Gamepad (Vendor: 1209
// Product: 4f54)", Firefox "1209-4f54-…". Both numbers, never 1209 alone:
// other pid.codes devices share that vendor.
const EDGETX_USB_RE = /vendor:\s*0*1209\s+product:\s*0*4f54(?![0-9a-f])|(?:^|[^0-9a-f])0*1209[-:_ ]0*4f54(?![0-9a-f])|vid_1209&pid_4f54/i;
// EdgeTX/OpenTX radios by name, for a browser that shows a name only.
const EDGETX_NAME_RE = /edgetx|opentx|radiomaster|tx16|tx15|tx12|mt12|gx12|pocket|boxer|zorro|jumper|frsky|taranis/i;
// Radios on their own firmware.
const OTHER_RADIO_NAME_RE = /betafpv|literadio|flysky/i;

export function isEdgeTxUsb(gp) {
  return EDGETX_USB_RE.test(padId(gp));
}

// What the page calls a device: its id, except an EdgeTX radio the browser
// has no product name for ("Unknown Gamepad (Vendor: 1209 Product: 4f54)",
// "1209-4f54-Unknown Gamepad"), which is "EdgeTX radio". Display only.
export const EDGETX_UNNAMED = 'EdgeTX radio';
export function padDisplayName(id) {
  const s = id == null ? '' : String(id);
  if (!EDGETX_USB_RE.test(s)) return s;
  const m = /^(.*?)\s*\((?:STANDARD GAMEPAD\s*)?Vendor:/i.exec(s) || /^[0-9a-f]{1,4}-[0-9a-f]{1,4}-(.*)$/i.exec(s);
  const name = (m ? m[1] : s).trim();
  return !name || /^unknown(\s+(gamepad|device))?$/i.test(name) ? EDGETX_UNNAMED : s;
}

// A device the browser maps to the standard layout is a gamepad, whatever its
// name ("Retroid Pocket Controller" is a handheld). Chrome never maps
// 1209:4f54 to it, and a standard mapping always shows 4 axes, so it says
// nothing about Classic mode. By id alone, Chrome's "STANDARD GAMEPAD" tag.
function isStandardPad(gp) {
  return !!gp && (gp.mapping === 'standard' || /STANDARD GAMEPAD/i.test(padId(gp)));
}

export function isEdgeTxRadio(gp) {
  const id = padId(gp);
  return EDGETX_USB_RE.test(id) || (!isStandardPad(gp) && EDGETX_NAME_RE.test(id));
}

export function isRadio(gp) {
  return isEdgeTxRadio(gp) || (!isStandardPad(gp) && OTHER_RADIO_NAME_RE.test(padId(gp)));
}

// The stick axes a flyable device sends: roll, pitch, yaw and throttle.
export const STICK_AXES = 4;
// EdgeTX's Classic USB joystick sends 8 axes (CH1-8 as X, Y, Z, Rx, Ry, Rz,
// Slider, Dial) and 24 buttons. Browsers show fewer of them: Chrome and
// Firefox on Windows all 8, an OpenTX 2.3 radio 7 (it declares Slider twice),
// Safari and Firefox on macOS 6 (X to Rz only). So fewer than 6 is never
// Classic: Advanced mode (or its Gamepad / MultiAxis interface), whose
// channels are whatever the model sets, none at all until it sets them, and
// whose Sim controls (the throttle among them) Firefox drops and Chrome puts
// at the lowest free index.
export const EDGETX_CLASSIC_MIN_AXES = 6;
export const RADIO_CLASSIC_MSG = "Radio found, but throttle isn't coming through. On the radio: Model Settings → USB Joystick → Classic, then replug.";

function axisCount(gp) {
  const a = gp && gp.axes;
  return a && Number.isFinite(a.length) ? a.length : 0;
}

// A device nothing names as a radio, shaped like one: 6+ axes, a mapping that
// is not 'standard', some resting at -1 (a radio's throttle and switches; a
// gamepad's sticks rest at 0) and two or more off the rails (centred gimbals,
// not a dead interface that reads -1 everywhere).
export function looksLikeRadio(gp) {
  if (!gp || gp.mapping === 'standard') return false;
  const ax = gp.axes || [];
  if (ax.length < 6) return false;
  let low = 0, mid = 0;
  for (let i = 0; i < ax.length; i++) {
    const v = Number(ax[i]);
    if (!Number.isFinite(v)) continue;
    if (v <= -0.95) low++;
    else if (Math.abs(v) < 0.95) mid++;
  }
  return low >= 1 && mid >= 2;
}

// What the page makes of a device: a radio and how it knows (its USB id, its
// name, or its shape), an EdgeTX/OpenTX radio, enough stick axes to fly, and
// 'classic' when it is an EdgeTX radio sending fewer axes than Classic ever
// shows.
export function classifyPad(gp) {
  const n = axisCount(gp);
  const edgetx = isEdgeTxRadio(gp);
  const how = isEdgeTxUsb(gp) ? 'usb' : isRadio(gp) ? 'name' : looksLikeRadio(gp) ? 'shape' : null;
  return {
    radio: !!how,
    how,
    edgetx,
    axes: n,
    sticks: n >= STICK_AXES,
    issue: edgetx && !isStandardPad(gp) && n < EDGETX_CLASSIC_MIN_AXES ? 'classic' : null,
  };
}

export function radioScore(gp) {
  if (!gp) return 0;
  if (isEdgeTxUsb(gp)) return 2;
  if (isStandardPad(gp)) return 0;
  if (/tx16|tx15|tx12|mt12|gx12|zorro|boxer|pocket|edgetx|opentx|joystick|1209|radiomaster|frsky|taranis|jumper|betafpv|flysky/i.test(gp.id || '')) return 2;
  // A device only shaped like a radio ranks with the other unnamed ones, as
  // on main: a TX16S beside it still flies.
  if (gp.mapping === 'standard') return 0;
  return 1;
}

// Stick movement per device, from the polls the page makes. A device whose
// axes have never moved (a keyboard's gamepad interface, a headset with
// axes) is passed over while another can fly; one that stops moving while
// another moves has been put down.
export const PAD_MOVE_MIN = 0.2;     // this far off where it was first seen: it has moved
const PAD_MOVE_STEP = 0.05;          // this far off its last moving value: it is moving
export const PAD_STALE_MS = 4000;    // no movement this long: put down
export const PAD_MOVING_MS = 1000;   // moved PAD_MOVE_MIN this recently: in the pilot's hands

function padKey(gp) {
  return padId(gp) + '#' + (gp && Number.isFinite(gp.index) ? gp.index : -1);
}

function axisNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// Fed every input poll (4 ms), so it allocates only when a device appears or
// moves: one record per browser slot, reset when another id takes the slot.
export function createPadTracker() {
  const seen = new Map();
  const rec = (gp) => {
    const r = gp ? seen.get(gp.index) : null;
    return r && r.id === gp.id ? r : null;
  };
  return {
    see(pads, nowMs) {
      if (!pads) return;
      for (let k = 0; k < pads.length; k++) {
        const gp = pads[k];
        if (!gp || gp.connected === false) continue;
        const ax = gp.axes || [];
        const n = ax.length;
        const r = seen.get(gp.index);
        if (!r || r.id !== gp.id || r.n !== n) {
          const first = Array.from(ax, axisNum);
          seen.set(gp.index, { id: gp.id, n, first, anchor: first.slice(), big: first.slice(), seenAt: nowMs, moveAt: null, bigAt: null, moved: false });
          continue;
        }
        let step = false, big = false;
        for (let i = 0; i < n; i++) {
          const v = axisNum(ax[i]);
          if (!r.moved && Math.abs(v - r.first[i]) >= PAD_MOVE_MIN) r.moved = true;
          if (Math.abs(v - r.anchor[i]) >= PAD_MOVE_STEP) step = true;
          if (Math.abs(v - r.big[i]) >= PAD_MOVE_MIN) big = true;
        }
        if (step) {
          for (let i = 0; i < n; i++) r.anchor[i] = axisNum(ax[i]);
          r.moveAt = nowMs;
        }
        if (big) {
          for (let i = 0; i < n; i++) r.big[i] = axisNum(ax[i]);
          r.bigAt = nowMs;
        }
      }
    },
    moved(gp) { const r = rec(gp); return !!(r && r.moved); },
    // Its axes when the browser first showed it: what its kind is judged on.
    first(gp) { const r = rec(gp); return r ? r.first.slice() : null; },
    // It moved after it was picked: it was in the pilot's hands.
    movedSincePick(gp) {
      const r = rec(gp);
      return !!(r && r.moveAt != null && (r.pickedAt == null || r.moveAt > r.pickedAt));
    },
    // The pilot picked it (or the page did): idle from then, so the device
    // just picked is never taken for one put down.
    picked(gp, nowMs) {
      if (!rec(gp)) this.see([gp], nowMs);
      const r = rec(gp);
      if (r) r.pickedAt = nowMs;
    },
    idleMs(gp, nowMs) {
      const r = rec(gp);
      if (!r) return 0;
      const since = Math.max(r.moveAt != null ? r.moveAt : r.seenAt, r.pickedAt != null ? r.pickedAt : -Infinity);
      return nowMs - since;
    },
    // Moved PAD_MOVE_MIN within PAD_MOVING_MS: picked up, not a jitter.
    movingNow(gp, nowMs) {
      const r = rec(gp);
      return !!(r && r.bigAt != null && nowMs - r.bigAt < PAD_MOVING_MS);
    },
  };
}

// A device with sticks to fly: four axes or more. Never a headset, a media
// remote or a keyboard's gamepad interface with fewer.
export function usablePad(gp) {
  return !!gp && gp.connected !== false && classifyPad(gp).sticks;
}

// A device known to be a controller: a radio, a standard-mapped gamepad, or
// one whose axes have moved. Until then a device nothing names may be a
// keyboard's gamepad interface, whose axes never do.
export function provenPad(gp, tracker) {
  if (!gp) return false;
  if (classifyPad(gp).radio || gp.mapping === 'standard' || !tracker) return true;
  return tracker.moved(gp);
}

// The usable devices, radios first, in the browser's order among equals.
// Unproven ones only when nothing proven is there: alone, a device that has
// not moved yet may still be the pilot's.
export function rankPads(pads, tracker) {
  const live = (pads || []).filter(usablePad);
  const proven = live.filter((gp) => provenPad(gp, tracker));
  return (proven.length ? proven : live).sort((a, b) => radioScore(b) - radioScore(a));
}

// The active device has sent no stick movement for PAD_STALE_MS (since it
// moved or was picked) and another usable one is in the pilot's hands: that
// one, radios first. Never down the ranks (a radio's sticks never go to a
// gamepad), and among equals only from a device that was used and put down.
// Null otherwise. The caller never asks it while armed or for the pilot's
// own pick.
export function staleSwitchTarget(active, pads, tracker, nowMs) {
  if (!active || !tracker || tracker.idleMs(active, nowMs) < PAD_STALE_MS) return null;
  const k = padKey(active), rank = radioScore(active), used = tracker.movedSincePick(active);
  return rankPads(pads, tracker).find((gp) => padKey(gp) !== k && tracker.movingNow(gp, nowMs)
    && (radioScore(gp) > rank || (radioScore(gp) === rank && used))) || null;
}

// A device's kind for the session, from its id, its mapping and the axes the
// browser first showed (a radio at rest), never a later snapshot.
export function sessionKind(gp, tracker) {
  const first = tracker && tracker.first(gp);
  return classifyPad(first ? { id: gp.id, index: gp.index, mapping: gp.mapping, axes: first } : gp).radio;
}

// The plug-and-fly preset for a device of that kind: by its id (an EdgeTX or
// a named radio's), else 'aetr' for one taken for a radio by its shape, else
// 'pad'. Never from live axes.
export function presetGuess(gp, radio) {
  const g = guessRadioPreset({ id: padId(gp), mapping: gp && gp.mapping });
  return g !== 'pad' ? g : (radio ? 'aetr' : 'pad');
}

// main saved a name guess for any id with 'pocket', 'boxer', 'zorro',
// 'jumper'… in it, a standard-layout handheld included: that saved preset is
// main's mistake, not the pilot's choice.
export function staleNamePreset(gp, preset) {
  if (!isStandardPad(gp) || isEdgeTxUsb(gp) || !RADIO_PRESETS[preset] || ['auto', 'pad', 'custom'].includes(preset)) return false;
  return nameGuess(padId(gp)) === preset;
}

// Once per device, ever (a flag in storage): a preset the pilot picks later
// is the pilot's, whatever it matches.
export const PRESET_CHECKED_PREFIX = 'quadmathSimPresetChecked_';
export function migrateNamePreset(gp, preset, storage) {
  const store = storeOf(storage);
  if (!store || !gp || !isStandardPad(gp)) return preset;
  const key = PRESET_CHECKED_PREFIX + sanitizeId(gp.id);
  try {
    if (store.getItem(key)) return preset;
    store.setItem(key, '1');
  } catch (e) { return preset; }
  if (!staleNamePreset(gp, preset)) return preset;
  saveRadioPreset(gp.id, 'auto', store);
  return 'auto';
}

// Bump when a default HID sign changes so loadRadioProfile can migrate
// old stock snapshots once. Custom wizard maps are never auto-flipped.
export const AXIS_MAP_VER = 2;

// EdgeTX/OpenTX joystick, AETR: 0=roll 1=pitch 2=throttle 3=yaw.
// Pitch is a mixer CHANNEL, not a gamepad Y axis. Mode 2 stick-forward
// (elevator) is HID +1 on CH2. #233 set SGN_PITCH to +1 (stick.p>0 →
// fly +X); the old gamepad-style p.sign=-1 then double-inverted radios.
export const AETR_MAP = Object.freeze({
  r: Object.freeze({ i: 0, sign: 1 }),
  p: Object.freeze({ i: 1, sign: 1 }),
  y: Object.freeze({ i: 3, sign: 1 }),
  t: Object.freeze({ i: 2, min: -1, max: 1 }),
});
// Spring gamepad, mode 2: LX=yaw LY=thr RX=roll RY=pitch
// Gamepad RY is HID Y-up = -1, so invert into +stick.p.
export const PAD_MAP = Object.freeze({
  r: Object.freeze({ i: 2, sign: 1 }),
  p: Object.freeze({ i: 3, sign: -1 }),
  y: Object.freeze({ i: 0, sign: 1 }),
  t: Object.freeze({ i: 1, min: 0, max: -1, spring: true }),
});

// From the id only, never the live axes: a layout must not change in flight.
// A device taken for a radio by its shape is passed in as one (effectiveAxisMap).
export function defaultMapFor(gp) {
  return isRadio(gp) ? AETR_MAP : PAD_MAP;
}

export const RADIO_PRESETS = Object.freeze({
  auto: { label: 'Auto-detect', map: null },
  radiomaster: { label: 'RadioMaster TX16S / Zorro / Boxer / Pocket (EdgeTX AETR)', map: AETR_MAP },
  frsky: { label: 'FrSky Taranis X9D / QX7 (OpenTX AETR)', map: AETR_MAP },
  jumper: { label: 'Jumper T-Lite / T20 (EdgeTX AETR)', map: AETR_MAP },
  literadio: { label: 'BetaFPV LiteRadio (AETR)', map: AETR_MAP },
  literadioTaer: {
    label: 'BetaFPV LiteRadio (TAER)',
    map: Object.freeze({
      t: Object.freeze({ i: 0, min: -1, max: 1 }),
      r: Object.freeze({ i: 1, sign: 1 }),
      p: Object.freeze({ i: 2, sign: 1 }),
      y: Object.freeze({ i: 3, sign: 1 }),
    }),
  },
  flysky: { label: 'FlySky (AETR)', map: AETR_MAP },
  // A device shaped like a radio that nothing names (looksLikeRadio).
  aetr: { label: 'Other radio (AETR, Mode 2)', map: AETR_MAP },
  pad: { label: 'Xbox / PlayStation controller', map: PAD_MAP },
  custom: { label: 'Custom — run calibration', map: null },
});

// radio: the device was taken for a radio when it was picked (by its USB id,
// name or shape, decided once for the session), so Auto-detect keeps AETR.
export function effectiveAxisMap(axisMap, radioPreset, gp, radio) {
  if (axisMap) return axisMap;
  const preset = RADIO_PRESETS[radioPreset];
  if (preset && preset.map) return preset.map;
  return radio ? AETR_MAP : defaultMapFor(gp);
}

function axisAt(axes, i) {
  const v = axes && axes[i];
  return Number.isFinite(v) ? v : 0;
}

// The preset a radio's name says, or '' (the name alone, whatever the mapping).
function nameGuess(id) {
  if (/jumper/i.test(id)) return 'jumper';
  if (/frsky|taranis/i.test(id)) return 'frsky';
  if (/literadio/i.test(id)) return 'literadio';
  if (/flysky/i.test(id)) return 'flysky';
  if (/tx16|tx15|tx12|mt12|gx12|radiomaster|edgetx|opentx|zorro|boxer|pocket/i.test(id)) return 'radiomaster';
  if (/betafpv/i.test(id)) return 'radiomaster';
  return '';
}

export function guessRadioPreset(gp) {
  const id = padId(gp);
  if (!isStandardPad(gp)) {
    const byName = nameGuess(id);
    if (byName) return byName;
  }
  if (isRadio(gp)) return 'radiomaster';   // by USB id alone: any EdgeTX radio
  if (looksLikeRadio(gp)) return 'aetr';
  return 'pad';
}

export function radioShortName(gp) {
  const id = padId(gp);
  if (/tx16/i.test(id)) return 'TX16S';
  if (/tx15/i.test(id)) return 'TX15';
  if (/tx12/i.test(id)) return 'TX12';
  if (/mt12/i.test(id)) return 'MT12';
  if (/gx12/i.test(id)) return 'GX12';
  if (/zorro/i.test(id)) return 'Zorro';
  if (/boxer/i.test(id)) return 'Boxer';
  if (/pocket/i.test(id)) return 'Pocket';
  if (/jumper/i.test(id)) return 'Jumper';
  if (/frsky|taranis/i.test(id)) return 'FrSky';
  if (/literadio/i.test(id)) return 'LiteRadio';
  if (/flysky/i.test(id)) return 'FlySky';
  if (isEdgeTxUsb(gp)) return 'EdgeTX radio';
  if (isRadio(gp) || looksLikeRadio(gp)) return 'Radio';
  return 'Gamepad';
}

// Radios by USB id, name or shape: Mode 2 AETR, throttle on ax2, ±1 until
// calibrated.
export function isKnownRadio(gp) {
  const p = guessRadioPreset(gp);
  return p !== 'pad';
}

export function applyAxisMap(axes, map, opts) {
  const m = map || AETR_MAP;
  const threeD = !!(opts && opts.threeD);
  const deadzone = (opts && Number.isFinite(opts.deadzone)) ? opts.deadzone : RADIO_DZ;
  const dz = (v) => applyDeadzone(v, deadzone);
  const r = dz(axisAt(axes, m.r.i) * (m.r.sign || 1));
  const p = dz(axisAt(axes, m.p.i) * (m.p.sign || 1));
  const y = dz(axisAt(axes, m.y.i) * (m.y.sign || 1));
  const traw = axisAt(axes, m.t.i);
  let t;
  // Spring pads only. A ratcheted TX16S throttle is min/max ±1 — never the
  // bipolar spring map, or full-up (+1) would collapse to stick.t = 0.
  if (m.t && m.t.spring) {
    if (threeD) t = clamp((1 - traw) / 2, 0, 1);
    else t = clamp(-traw, 0, 1);
  } else {
    const min = m.t && Number.isFinite(m.t.min) ? m.t.min : -1;
    const max = m.t && Number.isFinite(m.t.max) ? m.t.max : 1;
    const span = max - min;
    t = Math.abs(span) < 0.1 ? 0 : clamp((traw - min) / span, 0, 1);
  }
  return { r, p, y, t };
}

export function isValidAxisMap(m) {
  if (!m || typeof m !== 'object') return false;
  const ch = (c) => !!(c && Number.isFinite(c.i) && c.i >= 0);
  return ch(m.r) && ch(m.p) && ch(m.y) && ch(m.t);
}

function cloneAxisArm(src) {
  if (!src || typeof src !== 'object') return null;
  const out = {};
  if (Number.isFinite(src.i)) out.i = src.i | 0;
  if (Number.isFinite(src.button)) out.button = src.button | 0;
  if (src.sign === -1 || src.sign === 1) out.sign = src.sign;
  return Object.keys(out).length ? out : null;
}

function isOldDefaultRadioPitch(m) {
  if (!m || !m.p || m.p.sign !== -1) return false;
  const aetr = m.r && m.r.i === 0 && m.p.i === 1 && m.y && m.y.i === 3 && m.t && m.t.i === 2;
  const taer = m.t && m.t.i === 0 && m.r && m.r.i === 1 && m.p.i === 2 && m.y && m.y.i === 3;
  return !!(aetr || taer);
}

// Stock AETR/TAER snapshots from before AXIS_MAP_VER=2 inverted pitch like a
// gamepad Y axis. Flip those once. Wizard (`custom`) and pad maps stay put.
export function migrateAxisMap(map, radioPreset) {
  if (!isValidAxisMap(map)) return map;
  if ((map.ver | 0) >= AXIS_MAP_VER) return map;
  const next = {
    r: Object.assign({}, map.r),
    p: Object.assign({}, map.p),
    y: Object.assign({}, map.y),
    t: Object.assign({}, map.t),
    ver: AXIS_MAP_VER,
  };
  const arm = cloneAxisArm(map.arm);
  const mode = cloneAxisArm(map.mode);
  if (arm) next.arm = arm;
  if (mode) next.mode = mode;
  if (radioPreset !== 'custom' && radioPreset !== 'pad' && isOldDefaultRadioPitch(map)) {
    next.p = Object.assign({}, next.p, { sign: 1 });
  }
  return next;
}

function axisMapNeedsSave(before, after) {
  if (!after) return false;
  if (!before) return true;
  return (before.ver | 0) !== (after.ver | 0)
    || (before.p && before.p.sign) !== (after.p && after.p.sign);
}

export function loadAutoArm(storage) {
  const store = storeOf(storage);
  if (!store) return true;
  try {
    const v = store.getItem(AUTOARM_KEY);
    if (v == null || v === '') return true;
    return v === '1' || v === 'true' || v === 'on';
  } catch (e) { return true; }
}

export function saveAutoArm(on, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try { store.setItem(AUTOARM_KEY, on ? '1' : '0'); }
  catch (e) { /* ignore */ }
}

function parseArmSwitch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sign = raw.sign === -1 ? -1 : 1;
  if (Number.isFinite(raw.button) && raw.button >= 0) return { button: raw.button | 0, sign };
  if (Number.isFinite(raw.i) && raw.i >= 0) return { i: raw.i | 0, sign };
  return null;
}

export function hasArmSwitch(map) {
  return !!parseArmSwitch(map && map.arm);
}

export function loadArmSwitch(id, storage) {
  const store = storeOf(storage);
  if (!store || !id) return null;
  try {
    const raw = store.getItem(ARM_SWITCH_PREFIX + sanitizeId(id));
    return raw ? parseArmSwitch(JSON.parse(raw)) : null;
  } catch (e) { return null; }
}

export function saveArmSwitch(id, arm, storage) {
  const store = storeOf(storage);
  if (!store || !id) return;
  const sid = ARM_SWITCH_PREFIX + sanitizeId(id);
  try {
    const parsed = parseArmSwitch(arm);
    if (!parsed) store.removeItem(sid);
    else store.setItem(sid, JSON.stringify(parsed));
  } catch (e) { /* ignore */ }
}

export function mergeArmSwitch(map, arm) {
  const parsed = parseArmSwitch(arm);
  if (!parsed) return map;
  return Object.assign({}, map || {}, { arm: parsed });
}

// ---- "Use my radio switches", per radio ----
// { on, arm, turtle, angle }. Off (the default, for every radio, saved or not)
// is Easy mode: the page arms, turtles and picks the flight mode whatever the
// radio's switches do. On: arm, turtle and angle are each { i, sign } or
// { button, sign } from the wizard, or null where it was skipped (a skipped
// turtle stays on the sticks, a skipped angle stays a toggle in Controls). On
// needs an arm switch.
export function normalizeSwitches(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const arm = parseArmSwitch(r.arm);
  return {
    on: !!r.on && !!arm,
    arm,
    turtle: parseArmSwitch(r.turtle),
    angle: parseArmSwitch(r.angle),
  };
}

export function saveRadioSwitches(id, switches, storage) {
  const store = storeOf(storage);
  if (!store || !id) return;
  try { store.setItem(SWITCHES_PREFIX + sanitizeId(id), JSON.stringify(normalizeSwitches(switches))); }
  catch (e) { /* ignore quota / private mode */ }
}

export function loadRadioSwitches(id, storage) {
  const store = storeOf(storage);
  if (!store || !id) return normalizeSwitches(null);
  try { return normalizeSwitches(JSON.parse(store.getItem(SWITCHES_PREFIX + sanitizeId(id)))); }
  catch (e) { return normalizeSwitches(null); }
}

// The stick map the page reads: the sticks, and the arm switch when the
// radio's switches are on. A calibration's saved arm and mode are not used.
export function switchesAxisMap(base, switches) {
  const map = Object.assign({}, base);
  delete map.arm;
  delete map.mode;
  if (switches && switches.on) map.arm = switches.arm;
  return map;
}

// The AUX number a gamepad axis goes to Betaflight as (radioAux: the axes the
// stick map leaves free, in order), or null for a stick axis.
export function auxNumberOfAxis(map, i) {
  if (!Number.isFinite(i) || i < 0) return null;
  const used = occupiedStickAxes(map);
  if (used.has(i)) return null;
  let n = 0;
  for (let a = 0; a <= i; a++) if (!used.has(a)) n++;
  return n;
}

export const SWITCH_WIZARD_STEPS = Object.freeze([
  { key: 'arm', label: 'FLIP YOUR ARM SWITCH', hint: 'to where it arms', skippable: false },
  { key: 'turtle', label: 'FLIP YOUR TURTLE SWITCH', hint: 'to where it flips. None? Skip: full stick turtles it.', skippable: true },
  { key: 'angle', label: 'FLIP YOUR ANGLE SWITCH', hint: 'to angle. None? Skip: angle stays a toggle in Controls.', skippable: true },
]);
const WIZARD_HOLD_S = 0.12;   // settled there: a 3-position switch passing through the middle is not it

export function createSwitchWizard(gp) {
  return { step: 0, picks: {}, taken: new Set(), base: snapshotArmInputs(gp), cand: null, heldS: 0 };
}

function wizardNext(w, gp) {
  w.step++;
  w.base = snapshotArmInputs(gp);
  w.cand = null;
  w.heldS = 0;
}

// What has moved since this step began: an axis off the sticks that has
// travelled most of its range and ended near an end (the direction is that
// end), or a button that changed. Compared to the step's start, not the last
// sample: a radio's slowed switch moves over many samples.
function wizardMoved(w, gp, map) {
  const used = occupiedStickAxes(map);
  const axes = gp.axes || [];
  let best = null, bestD = 0;
  for (let i = 4; i < axes.length; i++) {
    if (used.has(i) || w.taken.has('a' + i)) continue;
    const now = Number(axes[i]);
    const was = Number(w.base.axes[i]);
    if (!Number.isFinite(now) || !Number.isFinite(was) || Math.abs(now) < 0.5) continue;
    const d = Math.abs(now - was);
    if (d >= 0.85 && d > bestD) { bestD = d; best = { i, sign: now >= 0 ? 1 : -1 }; }
  }
  if (best) return best;
  const btns = gp.buttons || [];
  for (let i = 0; i < btns.length; i++) {
    if (w.taken.has('b' + i)) continue;
    const now = !!(btns[i] && (btns[i].pressed || btns[i].value > 0.5));
    if (now !== !!w.base.buttons[i]) return { button: i, sign: now ? 1 : -1 };
  }
  return null;
}

export function stepSwitchWizard(w, gp, map, dt) {
  const st = SWITCH_WIZARD_STEPS[w.step];
  const ui = { state: w, done: !st, label: st ? st.label : '', hint: st ? st.hint : '', skippable: !!(st && st.skippable) };
  if (!st || !gp) return ui;
  const moved = wizardMoved(w, gp, map);
  const same = moved && w.cand && moved.i === w.cand.i && moved.button === w.cand.button && moved.sign === w.cand.sign;
  w.heldS = same ? w.heldS + (dt > 0 ? dt : 0) : 0;
  w.cand = moved;
  if (moved && w.heldS >= WIZARD_HOLD_S) {
    w.picks[st.key] = moved;
    w.taken.add(moved.button != null ? 'b' + moved.button : 'a' + moved.i);
    wizardNext(w, gp);
    // Taken: what to show now is the next step's prompt (advanced).
    const next = SWITCH_WIZARD_STEPS[w.step];
    ui.done = !next;
    ui.advanced = true;
    ui.label = next ? next.label : '';
    ui.hint = next ? next.hint : '';
    ui.skippable = !!(next && next.skippable);
  }
  return ui;
}

export function skipSwitchWizard(w, gp) {
  const st = SWITCH_WIZARD_STEPS[w.step];
  if (st && st.skippable) wizardNext(w, gp);
  return { state: w, done: w.step >= SWITCH_WIZARD_STEPS.length };
}

export function switchWizardResult(w) {
  return normalizeSwitches(Object.assign({ on: true }, w.picks));
}

export function occupiedStickAxes(map) {
  const m = map || {};
  const out = new Set();
  for (const k of ['r', 'p', 'y', 't']) {
    if (m[k] && Number.isFinite(m[k].i)) out.add(m[k].i | 0);
  }
  return out;
}

export function snapshotArmInputs(gp) {
  const axes = gp && gp.axes ? Array.from(gp.axes) : [];
  const buttons = (gp && gp.buttons ? Array.from(gp.buttons) : []).map((b) =>
    !!(b && (b.pressed || b.value > 0.5)));
  return { axes, buttons };
}

export function listArmCandidates(gp, map) {
  const used = occupiedStickAxes(map);
  const axes = [];
  const raw = (gp && gp.axes) || [];
  for (let i = 0; i < raw.length; i++) {
    if (i < 4 || used.has(i)) continue;
    const v = Number(raw[i]);
    axes.push({ kind: 'axis', i, value: Number.isFinite(v) ? v : 0 });
  }
  const buttons = [];
  const btns = (gp && gp.buttons) || [];
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i];
    buttons.push({ kind: 'button', i, value: (b && (b.pressed || b.value > 0.5)) ? 1 : -1 });
  }
  return { axes, buttons };
}

export function detectArmSwitch(prev, gp, map) {
  if (!prev || !gp) return null;
  const used = occupiedStickAxes(map);
  const axes = gp.axes || [];
  for (let i = 0; i < axes.length; i++) {
    if (i < 4 || used.has(i)) continue;
    const now = Number(axes[i]);
    const was = Number(prev.axes && prev.axes[i]);
    if (!Number.isFinite(now) || !Number.isFinite(was)) continue;
    if (Math.abs(now - was) < 0.85) continue;
    return { i, sign: now >= 0 ? 1 : -1 };
  }
  const btns = gp.buttons || [];
  for (let i = 0; i < btns.length; i++) {
    const now = !!(btns[i] && (btns[i].pressed || btns[i].value > 0.5));
    const was = !!(prev.buttons && prev.buttons[i]);
    if (now && !was) return { button: i, sign: 1 };
  }
  return null;
}

export function armSwitchValue(gp, arm) {
  const a = parseArmSwitch(arm);
  if (!gp || !a) return null;
  if (a.button != null) {
    const b = gp.buttons && gp.buttons[a.button];
    const raw = (b && (b.pressed || b.value > 0.5)) ? 1 : -1;
    return raw * a.sign;
  }
  const v = gp.axes && gp.axes[a.i];
  return Number.isFinite(v) ? v * a.sign : 0;
}

export function stepArmSwitch(state, sample) {
  const s = sample || {};
  const v = s.value;
  const prev = state && Number.isFinite(state.prev) ? state.prev : null;
  const next = { prev: Number.isFinite(v) ? v : prev };
  if (!s.hasSwitch || v == null || !Number.isFinite(v)) {
    return { state: next, arm: false, disarm: false, blocked: false };
  }
  const on = v > 0.5;
  const off = v < -0.5;
  const rose = prev != null && prev <= 0.5 && on;
  if (rose && !s.armed) {
    if (s.throttleSafe) return { state: next, arm: true, disarm: false, blocked: false };
    return { state: next, arm: false, disarm: false, blocked: true };
  }
  if (off && s.armed) return { state: next, arm: false, disarm: true, blocked: false };
  return { state: next, arm: false, disarm: false, blocked: false };
}

export function loadRadioProfile(id, storage) {
  const store = storeOf(storage);
  const sid = sanitizeId(id);
  let radioPreset = 'auto';
  let axisMap = null;
  if (!store) return { radioPreset, axisMap };
  try {
    radioPreset = store.getItem(RADIO_PRESET_PREFIX + sid) || 'auto';
    if (!RADIO_PRESETS[radioPreset]) radioPreset = 'auto';
    const raw = store.getItem(AXIS_MAP_PREFIX + sid);
    axisMap = raw ? JSON.parse(raw) : null;
    if (!isValidAxisMap(axisMap)) axisMap = null;
    else {
      const migrated = migrateAxisMap(axisMap, radioPreset);
      if (axisMapNeedsSave(axisMap, migrated)) {
        try { store.setItem(AXIS_MAP_PREFIX + sid, JSON.stringify(migrated)); }
        catch (e) { /* ignore quota / private mode */ }
      }
      axisMap = migrated;
    }
  } catch (e) {
    radioPreset = 'auto';
    axisMap = null;
  }
  return { radioPreset, axisMap };
}

// Auto-detect / reset: drop this device's saved map. If `id` is empty, fall
// back to ryflyGamepadId so a Tune-panel click still clears a stale TX16S
// calibration from a broken run. Never deletes other ryfly* keys.
export function clearRadioCalibration(id, storage) {
  const store = storeOf(storage);
  if (!store) return false;
  let rawId = id;
  if (!rawId) {
    try { rawId = store.getItem(GP_ID_KEY); } catch (e) { rawId = ''; }
  }
  if (!rawId) return false;
  try {
    store.removeItem(AXIS_MAP_PREFIX + sanitizeId(rawId));
    return true;
  } catch (e) {
    return false;
  }
}

export function saveAxisMap(id, axisMap, storage) {
  const store = storeOf(storage);
  if (!store || !id) return;
  try {
    const stamped = axisMap && typeof axisMap === 'object'
      ? Object.assign({}, axisMap, { ver: Math.max(axisMap.ver | 0, AXIS_MAP_VER) })
      : axisMap;
    store.setItem(AXIS_MAP_PREFIX + sanitizeId(id), JSON.stringify(stamped));
  } catch (e) { /* ignore quota / private mode */ }
}

// Tune's "forget this device": its saved choice, calibration and preset.
// Other devices' keys, and every other ryfly* key, stay.
export function forgetDevice(id, storage) {
  const store = storeOf(storage);
  if (!store || !id) return false;
  const sid = sanitizeId(id);
  try {
    if (store.getItem(GP_ID_KEY) === id) store.removeItem(GP_ID_KEY);
    store.removeItem(AXIS_MAP_PREFIX + sid);
    store.removeItem(RADIO_PRESET_PREFIX + sid);
    return true;
  } catch (e) {
    return false;
  }
}

// A saved calibration made on the layout the device sends now: the same
// axis count (saved with it, n), every stick on an axis it has. One from
// before the count was saved, or from Classic on an Advanced layout, is not.
export function calibratedOnLayout(map, gp) {
  const n = axisCount(gp);
  if (!isValidAxisMap(map) || map.n !== n) return false;
  return ['r', 'p', 'y', 't'].every((k) => map[k].i < n);
}

// The first connected EdgeTX radio whose throttle cannot be coming through
// (classifyPad issue 'classic'), unless it was calibrated on the layout it
// sends now. Null when there is none.
export function radioIssuePad(pads, storage) {
  for (const gp of pads || []) {
    if (!gp || gp.connected === false || classifyPad(gp).issue !== 'classic') continue;
    if (calibratedOnLayout(loadRadioProfile(gp.id, storage).axisMap, gp)) continue;
    return gp;
  }
  return null;
}

// The Classic message, told once per radio plugged. It is gone only once no
// such radio has been seen for ISSUE_GONE_MS: Chrome gives empty polls with
// the radio still plugged in, and those neither clear it nor tell it again.
export const ISSUE_GONE_MS = 1500;
const RETELL_MS = 9000;
export function createIssueNotice() {
  let id = '', goneAt = null, toldAt = -Infinity;
  return {
    // pads: a getGamepads() list. changed: the message appeared or went;
    // tell: it appeared (say it).
    see(pads, storage, nowMs) {
      const gp = radioIssuePad(pads, storage);
      const now = gp ? gp.id : '';
      if (now === id) { goneAt = null; return { changed: false, tell: false, id }; }
      if (!now) {
        if (goneAt === null) goneAt = nowMs;
        if (nowMs - goneAt < ISSUE_GONE_MS) return { changed: false, tell: false, id };
      }
      goneAt = null;
      id = now;
      if (now) toldAt = nowMs;
      return { changed: true, tell: !!now, id };
    },
    // Told (by the page's toast, or the radio's own plug toast) at nowMs.
    told(newId, nowMs) { id = newId || ''; goneAt = null; toldAt = Number.isFinite(nowMs) ? nowMs : toldAt; },
    // A pick just toasted over it: say it again, if it was said in the last
    // RETELL_MS, the radio is still here, and it is not the one flying (its
    // own toast says it).
    retellDue(pads, storage, activeId, nowMs) {
      if (!id || id === activeId || nowMs - toldAt >= RETELL_MS) return false;
      const gp = radioIssuePad(pads, storage);
      return !!gp && gp.id === id;
    },
    get id() { return id; },
  };
}

export function saveRadioPreset(id, preset, storage) {
  const store = storeOf(storage);
  if (!store || !id) return;
  try { store.setItem(RADIO_PRESET_PREFIX + sanitizeId(id), preset); }
  catch (e) { /* ignore */ }
}

export const CAL_STEPS = Object.freeze([
  { key: 'center', label: 'CENTER ALL STICKS, THROTTLE LOW', hint: 'hold 1 sec' },
  { key: 'r', label: 'ROLL — RIGHT STICK FULL RIGHT', hint: 'hold deflection' },
  { key: 'p', label: 'PITCH — RIGHT STICK FULL UP', hint: 'hold deflection' },
  { key: 'y', label: 'YAW — LEFT STICK FULL RIGHT', hint: 'hold deflection' },
  { key: 'thi', label: 'THROTTLE FULL UP', hint: 'hold' },
  { key: 'tlo', label: 'THROTTLE FULL DOWN', hint: 'hold' },
]);

export function createCalibState() {
  return {
    step: 0,
    timer: 0,
    center: null,
    result: {},
    used: new Set(),
    thrCand: new Set(),
    lo: null,
    hi: null,
    // Per axis, this step: the value it last moved to and how long it has
    // held there; where it was when the step began, and how many polls it
    // has spent part-way from there (a stick sweeps, a switch jumps).
    anchor: null,
    still: null,
    start: null,
    swept: null,
  };
}

function listAxes(gp) {
  const raw = gp && gp.axes;
  if (!raw) return [];
  const n = raw.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = Number(raw[i]);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}

// EdgeTX USB joystick: first four axes are the gimbals (AETR order varies).
// ax4–ax7 are aux pots/switches that rest at -1 and must never be throttle.
const STICK_AXIS_COUNT = 4;

function isStickAxis(i, n) {
  return i >= 0 && i < Math.min(STICK_AXIS_COUNT, n);
}

function markThrottleCandidates(center) {
  const s = new Set();
  if (!center) return s;
  for (let i = 0; i < center.length; i++) {
    if (!isStickAxis(i, center.length)) continue;
    // EdgeTX throttle rests at an extreme (typically -1), not at 0. Never
    // let r/p/y steal that axis if the stick wiggles during those steps.
    if (Math.abs(center[i]) >= 0.55) s.add(i);
  }
  return s;
}

function skipAuxAxes(ax) {
  const s = new Set();
  for (let i = STICK_AXIS_COUNT; i < ax.length; i++) s.add(i);
  return s;
}

function mergeSkip(a, b) {
  const s = new Set();
  if (a) for (const i of a) s.add(i);
  if (b) for (const i of b) s.add(i);
  return s.size ? s : null;
}

function skipForStick(calib, ax) {
  const aux = skipAuxAxes(ax);
  const cand = calib.thrCand;
  if (!cand || !cand.size) return aux.size ? aux : null;
  let free = 0;
  for (let i = 0; i < ax.length; i++) {
    if (!calib.used.has(i) && !cand.has(i) && isStickAxis(i, ax.length)) free++;
  }
  return mergeSkip(aux, free > 0 ? cand : null);
}

// Pinned at ±1, compared to the CENTER rest — not to the first frame of
// this step. A sweep tracker that starts after the stick is already up
// sees span 0 and would stall (Ryan live: ax2 held at 1.00).
function heldStickLimit(ax, center, used) {
  let best = null, bestAbs = 0;
  for (let i = 0; i < ax.length; i++) {
    if (used.has(i) || !isStickAxis(i, ax.length)) continue;
    if (Math.abs(ax[i]) < 0.95) continue;
    const rest = center && Number.isFinite(center[i]) ? center[i] : 0;
    const d = ax[i] - rest;
    // Still sitting at the CENTER rest (throttle low at -1) is not "full up".
    if (Math.abs(d) < 0.5) continue;
    if (Math.abs(d) > bestAbs) {
      bestAbs = Math.abs(d);
      best = { i, d, max: ax[i], min: rest, span: Math.abs(d) };
    }
  }
  return best;
}

function bestUnusedAxis(ax, center, used, minAbs, skip) {
  let best = -1, bestD = 0;
  for (let i = 0; i < ax.length; i++) {
    if (used.has(i) || (skip && skip.has(i))) continue;
    const d = ax[i] - (center[i] || 0);
    if (Math.abs(d) > Math.abs(bestD)) { bestD = d; best = i; }
  }
  if (best >= 0 && Math.abs(bestD) > minAbs) return { i: best, d: bestD };
  return null;
}

function trackSweep(calib, ax) {
  if (!calib.lo || calib.lo.length !== ax.length) {
    calib.lo = ax.slice();
    calib.hi = ax.slice();
    return;
  }
  for (let i = 0; i < ax.length; i++) {
    if (ax[i] < calib.lo[i]) calib.lo[i] = ax[i];
    if (ax[i] > calib.hi[i]) calib.hi[i] = ax[i];
  }
}

function bestSweep(calib, ax, used, minSpan, only) {
  let best = -1, bestSpan = 0;
  for (let i = 0; i < ax.length; i++) {
    if (used.has(i) || !isStickAxis(i, ax.length)) continue;
    if (only && !only.has(i)) continue;
    const span = calib.hi[i] - calib.lo[i];
    if (span > bestSpan) { bestSpan = span; best = i; }
  }
  if (best < 0 || bestSpan <= minSpan) return null;
  const rest = calib.center[best];
  const hi = calib.hi[best];
  const lo = calib.lo[best];
  const max = Math.abs(hi - rest) >= Math.abs(lo - rest) ? hi : lo;
  return { i: best, span: bestSpan, max, min: rest };
}

function clearSweep(calib) {
  calib.lo = null;
  calib.hi = null;
  calib.timer = 0;
  calib.anchor = null;
  calib.still = null;
  calib.start = null;
  calib.prevAx = null;
  calib.swept = null;
}

// Polls this step with the axis part-way: off where it began by more than
// 0.15 and short of a rail. A stick or a throttle passes through there; a
// switch jumps rail to rail (or middle to rail) between two reports.
const SWEPT_POLLS = 3;
function trackSwept(calib, ax) {
  if (!calib.start || calib.start.length !== ax.length) {
    calib.start = ax.slice();
    calib.prevAx = ax.slice();
    calib.swept = ax.map(() => 0);
    return;
  }
  for (let i = 0; i < ax.length; i++) {
    // A new value each time (0.01 past the last one counted, however slowly
    // it gets there): a 3-position switch sitting at its middle is one value,
    // a stick on its way passes through many.
    if (Math.abs(ax[i]) < 0.9 && Math.abs(ax[i] - calib.start[i]) > 0.15 && Math.abs(ax[i] - calib.prevAx[i]) > 0.01) {
      calib.swept[i]++;
      calib.prevAx[i] = ax[i];
    }
  }
}

function sweptOver(calib, i) {
  return !!calib.swept && calib.swept[i] >= SWEPT_POLLS;
}

// R/P/Y when none of 0-3 moved: a gimbal past axis 3 (Advanced mode). It
// rested mid-stick at CENTER, began this step there (not left off it by an
// earlier step) and swept, as a stick does; never a switch.
function midAuxMoved(calib, ax) {
  let best = null;
  for (let i = STICK_AXIS_COUNT; i < ax.length; i++) {
    if (calib.used.has(i)) continue;
    const rest = Number.isFinite(calib.center[i]) ? calib.center[i] : 0;
    if (Math.abs(rest) >= 0.55) continue;
    if (!calib.start || Math.abs(calib.start[i] - rest) >= 0.3) continue;
    if (!sweptOver(calib, i)) continue;
    const d = ax[i] - rest;
    if (Math.abs(d) > 0.6 && (!best || Math.abs(d) > Math.abs(best.d))) best = { i, d };
  }
  return best;
}

// How long each axis has held within 0.02 of where it last moved to. An
// anchor, not the previous poll: at 4 ms polls a slow sweep moves less than
// that between two of them.
function trackStill(calib, ax, dt) {
  if (!calib.anchor || calib.anchor.length !== ax.length) {
    calib.anchor = ax.slice();
    calib.still = ax.map(() => 0);
    return;
  }
  for (let i = 0; i < ax.length; i++) {
    if (Math.abs(ax[i] - calib.anchor[i]) < 0.02) calib.still[i] += dt;
    else { calib.anchor[i] = ax[i]; calib.still[i] = 0; }
  }
}

function stillFor(calib, i) {
  return calib.still && Number.isFinite(calib.still[i]) ? calib.still[i] : 0;
}

// A throttle that stops short of the rails (a model with limits below
// 100 %): its rest is short of the rail too, and limits are symmetric, so
// full is held for 2 s at the mirror of the rest (rest -0.8, full +0.8),
// with nothing past it seen. Never when it rested on a rail: a pause part-way
// up is not full.
const SHORT_HOLD_S = 1.0;
const SHORT_FULL_HOLD_S = 2.0;
// Held at the bottom this long at THROTTLE FULL UP: a reversed channel's
// full, not a dip on the way to the top.
const REVERSED_HOLD_S = 0.4;
function heldShort(calib, ax, i) {
  if (stillFor(calib, i) < SHORT_FULL_HOLD_S) return false;
  const rest = calib.center && Number.isFinite(calib.center[i]) ? calib.center[i] : 0;
  const v = ax[i];
  if (Math.abs(rest) >= 0.95 || Math.abs(rest) < 0.5) return false;
  if (Math.sign(v) !== -Math.sign(rest) || Math.abs(Math.abs(v) - Math.abs(rest)) > 0.03) return false;
  return !calib.hi || (v > 0 ? calib.hi[i] <= v + 0.02 : calib.lo[i] >= v - 0.02);
}

// THROTTLE FULL UP on an axis past 3: in Advanced mode the throttle can come
// through anywhere. Only while no gimbal axis (0-3) is off its CENTER rest,
// so a throttle on its way up there wins; and only an axis that swept during
// this step (sweptOver: a switch flipped now jumps, one flipped in an earlier
// step does not move) and is held at the end it moved to.
function auxThrottleUp(calib, ax) {
  const n = ax.length;
  for (let i = 0; i < Math.min(STICK_AXIS_COUNT, n); i++) {
    if (calib.used.has(i)) continue;
    const rest = Number.isFinite(calib.center[i]) ? calib.center[i] : 0;
    if (Math.abs(ax[i] - rest) >= 0.3) return null;
  }
  let best = null;
  for (let i = STICK_AXIS_COUNT; i < n; i++) {
    if (calib.used.has(i)) continue;
    const lo = calib.lo[i], hi = calib.hi[i], span = hi - lo;
    if (span < 1.0 || !sweptOver(calib, i)) continue;
    const atHi = Math.abs(ax[i] - hi) <= 0.05, atLo = Math.abs(ax[i] - lo) <= 0.05;
    if (!atHi && !atLo) continue;
    if (Math.abs(ax[i]) < 0.95 && !heldShort(calib, ax, i)) continue;
    if (!best || span > best.span) best = { i, span, max: ax[i], min: atHi ? lo : hi };
  }
  return best;
}

export function stepCalib(calib, gp, dt) {
  const st = CAL_STEPS[calib.step];
  if (!st || !gp) {
    return { state: calib, done: false, label: '', hint: '' };
  }
  const ax = listAxes(gp);
  const ui = { state: calib, done: false, label: st.label, hint: st.hint };
  // Axes past 3 for a stick only off Classic: a Classic EdgeTX radio sends its
  // sticks on 0-3 and its switches and pots after, and calibrates as on main.
  const auxOk = !(isEdgeTxRadio(gp) && ax.length >= 8);
  // A radio by its USB id or name: a ratcheted throttle, full at +1. Anything
  // else may be a sprung stick (a gamepad's full is -1, its low the centre).
  const how = classifyPad(gp).how;
  const ratchet = how === 'usb' || how === 'name';

  trackStill(calib, ax, dt);
  trackSwept(calib, ax);
  // The layout it was made on (calibratedOnLayout).
  calib.result.n = ax.length;

  if (st.key === 'center') {
    calib.timer += dt;
    if (calib.timer > 1) {
      calib.center = ax.slice();
      calib.thrCand = markThrottleCandidates(calib.center);
      calib.step++;
      clearSweep(calib);
    }
    ui.done = calib.step >= CAL_STEPS.length;
    return ui;
  }
  if (st.key === 'thi') {
    // Accept a STABLE pin at ±1 vs CENTER rest. Live TX16S: ax2 held at
    // 1.00 with aux 4–7 sitting at -1. A sweep-from-this-step tracker sees
    // span 0; aux-at-extreme must not block or win.
    trackSweep(calib, ax);
    let hit = heldStickLimit(ax, calib.center, calib.used);
    if (!hit) {
      const prefer = calib.thrCand && calib.thrCand.size ? calib.thrCand : null;
      hit = bestSweep(calib, ax, calib.used, 1.2, prefer);
      if (!hit) hit = bestSweep(calib, ax, calib.used, 1.2, null);
      if (hit) {
        const atPeak = Math.abs(ax[hit.i] - hit.max) <= 0.25;
        if (!atPeak && hit.span < 1.6) hit = null;
      }
    }
    if (!hit) {
      const moved = bestUnusedAxis(ax, calib.center, calib.used, 0.6, skipAuxAxes(ax));
      if (moved) {
        hit = {
          i: moved.i,
          span: Math.abs(moved.d),
          max: ax[moved.i],
          min: calib.center[moved.i],
        };
      }
    }
    if (hit) {
      const live = ax[hit.i];
      const peak = Number.isFinite(hit.max) ? hit.max : live;
      // Full-up means a rail. A mid-travel sweep (span 1.2 at ax=0.25)
      // must not lock max too early. A throttle that stops short of the
      // rails has to be held there for a second (heldShort).
      if (Math.abs(live) < 0.95 && Math.abs(peak) < 0.95 && !heldShort(calib, ax, hit.i)) hit = null;
    }
    if (!hit && auxOk) hit = auxThrottleUp(calib, ax);
    if (hit) {
      const r = Number.isFinite(calib.center[hit.i]) ? calib.center[hit.i] : 0;
      const v = ax[hit.i];
      const reversed = v <= -0.95 && stillFor(calib, hit.i) >= REVERSED_HOLD_S;
      if (r > -0.5 && (ratchet || r >= 0.5)) {
        // Not low at CENTER (left mid or up), on a radio, or up on anything:
        // EdgeTX's full is +1, so a trip to the bottom is the pilot moving it,
        // and full is the value held at the top once it gets there (it may
        // read a hair short of 1). Only a hold at the bottom, as the prompt
        // asks, is a reversed channel (low at +1).
        if (v >= 0.95) hit = { i: hit.i, max: v, min: r >= 0.5 ? (calib.lo[hit.i] <= -0.5 ? calib.lo[hit.i] : -1) : r };
        else if (!reversed) hit = null;
      } else if (Math.abs(v - r) < 0.5) {
        // Back at its CENTER rest (a push that stopped short and dropped
        // back): not full up, whatever it reached on the way.
        hit = null;
      }
    }
    if (hit) {
      calib.timer += dt;
      if (calib.timer > 0.1) {
        const rail = Math.abs(ax[hit.i]) >= Math.abs(hit.max) ? ax[hit.i] : hit.max;
        // Low is where it rested at CENTER, unless it rested up there too
        // (throttle left high): then the other end of the sweep.
        let min = hit.min;
        if (!Number.isFinite(min) || Math.abs(min - rail) < 0.5) {
          const lo = calib.lo ? calib.lo[hit.i] : rail, hi = calib.hi ? calib.hi[hit.i] : rail;
          const other = Math.abs(lo - rail) >= Math.abs(hi - rail) ? lo : hi;
          min = Math.abs(other - rail) >= 0.5 ? other : -(Math.sign(rail) || 1);
        }
        calib.result.t = { i: hit.i, max: rail, min };
        calib.used.add(hit.i);
        calib.step++;
        clearSweep(calib);
        ui.done = calib.step >= CAL_STEPS.length;
      }
    } else calib.timer = 0;
    return ui;
  }
  if (st.key === 'tlo') {
    const t = calib.result.t;
    const ti = t && t.i;
    if (!Number.isFinite(ti)) {
      calib.step++;
      clearSweep(calib);
      ui.done = calib.step >= CAL_STEPS.length;
      return ui;
    }
    const rest = calib.center && Number.isFinite(calib.center[ti])
      ? calib.center[ti]
      : (Number.isFinite(t.min) ? t.min : 0);
    const peak = Number.isFinite(t.max) ? t.max : ax[ti];
    trackSweep(calib, ax);
    // A sprung stick (a gamepad, or a device only shaped like a radio), or a
    // throttle that rested at the far end at CENTER (throttle low): back
    // there, or well on its way, is low.
    if (!ratchet || Math.abs(rest - peak) >= 1.5) {
      const nearRest = Math.abs(ax[ti] - rest) <= 0.4;
      const awayFromMax = Math.abs(ax[ti] - peak) > 0.5;
      if (nearRest || awayFromMax) {
        calib.timer += dt;
        if (calib.timer > 0.1) {
          calib.result.t.min = nearRest ? ax[ti] : rest;
          calib.result.t.max = peak;
          calib.step++;
          clearSweep(calib);
          ui.done = calib.step >= CAL_STEPS.length;
        }
      } else calib.timer = 0;
      return ui;
    }
    // A radio throttle that did not rest low at CENTER (left mid-stick, or
    // up): low is the end the stick is moved to now, wherever that is, held
    // at a rail or for a second. Never the CENTER pose, which would leave the
    // travel below it dead, and never before it has moved.
    const v = ax[ti];
    const far = Math.abs(calib.lo[ti] - peak) >= Math.abs(calib.hi[ti] - peak) ? calib.lo[ti] : calib.hi[ti];
    const moved = calib.hi[ti] - calib.lo[ti] >= 0.3;
    const held = Math.abs(v) >= 0.95 ? Math.abs(v - far) <= 0.05 : stillFor(calib, ti) >= SHORT_HOLD_S;
    if (moved && Math.abs(v - peak) >= 0.5 && held) {
      calib.timer += dt;
      if (calib.timer > 0.1) {
        calib.result.t.min = v;
        calib.result.t.max = peak;
        calib.step++;
        clearSweep(calib);
        ui.done = calib.step >= CAL_STEPS.length;
      }
    } else calib.timer = 0;
    return ui;
  }
  // r / p / y: still a hold on a self-centering gimbal, but never assign an
  // axis that was already at an extreme during CENTER (the throttle), and
  // never an aux pot resting at -1.
  let moved = bestUnusedAxis(ax, calib.center, calib.used, 0.6, skipForStick(calib, ax));
  if (!moved && auxOk) moved = midAuxMoved(calib, ax);
  if (moved) {
    calib.timer += dt;
    if (calib.timer > 0.6) {
      calib.result[st.key] = { i: moved.i, sign: Math.sign(moved.d) || 1 };
      calib.used.add(moved.i);
      calib.step++;
      clearSweep(calib);
    }
  } else calib.timer = 0;
  ui.done = calib.step >= CAL_STEPS.length;
  return ui;
}

// The axes the pilot can tap for this step when calibration does not pick
// one up: every axis, less those taken for other sticks (the throttle's own
// axis stays on offer at THROTTLE FULL DOWN). None at CENTER.
export function calibAxisChoices(calib, gp) {
  const st = calib && CAL_STEPS[calib.step];
  if (!st || st.key === 'center' || !gp) return [];
  const ax = listAxes(gp);
  const own = st.key === 'tlo' && calib.result.t ? calib.result.t.i : -1;
  const out = [];
  for (let i = 0; i < ax.length; i++) if (!calib.used.has(i) || i === own) out.push(i);
  return out;
}

// The pilot tapped axis i for this step. A stick takes the sign it is
// deflected to (or +1 at rest). THROTTLE FULL UP: up is the way it moved
// from its CENTER rest (+1, EdgeTX's, if it has not moved); full is the value
// held if it is near that end (a throttle that stops short), else the rail;
// low is the CENTER rest when that is on the other rail, else the other
// rail. FULL DOWN
// takes the value it is held at as low. Then the next step, as if detected.
export function calibPickAxis(calib, gp, i) {
  const st = calib && CAL_STEPS[calib.step];
  const ax = listAxes(gp);
  const none = { state: calib, done: false, picked: false };
  if (!st || !gp || !calibAxisChoices(calib, gp).includes(i)) return none;
  const rest = calib.center && Number.isFinite(calib.center[i]) ? calib.center[i] : 0;
  const v = ax[i];
  const how = classifyPad(gp).how;
  const sprung = !(how === 'usb' || how === 'name');
  if (st.key === 'thi') {
    // A sprung stick (a gamepad's): up is -1 if it has not moved, low is
    // where it centres.
    const d = v - rest;
    const dir = Math.abs(d) >= 0.3 ? Math.sign(d) : (sprung ? -1 : 1);
    const max = Math.abs(v) >= 0.75 && Math.sign(v) === dir ? v : dir;
    const min = sprung ? rest : (Math.abs(rest) >= 0.95 && Math.sign(rest) === -dir ? rest : -dir);
    calib.result.t = { i, max, min };
    calib.used.add(i);
  } else if (st.key === 'tlo') {
    const t = calib.result.t;
    if (t && t.i !== i) calib.used.delete(t.i);
    const low = Math.abs(v) >= 0.3 ? Math.sign(v) : -1;
    const max = t && t.i === i ? t.max : -low;
    // A sprung stick's low is where it centres, wherever it is held now.
    const min = sprung ? rest : (Math.abs(v - max) >= 0.5 ? v : -(Math.sign(max) || 1));
    calib.result.t = { i, max, min };
    calib.used.add(i);
  } else {
    const d = v - rest;
    calib.result[st.key] = { i, sign: Math.abs(d) >= 0.3 ? (Math.sign(d) || 1) : 1 };
    calib.used.add(i);
  }
  calib.result.n = ax.length;
  calib.step++;
  clearSweep(calib);
  return { state: calib, done: calib.step >= CAL_STEPS.length, picked: true };
}

function listFromGetGamepads(getGamepads) {
  const pads = getGamepads ? getGamepads() : [];
  const out = [];
  if (!pads) return out;
  const n = pads.length;
  for (let i = 0; i < n; i++) if (pads[i]) out.push(pads[i]);
  return out;
}

// The remembered pad, unless a radio outranks it: a lone pad is remembered
// unasked (the first one Chrome shows), so an Xbox pad seen before the TX16S
// beside it must not keep the radio off the sticks. Among equals the
// remembered one wins.
// Only usable devices (usablePad): a remembered headset is passed over.
export function pickPreferredPad(pads, rememberedId, tracker) {
  const live = rankPads(pads, tracker);
  if (!live.length) return null;
  const best = live[0];
  const match = rememberedId && live.find((p) => p.id === rememberedId);
  return match && radioScore(match) >= radioScore(best) ? match : best;
}

// Node-testable radio session: mocked getGamepads + storage. Gamepad connected
// ⇒ touch off, saved ryflyAxisMap_<id> applied, empty polls keep last sticks.
export function createRadioRouter(opts) {
  const o = opts || {};
  const storage = storeOf(o.storage);
  const getGamepads = o.getGamepads || function () {
    try {
      return (typeof navigator !== 'undefined' && navigator.getGamepads)
        ? navigator.getGamepads() : [];
    } catch (e) { return []; }
  };
  const now = o.now || (() => Date.now());
  const tracker = createPadTracker();
  // Each device's kind, decided the first time it is picked and kept for the
  // session (its layout must not change in flight).
  const kinds = new Map();
  let pilotPick = '';
  let notice = '';
  let gpIndex = -1;
  let gpConnected = false;
  let gpName = '';
  let axisMap = null;
  let radioPreset = 'auto';
  let lastStick = { r: 0, p: 0, y: 0, t: 0 };
  let calib = null;

  function select(gp, remember) {
    gpIndex = gp.index;
    gpConnected = true;
    gpName = gp.id;
    if (remember && storage) {
      try { storage.setItem(GP_ID_KEY, gp.id); } catch (e) { /* ignore */ }
    }
    tracker.picked(gp, now());
    if (!kinds.has(gp.id)) kinds.set(gp.id, sessionKind(gp, tracker));
    const prof = loadRadioProfile(gp.id, storage);
    radioPreset = prof.radioPreset;
    axisMap = prof.axisMap;
    // A calibration made on another layout (Classic, now Advanced) is not
    // flown on this one; it stays saved for when the radio is back.
    if (axisMap && Number.isFinite(axisMap.n) && axisMap.n !== axisCount(gp)) axisMap = null;
    if (!axisMap) radioPreset = migrateNamePreset(gp, radioPreset, storage);
    // No saved calib → plug-and-fly the matching AETR preset (±1 throttle).
    if (!axisMap && kinds.get(gp.id)) {
      const guessed = presetGuess(gp, true);
      if (guessed !== 'pad' && (radioPreset === 'auto' || !RADIO_PRESETS[radioPreset] || !RADIO_PRESETS[radioPreset].map)) {
        radioPreset = guessed;
        saveRadioPreset(gp.id, radioPreset, storage);
      }
    }
  }

  function see() {
    const raw = listFromGetGamepads(getGamepads);
    tracker.see(raw, now());
    return raw;
  }

  // The usable devices, radios first (what Tune's device list offers).
  function list() {
    return rankPads(see(), tracker);
  }

  function pick() {
    const raw = see();
    notice = radioIssuePad(raw, storage) ? RADIO_CLASSIC_MSG : '';
    const pads = rankPads(raw, tracker);
    if (!pads.length) return null;
    // The device the pilot picked keeps the sticks while it is here.
    const kept = gpConnected && gpName === pilotPick && pads.find((p) => p.index === gpIndex && p.id === gpName);
    if (kept) return kept;
    let remembered = null;
    try { remembered = storage ? storage.getItem(GP_ID_KEY) : null; } catch (e) { /* ignore */ }
    const chosen = pickPreferredPad(pads, remembered);
    if (!chosen) return null;
    // A remembered device that is here but cannot fly (a headset picked by
    // mistake) is replaced by the one flying, unasked. One that is here and
    // only not offered yet (its sticks have not moved) keeps its place.
    const here = remembered ? raw.filter((p) => p.id === remembered) : [];
    // (A device here that cannot fly: fewer than 4 axes.)
    const cannot = here.length > 0 && here.every((p) => !usablePad(p));
    select(chosen, !remembered || chosen.id === remembered || cannot || (pads.length === 1 && !here.length));
    return chosen;
  }

  // Tune's device list: fly this one, and remember it.
  function selectId(id) {
    const gp = list().find((p) => p.id === id);
    if (!gp) return null;
    pilotPick = gp.id;
    select(gp, true);
    return gp;
  }

  // Tune's "forget this device" (the active one by default), then the best
  // connected one, as if it were never seen.
  function forget(id) {
    const target = id || rememberedId();
    if (!target) return false;
    forgetDevice(target, storage);
    if (pilotPick === target) pilotPick = '';
    kinds.delete(target);
    if (gpName === target) { drop(); axisMap = null; radioPreset = 'auto'; }
    pick();
    return true;
  }

  // The active device put down while another moves: that one, radios first,
  // remembered. Never while armed.
  function checkStale(info) {
    if (!gpConnected || (info && info.armed) || gpName === pilotPick) return null;
    const raw = see();
    const active = currentPad();
    const to = staleSwitchTarget(active, raw, tracker, now());
    if (to) select(to, true);
    return to;
  }

  function currentPad() {
    const pads = getGamepads() || [];
    if (gpIndex >= 0 && pads[gpIndex]) return pads[gpIndex];
    if (gpName) {
      const live = listFromGetGamepads(getGamepads);
      const same = live.find((p) => p.id === gpName);
      if (same) { gpIndex = same.index; return same; }
    }
    return null;
  }

  function drop() {
    if (pilotPick === gpName) pilotPick = '';
    gpIndex = -1;
    gpConnected = false;
    gpName = '';
  }

  function readStick() {
    see();
    const gp = currentPad();
    if (gpConnected) {
      if (!gp) return { source: 'gamepad', stick: lastStick, touch: false, emptyPoll: true };
      const map = effectiveAxisMap(axisMap, radioPreset, gp, takenForRadio());
      lastStick = applyAxisMap(gp.axes, map, { threeD: !!o.threeD });
      return { source: 'gamepad', stick: lastStick, touch: false, map, emptyPoll: false };
    }
    const touch = shouldEnableTouch({
      hasGamepad: false,
      inputChoice: o.inputChoice,
      mobile: o.mobile,
    });
    return { source: touch ? 'touch' : 'keyboard', stick: lastStick, touch, emptyPoll: false };
  }

  function startCalib() {
    if (!currentPad()) return false;
    calib = createCalibState();
    return true;
  }

  function tickCalib(dt) {
    const gp = currentPad();
    if (!gp || !calib) return { done: false, touch: false };
    const out = stepCalib(calib, gp, dt);
    calib = out.state;
    if (out.done) {
      axisMap = calib.result;
      radioPreset = 'custom';
      saveAxisMap(gpName, axisMap, storage);
      saveRadioPreset(gpName, 'custom', storage);
      calib = null;
      return { done: true, axisMap, touch: false };
    }
    return { done: false, label: out.label, hint: out.hint, touch: false };
  }

  // A radio by its kind when picked, unless the pilot chose the gamepad preset.
  function takenForRadio() {
    return !!kinds.get(gpName) && radioPreset !== 'pad';
  }

  function rememberedId() {
    if (gpName) return gpName;
    try { return storage ? storage.getItem(GP_ID_KEY) : ''; } catch (e) { return ''; }
  }

  function clearCalibration() {
    axisMap = null;
    radioPreset = 'auto';
    const id = rememberedId();
    clearRadioCalibration(id, storage);
    if (id) saveRadioPreset(id, 'auto', storage);
    return { axisMap, radioPreset, id };
  }

  return {
    pick,
    list,
    selectId,
    forget,
    checkStale,
    drop,
    readStick,
    startCalib,
    tickCalib,
    clearCalibration,
    touchAllowed(info) {
      return shouldEnableTouch(Object.assign({}, info || o, { hasGamepad: gpConnected, gamepadConnected: gpConnected }));
    },
    get gpConnected() { return gpConnected; },
    get gpName() { return gpName; },
    get gpIndex() { return gpIndex; },
    get axisMap() { return axisMap; },
    get radioPreset() { return radioPreset; },
    get lastStick() { return lastStick; },
    get calibrating() { return !!calib; },
    get notice() { return notice; },
    get kind() { const gp = currentPad(); return gp ? Object.assign(classifyPad(gp), { radio: takenForRadio() }) : null; },
  };
}
