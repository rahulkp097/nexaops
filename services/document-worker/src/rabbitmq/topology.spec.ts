import type { Channel } from 'amqplib';
import {
  DLQ_QUEUE,
  DLQ_ROUTING_KEY,
  DLX_EXCHANGE,
  INGESTION_EXCHANGE,
  INGESTION_QUEUE,
  INGESTION_ROUTING_KEY,
  PREFETCH_COUNT,
  RETRY_EXCHANGE,
  RETRY_QUEUE,
  RETRY_ROUTING_KEY,
  RETRY_TTL_MS,
  setupTopology,
} from './topology';

function createMockChannel(): jest.Mocked<Channel> {
  return {
    assertExchange: jest.fn().mockResolvedValue({ exchange: '' }),
    assertQueue: jest.fn().mockResolvedValue({ queue: '', messageCount: 0, consumerCount: 0 }),
    bindQueue: jest.fn().mockResolvedValue({}),
    prefetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Channel>;
}

describe('setupTopology', () => {
  it('declares the main, retry, and dead-letter exchanges as durable direct exchanges', async () => {
    const channel = createMockChannel();

    await setupTopology(channel);

    expect(channel.assertExchange).toHaveBeenCalledWith(INGESTION_EXCHANGE, 'direct', { durable: true });
    expect(channel.assertExchange).toHaveBeenCalledWith(RETRY_EXCHANGE, 'direct', { durable: true });
    expect(channel.assertExchange).toHaveBeenCalledWith(DLX_EXCHANGE, 'direct', { durable: true });
  });

  it('wires the main queue to dead-letter into the retry exchange', async () => {
    const channel = createMockChannel();

    await setupTopology(channel);

    expect(channel.assertQueue).toHaveBeenCalledWith(INGESTION_QUEUE, {
      durable: true,
      deadLetterExchange: RETRY_EXCHANGE,
      deadLetterRoutingKey: RETRY_ROUTING_KEY,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      INGESTION_QUEUE,
      INGESTION_EXCHANGE,
      INGESTION_ROUTING_KEY,
    );
  });

  it('wires the retry queue with a TTL that dead-letters back to the main exchange', async () => {
    const channel = createMockChannel();

    await setupTopology(channel);

    expect(channel.assertQueue).toHaveBeenCalledWith(RETRY_QUEUE, {
      durable: true,
      messageTtl: RETRY_TTL_MS,
      deadLetterExchange: INGESTION_EXCHANGE,
      deadLetterRoutingKey: INGESTION_ROUTING_KEY,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(RETRY_QUEUE, RETRY_EXCHANGE, RETRY_ROUTING_KEY);
  });

  it('wires the terminal DLQ', async () => {
    const channel = createMockChannel();

    await setupTopology(channel);

    expect(channel.assertQueue).toHaveBeenCalledWith(DLQ_QUEUE, { durable: true });
    expect(channel.bindQueue).toHaveBeenCalledWith(DLQ_QUEUE, DLX_EXCHANGE, DLQ_ROUTING_KEY);
  });

  it('sets the configured prefetch count', async () => {
    const channel = createMockChannel();

    await setupTopology(channel);

    expect(channel.prefetch).toHaveBeenCalledWith(PREFETCH_COUNT);
  });
});
