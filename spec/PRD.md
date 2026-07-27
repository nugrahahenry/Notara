# Product Requirements Document — Notara

> Status: active MVP + arah produk. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: `app/dashboard/page.tsx`, route API, `lib/db.ts`, `spec/STUDY-CANVAS.md`, dan `docs/SPEAKER-CONTEXT.md`.
> Perbarui saat scope, keputusan produk, atau metrik berubah.

## Ringkasan produk

Notara adalah ruang belajar untuk mahasiswa Indonesia yang mengubah rekaman kuliah menjadi transkrip, rangkuman terstruktur, dan jawaban AI berbasis materi. Rekaman adalah bahan mentah; rangkuman dan percakapan adalah alat untuk kembali belajar.

## Masalah dan target pengguna

| Masalah | Dampak | Jawaban MVP |
| --- | --- | --- |
| Mencatat saat kuliah mengganggu fokus | materi penting tercecer | rekam/unggah lalu buat transkrip dan rangkuman |
| Rekaman panjang jarang diputar ulang | waktu belajar terbuang | rangkuman, istilah, dan pertanyaan latihan |
| Materi tersebar antar-pertemuan | sulit mengulang sebelum ujian | folder/mata kuliah dan chat scope folder/global |
| Penjelasan sulit dipahami dari catatan statis | pengguna tetap buntu | chat streaming berbasis transkrip |

Target utama adalah mahasiswa Indonesia yang merekam kuliah dengan ponsel/laptop, menata materi dengan laptop, dan meninjau ulang dari perangkat bergerak. Target sekunder yang sudah didukung format rangkumannya adalah rapat dan catatan ide; keduanya bukan fokus validasi produk saat ini.

## Jobs to be done

- **Saat kuliah:** “Saat saya tidak sempat mencatat, bantu saya menangkap bahan yang dapat saya pelajari lagi.”
- **Setelah kuliah:** “Saat rekaman selesai, bantu saya menemukan struktur dan inti materi tanpa memutar semuanya.”
- **Menjelang ujian:** “Saat saya lupa hubungan antartopik, bantu saya menelusuri materi dan berlatih.”
- **Saat buntu:** “Saat satu konsep tidak jelas, jelaskan dengan tetap menunjukkan batas sumbernya.”

## Value proposition dan keputusan produk

- Nilai inti: dari audio kuliah ke bahan belajar yang dapat ditelusuri, bukan chatbot umum tanpa konteks.
- Privasi: audio diproses lalu dibuang; data belajar tersimpan pada akun pengguna dengan RLS.
- Bahasa: transkripsi dipaksa `id`; output AI dirancang dalam Bahasa Indonesia.
- Organisasi: folder mewakili mata kuliah, bukan sekadar tag visual.
- Akses bersama: pemilik secara eksplisit dapat membuat rangkuman publik atau membagikan folder lewat study group.

## Scope MVP yang diimplementasikan

1. Auth, onboarding, profil, MFA UI, folder, rangkuman, transkrip, dan riwayat chat.
2. Rekam/unggah → transkripsi → rangkuman dengan penyimpanan transkrip/rangkuman.
3. Pengelolaan rangkuman: pindah folder, ubah judul, hapus, share publik, fork, ekspor Word.
4. Chat satu rangkuman, folder, atau global; respons dipancarkan sebagai SSE.
5. Study group dan folder sharing.
6. UI subscription dan checkout scaffold.

## Non-goals MVP

- Identifikasi seseorang dari suara, voiceprint, atau label pembicara palsu.
- Penyimpanan audio permanen dan pemutar audio cloud.
- Jaminan kebenaran akademik, rumus, atau prediksi ujian oleh AI.
- Retrieval/vector search lintas seluruh koleksi yang deterministik.
- Pembayaran production sebelum rantai webhook/otorisasi diverifikasi.

## User journey utama

1. Pengguna login dan melengkapi onboarding.
2. Pengguna memilih rekam atau unggah, lalu memilih folder tujuan bila diperlukan.
3. Notara memproses audio, memperlihatkan status, lalu meminta/menetapkan lokasi simpan rangkuman.
4. Pengguna membaca rangkuman/transkrip, mengelola folder, atau bertanya dalam scope yang dipilih.
5. Pengguna dapat membagikan rangkuman secara publik atau kepada kelompok.

## Arah yang dirancang, belum diimplementasikan

**Study Canvas** akan menjadikan rangkuman dokumen belajar aktif di tengah, Tutor Materi inline untuk satu rangkuman, Global Tutor sebagai workspace tersendiri, dan Learning Lab untuk konsep/quiz/formula/Neurova. Ini adalah kontrak desain, bukan klaim UI production. Lihat [STUDY-CANVAS.md](STUDY-CANVAS.md).

**Speaker Context** hanya dibangun jika provider mengirim diarization dan timestamp. Strategi kelas besar adalah Dosen utama / Pertanyaan mahasiswa / Obrolan sampingan, tanpa identitas biometrik. Lihat [SPEAKER-CONTEXT.md](../docs/SPEAKER-CONTEXT.md).

## Metrik keberhasilan yang perlu mulai diukur

Belum ada telemetry produk yang terlihat di kode. Sebelum mengklaim pertumbuhan, definisikan dan ukur:

- activation: pengguna pertama kali berhasil menyimpan rangkuman;
- processing success rate dan median waktu per durasi audio;
- weekly retained learners: pengguna kembali membuka/bertanya pada materi;
- summary-to-chat rate dan folder organization rate;
- share/fork rate (jika fitur dipakai);
- conversion/retention subscription hanya setelah billing aman.

## Risiko produk

| Risiko | Dampak | Sikap produk |
| --- | --- | --- |
| Transkrip/rangkuman salah | salah belajar | tunjukkan transkrip, jangan klaim kebenaran mutlak |
| Audio panjang/perangkat lemah | proses gagal | progress jujur, chunk browser, batas file eksplisit |
| Chat global menjawab dari konteks terbatas | jawaban tidak relevan | jelaskan scope, tambahkan provenance pada redesign |
| Terlalu banyak fitur visual | belajar malah terdistraksi | prioritaskan sumber, pemahaman, dan alur ujian |
| Billing belum aman | kerugian/kenaikan tier ilegal | jangan aktifkan pembayaran nyata sebelum mitigasi selesai |

## Roadmap prioritas

1. Keamanan billing dan observability dasar.
2. Component extraction dashboard sebagai prasyarat redesign aman.
3. Prototype Study Canvas v2 → audit → implementasi bertahap.
4. Provider research untuk diarization dan formula capture; implementasi hanya setelah kontrak data/fallback disetujui.
