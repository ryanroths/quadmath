// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// QuadMath sim — the bf core's sound. All Web Audio synthesis: no audio files,
// so nothing to license. Every voice reads the flying core's state
// (sim-core-adapter.js getState()) or its CONTACT events, never the sticks:
//   motors   two voices per motor on its rpm, crossfaded by that rpm from
//            TURTLE_RPM to FLIGHT_RPM (15 to 18 krpm):
//            - turtle: below 15 krpm (turtle, idle, spool-up) the voice as it
//              first shipped, unchanged: blade-pass at 3 blades (rpm / 20)
//              with its second harmonic;
//            - flight: the shaft rate (rpm / 60) loudest, the prop's
//              blade-pass (rpm / 60 x blades; rpm / 30 on the Air65's
//              2-blade 1219S) 6 dB under it, that harmonic's second 12 dB
//              under, all in one wave; 6 dB under the turtle voice overall,
//              through a 3 kHz lowpass.
//            Level from rpm squared. rpm is sim-core's motor model, which
//            follows vbat, so sag lowers the pitch by itself. A few cents of
//            fixed detune per motor make the four beat like a real whoop.
//   props    band-passed noise centred on twice the mean rpm's blade-pass,
//            level from total thrust over the airframe's maximum; across the
//            same crossfade (on the mean rpm) the band widens and comes up
//            3 dB, from the turtle voice's band to the flight voice's.
//   wind     low-passed noise, level from airspeed squared, cutoff rising
//            with speed.
//   contact  a thud per CONTACT event (floor and box alike), level from its
//            impact speed; a scrape loop while a box face is touched
//            (contactFlags bit 1) and the quad slides along it.
//   beeper   Betaflight's beeper (state.beeper). sim-core's FC readouts have
//            no beeper field yet, so state.beeper is null and the voice is
//            silent: nothing stands in for it.
// One mono bus: master volume, mute, a limiter, the destination. The
// AudioContext is made only once the browser has seen a user activation
// (unlock), so the page never trips the autoplay policy.

export const SOUND_VOL_KEY = 'quadmathSimSoundVol';
export const SOUND_MUTED_KEY = 'quadmathSimSoundMuted';
export const SOUND_VOL_DEFAULT = 0.6;

const MOTOR_DETUNE_CENTS = [-6, 4, -2, 7];
export const TURTLE_RPM = 15000;      // below: the turtle voice alone
export const FLIGHT_RPM = 18000;      // above: the flight voice alone
const TURTLE_BLADES = 3;              // the turtle voice's blade-pass, as it shipped
const TURTLE_HARMONIC = 0.45;         // its second harmonic
const MOTOR_GAIN = 0.035;             // turtle voice, per motor at hover rpm
const MOTOR_GAIN_MAX = 0.25;          // per motor
const FLIGHT_GAIN = 0.5;              // flight voice: 6 dB under the turtle voice
const FLIGHT_BLADE_PASS = 0.5;        // the prop's blade-pass, 6 dB under the shaft rate
const FLIGHT_HARMONIC = 0.25;         // its second harmonic, 12 dB under
export const FLIGHT_LOWPASS_HZ = 3000;
const PROP_GAIN = 0.22;               // at full thrust, the turtle band
const PROP_Q = 1.1;
const FLIGHT_PROP_GAIN = Math.SQRT2;  // the flight band: 3 dB up
const FLIGHT_PROP_Q = 0.5;            // and wider
const WIND_GAIN = 0.3;                // at WIND_REF_MS and above
const WIND_REF_MS = 20;
const SCRAPE_GAIN = 0.28;             // sliding at SCRAPE_REF_MS and above
const SCRAPE_REF_MS = 3;
const SCRAPE_HOLD_S = 0.12;           // contactFlags is the latest tick's: bridge the gaps
const BEEPER_HZ = 1600;
const BEEPER_GAIN = 0.12;
const THUD_MIN_MS = 0.3;              // impact speed below this is a touch, not a thud
const THUD_REF_MS = 5;
const THUD_GAP_S = 0.03;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function shaftHz(rpm) {
  return Math.abs(rpm) / 60;
}

export function bladePassHz(rpm, blades) {
  return shaftHz(rpm) * blades;
}

// How much of the flight voice: 0 up to TURTLE_RPM, 1 from FLIGHT_RPM, a
// smoothstep between.
export function flightMix(rpm) {
  const x = clamp((Math.abs(rpm) - TURTLE_RPM) / (FLIGHT_RPM - TURTLE_RPM), 0, 1);
  return x * x * (3 - 2 * x);
}

// Per motor, each voice's amplitude: rpm squared, hover rpm the reference.
export function motorLevels(rpm, rpmHover) {
  const r = Math.abs(rpm) / rpmHover;
  const level = clamp(MOTOR_GAIN * r * r, 0, MOTOR_GAIN_MAX);
  const w = flightMix(rpm);
  return { turtle: level * (1 - w), flight: FLIGHT_GAIN * level * w };
}

// The flight voice's wave over the shaft rate: harmonic 1, the prop's
// blade-pass at harmonic `blades`, and its second at 2 x blades.
export function flightWave(blades) {
  const imag = new Float32Array(2 * blades + 1);
  imag[1] += 1;
  imag[blades] += FLIGHT_BLADE_PASS;
  imag[2 * blades] += FLIGHT_HARMONIC;
  return imag;
}

// The prop noise band on the mean rpm: centre, Q and amplitude, the turtle
// band's below TURTLE_RPM and the flight band's from FLIGHT_RPM.
export function propBand(meanRpm, blades, thrustFrac) {
  const w = flightMix(meanRpm);
  const turtleHz = 2 * bladePassHz(meanRpm, TURTLE_BLADES);
  const flightHz = 2 * bladePassHz(meanRpm, blades);
  return {
    hz: clamp(turtleHz + (flightHz - turtleHz) * w, 300, 12000),
    q: PROP_Q + (FLIGHT_PROP_Q - PROP_Q) * w,
    gain: PROP_GAIN * clamp(thrustFrac, 0, 1) * (1 + (FLIGHT_PROP_GAIN - 1) * w),
  };
}

export function windLevel(speedMs) {
  const s = speedMs / WIND_REF_MS;
  return clamp(WIND_GAIN * s * s, 0, WIND_GAIN);
}

export function windCutoffHz(speedMs) {
  return clamp(250 + 180 * speedMs, 250, 8000);
}

export function thudLevel(impactMs, crashed) {
  if (!(impactMs >= THUD_MIN_MS)) return 0;
  return clamp(impactMs / THUD_REF_MS, 0, 1) * (crashed ? 1 : 0.6);
}

// The prop's blade count: the airframe's own field if it has one (bladeCount,
// or blades), else what its prop record says ("Gemfan 1219, 3 blades"), else
// the fallback (the page's build).
export function airframeBlades(airframe, fallback = 2) {
  const v = airframe && airframe.values;
  for (const k of ['bladeCount', 'blades']) {
    if (v && v[k] && Number.isInteger(v[k].value) && v[k].value > 0) return v[k].value;
  }
  const text = [airframe && airframe.name, v && v.propDiameter && v.propDiameter.source].join(' ');
  const m = /(\d)[- ]blades?\b/i.exec(text);
  return m ? +m[1] : fallback;
}

function storeOf(storage) {
  return storage || (typeof localStorage !== 'undefined' ? localStorage : null);
}

export function loadSoundPrefs(storage) {
  const store = storeOf(storage);
  let vol = SOUND_VOL_DEFAULT;
  let muted = false;
  if (!store) return { vol, muted };
  try {
    const v = parseFloat(store.getItem(SOUND_VOL_KEY));
    if (Number.isFinite(v)) vol = clamp(v, 0, 1);
    muted = store.getItem(SOUND_MUTED_KEY) === '1';
  } catch (e) { /* private mode: defaults */ }
  return { vol, muted };
}

export function saveSoundPrefs({ vol, muted }, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try {
    store.setItem(SOUND_VOL_KEY, String(vol));
    store.setItem(SOUND_MUTED_KEY, muted ? '1' : '0');
  } catch (e) { /* ignore quota / private mode */ }
}

// Whether the browser lets an AudioContext start now: a user activation seen
// (a key, click or tap; a gamepad alone is not one in Chrome), or Firefox's
// autoplay policy saying so. Without the activation API, try.
function audioAllowed() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = nav && nav.userActivation;
  if (ua && ua.hasBeenActive) return true;
  if (nav && typeof nav.getAutoplayPolicy === 'function') {
    try { if (nav.getAutoplayPolicy('audiocontext') === 'allowed') return true; } catch (e) { /* ignore */ }
  }
  return !ua;
}

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// Grit for the scrape: noise in short grains of random length and weight.
function scrapeBuffer(ctx) {
  const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.5), ctx.sampleRate);
  const d = b.getChannelData(0);
  let i = 0;
  while (i < d.length) {
    const n = Math.round(ctx.sampleRate * (0.004 + Math.random() * 0.03));
    const w = Math.random() < 0.3 ? 1 : 0.15 + Math.random() * 0.35;
    for (let k = 0; k < n && i < d.length; k++, i++) d[i] = (Math.random() * 2 - 1) * w;
  }
  return b;
}

// opts.AudioContext: the constructor (defaults to the browser's).
export function createSimAudio(opts = {}) {
  const AC = opts.AudioContext
    || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
  const prefs = loadSoundPrefs(opts.storage);
  let vol = prefs.vol;
  let muted = prefs.muted;
  let blades = 3;
  let rpmHover = 32000;
  let maxThrustN = 1;
  let ctx = null;
  let g = null;                 // the graph, once unlocked
  let wallAt = -1;              // ctx time a box face was last touched
  let lastThudAt = -1;
  let thuds = 0;
  const motorHz = [0, 0, 0, 0];      // the flight voice: shaft rate
  const flightGain = [0, 0, 0, 0];
  const turtleHz = [0, 0, 0, 0];     // the turtle voice: blade-pass at 3 blades
  const turtleGain = [0, 0, 0, 0];
  const t = { propHz: 0, propQ: PROP_Q, propGain: 0, windHz: 0, windGain: 0, scrapeGain: 0, scrapeRate: 1, beeper: 0 };

  const masterLevel = () => (muted ? 0 : vol);

  function build() {
    const c = ctx;
    const master = c.createGain();
    master.gain.value = masterLevel();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter);
    limiter.connect(c.destination);
    const voice = (level = 0) => {
      const v = c.createGain();
      v.gain.value = level;
      v.connect(master);
      return v;
    };
    // Motors: each voice's harmonics ride in its wave, so one oscillator a
    // voice, two a motor. The flight voices share the 3 kHz lowpass.
    const turtleWave = c.createPeriodicWave(new Float32Array([0, 0, 0]), new Float32Array([0, 1, TURTLE_HARMONIC]));
    const flightLow = c.createBiquadFilter();
    flightLow.type = 'lowpass';
    flightLow.frequency.value = FLIGHT_LOWPASS_HZ;
    flightLow.Q.value = Math.SQRT1_2;
    flightLow.connect(master);
    const oscillator = (wave, cents, out) => {
      const osc = c.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = 0;
      osc.detune.value = cents;
      const gain = c.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(out);
      osc.start();
      return { osc, gain };
    };
    const motors = MOTOR_DETUNE_CENTS.map((cents) => ({
      turtle: oscillator(turtleWave, cents, master),
      flight: oscillator(flightPeriodicWave(c), cents, flightLow),
    }));
    const noise = noiseBuffer(c, 2);
    const loop = (buffer, offset) => {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start(0, offset);
      return src;
    };
    const propSrc = loop(noise, 0);
    const propBand = c.createBiquadFilter();
    propBand.type = 'bandpass';
    propBand.frequency.value = 1000;
    propBand.Q.value = 1.1;
    const prop = voice();
    propSrc.connect(propBand);
    propBand.connect(prop);
    const windSrc = loop(noise, 1);
    const windLow = c.createBiquadFilter();
    windLow.type = 'lowpass';
    windLow.frequency.value = 250;
    windLow.Q.value = 0.5;
    const wind = voice();
    windSrc.connect(windLow);
    windLow.connect(wind);
    const scrapeSrc = loop(scrapeBuffer(c), 0);
    const scrapeBand = c.createBiquadFilter();
    scrapeBand.type = 'bandpass';
    scrapeBand.frequency.value = 2400;
    scrapeBand.Q.value = 0.7;
    const scrape = voice();
    scrapeSrc.connect(scrapeBand);
    scrapeBand.connect(scrape);
    const beepOsc = c.createOscillator();
    beepOsc.type = 'square';
    beepOsc.frequency.value = BEEPER_HZ;
    const beep = voice();
    beepOsc.connect(beep);
    beepOsc.start();
    return {
      master, limiter, motors, flightLow, noise, propSrc, propBand, prop, windSrc, windLow, wind,
      scrapeSrc, scrape, beepOsc, beep, voice,
    };
  }

  const ramp = (param, v, tc) => param.setTargetAtTime(v, ctx.currentTime, tc);
  const flightPeriodicWave = (c) => {
    const imag = flightWave(blades);
    return c.createPeriodicWave(new Float32Array(imag.length), imag);
  };

  function quiet() {
    for (let i = 0; i < 4; i++) {
      flightGain[i] = 0;
      turtleGain[i] = 0;
    }
    t.propGain = 0;
    t.windGain = 0;
    t.scrapeGain = 0;
    t.beeper = 0;
  }

  function apply() {
    for (let i = 0; i < 4; i++) {
      const m = g.motors[i];
      ramp(m.flight.osc.frequency, motorHz[i], 0.015);
      ramp(m.flight.gain.gain, flightGain[i], 0.02);
      ramp(m.turtle.osc.frequency, turtleHz[i], 0.015);
      ramp(m.turtle.gain.gain, turtleGain[i], 0.02);
    }
    ramp(g.propBand.frequency, t.propHz || 300, 0.03);
    ramp(g.propBand.Q, t.propQ, 0.03);
    ramp(g.prop.gain, t.propGain, 0.03);
    ramp(g.windLow.frequency, t.windHz || 250, 0.08);
    ramp(g.wind.gain, t.windGain, 0.08);
    ramp(g.scrapeSrc.playbackRate, t.scrapeRate, 0.05);
    ramp(g.scrape.gain, t.scrapeGain, t.scrapeGain > 0 ? 0.02 : 0.06);
    ramp(g.beep.gain, t.beeper, 0.004);
  }

  const api = {
    get context() { return ctx; },
    // Where another synth joins the bus (the js core's thrust synth).
    get input() { return g ? g.master : null; },
    get volume() { return vol; },
    get muted() { return muted; },
    // A user gesture: make the context (once the browser allows it) or wake
    // it. false when the browser has not allowed audio yet.
    unlock() {
      if (!AC) return false;
      if (!ctx) {
        if (!audioAllowed()) return false;
        ctx = new AC();
        g = build();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    },
    setVolume(v) {
      vol = clamp(Number(v) || 0, 0, 1);
      if (g) ramp(g.master.gain, masterLevel(), 0.03);
      saveSoundPrefs({ vol, muted }, opts.storage);
      return vol;
    },
    setMuted(on) {
      muted = !!on;
      if (g) ramp(g.master.gain, masterLevel(), 0.03);
      saveSoundPrefs({ vol, muted }, opts.storage);
      return muted;
    },
    // The plant the bf core flies: blade count, hover rpm, maximum total thrust (N).
    setAirframe(a) {
      if (a.blades > 0 && a.blades !== blades) {
        blades = a.blades;
        if (g) for (const m of g.motors) m.flight.osc.setPeriodicWave(flightPeriodicWave(ctx));
      }
      if (a.rpmHover > 0) rpmHover = a.rpmHover;
      if (a.maxThrustN > 0) maxThrustN = a.maxThrustN;
    },
    // Once a frame with the core's state (module frame, SI), or null while
    // the sim is paused. Only a bf state has rpm: anything else is silence.
    update(s) {
      if (!g) return;
      if (!s || s.kind !== 'bf' || !s.rpm) {
        quiet();
        apply();
        return;
      }
      let sum = 0;
      for (let i = 0; i < 4; i++) {
        const rpm = s.rpm[i];
        sum += Math.abs(rpm);
        const level = motorLevels(rpm, rpmHover);
        motorHz[i] = shaftHz(rpm);
        flightGain[i] = level.flight;
        turtleHz[i] = bladePassHz(rpm, TURTLE_BLADES);
        turtleGain[i] = level.turtle;
      }
      const band = propBand(sum / 4, blades, s.totalThrustAbsN / maxThrustN);
      t.propHz = band.hz;
      t.propQ = band.q;
      t.propGain = band.gain;
      const v = s.velocity;
      const speed = Math.hypot(v.x, v.y, v.z);
      t.windHz = windCutoffHz(speed);
      t.windGain = windLevel(speed);
      const now = ctx.currentTime;
      if (s.contactFlags & 2) wallAt = now;
      const sliding = wallAt >= 0 && now - wallAt < SCRAPE_HOLD_S;
      t.scrapeGain = sliding ? SCRAPE_GAIN * clamp(speed / SCRAPE_REF_MS, 0, 1) : 0;
      t.scrapeRate = clamp(0.6 + 0.25 * speed, 0.6, 2);
      t.beeper = s.beeper === true ? BEEPER_GAIN : 0;
      apply();
    },
    // A CONTACT event: impact speed (m/s) and whether it was a crash.
    contact(impactMs, crashed) {
      if (!g || ctx.state !== 'running') return;
      const level = thudLevel(impactMs, crashed);
      const now = ctx.currentTime;
      if (!level || now - lastThudAt < THUD_GAP_S) return;
      lastThudAt = now;
      thuds++;
      const end = now + (crashed ? 0.35 : 0.22);
      // Body: a sine dropping from 120 to 45 Hz.
      const body = ctx.createOscillator();
      body.frequency.setValueAtTime(120, now);
      body.frequency.exponentialRampToValueAtTime(45, end);
      const bodyGain = g.voice(0);
      bodyGain.gain.setValueAtTime(0, now);
      bodyGain.gain.linearRampToValueAtTime(0.9 * level, now + 0.003);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, end);
      body.connect(bodyGain);
      // Knock: a few ms of low-passed noise on the attack.
      const knock = ctx.createBufferSource();
      knock.buffer = g.noise;
      const knockLow = ctx.createBiquadFilter();
      knockLow.type = 'lowpass';
      knockLow.frequency.value = 900 + 1500 * level;
      const knockGain = g.voice(0);
      knockGain.gain.setValueAtTime(0.5 * level, now);
      knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      knock.connect(knockLow);
      knockLow.connect(knockGain);
      body.start(now);
      body.stop(end + 0.02);
      knock.start(now, Math.random());
      knock.stop(now + 0.08);
      // Let go of the voices once both have stopped.
      body.onended = () => { bodyGain.disconnect(); knockGain.disconnect(); };
    },
    // What the test reads: the graph and each voice's live parameters.
    debug() {
      if (!g) return { state: ctx ? ctx.state : 'none', graph: false };
      return {
        state: ctx.state,
        graph: true,
        sampleRate: ctx.sampleRate,
        time: ctx.currentTime,
        master: g.master.gain.value,
        motors: g.motors.length,
        oscillators: 2 * g.motors.length,
        motorHz: g.motors.map((m) => m.flight.osc.frequency.value),
        motorTargetHz: motorHz.slice(),
        flightGain: g.motors.map((m) => m.flight.gain.gain.value),
        turtleHz: g.motors.map((m) => m.turtle.osc.frequency.value),
        turtleGain: g.motors.map((m) => m.turtle.gain.gain.value),
        detune: g.motors.map((m) => m.flight.osc.detune.value),
        flightLowpassHz: g.flightLow.frequency.value,
        propHz: g.propBand.frequency.value,
        propQ: g.propBand.Q.value,
        propGain: g.prop.gain.value,
        windHz: g.windLow.frequency.value,
        windGain: g.wind.gain.value,
        windTargetHz: t.windHz,
        windTargetGain: t.windGain,
        scrapeGain: g.scrape.gain.value,
        beeperGain: g.beep.gain.value,
        thuds,
        blades,
      };
    },
  };
  return api;
}
