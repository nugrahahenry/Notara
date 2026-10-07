const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTutorPresentation, getTutorRecoveryQuestion, canSubmitTutor, isTutorSubmitKey } = require('../build/lib/chat/tutor-presentation');
const message = (role, content) => ({ id: content, role, content });

test('Tutor states distinguish ready, waiting, streaming, completed and failed requests', () => {
  assert.equal(getTutorPresentation([], false).state, 'ready');
  assert.equal(getTutorPresentation([message('user', 'Apa inti materi?')], true).state, 'thinking');
  assert.equal(getTutorPresentation([message('assistant', '')], true).state, 'thinking');
  assert.equal(getTutorPresentation([message('assistant', 'Manusia, proses')], true).state, 'responding');
  assert.equal(getTutorPresentation([message('assistant', 'Manusia, proses, teknologi.')], false).state, 'active');
  assert.equal(getTutorPresentation([message('assistant', '  ❌ Batas sementara.')], false).state, 'error');
  assert.equal(getTutorPresentation([message('user', '❌ adalah simbol apa?')], false).state, 'ready');
});

test('older failed answers restore their own question, not a later question', () => {
  const thread = [message('user', 'Pertanyaan pertama'), message('assistant', '❌ Gagal'), message('user', 'Pertanyaan kedua'), message('assistant', 'Jawaban kedua')];
  assert.equal(getTutorRecoveryQuestion(thread, 1), 'Pertanyaan pertama');
  assert.equal(getTutorRecoveryQuestion(thread, 3), null);
  assert.equal(getTutorRecoveryQuestion(thread, -1), null);
  assert.equal(getTutorRecoveryQuestion(thread, 10), null);
  assert.equal(getTutorRecoveryQuestion(thread, 1.5), null);
  assert.equal(getTutorRecoveryQuestion([message('assistant', '❌ Gagal')], 0), null);
});

test('Tutor never submits empty drafts or a second in-flight request', () => {
  assert.equal(canSubmitTutor('  \n ', false), false);
  assert.equal(canSubmitTutor('Pertanyaan', true), false);
  assert.equal(canSubmitTutor('Pertanyaan', false), true);
});

test('composition and multiline keyboard input do not become a Tutor send', () => {
  assert.equal(isTutorSubmitKey('Enter', false, false, 13), true);
  assert.equal(isTutorSubmitKey('Enter', true, false, 13), false);
  assert.equal(isTutorSubmitKey('Enter', false, true, 13), false);
  assert.equal(isTutorSubmitKey('Enter', false, false, 229), false);
  assert.equal(isTutorSubmitKey('a', false, false, 65), false);
});

test('presentation helpers have no provider, storage, credential, or network dependency', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/chat/tutor-presentation.ts'), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|supabase|process\.env|localStorage|sessionStorage|indexedDB/);
});

test('Tutor composer announces draft state without reading every streamed token aloud', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/components/study-guide/InlineMaterialTutor.tsx'), 'utf8');
  assert.match(source, /role="log"[^>]*aria-live="off"/);
  assert.match(source, /aria-describedby=\{inputHelpId\}/);
  assert.match(source, /Draft pertanyaan · belum dikirim/);
  assert.match(source, /event\.nativeEvent\.isComposing/);
  assert.match(source, /\[input, showHistory, textareaRef\]/);
  assert.match(source, /getTutorRecoveryQuestion\(visibleMessages, index\)/);
});

test('learning positions are orientation, not completion or hidden persistence', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/components/study-guide/LearningPosition.tsx'), 'utf8');
  assert.match(source, /aria-current=\{position\.stage === stage \? 'step'/);
  assert.doesNotMatch(source, /fetch|localStorage|sessionStorage|percentage|completed|mastery|<button/);
});
