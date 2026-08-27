export const MAX_SUMMARY_REVISIONS = 25;
export const MAX_SUMMARY_REVISION_CONTENT_CHARACTERS = 100_000;
export const MAX_SUMMARY_REGENERATION_BODY_BYTES = 4_096;
export const CONTEXT_SUMMARY_PROMPT_VERSION = 'context-summary-v1';

export type SummaryRevisionState = 'candidate' | 'accepted';
export type SummaryRevisionSource = 'original' | 'context_regeneration';
export type SummaryRevisionApplyIntent = 'apply_candidate' | 'restore_accepted';
export type SummaryRegenerationFailureCode =
  | 'provider_unavailable'
  | 'provider_failed'
  | 'provider_timeout'
  | 'invalid_output'
  | 'generation_timeout'
  | 'internal_error';

export interface SummaryRevision {
  id: string;
  version: number;
  parentRevisionId: string | null;
  sourceKind: SummaryRevisionSource;
  state: SummaryRevisionState;
  content: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface SummaryRegenerationRequest {
  summaryId: string;
  clientRequestId: string;
}

export interface SummaryRevisionApplyRequest {
  summaryId: string;
  revisionId: string;
  expectedActiveRevisionId: string | null;
  expectedRevisionEpoch: number;
  intent: SummaryRevisionApplyIntent;
}

export interface SummaryRegenerationReservation {
  requestId: string;
  requestState: 'generating' | 'completed' | 'failed';
  shouldGenerate: boolean;
  processingRunId: string;
  baseRevisionId: string;
  baseSummaryContent: string;
  activeRevisionId: string;
  revisionEpoch: number;
  contextAnnotationIds: number[];
  candidate: SummaryRevision | null;
  failureCode: SummaryRegenerationFailureCode | null;
}

export interface AppliedSummaryRevision {
  summaryId: string;
  summaryContent: string;
  activeRevisionId: string;
  revisionEpoch: number;
  revisionVersion: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_STATES = new Set<SummaryRevisionState>(['candidate', 'accepted']);
const REVISION_SOURCES = new Set<SummaryRevisionSource>([
  'original',
  'context_regeneration',
]);
const APPLY_INTENTS = new Set<SummaryRevisionApplyIntent>([
  'apply_candidate',
  'restore_accepted',
]);
const REQUEST_STATES = new Set<SummaryRegenerationReservation['requestState']>([
  'generating',
  'completed',
  'failed',
]);
const FAILURE_CODES = new Set<SummaryRegenerationFailureCode>([
  'provider_unavailable',
  'provider_failed',
  'provider_timeout',
  'invalid_output',
  'generation_timeout',
  'internal_error',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
    ? value.trim()
    : null;
}

function positiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number | null {
  const numeric = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
  return typeof numeric === 'number'
    && Number.isSafeInteger(numeric)
    && numeric > 0
    && numeric <= maximum
    ? numeric
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const numeric = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
  return typeof numeric === 'number'
    && Number.isSafeInteger(numeric)
    && numeric >= 0
    ? numeric
    : null;
}

function requestId(value: unknown): string | null {
  const numeric = positiveInteger(value);
  return numeric === null ? null : String(numeric);
}

function nonEmptyText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return uuid(value) ?? undefined;
}

export function parseSummaryRegenerationRequest(
  value: unknown,
): SummaryRegenerationRequest {
  const body = record(value);
  const summaryId = uuid(body?.summaryId);
  const clientRequestId = uuid(body?.clientRequestId);
  if (!summaryId || !clientRequestId) {
    throw new Error('Invalid summary regeneration request.');
  }
  return { summaryId, clientRequestId };
}

export function parseSummaryRevisionApplyRequest(
  value: unknown,
): SummaryRevisionApplyRequest {
  const body = record(value);
  const summaryId = uuid(body?.summaryId);
  const revisionId = uuid(body?.revisionId);
  const expectedActiveRevisionId = nullableUuid(body?.expectedActiveRevisionId);
  const expectedRevisionEpoch = nonNegativeInteger(body?.expectedRevisionEpoch);
  const intent = body?.intent;

  if (
    !summaryId
    || !revisionId
    || expectedActiveRevisionId === undefined
    || expectedRevisionEpoch === null
    || typeof intent !== 'string'
    || !APPLY_INTENTS.has(intent as SummaryRevisionApplyIntent)
  ) {
    throw new Error('Invalid summary revision application.');
  }

  return {
    summaryId,
    revisionId,
    expectedActiveRevisionId,
    expectedRevisionEpoch,
    intent: intent as SummaryRevisionApplyIntent,
  };
}

export function normalizeSummaryRevision(value: unknown): SummaryRevision | null {
  const row = record(value);
  if (!row) return null;

  const id = uuid(row.id ?? row.revision_id);
  const version = positiveInteger(row.version ?? row.revision_version, MAX_SUMMARY_REVISIONS);
  const parentRevisionId = nullableUuid(row.parent_revision_id ?? row.parentRevisionId);
  const sourceKind = row.source_kind ?? row.sourceKind;
  const state = row.state ?? row.revision_state;
  const content = nonEmptyText(
    row.content ?? row.revision_content,
    MAX_SUMMARY_REVISION_CONTENT_CHARACTERS,
  );
  const createdValue = row.created_at ?? row.createdAt;
  const acceptedValue = row.accepted_at ?? row.acceptedAt;
  const createdAt = typeof createdValue === 'string' ? createdValue : '';
  const acceptedAt = acceptedValue === null || acceptedValue === undefined
    ? null
    : typeof acceptedValue === 'string' ? acceptedValue : undefined;

  if (
    !id
    || version === null
    || parentRevisionId === undefined
    || typeof sourceKind !== 'string'
    || !REVISION_SOURCES.has(sourceKind as SummaryRevisionSource)
    || typeof state !== 'string'
    || !REVISION_STATES.has(state as SummaryRevisionState)
    || !content
    || !createdAt
    || acceptedAt === undefined
  ) {
    return null;
  }

  return {
    id,
    version,
    parentRevisionId,
    sourceKind: sourceKind as SummaryRevisionSource,
    state: state as SummaryRevisionState,
    content,
    createdAt,
    acceptedAt,
  };
}

export function normalizeSummaryRegenerationReservation(
  value: unknown,
): SummaryRegenerationReservation | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = record(value[0]);
  if (!row) return null;

  const normalizedRequestId = requestId(row.request_id);
  const requestState = row.request_state;
  const processingRunId = uuid(row.processing_run_id);
  const baseRevisionId = uuid(row.base_revision_id);
  const baseSummaryContent = nonEmptyText(
    row.base_summary_content,
    MAX_SUMMARY_REVISION_CONTENT_CHARACTERS,
  );
  const activeRevisionId = uuid(row.active_revision_id);
  const revisionEpoch = nonNegativeInteger(row.revision_epoch);
  const annotationIds = Array.isArray(row.context_annotation_ids)
    ? row.context_annotation_ids.map((candidate) => positiveInteger(candidate))
    : null;
  const failureCode = row.failure_code === null || row.failure_code === undefined
    ? null
    : typeof row.failure_code === 'string'
      && FAILURE_CODES.has(row.failure_code as SummaryRegenerationFailureCode)
      ? row.failure_code as SummaryRegenerationFailureCode
      : undefined;

  if (
    !normalizedRequestId
    || typeof requestState !== 'string'
    || !REQUEST_STATES.has(requestState as SummaryRegenerationReservation['requestState'])
    || typeof row.should_generate !== 'boolean'
    || !processingRunId
    || !baseRevisionId
    || !baseSummaryContent
    || !activeRevisionId
    || revisionEpoch === null
    || !annotationIds
    || annotationIds.length > 5_000
    || annotationIds.some((candidate) => candidate === null)
    || failureCode === undefined
  ) {
    return null;
  }

  const candidateId = nullableUuid(row.candidate_revision_id);
  if (candidateId === undefined) return null;
  let candidate: SummaryRevision | null = null;
  if (candidateId) {
    const candidateState = row.candidate_state;
    if (
      typeof candidateState !== 'string'
      || !REVISION_STATES.has(candidateState as SummaryRevisionState)
    ) return null;
    candidate = normalizeSummaryRevision({
      revision_id: candidateId,
      revision_version: row.candidate_version,
      revision_content: row.candidate_content,
      revision_state: candidateState,
      parent_revision_id: baseRevisionId,
      source_kind: 'context_regeneration',
      created_at: row.candidate_created_at,
      accepted_at: row.candidate_accepted_at ?? null,
    });
    if (!candidate) return null;
  }

  return {
    requestId: normalizedRequestId,
    requestState: requestState as SummaryRegenerationReservation['requestState'],
    shouldGenerate: row.should_generate,
    processingRunId,
    baseRevisionId,
    baseSummaryContent,
    activeRevisionId,
    revisionEpoch,
    contextAnnotationIds: annotationIds as number[],
    candidate,
    failureCode,
  };
}

export function normalizeCompletedSummaryRevision(value: unknown): SummaryRevision | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = record(value[0]);
  if (!row) return null;
  return normalizeSummaryRevision({
    revision_id: row.revision_id,
    revision_version: row.revision_version,
    revision_content: row.revision_content,
    revision_state: row.revision_state,
    parent_revision_id: row.parent_revision_id,
    source_kind: 'context_regeneration',
    created_at: row.created_at,
    accepted_at: null,
  });
}

export function normalizeAppliedSummaryRevision(
  value: unknown,
): AppliedSummaryRevision | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = record(value[0]);
  if (!row) return null;
  const summaryId = uuid(row.summary_id ?? row.summaryId);
  const summaryContent = nonEmptyText(
    row.summary_content ?? row.summaryContent,
    MAX_SUMMARY_REVISION_CONTENT_CHARACTERS,
  );
  const activeRevisionId = uuid(row.active_revision_id ?? row.activeRevisionId);
  const revisionEpoch = nonNegativeInteger(row.revision_epoch ?? row.revisionEpoch);
  const revisionVersion = positiveInteger(
    row.revision_version ?? row.revisionVersion,
    MAX_SUMMARY_REVISIONS,
  );
  if (
    !summaryId
    || !summaryContent
    || !activeRevisionId
    || revisionEpoch === null
    || revisionVersion === null
  ) {
    return null;
  }
  return {
    summaryId,
    summaryContent,
    activeRevisionId,
    revisionEpoch,
    revisionVersion,
  };
}

export function getSummaryRevisionErrorCopy(
  status: number | null,
  code?: string | null,
): { title: string; detail: string } {
  if (status === 401) {
    return { title: 'Sesi perlu diperbarui', detail: 'Masuk lagi sebelum memperbarui rangkuman.' };
  }
  if (status === 404) {
    return { title: 'Bukti sumber belum tersedia', detail: 'Rangkuman ini belum memiliki transkrip bertanda waktu yang dapat dipakai.' };
  }
  if (status === 409 || code === 'revision-conflict') {
    return { title: 'Konteks sudah berubah', detail: 'Keputusan atau versi aktif berubah. Buat preview baru agar hasil tetap sesuai sumber terbaru.' };
  }
  if (status === 429) {
    return { title: 'Batas pembaruan tercapai', detail: 'Tunggu sebentar sebelum membuat preview rangkuman baru.' };
  }
  if (status === 413) {
    return { title: 'Materi terlalu panjang', detail: 'Transkrip melampaui batas pembaruan sinkron saat ini.' };
  }
  if (status === 502 || status === 504) {
    return { title: 'Preview belum selesai', detail: 'Versi aktif tetap aman. Coba lagi tanpa menerapkan perubahan apa pun.' };
  }
  if (status === 503) {
    return { title: 'Layanan preview belum tersedia', detail: 'Versi aktif tetap aman. Coba lagi setelah layanan AI kembali tersedia.' };
  }
  if (status === null) {
    return { title: 'Koneksi terputus', detail: 'Versi aktif tetap aman. Periksa koneksi lalu cek request yang sama lagi.' };
  }
  return { title: 'Pembaruan belum tersedia', detail: 'Versi aktif tidak berubah. Coba lagi beberapa saat lagi.' };
}
