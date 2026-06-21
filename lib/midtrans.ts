// lib/midtrans.ts
// Client REST API sederhana untuk berinteraksi dengan Midtrans Snap
// Mendukung mode mock otomatis jika kunci server diatur sebagai dummy untuk pengujian lokal offline

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

const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '';
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
  const isDummy = SERVER_KEY.includes('dummy') || !SERVER_KEY;

  // Mode Mock / Sandbox Lokal (jika memakai kredensial dummy)
  if (isDummy) {
    console.log('[Midtrans Mock] Membuat transaksi dummy untuk order:', input.transaction_details.order_id);
    // Simulasikan delay jaringan lambat (~1 detik)
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      token: `mock-snap-token-${input.transaction_details.order_id}`,
      redirect_url: `#mock-payment-url?order_id=${input.transaction_details.order_id}`,
    };
  }

  try {
    const authHeader = Buffer.from(`${SERVER_KEY}:`).toString('base64');
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
  const isDummy = SERVER_KEY.includes('dummy') || !SERVER_KEY;
  if (isDummy) {
    // Mode Mock: Selalu valid jika menggunakan sandbox dummy
    return true;
  }

  try {
    const rawString = `${payload.order_id}${payload.status_code}${payload.gross_amount}${SERVER_KEY}`;
    
    // Hash menggunakan SHA-512 bawaan Node.js
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha512').update(rawString).digest('hex');
    
    return hash === payload.signature_key;
  } catch (err) {
    console.error('Signature verification failed:', err);
    return false;
  }
}
