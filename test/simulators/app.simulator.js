// test/simulators/app.simulator.js
const { resetDb, dbState, mockSupabaseClient } = require('../mocks/supabase.mock');

// We will require the database operations from the compiled output
// The test runner will compile lib/db.ts to build/lib/db.js
let dbOps;
try {
  dbOps = require('../../build/lib/db');
} catch (e) {
  // Fallback in case not compiled yet
  dbOps = {};
}

class AppSimulator {
  constructor() {
    this.resetState();
  }

  resetState() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    if (global.activeSimulatorIntervals) {
      global.activeSimulatorIntervals.forEach(clearInterval);
      global.activeSimulatorIntervals = [];
    }
    resetDb();
    this.clearClientState();
  }

  clearClientState() {
    this.user = null;
    this.folders = [];
    this.summaries = [];
    this.selectedSummary = null;
    this.activeFolderId = 'all';
    this.studyGroups = [];
    this.activeGroupId = null;
    this.groupMembers = [];
    this.chatMessages = [];
    this.chatInput = '';
    this.isListening = false;
    this.isRecordingMode = false;
    this.recordingDuration = 0;
    this.audioBlob = null;
    this.audioUrl = null;
    this.isPaused = false;
    this.files = [];
    this.chosenSaveFolderId = 'null';
    this.loading = false;
    this.statusMessage = '';
    this.toast = { isOpen: false, message: '', type: '' };
    this.confirmModal = { isOpen: false, title: '', message: '', onConfirm: null, cancelText: 'Batal', confirmText: 'Ya' };
    this.showSearchModal = false;
    this.searchQuery = '';
    this.mfaEnabled = false;
    this.mfaFactors = [];
    this.showMfaModal = false;
    this.mfaFactorId = '';
    this.mfaQrCode = '';
    this.mfaSecret = '';
    this.mfaVerificationCode = '';
    this.showMfaChallengeBlock = false;
    this.mfaError = null;
    this.mfaSuccess = null;
    this.copied = false;
    this.shareCardFormat = 'feed';
    this.showShareCardModal = false;
    this.isGeneratingCard = false;
    this.showSharePopover = false;
    this.isDataLoading = false;
    this.studySeconds = 0;
    this.activeTab = 'summary';
    this.copiedShareLink = false;
    this.chatScope = 'global';
  }

  showToast(message, type = 'info') {
    this.toast = { isOpen: true, message, type };
  }

  triggerConfirm(title, message, onConfirm, confirmText = 'Ya', cancelText = 'Batal') {
    this.confirmModal = { isOpen: true, title, message, onConfirm, confirmText, cancelText };
  }

  // ─────────────────────────────────────────────
  // AUTH OPERATIONS
  // ─────────────────────────────────────────────
  async login(email, password) {
    this.loading = true;
    try {
      const { data, error } = await mockSupabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      this.user = data.user;
      await this.checkMfaStatus(this.user);
      this.showToast('Login berhasil!', 'success');
      await this.loadInitialData();
      return true;
    } catch (err) {
      this.showToast(err.message, 'delete');
      return false;
    } finally {
      this.loading = false;
    }
  }

  async signUp(email, password, fullName) {
    this.loading = true;
    try {
      const { data, error } = await mockSupabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      this.user = data.user;
      this.showToast('Pendaftaran berhasil!', 'success');
      return true;
    } catch (err) {
      this.showToast(err.message, 'delete');
      return false;
    } finally {
      this.loading = false;
    }
  }

  async googleLogin() {
    this.loading = true;
    try {
      const { data, error } = await mockSupabaseClient.auth.signInWithOAuth({ provider: 'google' });
      if (error) throw error;
      this.user = data.user;
      this.showToast('Login Google berhasil!', 'success');
      await this.loadInitialData();
      return true;
    } catch (err) {
      this.showToast(err.message, 'delete');
      return false;
    } finally {
      this.loading = false;
    }
  }

  async logout() {
    await mockSupabaseClient.auth.signOut();
    this.clearClientState();
    this.showToast('Berhasil keluar.', 'info');
  }

  // ─────────────────────────────────────────────
  // LOAD DATA
  // ─────────────────────────────────────────────
  async loadInitialData() {
    if (!this.user) return;
    this.isDataLoading = true;
    try {
      if (dbOps.getFolders) {
        this.folders = await dbOps.getFolders();
      }
      if (dbOps.getAllSummaries) {
        this.summaries = await dbOps.getAllSummaries();
      }
      if (dbOps.getStudyGroups) {
        this.studyGroups = await dbOps.getStudyGroups(this.user.id);
      }
    } catch (e) {
      console.error('Error loading initial data:', e);
    } finally {
      this.isDataLoading = false;
    }
  }

  // ─────────────────────────────────────────────
  // FOLDER CRUD
  // ─────────────────────────────────────────────
  async createFolder(name, icon = '📁', color = '#8B5CF6') {
    if (!this.user) return null;
    try {
      const newFolder = await dbOps.createFolder({ name, icon, color }, this.user.id);
      if (newFolder) {
        this.folders.push(newFolder);
        this.showToast(`Folder "${name}" berhasil dibuat.`, 'success');
        return newFolder;
      }
    } catch (e) {
      this.showToast('Gagal membuat folder.', 'delete');
    }
    return null;
  }

  async renameFolder(id, name) {
    try {
      const success = await dbOps.updateFolder(id, { name });
      if (success) {
        this.folders = this.folders.map(f => f.id === id ? { ...f, name } : f);
        this.showToast('Nama folder berhasil diubah.', 'success');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal mengubah nama folder.', 'delete');
    }
    return false;
  }

  async deleteFolder(id) {
    try {
      const success = await dbOps.deleteFolder(id);
      if (success) {
        this.folders = this.folders.filter(f => f.id !== id);
        // Summaries inside folder are now uncategorized (folder_id = null)
        this.summaries = this.summaries.map(s => s.folder_id === id ? { ...s, folder_id: null } : s);
        this.showToast('Folder berhasil dihapus.', 'success');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal menghapus folder.', 'delete');
    }
    return false;
  }

  // ─────────────────────────────────────────────
  // SUMMARY OPERATIONS
  // ─────────────────────────────────────────────
  async createSummary(title, transcript, summaryText, durationSec = null, fileName = null, folderId = null) {
    if (!this.user) return null;
    
    // Free Tier limits check
    const isFreeLimit = this.summaries.length >= 5;
    if (isFreeLimit) {
      this.showToast('Batas bulanan tercapai untuk akun Free.', 'delete');
      return null;
    }

    try {
      const input = {
        title,
        transcript,
        summary: summaryText,
        duration_sec: durationSec,
        file_name: fileName,
        folder_id: folderId === 'null' ? null : folderId,
        word_count: transcript.split(/\s+/).length,
        is_public: false,
        public_slug: null
      };
      const newSummary = await dbOps.createSummary(input, this.user.id);
      if (newSummary) {
        this.summaries.push(newSummary);
        this.selectedSummary = newSummary;
        this.showToast('Rangkuman baru berhasil dibuat.', 'success');
        return newSummary;
      }
    } catch (e) {
      console.error(e);
      this.showToast('Gagal membuat rangkuman.', 'delete');
    }
    return null;
  }

  async moveSummaryToFolder(summaryId, folderId) {
    const targetFolderId = folderId === 'null' ? null : folderId;
    
    // Limit check for free tier: max 3 per folder
    if (targetFolderId) {
      const count = this.summaries.filter(s => s.folder_id === targetFolderId).length;
      if (count >= 3) {
        this.showToast('Batas 3 rangkuman per mata kuliah tercapai untuk paket gratis.', 'delete');
        return false;
      }
    }

    try {
      const success = await dbOps.moveSummaryToFolder(summaryId, targetFolderId);
      if (success) {
        this.summaries = this.summaries.map(s => s.id === summaryId ? { ...s, folder_id: targetFolderId } : s);
        if (this.selectedSummary && this.selectedSummary.id === summaryId) {
          this.selectedSummary.folder_id = targetFolderId;
        }
        this.showToast('Rangkuman berhasil dipindahkan.', 'success');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal memindahkan rangkuman.', 'delete');
    }
    return false;
  }

  async renameSummary(summaryId, newTitle) {
    try {
      const success = await dbOps.renameSummary(summaryId, newTitle);
      if (success) {
        this.summaries = this.summaries.map(s => s.id === summaryId ? { ...s, title: newTitle } : s);
        if (this.selectedSummary && this.selectedSummary.id === summaryId) {
          this.selectedSummary.title = newTitle;
        }
        this.showToast('Judul rangkuman berhasil diubah.', 'success');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal mengubah nama rangkuman.', 'delete');
    }
    return false;
  }

  async deleteSummary(summaryId) {
    this.triggerConfirm(
      'Hapus Rangkuman',
      'Apakah Anda yakin ingin menghapus...',
      async () => {
        try {
          const success = await dbOps.deleteSummary(summaryId);
          if (success) {
            this.summaries = this.summaries.filter(s => s.id !== summaryId);
            if (this.selectedSummary && this.selectedSummary.id === summaryId) {
              this.selectedSummary = null;
            }
            this.showToast('Rangkuman berhasil dihapus secara permanen dari perpustakaan Anda 🗑️', 'delete');
            return true;
          }
        } catch (e) {
          this.showToast('Gagal menghapus rangkuman.', 'delete');
        }
        return false;
      }
    );
  }

  async toggleSummaryPublic(summaryId, isPublic) {
    try {
      const result = await dbOps.toggleSummaryPublic(summaryId, isPublic);
      if (result) {
        this.summaries = this.summaries.map(s => s.id === summaryId ? { ...s, ...result } : s);
        if (this.selectedSummary && this.selectedSummary.id === summaryId) {
          Object.assign(this.selectedSummary, result);
        }
        this.showToast(isPublic ? 'Link berbagi publik aktif!' : 'Rangkuman diubah menjadi privat.', 'success');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal mengubah status publik.', 'delete');
    }
    return false;
  }

  async forkSummary(slug) {
    if (!this.user) return null;
    try {
      const summaryToFork = await dbOps.getSummaryBySlug(slug);
      if (!summaryToFork) {
        this.showToast('Rangkuman tidak ditemukan.', 'delete');
        return null;
      }
      const forked = await dbOps.forkSummary(summaryToFork, this.user.id);
      if (forked) {
        this.summaries.push(forked);
        this.showToast('Rangkuman berhasil disalin ke perpustakaan Anda! 📁', 'success');
        return forked;
      }
    } catch (e) {
      this.showToast('Gagal menyalin rangkuman.', 'delete');
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // CHAT & CHATBOT
  // ─────────────────────────────────────────────
  async sendChatMessage(content) {
    if (!content.trim()) return;
    const userMsg = {
      id: 'msg-' + Math.random().toString(36).substring(2, 10),
      role: 'user',
      content,
      created_at: new Date().toISOString()
    };
    this.chatMessages.push(userMsg);
    this.chatInput = '';

    // Mock AI Streaming Response
    const aiMsg = {
      id: 'msg-' + Math.random().toString(36).substring(2, 10),
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString()
    };
    this.chatMessages.push(aiMsg);

    // Simulate response delay
    await new Promise(resolve => setTimeout(resolve, 30));
    aiMsg.content = `Tanggapan dari asisten AI berdasarkan konteks scope **${this.chatScope}** untuk pertanyaan: "${content}"`;
    this.showToast('Pesan AI diterima', 'success');
  }

  async clearChat() {
    if (this.selectedSummary) {
      await dbOps.clearChatMessages(this.selectedSummary.id);
      this.chatMessages = [];
      this.showToast('Riwayat percakapan dihapus.', 'info');
    }
  }

  setChatScope(scope) {
    this.chatScope = scope;
    this.showToast(`Ruang lingkup chat diubah ke: ${scope}`, 'info');
  }

  // ─────────────────────────────────────────────
  // VOICE INPUT / RECORDER
  // ─────────────────────────────────────────────
  async toggleMic() {
    if (this.isListening) {
      this.isListening = false;
      this.showToast('Mikrofon dimatikan.', 'info');
    } else {
      this.isListening = true;
      this.showToast('Mendengarkan...', 'success');
      // Simulate voice transcription appending
      setTimeout(() => {
        if (this.isListening) {
          this.chatInput = 'Halo selamat datang di Notara';
        }
      }, 50);
    }
  }

  startRecording() {
    this.isRecordingMode = true;
    this.isPaused = false;
    this.recordingDuration = 0;
    this.audioBlob = null;
    this.audioUrl = null;
    this.showToast('Mulai merekam suara live...', 'success');
    
    // Simulate recording time ticks
    this.recordingInterval = setInterval(() => {
      if (!this.isPaused) {
        this.recordingDuration += 1;
        // Limit checks: free accounts max 30 mins (1800s)
        if (this.recordingDuration >= 1800) {
          this.stopRecording();
          this.showToast('Batas waktu perekaman gratis 30 menit tercapai.', 'delete');
        }
      }
    }, 1000);
    
    global.activeSimulatorIntervals = global.activeSimulatorIntervals || [];
    global.activeSimulatorIntervals.push(this.recordingInterval);
  }

  pauseRecording() {
    this.isPaused = true;
    this.showToast('Perekaman dijeda.', 'info');
  }

  resumeRecording() {
    this.isPaused = false;
    this.showToast('Perekaman dilanjutkan.', 'info');
  }

  stopRecording() {
    clearInterval(this.recordingInterval);
    if (global.activeSimulatorIntervals) {
      global.activeSimulatorIntervals = global.activeSimulatorIntervals.filter(i => i !== this.recordingInterval);
    }
    this.isRecordingMode = false;
    this.isPaused = false;
    this.audioBlob = new Blob(['mock audio bits'], { type: 'audio/webm' });
    this.audioUrl = 'blob:http://localhost:3000/mock-audio';
    this.showToast('Perekaman selesai. Berkas audio di-cache.', 'success');
  }

  // ─────────────────────────────────────────────
  // MULTI-FILE QUEUE
  // ─────────────────────────────────────────────
  handleFileChange(newFiles) {
    const spaceLeft = 3 - this.files.length;
    const filesToAdd = Array.from(newFiles).slice(0, spaceLeft);
    this.files = [...this.files, ...filesToAdd];
    if (newFiles.length > spaceLeft) {
      this.showToast('Maksimal 3 file antrean diperbolehkan.', 'delete');
    }
  }

  removeFileFromQueue(index) {
    this.files = this.files.filter((_, i) => i !== index);
  }

  clearQueue() {
    this.files = [];
  }

  async submitQueue() {
    if (this.files.length === 0 && !this.audioBlob) return;
    this.loading = true;
    
    const total = this.files.length || 1;
    for (let i = 0; i < total; i++) {
      this.statusMessage = `Memproses berkas ${i + 1} dari ${total}...`;
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const title = this.files[i] ? this.files[i].name.split('.')[0] : 'Rekaman Suara';
      const folderId = this.chosenSaveFolderId === 'null' ? null : this.chosenSaveFolderId;
      await this.createSummary(title, 'Transkrip kuliah dummy', '# Rangkuman Kuliah\n\n- Poin utama 1\n- Poin utama 2', 60, title, folderId);
    }
    
    this.files = [];
    this.audioBlob = null;
    this.audioUrl = null;
    this.loading = false;
    this.showToast('Semua berkas berhasil diproses!', 'success');
  }

  // ─────────────────────────────────────────────
  // STUDY GROUP OPERATIONS
  // ─────────────────────────────────────────────
  async createStudyGroup(name, description = '') {
    if (!this.user) return null;
    try {
      const group = await dbOps.createStudyGroup(name, description, this.user.id);
      if (group) {
        this.studyGroups.push(group);
        this.showToast(`Kelompok "${name}" berhasil dibuat!`, 'success');
        return group;
      }
    } catch (e) {
      this.showToast('Gagal membuat kelompok.', 'delete');
    }
    return null;
  }

  async joinStudyGroup(inviteCode) {
    if (!this.user) return null;
    try {
      const group = await dbOps.joinStudyGroup(inviteCode, this.user.id);
      if (group) {
        // Only push if not already in list
        if (!this.studyGroups.some(g => g.id === group.id)) {
          this.studyGroups.push(group);
        }
        this.showToast(`Berhasil bergabung ke kelompok "${group.name}".`, 'success');
        return group;
      } else {
        this.showToast('Kode undangan tidak ditemukan.', 'delete');
        return null;
      }
    } catch (e) {
      this.showToast('Kode undangan tidak ditemukan.', 'delete');
    }
    return null;
  }

  async loadGroupMembers(groupId) {
    this.activeGroupId = groupId;
    try {
      this.groupMembers = await dbOps.getGroupMembers(groupId);
    } catch (e) {
      this.showToast('Gagal memuat anggota kelompok.', 'delete');
    }
  }

  async leaveStudyGroup(groupId) {
    if (!this.user) return false;
    try {
      const success = await dbOps.leaveStudyGroup(groupId, this.user.id);
      if (success) {
        this.studyGroups = this.studyGroups.filter(g => g.id !== groupId);
        if (this.activeGroupId === groupId) {
          this.activeGroupId = null;
          this.groupMembers = [];
        }
        this.showToast('Berhasil keluar dari kelompok.', 'info');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal keluar kelompok.', 'delete');
    }
    return false;
  }

  async shareFolderWithGroup(folderId, groupId) {
    try {
      const success = await dbOps.shareFolderWithGroup(folderId, groupId);
      if (success) {
        this.showToast('Folder berhasil dibagikan ke kelompok.', 'success');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal membagikan folder.', 'delete');
    }
    return false;
  }

  async unshareFolderFromGroup(folderId, groupId) {
    try {
      const success = await dbOps.unshareFolderFromGroup(folderId, groupId);
      if (success) {
        this.showToast('Folder dihentikan berbagi.', 'info');
        return true;
      }
    } catch (e) {
      this.showToast('Gagal menghentikan berbagi.', 'delete');
    }
    return false;
  }

  // ─────────────────────────────────────────────
  // 2FA TOTP SECURITY
  // ─────────────────────────────────────────────
  async checkMfaStatus(user) {
    try {
      const { data, error } = await mockSupabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      const { data: factorsData, error: factorsError } = await mockSupabaseClient.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      
      const activeFactors = factorsData.all.filter(f => f.status === 'verified');
      this.mfaEnabled = activeFactors.length > 0;
      this.mfaFactors = activeFactors;
      this.showMfaChallengeBlock = (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2');
    } catch (e) {
      console.error(e);
    }
  }

  async enrollMfa() {
    this.mfaError = null;
    this.mfaSuccess = null;
    try {
      const { data, error } = await mockSupabaseClient.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Notara',
        friendlyName: 'Notara Authenticator'
      });
      if (error) throw error;
      this.mfaFactorId = data.id;
      this.mfaQrCode = data.totp.qr_code;
      this.mfaSecret = data.totp.secret;
      return true;
    } catch (err) {
      this.mfaError = err.message;
      return false;
    }
  }

  async verifyMfa(code) {
    this.mfaError = null;
    this.mfaSuccess = null;
    try {
      const { data: challengeData, error: challengeError } = await mockSupabaseClient.auth.mfa.challenge({
        factorId: this.mfaFactorId
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await mockSupabaseClient.auth.mfa.verify({
        factorId: this.mfaFactorId,
        challengeId: challengeData.id,
        code
      });
      if (verifyError) throw verifyError;

      this.mfaSuccess = 'Keamanan Dua Faktor (2FA) berhasil diaktifkan!';
      this.showToast('2FA berhasil diaktifkan! 🔒', 'success');
      if (this.user) {
        await this.checkMfaStatus(this.user);
      }
      return true;
    } catch (err) {
      this.mfaError = err.message;
      return false;
    }
  }

  async disableMfa() {
    try {
      const { data: factorsData } = await mockSupabaseClient.auth.mfa.listFactors();
      const activeFactors = factorsData.all.filter(f => f.status === 'verified');
      for (const factor of activeFactors) {
        await mockSupabaseClient.auth.mfa.unenroll({ factorId: factor.id });
      }
      this.showToast('2FA telah dinonaktifkan.', 'info');
      this.mfaFactorId = '';
      this.mfaQrCode = '';
      this.mfaSecret = '';
      if (this.user) {
        await this.checkMfaStatus(this.user);
      }
      return true;
    } catch (e) {
      this.showToast('Gagal menonaktifkan 2FA.', 'delete');
      return false;
    }
  }

  async challengeVerifyMfa(code) {
    this.mfaError = null;
    try {
      const { data: factorsData } = await mockSupabaseClient.auth.mfa.listFactors();
      const verifiedFactor = factorsData.all.find(f => f.status === 'verified');
      if (!verifiedFactor) {
        throw new Error('Tidak ada faktor terverifikasi.');
      }
      const { data: challengeData } = await mockSupabaseClient.auth.mfa.challenge({
        factorId: verifiedFactor.id
      });
      const { error } = await mockSupabaseClient.auth.mfa.verify({
        factorId: verifiedFactor.id,
        challengeId: challengeData.id,
        code
      });
      if (error) throw error;
      
      this.showMfaChallengeBlock = false;
      this.showToast('Verifikasi 2FA berhasil! Selamat datang kembali.', 'success');
      return true;
    } catch (err) {
      this.mfaError = err.message;
      return false;
    }
  }

  // ─────────────────────────────────────────────
  // SEARCH / Ctrl+K
  // ─────────────────────────────────────────────
  triggerCtrlK() {
    this.showSearchModal = !this.showSearchModal;
  }

  handleSearch(query) {
    this.searchQuery = query.trim().toLowerCase();
    if (!this.searchQuery) return this.summaries;
    return this.summaries.filter(s => 
      s.title.toLowerCase().includes(this.searchQuery) ||
      s.transcript.toLowerCase().includes(this.searchQuery) ||
      s.summary.toLowerCase().includes(this.searchQuery)
    );
  }

  // ─────────────────────────────────────────────
  // SHARE CARD & EXPORTS
  // ─────────────────────────────────────────────
  async generateShareCard(format) {
    if (!this.selectedSummary) return false;
    this.isGeneratingCard = true;
    this.shareCardFormat = format;
    try {
      // Simulate loading html2canvas dynamic import
      const html2canvas = require('html2canvas');
      const canvasEl = global.document.createElement('canvas');
      const canvas = await html2canvas(canvasEl);
      
      const link = global.document.createElement('a');
      const safeTitle = this.selectedSummary.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 40).replace(/\s+/g, '_') || 'notara_card';
      link.download = `notara_${safeTitle}_${format}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      this.showToast('Kartu berhasil diunduh! 🎉 Siap dibagikan ke sosmed.', 'success');
      return true;
    } catch (e) {
      console.error(e);
      this.showToast('Gagal membuat kartu. Coba lagi.', 'delete');
      return false;
    } finally {
      this.isGeneratingCard = false;
    }
  }

  exportPdf() {
    if (!this.selectedSummary) return;
    const printArea = global.document.createElement('div');
    printArea.id = 'notara-print-area';
    
    // Simulate compilation markdown to HTML
    const compiledHtml = this.convertMarkdownToHtml(this.selectedSummary.summary);
    printArea.innerHTML = `<h1>${this.selectedSummary.title}</h1><div>${compiledHtml}</div>`;
    global.document.body.appendChild(printArea);
    
    global.window.print();
    global.document.body.removeChild(printArea);
    this.showToast('PDF berhasil diekspor!', 'success');
  }

  exportWord() {
    if (!this.selectedSummary) return;
    const compiledHtml = this.convertMarkdownToHtml(this.selectedSummary.summary);
    
    const fileContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>${this.selectedSummary.title}</title></head>
      <body>${compiledHtml}</body>
      </html>
    `;
    const blob = new Blob([fileContent], { type: 'application/msword' });
    const link = global.document.createElement('a');
    link.download = `${this.selectedSummary.title.replace(/\s+/g, '_')}.doc`;
    link.href = 'blob:url/' + Math.random();
    link.click();
    this.showToast('Word Doc berhasil diunduh!', 'success');
  }

  convertMarkdownToHtml(markdown) {
    if (!markdown) return '';
    // A simplified premium parser that matches Notara's regex logic
    let html = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // bold/italic/code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Headers
    html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    
    // HR
    html = html.replace(/^---$/gm, '<hr />');
    
    // Blockquotes
    html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');
    
    // Tables (Regex-based rough conversion for print verification)
    if (html.includes('|')) {
      const lines = html.split('\n');
      let insideTable = false;
      let tableHtml = '<table>';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
          if (!insideTable) {
            insideTable = true;
          }
          if (line.includes('---')) continue; // Skip separator line
          const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
          tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        } else if (insideTable) {
          tableHtml += '</table>';
          insideTable = false;
          lines[i] = tableHtml + '\n' + lines[i];
        }
      }
      html = lines.join('\n');
    }

    return html;
  }

  // Tick the focus time active track
  focusActiveTimerTick() {
    this.studySeconds += 1;
    if (this.selectedSummary) {
      const key = `fokus_aktif_${this.selectedSummary.id}`;
      global.localStorage.setItem(key, this.studySeconds);
    }
  }
}

module.exports = {
  AppSimulator
};
