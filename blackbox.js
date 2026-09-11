/* Blackbox analyzer page controller. Talks to blackbox-worker.js, renders
   findings and draws the charts on plain canvas. No chart library: the
   plots are simple enough that 200 lines of canvas beat a 300 KB dependency
   on a page whose whole pitch is "nothing leaves the browser". */

const AXIS_COLOR = ['#FF4D1A', '#3DDC97', '#5B8DEF', '#D9B34A'];
const AXIS_NAME = ['Roll', 'Pitch', 'Yaw'];
const MUTED = '#8A8F98', TEXT = '#E8E6E1', GRID = '#2A2D35', BG = '#15171D';
const MONO = '12px "JetBrains Mono", monospace';

const $ = id => document.getElementById(id);
const drop = $('drop'), fileInput = $('file'), toolbar = $('toolbar'), logSelect = $('logSelect');
const status = $('status'), statusIdle = $('statusIdle'), results = $('results');

let worker = null, msgId = 0, pending = new Map();
let current = null; // last result
let tsAxis = 0;

function getWorker() {
  if (worker) return worker;
  worker = new Worker('blackbox-worker.js', { type: 'module' });
  worker.onmessage = e => {
    const d = e.data;
    if (d.type === 'progress') { setStatus(d.stage === 'decoding' ? 'decoding frames…' : 'analyzing…'); return; }
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.type === 'error') p.reject(new Error(d.message)); else p.resolve(d);
  };
  worker.onerror = e => {
    setStatus('worker failed: ' + (e.message || 'see console'), true);
    for (const p of pending.values()) p.reject(new Error(e.message || 'worker error'));
    pending.clear();
  };
  return worker;
}
function call(msg, transfer) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...msg }, transfer || []);
  });
}

function setStatus(text, isError = false) {
  const el = toolbar.hidden ? statusIdle : status;
  (toolbar.hidden ? status : statusIdle).textContent = '';
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

// ---------- file intake ----------

drop.addEventListener('click', e => { if (e.target !== fileInput) fileInput.click(); });
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });

async function loadFile(file) {
  results.hidden = true;
  toolbar.hidden = true;
  setStatus(`reading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`);
  try {
    const buf = await file.arrayBuffer();
    const r = await call({ type: 'load', buffer: buf }, [buf]);
    if (!r.logs.length) throw new Error('No blackbox logs found in this file. Is it a raw .bbl/.bfl from the FC, not a CSV export?');
    $('fileName').textContent = file.name;
    logSelect.innerHTML = '';
    r.logs.forEach(l => {
      const o = document.createElement('option');
      o.value = l.index;
      o.textContent = `#${l.index + 1} ${l.firmware}${l.craft ? ' · ' + l.craft : ''}${l.error ? ' (unreadable)' : ''}`;
      if (l.error) o.disabled = true;
      logSelect.appendChild(o);
    });
    toolbar.hidden = false;
    statusIdle.textContent = '';
    // Pick the longest-looking readable log: the last one is usually the real flight.
    const readable = r.logs.filter(l => !l.error);
    logSelect.value = readable.length ? readable[readable.length - 1].index : 0;
    await analyzeSelected();
  } catch (err) {
    setStatus(err.message, true);
  }
}

logSelect.addEventListener('change', analyzeSelected);

async function analyzeSelected() {
  setStatus('decoding…');
  try {
    const r = await call({ type: 'analyze', index: +logSelect.value });
    current = r;
    render(r);
    setStatus(`${r.metrics.durationS}s · ${Math.round(r.metrics.fs)} Hz · ${r.metrics.n.toLocaleString()} frames`);
  } catch (err) {
    setStatus(err.message, true);
  }
}

// ---------- rendering ----------

function render(r) {
  const m = r.metrics, s = r.settings;
  results.hidden = false;

  // Summary strip
  const b = m.battery;
  const cells = [
    ['Firmware', s.firmware.split(' ').slice(0, 2).join(' '), s.board],
    ['Craft', s.craft || '—', s.debugMode],
    ['Duration', `${m.durationS}s`, `${Math.round(m.flightFraction * 100)}% flying`],
    ['Log rate', `${Math.round(m.fs)} Hz`, `spectrum to ${m.nyquist} Hz`],
    ['Battery', b ? `${b.cells}S` : '—', b && b.perCellMin != null ? `sag to ${b.perCellMin} V/cell` : ''],
    ['Motor sat.', m.motors.satAnyPct != null ? `${m.motors.satAnyPct}%` : '—', `spread ${m.motors.spreadPct ?? '—'}%`],
    ['Throttle', `${m.throttle.meanPct}%`, `p95 ${m.throttle.p95Pct}%`],
  ];
  $('summaryGrid').innerHTML = cells.map(([l, v, sub]) => `<div class="bb-stat"><div class="bb-stat-label">${esc(l)}</div><div class="bb-stat-value">${esc(v)}</div><div class="bb-stat-sub">${esc(sub || '')}</div></div>`).join('');

  // Findings
  const SEV = { bad: 'fix', warn: 'watch', info: 'note', good: 'ok' };
  $('findingList').innerHTML = r.findings.map(f => `
    <div class="bb-finding" data-sev="${f.sev}">
      <div class="bb-finding-head"><span class="bb-sev">${SEV[f.sev]}</span><span class="bb-finding-title">${esc(f.title)}</span></div>
      <div class="bb-finding-detail">${esc(f.detail).replace(/\*([^*]+)\*/g, '<em>$1</em>')}</div>
      ${f.fix ? `<div class="bb-fix">${esc(f.fix)}</div>` : ''}
    </div>`).join('');

  // CLI
  const cliEl = $('cliBlock');
  if (r.cli) { cliEl.textContent = r.cli; cliEl.classList.remove('bb-cli-empty'); }
  else { cliEl.textContent = 'No concrete parameter changes suggested from this log. That is either good news or a log too short to say — check the findings.'; cliEl.classList.add('bb-cli-empty'); }

  // Settings table
  const F = s.filters;
  const rows = [
    ['PID roll', pidStr(s.pids.roll)], ['PID pitch', pidStr(s.pids.pitch)], ['PID yaw', pidStr(s.pids.yaw)],
    ['Feedforward', s.ff ? s.ff.join(' / ') : '—'], ['D min', s.dMin ? s.dMin.join(' / ') : '—'],
    ['Gyro LPF1', F.gyroLpf1Dyn ? `dyn ${F.gyroLpf1Dyn.join('–')} Hz` : F.gyroLpf1 != null ? `${F.gyroLpf1} Hz` : '—'],
    ['Gyro LPF2', F.gyroLpf2 != null ? `${F.gyroLpf2} Hz` : '—'],
    ['D-term LPF1', F.dtermLpf1Dyn ? `dyn ${F.dtermLpf1Dyn.join('–')} Hz` : F.dtermLpf1 != null ? `${F.dtermLpf1} Hz` : '—'],
    ['D-term LPF2', F.dtermLpf2 != null ? `${F.dtermLpf2} Hz` : '—'],
    ['Dyn notch', F.dynNotchCount != null ? `${F.dynNotchCount} × ${F.dynNotchMin}–${F.dynNotchMax} Hz, Q ${F.dynNotchQ}` : `${F.dynNotchMin ?? '—'}–${F.dynNotchMax ?? '—'} Hz`],
    ['RPM filter', F.bidir === 1 && F.rpmHarmonics ? `${F.rpmHarmonics} harmonics` : 'off'],
    ['ESC protocol', s.pwmProtocol || '—'], ['Loop', s.looptimeUs ? `${Math.round(1e6 / s.looptimeUs / (s.pidDenom || 1))} Hz PID` : '—'],
    ['Debug mode', s.debugMode || '—'],
  ];
  $('settingsTable').innerHTML = '<thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody>' + rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${esc(String(v))}</td></tr>`).join('') + '</tbody>';

  // Charts
  drawAll();
}

function pidStr(p) { return p ? `P ${p.p}  I ${p.i}  D ${p.d}${p.f != null ? '  F ' + p.f : ''}` : '—'; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- actions ----------

$('copyCli').addEventListener('click', () => copy(current && current.cli || '', $('copyCli'), 'Copy CLI'));
$('copyJson').addEventListener('click', () => copy(current ? JSON.stringify(current.advisor, null, 2) : '', $('copyJson'), 'Copy metrics JSON'));
$('downloadJson').addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify(current.advisor, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `quadmath-blackbox-${(current.settings.craft || 'log').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
async function copy(text, btn, label) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch (_) { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = label; }, 1500);
}

// ---------- Tune Advisor ----------

const ADVISOR_URL = 'https://advisor.quadmath.com/v1/blackbox';
const askBtn = $('askAdvisor'), advisorOut = $('advisorOut'), advisorStatus = $('advisorStatus');

askBtn.addEventListener('click', async () => {
  if (!current) { advisorStatus.textContent = 'analyze a log first'; return; }
  askBtn.disabled = true;
  advisorStatus.textContent = 'reading the numbers…';
  advisorStatus.classList.remove('is-error');
  try {
    const r = await fetch(ADVISOR_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current.advisor),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `advisor ${r.status}`);
    advisorOut.innerHTML = renderAdvisor(d.text || '');
    advisorOut.hidden = false;
    advisorStatus.textContent = d.model ? `${d.model}` : '';
  } catch (err) {
    advisorStatus.textContent = err.message === 'Failed to fetch' ? 'advisor unreachable — try again in a minute' : err.message;
    advisorStatus.classList.add('is-error');
  } finally {
    askBtn.disabled = false;
  }
});

/* Advisor replies are plain text with fixed uppercase headers, `set`
   lines, and — whatever the prompt says — some markdown. Escape everything,
   then dress up the handful of things that recur. */
function renderAdvisor(text) {
  const lines = esc(text).replace(/\r/g, '').split('\n');
  const out = [];
  let inFence = false;
  for (let raw of lines) {
    let l = raw.trimEnd();
    if (/^```/.test(l)) { inFence = !inFence; continue; }
    if (/^(READ|FINDINGS CHECK|FLY THIS NEXT|AFTER THAT|CHECK)\s*:?\s*$/.test(l)) { out.push(`<span class="h">${l.replace(/:$/, '')}</span>`); continue; }
    l = l.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    l = l.replace(/`([^`]+)`/g, '<code>$1</code>');
    if (inFence || /^(set|profile|save|diff|get|rateprofile)\b/.test(l)) { out.push(`<code>${l}</code>`); continue; }
    if (/^[-•]\s+/.test(l)) { out.push(`<span class="li">${l.replace(/^[-•]\s+/, '')}</span>`); continue; }
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---------- charts ----------

$('tsTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  tsAxis = +b.dataset.axis;
  for (const x of $('tsTabs').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  const lg = $('tsLegendGyro');
  lg.className = ['c-roll', 'c-pitch', 'c-yaw'][tsAxis];
  drawTimeSeries();
});

let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawAll, 120); });

function drawAll() {
  if (!current) return;
  drawTimeSeries();
  drawPsd('psdCanvas', 'psdTip', current.metrics.axes.map(A => A.psd), current.metrics.axes.map(A => A.peaks));
  const hasRaw = current.metrics.hasRaw && current.metrics.axes.some(A => A.psdRaw);
  $('psdRawChart').hidden = !hasRaw;
  if (hasRaw) drawPsd('psdRawCanvas', 'psdRawTip', current.metrics.axes.map(A => A.psdRaw), current.metrics.axes.map(A => A.peaksRaw));
  drawPsd('psdDCanvas', 'psdDTip', current.metrics.axes.slice(0, 2).map(A => A.psdD), [[], []]);
  drawStep();
  drawHeat('heatRollCanvas', 'heatRollTip', current.metrics.axes[0].heat);
  drawHeat('heatPitchCanvas', 'heatPitchTip', current.metrics.axes[1].heat);
  drawMotors();
}

/* Canvas setup at device pixel ratio. Returns ctx + CSS-pixel size. */
function setup(id) {
  const c = $(id);
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = MONO;
  return { c, ctx, w, h };
}

/* Axes frame: returns a mapping helper. pad = {l,r,t,b}. */
function frame(ctx, w, h, pad, x0, x1, y0, y1) {
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const X = v => pad.l + (v - x0) / (x1 - x0) * pw;
  const Y = v => pad.t + (1 - (v - y0) / (y1 - y0)) * ph;
  return { X, Y, pw, ph, x0, x1, y0, y1, pad };
}

function gridLines(ctx, fr, xt, yt, xf, yf) {
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = MUTED; ctx.font = MONO;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of xt) { const x = Math.round(fr.X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, fr.pad.t); ctx.lineTo(x, fr.pad.t + fr.ph); ctx.stroke(); ctx.fillText(xf(v), x, fr.pad.t + fr.ph + 4); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yt) { const y = Math.round(fr.Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(fr.pad.l, y); ctx.lineTo(fr.pad.l + fr.pw, y); ctx.stroke(); ctx.fillText(yf(v), fr.pad.l - 6, y); }
}

function ticks(lo, hi, n = 5) {
  const span = hi - lo; if (!(span > 0)) return [lo];
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n + 1) || mag * 10;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

function line(ctx, pts, color, width = 1.5) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.beginPath();
  let started = false;
  for (const [x, y] of pts) { if (!isFinite(y)) { started = false; continue; } if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
  ctx.stroke();
}

function tooltip(canvasId, tipId, fn) {
  const c = $(canvasId), tip = $(tipId);
  c.onmousemove = e => {
    const r = c.getBoundingClientRect();
    const txt = fn(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (!txt) { tip.style.display = 'none'; return; }
    tip.innerHTML = txt; tip.style.display = 'block';
    const x = e.clientX - r.left + 12, y = e.clientY - r.top - 10;
    tip.style.left = Math.min(x, r.width - tip.offsetWidth - 4) + 'px';
    tip.style.top = Math.max(0, y - tip.offsetHeight) + 'px';
  };
  c.onmouseleave = () => { tip.style.display = 'none'; };
}

// -- time series --
function drawTimeSeries() {
  const { ctx, w, h } = setup('tsCanvas');
  const tr = current.traces, a = tsAxis;
  const t = tr.t, n = t.length, t0 = t[0], t1 = t[n - 1];
  const g = tr.gyro[a], sp = tr.setpoint[a];
  let ymax = 100;
  for (let i = 0; i < n; i++) ymax = Math.max(ymax, Math.abs(g.lo[i]), Math.abs(g.hi[i]), Math.abs(sp[i]));
  ymax = Math.ceil(ymax / 100) * 100;
  const pad = { l: 52, r: 10, t: 8, b: 44 };
  const fr = frame(ctx, w, h, pad, t0, t1, -ymax, ymax);
  gridLines(ctx, fr, ticks(t0, t1, 8), ticks(-ymax, ymax, 4), v => `${(v - t0).toFixed(0)}s`, v => `${v}`);
  // throttle strip under the plot
  const th = 18, ty = h - pad.b + 16;
  ctx.fillStyle = '#1c1f27'; ctx.fillRect(pad.l, ty, fr.pw, th);
  ctx.fillStyle = MUTED;
  const bw = Math.max(1, fr.pw / n);
  for (let i = 0; i < n; i++) { const v = tr.throttle[i]; ctx.fillRect(fr.X(t[i]), ty + th - v * th, bw + 0.5, v * th); }
  // setpoint underneath, gyro envelope on top so the tracking error reads as
  // the orange that pokes out from behind the white line.
  const pts = []; for (let i = 0; i < n; i++) pts.push([fr.X(t[i]), fr.Y(sp[i])]);
  line(ctx, pts, TEXT, 1);
  ctx.fillStyle = AXIS_COLOR[a] + 'B3';
  ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(fr.X(t[i]), fr.Y(g.hi[i]));
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(fr.X(t[i]), fr.Y(g.lo[i]));
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = MUTED; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('thr', 6, ty + th / 2);
  tooltip('tsCanvas', 'tsTip', (x) => {
    if (x < pad.l || x > pad.l + fr.pw) return null;
    const i = Math.min(n - 1, Math.max(0, Math.round((x - pad.l) / fr.pw * (n - 1))));
    return `t ${(t[i] - t0).toFixed(2)}s<br>${AXIS_NAME[a]} gyro ${g.lo[i].toFixed(0)}…${g.hi[i].toFixed(0)}<br>setpoint ${sp[i].toFixed(0)}<br>thr ${(tr.throttle[i] * 100).toFixed(0)}%`;
  });
}

// -- PSD --
function drawPsd(canvasId, tipId, psds, peaks) {
  const { ctx, w, h } = setup(canvasId);
  const valid = psds.filter(Boolean);
  if (!valid.length) { ctx.fillStyle = MUTED; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('not enough in-flight data', w / 2, h / 2); return; }
  const fmax = valid[0].freq[valid[0].freq.length - 1];
  let ymin = Infinity, ymax = -Infinity;
  for (const p of valid) for (let k = 1; k < p.db.length; k++) { if (p.freq[k] < 10) continue; ymin = Math.min(ymin, p.db[k]); ymax = Math.max(ymax, p.db[k]); }
  ymin = Math.floor(ymin / 10) * 10; ymax = Math.ceil(ymax / 10) * 10 + 5;
  const pad = { l: 44, r: 10, t: 8, b: 24 };
  const fr = frame(ctx, w, h, pad, 0, fmax, ymin, ymax);
  gridLines(ctx, fr, ticks(0, fmax, 6), ticks(ymin, ymax, 4), v => `${v}`, v => `${v}`);
  psds.forEach((p, i) => {
    if (!p) return;
    const pts = []; for (let k = 1; k < p.db.length; k++) pts.push([fr.X(p.freq[k]), fr.Y(p.db[k])]);
    line(ctx, pts, AXIS_COLOR[i], 1.5);
    for (const pk of (peaks[i] || []).slice(0, 3)) {
      if (pk.prominence < 8) continue;
      const x = fr.X(pk.hz), y = fr.Y(pk.db);
      ctx.fillStyle = AXIS_COLOR[i]; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = BG; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = TEXT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.round(pk.hz)}`, x, y - 6);
    }
  });
  ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('Hz', w - pad.r, h - 2);
  ctx.save(); ctx.translate(10, pad.t + fr.ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('dB', 0, 0); ctx.restore();
  tooltip(canvasId, tipId, (x) => {
    if (x < pad.l || x > pad.l + fr.pw) return null;
    const f = (x - pad.l) / fr.pw * fmax;
    const parts = [`${f.toFixed(0)} Hz`];
    psds.forEach((p, i) => { if (!p) return; const k = Math.round(f / fmax * (p.db.length - 1)); parts.push(`<span style="color:${AXIS_COLOR[i]}">■</span> ${p.db[k].toFixed(1)} dB`); });
    return parts.join('<br>');
  });
}

// -- step response --
function drawStep() {
  const { ctx, w, h } = setup('stepCanvas');
  const steps = current.metrics.axes.map(A => A.step);
  if (!steps.some(Boolean)) { ctx.fillStyle = MUTED; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('not enough stick input to deconvolve', w / 2, h / 2); return; }
  const tmax = 500;
  let ymax = 1.3, ymin = 0;
  for (const s of steps) if (s) for (let i = 0; i < s.step.length; i++) { ymax = Math.max(ymax, s.step[i]); ymin = Math.min(ymin, s.step[i]); }
  ymax = Math.min(2.5, Math.ceil(ymax * 10) / 10 + 0.1); ymin = Math.max(-0.5, Math.floor(ymin * 10) / 10);
  const pad = { l: 40, r: 10, t: 8, b: 24 };
  const fr = frame(ctx, w, h, pad, 0, tmax, ymin, ymax);
  gridLines(ctx, fr, ticks(0, tmax, 5), ticks(ymin, ymax, 5), v => `${v}ms`, v => v.toFixed(1));
  // target line
  ctx.strokeStyle = MUTED; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad.l, fr.Y(1)); ctx.lineTo(pad.l + fr.pw, fr.Y(1)); ctx.stroke(); ctx.setLineDash([]);
  steps.forEach((s, i) => {
    if (!s) return;
    const pts = []; for (let k = 0; k < s.step.length; k++) pts.push([fr.X(s.t[k]), fr.Y(s.step[k])]);
    line(ctx, pts, AXIS_COLOR[i], 2);
  });
  // metric labels, direct
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  let ly = pad.t + 4;
  steps.forEach((s, i) => {
    if (!s) return;
    ctx.fillStyle = AXIS_COLOR[i]; ctx.fillRect(pad.l + fr.pw - 150, ly + 4, 8, 3);
    ctx.fillStyle = TEXT; ctx.fillText(`${AXIS_NAME[i]} ${s.metrics.riseMs ?? '—'}ms  ${s.metrics.overshootPct > 0 ? '+' : ''}${s.metrics.overshootPct}%`, pad.l + fr.pw - 138, ly);
    ly += 15;
  });
  tooltip('stepCanvas', 'stepTip', (x) => {
    if (x < pad.l || x > pad.l + fr.pw) return null;
    const tms = (x - pad.l) / fr.pw * tmax;
    const parts = [`${tms.toFixed(0)} ms`];
    steps.forEach((s, i) => { if (!s) return; const k = Math.min(s.step.length - 1, Math.round(tms / tmax * (s.step.length - 1))); parts.push(`<span style="color:${AXIS_COLOR[i]}">■</span> ${s.step[k].toFixed(2)} (${s.windows} win)`); });
    return parts.join('<br>');
  });
}

// -- throttle heatmap --
function drawHeat(canvasId, tipId, heat) {
  const { ctx, w, h } = setup(canvasId);
  if (!heat) { ctx.fillStyle = MUTED; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('not enough throttle range', w / 2, h / 2); return; }
  const pad = { l: 44, r: 10, t: 8, b: 24 };
  const fmax = heat.freq[heat.freq.length - 1];
  const fr = frame(ctx, w, h, pad, 0, fmax, 0, 100);
  let lo = Infinity, hi = -Infinity;
  for (const r of heat.rows) if (r.db) for (let k = 2; k < r.db.length; k++) { lo = Math.min(lo, r.db[k]); hi = Math.max(hi, r.db[k]); }
  if (!isFinite(lo)) { ctx.fillStyle = MUTED; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('not enough throttle range', w / 2, h / 2); return; }
  hi = lo + Math.max(20, (hi - lo) * 0.85); // clip the top so one spike does not wash the rest
  const rows = heat.rows.length, cols = heat.freq.length;
  const cw = fr.pw / cols, ch = fr.ph / rows;
  for (let r = 0; r < rows; r++) {
    const row = heat.rows[r];
    const y = fr.Y(row.band[1] * 100);
    if (!row.db) { ctx.fillStyle = '#1a1c23'; ctx.fillRect(pad.l, y, fr.pw, ch); continue; }
    for (let k = 0; k < cols; k++) {
      const v = Math.max(0, Math.min(1, (row.db[k] - lo) / (hi - lo)));
      ctx.fillStyle = heatColor(v);
      ctx.fillRect(pad.l + k * cw, y, cw + 0.5, ch + 0.5);
    }
  }
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = MUTED; ctx.font = MONO;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of ticks(0, fmax, 6)) { const x = Math.round(fr.X(v)) + 0.5; ctx.fillText(`${v}`, x, pad.t + fr.ph + 4); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of [0, 25, 50, 75, 100]) ctx.fillText(`${v}%`, pad.l - 6, fr.Y(v));
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('Hz', w - pad.r, h - 2);
  tooltip(canvasId, tipId, (x, y) => {
    if (x < pad.l || x > pad.l + fr.pw || y < pad.t || y > pad.t + fr.ph) return null;
    const k = Math.min(cols - 1, Math.floor((x - pad.l) / cw));
    const r = Math.min(rows - 1, Math.floor((pad.t + fr.ph - y) / ch));
    const row = heat.rows[r];
    return `${heat.freq[k].toFixed(0)} Hz @ ${Math.round(row.band[0] * 100)}–${Math.round(row.band[1] * 100)}% thr<br>${row.db ? row.db[k].toFixed(1) + ' dB' : 'no data'}`;
  });
}
/* Single-hue sequential ramp: panel -> brand orange, then to near-white at the top. */
function heatColor(v) {
  const stops = [[21, 23, 29], [120, 40, 20], [255, 77, 26], [255, 200, 150]];
  const p = v * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const c = stops[i].map((a, j) => Math.round(a + (stops[i + 1][j] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// -- motors --
function drawMotors() {
  const { ctx, w, h } = setup('motorCanvas');
  const tr = current.traces, t = tr.t, n = t.length, t0 = t[0], t1 = t[n - 1];
  const [lo, hi] = tr.motorRange, span = hi - lo || 1;
  const pad = { l: 44, r: 10, t: 8, b: 24 };
  const fr = frame(ctx, w, h, pad, t0, t1, 0, 100);
  gridLines(ctx, fr, ticks(t0, t1, 8), [0, 25, 50, 75, 100], v => `${(v - t0).toFixed(0)}s`, v => `${v}%`);
  tr.motors.forEach((m, i) => {
    const pts = []; for (let k = 0; k < n; k++) pts.push([fr.X(t[k]), fr.Y(Math.max(0, Math.min(100, (m[k] - lo) / span * 100)))]);
    line(ctx, pts, AXIS_COLOR[i % AXIS_COLOR.length], 1);
  });
  tooltip('motorCanvas', 'motorTip', (x) => {
    if (x < pad.l || x > pad.l + fr.pw) return null;
    const i = Math.min(n - 1, Math.max(0, Math.round((x - pad.l) / fr.pw * (n - 1))));
    return `t ${(t[i] - t0).toFixed(2)}s<br>` + tr.motors.map((m, k) => `<span style="color:${AXIS_COLOR[k % 4]}">■</span> M${k + 1} ${((m[i] - lo) / span * 100).toFixed(0)}%`).join('<br>');
  });
}
