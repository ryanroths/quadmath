// QuadMath sim M1 feel — first-run, tutorial, HUD, rate presets, aux helpers.
// Keep physics in quadphysics.js. Do not touch racing track layouts or ghosts.
// New localStorage keys: quadmathSimInputChoice, quadmathSimFloatiness,
//   quadmathSimFov.
// Nothing here is copied from WebFPV.

import { makeWorldLabel } from './sim-art.js?v=04bdd26eda39';

export const INPUT_CHOICE_KEY = 'quadmathSimInputChoice';
export const FLOATINESS_KEY = 'quadmathSimFloatiness';
export const FOV_KEY = 'quadmathSimFov';
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
  // Ryan / RyFly Actual: center 40, max 740/740/700, expo 0.56 (stored = CLI for ACTUAL).
  ryanActual: {
    label: 'Ryan Actual',
    type: 'ACTUAL',
    roll:  { rcRate: 4, srate: 74, expo: 0.56 },
    pitch: { rcRate: 4, srate: 74, expo: 0.56 },
    yaw:   { rcRate: 4, srate: 70, expo: 0.56 },
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

export function auxValue(gp, map) {
  if (!gp || !map) return null;
  if (map.button != null) {
    const b = gp.buttons && gp.buttons[map.button];
    if (!b) return 0;
    return (b.pressed || b.value > 0.5) ? 1 : -1;
  }
  if (map.i == null) return null;
  const v = gp.axes[map.i];
  return typeof v === 'number' ? v * (map.sign || 1) : 0;
}

export function modeFromAux(v) {
  if (v == null || Number.isNaN(v)) return null;
  if (v < -0.33) return 'angle';
  if (v > 0.33) return 'acro';
  return 'horizon';
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
  if (!(upZ < STUCK_UP_Z)) return false;
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

// East of the default spawn, facing +Z (away from the afternoon sun) so the
// hover column and gates are readable. Independent of racing gate coordinates.
const TUTORIAL_ORIGIN = { x: 36, y: 0, z: 44 };
const TUTORIAL_YAW = Math.PI;
const TUTORIAL_STEPS = ['arm', 'hover', 'gate1', 'gate2', 'gate3', 'land', 'done'];

function stepCopy(step) {
  switch (step) {
    case 'arm': return 'Press Space to arm.';
    case 'hover': return 'Hover in the glow — hold altitude for a moment.';
    case 'gate1': return 'Fly through the first marked gate.';
    case 'gate2': return 'Second gate — keep it smooth.';
    case 'gate3': return 'Last gate, then the pad.';
    case 'land': return 'Land on the pad (low and slow).';
    case 'done': return 'Nice. You can fly a real lap now.';
    default: return '';
  }
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
  const dotL = document.getElementById('stickDotL');
  const dotR = document.getElementById('stickDotR');
  const hudThr = document.getElementById('hudThr');
  const hudBatt = document.getElementById('hudBatt');
  const hudMode = document.getElementById('hudMode');
  const hudArm = document.getElementById('hudArm');

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
    const st = s.stick || { r: 0, p: 0, y: 0, t: 0 };
    if (dotL) {
      dotL.style.left = (50 + st.y * 42) + '%';
      dotL.style.top = (92 - st.t * 84) + '%';
    }
    if (dotR) {
      dotR.style.left = (50 + st.r * 42) + '%';
      dotR.style.top = (50 - st.p * 42) + '%';
    }
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

  function showFirstRun(info) {
    if (!promptEl) return;
    promptOpen = true;
    const has = !!(info && info.hasGamepad);
    const mobile = !!(info && info.mobile);
    const touchy = !!(info && (info.touch || info.mobile));
    const name = (info && info.gpName) ? String(info.gpName).slice(0, 48) : '';
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

  function noteFlip(info) {
    const payload = typeof info === 'boolean' ? { upsideDown: info } : (info || {});
    const dt = payload.dt == null ? 0 : +payload.dt;
    stuckHoldS = stepStuckHold(stuckHoldS, payload, dt);
    if (!shouldToastFlip({ ...payload, heldS: stuckHoldS })) return;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    if (now - flippedToastAt < 2500) return;
    flippedToastAt = now;
    if (toast) toast('FLIPPED — R TO RESPAWN');
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
    auxValue,
    modeFromAux,
  };
}
