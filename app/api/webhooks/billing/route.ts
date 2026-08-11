// app/api/webhooks/billing/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { verifyMidtransSignature } from '@/lib/midtrans';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[Midtrans Webhook] Menerima notifikasi untuk order:', payload.order_id);

    // 1. Verifikasi Signature Key (Mencegah Fraud & Spoofing Pembayaran)
    const isSignatureValid = await verifyMidtransSignature({
      order_id: payload.order_id,
      status_code: payload.status_code,
      gross_amount: payload.gross_amount,
      signature_key: payload.signature_key,
    });

    if (!isSignatureValid) {
      console.warn('[Midtrans Webhook Warning] Signature key tidak valid untuk order:', payload.order_id);
      return NextResponse.json({ error: 'Signature key tidak sah.' }, { status: 401 });
    }

    // 2. Pemetaan Status Pembayaran Midtrans ke Status Nalira
    // Referensi Status Midtrans: settlement, capture, pending, deny, cancel, expire
    let status: 'pending' | 'success' | 'failed' | 'expired' = 'pending';
    const txStatus = payload.transaction_status;
    const fraudStatus = payload.fraud_status;

    if (txStatus === 'capture') {
      if (fraudStatus === 'accept') {
        status = 'success';
      } else if (fraudStatus === 'challenge') {
        status = 'pending';
      } else {
        status = 'failed';
      }
    } else if (txStatus === 'settlement') {
      status = 'success';
    } else if (['deny', 'cancel'].includes(txStatus)) {
      status = 'failed';
    } else if (txStatus === 'expire') {
      status = 'expired';
    } else if (txStatus === 'pending') {
      status = 'pending';
    }

    // 3. Update Database via RPC Function (Security Definer untuk melewati RLS)
    const supabase = await createClient();
    const { error: rpcError } = await supabase.rpc('handle_payment_callback', {
      p_order_id: payload.order_id,
      p_status: status,
      p_payment_type: payload.payment_type || null,
    });

    if (rpcError) {
      console.error('[Midtrans Webhook Error] Gagal memproses data di database:', rpcError.message);
      return NextResponse.json({ error: 'Gagal memperbarui status transaksi.' }, { status: 500 });
    }

    console.log(`[Midtrans Webhook Success] Transaksi ${payload.order_id} berhasil diupdate ke status: ${status}`);
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    console.error('[Midtrans Webhook Error] Terjadi kesalahan saat memproses request webhook:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem internal.' }, { status: 500 });
  }
}
