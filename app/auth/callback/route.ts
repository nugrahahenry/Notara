import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import {
  getRequestBaseUrl,
  sanitizeAuthDestination,
} from '@/lib/auth/redirect';

function redirectToLogin(baseUrl: string, reason: string) {
  const loginUrl = new URL('/login', baseUrl);
  loginUrl.searchParams.set('error', reason);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const baseUrl = getRequestBaseUrl(request);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorCode = requestUrl.searchParams.get('error_code');
  const destination = sanitizeAuthDestination(requestUrl.searchParams.get('next'));

  if (error === 'access_denied') {
    const cancelledUrl = new URL('/login', baseUrl);
    cancelledUrl.searchParams.set('cancelled', '1');
    return NextResponse.redirect(cancelledUrl);
  }

  if (errorCode === 'flow_state_already_used' || error === 'invalid_request') {
    return redirectToLogin(baseUrl, 'session-expired');
  }

  if (error) return redirectToLogin(baseUrl, 'oauth-error');
  if (!code) return redirectToLogin(baseUrl, 'auth-code-exchange-failed');

  try {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      return NextResponse.redirect(new URL(destination, baseUrl));
    }

    const errorMessage = exchangeError.message?.toLowerCase() ?? '';
    if (
      errorMessage.includes('flow_state')
      || errorMessage.includes('already been used')
      || errorMessage.includes('expired')
    ) {
      return redirectToLogin(baseUrl, 'session-expired');
    }

    return redirectToLogin(baseUrl, 'auth-code-exchange-failed');
  } catch {
    return redirectToLogin(baseUrl, 'auth-code-exchange-failed');
  }
}
