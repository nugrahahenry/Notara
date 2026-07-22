-- ============================================================
-- NOTARA — CATCH-UP MIGRATION (susul-ketinggalan schema.sql)
-- Dibuat: 19 Juli 2026
-- Cara pakai: copy SELURUH file ini → Supabase SQL Editor → Run.
-- AMAN diulang berkali-kali. TIDAK ada DROP TABLE / DROP COLUMN /
-- TRUNCATE / DELETE. Data lama tidak disentuh.
-- ============================================================
-- Kenapa file ini ada:
-- schema.sql tumbuh dengan cara "tempel blok baru di bawah", dan tiap
-- blok = sekali paste manual ke SQL Editor. Beberapa blok terakhir
-- (Onboarding, Chat Threads, Billing) belum pernah dipaste ke DB live —
-- itu sebabnya muncul error "column subscription_tier does not exist".
--
-- CATATAN: schema.sql ASLI TIDAK BISA dipaste utuh (policy di baris 67
-- & 110 mereferensikan tabel yang baru dibuat di baris 179). File ini
-- sudah diurutkan ulang supaya jalan dari atas ke bawah.
-- ============================================================


-- ============================================================
-- BAGIAN 1 — TABEL DASAR (jaring pengaman)
-- Semua pakai IF NOT EXISTS: kalau tabelnya sudah ada, dilewati.
-- Urutan sudah disesuaikan dependensi FK.
-- ============================================================

-- 1.1 folders
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 1.2 profiles (harus sebelum group_members karena jadi target FK)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 summaries
CREATE TABLE IF NOT EXISTS public.summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_name TEXT,
  duration_sec INTEGER,
  transcript TEXT NOT NULL,
  summary TEXT NOT NULL,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT false,
  public_slug TEXT UNIQUE
);

-- 1.4 chat_messages (kolom thread_id ditambah di Bagian 2)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID REFERENCES public.summaries(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.5 study_groups
CREATE TABLE IF NOT EXISTS public.study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.6 group_members (user_id -> profiles, WAJIB buat embed PostgREST)
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 1.7 group_folders
CREATE TABLE IF NOT EXISTS public.group_folders (
  group_id UUID REFERENCES public.study_groups(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, folder_id)
);

-- 1.8 chat_threads (Sprint 18 — kemungkinan besar BELUM ada di DB live)
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID REFERENCES public.summaries(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Obrolan Baru',
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 1.9 subscriptions (Phase 5 — hampir PASTI belum ada di DB live)
-- user_id UNIQUE itu wajib: checkout pakai upsert onConflict 'user_id'.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  order_id TEXT UNIQUE NOT NULL,
  snap_token TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'expired')),
  amount INTEGER NOT NULL,
  payment_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ
);


-- ============================================================
-- BAGIAN 2 — KOLOM YANG KETINGGALAN
-- Ini inti masalahnya. ADD COLUMN IF NOT EXISTS = aman diulang,
-- dan baris lama otomatis kebagian nilai DEFAULT-nya.
-- ============================================================

-- 2.1 Kolom onboarding (schema.sql Fase 2)
-- Dipakai lib/db.ts saveOnboardingData() + dashboard modal onboarding.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS university TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS major TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS find_source TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT false;

-- 2.2 Kolom subscription_tier <- INI YANG BIKIN ERROR "does not exist"
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';

-- Rapikan baris lama yang tier-nya NULL supaya lolos CHECK
UPDATE public.profiles SET subscription_tier = 'free' WHERE subscription_tier IS NULL;

-- Constraint dipasang lewat DO block (bukan DROP + ADD) supaya
-- constraint yang sudah benar tidak pernah ikut ke-drop.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_subscription_tier_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'pro', 'max'));
    RAISE NOTICE 'Constraint profiles_subscription_tier_check dibuat.';
  ELSE
    RAISE NOTICE 'Constraint profiles_subscription_tier_check sudah ada, dilewati.';
  END IF;
END $$;

-- 2.3 chat_messages.thread_id (Sprint 18)
-- Dipakai lib/db.ts getChatMessages() (baris 351) dan clearChatMessages() (baris 391).
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE;

-- 2.4 Cek FK group_members.user_id -> profiles(id)
-- getGroupMembers() pakai embed PostgREST "profiles:user_id(...)",
-- yang cuma jalan kalau FK-nya nunjuk ke profiles, bukan auth.users.
-- Blok ini hanya MENAMBAH kalau belum ada FK sama sekali. Kalau FK-nya
-- salah sasaran, dia cuma kasih peringatan (tidak menghapus apa pun).
DO $$
DECLARE
  v_fk_ke_profiles BOOLEAN;
  v_fk_apa_saja BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.group_members'::regclass
      AND c.contype = 'f' AND a.attname = 'user_id'
      AND c.confrelid = 'public.profiles'::regclass
  ) INTO v_fk_ke_profiles;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.group_members'::regclass
      AND c.contype = 'f' AND a.attname = 'user_id'
  ) INTO v_fk_apa_saja;

  IF v_fk_ke_profiles THEN
    RAISE NOTICE 'OK: group_members.user_id sudah FK ke profiles.';
  ELSIF v_fk_apa_saja THEN
    RAISE WARNING 'PERHATIAN: group_members.user_id punya FK tapi BUKAN ke profiles (kemungkinan ke auth.users). getGroupMembers() akan error "could not find a relationship". Perbaiki manual.';
  ELSE
    ALTER TABLE public.group_members
      ADD CONSTRAINT group_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK group_members.user_id -> profiles(id) ditambahkan.';
  END IF;
END $$;


-- ============================================================
-- BAGIAN 3 — FUNCTION & TRIGGER
-- CREATE OR REPLACE = idempotent by design.
-- ============================================================

-- 3.1 handle_new_user: satu-satunya yang mengisi tabel profiles.
-- Kode Notara TIDAK PERNAH insert ke profiles, cuma select & update.
-- Kalau trigger ini mati, semua user baru tidak punya profil.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, updated_at)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger DIISOLASI dalam DO block dengan EXCEPTION.
-- Kenapa: auth.users dimiliki supabase_auth_admin, bukan postgres. Kalau
-- statement ini melempar "must be owner of relation users", SQL Editor
-- menjalankan seluruh skrip sebagai SATU transaksi implisit -> SEMUA
-- rollback, termasuk kolom subscription_tier yang jadi tujuan utama.
-- Dibungkus supaya gagalnya cuma WARNING dan sisa migrasi tetap masuk.
DO $outer$
BEGIN
  EXECUTE $ddl$
    CREATE OR REPLACE TRIGGER on_auth_user_created
      AFTER INSERT OR UPDATE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()
  $ddl$;
  RAISE NOTICE 'OK: trigger on_auth_user_created terpasang.';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'GAGAL pasang trigger on_auth_user_created: %. Sisa migrasi TETAP jalan. Pasang manual via Supabase Dashboard bila perlu.', SQLERRM;
END
$outer$;

-- 3.2 is_group_member — helper anti-rekursi.
-- SECURITY DEFINER = jalan sebagai pemilik tabel, jadi TIDAK kena RLS.
-- Ini yang memutus rantai "policy group_members query group_members".
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
  );
$$;

-- 3.3 handle_payment_callback — dipanggil webhook Midtrans lewat .rpc()
-- Signature harus PERSIS (p_order_id, p_status, p_payment_type).
CREATE OR REPLACE FUNCTION public.handle_payment_callback(
  p_order_id TEXT,
  p_status TEXT,
  p_payment_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tier TEXT;
BEGIN
  SELECT user_id INTO v_user_id FROM public.subscriptions WHERE order_id = p_order_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET
      status = p_status,
      payment_type = p_payment_type,
      current_period_start = CASE WHEN p_status = 'success' THEN now() ELSE current_period_start END,
      current_period_end   = CASE WHEN p_status = 'success' THEN now() + interval '30 days' ELSE current_period_end END
    WHERE order_id = p_order_id;

    v_tier := CASE
      WHEN p_status = 'success' AND p_order_id LIKE 'NOTARA-MAX-%' THEN 'max'
      WHEN p_status = 'success' THEN 'pro'
      ELSE 'free'
    END;

    UPDATE public.profiles
    SET subscription_tier = v_tier
    WHERE id = v_user_id;
  END IF;
END;
$$;


-- ============================================================
-- BAGIAN 4 — AKTIFKAN RLS
-- ENABLE ROW LEVEL SECURITY aman diulang.
-- ============================================================
ALTER TABLE public.folders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_folders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions  ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- BAGIAN 5 — POLICY
-- Postgres TIDAK punya "CREATE POLICY IF NOT EXISTS", jadi polanya
-- DROP POLICY IF EXISTS lalu CREATE POLICY. Ini BUKAN operasi
-- destruktif: tidak menyentuh data, dan policy langsung dibuat ulang.
-- ============================================================

-- 5.1 FOLDERS
DROP POLICY IF EXISTS "Users can manage their own folders" ON public.folders;
CREATE POLICY "Users can manage their own folders"
ON public.folders FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can view folders shared in their groups" ON public.folders;
CREATE POLICY "Members can view folders shared in their groups"
ON public.folders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_folders gf
    WHERE gf.folder_id = folders.id
      AND public.is_group_member(gf.group_id)
  )
);

-- 5.2 PROFILES
DROP POLICY IF EXISTS "Profiles are viewable by group members and self" ON public.profiles;
CREATE POLICY "Profiles are viewable by group members and self"
ON public.profiles FOR SELECT
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1 FROM public.group_members gm1
    WHERE gm1.user_id = profiles.id
      AND public.is_group_member(gm1.group_id)
  )
);

-- PENTING: tanpa policy UPDATE ini, saveOnboardingData() GAGAL DIAM-DIAM
-- (tidak error, cuma 0 baris ke-update) -> modal onboarding muncul terus.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 5.3 SUMMARIES
DROP POLICY IF EXISTS "Users can manage their own summaries" ON public.summaries;
CREATE POLICY "Users can manage their own summaries"
ON public.summaries FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Halaman share publik /s/[slug] butuh ini (dibaca tanpa login)
DROP POLICY IF EXISTS "Public summaries are viewable by everyone" ON public.summaries;
CREATE POLICY "Public summaries are viewable by everyone"
ON public.summaries FOR SELECT
USING (is_public = true);

DROP POLICY IF EXISTS "Members can view summaries in shared folders" ON public.summaries;
CREATE POLICY "Members can view summaries in shared folders"
ON public.summaries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_folders gf
    WHERE gf.folder_id = summaries.folder_id
      AND public.is_group_member(gf.group_id)
  )
);

-- CATATAN: di schema.sql baris 304 tertulis "gf.folder_id = folder_id".
-- Tanpa prefix, "folder_id" ke-resolve ke gf.folder_id (scope subquery
-- menang), jadi kondisinya selalu TRUE. Di bawah sudah diperbaiki jadi
-- summaries.folder_id.
-- PENTING: ini perbaikan KERAPIAN, BUKAN penambalan lubang keamanan.
-- Policy "Users can manage their own summaries" FOR ALL sudah mengizinkan
-- insert dengan folder_id apa pun asalkan user_id = auth.uid(), dan policy
-- permissive di-OR. Jadi memperketat yang ini tidak menutup apa pun.
DROP POLICY IF EXISTS "Members can insert summaries into shared folders" ON public.summaries;
CREATE POLICY "Members can insert summaries into shared folders"
ON public.summaries FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  (
    summaries.folder_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.group_folders gf
      WHERE gf.folder_id = summaries.folder_id
        AND public.is_group_member(gf.group_id)
    )
  )
);

-- 5.4 CHAT_MESSAGES (versi Sprint 18: sudah sadar thread_id)
DROP POLICY IF EXISTS "Users can access chat for their own or shared summaries" ON public.chat_messages;
CREATE POLICY "Users can access chat for their own or shared summaries"
ON public.chat_messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.summaries s
    WHERE s.id = chat_messages.summary_id
      AND (
        s.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.group_folders gf
          WHERE gf.folder_id = s.folder_id
            AND public.is_group_member(gf.group_id)
        )
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND t.user_id = auth.uid()
  )
);

-- 5.5 CHAT_THREADS
DROP POLICY IF EXISTS "Users can manage their own chat threads" ON public.chat_threads;
CREATE POLICY "Users can manage their own chat threads"
ON public.chat_threads FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5.6 STUDY_GROUPS
-- "auth.uid() = owner_id" WAJIB ada: createStudyGroup() (lib/db.ts:441-446)
-- melakukan .insert().select().single(). Klausa RETURNING ikut dicek policy
-- SELECT, sementara owner baru dimasukkan ke group_members SETELAH itu
-- (baris 453-455). Tanpa ini, bikin grup baru gagal.
DROP POLICY IF EXISTS "Members can view their study groups" ON public.study_groups;
CREATE POLICY "Members can view their study groups"
ON public.study_groups FOR SELECT
USING (
  auth.uid() = owner_id
  OR public.is_group_member(study_groups.id)
);

DROP POLICY IF EXISTS "Authenticated users can create study groups" ON public.study_groups;
CREATE POLICY "Authenticated users can create study groups"
ON public.study_groups FOR INSERT
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete their study groups" ON public.study_groups;
CREATE POLICY "Owners can delete their study groups"
ON public.study_groups FOR DELETE
USING (auth.uid() = owner_id);

-- 5.7 GROUP_MEMBERS
-- INI YANG PALING PENTING. Versi schema.sql men-subquery group_members
-- dari DALAM policy group_members sendiri -> Postgres melempar
-- "42P17: infinite recursion detected in policy". Karena policy folders,
-- summaries, profiles, group_folders, dan chat_messages semuanya ikut
-- menyentuh group_members, sekali rekursi ini kena, "SELECT * FROM folders"
-- pun ikut error dan dashboard kelihatan KOSONG tanpa alasan.
-- Solusinya: pakai helper is_group_member() yang SECURITY DEFINER.
DROP POLICY IF EXISTS "Members can view group membership" ON public.group_members;
CREATE POLICY "Members can view group membership"
ON public.group_members FOR SELECT
USING (public.is_group_member(group_members.group_id));

DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
CREATE POLICY "Users can join groups"
ON public.group_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave groups or owners can remove members" ON public.group_members;
CREATE POLICY "Users can leave groups or owners can remove members"
ON public.group_members FOR DELETE
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.study_groups sg
    WHERE sg.id = group_members.group_id
      AND sg.owner_id = auth.uid()
  )
);

-- 5.8 GROUP_FOLDERS
DROP POLICY IF EXISTS "Members can view group folders" ON public.group_folders;
CREATE POLICY "Members can view group folders"
ON public.group_folders FOR SELECT
USING (public.is_group_member(group_folders.group_id));

DROP POLICY IF EXISTS "Owners can manage group folders" ON public.group_folders;
CREATE POLICY "Owners can manage group folders"
ON public.group_folders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.study_groups sg
    WHERE sg.id = group_folders.group_id
      AND sg.owner_id = auth.uid()
  )
);

-- 5.9 SUBSCRIPTIONS
DROP POLICY IF EXISTS "Users can view their own subscription" ON public.subscriptions;
CREATE POLICY "Users can view their own subscription"
ON public.subscriptions FOR SELECT
USING (auth.uid() = user_id);

-- WAJIB TAMBAHAN: schema.sql cuma punya policy SELECT, padahal
-- app/api/billing/checkout/route.ts melakukan .upsert() memakai client
-- ber-cookie user (role authenticated, bukan service_role — memang tidak
-- ada SUPABASE_SERVICE_ROLE_KEY di .env.local). Tanpa dua policy ini,
-- checkout PASTI gagal: "Gagal merekam invoice transaksi." (HTTP 500).
DROP POLICY IF EXISTS "Users can create their own subscription" ON public.subscriptions;
CREATE POLICY "Users can create their own subscription"
ON public.subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own subscription" ON public.subscriptions;
CREATE POLICY "Users can update their own subscription"
ON public.subscriptions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- BAGIAN 6 — PENGAMAN TIER (biar tidak bisa upgrade gratisan)
-- Policy "Users can update their own profile" mengizinkan UPDATE ke SEMUA
-- kolom profiles, termasuk subscription_tier. Artinya dari browser siapa
-- pun bisa: supabase.from('profiles').update({subscription_tier:'max'})
-- dan langsung jadi Max tanpa bayar.
--
-- Trigger di bawah menolak perubahan tier kalau yang menjalankan adalah
-- role 'authenticated'/'anon' (request dari browser). handle_payment_callback()
-- jalan SECURITY DEFINER sebagai pemilik function, jadi webhook TETAP bisa.
--
-- ⚠️ INI BARU SEPARUH PROTEKSI. Trigger ini TIDAK menutup jalur RPC
-- handle_payment_callback yang masih EXECUTE ke PUBLIC (lihat Bagian 8).
--
-- ⚠️ LANDMINE KODE: trigger ini membuat updateUserSubscriptionTier()
-- (lib/db.ts:744) gagal SENYAP — fungsinya tetap return true tapi tier
-- tidak berubah. Sekarang aman (tidak dipanggil di mana pun), tapi ingat.
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_subscription_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     AND current_user IN ('authenticated', 'anon') THEN
    NEW.subscription_tier := OLD.subscription_tier;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_protect_subscription_tier
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_tier();


-- ============================================================
-- BAGIAN 7 — INDEX BANTU (opsional tapi murah)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_summaries_user_id      ON public.summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_summaries_folder_id    ON public.summaries(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id        ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread   ON public.chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_summary  ON public.chat_messages(summary_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user      ON public.chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user     ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_folders_folder   ON public.group_folders(folder_id);


-- ============================================================
-- BAGIAN 8 — LUBANG KEAMANAN AKTIF (belum ditutup di file ini)
-- ============================================================
-- handle_payment_callback itu SECURITY DEFINER dan Postgres memberi
-- EXECUTE ke PUBLIC secara default. Artinya siapa pun (bahkan anon)
-- bisa naik ke tier 'max' tanpa bayar:
--   1. checkout tier max -> order_id NOTARA-MAX-... dikembalikan ke browser
--   2. panggil .rpc('handle_payment_callback', {p_status:'success'}) pakai anon key
--   3. jadi Max, gratis.
--
-- Trigger Bagian 6 TIDAK menutup jalur ini (dia cuma menutup UPDATE
-- langsung ke tabel profiles).
--
-- CATATAN: webhook Midtrans saat ini TIDAK PERNAH sampai ke handler,
-- karena middleware.ts menangkap /api/* dan me-redirect 307 ke /login.
-- Jadi nol pembayaran terkonfirmasi sekarang -> REVOKE tidak mematikan
-- apa pun yang sedang hidup.
--
-- Kerjakan 4 langkah ini SEKALIGUS (jangan sepotong-sepotong):
--   1. Kecualikan /api dari middleware (atau pindah webhook ke luar matcher)
--   2. Tambah SUPABASE_SERVICE_ROLE_KEY ke .env.local + Vercel
--      (server-only, JANGAN pakai prefix NEXT_PUBLIC_)
--   3. Ubah app/api/webhooks/billing/route.ts supaya pakai client service-role
--   4. Baru jalankan baris di bawah:
--
-- REVOKE EXECUTE ON FUNCTION public.handle_payment_callback(text, text, text) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- SELESAI. Query verifikasi ada di file: 20260719_catchup_verify.sql
-- ============================================================
