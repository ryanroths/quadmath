/* QuadMath blackbox metrics engine.
   Pure functions over typed arrays. No DOM, no WASM, no globals — runs in the
   analysis worker and in Node (tools/test_blackbox_metrics.mjs). Everything the
   findings page shows is computed here from one `extractLog()` record:

     { fs, n, t, gyro[3], gyroRaw[3]|null, setpoint[3], pidP[3], pidI[3],
       pidD[2..3], pidF[3], throttle, motors[4], vbat, amps, motorRange }

   Methods, so the numbers are defensible rather than vibes:
   - Noise: Welch PSD (Hann, 50% overlap) on in-flight samples only.
   - Step response: Wiener deconvolution of setpoint -> gyro over sliding
     windows, weighted by input amplitude. Same family as PID-Analyzer / PTB.
   - Everything else is band power, RMS, or plain counting. */

'use strict';

// ---------- small numeric helpers ----------

export function mean(a, from = 0, to = a.length) {
  let s = 0; const n = to - from;
  if (n <= 0) return 0;
  for (let i = from; i < to; i++) s += a[i];
  return s / n;
}

export function rms(a, from = 0, to = a.length) {
  let s = 0; const n = to - from;
  if (n <= 0) return 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / n);
}

export function percentile(a, p) {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
  return s[idx];
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// In-place iterative radix-2 FFT on split re/im Float64Arrays. Length must be
// a power of two. Small, dependency-free, fast enough for a few thousand
// windows of 1024 points in a worker.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export function ifft(re, im) {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
}

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  return w;
}

// ---------- flight segmentation ----------

/* Which samples count as "flying". Armed-on-the-bench data is dominated by
   idle motor noise and would poison every spectrum, so everything spectral
   is gated on throttle. Returns a Uint8Array mask plus the fraction. */
export function flightMask(throttle, minThrottle = 0.15) {
  const n = throttle.length;
  const mask = new Uint8Array(n);
  let c = 0;
  for (let i = 0; i < n; i++) if (throttle[i] >= minThrottle) { mask[i] = 1; c++; }
  return { mask, fraction: n ? c / n : 0 };
}

// ---------- Welch PSD ----------

/* Welch-averaged one-sided PSD in dB. `sig` in native units (deg/s for gyro).
   Windows that are not fully in flight are skipped. Returns
   { freq: Float32Array, db: Float32Array, windows } where db is 10*log10 of
   the power spectral density (per Hz). Returns null with < 4 usable windows. */
export function welch(sig, fs, mask, nfft = 1024, throttleBand = null, throttle = null) {
  const n = sig.length;
  nfft = Math.min(nfft, nextPow2(n) >> 1);
  if (nfft < 64) return null;
  const hop = nfft >> 1;
  const w = hann(nfft);
  let wsum = 0; for (let i = 0; i < nfft; i++) wsum += w[i] * w[i];
  const half = nfft >> 1;
  const acc = new Float64Array(half + 1);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  let windows = 0;
  for (let s = 0; s + nfft <= n; s += hop) {
    let ok = true;
    if (mask) for (let i = s; i < s + nfft; i += 16) if (!mask[i]) { ok = false; break; }
    if (!ok) continue;
    if (throttleBand && throttle) {
      const m = mean(throttle, s, s + nfft);
      if (m < throttleBand[0] || m >= throttleBand[1]) continue;
    }
    let mu = mean(sig, s, s + nfft);
    for (let i = 0; i < nfft; i++) { re[i] = (sig[s + i] - mu) * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= half; k++) {
      let p = (re[k] * re[k] + im[k] * im[k]) / (fs * wsum);
      if (k > 0 && k < half) p *= 2;
      acc[k] += p;
    }
    windows++;
  }
  if (windows < 4) return null;
  const freq = new Float32Array(half + 1), db = new Float32Array(half + 1);
  for (let k = 0; k <= half; k++) {
    freq[k] = k * fs / nfft;
    db[k] = 10 * Math.log10(acc[k] / windows + 1e-12);
  }
  return { freq, db, windows };
}

/* Peaks above a running noise floor. The floor is a wide median so a broad
   hump does not count as a peak but a narrow resonance does. Returns up to
   `max` peaks sorted by prominence, each { hz, db, prominence }. */
export function findPeaks(psd, { minHz = 20, maxHz = Infinity, minProm = 8, max = 5 } = {}) {
  if (!psd) return [];
  const { freq, db } = psd;
  const n = db.length;
  const binHz = freq[1] - freq[0];
  const halfWin = Math.max(3, Math.round(40 / binHz)); // ~80 Hz median window
  const floor = new Float32Array(n);
  const buf = [];
  for (let k = 0; k < n; k++) {
    buf.length = 0;
    for (let j = Math.max(0, k - halfWin); j <= Math.min(n - 1, k + halfWin); j++) buf.push(db[j]);
    floor[k] = percentile(buf, 0.5);
  }
  const peaks = [];
  for (let k = 2; k < n - 2; k++) {
    if (freq[k] < minHz || freq[k] > maxHz) continue;
    if (db[k] <= db[k - 1] || db[k] < db[k + 1]) continue;
    if (db[k] <= db[k - 2] || db[k] < db[k + 2]) continue;
    const prom = db[k] - floor[k];
    if (prom >= minProm) peaks.push({ hz: +freq[k].toFixed(1), db: +db[k].toFixed(1), prominence: +prom.toFixed(1) });
  }
  peaks.sort((a, b) => b.prominence - a.prominence);
  // Collapse neighbours: one peak per ~15 Hz.
  const out = [];
  for (const p of peaks) {
    if (out.every(q => Math.abs(q.hz - p.hz) > 15)) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/* Mean dB in [lo, hi) Hz of a PSD. */
export function bandDb(psd, lo, hi) {
  if (!psd) return null;
  let s = 0, c = 0;
  for (let k = 0; k < psd.freq.length; k++) if (psd.freq[k] >= lo && psd.freq[k] < hi) { s += psd.db[k]; c++; }
  return c ? s / c : null;
}

/* Throttle-banded spectrum: rows are throttle deciles, columns are freq bins.
   This is the PIDtoolbox "spectrogram by throttle" view, which is the single
   most useful picture for telling motor noise from frame resonance. */
export function throttleSpectrum(sig, fs, throttle, bands = 10, nfft = 512) {
  const rows = [];
  let freq = null;
  for (let b = 0; b < bands; b++) {
    const lo = b / bands, hi = (b + 1) / bands;
    const psd = welch(sig, fs, null, nfft, [lo, hi], throttle);
    if (psd) { freq = psd.freq; rows.push({ band: [lo, hi], db: psd.db, windows: psd.windows }); }
    else rows.push({ band: [lo, hi], db: null, windows: 0 });
  }
  return freq ? { freq, rows } : null;
}

// ---------- step response ----------

/* Wiener-deconvolved closed-loop step response of one axis.
   Windows of `winSec` (2 s) with 10% stride, kept only when the setpoint
   swings hard enough to excite the loop. Each window's impulse response is
   integrated to a step and the set is averaged with input-amplitude weights.
   Returns { t: Float32Array(ms), step: Float32Array, windows, metrics } or
   null when there is not enough stick input to say anything. */
export function stepResponse(setpoint, gyro, fs, mask, { winSec = 2, respMs = 500, minAmp = 80, cutHz = 25 } = {}) {
  const n = setpoint.length;
  const win = nextPow2(Math.round(winSec * fs));
  if (win > n) return null;
  const respN = Math.min(win >> 2, Math.round(respMs / 1000 * fs));
  // Zero-pad by the response length so the circular deconvolution cannot
  // wrap the tail of the response back onto its head.
  const N = win * 2;
  const stride = Math.max(1, Math.round(win * 0.1));
  const preN = Math.round(0.06 * fs);
  const acc = new Float64Array(respN);
  let wsum = 0, used = 0, considered = 0;
  const reI = new Float64Array(N), imI = new Float64Array(N);
  const reO = new Float64Array(N), imO = new Float64Array(N);
  const tw = tukey(win, 0.1);
  // Frequency-shaped regularisation (PID-Analyzer style): trust the data
  // below cutHz where the stick actually has energy, damp it hard above so
  // gyro noise does not get "explained" by the deconvolution.
  const lam = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const f = Math.min(k, N - k) * fs / N;
    const x = Math.min(1, Math.max(0, (f - cutHz) / cutHz)); // 0 at cut, 1 at 2*cut
    lam[k] = 1e-5 + (1e-2 - 1e-5) * x * x * (3 - 2 * x);
  }
  let maxAbs = 0;
  for (let i = 0; i < n; i++) if (!mask || mask[i]) maxAbs = Math.max(maxAbs, Math.abs(setpoint[i]));
  const gate = Math.max(minAmp, 0.3 * maxAbs);
  for (let s = 0; s + win <= n; s += stride) {
    let ok = true;
    if (mask) for (let i = s; i < s + win; i += 32) if (!mask[i]) { ok = false; break; }
    if (!ok) continue;
    let amp = 0;
    for (let i = s; i < s + win; i++) amp = Math.max(amp, Math.abs(setpoint[i]));
    considered++;
    if (amp < gate) continue;
    reI.fill(0); imI.fill(0); reO.fill(0); imO.fill(0);
    for (let i = 0; i < win; i++) { reI[i] = setpoint[s + i] * tw[i]; reO[i] = gyro[s + i] * tw[i]; }
    fft(reI, imI); fft(reO, imO);
    let pmax = 0;
    for (let k = 0; k < N; k++) pmax = Math.max(pmax, reI[k] * reI[k] + imI[k] * imI[k]);
    for (let k = 0; k < N; k++) {
      const ir = reI[k], ii = imI[k], or = reO[k], oi = imO[k];
      const den = ir * ir + ii * ii + lam[k] * pmax;
      const hr = (or * ir + oi * ii) / den;
      const hi = (oi * ir - or * ii) / den;
      reI[k] = hr; imI[k] = hi;
    }
    ifft(reI, imI);
    // The regularisation smears the impulse response symmetrically, so part
    // of it lands at negative time (the end of the circular buffer). Fold
    // that back in or the step settles short of its true gain.
    let cum = 0; const step = new Float64Array(respN);
    for (let i = N - preN; i < N; i++) cum += reI[i];
    for (let i = 0; i < respN; i++) { cum += reI[i]; step[i] = cum; }
    const tail = mean(step, Math.round(respN * 0.4), respN);
    let smin = Infinity, smax = -Infinity;
    for (let i = 0; i < respN; i++) { if (step[i] < smin) smin = step[i]; if (step[i] > smax) smax = step[i]; }
    if (!(tail > 0.4 && tail < 1.6) || smax > 2.2 || smin < -0.5) continue;
    const wgt = amp;
    for (let i = 0; i < respN; i++) acc[i] += step[i] * wgt;
    wsum += wgt; used++;
  }
  if (used < 3 || wsum === 0) return null;
  const step = new Float32Array(respN), t = new Float32Array(respN);
  for (let i = 0; i < respN; i++) { step[i] = acc[i] / wsum; t[i] = i / fs * 1000; }
  return { t, step, windows: used, considered, metrics: stepMetrics(step, fs) };
}

function tukey(n, alpha) {
  const w = new Float64Array(n);
  const edge = Math.floor(alpha * (n - 1) / 2);
  for (let i = 0; i < n; i++) {
    if (i < edge) w[i] = 0.5 * (1 - Math.cos(Math.PI * i / edge));
    else if (i >= n - edge) w[i] = 0.5 * (1 - Math.cos(Math.PI * (n - 1 - i) / edge));
    else w[i] = 1;
  }
  return w;
}

/* Rise = ms to first reach 90% of target (1.0), overshoot % over 1.0,
   settling = ms after which the response stays within ±5% of steady state,
   steady = mean of the last 40%, oscillations = crossings of 1.0 after the
   peak with 3% hysteresis so noise around the line does not count. */
export function stepMetrics(step, fs) {
  const n = step.length;
  const steady = mean(step, Math.round(n * 0.6), n);
  let peak = -Infinity, peakI = 0;
  const searchN = Math.min(n, Math.round(0.25 * fs)); // peak must be in the first 250 ms to be "overshoot"
  for (let i = 0; i < searchN; i++) if (step[i] > peak) { peak = step[i]; peakI = i; }
  let riseI = -1;
  for (let i = 0; i < n; i++) if (step[i] >= 0.9) { riseI = i; break; }
  let settleI = n - 1;
  for (let i = n - 1; i >= 0; i--) { if (Math.abs(step[i] - steady) > 0.05 * Math.max(1, Math.abs(steady))) { settleI = i + 1; break; } }
  let cross = 0, state = step[peakI] > 1 ? 1 : -1;
  for (let i = peakI + 1; i < n; i++) {
    if (state === 1 && step[i] < 0.97) { cross++; state = -1; }
    else if (state === -1 && step[i] > 1.03) { cross++; state = 1; }
  }
  return {
    riseMs: riseI >= 0 ? +(riseI / fs * 1000).toFixed(1) : null,
    overshootPct: +((peak - 1) * 100).toFixed(1),
    peakMs: +(peakI / fs * 1000).toFixed(1),
    settleMs: +(settleI / fs * 1000).toFixed(1),
    steady: +steady.toFixed(3),
    oscillations: cross,
  };
}

// ---------- motors / battery / propwash ----------

export function motorStats(motors, throttle, mask, range) {
  const [lo, hi] = range;
  const span = hi - lo || 1;
  const out = [];
  let flying = 0;
  for (let i = 0; i < throttle.length; i++) if (!mask || mask[i]) flying++;
  for (let m = 0; m < motors.length; m++) {
    const a = motors[m];
    let sat = 0, sum = 0, c = 0, sat100 = 0;
    for (let i = 0; i < a.length; i++) {
      if (mask && !mask[i]) continue;
      const v = (a[i] - lo) / span;
      sum += v; c++;
      if (v >= 0.98) sat++;
      if (v >= 0.999) sat100++;
    }
    out.push({ meanPct: c ? +(100 * sum / c).toFixed(1) : null, satPct: c ? +(100 * sat / c).toFixed(2) : null });
  }
  const means = out.map(o => o.meanPct).filter(v => v != null);
  const spread = means.length ? +(Math.max(...means) - Math.min(...means)).toFixed(1) : null;
  const satAny = out.length ? +Math.max(...out.map(o => o.satPct || 0)).toFixed(2) : null;
  return { perMotor: out, spreadPct: spread, satAnyPct: satAny, flyingSamples: flying };
}

export function batteryStats(vbat, amps, mask) {
  if (!vbat) return null;
  let vmax = -Infinity, vmin = Infinity, imax = 0, isum = 0, ic = 0;
  for (let i = 0; i < vbat.length; i++) {
    if (vbat[i] > vmax) vmax = vbat[i];
    if ((!mask || mask[i]) && vbat[i] > 0 && vbat[i] < vmin) vmin = vbat[i];
    if (amps) { if (amps[i] > imax) imax = amps[i]; if (!mask || mask[i]) { isum += amps[i]; ic++; } }
  }
  if (!isFinite(vmax) || vmax <= 0) return null;
  const cells = Math.max(1, Math.round(vmax / 4.2));
  return {
    cells, vmax: +vmax.toFixed(2), vminFlying: isFinite(vmin) ? +vmin.toFixed(2) : null,
    perCellMin: isFinite(vmin) ? +(vmin / cells).toFixed(2) : null,
    ampsMax: amps ? +imax.toFixed(1) : null, ampsMean: ic ? +(isum / ic).toFixed(1) : null,
  };
}

/* Propwash proxy. Compare 20–90 Hz gyro-error band power in "throttle chop"
   windows (throttle fell by > 35% within 0.5 s and is now below 30%) against
   the same band in steady cruise. > 2x is propwash territory. */
export function propwash(setpoint, gyro, throttle, fs) {
  const n = throttle.length;
  const err = new Float64Array(n);
  for (let i = 0; i < n; i++) err[i] = setpoint[i] - gyro[i];
  const look = Math.round(0.5 * fs);
  const chop = new Uint8Array(n), cruise = new Uint8Array(n);
  let chopN = 0, cruiseN = 0;
  for (let i = look; i < n; i++) {
    if (throttle[i] < 0.30 && throttle[i - look] - throttle[i] > 0.35) { chop[i] = 1; chopN++; }
    else if (throttle[i] >= 0.35 && throttle[i] <= 0.75) { cruise[i] = 1; cruiseN++; }
  }
  // Extend each chop sample forward 0.4 s: the wash arrives after the chop.
  const ext = Math.round(0.4 * fs);
  for (let i = n - 1; i >= 0; i--) if (chop[i]) for (let j = i; j < Math.min(n, i + ext); j++) chop[j] = 1;
  const nfft = 256;
  const pc = welch(err, fs, chop, nfft), pr = welch(err, fs, cruise, nfft);
  if (!pc || !pr) return { ratio: null, chopWindows: pc ? pc.windows : 0 };
  const a = bandDb(pc, 20, 90), b = bandDb(pr, 20, 90);
  return { ratio: +Math.pow(10, (a - b) / 10).toFixed(2), chopDb: +a.toFixed(1), cruiseDb: +b.toFixed(1), chopWindows: pc.windows };
}

// ---------- top-level analysis ----------

const AXES = ['roll', 'pitch', 'yaw'];

export function analyze(log) {
  const { fs, throttle } = log;
  const { mask, fraction } = flightMask(throttle);
  const nyq = fs / 2;
  const nfft = fs >= 2000 ? 1024 : fs >= 1000 ? 512 : 256;

  const axes = AXES.map((name, a) => {
    const psd = welch(log.gyro[a], fs, mask, nfft);
    const psdRaw = log.gyroRaw ? welch(log.gyroRaw[a], fs, mask, nfft) : null;
    const psdD = log.pidD[a] ? welch(log.pidD[a], fs, mask, nfft) : null;
    const step = stepResponse(log.setpoint[a], log.gyro[a], fs, mask);
    const peaks = findPeaks(psd, { minHz: 15, maxHz: nyq * 0.95 });
    const peaksRaw = findPeaks(psdRaw, { minHz: 15, maxHz: nyq * 0.95 });
    return {
      name,
      psd: psd && { freq: psd.freq, db: psd.db, windows: psd.windows },
      psdRaw: psdRaw && { freq: psdRaw.freq, db: psdRaw.db, windows: psdRaw.windows },
      psdD: psdD && { freq: psdD.freq, db: psdD.db, windows: psdD.windows },
      peaks, peaksRaw,
      noise: {
        lowDb: bandDb(psd, 10, 60), midDb: bandDb(psd, 60, 200), highDb: bandDb(psd, 200, Math.min(500, nyq)),
        rawHighDb: bandDb(psdRaw, 200, Math.min(500, nyq)),
        dHighDb: bandDb(psdD, 100, Math.min(500, nyq)), dLowDb: bandDb(psdD, 10, 60),
        gyroRms: +rms(maskedCopy(log.gyro[a], mask)).toFixed(1),
        dRms: log.pidD[a] ? +rms(maskedCopy(log.pidD[a], mask)).toFixed(1) : null,
        errRms: +rms(diffMasked(log.setpoint[a], log.gyro[a], mask)).toFixed(1),
      },
      step,
      heat: a < 2 ? throttleSpectrum(log.gyroRaw ? log.gyroRaw[a] : log.gyro[a], fs, throttle, 10, Math.min(512, nfft)) : null,
    };
  });

  return {
    fs: +fs.toFixed(1), n: log.n, durationS: +(log.n / fs).toFixed(1),
    flightFraction: +fraction.toFixed(3), nyquist: +nyq.toFixed(0),
    hasRaw: !!log.gyroRaw,
    axes,
    motors: motorStats(log.motors, throttle, mask, log.motorRange),
    battery: batteryStats(log.vbat, log.amps, mask),
    propwash: propwash(log.setpoint[1], log.gyro[1], throttle, fs),
    throttle: { meanPct: +(100 * mean(maskedCopy(throttle, mask))).toFixed(1), p95Pct: +(100 * percentile(maskedCopy(throttle, mask), 0.95)).toFixed(1) },
  };
}

function maskedCopy(a, mask) {
  if (!mask) return a;
  let c = 0; for (let i = 0; i < a.length; i++) if (mask[i]) c++;
  const out = new Float64Array(c); let j = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) out[j++] = a[i];
  return out;
}
function diffMasked(a, b, mask) {
  let c = 0; for (let i = 0; i < a.length; i++) if (!mask || mask[i]) c++;
  const out = new Float64Array(c); let j = 0;
  for (let i = 0; i < a.length; i++) if (!mask || mask[i]) out[j++] = a[i] - b[i];
  return out;
}
