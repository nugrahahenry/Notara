# Notara — AI-Powered Lecture Summarizer

> Upload your lecture audio. Get a structured summary, key concepts, exam predictions, and an interactive AI chatbot to ask questions about the material — in seconds.

## The Problem

Lectures are long. Notes are tiring to write. Recordings go unwatched. By the time exams roll around, revisiting hours of audio is unrealistic.

## The Solution

Notara turns any lecture recording into a **structured, one-page summary** with key concepts and predicted exam questions — and adds a live chat interface so you can ask follow-up questions about the material.

## Features

- **Audio → Transcript → Summary** in one upload (Groq Whisper + Llama 3.3 70B)
- **Auto-detects content type** — lecture, meeting, or brainstorm — and adapts the summary format
- **Client-side audio chunking** — decodes large files (>20 MB) in the browser, splits into 5-minute clips, transcribes in parallel, then merges. Bypasses Whisper's 25 MB limit and serverless timeouts.
- **Streaming Q&A chatbot** — real-time answers via Server-Sent Events, with two scope levels:
  - *This Summary* — answers from the current file's transcript
  - *This Subject* — combines transcripts from all files in the same folder/subject
- **Folder / subject organization** — group recordings by course, share summaries publicly
- **Public share pages** — shareable link (`/s/[slug]`) for each summary, with fork capability
- **Auth + Database** — Supabase PostgreSQL for all user data, folder structure, and chat history
- **Payment integration** — Midtrans checkout + webhook pipeline; order status auto-updates on successful payment

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React 19, Tailwind CSS 4 |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| AI Transcription | Groq Whisper (`whisper-large-v3`, language=id) |
| AI Summary & Chat | Groq Llama 3.3 70B (`llama-3.3-70b-versatile`) |
| Payments | Midtrans (Checkout Session + Webhook) |
| Deployment | Vercel |

## Architecture

```
Browser
  └─ Audio file
       ├─ [large files] Client-side chunking via Web Audio API
       │    └─ 5-min clips → parallel Groq Whisper calls → merged transcript
       └─ [small files] Direct to API route
            └─ Groq Whisper → transcript → Groq Llama → structured summary
                                                └─ stored in Supabase
```

**Current audio flow:** audio is processed in-request and not stored persistently (Vercel ~4.5 MB body limit is a known constraint). Next planned step: upload from browser to Supabase Storage via signed URL before transcription — removes the size ceiling entirely.

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#          GROQ_API_KEY, MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY

# 3. Run locally
npm run dev
```

## Roadmap

- [ ] Supabase Storage upload (bypass Vercel body size limit)
- [ ] Audio queue for long recordings (Trigger.dev)
- [ ] Gemini integration for global cross-subject chat (1M context window)
- [ ] Mobile-friendly upload experience
