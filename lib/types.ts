// lib/types.ts
// Definisi tipe data untuk seluruh aplikasi Notara
// "Types" itu kayak blueprint/cetakan — semua bagian kode wajib ikut bentuk ini

export interface Folder {
  id: string;
  name: string;       // "Basis Data", "AI & Machine Learning", dll
  color: string;      // Kode warna hex: "#8B5CF6"
  icon: string;       // Emoji: "📁", "🧠", "📐", dll
  created_at: string;
  user_id?: string;   // UUID owner (dari auth.users) — wajib saat insert, opsional saat baca
}

export interface Summary {
  id: string;
  folder_id: string | null;  // null = belum dimasukkan ke folder manapun
  title: string;             // Judul otomatis dari AI
  file_name: string | null;  // Nama file audio yang diupload
  duration_sec: number | null; // Durasi audio dalam detik
  transcript: string;        // Transkrip lengkap dari Groq Whisper
  summary: string;           // Rangkuman markdown dari Groq Llama
  word_count: number | null; // Jumlah kata transkrip (info tambahan)
  created_at: string;
  is_public?: boolean;       // Status publik share link
  public_slug?: string | null; // Slug unik untuk share link (8 karakter alphanumeric)
  user_id?: string;          // UUID owner (dari auth.users) — wajib saat insert, opsional saat baca
}

export interface ChatThread {
  id: string;
  summary_id: string | null;
  title: string;
  created_at: string;
  user_id: string;
}

export interface ChatMessage {
  id: string;
  summary_id: string | null;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Tipe untuk membuat folder baru (tanpa id & created_at — itu diisi Supabase otomatis)
export type CreateFolderInput = Omit<Folder, 'id' | 'created_at'>;

// Tipe untuk menyimpan rangkuman baru
export type CreateSummaryInput = Omit<Summary, 'id' | 'created_at'>;

// ─────────────────────────────────────────────
// STUDY GROUP TYPES (Sprint 16)
// ─────────────────────────────────────────────

export interface StudyGroup {
  id: string;
  name: string;
  description?: string | null;
  invite_code: string;
  owner_id: string;
  created_at: string;
  // Computed fields (dari JOIN / aggregation di query)
  member_count?: number;
  user_role?: 'owner' | 'member';
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  // Joined from auth.users metadata
  email?: string;
  full_name?: string;
}

export interface GroupFolder {
  group_id: string;
  folder_id: string;
}
