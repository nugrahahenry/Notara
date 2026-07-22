# Notara — Handoff Sesi (19 Juli 2026)

> Dokumen ini buat melanjutkan kerja di sesi/chat lain tanpa perlu jelasin ulang dari nol.
> Status saat ditulis: **v0.0.06**, build hijau, MVP fungsional tapi **belum tervalidasi end-to-end**.

---

## 0. Konteks penting sebelum mulai

- **Lokasi kode**: `HenryLabs/notara/`. Path lama `notara/` di root **sudah tidak ada** (ikut migrasi ke `HenryLabs/`).
- **Konvensi commit**: bahasa Inggris, format `Notara vX.Y.Z: <summary>`, **TANPA trailer `Co-Authored-By`** (Henry commit sendiri). Aturan lengkap di `../../KONVENSI-VERSI.md`.
- **Otak AI**: Groq doang. Model dikelola terpusat di `lib/ai.ts` (`openai/gpt-oss-120b` + `whisper-large-v3`). Gemini **tidak dipakai** sama sekali.
- **Audio tidak disimpan** (transcribe-and-discard, by design = privasi).

---

## 1. Yang SUDAH dikerjakan sesi ini

### 1.1 Model Groq deprecated
`llama-3.3-70b-versatile` dan `llama-3.1-8b-instant` di-deprecate Groq per 17 Jun 2026. Notara sudah pindah ke `openai/gpt-oss-120b`, dan sekarang ID model dipusatkan di **`lib/ai.ts`** supaya deprecation berikutnya cukup ubah 1 baris (dulu hardcode di 3 route).

> ⚠️ **Hengs WA bot masih pakai `llama-3.1-8b-instant` yang juga deprecated.** Beda produk, belum disentuh.

### 1.2 Gemini dibuang
`@google/generative-ai` ternyata terinstal tapi **tidak pernah di-import**. Dependency dihapus, dan label dashboard yang salah ("AI Engine: Gemini Pro") dibenerin jadi "Groq (GPT-OSS 120B)".

### 1.3 Fix upload audio panjang (bug produksi laten)
**Akar masalah**: potongan audio dibuat di sample-rate asli (44.1kHz), jadi chunk 3 menit ≈ **16MB**, padahal limit body Vercel **4.5MB** → 413. Ini jalan di `next dev` (tanpa limit) tapi **mati begitu deployed**.

**Fix** di `app/dashboard/page.tsx`:
- `sliceAudioBuffer()` sekarang **resample ke 16kHz mono** (rate native Whisper, akurasi sama, ukuran ~3x lebih kecil) via `OfflineAudioContext` (jadi async).
- `chunkDuration` 3 menit → **2 menit** (≈3.8MB, aman).
- `CHUNK_THRESHOLD` 20MB → **4MB** (dulu file 4.5–20MB lolos mentah dan pasti 413).

### 1.4 Wiring tier langganan
`isPro` ternyata di-**hardcode `false` di 6 tempat** → user yang bayar tetap kena limit gratis. Sekarang semua baca `profileTier !== 'free'` (dari `subscription_tier`).

> Pro & Max saat ini **masih identik** (biner paid/free). Kalau mau dibedain per persona (free=mahasiswa, pro=content creator, max=pebisnis), perlu bikin `tierLimits(tier)`.

### 1.5 Fix 2 bug login
- **Kedip halaman publik setelah login**: race cookie Supabase SSR. `router.replace()` (soft-nav) diganti **`window.location.replace()`** (navigasi dokumen penuh) supaya cookie ikut di request pertama. Plus middleware sekarang **membawa cookie ter-refresh ke response redirect**. (`useRouter` ikut dibuang karena jadi tidak terpakai.)
- **"Invalid login credentials"**: penyebab paling mungkin akun dibuat via Google (tanpa password), atau jebakan duplicate-email (Supabase balas "sukses" tapi `identities` kosong dan password tidak pernah diset). Sekarang signup mendeteksi `identities.length === 0` dan kasih pesan jelas.

### 1.6 Versi & dokumentasi
- Versi **0.0.05 → 0.0.06** di `package.json`, dashboard (3 spot), `app/api/version/route.ts`.
- `CHANGELOG.md`: entri `[0.0.06]` ditambah; entri awal dinomori ulang `[0.1.0]` → `[0.0.01]` biar urut.
- `KONVENSI-VERSI.md`: aturan "jangan pakai `Co-Authored-By`" ditambahkan.
- `ANTIGRAVITY.md` **dihapus** + semua referensinya dibersihkan (CLAUDE.md, skill `/lanjut`, `docs/PROMPT-MASTER.md`).

### 1.7 Verifikasi yang SUDAH dilakukan
| Cek | Hasil |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` (file yang disentuh) | ✅ nol isu baru (10 isu sisanya pre-existing) |
| `npm run build` | ✅ exit 0, 12 route compiled |

### 1.8 BELUM diverifikasi (butuh Henry)
- Fix audio panjang **di Vercel** (limit 4.5MB tidak muncul di lokal).
- Gating tier Pro/Max (kolom DB-nya belum ada, lihat §2).
- Alur login (butuh kredensial Henry).

---

## 2. 🔴 Temuan kritis yang BELUM ditutup

Hasil audit menyeluruh (schema vs kode). Urut dari yang paling mendesak.

### 2.1 DB live ketinggalan jauh dari `schema.sql`
`schema.sql` tumbuh dengan cara "tempel blok baru di bawah", dan tiap blok = sekali paste manual. Beberapa blok terakhir **belum pernah dipaste**. Yang hilang bukan cuma `subscription_tier`, tapi kemungkinan **satu blok Billing utuh**: tabel `subscriptions`, function `handle_payment_callback`, dan policy-nya.

➡️ **Solusi sudah disiapkan**: `supabase/migrations/20260719_catchup.sql` (idempotent, nol operasi destruktif) + `20260719_catchup_verify.sql`.

### 2.2 `schema.sql` kalau dipaste utuh, aplikasinya RUSAK
Policy `group_members` men-query `group_members` sendiri → `42P17: infinite recursion`. Karena policy `folders`, `summaries`, `profiles`, `group_folders`, `chat_messages` semuanya menyentuh `group_members`, efek dominonya bikin **`SELECT * FROM folders` ikut mati → dashboard kelihatan kosong tanpa alasan**.

➡️ File migrasi sudah memutus rantai ini pakai helper `is_group_member()` (SECURITY DEFINER). **Jangan paste `schema.sql` mentah-mentah.**

### 2.3 Lubang keamanan: siapa pun bisa jadi Max gratis
`handle_payment_callback` itu `SECURITY DEFINER` dan Postgres kasih EXECUTE ke PUBLIC secara default. Jalur eksploitasinya:
1. Checkout tier Max → `order_id` (format `NOTARA-MAX-...`) dikembalikan ke browser.
2. Panggil `.rpc('handle_payment_callback', { p_status: 'success' })` pakai anon key.
3. Jadi Max, gratis.

Trigger `protect_subscription_tier` (Bagian 6 migrasi) **tidak menutup jalur ini** — dia cuma memblokir UPDATE langsung ke tabel `profiles`.

### 2.4 Webhook Midtrans tidak pernah sampai
`middleware.ts` matcher-nya menangkap `/api/*`, dan `/api` tidak masuk `isPublicRoute` → request webhook (tanpa cookie) kena **redirect 307 ke `/login`**. Artinya **nol pembayaran pernah terkonfirmasi**.

### 2.5 Lain-lain
- **Google OAuth belum jalan** — redirect URL belum di-whitelist di Supabase (Site URL + Redirect URLs) dan Google Cloud Console (`https://<ref>.supabase.co/auth/v1/callback`). Consent screen mungkin masih mode "Testing".
- **Belum ada flow "Lupa password"** sama sekali di aplikasi (dikonfirmasi lewat grep).
- **`middleware.ts` deprecated di Next 16** — build kasih warning, sebaiknya di-rename jadi `proxy.ts`.
- **Landmine**: trigger `protect_subscription_tier` bikin `updateUserSubscriptionTier()` (`lib/db.ts:744`) gagal **senyap**. Aman sekarang (tidak dipanggil di mana pun), tapi jangan lupa.
- **`MIDTRANS_SERVER_KEY` kosong = mode MOCK senyap** — token palsu, pembayaran tidak nyata, tanpa error apa pun.

---

## 3. Rencana lanjutan (urut prioritas)

### Fase 3 — Validasi ⬅️ **KITA DI SINI**
1. Jalankan `supabase/migrations/20260719_catchup.sql` di Supabase SQL Editor.
2. Jalankan `20260719_catchup_verify.sql`. **CEK 11 paling penting** (tes rekursi RLS) — jalankan blok `BEGIN ... ROLLBACK` **sekaligus**, jangan per baris (kalau per baris, lolos palsu).
3. Setel tier lewat query di bawah file verify, refresh app, pastikan Pro/Max lepas limit.
4. Deploy ke Vercel, tes upload audio panjang (>4MB) + alur login.

**Akun testing** (trik Gmail alias, semua masuk ke inbox yang sama):
`henrynugraha1210+free@gmail.com` · `+pro@` · `+max@` — atau cukup 1 akun lalu geser `subscription_tier` lewat SQL.

**Env wajib di Vercel** (dua yang pertama harus ada **sebelum** build, karena `NEXT_PUBLIC_*` di-inline saat build):
`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `GROQ_API_KEY` · `MIDTRANS_SERVER_KEY` · `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` · `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION`

### Fase 3.5 — Rantai billing (kerjakan 4 langkah SEKALIGUS)
Jangan sepotong-sepotong, nanti malah mematikan webhook.
1. Kecualikan `/api` dari matcher `middleware.ts` (atau pindahkan webhook keluar matcher).
2. Tambah `SUPABASE_SERVICE_ROLE_KEY` ke `.env.local` + Vercel (**server-only**, jangan pakai prefix `NEXT_PUBLIC_`).
3. Ubah `app/api/webhooks/billing/route.ts` supaya pakai client service-role.
4. Jalankan `REVOKE EXECUTE ON FUNCTION public.handle_payment_callback(...)` (baris terakhir Bagian 8 file migrasi).

### Fase 4 — Pecah komponen (prasyarat redesign)
`app/dashboard/page.tsx` = **7.037 baris dalam satu file**. Ini penghalang utama redesign: skill desain kerjanya per-komponen, dikasih monolit segitu hasilnya tidak konsisten dan tiap perubahan berisiko menyenggol fitur lain.

Pecah jadi: sidebar, panel upload, tampilan rangkuman, panel chat, modal-modal, settings/billing.

### Fase 5 — Redesign
Urutannya **jangan dibalik**:
1. **`/ui-ux-pro-max` dulu** — generate design system (warna, tipografi, spacing, pattern + anti-pattern).
2. **`/frontend-design-pro` sesudahnya** — implementasi layar pakai sistem itu.

> Catatan desain: tampilan sekarang violet→fuchsia gradient di atas zinc-950 + starfield. Itu palet paling umum di produk AI, justru yang di-warning `frontend-design-pro` sebagai "AI slop". Untuk porto yang dipakai menarik klien, tampilan khas = pembeda besar.

### Backlog kecil
- Fitur "Lupa password" (`supabase.auth.resetPasswordForEmail`).
- Rename `middleware.ts` → `proxy.ts` (Next 16).
- Bedakan limit Pro vs Max (`tierLimits(tier)`).
- Ganti model deprecated di Hengs WA bot.
- Opsi masa depan: colok Gemini khusus chat scope "global" (context 1M cocok untuk tanya lintas semua kuliah).

---

## 4. Status commit

Perubahan §1.5–§1.6 (fix login, bump versi, changelog) **belum di-commit** saat dokumen ini ditulis. Saran pesan commit:

```
Notara v0.0.06: Fix post login redirect bounce and duplicate email signup

- Replace soft navigation with full document navigation after login so the session cookie is present on the first request and middleware stops bouncing to a public page
- Drop the now unused useRouter import and declaration from the login page
- Detect an already registered email on signup (empty identities) and show a clear message instead of a false check your email prompt
- Carry refreshed session cookies onto both middleware redirect responses to prevent session desync
- Bump version to 0.0.06 in package.json, dashboard, and /api/version
- Renumber the initial changelog entry from 0.1.0 to 0.0.01 and add a 0.0.06 entry
- Add catch-up migration and verification scripts under supabase/migrations
```
