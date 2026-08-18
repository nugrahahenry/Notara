export type TranscriptSpeakerRole = 'lecturer' | 'student' | 'other' | 'unknown';

export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerKey: string | null;
  speakerRole: TranscriptSpeakerRole;
  averageLogProbability: number | null;
  noSpeechProbability: number | null;
}

export type TranscriptQualityStatus = 'good' | 'review' | 'poor';
export type TranscriptQualitySeverity = 'warning' | 'critical';

export type TranscriptQualityWarningCode =
  | 'too-few-words'
  | 'low-speech-density'
  | 'provider-low-confidence'
  | 'provider-high-no-speech'
  | 'repetitive-filler'
  | 'missing-timestamps';

export interface TranscriptQualityWarning {
  code: TranscriptQualityWarningCode;
  severity: TranscriptQualitySeverity;
  message: string;
}

export interface TranscriptQualityReport {
  status: TranscriptQualityStatus;
  durationSec: number | null;
  wordCount: number;
  wordsPerMinute: number | null;
  segmentCount: number;
  lowConfidenceSegmentRatio: number | null;
  highNoSpeechSegmentRatio: number | null;
  repeatedFillerRatio: number;
  warnings: TranscriptQualityWarning[];
}

interface TranscriptQualityInput {
  transcript: string;
  durationSec?: number | null;
  segments?: TranscriptSegment[];
}

const REPETITIVE_FILLERS = ['terima kasih', 'hai'];

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundRatio(value: number): number {
  return Math.round(clampRatio(value) * 10_000) / 10_000;
}

function normalizeDurationSec(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function countPhrase(value: string, phrase: string): number {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.match(new RegExp(`\\b${escaped}\\b`, 'giu'))?.length ?? 0;
}

export function normalizeGroqTranscriptSegments(
  value: unknown,
  offsetMs = 0,
): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];

  const safeOffsetMs = Number.isFinite(offsetMs) ? Math.max(0, Math.round(offsetMs)) : 0;

  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];

    const segment = candidate as Record<string, unknown>;
    const start = finiteNumber(segment.start);
    const end = finiteNumber(segment.end);
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';

    if (start === null || end === null || start < 0 || end < start || !text) return [];

    return [{
      id: `segment-${index + 1}`,
      startMs: safeOffsetMs + Math.round(start * 1000),
      endMs: safeOffsetMs + Math.round(end * 1000),
      text,
      speakerKey: null,
      speakerRole: 'unknown' as const,
      averageLogProbability: finiteNumber(segment.avg_logprob),
      noSpeechProbability: finiteNumber(segment.no_speech_prob),
    }];
  });
}

export function normalizeTranscriptSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 5_000).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];

    const segment = candidate as Record<string, unknown>;
    const startMs = finiteNumber(segment.startMs);
    const endMs = finiteNumber(segment.endMs);
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';

    if (
      startMs === null
      || endMs === null
      || startMs < 0
      || endMs < startMs
      || !text
    ) {
      return [];
    }

    const noSpeechProbability = finiteNumber(segment.noSpeechProbability);

    return [{
      id: `segment-${index + 1}`,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      text: text.slice(0, 20_000),
      speakerKey: null,
      speakerRole: 'unknown' as const,
      averageLogProbability: finiteNumber(segment.averageLogProbability),
      noSpeechProbability:
        noSpeechProbability !== null
        && noSpeechProbability >= 0
        && noSpeechProbability <= 1
          ? noSpeechProbability
          : null,
    }];
  });
}

export function normalizeTranscriptGlossary(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const normalized = entry.trim().replace(/\s+/g, ' ').slice(0, 80);
    const key = normalized.toLocaleLowerCase('id-ID');
    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
    if (result.length >= 30) break;
  }

  return result;
}

export function analyzeTranscriptQuality({
  transcript,
  durationSec,
  segments = [],
}: TranscriptQualityInput): TranscriptQualityReport {
  const normalizedDurationSec = normalizeDurationSec(durationSec);
  const wordCount = countWords(transcript);
  const wordsPerMinute = normalizedDurationSec
    ? Math.round((wordCount / (normalizedDurationSec / 60)) * 10) / 10
    : null;

  const scoredConfidenceSegments = segments.filter(
    (segment) => segment.averageLogProbability !== null,
  );
  const lowConfidenceSegmentRatio = scoredConfidenceSegments.length > 0
    ? roundRatio(
      scoredConfidenceSegments.filter(
        (segment) => (segment.averageLogProbability ?? 0) <= -0.5,
      ).length / scoredConfidenceSegments.length,
    )
    : null;

  const scoredSpeechSegments = segments.filter(
    (segment) => segment.noSpeechProbability !== null,
  );
  const highNoSpeechSegmentRatio = scoredSpeechSegments.length > 0
    ? roundRatio(
      scoredSpeechSegments.filter(
        (segment) => (segment.noSpeechProbability ?? 0) >= 0.6,
      ).length / scoredSpeechSegments.length,
    )
    : null;

  const normalizedTranscript = transcript.toLocaleLowerCase('id-ID');
  const repeatedFillerWords = REPETITIVE_FILLERS.reduce(
    (total, phrase) => total + countPhrase(normalizedTranscript, phrase) * countWords(phrase),
    0,
  );
  const repeatedFillerRatio = wordCount > 0
    ? roundRatio(repeatedFillerWords / wordCount)
    : 0;

  const warnings: TranscriptQualityWarning[] = [];

  if (wordCount < 20) {
    warnings.push({
      code: 'too-few-words',
      severity: 'critical',
      message: 'Kata yang tertangkap terlalu sedikit untuk menjadi sumber rangkuman yang aman.',
    });
  }

  if (normalizedDurationSec && normalizedDurationSec >= 300 && wordsPerMinute !== null && wordsPerMinute < 55) {
    warnings.push({
      code: 'low-speech-density',
      severity: 'critical',
      message: 'Jumlah kata jauh lebih rendah daripada durasi audio; sebagian ucapan mungkin tidak tertangkap.',
    });
  }

  if (lowConfidenceSegmentRatio !== null && lowConfidenceSegmentRatio >= 0.25) {
    warnings.push({
      code: 'provider-low-confidence',
      severity: 'critical',
      message: 'Banyak segmen memiliki keyakinan transkripsi rendah menurut metadata penyedia.',
    });
  }

  if (highNoSpeechSegmentRatio !== null && highNoSpeechSegmentRatio >= 0.2) {
    warnings.push({
      code: 'provider-high-no-speech',
      severity: 'warning',
      message: 'Sejumlah segmen kemungkinan berisi hening, kebisingan, atau suara yang tidak jelas.',
    });
  }

  if (repeatedFillerRatio >= 0.03) {
    warnings.push({
      code: 'repetitive-filler',
      severity: 'warning',
      message: 'Frasa pendek berulang secara tidak wajar dan dapat berasal dari halusinasi transkripsi.',
    });
  }

  if (normalizedDurationSec && normalizedDurationSec >= 60 && segments.length === 0) {
    warnings.push({
      code: 'missing-timestamps',
      severity: 'warning',
      message: 'Transkrip belum memiliki segmen waktu untuk memverifikasi bagian yang dirangkum.',
    });
  }

  const status: TranscriptQualityStatus = warnings.some(
    (warning) => warning.severity === 'critical',
  )
    ? 'poor'
    : warnings.length > 0
      ? 'review'
      : 'good';

  return {
    status,
    durationSec: normalizedDurationSec,
    wordCount,
    wordsPerMinute,
    segmentCount: segments.length,
    lowConfidenceSegmentRatio,
    highNoSpeechSegmentRatio,
    repeatedFillerRatio,
    warnings,
  };
}
