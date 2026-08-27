import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL } from '@/lib/ai';
import { authorizeAiRequest } from '@/lib/api/ai-access';
import {
  BoundedJsonBodyError,
  readBoundedJsonBody,
} from '@/lib/api/bounded-json';
import {
  createAiUsageEvent,
  parseGroqCompletionUsage,
  parseGroqProviderRequestId,
} from '@/lib/ai/usage';
import { recordAiUsageSafely } from '@/lib/ai/usage-recorder';
import { createClient } from '@/lib/supabase-server';
import {
  normalizeTranscriptContextSuggestions,
  parseTranscriptContextRequest,
} from '@/lib/transcript/context';
import { buildTranscriptContextPrompt } from '@/lib/transcript/context-prompt';
import { normalizeTranscriptEvidenceSegment } from '@/lib/transcript/evidence';

const MAX_CONTEXT_BODY_BYTES = 4_096;
const MAX_CONTEXT_TRANSCRIPT_CHARACTERS = 20_000;
const CONTEXT_REQUEST_TIMEOUT_MS = 30_000;

function parseCompletionContent(value: unknown): unknown {
  if (!value || typeof value !== 'object') return null;
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const choice = choices[0];
  if (!choice || typeof choice !== 'object') return null;
  const message = (choice as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content !== 'string') return null;

  try {
    return JSON.parse(content.trim()) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeAiRequest('context');
    if (!access.ok) return access.response;

    let payload: unknown;
    try {
      payload = await readBoundedJsonBody(request, MAX_CONTEXT_BODY_BYTES);
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
      requestData = parseTranscriptContextRequest(payload);
    } catch {
      return NextResponse.json(
        { error: 'Bagian transkrip yang dipilih tidak valid.' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: runRow, error: runError } = await supabase
      .from('processing_runs')
      .select('id')
      .eq('summary_id', requestData.summaryId)
      .maybeSingle();

    if (runError) throw new Error('context-run-read-failed');
    if (!runRow) {
      return NextResponse.json({ error: 'Materi tidak ditemukan.' }, { status: 404 });
    }

    const { data: segmentRows, error: segmentError } = await supabase
      .from('transcript_segments')
      .select('id,ordinal,start_ms,end_ms,text,average_log_probability,no_speech_probability')
      .eq('processing_run_id', runRow.id)
      .in('id', requestData.segmentIds)
      .order('ordinal', { ascending: true });

    if (segmentError) throw new Error('context-segment-read-failed');

    const segments = (segmentRows ?? []).flatMap((row) => {
      const segment = normalizeTranscriptEvidenceSegment(row);
      return segment ? [segment] : [];
    });
    const returnedIds = new Set(segments.map((segment) => segment.id));
    if (
      segments.length !== requestData.segmentIds.length
      || requestData.segmentIds.some((segmentId) => !returnedIds.has(segmentId))
    ) {
      return NextResponse.json(
        { error: 'Sebagian bukti transkrip tidak dapat diakses.' },
        { status: 403 },
      );
    }

    const transcriptCharacters = segments.reduce(
      (total, segment) => total + segment.text.length,
      0,
    );
    if (transcriptCharacters > MAX_CONTEXT_TRANSCRIPT_CHARACTERS) {
      return NextResponse.json(
        { error: 'Halaman transkrip terlalu panjang untuk dianalisis sekaligus.' },
        { status: 413 },
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { error: 'Layanan analisis konteks belum tersedia.' },
        { status: 500 },
      );
    }

    const requestId = crypto.randomUUID();
    const providerResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_LLM_MODEL,
        messages: [{ role: 'user', content: buildTranscriptContextPrompt(segments) }],
        temperature: 0.1,
        max_tokens: 2_500,
      }),
      signal: AbortSignal.timeout(CONTEXT_REQUEST_TIMEOUT_MS),
    });

    if (!providerResponse.ok) {
      console.error('[transcript-context] provider request failed', {
        status: providerResponse.status,
      });
      return NextResponse.json(
        { error: 'Nalira belum berhasil menganalisis konteks halaman ini.' },
        { status: 502 },
      );
    }

    const providerData: unknown = await providerResponse.json();
    const suggestions = normalizeTranscriptContextSuggestions(
      parseCompletionContent(providerData),
      requestData.segmentIds,
    );
    const completionUsage = parseGroqCompletionUsage(providerData);

    await recordAiUsageSafely(createAiUsageEvent({
      userId: access.userId,
      requestId,
      operation: 'context',
      stage: 'generation',
      model: GROQ_LLM_MODEL,
      providerRequestId: parseGroqProviderRequestId(providerData),
      ...(completionUsage ?? {}),
    }), { bypassed: access.bypassed });

    return NextResponse.json({ suggestions });
  } catch {
    console.error('[transcript-context] request failed');
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat menganalisis konteks.' },
      { status: 500 },
    );
  }
}
