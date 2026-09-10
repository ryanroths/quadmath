/* Analysis worker. Receives an ArrayBuffer of a .bbl/.bfl file, parses it
   with the blackbox-log WASM module, runs the metrics engine and returns
   plot-ready, decimated data plus findings. The raw log never leaves the
   browser; the page only ever posts the metrics JSON to the Tune Advisor. */

import { Parser, getWasm } from './vendor/blackbox-log.module.js';
import { readSettings, extractLog, decimate, envelope } from './blackbox-extract.js';
import { analyze } from './blackbox-metrics.js';
import { buildFindings, advisorPayload } from './blackbox-rules.js';

let parserPromise = null;
function parser() {
  if (!parserPromise) parserPromise = getWasm().then(w => Parser.init(w));
  return parserPromise;
}

let file = null; // current LogFile, kept so log switching does not re-parse the container

self.onmessage = async e => {
  const { id, type } = e.data;
  try {
    if (type === 'load') {
      const p = await parser();
      if (file) { try { file.free(); } catch (_) { /* already gone */ } }
      file = p.loadFile(new Uint8Array(e.data.buffer));
      const logs = [];
      for (let i = 0; i < file.logCount; i++) {
        try {
          const h = file.parseHeaders(i);
          logs.push({ index: i, firmware: h.firmwareRevision, craft: h.craftName || '', board: h.boardInfo || '' });
        } catch (err) { logs.push({ index: i, firmware: 'unreadable', error: String(err) }); }
      }
      self.postMessage({ id, type: 'loaded', logs });
      return;
    }
    if (type === 'analyze') {
      if (!file) throw new Error('No file loaded');
      const h = file.parseHeaders(e.data.index);
      if (!h) throw new Error('Log index out of range');
      const settings = readSettings(h);
      self.postMessage({ id, type: 'progress', stage: 'decoding' });
      const log = extractLog(h, h.getDataParser(), settings);
      self.postMessage({ id, type: 'progress', stage: 'analyzing' });
      const m = analyze(log);
      m.droppedFrames = log.droppedFrames;
      const { findings, cli } = buildFindings(m, settings);
      const advisor = advisorPayload(m, settings, findings);

      // Plot data: envelopes for the fast traces, plain decimation for the rest.
      const maxPts = 2400;
      const traces = {
        t: decimate(log.t, maxPts),
        gyro: log.gyro.map(a => envelope(a, maxPts)),
        gyroRaw: log.gyroRaw ? log.gyroRaw.map(a => envelope(a, maxPts)) : null,
        setpoint: log.setpoint.map(a => decimate(a, maxPts)),
        pidD: log.pidD.map(a => (a ? envelope(a, maxPts) : null)),
        throttle: decimate(log.throttle, maxPts),
        motors: log.motors.map(a => decimate(a, maxPts)),
        vbat: log.vbat ? decimate(log.vbat, maxPts) : null,
        amps: log.amps ? decimate(log.amps, maxPts) : null,
        motorRange: log.motorRange,
      };
      // Strip the heavy per-axis PSD arrays down to Float32 for transfer.
      const axes = m.axes.map(A => ({
        name: A.name, peaks: A.peaks, peaksRaw: A.peaksRaw, noise: A.noise,
        psd: A.psd, psdRaw: A.psdRaw, psdD: A.psdD,
        step: A.step ? { t: A.step.t, step: A.step.step, windows: A.step.windows, considered: A.step.considered, metrics: A.step.metrics } : null,
        heat: A.heat,
      }));
      const metrics = { ...m, axes };
      self.postMessage({ id, type: 'result', settings: stripSettings(settings), metrics, findings, cli, advisor, traces });
      return;
    }
    throw new Error('Unknown message ' + type);
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err && err.message ? err.message : String(err) });
  }
};

function stripSettings(s) {
  // `raw` is every header as strings — useful for the settings table, but
  // keep it as a plain object so structured clone is cheap.
  return { ...s, raw: s.raw };
}
