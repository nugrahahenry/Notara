// Intentionally fixed to a dedicated local cluster; never reads .env or accepts a URL.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const bin = process.env.NALIRA_REHEARSAL_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const psql = path.join(bin, process.platform === 'win32' ? 'psql.exe' : 'psql');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const args = ['-X', '-w', '-h', '127.0.0.1', '-p', '55439', '-U', 'nalira_rehearsal', '-v', 'ON_ERROR_STOP=1', '-At'];
function query(db, sql, expectedFailure = false) {
  const result = spawnSync(psql, [...args, '-d', db], { input: sql, encoding: 'utf8', env, timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  if (expectedFailure) {
    assert.notEqual(result.status, 0, 'expected transaction failure');
  } else if (result.status !== 0) {
    throw new Error(result.stderr || `psql exited ${result.status}`);
  }
  return result.stdout.trim();
}
function file(db, name) { return query(db, fs.readFileSync(path.join(root, name), 'utf8')); }
function concurrent(db, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [...args, '-d', db], { env, windowsHide: true });
    let output = ''; let error = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('concurrency timeout')); }, 30000);
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { error += data; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { clearTimeout(timer); if (code !== 0) reject(new Error(error)); else resolve(output.trim().split('\n').at(-1)); });
    child.stdin.end(sql);
  });
}
async function main() {
  assert.equal(query('postgres', "SELECT current_user || ':' || inet_server_addr() || ':' || inet_server_port();"), 'nalira_rehearsal:127.0.0.1/32:55439');
  const names = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql') && !name.includes('_verify')).sort();
  const latest = names.find((name) => name.endsWith('_add_source_version_provenance.sql'));
  assert.ok(latest);
  for (const mode of ['fresh', 'upgrade']) {
    const db = `nalira_source_rehearsal_${mode}_${process.pid}`;
    assert.match(db, /^nalira_source_rehearsal_(fresh|upgrade)_\d+$/);
    query('postgres', `CREATE DATABASE ${db};`);
    try {
      file(db, 'test/database/bootstrap.sql');
      for (const name of names.filter((name) => name !== latest)) file(db, `supabase/migrations/${name}`);
      if (mode === 'upgrade') file(db, 'test/database/source-seed.sql');
      const migration = fs.readFileSync(path.join(root, 'supabase/migrations', latest), 'utf8');
      query(db, `BEGIN;\n${migration}\nDO $$ BEGIN RAISE EXCEPTION 'deliberate rehearsal rollback'; END $$;\nCOMMIT;`, true);
      assert.equal(query(db, "SELECT to_regclass('public.transcript_source_versions') IS NULL;"), 't');
      query(db, `BEGIN;\n${migration}\nCOMMIT;`);
      if (mode === 'fresh') file(db, 'test/database/source-seed.sql');
      file(db, 'test/database/source-provenance.sql');
      const sql = `SET ROLE authenticated; SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001'; SELECT public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000003','concurrent','groq','dummy',NULL,'{"status":"good","durationSec":1.25}','[{"start_ms":0,"end_ms":1250,"text":"Concurrent dummy","average_log_probability":null,"no_speech_probability":null}]',repeat('c',64));`;
      const runs = await Promise.all(Array.from({ length: 4 }, () => concurrent(db, sql)));
      assert.equal(new Set(runs).size, 1, 'concurrent retries return one run');
      assert.equal(query(db, "SELECT count(*) FROM public.transcript_source_versions WHERE summary_id = '20000000-0000-4000-8000-000000000003';"), '1');
      assert.equal(query(db, "SELECT duration_ms FROM public.transcript_source_versions WHERE summary_id = '20000000-0000-4000-8000-000000000003';"), '1250');
      console.log(`PASS ${mode}: migrations, rollback, source contracts, four concurrent retries`);
    } finally {
      query('postgres', `DROP DATABASE ${db} WITH (FORCE);`);
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
