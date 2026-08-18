export type BoundedJsonBodyErrorCode = 'body-too-large' | 'invalid-json';

export class BoundedJsonBodyError extends Error {
  readonly code: BoundedJsonBodyErrorCode;

  constructor(code: BoundedJsonBodyErrorCode) {
    super(code === 'body-too-large' ? 'Request body is too large.' : 'Request body is invalid.');
    this.name = 'BoundedJsonBodyError';
    this.code = code;
  }
}

interface BoundedBodyRequest {
  headers: Pick<Headers, 'get'>;
  body: ReadableStream<Uint8Array> | null;
}

export async function readBoundedJsonBody<T = unknown>(
  request: BoundedBodyRequest,
  maxBytes: number,
): Promise<T> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new BoundedJsonBodyError('invalid-json');
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      throw new BoundedJsonBodyError('invalid-json');
    }
    if (declaredBytes > maxBytes) {
      throw new BoundedJsonBodyError('body-too-large');
    }
  }

  if (!request.body) {
    throw new BoundedJsonBodyError('invalid-json');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new BoundedJsonBodyError('body-too-large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body);
    return JSON.parse(decoded) as T;
  } catch (error) {
    if (error instanceof BoundedJsonBodyError) throw error;
    throw new BoundedJsonBodyError('invalid-json');
  }
}
