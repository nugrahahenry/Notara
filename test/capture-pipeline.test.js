const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCaptureHttpError,
  requestCaptureJson,
  requestCaptureJsonWithRateLimitRetry,
} = require('../build/lib/capture/pipeline.js');

class FakeXhr {
  constructor(response) {
    this.response = response;
    this.headers = {};
    this.upload = {};
    this.status = 0;
    this.responseText = '';
  }

  open(method, url, async) {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  setRequestHeader(name, value) {
    this.headers[name] = value;
  }

  getResponseHeader(name) {
    return this.response.headers?.[name.toLowerCase()] ?? null;
  }

  send(body) {
    this.body = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 10 });
    this.upload.onload?.();
    this.status = this.response.status;
    this.responseText = this.response.body;
    this.onload?.();
  }
}

test('capture request preserves POST body, headers, real upload progress, and JSON response', async () => {
  const progress = [];
  let uploadCompleted = false;
  const fakeXhr = new FakeXhr({ status: 200, body: JSON.stringify({ transcript: 'isi' }) });

  const result = await requestCaptureJson('/api/summarize', {
    body: 'payload',
    headers: { 'X-Test': 'yes' },
    onUploadProgress: (value) => progress.push(value),
    onUploadComplete: () => { uploadCompleted = true; },
    xhrFactory: () => fakeXhr,
  });

  assert.deepEqual(result, { transcript: 'isi' });
  assert.equal(fakeXhr.method, 'POST');
  assert.equal(fakeXhr.url, '/api/summarize');
  assert.equal(fakeXhr.body, 'payload');
  assert.equal(fakeXhr.headers['X-Test'], 'yes');
  assert.deepEqual(progress, [{ completedBytes: 4, totalBytes: 10 }]);
  assert.equal(uploadCompleted, true);
});

test('capture request keeps server error copy and classifies retryability', async () => {
  const fakeXhr = new FakeXhr({
    status: 500,
    body: JSON.stringify({ error: 'Model sedang tidak tersedia.' }),
  });

  await assert.rejects(
    requestCaptureJson('/api/summarize', { xhrFactory: () => fakeXhr }),
    (error) => {
      assert.equal(error.code, 'server');
      assert.equal(error.message, 'Model sedang tidak tersedia.');
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test('silent audio is a final per-item error while rate limits can be retried', () => {
  const silent = createCaptureHttpError(
    400,
    JSON.stringify({ error: 'Audio terlalu sunyi atau tidak ada suara yang bisa ditranskripsi.' }),
  );
  const rateLimit = createCaptureHttpError(
    429,
    JSON.stringify({ error: 'Terlalu banyak permintaan.' }),
    '42',
  );

  assert.equal(silent.code, 'audio-empty');
  assert.equal(silent.retryable, false);
  assert.equal(rateLimit.code, 'rate-limited');
  assert.equal(rateLimit.retryable, true);
  assert.equal(rateLimit.retryAfterSeconds, 42);
});

test('chunk request waits for Retry-After and retries the same request', async () => {
  const responses = [
    {
      status: 429,
      body: JSON.stringify({ error: 'Terlalu banyak permintaan.' }),
      headers: { 'retry-after': '12' },
    },
    { status: 200, body: JSON.stringify({ transcript: 'bagian lanjut' }) },
  ];
  const createdRequests = [];
  const waits = [];
  const retryNotices = [];

  const result = await requestCaptureJsonWithRateLimitRetry(
    '/api/summarize',
    {
      body: 'same-payload',
      xhrFactory: () => {
        const xhr = new FakeXhr(responses.shift());
        createdRequests.push(xhr);
        return xhr;
      },
    },
    {
      maxRateLimitRetries: 2,
      wait: async (milliseconds) => { waits.push(milliseconds); },
      onRateLimited: (notice) => { retryNotices.push(notice); },
    },
  );

  assert.deepEqual(result, { transcript: 'bagian lanjut' });
  assert.equal(createdRequests.length, 2);
  assert.equal(createdRequests[0].body, 'same-payload');
  assert.equal(createdRequests[1].body, 'same-payload');
  assert.deepEqual(waits, [12_000]);
  assert.deepEqual(retryNotices, [{ attempt: 1, retryAfterSeconds: 12 }]);
});

test('chunk request keeps retries bounded when rate limiting persists', async () => {
  let requestCount = 0;

  await assert.rejects(
    requestCaptureJsonWithRateLimitRetry(
      '/api/summarize',
      {
        xhrFactory: () => {
          requestCount += 1;
          return new FakeXhr({
            status: 429,
            body: JSON.stringify({ error: 'Masih dibatasi.' }),
            headers: { 'retry-after': '1' },
          });
        },
      },
      {
        maxRateLimitRetries: 1,
        wait: async () => {},
      },
    ),
    (error) => {
      assert.equal(error.code, 'rate-limited');
      assert.equal(error.retryAfterSeconds, 1);
      return true;
    },
  );

  assert.equal(requestCount, 2);
});
