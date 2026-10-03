const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('evidence reader normalizes private persisted rows defensively', () => {
  const {
    normalizeTranscriptEvidenceRun,
    normalizeTranscriptEvidenceSegment,
    normalizeTranscriptSourceVersion,
  } = require('../build/lib/transcript/evidence.js');

  const run = normalizeTranscriptEvidenceRun({
    id: 'run-1',
    quality_status: 'poor',
    quality_report: {
      durationSec: 805.86,
      wordCount: 987,
      wordsPerMinute: 73.5,
      warnings: [{
        code: 'provider-low-confidence',
        severity: 'critical',
        message: ' Banyak segmen perlu ditinjau. ',
      }],
    },
    segment_count: 234,
    transcript_character_count: 6090,
    completed_at: '2026-08-20T10:00:00.000Z',
  });

  assert.equal(run.qualityStatus, 'poor');
  assert.equal(run.qualityReport.warnings[0].message, 'Banyak segmen perlu ditinjau.');

  const segment = normalizeTranscriptEvidenceSegment({
    id: 7,
    ordinal: 6,
    start_ms: 61_000,
    end_ms: 65_500,
    text: '  Metodologi penelitian  ',
    average_log_probability: -0.51,
    no_speech_probability: 0.61,
  });

  assert.equal(segment.text, 'Metodologi penelitian');
  assert.deepEqual(segment.reviewReasons, ['low-confidence', 'high-no-speech']);

  const sourceVersion = normalizeTranscriptSourceVersion({
    id: 'source-1',
    version: 1,
    source_kind: 'transcript',
    state: 'active',
    content_hash: 'A'.repeat(64),
    hash_algorithm: 'sha256',
    duration_ms: 805860,
    segment_count: 234,
    transcript_character_count: 6090,
    created_at: '2026-08-20T10:00:00.000Z',
  });

  assert.equal(sourceVersion.contentHash, 'a'.repeat(64));
  assert.equal(sourceVersion.version, 1);
});

test('timecodes remain readable for short and long lectures', () => {
  const { formatTranscriptTimecode } = require('../build/lib/transcript/evidence.js');

  assert.equal(formatTranscriptTimecode(65_900), '1:05');
  assert.equal(formatTranscriptTimecode(3_725_000), '1:02:05');
  assert.equal(formatTranscriptTimecode(-100), '0:00');
});

test('reader contract paginates deterministically and filters unclear evidence server-side', () => {
  const source = read('lib/transcript/evidence-reader.ts');

  assert.match(source, /\.eq\('summary_id', summaryId\)/);
  assert.match(source, /\.eq\('processing_run_id', run\.id\)/);
  assert.match(source, /\.order\('ordinal', \{ ascending: true \}\)/);
  assert.match(source, /\.or\([\s\S]*average_log_probability\.lte[\s\S]*no_speech_probability\.gte/);
  assert.match(source, /\.range\(from, to\)/);
  assert.match(source, /\{ count: 'exact' \}/);
  assert.match(source, /from\('transcript_source_versions'\)/);
  assert.match(source, /normalizeTranscriptSourceVersion/);
  assert.doesNotMatch(source, /service_role|audio|speaker/i);
});

test('Study Canvas exposes evidence only for a durable owner summary', () => {
  const dashboard = read('app/dashboard/page.tsx');
  const review = read('app/components/transcript/TranscriptEvidenceReview.tsx');

  assert.match(dashboard, /<TranscriptEvidenceReview/);
  assert.match(dashboard, /selectedSummary\.user_id === user\.id/);
  assert.match(dashboard, /!selectedSummary\.id\.startsWith\('local-'\)/);
  assert.match(review, /readTranscriptEvidencePage/);
  assert.match(review, /Bagian kurang jelas/);
  assert.match(review, /Audio tidak disimpan/);
  assert.match(review, /const evidenceBusy = state\.status === 'loading'/);
  assert.match(review, /aria-busy=\{evidenceBusy\}/);
  assert.match(review, /aria-label="Tampilkan semua bagian"/);
  assert.match(review, /Menampilkan \{pageRange\.from\}–\{pageRange\.to\}/);
  assert.match(review, /Halaman \{data\.page\} dari \{totalPages\}/);
  assert.match(review, /Versi sumber \{data\.sourceVersion\.version\}/);
  assert.doesNotMatch(review, /dosen|mahasiswa|speaker|playAudio|seek/i);
});
