# Business Requirements Document — Notara

> Status: aktif, dengan monetisasi belum tervalidasi end-to-end. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: `app/page.tsx`, `app/dashboard/page.tsx`, route billing, migrasi database.
> Perbarui saat paket, harga, pembayaran, atau metrik bisnis berubah.

## Tujuan bisnis

Menguji apakah Notara dapat menjadi alat belajar yang cukup berguna sehingga mahasiswa kembali menggunakannya untuk mengolah dan meninjau materi kuliah. Monetisasi hanya boleh diaktifkan setelah pengalaman inti stabil dan alur pembayaran aman.

## Persona dan positioning

| Persona | Kebutuhan utama | Nilai Notara |
| --- | --- | --- |
| Mahasiswa aktif | menangkap dan mengulang materi kuliah | rekaman menjadi bahan belajar terstruktur |
| Mahasiswa menjelang ujian | menyatukan materi satu mata kuliah | folder, chat scope, dan latihan dari rangkuman |
| Kelompok belajar | berbagi bahan yang relevan | study group dan folder sharing |

Positioning: alat belajar berbasis rekaman untuk mahasiswa Indonesia, bukan aplikasi transkripsi generik atau pengganti dosen.

## Paket dan monetisasi saat ini

Kode mendefinisikan tiga nilai `subscription_tier`: `free`, `pro`, dan `max`. Landing/dashboard menampilkan dua paket berbayar dan checkout menetapkan nominal berikut:

| Tier | Bukti implementasi | Harga di checkout | Kondisi saat ini |
| --- | --- | ---: | --- |
| Free | `subscription_tier = free` | — | limit bulanan 5 rangkuman, 3 rangkuman per folder, recording 30 menit di UI |
| Pro | `subscription_tier = pro` | Rp49.000 | dianggap paid oleh gating; UI mencatat recording hingga 120 menit |
| Max | `subscription_tier = max` | Rp99.000 | saat ini diperlakukan sama dengan Pro oleh sebagian besar gating |

Harga dan limit di atas adalah perilaku kode saat audit, bukan rekomendasi pricing final. Pro dan Max belum memiliki `tierLimits()` yang membedakan benefit secara konsisten. Tidak ada bukti billing live sukses; Midtrans masih dapat masuk mode mock bila server key kosong/dummy dan webhook belum dapat menerima request production karena middleware.

## Kebutuhan bisnis

1. Pengguna gratis harus memahami limit sebelum proses mahal dimulai.
2. Pengguna berbayar hanya mendapat tier setelah pembayaran terverifikasi dari sumber yang berwenang.
3. Paket harus memiliki manfaat yang konsisten, dapat dijelaskan, dan dapat diuji.
4. Data akademik pengguna tidak boleh dijadikan aset publik atau bahan pemasaran tanpa persetujuan eksplisit.
5. Keputusan harga perlu didasarkan pada biaya transkripsi/LLM, keberhasilan proses, willingness-to-pay, dan retensi—bukan hanya implementasi nominal saat ini.

## KPI dan keputusan yang belum tervalidasi

| Area | KPI awal | Status |
| --- | --- | --- |
| Aktivasi | rangkuman pertama tersimpan | belum ada analytics di kode |
| Nilai inti | rangkuman dibuka kembali / chat pasca-rangkuman | belum ada analytics di kode |
| Keandalan | keberhasilan dan durasi pemrosesan | belum ada observability terstruktur |
| Monetisasi | checkout initiated → payment verified → tier active | tidak boleh diukur sebagai conversion sebelum webhook aman |
| Retensi | pengguna aktif mingguan dan materi per mata kuliah | belum ada instrumentation |

Pertanyaan yang wajib dijawab sebelum meluncurkan pembayaran: apakah Pro/Max dibedakan, apakah periode 30 hari sesuai model bisnis, bagaimana refund/cancellation ditangani, dan biaya model per rangkuman pada pola pemakaian nyata. Kode hanya mengatur `current_period_end` 30 hari setelah status sukses; belum terlihat lifecycle subscription lengkap.
