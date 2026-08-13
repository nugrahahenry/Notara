export interface SpeechRecognitionEventLike extends Event {
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start(): void;
  stop(): void;
}

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

export interface MidtransSnapCallbacks {
  onSuccess?: () => void | Promise<void>;
  onPending?: () => void | Promise<void>;
  onError?: () => void | Promise<void>;
  onClose?: () => void;
}

export interface MidtransSnap {
  pay(token: string, callbacks: MidtransSnapCallbacks): void;
}

export type BrowserWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  snap?: MidtransSnap;
};
