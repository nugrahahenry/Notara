import { MAX_BLOCK_CODE_UNITS } from './types';
import type { CompareSourceBlockKind } from './types';

export interface CompareSourceRange {
  startOffset: number;
  endOffset: number;
  kind: CompareSourceBlockKind;
  contextLabel?: string;
}

export interface SourceLine {
  startOffset: number;
  contentEndOffset: number;
  endOffset: number;
  content: string;
}

export function parseSourceLines(text: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let contentEnd = cursor;
    while (contentEnd < text.length && text[contentEnd] !== '\n' && text[contentEnd] !== '\r') {
      contentEnd += 1;
    }
    let lineEnd = contentEnd;
    if (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n') lineEnd += 2;
    else if (text[lineEnd] === '\r' || text[lineEnd] === '\n') lineEnd += 1;
    lines.push({
      startOffset: cursor,
      contentEndOffset: contentEnd,
      endOffset: lineEnd,
      content: text.slice(cursor, contentEnd),
    });
    cursor = lineEnd;
  }
  if (text.length === 0) return [];
  if (lines.length === 0 || lines[lines.length - 1].endOffset < text.length) {
    lines.push({
      startOffset: cursor,
      contentEndOffset: text.length,
      endOffset: text.length,
      content: text.slice(cursor),
    });
  }
  return lines;
}

export function trimSourceRange(text: string, startOffset: number, endOffset: number): {
  startOffset: number;
  endOffset: number;
} | null {
  let start = Math.max(0, startOffset);
  let end = Math.min(text.length, endOffset);
  while (start < end && /\s/u.test(text[start])) start += 1;
  while (end > start && /\s/u.test(text[end - 1])) end -= 1;
  return start < end ? { startOffset: start, endOffset: end } : null;
}

function lastWhitespaceBefore(text: string, startOffset: number, endOffset: number): number {
  for (let index = endOffset - 1; index > startOffset; index -= 1) {
    if (/\s/u.test(text[index])) return index;
  }
  return -1;
}

/** Split a long exact source range without rewriting its content. */
export function splitLongSourceRange(
  text: string,
  range: CompareSourceRange,
  maxCodeUnits = MAX_BLOCK_CODE_UNITS,
): readonly CompareSourceRange[] {
  const trimmed = trimSourceRange(text, range.startOffset, range.endOffset);
  if (!trimmed) return [];
  if (trimmed.endOffset - trimmed.startOffset <= maxCodeUnits) {
    return [{ ...range, ...trimmed }];
  }

  const chunks: CompareSourceRange[] = [];
  let cursor = trimmed.startOffset;
  while (cursor < trimmed.endOffset) {
    while (cursor < trimmed.endOffset && /\s/u.test(text[cursor])) cursor += 1;
    if (cursor >= trimmed.endOffset) break;

    const hardEnd = Math.min(cursor + maxCodeUnits, trimmed.endOffset);
    let chunkEnd = hardEnd;
    if (hardEnd < trimmed.endOffset) {
      const whitespace = lastWhitespaceBefore(text, cursor, hardEnd + 1);
      if (whitespace > cursor) chunkEnd = whitespace;
    }
    const chunk = trimSourceRange(text, cursor, chunkEnd);
    if (chunk) chunks.push({ ...range, ...chunk });
    cursor = chunkEnd;
    if (cursor < trimmed.endOffset && !/\s/u.test(text[cursor]) && chunkEnd === hardEnd) {
      continue;
    }
    while (cursor < trimmed.endOffset && /\s/u.test(text[cursor])) cursor += 1;
  }
  return chunks;
}

