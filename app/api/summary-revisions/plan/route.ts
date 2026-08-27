import { NextRequest, NextResponse } from 'next/server';
import { authorizeAuthenticatedUser } from '@/lib/api/ai-access';
import { BoundedJsonBodyError, readBoundedJsonBody } from '@/lib/api/bounded-json';
import { readHierarchicalEvidenceSnapshot } from '@/lib/summary/hierarchical-evidence';
import { createSummaryRegenerationPlan } from '@/lib/summary/hierarchical-plan';
import {
  MAX_SUMMARY_REGENERATION_BODY_BYTES,
  normalizeHierarchicalSummaryProgress,
  parseSummaryRegenerationPlanRequest,
} from '@/lib/summary/revisions';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeAuthenticatedUser();
    if (!access.ok) return access.response;
    let payload: unknown;
    try {
      payload = await readBoundedJsonBody(request, MAX_SUMMARY_REGENERATION_BODY_BYTES);
    } catch (error) {
      if (error instanceof BoundedJsonBodyError) {
        return NextResponse.json(
          { error: error.code === 'body-too-large' ? 'Permintaan terlalu besar.' : 'Format permintaan tidak valid.' },
          { status: error.code === 'body-too-large' ? 413 : 400 },
        );
      }
      throw error;
    }
    let input;
    try {
      input = parseSummaryRegenerationPlanRequest(payload);
    } catch {
      return NextResponse.json({ error: 'Permintaan rencana tidak valid.' }, { status: 400 });
    }

    const supabase = await createClient();
    const snapshot = await readHierarchicalEvidenceSnapshot(
      supabase,
      input.summaryId,
      access.userId,
    );
    const plan = createSummaryRegenerationPlan(snapshot.segments, {
      summaryId: input.summaryId,
      baseSummaryContent: snapshot.summaryContent,
      activeRevisionId: snapshot.activeRevisionId,
      revisionEpoch: snapshot.revisionEpoch,
      contextAnnotationIds: snapshot.annotationIds,
      productName: 'Nalira',
    });

    const { data: progressRows, error: progressError } = await supabase.rpc(
      'read_hierarchical_summary_progress',
      { p_summary_id: input.summaryId },
    );
    const progress = progressError ? null : normalizeHierarchicalSummaryProgress(progressRows);
    return NextResponse.json({
      mode: plan.mode,
      planVersion: plan.planVersion,
      planDigest: progress?.requestState === 'generating' ? progress.planDigest : plan.planDigest,
      plannedCalls: progress?.requestState === 'generating' ? progress.stageCount : plan.plannedCalls,
      sourceCharacters: plan.sourceCharacters,
      unsupportedReason: plan.unsupportedReason,
      pacingSeconds: 125,
      destination: 'Groq',
      progress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'hierarchical-summary-not-found') {
      return NextResponse.json({ error: 'Materi tidak ditemukan.' }, { status: 404 });
    }
    if (message === 'hierarchical-evidence-not-found') {
      return NextResponse.json({ error: 'Transkrip bertanda waktu belum tersedia.' }, { status: 404 });
    }
    console.error('[summary-revisions] plan unavailable');
    return NextResponse.json({ error: 'Rencana preview belum dapat dihitung.' }, { status: 500 });
  }
}
