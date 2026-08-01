'use client';

import type { ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileAudio,
  FileVideo,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  formatCaptureDuration,
  formatCaptureFileSize,
  getCaptureQueueSummary,
  getCaptureTaskPresentation,
  type CaptureTask,
  type CaptureTaskTone,
} from '@/lib/capture/task';

interface CaptureTaskListProps {
  tasks: CaptureTask<File>[];
  onReplace: (index: number, file: File) => void;
  onRemove: (index: number) => void;
  onRetry?: (taskId: string) => void;
}

const TONE_STYLES: Record<CaptureTaskTone, string> = {
  neutral: 'border-[var(--border-subtle)] bg-[var(--surface-tool)] text-[var(--text-secondary)]',
  active: 'border-[var(--action-primary)]/30 bg-[var(--info-soft)] text-[var(--action-primary)]',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-[var(--success-accent)]',
  warning: 'border-amber-500/25 bg-amber-500/10 text-[var(--review-accent)]',
  danger: 'border-red-500/25 bg-red-500/10 text-[var(--danger-accent)]',
};

function TaskStatusIcon({ task }: { task: CaptureTask<File> }) {
  const presentation = getCaptureTaskPresentation(task);

  if (presentation.showSpinner) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  }
  if (task.status === 'succeeded') {
    return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (task.error || task.status === 'failed') {
    return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (task.status === 'queued') {
    return <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function CaptureTaskList({
  tasks,
  onReplace,
  onRemove,
  onRetry,
}: CaptureTaskListProps) {
  const queueSummary = getCaptureQueueSummary(tasks);

  return (
    <section className="w-full" aria-labelledby="capture-queue-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-left">
        <div>
          <h3 id="capture-queue-title" className="text-sm font-extrabold text-[var(--text-primary)]">
            Antrean file
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Maksimal tiga file, diproses satu per satu.
          </p>
        </div>
        <p
          className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-tool)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {queueSummary.label}
        </p>
      </div>

      <ol className="space-y-3">
        {tasks.map((task, index) => {
          const presentation = getCaptureTaskPresentation(task);
          const replaceInputId = `capture-replace-${task.id}`;
          const descriptionId = `capture-task-description-${task.id}`;
          const errorId = task.error ? `capture-task-error-${task.id}` : undefined;
          const format = task.name.includes('.')
            ? task.name.split('.').pop()?.toUpperCase()
            : task.mimeType.split('/').pop()?.toUpperCase();

          const handleReplacement = (event: ChangeEvent<HTMLInputElement>) => {
            const replacement = event.target.files?.[0];
            if (replacement) onReplace(index, replacement);
            event.target.value = '';
          };

          return (
            <li
              key={task.id}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-left shadow-sm"
              aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-selected)] text-[var(--nav-selected-text)]">
                  {task.mediaKind === 'video' ? (
                    <FileVideo className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <FileAudio className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-[var(--text-primary)]" title={task.name}>
                        <span className="mr-2 text-[var(--text-tertiary)]">{index + 1}.</span>
                        {task.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                        {task.mediaKind === 'video' ? 'Video' : 'Audio'}
                        {format ? ` • ${format}` : ''}
                        {' • '}
                        {formatCaptureFileSize(task.sizeBytes)}
                        {typeof task.durationSeconds === 'number' && task.durationSeconds > 0
                          ? ` • ${formatCaptureDuration(task.durationSeconds)}`
                          : ''}
                      </p>
                    </div>

                    <span
                      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_STYLES[presentation.tone]}`}
                    >
                      <TaskStatusIcon task={task} />
                      {presentation.label}
                    </span>
                  </div>

                  <p id={descriptionId} className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {presentation.description}
                  </p>

                  <dl className="mt-3 grid gap-2 rounded-xl bg-[var(--surface-tool)] p-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-[var(--text-tertiary)]">Sumber</dt>
                      <dd className="mt-0.5 text-[var(--text-secondary)]">
                        {task.source === 'recording' ? 'Rekaman browser' : 'Perangkat ini'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-[var(--text-tertiary)]">Tujuan</dt>
                      <dd className="mt-0.5 truncate text-[var(--text-secondary)]" title={task.destinationLabel}>
                        {task.destinationLabel}
                      </dd>
                    </div>
                  </dl>

                  {presentation.progressPercent !== null && (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                        <span>{presentation.progressText}</span>
                        <span className="font-mono font-bold">{presentation.progressPercent}%</span>
                      </div>
                      <progress
                        className="h-2 w-full overflow-hidden rounded-full accent-[var(--action-primary)]"
                        max={100}
                        value={presentation.progressPercent}
                        aria-label={`Progress ${task.name}`}
                      >
                        {presentation.progressPercent}%
                      </progress>
                      {presentation.transferMetricsText && (
                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                          {presentation.transferMetricsText}
                        </p>
                      )}
                    </div>
                  )}

                  {presentation.progressPercent === null && presentation.isActive && (
                    <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--action-primary)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      {presentation.progressText ?? presentation.label}
                    </p>
                  )}

                  {task.error && (
                    <p
                      id={errorId}
                      className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs font-semibold leading-relaxed text-[var(--danger-accent)]"
                    >
                      {task.error.message}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {presentation.canRetry && onRetry && (
                      <button
                        type="button"
                        onClick={() => onRetry(task.id)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--action-primary)] px-3.5 text-xs font-bold text-[var(--text-on-brand)] transition-colors hover:bg-[var(--action-primary-hover)]"
                        aria-describedby={errorId}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Coba lagi
                      </button>
                    )}

                    {presentation.canReplace && (
                      <>
                        <input
                          id={replaceInputId}
                          type="file"
                          accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.mov,.webm,.mkv,.ogg,.aac"
                          className="hidden"
                          onChange={handleReplacement}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById(replaceInputId)?.click()}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] px-3.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--action-primary)] hover:text-[var(--action-primary)]"
                          aria-label={`Ganti ${task.name}`}
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          Ganti
                        </button>
                      </>
                    )}

                    {presentation.canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] px-3.5 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger-accent)] hover:text-[var(--danger-accent)]"
                        aria-label={`Hapus ${task.name} dari antrean`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
