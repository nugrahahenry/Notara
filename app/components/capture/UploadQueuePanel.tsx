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
      className={`relative rounded-3xl border-2 border-dashed p-8 md:p-12 text-center cursor-pointer transition-all duration-300 backdrop-blur-sm hover:scale-[1.005] hover:animate-pulse-glow ${
        dragActive
          ? 'border-violet-500 bg-violet-600/15 shadow-[0_0_40px_rgba(139,92,246,0.2)] scale-[1.01] animate-pulse-glow'
          : 'bg-white/[0.01] border-white/10 hover:border-violet-500/40'
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
          <div className="h-16 w-16 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-400 transition-all duration-300 hover:scale-105 animate-float relative group">
            <NotaraLogo
              variant="icon"
              animated
              motionState={dragActive ? 'loading' : 'thinking'}
              size={36}
            />
          </div>
          <div className="space-y-1">
            <p className="text-white font-extrabold text-sm md:text-base tracking-wide transition-all duration-200">
              {dragActive
                ? 'Lepaskan file untuk mengunggah'
                : 'Tarik & lepas file audio atau video di sini'}
            </p>
            <p className="text-zinc-500 text-xs">
              Atau klik untuk menjelajahi file di perangkat Anda
            </p>
          </div>
          <div className="text-[10px] px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-zinc-400 font-medium font-sans max-w-sm tracking-wide shadow-sm mx-auto animate-pulse">
            🎧 MP3, M4A, WAV • 🎬 MP4, WEBM, MOV • Maks 3 file sekuensial
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto animate-in zoom-in-95 duration-200">
          <div className="text-xs font-bold text-zinc-400 self-start">
            Daftar File Antrean ({files.length}/{MAX_QUEUE_FILES}):
          </div>
          <div className="w-full space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-violet-600/5 border border-violet-500/10 hover:border-violet-500/20 transition-all duration-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 shrink-0">
                    <FileAudio className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-xs font-bold text-white truncate max-w-[200px]" title={file.name}>
                      {file.name}
                    </p>
                    <span className="text-[9px] text-zinc-500 font-mono">
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
                  className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
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
              className="mt-1 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-bold px-4 py-2 rounded-xl bg-violet-500/5 border border-violet-500/10 hover:border-violet-500/20 transition-all duration-200"
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
            className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 font-bold px-3.5 py-2 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/20 transition-all duration-300 active:scale-95 shadow-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hapus Semua File
          </button>
        </div>
      )}
    </div>
  );
}
