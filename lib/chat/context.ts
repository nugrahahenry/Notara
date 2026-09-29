import type { Folder, Summary } from '../types';

export interface GlobalChatContextOptions {
  folders: Folder[];
  summaries: Summary[];
  question: string;
  maxSummaries?: number;
  maxTranscriptCharsPerSummary?: number;
  maxTotalTranscriptChars?: number;
}

const STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'dari', 'untuk', 'dengan', 'pada', 'dalam', 'ini', 'itu',
  'apa', 'bagaimana', 'mengapa', 'kenapa', 'saya', 'aku', 'kamu', 'materi', 'tolong',
  'bisa', 'lebih', 'jelaskan', 'jelaskanlah', 'tentang', 'mana', 'bagian', 'yang',
  'the', 'and', 'for', 'with', 'this', 'that', 'what', 'how', 'why',
]);

function tokenize(value: string): string[] {
  return Array.from(new Set(
    value
      .toLocaleLowerCase('id-ID')
      .normalize('NFKC')
      .split(/[^\p{L}\p{N}]+/gu)
      .filter((token) => token.length > 2 && !STOPWORDS.has(token)),
  ));
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const boundary = value.lastIndexOf(' ', maxChars - 1);
  return `${value.slice(0, boundary > maxChars * 0.7 ? boundary : maxChars).trim()}…`;
}

function folderNameFor(summary: Summary, folders: Folder[]): string {
  return summary.folder_id
    ? folders.find((folder) => folder.id === summary.folder_id)?.name ?? 'Mata Kuliah'
    : 'Belum Dikategorikan';
}

export function buildGlobalChatContext({
  folders,
  summaries,
  question,
  maxSummaries = 3,
  maxTranscriptCharsPerSummary = 12_000,
  maxTotalTranscriptChars = 24_000,
}: GlobalChatContextOptions): string {
  const queryTokens = tokenize(question);
  const directoryMap = folders.map((folder) => {
    const folderFiles = summaries
      .filter((summary) => summary.folder_id === folder.id)
      .map((summary) => `  * Rangkuman: ${summary.title}`)
      .join('\n');
    return `- Folder: ${folder.icon} ${folder.name}${folderFiles ? `\n${folderFiles}` : ''}`;
  }).join('\n');

  const uncategorized = summaries
    .filter((summary) => !summary.folder_id)
    .map((summary) => `  * Rangkuman: ${summary.title}`)
    .join('\n');
  const directory = `${directoryMap}${directoryMap ? '\n' : ''}- Belum Dikategorikan:${uncategorized ? `\n${uncategorized}` : ''}`;

  const ranked = summaries
    .map((summary) => {
      const title = summary.title.toLocaleLowerCase('id-ID');
      const folder = folderNameFor(summary, folders).toLocaleLowerCase('id-ID');
      const transcript = summary.transcript.toLocaleLowerCase('id-ID');
      const titleMatches = queryTokens.filter((token) => title.includes(token)).length;
      const folderMatches = queryTokens.filter((token) => folder.includes(token)).length;
      const transcriptMatches = queryTokens.filter((token) => transcript.includes(token)).length;
      return {
        summary,
        score: titleMatches * 8 + folderMatches * 6 + Math.min(transcriptMatches, 4),
        hasDirectMatch: titleMatches > 0 || folderMatches > 0,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const dateOrder = Date.parse(right.summary.created_at) - Date.parse(left.summary.created_at);
      if (dateOrder !== 0) return dateOrder;
      return left.summary.id.localeCompare(right.summary.id);
    })
    .slice(0, Math.max(0, maxSummaries));

  let remainingChars = Math.max(0, maxTotalTranscriptChars);
  const transcripts = ranked.flatMap(({ summary, hasDirectMatch }) => {
    if (remainingChars <= 0) return [];
    const perSummaryLimit = hasDirectMatch
      ? maxTranscriptCharsPerSummary
      : Math.min(maxTranscriptCharsPerSummary, 6_000);
    const excerpt = truncate(summary.transcript, Math.min(perSummaryLimit, remainingChars));
    remainingChars -= excerpt.length;
    return `[Dokumen: ${summary.title} di Folder: ${folderNameFor(summary, folders)}]\n${excerpt}`;
  });

  return `Daftar Struktur Berkas Mahasiswa (Henry):\n${directory}\n\nTranskrip Berkas yang Relevan dengan Pertanyaan:\n${transcripts.join('\n\n---\n\n') || 'Tidak ada berkas yang relevan ditemukan untuk kata kunci tersebut.'}`;
}
