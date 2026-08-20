'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  RefreshCw,
  SearchX,
  ShieldCheck,
} from 'lucide-react';
import { readTranscriptEvidencePage } from '@/lib/transcript/evidence-reader';
import {
  formatTranscriptTimecode,
  type TranscriptEvidenceFilter,
  type TranscriptEvidencePage,
} from '@/lib/transcript/evidence';

interface TranscriptEvidenceReviewProps {
  summaryId: string;
  aggregateTranscript: string;
  evidenceEnabled: boolean;
}

type EvidenceState =
  | { status: 'loading' }
  | { status: 'ready'; data: TranscriptEvidencePage }
  | { status: 'missing' }
  | { status: 'error' };

const QUALITY_COPY = {
  good: {
    label: 'Terbaca baik',
    title: 'Transkrip ini cukup jelas untuk dipelajari',
    description: 'Nalira tidak menemukan sinyal kualitas utama yang perlu diperiksa ulang.',
  },
  review: {
    label: 'Perlu ditinjau',
    title: 'Ada bagian yang sebaiknya kamu periksa',
    description: 'Gunakan filter bagian kurang jelas sebelum menjadikan transkrip sebagai acuan utama.',
  },
  poor: {
    label: 'Kualitas rendah',
    title: 'Sebagian ucapan mungkin tidak tertangkap dengan baik',
    description: 'Rangkuman tetap tersedia, tetapi cek bagian yang ditandai sebelum belajar dari detailnya.',
  },
} as const;

function AggregateTranscript({
  transcript,
  note,
  onRetry,
}: {
  transcript: string;
  note?: string;
  onRetry?: () => void;
}) {
  return (
    <section className="notara-study-transcript" aria-label="Transkrip lengkap">
      <div className="notara-transcript-fallback-heading">
        <FileText className="h-4 w-4" aria-hidden="true" />
        <span>Transkrip lengkap</span>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Coba lagi
          </button>
        )}
      </div>
      {note && <p className="notara-transcript-fallback-note">{note}</p>}
      <p className="notara-transcript-fallback-copy">{transcript}</p>
    </section>
  );
}

function TranscriptEvidenceLoading() {
  return (
    <section className="notara-transcript-evidence notara-transcript-evidence--loading" aria-busy="true" aria-label="Memuat bukti waktu transkrip">
      <div className="notara-transcript-loading-heading" />
      <div className="notara-transcript-loading-line" />
      <div className="notara-transcript-loading-line" />
      <div className="notara-transcript-loading-line" />
      <p role="status">Menyiapkan bagian transkrip dan tanda waktunya…</p>
    </section>
  );
}

export function TranscriptEvidenceReview({
  summaryId,
  aggregateTranscript,
  evidenceEnabled,
}: TranscriptEvidenceReviewProps) {
  const [filter, setFilter] = useState<TranscriptEvidenceFilter>('all');
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<EvidenceState>(() => (
    evidenceEnabled ? { status: 'loading' } : { status: 'missing' }
  ));

  useEffect(() => {
    if (!evidenceEnabled) return;

    let active = true;

    void readTranscriptEvidencePage({ summaryId, page, filter })
      .then((data) => {
        if (!active) return;
        setState(data ? { status: 'ready', data } : { status: 'missing' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [evidenceEnabled, filter, page, retryKey, summaryId]);

  const pageRange = useMemo(() => {
    if (state.status !== 'ready' || state.data.total === 0) return null;
    const from = (state.data.page - 1) * state.data.pageSize + 1;
    const to = Math.min(state.data.total, from + state.data.segments.length - 1);
    return { from, to };
  }, [state]);

  if (!evidenceEnabled) {
    return <AggregateTranscript transcript={aggregateTranscript} />;
  }

  if (state.status === 'loading') return <TranscriptEvidenceLoading />;

  if (state.status === 'missing') {
    return (
      <AggregateTranscript
        transcript={aggregateTranscript}
        note="Tanda waktu belum tersedia untuk materi lama ini. Rekaman berikutnya akan menyimpan bagian transkrip secara bertahap."
      />
    );
  }

  if (state.status === 'error') {
    return (
      <AggregateTranscript
        transcript={aggregateTranscript}
        note="Bukti waktu belum bisa dimuat. Transkrip lengkap tetap dapat dibaca; periksa koneksi lalu coba lagi."
        onRetry={() => {
          setState({ status: 'loading' });
          setRetryKey((value) => value + 1);
        }}
      />
    );
  }

  const { data } = state;
  const quality = QUALITY_COPY[data.run.qualityStatus];
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const durationMs = data.run.qualityReport.durationSec
    ? data.run.qualityReport.durationSec * 1000
    : null;

  const changeFilter = (nextFilter: TranscriptEvidenceFilter) => {
    if (nextFilter === filter) return;
    setState({ status: 'loading' });
    setFilter(nextFilter);
    setPage(1);
  };

  const changePage = (nextPage: number) => {
    setState({ status: 'loading' });
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  return (
    <section className="notara-transcript-evidence" aria-labelledby="transcript-evidence-title">
      <header className="notara-transcript-evidence-header">
        <div>
          <h2 id="transcript-evidence-title">Transkrip bertanda waktu</h2>
          <p>Setiap bagian mempertahankan posisi waktunya di rekaman asal. Audio tidak disimpan oleh fitur ini.</p>
        </div>
        <span className="notara-transcript-private-label">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Hanya kamu
        </span>
      </header>

      <section className="notara-transcript-quality" data-quality={data.run.qualityStatus} aria-label={`Kualitas transkrip: ${quality.label}`}>
        <div className="notara-transcript-quality-icon" aria-hidden="true">
          {data.run.qualityStatus === 'good'
            ? <CheckCircle2 className="h-5 w-5" />
            : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="notara-transcript-quality-copy">
          <div>
            <strong>{quality.title}</strong>
            <span>{quality.label}</span>
          </div>
          <p>{quality.description}</p>
          {data.run.qualityReport.warnings.length > 0 && (
            <ul>
              {data.run.qualityReport.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="notara-transcript-evidence-meta" aria-label="Cakupan transkrip">
        <span><FileText className="h-4 w-4" aria-hidden="true" /> {new Intl.NumberFormat('id-ID').format(data.run.segmentCount)} bagian</span>
        {durationMs !== null && (
          <span><Clock3 className="h-4 w-4" aria-hidden="true" /> {formatTranscriptTimecode(durationMs)} rekaman</span>
        )}
        <span><Info className="h-4 w-4" aria-hidden="true" /> Tanda waktu menunjukkan posisi, bukan pemutar audio</span>
      </div>

      <div className="notara-transcript-filter-row">
        <div role="group" aria-label="Saring bagian transkrip">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => changeFilter('all')}>Semua bagian</button>
          <button type="button" aria-pressed={filter === 'unclear'} onClick={() => changeFilter('unclear')}>Bagian kurang jelas</button>
        </div>
        {pageRange && (
          <span aria-live="polite">{pageRange.from}–{pageRange.to} dari {new Intl.NumberFormat('id-ID').format(data.total)}</span>
        )}
      </div>

      {data.segments.length > 0 ? (
        <ol className="notara-transcript-segment-list" start={(data.page - 1) * data.pageSize + 1}>
          {data.segments.map((segment) => (
            <li key={segment.id} data-needs-review={segment.reviewReasons.length > 0}>
              <time dateTime={`PT${Math.floor(segment.startMs / 1000)}S`}>
                {formatTranscriptTimecode(segment.startMs)}
              </time>
              <div>
                <p>{segment.text}</p>
                {segment.reviewReasons.length > 0 && (
                  <div className="notara-transcript-segment-flags" aria-label="Alasan bagian perlu ditinjau">
                    {segment.reviewReasons.includes('low-confidence') && <span>Keyakinan transkripsi rendah</span>}
                    {segment.reviewReasons.includes('high-no-speech') && <span>Ucapan samar atau banyak jeda</span>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="notara-transcript-empty-filter" role="status">
          <SearchX className="h-6 w-6" aria-hidden="true" />
          <strong>{filter === 'unclear' ? 'Tidak ada bagian yang ditandai pada transkrip ini' : 'Belum ada bagian bertanda waktu'}</strong>
          <p>
            {filter === 'unclear'
              ? 'Nalira tidak menemukan metadata keyakinan rendah atau ucapan samar untuk filter ini.'
              : 'Materi ini memiliki catatan pemrosesan, tetapi tidak memiliki segmen yang dapat ditampilkan.'}
          </p>
          {filter === 'unclear' && (
            <button type="button" onClick={() => changeFilter('all')}>Lihat semua bagian</button>
          )}
        </div>
      )}

      {data.total > data.pageSize && (
        <nav className="notara-transcript-pagination" aria-label="Halaman transkrip">
          <button type="button" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Sebelumnya
          </button>
          <span>Halaman {data.page} dari {totalPages}</span>
          <button type="button" disabled={data.page >= totalPages} onClick={() => changePage(data.page + 1)}>
            Berikutnya <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  );
}
