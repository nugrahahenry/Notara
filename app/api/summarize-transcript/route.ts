import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL } from '../../../lib/ai';
import { authorizeAiRequest } from '../../../lib/api/ai-access';
import { getErrorMessage } from '../../../lib/api/boundary';
import {
  BoundedJsonBodyError,
  readBoundedJsonBody,
} from '../../../lib/api/bounded-json';
import {
  createAiUsageEvent,
  parseGroqCompletionUsage,
  parseGroqProviderRequestId,
} from '../../../lib/ai/usage';
import { recordAiUsageSafely } from '../../../lib/ai/usage-recorder';
import { PRODUCT_IDENTITY } from '../../../lib/brand/identity';
import {
  analyzeTranscriptQuality,
  normalizeTranscriptSegments,
  normalizeTranscriptGlossary,
} from '../../../lib/transcript/contract';
import { buildGroundedSummaryPrompt } from '../../../lib/transcript/summary-prompt';

const MAX_TRANSCRIPT_CHARACTERS = 300_000;
const MAX_TRANSCRIPT_SEGMENT_CHARACTERS = 500_000;
const MAX_SUMMARIZE_BODY_BYTES = 2_000_000;

interface SummarizeTranscriptPayload {
  transcript?: unknown;
  durationSec?: unknown;
  glossary?: unknown;
  segments?: unknown;
}

function parseDurationSec(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function parseSummaryText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';

  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return '';

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object') return '';

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return '';

  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content.trim() : '';
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeAiRequest('summarize');
    if (!access.ok) return access.response;

    const requestId = crypto.randomUUID();
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
      return NextResponse.json(
        { error: 'Konfigurasi layanan rangkuman belum tersedia.' },
        { status: 500 },
      );
    }

    let payload: SummarizeTranscriptPayload;
    try {
      payload = await readBoundedJsonBody<SummarizeTranscriptPayload>(
        request,
        MAX_SUMMARIZE_BODY_BYTES,
      );
    } catch (error) {
      if (error instanceof BoundedJsonBodyError) {
        return NextResponse.json(
          {
            error: error.code === 'body-too-large'
              ? 'Data transkrip terlalu besar untuk satu permintaan.'
              : 'Format data transkrip tidak valid.',
          },
          { status: error.code === 'body-too-large' ? 413 : 400 },
        );
      }
      throw error;
    }
    const transcript = typeof payload.transcript === 'string'
      ? payload.transcript.trim()
      : '';

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transkrip kosong. Tidak ada data yang bisa dirangkum.' },
        { status: 400 },
      );
    }

    if (transcript.length > MAX_TRANSCRIPT_CHARACTERS) {
      return NextResponse.json(
        { error: 'Transkrip terlalu panjang untuk dirangkum dalam satu permintaan.' },
        { status: 413 },
      );
    }

    const segments = normalizeTranscriptSegments(payload.segments);
    const segmentCharacters = segments.reduce(
      (total, segment) => total + segment.text.length,
      0,
    );
    if (segmentCharacters > MAX_TRANSCRIPT_SEGMENT_CHARACTERS) {
      return NextResponse.json(
        { error: 'Bukti segmen terlalu besar untuk satu permintaan.' },
        { status: 413 },
      );
    }
    const quality = analyzeTranscriptQuality({
      transcript,
      durationSec: parseDurationSec(payload.durationSec),
      segments,
    });
    const glossary = normalizeTranscriptGlossary(payload.glossary);
    const prompt = buildGroundedSummaryPrompt({
      transcript,
      quality,
      glossary,
      productName: PRODUCT_IDENTITY.name,
    });

    const llmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });

    if (!llmResponse.ok) {
      console.error('Groq summary request failed.', { status: llmResponse.status });
      return NextResponse.json(
        { error: 'Nalira belum berhasil membuat rangkuman.' },
        { status: 502 },
      );
    }

    const llmData: unknown = await llmResponse.json();
    const summary = parseSummaryText(llmData);

    if (!summary) {
      return NextResponse.json(
        { error: 'Layanan rangkuman mengembalikan hasil kosong.' },
        { status: 502 },
      );
    }

    const completionUsage = parseGroqCompletionUsage(llmData);

    await recordAiUsageSafely(createAiUsageEvent({
      userId: access.userId,
      requestId,
      operation: 'summarize',
      stage: 'generation',
      model: GROQ_LLM_MODEL,
      providerRequestId: parseGroqProviderRequestId(llmData),
      ...(completionUsage ?? {}),
    }), { bypassed: access.bypassed });

    return NextResponse.json({
      summary,
      quality,
      processing: {
        requestId,
        provider: 'groq',
        transcriptionModel: null,
        summaryModel: GROQ_LLM_MODEL,
      },
    });
  } catch (error: unknown) {
    console.error('Summarize transcript API failed.', {
      error: getErrorMessage(error, 'unknown-error'),
    });
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat membuat rangkuman.' },
      { status: 500 },
    );
  }
}
