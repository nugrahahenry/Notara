-- ============================================================
-- VERIFIKASI SETELAH 20260719_catchup.sql
-- Jalankan SETELAH migrasi. Ini semua SELECT (read-only), aman.
-- ============================================================


-- ------------------------------------------------------------
-- CEK 1: Kolom profiles. Harus muncul 10 baris:
-- id, email, full_name, updated_at, role, university, major,
-- find_source, is_onboarded, subscription_tier.
-- ------------------------------------------------------------
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;


-- ------------------------------------------------------------
-- CEK 2: Semua 9 tabel harus ada.
-- ------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'folders','summaries','chat_messages','chat_threads','profiles',
    'study_groups','group_members','group_folders','subscriptions'
  )
ORDER BY table_name;
-- Harus 9 baris. Yang paling sering hilang: subscriptions, chat_threads.


-- ------------------------------------------------------------
-- CEK 3: Kolom kunci billing + chat.
-- ------------------------------------------------------------
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'profiles'       AND column_name = 'subscription_tier') OR
    (table_name = 'chat_messages'  AND column_name = 'thread_id')         OR
    (table_name = 'subscriptions'  AND column_name IN ('order_id','snap_token','status','amount'))
  )
ORDER BY table_name, column_name;
-- Harus 6 baris.


-- ------------------------------------------------------------
-- CEK 4: Constraint tier harus ada dan isinya free/pro/max.
-- ------------------------------------------------------------
SELECT conname, pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conname = 'profiles_subscription_tier_check';


-- ------------------------------------------------------------
-- CEK 5: Function wajib. Harus 4 baris.
-- ------------------------------------------------------------
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumen
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'handle_new_user','is_group_member',
    'handle_payment_callback','protect_subscription_tier'
  )
ORDER BY p.proname;


-- ------------------------------------------------------------
-- CEK 6: RLS aktif di semua 9 tabel (rowsecurity harus true semua).
-- ------------------------------------------------------------
SELECT relname AS tabel, relrowsecurity AS rls_aktif
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND relname IN (
    'folders','summaries','chat_messages','chat_threads','profiles',
    'study_groups','group_members','group_folders','subscriptions'
  )
ORDER BY relname;


-- ------------------------------------------------------------
-- CEK 7: Daftar policy. Harus 21 baris total.
-- Rincian: folders 2, profiles 2, summaries 4, chat_messages 1,
-- chat_threads 1, study_groups 3, group_members 3, group_folders 2,
-- subscriptions 3.  (2+2+4+1+1+3+3+2+3 = 21)
-- ------------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT count(*) AS total_policy_harus_21
FROM pg_policies
WHERE schemaname = 'public';


-- ------------------------------------------------------------
-- CEK 8: subscriptions harus punya 3 policy (SELECT, INSERT, UPDATE).
-- Kalau cuma SELECT, checkout billing akan gagal HTTP 500.
-- ------------------------------------------------------------
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'subscriptions'
ORDER BY cmd;


-- ------------------------------------------------------------
-- CEK 9: policy SELECT study_groups harus mengandung "owner_id".
-- Kalau tidak, createStudyGroup() masih akan gagal.
-- ------------------------------------------------------------
SELECT policyname, qual AS definisi_using
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'study_groups'
  AND cmd = 'SELECT';


-- ------------------------------------------------------------
-- CEK 10: FK group_members.user_id harus menunjuk ke profiles.
-- Kalau menunjuk auth.users, getGroupMembers() error
-- "could not find a relationship".
-- ------------------------------------------------------------
SELECT
  c.conname,
  (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS menunjuk_ke
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE c.conrelid = 'public.group_members'::regclass
  AND c.contype = 'f'
  AND a.attname = 'user_id';


-- ------------------------------------------------------------
-- CEK 11 (PALING PENTING): tes rekursi RLS 42P17.
-- JALANKAN SELURUH BLOK INI SEKALIGUS, jangan per baris.
--
-- Kenapa harus dibungkus BEGIN/ROLLBACK: "SET LOCAL ROLE" cuma berlaku
-- di dalam transaksi. Kalau dijalankan terpisah, dia no-op dan query
-- jalan sebagai postgres yang KEBAL RLS -> tesnya lolos palsu padahal
-- policy masih rusak.
--
-- Kalau ada yang melempar 42P17 "infinite recursion detected in policy",
-- berarti Bagian 5.7 migrasi belum benar-benar terpasang.
-- ------------------------------------------------------------
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT count(*) AS uji_folders       FROM public.folders;
  SELECT count(*) AS uji_group_members FROM public.group_members;
  SELECT count(*) AS uji_summaries     FROM public.summaries;
  SELECT count(*) AS uji_profiles      FROM public.profiles;
ROLLBACK;


-- ------------------------------------------------------------
-- CEK 12: lihat tier semua user (buat testing tier).
-- ------------------------------------------------------------
SELECT id, email, subscription_tier, is_onboarded
FROM public.profiles
ORDER BY email;


-- ------------------------------------------------------------
-- SETEL TIER UNTUK TESTING
-- Ganti 'max' jadi 'pro' / 'free' sesuai yang mau dites,
-- lalu refresh / re-login di aplikasi.
--
-- CATATAN: ini dijalankan dari SQL Editor sebagai postgres, jadi TIDAK
-- kena trigger protect_subscription_tier (yang cuma memblokir role
-- authenticated/anon dari browser). Jadi cara ini tetap berfungsi.
-- ------------------------------------------------------------
-- UPDATE public.profiles
-- SET subscription_tier = 'max'
-- WHERE email = 'henrynugraha1210@gmail.com';
