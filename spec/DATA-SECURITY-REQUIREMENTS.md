# Data & Security Requirements — Notara

> Status: baseline keamanan dengan temuan P0 terbuka. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: `supabase/migrations/`, `middleware.ts`, route billing, dan `lib/midtrans.ts`.
> Wajib diperbarui pada setiap perubahan auth, RLS, share, webhook, secret, atau retensi data.

## Prinsip data

Notara menyimpan data akademik yang dapat bersifat pribadi: transkrip, rangkuman, pertanyaan/jawaban chat, nama folder, dan metadata profil. Audio mengikuti pola *transcribe-and-discard*: aplikasi tidak menyimpan berkas audio secara permanen pada alur saat ini. Ini tidak berarti transkrip/rangkuman otomatis hilang; keduanya adalah data tersimpan yang harus dilindungi.

## Model data dan ownership

| Entitas | Data utama | Pemilik/akses |
| --- | --- | --- |
| `profiles` | identitas akun dasar, onboarding, tier | pemilik; anggota grup tertentu dapat melihat profile sesuai policy |
| `folders` | nama, warna, ikon, `user_id` | pemilik; dapat terlihat anggota grup jika folder dibagikan |
| `summaries` | transkrip, rangkuman, metadata, share state | pemilik; publik jika `is_public=true`; anggota grup jika folder dibagikan |
| `chat_threads`, `chat_messages` | riwayat percakapan | pemilik thread atau konteks summary/folder yang dibagikan sesuai policy |
| `study_groups`, `group_members`, `group_folders` | grup, keanggotaan, relasi folder | owner/anggota sesuai policy |
| `subscriptions` | order id, Snap token, status, nilai, periode | pemilik dapat melihat/membuat/update barisnya; perubahan tier harus dikendalikan webhook |

Migrasi catch-up mengaktifkan RLS pada sembilan tabel dan memakai `is_group_member()` sebagai helper `SECURITY DEFINER` untuk menghindari rekursi policy. Cleanup 27 Juli 2026 menghapus lima policy legacy, termasuk tiga `Allow all`; hasil yang dicatat adalah 21 policy dan nol policy `Allow all`.

## Privasi dan share

- Ringkasan publik adalah opt-in melalui `is_public`. Karena summary mengandung transkrip, pengguna harus diperingatkan bahwa membuatnya publik mengekspos isi transkrip dan rangkuman.
- Fork harus membuat salinan milik pengguna baru dengan share state nonpublik.
- Speaker Context masa depan tidak boleh menyimpan voiceprint, embedding suara, atau menyatakan nama/identitas dari suara. Lihat [SPEAKER-CONTEXT.md](../docs/SPEAKER-CONTEXT.md).
- Data tidak boleh dimasukkan ke prompt eksternal lebih dari context yang diminta pengguna; chat global saat ini membangun context di client dan perlu batas/logging yang lebih baik.
- Tidak ditemukan kebijakan retensi formal, delete-account flow, data export pribadi, backup/restore policy, maupun audit log. Jangan mengklaim compliance tertentu sebelum kebijakan/operasi tersebut ada.

## Secret handling

- `GROQ_API_KEY` dan `MIDTRANS_SERVER_KEY` adalah server-only; jangan pernah memakai prefix `NEXT_PUBLIC_`.
- Supabase anon key memang dipakai browser, tetapi keamanannya bergantung pada RLS dan bukan alasan untuk membuka tabel/function.
- `SUPABASE_SERVICE_ROLE_KEY` diperlukan untuk webhook setelah desain service-role dibuat; ia tidak boleh berada di client, log, dokumentasi, atau response API.
- `.env*` di-ignore. Rotasi secret diperlukan jika pernah terekspos di commit, tangkapan layar, atau log.

## Threat model dan security gap

| Severity | Temuan berbasis kode | Risiko | Mitigasi wajib |
| --- | --- | --- | --- |
| **P0 — kritis** | `handle_payment_callback` adalah `SECURITY DEFINER`; grant execute default/public belum dicabut. | Pengguna yang mengetahui order id berpotensi mengubah status sukses dan tier tanpa pembayaran. | Setelah webhook memakai service role, cabut execute dari `PUBLIC`, `anon`, dan `authenticated`; uji bahwa hanya jalur server webhook dapat memanggil function. |
| **P0 — kritis** | `middleware.ts` menangkap `/api/*`; webhook tanpa cookie dialihkan ke `/login`. | Midtrans tidak dapat mengonfirmasi pembayaran; status/tier tidak konsisten. | Allowlist webhook/API secara eksplisit, lalu auth setiap API aplikasi di route masing-masing. Uji callback sandbox end-to-end. |
| **P0 — kritis** | `verifyMidtransSignature` menerima semua signature jika server key kosong/dummy; checkout juga menghasilkan token mock. | Konfigurasi salah dapat terlihat seperti pembayaran sukses. | Fail closed untuk target production: deployment check menolak key kosong/dummy, dan mode mock dibatasi local test. |
| **P1 — tinggi** | AI routes tidak memeriksa user di route dan tidak memiliki rate limit. | Setelah `/api` dibebaskan untuk webhook, endpoint dapat disalahgunakan untuk biaya Groq/data prompt. | Auth/ownership eksplisit, body limit/schema validation, rate limit per user/IP, quota server-side, dan logging aman. |
| **P1 — tinggi** | RLS live sudah dibersihkan, tetapi `schema.sql` historis mengandung urutan/policy lama. | Operator baru dapat memasang konfigurasi yang rusak atau kurang aman. | Jadikan migrasi versioned satu-satunya jalur setup; tandai schema historis atau ganti setelah migrasi canonical matang. |
| **P1 — tinggi** | Chat global mengirim konteks terpilih dari browser ke API, tanpa provenance/limit yang kuat. | Data terlalu banyak/keliru masuk prompt dan jawaban sulit diaudit. | Batasi ukuran/context, pilih server-side dengan ownership check, tampilkan sumber jawaban, tambah audit event non-PII. |
| **P2 — sedang** | Tidak ada audit log, retention/back-up/delete-account policy, atau incident runbook. | Investigasi insiden dan hak pengguna lemah. | Tetapkan kebijakan, owner operasional, export/delete data, dan prosedur recovery. |
| **P2 — sedang** | `next.config.ts` menonaktifkan TLS verification di non-production. | Kebiasaan konfigurasi berisiko dapat terbawa ke lingkungan salah. | Hapus setelah penyebab sertifikat lokal diperbaiki; pastikan production tidak terpengaruh. |

## Rantai billing aman yang diwajibkan

Keempat langkah berikut satu paket, tidak boleh dirilis setengah jalan:

1. Atur matcher/allowlist agar webhook dapat masuk tanpa sesi, tanpa sekaligus membuka API AI.
2. Buat Supabase service-role client khusus server; simpan key di environment server-only.
3. Jalankan webhook dengan service-role client setelah signature Midtrans tervalidasi dan status/order diverifikasi.
4. Cabut `EXECUTE` function callback dari `PUBLIC`, `anon`, dan `authenticated`; verifikasi anon tidak dapat memanggilnya.

Lanjutkan dengan idempotency webhook, validasi order/amount/status transition, logging request terredaksi, replay protection bila tersedia, serta test sandbox yang mencakup success/pending/deny/expire dan callback duplikat.

## Acceptance criteria keamanan

- Migration verification memperlihatkan RLS aktif dan tidak ada `Allow all` policy.
- Dua akun terpisah tidak dapat membaca/mengubah summary, chat, profile, atau subscription satu sama lain kecuali share/group yang disengaja.
- Summary publik dapat dibaca tanpa login hanya ketika memang public; summary privat tidak dapat ditebak melalui slug.
- API AI menolak user tanpa sesi/ownership dan dibatasi terhadap abuse setelah matcher diperbaiki.
- Webhook sandbox valid mengubah status/tier sekali; signature invalid, callback duplikat, dan RPC dari anon ditolak.
- Tidak ada key/transkrip pribadi pada repo, error response, test fixture publik, atau log yang bertahan.
