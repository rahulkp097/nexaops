import { firstValueFrom } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { ChatStreamRegistry } from './chat-stream.registry';

describe('ChatStreamRegistry', () => {
  let registry: ChatStreamRegistry;

  beforeEach(() => {
    registry = new ChatStreamRegistry();
  });

  it('start returns a subject the first time and null while one is already active', () => {
    const first = registry.start('conv-1');
    expect(first).not.toBeNull();

    const second = registry.start('conv-1');
    expect(second).toBeNull();
  });

  it('get returns null for a conversation with no active session', () => {
    expect(registry.get('unknown')).toBeNull();
  });

  it('emit delivers events to subscribers in order', async () => {
    const subject = registry.start('conv-1')!;
    const collected = firstValueFrom(registry.get('conv-1')!.pipe(toArray()));

    registry.emit(subject, 'message_start', { conversationId: 'conv-1', messageId: 'msg-1' });
    registry.emit(subject, 'token', { text: 'Hello' });
    registry.complete('conv-1', subject);

    expect(await collected).toEqual([
      { type: 'message_start', data: { conversationId: 'conv-1', messageId: 'msg-1' } },
      { type: 'token', data: { text: 'Hello' } },
    ]);
  });

  it('a late subscriber still gets the full replay after completion', async () => {
    const subject = registry.start('conv-1')!;
    registry.emit(subject, 'token', { text: 'Hello' });
    registry.complete('conv-1', subject);

    const collected = await firstValueFrom(registry.get('conv-1')!.pipe(toArray()));

    expect(collected).toEqual([{ type: 'token', data: { text: 'Hello' } }]);
  });

  it('complete() keeps the session (and the 409 lock) until the retention window elapses', () => {
    jest.useFakeTimers();
    try {
      const subject = registry.start('conv-1')!;
      registry.complete('conv-1', subject);

      expect(registry.start('conv-1')).toBeNull();

      jest.advanceTimersByTime(5 * 60 * 1000);

      expect(registry.start('conv-1')).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('abort() frees the conversation for an immediate retry with no retention window', () => {
    const subject = registry.start('conv-1')!;
    registry.abort('conv-1', subject);

    expect(registry.get('conv-1')).toBeNull();
    expect(registry.start('conv-1')).not.toBeNull();
  });
});
