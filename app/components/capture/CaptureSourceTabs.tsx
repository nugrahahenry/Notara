'use client';

import { Mic, Upload } from 'lucide-react';

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
    <div className="notara-capture-mode-tabs" role="tablist" aria-label="Cara menambahkan materi">
      <button
        type="button"
        role="tab"
        aria-selected={!isRecordingMode}
        aria-controls="capture-upload-panel"
        disabled={disabled}
        onClick={onSelectUpload}
        className={`min-h-11 flex-1 cursor-pointer rounded-xl px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          !isRecordingMode
            ? 'bg-[var(--surface-elevated)] text-[var(--nav-selected-text)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        <span>Upload file</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isRecordingMode}
        aria-controls="capture-recording-panel"
        disabled={disabled}
        onClick={onSelectRecording}
        className={`min-h-11 flex-1 cursor-pointer rounded-xl px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          isRecordingMode
            ? 'bg-[var(--surface-elevated)] text-[var(--nav-selected-text)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Mic className="h-4 w-4" aria-hidden="true" />
        <span>Rekam suara</span>
      </button>
    </div>
  );
}
