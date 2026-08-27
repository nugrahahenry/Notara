import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL } from '@/lib/ai';
import {
  createAiUsageEvent,
  parseGroqCompletionUsage,
  parseGroqProviderRequestId,
} from '@/lib/ai/usage';
import { recordAiUsageSafely } from '@/lib/ai/usage-recorder';
import { authorizeAiRequest } from '@/lib/api/ai-access';
import {
  BoundedJsonBodyError,
  readBoundedJsonBody,
} from '@/lib/api/bounded-json';
import {
  CONTEXT_SUMMARY_PROMPT_VERSION,
  MAX_SUMMARY_REGENERATION_BODY_BYTES,
  normalizeCompletedSummaryRevision,
  normalizeSummaryRegenerationReservation,
  parseSummaryRegenerationRequest,
  type SummaryRegenerationFailureCode,
} from '@/lib/summary/revisions';
import { createClient } from '@/lib/supabase-server';
import { normalizeTranscriptContextAnnotation } from '@/lib/transcript/context';
import type { TranscriptContextAnnotation } from '@/lib/transcript/context';
import {
  buildContextAwareSummaryPrompt,
  MAX_CONTEXT_SUMMARY_PROMPT_CHARACTERS,
} from '@/lib/transcript/context-summary-prompt';
import { normalizeTranscriptEvidenceSegment } from '@/lib/transcript/evidence';
import type { TranscriptEvidenceSegment } from '@/lib/transcript/evidence';

const MAX_REGENERATION_SEGMENTS = 5_000;
const MAX_REGENERATION_TRANSCRIPT_CHARACTERS = 300_000;
const SEGMENT_PAGE_SIZE = 500;
const ANNOTATION_BATCH_SIZE = 100;
const REGENERATION_TIMEOUT_MS = 45_000;
const MAX_REGENERATION_OUTPUT_TOKENS = 1_536;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function completionContent(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const choices = Reflect.get(value, 'choices');
  if (!Array.isArray(choices) || choices.length !== 1) return null;
  const choice = choices[0];
  if (!choice || typeof choice !== 'object') return null;
  if (Reflect.get(choice, 'finish_reason') === 'length') return null;
  const message = Reflect.get(choice, 'message');
  if (!message || typeof message !== 'object') return null;
  const content = Reflect.get(message, 'content');
  if (typeof content !== 'string') return null;
  const normalized = content.trim();
  return normalized && normalized.length <= 100_000 ? normalized : null;
}

function statusForDatabaseError(code: string | undefined): number {
  if (code === 'P0002') return 404;
  if (code === '42501') return 403;
  if (code === '54000' || code === '55000' || code === '40001') return 409;
  return 500;
}

function statusForFailureCode(code: SummaryRegenerationFailureCode | null): number {
  if (code === 'provider_unavailable') return 503;
  if (code === 'provider_timeout' || code === 'generation_timeout') return 504;
  if (code === 'provider_failed' || code === 'invalid_output') return 502;
  return 500;
}

function statusForProviderResponse(status: number): number {
  if (status === 413 || status === 429 || status === 503) return status;
  return 502;
}

async function failRequest(
  supabase: SupabaseClient,
  requestId: string,
  failureCode: SummaryRegenerationFailureCode,
) {
  const { error } = await supabase.rpc('fail_summary_regeneration', {
    p_request_id: requestId,
    p_failure_code: failureCode,
  });
  if (error) console.error('[summary-revisions] failure state unavailable');
}

async function readEvidenceSegments(
  supabase: SupabaseClient,
  processingRunId: string,
) {
  const segments: TranscriptEvidenceSegment[] = [];
  let lastOrdinal = -1;
  let totalCharacters = 0;

  while (true) {
    const remainingCapacity = MAX_REGENERATION_SEGMENTS - segments.length;
    const requestedPageSize = Math.min(SEGMENT_PAGE_SIZE, remainingCapacity + 1);
    const { data, error } = await supabase
      .from('transcript_segments')
      .select('id,ordinal,start_ms,end_ms,text,average_log_probability,no_speech_probability')
      .eq('processing_run_id', processingRunId)
      .gt('ordinal', lastOrdinal)
      .order('ordinal', { ascending: true })
      .limit(requestedPageSize);
    if (error) throw new Error('segment-read-failed');

    const page = (data ?? []).flatMap((row) => {
      const segment = normalizeTranscriptEvidenceSegment(row);
      return segment ? [segment] : [];
    });
    if (page.length !== (data ?? []).length) throw new Error('segment-normalization-failed');
    if (page.length === 0) break;
    if (page[0].ordinal <= lastOrdinal) throw new Error('segment-pagination-failed');
    if (page.length > remainingCapacity) throw new Error('segment-limit-exceeded');

    for (const segment of page) {
      totalCharacters += segment.text.length;
      if (totalCharacters > MAX_REGENERATION_TRANSCRIPT_CHARACTERS) {
        throw new Error('transcript-too-large');
      }
      segments.push(segment);
    }
    lastOrdinal = page.at(-1)?.ordinal ?? lastOrdinal;
    if (page.length < requestedPageSize) break;
  }

  if (segments.length === 0) throw new Error('segments-empty');
  return segments;
}

async function readReservedAnnotations(
  supabase: SupabaseClient,
  summaryId: string,
  userId: string,
  annotationIds: number[],
) {
  const annotations = new Map<number, TranscriptContextAnnotation>();
  for (let index = 0; index < annotationIds.length; index += ANNOTATION_BATCH_SIZE) {
    const batch = annotationIds.slice(index, index + ANNOTATION_BATCH_SIZE);
    const { data, error } = await supabase
      .from('transcript_segment_annotations')
      .select('id,segment_id,version,context_label,summary_treatment,created_at')
      .eq('summary_id', summaryId)
      .eq('user_id', userId)
      .in('id', batch);
    if (error) throw new Error('annotation-read-failed');
    for (const row of data ?? []) {
      const annotation = normalizeTranscriptContextAnnotation(row);
      if (!annotation || !batch.includes(annotation.id)) {
        throw new Error('annotation-normalization-failed');
      }
      annotations.set(annotation.segmentId, annotation);
    }
  }
  if (annotations.size !== annotationIds.length) {
    throw new Error('annotation-snapshot-incomplete');
  }
  return annotations;
}

export async function POST(request: NextRequest) {
  let reservedRequestId: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    const access = await authorizeAiRequest('regenerate');
    if (!access.ok) return access.response;
    if (access.bypassed) {
      return NextResponse.json(
        { code: 'authentication-required', error: 'Masuk untuk memperbarui rangkuman tersimpan.' },
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
      requestData = parseSummaryRegenerationRequest(payload);
    } catch {
      return NextResponse.json({ error: 'Permintaan pembaruan tidak valid.' }, { status: 400 });
    }

    supabase = await createClient();
    const { data: ownedSummary, error: summaryError } = await supabase
      .from('summaries')
      .select('id')
      .eq('id', requestData.summaryId)
      .eq('user_id', access.userId)
      .maybeSingle();
    if (summaryError) throw new Error('owned-summary-read-failed');
    if (!ownedSummary) {
      return NextResponse.json({ error: 'Materi tidak ditemukan.' }, { status: 404 });
    }

    const { data: reservationRows, error: reservationError } = await supabase.rpc(
      'reserve_summary_regeneration',
      {
        p_summary_id: requestData.summaryId,
        p_client_request_id: requestData.clientRequestId,
      },
    );
    if (reservationError) {
      return NextResponse.json(
        { code: 'reservation-failed', error: 'Preview rangkuman belum dapat disiapkan.' },
        { status: statusForDatabaseError(reservationError.code) },
      );
    }

    const reservation = normalizeSummaryRegenerationReservation(reservationRows);
    if (!reservation) throw new Error('reservation-response-invalid');
    reservedRequestId = reservation.requestId;

    if (reservation.requestState === 'completed' && reservation.candidate) {
      return NextResponse.json({
        candidate: reservation.candidate,
        activeRevisionId: reservation.activeRevisionId,
        revisionEpoch: reservation.revisionEpoch,
        replayed: true,
      });
    }
    if (reservation.requestState === 'failed') {
      const status = statusForFailureCode(reservation.failureCode);
      return NextResponse.json(
        { code: reservation.failureCode ?? 'request-failed', error: 'Percobaan sebelumnya tidak selesai.' },
        { status },
      );
    }
    if (!reservation.shouldGenerate) {
      return NextResponse.json(
        { code: 'generation-in-progress', requestId: reservation.requestId },
        { status: 202 },
      );
    }

    const segments = await readEvidenceSegments(supabase, reservation.processingRunId);
    const annotations = await readReservedAnnotations(
      supabase,
      requestData.summaryId,
      access.userId,
      reservation.contextAnnotationIds,
    );
    const prompt = buildContextAwareSummaryPrompt({
      productName: 'Nalira',
      segments: segments.map((segment) => {
        const annotation = annotations.get(segment.id);
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
    });
    if (prompt.length > MAX_CONTEXT_SUMMARY_PROMPT_CHARACTERS) {
      await failRequest(supabase, reservation.requestId, 'provider_failed');
      return NextResponse.json(
        {
          code: 'provider_input_too_large',
          error: 'Materi terlalu panjang untuk satu preview pada paket AI saat ini.',
        },
        { status: 413 },
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      await failRequest(supabase, reservation.requestId, 'provider_unavailable');
      return NextResponse.json(
        { error: 'Layanan pembaruan belum tersedia.' },
        { status: 503 },
      );
    }

    let providerResponse: Response;
    try {
      providerResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_LLM_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.15,
          reasoning_effort: 'low',
          max_tokens: MAX_REGENERATION_OUTPUT_TOKENS,
        }),
        signal: AbortSignal.timeout(REGENERATION_TIMEOUT_MS),
      });
    } catch {
      await failRequest(supabase, reservation.requestId, 'provider_timeout');
      return NextResponse.json({ error: 'Pembuatan preview melewati batas waktu.' }, { status: 504 });
    }

    if (!providerResponse.ok) {
      console.error('[summary-revisions] provider request failed', { status: providerResponse.status });
      await failRequest(supabase, reservation.requestId, 'provider_failed');
      return NextResponse.json(
        { error: 'Nalira belum berhasil membuat preview.' },
        { status: statusForProviderResponse(providerResponse.status) },
      );
    }

    let providerData: unknown;
    try {
      providerData = await providerResponse.json();
    } catch {
      await failRequest(supabase, reservation.requestId, 'invalid_output');
      return NextResponse.json({ error: 'Hasil preview belum dapat dibaca.' }, { status: 502 });
    }

    const usage = parseGroqCompletionUsage(providerData);
    await recordAiUsageSafely(createAiUsageEvent({
      userId: access.userId,
      requestId: requestData.clientRequestId,
      operation: 'regenerate',
      stage: 'generation',
      model: GROQ_LLM_MODEL,
      providerRequestId: parseGroqProviderRequestId(providerData),
      ...(usage ?? {}),
    }), { bypassed: false });

    const content = completionContent(providerData);
    if (!content) {
      await failRequest(supabase, reservation.requestId, 'invalid_output');
      return NextResponse.json({ error: 'Preview rangkuman belum selesai dengan utuh.' }, { status: 502 });
    }

    const { data: completionRows, error: completionError } = await supabase.rpc(
      'complete_summary_regeneration',
      {
        p_request_id: reservation.requestId,
        p_content: content,
        p_prompt_version: CONTEXT_SUMMARY_PROMPT_VERSION,
        p_provider: 'groq',
        p_model: GROQ_LLM_MODEL,
      },
    );
    if (completionError) {
      await failRequest(supabase, reservation.requestId, 'internal_error');
      throw new Error('candidate-persistence-failed');
    }

    const candidate = normalizeCompletedSummaryRevision(completionRows);
    if (!candidate) throw new Error('candidate-response-invalid');
    return NextResponse.json({
      candidate,
      activeRevisionId: reservation.activeRevisionId,
      revisionEpoch: reservation.revisionEpoch,
      replayed: false,
    });
  } catch (error) {
    if (supabase && reservedRequestId) {
      await failRequest(supabase, reservedRequestId, 'internal_error');
    }
    const message = error instanceof Error ? error.message : '';
    if (
      message === 'transcript-too-large'
      || message === 'segment-limit-exceeded'
    ) {
      return NextResponse.json({ error: 'Transkrip terlalu panjang untuk diperbarui sekaligus.' }, { status: 413 });
    }
    if (message === 'segments-empty') {
      return NextResponse.json({ error: 'Transkrip bertanda waktu belum tersedia.' }, { status: 404 });
    }
    console.error('[summary-revisions] generation request failed');
    return NextResponse.json(
      { code: 'internal_error', error: 'Terjadi kesalahan saat membuat preview rangkuman.' },
      { status: 500 },
    );
  }
}
