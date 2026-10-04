#!/usr/bin/env node
// Pins the whoop parts-picker catalog to IDs that already exist in motorDB /
// propDB. A stale picker ID would silently vanish from the dropdown.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(join(root, 'script.js'), 'utf8');

function idsInBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error('missing ' + startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error('missing end after ' + startNeedle);
  return [...source.slice(start, end).matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)*)'/g)].map(m => m[1]);
}

const motorIds = new Set(idsInBlock(script, 'const motorDB = {', 'const THRUST_EXPONENT'));
const propIds = new Set(idsInBlock(script, 'const propDB = {', 'const bladeTag'));
const pickerMotorIds = idsInBlock(script, 'const PICKER_MOTOR_IDS = {', 'const PICKER_PROP_IDS');
const pickerPropIds = idsInBlock(script, 'const PICKER_PROP_IDS = {', 'const PICKER_PACKS');

const missingMotors = pickerMotorIds.filter(id => !motorIds.has(id));
const missingProps = pickerPropIds.filter(id => !propIds.has(id));

if (missingMotors.length || missingProps.length) {
  console.error('picker IDs missing from calculator DBs:');
  for (const id of missingMotors) console.error('  motor ' + id);
  for (const id of missingProps) console.error('  prop ' + id);
  process.exit(1);
}

// The picker resolves IDs against motorDB[frame] / propDB[frame] and drops
// misses silently, so an ID that exists only under another frame class
// passes the check above and still vanishes. Pin each frame's list to the
// same frame's DB rows. Matters since a motor can sit in two classes under
// two IDs (the GEPRC SPEEDX2 1002: one ID per class).
//
// These four blocks are pure data literals, so they are evaluated in an empty
// sandbox rather than regex-scraped: a commented-out row, an ID quoted in a
// comment, or a double-quoted ID then counts exactly as the browser sees it.
function literal(startNeedle, endNeedle) {
  const start = script.indexOf(startNeedle);
  const end = script.indexOf(endNeedle, start);
  if (start < 0 || end < 0) throw new Error('missing ' + startNeedle + ' .. ' + endNeedle);
  const seg = script.slice(start + startNeedle.length - 1, end);   // from the opening {
  return vm.runInNewContext('(' + seg.slice(0, seg.lastIndexOf('};') + 1) + ')', {}, { timeout: 1000 });
}
const db = { motor: literal('const motorDB = {', 'const THRUST_EXPONENT'),
             prop:  literal('const propDB = {', 'const bladeTag') };
const picks = { motor: literal('const PICKER_MOTOR_IDS = {', 'const PICKER_PROP_IDS'),
                prop:  literal('const PICKER_PROP_IDS = {', 'const PICKER_PACKS') };
const wrongFrame = [];
for (const kind of ['motor', 'prop']) {
  for (const [frame, ids] of Object.entries(picks[kind])) {
    const rows = db[kind][frame];
    if (!Array.isArray(rows) || !rows.length) {
      wrongFrame.push(`${kind} picker has a ${frame}mm list but ${kind}DB has no ${frame}mm rows`);
      continue;
    }
    const have = new Set(rows.map(r => r.id));
    for (const id of ids) {
      if (!have.has(id)) wrongFrame.push(`${kind} ${id} is in the ${frame}mm picker but not ${kind}DB[${frame}]`);
    }
  }
}
if (wrongFrame.length) {
  console.error('picker IDs not in the same frame class:');
  for (const line of wrongFrame) console.error('  ' + line);
  process.exit(1);
}

if (pickerMotorIds.length < 15 || pickerPropIds.length < 8) {
  console.error('picker catalog is thinner than the v0 short-list floor');
  process.exit(1);
}

const pickerBlock = script.slice(script.indexOf('PICKER_MOTOR_IDS'), script.indexOf('const propSelect'));
if (/2207|5-inch catalog|3inch/.test(pickerBlock)) {
  console.error('picker catalog must stay whoop-only');
  process.exit(1);
}

console.log('ok — %d picker motors, %d picker props, all resolve in motorDB/propDB',
  pickerMotorIds.length, pickerPropIds.length);
