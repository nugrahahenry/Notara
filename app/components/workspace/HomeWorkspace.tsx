'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Clock3,
  FileAudio,
  GraduationCap,
  ListOrdered,
  MessageSquareText,
  Mic,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { Folder, Summary } from '@/lib/types';
import {
  buildLearningFallback,
  getDaypart,
  type Daypart,
} from '@/lib/learning/fallback';

interface HomeWorkspaceProps {
  userName: string;
  folders: Folder[];
  summaries: Summary[];
  processingLabel?: string;
  processingError?: string | null;
  onUpload: () => void;
  onRecord: () => void;
  onOpenSummary: (summary: Summary) => void;
  onOpenCourses: () => void;
  onOpenNotara: () => void;
}

const greetingByDaypart: Record<Daypart, string> = {
  pagi: 'Selamat pagi',
  siang: 'Selamat siang',
  sore: 'Selamat sore',
  malam: 'Selamat malam',
};

const daypartCopy: Record<Daypart, string> = {
  pagi: 'Mulai dari satu materi kecil sebelum ritme harimu penuh.',
  siang: 'Jaga momentum dengan melanjutkan konteks yang masih hangat.',
  sore: 'Rapikan satu pemahaman sebelum menutup sesi hari ini.',
  malam: 'Pilih sesi ringan agar belajar tetap terasa selesai, bukan melelahkan.',
};

function relativeDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

export function HomeWorkspace({
  userName,
  folders,
  summaries,
  processingLabel,
  processingError,
  onUpload,
  onRecord,
  onOpenSummary,
  onOpenCourses,
  onOpenNotara,
}: HomeWorkspaceProps) {
  const [daypart, setDaypart] = useState<Daypart | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const learning = useMemo(
    () => buildLearningFallback(summaries, folders),
    [folders, summaries],
  );
  const recent = useMemo(
    () => [...summaries]
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
      .slice(0, 4),
    [summaries],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDaypart(getDaypart(new Date().getHours())), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeDaypart = daypart ?? 'pagi';
  const firstName = userName.split(/\s|@/)[0] || 'teman belajar';
  const isFirstUse = summaries.length === 0;

  if (isFirstUse) {
    return (
      <div className="notara-workspace-page mx-auto max-w-5xl space-y-10">
        <header className="grid gap-6 border-b border-[var(--border-subtle)] pb-8 lg:grid-cols-[1fr_280px] lg:items-end">
          <div className="space-y-3">
            <span className="notara-eyebrow">Beranda</span>
            <h1 className="max-w-2xl text-3xl font-black tracking-tight text-[var(--text-primary)] md:text-4xl">
              Ubah rekaman panjang menjadi bahan belajar yang bisa dilanjutkan.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
              Rekam kelas atau unggah audio/video. Notara mentranskripsikan, merangkum, lalu menaruhnya di ruang belajar yang tetap kamu kendalikan.
            </p>
          </div>
          <div className="notara-daypart-scene" data-daypart={activeDaypart} aria-hidden="true">
            <span className="notara-daypart-orb" />
            <span className="notara-daypart-line" />
            <span className="notara-daypart-dot" />
          </div>
        </header>

        <section aria-labelledby="first-capture-heading" className="space-y-4">
          <div>
            <span className="notara-eyebrow">Mulai di sini</span>
            <h2 id="first-capture-heading" className="mt-2 text-2xl font-black text-[var(--text-primary)]">
              Pilih sumber pertamamu
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" onClick={onRecord} className="notara-action-tile">
              <Mic className="h-5 w-5" />
              <span>
                <strong>Rekam langsung</strong>
                <small>Cocok untuk kelas atau rapat yang sedang berjalan.</small>
              </span>
              <ArrowRight className="ml-auto h-4 w-4" />
            </button>
            <button type="button" onClick={onUpload} className="notara-action-tile">
              <Upload className="h-5 w-5" />
              <span>
                <strong>Upload rekaman</strong>
                <small>Audio/video, maksimal tiga file secara berurutan.</small>
              </span>
              <ArrowRight className="ml-auto h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 text-sm text-[var(--text-secondary)] md:grid-cols-3">
            <p className="notara-disclosure"><FileAudio className="h-4 w-4" /> Audio/video mengikuti format dan batas paket akunmu.</p>
            <p className="notara-disclosure"><Sparkles className="h-4 w-4" /> Pemrosesan tetap membutuhkan tab terbuka.</p>
            <p className="notara-disclosure"><BookOpen className="h-4 w-4" /> Audio diproses lalu dibuang; transkrip dan rangkuman disimpan.</p>
          </div>
        </section>

        <section className="border-t border-[var(--border-subtle)] pt-8">
          <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
            <div>
              <span className="notara-eyebrow">Study Canvas preview</span>
              <h2 className="mt-2 text-xl font-black text-[var(--text-primary)]">Baca, cek transkrip, lalu tanyakan bagian yang belum jelas.</h2>
              <p className="mt-3 leading-7 text-[var(--text-secondary)]">Canvas editorial, Study Dock, dan Learning Lab akan muncul setelah materi pertamamu selesai diproses.</p>
            </div>
            <div className="notara-canvas-preview" aria-label="Preview Study Canvas">
              <span />
              <strong>Rangkuman materi</strong>
              <span />
              <span />
              <small>Tanya materi ini…</small>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="notara-workspace-page mx-auto max-w-6xl space-y-9">
      <header className="grid gap-5 border-b border-[var(--border-subtle)] pb-7 md:grid-cols-[1fr_230px] md:items-center">
        <div>
          <span className="notara-eyebrow">Beranda</span>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--text-primary)]">
            {daypart ? greetingByDaypart[daypart] : 'Halo'}, {firstName}.
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">{daypartCopy[activeDaypart]}</p>
        </div>
        <div className="notara-daypart-scene" data-daypart={activeDaypart} aria-hidden="true">
          <span className="notara-daypart-orb" />
          <span className="notara-daypart-line" />
          <span className="notara-daypart-dot" />
        </div>
      </header>

      {(processingLabel || processingError) && (
        <section className="notara-status-strip" data-state={processingError ? 'failed' : 'active'} aria-live="polite">
          <div>
            <span className="notara-eyebrow">Pemrosesan prioritas</span>
            <strong>{processingError || processingLabel}</strong>
          </div>
          <span>{processingError ? 'Buka Rekam / Upload untuk mencoba kembali.' : 'Biarkan tab ini tetap terbuka.'}</span>
        </section>
      )}

      {learning && (
        <section aria-labelledby="learning-next-heading" className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,.75fr)]">
          <div className="notara-featured-continuation">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="notara-eyebrow">Belajar apa dulu?</span>
                <h2 id="learning-next-heading" className="mt-2 text-2xl font-black text-[var(--text-primary)]">{learning.recommendation.title}</h2>
              </div>
              <span className="notara-meta-chip"><Clock3 className="h-3.5 w-3.5" /> ± {learning.estimateMinutes} menit</span>
            </div>
            <p className="mt-4 max-w-2xl leading-7 text-[var(--text-secondary)]">{learning.reason}</p>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt>Prasyarat</dt>
                <dd>{learning.prerequisite?.title ?? 'Tidak ada prasyarat yang tercatat.'}</dd>
              </div>
              <div>
                <dt>Mata kuliah</dt>
                <dd>{learning.folder?.name ?? 'Belum dikategorikan'}</dd>
              </div>
            </dl>
            {manualMode && (
              <p className="mt-4 rounded-xl bg-[var(--info-soft)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                Penyusunan manual masih berupa presentation boundary. Urutan produksi menunggu sinkronisasi Learning System.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpenSummary(learning.recommendation)} className="notara-primary-button">
                Ikuti urutan <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setManualMode((value) => !value)} className="notara-secondary-button">
                Atur sendiri
              </button>
              <button type="button" onClick={onOpenNotara} className="notara-secondary-button">
                <MessageSquareText className="h-4 w-4" /> Tanya Notara
              </button>
            </div>
          </div>

          <aside className="notara-sequence" aria-label="Urutan materi sementara">
            <span className="notara-eyebrow"><ListOrdered className="h-3.5 w-3.5" /> Urutan sementara</span>
            <ol>
              {learning.sequence.map((item, index) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onOpenSummary(item)}>
                    <span>{index + 1}</span>
                    <strong>{item.title}</strong>
                  </button>
                </li>
              ))}
            </ol>
            <small>Fallback berbasis materi terbaru—bukan rekomendasi AI.</small>
          </aside>
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,.75fr)]">
        <div>
          <div className="notara-section-heading">
            <div>
              <span className="notara-eyebrow">Continue Learning</span>
              <h2>Materi terbaru</h2>
            </div>
            <button type="button" onClick={onOpenCourses}>Lihat semua</button>
          </div>
          <div className="notara-editorial-list">
            {recent.map((summary) => (
              <button key={summary.id} type="button" onClick={() => onOpenSummary(summary)}>
                <div>
                  <strong>{summary.title}</strong>
                  <span>{folders.find((folder) => folder.id === summary.folder_id)?.name ?? 'Belum dikategorikan'}</span>
                </div>
                <time>{relativeDate(summary.created_at)}</time>
                <ArrowRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="notara-section-heading">
            <div>
              <span className="notara-eyebrow">Mata kuliah</span>
              <h2>Ruang belajarmu</h2>
            </div>
          </div>
          <div className="space-y-2">
            {folders.slice(0, 4).map((folder) => {
              const total = summaries.filter((summary) => summary.folder_id === folder.id).length;
              return (
                <button key={folder.id} type="button" onClick={onOpenCourses} className="notara-course-row">
                  <span style={{ backgroundColor: folder.color }}>{folder.icon}</span>
                  <div><strong>{folder.name}</strong><small>{total} materi</small></div>
                  <GraduationCap className="ml-auto h-4 w-4" />
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={onRecord} className="notara-utility-button"><Mic className="h-4 w-4" /> Rekam</button>
            <button type="button" onClick={onUpload} className="notara-utility-button"><Upload className="h-4 w-4" /> Upload</button>
          </div>
        </div>
      </section>
    </div>
  );
}
