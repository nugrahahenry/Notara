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

  constructor(options: {
    code: string;
    message: string;
    status?: number;
    retryable: boolean;
  }) {
    super(options.message);
    this.name = 'CapturePipelineError';
    this.code = options.code;
    this.status = options.status ?? 0;
    this.retryable = options.retryable;
  }
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

export function createCaptureHttpError(status: number, responseText = ''): CapturePipelineError {
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
        reject(createCaptureHttpError(xhr.status, xhr.responseText));
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
