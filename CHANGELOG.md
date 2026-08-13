# Changelog — Nalira

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).

## [Unreleased]

Belum ada perubahan setelah kandidat rilis v0.3.7.

## [0.3.7] - 2026-08-13
### Changed
- Dashboard Tour menjadwalkan pengukuran layout melalui animation frame dan membatalkan pekerjaan tertunda saat unmount atau resize.
- Progress Toast memakai transform terakselerasi alih-alih menganimasikan lebar layout, serta membersihkan animation frame aktif dengan benar.
- Pemeriksaan versi awal dijadwalkan setelah mount dan kontrak prop versi yang tidak digunakan dihapus.

### Fixed
- Tiga pelanggaran React hooks/purity pada Dashboard Tour, Toast, dan Version Update Banner.
- Easing banner pembaruan tidak lagi memakai gerak memantul.

### Security
- Tidak ada perubahan autentikasi, database, RLS, billing, provider AI, maupun kontrak API.

## [0.3.6] - 2026-08-12
### Added
- Helper batas API teruji untuk menormalkan riwayat chat dan mengambil pesan error secara aman dari nilai `unknown`.
- Regression test untuk input riwayat chat yang rusak, pembatasan role pesan, dan fallback error API.

### Changed
- Route chat dan rangkuman tidak lagi memakai tipe `any` pada riwayat pesan maupun error yang ditangkap.
- Test harness CommonJS kini mendapat konfigurasi ESLint Node yang terlokalisasi tanpa melemahkan aturan aplikasi produksi.

### Fixed
- Riwayat chat yang bukan array atau berisi entri tanpa konten string kini diabaikan dengan aman; role dari klien selain `user` tidak dapat menjadi system prompt.
- Route billing tidak lagi menyimpan variabel error yang tidak digunakan.

## [0.3.5] - 2026-08-12
### Fixed
- Next.js kini memakai konvensi `proxy.ts` untuk boundary autentikasi tanpa mengubah perilaku callback, session refresh, atau proteksi route.
- Turbopack dikunci ke root project Nalira sehingga tidak lagi salah memilih lockfile workspace induk.
- Development tidak lagi mematikan verifikasi sertifikat TLS secara global.
- ESLint tidak lagi memindai artefak QA privat dan profil Chrome yang memang diabaikan Git.

### Added
- Regression test untuk konvensi Proxy Next.js 16, root Turbopack, keamanan TLS, dan batas source ESLint.

## [0.3.4] - 2026-08-12
### Fixed
- Endpoint `/api/version` kini memakai versi dari `package.json`, sama seperti `/api/health`, sehingga metadata rilis tidak dapat tertinggal karena environment lama.
- Warning variabel route middleware yang tidak digunakan dihapus.

### Added
- Regression test untuk memastikan environment `NEXT_PUBLIC_APP_VERSION` tidak dapat menimpa versi canonical package.

## [0.3.3] - 2026-08-12
### Fixed
- Endpoint operasional `/api/health` dan `/api/version` dapat dipantau tanpa login.
- Dashboard serta API chat dan rangkuman tetap terlindungi oleh autentikasi Supabase.

## [0.3.2] - 2026-08-12
### Added
- Compact ambient header terpusat untuk Mata Kuliah, Dibagikan, Capture, dan Tanya Nalira.
- Visual kontekstual berupa learning landscape, arus pengetahuan, transformasi sinyal-ke-catatan, dan context convergence.

### Changed
- Header Dibagikan kini mengubah arah gerak sesuai filter; Capture membedakan mode Upload dan Rekam tanpa mengubah pipeline.
- Header operasional kini satu keluarga dengan Beranda, namun tetap lebih ringkas dan berorientasi tugas.
- Animasi memakai transform/opacity ringan, responsif pada mobile, dan berhenti saat reduced motion aktif.

## [0.3.1] - 2026-08-12
### Fixed
- Metadata versi package, badge aplikasi, dan status akun kini memakai versi rilis yang sama.
- Drawer mobile membuat workspace di belakangnya inert untuk keyboard dan pembaca layar selama navigasi terbuka.
- Target sentuh pencarian dan kontrol sidebar mobile kini minimal 44 piksel, termasuk tindakan mata kuliah dan kelompok belajar.
- Ikon folder default yang rusak akibat encoding dipulihkan.

## [0.3.0] - 2026-08-12
### Added
- Komponen visual terpusat untuk brand mark, wordmark, lockup, recording, processing, empty state, dan ambient artwork.

### Changed
- App Shell, Home, Mata Kuliah, Dibagikan, Capture, dan Processing dipoles sebagai fondasi produk Nalira yang responsif dan aksesibel.
- Hook komponen dibuat brand-neutral agar arah produk terintegrasi dapat masuk tanpa refactor besar setelah prototype v4.2 disetujui.

## [0.2.0] - 2026-08-11
### Added
- Kontrak identitas terpusat untuk nama publik Nalira, nama asisten, deskripsi produk, runtime service, dan canonical URL yang aman.
- Facade `NaliraBrand` dengan re-export kompatibilitas dari komponen brand legacy.
- Tes regresi yang mencegah nama publik lama muncul kembali pada source yang berhadapan dengan pengguna.

### Changed
- Seluruh copy pengguna, metadata, halaman berbagi, status Capture, dan persona prompt AI kini memakai identitas Nalira.
- Metadata memakai `NEXT_PUBLIC_SITE_URL` yang dinormalisasi, dengan domain Vercel legacy sebagai fallback aman.
- Versi aplikasi disinkronkan ke `0.2.0`; identifier teknis legacy tetap dipertahankan untuk kompatibilitas.

## [0.1.1] - 2026-08-09
### Added
- Endpoint publik `/api/health` yang dangkal, non-cacheable, dan hanya mengembalikan status runtime, versi, build ID publik, serta timestamp.
- Tes sanitasi payload health agar environment secret tidak terekspos.

## [0.1.0] - 2026-08-04
### Added
- App Shell adaptif dengan sidebar desktop/compact/mobile, utility topbar, skip link, serta tema System/Light/Dark berbasis token semantik.
- Workspace Home, Mata Kuliah, Dibagikan, Tanya Notara, dan Capture yang tetap memakai data serta kontrak backend existing.
- Fondasi Study Canvas, Study Dock, dan Learning Lab dengan fallback jujur untuk kemampuan AI yang belum tersedia.
- Adapter rekomendasi belajar deterministik berbasis materi terbaru yang dapat diganti setelah kontrak Learning System dikunci.
- Model state capture per file untuk status antrean, tahap pemrosesan, progress terukur, hasil terminal, error, dan kelayakan retry.
- Baris antrean aksesibel dengan metadata audio/video, tujuan penyimpanan, aksi Ganti/Hapus, ringkasan antrean, status sukses/gagal, dan retry per item.
- Test deterministik untuk kebijakan file/tier, transport upload, transisi task, retry, preservation hasil item lain, dan fallback belajar.

### Changed
- Home, Study Canvas, dan Capture kini memakai hierarki editorial yang tenang; Capture diposisikan sebagai utilitas belajar, bukan hero pemasaran.
- Drag-and-drop kini membedakan file valid dan tidak valid, menolak format yang tidak didukung atau ukuran di atas 150 MB, dan mempertahankan batas tiga file sekuensial.
- Upload direct memakai progress byte dari browser tanpa mengubah endpoint. Flow berkas besar tetap memakai decode/resample dan chunk existing, lalu merangkum transkrip gabungan.
- Progress pemrosesan tidak lagi memakai persentase berbasis tebakan waktu. Persentase hanya ditampilkan untuk byte upload atau bagian rekaman yang benar-benar selesai.
- Proses browser-bound kini menjelaskan agar tab tetap dibuka dan memunculkan peringatan native saat tab ditutup atau dimuat ulang di tengah pekerjaan.
- Kegagalan satu item tetap berada pada item tersebut; retry mengulang file itu dari awal dan mempertahankan hasil sibling yang sudah sukses.

### Fixed
- Alur Supabase OAuth kini memulihkan callback yang sempat jatuh ke homepage dan selalu mengarah ke `/dashboard` melalui tujuan same-origin yang tervalidasi.
- Drawer mobile yang tertutup tidak lagi dapat difokuskan atau diinteraksikan, sementara focus trap, Escape, dan pengembalian fokus tetap bekerja saat drawer dibuka.
- Search palette kini memiliki semantics dialog, nama kontrol, focus containment, dan pengembalian fokus yang aksesibel.
- Target sentuh shell/Study Canvas serta label dan metadata autofill form login diselaraskan dengan kontrak aksesibilitas.

## [0.0.06] - 2026-07-19
### Added
- `lib/ai.ts` sebagai satu sumber ID model Groq (`GROQ_LLM_MODEL`, `GROQ_STT_MODEL`), supaya deprecation model berikutnya cukup diubah di satu tempat.
- Deteksi email yang sudah terdaftar saat pendaftaran (`identities` kosong), supaya tidak lagi memunculkan pesan "cek email" palsu.

### Changed
- Route `/summarize`, `/summarize-transcript`, dan `/chat` mengambil ID model dari `lib/ai.ts` (sebelumnya hardcode `llama-3.3-70b-versatile` yang sudah dideprecate Groq).
- Label mesin AI di dashboard dari "Gemini Pro" menjadi "Groq (GPT-OSS 120B)".
- Navigasi setelah login memakai navigasi dokumen penuh, bukan soft navigation.

### Fixed
- Unggahan audio panjang gagal di Vercel: potongan audio kini di-resample ke 16kHz mono, durasi potongan dari 3 menit menjadi 2 menit, dan ambang potong dari 20MB menjadi 4MB agar tetap di bawah batas body 4.5MB.
- Tier langganan tidak pernah aktif: enam pemeriksaan `isPro` yang dipaku `false` kini membaca `subscription_tier` lewat `profileTier`.
- Kedipan halaman publik setelah login, akibat race propagasi cookie sesi Supabase SSR dan cookie yang hilang saat middleware melakukan redirect.

### Removed
- Dependensi `@google/generative-ai` yang tidak pernah dipakai.

## [0.0.01] - 2026-06-24
### Added
- Titik awal pencatatan changelog. Next.js initialized, API key (Groq Whisper + Gemini) configured. Siap development frontend.

> Catatan: entri ini dulu ditulis `[0.1.0]` (angka seed dari `KONVENSI-VERSI.md`), padahal aplikasinya sejak awal memakai skema `0.0.0x`. Dinomori ulang 19 Jul 2026 supaya urutannya konsisten.
