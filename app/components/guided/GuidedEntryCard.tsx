'use client';

import type { RefObject } from 'react';
import { ArrowRight, Copy, ShieldAlert } from 'lucide-react';
import { SemanticIcon } from '../brand/SemanticIcon';
import type { GuidedSourceEligibility } from './types';

interface GuidedEntryCardProps {
  eligibility: GuidedSourceEligibility;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onStart: () => void;
}

const blockedCopy: Record<
  Exclude<GuidedSourceEligibility['status'], 'eligible-owned' | 'unavailable'>,
  { title: string; description: string; icon: typeof ShieldAlert }
> = {
  'fork-required': {
    title: 'Buat salinan untuk mulai',
    description: 'Belajar terpandu hanya tersedia pada materi milikmu. Buat salinan melalui alur berbagi, lalu buka salinan tersebut.',
    icon: Copy,
  },
  'ineligible-local': {
    title: 'Simpan materi terlebih dahulu',
    description: 'Belajar terpandu tersedia setelah materi tersimpan sebagai hasil yang dapat dibuka kembali.',
    icon: ShieldAlert,
  },
  'ineligible-incomplete': {
    title: 'Tunggu rangkuman dan transkrip lengkap',
    description: 'Rute belajar memerlukan satu materi yang sudah selesai diproses.',
    icon: ShieldAlert,
  },
  'unknown-denied': {
    title: 'Belajar terpandu belum tersedia',
    description: 'Nalira tidak membuat sesi dari sumber yang kepemilikannya belum dapat diverifikasi.',
    icon: ShieldAlert,
  },
};

export function GuidedEntryCard({
  eligibility,
  buttonRef,
  onStart,
}: GuidedEntryCardProps) {
  if (eligibility.status === 'unavailable') return null;

  if (eligibility.status !== 'eligible-owned') {
    const copy = blockedCopy[eligibility.status];
    const Icon = copy.icon;
    return (
      <aside className="notara-guided-entry-note" data-status={eligibility.status} role="note">
        <span className="notara-guided-entry-icon" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.description}</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="notara-guided-entry" data-status="eligible-owned" aria-labelledby="guided-entry-title">
      <span className="notara-guided-entry-icon" aria-hidden="true">
        <SemanticIcon name="learning-path" size={20} />
      </span>
      <div className="notara-guided-entry-copy">
        <strong id="guided-entry-title">Lanjut dengan belajar terpandu</strong>
        <p>Pilih tujuan, lihat rute, lalu lanjutkan satu langkah pada satu waktu.</p>
      </div>
      <div className="notara-guided-entry-continue">
        <small>Lima langkah · satu materi</small>
        <button ref={buttonRef} type="button" onClick={onStart} className="notara-guided-entry-action">
          Bantu aku lanjut <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
