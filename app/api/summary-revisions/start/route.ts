import { NextRequest, NextResponse } from 'next/server';
import { authorizeAuthenticatedUser } from '@/lib/api/ai-access';
import { BoundedJsonBodyError, readBoundedJsonBody } from '@/lib/api/bounded-json';
import { readHierarchicalEvidenceSnapshot } from '@/lib/summary/hierarchical-evidence';
import { createSummaryRegenerationPlan } from '@/lib/summary/hierarchical-plan';
import {
  MAX_SUMMARY_REGENERATION_BODY_BYTES,
  normalizeHierarchicalSummaryProgress,
  parseHierarchicalSummaryStartRequest,
} from '@/lib/summary/revisions';
import { createClient } from '@/lib/supabase-server';

function statusForDatabaseError(code: string | undefined): number {
  if (code === 'P0002') return 404;
  if (code === '42501') return 403;
  if (code === '54000') return 413;
  if (code === '40001' || code === '55000') return 409;
  return 500;
}

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
      input = parseHierarchicalSummaryStartRequest(payload);
    } catch {
      return NextResponse.json({ error: 'Permintaan mulai tidak valid.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: activeRows, error: activeError } = await supabase.rpc(
      'read_hierarchical_summary_progress',
      { p_summary_id: input.summaryId },
    );
    const activeProgress = activeError ? null : normalizeHierarchicalSummaryProgress(activeRows);
    if (activeProgress) {
      if (
        activeProgress.clientRequestId === input.clientRequestId
        && activeProgress.planDigest === input.planDigest
      ) return NextResponse.json({ progress: activeProgress, replayed: true });
      return NextResponse.json(
        { code: 'workflow-active', error: 'Preview panjang lain masih aktif untuk materi ini.' },
        { status: 409 },
      );
    }
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
    if (plan.mode !== 'hierarchical' || plan.planDigest !== input.planDigest) {
      return NextResponse.json(
        { code: 'plan-stale', error: 'Rencana berubah. Periksa ulang jumlah tahap sebelum memulai.' },
        { status: 409 },
      );
    }

    const stageIds = new Map(plan.stages.map((stage) => [stage.stageIndex, crypto.randomUUID()]));
    const stagePlan = plan.stages.map((stage) => ({
      id: stageIds.get(stage.stageIndex),
      stageIndex: stage.stageIndex,
      kind: stage.kind,
      level: stage.level,
      position: stage.position,
      ordinalStart: stage.ordinalStart,
      ordinalEnd: stage.ordinalEnd,
      inputStageIds: stage.inputStageIndexes.map((index) => stageIds.get(index)),
    }));
    const { data: startRows, error: startError } = await supabase.rpc(
      'start_hierarchical_summary_regeneration',
      {
        p_summary_id: input.summaryId,
        p_client_request_id: input.clientRequestId,
        p_plan_version: plan.planVersion,
        p_plan_digest: plan.planDigest,
        p_stage_plan: stagePlan,
      },
    );
    if (startError) {
      return NextResponse.json(
        { code: 'start-failed', error: 'Preview panjang belum dapat dimulai.' },
        { status: statusForDatabaseError(startError.code) },
      );
    }
    const startRow = Array.isArray(startRows) && startRows.length === 1
      && startRows[0] && typeof startRows[0] === 'object'
      ? startRows[0] as Record<string, unknown>
      : null;
    const requestId = startRow?.request_id;
    if ((typeof requestId !== 'number' && typeof requestId !== 'string') || !/^\d+$/.test(String(requestId))) {
      throw new Error('hierarchical-start-response-invalid');
    }
    const { data: progressRows, error: progressError } = await supabase.rpc(
      'read_hierarchical_summary_request',
      { p_request_id: String(requestId) },
    );
    const progress = progressError ? null : normalizeHierarchicalSummaryProgress(progressRows);
    if (!progress) throw new Error('hierarchical-start-response-invalid');
    return NextResponse.json({ progress });
  } catch {
    console.error('[summary-revisions] start unavailable');
    return NextResponse.json({ error: 'Preview panjang belum dapat dimulai.' }, { status: 500 });
  }
}
