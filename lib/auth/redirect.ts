export const DEFAULT_AUTH_DESTINATION = '/dashboard';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PUBLIC_SUMMARY_PATH = /^\/s\/[A-Za-z0-9_-]{1,128}$/;
const PUBLIC_OPERATIONAL_ROUTES = new Set(['/api/health', '/api/version']);

export function isPublicOperationalRoute(pathname: string): boolean {
  return PUBLIC_OPERATIONAL_ROUTES.has(pathname);
}

export function isApiRequestPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function sanitizeAuthDestination(value: string | null | undefined): string {
  if (!value) return DEFAULT_AUTH_DESTINATION;

  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return DEFAULT_AUTH_DESTINATION;
  }

  try {
    const parsed = new URL(candidate, 'https://notara.local');
    if (parsed.origin !== 'https://notara.local') return DEFAULT_AUTH_DESTINATION;
    const isDashboard = parsed.pathname.startsWith('/dashboard');
    const isPublicSummary = PUBLIC_SUMMARY_PATH.test(parsed.pathname);
    if (!isDashboard && !isPublicSummary) return DEFAULT_AUTH_DESTINATION;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_DESTINATION;
  }
}

export function buildLoginPath(destination: string | null | undefined): string {
  return `/login?redirect=${encodeURIComponent(sanitizeAuthDestination(destination))}`;
}

export function buildAuthCallbackUrl(
  origin: string,
  destination: string | null | undefined,
): string {
  const callbackUrl = new URL('/auth/callback', origin);
  callbackUrl.searchParams.set('next', sanitizeAuthDestination(destination));
  return callbackUrl.toString();
}

export function resolveAuthOrigin(browserOrigin: string, configuredSiteUrl?: string): string {
  const browserUrl = new URL(browserOrigin);
  if (LOCAL_HOSTS.has(browserUrl.hostname)) return browserUrl.origin;

  if (configuredSiteUrl) {
    try {
      const configuredUrl = new URL(configuredSiteUrl);
      if (configuredUrl.protocol === 'https:' || configuredUrl.protocol === 'http:') {
        return configuredUrl.origin;
      }
    } catch {
      // Fall back to the browser origin when configuration is invalid.
    }
  }

  return browserUrl.origin;
}

export function getRequestBaseUrl(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  if (!forwardedHost) return requestUrl.origin;

  const protocol = forwardedProto === 'http' || forwardedProto === 'https'
    ? forwardedProto
    : requestUrl.protocol.replace(':', '');

  return `${protocol}://${forwardedHost}`;
}

export function buildOAuthRecoveryUrl(requestUrl: URL): URL | null {
  if (requestUrl.pathname !== '/') return null;

  const allowedKeys = ['code', 'error', 'error_code', 'error_description'];
  const hasAuthResult = allowedKeys.some((key) => requestUrl.searchParams.has(key));
  if (!hasAuthResult) return null;

  const callbackUrl = new URL('/auth/callback', requestUrl.origin);
  for (const key of allowedKeys) {
    const value = requestUrl.searchParams.get(key);
    if (value) callbackUrl.searchParams.set(key, value);
  }
  callbackUrl.searchParams.set('next', DEFAULT_AUTH_DESTINATION);
  return callbackUrl;
}
