import type { Folder, Summary } from '@/lib/types';

export type StudyGuideTab = 'summary' | 'transcript';
export type StudyGuideOwnership = 'owned' | 'forked' | 'shared' | 'unknown';

export type StudyGuideOrigin =
  | { type: 'home' }
  | { type: 'courses' }
  | { type: 'course'; courseId: string }
  | { type: 'shared' }
  | { type: 'search' }
  | { type: 'notara' }
  | { type: 'capture' }
  | { type: 'fork' }
  | { type: 'legacy' };

export interface StudyGuideMaterial {
  id: string;
  title: string;
  summary: string;
  transcript: string;
  courseId: string | null;
  courseName: string | null;
  fileName: string | null;
  durationSeconds: number | null;
  wordCount: number | null;
  createdAt: string;
  ownership: StudyGuideOwnership;
  source: Summary;
}

export interface StudyGuideBoundaryContext {
  material: StudyGuideMaterial;
  course: Folder | null;
  origin: StudyGuideOrigin;
  activeTab: StudyGuideTab;
}

