export const GROQ_PRICING_VERSION = 'groq-2026-08-14';

const MICROUPSD_PER_USD = 1_000_000;
const TOKENS_PER_MILLION = 1_000_000;
const MILLISECONDS_PER_HOUR = 3_600_000;
const GROQ_GPT_OSS_120B_INPUT_USD_PER_MILLION = 0.15;
const GROQ_GPT_OSS_120B_CACHED_INPUT_USD_PER_MILLION = 0.075;
const GROQ_GPT_OSS_120B_OUTPUT_USD_PER_MILLION = 0.60;
const GROQ_WHISPER_LARGE_V3_USD_PER_HOUR = 0.111;
const GROQ_MINIMUM_BILLABLE_AUDIO_MS = 10_000;
const PRICED_GROQ_LLM_MODEL = 'openai/gpt-oss-120b';
const PRICED_GROQ_STT_MODEL = 'whisper-large-v3';

type UnknownRecord = Record<string, unknown>;

export type GroqUsageMetrics = {
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  audioDurationMs?: number | null;
};

export type ParsedGroqCompletionUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type GroqCostEstimate = {
  billableAudioMs: number | null;
  estimatedCostMicrousd: number | null;
};

export type AiUsageOperation = 'capture' | 'summarize' | 'chat';
export type AiUsageStage = 'transcription' | 'generation';

export type AiUsageEvent = {
  userId: string;
  requestId: string;
  operation: AiUsageOperation;
  stage: AiUsageStage;
  provider: 'groq';
  model: string;
  providerRequestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  audioDurationMs: number | null;
  billableAudioMs: number | null;
  estimatedCostMicrousd: number | null;
  pricingVersion: typeof GROQ_PRICING_VERSION;
};

export type AiUsageEventInput = Omit<
  AiUsageEvent,
  | 'provider'
  | 'providerRequestId'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'audioDurationMs'
  | 'billableAudioMs'
  | 'estimatedCostMicrousd'
  | 'pricingVersion'
> & GroqUsageMetrics & {
  providerRequestId?: string | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null
    ? value as UnknownRecord
    : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    ? value
    : null;
}

function asPositiveFiniteNumber(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    ? value
    : null;
}

export function parseGroqCompletionUsage(
  response: unknown,
): ParsedGroqCompletionUsage | null {
  const usage = asRecord(asRecord(response)?.usage);
  if (!usage) return null;

  const inputTokens = asNonNegativeInteger(usage.prompt_tokens);
  const outputTokens = asNonNegativeInteger(usage.completion_tokens);
  if (inputTokens === null || outputTokens === null) return null;

  const detailsValue = usage.prompt_tokens_details;
  const details = detailsValue === undefined || detailsValue === null
    ? null
    : asRecord(detailsValue);
  if (detailsValue !== undefined && detailsValue !== null && !details) return null;

  const cachedValue = details?.cached_tokens;
  const cachedInputTokens = cachedValue === undefined || cachedValue === null
    ? 0
    : asNonNegativeInteger(cachedValue);

  if (cachedInputTokens === null || cachedInputTokens > inputTokens) return null;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
  };
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : null;
}

export function parseGroqProviderRequestId(response: unknown): string | null {
  const data = asRecord(response);
  if (!data) return null;

  const groqId = asNonEmptyString(asRecord(data.x_groq)?.id);
  return groqId ?? asNonEmptyString(data.id);
}

export function parseGroqTranscriptionDurationMs(response: unknown): number | null {
  const data = asRecord(response);
  if (!data) return null;

  const durationSeconds = asPositiveFiniteNumber(data.duration);
  if (durationSeconds !== null) {
    return Math.round(durationSeconds * 1_000);
  }

  if (!Array.isArray(data.segments)) return null;

  let finalEndSeconds: number | null = null;
  for (const segment of data.segments) {
    const endSeconds = asPositiveFiniteNumber(asRecord(segment)?.end);
    if (endSeconds !== null && (finalEndSeconds === null || endSeconds > finalEndSeconds)) {
      finalEndSeconds = endSeconds;
    }
  }

  return finalEndSeconds === null ? null : Math.round(finalEndSeconds * 1_000);
}

export function estimateGroqUsageCostMicrousd(
  model: string,
  metrics: GroqUsageMetrics,
): GroqCostEstimate {
  let estimatedCostMicrousd = 0;
  let hasCostBasis = false;

  const inputTokens = asNonNegativeInteger(metrics.inputTokens);
  const cachedInputTokens = metrics.cachedInputTokens === undefined
    || metrics.cachedInputTokens === null
    ? 0
    : asNonNegativeInteger(metrics.cachedInputTokens);
  const outputTokens = asNonNegativeInteger(metrics.outputTokens);

  if (
    model === PRICED_GROQ_LLM_MODEL
    && inputTokens !== null
    && cachedInputTokens !== null
    && cachedInputTokens <= inputTokens
    && outputTokens !== null
  ) {
    const uncachedInputTokens = inputTokens - cachedInputTokens;
    estimatedCostMicrousd += (
      uncachedInputTokens * GROQ_GPT_OSS_120B_INPUT_USD_PER_MILLION
      + cachedInputTokens * GROQ_GPT_OSS_120B_CACHED_INPUT_USD_PER_MILLION
      + outputTokens * GROQ_GPT_OSS_120B_OUTPUT_USD_PER_MILLION
    ) * MICROUPSD_PER_USD / TOKENS_PER_MILLION;
    hasCostBasis = true;
  }

  const audioDurationMs = model === PRICED_GROQ_STT_MODEL
    ? asNonNegativeInteger(metrics.audioDurationMs)
    : null;
  const billableAudioMs = audioDurationMs !== null && audioDurationMs > 0
    ? Math.max(audioDurationMs, GROQ_MINIMUM_BILLABLE_AUDIO_MS)
    : null;

  if (billableAudioMs !== null) {
    estimatedCostMicrousd += (
      billableAudioMs
      * GROQ_WHISPER_LARGE_V3_USD_PER_HOUR
      * MICROUPSD_PER_USD
      / MILLISECONDS_PER_HOUR
    );
    hasCostBasis = true;
  }

  return {
    billableAudioMs,
    estimatedCostMicrousd: hasCostBasis
      ? Math.round(estimatedCostMicrousd)
      : null,
  };
}

function normalizeOptionalCounter(value: number | null | undefined): number | null {
  return value === undefined || value === null
    ? null
    : asNonNegativeInteger(value);
}

export function createAiUsageEvent(input: AiUsageEventInput): AiUsageEvent {
  const inputTokens = normalizeOptionalCounter(input.inputTokens);
  const cachedInputTokens = normalizeOptionalCounter(input.cachedInputTokens);
  const outputTokens = normalizeOptionalCounter(input.outputTokens);
  const audioDurationMs = normalizeOptionalCounter(input.audioDurationMs);
  const cost = estimateGroqUsageCostMicrousd(input.model, {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    audioDurationMs,
  });
  const providerRequestId = input.providerRequestId?.trim() || null;

  return {
    userId: input.userId,
    requestId: input.requestId,
    operation: input.operation,
    stage: input.stage,
    provider: 'groq',
    model: input.model,
    providerRequestId,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    audioDurationMs,
    billableAudioMs: cost.billableAudioMs,
    estimatedCostMicrousd: cost.estimatedCostMicrousd,
    pricingVersion: GROQ_PRICING_VERSION,
  };
}
