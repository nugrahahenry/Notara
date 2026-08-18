const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function findTranscriptEvidenceMigration() {
  const migrationDir = path.join(projectRoot, 'supabase', 'migrations');
  const migrationName = fs.readdirSync(migrationDir)
    .filter((name) => name.endsWith('_persist_transcript_evidence.sql'))
    .sort()
    .at(-1);

  assert.ok(migrationName, 'versioned transcript evidence migration must exist');
  return read(path.join('supabase', 'migrations', migrationName));
}

test('transcript evidence payload is bounded, normalized, and speaker-neutral', () => {
  const {
    buildTranscriptEvidenceRpcPayload,
    offsetTranscriptSegments,
  } = require('../build/lib/transcript/persistence.js');

  const segments = offsetTranscriptSegments([
    {
      id: 'segment-1',
      startMs: 120,
      endMs: 980,
      text: '  Konsep dasar sistem informasi.  ',
      speakerKey: 'provider-guess',
      speakerRole: 'lecturer',
      averageLogProbability: -0.21,
      noSpeechProbability: 0.04,
    },
  ], 120_000, 'part-2');

  assert.deepEqual(segments, [{
    id: 'part-2-1',
    startMs: 120_120,
    endMs: 120_980,
    text: 'Konsep dasar sistem informasi.',
    speakerKey: null,
    speakerRole: 'unknown',
    averageLogProbability: -0.21,
    noSpeechProbability: 0.04,
  }]);

  const payload = buildTranscriptEvidenceRpcPayload({
    summaryId: '8eb7b37f-f349-4bb0-888f-72e37f06187d',
    clientRequestId: 'capture-request-1',
    provider: 'groq',
    transcriptionModel: 'whisper-large-v3',
    summaryModel: 'openai/gpt-oss-120b',
    quality: {
      status: 'good',
      durationSec: 121,
      wordCount: 5,
      wordsPerMinute: 2.5,
      segmentCount: 99,
      lowConfidenceSegmentRatio: 0,
      highNoSpeechSegmentRatio: 0,
      repeatedFillerRatio: 0,
      warnings: [],
    },
    segments,
  });

  assert.equal(payload.p_summary_id, '8eb7b37f-f349-4bb0-888f-72e37f06187d');
  assert.equal(payload.p_client_request_id, 'capture-request-1');
  assert.equal(payload.p_provider, 'groq');
  assert.equal(payload.p_quality.segmentCount, 1);
  assert.deepEqual(payload.p_segments, [{
    start_ms: 120_120,
    end_ms: 120_980,
    text: 'Konsep dasar sistem informasi.',
    average_log_probability: -0.21,
    no_speech_probability: 0.04,
  }]);
  assert.equal(JSON.stringify(payload).includes('provider-guess'), false);
  assert.equal(JSON.stringify(payload).includes('lecturer'), false);
});

test('transcript evidence payload rejects malformed or oversized evidence', () => {
  const {
    buildTranscriptEvidenceRpcPayload,
    MAX_TRANSCRIPT_EVIDENCE_SEGMENTS,
  } = require('../build/lib/transcript/persistence.js');

  const base = {
    summaryId: '8eb7b37f-f349-4bb0-888f-72e37f06187d',
    clientRequestId: 'capture-request-2',
    provider: 'groq',
    transcriptionModel: 'whisper-large-v3',
    summaryModel: null,
    quality: {
      status: 'review',
      durationSec: 60,
      wordCount: 20,
      wordsPerMinute: 20,
      segmentCount: 0,
      lowConfidenceSegmentRatio: null,
      highNoSpeechSegmentRatio: null,
      repeatedFillerRatio: 0,
      warnings: [],
    },
  };

  assert.throws(
    () => buildTranscriptEvidenceRpcPayload({
      ...base,
      segments: [{
        id: 'bad',
        startMs: 900,
        endMs: 100,
        text: 'Urutan waktu salah',
        speakerKey: null,
        speakerRole: 'unknown',
        averageLogProbability: null,
        noSpeechProbability: null,
      }],
    }),
    /time range/i,
  );

  assert.throws(
    () => buildTranscriptEvidenceRpcPayload({
      ...base,
      segments: Array.from({ length: MAX_TRANSCRIPT_EVIDENCE_SEGMENTS + 1 }, (_, index) => ({
        id: `segment-${index}`,
        startMs: index,
        endMs: index + 1,
        text: 'x',
        speakerKey: null,
        speakerRole: 'unknown',
        averageLogProbability: null,
        noSpeechProbability: null,
      })),
    }),
    /too many/i,
  );
});

test('bounded JSON reader rejects declared and streamed oversized bodies', async () => {
  const {
    BoundedJsonBodyError,
    readBoundedJsonBody,
  } = require('../build/lib/api/bounded-json.js');

  const declaredOversized = {
    headers: new Headers({ 'content-length': '101' }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{}'));
        controller.close();
      },
    }),
  };

  await assert.rejects(
    readBoundedJsonBody(declaredOversized, 100),
    (error) => error instanceof BoundedJsonBodyError && error.code === 'body-too-large',
  );

  const streamedOversized = {
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(60));
        controller.enqueue(new Uint8Array(60));
        controller.close();
      },
    }),
  };

  await assert.rejects(
    readBoundedJsonBody(streamedOversized, 100),
    (error) => error instanceof BoundedJsonBodyError && error.code === 'body-too-large',
  );
});

test('bounded JSON reader parses an in-budget payload', async () => {
  const { readBoundedJsonBody } = require('../build/lib/api/bounded-json.js');
  const encoded = new TextEncoder().encode('{"transcript":"aman"}');

  const parsed = await readBoundedJsonBody({
    headers: new Headers({ 'content-length': String(encoded.byteLength) }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  }, 100);

  assert.deepEqual(parsed, { transcript: 'aman' });
});

test('migration creates private owner evidence with narrow atomic RPC access', () => {
  const sql = findTranscriptEvidenceMigration();

  assert.match(sql, /CREATE TABLE public\.processing_runs/i);
  assert.match(sql, /CREATE TABLE public\.transcript_segments/i);
  assert.match(sql, /REFERENCES public\.summaries\s*\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /ALTER TABLE public\.processing_runs ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /ALTER TABLE public\.transcript_segments ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /TO authenticated[\s\S]*\(SELECT auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.persist_transcript_evidence/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);
  assert.match(sql, /ON CONFLICT \(user_id, client_request_id\) DO NOTHING/i);
  assert.match(sql, /PG_COLUMN_SIZE\(p_segments\) > 2000000/i);
  assert.match(sql, /v_total_text_characters > 500000/i);
  assert.match(sql, /UNIQUE \(summary_id\)/i);
  assert.match(sql, /PG_ADVISORY_XACT_LOCK/i);
  assert.match(sql, /v_existing_run_count >= 500/i);
  assert.match(sql, /v_recent_run_count >= 60/i);
  assert.match(sql, /v_existing_text_characters \+ v_total_text_characters > 50000000/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.processing_runs[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.processing_runs, public\.transcript_segments TO authenticated/i);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.persist_transcript_evidence[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.persist_transcript_evidence[\s\S]*TO authenticated/i);
  assert.doesNotMatch(sql, /CREATE TABLE public\.transcript_speakers/i);
  assert.doesNotMatch(sql, /raw_audio|audio_blob|storage_path/i);
});

test('capture routes expose evidence metadata and dashboard persists after summary creation', () => {
  const summarizeRoute = read('app/api/summarize/route.ts');
  const summarizeTranscriptRoute = read('app/api/summarize-transcript/route.ts');
  const dashboard = read('app/dashboard/page.tsx');
  const db = read('lib/db.ts');

  assert.match(summarizeRoute, /requestId[\s\S]*provider:\s*'groq'[\s\S]*transcriptionModel:\s*GROQ_STT_MODEL/);
  assert.match(summarizeTranscriptRoute, /segments[\s\S]*analyzeTranscriptQuality/);
  assert.match(summarizeTranscriptRoute, /readBoundedJsonBody(?:<[^>]+>)?\(\s*request,\s*MAX_SUMMARIZE_BODY_BYTES/);
  assert.match(summarizeTranscriptRoute, /summaryModel:\s*GROQ_LLM_MODEL/);
  assert.match(dashboard, /offsetTranscriptSegments\(\s*data\.segments/);
  assert.match(dashboard, /persistTranscriptEvidence\(\s*newSummary\.id,\s*pendingSummary\.evidence/);
  assert.match(db, /supabase\.rpc\('persist_transcript_evidence'/);
});
