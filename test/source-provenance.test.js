const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
