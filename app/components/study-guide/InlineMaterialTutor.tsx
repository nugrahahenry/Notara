'use client';

import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import {
  ArrowLeft,
  Clock3,
  History,
  Loader2,
  Mic,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import type { ChatMessage, ChatThread } from '@/lib/types';
import { SemanticIcon } from '../brand/SemanticIcon';

interface InlineMaterialTutorProps {
  materialTitle: string;
  surface?: 'review' | 'guided';
  disclosure?: string;
  messages: ChatMessage[];
  threads: ChatThread[];
  activeThreadId: string | null;
  input: string;
  isSending: boolean;
  isListening: boolean;
  voiceNotSupported: boolean;
  showHistory: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleMic: () => void;
  onToggleHistory: () => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onClear: () => void;
  renderMessage: (content: string) => ReactNode;
  formatThreadAge: (createdAt: string) => string;
}

const starterPrompts = [
  'Jelaskan inti materi ini dengan bahasa yang lebih sederhana.',
  'Apa perbedaan konsep utama yang perlu aku ingat?',
  'Beri contoh penerapan dari materi ini.',
] as const;

export function InlineMaterialTutor({
  materialTitle,
  surface = 'review',
  disclosure = 'Jawaban menggunakan konteks transkrip materi ini. Sitasi bagian sumber belum tersedia.',
  messages,
  threads,
  activeThreadId,
  input,
  isSending,
  isListening,
  voiceNotSupported,
  showHistory,
  textareaRef,
  onInputChange,
  onSend,
  onToggleMic,
  onToggleHistory,
  onNewThread,
  onSelectThread,
  onDeleteThread,
  onClear,
  renderMessage,
  formatThreadAge,
}: InlineMaterialTutorProps) {
  const visibleMessages = messages.filter((message) => message.id !== 'welcome');
  const headingId = surface === 'guided' ? 'guided-material-tutor-heading' : 'material-tutor-heading';
  const inputId = surface === 'guided' ? 'guided-material-tutor-input' : 'inline-material-tutor-input';
  const starterPromptLimit = surface === 'guided' ? 2 : starterPrompts.length;
  const visibleStarterPrompts = starterPrompts.slice(0, starterPromptLimit);

  const applyPrompt = (prompt: string) => {
    onInputChange(prompt);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <section className="notara-inline-tutor" data-surface={surface} data-has-thread={visibleMessages.length > 0} aria-labelledby={headingId}>
      <header className="notara-inline-tutor-heading">
        <div className="notara-inline-tutor-title">
          <span className="notara-inline-tutor-icon" aria-hidden="true">
            <SemanticIcon name="ask-nalira" size={20} />
          </span>
          <div>
            <span className="notara-guided-label">Hanya materi ini</span>
            <h2 id={headingId}>Tanya Materi</h2>
            <p title={materialTitle}>Cakupan: {materialTitle}</p>
          </div>
        </div>
        <div className="notara-inline-tutor-actions">
          <button type="button" onClick={onNewThread} className="notara-icon-button" aria-label="Mulai percakapan baru" title="Percakapan baru">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={onToggleHistory} className="notara-icon-button" aria-expanded={showHistory} aria-label="Buka riwayat percakapan" title="Riwayat">
            {showHistory ? <ArrowLeft className="h-4 w-4" /> : <History className="h-4 w-4" />}
          </button>
          {visibleMessages.length > 0 && !showHistory && (
            <button type="button" onClick={onClear} className="notara-icon-button" aria-label="Hapus isi percakapan" title="Hapus percakapan">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="notara-inline-tutor-disclosure" role="note">
        {disclosure}
      </div>

      {showHistory ? (
        <div className="notara-inline-tutor-history" aria-label="Riwayat Tanya Materi">
          {threads.length === 0 ? (
            <p>Belum ada riwayat percakapan untuk materi ini.</p>
          ) : (
            threads.map((thread) => (
              <div key={thread.id} className="notara-inline-thread" data-active={thread.id === activeThreadId}>
                <button type="button" onClick={() => onSelectThread(thread.id)}>
                  <strong>{thread.title || 'Percakapan materi'}</strong>
                  <small><Clock3 className="h-3 w-3" /> {formatThreadAge(thread.created_at)}</small>
                </button>
                <button type="button" onClick={() => onDeleteThread(thread.id)} aria-label={`Hapus ${thread.title || 'percakapan'}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {visibleMessages.length === 0 && (
            <div className="notara-inline-tutor-starters" aria-label="Saran pertanyaan">
              {visibleStarterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => applyPrompt(prompt)}>{prompt}</button>
              ))}
            </div>
          )}

          {visibleMessages.length > 0 && (
            <div className="notara-inline-tutor-thread" aria-live="polite">
              {visibleMessages.map((message) => (
                <article key={message.id} data-role={message.role}>
                  <span>{message.role === 'assistant' ? 'Nalira' : 'Kamu'}</span>
                  <div>
                    {message.role === 'assistant' && !message.content ? (
                      <span className="notara-inline-tutor-thinking"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Nalira sedang menyusun jawaban…</span>
                    ) : message.role === 'assistant' ? renderMessage(message.content) : message.content}
                  </div>
                </article>
              ))}
            </div>
          )}

          <form
            className="notara-inline-tutor-composer"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <label htmlFor={inputId}>Tulis pertanyaan tentang materi ini</label>
            <div>
              <textarea
                id={inputId}
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(event) => {
                  onInputChange(event.target.value);
                  event.currentTarget.style.height = 'auto';
                  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
                }}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                placeholder={isListening ? 'Sedang mendengarkan…' : 'Tanya bagian yang masih belum jelas…'}
              />
              <button
                type="button"
                onClick={onToggleMic}
                disabled={isSending || voiceNotSupported}
                className="notara-inline-tutor-mic"
                aria-label={isListening ? 'Hentikan input suara' : 'Mulai input suara'}
                title={voiceNotSupported ? 'Input suara tidak didukung browser ini' : 'Input suara'}
                data-listening={isListening}
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="notara-inline-tutor-send"
                aria-label="Kirim pertanyaan materi"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
