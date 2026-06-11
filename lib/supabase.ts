import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cek di development agar error langsung ketahuan
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase URL atau Anon Key belum diset! Cek file .env.local kamu.'
  );
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
