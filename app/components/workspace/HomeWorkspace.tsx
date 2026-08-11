'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Clock3,
  FileAudio,
  Lightbulb,
  ListOrdered,
  MessageSquareText,
  Mic,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { Folder, Summary } from '@/lib/types';
import { AmbientArtwork } from '../brand/ProductArtwork';
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

const daypartLabel: Record<Daypart, string> = {
  pagi: 'Mulai hari dengan satu langkah kecil',
  siang: 'Jaga ritme belajar di tengah hari',
  sore: 'Sore yang tenang untuk melanjutkan',
  malam: 'Mode fokus untuk belajar malam',
};

const daypartCopy: Record<Daypart, string> = {
  pagi: 'Mulai dari satu materi kecil sebelum ritme harimu penuh.',
  siang: 'Jaga momentum dengan melanjutkan konteks yang masih hangat.',
  sore: 'Rapikan satu pemahaman sebelum menutup sesi hari ini.',
  malam: 'Pilih sesi ringan agar belajar tetap terasa selesai, bukan melelahkan.',
};

function formatFullDate(value: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function relativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia';

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function summaryPreview(value: string): string {
  const plain = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]()|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return 'Rangkuman ini siap dibuka kembali di Study Canvas.';
  return plain.length > 230 ? `${plain.slice(0, 227).trimEnd()}\u2026` : plain;
}

function AmbientScene({
  daypart,
  firstName,
  firstUse,
  dateLabel,
  activeMaterial,
}: {
  daypart: Daypart;
  firstName: string;
  firstUse: boolean;
  dateLabel: string;
  activeMaterial: string | null;
}) {
  const subcopy = firstUse
    ? 'Ruang belajarmu masih kosong. Mulai dari satu rekaman, lalu biarkan materi berkembang dari sana.'
    : activeMaterial
      ? `${activeMaterial} siap dilanjutkan tanpa mencari ulang bagian terakhir.`
      : daypartCopy[daypart];

  return (
    <header className="notara-home-ambient" data-daypart={daypart} aria-labelledby="home-greeting">
      <div className="notara-home-ambient-copy">
        <span className="notara-home-ambient-label">{daypartLabel[daypart]}</span>
        <h1 id="home-greeting">{greetingByDaypart[daypart]}, {firstName}.</h1>
        <p>{subcopy}</p>
        <div className="notara-home-ambient-meta">
          <time>{dateLabel || 'Hari ini'}</time>
          <span><i aria-hidden="true" /> {firstUse ? 'Siap membuat materi pertama' : 'Fokus hari ini: 1 materi aktif'}</span>
        </div>
      </div>
      <AmbientArtwork daypart={daypart} />
    </header>
  );
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
  const [dateLabel, setDateLabel] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
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
  const orderedSequence = useMemo(() => {
    const sequence = learning?.sequence ?? [];
    const byId = new Map(sequence.map((item) => [item.id, item]));
    const ordered = manualOrder
      .map((id) => byId.get(id))
      .filter((item): item is Summary => Boolean(item));
    const included = new Set(ordered.map((item) => item.id));
    return [...ordered, ...sequence.filter((item) => !included.has(item.id))];
  }, [learning, manualOrder]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      setDaypart(getDaypart(now.getHours()));
      setDateLabel(formatFullDate(now));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeDaypart = daypart ?? 'pagi';
  const firstName = userName.split(/\s|@/)[0] || 'teman belajar';
  const isFirstUse = summaries.length === 0;
  const continuation = learning?.recommendation ?? null;
  const continuationFolder = continuation?.folder_id
    ? folders.find((folder) => folder.id === continuation.folder_id) ?? null
    : null;

  const moveSequence = (itemId: string, offset: -1 | 1) => {
    const ids = orderedSequence.map((item) => item.id);
    const currentIndex = ids.indexOf(itemId);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[currentIndex], ids[nextIndex]] = [ids[nextIndex], ids[currentIndex]];
    setManualOrder(ids);
  };

  if (isFirstUse) {
    return (
      <div className="notara-workspace-page notara-home mx-auto max-w-6xl">
        <AmbientScene
          daypart={activeDaypart}
          firstName={firstName}
          firstUse
          dateLabel={dateLabel}
          activeMaterial={null}
        />

        <section className="notara-home-first-use" aria-labelledby="first-use-heading">
          <div className="notara-home-first-copy">
            <span className="notara-eyebrow">Ruang belajar pertamamu</span>
            <h2 id="first-use-heading">Dari rekaman kuliah menjadi materi yang bisa dipahami.</h2>
            <p>Rekam atau unggah audio/video. Nalira menyiapkan transkrip, rangkuman, dan ruang belajar terstruktur tanpa membuat chatbot mendominasi layar.</p>
            <div className="notara-home-first-actions">
              <button type="button" onClick={onRecord} className="notara-primary-button"><Mic className="h-4 w-4" /> Mulai rekam</button>
              <button type="button" onClick={onUpload} className="notara-secondary-button"><Upload className="h-4 w-4" /> Upload file</button>
            </div>
            <div className="notara-home-first-disclosure">
              <span><FileAudio className="h-4 w-4" /> Audio/video mengikuti format dan batas paket akunmu.</span>
              <span><Clock3 className="h-4 w-4" /> Pemrosesan browser membutuhkan tab tetap terbuka.</span>
              <span><ShieldCheck className="h-4 w-4" /> Audio diproses lalu dibuang; transkrip dan rangkuman yang disimpan.</span>
            </div>
          </div>

          <div className="notara-home-first-preview" aria-label="Preview Study Canvas setelah materi selesai">
            <div className="notara-home-preview-rail" aria-hidden="true">
              <span><BookOpen className="h-4 w-4" /></span><i /><i /><i />
            </div>
            <div className="notara-home-preview-canvas">
              <span className="notara-eyebrow">Study Canvas</span>
              <h3>Materi pertamamu akan tinggal di sini</h3>
              <div className="notara-home-preview-lines" aria-hidden="true"><i /><i /><i /></div>
              <div className="notara-home-preview-formula">Rangkuman · Transkrip</div>
              <div className="notara-home-preview-dock"><MessageSquareText className="h-4 w-4" /><span>Ruang belajar untuk materimu</span></div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="notara-workspace-page notara-home mx-auto max-w-6xl">
      <AmbientScene
        daypart={activeDaypart}
        firstName={firstName}
        firstUse={false}
        dateLabel={dateLabel}
        activeMaterial={continuation?.title ?? null}
      />

      {(processingLabel || processingError) && (
        <section className="notara-home-processing" data-state={processingError ? 'failed' : 'active'} aria-live="polite">
          <span className="notara-home-processing-dot" aria-hidden="true" />
          <div>
            <strong>{processingError || processingLabel}</strong>
            <span>{processingError ? 'Buka Rekam / Upload untuk mencoba kembali.' : 'Proses berjalan di tab ini. Jangan tutup halaman.'}</span>
          </div>
          <button type="button" onClick={onUpload}>Lihat detail proses</button>
        </section>
      )}

      <div className="notara-home-grid">
        <div className="notara-home-main">
          {learning && orderedSequence.length > 1 && (
            <section className="notara-home-learning-priority" aria-labelledby="learning-next-heading">
              <div className="notara-home-learning-head">
                <div>
                  <span className="notara-eyebrow">Pilihan berikutnya</span>
                  <h2 id="learning-next-heading">Belajar apa dulu?</h2>
                  <p>Nalira menempatkan materi terbaru lebih dahulu agar kamu dapat melanjutkan selagi konteksnya masih segar.</p>
                </div>
                <span className="notara-home-foundation-badge">Berdasarkan aktivitas terbaru</span>
              </div>

              <div className="notara-home-priority-reason">
                <span><Lightbulb className="h-4 w-4" /></span>
                <div>
                  <strong>Mulai dari {learning.recommendation.title}</strong>
                  <p>{learning.reason} Estimasi sesi sekitar {learning.estimateMinutes} menit.</p>
                </div>
              </div>

              <ol className="notara-home-path" aria-label="Urutan materi">
                {orderedSequence.slice(0, 3).map((item, index, visibleItems) => (
                  <li key={item.id} data-recommended={item.id === learning.recommendation.id}>
                    <button type="button" className="notara-home-path-main" onClick={() => onOpenSummary(item)}>
                      <span>{index + 1}</span>
                      <strong>{item.title}</strong>
                      <small>
                        {index === 0
                          ? 'mulai di sini'
                          : item.duration_sec
                            ? `${Math.max(1, Math.round(item.duration_sec / 60))} menit`
                            : 'durasi belum tersedia'}
                      </small>
                    </button>
                    {manualMode && (
                      <span className="notara-home-path-controls">
                        <button type="button" onClick={() => moveSequence(item.id, -1)} disabled={index === 0} aria-label={`Naikkan ${item.title}`}><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => moveSequence(item.id, 1)} disabled={index === visibleItems.length - 1} aria-label={`Turunkan ${item.title}`}><ArrowDown className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>

              <div className="notara-home-learning-actions">
                <button type="button" onClick={() => orderedSequence[0] && onOpenSummary(orderedSequence[0])} className="notara-primary-button">
                  Ikuti urutan belajar <ArrowRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={onOpenNotara} className="notara-secondary-button"><MessageSquareText className="h-4 w-4" /> Tanya Nalira</button>
                <button type="button" onClick={() => setManualMode((value) => !value)} className="notara-home-text-button" aria-pressed={manualMode}>
                  <ListOrdered className="h-4 w-4" /> {manualMode ? 'Selesai mengatur' : 'Atur sendiri'}
                </button>
                <span>Kamu tetap memegang kontrol atas urutan belajar.</span>
              </div>
            </section>
          )}

          {continuation && (
            <section className="notara-home-continuation" aria-labelledby="continue-learning-heading">
              <div className="notara-home-continuation-head">
                <div>
                  <span className="notara-eyebrow">Lanjutkan belajar</span>
                  <h2 id="continue-learning-heading">{continuation.title}</h2>
                  <p>{summaryPreview(continuation.summary)}</p>
                </div>
                <span className="notara-home-continuation-icon"><Sparkles className="h-5 w-5" /></span>
              </div>
              <div className="notara-home-continuation-chips">
                <span>{continuationFolder?.name ?? 'Belum dikategorikan'}</span>
                <span>Ditambahkan {relativeDate(continuation.created_at)}</span>
              </div>
              <dl className="notara-home-continuation-facts">
                <div><dt>Durasi rekaman</dt><dd>{continuation.duration_sec ? `${Math.max(1, Math.round(continuation.duration_sec / 60))} menit` : 'Belum tersedia'}</dd></div>
                <div><dt>Kata transkrip</dt><dd>{continuation.word_count ? new Intl.NumberFormat('id-ID').format(continuation.word_count) : 'Belum tersedia'}</dd></div>
                <div><dt>Tersedia</dt><dd>Rangkuman dan transkrip</dd></div>
              </dl>
              <div className="notara-home-continuation-footer">
                <span>Rangkuman · Transkrip</span>
                <button type="button" onClick={() => onOpenSummary(continuation)} className="notara-primary-button">Buka Study Canvas <ArrowRight className="h-4 w-4" /></button>
              </div>
            </section>
          )}

          <section aria-labelledby="recent-materials-heading">
            <div className="notara-home-section-heading">
              <h2 id="recent-materials-heading">Materi terbaru</h2>
              <button type="button" onClick={onOpenCourses}>Lihat semua</button>
            </div>
            <div className="notara-home-recent-list">
              {recent.map((summary) => (
                <button key={summary.id} type="button" onClick={() => onOpenSummary(summary)}>
                  <span className="notara-home-recent-icon"><BookOpen className="h-4 w-4" /></span>
                  <span><strong>{summary.title}</strong><small>{folders.find((folder) => folder.id === summary.folder_id)?.name ?? 'Belum dikategorikan'}</small></span>
                  <time>{relativeDate(summary.created_at)}</time>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="notara-home-side">
          <section className="notara-home-side-panel" aria-labelledby="home-courses-heading">
            <div className="notara-home-section-heading">
              <h2 id="home-courses-heading">Mata kuliah</h2>
              <button type="button" onClick={onOpenCourses}>Lihat semua</button>
            </div>
            <div className="notara-home-course-list">
              {folders.slice(0, 4).map((folder) => {
                const total = summaries.filter((summary) => summary.folder_id === folder.id).length;
                return (
                  <button key={folder.id} type="button" onClick={onOpenCourses}>
                    <i style={{ backgroundColor: folder.color }} aria-hidden="true" />
                    <span><strong>{folder.name}</strong><small>{total} materi</small></span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                );
              })}
              {folders.length === 0 && <p>Belum ada mata kuliah. Materi tetap dapat disimpan tanpa kategori.</p>}
            </div>
          </section>

          <section className="notara-home-side-panel" aria-labelledby="add-material-heading">
            <div className="notara-home-section-heading"><h2 id="add-material-heading">Tambahkan materi</h2><span>Cara menambah</span></div>
            <div className="notara-home-utility-grid">
              <button type="button" onClick={onRecord}><span><Mic className="h-4 w-4" /></span><strong>Rekam kuliah</strong><small>Mulai dari mikrofon</small></button>
              <button type="button" onClick={onUpload}><span><Upload className="h-4 w-4" /></span><strong>Upload file</strong><small>Audio atau video</small></button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
