'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SemanticIcon } from '../brand/SemanticIcon';
import type { GuidedRouteNode } from './types';

interface GuidedSourcePanelProps {
  materialTitle: string;
  courseName: string;
  surface: GuidedRouteNode['sourceSurface'];
  sourceText: string;
}

const sourceLabels: Record<GuidedRouteNode['sourceSurface'], string> = {
  summary: 'Cuplikan rangkuman',
  transcript: 'Cuplikan transkrip',
  reflection: 'Latihan tanpa sumber terbuka',
};

function normalizeSource(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`~[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipSource(source: string, limit: number): string {
  if (source.length <= limit) return source;
  return `${source.slice(0, limit).trimEnd()}…`;
}

export function GuidedSourcePanel({
  materialTitle,
  courseName,
  surface,
  sourceText,
}: GuidedSourcePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const normalizedSource = useMemo(() => normalizeSource(sourceText), [sourceText]);
  const canExpand = surface !== 'reflection' && normalizedSource.length > 420;
  const visibleSource = expanded
    ? clipSource(normalizedSource, 2400)
    : clipSource(normalizedSource, 420);

  return (
    <section className="notara-guided-source-card" aria-labelledby="guided-source-panel-heading">
      <header>
        <span className="notara-guided-source-label">
          <SemanticIcon name="source-evidence" size={18} />
          Sumber sesi
        </span>
        <strong id="guided-source-panel-heading" title={materialTitle}>{materialTitle}</strong>
        <small title={courseName}>{courseName}</small>
      </header>
      <div className="notara-guided-source-surface" data-expanded={expanded}>
        <span>{sourceLabels[surface]}</span>
        {surface === 'reflection' ? (
          <p>Langkah ini meminta kamu menjelaskan kembali tanpa bergantung pada sumber terbuka.</p>
        ) : (
          <p>{visibleSource || 'Teks sumber belum tersedia untuk cuplikan ini.'}</p>
        )}
        {canExpand && (
          <button
            type="button"
            className="notara-guided-source-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? 'Ringkas cuplikan' : 'Perluas cuplikan'}
          </button>
        )}
      </div>
    </section>
  );
}
