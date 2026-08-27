'use client';

import {
  Check,
  GitCompareArrows,
  History,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
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
  generateHierarchicalSummaryStep,
  generateSummaryRevision,
  readSummaryRegenerationPlan,
  readSummaryRevisionHistory,
  startHierarchicalSummaryRevision,
  type SummaryRegenerationPlanView,
  SummaryRevisionRequestError,
} from '@/lib/summary/revision-reader';
import {
  getSummaryRevisionErrorCopy,
  type AppliedSummaryRevision,
  type HierarchicalSummaryProgress,
  type SummaryRevision,
} from '@/lib/summary/revisions';
import { isDeferredInitialSummary } from '@/lib/transcript/initial-summary';
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
  const [isPlanning, setIsPlanning] = useState(false);
  const [hierarchicalPlan, setHierarchicalPlan] = useState<SummaryRegenerationPlanView | null>(null);
  const [hierarchicalProgress, setHierarchicalProgress] = useState<HierarchicalSummaryProgress | null>(null);
  const [hierarchicalPaused, setHierarchicalPaused] = useState(true);
  const [retryConfirmationStageId, setRetryConfirmationStageId] = useState<string | null>(null);
  const [applyingRevisionId, setApplyingRevisionId] = useState<string | null>(null);
  const [restoreConfirmationId, setRestoreConfirmationId] = useState<string | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const mountedRef = useRef(true);
  const actionInFlightRef = useRef(false);
  const hierarchicalBusyRef = useRef(false);
  const hierarchicalPausedRef = useRef(true);
  const hierarchicalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runHierarchicalStepRef = useRef<((
    progress: HierarchicalSummaryProgress,
    retryStageId?: string | null,
  ) => Promise<void>) | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (hierarchicalTimerRef.current) clearTimeout(hierarchicalTimerRef.current);
    };
  }, []);

  const setPausedState = useCallback((value: boolean) => {
    hierarchicalPausedRef.current = value;
    setHierarchicalPaused(value);
    if (value && hierarchicalTimerRef.current) {
      clearTimeout(hierarchicalTimerRef.current);
      hierarchicalTimerRef.current = null;
    }
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

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void readSummaryRegenerationPlan(summaryId, controller.signal)
      .then((plan) => {
        if (!mountedRef.current || !plan.progress) return;
        setHierarchicalPlan(plan);
        setHierarchicalProgress(plan.progress);
        setPausedState(true);
        if (plan.progress.candidate) setCandidate(plan.progress.candidate);
        if (plan.progress.requestState === 'generating') {
          setNotice({
            tone: plan.progress.failedStageId ? 'warning' : 'info',
            title: plan.progress.failedStageId ? 'Satu tahap perlu diulang' : 'Preview panjang dijeda',
            detail: plan.progress.failedStageId
              ? 'Tahap yang gagal tidak diulang otomatis. Periksa lalu pilih “Ulangi tahap”.'
              : `Progres ${plan.progress.completedStageCount} dari ${plan.progress.stageCount} tahap tersimpan. Lanjutkan saat siap.`,
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, setPausedState, summaryId]);

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

  const runHierarchicalStep = useCallback(async (
    progress: HierarchicalSummaryProgress,
    retryStageId: string | null = null,
  ) => {
    if (
      hierarchicalBusyRef.current
      || hierarchicalPausedRef.current
      || progress.requestState !== 'generating'
      || (!retryStageId && progress.failedStageId)
    ) return;
    hierarchicalBusyRef.current = true;
    setIsGenerating(true);
    setNotice({
      tone: 'info',
      title: retryStageId ? 'Mengulangi satu tahap' : `Menjalankan tahap ${progress.completedStageCount + 1} dari ${progress.stageCount}`,
      detail: 'Hanya satu request dikirim ke Groq. Rangkuman aktif tetap tidak berubah.',
    });
    try {
      const updated = await generateHierarchicalSummaryStep({
        requestId: progress.requestId,
        clientStepId: crypto.randomUUID(),
        retryStageId,
      });
      if (!mountedRef.current) return;
      setHierarchicalProgress(updated);
      setRetryConfirmationStageId(null);
      if (updated.candidate) {
        setCandidate(updated.candidate);
        setActiveRevisionId(updated.activeRevisionId);
        setRevisionEpoch(updated.revisionEpoch);
      }
      if (updated.requestState === 'completed') {
        setPausedState(true);
        setNotice({
          tone: 'success',
          title: 'Preview panjang siap dibandingkan',
          detail: 'Semua tahap selesai. Tidak ada bagian yang diterapkan otomatis.',
        });
        await refreshHistory();
      } else if (updated.failedStageId) {
        setPausedState(true);
        setNotice({
          tone: 'warning',
          title: 'Satu tahap perlu diulang',
          detail: 'Hasil tahap sebelumnya tetap tersimpan. Tahap gagal hanya berjalan lagi setelah konfirmasi.',
        });
      } else if (!hierarchicalPausedRef.current) {
        const target = updated.nextStepAt ? new Date(updated.nextStepAt).getTime() : Date.now();
        const delay = Math.max(target - Date.now(), 0);
        setNotice({
          tone: 'info',
          title: `${updated.completedStageCount} dari ${updated.stageCount} tahap selesai`,
          detail: delay > 1_000
            ? `Tahap berikutnya menunggu pacing paket gratis sekitar ${Math.ceil(delay / 1_000)} detik.`
            : 'Tahap berikutnya segera dimulai.',
        });
        hierarchicalTimerRef.current = setTimeout(() => {
          hierarchicalTimerRef.current = null;
          void runHierarchicalStepRef.current?.(updated);
        }, delay);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setPausedState(true);
      const requestError = error instanceof SummaryRevisionRequestError ? error : null;
      const copy = requestError?.code === 'stage_output_truncated'
        ? {
          title: 'Tahap terpotong sebelum selesai',
          detail: 'Progres sebelumnya tetap aman. Percobaan ulang memakai 1 request Groq tambahan.',
        }
        : getSummaryRevisionErrorCopy(requestError?.status ?? 500, requestError?.code);
      setNotice({
        tone: 'error',
        title: requestError?.status === 429 ? 'Tahap menunggu batas provider' : copy.title,
        detail: requestError?.status === 429
          ? 'Tahap tidak diulang otomatis. Lanjutkan lagi setelah batas paket gratis tersedia.'
          : copy.detail,
      });
      try {
        const refreshed = await readSummaryRegenerationPlan(summaryId);
        if (mountedRef.current && refreshed.progress) {
          setHierarchicalPlan(refreshed);
          setHierarchicalProgress(refreshed.progress);
        }
      } catch {
        // Notice utama sudah menjelaskan kegagalan; refresh progres boleh dicoba kembali manual.
      }
    } finally {
      hierarchicalBusyRef.current = false;
      if (mountedRef.current) setIsGenerating(false);
    }
  }, [refreshHistory, setPausedState, summaryId]);
  useEffect(() => {
    runHierarchicalStepRef.current = runHierarchicalStep;
  }, [runHierarchicalStep]);

  const handlePlanOrGenerate = async () => {
    if (!enabled || actionInFlightRef.current || isGenerating || isPlanning || applyingRevisionId) return;
    setIsPlanning(true);
    setNotice({
      tone: 'info',
      title: 'Menghitung kebutuhan preview',
      detail: 'Nalira memeriksa seluruh evidence secara privat tanpa mengirimkannya ke provider.',
    });
    try {
      const plan = await readSummaryRegenerationPlan(summaryId);
      if (!mountedRef.current) return;
      setHierarchicalPlan(plan);
      if (plan.progress) {
        setHierarchicalProgress(plan.progress);
        setPausedState(true);
        if (plan.progress.candidate) setCandidate(plan.progress.candidate);
        setNotice({
          tone: plan.progress.requestState === 'completed' ? 'success' : 'info',
          title: plan.progress.requestState === 'completed' ? 'Preview ditemukan kembali' : 'Progres ditemukan kembali',
          detail: plan.progress.requestState === 'completed'
            ? 'Preview siap dibandingkan.'
            : `${plan.progress.completedStageCount} dari ${plan.progress.stageCount} tahap sudah tersimpan.`,
        });
      } else if (plan.mode === 'single') {
        setHierarchicalPlan(null);
        await handleGenerate();
      } else if (plan.mode === 'unsupported') {
        setNotice({
          tone: 'error',
          title: 'Materi belum dapat diproses utuh',
          detail: plan.unsupportedReason === 'evidence-too-large'
            ? 'Evidence melampaui 90.000 karakter. Nalira tidak akan memotong sumber secara diam-diam.'
            : 'Struktur evidence tidak memenuhi batas kelengkapan dan keamanan saat ini.',
        });
      } else {
        setPausedState(true);
        setNotice(null);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const requestError = error instanceof SummaryRevisionRequestError ? error : null;
      const copy = getSummaryRevisionErrorCopy(requestError?.status ?? 500, requestError?.code);
      setNotice({ tone: 'error', ...copy });
    } finally {
      if (mountedRef.current) setIsPlanning(false);
    }
  };

  const handleStartHierarchy = async () => {
    if (!hierarchicalPlan || hierarchicalPlan.mode !== 'hierarchical' || isGenerating) return;
    setIsGenerating(true);
    try {
      const progress = await startHierarchicalSummaryRevision({
        summaryId,
        clientRequestId: crypto.randomUUID(),
        planDigest: hierarchicalPlan.planDigest,
      });
      if (!mountedRef.current) return;
      setHierarchicalProgress(progress);
      setPausedState(false);
      await runHierarchicalStep(progress);
    } catch (error) {
      if (!mountedRef.current) return;
      const requestError = error instanceof SummaryRevisionRequestError ? error : null;
      const copy = getSummaryRevisionErrorCopy(requestError?.status ?? 500, requestError?.code);
      setNotice({ tone: 'error', ...copy });
    } finally {
      if (mountedRef.current && !hierarchicalBusyRef.current) setIsGenerating(false);
    }
  };

  const handleResumeHierarchy = () => {
    if (!hierarchicalProgress || hierarchicalProgress.failedStageId) return;
    setPausedState(false);
    const target = hierarchicalProgress.nextStepAt
      ? new Date(hierarchicalProgress.nextStepAt).getTime()
      : Date.now();
    const delay = Math.max(target - Date.now(), 0);
    hierarchicalTimerRef.current = setTimeout(() => {
      hierarchicalTimerRef.current = null;
      void runHierarchicalStep(hierarchicalProgress);
    }, delay);
    setNotice({
      tone: 'info',
      title: 'Preview panjang dilanjutkan',
      detail: delay > 1_000
        ? `Tahap berikutnya menunggu sekitar ${Math.ceil(delay / 1_000)} detik.`
        : 'Tahap berikutnya segera dimulai.',
    });
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
  const busy = isGenerating || isPlanning || applyingRevisionId !== null;
  const initialSummaryPending = isDeferredInitialSummary(currentSummary);

  return (
    <section className={styles.panel} aria-labelledby={`summary-revision-title-${summaryId}`}>
      <div className={styles.header}>
        <div className={styles.headerIcon} aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div className={styles.headerCopy}>
          <div className={styles.privacyLabel}>
            <LockKeyhole size={13} aria-hidden="true" />
            Preview privat
          </div>
          <h2 id={`summary-revision-title-${summaryId}`}>
            {initialSummaryPending ? 'Buat rangkuman final' : 'Perbarui dari keputusan konteks'}
          </h2>
          <p>
            {initialSummaryPending
              ? 'Susun seluruh transkrip bertahap sebagai preview privat sebelum menjadikannya rangkuman aktif.'
              : 'Buat versi baru dari label dosen, diskusi, dan bagian yang perlu diprioritaskan—tanpa menimpa rangkuman aktif.'}
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
            onClick={() => void handlePlanOrGenerate()}
          >
            {isGenerating || isPlanning ? (
              <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
            ) : pendingClientRequestId ? (
              <RefreshCw size={16} aria-hidden="true" />
            ) : (
              <GitCompareArrows size={16} aria-hidden="true" />
            )}
            {isPlanning
              ? 'Menghitung tahap…'
              : isGenerating
                ? 'Membuat preview…'
                : pendingClientRequestId
                  ? 'Cek preview'
                  : initialSummaryPending
                    ? 'Buat rangkuman final'
                    : 'Buat preview baru'}
          </button>
        </div>
      </div>

      {hierarchicalPlan?.mode === 'hierarchical' && !hierarchicalProgress && (
        <div className={styles.workflowDisclosure} role="group" aria-labelledby={`hierarchical-plan-${summaryId}`}>
          <div>
            <h3 id={`hierarchical-plan-${summaryId}`}>Materi ini membutuhkan {hierarchicalPlan.plannedCalls} tahap</h3>
            <p>
              {hierarchicalPlan.plannedCalls} request direncanakan untuk {hierarchicalPlan.plannedCalls} tahap bila setiap tahap berhasil sekali jalan.
              Setiap percobaan ulang menambah 1 request Groq setelah konfirmasi.
              Menutup tab akan menjeda proses; tahap yang selesai tetap tersimpan privat.
            </p>
          </div>
          <dl>
            <div><dt>Tujuan</dt><dd>Groq</dd></div>
            <div><dt>Evidence</dt><dd>{new Intl.NumberFormat('id-ID').format(hierarchicalPlan.sourceCharacters)} karakter</dd></div>
            <div><dt>Pacing</dt><dd>±{hierarchicalPlan.pacingSeconds} dtk/tahap</dd></div>
          </dl>
          <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void handleStartHierarchy()}>
            <Play size={16} aria-hidden="true" />
            Mulai {hierarchicalPlan.plannedCalls} tahap
          </button>
        </div>
      )}

      {hierarchicalProgress?.requestState === 'generating' && (
        <div className={styles.workflowProgress} aria-live="polite" aria-busy={isGenerating}>
          <div className={styles.progressCopy}>
            <strong>{hierarchicalProgress.completedStageCount} dari {hierarchicalProgress.stageCount} tahap selesai</strong>
            <span>
              {hierarchicalProgress.failedStageId
                ? hierarchicalProgress.failureCode === 'invalid_output'
                  ? 'Format hasil belum utuh. Retry tidak berjalan otomatis.'
                  : 'Tahap gagal menunggu keputusanmu.'
                : hierarchicalPaused ? 'Dijeda aman. Progres tersimpan.' : 'Berjalan satu tahap pada satu waktu.'}
            </span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Progres preview rangkuman"
            aria-valuemin={0}
            aria-valuemax={hierarchicalProgress.stageCount}
            aria-valuenow={hierarchicalProgress.completedStageCount}
          >
            <span style={{ width: `${(hierarchicalProgress.completedStageCount / hierarchicalProgress.stageCount) * 100}%` }} />
          </div>
          <div className={styles.progressActions}>
            {hierarchicalProgress.failedStageId ? (
              retryConfirmationStageId === hierarchicalProgress.failedStageId ? (
                <div className={styles.retryConfirmation} role="group" aria-label="Konfirmasi 1 request tambahan">
                  <span>Retry ini mengirim 1 request tambahan ke Groq. Rangkuman aktif tetap aman.</span>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={busy}
                    onClick={() => {
                      const stageId = hierarchicalProgress.failedStageId;
                      setRetryConfirmationStageId(null);
                      setPausedState(false);
                      void runHierarchicalStep(hierarchicalProgress, stageId);
                    }}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    Kirim 1 request tambahan
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy}
                    onClick={() => setRetryConfirmationStageId(null)}
                  >
                    Batal retry
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy}
                  onClick={() => {
                    setPausedState(true);
                    setRetryConfirmationStageId(hierarchicalProgress.failedStageId);
                    setNotice({
                      tone: 'warning',
                      title: 'Konfirmasi 1 request tambahan',
                      detail: 'Retry hanya berjalan setelah kamu menekan tombol konfirmasi di bawah.',
                    });
                  }}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Ulangi tahap (+1 request)
                </button>
              )
            ) : hierarchicalPaused ? (
              <button type="button" className={styles.primaryButton} disabled={busy} onClick={handleResumeHierarchy}>
                <Play size={16} aria-hidden="true" />
                Lanjutkan
              </button>
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={applyingRevisionId !== null}
                onClick={() => setPausedState(true)}
              >
                <Pause size={16} aria-hidden="true" />
                Jeda setelah tahap ini
              </button>
            )}
          </div>
        </div>
      )}

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
