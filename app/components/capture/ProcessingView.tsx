'use client';

import { Loader2, TriangleAlert } from 'lucide-react';
import { NaliraBrand } from '../brand/NaliraBrand';

interface ProcessingViewProps {
  thinkingElapsed: number;
  isChunkProcessing: boolean;
  chunkProgress: string;
  statusMessage: string;
  chunkCurrent: number;
  chunkCompleted: number;
  chunkTotal: number;
  thinkingLog: string[];
  showThinkingPanel: boolean;
  onToggleThinkingPanel: () => void;
}

export function ProcessingView({
  thinkingElapsed,
  isChunkProcessing,
  chunkProgress,
  statusMessage,
  chunkCurrent,
  chunkCompleted,
  chunkTotal,
  thinkingLog,
  showThinkingPanel,
  onToggleThinkingPanel,
}: ProcessingViewProps) {
  const hasMeasuredChunkProgress =
    isChunkProcessing &&
    chunkTotal > 0 &&
    chunkCurrent > 0 &&
    chunkCompleted < chunkTotal;
  const measuredPercent = hasMeasuredChunkProgress
    ? Math.round((chunkCompleted / chunkTotal) * 100)
    : null;
  const currentStatus = isChunkProcessing
    ? chunkProgress || 'Browser sedang menyiapkan rekaman...'
    : statusMessage || 'Audio sedang diproses...';

  return (
    <section
      className="mx-auto flex max-w-xl flex-col items-center justify-center py-12 text-center animate-in fade-in duration-300"
      aria-labelledby="capture-processing-title"
      aria-describedby="capture-processing-status capture-tab-warning"
    >
      <div className="relative flex items-center justify-center" aria-hidden="true">
        <NaliraBrand variant="processing" size={112} motionState="thinking" />
      </div>

      <div className="mt-7 flex flex-col items-center gap-1">
        <h2 id="capture-processing-title" className="text-xl font-black tracking-tight text-[var(--text-primary)]">
          Nalira sedang bekerja
        </h2>
        <p className="font-mono text-xs font-bold text-[var(--action-primary)]">
          {thinkingElapsed} detik berlalu
        </p>
      </div>

      <div
        id="capture-processing-status"
        className="mx-auto mt-4 max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] px-5 py-4"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="inline-flex items-center justify-center gap-2 text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--action-primary)]" aria-hidden="true" />
          {currentStatus}
        </p>
      </div>

      {hasMeasuredChunkProgress && measuredPercent !== null && (
        <div className="mt-5 w-full max-w-sm text-left">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
            <span>
              {chunkCompleted} dari {chunkTotal} bagian selesai
              {chunkCurrent > chunkCompleted ? ` • bagian ${chunkCurrent} sedang dikerjakan` : ''}
            </span>
            <span className="font-mono font-bold">{measuredPercent}%</span>
          </div>
          <progress
            className="h-2 w-full overflow-hidden rounded-full accent-[var(--action-primary)]"
            max={chunkTotal}
            value={chunkCompleted}
            aria-label="Bagian rekaman yang selesai diproses"
          >
            {measuredPercent}%
          </progress>
        </div>
      )}

      {!hasMeasuredChunkProgress && (
        <p className="mt-4 text-xs leading-relaxed text-[var(--text-tertiary)]">
          Tahap ini tidak memiliki persentase yang dapat diukur dengan akurat.
        </p>
      )}

      <div
        id="capture-tab-warning"
        className="mt-5 flex max-w-md items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-left text-xs leading-relaxed text-[var(--review-accent)]"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>Tetap buka tab ini sampai selesai.</strong> Proses saat ini berjalan di browser dan belum dapat dilanjutkan di latar belakang.
        </p>
      </div>

      {thinkingLog.length > 0 && (
        <div className="mt-6 w-full max-w-sm">
          <button
            type="button"
            onClick={onToggleThinkingPanel}
            className="mx-auto flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            aria-expanded={showThinkingPanel}
            aria-controls="capture-process-details"
          >
            <span aria-hidden="true">{showThinkingPanel ? '▾' : '▸'}</span>
            Detail proses
          </button>

          {showThinkingPanel && (
            <div
              id="capture-process-details"
              className="mt-2 max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-left animate-in fade-in slide-in-from-top-2 duration-200"
            >
              {thinkingLog.map((log, index) => (
                <div key={`${index}-${log}`} className="flex items-start gap-2">
                  <span className="shrink-0 pt-0.5 font-mono text-xs text-[var(--text-tertiary)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{log}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
