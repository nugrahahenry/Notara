'use client';

import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  ExternalLink,
  Link2Off,
} from 'lucide-react';
import type { Summary } from '@/lib/types';
import { EmptyStateArtwork } from '../brand/ProductArtwork';
import { WorkspaceAmbientHeader } from './WorkspaceAmbientHeader';

type SharedFilter = 'all' | 'friends' | 'mine';

interface SharedWorkspaceProps {
  summaries: Summary[];
  onOpenSummary: (summary: Summary) => void;
  onCopyLink: (summary: Summary) => void;
  onDisableLink: (summary: Summary) => void;
}

export function SharedWorkspace({ summaries, onOpenSummary, onCopyLink, onDisableLink }: SharedWorkspaceProps) {
  const [filter, setFilter] = useState<SharedFilter>('all');
  const publicSummaries = summaries.filter((summary) => summary.is_public && summary.public_slug);
  const showFriends = filter === 'all' || filter === 'friends';
  const showMine = filter === 'all' || filter === 'mine';
  const ambientState = filter === 'friends' ? 'inbound' : filter === 'mine' ? 'outbound' : 'default';

  return (
    <div className="notara-workspace-page mx-auto max-w-6xl space-y-8">
      <WorkspaceAmbientHeader
        variant="shared"
        state={ambientState}
        title="Dua arah berbagi pengetahuan"
        description="Materi dari teman bergerak masuk; link milikmu bergerak keluar. Arah dan tindakannya selalu jelas."
        meta={<span>{publicSummaries.length} link aktif</span>}
      />

      <div className="notara-filter-tabs" role="tablist" aria-label="Filter materi dibagikan">
        {([
          ['all', 'Semua'],
          ['friends', 'Dari teman'],
          ['mine', 'Link saya'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>

      <div className="notara-sharing-directions" aria-hidden="true">
        <span data-direction="in"><ArrowDownLeft className="h-4 w-4" /> pengetahuan masuk</span>
        <i />
        <span data-direction="out">akses keluar <ArrowUpRight className="h-4 w-4" /></span>
      </div>

      {showFriends && (
        <section aria-labelledby="shared-friends-heading">
          <div className="notara-section-heading">
            <div><span className="notara-eyebrow">Dari teman</span><h2 id="shared-friends-heading">Masuk ke ruang belajarmu</h2></div>
          </div>
          <div className="notara-honest-unavailable">
            <EmptyStateArtwork variant="shared" size={64} />
            <div>
              <strong>Inbox berbagi langsung belum tersedia</strong>
              <p>Saat ini teman dapat berbagi melalui link publik. Kotak masuk langsung, pengaturan izin, dan batas waktu link akan hadir setelah alurnya siap.</p>
            </div>
            <span>Tersedia lewat link</span>
          </div>
        </section>
      )}

      {showMine && (
        <section aria-labelledby="shared-mine-heading">
          <div className="notara-section-heading">
            <div><span className="notara-eyebrow">Link saya</span><h2 id="shared-mine-heading">Akses yang kamu keluarkan</h2></div>
            <span>{publicSummaries.length} link aktif</span>
          </div>
          {publicSummaries.length === 0 ? (
            <div className="notara-empty-foundation">
              <EmptyStateArtwork variant="shared" size={72} />
              <div><h2>Belum ada link publik</h2><p>Buka sebuah materi lalu aktifkan link dari tindakan Bagikan.</p></div>
            </div>
          ) : (
            <div className="notara-shared-list">
              {publicSummaries.map((summary) => (
                <article key={summary.id}>
                  <div className="notara-shared-direction" aria-label="Link keluar"><ArrowUpRight className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => onOpenSummary(summary)} className="block max-w-full text-left">
                      <strong className="block truncate text-[var(--text-primary)]">{summary.title}</strong>
                    </button>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
                      <span>Publik / siapa pun dengan link</span>
                      <span>Tanpa batas waktu otomatis</span>
                      <span>Metrik pembuka/komentar belum tersedia</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => onCopyLink(summary)} title="Salin link"><Copy className="h-4 w-4" /><span>Salin</span></button>
                    <a href={`/s/${summary.public_slug}`} target="_blank" rel="noopener noreferrer" title="Buka link"><ExternalLink className="h-4 w-4" /><span>Buka</span></a>
                    <button type="button" onClick={() => onDisableLink(summary)} title="Nonaktifkan link"><Link2Off className="h-4 w-4" /><span>Nonaktifkan</span></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
