import { supabase } from '../supabase';
import {
  isTranscriptContextLabel,
  isTranscriptSummaryTreatment,
  normalizeTranscriptContextAnnotation,
  type TranscriptContextAnnotation,
  type TranscriptContextLabel,
  type TranscriptSummaryTreatment,
} from './context';

const ANNOTATION_FIELDS = [
  'id',
  'segment_id',
  'version',
  'context_label',
  'summary_treatment',
  'created_at',
].join(',');

export async function readLatestTranscriptContextAnnotations(
  summaryId: string,
  segmentIds: number[],
): Promise<Map<number, TranscriptContextAnnotation>> {
  const uniqueSegmentIds = segmentIds.filter((segmentId, index, values) => (
    Number.isSafeInteger(segmentId)
    && segmentId > 0
    && values.indexOf(segmentId) === index
  ));
  if (!summaryId || uniqueSegmentIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('transcript_segment_annotations')
    .select(ANNOTATION_FIELDS)
    .eq('summary_id', summaryId)
    .in('segment_id', uniqueSegmentIds)
    .order('segment_id', { ascending: true })
    .order('version', { ascending: false });

  if (error) throw new Error('context-read-failed');

  const latest = new Map<number, TranscriptContextAnnotation>();
  for (const row of data ?? []) {
    const annotation = normalizeTranscriptContextAnnotation(row);
    if (annotation && !latest.has(annotation.segmentId)) {
      latest.set(annotation.segmentId, annotation);
    }
  }
  return latest;
}
export async function saveTranscriptContextDecision({
  summaryId,
  segmentId,
  contextLabel,
  summaryTreatment,
}: {
  summaryId: string;
  segmentId: number;
  contextLabel: TranscriptContextLabel;
  summaryTreatment: TranscriptSummaryTreatment;
}): Promise<TranscriptContextAnnotation> {
  if (!summaryId || !Number.isSafeInteger(segmentId) || segmentId <= 0) {
    throw new Error('invalid-segment-id');
  }
  if (!isTranscriptContextLabel(contextLabel)) {
    throw new Error('invalid-context-label');
  }
  if (!isTranscriptSummaryTreatment(summaryTreatment)) {
    throw new Error('invalid-summary-treatment');
  }

  const { data: ownedSegment, error: segmentError } = await supabase
    .from('transcript_segments')
    .select('id')
    .eq('summary_id', summaryId)
    .eq('id', segmentId)
    .maybeSingle();
  if (segmentError || !ownedSegment) throw new Error('context-segment-scope-failed');

  const { error: saveError } = await supabase.rpc(
    'save_transcript_segment_annotation',
    {
      p_segment_id: segmentId,
      p_context_label: contextLabel,
      p_summary_treatment: summaryTreatment,
    },
  );
  if (saveError) throw new Error('context-save-failed');

  const latest = await readLatestTranscriptContextAnnotations(summaryId, [segmentId]);
  const saved = latest.get(segmentId);
  if (!saved) throw new Error('context-save-readback-failed');
  return saved;
}
