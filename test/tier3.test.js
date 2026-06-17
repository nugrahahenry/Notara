// test/tier3.test.js
// Tier 3: Cross-Feature Combinations (>=5 test cases covering interactions)
require('./mocks/browser.mock');
const { resetDb, dbState } = require('./mocks/supabase.mock');
const { AppSimulator } = require('./simulators/app.simulator');
const test = require('node:test');
const assert = require('node:assert');

test.describe('Tier 3: Cross-Feature Combinations', () => {
  let app;

  test.beforeEach(() => {
    app = new AppSimulator();
  });

  test('3.1 should execute user onboarding workflow (Auth + Study Group creation)', async () => {
    // 1. Sign up new user
    const signupSuccess = await app.signUp('onboard@notara.com', 'securepass', 'Fresh Student');
    assert.strictEqual(signupSuccess, true);
    assert.ok(app.user);

    // 2. Load dashboard data
    await app.loadInitialData();

    // 3. Immediately create a study group for their classes
    const group = await app.createStudyGroup('Onboarding Group', 'Study group for new students');
    assert.ok(group);
    assert.strictEqual(group.name, 'Onboarding Group');
    assert.strictEqual(group.user_role, 'owner');
    
    // Check state persistence
    assert.strictEqual(app.studyGroups.length, 1);
    assert.strictEqual(app.studyGroups[0].id, group.id);
  });

  test('3.2 should convert live voice recording into a summary document (Voice Note -> Summary)', async () => {
    app.user = { id: 'usr-1' };
    
    // 1. Start live audio recording
    app.startRecording();
    assert.strictEqual(app.isRecordingMode, true);

    // 2. Stop recording to cache the audio blob
    app.stopRecording();
    assert.strictEqual(app.isRecordingMode, false);
    assert.ok(app.audioBlob);

    // 3. Process the audio to generate a summary
    app.statusMessage = 'Memproses rekaman suara...';
    const summary = await app.createSummary(
      'Recorded Lecture',
      'This is a transcript from my live voice note',
      '# Live Note Summary\n\n- Key Point 1\n- Key Point 2',
      12,
      'voice_note.webm'
    );

    assert.ok(summary);
    assert.strictEqual(summary.title, 'Recorded Lecture');
    assert.strictEqual(app.selectedSummary.id, summary.id);
    assert.strictEqual(app.summaries.length, 1);
  });

  test('3.3 should organize summary under folder and lookup via command search (Summary -> Folder -> Search)', async () => {
    app.user = { id: 'usr-1' };
    await app.loadInitialData();

    // 1. Create folder
    const folder = await app.createFolder('AI & ML', '🤖', '#EC4899');
    assert.ok(folder);

    // 2. Create summary
    const summary = await app.createSummary(
      'Neural Networks Intro',
      'Transcript about neural nets...',
      '# Neural Networks\n\n- Multilayer perceptron'
    );
    assert.ok(summary);

    // 3. Move summary into folder
    const moveSuccess = await app.moveSummaryToFolder(summary.id, folder.id);
    assert.strictEqual(moveSuccess, true);

    // 4. Open command palette and search for the summary
    app.triggerCtrlK();
    assert.strictEqual(app.showSearchModal, true);

    const searchResults = app.handleSearch('neural');
    assert.strictEqual(searchResults.length, 1);
    assert.strictEqual(searchResults[0].id, summary.id);
    assert.strictEqual(searchResults[0].folder_id, folder.id);
  });

  test('3.4 should make summary public and download customized social share card (Summary -> Public Link -> Share Card)', async () => {
    app.user = { id: 'usr-1' };

    // 1. Create a study summary
    const summary = await app.createSummary(
      'Linear Algebra',
      'Transcript about vector spaces',
      '# Linear Algebra Summary'
    );
    assert.ok(summary);

    // 2. Toggle summary to public link
    const toggleSuccess = await app.toggleSummaryPublic(summary.id, true);
    assert.strictEqual(toggleSuccess, true);
    assert.strictEqual(app.selectedSummary.is_public, true);
    assert.ok(app.selectedSummary.public_slug);

    // 3. Generate Share Card (Feed layout)
    const cardSuccess = await app.generateShareCard('feed');
    assert.strictEqual(cardSuccess, true);
  });

  test('3.5 should secure group workspace access using 2FA status (MFA Enroll -> Verification -> Join Group)', async () => {
    // 1. Login user
    dbState.users.push({ id: 'usr-secure', email: 'secure@notara.com' });
    const loginSuccess = await app.login('secure@notara.com', 'securepass');
    assert.strictEqual(loginSuccess, true);

    // 2. Enroll 2FA TOTP
    const enrollSuccess = await app.enrollMfa();
    assert.strictEqual(enrollSuccess, true);
    assert.ok(app.mfaFactorId);

    // 3. Verify MFA code to enable security
    const verifySuccess = await app.verifyMfa('123456');
    assert.strictEqual(verifySuccess, true);
    assert.strictEqual(app.mfaEnabled, true);

    // 4. Create group and join with MFA factor verified
    const group = await app.createStudyGroup('MFA Secure Group');
    assert.ok(group);
    assert.strictEqual(group.user_role, 'owner');
  });
});
