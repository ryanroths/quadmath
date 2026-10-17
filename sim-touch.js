// QuadMath sim W6 — touch sticks, mobile boot, default flight mode.
// Dual virtual sticks, deadzone/expo, angle-first newcomers, lazy-load hooks.
// Ideas only — nothing here is copied from WebFPV (GPL) or other simulators.
// New localStorage keys: quadmathSimTouch, quadmathSimFlightMode.
// Do not write old ryfly* keys.

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
  if (i.inputChoice === 'touch') return true;
  if (i.inputChoice === 'keyboard' || i.inputChoice === 'calibrate') return false;
  return !!i.mobile;
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
