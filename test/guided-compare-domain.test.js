const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let fingerprint;
let sourceBlocks;
let compareState;
let reducer;
let moduleLoadError;

try {
  fingerprint = require('../build/app/components/guided/compare/fingerprint.js');
  sourceBlocks = require('../build/app/components/guided/compare/source-blocks.js');
  compareState = require('../build/app/components/guided/compare/compare-state.js');
  reducer = require('../build/app/components/guided/reducer.js');
} catch (error) {
  moduleLoadError = error;
}

function assertExactBlocks(text, blocks) {
  let previousEnd = -1;
  for (const block of blocks) {
    assert.equal(text.slice(block.startOffset, block.endOffset), block.exactText);
    assert.ok(block.startOffset >= 0);
    assert.ok(block.endOffset > block.startOffset);
    assert.ok(block.startOffset >= previousEnd);
    previousEnd = block.endOffset;
  }
}

test('Compare pure modules load from the normal test build', () => {
  assert.ifError(moduleLoadError);
});

test('FNV-1a 64-bit fingerprint is deterministic over UTF-8 bytes', () => {
  assert.equal(fingerprint.fnv1a64Utf8(''), 'cbf29ce484222325');
  assert.equal(fingerprint.fnv1a64Utf8('hello'), 'a430d84680aabd0b');
  assert.equal(fingerprint.fnv1a64Utf8('Materi 😀'), fingerprint.fnv1a64Utf8('Materi 😀'));
  assert.notEqual(fingerprint.fnv1a64Utf8('Materi 😀'), fingerprint.fnv1a64Utf8('Materi 😃'));
});

test('summary segmentation preserves exact Markdown ranges and structural order', () => {
  const summary = [
    '# Permintaan',
    '',
    'Permintaan adalah hubungan antara harga dan jumlah.',
    '',
    '- Harga memengaruhi pilihan',
    '  dengan asumsi faktor lain tetap.',
    '',
    '| Harga | Jumlah |',
    '| --- | --- |',
    '| Tinggi | Rendah |',
    '',
    '> Perubahan jumlah yang diminta terjadi di sepanjang kurva.',
    '',
    '```ts',
    'const contoh = true;',
    '```',
  ].join('\r\n');
  const result = sourceBlocks.segmentCompareSurface('material-1', 'summary', summary);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.blocks.map((block) => block.kind), [
    'heading', 'paragraph', 'list-item', 'table', 'blockquote', 'code',
  ]);
  assertExactBlocks(summary, result.blocks);
  assert.equal(result.blocks[1].contextLabel, 'Permintaan');
});

test('summary segmentation fails soft on unmatched fences and distinguishes repeated text by offsets', () => {
  const summary = '## Catatan\n\nParagraf yang sama dan cukup panjang.\n\nParagraf yang sama dan cukup panjang.\n\n```\nbelum ditutup tetapi tetap dibaca.';
  const result = sourceBlocks.segmentCompareSurface('material-1', 'summary', summary);
  assert.equal(result.status, 'ready');
  assertExactBlocks(summary, result.blocks);
  const repeated = result.blocks.filter((block) => block.exactText.startsWith('Paragraf yang sama'));
  assert.equal(repeated.length, 2);
  assert.notEqual(repeated[0].id, repeated[1].id);
  assert.notEqual(repeated[0].startOffset, repeated[1].startOffset);
});

test('UTF-16 offsets, emoji, CRLF, and exact slicing remain valid', () => {
  const transcript = 'Pembuka 😀 dengan karakter non-BMP.\r\n\r\nPenjelasan kedua 😀 yang cukup panjang untuk dipilih.';
  const result = sourceBlocks.segmentCompareSurface('material-emoji', 'transcript', transcript);
  assert.equal(result.status, 'ready');
  assertExactBlocks(transcript, result.blocks);
  assert.ok(result.blocks.some((block) => block.exactText.includes('😀')));
});

test('long transcript passages split deterministically and hard-split no-whitespace input', () => {
  const sentence = 'Ini adalah kalimat panjang yang menjelaskan konsep dengan cukup rinci. ';
  const transcript = sentence.repeat(40);
  const first = sourceBlocks.segmentCompareSurface('material-long', 'transcript', transcript);
  const second = sourceBlocks.segmentCompareSurface('material-long', 'transcript', transcript);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'ready');
  assert.ok(first.blocks.length > 1);
  assert.ok(first.blocks.every((block) => block.exactText.length <= sourceBlocks.MAX_BLOCK_CODE_UNITS));
  assertExactBlocks(transcript, first.blocks);

  const noWhitespace = 'x'.repeat(sourceBlocks.MAX_BLOCK_CODE_UNITS * 2 + 55);
  const hard = sourceBlocks.segmentCompareSurface('material-hard', 'transcript', noWhitespace);
  assert.equal(hard.status, 'ready');
  assert.deepEqual(hard.blocks.map((block) => block.exactText.length), [1200, 1200, 55]);
  assertExactBlocks(noWhitespace, hard.blocks);
});

test('empty, oversized, excessive, and short sources return explicit statuses', () => {
  assert.equal(sourceBlocks.segmentCompareSurface('m', 'summary', '   ').status, 'empty');
  assert.equal(
    sourceBlocks.segmentCompareSurface('m', 'summary', 'x'.repeat(sourceBlocks.MAX_SOURCE_CODE_UNITS + 1)).status,
    'too-large',
  );
  const excessive = Array.from(
    { length: sourceBlocks.MAX_BLOCK_COUNT_PER_SURFACE + 1 },
    (_, index) => `Paragraf ${index} yang cukup panjang untuk dipilih sebagai sumber.`,
  ).join('\n\n');
  assert.equal(sourceBlocks.segmentCompareSurface('m', 'summary', excessive).status, 'too-many-blocks');
  assert.equal(sourceBlocks.segmentCompareSurface('m', 'summary', '# Pendek').status, 'no-selectable-blocks');
});

test('source bundle signature invalidates conservatively when either surface changes', () => {
  const first = sourceBlocks.createCompareSourceBundle('material-1', 'Rangkuman cukup panjang untuk dipilih.', 'Transkrip cukup panjang untuk dipilih.');
  const same = sourceBlocks.createCompareSourceBundle('material-1', 'Rangkuman cukup panjang untuk dipilih.', 'Transkrip cukup panjang untuk dipilih.');
  const changed = sourceBlocks.createCompareSourceBundle('material-1', 'Rangkuman cukup panjang untuk dipilih.', 'Transkrip berubah dan tetap cukup panjang untuk dipilih.');
  assert.equal(first.sourceSignature, same.sourceSignature);
  assert.notEqual(first.sourceSignature, changed.sourceSignature);
});

test('pair validation requires two distinct current exact blocks', () => {
  const bundle = sourceBlocks.createCompareSourceBundle(
    'material-1',
    'Paragraf rangkuman pertama yang cukup panjang.\n\nParagraf rangkuman kedua yang juga cukup panjang.',
    'Paragraf transkrip pertama yang cukup panjang.\n\nParagraf transkrip kedua yang juga cukup panjang.',
  );
  const a = bundle.summary.blocks.find((block) => block.selectable);
  const b = bundle.transcript.blocks.find((block) => block.selectable);
  assert.equal(sourceBlocks.validateComparePair(bundle, a, b).valid, true);
  assert.equal(sourceBlocks.validateComparePair(bundle, a, a).valid, false);
  const staleBundle = sourceBlocks.createCompareSourceBundle('material-1', 'Rangkuman berubah total dan cukup panjang.', bundle.transcript.text);
  assert.equal(sourceBlocks.validateComparePair(staleBundle, a, b).valid, false);
});

test('literal filtering preserves source order and exact block identity', () => {
  const bundle = sourceBlocks.createCompareSourceBundle(
    'material-filter',
    '# Elastisitas\n\nPermintaan elastis memiliki respons besar.\n\nPermintaan inelastis memiliki respons kecil.',
    'Transkrip cukup panjang untuk dipilih sebagai sumber.',
  );
  const filtered = sourceBlocks.filterCompareBlocks(bundle.summary.blocks, 'ELASTIS');
  assert.deepEqual(filtered.map((block) => block.id), bundle.summary.blocks
    .filter((block) => `${block.contextLabel || ''}\n${block.exactText}`.toLowerCase().includes('elastis'))
    .map((block) => block.id));
});

test('Compare reducer owns one transient draft and resets it at lifecycle boundaries', () => {
  const bundle = sourceBlocks.createCompareSourceBundle(
    'material-1',
    'Paragraf rangkuman pertama yang cukup panjang.\n\nParagraf rangkuman kedua yang juga cukup panjang.',
    'Paragraf transkrip pertama yang cukup panjang.\n\nParagraf transkrip kedua yang juga cukup panjang.',
  );
  const a = bundle.summary.blocks.find((block) => block.selectable);
  const b = bundle.transcript.blocks.find((block) => block.selectable);
  let state = reducer.createGuidedFoundationState('material-1');
  state = reducer.guidedFoundationReducer(state, { type: 'SOURCE_SIGNATURE_CHANGED', sourceSignature: bundle.sourceSignature });
  state = reducer.guidedFoundationReducer(state, { type: 'SET_OBJECTIVE', objective: { kind: 'compare-concepts' } });
  state = reducer.guidedFoundationReducer(state, { type: 'OPEN_ROUTE' });
  state = reducer.guidedFoundationReducer(state, { type: 'START_SESSION' });
  state = reducer.guidedFoundationReducer(state, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'a', block: a, sourceSignature: bundle.sourceSignature,
  });
  state = reducer.guidedFoundationReducer(state, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'b', block: b, sourceSignature: bundle.sourceSignature,
  });
  state = reducer.guidedFoundationReducer(state, {
    type: 'SET_COMPARE_NOTE', field: 'differences', value: 'Catatan pengguna', sourceSignature: bundle.sourceSignature,
  });
  const withDraft = state.compare;
  state = reducer.guidedFoundationReducer(state, { type: 'GO_TO_NODE', index: 3 });
  assert.deepEqual(state.compare, withDraft);
  state = reducer.guidedFoundationReducer(state, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'a', block: bundle.summary.blocks[1], sourceSignature: bundle.sourceSignature,
  });
  assert.equal(state.compare.notes.differences, '');
  assert.equal(state.compare.b.id, b.id);
  state = reducer.guidedFoundationReducer(state, { type: 'SET_OBJECTIVE', objective: { kind: 'understand-core' } });
  assert.equal(state.compare.a, null);
  assert.equal(state.compare.b, null);
  assert.equal(state.compare.sourceSignature, bundle.sourceSignature);
  state = reducer.guidedFoundationReducer(state, { type: 'EXIT' });
  assert.equal(state.compare.sourceSignature, '');
});

test('stale signature and duplicate-slot events are rejected by the reducer', () => {
  const bundle = sourceBlocks.createCompareSourceBundle(
    'material-1',
    'Paragraf rangkuman pertama yang cukup panjang.\n\nParagraf rangkuman kedua yang juga cukup panjang.',
    'Transkrip yang cukup panjang untuk dipilih sebagai sumber.',
  );
  const block = bundle.summary.blocks.find((item) => item.selectable);
  let state = reducer.createGuidedFoundationState('material-1');
  state = reducer.guidedFoundationReducer(state, { type: 'SOURCE_SIGNATURE_CHANGED', sourceSignature: bundle.sourceSignature });
  const stale = reducer.guidedFoundationReducer(state, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'a', block, sourceSignature: 'stale',
  });
  assert.deepEqual(stale.compare, state.compare);
  state = reducer.guidedFoundationReducer(state, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'a', block, sourceSignature: bundle.sourceSignature,
  });
  const duplicate = reducer.guidedFoundationReducer(state, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'b', block, sourceSignature: bundle.sourceSignature,
  });
  assert.equal(duplicate.compare.b, null);
});

test('Compare pure domain has no network, storage, router, provider, or DOM dependency', () => {
  const directory = path.join(root, 'app/components/guided/compare');
  const source = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|supabase|useRouter|window\.|document\.|Date\.now|Math\.random/);
});

test('confirmed source replacement clears notes before the inline selector chooses a new block', () => {
  const bundle = sourceBlocks.createCompareSourceBundle(
    'material-confirm',
    'Bagian rangkuman pertama yang cukup panjang untuk dipilih.\n\nBagian rangkuman kedua yang cukup panjang untuk dipilih.',
    'Bagian transkrip pertama yang cukup panjang untuk dipilih.\n\nBagian transkrip kedua yang cukup panjang untuk dipilih.',
  );
  const a = bundle.summary.blocks.find((block) => block.selectable);
  const replacement = bundle.summary.blocks.find((block) => block.selectable && block.id !== a.id);
  const b = bundle.transcript.blocks.find((block) => block.selectable);
  let draft = compareState.createCompareDraft('material-confirm', bundle.sourceSignature);
  draft = compareState.compareDraftReducer(draft, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'a', block: a, sourceSignature: bundle.sourceSignature,
  });
  draft = compareState.compareDraftReducer(draft, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'b', block: b, sourceSignature: bundle.sourceSignature,
  });
  draft = compareState.compareDraftReducer(draft, {
    type: 'SET_COMPARE_NOTE', field: 'similarities', value: 'Catatan lama', sourceSignature: bundle.sourceSignature,
  });

  draft = compareState.compareDraftReducer(draft, {
    type: 'CONFIRM_COMPARE_SOURCE_REPLACEMENT',
    slot: 'a',
    replacement: a,
    sourceSignature: bundle.sourceSignature,
  });
  assert.equal(draft.a.id, a.id);
  assert.equal(draft.b.id, b.id);
  assert.deepEqual(draft.notes, compareState.EMPTY_COMPARE_NOTES);

  draft = compareState.compareDraftReducer(draft, {
    type: 'SELECT_COMPARE_BLOCK', slot: 'a', block: replacement, sourceSignature: bundle.sourceSignature,
  });
  assert.equal(draft.a.id, replacement.id);
  assert.equal(draft.b.id, b.id);
});

