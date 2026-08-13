const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compiledAccessPath = path.resolve(__dirname, '../build/lib/api/ai-access-policy.js');

function loadAccessPolicy() {
  assert.equal(
    fs.existsSync(compiledAccessPath),
    true,
    'lib/api/ai-access-policy.ts must compile into the test build',
  );
  return require(compiledAccessPath);
}

function authenticatedContext(rateLimitResult) {
  return {
    nodeEnv: 'production',
    bypassEnabled: false,
    getUser: async () => ({
      data: { user: { id: 'user-123' } },
      error: null,
    }),
    consumeRateLimit: async () => rateLimitResult,
  };
}

test('development bypass allows AI access without contacting Supabase', async () => {
  const { evaluateAiAccess } = loadAccessPolicy();
  let dependencyCalls = 0;

  const decision = await evaluateAiAccess('capture', {
    nodeEnv: 'development',
    bypassEnabled: true,
    getUser: async () => {
      dependencyCalls += 1;
      throw new Error('must not run');
    },
    consumeRateLimit: async () => {
      dependencyCalls += 1;
      throw new Error('must not run');
    },
  });

  assert.deepEqual(decision, {
    ok: true,
    userId: 'development-bypass',
    bypassed: true,
  });
  assert.equal(dependencyCalls, 0);
});

test('missing verified user is rejected before quota consumption', async () => {
  const { evaluateAiAccess } = loadAccessPolicy();
  let quotaCalls = 0;

  const decision = await evaluateAiAccess('chat', {
    nodeEnv: 'production',
    bypassEnabled: false,
    getUser: async () => ({ data: { user: null }, error: null }),
    consumeRateLimit: async () => {
      quotaCalls += 1;
      return { data: null, error: null };
    },
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.status, 401);
  assert.equal(decision.code, 'unauthorized');
  assert.equal(quotaCalls, 0);
});

test('authenticated user is allowed when quota remains', async () => {
  const { evaluateAiAccess } = loadAccessPolicy();

  const decision = await evaluateAiAccess('capture', authenticatedContext({
    data: [{
      allowed: true,
      request_limit: 30,
      remaining: 29,
      retry_after_seconds: 600,
    }],
    error: null,
  }));

  assert.deepEqual(decision, {
    ok: true,
    userId: 'user-123',
    bypassed: false,
    limit: 30,
    remaining: 29,
  });
});

test('exhausted quota returns a structured 429 response', async () => {
  const { createAiAccessErrorResponse, evaluateAiAccess } = loadAccessPolicy();

  const decision = await evaluateAiAccess('chat', authenticatedContext({
    data: [{
      allowed: false,
      request_limit: 30,
      remaining: 0,
      retry_after_seconds: 42,
    }],
    error: null,
  }));

  assert.equal(decision.ok, false);
  assert.equal(decision.status, 429);
  assert.equal(decision.code, 'rate-limited');
  assert.equal(decision.retryAfterSeconds, 42);

  const response = createAiAccessErrorResponse(decision);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '42');
  assert.deepEqual(await response.json(), {
    code: 'rate-limited',
    error: 'Terlalu banyak permintaan. Coba lagi sebentar.',
    retryAfterSeconds: 42,
  });
});

test('limiter errors and malformed results fail closed with 503', async () => {
  const { evaluateAiAccess } = loadAccessPolicy();

  const databaseError = await evaluateAiAccess('summarize', authenticatedContext({
    data: null,
    error: { message: 'function unavailable' },
  }));
  const malformedResult = await evaluateAiAccess('summarize', authenticatedContext({
    data: [{ allowed: true }],
    error: null,
  }));

  for (const decision of [databaseError, malformedResult]) {
    assert.equal(decision.ok, false);
    assert.equal(decision.status, 503);
    assert.equal(decision.code, 'rate-limit-unavailable');
  }
});
