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
  const state = {
    left: { x: 0, y: settings.thrSpring || settings.mode === 1 ? 0 : -1 },
    right: { x: 0, y: 0 },
    active: { L: null, R: null },
    enabled: false,
  };
  if (settings.mode === 1 && !settings.thrSpring) state.right.y = -1;

  function holdYFor(side) {
    if (settings.thrSpring) return false;
    if (settings.mode === 2) return side === 'L';
    return side === 'R';
  }

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
    read,
    shaped,
    get settings() { return settings; },
    get state() { return state; },
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
  } catch (e) {
    radioPreset = 'auto';
    axisMap = null;
  }
  return { radioPreset, axisMap };
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
  return { step: 0, timer: 0, center: null, result: {}, used: new Set() };
}

function bestUnusedAxis(ax, center, used, minAbs) {
  let best = -1, bestD = 0;
  for (let i = 0; i < ax.length; i++) {
    if (used.has(i)) continue;
    const d = ax[i] - center[i];
    if (Math.abs(d) > Math.abs(bestD)) { bestD = d; best = i; }
  }
  if (best >= 0 && Math.abs(bestD) > minAbs) return { i: best, d: bestD };
  return null;
}

export function skipCalibAux(calib) {
  const st = CAL_STEPS[calib.step];
  if (st && (st.key === 'arm' || st.key === 'mode')) {
    calib.step++;
    calib.timer = 0;
  }
  return { state: calib, done: calib.step >= CAL_STEPS.length };
}

export function stepCalib(calib, gp, dt) {
  const st = CAL_STEPS[calib.step];
  if (!st || !gp) {
    return { state: calib, done: false, skipAux: false, label: '', hint: '' };
  }
  const ax = gp.axes;
  const skipAux = st.key === 'arm' || st.key === 'mode';
  const ui = { state: calib, done: false, skipAux, label: st.label, hint: st.hint };

  if (st.key === 'center') {
    calib.timer += dt;
    if (calib.timer > 1) {
      calib.center = Array.prototype.slice.call(ax);
      calib.step++;
      calib.timer = 0;
    }
    ui.done = calib.step >= CAL_STEPS.length;
    return ui;
  }
  if (st.key === 'tlo') {
    const ti = calib.result.t.i;
    const d = ax[ti] - calib.result.t.max;
    if (Math.abs(d) > 0.8) {
      calib.timer += dt;
      if (calib.timer > 0.6) {
        calib.result.t.min = ax[ti];
        calib.step++;
        calib.timer = 0;
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
        calib.timer = 0;
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
          calib.timer = 0;
          ui.done = calib.step >= CAL_STEPS.length;
        }
      } else calib.timer = 0;
    }
    return ui;
  }
  const moved = bestUnusedAxis(ax, calib.center, calib.used, 0.6);
  if (moved) {
    calib.timer += dt;
    if (calib.timer > 0.6) {
      if (st.key === 'thi') {
        calib.result.t = { i: moved.i, max: ax[moved.i], min: 0 };
      } else {
        calib.result[st.key] = { i: moved.i, sign: Math.sign(moved.d) };
      }
      calib.used.add(moved.i);
      calib.step++;
      calib.timer = 0;
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
      saveAxisMap(gpName, axisMap, storage);
      calib = null;
      return { done: true, axisMap, touch: false };
    }
    return { done: false, skipAux: out.skipAux, label: out.label, hint: out.hint, touch: false };
  }

  return {
    pick,
    drop,
    readStick,
    startCalib,
    tickCalib,
    skipCalibAux() {
      if (!calib) return { done: false };
      const out = skipCalibAux(calib);
      calib = out.state;
      if (out.done) {
        axisMap = calib.result;
        saveAxisMap(gpName, axisMap, storage);
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
