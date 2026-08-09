import packageJson from '../../../package.json';
import { createRuntimeHealthResponse } from '../../../lib/runtime/health';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    || 'local-development';

  return createRuntimeHealthResponse({
    version: packageJson.version,
    buildId,
  });
}
