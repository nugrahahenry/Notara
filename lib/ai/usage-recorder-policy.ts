import type { AiUsageEvent } from './usage';

export type AiUsageRecordResult = 'recorded' | 'skipped' | 'failed';

export type AiUsageRecorderContext<T> = {
  bypassed: boolean;
  write: (event: T) => Promise<void>;
  reportFailure: (code: 'write-failed') => void;
  timeoutMs?: number;
};

const DEFAULT_WRITE_TIMEOUT_MS = 1_500;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('AI usage write timed out.')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function recordAiUsageWith<T>(
  event: T,
  context: AiUsageRecorderContext<T>,
): Promise<AiUsageRecordResult> {
  if (context.bypassed) return 'skipped';

  try {
    await withTimeout(
      Promise.resolve().then(() => context.write(event)),
      context.timeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS,
    );
    return 'recorded';
  } catch {
    context.reportFailure('write-failed');
    return 'failed';
  }
}

export function toAiUsageRpcParams(event: AiUsageEvent) {
  return {
    p_user_id: event.userId,
    p_request_id: event.requestId,
    p_operation: event.operation,
    p_stage: event.stage,
    p_provider: event.provider,
    p_model: event.model,
    p_provider_request_id: event.providerRequestId,
    p_input_tokens: event.inputTokens,
    p_cached_input_tokens: event.cachedInputTokens,
    p_output_tokens: event.outputTokens,
    p_audio_duration_ms: event.audioDurationMs,
    p_billable_audio_ms: event.billableAudioMs,
    p_estimated_cost_microusd: event.estimatedCostMicrousd,
    p_pricing_version: event.pricingVersion,
  };
}
