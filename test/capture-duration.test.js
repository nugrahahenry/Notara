const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCaptureDuration } = require('../build/lib/capture/audio.js');

test('capture duration prefers measured metadata when available', () => {
  assert.equal(resolveCaptureDuration(33.4, 41), 33);
});

test('capture duration falls back to the live recorder timer when WebM metadata is unavailable', () => {
  assert.equal(resolveCaptureDuration(0, 33), 33);
  assert.equal(resolveCaptureDuration(Number.NaN, 33), 33);
});

test('capture duration stays empty when neither source is usable', () => {
  assert.equal(resolveCaptureDuration(0, 0), 0);
  assert.equal(resolveCaptureDuration(Number.POSITIVE_INFINITY, -1), 0);
});
