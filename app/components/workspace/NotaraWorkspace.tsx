'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronRight,
  Clock3,
  History,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BrandMark } from '../brand/BrandSlots';
import type { ChatMessage, ChatThread, Folder, Summary } from '@/lib/types';

interface NotaraWorkspaceProps {
  folders: Folder[];
  summaries: Summary[];
  messages: ChatMessage[];
  threads: ChatThread[];
  activeThreadId: string | null;
  input: string;
  isSending: boolean;
  showHistory: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCreateThread: () => void;
  onToggleHistory: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onOpenSummary: (summary: Summary) => void;
  renderMessage: (content: string) => ReactNode;
}

export function NotaraWorkspace({
  folders,
  summaries,
  messages,
  threads,
  activeThreadId,
  input,
  isSending,
  showHistory,
  onInputChange,
  onSend,
  onCreateThread,
  onToggleHistory,
  onSelectThread,
  onDeleteThread,
  onOpenSummary,
  renderMessage,
}: NotaraWorkspaceProps) {
  const [historyPinned, setHistoryPinned] = useState(false);
  const recentMaterials = [...summaries]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, 4);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="notara-workspace-page mx-auto flex h-full max-w-6xl flex-col gap-5">
      <header className="notara-notara-heading">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark size={36} />
          <div>
            <span className="notara-eyebrow">Notara</span>
            <h1>Pemandu belajar lintas materi</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCreateThread} className="notara-secondary-button"><Plus className="h-4 w-4" /> Obrolan baru</button>
          <button type="button" onClick={onToggleHistory} className="notara-secondary-button"><History className="h-4 w-4" /> Riwayat</button>
        </div>
      </header>

      <section className="notara-scope-foundation" aria-label="Scope percakapan">
        <div>
          <span className="notara-eyebrow">Scope aktif</span>
          <strong>Semua materi</strong>
        </div>
        <button type="button" aria-pressed="true">Semua materi</button>
        <button type="button" disabled title="Buka materi untuk memakai scope mata kuliah">Satu mata kuliah</button>
        <button type="button" disabled title="Buka materi untuk memakai scope materi">Satu materi</button>
        <small>Scope mata kuliah/materi memakai adapter existing setelah kamu membuka sebuah materi. Full retrieval dan provenance belum menjadi contract produksi.</small>
      </section>

      <div className="notara-notara-layout" data-history-open={showHistory || historyPinned}>
        {(showHistory || historyPinned) && (
          <aside className="notara-history-utility" aria-label="Riwayat Notara">
            <div className="flex items-center justify-between gap-2">
              <div><span className="notara-eyebrow">Utility drawer</span><h2>Riwayat</h2></div>
              <button type="button" onClick={() => setHistoryPinned((value) => !value)} aria-pressed={historyPinned} title={historyPinned ? 'Lepas pin panel' : 'Pin panel di desktop'}>
                {historyPinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-4 space-y-1.5">
              {threads.length === 0 ? (
                <p className="text-sm leading-6 text-[var(--text-tertiary)]">Belum ada riwayat. Percakapan baru akan muncul di sini.</p>
              ) : threads.map((thread) => (
                <div key={thread.id} className="notara-history-row" data-active={thread.id === activeThreadId}>
                  <button type="button" onClick={() => onSelectThread(thread.id)}>
                    <MessageSquareText className="h-4 w-4" />
                    <span><strong>{thread.title}</strong><small>{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(thread.created_at))}</small></span>
                  </button>
                  <span title="Pin per chat adalah foundation visual"><Pin className="h-3.5 w-3.5" /></span>
                  <button type="button" onClick={() => onDeleteThread(thread.id)} title="Hapus obrolan"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[var(--text-tertiary)]">Rename, undo delete, dan pin per chat masih foundation visual; tidak ada capability persistence baru pada checkpoint ini.</p>
          </aside>
        )}

        <div className="notara-conversation">
          <div className="notara-conversation-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="notara-conversation-empty">
                <Sparkles className="h-6 w-6" />
                <h2>Tanyakan hubungan antar materi</h2>
                <p>Mulai dari konsep, istilah, atau bagian kuliah yang ingin kamu hubungkan. Jawaban tetap memakai contract chat existing.</p>
              </div>
            ) : messages.map((message) => (
              <article key={message.id} data-role={message.role}>
                <span>{message.role === 'assistant' ? 'Notara' : 'Kamu'}</span>
                <div className="notara-conversation-message-body">
                  {renderMessage(message.content || (isSending ? 'Menyiapkan jawaban…' : ''))}
                </div>
              </article>
            ))}
          </div>

          <div className="notara-material-suggestions">
            <span className="notara-eyebrow">Buka konteks tertentu</span>
            <div>
              {recentMaterials.map((summary) => (
                <button key={summary.id} type="button" onClick={() => onOpenSummary(summary)}>
                  <BookOpen className="h-4 w-4" />
                  <span>{summary.title}<small>{folders.find((folder) => folder.id === summary.folder_id)?.name ?? 'Belum dikategorikan'}</small></span>
                  <ChevronRight className="ml-auto h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="notara-central-composer">
            <textarea
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Tanya semua materi…"
              rows={2}
            />
            <button type="button" onClick={onSend} disabled={!input.trim() || isSending} aria-label="Kirim pertanyaan">
              {isSending ? <Clock3 className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            </button>
            <small>Enter untuk kirim · Shift+Enter untuk baris baru</small>
          </div>
        </div>
      </div>
    </div>
  );
}
