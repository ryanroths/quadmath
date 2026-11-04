// A blackbox log's sticks as a replay fixture for the trick tests
// (tools/test_sim_tricks_logs.mjs): the log's rcCommand turned back into the
// RC channels that give it, every change with its time, gzipped JSON.
//
//   node tools/trick_log_fixture.mjs <log.BBL> --log <index> --quad air65|fractal75 --out <file.json.gz>
//
// The log is decoded with quadmath's vendored decoder (vendor/blackbox-log
// .module.js). Betaflight logs rcCommand, not the channels, so each channel
// value 1000..2000 is fed to a probe instance of the vendored sim-core with
// the quad's airframe and diff, and the rcCommand Betaflight makes of it read
// back; a logged rcCommand is replayed as the channel that gives it, the one
// nearest centre where several do (the method of sim-core's
// tools/sim-vs-log.mjs). Frames the decoder marks corrupt (a motor outside
// 0..2047) are dropped, as sim-core's readLog drops them. The logs themselves
// stay out of git (they are the owner's, in SIM_CORE_LOGS); only this derived
// fixture is committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { SimCore } from '../vendor/sim-core/sim-core.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const SLOT_US = 4000;
export const QUADS = {
  air65: { airframe: 'vendor/sim-core/airframes/air65.json', diff: 'vendor/sim-core/configs/air65-ryfly-2026-10-23.txt' },
  fractal75: { airframe: 'vendor/sim-core/airframes/fractal75.json', diff: 'vendor/sim-core/configs/fractal75-ryfly-2026-11-03.txt' },
};

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

// The log's frames: time (us from the first; the decoder gives s), rcCommand[0..3], and the mode
// mask (the slow frames' flightModeFlags, Betaflight's rcModeActivationMask).
export async function readSticks(file, li) {
  const { Parser, getWasm } = await import(pathToFileURL(join(root, 'vendor', 'blackbox-log.module.js')).href);
  const parser = await Parser.init(await getWasm());
  const log = parser.loadFile(new Uint8Array(readFileSync(file)));
  if (!(li >= 0 && li < log.logCount)) throw new Error(`log ${li} not in file (${log.logCount} logs)`);
  const h = log.parseHeaders(li);
  const hiRes = Number(new Map(h.unknown).get('blackbox_high_resolution')) ? 10 : 1;
  const rows = [];
  let mask = null;
  let dropped = 0;
  for (const ev of h.getDataParser()) {
    if (ev.kind === 'slow' && ev.data && ev.data.fields) {
      const m = ev.data.fields.get('flightModeFlags');
      if (m != null) mask = m;
      continue;
    }
    if (ev.kind !== 'main') continue;
    const f = ev.data.fields;
    const motors = [0, 1, 2, 3].map((i) => f.get(`motor[${i}]`));
    if (motors.some((v) => !(v >= 0 && v <= 2047))) { dropped++; continue; }
    rows.push({ t: ev.data.time * 1e6, rc: [0, 1, 2, 3].map((i) => f.get(`rcCommand[${i}]`) / hiRes), mask });
  }
  const t0 = rows[0].t;
  for (const r of rows) r.t -= t0;
  return { rows, dropped, craft: h.craftName, firmware: h.firmwareRevision };
}

// rcCommand -> channel per axis, on a probe instance (sim-vs-log inversion).
export async function inversion(wasm, diff, airframe) {
  const probe = await SimCore.load(wasm, { trace: false });
  probe.configure({ diff, plant: airframe, world: { floorZ: -100 } });
  const maps = [new Map(), new Map(), new Map(), new Map()];
  for (let axis = 0; axis < 4; axis++) {
    for (let c = 1000; c <= 2000; c++) {
      const ch = [1500, 1500, 1500, 1000];
      ch[axis] = c;
      probe.input(ch);
      let rc = NaN;
      for (let k = 0; k < 400; k++) {
        probe.step(1);
        const v = Math.round(probe.fc.rcCommand[axis]);
        if (v === rc && k > 8) break;
        rc = v;
      }
      const centre = axis === 3 ? 1000 : 1500;
      const prev = maps[axis].get(rc);
      if (prev === undefined || Math.abs(c - centre) < Math.abs(prev - centre)) maps[axis].set(rc, c);
    }
  }
  return maps.map((m) => {
    const keys = [...m.keys()].sort((a, b) => a - b);
    return (rc) => {
      const r = Math.round(rc);
      if (m.has(r)) return m.get(r);
      let best = keys[0];
      for (const k of keys) if (Math.abs(k - r) < Math.abs(best - r)) best = k;
      return m.get(best);
    };
  });
}

async function main() {
  const a = args(process.argv.slice(2));
  const file = a._[0];
  const quad = QUADS[a.quad];
  if (!file || !quad || !a.out) {
    console.error('usage: node tools/trick_log_fixture.mjs <log.BBL> --log <index> --quad air65|fractal75 --out <file.json.gz>');
    process.exit(2);
  }
  const li = Number(a.log || 0);
  const airframe = JSON.parse(readFileSync(join(root, quad.airframe), 'utf8'));
  const diff = readFileSync(join(root, quad.diff), 'utf8');
  const wasm = await WebAssembly.compile(readFileSync(join(root, 'vendor/sim-core/sim-core.wasm')));
  const log = await readSticks(file, li);
  const inv = await inversion(wasm, diff, airframe);
  // One row per change of the channels or the mode mask: [dt us, ch0..ch3
  // deltas, mask], deltas from the row before (the first from 0).
  const flat = [];
  // On the page's stick poll: the value at the end of each 4 ms slot (the
  // page polls the sticks every 4 ms; sim-core reads them at its RX rate).
  const slots = new Map();
  for (const r of log.rows) {
    const ch = [inv[0](r.rc[0]), inv[1](r.rc[1]), inv[2](r.rc[2]), inv[3](r.rc[3])];
    slots.set(Math.floor(r.t / SLOT_US), [...ch, r.mask == null ? 1 : r.mask]);
  }
  let ps = 0, pv = [0, 0, 0, 0, 0], last = null;
  for (const [slot, v] of slots) {
    const key = v.join(',');
    if (key === last) continue;
    last = key;
    flat.push(slot - ps, v[0] - pv[0], v[1] - pv[1], v[2] - pv[2], v[3] - pv[3], v[4] - pv[4]);
    ps = slot; pv = v;
  }
  const out = {
    v: 1,
    kind: 'quadmath-trick-replay',
    log: basename(file), index: li, quad: a.quad, airframe: quad.airframe, diff: quad.diff,
    craft: log.craft, firmware: log.firmware, frames: log.rows.length, dropped: log.dropped,
    duration_s: Math.round(log.rows[log.rows.length - 1].t) / 1e6,
    method: 'rcCommand inverted to RC channels on a probe instance of the vendored sim-core with this airframe and diff (as sim-core tools/sim-vs-log.mjs), the last value in each 4 ms slot; one row per change: slots since the last row, ch0..ch3 deltas, mode mask delta',
    slotUs: SLOT_US,
    rows: flat.length / 6,
    data: flat,
  };
  writeFileSync(a.out, gzipSync(Buffer.from(JSON.stringify(out)), { level: 9 }));
  console.log(`${a.out}: ${out.rows} changes over ${out.duration_s} s (${log.rows.length} frames, ${log.dropped} dropped)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
