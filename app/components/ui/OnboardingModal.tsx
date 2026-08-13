'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Camera,
  Check,
  Clapperboard,
  Compass,
  GraduationCap,
  Loader2,
  MessageCircle,
  Play,
  Presentation,
  School,
  Search,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { NaliraBrand } from '../brand/NaliraBrand';

interface OnboardingData {
  role: string;
  university: string;
  major: string;
  find_source: string;
}

interface OnboardingModalProps {
  userName: string;
  onComplete: (data: OnboardingData) => void | Promise<void>;
}

interface Choice {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

const ROLES: Choice[] = [
  { id: 'mahasiswa', label: 'Mahasiswa', description: 'Kuliah, tugas, dan persiapan ujian', Icon: GraduationCap },
  { id: 'pelajar', label: 'Pelajar SMA/SMK', description: 'Kelas, latihan, dan materi sekolah', Icon: School },
  { id: 'dosen', label: 'Dosen / Pengajar', description: 'Mengajar, meneliti, dan menyiapkan materi', Icon: Presentation },
  { id: 'profesional', label: 'Profesional', description: 'Rapat, pelatihan, dan pengembangan diri', Icon: BriefcaseBusiness },
  { id: 'kreator', label: 'Konten Kreator', description: 'Riset, wawancara, dan pengembangan ide', Icon: Clapperboard },
  { id: 'lainnya', label: 'Belajar mandiri', description: 'Eksplorasi materi dengan caramu sendiri', Icon: Compass },
];

const SOURCES: Choice[] = [
  { id: 'tiktok', label: 'TikTok', description: 'Video pendek', Icon: Video },
  { id: 'instagram', label: 'Instagram', description: 'Konten sosial', Icon: Camera },
  { id: 'google', label: 'Google', description: 'Pencarian web', Icon: Search },
  { id: 'teman', label: 'Rekomendasi teman', description: 'Teman atau komunitas', Icon: Users },
  { id: 'twitter', label: 'X / Twitter', description: 'Percakapan sosial', Icon: MessageCircle },
  { id: 'youtube', label: 'YouTube', description: 'Video pembelajaran', Icon: Play },
];

const DETAILS_BY_ROLE: Record<string, {
  firstLabel: string;
  secondLabel: string;
  firstPlaceholder: string;
  secondPlaceholder: string;
}> = {
  mahasiswa: {
    firstLabel: 'Universitas',
    secondLabel: 'Program studi',
    firstPlaceholder: 'Contoh: Universitas Gunadarma',
    secondPlaceholder: 'Contoh: Sistem Informasi',
  },
  pelajar: {
    firstLabel: 'Sekolah',
    secondLabel: 'Kelas atau peminatan',
    firstPlaceholder: 'Nama sekolah',
    secondPlaceholder: 'Contoh: Kelas 12 IPA',
  },
  dosen: {
    firstLabel: 'Institusi',
    secondLabel: 'Bidang studi',
    firstPlaceholder: 'Universitas atau institusi',
    secondPlaceholder: 'Contoh: Ilmu Komputer',
  },
  profesional: {
    firstLabel: 'Perusahaan',
    secondLabel: 'Bidang kerja',
    firstPlaceholder: 'Opsional',
    secondPlaceholder: 'Contoh: Product Design',
  },
  kreator: {
    firstLabel: 'Platform utama',
    secondLabel: 'Topik konten',
    firstPlaceholder: 'Contoh: YouTube',
    secondPlaceholder: 'Contoh: Edukasi teknologi',
  },
};

export function OnboardingModal({ userName, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [data, setData] = useState<OnboardingData>({
    role: '',
    university: '',
    major: '',
    find_source: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstName = userName.split(/\s|@/)[0] || 'teman belajar';
  const detailFields = DETAILS_BY_ROLE[data.role] ?? null;

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, []);

  const finish = async (payload = data) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onComplete(payload);
    } catch (error) {
      console.error('Onboarding completion failed:', error);
      setSubmitError('Profil belum berhasil disimpan. Periksa koneksi lalu coba lagi.');
      setIsSubmitting(false);
    }
  };

  const skipPersonalization = () => finish({
    role: 'lainnya',
    university: '',
    major: '',
    find_source: '',
  });

  const goForward = () => {
    setSubmitError(null);
    if (step === 1 && data.role) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) void finish();
  };

  const goBack = () => {
    setSubmitError(null);
    setStep((current) => (current === 3 ? 2 : 1));
  };

  const trapDialogFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="notara-onboarding-backdrop">
      <div
        ref={dialogRef}
        className="notara-onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notara-onboarding-title"
        aria-describedby="notara-onboarding-description"
        data-step={step}
        onKeyDown={trapDialogFocus}
      >
        <header className="notara-onboarding-header">
          <NaliraBrand variant="icon" size={38} animated motionState="idle" />
          <div className="notara-onboarding-heading">
            <h2 id="notara-onboarding-title">Siapkan ruang belajar {firstName}</h2>
            <p id="notara-onboarding-description">Tiga langkah singkat agar Nalira terasa lebih relevan sejak materi pertama.</p>
          </div>
          <span className="notara-onboarding-step-label">Langkah {step} dari 3</span>
        </header>

        <div
          className="notara-onboarding-progress"
          role="progressbar"
          aria-label="Progres onboarding"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step}
        >
          <i style={{ transform: `scaleX(${step / 3})` }} />
        </div>

        <div className="notara-onboarding-body">
          {step === 1 && (
            <section aria-labelledby="notara-role-heading">
              <h3 id="notara-role-heading">Kamu paling sering memakai Nalira untuk apa?</h3>
              <p>Pilih konteks terdekat. Pilihan ini hanya membantu kami menyusun pengalaman awal.</p>
              <div className="notara-onboarding-choice-grid">
                {ROLES.map(({ id, label, description, Icon }) => {
                  const selected = data.role === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="notara-onboarding-choice"
                      data-selected={selected}
                      aria-pressed={selected}
                      onClick={() => setData((current) => ({ ...current, role: id }))}
                    >
                      <Icon aria-hidden="true" />
                      <span><strong>{label}</strong><small>{description}</small></span>
                      {selected && <Check className="notara-onboarding-choice-check" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="notara-context-heading">
              <h3 id="notara-context-heading">Tambahkan konteks belajarmu</h3>
              <p>Semua bidang pada langkah ini opsional dan dapat dikosongkan.</p>
              {detailFields ? (
                <div className="notara-onboarding-fields">
                  <label>
                    <span>{detailFields.firstLabel} <small>Opsional</small></span>
                    <input
                      value={data.university}
                      onChange={(event) => setData((current) => ({ ...current, university: event.target.value }))}
                      placeholder={detailFields.firstPlaceholder}
                      autoComplete="organization"
                    />
                  </label>
                  <label>
                    <span>{detailFields.secondLabel} <small>Opsional</small></span>
                    <input
                      value={data.major}
                      onChange={(event) => setData((current) => ({ ...current, major: event.target.value }))}
                      placeholder={detailFields.secondPlaceholder}
                    />
                  </label>
                </div>
              ) : (
                <div className="notara-onboarding-note">
                  <BookOpenCheck aria-hidden="true" />
                  <div><strong>Tidak ada data tambahan yang diperlukan.</strong><p>Kamu dapat langsung melanjutkan dan mulai dari materi pertama.</p></div>
                </div>
              )}
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="notara-source-heading">
              <h3 id="notara-source-heading">Terakhir, kamu menemukan Nalira dari mana?</h3>
              <p>Jawaban ini opsional dan hanya membantu kami memahami jalur penemuan produk.</p>
              <div className="notara-onboarding-source-grid">
                {SOURCES.map(({ id, label, description, Icon }) => {
                  const selected = data.find_source === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="notara-onboarding-source"
                      data-selected={selected}
                      aria-pressed={selected}
                      onClick={() => setData((current) => ({ ...current, find_source: id }))}
                    >
                      <Icon aria-hidden="true" />
                      <span><strong>{label}</strong><small>{description}</small></span>
                      {selected && <Check className="notara-onboarding-choice-check" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {submitError && <p className="notara-onboarding-error" role="alert">{submitError}</p>}

        <footer className="notara-onboarding-footer">
          {step === 1 ? (
            <button type="button" className="notara-onboarding-skip" onClick={() => void skipPersonalization()} disabled={isSubmitting}>
              Lewati personalisasi
            </button>
          ) : (
            <button type="button" className="notara-onboarding-back" onClick={goBack} disabled={isSubmitting}>
              <ArrowLeft aria-hidden="true" /> Kembali
            </button>
          )}
          <button
            type="button"
            className="notara-onboarding-next"
            onClick={goForward}
            disabled={(step === 1 && !data.role) || isSubmitting}
          >
            {isSubmitting ? (
              <><Loader2 className="notara-spin" aria-hidden="true" /> Menyimpan</>
            ) : step === 3 ? (
              <>Selesai <Check aria-hidden="true" /></>
            ) : (
              <>Lanjut <ArrowRight aria-hidden="true" /></>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default OnboardingModal;
