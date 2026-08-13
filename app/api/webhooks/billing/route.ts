import { NextResponse } from 'next/server';
import { processBillingNotification } from '@/lib/billing/webhook';
import { verifyMidtransSignature } from '@/lib/midtrans';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    // Processor mengembalikan respons 400 yang konsisten untuk JSON tidak valid.
  }

  const result = await processBillingNotification(payload, {
    verifySignature: verifyMidtransSignature,
    createRpcClient: () => {
      const client = createAdminClient();
      return {
        rpc: async (name, args) => {
          const { error } = await client.rpc(name, args);
          return {
            error: error ? { message: error.message } : null,
          };
        },
      };
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}