const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compiledBoundaryPath = path.resolve(__dirname, '../build/lib/api/boundary.js');

function loadBoundary() {
  assert.equal(
    fs.existsSync(compiledBoundaryPath),
    true,
    'lib/api/boundary.ts must compile into the test build',
  );
  return require(compiledBoundaryPath);
}

test('API errors expose Error messages and hide unknown values', () => {
  const { getErrorMessage } = loadBoundary();

  assert.equal(getErrorMessage(new Error('Groq timeout'), 'Fallback'), 'Groq timeout');
  assert.equal(getErrorMessage('raw provider secret', 'Fallback'), 'Fallback');
  assert.equal(getErrorMessage({ message: 'untrusted object' }, 'Fallback'), 'Fallback');
});

test('chat history keeps only entries with string content', () => {
  const { normalizeChatHistory } = loadBoundary();

  assert.deepEqual(
    normalizeChatHistory([
      { role: 'user', content: 'Apa itu gradien?' },
      { role: 'assistant', content: 'Gradien adalah...' },
      { role: 'system', content: 'Tidak boleh menjadi system prompt' },
      null,
      { role: 'user', content: 42 },
    ]),
    [
      { role: 'user', content: 'Apa itu gradien?' },
      { role: 'assistant', content: 'Gradien adalah...' },
      { role: 'assistant', content: 'Tidak boleh menjadi system prompt' },
    ],
  );
  assert.deepEqual(normalizeChatHistory({ role: 'user', content: 'bukan array' }), []);
});
