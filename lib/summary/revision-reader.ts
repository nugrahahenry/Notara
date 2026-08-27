'use client';

import { supabase } from '@/lib/supabase';
import {
  MAX_SUMMARY_REVISIONS,
  normalizeAppliedSummaryRevision,
  normalizeHierarchicalSummaryProgress,
  normalizeSummaryRevision,
  type AppliedSummaryRevision,
  type HierarchicalSummaryProgress,
  type SummaryRevision,
  type SummaryRevisionApplyRequest,
} from './revisions';

export interface SummaryRegenerationPlanView {
  mode: 'single' | 'hierarchical' | 'unsupported';
  planVersion: string;
  planDigest: string;
  plannedCalls: number;
  sourceCharacters: number;
  unsupportedReason: string | null;
  pacingSeconds: number;
  destination: 'Groq';
  progress: HierarchicalSummaryProgress | null;
}

const REVISION_FIELDS = [
  'id',
  'version',
  'parent_revision_id',
  'source_kind',
  'state',
  'content',
  'created_at',
  'accepted_at',
].join(',');

const SUMMARY_REGENERATION_PLAN_TIMEOUT_MS = 15_000;
const PLAN_TIMEOUT_REASON = 'summary-regeneration-plan-timeout';

export interface GeneratedSummaryRevision {
  candidate: SummaryRevision;
  activeRevisionId: string;
  revisionEpoch: number;
  replayed: boolean;
}

export class SummaryRevisionRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, status: number | null, code: string | null = null) {
    super(message);
    this.name = 'SummaryRevisionRequestError';
    this.status = status;
    this.code = code;
  }
}

async function readResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function postRevisionRequest(
  path: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch {
    throw new SummaryRevisionRequestError('summary-revision-network-failed', null);
  }
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new SummaryRevisionRequestError(
      typeof body.error === 'string' ? body.error : 'summary-revision-request-failed',
      response.status,
      typeof body.code === 'string' ? body.code : null,
    );
  }
  return { response, body };
}

export async function readSummaryRegenerationPlan(
  summaryId: string,
  signal?: AbortSignal,
): Promise<SummaryRegenerationPlanView> {
  const controller = new AbortController();
  const forwardCallerAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardCallerAbort();
  else signal?.addEventListener('abort', forwardCallerAbort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(PLAN_TIMEOUT_REASON),
    SUMMARY_REGENERATION_PLAN_TIMEOUT_MS,
  );
  let body: Record<string, unknown>;
  try {
    ({ body } = await postRevisionRequest(
      '/api/summary-revisions/plan',
      { summaryId },
      controller.signal,
    ));
  } catch (error) {
    if (controller.signal.reason === PLAN_TIMEOUT_REASON) {
      throw new SummaryRevisionRequestError(
        'summary-regeneration-plan-timeout',
        null,
        'summary_regeneration_plan_timeout',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardCallerAbort);
  }
  const mode = body.mode;
  const planVersion = typeof body.planVersion === 'string' ? body.planVersion : '';
  const planDigest = typeof body.planDigest === 'string' ? body.planDigest : '';
  const plannedCalls = Number(body.plannedCalls);
  const sourceCharacters = Number(body.sourceCharacters);
  const unsupportedReason = body.unsupportedReason === null
    ? null
    : typeof body.unsupportedReason === 'string' ? body.unsupportedReason : undefined;
  const pacingSeconds = Number(body.pacingSeconds);
  const progress = body.progress === null || body.progress === undefined
    ? null
    : normalizeHierarchicalSummaryProgress([body.progress]);
  if (
    (mode !== 'single' && mode !== 'hierarchical' && mode !== 'unsupported')
    || !planVersion
    || !/^[0-9a-f]{64}$/.test(planDigest)
    || !Number.isSafeInteger(plannedCalls)
    || plannedCalls < 0
    || plannedCalls > 24
    || !Number.isSafeInteger(sourceCharacters)
    || sourceCharacters < 0
    || unsupportedReason === undefined
    || !Number.isSafeInteger(pacingSeconds)
    || pacingSeconds < 1
    || body.destination !== 'Groq'
    || (body.progress && !progress)
  ) throw new SummaryRevisionRequestError('summary-revision-response-invalid', 502);
  return {
    mode,
    planVersion,
    planDigest,
    plannedCalls,
    sourceCharacters,
    unsupportedReason,
    pacingSeconds,
    destination: 'Groq',
    progress,
  };
}

export async function startHierarchicalSummaryRevision({
  summaryId,
  clientRequestId,
  planDigest,
}: {
  summaryId: string;
  clientRequestId: string;
  planDigest: string;
}): Promise<HierarchicalSummaryProgress> {
  const { body } = await postRevisionRequest('/api/summary-revisions/start', {
    summaryId,
    clientRequestId,
    planDigest,
  });
  const progress = normalizeHierarchicalSummaryProgress([body.progress]);
  if (!progress) throw new SummaryRevisionRequestError('summary-revision-response-invalid', 502);
  return progress;
}

export async function generateHierarchicalSummaryStep({
  requestId,
  clientStepId,
  retryStageId = null,
}: {
  requestId: string;
  clientStepId: string;
  retryStageId?: string | null;
}): Promise<HierarchicalSummaryProgress> {
  const { body } = await postRevisionRequest('/api/summary-revisions/generate-step', {
    requestId,
    clientStepId,
    intent: retryStageId ? 'retry_failed' : 'continue',
    retryStageId,
  });
  const progress = normalizeHierarchicalSummaryProgress([body.progress]);
  if (!progress) throw new SummaryRevisionRequestError('summary-revision-response-invalid', 502);
  return progress;
}

export async function readSummaryRevisionHistory(
  summaryId: string,
): Promise<SummaryRevision[]> {
  const { data, error } = await supabase
    .from('summary_revisions')
    .select(REVISION_FIELDS)
    .eq('summary_id', summaryId)
    .order('version', { ascending: false })
    .limit(MAX_SUMMARY_REVISIONS);

  if (error) throw new Error('summary-revision-history-unavailable');
  return (data ?? []).flatMap((row) => {
    const revision = normalizeSummaryRevision(row);
    return revision ? [revision] : [];
  });
}

export async function generateSummaryRevision({
  summaryId,
  clientRequestId,
  signal,
}: {
  summaryId: string;
  clientRequestId: string;
  signal?: AbortSignal;
}): Promise<GeneratedSummaryRevision> {
  let response: Response;
  try {
    response = await fetch('/api/summary-revisions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaryId, clientRequestId }),
      signal,
    });
  } catch {
    throw new SummaryRevisionRequestError('summary-revision-network-failed', null);
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new SummaryRevisionRequestError(
      typeof body.error === 'string' ? body.error : 'summary-revision-generation-failed',
      response.status,
      typeof body.code === 'string' ? body.code : null,
    );
  }
  if (response.status === 202) {
    throw new SummaryRevisionRequestError(
      'summary-revision-still-generating',
      202,
      'generation-in-progress',
    );
  }

  const candidate = normalizeSummaryRevision(body.candidate);
  const activeRevisionId = typeof body.activeRevisionId === 'string'
    ? body.activeRevisionId
    : '';
  const revisionEpoch = typeof body.revisionEpoch === 'number'
    && Number.isSafeInteger(body.revisionEpoch)
    && body.revisionEpoch >= 0
    ? body.revisionEpoch
    : null;
  if (!candidate || !activeRevisionId || revisionEpoch === null) {
    throw new SummaryRevisionRequestError('summary-revision-response-invalid', 502);
  }

  return {
    candidate,
    activeRevisionId,
    revisionEpoch,
    replayed: body.replayed === true,
  };
}

export async function applySummaryRevision(
  request: SummaryRevisionApplyRequest,
): Promise<AppliedSummaryRevision> {
  let response: Response;
  try {
    response = await fetch('/api/summary-revisions/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new SummaryRevisionRequestError('summary-revision-network-failed', null);
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new SummaryRevisionRequestError(
      typeof body.error === 'string' ? body.error : 'summary-revision-apply-failed',
      response.status,
      typeof body.code === 'string' ? body.code : null,
    );
  }

  const applied = normalizeAppliedSummaryRevision([body]);
  if (!applied) {
    throw new SummaryRevisionRequestError('summary-revision-response-invalid', 502);
  }
  return applied;
}
