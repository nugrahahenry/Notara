import type { ChatMessage } from '../types';

export function isTutorError(message: Pick<ChatMessage, 'role' | 'content'>): boolean {
  return message.role === 'assistant' && message.content.trimStart().startsWith('❌');
}

export function getTutorPresentation(messages: ChatMessage[], isSending: boolean) {
  const lastMessage = messages.at(-1);
  if (isSending) {
    return lastMessage?.role === 'assistant' && lastMessage.content.trim() && !isTutorError(lastMessage)
      ? { state: 'responding', label: 'Jawaban sedang masuk' } as const
      : { state: 'thinking', label: 'Menunggu jawaban' } as const;
  }
  if (lastMessage && isTutorError(lastMessage)) {
    return { state: 'error', label: 'Jawaban belum tersedia' } as const;
  }
  return lastMessage?.role === 'assistant' && lastMessage.content.trim()
    ? { state: 'active', label: 'Jawaban tersedia' } as const
    : { state: 'ready', label: 'Siap menjawab' } as const;
}

// Recovery belongs to this answer, never to a question sent later in the thread.
export function getTutorRecoveryQuestion(messages: ChatMessage[], answerIndex: number): string | null {
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= messages.length) return null;
  if (!isTutorError(messages[answerIndex])) return null;
  for (let index = answerIndex - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].content.trim() || null;
  }
  return null;
}

export function canSubmitTutor(input: string, isSending: boolean): boolean {
  return !isSending && Boolean(input.trim());
}

export function isTutorSubmitKey(key: string, shiftKey: boolean, isComposing: boolean, keyCode: number): boolean {
  return key === 'Enter' && !shiftKey && !isComposing && keyCode !== 229;
}
