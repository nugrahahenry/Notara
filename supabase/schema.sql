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
CREATE POLICY "Users can access chat for their summaries"
ON chat_messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM summaries
    WHERE summaries.id = chat_messages.summary_id
    AND summaries.user_id = auth.uid()
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
