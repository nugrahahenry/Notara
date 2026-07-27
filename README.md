# Notara

> Status: MVP aktif dan sedang diuji. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: route aplikasi, migrasi Supabase, dan [indeks spesifikasi](spec/README.md).
> Perbarui dokumen ini ketika alur pengguna, stack, konfigurasi, atau status keamanan berubah.

Notara membantu mahasiswa Indonesia mengubah rekaman kuliah menjadi transkrip, rangkuman terstruktur, dan ruang tanya-jawab berbasis materi. Tujuannya bukan sekadar menghasilkan teks, tetapi mempersingkat jalan dari rekaman panjang ke bahan belajar yang bisa dicari dan dipahami kembali.

## Yang tersedia saat ini

- Login email/password dan Google melalui Supabase Auth, onboarding, profil, serta MFA di dashboard.
- Rekam dari browser atau unggah audio/video, lalu transkripsi Bahasa Indonesia dan rangkuman terstruktur.
- Pemrosesan berkas besar di browser: audio di-resample menjadi mono 16 kHz lalu dipotong sekitar dua menit per bagian sebelum ditranskripsikan; rangkuman dibuat sekali dari transkrip gabungan.
- Folder/mata kuliah, pencarian, pengelolaan rangkuman, ekspor Word, dan riwayat chat.
- Chat streaming dengan scope satu rangkuman, satu folder, atau koleksi pengguna.
- Share page publik yang dapat diaktifkan pemilik rangkuman dan tombol fork untuk pengguna yang login.
- Study group dan berbagi folder di dalam grup.
- UI checkout Midtrans serta tabel/pipeline subscription sudah ada, tetapi **billing nyata belum boleh dipakai** sampai gap webhook dan otorisasi pada [DATA-SECURITY-REQUIREMENTS.md](spec/DATA-SECURITY-REQUIREMENTS.md) ditutup.

## Arsitektur singkat

```text
Browser
  ├─ rekam / unggah
  ├─ berkas > 4 MB: decode → 16 kHz mono → chunk ±2 menit
  └─ /api/summarize (per chunk) → Groq Whisper
                                  └─ transkrip gabungan → /api/summarize-transcript → Groq LLM
                                                                        └─ Supabase Postgres

Chat dashboard → /api/chat → Groq LLM streaming (SSE)
Auth, data, RLS, share, dan grup → Supabase
Checkout → Midtrans Snap → webhook billing (belum siap production)
```

Audio bersifat *transcribe-and-discard*: implementasi saat ini tidak mengunggah atau menyimpan berkas audio ke database/storage aplikasi. Transkrip, rangkuman, metadata, dan riwayat chat dapat tersimpan sesuai aksi pengguna.

## Stack aktual

| Lapisan | Teknologi |
| --- | --- |
| Aplikasi | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Auth dan data | Supabase Auth, PostgreSQL, Row Level Security |
| Transkripsi | Groq `whisper-large-v3` dengan `language=id` |
| Rangkuman dan chat | Groq `openai/gpt-oss-120b` |
| Pembayaran | Midtrans Snap (scaffold; belum tervalidasi sebagai alur pembayaran nyata) |
| Hosting | Vercel |
| Test lokal | Node.js native test runner + mock browser/Supabase |

## Menjalankan lokal

Prasyarat: Node.js dan project Supabase/Groq yang sudah dikonfigurasi untuk lingkungan pengembangan.

```bash
npm install
```

Buat `.env.local` sendiri (jangan pernah di-commit), lalu isi hanya nama variabel berikut sesuai layanan milikmu:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GROQ_API_KEY=
MIDTRANS_SERVER_KEY=
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=
NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=
```

Untuk uji UI lokal ketika Supabase nonaktif, tersedia bypass yang dibatasi ketat ke mode development: `NOTARA_DEV_BYPASS_AUTH=true` dan `NEXT_PUBLIC_NOTARA_DEV_BYPASS_AUTH=true`. Jangan gunakan atau menambahkan bypass ini di deployment production.

```bash
npm run dev
npm test
npm run lint
npm run build
```

## Database dan deployment

- Untuk menyamakan database baru/lama, gunakan `supabase/migrations/20260719_catchup.sql`, lalu verifikasi dengan `20260719_catchup_verify.sql`.
- Jangan menjalankan `supabase/schema.sql` secara utuh pada project live; ia historis dan memiliki urutan/policy yang tidak aman untuk dipakai sebagai migrasi canonical.
- Deploy di Vercel setelah environment variable tersedia pada target environment. Perubahan migrasi, RLS, atau billing harus diverifikasi dulu di lingkungan yang aman.

## Keterbatasan yang diketahui

- Dashboard masih satu file besar (`app/dashboard/page.tsx`), sehingga redesign harus diawali component extraction bertahap.
- Speaker diarization, formula capture/renderer matematika, Study Canvas, dan integrasi Neurova belum diimplementasikan. Kontraknya ada di [STUDY-CANVAS.md](spec/STUDY-CANVAS.md) dan [SPEAKER-CONTEXT.md](docs/SPEAKER-CONTEXT.md).
- Chat “global” memilih konteks dengan pencarian kata kunci di sisi klien; ini bukan retrieval system terindeks.
- Upload langsung dibatasi oleh memori browser dan request body platform. UI menolak berkas di atas 150 MB; ini bukan jaminan kemampuan semua perangkat.
- Endpoint API AI belum memiliki rate limit server-side dan tidak boleh diekspos ke publik tanpa perbaikan autentikasi/abuse protection.
- Billing harus dianggap belum siap production sampai webhook dapat menerima request tanpa sesi pengguna, menggunakan service role server-only, dan RPC sensitif dicabut dari akses publik.

## Roadmap terdekat

1. Tutup rantai keamanan billing dan verifikasi pembayaran sandbox end-to-end.
2. Pecah dashboard monolitik tanpa mengubah perilaku yang ada.
3. Audit prototype v2 lalu implementasikan Study Canvas bertahap.
4. Riset provider diarization sebelum membangun Speaker Context; lanjutkan Formula Notes setelah ada bukti transkrip dan renderer matematika.

Dokumentasi lengkap dan urutan kerja aman tersedia di [spec/README.md](spec/README.md) dan [docs/DOCUMENTATION-AUDIT.md](docs/DOCUMENTATION-AUDIT.md).
