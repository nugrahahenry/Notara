const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compiledPath = path.resolve(__dirname, '../build/lib/chat/sse.js');

function loadStream() {
  assert.equal(fs.existsSync(compiledPath), true, 'lib/chat/sse.ts must compile into the test build');
  return require(compiledPath);
}

test('chat stream parser preserves JSON events split across chunks', () => {
  const { ChatStreamParser } = loadStream();
  const parser = new ChatStreamParser();
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Halo "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Henry"',
    '}}]}\n\ndata: [DONE]\n\n',
  ];
  const output = chunks.flatMap((chunk) => parser.push(encoder.encode(chunk)));
  output.push(...parser.finish());

  assert.deepEqual(output, ['Halo ', 'Henry']);
});

test('chat stream parser ignores malformed events and accepts trailing data', () => {
  const { ChatStreamParser } = loadStream();
  const parser = new ChatStreamParser();
  const encoder = new TextEncoder();
  const output = parser.push(encoder.encode('data: {not-json}\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}'));
  output.push(...parser.finish());

  assert.deepEqual(output, ['ok']);
});
