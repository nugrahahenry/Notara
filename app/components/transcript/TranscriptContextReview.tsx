'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  LoaderCircle,
  Sparkles,
  X,
} from 'lucide-react';
import {
  isTranscriptContextLabel,
  isTranscriptSummaryTreatment,
  type TranscriptContextAnnotation,
  type TranscriptContextConfidence,
  type TranscriptContextLabel,
  type TranscriptContextSuggestion,
  type TranscriptSummaryTreatment,
} from '@/lib/transcript/context';
import {
  getTranscriptContextAnalysisErrorCopy,
  transcriptContextNeedsPriorityReview,
  type TranscriptContextAnalysisErrorCopy,
} from '@/lib/transcript/context-review';
import { saveTranscriptContextDecision } from '@/lib/transcript/context-reader';
import {
  formatTranscriptTimecode,
  type TranscriptEvidenceSegment,
} from '@/lib/transcript/evidence';

interface TranscriptContextReviewProps {
  summaryId: string;
  segments: TranscriptEvidenceSegment[];
  listStart: number;
  contextAvailable: boolean;
}

type AnalysisState = 'idle' | 'loading' | 'ready' | 'error';
type ReviewMode = 'all' | 'priority';

interface DraftDecision {
  contextLabel: TranscriptContextLabel;
  summaryTreatment: TranscriptSummaryTreatment;
}

class ContextAnalysisRequestError extends Error {
  constructor(readonly status: number | null) {
    super('context-analysis-request-failed');
  }
}

const CONTEXT_OPTIONS: Array<{ value: TranscriptContextLabel; label: string }> = [
  { value: 'lecturer_explanation', label: 'Penjelasan pengajar' },
  { value: 'student_question', label: 'Pertanyaan mahasiswa' },
  { value: 'class_discussion', label: 'Diskusi kelas' },
  { value: 'side_conversation', label: 'Obrolan samping' },
  { value: 'unknown', label: 'Belum diketahui' },
];

const TREATMENT_OPTIONS: Array<{ value: TranscriptSummaryTreatment; label: string }> = [
  { value: 'include', label: 'Tetap utamakan' },
  { value: 'deprioritize', label: 'Kurangi prioritas' },
];

const CONFIDENCE_COPY: Record<TranscriptContextConfidence, string> = {
  low: 'Keyakinan rendah',
  medium: 'Keyakinan sedang',
  high: 'Keyakinan tinggi',
};

function contextLabel(value: TranscriptContextLabel): string {
  return CONTEXT_OPTIONS.find((option) => option.value === value)?.label ?? 'Belum diketahui';
}

function isConfidence(value: unknown): value is TranscriptContextConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function readSuggestions(
  value: unknown,
  allowedSegmentIds: Set<number>,
): TranscriptContextSuggestion[] | null {
  if (!value || typeof value !== 'object') return null;
  const rows = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(rows)) return null;

  const suggestions: TranscriptContextSuggestion[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') return null;
    const candidate = row as Record<string, unknown>;
    const segmentId = candidate.segmentId;
    const proposedContext = candidate.proposedContext;
    const proposedTreatment = candidate.proposedTreatment;
    const confidence = candidate.confidence;
    const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';

    if (
      typeof segmentId !== 'number'
      || !Number.isSafeInteger(segmentId)
      || !allowedSegmentIds.has(segmentId)
      || seen.has(segmentId)
      || !isTranscriptContextLabel(proposedContext)
      || !isTranscriptSummaryTreatment(proposedTreatment)
      || !isConfidence(confidence)
      || !reason
    ) {
      return null;
    }

    seen.add(segmentId);
    suggestions.push({
      segmentId,
      proposedContext,
      proposedTreatment,
      confidence,
      reason: reason.slice(0, 180),
    });
  }

  return suggestions.length === allowedSegmentIds.size ? suggestions : null;
}

function draftFrom(
  annotation: TranscriptContextAnnotation | null,
  suggestion: TranscriptContextSuggestion | undefined,
): DraftDecision {
  if (annotation) {
    return {
      contextLabel: annotation.contextLabel,
      summaryTreatment: annotation.summaryTreatment,
    };
  }
  if (suggestion) {
    return {
      contextLabel: suggestion.proposedContext,
      summaryTreatment: suggestion.proposedTreatment,
    };
  }
  return { contextLabel: 'unknown', summaryTreatment: 'include' };
}

export function TranscriptContextReview({
  summaryId,
  segments,
  listStart,
  contextAvailable,
}: TranscriptContextReviewProps) {
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [analysisError, setAnalysisError] = useState<TranscriptContextAnalysisErrorCopy | null>(null);
  const [suggestions, setSuggestions] = useState<Map<number, TranscriptContextSuggestion>>(new Map());
  const [annotations, setAnnotations] = useState<Map<number, TranscriptContextAnnotation>>(() => new Map(
    segments.flatMap((segment) => (
      segment.currentContext ? [[segment.id, segment.currentContext] as const] : []
    )),
  ));
  const [drafts, setDrafts] = useState<Map<number, DraftDecision>>(new Map());
  const [savingSegmentIds, setSavingSegmentIds] = useState<Set<number>>(() => new Set());
  const [saveErrorSegmentIds, setSaveErrorSegmentIds] = useState<Set<number>>(() => new Set());
  const [savedSegmentIds, setSavedSegmentIds] = useState<Set<number>>(() => new Set());
  const [reviewMode, setReviewMode] = useState<ReviewMode>('all');
  const [expandedSegmentId, setExpandedSegmentId] = useState<number | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const annotationsRef = useRef(annotations);
  const savingSegmentIdsRef = useRef<Set<number>>(new Set());

  const segmentIds = useMemo(() => segments.map((segment) => segment.id), [segments]);
  const prioritySegmentIds = useMemo(() => new Set(
    Array.from(suggestions.values())
      .filter(transcriptContextNeedsPriorityReview)
      .map((suggestion) => suggestion.segmentId),
  ), [suggestions]);
  const visibleSegments = useMemo(() => (
    reviewMode === 'priority'
      ? segments.filter((segment) => prioritySegmentIds.has(segment.id))
      : segments
  ), [prioritySegmentIds, reviewMode, segments]);

  useEffect(() => () => {
    analysisAbortRef.current?.abort();
  }, []);

  const analyzePage = async () => {
    if (
      !contextAvailable
      || analysisAbortRef.current !== null
      || savingSegmentIdsRef.current.size > 0
      || segmentIds.length === 0
    ) return;
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setAnalysisState('loading');
    setAnalysisError(null);
    setSaveErrorSegmentIds(new Set());
    setSavedSegmentIds(new Set());

    try {
      const response = await fetch('/api/transcript-context/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryId, segmentIds }),
        signal: controller.signal,
      });
      if (!response.ok) throw new ContextAnalysisRequestError(response.status);

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ContextAnalysisRequestError(502);
      }

      const parsed = readSuggestions(body, new Set(segmentIds));
      if (!parsed) throw new ContextAnalysisRequestError(502);

      const nextSuggestions = new Map(parsed.map((suggestion) => [suggestion.segmentId, suggestion]));
      setSuggestions(nextSuggestions);
      setDrafts(new Map(segments.map((segment) => [
        segment.id,
        draftFrom(annotationsRef.current.get(segment.id) ?? null, nextSuggestions.get(segment.id)),
      ])));
      setReviewMode('all');
      setExpandedSegmentId(null);
      setAnalysisState('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ContextAnalysisRequestError ? error.status : null;
      setAnalysisError(getTranscriptContextAnalysisErrorCopy(
        status,
        typeof navigator === 'undefined' || navigator.onLine,
      ));
      setAnalysisState('error');
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
    }
  };

  const updateDraft = (segmentId: number, update: Partial<DraftDecision>) => {
    if (analysisAbortRef.current || savingSegmentIdsRef.current.size > 0) return;
    const suggestion = suggestions.get(segmentId);
    const annotation = annotations.get(segmentId) ?? null;
    setDrafts((current) => {
      const next = new Map(current);
      next.set(segmentId, {
        ...draftFrom(annotation, suggestion),
        ...current.get(segmentId),
        ...update,
      });
      return next;
    });
    setSavedSegmentIds((current) => {
      const next = new Set(current);
      next.delete(segmentId);
      return next;
    });
    setSaveErrorSegmentIds((current) => {
      const next = new Set(current);
      next.delete(segmentId);
      return next;
    });
  };

  const ignoreSuggestion = (segmentId: number) => {
    if (analysisAbortRef.current || savingSegmentIdsRef.current.size > 0) return;
    setSuggestions((current) => {
      const next = new Map(current);
      next.delete(segmentId);
      return next;
    });
    setDrafts((current) => {
      const next = new Map(current);
      next.delete(segmentId);
      return next;
    });
    setSavedSegmentIds((current) => {
      const next = new Set(current);
      next.delete(segmentId);
      return next;
    });
    setSaveErrorSegmentIds((current) => {
      const next = new Set(current);
      next.delete(segmentId);
      return next;
    });
    if (expandedSegmentId === segmentId) setExpandedSegmentId(null);
  };

  const saveDecision = async (segmentId: number) => {
    if (analysisAbortRef.current || savingSegmentIdsRef.current.size > 0) return;
    const draft = drafts.get(segmentId)
      ?? draftFrom(annotations.get(segmentId) ?? null, suggestions.get(segmentId));
    savingSegmentIdsRef.current.add(segmentId);
    setSavingSegmentIds((current) => new Set(current).add(segmentId));
    setSaveErrorSegmentIds((current) => {
      const next = new Set(current);
      next.delete(segmentId);
      return next;
    });
    setSavedSegmentIds((current) => {
      const next = new Set(current);
      next.delete(segmentId);
      return next;
    });

    try {
      const saved = await saveTranscriptContextDecision({
        segmentId,
        contextLabel: draft.contextLabel,
        summaryTreatment: draft.summaryTreatment,
      });
      setAnnotations((current) => {
        const next = new Map(current).set(segmentId, saved);
        annotationsRef.current = next;
        return next;
      });
      setSuggestions((current) => {
        const next = new Map(current);
        next.delete(segmentId);
        return next;
      });
      setDrafts((current) => new Map(current).set(segmentId, {
        contextLabel: saved.contextLabel,
        summaryTreatment: saved.summaryTreatment,
      }));
      setExpandedSegmentId((current) => (current === segmentId ? null : current));
      setSavedSegmentIds((current) => new Set(current).add(segmentId));
    } catch {
      setSaveErrorSegmentIds((current) => new Set(current).add(segmentId));
    } finally {
      savingSegmentIdsRef.current.delete(segmentId);
      setSavingSegmentIds((current) => {
        const next = new Set(current);
        next.delete(segmentId);
        return next;
      });
    }
  };

  return (
    <>
      <section className="notara-context-workbench" aria-labelledby="transcript-context-title">
        <div className="notara-context-workbench-icon" aria-hidden="true">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="notara-context-workbench-copy">
          <h3 id="transcript-context-title">Tinjau konteks belajar</h3>
          <p>
            Nalira memberi usulan berdasarkan teks, bukan pengenal suara. Kamu tetap menentukan
            bagian yang penting. Belum mengubah rangkuman saat ini.
          </p>
          <div id="transcript-context-status" aria-live="polite">
            {!contextAvailable && (
              <p className="notara-context-availability">
                Kontrol konteks belum tersedia di environment ini. Transkrip tetap aman dibaca.
              </p>
            )}
            {analysisState === 'loading' && (
              <p className="notara-context-loading">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Membaca {segments.length} bagian tanpa menyimpan keputusan…
              </p>
            )}
            {analysisState === 'error' && analysisError && (
              <div className="notara-context-error" role="alert">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <span>
                  <strong>{analysisError.title}</strong>
                  <small>{analysisError.detail}</small>
                  {suggestions.size > 0 && <small>Usulan sebelumnya tetap tersedia.</small>}
                </span>
              </div>
            )}
            {analysisState === 'ready' && (
              <p className="notara-context-ready">
                <Check className="h-4 w-4" aria-hidden="true" /> {suggestions.size} usulan siap · {prioritySegmentIds.size} perlu dicek lebih dulu · {annotations.size} keputusan tersimpan.
              </p>
            )}
          </div>
          {suggestions.size > 0 && (
            <div className="notara-context-review-overview">
              <div role="group" aria-label="Tampilan review usulan konteks">
                <button type="button" aria-pressed={reviewMode === 'all'} onClick={() => setReviewMode('all')}>
                  Semua usulan <span>{suggestions.size}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={reviewMode === 'priority'}
                  disabled={prioritySegmentIds.size === 0}
                  onClick={() => setReviewMode('priority')}
                >
                  Cek lebih dulu <span>{prioritySegmentIds.size}</span>
                </button>
              </div>
              <small>Berisi usulan berkeyakinan rendah, belum diketahui, atau yang akan dikurangi prioritasnya.</small>
            </div>
          )}
        </div>
        <button
          className="notara-context-analyze-button"
          type="button"
          disabled={
            !contextAvailable
            || segments.length === 0
            || analysisState === 'loading'
            || savingSegmentIds.size > 0
          }
          aria-describedby="transcript-context-status"
          onClick={() => void analyzePage()}
        >
          {analysisState === 'loading'
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {analysisState === 'loading'
            ? 'Menganalisis…'
            : analysisState === 'error'
              ? 'Coba analisis lagi'
              : suggestions.size > 0
                ? 'Analisis ulang halaman'
                : 'Analisis konteks halaman'}
        </button>
      </section>

      {reviewMode === 'priority' && visibleSegments.length === 0 ? (
        <section className="notara-context-review-empty" role="status">
          <Check className="h-5 w-5" aria-hidden="true" />
          <strong>Tidak ada usulan prioritas yang tersisa</strong>
          <p>Kamu tetap bisa membuka semua bagian atau menjalankan analisis ulang.</p>
          <button type="button" onClick={() => setReviewMode('all')}>Lihat semua usulan</button>
        </section>
      ) : (
        <ol className="notara-transcript-segment-list" start={listStart}>
        {visibleSegments.map((segment) => {
          const suggestion = suggestions.get(segment.id);
          const annotation = annotations.get(segment.id) ?? null;
          const draft = drafts.get(segment.id) ?? draftFrom(annotation, suggestion);
          const showDecision = Boolean(suggestion || annotation);
          const isExpanded = expandedSegmentId === segment.id;
          const isSaving = savingSegmentIds.has(segment.id);
          const controlsBusy = savingSegmentIds.size > 0 || analysisState === 'loading';
          const decisionChanged = !annotation
            || annotation.contextLabel !== draft.contextLabel
            || annotation.summaryTreatment !== draft.summaryTreatment;

          return (
            <li key={segment.id} data-needs-review={segment.reviewReasons.length > 0}>
              <time dateTime={`PT${Math.floor(segment.startMs / 1000)}S`}>
                {formatTranscriptTimecode(segment.startMs)}
              </time>
              <div>
                <p>{segment.text}</p>
                {segment.reviewReasons.length > 0 && (
                  <div className="notara-transcript-segment-flags" aria-label="Alasan bagian perlu ditinjau">
                    {segment.reviewReasons.includes('low-confidence') && <span>Keyakinan transkripsi rendah</span>}
                    {segment.reviewReasons.includes('high-no-speech') && <span>Ucapan samar atau banyak jeda</span>}
                  </div>
                )}

                {showDecision && (
                  <section
                    className="notara-context-decision"
                    data-expanded={isExpanded}
                    data-priority={suggestion ? transcriptContextNeedsPriorityReview(suggestion) : false}
                    aria-label={`Konteks bagian ${segment.ordinal + 1}`}
                    aria-busy={isSaving}
                  >
                    <div className="notara-context-decision-summary">
                      <div>
                        <strong>{suggestion ? 'Usulan Nalira' : 'Keputusan tersimpan'}</strong>
                        {suggestion && <span data-confidence={suggestion.confidence}>{CONFIDENCE_COPY[suggestion.confidence]}</span>}
                        {annotation && !suggestion && <span>Versi {annotation.version}</span>}
                      </div>
                      <button
                        className="notara-context-decision-toggle"
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`context-editor-${segment.id}`}
                        disabled={controlsBusy}
                        onClick={() => setExpandedSegmentId(isExpanded ? null : segment.id)}
                      >
                        {isExpanded ? 'Tutup' : suggestion ? 'Tinjau usulan' : 'Ubah keputusan'}
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="notara-context-decision-result">
                      {contextLabel(draft.contextLabel)} · {draft.summaryTreatment === 'include' ? 'Tetap diutamakan' : 'Prioritas dikurangi'}
                    </p>
                    {suggestion && <p className="notara-context-decision-reason">{suggestion.reason}</p>}

                    <div
                      className="notara-context-editor"
                      id={`context-editor-${segment.id}`}
                      hidden={!isExpanded}
                    >
                        <div className="notara-context-fields">
                          <label>
                            <span>Fungsi bagian</span>
                            <select
                              disabled={controlsBusy}
                              value={draft.contextLabel}
                              onChange={(event) => updateDraft(segment.id, {
                                contextLabel: event.target.value as TranscriptContextLabel,
                              })}
                            >
                              {CONTEXT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Perlakuan belajar</span>
                            <select
                              disabled={controlsBusy}
                              value={draft.summaryTreatment}
                              onChange={(event) => updateDraft(segment.id, {
                                summaryTreatment: event.target.value as TranscriptSummaryTreatment,
                              })}
                            >
                              {TREATMENT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="notara-context-actions">
                          <button
                            type="button"
                            disabled={controlsBusy || !decisionChanged}
                            onClick={() => void saveDecision(segment.id)}
                          >
                            {isSaving
                              ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                              : <Check className="h-4 w-4" aria-hidden="true" />}
                            {isSaving ? 'Menyimpan…' : decisionChanged ? 'Simpan keputusan' : 'Sudah tersimpan'}
                          </button>
                          {suggestion && (
                            <button type="button" disabled={controlsBusy} onClick={() => ignoreSuggestion(segment.id)}>
                              <X className="h-4 w-4" aria-hidden="true" /> Abaikan usulan
                            </button>
                          )}
                          <span aria-live="polite">
                            {savedSegmentIds.has(segment.id) && 'Keputusan tersimpan sebagai versi baru.'}
                            {saveErrorSegmentIds.has(segment.id) && 'Perubahan belum tersimpan. Pilihanmu tetap ada; coba lagi.'}
                          </span>
                        </div>
                    </div>
                  </section>
                )}
              </div>
            </li>
          );
        })}
        </ol>
      )}
    </>
  );
}
