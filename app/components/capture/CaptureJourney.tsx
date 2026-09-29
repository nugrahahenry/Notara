'use client';

import { Check } from 'lucide-react';

interface CaptureJourneyProps {
  isRecordingMode: boolean;
  isRecording: boolean;
  hasInput: boolean;
}

const STEPS = ['Pilih cara', 'Siapkan materi', 'Buat rangkuman'];

export function CaptureJourney({ isRecordingMode, isRecording, hasInput }: CaptureJourneyProps) {
  const currentStep = isRecording || hasInput ? 2 : 1;
  const modeLabel = isRecordingMode ? 'Rekam suara' : 'Upload file';

  return (
    <nav className="notara-capture-journey" aria-label="Langkah menambahkan materi">
      <ol>
        {STEPS.map((label, index) => {
          const step = index + 1;
          const isComplete = step < currentStep;
          const isCurrent = step === currentStep;
          const detail = step === 1
            ? modeLabel
            : step === 2
              ? isRecording
                ? 'Rekaman sedang berlangsung'
                : hasInput
                  ? isRecordingMode ? 'Rekaman siap diproses' : 'File ada di antrean'
                  : isRecordingMode ? 'Belum ada rekaman' : 'Belum ada file'
              : 'Setelah proses selesai';

          return (
            <li
              key={label}
              data-state={isComplete ? 'complete' : isCurrent ? 'current' : 'upcoming'}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="notara-capture-journey__marker" aria-hidden="true">
                {isComplete ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step}
              </span>
              <span className="notara-capture-journey__copy">
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              {step < STEPS.length && <span className="notara-capture-journey__line" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
