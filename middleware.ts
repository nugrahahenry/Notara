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

  // IMPORTANT: Menjalankan getUser() untuk melakukan sinkronisasi session cookie
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();

  // Jika user belum login, redirect ke /login (kecuali dia sudah di /login atau di /auth/*)
  if (!user) {
    if (url.pathname !== '/login' && !url.pathname.startsWith('/auth/')) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  // Jika user sudah login dan mencoba mengakses /login, redirect ke halaman utama "/"
  if (user && url.pathname === '/login') {
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Cocokkan semua path request kecuali yang dimulai dengan:
     * - _next/static (file statis Next.js)
     * - _next/image (optimasi gambar Next.js)
     * - favicon.ico (file favicon)
     * - File gambar statis (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
