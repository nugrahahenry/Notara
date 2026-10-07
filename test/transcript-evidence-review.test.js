const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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

// These query doubles test client behavior, not RLS. Owner/tenant authorization
// remains covered by the independent PostgreSQL rehearsal and hosted audit.
function evidenceReaderFixture(options = {}) {
  const calls = [];
  const errors = [];
  let annotationArguments = null;
  const run = {
    id: 'synthetic-run', quality_status: 'good', quality_report: {},
    segment_count: 120, transcript_character_count: 1000,
    completed_at: '2026-10-07T10:00:00.000Z',
  };
  const version = {
    id: 'synthetic-source', version: 1, source_kind: 'transcript', state: 'active',
    content_hash: null, hash_algorithm: 'sha256', duration_ms: 10000,
    segment_count: 120, transcript_character_count: 1000,
    created_at: '2026-10-07T10:00:00.000Z',
  };
  const supabase = {
    from(table) {
      assert.ok(['processing_runs', 'transcript_source_versions', 'transcript_segments'].includes(table));
      const call = { table, filters: [] };
      calls.push(call);
      return {
        select(fields, settings) { call.fields = fields; call.settings = settings; return this; },
        eq(key, value) { call.filters.push([key, value]); return this; },
        order(key, settings) { call.order = [key, JSON.parse(JSON.stringify(settings))]; return this; },
        or(value) { call.or = value; return this; },
        async maybeSingle() {
          if (table === 'processing_runs') {
            return { data: options.missingRun ? null : run, error: options.runError ?? null };
          }
          if (options.sourceThrows) throw new Error('Synthetic missing legacy source table.');
          return { data: options.sourceError ? null : version, error: options.sourceError ?? null };
        },
        async range(from, to) {
          call.range = [from, to];
          return {
            data: options.empty ? [] : [{
              id: from + 1, ordinal: from, start_ms: from * 1000, end_ms: from * 1000 + 1000,
              text: 'Synthetic transcript fixture.', average_log_probability: -0.1,
              no_speech_probability: 0.01,
            }],
            error: options.segmentError ?? null,
            count: options.empty ? 0 : 120,
          };
        },
      };
    },
  };
  const readerModule = { exports: {} };
  vm.runInNewContext(read('build/lib/transcript/evidence-reader.js'), {
    module: readerModule,
    exports: readerModule.exports,
    console: { error: (...parts) => errors.push(parts.join(' ')) },
    require(name) {
      if (name === '../supabase') return { supabase };
      if (name === './evidence') return require('../build/lib/transcript/evidence.js');
      if (name === './context-reader') {
        return {
          async readLatestTranscriptContextAnnotations(...args) {
            annotationArguments = JSON.parse(JSON.stringify(args));
            if (options.annotationsError) throw new Error('Synthetic annotation failure.');
            return new Map();
          },
        };
      }
      throw new Error(`Unexpected evidence reader import: ${name}`);
    },
  }, { filename: 'build/lib/transcript/evidence-reader.js' });
  return {
    read: readerModule.exports.readTranscriptEvidencePage, calls, errors,
    annotations: () => annotationArguments,
  };
}

const READER_ARGS = { summaryId: 'synthetic-summary', page: 1, filter: 'all' };

test('evidence reader executes summary-scoped queries and normalizes source metadata', async () => {
  const fixture = evidenceReaderFixture();
  const page = await fixture.read(READER_ARGS);
  assert.equal(page.sourceVersion.version, 1);
  assert.equal(page.sourceVersion.contentHash, null);
  assert.deepEqual(fixture.calls[0].filters, [['summary_id', READER_ARGS.summaryId]]);
  assert.deepEqual(fixture.calls[1].filters, [['processing_run_id', 'synthetic-run']]);
  assert.deepEqual(fixture.calls[2].filters, [['processing_run_id', 'synthetic-run']]);
  assert.deepEqual(fixture.annotations(), [READER_ARGS.summaryId, [1]]);
  assert.equal(page.segments[0].currentContext, null);
});

test('evidence reader executes non-overlapping ordered pages with exact counts', async () => {
  const { TRANSCRIPT_EVIDENCE_PAGE_SIZE: size } = require('../build/lib/transcript/evidence.js');
  for (const pageNumber of [1, 2]) {
    const fixture = evidenceReaderFixture();
    const page = await fixture.read({ ...READER_ARGS, page: pageNumber });
    const query = fixture.calls.find((call) => call.table === 'transcript_segments');
    assert.deepEqual(query.range, [(pageNumber - 1) * size, pageNumber * size - 1]);
    assert.deepEqual(query.order, ['ordinal', { ascending: true }]);
    assert.equal(query.settings.count, 'exact');
    assert.equal(page.total, 120);
    assert.equal(page.page, pageNumber);
  }
});

test('evidence reader executes the unclear filter and bounds ordinary pagination inputs', async () => {
  const fixture = evidenceReaderFixture();
  const page = await fixture.read({ ...READER_ARGS, filter: 'unclear', page: -1, pageSize: 150 });
  const query = fixture.calls.find((call) => call.table === 'transcript_segments');
  assert.match(query.or, /average_log_probability\.lte.*no_speech_probability\.gte/);
  assert.deepEqual(query.range, [0, 99]);
  assert.equal(page.page, 1);
  assert.equal(page.pageSize, 100);
});

test('evidence reader keeps the transcript available when legacy source metadata is absent', async () => {
  for (const options of [{ sourceError: { code: '42P01' } }, { sourceThrows: true }]) {
    const fixture = evidenceReaderFixture(options);
    const page = await fixture.read(READER_ARGS);
    assert.equal(page.sourceVersion, null);
    assert.equal(page.segments.length, 1);
    assert.equal(page.contextAvailable, true);
  }
});

test('evidence reader stops after an absent run and never fabricates source metadata', async () => {
  const fixture = evidenceReaderFixture({ missingRun: true });
  assert.equal(await fixture.read(READER_ARGS), null);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.annotations(), null);
});

test('evidence reader propagates run and segment failures and does not log raw fixture details', async () => {
  for (const [options, message] of [
    [{ runError: { message: 'Synthetic private run details.' } }, 'run-read-failed'],
    [{ segmentError: { message: 'Synthetic private segment details.' } }, 'segment-read-failed'],
  ]) {
    const fixture = evidenceReaderFixture(options);
    await assert.rejects(fixture.read(READER_ARGS), { message });
    assert.equal(fixture.annotations(), null);
    assert.deepEqual(fixture.errors, []);
  }
});

test('evidence reader exposes annotation unavailability while preserving readable segments', async () => {
  const fixture = evidenceReaderFixture({ annotationsError: true });
  const page = await fixture.read(READER_ARGS);
  assert.equal(page.contextAvailable, false);
  assert.equal(page.segments.length, 1);
  assert.deepEqual(fixture.errors, ['[transcript-context] annotations unavailable']);
});

test('evidence reader returns an empty page without an invented segment or count', async () => {
  const fixture = evidenceReaderFixture({ empty: true });
  const page = await fixture.read(READER_ARGS);
  assert.equal(page.total, 0);
  assert.equal(page.segments.length, 0);
  assert.deepEqual(fixture.annotations(), [READER_ARGS.summaryId, []]);
});
