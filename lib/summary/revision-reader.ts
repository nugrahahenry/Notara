'use client';

import { supabase } from '@/lib/supabase';
import {
  MAX_SUMMARY_REVISIONS,
  normalizeAppliedSummaryRevision,
  normalizeSummaryRevision,
  type AppliedSummaryRevision,
  type SummaryRevision,
  type SummaryRevisionApplyRequest,
} from './revisions';

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
