import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');           // e.g. 'access_denied' when user cancels
  const errorCode = searchParams.get('error_code');  // e.g. 'flow_state_already_used'
  const next = searchParams.get('next') ?? '/dashboard';

  // ── 1. User explicitly clicked "Cancel" / "Batal" on Google's screen ──────
  if (error === 'access_denied') {
    // Go back to login with cancelled flag — middleware allows staying on /login
    return NextResponse.redirect(`${origin}/login?cancelled=1`);
  }

  // ── 1b. flow_state_already_used — code was used before (double-redirect) ──
  if (errorCode === 'flow_state_already_used' || error === 'invalid_request') {
    return NextResponse.redirect(`${origin}/login?error=session-expired`);
  }

  // ── 2. Any other OAuth error before we get a code ─────────────────────────
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth-error`);
  }

  // ── 3. Happy path: exchange the authorization code for a session ───────────
  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      const baseUrl = isLocalEnv
        ? origin
        : forwardedHost
          ? `https://${forwardedHost}`
          : origin;

      // Redirect to dashboard — login page already set sessionStorage flag
      return NextResponse.redirect(`${baseUrl}${next}`);
    }

    // ── 3b. Code exchange failed (e.g. flow_state_already_used / expired) ──
    const errMsg = exchangeError.message?.toLowerCase() ?? '';
    if (errMsg.includes('flow_state') || errMsg.includes('already been used') || errMsg.includes('expired')) {
      return NextResponse.redirect(`${origin}/login?error=session-expired`);
    }

    return NextResponse.redirect(`${origin}/login?error=auth-code-exchange-failed`);
  }

  // ── 4. Fallback: code missing ───────────────────────────────────────────────
  return NextResponse.redirect(`${origin}/login?error=auth-code-exchange-failed`);
}
