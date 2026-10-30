// `wrangler dev` for workers/sim-rooms, for the ghost room tests
// (test_sim_rooms_wrangler.mjs, test_sim_ghost_room_page.mjs). wrangler is
// workers/sim-rooms' own (`npm install` there), the leaderboard Worker's, or
// WRANGLER=<path to wrangler's bin/wrangler.js>; findWrangler() is null
// without one, and the tests skip.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const roomsWorkerDir = join(root, 'workers', 'sim-rooms');

export function findWrangler() {
  const list = [
    process.env.WRANGLER,
    join(roomsWorkerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    join(root, 'workers', 'sim-leaderboard', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  ].filter(Boolean);
  return list.find((p) => existsSync(p)) || null;
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

// wrangler, its workerd and their children: the whole tree.
export function killTree(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { try { child.kill('SIGTERM'); } catch (err) { /* gone */ } } }
}

// vars: {ROOM_TTL_MS: '6000', ALLOWED_ORIGIN: '...'}. Local storage goes to
// a temp dir, removed by stop().
export async function startRoomsDev(bin, vars = {}) {
  const port = await freePort();
  const persist = mkdtempSync(join(tmpdir(), 'qm-rooms-'));
  const args = [bin, 'dev', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', persist,
    '--show-interactive-dev-session=false'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', k + ':' + v);
  const child = spawn(process.execPath, args, {
    cwd: roomsWorkerDir,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const stop = async () => {
    killTree(child);
    await sleep(500);
    try { rmSync(persist, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    if (/Ready on/.test(log)) return { port, base: 'http://127.0.0.1:' + port, log: () => log, stop };
    if (child.exitCode != null) break;
    await sleep(200);
  }
  await stop();
  throw new Error('wrangler dev did not start:\n' + log.slice(-3000));
}
