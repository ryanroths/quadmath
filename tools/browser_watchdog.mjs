// The browsers' watchdog (tools/browser_guard.mjs): node browser_watchdog.mjs
// <parent pid> <registry file>. Every 500 ms: gone once the registry file is
// (the parent removed it on its way out); once the parent is gone, kills every
// browser the registry names, by pid tree and by profile, and exits.
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { killPidTree, sweepProfiles } from './browser_guard.mjs';

const parent = Number(process.argv[2]);
const registry = process.argv[3];
if (!(parent > 0) || !registry) process.exit(2);

function alive(p) {
  try { process.kill(p, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

setInterval(() => {
  if (!existsSync(registry)) process.exit(0);
  if (alive(parent)) return;
  let list = [];
  try { list = JSON.parse(readFileSync(registry, 'utf8')); } catch (e) { /* a torn write: sweep what parses next time */ return; }
  for (const b of list) killPidTree(b.pid, b.group);
  sweepProfiles(list.map((b) => b.profile));
  try { rmSync(registry, { force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
}, 500);
