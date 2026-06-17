// test/tier4.test.js
// Tier 4: Real-World Application Scenarios (>=5 test cases simulating complete user workflows)
require('./mocks/browser.mock');
const { resetDb, dbState } = require('./mocks/supabase.mock');
const { AppSimulator } = require('./simulators/app.simulator');
const test = require('node:test');
const assert = require('node:assert');

test.describe('Tier 4: Real-World Application Scenarios', () => {
  let app;

  test.beforeEach(() => {
    app = new AppSimulator();
  });

  test('4.1 should simulate Study Group Collaboration Session', async () => {
    // 1. User A logs in
    dbState.users.push({ id: 'usr-a', email: 'usera@notara.com' });
    await app.login('usera@notara.com', 'securepass');

    // 2. Creates a study group
    const group = await app.createStudyGroup('Biology Prep 101');
    assert.ok(group);

    // 3. Creates a folder "Biology"
    const folder = await app.createFolder('Biology Notes', '🧬');
    assert.ok(folder);

    // 4. Shares folder with the study group
    const shareSuccess = await app.shareFolderWithGroup(folder.id, group.id);
    assert.strictEqual(shareSuccess, true);

    // 5. Verifies sharing relationship
    await app.loadGroupMembers(group.id);
    assert.strictEqual(app.groupMembers.length, 1);
    assert.strictEqual(app.groupMembers[0].user_id, 'usr-a');
    assert.strictEqual(app.groupMembers[0].role, 'owner');
  });

  test('4.2 should simulate Multi-File Lecture Summary Pipeline', async () => {
    // 1. User logs in
    dbState.users.push({ id: 'usr-student', email: 'student@notara.com' });
    await app.login('student@notara.com', 'securepass');

    // 2. Selects a folder destination
    const folder = await app.createFolder('Physics Lectures', '🔭');
    app.chosenSaveFolderId = folder.id;

    // 3. Queues 3 files (e.g. Lec1, Lec2, Lec3)
    const file1 = { name: 'Lec1_Quantum.mp3', size: 10 * 1024 * 1024 };
    const file2 = { name: 'Lec2_Relativity.mp3', size: 12 * 1024 * 1024 };
    const file3 = { name: 'Lec3_Optics.mp3', size: 8 * 1024 * 1024 };
    app.handleFileChange([file1, file2, file3]);
    assert.strictEqual(app.files.length, 3);

    // 4. Submits the queue and processes sequentially
    await app.submitQueue();
    assert.strictEqual(app.files.length, 0); // Queue cleared
    assert.strictEqual(app.summaries.length, 3); // 3 summaries created

    // 5. Inspects a summary, verifies word count, and exports to Word
    app.selectedSummary = app.summaries[2];
    assert.strictEqual(app.selectedSummary.folder_id, folder.id);
    assert.ok(app.selectedSummary.word_count > 0);
    app.exportWord();
    assert.strictEqual(app.toast.message, 'Word Doc berhasil diunduh!');
  });

  test('4.3 should simulate Live Lecture Recording & Shared Study Deck', async () => {
    // 1. User logs in
    dbState.users.push({ id: 'usr-student', email: 'student@notara.com' });
    await app.login('student@notara.com', 'securepass');

    // 2. Starts live audio recording
    app.startRecording();
    assert.strictEqual(app.isRecordingMode, true);

    // 3. Pauses recording for recess, then resumes
    app.pauseRecording();
    assert.strictEqual(app.isPaused, true);
    app.resumeRecording();
    assert.strictEqual(app.isPaused, false);

    // 4. Stops recording
    app.stopRecording();
    assert.strictEqual(app.isRecordingMode, false);
    assert.ok(app.audioBlob);

    // 5. Creates summary
    const summary = await app.createSummary(
      'Organic Chemistry Lec 1',
      'Whisper transcript...',
      '# Organic Chemistry\n\n- Alkanes\n- Alkenes'
    );
    assert.ok(summary);

    // 6. Makes summary public
    await app.toggleSummaryPublic(summary.id, true);
    assert.strictEqual(app.selectedSummary.is_public, true);

    // 7. Generates a Story 9:16 layout Share Card
    const cardSuccess = await app.generateShareCard('story');
    assert.strictEqual(cardSuccess, true);
  });

  test('4.4 should simulate Collaborative Study Forking', async () => {
    // 1. User A logs in and creates a public summary
    dbState.users.push({ id: 'usr-a', email: 'usera@notara.com' });
    await app.login('usera@notara.com', 'securepass');
    const originalSummary = await app.createSummary('Global Warming Basics', 'Transcript...', '# Global Warming');
    await app.toggleSummaryPublic(originalSummary.id, true);
    const publicSlug = app.selectedSummary.public_slug;
    await app.logout();

    // 2. User B logs in
    dbState.users.push({ id: 'usr-b', email: 'userb@notara.com' });
    await app.login('userb@notara.com', 'securepass');

    // 3. User B forks User A's summary using public slug
    const forkedSummary = await app.forkSummary(publicSlug);
    assert.ok(forkedSummary);
    assert.strictEqual(forkedSummary.title, 'Global Warming Basics (Salinan)');
    assert.strictEqual(forkedSummary.user_id, 'usr-b');
    assert.strictEqual(forkedSummary.is_public, false); // Copy is private by default

    // 4. User B organizes the fork into a folder "Earth Science"
    const folder = await app.createFolder('Earth Science', '🌍');
    const moveSuccess = await app.moveSummaryToFolder(forkedSummary.id, folder.id);
    assert.strictEqual(moveSuccess, true);
  });

  test('4.5 should simulate Secure Workspace Setup & Active Study Tracking', async () => {
    // 1. User logs in
    dbState.users.push({ id: 'usr-track', email: 'tracker@notara.com' });
    await app.login('tracker@notara.com', 'securepass');

    // 2. Set up MFA TOTP
    await app.enrollMfa();
    await app.verifyMfa('123456');
    assert.strictEqual(app.mfaEnabled, true);
    await app.logout();

    // 3. User logs in again, meets MFA challenge block
    await app.login('tracker@notara.com', 'securepass');
    assert.strictEqual(app.showMfaChallengeBlock, true);

    // 4. Verifies MFA code to clear challenge block
    await app.challengeVerifyMfa('123456');
    assert.strictEqual(app.showMfaChallengeBlock, false);

    // 5. Selects summary and tracks focus time
    const summary = await app.createSummary('Deep Learning', 'Transcript...', '# Deep Learning');
    app.selectedSummary = summary;
    
    // Simulate study time tick (timer)
    app.focusActiveTimerTick();
    app.focusActiveTimerTick();
    
    // Check localStorage status
    const key = `fokus_aktif_${summary.id}`;
    const storedSeconds = global.localStorage.getItem(key);
    assert.strictEqual(Number(storedSeconds), 2);
  });
});
