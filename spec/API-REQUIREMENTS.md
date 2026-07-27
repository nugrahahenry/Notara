# API Requirements — Notara

> Status: route yang ditemukan di source, bukan public API contract. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: `app/api/**/route.ts`, `middleware.ts`, dan pemanggil dashboard.
> Perbarui saat method, auth, payload, atau error berubah.

## Catatan lintas endpoint

- Middleware saat ini menganggap semua path selain landing/login/auth/share sebagai terproteksi, termasuk `/api/*`. Ini **bukan** mekanisme yang cukup untuk API dan justru memblokir webhook tanpa cookie.
- `/api/summarize`, `/api/summarize-transcript`, dan `/api/chat` tidak memanggil `supabase.auth.getUser()` di route. Perlindungan mereka saat ini hanya efek middleware; jika `/api` dikecualikan demi webhook, ketiganya harus memperoleh autentikasi/otorisasi eksplisit dan rate limiting sebelum deploy.
- Tidak ada rate limit, quota server-side, idempotency key umum, atau audit event untuk AI API.

## Existing application routes

| Endpoint | Method | Auth saat kode diaudit | Input / output | Side effect & dependency |
| --- | --- | --- | --- | --- |
| `/api/summarize` | POST | tidak eksplisit di route; bergantung middleware | multipart `file`; opsional `transcribeOnly=true`. Output `{ transcript }` atau `{ transcript, summary }`. | Groq transcription; bila non-transcribe-only juga Groq chat completion. Tidak menyimpan DB sendiri. 400 file/sunyi, 500 provider/config/error. |
| `/api/summarize-transcript` | POST | tidak eksplisit di route; bergantung middleware | JSON `{ transcript }`; output `{ summary }`. | Groq LLM. 400 transkrip kosong; 500 provider/config/error. |
| `/api/chat` | POST | tidak eksplisit di route; bergantung middleware | JSON `message`, `contextTranscript`, `history`, `chatScope`, `folderName`. | Mem-forward SSE Groq (`text/event-stream`); 400 pesan kosong, 500 provider/error. DB chat ditulis oleh client dashboard, bukan route. |
| `/api/version` | GET | saat ini ikut redirect middleware bila tanpa sesi | output build id dan version, no-store. | Tidak ada DB/provider. Sebagai akibat middleware, update checker publik tidak dapat diandalkan. |
| `/api/billing/checkout` | POST | **eksplisit**: Supabase `getUser()` | JSON optional `{ tier: "max" }`; default pro; output Snap token/order/status atau error. | Query/upsert `subscriptions`, Midtrans Snap. 401 sesi invalid, 400 subscription aktif, 500 gateway/DB. |
| `/api/webhooks/billing` | POST | signature Midtrans di route, tetapi request tanpa sesi saat ini dialihkan middleware | payload notifikasi Midtrans; output `{ success, status }`. | RPC `handle_payment_callback`. Harus diperbaiki sebelum billing production. |

## API internal/data access

Browser menggunakan `lib/db.ts` dengan Supabase anon client untuk CRUD folders, summaries, chat threads/messages, study group, profile, dan subscription. RLS adalah kontrak izin utama. Ini bukan API publik: bentuk query dan tabel dapat berubah bersama aplikasi.

## Future API, belum ada

- Speaker diarization/segment endpoint dengan timestamp dan label netral.
- Formula detection/normalization dan renderer data contract.
- Tutor Materi inline, Global Tutor dengan sumber eksplisit, quiz, atau Neurova deep-link API.
- Upload signed URL/background job untuk audio besar.

Setiap API future wajib memiliki: actor/auth jelas, validasi schema/ukuran, rate limit, error contract, ownership test RLS, logging non-PII, dan dokumentasi retention data.
