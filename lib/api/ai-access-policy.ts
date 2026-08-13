export type AiOperation = 'capture' | 'summarize' | 'chat';

type AuthLookupResult = {
  data: { user: { id: string } | null };
  error: unknown;
};

type RateLimitLookupResult = {
  data: unknown;
  error: unknown;
};

export type AiAccessAllowed = {
  ok: true;
  userId: string;
  bypassed: boolean;
  limit?: number;
  remaining?: number;
};

export type AiAccessDenied = {
  ok: false;
  status: 401 | 429 | 503;
  code: 'unauthorized' | 'rate-limited' | 'rate-limit-unavailable';
  error: string;
  retryAfterSeconds?: number;
};

export type AiAccessDecision = AiAccessAllowed | AiAccessDenied;

export type AiAccessContext = {
  nodeEnv: string | undefined;
  bypassEnabled: boolean;
  getUser: () => Promise<AuthLookupResult>;
  consumeRateLimit: (operation: AiOperation) => Promise<RateLimitLookupResult>;
};

type RateLimitRow = {
  allowed: boolean;
  request_limit: number;
  remaining: number;
  retry_after_seconds: number;
};

const UNAUTHORIZED: AiAccessDenied = {
  ok: false,
  status: 401,
  code: 'unauthorized',
  error: 'Sesi tidak valid. Silakan login kembali.',
};

const LIMITER_UNAVAILABLE: AiAccessDenied = {
  ok: false,
  status: 503,
  code: 'rate-limit-unavailable',
  error: 'Layanan pembatas penggunaan sedang tidak tersedia.',
};

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseRateLimitRow(value: unknown): RateLimitRow | null {
  if (!Array.isArray(value) || value.length !== 1) {
    return null;
  }

  const row = value[0];
  if (typeof row !== 'object' || row === null) {
    return null;
  }

  const allowed = Reflect.get(row, 'allowed');
  const requestLimit = Reflect.get(row, 'request_limit');
  const remaining = Reflect.get(row, 'remaining');
  const retryAfterSeconds = Reflect.get(row, 'retry_after_seconds');

  if (
    typeof allowed !== 'boolean'
    || !isNonNegativeInteger(requestLimit)
    || !isNonNegativeInteger(remaining)
    || !isNonNegativeInteger(retryAfterSeconds)
  ) {
    return null;
  }

  return {
    allowed,
    request_limit: requestLimit,
    remaining,
    retry_after_seconds: retryAfterSeconds,
  };
}

export async function evaluateAiAccess(
  operation: AiOperation,
  context: AiAccessContext,
): Promise<AiAccessDecision> {
  if (context.nodeEnv === 'development' && context.bypassEnabled) {
    return {
      ok: true,
      userId: 'development-bypass',
      bypassed: true,
    };
  }

  let authResult: AuthLookupResult;
  try {
    authResult = await context.getUser();
  } catch {
    return UNAUTHORIZED;
  }

  if (authResult.error || !authResult.data.user?.id) {
    return UNAUTHORIZED;
  }

  let quotaResult: RateLimitLookupResult;
  try {
    quotaResult = await context.consumeRateLimit(operation);
  } catch {
    return LIMITER_UNAVAILABLE;
  }

  if (quotaResult.error) {
    return LIMITER_UNAVAILABLE;
  }

  const quota = parseRateLimitRow(quotaResult.data);
  if (!quota) {
    return LIMITER_UNAVAILABLE;
  }

  if (!quota.allowed) {
    return {
      ok: false,
      status: 429,
      code: 'rate-limited',
      error: 'Terlalu banyak permintaan. Coba lagi sebentar.',
      retryAfterSeconds: Math.max(quota.retry_after_seconds, 1),
    };
  }

  return {
    ok: true,
    userId: authResult.data.user.id,
    bypassed: false,
    limit: quota.request_limit,
    remaining: quota.remaining,
  };
}

export function createAiAccessErrorResponse(decision: AiAccessDenied): Response {
  const body: Record<string, string | number> = {
    code: decision.code,
    error: decision.error,
  };
  const headers = new Headers();

  if (decision.retryAfterSeconds !== undefined) {
    body.retryAfterSeconds = decision.retryAfterSeconds;
    headers.set('Retry-After', String(decision.retryAfterSeconds));
  }

  return Response.json(body, {
    status: decision.status,
    headers,
  });
}
