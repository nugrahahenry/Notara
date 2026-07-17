import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL } from '../../../lib/ai';

export async function POST(request: NextRequest) {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY belum diset di file .env.local' },
        { status: 500 }
      );
    }

    const { message, contextTranscript, history, chatScope, folderName } = await request.json();

    if (!message || message.trim() === '') {
      return NextResponse.json(
        { error: 'Pesan user tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const scopeGuidance = chatScope === 'global'
      ? `Anda sedang menjawab dalam mode "Asisten Notara (Global)". Anda memiliki akses penuh ke daftar seluruh folder/mata kuliah dan berkas rangkuman milik mahasiswa (Henry). Jika mahasiswa bertanya tentang catatan yang mereka miliki, bacalah daftar struktur berkas yang diberikan. Jika mereka bertanya mengenai konsep akademik, gunakan transkrip dari materi kuliah pendukung yang relevan di bawah ini (jika ada) dan gabungkan dengan pengetahuan akademis luas Anda untuk memberikan penjelasan komprehensif.`
      : chatScope === 'folder'
        ? `Anda sedang menjawab dalam mode "Satu Mata Kuliah" untuk folder mata kuliah "${folderName || 'Mata Kuliah'}". Transkrip di bawah ini merupakan gabungan dari seluruh materi perkuliahan di folder tersebut. Kaitkan konsep antar-pertemuan secara integratif apabila relevan untuk memberi pemahaman menyeluruh.`
        : `Anda sedang menjawab dalam mode "Rangkuman Ini" untuk satu sesi kuliah tunggal. Fokuskan penjelasan Anda pada isi materi perkuliahan satu pertemuan ini saja.`;

    const systemPrompt = `Anda adalah Notara, asisten AI pembelajaran yang cerdas, bersahabat, komunikatif, dan sangat interaktif.
Tugas utama Anda adalah menjawab pertanyaan Henry secara komprehensif, terstruktur, dan jelas berbasis materi perkuliahan.

Format Jawaban Anda (WAJIB):
1. Gunakan Bahasa Indonesia yang ramah, bersemangat, dan solutif.
2. Gunakan pemformatan Markdown lengkap: tebalkan kata-kata kunci penting (**bold**), buat poin-poin yang terstruktur, dan gunakan blok kutipan (> ) untuk penekanan.
3. Selalu tambahkan emoji yang relevan di awal paragraf atau poin list (misal: 💡, 📌, 🎯, 🚀, 📚) agar respons Anda terlihat interaktif dan menarik.
4. Jika ada perbandingan konsep, klasifikasi, atau data operasional, sajikan dalam bentuk **Tabel Markdown** yang rapi.
5. Berikan contoh konkret yang mudah dipahami di setiap penjelasan teori.

Panduan Contextual Scope:
1. ${scopeGuidance}
2. Prioritaskan informasi yang ada di dalam transkrip materi kuliah yang diberikan di bawah ini.
3. Jika jawaban dari pertanyaan tersebut tidak dibahas di transkrip, Anda diperbolehkan menggunakan pengetahuan akademis umum Anda untuk memberikan jawaban lengkap yang edukatif, namun berikan catatan kecil di awal/akhir jawaban bahwa penjelasan tambahan tersebut melengkapi apa yang dibahas di kelas.

Berikut adalah peta struktur berkas dan transkrip materi kuliah pendukung yang tersedia:
---
${contextTranscript || 'Tidak ada transkrip materi kuliah yang tersedia untuk sesi ini.'}
---`;


    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message }
    ];

    console.log(`Notara Chat: Mengirim request chat ke Groq Llama 3.3 (Stream mode)...`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_LLM_MODEL, // dikelola terpusat di lib/ai.ts
        messages,
        temperature: 0.6,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq Chat API Error:', errorText);
      return NextResponse.json(
        { error: 'Gagal menghubungi Groq AI.' },
        { status: 500 }
      );
    }

    // Forward the streaming response directly to Next.js client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('API Chat route error:', error);
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
