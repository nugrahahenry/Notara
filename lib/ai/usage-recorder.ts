import 'server-only';

import { createAdminClient } from '@/lib/supabase-admin';
import type { AiUsageEvent } from './usage';
import {
  recordAiUsageWith,
  toAiUsageRpcParams,
  type AiUsageRecordResult,
} from './usage-recorder-policy';

export async function recordAiUsageSafely(
  event: AiUsageEvent,
  options: { bypassed: boolean },
): Promise<AiUsageRecordResult> {
  return recordAiUsageWith(event, {
    bypassed: options.bypassed,
    write: async (usageEvent) => {
      const client = createAdminClient();
      const { error } = await client.rpc(
        'record_ai_usage',
        toAiUsageRpcParams(usageEvent),
      );

      if (error) {
        throw new Error('AI usage persistence failed.');
      }
    },
    reportFailure: () => {
      console.error('[ai-usage] write failed');
    },
  });
}
