#!/usr/bin/env node
// pnpm check: one command that prepares the machine, fixes what's safe to fix, verifies everything,
// and writes a report of what's wrong to .check/report.md.
//   --fast          skip tests, build and audit
//   --no-fix        report only, change nothing
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ROOT, SERVER, WEB, color, ensureDeps, ensureDocker, ensureEnv, has, log, migrate, run } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const fast = args.has('--fast');
const fix = !args.has('--no-fix');
const results = [];
const findings = []; // { area, severity, text }

async function stage(name, fn) {
  log.step(name);
  const started = Date.now();
  try {
    const r = (await fn()) ?? {};
    const status = r.status ?? 'pass';
    results.push({ name, status, ms: Date.now() - started, summary: r.summary ?? '' });
    (status === 'pass' ? log.ok : status === 'warn' ? log.warn : status === 'skip' ? log.info : log.fail)(r.summary ?? status);
  } catch (e) {
    results.push({ name, status: 'fail', ms: Date.now() - started, summary: String(e.message).split('\n')[0] });
    log.fail(String(e.message).split('\n').slice(0, 8).join('\n    '));
  }
}

const tail = (s, n = 25) => s.trim().split('\n').slice(-n).join('\n');
const count = (re, s) => Number(re.exec(s)?.[1] ?? 0);

function walk(dir, exts, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'migrations'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- stages

await stage('Environment', async () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`Node ${process.versions.node} is too old; need 22+`);
  const tools = { pnpm: await has('pnpm'), docker: await has('docker') };
  const missing = Object.entries(tools).filter(([, v]) => !v).map(([k]) => k);
  if (missing.includes('docker')) throw new Error('docker is not installed; install Docker Desktop or docker engine');
  return { status: missing.length ? 'warn' : 'pass', summary: `node ${process.versions.node}${missing.length ? `, missing: ${missing.join(', ')}` : ', pnpm, docker'}` };
});

await stage('Dependencies', async () => {
  await ensureDeps();
  return { summary: 'root, server and web installed' };
});

let infra = false;
await stage('Infrastructure (docker, env, migrations)', async () => {
  ensureEnv();
  await ensureDocker();
  await migrate();
  infra = true;
  return { summary: 'Postgres + MinIO up, dev database migrated' };
});

await stage('Auto-fix (safe lint fixes)', async () => {
  if (!fix) return { status: 'skip', summary: '--no-fix' };
  const targets = ['web/src', 'scripts', 'server/src', 'server/test'];
  const r = await run('npx', ['biome', 'lint', '--write', ...targets]);
  const fixed = count(/Fixed (\d+) file/, r.out);
  return { summary: `${fixed} file(s) fixed in ${targets.join(', ')}` };
});

await stage('Lint', async () => {
  const parts = [];
  let errors = 0;
  for (const [label, targets] of [
    ['web', ['web/src']],
    ['server', ['server/src', 'server/test']],
    ['scripts', ['scripts']],
  ]) {
    const r = await run('npx', ['biome', 'lint', '--max-diagnostics=200', ...targets]);
    const e = count(/Found (\d+) error/, r.out);
    const w = count(/Found (\d+) warning/, r.out);
    errors += e;
    parts.push(`${label} ${e}E/${w}W`);
    if (e || w) {
      const where = [...new Set([...r.out.matchAll(/^(\S+:\d+:\d+) (lint\/\w+\/\w+)/gm)].map((m) => `- ${m[1]} ${m[2]}`))];
      findings.push({ area: `lint:${label}`, severity: e ? 'error' : 'warn', text: `${e} errors, ${w} warnings:\n${where.slice(0, 40).join('\n')}${where.length > 40 ? `\n- …and ${where.length - 40} more (run \`pnpm lint\`)` : ''}` });
    }
  }
  return { status: errors ? 'fail' : parts.some((p) => !p.endsWith('0E/0W')) ? 'warn' : 'pass', summary: parts.join(' · ') };
});

await stage('Typecheck', async () => {
  const [s, w] = await Promise.all([run('npx', ['tsc', '--noEmit'], { cwd: SERVER }), run('npx', ['tsc', '--noEmit'], { cwd: WEB })]);
  const errs = (o) => (o.match(/error TS\d+/g) ?? []).length;
  for (const [n, r] of [['server', s], ['web', w]]) if (r.code) findings.push({ area: `types:${n}`, severity: 'error', text: tail(r.out, 15) });
  if (s.code || w.code) throw new Error(`server ${errs(s.out)} errors, web ${errs(w.out)} errors`);
  return { summary: 'server and web compile cleanly (strict)' };
});

await stage('Tests', async () => {
  if (fast) return { status: 'skip', summary: '--fast' };
  const web = await run('npx', ['vitest', 'run'], { cwd: WEB });
  const server = infra ? await run('npm', ['test'], { cwd: SERVER, timeoutMs: 20 * 60_000 }) : { code: 1, out: 'skipped: infrastructure unavailable' };
  const sum = (o) => {
    const p = count(/Tests\s+(\d+) passed/, o);
    const f = count(/(\d+) failed/, o);
    return `${p} passed${f ? `, ${f} failed` : ''}`;
  };
  if (server.code) findings.push({ area: 'tests:server', severity: 'error', text: tail(server.out, 30) });
  if (web.code) findings.push({ area: 'tests:web', severity: 'error', text: tail(web.out, 30) });
  const summary = `server ${sum(server.out)} · web ${sum(web.out)}`;
  if (server.code || web.code) throw new Error(summary);
  return { summary };
});

await stage('Build & bundle budget', async () => {
  if (fast) return { status: 'skip', summary: '--fast' };
  const r = await run('npx', ['vite', 'build'], { cwd: WEB });
  if (r.code) throw new Error(tail(r.out));
  const dir = join(WEB, 'dist/assets');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const html = readFileSync(join(WEB, 'dist/index.html'), 'utf8');
  const gz = (f) => gzipSync(readFileSync(join(dir, f))).length;
  // Initial = what index.html loads (entry + modulepreloads); everything else is lazy per route.
  const initial = files.filter((f) => html.includes(f)).reduce((s, f) => s + gz(f), 0);
  const biggest = files.map((f) => [f, gz(f)]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const BUDGET = 130 * 1024;
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  if (initial > BUDGET) findings.push({ area: 'perf:bundle', severity: 'warn', text: `Initial JS is ${kb(initial)} gzip, over the ${kb(BUDGET)} budget.` });
  return { status: initial > BUDGET ? 'warn' : 'pass', summary: `initial JS ${kb(initial)} gzip (budget ${kb(BUDGET)}); largest chunks: ${biggest.map(([f, n]) => `${f.split('-')[0]} ${kb(n)}`).join(', ')}` };
});

await stage('Security: dependency audit', async () => {
  if (fast) return { status: 'skip', summary: '--fast' };
  const parts = [];
  let bad = 0;
  for (const [n, dir] of [['server', SERVER], ['web', WEB]]) {
    const r = await run('npm', ['audit', '--omit=dev', '--json'], { cwd: dir });
    let v = {};
    try {
      v = JSON.parse(r.out).metadata?.vulnerabilities ?? {};
    } catch {
      parts.push(`${n}: audit unavailable`);
      continue;
    }
    const high = (v.high ?? 0) + (v.critical ?? 0);
    bad += high;
    parts.push(`${n}: ${v.total ?? 0} (${high} high/critical)`);
    if (v.total) findings.push({ area: `audit:${n}`, severity: high ? 'error' : 'warn', text: `${v.total} vulnerable production dependencies (${JSON.stringify(v)}). Run \`npm audit\` in ${n}/.` });
  }
  return { status: bad ? 'fail' : parts.some((p) => !p.includes(': 0 ')) ? 'warn' : 'pass', summary: parts.join(' · ') };
});

await stage('Security: secrets & config', async () => {
  const issues = [];
  const files = walk(ROOT, ['.ts', '.tsx', '.mjs', '.js', '.json', '.yml', '.yaml']).filter((f) => !f.includes('/.check/') && !f.includes('/.dev/'));
  const patterns = [
    [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
    [/sk_live_[0-9a-zA-Z]{20,}/, 'Stripe live key'],
    [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'private key'],
    [/xox[baprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  ];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const [re, what] of patterns) if (re.test(s)) issues.push(`${relative(ROOT, f)}: looks like a ${what}`);
  }
  const env = existsSync(join(SERVER, '.env')) ? readFileSync(join(SERVER, '.env'), 'utf8') : '';
  if (/^NODE_ENV=production/m.test(env) && /minio-secret|app_user:app_user/.test(env)) issues.push('server/.env: production mode with the default dev credentials');
  if (/^PASSWORD_BREACH_CHECK=false/m.test(env)) issues.push('server/.env: breached-password check is off');
  if (!existsSync(join(ROOT, '.gitignore')) || !readFileSync(join(ROOT, '.gitignore'), 'utf8').includes('.env')) issues.push('.gitignore does not exclude .env files');
  for (const i of issues) findings.push({ area: 'security', severity: 'error', text: i });
  return { status: issues.length ? 'fail' : 'pass', summary: issues.length ? `${issues.length} issue(s)` : 'no committed secrets, .env ignored, safe dev defaults' };
});

await stage('Code health', async () => {
  const src = [...walk(join(SERVER, 'src'), ['.ts']), ...walk(join(WEB, 'src'), ['.ts', '.tsx'])];
  const shortcuts = [];
  const todos = [];
  const consoles = [];
  const big = [];
  for (const f of src) {
    const lines = readFileSync(f, 'utf8').split('\n');
    const rel = relative(ROOT, f);
    lines.forEach((l, i) => {
      if (/shortcut:/.test(l)) shortcuts.push(`${rel}:${i + 1} ${l.trim().replace(/^\/\/\s*/, '')}`);
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(l)) todos.push(`${rel}:${i + 1} ${l.trim()}`);
      if (/console\.(log|debug)\(/.test(l) && !f.includes('/scripts/')) consoles.push(`${rel}:${i + 1}`);
    });
    if (lines.length > 450) big.push(`${rel} (${lines.length} lines)`);
  }
  if (shortcuts.length) findings.push({ area: 'debt', severity: 'info', text: `Known shortcuts:\n${shortcuts.map((s) => `- ${s}`).join('\n')}` });
  if (todos.length) findings.push({ area: 'debt', severity: 'warn', text: `TODO/FIXME:\n${todos.map((s) => `- ${s}`).join('\n')}` });
  if (consoles.length) findings.push({ area: 'hygiene', severity: 'warn', text: `console.log left in source:\n${consoles.map((s) => `- ${s}`).join('\n')}` });
  if (big.length) findings.push({ area: 'maintainability', severity: 'info', text: `Large files worth splitting:\n${big.map((s) => `- ${s}`).join('\n')}` });
  return { status: todos.length || consoles.length ? 'warn' : 'pass', summary: `${shortcuts.length} documented shortcuts, ${todos.length} TODOs, ${consoles.length} stray console.logs, ${big.length} files > 450 lines` };
});

// ---------------------------------------------------------------- report

const icon = { pass: color.green('PASS'), warn: color.yellow('WARN'), fail: color.red('FAIL'), skip: color.gray('SKIP') };
console.log(`\n${color.bold('Summary')}`);
for (const r of results) console.log(`  ${icon[r.status]}  ${r.name.padEnd(40)} ${color.gray(`${(r.ms / 1000).toFixed(1)}s`)}  ${r.summary}`);

mkdirSync(join(ROOT, '.check'), { recursive: true });
const md = [
  `# Check report`,
  ``,
  `Generated ${new Date().toISOString()} by \`pnpm check${[...args].map((a) => ` ${a}`).join('')}\`.`,
  ``,
  `| Stage | Result | Time | Summary |`,
  `|---|---|---|---|`,
  ...results.map((r) => `| ${r.name} | ${r.status.toUpperCase()} | ${(r.ms / 1000).toFixed(1)}s | ${r.summary.replaceAll('|', '\\|')} |`),
  ``,
  `## Findings`,
  ``,
  ...(findings.length ? findings.map((f) => `### ${f.severity.toUpperCase()} · ${f.area}\n\n${f.text.includes('\n') ? f.text : f.text}\n`) : ['None.']),
].join('\n');
writeFileSync(join(ROOT, '.check/report.md'), md);
console.log(color.gray(`\nFull report: ${relative(process.cwd(), join(ROOT, '.check/report.md'))} (${findings.length} findings)`));
process.exitCode = results.some((r) => r.status === 'fail') ? 1 : 0;
