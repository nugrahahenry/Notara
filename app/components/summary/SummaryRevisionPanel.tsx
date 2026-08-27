'use client';

import {
  Check,
  GitCompareArrows,
  History,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  applySummaryRevision,
  generateSummaryRevision,
  readSummaryRevisionHistory,
  SummaryRevisionRequestError,
} from '@/lib/summary/revision-reader';
import {
  getSummaryRevisionErrorCopy,
  type AppliedSummaryRevision,
  type SummaryRevision,
} from '@/lib/summary/revisions';
import styles from './SummaryRevisionPanel.module.css';

interface SummaryRevisionPanelProps {
  summaryId: string;
  currentSummary: string;
  activeRevisionId?: string | null;
  revisionEpoch?: number;
  enabled: boolean;
  renderSummary: (content: string) => ReactNode;
  onApplied: (revision: AppliedSummaryRevision) => void;
}

interface PanelNotice {
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail: string;
}

const HISTORY_UNAVAILABLE: PanelNotice = {
  tone: 'warning',
  title: 'Riwayat versi belum dapat dimuat',
  detail: 'Rangkuman aktif tetap aman. Coba muat ulang; pada instalasi baru, pastikan pembaruan database sudah diterapkan.',
};

function formatRevisionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function revisionLabel(revision: SummaryRevision): string {
  if (revision.sourceKind === 'original') return 'Versi awal';
  return `Versi ${revision.version}`;
}

export function SummaryRevisionPanel({
  summaryId,
  currentSummary,
  activeRevisionId: activeRevisionIdProp = null,
  revisionEpoch: revisionEpochProp = 0,
  enabled,
  renderSummary,
  onApplied,
}: SummaryRevisionPanelProps) {
  const [history, setHistory] = useState<SummaryRevision[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'unavailable'>(
    enabled ? 'loading' : 'unavailable',
  );
  const [candidate, setCandidate] = useState<SummaryRevision | null>(null);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(activeRevisionIdProp);
  const [revisionEpoch, setRevisionEpoch] = useState(revisionEpochProp);
  const [pendingClientRequestId, setPendingClientRequestId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [applyingRevisionId, setApplyingRevisionId] = useState<string | null>(null);
  const [restoreConfirmationId, setRestoreConfirmationId] = useState<string | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const mountedRef = useRef(true);
  const actionInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!enabled) {
      setHistoryState('unavailable');
      return;
    }
    setHistoryState('loading');
    try {
      const revisions = await readSummaryRevisionHistory(summaryId);
      if (!mountedRef.current) return;
      setHistory(revisions);
      setHistoryState('ready');
    } catch {
      if (!mountedRef.current) return;
      setHistory([]);
      setHistoryState('unavailable');
    }
  }, [enabled, summaryId]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void readSummaryRevisionHistory(summaryId)
      .then((revisions) => {
        if (!active) return;
        setHistory(revisions);
        setHistoryState('ready');
      })
      .catch(() => {
        if (!active) return;
        setHistory([]);
        setHistoryState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [enabled, summaryId]);

  const handleGenerate = async () => {
    if (!enabled || actionInFlightRef.current || isGenerating || applyingRevisionId) return;
    actionInFlightRef.current = true;
    const clientRequestId = pendingClientRequestId ?? crypto.randomUUID();
    setPendingClientRequestId(clientRequestId);
    setIsGenerating(true);
    setNotice({
      tone: 'info',
      title: pendingClientRequestId ? 'Memeriksa preview yang sama' : 'Membuat preview privat',
      detail: 'Versi aktif tidak berubah selama Nalira membaca keputusan konteks terbaru.',
    });

    try {
      const result = await generateSummaryRevision({ summaryId, clientRequestId });
      if (!mountedRef.current) return;
      setCandidate(result.candidate);
      setActiveRevisionId(result.activeRevisionId);
      setRevisionEpoch(result.revisionEpoch);
      setPendingClientRequestId(null);
      setNotice({
        tone: 'success',
        title: result.replayed ? 'Preview ditemukan kembali' : 'Preview siap dibandingkan',
        detail: 'Periksa perbedaannya. Tidak ada bagian yang diterapkan otomatis.',
      });
      await refreshHistory();
    } catch (error) {
      if (!mountedRef.current) return;
      const requestError = error instanceof SummaryRevisionRequestError ? error : null;
      const shouldRetainRequest = requestError?.status === null
        || requestError?.status === 202
        || (requestError?.status === 500 && requestError.code !== 'internal_error');
      if (!shouldRetainRequest) setPendingClientRequestId(null);
      if (requestError?.status === 202) {
        setNotice({
          tone: 'info',
          title: 'Preview masih diproses',
          detail: 'Tekan “Cek preview” untuk memeriksa request yang sama tanpa membuat duplikat.',
        });
      } else {
        const copy = getSummaryRevisionErrorCopy(
          requestError ? requestError.status : 500,
          requestError?.code,
        );
        setNotice({ tone: 'error', ...copy });
      }
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setIsGenerating(false);
    }
  };

  const handleApply = async (
    revision: SummaryRevision,
    intent: 'apply_candidate' | 'restore_accepted',
  ) => {
    if (
      !enabled
      || actionInFlightRef.current
      || applyingRevisionId
      || isGenerating
      || !activeRevisionId
      || (intent === 'apply_candidate' && revision.parentRevisionId !== activeRevisionId)
    ) return;

    actionInFlightRef.current = true;
    setApplyingRevisionId(revision.id);
    setNotice({
      tone: 'info',
      title: intent === 'apply_candidate' ? 'Menggunakan versi pilihan' : 'Memulihkan versi lama',
      detail: 'Nalira sedang memastikan versi aktif dan keputusan konteks belum berubah.',
    });
    try {
      const applied = await applySummaryRevision({
        summaryId,
        revisionId: revision.id,
        expectedActiveRevisionId: activeRevisionId,
        expectedRevisionEpoch: revisionEpoch,
        intent,
      });
      if (!mountedRef.current) return;
      setActiveRevisionId(applied.activeRevisionId);
      setRevisionEpoch(applied.revisionEpoch);
      setCandidate(null);
      setRestoreConfirmationId(null);
      setNotice({
        tone: 'success',
        title: intent === 'apply_candidate' ? 'Versi baru sudah aktif' : 'Versi lama sudah dipulihkan',
        detail: 'Guided, Chat, Share, dan ekspor kini menggunakan rangkuman aktif ini.',
      });
      onApplied(applied);
      await refreshHistory();
    } catch (error) {
      if (!mountedRef.current) return;
      const requestError = error instanceof SummaryRevisionRequestError ? error : null;
      const copy = getSummaryRevisionErrorCopy(
        requestError ? requestError.status : 500,
        requestError?.code,
      );
      setNotice({ tone: 'error', ...copy });
      await refreshHistory();
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setApplyingRevisionId(null);
    }
  };

  const candidateIsFresh = Boolean(
    candidate
    && activeRevisionId
    && candidate.state === 'candidate'
    && candidate.parentRevisionId === activeRevisionId,
  );
  const candidateIsActive = Boolean(candidate && candidate.id === activeRevisionId);
  const busy = isGenerating || applyingRevisionId !== null;

  return (
    <section className={styles.panel} aria-labelledby={`summary-revision-title-${summaryId}`}>
      <div className={styles.header}>
        <div className={styles.headerIcon} aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div className={styles.headerCopy}>
          <div className={styles.eyebrow}>
            <LockKeyhole size={13} aria-hidden="true" />
            Preview privat
          </div>
          <h2 id={`summary-revision-title-${summaryId}`}>Perbarui dari keputusan konteks</h2>
          <p>
            Buat versi baru dari label dosen, diskusi, dan bagian yang perlu diprioritaskan—tanpa menimpa rangkuman aktif.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            aria-expanded={historyOpen}
            aria-controls={`summary-revision-history-${summaryId}`}
            disabled={!enabled}
            onClick={() => setHistoryOpen((value) => !value)}
          >
            <History size={16} aria-hidden="true" />
            Riwayat{historyState === 'ready' && history.length > 0 ? ` (${history.length})` : ''}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!enabled || busy}
            onClick={() => void handleGenerate()}
          >
            {isGenerating ? (
              <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
            ) : pendingClientRequestId ? (
              <RefreshCw size={16} aria-hidden="true" />
            ) : (
              <GitCompareArrows size={16} aria-hidden="true" />
            )}
            {isGenerating ? 'Membuat preview…' : pendingClientRequestId ? 'Cek preview' : 'Buat preview baru'}
          </button>
        </div>
      </div>

      {!enabled && (
        <div className={styles.disabledNote}>
          Preview hanya tersedia untuk materi tersimpan milikmu.
        </div>
      )}

      {historyState === 'unavailable' && enabled && (
        <div className={styles.notice} data-tone="warning" role="status">
          <span aria-hidden="true">!</span>
          <div>
            <strong>{HISTORY_UNAVAILABLE.title}</strong>
            <p>{HISTORY_UNAVAILABLE.detail}</p>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={styles.notice}
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
        >
          {notice.tone === 'success' ? <Check size={16} aria-hidden="true" /> : <span aria-hidden="true">i</span>}
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.detail}</p>
          </div>
          <button type="button" aria-label="Tutup pemberitahuan" onClick={() => setNotice(null)}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {candidate && (
        <div className={styles.comparison} aria-busy={applyingRevisionId === candidate.id}>
          <div className={styles.comparisonHeader}>
            <div>
              <span>Perbandingan versi</span>
              <strong>
                {candidateIsActive
                  ? `${revisionLabel(candidate)} sudah aktif`
                  : candidate.state === 'accepted'
                    ? `${revisionLabel(candidate)} tersimpan`
                    : `${revisionLabel(candidate)} belum aktif`}
              </strong>
            </div>
            <button type="button" className={styles.iconButton} aria-label="Tutup perbandingan" onClick={() => setCandidate(null)}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.comparisonGrid}>
            <article className={styles.previewColumn}>
              <div className={styles.previewLabel}>
                <span>Versi aktif</span>
                <small>Acuan saat ini</small>
              </div>
              <div className={styles.previewContent}>{renderSummary(currentSummary)}</div>
            </article>
            <article className={styles.previewColumn} data-candidate="true">
              <div className={styles.previewLabel}>
                <span>Preview baru</span>
                <small>{formatRevisionDate(candidate.createdAt)}</small>
              </div>
              <div className={styles.previewContent}>{renderSummary(candidate.content)}</div>
            </article>
          </div>
          <div className={styles.comparisonFooter}>
            <p>
              {candidateIsFresh
                ? 'Tidak diterapkan otomatis. Rangkuman aktif tetap dapat dipulihkan dari riwayat.'
                : candidateIsActive
                  ? 'Versi ini sudah menjadi rangkuman aktif.'
                  : candidate.state === 'accepted'
                    ? 'Versi ini pernah digunakan. Pulihkan secara eksplisit melalui riwayat untuk menjadikannya aktif lagi.'
                    : 'Preview ini dibuat dari versi atau keputusan konteks yang lebih lama. Buat preview baru untuk menerapkannya.'}
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!candidateIsFresh || busy}
              onClick={() => void handleApply(candidate, 'apply_candidate')}
            >
              {applyingRevisionId === candidate.id
                ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                : <Check size={16} aria-hidden="true" />}
              {applyingRevisionId === candidate.id
                ? 'Menerapkan…'
                : candidateIsActive
                  ? 'Sudah aktif'
                  : candidate.state === 'accepted'
                    ? 'Gunakan riwayat'
                    : 'Gunakan versi ini'}
            </button>
          </div>
        </div>
      )}

      {historyOpen && (
        <div id={`summary-revision-history-${summaryId}`} className={styles.history}>
          <div className={styles.historyHeading}>
            <div>
              <h3>Riwayat rangkuman</h3>
              <p>Maksimal 25 versi. Memulihkan versi lama tidak menghapus versi lain.</p>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Muat ulang riwayat"
              disabled={historyState === 'loading' || busy}
              onClick={() => void refreshHistory()}
            >
              <RefreshCw className={historyState === 'loading' ? styles.spinner : undefined} size={17} aria-hidden="true" />
            </button>
          </div>

          {historyState === 'loading' && (
            <div className={styles.historyEmpty} role="status">
              <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" />
              Memuat riwayat…
            </div>
          )}
          {historyState === 'ready' && history.length === 0 && (
            <div className={styles.historyEmpty}>Riwayat akan muncul setelah preview pertama dibuat.</div>
          )}
          {historyState === 'ready' && history.length > 0 && (
            <ol className={styles.historyList}>
              {history.map((revision) => {
                const isActive = revision.id === activeRevisionId;
                const isConfirmingRestore = restoreConfirmationId === revision.id;
                const canRestore = revision.state === 'accepted' && !isActive && Boolean(activeRevisionId);
                return (
                  <li key={revision.id} data-active={isActive}>
                    <div className={styles.historyMarker} aria-hidden="true" />
                    <div className={styles.historyCopy}>
                      <div>
                        <strong>{revisionLabel(revision)}</strong>
                        <span data-state={isActive ? 'active' : revision.state}>
                          {isActive ? 'Aktif' : revision.state === 'candidate' ? 'Preview' : 'Tersimpan'}
                        </span>
                      </div>
                      <small>{formatRevisionDate(revision.createdAt)}</small>
                    </div>
                    <div className={styles.historyActions}>
                      {revision.state === 'candidate' && !isActive && (
                        <button type="button" className={styles.textButton} onClick={() => setCandidate(revision)}>
                          <GitCompareArrows size={15} aria-hidden="true" />
                          Bandingkan
                        </button>
                      )}
                      {canRestore && !isConfirmingRestore && (
                        <button
                          type="button"
                          className={styles.textButton}
                          disabled={busy}
                          onClick={() => setRestoreConfirmationId(revision.id)}
                        >
                          <RotateCcw size={15} aria-hidden="true" />
                          Pulihkan
                        </button>
                      )}
                      {canRestore && isConfirmingRestore && (
                        <div className={styles.restoreConfirmation}>
                          <span>Jadikan aktif?</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleApply(revision, 'restore_accepted')}
                          >
                            {applyingRevisionId === revision.id
                              ? <LoaderCircle className={styles.spinner} size={14} aria-hidden="true" />
                              : <Check size={14} aria-hidden="true" />}
                            Ya
                          </button>
                          <button type="button" disabled={busy} onClick={() => setRestoreConfirmationId(null)}>Batal</button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
