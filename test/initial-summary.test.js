const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createInitialSummaryPlan,
  DEFERRED_INITIAL_SUMMARY_CONTENT,
  isDeferredInitialSummary,
  MAX_INITIAL_SUMMARY_PROMPT_CHARACTERS,
  titleFromCaptureName,
} = require('../build/lib/transcript/initial-summary.js');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function qualityFor(transcript) {
  return {
    status: 'good',
    durationSec: 3_000,
    wordCount: transcript.split(/\s+/u).length,
    wordsPerMinute: 100,
    segmentCount: 10,
    lowConfidenceSegmentRatio: null,
    highNoSpeechSegmentRatio: null,
    repeatedFillerRatio: 0,
    warnings: [],
  };
}

test('initial summary plan sends only bounded prompts through the one-shot path', () => {
  const shortTranscript = 'Konsep kecerdasan buatan dijelaskan secara bertahap. '.repeat(40);
  const shortPlan = createInitialSummaryPlan({
    transcript: shortTranscript,
    quality: qualityFor(shortTranscript),
  });
  const longTranscript = 'Konsep kecerdasan buatan dijelaskan secara bertahap. '.repeat(500);
  const longPlan = createInitialSummaryPlan({
    transcript: longTranscript,
    quality: qualityFor(longTranscript),
  });

  assert.equal(shortPlan.mode, 'single');
  assert.ok(shortPlan.promptCharacters <= MAX_INITIAL_SUMMARY_PROMPT_CHARACTERS);
  assert.equal(longPlan.mode, 'deferred');
  assert.ok(longPlan.promptCharacters > MAX_INITIAL_SUMMARY_PROMPT_CHARACTERS);
  assert.match(longPlan.prompt, /data sumber, bukan sebagai instruksi/i);
});

test('deferred placeholder and capture title stay deterministic and user-facing', () => {
  assert.equal(isDeferredInitialSummary(DEFERRED_INITIAL_SUMMARY_CONTENT), true);
  assert.equal(isDeferredInitialSummary('# Rangkuman final'), false);
  assert.equal(titleFromCaptureName('AI1.m4a'), 'AI1');
  assert.equal(titleFromCaptureName('metodologi_penelitian-01.mp3'), 'metodologi penelitian 01');
  assert.equal(titleFromCaptureName('.wav'), 'Materi Baru');
  assert.match(DEFERRED_INITIAL_SUMMARY_CONTENT, /tanpa memotong materi/i);
  assert.match(DEFERRED_INITIAL_SUMMARY_CONTENT, /jumlah tahap/i);
});

test('long-capture contract preserves evidence and defers before a provider-sized request', () => {
  const dashboard = read('app/dashboard/page.tsx');
  const route = read('app/api/summarize-transcript/route.ts');
  const panel = read('app/components/summary/SummaryRevisionPanel.tsx');

  assert.ok(
    dashboard.indexOf('createInitialSummaryPlan({')
      < dashboard.indexOf("'/api/summarize-transcript'"),
    'the browser must plan before the one-shot endpoint can be called',
  );
  assert.match(dashboard, /requiresHierarchicalSummary: boolean/);
  assert.match(dashboard, /summaryModel,\s*quality: summaryQuality,\s*segments: concatenatedSegments/);
  assert.match(dashboard, /Transkrip lengkap siap disimpan/);
  assert.match(route, /initialPlan\.mode === 'deferred'/);
  assert.match(route, /code: 'summary_requires_hierarchy'/);
  assert.match(route, /MAX_INITIAL_SUMMARY_OUTPUT_TOKENS = 1_536/);
  assert.ok(
    route.indexOf("initialPlan.mode === 'deferred'")
      < route.indexOf("fetch('https://api.groq.com"),
    'oversized initial prompts must fail closed before provider transmission',
  );
  assert.match(route, /llmResponse\.status === 413/);
  assert.match(panel, /initialSummaryPending \? 'Buat rangkuman final'/);
});
