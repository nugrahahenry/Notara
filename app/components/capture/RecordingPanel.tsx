'use client';

import type { RefObject } from 'react';
import { Check, FileAudio } from 'lucide-react';
import { RecordingVisual, type RecordingVisualState } from '../brand/ProductArtwork';

interface RecordingPanelProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isRecording: boolean;
  isPaused: boolean;
  audioBlob: Blob | null;
  audioUrl: string | null;
  formattedDuration: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDownload: () => void;
  onReset: () => void;
}

export function RecordingPanel({
  canvasRef,
  isRecording,
  isPaused,
  audioBlob,
  audioUrl,
  formattedDuration,
  onStart,
  onPause,
  onResume,
  onStop,
  onDownload,
  onReset,
}: RecordingPanelProps) {
  const visualState: RecordingVisualState = isRecording
    ? isPaused ? 'paused' : 'recording'
    : audioBlob ? 'ready' : 'idle';

  return (
    <section
      className="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--surface-canvas)] p-6 text-center animate-in zoom-in-95 duration-200 sm:p-8 md:p-12"
      aria-labelledby="recording-panel-title"
    >
      <h2 id="recording-panel-title" className="sr-only">Perekam suara Nalira</h2>

      <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-tool)]">
        <RecordingVisual state={visualState} canvasRef={canvasRef} />

        {!isRecording && !audioBlob && (
          <p className="notara-recording-status">Siap merekam suara</p>
        )}

        {audioBlob && !isRecording && (
          <p className="notara-recording-status notara-recording-status--ready">
            <Check className="h-4 w-4" aria-hidden="true" />
            Rekaman tersimpan sementara di browser
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center" aria-live="polite" aria-atomic="true">
        <span className="select-none font-mono text-3xl font-bold tracking-wider text-[var(--text-primary)]">
          {formattedDuration}
        </span>
        {isRecording && !isPaused && (
          <span className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--danger-accent)]">
            <span className="h-2 w-2 rounded-full bg-[var(--danger-accent)]" aria-hidden="true" />
            Sedang merekam
          </span>
        )}
        {isPaused && (
          <span className="mt-1.5 text-xs font-bold text-[var(--review-accent)]">
            Rekaman dijeda
          </span>
        )}
      </div>

      {audioUrl && !isRecording && (
        <div className="mt-1 w-full max-w-sm animate-in fade-in duration-300">
          <audio src={audioUrl} controls className="w-full focus:outline-none" aria-label="Pratinjau rekaman suara" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {!isRecording && !audioBlob ? (
          <button
            type="button"
            onClick={onStart}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--action-primary)] px-6 py-3 text-xs font-bold tracking-wide text-[var(--text-on-brand)] transition-colors hover:bg-[var(--action-primary-hover)]"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
            Mulai merekam
          </button>
        ) : isRecording ? (
          <>
            {isPaused ? (
              <button type="button" onClick={onResume} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                Lanjutkan
              </button>
            ) : (
              <button type="button" onClick={onPause} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                Jeda
              </button>
            )}
            <button type="button" onClick={onStop} className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--danger-accent)] px-6 py-3 text-xs font-bold tracking-wide text-[var(--text-on-brand)] transition-opacity hover:opacity-90">
              Hentikan dan simpan
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onStart} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              Rekam ulang
            </button>
            <button type="button" onClick={onDownload} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              <FileAudio className="h-3.5 w-3.5 text-[var(--knowledge-accent)]" aria-hidden="true" />
              Unduh audio
            </button>
            <button type="button" onClick={onReset} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger-accent)] hover:text-[var(--danger-accent)]">
              Batal
            </button>
          </>
        )}
      </div>
    </section>
  );
}
