import type { CompareSourceRange, SourceLine } from './range-utils';
import { parseSourceLines, splitLongSourceRange, trimSourceRange } from './range-utils';

const HEADING = /^\s{0,3}#{1,6}(?:\s+|$)/u;
const LIST_ITEM = /^\s{0,3}(?:[-+*]|\d+[.)])\s+/u;
const BLOCKQUOTE = /^\s{0,3}>\s?/u;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;
const HORIZONTAL_RULE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u;
const TABLE_DELIMITER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u;

function isBlank(line: SourceLine | undefined): boolean {
  return !line || line.content.trim().length === 0;
}

function isHorizontalRule(line: SourceLine | undefined): boolean {
  return Boolean(line && HORIZONTAL_RULE.test(line.content));
}

function headingLabel(content: string): string {
  return content.replace(/^\s{0,3}#{1,6}\s*/u, '').replace(/\s+#+\s*$/u, '').trim();
}

function findClosingFence(lines: readonly SourceLine[], index: number): number | null {
  const opening = lines[index].content.match(FENCE);
  if (!opening) return null;
  const token = opening[1];
  const character = token[0];
  const minimumLength = token.length;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const candidate = lines[cursor].content.trim();
    if (candidate.length >= minimumLength && candidate.split('').every((item) => item === character)) {
      return cursor;
    }
  }
  return null;
}

function isTableStart(lines: readonly SourceLine[], index: number): boolean {
  const header = lines[index];
  const delimiter = lines[index + 1];
  return Boolean(header && delimiter && header.content.includes('|') && TABLE_DELIMITER.test(delimiter.content));
}

function structuralKindAt(lines: readonly SourceLine[], index: number):
  | 'code'
  | 'heading'
  | 'table'
  | 'list-item'
  | 'blockquote'
  | null {
  const line = lines[index];
  if (!line || isBlank(line) || isHorizontalRule(line)) return null;
  if (FENCE.test(line.content) && findClosingFence(lines, index) !== null) return 'code';
  if (HEADING.test(line.content)) return 'heading';
  if (isTableStart(lines, index)) return 'table';
  if (LIST_ITEM.test(line.content)) return 'list-item';
  if (BLOCKQUOTE.test(line.content)) return 'blockquote';
  return null;
}

function pushRange(
  output: CompareSourceRange[],
  text: string,
  startOffset: number,
  endOffset: number,
  kind: CompareSourceRange['kind'],
  contextLabel?: string,
): void {
  const trimmed = trimSourceRange(text, startOffset, endOffset);
  if (!trimmed) return;
  output.push(...splitLongSourceRange(text, { ...trimmed, kind, contextLabel }));
}

export function segmentSummaryRanges(text: string): readonly CompareSourceRange[] {
  const lines = parseSourceLines(text);
  const output: CompareSourceRange[] = [];
  let contextLabel: string | undefined;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line) || isHorizontalRule(line)) {
      index += 1;
      continue;
    }

    const kind = structuralKindAt(lines, index);
    if (kind === 'code') {
      const closing = findClosingFence(lines, index);
      if (closing !== null) {
        pushRange(output, text, line.startOffset, lines[closing].contentEndOffset, 'code', contextLabel);
        index = closing + 1;
        continue;
      }
    }

    if (kind === 'heading') {
      const label = headingLabel(line.content);
      pushRange(output, text, line.startOffset, line.contentEndOffset, 'heading', label || contextLabel);
      if (label) contextLabel = label;
      index += 1;
      continue;
    }

    if (kind === 'table') {
      let endIndex = index + 1;
      while (
        endIndex + 1 < lines.length
        && !isBlank(lines[endIndex + 1])
        && lines[endIndex + 1].content.includes('|')
      ) endIndex += 1;
      pushRange(output, text, line.startOffset, lines[endIndex].contentEndOffset, 'table', contextLabel);
      index = endIndex + 1;
      continue;
    }

    if (kind === 'list-item') {
      let endIndex = index;
      while (endIndex + 1 < lines.length) {
        const next = lines[endIndex + 1];
        if (isBlank(next) || isHorizontalRule(next) || LIST_ITEM.test(next.content)) break;
        if (/^\s+/u.test(next.content)) endIndex += 1;
        else break;
      }
      pushRange(output, text, line.startOffset, lines[endIndex].contentEndOffset, 'list-item', contextLabel);
      index = endIndex + 1;
      continue;
    }

    if (kind === 'blockquote') {
      let endIndex = index;
      while (endIndex + 1 < lines.length && BLOCKQUOTE.test(lines[endIndex + 1].content)) endIndex += 1;
      pushRange(output, text, line.startOffset, lines[endIndex].contentEndOffset, 'blockquote', contextLabel);
      index = endIndex + 1;
      continue;
    }

    let endIndex = index;
    while (endIndex + 1 < lines.length) {
      const nextIndex = endIndex + 1;
      if (isBlank(lines[nextIndex]) || isHorizontalRule(lines[nextIndex])) break;
      if (structuralKindAt(lines, nextIndex) !== null) break;
      endIndex = nextIndex;
    }
    pushRange(output, text, line.startOffset, lines[endIndex].contentEndOffset, 'paragraph', contextLabel);
    index = endIndex + 1;
  }

  return output;
}

