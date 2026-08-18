'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  ExternalLink,
  FileAudio,
  FileSignature,
  FileText,
  Folder as FolderIcon,
  Globe,
  ImageDown,
  Lock,
  MoreHorizontal,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import type { Folder, Summary } from '@/lib/types';

export interface StudyCanvasBoundaryProps {
  summary: Summary;
  folder: Folder | null;
  folders: Folder[];
  activeTab: 'summary' | 'transcript';
  studySeconds: number;
  copied: boolean;
  hasAudio: boolean;
  onTabChange: (tab: 'summary' | 'transcript') => void;
  onBack: () => void;
  onRenameTitle: (title: string) => Promise<boolean>;
  onMoveFolder: (folderId: string | null) => Promise<void>;
  onCreateCourse: (returnFocus: () => void) => void;
  onTogglePublic: () => Promise<void>;
  onCopyPublicLink: () => Promise<void>;
  onCreateShareCard: () => void;
  onDelete: () => void;
  onExportPdf: () => void;
  onExportWord: () => void;
  onDownloadAudio: () => void;
  onCopy: () => void;
  content: ReactNode;
  headerExtension?: ReactNode;
  children?: ReactNode;
}

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
  headerExtension,
  children,
}: StudyCanvasBoundaryProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(summary.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const courseButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const sharePanelRef = useRef<HTMLElement | null>(null);

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

  const returnFocusToCourseButton = () => {
    window.requestAnimationFrame(() => courseButtonRef.current?.focus());
  };

  const moveToFolder = (folderId: string | null) => {
    setCourseOpen(false);
    returnFocusToCourseButton();
    void onMoveFolder(folderId);
  };

  const openSharePanel = () => {
    setActionsOpen(false);
    setShareOpen(true);
    window.requestAnimationFrame(() => sharePanelRef.current?.focus());
  };

  const closeSharePanel = () => {
    setShareOpen(false);
    window.requestAnimationFrame(() => actionsButtonRef.current?.focus());
  };

  const handleBoundaryKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    if (courseOpen) {
      event.preventDefault();
      setCourseOpen(false);
      courseButtonRef.current?.focus();
      return;
    }
    if (actionsOpen || shareOpen) {
      event.preventDefault();
      setActionsOpen(false);
      setShareOpen(false);
      actionsButtonRef.current?.focus();
    }
  };


  return (
    <section
      className="notara-study-canvas-boundary"
      aria-label={`Materi: ${summary.title}`}
      onKeyDown={handleBoundaryKeyDown}
    >
      <header className="notara-study-toolbar">
        <button type="button" onClick={onBack} className="notara-study-back">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Mata Kuliah
        </button>
        <div className="notara-canvas-tabs" role="tablist" aria-label="Isi materi">
          <button type="button" role="tab" aria-selected={activeTab === 'summary'} onClick={() => onTabChange('summary')}>Rangkuman</button>
          <button type="button" role="tab" aria-selected={activeTab === 'transcript'} onClick={() => onTabChange('transcript')}>Transkrip</button>
        </div>
      </header>

      <div className="notara-study-layout">
        <div className="notara-study-stage">
          <article className="notara-editorial-canvas">
            <header className="notara-document-header">
              <div className="notara-document-heading-layout">
                <div className="notara-document-heading-main">
                  <div className="notara-document-context">
                    <div>
                      <span>{folder?.name ?? 'Tanpa mata kuliah'}</span>
                      <span>{activeTab === 'summary' ? 'Rangkuman materi' : 'Transkrip sumber'}</span>
                    </div>
                    {!isRenaming && (
                      <button
                        type="button"
                        className="notara-title-edit-action"
                        onClick={() => { setTitleDraft(summary.title); setIsRenaming(true); }}
                      >
                        <FileSignature className="h-4 w-4" /> Ubah judul
                      </button>
                    )}
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
                    </div>
                  )}

                  <div className="notara-document-meta">
                    <div className="notara-study-course-control">
                      <button
                        ref={courseButtonRef}
                        type="button"
                        onClick={() => {
                          setActionsOpen(false);
                          setCourseOpen((value) => !value);
                        }}
                        aria-expanded={courseOpen}
                        aria-controls="study-course-menu"
                      >
                        <FolderIcon className="h-4 w-4" />
                        <span>{folder?.name ?? 'Tanpa mata kuliah'}</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {courseOpen && (
                        <div id="study-course-menu" className="notara-study-popover notara-study-course-menu">
                          <span>Pindahkan ke mata kuliah</span>
                          <button type="button" data-active={!summary.folder_id} onClick={() => moveToFolder(null)}>Tanpa mata kuliah</button>
                          {folders.map((item) => (
                            <button key={item.id} type="button" data-active={item.id === summary.folder_id} onClick={() => moveToFolder(item.id)}>
                              <i style={{ backgroundColor: item.color }} /> {item.icon} {item.name}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setCourseOpen(false);
                              onCreateCourse(returnFocusToCourseButton);
                            }}
                          >
                            + Mata kuliah baru
                          </button>
                        </div>
                      )}
                    </div>
                    <span>{createdAt}</span>
                    <span>{summary.duration_sec ? `Durasi ${formatDuration(summary.duration_sec)}` : 'Durasi belum tersedia'}</span>
                    <span>{summary.word_count ? `${new Intl.NumberFormat('id-ID').format(summary.word_count)} kata` : 'Jumlah kata belum tersedia'}</span>
                    {studySeconds > 0 && <span>Fokus sesi {formatDuration(studySeconds)}</span>}
                  </div>
                </div>

                {headerExtension && (
                  <div className="notara-document-header-extension">
                    {headerExtension}
                  </div>
                )}
              </div>

              <div className="notara-document-actions">
                <button type="button" onClick={onCopy} className="notara-secondary-button notara-document-copy-action">
                  {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copied ? 'Tersalin' : `Salin ${activeTab === 'summary' ? 'rangkuman' : 'transkrip'}`}
                </button>
                <button type="button" onClick={onExportPdf} className="notara-secondary-button"><FileText className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={onExportWord} className="notara-secondary-button"><FileSignature className="h-4 w-4" /> Word</button>
                {hasAudio && <button type="button" onClick={onDownloadAudio} className="notara-secondary-button"><FileAudio className="h-4 w-4" /> Audio</button>}
                <div className="notara-study-action-menu">
                  <button
                    ref={actionsButtonRef}
                    type="button"
                    onClick={() => {
                      setCourseOpen(false);
                      setActionsOpen((value) => !value);
                    }}
                    className="notara-icon-button"
                    aria-label="Tindakan materi lainnya"
                    aria-expanded={actionsOpen}
                    aria-controls="study-more-menu"
                  ><MoreHorizontal className="h-4 w-4" /></button>
                  {actionsOpen && (
                    <div id="study-more-menu" className="notara-study-popover notara-study-more-menu">
                      <button type="button" onClick={openSharePanel}><Share2 className="h-4 w-4" /> Kelola link berbagi</button>
                      <button type="button" onClick={() => { setActionsOpen(false); actionsButtonRef.current?.focus(); onCreateShareCard(); }}><ImageDown className="h-4 w-4" /> Buat kartu sosial</button>
                      <button type="button" onClick={() => { setActionsOpen(false); actionsButtonRef.current?.focus(); onDelete(); }} data-danger><Trash2 className="h-4 w-4" /> Hapus materi</button>
                    </div>
                  )}
                </div>
              </div>

              {shareOpen && (
                <section ref={sharePanelRef} className="notara-study-share" aria-label="Pengaturan link berbagi" tabIndex={-1}>
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
                  <button type="button" onClick={closeSharePanel} className="notara-study-share-close" aria-label="Tutup pengaturan berbagi"><X className="h-4 w-4" /></button>
                </section>
              )}
            </header>

            <div className="notara-document-body" role="tabpanel">
              {content}
            </div>
          </article>

          {children}
        </div>

      </div>
    </section>
  );
}
