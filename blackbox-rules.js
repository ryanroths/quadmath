/* Rules layer: metrics + settings -> findings + a CLI diff.

   Deliberately conservative. Every rule states what it saw (numbers), what it
   probably means, and one change — never a cascade. Suggested values move in
   10–15% steps because a log only tells you direction, not magnitude. The
   Tune Advisor gets the same findings JSON and can argue with them.

   Severity: 'good' | 'info' | 'warn' | 'bad'. */

'use strict';

const AX = ['roll', 'pitch', 'yaw'];
const CLI_AX = { roll: 'roll', pitch: 'pitch', yaw: 'yaw' };

function pct(v) { return v == null ? '—' : `${v}%`; }
function r0(v) { return Math.round(v); }
function step(v, f) { return Math.max(1, Math.round(v * f)); }

export function buildFindings(m, s) {
  const findings = [];
  const cli = new Map(); // param -> value (last write wins, so order rules by confidence)
  const add = (sev, title, detail, fix = null) => findings.push({ sev, title, detail, fix });
  const set = (k, v, why) => cli.set(k, { v, why });

  // ---- log quality: says how much to trust the rest ----
  if (m.durationS < 20) add('warn', 'Short log', `${m.durationS}s of data. Spectra and step response need 30s+ of real flying to settle; treat everything below as a hint.`);
  if (m.flightFraction < 0.5) add('info', 'Mostly on the ground', `Only ${r0(m.flightFraction * 100)}% of samples above 15% throttle. Spectra use in-flight samples only, so the effective log is shorter than it looks.`);
  if (m.fs < 600) add('warn', `Low log rate (${r0(m.fs)} Hz)`, `Spectrum tops out at ${m.nyquist} Hz — motor noise on a whoop lives well above that, so the noise findings below only cover the low band. Set blackbox_sample_rate to 1/2 or better (4.3+), or lower P ratio on 4.2.`);
  else if (m.fs < 1500) add('info', `Log rate ${r0(m.fs)} Hz`, `Spectrum tops out at ${m.nyquist} Hz. Fine for tuning; raise the rate if you are chasing high-frequency motor noise.`);
  if (!m.hasRaw) add('info', 'No unfiltered gyro in log', 'debug_mode is not GYRO_SCALED, so the pre-filter spectrum is unavailable. Set debug_mode = GYRO_SCALED to see what the filters are removing and get filter suggestions.');
  if (m.droppedFrames > m.n * 0.01) add('warn', 'Dropped frames', `~${m.droppedFrames} frames missing (${(100 * m.droppedFrames / m.n).toFixed(1)}%). Flash is too slow for this rate, or the log was corrupted. Lower the rate or use a fresh chip.`);

  // ---- battery ----
  if (m.battery) {
    const b = m.battery;
    if (b.perCellMin != null && b.perCellMin < 2.8) add('bad', `Hard voltage sag (${b.perCellMin} V/cell)`, `Min in flight ${b.vminFlying} V on ${b.cells}S. Below 2.8 V/cell the pack is the limit, not the tune — motor saturation and soft response below are partly this.`);
    else if (b.perCellMin != null && b.perCellMin < 3.1) add('info', `Sag to ${b.perCellMin} V/cell`, `Normal for a hard-flown pack near the end of a flight. Watch it against saturation below.`);
  }

  // ---- motors ----
  const mo = m.motors;
  if (mo.satAnyPct != null) {
    if (mo.satAnyPct > 8) add('bad', `Motors saturated ${mo.satAnyPct}% of flight`, `At least one motor pinned at max for ${mo.satAnyPct}% of in-flight samples. The PID loop has no headroom there — it cannot correct. Underpowered for the flying, prop/pack mismatch, or P/D asking for more than the motors have.`);
    else if (mo.satAnyPct > 2) add('warn', `Motor saturation ${mo.satAnyPct}%`, `Some clipping on throttle punches. Acceptable for freestyle; if it comes with wobble on the way up, lower P a step or check the pack.`);
    else add('good', 'Motor headroom OK', `Worst motor saturated ${mo.satAnyPct}% of the flight.`);
  }
  if (mo.spreadPct != null && mo.spreadPct > 12) add('warn', `Motor imbalance ${mo.spreadPct}%`, `Average outputs: ${mo.perMotor.map((x, i) => `M${i + 1} ${x.meanPct}%`).join(', ')}. That spread is CG, a bent prop, a tired motor, or a twisted arm — a tune cannot fix it.`);

  // ---- per-axis noise ----
  AX.forEach((ax, a) => {
    const A = m.axes[a];
    if (!A.psd) return;
    const nz = A.noise;
    for (const p of A.peaks.slice(0, 2)) {
      if (p.prominence < 10) continue;
      let what, fix = null;
      if (p.hz < 40) {
        what = `Low-frequency oscillation on ${ax} at ${p.hz} Hz (${p.prominence} dB over floor). This is the PID loop itself, not motor noise: P too high, or D too high fighting the gyro. Prop wash shows up here too.`;
        if (a < 2 && s.pids[ax]) { fix = `set p_${CLI_AX[ax]} = ${step(s.pids[ax].p, 0.9)}`; set(`p_${CLI_AX[ax]}`, step(s.pids[ax].p, 0.9), `${p.hz} Hz oscillation on ${ax}`); }
        add('warn', `${cap(ax)}: ${p.hz} Hz oscillation`, what, fix);
      } else if (p.hz < 120) {
        what = `${cap(ax)} has a ${p.hz} Hz peak ${p.prominence} dB above the floor. Mid-band peaks on a whoop are frame resonance (canopy, camera, soft mount) or a bent prop. Fix mechanically first; a notch here costs latency.`;
        add('warn', `${cap(ax)}: ${p.hz} Hz resonance`, what);
      } else {
        const rpmOff = !(s.filters.bidir === 1 && (s.filters.rpmHarmonics ?? 0) > 0);
        what = `${cap(ax)} carries a ${p.hz} Hz peak ${p.prominence} dB above the floor in the *filtered* gyro — it is reaching the PID loop. ` + (rpmOff ? 'RPM filter is off; that is the fix for motor noise on DShot.' : 'RPM filter is on, so this is either a harmonic outside its range, or the dynamic notch is missing it.');
        if (rpmOff && s.pwmProtocol && /DSHOT/i.test(s.pwmProtocol)) { fix = `set dshot_bidir = ON\nset ${s.cliNames.rpm} = 3`; set('dshot_bidir', 'ON', 'motor noise peak, RPM filter off'); set(s.cliNames.rpm, 3, 'motor noise peak, RPM filter off'); }
        else if (s.filters.dynNotchCount === 0) { fix = 'set dyn_notch_count = 1'; set('dyn_notch_count', 1, `${p.hz} Hz peak on ${ax}`); }
        add(p.prominence > 18 ? 'bad' : 'warn', `${cap(ax)}: ${p.hz} Hz motor noise`, what, fix);
      }
    }
    // D-term noise: high-band D power vs low-band D power. On a clean quad
    // D should be dominated by the stick-driven low band.
    if (nz.dHighDb != null && nz.dLowDb != null && a < 2 && m.nyquist >= 250) {
      const gap = nz.dHighDb - nz.dLowDb;
      if (gap > -6) {
        const cur = s.filters.dtermLpf1Dyn ? s.filters.dtermLpf1Dyn[0] : s.filters.dtermLpf1;
        let fix = null;
        if (s.filters.dtermLpf1Dyn && cur) { const nv = step(cur, 0.85); fix = `set ${s.cliNames.dtermLpf1Dyn[0]} = ${nv}`; set(s.cliNames.dtermLpf1Dyn[0], nv, `D-term noise on ${ax}`); }
        else if (cur) { const nv = step(cur, 0.85); fix = `set ${s.cliNames.dtermLpf1} = ${nv}`; set(s.cliNames.dtermLpf1, nv, `D-term noise on ${ax}`); }
        add('warn', `${cap(ax)}: noisy D-term`, `D-term power above 100 Hz is within ${Math.abs(gap).toFixed(0)} dB of its low band (RMS ${nz.dRms}). That is heat in the motors and no control benefit. Lower the D lowpass ~15%, or lower D itself if the motors are already warm.`, fix);
      }
    }
    if (m.hasRaw && nz.rawHighDb != null && nz.highDb != null) {
      const att = nz.rawHighDb - nz.highDb;
      if (att > 25 && A.peaks.length === 0) add('info', `${cap(ax)}: filters over-working?`, `${att.toFixed(0)} dB removed above 200 Hz and nothing is leaking through. If the quad feels mushy, there may be room to raise gyro/D-term lowpass for less delay. Only do this with RPM filtering on.`);
    }
  });

  // ---- step response ----
  AX.forEach((ax, a) => {
    const st = m.axes[a].step;
    if (!st) { if (a < 2) add('info', `${cap(ax)}: no step response`, 'Not enough sharp stick input in flight to deconvolve. Fly some snap rolls/flips and log again.'); return; }
    const k = st.metrics;
    const conf = st.windows < 10 ? ` (low confidence: ${st.windows} windows)` : '';
    const P = s.pids[ax];
    if (st.windows < 6) { add('info', `${cap(ax)}: step response unreliable`, `Only ${st.windows} usable stick moves. Shown on the chart, not scored. Rise ${k.riseMs} ms, overshoot ${k.overshootPct}%.`); return; }
    if (k.overshootPct > 25) {
      let fix = null;
      if (P && a < 2) { fix = `set p_${ax} = ${step(P.p, 0.88)}`; set(`p_${ax}`, step(P.p, 0.88), `${k.overshootPct}% overshoot on ${ax}`); }
      else if (P) { fix = `set p_${ax} = ${step(P.p, 0.9)}`; set(`p_${ax}`, step(P.p, 0.9), `${k.overshootPct}% overshoot on yaw`); }
      add('bad', `${cap(ax)}: ${k.overshootPct}% overshoot${conf}`, `Peak ${(1 + k.overshootPct / 100).toFixed(2)} at ${k.peakMs} ms, ${k.oscillations} crossings after. The loop is over-driven: too much P for the D it has, or feedforward spiking. Bounce-back on flips looks like this.`, fix);
    } else if (k.overshootPct > 12) {
      let fix = null;
      if (P && a < 2 && P.d != null) { fix = `set d_${ax} = ${step(P.d, 1.1)}`; set(`d_${ax}`, step(P.d, 1.1), `${k.overshootPct}% overshoot on ${ax}`); }
      add('warn', `${cap(ax)}: ${k.overshootPct}% overshoot${conf}`, `A little bounce. Raise D ~10% first (it damps the overshoot without slowing the rise); if D is already noisy above, drop P instead.`, fix);
    } else if (k.overshootPct < 2 && k.riseMs != null && k.riseMs > 40) {
      let fix = null;
      if (P && a < 2) { fix = `set p_${ax} = ${step(P.p, 1.1)}`; set(`p_${ax}`, step(P.p, 1.1), `slow rise on ${ax}`); }
      add('warn', `${cap(ax)}: slow response (${k.riseMs} ms to target)${conf}`, `No overshoot but a lazy rise. Room for more P, or less D if D-term is noisy. Feedforward also sharpens this without touching stability.`, fix);
    } else if (k.riseMs != null) {
      add('good', `${cap(ax)}: response OK`, `Rise ${k.riseMs} ms, overshoot ${k.overshootPct}%, settled by ${k.settleMs} ms over ${st.windows} windows.`);
    }
    if (k.steady < 0.9 && k.riseMs != null) add('info', `${cap(ax)}: tracks at ${(k.steady * 100).toFixed(0)}%`, `Steady state below target means the axis never fully reaches the requested rate — usually I-term too low, or the deconvolution is seeing a throttle-coupled log. Only act on it if the quad drifts in sustained rolls.`);
    if (k.oscillations >= 3 && k.overshootPct > 5) add('warn', `${cap(ax)}: ringing after step`, `${k.oscillations} crossings of the target after the peak. Damping is short: D too low for this P, or D is filtered so hard it arrives late.`);
  });

  // ---- propwash ----
  const pw = m.propwash;
  if (pw && pw.ratio != null) {
    if (pw.ratio > 3) add('warn', `Propwash ${pw.ratio}x`, `Pitch tracking error in the 20–90 Hz band is ${pw.ratio}x higher after throttle chops than in cruise. Fixes, in order: raise dyn_idle / idle, more D (with D-min raised too), then lower D filtering slightly so D can see the wash. Don't chase it with P.`);
    else if (pw.ratio > 1.8) add('info', `Some propwash (${pw.ratio}x)`, `Mild. Normal when diving. Raising idle a touch is the cheap fix.`);
    else add('good', 'Propwash under control', `Chop-window error only ${pw.ratio}x cruise level.`);
  } else if (pw) add('info', 'No throttle chops found', 'Propwash check needs a few sharp throttle cuts from mid-throttle. Dive at something and log it.');

  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  findings.sort((x, y) => order[x.sev] - order[y.sev]);
  return { findings, cli: cliText(cli, s) };
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

function cliText(cli, s) {
  if (!cli.size) return '';
  const lines = [`# QuadMath blackbox suggestions — ${s.firmware || 'Betaflight'}`, '# One change at a time. Fly, log, re-check.', '#', 'profile 0', ''];
  for (const [k, { v, why }] of cli) lines.push(`set ${k} = ${v}   # ${why}`);
  lines.push('', 'save');
  return lines.join('\n');
}

/* Compact JSON for the Tune Advisor — metrics only, never raw samples. */
export function advisorPayload(m, s, findings) {
  return {
    firmware: s.firmware, board: s.board, craft: s.craft, debugMode: s.debugMode,
    log: { fs: m.fs, durationS: m.durationS, flightFraction: m.flightFraction, droppedFrames: m.droppedFrames },
    pids: s.pids, ff: s.ff, filters: s.filters, simplified: s.simplifiedTuning,
    // The date-versioned Betaflight releases (2025.x+) inverted the D-min
    // scheme: d_* became the floor and d_max_* the ceiling; 4.5 still has d_min. Tell the model which scheme this log uses and the
    // exact CLI names, so it cannot emit d_min_* on a firmware that has none.
    dScheme: s.dMax ? { kind: 'd_max', floor: 'd_<axis>', ceiling: 'd_max_<axis>', values: { floor: [s.pids.roll?.d, s.pids.pitch?.d, s.pids.yaw?.d], ceiling: s.dMax } }
                    : { kind: 'd_min', floor: 'd_min_<axis>', ceiling: 'd_<axis>', values: { floor: s.dMin, ceiling: [s.pids.roll?.d, s.pids.pitch?.d, s.pids.yaw?.d] } },
    cliNames: s.cliNames,
    axes: m.axes.map(A => ({ name: A.name, peaks: A.peaks, peaksRaw: A.peaksRaw, noise: A.noise, step: A.step ? { ...A.step.metrics, windows: A.step.windows } : null })),
    motors: m.motors, battery: m.battery, propwash: m.propwash, throttle: m.throttle,
    findings: findings.map(f => ({ sev: f.sev, title: f.title })),
  };
}
