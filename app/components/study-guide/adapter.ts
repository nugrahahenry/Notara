import type { Folder, Summary } from '@/lib/types';
import type { StudyGuideMaterial, StudyGuideOwnership } from './types';

export interface StudyGuideAdapterOptions {
  ownership?: StudyGuideOwnership;
}

/**
 * Compatibility adapter for the current `Summary` model.
 * It deliberately does not infer ownership, provenance, mastery, or progress.
 */
export function toStudyGuideMaterial(
  summary: Summary,
  folder: Folder | null,
  options: StudyGuideAdapterOptions = {},
): StudyGuideMaterial {
  return {
    id: summary.id,
    title: summary.title,
    summary: summary.summary,
    transcript: summary.transcript,
    courseId: summary.folder_id,
    courseName: folder?.name ?? null,
    fileName: summary.file_name,
    durationSeconds: summary.duration_sec,
    wordCount: summary.word_count,
    createdAt: summary.created_at,
    ownership: options.ownership ?? 'unknown',
    source: summary,
  };
}

