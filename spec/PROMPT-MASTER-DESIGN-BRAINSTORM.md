# Prompt Master — Notara UI/UX Research, Redesign, and Asset Finalization

> Dibuat: 28 Juli 2026
> Tujuan: dipakai di ChatGPT biasa/Deep Research bersama file pendukung Notara.
> Hasil riset nanti dikembalikan ke Codex untuk divalidasi dan disimpan di `docs/research/2026-07-28-notara-ui-ux-benchmark.md`.

## Cara menggunakan

1. Buat chat baru di ChatGPT yang mendukung Deep Research dan skill desain.
2. Upload file prompt ini beserta paket file pada bagian **Upload Pack**.
3. Kirim pesan singkat: `Baca PROMPT-MASTER-DESIGN-BRAINSTORM.md dan jalankan Fase 1 terlebih dahulu.`
4. Jangan meminta HTML sebelum rekomendasi Fase 1 direview.
5. Setelah arah visual dipilih, minta ChatGPT menjalankan Fase 2 dan menghasilkan prototype standalone v2.

## Upload Pack

### Wajib

1. `spec/PROMPT-MASTER-DESIGN-BRAINSTORM.md` — file ini.
2. `spec/STUDY-CANVAS.md` — kontrak UX terbaru.
3. `docs/SPEAKER-CONTEXT.md` — aturan diarization, kelas besar, dan privasi.
4. `docs/prototype/notara-study-canvas-prototype.html` — prototype interaktif versi pertama.
5. `docs/Notara_Assets/notara_logo-system_handoff_v1.md` — aturan logo dan brand lama.
6. `docs/Notara_Assets/notara_logo-system_final-direction_v1.png` — arah logo yang sudah disukai.
7. `docs/Notara_Assets/notara_icon-geometry-refinement_v1.png` — referensi geometri ikon.

### Sangat membantu

8. Screenshot dashboard production setelah login, desktop, saat satu rangkuman terbuka.
9. Screenshot state Rekam / Upload dan state processing.
10. Screenshot mobile dashboard atau mobile prototype.
11. `docs/Notara_Assets/notara_motion-spec_orbit-to-wave-loop_v1.md` jika ingin ikut memfinalisasi motion logo.
12. `docs/Notara_Assets/notara_asset-naming_manifest_v1.md` jika ingin mengaudit kelengkapan dan penamaan aset.

Jangan upload `.env.local`, API key, file credential, database export, atau rekaman/transkrip kuliah pribadi.

---

## PROMPT UNTUK CHATGPT / DEEP RESEARCH

Kamu adalah gabungan senior product designer, UX researcher, design-system architect, accessibility specialist, dan frontend prototyper. Kamu membantu saya memfinalisasi UI/UX serta aset visual produk bernama **Notara**.

Jika tersedia, gunakan skill desain dalam urutan berikut:

1. `/ui-ux-pro-max` untuk riset, information architecture, user flow, visual direction, dan design system.
2. `/frontend-design-pro` hanya setelah saya menyetujui arah desain, untuk membuat prototype HTML standalone.

Jika nama skill berbeda atau tidak tersedia, tetap jalankan proses dan standar kualitas yang sama secara manual. Jangan mengaku telah menjalankan skill yang sebenarnya tidak tersedia.

### Aturan kerja

- Kerjakan **Fase 1 terlebih dahulu** dan berhenti untuk meminta keputusan saya sebelum membuat HTML.
- Gunakan attachment sebagai sumber kontrak produk utama.
- URL production hanya digunakan untuk mengaudit keadaan sekarang, bukan sebagai satu-satunya sumber aset atau requirement.
- Jangan mengubah stack, arsitektur backend, atau scope produk tanpa menjelaskan trade-off.
- Jangan menghasilkan landing page ketika yang diminta adalah pengalaman aplikasi.
- Jangan meniru produk referensi secara literal. Ambil prinsip, bukan bentuk visual yang identik.
- Pisahkan fakta dari sumber, inferensi desain, dan rekomendasi.
- Untuk fakta eksternal yang dapat berubah, cantumkan URL sumber primer, tanggal verifikasi, dan bagian yang mendukung klaim.
- Jangan memakai blog agregator sebagai sumber utama jika dokumentasi resmi, artikel tim produk, atau penelitian primer tersedia.
- Jangan membuat atau mengganti logo final tanpa persetujuan. Geometri logo yang dilampirkan dianggap arah yang sudah disukai; yang masih terbuka adalah penerapan warna, responsivitas, motion, dan penggunaannya di UI.

## Konteks produk

Notara adalah aplikasi untuk mahasiswa Indonesia yang mengubah rekaman kuliah menjadi bahan belajar aktif.

Alur inti:

1. Pengguna merekam atau upload audio.
2. Audio ditranskripsikan.
3. AI membuat rangkuman terstruktur.
4. Pengguna membaca rangkuman, melihat transkrip, bertanya, menyimpan rumus, membuat quiz, dan membuka visualisasi konsep.

Masalah pengguna:

- Kuliah panjang dan melelahkan untuk dicatat manual.
- Rekaman sering disimpan tetapi tidak pernah diputar kembali.
- Transkrip mentah tidak cukup membantu belajar.
- Penjelasan dosen dapat bercampur dengan pertanyaan mahasiswa dan obrolan sampingan.
- Rumus yang diucapkan lewat audio mudah salah ditranskripsikan.
- Mahasiswa membutuhkan cara cepat memahami bagian sulit, bukan sekadar chatbot generik.

Target utama:

- mahasiswa Indonesia;
- menggunakan laptop saat mengolah materi dan ponsel saat review;
- kemungkinan koneksi tidak selalu cepat;
- kelas dapat berisi 30–40 orang;
- perlu UI yang mudah dipahami tanpa onboarding panjang;
- tetap menarik sebagai produk portfolio dan calon produk berbayar.

## Kondisi produk nyata

Stack production:

- Next.js 16;
- React 19;
- Tailwind CSS 4;
- Groq Whisper untuk transkripsi;
- Groq GPT-OSS 120B untuk rangkuman dan chat;
- Supabase Auth dan database;
- Midtrans untuk scaffolding billing;
- Vercel untuk deployment.

URL production yang benar:

`https://notara-hengs.vercel.app`

URL tersebut dapat digunakan untuk mengaudit landing page publik. Dashboard membutuhkan login, sehingga gunakan screenshot dan prototype attachment untuk memahami pengalaman setelah login.

Produk sudah memiliki:

- landing page;
- login Google/email;
- dashboard;
- folder/mata kuliah;
- rekam dan upload audio;
- rangkuman dan transkrip;
- chat dengan scope satu summary, satu folder, atau global;
- share page publik;
- study group;
- onboarding;
- billing scaffolding.

Audio tidak disimpan. Prinsip privasinya adalah **transcribe and discard**.

Audio panjang dipotong di browser menjadi chunk maksimal sekitar dua menit pada 16 kHz mono agar aman diproses di Vercel. Jangan mendesain UI seolah audio selalu diproses dalam satu request instan.

## Arah UX yang sudah diputuskan

Layout desktop terdiri dari tiga wilayah:

### Sidebar kiri

- Brand Notara.
- `Tanya semua materi` menjadi item utama paling atas.
- Beranda, Mata Kuliah, Dibagikan, dan daftar mata kuliah.
- Rekam / Upload berada tepat di atas profil.
- Profil berada di kiri bawah.

`Tanya semua materi` tidak boleh menjadi popup utama. Saat dipilih, area tengah berubah menjadi workspace Global Tutor lengkap.

### Area tengah — Study Canvas

Study Canvas adalah dokumen belajar aktif, bukan feed kartu.

Ia memiliki:

- Rangkuman dan Transkrip;
- heading, paragraf, callout, tabel, dan formula;
- istilah yang dapat diklik;
- pilihan teks atau formula sebagai context chip;
- jawaban inline;
- Tutor Materi permanen di bagian bawah area tengah.

Tutor Materi hanya memakai rangkuman aktif. Ia berbeda dari Global Tutor.

### Panel kanan — Learning Lab

Learning Lab bukan chat panel. Isinya:

- Konsep;
- Rumus dan Catatan;
- Visualisasi Neurova;
- Quiz;
- Speaker Context.

Neurova adalah produk saudara Notara: konsep pada rangkuman dapat diklik dan dibuka sebagai visualisasi interaktif di Neurova. Pada fase awal cukup deep-link yang jelas; jangan mengirim isi transkrip privat melalui URL.

## Dua jenis tutor

| Tutor | Scope | Lokasi |
|---|---|---|
| Tutor Materi | satu rangkuman aktif atau bagian terpilih | menyatu di tengah Study Canvas |
| Global Tutor | satu mata kuliah atau seluruh koleksi | dipilih dari sidebar dan membuka workspace tengah |

Global Tutor harus menunjukkan sumber jawaban. Tutor Materi harus menjaga pengguna tetap dekat dengan paragraf atau formula yang sedang dipelajari.

## Formula Capture

Formula tidak boleh ditampilkan sebagai kebenaran tanpa bukti. Setiap formula idealnya memiliki:

- formula yang dirender dengan KaTeX/MathJax atau renderer matematika nyata;
- ucapan asli dari transkrip;
- timestamp;
- definisi variabel;
- penjelasan;
- confidence;
- status confirmed atau needs review;
- catatan pribadi pengguna;
- tindakan Tanya rumus ini.

Rumus confidence rendah harus terlihat membutuhkan pemeriksaan.

## Speaker Context untuk kelas besar

Jangan meminta pengguna memberi label 40 orang satu per satu.

UI utama menyederhanakan hasil menjadi:

- Dosen utama;
- Pertanyaan mahasiswa;
- Obrolan sampingan.

Pertanyaan pendek tetap dipertahankan jika relevan atau dijawab oleh dosen. Obrolan sampingan, noise, dan overlap tidak masuk rangkuman utama, tetapi dapat dilihat melalui mode `Semua transkrip`.

Transkrip memiliki filter:

- Materi saja — default;
- Semua transkrip.

Notara tidak menyimpan voiceprint dan tidak mengaku mengetahui identitas personal dari suara.

## Feedback prototype pertama

Bagian yang disukai:

- struktur tiga kolom;
- Study Canvas di tengah;
- Learning Lab di kanan;
- profil di kiri bawah;
- Rekam / Upload di atas profil;
- dokumen panjang yang nyaman dibaca;
- label pembicara dapat dikoreksi;
- jawaban inline.

Bagian yang perlu diperbaiki:

- palet warm cream + forest teal belum cocok;
- Tutor Materi permanen belum terlihat di tengah;
- formula masih contoh statis, belum terasa dapat ditangkap, diperiksa, dan dicatat;
- Speaker Context belum cocok untuk kelas 40 orang;
- Tanya semua materi masih berbentuk modal dan kurang terasa sebagai workspace;
- mobile perlu memastikan composer tutor dan Learning Lab tidak menutupi isi.

## Status brand dan aset

Logo orbit-to-wave dan geometri ikon sudah disukai. Jangan membuang identitas tersebut hanya demi tren visual baru.

Palet lama banyak menggunakan violet, purple, blue, cyan, dan background hitam. Palet tersebut **bukan kewajiban untuk seluruh UI**. Hindari hasil generik “AI product” berupa violet–fuchsia gradient, glassmorphism berlebihan, glow di semua tempat, dan starfield dekoratif tanpa fungsi.

Palet warm-paper/forest-teal prototype pertama juga belum disukai karena terasa terlalu klasik.

Eksplorasi awal yang boleh dibandingkan:

1. **Cloud Ink** — cool off-white, canvas putih, deep navy, cobalt, teal/cyan; violet hanya jejak brand.
2. **Midnight Signal** — navy/charcoal, off-white, signal blue, cyan; minim glow.
3. **Soft Graphite** — graphite, cool gray, blue-teal; profesional dan netral.

Kamu boleh mengusulkan arah keempat jika riset dan kebutuhan pengguna memberikan alasan yang lebih kuat.

---

# FASE 1 — Research dan keputusan UX

Lakukan riset terarah, bukan kumpulan screenshot inspirasi.

## 1. Audit produk saat ini

Audit URL production publik, prototype HTML, kontrak Study Canvas, Speaker Context, dan asset handoff.

Pisahkan:

- yang sudah kuat;
- masalah usability;
- masalah hierarki informasi;
- inkonsistensi brand;
- fitur yang terlihat menarik tetapi berpotensi tidak terpakai;
- risiko desktop dan mobile;
- hal yang tidak dapat diverifikasi karena login atau backend.

## 2. Benchmark primer

Riset produk atau pola yang relevan seperti NotebookLM, Granola, Otter, Notion, Readwise Reader, RemNote, Quizlet, atau produk lain yang lebih cocok menurut temuanmu.

Jangan sekadar membandingkan daftar fitur. Untuk setiap referensi, analisis:

- bagaimana pengguna berpindah antara sumber, catatan, dan percakapan;
- bagaimana AI tetap kontekstual tanpa mengambil alih layar;
- bagaimana provenance/source ditampilkan;
- bagaimana long-form reading dijaga nyaman;
- bagaimana mobile menyederhanakan desktop;
- pola apa yang layak diadaptasi oleh Notara;
- pola apa yang tidak cocok untuk mahasiswa Indonesia.

Gunakan sumber primer/resmi dan cantumkan tanggal verifikasi.

## 3. Jobs to Be Done

Susun JTBD utama untuk:

- sebelum kuliah;
- saat merekam;
- ketika processing;
- setelah rangkuman selesai;
- menjelang ujian;
- ketika menanyakan satu bagian;
- ketika mencari hubungan lintas materi.

Prioritaskan pekerjaan yang benar-benar berulang. Jangan membuat fitur hanya karena terlihat futuristik.

## 4. Information architecture

Buat IA dan user flow untuk:

- dashboard kosong;
- library/mata kuliah;
- rekam/upload;
- processing panjang;
- Study Canvas;
- Tutor Materi;
- Global Tutor;
- Formula Notes;
- Speaker Context;
- Neurova;
- share;
- settings/profile;
- mobile.

Tentukan bagian yang harus menjadi page, panel, drawer, bottom sheet, inline block, atau modal. Jelaskan alasannya.

## 5. Tiga sampai empat visual direction

Untuk setiap arah berikan:

- nama;
- rationale;
- mood;
- palette dengan hex;
- typography;
- spacing dan density;
- border/radius/shadow;
- state success/warning/error;
- contoh penerapan pada sidebar, Study Canvas, Learning Lab, formula, dan speaker label;
- kelebihan;
- risiko;
- aksesibilitas dan kontras;
- kecocokan dengan logo existing.

Hindari variasi yang sebenarnya hanya mengganti warna pada layout sama. Setiap arah harus memiliki karakter yang jelas tetapi tetap usable.

## 6. Asset audit

Buat tabel:

| Asset | Status | Pertahankan/Ubah/Buat | Format produksi | Ukuran/rasio | Lokasi yang disarankan | Catatan |

Audit minimal:

- logo horizontal;
- logo compact;
- app icon;
- favicon;
- dark/light variants;
- monochrome variants;
- loading/processing motion;
- empty state;
- audio waveform;
- social preview;
- PWA icons jika dibutuhkan;
- formula/status icons;
- Neurova integration mark;
- illustration/sticker hanya jika benar-benar menambah pemahaman.

Jangan membuat aset dekoratif yang tidak memiliki fungsi. Gunakan nama file lowercase-kebab-case dan kelompokkan ke `assets/brand`, `assets/icons`, `assets/media`, atau struktur setara.

## 7. Recommendation

Berikan satu rekomendasi utama dengan trade-off yang jujur. Sertakan:

- keputusan layout;
- keputusan warna;
- keputusan typography;
- pola Tutor Materi;
- pola Global Tutor;
- pola Formula Notes;
- pola Speaker Context;
- pola mobile;
- aset yang masih perlu dibuat;
- hal yang sebaiknya ditunda.

Tutup Fase 1 dengan maksimal lima pertanyaan keputusan yang benar-benar perlu saya jawab. Jangan menghasilkan HTML sampai saya memilih arah.

---

# FASE 2 — Design system dan prototype

Jalankan hanya setelah saya menyetujui arah Fase 1.

## A. Design system

Gunakan `/ui-ux-pro-max` bila tersedia untuk menghasilkan:

- semantic color tokens;
- typography scale;
- spacing grid;
- radius, border, shadow;
- icon rules;
- motion rules;
- accessibility rules;
- desktop/tablet/mobile breakpoints;
- component states;
- anti-patterns khusus Notara.

## B. Prototype standalone

Kemudian gunakan `/frontend-design-pro` bila tersedia untuk merevisi attachment prototype menjadi:

`notara-study-canvas-v2.html`

Ketentuan:

- satu file HTML/CSS/JS;
- bukan landing page;
- tidak membutuhkan backend;
- interaksi utama benar-benar berjalan;
- data dummy berbahasa Indonesia;
- theme comparison tetap tersedia selama review;
- state desktop dan mobile realistis;
- localStorage boleh dipakai untuk catatan, theme, dan state prototype;
- gunakan SVG inline atau aset attachment, bukan gambar stok acak;
- formula dirender dengan renderer matematika nyata;
- jangan mengirim data keluar;
- jangan memakai library besar jika tidak diperlukan.

Prototype minimal harus memperlihatkan:

1. sidebar final;
2. empty/library state;
3. Rekam / Upload;
4. processing state;
5. Study Canvas;
6. Tutor Materi di tengah;
7. Global Tutor sebagai workspace;
8. Formula Notes;
9. Materi saja / Semua transkrip;
10. Speaker Context kelas besar;
11. Learning Lab;
12. Neurova deep-link simulation;
13. mobile navigation/drawer/bottom sheet;
14. theme comparison.

Sebelum menyerahkan HTML, lakukan self-audit terhadap:

- usability;
- keyboard accessibility;
- touch target;
- contrast;
- responsive overflow;
- motion reduction;
- state consistency;
- apakah setiap fitur punya tujuan belajar yang nyata.

Output Fase 2 harus berisi:

1. design-system summary;
2. asset production checklist;
3. satu blok HTML lengkap;
4. daftar keputusan yang perlu dibawa ke implementasi Next.js;
5. daftar hal yang masih disimulasikan dan belum didukung backend.

Jangan mengklaim prototype sebagai production-ready backend. Fokusnya adalah memfinalisasi pengalaman dan visual sebelum Codex memindahkannya ke kode production.
