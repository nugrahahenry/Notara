// lib/midtrans.ts
// Client REST API sederhana untuk berinteraksi dengan Midtrans Snap
// Mendukung mode mock terbatas untuk pengujian lokal saat development.

interface TransactionDetails {
  order_id: string;
  gross_amount: number;
}

interface CustomerDetails {
  first_name?: string;
  email?: string;
}

interface CreateTransactionInput {
  transaction_details: TransactionDetails;
  customer_details?: CustomerDetails;
}

interface MidtransResponse {
  token: string;
  redirect_url: string;
}

function getServerKey(): string {
  return process.env.MIDTRANS_SERVER_KEY?.trim() ?? '';
}

function isDummyServerKey(serverKey: string): boolean {
  return !serverKey || serverKey.toLowerCase().includes('dummy');
}

const IS_PROD = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true';

const SNAP_API_URL = IS_PROD
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

/**
 * Membuat transaksi baru di Midtrans dan mengembalikan Snap Token.
 */
export async function createMidtransTransaction(
  input: CreateTransactionInput
): Promise<MidtransResponse | null> {
  const serverKey = getServerKey();
  const isDummy = isDummyServerKey(serverKey);

  if (isDummy) {
    if (process.env.NODE_ENV !== 'development') {
      console.error('Midtrans server configuration is unavailable.');
      return null;
    }

    console.log('[Midtrans Mock] Membuat transaksi dummy untuk order:', input.transaction_details.order_id);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      token: `mock-snap-token-${input.transaction_details.order_id}`,
      redirect_url: `#mock-payment-url?order_id=${input.transaction_details.order_id}`,
    };
  }

  try {
    const authHeader = Buffer.from(`${serverKey}:`).toString('base64');
    const response = await fetch(SNAP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        transaction_details: input.transaction_details,
        credit_card: {
          secure: true,
        },
        customer_details: input.customer_details,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Midtrans API Error:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error contacting Midtrans:', error);
    return null;
  }
}

/**
 * Memverifikasi keaslian signature webhook dari Midtrans.
 * Formula: SHA512(order_id + status_code + gross_amount + ServerKey)
 */
export async function verifyMidtransSignature(payload: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}): Promise<boolean> {
  const serverKey = getServerKey();
  const isDummy = isDummyServerKey(serverKey);
  if (isDummy) {
    return process.env.NODE_ENV === 'development' && payload.signature_key === 'dummy';
  }

  try {
    const rawString = `${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`;
    const crypto = await import('crypto');
    const expected = Buffer.from(
      crypto.createHash('sha512').update(rawString).digest('hex'),
      'utf8',
    );
    const received = Buffer.from(payload.signature_key, 'utf8');

    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}