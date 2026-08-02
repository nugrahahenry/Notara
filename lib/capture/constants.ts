export const TARGET_SAMPLE_RATE = 16_000;
export const CHUNK_DURATION_SECONDS = 2 * 60;
export const CHUNK_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;
export const MAX_QUEUE_FILES = 3;

export const FREE_MONTHLY_SUMMARY_LIMIT = 5;
export const FREE_FOLDER_SUMMARY_LIMIT = 3;
export const FREE_RECORDING_LIMIT_SECONDS = 30 * 60;
export const PAID_RECORDING_LIMIT_SECONDS = 120 * 60;

export const SUPPORTED_MEDIA_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.wav',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.ogg',
  '.aac',
] as const;
