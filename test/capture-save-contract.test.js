const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'dashboard', 'page.tsx'),
  'utf8',
);

test('capture save modal prevents duplicate Supabase inserts while saving', () => {
  assert.match(source, /pendingSummarySaveRef\.current/);
  assert.match(source, /if \(!pendingSummary \|\| pendingSummarySaveRef\.current\) return/);
  assert.match(source, /disabled=\{isSavingPendingSummary\}/);
  assert.match(source, /aria-busy=\{isSavingPendingSummary\}/);
  assert.match(source, /Menyimpan\.\.\./);
  assert.match(source, /releaseSaveLock\(\);[\s\S]*finally/);
});

test('capture save failures keep the processed result available for a save-only retry', () => {
  assert.match(source, /'save-failed'/);
  assert.match(source, /audio tidak akan dikirim ulang/);
  assert.match(source, /markCaptureTaskFailed\(captureTaskId,[\s\S]*'save'\)/);
  assert.match(source, /task\.error\.retryMode === 'save'/);
  assert.match(source, /pendingSummary\?\.captureTaskId === taskId/);
  assert.match(source, /if \(!canResumePendingSave\) setPendingSummary\(null\)/);
});
