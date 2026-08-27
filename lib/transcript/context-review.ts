import type { TranscriptContextSuggestion } from './context';

export interface TranscriptContextAnalysisErrorCopy {
  title: string;
  detail: string;
}

export function transcriptContextNeedsPriorityReview(
  suggestion: TranscriptContextSuggestion,
): boolean {
  return suggestion.confidence === 'low'
    || suggestion.proposedContext === 'unknown'
    || suggestion.proposedTreatment === 'deprioritize';
}

export function getTranscriptContextAnalysisErrorCopy(
  status: number | null,
  online: boolean,
): TranscriptContextAnalysisErrorCopy {
  if (!online || status === null) {
    return {
      title: 'Koneksi ke Nalira terputus',
      detail: 'Periksa koneksi internet, lalu coba lagi. Usulan yang sudah tampil tetap dipertahankan.',
    };
  }

  if (status === 401) {
    return {
      title: 'Sesi belajarmu perlu diperbarui',
      detail: 'Muat ulang halaman dan masuk lagi jika diminta. Transkrip serta keputusan tersimpan tetap aman.',
    };
  }

  if (status === 403 || status === 404) {
    return {
      title: 'Materi ini belum dapat dianalisis',
      detail: 'Pastikan materi masih tersedia di akunmu, lalu muat ulang halaman.',
    };
  }

  if (status === 413) {
    return {
      title: 'Halaman ini terlalu panjang untuk sekali analisis',
      detail: 'Gunakan filter bagian kurang jelas atau pindah halaman, lalu jalankan analisis lagi.',
    };
  }

  if (status === 429) {
    return {
      title: 'Batas analisis sementara tercapai',
      detail: 'Tunggu beberapa menit sebelum mencoba lagi. Review dan keputusan yang sudah ada tidak berubah.',
    };
  }

  if (status === 502 || status === 503) {
    return {
      title: 'Analisis belum selesai dengan utuh',
      detail: 'Layanan AI berhenti sebelum semua bagian selesai. Coba lagi; tidak ada keputusan yang disimpan otomatis.',
    };
  }

  return {
    title: 'Analisis konteks belum berhasil',
    detail: 'Coba lagi beberapa saat. Transkrip dan hasil review sebelumnya tidak hilang.',
  };
}
