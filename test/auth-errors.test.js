const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAuthCallbackError,
  getFriendlyAuthErrorMessage,
} = require('../build/lib/auth/errors.js');

test('auth callback errors map to clear recovery messages', () => {
  assert.equal(
    getAuthCallbackError('auth-code-exchange-failed'),
    'Gagal memproses sesi dari Google. Silakan coba lagi.',
  );
  assert.equal(
    getAuthCallbackError('oauth-error'),
    'Terjadi kesalahan saat login dengan Google. Silakan coba lagi.',
  );
  assert.equal(
    getAuthCallbackError('session-expired'),
    'Sesi login kedaluwarsa atau sudah pernah digunakan. Silakan coba masuk kembali.',
  );
  assert.equal(getAuthCallbackError('cancelled'), null);
  assert.equal(getAuthCallbackError(null), null);
});

test('auth provider errors are translated without trusting unknown caught values', () => {
  assert.equal(
    getFriendlyAuthErrorMessage(new Error('Invalid login credentials'), 'Fallback'),
    'Email atau kata sandi salah. Silakan periksa kembali. Jika baru mendaftar, pastikan Anda sudah verifikasi email terlebih dahulu.',
  );
  assert.equal(
    getFriendlyAuthErrorMessage({ message: 'raw provider object' }, 'Fallback'),
    'Fallback',
  );
  assert.equal(
    getFriendlyAuthErrorMessage('raw provider string', 'Fallback'),
    'Fallback',
  );
});
