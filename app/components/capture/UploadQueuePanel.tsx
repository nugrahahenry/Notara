'use client';

import {
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from 'react';
import { AlertCircle, CheckCircle2, Plus, Trash2, UploadCloud } from 'lucide-react';
import { MAX_QUEUE_FILES } from '@/lib/capture/constants';
import type { CaptureTask } from '@/lib/capture/task';
import { NotaraLogo } from '../brand/NotaraLogo';
import { CaptureTaskList } from './CaptureTaskList';

export type CaptureDragState = 'idle' | 'valid' | 'invalid';

interface UploadQueuePanelProps {
  tasks: CaptureTask<File>[];
  dragState: CaptureDragState;
  notice: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDrag: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBrowse: () => void;
  onReplaceFile: (index: number, file: File) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  onRetryTask: (taskId: string) => void;
  actionsDisabled?: boolean;
}

const DROP_COPY: Record<CaptureDragState, { title: string; description: string }> = {
  idle: {
    title: 'Tarik file audio atau video ke sini',
    description: 'Atau pilih langsung dari perangkat Anda.',
  },
  valid: {
    title: 'File dikenali',
    description: 'Lepaskan untuk menambahkannya ke antrean.',
  },
  invalid: {
    title: 'File belum bisa ditambahkan',
    description: 'Periksa format, ukuran 150 MB, dan kapasitas antrean.',
  },
};

export function UploadQueuePanel({
  tasks,
  dragState,
  notice,
  fileInputRef,
  onDrag,
  onDrop,
  onFileChange,
  onBrowse,
  onReplaceFile,
  onRemoveFile,
  onClearFiles,
  onRetryTask,
  actionsDisabled = false,
}: UploadQueuePanelProps) {
  const files = tasks.map((task) => task.reference);
  const dropCopy = DROP_COPY[dragState];
  const queueIsFull = files.length >= MAX_QUEUE_FILES;
  const dropStateStyles = {
    idle: 'border-[var(--border-strong)] bg-[var(--surface-canvas)] hover:border-[var(--action-primary)]',
    valid: 'border-emerald-500 bg-emerald-500/10',
    invalid: 'border-red-500 bg-red-500/10',
  }[dragState];

  return (
    <section data-tour="upload-area" className="space-y-5" aria-labelledby="capture-upload-title">
      <div
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
        data-drag-state={dragState}
        className={`relative rounded-3xl border-2 border-dashed p-6 text-center transition-colors md:p-8 ${dropStateStyles}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.mov,.webm,.mkv,.ogg,.aac"
          className="hidden"
          onChange={onFileChange}
        />

        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--brand-primary)]">
            {dragState === 'invalid' ? (
              <AlertCircle className="h-8 w-8 text-[var(--danger-accent)]" aria-hidden="true" />
            ) : dragState === 'valid' ? (
              <CheckCircle2 className="h-8 w-8 text-[var(--success-accent)]" aria-hidden="true" />
            ) : files.length > 0 ? (
              <UploadCloud className="h-8 w-8 text-[var(--action-primary)]" aria-hidden="true" />
            ) : (
              <NotaraLogo variant="icon" animated motionState="thinking" size={36} />
            )}
          </div>

          <div aria-live="polite" aria-atomic="true">
            <h2 id="capture-upload-title" className="text-base font-extrabold text-[var(--text-primary)]">
              {dropCopy.title}
            </h2>
            <p id="capture-file-hint" className="mt-1 text-xs text-[var(--text-tertiary)]">
              {dropCopy.description}
            </p>
          </div>

          <button
            type="button"
            onClick={onBrowse}
            disabled={queueIsFull}
            aria-describedby={notice ? 'capture-file-notice' : 'capture-file-hint'}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--action-primary)] px-5 py-3 text-xs font-bold text-[var(--text-on-brand)] transition-colors hover:bg-[var(--action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {files.length > 0 ? 'Tambah file' : 'Pilih file dari perangkat'}
          </button>

          <p className="text-xs font-medium text-[var(--text-secondary)]">
            MP3, M4A, WAV, MP4, WEBM, MOV • maksimal 150 MB per file • {files.length}/{MAX_QUEUE_FILES} terpilih
          </p>
        </div>
      </div>

      {notice && (
        <div
          id="capture-file-notice"
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-left text-xs font-semibold leading-relaxed text-[var(--danger-accent)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {tasks.length > 0 && (
        <>
          <CaptureTaskList
            tasks={tasks}
            onReplace={onReplaceFile}
            onRemove={onRemoveFile}
            onRetry={onRetryTask}
            actionsDisabled={actionsDisabled}
          />

          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] p-4 text-left sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg text-xs leading-relaxed text-[var(--text-secondary)]">
              File hanya disimpan sementara di memori browser. Setelah proses dimulai, tetap buka tab ini sampai selesai.
            </p>
            <button
              type="button"
              onClick={onClearFiles}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger-accent)] hover:text-[var(--danger-accent)]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Kosongkan antrean
            </button>
          </div>
        </>
      )}
    </section>
  );
}
