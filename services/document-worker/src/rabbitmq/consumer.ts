import type { Channel, ConsumeMessage } from 'amqplib';
import { pool } from '../db';
import { markDocumentStatus } from '../documents/repository';
import { DocumentNotFoundError, TenantMismatchError, UnrecoverableIngestionError } from '../ingestion/errors';
import { IngestionJobPayload, processIngestionMessage } from '../ingestion/process-message';
import { hasExhaustedRetries } from '../ingestion/retry-policy';
import { DLQ_ROUTING_KEY, DLX_EXCHANGE, INGESTION_QUEUE } from './topology';

function publishToDeadLetter(channel: Channel, msg: ConsumeMessage, reason: string): void {
  channel.publish(DLX_EXCHANGE, DLQ_ROUTING_KEY, msg.content, {
    ...msg.properties,
    headers: { ...msg.properties.headers, 'x-ingestion-failure-reason': reason },
  });
}

export async function startConsumer(channel: Channel): Promise<void> {
  await channel.consume(
    INGESTION_QUEUE,
    (msg) => {
      if (!msg) {
        return; // consumer cancelled server-side
      }
      handleMessage(channel, msg).catch((error) => {
        // Should be unreachable — handleMessage catches everything below.
        // Defensive fallback so a bug here never leaves a message
        // permanently unacked (which would stall the whole worker once
        // prefetch(10) fills up).
        // eslint-disable-next-line no-console
        console.error('Unhandled ingestion error, requeueing', error);
        channel.nack(msg, false, true);
      });
    },
    { noAck: false },
  );
}

async function handleMessage(channel: Channel, msg: ConsumeMessage): Promise<void> {
  let payload: IngestionJobPayload;
  try {
    payload = JSON.parse(msg.content.toString('utf-8'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Malformed ingestion message, routing to DLQ', error);
    publishToDeadLetter(channel, msg, 'malformed-message');
    channel.ack(msg);
    return;
  }

  try {
    await processIngestionMessage(payload);
    channel.ack(msg);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      // eslint-disable-next-line no-console
      console.info('Document deleted before processing, skipping', payload.documentId);
      channel.ack(msg);
      return;
    }

    if (error instanceof TenantMismatchError) {
      // eslint-disable-next-line no-console
      console.error('Tenant mismatch on ingestion message — possible bug or attack', payload, error);
      publishToDeadLetter(channel, msg, 'tenant-mismatch');
      channel.ack(msg);
      return;
    }

    if (error instanceof UnrecoverableIngestionError) {
      // eslint-disable-next-line no-console
      console.error('Unrecoverable ingestion error', payload.documentId, error);
      await markDocumentStatus(pool, payload.documentId, payload.organizationId, 'FAILED').catch(
        () => undefined,
      );
      publishToDeadLetter(channel, msg, 'unrecoverable');
      channel.ack(msg);
      return;
    }

    // eslint-disable-next-line no-console
    console.error('Transient ingestion error', payload.documentId, error);
    if (hasExhaustedRetries(msg)) {
      await markDocumentStatus(pool, payload.documentId, payload.organizationId, 'FAILED').catch(
        () => undefined,
      );
      publishToDeadLetter(channel, msg, 'retries-exhausted');
      channel.ack(msg);
    } else {
      channel.nack(msg, false, false); // -> retry exchange -> 30s TTL -> redelivered
    }
  }
}
