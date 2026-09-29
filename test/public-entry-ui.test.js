const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('landing privacy language stays factual and navigation is labelled', () => {
  const source = read('app/page.tsx');

  assert.match(source, /aria-label="Navigasi utama"/);
  assert.match(source, /Enkripsi saat transit & tersimpan/);
  assert.match(source, /Yang selalu kamu kendalikan/);
  assert.match(source, /Privasi sebagai Default/);
  assert.doesNotMatch(source, /Platform Lain vs Nalira/);
  assert.doesNotMatch(source, /Enkripsi End-to-End/);
  assert.doesNotMatch(source, /Tidak seperti platform lain/);
});

test('login exposes recovery, status, and loading semantics', () => {
  const source = read('app/login/page.tsx');

  assert.match(source, /href="\/"/);
  assert.match(source, /Kembali ke beranda/);
  assert.match(source, /role="alert" aria-live="polite"/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /aria-busy=\{loading\}/);
  assert.doesNotMatch(source, /min-h-screen[^\n]*select-none/);
});
