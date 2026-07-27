# Software Requirements Specification — Notara

> Status: baseline sistem MVP. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: `app/`, `lib/`, `supabase/migrations/`, dan `test/`.
> Perbarui saat requirement, acceptance criterion, atau constraint berubah.

## 1. Aktor

| Aktor | Hak utama |
| --- | --- |
| Pengunjung | melihat landing dan ringkasan yang sengaja dipublikasikan |
| Pengguna terautentikasi | mengelola data pribadi, rekaman/rangkuman, chat, folder, grup, dan checkout |
| Anggota study group | melihat materi/folder yang dibagikan sesuai RLS |
| Midtrans | mengirim notifikasi pembayaran ke endpoint webhook |
| Sistem AI Groq | mentranskripsi, merangkum, dan menjawab chat; bukan penyimpan data aplikasi |

## 2. Kebutuhan fungsional

| ID | Requirement | Kriteria penerimaan sistem |
| --- | --- | --- |
| FR-01 | Sistem menyediakan email/password dan OAuth Google lewat Supabase. | Sesi berhasil membawa pengguna ke dashboard; kegagalan OAuth menampilkan state login yang aman. |
| FR-02 | Pengguna dapat menyelesaikan onboarding dan memperbarui profilnya sendiri. | Perubahan hanya mengenai profile pemilik sesuai RLS. |
| FR-03 | Pengguna dapat merekam dari browser atau memilih satu/lebih berkas untuk diproses. | Izin mikrofon ditangani; state loading/error dapat dipahami. |
| FR-04 | Sistem mentranskripsi Bahasa Indonesia dan membuat rangkuman. | Audio sunyi, file hilang, key hilang, atau respons provider gagal menghasilkan error terkontrol. |
| FR-05 | Berkas besar diproses melalui chunk browser; rangkuman final dibuat satu kali dari transkrip gabungan. | Potongan tidak dirangkum satu per satu dan progress per chunk terlihat. |
| FR-06 | Pengguna dapat menyimpan, memindahkan, mengganti judul, dan menghapus rangkuman/folder miliknya. | Operasi data tunduk pada `user_id` dan RLS. |
| FR-07 | Pengguna dapat mengirim chat dengan scope summary/folder/global dan menerima stream jawaban. | Pesan serta jawaban yang selesai disimpan pada thread aktif bila database tersedia. |
| FR-08 | Pemilik dapat membuat rangkuman publik dan pengguna login dapat fork. | Share hanya terbuka ketika `is_public=true`; fork menjadi data privat pemilik baru. |
| FR-09 | Pengguna dapat membuat/bergabung/keluar dari study group dan membagikan folder. | Akses anggota mengikuti policy RLS grup/folder. |
| FR-10 | Sistem menampilkan tier dan checkout. | Hanya pengguna bersesi dapat membuat checkout; perubahan tier production hanya dari webhook tervalidasi setelah security gap ditutup. |

## 3. Kebutuhan non-fungsional

### Keamanan dan privasi

- Semua tabel inti harus menggunakan RLS; policy permissive lama tidak boleh hadir bersama policy ownership.
- Audio tidak disimpan oleh aplikasi setelah proses; transkrip/rangkuman/chat adalah data pengguna yang tetap dilindungi oleh ownership/RLS.
- Secret hanya di server environment; tidak ada API key di client, log, dokumen publik, atau response error.
- Endpoint webhook harus dapat menerima callback tanpa cookie, tetapi tidak boleh dapat menaikkan tier melalui anon/authenticated RPC.

### Performa dan ketahanan

- Proses file kecil berjalan via satu request; file >4 MB dibagi untuk menghindari limit body Vercel sekitar 4,5 MB.
- UI menolak file >150 MB untuk mengurangi risiko memori browser; batas ini bukan pengganti queue/background job.
- Chat memakai SSE dan UI harus tetap dapat pulih bila stream putus.
- Dependency pihak ketiga (Groq, Supabase, Midtrans) dapat gagal; UI/API harus mengembalikan error yang dapat ditindak, bukan silent success.

### Aksesibilitas dan pengalaman

- Alur inti harus dapat digunakan dengan keyboard, label yang dapat dibaca pembaca layar, fokus jelas, dan state loading/error yang eksplisit.
- Informasi tidak boleh hanya dibedakan dengan warna. Kontrol sentuh pada mobile harus memadai dan layout tidak menutup composer/isi dokumen.
- Rangkuman Markdown harus mempunyai fallback teks yang aman untuk ekspor/share; rumus belum didukung renderer nyata.

### Deployment dan observability

- Runtime harus kompatibel dengan Next.js/Vercel dan batas request serverless.
- Tidak ada CI/CD maupun telemetry terstruktur yang ditemukan. Sebelum feature berisiko diluncurkan, tambahkan check build/test, logging terstruktur tanpa PII, dan indikator error provider.

## 4. Data retention dan error handling

- Audio: diproses in-memory/request lalu dibuang; tidak ada storage audio pada alur saat ini.
- Transkrip, rangkuman, folder, profile, chat, group, dan subscription: tersimpan di Supabase sampai pengguna menghapus data terkait atau kebijakan retensi formal dibuat.
- Tidak ada kebijakan backup/retensi pengguna, audit log, export/delete-account flow, atau incident procedure yang ditemukan; semuanya adalah requirement operasional yang belum terpenuhi.

## 5. Acceptance criteria rilis sistem

Sebuah rilis MVP aman hanya jika: build/lint/test relevan lulus; login dan satu alur audio → rangkuman diuji pada environment target; RLS diverifikasi tanpa `Allow all`; share publik dan fork diuji dengan akun berbeda; error Groq ditampilkan aman; serta billing **dibiarkan non-production** atau seluruh mitigasi P0 pada dokumen security telah diuji sandbox end-to-end.
