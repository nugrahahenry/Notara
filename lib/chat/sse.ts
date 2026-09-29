export class ChatStreamParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private complete = false;

  push(chunk: Uint8Array): string[] {
    if (this.complete) return [];
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.consume(false);
  }

  finish(): string[] {
    if (!this.complete) this.buffer += this.decoder.decode();
    return this.consume(true);
  }

  private consume(flush: boolean): string[] {
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = flush ? '' : (lines.pop() ?? '');
    const contents: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        this.complete = true;
        break;
      }
      try {
        const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
        const content = parsed.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content) contents.push(content);
      } catch {
        // A malformed provider event must not break the rest of the answer.
      }
    }
    return contents;
  }
}
