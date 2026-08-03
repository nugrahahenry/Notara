'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  ExternalLink,
  FileAudio,
  FileSignature,
  FileText,
  FlaskConical,
  Folder as FolderIcon,
  Globe,
  ImageDown,
  Lock,
  MessageSquareText,
  MoreHorizontal,
  Quote,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Folder, Summary } from '@/lib/types';

interface StudyCanvasBoundaryProps {
  summary: Summary;
  folder: Folder | null;
  folders: Folder[];
  activeTab: 'summary' | 'transcript';
  studySeconds: number;
  copied: boolean;
  hasAudio: boolean;
  onTabChange: (tab: 'summary' | 'transcript') => void;
  onBack: () => void;
  onAskMaterial: () => void;
  onRenameTitle: (title: string) => Promise<boolean>;
  onMoveFolder: (folderId: string | null) => Promise<void>;
  onCreateCourse: () => void;
  onTogglePublic: () => Promise<void>;
  onCopyPublicLink: () => Promise<void>;
  onCreateShareCard: () => void;
  onDelete: () => void;
  onExportPdf: () => void;
  onExportWord: () => void;
  onDownloadAudio: () => void;
  onCopy: () => void;
  content: ReactNode;
  children?: ReactNode;
}

const labTools = [
  { id: 'concept', label: 'Konsep', group: 'Pelajari', icon: BookOpen },
  { id: 'formula', label: 'Rumus', group: 'Pelajari', icon: Calculator },
  { id: 'visual', label: 'Visual', group: 'Pelajari', icon: BarChart3 },
  { id: 'quiz', label: 'Quiz', group: 'Latihan', icon: FlaskConical },
  { id: 'speaker', label: 'Pembicara', group: 'Konteks', icon: Users },
] as const;

type LabToolId = (typeof labTools)[number]['id'];

const labCopy: Record<LabToolId, { status: string; title: string; copy: string; evidence: string }> = {
  concept: {
    status: 'Foundation',
    title: 'Konsep penting',
    copy: 'Notara belum mengekstrak konsep sebagai data terstruktur. Untuk saat ini, konsep tetap dibaca dari rangkuman sumber.',
    evidence: 'Belum ada source link atau confidence per konsep.',
  },
  formula: {
    status: 'Perlu kontrak',
    title: 'Rumus dan notasi',
    copy: 'Rumus dapat muncul di rangkuman, tetapi evidence, timestamp, koreksi notasi, dan Formula Notes belum tersedia.',
    evidence: 'Tidak ada formula yang diklaim terverifikasi otomatis.',
  },
  visual: {
    status: 'Belum terhubung',
    title: 'Visualisasi materi',
    copy: 'Integrasi deep-link ke Neurova belum memiliki kontrak produksi, sehingga Study Canvas belum membuat visual palsu.',
    evidence: 'Notara akan menyerahkan konsep terpilih setelah kontrak konteks dikunci.',
  },
  quiz: {
    status: 'Belum tersedia',
    title: 'Latihan pemahaman',
    copy: 'Quiz, penilaian, dan progres belajar belum dibuat dari materi ini.',
    evidence: 'Tidak ada skor atau progress sintetis yang disimpan.',
  },
  speaker: {
    status: 'Belum dipisahkan',
    title: 'Konteks pembicara',
    copy: 'Transkrip Groq saat ini belum membawa diarization atau label dosen/mahasiswa yang dapat dipercaya.',
    evidence: 'Speaker Context baru diaktifkan setelah pipeline diarization tervalidasi.',
  },
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 1) return 'Belum tersedia';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}j ${minutes}m`;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function StudyCanvasBoundary({
  summary,
  folder,
  folders,
  activeTab,
  studySeconds,
  copied,
  hasAudio,
  onTabChange,
  onBack,
  onAskMaterial,
  onRenameTitle,
  onMoveFolder,
  onCreateCourse,
  onTogglePublic,
  onCopyPublicLink,
  onCreateShareCard,
  onDelete,
  onExportPdf,
  onExportWord,
  onDownloadAudio,
  onCopy,
  content,
}: StudyCanvasBoundaryProps) {
  const [labOpen, setLabOpen] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<LabToolId>('concept');
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(summary.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const activeLab = labCopy[activeTool];

  const createdAt = useMemo(() => {
    const date = new Date(summary.created_at);
    if (Number.isNaN(date.getTime())) return 'Tanggal belum tersedia';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }, [summary.created_at]);

  const saveTitle = async () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === summary.title) {
      setTitleDraft(summary.title);
      setIsRenaming(false);
      return;
    }
    if (await onRenameTitle(nextTitle)) setIsRenaming(false);
  };

  const copyPublicLink = async () => {
    await onCopyPublicLink();
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  };

  const selectTool = (toolId: LabToolId) => {
    setActiveTool(toolId);
    setLabOpen(true);
  };

  return (
    <section
      className="notara-study-canvas-boundary"
      data-lab-open={labOpen}
      aria-label={`Study Canvas: ${summary.title}`}
    >
      <header className="notara-study-toolbar">
        <button type="button" onClick={onBack} className="notara-study-back">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Mata Kuliah
        </button>
        <div className="notara-canvas-tabs" role="tablist" aria-label="Isi materi">
          <button type="button" role="tab" aria-selected={activeTab === 'summary'} onClick={() => onTabChange('summary')}>Rangkuman</button>
          <button type="button" role="tab" aria-selected={activeTab === 'transcript'} onClick={() => onTabChange('transcript')}>Transkrip</button>
        </div>
        <button
          type="button"
          onClick={() => setLabOpen((value) => !value)}
          className="notara-secondary-button notara-study-lab-toggle"
          aria-expanded={labOpen}
          aria-controls="notara-learning-lab"
        >
          <FlaskConical className="h-4 w-4" /> Learning Lab
        </button>
      </header>

      <div className="notara-study-layout">
        <div className="notara-study-stage">
          <article className="notara-editorial-canvas">
            <header className="notara-document-header">
              <div className="notara-document-kicker">
                <span>{folder?.name ?? 'Belum dikategorikan'}</span>
                <span>{activeTab === 'summary' ? 'Rangkuman materi' : 'Transkrip sumber'}</span>
              </div>

              {isRenaming ? (
                <div className="notara-title-editor">
                  <label htmlFor="study-title-input">Judul materi</label>
                  <div>
                    <input
                      id="study-title-input"
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveTitle();
                        if (event.key === 'Escape') {
                          setTitleDraft(summary.title);
                          setIsRenaming(false);
                        }
                      }}
                      autoFocus
                    />
                    <button type="button" onClick={() => void saveTitle()} aria-label="Simpan judul"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => { setTitleDraft(summary.title); setIsRenaming(false); }} aria-label="Batalkan perubahan judul"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <div className="notara-document-title-row">
                  <h1>{summary.title}</h1>
                  <button type="button" onClick={() => { setTitleDraft(summary.title); setIsRenaming(true); }} aria-label="Ubah judul materi"><FileSignature className="h-4 w-4" /></button>
                </div>
              )}

              <div className="notara-document-meta">
                <div className="notara-study-course-control">
                  <button type="button" onClick={() => setCourseOpen((value) => !value)} aria-expanded={courseOpen}>
                    <FolderIcon className="h-4 w-4" />
                    <span>{folder?.name ?? 'Belum dikategorikan'}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {courseOpen && (
                    <div className="notara-study-popover notara-study-course-menu">
                      <span>Pindahkan ke mata kuliah</span>
                      <button type="button" data-active={!summary.folder_id} onClick={() => { void onMoveFolder(null); setCourseOpen(false); }}>Belum dikategorikan</button>
                      {folders.map((item) => (
                        <button key={item.id} type="button" data-active={item.id === summary.folder_id} onClick={() => { void onMoveFolder(item.id); setCourseOpen(false); }}>
                          <i style={{ backgroundColor: item.color }} /> {item.icon} {item.name}
                        </button>
                      ))}
                      <button type="button" onClick={() => { setCourseOpen(false); onCreateCourse(); }}>+ Mata kuliah baru</button>
                    </div>
                  )}
                </div>
                <span>{createdAt}</span>
                <span>{summary.duration_sec ? `Durasi ${formatDuration(summary.duration_sec)}` : 'Durasi belum tersedia'}</span>
                <span>{summary.word_count ? `${new Intl.NumberFormat('id-ID').format(summary.word_count)} kata` : 'Jumlah kata belum tersedia'}</span>
                {studySeconds > 0 && <span>Fokus sesi {formatDuration(studySeconds)}</span>}
              </div>

              <div className="notara-document-actions">
                <button type="button" onClick={onCopy} className="notara-primary-button">
                  {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copied ? 'Tersalin' : `Salin ${activeTab === 'summary' ? 'rangkuman' : 'transkrip'}`}
                </button>
                <button type="button" onClick={onExportPdf} className="notara-secondary-button"><FileText className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={onExportWord} className="notara-secondary-button"><FileSignature className="h-4 w-4" /> Word</button>
                {hasAudio && <button type="button" onClick={onDownloadAudio} className="notara-secondary-button"><FileAudio className="h-4 w-4" /> Audio</button>}
                <div className="notara-study-action-menu">
                  <button type="button" onClick={() => setActionsOpen((value) => !value)} className="notara-icon-button" aria-label="Tindakan materi lainnya" aria-expanded={actionsOpen}><MoreHorizontal className="h-4 w-4" /></button>
                  {actionsOpen && (
                    <div className="notara-study-popover notara-study-more-menu">
                      <button type="button" onClick={() => { setActionsOpen(false); setShareOpen(true); }}><Share2 className="h-4 w-4" /> Kelola link berbagi</button>
                      <button type="button" onClick={() => { setActionsOpen(false); onCreateShareCard(); }}><ImageDown className="h-4 w-4" /> Buat kartu sosial</button>
                      <button type="button" onClick={() => { setActionsOpen(false); onDelete(); }} data-danger><Trash2 className="h-4 w-4" /> Hapus materi</button>
                    </div>
                  )}
                </div>
              </div>

              {shareOpen && (
                <section className="notara-study-share" aria-label="Pengaturan link berbagi">
                  <div>
                    <span>{summary.is_public ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</span>
                    <div><strong>{summary.is_public ? 'Link publik aktif' : 'Materi masih privat'}</strong><small>{summary.is_public ? 'Siapa pun yang memiliki link dapat membaca rangkuman.' : 'Hanya kamu yang dapat membuka materi ini.'}</small></div>
                  </div>
                  <button type="button" onClick={() => void onTogglePublic()} className="notara-secondary-button">{summary.is_public ? 'Jadikan privat' : 'Aktifkan link'}</button>
                  {summary.is_public && summary.public_slug && (
                    <div className="notara-study-share-link">
                      <code>{`${typeof window !== 'undefined' ? window.location.origin : ''}/s/${summary.public_slug}`}</code>
                      <button type="button" onClick={() => void copyPublicLink()} aria-label="Salin link publik">{copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
                      <a href={`/s/${summary.public_slug}`} target="_blank" rel="noopener noreferrer" aria-label="Buka halaman publik"><ExternalLink className="h-4 w-4" /></a>
                    </div>
                  )}
                  <button type="button" onClick={() => setShareOpen(false)} className="notara-study-share-close" aria-label="Tutup pengaturan berbagi"><X className="h-4 w-4" /></button>
                </section>
              )}
            </header>

            <div className="notara-document-body" role="tabpanel">
              {content}
            </div>
          </article>

          <section className="notara-study-dock" data-expanded={dockExpanded}>
            <button type="button" onClick={() => setDockExpanded((value) => !value)} className="notara-study-dock-toggle" aria-expanded={dockExpanded}>
              <span className="notara-study-dock-mark"><MessageSquareText className="h-4 w-4" /></span>
              <span><strong>Tanya materi ini…</strong><small>Scope: {summary.title}</small></span>
              <ChevronUp className="h-4 w-4" />
            </button>
            {dockExpanded && (
              <div className="notara-study-dock-expanded">
                <span><Quote className="h-4 w-4" /> Tutor akan memakai transkrip dari satu materi ini.</span>
                <p>Percakapan dibuka lewat Tutor Materi existing; jawaban lintas mata kuliah tidak digunakan pada scope ini.</p>
                <button type="button" onClick={onAskMaterial} className="notara-primary-button">Buka Tutor Materi</button>
              </div>
            )}
          </section>
        </div>

        <aside id="notara-learning-lab" className="notara-learning-lab" data-open={labOpen} aria-label="Learning Lab">
          <header className="notara-lab-heading">
            <div><span className="notara-eyebrow">Materi aktif</span><h2>Learning Lab</h2><p>Alat belajar yang terikat ke sumber ini.</p></div>
            <button type="button" onClick={() => setLabOpen(false)} aria-label="Ciutkan Learning Lab"><X className="h-4 w-4" /></button>
          </header>
          <nav className="notara-lab-rail" aria-label="Learning Lab tools">
            {labTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button key={tool.id} type="button" onClick={() => selectTool(tool.id)} data-active={activeTool === tool.id} title={tool.label}>
                  <Icon className="h-4 w-4" /><span>{tool.label}</span><small>{tool.group}</small>
                </button>
              );
            })}
          </nav>
          <div className="notara-lab-panel">
            <div className="notara-lab-panel-head"><div><span className="notara-eyebrow">{activeLab.status}</span><h3>{activeLab.title}</h3></div><span>Belum dihasilkan AI</span></div>
            <p>{activeLab.copy}</p>
            <div className="notara-lab-evidence"><strong>Batas saat ini</strong><span>{activeLab.evidence}</span></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
