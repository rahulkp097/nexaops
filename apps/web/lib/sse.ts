// Mirrors apps/gateway/src/conversations/ai-service/sse.util.ts. Duplicated
// rather than shared: it's a small runtime parser, not a type, and
// @nexaops/shared-types is types-only by design (see docs/api/contract.md).
// The browser fetch Response.body ReadableStream this reads from behaves
// identically to gateway's own fetch(...).body.

export interface ParsedSseEvent {
  event: string;
  data: string;
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  const eventLines: string[] = [];
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      eventLines.push(line.slice('event:'.length).trim());
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  if (eventLines.length === 0 || dataLines.length === 0) {
    return null;
  }
  return { event: eventLines[eventLines.length - 1], data: dataLines.join('\n') };
}

export async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ParsedSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseBlock(block);
        if (parsed) {
          yield parsed;
        }
        separatorIndex = buffer.indexOf('\n\n');
      }
    }
    const trailing = parseSseBlock(buffer);
    if (trailing) {
      yield trailing;
    }
  } finally {
    reader.releaseLock();
  }
}
