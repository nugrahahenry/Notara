const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');
const proxyPath = path.join(projectRoot, 'proxy.ts');
const middlewarePath = path.join(projectRoot, 'middleware.ts');
const nextConfigPath = path.join(projectRoot, 'next.config.ts');
const eslintConfigPath = path.join(projectRoot, 'eslint.config.mjs');

function inspectNextConfig(label) {
  const configUrl = pathToFileURL(nextConfigPath);
  configUrl.searchParams.set('test', `${label}-${Date.now()}`);
  const script = `
    const { default: config } = await import(${JSON.stringify(configUrl.href)});
    process.stdout.write(JSON.stringify({
      root: config.turbopack?.root ?? null,
      tls: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
    }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--input-type=module', '--eval', script],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NODE_TLS_REJECT_UNAUTHORIZED: '1',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('Next.js 16 auth boundary uses the proxy file convention', () => {
  assert.equal(fs.existsSync(proxyPath), true, 'proxy.ts must exist');
  assert.equal(fs.existsSync(middlewarePath), false, 'deprecated middleware.ts must be removed');

  const source = fs.readFileSync(proxyPath, 'utf8');
  assert.match(source, /export async function proxy\(request: NextRequest\)/);
  assert.match(source, /buildOAuthRecoveryUrl\(request\.nextUrl\)/);
  assert.match(source, /isPublicOperationalRoute\(request\.nextUrl\.pathname\)/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
});

test('Turbopack is pinned to the Nalira project root', () => {
  const config = inspectNextConfig('root');

  assert.equal(path.isAbsolute(config.root ?? ''), true);
  assert.equal(path.resolve(config.root), projectRoot);
});

test('loading Next config does not disable TLS certificate verification', () => {
  const config = inspectNextConfig('tls');
  assert.equal(config.tls, '1');
});

test('ESLint excludes private QA artifacts from the application source', () => {
  const source = fs.readFileSync(eslintConfigPath, 'utf8');
  assert.match(source, /["']\.private\/\*\*["']/);
});

test('ESLint treats the CommonJS test harness as Node test code', () => {
  const source = fs.readFileSync(eslintConfigPath, 'utf8');
  assert.match(source, /files:\s*\[["']test\/\*\*\/\*\.js["']\]/);
  assert.match(source, /["']@typescript-eslint\/no-require-imports["']:\s*["']off["']/);
});
