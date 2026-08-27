import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL } from '@/lib/ai';
import {
  createAiUsageEvent,
  parseGroqCompletionUsage,
  parseGroqProviderRequestId,
} from '@/lib/ai/usage';
import { recordAiUsageSafely } from '@/lib/ai/usage-recorder';
import { authorizeAiRequest, authorizeAuthenticatedUser } from '@/lib/api/ai-access';
import { BoundedJsonBodyError, readBoundedJsonBody } from '@/lib/api/bounded-json';
import { readHierarchicalEvidenceSnapshot } from '@/lib/summary/hierarchical-evidence';
import {
  normalizeFinalStageOutput,
  normalizeMapStageOutput,
  normalizeReduceStageOutput,
  parseStoredClaimSet,
  serializeGroundedClaimSet,
  type GroundedClaimSet,
} from '@/lib/summary/hierarchical-output';
import {
  HIERARCHICAL_PROMPT_VERSION,
  MAX_HIERARCHICAL_STAGE_OUTPUT_TOKENS,
} from '@/lib/summary/hierarchical-plan';
import {
  MAX_SUMMARY_REGENERATION_BODY_BYTES,
  normalizeHierarchicalSummaryProgress,
  parseHierarchicalSummaryStepRequest,
  type HierarchicalStageFailureCode,
} from '@/lib/summary/revisions';
import { createClient } from '@/lib/supabase-server';
import {
  buildHierarchicalMapPrompt,
  buildHierarchicalReducePrompt,
} from '@/lib/transcript/hierarchical-summary-prompt';
import { MAX_CONTEXT_SUMMARY_PROMPT_CHARACTERS } from '@/lib/transcript/context-summary-prompt';

const STAGE_TIMEOUT_MS = 45_000;
const CONSERVATIVE_PACING_SECONDS = 125;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface ClaimedStage {
  requestState: 'generating' | 'completed' | 'failed';
  stageId: string | null;
  attemptId: string | null;
  stageIndex: number | null;
  stageKind: 'map' | 'reduce' | 'final' | null;
  stageState: 'queued' | 'generating' | 'completed' | 'failed' | null;
  ordinalStart: number | null;
  ordinalEnd: number | null;
  inputStageOutputs: Array<{ stageId: string; output: string }>;
  processingRunId: string;
  contextAnnotationIds: number[];
  replayed: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeClaimRows(value: unknown): ClaimedStage | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = record(value[0]);
  if (!row) return null;
  const stageId = row.stage_id === null ? null : typeof row.stage_id === 'string' ? row.stage_id : undefined;
  const attemptId = row.attempt_id === null ? null : typeof row.attempt_id === 'string' ? row.attempt_id : undefined;
  const stageIndex = row.stage_index === null ? null : Number(row.stage_index);
  const stageKind = row.stage_kind === null ? null : row.stage_kind;
  const stageState = row.stage_state === null ? null : row.stage_state;
  const ordinalStart = row.ordinal_start === null ? null : Number(row.ordinal_start);
  const ordinalEnd = row.ordinal_end === null ? null : Number(row.ordinal_end);
  const inputs = Array.isArray(row.input_stage_outputs) ? row.input_stage_outputs : [];
  const normalizedInputs = inputs.flatMap((candidate) => {
    const input = record(candidate);
    return typeof input?.stageId === 'string' && typeof input.output === 'string'
      ? [{ stageId: input.stageId, output: input.output }]
      : [];
  });
  if (
    (row.request_state !== 'generating' && row.request_state !== 'completed' && row.request_state !== 'failed')
    || stageId === undefined
    || attemptId === undefined
    || (stageIndex !== null && (!Number.isSafeInteger(stageIndex) || stageIndex < 1 || stageIndex > 24))
    || (stageKind !== null && stageKind !== 'map' && stageKind !== 'reduce' && stageKind !== 'final')
    || (stageState !== null && !['queued', 'generating', 'completed', 'failed'].includes(String(stageState)))
    || (ordinalStart !== null && !Number.isSafeInteger(ordinalStart))
    || (ordinalEnd !== null && !Number.isSafeInteger(ordinalEnd))
    || normalizedInputs.length !== inputs.length
    || typeof row.processing_run_id !== 'string'
    || !Array.isArray(row.context_annotation_ids)
    || row.context_annotation_ids.some((id: unknown) => !Number.isSafeInteger(Number(id)))
    || typeof row.replayed !== 'boolean'
  ) return null;
  return {
    requestState: row.request_state,
    stageId,
    attemptId,
    stageIndex,
    stageKind: stageKind as ClaimedStage['stageKind'],
    stageState: stageState as ClaimedStage['stageState'],
    ordinalStart,
    ordinalEnd,
    inputStageOutputs: normalizedInputs,
    processingRunId: row.processing_run_id,
    contextAnnotationIds: row.context_annotation_ids.map(Number),
    replayed: row.replayed,
  };
}

function completionContent(value: unknown): string | null {
  const data = record(value);
  const choices = data?.choices;
  if (!Array.isArray(choices) || choices.length !== 1) return null;
  const choice = record(choices[0]);
  if (!choice || choice.finish_reason === 'length') return null;
  const message = record(choice.message);
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  return content || null;
}

function nextStepAtFromHeaders(headers: Headers): string {
  const retryAfter = headers.get('retry-after');
  const seconds = retryAfter && /^\d+$/.test(retryAfter)
    ? Math.min(Math.max(Number(retryAfter), CONSERVATIVE_PACING_SECONDS), 600)
    : CONSERVATIVE_PACING_SECONDS;
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

async function readProgress(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase.rpc('read_hierarchical_summary_request', {
    p_request_id: requestId,
  });
  if (error) return null;
  return normalizeHierarchicalSummaryProgress(data);
}

async function failStage(
  supabase: SupabaseClient,
  stage: ClaimedStage,
  failureCode: HierarchicalStageFailureCode,
  nextStepAt: string | null = null,
) {
  if (!stage.stageId || !stage.attemptId) return;
  const { error } = await supabase.rpc('fail_hierarchical_summary_stage', {
    p_stage_id: stage.stageId,
    p_attempt_id: stage.attemptId,
    p_failure_code: failureCode,
    p_next_step_at: nextStepAt,
  });
  if (error) console.error('[summary-revisions] stage failure state unavailable');
}

export async function POST(request: NextRequest) {
  let supabase: SupabaseClient | null = null;
  let claimed: ClaimedStage | null = null;
  try {
    const authentication = await authorizeAuthenticatedUser();
    if (!authentication.ok) return authentication.response;
    let payload: unknown;
    try {
      payload = await readBoundedJsonBody(request, MAX_SUMMARY_REGENERATION_BODY_BYTES);
    } catch (error) {
      if (error instanceof BoundedJsonBodyError) {
        return NextResponse.json(
          { error: error.code === 'body-too-large' ? 'Permintaan terlalu besar.' : 'Format permintaan tidak valid.' },
          { status: error.code === 'body-too-large' ? 413 : 400 },
        );
      }
      throw error;
    }
    let input;
    try {
      input = parseHierarchicalSummaryStepRequest(payload);
    } catch {
      return NextResponse.json({ error: 'Permintaan tahap tidak valid.' }, { status: 400 });
    }

    supabase = await createClient();
    const { data: claimRows, error: claimError } = await supabase.rpc(
      'claim_hierarchical_summary_stage',
      {
        p_request_id: input.requestId,
        p_client_step_id: input.clientStepId,
        p_retry_stage_id: input.retryStageId,
      },
    );
    if (claimError) {
      const status = claimError.code === 'P0002' ? 404
        : claimError.code === '40001' || claimError.code === '55000' ? 409
          : claimError.code === '54000' ? 429 : 500;
      return NextResponse.json({ error: 'Tahap preview belum dapat diklaim.' }, { status });
    }
    claimed = normalizeClaimRows(claimRows);
    if (!claimed) throw new Error('hierarchical-claim-response-invalid');

    const { data: requestOwner, error: ownerError } = await supabase
      .from('processing_runs')
      .select('summary_id')
      .eq('id', claimed.processingRunId)
      .eq('user_id', authentication.userId)
      .maybeSingle();
    if (ownerError || !requestOwner?.summary_id) throw new Error('hierarchical-request-owner-invalid');
    const requestSummaryId = requestOwner.summary_id;

    if (!claimed.stageId || claimed.stageState !== 'generating') {
      const progress = await readProgress(supabase, input.requestId);
      if (!progress) throw new Error('hierarchical-progress-invalid');
      return NextResponse.json(
        { progress, replayed: claimed.replayed },
        { status: progress.requestState === 'completed' ? 200 : 202 },
      );
    }

    let prompt: string;
    let childClaimSets: GroundedClaimSet[] = [];
    if (claimed.stageKind === 'map') {
      if (claimed.ordinalStart === null || claimed.ordinalEnd === null) {
        throw new Error('hierarchical-map-bounds-invalid');
      }
      const snapshot = await readHierarchicalEvidenceSnapshot(
        supabase,
        requestSummaryId,
        authentication.userId,
        claimed.contextAnnotationIds,
      );
      const stageSegments = snapshot.segments.filter((segment) => (
        segment.ordinal >= claimed!.ordinalStart! && segment.ordinal <= claimed!.ordinalEnd!
      ));
      if (
        stageSegments.length !== claimed.ordinalEnd - claimed.ordinalStart + 1
        || stageSegments[0]?.ordinal !== claimed.ordinalStart
        || stageSegments.at(-1)?.ordinal !== claimed.ordinalEnd
      ) throw new Error('hierarchical-map-evidence-incomplete');
      prompt = buildHierarchicalMapPrompt({ segments: stageSegments });
    } else {
      childClaimSets = claimed.inputStageOutputs.flatMap((inputStage) => {
        const parsed = parseStoredClaimSet(inputStage.output);
        return parsed ? [parsed] : [];
      });
      if (childClaimSets.length !== claimed.inputStageOutputs.length || childClaimSets.length === 0) {
        throw new Error('hierarchical-child-output-invalid');
      }
      prompt = buildHierarchicalReducePrompt({
        inputs: childClaimSets,
        final: claimed.stageKind === 'final',
      });
    }
    if (prompt.length > MAX_CONTEXT_SUMMARY_PROMPT_CHARACTERS) {
      await failStage(supabase, claimed, 'invalid_output');
      return NextResponse.json({ error: 'Tahap melebihi batas prompt yang aman.' }, { status: 413 });
    }

    const providerAccess = await authorizeAiRequest('regenerate');
    if (!providerAccess.ok) {
      const nextStepAt = providerAccess.response.status === 429
        ? new Date(Date.now() + Math.max(
          Number(providerAccess.response.headers.get('Retry-After') ?? CONSERVATIVE_PACING_SECONDS),
          CONSERVATIVE_PACING_SECONDS,
        ) * 1_000).toISOString()
        : null;
      await failStage(
        supabase,
        claimed,
        providerAccess.response.status === 429 ? 'provider_rate_limited' : 'provider_unavailable',
        nextStepAt,
      );
      return providerAccess.response;
    }
    if (providerAccess.userId !== authentication.userId || providerAccess.bypassed) {
      await failStage(supabase, claimed, 'internal_error');
      return NextResponse.json({ error: 'Batas pemilik request berubah.' }, { status: 403 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      await failStage(supabase, claimed, 'provider_unavailable');
      return NextResponse.json({ error: 'Layanan preview belum tersedia.' }, { status: 503 });
    }

    let providerResponse: Response;
    try {
      providerResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_LLM_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          reasoning_effort: 'low',
          max_tokens: MAX_HIERARCHICAL_STAGE_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(STAGE_TIMEOUT_MS),
      });
    } catch {
      await failStage(supabase, claimed, 'provider_timeout_ambiguous');
      return NextResponse.json(
        { code: 'provider_timeout_ambiguous', error: 'Status request AI belum pasti. Tahap tidak diulang otomatis.' },
        { status: 504 },
      );
    }

    const nextStepAt = nextStepAtFromHeaders(providerResponse.headers);
    if (!providerResponse.ok) {
      const failureCode: HierarchicalStageFailureCode = providerResponse.status === 429
        ? 'provider_rate_limited'
        : providerResponse.status === 503 ? 'provider_unavailable' : 'provider_failed';
      await failStage(supabase, claimed, failureCode, providerResponse.status === 429 ? nextStepAt : null);
      console.error('[summary-revisions] hierarchical provider request failed', {
        stage: claimed.stageIndex,
        kind: claimed.stageKind,
        status: providerResponse.status,
      });
      return NextResponse.json(
        { error: providerResponse.status === 429 ? 'Batas provider tercapai. Tahap menunggu retry eksplisit.' : 'Tahap preview belum berhasil.' },
        { status: providerResponse.status === 429 || providerResponse.status === 503 ? providerResponse.status : 502 },
      );
    }

    let providerData: unknown;
    try {
      providerData = await providerResponse.json();
    } catch {
      await failStage(supabase, claimed, 'invalid_output');
      return NextResponse.json({ error: 'Hasil tahap belum dapat dibaca.' }, { status: 502 });
    }
    const usage = parseGroqCompletionUsage(providerData);
    await recordAiUsageSafely(createAiUsageEvent({
      userId: authentication.userId,
      requestId: claimed.attemptId!,
      operation: 'regenerate',
      stage: 'generation',
      model: GROQ_LLM_MODEL,
      providerRequestId: parseGroqProviderRequestId(providerData),
      ...(usage ?? {}),
    }), { bypassed: false });

    const content = completionContent(providerData);
    if (!content) {
      await failStage(supabase, claimed, 'invalid_output');
      return NextResponse.json({ error: 'Hasil tahap belum selesai dengan utuh.' }, { status: 502 });
    }
    const childClaims = childClaimSets.flatMap((set) => set.claims);
    let storedOutput: string;
    let groundingManifest: Record<string, unknown> | null = null;
    if (claimed.stageKind === 'map') {
      const normalized = normalizeMapStageOutput(content, claimed.ordinalStart!, claimed.ordinalEnd!);
      if (!normalized) {
        await failStage(supabase, claimed, 'invalid_output');
        return NextResponse.json({ error: 'Klaim tahap tidak memiliki sumber yang valid.' }, { status: 502 });
      }
      storedOutput = serializeGroundedClaimSet(normalized);
    } else if (claimed.stageKind === 'reduce') {
      const normalized = normalizeReduceStageOutput(content, childClaims);
      if (!normalized) {
        await failStage(supabase, claimed, 'invalid_output');
        return NextResponse.json({ error: 'Reduksi tahap kehilangan rujukan sumber.' }, { status: 502 });
      }
      storedOutput = serializeGroundedClaimSet(normalized);
    } else {
      const normalized = normalizeFinalStageOutput(content, childClaims);
      if (!normalized) {
        await failStage(supabase, claimed, 'invalid_output');
        return NextResponse.json({ error: 'Rangkuman akhir belum memiliki grounding yang valid.' }, { status: 502 });
      }
      storedOutput = normalized.markdown;
      groundingManifest = JSON.parse(serializeGroundedClaimSet(normalized.groundingManifest));
    }

    const { error: completionError } = await supabase.rpc(
      'complete_hierarchical_summary_stage',
      {
        p_stage_id: claimed.stageId,
        p_attempt_id: claimed.attemptId,
        p_output_text: storedOutput,
        p_output_digest: createHash('sha256').update(storedOutput).digest('hex'),
        p_grounding_manifest: groundingManifest,
        p_prompt_version: HIERARCHICAL_PROMPT_VERSION,
        p_provider: 'groq',
        p_model: GROQ_LLM_MODEL,
        p_next_step_at: nextStepAt,
      },
    );
    if (completionError) {
      await failStage(supabase, claimed, 'internal_error');
      throw new Error('hierarchical-stage-persistence-failed');
    }

    const progress = await readProgress(supabase, input.requestId);
    if (!progress) throw new Error('hierarchical-progress-invalid');
    return NextResponse.json({ progress, replayed: false });
  } catch {
    if (supabase && claimed?.stageId && claimed.attemptId) {
      await failStage(supabase, claimed, 'internal_error');
    }
    console.error('[summary-revisions] hierarchical stage failed');
    return NextResponse.json({ error: 'Tahap preview mengalami kesalahan internal.' }, { status: 500 });
  }
}
