'use client';

import type { RefObject } from 'react';
import { Check, FileAudio } from 'lucide-react';
import { NotaraLogo } from '../brand/NotaraLogo';

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
  return (
    <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--surface-canvas)] p-8 text-center animate-in zoom-in-95 duration-200 md:p-12">
      <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-tool)]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          width={600}
          height={128}
        />

        {!isRecording && !audioBlob && (
          <div className="relative flex items-center gap-2 text-xs font-bold text-[var(--text-tertiary)]">
            <NotaraLogo variant="icon" animated motionState="thinking" size={18} />
            Siap merekam suara...
          </div>
        )}

        {audioBlob && !isRecording && (
          <div className="relative flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-[var(--success-accent)]">
            <Check className="h-4 w-4" />
            Audio rekaman ter-cache di browser!
          </div>
        )}
      </div>

      <div className="flex flex-col items-center shrink-0">
        <span className="select-none font-mono text-3xl font-bold tracking-wider text-[var(--text-primary)]">
          {formattedDuration}
        </span>
        {isRecording && (
          <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-1.5 animate-pulse flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
            Recording Live
          </span>
        )}
        {isPaused && (
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-1.5">
            Recording Paused
          </span>
        )}
      </div>

      {audioUrl && !isRecording && (
        <div className="w-full max-w-sm mt-1 animate-in fade-in duration-300">
          <audio src={audioUrl} controls className="w-full focus:outline-none" />
        </div>
      )}

      <div className="flex items-center gap-3">
        {!isRecording && !audioBlob ? (
          <button
            onClick={onStart}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--action-primary)] px-6 py-3 text-xs font-bold tracking-wide text-[var(--text-on-brand)] transition-colors hover:bg-[var(--action-primary-hover)]"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            Mulai Merekam
          </button>
        ) : isRecording ? (
          <>
            {isPaused ? (
              <button
                onClick={onResume}
                className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Lanjutkan
              </button>
            ) : (
              <button
                onClick={onPause}
                className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Jeda Merekam
              </button>
            )}
            <button
              onClick={onStop}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--danger-accent)] px-6 py-3 text-xs font-bold tracking-wide text-[var(--text-on-brand)] transition-opacity hover:opacity-90"
            >
              Hentikan & Simpan
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onStart}
              className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Rekam Ulang
            </button>
            <button
              onClick={onDownload}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <FileAudio className="h-3.5 w-3.5 text-violet-400" />
              Unduh Audio
            </button>
            <button
              onClick={onReset}
              className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger-accent)] hover:text-[var(--danger-accent)]"
            >
              Batal
            </button>
          </>
        )}
      </div>
    </div>
  );
}
