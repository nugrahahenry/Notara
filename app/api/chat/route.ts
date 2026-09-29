import { NextRequest, NextResponse } from 'next/server';
import { GROQ_LLM_MODEL } from '../../../lib/ai';
import { getErrorMessage, normalizeChatHistory } from '../../../lib/api/boundary';
import { BoundedJsonBodyError, readBoundedJsonBody } from '../../../lib/api/bounded-json';
import { authorizeAiRequest } from '../../../lib/api/ai-access';
import { PRODUCT_IDENTITY } from '../../../lib/brand/identity';
import { createAiUsageEvent } from '../../../lib/ai/usage';
import { recordAiUsageSafely } from '../../../lib/ai/usage-recorder';
import { observeGroqChatStream } from '../../../lib/ai/stream-usage';

const MAX_CHAT_BODY_BYTES = 300_000;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_CONTEXT_CHARS = 80_000;
const MAX_FOLDER_NAME_CHARS = 160;

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeAiRequest('chat');
    if (!access.ok) return access.response;
    const requestId = crypto.randomUUID();

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY belum diset di file .env.local' },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await readBoundedJsonBody(request, MAX_CHAT_BODY_BYTES);
    } catch (error) {
      const status = error instanceof BoundedJsonBodyError && error.code === 'body-too-large' ? 413 : 400;
      return NextResponse.json(
        { error: status === 413 ? 'Pesan terlalu besar untuk diproses.' : 'Format permintaan tidak valid.' },
        { status },
      );
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
    }

    const rawMessage = Reflect.get(body, 'message');
    const rawContext = Reflect.get(body, 'contextTranscript');
    const rawHistory = Reflect.get(body, 'history');
    const rawScope = Reflect.get(body, 'chatScope');
    const rawFolderName = Reflect.get(body, 'folderName');
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    const contextTranscript = typeof rawContext === 'string' ? rawContext : '';
    const chatScope = rawScope === 'folder' || rawScope === 'summary' ? rawScope : 'global';
    const folderName = typeof rawFolderName === 'string' ? rawFolderName.slice(0, MAX_FOLDER_NAME_CHARS) : '';

    if (!message) {
      return NextResponse.json(
        { error: 'Pesan user tidak boleh kosong.' },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_CHARS || contextTranscript.length > MAX_CONTEXT_CHARS) {
      return NextResponse.json(
        { error: 'Pesan atau konteks materi terlalu panjang.' },
        { status: 413 },
      );
    }

    const scopeGuidance = chatScope === 'global'
      ? `Anda sedang menjawab dalam mode "Asisten ${PRODUCT_IDENTITY.name} (Global)". Anda memiliki akses penuh ke daftar seluruh folder/mata kuliah dan berkas rangkuman milik mahasiswa (Henry). Jika mahasiswa bertanya tentang catatan yang mereka miliki, bacalah daftar struktur berkas yang diberikan. Jika mereka bertanya mengenai konsep akademik, gunakan transkrip dari materi kuliah pendukung yang relevan di bawah ini (jika ada) dan gabungkan dengan pengetahuan akademis luas Anda untuk memberikan penjelasan komprehensif.`
      : chatScope === 'folder'
        ? `Anda sedang menjawab dalam mode "Satu Mata Kuliah" untuk folder mata kuliah "${folderName || 'Mata Kuliah'}". Transkrip di bawah ini merupakan gabungan dari seluruh materi perkuliahan di folder tersebut. Kaitkan konsep antar-pertemuan secara integratif apabila relevan untuk memberi pemahaman menyeluruh.`
        : `Anda sedang menjawab dalam mode "Rangkuman Ini" untuk satu sesi kuliah tunggal. Fokuskan penjelasan Anda pada isi materi perkuliahan satu pertemuan ini saja.`;

    const systemPrompt = `Anda adalah ${PRODUCT_IDENTITY.name}, asisten AI pembelajaran yang cerdas, bersahabat, komunikatif, dan sangat interaktif.
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
      ...normalizeChatHistory(rawHistory, { maxEntries: 20, maxContentChars: 6_000 }),
      { role: 'user', content: message }
    ];

    console.log(`${PRODUCT_IDENTITY.name} Chat: Mengirim request ke ${GROQ_LLM_MODEL} (stream mode)...`);

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

    const responseBody = response.body
      ? observeGroqChatStream(response.body, async (observation) => {
        await recordAiUsageSafely(createAiUsageEvent({
          userId: access.userId,
          requestId,
          operation: 'chat',
          stage: 'generation',
          model: GROQ_LLM_MODEL,
          providerRequestId: observation.providerRequestId,
          ...(observation.usage ?? {}),
        }), { bypassed: access.bypassed });
      })
      : null;

    if (!responseBody) {
      await recordAiUsageSafely(createAiUsageEvent({
        userId: access.userId,
        requestId,
        operation: 'chat',
        stage: 'generation',
        model: GROQ_LLM_MODEL,
      }), { bypassed: access.bypassed });
    }

    // Preserve the provider SSE bytes while observing optional usage metadata.
    return new Response(responseBody, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: unknown) {
    console.error('API Chat route error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Terjadi kesalahan sistem.') },
      { status: 500 }
    );
  }
}
