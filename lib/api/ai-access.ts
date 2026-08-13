import { createClient } from '@/lib/supabase-server';
import {
  createAiAccessErrorResponse,
  evaluateAiAccess,
  type AiOperation,
} from '@/lib/api/ai-access-policy';

export type AiAuthorizationResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export async function authorizeAiRequest(
  operation: AiOperation,
): Promise<AiAuthorizationResult> {
  let clientPromise: ReturnType<typeof createClient> | null = null;
  const getClient = () => {
    clientPromise ??= createClient();
    return clientPromise;
  };

  const decision = await evaluateAiAccess(operation, {
    nodeEnv: process.env.NODE_ENV,
    bypassEnabled: process.env.NOTARA_DEV_BYPASS_AUTH === 'true',
    getUser: async () => {
      const supabase = await getClient();
      return supabase.auth.getUser();
    },
    consumeRateLimit: async (requestedOperation) => {
      const supabase = await getClient();
      return supabase.rpc('consume_ai_rate_limit', {
        p_operation: requestedOperation,
      });
    },
  });

  if (!decision.ok) {
    return {
      ok: false,
      response: createAiAccessErrorResponse(decision),
    };
  }

  return {
    ok: true,
    userId: decision.userId,
  };
}
