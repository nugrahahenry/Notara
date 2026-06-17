-- ==========================================
-- NOTARA - DATABASE SCHEMA & MIGRATIONS
-- ==========================================
-- File ini adalah Single Source of Truth untuk skema database Notara.
-- Jalankan kode di bawah ini di SQL Editor Supabase baru jika ingin mereset/membuat dari awal,
-- atau gunakan bagian tertentu saat melakukan pembaruan skema.

-- 1. TABEL FOLDERS
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 2. TABEL SUMMARIES (RANGKUMAN)
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
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

-- 3. TABEL CHAT MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID REFERENCES summaries(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ROW LEVEL SECURITY (RLS) ACTIVATION
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. POLICY: FOLDERS
-- Pengguna hanya dapat mengelola (CREATE, READ, UPDATE, DELETE) folder miliknya sendiri
CREATE POLICY "Users can manage their own folders"
ON folders FOR ALL
USING (auth.uid() = user_id);

-- 6. POLICY: SUMMARIES
-- Pengguna hanya dapat mengelola rangkuman miliknya sendiri
CREATE POLICY "Users can manage their own summaries"
ON summaries FOR ALL
USING (auth.uid() = user_id);

-- Kebijakan RLS baru agar rangkuman publik dapat dilihat oleh siapa saja tanpa login
CREATE POLICY "Public summaries are viewable by everyone"
ON summaries FOR SELECT
USING (is_public = true);

-- 7. POLICY: CHAT MESSAGES
-- Pengguna hanya dapat mengakses pesan obrolan jika rangkuman tersebut miliknya sendiri
CREATE POLICY "Users can access chat for their own or shared summaries"
ON chat_messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM summaries
    WHERE summaries.id = chat_messages.summary_id
    AND (
      summaries.user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM group_folders gf
        JOIN group_members gm ON gf.group_id = gm.group_id
        WHERE gf.folder_id = summaries.folder_id
        AND gm.user_id = auth.uid()
      )
    )
  )
);


-- ==========================================
-- UTILITY & DATA MIGRATION QUERIES
-- ==========================================

-- A. MENGHUBUNGKAN DATA LAMA KE AKUN BARU
-- Setelah pertama kali login dengan akun baru (Google atau Email),
-- ambil UUID user Anda di menu "Authentication -> Users" di Supabase Dashboard,
-- lalu ganti 'YOUR-USER-UUID' di bawah ini dengan UUID tersebut dan jalankan query:
--
-- UPDATE folders SET user_id = 'YOUR-USER-UUID' WHERE user_id IS NULL;
-- UPDATE summaries SET user_id = 'YOUR-USER-UUID' WHERE user_id IS NULL;

-- 17. TABEL PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT policy "Profiles are viewable by group members and self"
CREATE POLICY "Profiles are viewable by group members and self"
ON profiles FOR SELECT
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1 FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = profiles.id
    AND gm2.user_id = auth.uid()
  )
);

-- Function to handle new user registration or update
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute the function on user creation/update
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- STUDY GROUP SCHEMA (Sprint 16 - Phase 4.5B)
-- Jalankan bagian ini di SQL Editor Supabase untuk mengaktifkan fitur Study Group
-- ==========================================

-- 8. TABEL KELOMPOK BELAJAR
CREATE TABLE IF NOT EXISTS study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. TABEL ANGGOTA KELOMPOK
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 10. TABEL FOLDER YANG DIBAGIKAN KE KELOMPOK
CREATE TABLE IF NOT EXISTS group_folders (
  group_id UUID REFERENCES study_groups(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, folder_id)
);

-- 11. AKTIFKAN RLS UNTUK TABEL STUDY GROUP
ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_folders ENABLE ROW LEVEL SECURITY;

-- 12. POLICY: STUDY GROUPS — Anggota dapat melihat kelompok yang mereka ikuti
CREATE POLICY "Members can view their study groups"
ON study_groups FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = study_groups.id
    AND group_members.user_id = auth.uid()
  )
);

-- Owner bisa membuat kelompok baru
CREATE POLICY "Authenticated users can create study groups"
ON study_groups FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- Owner bisa hapus kelompok miliknya
CREATE POLICY "Owners can delete their study groups"
ON study_groups FOR DELETE
USING (auth.uid() = owner_id);

-- 13. POLICY: GROUP MEMBERS — Anggota bisa melihat daftar anggota kelompok yang sama
CREATE POLICY "Members can view group membership"
ON group_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = group_members.group_id
    AND gm.user_id = auth.uid()
  )
);

-- User bisa bergabung atau owner bisa menambah anggota
CREATE POLICY "Users can join groups"
ON group_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- User bisa keluar dari grup, atau owner bisa kick anggota
CREATE POLICY "Users can leave groups or owners can remove members"
ON group_members FOR DELETE
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM study_groups
    WHERE study_groups.id = group_members.group_id
    AND study_groups.owner_id = auth.uid()
  )
);

-- 14. POLICY: GROUP FOLDERS — Anggota dapat melihat folder bersama kelompok mereka
CREATE POLICY "Members can view group folders"
ON group_folders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = group_folders.group_id
    AND group_members.user_id = auth.uid()
  )
);

-- Owner saja yang bisa share/unshare folder
CREATE POLICY "Owners can manage group folders"
ON group_folders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM study_groups
    WHERE study_groups.id = group_folders.group_id
    AND study_groups.owner_id = auth.uid()
  )
);

-- 15. POLICY: FOLDERS — Anggota kelompok bisa melihat folder yang dibagikan
CREATE POLICY "Members can view folders shared in their groups"
ON folders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_folders gf
    JOIN group_members gm ON gf.group_id = gm.group_id
    WHERE gf.folder_id = folders.id
    AND gm.user_id = auth.uid()
  )
);

-- 16. POLICY: SUMMARIES — Anggota kelompok bisa melihat rangkuman di folder bersama
CREATE POLICY "Members can view summaries in shared folders"
ON summaries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_folders gf
    JOIN group_members gm ON gf.group_id = gm.group_id
    WHERE gf.folder_id = summaries.folder_id
    AND gm.user_id = auth.uid()
  )
);

-- Anggota kelompok bisa menambah rangkuman ke folder bersama
CREATE POLICY "Members can insert summaries into shared folders"
ON summaries FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  (
    folder_id IS NULL OR
    EXISTS (
      SELECT 1 FROM group_folders gf
      JOIN group_members gm ON gf.group_id = gm.group_id
      WHERE gf.folder_id = folder_id
      AND gm.user_id = auth.uid()
    )
  )
);




