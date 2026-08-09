/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRuntimeHealth,
  createRuntimeHealthResponse,
} = require('../build/lib/runtime/health.js');
const { GET } = require('../build/app/api/health/route.js');

function withFixedClock(callback) {
  const RealDate = global.Date;

  class FixedDate extends RealDate {
    constructor(...args) {
      super(args.length === 0 ? '2026-08-09T10:05:00.000Z' : args[0]);
    }

    static now() {
      return new RealDate('2026-08-09T10:05:00.000Z').getTime();
    }
  }

  global.Date = FixedDate;
  try {
    return callback();
  } finally {
    global.Date = RealDate;
  }
}

test('runtime health returns the exact public payload from its injected clock', () => {
  const payload = buildRuntimeHealth({
    version: '0.1.1',
    buildId: 'canox-commit-001',
    now: () => new Date('2026-08-09T10:00:00.000Z'),
  });

  assert.deepEqual(payload, {
    schemaVersion: 1,
    service: 'nalira-web',
    status: 'ok',
    version: '0.1.1',
    buildId: 'canox-commit-001',
    servedAt: '2026-08-09T10:00:00.000Z',
  });
});

test('runtime health response is successful, public, and never cached', async () => {
  const response = createRuntimeHealthResponse({
    version: '0.1.1',
    buildId: 'build-42',
    now: () => new Date('2026-08-09T10:01:00.000Z'),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Pragma'), 'no-cache');
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    service: 'nalira-web',
    status: 'ok',
    version: '0.1.1',
    buildId: 'build-42',
    servedAt: '2026-08-09T10:01:00.000Z',
  });
});

test('runtime health normalizes blank, unsafe, and oversized identity values', () => {
  const payload = buildRuntimeHealth({
    version: '  ',
    buildId: 'build\n42',
    now: () => new Date('2026-08-09T10:02:00.000Z'),
  });
  const oversized = buildRuntimeHealth({
    version: 'v'.repeat(65),
    buildId: 'b'.repeat(129),
    now: () => new Date('2026-08-09T10:02:01.000Z'),
  });

  assert.equal(payload.version, 'unknown');
  assert.equal(payload.buildId, 'unknown');
  assert.equal(oversized.version, 'unknown');
  assert.equal(oversized.buildId, 'unknown');
});

test('runtime health generates a timestamp for every response', () => {
  let call = 0;
  const now = () => new Date(`2026-08-09T10:03:0${call++}.000Z`);

  const first = buildRuntimeHealth({ version: '0.1.1', now });
  const second = buildRuntimeHealth({ version: '0.1.1', now });

  assert.equal(first.servedAt, '2026-08-09T10:03:00.000Z');
  assert.equal(second.servedAt, '2026-08-09T10:03:01.000Z');
});

test('runtime health response never exposes a sensitive environment value', async () => {
  const secret = 'do-not-expose-runtime-health-secret';
  process.env.RUNTIME_HEALTH_TEST_SECRET = secret;

  try {
    const response = createRuntimeHealthResponse({
      version: '0.1.1',
      buildId: 'local-development',
      now: () => new Date('2026-08-09T10:04:00.000Z'),
    });

    assert.doesNotMatch(await response.text(), new RegExp(secret));
  } finally {
    delete process.env.RUNTIME_HEALTH_TEST_SECRET;
  }
});

test('runtime health GET prioritizes public build identities and omits unrelated secrets', async () => {
  const keys = [
    'VERCEL_GIT_COMMIT_SHA',
    'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA',
    'RUNTIME_HEALTH_TEST_SECRET',
  ];
  const previousValues = new Map(keys.map((key) => [key, process.env[key]]));
  const secret = 'route-level-secret-must-not-appear';

  try {
    process.env.VERCEL_GIT_COMMIT_SHA = 'server-build-id';
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = 'public-build-id';
    process.env.RUNTIME_HEALTH_TEST_SECRET = secret;

    const primaryResponse = withFixedClock(() => GET());
    assert.equal(primaryResponse.status, 200);
    assert.equal(primaryResponse.headers.get('Cache-Control'), 'no-store');
    assert.equal(primaryResponse.headers.get('Pragma'), 'no-cache');

    const primaryBody = await primaryResponse.text();
    assert.doesNotMatch(primaryBody, new RegExp(secret));
    assert.deepEqual(JSON.parse(primaryBody), {
      schemaVersion: 1,
      service: 'nalira-web',
      status: 'ok',
      version: '0.1.1',
      buildId: 'server-build-id',
      servedAt: '2026-08-09T10:05:00.000Z',
    });

    process.env.VERCEL_GIT_COMMIT_SHA = '';
    assert.equal(
      (await withFixedClock(() => GET()).json()).buildId,
      'public-build-id',
    );

    delete process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
    assert.equal(
      (await withFixedClock(() => GET()).json()).buildId,
      'local-development',
    );
  } finally {
    for (const key of keys) {
      const previousValue = previousValues.get(key);
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
});
