import type {
  TranscriptQualityStatus,
  TranscriptQualityWarning,
  TranscriptQualityWarningCode,
  TranscriptQualitySeverity,
} from './contract';

export const TRANSCRIPT_EVIDENCE_PAGE_SIZE = 50;
export const LOW_CONFIDENCE_THRESHOLD = -0.5;
export const HIGH_NO_SPEECH_THRESHOLD = 0.6;

export type TranscriptEvidenceFilter = 'all' | 'unclear';

export interface TranscriptEvidenceRun {
  id: string;
  qualityStatus: TranscriptQualityStatus;
  qualityReport: {
    durationSec: number | null;
    wordCount: number | null;
    wordsPerMinute: number | null;
    warnings: TranscriptQualityWarning[];
  };
  segmentCount: number;
  transcriptCharacterCount: number;
  completedAt: string;
}

export interface TranscriptEvidenceSegment {
  id: number;
  ordinal: number;
  startMs: number;
  endMs: number;
  text: string;
  averageLogProbability: number | null;
  noSpeechProbability: number | null;
  reviewReasons: Array<'low-confidence' | 'high-no-speech'>;
}

export interface TranscriptEvidencePage {
  run: TranscriptEvidenceRun;
  segments: TranscriptEvidenceSegment[];
  total: number;
  page: number;
  pageSize: number;
}

const QUALITY_STATUSES = new Set<TranscriptQualityStatus>(['good', 'review', 'poor']);
const WARNING_CODES = new Set<TranscriptQualityWarningCode>([
  'too-few-words',
  'low-speech-density',
  'provider-low-confidence',
  'provider-high-no-speech',
  'repetitive-filler',
  'missing-timestamps',
]);
const WARNING_SEVERITIES = new Set<TranscriptQualitySeverity>(['warning', 'critical']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric >= 0 ? Math.round(numeric) : null;
}

function normalizeWarnings(value: unknown): TranscriptQualityWarning[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 12).flatMap((candidate) => {
    const warning = record(candidate);
    if (!warning) return [];

    const code = warning.code;
    const severity = warning.severity;
    const message = typeof warning.message === 'string'
      ? warning.message.trim().slice(0, 320)
      : '';

    if (
      typeof code !== 'string'
      || !WARNING_CODES.has(code as TranscriptQualityWarningCode)
      || typeof severity !== 'string'
      || !WARNING_SEVERITIES.has(severity as TranscriptQualitySeverity)
      || !message
    ) {
      return [];
    }

    return [{
      code: code as TranscriptQualityWarningCode,
      severity: severity as TranscriptQualitySeverity,
      message,
    }];
  });
}

export function normalizeTranscriptEvidenceRun(value: unknown): TranscriptEvidenceRun | null {
  const row = record(value);
  if (!row) return null;

  const id = typeof row.id === 'string' ? row.id : '';
  const qualityStatus = row.quality_status;
  const qualityReport = record(row.quality_report) ?? {};
  const segmentCount = nonNegativeInteger(row.segment_count);
  const transcriptCharacterCount = nonNegativeInteger(row.transcript_character_count);
  const completedAt = typeof row.completed_at === 'string' ? row.completed_at : '';

  if (
    !id
    || typeof qualityStatus !== 'string'
    || !QUALITY_STATUSES.has(qualityStatus as TranscriptQualityStatus)
    || segmentCount === null
    || transcriptCharacterCount === null
    || !completedAt
  ) {
    return null;
  }

  return {
    id,
    qualityStatus: qualityStatus as TranscriptQualityStatus,
    qualityReport: {
      durationSec: finiteNumber(qualityReport.durationSec),
      wordCount: nonNegativeInteger(qualityReport.wordCount),
      wordsPerMinute: finiteNumber(qualityReport.wordsPerMinute),
      warnings: normalizeWarnings(qualityReport.warnings),
    },
    segmentCount,
    transcriptCharacterCount,
    completedAt,
  };
}

export function getTranscriptSegmentReviewReasons(
  averageLogProbability: number | null,
  noSpeechProbability: number | null,
): TranscriptEvidenceSegment['reviewReasons'] {
  const reasons: TranscriptEvidenceSegment['reviewReasons'] = [];
  if (
    averageLogProbability !== null
    && averageLogProbability <= LOW_CONFIDENCE_THRESHOLD
  ) {
    reasons.push('low-confidence');
  }
  if (
    noSpeechProbability !== null
    && noSpeechProbability >= HIGH_NO_SPEECH_THRESHOLD
  ) {
    reasons.push('high-no-speech');
  }
  return reasons;
}

export function normalizeTranscriptEvidenceSegment(
  value: unknown,
): TranscriptEvidenceSegment | null {
  const row = record(value);
  if (!row) return null;

  const id = nonNegativeInteger(row.id);
  const ordinal = nonNegativeInteger(row.ordinal);
  const startMs = nonNegativeInteger(row.start_ms);
  const endMs = nonNegativeInteger(row.end_ms);
  const text = typeof row.text === 'string' ? row.text.trim().slice(0, 20_000) : '';
  const averageLogProbability = finiteNumber(row.average_log_probability);
  const noSpeechProbability = finiteNumber(row.no_speech_probability);

  if (
    id === null
    || ordinal === null
    || startMs === null
    || endMs === null
    || endMs < startMs
    || !text
  ) {
    return null;
  }

  return {
    id,
    ordinal,
    startMs,
    endMs,
    text,
    averageLogProbability,
    noSpeechProbability,
    reviewReasons: getTranscriptSegmentReviewReasons(
      averageLogProbability,
      noSpeechProbability,
    ),
  };
}

export function formatTranscriptTimecode(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
