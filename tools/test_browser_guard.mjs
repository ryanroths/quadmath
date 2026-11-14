// tools/browser_guard.mjs: a browser started with spawnBrowser() dies with
// the tool that started it, however the tool ends. A stand-in "browser" (a
// node process that idles, carrying a --user-data-dir of its own) is started
// by a parent script that then ends one way or another; the stand-in must be
// gone within a few seconds each time.
// - The stand-in is detached: on Windows libuv puts a child that is not in a
//   kill-on-close job, which would end it with node and prove nothing.
// - "relaunch": the stand-in is a launcher that starts the real one (same
//   profile, detached) and exits, as Edge's launcher can. The guard must find
//   it by its profile; it is in no tree of the parent's.
// - The control cases show both stand-ins outliving a tool with no guard.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const GUARD = pathToFileURL(fileURLToPath(new URL('./browser_guard.mjs', import.meta.url))).href;
const dir = mkdtempSync(join(tmpdir(), 'qm-guardtest-'));
after(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* best effort */ } });

// The parent: node parent.mjs <guard|plain> <direct|relaunch> <exit|throw|hang|closed> <profile>.
// It prints the pid of the process that must die (the stand-in, or the one
// the launcher handed off to), then ends as told.
const PARENT = join(dir, 'parent.mjs');
writeFileSync(PARENT, `import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { spawnBrowser, closeBrowsers } from ${JSON.stringify(GUARD)};
const [how, kind, end, profile] = process.argv.slice(2);
const start = how === 'plain' ? spawn : spawnBrowser;
const IDLE = 'setInterval(() => {}, 1000)';
const handoff = profile + '.pid';
// The launcher: starts the real stand-in on the same profile, writes its pid, exits.
const LAUNCH = "const { spawn } = require('child_process'); const fs = require('fs');" +
  " const [p, f] = process.argv.slice(1);" +
  " const g = spawn(process.execPath, ['-e', " + JSON.stringify(IDLE) + ", '--', '--user-data-dir=' + p], { detached: true, stdio: 'ignore' });" +
  " g.unref(); fs.writeFileSync(f, String(g.pid));";
const args = kind === 'relaunch' ? ['-e', LAUNCH, '--', profile, handoff] : ['-e', IDLE, '--', '--user-data-dir=' + profile];
const child = start(process.execPath, args.concat(kind === 'relaunch' ? ['--user-data-dir=' + profile] : []), { stdio: 'ignore', detached: true });
child.unref();
let pid = child.pid;
if (kind === 'relaunch') {
  const t0 = Date.now();
  while (!existsSync(handoff) && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 50));
  pid = Number(readFileSync(handoff, 'utf8'));
}
console.log(pid);
setTimeout(() => {
  if (end === 'exit') process.exit(0);
  if (end === 'throw') throw new Error('the tool threw');
  if (end === 'closed') {
    closeBrowsers();
    let started = false;
    try { spawnBrowser(process.execPath, ['-e', '0']); started = true; } catch (e) { /* refused */ }
    console.log(started ? 'started' : 'refused');
    process.exit(0);
  }
  // 'hang': wait to be killed or signalled.
}, 300);
setInterval(() => {}, 1000);
`);

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function goneWithin(pid, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (!alive(pid)) return true; await sleep(100); }
  return !alive(pid);
}
function killHard(pid) {
  // The one process, not its tree: the stand-in must be killed by the guard.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
  else { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
}

// Whatever a case leaves behind, it does not outlive this file.
const strays = [];
after(() => { for (const pid of strays) if (alive(pid)) killHard(pid); });

let seq = 0;
async function startParent(how, kind, end) {
  const profile = join(dir, 'profile-' + (++seq));
  const parent = spawn(process.execPath, [PARENT, how, kind, end, profile], { stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise((r) => parent.once('exit', (code, signal) => r({ code, signal })));
  let out = '';
  let err = '';
  parent.stderr.on('data', (b) => { err += b; });
  await new Promise((res, rej) => {
    parent.stdout.on('data', (b) => { out += b; if (out.includes('\n')) res(); });
    parent.once('exit', () => rej(new Error('the parent ended before it printed the pid: ' + out + err)));
  });
  const browser = parseInt(out, 10);
  strays.push(browser);
  assert.ok(browser > 0 && alive(browser), 'the stand-in is running');
  return { parent, browser, closed, output: () => out };
}

for (const kind of ['direct', 'relaunch']) {
  test(`control (${kind}): without the guard, the stand-in outlives its tool`, async () => {
    const { browser, closed } = await startParent('plain', kind, 'exit');
    assert.equal((await closed).code, 0);
    await sleep(1500);
    assert.ok(alive(browser), 'the control stand-in died with its tool: the cases below would prove nothing');
    killHard(browser);
  });

  test(`${kind}: the tool exits, its browser is gone`, async () => {
    const { browser, closed } = await startParent('guard', kind, 'exit');
    assert.equal((await closed).code, 0);
    assert.ok(await goneWithin(browser, 5000), 'the stand-in outlived a normal exit');
  });

  test(`${kind}: the tool throws, its browser is gone`, async () => {
    const { browser, closed } = await startParent('guard', kind, 'throw');
    assert.notEqual((await closed).code, 0);
    assert.ok(await goneWithin(browser, 5000), 'the stand-in outlived an uncaught throw');
  });

  test(`${kind}: the tool is killed outright (nothing in it runs), the watchdog kills its browser`, async () => {
    const { parent, browser, closed } = await startParent('guard', kind, 'hang');
    killHard(parent.pid);
    await closed;
    assert.ok(await goneWithin(browser, 8000), 'the stand-in outlived a hard kill of its tool');
  });

  test(`${kind}: closeBrowsers() kills its browser, and no new one starts`, async () => {
    const { browser, closed, output } = await startParent('guard', kind, 'closed');
    await closed;
    assert.match(output(), /refused/);
    assert.ok(await goneWithin(browser, 5000), 'the stand-in outlived closeBrowsers()');
  });

  test(`${kind}: SIGINT or SIGTERM, its browser is gone and the tool exits as the signal would`, { skip: process.platform === 'win32' && 'Windows has no catchable SIGINT or SIGTERM to send; a kill there is the hard kill above' }, async () => {
    for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
      const { parent, browser, closed } = await startParent('guard', kind, 'hang');
      process.kill(parent.pid, sig);
      assert.equal((await closed).code, code, sig);
      assert.ok(await goneWithin(browser, 5000), 'the stand-in outlived ' + sig);
    }
  });
}
