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
