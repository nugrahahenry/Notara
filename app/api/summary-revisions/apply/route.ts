import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_SUMMARY_REGENERATION_BODY_BYTES,
  normalizeAppliedSummaryRevision,
  parseSummaryRevisionApplyRequest,
} from '@/lib/summary/revisions';
import {
  BoundedJsonBodyError,
  readBoundedJsonBody,
} from '@/lib/api/bounded-json';
import { createClient } from '@/lib/supabase-server';

function statusForDatabaseError(code: string | undefined): number {
  if (code === '40001') return 409;
  if (code === 'P0002') return 404;
  if (code === '42501') return 403;
  if (code === '55000') return 409;
  return 500;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user?.id) {
      return NextResponse.json(
        { code: 'unauthorized', error: 'Sesi tidak valid. Silakan login kembali.' },
        { status: 401 },
      );
    }

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

    let requestData;
    try {
      requestData = parseSummaryRevisionApplyRequest(payload);
    } catch {
      return NextResponse.json({ error: 'Versi rangkuman tidak valid.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('apply_summary_revision', {
      p_summary_id: requestData.summaryId,
      p_revision_id: requestData.revisionId,
      p_expected_active_revision_id: requestData.expectedActiveRevisionId,
      p_expected_revision_epoch: requestData.expectedRevisionEpoch,
      p_intent: requestData.intent,
    });
    if (error) {
      const status = statusForDatabaseError(error.code);
      return NextResponse.json(
        {
          code: status === 409 ? 'revision-conflict' : 'revision-apply-failed',
          error: status === 409
            ? 'Versi aktif atau keputusan konteks sudah berubah.'
            : 'Versi rangkuman belum dapat digunakan.',
        },
        { status },
      );
    }

    const applied = normalizeAppliedSummaryRevision(data);
    if (!applied) throw new Error('apply-response-invalid');
    return NextResponse.json(applied);
  } catch {
    console.error('[summary-revisions] apply request failed');
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat menggunakan versi rangkuman.' },
      { status: 500 },
    );
  }
}
