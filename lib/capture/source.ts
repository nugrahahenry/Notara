export type RecordingSourceKind = 'microphone' | 'browser-tab';

export type RecordingSourceCheckStatus =
  | 'idle'
  | 'requesting'
  | 'checking'
  | 'ready'
  | 'silent';

export type RecordingSourceErrorCode =
  | 'permission-denied'
  | 'source-not-found'
  | 'display-capture-unsupported'
  | 'wrong-display-surface'
  | 'tab-audio-missing'
  | 'source-ended'
  | 'recorder-unsupported'
  | 'unknown';

export interface BrowserTabCaptureSnapshot {
  audioTrackCount: number;
  displaySurface?: string;
}

export interface RecordingSourceErrorPresentation {
  code: RecordingSourceErrorCode;
  message: string;
}

export interface BrowserTabDisplayMediaOptions extends DisplayMediaStreamOptions {
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
  preferCurrentTab?: boolean;
}

export const RECORDING_SOURCE_TEST_SECONDS = 10;

export function isRecordingSourceCheckBusy(
  status: RecordingSourceCheckStatus,
): boolean {
  return status === 'requesting' || status === 'checking';
}

export function getMicrophoneCaptureConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };
}

export function getBrowserTabCaptureOptions(): BrowserTabDisplayMediaOptions {
  return {
    audio: true,
    video: true,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
    systemAudio: 'exclude',
    preferCurrentTab: false,
  };
}

export function validateBrowserTabCapture(
  snapshot: BrowserTabCaptureSnapshot,
): RecordingSourceErrorCode | null {
  if (
    snapshot.displaySurface !== undefined &&
    snapshot.displaySurface !== 'browser'
  ) {
    return 'wrong-display-surface';
  }

  if (snapshot.audioTrackCount < 1) {
    return 'tab-audio-missing';
  }

  return null;
}

export function getRecordingSourceErrorPresentation(
  error: unknown,
  source: RecordingSourceKind,
): RecordingSourceErrorPresentation {
  if (error instanceof RecordingSourceCaptureError) {
    return {
      code: error.code,
      message: getRecordingSourceErrorMessage(error.code, source),
    };
  }

  const name = error instanceof DOMException
    ? error.name
    : error && typeof error === 'object' && 'name' in error
      ? String(error.name)
      : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      code: 'permission-denied',
      message: getRecordingSourceErrorMessage('permission-denied', source),
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'source-not-found',
      message: getRecordingSourceErrorMessage('source-not-found', source),
    };
  }

  return {
    code: 'unknown',
    message: getRecordingSourceErrorMessage('unknown', source),
  };
}

export function getRecordingSourceErrorMessage(
  code: RecordingSourceErrorCode,
  source: RecordingSourceKind,
): string {
  switch (code) {
    case 'permission-denied':
      return source === 'browser-tab'
        ? 'Pemilihan tab dibatalkan atau izinnya ditolak. Coba lagi lalu pilih tab Zoom/Meet.'
        : 'Izin mikrofon dibatalkan atau ditolak. Izinkan mikrofon dari pengaturan situs lalu coba lagi.';
    case 'source-not-found':
      return source === 'browser-tab'
        ? 'Chrome tidak menemukan tab yang dapat dibagikan. Pastikan Zoom/Meet terbuka di tab lain.'
        : 'Mikrofon tidak ditemukan. Sambungkan perangkat audio lalu coba lagi.';
    case 'display-capture-unsupported':
      return 'Browser ini belum mendukung rekaman audio tab. Buka Nalira menggunakan Chrome terbaru.';
    case 'wrong-display-surface':
      return 'Pilih tab Chrome, bukan jendela atau seluruh layar, agar Nalira hanya menerima audio kelas online.';
    case 'tab-audio-missing':
      return 'Tab terpilih tidak membagikan audio. Coba lagi dan aktifkan “Bagikan juga audio tab”.';
    case 'source-ended':
      return source === 'browser-tab'
        ? 'Berbagi tab dihentikan dari Chrome. Hubungkan kembali tab sebelum merekam.'
        : 'Mikrofon terputus. Sambungkan kembali perangkat lalu coba lagi.';
    case 'recorder-unsupported':
      return 'Format rekaman audio tidak didukung browser ini. Buka Nalira menggunakan Chrome terbaru.';
    default:
      return source === 'browser-tab'
        ? 'Nalira belum dapat menghubungkan audio tab. Pastikan tab masih aktif lalu coba lagi.'
        : 'Nalira belum dapat menghubungkan mikrofon. Periksa perangkat dan izin situs lalu coba lagi.';
  }
}

export class RecordingSourceCaptureError extends Error {
  constructor(
    public readonly code: RecordingSourceErrorCode,
  ) {
    super(code);
    this.name = 'RecordingSourceCaptureError';
  }
}

const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

export function getPreferredRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  return RECORDER_MIME_TYPES.find(isTypeSupported) ?? null;
}

export function getRecordingSourceFileStem(source: RecordingSourceKind): string {
  return source === 'browser-tab' ? 'rekaman-kelas-online' : 'rekaman-kelas';
}

export function getRecordingFileExtension(mimeType: string): 'ogg' | 'webm' {
  return mimeType.toLowerCase().includes('ogg') ? 'ogg' : 'webm';
}
