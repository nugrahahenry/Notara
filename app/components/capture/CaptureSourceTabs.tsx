'use client';

import type { KeyboardEvent } from 'react';
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
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    const target = event.currentTarget.id === 'capture-recording-tab' ? 'recording' : 'upload';
    const nextTarget = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? target === 'upload' ? 'recording' : 'upload'
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? target === 'recording' ? 'upload' : 'recording'
        : event.key === 'Home'
          ? 'upload'
          : event.key === 'End'
            ? 'recording'
            : null;

    if (!nextTarget) return;

    event.preventDefault();
    const nextButton = document.getElementById(`capture-${nextTarget}-tab`) as HTMLButtonElement | null;
    nextButton?.focus();
    if (nextTarget === 'recording' && !isRecordingMode) onSelectRecording();
    if (nextTarget === 'upload' && isRecordingMode) onSelectUpload();
  };

  return (
    <div className="notara-capture-mode-tabs" role="tablist" aria-label="Cara menambahkan materi">
      <button
        id="capture-upload-tab"
        type="button"
        role="tab"
        aria-selected={!isRecordingMode}
        aria-controls="capture-upload-panel"
        tabIndex={!isRecordingMode ? 0 : -1}
        disabled={disabled}
        onKeyDown={handleKeyDown}
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
        id="capture-recording-tab"
        type="button"
        role="tab"
        aria-selected={isRecordingMode}
        aria-controls="capture-recording-panel"
        tabIndex={isRecordingMode ? 0 : -1}
        disabled={disabled}
        onKeyDown={handleKeyDown}
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
