const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compiledPath = path.resolve(__dirname, '../build/lib/chat/context.js');

function loadContext() {
  assert.equal(fs.existsSync(compiledPath), true, 'lib/chat/context.ts must compile into the test build');
  return require(compiledPath);
}

const folders = [
  { id: 'ai', name: 'Kecerdasan Buatan', icon: '🧠', color: '#7c3aed', created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'method', name: 'Metodologi Penelitian', icon: '📚', color: '#0ea5e9', created_at: '2026-01-02T00:00:00.000Z' },
];

const summaries = [
  {
    id: 'ai-2', folder_id: 'ai', title: 'Neural Network', transcript: 'Neural network memakai neuron dan fungsi aktivasi untuk mengenali pola.', summary: '', created_at: '2026-09-29T00:00:00.000Z', file_name: null, duration_sec: null, word_count: 10,
  },
  {
    id: 'method-1', folder_id: 'method', title: 'Pengumpulan Data', transcript: 'Wawancara dan observasi dipakai untuk mengumpulkan data penelitian.', summary: '', created_at: '2026-09-28T00:00:00.000Z', file_name: null, duration_sec: null, word_count: 10,
  },
  {
    id: 'noise', folder_id: null, title: 'Catatan Umum', transcript: 'Neural network juga disebut saat pembahasan singkat.', summary: '', created_at: '2026-09-27T00:00:00.000Z', file_name: null, duration_sec: null, word_count: 8,
  },
];

test('global chat context is deterministic and prioritizes direct matches', () => {
  const { buildGlobalChatContext } = loadContext();
  const first = buildGlobalChatContext({ folders, summaries, question: 'Jelaskan neural network', maxTotalTranscriptChars: 500 });
  const second = buildGlobalChatContext({ folders, summaries, question: 'Jelaskan neural network', maxTotalTranscriptChars: 500 });

  assert.equal(first, second);
  assert.ok(first.indexOf('[Dokumen: Neural Network') < first.indexOf('[Dokumen: Catatan Umum'));
});

test('global chat context bounds transcript payload and avoids unrelated transcript leakage', () => {
  const { buildGlobalChatContext } = loadContext();
  const context = buildGlobalChatContext({ folders, summaries, question: 'jadwal ujian semester', maxTotalTranscriptChars: 100 });

  assert.match(context, /Daftar Struktur Berkas Mahasiswa/);
  assert.match(context, /Tidak ada berkas yang relevan/);
  assert.doesNotMatch(context, /Neural network memakai/);
  assert.ok(context.length < 1_000);
});
