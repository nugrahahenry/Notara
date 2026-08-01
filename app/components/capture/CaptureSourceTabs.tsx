'use client';

interface CaptureSourceTabsProps {
  isRecordingMode: boolean;
  onSelectUpload: () => void;
  onSelectRecording: () => void;
}

export function CaptureSourceTabs({
  isRecordingMode,
  onSelectUpload,
  onSelectRecording,
}: CaptureSourceTabsProps) {
  return (
    <div className="mx-auto mb-8 flex max-w-xs rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] p-1 text-xs font-bold">
      <button
        onClick={onSelectUpload}
        className={`min-h-11 flex-1 cursor-pointer rounded-xl py-2 transition-colors ${
          !isRecordingMode
            ? 'bg-[var(--surface-elevated)] text-[var(--nav-selected-text)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        Upload File
      </button>
      <button
        onClick={onSelectRecording}
        className={`min-h-11 flex-1 cursor-pointer rounded-xl py-2 transition-colors ${
          isRecordingMode
            ? 'bg-[var(--surface-elevated)] text-[var(--nav-selected-text)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        Rekam Suara
      </button>
    </div>
  );
}
