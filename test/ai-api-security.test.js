const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');

function loadRateLimitMigration() {
  const matches = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('_add_ai_api_rate_limits.sql'));

  assert.equal(matches.length, 1, 'exactly one AI API rate-limit migration must exist');
  return fs.readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

test('AI rate-limit migration keeps counters private and updates them atomically', () => {
  const sql = loadRateLimitMigration();

  assert.match(sql, /create schema if not exists private/i);
  assert.match(sql, /create table if not exists private\.ai_rate_limits/i);
  assert.match(sql, /primary key\s*\(user_id, operation, window_started_at\)/i);
  assert.match(sql, /check\s*\(operation in \('capture', 'summarize', 'chat'\)\)/i);
  assert.match(sql, /alter table private\.ai_rate_limits enable row level security/i);
  assert.match(sql, /insert into private\.ai_rate_limits[\s\S]*on conflict\s*\(user_id, operation, window_started_at\)[\s\S]*do update/i);
});

test('AI rate-limit RPC derives identity and limits instead of trusting callers', () => {
  const sql = loadRateLimitMigration();

  assert.match(sql, /public\.consume_ai_rate_limit\s*\(p_operation text\)/i);
  assert.match(sql, /security definer\s*set search_path\s*=\s*''/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /p_user_id/i);
  assert.match(sql, /when 'capture' then 30/i);
  assert.match(sql, /when 'summarize' then 10/i);
  assert.match(sql, /when 'chat' then 30/i);
  assert.match(sql, /date_bin\s*\(\s*interval '10 minutes'/i);
});

test('AI rate-limit objects expose only the narrow authenticated RPC', () => {
  const sql = loadRateLimitMigration();

  assert.doesNotMatch(sql, /revoke all on schema private/i, 'migration must not alter unrelated private schema privileges');
  assert.match(sql, /revoke all on table private\.ai_rate_limits from public, anon, authenticated/i);
  assert.match(sql, /revoke execute on function public\.consume_ai_rate_limit\(text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.consume_ai_rate_limit\(text\) to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[^;]*private\.ai_rate_limits[^;]*authenticated/i);
});
test('all Groq routes authorize before reading input or provider secrets', () => {
  const routes = [
    ['app/api/summarize/route.ts', 'capture', 'request.formData()'],
    ['app/api/summarize-transcript/route.ts', 'summarize', 'request.json()'],
    ['app/api/chat/route.ts', 'chat', 'request.json()'],
  ];

  for (const [relativePath, operation, inputMarker] of routes) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    const guardMarker = "authorizeAiRequest('" + operation + "')";
    const guardIndex = source.indexOf(guardMarker);

    assert.notEqual(guardIndex, -1, relativePath + ' must call ' + guardMarker);
    assert.ok(guardIndex < source.indexOf(inputMarker), relativePath + ' must authorize before reading input');
    assert.ok(guardIndex < source.indexOf('process.env.GROQ_API_KEY'), relativePath + ' must authorize before reading Groq configuration');
  }
});

test('proxy returns JSON auth failures for protected API requests', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'proxy.ts'), 'utf8');

  assert.match(source, /isApiRequestPath\(url\.pathname\)/);
  assert.match(source, /NextResponse\.json\([\s\S]*code:\s*'unauthorized'[\s\S]*status:\s*401/);
});
