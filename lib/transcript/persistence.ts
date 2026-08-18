import type {
  TranscriptQualityReport,
  TranscriptSegment,
} from './contract';

export const MAX_TRANSCRIPT_EVIDENCE_SEGMENTS = 5_000;
const MAX_SEGMENT_TEXT_CHARACTERS = 20_000;
const MAX_TRANSCRIPT_EVIDENCE_TEXT_CHARACTERS = 500_000;
const MAX_REQUEST_ID_CHARACTERS = 128;
const MAX_MODEL_NAME_CHARACTERS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TranscriptProcessingMetadata {
  requestId: string;
  provider: 'groq';
  transcriptionModel: string | null;
  summaryModel: string | null;
}

export interface TranscriptEvidenceInput {
  clientRequestId: string;
  provider: 'groq';
  transcriptionModel: string;
  summaryModel: string | null;
  quality: TranscriptQualityReport;
  segments: TranscriptSegment[];
}

export interface TranscriptEvidenceRpcPayload {
  p_summary_id: string;
  p_client_request_id: string;
  p_provider: 'groq';
  p_transcription_model: string;
  p_summary_model: string | null;
  p_quality: TranscriptQualityReport;
  p_segments: Array<{
    start_ms: number;
    end_ms: number;
    text: string;
    average_log_probability: number | null;
    no_speech_probability: number | null;
  }>;
}

function requireBoundedText(
  value: string,
  field: string,
  maxCharacters: number,
): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxCharacters) {
    throw new Error(`${field} is missing or too long.`);
  }
  return normalized;
}

function normalizeNullableProbability(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Transcript evidence probability is invalid.');
  }
  return value;
}

function normalizeNullableFiniteNumber(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) {
    throw new Error('Transcript evidence confidence is invalid.');
  }
  return value;
}

export function offsetTranscriptSegments(
  segments: TranscriptSegment[],
  offsetMs: number,
  idPrefix = 'segment',
): TranscriptSegment[] {
  const safeOffsetMs = Number.isFinite(offsetMs)
    ? Math.max(0, Math.round(offsetMs))
    : 0;

  return segments.map((segment, index) => ({
    id: `${idPrefix}-${index + 1}`,
    startMs: safeOffsetMs + Math.max(0, Math.round(segment.startMs)),
    endMs: safeOffsetMs + Math.max(0, Math.round(segment.endMs)),
    text: segment.text.trim(),
    speakerKey: null,
    speakerRole: 'unknown',
    averageLogProbability: normalizeNullableFiniteNumber(segment.averageLogProbability),
    noSpeechProbability: normalizeNullableProbability(segment.noSpeechProbability),
  }));
}

export function buildTranscriptEvidenceRpcPayload(
  input: TranscriptEvidenceInput & { summaryId: string },
): TranscriptEvidenceRpcPayload {
  if (!UUID_PATTERN.test(input.summaryId)) {
    throw new Error('Transcript evidence summary ID is invalid.');
  }
  if (input.provider !== 'groq') {
    throw new Error('Transcript evidence provider is unsupported.');
  }
  if (input.segments.length > MAX_TRANSCRIPT_EVIDENCE_SEGMENTS) {
    throw new Error('Transcript evidence contains too many segments.');
  }

  const clientRequestId = requireBoundedText(
    input.clientRequestId,
    'Transcript evidence request ID',
    MAX_REQUEST_ID_CHARACTERS,
  );
  const transcriptionModel = requireBoundedText(
    input.transcriptionModel,
    'Transcript evidence transcription model',
    MAX_MODEL_NAME_CHARACTERS,
  );
  const summaryModel = input.summaryModel === null
    ? null
    : requireBoundedText(
      input.summaryModel,
      'Transcript evidence summary model',
      MAX_MODEL_NAME_CHARACTERS,
    );

  let totalTextCharacters = 0;
  const segments = input.segments.map((segment) => {
    const startMs = Math.round(segment.startMs);
    const endMs = Math.round(segment.endMs);
    if (
      !Number.isSafeInteger(startMs)
      || !Number.isSafeInteger(endMs)
      || startMs < 0
      || endMs < startMs
    ) {
      throw new Error('Transcript evidence time range is invalid.');
    }

    const text = requireBoundedText(
      segment.text,
      'Transcript evidence segment text',
      MAX_SEGMENT_TEXT_CHARACTERS,
    );
    totalTextCharacters += text.length;
    if (totalTextCharacters > MAX_TRANSCRIPT_EVIDENCE_TEXT_CHARACTERS) {
      throw new Error('Transcript evidence contains too much text.');
    }

    return {
      start_ms: startMs,
      end_ms: endMs,
      text,
      average_log_probability: normalizeNullableFiniteNumber(
        segment.averageLogProbability,
      ),
      no_speech_probability: normalizeNullableProbability(
        segment.noSpeechProbability,
      ),
    };
  });

  return {
    p_summary_id: input.summaryId,
    p_client_request_id: clientRequestId,
    p_provider: input.provider,
    p_transcription_model: transcriptionModel,
    p_summary_model: summaryModel,
    p_quality: {
      ...input.quality,
      segmentCount: segments.length,
    },
    p_segments: segments,
  };
}
