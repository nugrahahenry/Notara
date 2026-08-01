'use client';

import { ProcessingMark } from '../brand/BrandSlots';

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
        <ProcessingMark size={112} />
      </div>

      <div className="mt-8 flex flex-col items-center gap-1">
        <h3 className="text-xl font-black tracking-tight text-[var(--text-primary)]">Notara Thinking...</h3>
        <p className="font-mono text-xs font-bold text-[var(--brand-primary)]">
          {thinkingElapsed}s berlalu
        </p>
      </div>

      <p className="mx-auto mt-3 min-h-8 max-w-sm animate-pulse px-6 text-sm leading-relaxed text-[var(--text-secondary)]">
        {isChunkProcessing ? chunkProgress : statusMessage}
      </p>

      <div className="relative mt-5 h-2 w-64 overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-tool)]">
        <div
          className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-700"
          style={{
            width: isChunkProcessing
              ? `${chunkPercent}%`
              : loadingStep === 1
                ? '35%'
                : loadingStep === 2
                  ? '75%'
                  : '98%',
            animationDuration: '2s',
            animationIterationCount: 'infinite',
          }}
        />
      </div>

      {thinkingLog.length > 0 && (
        <div className="mt-6 w-full max-w-xs">
          <button
            onClick={onToggleThinkingPanel}
            className="mx-auto flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <span className="flex items-center gap-1">
              {showThinkingPanel ? '▾' : '▸'}
              Lihat detail proses...
            </span>
          </button>

          {showThinkingPanel && (
            <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-left animate-in fade-in slide-in-from-top-2 duration-200">
              {thinkingLog.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
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
    </div>
  );
}
