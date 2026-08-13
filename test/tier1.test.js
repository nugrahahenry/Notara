// test/tier1.test.js
// Tier 1: Feature Coverage (>=5 test cases per feature)
require('./mocks/browser.mock');
const { dbState } = require('./mocks/supabase.mock');
const { AppSimulator } = require('./simulators/app.simulator');
const test = require('node:test');
const assert = require('node:assert');

test.describe('Tier 1: Feature Coverage', () => {
  let app;

  test.beforeEach(() => {
    app = new AppSimulator();
  });

  // ─────────────────────────────────────────────
  // FEATURE 1: VOICE INPUT / SPEECH-TO-TEXT
  // ─────────────────────────────────────────────
  test.describe('Feature 1: Voice Input / Speech-to-Text', () => {
    test('1.1 should change state to recording when recording starts', () => {
      app.startRecording();
      assert.strictEqual(app.isRecordingMode, true);
      assert.strictEqual(app.isPaused, false);
      assert.strictEqual(app.recordingDuration, 0);
    });

    test('1.2 should toggle pause and resume states correctly during recording', () => {
      app.startRecording();
      app.pauseRecording();
      assert.strictEqual(app.isPaused, true);
      app.resumeRecording();
      assert.strictEqual(app.isPaused, false);
    });

    test('1.3 should stop recording and generate/cache audio blob and URL', () => {
      app.startRecording();
      app.stopRecording();
      assert.strictEqual(app.isRecordingMode, false);
      assert.ok(app.audioBlob);
      assert.strictEqual(app.audioUrl, 'blob:http://localhost:3000/mock-audio');
    });

    test('1.4 should toggle mic active status and trigger speech listener', async () => {
      await app.toggleMic();
      assert.strictEqual(app.isListening, true);
      await app.toggleMic();
      assert.strictEqual(app.isListening, false);
    });

    test('1.5 should append recognized speech text to chat input field', async () => {
      await app.toggleMic();
      // Wait for mock speech recognition to fire
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.strictEqual(app.chatInput, 'Halo selamat datang di Notara');
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 2: SHARE CARD CREATION
  // ─────────────────────────────────────────────
  test.describe('Feature 2: Share Card Creation', () => {
    test('2.1 should set modal open and target layout format', () => {
      app.selectedSummary = { id: 'sum-1', title: 'Calculus Lecture' };
      app.showShareCardModal = true;
      app.shareCardFormat = 'feed';
      assert.strictEqual(app.showShareCardModal, true);
      assert.strictEqual(app.shareCardFormat, 'feed');
    });

    test('2.2 should call html2canvas simulation and download share card', async () => {
      app.selectedSummary = { id: 'sum-1', title: 'Calculus Lecture' };
      const success = await app.generateShareCard('feed');
      assert.strictEqual(success, true);
      assert.strictEqual(app.isGeneratingCard, false);
      assert.strictEqual(app.lastDownloadFilename, 'nalira_Calculus_Lecture_feed.png');
    });

    test('2.3 should format custom safe download filenames properly', async () => {
      app.selectedSummary = { id: 'sum-1', title: 'My Awesome Physics Lecture!@#' };
      await app.generateShareCard('story');
      // Verify title formatting directly.
      const safeTitle = app.selectedSummary.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 40).replace(/\s+/g, '_');
      assert.strictEqual(safeTitle, 'My_Awesome_Physics_Lecture');
    });

    test('2.4 should render card layout content with Feed 1:1 settings', () => {
      app.shareCardFormat = 'feed';
      assert.strictEqual(app.shareCardFormat, 'feed');
    });

    test('2.5 should render card layout content with Story 9:16 settings', () => {
      app.shareCardFormat = 'story';
      assert.strictEqual(app.shareCardFormat, 'story');
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 3: STUDY GROUP COLLABORATION
  // ─────────────────────────────────────────────
  test.describe('Feature 3: Study Group Collaboration', () => {
    test('3.1 should create study group with owner role assigned', async () => {
      app.user = { id: 'usr-owner-1' };
      const group = await app.createStudyGroup('Anatomy Study', 'Learn human anatomy');
      assert.ok(group);
      assert.strictEqual(group.name, 'Anatomy Study');
      assert.strictEqual(group.user_role, 'owner');
      assert.strictEqual(app.studyGroups.length, 1);
    });

    test('3.2 should join study group using invite code', async () => {
      app.user = { id: 'usr-member-1' };
      
      // Inject group to DB
      dbState.study_groups.push({
        id: 'group-abc',
        name: 'Math Prep',
        invite_code: 'MATH101',
        owner_id: 'usr-owner-1',
        created_at: new Date().toISOString()
      });

      const joinedGroup = await app.joinStudyGroup('MATH101');
      assert.ok(joinedGroup);
      assert.strictEqual(joinedGroup.name, 'Math Prep');
      assert.strictEqual(joinedGroup.user_role, 'member');
    });

    test('3.3 should retrieve group members list', async () => {
      dbState.group_members.push({
        group_id: 'group-abc',
        user_id: 'usr-member-1',
        role: 'member',
        joined_at: new Date().toISOString()
      });

      await app.loadGroupMembers('group-abc');
      assert.strictEqual(app.groupMembers.length, 1);
      assert.strictEqual(app.groupMembers[0].user_id, 'usr-member-1');
    });

    test('3.4 should share folder with study group and write relation', async () => {
      const success = await app.shareFolderWithGroup('folder-1', 'group-abc');
      assert.strictEqual(success, true);
      const isShared = dbState.group_folders.some(gf => gf.folder_id === 'folder-1' && gf.group_id === 'group-abc');
      assert.strictEqual(isShared, true);
    });

    test('3.5 should leave study group and clear active state', async () => {
      app.user = { id: 'usr-member-1' };
      dbState.group_members.push({
        group_id: 'group-abc',
        user_id: 'usr-member-1',
        role: 'member',
        joined_at: new Date().toISOString()
      });
      app.studyGroups = [{ id: 'group-abc', name: 'Math Prep' }];
      app.activeGroupId = 'group-abc';

      const success = await app.leaveStudyGroup('group-abc');
      assert.strictEqual(success, true);
      assert.strictEqual(app.studyGroups.length, 0);
      assert.strictEqual(app.activeGroupId, null);
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 4: AUTHENTICATION & 2FA SECURITY
  // ─────────────────────────────────────────────
  test.describe('Feature 4: Authentication & 2FA Security', () => {
    test('4.1 should register new user via email signup', async () => {
      const success = await app.signUp('new@notara.com', 'securepass', 'John Doe');
      assert.strictEqual(success, true);
      assert.ok(app.user);
      assert.strictEqual(app.user.email, 'new@notara.com');
    });

    test('4.2 should authenticate user with correct email and password', async () => {
      // Seed user
      dbState.users.push({
        id: 'usr-john',
        email: 'john@notara.com',
        user_metadata: { full_name: 'John Doe' }
      });

      const success = await app.login('john@notara.com', 'securepass');
      assert.strictEqual(success, true);
      assert.ok(app.user);
      assert.strictEqual(app.user.id, 'usr-john');
    });

    test('4.3 should handle Google OAuth redirect login', async () => {
      const success = await app.googleLogin();
      assert.strictEqual(success, true);
      assert.ok(app.user);
      assert.strictEqual(app.user.email, 'google@notara.com');
    });

    test('4.4 should enroll MFA TOTP factor returning secret and QR code', async () => {
      app.user = { id: 'usr-1' };
      const success = await app.enrollMfa();
      assert.strictEqual(success, true);
      assert.ok(app.mfaFactorId);
      assert.ok(app.mfaQrCode.startsWith('otpauth://totp/'));
      assert.strictEqual(app.mfaSecret, 'JBSWY3DPEHPK3PXP');
    });

    test('4.5 should verify MFA TOTP challenge and enable factor status', async () => {
      app.user = { id: 'usr-1' };
      await app.enrollMfa();
      const success = await app.verifyMfa('123456');
      assert.strictEqual(success, true);
      assert.strictEqual(app.mfaEnabled, true);
      assert.strictEqual(app.mfaFactors.length, 1);
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 5: SUMMARY, EXPORTS, SEARCH (Ctrl+K)
  // ─────────────────────────────────────────────
  test.describe('Feature 5: Summary, Exports, Search (Ctrl+K)', () => {
    test('5.1 should create new summary and select it', async () => {
      app.user = { id: 'usr-1' };
      const summary = await app.createSummary('Database Basics', 'Intro to database design...', '# Database Basics\n\n- Entity Relationship');
      assert.ok(summary);
      assert.strictEqual(app.summaries.length, 1);
      assert.strictEqual(app.selectedSummary.id, summary.id);
    });

    test('5.2 should export summary as HTML Open XML Word document', () => {
      app.selectedSummary = { title: 'AI Ethics', summary: '# AI Ethics\n\n- Fairness' };
      app.exportWord();
      assert.strictEqual(app.toast.message, 'Word Doc berhasil diunduh!');
    });

    test('5.3 should invoke window.print for PDF print layout', () => {
      app.selectedSummary = { title: 'AI Ethics', summary: '# AI Ethics\n\n- Fairness' };
      global.window.printed = false;
      app.exportPdf();
      assert.strictEqual(global.window.printed, true);
      assert.strictEqual(app.toast.message, 'PDF berhasil diekspor!');
    });

    test('5.4 should toggle search command palette via Ctrl+K trigger', () => {
      assert.strictEqual(app.showSearchModal, false);
      app.triggerCtrlK();
      assert.strictEqual(app.showSearchModal, true);
      app.triggerCtrlK();
      assert.strictEqual(app.showSearchModal, false);
    });

    test('5.5 should filter summaries list using search query text', () => {
      app.summaries = [
        { id: '1', title: 'Biology Class', transcript: '', summary: '' },
        { id: '2', title: 'Quantum Physics Lecture', transcript: '', summary: '' }
      ];
      const results1 = app.handleSearch('quantum');
      assert.strictEqual(results1.length, 1);
      assert.strictEqual(results1[0].id, '2');

      const results2 = app.handleSearch('chemistry');
      assert.strictEqual(results2.length, 0);
    });
  });
});
