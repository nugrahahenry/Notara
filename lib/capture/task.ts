import { MAX_FILE_SIZE_BYTES } from './constants';
import type { MediaFileLike } from './policy';

export type CaptureTaskStatus =
  | 'selected'
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'transcribing'
  | 'summarizing'
  | 'awaiting_save'
  | 'saving'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type CaptureTaskSource = 'upload' | 'recording';
export type CaptureMediaKind = 'audio' | 'video';

export interface CaptureTaskError {
  code: string;
  message: string;
  retryable: boolean;
}

export type CaptureTaskProgress =
  | {
      kind: 'bytes';
      completedBytes: number;
      totalBytes: number;
      bytesPerSecond?: number;
      estimatedSecondsRemaining?: number;
      metricsReliable?: boolean;
    }
  | {
      kind: 'parts';
      completedParts: number;
      totalParts: number;
      activePart?: number;
    }
  | {
      kind: 'indeterminate';
    };

export interface CaptureTask<TReference = unknown> {
  id: string;
  reference: TReference;
  source: CaptureTaskSource;
  mediaKind: CaptureMediaKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  status: CaptureTaskStatus;
  progress?: CaptureTaskProgress;
  startedAt?: number;
  error?: CaptureTaskError;
  attempts: number;
  destinationLabel: string;
  stageLabel?: string;
  stageDescription?: string;
}

export type CaptureTaskTone = 'neutral' | 'active' | 'success' | 'warning' | 'danger';

export interface CaptureTaskPresentation {
  label: string;
  description: string;
  tone: CaptureTaskTone;
  isActive: boolean;
  isTerminal: boolean;
  showSpinner: boolean;
  canRetry: boolean;
  canReplace: boolean;
  canRemove: boolean;
  progressPercent: number | null;
  progressText: string | null;
  transferMetricsText: string | null;
}

export interface CaptureQueueSummary {
  total: number;
  ready: number;
  active: number;
  awaitingSave: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  label: string;
}

const ACTIVE_STATUSES = new Set<CaptureTaskStatus>([
  'preparing',
  'uploading',
  'transcribing',
  'summarizing',
  'saving',
]);

const REPLACEABLE_STATUSES = new Set<CaptureTaskStatus>([
  'selected',
  'queued',
  'failed',
  'cancelled',
]);

const REMOVABLE_STATUSES = new Set<CaptureTaskStatus>([
  'selected',
  'queued',
  'succeeded',
  'failed',
  'cancelled',
]);

const LEAVE_WARNING_STATUSES = new Set<CaptureTaskStatus>([
  ...ACTIVE_STATUSES,
  'awaiting_save',
]);

const STATUS_COPY: Record<
  CaptureTaskStatus,
  Pick<CaptureTaskPresentation, 'label' | 'description' | 'tone'>
> = {
  selected: {
    label: 'Siap diproses',
    description: 'File tersimpan sementara di memori tab ini.',
    tone: 'neutral',
  },
  queued: {
    label: 'Dalam antrean',
    description: 'Menunggu file sebelumnya selesai.',
    tone: 'warning',
  },
  preparing: {
    label: 'Menyiapkan file',
    description: 'Browser sedang membaca dan menyiapkan media.',
    tone: 'active',
  },
  uploading: {
    label: 'Mengirim audio',
    description: 'Data sedang dikirim untuk diproses.',
    tone: 'active',
  },
  transcribing: {
    label: 'Menyusun transkrip',
    description: 'Nalira sedang mengenali isi rekaman.',
    tone: 'active',
  },
  summarizing: {
    label: 'Menyusun rangkuman',
    description: 'Nalira sedang mengubah transkrip menjadi materi belajar.',
    tone: 'active',
  },
  awaiting_save: {
    label: 'Siap disimpan',
    description: 'Rangkuman selesai diproses. Konfirmasi tujuan penyimpanannya.',
    tone: 'warning',
  },
  saving: {
    label: 'Menyimpan hasil',
    description: 'Rangkuman sedang disimpan ke tujuan yang dipilih.',
    tone: 'active',
  },
  succeeded: {
    label: 'Selesai',
    description: 'Rangkuman berhasil dibuat dan disimpan.',
    tone: 'success',
  },
  failed: {
    label: 'Gagal diproses',
    description: 'File ini belum menghasilkan rangkuman.',
    tone: 'danger',
  },
  cancelled: {
    label: 'Dibatalkan',
    description: 'Pemrosesan file ini dihentikan.',
    tone: 'neutral',
  },
};

export function getCaptureMediaKind(
  file: Pick<MediaFileLike, 'name' | 'type'>,
): CaptureMediaKind {
  const normalizedType = file.type.toLowerCase();
  const normalizedName = file.name.toLowerCase();

  if (
    normalizedType.startsWith('video/') ||
    ['.mp4', '.mov', '.webm', '.mkv'].some((extension) => normalizedName.endsWith(extension))
  ) {
    return 'video';
  }

  return 'audio';
}

export function createSelectedCaptureTask<TReference>(options: {
  id: string;
  reference: TReference;
  file: MediaFileLike;
  destinationLabel: string;
  durationSeconds?: number;
  source?: CaptureTaskSource;
}): CaptureTask<TReference> {
  return {
    id: options.id,
    reference: options.reference,
    source: options.source ?? 'upload',
    mediaKind: getCaptureMediaKind(options.file),
    name: options.file.name,
    mimeType: options.file.type,
    sizeBytes: options.file.size,
    durationSeconds: options.durationSeconds,
    status: 'selected',
    attempts: 0,
    destinationLabel: options.destinationLabel,
    error:
      options.file.size > MAX_FILE_SIZE_BYTES
        ? {
            code: 'file-too-large',
            message: 'Ukuran file melebihi batas 150 MB. Ganti dengan file yang lebih kecil.',
            retryable: false,
          }
        : undefined,
  };
}

export function isCaptureTaskActive(status: CaptureTaskStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isCaptureQueueBusy(tasks: CaptureTask[]): boolean {
  return tasks.some(
    (task) => isCaptureTaskActive(task.status) || task.status === 'awaiting_save',
  );
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getProgressPresentation(task: CaptureTask): Pick<
  CaptureTaskPresentation,
  'progressPercent' | 'progressText' | 'transferMetricsText'
> {
  if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') {
    return {
      progressPercent: null,
      progressText: null,
      transferMetricsText: null,
    };
  }

  const progress = task.progress;
  if (!progress || progress.kind === 'indeterminate') {
    return {
      progressPercent: null,
      progressText: isCaptureTaskActive(task.status) ? 'Sedang dikerjakan' : null,
      transferMetricsText: null,
    };
  }

  if (progress.kind === 'bytes') {
    // Byte progress only describes the transport step. Once processing begins,
    // an upload value of 100% must not masquerade as overall task progress.
    if (task.status !== 'uploading' || progress.totalBytes <= 0) {
      return {
        progressPercent: null,
        progressText: isCaptureTaskActive(task.status) ? 'Sedang dikerjakan' : null,
        transferMetricsText: null,
      };
    }

    const percent = clampProgress((progress.completedBytes / progress.totalBytes) * 100);
    const hasReliableMetrics =
      progress.metricsReliable === true &&
      Number.isFinite(progress.bytesPerSecond) &&
      Number.isFinite(progress.estimatedSecondsRemaining) &&
      (progress.bytesPerSecond ?? 0) > 0 &&
      (progress.estimatedSecondsRemaining ?? -1) >= 0;

    return {
      progressPercent: percent,
      progressText: `${formatCaptureFileSize(progress.completedBytes)} dari ${formatCaptureFileSize(progress.totalBytes)}`,
      transferMetricsText: hasReliableMetrics
        ? `${formatCaptureFileSize(progress.bytesPerSecond ?? 0)}/detik • sekitar ${formatCaptureDuration(progress.estimatedSecondsRemaining ?? 0)} lagi`
        : null,
    };
  }

  if (progress.totalParts <= 0) {
    return {
      progressPercent: null,
      progressText: 'Sedang dikerjakan',
      transferMetricsText: null,
    };
  }

  const completedParts = Math.min(
    progress.totalParts,
    Math.max(0, progress.completedParts),
  );
  const activePart = progress.activePart
    ? Math.min(progress.totalParts, Math.max(1, progress.activePart))
    : null;

  return {
    progressPercent: clampProgress((completedParts / progress.totalParts) * 100),
    progressText: activePart
      ? `${completedParts} dari ${progress.totalParts} bagian selesai • bagian ${activePart} sedang dikerjakan`
      : `${completedParts} dari ${progress.totalParts} bagian selesai`,
    transferMetricsText: null,
  };
}

export function getCaptureTaskPresentation(task: CaptureTask): CaptureTaskPresentation {
  const copy = task.error
    ? {
        label: task.status === 'failed' ? STATUS_COPY.failed.label : 'Perlu diganti',
        description: task.error.message,
        tone: 'danger' as const,
      }
    : {
        ...STATUS_COPY[task.status],
        label: task.stageLabel ?? STATUS_COPY[task.status].label,
        description: task.stageDescription ?? STATUS_COPY[task.status].description,
      };
  const isActive = isCaptureTaskActive(task.status);
  const progress = getProgressPresentation(task);

  return {
    ...copy,
    isActive,
    isTerminal: ['succeeded', 'failed', 'cancelled'].includes(task.status),
    showSpinner: isActive,
    canRetry: task.status === 'failed' && task.error?.retryable === true,
    canReplace: REPLACEABLE_STATUSES.has(task.status),
    canRemove: REMOVABLE_STATUSES.has(task.status),
    ...progress,
  };
}

export function getCaptureQueueSummary(tasks: CaptureTask[]): CaptureQueueSummary {
  const summary = tasks.reduce(
    (counts, task) => {
      if (task.error && task.status !== 'failed') {
        counts.failed += 1;
      } else if (task.status === 'selected' || task.status === 'queued') {
        counts.ready += 1;
      } else if (isCaptureTaskActive(task.status)) {
        counts.active += 1;
      } else if (task.status === 'awaiting_save') {
        counts.awaitingSave += 1;
      } else if (task.status === 'succeeded') {
        counts.succeeded += 1;
      } else if (task.status === 'failed') {
        counts.failed += 1;
      } else if (task.status === 'cancelled') {
        counts.cancelled += 1;
      }
      return counts;
    },
    { ready: 0, active: 0, awaitingSave: 0, succeeded: 0, failed: 0, cancelled: 0 },
  );

  const parts = [
    summary.ready > 0 ? `${summary.ready} siap` : null,
    summary.active > 0 ? `${summary.active} diproses` : null,
    summary.awaitingSave > 0 ? `${summary.awaitingSave} siap disimpan` : null,
    summary.succeeded > 0 ? `${summary.succeeded} selesai` : null,
    summary.failed > 0 ? `${summary.failed} perlu perhatian` : null,
    summary.cancelled > 0 ? `${summary.cancelled} dibatalkan` : null,
  ].filter((part): part is string => Boolean(part));

  return {
    total: tasks.length,
    ...summary,
    label: parts.length > 0 ? parts.join(' • ') : 'Antrean kosong',
  };
}

export function shouldWarnBeforeLeaving(tasks: CaptureTask[]): boolean {
  return tasks.some((task) => LEAVE_WARNING_STATUSES.has(task.status));
}

export function startCaptureTaskAttempt<TReference>(
  tasks: CaptureTask<TReference>[],
  taskId: string,
  startedAt = Date.now(),
): CaptureTask<TReference>[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      return {
        ...task,
        status: 'preparing',
        progress: { kind: 'indeterminate' },
        startedAt,
        attempts: task.attempts + 1,
        error: undefined,
        stageLabel: undefined,
        stageDescription: undefined,
      };
    }

    if (task.status === 'selected') {
      return {
        ...task,
        status: 'queued',
        progress: undefined,
        error: undefined,
        stageLabel: undefined,
        stageDescription: undefined,
      };
    }

    return task;
  });
}

export function patchCaptureTask<TReference>(
  tasks: CaptureTask<TReference>[],
  taskId: string,
  patch: Partial<CaptureTask<TReference>>,
): CaptureTask<TReference>[] {
  return tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task);
}

export function getNextQueuedCaptureTask<TReference>(
  tasks: CaptureTask<TReference>[],
  taskId: string,
): { task: CaptureTask<TReference>; index: number } | null {
  const currentIndex = tasks.findIndex((task) => task.id === taskId);
  if (currentIndex < 0) return null;

  const relativeIndex = tasks
    .slice(currentIndex + 1)
    .findIndex((task) => task.status === 'queued' || task.status === 'selected');
  if (relativeIndex < 0) return null;

  const index = currentIndex + relativeIndex + 1;
  return { task: tasks[index], index };
}

export function removeCaptureTask<TReference>(
  tasks: CaptureTask<TReference>[],
  taskId: string,
): CaptureTask<TReference>[] {
  return tasks.filter((task) => task.id !== taskId);
}

export function formatCaptureDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatCaptureFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';

  const unit = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(unit)),
  );
  const value = bytes / unit ** unitIndex;

  return `${Number(value.toFixed(2))} ${sizes[unitIndex]}`;
}
