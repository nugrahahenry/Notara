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
    <div className="rounded-3xl border border-white/10 bg-white/[0.01] p-8 md:p-12 text-center flex flex-col items-center gap-6 relative overflow-hidden animate-in zoom-in-95 duration-200">
      <div className="w-full h-32 bg-black/40 rounded-2xl border border-white/[0.04] overflow-hidden relative flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          width={600}
          height={128}
        />

        {!isRecording && !audioBlob && (
          <div className="relative text-xs text-zinc-500 font-bold flex items-center gap-2">
            <NotaraLogo variant="icon" animated motionState="thinking" size={18} />
            Siap merekam suara...
          </div>
        )}

        {audioBlob && !isRecording && (
          <div className="relative text-xs text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full shadow-lg">
            <Check className="h-4 w-4" />
            Audio rekaman ter-cache di browser!
          </div>
        )}
      </div>

      <div className="flex flex-col items-center shrink-0">
        <span className="text-3xl font-mono font-bold tracking-wider text-white select-none">
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
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-violet-500/20 transition-all duration-300 active:scale-95"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            Mulai Merekam
          </button>
        ) : isRecording ? (
          <>
            {isPaused ? (
              <button
                onClick={onResume}
                className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-xs transition-all active:scale-95"
              >
                Lanjutkan
              </button>
            ) : (
              <button
                onClick={onPause}
                className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-xs transition-all active:scale-95"
              >
                Jeda Merekam
              </button>
            )}
            <button
              onClick={onStop}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-rose-950/20 transition-all active:scale-95"
            >
              Hentikan & Simpan
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onStart}
              className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white font-bold text-xs transition-all active:scale-95"
            >
              Rekam Ulang
            </button>
            <button
              onClick={onDownload}
              className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
            >
              <FileAudio className="h-3.5 w-3.5 text-violet-400" />
              Unduh Audio
            </button>
            <button
              onClick={onReset}
              className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/20 text-zinc-500 hover:text-rose-400 font-bold text-xs transition-all active:scale-95"
            >
              Batal
            </button>
          </>
        )}
      </div>
    </div>
  );
}
