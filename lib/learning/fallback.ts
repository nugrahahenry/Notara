import type { Folder, Summary } from '../types';

export type Daypart = 'pagi' | 'siang' | 'sore' | 'malam';

export interface LearningFallback {
  recommendation: Summary;
  folder: Folder | null;
  reason: string;
  prerequisite: Summary | null;
  estimateMinutes: number;
  sequence: Summary[];
}

function createdAtValue(summary: Summary): number {
  const value = Date.parse(summary.created_at);
  return Number.isNaN(value) ? 0 : value;
}

export function getDaypart(hour: number): Daypart {
  if (hour >= 5 && hour < 11) return 'pagi';
  if (hour >= 11 && hour < 15) return 'siang';
  if (hour >= 15 && hour < 18) return 'sore';
  return 'malam';
}

export function estimateLearningMinutes(summary: Summary): number {
  const durationMinutes = summary.duration_sec ? summary.duration_sec / 60 : 0;
  const readingMinutes = summary.word_count ? summary.word_count / 180 : 0;
  const baseEstimate = Math.max(durationMinutes * 0.3, readingMinutes, 8);
  return Math.min(45, Math.max(8, Math.round(baseEstimate)));
}

/**
 * Temporary presentation adapter for Checkpoint 3.
 *
 * This deliberately uses only existing material recency and course membership.
 * It is replaceable when the Learning System owns a validated recommendation
 * contract; it must not be treated as an AI recommendation engine.
 */
export function buildLearningFallback(
  summaries: Summary[],
  folders: Folder[],
): LearningFallback | null {
  if (summaries.length === 0) return null;

  const newestFirst = [...summaries].sort(
    (left, right) => createdAtValue(right) - createdAtValue(left),
  );
  const recommendation = newestFirst[0];
  const folder = recommendation.folder_id
    ? folders.find((item) => item.id === recommendation.folder_id) ?? null
    : null;
  const sameCourseOlder = newestFirst.filter(
    (item) => item.id !== recommendation.id
      && item.folder_id === recommendation.folder_id,
  );

  return {
    recommendation,
    folder,
    reason: folder
      ? `Materi terbaru di ${folder.name}; lanjutkan selagi konteksnya masih segar.`
      : 'Materi terbaru yang kamu tambahkan; lanjutkan selagi konteksnya masih segar.',
    prerequisite: sameCourseOlder[0] ?? null,
    estimateMinutes: estimateLearningMinutes(recommendation),
    sequence: newestFirst.slice(0, 4),
  };
}
