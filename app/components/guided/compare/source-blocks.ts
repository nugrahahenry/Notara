import { fnv1a64Utf8 } from './fingerprint';
import { segmentSummaryRanges } from './segment-summary';
import { segmentTranscriptRanges } from './segment-transcript';
import {
  COMPARE_FINGERPRINT_VERSION,
  COMPARE_SEGMENTATION_VERSION,
  MAX_BLOCK_COUNT_PER_SURFACE,
  MAX_SOURCE_CODE_UNITS,
  MIN_SELECTABLE_NON_WHITESPACE,
} from './types';
import type {
  ComparePairValidation,
  CompareSourceBlockKind,
  CompareSourceBundle,
  CompareSourceResult,
  CompareSourceSurface,
  TransientSourceBlock,
  TransientSourceSnapshot,
} from './types';
import type { CompareSourceRange } from './range-utils';

export {
  INITIAL_RENDERED_BLOCKS,
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_COUNT_PER_SURFACE,
  MAX_SOURCE_CODE_UNITS,
  MIN_SELECTABLE_NON_WHITESPACE,
  RENDER_BLOCK_BATCH,
  TARGET_TRANSCRIPT_BLOCK_CODE_UNITS,
} from './types';

function createSnapshot(
  materialId: string,
  surface: CompareSourceSurface,
  text: string,
): TransientSourceSnapshot {
  return {
    materialId,
    surface,
    segmentationVersion: COMPARE_SEGMENTATION_VERSION,
    fingerprintVersion: COMPARE_FINGERPRINT_VERSION,
    sourceFingerprint: fnv1a64Utf8(text),
    textLength: text.length,
  };
}

function nonWhitespaceLength(value: string): number {
  return value.replace(/\s/gu, '').length;
}

function createBlock(
  materialId: string,
  surface: CompareSourceSurface,
  snapshot: TransientSourceSnapshot,
  text: string,
  range: CompareSourceRange,
  ordinal: number,
): TransientSourceBlock {
  const exactText = text.slice(range.startOffset, range.endOffset);
  return {
    id: `${surface}:${snapshot.sourceFingerprint}:${range.startOffset}:${range.endOffset}:${ordinal}`,
    materialId,
    surface,
    segmentationVersion: COMPARE_SEGMENTATION_VERSION,
    sourceFingerprint: snapshot.sourceFingerprint,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    ordinal,
    kind: range.kind as CompareSourceBlockKind,
    exactText,
    selectable: nonWhitespaceLength(exactText) >= MIN_SELECTABLE_NON_WHITESPACE,
    ...(range.contextLabel ? { contextLabel: range.contextLabel } : {}),
  };
}

export function segmentCompareSurface(
  materialId: string,
  surface: CompareSourceSurface,
  text: string,
): CompareSourceResult {
  const snapshot = createSnapshot(materialId, surface, text);
  if (!text.trim()) return { status: 'empty', snapshot, text, blocks: [] };
  if (text.length > MAX_SOURCE_CODE_UNITS) return { status: 'too-large', snapshot, text, blocks: [] };

  const ranges = surface === 'summary' ? segmentSummaryRanges(text) : segmentTranscriptRanges(text);
  if (ranges.length > MAX_BLOCK_COUNT_PER_SURFACE) {
    return { status: 'too-many-blocks', snapshot, text, blocks: [] };
  }
  const blocks = ranges.map((range, index) => createBlock(
    materialId,
    surface,
    snapshot,
    text,
    range,
    index + 1,
  ));
  const status = blocks.some((block) => block.selectable) ? 'ready' : 'no-selectable-blocks';
  return { status, snapshot, text, blocks };
}

export function createCompareSourceSignature(
  materialId: string,
  summary: TransientSourceSnapshot,
  transcript: TransientSourceSnapshot,
): string {
  return [
    `material:${materialId}`,
    `summary:${summary.sourceFingerprint}:${summary.textLength}`,
    `transcript:${transcript.sourceFingerprint}:${transcript.textLength}`,
    `segmentation:${COMPARE_SEGMENTATION_VERSION}`,
  ].join('|');
}

export function createCompareSourceBundle(
  materialId: string,
  summaryText: string,
  transcriptText: string,
): CompareSourceBundle {
  const summary = segmentCompareSurface(materialId, 'summary', summaryText);
  const transcript = segmentCompareSurface(materialId, 'transcript', transcriptText);
  return {
    materialId,
    sourceSignature: createCompareSourceSignature(materialId, summary.snapshot, transcript.snapshot),
    summary,
    transcript,
  };
}

export function isCurrentCompareBlock(
  bundle: CompareSourceBundle,
  block: TransientSourceBlock | null | undefined,
): block is TransientSourceBlock {
  if (!block || !block.selectable || block.materialId !== bundle.materialId) return false;
  const result = block.surface === 'summary' ? bundle.summary : bundle.transcript;
  if (result.status !== 'ready') return false;
  if (block.segmentationVersion !== COMPARE_SEGMENTATION_VERSION) return false;
  if (block.sourceFingerprint !== result.snapshot.sourceFingerprint) return false;
  if (block.startOffset < 0 || block.endOffset > result.text.length || block.startOffset >= block.endOffset) return false;
  return result.text.slice(block.startOffset, block.endOffset) === block.exactText;
}

export function validateComparePair(
  bundle: CompareSourceBundle,
  a: TransientSourceBlock | null | undefined,
  b: TransientSourceBlock | null | undefined,
): ComparePairValidation {
  if (!a || !b) return { valid: false, reason: 'missing-block' };
  if (a.id === b.id) return { valid: false, reason: 'same-block' };
  if (a.materialId !== bundle.materialId || b.materialId !== bundle.materialId) {
    return { valid: false, reason: 'wrong-material' };
  }
  if (!a.selectable || !b.selectable) return { valid: false, reason: 'unselectable' };
  if (!isCurrentCompareBlock(bundle, a) || !isCurrentCompareBlock(bundle, b)) {
    return { valid: false, reason: 'stale-block' };
  }
  return { valid: true };
}

export function countSelectableCompareBlocks(bundle: CompareSourceBundle): number {
  return bundle.summary.blocks.filter((block) => block.selectable).length
    + bundle.transcript.blocks.filter((block) => block.selectable).length;
}

export function canBuildComparePair(bundle: CompareSourceBundle): boolean {
  return countSelectableCompareBlocks(bundle) >= 2;
}

export function filterCompareBlocks(
  blocks: readonly TransientSourceBlock[],
  query: string,
): readonly TransientSourceBlock[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return blocks;
  return blocks.filter((block) => `${block.contextLabel ?? ''}\n${block.exactText}`.toLowerCase().includes(normalized));
}

