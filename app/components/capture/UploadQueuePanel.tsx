'use client';

import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { FileAudio, Plus, Trash2 } from 'lucide-react';
import { formatFileSize } from '@/lib/capture/audio';
import { MAX_QUEUE_FILES } from '@/lib/capture/constants';
import { NotaraLogo } from '../brand/NotaraLogo';

interface UploadQueuePanelProps {
  files: File[];
  dragActive: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDrag: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBrowse: () => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
}

export function UploadQueuePanel({
  files,
  dragActive,
  fileInputRef,
  onDrag,
  onDrop,
  onFileChange,
  onBrowse,
  onRemoveFile,
  onClearFiles,
}: UploadQueuePanelProps) {
  return (
    <div
      data-tour="upload-area"
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={onDrag}
      onDrop={onDrop}
      onClick={files.length > 0 ? undefined : onBrowse}
      className={`relative cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition-colors md:p-12 ${
        dragActive
          ? 'border-[var(--brand-primary)] bg-[var(--nav-selected)]'
          : 'border-[var(--border-strong)] bg-[var(--surface-canvas)] hover:border-[var(--brand-primary)]'
      }`}
    >
      <input
        key={files.length > 0 ? 'active' : 'empty'}
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.mov,.webm,.mkv,.ogg,.aac"
        className="hidden"
        onChange={onFileChange}
      />

      {files.length === 0 ? (
        <div className="flex flex-col items-center gap-5">
          <div className="group relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--brand-primary)]">
            <NotaraLogo
              variant="icon"
              animated
              motionState={dragActive ? 'loading' : 'thinking'}
              size={36}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-extrabold tracking-wide text-[var(--text-primary)] md:text-base">
              {dragActive
                ? 'Lepaskan file untuk mengunggah'
                : 'Tarik & lepas file audio atau video di sini'}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Atau klik untuk menjelajahi file di perangkat Anda
            </p>
          </div>
          <div className="mx-auto max-w-sm rounded-full border border-[var(--border-subtle)] bg-[var(--surface-tool)] px-3.5 py-1.5 font-sans text-xs font-medium tracking-wide text-[var(--text-secondary)]">
            🎧 MP3, M4A, WAV • 🎬 MP4, WEBM, MOV • Maks 3 file sekuensial
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto animate-in zoom-in-95 duration-200">
          <div className="self-start text-xs font-bold text-[var(--text-secondary)]">
            Daftar File Antrean ({files.length}/{MAX_QUEUE_FILES}):
          </div>
          <div className="w-full space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5 transition-colors hover:border-[var(--border-strong)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-selected)] text-[var(--nav-selected-text)]">
                    <FileAudio className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="max-w-[200px] truncate text-xs font-bold text-[var(--text-primary)]" title={file.name}>
                      {file.name}
                    </p>
                    <span className="font-mono text-xs text-[var(--text-tertiary)]">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveFile(index);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-red-500/10 hover:text-[var(--danger-accent)]"
                  title="Hapus dari antrean"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {files.length < MAX_QUEUE_FILES && (
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onBrowse();
              }}
              className="mt-1 flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] px-4 py-2 text-xs font-bold text-[var(--brand-primary)] transition-colors hover:border-[var(--brand-primary)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah File Lain
            </button>
          )}

          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClearFiles();
            }}
            className="mt-2 flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger-accent)] hover:text-[var(--danger-accent)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hapus Semua File
          </button>
        </div>
      )}
    </div>
  );
}
