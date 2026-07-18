import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────
// /api/version — Returns the current build ID for update detection
//
// Vercel auto-injects NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA at build time.
// Clients compare their stored buildId against this to detect new deployments.
// ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  // In Vercel production: VERCEL_GIT_COMMIT_SHA is the full commit hash
  // In local dev: falls back to a timestamp so it always matches
  const buildId =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    `dev-${process.env.NODE_ENV}`;

  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.06';

  return NextResponse.json(
    { buildId, version },
    {
      headers: {
        // No caching — always return fresh build info
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    }
  );
}
