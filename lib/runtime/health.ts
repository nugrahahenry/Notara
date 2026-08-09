export type RuntimeHealthPayload = {
  schemaVersion: 1;
  service: 'nalira-web';
  status: 'ok';
  version: string;
  buildId: string;
  servedAt: string;
};

export type RuntimeHealthOptions = {
  version: string;
  buildId?: string | null;
  now?: () => Date;
};

const UNKNOWN_IDENTITY = 'unknown';
const PRINTABLE_SINGLE_LINE = /^[\x20-\x7E]+$/;

function normalizeIdentity(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') return UNKNOWN_IDENTITY;

  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > maximumLength
    || !PRINTABLE_SINGLE_LINE.test(normalized)
  ) {
    return UNKNOWN_IDENTITY;
  }

  return normalized;
}

export function buildRuntimeHealth(options: RuntimeHealthOptions): RuntimeHealthPayload {
  const now = options.now ?? (() => new Date());

  return {
    schemaVersion: 1,
    service: 'nalira-web',
    status: 'ok',
    version: normalizeIdentity(options.version, 64),
    buildId: normalizeIdentity(options.buildId, 128),
    servedAt: now().toISOString(),
  };
}

export function createRuntimeHealthResponse(options: RuntimeHealthOptions): Response {
  return Response.json(buildRuntimeHealth(options), {
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}
