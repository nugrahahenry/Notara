import { supabase } from '../supabase';
import {
  HIGH_NO_SPEECH_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  TRANSCRIPT_EVIDENCE_PAGE_SIZE,
  normalizeTranscriptEvidenceRun,
  normalizeTranscriptEvidenceSegment,
  type TranscriptEvidenceFilter,
  type TranscriptEvidencePage,
} from './evidence';

const RUN_FIELDS = [
  'id',
  'quality_status',
  'quality_report',
  'segment_count',
  'transcript_character_count',
  'completed_at',
].join(',');

const SEGMENT_FIELDS = [
  'id',
  'ordinal',
  'start_ms',
  'end_ms',
  'text',
  'average_log_probability',
  'no_speech_probability',
].join(',');

export async function readTranscriptEvidencePage({
  summaryId,
  page,
  filter,
  pageSize = TRANSCRIPT_EVIDENCE_PAGE_SIZE,
}: {
  summaryId: string;
  page: number;
  filter: TranscriptEvidenceFilter;
  pageSize?: number;
}): Promise<TranscriptEvidencePage | null> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const { data: runRow, error: runError } = await supabase
    .from('processing_runs')
    .select(RUN_FIELDS)
    .eq('summary_id', summaryId)
    .maybeSingle();

  if (runError) throw new Error('run-read-failed');

  const run = normalizeTranscriptEvidenceRun(runRow);
  if (!run) return null;

  let query = supabase
    .from('transcript_segments')
    .select(SEGMENT_FIELDS, { count: 'exact' })
    .eq('processing_run_id', run.id)
    .order('ordinal', { ascending: true });

  if (filter === 'unclear') {
    query = query.or(
      `average_log_probability.lte.${LOW_CONFIDENCE_THRESHOLD},no_speech_probability.gte.${HIGH_NO_SPEECH_THRESHOLD}`,
    );
  }

  const { data: segmentRows, error: segmentError, count } = await query.range(from, to);
  if (segmentError) throw new Error('segment-read-failed');

  return {
    run,
    segments: (segmentRows ?? []).flatMap((row) => {
      const segment = normalizeTranscriptEvidenceSegment(row);
      return segment ? [segment] : [];
    }),
    total: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}
