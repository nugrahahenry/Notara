import {
  GUIDED_CUSTOM_OBJECTIVE_MAX_LENGTH,
  type GuidedObjectiveDraft,
  type GuidedObjectiveKind,
} from './types';

export interface GuidedObjectiveOption {
  kind: GuidedObjectiveKind;
  label: string;
  description: string;
}

export const GUIDED_OBJECTIVE_OPTIONS: readonly GuidedObjectiveOption[] = [
  {
    kind: 'understand-core',
    label: 'Pahami konsep utama',
    description: 'Jelaskan kembali gagasan inti dengan bahasamu sendiri.',
  },
  {
    kind: 'compare-concepts',
    label: 'Bedakan konsep',
    description: 'Tentukan dua bagian yang ingin kamu bandingkan tanpa asumsi otomatis.',
  },
  {
    kind: 'prepare-quiz',
    label: 'Persiapan kuis',
    description: 'Latih recall dari materi ini tanpa skor atau kuis buatan otomatis.',
  },
  {
    kind: 'review-material',
    label: 'Ulangi materi',
    description: 'Baca ulang secara terstruktur lalu jelaskan kembali bagian penting.',
  },
  {
    kind: 'custom',
    label: 'Tujuan sendiri',
    description: 'Tulis tujuan belajar yang paling relevan untukmu.',
  },
] as const;

export function normalizeCustomObjective(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, GUIDED_CUSTOM_OBJECTIVE_MAX_LENGTH);
}

export function isValidGuidedObjective(
  objective: GuidedObjectiveDraft | null,
): objective is GuidedObjectiveDraft {
  if (!objective) return false;
  if (objective.kind === 'custom') return normalizeCustomObjective(objective.text).length > 0;
  return GUIDED_OBJECTIVE_OPTIONS.some(
    (option) => option.kind === objective.kind,
  );
}

export function normalizeGuidedObjective(
  objective: GuidedObjectiveDraft,
): GuidedObjectiveDraft | null {
  if (objective.kind !== 'custom') {
    return isValidGuidedObjective(objective) ? objective : null;
  }
  const text = normalizeCustomObjective(objective.text);
  return text ? { kind: 'custom', text } : null;
}

export function getGuidedObjectiveLabel(objective: GuidedObjectiveDraft): string {
  if (objective.kind === 'custom') return normalizeCustomObjective(objective.text);
  return GUIDED_OBJECTIVE_OPTIONS.find((option) => option.kind === objective.kind)?.label
    ?? 'Pahami konsep utama';
}

