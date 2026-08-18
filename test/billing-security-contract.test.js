const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('billing webhook delegates to the tested processor and never uses a cookie client', () => {
  const route = read('app/api/webhooks/billing/route.ts');

  assert.match(route, /processBillingNotification/);
  assert.match(route, /createAdminClient/);
  assert.doesNotMatch(route, /supabase-server/);
  assert.doesNotMatch(route, /transaction_status\s*===/);
});

test('privileged Supabase client is server-only and requires the service-role key', () => {
  const adminClient = read('lib/supabase-admin.ts');

  assert.match(adminClient, /import ['"]server-only['"]/);
  assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(adminClient, /persistSession:\s*false/);
  assert.match(adminClient, /autoRefreshToken:\s*false/);
  assert.doesNotMatch(adminClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});
test('release metadata keeps the server-only billing rollout gate documented', () => {
  const packageJson = JSON.parse(read('package.json'));
  const packageLock = JSON.parse(read('package-lock.json'));
  const readme = read('README.md');
  const changelog = read('CHANGELOG.md');

  assert.equal(packageJson.version, '0.8.0');
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
  assert.match(readme, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(readme, /server-only/i);
  assert.match(changelog, /## \[0\.8\.0\] - 2026-08-19/);
  assert.match(changelog, /## \[0\.7\.1\] - 2026-08-19/);
  assert.match(changelog, /## \[0\.7\.0\] - 2026-08-18/);
  assert.match(changelog, /## \[0\.6\.0\] - 2026-08-18/);
  assert.match(changelog, /## \[0\.5\.4\] - 2026-08-18/);
  assert.match(changelog, /## \[0\.5\.3\] - 2026-08-18/);
  assert.match(changelog, /## \[0\.5\.2\] - 2026-08-18/);
  assert.match(changelog, /## \[0\.5\.1\] - 2026-08-14/);
  assert.match(changelog, /## \[0\.4\.1\] - 2026-08-14/);
  assert.match(changelog, /## \[0\.4\.0\] - 2026-08-14/);
  assert.match(changelog, /## \[0\.3\.20\] - 2026-08-13/);
  assert.match(changelog, /signature/i);
  assert.match(changelog, /RPC/i);
});
