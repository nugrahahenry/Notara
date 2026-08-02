import {
  FREE_FOLDER_SUMMARY_LIMIT,
  FREE_MONTHLY_SUMMARY_LIMIT,
  FREE_RECORDING_LIMIT_SECONDS,
  MAX_FILE_SIZE_BYTES,
  MAX_QUEUE_FILES,
  PAID_RECORDING_LIMIT_SECONDS,
  SUPPORTED_MEDIA_EXTENSIONS,
} from './constants';

export type CaptureTier = 'free' | 'pro' | 'max';

export interface MediaFileLike {
  name: string;
  type: string;
  size: number;
}

export interface CaptureLimits {
  maxQueueFiles: number;
  maxFileSizeBytes: number;
  recordingLimitSeconds: number;
  monthlySummaryLimit: number | null;
  folderSummaryLimit: number | null;
}

export interface QueueMergeResult<TFile extends MediaFileLike> {
  files: TFile[];
  supportedCandidates: TFile[];
  queueLimitReached: boolean;
}

export function isSupportedMediaFile(file: Pick<MediaFileLike, 'name' | 'type'>): boolean {
  const normalizedType = file.type.toLowerCase();
  const normalizedName = file.name.toLowerCase();

  return (
    normalizedType.startsWith('audio/') ||
    normalizedType.startsWith('video/') ||
    SUPPORTED_MEDIA_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
  );
}

export function selectSupportedMediaFiles<TFile extends MediaFileLike>(files: TFile[]): TFile[] {
  return files.filter(isSupportedMediaFile);
}

export function mergeCaptureQueue<TFile extends MediaFileLike>(
  currentFiles: TFile[],
  candidates: TFile[],
): QueueMergeResult<TFile> {
  const supportedCandidates = selectSupportedMediaFiles(candidates);
  const combined = [...currentFiles, ...supportedCandidates];

  return {
    files: combined.slice(0, MAX_QUEUE_FILES),
    supportedCandidates,
    queueLimitReached: combined.length > MAX_QUEUE_FILES,
  };
}

export function exceedsMaxFileSize(file: Pick<MediaFileLike, 'size'>): boolean {
  return file.size > MAX_FILE_SIZE_BYTES;
}

export function getCaptureLimits(tier: CaptureTier): CaptureLimits {
  const isPaid = tier !== 'free';

  return {
    maxQueueFiles: MAX_QUEUE_FILES,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    recordingLimitSeconds: isPaid
      ? PAID_RECORDING_LIMIT_SECONDS
      : FREE_RECORDING_LIMIT_SECONDS,
    monthlySummaryLimit: isPaid ? null : FREE_MONTHLY_SUMMARY_LIMIT,
    folderSummaryLimit: isPaid ? null : FREE_FOLDER_SUMMARY_LIMIT,
  };
}
