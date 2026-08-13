const CALLBACK_ERRORS: Readonly<Record<string, string>> = {
  'auth-code-exchange-failed': 'Gagal memproses sesi dari Google. Silakan coba lagi.',
  'oauth-error': 'Terjadi kesalahan saat login dengan Google. Silakan coba lagi.',
  'session-expired': 'Sesi login kedaluwarsa atau sudah pernah digunakan. Silakan coba masuk kembali.',
};

export function getAuthCallbackError(code: string | null | undefined): string | null {
  return code ? CALLBACK_ERRORS[code] ?? null : null;
}

function translateAuthMessage(message: string): string {
  const cleanMessage = message.toLowerCase();

  if (cleanMessage.includes('password should be at least 6 characters')) {
    return 'Kata sandi terlalu pendek. Minimal harus 6 karakter.';
  }
  if (cleanMessage.includes('invalid email') || cleanMessage.includes('is invalid')) {
    return 'Format email tidak valid. Silakan periksa kembali penulisan email Anda.';
  }
  if (cleanMessage.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah. Silakan periksa kembali. Jika baru mendaftar, pastikan Anda sudah verifikasi email terlebih dahulu.';
  }
  if (cleanMessage.includes('email not confirmed')) {
    return 'Email Anda belum terverifikasi. Silakan cek kotak masuk email dan klik link verifikasi sebelum masuk.';
  }
  if (cleanMessage.includes('user already registered')) {
    return 'Email ini sudah terdaftar. Silakan masuk menggunakan email ini.';
  }
  if (cleanMessage.includes('signup requires a valid email')) {
    return 'Pendaftaran memerlukan email yang valid.';
  }
  if (cleanMessage.includes('flow_state') || cleanMessage.includes('state has already been used')) {
    return 'Sesi login sebelumnya kedaluwarsa. Silakan coba masuk lagi.';
  }
  if (cleanMessage.includes('rate limit') || cleanMessage.includes('too many requests')) {
    return 'Terlalu banyak percobaan login. Silakan tunggu beberapa menit sebelum mencoba lagi.';
  }

  return message;
}

export function getFriendlyAuthErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }

  return translateAuthMessage(error.message);
}
