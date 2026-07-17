import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL, GROQ_STT_MODEL } from '../../../lib/ai';

export async function POST(request: NextRequest) {
  try {
    // 1. Validasi API Key — Groq satu key untuk dua hal: Whisper + LLM
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY belum diset di file .env.local' },
        { status: 500 }
      );
    }

    // 2. Ambil file audio dari request
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'File audio tidak ditemukan. Silakan upload file.' },
        { status: 400 }
      );
    }

    // 3. Konversi file ke buffer untuk dikirim ke Groq Whisper
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const groqFormData = new FormData();
    const fileBlob = new Blob([buffer], { type: file.type });
    groqFormData.append('file', fileBlob, file.name || 'audio.mp3');
    groqFormData.append('model', GROQ_STT_MODEL);
    groqFormData.append('language', 'id'); // Paksa Bahasa Indonesia agar akurat

    console.log('Asisten 1: Groq Whisper sedang mentranskripsi audio...');

    // 4. Panggil Groq Whisper untuk transkripsi suara → teks
    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: groqFormData,
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq Whisper Error:', errorText);
      return NextResponse.json(
        { error: 'Gagal mentranskripsi audio melalui Groq Whisper.' },
        { status: 500 }
      );
    }

    const groqData = await groqResponse.json();
    const transcript = groqData.text;

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json(
        { error: 'Audio terlalu sunyi atau tidak ada suara yang bisa ditranskripsi.' },
        { status: 400 }
      );
    }

    console.log('Transkripsi selesai! Panjang teks:', transcript.length, 'karakter');
    console.log('Asisten 2: Groq Llama 3.3 sedang membuat rangkuman...');

    // 5. Panggil Groq LLM (Llama 3.3 70B) untuk merangkum teks — GRATIS!
    const prompt = `Anda adalah asisten AI yang sangat cerdas dan bersahabat bernama Notara. Tugas Anda adalah menganalisis transkrip audio dan menghasilkan rangkuman yang sangat terstruktur, visual, dan informatif dalam Bahasa Indonesia.

**LANGKAH 1 — DETEKSI KONTEKS:**
Pertama, baca dan pahami isi transkrip. Tentukan tipe konten berdasarkan isinya:
- **TIPE A — Kuliah / Materi Akademis**: Konten berisi penjelasan dosen, teori, konsep akademis, istilah ilmiah, atau materi pelajaran.
- **TIPE B — Rapat / Meeting / Wawancara Bisnis**: Konten berisi diskusi tim, keputusan rapat, presentasi bisnis, atau wawancara dengan narasumber.
- **TIPE C — Ide / Brainstorming / Catatan Suara**: Konten berisi gagasan, eksplorasi ide, perencanaan pribadi, atau catatan bebas.

**LANGKAH 2 — BUAT RANGKUMAN SESUAI TIPE:**

Jika **TIPE A — Kuliah / Akademis**, gunakan format berikut:
\`\`\`
# 📝 [Judul Kuliah yang Relevan Berdasarkan Isi]

> 🎓 *Materi Akademis — Notara AI telah merangkum kuliah ini untuk kamu.*

## 🎯 Ringkasan Singkat
[1–2 paragraf menjelaskan topik utama dan tujuan materi kuliah ini secara padat]

## 📌 Poin-Poin Utama
[Jelaskan 5–10 poin terpenting secara berurutan dengan penjelasan yang detail per poin]

## 🔑 Istilah & Konsep Kunci
[Tabel berisi istilah penting — WAJIB gunakan tabel Markdown jika ada 3+ istilah:]
| Istilah | Definisi & Penjelasan |
|---|---|
| [Istilah 1] | [Definisi lengkap] |
| [Istilah 2] | [Definisi lengkap] |

[Jika ada perbandingan konsep, metode, atau klasifikasi — WAJIB sajikan dalam Tabel Markdown]

## ❓ Prediksi Soal Ujian & Latihan
[5 soal latihan yang berpotensi muncul di ujian, WAJIB disertai kunci jawaban singkat masing-masing]
**1.** [Soal pertama]
> 💡 **Jawaban:** [Kunci jawaban]
...
\`\`\`

Jika **TIPE B — Rapat / Meeting / Bisnis**, gunakan format berikut:
\`\`\`
# 🤝 [Judul Rapat / Meeting yang Relevan]

> 💼 *Ringkasan Rapat — Notara AI telah merangkum meeting ini untuk kamu.*

## 📋 Ringkasan Eksekutif
[1–2 paragraf inti tentang apa yang dibahas, tujuan rapat, dan hasil akhirnya]

## 🏁 Keputusan Utama
[Daftar poin keputusan penting yang dibuat selama rapat]

## 📊 Perbandingan / Opsi yang Didiskusikan
[Jika ada perbandingan opsi/strategi — WAJIB gunakan Tabel Markdown:]
| Aspek | Opsi A | Opsi B |
|---|---|---|
| [Aspek 1] | [Keterangan] | [Keterangan] |

## ✅ Action Items (Tindakan Lanjutan)
[Daftar tugas konkret yang harus dikerjakan setelah rapat ini]
| Tugas | Penanggung Jawab | Target Selesai |
|---|---|---|
| [Tugas 1] | [Nama / Tim] | [Estimasi waktu] |

## ❓ 5 Pertanyaan Strategis untuk Ditindaklanjuti
[5 pertanyaan penting yang perlu dijawab atau dieksekusi setelah rapat ini]
\`\`\`

Jika **TIPE C — Ide / Brainstorming / Catatan Suara**, gunakan format berikut:
\`\`\`
# 💡 [Judul Ide / Proyek yang Relevan]

> 🚀 *Catatan Ide — Notara AI telah merapikan gagasan-gagasanmu.*

## ✨ Inti Ide
[1–2 paragraf merangkum inti dari ide atau konsep yang dibicarakan]

## 🗺️ Peta Pikiran Utama
[Jelaskan cabang-cabang ide utama secara terstruktur]

## ⚖️ Analisis Cepat (Pro vs Kontra)
| Kelebihan (Pro) | Kekurangan / Risiko (Kontra) |
|---|---|
| [Poin pro 1] | [Poin kontra 1] |

## 🚀 5 Langkah Eksekusi Awal
[5 langkah konkret pertama yang bisa langsung diambil untuk mewujudkan ide ini]
**1.** [Langkah pertama]
...
\`\`\`

**ATURAN PENTING:**
- Selalu tulis dalam Bahasa Indonesia yang jelas dan mudah dipahami.
- WAJIB gunakan Tabel Markdown untuk setiap data komparatif, klasifikasi, atau daftar yang memiliki 2+ kolom.
- Jangan tampilkan nama model AI atau teknologi yang digunakan dalam output.
- Rangkuman harus terasa premium, padat, dan bernilai tinggi.
- WAJIB: Hasilkan judul (# 📝 [Judul] / # 🤝 [Judul] / # 💡 [Judul]) yang sangat spesifik, bermakna, dan kontekstual menggambarkan isi transkrip. JANGAN PERNAH menghasilkan judul generik seperti "Rangkuman Kuliah", "Rangkuman Rapat", "Rangkuman Pertemuan", atau "Rangkuman Materi". Contoh judul yang baik: "Normalisasi Database 1NF hingga 3NF" atau "Refleksi Hubungan Interpersonal & Konseling".


Berikut adalah transkrip yang perlu dirangkum:
---
${transcript}
---`;

    const llmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_LLM_MODEL, // dikelola terpusat di lib/ai.ts
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('Groq LLM Error:', errorText);
      return NextResponse.json(
        { error: 'Gagal membuat rangkuman melalui Groq LLM.' },
        { status: 500 }
      );
    }

    const llmData = await llmResponse.json();
    const summary = llmData.choices[0]?.message?.content || '';

    console.log('Rangkuman selesai! Proses Notara 100% berhasil! 🎉');

    // 6. Kembalikan transkrip dan rangkuman ke frontend
    return NextResponse.json({
      transcript,
      summary,
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
