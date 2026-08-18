'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import {
  filterCompareBlocks,
  INITIAL_RENDERED_BLOCKS,
  RENDER_BLOCK_BATCH,
} from './source-blocks';
import type {
  CompareSlot,
  CompareSourceBundle,
  CompareSourceResult,
  CompareSourceSurface,
  TransientSourceBlock,
} from './types';

interface CompareSourceBrowserProps {
  slot: CompareSlot;
  bundle: CompareSourceBundle;
  oppositeBlockId: string | null;
  onSelect: (block: TransientSourceBlock) => void;
  onClose: () => void;
}

const surfaceLabels: Record<CompareSourceSurface, string> = {
  summary: 'Rangkuman',
  transcript: 'Transkrip',
};

function unavailableReason(result: CompareSourceResult): string {
  switch (result.status) {
    case 'empty':
      return 'Sumber kosong.';
    case 'too-large':
      return 'Sumber terlalu besar untuk dipilih dengan aman.';
    case 'too-many-blocks':
      return 'Sumber memiliki terlalu banyak bagian untuk ditampilkan dengan aman.';
    case 'no-selectable-blocks':
      return 'Tidak ada bagian yang cukup panjang untuk dipilih.';
    default:
      return '';
  }
}

function firstReadySurface(bundle: CompareSourceBundle): CompareSourceSurface {
  return bundle.summary.status === 'ready' ? 'summary' : 'transcript';
}

export function CompareSourceBrowser({
  slot,
  bundle,
  oppositeBlockId,
  onSelect,
  onClose,
}: CompareSourceBrowserProps) {
  const slotLabel = slot.toUpperCase();
  const selectorHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<CompareSourceSurface>(() => firstReadySurface(bundle));
  const [query, setQuery] = useState('');
  const [renderedCount, setRenderedCount] = useState<number>(INITIAL_RENDERED_BLOCKS);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);

  const selectedResult = selectedSurface === 'summary' ? bundle.summary : bundle.transcript;
  const surface = selectedResult.status === 'ready' ? selectedSurface : firstReadySurface(bundle);
  const result = surface === 'summary' ? bundle.summary : bundle.transcript;
  const filtered = useMemo(
    () => filterCompareBlocks(result.blocks, query),
    [query, result.blocks],
  );
  const visibleBlocks = filtered.slice(0, renderedCount);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => selectorHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  const chooseSurface = (next: CompareSourceSurface) => {
    const nextResult = next === 'summary' ? bundle.summary : bundle.transcript;
    if (nextResult.status !== 'ready') return;
    setSelectedSurface(next);
    setQuery('');
    setRenderedCount(INITIAL_RENDERED_BLOCKS);
    setExpandedBlockId(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <section
      id={`compare-source-browser-${slot}`}
      className="notara-compare-source-browser"
      aria-labelledby={`compare-source-browser-heading-${slot}`}
      onKeyDown={handleKeyDown}
    >
      <header>
        <div>
          <span className="notara-guided-label">Sumber materi</span>
          <h3
            id={`compare-source-browser-heading-${slot}`}
            ref={selectorHeadingRef}
            tabIndex={-1}
          >
            Pilih Bagian {slotLabel}
          </h3>
          <p>Pilih kutipan persis dari sumber. Nalira tidak menyusun atau menilai hubungan antarbagiannya.</p>
        </div>
        <button type="button" className="notara-icon-button" aria-label={`Tutup pemilih Bagian ${slotLabel}`} onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="notara-compare-source-tabs" role="tablist" aria-label="Pilih permukaan sumber">
        {(['summary', 'transcript'] as const).map((item) => {
          const itemResult = item === 'summary' ? bundle.summary : bundle.transcript;
          const disabled = itemResult.status !== 'ready';
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={surface === item}
              aria-controls={`compare-source-panel-${slot}`}
              aria-disabled={disabled}
              disabled={disabled}
              title={disabled ? unavailableReason(itemResult) : undefined}
              onClick={() => chooseSurface(item)}
            >
              {surfaceLabels[item]}
            </button>
          );
        })}
      </div>

      <div className="notara-compare-source-tools">
        <label htmlFor={`compare-source-filter-${slot}`}>
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Cari kata dalam materi</span>
          <input
            id={`compare-source-filter-${slot}`}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setRenderedCount(INITIAL_RENDERED_BLOCKS);
            }}
            placeholder="Cari kata dalam materi"
            autoComplete="off"
          />
        </label>
        <span aria-label={`${filtered.length} hasil dari ${surfaceLabels[surface]}`}>
          {filtered.length} bagian
        </span>
      </div>

      <div id={`compare-source-panel-${slot}`} role="tabpanel" className="notara-compare-source-panel">
        {filtered.length === 0 ? (
          <p className="notara-compare-empty-result">Tidak ada bagian yang memuat kata tersebut.</p>
        ) : (
          <ol className="notara-compare-source-list">
            {visibleBlocks.map((block) => {
              const duplicate = block.id === oppositeBlockId;
              const disabled = !block.selectable || duplicate;
              const disabledReason = duplicate
                ? `Sudah dipakai sebagai Bagian ${slot === 'a' ? 'B' : 'A'}`
                : !block.selectable
                  ? 'Bagian terlalu pendek untuk dipilih.'
                  : '';
              const expanded = expandedBlockId === block.id;
              const long = block.exactText.length > 420 || block.exactText.split(/\r\n|\r|\n/u).length > 7;
              const excerptId = `compare-source-excerpt-${slot}-${block.surface}-${block.ordinal}`;
              const disabledReasonId = `compare-source-disabled-${slot}-${block.ordinal}`;
              const describedBy = [excerptId, disabled ? disabledReasonId : null].filter(Boolean).join(' ');
              return (
                <li key={block.id}>
                  <button
                    type="button"
                    className="notara-compare-source-option"
                    data-disabled={disabled}
                    disabled={disabled}
                    aria-label={`${surfaceLabels[block.surface]}, bagian ${block.ordinal} dari ${result.blocks.length}`}
                    aria-describedby={describedBy}
                    onClick={() => onSelect(block)}
                  >
                    <span>
                      {surfaceLabels[block.surface]} · Bagian {block.ordinal}
                    </span>
                    {block.contextLabel && <strong>{block.contextLabel}</strong>}
                    <span id={excerptId} className="notara-compare-source-option-text" data-expanded={expanded}>
                      {block.exactText}
                    </span>
                  </button>
                  {disabled && (
                    <small id={disabledReasonId}>{disabledReason}</small>
                  )}
                  {long && (
                    <button
                      type="button"
                      className="notara-compare-source-option-toggle"
                      aria-expanded={expanded}
                      aria-controls={excerptId}
                      aria-label={`${expanded ? 'Ringkas' : 'Lihat lengkap'} ${surfaceLabels[block.surface]} bagian ${block.ordinal}`}
                      onClick={() => setExpandedBlockId(expanded ? null : block.id)}
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {expanded ? 'Ringkas' : 'Lihat lengkap'}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {renderedCount < filtered.length && (
          <button
            type="button"
            className="notara-secondary-button notara-compare-load-more"
            onClick={() => setRenderedCount((current) => current + RENDER_BLOCK_BATCH)}
            aria-label={`Tampilkan ${Math.min(RENDER_BLOCK_BATCH, filtered.length - renderedCount)} bagian berikutnya`}
          >
            Tampilkan lebih banyak
          </button>
        )}
      </div>
    </section>
  );
}
