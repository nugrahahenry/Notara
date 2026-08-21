const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECORDING_SOURCE_TEST_SECONDS,
  RecordingSourceCaptureError,
  getBrowserTabCaptureOptions,
  getMicrophoneCaptureConstraints,
  getPreferredRecordingMimeType,
  getRecordingFileExtension,
  getRecordingSourceErrorPresentation,
  getRecordingSourceFileStem,
  validateBrowserTabCapture,
} = require('../build/lib/capture/source.js');

test('microphone source requests speech-focused audio constraints only', () => {
  assert.deepEqual(getMicrophoneCaptureConstraints(), {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
});

test('tab source requests tab-oriented capture without system audio', () => {
  assert.deepEqual(getBrowserTabCaptureOptions(), {
    audio: true,
    video: true,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
    systemAudio: 'exclude',
    preferCurrentTab: false,
  });
  assert.equal(RECORDING_SOURCE_TEST_SECONDS, 10);
});

test('tab validation rejects windows, screens, and captures without audio', () => {
  assert.equal(validateBrowserTabCapture({
    audioTrackCount: 1,
    displaySurface: 'browser',
  }), null);
  assert.equal(validateBrowserTabCapture({
    audioTrackCount: 1,
    displaySurface: 'window',
  }), 'wrong-display-surface');
  assert.equal(validateBrowserTabCapture({
    audioTrackCount: 0,
    displaySurface: 'browser',
  }), 'tab-audio-missing');
  assert.equal(validateBrowserTabCapture({ audioTrackCount: 1 }), null);
});

test('capture errors explain recovery without leaking raw errors', () => {
  const missingAudio = getRecordingSourceErrorPresentation(
    new RecordingSourceCaptureError('tab-audio-missing'),
    'browser-tab',
  );
  assert.equal(missingAudio.code, 'tab-audio-missing');
  assert.match(missingAudio.message, /Bagikan juga audio tab/);

  const deniedMic = getRecordingSourceErrorPresentation(
    { name: 'NotAllowedError', message: 'private browser detail' },
    'microphone',
  );
  assert.equal(deniedMic.code, 'permission-denied');
  assert.match(deniedMic.message, /Izin mikrofon/);
  assert.doesNotMatch(deniedMic.message, /private browser detail/);
});

test('recorder format selection and filenames stay deterministic', () => {
  const supported = new Set(['audio/webm', 'audio/ogg;codecs=opus']);
  assert.equal(
    getPreferredRecordingMimeType((mimeType) => supported.has(mimeType)),
    'audio/webm',
  );
  assert.equal(getPreferredRecordingMimeType(() => false), null);
  assert.equal(getRecordingSourceFileStem('microphone'), 'rekaman-kelas');
  assert.equal(getRecordingSourceFileStem('browser-tab'), 'rekaman-kelas-online');
  assert.equal(getRecordingFileExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(getRecordingFileExtension('audio/ogg;codecs=opus'), 'ogg');
});
