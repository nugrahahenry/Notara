/* eslint-disable @typescript-eslint/no-require-imports */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  exceedsMaxFileSize,
  getCaptureLimits,
  isSupportedMediaFile,
  mergeCaptureQueue,
  selectSupportedMediaFiles,
} = require('../build/lib/capture/policy.js');
const {
  CHUNK_DURATION_SECONDS,
  CHUNK_THRESHOLD_BYTES,
  FREE_FOLDER_SUMMARY_LIMIT,
  FREE_MONTHLY_SUMMARY_LIMIT,
  FREE_RECORDING_LIMIT_SECONDS,
  MAX_FILE_SIZE_BYTES,
  MAX_QUEUE_FILES,
  PAID_RECORDING_LIMIT_SECONDS,
  TARGET_SAMPLE_RATE,
} = require('../build/lib/capture/constants.js');

const mediaFile = (name, type = '', size = 1024) => ({ name, type, size });

test('capture policy accepts audio MIME types', () => {
  assert.equal(isSupportedMediaFile(mediaFile('lecture.bin', 'audio/mpeg')), true);
});

test('capture policy accepts video MIME types', () => {
  assert.equal(isSupportedMediaFile(mediaFile('lecture.bin', 'video/mp4')), true);
});

test('capture policy falls back to supported extensions case-insensitively', () => {
  assert.equal(isSupportedMediaFile(mediaFile('LECTURE.M4A')), true);
});

test('capture policy rejects unsupported files', () => {
  assert.equal(isSupportedMediaFile(mediaFile('lecture-notes.pdf', 'application/pdf')), false);
});

test('capture policy filters unsupported candidates without reordering valid files', () => {
  const files = [
    mediaFile('first.mp3'),
    mediaFile('skip.pdf', 'application/pdf'),
    mediaFile('second.webm'),
  ];

  assert.deepEqual(selectSupportedMediaFiles(files), [files[0], files[2]]);
});

test('capture queue preserves order, caps at three files, and reports overflow', () => {
  const current = [mediaFile('first.mp3')];
  const candidates = [
    mediaFile('second.m4a'),
    mediaFile('ignored.txt', 'text/plain'),
    mediaFile('third.wav'),
    mediaFile('fourth.mp4'),
  ];
  const result = mergeCaptureQueue(current, candidates);

  assert.deepEqual(result.files.map((file) => file.name), ['first.mp3', 'second.m4a', 'third.wav']);
  assert.equal(result.files.length, MAX_QUEUE_FILES);
  assert.equal(result.supportedCandidates.length, 3);
  assert.equal(result.queueLimitReached, true);
});

test('capture file-size policy allows the exact limit and rejects one byte above it', () => {
  assert.equal(exceedsMaxFileSize(mediaFile('limit.wav', 'audio/wav', MAX_FILE_SIZE_BYTES)), false);
  assert.equal(exceedsMaxFileSize(mediaFile('too-large.wav', 'audio/wav', MAX_FILE_SIZE_BYTES + 1)), true);
});

test('capture chunk policy keeps the existing 16 kHz, two-minute, four-megabyte boundary', () => {
  assert.equal(TARGET_SAMPLE_RATE, 16_000);
  assert.equal(CHUNK_DURATION_SECONDS, 120);
  assert.equal(CHUNK_THRESHOLD_BYTES, 4 * 1024 * 1024);
});

test('capture tier policy exposes the existing Free and paid limits', () => {
  assert.deepEqual(getCaptureLimits('free'), {
    maxQueueFiles: MAX_QUEUE_FILES,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    recordingLimitSeconds: FREE_RECORDING_LIMIT_SECONDS,
    monthlySummaryLimit: FREE_MONTHLY_SUMMARY_LIMIT,
    folderSummaryLimit: FREE_FOLDER_SUMMARY_LIMIT,
  });

  for (const tier of ['pro', 'max']) {
    assert.deepEqual(getCaptureLimits(tier), {
      maxQueueFiles: MAX_QUEUE_FILES,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      recordingLimitSeconds: PAID_RECORDING_LIMIT_SECONDS,
      monthlySummaryLimit: null,
      folderSummaryLimit: null,
    });
  }
});
