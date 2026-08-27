import { PRODUCT_IDENTITY } from '../brand/identity';
import type { TranscriptQualityReport } from './contract';
import { buildGroundedSummaryPrompt } from './summary-prompt';

export const MAX_INITIAL_SUMMARY_PROMPT_CHARACTERS = 18_000;

export const DEFERRED_INITIAL_SUMMARY_HEADING = '# 📝 Transkrip siap dirangkum';

export const DEFERRED_INITIAL_SUMMARY_CONTENT = `${DEFERRED_INITIAL_SUMMARY_HEADING}

> Rekaman panjang sudah selesai ditranskrip. Rangkuman final belum dibuat agar seluruh isi dapat diproses bertahap tanpa memotong materi.

## Langkah berikutnya

Simpan materi ini beserta bukti waktunya, lalu gunakan **Buat rangkuman final**. Nalira akan menampilkan jumlah tahap dan tujuan pemrosesan sebelum mengirim bagian apa pun.`;

interface InitialSummaryPlanInput {
  transcript: string;
  quality: TranscriptQualityReport;
  glossary?: string[];
}

export interface InitialSummaryPlan {
  mode: 'single' | 'deferred';
  prompt: string;
  promptCharacters: number;
}

export function createInitialSummaryPlan({
  transcript,
  quality,
  glossary = [],
}: InitialSummaryPlanInput): InitialSummaryPlan {
  const prompt = buildGroundedSummaryPrompt({
    transcript,
    quality,
    glossary,
    productName: PRODUCT_IDENTITY.name,
  });

  return {
    mode: prompt.length > MAX_INITIAL_SUMMARY_PROMPT_CHARACTERS
      ? 'deferred'
      : 'single',
    prompt,
    promptCharacters: prompt.length,
  };
}

export function isDeferredInitialSummary(content: string): boolean {
  return content.trimStart().startsWith(DEFERRED_INITIAL_SUMMARY_HEADING);
}

export function titleFromCaptureName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/u, '');
  const normalized = withoutExtension
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 160);

  return normalized || 'Materi Baru';
}
