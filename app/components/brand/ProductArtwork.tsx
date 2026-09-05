'use client';

import type { CSSProperties, RefObject } from 'react';
import Image from 'next/image';
import { BrandMark } from './BrandPrimitives';

export type RecordingVisualState = 'idle' | 'recording' | 'paused' | 'ready';

interface RecordingVisualProps {
  state: RecordingVisualState;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}

export function RecordingVisual({ state, canvasRef }: RecordingVisualProps) {
  return (
    <div className="notara-recording-visual" data-state={state} aria-hidden="true">
      {canvasRef && <canvas ref={canvasRef} width={600} height={128} />}
      <span className="notara-recording-visual__baseline" />
      <span className="notara-recording-visual__pulse" />
      <span className="notara-recording-visual__bars"><i /><i /><i /><i /><i /></span>
    </div>
  );
}

export type ProcessingVisualState = 'processing' | 'success' | 'error';

interface ProcessingVisualProps {
  state?: ProcessingVisualState;
  size?: number;
}

export function ProcessingVisual({ state = 'processing', size = 112 }: ProcessingVisualProps) {
  const visualStyle = { '--notara-visual-size': `${size}px` } as CSSProperties;
  return (
    <span className="notara-processing-visual" data-state={state} style={visualStyle} aria-hidden="true">
      <span className="notara-processing-visual__orbit" />
      <span className="notara-processing-visual__orbit notara-processing-visual__orbit--inner" />
      <BrandMark size={size} aria-hidden="true" />
    </span>
  );
}

export type EmptyStateArtworkVariant = 'home' | 'courses' | 'shared' | 'capture';

interface EmptyStateArtworkProps {
  variant: EmptyStateArtworkVariant;
  size?: number;
}

export function EmptyStateArtwork({ variant, size = 88 }: EmptyStateArtworkProps) {
  return (
    <svg className="notara-empty-artwork" data-variant={variant} viewBox="0 0 96 96" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="18" y="24" width="60" height="50" rx="14" />
      <path d="M29 40h38M29 51h25M29 62h32" />
      <circle cx="68" cy="62" r="10" />
      <path d="M64 62h8M68 58v8" />
    </svg>
  );
}

export type AmbientArtworkDaypart = 'pagi' | 'siang' | 'sore' | 'malam';
export type AmbientArtworkState = 'new-one' | 'new-multiple' | 'continuation' | 'empty';

const ambientAssetByState: Record<AmbientArtworkState, string> = {
  'new-one': '/assets/nalira/ambient/nalira-home-outward-bloom-master.svg',
  'new-multiple': '/assets/nalira/ambient/nalira-home-outward-bloom-multiple.svg',
  continuation: '/assets/nalira/ambient/nalira-home-outward-bloom-continuation.svg',
  empty: '/assets/nalira/ambient/nalira-home-outward-bloom-empty.svg',
};

export function AmbientArtwork({
  daypart,
  state,
  phase = 'final',
}: {
  daypart: AmbientArtworkDaypart;
  state: AmbientArtworkState;
  phase?: 'initial' | 'live' | 'final';
}) {
  return (
    <div
      className="notara-home-ambient-scene nl-home-outward-bloom"
      data-daypart={daypart}
      data-state={state}
      data-phase={phase}
      aria-hidden="true"
    >
      <Image src={ambientAssetByState[state]} alt="" width={620} height={360} priority />
    </div>
  );
}
