const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function readMigration() {
  const migrationDir = path.join(projectRoot, 'supabase', 'migrations');
  const migrationName = fs.readdirSync(migrationDir)
    .filter((name) => name.endsWith('_add_source_version_provenance.sql'))
    .sort()
    .at(-1);

  assert.ok(migrationName, 'source provenance migration must exist');
  return read(path.join('supabase', 'migrations', migrationName));
}

test('source provenance migration keeps version identity owner-only and speaker-neutral', () => {
  const sql = readMigration();

  assert.match(sql, /CREATE TABLE public\.transcript_source_versions/i);
  assert.match(sql, /processing_run_id UUID NOT NULL/i);
  assert.match(sql, /UNIQUE \(processing_run_id\)/i);
  assert.match(sql, /UNIQUE \(summary_id, version\)/i);
  assert.match(sql, /state IN \('active', 'superseded', 'revoked', 'expired'\)/i);
  assert.match(sql, /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(sql, /ALTER TABLE public\.transcript_source_versions ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /TO authenticated[\s\S]*\(SELECT auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.transcript_source_versions[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /CREATE TRIGGER processing_runs_create_transcript_source_version/i);
  assert.match(sql, /HASHTEXTEXTENDED\(/i);
  assert.match(sql, /CREATE TRIGGER summary_revisions_attach_source_version/i);
  assert.match(sql, /source_version_id UUID/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.persist_transcript_evidence_v2/i);
  assert.match(sql, /LOWER\(p_content_hash\)/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.persist_transcript_evidence_v2[\s\S]*TO authenticated/i);
  assert.doesNotMatch(sql, /transcript_speakers|voiceprint|audio_blob|storage_path/i);
});

test('evidence persistence upgrades to the provenance RPC only when a hash is available', () => {
  const db = read('lib/db.ts');
  const persistence = read('lib/transcript/persistence.ts');

  assert.match(persistence, /SHA-256/i);
  assert.match(persistence, /nalira-transcript-source-v1/);
  assert.match(db, /hashTranscriptEvidenceSegments\(payload\.p_segments\)/);
  assert.match(db, /contentHash \? 'persist_transcript_evidence_v2' : 'persist_transcript_evidence'/);
  assert.match(db, /error\.code === 'PGRST202'/);
  assert.match(db, /supabase\.rpc\('persist_transcript_evidence', payload\)/);
  assert.doesNotMatch(db, /NEXT_PUBLIC_.*SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY/);
});

test('source version reader remains compatible with legacy evidence environments', () => {
  const reader = read('lib/transcript/evidence-reader.ts');

  assert.match(reader, /let sourceVersion: TranscriptEvidencePage\['sourceVersion'\] = null/);
  assert.match(reader, /catch \{[\s\S]*Legacy environments can keep rendering evidence/);
  assert.match(reader, /sourceVersion,/);
});

test('source provenance enforces lifecycle, immutable retries, and tenant-bound revisions', () => {
  const sql = readMigration();
  assert.match(sql, /USING \([\s\S]*state = 'active'[\s\S]*expires_at > statement_timestamp\(\)/);
  assert.match(sql, /FOREIGN KEY \(source_version_id, summary_id, user_id\)/);
  assert.match(sql, /ON DELETE SET NULL \(source_version_id\)/);
  assert.match(sql, /v_stored_segments IS DISTINCT FROM v_input_segments/);
  assert.match(sql, /v_existing_hash IS DISTINCT FROM LOWER\(p_content_hash\)/);
  assert.match(sql, /IF v_existing_hash IS NULL AND p_content_hash IS NOT NULL THEN/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION private\.create_transcript_source_version\(\)/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION private\.attach_summary_revision_source_version\(\)/);
  assert.match(sql, /CHAR_LENGTH\(run\.quality_report ->> 'durationSec'\) <= 20/);
  assert.match(sql, /NUMERIC <= 86400/);
});

test('database rehearsal cannot target a remote project or reuse application credentials', () => {
  const runner = read('test/database/rehearse-source.js');
  assert.match(runner, /'-h', '127\.0\.0\.1', '-p', '55439', '-U', 'nalira_rehearsal'/);
  assert.match(runner, /!\/\^PG\/i\.test\(key\)/);
  assert.match(runner, /CREATE DATABASE \$\{db\}/);
  assert.match(runner, /DROP DATABASE \$\{db\} WITH \(FORCE\)/);
  assert.match(runner, /for \(const mode of \['fresh', 'upgrade'\]\)/);
  assert.match(runner, /length: 4/);
  assert.doesNotMatch(runner, /SUPABASE_URL|DATABASE_URL|dotenv|readFileSync\([^\n]*\.env/);
});

test('published production audit is read-only, bounded, and never exports material text', () => {
  const sql = read('supabase/verification/source-provenance.sql');
  assert.match(sql, /BEGIN READ ONLY;/);
  assert.match(sql, /SET LOCAL statement_timeout = '5s';/);
  assert.match(sql, /AS audit_status/);
  assert.match(sql, /AS failed_checks/);
  assert.match(sql, /'all_runs_backfilled'/);
  assert.match(sql, /'revisions_backfilled'/);
  assert.match(sql, /'authenticated_no_direct_write'/);
  assert.match(sql, /'v2_immutable_retry_guard'/);
  assert.equal((sql.match(/UNION ALL SELECT/g) ?? []).length + 1, 23);
  const statements = sql.replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");
  assert.doesNotMatch(statements, /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\.(transcript|content|summary)\b|\bto_jsonb\s*\(/i);
  assert.doesNotMatch(sql, /SUPABASE_.*KEY|DATABASE_URL|auth\.users|storage\.objects/);
});

// Execute the actual compiled client with a closed import allowlist. This must
// never initialize a Supabase client, read application credentials, or use fetch.
function persistenceClient(responses = [{ error: null }], options = {}) {
  const persistence = require('../build/lib/transcript/persistence.js');
  const calls = [];
  const errors = [];
  const clientModule = { exports: {} };
  const rpc = async (name, payload) => {
    calls.push({ name, payload: JSON.parse(JSON.stringify(payload)) });
    const response = responses[calls.length - 1];
    assert.ok(response, 'unexpected RPC call');
    if (response instanceof Error) throw response;
    return response;
  };
  vm.runInNewContext(read('build/lib/db.js'), {
    module: clientModule,
    exports: clientModule.exports,
    console: { error: (...parts) => errors.push(parts.join(' ')) },
    require(name) {
      if (name === './supabase') return { supabase: { rpc } };
      if (name === './transcript/persistence') {
        return {
          ...persistence,
          hashTranscriptEvidenceSegments: options.hash ?? persistence.hashTranscriptEvidenceSegments,
        };
      }
      throw new Error(`Unexpected client import: ${name}`);
    },
  }, { filename: 'build/lib/db.js' });
  return { persist: clientModule.exports.persistTranscriptEvidence, calls, errors };
}

function syntheticEvidence() {
  return {
    clientRequestId: 'synthetic-source-client-qa',
    provider: 'groq',
    transcriptionModel: 'whisper-large-v3',
    summaryModel: null,
    quality: {
      status: 'good', durationSec: 10, wordCount: 4, wordsPerMinute: 24,
      segmentCount: 1, lowConfidenceSegmentRatio: 0, highNoSpeechSegmentRatio: 0,
      repeatedFillerRatio: 0, warnings: [],
    },
    segments: [{
      id: 'synthetic-segment-1', startMs: 0, endMs: 10000,
      text: 'Synthetic transcript for local testing.',
      speakerKey: null, speakerRole: 'unknown',
      averageLogProbability: -0.1, noSpeechProbability: 0.01,
    }],
  };
}

const SYNTHETIC_SUMMARY_ID = '8eb7b37f-f349-4bb0-888f-72e37f06187d';

test('source client sends the normalized evidence and SHA-256 fingerprint to v2', async () => {
  const client = persistenceClient();
  assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), true);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, 'persist_transcript_evidence_v2');
  const payload = client.calls[0].payload;
  assert.match(payload.p_content_hash, /^[0-9a-f]{64}$/);
  const { hashTranscriptEvidenceSegments } = require('../build/lib/transcript/persistence.js');
  assert.equal(payload.p_content_hash, await hashTranscriptEvidenceSegments(payload.p_segments));
  assert.equal(payload.p_summary_id, SYNTHETIC_SUMMARY_ID);
  assert.equal(payload.p_quality.segmentCount, 1);
  assert.deepEqual(Object.keys(payload.p_segments[0]).sort(), [
    'average_log_probability', 'end_ms', 'no_speech_probability', 'start_ms', 'text',
  ]);
  assert.deepEqual(client.errors, []);
});

test('source client hashes identical retries identically and changed evidence differently', async () => {
  const client = persistenceClient([{ error: null }, { error: null }, { error: null }]);
  const input = syntheticEvidence();
  await client.persist(SYNTHETIC_SUMMARY_ID, input);
  await client.persist(SYNTHETIC_SUMMARY_ID, input);
  const changed = syntheticEvidence();
  changed.segments[0].text = 'Different synthetic transcript.';
  await client.persist(SYNTHETIC_SUMMARY_ID, changed);
  assert.deepEqual(client.calls[0], client.calls[1]);
  assert.notEqual(client.calls[0].payload.p_content_hash, client.calls[2].payload.p_content_hash);
  // Database immutability is tested separately in the PostgreSQL rehearsal.
});

test('source client retains the legacy lane when Web Crypto is unavailable', async () => {
  const client = persistenceClient([{ error: null }], { hash: async () => null });
  assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), true);
  assert.equal(client.calls[0].name, 'persist_transcript_evidence');
  assert.equal('p_content_hash' in client.calls[0].payload, false);
});

test('source client falls back once for the missing-v2 schema-cache code', async () => {
  const client = persistenceClient([
    { error: { code: 'PGRST202', message: 'Missing RPC in schema cache.' } },
    { error: null },
  ]);
  assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), true);
  assert.deepEqual(client.calls.map((call) => call.name), [
    'persist_transcript_evidence_v2', 'persist_transcript_evidence',
  ]);
  const { p_content_hash: fingerprint, ...original } = client.calls[0].payload;
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(client.calls[1].payload, original);
});

test('source client recognizes an uncoded missing message only for the exact v2 function', async () => {
  for (const message of [
    'Could not find the function public.persist_transcript_evidence_v2 in the schema cache.',
    'persist_transcript_evidence_v2 not found.',
    'Function public.persist_transcript_evidence_v2 was not found.',
  ]) {
    const client = persistenceClient([{ error: { message } }, { error: null }]);
    assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), true);
    assert.equal(client.calls.length, 2);
  }
});

test('source client does not downgrade owner, quota, validation, or immutable-retry errors', async () => {
  for (const code of ['42501', 'P0001', '22023', '23505', 'PGRST301', 'PGRST204']) {
    const client = persistenceClient([{ error: { code, message: 'Synthetic rejected request.' } }]);
    assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), false, code);
    assert.equal(client.calls.length, 1, code);
    assert.deepEqual(client.errors, ['Transcript evidence persistence failed.']);
  }
});

test('source client does not let a missing-function message override an explicit permission error', async () => {
  const client = persistenceClient([
    { error: { code: '42501', message: 'Could not find the function public.persist_transcript_evidence_v2.' } },
    { error: null },
  ]);
  assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), false);
  assert.equal(client.calls.length, 1);
});

test('source client does not downgrade when an unrelated function is missing', async () => {
  for (const message of [
    'Could not find the function private.unrelated_fixture_function.',
    'Could not find the function private.persist_transcript_evidence_v2.',
    'Could not find the function public.persist_transcript_evidence_v2_backup.',
    'public.persist_transcript_evidence_v2_backup not found.',
  ]) {
    const client = persistenceClient([{ error: { message } }]);
    assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), false);
    assert.equal(client.calls.length, 1);
  }
});

test('source client reports a failed legacy fallback without more retries or raw error logs', async () => {
  const client = persistenceClient([
    { error: { code: 'PGRST202', message: 'Missing v2.' } },
    { error: { code: '42501', message: 'Synthetic private fixture details.' } },
  ]);
  assert.equal(await client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), false);
  assert.equal(client.calls.length, 2);
  assert.deepEqual(client.errors, ['Transcript evidence persistence failed.']);
});

test('source client rejects invalid evidence before hashing or calling the database', async () => {
  let hashCalls = 0;
  const client = persistenceClient([], { hash: async () => { hashCalls += 1; return null; } });
  assert.equal(await client.persist('invalid-summary', syntheticEvidence()), false);
  assert.equal(hashCalls, 0);
  assert.deepEqual(client.calls, []);
  assert.deepEqual(client.errors, ['Transcript evidence payload validation failed.']);
});

test('source client propagates crypto and transport failures without a silent downgrade', async () => {
  const cryptoFailure = new Error('Synthetic crypto failure.');
  const client = persistenceClient([], { hash: async () => { throw cryptoFailure; } });
  await assert.rejects(client.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), cryptoFailure);
  assert.equal(client.calls.length, 0);
  const transportFailure = new Error('Synthetic transport failure.');
  const transportClient = persistenceClient([transportFailure]);
  await assert.rejects(transportClient.persist(SYNTHETIC_SUMMARY_ID, syntheticEvidence()), transportFailure);
  assert.equal(transportClient.calls.length, 1);
});
