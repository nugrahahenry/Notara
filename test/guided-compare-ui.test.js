const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function allCompareSource() {
  const directory = path.join(root, 'app/components/guided/compare');
  if (!fs.existsSync(directory)) return '';
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => read(`app/components/guided/compare/${name}`))
    .join('\n');
}

function allCompareUiSource() {
  const directory = path.join(root, 'app/components/guided/compare');
  if (!fs.existsSync(directory)) return '';
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => read(`app/components/guided/compare/${name}`))
    .join('\n');
}

test('Compare is contextual to compare-concepts and Connect and replaces the generic response', () => {
  const workspace = read('app/components/guided/GuidedFoundationWorkspace.tsx');
  assert.match(workspace, /objective\?\.kind === 'compare-concepts'/);
  assert.match(workspace, /activeNode\.kind === 'connect'/);
  assert.match(workspace, /<CompareWorkspace/);
  assert.match(workspace, /showDeterministicCompare[\s\S]*\?\s*\([\s\S]*<CompareWorkspace[\s\S]*\)\s*:\s*\(/);
});

test('Compare promise, authorship, and volatile lifecycle copy are explicit', () => {
  const source = allCompareUiSource();
  assert.match(source, /Bandingkan dua bagian/);
  assert.match(source, /Pilih dua bagian dari materi aktif/);
  assert.match(source, /Catatanmu/);
  assert.match(source, /Ditulis olehmu/);
  assert.match(source, /belum disimpan/);
  assert.match(source, /halaman dimuat ulang/);
  assert.doesNotMatch(source, /dibuat oleh AI|hasil analisis|kesimpulan Nalira|skor|mastery|citation|timestamp/i);
});

test('source browser is inline and exposes tabs, literal filter, batches, and exact source cards', () => {
  const source = allCompareSource();
  assert.match(source, /Pilih Bagian \{slotLabel\}/);
  assert.match(source, /Rangkuman/);
  assert.match(source, /Transkrip/);
  assert.match(source, /Cari kata dalam materi/);
  assert.match(source, /Tampilkan lebih banyak/);
  assert.match(source, /exactText/);
  assert.doesNotMatch(source, /createPortal|role="dialog"|aria-modal|backdrop|position:\s*fixed/);
});

test('source replacement uses inline confirmation and clears notes truthfully', () => {
  const source = allCompareSource();
  assert.match(source, /Mengganti bagian akan menghapus catatan/);
  assert.match(source, /Batal/);
  assert.match(source, /Ganti dan hapus catatan/);
  assert.match(source, /Catatan dihapus karena pasangan sumber berubah/);
});

test('keyboard and focus contracts include Escape, selector focus, and opener return', () => {
  const source = allCompareSource();
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /selectorHeadingRef/);
  assert.match(source, /focus\(\)/);
  assert.match(source, /requestAnimationFrame/);
});

test('Compare adds no route, storage, network, Tutor, or second controller owner', () => {
  const source = allCompareSource();
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|fetch\s*\(|supabase|useRouter|router\.|URLSearchParams|\/api\/chat/);
  const dashboard = read('app/dashboard/page.tsx');
  assert.equal((dashboard.match(/fetch\(['"]\/api\/chat/g) || []).length, 1);
  assert.equal((dashboard.match(/const \[chatMessages,/g) || []).length, 1);
  assert.equal((dashboard.match(/const \[selectedSummary,/g) || []).length, 1);
});

test('Compare CSS stacks on narrow screens and owns no fixed or sticky surface', () => {
  const css = read('app/globals.css');
  const start = css.indexOf('/* ── Deterministic Compare V1');
  assert.ok(start >= 0, 'Compare CSS section must exist');
  const compareCss = css.slice(start);
  assert.match(compareCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(compareCss, /@media \(max-width:\s*767px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(compareCss, /position:\s*(fixed|sticky)/);
  assert.match(compareCss, /min-height:\s*44px/);
  assert.match(compareCss, /notara-compare-source-browser > header \.notara-icon-button[\s\S]*flex:\s*0 0 44px/);
  assert.match(compareCss, /overflow-wrap:\s*anywhere/);
});

test('normal test runner includes Compare domain and UI contracts', () => {
  const runner = read('test/run.js');
  assert.match(runner, /test\/guided-compare-domain\.test\.js/);
  assert.match(runner, /test\/guided-compare-ui\.test\.js/);
});

test('Compare uses one polite live region and explicit accessible source actions', () => {
  const source = allCompareUiSource();
  assert.equal((source.match(/role="status"/g) || []).length, 1);
  assert.equal((source.match(/aria-live="polite"/g) || []).length, 1);
  assert.match(source, /Pilih Bagian \$\{slotLabel\} dari materi aktif/);
  assert.match(source, /Ganti Bagian \$\{slotLabel\}, saat ini/);
  assert.match(source, /Tampilkan \$\{Math\.min\(RENDER_BLOCK_BATCH/);
  assert.doesNotMatch(source, /kutipan exact/);
});

test('source invalidation clears transient UI and moves focus to the Compare heading', () => {
  const workspace = read('app/components/guided/compare/CompareWorkspace.tsx');
  const guided = read('app/components/guided/GuidedFoundationWorkspace.tsx');
  assert.match(workspace, /sourceChanged[\s\S]*headingRef\.current\?\.focus\(\)/);
  assert.match(workspace, /Materi berubah\. Pilihan dan catatan perbandingan telah dihapus\./);
  assert.match(guided, /effectiveCompareDraft[\s\S]*createCompareDraft\(state\.materialId, compareBundle\.sourceSignature\)/);
  assert.match(guided, /SOURCE_SIGNATURE_CHANGED/);
});

test('warning styling remains scoped to Compare', () => {
  const source = allCompareUiSource();
  const css = read('app/globals.css');
  assert.match(source, /notara-compare-warning-button/);
  assert.match(css, /\.notara-compare-warning-button/);
  assert.doesNotMatch(css, /\.notara-warning-button/);
});

