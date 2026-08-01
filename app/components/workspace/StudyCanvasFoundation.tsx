'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calculator,
  ChevronUp,
  FlaskConical,
  MessageSquareText,
  Quote,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { Folder, Summary } from '@/lib/types';

interface StudyCanvasFoundationProps {
  summary: Summary;
  folder: Folder | null;
  activeTab: 'summary' | 'transcript';
  onTabChange: (tab: 'summary' | 'transcript') => void;
  onBack: () => void;
  onAskMaterial: () => void;
}

const labTools = [
  { id: 'concept', label: 'Konsep', icon: BookOpen },
  { id: 'formula', label: 'Rumus', icon: Calculator },
  { id: 'visual', label: 'Visual', icon: BarChart3 },
  { id: 'quiz', label: 'Quiz', icon: FlaskConical },
  { id: 'speaker', label: 'Pembicara', icon: Users },
] as const;

export function StudyCanvasFoundation({
  summary,
  folder,
  activeTab,
  onTabChange,
  onBack,
  onAskMaterial,
}: StudyCanvasFoundationProps) {
  const [labOpen, setLabOpen] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<(typeof labTools)[number]['id']>('concept');

  return (
    <div className="mb-6 space-y-4">
      <header className="notara-canvas-heading">
        <button type="button" onClick={onBack} className="notara-icon-button" aria-label="Kembali ke mata kuliah"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <span className="notara-eyebrow">Study Canvas · {folder?.name ?? 'Belum dikategorikan'}</span>
          <h1 className="truncate">{summary.title}</h1>
        </div>
        <div className="notara-canvas-tabs" role="tablist" aria-label="Isi materi">
          <button type="button" role="tab" aria-selected={activeTab === 'summary'} onClick={() => onTabChange('summary')}>Rangkuman</button>
          <button type="button" role="tab" aria-selected={activeTab === 'transcript'} onClick={() => onTabChange('transcript')}>Transkrip</button>
        </div>
        <button type="button" onClick={() => setLabOpen((value) => !value)} className="notara-secondary-button" aria-expanded={labOpen}>
          <Sparkles className="h-4 w-4" /> Learning Lab
        </button>
      </header>

      {labOpen && (
        <section className="notara-learning-lab" aria-label="Learning Lab preview">
          <div className="notara-lab-rail">
            {labTools.map((tool) => {
              const Icon = tool.icon;
              return <button key={tool.id} type="button" onClick={() => setActiveTool(tool.id)} data-active={activeTool === tool.id} title={tool.label}><Icon className="h-4 w-4" /><span>{tool.label}</span></button>;
            })}
          </div>
          <div className="notara-lab-panel">
            <div><span className="notara-eyebrow">{labTools.find((tool) => tool.id === activeTool)?.label}</span><h2>Preview foundation</h2></div>
            <button type="button" onClick={() => setLabOpen(false)} aria-label="Tutup Learning Lab"><X className="h-4 w-4" /></button>
            <p>Area ini mengunci layout rail/panel saja. Analisis konsep, rumus, visual, quiz, dan pembicara belum dibuat atau diklaim sebagai hasil AI.</p>
          </div>
        </section>
      )}

      <section className="notara-study-dock" data-expanded={dockExpanded}>
        <button type="button" onClick={() => setDockExpanded((value) => !value)} className="notara-study-dock-toggle" aria-expanded={dockExpanded}>
          <MessageSquareText className="h-4 w-4" />
          <span>Tanya materi ini…</span>
          <small>{folder?.name ?? 'Materi ini'}</small>
          <ChevronUp className="h-4 w-4" />
        </button>
        {dockExpanded && (
          <div className="notara-study-dock-expanded">
            <span><Quote className="h-4 w-4" /> Scope: satu materi · {summary.title}</span>
            <p>Gunakan percakapan materi existing untuk bertanya berdasarkan transkrip ini.</p>
            <button type="button" onClick={onAskMaterial} className="notara-primary-button">Buka Tutor Materi</button>
          </div>
        )}
      </section>
    </div>
  );
}
