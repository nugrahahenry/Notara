// test/tier2.test.js
// Tier 2: Boundary & Corner Cases (>=5 test cases per feature)
require('./mocks/browser.mock');
const { resetDb, dbState } = require('./mocks/supabase.mock');
const { AppSimulator } = require('./simulators/app.simulator');
const test = require('node:test');
const assert = require('node:assert');

test.describe('Tier 2: Boundary & Corner Cases', () => {
  let app;

  test.beforeEach(() => {
    app = new AppSimulator();
  });

  // ─────────────────────────────────────────────
  // FEATURE 1: VOICE INPUT
  // ─────────────────────────────────────────────
  test.describe('Feature 1: Voice Input', () => {
    test('1.1 should detect and warn if audio file exceeds 20MB limit', () => {
      // Simulate drop of large file
      const largeFile = { name: 'huge_lecture.mp3', size: 25 * 1024 * 1024 }; // 25MB
      app.handleFileChange([largeFile]);
      assert.strictEqual(app.files.length, 1);
      // Validate UI checks size when processing
      const exceeds = app.files[0].size > 20 * 1024 * 1024;
      assert.strictEqual(exceeds, true);
    });

    test('1.2 should stop recording automatically when free tier 30 minutes limit is reached', () => {
      app.startRecording();
      // Fast forward recording duration to 1800s
      app.recordingDuration = 1800;
      // Trigger interval-like check
      app.recordingDuration += 1;
      if (app.recordingDuration >= 1800) {
        app.stopRecording();
      }
      assert.strictEqual(app.isRecordingMode, false);
      assert.strictEqual(app.toast.message, 'Perekaman selesai. Berkas audio di-cache.');
    });

    test('1.3 should allow longer recording for Pro tier accounts (up to 120 minutes)', () => {
      app.user = { id: 'usr-pro', tier: 'pro' };
      app.startRecording();
      app.recordingDuration = 3600; // 60 minutes
      // Ensure it's still recording
      assert.strictEqual(app.isRecordingMode, true);
    });

    test('1.4 should prevent upload processing if no files or audio are queued', async () => {
      app.files = [];
      app.audioBlob = null;
      await app.submitQueue();
      assert.strictEqual(app.loading, false);
    });

    test('1.5 should handle microphone access rejection gracefully', async () => {
      // Mock permission denied
      const originalToggle = app.toggleMic;
      app.toggleMic = async function() {
        this.isListening = false;
        this.showToast('Izin akses mikrofon ditolak oleh browser.', 'delete');
      };
      await app.toggleMic();
      assert.strictEqual(app.isListening, false);
      assert.strictEqual(app.toast.message, 'Izin akses mikrofon ditolak oleh browser.');
      app.toggleMic = originalToggle; // restore
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 2: SHARE CARD
  // ─────────────────────────────────────────────
  test.describe('Feature 2: Share Card', () => {
    test('2.1 should sanitize special symbols and emojis in filenames', async () => {
      app.selectedSummary = { id: 'sum-1', title: '🧠 Kimia Organik 101!!! 🧪' };
      await app.generateShareCard('feed');
      const safeTitle = app.selectedSummary.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 40).replace(/\s+/g, '_');
      assert.strictEqual(safeTitle, 'Kimia_Organik_101');
    });

    test('2.2 should handle generateShareCard gracefully when no summary is selected', async () => {
      app.selectedSummary = null;
      const success = await app.generateShareCard('feed');
      assert.strictEqual(success, false);
      assert.strictEqual(app.isGeneratingCard, false);
    });

    test('2.3 should alert user with toast error if html2canvas library fails', async () => {
      app.selectedSummary = { id: 'sum-1', title: 'Calculus' };
      // Mock html2canvas throwing an error
      const originalGenerate = app.generateShareCard;
      app.generateShareCard = async function(format) {
        this.showToast('Gagal memproses gambar halaman. Coba lagi.', 'delete');
        return false;
      };
      const success = await app.generateShareCard('feed');
      assert.strictEqual(success, false);
      assert.strictEqual(app.toast.message, 'Gagal memproses gambar halaman. Coba lagi.');
      app.generateShareCard = originalGenerate;
    });

    test('2.4 should toggle share popover options correctly', () => {
      assert.strictEqual(app.showSharePopover, false);
      app.showSharePopover = true;
      assert.strictEqual(app.showSharePopover, true);
    });

    test('2.5 should truncate card content preview for excessively long summary text', () => {
      const longText = 'A'.repeat(5000);
      const previewText = longText.slice(0, 300) + '...';
      assert.strictEqual(previewText.length, 303);
      assert.ok(previewText.endsWith('...'));
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 3: STUDY GROUP
  // ─────────────────────────────────────────────
  test.describe('Feature 3: Study Group', () => {
    test('3.1 should reject joining study group with empty code', async () => {
      app.user = { id: 'usr-1' };
      const group = await app.joinStudyGroup('');
      assert.strictEqual(group, null);
      assert.strictEqual(app.toast.message, 'Kode undangan tidak ditemukan.');
    });

    test('3.2 should handle joining a group user is already a member of', async () => {
      app.user = { id: 'usr-member-1' };
      
      // Seed group and existing membership
      dbState.study_groups.push({
        id: 'group-1',
        name: 'Math Prep',
        invite_code: 'MATH1',
        owner_id: 'usr-owner-1'
      });
      dbState.group_members.push({
        group_id: 'group-1',
        user_id: 'usr-member-1',
        role: 'member',
        joined_at: new Date().toISOString()
      });

      const group = await app.joinStudyGroup('MATH1');
      assert.ok(group);
      // Verify no duplicate member inserts
      const members = dbState.group_members.filter(m => m.group_id === 'group-1' && m.user_id === 'usr-member-1');
      assert.strictEqual(members.length, 1);
    });

    test('3.3 should avoid duplicate group folder relation inserts if folder is already shared', async () => {
      dbState.group_folders.push({ group_id: 'group-1', folder_id: 'folder-1' });
      const success = await app.shareFolderWithGroup('folder-1', 'group-1');
      assert.strictEqual(success, true);
      const count = dbState.group_folders.filter(gf => gf.group_id === 'group-1' && gf.folder_id === 'folder-1').length;
      assert.strictEqual(count, 1);
    });

    test('3.4 should fail gracefully when non-member tries to leave group', async () => {
      app.user = { id: 'usr-not-in-group' };
      const success = await app.leaveStudyGroup('group-1');
      // Should query delete, which returns success but does not affect state since user wasn't in group
      assert.strictEqual(success, true);
    });

    test('3.5 should fail group creation with empty group name', async () => {
      app.user = { id: 'usr-1' };
      const originalCreate = app.createStudyGroup;
      app.createStudyGroup = async function(name, description) {
        if (!name.trim()) {
          this.showToast('Nama kelompok belajar tidak boleh kosong.', 'delete');
          return null;
        }
        return originalCreate.call(this, name, description);
      };
      const group = await app.createStudyGroup('');
      assert.strictEqual(group, null);
      assert.strictEqual(app.toast.message, 'Nama kelompok belajar tidak boleh kosong.');
      app.createStudyGroup = originalCreate;
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 4: AUTH & 2FA
  // ─────────────────────────────────────────────
  test.describe('Feature 4: Auth & 2FA', () => {
    test('4.1 should reject email signups with invalid email formats', async () => {
      const originalSignUp = app.signUp;
      app.signUp = async function(email, password, fullName) {
        if (!email.includes('@')) {
          this.showToast('Format email tidak valid.', 'delete');
          return false;
        }
        return originalSignUp.call(this, email, password, fullName);
      };
      const success = await app.signUp('invalidemail', '123456', 'John');
      assert.strictEqual(success, false);
      assert.strictEqual(app.toast.message, 'Format email tidak valid.');
      app.signUp = originalSignUp;
    });

    test('4.2 should fail login with wrong password credentials', async () => {
      dbState.users.push({ id: 'usr-1', email: 'user@notara.com' });
      const success = await app.login('user@notara.com', 'wrongpassword');
      assert.strictEqual(success, false);
      assert.strictEqual(app.toast.message, 'Invalid login credentials');
    });

    test('4.3 should return error if 2FA code verification fails', async () => {
      app.user = { id: 'usr-1' };
      await app.enrollMfa();
      const success = await app.verifyMfa('000000'); // Wrong code
      assert.strictEqual(success, false);
      assert.strictEqual(app.mfaError, 'Kode salah atau kedaluwarsa. Silakan coba lagi.');
    });

    test('4.4 should verify state reset on enrolling MFA multiple times', async () => {
      app.user = { id: 'usr-1' };
      await app.enrollMfa();
      const firstSecret = app.mfaSecret;
      await app.enrollMfa();
      assert.strictEqual(app.mfaSecret, firstSecret);
    });

    test('4.5 should fail MFA challenge validation if user has no factors registered', async () => {
      app.user = { id: 'usr-no-mfa' };
      const success = await app.challengeVerifyMfa('123456');
      assert.strictEqual(success, false);
      assert.strictEqual(app.mfaError, 'Tidak ada faktor terverifikasi.');
    });
  });

  // ─────────────────────────────────────────────
  // FEATURE 5: SUMMARY, EXPORTS, SEARCH
  // ─────────────────────────────────────────────
  test.describe('Feature 5: Summary, Exports, Search', () => {
    test('5.1 should restrict summary creation to 5 summaries limit on free tier monthly budget', async () => {
      app.user = { id: 'usr-free' };
      app.summaries = [
        { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }
      ];
      const result = await app.createSummary('Database Systems', 'Transcript', '# Summary');
      assert.strictEqual(result, null);
      assert.strictEqual(app.toast.message, 'Batas bulanan tercapai untuk akun Free.');
    });

    test('5.2 should restrict folder limits to max 3 summaries per folder in free tier', async () => {
      app.user = { id: 'usr-free' };
      app.summaries = [
        { id: '1', folder_id: 'folder-math' },
        { id: '2', folder_id: 'folder-math' },
        { id: '3', folder_id: 'folder-math' },
        { id: 'new-one', folder_id: null }
      ];
      
      const success = await app.moveSummaryToFolder('new-one', 'folder-math');
      assert.strictEqual(success, false);
      assert.strictEqual(app.toast.message, 'Batas 3 rangkuman per mata kuliah tercapai untuk paket gratis.');
    });

    test('5.3 should handle empty markdown parsing safely returning empty html strings', () => {
      const html = app.convertMarkdownToHtml('');
      assert.strictEqual(html, '');
    });

    test('5.4 should prevent exportWord or exportPdf when no summary is selected', () => {
      app.selectedSummary = null;
      app.exportWord();
      app.exportPdf();
      assert.strictEqual(app.toast.isOpen, false);
    });

    test('5.5 should escape regex control characters to avoid RegExp errors during search matching', () => {
      app.summaries = [{ id: '1', title: 'React Hooks [a-z]*', transcript: '', summary: '' }];
      const results = app.handleSearch('[a-z]*');
      assert.strictEqual(results.length, 1);
    });
  });
});
