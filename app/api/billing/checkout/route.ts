// app/api/billing/checkout/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createMidtransTransaction } from '@/lib/midtrans';

export async function POST() {
  try {
    const supabase = await createClient();
    
    // 1. Autentikasi Pengguna
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Sesi tidak valid. Silakan login kembali.' }, { status: 401 });
    }

    // 2. IDEMPOTENCY: Cek transaksi aktif 'pending' di database
    const { data: existingSub, error: dbError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError) {
      console.error('Error checking existing subscription:', dbError.message);
    }

    // Jika sudah ada Snap Token pending yang dibuat < 24 jam, pakai kembali token tersebut
    if (existingSub && existingSub.status === 'pending' && existingSub.snap_token) {
      const createdTime = new Date(existingSub.created_at).getTime();
      const now = Date.now();
      const expiryDuration = 24 * 60 * 60 * 1000; // 24 Jam

      if (now - createdTime < expiryDuration) {
        console.log(`[Idempotency] Menggunakan kembali Snap Token pending untuk user: ${user.id}`);
        return NextResponse.json({
          token: existingSub.snap_token,
          order_id: existingSub.order_id,
          amount: existingSub.amount,
          status: existingSub.status,
        });
      }
    }

    // 3. Buat order_id Baru (Unik berbasis User ID + Timestamp)
    const orderId = `NOTARA-PRO-${user.id.substring(0, 8)}-${Date.now()}`;
    const amount = 49000; // Tarif Notara Pro (Rp 49.000)

    // 4. Minta Snap Token dari Midtrans
    const transaction = await createMidtransTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      },
      customer_details: {
        first_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Pengguna',
        email: user.email,
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Gagal menghubungkan ke gerbang pembayaran Midtrans.' }, { status: 500 });
    }

    // 5. Simpan transaksi di database
    const { error: upsertError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        order_id: orderId,
        snap_token: transaction.token,
        status: 'pending',
        amount: amount,
        created_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('Error saving subscription invoice:', upsertError.message);
      return NextResponse.json({ error: 'Gagal merekam invoice transaksi.' }, { status: 500 });
    }

    return NextResponse.json({
      token: transaction.token,
      order_id: orderId,
      amount: amount,
      status: 'pending',
    });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem internal.' }, { status: 500 });
  }
}
