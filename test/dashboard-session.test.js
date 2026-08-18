const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'dashboard', 'page.tsx'),
  'utf8',
);
const initialCheckSource = dashboardSource.slice(
  dashboardSource.indexOf('async function checkUser()'),
  dashboardSource.indexOf('checkUser();'),
);
const authListenerSource = dashboardSource.slice(
  dashboardSource.indexOf('supabase.auth.onAuthStateChange'),
  dashboardSource.indexOf('subscription.unsubscribe()'),
);

test('dashboard auth listener never awaits Supabase work while the auth lock is held', () => {
  assert.doesNotMatch(
    dashboardSource,
    /onAuthStateChange\(async\s*\(/,
    'onAuthStateChange must stay synchronous to avoid a Supabase auth deadlock',
  );
  assert.match(initialCheckSource, /finally\s*\{\s*initialAuthCheckPending = false;/);
  assert.match(authListenerSource, /event === 'INITIAL_SESSION'/);
  assert.match(authListenerSource, /event === 'TOKEN_REFRESHED'/);
  assert.match(authListenerSource, /event === 'SIGNED_IN' && isRestoredUser/);
  assert.match(authListenerSource, /deferredAuthSync = setTimeout\(\(\) => \{/);
});
