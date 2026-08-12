export type NormalizedChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function normalizeChatHistory(value: unknown): NormalizedChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): NormalizedChatMessage[] => {
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
}
