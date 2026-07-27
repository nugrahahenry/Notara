# Technical Requirements — Notara

> Status: baseline implementasi. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: `package.json`, `app/`, `lib/`, `middleware.ts`, dan `supabase/migrations/`.
> Perbarui saat dependency, environment, provider, atau deployment berubah.

## Stack dan struktur

| Area | Implementasi |
| --- | --- |
| Framework | Next.js 16.2.7 App Router, React 19.2.4, TypeScript strict |
| UI | Tailwind CSS 4, lucide-react, html2canvas, qrcode |
| Client utama | `app/dashboard/page.tsx` (saat audit ±7.000 baris; perlu dipecah bertahap) |
| API | route handler di `app/api/` |
| Database/auth | `@supabase/ssr`, `@supabase/supabase-js`, Postgres + RLS |
| AI | Groq REST: `whisper-large-v3` dan `openai/gpt-oss-120b`, dicentralisasi di `lib/ai.ts` |
| Payment | Midtrans Snap REST + webhook |
| Runtime/deploy | Vercel/Next serverless; tidak ada CI workflow yang ditemukan |

Direktori utama: `app/` untuk halaman/route, `lib/` untuk client/data/provider, `supabase/migrations/` untuk perubahan database canonical, `test/` untuk harness lokal, `spec/` untuk kontrak tracked. `supabase/schema.sql` adalah artefak historis—jangan dijadikan instalasi live.

## Environment variable

| Nama | Sisi | Kegunaan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public build/client/server | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public build/client/server | anon key Supabase, dibatasi RLS |
| `GROQ_API_KEY` | server-only | panggilan transkripsi/rangkuman/chat |
| `MIDTRANS_SERVER_KEY` | server-only | Snap REST dan signature webhook |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | public | script/UI Snap |
| `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` | public | memilih endpoint Midtrans |
| `NEXT_PUBLIC_APP_VERSION` | public build | fallback versi endpoint |
| `VERCEL_GIT_COMMIT_SHA` | server | build id Vercel |
| `NOTARA_DEV_BYPASS_AUTH` dan `NEXT_PUBLIC_NOTARA_DEV_BYPASS_AUTH` | development-only | bypass auth lokal; dilarang pada production |
| `SUPABASE_SERVICE_ROLE_KEY` | future server-only wajib untuk webhook | belum digunakan; diperlukan sebelum billing nyata |

## Keputusan arsitektur dan trade-off

- **Transcribe-and-discard:** privasi lebih baik dan biaya storage lebih rendah, tetapi tidak ada playback/server reprocessing audio.
- **Chunk di browser:** menjaga request di bawah limit Vercel, tetapi bergantung pada memori/CPU perangkat dan belum background processing.
- **Satu rangkuman setelah merge transkrip:** lebih hemat quota dan konteksnya utuh dibanding merangkum setiap chunk.
- **Supabase RLS dari client:** cepat untuk MVP dan ownership jelas, tetapi policy/migrasi harus diaudit secara disiplin.
- **Chat global heuristik:** murah dan sederhana, tetapi bukan semantic retrieval serta dapat memilih konteks yang tidak konsisten.
- **SSE pass-through:** respons terasa cepat, tetapi belum ada retry/cancellation/telemetry robust.

## Batas platform dan pengujian

- Request body deployment adalah alasan ambang chunk 4 MB; browser menciptakan chunk sekitar 3,8 MB dari audio 16 kHz mono dua menit.
- UI menolak source file >150 MB untuk mengurangi crash; batas provider/network tetap dapat lebih ketat.
- `npm test` memakai Node native test runner, mock browser, dan mock Supabase; ia bukan bukti integrasi provider/live RLS.
- Script yang tersedia: `dev`, `build`, `start`, `lint`, `test`. Tidak ada pipeline CI/CD yang ditemukan.
- `next.config.ts` menonaktifkan TLS certificate verification di non-production. Ini hanya toleransi development; jangan diperluas ke production dan evaluasi penghapusannya bila tidak lagi dibutuhkan.

## Kebutuhan perubahan teknis berikutnya

1. Selesaikan perubahan billing sebagai satu paket keamanan, termasuk client service-role khusus webhook.
2. Keluarkan API route dari redirect auth generik atau buat allowlist yang eksplisit; setiap route harus punya auth sendiri.
3. Pecah dashboard berdasarkan domain tanpa mengubah API/data flow.
4. Tambahkan observability terstruktur, rate limit, dan integration test di environment aman.
5. Untuk Study Canvas, tambah schema/migrasi baru hanya setelah provider diarization dan kontrak Formula/Speaker disetujui.
