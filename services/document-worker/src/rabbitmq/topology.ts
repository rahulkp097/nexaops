import type { Channel } from 'amqplib';

/**
 * Classic TTL+DLX retry pattern (no RabbitMQ plugins required). See
 * docs/architecture/rabbitmq-topology.md for the full flow and the
 * idempotency-key convention Phase 4's consumer implements against.
 *
 * main queue reject (no requeue) -> DLX to retry exchange
 * retry queue TTL expiry -> DLX back to main exchange -> redelivered
 */
export const INGESTION_EXCHANGE = 'nexaops.ingestion';
export const INGESTION_QUEUE = 'nexaops.ingestion.documents';
export const INGESTION_ROUTING_KEY = 'document.ingest';

export const RETRY_EXCHANGE = 'nexaops.ingestion.retry';
export const RETRY_QUEUE = 'nexaops.ingestion.documents.retry';
export const RETRY_ROUTING_KEY = 'document.ingest.retry';
export const RETRY_TTL_MS = 30_000;

export const DLX_EXCHANGE = 'nexaops.ingestion.dlx';
export const DLQ_QUEUE = 'nexaops.ingestion.documents.dlq';
export const DLQ_ROUTING_KEY = 'document.ingest.dlq';

export const PREFETCH_COUNT = 10;

/**
 * Idempotently declares the ingestion topology. Safe to call on every
 * startup — assert* calls are no-ops if the topology already matches.
 */
export async function setupTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(INGESTION_EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });

  await channel.assertQueue(INGESTION_QUEUE, {
    durable: true,
    deadLetterExchange: RETRY_EXCHANGE,
    deadLetterRoutingKey: RETRY_ROUTING_KEY,
  });
  await channel.bindQueue(INGESTION_QUEUE, INGESTION_EXCHANGE, INGESTION_ROUTING_KEY);

  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    messageTtl: RETRY_TTL_MS,
    deadLetterExchange: INGESTION_EXCHANGE,
    deadLetterRoutingKey: INGESTION_ROUTING_KEY,
  });
  await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, RETRY_ROUTING_KEY);

  await channel.assertQueue(DLQ_QUEUE, { durable: true });
  await channel.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, DLQ_ROUTING_KEY);

  await channel.prefetch(PREFETCH_COUNT);
}
