# 📁 Notara — AI-Powered Lecture & Meeting Summarizer 🎓💼🔥

Notara adalah asisten akademik dan produktivitas berbasis AI yang dirancang untuk mereduksi berkas rekaman suara panjang (seperti perkuliahan, rapat, atau wawancara) menjadi rangkuman terstruktur satu halaman, daftar konsep kunci, prediksi soal ujian, serta dilengkapi dengan chatbot AI interaktif untuk tanya-jawab materi secara real-time.

---

## 🎨 Fitur Utama

1. **Perekaman Suara Native & Live Visualizer**: Rekam audio kuliah langsung di browser dengan waveform visualizer berbasis Canvas, pengukur durasi, tombol jeda/lanjutkan, dan pemutar preview audio.
2. **Client-Side Audio Chunking**: Mendekode secara asinkron berkas audio berukuran besar (>20MB) di browser lewat Web Audio API, memotongnya menjadi klip-klip 5 menit secara otomatis, mentranskripsinya secara paralel/sekuensial ke Groq Whisper, dan menggabungkannya kembali untuk bypass batasan API (25MB) dan serverless timeout.
3. **Reduksi Rangkuman Pintar (Groq Llama 3.3 70B)**: Rangkuman markdown komprehensif mencakup ringkasan singkat, poin-poin utama, istilah/konsep kunci, dan prediksi soal ujian/latihan mandiri.
4. **Streaming Study Q&A Chatbot**: Panel chat interaktif di sebelah kanan yang merespon secara real-time (streaming Server-Sent Events) untuk tanya-jawab seputar materi kuliah.
   * **🎯 Rangkuman Ini**: AI menjawab berdasarkan transkrip file yang sedang dibuka.
   * **📚 Satu Mata Kuliah**: AI menggabungkan transkrip dari seluruh dokumen di dalam folder mata kuliah yang sama sebagai context window!
5. **Database Permanen & Riwayat Chat (Supabase)**: Semua data folder/mata kuliah, riwayat rangkuman, dan riwayat chat tersimpan secara terstruktur di Supabase cloud PostgreSQL.
6. **Premium UI/UX Polish**:
   * *Supabase-Style Hover Sidebar*: Sidebar desktop w-16 yang meluncur membesar menjadi w-72 saat kursor diarahkan ke kiri.
   * *Orbital Brain Glow Loader*: Animasi loading orbital sirkuler bertahap dengan progress bar gradien pulsing neon.
   * *Sound Synthesizer*: Sintesis chimes dinamis lewat Web Audio API saat proses berhasil atau terhapus.
   * *Canvas Particle Explosion*: Efek ledakan partikel rose-violet dan pecahan dokumen dari posisi kursor saat dokumen dihapus.

---

## 🛠️ Tech Stack

* **Frontend**: Next.js 15+ (App Router), Tailwind CSS, TypeScript
* **Database**: Supabase PostgreSQL (SDK `@supabase/supabase-js`)
* **AI Transcription**: Groq Whisper API (`whisper-large-v3`)
* **AI Chat & Summary**: Groq Llama 3.3 API (`llama-3.3-70b-versatile`)
* **Audio Processing**: Web Audio API (native browser)

---

## 📂 Supabase Database Schema

Jalankan script SQL berikut di SQL Editor Supabase Anda untuk mempersiapkan tabel yang diperlukan:

```sql
-- Tabel untuk folder/matkul
CREATE TABLE folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,           
  color      TEXT NOT NULL DEFAULT '#8B5CF6', 
  icon       TEXT DEFAULT '📁',       
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel untuk riwayat rangkuman
CREATE TABLE summaries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id    UUID REFERENCES folders(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,           
  file_name    TEXT,                    
  duration_sec INTEGER,                 
  transcript   TEXT NOT NULL,           
  summary      TEXT NOT NULL,           
  word_count   INTEGER,                 
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel untuk chat history per summary
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id  UUID REFERENCES summaries(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ⚙️ Cara Menjalankan secara Lokal

### 1. Clone & Install Dependensi
Masuk ke direktori dan jalankan perintah install:
```bash
npm install
```

### 2. Konfigurasi Environment Variables
Buat berkas `.env.local` di root direktori proyek dan isi variabel berikut:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
GROQ_API_KEY=your-groq-api-key
```

### 3. Jalankan Dev Server
```bash
npm run dev
```
Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

---

## 🚀 Deploy ke Vercel

1. Buat repositori baru di GitHub dan dorong code Anda.
2. Impor proyek ke Vercel.
3. Tambahkan environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`) di menu Settings Vercel.
4. Klik **Deploy**!

---

## 📜 Lisensi
Lisensi di bawah [MIT License](LICENSE). Dibuat dengan 💜 oleh Henry & Notara Team.
