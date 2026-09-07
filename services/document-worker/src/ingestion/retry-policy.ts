import type { ConsumeMessage } from 'amqplib';
import { INGESTION_QUEUE } from '../rabbitmq/topology';

export const MAX_DELIVERY_ATTEMPTS = Number(process.env.INGESTION_MAX_ATTEMPTS ?? '5');

// RabbitMQ merges repeat (queue, reason) dead-letter events into one
// x-death array entry with an incrementing count, rather than appending
// duplicates — reading it gives a stable "how many times has this exact
// message already failed" counter, no hand-rolled retry-count header needed.
export function getPriorFailureCount(msg: ConsumeMessage): number {
  const xDeath = msg.properties.headers?.['x-death'];
  const entry = xDeath?.find((d) => d.queue === INGESTION_QUEUE && d.reason === 'rejected');
  return entry?.count ?? 0;
}

// True once this delivery, if it also fails, would be the Nth failure —
// retries are exhausted; route straight to the terminal DLQ instead of
// another nack-to-retry cycle.
export function hasExhaustedRetries(msg: ConsumeMessage): boolean {
  return getPriorFailureCount(msg) + 1 >= MAX_DELIVERY_ATTEMPTS;
}
