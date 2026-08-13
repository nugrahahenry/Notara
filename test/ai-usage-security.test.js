const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function loadUsageMigration() {
  const matches = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('_add_ai_usage_metering.sql'));

  assert.equal(matches.length, 1, 'exactly one AI usage metering migration must exist');
  return fs.readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

test('AI usage rows are private, constrained, indexed, and idempotent', () => {
  const sql = loadUsageMigration();
  const compactSql = sql.replace(/\s+/g, ' ');

  assert.match(sql, /create table private\.ai_usage_events/i);
  assert.match(sql, /id bigint generated always as identity primary key/i);
  assert.match(sql, /user_id uuid not null references auth\.users\s*\(id\) on delete cascade/i);
  assert.match(sql, /unique\s*\(request_id, stage\)/i);
  assert.match(sql, /check\s*\(operation in \('capture', 'summarize', 'chat'\)\)/i);
  assert.match(sql, /check\s*\(stage in \('transcription', 'generation'\)\)/i);
  assert.match(compactSql, /check \( cached_input_tokens is null or input_tokens is null or cached_input_tokens <= input_tokens \)/i);
  assert.match(sql, /alter table private\.ai_usage_events enable row level security/i);
  assert.match(sql, /create index idx_ai_usage_events_user_created[\s\S]*\(user_id, created_at desc\)/i);
  assert.match(sql, /create index idx_ai_usage_events_created[\s\S]*\(created_at\)/i);
  assert.match(sql, /on conflict \(request_id, stage\) do nothing/i);
});

test('AI usage table has no direct Data API access and only service role can call the writer', () => {
  const sql = loadUsageMigration();
  const compactSql = sql.replace(/\s+/g, ' ');

  assert.match(compactSql, /revoke all on table private\.ai_usage_events from public, anon, authenticated, service_role/i);
  assert.match(compactSql, /revoke all on sequence private\.ai_usage_events_id_seq from public, anon, authenticated, service_role/i);
  assert.match(sql, /create or replace function public\.record_ai_usage/i);
  assert.match(sql, /security definer\s*set search_path\s*=\s*''/i);
  assert.match(sql, /revoke execute on function public\.record_ai_usage\([\s\S]*\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.record_ai_usage\([\s\S]*\) to service_role/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[^;]*private\.ai_usage_events[^;]*(anon|authenticated)/i);
});

test('AI usage schema cannot store private learning content', () => {
  const sql = loadUsageMigration();

  for (const forbiddenColumn of [
    'audio_data',
    'file_name',
    'prompt',
    'transcript',
    'summary',
    'chat_message',
    'ip_address',
    'error_message',
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp('\\b' + forbiddenColumn + '\\b', 'i'),
      forbiddenColumn + ' must not be persisted in AI usage telemetry',
    );
  }
});

test('AI usage recorder is server-only, privileged, narrow, and fail-soft', () => {
  const recorder = read('lib/ai/usage-recorder.ts');

  assert.match(recorder, /import ['"]server-only['"]/);
  assert.match(recorder, /createAdminClient/);
  assert.match(recorder, /\.rpc\(\s*['"]record_ai_usage['"]/);
  assert.match(recorder, /toAiUsageRpcParams/);
  assert.match(recorder, /recordAiUsageWith/);
  assert.match(recorder, /\[ai-usage\] write failed/);
  assert.doesNotMatch(recorder, /console\.error\([^)]*error/i);
  assert.doesNotMatch(recorder, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});

test('all Groq routes attach private metering without weakening their authorization guard', () => {
  const summarize = read('app/api/summarize/route.ts');
  const combined = read('app/api/summarize-transcript/route.ts');
  const chat = read('app/api/chat/route.ts');

  for (const route of [summarize, combined, chat]) {
    assert.match(route, /createAiUsageEvent/);
    assert.match(route, /recordAiUsageSafely/);
    assert.match(route, /access\.bypassed/);
    assert.ok(
      route.indexOf('authorizeAiRequest') < route.indexOf('createAiUsageEvent'),
      'authorization must remain before usage event construction',
    );
  }

  assert.match(summarize, /response_format['"],\s*['"]verbose_json/);
  assert.match(summarize, /stage:\s*['"]transcription['"]/);
  assert.match(summarize, /stage:\s*['"]generation['"]/);
  assert.match(combined, /stage:\s*['"]generation['"]/);
  assert.match(chat, /observeGroqChatStream/);
  assert.match(chat, /stage:\s*['"]generation['"]/);
});
