'use client';

import type { RefObject } from 'react';
import { ChevronDown, ChevronUp, FileText, Trash2 } from 'lucide-react';
import type { CompareSlot, TransientSourceBlock } from './types';

interface CompareSourceCardProps {
  slot: CompareSlot;
  block: TransientSourceBlock | null;
  expanded: boolean;
  actionRef: RefObject<HTMLButtonElement | null>;
  onOpen: (slot: CompareSlot) => void;
  onClear: (slot: CompareSlot) => void;
  onToggleExpanded: (slot: CompareSlot) => void;
}

const surfaceLabels = {
  summary: 'Rangkuman',
  transcript: 'Transkrip',
} as const;

export function CompareSourceCard({
  slot,
  block,
  expanded,
  actionRef,
  onOpen,
  onClear,
  onToggleExpanded,
}: CompareSourceCardProps) {
  const slotLabel = slot.toUpperCase();

  if (!block) {
    return (
      <article className="notara-compare-source-card" data-empty="true" aria-label={`Bagian ${slotLabel} belum dipilih`}>
        <header>
          <span>Bagian {slotLabel}</span>
          <small>Belum dipilih</small>
        </header>
        <div className="notara-compare-source-empty">
          <FileText className="h-5 w-5" aria-hidden="true" />
          <p>Pilih satu kutipan persis dari materi aktif.</p>
          <button
            ref={actionRef}
            type="button"
            className="notara-secondary-button"
            aria-label={`Pilih Bagian ${slotLabel} dari materi aktif`}
            onClick={() => onOpen(slot)}
          >
            Pilih Bagian {slotLabel}
          </button>
        </div>
      </article>
    );
  }

  const isLong = block.exactText.length > 420 || block.exactText.split(/\r\n|\r|\n/u).length > 7;
  const excerptId = `compare-source-card-excerpt-${slot}`;
  return (
    <article className="notara-compare-source-card" data-empty="false" aria-label={`Bagian ${slotLabel}`}>
      <header>
        <div>
          <span>Bagian {slotLabel}</span>
          <small>{surfaceLabels[block.surface]} · Bagian {block.ordinal}</small>
        </div>
        <FileText className="h-4 w-4" aria-hidden="true" />
      </header>
      <div className="notara-compare-source-content">
        {block.contextLabel && <span className="notara-compare-context-label">{block.contextLabel}</span>}
        <p id={excerptId} className="notara-compare-exact-text" data-expanded={expanded}>
          {block.exactText}
        </p>
        {isLong && (
          <button
            type="button"
            className="notara-compare-text-toggle"
            aria-expanded={expanded}
            aria-controls={excerptId}
            aria-label={`${expanded ? 'Ringkas' : 'Lihat lengkap'} Bagian ${slotLabel}`}
            onClick={() => onToggleExpanded(slot)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? 'Ringkas' : 'Lihat lengkap'}
          </button>
        )}
      </div>
      <footer>
        <button
          ref={actionRef}
          type="button"
          className="notara-secondary-button"
          aria-label={`Ganti Bagian ${slotLabel}, saat ini ${surfaceLabels[block.surface]} bagian ${block.ordinal}`}
          onClick={() => onOpen(slot)}
        >
          Ganti bagian
        </button>
        <button
          type="button"
          className="notara-compare-clear-button"
          aria-label={`Hapus Bagian ${slotLabel}`}
          onClick={() => onClear(slot)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Hapus
        </button>
      </footer>
    </article>
  );
}

