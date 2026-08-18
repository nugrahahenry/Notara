import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL, GROQ_STT_MODEL } from '../../../lib/ai';
import { authorizeAiRequest } from '../../../lib/api/ai-access';
import { getErrorMessage } from '../../../lib/api/boundary';
import {
  createAiUsageEvent,
  parseGroqCompletionUsage,
  parseGroqProviderRequestId,
  parseGroqTranscriptionDurationMs,
} from '../../../lib/ai/usage';
import { recordAiUsageSafely } from '../../../lib/ai/usage-recorder';
import { PRODUCT_IDENTITY } from '../../../lib/brand/identity';
import {
  analyzeTranscriptQuality,
  normalizeGroqTranscriptSegments,
  normalizeTranscriptGlossary,
} from '../../../lib/transcript/contract';
import { buildGroundedSummaryPrompt } from '../../../lib/transcript/summary-prompt';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function parseTranscriptText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const text = (value as { text?: unknown }).text;
  return typeof text === 'string' ? text.trim() : '';
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
    const access = await authorizeAiRequest('capture');
    if (!access.ok) return access.response;

    const requestId = crypto.randomUUID();
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
      return NextResponse.json(
        { error: 'Konfigurasi layanan transkripsi belum tersedia.' },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const transcribeOnly = formData.get('transcribeOnly') === 'true';
    const glossary = normalizeTranscriptGlossary(formData.get('glossary'));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'File audio tidak ditemukan. Silakan upload file.' },
        { status: 400 },
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: 'File audio kosong.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'Bagian audio terlalu besar untuk satu permintaan transkripsi.' },
        { status: 413 },
      );
    }

    const groqFormData = new FormData();
    groqFormData.append('file', new Blob([await file.arrayBuffer()], { type: file.type }), file.name || 'audio.mp3');
    groqFormData.append('model', GROQ_STT_MODEL);
    groqFormData.append('language', 'id');
    groqFormData.append('response_format', 'verbose_json');
    groqFormData.append('timestamp_granularities[]', 'segment');

    if (glossary.length > 0) {
      groqFormData.append(
        'prompt',
        `Konteks kuliah Bahasa Indonesia. Ejaan istilah: ${glossary.join(', ')}`.slice(0, 700),
      );
    }

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: groqFormData,
    });

    if (!groqResponse.ok) {
      console.error('Groq transcription request failed.', { status: groqResponse.status });
      return NextResponse.json(
        { error: 'Nalira belum berhasil mentranskripsi audio.' },
        { status: 502 },
      );
    }

    const groqData: unknown = await groqResponse.json();
    const transcript = parseTranscriptText(groqData);

    if (!transcript) {
      return NextResponse.json(
        { error: 'Audio terlalu sunyi atau tidak ada suara yang bisa ditranskripsi.' },
        { status: 400 },
      );
    }

    const rawSegments = groqData && typeof groqData === 'object'
      ? (groqData as { segments?: unknown }).segments
      : null;
    const segments = normalizeGroqTranscriptSegments(rawSegments);
    const audioDurationMs = parseGroqTranscriptionDurationMs(groqData);
    const quality = analyzeTranscriptQuality({
      transcript,
      durationSec: audioDurationMs === null ? null : audioDurationMs / 1000,
      segments,
    });

    await recordAiUsageSafely(createAiUsageEvent({
      userId: access.userId,
      requestId,
      operation: 'capture',
      stage: 'transcription',
      model: GROQ_STT_MODEL,
      providerRequestId: parseGroqProviderRequestId(groqData),
      audioDurationMs,
    }), { bypassed: access.bypassed });

    if (transcribeOnly) {
      return NextResponse.json({ transcript, segments, quality });
    }

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
      operation: 'capture',
      stage: 'generation',
      model: GROQ_LLM_MODEL,
      providerRequestId: parseGroqProviderRequestId(llmData),
      ...(completionUsage ?? {}),
    }), { bypassed: access.bypassed });

    return NextResponse.json({ transcript, summary, segments, quality });
  } catch (error: unknown) {
    console.error('Capture API failed.', {
      error: getErrorMessage(error, 'unknown-error'),
    });
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat memproses audio.' },
      { status: 500 },
    );
  }
}
