# Notara — Study Canvas Product Contract

> Status: arah UX disetujui setelah audit prototype pertama pada 28 Juli 2026.
> Implementasi production belum dimulai.

## 1. Tujuan

Study Canvas mengubah halaman rangkuman dari “hasil AI yang dibaca” menjadi ruang belajar aktif. Pengguna dapat membaca, bertanya pada bagian tertentu, mencatat rumus, memeriksa sumber transkrip, dan membuka alat belajar tanpa kehilangan posisi di dokumen.

Analogi produknya: bagian tengah adalah buku catatan dan tutor privat dalam satu meja. Sidebar kiri adalah pintu menuju koleksi dan percakapan global. Panel kanan adalah kotak alat belajar.

## 2. Tata letak yang dikunci

### Sidebar kiri

Urutan desktop:

1. Brand Notara.
2. **Tanya semua materi** sebagai tindakan utama paling atas.
3. Beranda, Mata Kuliah, dan Dibagikan.
4. Daftar mata kuliah.
5. **Rekam / Upload** tepat di atas profil.
6. Profil pengguna di kiri bawah.

`Tanya semua materi` bukan modal. Ketika dipilih, area tengah berubah menjadi workspace percakapan global lengkap dengan riwayat, sumber, dan input. Sidebar tetap terlihat agar pengguna memahami bahwa ia berpindah mode, bukan membuka popup sementara.

### Area tengah

Area tengah tetap menjadi fokus utama dan memiliki dua mode:

- **Study Canvas** untuk satu rangkuman aktif.
- **Global Tutor** untuk pertanyaan lintas rangkuman/mata kuliah.

Pada Study Canvas tersedia:

- tab Rangkuman dan Transkrip;
- dokumen materi yang nyaman dibaca;
- istilah, rumus, dan kutipan yang dapat dipilih;
- jawaban inline di dekat konteks asal;
- composer **Tutor Materi** yang menetap di bagian bawah area tengah tanpa menutupi isi.

Tutor Materi selalu memiliki scope rangkuman aktif. Saat pengguna memilih teks, rumus, atau kutipan, composer menerima context chip seperti `Rumus Gradient Descent · 08:14`. Jawaban dimasukkan di bawah bagian terkait dan tetap dapat diciutkan.

### Panel kanan — Learning Lab

Panel kanan bukan chatbot. Isinya alat bantu materi aktif:

- Konsep;
- Rumus & Catatan;
- Visualisasi Neurova;
- Quiz;
- Konteks Pembicara.

Panel boleh mengikuti bagian dokumen yang sedang aktif, tetapi tidak mengambil alih ruang baca.

## 3. Dua jenis percakapan

| Percakapan | Lokasi | Scope | Bentuk hasil |
|---|---|---|---|
| Tutor Materi | Tengah, menyatu dengan Study Canvas | Satu rangkuman aktif dan konteks terpilih | Jawaban inline + thread materi |
| Tanya semua materi | Item teratas sidebar, membuka workspace tengah | Folder atau seluruh koleksi pengguna | Percakapan penuh dengan kutipan sumber |

Tidak ada command palette atau dialog global sebagai jalur utama. Shortcut keyboard boleh tetap ada, tetapi hanya membuka workspace Global Tutor yang sama.

## 4. Formula Capture dan Catatan Rumus

Notara harus membedakan “rumus yang terdengar di audio” dari “rumus yang sudah dipastikan benar”. Audio matematika mudah salah ditranskripsikan, jadi setiap formula perlu menyimpan bukti dan confidence.

Kontrak data awal:

```ts
interface FormulaNote {
  id: string;
  raw_utterance: string;
  normalized_latex: string | null;
  plain_text: string;
  explanation: string;
  variables: Array<{ symbol: string; meaning: string }>;
  source_segment_ids: string[];
  confidence: 'high' | 'medium' | 'low';
  review_status: 'confirmed' | 'needs_review' | 'rejected';
  user_note?: string;
}
```

Perilaku produk:

1. AI mendeteksi kandidat rumus dari transkrip dan konteks kuliah.
2. Formula dirender dengan library matematika nyata pada production, bukan rangkaian karakter Unicode buatan tangan.
3. Pengguna dapat membuka **Periksa sumber**, melihat ucapan asli dan timestamp.
4. Formula ber-confidence rendah diberi label **Perlu dicek**.
5. Pengguna dapat memperbaiki formula, menambahkan catatan pribadi, atau menyimpannya ke Catatan Rumus.
6. Tutor Materi dapat menerima formula sebagai context chip.

Renderer production saat ini belum mendukung LaTeX/KaTeX. `renderMarkdown()` hanya menangani heading, inline style, list, dan table. Dukungan formula adalah pekerjaan teknis terpisah dan harus konsisten pada dashboard, halaman share, copy/export, serta fallback teks polos.

## 5. Arah warna

Palet prototype pertama (warm paper + forest teal) belum dikunci. Palet brand lama juga terlalu bergantung pada violet–fuchsia untuk dijadikan seluruh UI.

Prototype revisi harus menyediakan tiga palet yang dapat dibandingkan tanpa mengubah layout:

1. **Cloud Ink — rekomendasi awal**: latar cool off-white, canvas putih, sidebar deep navy, aksi utama cobalt, aksen pengetahuan teal/cyan. Violet hanya boleh menjadi jejak kecil pada brand.
2. **Midnight Signal**: shell navy gelap, canvas charcoal-blue, teks off-white, aksen cyan/blue. Cocok untuk sesi malam tetapi harus diuji untuk bacaan panjang.
3. **Soft Graphite**: shell graphite, canvas light gray, aksen blue-teal yang lebih netral dan profesional.

Hindari gradien violet–fuchsia dominan, warm cream yang terasa seperti aplikasi jurnal klasik, dan terlalu banyak warna aksen dalam satu layar. Keputusan final dibuat setelah Henry membandingkan tiga palet di prototype yang sama.

## 6. Responsif

- Desktop: tiga kolom; sidebar dan Learning Lab dapat diciutkan.
- Tablet: Learning Lab menjadi drawer; Tutor Materi tetap berada di area tengah.
- Mobile: sidebar menjadi navigation drawer, Learning Lab menjadi bottom sheet, dan composer Tutor Materi tetap mudah dijangkau tanpa menutupi paragraf.
- Global Tutor tetap halaman/workspace, bukan modal penuh layar yang terasa sementara.

## 7. Batas implementasi

- Jangan menanam UI baru langsung di `app/dashboard/page.tsx` yang masih monolitik.
- Ekstrak komponen berdasarkan tanggung jawab setelah prototype revisi disetujui.
- Rekam/upload, penyimpanan summary, share, folder, chat API, billing, dan modal existing tidak boleh diregresikan oleh refactor visual.
- Prototype hanya mensimulasikan AI. Production wajib menggunakan data/API nyata dan state fallback yang jujur.

## 8. Kriteria penerimaan prototype revisi

- Tutor Materi terlihat dan dapat digunakan di tengah tanpa membuka modal.
- Pilihan teks atau formula menjadi context chip dan menghasilkan jawaban inline.
- Catatan Rumus dapat diedit dan bertahan di `localStorage` pada prototype.
- Tanya semua materi berada di posisi teratas sidebar dan membuka workspace global di tengah.
- Tiga palet dapat dibandingkan dengan satu switcher.
- Profil tetap di kiri bawah dan Rekam / Upload tetap tepat di atasnya.
- Speaker Context mengikuti strategi kelas besar di `docs/SPEAKER-CONTEXT.md`.
