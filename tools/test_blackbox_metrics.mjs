// node tools/test_blackbox_metrics.mjs path/to/log.bbl [logIndex]
// Runs the same pipeline the page runs, in Node, and prints the findings.
import fs from 'node:fs';
import { Parser, getWasm } from '../vendor/blackbox-log.module.js';
import { readSettings, extractLog } from '../blackbox-extract.js';
import { analyze } from '../blackbox-metrics.js';
import { buildFindings } from '../blackbox-rules.js';

const path = process.argv[2]; const which = +(process.argv[3] || 0);
const parser = await Parser.init(await getWasm());
const file = parser.loadFile(fs.readFileSync(path));
console.log(`${file.logCount} log(s) in file`);
const h = file.parseHeaders(which);
const s = readSettings(h);
const t0 = performance.now();
const log = extractLog(h, h.getDataParser(), s);
const t1 = performance.now();
const m = analyze(log);
m.droppedFrames = log.droppedFrames;
const t2 = performance.now();
const { findings, cli } = buildFindings(m, s);
console.log(`${s.firmware} ${s.board} | fs ${m.fs} Hz | ${m.durationS}s | flight ${m.flightFraction} | raw ${m.hasRaw} | dropped ${log.droppedFrames}`);
console.log(`extract ${(t1-t0).toFixed(0)} ms, analyze ${(t2-t1).toFixed(0)} ms`);
console.log('pids', JSON.stringify(s.pids), 'filters', JSON.stringify(s.filters));
for (const A of m.axes) console.log(A.name, 'peaks', JSON.stringify(A.peaks), 'step', A.step ? JSON.stringify(A.step.metrics)+' w='+A.step.windows+'/'+A.step.considered : null, 'noise', JSON.stringify(A.noise));
console.log('motors', JSON.stringify(m.motors), 'batt', JSON.stringify(m.battery), 'pw', JSON.stringify(m.propwash));
for (const f of findings) console.log(`[${f.sev}] ${f.title} — ${f.detail}${f.fix ? '\n    -> ' + f.fix.replace(/\n/g, ' | ') : ''}`);
console.log('\n' + cli);
