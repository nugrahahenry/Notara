export type NormalizedChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export interface ChatHistoryLimits {
  maxEntries?: number;
  maxContentChars?: number;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function normalizeChatHistory(
  value: unknown,
  limits: ChatHistoryLimits = {},
): NormalizedChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value.flatMap((entry): NormalizedChatMessage[] => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const content = Reflect.get(entry, 'content');
    if (typeof content !== 'string') {
      return [];
    }

    return [{
      role: Reflect.get(entry, 'role') === 'user' ? 'user' : 'assistant',
      content,
    }];
  });

  const maxEntries = Number.isSafeInteger(limits.maxEntries) && (limits.maxEntries ?? 0) >= 0
    ? limits.maxEntries as number
    : normalized.length;
  const maxContentChars = Number.isSafeInteger(limits.maxContentChars) && (limits.maxContentChars ?? 0) >= 0
    ? limits.maxContentChars as number
    : Number.MAX_SAFE_INTEGER;

  return normalized
    .slice(-maxEntries)
    .map((entry) => ({ ...entry, content: entry.content.slice(0, maxContentChars) }));
}
