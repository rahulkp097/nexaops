import { ByteReadableStream, parseSseBlock, readSseStream } from './sse.util';

function makeStream(chunks: string[]): ByteReadableStream {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (index >= chunks.length) {
          return { done: true, value: undefined };
        }
        const value = encoder.encode(chunks[index]);
        index += 1;
        return { done: false, value };
      },
      releaseLock: () => undefined,
    }),
  };
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe('parseSseBlock', () => {
  it('parses a single-line event and data', () => {
    expect(parseSseBlock('event: token\ndata: {"text":"hi"}')).toEqual({
      event: 'token',
      data: '{"text":"hi"}',
    });
  });

  it('joins multiple data: lines with a newline', () => {
    expect(parseSseBlock('event: token\ndata: line1\ndata: line2')).toEqual({
      event: 'token',
      data: 'line1\nline2',
    });
  });

  it('returns null when there is no event or no data line', () => {
    expect(parseSseBlock(': keep-alive comment')).toBeNull();
    expect(parseSseBlock('event: token')).toBeNull();
    expect(parseSseBlock('data: {}')).toBeNull();
  });
});

describe('readSseStream', () => {
  it('parses events delivered in a single chunk', async () => {
    const stream = makeStream(['event: source\ndata: {"a":1}\n\nevent: done\ndata: {"b":2}\n\n']);

    expect(await collect(readSseStream(stream))).toEqual([
      { event: 'source', data: '{"a":1}' },
      { event: 'done', data: '{"b":2}' },
    ]);
  });

  it('reassembles an event split across multiple chunks', async () => {
    const stream = makeStream(['event: to', 'ken\ndata: {"tex', 't":"hi"}\n\n']);

    expect(await collect(readSseStream(stream))).toEqual([{ event: 'token', data: '{"text":"hi"}' }]);
  });

  it('emits a trailing block with no terminating blank line', async () => {
    const stream = makeStream(['event: done\ndata: {"ok":true}']);

    expect(await collect(readSseStream(stream))).toEqual([{ event: 'done', data: '{"ok":true}' }]);
  });
});
