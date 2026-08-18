'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
} from 'react';
import { SemanticIcon } from '../../brand/SemanticIcon';
import type { GuidedFoundationEvent } from '../types';
import { createCompareDraft, hasCompareNotes } from './compare-state';
import { CompareSourceBrowser } from './CompareSourceBrowser';
import { CompareSourceCard } from './CompareSourceCard';
import {
  isCurrentCompareBlock,
  validateComparePair,
} from './source-blocks';
import type {
  CompareDraft,
  CompareSlot,
  CompareSourceBundle,
  TransientSourceBlock,
} from './types';

interface CompareWorkspaceProps {
  bundle: CompareSourceBundle;
  draft: CompareDraft;
  sourceChanged: boolean;
  onEvent: Dispatch<GuidedFoundationEvent>;
}

type PendingAction = { slot: CompareSlot; action: 'replace' | 'clear' } | null;

export function CompareWorkspace({
  bundle,
  draft,
  sourceChanged,
  onEvent,
}: CompareWorkspaceProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const actionRefs = {
    a: useRef<HTMLButtonElement | null>(null),
    b: useRef<HTMLButtonElement | null>(null),
  };
  const [activeSlot, setActiveSlot] = useState<CompareSlot | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [expanded, setExpanded] = useState<Record<CompareSlot, boolean>>({ a: false, b: false });
  const [announcement, setAnnouncement] = useState(() => (
    sourceChanged ? 'Materi berubah. Pilihan dan catatan perbandingan telah dihapus.' : ''
  ));

  const hasInvalidSelection = Boolean(
    (draft.a && !isCurrentCompareBlock(bundle, draft.a))
    || (draft.b && !isCurrentCompareBlock(bundle, draft.b)),
  );
  const currentDraft = useMemo(
    () => (hasInvalidSelection
      ? createCompareDraft(bundle.materialId, bundle.sourceSignature)
      : draft),
    [bundle.materialId, bundle.sourceSignature, draft, hasInvalidSelection],
  );
  const pair = validateComparePair(bundle, currentDraft.a, currentDraft.b);
  const notesExist = hasCompareNotes(currentDraft);

  useEffect(() => {
    if (!hasInvalidSelection) return;
    onEvent({ type: 'RESET_COMPARE', sourceSignature: bundle.sourceSignature });
  }, [bundle.sourceSignature, hasInvalidSelection, onEvent]);

  useEffect(() => {
    if (!sourceChanged) return undefined;
    const focusFrame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [sourceChanged]);

  const focusSlotAction = (slot: CompareSlot) => {
    window.requestAnimationFrame(() => actionRefs[slot].current?.focus());
  };

  const openSelector = (slot: CompareSlot) => {
    if (notesExist && currentDraft[slot]) {
      setPendingAction({ slot, action: 'replace' });
      return;
    }
    setActiveSlot(slot);
    setPendingAction(null);
  };

  const clearSource = (slot: CompareSlot) => {
    if (!currentDraft[slot]) return;
    if (notesExist) {
      setPendingAction({ slot, action: 'clear' });
      return;
    }
    onEvent({ type: 'CLEAR_COMPARE_BLOCK', slot, sourceSignature: bundle.sourceSignature });
    setAnnouncement(`Bagian ${slot.toUpperCase()} dihapus.`);
    focusSlotAction(slot);
  };

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    const { slot, action } = pendingAction;
    onEvent({
      type: 'CONFIRM_COMPARE_SOURCE_REPLACEMENT',
      slot,
      replacement: action === 'replace' ? currentDraft[slot] : null,
      sourceSignature: bundle.sourceSignature,
    });
    setPendingAction(null);
    setAnnouncement('Catatan dihapus karena pasangan sumber berubah.');
    if (action === 'replace') setActiveSlot(slot);
    else focusSlotAction(slot);
  };

  const cancelPendingAction = () => {
    if (!pendingAction) return;
    const { slot } = pendingAction;
    setPendingAction(null);
    focusSlotAction(slot);
  };

  const selectSource = (block: TransientSourceBlock) => {
    if (!activeSlot || !isCurrentCompareBlock(bundle, block)) return;
    const slot = activeSlot;
    onEvent({
      type: 'SELECT_COMPARE_BLOCK',
      slot,
      block,
      sourceSignature: bundle.sourceSignature,
    });
    setActiveSlot(null);
    setAnnouncement(`${block.surface === 'summary' ? 'Rangkuman' : 'Transkrip'} · Bagian ${block.ordinal} dipilih sebagai Bagian ${slot.toUpperCase()}.`);
    focusSlotAction(slot);
  };

  const closeSelector = () => {
    if (!activeSlot) return;
    const slot = activeSlot;
    setActiveSlot(null);
    focusSlotAction(slot);
  };

  return (
    <section
      className="notara-compare-workspace"
      data-pair-state={pair.valid ? 'ready' : 'selecting'}
      aria-labelledby="compare-workspace-heading"
      aria-describedby="compare-lifecycle-note"
    >
      <header className="notara-compare-intro">
        <span className="notara-guided-node-kind">
          <SemanticIcon name="relationship" size={18} />
          Bandingkan dua bagian
        </span>
        <h3 id="compare-workspace-heading" ref={headingRef} tabIndex={-1}>Pilih dua bagian sumber</h3>
        <p>Pilih dua bagian dari materi aktif, lalu lihat keduanya berdampingan sebelum menulis catatanmu.</p>
      </header>

      <div id="compare-lifecycle-note" className="notara-compare-lifecycle-note" role="note">
        <SemanticIcon name="source-evidence" size={18} />
        <span>Kutipan tetap persis seperti sumber. Catatan belum disimpan dan akan berakhir jika halaman dimuat ulang.</span>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <div className="notara-compare-phase-heading">
        <span aria-hidden="true">1</span>
        <div>
          <strong>Pilih dua kutipan</strong>
          <p>Gunakan Rangkuman, Transkrip, atau gabungkan keduanya.</p>
        </div>
      </div>

      <div className="notara-compare-source-grid">
        {(['a', 'b'] as const).map((slot) => (
          <div key={slot} className="notara-compare-source-slot">
            <CompareSourceCard
              slot={slot}
              block={currentDraft[slot]}
              expanded={expanded[slot]}
              actionRef={actionRefs[slot]}
              onOpen={openSelector}
              onClear={clearSource}
              onToggleExpanded={(target) => setExpanded((current) => ({
                ...current,
                [target]: !current[target],
              }))}
            />
            {pendingAction?.slot === slot && (
              <div className="notara-compare-replacement-confirmation" role="region" aria-label={`${pendingAction.action === 'replace' ? 'Konfirmasi penggantian' : 'Konfirmasi penghapusan'} Bagian ${slot.toUpperCase()}`}>
                <strong>{pendingAction.action === 'replace' ? 'Ganti bagian?' : 'Hapus bagian?'}</strong>
                <p>{pendingAction.action === 'replace'
                  ? 'Mengganti bagian akan menghapus catatan yang merujuk pada pasangan saat ini.'
                  : 'Menghapus bagian akan menghapus catatan yang merujuk pada pasangan saat ini.'}</p>
                <div>
                  <button type="button" className="notara-secondary-button" onClick={cancelPendingAction}>
                    Batal
                  </button>
                  <button type="button" className="notara-compare-warning-button" onClick={confirmPendingAction}>
                    {pendingAction.action === 'replace' ? 'Ganti dan hapus catatan' : 'Hapus bagian dan catatan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {activeSlot && (
        <CompareSourceBrowser
          slot={activeSlot}
          bundle={bundle}
          oppositeBlockId={(activeSlot === 'a' ? currentDraft.b : currentDraft.a)?.id ?? null}
          onSelect={selectSource}
          onClose={closeSelector}
        />
      )}

      {pair.valid ? (
        <>
          <div className="notara-compare-pair-label" aria-label="Pasangan sumber siap">
            <span>Bagian A</span>
            <i aria-hidden="true" />
            <SemanticIcon name="relationship" size={18} />
            <i aria-hidden="true" />
            <span>Bagian B</span>
          </div>

          <div className="notara-compare-phase-heading">
            <span aria-hidden="true">2</span>
            <div>
              <strong>Tulis catatanmu</strong>
              <p>Gunakan bahasamu sendiri. Nalira tidak membuat kesimpulan untukmu.</p>
            </div>
          </div>

          <div className="notara-compare-notes">
            <header>
              <span>Catatanmu</span>
              <small>Ditulis olehmu</small>
            </header>
            <label htmlFor="compare-similarities" data-note="similarities">
              Apa yang sama?
              <textarea
                id="compare-similarities"
                rows={4}
                value={currentDraft.notes.similarities}
                onChange={(event) => onEvent({
                  type: 'SET_COMPARE_NOTE',
                  field: 'similarities',
                  value: event.target.value,
                  sourceSignature: bundle.sourceSignature,
                })}
                placeholder="Tuliskan persamaan yang kamu lihat pada dua kutipan."
              />
            </label>
            <label htmlFor="compare-differences" data-note="differences">
              Apa yang berbeda?
              <textarea
                id="compare-differences"
                rows={4}
                value={currentDraft.notes.differences}
                onChange={(event) => onEvent({
                  type: 'SET_COMPARE_NOTE',
                  field: 'differences',
                  value: event.target.value,
                  sourceSignature: bundle.sourceSignature,
                })}
                placeholder="Tuliskan perbedaan berdasarkan kutipan yang dipilih."
              />
            </label>
            <label htmlFor="compare-remaining-question" data-note="question">
              Apa yang masih ingin kamu tanyakan?
              <textarea
                id="compare-remaining-question"
                rows={3}
                value={currentDraft.notes.remainingQuestion}
                onChange={(event) => onEvent({
                  type: 'SET_COMPARE_NOTE',
                  field: 'remainingQuestion',
                  value: event.target.value,
                  sourceSignature: bundle.sourceSignature,
                })}
                placeholder="Tulis pertanyaan yang masih tersisa."
              />
            </label>
          </div>
        </>
      ) : (
        <p className="notara-compare-pair-guidance">
          Pilih dua bagian yang berbeda untuk membuka area catatan. Kamu tetap dapat melanjutkan tanpa menulis catatan.
        </p>
      )}
    </section>
  );
}
