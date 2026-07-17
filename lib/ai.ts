// lib/ai.ts — satu sumber kebenaran untuk konfigurasi model AI (Groq)
// Analogi: ini "papan nama koki". Kalau Groq mendepresiasi/ganti model,
// cukup ubah di SINI sekali, bukan berburu string di 3 route berbeda.
//
// Riwayat: `llama-3.3-70b-versatile` & `llama-3.1-8b-instant` di-deprecate
// Groq per 17 Jun 2026 (free & dev tier). Pengganti resmi: openai/gpt-oss-120b.

/** Model LLM untuk merangkum & chat. Alternatif lebih cepat/murah: 'qwen/qwen3.6-27b'. */
export const GROQ_LLM_MODEL = 'openai/gpt-oss-120b';

/** Model transkripsi audio (speech-to-text). */
export const GROQ_STT_MODEL = 'whisper-large-v3';
