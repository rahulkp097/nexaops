import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { pool } from '../db';
import { markDocumentStatus } from '../documents/repository';
import { DocumentNotFoundError, TenantMismatchError, UnrecoverableIngestionError } from '../ingestion/errors';
import { IngestionJobPayload, processIngestionMessage } from '../ingestion/process-message';
import { hasExhaustedRetries } from '../ingestion/retry-policy';
import { DLQ_ROUTING_KEY, DLX_EXCHANGE, INGESTION_QUEUE } from './topology';

// Phase 19 (spec §28: "Publisher confirms where appropriate"): this is the
// terminal step for a permanently-failed message — once the original is
// acked, the only remaining record of it is whatever reached the DLQ. A
// plain (non-confirm) publish only reports local buffer flow control, not
// broker receipt, so a publish that silently failed right before an ack
// would lose the message with no trace anywhere. Requires the channel
// passed to startConsumer to be a ConfirmChannel (see index.ts).
function publishToDeadLetter(channel: ConfirmChannel, msg: ConsumeMessage, reason: string): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.publish(
      DLX_EXCHANGE,
      DLQ_ROUTING_KEY,
      msg.content,
      { ...msg.properties, headers: { ...msg.properties.headers, 'x-ingestion-failure-reason': reason } },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

// Acks the original message only once the DLQ publish is broker-confirmed.
// If the confirm never arrives (or arrives negative), the message is left
// unacked rather than guessed-at — it stays in flight and gets redelivered
// once this consumer's connection drops, which is recoverable; a lost
// message is not.
async function deadLetterAndAck(channel: ConfirmChannel, msg: ConsumeMessage, reason: string): Promise<void> {
  try {
    await publishToDeadLetter(channel, msg, reason);
    channel.ack(msg);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('DLQ publish was not confirmed by the broker, leaving message unacked for redelivery', error);
  }
}

export async function startConsumer(channel: ConfirmChannel): Promise<void> {
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

async function handleMessage(channel: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
  let payload: IngestionJobPayload;
  try {
    payload = JSON.parse(msg.content.toString('utf-8'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Malformed ingestion message, routing to DLQ', error);
    await deadLetterAndAck(channel, msg, 'malformed-message');
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
      await deadLetterAndAck(channel, msg, 'tenant-mismatch');
      return;
    }

    if (error instanceof UnrecoverableIngestionError) {
      // eslint-disable-next-line no-console
      console.error('Unrecoverable ingestion error', payload.documentId, error);
      await markDocumentStatus(pool, payload.documentId, payload.organizationId, 'FAILED').catch(
        () => undefined,
      );
      await deadLetterAndAck(channel, msg, 'unrecoverable');
      return;
    }

    // eslint-disable-next-line no-console
    console.error('Transient ingestion error', payload.documentId, error);
    if (hasExhaustedRetries(msg)) {
      await markDocumentStatus(pool, payload.documentId, payload.organizationId, 'FAILED').catch(
        () => undefined,
      );
      await deadLetterAndAck(channel, msg, 'retries-exhausted');
    } else {
      channel.nack(msg, false, false); // -> retry exchange -> 30s TTL -> redelivered
    }
  }
}
