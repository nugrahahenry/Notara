# Audit Dokumentasi Notara

> Status: audit awal repository. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: source code, route API, `package.json`, `supabase/migrations/`, `HANDOFF.md`, dan test harness.
> Perbarui setelah migrasi, redesign besar, atau rilis yang mengubah klaim produk.

## Ringkasan

Notara memiliki MVP yang benar-benar berjalan untuk auth, dashboard, audio → transkrip → rangkuman, chat, folder, share/fork, grup, dan scaffolding subscription. Dokumentasi lama tersebar di `docs/`, tidak seluruhnya tracked, dan banyak yang menggambarkan rencana lama sebagai kondisi saat ini. Dokumen di `spec/` menjadi baseline baru yang harus dibaca bersama kode.

## Evidence dari kode

| Area | Bukti | Kesimpulan audit |
| --- | --- | --- |
| Stack | `package.json`, `lib/ai.ts` | Next 16/React 19/Tailwind 4; Groq `whisper-large-v3` dan `openai/gpt-oss-120b`. |
| Audio besar | `app/dashboard/page.tsx`, `/api/summarize*` | Chunk browser ambang 4 MB, mono 16 kHz, ±2 menit; tiap chunk hanya transkripsi, rangkuman sekali dari transkrip gabungan. |
| Data dan RLS | catch-up migration + cleanup policy | 9 tabel inti/RLS; cleanup legacy dilaporkan selesai dengan 21 policy dan tanpa `Allow all`. |
| Auth/share | `middleware.ts`, `app/auth/callback`, `app/s/[slug]` | dashboard terproteksi; landing/login/auth/share publik; share mengandalkan `is_public`. |
| Chat | dashboard + `/api/chat` | summary/folder/global ada; global memakai keyword heuristic client-side, bukan RAG. |
| Billing | checkout/webhook/midtrans/middleware | UI, invoice, Snap, dan RPC ada; tidak aman/siap production karena gap P0. |
| Future UX | Study Canvas/Speaker Context | kontrak desain ada; belum ada backend, diarization, Formula Notes, atau renderer rumus production. |
| Tests | `test/`, `npm test` | Harness mock lokal tersedia; bukan bukti provider, Vercel, RLS live, atau payment end-to-end. |

## Dokumen lama: status dan kontradiksi

Catatan pembersihan 28 Juli 2026: draft historis yang tercantum di bawah telah dihapus dari working tree setelah audit. Baris ini dipertahankan sebagai jejak keputusan, bukan sebagai referensi file yang masih tersedia.

| Dokumen | Status | Mengapa tidak boleh jadi source of truth |
| --- | --- | --- |
| `README.md` sebelum audit | diganti | menyebut Llama 3.3, chunk 5 menit/parallel, limit 25 MB, dan pipeline payment auto-update; semuanya tidak sesuai kode/status terbaru. |
| `docs/BRD.md` | historis | target mencakup profesional/entrepreneur, mengklaim export/paket/akses API tertentu tanpa bukti runtime serta menganggap Pro sebagai paket tunggal. |
| `docs/SRS.md` | historis | auth/RLS disebut fase mendatang, kontrak `/api/chat` berbeda dari payload aktual, dan SLO waktu proses tidak dibuktikan. |
| `docs/ERD.md` | historis | menyebut Stripe, relasi profile lama, dan user ownership sebagai future; tidak memuat schema 9 tabel/migrasi aktual. |
| `docs/roadmap.md` | historis | menyatakan fase auth/RLS/billing sebagai future padahal scaffold/migrasi sudah ada; juga mengklaim stabil/terverifikasi tanpa batas evidence. |
| `TEST_READY.md` / `TEST_INFRA.md` | berguna dengan batas | menjelaskan test mock; klaim “fully verified” tidak boleh diterjemahkan sebagai verifikasi production. |
| `HANDOFF.md` | operasional, perlu dipelihara | kuat untuk temuan dan langkah lanjut, tetapi metadata checkpoint dan beberapa status testing perlu diselaraskan tiap commit. |
| `spec/STUDY-CANVAS.md`, `docs/SPEAKER-CONTEXT.md` | valid sebagai kontrak future | bukan bukti implementasi; harus tetap ditandai belum dibangun. |

## Data yang belum cukup untuk dipastikan

- Apakah semua flow MFA, group, export, dan multi-file queue pernah diuji di production setelah recovery database.
- Konfigurasi OAuth provider, redirect URL, dan consent screen live.
- Keberadaan/validitas Midtrans server key pada target production; dokumen tidak boleh menampilkan nilainya.
- Backup, retention, restore, delete-account, audit logging, dan analytics production.
- Kapasitas/biaya Groq, SLA provider, performa audio di perangkat lemah, serta batas Vercel aktual pada semua deployment.
- Harga/limit final dan pembeda nyata Pro vs Max.

## Pertanyaan keputusan sebelum fitur baru

1. Apakah billing tetap akan diluncurkan dalam waktu dekat? Jika ya, tutup paket P0 dahulu dan putuskan lifecycle cancel/refund/renewal.
2. Setelah prototype v2, bagian Study Canvas mana yang benar-benar MVP pertama: Tutor Materi, Formula Notes, atau Global Tutor workspace?
3. Provider apa yang akan dipakai untuk diarization, dan apakah kualitas/timestamp-nya cukup sebelum schema Speaker Context dibuat?
4. Berapa retensi transkrip/chat yang dijanjikan pengguna, dan bagaimana mekanisme hapus akun/export data?
5. Apakah Pro dan Max tetap dipertahankan, serta benefit mana yang dapat dijelaskan dan ditegakkan server-side?

## Urutan implementasi paling aman

1. **P0 billing/security:** perbaiki middleware/API allowlist, service-role webhook, revoke RPC public, fail closed production key, lalu uji Midtrans sandbox end-to-end.
2. **API boundary:** autentikasi/ownership/rate limit/schema validation untuk AI routes; observability terredaksi dan integration test.
3. **Data operations:** kebijakan retention/backup/delete account, audit log minimum, serta migrasi canonical yang menggantikan ketergantungan pada `schema.sql` historis.
4. **Refactor dashboard:** ekstrak komponen berdasarkan domain dengan regression test terhadap upload, summary, chat, folder, share, dan billing UI.
5. **Study Canvas:** audit prototype v2, implementasi layout/data existing dulu; jangan membuat Speaker/Formula data palsu.
6. **Diarization dan formula:** riset provider, schema/migration baru, provenance/timestamp/review state, renderer matematika, dan privacy review.
7. **Optimisasi skala:** signed upload/background processing/RAG hanya jika evidence penggunaan dan batas platform membenarkannya.
