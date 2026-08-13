const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldLoadChatThreadHistory,
} = require('../build/lib/chat/thread-state.js');

test('a newly created local thread keeps its optimistic messages', () => {
  assert.equal(shouldLoadChatThreadHistory('thread-new', 'thread-new'), false);
});

test('an existing selected thread loads its persisted history', () => {
  assert.equal(shouldLoadChatThreadHistory('thread-existing', null), true);
  assert.equal(
    shouldLoadChatThreadHistory('thread-existing', 'another-local-thread'),
    true,
  );
});

test('no active thread does not request message history', () => {
  assert.equal(shouldLoadChatThreadHistory(null, null), false);
});
