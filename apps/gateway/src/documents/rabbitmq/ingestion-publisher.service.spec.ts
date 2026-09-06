import { ConfigService } from '@nestjs/config';
import { IngestionPublisher, INGESTION_EXCHANGE, INGESTION_ROUTING_KEY } from './ingestion-publisher.service';

const mockConnect = jest.fn();

jest.mock('amqplib', () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
}));

describe('IngestionPublisher', () => {
  let publisher: IngestionPublisher;
  const config = { get: jest.fn().mockReturnValue('amqp://test') } as unknown as ConfigService;

  function makeChannel() {
    return {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(),
      once: jest.fn(),
    };
  }

  beforeEach(() => {
    mockConnect.mockReset();
    publisher = new IngestionPublisher(config);
  });

  it('publishes to the ingestion exchange with a persistent, JSON message carrying messageId', async () => {
    const channel = makeChannel();
    mockConnect.mockResolvedValue({ createChannel: jest.fn().mockResolvedValue(channel), close: jest.fn() });

    await publisher.publishIngestionJob({ documentId: 'doc-1', organizationId: 'org-1' });

    expect(channel.assertExchange).toHaveBeenCalledWith(INGESTION_EXCHANGE, 'direct', { durable: true });
    expect(channel.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey, buffer, options] = channel.publish.mock.calls[0];
    expect(exchange).toBe(INGESTION_EXCHANGE);
    expect(routingKey).toBe(INGESTION_ROUTING_KEY);
    expect(options).toMatchObject({ persistent: true, contentType: 'application/json' });
    expect(options.messageId).toEqual(expect.any(String));

    const payload = JSON.parse(buffer.toString());
    expect(payload).toEqual({ documentId: 'doc-1', organizationId: 'org-1', jobId: options.messageId });
  });

  it('reuses the same channel (asserts the exchange only once) across multiple publishes', async () => {
    const channel = makeChannel();
    mockConnect.mockResolvedValue({ createChannel: jest.fn().mockResolvedValue(channel), close: jest.fn() });

    await publisher.publishIngestionJob({ documentId: 'doc-1', organizationId: 'org-1' });
    await publisher.publishIngestionJob({ documentId: 'doc-2', organizationId: 'org-1' });

    expect(channel.assertExchange).toHaveBeenCalledTimes(1);
    expect(channel.publish).toHaveBeenCalledTimes(2);
  });

  it('mints a distinct jobId (messageId) per publish call', async () => {
    const channel = makeChannel();
    mockConnect.mockResolvedValue({ createChannel: jest.fn().mockResolvedValue(channel), close: jest.fn() });

    await publisher.publishIngestionJob({ documentId: 'doc-1', organizationId: 'org-1' });
    await publisher.publishIngestionJob({ documentId: 'doc-1', organizationId: 'org-1' });

    const firstJobId = channel.publish.mock.calls[0][3].messageId;
    const secondJobId = channel.publish.mock.calls[1][3].messageId;
    expect(firstJobId).not.toEqual(secondJobId);
  });

  it('reconnects and re-asserts the exchange after a connection failure', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      publisher.publishIngestionJob({ documentId: 'doc-1', organizationId: 'org-1' }),
    ).rejects.toThrow('connection refused');

    const channel = makeChannel();
    mockConnect.mockResolvedValueOnce({ createChannel: jest.fn().mockResolvedValue(channel), close: jest.fn() });

    await publisher.publishIngestionJob({ documentId: 'doc-1', organizationId: 'org-1' });

    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(channel.publish).toHaveBeenCalledTimes(1);
  });
});
