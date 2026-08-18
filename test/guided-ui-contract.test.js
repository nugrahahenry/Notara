const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Guided domain modules have no service, router, or persistence dependency', () => {
  const source = [
    'types.ts',
    'eligibility.ts',
    'objective.ts',
    'route-builder.ts',
    'reducer.ts',
  ].map((file) => read(`app/components/guided/${file}`)).join('\n');
  assert.doesNotMatch(source, /supabase|fetch\s*\(|localStorage|sessionStorage|indexedDB|useRouter|next\/navigation|window\.history/i);
});

test('Material Review owns one compact non-sticky Guided entry and removes the old Learning Lab placeholder', () => {
  const workspace = read('app/components/study-guide/StudyGuideWorkspace.tsx');
  const canvas = read('app/components/workspace/StudyCanvasBoundary.tsx');
  const css = read('app/globals.css');
  assert.match(workspace, /GuidedEntryCard/);
  assert.match(workspace, /headerExtension=/);
  assert.match(css, /\.notara-guided-entry\s*\{[^}]*position:\s*static/s);
  assert.doesNotMatch(canvas, /Learning Lab|notara-learning-lab|labTools|labCopy/);
  assert.doesNotMatch(css, /\.notara-learning-lab|\.notara-lab-/);
});

test('Study Guide controller discards the Guided draft when material identity changes', () => {
  const workspace = read('app/components/study-guide/StudyGuideWorkspace.tsx');
  assert.match(workspace, /previousMaterialRef/);
  assert.match(workspace, /previousMaterialRef\.current === material\.id/);
  assert.match(workspace, /RESET_SOURCE', materialId: material\.id/);
});


test('Study Guide resets on auth changes and never renders a stale or ineligible Guided draft', () => {
  const workspace = read('app/components/study-guide/StudyGuideWorkspace.tsx');
  const dashboard = read('app/dashboard/page.tsx');
  assert.match(workspace, /previousAuthRef/);
  assert.match(workspace, /previousAuthRef\.current === viewerUserId/);
  assert.match(workspace, /RESET_SOURCE', materialId: material\.id/);
  assert.match(workspace, /guidedState\.materialId === material\.id/);
  assert.match(workspace, /eligibility\.status === 'eligible-owned'/);
  assert.match(workspace, /if \(!guidedCanRender\)/);
  assert.match(dashboard, /selectedSummary\.id\.startsWith\('local-'\)\s*\|\|\s*summaries\.some/);
});

test('Guided session avoids a nested main landmark and returns truthfully to Material Review', () => {
  const source = read('app/components/guided/GuidedFoundationWorkspace.tsx');
  assert.doesNotMatch(source, /<main\b|<\/main>/);
  assert.match(source, /Kembali ke materi/);
  assert.match(source, /Langkah \{activeNodeIndex \+ 1\} dari \{route\.nodes\.length\}/);
});

test('Guided UI tells the truth about one source, volatile state, Tutor scope, and self-check', () => {
  const source = [
    read('app/components/guided/GuidedFoundationWorkspace.tsx'),
    read('app/components/study-guide/StudyGuideWorkspace.tsx'),
  ].join('\n');
  assert.match(source, /Rute ini memakai satu materi aktif/);
  assert.match(source, /Draft belum disimpan/);
  assert.match(source, /Jawaban memakai transkrip materi aktif dan dapat dilengkapi pengetahuan umum/);
  assert.match(source, /Sitasi bagian sumber belum tersedia/);
  assert.doesNotMatch(source, /\b\d+%\b|skor kamu|mastery|streak|sertifikat|selesai belajar/i);
});

test('Guided remains inside the material URL and does not add a router owner', () => {
  const guidedSource = fs.readdirSync(path.join(root, 'app/components/guided'))
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => read(`app/components/guided/${name}`))
    .join('\n');
  const dashboard = read('app/dashboard/page.tsx');
  assert.doesNotMatch(guidedSource, /useRouter|router\.|history\.push|URLSearchParams|guided=/);
  assert.equal((dashboard.match(/fetch\(['"]\/api\/chat/g) || []).length, 1);
  assert.equal((dashboard.match(/const \[chatMessages,/g) || []).length, 1);
});

test('Guided mobile layout stacks without fixed overlays and keeps the Tutor in flow', () => {
  const css = read('app/globals.css');
  const guidedStart = css.indexOf('/* ── Guided Foundation');
  const guidedCss = guidedStart >= 0 ? css.slice(guidedStart) : '';
  assert.ok(guidedCss.length > 0, 'Guided stylesheet section must exist');
  assert.doesNotMatch(guidedCss, /position:\s*fixed/);
  assert.match(guidedCss, /@media \(max-width:\s*767px\)/);
  assert.match(guidedCss, /\.notara-guided-session-layout\s*\{[^}]*padding:\s*16px/s);
  assert.match(guidedCss, /\.notara-guided-rail\s*\{[^}]*display:\s*grid/s);
});

