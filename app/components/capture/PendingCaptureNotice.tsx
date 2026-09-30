'use client';

import { FileCheck2 } from 'lucide-react';

export function PendingCaptureNotice({ title, onResume }: { title: string; onResume: () => void }) {
  return (
    <section className="notara-pending-capture" aria-label="Hasil capture belum tersimpan">
      <FileCheck2 className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold">Lanjutkan penyimpanan</h2>
        <p className="mt-1 break-words text-sm text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          Hasil proses masih ada di tab ini. Simpan sebelum refresh atau menutup tab; audio tidak perlu diproses ulang.
        </p>
      </div>
      <button type="button" onClick={onResume} className="notara-primary-button shrink-0">
        Pilih tujuan & simpan
      </button>
    </section>
  );
}
