'use client';

import { ArrowRight, BookOpen, Clock3, FolderPlus } from 'lucide-react';
import { EmptyStateArtwork } from '../brand/ProductArtwork';
import type { Folder, Summary } from '@/lib/types';

interface CoursesWorkspaceProps {
  folders: Folder[];
  summaries: Summary[];
  activeFolderId: string;
  onCreateCourse: () => void;
  onSelectCourse: (folderId: string) => void;
  onOpenSummary: (summary: Summary) => void;
}

function newestSummary(items: Summary[]): Summary | null {
  return [...items].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  )[0] ?? null;
}

export function CoursesWorkspace({
  folders,
  summaries,
  activeFolderId,
  onCreateCourse,
  onSelectCourse,
  onOpenSummary,
}: CoursesWorkspaceProps) {
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? folders[0] ?? null;
  const activeMaterials = activeFolder
    ? summaries.filter((summary) => summary.folder_id === activeFolder.id)
    : summaries.filter((summary) => summary.folder_id === null);
  const continuation = newestSummary(activeMaterials);

  return (
    <div className="notara-workspace-page mx-auto max-w-6xl space-y-9">
      <header className="notara-page-heading">
        <div>
          <span className="notara-eyebrow">Mata Kuliah</span>
          <h1>Ruang mata kuliah</h1>
          <p>Di Nalira, temukan materi terbaru dan lanjutkan belajar dari konteks yang sama.</p>
        </div>
        <button type="button" onClick={onCreateCourse} className="notara-secondary-button">
          <FolderPlus className="h-4 w-4" /> Mata kuliah baru
        </button>
      </header>

      {folders.length === 0 ? (
        <section className="notara-empty-foundation">
          <EmptyStateArtwork variant="courses" size={76} />
          <div>
            <h2>Belum ada mata kuliah</h2>
            <p>Buat mata kuliah untuk menjaga rangkuman dari satu konteks tetap berdekatan.</p>
          </div>
          <button type="button" onClick={onCreateCourse} className="notara-primary-button">Buat mata kuliah</button>
        </section>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
            <div className="notara-featured-course">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="notara-course-icon" style={{ borderColor: activeFolder?.color }}>
                    {activeFolder?.icon}
                  </span>
                  <div>
                    <span className="notara-eyebrow">Mata kuliah aktif</span>
                    <h2>{activeFolder?.name}</h2>
                  </div>
                </div>
                <span className="notara-meta-chip"><BookOpen className="h-3.5 w-3.5" /> {activeMaterials.length} materi</span>
              </div>

              {continuation ? (
                <div className="mt-7 border-t border-[var(--border-subtle)] pt-5">
                  <span className="notara-eyebrow">Lanjutkan dari sini</span>
                  <button type="button" onClick={() => onOpenSummary(continuation)} className="mt-3 flex w-full items-center gap-4 text-left">
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-lg text-[var(--text-primary)]">{continuation.title}</strong>
                      <span className="mt-1 block text-sm text-[var(--text-secondary)]">Materi terbaru dalam mata kuliah ini</span>
                    </div>
                    <ArrowRight className="h-5 w-5 text-[var(--brand-primary)]" />
                  </button>
                </div>
              ) : (
                <p className="mt-7 border-t border-[var(--border-subtle)] pt-5 text-sm text-[var(--text-secondary)]">
                  Belum ada materi. Rekam atau upload untuk memulai konteks mata kuliah ini.
                </p>
              )}

              <p className="mt-5 text-xs text-[var(--text-tertiary)]">
                Progres belajar belum tersedia. Gunakan materi terbaru sebagai titik lanjut untuk saat ini.
              </p>
            </div>

            <aside className="notara-course-activity">
              <span className="notara-eyebrow">Aktivitas belajar</span>
              <dl>
                <div><dt>Materi tersimpan</dt><dd>{activeMaterials.length}</dd></div>
                <div><dt>Terakhir ditambah</dt><dd>{continuation ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(continuation.created_at)) : '\u2014'}</dd></div>
                <div><dt>Status proses</dt><dd>Siap</dd></div>
              </dl>
            </aside>
          </section>

          <section>
            <div className="notara-section-heading">
              <div><span className="notara-eyebrow">Semua mata kuliah</span><h2>Pilih konteks belajar</h2></div>
            </div>
            <div className="notara-landscape-list">
              {folders.map((folder) => {
                const materials = summaries.filter((summary) => summary.folder_id === folder.id);
                const latest = newestSummary(materials);
                const isActive = folder.id === activeFolder?.id;
                return (
                  <article key={folder.id} data-active={isActive}>
                    <button type="button" onClick={() => onSelectCourse(folder.id)} className="notara-landscape-course">
                      <span className="notara-course-icon" style={{ borderColor: folder.color }}>{folder.icon}</span>
                      <div>
                        <strong>{folder.name}</strong>
                        <small>{materials.length} materi / {latest ? `terbaru ${latest.title}` : 'belum ada materi'}</small>
                      </div>
                      <ArrowRight className="ml-auto h-4 w-4" />
                    </button>
                    {isActive && materials.length > 0 && (
                      <div className="notara-landscape-materials">
                        {materials.slice(0, 4).map((summary) => (
                          <button key={summary.id} type="button" onClick={() => onOpenSummary(summary)}>
                            <BookOpen className="h-4 w-4" />
                            <span>{summary.title}</span>
                            {summary.duration_sec ? <small><Clock3 className="h-3 w-3" /> {Math.round(summary.duration_sec / 60)} menit</small> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
