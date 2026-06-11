import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');           // e.g. 'access_denied' when user cancels
  const next = searchParams.get('next') ?? '/';

  // ── 1. User explicitly clicked "Cancel" / "Batal" on Google's screen ──────
  if (error === 'access_denied') {
    // Go back to login with cancelled flag — middleware allows staying on /login
    return NextResponse.redirect(`${origin}/login?cancelled=1`);
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
  }

  // ── 4. Fallback: code missing or exchange failed ───────────────────────────
  return NextResponse.redirect(`${origin}/login?error=auth-code-exchange-failed`);
}
