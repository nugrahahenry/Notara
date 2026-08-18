import {
  MAX_BLOCK_CODE_UNITS,
  TARGET_TRANSCRIPT_BLOCK_CODE_UNITS,
} from './types';
import type { CompareSourceRange } from './range-utils';
import { parseSourceLines, splitLongSourceRange, trimSourceRange } from './range-utils';

function paragraphRanges(text: string): readonly CompareSourceRange[] {
  const lines = parseSourceLines(text);
  const ranges: CompareSourceRange[] = [];
  let index = 0;
  while (index < lines.length) {
    while (index < lines.length && lines[index].content.trim().length === 0) index += 1;
    if (index >= lines.length) break;
    const start = index;
    let end = index;
    while (end + 1 < lines.length && lines[end + 1].content.trim().length > 0) end += 1;
    const trimmed = trimSourceRange(text, lines[start].startOffset, lines[end].contentEndOffset);
    if (trimmed) ranges.push({ ...trimmed, kind: 'transcript-passage' });
    index = end + 1;
  }
  return ranges;
}

function sentenceRanges(text: string, paragraph: CompareSourceRange): readonly CompareSourceRange[] {
  const ranges: CompareSourceRange[] = [];
  const content = text.slice(paragraph.startOffset, paragraph.endOffset);
  const boundary = /[.!?](?:["'”’\)\]\}]+)?(?=\s|$)/gu;
  let cursor = 0;
  for (const match of content.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[0].length;
    const trimmed = trimSourceRange(text, paragraph.startOffset + cursor, paragraph.startOffset + end);
    if (trimmed) ranges.push({ ...trimmed, kind: 'transcript-passage' });
    cursor = end;
  }
  const trailing = trimSourceRange(text, paragraph.startOffset + cursor, paragraph.endOffset);
  if (trailing) ranges.push({ ...trailing, kind: 'transcript-passage' });
  return ranges;
}

function splitTranscriptParagraph(text: string, paragraph: CompareSourceRange): readonly CompareSourceRange[] {
  if (paragraph.endOffset - paragraph.startOffset <= MAX_BLOCK_CODE_UNITS) return [paragraph];
  const sentences = sentenceRanges(text, paragraph);
  if (sentences.length <= 1) return splitLongSourceRange(text, paragraph);

  const output: CompareSourceRange[] = [];
  let active: CompareSourceRange | null = null;
  const flush = () => {
    if (active) output.push(active);
    active = null;
  };

  for (const sentence of sentences) {
    if (sentence.endOffset - sentence.startOffset > MAX_BLOCK_CODE_UNITS) {
      flush();
      output.push(...splitLongSourceRange(text, sentence));
      continue;
    }
    if (!active) {
      active = sentence;
      continue;
    }
    const mergedLength = sentence.endOffset - active.startOffset;
    const activeLength = active.endOffset - active.startOffset;
    if (mergedLength <= MAX_BLOCK_CODE_UNITS && activeLength < TARGET_TRANSCRIPT_BLOCK_CODE_UNITS) {
      active = { ...active, endOffset: sentence.endOffset };
    } else {
      flush();
      active = sentence;
    }
  }
  flush();

  if (output.length >= 2) {
    const last = output[output.length - 1];
    const previous = output[output.length - 2];
    const lastLength = last.endOffset - last.startOffset;
    const mergedLength = last.endOffset - previous.startOffset;
    if (lastLength < TARGET_TRANSCRIPT_BLOCK_CODE_UNITS / 2 && mergedLength <= MAX_BLOCK_CODE_UNITS) {
      output.splice(output.length - 2, 2, { ...previous, endOffset: last.endOffset });
    }
  }
  return output;
}

export function segmentTranscriptRanges(text: string): readonly CompareSourceRange[] {
  return paragraphRanges(text).flatMap((paragraph) => splitTranscriptParagraph(text, paragraph));
}

