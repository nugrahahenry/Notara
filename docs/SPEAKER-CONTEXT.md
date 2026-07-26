# Notara — Speaker Context

> Status: keputusan produk dan kontrak data awal. Belum diimplementasikan.
>
> Tujuan dokumen ini adalah menjaga supaya UI, database, dan provider transkripsi nanti berbicara dalam bahasa yang sama.

## 1. Masalah yang ingin diselesaikan

Satu rekaman kuliah sering memuat dosen, mahasiswa, dan kadang narasumber tamu. Transkrip Notara saat ini berupa satu teks utuh, sehingga pengguna tidak dapat membedakan apakah sebuah penjelasan, pertanyaan, atau keputusan datang dari siapa.

Analogi sederhananya: transkrip sekarang seperti notulen tanpa nama pembicara. Speaker Context memberi label stabil pada setiap giliran bicara, lalu pengguna dapat menyatakan, “Pembicara 1 ini dosen.”

## 2. Kontrak produk

### Yang Notara boleh klaim

- Memisahkan rekaman menjadi label netral seperti **Pembicara 1** dan **Pembicara 2**, jika provider memang mengirim data diarization dan timestamp.
- Memberi dugaan peran berdasarkan pola percakapan sebagai bantuan, lalu meminta pengguna mengonfirmasi atau memperbaikinya.
- Menampilkan label peran yang telah dikonfirmasi pengguna pada transkrip, ringkasan baru, dan jawaban yang mengutip segmen terkait.

### Yang Notara tidak boleh klaim

- Tidak mengaku mengetahui identitas atau nama seseorang hanya dari suara.
- Tidak menyimpan voiceprint, embedding suara, atau profil biometrik.
- Tidak menciptakan timestamp maupun label pembicara palsu bila hasil transkripsi hanya teks polos.
- Tidak otomatis menulis ulang ringkasan lama ketika peran diubah. Pengguna harus menekan tindakan eksplisit **Perbarui ringkasan dengan konteks pembicara**.

Audio tetap mengikuti keputusan privasi Notara saat ini: diproses lalu dibuang.

## 3. Kondisi kode saat ini

`app/api/summarize/route.ts` mengirim audio ke endpoint transkripsi Groq dan hanya mengambil `groqData.text`. Objek `Summary` serta tabel `summaries` hanya punya `transcript TEXT` dan `summary TEXT`.

Artinya, UI Speaker Context belum boleh dianggap fitur aktif. Untuk semua rangkuman lama dan provider yang hanya mengembalikan teks, state yang benar adalah **“Data pembicara belum tersedia untuk rekaman ini.”**

## 4. Bentuk data yang dikunci untuk MVP

Gunakan satu kolom opsional `speaker_context JSONB` pada `summaries`, bukan tabel baru. Ini menjaga migration ringan, RLS tetap mewarisi policy `summaries`, dan hasil fork/share ikut terbawa tanpa policy tambahan.

Nilai `NULL` berarti rekaman belum memiliki data speaker. Jika tersedia, bentuknya sebagai berikut:

```json
{
  "schema_version": 1,
  "source": "provider_diarization",
  "status": "ready",
  "speakers": [
    {
      "id": "spk_1",
      "display_label": "Pembicara 1",
      "role": "lecturer",
      "role_label": "Dosen",
      "role_source": "user_confirmed"
    },
    {
      "id": "spk_2",
      "display_label": "Pembicara 2",
      "role": "student",
      "role_label": "Mahasiswa",
      "role_source": "user_confirmed"
    }
  ],
  "segments": [
    {
      "id": "seg_001",
      "start_ms": 0,
      "end_ms": 222000,
      "speaker_id": "spk_1",
      "text": "Hari ini kita membahas gradient descent."
    }
  ]
}
```

Nilai yang diizinkan:

| Field | Nilai |
|---|---|
| `status` | `ready`, `unavailable`, `failed` |
| `source` | `provider_diarization`, `manual`, `none` |
| `role` | `unknown`, `lecturer`, `student`, `guest`, `other` |
| `role_source` | `unconfirmed`, `suggested`, `user_confirmed` |

Nama asli tidak menjadi field produk pada MVP. Kalau suatu hari dibutuhkan, itu harus menjadi keputusan privasi terpisah dan opt-in.

## 5. Perilaku UI yang diharapkan

1. Default di tab Pembicara adalah label netral, misalnya **Pembicara 1**.
2. Jika ada dugaan, tampilkan kata **“Kemungkinan”**, bukan kepastian.
3. Pengguna dapat mengubah peran ke Dosen, Mahasiswa, Pembicara tamu, atau Tetap netral.
4. Setelah disimpan, label di segmen transkrip berubah secara langsung.
5. Rangkuman yang sudah ada tidak dimutasi diam-diam. UI menawarkan tombol eksplisit untuk membuat versi rangkuman baru dengan konteks peran tersebut.
6. Jika `speaker_context` bernilai `NULL`, panel menjelaskan keterbatasan dengan singkat dan tidak menampilkan data contoh seolah-olah nyata.

Study Canvas prototype adalah tempat menguji alur ini sebelum frontend produksi disentuh.

## 6. Perubahan teknis yang direncanakan (belum dikerjakan)

### Database dan tipe

- Migration baru yang hanya menambahkan `speaker_context JSONB NULL` ke `public.summaries`.
- Tambahkan `speaker_context?: SpeakerContext | null` ke `lib/types.ts`.
- Pastikan `forkSummary()` ikut menyalin nilai ini.
- Karena data ada di baris `summaries`, RLS pemilik/share yang sudah diverifikasi tetap berlaku. Tidak ada policy `Allow all` baru.

### Ingestion

- Normalisasi hasil provider diarization ke kontrak JSON di atas **di server**, bukan di browser.
- Hanya simpan segmen yang benar-benar dikembalikan provider.
- Jika provider gagal atau tidak mendukung diarization untuk rekaman tersebut, proses ringkasan inti tetap sukses dan `speaker_context` dibiarkan `NULL` atau diberi status `unavailable` setelah keputusan UX final.
- Endpoint rangkuman menerima teks polos seperti sekarang; ia baru diberi konteks peran saat pengguna secara eksplisit meminta refresh ringkasan.

### Frontend

- Jangan menambah fitur ini di `app/dashboard/page.tsx` yang masih monolitik. Setelah prototype disetujui, ekstrak lebih dahulu area detail ringkasan/transkrip menjadi komponen kecil.
- Tambahkan panel Speaker Context sebagai progressive enhancement: ringkasan lama harus tetap tampil normal tanpa data speaker.

## 7. Keputusan provider belum dibuat

Groq Whisper yang dipakai sekarang terbukti menghasilkan teks, tetapi kode Notara saat ini tidak meminta atau menerima segmen bertimestamp maupun diarization. Kita belum boleh mengasumsikan provider, format respons, dukungan Bahasa Indonesia, biaya, maupun batas file tertentu.

Sebelum implementasi ingestion, lakukan riset terarah terhadap provider yang benar-benar menyediakan:

1. diarization pembicara;
2. timestamp segmen/utterance;
3. dukungan Bahasa Indonesia yang layak;
4. API yang cocok untuk serverless Vercel;
5. kebijakan privasi dan harga yang cocok untuk MVP mahasiswa.

Hasil riset itu diputuskan terpisah dari desain UI. Bila Groq tidak menyediakan data yang dibutuhkan, Notara dapat memakai provider STT khusus hanya untuk mode Speaker Context tanpa mengganti LLM Groq untuk rangkuman/chat.

## 8. Urutan implementasi yang aman

1. Henry membuat prototype standalone Study Canvas + Speaker Context.
2. Audit prototype: alur fokus belajar, responsif, aksesibilitas, dan ketepatan klaim produk.
3. Putuskan provider lewat riset singkat berbasis bukti resmi.
4. Pecah komponen dashboard yang relevan.
5. Tambahkan migration, tipe, dan normalizer data provider.
6. Implementasi UI progressive enhancement dan tes dengan rekaman multi-pembicara nyata.
7. Tes regresi: rekaman satu pembicara, rangkuman lama, share/fork, serta RLS antar pengguna.

## 9. Kriteria selesai untuk MVP Speaker Context

- Rekaman multi-pembicara menampilkan segmen waktu dengan label netral yang benar-benar berasal dari provider.
- Pengguna dapat mengonfirmasi Dosen/Mahasiswa dan perubahan tersimpan setelah refresh halaman.
- Ringkasan baru dapat memakai label peran yang telah dikonfirmasi, tanpa menyatakan identitas personal.
- Rekaman lama serta rekaman tanpa diarization tetap bisa diproses dan dibaca tanpa error.
- Tidak ada audio, voiceprint, atau policy RLS permisif baru yang tersimpan.
