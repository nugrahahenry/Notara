import type { GuidedFoundationState } from '../guided/types';

const positions = [
  { stage: 'review', label: 'Materi' },
  { stage: 'objective', label: 'Tujuan' },
  { stage: 'route', label: 'Rute' },
  { stage: 'session', label: 'Sesi belajar' },
] as const;

export function LearningPosition({ stage }: { stage: GuidedFoundationState['stage'] }) {
  return (
    <nav className="notara-learning-position" aria-label="Posisi dalam alur belajar">
      <ol>
        {positions.map((position) => (
          <li key={position.stage} aria-current={position.stage === stage ? 'step' : undefined}>
            {position.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
