#!/usr/bin/env node
// pnpm dev: dependencies → docker → env → migrations → API + worker + web, with prefixed logs.
// First run seeds the demo firm. Flags: --no-seed, --reseed. Ctrl-C stops everything.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO, DEV_DIR, SERVER, WEB, color, ensureDeps, ensureDocker, ensureEnv, log, migrate, portOpen, psql, run, waitFor } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const children = [];
let stopping = false;

function start(name, paint, cmd, argv, cwd, logFile) {
  const child = spawn(cmd, argv, { cwd, env: { ...process.env, FORCE_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const file = logFile ? createWriteStream(logFile, { flags: 'a' }) : null;
  const tag = paint(`${name.padEnd(6)}│`);
  let buf = '';
  const onData = (d) => {
    file?.write(d);
    buf += d;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const l of lines) process.stdout.write(`${tag} ${l}\n`);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => {
    if (!stopping) {
      log.fail(`${name} exited (${code}); stopping everything`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log(color.gray('\nstopping…'));
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {}
  }
  setTimeout(() => process.exit(code), 800);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  log.step('Preparing');
  await ensureDeps();
  const env = ensureEnv();
  await ensureDocker();
  await migrate();

  const busy = [];
  for (const [port, what] of [[4000, 'API'], [5173, 'web']]) if (await portOpen(port)) busy.push(`${what} :${port}`);
  if (busy.length) throw new Error(`already in use: ${busy.join(', ')}. Stop the other process (lsof -i :PORT) and retry.`);

  mkdirSync(DEV_DIR, { recursive: true });
  log.step('Starting');
  start('api', color.cyan, 'npm', ['run', 'dev'], SERVER);
  start('worker', color.magenta, 'npm', ['run', 'worker'], SERVER, join(DEV_DIR, 'worker.log'));
  start('web', color.green, 'npx', ['vite', '--strictPort'], WEB);

  const apiUp = await waitFor(async () => (await fetch('http://localhost:4000/health').catch(() => null))?.ok === true, { timeoutMs: 90_000 });
  if (!apiUp) throw new Error('API did not become healthy on :4000');
  await waitFor(() => portOpen(5173), { timeoutMs: 60_000 });

  const seeded = (await psql(`select 1 from users where lower(email) = '${DEMO.admin}'`)).out.trim() === '1';
  if (args.has('--reseed') || (!seeded && !args.has('--no-seed'))) {
    log.step(args.has('--reseed') ? 'Re-seeding the demo firm' : 'First run: seeding the demo firm');
    const r = await run('node', [join(import.meta.dirname, 'seed.mjs'), ...(args.has('--reseed') ? ['--reset'] : [])], { quiet: false });
    if (r.code !== 0) log.warn('seeding failed; the app is still running (see output above)');
  }

  console.log(`
${color.bold(color.green('Fixloop is running'))}
  Web       ${color.cyan(env.APP_URL ?? 'http://localhost:5173')}
  API       ${color.cyan('http://localhost:4000')}  ${color.gray('(proxied at /api)')}
  MinIO     ${color.cyan('http://localhost:9101')}  ${color.gray('minio / minio-secret')}
  Sign in   ${color.cyan(DEMO.admin)} / ${color.cyan(DEMO.password)}   ${color.gray(`(manager: ${DEMO.manager})`)}
  ${color.gray('Emails and SMS are logged by the worker. `pnpm links` lists the latest vendor/owner/tenant links.')}
  ${color.gray('Ctrl-C to stop.')}
`);
}

main().catch((e) => {
  log.fail(e.message);
  shutdown(1);
});
