const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOAuthRecoveryUrl,
  getRequestBaseUrl,
  isPublicOperationalRoute,
  resolveAuthOrigin,
  sanitizeAuthDestination,
} = require('../build/lib/auth/redirect.js');

test('auth destination accepts only local dashboard paths', () => {
  assert.equal(sanitizeAuthDestination('/dashboard'), '/dashboard');
  assert.equal(sanitizeAuthDestination('/dashboard?view=courses'), '/dashboard?view=courses');
  assert.equal(sanitizeAuthDestination('https://attacker.example'), '/dashboard');
  assert.equal(sanitizeAuthDestination('//attacker.example'), '/dashboard');
  assert.equal(sanitizeAuthDestination('/login'), '/dashboard');
});

test('auth origin keeps localhost local and can pin the production origin', () => {
  assert.equal(
    resolveAuthOrigin('http://localhost:3000', 'https://notara.example.com/path'),
    'http://localhost:3000',
  );
  assert.equal(
    resolveAuthOrigin('https://preview.vercel.app', 'https://notara.example.com/path'),
    'https://notara.example.com',
  );
  assert.equal(
    resolveAuthOrigin('https://preview.vercel.app', 'not-a-url'),
    'https://preview.vercel.app',
  );
});

test('callback base URL honors the first trusted proxy host and protocol', () => {
  const request = new Request('http://internal:3000/auth/callback?code=test', {
    headers: {
      'x-forwarded-host': 'notara.example.com, internal:3000',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(getRequestBaseUrl(request), 'https://notara.example.com');
});

test('site URL OAuth result is recovered into the official callback route', () => {
  const recovery = buildOAuthRecoveryUrl(new URL('https://notara.example.com/?code=pkce-code'));
  assert.ok(recovery);
  assert.equal(recovery.pathname, '/auth/callback');
  assert.equal(recovery.searchParams.get('code'), 'pkce-code');
  assert.equal(recovery.searchParams.get('next'), '/dashboard');
});

test('ordinary landing requests never trigger OAuth recovery', () => {
  assert.equal(buildOAuthRecoveryUrl(new URL('https://notara.example.com/')), null);
  assert.equal(
    buildOAuthRecoveryUrl(new URL('https://notara.example.com/login?code=pkce-code')),
    null,
  );
});

test('only operational health and version endpoints bypass authentication', () => {
  assert.equal(isPublicOperationalRoute('/api/health'), true);
  assert.equal(isPublicOperationalRoute('/api/version'), true);
  assert.equal(isPublicOperationalRoute('/api/chat'), false);
  assert.equal(isPublicOperationalRoute('/api/summarize'), false);
  assert.equal(isPublicOperationalRoute('/dashboard'), false);
});
