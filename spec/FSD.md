# Functional Specification Document — Notara

> Status: perilaku MVP yang diimplementasikan, kecuali bagian future yang ditandai. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: `app/dashboard/page.tsx`, `app/login/page.tsx`, `app/s/[slug]/`, dan `lib/db.ts`.
> Perbarui saat state UI, data yang berubah, atau izin alur berubah.

## Onboarding dan login

| Aspek | Spesifikasi |
| --- | --- |
| Trigger | Pengunjung membuka `/login`; pengguna baru masuk dashboard. |
| Validasi | Email/password melalui Supabase; OAuth callback menangani cancel, code habis, dan error exchange. |
| State | form loading, pesan error/cancel, redirect dokumen penuh ke dashboard setelah sesi tersedia. |
| Data | Supabase Auth; profile dibuat oleh trigger database dan onboarding memperbarui profile pengguna. |
| Izin/edge case | Middleware melindungi dashboard; bypass hanya boleh pada `NODE_ENV=development`. Reset password belum ada. |

## Rekam, unggah, chunking, dan rangkuman

| Aspek | Spesifikasi |
| --- | --- |
| Trigger | Rekam browser atau pilih/drop file, lalu submit. |
| Validasi | Cek tier, limit bulanan free (5), limit folder free (3), ukuran langsung maksimal 150 MB, serta ketersediaan audio. |
| Pemrosesan kecil | `POST /api/summarize` menerima multipart file; menghasilkan transkrip dan rangkuman. |
| Pemrosesan besar | Di atas 4 MB: browser decode/resample mono 16 kHz, memotong sekitar 2 menit, mengirim tiap chunk dengan `transcribeOnly=true`, menggabungkan teks, lalu memanggil `/api/summarize-transcript` sekali. |
| State | izin mikrofon, recording/pause/stop, timer, antrean, thinking/progress, error, dan modal pilih folder simpan. |
| Data | Audio tidak disimpan. Setelah sukses, `summaries` menyimpan title, file name, durasi, transkrip, rangkuman, jumlah kata, folder, dan user id. |
| Edge case | Audio sunyi/error Groq menampilkan error; processing gagal tidak boleh menghasilkan summary parsial. File besar dapat gagal di perangkat lemah karena decode di browser. |

## Dashboard, folder, dan rangkuman

| Trigger | Tindakan pengguna |
| --- | --- |
| Load | Login memuat folders, summaries, profile, subscription, grup, dan pilihan terakhir. |
| Operasi | Buat/edit/hapus folder; pilih filter; rename/pindah/hapus rangkuman; ekspor Word; unduh audio lokal bila masih ada di sesi. |
| Izin | Client mengirim query ke Supabase dengan sesi pengguna; RLS adalah batas otoritatif. |
| State | toast untuk sukses/error, modal konfirmasi operasi destruktif, empty/filtered state. |
| Edge case | Folder yang dihapus membuat FK summary menjadi null; summary yang dihapus menghapus data chat terkait melalui FK. |

## Chat

| Aspek | Spesifikasi |
| --- | --- |
| Trigger | Pengguna mengetik pesan dalam panel chat lalu mengirim. |
| Scope | `summary` memakai satu transkrip; `folder` menggabungkan transkrip folder; `global` membangun daftar folder dan memilih sampai tiga ringkasan dengan keyword heuristik. |
| State | thread dibuat otomatis saat pesan pertama, user message optimistis, placeholder assistant, teks stream, error inline. |
| Data | `chat_threads` dan `chat_messages`, dengan summary id nullable untuk global. |
| Edge case | Gagal simpan chat tidak membatalkan jawaban UI; stream tidak tersedia menghasilkan error; jawaban dapat memakai pengetahuan umum bila sumber tidak cukup. |

## Share, fork, dan study group

| Flow | Trigger, izin, dan perubahan data |
| --- | --- |
| Share | Pemilik toggle `is_public`; aplikasi menggunakan slug publik. Halaman `/s/[slug]` dibaca berkat policy public summary. Pengguna harus sadar bahwa transkrip/rangkuman pada summary publik dapat dibaca publik. |
| Fork | Pengguna login memilih fork pada share page; server/client membuat ringkasan baru milik user dengan public state nonaktif. |
| Group | Pengguna membuat grup (menjadi owner/member), bergabung memakai invite code, melihat anggota, membagikan folder, atau keluar. Akses diputuskan RLS dan helper `is_group_member`. |

## Billing checkout dan webhook

| Aspek | Perilaku yang ada | Batas rilis |
| --- | --- | --- |
| Checkout | `POST /api/billing/checkout` cek sesi, pilih `pro`/`max`, mencari subscription aktif/pending, membuat Snap token, lalu upsert invoice pending. | UI/route ada; transaksi nyata belum dianggap valid tanpa konfigurasi key dan webhook aman. |
| Webhook | Memverifikasi signature, memetakan status Midtrans, memanggil `handle_payment_callback`. | Saat audit, middleware mengalihkan `/api/*` tanpa sesi ke login. Ini membuat callback tidak sampai; jangan aktifkan production billing. |
| Tier | DB menyimpan `free/pro/max`; UI terutama menggunakan paid vs free. | RPC SECURITY DEFINER masih perlu dicabut dari PUBLIC dan webhook harus memakai service role server-only. |

## Study Canvas — future, belum diimplementasikan

Study Canvas bukan perubahan kosmetik dashboard. Targetnya: dokumen utama di tengah, Tutor Materi inline untuk ringkasan aktif, Global Tutor sebagai workspace dari sidebar, Learning Lab di kanan, Formula Notes dengan bukti transkrip, serta Speaker Context yang jujur terhadap kemampuan provider. Semua detail kontrak ada di [STUDY-CANVAS.md](STUDY-CANVAS.md) dan [SPEAKER-CONTEXT.md](../docs/SPEAKER-CONTEXT.md). Tidak ada tabel, route, diarization, LaTeX renderer, atau UI production untuk ini saat audit.
