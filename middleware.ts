import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() wajib dipanggil untuk menyinkronkan session cookie
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const isLandingPage = url.pathname === '/';
  const isLoginPage = url.pathname === '/login';
  const isAuthRoute = url.pathname.startsWith('/auth/');
  const isPublicShareRoute = url.pathname.startsWith('/s/');
  const isDashboardRoute = url.pathname.startsWith('/dashboard');

  // Rute publik yang boleh diakses tanpa login: /, /login, /auth/*, /s/*
  const isPublicRoute = isLandingPage || isLoginPage || isAuthRoute || isPublicShareRoute;

  // Jika user belum login dan mencoba mengakses rute terproteksi (e.g., /dashboard),
  // redirect ke /login
  if (!user) {
    if (!isPublicRoute) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  // Jika user sudah login:
  if (user) {
    // Redirect dari landing page (/) atau login page (/login) ke dashboard
    if (isLandingPage || isLoginPage) {
      const hasError = url.searchParams.has('error');
      const hasCancelled = url.searchParams.has('cancelled');

      // PENGECUALIAN: jika ada error atau cancelled query param (user baru klik Batal),
      // biarkan mereka tetap di /login agar bisa lihat pesannya
      if (isLoginPage && (hasError || hasCancelled)) {
        // Jangan redirect — biarkan di /login
      } else {
        // Normal case: sudah login, arahkan ke dashboard
        url.pathname = '/dashboard';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Cocokkan semua path kecuali:
     * - _next/static (file statis Next.js)
     * - _next/image  (optimasi gambar Next.js)
     * - favicon.ico
     * - File gambar statis (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
