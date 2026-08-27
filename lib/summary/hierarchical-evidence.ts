import 'server-only';

import type { createClient } from '@/lib/supabase-server';
import {
  normalizeTranscriptContextAnnotation,
  type TranscriptContextAnnotation,
} from '@/lib/transcript/context';
import type { ContextSummaryEvidenceSegment } from '@/lib/transcript/context-summary-prompt';
import {
  normalizeTranscriptEvidenceSegment,
  type TranscriptEvidenceSegment,
} from '@/lib/transcript/evidence';

const SEGMENT_PAGE_SIZE = 500;
const MAX_SEGMENTS_TO_PLAN = 5_000;
const MAX_CHARACTERS_TO_PLAN = 90_001;
const ANNOTATION_BATCH_SIZE = 100;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface HierarchicalEvidenceSnapshot {
  summaryId: string;
  summaryContent: string;
  activeRevisionId: string | null;
  revisionEpoch: number;
  processingRunId: string;
  annotationIds: number[];
  segments: ContextSummaryEvidenceSegment[];
}

async function readSegments(
  supabase: SupabaseClient,
  processingRunId: string,
): Promise<TranscriptEvidenceSegment[]> {
  const segments: TranscriptEvidenceSegment[] = [];
  let lastOrdinal = -1;
  let characters = 0;
  while (segments.length <= MAX_SEGMENTS_TO_PLAN && characters <= MAX_CHARACTERS_TO_PLAN) {
    const { data, error } = await supabase
      .from('transcript_segments')
      .select('id,ordinal,start_ms,end_ms,text,average_log_probability,no_speech_probability')
      .eq('processing_run_id', processingRunId)
      .gt('ordinal', lastOrdinal)
      .order('ordinal', { ascending: true })
      .limit(SEGMENT_PAGE_SIZE);
    if (error) throw new Error('hierarchical-segment-read-failed');
    const page = (data ?? []).flatMap((row) => {
      const segment = normalizeTranscriptEvidenceSegment(row);
      return segment ? [segment] : [];
    });
    if (page.length !== (data ?? []).length) {
      throw new Error('hierarchical-segment-normalization-failed');
    }
    if (page.length === 0) break;
    if (page[0].ordinal <= lastOrdinal) throw new Error('hierarchical-segment-pagination-failed');
    for (const segment of page) {
      segments.push(segment);
      characters += segment.text.length;
      if (segments.length > MAX_SEGMENTS_TO_PLAN || characters > MAX_CHARACTERS_TO_PLAN) break;
    }
    lastOrdinal = page.at(-1)?.ordinal ?? lastOrdinal;
    if (page.length < SEGMENT_PAGE_SIZE) break;
  }
  return segments;
}

async function readAnnotations(
  supabase: SupabaseClient,
  summaryId: string,
  userId: string,
  reservedAnnotationIds?: number[],
): Promise<TranscriptContextAnnotation[]> {
  const annotations: TranscriptContextAnnotation[] = [];
  if (reservedAnnotationIds) {
    for (let index = 0; index < reservedAnnotationIds.length; index += ANNOTATION_BATCH_SIZE) {
      const batch = reservedAnnotationIds.slice(index, index + ANNOTATION_BATCH_SIZE);
      const { data, error } = await supabase
        .from('transcript_segment_annotations')
        .select('id,segment_id,version,context_label,summary_treatment,created_at')
        .eq('summary_id', summaryId)
        .eq('user_id', userId)
        .in('id', batch);
      if (error) throw new Error('hierarchical-annotation-read-failed');
      for (const row of data ?? []) {
        const annotation = normalizeTranscriptContextAnnotation(row);
        if (!annotation || !batch.includes(annotation.id)) {
          throw new Error('hierarchical-annotation-normalization-failed');
        }
        annotations.push(annotation);
      }
    }
    if (annotations.length !== reservedAnnotationIds.length) {
      throw new Error('hierarchical-annotation-snapshot-incomplete');
    }
    return annotations;
  }

  const { data, error } = await supabase
    .from('transcript_segment_annotations')
    .select('id,segment_id,version,context_label,summary_treatment,created_at')
    .eq('summary_id', summaryId)
    .eq('user_id', userId)
    .order('segment_id', { ascending: true })
    .order('version', { ascending: false })
    .limit(MAX_SEGMENTS_TO_PLAN);
  if (error) throw new Error('hierarchical-annotation-read-failed');
  const seen = new Set<number>();
  for (const row of data ?? []) {
    const annotation = normalizeTranscriptContextAnnotation(row);
    if (!annotation) throw new Error('hierarchical-annotation-normalization-failed');
    if (!seen.has(annotation.segmentId)) {
      seen.add(annotation.segmentId);
      annotations.push(annotation);
    }
  }
  return annotations;
}

export async function readHierarchicalEvidenceSnapshot(
  supabase: SupabaseClient,
  summaryId: string,
  userId: string,
  reservedAnnotationIds?: number[],
): Promise<HierarchicalEvidenceSnapshot> {
  const { data: summary, error: summaryError } = await supabase
    .from('summaries')
    .select('id,summary,active_revision_id,revision_epoch')
    .eq('id', summaryId)
    .eq('user_id', userId)
    .maybeSingle();
  if (summaryError) throw new Error('hierarchical-summary-read-failed');
  if (!summary) throw new Error('hierarchical-summary-not-found');

  const { data: run, error: runError } = await supabase
    .from('processing_runs')
    .select('id')
    .eq('summary_id', summaryId)
    .eq('user_id', userId)
    .maybeSingle();
  if (runError) throw new Error('hierarchical-processing-run-read-failed');
  if (!run?.id) throw new Error('hierarchical-evidence-not-found');

  const [segments, annotations] = await Promise.all([
    readSegments(supabase, run.id),
    readAnnotations(supabase, summaryId, userId, reservedAnnotationIds),
  ]);
  const annotationsBySegment = new Map(annotations.map((annotation) => [
    annotation.segmentId,
    annotation,
  ]));
  return {
    summaryId,
    summaryContent: typeof summary.summary === 'string' ? summary.summary : '',
    activeRevisionId: typeof summary.active_revision_id === 'string'
      ? summary.active_revision_id
      : null,
    revisionEpoch: typeof summary.revision_epoch === 'number'
      ? summary.revision_epoch
      : Number(summary.revision_epoch ?? 0),
    processingRunId: run.id,
    annotationIds: annotations.map((annotation) => annotation.id).sort((a, b) => a - b),
    segments: segments.map((segment) => {
      const annotation = annotationsBySegment.get(segment.id);
      return {
        id: segment.id,
        ordinal: segment.ordinal,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        contextLabel: annotation?.contextLabel ?? null,
        summaryTreatment: annotation?.summaryTreatment ?? null,
      };
    }),
  };
}
