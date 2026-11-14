// Every browser a tool starts dies with that tool: when it passes, fails or
// throws, when it is interrupted (Ctrl+C, SIGTERM, SIGHUP, Ctrl+Break), and
// when node itself is killed outright and runs nothing at all (taskkill /F,
// SIGKILL, a crash). spawnBrowser() is spawn() for a browser: it starts the
// browser and guards it.
//
// What is killed: the process tree of the pid spawned, and then every process
// whose command line carries the browser's own --user-data-dir. The second
// matters on Windows: Edge's launcher can hand off to a new browser process
// and exit (a pending update does it), leaving a browser that is not in the
// spawned pid's tree and not in node's kill-on-close job. Every tool here
// gives each browser its own profile directory, so that path names it.
//
// When:
// - exit: process.on('exit') kills every browser this process started.
// - signals: a signal kills them, then the process exits as the signal would
//   have ended it (128 + its number).
// - a hard kill: nothing in this process runs, so it has one detached
//   watchdog (tools/browser_watchdog.mjs) holding a registry file of its
//   browsers. Every 500 ms the watchdog checks that this process is alive;
//   once it is not, it kills them. It exits by itself once the registry file
//   is gone (this process removes it on exit).
//
// A tool still stops its browser itself in its finally, as before; the guard
// is for the exits a finally never sees. closeBrowsers() kills them all and
// starts no more: for a test file's after() hook, since a test node:test has
// timed out keeps running and would go on starting browsers.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WATCHDOG = fileURLToPath(new URL('./browser_watchdog.mjs', import.meta.url));
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'].concat(process.platform === 'win32' ? ['SIGBREAK'] : []);

// The browsers still running (child objects), and every one ever started, for
// the registry and the final sweep: { pid, group, profile }.
const live = new Set();
const started = [];
const entryOf = new WeakMap();
let registry = null;
let installed = false;
let closed = false;

function exited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

// A browser's --user-data-dir, from its arguments, or null.
export function profileOf(args) {
  for (const a of args || []) {
    const m = /^--user-data-dir=(.+)$/.exec(String(a));
    if (m) return m[1].replace(/^"(.*)"$/, '$1');
  }
  return null;
}

// One pid and every process it started. POSIX: a browser spawned detached
// leads its own process group, so the whole group goes at once.
export function killPidTree(pid, group) {
  if (!(pid > 0)) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(group ? -pid : pid, 'SIGKILL');
  } catch (e) { /* already gone */ }
}

// Every process whose command line carries one of these profile directories,
// whoever its parent is now. Never this process or one of its ancestors: a
// shell or runner whose own command line names the path is not a browser.
export function sweepProfiles(profiles) {
  const list = [...new Set((profiles || []).filter(Boolean))];
  if (!list.length) return;
  if (process.platform === 'win32') {
    const quoted = list.map((p) => "'" + p.replace(/'/g, "''") + "'").join(',');
    const ps = '$m=@(' + quoted + '); $all=@(Get-CimInstance Win32_Process); $up=@{}; foreach ($q in $all) { $up[[int]$q.ProcessId]=[int]$q.ParentProcessId };' +
      ' $skip=@{}; $p=' + process.pid + '; for ($i=0; $i -lt 64 -and $p -gt 0 -and -not $skip.ContainsKey($p); $i++) { $skip[$p]=1; $p=$up[$p] }; $skip[$PID]=1;' +
      ' $all | Where-Object { $c=$_.CommandLine; $c -and -not $skip.ContainsKey([int]$_.ProcessId) -and ($m | Where-Object { $c.Contains($_) }) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
    try { spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', windowsHide: true, timeout: 20000 }); } catch (e) { /* best effort */ }
  } else {
    const skip = new Set([process.pid]);
    for (let p = process.ppid, i = 0; p > 1 && i < 64 && !skip.has(p); i++) {
      skip.add(p);
      const r = spawnSync('ps', ['-o', 'ppid=', '-p', String(p)], { encoding: 'utf8' });
      p = parseInt(r.stdout, 10) || 0;
    }
    for (const prof of list) {
      const re = prof.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r = spawnSync('pgrep', ['-f', '--', re], { encoding: 'utf8', timeout: 10000 });
      for (const line of String(r.stdout || '').split('\n')) {
        const pid = parseInt(line, 10);
        if (pid > 0 && !skip.has(pid)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
      }
    }
  }
}

// The browser and every process it started, by pid and by profile.
export function killBrowserTree(child) {
  if (!child) return;
  const e = entryOf.get(child);
  if (child.pid && !exited(child)) killPidTree(child.pid, e && e.group);
  if (e && e.profile) sweepProfiles([e.profile]);
}

let finalSwept = false;
function killAll() {
  for (const child of live) if (child.pid && !exited(child)) killPidTree(child.pid, (entryOf.get(child) || {}).group);
  live.clear();
  if (!finalSwept && started.length) {
    finalSwept = true;
    sweepProfiles(started.map((e) => e.profile));
  }
  if (registry) { try { rmSync(registry, { force: true }); } catch (e) { /* the watchdog then sweeps once more */ } registry = null; }
}

function writeRegistry() {
  if (!registry) return;
  try { writeFileSync(registry, JSON.stringify(started)); } catch (e) { /* the exit and signal guards still hold */ }
}

function install() {
  if (installed) return;
  installed = true;
  process.on('exit', killAll);
  for (const sig of SIGNALS) {
    process.on(sig, () => {
      killAll();
      process.exit(128 + (constants.signals[sig] || 1));
    });
  }
  registry = join(tmpdir(), 'qm-guard-' + process.pid + '-' + Date.now() + '.json');
  writeRegistry();
  try {
    const dog = spawn(process.execPath, [WATCHDOG, String(process.pid), registry], { detached: true, stdio: 'ignore', windowsHide: true });
    dog.on('error', () => { /* the exit and signal guards still hold */ });
    dog.unref();
  } catch (e) { /* the exit and signal guards still hold */ }
}

// Kills every guarded browser still running, and refuses to start another.
export function closeBrowsers() {
  closed = true;
  killAll();
}

export function guardBrowser(child, opts = {}) {
  // No pid: the spawn itself failed (ENOENT), and its 'error' event says so.
  if (!child || !child.pid) return child;
  install();
  const entry = { pid: child.pid, group: !!opts.group, profile: opts.profile || null };
  entryOf.set(child, entry);
  started.push(entry);
  writeRegistry();
  live.add(child);
  child.once('exit', () => live.delete(child));
  return child;
}

export function spawnBrowser(command, args, opts = {}) {
  if (closed) throw new Error('no new browser: this run has closed its browsers (its test ended, or timed out)');
  const child = spawn(command, args, opts);
  return guardBrowser(child, { group: !!opts.detached && process.platform !== 'win32', profile: profileOf(args) });
}
