export interface CaptureUploadProgress {
  completedBytes: number;
  totalBytes: number;
}

export interface CaptureRequestOptions {
  body?: Document | XMLHttpRequestBodyInit | null;
  headers?: Record<string, string>;
  onUploadProgress?: (progress: CaptureUploadProgress) => void;
  onUploadComplete?: () => void;
  xhrFactory?: () => XMLHttpRequest;
}

export class CapturePipelineError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    code: string;
    message: string;
    status?: number;
    retryable: boolean;
    retryAfterSeconds?: number;
  }) {
    super(options.message);
    this.name = 'CapturePipelineError';
    this.code = options.code;
    this.status = options.status ?? 0;
    this.retryable = options.retryable;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

const DEFAULT_RATE_LIMIT_RETRY_SECONDS = 10;
const MAX_RATE_LIMIT_RETRY_SECONDS = 10 * 60;

function parseRetryAfterSeconds(value: string | null | undefined): number | undefined {
  if (!value?.trim()) return undefined;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;

  return Math.min(Math.ceil(seconds), MAX_RATE_LIMIT_RETRY_SECONDS);
}

function getResponseMessage(responseText: string, fallback: string): string {
  if (!responseText) return fallback;

  try {
    const payload = JSON.parse(responseText) as { error?: unknown };
    return typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : fallback;
  } catch {
    return fallback;
  }
}

export function createCaptureHttpError(
  status: number,
  responseText = '',
  retryAfterHeader?: string | null,
): CapturePipelineError {
  const fallback = status === 0
    ? 'Koneksi ke Nalira terputus.'
    : 'Nalira belum dapat memproses file ini.';
  const message = getResponseMessage(responseText, fallback);
  const normalizedMessage = message.toLowerCase();

  if (
    status === 400 &&
    (normalizedMessage.includes('sunyi') || normalizedMessage.includes('transkrip kosong'))
  ) {
    return new CapturePipelineError({
      code: 'audio-empty',
      message,
      status,
      retryable: false,
    });
  }

  if (status === 413) {
    return new CapturePipelineError({
      code: 'file-too-large',
      message,
      status,
      retryable: false,
    });
  }

  if (status === 415) {
    return new CapturePipelineError({
      code: 'unsupported-media',
      message,
      status,
      retryable: false,
    });
  }

  if (status === 429) {
    return new CapturePipelineError({
      code: 'rate-limited',
      message,
      status,
      retryable: true,
      retryAfterSeconds: parseRetryAfterSeconds(retryAfterHeader),
    });
  }

  if (status === 0) {
    return new CapturePipelineError({
      code: 'network',
      message,
      status,
      retryable: true,
    });
  }

  return new CapturePipelineError({
    code: status >= 500 ? 'server' : 'request-rejected',
    message,
    status,
    retryable: status === 408 || status >= 500,
  });
}

export function toCapturePipelineError(
  error: unknown,
  fallbackMessage: string,
): CapturePipelineError {
  if (error instanceof CapturePipelineError) return error;

  return new CapturePipelineError({
    code: 'capture-failed',
    message: error instanceof Error && error.message ? error.message : fallbackMessage,
    retryable: false,
  });
}

export function requestCaptureJson<TResponse>(
  url: string,
  options: CaptureRequestOptions = {},
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const xhr = options.xhrFactory?.() ?? new XMLHttpRequest();
    xhr.open('POST', url, true);

    Object.entries(options.headers ?? {}).forEach(([name, value]) => {
      xhr.setRequestHeader(name, value);
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onUploadProgress?.({
        completedBytes: event.loaded,
        totalBytes: event.total,
      });
    };
    xhr.upload.onload = () => options.onUploadComplete?.();

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(createCaptureHttpError(
          xhr.status,
          xhr.responseText,
          xhr.getResponseHeader('Retry-After'),
        ));
        return;
      }

      try {
        resolve(JSON.parse(xhr.responseText) as TResponse);
      } catch {
        reject(new CapturePipelineError({
          code: 'invalid-response',
          message: 'Nalira menerima respons yang tidak dapat dibaca.',
          status: xhr.status,
          retryable: true,
        }));
      }
    };

    xhr.onerror = () => reject(createCaptureHttpError(0));
    xhr.onabort = () => reject(new CapturePipelineError({
      code: 'cancelled',
      message: 'Pemrosesan dibatalkan.',
      retryable: true,
    }));

    xhr.send(options.body ?? null);
  });
}

export interface CaptureRateLimitRetryNotice {
  attempt: number;
  retryAfterSeconds: number;
}

export interface CaptureRateLimitRetryOptions {
  maxRateLimitRetries?: number;
  wait?: (milliseconds: number) => Promise<void>;
  onRateLimited?: (notice: CaptureRateLimitRetryNotice) => void;
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function requestCaptureJsonWithRateLimitRetry<TResponse>(
  url: string,
  options: CaptureRequestOptions = {},
  retryOptions: CaptureRateLimitRetryOptions = {},
): Promise<TResponse> {
  const maxRateLimitRetries = Math.max(
    0,
    Math.min(Math.floor(retryOptions.maxRateLimitRetries ?? 2), 3),
  );
  const wait = retryOptions.wait ?? defaultWait;
  let retryCount = 0;

  while (true) {
    try {
      return await requestCaptureJson<TResponse>(url, options);
    } catch (error) {
      if (
        !(error instanceof CapturePipelineError) ||
        error.code !== 'rate-limited' ||
        retryCount >= maxRateLimitRetries
      ) {
        throw error;
      }

      retryCount += 1;
      const retryAfterSeconds = error.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_RETRY_SECONDS;
      retryOptions.onRateLimited?.({
        attempt: retryCount,
        retryAfterSeconds,
      });
      await wait(retryAfterSeconds * 1000);
    }
  }
}
