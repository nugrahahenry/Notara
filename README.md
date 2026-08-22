# Nalira

> Status: kandidat lokal Nalira v0.10.1 di atas baseline `main` v0.10.0. Audio Source Focus sudah committed dan pushed; patch izin sumber sudah lolos acceptance mikrofon nyata, guard pemilihan tab, seluruh 259 test, lint, TypeScript, dan production build. Acceptance sinyal tab bersuara ditunda sampai kelas online nyata tersedia. Terakhir diverifikasi: 22 Agustus 2026.
> Nama folder, package, domain Vercel, env key, CSS selector, dan storage key tertentu masih memakai identifier legacy `notara` untuk menjaga kompatibilitas. Jangan rename identifier tersebut tanpa checkpoint migrasi teknis terpisah.
> Sumber kebenaran runtime: route aplikasi dan migrasi Supabase.
> Perbarui dokumen ini ketika alur pengguna, stack, konfigurasi, atau status keamanan berubah.

Nalira membantu mahasiswa Indonesia mengubah rekaman kuliah menjadi transkrip, rangkuman terstruktur, dan ruang tanya-jawab berbasis materi. Tujuannya bukan sekadar menghasilkan teks, tetapi mempersingkat jalan dari rekaman panjang ke bahan belajar yang bisa dicari dan dipahami kembali.

## Yang tersedia saat ini

- Login email/password dan Google melalui Supabase Auth, onboarding, profil, serta MFA di dashboard.
- Rekam satu sumber fokus dari mikrofon kelas atau audio tab Chrome untuk Zoom/Meet, atau unggah audio/video; setelah itu Nalira membuat transkripsi Bahasa Indonesia dan rangkuman terstruktur.
- Tes sumber 10 detik membantu memastikan sinyal yang benar terdengar sebelum rekaman panjang. Audio tab dan mikrofon tidak dicampur; pilihan tab hanya menyimpan track audio, bukan video yang dibagikan Chrome.
- App Shell responsif dengan tema System/Light/Dark, sidebar desktop/mobile, Home, Mata Kuliah, Dibagikan, Tanya Nalira, dan Capture sebagai workspace yang jelas.
- Antrean Capture maksimal tiga file secara sekuensial, dengan preview metadata, validasi, progress yang hanya muncul saat benar-benar terukur, kegagalan per item, serta retry dari awal tanpa menghapus hasil item lain.
- Pemrosesan berkas di atas 20 MB dilakukan di browser: audio di-resample menjadi mono 16 kHz lalu dipotong sekitar dua menit per bagian agar tiap request tetap di bawah batas platform; rangkuman dibuat sekali dari transkrip gabungan.
- Saat material disimpan, Nalira menyimpan processing run dan segmen bertimestamp secara privat serta idempoten. Timestamp antarchunk tetap mengacu ke posisi rekaman asal, dan pemilik dapat meninjau status kualitas, alasan peringatan, serta segmen bertanda waktu melalui pagination.
- Folder/mata kuliah, pencarian, pengelolaan rangkuman, ekspor Word, dan riwayat chat.
- Chat streaming dengan scope satu rangkuman, satu folder, atau koleksi pengguna.
- Study Canvas, Study Dock, serta slot Learning Lab untuk konsep, rumus, visual, quiz, dan pembicara sudah memiliki fondasi UI; kemampuan analisis Learning Lab belum tersedia.
- Share page publik yang dapat diaktifkan pemilik rangkuman dan tombol fork untuk pengguna yang login.
- Study group dan berbagi folder di dalam grup.
- UI checkout Midtrans, webhook bertanda tangan, dan pipeline subscription sudah diamankan di source v0.3.20. **Billing nyata belum boleh dipakai** sampai secret server dan migration privilege/RLS diterapkan serta diuji end-to-end di production.

## Arsitektur singkat

```text
Browser
  ├─ pilih satu sumber rekaman: mikrofon kelas atau audio tab Chrome
  ├─ tes sinyal 10 detik (opsional) → gunakan kembali stream yang sama
  ├─ rekam audio / unggah berkas
  ├─ berkas ≤ 20 MB: /api/summarize → transkripsi + rangkuman dalam satu request
  └─ berkas > 20 MB: decode → 16 kHz mono → chunk ±2 menit (≤ 4 MB/request)
                         └─ /api/summarize (per chunk) → Groq Whisper
                                  └─ transkrip + segmen gabungan → /api/summarize-transcript → Groq LLM
                                                                                 └─ simpan summary
                                                                                       └─ RPC evidence → Supabase Postgres

Chat dashboard → /api/chat → Groq LLM streaming (SSE)
Auth, data, RLS, share, dan grup → Supabase
Checkout → Midtrans Snap → webhook signature → RPC service-role (rollout production tertunda)
```

Audio bersifat *transcribe-and-discard*: implementasi saat ini tidak mengunggah atau menyimpan berkas audio ke database/storage aplikasi. Transkrip, rangkuman, metadata processing, segmen bertimestamp, dan riwayat chat dapat tersimpan sesuai aksi pengguna. Segmen privat ini adalah evidence belajar milik pengguna, bukan attestation kriptografis atau bukti forensik dari provider.

## Stack aktual

| Lapisan | Teknologi |
| --- | --- |
| Aplikasi | Next.js 16.3.1, React 19, TypeScript, Tailwind CSS 4 |
| Auth dan data | Supabase Auth, PostgreSQL, Row Level Security |
| Transkripsi | Groq `whisper-large-v3` dengan `language=id` |
| Rangkuman dan chat | Groq `openai/gpt-oss-120b` |
| Pembayaran | Midtrans Snap dengan webhook signature dan RPC service-role; rollout production masih tertunda |
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
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=
GROQ_API_KEY=
MIDTRANS_SERVER_KEY=
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=
NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=
```

`SUPABASE_SERVICE_ROLE_KEY` adalah secret **server-only** untuk webhook billing. Jangan pernah memberi prefix `NEXT_PUBLIC_`, menaruh nilainya di source, atau mengeksposnya ke browser. Untuk uji UI lokal ketika Supabase nonaktif, tersedia bypass yang dibatasi ketat ke mode development: `NOTARA_DEV_BYPASS_AUTH=true` dan `NEXT_PUBLIC_NOTARA_DEV_BYPASS_AUTH=true`. Jangan gunakan atau menambahkan bypass ini di deployment production.

Konfigurasi Midtrans untuk Vercel memakai tiga variabel berikut:

| Nama variabel | Sandbox | Production | Visibilitas |
|---|---|---|---|
| `MIDTRANS_SERVER_KEY` | Sandbox Server Key | Production Server Key | Secret server-only; jangan pernah memakai prefix `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Sandbox Client Key | Production Client Key | Public client configuration untuk Snap.js |
| `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` | `false` | `true` | Pemilih endpoint dan script Midtrans |

Client Key dan Server Key Sandbox berbeda dari key Production. Selama pengujian, gunakan pasangan key dari environment Sandbox dan pertahankan `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false`. Setelah akun Production disetujui, ganti kedua key sebagai satu pasangan dan ubah flag menjadi `true` pada deployment yang sama. Webhook billing juga memerlukan `SUPABASE_SERVICE_ROLE_KEY` agar dapat memperbarui status langganan secara server-only.

```bash
npm run dev
npm test
npm run lint
npm run build
```

## Database dan deployment

- Untuk menyamakan database baru/lama, gunakan `supabase/migrations/20260719_catchup.sql`, lalu verifikasi dengan `20260719_catchup_verify.sql`. Hardening billing berada di `supabase/migrations/20260813125948_harden_billing_security.sql`.
- Evidence transkrip berada di `supabase/migrations/20260818181455_persist_transcript_evidence.sql` dan sudah aktif di project Supabase production. RLS owner-only, grant authenticated, RPC persistence, serta satu Capture nyata telah diverifikasi; perubahan berikutnya tetap harus diuji pada project yang benar.
- Untuk production, isi `NEXT_PUBLIC_SITE_URL` dengan origin canonical tanpa path, saat ini `https://nalira-hengs.vercel.app`. Di Supabase Auth > URL Configuration, samakan Site URL dengan origin tersebut dan masukkan `https://nalira-hengs.vercel.app/auth/callback` ke Redirect URLs. Local development membutuhkan `http://localhost:3000/auth/callback`.
- Jangan menjalankan `supabase/schema.sql` secara utuh pada project live; ia historis dan memiliki urutan/policy yang tidak aman untuk dipakai sebagai migrasi canonical.
- Deploy di Vercel setelah environment variable tersedia pada target environment. Perubahan migrasi, RLS, atau billing harus diverifikasi dulu di lingkungan yang aman.
- Di Midtrans Dashboard, arahkan Payment Notification URL ke `<NEXT_PUBLIC_SITE_URL>/api/webhooks/billing`. URL harus memakai HTTPS publik, tidak boleh localhost, dan tidak boleh membutuhkan login atau custom authorization header. Untuk Snap, atur Finish Redirect URL ke `<NEXT_PUBLIC_SITE_URL>/dashboard`.

## Keterbatasan yang diketahui

- `app/dashboard/page.tsx` masih menjadi orchestrator besar. Shell, tema, workspace, dan capture sudah memiliki batas komponen stabil, tetapi ekstraksi logic berikutnya tetap harus bertahap agar flow lama tidak regresi.
- Timestamp di UI menunjukkan posisi segmen pada rekaman asal, tetapi audio tidak disimpan sehingga belum ada playback atau seek setelah reload.
- Audio Source Focus memisahkan sumber pada batas capture, bukan orang di dalam rekaman. Mode mikrofon tidak dapat menghapus satu suara dekat secara selektif, sedangkan mode tab membutuhkan Chrome, pilihan tab browser, dan opsi berbagi audio tab yang aktif.
- Speaker diarization, identitas/peran pembicara, koreksi label pembicara, formula capture/renderer matematika, Learning Lab berbasis AI, serta integrasi Neurova belum diimplementasikan.
- Chat “global” memilih konteks dengan pencarian kata kunci di sisi klien; ini bukan retrieval system terindeks.
- Upload langsung dibatasi oleh memori browser dan request body platform. UI menolak berkas di atas 150 MB; antrean tidak bertahan setelah refresh, pemrosesan belum berjalan di background, dan chunk gagal belum dapat dilanjutkan dari titik terakhir.
- Endpoint API AI sudah memvalidasi sesi dan memakai rate limit per pengguna; kuota harian/berdasarkan tier, sinyal IP, dan kontrol penyalahgunaan multi-akun belum tersedia.
- Audit dependency v0.8.1 bersih pada runtime dan seluruh tree. Pertahankan versi Next.js serta konfigurasi lint secara exact dan tetap review setiap perubahan dependency sebelum deployment.
- Hardening billing sudah siap di source, tetapi belum aktif di production sampai secret server tersedia di Vercel, migration privilege/RLS diterapkan ke project yang benar, dan smoke test webhook serta checkout lulus.

## Roadmap terdekat

1. Saat kelas online berikutnya tersedia, lakukan acceptance `Tab Zoom / Meet` dengan memilih satu tab Chrome yang sedang mengeluarkan suara dan mengaktifkan audio tab.
2. Setelah acceptance lulus, commit dan push manual; deployment tetap menjadi langkah terpisah milik Henry.
3. Lanjutkan Speaker Context sebagai checkpoint terpisah: diarization tidak boleh dianggap selesai hanya karena sumber capture sudah benar.
4. Sinkronkan workstream Learning System dan Brand hanya melalui hook yang sudah disiapkan; jangan mengubah hierarchy shell tanpa keputusan produk.

Catatan produk, desain, dan prototype internal sengaja disimpan terpisah dari repository publik.
