export const COMPARE_SEGMENTATION_VERSION = 'exact-source-block-v1' as const;
export const COMPARE_FINGERPRINT_VERSION = 'fnv1a64-utf8-v1' as const;

export const MAX_SOURCE_CODE_UNITS = 1_000_000 as const;
export const MAX_BLOCK_CODE_UNITS = 1_200 as const;
export const TARGET_TRANSCRIPT_BLOCK_CODE_UNITS = 520 as const;
export const MIN_SELECTABLE_NON_WHITESPACE = 24 as const;
export const MAX_BLOCK_COUNT_PER_SURFACE = 2_000 as const;
export const INITIAL_RENDERED_BLOCKS = 40 as const;
export const RENDER_BLOCK_BATCH = 40 as const;

export type CompareSourceSurface = 'summary' | 'transcript';
export type CompareSlot = 'a' | 'b';

export type CompareSourceBlockKind =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'blockquote'
  | 'table'
  | 'code'
  | 'transcript-passage';

export type SourceBlockResultStatus =
  | 'ready'
  | 'empty'
  | 'too-large'
  | 'too-many-blocks'
  | 'no-selectable-blocks';

export interface TransientSourceSnapshot {
  materialId: string;
  surface: CompareSourceSurface;
  segmentationVersion: typeof COMPARE_SEGMENTATION_VERSION;
  fingerprintVersion: typeof COMPARE_FINGERPRINT_VERSION;
  sourceFingerprint: string;
  textLength: number;
}

export interface TransientSourceBlock {
  id: string;
  materialId: string;
  surface: CompareSourceSurface;
  segmentationVersion: typeof COMPARE_SEGMENTATION_VERSION;
  sourceFingerprint: string;
  startOffset: number;
  endOffset: number;
  ordinal: number;
  kind: CompareSourceBlockKind;
  exactText: string;
  selectable: boolean;
  contextLabel?: string;
}

export interface CompareSourceResult {
  status: SourceBlockResultStatus;
  snapshot: TransientSourceSnapshot;
  text: string;
  blocks: readonly TransientSourceBlock[];
}

export interface CompareSourceBundle {
  materialId: string;
  sourceSignature: string;
  summary: CompareSourceResult;
  transcript: CompareSourceResult;
}

export interface CompareNotes {
  similarities: string;
  differences: string;
  remainingQuestion: string;
}

export interface CompareDraft {
  materialId: string;
  sourceSignature: string;
  a: TransientSourceBlock | null;
  b: TransientSourceBlock | null;
  notes: CompareNotes;
}

export type CompareNoteField = keyof CompareNotes;

export type CompareDraftEvent =
  | { type: 'SOURCE_SIGNATURE_CHANGED'; sourceSignature: string }
  | { type: 'SELECT_COMPARE_BLOCK'; slot: CompareSlot; block: TransientSourceBlock; sourceSignature: string }
  | { type: 'CLEAR_COMPARE_BLOCK'; slot: CompareSlot; sourceSignature: string }
  | { type: 'SET_COMPARE_NOTE'; field: CompareNoteField; value: string; sourceSignature: string }
  | {
      type: 'CONFIRM_COMPARE_SOURCE_REPLACEMENT';
      slot: CompareSlot;
      replacement: TransientSourceBlock | null;
      sourceSignature: string;
    }
  | { type: 'RESET_COMPARE'; sourceSignature?: string };

export interface ComparePairValidation {
  valid: boolean;
  reason?: 'missing-block' | 'same-block' | 'stale-block' | 'wrong-material' | 'unselectable';
}

