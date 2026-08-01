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
    <div className="bg-white/[0.02] p-1 rounded-2xl flex max-w-xs mx-auto mb-8 text-xs font-bold border border-white/[0.06] shadow-xl backdrop-blur-md">
      <button
        onClick={onSelectUpload}
        className={`flex-1 py-2 rounded-xl transition-all duration-300 cursor-pointer ${
          !isRecordingMode
            ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/20 border-t border-white/10'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        Upload File
      </button>
      <button
        onClick={onSelectRecording}
        className={`flex-1 py-2 rounded-xl transition-all duration-300 cursor-pointer ${
          isRecordingMode
            ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/20 border-t border-white/10'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        Rekam Suara
      </button>
    </div>
  );
}
