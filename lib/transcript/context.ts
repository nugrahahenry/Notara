export const MAX_TRANSCRIPT_CONTEXT_SEGMENTS = 50;
export const MAX_TRANSCRIPT_CONTEXT_REASON_CHARACTERS = 180;

export type TranscriptContextLabel =
  | 'lecturer_explanation'
  | 'student_question'
  | 'class_discussion'
  | 'side_conversation'
  | 'unknown';

export type TranscriptSummaryTreatment = 'include' | 'deprioritize';
export type TranscriptContextConfidence = 'low' | 'medium' | 'high';

export interface TranscriptContextSuggestion {
  segmentId: number;
  proposedContext: TranscriptContextLabel;
  proposedTreatment: TranscriptSummaryTreatment;
  confidence: TranscriptContextConfidence;
  reason: string;
}

export interface TranscriptContextAnnotation {
  id: number;
  segmentId: number;
  version: number;
  contextLabel: TranscriptContextLabel;
  summaryTreatment: TranscriptSummaryTreatment;
  createdAt: string;
}

export interface TranscriptContextRequest {
  summaryId: string;
  segmentIds: number[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEXT_LABELS = new Set<TranscriptContextLabel>([
  'lecturer_explanation',
  'student_question',
  'class_discussion',
  'side_conversation',
  'unknown',
]);
const SUMMARY_TREATMENTS = new Set<TranscriptSummaryTreatment>([
  'include',
  'deprioritize',
]);
const CONFIDENCE_LEVELS = new Set<TranscriptContextConfidence>([
  'low',
  'medium',
  'high',
]);
const FALLBACK_REASON = 'Nalira belum yakin dengan konteks bagian ini.';

export function isTranscriptContextLabel(value: unknown): value is TranscriptContextLabel {
  return typeof value === 'string'
    && CONTEXT_LABELS.has(value as TranscriptContextLabel);
}

export function isTranscriptSummaryTreatment(
  value: unknown,
): value is TranscriptSummaryTreatment {
  return typeof value === 'string'
    && SUMMARY_TREATMENTS.has(value as TranscriptSummaryTreatment);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null;
}

function neutralSuggestion(segmentId: number): TranscriptContextSuggestion {
  return {
    segmentId,
    proposedContext: 'unknown',
    proposedTreatment: 'include',
    confidence: 'low',
    reason: FALLBACK_REASON,
  };
}

export function parseTranscriptContextRequest(value: unknown): TranscriptContextRequest {
  const body = record(value);
  const summaryId = typeof body?.summaryId === 'string' ? body.summaryId.trim() : '';
  if (!UUID_PATTERN.test(summaryId)) {
    throw new Error('Invalid summary ID.');
  }

  if (!Array.isArray(body?.segmentIds)) {
    throw new Error('Invalid segment IDs.');
  }

  const segmentIds: number[] = [];
  const seen = new Set<number>();
  for (const candidate of body.segmentIds) {
    const segmentId = positiveInteger(candidate);
    if (segmentId === null) throw new Error('Invalid segment ID.');
    if (!seen.has(segmentId)) {
      seen.add(segmentId);
      segmentIds.push(segmentId);
    }
  }

  if (
    segmentIds.length === 0
    || segmentIds.length > MAX_TRANSCRIPT_CONTEXT_SEGMENTS
  ) {
    throw new Error('Invalid segment count.');
  }

  return { summaryId, segmentIds };
}

export function normalizeTranscriptContextSuggestions(
  value: unknown,
  requestedSegmentIds: number[],
): TranscriptContextSuggestion[] {
  const requested = requestedSegmentIds
    .filter((segmentId, index, values) => (
      positiveInteger(segmentId) !== null
      && values.indexOf(segmentId) === index
    ))
    .slice(0, MAX_TRANSCRIPT_CONTEXT_SEGMENTS);
  const allowed = new Set(requested);
  const parsed = new Map<number, TranscriptContextSuggestion>();
  const candidates = record(value)?.suggestions;

  if (Array.isArray(candidates)) {
    for (const candidate of candidates.slice(0, MAX_TRANSCRIPT_CONTEXT_SEGMENTS * 2)) {
      const row = record(candidate);
      const segmentId = positiveInteger(row?.segment_id);
      if (segmentId === null || !allowed.has(segmentId) || parsed.has(segmentId)) continue;

      const context = row?.context;
      const treatment = row?.treatment;
      const confidence = row?.confidence;
      const reason = typeof row?.reason === 'string'
        ? row.reason.trim().slice(0, MAX_TRANSCRIPT_CONTEXT_REASON_CHARACTERS)
        : '';

      if (
        typeof context !== 'string'
        || !isTranscriptContextLabel(context)
        || typeof treatment !== 'string'
        || !isTranscriptSummaryTreatment(treatment)
        || typeof confidence !== 'string'
        || !CONFIDENCE_LEVELS.has(confidence as TranscriptContextConfidence)
        || !reason
      ) {
        parsed.set(segmentId, neutralSuggestion(segmentId));
        continue;
      }

      parsed.set(segmentId, {
        segmentId,
        proposedContext: context as TranscriptContextLabel,
        proposedTreatment: treatment as TranscriptSummaryTreatment,
        confidence: confidence as TranscriptContextConfidence,
        reason,
      });
    }
  }

  return requested.map((segmentId) => parsed.get(segmentId) ?? neutralSuggestion(segmentId));
}

export function normalizeTranscriptContextAnnotation(
  value: unknown,
): TranscriptContextAnnotation | null {
  const row = record(value);
  const id = positiveInteger(row?.id);
  const segmentId = positiveInteger(row?.segment_id);
  const version = positiveInteger(row?.version);
  const contextLabel = row?.context_label;
  const summaryTreatment = row?.summary_treatment;
  const createdAt = typeof row?.created_at === 'string' ? row.created_at : '';

  if (
    id === null
    || segmentId === null
    || version === null
    || typeof contextLabel !== 'string'
    || !isTranscriptContextLabel(contextLabel)
    || typeof summaryTreatment !== 'string'
    || !isTranscriptSummaryTreatment(summaryTreatment)
    || !createdAt
  ) {
    return null;
  }

  return {
    id,
    segmentId,
    version,
    contextLabel: contextLabel as TranscriptContextLabel,
    summaryTreatment: summaryTreatment as TranscriptSummaryTreatment,
    createdAt,
  };
}
