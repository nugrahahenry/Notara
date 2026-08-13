const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAuthCallbackUrl,
  buildLoginPath,
  buildOAuthRecoveryUrl,
  getRequestBaseUrl,
  isApiRequestPath,
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

test('auth destination accepts a valid public summary and rejects lookalike paths', () => {
  assert.equal(sanitizeAuthDestination('/s/abc12345'), '/s/abc12345');
  assert.equal(sanitizeAuthDestination('/s/abc12345/extra'), '/dashboard');
  assert.equal(sanitizeAuthDestination('/s/%2Fsecret'), '/dashboard');
});

test('login and callback URLs preserve only a safe local destination', () => {
  assert.equal(
    buildLoginPath('/s/abc12345'),
    '/login?redirect=%2Fs%2Fabc12345',
  );
  assert.equal(
    buildAuthCallbackUrl('https://nalira.example.com', '/s/abc12345'),
    'https://nalira.example.com/auth/callback?next=%2Fs%2Fabc12345',
  );
  assert.equal(
    buildAuthCallbackUrl('https://nalira.example.com', 'https://attacker.example'),
    'https://nalira.example.com/auth/callback?next=%2Fdashboard',
  );
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

test('only explicitly allowlisted operational endpoints bypass authentication', () => {
  assert.equal(isPublicOperationalRoute('/api/health'), true);
  assert.equal(isPublicOperationalRoute('/api/version'), true);
  assert.equal(isPublicOperationalRoute('/api/webhooks/billing'), true);
  assert.equal(isPublicOperationalRoute('/api/webhooks/billing/extra'), false);
  assert.equal(isPublicOperationalRoute('/api/chat'), false);
  assert.equal(isPublicOperationalRoute('/api/summarize'), false);
  assert.equal(isPublicOperationalRoute('/dashboard'), false);
});
test('API path classification excludes page and lookalike routes', () => {
  assert.equal(isApiRequestPath('/api/chat'), true);
  assert.equal(isApiRequestPath('/api/summarize-transcript'), true);
  assert.equal(isApiRequestPath('/api'), true);
  assert.equal(isApiRequestPath('/apiary'), false);
  assert.equal(isApiRequestPath('/dashboard'), false);
});
