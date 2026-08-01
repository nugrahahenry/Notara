'use client';

import { NotaraLogo } from '../brand/NotaraLogo';

interface ProcessingViewProps {
  thinkingElapsed: number;
  isChunkProcessing: boolean;
  chunkProgress: string;
  statusMessage: string;
  chunkCurrent: number;
  chunkTotal: number;
  loadingStep: number;
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
  chunkTotal,
  loadingStep,
  thinkingLog,
  showThinkingPanel,
  onToggleThinkingPanel,
}: ProcessingViewProps) {
  const chunkPercent = Math.max(5, Math.round((chunkCurrent / chunkTotal) * 100));

  return (
    <div className="max-w-xl mx-auto text-center py-16 flex flex-col items-center justify-center animate-in fade-in duration-300">
      <div className="relative flex items-center justify-center">
        <NotaraLogo
          variant="icon"
          animated
          motionState="loading"
          size={112}
          showGlow
        />
      </div>

      <div className="mt-8 flex flex-col items-center gap-1">
        <h3 className="text-white font-black text-xl tracking-tight">Notara Thinking...</h3>
        <p className="text-violet-300 font-mono text-xs font-bold">
          {thinkingElapsed}s berlalu
        </p>
      </div>

      <p className="text-zinc-400 text-sm mt-3 px-6 leading-relaxed max-w-sm mx-auto min-h-8 animate-pulse">
        {isChunkProcessing ? chunkProgress : statusMessage}
      </p>

      <div className="w-64 h-2 bg-white/5 border border-white/[0.08] rounded-full mt-5 overflow-hidden relative shadow-[0_0_15px_rgba(124,58,237,0.1)]">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-purple-500 rounded-full animate-shimmer transition-all duration-700"
          style={{
            width: isChunkProcessing
              ? `${chunkPercent}%`
              : loadingStep === 1
                ? '35%'
                : loadingStep === 2
                  ? '75%'
                  : '98%',
            boxShadow: '0 0 10px #8B5CF6',
            animationDuration: '2s',
            animationIterationCount: 'infinite',
          }}
        />
      </div>

      {thinkingLog.length > 0 && (
        <div className="mt-6 w-full max-w-xs">
          <button
            onClick={onToggleThinkingPanel}
            className="flex items-center gap-2 text-[11px] text-zinc-500 hover:text-zinc-300 font-semibold transition-colors duration-200 mx-auto"
          >
            <span className="flex items-center gap-1">
              {showThinkingPanel ? '▾' : '▸'}
              Lihat detail proses...
            </span>
          </button>

          {showThinkingPanel && (
            <div className="mt-2 bg-white/[0.015] border border-white/[0.05] rounded-xl p-3 text-left space-y-1.5 max-h-52 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
              {thinkingLog.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-[9px] font-mono text-zinc-600 pt-0.5 shrink-0">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">{log}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
