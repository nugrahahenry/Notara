const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');

function migrationSql() {
  const matches = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('_harden_billing_security.sql'));
  assert.equal(matches.length, 1, 'expected one harden_billing_security migration');
  return fs.readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function policyBlock(sql, name) {
  const marker = `CREATE POLICY "${name}"`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `missing policy ${name}`);
  const end = sql.indexOf(';', start);
  assert.notEqual(end, -1, `unterminated policy ${name}`);
  return sql.slice(start, end + 1);
}

test('billing RPC and security-definer helpers use hardened privileges', () => {
  const sql = migrationSql();

  assert.match(sql, /SET\s+search_path\s*=\s*''/i);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.handle_payment_callback\(text, text, text\) FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.handle_payment_callback\(text, text, text\) TO service_role/i);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.handle_new_user\(\) TO supabase_auth_admin/i);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.is_group_member\(uuid\) FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.is_group_member\(uuid\) TO authenticated/i);
});

test('payment transition is validated, serialized, and monotonic after success', () => {
  const sql = migrationSql();

  assert.match(sql, /p_status\s+NOT IN\s*\(\s*'pending'\s*,\s*'success'\s*,\s*'failed'\s*,\s*'expired'\s*\)/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /v_existing_status\s*=\s*'success'/i);
  assert.match(sql, /v_effective_status\s*:=\s*'success'/i);
  assert.match(sql, /v_current_period_end\s+TIMESTAMPTZ/i);
  assert.match(sql, /v_current_period_end\s+IS NULL\s+OR\s+v_current_period_end\s*<=\s*now\(\)/i);
});

test('all policies that call is_group_member are scoped to authenticated users', () => {
  const sql = migrationSql();
  const policyNames = [
    'Members can view folders shared in their groups',
    'Profiles are viewable by group members and self',
    'Members can view summaries in shared folders',
    'Members can insert summaries into shared folders',
    'Users can access chat for their own or shared summaries',
    'Members can view their study groups',
    'Members can view group membership',
    'Members can view group folders',
  ];

  for (const name of policyNames) {
    assert.match(policyBlock(sql, name), /\bTO authenticated\b/i, `${name} must target authenticated`);
  }

  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS "Public summaries are viewable by everyone"/i);
});