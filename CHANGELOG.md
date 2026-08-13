# Changelog — Nalira

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).

## [Unreleased]

Belum ada perubahan setelah kandidat rilis v0.5.1.

## [0.5.1] - 2026-08-14
### Fixed
- Thread chat yang baru dibuat mempertahankan pesan optimistis dan jawaban streaming; pemuatan riwayat kosong tidak lagi menimpa percakapan yang sedang berlangsung.
- Tombol proses Capture mengikuti status tugas yang benar-benar aktif, sehingga file berstatus `Siap diproses` tidak lagi terkunci oleh flag halaman yang tertinggal.
- Mengosongkan sesi Capture turut membersihkan hasil tertunda, dialog penyimpanan, dan posisi antrean agar upload berikutnya dimulai dari state bersih.

### Quality
- Test regresi baru melindungi pemisahan riwayat thread lokal/persisten dan derivasi status sibuk antrean Capture.
- Dua ZIP brainstorming aset privat di root diabaikan secara spesifik tanpa dibuka atau diekstrak.

## [0.5.0] - 2026-08-14
### Added
- Metering privat per akun mencatat panggilan Groq yang diterima untuk Capture, rangkuman gabungan, dan chat tanpa menyimpan audio, prompt, transkrip, rangkuman, pesan, nama file, atau alamat IP.
- Estimasi biaya memakai katalog harga berversi untuk GPT-OSS 120B dan Whisper Large v3, termasuk diskon cached input dan minimum billing audio sepuluh detik per request.
- Migration Supabase menambahkan event store privat serta RPC service-role-only yang idempoten; migration belum diterapkan ke production pada checkpoint ini.

### Changed
- Transkripsi meminta format `verbose_json` agar durasi audio berasal dari metadata provider, bukan angka yang dapat dimanipulasi browser.
- Chat tetap meneruskan byte SSE dengan backpressure sambil mengamati usage akhir bila provider mengirimkannya; stream tanpa metadata tetap tercatat dengan biaya yang belum diketahui.
- Bypass autentikasi development tidak menulis telemetry. Kegagalan metering dicatat secara aman tetapi tidak membatalkan hasil AI pengguna.

### Security
- Tabel usage berada di schema privat dengan RLS aktif dan tanpa akses tabel langsung bagi public, anon, authenticated, maupun service role; penulisan hanya melalui satu RPC `SECURITY DEFINER` ber-`search_path` kosong.
- Event hanya membawa identitas user, operasi, tahap provider, model, request ID, metrik numerik, versi harga, dan waktu server.

### Quality
- Test baru melindungi parsing usage, cached-token pricing, minimum biaya Whisper, model tanpa harga, SSE terpotong/cancel, fail-soft recorder, idempotensi, serta privilege dan batas privasi migration.

## [0.4.1] - 2026-08-14
### Changed
- Harga peluncuran diseragamkan menjadi Pro Rp49.000/bulan dan Max Rp99.000/bulan pada landing page, dashboard, callback lokal, serta nominal checkout Midtrans.
- Katalog paket billing terpusat sekarang menjadi satu-satunya sumber nominal, label harga, dan identitas tier untuk mencegah perbedaan harga antarmuka dan tagihan.
- README menjelaskan nama environment variable, pemisahan key Sandbox/Production, visibilitas Server Key, serta URL notifikasi dan redirect Midtrans.

### Quality
- Test baru melindungi nominal charge, harga tampilan, format `gross_amount`, serta pemetaan tier dari nominal langganan.

## [0.4.0] - 2026-08-14
### Added
- Onboarding tiga langkah yang ringkas untuk memilih konteks penggunaan, institusi atau bidang opsional, dan sumber penemuan Nalira.
- Kontrol sidebar terpusat dengan status terbuka yang jelas untuk desktop dan drawer mobile.

### Changed
- Beranda sekarang memprioritaskan satu tindakan harian: melanjutkan materi aktif untuk pengguna lama atau mulai merekam dan mengunggah untuk pengguna baru.
- Empty state Beranda diringkas agar tindakan utama terlihat pada viewport pertama, dengan preview Study Canvas sebagai satu-satunya permukaan pendukung.
- Sesi yang dipulihkan langsung masuk ke ruang kerja; onboarding hanya muncul untuk profil yang secara eksplisit belum selesai.
- Penyelesaian onboarding kembali ke ruang kerja tanpa memicu tur layar penuh kedua.

### Fixed
- Pesan selamat datang layar penuh tidak lagi berulang setiap sesi Supabase dipulihkan atau tab kembali aktif.
- Tombol sidebar dapat membuka dan menutup navigasi secara konsisten, termasuk label aksesibilitas “Tutup navigasi” pada drawer mobile.

### Quality
- Perilaku post-auth, onboarding, hierarki Beranda, dialog blocking, dan kontrol sidebar dilindungi oleh test regresi baru.
- Seluruh 162 test lulus, lint bersih, dan build production berhasil.

## [0.3.20] - 2026-08-13
### Security
- Webhook Midtrans sekarang menjadi rute publik exact-match yang memakai signature SHA-512 sebagai autentikasi mesin, gagal tertutup ketika server key tidak tersedia, dan membandingkan signature secara timing-safe.
- Mutasi pembayaran berpindah ke client Supabase service-role server-only; route tidak lagi bergantung pada cookie atau sesi pengguna.
- Migration hardening mencabut akses publik/authenticated ke RPC pembayaran, mengunci tiga fungsi `SECURITY DEFINER` dengan `search_path` kosong, dan membatasi helper grup ke role authenticated.

### Changed
- Status notifikasi Midtrans divalidasi dan dinormalisasi sebelum RPC; status tidak dikenal diabaikan, status sukses tidak dapat dimundurkan, webhook berulang tidak memperpanjang periode, dan upgrade gagal tidak menghapus tier lama yang masih aktif.
- Delapan policy yang memakai helper keanggotaan grup kini ditargetkan eksplisit ke authenticated tanpa mengubah policy share rangkuman publik.

### Quality
- Test baru melindungi signature, validasi payload, pemetaan status, kegagalan konfigurasi/RPC, batas route publik, client admin server-only, grant fungsi, state transition, dan policy RLS.
- Source v0.3.20 siap direview; migration belum diterapkan dan billing production tetap tertahan sampai secret Vercel serta verifikasi rollout selesai.

## [0.3.19] - 2026-08-13
### Security
- Endpoint Capture, rangkuman transkrip gabungan, dan chat kini memvalidasi sesi Supabase kembali di route sebelum membaca input atau menghubungi Groq.
- Rate limit atomik per pengguna membatasi Capture 30, rangkuman 10, dan chat 30 permintaan per jendela 10 menit melalui RPC Supabase dengan hak akses minimum.
- Request API tanpa sesi kini menerima JSON 401; kuota habis menerima 429 beserta Retry-After, sedangkan kegagalan limiter berhenti aman dengan 503.

### Quality
- Bypass autentikasi lokal tetap dibatasi ke development dan tidak menyentuh Supabase ketika aktif.
- Kontrak auth, rate limit, migration, proxy, dan urutan guard dilindungi test baru tanpa mengubah prompt, model, chunking, UI, billing, atau subscription.

## [0.3.18] - 2026-08-13
### Changed
- Dua avatar pengguna dinamis dan QR autentikasi dua faktor sekarang memakai komponen next/image dengan dimensi intrinsik eksplisit.
- Sumber eksternal dan data URL tetap memakai mode unoptimized agar tidak mengubah kontrak provider atau pemuatan QR lokal.

### Quality
- Seluruh lint repository kini bersih tanpa error maupun warning.
- Ukuran visual, fallback inisial profil, kebijakan referrer avatar, alur MFA, dan sumber gambar tidak berubah.

## [0.3.17] - 2026-08-13
### Changed
- Callback suara toast, toast global, dan pemuatan billing kini memiliki identitas React yang stabil.
- Effect billing dan listener autentikasi mencantumkan callback stabil yang dipakainya sebagai dependency.

### Quality
- Dua warning react-hooks/exhaustive-deps dashboard telah dihapus; lint hanya menyisakan tiga warning optimasi gambar untuk checkpoint terpisah.
- Siklus listener auth, pemuatan profil/langganan, toast, dan callback pembayaran tetap mempertahankan perilaku sebelumnya.

## [0.3.16] - 2026-08-13
### Changed
- State kelompok belajar, anggota kelompok, dan langganan dashboard sekarang memakai kontrak StudyGroup, GroupMember, dan Subscription yang sudah dimiliki layer data.
- Kelanjutan pembayaran menyimpan snapshot token yang tervalidasi sebelum memanggil Midtrans Snap.

### Quality
- Seluruh error lint no-explicit-any repository telah dihapus tanpa menambahkan pengecualian aturan.
- Query Supabase, RLS, schema, alur Study Group, dan kontrak pembayaran tidak berubah.

## [0.3.15] - 2026-08-13
### Changed
- Batas error dashboard untuk profil, billing, MFA, chat, rekaman, mata kuliah, rangkuman, dan kelompok belajar sekarang menerima nilai unknown dan memakai helper pesan aman terpusat.

### Quality
- Baseline lint dashboard turun dari 25 menjadi tiga error no-explicit-any; sisa temuan hanya tipe data Study Group dan langganan yang dipisahkan ke checkpoint berikutnya.
- Pesan dari objek asing tidak lagi diteruskan langsung ke UI; pesan Error asli dan fallback operasional tetap dipertahankan tanpa perubahan alur Supabase, Capture, billing, atau chat.

## [0.3.14] - 2026-08-13
### Added
- Boundary tipe browser terpusat untuk Web Speech API, fallback Web Audio Safari, dan Midtrans Snap.

### Changed
- Voice input, visualizer audio, dekode audio besar, dan dua pemanggilan Snap sekarang memakai kontrak TypeScript eksplisit tanpa cast `any` lokal.

### Quality
- Baseline lint dashboard turun dari 37 menjadi 25 error `no-explicit-any`; lima warning existing tidak berubah dan tidak ada pengecualian aturan baru.
- Callback pembayaran, hasil transkripsi suara, urutan dekode audio, UI, Capture, database, RLS, dan konfigurasi provider tidak berubah.

## [0.3.13] - 2026-08-13
### Removed
- State dashboard untuk dropdown pengguna, waktu mulai panel berpikir, modal MFA lama, dan cache faktor MFA yang tidak pernah dibaca.
- Handler berbagi folder dan import database pendukung yang tidak memiliki pemanggil.

### Changed
- Pemeriksaan status MFA tidak lagi menerima objek pengguna yang tidak digunakan; deteksi faktor terverifikasi dan kebutuhan challenge AAL2 tetap dipertahankan.

### Quality
- Seluruh temuan `no-unused-vars` dashboard telah dihapus; baseline lint turun dari 38 error/12 warning menjadi 37 error/5 warning tanpa pengecualian aturan baru.
- Tampilan, logout, timer berpikir, MFA aktif, Study Group, Capture, database, RLS, billing, API, dan provider AI tidak berubah.

## [0.3.12] - 2026-08-13
### Removed
- Import ikon, helper database, tipe, catch binding, dan parameter callback pembayaran di dashboard yang tidak pernah dibaca.

### Quality
- Baseline lint dashboard turun dari 44 error/36 warning menjadi 38 error/12 warning tanpa pengecualian aturan baru.
- Perubahan dibatasi pada deklarasi yang tidak memiliki referensi runtime; tampilan, alur Capture, autentikasi, database, billing, API, dan provider AI tidak berubah.

## [0.3.11] - 2026-08-13
### Changed
- Test runner, browser/Supabase mocks, simulator aplikasi, dan Tier 1-4 tidak lagi menyimpan import, parameter, atau catch binding yang tidak digunakan.
- Simulator ekspor Word memakai ukuran Blob yang memang dibuat untuk membentuk URL tiruan, sehingga alur simulasi tetap eksplisit.

### Quality
- Seluruh test harness kini lint-clean; baseline repository turun dari 44 error/70 warning menjadi 44 error/36 warning tanpa pengecualian aturan baru.
- Seluruh temuan lint yang tersisa terisolasi di dashboard monolitik; source produksi, kontrak mock, jumlah skenario, dan hasil perilaku test tidak berubah.

## [0.3.10] - 2026-08-13
### Removed
- Dua import ikon landing page, satu ref animasi bintang, dan satu deklarasi Midtrans client key yang tidak pernah digunakan.

### Quality
- Lint terfokus pada Home, StarryBackground, dan helper Midtrans kini bersih; baseline repository turun dari 44 error/74 warning menjadi 44 error/70 warning tanpa melemahkan aturan.
- Rendering landing page, animasi parallax, kontrak billing, environment variable, database, auth, API, dan deployment tidak berubah.

## [0.3.9] - 2026-08-13
### Added
- Helper navigasi auth teruji untuk membangun URL login dan callback dengan tujuan lokal yang telah disanitasi.
- Regression test untuk tujuan public summary yang valid, path tiruan, encoded separator, dan fallback external URL.

### Changed
- Google OAuth dan verifikasi email meneruskan tujuan aman melalui parameter `next` pada callback resmi.
- Tombol fork menyimpan hanya ID pengguna bertipe `string`, bukan objek sesi bertipe `any`.

### Fixed
- Pengguna tamu yang login dari halaman public summary kini kembali ke materi yang sama untuk melanjutkan penyimpanan.
- Fork yang berhasil kini membuka `/dashboard`, sehingga hasil salinan dapat dipilih dan toast sukses dikonsumsi.
- Seluruh tautan Dashboard dan Pustaka pada halaman publik tidak lagi salah menuju landing page.
- Import ikon public summary yang tidak digunakan dihapus.

### Security
- Tujuan auth tetap menolak external URL, protocol-relative URL, encoded separator, dan path public-summary tiruan; fallback tetap `/dashboard`.
- Insert fork, RLS, schema database, migration, API, billing, provider AI, dan konfigurasi deployment tidak berubah.

## [0.3.8] - 2026-08-13
### Added
- Helper auth teruji untuk memetakan error callback dan menerjemahkan pesan Supabase tanpa mempercayai nilai tangkapan yang tidak dikenal.
- Regression test untuk error callback OAuth, kredensial tidak valid, dan fallback error asing.

### Changed
- Pesan error callback Login kini diturunkan saat state dibuat, bukan melalui pembaruan state sinkron di effect.
- Nilai error dari login Google dan email/password memakai tipe `unknown` sebelum diterjemahkan secara aman.
- Pemulihan status logout dijadwalkan setelah mount dan membersihkan timer saat halaman dilepas.

### Removed
- State, fungsi, markup, dan ikon toast Login lama yang tidak pernah dipanggil.

### Security
- Provider Google, PKCE callback, redirect allow-list contract, sign-up, sign-in, dan session navigation tidak berubah.
- Objek atau string asing yang tertangkap tidak dipantulkan sebagai pesan kepada pengguna.

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
