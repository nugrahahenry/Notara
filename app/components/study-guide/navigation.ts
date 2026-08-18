import type { StudyGuideOrigin } from './types';
import type { WorkspaceView } from '../workspace/types';

const originKinds = new Set([
  'home',
  'courses',
  'course',
  'shared',
  'search',
  'notara',
  'capture',
  'fork',
  'legacy',
]);

export interface ParsedStudyGuideLocation {
  materialId: string | null;
  origin: StudyGuideOrigin;
  isLocalOnly: boolean;
}

function safeId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) return null;
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

export function normalizeStudyGuideOrigin(
  rawOrigin: string | null,
  rawCourseId: string | null,
): StudyGuideOrigin {
  if (!rawOrigin || !originKinds.has(rawOrigin)) return { type: 'legacy' };
  if (rawOrigin === 'course') {
    const courseId = safeId(rawCourseId);
    return courseId ? { type: 'course', courseId } : { type: 'courses' };
  }
  return { type: rawOrigin } as StudyGuideOrigin;
}

export function parseStudyGuideLocation(search: string): ParsedStudyGuideLocation {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const materialId = safeId(params.get('material'));
  return {
    materialId,
    origin: normalizeStudyGuideOrigin(params.get('from'), params.get('course')),
    isLocalOnly: Boolean(materialId?.startsWith('local-')),
  };
}

export function serializeStudyGuideOrigin(origin: StudyGuideOrigin): URLSearchParams {
  const params = new URLSearchParams();
  params.set('from', origin.type);
  if (origin.type === 'course') params.set('course', origin.courseId);
  return params;
}

export function buildStudyGuideUrl(materialId: string, origin: StudyGuideOrigin): string {
  const params = serializeStudyGuideOrigin(origin);
  params.set('material', materialId);
  const ordered = new URLSearchParams();
  ordered.set('material', materialId);
  const from = params.get('from');
  if (from) ordered.set('from', from);
  const course = params.get('course');
  if (course) ordered.set('course', course);
  return `/dashboard?${ordered.toString()}`;
}

export function getOriginWorkspace(origin: StudyGuideOrigin): WorkspaceView {
  if (origin.type === 'shared') return 'shared';
  if (origin.type === 'notara') return 'notara';
  if (origin.type === 'capture') return 'capture';
  if (origin.type === 'course' || origin.type === 'courses') return 'courses';
  return 'home';
}

export function getOriginLabel(origin: StudyGuideOrigin): string {
  switch (origin.type) {
    case 'course':
      return 'Mata Kuliah';
    case 'courses':
      return 'Mata Kuliah';
    case 'shared':
      return 'Dibagikan';
    case 'search':
      return 'Pencarian';
    case 'notara':
      return 'Tanya Nalira';
    case 'capture':
      return 'Rekam / Upload';
    case 'fork':
      return 'Hasil fork';
    case 'home':
      return 'Beranda';
    default:
      return 'Beranda';
  }
}

export function clearStudyGuideUrl(): string {
  return '/dashboard';
}

