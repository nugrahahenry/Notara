'use client';

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ComponentProps,
} from 'react';
import type { Folder, Summary } from '@/lib/types';
import { GuidedEntryCard } from '../guided/GuidedEntryCard';
import { GuidedFoundationWorkspace } from '../guided/GuidedFoundationWorkspace';
import { resolveGuidedEligibility } from '../guided/eligibility';
import {
  createGuidedFoundationState,
  guidedFoundationReducer,
} from '../guided/reducer';
import { StudyCanvasBoundary } from '../workspace/StudyCanvasBoundary';
import { toStudyGuideMaterial } from './adapter';
import { InlineMaterialTutor } from './InlineMaterialTutor';

type CanvasProps = ComponentProps<typeof StudyCanvasBoundary>;
type TutorProps = ComponentProps<typeof InlineMaterialTutor>;

interface StudyGuideWorkspaceProps extends Omit<
  CanvasProps,
  'summary' | 'folder' | 'children' | 'content' | 'headerExtension'
> {
  summary: Summary;
  folder: Folder | null;
  viewerUserId: string | null;
  sourceAvailable: boolean;
  summaryContent: CanvasProps['content'];
  transcriptContent: CanvasProps['content'];
  tutor: Omit<TutorProps, 'materialTitle' | 'surface' | 'disclosure'>;
}

function getMaterialOwnership(
  material: Summary,
  viewerUserId: string | null,
): 'owned' | 'not-owned' | 'unknown' {
  if (!material.user_id || !viewerUserId) return 'unknown';
  return material.user_id === viewerUserId ? 'owned' : 'not-owned';
}

export function StudyGuideWorkspace({
  summary,
  folder,
  viewerUserId,
  sourceAvailable,
  summaryContent,
  transcriptContent,
  tutor,
  activeTab,
  onBack,
  ...canvasProps
}: StudyGuideWorkspaceProps) {
  const material = useMemo(() => toStudyGuideMaterial(summary, folder), [folder, summary]);
  const eligibility = useMemo(
    () => resolveGuidedEligibility(sourceAvailable ? summary : null, viewerUserId),
    [sourceAvailable, summary, viewerUserId],
  );
  const ownership = getMaterialOwnership(summary, viewerUserId);
  const [guidedState, dispatchGuided] = useReducer(
    guidedFoundationReducer,
    material.id,
    createGuidedFoundationState,
  );
  const entryButtonRef = useRef<HTMLButtonElement | null>(null);
  const guidedHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const unavailableHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousMaterialRef = useRef(material.id);
  const previousAuthRef = useRef(viewerUserId);
  const previousStageRef = useRef(guidedState.stage);

  useEffect(() => {
    if (previousMaterialRef.current === material.id) return;
    previousMaterialRef.current = material.id;
    dispatchGuided({ type: 'RESET_SOURCE', materialId: material.id });
  }, [material.id]);

  useEffect(() => {
    if (previousAuthRef.current === viewerUserId) return;
    previousAuthRef.current = viewerUserId;
    dispatchGuided({ type: 'RESET_SOURCE', materialId: material.id });
  }, [material.id, viewerUserId]);

  useEffect(() => {
    if (eligibility.status === 'eligible-owned' || guidedState.stage === 'review') return;
    dispatchGuided({ type: 'SOURCE_UNAVAILABLE' });
  }, [eligibility.status, guidedState.stage]);

  useEffect(() => {
    if (previousStageRef.current === guidedState.stage) return;
    previousStageRef.current = guidedState.stage;
    const focusFrame = window.requestAnimationFrame(() => {
      if (guidedState.stage === 'review') entryButtonRef.current?.focus();
      else guidedHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [guidedState.stage]);

  useEffect(() => {
    if (!sourceAvailable) unavailableHeadingRef.current?.focus();
  }, [sourceAvailable]);

  if (!sourceAvailable) {
    return (
      <section
        className="notara-guided-unavailable"
        data-ownership={ownership}
        aria-labelledby="guided-source-unavailable-heading"
      >
        <span className="notara-guided-label">Materi tidak tersedia</span>
        <h1 id="guided-source-unavailable-heading" ref={unavailableHeadingRef} tabIndex={-1}>
          Materi ini tidak lagi tersedia
        </h1>
        <p>Akses materi berubah atau materi telah dihapus. Draft sementara sudah dibuang. Nalira tidak menggantinya dengan sumber lain.</p>
        <button type="button" className="notara-primary-button" onClick={onBack}>
          Kembali
        </button>
      </section>
    );
  }

  const reviewTutor = (
    <InlineMaterialTutor
      materialTitle={material.title}
      surface="review"
      {...tutor}
    />
  );
  const guidedCanRender = (
    guidedState.stage !== 'review'
    && guidedState.materialId === material.id
    && eligibility.status === 'eligible-owned'
  );

  if (!guidedCanRender) {
    return (
      <StudyCanvasBoundary
        summary={summary}
        folder={folder}
        activeTab={activeTab}
        onBack={onBack}
        {...canvasProps}
        content={activeTab === 'summary' ? summaryContent : transcriptContent}
        headerExtension={(
          <GuidedEntryCard
            eligibility={eligibility}
            buttonRef={entryButtonRef}
            onStart={() => dispatchGuided({ type: 'OPEN_OBJECTIVE' })}
          />
        )}
      >
        {reviewTutor}
      </StudyCanvasBoundary>
    );
  }

  return (
    <GuidedFoundationWorkspace
      materialTitle={material.title}
      courseName={material.courseName ?? 'Tanpa mata kuliah'}
      summaryText={summary.summary}
      transcriptText={summary.transcript}
      state={guidedState}
      headingRef={guidedHeadingRef}
      tutor={(
        <InlineMaterialTutor
          materialTitle={material.title}
          surface="guided"
          disclosure="Jawaban memakai transkrip materi aktif dan dapat dilengkapi pengetahuan umum. Sitasi bagian sumber belum tersedia."
          {...tutor}
        />
      )}
      onEvent={dispatchGuided}
    />
  );
}
