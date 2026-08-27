'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
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

interface DraftDecision {
  contextLabel: TranscriptContextLabel;
  summaryTreatment: TranscriptSummaryTreatment;
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
  const [suggestions, setSuggestions] = useState<Map<number, TranscriptContextSuggestion>>(new Map());
  const [annotations, setAnnotations] = useState<Map<number, TranscriptContextAnnotation>>(new Map());
  const [drafts, setDrafts] = useState<Map<number, DraftDecision>>(new Map());
  const [savingSegmentId, setSavingSegmentId] = useState<number | null>(null);
  const [saveErrorSegmentId, setSaveErrorSegmentId] = useState<number | null>(null);
  const [savedSegmentId, setSavedSegmentId] = useState<number | null>(null);

  const segmentIds = useMemo(() => segments.map((segment) => segment.id), [segments]);

  useEffect(() => {
    setAnalysisState('idle');
    setSuggestions(new Map());
    setDrafts(new Map());
    setSavingSegmentId(null);
    setSaveErrorSegmentId(null);
    setSavedSegmentId(null);
    setAnnotations(new Map(
      segments.flatMap((segment) => (
        segment.currentContext ? [[segment.id, segment.currentContext] as const] : []
      )),
    ));
  }, [segments]);

  const analyzePage = async () => {
    if (
      !contextAvailable
      || analysisState === 'loading'
      || savingSegmentId !== null
      || segmentIds.length === 0
    ) return;
    setAnalysisState('loading');
    setSuggestions(new Map());
    setDrafts(new Map());
    setSaveErrorSegmentId(null);
    setSavedSegmentId(null);

    try {
      const response = await fetch('/api/transcript-context/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryId, segmentIds }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error('analysis-failed');

      const parsed = readSuggestions(body, new Set(segmentIds));
      if (!parsed) throw new Error('invalid-analysis-response');

      const nextSuggestions = new Map(parsed.map((suggestion) => [suggestion.segmentId, suggestion]));
      setSuggestions(nextSuggestions);
      setDrafts(new Map(segments.map((segment) => [
        segment.id,
        draftFrom(annotations.get(segment.id) ?? null, nextSuggestions.get(segment.id)),
      ])));
      setAnalysisState('ready');
    } catch {
      setAnalysisState('error');
    }
  };

  const updateDraft = (segmentId: number, update: Partial<DraftDecision>) => {
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
    setSavedSegmentId(null);
    setSaveErrorSegmentId(null);
  };

  const ignoreSuggestion = (segmentId: number) => {
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
    setSavedSegmentId(null);
    setSaveErrorSegmentId(null);
  };

  const saveDecision = async (segmentId: number) => {
    const draft = drafts.get(segmentId)
      ?? draftFrom(annotations.get(segmentId) ?? null, suggestions.get(segmentId));
    setSavingSegmentId(segmentId);
    setSaveErrorSegmentId(null);
    setSavedSegmentId(null);

    try {
      const saved = await saveTranscriptContextDecision({
        segmentId,
        contextLabel: draft.contextLabel,
        summaryTreatment: draft.summaryTreatment,
      });
      setAnnotations((current) => new Map(current).set(segmentId, saved));
      setSuggestions((current) => {
        const next = new Map(current);
        next.delete(segmentId);
        return next;
      });
      setDrafts((current) => new Map(current).set(segmentId, {
        contextLabel: saved.contextLabel,
        summaryTreatment: saved.summaryTreatment,
      }));
      setSavedSegmentId(segmentId);
    } catch {
      setSaveErrorSegmentId(segmentId);
    } finally {
      setSavingSegmentId(null);
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
          {!contextAvailable && (
            <p className="notara-context-availability" role="status">
              Kontrol konteks belum tersedia di environment ini. Transkrip tetap aman dibaca.
            </p>
          )}
          {analysisState === 'error' && (
            <p className="notara-context-error" role="alert">
              <AlertCircle className="h-4 w-4" aria-hidden="true" /> Analisis belum berhasil. Coba lagi tanpa kehilangan transkrip.
            </p>
          )}
          {analysisState === 'ready' && (
            <p className="notara-context-ready" role="status">
              <Check className="h-4 w-4" aria-hidden="true" /> Usulan siap ditinjau. Belum ada keputusan yang disimpan otomatis.
            </p>
          )}
        </div>
        <button
          className="notara-context-analyze-button"
          type="button"
          disabled={
            !contextAvailable
            || segments.length === 0
            || analysisState === 'loading'
            || savingSegmentId !== null
          }
          onClick={() => void analyzePage()}
        >
          {analysisState === 'loading'
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {analysisState === 'loading' ? 'Menganalisis…' : 'Analisis konteks halaman'}
        </button>
      </section>

      <ol className="notara-transcript-segment-list" start={listStart}>
        {segments.map((segment) => {
          const suggestion = suggestions.get(segment.id);
          const annotation = annotations.get(segment.id) ?? null;
          const draft = drafts.get(segment.id) ?? draftFrom(annotation, suggestion);
          const showDecision = Boolean(suggestion || annotation);
          const isSaving = savingSegmentId === segment.id;
          const controlsBusy = savingSegmentId !== null || analysisState === 'loading';
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
                  <section className="notara-context-decision" aria-label={`Konteks bagian ${segment.ordinal + 1}`}>
                    <div className="notara-context-decision-summary">
                      <strong>{suggestion ? 'Usulan Nalira' : 'Keputusan tersimpan'}</strong>
                      {suggestion && <span data-confidence={suggestion.confidence}>{CONFIDENCE_COPY[suggestion.confidence]}</span>}
                      {annotation && !suggestion && <span>Versi {annotation.version}</span>}
                    </div>
                    {suggestion && <p>{suggestion.reason}</p>}
                    {annotation && !suggestion && (
                      <p>{contextLabel(annotation.contextLabel)} · {annotation.summaryTreatment === 'include' ? 'Tetap diutamakan' : 'Prioritas dikurangi'}</p>
                    )}

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
                        {savedSegmentId === segment.id && 'Keputusan tersimpan sebagai versi baru.'}
                        {saveErrorSegmentId === segment.id && 'Belum tersimpan. Coba lagi.'}
                      </span>
                    </div>
                  </section>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
