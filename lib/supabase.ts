// lib/supabase.ts
// Inisialisasi koneksi ke Supabase
// Analogi: Ini kayak "membuka pintu" ke lemari arsip cloud kita

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cek di development agar error langsung ketahuan
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase URL atau Anon Key belum diset! Cek file .env.local kamu.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
