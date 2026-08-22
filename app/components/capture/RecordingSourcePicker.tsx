'use client';

import { Check, Headphones, Mic, Monitor, RefreshCw, Volume2 } from 'lucide-react';
import type {
  RecordingSourceCheckStatus,
  RecordingSourceKind,
} from '../../../lib/capture/source';
import { isRecordingSourceCheckBusy } from '../../../lib/capture/source';

interface RecordingSourcePickerProps {
  source: RecordingSourceKind;
  checkStatus: RecordingSourceCheckStatus;
  checkRemainingSeconds: number | null;
  error: string | null;
  disabled: boolean;
  onSourceChange: (source: RecordingSourceKind) => void;
  onTestSource: () => void;
}

const SOURCE_OPTIONS: Array<{
  value: RecordingSourceKind;
  title: string;
  description: string;
  Icon: typeof Mic;
}> = [
  {
    value: 'microphone',
    title: 'Mikrofon kelas',
    description: 'Untuk dosen di ruangan. Gunakan headphone agar Zoom tidak bocor.',
    Icon: Mic,
  },
  {
    value: 'browser-tab',
    title: 'Tab Zoom / Meet',
    description: 'Pilih tab Chrome dan aktifkan “Bagikan juga audio tab”.',
    Icon: Monitor,
  },
];

function getStatusCopy(
  status: RecordingSourceCheckStatus,
  remainingSeconds: number | null,
  source: RecordingSourceKind,
): string {
  if (status === 'requesting') {
    return source === 'browser-tab'
      ? 'Menunggu Chrome membuka pemilih tab. Pilih tab kelas dan aktifkan audio tab.'
      : 'Menunggu izin mikrofon dari Chrome. Izinkan akses untuk memulai tes.';
  }
  if (status === 'checking') {
    return `Mendengarkan sumber selama ${remainingSeconds ?? 10} detik…`;
  }
  if (status === 'ready') {
    return 'Sumber siap. Gelombang suara terdeteksi dan izin tetap aktif.';
  }
  if (status === 'silent') {
    return 'Sumber terhubung, tetapi belum ada suara yang terdeteksi. Putar Zoom atau bicara dekat mikrofon lalu tes ulang.';
  }
  return 'Tes singkat memastikan Nalira mendengar sumber yang benar sebelum rekaman panjang dimulai.';
}

export function RecordingSourcePicker({
  source,
  checkStatus,
  checkRemainingSeconds,
  error,
  disabled,
  onSourceChange,
  onTestSource,
}: RecordingSourcePickerProps) {
  const isRequesting = checkStatus === 'requesting';
  const isBusy = isRecordingSourceCheckBusy(checkStatus);
  const isReady = checkStatus === 'ready';
  const hasWarning = checkStatus === 'silent';

  return (
    <fieldset className="w-full" disabled={disabled || isBusy}>
      <legend className="text-sm font-bold text-[var(--text-primary)]">
        Pilih yang ingin didengar Nalira
      </legend>
      <div className="mb-4 mt-1 flex flex-col gap-1 text-left sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xl text-xs leading-5 text-[var(--text-secondary)]">
          Satu sumber aktif menjaga audio kelas dan kelas online tidak tercampur.
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] sm:mt-0">
          <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
          Audio tidak disimpan permanen
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SOURCE_OPTIONS.map(({ value, title, description, Icon }) => {
          const selected = source === value;
          return (
            <label
              key={value}
              className={`group relative flex min-h-28 cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--action-primary)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface-canvas)] ${
                selected
                  ? 'border-[var(--action-primary)] bg-[color-mix(in_srgb,var(--action-primary)_10%,var(--surface-canvas))] shadow-sm'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-tool)] hover:border-[var(--border-strong)]'
              } ${disabled ? 'cursor-not-allowed opacity-65' : ''}`}
            >
              <input
                type="radio"
                name="recording-source"
                value={value}
                checked={selected}
                disabled={disabled}
                onChange={() => onSourceChange(value)}
                className="sr-only"
              />
              <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                selected
                  ? 'bg-[var(--action-primary)] text-[var(--text-on-brand)]'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
              }`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{title}</span>
                  {selected && (
                    <Check className="h-4 w-4 shrink-0 text-[var(--action-primary)]" aria-hidden="true" />
                  )}
                </span>
                <span className="mt-1.5 block text-xs leading-5 text-[var(--text-secondary)]">
                  {description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className={`mt-4 flex flex-col gap-3 rounded-2xl px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between ${
        error
          ? 'bg-[color-mix(in_srgb,var(--danger-accent)_12%,transparent)]'
          : hasWarning
            ? 'bg-[color-mix(in_srgb,var(--review-accent)_12%,transparent)]'
            : 'bg-[var(--surface-tool)]'
      }`}>
        <div
          className="flex min-w-0 items-start gap-2.5"
          role={error ? 'alert' : 'status'}
          aria-live="polite"
          aria-atomic="true"
        >
          {isReady ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-accent)]" aria-hidden="true" />
          ) : (
            <Volume2 className={`mt-0.5 h-4 w-4 shrink-0 ${
              error ? 'text-[var(--danger-accent)]' : 'text-[var(--knowledge-accent)]'
            }`} aria-hidden="true" />
          )}
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            {error ?? getStatusCopy(checkStatus, checkRemainingSeconds, source)}
          </p>
        </div>

        <button
          type="button"
          onClick={onTestSource}
          disabled={disabled || isBusy}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--action-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isRequesting
            ? 'Menunggu izin'
            : checkStatus === 'checking'
              ? 'Menguji sumber'
              : isReady || hasWarning ? 'Tes ulang' : 'Tes 10 detik'}
        </button>
      </div>
    </fieldset>
  );
}
