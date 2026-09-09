jest.mock('../db', () => ({ pool: {} }));
jest.mock('../documents/repository', () => ({ markDocumentStatus: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../ingestion/process-message', () => ({ processIngestionMessage: jest.fn() }));
jest.mock('../ingestion/retry-policy', () => ({ hasExhaustedRetries: jest.fn() }));

import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { markDocumentStatus } from '../documents/repository';
import { DocumentNotFoundError, TenantMismatchError, UnrecoverableIngestionError } from '../ingestion/errors';
import { processIngestionMessage } from '../ingestion/process-message';
import { hasExhaustedRetries } from '../ingestion/retry-policy';
import { startConsumer } from './consumer';
import { DLQ_ROUTING_KEY, DLX_EXCHANGE, INGESTION_QUEUE } from './topology';

const mockProcess = processIngestionMessage as jest.Mock;
const mockHasExhausted = hasExhaustedRetries as jest.Mock;
const mockMarkStatus = markDocumentStatus as jest.Mock;

// Defaults to immediately confirming every publish (as if the broker
// acked it) — createMockChannel({ confirmError: new Error(...) }) instead
// simulates a DLQ publish the broker never confirmed.
function createMockChannel(options: { confirmError?: Error } = {}): jest.Mocked<ConfirmChannel> {
  return {
    consume: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    publish: jest.fn((_exchange, _routingKey, _content, _options, callback?: (err: Error | null) => void) => {
      callback?.(options.confirmError ?? null);
      return true;
    }),
  } as unknown as jest.Mocked<ConfirmChannel>;
}

function makeMessage(payload: unknown): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(payload)),
    properties: { headers: {} },
    fields: {},
  } as unknown as ConsumeMessage;
}

// Extracts the handler passed to channel.consume and awaits its (fire-and-forget) work.
async function deliver(channel: jest.Mocked<ConfirmChannel>, msg: ConsumeMessage): Promise<void> {
  await startConsumer(channel);
  const handler = (channel.consume as jest.Mock).mock.calls[0][1] as (m: ConsumeMessage | null) => void;
  handler(msg);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('startConsumer', () => {
  const payload = { documentId: 'doc-1', organizationId: 'org-1', jobId: 'job-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('consumes with manual ack on the ingestion queue', async () => {
    const channel = createMockChannel();
    await startConsumer(channel);

    expect(channel.consume).toHaveBeenCalledWith(INGESTION_QUEUE, expect.any(Function), { noAck: false });
  });

  it('acks on success', async () => {
    mockProcess.mockResolvedValue(undefined);
    const channel = createMockChannel();
    const msg = makeMessage(payload);

    await deliver(channel, msg);

    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('acks without a DLQ publish or status update when the document was already deleted', async () => {
    mockProcess.mockRejectedValue(new DocumentNotFoundError('doc-1'));
    const channel = createMockChannel();
    const msg = makeMessage(payload);

    await deliver(channel, msg);

    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(mockMarkStatus).not.toHaveBeenCalled();
  });

  it('routes a tenant mismatch straight to the DLQ and acks, without mutating status', async () => {
    mockProcess.mockRejectedValue(new TenantMismatchError('mismatch'));
    const channel = createMockChannel();
    const msg = makeMessage(payload);

    await deliver(channel, msg);

    expect(channel.publish).toHaveBeenCalledWith(
      DLX_EXCHANGE,
      DLQ_ROUTING_KEY,
      msg.content,
      expect.objectContaining({ headers: expect.objectContaining({ 'x-ingestion-failure-reason': 'tenant-mismatch' }) }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(mockMarkStatus).not.toHaveBeenCalled();
  });

  it('marks FAILED and routes to the DLQ for an unrecoverable error', async () => {
    mockProcess.mockRejectedValue(new UnrecoverableIngestionError('corrupt'));
    const channel = createMockChannel();
    const msg = makeMessage(payload);

    await deliver(channel, msg);

    expect(mockMarkStatus).toHaveBeenCalledWith({}, 'doc-1', 'org-1', 'FAILED');
    expect(channel.publish).toHaveBeenCalledWith(
      DLX_EXCHANGE,
      DLQ_ROUTING_KEY,
      msg.content,
      expect.objectContaining({ headers: expect.objectContaining({ 'x-ingestion-failure-reason': 'unrecoverable' }) }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('nacks (no requeue) a transient error when retries are not yet exhausted', async () => {
    mockProcess.mockRejectedValue(new Error('db hiccup'));
    mockHasExhausted.mockReturnValue(false);
    const channel = createMockChannel();
    const msg = makeMessage(payload);

    await deliver(channel, msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(mockMarkStatus).not.toHaveBeenCalled();
  });

  it('marks FAILED and routes to the DLQ once a transient error has exhausted retries', async () => {
    mockProcess.mockRejectedValue(new Error('db hiccup'));
    mockHasExhausted.mockReturnValue(true);
    const channel = createMockChannel();
    const msg = makeMessage(payload);

    await deliver(channel, msg);

    expect(mockMarkStatus).toHaveBeenCalledWith({}, 'doc-1', 'org-1', 'FAILED');
    expect(channel.publish).toHaveBeenCalledWith(
      DLX_EXCHANGE,
      DLQ_ROUTING_KEY,
      msg.content,
      expect.objectContaining({ headers: expect.objectContaining({ 'x-ingestion-failure-reason': 'retries-exhausted' }) }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('routes malformed JSON straight to the DLQ without calling processIngestionMessage', async () => {
    const channel = createMockChannel();
    const msg = {
      content: Buffer.from('not json'),
      properties: { headers: {} },
      fields: {},
    } as unknown as ConsumeMessage;

    await deliver(channel, msg);

    expect(mockProcess).not.toHaveBeenCalled();
    expect(channel.publish).toHaveBeenCalledWith(
      DLX_EXCHANGE,
      DLQ_ROUTING_KEY,
      msg.content,
      expect.objectContaining({ headers: expect.objectContaining({ 'x-ingestion-failure-reason': 'malformed-message' }) }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('leaves the message unacked when the broker never confirms the DLQ publish (malformed message)', async () => {
    const channel = createMockChannel({ confirmError: new Error('channel closed') });
    const msg = {
      content: Buffer.from('not json'),
      properties: { headers: {} },
      fields: {},
    } as unknown as ConsumeMessage;

    await deliver(channel, msg);

    expect(channel.publish).toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('leaves the message unacked when the broker never confirms the DLQ publish (retries exhausted)', async () => {
    mockProcess.mockRejectedValue(new Error('db hiccup'));
    mockHasExhausted.mockReturnValue(true);
    const channel = createMockChannel({ confirmError: new Error('channel closed') });
    const msg = makeMessage(payload);

    await deliver(channel, msg);

    expect(mockMarkStatus).toHaveBeenCalledWith({}, 'doc-1', 'org-1', 'FAILED');
    expect(channel.publish).toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
