const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let identityModule;
let identityLoadError;

try {
  identityModule = require('../build/lib/brand/identity.js');
} catch (error) {
  identityLoadError = error;
}

test('product identity exposes Nalira as the public product and assistant', () => {
  assert.ifError(identityLoadError);
  assert.deepEqual(identityModule.PRODUCT_IDENTITY, {
    name: 'Nalira',
    assistantName: 'Tanya Nalira',
    service: 'nalira-web',
    description: 'Ubah rekaman kuliah menjadi materi belajar yang terstruktur, dapat dicari, dan dipahami kembali.',
    legacyName: 'Notara',
  });
});

test('public site URL keeps the configured origin and removes paths', () => {
  assert.ifError(identityLoadError);
  const { resolvePublicSiteUrl } = identityModule;

  assert.equal(
    resolvePublicSiteUrl('https://nalira.example.com/path?source=test#preview'),
    'https://nalira.example.com',
  );
  assert.equal(
    resolvePublicSiteUrl('http://localhost:3001/dashboard'),
    'http://localhost:3001',
  );
});

test('public site URL falls back for malformed, unsafe, or credentialed values', () => {
  assert.ifError(identityLoadError);
  const { resolvePublicSiteUrl } = identityModule;
  const fallback = 'https://notara-hengs.vercel.app';

  assert.equal(resolvePublicSiteUrl(), fallback);
  assert.equal(resolvePublicSiteUrl('not a URL'), fallback);
  assert.equal(resolvePublicSiteUrl('javascript:alert(1)'), fallback);
  assert.equal(resolvePublicSiteUrl('https://user:secret@example.com'), fallback);
  assert.equal(resolvePublicSiteUrl('http://nalira.example.com'), fallback);
});

function collectFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];

  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(targetPath, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

test('customer-facing source no longer exposes the standalone Notara name', () => {
  const repositoryRoot = path.resolve(__dirname, '..');
  const auditedTargets = [
    path.join(repositoryRoot, 'app'),
    path.join(repositoryRoot, 'lib', 'capture'),
    path.join(repositoryRoot, 'README.md'),
  ];
  const offenders = auditedTargets
    .flatMap(collectFiles)
    .filter((filePath) => /\.(?:tsx?|md)$/.test(filePath))
    .filter((filePath) => /\bNotara\b/.test(fs.readFileSync(filePath, 'utf8')))
    .map((filePath) => path.relative(repositoryRoot, filePath));

  assert.deepEqual(
    offenders,
    [],
    `Standalone Notara copy remains in customer-facing source:\n${offenders.join('\n')}`,
  );
});
