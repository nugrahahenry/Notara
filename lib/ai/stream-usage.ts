import {
  parseGroqCompletionUsage,
  parseGroqProviderRequestId,
  type ParsedGroqCompletionUsage,
} from './usage';

type UnknownRecord = Record<string, unknown>;

export type GroqChatStreamObservation = {
  providerRequestId: string | null;
  usage: ParsedGroqCompletionUsage | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null
    ? value as UnknownRecord
    : null;
}

function parseStreamUsage(value: unknown): ParsedGroqCompletionUsage | null {
  const directUsage = parseGroqCompletionUsage(value);
  if (directUsage) return directUsage;

  const groqMetadata = asRecord(asRecord(value)?.x_groq);
  return groqMetadata?.usage
    ? parseGroqCompletionUsage({ usage: groqMetadata.usage })
    : null;
}

export function observeGroqChatStream(
  source: ReadableStream<Uint8Array>,
  onComplete: (observation: GroqChatStreamObservation) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let textBuffer = '';
  let providerRequestId: string | null = null;
  let usage: ParsedGroqCompletionUsage | null = null;
  let completed = false;

  const consumeLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith('data:')) return;

    const payload = line.slice(5).trimStart();
    if (!payload || payload === '[DONE]') return;

    try {
      const parsed = JSON.parse(payload) as unknown;
      providerRequestId = parseGroqProviderRequestId(parsed) ?? providerRequestId;
      usage = parseStreamUsage(parsed) ?? usage;
    } catch {
      // Provider bytes must keep flowing even if optional metering metadata is malformed.
    }
  };

  const consumeDecodedText = (text: string, flush = false) => {
    textBuffer += text;
    let newlineIndex = textBuffer.indexOf('\n');

    while (newlineIndex !== -1) {
      consumeLine(textBuffer.slice(0, newlineIndex));
      textBuffer = textBuffer.slice(newlineIndex + 1);
      newlineIndex = textBuffer.indexOf('\n');
    }

    if (flush && textBuffer) {
      consumeLine(textBuffer);
      textBuffer = '';
    }
  };

  const finalize = async () => {
    if (completed) return;
    completed = true;
    try {
      await onComplete({ providerRequestId, usage });
    } catch {
      // The caller owns diagnostics; telemetry must never break a chat stream.
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (completed) return;

      try {
        const { done, value } = await reader.read();
        if (!done) {
          consumeDecodedText(decoder.decode(value, { stream: true }));
          controller.enqueue(value);
          return;
        }

        consumeDecodedText(decoder.decode(), true);
        await finalize();
        controller.close();
      } catch (error) {
        await finalize();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await finalize();
      }
    },
  });
}
