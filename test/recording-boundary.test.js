const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getRecordingBoundaryAction,
  stopActiveRecorder,
} = require('../build/lib/capture/recording.js');

test('free recording stops exactly at its session limit instead of showing an ongoing reminder', () => {
  assert.equal(getRecordingBoundaryAction(1799, 1800), 'continue');
  assert.equal(getRecordingBoundaryAction(1800, 1800), 'stop');
  assert.equal(getRecordingBoundaryAction(1801, 1800), 'stop');
});

test('paid recording receives the 30-minute reminder and stops at its own limit', () => {
  assert.equal(getRecordingBoundaryAction(1800, 7200), 'remind');
  assert.equal(getRecordingBoundaryAction(7199, 7200), 'continue');
  assert.equal(getRecordingBoundaryAction(7200, 7200), 'stop');
});

test('active and paused recorders can be finalized without relying on stale React state', () => {
  for (const state of ['recording', 'paused']) {
    let stops = 0;
    const recorder = { state, stop: () => { stops += 1; } };
    assert.equal(stopActiveRecorder(recorder), true);
    assert.equal(stops, 1);
  }

  let inactiveStops = 0;
  assert.equal(stopActiveRecorder({
    state: 'inactive',
    stop: () => { inactiveStops += 1; },
  }), false);
  assert.equal(inactiveStops, 0);
  assert.equal(stopActiveRecorder(null), false);
});

test('dashboard promises a finalized temporary recording when the limit is reached', () => {
  const dashboard = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'dashboard', 'page.tsx'),
    'utf8',
  );

  assert.match(dashboard, /stopActiveRecorder\(mediaRecorderRef\.current\)/);
  assert.match(dashboard, /Rekaman dihentikan otomatis/);
  assert.doesNotMatch(dashboard, /Perekaman langsung untuk akun gratis dijeda otomatis/);
});

