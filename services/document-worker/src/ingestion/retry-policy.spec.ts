import type { ConsumeMessage } from 'amqplib';
import { INGESTION_QUEUE } from '../rabbitmq/topology';
import { getPriorFailureCount, hasExhaustedRetries, MAX_DELIVERY_ATTEMPTS } from './retry-policy';

function makeMessage(headers: Record<string, unknown> = {}): ConsumeMessage {
  return {
    properties: { headers },
  } as unknown as ConsumeMessage;
}

describe('getPriorFailureCount', () => {
  it('returns 0 when there is no x-death header', () => {
    expect(getPriorFailureCount(makeMessage())).toBe(0);
  });

  it('returns 0 when x-death has no entry for this queue/reason', () => {
    const msg = makeMessage({
      'x-death': [{ queue: 'some-other-queue', reason: 'rejected', count: 3 }],
    });
    expect(getPriorFailureCount(msg)).toBe(0);
  });

  it('returns 0 when the matching queue entry has a different reason', () => {
    const msg = makeMessage({
      'x-death': [{ queue: INGESTION_QUEUE, reason: 'expired', count: 3 }],
    });
    expect(getPriorFailureCount(msg)).toBe(0);
  });

  it('returns the count from the matching (queue, reason) entry', () => {
    const msg = makeMessage({
      'x-death': [
        { queue: 'unrelated', reason: 'rejected', count: 99 },
        { queue: INGESTION_QUEUE, reason: 'rejected', count: 2 },
      ],
    });
    expect(getPriorFailureCount(msg)).toBe(2);
  });
});

describe('hasExhaustedRetries', () => {
  it('is false below the attempt boundary', () => {
    const msg = makeMessage({
      'x-death': [{ queue: INGESTION_QUEUE, reason: 'rejected', count: MAX_DELIVERY_ATTEMPTS - 2 }],
    });
    expect(hasExhaustedRetries(msg)).toBe(false);
  });

  it('is true exactly at the boundary (count + 1 === MAX_DELIVERY_ATTEMPTS)', () => {
    const msg = makeMessage({
      'x-death': [{ queue: INGESTION_QUEUE, reason: 'rejected', count: MAX_DELIVERY_ATTEMPTS - 1 }],
    });
    expect(hasExhaustedRetries(msg)).toBe(true);
  });

  it('is true beyond the boundary', () => {
    const msg = makeMessage({
      'x-death': [{ queue: INGESTION_QUEUE, reason: 'rejected', count: MAX_DELIVERY_ATTEMPTS + 5 }],
    });
    expect(hasExhaustedRetries(msg)).toBe(true);
  });
});
