// The leaderboard Worker's deploy guard: workers/sim-leaderboard/scripts/predeploy.mjs,
// which npm runs before `npm run deploy`. Each case runs the real script in a
// throwaway clone of a throwaway bare "origin". The clone holds the guard, the
// Worker's package.json, wrangler.jsonc and entry module, and the repo modules
// the entry imports (sim-retention.js, sim-share.js), copied from this checkout.
// The guard lets a deploy through only on main, level with origin/main as
// fetched just then, with nothing the Worker ships uncommitted, and then prints
// the commit and PHYS_VER. Git runs with no global or system config. Nothing
// is deployed: the guard runs on its own and wrangler never does.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PHYS_VER } from '../sim-retention.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = 'workers/sim-leaderboard';
const GUARD = `${WORKER}/scripts/predeploy.mjs`;
const FILES = [GUARD, `${WORKER}/package.json`, `${WORKER}/wrangler.jsonc`, `${WORKER}/src/index.js`, 'sim-retention.js', 'sim-share.js'];

const tmp = mkdtempSync(join(tmpdir(), 'qm-predeploy-'));
after(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }));

const emptyConfig = join(tmp, 'gitconfig');
writeFileSync(emptyConfig, '');
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
Object.assign(ENV, {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: emptyConfig,
  GIT_AUTHOR_NAME: 'predeploy test',
  GIT_AUTHOR_EMAIL: 'predeploy@example.invalid',
  GIT_COMMITTER_NAME: 'predeploy test',
  GIT_COMMITTER_EMAIL: 'predeploy@example.invalid',
  GIT_TERMINAL_PROMPT: '0',
});

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr || r.error}`);
  return r.stdout.trim();
}

function commit(dir, msg) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
}

// The bare origin, and main on it: the Worker as this checkout has it.
const ORIGIN = join(tmp, 'origin.git');
git(tmp, 'init', '-q', '--bare', '-b', 'main', ORIGIN);
{
  const seed = join(tmp, 'seed');
  git(tmp, 'init', '-q', '-b', 'main', seed);
  for (const f of FILES) {
    mkdirSync(dirname(join(seed, f)), { recursive: true });
    copyFileSync(join(root, f), join(seed, f));
  }
  writeFileSync(join(seed, 'README.md'), 'fixture\n');
  commit(seed, 'the Worker');
  git(seed, 'remote', 'add', 'origin', ORIGIN);
  git(seed, 'push', '-q', 'origin', 'main');
}

let n = 0;
function clone() {
  const dir = join(tmp, `c${++n}`);
  git(tmp, 'clone', '-q', ORIGIN, dir);
  return dir;
}

function guard(dir) {
  const r = spawnSync(process.execPath, [join(dir, GUARD)], { cwd: dir, env: ENV, encoding: 'utf8' });
  if (r.error) throw r.error;
  return r;
}

function refused(r, ...res) {
  assert.equal(r.status, 1, `refused\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /^predeploy: refusing to deploy sim-leaderboard\. Nothing was deployed\./);
  for (const re of res) assert.match(r.stderr, re);
  assert.equal(r.stdout, '', 'nothing on stdout, so no PHYS_VER');
}

test('npm run deploy runs the guard first, and DEPLOY.md deploys with it', () => {
  const pkg = JSON.parse(readFileSync(join(root, WORKER, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.predeploy, 'node scripts/predeploy.mjs');
  assert.equal(pkg.scripts.deploy, 'wrangler deploy');
  const doc = readFileSync(join(root, WORKER, 'DEPLOY.md'), 'utf8');
  assert.match(doc, /^npm run deploy\r?$/m);
  assert.doesNotMatch(doc, /^\s*npx wrangler deploy\b/m, 'no bare `npx wrangler deploy` step, which skips the guard');
});

test('on main, level with origin/main, nothing shipped uncommitted: clear, with the commit and PHYS_VER', () => {
  const dir = clone();
  // Untracked files, and changes outside what the Worker ships, do not count.
  writeFileSync(join(dir, WORKER, 'package-lock.json'), '{}\n');
  appendFileSync(join(dir, 'README.md'), 'a local note\n');
  const r = guard(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.match(r.stdout, /^predeploy: sim-leaderboard is clear to deploy\./);
  assert.match(r.stdout, new RegExp(`^  commit +${head.slice(0, 7)} the Worker$`, 'm'));
  assert.match(r.stdout, /^  branch +main, level with origin\/main$/m);
  assert.match(r.stdout, new RegExp(`^  PHYS_VER +${PHYS_VER} \\(sim-retention\\.js; boards are keyed \\.p${PHYS_VER}\\)$`, 'm'));
  const bundles = /^  bundles +(.*)$/m.exec(r.stdout);
  assert.ok(bundles, r.stdout);
  assert.deepEqual(bundles[1].split(', ').sort(), ['sim-retention.js', 'sim-share.js', `${WORKER}/src/index.js`]);
});

test('another branch, or a detached HEAD: refused', () => {
  const dir = clone();
  git(dir, 'checkout', '-q', '-b', 'sim/some-feature');
  refused(guard(dir), /on branch 'sim\/some-feature', not main/);
  git(dir, 'checkout', '-q', '--detach');
  refused(guard(dir), /HEAD is detached, not on main/);
});

test('main with local commits not on origin/main: refused', () => {
  const dir = clone();
  appendFileSync(join(dir, 'README.md'), 'unmerged\n');
  commit(dir, 'local only');
  refused(guard(dir), /1 local commit\(s\) not on origin\/main/);
});

test('main behind origin/main, found by the fetch: refused until pulled', () => {
  const dir = clone();
  const other = clone();
  appendFileSync(join(other, 'README.md'), 'merged elsewhere\n');
  commit(other, 'merged on GitHub');
  git(other, 'push', '-q', 'origin', 'main');
  refused(guard(dir), /1 commit\(s\) behind\. Run `git pull --ff-only` first\./);
  git(dir, 'pull', '-q', '--ff-only');
  assert.equal(guard(dir).status, 0);
});

test('main and origin/main diverged: refused', () => {
  const dir = clone();
  const other = clone();
  appendFileSync(join(other, 'README.md'), 'merged elsewhere\n');
  commit(other, 'merged on GitHub');
  git(other, 'push', '-q', 'origin', 'main');
  appendFileSync(join(dir, 'README.md'), 'unmerged\n');
  commit(dir, 'local only');
  refused(guard(dir), /diverged \(1 local commit\(s\), 1 on origin\/main only\)/);
});

test('origin cannot be fetched: refused, since main cannot be checked', () => {
  const dir = clone();
  git(dir, 'remote', 'set-url', 'origin', join(tmp, 'no-such-origin.git'));
  refused(guard(dir), /could not fetch main from origin/);
});

test('uncommitted changes in what the Worker ships, staged or not: refused, each file listed', () => {
  const dir = clone();
  appendFileSync(join(dir, 'sim-retention.js'), '\n// local edit\n');
  appendFileSync(join(dir, WORKER, 'src/index.js'), '\n// staged edit\n');
  git(dir, 'add', `${WORKER}/src/index.js`);
  appendFileSync(join(dir, WORKER, 'wrangler.jsonc'), '\n');
  const r = guard(dir);
  refused(r, /uncommitted changes in files this deploy would ship/, /^ {6} M sim-retention\.js$/m, /^ {6}M  workers\/sim-leaderboard\/src\/index\.js$/m, /^ {6} M workers\/sim-leaderboard\/wrangler\.jsonc$/m);
  assert.doesNotMatch(r.stderr, /README/);
});

test('a module the bundle imports that git does not track: refused', () => {
  const dir = clone();
  const entry = join(dir, WORKER, 'src/index.js');
  writeFileSync(entry, "import '../../../local-extra.js';\n" + readFileSync(entry, 'utf8'));
  writeFileSync(join(dir, '.gitignore'), 'local-extra.js\n');
  commit(dir, 'imports a file kept out of git');
  git(dir, 'push', '-q', 'origin', 'main');
  writeFileSync(join(dir, 'local-extra.js'), 'export {};\n');
  refused(guard(dir), /the bundle imports files git does not track, so they are not on main: local-extra\.js/);
});

test('every reason at once, not just the first', () => {
  const dir = clone();
  git(dir, 'checkout', '-q', '-b', 'wip');
  appendFileSync(join(dir, 'sim-share.js'), '\n// wip\n');
  refused(guard(dir), /on branch 'wip', not main/, / M sim-share\.js/);
});
