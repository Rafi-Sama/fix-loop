// Shared helpers for the dev/check/seed scripts. Node built-ins only, so they run before any install.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SERVER = join(ROOT, 'server');
export const WEB = join(ROOT, 'web');
export const DEV_DIR = join(ROOT, '.dev');

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const color = { dim: c(2), bold: c(1), red: c(31), green: c(32), yellow: c(33), blue: c(34), magenta: c(35), cyan: c(36), gray: c(90) };

export const log = {
  step: (s) => console.log(`\n${color.bold(color.blue('▸'))} ${color.bold(s)}`),
  ok: (s) => console.log(`  ${color.green('✓')} ${s}`),
  warn: (s) => console.log(`  ${color.yellow('!')} ${s}`),
  fail: (s) => console.log(`  ${color.red('✗')} ${s}`),
  info: (s) => console.log(`  ${color.gray('·')} ${color.gray(s)}`),
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC byte is the point (ANSI colour codes).
export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** Run a command, capture output; never throws. `quiet` hides streaming output. */
export function run(cmd, args, { cwd = ROOT, env, quiet = true, timeoutMs = 15 * 60_000 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (d) => {
      out += d;
      if (!quiet) process.stdout.write(d);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 127, out: String(e.message), ms: Date.now() - started });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out: stripAnsi(out), ms: Date.now() - started });
    });
  });
}

export const has = async (cmd) => (await run('sh', ['-c', `command -v ${cmd}`])).code === 0;

/** True when something listens on the port over IPv4 or IPv6 (Vite binds ::1 only on some machines). */
export async function portOpen(port) {
  return (await Promise.all(['127.0.0.1', '::1'].map((h) => portOpenOn(port, h)))).some(Boolean);
}

function portOpenOn(port, host) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(800, () => { s.destroy(); resolve(false); });
  });
}

export async function waitFor(check, { timeoutMs = 60_000, everyMs = 500 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

/** Each package keeps its own package manager (lockfile decides). Installs only when node_modules is missing or stale. */
export function packageManager(dir) {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return { cmd: 'pnpm', install: ['install', '--frozen-lockfile'] };
  if (existsSync(join(dir, 'package-lock.json'))) return { cmd: 'npm', install: ['ci', '--no-audit', '--no-fund'] };
  return { cmd: 'npm', install: ['install', '--no-audit', '--no-fund'] };
}

export function needsInstall(dir) {
  const marker = ['node_modules/.package-lock.json', 'node_modules/.modules.yaml'].map((f) => join(dir, f)).find(existsSync);
  if (!marker) return 'node_modules missing';
  const lock = ['package-lock.json', 'pnpm-lock.yaml'].map((f) => join(dir, f)).find(existsSync);
  const pkg = join(dir, 'package.json');
  const newest = Math.max(statSync(pkg).mtimeMs, lock ? statSync(lock).mtimeMs : 0);
  return newest > statSync(marker).mtimeMs + 1000 ? 'package.json or lockfile changed' : null;
}

export async function ensureDeps(dirs = [ROOT, SERVER, WEB]) {
  for (const dir of dirs) {
    const why = needsInstall(dir);
    const name = dir === ROOT ? 'root' : dir.split('/').at(-1);
    if (!why) {
      log.ok(`${name}: dependencies up to date`);
      continue;
    }
    const pm = packageManager(dir);
    log.info(`${name}: ${why}, running ${pm.cmd} ${pm.install.join(' ')}`);
    const r = await run(pm.cmd, pm.install, { cwd: dir });
    if (r.code !== 0) throw new Error(`${name} install failed:\n${r.out.slice(-2000)}`);
    log.ok(`${name}: installed (${(r.ms / 1000).toFixed(1)}s)`);
  }
}

export function ensureEnv() {
  const env = join(SERVER, '.env');
  if (!existsSync(env)) {
    copyFileSync(join(SERVER, '.env.example'), env);
    log.ok('server/.env created from .env.example');
  } else log.ok('server/.env present');
  return Object.fromEntries(
    readFileSync(env, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

/** docker compose up -d and wait until Postgres accepts connections and MinIO answers. */
export async function ensureDocker() {
  if (!(await has('docker'))) throw new Error('docker is not installed');
  if ((await run('docker', ['info'])).code !== 0) throw new Error('the docker daemon is not running (start Docker and retry)');
  const up = await run('docker', ['compose', 'up', '-d', '--wait'], { cwd: SERVER, timeoutMs: 5 * 60_000 });
  if (up.code !== 0) {
    // Older compose without --wait, or minio has no healthcheck: fall back to polling.
    const plain = await run('docker', ['compose', 'up', '-d'], { cwd: SERVER, timeoutMs: 5 * 60_000 });
    if (plain.code !== 0) throw new Error(`docker compose up failed:\n${plain.out.slice(-1500)}`);
  }
  const pg = await waitFor(async () => (await run('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'owner', '-d', 'fixloop'], { cwd: SERVER })).code === 0);
  if (!pg) throw new Error('Postgres did not become ready on :5433');
  const minio = await waitFor(() => portOpen(9100));
  if (!minio) throw new Error('MinIO did not open :9100');
  log.ok('docker: Postgres :5433 and MinIO :9100 ready');
}

export const psql = (sql, db = 'fixloop') => run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'owner', '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { cwd: SERVER });

export async function migrate() {
  const r = await run('npm', ['run', 'db:migrate'], { cwd: SERVER });
  if (r.code !== 0) throw new Error(`migrations failed:\n${r.out.slice(-1500)}`);
  log.ok('database migrated');
}

export const DEMO = {
  password: 'Fixloop-demo-2026!',
  admin: 'admin@greenvalley.test',
  manager: 'manager@greenvalley.test',
  deactivated: 'former@greenvalley.test',
  invited: 'invited@greenvalley.test',
};

/** Every firm-scoped table cascades from organizations (migration 0003), so one delete removes the firm. */
export const deleteOrg = (orgId) => psql(`delete from organizations where id = '${orgId}';`);

