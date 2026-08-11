'use client';

import type { CSSProperties, RefObject } from 'react';
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
      <BrandMark size={size} animated={state === 'processing'} aria-hidden="true" />
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

export function AmbientArtwork({ daypart }: { daypart: AmbientArtworkDaypart }) {
  return (
    <div className="notara-home-ambient-scene" data-daypart={daypart} aria-hidden="true">
      <span className="notara-home-sky-orbit notara-home-sky-orbit--wide" />
      <span className="notara-home-sky-orbit notara-home-sky-orbit--narrow" />
      <span className="notara-home-sky-body" />
      <span className="notara-home-horizon" />
      <span className="notara-home-star notara-home-star--one" />
      <span className="notara-home-star notara-home-star--two" />
      <span className="notara-home-star notara-home-star--three" />
      <svg className="notara-home-scene-signal" viewBox="0 0 190 92" fill="none">
        <path d="M10 62c22-27 38 18 60-4s36 18 58-4 34 12 52-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M16 74h58c29 0 48-8 48-30v34l15-10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity=".66" />
      </svg>
    </div>
  );
}
