export type BillingStatus = 'pending' | 'success' | 'failed' | 'expired';

export interface MidtransNotification {
  order_id: string;
  transaction_status: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  payment_type: string | null;
  fraud_status: string | null;
}

interface BillingRpcResult {
  error: { message?: string } | null;
}

interface BillingRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<BillingRpcResult>;
}

interface BillingWebhookDependencies {
  verifySignature(payload: MidtransNotification): Promise<boolean>;
  createRpcClient(): BillingRpcClient;
}

export interface BillingWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  return candidate.trim();
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
): { valid: boolean; value: string | null } {
  const candidate = value[key];
  if (candidate === undefined || candidate === null || candidate === '') {
    return { valid: true, value: null };
  }
  if (typeof candidate !== 'string') return { valid: false, value: null };
  return { valid: true, value: candidate.trim() || null };
}

export function parseMidtransNotification(
  value: unknown,
): MidtransNotification | null {
  if (!isRecord(value)) return null;

  const orderId = requiredString(value, 'order_id');
  const transactionStatus = requiredString(value, 'transaction_status');
  const statusCode = requiredString(value, 'status_code');
  const grossAmount = requiredString(value, 'gross_amount');
  const signatureKey = requiredString(value, 'signature_key');
  const paymentType = optionalString(value, 'payment_type');
  const fraudStatus = optionalString(value, 'fraud_status');

  if (
    !orderId ||
    !transactionStatus ||
    !statusCode ||
    !grossAmount ||
    !signatureKey ||
    !paymentType.valid ||
    !fraudStatus.valid
  ) {
    return null;
  }

  return {
    order_id: orderId,
    transaction_status: transactionStatus,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signatureKey,
    payment_type: paymentType.value,
    fraud_status: fraudStatus.value,
  };
}

export function mapMidtransNotificationStatus(
  payload: Pick<
    MidtransNotification,
    'transaction_status' | 'status_code' | 'fraud_status'
  >,
): BillingStatus | null {
  const transactionStatus = payload.transaction_status.toLowerCase();
  const fraudStatus = payload.fraud_status?.toLowerCase() ?? null;

  if (transactionStatus === 'settlement') {
    if (payload.status_code !== '200') return null;
    return fraudStatus && fraudStatus !== 'accept' ? null : 'success';
  }

  if (transactionStatus === 'capture') {
    if (payload.status_code !== '200') return null;
    return fraudStatus && fraudStatus !== 'accept' ? null : 'success';
  }

  if (transactionStatus === 'pending') return 'pending';
  if (transactionStatus === 'deny' || transactionStatus === 'cancel') return 'failed';
  if (transactionStatus === 'expire') return 'expired';

  return null;
}

export async function processBillingNotification(
  value: unknown,
  dependencies: BillingWebhookDependencies,
): Promise<BillingWebhookResult> {
  const payload = parseMidtransNotification(value);
  if (!payload) {
    return {
      status: 400,
      body: { error: 'Payload webhook tidak valid.' },
    };
  }

  let signatureIsValid = false;
  try {
    signatureIsValid = await dependencies.verifySignature(payload);
  } catch {
    signatureIsValid = false;
  }

  if (!signatureIsValid) {
    return {
      status: 401,
      body: { error: 'Signature webhook tidak valid.' },
    };
  }

  const status = mapMidtransNotificationStatus(payload);
  if (!status) {
    return {
      status: 200,
      body: { success: true, ignored: true },
    };
  }

  let client: BillingRpcClient;
  try {
    client = dependencies.createRpcClient();
  } catch {
    return {
      status: 503,
      body: { error: 'Konfigurasi billing belum tersedia.' },
    };
  }

  try {
    const { error } = await client.rpc('handle_payment_callback', {
      p_order_id: payload.order_id,
      p_status: status,
      p_payment_type: payload.payment_type,
    });

    if (error) {
      return {
        status: 500,
        body: { error: 'Gagal memproses notifikasi billing.' },
      };
    }
  } catch {
    return {
      status: 500,
      body: { error: 'Gagal memproses notifikasi billing.' },
    };
  }

  return {
    status: 200,
    body: { success: true, status },
  };
}