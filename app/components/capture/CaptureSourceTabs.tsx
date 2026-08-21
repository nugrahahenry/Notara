'use client';

interface CaptureSourceTabsProps {
  isRecordingMode: boolean;
  disabled?: boolean;
  onSelectUpload: () => void;
  onSelectRecording: () => void;
}

export function CaptureSourceTabs({
  isRecordingMode,
  disabled = false,
  onSelectUpload,
  onSelectRecording,
}: CaptureSourceTabsProps) {
  return (
    <div className="mx-auto mb-8 flex max-w-xs rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] p-1 text-xs font-bold" role="tablist" aria-label="Sumber materi">
      <button
        type="button"
        role="tab"
        aria-selected={!isRecordingMode}
        disabled={disabled}
        onClick={onSelectUpload}
        className={`min-h-11 flex-1 cursor-pointer rounded-xl px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          !isRecordingMode
            ? 'bg-[var(--surface-elevated)] text-[var(--nav-selected-text)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        Upload file
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isRecordingMode}
        disabled={disabled}
        onClick={onSelectRecording}
        className={`min-h-11 flex-1 cursor-pointer rounded-xl px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          isRecordingMode
            ? 'bg-[var(--surface-elevated)] text-[var(--nav-selected-text)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        Rekam suara
      </button>
    </div>
  );
}
