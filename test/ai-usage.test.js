const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compiledUsagePath = path.resolve(__dirname, '../build/lib/ai/usage.js');
const compiledRecorderPolicyPath = path.resolve(
  __dirname,
  '../build/lib/ai/usage-recorder-policy.js',
);
const compiledStreamUsagePath = path.resolve(
  __dirname,
  '../build/lib/ai/stream-usage.js',
);

function loadUsage() {
  assert.equal(
    fs.existsSync(compiledUsagePath),
    true,
    'lib/ai/usage.ts must compile into the test build',
  );
  delete require.cache[compiledUsagePath];
  return require(compiledUsagePath);
}

function loadStreamUsage() {
  assert.equal(
    fs.existsSync(compiledStreamUsagePath),
    true,
    'lib/ai/stream-usage.ts must compile into the test build',
  );
  delete require.cache[compiledStreamUsagePath];
  return require(compiledStreamUsagePath);
}

function loadRecorderPolicy() {
  assert.equal(
    fs.existsSync(compiledRecorderPolicyPath),
    true,
    'lib/ai/usage-recorder-policy.ts must compile into the test build',
  );
  delete require.cache[compiledRecorderPolicyPath];
  return require(compiledRecorderPolicyPath);
}

test('completion usage separates cached input before estimating list-price cost', () => {
  const {
    estimateGroqUsageCostMicrousd,
    parseGroqCompletionUsage,
  } = loadUsage();

  const usage = parseGroqCompletionUsage({
    usage: {
      prompt_tokens: 1_000_000,
      prompt_tokens_details: { cached_tokens: 400_000 },
      completion_tokens: 500_000,
      total_tokens: 1_500_000,
    },
  });

  assert.deepEqual(usage, {
    inputTokens: 1_000_000,
    cachedInputTokens: 400_000,
    outputTokens: 500_000,
  });
  assert.deepEqual(estimateGroqUsageCostMicrousd('openai/gpt-oss-120b', usage), {
    billableAudioMs: null,
    estimatedCostMicrousd: 420_000,
  });
});

test('completion usage rejects malformed counters instead of inventing usage', () => {
  const { parseGroqCompletionUsage } = loadUsage();

  assert.equal(parseGroqCompletionUsage({}), null);
  assert.equal(parseGroqCompletionUsage({ usage: { prompt_tokens: -1 } }), null);
  assert.equal(parseGroqCompletionUsage({
    usage: {
      prompt_tokens: 10,
      prompt_tokens_details: { cached_tokens: 11 },
      completion_tokens: 2,
    },
  }), null);
});

test('provider request ID uses Groq metadata and falls back to the completion ID', () => {
  const { parseGroqProviderRequestId } = loadUsage();

  assert.equal(parseGroqProviderRequestId({
    id: 'chatcmpl_fallback',
    x_groq: { id: 'req_authoritative' },
  }), 'req_authoritative');
  assert.equal(parseGroqProviderRequestId({ id: 'chatcmpl_fallback' }), 'chatcmpl_fallback');
  assert.equal(parseGroqProviderRequestId({ id: '  ' }), null);
});

test('transcription duration prefers provider duration and falls back to the final segment end', () => {
  const { parseGroqTranscriptionDurationMs } = loadUsage();

  assert.equal(parseGroqTranscriptionDurationMs({ duration: 12.345 }), 12_345);
  assert.equal(parseGroqTranscriptionDurationMs({
    segments: [
      { start: 0, end: 3.2 },
      { start: 3.2, end: 9.876 },
    ],
  }), 9_876);
  assert.equal(parseGroqTranscriptionDurationMs({ segments: [{ end: -1 }] }), null);
});

test('Whisper pricing applies the ten-second request minimum and exact hourly rate', () => {
  const { estimateGroqUsageCostMicrousd } = loadUsage();

  assert.deepEqual(estimateGroqUsageCostMicrousd('whisper-large-v3', { audioDurationMs: 5_000 }), {
    billableAudioMs: 10_000,
    estimatedCostMicrousd: 308,
  });
  assert.deepEqual(estimateGroqUsageCostMicrousd('whisper-large-v3', { audioDurationMs: 3_600_000 }), {
    billableAudioMs: 3_600_000,
    estimatedCostMicrousd: 111_000,
  });
  assert.deepEqual(estimateGroqUsageCostMicrousd('whisper-large-v3', {}), {
    billableAudioMs: null,
    estimatedCostMicrousd: null,
  });
});

test('unknown models keep raw metrics but never borrow another model price', () => {
  const { estimateGroqUsageCostMicrousd } = loadUsage();

  assert.deepEqual(estimateGroqUsageCostMicrousd('future/model', {
    inputTokens: 1_000,
    cachedInputTokens: 0,
    outputTokens: 500,
    audioDurationMs: 60_000,
  }), {
    billableAudioMs: null,
    estimatedCostMicrousd: null,
  });
});

test('usage events contain operational metrics without learning content', () => {
  const { createAiUsageEvent } = loadUsage();

  assert.deepEqual(createAiUsageEvent({
    userId: '9a8e93b1-cf3e-4091-8b3d-486ffb1aa8f1',
    requestId: 'edc9b2e0-07f0-4207-b199-d91cf3679c4a',
    operation: 'summarize',
    stage: 'generation',
    model: 'openai/gpt-oss-120b',
    providerRequestId: 'req_123',
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 20,
  }), {
    userId: '9a8e93b1-cf3e-4091-8b3d-486ffb1aa8f1',
    requestId: 'edc9b2e0-07f0-4207-b199-d91cf3679c4a',
    operation: 'summarize',
    stage: 'generation',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    providerRequestId: 'req_123',
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 20,
    audioDurationMs: null,
    billableAudioMs: null,
    estimatedCostMicrousd: 24,
    pricingVersion: 'groq-2026-08-14',
  });
});

test('recorder skips development bypass without opening a database write', async () => {
  const { recordAiUsageWith } = loadRecorderPolicy();
  let writes = 0;

  const result = await recordAiUsageWith({ requestId: 'request-1' }, {
    bypassed: true,
    write: async () => { writes += 1; },
    reportFailure: () => assert.fail('bypass must not report a failure'),
  });

  assert.equal(result, 'skipped');
  assert.equal(writes, 0);
});

test('recorder writes once and maps the complete RPC payload', async () => {
  const { toAiUsageRpcParams, recordAiUsageWith } = loadRecorderPolicy();
  const event = {
    userId: 'user-123',
    requestId: 'request-123',
    operation: 'capture',
    stage: 'transcription',
    provider: 'groq',
    model: 'whisper-large-v3',
    providerRequestId: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    audioDurationMs: 5_000,
    billableAudioMs: 10_000,
    estimatedCostMicrousd: 308,
    pricingVersion: 'groq-2026-08-14',
  };
  const written = [];

  const result = await recordAiUsageWith(event, {
    bypassed: false,
    write: async (value) => { written.push(value); },
    reportFailure: () => assert.fail('successful write must not report failure'),
  });

  assert.equal(result, 'recorded');
  assert.deepEqual(written, [event]);
  assert.deepEqual(toAiUsageRpcParams(event), {
    p_user_id: 'user-123',
    p_request_id: 'request-123',
    p_operation: 'capture',
    p_stage: 'transcription',
    p_provider: 'groq',
    p_model: 'whisper-large-v3',
    p_provider_request_id: null,
    p_input_tokens: null,
    p_cached_input_tokens: null,
    p_output_tokens: null,
    p_audio_duration_ms: 5_000,
    p_billable_audio_ms: 10_000,
    p_estimated_cost_microusd: 308,
    p_pricing_version: 'groq-2026-08-14',
  });
});

test('recorder reports a fixed failure and never throws when storage fails or times out', async () => {
  const { recordAiUsageWith } = loadRecorderPolicy();
  const failures = [];

  const databaseFailure = await recordAiUsageWith({ requestId: 'request-1' }, {
    bypassed: false,
    write: async () => { throw new Error('private database detail'); },
    reportFailure: (code) => failures.push(code),
  });
  const timeoutFailure = await recordAiUsageWith({ requestId: 'request-2' }, {
    bypassed: false,
    write: () => new Promise(() => {}),
    reportFailure: (code) => failures.push(code),
    timeoutMs: 5,
  });

  assert.equal(databaseFailure, 'failed');
  assert.equal(timeoutFailure, 'failed');
  assert.deepEqual(failures, ['write-failed', 'write-failed']);
});

test('chat stream observer preserves bytes and extracts final usage across split chunks', async () => {
  const { observeGroqChatStream } = loadStreamUsage();
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"id":"chatcmpl_1","choices":[',
    '{"delta":{"content":"Halo"}}]}\n\n',
    'data: {"id":"chatcmpl_1","choices":[],"usage":{"prompt_tokens":100,',
    '"prompt_tokens_details":{"cached_tokens":40},"completion_tokens":20}}\n\ndata: [DONE]\n\n',
  ];
  const source = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const observations = [];

  const output = await new Response(observeGroqChatStream(
    source,
    async (observation) => { observations.push(observation); },
  )).text();

  assert.equal(output, chunks.join(''));
  assert.deepEqual(observations, [{
    providerRequestId: 'chatcmpl_1',
    usage: {
      inputTokens: 100,
      cachedInputTokens: 40,
      outputTokens: 20,
    },
  }]);
});

test('chat stream observer closes normally when usage data is absent or malformed', async () => {
  const { observeGroqChatStream } = loadStreamUsage();
  const encoder = new TextEncoder();
  const sourceText = 'data: not-json\n\ndata: [DONE]\n\n';
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sourceText));
      controller.close();
    },
  });
  const observations = [];

  const output = await new Response(observeGroqChatStream(
    source,
    async (observation) => { observations.push(observation); },
  )).text();

  assert.equal(output, sourceText);
  assert.deepEqual(observations, [{ providerRequestId: null, usage: null }]);
});

test('chat stream observer records one partial event when the client cancels', async () => {
  const { observeGroqChatStream } = loadStreamUsage();
  const encoder = new TextEncoder();
  let providerCancelled = false;
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"id":"chatcmpl_cancelled","choices":[{"delta":{"content":"Halo"}}]}\n\n',
      ));
    },
    cancel() {
      providerCancelled = true;
    },
  });
  const observations = [];
  const reader = observeGroqChatStream(
    source,
    async (observation) => { observations.push(observation); },
  ).getReader();

  await reader.read();
  await reader.cancel('user-left');

  assert.equal(providerCancelled, true);
  assert.deepEqual(observations, [{
    providerRequestId: 'chatcmpl_cancelled',
    usage: null,
  }]);
});
