// `wrangler dev` for the sim's Workers, for the tests that run them:
// workers/sim-rooms (test_sim_rooms_wrangler.mjs, test_sim_ghost_room_page.mjs,
// test_sim_csp.mjs) and workers/sim-leaderboard (test_sim_csp.mjs). wrangler
// is workers/sim-rooms' own (`npm install` there), the leaderboard Worker's,
// or WRANGLER=<path to wrangler's bin/wrangler.js>; findWrangler() is null
// without one, and the tests skip.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const roomsWorkerDir = join(root, 'workers', 'sim-rooms');
export const leaderboardWorkerDir = join(root, 'workers', 'sim-leaderboard');

export function findWrangler() {
  const list = [
    process.env.WRANGLER,
    join(roomsWorkerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    join(leaderboardWorkerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
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

const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };

// openssl, for a test certificate: OPENSSL=, on the PATH, or Git for Windows'.
function findOpenssl() {
  const list = [process.env.OPENSSL, 'openssl', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'C:/Program Files/Git/usr/bin/openssl.exe'].filter(Boolean);
  for (const p of list) {
    const r = spawnSync(p, ['version'], { encoding: 'utf8' });
    if (r.status === 0) return p;
  }
  return null;
}

// A self-signed certificate for 127.0.0.1, localhost and the deployed Worker
// hosts, made for this run in dir: {key, cert} paths and the cert's PEM, or
// null without openssl (wrangler then makes its own, which Node cannot trust).
function makeCert(dir) {
  const openssl = findOpenssl();
  if (!openssl) return null;
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  const r = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2',
    '-subj', '/CN=quadmath-local-test',
    '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:sim-rooms.ryan-roths.workers.dev,DNS:sim-leaderboard.ryan-roths.workers.dev'],
  { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(cert)) return null;
  return { key, cert, pem: readFileSync(cert, 'utf8') };
}

// This process's own fetch and WebSocket (a scripted pilot) trust a Worker's
// test certificate, as well as the usual ones. false where Node cannot.
export function trustCert(pem) {
  if (!pem || typeof tls.setDefaultCACertificates !== 'function') return false;
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), pem]);
  return true;
}

// wrangler dev for the Worker in dir, on a free port of 127.0.0.1. vars:
// {ROOM_TTL_MS: '6000', ALLOWED_ORIGIN: '...'}. Local storage (Durable
// Objects, D1) goes to a temp dir, removed by stop(). opts.https: served over
// TLS, with a certificate made for the run when openssl is there (its PEM is
// .cert; trustCert(.cert) lets this process's clients in). opts.d1: a D1
// database name and an SQL file to create its tables with, locally, first.
export async function startWorkerDev(dir, bin, vars = {}, opts = {}) {
  const port = await freePort();
  const persist = mkdtempSync(join(tmpdir(), 'qm-rooms-'));
  const stop = async (child) => {
    killTree(child);
    await sleep(500);
    try { rmSync(persist, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  };
  if (opts.d1) {
    const r = spawnSync(process.execPath, [bin, 'd1', 'execute', opts.d1.name, '--local', '--persist-to', persist, '--file', opts.d1.file, '--yes'],
      { cwd: dir, env: WRANGLER_ENV, encoding: 'utf8', timeout: 120000 });
    if (r.status !== 0) { await stop(null); throw new Error('wrangler d1 execute failed:\n' + (r.stdout + r.stderr).slice(-2000)); }
  }
  const args = [bin, 'dev', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', persist,
    '--show-interactive-dev-session=false'];
  let cert = null;
  if (opts.https) {
    args.push('--local-protocol', 'https');
    cert = makeCert(persist);
    if (cert) args.push('--https-key-path', cert.key, '--https-cert-path', cert.cert);
  }
  for (const [k, v] of Object.entries(vars)) args.push('--var', k + ':' + v);
  const child = spawn(process.execPath, args, {
    cwd: dir,
    env: WRANGLER_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    if (/Ready on/.test(log)) {
      return { port, base: (opts.https ? 'https' : 'http') + '://127.0.0.1:' + port, cert: cert ? cert.pem : null, log: () => log, stop: () => stop(child) };
    }
    if (child.exitCode != null) break;
    await sleep(200);
  }
  await stop(child);
  throw new Error('wrangler dev did not start:\n' + log.slice(-3000));
}

// The rooms Worker (workers/sim-rooms).
export function startRoomsDev(bin, vars = {}, opts = {}) {
  return startWorkerDev(roomsWorkerDir, bin, vars, opts);
}

// The leaderboard Worker (workers/sim-leaderboard), its D1 tables made locally.
export function startLeaderboardDev(bin, vars = {}, opts = {}) {
  return startWorkerDev(leaderboardWorkerDir, bin, vars, {
    ...opts, d1: { name: 'quadmath-sim-leaderboard', file: join(leaderboardWorkerDir, 'src', 'schema.sql') },
  });
}
