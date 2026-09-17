#!/usr/bin/env node
// Pins the whoop parts-picker catalog to IDs that already exist in motorDB /
// propDB. A stale picker ID would silently vanish from the dropdown.
import { readFileSync } from 'node:fs';
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
