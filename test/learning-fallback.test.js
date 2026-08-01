/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLearningFallback,
  estimateLearningMinutes,
  getDaypart,
} = require('../build/lib/learning/fallback.js');

const summary = (overrides = {}) => ({
  id: 'summary-1',
  folder_id: 'course-1',
  title: 'Materi pertama',
  file_name: 'materi.mp3',
  duration_sec: 3600,
  transcript: 'Transkrip',
  summary: 'Rangkuman',
  word_count: 900,
  created_at: '2026-08-01T08:00:00.000Z',
  ...overrides,
});

test('daypart follows the four local-time windows', () => {
  assert.equal(getDaypart(7), 'pagi');
  assert.equal(getDaypart(12), 'siang');
  assert.equal(getDaypart(16), 'sore');
  assert.equal(getDaypart(22), 'malam');
});

test('learning fallback stays empty for first-use accounts', () => {
  assert.equal(buildLearningFallback([], []), null);
});

test('learning fallback recommends the newest existing material', () => {
  const older = summary({ id: 'older', created_at: '2026-07-30T08:00:00.000Z' });
  const newer = summary({ id: 'newer', title: 'Materi terbaru' });
  const result = buildLearningFallback([older, newer], [{
    id: 'course-1',
    name: 'Basis Data',
    color: '#4F6BDF',
    icon: 'DB',
    created_at: '2026-07-01T00:00:00.000Z',
  }]);

  assert.equal(result.recommendation.id, 'newer');
  assert.equal(result.folder.name, 'Basis Data');
});

test('learning fallback exposes an older same-course prerequisite', () => {
  const prerequisite = summary({ id: 'prerequisite', created_at: '2026-07-20T08:00:00.000Z' });
  const recommendation = summary({ id: 'recommendation' });
  const result = buildLearningFallback([prerequisite, recommendation], []);

  assert.equal(result.prerequisite.id, 'prerequisite');
});

test('learning estimate remains conservative and bounded', () => {
  assert.equal(estimateLearningMinutes(summary({ duration_sec: 60, word_count: 0 })), 8);
  assert.equal(estimateLearningMinutes(summary({ duration_sec: 10800, word_count: 0 })), 45);
});
