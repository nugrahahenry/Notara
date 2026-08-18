'use client';

import { useEffect, useMemo, useRef, type Dispatch, type ReactNode, type RefObject } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  X,
} from 'lucide-react';
import { SemanticIcon, type NaliraSemanticIconName } from '../brand/SemanticIcon';
import { CompareWorkspace } from './compare/CompareWorkspace';
import { createCompareDraft } from './compare/compare-state';
import { canBuildComparePair, createCompareSourceBundle } from './compare/source-blocks';
import {
  GUIDED_OBJECTIVE_OPTIONS,
  getGuidedObjectiveLabel,
  isValidGuidedObjective,
} from './objective';
import type {
  GuidedCheckReflection,
  GuidedFoundationEvent,
  GuidedFoundationState,
  GuidedObjectiveKind,
  GuidedReflectionChoice,
  GuidedRouteNode,
} from './types';

interface GuidedFoundationWorkspaceProps {
  materialTitle: string;
  courseName: string;
  summaryText: string;
  transcriptText: string;
  state: GuidedFoundationState;
  headingRef: RefObject<HTMLHeadingElement | null>;
  tutor: ReactNode;
  onEvent: Dispatch<GuidedFoundationEvent>;
}

const objectiveIcons: Record<GuidedObjectiveKind, NaliraSemanticIconName> = {
  'understand-core': 'summary-clarity',
  'compare-concepts': 'relationship',
  'prepare-quiz': 'quiz',
  'review-material': 'review',
  custom: 'learning-path',
};

const nodeIcons: Record<GuidedRouteNode['kind'], NaliraSemanticIconName> = {
  orient: 'summary-clarity',
  focus: 'concept',
  connect: 'relationship',
  recall: 'review',
  check: 'checkpoint',
};

const sourceLabels: Record<GuidedRouteNode['sourceSurface'], string> = {
  summary: 'Rangkuman materi',
  transcript: 'Transkrip aktif',
  reflection: 'Refleksi tanpa sumber terbuka',
};

const reflectionChoices: readonly { value: GuidedReflectionChoice; label: string }[] = [
  { value: 'yes', label: 'Ya' },
  { value: 'partly', label: 'Sebagian' },
  { value: 'not-yet', label: 'Belum' },
];

function excerpt(source: string, limit = 420): string {
  const clean = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`~[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trimEnd()}…`;
}

function getCheckGuidance(check: GuidedCheckReflection): string {
  const answered = check.canExplainCore !== null || check.canGiveExample !== null || check.remainingQuestion.trim();
  if (!answered) {
    return 'Isi refleksi ini untuk menentukan langkah yang ingin kamu tinjau kembali. Nalira tidak menghitung nilai dari jawabanmu.';
  }
  if (check.canExplainCore === 'not-yet') {
    return 'Kembali ke Fokus, lalu jelaskan inti materi dengan kalimat yang lebih sederhana. Kamu juga dapat menanyakannya kepada Nalira.';
  }
  if (check.canGiveExample === 'not-yet') {
    return 'Tinjau Hubungkan dan cari satu contoh yang benar-benar sesuai dengan materi aktif.';
  }
  if (check.canExplainCore === 'partly' || check.canGiveExample === 'partly') {
    return 'Tinjau kembali langkah yang masih terasa sebagian, lalu coba jelaskan tanpa membuka seluruh sumber.';
  }
  if (check.remainingQuestion.trim()) {
    return 'Pertanyaanmu tetap tersimpan selama draft ini terbuka. Gunakan Tanya Materi untuk memperjelasnya.';
  }
  return 'Coba jelaskan kembali inti dan contohnya tanpa membuka sumber. Tidak ada skor atau klaim penguasaan dari refleksi ini.';
}

function GuidedContextStrip({
  materialTitle,
  courseName,
  objectiveLabel,
  showDisclosure = true,
}: {
  materialTitle: string;
  courseName: string;
  objectiveLabel?: string;
  showDisclosure?: boolean;
}) {
  return (
    <div className="notara-guided-context-strip" role="note">
      <div className="notara-guided-context-source">
        <SemanticIcon name="source-evidence" size={20} />
        <span>
          <small>Sumber aktif</small>
          <strong title={materialTitle}>{materialTitle}</strong>
        </span>
      </div>
      {objectiveLabel && (
        <div>
          <small>Tujuan belajar</small>
          <strong>{objectiveLabel}</strong>
        </div>
      )}
      <div>
        <small>Cakupan</small>
        <strong>Satu materi</strong>
      </div>
      <div className="notara-guided-context-status">
        <small>Status</small>
        <strong>Draft sementara</strong>
      </div>
      {showDisclosure && (
        <p className="notara-guided-context-disclosure">
          Rute ini memakai satu materi aktif. Draft belum disimpan dan akan berakhir jika halaman dimuat ulang.
          <span className="sr-only"> Mata kuliah: {courseName}.</span>
        </p>
      )}
    </div>
  );
}

function ReflectionField({
  legend,
  field,
  value,
  onEvent,
}: {
  legend: string;
  field: 'canExplainCore' | 'canGiveExample';
  value: GuidedReflectionChoice | null;
  onEvent: Dispatch<GuidedFoundationEvent>;
}) {
  return (
    <fieldset className="notara-guided-reflection-field">
      <legend>{legend}</legend>
      <div role="radiogroup" aria-label={legend}>
        {reflectionChoices.map((choice) => (
          <label key={choice.value} data-selected={value === choice.value}>
            <input
              type="radio"
              name={`guided-${field}`}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onEvent({
                type: 'SET_CHECK_REFLECTION',
                field,
                value: choice.value,
              })}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function GuidedFoundationWorkspace({
  materialTitle,
  courseName,
  summaryText,
  transcriptText,
  state,
  headingRef,
  tutor,
  onEvent,
}: GuidedFoundationWorkspaceProps) {
  const { stage, objective, route, activeNodeIndex, responsesByNode, check } = state;
  const activeStepButtonRef = useRef<HTMLButtonElement | null>(null);
  const compareBundle = useMemo(
    () => createCompareSourceBundle(state.materialId, summaryText, transcriptText),
    [state.materialId, summaryText, transcriptText],
  );
  const compareSourceSignatureMismatch = state.compare.sourceSignature !== compareBundle.sourceSignature;
  const effectiveCompareDraft = compareSourceSignatureMismatch
    ? createCompareDraft(state.materialId, compareBundle.sourceSignature)
    : state.compare;

  useEffect(() => {
    if (!compareSourceSignatureMismatch) return;
    onEvent({ type: 'SOURCE_SIGNATURE_CHANGED', sourceSignature: compareBundle.sourceSignature });
  }, [compareBundle.sourceSignature, compareSourceSignatureMismatch, onEvent]);

  useEffect(() => {
    if (stage !== 'session') return undefined;

    const scrollFrame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      activeStepButtonRef.current?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(scrollFrame);
  }, [activeNodeIndex, stage]);

  if (stage === 'objective') {
    const objectiveIsValid = isValidGuidedObjective(objective);

    return (
      <section className="notara-guided-workspace" data-guided-stage="objective" aria-labelledby="guided-objective-heading">
        <header className="notara-guided-workspace-toolbar">
          <button type="button" onClick={() => onEvent({ type: 'BACK' })} className="notara-guided-back">
            <ArrowLeft className="h-4 w-4" /> Kembali ke materi
          </button>
        </header>

        <div className="notara-guided-stage-shell">
          <header className="notara-guided-stage-heading">
            <span className="notara-guided-label">Mulai dari tujuanmu</span>
            <h1 id="guided-objective-heading" ref={headingRef} tabIndex={-1}>Apa tujuan belajarmu?</h1>
            <p>Pilih satu tujuan untuk <strong>{materialTitle}</strong>. Nalira tidak akan mengubah tujuanmu secara diam-diam.</p>
          </header>

          <GuidedContextStrip
            materialTitle={materialTitle}
            courseName={courseName}
          />

          <fieldset className="notara-guided-objective-fieldset">
            <legend className="sr-only">Pilih tujuan belajar</legend>
            <div className="notara-guided-objective-grid">
              {GUIDED_OBJECTIVE_OPTIONS.map((option) => {
                const iconName = objectiveIcons[option.kind];
                const selected = objective?.kind === option.kind;
                return (
                  <label key={option.kind} className="notara-guided-objective-option" data-selected={selected}>
                    <input
                      type="radio"
                      name="guided-objective"
                      value={option.kind}
                      checked={selected}
                      onChange={() => onEvent({
                        type: 'SET_OBJECTIVE',
                        objective: option.kind === 'custom'
                          ? { kind: 'custom', text: objective?.kind === 'custom' ? objective.text : '' }
                          : { kind: option.kind },
                      })}
                    />
                    <span className="notara-guided-objective-icon" aria-hidden="true">
                      <SemanticIcon name={iconName} size={20} />
                    </span>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    <CheckCircle2 className="notara-guided-objective-check h-5 w-5" aria-hidden="true" />
                  </label>
                );
              })}
            </div>
          </fieldset>

          {objective?.kind === 'custom' && (
            <div className="notara-guided-custom-objective">
              <label htmlFor="guided-custom-objective">
                Tujuanmu
                <span>{objective.text.length}/240</span>
              </label>
              <textarea
                id="guided-custom-objective"
                rows={3}
                maxLength={240}
                autoFocus
                value={objective.text}
                onChange={(event) => onEvent({
                  type: 'SET_OBJECTIVE',
                  objective: { kind: 'custom', text: event.target.value },
                })}
                placeholder="Contoh: Aku ingin memahami perbedaan permintaan dan jumlah yang diminta."
              />
            </div>
          )}

          <div className="notara-guided-stage-actions">
            <span>{objectiveIsValid ? `Tujuan: ${getGuidedObjectiveLabel(objective)}` : 'Pilih satu tujuan untuk melanjutkan.'}</span>
            <button
              type="button"
              className="notara-primary-button"
              disabled={!objectiveIsValid}
              onClick={() => onEvent({ type: 'OPEN_ROUTE' })}
            >
              Susun rute <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (stage === 'route' && route) {
    return (
      <section className="notara-guided-workspace" data-guided-stage="route" aria-labelledby="guided-route-heading">
        <header className="notara-guided-workspace-toolbar">
          <button type="button" onClick={() => onEvent({ type: 'BACK' })} className="notara-guided-back">
            <ArrowLeft className="h-4 w-4" /> Ubah tujuan
          </button>
          <button type="button" onClick={() => onEvent({ type: 'EXIT' })} className="notara-guided-exit">
            <X className="h-4 w-4" /> Keluar
          </button>
        </header>

        <div className="notara-guided-stage-shell">
          <header className="notara-guided-stage-heading">
            <span className="notara-guided-label">Rute belajar</span>
            <h1 id="guided-route-heading" ref={headingRef} tabIndex={-1}>Lima langkah untuk tujuanmu</h1>
            <p>Lihat urutan sesi sebelum mulai. Kamu tetap dapat kembali dan mengubah tujuan.</p>
          </header>

          <GuidedContextStrip
            materialTitle={materialTitle}
            courseName={courseName}
            objectiveLabel={getGuidedObjectiveLabel(route.objective)}
          />

          <ol className="notara-guided-route-list">
            {route.nodes.map((node, index) => (
              <li key={node.id} data-node-kind={node.kind}>
                <span className="notara-guided-route-index" aria-hidden="true">
                  <SemanticIcon name={nodeIcons[node.kind]} size={18} />
                  <b>{index + 1}</b>
                </span>
                <div>
                  <strong>{node.title}</strong>
                  <p>{node.prompt}</p>
                  <small>{sourceLabels[node.sourceSurface]}</small>
                </div>
              </li>
            ))}
          </ol>

          <div className="notara-guided-route-note" role="note">
            <SemanticIcon name="learning-path" size={18} />
            <p>Urutan ini tetap dan transparan—bukan rekomendasi adaptif atau penilaian otomatis.</p>
          </div>

          <div className="notara-guided-stage-actions">
            <span>Sumber: {materialTitle} · {courseName}</span>
            <button type="button" className="notara-primary-button" onClick={() => onEvent({ type: 'START_SESSION' })}>
              Mulai sesi <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (stage !== 'session' || !route) return null;

  const activeNode = route.nodes[activeNodeIndex] ?? route.nodes[0];
  const isFirstNode = activeNodeIndex === 0;
  const isLastNode = activeNodeIndex === route.nodes.length - 1;
  const sourceText = activeNode.sourceSurface === 'summary'
    ? excerpt(summaryText)
    : activeNode.sourceSurface === 'transcript'
      ? excerpt(transcriptText)
      : '';
  const response = responsesByNode[activeNode.kind] ?? '';
  const showDeterministicCompare = objective?.kind === 'compare-concepts'
    && activeNode.kind === 'connect';
  const compareAvailable = canBuildComparePair(compareBundle);

  return (
    <section
      className="notara-guided-workspace"
      data-guided-stage="session"
      aria-labelledby="guided-session-heading"
      aria-describedby="guided-session-draft-note"
    >
      <header className="notara-guided-workspace-toolbar">
        <button type="button" onClick={() => onEvent({ type: 'BACK' })} className="notara-guided-back">
          <ArrowLeft className="h-4 w-4" /> Kembali ke rute
        </button>
        <button type="button" onClick={() => onEvent({ type: 'EXIT' })} className="notara-guided-exit">
          <X className="h-4 w-4" /> Keluar sesi
        </button>
      </header>

      <GuidedContextStrip
        materialTitle={materialTitle}
        courseName={courseName}
        objectiveLabel={getGuidedObjectiveLabel(route.objective)}
        showDisclosure={false}
      />

      <div className="notara-guided-session-layout">
        <div className="notara-guided-session-primary">
          <header className="notara-guided-session-heading">
            <div>
              <span className="notara-guided-label">Sesi belajar · {courseName}</span>
              <h1 id="guided-session-heading" ref={headingRef} tabIndex={-1}>{materialTitle}</h1>
              <span className="notara-guided-session-objective">Tujuan: {getGuidedObjectiveLabel(route.objective)}</span>
            </div>
            <span className="notara-guided-step-position">
              Langkah {activeNodeIndex + 1} dari {route.nodes.length}
            </span>
          </header>

          <p id="guided-session-draft-note" className="notara-guided-session-draft-note" role="note">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            <span>Draft sementara. Catatan dan refleksi belum disimpan dan akan berakhir jika halaman dimuat ulang.</span>
          </p>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            Langkah {activeNodeIndex + 1} dari {route.nodes.length}: {activeNode.title}. {activeNode.prompt}
          </p>

          <nav className="notara-guided-node-nav" aria-label="Langkah rute belajar">
            {route.nodes.map((node, index) => (
              <button
                key={node.id}
                ref={index === activeNodeIndex ? activeStepButtonRef : undefined}
                type="button"
                data-active={index === activeNodeIndex}
                aria-current={index === activeNodeIndex ? 'step' : undefined}
                aria-label={`Langkah ${index + 1} dari ${route.nodes.length}: ${node.title}`}
                aria-controls="guided-active-step"
                onClick={() => onEvent({ type: 'GO_TO_NODE', index })}
              >
                <span>{index + 1}</span>
                <strong>{node.title}</strong>
              </button>
            ))}
          </nav>

          <article id="guided-active-step" className="notara-guided-node-card" aria-labelledby={`guided-node-heading-${activeNode.id}`}>
            <header>
              <span className="notara-guided-node-kind">
                <SemanticIcon name={nodeIcons[activeNode.kind]} size={18} />
                {activeNode.title}
              </span>
              <h2 id={`guided-node-heading-${activeNode.id}`}>{activeNode.prompt}</h2>
            </header>

            {activeNode.kind === 'check' ? (
              <div className="notara-guided-check">
                <ReflectionField
                  legend="Aku dapat menjelaskan konsep inti dengan bahasaku sendiri."
                  field="canExplainCore"
                  value={check.canExplainCore}
                  onEvent={onEvent}
                />
                <ReflectionField
                  legend="Aku dapat memberi contoh atau konteks yang relevan."
                  field="canGiveExample"
                  value={check.canGiveExample}
                  onEvent={onEvent}
                />
                <label className="notara-guided-check-question" htmlFor="guided-remaining-question">
                  Pertanyaan yang masih tersisa
                  <textarea
                    id="guided-remaining-question"
                    rows={3}
                    value={check.remainingQuestion}
                    onChange={(event) => onEvent({
                      type: 'SET_CHECK_REFLECTION',
                      field: 'remainingQuestion',
                      value: event.target.value,
                    })}
                    placeholder="Tulis bagian yang masih ingin kamu pahami."
                  />
                </label>
                <div className="notara-guided-check-guidance" role="status" aria-live="polite">
                  <SemanticIcon name="checkpoint" size={18} />
                  <p>{getCheckGuidance(check)}</p>
                </div>
              </div>
            ) : showDeterministicCompare && compareAvailable ? (
              <CompareWorkspace
                key={compareBundle.sourceSignature}
                bundle={compareBundle}
                draft={effectiveCompareDraft}
                sourceChanged={compareSourceSignatureMismatch && Boolean(state.compare.sourceSignature)}
                onEvent={onEvent}
              />
            ) : (
              <>
                {showDeterministicCompare && (
                  <div className="notara-compare-fallback" role="note">
                    <strong>Bandingkan belum tersedia untuk materi ini.</strong>
                    <p>Kamu tetap dapat menulis catatan Hubungkan dengan bahasamu sendiri.</p>
                  </div>
                )}
                <label className="notara-guided-response" htmlFor={`guided-response-${activeNode.id}`}>
                  Catatan atau jawaban sementara
                  <textarea
                    id={`guided-response-${activeNode.id}`}
                    rows={6}
                    value={response}
                    onChange={(event) => onEvent({
                      type: 'SET_NODE_RESPONSE',
                      node: activeNode.kind,
                      response: event.target.value,
                    })}
                    placeholder={
                      activeNode.kind === 'recall'
                        ? 'Jelaskan kembali tanpa membuka seluruh sumber.'
                        : 'Tulis dengan bahasamu sendiri. Catatan ini belum disimpan.'
                    }
                  />
                  <small>Catatan hanya tersedia selama sesi ini.</small>
                </label>
              </>
            )}

            <footer className="notara-guided-node-actions">
              <button
                type="button"
                className="notara-secondary-button"
                disabled={isFirstNode}
                onClick={() => onEvent({ type: 'GO_TO_NODE', index: activeNodeIndex - 1 })}
              >
                <ArrowLeft className="h-4 w-4" /> Sebelumnya
              </button>
              {isLastNode ? (
                <button type="button" className="notara-primary-button" onClick={() => onEvent({ type: 'EXIT' })}>
                  Kembali ke materi <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className="notara-primary-button"
                  onClick={() => onEvent({ type: 'GO_TO_NODE', index: activeNodeIndex + 1 })}
                >
                  Langkah berikutnya <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </footer>
          </article>
        </div>

        <aside className="notara-guided-rail" aria-label="Sumber dan Tanya Materi">
          <section className="notara-guided-source-card">
            <header>
              <span className="notara-guided-source-label">
                <SemanticIcon name="source-evidence" size={18} />
                Sumber sesi
              </span>
              <strong title={materialTitle}>{materialTitle}</strong>
              <small title={courseName}>{courseName}</small>
            </header>
            <div className="notara-guided-source-surface">
              <span>{sourceLabels[activeNode.sourceSurface]}</span>
              {sourceText ? (
                <p>{sourceText}</p>
              ) : (
                <p>Langkah ini meminta kamu menjelaskan kembali tanpa bergantung pada sumber terbuka.</p>
              )}
            </div>
          </section>

          <section className="notara-guided-tutor-card" aria-label="Tanya Materi dalam sesi">
            {tutor}
          </section>
        </aside>
      </div>
    </section>
  );
}
