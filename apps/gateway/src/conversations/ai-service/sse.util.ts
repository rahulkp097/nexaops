export interface ParsedSseEvent {
  event: string;
  data: string;
}

// Parses one "event: X\ndata: Y\n\ndata: Z" style SSE block (the part
// before a blank-line separator). Returns null for a block with no
// event/data lines (e.g. a keep-alive comment).
export function parseSseBlock(block: string): ParsedSseEvent | null {
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

// Structural rather than the imported Web/Node `ReadableStream<Uint8Array>`
// type on purpose: those resolve to incompatible generic instantiations
// depending on which @types/node copy TS picks up in this workspace, even
// though they're identical at runtime — this only needs `getReader()`.
export interface ByteReadableStream {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
}

// Reads a fetch Response.body and yields one parsed event per
// "\n\n"-delimited block.
export async function* readSseStream(body: ByteReadableStream): AsyncGenerator<ParsedSseEvent> {
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
