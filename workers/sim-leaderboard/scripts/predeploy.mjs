// Runs before `npm run deploy` (npm's predeploy hook) and refuses the deploy
// unless:
//   - this checkout is on main (not another branch, not a detached HEAD),
//   - main is the same commit as origin/main, fetched just now, and
//   - nothing the Worker ships has uncommitted changes: the tracked files in
//     this folder, and every module the bundle imports (src/index.js pulls in
//     ../../../sim-retention.js and ../../../sim-share.js from the repo root).
//     Untracked and other repo files do not count; an imported module that
//     git does not track does.
// When it lets the deploy through it prints the commit and the PHYS_VER that
// sim-retention.js gives the Worker: boards are kept per PHYS_VER, so that is
// the board set the deploy switches to.
//
// `npx wrangler deploy` does not run this. Deploy with `npm run deploy`.

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER_DIR = realpathSync.native(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const NAME = 'sim-leaderboard';

function git(args, opts = {}) {
  const out = execFileSync('git', ['--literal-pathspecs', ...args], {
    cwd: opts.cwd || WORKER_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: opts.timeout || 30_000,
  });
  return opts.raw ? out : out.trim();
}

function gitError(e) {
  const err = e && e.stderr ? String(e.stderr).trim() : '';
  return err || (e && e.message) || String(e);
}

function refuse(reasons) {
  console.error(`predeploy: refusing to deploy ${NAME}. Nothing was deployed.`);
  for (const r of reasons) console.error(`  - ${r}`);
  process.exit(1);
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// The Worker's entry module, from wrangler.jsonc "main".
function entryModule() {
  const cfg = join(WORKER_DIR, 'wrangler.jsonc');
  let text;
  try {
    text = readFileSync(cfg, 'utf8');
  } catch {
    refuse([`no wrangler.jsonc in ${WORKER_DIR}; this guard reads the entry module from it.`]);
  }
  const m = /"main"\s*:\s*"([^"]+)"/.exec(text);
  if (!m) refuse(['wrangler.jsonc has no "main"; this guard reads the entry module from it.']);
  const entry = resolve(WORKER_DIR, m[1]);
  if (!isFile(entry)) refuse([`the entry module ${m[1]} (wrangler.jsonc "main") does not exist.`]);
  return entry;
}

// Every local module the bundle reaches from the entry: static imports,
// `export ... from`, side-effect imports and literal dynamic import()s with a
// relative specifier. A match inside a comment or string can only add a file
// that exists, which makes the check stricter, never looser.
const SPEC_RE = /(?:\bfrom|\bimport\s*\(|\bimport)\s*(['"])(\.{1,2}\/[^'"\r\n]*)\1/g;

function bundleModules(entry) {
  const seen = new Set();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(SPEC_RE)) {
      const spec = m[2].replace(/[?#].*$/, '');
      const base = resolve(dirname(file), spec);
      const hit = [base, base + '.js', base + '.mjs', join(base, 'index.js')].find(isFile);
      if (hit && !seen.has(hit)) todo.push(hit);
    }
  }
  return [...seen];
}

const reasons = [];

let top;
try {
  top = realpathSync.native(git(['rev-parse', '--show-toplevel']));
} catch (e) {
  refuse([`not in a git checkout (${gitError(e)}).`]);
}
const rel = (p) => relative(top, realpathSync.native(p)).split(sep).join('/');

let branch = null;
try {
  branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
} catch {
  reasons.push('HEAD is detached, not on main. Deploy from the main checkout, on main.');
}
if (branch !== null && branch !== 'main') {
  reasons.push(`on branch '${branch}', not main. Deploy from the main checkout, on main.`);
}

let fetched = true;
try {
  git(['fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], { timeout: 60_000 });
} catch (e) {
  fetched = false;
  reasons.push(`could not fetch main from origin, so main cannot be checked against origin/main: ${gitError(e)}`);
}

let head = '';
try {
  head = git(['rev-parse', 'HEAD']);
} catch (e) {
  reasons.push(`no HEAD commit (${gitError(e)}).`);
}
if (fetched && head) {
  let remote = '';
  try {
    remote = git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']);
  } catch {
    reasons.push('there is no origin/main to compare against.');
  }
  if (remote && remote !== head) {
    let ahead = -1;
    let behind = -1;
    try {
      [ahead, behind] = git(['rev-list', '--left-right', '--count', `${head}...${remote}`]).split(/\s+/).map(Number);
    } catch {}
    const at = `HEAD ${head.slice(0, 7)} is not origin/main ${remote.slice(0, 7)}`;
    if (ahead === 0 && behind > 0) {
      reasons.push(`${at}: ${behind} commit(s) behind. Run \`git pull --ff-only\` first.`);
    } else if (ahead > 0 && behind === 0) {
      reasons.push(`${at}: ${ahead} local commit(s) not on origin/main. Ship only what is merged: land them through a PR first.`);
    } else if (ahead > 0 && behind > 0) {
      reasons.push(`${at}: diverged (${ahead} local commit(s), ${behind} on origin/main only). Bring main level with origin/main first.`);
    } else {
      reasons.push(`${at}. Bring main level with origin/main first.`);
    }
  }
}

const modules = bundleModules(entryModule());
const shipped = [rel(WORKER_DIR), ...modules.map(rel).filter((p) => !p.startsWith(rel(WORKER_DIR) + '/'))];

try {
  const tracked = new Set(git(['ls-files', '-z', '--', ...modules.map(rel)], { cwd: top }).split('\0').filter(Boolean));
  const untracked = modules.map(rel).filter((p) => !tracked.has(p));
  if (untracked.length) {
    reasons.push(`the bundle imports files git does not track, so they are not on main: ${untracked.join(', ')}`);
  }
  const dirty = git(['status', '--porcelain', '--untracked-files=no', '--', ...shipped], { cwd: top, raw: true })
    .split(/\r?\n/)
    .filter(Boolean);
  if (dirty.length) {
    reasons.push(
      'uncommitted changes in files this deploy would ship (commit them through a PR, or `git restore` them):\n' +
        dirty.map((l) => `      ${l}`).join('\n'),
    );
  }
} catch (e) {
  reasons.push(`could not check for uncommitted changes: ${gitError(e)}`);
}

const retention = join(top, 'sim-retention.js');
if (!modules.map(rel).includes('sim-retention.js')) {
  reasons.push(`the bundle no longer imports sim-retention.js, so this guard cannot tell which PHYS_VER it ships. Update ${rel(fileURLToPath(import.meta.url))}.`);
}

if (reasons.length) refuse(reasons);

let physVer;
try {
  ({ PHYS_VER: physVer } = await import(pathToFileURL(retention).href));
} catch (e) {
  refuse([`could not load sim-retention.js to read PHYS_VER: ${(e && e.message) || e}`]);
}
if (!Number.isInteger(physVer)) refuse([`sim-retention.js exports no integer PHYS_VER (got ${String(physVer)}).`]);

const subject = git(['log', '-1', '--format=%s', head]);
console.log(`predeploy: ${NAME} is clear to deploy.`);
console.log(`  commit    ${head.slice(0, 7)} ${subject}`);
console.log(`  branch    main, level with origin/main`);
console.log(`  PHYS_VER  ${physVer} (sim-retention.js; boards are keyed .p${physVer})`);
console.log(`  bundles   ${modules.map(rel).join(', ')}`);
