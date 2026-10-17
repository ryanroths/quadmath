// QuadMath sim W6 — touch sticks, mobile boot, default flight mode.
// Dual virtual sticks, deadzone/expo, angle-first newcomers, lazy-load hooks.
// Ideas only — nothing here is copied from WebFPV (GPL) or other simulators.
// New localStorage keys: quadmathSimTouch, quadmathSimFlightMode.
// Per-device radio keys (load/save only, never wipe other ryfly* data):
//   ryflyAxisMap_<id>, ryflyRadioPreset_<id>, ryflyGamepadId.
// Do not write old ryfly* keys (the global ryflyAxisMap / ryflyRadioPreset).

export const TOUCH_KEY = 'quadmathSimTouch';
export const FLIGHT_MODE_KEY = 'quadmathSimFlightMode';

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
    return !!(coarse && (touch || small));
  } catch (e) { return false; }
}

export function resolveAutoQuality(info) {
  const i = info || {};
  if (i.mobile || i.gpuLow) return 'low';
  return 'med';
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

// First visit / no saved settings → angle. A stored mode wins.
export function defaultFlightMode(storage) {
  return loadFlightMode(storage) || 'angle';
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
  if (i.inputChoice === 'keyboard' || i.inputChoice === 'calibrate') return false;
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
    if (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea')) return;
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

export function isRadio(gp) {
  const id = gp && gp.id != null ? String(gp.id) : '';
  return /opentx|edgetx|radiomaster|tx16|frsky|taranis|jumper|betafpv|flysky/i.test(id);
}

export function radioScore(gp) {
  if (!gp) return 0;
  if (/tx16|zorro|edgetx|opentx|joystick|1209|radiomaster|frsky|taranis|jumper|betafpv|flysky/i.test(gp.id || '')) return 2;
  if (gp.mapping === 'standard') return 0;
  return 1;
}

// EdgeTX/OpenTX joystick, AETR: 0=roll 1=pitch 2=throttle 3=yaw
export const AETR_MAP = Object.freeze({
  r: Object.freeze({ i: 0, sign: 1 }),
  p: Object.freeze({ i: 1, sign: -1 }),
  y: Object.freeze({ i: 3, sign: 1 }),
  t: Object.freeze({ i: 2, min: -1, max: 1 }),
});
// Spring gamepad, mode 2: LX=yaw LY=thr RX=roll RY=pitch
export const PAD_MAP = Object.freeze({
  r: Object.freeze({ i: 2, sign: 1 }),
  p: Object.freeze({ i: 3, sign: -1 }),
  y: Object.freeze({ i: 0, sign: 1 }),
  t: Object.freeze({ i: 1, min: 0, max: -1, spring: true }),
});

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
      p: Object.freeze({ i: 2, sign: -1 }),
      y: Object.freeze({ i: 3, sign: 1 }),
    }),
  },
  flysky: { label: 'FlySky (AETR)', map: AETR_MAP },
  pad: { label: 'Xbox / PlayStation controller', map: PAD_MAP },
  custom: { label: 'Custom — run calibration', map: null },
});

export function effectiveAxisMap(axisMap, radioPreset, gp) {
  if (axisMap) return axisMap;
  const preset = RADIO_PRESETS[radioPreset];
  if (preset && preset.map) return preset.map;
  return defaultMapFor(gp);
}

function axisAt(axes, i) {
  const v = axes && axes[i];
  return Number.isFinite(v) ? v : 0;
}

export function applyAxisMap(axes, map) {
  const m = map || AETR_MAP;
  const dz = (v, d) => (Math.abs(v) < (d == null ? 0.03 : d) ? 0 : v);
  const r = dz(axisAt(axes, m.r.i) * (m.r.sign || 1));
  const p = dz(axisAt(axes, m.p.i) * (m.p.sign || 1));
  const y = dz(axisAt(axes, m.y.i) * (m.y.sign || 1));
  const traw = axisAt(axes, m.t.i);
  let t;
  if (m.t && m.t.spring) {
    t = clamp(-traw, 0, 1);
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
  try { store.setItem(AXIS_MAP_PREFIX + sanitizeId(id), JSON.stringify(axisMap)); }
  catch (e) { /* ignore quota / private mode */ }
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
  { key: 'arm', label: 'ARM SWITCH — FLIP IT', hint: 'or Skip Aux and use Space' },
  { key: 'mode', label: 'MODE SWITCH — MOVE IT', hint: '3-pos Angle / Horizon / Acro — or Skip Aux' },
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
}

export function skipCalibAux(calib) {
  const st = CAL_STEPS[calib.step];
  if (st && (st.key === 'arm' || st.key === 'mode')) {
    calib.step++;
    clearSweep(calib);
  }
  return { state: calib, done: calib.step >= CAL_STEPS.length };
}

export function stepCalib(calib, gp, dt) {
  const st = CAL_STEPS[calib.step];
  if (!st || !gp) {
    return { state: calib, done: false, skipAux: false, label: '', hint: '' };
  }
  const ax = listAxes(gp);
  const skipAux = st.key === 'arm' || st.key === 'mode';
  const ui = { state: calib, done: false, skipAux, label: st.label, hint: st.hint };

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
      // must not lock max too early.
      if (Math.abs(live) < 0.95 && Math.abs(peak) < 0.95) hit = null;
    }
    if (hit) {
      calib.timer += dt;
      if (calib.timer > 0.1) {
        const rail = Math.abs(ax[hit.i]) >= Math.abs(hit.max) ? ax[hit.i] : hit.max;
        calib.result.t = { i: hit.i, max: rail, min: hit.min };
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
  if (st.key === 'arm' || st.key === 'mode') {
    const moved = bestUnusedAxis(ax, calib.center, calib.used, 0.5);
    if (moved) {
      calib.timer += dt;
      if (calib.timer > 0.45) {
        calib.result[st.key] = { i: moved.i, sign: Math.sign(moved.d) || 1 };
        calib.used.add(moved.i);
        calib.step++;
        clearSweep(calib);
        ui.done = calib.step >= CAL_STEPS.length;
      }
    } else {
      let btn = -1;
      if (gp.buttons) {
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.6)) { btn = i; break; }
        }
      }
      if (btn >= 0) {
        calib.timer += dt;
        if (calib.timer > 0.35) {
          calib.result[st.key] = { button: btn };
          calib.step++;
          clearSweep(calib);
          ui.done = calib.step >= CAL_STEPS.length;
        }
      } else calib.timer = 0;
    }
    return ui;
  }
  // r / p / y: still a hold on a self-centering gimbal, but never assign an
  // axis that was already at an extreme during CENTER (the throttle), and
  // never an aux pot resting at -1.
  const moved = bestUnusedAxis(ax, calib.center, calib.used, 0.6, skipForStick(calib, ax));
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

function listFromGetGamepads(getGamepads) {
  const pads = getGamepads ? getGamepads() : [];
  const out = [];
  if (!pads) return out;
  const n = pads.length;
  for (let i = 0; i < n; i++) if (pads[i]) out.push(pads[i]);
  return out;
}

export function pickPreferredPad(pads, rememberedId) {
  const live = (pads || []).filter(Boolean);
  if (!live.length) return null;
  const match = rememberedId && live.find((p) => p.id === rememberedId);
  if (match) return match;
  live.sort((a, b) => radioScore(b) - radioScore(a));
  return live[0];
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
    const prof = loadRadioProfile(gp.id, storage);
    radioPreset = prof.radioPreset;
    axisMap = prof.axisMap;
  }

  function pick() {
    const pads = listFromGetGamepads(getGamepads);
    if (!pads.length) return null;
    let remembered = null;
    try { remembered = storage ? storage.getItem(GP_ID_KEY) : null; } catch (e) { /* ignore */ }
    const chosen = pickPreferredPad(pads, remembered);
    if (!chosen) return null;
    select(chosen, !remembered || chosen.id === remembered || pads.length === 1);
    return chosen;
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
    gpIndex = -1;
    gpConnected = false;
    gpName = '';
  }

  function readStick() {
    const gp = currentPad();
    if (gpConnected) {
      if (!gp) return { source: 'gamepad', stick: lastStick, touch: false, emptyPoll: true };
      const map = effectiveAxisMap(axisMap, radioPreset, gp);
      lastStick = applyAxisMap(gp.axes, map);
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
    return { done: false, skipAux: out.skipAux, label: out.label, hint: out.hint, touch: false };
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
    drop,
    readStick,
    startCalib,
    tickCalib,
    clearCalibration,
    skipCalibAux() {
      if (!calib) return { done: false };
      const out = skipCalibAux(calib);
      calib = out.state;
      if (out.done) {
        axisMap = calib.result;
        radioPreset = 'custom';
        saveAxisMap(gpName, axisMap, storage);
        saveRadioPreset(gpName, 'custom', storage);
        calib = null;
        return { done: true, axisMap };
      }
      return { done: false };
    },
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
  };
}
