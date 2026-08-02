/* eslint-disable @typescript-eslint/no-require-imports */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSelectedCaptureTask,
  formatCaptureDuration,
  formatCaptureFileSize,
  getCaptureMediaKind,
  getCaptureQueueSummary,
  getCaptureTaskPresentation,
  getNextQueuedCaptureTask,
  patchCaptureTask,
  removeCaptureTask,
  shouldWarnBeforeLeaving,
  startCaptureTaskAttempt,
} = require('../build/lib/capture/task.js');
const { MAX_FILE_SIZE_BYTES } = require('../build/lib/capture/constants.js');

// This fake adapter intentionally lives in the test suite. Production capture
// state remains connected only to real browser File objects.
const fakeTaskAdapter = (overrides = {}) => ({
  id: 'task-1',
  reference: { fixture: true },
  source: 'upload',
  mediaKind: 'audio',
  name: 'kuliah-ai.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 12 * 1024 * 1024,
  status: 'selected',
  attempts: 0,
  destinationLabel: 'Mata kuliah • Kecerdasan Buatan',
  ...overrides,
});

test('capture task adapter keeps the session-only file reference and selected metadata', () => {
  const file = { name: 'kelas.m4a', type: 'audio/mp4', size: 2048 };
  const task = createSelectedCaptureTask({
    id: 'local-1',
    reference: file,
    file,
    destinationLabel: 'Belum Dikategorikan',
    durationSeconds: 125,
  });

  assert.equal(task.reference, file);
  assert.equal(task.status, 'selected');
  assert.equal(task.durationSeconds, 125);
  assert.equal(task.destinationLabel, 'Belum Dikategorikan');
});

test('capture task media kind recognizes video MIME and extension fallbacks', () => {
  assert.equal(getCaptureMediaKind({ name: 'kelas.bin', type: 'video/mp4' }), 'video');
  assert.equal(getCaptureMediaKind({ name: 'kelas.MKV', type: '' }), 'video');
  assert.equal(getCaptureMediaKind({ name: 'kelas.wav', type: '' }), 'audio');
});

test('capture task marks an oversized selected file as needing replacement', () => {
  const file = {
    name: 'terlalu-besar.wav',
    type: 'audio/wav',
    size: MAX_FILE_SIZE_BYTES + 1,
  };
  const task = createSelectedCaptureTask({
    id: 'local-large',
    reference: file,
    file,
    destinationLabel: 'Belum Dikategorikan',
  });
  const presentation = getCaptureTaskPresentation(task);

  assert.equal(task.error.code, 'file-too-large');
  assert.equal(presentation.label, 'Perlu diganti');
  assert.equal(presentation.canRetry, false);
  assert.equal(presentation.canReplace, true);
});

test('capture queue summary separates ready, active, successful, and failed items', () => {
  const summary = getCaptureQueueSummary([
    fakeTaskAdapter(),
    fakeTaskAdapter({ id: 'task-2', status: 'transcribing' }),
    fakeTaskAdapter({ id: 'task-3', status: 'succeeded' }),
    fakeTaskAdapter({
      id: 'task-4',
      status: 'failed',
      error: { code: 'network', message: 'Jaringan terputus.', retryable: true },
    }),
    fakeTaskAdapter({ id: 'task-5', status: 'awaiting_save' }),
  ]);

  assert.deepEqual(summary, {
    total: 5,
    ready: 1,
    active: 1,
    awaitingSave: 1,
    succeeded: 1,
    failed: 1,
    cancelled: 0,
    label: '1 siap • 1 diproses • 1 siap disimpan • 1 selesai • 1 perlu perhatian',
  });
});

test('capture upload exposes determinate byte progress only when bytes are measurable', () => {
  const presentation = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'uploading',
    progress: {
      kind: 'bytes',
      completedBytes: 5 * 1024 * 1024,
      totalBytes: 10 * 1024 * 1024,
      bytesPerSecond: 1024 * 1024,
      estimatedSecondsRemaining: 5,
      metricsReliable: true,
    },
  }));

  assert.equal(presentation.progressPercent, 50);
  assert.equal(presentation.progressText, '5 MB dari 10 MB');
  assert.equal(presentation.transferMetricsText, '1 MB/detik • sekitar 0:05 lagi');
});

test('capture upload hides unstable transfer speed and ETA', () => {
  const presentation = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'uploading',
    progress: {
      kind: 'bytes',
      completedBytes: 1024,
      totalBytes: 4096,
      bytesPerSecond: 1024,
      estimatedSecondsRemaining: 3,
      metricsReliable: false,
    },
  }));

  assert.equal(presentation.progressPercent, 25);
  assert.equal(presentation.transferMetricsText, null);
});

test('capture processing does not reuse 100 percent upload as overall task progress', () => {
  const presentation = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'transcribing',
    progress: {
      kind: 'bytes',
      completedBytes: 4096,
      totalBytes: 4096,
      bytesPerSecond: 1024,
      estimatedSecondsRemaining: 0,
      metricsReliable: true,
    },
  }));

  assert.equal(presentation.progressPercent, null);
  assert.equal(presentation.progressText, 'Sedang dikerjakan');
  assert.equal(presentation.transferMetricsText, null);
});

test('capture chunk progress counts completed parts instead of the active part', () => {
  const presentation = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'transcribing',
    progress: {
      kind: 'parts',
      completedParts: 1,
      totalParts: 4,
      activePart: 2,
    },
  }));

  assert.equal(presentation.progressPercent, 25);
  assert.equal(
    presentation.progressText,
    '1 dari 4 bagian selesai • bagian 2 sedang dikerjakan',
  );
});

test('capture indeterminate stages show activity without inventing a percentage', () => {
  const presentation = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'summarizing',
    progress: { kind: 'indeterminate' },
  }));

  assert.equal(presentation.isActive, true);
  assert.equal(presentation.showSpinner, true);
  assert.equal(presentation.progressPercent, null);
  assert.equal(presentation.progressText, 'Sedang dikerjakan');
});

test('capture retry is inline and available only for retryable failures', () => {
  const retryable = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'failed',
    attempts: 1,
    error: { code: 'network', message: 'Jaringan terputus.', retryable: true },
  }));
  const finalFailure = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'failed',
    attempts: 1,
    error: { code: 'unsupported', message: 'Codec tidak didukung.', retryable: false },
  }));

  assert.equal(retryable.canRetry, true);
  assert.equal(finalFailure.canRetry, false);
});

test('capture success is terminal and never keeps a spinner or stale progress bar', () => {
  const presentation = getCaptureTaskPresentation(fakeTaskAdapter({
    status: 'succeeded',
    progress: { kind: 'parts', completedParts: 4, totalParts: 4 },
  }));

  assert.equal(presentation.label, 'Selesai');
  assert.equal(presentation.isTerminal, true);
  assert.equal(presentation.showSpinner, false);
  assert.equal(presentation.progressPercent, null);
});

test('capture leave warning is limited to work that is actively browser-bound', () => {
  assert.equal(shouldWarnBeforeLeaving([fakeTaskAdapter()]), false);
  assert.equal(
    shouldWarnBeforeLeaving([fakeTaskAdapter({ status: 'preparing' })]),
    true,
  );
  assert.equal(
    shouldWarnBeforeLeaving([fakeTaskAdapter({ status: 'succeeded' })]),
    false,
  );
  assert.equal(
    shouldWarnBeforeLeaving([fakeTaskAdapter({ status: 'awaiting_save' })]),
    true,
  );
});

test('starting one item queues selected siblings and preserves completed results', () => {
  const tasks = [
    fakeTaskAdapter({ id: 'done', status: 'succeeded' }),
    fakeTaskAdapter({ id: 'active' }),
    fakeTaskAdapter({ id: 'later' }),
  ];
  const next = startCaptureTaskAttempt(tasks, 'active', 1000);

  assert.equal(next[0].status, 'succeeded');
  assert.equal(next[1].status, 'preparing');
  assert.equal(next[1].attempts, 1);
  assert.equal(next[1].startedAt, 1000);
  assert.equal(next[2].status, 'queued');
});

test('task-local failure and retry do not erase successful or queued siblings', () => {
  const initial = [
    fakeTaskAdapter({ id: 'done', status: 'succeeded' }),
    fakeTaskAdapter({ id: 'failed', status: 'transcribing', attempts: 1 }),
    fakeTaskAdapter({ id: 'later', status: 'queued' }),
  ];
  const failed = patchCaptureTask(initial, 'failed', {
    status: 'failed',
    progress: undefined,
    error: { code: 'network', message: 'Jaringan terputus.', retryable: true },
  });
  const retried = startCaptureTaskAttempt(failed, 'failed', 2000);

  assert.equal(retried[0].status, 'succeeded');
  assert.equal(retried[1].status, 'preparing');
  assert.equal(retried[1].attempts, 2);
  assert.equal(retried[2].status, 'queued');
});

test('the sequential queue advances only to the next waiting item', () => {
  const tasks = [
    fakeTaskAdapter({ id: 'done', status: 'succeeded' }),
    fakeTaskAdapter({ id: 'current', status: 'succeeded' }),
    fakeTaskAdapter({ id: 'next', status: 'queued' }),
  ];
  const next = getNextQueuedCaptureTask(tasks, 'current');

  assert.equal(next.index, 2);
  assert.equal(next.task.id, 'next');
});

test('removing one waiting or failed item preserves the rest of the queue', () => {
  const tasks = [
    fakeTaskAdapter({ id: 'done', status: 'succeeded' }),
    fakeTaskAdapter({ id: 'remove', status: 'failed' }),
    fakeTaskAdapter({ id: 'later', status: 'queued' }),
  ];
  const remaining = removeCaptureTask(tasks, 'remove');

  assert.deepEqual(remaining.map((task) => task.id), ['done', 'later']);
  assert.equal(remaining[0].status, 'succeeded');
  assert.equal(remaining[1].status, 'queued');
});

test('capture metadata formatters produce compact Indonesian-friendly values', () => {
  assert.equal(formatCaptureDuration(65), '1:05');
  assert.equal(formatCaptureDuration(3665), '1:01:05');
  assert.equal(formatCaptureFileSize(1536), '1.5 KB');
});
